/**
 * Demo data model. Shapes mirror the read models described in
 * docs/API_CONTRACTS.md and docs/DATA_MODEL.md so screens built against these
 * types swap to real responses without a rewrite. Money is integer paise.
 *
 * Student paper payloads never carry keys or solutions (invariant 3). Review
 * material lives in a separate `solutions` module that is only read after a
 * demo attempt reaches a terminal state.
 */

export type Language = 'en' | 'hi';

export interface Bilingual {
  en: string;
  hi?: string;
}

export interface Exam {
  id: string;
  name: string;
  shortName: string;
  category: string;
  /** Short official pattern summary shown on the exam page. */
  pattern: string;
  /** Admin-entered syllabus headings. */
  syllabus: string[];
  nextDate?: string;
  lastCutoff?: number;
  testCount: number;
  followerCount: number;
}

export type ExaminerTier = 'new' | 'verified' | 'top';

export interface Examiner {
  id: string;
  name: string;
  credentials: string;
  bio: string;
  tier: ExaminerTier;
  followers: number;
  publishedTests: number;
  examIds: string[];
  isFollowed: boolean;
}

/** Which pool of the demo question bank a section draws from. */
export type BankKey = 'reasoning' | 'ga' | 'quant' | 'english';

export interface Section {
  id: string;
  name: Bilingual;
  bankKey: BankKey;
  questionCount: number;
  durationMinutes?: number;
  marksPerQuestion: number;
  negativeMarks: number;
}

export type TestAvailability = 'free' | 'paid' | 'owned';

export interface TestSummary {
  id: string;
  examId: string;
  examinerId: string;
  seriesId?: string;
  title: string;
  kind: 'full-mock' | 'sectional' | 'pyq';
  languages: Language[];
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  pricePaise: number;
  availability: TestAvailability;
  attempts: number;
  isFeatured?: boolean;
  publishedAt: string;
  sections: Section[];
  instructions: string[];
}

export interface Series {
  id: string;
  examId: string;
  examinerId: string;
  title: string;
  description: string;
  testIds: string[];
  pricePaise: number;
  validityDays: number;
  syllabusCoverage: number;
  owned: boolean;
}

export interface Option {
  id: string;
  text: Bilingual;
}

/** Key-free question as delivered in a student paper. */
export interface PaperQuestion {
  id: string;
  sectionId: string;
  stem: Bilingual;
  passage?: Bilingual;
  options: Option[];
  topic: string;
}

export interface Paper {
  testId: string;
  questions: PaperQuestion[];
}

export type PaletteState = 'unvisited' | 'visited' | 'answered' | 'marked' | 'markedAnswered';

export interface AnswerState {
  selectedOptionId?: string;
  marked: boolean;
  visited: boolean;
  timeSpentMs: number;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface SectionResult {
  sectionId: string;
  name: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  timeSpentMinutes: number;
}

export interface QuestionReview {
  questionId: string;
  selectedOptionId?: string;
  correctOptionId: string;
  isCorrect: boolean;
  solution: Bilingual;
  yourTimeSeconds: number;
  averageTimeSeconds: number;
  percentCorrect: number;
  bookmarked: boolean;
}

export interface Result {
  attemptId: string;
  testId: string;
  status: AttemptStatus;
  completedAt: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  rank: number;
  cohortSize: number;
  percentile: number;
  topperScore: number;
  averageScore: number;
  sections: SectionResult[];
  review: QuestionReview[];
}

export interface TopicStrength {
  topic: string;
  examId: string;
  attempted: number;
  accuracy: number;
}

export interface ScorePoint {
  date: string;
  score: number;
  maxScore: number;
  testTitle: string;
}

export interface Purchase {
  id: string;
  title: string;
  kind: 'test' | 'series';
  amountPaise: number;
  purchasedAt: string;
  channel: 'Google Play' | 'App Store' | 'Web';
  invoiceNumber: string;
  /** GST included in amountPaise, as printed on the invoice. */
  gstPaise?: number;
  /** Applied code and the discount it produced, for the invoice line. */
  couponCode?: string;
  discountPaise?: number;
}

export interface Profile {
  name: string;
  email: string;
  targetExamIds: string[];
  language: Language;
  preparationStage: 'starting' | 'revising' | 'final-lap';
  deviceCount: number;
}

/** Durable in-progress attempt that Home surfaces as "Continue". */
export interface ContinueAttempt {
  attemptId: string;
  testId: string;
  answeredCount: number;
  remainingSeconds: number;
  lastSavedAt: string;
}
