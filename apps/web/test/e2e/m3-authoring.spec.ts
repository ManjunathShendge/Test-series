import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { zipSync } from 'fflate';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockFirebase, signIn, users } from './firebase';

// M3 acceptance (ROADMAP, TESTING "Critical fixtures"): an examiner applies with ten samples
// and KYC files, operations approves, and the examiner imports a 100-question bilingual
// workbook with passages, images and math without hand edits; an invalid workbook points to
// exact rows and cells. Real API, PostgreSQL, MinIO and ClamAV; only Firebase is stood in.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPp8AAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
const EXAM = 'SSC CGL Tier 1';
const COLUMNS = [
  'row_id', 'section', 'position', 'group_id', 'stem_en', 'stem_hi',
  'option_a_en', 'option_b_en', 'option_c_en', 'option_d_en',
  'option_a_hi', 'option_b_hi', 'option_c_hi', 'option_d_hi',
  'correct_option', 'solution_en', 'solution_hi', 'subject_code', 'topic_code',
  'difficulty', 'source', 'pyq_year', 'pyq_shift', 'image_refs',
] as const;
type Row = Partial<Record<(typeof COLUMNS)[number], string | number>>;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Group = { group_id: string; passage_en: string; passage_hi?: string; image_refs?: string };

async function workbook(rows: Row[], groups: Group[] = []) {
  const book = new ExcelJS.Workbook();
  const questions = book.addWorksheet('Questions');
  questions.addRow([...COLUMNS]);
  for (const row of rows) questions.addRow(COLUMNS.map((column) => row[column] ?? null));
  if (groups.length) {
    const sheet = book.addWorksheet('Groups');
    sheet.addRow(['group_id', 'passage_en', 'passage_hi', 'image_refs']);
    for (const group of groups) sheet.addRow([group.group_id, group.passage_en, group.passage_hi ?? null, group.image_refs ?? null]);
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}

function importCard(page: Page): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Import workbook', exact: true }) });
}

async function uploadImport(page: Page, name: string, bytes: Uint8Array) {
  await importCard(page)
    .getByLabel('Workbook/archive')
    .setInputFiles({ name, mimeType: 'application/zip', buffer: Buffer.from(bytes) });
}

test('examiner applies, operations approves, and a 100-question workbook imports', async ({ browser }) => {
  test.setTimeout(300_000);
  const examinerContext = await browser.newContext();
  const examinerUnexpected = await mockFirebase(examinerContext, users.examiner);
  const page = await examinerContext.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await test.step('examiner signs in and confirms 18+ without student onboarding', async () => {
    await signIn(page, users.examiner, '/examiner/apply');
    await expect(page.getByRole('heading', { name: 'Confirm your age' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Examiners must be 18 or older. Confirm to continue.')).toBeVisible();
    await page.getByLabel('I am 18 or older').check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Apply to become an examiner' })).toBeVisible();
  });

  await test.step('application with KYC uploads, ten samples across every subject, and agreement', async () => {
    const form = page.locator('form');
    await form.getByLabel('Short bio').fill('Maths and reasoning teacher who has written SSC practice questions for eight years.');
    await form.getByLabel('Experience (years)').fill('8');
    await form.getByLabel('Exam', { exact: true }).selectOption({ label: EXAM });

    await form.getByLabel('Profile photo').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(form.getByText('Profile photo · uploaded, malware scan passed')).toBeVisible({ timeout: 60_000 });
    await form.getByLabel('PAN document').setInputFiles({ name: 'pan.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(form.getByText('PAN document · uploaded, malware scan passed')).toBeVisible({ timeout: 60_000 });

    const samples = form.locator('details');
    await expect(samples).toHaveCount(10);
    const subjects = (await samples.first().getByLabel('Subject').locator('option').allTextContents()).filter(
      (name) => name !== 'Select subject',
    );
    expect(subjects.length).toBeGreaterThan(1);
    for (let index = 0; index < 10; index += 1) {
      const sample = samples.nth(index);
      if (index > 0) await sample.locator('summary').click();
      await sample.getByLabel('Subject').selectOption({ label: subjects[index % subjects.length]! });
      await sample.getByLabel('Question (English)').fill(`Sample ${index + 1}: what is \\(${index + 2}^2\\)?`);
      for (const [option, value] of [['A', (index + 2) ** 2], ['B', index + 2], ['C', (index + 2) ** 2 + 1], ['D', (index + 2) ** 3]] as const) {
        await sample.getByLabel(`Option ${option}`, { exact: true }).fill(String(value));
      }
      await sample.getByLabel('Solution (English)').fill(`Square ${index + 2}: \\(${index + 2} \\times ${index + 2}\\).`);
    }
    await samples
      .first()
      .getByLabel(/Question images/)
      .setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: PNG });
    await expect(samples.first().getByText('1 uploaded, malware scan passed')).toBeVisible({ timeout: 60_000 });

    await form.getByLabel(/I have read and accept version/).check();
    await form.getByRole('button', { name: 'Submit application', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Application pending' })).toBeVisible();
    await page.goto('/examiner');
    await expect(page.getByText('Your application is awaiting human review.')).toBeVisible();
  });

  await test.step('operations reviews names, downloads KYC securely, and approves', async () => {
    const adminContext = await browser.newContext();
    const adminUnexpected = await mockFirebase(adminContext, users.admin);
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => pageErrors.push(error.message));
    await signIn(admin, users.admin, '/admin/examiners');
    const row = admin.getByRole('row').filter({ hasText: users.examiner.email });
    await expect(row).toContainText('pending');
    await expect(row).toContainText('10 / 10');

    await admin.getByText('Review 10 sample questions and attachments').click();
    const details = admin.locator('details').filter({ hasText: 'KYC documents' });
    await expect(details.getByText(`Exams: ${EXAM}`, { exact: false })).toBeVisible();
    expect(await details.locator('p').first().textContent()).not.toMatch(UUID);
    await expect(details.locator('article').first()).toContainText(`${EXAM} · `);
    await details.getByRole('button', { name: 'Request secure download' }).first().click();
    await expect(details.getByRole('link', { name: 'Download scanned document' })).toBeVisible();

    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Approve examiner application?' });
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(row).toContainText('approved');
    await expect(row.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    expect(adminUnexpected).toEqual([]);
    await adminContext.close();
  });

  let sections: { name: string; size: number; subjectCode: string }[] = [];
  let codes: { subjectCode: string; topicCode: string }[] = [];
  await test.step('examiner downloads the import template with sections and codes', async () => {
    await page.goto('/examiner');
    await expect(page.getByRole('heading', { name: 'Question authoring', exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await importCard(page).getByRole('button', { name: 'Download template', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^ssc-cgl-tier-1-.*-import\.xlsx$/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await readFile(await file.path())) as unknown as ExcelJS.Buffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Questions', 'Groups', 'Sections', 'Codes', 'Instructions']);
    book.getWorksheet('Sections')!.eachRow((row, number) => {
      if (number === 1) return;
      const [name, positions, , subjectCode] = (row.values as string[]).slice(1);
      sections.push({ name: name!, size: Number(positions!.split('-')[1]), subjectCode: subjectCode ?? '' });
    });
    book.getWorksheet('Codes')!.eachRow((row, number) => {
      if (number === 1) return;
      const [, subjectCode, , topicCode] = (row.values as string[]).slice(1);
      codes.push({ subjectCode: subjectCode!, topicCode: topicCode! });
    });
    expect(sections.reduce((total, section) => total + section.size, 0)).toBe(100);
    for (const section of sections) expect(codes.some((code) => code.subjectCode === section.subjectCode)).toBe(true);
  });

  await test.step('an invalid workbook is rejected with exact rows and cells', async () => {
    const first = sections[0]!;
    const topic = codes.find((code) => code.subjectCode === first.subjectCode)!.topicCode;
    const valid = (position: number): Row => ({
      row_id: `bad-${position}`, section: first.name, position,
      stem_en: `Invalid fixture ${position}?`, option_a_en: '1', option_b_en: '2', option_c_en: '3', option_d_en: '4',
      correct_option: 'A', solution_en: 'One.', subject_code: first.subjectCode, topic_code: topic, difficulty: 'easy',
    });
    const rows = [
      { ...valid(1), correct_option: 'E' },
      { ...valid(2), stem_en: '' },
      { ...valid(3), stem_hi: 'केवल हिन्दी प्रश्न' },
      { ...valid(4), section: 'Not a section' },
      { ...valid(5), topic_code: 'not-a-code' },
    ];
    await uploadImport(page, 'invalid.zip', zipSync({ 'questions.xlsx': await workbook(rows) }));
    const card = importCard(page);
    await expect(card).toContainText('Status: rejected', { timeout: 60_000 });
    const errors = card.locator('ol li');
    await expect(errors.filter({ hasText: 'Questions row 2 · correct_option: correct_option must be A, B, C or D.' })).toHaveCount(1);
    await expect(errors.filter({ hasText: 'Questions row 3 · stem_en: stem_en is required.' })).toHaveCount(1);
    await expect(errors.filter({ hasText: 'Questions row 4 · option_a_hi: This row has partial Hindi.' })).toHaveCount(1);
    await expect(errors.filter({ hasText: 'Questions row 5 · section:' })).toHaveCount(1);
    await expect(errors.filter({ hasText: 'Questions row 6 · topic_code: topic_code must be a UUID.' })).toHaveCount(1);
    await expect(card.getByRole('button', { name: 'Commit all accepted questions' })).toBeDisabled();
  });

  await test.step('a 100-question bilingual workbook with passages, images and math imports without edits', async () => {
    const rows: Row[] = [];
    const last = sections[sections.length - 1]!;
    for (const section of sections) {
      const topics = codes.filter((code) => code.subjectCode === section.subjectCode);
      for (let position = 1; position <= section.size; position += 1) {
        const n = rows.length + 1;
        const hindi = n % 4 === 0;
        const grouped = section === last && position <= 6;
        rows.push({
          row_id: `q-${n}`,
          section: section.name,
          position,
          ...(grouped ? { group_id: position <= 3 ? 'passage-1' : 'passage-2' } : {}),
          stem_en:
            n === 7
              ? `Which year had the higher sales?\n| Year | Sales |\n| --- | --- |\n| 2023 | ${n} |\n| 2024 | ${n + 5} |`
              : `Question ${n}: evaluate \\(x^2 + ${n}\\) at \\(x = 2\\).`,
          option_a_en: String(4 + n), option_b_en: String(3 + n), option_c_en: String(5 + n), option_d_en: String(1000 + n),
          ...(hindi
            ? {
                stem_hi: `प्रश्न ${n}: \\(x = 2\\) पर \\(x^2 + ${n}\\) का मान ज्ञात कीजिए।`,
                option_a_hi: String(4 + n), option_b_hi: String(3 + n), option_c_hi: String(5 + n), option_d_hi: String(1000 + n),
                solution_hi: `\\(4 + ${n} = ${4 + n}\\)।`,
              }
            : {}),
          correct_option: 'A',
          solution_en: `\\[ 2^2 + ${n} = ${4 + n} \\]`,
          subject_code: section.subjectCode,
          topic_code: topics[n % topics.length]!.topicCode,
          difficulty: ['easy', 'medium', 'hard'][n % 3]!,
          ...(n % 10 === 5 ? { source: 'pyq', pyq_year: 2023, pyq_shift: 'Shift 2' } : {}),
          ...(n % 25 === 3 ? { image_refs: `images/q-${n}.png` } : {}),
        });
      }
    }
    expect(rows).toHaveLength(100);
    const images: Record<string, Uint8Array> = { 'images/passage.png': PNG };
    for (const row of rows) if (row.image_refs) images[String(row.image_refs)] = PNG;
    const xlsx = await workbook(rows, [
      { group_id: 'passage-1', passage_en: 'Read the passage about savings and answer.', passage_hi: 'बचत के बारे में अनुच्छेद पढ़िए।', image_refs: 'images/passage.png' },
      { group_id: 'passage-2', passage_en: 'Read the second passage about \\(r^2\\) growth.', passage_hi: 'दूसरा अनुच्छेद पढ़िए।' },
    ]);
    await uploadImport(page, 'ssc-cgl-100.zip', zipSync({ 'questions.xlsx': xlsx, ...images }));
    const card = importCard(page);
    await expect(card).toContainText('Status: accepted · Questions: 100 · Errors: 0', { timeout: 120_000 });
    await card.getByRole('button', { name: 'Commit all accepted questions' }).click();
    await expect(card.getByRole('status')).toHaveText(
      'Imported 100 draft questions. They are in your bank below and still need QC approval.',
      { timeout: 60_000 },
    );
    const bank = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your question bank' }) });
    await expect(bank).toContainText('· 100 questions');
    await expect(bank.getByText('in a passage group').first()).toBeVisible();
  });

  await test.step('editor offers only assigned subjects, renders math and Hindi, and saves a draft', async () => {
    const editor = page.locator('#question-editor');
    const assigned = new Set(codes.map((code) => code.subjectCode));
    const offered = await editor.getByLabel('Subject', { exact: true }).locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(offered.length).toBe(assigned.size);
    for (const value of offered) expect(assigned.has(value)).toBe(true);

    await editor.getByLabel('Question (English)').fill('Find \\(\\frac{1}{2} + \\frac{1}{4}\\).');
    await editor.getByLabel('Question (Hindi, optional)').fill('\\(\\frac{1}{2} + \\frac{1}{4}\\) ज्ञात कीजिए।');
    for (const [option, en] of [['A', '3/4'], ['B', '1/2'], ['C', '1'], ['D', '1/4']] as const) {
      await editor.getByLabel(`Option ${option} (English)`).fill(en);
      await editor.getByLabel(`Option ${option} (Hindi, optional)`).fill(en);
    }
    await editor.getByLabel('Solution (English)').fill('\\(\\frac{2}{4} + \\frac{1}{4} = \\frac{3}{4}\\)');
    await editor.getByLabel('Solution (Hindi, optional)').fill('\\(\\frac{3}{4}\\) उत्तर है।');
    const preview = editor.locator('section').filter({ has: page.getByRole('heading', { name: 'Student preview' }) });
    await expect(preview.locator('.katex').first()).toBeVisible();
    await preview.getByRole('button', { name: 'हिन्दी' }).click();
    await expect(preview).toContainText('ज्ञात कीजिए');
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved as draft version 1.' })).toBeVisible();
  });

  expect(examinerUnexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
  await examinerContext.close();
});
