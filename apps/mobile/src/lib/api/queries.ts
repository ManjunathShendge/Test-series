import { useQuery } from '@tanstack/react-query';
import {
  ExamDetail,
  ExamList,
  ExaminerDetail,
  ExaminerList,
  PublicBannerList,
  SeriesDetail,
  TestDetail,
  TestList,
  type ExamSummary,
  type ExaminerCard,
  type TestSummary as ApiTestSummary,
} from '@exam-prep/contracts';
import type { Exam, Examiner, SearchFilters, Series, TestSummary } from '@/lib/catalogue/types';
import { apiRequest } from './http';

export const queryKeys = {
  homeFeed: (examIds: string[], attempted: string[]) => ['home', { examIds, attempted }] as const,
  search: (filters: SearchFilters) => ['search', filters] as const,
  test: (id: string) => ['test', id] as const,
  exams: ['catalogue', 'exams'] as const,
  examiners: ['catalogue', 'examiners'] as const,
  banners: ['banners', 'app'] as const,
};

const kindFor = (type: ApiTestSummary['type']): TestSummary['kind'] =>
  type === 'mock' ? 'full-mock' : type === 'pyq' ? 'pyq' : 'sectional';

export function toTestSummary(test: ApiTestSummary): TestSummary {
  return {
    id: test.id,
    examId: test.exam.id,
    examName: test.exam.name,
    examinerId: test.examiner.id,
    examinerName: test.examiner.name,
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

/** Compact exam label for chips, e.g. "Staff Selection Commission CGL" -> "SSC CGL". */
export const shortExamName = (name: string) =>
  name
    .replace(/^staff selection commission\s*/i, 'SSC ')
    .replace(/^institute of banking personnel selection\s*/i, 'IBPS ')
    .replace(/^railway recruitment board\s*/i, 'RRB ');

function toExam(exam: ExamSummary): Exam {
  const shortName = shortExamName(exam.name);
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
  };
}

export function toExaminer(examiner: ExaminerCard): Examiner {
  return {
    id: examiner.id,
    name: examiner.name,
    credentials: examiner.tier === 'top' ? 'Top examiner' : examiner.tier === 'verified' ? 'Verified examiner' : 'New examiner',
    bio: '',
    tier: examiner.tier,
    followers: examiner.followerCount,
    publishedTests: 0,
    examIds: [],
  };
}

/** Admin banners for the app Home (CMS). Public; a failure just hides the rail. */
export function useBanners() {
  return useQuery({
    queryKey: queryKeys.banners,
    queryFn: async () => (await apiRequest('GET', '/banners?placement=app', { schema: PublicBannerList })).items,
    staleTime: 5 * 60_000,
    retry: 1,
  });
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

/** Home rails from the live catalogue: popular unattempted tests in target exams, featured free tests. */
export function useHomeFeed(examIds: string[], attempted: string[]) {
  return useQuery({
    queryKey: queryKeys.homeFeed(examIds, attempted),
    queryFn: async () => {
      const response = await apiRequest('GET', '/tests?limit=50', { schema: TestList });
      const tests = response.items.map(toTestSummary);
      const recommended = tests
        .filter((test) => examIds.includes(test.examId) && !attempted.includes(test.id))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 6);
      const featured = tests.filter((test) => test.isFeatured && test.availability === 'free');
      return { recommended, featured };
    },
    // Attempt changes reshuffle the feed; keep the old one on screen meanwhile.
    placeholderData: (prev) => prev,
  });
}

export function useSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: queryKeys.search(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      // The API searches from two characters; one character would be rejected.
      if ((filters.query?.trim().length ?? 0) >= 2) params.set('q', filters.query!.trim());
      if (filters.examId) params.set('exam', filters.examId);
      if (filters.kind) params.set('type', filters.kind === 'pyq' ? 'pyq' : filters.kind === 'sectional' ? 'sectional' : 'mock');
      if (filters.examinerId) params.set('examiner', filters.examinerId);
      // Free/paid is filtered by the server; price bands and Hindi narrow the returned page.
      if (filters.price === 'free') params.set('access', 'free');
      else if (filters.price) params.set('access', 'paid');
      params.set('limit', '50');
      const response = await apiRequest('GET', `/tests?${params.toString()}`, { schema: TestList });
      let tests = response.items.map(toTestSummary);
      if (filters.price === 'under50') tests = tests.filter((test) => test.pricePaise < 5000);
      if (filters.price === '50to200') tests = tests.filter((test) => test.pricePaise >= 5000 && test.pricePaise <= 20000);
      if (filters.price === 'over200') tests = tests.filter((test) => test.pricePaise > 20000);
      if (filters.language === 'hi') tests = tests.filter((test) => test.languages.includes('hi'));
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
          };
      const params = new URLSearchParams({ exam: detail.id, limit: '50' });
      const tests = (await apiRequest('GET', `/tests?${params.toString()}`, { schema: TestList })).items.map(toTestSummary);
      // The exam endpoint has no series list; the series its tests belong to are fetched directly.
      const seriesIds = [...new Set(tests.flatMap((test) => (test.seriesId ? [test.seriesId] : [])))].slice(0, 10);
      const series = await Promise.all(seriesIds.map(async (sid) => toSeries(await apiRequest('GET', `/series/${sid}`, { schema: SeriesDetail }))));
      return { exam, tests, series };
    },
  });
}

function toSeries(detail: SeriesDetail): Series {
  return {
    id: detail.id,
    examId: detail.exam.id,
    examinerId: detail.examiner.id,
    title: detail.title,
    description: detail.description ?? '',
    testIds: detail.tests.map((test) => test.id),
    pricePaise: detail.pricePaise,
    validityDays: detail.validityDays,
    syllabusCoverage: detail.syllabusCoverage ? Number(detail.syllabusCoverage) : 0,
  };
}

export function useSeriesDetail(id: string) {
  return useQuery({
    queryKey: ['catalogue', 'series', id] as const,
    queryFn: async () => {
      const detail = await apiRequest('GET', `/series/${id}`, { schema: SeriesDetail });
      return {
        series: toSeries(detail),
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
          }),
      );
      return { examiner, tests: detail.recentTests.map(toTestSummary), series, exams: detail.exams };
    },
  });
}
