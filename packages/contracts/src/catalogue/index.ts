import { z } from 'zod';
import { Language } from '../identity/index.js';

/*
 * Public catalogue reads (API_CONTRACTS: GET /exams, /exams/:id, /tests, /tests/:id,
 * /series/:id, /examiners/:id). Published metadata only: no questions, keys, solutions,
 * examiner contact, KYC or payout fields. Money is integer paise; times are UTC ISO strings.
 * Path ids accept the UUID or the slug.
 */

const Paise = z.number().int().nonnegative();
const IsoTime = z.iso.datetime({ offset: true });

export const TestType = z.enum(['mock', 'sectional', 'pyq', 'live']);
export type TestType = z.infer<typeof TestType>;

export const TestAccess = z.enum(['free', 'paid']);
export type TestAccess = z.infer<typeof TestAccess>;

export const ExaminerTier = z.enum(['new', 'verified', 'top']);
export type ExaminerTier = z.infer<typeof ExaminerTier>;

export const ExamRef = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });
export type ExamRef = z.infer<typeof ExamRef>;

export const ImportantDate = z.object({ label: z.string(), date: z.string() });
export type ImportantDate = z.infer<typeof ImportantDate>;

export const ExamSummary = ExamRef.extend({
  category: z.object({ name: z.string(), slug: z.string() }),
  stage: z.string().nullable(),
  lastCutoffScore: z.number().nullable(),
  nextDate: ImportantDate.nullable(),
  liveTestCount: z.number().int().nonnegative(),
  freeTestCount: z.number().int().nonnegative(),
});
export type ExamSummary = z.infer<typeof ExamSummary>;

export const ExamList = z.object({ items: z.array(ExamSummary) });
export type ExamList = z.infer<typeof ExamList>;

export const PatternSection = z.object({
  name: z.string(),
  questionCount: z.number().int().positive(),
  durationSeconds: z.number().int().positive().nullable(),
  positiveMarks: z.number(),
  negativeMarks: z.number(),
});
export type PatternSection = z.infer<typeof PatternSection>;

export const ExamDetail = ExamSummary.extend({
  syllabusMarkdown: z.string().nullable(),
  importantDates: z.array(ImportantDate),
  subjects: z.array(z.string()),
  /** The admin's official-pattern template, when one is active. */
  pattern: z
    .object({
      name: z.string(),
      totalQuestions: z.number().int().positive(),
      durationSeconds: z.number().int().positive(),
      sectionalTiming: z.boolean(),
      sections: z.array(PatternSection),
    })
    .nullable(),
});
export type ExamDetail = z.infer<typeof ExamDetail>;

export const ExaminerCard = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  tier: ExaminerTier,
  followerCount: z.number().int().nonnegative(),
});
export type ExaminerCard = z.infer<typeof ExaminerCard>;
export const ExaminerList = z.object({ items: z.array(ExaminerCard) });
export type ExaminerList = z.infer<typeof ExaminerList>;

export const TestSummary = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  type: TestType,
  exam: ExamRef,
  examiner: ExaminerCard,
  seriesId: z.uuid().nullable(),
  access: TestAccess,
  pricePaise: Paise,
  languages: z.array(Language),
  totalQuestions: z.number().int().positive(),
  durationSeconds: z.number().int().positive(),
  totalMarks: z.number(),
  attemptsCount: z.number().int().nonnegative(),
  isFeatured: z.boolean(),
  publishedAt: IsoTime.nullable(),
});
export type TestSummary = z.infer<typeof TestSummary>;

/** GET /v1/tests. Newest first; pass nextCursor back as cursor for the next page. */
export const TestListQuery = z.strictObject({
  exam: z.string().trim().min(1).max(120).optional(),
  examiner: z.uuid().optional(),
  type: TestType.optional(),
  access: TestAccess.optional(),
  featured: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(2).max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type TestListQuery = z.infer<typeof TestListQuery>;

export const TestList = z.object({ items: z.array(TestSummary), nextCursor: z.string().nullable() });
export type TestList = z.infer<typeof TestList>;

export const SeriesSummary = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  exam: ExamRef,
  pricePaise: Paise,
  validityDays: z.number().int().positive(),
  plannedTests: z.number().int().nonnegative(),
  publishedTests: z.number().int().nonnegative(),
});
export type SeriesSummary = z.infer<typeof SeriesSummary>;

export const TestDetail = TestSummary.extend({
  sections: z.array(PatternSection),
  series: SeriesSummary.nullable(),
});
export type TestDetail = z.infer<typeof TestDetail>;

export const SeriesDetail = SeriesSummary.extend({
  description: z.string().nullable(),
  syllabusCoverage: z.string().nullable(),
  examiner: ExaminerCard,
  tests: z.array(TestSummary),
});
export type SeriesDetail = z.infer<typeof SeriesDetail>;

export const ExaminerDetail = ExaminerCard.extend({
  accountType: z.enum(['individual', 'institute']),
  instituteName: z.string().nullable(),
  bio: z.string().nullable(),
  experienceYears: z.number().int().nonnegative().nullable(),
  exams: z.array(ExamRef),
  series: z.array(SeriesSummary),
  /** Most recent published tests; use GET /v1/tests?examiner= for the full list. */
  recentTests: z.array(TestSummary),
});
export type ExaminerDetail = z.infer<typeof ExaminerDetail>;

/** GET /v1/me/following: examiners the student follows and their newest published tests. */
export const FollowingFeed = z.object({
  examiners: z.array(ExaminerCard),
  tests: z.array(TestSummary),
});
export type FollowingFeed = z.infer<typeof FollowingFeed>;
