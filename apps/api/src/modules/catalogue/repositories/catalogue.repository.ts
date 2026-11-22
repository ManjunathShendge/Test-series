import type { Queryable } from '@exam-prep/db';

/*
 * Public catalogue reads. Parameterised SQL only, and only published rows: live tests of
 * active exams, published series, approved examiners. Questions are never read here.
 * NUMERIC columns arrive as strings and are converted by the service.
 */

export interface ExamRow {
  id: string;
  slug: string;
  name: string;
  category_name: string;
  category_slug: string;
  stage: string | null;
  last_cutoff_score: string | null;
  important_dates: unknown;
  syllabus_markdown: string | null;
  live_tests: number;
  free_tests: number;
}

export interface TemplateRow {
  name: string;
  total_questions: number;
  total_duration_seconds: number;
  has_sectional_timing: boolean;
}

export interface SectionRow {
  name: string;
  question_count: number;
  duration_seconds: number | null;
  positive_marks: string;
  negative_marks: string;
}

export interface TestRow {
  id: string;
  slug: string;
  title: string;
  test_type: 'mock' | 'sectional' | 'pyq' | 'live';
  access_type: 'free' | 'paid' | 'pass_included' | 'series_only';
  price_paise: number;
  has_hindi: boolean;
  total_questions: number;
  total_duration_seconds: number;
  total_marks: string;
  attempts_count: number;
  is_admin_featured_free: boolean;
  published_at: Date | null;
  series_id: string | null;
  examiner_id: string;
  exam_id: string;
  exam_slug: string;
  exam_name: string;
}

export interface SeriesRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  syllabus_coverage: string | null;
  price_paise: number;
  validity_days: number;
  total_planned_tests: number;
  published_tests: number;
  examiner_id: string;
  exam_id: string;
  exam_slug: string;
  exam_name: string;
}

export interface ExaminerCardRow {
  examiner_id: string;
  full_name: string;
  avatar_url: string | null;
  tier: 'new' | 'verified' | 'top';
  account_type: 'individual' | 'institute';
  institute_name: string | null;
  bio: string | null;
  experience_years: number | null;
  follower_count: number;
  exam_ids: string[];
}

export interface TestFilters {
  exam?: string | undefined;
  examiner?: string | undefined;
  series?: string | undefined;
  type?: string | undefined;
  access?: 'free' | 'paid' | undefined;
  featured?: boolean | undefined;
  q?: string | undefined;
  after?: { publishedAt: string; id: string } | undefined;
  limit: number;
}

const EXAM_SELECT = `
  SELECT e.id, e.slug, e.name, c.name AS category_name, c.slug AS category_slug,
         (SELECT s.name FROM exam_stages s WHERE s.exam_id = e.id ORDER BY s.display_order, s.name LIMIT 1) AS stage,
         e.last_cutoff_score, e.important_dates, e.syllabus_markdown,
         (SELECT count(*)::int FROM tests t WHERE t.exam_id = e.id AND t.status = 'live') AS live_tests,
         (SELECT count(*)::int FROM tests t WHERE t.exam_id = e.id AND t.status = 'live' AND t.access_type = 'free') AS free_tests
    FROM exams e JOIN exam_categories c ON c.id = e.category_id
   WHERE e.is_active AND c.is_active`;

const TEST_SELECT = `
  SELECT t.id, t.slug, t.title, t.test_type, t.access_type, t.price_paise, t.has_hindi, t.total_questions,
         t.total_duration_seconds, t.total_marks, t.attempts_count, t.is_admin_featured_free, t.published_at,
         t.series_id, t.examiner_id, e.id AS exam_id, e.slug AS exam_slug, e.name AS exam_name
    FROM tests t JOIN exams e ON e.id = t.exam_id
    JOIN examiner_profiles ep ON ep.user_id = t.examiner_id AND ep.onboarding_status = 'approved'
   WHERE t.status = 'live' AND e.is_active`;

const SERIES_SELECT = `
  SELECT s.id, s.slug, s.title, s.description, s.syllabus_coverage, s.price_paise, s.validity_days,
         s.total_planned_tests, s.examiner_id, e.id AS exam_id, e.slug AS exam_slug, e.name AS exam_name,
         (SELECT count(*)::int FROM tests t WHERE t.series_id = s.id AND t.status = 'live') AS published_tests
    FROM test_series s JOIN exams e ON e.id = s.exam_id
    JOIN examiner_profiles ep ON ep.user_id = s.examiner_id AND ep.onboarding_status = 'approved'
   WHERE s.is_published AND e.is_active`;

/** A path id matches either the UUID or the slug. */
const BY_KEY = (alias: string, param: string) => `(${alias}.slug = ${param} OR ${alias}.id::text = ${param})`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const catalogueRepository = {
  async listExams(db: Queryable): Promise<ExamRow[]> {
    const { rows } = await db.query<ExamRow>(`${EXAM_SELECT} ORDER BY c.display_order, c.name, e.name`);
    return rows;
  },

  async findExam(db: Queryable, key: string): Promise<ExamRow | undefined> {
    const { rows } = await db.query<ExamRow>(`${EXAM_SELECT} AND ${BY_KEY('e', '$1')}`, [key]);
    return rows[0];
  },

  async examSubjects(db: Queryable, examId: string): Promise<string[]> {
    const { rows } = await db.query<{ name: string }>('SELECT name FROM subjects WHERE exam_id = $1 ORDER BY name', [examId]);
    return rows.map((r) => r.name);
  },

  async examTemplate(db: Queryable, examId: string): Promise<{ template: TemplateRow; sections: SectionRow[] } | undefined> {
    const { rows } = await db.query<TemplateRow & { id: string }>(
      `SELECT t.id, t.name, t.total_questions, t.total_duration_seconds, t.has_sectional_timing
         FROM exam_templates t JOIN exam_stages s ON s.id = t.stage_id
        WHERE t.exam_id = $1 AND t.is_active AND t.published_at IS NOT NULL
        ORDER BY s.display_order, t.published_at DESC, t.id LIMIT 1`,
      [examId],
    );
    const template = rows[0];
    if (!template) return undefined;
    const sections = await db.query<SectionRow>(
      `SELECT name, question_count, duration_seconds, positive_marks, negative_marks
         FROM exam_template_sections WHERE template_id = $1 ORDER BY section_order`,
      [template.id],
    );
    return { template, sections: sections.rows };
  },

  async examRefs(db: Queryable, ids: string[]): Promise<{ id: string; slug: string; name: string }[]> {
    if (ids.length === 0) return [];
    const { rows } = await db.query<{ id: string; slug: string; name: string }>(
      'SELECT id, slug, name FROM exams WHERE id = ANY($1::uuid[]) AND is_active ORDER BY name',
      [ids],
    );
    return rows;
  },

  /** Newest first, keyset-paginated on (published_at, id). Returns limit + 1 rows to detect a next page. */
  async listTests(db: Queryable, f: TestFilters): Promise<TestRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (value: unknown) => `$${params.push(value)}`;
    if (f.exam) where.push(BY_KEY('e', add(f.exam)));
    if (f.examiner) where.push(`t.examiner_id = ${add(f.examiner)}`);
    if (f.series) where.push(`t.series_id = ${add(f.series)}`);
    if (f.type) where.push(`t.test_type = ${add(f.type)}`);
    if (f.access === 'free') where.push(`t.access_type = 'free'`);
    if (f.access === 'paid') where.push(`t.access_type <> 'free'`);
    if (f.featured !== undefined) where.push(`t.is_admin_featured_free = ${add(f.featured)}`);
    if (f.q) where.push(`(t.search_vector @@ plainto_tsquery('english', ${add(f.q)}) OR t.title ILIKE ${add(`%${escapeLike(f.q)}%`)})`);
    if (f.after) {
      where.push(`(COALESCE(t.published_at, 'epoch'), t.id) < (${add(f.after.publishedAt)}::timestamptz, ${add(f.after.id)}::uuid)`);
    }
    const { rows } = await db.query<TestRow>(
      `${TEST_SELECT} ${where.map((w) => `AND ${w}`).join(' ')}
       ORDER BY COALESCE(t.published_at, 'epoch') DESC, t.id DESC LIMIT ${add(f.limit + 1)}`,
      params,
    );
    return rows;
  },

  async findTest(db: Queryable, key: string): Promise<TestRow | undefined> {
    const { rows } = await db.query<TestRow>(`${TEST_SELECT} AND ${BY_KEY('t', '$1')}`, [key]);
    return rows[0];
  },

  async testSections(db: Queryable, testId: string): Promise<SectionRow[]> {
    const { rows } = await db.query<SectionRow>(
      `SELECT name, question_count, duration_seconds, positive_marks, negative_marks
         FROM test_sections WHERE test_id = $1 ORDER BY section_order`,
      [testId],
    );
    return rows;
  },

  async findSeries(db: Queryable, key: string): Promise<SeriesRow | undefined> {
    const { rows } = await db.query<SeriesRow>(`${SERIES_SELECT} AND ${BY_KEY('s', '$1')}`, [key]);
    return rows[0];
  },

  async seriesByIds(db: Queryable, ids: string[]): Promise<SeriesRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await db.query<SeriesRow>(`${SERIES_SELECT} AND s.id = ANY($1::uuid[])`, [ids]);
    return rows;
  },

  async seriesForExaminer(db: Queryable, examinerId: string): Promise<SeriesRow[]> {
    const { rows } = await db.query<SeriesRow>(`${SERIES_SELECT} AND s.examiner_id = $1 ORDER BY s.created_at DESC`, [examinerId]);
    return rows;
  },

  /** Public fields of approved examiners only (migration 006). */
  async examinerCards(db: Queryable, ids: string[]): Promise<ExaminerCardRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await db.query<ExaminerCardRow>('SELECT * FROM public_examiner_cards($1::uuid[])', [[...new Set(ids)]]);
    return rows;
  },
};
