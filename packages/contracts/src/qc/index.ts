import { z } from 'zod';
import { ExaminerTier } from '../catalogue/index.js';

// QC review, examiner quality and student reports (PRD 4.3-4.4, 5.2-5.5; QC_PIPELINE).
// Reviewers decide every question; AI never decides. Matches from other examiners are
// shown to reviewers only; examiners see that a match exists, never the other question.

const IsoTime = z.iso.datetime({ offset: true });
const Comment = z.string().trim().max(2000);

export const QcReasonCode = z.enum([
  'key_wrong',
  'solution_wrong',
  'ambiguous',
  'out_of_syllabus',
  'duplicate',
  'translation',
  'formatting',
  'watermark',
  'other',
]);
export type QcReasonCode = z.infer<typeof QcReasonCode>;

export const QC_REASON_LABELS: Record<QcReasonCode, string> = {
  key_wrong: 'Answer key is wrong',
  solution_wrong: 'Solution does not support the key',
  ambiguous: 'More than one option is defensible',
  out_of_syllabus: 'Out of syllabus',
  duplicate: 'Duplicate or copied question',
  translation: 'English and Hindi say different things',
  formatting: 'Formatting or typing errors',
  watermark: 'Book scan or another brand’s watermark',
  other: 'Other',
};

/** Reviewer actions on a question; a minor edit has its own request below. */
export const QcAction = z.enum(['approve', 'request_change', 'reject']);
export type QcAction = z.infer<typeof QcAction>;
export const QcItemAction = z.enum(['pending', 'approve', 'minor_edit', 'request_change', 'reject']);
export type QcItemAction = z.infer<typeof QcItemAction>;

export const DuplicateMatchKind = z.enum([
  'exact_hash',
  'masked_hash',
  'trigram_high',
  'trigram_mid',
  'image_hash',
  'pyq_match',
  'internal_test_dup',
]);
export type DuplicateMatchKind = z.infer<typeof DuplicateMatchKind>;

export const MATCH_LABELS: Record<DuplicateMatchKind, string> = {
  exact_hash: 'Exact copy',
  masked_hash: 'Same question with numbers or names changed',
  trigram_high: 'Likely duplicate',
  trigram_mid: 'Similar question',
  image_hash: 'Same image file',
  pyq_match: 'Matches a previous year question',
  internal_test_dup: 'Repeated in this test',
};

/** PRD 5.3.3 manual checklist; every item must be confirmed to approve. */
export const QcChecklist = z.strictObject({
  keyMatchesSolution: z.boolean(),
  singleDefensibleOption: z.boolean(),
  bilingualMatch: z.boolean(),
  inSyllabus: z.boolean(),
  noWatermarks: z.boolean(),
});
export type QcChecklist = z.infer<typeof QcChecklist>;

export const QC_CHECKLIST_LABELS: Record<keyof QcChecklist, string> = {
  keyMatchesSolution: 'The key matches the worked solution',
  singleDefensibleOption: 'Exactly one option is defensible',
  bilingualMatch: 'English and Hindi mean the same (or English only)',
  inSyllabus: 'The question is in syllabus',
  noWatermarks: 'No other brands’ watermarks or book scans',
};

// Reviewer workspace -----------------------------------------------------------------------

export const QcQueueItem = z.object({
  reviewId: z.uuid(),
  testId: z.uuid(),
  testTitle: z.string(),
  examName: z.string(),
  examinerName: z.string(),
  examinerTier: ExaminerTier,
  /** Top tier examiners are reviewed first (DECISIONS proposal P-QC1). */
  fastLane: z.boolean(),
  isSecondReview: z.boolean(),
  flagCount: z.number().int(),
  questionCount: z.number().int(),
  decidedCount: z.number().int(),
  reviewerId: z.uuid().nullable(),
  reviewerName: z.string().nullable(),
  slaDeadlineAt: IsoTime,
  createdAt: IsoTime,
});
export type QcQueueItem = z.infer<typeof QcQueueItem>;
export const QcQueue = z.object({ items: z.array(QcQueueItem) });
export type QcQueue = z.infer<typeof QcQueue>;

export const QcMatch = z.object({
  kind: DuplicateMatchKind,
  similarity: z.number().nullable(),
  sameExaminer: z.boolean(),
  matchedQuestionId: z.uuid(),
  matchedStemEn: z.string(),
  matchedExaminerName: z.string().nullable(),
  matchedIsPyq: z.boolean(),
});
export type QcMatch = z.infer<typeof QcMatch>;

export const QcReviewQuestion = z.object({
  itemId: z.uuid(),
  sectionName: z.string(),
  position: z.number().int(),
  questionId: z.uuid(),
  versionNumber: z.number().int(),
  subjectName: z.string(),
  topicName: z.string(),
  difficulty: z.string(),
  stemEn: z.string(),
  stemHi: z.string().nullable(),
  options: z.array(z.object({ id: z.string(), textEn: z.string(), textHi: z.string().optional() })),
  correctOption: z.string(),
  solutionEn: z.string(),
  solutionHi: z.string().nullable(),
  isPyq: z.boolean(),
  pyqYear: z.number().int().nullable(),
  imageAssetIds: z.array(z.uuid()),
  /** Set after a reviewer minor edit: the version the examiner submitted. */
  editedFromVersion: z.number().int().nullable(),
  completenessError: z.boolean(),
  match: QcMatch.nullable(),
  /** Approved in an earlier round; stays approved and locked. */
  carriedOver: z.boolean(),
  action: QcItemAction,
  reasonCode: QcReasonCode.nullable(),
  comment: z.string().nullable(),
  checklist: QcChecklist.nullable(),
});
export type QcReviewQuestion = z.infer<typeof QcReviewQuestion>;

export const PatternFitRow = z.object({
  sectionName: z.string(),
  topicName: z.string(),
  target: z.number().int().nullable(),
  actual: z.number().int(),
});
export type PatternFitRow = z.infer<typeof PatternFitRow>;

export const QcReviewDetail = z.object({
  review: QcQueueItem.extend({
    status: z.string(),
    overallComments: z.string().nullable(),
    completedAt: IsoTime.nullable(),
    hasHindi: z.boolean(),
    testType: z.string(),
    pyqPercentage: z.number(),
  }),
  questions: z.array(QcReviewQuestion),
  patternFit: z.array(PatternFitRow),
});
export type QcReviewDetail = z.infer<typeof QcReviewDetail>;

export const QcDecisionRequest = z
  .strictObject({
    action: QcAction,
    reasonCode: QcReasonCode.nullable(),
    comment: Comment,
    checklist: QcChecklist,
  })
  .superRefine((value, ctx) => {
    if (value.action === 'approve') {
      if (!Object.values(value.checklist).every(Boolean))
        ctx.addIssue({ code: 'custom', path: ['checklist'], message: 'Confirm every checklist item to approve.' });
      return;
    }
    if (!value.reasonCode) ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Choose a reason.' });
    if (!value.comment) ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Tell the examiner what to fix.' });
  });
export type QcDecisionRequest = z.infer<typeof QcDecisionRequest>;

const OptionText = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  textEn: z.string().trim().min(1).max(10_000),
  textHi: z.string().trim().max(10_000).optional(),
});

/**
 * PRD 5.3.4 "Minor edit": the reviewer corrects wording; the server creates a new version of the
 * question, revalidates it and places it in the test as approved (QC_PIPELINE).
 */
export const QcMinorEditRequest = z.strictObject({
  stemEn: z.string().trim().min(1).max(20_000),
  stemHi: z.string().trim().max(20_000).nullable(),
  options: z.array(OptionText).length(4),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  solutionEn: z.string().trim().min(1).max(20_000),
  solutionHi: z.string().trim().max(20_000).nullable(),
  comment: z.string().trim().min(3).max(2000),
  checklist: QcChecklist,
});
export type QcMinorEditRequest = z.infer<typeof QcMinorEditRequest>;

/** PRD 5.4 key correction: a corrected version, recorded per test, then attempts are re-scored. */
export const CorrectKeyRequest = z.strictObject({
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  solutionEn: z.string().trim().min(1).max(20_000),
  solutionHi: z.string().trim().max(20_000).nullable(),
  reason: z.string().trim().min(3).max(2000),
});
export type CorrectKeyRequest = z.infer<typeof CorrectKeyRequest>;

export const QcFinishRequest = z.strictObject({ comments: Comment });
export type QcFinishRequest = z.infer<typeof QcFinishRequest>;
export const QcFinishResponse = z.object({ status: z.string() });
export type QcFinishResponse = z.infer<typeof QcFinishResponse>;

/** Second review of an already approved test (PRD 5.3.7). Recorded; release is not reversed automatically. */
export const SpotCheckResultRequest = z
  .strictObject({ passed: z.boolean(), comments: Comment })
  .superRefine((value, ctx) => {
    if (!value.passed && !value.comments)
      ctx.addIssue({ code: 'custom', path: ['comments'], message: 'Say what the second review found.' });
  });
export type SpotCheckResultRequest = z.infer<typeof SpotCheckResultRequest>;

// Student reports (PRD 5.4) ------------------------------------------------------------------

export const ReportReason = z.enum(['wrong_answer', 'ambiguous', 'out_of_syllabus', 'duplicate', 'translation_error']);
export type ReportReason = z.infer<typeof ReportReason>;
export const ReportStatus = z.enum([
  'open',
  'examiner_responded',
  'resolved_key_changed',
  'resolved_no_change',
  'dismissed',
]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong_answer: 'Wrong answer',
  ambiguous: 'Ambiguous',
  out_of_syllabus: 'Out of syllabus',
  duplicate: 'Duplicate',
  translation_error: 'Translation error',
};

export const QuestionReport = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  stemEn: z.string(),
  testTitle: z.string(),
  examinerName: z.string().nullable(),
  reason: ReportReason,
  studentComment: z.string().nullable(),
  status: ReportStatus,
  examinerResponse: z.string().nullable(),
  examinerRespondedAt: IsoTime.nullable(),
  slaDeadlineAt: IsoTime,
  resolutionNotes: z.string().nullable(),
  /** Distinct open reports on this question; five hide it from new attempts. */
  openReportCount: z.number().int(),
  questionHidden: z.boolean(),
  createdAt: IsoTime,
  /** Key and solution for staff deciding a key correction; null for examiners' own list. */
  question: z
    .object({
      options: z.array(z.object({ id: z.string(), textEn: z.string() })),
      correctOption: z.string(),
      solutionEn: z.string(),
      solutionHi: z.string().nullable(),
    })
    .nullable(),
  /** Set when the report was resolved by correcting the key. */
  correctedTo: z.string().nullable(),
});
export type QuestionReport = z.infer<typeof QuestionReport>;
export const QuestionReportList = z.object({ items: z.array(QuestionReport) });
export type QuestionReportList = z.infer<typeof QuestionReportList>;

export const RespondReportRequest = z.strictObject({ response: z.string().trim().min(10).max(2000) });
export type RespondReportRequest = z.infer<typeof RespondReportRequest>;

/** Key changes go through a corrected question version and rescoring (M8), not this action. */
export const ResolveReportRequest = z.strictObject({
  resolution: z.enum(['resolved_no_change', 'dismissed']),
  notes: z.string().trim().min(3).max(2000),
  unhideQuestion: z.boolean(),
});
export type ResolveReportRequest = z.infer<typeof ResolveReportRequest>;

// Examiner quality and tier (PRD 4.4, 5.5) ---------------------------------------------------

export const ExaminerQualityInputs = z.object({
  /** Approved share of decided questions; null before any review. */
  qcPassRate: z.number().nullable(),
  reviewedQuestions: z.number().int(),
  duplicateRejects: z.number().int(),
  keyCorrections: z.number().int(),
  avgReportResponseHours: z.number().nullable(),
  openReports: z.number().int(),
  liveTests: z.number().int(),
});
export type ExaminerQualityInputs = z.infer<typeof ExaminerQualityInputs>;

export const PriceBand = z.object({
  examId: z.uuid(),
  examName: z.string(),
  minPaise: z.number().int(),
  maxPaise: z.number().int(),
});
export type PriceBand = z.infer<typeof PriceBand>;

export const ExaminerQualityResponse = z.object({
  tier: ExaminerTier,
  fastLane: z.boolean(),
  kycVerified: z.boolean(),
  quality: ExaminerQualityInputs,
  priceBands: z.array(PriceBand),
});
export type ExaminerQualityResponse = z.infer<typeof ExaminerQualityResponse>;

// Admin: examiners, reviewers, queue and settings (PRD 8) ------------------------------------

export const ExaminerAccountStatus = z.enum(['approved', 'suspended', 'banned']);
export type ExaminerAccountStatus = z.infer<typeof ExaminerAccountStatus>;

export const AdminExaminer = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  accountType: z.enum(['individual', 'institute']),
  instituteName: z.string().nullable(),
  status: ExaminerAccountStatus,
  tier: ExaminerTier,
  kycVerifiedAt: IsoTime.nullable(),
  examNames: z.array(z.string()),
  quality: ExaminerQualityInputs,
  updatedAt: IsoTime,
});
export type AdminExaminer = z.infer<typeof AdminExaminer>;
export const AdminExaminerList = z.object({ items: z.array(AdminExaminer) });
export type AdminExaminerList = z.infer<typeof AdminExaminerList>;

export const UpdateAdminExaminerRequest = z
  .strictObject({
    tier: ExaminerTier.optional(),
    status: ExaminerAccountStatus.optional(),
    kycVerified: z.literal(true).optional(),
    reason: z.string().trim().max(500),
  })
  .superRefine((value, ctx) => {
    if (value.tier === undefined && value.status === undefined && value.kycVerified === undefined)
      ctx.addIssue({ code: 'custom', path: [], message: 'Nothing to change.' });
    if (value.status && value.status !== 'approved' && value.reason.length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for suspending or banning.' });
  });
export type UpdateAdminExaminerRequest = z.infer<typeof UpdateAdminExaminerRequest>;

export const QcReviewer = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  isBlocked: z.boolean(),
  openReviews: z.number().int(),
  exams: z.array(z.object({ mappingId: z.uuid(), examId: z.uuid(), examName: z.string() })),
});
export type QcReviewer = z.infer<typeof QcReviewer>;

export const QcSettings = z.object({
  examId: z.uuid(),
  examName: z.string(),
  trigramHigh: z.number(),
  trigramMid: z.number(),
  pyqMaxPercentage: z.number(),
  updatedAt: IsoTime,
});
export type QcSettings = z.infer<typeof QcSettings>;

export const RecentApprovedTest = z.object({
  testId: z.uuid(),
  title: z.string(),
  examName: z.string(),
  examinerName: z.string(),
  publishedAt: IsoTime.nullable(),
  spotCheck: z.enum(['none', 'open', 'passed', 'failed']),
});
export type RecentApprovedTest = z.infer<typeof RecentApprovedTest>;

export const QcOverview = z.object({
  queue: z.array(QcQueueItem),
  reviewers: z.array(QcReviewer),
  approved: z.array(RecentApprovedTest),
  settings: z.array(QcSettings),
});
export type QcOverview = z.infer<typeof QcOverview>;

export const AddQcReviewerRequest = z.strictObject({ email: z.email().trim().toLowerCase().max(320) });
export type AddQcReviewerRequest = z.infer<typeof AddQcReviewerRequest>;
export const MapReviewerRequest = z.strictObject({ examId: z.uuid() });
export type MapReviewerRequest = z.infer<typeof MapReviewerRequest>;
export const ReassignReviewRequest = z.strictObject({
  reviewerId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type ReassignReviewRequest = z.infer<typeof ReassignReviewRequest>;
export const CreateSpotCheckRequest = z.strictObject({ testId: z.uuid(), reviewerId: z.uuid() });
export type CreateSpotCheckRequest = z.infer<typeof CreateSpotCheckRequest>;

export const UpdateQcSettingsRequest = z
  .strictObject({
    expectedUpdatedAt: IsoTime,
    trigramHigh: z.number().min(0.05).max(1),
    trigramMid: z.number().min(0.05).max(1),
    pyqMaxPercentage: z.number().min(0).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.trigramMid >= value.trigramHigh)
      ctx.addIssue({ code: 'custom', path: ['trigramMid'], message: 'The similar threshold must be below the likely duplicate threshold.' });
  });
export type UpdateQcSettingsRequest = z.infer<typeof UpdateQcSettingsRequest>;
