import ExcelJS from 'exceljs';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { AuthoringService } from '../../src/modules/authoring/application/authoring.service.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPp8AAAAASUVORK5CYII=',
  'base64',
);
const examId = '20b5e3a8-88a7-4e8d-a5aa-b68b38a54162';
const subjectId = '3ab08e17-6597-4f66-87d1-f0162bb35ad0';
const topicId = 'b620c983-c9c3-485e-a924-387e3e3aef05';

async function workbookArchive(
  groupImageRefs: string,
  questionImageRefs = '',
  questionCount = 1,
  { optionHindi = true, passageHi = 'एक छोटा अनुच्छेद।', solutionEn = 'The first option.' } = {},
) {
  const workbook = new ExcelJS.Workbook();
  const questions = workbook.addWorksheet('Questions');
  questions.addRow([
    'row_id',
    'section',
    'position',
    'group_id',
    'stem_en',
    'stem_hi',
    'option_a_en',
    'option_b_en',
    'option_c_en',
    'option_d_en',
    'option_a_hi',
    'option_b_hi',
    'option_c_hi',
    'option_d_hi',
    'correct_option',
    'solution_en',
    'solution_hi',
    'subject_code',
    'topic_code',
    'difficulty',
    'image_refs',
  ]);
  for (let index = 0; index < questionCount; index += 1) {
    questions.addRow([
      `q-${index + 1}`,
      'Reading',
      index + 1,
      'passage-1',
      `Which answer is correct? \\(x^2 + ${index}\\)`,
      'सही उत्तर कौन सा है?',
      'One',
      'Two',
      'Three',
      'Four',
      ...(optionHindi ? ['एक', 'दो', 'तीन', 'चार'] : ['', '', '', '']),
      'A',
      solutionEn,
      'पहला विकल्प।',
      subjectId,
      topicId,
      'medium',
      questionImageRefs,
    ]);
  }
  const groups = workbook.addWorksheet('Groups');
  groups.addRow(['group_id', 'passage_en', 'passage_hi', 'image_refs']);
  groups.addRow(['passage-1', 'A short passage.', passageHi, groupImageRefs]);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  return zipSync({
    'Questions.xlsx': new Uint8Array(xlsx),
    'images/diagram.png': new Uint8Array(png),
  });
}

async function parseImportArchive(archive: Uint8Array) {
  const service = Object.create(AuthoringService.prototype) as AuthoringService;
  return service['parseImportArchive'](Buffer.from(archive), examId);
}

describe('authoring import parser', () => {
  it('parses bilingual grouped questions and safe ZIP image references', async () => {
    const parsed = await parseImportArchive(await workbookArchive('images/diagram.png'));
    const question = parsed.rows[0]!.data as {
      groupId: string;
      passageEn: string;
      passageHi: string;
      passageImageRefs: string[];
      stemHi: string;
    };

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]!.errors).toEqual([]);
    expect(question).toMatchObject({
      groupId: 'passage-1',
      passageEn: 'A short passage.',
      passageHi: 'एक छोटा अनुच्छेद।',
      passageImageRefs: ['images/diagram.png'],
      stemHi: 'सही उत्तर कौन सा है?',
    });
    expect(parsed.images.get('images/diagram.png')).toMatchObject({
      mimeType: 'image/png',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('reports missing and unsafe image paths against the source sheet rows', async () => {
    const parsed = await parseImportArchive(
      await workbookArchive('../unsafe.png;images/missing.png'),
    );

    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors.map(({ row, sheet, cell }) => ({ row, sheet, cell }))).toEqual([
      { row: 2, sheet: 'Groups', cell: 'image_refs' },
      { row: 2, sheet: 'Groups', cell: 'image_refs' },
    ]);
    expect(parsed.images.size).toBe(0);
  });

  it('accepts a 100-question bilingual archive with grouped passages and shared images', async () => {
    const parsed = await parseImportArchive(
      await workbookArchive('images/diagram.png', 'images/diagram.png', 100),
    );

    expect(parsed.questions).toHaveLength(100);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(parsed.images.size).toBe(1);
    expect(parsed.groups.size).toBe(1);
  });

  it('points partial Hindi to each empty Hindi cell', async () => {
    const parsed = await parseImportArchive(
      await workbookArchive('', '', 1, { optionHindi: false }),
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.rows[0]!.errors.map(({ cell, code }) => ({ cell, code }))).toEqual([
      { cell: 'option_a_hi', code: 'REQUIRED' },
      { cell: 'option_b_hi', code: 'REQUIRED' },
      { cell: 'option_c_hi', code: 'REQUIRED' },
      { cell: 'option_d_hi', code: 'REQUIRED' },
    ]);
  });

  it('requires a Hindi passage for a Hindi question in a group', async () => {
    const parsed = await parseImportArchive(await workbookArchive('', '', 1, { passageHi: '' }));

    expect(parsed.rows[0]!.errors.map(({ cell }) => cell)).toEqual(['group_id']);
  });

  it('reports unreadable math against the exact cell', async () => {
    const parsed = await parseImportArchive(
      await workbookArchive('', '', 1, { solutionEn: String.raw`Use \(\frac{1}{\)` }),
    );

    expect(parsed.rows[0]!.errors.map(({ cell, code }) => ({ cell, code }))).toEqual([
      { cell: 'solution_en', code: 'INVALID_CONTENT' },
    ]);
  });
});
