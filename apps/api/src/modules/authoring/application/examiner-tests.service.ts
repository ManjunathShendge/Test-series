import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import type {
  CreateExaminerSeriesRequest,
  CreateExaminerTestRequest,
  ExaminerSeries,
  ExaminerSeriesDetail,
  ExaminerSeriesList,
  ExaminerTestDetail,
  ExaminerTestList,
  ExaminerTestStatus,
  ExaminerTestSummary,
  FillTestFromImportRequest,
  PrecheckIssue,
  QcItemAction,
  QcReasonCode,
  SetSectionQuestionsRequest,
  SubmitExaminerTestResponse,
  TestPrecheck,
  UpdateExaminerSeriesRequest,
  UpdateExaminerTestRequest,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { identityRepository } from '../../identity/repositories/identity.repository.js';
import { authoringRepository } from '../repositories/authoring.repository.js';
import { qcRepository } from '../../qc/repositories/qc.repository.js';
import {
  examinerTestsRepository as repo,
  type SectionRow,
  type SeriesRow,
  type TestRow,
} from '../repositories/examiner-tests.repository.js';

const EDITABLE = new Set(['draft', 'changes_requested']);
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const priceIssue = (message: string) =>
  new ApiError(422, 'VALIDATION_FAILED', message, { issues: [{ path: 'pricePaise', message }] });
const pgCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

/** Lowercase words joined by hyphens plus a random suffix, so titles may repeat. */
function slugFor(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'test'}-${randomBytes(3).toString('hex')}`;
}

/** Database refusals raised by the test protection triggers, as contract errors. */
function mapDatabaseError(error: unknown): never {
  const code = pgCode(error);
  if (code === '23001')
    throw new ApiError(409, 'QC_LOCKED', 'Questions approved by QC stay in place while you revise the rest.');
  if (code === '42501') throw new ApiError(403, 'FORBIDDEN', 'You cannot change this test.');
  if (code === '23505') throw new ApiError(409, 'ALREADY_EXISTS', 'That question is already in this test.');
  throw error;
}

@Injectable()
export class ExaminerTestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Runs `action` as the approved examiner; anyone else gets 403. */
  private async asExaminer<T>(
    identity: VerifiedIdentity,
    action: (client: DatabaseClient, examinerId: string) => Promise<T>,
  ): Promise<T> {
    const examinerId = await identityRepository.ensureProfile(this.db, identity.uid, identity.email, identity.name);
    return withUser(this.db, examinerId, async (client) => {
      if (!(await authoringRepository.requireExaminer(client, examinerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      try {
        return await action(client, examinerId);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        return mapDatabaseError(error);
      }
    });
  }

  /** Loads, checks editability and version, then locks the test row for this transaction. */
  private async editableTest(
    client: DatabaseClient,
    examinerId: string,
    testId: string,
    expectedUpdatedAt: string,
  ): Promise<TestRow> {
    const current = await repo.getTest(client, examinerId, testId);
    if (!current) throw notFound('Test');
    if (!EDITABLE.has(current.status))
      throw new ApiError(409, 'QC_LOCKED', 'This test was submitted for review and can no longer be edited.');
    const locked = await repo.getTest(client, examinerId, testId, true);
    if (!locked) throw new ApiError(409, 'QC_LOCKED', 'This test can no longer be edited.');
    if (!(await repo.isSameVersion(client, testId, expectedUpdatedAt)))
      throw new ApiError(409, 'STALE_EDIT', 'This test changed since you opened it. Reload to see the latest version.');
    return locked;
  }

  private async validSeries(client: DatabaseClient, examinerId: string, seriesId: string, examId: string) {
    const series = await repo.getSeries(client, examinerId, seriesId);
    if (!series || series.exam_id !== examId)
      throw new ApiError(422, 'VALIDATION_FAILED', 'Choose one of your series for the same exam.', {
        issues: [{ path: 'seriesId', message: 'Choose one of your series for the same exam.' }],
      });
  }

  /**
   * PRD 4.2 step 6 and 5.5: only paid tests carry their own price, inside the exam's band at the
   * examiner's tier; Pass-only tests are always in the Pass; series-only tests need a series.
   */
  private async pricing(
    client: DatabaseClient,
    examinerId: string,
    examId: string,
    input: { accessType: string; pricePaise: number; includedInPass: boolean; seriesId: string | null },
  ): Promise<{ access_type: string; price_paise: number; is_included_in_pass: boolean }> {
    if (input.accessType === 'series_only' && !input.seriesId)
      throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a series for a series-only test.', {
        issues: [{ path: 'seriesId', message: 'Choose a series for a series-only test.' }],
      });
    if (input.accessType !== 'paid')
      return {
        access_type: input.accessType,
        price_paise: 0,
        is_included_in_pass:
          input.accessType === 'pass_included' ? true : input.accessType === 'free' ? false : input.includedInPass,
      };
    const band = (await qcRepository.priceBands(client, examinerId, examId))[0];
    if (!band) throw priceIssue('This exam has no price band for your account.');
    if (input.pricePaise < band.min_paise || input.pricePaise > band.max_paise)
      throw priceIssue(`Set a price from ${rupees(band.min_paise)} to ${rupees(band.max_paise)} for your tier.`);
    return { access_type: 'paid', price_paise: input.pricePaise, is_included_in_pass: input.includedInPass };
  }

  private summary(row: TestRow): ExaminerTestSummary {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      examId: row.exam_id,
      examName: row.exam_name,
      stageId: row.stage_id,
      stageName: row.stage_name,
      templateId: row.template_id,
      templateName: row.template_name,
      templateVersion: row.template_version,
      testType: row.test_type,
      status: row.status as ExaminerTestStatus,
      accessType: row.access_type,
      pricePaise: row.price_paise,
      includedInPass: row.is_included_in_pass,
      hasHindi: row.has_hindi,
      seriesId: row.series_id,
      seriesTitle: row.series_title,
      scheduledPublishAt: row.scheduled_publish_at?.toISOString() ?? null,
      totalQuestions: row.total_questions,
      filledQuestions: row.filled_questions,
      totalDurationSeconds: row.total_duration_seconds,
      totalMarks: Number(row.total_marks),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async detail(client: DatabaseClient, examinerId: string, testId: string): Promise<ExaminerTestDetail> {
    const row = await repo.getTest(client, examinerId, testId);
    if (!row) throw notFound('Test');
    const sections = await repo.listSections(client, testId);
    const items = await repo.listItems(client, testId);
    const feedback = new Map(
      (await qcRepository.feedbackByPosition(client, testId)).map((entry) => [entry.display_order, entry]),
    );
    const band = (await qcRepository.priceBands(client, examinerId, row.exam_id))[0];
    const reviews = await qcRepository.reviewSummary(client, testId);
    let offset = 0;
    return {
      ...this.summary(row),
      priceBand: { minPaise: band?.min_paise ?? 0, maxPaise: band?.max_paise ?? 0 },
      review: reviews.last
        ? {
            status: reviews.last.status,
            comments: reviews.last.comments,
            completedAt: reviews.last.completed_at.toISOString(),
            slaDeadlineAt: null,
          }
        : null,
      qcDeadlineAt: reviews.open_deadline?.toISOString() ?? null,
      sections: sections.map((section) => {
        const start = offset;
        offset += section.question_count;
        const byPosition = new Map(
          items.filter((item) => item.section_id === section.id).map((item) => [item.display_order - start, item]),
        );
        return {
          id: section.id,
          name: section.name,
          order: section.section_order,
          questionCount: section.question_count,
          durationSeconds: section.duration_seconds,
          positiveMarks: Number(section.positive_marks),
          negativeMarks: Number(section.negative_marks),
          subjectId: section.subject_id,
          subjectName: section.subject_name,
          slots: Array.from({ length: section.question_count }, (_, index) => {
            const item = byPosition.get(index + 1);
            const qc = feedback.get(start + index + 1);
            return {
              position: index + 1,
              item: item
                ? {
                    questionId: item.question_id,
                    stemEn: item.stem_en.length > 200 ? `${item.stem_en.slice(0, 200)}…` : item.stem_en,
                    difficulty: item.difficulty,
                    isApproved: item.is_approved,
                    hasHindi: item.has_hindi,
                    qcLocked: item.qc_locked,
                    qc: qc
                      ? {
                          action: qc.action as QcItemAction,
                          reasonCode: qc.reason_code as QcReasonCode | null,
                          comment: qc.comment,
                        }
                      : null,
                    newerVersionId: item.qc_locked ? null : item.newer_version_id,
                  }
                : null,
            };
          }),
        };
      }),
    };
  }

  /** Validates and writes one section's slots (shared by manual placement and workbook upload). */
  private async placeSection(
    client: DatabaseClient,
    examinerId: string,
    test: TestRow,
    sections: SectionRow[],
    sectionId: string,
    questionIds: (string | null)[],
  ): Promise<void> {
    const index = sections.findIndex((section) => section.id === sectionId);
    const section = sections[index];
    if (!section) throw notFound('Section');
    if (questionIds.length !== section.question_count)
      throw new ApiError(422, 'VALIDATION_FAILED', `${section.name} has ${section.question_count} positions.`);
    const chosen = questionIds.filter((id): id is string => id !== null);
    if (new Set(chosen).size !== chosen.length)
      throw new ApiError(422, 'VALIDATION_FAILED', `A question appears twice in ${section.name}.`);
    const items = await repo.listItems(client, test.id);
    // Questions already in this section stay valid even if edited since; new ones must be
    // the examiner's latest version for this exam and the section's subject.
    const kept = new Set(items.filter((item) => item.section_id === sectionId).map((item) => item.question_id));
    const added = chosen.filter((id) => !kept.has(id));
    const found = await repo.ownLatestQuestions(client, examinerId, test.exam_id, added);
    if (found.length !== added.length)
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'Use the latest version of your own questions for this exam.',
      );
    if (section.subject_id && found.some((question) => question.subject_id !== section.subject_id))
      throw new ApiError(422, 'VALIDATION_FAILED', `${section.name} accepts only ${section.subject_name} questions.`);
    const elsewhere = items.filter(
      (item) => item.section_id !== sectionId && chosen.includes(item.question_id),
    );
    if (elsewhere.length)
      throw new ApiError(409, 'ALREADY_EXISTS', 'A question can appear only once in a test; it is already in another section.');
    const offset = sections.slice(0, index).reduce((total, item) => total + item.question_count, 0);
    await repo.replaceSectionItems(client, test.id, section, offset, questionIds);
  }

  // Tests ----------------------------------------------------------------------------------

  listTests(identity: VerifiedIdentity): Promise<ExaminerTestList> {
    return this.asExaminer(identity, async (client, examinerId) => ({
      items: (await repo.listTests(client, examinerId)).map((row) => this.summary(row)),
    }));
  }

  getTest(identity: VerifiedIdentity, testId: string): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, (client, examinerId) => this.detail(client, examinerId, testId));
  }

  createTest(identity: VerifiedIdentity, req: CreateExaminerTestRequest): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      if (!(await authoringRepository.validateImportTarget(client, examinerId, req.examId, req.stageId, req.templateId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Choose one of your exams with a published template.');
      if (!(await repo.templateHasSections(client, req.templateId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'This template has no sections yet.');
      if (req.seriesId) await this.validSeries(client, examinerId, req.seriesId, req.examId);
      const price = await this.pricing(client, examinerId, req.examId, req);
      const id = await repo.createTest(client, examinerId, {
        examId: req.examId,
        stageId: req.stageId,
        templateId: req.templateId,
        seriesId: req.seriesId,
        title: req.title,
        slug: slugFor(req.title),
        testType: req.testType,
        accessType: price.access_type,
        pricePaise: price.price_paise,
        includedInPass: price.is_included_in_pass,
        hasHindi: req.hasHindi,
      });
      return this.detail(client, examinerId, id);
    });
  }

  updateTest(identity: VerifiedIdentity, testId: string, req: UpdateExaminerTestRequest): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await this.editableTest(client, examinerId, testId, req.expectedUpdatedAt);
      if (req.seriesId) await this.validSeries(client, examinerId, req.seriesId, test.exam_id);
      const price = await this.pricing(client, examinerId, test.exam_id, {
        accessType: req.accessType ?? test.access_type,
        pricePaise: req.pricePaise ?? test.price_paise,
        includedInPass: req.includedInPass ?? test.is_included_in_pass,
        seriesId: req.seriesId !== undefined ? req.seriesId : test.series_id,
      });
      await repo.updateTest(client, testId, {
        ...(req.title !== undefined ? { title: req.title } : {}),
        ...(req.testType !== undefined ? { test_type: req.testType } : {}),
        ...price,
        ...(req.hasHindi !== undefined ? { has_hindi: req.hasHindi } : {}),
        ...(req.seriesId !== undefined ? { series_id: req.seriesId } : {}),
        ...(req.scheduledPublishAt !== undefined ? { scheduled_publish_at: req.scheduledPublishAt } : {}),
      });
      return this.detail(client, examinerId, testId);
    });
  }

  deleteTest(identity: VerifiedIdentity, testId: string): Promise<void> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await repo.getTest(client, examinerId, testId);
      if (!test) throw notFound('Test');
      if (test.status !== 'draft' || !(await repo.deleteTest(client, testId)))
        throw new ApiError(409, 'QC_LOCKED', 'Only draft tests can be deleted.');
    });
  }

  setSectionQuestions(
    identity: VerifiedIdentity,
    testId: string,
    sectionId: string,
    req: SetSectionQuestionsRequest,
  ): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await this.editableTest(client, examinerId, testId, req.expectedUpdatedAt);
      const sections = await repo.listSections(client, testId);
      await this.placeSection(client, examinerId, test, sections, sectionId, req.questionIds);
      await repo.touchTest(client, testId);
      return this.detail(client, examinerId, testId);
    });
  }

  fillFromImport(identity: VerifiedIdentity, testId: string, req: FillTestFromImportRequest): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await this.editableTest(client, examinerId, testId, req.expectedUpdatedAt);
      const run = await repo.getCommittedImport(client, examinerId, req.importId);
      if (!run || run.status !== 'committed')
        throw new ApiError(422, 'VALIDATION_FAILED', 'Commit the uploaded workbook before placing it in the test.');
      if (run.template_id !== test.template_id)
        throw new ApiError(422, 'VALIDATION_FAILED', 'The workbook was validated against a different template.');
      const placements = await repo.importRowPlacements(client, req.importId);
      if (placements.length !== run.committed_question_ids.length)
        throw new ApiError(409, 'IMPORT_CONFLICT', 'The import rows and committed questions do not match.');
      const sections = await repo.listSections(client, testId);
      const items = await repo.listItems(client, testId);
      const plan = new Map<string, (string | null)[]>();
      let offset = 0;
      for (const section of sections) {
        const start = offset;
        offset += section.question_count;
        const slots: (string | null)[] = Array.from({ length: section.question_count }, () => null);
        for (const item of items.filter((entry) => entry.section_id === section.id))
          slots[item.display_order - start - 1] = item.question_id;
        plan.set(section.id, slots);
      }
      const touched = new Set<string>();
      for (const [index, placement] of placements.entries()) {
        const section = sections.find(
          (item) => item.name.trim().toLowerCase() === placement.section.trim().toLowerCase(),
        );
        const slots = section ? plan.get(section.id) : undefined;
        if (!section || !slots || !Number.isInteger(placement.position) || placement.position < 1 || placement.position > slots.length)
          throw new ApiError(422, 'VALIDATION_FAILED', `Row ${index + 2}: section or position does not fit this test.`);
        slots[placement.position - 1] = run.committed_question_ids[index]!;
        touched.add(section.id);
      }
      for (const sectionId of touched)
        await this.placeSection(client, examinerId, test, sections, sectionId, plan.get(sectionId)!);
      await repo.touchTest(client, testId);
      return this.detail(client, examinerId, testId);
    });
  }

  /** PRD 5.1 repeat-question policy on the placed questions (QC_PIPELINE "Checks and policy"). */
  private async policyIssues(client: DatabaseClient, test: TestRow): Promise<PrecheckIssue[]> {
    const issues: PrecheckIssue[] = [];
    for (const row of await qcRepository.policyRows(client, test.id)) {
      const at = { questionId: row.question_id, sectionName: row.section_name, position: row.position };
      const add = (severity: 'block' | 'warn', message: string) => issues.push({ ...at, severity, message });
      if (row.is_pyq && row.pyq_year === null) add('block', 'Add the PYQ year to this previous year question.');
      if (row.match_kind === 'pyq_match' && !row.is_pyq)
        add('block', 'Matches a previous year question. Tag it as PYQ with its year.');
      if (row.match_kind === 'exact_hash' && row.match_same_examiner === false)
        add('block', 'Copy of an approved question by another examiner.');
      if (row.match_kind === 'exact_hash' && row.match_same_examiner && !row.live_paid_test)
        add('warn', 'Same as another of your approved questions.');
      if (row.live_paid_test)
        add(
          test.access_type === 'free' ? 'warn' : 'block',
          test.access_type === 'free'
            ? `Also live in your paid test “${row.live_paid_test}”. Reuse in a free test is allowed.`
            : `Already live in your paid test “${row.live_paid_test}”. Use it only in free tests.`,
        );
      if (row.match_kind === 'masked_hash')
        add('warn', 'Same as an approved question with numbers or names changed. The reviewer decides.');
      if (row.match_kind === 'trigram_high') add('warn', 'Likely duplicate of an approved question. The reviewer decides.');
      if (row.match_kind === 'trigram_mid') add('warn', 'Similar to an approved question. The reviewer will compare them.');
      if (row.image_reused) add('warn', 'Uses the same image file as another examiner’s approved question.');
    }
    return issues;
  }

  private async runPrecheck(client: DatabaseClient, test: TestRow): Promise<TestPrecheck> {
    const base = this.precheckOf(await repo.precheck(client, test.id));
    const issues = await this.policyIssues(client, test);
    const patternFit = (await qcRepository.patternFit(client, test.id)).map((row) => ({
      sectionName: row.section_name,
      topicName: row.topic_name,
      target: row.target,
      actual: row.actual,
    }));
    const blocked = issues.some((issue) => issue.severity === 'block');
    return {
      ...base,
      canSubmit: base.canSubmit && !blocked,
      blockingErrors: blocked
        ? [...base.blockingErrors, 'Fix the questions marked as blocking below.']
        : base.blockingErrors,
      issues,
      patternFit,
    };
  }

  private precheckOf(raw: Awaited<ReturnType<typeof repo.precheck>>): Omit<TestPrecheck, 'issues' | 'patternFit'> {
    return {
      canSubmit: raw.can_submit,
      blockingErrors: raw.blocking_errors ?? [],
      pyqPercentage: Number(raw.pyq_percentage),
      sectionMismatches: (raw.section_mismatches ?? []).map((item) => ({
        sectionName: item.section_name,
        expectedCount: Number(item.expected_count),
        actualCount: Number(item.actual_count),
      })),
    };
  }

  precheck(identity: VerifiedIdentity, testId: string): Promise<SubmitExaminerTestResponse> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await repo.getTest(client, examinerId, testId);
      if (!test) throw notFound('Test');
      const precheck = await this.runPrecheck(client, test);
      return { precheck, test: await this.detail(client, examinerId, testId) };
    });
  }

  /**
   * Runs the pre-submit checks and, when they pass, freezes the draft and runs Stage 1, which
   * routes it to a reviewer (PRD 4.2 step 8, 5.2). All in one transaction: a failure leaves a draft.
   */
  submit(identity: VerifiedIdentity, testId: string, expectedUpdatedAt: string): Promise<SubmitExaminerTestResponse> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await this.editableTest(client, examinerId, testId, expectedUpdatedAt);
      const precheck = await this.runPrecheck(client, test);
      if (precheck.canSubmit) {
        await repo.setSubmitted(client, testId);
        await qcRepository.startQc(client, testId);
      }
      return { precheck, test: await this.detail(client, examinerId, testId) };
    });
  }

  /** Swaps every unlocked item for the newest version of the same question (after revising it). */
  useLatestVersions(identity: VerifiedIdentity, testId: string, expectedUpdatedAt: string): Promise<ExaminerTestDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const test = await this.editableTest(client, examinerId, testId, expectedUpdatedAt);
      const sections = await repo.listSections(client, testId);
      const items = await repo.listItems(client, testId);
      let offset = 0;
      for (const section of sections) {
        const start = offset;
        offset += section.question_count;
        const own = items.filter((item) => item.section_id === section.id);
        if (!own.some((item) => item.newer_version_id && !item.qc_locked)) continue;
        const slots: (string | null)[] = Array.from({ length: section.question_count }, () => null);
        for (const item of own)
          slots[item.display_order - start - 1] =
            item.newer_version_id && !item.qc_locked ? item.newer_version_id : item.question_id;
        await this.placeSection(client, examinerId, test, sections, section.id, slots);
      }
      await repo.touchTest(client, testId);
      return this.detail(client, examinerId, testId);
    });
  }

  // Series ---------------------------------------------------------------------------------

  private series(row: SeriesRow): ExaminerSeries {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      examId: row.exam_id,
      examName: row.exam_name,
      stageId: row.stage_id,
      stageName: row.stage_name,
      description: row.description ?? '',
      pricePaise: row.price_paise,
      validityDays: row.validity_days,
      totalPlannedTests: row.total_planned_tests,
      isPublished: row.is_published,
      testCount: row.test_count,
      liveTestCount: row.live_test_count,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async seriesDetail(client: DatabaseClient, examinerId: string, seriesId: string): Promise<ExaminerSeriesDetail> {
    const row = await repo.getSeries(client, examinerId, seriesId);
    if (!row) throw notFound('Series');
    return {
      ...this.series(row),
      tests: (await repo.listSeriesTests(client, examinerId, seriesId)).map((test) => this.summary(test)),
    };
  }

  listSeries(identity: VerifiedIdentity): Promise<ExaminerSeriesList> {
    return this.asExaminer(identity, async (client, examinerId) => ({
      items: (await repo.listSeries(client, examinerId)).map((row) => this.series(row)),
    }));
  }

  getSeries(identity: VerifiedIdentity, seriesId: string): Promise<ExaminerSeriesDetail> {
    return this.asExaminer(identity, (client, examinerId) => this.seriesDetail(client, examinerId, seriesId));
  }

  createSeries(identity: VerifiedIdentity, req: CreateExaminerSeriesRequest): Promise<ExaminerSeriesDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      if (!(await repo.examAssigned(client, examinerId, req.examId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Choose one of your approved exams.');
      if (req.stageId && !(await repo.stageBelongsToExam(client, req.stageId, req.examId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'The stage does not belong to this exam.');
      const id = await repo.createSeries(client, examinerId, { ...req, slug: slugFor(req.title) });
      return this.seriesDetail(client, examinerId, id);
    });
  }

  updateSeries(identity: VerifiedIdentity, seriesId: string, req: UpdateExaminerSeriesRequest): Promise<ExaminerSeriesDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const series = await repo.getSeries(client, examinerId, seriesId, true);
      if (!series) throw notFound('Series');
      if (series.is_published)
        throw new ApiError(409, 'QC_LOCKED', 'Unpublish the series to edit it. Students who bought it keep their access.');
      if (!(await repo.isSameSeriesVersion(client, seriesId, req.expectedUpdatedAt)))
        throw new ApiError(409, 'STALE_EDIT', 'This series changed since you opened it. Reload to see the latest version.');
      await repo.updateSeries(client, seriesId, {
        ...(req.title !== undefined ? { title: req.title } : {}),
        ...(req.description !== undefined ? { description: req.description || null } : {}),
        ...(req.pricePaise !== undefined ? { price_paise: req.pricePaise } : {}),
        ...(req.validityDays !== undefined ? { validity_days: req.validityDays } : {}),
        ...(req.totalPlannedTests !== undefined ? { total_planned_tests: req.totalPlannedTests } : {}),
      });
      return this.seriesDetail(client, examinerId, seriesId);
    });
  }

  /**
   * The examiner owns their series (PRD 3): no separate approval. Every test in it has passed
   * review, so a series can be published once at least one of its tests is live. Unpublishing
   * stops new sales; buyers keep access until their validity ends.
   */
  setSeriesPublished(
    identity: VerifiedIdentity,
    seriesId: string,
    expectedUpdatedAt: string,
    published: boolean,
  ): Promise<ExaminerSeriesDetail> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const series = await repo.getSeries(client, examinerId, seriesId, true);
      if (!series) throw notFound('Series');
      if (!(await repo.isSameSeriesVersion(client, seriesId, expectedUpdatedAt)))
        throw new ApiError(409, 'STALE_EDIT', 'This series changed since you opened it. Reload to see the latest version.');
      if (series.is_published === published) return this.seriesDetail(client, examinerId, seriesId);
      if (published && series.live_test_count === 0)
        throw new ApiError(422, 'VALIDATION_FAILED', 'Publish the series once at least one of its tests has passed review and is live.');
      if (published && series.price_paise < 100)
        throw new ApiError(422, 'VALIDATION_FAILED', 'Set a price of at least ₹1 before publishing.');
      await repo.setSeriesPublished(client, seriesId, published);
      return this.seriesDetail(client, examinerId, seriesId);
    });
  }

  deleteSeries(identity: VerifiedIdentity, seriesId: string): Promise<void> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const series = await repo.getSeries(client, examinerId, seriesId, true);
      if (!series) throw notFound('Series');
      if (series.is_published || (await repo.seriesHasNonDraftTests(client, seriesId)))
        throw new ApiError(409, 'IN_USE', 'A series with submitted or published tests cannot be deleted.');
      if (!(await repo.deleteSeries(client, seriesId))) throw notFound('Series');
    });
  }
}
