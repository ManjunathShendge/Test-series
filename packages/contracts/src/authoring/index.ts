import { z } from 'zod';

export const ExaminerApplicationStatus = z.enum(['pending', 'approved', 'rejected']);
export type ExaminerApplicationStatus = z.infer<typeof ExaminerApplicationStatus>;

export const ExaminerSocialLinks = z.object({
  website: z.string().trim().max(500).optional(),
  linkedin: z.string().trim().max(500).optional(),
  youtube: z.string().trim().max(500).optional(),
});
export type ExaminerSocialLinks = z.infer<typeof ExaminerSocialLinks>;

type HindiFields = {
  stemHi?: string | null | undefined;
  solutionHi?: string | null | undefined;
  options: { id: string; textHi?: string | null | undefined }[];
};

/**
 * Hindi is optional, but a question that has any Hindi must be complete: a half-translated
 * question cannot be shown in a Hindi paper. Returns the missing field paths, or [] when the
 * question is English-only or fully bilingual. Blank strings count as absent.
 */
export function missingHindiFields(question: HindiFields): string[] {
  const fields: [string, string | null | undefined][] = [
    ['stemHi', question.stemHi],
    ...question.options.map(
      (option, index) => [`options.${index}.textHi`, option.textHi] as [string, string | null | undefined],
    ),
    ['solutionHi', question.solutionHi],
  ];
  const missing = fields.filter(([, value]) => !value?.trim()).map(([path]) => path);
  return missing.length === fields.length ? [] : missing;
}

function refineHindi(question: HindiFields, ctx: z.RefinementCtx) {
  for (const path of missingHindiFields(question)) {
    ctx.addIssue({
      code: 'custom',
      path: path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      message: 'Hindi must be complete: add it here or remove the Hindi from the other fields.',
    });
  }
}

export const ExaminerSample = z
  .object({
    position: z.number().int().min(1).max(10),
    examId: z.uuid(),
    subjectId: z.uuid(),
    topicId: z.uuid(),
    stemEn: z.string().trim().min(1).max(20_000),
    stemHi: z.string().trim().max(20_000).optional(),
    options: z
      .array(
        z.object({
          id: z.enum(['A', 'B', 'C', 'D']),
          textEn: z.string().trim().min(1).max(10_000),
          textHi: z.string().trim().max(10_000).optional(),
        }),
      )
      .length(4),
    correctOption: z.enum(['A', 'B', 'C', 'D']),
    solutionEn: z.string().trim().min(1).max(20_000),
    solutionHi: z.string().trim().max(20_000).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    imageAssetIds: z.array(z.uuid()).max(20).default([]),
  })
  .superRefine((sample, ctx) => {
    if (new Set(sample.options.map((option) => option.id)).size !== 4) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option IDs must be unique.' });
    }
    if (!sample.options.some((option) => option.id === sample.correctOption)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOption'],
        message: 'The key must identify one of the four options.',
      });
    }
    refineHindi(sample, ctx);
  });
export type ExaminerSample = z.infer<typeof ExaminerSample>;

export const CreateExaminerApplicationRequest = z
  .strictObject({
    accountType: z.enum(['individual', 'institute']),
    instituteName: z.string().trim().max(200).optional(),
    bio: z.string().trim().min(20).max(4_000),
    experienceYears: z.number().int().min(0).max(80).optional(),
    socialLinks: ExaminerSocialLinks.default({}),
    examIds: z.array(z.uuid()).min(1).max(20),
    subjectIds: z.array(z.uuid()).min(1).max(50),
    photoAssetId: z.uuid().optional(),
    panDocAssetId: z.uuid().optional(),
    bankProofAssetId: z.uuid().optional(),
    businessProofAssetId: z.uuid().optional(),
    agreementVersion: z.string().trim().min(1).max(100),
    samples: z.array(ExaminerSample).length(10),
  })
  .superRefine((request, ctx) => {
    if (request.accountType === 'institute' && !request.instituteName) {
      ctx.addIssue({
        code: 'custom',
        path: ['instituteName'],
        message: 'Institute name is required.',
      });
    }
    const positions = request.samples.map((sample) => sample.position);
    if (new Set(positions).size !== 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['samples'],
        message: 'Samples must use unique positions 1 through 10.',
      });
    }
    if (new Set(request.examIds).size !== request.examIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['examIds'],
        message: 'Exam selections must be unique.',
      });
    }
    if (new Set(request.subjectIds).size !== request.subjectIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['subjectIds'],
        message: 'Subject selections must be unique.',
      });
    }
    if (request.samples.some((sample) => !request.examIds.includes(sample.examId))) {
      ctx.addIssue({
        code: 'custom',
        path: ['samples'],
        message: 'Each sample must use a selected exam.',
      });
    }
    if (request.samples.some((sample) => !request.subjectIds.includes(sample.subjectId))) {
      ctx.addIssue({
        code: 'custom',
        path: ['samples'],
        message: 'Each sample must use a selected subject.',
      });
    }
  });
export type CreateExaminerApplicationRequest = z.infer<typeof CreateExaminerApplicationRequest>;

export const ExaminerAuthoringOptions = z.object({
  agreementVersion: z.string().min(1).nullable(),
  agreementText: z.string().min(1).nullable(),
  exams: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      stages: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          templates: z.array(
            z.object({ id: z.uuid(), name: z.string(), version: z.number().int().positive() }),
          ),
        }),
      ),
      subjects: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          topics: z.array(z.object({ id: z.uuid(), name: z.string() })),
        }),
      ),
    }),
  ),
});
export type ExaminerAuthoringOptions = z.infer<typeof ExaminerAuthoringOptions>;

export const DecideExaminerApplicationRequest = z
  .strictObject({
    status: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().trim().min(5).max(2_000).optional(),
  })
  .superRefine((request, ctx) => {
    if (request.status === 'rejected' && !request.rejectionReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['rejectionReason'],
        message: 'A rejection reason is required.',
      });
    }
  });
export type DecideExaminerApplicationRequest = z.infer<typeof DecideExaminerApplicationRequest>;

export const ExaminerApplication = z.object({
  id: z.uuid(),
  examinerId: z.uuid(),
  examinerName: z.string(),
  examinerEmail: z.string().email().nullable(),
  accountType: z.enum(['individual', 'institute']),
  instituteName: z.string().nullable(),
  bio: z.string(),
  experienceYears: z.number().int().nullable(),
  socialLinks: ExaminerSocialLinks,
  examIds: z.array(z.uuid()),
  subjectIds: z.array(z.uuid()),
  agreementVersion: z.string().nullable(),
  agreementAcceptedAt: z.string().nullable(),
  photoAssetId: z.uuid().nullable(),
  panDocAssetId: z.uuid().nullable(),
  bankProofAssetId: z.uuid().nullable(),
  businessProofAssetId: z.uuid().nullable(),
  status: ExaminerApplicationStatus,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  samples: z.array(ExaminerSample),
});
export type ExaminerApplication = z.infer<typeof ExaminerApplication>;

export const ExaminerApplicationList = z.object({
  items: z.array(ExaminerApplication),
});
export type ExaminerApplicationList = z.infer<typeof ExaminerApplicationList>;
// An object, not a bare null: Nest sends an empty body for a null return, which no JSON client can parse.
export const ExaminerApplicationStatusResponse = z.object({ application: ExaminerApplication.nullable() });
export type ExaminerApplicationStatusResponse = z.infer<typeof ExaminerApplicationStatusResponse>;

export const AssetUploadIntentRequest = z.strictObject({
  classification: z.enum(['public_media', 'question_asset', 'examiner_kyc', 'import_archive']),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});
export type AssetUploadIntentRequest = z.infer<typeof AssetUploadIntentRequest>;

export const AssetUploadIntent = z.object({
  id: z.uuid(),
  bucket: z.string(),
  objectKey: z.string(),
  uploadUrl: z.url(),
  expiresAt: z.string(),
});
export type AssetUploadIntent = z.infer<typeof AssetUploadIntent>;

export const AdminKycDownloadUrl = z.object({
  url: z.url(),
  expiresAt: z.string(),
});
export type AdminKycDownloadUrl = z.infer<typeof AdminKycDownloadUrl>;

export const CompleteAssetRequest = z.strictObject({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});
export type CompleteAssetRequest = z.infer<typeof CompleteAssetRequest>;

export const CompleteAssetResponse = z.object({
  id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});
export type CompleteAssetResponse = z.infer<typeof CompleteAssetResponse>;

export const DraftQuestionInput = z
  .strictObject({
    examId: z.uuid(),
    subjectId: z.uuid(),
    topicId: z.uuid(),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    passageId: z.uuid().nullable().optional(),
    stemEn: z.string().trim().min(1).max(20_000),
    stemHi: z.string().trim().max(20_000).optional(),
    options: z
      .array(
        z.object({
          id: z.enum(['A', 'B', 'C', 'D']),
          textEn: z.string().trim().min(1).max(10_000),
          textHi: z.string().trim().max(10_000).optional(),
        }),
      )
      .length(4),
    correctOption: z.enum(['A', 'B', 'C', 'D']),
    solutionEn: z.string().trim().min(1).max(20_000),
    solutionHi: z.string().trim().max(20_000).optional(),
    isPyq: z.boolean().default(false),
    pyqYear: z.number().int().min(1900).max(2100).optional(),
    pyqShift: z.string().trim().max(100).optional(),
    imageAssetIds: z.array(z.uuid()).max(20).default([]),
    expectedRevision: z.number().int().positive().optional(),
  })
  .superRefine((question, ctx) => {
    if (new Set(question.options.map((option) => option.id)).size !== 4) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option IDs must be unique.' });
    }
    if (!question.options.some((option) => option.id === question.correctOption)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOption'],
        message: 'The key must identify one of the four options.',
      });
    }
    if (question.isPyq && question.pyqYear === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['pyqYear'],
        message: 'A year is required for a previous-year question.',
      });
    }
    refineHindi(question, ctx);
  });
export type DraftQuestionInput = z.infer<typeof DraftQuestionInput>;

export const DraftQuestion = z.object({
  id: z.uuid(),
  examId: z.uuid(),
  subjectId: z.uuid(),
  topicId: z.uuid(),
  passageId: z.uuid().nullable(),
  versionNumber: z.number().int().positive(),
  questionType: z.enum(['single_mcq', 'comprehension_mcq', 'multi_mcq', 'numeric']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  stemEn: z.string(),
  stemHi: z.string().nullable(),
  options: z.array(
    z.object({
      id: z.enum(['A', 'B', 'C', 'D']),
      textEn: z.string(),
      textHi: z.string().optional(),
    }),
  ),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  solutionEn: z.string(),
  solutionHi: z.string().nullable(),
  isApproved: z.boolean(),
  isPyq: z.boolean(),
  pyqYear: z.number().int().nullable(),
  pyqShift: z.string().nullable(),
  imageAssetIds: z.array(z.uuid()),
  updatedAt: z.string(),
});
export type DraftQuestion = z.infer<typeof DraftQuestion>;

export const QUESTION_BANK_PAGE_SIZE = 25;

/** Query string for the examiner's own bank: latest version of each question. */
export const QuestionBankQuery = z.strictObject({
  status: z.enum(['all', 'draft', 'approved']).default('all'),
  examId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  topicId: z.uuid().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type QuestionBankQuery = z.infer<typeof QuestionBankQuery>;

export const BankQuestion = DraftQuestion.extend({
  passage: z
    .object({
      id: z.uuid(),
      contentEn: z.string(),
      contentHi: z.string().nullable(),
      imageAssetIds: z.array(z.uuid()),
    })
    .nullable(),
});
export type BankQuestion = z.infer<typeof BankQuestion>;

export const DraftQuestionList = z.object({
  items: z.array(BankQuestion),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type DraftQuestionList = z.infer<typeof DraftQuestionList>;

/** Short-lived signed link to view one of the caller's own verified question images. */
export const AssetViewUrl = z.object({ url: z.url(), expiresAt: z.string() });
export type AssetViewUrl = z.infer<typeof AssetViewUrl>;

export const ImportPreviewRequest = z.strictObject({
  examId: z.uuid(),
  stageId: z.uuid(),
  templateId: z.uuid(),
  idempotencyKey: z.string().trim().min(1).max(200),
  assetId: z.uuid(),
});
export type ImportPreviewRequest = z.infer<typeof ImportPreviewRequest>;

/** GET /examiner/imports/template: an XLSX with the template's sections and the examiner's codes. */
export const ImportTemplateQuery = z.strictObject({
  examId: z.uuid(),
  stageId: z.uuid(),
  templateId: z.uuid(),
});
export type ImportTemplateQuery = z.infer<typeof ImportTemplateQuery>;

export const ImportRowError = z.object({
  sheet: z.enum(['Questions', 'Groups']).optional(),
  row: z.number().int().positive(),
  cell: z.string().nullable(),
  code: z.enum([
    'REQUIRED',
    'INVALID_ENUM',
    'INVALID_UUID',
    'INVALID_OPTION',
    'INVALID_OPTION_COUNT',
    'INVALID_TAXONOMY',
    'INVALID_POSITION',
    'INVALID_SOURCE',
    'INVALID_GROUP',
    'INVALID_ASSET',
    'DUPLICATE_ROW',
    'UNSUPPORTED_IMAGE',
    'UNSUPPORTED_GROUP',
    'UNSUPPORTED_FORMULA',
    'INVALID_CONTENT',
  ]),
  message: z.string(),
});
export type ImportRowError = z.infer<typeof ImportRowError>;

export const ImportPreview = z.object({
  id: z.uuid(),
  idempotencyKey: z.string().min(1).max(200),
  status: z.enum(['accepted', 'rejected']),
  fileHash: z.string(),
  manifestHash: z.string(),
  parsedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  errors: z.array(ImportRowError),
});
export type ImportPreview = z.infer<typeof ImportPreview>;

export const ImportCommitRequest = z.strictObject({
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().trim().min(1).max(200),
});
export type ImportCommitRequest = z.infer<typeof ImportCommitRequest>;

export const ImportCommitResponse = z.object({
  id: z.uuid(),
  questionIds: z.array(z.uuid()),
});
export type ImportCommitResponse = z.infer<typeof ImportCommitResponse>;
