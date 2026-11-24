import { z } from 'zod';
import { PatternFitRow, QcItemAction, QcReasonCode } from '../qc/index.js';

// Examiner tests and series (CONTENT_AUTHORING, API_CONTRACTS "/examiner/tests"). Examiners
// edit their own drafts; submitting freezes the draft for QC. Approval, scheduling and
// publishing stay with reviewers and admins (DECISIONS "Tests go live only on QC approval").

const IsoTime = z.iso.datetime({ offset: true });
const Title = z.string().trim().min(3).max(200);
/** Provisional bounds until founder price tiers (DECISIONS O04): ₹0 to ₹10,000 in paise. */
const Paise = z.number().int().min(0).max(1_000_000);

export const ExaminerTestType = z.enum(['mock', 'pyq', 'sectional']);
export type ExaminerTestType = z.infer<typeof ExaminerTestType>;
/** PRD 4.2 step 6: free; paid within the admin price band; only through the Pass; only in a series. */
export const ExaminerTestAccess = z.enum(['free', 'paid', 'pass_included', 'series_only']);
export type ExaminerTestAccess = z.infer<typeof ExaminerTestAccess>;
export const ExaminerTestStatus = z.enum([
  'draft',
  'submitted',
  'in_qc',
  'changes_requested',
  'approved',
  'scheduled',
  'live',
  'archived',
]);
export type ExaminerTestStatus = z.infer<typeof ExaminerTestStatus>;

/** Only paid tests have their own price (the server also checks the tier price band). */
function refinePrice(value: { accessType?: string | undefined; pricePaise?: number | undefined }, ctx: z.RefinementCtx) {
  if (value.accessType && value.accessType !== 'paid' && value.pricePaise !== undefined && value.pricePaise !== 0) {
    ctx.addIssue({ code: 'custom', path: ['pricePaise'], message: 'Only paid tests have their own price.' });
  }
  if (value.accessType === 'paid' && value.pricePaise !== undefined && value.pricePaise < 100) {
    ctx.addIssue({ code: 'custom', path: ['pricePaise'], message: 'Enter a price of at least ₹1.' });
  }
}

export const CreateExaminerTestRequest = z
  .strictObject({
    examId: z.uuid(),
    stageId: z.uuid(),
    templateId: z.uuid(),
    title: Title,
    testType: ExaminerTestType,
    accessType: ExaminerTestAccess,
    pricePaise: Paise,
    /** Paid and series-only tests may also be opened by Pass holders. */
    includedInPass: z.boolean(),
    hasHindi: z.boolean(),
    seriesId: z.uuid().nullable(),
  })
  .superRefine(refinePrice);
export type CreateExaminerTestRequest = z.infer<typeof CreateExaminerTestRequest>;

export const UpdateExaminerTestRequest = z
  .strictObject({
    expectedUpdatedAt: IsoTime,
    title: Title.optional(),
    testType: ExaminerTestType.optional(),
    accessType: ExaminerTestAccess.optional(),
    pricePaise: Paise.optional(),
    includedInPass: z.boolean().optional(),
    hasHindi: z.boolean().optional(),
    seriesId: z.uuid().nullable().optional(),
    /** PRD 4.3: publish at this time after approval (null: as soon as approved). */
    scheduledPublishAt: IsoTime.nullable().optional(),
  })
  .superRefine(refinePrice)
  .superRefine((value, ctx) => {
    if (!value.scheduledPublishAt) return;
    const at = new Date(value.scheduledPublishAt).getTime();
    if (at < Date.now() + 10 * 60_000)
      ctx.addIssue({ code: 'custom', path: ['scheduledPublishAt'], message: 'Choose a time at least 10 minutes from now.' });
    if (at > Date.now() + 366 * 86_400_000)
      ctx.addIssue({ code: 'custom', path: ['scheduledPublishAt'], message: 'Choose a time within the next year.' });
  });
export type UpdateExaminerTestRequest = z.infer<typeof UpdateExaminerTestRequest>;

export const ExaminerTestSummary = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  examId: z.uuid(),
  examName: z.string(),
  stageId: z.uuid(),
  stageName: z.string(),
  templateId: z.uuid(),
  templateName: z.string(),
  templateVersion: z.number().int(),
  testType: z.string(),
  status: ExaminerTestStatus,
  accessType: z.string(),
  pricePaise: z.number().int(),
  includedInPass: z.boolean(),
  hasHindi: z.boolean(),
  seriesId: z.uuid().nullable(),
  seriesTitle: z.string().nullable(),
  scheduledPublishAt: IsoTime.nullable(),
  totalQuestions: z.number().int(),
  filledQuestions: z.number().int(),
  totalDurationSeconds: z.number().int(),
  totalMarks: z.number(),
  updatedAt: IsoTime,
});
export type ExaminerTestSummary = z.infer<typeof ExaminerTestSummary>;

export const ExaminerTestList = z.object({ items: z.array(ExaminerTestSummary) });
export type ExaminerTestList = z.infer<typeof ExaminerTestList>;

export const ExaminerTestSlot = z.object({
  position: z.number().int().positive(),
  item: z
    .object({
      questionId: z.uuid(),
      stemEn: z.string(),
      difficulty: z.string(),
      isApproved: z.boolean(),
      hasHindi: z.boolean(),
      qcLocked: z.boolean(),
      /** The reviewer's decision from the last finished review round. */
      qc: z
        .object({ action: QcItemAction, reasonCode: QcReasonCode.nullable(), comment: z.string().nullable() })
        .nullable(),
      /** A newer version of this question exists in the examiner's bank. */
      newerVersionId: z.uuid().nullable(),
    })
    .nullable(),
});
export type ExaminerTestSlot = z.infer<typeof ExaminerTestSlot>;

export const ExaminerTestSection = z.object({
  id: z.uuid(),
  name: z.string(),
  order: z.number().int(),
  questionCount: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  positiveMarks: z.number(),
  negativeMarks: z.number(),
  subjectId: z.uuid().nullable(),
  subjectName: z.string().nullable(),
  slots: z.array(ExaminerTestSlot),
});
export type ExaminerTestSection = z.infer<typeof ExaminerTestSection>;

export const ExaminerTestDetail = ExaminerTestSummary.extend({
  sections: z.array(ExaminerTestSection),
  /** Allowed price for a paid test at the examiner's tier. */
  priceBand: z.object({ minPaise: z.number().int(), maxPaise: z.number().int() }),
  /** The last finished QC review round, if any. */
  review: z
    .object({ status: z.string(), comments: z.string().nullable(), completedAt: IsoTime, slaDeadlineAt: IsoTime.nullable() })
    .nullable(),
  /** The open review round's deadline while the test is with QC. */
  qcDeadlineAt: IsoTime.nullable(),
});
export type ExaminerTestDetail = z.infer<typeof ExaminerTestDetail>;

/** Replaces one section's slots in order; null leaves a slot empty. Length must equal the section size. */
export const SetSectionQuestionsRequest = z.strictObject({
  expectedUpdatedAt: IsoTime,
  questionIds: z.array(z.uuid().nullable()).min(1).max(500),
});
export type SetSectionQuestionsRequest = z.infer<typeof SetSectionQuestionsRequest>;

/** Places a committed import's questions at their workbook section and position. */
export const FillTestFromImportRequest = z.strictObject({
  expectedUpdatedAt: IsoTime,
  importId: z.uuid(),
});
export type FillTestFromImportRequest = z.infer<typeof FillTestFromImportRequest>;

export const ExaminerTestActionRequest = z.strictObject({ expectedUpdatedAt: IsoTime });
export type ExaminerTestActionRequest = z.infer<typeof ExaminerTestActionRequest>;

/** One rule finding on a placed question (PRD 5.1 policy; QC_PIPELINE "Checks and policy"). */
export const PrecheckIssue = z.object({
  questionId: z.uuid(),
  sectionName: z.string(),
  position: z.number().int(),
  severity: z.enum(['block', 'warn']),
  message: z.string(),
});
export type PrecheckIssue = z.infer<typeof PrecheckIssue>;

export const TestPrecheck = z.object({
  canSubmit: z.boolean(),
  blockingErrors: z.array(z.string()),
  pyqPercentage: z.number(),
  sectionMismatches: z.array(
    z.object({ sectionName: z.string(), expectedCount: z.number().int(), actualCount: z.number().int() }),
  ),
  issues: z.array(PrecheckIssue),
  /** Topic counts next to the template targets: a warning, never a block. */
  patternFit: z.array(PatternFitRow),
});
export type TestPrecheck = z.infer<typeof TestPrecheck>;

export const SubmitExaminerTestResponse = z.object({ test: ExaminerTestDetail, precheck: TestPrecheck });
export type SubmitExaminerTestResponse = z.infer<typeof SubmitExaminerTestResponse>;

// Series ---------------------------------------------------------------------------------

export const CreateExaminerSeriesRequest = z.strictObject({
  examId: z.uuid(),
  stageId: z.uuid().nullable(),
  title: Title,
  description: z.string().trim().max(2000),
  pricePaise: Paise,
  validityDays: z.number().int().min(1).max(1095),
  totalPlannedTests: z.number().int().min(1).max(200),
});
export type CreateExaminerSeriesRequest = z.infer<typeof CreateExaminerSeriesRequest>;

export const UpdateExaminerSeriesRequest = z.strictObject({
  expectedUpdatedAt: IsoTime,
  title: Title.optional(),
  description: z.string().trim().max(2000).optional(),
  pricePaise: Paise.optional(),
  validityDays: z.number().int().min(1).max(1095).optional(),
  totalPlannedTests: z.number().int().min(1).max(200).optional(),
});
export type UpdateExaminerSeriesRequest = z.infer<typeof UpdateExaminerSeriesRequest>;

export const ExaminerSeries = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  examId: z.uuid(),
  examName: z.string(),
  stageId: z.uuid().nullable(),
  stageName: z.string().nullable(),
  description: z.string(),
  pricePaise: z.number().int(),
  validityDays: z.number().int(),
  totalPlannedTests: z.number().int(),
  isPublished: z.boolean(),
  testCount: z.number().int(),
  /** Tests in the series that passed review and are live; a series is published only with one or more. */
  liveTestCount: z.number().int(),
  updatedAt: IsoTime,
});
export type ExaminerSeries = z.infer<typeof ExaminerSeries>;

export const ExaminerSeriesList = z.object({ items: z.array(ExaminerSeries) });
export type ExaminerSeriesList = z.infer<typeof ExaminerSeriesList>;

export const ExaminerSeriesDetail = ExaminerSeries.extend({ tests: z.array(ExaminerTestSummary) });
export type ExaminerSeriesDetail = z.infer<typeof ExaminerSeriesDetail>;
