import { z } from 'zod';
import { ReportReason } from '../qc/index.js';

// Attempt engine (PRD 6.4, TEST_ENGINE.md). The server decides time, section windows and score;
// the paper never carries keys or solutions.

const IsoTime = z.iso.datetime({ offset: true });
export const AttemptOption = z.enum(['A', 'B', 'C', 'D']);
export type AttemptOption = z.infer<typeof AttemptOption>;
export const AttemptStatus = z.enum(['in_progress', 'submitted', 'timed_out', 'abandoned']);
export type AttemptStatus = z.infer<typeof AttemptStatus>;
export const PaletteState = z.enum(['not_visited', 'not_answered', 'answered', 'marked_for_review', 'answered_and_marked']);
export type PaletteState = z.infer<typeof PaletteState>;

/** Header carrying the attempt session secret (one writer per attempt). */
export const ATTEMPT_SESSION_HEADER = 'x-attempt-session';

export const StartAttemptRequest = z.strictObject({
  testId: z.uuid(),
  /** PRD 6.4: the student ticked "I have read the instructions". */
  instructionsAccepted: z.literal(true),
});
export type StartAttemptRequest = z.infer<typeof StartAttemptRequest>;

export const AttemptSection = z.object({
  id: z.uuid(),
  name: z.string(),
  order: z.number().int(),
  questionCount: z.number().int(),
  positiveMarks: z.number(),
  negativeMarks: z.number(),
  /** Seconds for this section when the test has sectional timing; null shares the test timer. */
  durationSeconds: z.number().int().nullable(),
  opensAt: IsoTime.nullable(),
  closesAt: IsoTime.nullable(),
  closedAt: IsoTime.nullable(),
  state: z.enum(['upcoming', 'open', 'closed']),
});
export type AttemptSection = z.infer<typeof AttemptSection>;

export const AttemptAnswer = z.object({
  testQuestionId: z.uuid(),
  selected: AttemptOption.nullable(),
  marked: z.boolean(),
  visited: z.boolean(),
  timeMs: z.number().int().nonnegative(),
});
export type AttemptAnswer = z.infer<typeof AttemptAnswer>;

export const AttemptState = z.object({
  attemptId: z.uuid(),
  testId: z.uuid(),
  testTitle: z.string(),
  testSlug: z.string(),
  examName: z.string(),
  hasHindi: z.boolean(),
  status: AttemptStatus,
  attemptNumber: z.number().int(),
  startedAt: IsoTime,
  expiresAt: IsoTime,
  serverNow: IsoTime,
  sectional: z.boolean(),
  sections: z.array(AttemptSection),
  currentTestQuestionId: z.uuid().nullable(),
  epoch: z.number().int(),
  ackSeq: z.number().int(),
  answers: z.array(AttemptAnswer),
  /** Short id shown faintly on question screens (PRD 12 content protection). */
  watermark: z.string(),
});
export type AttemptState = z.infer<typeof AttemptState>;

/** Start or takeover: the state plus the session secret, which the device keeps. */
export const AttemptSession = z.object({ state: AttemptState, sessionToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export type AttemptSession = z.infer<typeof AttemptSession>;

export const PaperOption = z.object({ id: AttemptOption, textEn: z.string(), textHi: z.string().optional() });
export const PaperQuestion = z.object({
  testQuestionId: z.uuid(),
  sectionId: z.uuid(),
  number: z.number().int(),
  stemEn: z.string(),
  stemHi: z.string().nullable(),
  passageEn: z.string().nullable(),
  passageHi: z.string().nullable(),
  options: z.array(PaperOption),
  imageAssetIds: z.array(z.uuid()),
  positiveMarks: z.number(),
  negativeMarks: z.number(),
});
export type PaperQuestion = z.infer<typeof PaperQuestion>;
export const AttemptPaper = z.object({ questions: z.array(PaperQuestion) });
export type AttemptPaper = z.infer<typeof AttemptPaper>;

/** One durable change, numbered per session epoch. `answer` carries the full snapshot. */
export const AttemptEvent = z.discriminatedUnion('kind', [
  z.strictObject({
    seq: z.number().int().min(1),
    kind: z.literal('answer'),
    testQuestionId: z.uuid(),
    selected: AttemptOption.nullable(),
    marked: z.boolean(),
    visited: z.boolean(),
    timeMs: z.number().int().min(0).max(86_400_000),
  }),
  z.strictObject({ seq: z.number().int().min(1), kind: z.literal('next_section'), fromSectionId: z.uuid() }),
  z.strictObject({ seq: z.number().int().min(1), kind: z.literal('focus_lost') }),
]);
export type AttemptEvent = z.infer<typeof AttemptEvent>;

export const SyncAttemptRequest = z.strictObject({
  epoch: z.number().int().min(1),
  lastAckSeq: z.number().int().min(0),
  events: z.array(AttemptEvent).max(200),
  currentTestQuestionId: z.uuid().nullable().optional(),
});
export type SyncAttemptRequest = z.infer<typeof SyncAttemptRequest>;

export const SyncAttemptResponse = z.object({
  ackSeq: z.number().int(),
  /** Events received but not applied, with the reason (for example the section had closed). */
  rejected: z.array(z.object({ seq: z.number().int(), reason: z.string() })),
  status: AttemptStatus,
  serverNow: IsoTime,
  expiresAt: IsoTime,
  sections: z.array(AttemptSection),
});
export type SyncAttemptResponse = z.infer<typeof SyncAttemptResponse>;

export const SubmitAttemptRequest = SyncAttemptRequest;
export type SubmitAttemptRequest = SyncAttemptRequest;

export const AttemptSummary = z.object({
  attemptId: z.uuid(),
  testTitle: z.string(),
  testSlug: z.string(),
  status: AttemptStatus,
  submittedAt: IsoTime.nullable(),
  score: z.number(),
  maxScore: z.number(),
  attempted: z.number().int(),
  correct: z.number().int(),
  incorrect: z.number().int(),
  skipped: z.number().int(),
  totalQuestions: z.number().int(),
  rank: z.number().int().nullable(),
  percentile: z.number().nullable(),
  rankedAttempts: z.number().int(),
  sections: z.array(
    z.object({
      sectionId: z.uuid(),
      name: z.string(),
      score: z.number(),
      maxScore: z.number(),
      correct: z.number().int(),
      incorrect: z.number().int(),
      attempted: z.number().int(),
      total: z.number().int(),
    }),
  ),
  /** Events that reached the server after time ran out and were not counted. */
  lateEvents: z.number().int(),
});
export type AttemptSummary = z.infer<typeof AttemptSummary>;

export const MyAttempt = z.object({
  attemptId: z.uuid(),
  testId: z.uuid(),
  testTitle: z.string(),
  testSlug: z.string(),
  status: AttemptStatus,
  startedAt: IsoTime,
  expiresAt: IsoTime,
  submittedAt: IsoTime.nullable(),
  score: z.number(),
  totalQuestions: z.number().int(),
});
export type MyAttempt = z.infer<typeof MyAttempt>;
export const MyAttemptList = z.object({ items: z.array(MyAttempt) });
export type MyAttemptList = z.infer<typeof MyAttemptList>;

// ---------------------------------------------------------------------------------------------
// Results, solution review, progress and practice lists (M8, docs/RESULTS.md). Only closed
// attempts open these; keys and solutions never travel before the attempt is closed.

export const ReviewQuestion = z.object({
  testQuestionId: z.uuid(),
  questionId: z.uuid(),
  sectionId: z.uuid(),
  number: z.number().int(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  stemEn: z.string(),
  stemHi: z.string().nullable(),
  passageEn: z.string().nullable(),
  passageHi: z.string().nullable(),
  options: z.array(PaperOption),
  imageAssetIds: z.array(z.uuid()),
  positiveMarks: z.number(),
  negativeMarks: z.number(),
  selected: AttemptOption.nullable(),
  /** Null when not answered. */
  isCorrect: z.boolean().nullable(),
  marksAwarded: z.number(),
  timeSeconds: z.number().int(),
  marked: z.boolean(),
  correctOption: AttemptOption,
  /** The key was corrected after the test was published; the score uses the corrected key. */
  keyCorrected: z.boolean(),
  solutionEn: z.string().nullable(),
  solutionHi: z.string().nullable(),
  /** First attempts by all students: how many answered, how many were right, average time. */
  cohort: z.object({ attempted: z.number().int(), correct: z.number().int(), avgSeconds: z.number().nullable() }),
  bookmarked: z.boolean(),
  inNotebook: z.boolean(),
  reported: z.boolean(),
});
export type ReviewQuestion = z.infer<typeof ReviewQuestion>;

/** Fewer first attempts than this and comparisons show "not enough data yet". */
export const MIN_COHORT = 3;

export const AttemptReview = z.object({
  summary: AttemptSummary,
  /** Seconds the student spent from start to submit. */
  timeSeconds: z.number().int(),
  cohort: z.object({
    size: z.number().int(),
    averageScore: z.number().nullable(),
    topperScore: z.number().nullable(),
    averageSeconds: z.number().nullable(),
  }),
  questions: z.array(ReviewQuestion),
});
export type AttemptReview = z.infer<typeof AttemptReview>;

export const SaveQuestionRequest = z
  .strictObject({ bookmarked: z.boolean().optional(), inNotebook: z.boolean().optional() })
  .refine((v) => v.bookmarked !== undefined || v.inNotebook !== undefined, 'Nothing to change');
export type SaveQuestionRequest = z.infer<typeof SaveQuestionRequest>;

export const PracticeKind = z.enum(['mistakes', 'bookmarks']);
export type PracticeKind = z.infer<typeof PracticeKind>;

export const PracticeItem = z.object({
  questionId: z.uuid(),
  testId: z.uuid(),
  testTitle: z.string(),
  /** The student's latest closed attempt with this question (for images and reports). */
  attemptId: z.uuid(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  stemEn: z.string(),
  stemHi: z.string().nullable(),
  passageEn: z.string().nullable(),
  passageHi: z.string().nullable(),
  options: z.array(PaperOption),
  imageAssetIds: z.array(z.uuid()),
  selected: AttemptOption.nullable(),
  correctOption: AttemptOption,
  solutionEn: z.string().nullable(),
  solutionHi: z.string().nullable(),
  bookmarked: z.boolean(),
  inNotebook: z.boolean(),
  savedAt: IsoTime,
});
export type PracticeItem = z.infer<typeof PracticeItem>;
export const PracticeList = z.object({ items: z.array(PracticeItem) });
export type PracticeList = z.infer<typeof PracticeList>;

export const TopicAccuracy = z.object({
  subject: z.string(),
  topic: z.string(),
  attempted: z.number().int(),
  correct: z.number().int(),
  total: z.number().int(),
  /** Correct out of attempted, 0-100; null before any attempt in the topic. */
  accuracy: z.number().nullable(),
});
export type TopicAccuracy = z.infer<typeof TopicAccuracy>;

export const MyProgress = z.object({
  totals: z.object({ tests: z.number().int(), questions: z.number().int(), attempted: z.number().int(), correct: z.number().int() }),
  topics: z.array(TopicAccuracy),
  /** Lowest accuracy among topics with at least 3 attempted questions. */
  weakest: TopicAccuracy.nullable(),
  trend: z.array(
    z.object({
      attemptId: z.uuid(),
      testTitle: z.string(),
      testSlug: z.string(),
      submittedAt: IsoTime,
      score: z.number(),
      maxScore: z.number(),
      percentage: z.number(),
    }),
  ),
  recommended: z.array(
    z.object({
      testId: z.uuid(),
      slug: z.string(),
      title: z.string(),
      examName: z.string(),
      totalQuestions: z.number().int(),
      durationSeconds: z.number().int(),
      pricePaise: z.number().int(),
    }),
  ),
});
export type MyProgress = z.infer<typeof MyProgress>;

export const ReportQuestionRequest = z.strictObject({
  attemptId: z.uuid(),
  reason: ReportReason,
  comment: z.string().trim().max(500).optional(),
});
export type ReportQuestionRequest = z.infer<typeof ReportQuestionRequest>;
export const ReportQuestionResponse = z.object({ reportId: z.uuid() });
export type ReportQuestionResponse = z.infer<typeof ReportQuestionResponse>;
