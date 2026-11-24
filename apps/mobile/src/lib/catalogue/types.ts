/**
 * Screen models for catalogue data. `lib/api/queries.ts` maps API responses (contracts) into
 * these shapes. Money is integer paise.
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
}

export interface Section {
  id: string;
  name: Bilingual;
  questionCount: number;
  durationMinutes?: number;
  marksPerQuestion: number;
  negativeMarks: number;
}

export interface TestSummary {
  id: string;
  examId: string;
  examName: string;
  examinerId: string;
  examinerName: string;
  seriesId?: string;
  title: string;
  kind: 'full-mock' | 'sectional' | 'pyq';
  languages: Language[];
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  pricePaise: number;
  availability: 'free' | 'paid';
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
}

export interface SearchFilters {
  query?: string;
  examId?: string;
  kind?: TestSummary['kind'];
  /** Free, any paid, or a paid price band (PRD 6.2 price filter). */
  price?: 'free' | 'paid' | 'under50' | '50to200' | 'over200';
  language?: 'hi';
  examinerId?: string;
}

/** Optional student push notices (docs/NOTIFICATIONS.md). Transactional notices are always on. */
export interface NotificationPrefs {
  newTestsFromFollowed: boolean;
  unfinishedAttempt: boolean;
  examDateChanges: boolean;
}
