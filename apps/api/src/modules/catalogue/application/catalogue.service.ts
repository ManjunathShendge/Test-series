import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type Queryable } from '@exam-prep/db';
import type {
  FollowingFeed,
  ExamDetail,
  ExaminerCard,
  ExaminerDetail,
  ExamList,
  ExamSummary,
  ImportantDate,
  PatternSection,
  SeriesDetail,
  SeriesSummary,
  TestDetail,
  TestList,
  TestListQuery,
  TestSummary,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import {
  catalogueRepository as repo,
  type ExaminerCardRow,
  type ExamRow,
  type SectionRow,
  type SeriesRow,
  type TestRow,
} from '../repositories/catalogue.repository.js';

const FEED_TESTS = 20;
const RECENT_TESTS = 12;
const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** Admin-entered dates; malformed entries are dropped rather than failing the page. */
function importantDates(raw: unknown): ImportantDate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d) =>
    d && typeof d === 'object' && typeof d.label === 'string' && typeof d.date === 'string' ? [{ label: d.label, date: d.date }] : [],
  );
}

function nextDate(dates: ImportantDate[], today = new Date().toISOString().slice(0, 10)): ImportantDate | null {
  return dates.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

const toExamSummary = (row: ExamRow): ExamSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  category: { name: row.category_name, slug: row.category_slug },
  stage: row.stage,
  lastCutoffScore: num(row.last_cutoff_score),
  nextDate: nextDate(importantDates(row.important_dates)),
  liveTestCount: row.live_tests,
  freeTestCount: row.free_tests,
});

const toSection = (row: SectionRow): PatternSection => ({
  name: row.name,
  questionCount: row.question_count,
  durationSeconds: row.duration_seconds,
  positiveMarks: Number(row.positive_marks),
  negativeMarks: Number(row.negative_marks),
});

const toCard = (row: ExaminerCardRow): ExaminerCard => ({
  id: row.examiner_id,
  name: row.full_name,
  avatarUrl: row.avatar_url,
  tier: row.tier,
  followerCount: row.follower_count,
});

const toSeriesSummary = (row: SeriesRow): SeriesSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  exam: { id: row.exam_id, slug: row.exam_slug, name: row.exam_name },
  pricePaise: row.price_paise,
  validityDays: row.validity_days,
  plannedTests: row.total_planned_tests,
  publishedTests: row.published_tests,
});

const toTestSummary = (row: TestRow, examiner: ExaminerCard): TestSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  type: row.test_type,
  exam: { id: row.exam_id, slug: row.exam_slug, name: row.exam_name },
  examiner,
  seriesId: row.series_id,
  access: row.access_type === 'free' ? 'free' : 'paid',
  pricePaise: row.price_paise,
  languages: row.has_hindi ? ['en', 'hi'] : ['en'],
  totalQuestions: row.total_questions,
  durationSeconds: row.total_duration_seconds,
  totalMarks: Number(row.total_marks),
  attemptsCount: row.attempts_count,
  isFeatured: row.is_admin_featured_free,
  publishedAt: row.published_at?.toISOString() ?? null,
});

/** Opaque keyset cursor: base64url of [publishedAt, id]. */
const encodeCursor = (row: TestRow) =>
  Buffer.from(JSON.stringify([row.published_at?.toISOString() ?? new Date(0).toISOString(), row.id])).toString('base64url');

function decodeCursor(cursor: string): { publishedAt: string; id: string } {
  try {
    const [publishedAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown[];
    if (typeof publishedAt === 'string' && !Number.isNaN(Date.parse(publishedAt)) && typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
      return { publishedAt, id };
    }
  } catch {
    // fall through
  }
  throw new ApiError(400, 'VALIDATION_FAILED', 'The request is not valid', { issues: [{ path: 'cursor', message: 'Invalid cursor' }] });
}

/**
 * Public, unauthenticated catalogue. Runs as the API role without a user context, so the
 * tests policy shows only scheduled/live rows; the repository narrows that to live tests of
 * active exams by approved examiners, and serializers are positive allowlists.
 */
@Injectable()
export class CatalogueService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listExams(): Promise<ExamList> {
    return { items: (await repo.listExams(this.db)).map(toExamSummary) };
  }

  async listExaminerCards(): Promise<{ items: ExaminerCard[] }> {
    return { items: (await repo.listExaminerCards(this.db)).map(toCard) };
  }

  async getExam(key: string): Promise<ExamDetail> {
    const row = await repo.findExam(this.db, key);
    if (!row) throw notFound('Exam');
    const [subjects, template] = await Promise.all([repo.examSubjects(this.db, row.id), repo.examTemplate(this.db, row.id)]);
    return {
      ...toExamSummary(row),
      syllabusMarkdown: row.syllabus_markdown,
      importantDates: importantDates(row.important_dates),
      subjects,
      pattern: template
        ? {
            name: template.template.name,
            totalQuestions: template.template.total_questions,
            durationSeconds: template.template.total_duration_seconds,
            sectionalTiming: template.template.has_sectional_timing,
            sections: template.sections.map(toSection),
          }
        : null,
    };
  }

  async listTests(query: TestListQuery): Promise<TestList> {
    const rows = await repo.listTests(this.db, {
      exam: query.exam,
      examiner: query.examiner,
      type: query.type,
      access: query.access,
      featured: query.featured === undefined ? undefined : query.featured === 'true',
      q: query.q,
      after: query.cursor ? decodeCursor(query.cursor) : undefined,
      limit: query.limit,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.withExaminers(this.db, page),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  async getTest(key: string): Promise<TestDetail> {
    const row = await repo.findTest(this.db, key);
    if (!row) throw notFound('Test');
    const [[summary], sections, series] = await Promise.all([
      this.withExaminers(this.db, [row]),
      repo.testSections(this.db, row.id),
      row.series_id ? repo.seriesByIds(this.db, [row.series_id]) : Promise.resolve([]),
    ]);
    if (!summary) throw notFound('Test');
    return { ...summary, sections: sections.map(toSection), series: series[0] ? toSeriesSummary(series[0]) : null };
  }

  async getSeries(key: string): Promise<SeriesDetail> {
    const row = await repo.findSeries(this.db, key);
    if (!row) throw notFound('Series');
    const [cards, tests] = await Promise.all([
      repo.examinerCards(this.db, [row.examiner_id]),
      repo.listTests(this.db, { series: row.id, limit: 100 }),
    ]);
    if (!cards[0]) throw notFound('Series');
    const examiner = toCard(cards[0]);
    return {
      ...toSeriesSummary(row),
      description: row.description,
      syllabusCoverage: row.syllabus_coverage,
      examiner,
      // Oldest first inside a series, so the order matches how the series was released.
      tests: tests.slice(0, 100).reverse().map((t) => toTestSummary(t, examiner)),
    };
  }

  async getExaminer(id: string): Promise<ExaminerDetail> {
    const [card] = await repo.examinerCards(this.db, [id]);
    if (!card) throw notFound('Examiner');
    const [exams, series, tests] = await Promise.all([
      repo.examRefs(this.db, card.exam_ids ?? []),
      repo.seriesForExaminer(this.db, id),
      repo.listTests(this.db, { examiner: id, limit: RECENT_TESTS }),
    ]);
    const examiner = toCard(card);
    return {
      ...examiner,
      accountType: card.account_type,
      instituteName: card.institute_name,
      bio: card.bio,
      experienceYears: card.experience_years,
      exams,
      series: series.map(toSeriesSummary),
      recentTests: tests.slice(0, RECENT_TESTS).map((t) => toTestSummary(t, examiner)),
    };
  }

  /** Examiners the student follows (still public ones only) and their newest published tests. */
  async following(studentId: string): Promise<FollowingFeed> {
    return withUser(this.db, studentId, async (client) => {
      const ids = await repo.followedIds(client, studentId);
      if (ids.length === 0) return { examiners: [], tests: [] };
      const cards = await repo.examinerCards(client, ids);
      const order = new Map(ids.map((id, i) => [id, i]));
      const rows = await repo.listTests(client, { examiners: cards.map((c) => c.examiner_id), limit: FEED_TESTS });
      return {
        examiners: cards.sort((a, b) => order.get(a.examiner_id)! - order.get(b.examiner_id)!).map(toCard),
        tests: await this.withExaminers(client, rows.slice(0, FEED_TESTS)),
      };
    });
  }

  /** Follows an approved, public examiner. Idempotent; following yourself is refused. */
  async follow(studentId: string, examinerId: string): Promise<void> {
    if (studentId === examinerId) throw new ApiError(400, 'VALIDATION_FAILED', 'You cannot follow yourself');
    await withUser(this.db, studentId, async (client) => {
      if ((await repo.examinerCards(client, [examinerId])).length === 0) throw notFound('Examiner');
      await repo.follow(client, studentId, examinerId);
    });
  }

  async unfollow(studentId: string, examinerId: string): Promise<void> {
    await withUser(this.db, studentId, (client) => repo.unfollow(client, studentId, examinerId));
  }

  /** Attaches public examiner cards; a test whose examiner is no longer public is left out. */
  private async withExaminers(db: Queryable, rows: TestRow[]): Promise<TestSummary[]> {
    const cards = new Map((await repo.examinerCards(db, rows.map((r) => r.examiner_id))).map((c) => [c.examiner_id, toCard(c)]));
    return rows.flatMap((r) => {
      const card = cards.get(r.examiner_id);
      return card ? [toTestSummary(r, card)] : [];
    });
  }
}
