import type { Queryable } from '@exam-prep/db';

/*
 * Admin catalogue reads and writes. Always called inside withUser for an admin, so the
 * database's admin-only triggers pass and every write is audited (migration 005/008).
 * Parameterised SQL only; column names in dynamic SET clauses come from fixed allowlists.
 * NUMERIC columns arrive as strings and are converted by the service.
 */

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  exam_count: number;
}

export interface ExamSummaryRow {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  category_name: string;
  is_active: boolean;
  stage_count: number;
  subject_count: number;
  published_template_count: number;
  draft_template_count: number;
  updated_at: Date;
}

export interface ExamRow {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  category_name: string;
  is_active: boolean;
  syllabus_markdown: string | null;
  important_dates: unknown;
  previous_cutoffs: unknown;
  last_cutoff_score: string | null;
  ai_answer_check_enabled: boolean;
  ai_ambiguity_check_enabled: boolean;
  ai_language_check_enabled: boolean;
  live_test_count: number;
  updated_at: Date;
}

export interface StageRow {
  id: string;
  exam_id: string;
  name: string;
  slug: string;
  display_order: number;
  in_use: boolean;
}

export interface SubjectRow {
  id: string;
  name: string;
  in_use: boolean;
}

export interface TopicRow {
  id: string;
  subject_id: string;
  name: string;
  in_use: boolean;
}

export interface TemplateRow {
  id: string;
  exam_id: string;
  stage_id: string;
  stage_name: string;
  name: string;
  version: number;
  total_questions: number;
  total_duration_seconds: number;
  has_sectional_timing: boolean;
  default_positive_marks: string;
  default_negative_marks: string;
  is_active: boolean;
  published_at: Date | null;
  supersedes_template_id: string | null;
  updated_at: Date;
  section_count: number;
  test_count: number;
}

export interface SectionRow {
  id: string;
  name: string;
  subject_id: string | null;
  section_order: number;
  question_count: number;
  duration_seconds: number | null;
  positive_marks: string;
  negative_marks: string;
  target_topic_counts: Record<string, number>;
}

export interface AuditRow {
  id: string;
  created_at: Date;
  action_name: string;
  target_table: string;
  target_record_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string | null;
  changed: string[];
}

export interface SectionInsert {
  name: string;
  subjectId: string | null;
  questionCount: number;
  durationSeconds: number | null;
  positiveMarks: number;
  negativeMarks: number;
  targetTopicCounts: Record<string, number>;
}

export interface TemplateFieldsInsert {
  stageId: string;
  name: string;
  totalQuestions: number;
  totalDurationSeconds: number;
  hasSectionalTiming: boolean;
  defaultPositiveMarks: number;
  defaultNegativeMarks: number;
}

/** Names this transaction's audit rows (audit_privileged_change reads app.audit_action). */
export async function auditAs(db: Queryable, action: string): Promise<void> {
  await db.query("SELECT set_config('app.audit_action', $1, true)", [action]);
}

/** `SET a = $2, b = $3` for allowlisted columns; values follow the given first parameters. */
function setClause(fields: Record<string, unknown>, offset: number): { sql: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  return {
    sql: entries.map(([column], i) => `${column} = $${i + offset}`).join(', '),
    values: entries.map(([, v]) => v),
  };
}

/** Matches a timestamp the client loaded (millisecond ISO) against the stored microsecond one. */
const SAME_VERSION = (column: string, param: string) => `abs(extract(epoch FROM ${column} - ${param}::timestamptz)) < 0.001`;

const TEMPLATE_SELECT = `
  SELECT t.id, t.exam_id, t.stage_id, s.name AS stage_name, t.name, t.version, t.total_questions,
         t.total_duration_seconds, t.has_sectional_timing, t.default_positive_marks, t.default_negative_marks,
         t.is_active, t.published_at, t.supersedes_template_id, t.updated_at,
         (SELECT count(*)::int FROM exam_template_sections x WHERE x.template_id = t.id) AS section_count,
         (SELECT count(*)::int FROM tests x WHERE x.template_id = t.id) AS test_count
    FROM exam_templates t JOIN exam_stages s ON s.id = t.stage_id`;

export const adminCatalogueRepository = {
  // Categories ----------------------------------------------------------------------
  async categories(db: Queryable): Promise<CategoryRow[]> {
    const { rows } = await db.query<CategoryRow>(
      `SELECT c.id, c.name, c.slug, c.display_order, c.is_active,
              (SELECT count(*)::int FROM exams e WHERE e.category_id = c.id) AS exam_count
         FROM exam_categories c ORDER BY c.display_order, c.name`,
    );
    return rows;
  },

  async category(db: Queryable, id: string): Promise<CategoryRow | undefined> {
    const { rows } = await db.query<CategoryRow>(
      `SELECT c.id, c.name, c.slug, c.display_order, c.is_active,
              (SELECT count(*)::int FROM exams e WHERE e.category_id = c.id) AS exam_count
         FROM exam_categories c WHERE c.id = $1`,
      [id],
    );
    return rows[0];
  },

  async insertCategory(db: Queryable, v: { name: string; slug: string; displayOrder: number }): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO exam_categories (name, slug, display_order) VALUES ($1, $2, $3) RETURNING id',
      [v.name, v.slug, v.displayOrder],
    );
    return rows[0]!.id;
  },

  async updateCategory(db: Queryable, id: string, v: { name?: string | undefined; slug?: string | undefined; displayOrder?: number | undefined; isActive?: boolean | undefined }): Promise<boolean> {
    const set = setClause({ name: v.name, slug: v.slug, display_order: v.displayOrder, is_active: v.isActive }, 2);
    const { rowCount } = await db.query(`UPDATE exam_categories SET ${set.sql} WHERE id = $1`, [id, ...set.values]);
    return rowCount === 1;
  },

  async deleteCategory(db: Queryable, id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM exam_categories WHERE id = $1', [id]);
    return rowCount === 1;
  },

  // Exams ---------------------------------------------------------------------------
  async exams(db: Queryable): Promise<ExamSummaryRow[]> {
    const { rows } = await db.query<ExamSummaryRow>(
      `SELECT e.id, e.name, e.slug, c.id AS category_id, c.name AS category_name, e.is_active, e.updated_at,
              (SELECT count(*)::int FROM exam_stages s WHERE s.exam_id = e.id) AS stage_count,
              (SELECT count(*)::int FROM subjects s WHERE s.exam_id = e.id) AS subject_count,
              (SELECT count(*)::int FROM exam_templates t WHERE t.exam_id = e.id AND t.published_at IS NOT NULL AND t.is_active) AS published_template_count,
              (SELECT count(*)::int FROM exam_templates t WHERE t.exam_id = e.id AND t.published_at IS NULL) AS draft_template_count
         FROM exams e JOIN exam_categories c ON c.id = e.category_id
        ORDER BY c.display_order, c.name, e.name`,
    );
    return rows;
  },

  async exam(db: Queryable, id: string, lock = false): Promise<ExamRow | undefined> {
    const { rows } = await db.query<ExamRow>(
      `SELECT e.id, e.name, e.slug, e.category_id, c.name AS category_name, e.is_active, e.syllabus_markdown,
              e.important_dates, e.previous_cutoffs, e.last_cutoff_score, e.updated_at,
              e.ai_answer_check_enabled, e.ai_ambiguity_check_enabled, e.ai_language_check_enabled,
              (SELECT count(*)::int FROM tests t WHERE t.exam_id = e.id AND t.status = 'live') AS live_test_count
         FROM exams e JOIN exam_categories c ON c.id = e.category_id WHERE e.id = $1${lock ? ' FOR UPDATE OF e' : ''}`,
      [id],
    );
    return rows[0];
  },

  async insertExam(db: Queryable, v: { categoryId: string; name: string; slug: string }): Promise<string> {
    // New exams stay off the website until an admin shows them.
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO exams (category_id, name, slug, is_active) VALUES ($1, $2, $3, false) RETURNING id',
      [v.categoryId, v.name, v.slug],
    );
    return rows[0]!.id;
  },

  /** Returns false when the exam changed since `expectedUpdatedAt`. */
  async updateExam(db: Queryable, id: string, expectedUpdatedAt: string, fields: Record<string, unknown>): Promise<boolean> {
    const set = setClause(fields, 3);
    if (!set.sql) {
      const { rowCount } = await db.query(`SELECT 1 FROM exams WHERE id = $1 AND ${SAME_VERSION('updated_at', '$2')}`, [id, expectedUpdatedAt]);
      return rowCount === 1;
    }
    const { rowCount } = await db.query(
      `UPDATE exams SET ${set.sql} WHERE id = $1 AND ${SAME_VERSION('updated_at', '$2')}`,
      [id, expectedUpdatedAt, ...set.values],
    );
    return rowCount === 1;
  },

  async hasPublishedTemplate(db: Queryable, examId: string): Promise<boolean> {
    const { rowCount } = await db.query('SELECT 1 FROM exam_templates WHERE exam_id = $1 AND published_at IS NOT NULL AND is_active LIMIT 1', [examId]);
    return rowCount === 1;
  },

  // Stages --------------------------------------------------------------------------
  async stages(db: Queryable, examId: string): Promise<StageRow[]> {
    const { rows } = await db.query<StageRow>(
      `SELECT s.id, s.exam_id, s.name, s.slug, s.display_order,
              (EXISTS (SELECT 1 FROM exam_templates t WHERE t.stage_id = s.id) OR EXISTS (SELECT 1 FROM tests t WHERE t.stage_id = s.id)) AS in_use
         FROM exam_stages s WHERE s.exam_id = $1 ORDER BY s.display_order, s.name`,
      [examId],
    );
    return rows;
  },

  async stage(db: Queryable, id: string): Promise<StageRow | undefined> {
    const { rows } = await db.query<StageRow>(
      `SELECT s.id, s.exam_id, s.name, s.slug, s.display_order,
              (EXISTS (SELECT 1 FROM exam_templates t WHERE t.stage_id = s.id) OR EXISTS (SELECT 1 FROM tests t WHERE t.stage_id = s.id)) AS in_use
         FROM exam_stages s WHERE s.id = $1`,
      [id],
    );
    return rows[0];
  },

  async insertStage(db: Queryable, examId: string, v: { name: string; slug: string; displayOrder?: number | undefined }): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO exam_stages (exam_id, name, slug, display_order)
       VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(max(display_order), 0) + 1 FROM exam_stages WHERE exam_id = $1)))
       RETURNING id`,
      [examId, v.name, v.slug, v.displayOrder ?? null],
    );
    return rows[0]!.id;
  },

  async updateStage(db: Queryable, id: string, v: { name: string; slug: string; displayOrder?: number | undefined }): Promise<void> {
    const set = setClause({ name: v.name, slug: v.slug, display_order: v.displayOrder }, 2);
    await db.query(`UPDATE exam_stages SET ${set.sql} WHERE id = $1`, [id, ...set.values]);
  },

  async deleteStage(db: Queryable, id: string): Promise<void> {
    await db.query('DELETE FROM exam_stages WHERE id = $1', [id]);
  },

  // Syllabus tree -------------------------------------------------------------------
  async subjects(db: Queryable, examId: string): Promise<SubjectRow[]> {
    const { rows } = await db.query<SubjectRow>(
      `SELECT s.id, s.name,
              (EXISTS (SELECT 1 FROM questions q WHERE q.subject_id = s.id)
               OR EXISTS (SELECT 1 FROM exam_template_sections x WHERE x.subject_id = s.id)) AS in_use
         FROM subjects s WHERE s.exam_id = $1 ORDER BY s.name`,
      [examId],
    );
    return rows;
  },

  async topics(db: Queryable, examId: string): Promise<TopicRow[]> {
    const { rows } = await db.query<TopicRow>(
      `SELECT t.id, t.subject_id, t.name,
              (EXISTS (SELECT 1 FROM questions q WHERE q.topic_id = t.id)
               OR EXISTS (SELECT 1 FROM exam_template_sections x JOIN exam_templates et ON et.id = x.template_id
                           WHERE et.exam_id = $1 AND x.target_topic_counts ? t.id::text)) AS in_use
         FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE s.exam_id = $1 ORDER BY t.name`,
      [examId],
    );
    return rows;
  },

  async subject(db: Queryable, id: string): Promise<(SubjectRow & { exam_id: string }) | undefined> {
    const { rows } = await db.query<SubjectRow & { exam_id: string }>(
      `SELECT s.id, s.exam_id, s.name,
              (EXISTS (SELECT 1 FROM questions q WHERE q.subject_id = s.id)
               OR EXISTS (SELECT 1 FROM exam_template_sections x WHERE x.subject_id = s.id)
               OR EXISTS (SELECT 1 FROM topics t JOIN questions q ON q.topic_id = t.id WHERE t.subject_id = s.id)) AS in_use
         FROM subjects s WHERE s.id = $1`,
      [id],
    );
    return rows[0];
  },

  async topic(db: Queryable, id: string): Promise<(TopicRow & { exam_id: string }) | undefined> {
    const { rows } = await db.query<TopicRow & { exam_id: string }>(
      `SELECT t.id, t.subject_id, t.name, s.exam_id,
              (EXISTS (SELECT 1 FROM questions q WHERE q.topic_id = t.id)
               OR EXISTS (SELECT 1 FROM exam_template_sections x WHERE x.target_topic_counts ? t.id::text)) AS in_use
         FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = $1`,
      [id],
    );
    return rows[0];
  },

  /** Whether any template (draft or published) has a topic target in this subject. */
  async subjectHasTopicTargets(db: Queryable, subjectId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM topics t JOIN exam_template_sections x ON x.target_topic_counts ? t.id::text WHERE t.subject_id = $1 LIMIT 1`,
      [subjectId],
    );
    return rowCount === 1;
  },

  async insertSubject(db: Queryable, examId: string, name: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>('INSERT INTO subjects (exam_id, name) VALUES ($1, $2) RETURNING id', [examId, name]);
    return rows[0]!.id;
  },

  async renameSubject(db: Queryable, id: string, name: string): Promise<void> {
    await db.query('UPDATE subjects SET name = $2 WHERE id = $1', [id, name]);
  },

  async deleteSubject(db: Queryable, id: string): Promise<void> {
    await db.query('DELETE FROM subjects WHERE id = $1', [id]);
  },

  /** Adds the names that are new for this subject; returns how many were added. */
  async insertTopics(db: Queryable, subjectId: string, names: string[]): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO topics (subject_id, name)
       SELECT $1, n FROM (SELECT DISTINCT unnest($2::text[]) AS n) x
        WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.subject_id = $1 AND lower(t.name) = lower(x.n))`,
      [subjectId, names],
    );
    return rowCount ?? 0;
  },

  async renameTopic(db: Queryable, id: string, name: string): Promise<void> {
    await db.query('UPDATE topics SET name = $2 WHERE id = $1', [id, name]);
  },

  async deleteTopic(db: Queryable, id: string): Promise<void> {
    await db.query('DELETE FROM topics WHERE id = $1', [id]);
  },

  // Templates -----------------------------------------------------------------------
  async templates(db: Queryable, examId: string): Promise<TemplateRow[]> {
    const { rows } = await db.query<TemplateRow>(
      `${TEMPLATE_SELECT} WHERE t.exam_id = $1
        ORDER BY s.display_order, t.name, t.version DESC`,
      [examId],
    );
    return rows;
  },

  async template(db: Queryable, id: string, lock = false): Promise<TemplateRow | undefined> {
    const { rows } = await db.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE t.id = $1${lock ? ' FOR UPDATE OF t' : ''}`, [id]);
    return rows[0];
  },

  async sections(db: Queryable, templateId: string): Promise<SectionRow[]> {
    const { rows } = await db.query<SectionRow>(
      `SELECT id, name, subject_id, section_order, question_count, duration_seconds, positive_marks, negative_marks, target_topic_counts
         FROM exam_template_sections WHERE template_id = $1 ORDER BY section_order`,
      [templateId],
    );
    return rows;
  },

  /** A newer template (draft or published) that replaces this one, if any. */
  async successor(db: Queryable, templateId: string): Promise<{ id: string; published_at: Date | null } | undefined> {
    const { rows } = await db.query<{ id: string; published_at: Date | null }>(
      'SELECT id, published_at FROM exam_templates WHERE supersedes_template_id = $1 ORDER BY created_at DESC LIMIT 1',
      [templateId],
    );
    return rows[0];
  },

  async insertTemplate(
    db: Queryable,
    examId: string,
    v: TemplateFieldsInsert,
    lineage: { version: number; supersedes: string | null } = { version: 1, supersedes: null },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO exam_templates (exam_id, stage_id, name, total_questions, total_duration_seconds, has_sectional_timing,
                                   default_positive_marks, default_negative_marks, version, supersedes_template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [examId, v.stageId, v.name, v.totalQuestions, v.totalDurationSeconds, v.hasSectionalTiming, v.defaultPositiveMarks, v.defaultNegativeMarks, lineage.version, lineage.supersedes],
    );
    return rows[0]!.id;
  },

  /** Updates a draft that is still at `expectedUpdatedAt`; false otherwise. */
  async updateDraft(db: Queryable, id: string, expectedUpdatedAt: string, v: TemplateFieldsInsert): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE exam_templates SET stage_id = $3, name = $4, total_questions = $5, total_duration_seconds = $6,
              has_sectional_timing = $7, default_positive_marks = $8, default_negative_marks = $9
        WHERE id = $1 AND published_at IS NULL AND ${SAME_VERSION('updated_at', '$2')}`,
      [id, expectedUpdatedAt, v.stageId, v.name, v.totalQuestions, v.totalDurationSeconds, v.hasSectionalTiming, v.defaultPositiveMarks, v.defaultNegativeMarks],
    );
    return rowCount === 1;
  },

  async replaceSections(db: Queryable, templateId: string, sections: SectionInsert[]): Promise<void> {
    await db.query('DELETE FROM exam_template_sections WHERE template_id = $1', [templateId]);
    for (const [i, s] of sections.entries()) {
      await db.query(
        `INSERT INTO exam_template_sections (template_id, subject_id, name, section_order, question_count, duration_seconds,
                                             positive_marks, negative_marks, target_topic_counts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [templateId, s.subjectId, s.name, i + 1, s.questionCount, s.durationSeconds, s.positiveMarks, s.negativeMarks, JSON.stringify(s.targetTopicCounts)],
      );
    }
  },

  async publish(db: Queryable, id: string): Promise<void> {
    await db.query('UPDATE exam_templates SET published_at = now(), is_active = true WHERE id = $1', [id]);
  },

  async setTemplateActive(db: Queryable, id: string, active: boolean): Promise<void> {
    await db.query('UPDATE exam_templates SET is_active = $2 WHERE id = $1', [id, active]);
  },

  async deleteTemplate(db: Queryable, id: string): Promise<void> {
    await db.query('DELETE FROM exam_templates WHERE id = $1', [id]);
  },

  /** Topic ids of an exam, by subject, for checking topic targets. */
  async topicSubjects(db: Queryable, examId: string): Promise<Map<string, string>> {
    const { rows } = await db.query<{ id: string; subject_id: string }>(
      'SELECT t.id, t.subject_id FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE s.exam_id = $1',
      [examId],
    );
    return new Map(rows.map((r) => [r.id, r.subject_id]));
  },

  // History -------------------------------------------------------------------------
  /**
   * Admin changes to this exam and its stages, syllabus and templates, newest first.
   * Template sections are replaced on every draft save, so their rows stay in the audit
   * table but are summarised by the template's own entry here.
   */
  async history(db: Queryable, examId: string, limit: number): Promise<AuditRow[]> {
    const { rows } = await db.query<AuditRow>(
      `SELECT l.id, l.created_at, l.action_name, l.target_table, l.target_record_id,
              p.id AS actor_id, p.full_name AS actor_name, p.email AS actor_email,
              COALESCE((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(l.after_state) k
                         WHERE l.before_state IS NOT NULL AND k NOT IN ('updated_at')
                           AND l.before_state -> k IS DISTINCT FROM l.after_state -> k), '{}') AS changed
         FROM admin_audit_logs l JOIN profiles p ON p.id = l.admin_id
        WHERE l.target_table IN ('exams', 'exam_stages', 'subjects', 'topics', 'exam_templates')
          AND (l.target_record_id = $1
               OR COALESCE(l.after_state, l.before_state) ->> 'exam_id' = $1::text
               OR (l.target_table = 'topics' AND COALESCE(l.after_state, l.before_state) ->> 'subject_id'
                     IN (SELECT id::text FROM subjects WHERE exam_id = $1)))
        ORDER BY l.created_at DESC, l.id DESC LIMIT $2`,
      [examId, limit],
    );
    return rows;
  },
};
