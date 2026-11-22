import { z } from 'zod';

/*
 * Admin catalogue (M2, PRD 3 and 8 "Exams and templates"): categories, exams, stages, the
 * syllabus tree (subjects and topics) and exam templates, under /v1/admin/catalogue. Ops or
 * super admins only. Every change is written to admin_audit_logs in the same transaction.
 *
 * Templates are drafts until published. A published template is frozen (invariant 2): it can
 * only be retired or reinstated, and a change is made by publishing a new version.
 */

const Id = z.uuid();
const IsoTime = z.iso.datetime({ offset: true });
const Name = z.string().trim().min(1).max(120);
/** Lowercase words joined by single hyphens; used in public URLs. */
export const Slug = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');
const Order = z.number().int().min(0).max(999);
const Marks = z.number().min(0).max(100).multipleOf(0.01);
/** Optimistic concurrency: the updatedAt the editor loaded. A newer save is refused (409). */
const ExpectedUpdatedAt = IsoTime;

// Categories --------------------------------------------------------------------------
export const AdminCategory = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  examCount: z.number().int().nonnegative(),
});
export type AdminCategory = z.infer<typeof AdminCategory>;
export const AdminCategoryList = z.object({ items: z.array(AdminCategory) });
export type AdminCategoryList = z.infer<typeof AdminCategoryList>;

export const CreateCategoryRequest = z.strictObject({ name: Name, slug: Slug, displayOrder: Order.optional() });
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequest>;
export const UpdateCategoryRequest = z
  .strictObject({ name: Name, slug: Slug, displayOrder: Order, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequest>;

// Exams -------------------------------------------------------------------------------
export const ExamDateInput = z.strictObject({
  label: z.string().trim().min(1).max(80),
  date: z.iso.date(),
});
export type ExamDateInput = z.infer<typeof ExamDateInput>;
export const ExamCutoff = z.strictObject({
  /** For example "2024, General". */
  label: z.string().trim().min(1).max(80),
  score: z.number().min(0).max(1000).multipleOf(0.01),
});
export type ExamCutoff = z.infer<typeof ExamCutoff>;

export const TemplateStatus = z.enum(['draft', 'published', 'retired']);
export type TemplateStatus = z.infer<typeof TemplateStatus>;

export const AdminExamSummary = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  category: z.object({ id: Id, name: z.string() }),
  /** Shown on the website. New exams start hidden. */
  isActive: z.boolean(),
  stageCount: z.number().int().nonnegative(),
  subjectCount: z.number().int().nonnegative(),
  publishedTemplateCount: z.number().int().nonnegative(),
  draftTemplateCount: z.number().int().nonnegative(),
  updatedAt: IsoTime,
});
export type AdminExamSummary = z.infer<typeof AdminExamSummary>;
export const AdminExamList = z.object({ items: z.array(AdminExamSummary) });
export type AdminExamList = z.infer<typeof AdminExamList>;

export const AdminStage = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  displayOrder: z.number().int(),
  /** Used by a template or test, so it cannot be deleted. */
  inUse: z.boolean(),
});
export type AdminStage = z.infer<typeof AdminStage>;

export const AdminTopic = z.object({ id: Id, name: z.string(), inUse: z.boolean() });
export type AdminTopic = z.infer<typeof AdminTopic>;
export const AdminSubject = z.object({ id: Id, name: z.string(), inUse: z.boolean(), topics: z.array(AdminTopic) });
export type AdminSubject = z.infer<typeof AdminSubject>;

export const AdminTemplateSummary = z.object({
  id: Id,
  name: z.string(),
  stage: z.object({ id: Id, name: z.string() }),
  version: z.number().int().positive(),
  status: TemplateStatus,
  totalQuestions: z.number().int(),
  totalDurationSeconds: z.number().int(),
  sectionCount: z.number().int().nonnegative(),
  /** Tests built on this template. */
  testCount: z.number().int().nonnegative(),
  publishedAt: IsoTime.nullable(),
  updatedAt: IsoTime,
});
export type AdminTemplateSummary = z.infer<typeof AdminTemplateSummary>;

export const AdminExam = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  category: z.object({ id: Id, name: z.string() }),
  isActive: z.boolean(),
  syllabusMarkdown: z.string().nullable(),
  importantDates: z.array(ExamDateInput),
  previousCutoffs: z.array(ExamCutoff),
  lastCutoffScore: z.number().nullable(),
  /** Live tests on the website; the slug is locked while the exam is shown and has any. */
  liveTestCount: z.number().int().nonnegative(),
  updatedAt: IsoTime,
  stages: z.array(AdminStage),
  subjects: z.array(AdminSubject),
  templates: z.array(AdminTemplateSummary),
});
export type AdminExam = z.infer<typeof AdminExam>;

export const CreateExamRequest = z.strictObject({ categoryId: Id, name: Name, slug: Slug });
export type CreateExamRequest = z.infer<typeof CreateExamRequest>;
export const UpdateExamRequest = z.strictObject({
  expectedUpdatedAt: ExpectedUpdatedAt,
  categoryId: Id.optional(),
  name: Name.optional(),
  slug: Slug.optional(),
  isActive: z.boolean().optional(),
  syllabusMarkdown: z.string().max(20000).nullable().optional(),
  importantDates: z.array(ExamDateInput).max(20).optional(),
  previousCutoffs: z.array(ExamCutoff).max(30).optional(),
  lastCutoffScore: z.number().min(0).max(1000).multipleOf(0.01).nullable().optional(),
});
export type UpdateExamRequest = z.infer<typeof UpdateExamRequest>;

// Stages and syllabus tree ------------------------------------------------------------
export const StageRequest = z.strictObject({ name: Name, slug: Slug, displayOrder: Order.optional() });
export type StageRequest = z.infer<typeof StageRequest>;
export const NameRequest = z.strictObject({ name: Name });
export type NameRequest = z.infer<typeof NameRequest>;
/** Adds several topics at once (one per line in the editor); existing names are skipped. */
export const CreateTopicsRequest = z.strictObject({ names: z.array(Name).min(1).max(100) });
export type CreateTopicsRequest = z.infer<typeof CreateTopicsRequest>;

// Templates ---------------------------------------------------------------------------
export const TemplateSectionInput = z.strictObject({
  name: Name,
  /** Questions in this section are tagged from this subject's topics. */
  subjectId: Id.nullable(),
  questionCount: z.number().int().min(1).max(500),
  /** Required for every section when the template has sectional timing, otherwise null. */
  durationSeconds: z.number().int().min(60).max(21600).nullable(),
  positiveMarks: Marks,
  negativeMarks: Marks,
  /** Target questions per topic id, for the pattern-fit warning (PRD 3). */
  targetTopicCounts: z.record(Id, z.number().int().min(1).max(500)),
});
export type TemplateSectionInput = z.infer<typeof TemplateSectionInput>;

const TemplateFields = {
  stageId: Id,
  name: Name,
  totalQuestions: z.number().int().min(1).max(500),
  totalDurationSeconds: z.number().int().min(60).max(21600),
  hasSectionalTiming: z.boolean(),
  defaultPositiveMarks: Marks,
  defaultNegativeMarks: Marks,
  sections: z.array(TemplateSectionInput).max(20),
};
/** A draft may be incomplete or inconsistent; publishing checks it (see `issues`). */
export const CreateTemplateRequest = z.strictObject(TemplateFields);
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequest>;
export const UpdateTemplateRequest = z.strictObject({ ...TemplateFields, expectedUpdatedAt: ExpectedUpdatedAt });
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateRequest>;
export const TemplateActionRequest = z.strictObject({ expectedUpdatedAt: ExpectedUpdatedAt });
export type TemplateActionRequest = z.infer<typeof TemplateActionRequest>;

export const AdminTemplate = AdminTemplateSummary.extend({
  examId: Id,
  hasSectionalTiming: z.boolean(),
  defaultPositiveMarks: z.number(),
  defaultNegativeMarks: z.number(),
  sections: z.array(TemplateSectionInput.extend({ id: Id })),
  /** The published version this draft replaces, if any. */
  supersedesTemplateId: Id.nullable(),
  /** What stops this draft from being published; empty when it can be. */
  issues: z.array(z.string()),
});
export type AdminTemplate = z.infer<typeof AdminTemplate>;

// History -----------------------------------------------------------------------------
export const AuditEntry = z.object({
  id: Id,
  at: IsoTime,
  actor: z.object({ id: Id, name: z.string(), email: z.string().nullable() }),
  action: z.string(),
  table: z.string(),
  recordId: Id,
  /** Field names that changed (empty for creations and deletions). */
  changedFields: z.array(z.string()),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
export const AuditList = z.object({ items: z.array(AuditEntry) });
export type AuditList = z.infer<typeof AuditList>;
export * from './template-rules.js';
