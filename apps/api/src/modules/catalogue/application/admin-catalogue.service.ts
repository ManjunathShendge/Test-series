import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type Queryable } from '@exam-prep/db';
import {
  ExamCutoff,
  ExamDateInput,
  templateIssues,
  type AdminCategory,
  type AdminExam,
  type AdminExamSummary,
  type AdminTemplate,
  type AdminTemplateSummary,
  type AuditEntry,
  type CreateCategoryRequest,
  type CreateExamRequest,
  type CreateTemplateRequest,
  type StageRequest,
  type TemplateSectionInput,
  type TemplateStatus,
  type UpdateCategoryRequest,
  type UpdateExamRequest,
  type UpdateTemplateRequest,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import {
  adminCatalogueRepository as repo,
  auditAs,
  type CategoryRow,
  type SectionRow,
  type TemplateRow,
} from '../repositories/admin-catalogue.repository.js';

const HISTORY_LIMIT = 50;
const num = (v: string | null): number | null => (v === null ? null : Number(v));
const iso = (d: Date) => d.toISOString();

const stale = () =>
  new ApiError(409, 'STALE_EDIT', 'Someone else saved this after you opened it. Reload to see their changes, then make yours again.');
const inUse = (message: string) => new ApiError(409, 'IN_USE', message);
const locked = () => new ApiError(409, 'TEMPLATE_LOCKED', 'This template is published and locked. Create a new version to change it.');
const invalid = (message: string, path = '') =>
  new ApiError(400, 'VALIDATION_FAILED', message, { issues: [{ path, message }] });

const pgError = (e: unknown) => e as { code?: string; constraint?: string; message?: string } | null;

/** Turns database refusals into the contract's error codes; anything else is rethrown. */
function mapDatabaseError(error: unknown): never {
  const e = pgError(error);
  switch (e?.code) {
    case '23505': {
      const field = e.constraint?.includes('slug') ? 'slug' : 'name';
      throw new ApiError(409, 'ALREADY_EXISTS', field === 'slug' ? 'That web address is already used. Choose another.' : 'That name is already used here. Choose another.', { field });
    }
    case '23503':
      throw inUse('Something still uses this, so it cannot be removed.');
    case '55000':
      throw locked();
    case '23514':
      throw invalid(e.message ?? 'The change is not allowed.');
    case '42501':
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');
    default:
      throw error;
  }
}

/** Admin-entered JSON; malformed entries (from before validation existed) are dropped. */
function list<T>(raw: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T[] {
  return Array.isArray(raw) ? raw.flatMap((x) => {
    const r = schema.safeParse(x);
    return r.success ? [r.data as T] : [];
  }) : [];
}

function status(row: Pick<TemplateRow, 'published_at' | 'is_active'>): TemplateStatus {
  if (!row.published_at) return 'draft';
  return row.is_active ? 'published' : 'retired';
}

function toCategory(row: CategoryRow): AdminCategory {
  return { id: row.id, name: row.name, slug: row.slug, displayOrder: row.display_order, isActive: row.is_active, examCount: row.exam_count };
}

function toTemplateSummary(row: TemplateRow): AdminTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    stage: { id: row.stage_id, name: row.stage_name },
    version: row.version,
    status: status(row),
    totalQuestions: row.total_questions,
    totalDurationSeconds: row.total_duration_seconds,
    sectionCount: row.section_count,
    testCount: row.test_count,
    publishedAt: row.published_at ? iso(row.published_at) : null,
    updatedAt: iso(row.updated_at),
  };
}

function toSection(row: SectionRow): TemplateSectionInput & { id: string } {
  return {
    id: row.id,
    name: row.name,
    subjectId: row.subject_id,
    questionCount: row.question_count,
    durationSeconds: row.duration_seconds,
    positiveMarks: Number(row.positive_marks),
    negativeMarks: Number(row.negative_marks),
    targetTopicCounts: row.target_topic_counts ?? {},
  };
}

/**
 * Admin catalogue (PRD 8 "Exams and templates"). Routes already require an admin with the ops
 * permission; this service checks again and runs every change inside withUser, where the
 * database's admin-only triggers apply and audit_privileged_change records who changed what
 * (with before/after state) in the same transaction, under a named action.
 */
@Injectable()
export class AdminCatalogueService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private run<T>(access: AccessContext, action: string | null, work: (c: Queryable) => Promise<T>): Promise<T> {
    if (!access.roles.includes('admin') || !(access.admin.ops || access.admin.super)) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    return withUser(this.db, access.profileId, async (c) => {
      if (action) await auditAs(c, action);
      try {
        return await work(c);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        mapDatabaseError(error);
      }
    });
  }

  // Categories ----------------------------------------------------------------------
  listCategories(access: AccessContext): Promise<AdminCategory[]> {
    return this.run(access, null, async (c) => (await repo.categories(c)).map(toCategory));
  }

  createCategory(access: AccessContext, req: CreateCategoryRequest): Promise<AdminCategory> {
    return this.run(access, 'catalogue.category.create', async (c) => {
      const id = await repo.insertCategory(c, { name: req.name, slug: req.slug, displayOrder: req.displayOrder ?? 0 });
      return toCategory((await repo.category(c, id))!);
    });
  }

  updateCategory(access: AccessContext, id: string, req: UpdateCategoryRequest): Promise<AdminCategory> {
    return this.run(access, 'catalogue.category.update', async (c) => {
      if (!(await repo.updateCategory(c, id, req))) throw notFound('Category');
      return toCategory((await repo.category(c, id))!);
    });
  }

  deleteCategory(access: AccessContext, id: string): Promise<void> {
    return this.run(access, 'catalogue.category.delete', async (c) => {
      const row = await repo.category(c, id);
      if (!row) throw notFound('Category');
      if (row.exam_count > 0) throw inUse('This category has exams. Move or hide them instead of deleting the category.');
      await repo.deleteCategory(c, id);
    });
  }

  // Exams ---------------------------------------------------------------------------
  listExams(access: AccessContext): Promise<AdminExamSummary[]> {
    return this.run(access, null, async (c) =>
      (await repo.exams(c)).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        category: { id: r.category_id, name: r.category_name },
        isActive: r.is_active,
        stageCount: r.stage_count,
        subjectCount: r.subject_count,
        publishedTemplateCount: r.published_template_count,
        draftTemplateCount: r.draft_template_count,
        updatedAt: iso(r.updated_at),
      })),
    );
  }

  getExam(access: AccessContext, id: string): Promise<AdminExam> {
    return this.run(access, null, (c) => this.loadExam(c, id));
  }

  createExam(access: AccessContext, req: CreateExamRequest): Promise<AdminExam> {
    return this.run(access, 'catalogue.exam.create', async (c) => {
      if (!(await repo.category(c, req.categoryId))) throw invalid('Choose an existing category.', 'categoryId');
      const id = await repo.insertExam(c, req);
      return this.loadExam(c, id);
    });
  }

  updateExam(access: AccessContext, id: string, req: UpdateExamRequest): Promise<AdminExam> {
    return this.run(access, 'catalogue.exam.update', async (c) => {
      const current = await repo.exam(c, id, true);
      if (!current) throw notFound('Exam');
      if (req.categoryId && req.categoryId !== current.category_id && !(await repo.category(c, req.categoryId))) {
        throw invalid('Choose an existing category.', 'categoryId');
      }
      // Students and search engines already link to a shown exam with live tests.
      if (req.slug && req.slug !== current.slug && current.is_active && current.live_test_count > 0) {
        throw inUse('The web address cannot change while this exam is on the website with live tests.');
      }
      if (req.isActive === true && !current.is_active && !(await repo.hasPublishedTemplate(c, id))) {
        throw inUse('Publish a template for this exam before showing it on the website.');
      }
      const ok = await repo.updateExam(c, id, req.expectedUpdatedAt, {
        category_id: req.categoryId,
        name: req.name,
        slug: req.slug,
        is_active: req.isActive,
        syllabus_markdown: req.syllabusMarkdown === undefined ? undefined : req.syllabusMarkdown?.trim() || null,
        important_dates: req.importantDates === undefined ? undefined : JSON.stringify(req.importantDates),
        previous_cutoffs: req.previousCutoffs === undefined ? undefined : JSON.stringify(req.previousCutoffs),
        last_cutoff_score: req.lastCutoffScore,
        ai_answer_check_enabled: req.aiChecks?.answer,
        ai_ambiguity_check_enabled: req.aiChecks?.ambiguity,
        ai_language_check_enabled: req.aiChecks?.language,
      });
      if (!ok) throw stale();
      return this.loadExam(c, id);
    });
  }

  getHistory(access: AccessContext, examId: string): Promise<AuditEntry[]> {
    return this.run(access, null, async (c) => {
      if (!(await repo.exam(c, examId))) throw notFound('Exam');
      return (await repo.history(c, examId, HISTORY_LIMIT)).map((r) => ({
        id: r.id,
        at: iso(r.created_at),
        actor: { id: r.actor_id, name: r.actor_name, email: r.actor_email },
        action: r.action_name,
        table: r.target_table,
        recordId: r.target_record_id,
        changedFields: r.changed,
      }));
    });
  }

  // Stages --------------------------------------------------------------------------
  addStage(access: AccessContext, examId: string, req: StageRequest): Promise<AdminExam> {
    return this.run(access, 'catalogue.stage.create', async (c) => {
      if (!(await repo.exam(c, examId))) throw notFound('Exam');
      await repo.insertStage(c, examId, req);
      return this.loadExam(c, examId);
    });
  }

  updateStage(access: AccessContext, id: string, req: StageRequest): Promise<AdminExam> {
    return this.run(access, 'catalogue.stage.update', async (c) => {
      const stage = await repo.stage(c, id);
      if (!stage) throw notFound('Stage');
      await repo.updateStage(c, id, req);
      return this.loadExam(c, stage.exam_id);
    });
  }

  deleteStage(access: AccessContext, id: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.stage.delete', async (c) => {
      const stage = await repo.stage(c, id);
      if (!stage) throw notFound('Stage');
      if (stage.in_use) throw inUse('A template or test uses this stage, so it cannot be deleted.');
      await repo.deleteStage(c, id);
      return this.loadExam(c, stage.exam_id);
    });
  }

  // Syllabus tree -------------------------------------------------------------------
  addSubject(access: AccessContext, examId: string, name: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.subject.create', async (c) => {
      if (!(await repo.exam(c, examId))) throw notFound('Exam');
      await repo.insertSubject(c, examId, name);
      return this.loadExam(c, examId);
    });
  }

  renameSubject(access: AccessContext, id: string, name: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.subject.rename', async (c) => {
      const subject = await repo.subject(c, id);
      if (!subject) throw notFound('Subject');
      await repo.renameSubject(c, id, name);
      return this.loadExam(c, subject.exam_id);
    });
  }

  deleteSubject(access: AccessContext, id: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.subject.delete', async (c) => {
      const subject = await repo.subject(c, id);
      if (!subject) throw notFound('Subject');
      if (subject.in_use || (await repo.subjectHasTopicTargets(c, id))) {
        throw inUse('Questions or templates use this subject or its topics, so it cannot be deleted. Rename it instead.');
      }
      await repo.deleteSubject(c, id);
      return this.loadExam(c, subject.exam_id);
    });
  }

  addTopics(access: AccessContext, subjectId: string, names: string[]): Promise<{ exam: AdminExam; added: number }> {
    return this.run(access, 'catalogue.topic.create', async (c) => {
      const subject = await repo.subject(c, subjectId);
      if (!subject) throw notFound('Subject');
      // First spelling wins when the same topic is pasted twice in different case.
      const unique = new Map<string, string>();
      for (const n of names) if (!unique.has(n.trim().toLowerCase())) unique.set(n.trim().toLowerCase(), n.trim());
      const added = await repo.insertTopics(c, subjectId, [...unique.values()]);
      return { exam: await this.loadExam(c, subject.exam_id), added };
    });
  }

  renameTopic(access: AccessContext, id: string, name: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.topic.rename', async (c) => {
      const topic = await repo.topic(c, id);
      if (!topic) throw notFound('Topic');
      await repo.renameTopic(c, id, name);
      return this.loadExam(c, topic.exam_id);
    });
  }

  deleteTopic(access: AccessContext, id: string): Promise<AdminExam> {
    return this.run(access, 'catalogue.topic.delete', async (c) => {
      const topic = await repo.topic(c, id);
      if (!topic) throw notFound('Topic');
      if (topic.in_use) throw inUse('Questions or template targets use this topic, so it cannot be deleted. Rename it instead.');
      await repo.deleteTopic(c, id);
      return this.loadExam(c, topic.exam_id);
    });
  }

  // Templates -----------------------------------------------------------------------
  getTemplate(access: AccessContext, id: string): Promise<AdminTemplate> {
    return this.run(access, null, (c) => this.loadTemplate(c, id));
  }

  createTemplate(access: AccessContext, examId: string, req: CreateTemplateRequest): Promise<AdminTemplate> {
    return this.run(access, 'catalogue.template.create', async (c) => {
      if (!(await repo.exam(c, examId))) throw notFound('Exam');
      await this.checkStage(c, examId, req.stageId);
      const id = await repo.insertTemplate(c, examId, req);
      await repo.replaceSections(c, id, normalise(req));
      return this.loadTemplate(c, id);
    });
  }

  updateTemplate(access: AccessContext, id: string, req: UpdateTemplateRequest): Promise<AdminTemplate> {
    return this.run(access, 'catalogue.template.save_draft', async (c) => {
      const current = await repo.template(c, id, true);
      if (!current) throw notFound('Template');
      if (current.published_at) throw locked();
      await this.checkStage(c, current.exam_id, req.stageId);
      if (!(await repo.updateDraft(c, id, req.expectedUpdatedAt, req))) throw stale();
      await repo.replaceSections(c, id, normalise(req));
      return this.loadTemplate(c, id);
    });
  }

  publishTemplate(access: AccessContext, id: string, expectedUpdatedAt: string): Promise<AdminTemplate> {
    return this.run(access, 'catalogue.template.publish', async (c) => {
      const current = await repo.template(c, id, true);
      if (!current) throw notFound('Template');
      if (current.published_at) throw locked();
      if (Math.abs(current.updated_at.getTime() - Date.parse(expectedUpdatedAt)) >= 1) throw stale();
      const issues = await this.issuesFor(c, current);
      if (issues.length) {
        throw new ApiError(422, 'TEMPLATE_NOT_PUBLISHABLE', 'Fix these before publishing.', { issues });
      }
      await repo.publish(c, id);
      // A new version takes over from the one it replaces; tests on the old one are unaffected.
      if (current.supersedes_template_id) {
        await auditAs(c, 'catalogue.template.retire_superseded');
        await repo.setTemplateActive(c, current.supersedes_template_id, false);
      }
      return this.loadTemplate(c, id);
    });
  }

  /** Copies a published (or retired) template into a new draft version; returns an existing draft if there is one. */
  newVersion(access: AccessContext, id: string): Promise<AdminTemplate> {
    return this.run(access, 'catalogue.template.new_version', async (c) => {
      const source = await repo.template(c, id, true);
      if (!source) throw notFound('Template');
      if (!source.published_at) throw new ApiError(409, 'TEMPLATE_LOCKED', 'This template is still a draft. Edit it directly.');
      const next = await repo.successor(c, id);
      if (next && !next.published_at) return this.loadTemplate(c, next.id);
      if (next) throw new ApiError(409, 'ALREADY_EXISTS', 'A newer version of this template is already published. Start from that one.', { templateId: next.id });
      const sections = (await repo.sections(c, id)).map(toSection);
      const copy = await repo.insertTemplate(
        c,
        source.exam_id,
        {
          stageId: source.stage_id,
          name: source.name,
          totalQuestions: source.total_questions,
          totalDurationSeconds: source.total_duration_seconds,
          hasSectionalTiming: source.has_sectional_timing,
          defaultPositiveMarks: Number(source.default_positive_marks),
          defaultNegativeMarks: Number(source.default_negative_marks),
        },
        { version: source.version + 1, supersedes: source.id },
      );
      await repo.replaceSections(c, copy, sections);
      return this.loadTemplate(c, copy);
    });
  }

  setTemplateAvailable(access: AccessContext, id: string, available: boolean): Promise<AdminTemplate> {
    return this.run(access, available ? 'catalogue.template.reinstate' : 'catalogue.template.retire', async (c) => {
      const current = await repo.template(c, id, true);
      if (!current) throw notFound('Template');
      if (!current.published_at) throw new ApiError(409, 'TEMPLATE_LOCKED', 'Only a published template can be retired or reinstated.');
      if (current.is_active !== available) await repo.setTemplateActive(c, id, available);
      return this.loadTemplate(c, id);
    });
  }

  deleteTemplate(access: AccessContext, id: string): Promise<void> {
    return this.run(access, 'catalogue.template.delete_draft', async (c) => {
      const current = await repo.template(c, id, true);
      if (!current) throw notFound('Template');
      if (current.published_at) throw new ApiError(409, 'TEMPLATE_LOCKED', 'A published template cannot be deleted. Retire it instead.');
      await repo.deleteTemplate(c, id);
    });
  }

  // Helpers -------------------------------------------------------------------------
  private async checkStage(c: Queryable, examId: string, stageId: string): Promise<void> {
    const stage = await repo.stage(c, stageId);
    if (!stage || stage.exam_id !== examId) throw invalid('Choose a stage of this exam.', 'stageId');
  }

  private async issuesFor(c: Queryable, row: TemplateRow): Promise<string[]> {
    const sections = (await repo.sections(c, row.id)).map(toSection);
    return templateIssues(
      { totalQuestions: row.total_questions, totalDurationSeconds: row.total_duration_seconds, hasSectionalTiming: row.has_sectional_timing, sections },
      await repo.topicSubjects(c, row.exam_id),
    );
  }

  private async loadTemplate(c: Queryable, id: string): Promise<AdminTemplate> {
    const row = await repo.template(c, id);
    if (!row) throw notFound('Template');
    const sections = (await repo.sections(c, id)).map(toSection);
    return {
      ...toTemplateSummary(row),
      examId: row.exam_id,
      hasSectionalTiming: row.has_sectional_timing,
      defaultPositiveMarks: Number(row.default_positive_marks),
      defaultNegativeMarks: Number(row.default_negative_marks),
      sections,
      supersedesTemplateId: row.supersedes_template_id,
      issues: row.published_at ? [] : await this.issuesFor(c, row),
    };
  }

  private async loadExam(c: Queryable, id: string): Promise<AdminExam> {
    const exam = await repo.exam(c, id);
    if (!exam) throw notFound('Exam');
    const stages = await repo.stages(c, id);
    const subjects = await repo.subjects(c, id);
    const topics = await repo.topics(c, id);
    const templates = await repo.templates(c, id);
    return {
      id: exam.id,
      name: exam.name,
      slug: exam.slug,
      category: { id: exam.category_id, name: exam.category_name },
      isActive: exam.is_active,
      syllabusMarkdown: exam.syllabus_markdown,
      importantDates: list(exam.important_dates, ExamDateInput),
      previousCutoffs: list(exam.previous_cutoffs, ExamCutoff),
      lastCutoffScore: num(exam.last_cutoff_score),
      aiChecks: { answer: exam.ai_answer_check_enabled, ambiguity: exam.ai_ambiguity_check_enabled, language: exam.ai_language_check_enabled },
      liveTestCount: exam.live_test_count,
      updatedAt: iso(exam.updated_at),
      stages: stages.map((s) => ({ id: s.id, name: s.name, slug: s.slug, displayOrder: s.display_order, inUse: s.in_use })),
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        inUse: s.in_use,
        topics: topics.filter((t) => t.subject_id === s.id).map((t) => ({ id: t.id, name: t.name, inUse: t.in_use })),
      })),
      templates: templates.map(toTemplateSummary),
    };
  }
}

/** Section times only apply with sectional timing; a draft without it stores none. */
function normalise(req: CreateTemplateRequest): TemplateSectionInput[] {
  return req.sections.map((s) => ({ ...s, durationSeconds: req.hasSectionalTiming ? s.durationSeconds : null }));
}
