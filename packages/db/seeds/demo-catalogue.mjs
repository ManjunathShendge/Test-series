import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabase, transaction } from '../dist/index.js';

/*
 * Demo catalogue: the mobile app's synthetic exams, examiners, series, tests and question
 * bank (apps/mobile/src/lib/demo, exported to demo-catalogue.json), written into the real
 * schema so the web and mobile clients can read them from the API.
 *
 * Synthetic only. Examiner personas have placeholder Firebase IDs that no one can sign in
 * with and no KYC or bank details. No student accounts, purchases, entitlements or attempts
 * are created. Prices are the demo's placeholders, not approved pricing.
 *
 * Idempotent: rows have deterministic IDs and are skipped when present. Published tests are
 * immutable, so re-running never edits them; change the data by adding new rows.
 */

const ENV = process.env.APP_ENV ?? '';
if (!['local', 'test', 'staging'].includes(ENV)) throw new Error('Demo seed requires APP_ENV=local, test or staging');
if (ENV === 'staging' && process.env.CONFIRM_DEMO_SEED !== 'staging') {
  throw new Error('Seeding staging needs CONFIRM_DEMO_SEED=staging');
}
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required');

const demo = JSON.parse(readFileSync(new URL('./demo-catalogue.json', import.meta.url), 'utf8'));

/** Stable UUID derived from a key, so re-runs address the same rows. */
const uid = (key) => {
  const h = createHash('sha256').update(`makemeprepare-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Seed-only normalisation for the required hash columns; the QC normaliser replaces it.
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const CATEGORY = { SSC: 'ssc', Banking: 'banking', Railways: 'railways' };

/** Stage, official pattern template and subject names per demo exam. */
const PATTERN = {
  'ssc-cgl-t1': {
    stage: ['Tier 1', 'tier-1'], slug: 'ssc-cgl', name: 'SSC CGL',
    template: { name: 'SSC CGL Tier 1 (official pattern)', questions: 100, seconds: 3600, sectional: false, pos: 2, neg: 0.5 },
    subjects: { reasoning: ['General Intelligence & Reasoning', 25], ga: ['General Awareness', 25], quant: ['Quantitative Aptitude', 25], english: ['English Comprehension', 25] },
  },
  'ibps-po-pre': {
    stage: ['Prelims', 'prelims'], slug: 'ibps-po', name: 'IBPS PO',
    template: { name: 'IBPS PO Prelims (official pattern)', questions: 100, seconds: 3600, sectional: true, pos: 1, neg: 0.25 },
    subjects: { english: ['English Language', 30, 1200], quant: ['Quantitative Aptitude', 35, 1200], reasoning: ['Reasoning Ability', 35, 1200] },
  },
  'rrb-ntpc-cbt1': {
    stage: ['CBT 1', 'cbt-1'], slug: 'rrb-ntpc', name: 'RRB NTPC',
    template: { name: 'RRB NTPC CBT 1 (official pattern)', questions: 100, seconds: 5400, sectional: false, pos: 1, neg: 0.33 },
    subjects: { ga: ['General Awareness', 40], quant: ['Mathematics', 30], reasoning: ['General Intelligence & Reasoning', 30] },
  },
};
const TEST_TYPE = { 'full-mock': 'mock', sectional: 'sectional', pyq: 'pyq' };
const marks = (n) => Math.round(n * 100) / 100;

const counts = {};
const added = () => Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
async function insert(client, table, row, conflict = 'id') {
  const keys = Object.keys(row);
  const { rowCount } = await client.query(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (${conflict}) DO NOTHING`,
    Object.values(row),
  );
  counts[table] = (counts[table] ?? 0) + rowCount;
  return rowCount === 1;
}

const db = createDatabase(url, { max: 1, caCertPath: process.env.DATABASE_CA_CERT_PATH || undefined });
try {
  await transaction(db, async (c) => {
    // Integrity triggers treat a missing user context as the server (system seed).
    await c.query("SELECT set_config('app.user_id', '', true)");

    for (const [name, slug] of Object.entries(CATEGORY)) {
      await insert(c, 'exam_categories', { id: uid(`cat:${slug}`), name, slug, display_order: Object.keys(CATEGORY).indexOf(name) + 1 }, 'slug');
    }
    const categoryId = Object.fromEntries((await c.query('SELECT name, id FROM exam_categories')).rows.map((r) => [r.name, r.id]));

    // Exams, stages, subjects, topics and the official-pattern template.
    const ids = {};
    for (const exam of demo.exams) {
      const p = PATTERN[exam.id];
      const examId = uid(`exam:${exam.id}`);
      const stageId = uid(`stage:${exam.id}`);
      const templateId = uid(`template:${exam.id}`);
      ids[exam.id] = { exam: examId, stage: stageId, template: templateId, subject: {}, topic: {}, templateSection: {} };
      await insert(c, 'exams', {
        id: examId, category_id: categoryId[exam.category], name: p.name, slug: p.slug,
        syllabus_markdown: `${exam.pattern}\n\n${exam.syllabus.map((s) => `- ${s}`).join('\n')}`,
        important_dates: JSON.stringify(exam.nextDate ? [{ label: `${exam.name} (expected)`, date: exam.nextDate }] : []),
        last_cutoff_score: exam.lastCutoff ?? null,
      });
      await insert(c, 'exam_stages', { id: stageId, exam_id: examId, name: p.stage[0], slug: p.stage[1] });
      // A template is published once its sections exist and is frozen afterwards (migration 008),
      // so sections are only written for a template created by this run.
      const newTemplate = await insert(c, 'exam_templates', {
        id: templateId, exam_id: examId, stage_id: stageId, name: p.template.name, total_questions: p.template.questions,
        total_duration_seconds: p.template.seconds, has_sectional_timing: p.template.sectional,
        default_positive_marks: p.template.pos, default_negative_marks: p.template.neg,
      });
      let order = 1;
      for (const [pool, [subjectName, count, seconds]] of Object.entries(p.subjects)) {
        const subjectId = uid(`subject:${exam.id}:${pool}`);
        ids[exam.id].subject[pool] = subjectId;
        await insert(c, 'subjects', { id: subjectId, exam_id: examId, name: subjectName });
        const sectionId = uid(`template-section:${exam.id}:${pool}`);
        ids[exam.id].templateSection[pool] = sectionId;
        if (newTemplate) {
          await insert(c, 'exam_template_sections', {
            id: sectionId, template_id: templateId, subject_id: subjectId, name: subjectName, section_order: order++,
            question_count: count, duration_seconds: seconds ?? null, positive_marks: p.template.pos, negative_marks: p.template.neg,
          });
        }
        for (const topic of new Set(demo.bank[pool].map((q) => q.topic))) {
          const topicId = uid(`topic:${exam.id}:${pool}:${topic}`);
          ids[exam.id].topic[`${pool}:${topic}`] = topicId;
          await insert(c, 'topics', { id: topicId, subject_id: subjectId, name: topic });
        }
      }
      if (newTemplate) await c.query('UPDATE exam_templates SET published_at = now() WHERE id = $1', [templateId]);
    }

    // Examiner personas: profile plus approved examiner profile, no KYC or payout details.
    const examinerId = {};
    for (const e of demo.examiners) {
      const id = uid(`examiner:${e.id}`);
      examinerId[e.id] = id;
      await insert(c, 'profiles', {
        id, firebase_uid: `demo-seed:${e.id}`, email: `${e.id}@demo.makemeprepare.invalid`, full_name: e.name, roles: '{examiner}',
      });
      await insert(c, 'examiner_profiles', {
        user_id: id, bio: `${e.credentials}. ${e.bio}`, exam_ids: e.examIds.map((x) => ids[x].exam),
        onboarding_status: 'approved', tier: e.tier, agreement_version: 'demo-seed', agreement_accepted_at: new Date().toISOString(),
        follower_count: e.followers,
      }, 'user_id');
    }

    // Questions: one approved copy per exam and pool, owned by the first examiner using it.
    const questionId = {};
    for (const t of demo.tests) {
      for (const s of t.sections) {
        for (const q of demo.bank[s.bankKey].slice(0, s.questionCount)) {
          const key = `${t.examId}:${q.id}`;
          if (questionId[key]) continue;
          const sol = demo.solutions[q.id];
          const stem = norm(q.stem.en);
          const opts = q.options.map((o) => norm(o.text.en)).sort();
          questionId[key] = uid(`question:${key}`);
          await insert(c, 'questions', {
            id: questionId[key], exam_id: ids[t.examId].exam, examiner_id: examinerId[t.examinerId],
            subject_id: ids[t.examId].subject[s.bankKey], topic_id: ids[t.examId].topic[`${s.bankKey}:${q.topic}`],
            stem_en: q.stem.en, stem_hi: q.stem.hi ?? null,
            options: JSON.stringify(q.options.map((o) => ({ id: o.id, text_en: o.text.en, ...(o.text.hi ? { text_hi: o.text.hi } : {}) }))),
            correct_option: sol.correctOptionId, solution_en: sol.solution.en, solution_hi: sol.solution.hi ?? null,
            norm_stem_en: stem, norm_stem_hi: q.stem.hi ? norm(q.stem.hi) : null,
            text_hash: sha([stem, ...opts].join('\n')), masked_hash: sha([stem, ...opts].join('\n').replace(/\d+(\.\d+)?/g, '#')),
            is_pyq: t.kind === 'pyq', is_approved_in_corpus: true,
          });
        }
      }
    }

    // Series, then each test as a draft with its sections and items, then published.
    for (const s of demo.series) {
      await insert(c, 'test_series', {
        id: uid(`series:${s.id}`), exam_id: ids[s.examId].exam, stage_id: ids[s.examId].stage, examiner_id: examinerId[s.examinerId],
        title: s.title, slug: s.id.replace(/^s-/, ''), description: s.description,
        syllabus_coverage: `${Math.round(s.syllabusCoverage * 100)}% of the syllabus`,
        total_planned_tests: s.testIds.length, published_tests_count: s.testIds.length,
        price_paise: s.pricePaise, validity_days: s.validityDays, is_published: true,
      }, 'slug');
    }
    for (const t of demo.tests) {
      const testId = uid(`test:${t.id}`);
      const exists = await c.query('SELECT 1 FROM tests WHERE id = $1', [testId]);
      if (exists.rowCount) continue;
      await insert(c, 'tests', {
        id: testId, exam_id: ids[t.examId].exam, stage_id: ids[t.examId].stage, template_id: ids[t.examId].template,
        examiner_id: examinerId[t.examinerId], series_id: t.seriesId ? uid(`series:${t.seriesId}`) : null,
        title: t.title, slug: t.id.replace(/^t-/, ''), test_type: TEST_TYPE[t.kind], has_hindi: t.languages.includes('hi'),
        access_type: t.pricePaise === 0 ? 'free' : 'paid', price_paise: t.pricePaise, is_admin_featured_free: !!t.isFeatured,
        total_questions: t.questionCount, total_duration_seconds: t.durationMinutes * 60, total_marks: t.totalMarks,
        pyq_percentage: t.kind === 'pyq' ? 100 : 0, attempts_count: t.attempts,
      });
      let order = 1;
      for (const [i, s] of t.sections.entries()) {
        const sectionId = uid(`test-section:${t.id}:${s.id}`);
        await insert(c, 'test_sections', {
          id: sectionId, test_id: testId, template_section_id: ids[t.examId].templateSection[s.bankKey],
          name: PATTERN[t.examId].subjects[s.bankKey][0], section_order: i + 1, question_count: s.questionCount,
          duration_seconds: s.durationMinutes ? s.durationMinutes * 60 : null,
          positive_marks: marks(s.marksPerQuestion), negative_marks: marks(s.negativeMarks),
        });
        for (const q of demo.bank[s.bankKey].slice(0, s.questionCount)) {
          await insert(c, 'test_questions', {
            id: uid(`test-question:${t.id}:${q.id}`), test_id: testId, section_id: sectionId,
            question_id: questionId[`${t.examId}:${q.id}`], display_order: order++,
            positive_marks: marks(s.marksPerQuestion), negative_marks: marks(s.negativeMarks), qc_status: 'approve', is_locked_by_qc: true,
          });
        }
      }
      await c.query("UPDATE tests SET status = 'live', published_at = $2 WHERE id = $1", [testId, t.publishedAt]);
    }

    await c.query("INSERT INTO bootstrap_state VALUES ('demo-catalogue', 1) ON CONFLICT (id) DO NOTHING");
  });
  console.log('Demo catalogue ready. Rows added:', Object.keys(added()).length ? added() : 'none (already seeded)');
} finally {
  await db.end();
}
