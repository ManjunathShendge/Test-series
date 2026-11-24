import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import {
  DraftQuestionInput,
  type CorrectKeyRequest,
  type QcMinorEditRequest,
  type AddQcReviewerRequest,
  type AdminExaminer,
  type AdminExaminerList,
  type AssetViewUrl,
  type CreateSpotCheckRequest,
  type DuplicateMatchKind,
  type ExaminerQualityInputs,
  type ExaminerQualityResponse,
  type QcDecisionRequest,
  type QcFinishResponse,
  type QcItemAction,
  type QcOverview,
  type QcQueue,
  type QcQueueItem,
  type QcReasonCode,
  type QcReviewDetail,
  type QuestionReport,
  type QuestionReportList,
  type ReassignReviewRequest,
  type ReportReason,
  type ReportStatus,
  type ResolveReportRequest,
  type SpotCheckResultRequest,
  type UpdateAdminExaminerRequest,
  type UpdateQcSettingsRequest,
} from '@exam-prep/contracts';
import { DATABASE, ENVIRONMENT } from '../../../database/database.module.js';
import type { Environment } from '../../../config/env.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { ObjectStorage } from '../../../providers/storage/object-storage.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { identityRepository } from '../../identity/repositories/identity.repository.js';
import { authoringRepository } from '../../authoring/repositories/authoring.repository.js';
import { normalizeQuestion, questionContentIssues } from '../../authoring/domain/question-content.js';
import {
  auditAction,
  qcRepository as repo,
  type QualityRow,
  type QueueRow,
  type ReportRow,
} from '../repositories/qc.repository.js';

const forbidden = (message = 'You do not have permission to do this') => new ApiError(403, 'FORBIDDEN', message);
const pgCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

/** Database refusals from the QC functions and triggers, as contract errors. */
function mapDatabaseError(error: unknown): never {
  const code = pgCode(error);
  if (code === '23505') throw new ApiError(409, 'ALREADY_EXISTS', 'That already exists.');
  if (code === '23514') throw new ApiError(409, 'QC_LOCKED', 'Decide every question before finishing the review.');
  if (code === '23001') throw new ApiError(409, 'QC_LOCKED', 'This review is already finished or locked.');
  if (code === '42501') throw forbidden();
  if (code === 'P0002') throw notFound('Review');
  throw error;
}

function quality(row: QualityRow): ExaminerQualityInputs {
  return {
    qcPassRate: row.reviewed ? Math.round((row.passed / row.reviewed) * 1000) / 10 : null,
    reviewedQuestions: row.reviewed,
    duplicateRejects: row.duplicate_rejects,
    keyCorrections: row.key_corrections,
    avgReportResponseHours: row.avg_response_hours === null ? null : Math.round(row.avg_response_hours * 10) / 10,
    openReports: row.open_reports,
    liveTests: row.live_tests,
  };
}

function queueItem(row: QueueRow): QcQueueItem {
  return {
    reviewId: row.review_id,
    testId: row.test_id,
    testTitle: row.test_title,
    examName: row.exam_name,
    examinerName: row.examiner_name,
    examinerTier: row.examiner_tier,
    fastLane: row.examiner_tier === 'top',
    isSecondReview: row.is_second,
    flagCount: row.flag_count,
    questionCount: row.question_count,
    decidedCount: row.decided_count,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    slaDeadlineAt: row.sla_deadline_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function report(row: ReportRow, showExaminer: boolean): QuestionReport {
  return {
    id: row.id,
    questionId: row.question_id,
    stemEn: row.stem_en,
    testTitle: row.test_title,
    examinerName: showExaminer ? row.examiner_name : null,
    reason: row.reason as ReportReason,
    studentComment: row.student_comment,
    status: row.status as ReportStatus,
    examinerResponse: row.examiner_response,
    examinerRespondedAt: row.examiner_responded_at?.toISOString() ?? null,
    slaDeadlineAt: row.examiner_sla_deadline_at.toISOString(),
    resolutionNotes: row.resolution_notes,
    openReportCount: row.open_report_count,
    questionHidden: row.is_auto_hidden,
    createdAt: row.created_at.toISOString(),
    question: showExaminer
      ? {
          options: row.options.map((option) => ({ id: option.id, textEn: option.textEn })),
          correctOption: row.correct_option,
          solutionEn: row.solution_en,
          solutionHi: row.solution_hi,
        }
      : null,
    correctedTo: row.corrected_to,
  };
}

/** First content or contract problem in an edited question, for a 422 the reviewer can act on. */
function editIssue(input: unknown): string | null {
  const parsed = DraftQuestionInput.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'The edited question is not valid.';
  const content = questionContentIssues(parsed.data);
  return content[0]?.message ?? null;
}

/**
 * QC review (PRD 5.2-5.4), examiner quality (4.4, 5.5) and the admin QC console (8).
 * Routes check roles first; this service checks assignment and ownership again, and the
 * database functions check the caller a third time (CLAUDE.md "authorization inside services").
 */
@Injectable()
export class QcService {
  private readonly storage: ObjectStorage;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) env: Environment,
  ) {
    this.storage = new ObjectStorage(env);
  }

  private isAdmin(access: AccessContext): boolean {
    return access.roles.includes('admin') && (access.admin.ops || access.admin.super);
  }

  /** Runs as a QC reviewer or an ops admin. */
  private asStaff<T>(access: AccessContext, action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (!access.roles.includes('qc_reviewer') && !this.isAdmin(access)) throw forbidden();
    return withUser(this.db, access.profileId, async (client) => {
      try {
        return await action(client);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        return mapDatabaseError(error);
      }
    });
  }

  private asAdmin<T>(access: AccessContext, action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (!this.isAdmin(access)) throw forbidden();
    return this.asStaff(access, action);
  }

  private async asExaminer<T>(
    identity: VerifiedIdentity,
    action: (client: DatabaseClient, examinerId: string) => Promise<T>,
  ): Promise<T> {
    const examinerId = await identityRepository.ensureProfile(this.db, identity.uid, identity.email, identity.name);
    return withUser(this.db, examinerId, async (client) => {
      if (!(await authoringRepository.requireExaminer(client, examinerId)))
        throw forbidden('Approved examiner access is required.');
      return action(client, examinerId);
    });
  }

  /** The review, if this caller may act on it: the assigned reviewer or an admin, never the author. */
  private async ownReview(client: DatabaseClient, access: AccessContext, reviewId: string, lock = false) {
    const review = await repo.review(client, reviewId, lock);
    if (!review) throw notFound('Review');
    if (review.examiner_id === access.profileId) throw forbidden('You cannot review your own test.');
    if (!this.isAdmin(access) && review.reviewer_id !== access.profileId) throw notFound('Review');
    return review;
  }

  // Reviewer -----------------------------------------------------------------------------------

  queue(access: AccessContext): Promise<QcQueue> {
    return this.asStaff(access, async (client) => ({
      items: (await repo.openQueue(client, this.isAdmin(access) ? null : access.profileId)).map(queueItem),
    }));
  }

  getReview(access: AccessContext, reviewId: string): Promise<QcReviewDetail> {
    return this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId);
      // A second review reads the questions of the round that approved the test.
      const source = review.is_second ? await repo.latestFinishedPrimary(client, review.test_id) : reviewId;
      const rows = source ? await repo.reviewQuestions(client, source) : [];
      const pattern = await repo.patternFit(client, review.test_id);
      return {
        review: {
          ...queueItem(review),
          questionCount: review.is_second ? rows.length : review.question_count,
          decidedCount: review.is_second ? rows.length : review.decided_count,
          status: review.status,
          overallComments: review.overall_comments,
          completedAt: review.completed_at?.toISOString() ?? null,
          hasHindi: review.has_hindi,
          testType: review.test_type,
          pyqPercentage: Number(review.pyq_percentage),
        },
        questions: rows.map((row) => ({
          itemId: row.item_id,
          sectionName: row.section_name ?? 'Removed position',
          position: row.display_order ?? 0,
          questionId: row.question_id,
          versionNumber: row.version_number,
          subjectName: row.subject_name,
          topicName: row.topic_name,
          difficulty: row.difficulty,
          stemEn: row.stem_en,
          stemHi: row.stem_hi,
          options: row.options,
          correctOption: row.correct_option,
          solutionEn: row.solution_en,
          solutionHi: row.solution_hi,
          isPyq: row.is_pyq,
          pyqYear: row.pyq_year,
          imageAssetIds: row.image_urls,
          editedFromVersion: row.edited_from_version,
          completenessError: row.has_completeness_error,
          match:
            row.match_kind && row.matched_question_id
              ? {
                  kind: row.match_kind as DuplicateMatchKind,
                  similarity: row.similarity_score,
                  sameExaminer: row.matched_examiner_id === row.question_examiner_id,
                  matchedQuestionId: row.matched_question_id,
                  matchedStemEn: row.matched_stem_en ?? '',
                  matchedExaminerName: row.matched_examiner_name,
                  matchedIsPyq: row.matched_is_pyq ?? false,
                }
              : null,
          carriedOver: row.carried_over,
          action: row.reviewer_action as QcItemAction,
          reasonCode: row.reason_code as QcReasonCode | null,
          comment: row.reviewer_comment,
          checklist:
            row.checklist_key_matches_solution === null
              ? null
              : {
                  keyMatchesSolution: row.checklist_key_matches_solution,
                  singleDefensibleOption: row.checklist_single_defensible_option ?? false,
                  bilingualMatch: row.checklist_bilingual_match ?? false,
                  inSyllabus: row.checklist_in_syllabus ?? false,
                  noWatermarks: row.checklist_no_watermarks ?? false,
                },
        })),
        patternFit: pattern.map((row) => ({
          sectionName: row.section_name,
          topicName: row.topic_name,
          target: row.target,
          actual: row.actual,
        })),
      };
    });
  }

  decide(access: AccessContext, reviewId: string, itemId: string, req: QcDecisionRequest): Promise<QcReviewDetail> {
    return this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId, true);
      if (review.is_second || review.completed_at) throw new ApiError(409, 'QC_LOCKED', 'This review is already finished.');
      await auditAction(client, `qc_question.${req.action}`);
      const c = req.checklist;
      const changed = await repo.decide(client, reviewId, itemId, {
        action: req.action,
        reasonCode: req.action === 'approve' ? null : req.reasonCode,
        comment: req.comment || null,
        checklist: [c.keyMatchesSolution, c.singleDefensibleOption, c.bilingualMatch, c.inSyllabus, c.noWatermarks],
      });
      if (!changed) throw new ApiError(409, 'QC_LOCKED', 'This question was approved in an earlier round; the decision stands.');
    }).then(() => this.getReview(access, reviewId));
  }

  /**
   * PRD 5.3.4 minor edit: a new version of the question with the reviewer's wording, revalidated
   * (content rules, Hindi completeness, no copy of another examiner's question) and placed in the
   * test. It is approved only when the review finishes, like any other approval.
   */
  minorEdit(access: AccessContext, reviewId: string, itemId: string, req: QcMinorEditRequest): Promise<QcReviewDetail> {
    return this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId, true);
      if (review.is_second || review.completed_at) throw new ApiError(409, 'QC_LOCKED', 'This review is already finished.');
      const item = await repo.reviewItem(client, reviewId, itemId);
      if (!item || !item.test_question_id) throw notFound('Question');
      if (item.carried_over) throw new ApiError(409, 'QC_LOCKED', 'This question was approved in an earlier round.');
      if (!Object.values(req.checklist).every(Boolean))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Confirm every checklist item for the edited question.');
      const stemHi = req.stemHi?.trim() || null;
      const options = req.options.map(({ id, textEn, textHi }) => (textHi?.trim() ? { id, textEn, textHi } : { id, textEn }));
      const problem = editIssue({
        examId: item.exam_id,
        subjectId: item.subject_id,
        topicId: item.topic_id,
        difficulty: item.difficulty,
        stemEn: req.stemEn,
        ...(stemHi ? { stemHi } : {}),
        options,
        correctOption: req.correctOption,
        solutionEn: req.solutionEn,
        ...(req.solutionHi?.trim() ? { solutionHi: req.solutionHi.trim() } : {}),
        isPyq: item.is_pyq,
        ...(item.pyq_year !== null ? { pyqYear: item.pyq_year } : {}),
      });
      if (problem) throw new ApiError(422, 'VALIDATION_FAILED', problem);
      if (review.has_hindi && (!stemHi || !req.solutionHi?.trim() || options.some((option) => !('textHi' in option))))
        throw new ApiError(422, 'VALIDATION_FAILED', 'This test is bilingual: keep the Hindi for the question, every option and the solution.');
      const normalized = normalizeQuestion(req.stemEn, stemHi ?? undefined, options);
      if (await repo.copiesAnotherExaminer(client, item.exam_id, item.examiner_id, normalized.textHash))
        throw new ApiError(409, 'QC_LOCKED', 'The edited text copies another examiner’s approved question.');
      await auditAction(client, 'qc_question.minor_edit');
      const created = await repo.insertVersion(
        client,
        item,
        {
          stemEn: req.stemEn,
          stemHi,
          options,
          correctOption: req.correctOption,
          solutionEn: req.solutionEn,
          solutionHi: req.solutionHi?.trim() || null,
          normStemEn: normalized.stemEn,
          normStemHi: normalized.stemHi,
          textHash: normalized.textHash,
          maskedHash: normalized.maskedHash,
        },
        false,
      );
      const c = req.checklist;
      await repo.applyMinorEdit(client, reviewId, itemId, item.test_question_id, item.id, created.id, req.comment, [
        c.keyMatchesSolution,
        c.singleDefensibleOption,
        c.bilingualMatch,
        c.inSyllabus,
        c.noWatermarks,
      ]);
    }).then(() => this.getReview(access, reviewId));
  }

  /**
   * PRD 5.4 key correction: a corrected version of the reported question, recorded against every
   * published test that contains it; past attempts are re-scored, ranks rebuilt and affected
   * students queued for notification. All unresolved reports on the question are closed.
   */
  correctKey(access: AccessContext, reportId: string, req: CorrectKeyRequest): Promise<QuestionReportList> {
    return this.asStaff(access, async (client) => {
      const questionId = await repo.reportQuestionId(client, reportId);
      if (!questionId) throw notFound('Report');
      const original = await repo.question(client, questionId);
      if (!original) throw notFound('Question');
      if (original.examiner_id === access.profileId) throw forbidden('You cannot correct your own question.');
      if (!original.is_approved_in_corpus)
        throw new ApiError(409, 'QC_LOCKED', 'Only a published, approved question can have its key corrected.');
      if (original.correct_option === req.correctOption)
        throw new ApiError(422, 'VALIDATION_FAILED', `The key is already ${req.correctOption}.`);
      const tests = await repo.testsWithQuestion(client, questionId);
      if (!tests.length) throw new ApiError(409, 'QC_LOCKED', 'This question is not in a published test.');
      await auditAction(client, 'question.key_correction');
      const normalized = normalizeQuestion(original.stem_en, original.stem_hi ?? undefined, original.options);
      const created = await repo.insertVersion(
        client,
        original,
        {
          stemEn: original.stem_en,
          stemHi: original.stem_hi,
          options: original.options,
          correctOption: req.correctOption,
          solutionEn: req.solutionEn,
          solutionHi: req.solutionHi?.trim() || original.solution_hi,
          normStemEn: normalized.stemEn,
          normStemHi: normalized.stemHi,
          textHash: normalized.textHash,
          maskedHash: normalized.maskedHash,
        },
        true,
      );
      for (const testId of tests)
        await repo.recordCorrection(client, {
          testId,
          oldQuestionId: questionId,
          newQuestionId: created.id,
          oldOption: original.correct_option,
          newOption: req.correctOption,
          reportId,
          correctedBy: access.profileId,
          reason: req.reason,
        });
      await repo.resolveAsKeyChanged(client, access.profileId, questionId, req.reason);
      return { items: (await repo.staffReports(client)).map((row) => report(row, true)) };
    });
  }

  finish(access: AccessContext, reviewId: string, comments: string): Promise<QcFinishResponse> {
    return this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId);
      if (review.is_second) throw new ApiError(409, 'QC_LOCKED', 'Record a second review with its own result.');
      if (!review.reviewer_id && !this.isAdmin(access)) throw forbidden();
      await auditAction(client, 'qc_review.finish');
      return { status: await repo.finish(client, reviewId, comments) };
    });
  }

  spotCheckResult(access: AccessContext, reviewId: string, req: SpotCheckResultRequest): Promise<QcFinishResponse> {
    return this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId, true);
      if (!review.is_second) throw new ApiError(409, 'QC_LOCKED', 'This is not a second review.');
      await auditAction(client, `qc_spot_check.${req.passed ? 'passed' : 'failed'}`);
      if (!(await repo.finishSpotCheck(client, reviewId, req.passed, req.comments)))
        throw new ApiError(409, 'QC_LOCKED', 'This second review is already recorded.');
      return { status: req.passed ? 'approved' : 'changes_requested' };
    });
  }

  async reviewImage(access: AccessContext, reviewId: string, assetId: string): Promise<AssetViewUrl> {
    const asset = await this.asStaff(access, async (client) => {
      const review = await this.ownReview(client, access, reviewId);
      const source = review.is_second ? await repo.latestFinishedPrimary(client, review.test_id) : reviewId;
      if (!source || !(await repo.reviewHasImage(client, source, assetId))) throw notFound('Image');
      const found = await repo.cleanImage(client, assetId);
      if (!found) throw notFound('Image');
      return found;
    });
    const signed = await this.storage.presignedView(asset.bucket, asset.object_key, asset.mime_type);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  staffReports(access: AccessContext): Promise<QuestionReportList> {
    return this.asStaff(access, async (client) => ({
      items: (await repo.staffReports(client)).map((row) => report(row, true)),
    }));
  }

  resolveReport(access: AccessContext, reportId: string, req: ResolveReportRequest): Promise<QuestionReportList> {
    return this.asStaff(access, async (client) => {
      await auditAction(client, `question_report.${req.resolution}`);
      if (!(await repo.resolve(client, access.profileId, reportId, req.resolution, req.notes, req.unhideQuestion)))
        throw new ApiError(409, 'QC_LOCKED', 'This report is already resolved.');
      return { items: (await repo.staffReports(client)).map((row) => report(row, true)) };
    });
  }

  // Examiner --------------------------------------------------------------------------------------

  examinerQuality(identity: VerifiedIdentity): Promise<ExaminerQualityResponse> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const standing = await repo.examinerStanding(client, examinerId);
      if (!standing) throw forbidden('Approved examiner access is required.');
      return {
        tier: standing.tier,
        fastLane: standing.tier === 'top',
        kycVerified: standing.kyc_verified_at !== null,
        quality: quality(await repo.quality(client, examinerId)),
        priceBands: (await repo.priceBands(client, examinerId)).map((band) => ({
          examId: band.exam_id,
          examName: band.exam_name,
          minPaise: band.min_paise,
          maxPaise: band.max_paise,
        })),
      };
    });
  }

  examinerReports(identity: VerifiedIdentity): Promise<QuestionReportList> {
    return this.asExaminer(identity, async (client, examinerId) => ({
      items: (await repo.examinerReports(client, examinerId)).map((row) => report(row, false)),
    }));
  }

  respond(identity: VerifiedIdentity, reportId: string, response: string): Promise<QuestionReportList> {
    return this.asExaminer(identity, async (client, examinerId) => {
      if (!(await repo.respond(client, examinerId, reportId, response)))
        throw new ApiError(409, 'QC_LOCKED', 'This report is closed or is not about your question.');
      return { items: (await repo.examinerReports(client, examinerId)).map((row) => report(row, false)) };
    });
  }

  // Admin ------------------------------------------------------------------------------------------

  overview(access: AccessContext): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => ({
      queue: (await repo.openQueue(client, null)).map(queueItem),
      reviewers: (await repo.reviewers(client)).map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        isBlocked: row.is_blocked,
        openReviews: row.open_reviews,
        exams: row.exams,
      })),
      approved: (await repo.approvedTests(client)).map((row) => ({
        testId: row.test_id,
        title: row.title,
        examName: row.exam_name,
        examinerName: row.examiner_name,
        publishedAt: row.published_at?.toISOString() ?? null,
        spotCheck: row.spot_check,
      })),
      settings: (await repo.settings(client)).map((row) => ({
        examId: row.exam_id,
        examName: row.exam_name,
        trigramHigh: row.trigram_high,
        trigramMid: row.trigram_mid,
        pyqMaxPercentage: row.pyq_max,
        updatedAt: row.updated_at.toISOString(),
      })),
    }));
  }

  addReviewer(access: AccessContext, req: AddQcReviewerRequest): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      const profile = await repo.profileByEmail(client, req.email);
      if (!profile)
        throw new ApiError(404, 'NOT_FOUND', 'No account uses that email. Ask the reviewer to sign in once, then add them.');
      await auditAction(client, 'qc_reviewer.add');
      await repo.grantReviewer(client, profile.id);
    }).then(() => this.overview(access));
  }

  removeReviewer(access: AccessContext, reviewerId: string): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      await auditAction(client, 'qc_reviewer.remove');
      if (!(await repo.revokeReviewer(client, reviewerId))) throw notFound('Reviewer');
    }).then(() => this.overview(access));
  }

  mapReviewer(access: AccessContext, reviewerId: string, examId: string): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      if (!(await repo.isReviewer(client, reviewerId))) throw notFound('Reviewer');
      if (!(await repo.examExists(client, examId))) throw notFound('Exam');
      await auditAction(client, 'qc_reviewer.map');
      await repo.mapReviewer(client, reviewerId, examId);
    }).then(() => this.overview(access));
  }

  unmapReviewer(access: AccessContext, mappingId: string): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      await auditAction(client, 'qc_reviewer.unmap');
      if (!(await repo.unmapReviewer(client, mappingId))) throw notFound('Mapping');
    }).then(() => this.overview(access));
  }

  assign(access: AccessContext, reviewId: string, req: ReassignReviewRequest): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      if (!(await repo.isReviewer(client, req.reviewerId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Choose an active QC reviewer.');
      await auditAction(client, 'qc_review.assign');
      if (!(await repo.assign(client, reviewId, req.reviewerId, req.reason)))
        throw new ApiError(409, 'QC_LOCKED', 'The review is finished, or the reviewer wrote this test.');
    }).then(() => this.overview(access));
  }

  createSpotCheck(access: AccessContext, req: CreateSpotCheckRequest): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      if (!(await repo.isReviewer(client, req.reviewerId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Choose an active QC reviewer.');
      await auditAction(client, 'qc_spot_check.assign');
      if (!(await repo.createSpotCheck(client, req.testId, req.reviewerId)))
        throw new ApiError(409, 'QC_LOCKED', 'Only approved tests get a second review, and never by their author.');
    }).then(() => this.overview(access));
  }

  updateSettings(access: AccessContext, examId: string, req: UpdateQcSettingsRequest): Promise<QcOverview> {
    return this.asAdmin(access, async (client) => {
      await auditAction(client, 'exam.qc_settings');
      if (!(await repo.updateSettings(client, examId, req.expectedUpdatedAt, req)))
        throw new ApiError(409, 'STALE_EDIT', 'These settings changed since you opened them. Reload and try again.');
    }).then(() => this.overview(access));
  }

  private adminExaminer(row: Awaited<ReturnType<typeof repo.adminExaminers>>[number]): AdminExaminer {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      accountType: row.account_type,
      instituteName: row.institute_name,
      status: row.status as AdminExaminer['status'],
      tier: row.tier,
      kycVerifiedAt: row.kyc_verified_at?.toISOString() ?? null,
      examNames: row.exam_names,
      quality: quality(row),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  examiners(access: AccessContext): Promise<AdminExaminerList> {
    return this.asAdmin(access, async (client) => ({
      items: (await repo.adminExaminers(client)).map((row) => this.adminExaminer(row)),
    }));
  }

  /** Tier (PRD 5.5), manual KYC verification (4.1 step 4) and suspend or ban (8), each audited with its reason. */
  updateExaminer(access: AccessContext, examinerId: string, req: UpdateAdminExaminerRequest): Promise<AdminExaminer> {
    return this.asAdmin(access, async (client) => {
      if (examinerId === access.profileId) throw forbidden('You cannot change your own examiner account.');
      await auditAction(client, 'examiner.update');
      if (!(await repo.updateExaminer(client, examinerId, access.profileId, req))) throw notFound('Examiner');
      await repo.writeAudit(client, access.profileId, 'examiner.update_reason', 'examiner_profiles', examinerId, {
        tier: req.tier ?? null,
        status: req.status ?? null,
        kycVerified: req.kycVerified ?? null,
        reason: req.reason,
      });
      const row = (await repo.adminExaminers(client, examinerId))[0];
      if (!row) throw notFound('Examiner');
      return this.adminExaminer(row);
    });
  }
}
