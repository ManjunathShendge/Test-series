import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import ExcelJS from 'exceljs';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { AppModule } from '../../dist/app.module.js';
import { AuthoringService } from '../../dist/modules/authoring/application/authoring.service.js';
import { fixture } from '../../../../packages/db/test/integration/fixture.mjs';

const PROJECT = 'demo-exam-prep';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = {
  keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }],
};

async function api(t) {
  const db = await fixture(t);
  const saved = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_TEST_JWKS: JSON.stringify(jwks),
    DATABASE_URL: db.appUrl,
  });
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`;
  t.after(async () => {
    await app.close();
    process.env = saved;
  });
  const call = async (method, path, { as, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (as?.jwt) {
      headers.authorization = `Bearer ${as.jwt}`;
      if (as.device) headers['x-device-id'] = as.device;
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const user = async ({ admin = false, ageConfirmed = true } = {}) => {
    const uid = `uid-${randomUUID()}`;
    const jwt = await new SignJWT({
      email: `${uid}@example.test`,
      email_verified: true,
      name: 'Authoring Test',
      auth_time: Math.floor(Date.now() / 1000) - 10,
      firebase: { sign_in_provider: 'password' },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const session = await call('POST', '/identity/session', {
      as: { jwt },
      body: { deviceName: 'Test browser', platform: 'web', ...(ageConfirmed ? { ageConfirmed } : {}) },
    });
    assert.equal(session.status, 200);
    const user = { jwt, device: session.body.device.id, id: session.body.profile.id };
    if (admin)
      await db.owner.query(
        "UPDATE profiles SET roles=array_append(roles,'admin'::user_role_type),is_ops_admin=true WHERE id=$1",
        [user.id],
      );
    return user;
  };
  const catalog = async () => {
    const category = (
      await db.owner.query('INSERT INTO exam_categories (name,slug) VALUES ($1,$2) RETURNING id', [
        `Category ${randomUUID()}`,
        `c-${randomUUID()}`,
      ])
    ).rows[0].id;
    const exam = (
      await db.owner.query(
        'INSERT INTO exams (category_id,name,slug) VALUES ($1,$2,$3) RETURNING id',
        [category, `Exam ${randomUUID()}`, `e-${randomUUID()}`],
      )
    ).rows[0].id;
    const stage = (
      await db.owner.query(
        "INSERT INTO exam_stages (exam_id,name,slug) VALUES ($1,'Tier 1','tier-1') RETURNING id",
        [exam],
      )
    ).rows[0].id;
    const template = (
      await db.owner.query(
        `INSERT INTO exam_templates
       (exam_id,stage_id,name,total_questions,total_duration_seconds,default_positive_marks,default_negative_marks)
       VALUES ($1,$2,'Published template',10,3600,1,0.25) RETURNING id`,
        [exam, stage],
      )
    ).rows[0].id;
    const subject = (
      await db.owner.query(
        "INSERT INTO subjects (exam_id,name) VALUES ($1,'Mathematics') RETURNING id",
        [exam],
      )
    ).rows[0].id;
    const topic = (
      await db.owner.query(
        "INSERT INTO topics (subject_id,name) VALUES ($1,'Algebra') RETURNING id",
        [subject],
      )
    ).rows[0].id;
    await db.owner.query(
      `INSERT INTO exam_template_sections (template_id,subject_id,name,section_order,question_count,positive_marks,negative_marks)
       VALUES ($1,$2,'Mathematics',1,10,1,0.25)`,
      [template, subject],
    );
    await db.owner.query('UPDATE exam_templates SET published_at=now() WHERE id=$1', [template]);
    await db.owner.query('UPDATE exams SET is_active=true WHERE id=$1', [exam]);
    return { exam, stage, template, subject, topic };
  };
  return { app, db, base, call, user, catalog };
}

function applicationBody(catalog, overrides = {}) {
  return {
    accountType: 'individual',
    bio: 'A subject expert with experience writing clear questions.',
    examIds: [catalog.exam],
    subjectIds: [catalog.subject],
    agreementVersion: 'm3-local-test-v1',
    samples: Array.from({ length: 10 }, (_, index) => ({
      position: index + 1,
      examId: catalog.exam,
      subjectId: catalog.subject,
      topicId: catalog.topic,
      stemEn: `Question ${index + 1}?`,
      options: [
        { id: 'A', textEn: 'One' },
        { id: 'B', textEn: 'Two' },
        { id: 'C', textEn: 'Three' },
        { id: 'D', textEn: 'Four' },
      ],
      correctOption: 'A',
      solutionEn: 'Because it is correct.',
      difficulty: 'medium',
    })),
    ...overrides,
  };
}

test('examiner application, approval and question revisions enforce authorization and stale edits', async (t) => {
  const { app, db, call, user, catalog } = await api(t);
  const taxonomy = await catalog();
  const applicant = await user();
  const admin = await user({ admin: true });

  assert.deepEqual(
    [
      (await call('GET', '/examiner/options', { as: { jwt: applicant.jwt } })).status,
      (
        await call('GET', '/examiner/application', {
          as: { jwt: applicant.jwt, device: applicant.device },
        })
      ).status,
    ],
    [401, 200],
    'authoring endpoints require a registered device',
  );
  const options = await call('GET', '/examiner/options', { as: applicant });
  assert.equal(options.status, 200);
  assert.equal(options.body.agreementVersion, 'm3-local-test-v1');
  assert.ok(options.body.exams.some((exam) => exam.id === taxonomy.exam));

  const badTaxonomy = applicationBody(taxonomy, {
    samples: applicationBody(taxonomy).samples.map((sample, index) =>
      index ? sample : { ...sample, topicId: randomUUID() },
    ),
  });
  const invalid = await call('POST', '/examiner/applications', {
    as: applicant,
    body: badTaxonomy,
  });
  assert.deepEqual([invalid.status, invalid.body.error.code], [422, 'VALIDATION_FAILED']);

  const submitted = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy),
  });
  assert.deepEqual(
    [submitted.status, submitted.body.status, submitted.body.samples.length],
    [201, 'pending', 10],
  );
  const duplicate = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy, { bio: 'Attempt to replace pending application.' }),
  });
  assert.deepEqual(
    [duplicate.status, duplicate.body.error.code],
    [409, 'APPLICATION_ALREADY_EXISTS'],
  );
  const own = await call('GET', '/examiner/application', { as: applicant });
  assert.deepEqual(
    [own.body.application.id, own.body.application.status],
    [submitted.body.id, 'pending'],
  );

  const listed = await call('GET', '/admin/examiner-applications', { as: admin });
  assert.ok(listed.body.items.some((item) => item.samples[0].stemEn === 'Question 1?'));
  let downloadArguments;
  app.get(AuthoringService).storage.presignedDownload = async (...args) => {
    downloadArguments = args;
    return { url: 'https://storage.example.test/signed-document', expiresAt: new Date() };
  };
  const kycAssetId = randomUUID();
  await db.owner.query(
    `INSERT INTO assets
       (id,owner_id,bucket,object_key,original_name,mime_type,size_bytes,sha256,scan_status,
        classification,access_scope,uploaded_at)
     VALUES ($1,$2,'examiner-kyc',$3,'proof.pdf','application/pdf',4,$4,'clean',
        'examiner_kyc','staff',now())`,
    [kycAssetId, applicant.id, `${applicant.id}/${kycAssetId}/verified/test-hash`, 'c'.repeat(64)],
  );
  await db.owner.query('UPDATE examiner_applications SET photo_asset_id=$1 WHERE id=$2', [
    kycAssetId,
    submitted.body.id,
  ]);
  const kycRoute = `/admin/examiner-applications/${submitted.body.id}/kyc/${kycAssetId}/download-url`;
  assert.equal((await call('GET', kycRoute, { as: applicant })).status, 403);
  const kycDownload = await call('GET', kycRoute, { as: admin });
  assert.equal(kycDownload.status, 200);
  assert.equal(kycDownload.body.url, 'https://storage.example.test/signed-document');
  assert.equal(downloadArguments[2], 'proof.pdf');
  assert.equal(
    (
      await db.owner.query(
        `SELECT count(*)::int AS count FROM admin_audit_logs
         WHERE action_name='examiner_kyc.download_url' AND target_record_id=$1`,
        [kycAssetId],
      )
    ).rows[0].count,
    1,
  );
  await db.owner.query("UPDATE assets SET scan_status='pending' WHERE id=$1", [kycAssetId]);
  const pendingKyc = await call('GET', kycRoute, { as: admin });
  assert.deepEqual([pendingKyc.status, pendingKyc.body.error.code], [409, 'INVALID_ASSET']);
  const decisions = await Promise.all([
    call('PATCH', `/admin/examiner-applications/${submitted.body.id}`, {
      as: admin,
      body: { status: 'approved' },
    }),
    call('PATCH', `/admin/examiner-applications/${submitted.body.id}`, {
      as: admin,
      body: { status: 'approved' },
    }),
  ]);
  assert.deepEqual(
    decisions.map((result) => result.status).sort(),
    [200, 404],
    'only one concurrent decision may win',
  );

  const questionBody = {
    examId: taxonomy.exam,
    subjectId: taxonomy.subject,
    topicId: taxonomy.topic,
    stemEn: 'What is 2 + 2?',
    options: [
      { id: 'A', textEn: '3' },
      { id: 'B', textEn: '4' },
      { id: 'C', textEn: '5' },
      { id: 'D', textEn: '6' },
    ],
    correctOption: 'B',
    solutionEn: '2 + 2 equals 4.',
  };
  const created = await call('POST', '/examiner/questions', { as: applicant, body: questionBody });
  assert.deepEqual([created.status, created.body.versionNumber], [201, 1]);
  const updated = await call('PATCH', `/examiner/questions/${created.body.id}`, {
    as: applicant,
    body: { ...questionBody, stemEn: 'What is 3 + 1?', expectedRevision: 1 },
  });
  assert.deepEqual([updated.status, updated.body.versionNumber], [200, 2]);
  const stale = await call('PATCH', `/examiner/questions/${created.body.id}`, {
    as: applicant,
    body: { ...questionBody, expectedRevision: 1 },
  });
  assert.deepEqual([stale.status, stale.body.error.code], [409, 'STALE_EDIT']);
  const unversioned = await call('PATCH', `/examiner/questions/${created.body.id}`, {
    as: applicant,
    body: questionBody,
  });
  assert.equal(unversioned.status, 400, 'an edit must name the version it was based on');
  const foreignAssetId = randomUUID();
  await db.owner.query(
    `INSERT INTO assets
       (id,owner_id,bucket,object_key,original_name,mime_type,size_bytes,sha256,scan_status,
        classification,access_scope,uploaded_at)
     VALUES ($1,$2,'question-assets',$3,'other.png','image/png',68,$4,'clean',
        'question_asset','examiner',now())`,
    [foreignAssetId, admin.id, `${admin.id}/${foreignAssetId}/verified/x.png`, 'f'.repeat(64)],
  );
  const foreignImage = await call('PATCH', `/examiner/questions/${updated.body.id}`, {
    as: applicant,
    body: { ...questionBody, imageAssetIds: [foreignAssetId], expectedRevision: 2 },
  });
  assert.deepEqual(
    [foreignImage.status, foreignImage.body.error.code],
    [422, 'VALIDATION_FAILED'],
    "an edit cannot attach another account's image",
  );
  const foreignPassage = (
    await db.owner.query(
      "INSERT INTO question_passages (exam_id,content_en) VALUES ($1,'Unowned passage') RETURNING id",
      [taxonomy.exam],
    )
  ).rows[0].id;
  const passageTheft = await call('POST', '/examiner/questions', {
    as: applicant,
    body: { ...questionBody, passageId: foreignPassage },
  });
  assert.deepEqual([passageTheft.status, passageTheft.body.error.code], [422, 'VALIDATION_FAILED']);
  const partialHindi = await call('POST', '/examiner/questions', {
    as: applicant,
    body: { ...questionBody, stemHi: '2 + 2 क्या है?' },
  });
  assert.deepEqual(
    partialHindi.body.error.details.issues.map((issue) => issue.path).slice(0, 2),
    ['options.0.textHi', 'options.1.textHi'],
  );
  const unsafeMath = await call('POST', '/examiner/questions', {
    as: applicant,
    body: { ...questionBody, stemEn: String.raw`Click \(\href{javascript:alert(1)}{here}\)` },
  });
  assert.deepEqual(
    [unsafeMath.status, unsafeMath.body.error.details.issues[0].path],
    [422, 'stemEn'],
    'math links are rejected on save',
  );
  const notPyq = await call('POST', '/examiner/questions', {
    as: applicant,
    body: { ...questionBody, stemEn: 'Not a PYQ?', isPyq: false, pyqYear: 2020, pyqShift: 'S1' },
  });
  assert.deepEqual(
    [notPyq.status, notPyq.body.pyqYear, notPyq.body.pyqShift, notPyq.body.questionType],
    [201, null, null, 'single_mcq'],
    'PYQ details are dropped when the question is not a PYQ',
  );
  const latest = await call('GET', '/examiner/questions', { as: applicant });
  assert.deepEqual(
    latest.body.items.map((item) => [item.stemEn, item.versionNumber]),
    [
      ['Not a PYQ?', 1],
      ['What is 3 + 1?', 2],
    ],
    'only the latest version of each question is listed',
  );

  const importId = randomUUID();
  const idempotencyKey = randomUUID();
  const manifestHash = 'a'.repeat(64);
  const fileHash = 'b'.repeat(64);
  const imageAssetId = randomUUID();
  await db.owner.query(
    `INSERT INTO assets
       (id,owner_id,bucket,object_key,original_name,mime_type,size_bytes,sha256,scan_status,
        classification,access_scope,uploaded_at)
     VALUES ($1,$2,'question-assets',$3,'diagram.png','image/png',68,$4,'clean',
        'question_asset','examiner',now())`,
    [
      imageAssetId,
      applicant.id,
      `${applicant.id}/${imageAssetId}/verified/test.png`,
      'e'.repeat(64),
    ],
  );
  await db.owner.query(
    `INSERT INTO import_runs
     (id,owner_id,exam_id,stage_id,template_id,file_hash,manifest_hash,idempotency_key,status,parsed_count,error_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'accepted',1,0)`,
    [
      importId,
      applicant.id,
      taxonomy.exam,
      taxonomy.stage,
      taxonomy.template,
      fileHash,
      manifestHash,
      idempotencyKey,
    ],
  );
  const importedQuestion = {
    examId: taxonomy.exam,
    subjectId: taxonomy.subject,
    topicId: taxonomy.topic,
    stemEn: 'Imported question?',
    stemHi: null,
    options: questionBody.options,
    correctOption: 'B',
    solutionEn: 'Imported solution.',
    solutionHi: null,
    difficulty: 'easy',
    isPyq: false,
    pyqYear: null,
    pyqShift: null,
    groupId: 'passage-1',
    passageEn: 'A short imported passage.',
    passageHi: 'एक छोटा आयातित अनुच्छेद।',
    passageImageAssetIds: [imageAssetId],
    imageAssetIds: [imageAssetId],
    normStemEn: 'imported question?',
    normStemHi: null,
    textHash: 'c'.repeat(64),
    maskedHash: 'd'.repeat(64),
  };
  await db.owner.query(
    `INSERT INTO import_rows (import_id,row_number,data,errors) VALUES ($1,2,$2,'[]'::jsonb)`,
    [importId, JSON.stringify(importedQuestion)],
  );
  const commitBody = { manifestHash, idempotencyKey };
  const committed = await call('POST', `/examiner/imports/${importId}/commit`, {
    as: applicant,
    body: commitBody,
  });
  const repeated = await call('POST', `/examiner/imports/${importId}/commit`, {
    as: applicant,
    body: commitBody,
  });
  assert.deepEqual(
    [committed.status, repeated.status, repeated.body.questionIds[0]],
    [201, 201, committed.body.questionIds[0]],
  );
  assert.equal(
    (
      await db.owner.query('SELECT count(*)::int AS count FROM questions WHERE stem_en=$1', [
        'Imported question?',
      ])
    ).rows[0].count,
    1,
  );
  const imported = (
    await db.owner.query('SELECT passage_id,image_urls FROM questions WHERE stem_en=$1', [
      'Imported question?',
    ])
  ).rows[0];
  assert.ok(imported.passage_id);
  assert.deepEqual(imported.image_urls, [imageAssetId]);
  const passage = (
    await db.owner.query('SELECT content_en,content_hi,images FROM question_passages WHERE id=$1', [
      imported.passage_id,
    ])
  ).rows[0];
  assert.equal(passage.content_en, 'A short imported passage.');
  assert.equal(passage.content_hi, 'एक छोटा आयातित अनुच्छेद।');
  assert.deepEqual(passage.images, [imageAssetId]);

  // Own question bank: filters, LIKE-safe search, approved status, passage and paging.
  await db.owner.query(
    "UPDATE questions SET stem_en='Discount of 50% off?' WHERE stem_en='Not a PYQ?'",
  );
  const bank = (query) =>
    call('GET', `/examiner/questions?${new URLSearchParams(query)}`, { as: applicant });
  const all = await bank({});
  assert.deepEqual(
    [all.status, all.body.total, all.body.page, all.body.pageSize],
    [200, 3, 1, 25],
  );
  const grouped = all.body.items.find((item) => item.stemEn === 'Imported question?');
  assert.deepEqual(grouped.passage, {
    id: imported.passage_id,
    contentEn: 'A short imported passage.',
    contentHi: 'एक छोटा आयातित अनुच्छेद।',
    imageAssetIds: [imageAssetId],
  });
  assert.deepEqual(
    (await bank({ q: '50%' })).body.items.map((item) => item.stemEn),
    ['Discount of 50% off?'],
    'search treats % as text',
  );
  assert.equal((await bank({ q: '%' })).body.total, 1, 'a bare % is not a wildcard');
  assert.equal((await bank({ difficulty: 'easy' })).body.total, 1);
  assert.equal((await bank({ examId: randomUUID() })).body.total, 0);
  await db.owner.query(
    "UPDATE questions SET is_approved_in_corpus=true WHERE stem_en='Imported question?'",
  );
  const approved = await bank({ status: 'approved' });
  assert.deepEqual(
    [approved.body.total, approved.body.items[0].isApproved],
    [1, true],
    'approved questions are part of the bank',
  );
  assert.equal((await bank({ status: 'draft' })).body.total, 2);
  const beyond = await bank({ page: '2' });
  assert.deepEqual([beyond.body.items.length, beyond.body.total], [0, 3]);
  assert.equal((await bank({ page: '0' })).status, 400);
  assert.equal((await bank({ sort: 'x' })).status, 400, 'unknown query keys are rejected');

  // Image links: owner only, clean images only.
  app.get(AuthoringService).storage.presignedView = async (_bucket, _key, mimeType) => ({
    url: `https://storage.example.test/view?type=${encodeURIComponent(mimeType)}`,
    expiresAt: new Date(),
  });
  const view = await call('GET', `/assets/${imageAssetId}/view-url`, { as: applicant });
  assert.deepEqual(
    [view.status, view.body.url],
    [200, 'https://storage.example.test/view?type=image%2Fpng'],
  );
  assert.equal(
    (await call('GET', `/assets/${imageAssetId}/view-url`, { as: admin })).status,
    404,
    "another account cannot view an examiner's image",
  );
  assert.equal(
    (await call('GET', `/assets/${kycAssetId}/view-url`, { as: applicant })).status,
    404,
    'KYC documents are never served through the image link',
  );
});

test('rejected applications can be revised but approvals cannot be resubmitted', async (t) => {
  const { call, user, catalog } = await api(t);
  const taxonomy = await catalog();
  const applicant = await user();
  const admin = await user({ admin: true });
  const submitted = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy),
  });
  assert.equal(submitted.status, 201);
  const rejected = await call('PATCH', `/admin/examiner-applications/${submitted.body.id}`, {
    as: admin,
    body: { status: 'rejected', rejectionReason: 'Please improve the sample explanations.' },
  });
  assert.equal(rejected.status, 200);
  const revised = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy, { bio: 'I revised my profile after the review feedback.' }),
  });
  assert.deepEqual(
    [revised.status, revised.body?.status],
    [201, 'pending'],
    JSON.stringify(revised.body),
  );
  assert.equal(
    (await call('GET', '/admin/examiner-applications', { as: admin })).body.items.filter(
      (item) => item.id === submitted.body.id,
    ).length,
    1,
  );
});

test('applications need an 18+ confirmation and approved examiners get an import template', async (t) => {
  const { db, base, call, user, catalog } = await api(t);
  const taxonomy = await catalog();
  const otherTopic = (
    await db.owner.query("INSERT INTO topics (subject_id,name) VALUES ($1,'Geometry') RETURNING id", [
      taxonomy.subject,
    ])
  ).rows[0].id;
  const otherSubject = (
    await db.owner.query("INSERT INTO subjects (exam_id,name) VALUES ($1,'Reasoning') RETURNING id", [
      taxonomy.exam,
    ])
  ).rows[0].id;
  await db.owner.query("INSERT INTO topics (subject_id,name) VALUES ($1,'Series') RETURNING id", [
    otherSubject,
  ]);
  const admin = await user({ admin: true });
  const applicant = await user({ ageConfirmed: false });
  const download = (as, query) =>
    fetch(`${base}/examiner/imports/template?${new URLSearchParams(query)}`, {
      headers: { authorization: `Bearer ${as.jwt}`, 'x-device-id': as.device },
    });
  const target = { examId: taxonomy.exam, stageId: taxonomy.stage, templateId: taxonomy.template };
  const none = await call('GET', '/examiner/application', { as: applicant });
  assert.deepEqual([none.status, none.body], [200, { application: null }], 'no application is JSON, not an empty body');

  const underage = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy),
  });
  assert.deepEqual([underage.status, underage.body.error.code], [400, 'AGE_CONFIRMATION_REQUIRED']);
  assert.equal(
    (await call('PATCH', '/me', { as: applicant, body: { ageConfirmed: true } })).status,
    200,
  );
  const submitted = await call('POST', '/examiner/applications', {
    as: applicant,
    body: applicationBody(taxonomy),
  });
  assert.equal(submitted.status, 201);
  assert.equal((await download(applicant, target)).status, 403, 'pending applicants get no template');
  await call('PATCH', `/admin/examiner-applications/${submitted.body.id}`, {
    as: admin,
    body: { status: 'approved' },
  });

  const response = await download(applicant, target);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml\.sheet/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['Questions', 'Groups', 'Sections', 'Codes', 'Instructions'],
  );
  const questions = workbook.getWorksheet('Questions');
  assert.equal(questions.rowCount, 1, 'the Questions sheet holds only headers');
  assert.ok(questions.getRow(1).values.includes('subject_code'));
  assert.deepEqual(workbook.getWorksheet('Sections').getRow(2).values.slice(1), [
    'Mathematics',
    '1-10',
    'Mathematics',
    taxonomy.subject,
  ]);
  const codes = workbook.getWorksheet('Codes').getSheetValues().slice(2).map((row) => row.slice(1));
  assert.deepEqual(
    codes.map((row) => row[3]).sort(),
    [taxonomy.topic, otherTopic].sort(),
    'only the approved subject is listed, with all its topics',
  );

  const wrongTemplate = await download(applicant, { ...target, templateId: randomUUID() });
  assert.equal(wrongTemplate.status, 422);
  assert.equal((await download(admin, target)).status, 403, 'staff are not examiners');
  assert.equal((await download(applicant, { examId: 'x' })).status, 400);
});
