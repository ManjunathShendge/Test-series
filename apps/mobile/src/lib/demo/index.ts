import { bank } from './bank';
import { examiners, exams, series, tests } from './catalogue';
import { cutoffOnTrendScale, pastResults, profile, purchases, scoreTrend, topicStrengths } from './history';
import { solutions } from './solutions';
import type { AnswerState, Exam, Examiner, Paper, PaperQuestion, QuestionReview, Result, SectionResult, Series, TestSummary } from './types';

export * from './types';
export * from './coupons';
export { cutoffOnTrendScale, exams, examiners, pastResults, profile, purchases, scoreTrend, series, tests, topicStrengths };

/**
 * Repository facade. Screens import from here and nowhere else in `demo/`, so
 * replacing this module with TanStack Query hooks over the real API is a
 * contained change.
 */

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));
const examIndex = byId(exams);
const examinerIndex = byId(examiners);
const testIndex = byId(tests);
const seriesIndex = byId(series);

export const getExam = (id: string): Exam | undefined => examIndex.get(id);
export const getExaminer = (id: string): Examiner | undefined => examinerIndex.get(id);
export const getTest = (id: string): TestSummary | undefined => testIndex.get(id);
export const getSeries = (id: string): Series | undefined => seriesIndex.get(id);

export const testsForExam = (examId: string): TestSummary[] => tests.filter((t) => t.examId === examId);
export const testsForExaminer = (examinerId: string): TestSummary[] => tests.filter((t) => t.examinerId === examinerId);
export const testsInSeries = (s: Series): TestSummary[] => s.testIds.map((id) => testIndex.get(id)).filter((t): t is TestSummary => !!t);
export const seriesForExam = (examId: string): Series[] => series.filter((s) => s.examId === examId);

export const featuredFreeTests = (): TestSummary[] => tests.filter((t) => t.availability === 'free');

/** Popular tests in target exams that the student has not attempted (PRD 6.2 rule). */
export function recommendedTests(targetExamIds: string[], attemptedTestIds: Set<string>): TestSummary[] {
  return tests
    .filter((t) => targetExamIds.includes(t.examId) && !attemptedTestIds.has(t.id))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 6);
}

export function newFromFollowed(followedExaminerIds: Set<string>): TestSummary[] {
  return tests
    .filter((t) => followedExaminerIds.has(t.examinerId))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 4);
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

export function searchTests(filters: SearchFilters): TestSummary[] {
  const q = filters.query?.trim().toLowerCase();
  return tests.filter((t) => {
    if (filters.examId && t.examId !== filters.examId) return false;
    if (filters.kind && t.kind !== filters.kind) return false;
    if (filters.price === 'free' && t.pricePaise !== 0) return false;
    if (filters.price === 'paid' && t.pricePaise === 0) return false;
    if (filters.price === 'under50' && (t.pricePaise === 0 || t.pricePaise >= 50_00)) return false;
    if (filters.price === '50to200' && (t.pricePaise < 50_00 || t.pricePaise > 200_00)) return false;
    if (filters.price === 'over200' && t.pricePaise <= 200_00) return false;
    if (filters.language === 'hi' && !t.languages.includes('hi')) return false;
    if (filters.examinerId && t.examinerId !== filters.examinerId) return false;
    if (q) {
      const examiner = examinerIndex.get(t.examinerId)?.name.toLowerCase() ?? '';
      const exam = examIndex.get(t.examId)?.name.toLowerCase() ?? '';
      if (!`${t.title} ${examiner} ${exam}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Assembles the key-free paper for a test from the bank, section by section. */
export function buildPaper(test: TestSummary): Paper {
  const questions: PaperQuestion[] = [];
  for (const section of test.sections) {
    const pool = bank[section.bankKey];
    for (const q of pool.slice(0, section.questionCount)) {
      questions.push({ ...q, sectionId: section.id });
    }
  }
  return { testId: test.id, questions };
}

/**
 * Demo-only scoring so the result screen has data without a server. The real
 * product scores on the server from pinned versions (docs/RESULTS.md); nothing
 * here can unlock content.
 */
export function scoreDemoAttempt(
  test: TestSummary,
  paper: Paper,
  answers: Record<string, AnswerState>,
  status: Result['status'],
  attemptId: string,
): Result {
  const sections: SectionResult[] = test.sections.map((section) => {
    const qs = paper.questions.filter((q) => q.sectionId === section.id);
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let timeMs = 0;
    for (const q of qs) {
      const a = answers[q.id];
      timeMs += a?.timeSpentMs ?? 0;
      if (!a?.selectedOptionId) {
        skipped += 1;
      } else if (a.selectedOptionId === solutions[q.id]?.correctOptionId) {
        correct += 1;
      } else {
        wrong += 1;
      }
    }
    const score = correct * section.marksPerQuestion - wrong * section.negativeMarks;
    const attemptedCount = correct + wrong;
    return {
      sectionId: section.id,
      name: section.name.en,
      score: Math.round(score * 100) / 100,
      maxScore: qs.length * section.marksPerQuestion,
      correct,
      wrong,
      skipped,
      accuracy: attemptedCount === 0 ? 0 : correct / attemptedCount,
      timeSpentMinutes: Math.round((timeMs / 60000) * 10) / 10,
    };
  });

  const score = Math.round(sections.reduce((s, x) => s + x.score, 0) * 100) / 100;
  const maxScore = sections.reduce((s, x) => s + x.maxScore, 0);
  const correct = sections.reduce((s, x) => s + x.correct, 0);
  const wrong = sections.reduce((s, x) => s + x.wrong, 0);
  const skipped = sections.reduce((s, x) => s + x.skipped, 0);

  const review: QuestionReview[] = paper.questions.map((q) => {
    const sol = solutions[q.id];
    const a = answers[q.id];
    const selected = a?.selectedOptionId;
    return {
      questionId: q.id,
      ...(selected !== undefined ? { selectedOptionId: selected } : {}),
      correctOptionId: sol?.correctOptionId ?? '',
      isCorrect: selected !== undefined && selected === sol?.correctOptionId,
      solution: sol?.solution ?? { en: 'Solution pending.' },
      yourTimeSeconds: Math.round((a?.timeSpentMs ?? 0) / 1000),
      averageTimeSeconds: sol?.averageTimeSeconds ?? 0,
      percentCorrect: sol?.percentCorrect ?? 0,
      bookmarked: false,
    };
  });

  // Cohort placement is illustrative: a fixed snapshot sized from the test's attempt count.
  const cohortSize = test.attempts;
  const fraction = maxScore === 0 ? 0 : score / maxScore;
  const percentile = Math.min(99.9, Math.max(0.1, Math.round(fraction * 1000) / 10));
  const rank = Math.max(1, Math.round(cohortSize * (1 - percentile / 100)));

  return {
    attemptId,
    testId: test.id,
    status,
    completedAt: new Date().toISOString(),
    score,
    maxScore,
    correct,
    wrong,
    skipped,
    rank,
    cohortSize,
    percentile,
    topperScore: Math.round(maxScore * 0.96),
    averageScore: Math.round(maxScore * 0.52 * 10) / 10,
    sections,
    review,
  };
}

export const getPastResult = (attemptId: string): Result | undefined => pastResults.find((r) => r.attemptId === attemptId);

/**
 * Archived results in the demo carry counts but no per-question review. This
 * builds a deterministic review that matches those counts, so the review screen
 * has realistic content without inventing a second scoring path.
 */
export function synthesizeReview(result: Result): QuestionReview[] {
  const test = testIndex.get(result.testId);
  if (!test) return [];
  const paper = buildPaper(test);
  const total = paper.questions.length;
  const pattern: ('correct' | 'wrong' | 'skipped')[] = [];
  for (let i = 0; i < total; i += 1) {
    if (pattern.filter((p) => p === 'wrong').length < result.wrong && i % 5 === 3) pattern.push('wrong');
    else if (pattern.filter((p) => p === 'skipped').length < result.skipped && i % 9 === 7) pattern.push('skipped');
    else pattern.push('correct');
  }
  // Top up any shortfall so totals match exactly.
  let wrongLeft = result.wrong - pattern.filter((p) => p === 'wrong').length;
  let skippedLeft = result.skipped - pattern.filter((p) => p === 'skipped').length;
  for (let i = total - 1; i >= 0 && (wrongLeft > 0 || skippedLeft > 0); i -= 1) {
    if (pattern[i] !== 'correct') continue;
    if (wrongLeft > 0) { pattern[i] = 'wrong'; wrongLeft -= 1; }
    else if (skippedLeft > 0) { pattern[i] = 'skipped'; skippedLeft -= 1; }
  }

  return paper.questions.map((q, i) => {
    const sol = solutions[q.id];
    const correctId = sol?.correctOptionId ?? 'A';
    const outcome = pattern[i] ?? 'correct';
    const wrongChoice = q.options.find((o) => o.id !== correctId)?.id ?? correctId;
    const selected = outcome === 'skipped' ? undefined : outcome === 'correct' ? correctId : wrongChoice;
    const avg = sol?.averageTimeSeconds ?? 30;
    return {
      questionId: q.id,
      ...(selected !== undefined ? { selectedOptionId: selected } : {}),
      correctOptionId: correctId,
      isCorrect: outcome === 'correct',
      solution: sol?.solution ?? { en: 'Solution pending.' },
      yourTimeSeconds: outcome === 'skipped' ? Math.max(4, Math.round(avg * 0.3)) : Math.round(avg * (outcome === 'correct' ? 0.85 : 1.3)),
      averageTimeSeconds: avg,
      percentCorrect: sol?.percentCorrect ?? 60,
      bookmarked: false,
    };
  });
}
