import type { Profile, Purchase, Result, ScorePoint, TopicStrength } from './types';

/**
 * Past activity for the demo student. Results carry a cohort snapshot with
 * calculated size, so comparisons are never presented as live.
 */

export const profile: Profile = {
  name: 'Priya Sharma',
  email: 'priya.sharma@example.com',
  targetExamIds: ['ssc-cgl-t1', 'ibps-po-pre'],
  language: 'en',
  preparationStage: 'revising',
  deviceCount: 1,
};

export const purchases: Purchase[] = [
  {
    id: 'pur-1',
    title: 'NTPC CBT 1 Hindi-first Series',
    kind: 'series',
    amountPaise: 19900,
    purchasedAt: '2026-11-03T14:22:00Z',
    channel: 'Google Play',
    invoiceNumber: 'INV-2026-004417',
  },
  {
    id: 'pur-2',
    title: 'SSC CGL Tier 1 Mini Mock 2',
    kind: 'test',
    amountPaise: 4900,
    purchasedAt: '2026-11-06T09:05:00Z',
    channel: 'Google Play',
    invoiceNumber: 'INV-2026-004602',
  },
  {
    id: 'pur-3',
    title: 'General Awareness Sectional: Polity & Geography',
    kind: 'test',
    amountPaise: 1900,
    purchasedAt: '2026-11-10T18:40:00Z',
    channel: 'Google Play',
    invoiceNumber: 'INV-2026-004871',
  },
];

export const pastResults: Result[] = [
  {
    attemptId: 'att-101',
    testId: 't-cgl-mini-2',
    status: 'submitted',
    completedAt: '2026-11-07T10:14:00Z',
    score: 51.5,
    maxScore: 80,
    correct: 29,
    wrong: 7,
    skipped: 4,
    rank: 1184,
    cohortSize: 9310,
    percentile: 87.3,
    topperScore: 78,
    averageScore: 41.2,
    sections: [
      { sectionId: 'reasoning', name: 'General Intelligence & Reasoning', score: 15.5, maxScore: 20, correct: 8, wrong: 1, skipped: 1, accuracy: 0.89, timeSpentMinutes: 7.2 },
      { sectionId: 'ga', name: 'General Awareness', score: 9, maxScore: 20, correct: 6, wrong: 4, skipped: 0, accuracy: 0.6, timeSpentMinutes: 4.1 },
      { sectionId: 'quant', name: 'Quantitative Aptitude', score: 13.5, maxScore: 20, correct: 7, wrong: 1, skipped: 2, accuracy: 0.88, timeSpentMinutes: 11.6 },
      { sectionId: 'english', name: 'English Comprehension', score: 13.5, maxScore: 20, correct: 8, wrong: 1, skipped: 1, accuracy: 0.89, timeSpentMinutes: 5.9 },
    ],
    review: [],
  },
  {
    attemptId: 'att-088',
    testId: 't-rrb-mini-1',
    status: 'submitted',
    completedAt: '2026-11-01T17:48:00Z',
    score: 19.33,
    maxScore: 30,
    correct: 21,
    wrong: 5,
    skipped: 4,
    rank: 2410,
    cohortSize: 11020,
    percentile: 78.1,
    topperScore: 29,
    averageScore: 15.9,
    sections: [
      { sectionId: 'ga', name: 'General Awareness', score: 6, maxScore: 10, correct: 7, wrong: 3, skipped: 0, accuracy: 0.7, timeSpentMinutes: 5.4 },
      { sectionId: 'quant', name: 'Mathematics', score: 6.67, maxScore: 10, correct: 7, wrong: 1, skipped: 2, accuracy: 0.88, timeSpentMinutes: 11.2 },
      { sectionId: 'reasoning', name: 'General Intelligence & Reasoning', score: 6.67, maxScore: 10, correct: 7, wrong: 1, skipped: 2, accuracy: 0.88, timeSpentMinutes: 8.9 },
    ],
    review: [],
  },
  {
    attemptId: 'att-063',
    testId: 't-cgl-english-sec',
    status: 'auto_submitted',
    completedAt: '2026-10-24T20:02:00Z',
    score: 12,
    maxScore: 20,
    correct: 7,
    wrong: 2,
    skipped: 1,
    rank: 3920,
    cohortSize: 12930,
    percentile: 69.7,
    topperScore: 20,
    averageScore: 10.4,
    sections: [
      { sectionId: 'english', name: 'English Comprehension', score: 12, maxScore: 20, correct: 7, wrong: 2, skipped: 1, accuracy: 0.78, timeSpentMinutes: 8 },
    ],
    review: [],
  },
];

export const scoreTrend: ScorePoint[] = [
  { date: '2026-10-12', score: 38, maxScore: 80, testTitle: 'CGL Mini Mock (archived)' },
  { date: '2026-10-19', score: 42.5, maxScore: 80, testTitle: 'CGL Mini Mock (archived)' },
  { date: '2026-10-24', score: 48, maxScore: 80, testTitle: 'English Sectional (scaled)' },
  { date: '2026-10-31', score: 46.5, maxScore: 80, testTitle: 'CGL PYQ practice (archived)' },
  { date: '2026-11-07', score: 51.5, maxScore: 80, testTitle: 'SSC CGL Tier 1 Mini Mock 2' },
];

/** Admin-entered last cutoff on the CGL scale, drawn as a reference line. */
export const cutoffOnTrendScale = { label: 'CGL 2025 cutoff (scaled)', score: 61.4, maxScore: 80 };

export const topicStrengths: TopicStrength[] = [
  { topic: 'Number Series', examId: 'ssc-cgl-t1', attempted: 14, accuracy: 0.93 },
  { topic: 'Percentage', examId: 'ssc-cgl-t1', attempted: 18, accuracy: 0.89 },
  { topic: 'Synonyms', examId: 'ssc-cgl-t1', attempted: 22, accuracy: 0.86 },
  { topic: 'Analogy', examId: 'ssc-cgl-t1', attempted: 11, accuracy: 0.82 },
  { topic: 'Simple Interest', examId: 'ssc-cgl-t1', attempted: 9, accuracy: 0.78 },
  { topic: 'Spotting Errors', examId: 'ssc-cgl-t1', attempted: 16, accuracy: 0.69 },
  { topic: 'Indian Polity', examId: 'ssc-cgl-t1', attempted: 20, accuracy: 0.6 },
  { topic: 'Syllogism', examId: 'ssc-cgl-t1', attempted: 8, accuracy: 0.5 },
  { topic: 'Indian Geography', examId: 'ssc-cgl-t1', attempted: 15, accuracy: 0.47 },
  { topic: 'Mensuration', examId: 'ssc-cgl-t1', attempted: 7, accuracy: 0.43 },
];
