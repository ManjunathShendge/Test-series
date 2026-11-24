import type { Queryable } from '@exam-prep/db';

/** Updated-at comparison that tolerates JavaScript's millisecond precision (as admin catalogue). */
const SAME_VERSION = (column: string, param: string) =>
  `abs(extract(epoch FROM ${column} - ${param}::timestamptz)) < 0.001`;

/** The newest version of each question family (versions share their root id). */
const LATEST_VERSION = `NOT EXISTS (
  SELECT 1 FROM questions newer
   WHERE COALESCE(newer.parent_question_id,newer.id)=COALESCE(q.parent_question_id,q.id)
     AND newer.version_number>q.version_number)`;

export interface TestRow {
  id: string;
  title: string;
  slug: string;
  exam_id: string;
  exam_name: string;
  stage_id: string;
  stage_name: string;
  template_id: string;
  template_name: string;
  template_version: number;
  test_type: string;
  status: string;
  access_type: string;
  price_paise: number;
  is_included_in_pass: boolean;
  has_hindi: boolean;
  series_id: string | null;
  series_title: string | null;
  scheduled_publish_at: Date | null;
  total_questions: number;
  filled_questions: number;
  total_duration_seconds: number;
  total_marks: number;
  updated_at: Date;
}

const TEST_SELECT = `
  SELECT t.id,t.title,t.slug,t.exam_id,e.name AS exam_name,t.stage_id,s.name AS stage_name,
         t.template_id,et.name AS template_name,et.version AS template_version,t.test_type,
         t.status::text AS status,t.access_type::text AS access_type,t.price_paise,t.is_included_in_pass,t.has_hindi,
         t.series_id,ser.title AS series_title,t.scheduled_publish_at,t.total_questions,
         (SELECT count(*)::int FROM test_questions tq WHERE tq.test_id=t.id) AS filled_questions,
         t.total_duration_seconds,t.total_marks::float8 AS total_marks,t.updated_at
    FROM tests t
    JOIN exams e ON e.id=t.exam_id
    JOIN exam_stages s ON s.id=t.stage_id
    JOIN exam_templates et ON et.id=t.template_id
    LEFT JOIN test_series ser ON ser.id=t.series_id`;

export interface SectionRow {
  id: string;
  name: string;
  section_order: number;
  question_count: number;
  duration_seconds: number | null;
  positive_marks: number;
  negative_marks: number;
  subject_id: string | null;
  subject_name: string | null;
}

export interface ItemRow {
  section_id: string;
  display_order: number;
  question_id: string;
  stem_en: string;
  difficulty: string;
  is_approved: boolean;
  has_hindi: boolean;
  qc_locked: boolean;
  newer_version_id: string | null;
}

export interface SeriesRow {
  id: string;
  title: string;
  slug: string;
  exam_id: string;
  exam_name: string;
  stage_id: string | null;
  stage_name: string | null;
  description: string | null;
  price_paise: number;
  validity_days: number;
  total_planned_tests: number;
  is_published: boolean;
  test_count: number;
  live_test_count: number;
  updated_at: Date;
}

const SERIES_SELECT = `
  SELECT ser.id,ser.title,ser.slug,ser.exam_id,e.name AS exam_name,ser.stage_id,s.name AS stage_name,
         ser.description,ser.price_paise,ser.validity_days,ser.total_planned_tests,ser.is_published,
         (SELECT count(*)::int FROM tests t WHERE t.series_id=ser.id) AS test_count,
         (SELECT count(*)::int FROM tests t WHERE t.series_id=ser.id AND t.status='live') AS live_test_count,ser.updated_at
    FROM test_series ser
    JOIN exams e ON e.id=ser.exam_id
    LEFT JOIN exam_stages s ON s.id=ser.stage_id`;

export const examinerTestsRepository = {
  async listTests(db: Queryable, examinerId: string): Promise<TestRow[]> {
    const { rows } = await db.query<TestRow>(
      `${TEST_SELECT} WHERE t.examiner_id=$1 ORDER BY t.updated_at DESC LIMIT 500`,
      [examinerId],
    );
    return rows;
  },

  async listSeriesTests(db: Queryable, examinerId: string, seriesId: string): Promise<TestRow[]> {
    const { rows } = await db.query<TestRow>(
      `${TEST_SELECT} WHERE t.examiner_id=$1 AND t.series_id=$2 ORDER BY t.created_at`,
      [examinerId, seriesId],
    );
    return rows;
  },

  async getTest(db: Queryable, examinerId: string, testId: string, lock = false): Promise<TestRow | undefined> {
    // FOR UPDATE OF t: under RLS only the examiner's editable drafts can be locked.
    const { rows } = await db.query<TestRow>(
      `${TEST_SELECT} WHERE t.id=$1 AND t.examiner_id=$2${lock ? ' FOR UPDATE OF t' : ''}`,
      [testId, examinerId],
    );
    return rows[0];
  },

  async isSameVersion(db: Queryable, testId: string, expectedUpdatedAt: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM tests WHERE id=$1 AND ${SAME_VERSION('updated_at', '$2')}`,
      [testId, expectedUpdatedAt],
    );
    return rowCount === 1;
  },

  async touchTest(db: Queryable, testId: string): Promise<void> {
    await db.query('UPDATE tests SET updated_at=now() WHERE id=$1', [testId]);
  },

  async createTest(
    db: Queryable,
    examinerId: string,
    input: {
      examId: string;
      stageId: string;
      templateId: string;
      seriesId: string | null;
      title: string;
      slug: string;
      testType: string;
      accessType: string;
      pricePaise: number;
      includedInPass: boolean;
      hasHindi: boolean;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tests (exam_id,stage_id,template_id,examiner_id,series_id,title,slug,test_type,access_type,
                          price_paise,has_hindi,is_included_in_pass,total_questions,total_duration_seconds,total_marks)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::test_access_type,$10,$11,$12,
              (SELECT COALESCE(sum(question_count),0)::int FROM exam_template_sections WHERE template_id=$3),
              et.total_duration_seconds,
              (SELECT COALESCE(sum(question_count*positive_marks),0) FROM exam_template_sections WHERE template_id=$3)
         FROM exam_templates et WHERE et.id=$3
       RETURNING id`,
      [
        input.examId,
        input.stageId,
        input.templateId,
        examinerId,
        input.seriesId,
        input.title,
        input.slug,
        input.testType,
        input.accessType,
        input.pricePaise,
        input.hasHindi,
        input.includedInPass,
      ],
    );
    const id = rows[0]!.id;
    await db.query(
      `INSERT INTO test_sections (test_id,template_section_id,name,section_order,question_count,duration_seconds,
                                  positive_marks,negative_marks)
       SELECT $1,id,name,section_order,question_count,duration_seconds,positive_marks,negative_marks
         FROM exam_template_sections WHERE template_id=$2`,
      [id, input.templateId],
    );
    return id;
  },

  async templateHasSections(db: Queryable, templateId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      'SELECT 1 FROM exam_template_sections WHERE template_id=$1 AND question_count>0 LIMIT 1',
      [templateId],
    );
    return rowCount === 1;
  },

  /** Applies whitelisted column changes to an editable draft. */
  async updateTest(
    db: Queryable,
    testId: string,
    fields: Partial<{
      title: string;
      test_type: string;
      access_type: string;
      price_paise: number;
      is_included_in_pass: boolean;
      has_hindi: boolean;
      series_id: string | null;
      scheduled_publish_at: string | null;
    }>,
  ): Promise<void> {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const cast = (column: string) =>
      column === 'access_type' ? '::test_access_type' : column === 'scheduled_publish_at' ? '::timestamptz' : '';
    const set = entries.map(([column], index) => `${column}=$${index + 2}${cast(column)}`);
    await db.query(`UPDATE tests SET ${set.join(',')} WHERE id=$1`, [
      testId,
      ...entries.map(([, value]) => value),
    ]);
  },

  async deleteTest(db: Queryable, testId: string): Promise<boolean> {
    const { rowCount } = await db.query("DELETE FROM tests WHERE id=$1 AND status='draft'", [testId]);
    return rowCount === 1;
  },

  async listSections(db: Queryable, testId: string): Promise<SectionRow[]> {
    const { rows } = await db.query<SectionRow>(
      `SELECT ts.id,ts.name,ts.section_order,ts.question_count,ts.duration_seconds,
              ts.positive_marks::float8 AS positive_marks,ts.negative_marks::float8 AS negative_marks,
              ets.subject_id,sub.name AS subject_name
         FROM test_sections ts
         LEFT JOIN exam_template_sections ets ON ets.id=ts.template_section_id
         LEFT JOIN subjects sub ON sub.id=ets.subject_id
        WHERE ts.test_id=$1 ORDER BY ts.section_order`,
      [testId],
    );
    return rows;
  },

  async listItems(db: Queryable, testId: string): Promise<ItemRow[]> {
    const { rows } = await db.query<ItemRow>(
      `SELECT tq.section_id,tq.display_order,tq.question_id,q.stem_en,q.difficulty::text AS difficulty,
              q.is_approved_in_corpus AS is_approved,
              (COALESCE(trim(q.stem_hi),'')<>'' AND COALESCE(trim(q.solution_hi),'')<>'') AS has_hindi,
              tq.is_locked_by_qc AS qc_locked,
              (SELECT newer.id FROM questions newer
                WHERE COALESCE(newer.parent_question_id,newer.id)=COALESCE(q.parent_question_id,q.id)
                  AND newer.examiner_id=q.examiner_id AND newer.version_number>q.version_number
                ORDER BY newer.version_number DESC LIMIT 1) AS newer_version_id
         FROM test_questions tq JOIN questions q ON q.id=tq.question_id
        WHERE tq.test_id=$1 ORDER BY tq.display_order`,
      [testId],
    );
    return rows;
  },

  /** The examiner's own latest-version questions of the exam among `ids`, with their subject. */
  async ownLatestQuestions(
    db: Queryable,
    examinerId: string,
    examId: string,
    ids: string[],
  ): Promise<{ id: string; subject_id: string }[]> {
    if (!ids.length) return [];
    const { rows } = await db.query<{ id: string; subject_id: string }>(
      `SELECT q.id,q.subject_id FROM questions q
        WHERE q.id=ANY($1::uuid[]) AND q.examiner_id=$2 AND q.exam_id=$3 AND ${LATEST_VERSION}`,
      [ids, examinerId, examId],
    );
    return rows;
  },

  /**
   * Writes a section's slots, touching only positions that changed so unchanged (and QC-locked)
   * items keep their row and review history. Changing a locked item makes the trigger refuse
   * (restrict_violation). Removals run before inserts so a question may move between positions.
   */
  async replaceSectionItems(
    db: Queryable,
    testId: string,
    section: { id: string; positive_marks: number; negative_marks: number },
    offset: number,
    questionIds: (string | null)[],
  ): Promise<void> {
    const { rows } = await db.query<{ id: string; display_order: number; question_id: string }>(
      'SELECT id,display_order,question_id FROM test_questions WHERE test_id=$1 AND section_id=$2',
      [testId, section.id],
    );
    const current = new Map(rows.map((row) => [row.display_order, row]));
    const stale = rows.filter((row) => questionIds[row.display_order - offset - 1] !== row.question_id);
    if (stale.length)
      await db.query('DELETE FROM test_questions WHERE id=ANY($1::uuid[])', [stale.map((row) => row.id)]);
    for (const [index, questionId] of questionIds.entries()) {
      const order = offset + index + 1;
      if (!questionId || current.get(order)?.question_id === questionId) continue;
      await db.query(
        `INSERT INTO test_questions (test_id,section_id,question_id,display_order,positive_marks,negative_marks)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [testId, section.id, questionId, order, section.positive_marks, section.negative_marks],
      );
    }
  },

  async getCommittedImport(
    db: Queryable,
    ownerId: string,
    importId: string,
  ): Promise<{ template_id: string | null; status: string; committed_question_ids: string[] } | undefined> {
    const { rows } = await db.query<{
      template_id: string | null;
      status: string;
      committed_question_ids: string[];
    }>(
      'SELECT template_id,status::text AS status,committed_question_ids FROM import_runs WHERE id=$1 AND owner_id=$2',
      [importId, ownerId],
    );
    return rows[0];
  },

  async importRowPlacements(db: Queryable, importId: string): Promise<{ section: string; position: number }[]> {
    const { rows } = await db.query<{ section: string | null; position: string | null }>(
      `SELECT data->>'section' AS section,data->>'position' AS position
         FROM import_rows WHERE import_id=$1 ORDER BY row_number`,
      [importId],
    );
    return rows.map((row) => ({ section: row.section ?? '', position: Number(row.position) }));
  },

  async precheck(db: Queryable, testId: string): Promise<{
    can_submit: boolean;
    blocking_errors: string[];
    pyq_percentage: number | string;
    section_mismatches: { section_name: string; expected_count: number; actual_count: number }[];
  }> {
    const { rows } = await db.query<{ r: never }>('SELECT public.run_test_presubmit_check($1) AS r', [testId]);
    return rows[0]!.r;
  },

  async setSubmitted(db: Queryable, testId: string): Promise<void> {
    await db.query("UPDATE tests SET status='submitted' WHERE id=$1 AND status IN ('draft','changes_requested')", [
      testId,
    ]);
  },

  // Series ---------------------------------------------------------------------------------

  async listSeries(db: Queryable, examinerId: string): Promise<SeriesRow[]> {
    const { rows } = await db.query<SeriesRow>(
      `${SERIES_SELECT} WHERE ser.examiner_id=$1 ORDER BY ser.updated_at DESC LIMIT 200`,
      [examinerId],
    );
    return rows;
  },

  async getSeries(db: Queryable, examinerId: string, seriesId: string, lock = false): Promise<SeriesRow | undefined> {
    const { rows } = await db.query<SeriesRow>(
      `${SERIES_SELECT} WHERE ser.id=$1 AND ser.examiner_id=$2${lock ? ' FOR UPDATE OF ser' : ''}`,
      [seriesId, examinerId],
    );
    return rows[0];
  },

  async isSameSeriesVersion(db: Queryable, seriesId: string, expectedUpdatedAt: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM test_series WHERE id=$1 AND ${SAME_VERSION('updated_at', '$2')}`,
      [seriesId, expectedUpdatedAt],
    );
    return rowCount === 1;
  },

  async stageBelongsToExam(db: Queryable, stageId: string, examId: string): Promise<boolean> {
    const { rowCount } = await db.query('SELECT 1 FROM exam_stages WHERE id=$1 AND exam_id=$2', [stageId, examId]);
    return rowCount === 1;
  },

  async examAssigned(db: Queryable, examinerId: string, examId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM examiner_profiles ep JOIN exams e ON e.id=$2 AND e.is_active
        WHERE ep.user_id=$1 AND ep.onboarding_status='approved' AND $2=ANY(ep.exam_ids)`,
      [examinerId, examId],
    );
    return rowCount === 1;
  },

  async createSeries(
    db: Queryable,
    examinerId: string,
    input: {
      examId: string;
      stageId: string | null;
      title: string;
      slug: string;
      description: string;
      pricePaise: number;
      validityDays: number;
      totalPlannedTests: number;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO test_series (exam_id,stage_id,examiner_id,title,slug,description,price_paise,validity_days,
                                total_planned_tests,is_published,is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false) RETURNING id`,
      [
        input.examId,
        input.stageId,
        examinerId,
        input.title,
        input.slug,
        input.description || null,
        input.pricePaise,
        input.validityDays,
        input.totalPlannedTests,
      ],
    );
    return rows[0]!.id;
  },

  async updateSeries(
    db: Queryable,
    seriesId: string,
    fields: Partial<{
      title: string;
      description: string | null;
      price_paise: number;
      validity_days: number;
      total_planned_tests: number;
    }>,
  ): Promise<void> {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const set = entries.map(([column], index) => `${column}=$${index + 2}`);
    await db.query(`UPDATE test_series SET ${set.join(',')} WHERE id=$1 AND NOT is_published`, [
      seriesId,
      ...entries.map(([, value]) => value),
    ]);
  },

  async setSeriesPublished(db: Queryable, seriesId: string, published: boolean): Promise<void> {
    await db.query('UPDATE test_series SET is_published=$2 WHERE id=$1', [seriesId, published]);
  },

  async seriesHasNonDraftTests(db: Queryable, seriesId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      "SELECT 1 FROM tests WHERE series_id=$1 AND status NOT IN ('draft','changes_requested') LIMIT 1",
      [seriesId],
    );
    return rowCount === 1;
  },

  async deleteSeries(db: Queryable, seriesId: string): Promise<boolean> {
    await db.query('UPDATE tests SET series_id=NULL WHERE series_id=$1', [seriesId]);
    const { rowCount } = await db.query('DELETE FROM test_series WHERE id=$1 AND NOT is_published', [seriesId]);
    return rowCount === 1;
  },
};
