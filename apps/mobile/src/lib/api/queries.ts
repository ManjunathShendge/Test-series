import { useQuery } from '@tanstack/react-query';
import {
  ExamDetail,
  ExamList,
  ExaminerDetail,
  ExaminerList,
  SeriesDetail,
  TestDetail,
  TestList,
  type ExamSummary,
  type ExaminerCard,
  type TestSummary as ApiTestSummary,
} from '@exam-prep/contracts';
import {
  type SearchFilters,
} from '@/lib/demo';
import type { Exam, Examiner, Series, TestSummary } from '@/lib/demo';
import { apiRequest } from './http';

export const queryKeys = {
  homeFeed: (examIds: string[], attempted: string[], followed: string[]) => ['home', { examIds, attempted, followed }] as const,
  search: (filters: SearchFilters) => ['search', filters] as const,
  test: (id: string) => ['test', id] as const,
  exams: ['catalogue', 'exams'] as const,
  examiners: ['catalogue', 'examiners'] as const,
};

const kindFor = (type: ApiTestSummary['type']): TestSummary['kind'] =>
  type === 'mock' ? 'full-mock' : type === 'pyq' ? 'pyq' : 'sectional';

function toTestSummary(test: ApiTestSummary): TestSummary {
  return {
    id: test.id,
    examId: test.exam.id,
    examinerId: test.examiner.id,
    ...(test.seriesId ? { seriesId: test.seriesId } : {}),
    title: test.title,
    kind: kindFor(test.type),
    languages: test.languages,
    questionCount: test.totalQuestions,
    durationMinutes: Math.ceil(test.durationSeconds / 60),
    totalMarks: test.totalMarks,
    pricePaise: test.pricePaise,
    availability: test.access === 'free' ? 'free' : 'paid',
    attempts: test.attemptsCount,
    isFeatured: test.isFeatured,
    publishedAt: test.publishedAt ?? new Date(0).toISOString(),
    sections: [],
    instructions: [],
  };
}

function toExam(exam: ExamSummary): Exam {
  const shortName = exam.name
    .replace(/^staff selection commission\s*/i, 'SSC ')
    .replace(/^institute of banking personnel selection\s*/i, 'IBPS ')
    .replace(/^railway recruitment board\s*/i, 'RRB ');
  return {
    id: exam.id,
    name: exam.name,
    shortName,
    category: exam.category.name,
    pattern: '',
    syllabus: [],
    ...(exam.nextDate ? { nextDate: exam.nextDate.date } : {}),
    ...(exam.lastCutoffScore !== null ? { lastCutoff: exam.lastCutoffScore } : {}),
    testCount: exam.liveTestCount,
    followerCount: 0,
  };
}

function toExaminer(examiner: ExaminerCard): Examiner {
  return {
    id: examiner.id,
    name: examiner.name,
    credentials: examiner.tier === 'top' ? 'Top examiner' : examiner.tier === 'verified' ? 'Verified examiner' : 'New examiner',
    bio: '',
    tier: examiner.tier,
    followers: examiner.followerCount,
    publishedTests: 0,
    examIds: [],
    isFollowed: false,
  };
}

export function useExams() {
  return useQuery({
    queryKey: queryKeys.exams,
    queryFn: async () => {
      const response = await apiRequest('GET', '/exams', { schema: ExamList });
      return response.items.map(toExam);
    },
  });
}

export function useExaminers() {
  return useQuery({
    queryKey: queryKeys.examiners,
    queryFn: async () => {
      const response = await apiRequest('GET', '/examiners', { schema: ExaminerList });
      return response.items.map(toExaminer);
    },
  });
}

export function useHomeFeed(examIds: string[], attempted: string[], followed: string[]) {
  return useQuery({
    queryKey: queryKeys.homeFeed(examIds, attempted, followed),
    queryFn: async () => {
      const response = await apiRequest('GET', '/tests?limit=50', { schema: TestList });
      const tests = response.items.map(toTestSummary);
      const recommended = tests
        .filter((test) => examIds.includes(test.examId) && !attempted.includes(test.id))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 6);
      const fromFollowed = tests
        .filter((test) => followed.includes(test.examinerId))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, 4);
      const featured = tests.filter((test) => test.isFeatured && test.availability === 'free');
      const examinerResponse = await apiRequest('GET', '/examiners', { schema: ExaminerList });
      const suggestedExaminers = examinerResponse.items
        .filter((examiner) => !followed.includes(examiner.id))
        .map(toExaminer)
        .slice(0, 2);
      return { recommended, fromFollowed, featured, suggestedExaminers };
    },
    // Follow and attempt changes reshuffle the feed; keep the old one on screen meanwhile.
    placeholderData: (prev) => prev,
  });
}

export function useSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: queryKeys.search(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      if (filters.examId) params.set('exam', filters.examId);
      if (filters.kind) params.set('type', filters.kind === 'pyq' ? 'pyq' : filters.kind === 'sectional' ? 'sectional' : 'mock');
      if (filters.language === 'hi') {
        // The contract has bilingual metadata, so this is resolved by filtering the returned page.
      }
      params.set('limit', '50');
      const response = await apiRequest('GET', `/tests?${params.toString()}`, { schema: TestList });
      let tests = response.items.map(toTestSummary);
      if (filters.price === 'free') tests = tests.filter((test) => test.pricePaise === 0);
      if (filters.price === 'under50') tests = tests.filter((test) => test.pricePaise > 0 && test.pricePaise < 5000);
      if (filters.price === '50to200') tests = tests.filter((test) => test.pricePaise >= 5000 && test.pricePaise <= 20000);
      if (filters.price === 'over200') tests = tests.filter((test) => test.pricePaise > 20000);
      if (filters.language === 'hi') tests = tests.filter((test) => test.languages.includes('hi'));
      if (filters.examinerId) tests = tests.filter((test) => test.examinerId === filters.examinerId);
      return tests;
    },
    placeholderData: (prev) => prev,
  });
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export function useTestDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.test(id),
    queryFn: async () => {
      try {
        const detail = await apiRequest('GET', `/tests/${id}`, { schema: TestDetail });
        const test = toTestSummary(detail);
        test.sections = detail.sections.map((section, index) => ({
          id: `section-${index + 1}`,
          name: { en: section.name },
          bankKey: 'reasoning',
          questionCount: section.questionCount,
          ...(section.durationSeconds ? { durationMinutes: Math.ceil(section.durationSeconds / 60) } : {}),
          marksPerQuestion: section.positiveMarks,
          negativeMarks: section.negativeMarks,
        }));
        test.instructions = ['Answers are saved on the server. Submit only after review.'];
        const exam: Exam = {
          id: detail.exam.id,
          name: detail.exam.name,
          shortName: detail.exam.name,
          category: '',
          pattern: '',
          syllabus: [],
          testCount: 0,
          followerCount: 0,
        };
        const examiner: Examiner = {
          id: detail.examiner.id,
          name: detail.examiner.name,
          credentials: detail.examiner.tier === 'top' ? 'Top examiner' : detail.examiner.tier === 'verified' ? 'Verified examiner' : 'New examiner',
          bio: '',
          tier: detail.examiner.tier,
          followers: detail.examiner.followerCount,
          publishedTests: 0,
          examIds: [],
          isFollowed: false,
        };
        return { test, exam, examiner, series: detail.series ?? undefined };
      } catch (error) {
        if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
          throw new NotFoundError('Test');
        }
        throw error;
      }
    },
    retry: (count, error) => !(error instanceof NotFoundError) && count < 2,
  });
}

export function useExamDetail(id: string) {
  return useQuery({
    queryKey: ['catalogue', 'exam', id] as const,
    queryFn: async () => {
      const detail = await apiRequest('GET', `/exams/${id}`, { schema: ExamDetail });
      const exam: Exam = {
        id: detail.id,
        name: detail.name,
        shortName: detail.name,
        category: detail.category.name,
        pattern: detail.pattern
          ? `${detail.pattern.totalQuestions} questions · ${Math.ceil(detail.pattern.durationSeconds / 60)} minutes`
          : '',
        syllabus: detail.syllabusMarkdown ? detail.syllabusMarkdown.split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : detail.subjects,
        ...(detail.nextDate ? { nextDate: detail.nextDate.date } : {}),
        ...(detail.lastCutoffScore !== null ? { lastCutoff: detail.lastCutoffScore } : {}),
        testCount: detail.liveTestCount,
        followerCount: 0,
      };
      const params = new URLSearchParams({ exam: detail.id, limit: '50' });
      const tests = await apiRequest('GET', `/tests?${params.toString()}`, { schema: TestList });
      return {
        exam,
        tests: tests.items.map(toTestSummary),
        series: [] as Series[],
      };
    },
  });
}

export function useSeriesDetail(id: string) {
  return useQuery({
    queryKey: ['catalogue', 'series', id] as const,
    queryFn: async () => {
      const detail = await apiRequest('GET', `/series/${id}`, { schema: SeriesDetail });
      const series: Series = {
        id: detail.id,
        examId: detail.exam.id,
        examinerId: detail.examiner.id,
        title: detail.title,
        description: detail.description ?? '',
        testIds: detail.tests.map((test) => test.id),
        pricePaise: detail.pricePaise,
        validityDays: detail.validityDays,
        syllabusCoverage: detail.syllabusCoverage ? Number(detail.syllabusCoverage) : 0,
        owned: false,
      };
      return {
        series,
        tests: detail.tests.map(toTestSummary),
        exam: detail.exam,
        examiner: detail.examiner,
      };
    },
  });
}

export function useExaminerDetail(id: string) {
  return useQuery({
    queryKey: ['catalogue', 'examiner', id] as const,
    queryFn: async () => {
      const detail = await apiRequest('GET', `/examiners/${id}`, { schema: ExaminerDetail });
      const examiner: Examiner = {
        id: detail.id,
        name: detail.name,
        credentials: detail.experienceYears !== null ? `${detail.experienceYears} years experience · ${detail.accountType}` : detail.accountType,
        bio: detail.bio ?? '',
        tier: detail.tier,
        followers: detail.followerCount,
        publishedTests: detail.recentTests.length,
        examIds: detail.exams.map((exam) => exam.id),
        isFollowed: false,
      };
      const series = detail.series.map(
        (item): Series => ({
          id: item.id,
          examId: item.exam.id,
          examinerId: detail.id,
          title: item.title,
          description: '',
          testIds: [],
          pricePaise: item.pricePaise,
          validityDays: item.validityDays,
          syllabusCoverage: 0,
          owned: false,
        }),
      );
      return { examiner, tests: detail.recentTests.map(toTestSummary), series, exams: detail.exams };
    },
  });
}
