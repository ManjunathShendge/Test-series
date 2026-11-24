import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import { withUser, type Database } from '@exam-prep/db';
import {
  missingHindiFields,
  QUESTION_BANK_PAGE_SIZE,
  type AssetViewUrl,
  type QuestionBankQuery,
  type CreateExaminerApplicationRequest,
  type DecideExaminerApplicationRequest,
  type ExaminerApplication,
  type ExaminerApplicationList,
  type AssetUploadIntentRequest,
  type AssetUploadIntent,
  type AdminKycDownloadUrl,
  type CompleteAssetRequest,
  type DraftQuestionInput,
  type DraftQuestion,
  type DraftQuestionList,
  type ImportPreviewRequest,
  type ImportPreview,
  type ImportTemplateQuery,
  type ImportCommitRequest,
  type ImportRowError,
  type ExaminerAuthoringOptions,
} from '@exam-prep/contracts';
import { DATABASE, ENVIRONMENT } from '../../../database/database.module.js';
import type { Environment } from '../../../config/env.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { identityRepository } from '../../identity/repositories/identity.repository.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import {
  authoringRepository as repo,
  type ApplicationRow,
  type DraftQuestionRow,
} from '../repositories/authoring.repository.js';
import { authoringAssetsRepository as assetRepo } from '../repositories/authoring-assets.repository.js';
import { ObjectStorage } from '../../../providers/storage/object-storage.js';
import { ClamAvScanner } from '../../../providers/antivirus/clamav-scanner.js';
import { contentIssues, questionContentIssues } from '../domain/question-content.js';

const iso = (value: Date | null) => (value ? value.toISOString() : null);

interface ImportedImage {
  bytes: Buffer;
  mimeType: string;
  sha256: string;
}

interface ImportedGroup {
  row: number;
  passageEn: string;
  passageHi: string | null;
  imageRefs: string[];
}

/** Questions sheet columns in CONTENT_AUTHORING order; the parser matches headers by name. */
const IMPORT_QUESTION_COLUMNS = [
  'row_id',
  'section',
  'position',
  'group_id',
  'stem_en',
  'stem_hi',
  'option_a_en',
  'option_b_en',
  'option_c_en',
  'option_d_en',
  'option_a_hi',
  'option_b_hi',
  'option_c_hi',
  'option_d_hi',
  'correct_option',
  'solution_en',
  'solution_hi',
  'subject_code',
  'topic_code',
  'difficulty',
  'source',
  'pyq_year',
  'pyq_shift',
  'image_refs',
];

const IMPORT_INSTRUCTIONS = [
  'One question per row on the Questions sheet, at most 200 rows. Do not rename or reorder the header row.',
  'row_id: your own unique label for the row. section: a name from the Sections sheet. position: 1 to the section size, unique within the section.',
  'subject_code and topic_code: copy them from the Codes sheet. A section with a subject_code accepts only that subject.',
  'correct_option: A, B, C or D. difficulty: easy, medium or hard. source: original (default) or pyq; pyq needs pyq_year, pyq_shift is optional.',
  'Hindi is all or none: a row with any Hindi needs stem_hi, all four option_*_hi and solution_hi.',
  String.raw`Write plain text. Math: \( x^2 \) inline or \[ \frac{a}{b} \] on its own line. Tables: | a | b | header, | --- | --- |, then rows.`,
  'Passages: add a row on the Groups sheet (group_id, passage_en, optional passage_hi and image_refs) and put its group_id on each question.',
  'Images: upload a ZIP with this workbook and the image files; list their paths in image_refs separated by semicolons (images/q1.png). JPEG, PNG or WebP, 10 MB each.',
  'No formulas, macros or links. The Sections, Codes and Instructions sheets are for reference and are ignored on import.',
];

@Injectable()
export class AuthoringService {
  private readonly storage: ObjectStorage;
  private readonly scanner: ClamAvScanner;
  private readonly logger = new Logger(AuthoringService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {
    this.storage = new ObjectStorage(this.env);
    this.scanner = new ClamAvScanner(this.env.ANTIVIRUS_HOST, this.env.ANTIVIRUS_PORT);
  }

  async authoringOptions(identity: VerifiedIdentity): Promise<ExaminerAuthoringOptions> {
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, ownerId, async (client) => {
      const source = await repo.listAuthoringOptions(client);
      const exams = new Map<string, ExaminerAuthoringOptions['exams'][number]>();
      for (const row of source.exams) {
        let exam = exams.get(row.id);
        if (!exam) {
          exam = { id: row.id, name: row.name, stages: [], subjects: [] };
          exams.set(row.id, exam);
        }
        let stage = exam.stages.find((item) => item.id === row.stageId);
        if (!stage) {
          stage = { id: row.stageId, name: row.stageName, templates: [] };
          exam.stages.push(stage);
        }
        if (!stage.templates.some((item) => item.id === row.templateId)) {
          stage.templates.push({
            id: row.templateId,
            name: row.templateName,
            version: row.version,
          });
        }
      }
      for (const row of source.subjects) {
        const exam = exams.get(row.examId);
        if (!exam) continue;
        let subject = exam.subjects.find((item) => item.id === row.id);
        if (!subject) {
          subject = { id: row.id, name: row.name, topics: [] };
          exam.subjects.push(subject);
        }
        subject.topics.push({ id: row.topicId, name: row.topicName });
      }
      return {
        agreementVersion:
          this.env.EXAMINER_AGREEMENT_VERSION ??
          (this.env.APP_ENV === 'local' || this.env.APP_ENV === 'test' ? 'm3-local-test-v1' : null),
        agreementText:
          this.env.EXAMINER_AGREEMENT_TEXT ??
          (this.env.APP_ENV === 'local' || this.env.APP_ENV === 'test'
            ? 'Local/test-only agreement placeholder. This is not a legal agreement and does not authorize real content, KYC, sales, or payouts.'
            : null),
        exams: [...exams.values()],
      };
    });
  }

  async ownApplication(identity: VerifiedIdentity): Promise<ExaminerApplication | null> {
    const examinerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, examinerId, async (client) => {
      const row = await repo.getOwnApplication(client, examinerId);
      if (!row) return null;
      return this.toApplication(row, await repo.listSamples(client, row.id));
    });
  }

  async createApplication(
    identity: VerifiedIdentity,
    req: CreateExaminerApplicationRequest,
  ): Promise<ExaminerApplication> {
    if (!identity.emailVerified)
      throw new ApiError(401, 'UNAUTHENTICATED', 'A verified email is required.');
    const agreementVersion =
      this.env.EXAMINER_AGREEMENT_VERSION ??
      (this.env.APP_ENV === 'local' || this.env.APP_ENV === 'test'
        ? 'm3-local-test-v1'
        : undefined);
    const agreementText =
      this.env.EXAMINER_AGREEMENT_TEXT ??
      (this.env.APP_ENV === 'local' || this.env.APP_ENV === 'test'
        ? 'Local/test-only agreement placeholder.'
        : undefined);
    if (!agreementVersion || !agreementText || req.agreementVersion !== agreementVersion) {
      throw new ApiError(
        503,
        'AGREEMENT_UNAVAILABLE',
        'Examiner applications are unavailable until an approved agreement is configured.',
      );
    }
    this.assertContent(
      req.samples.flatMap((sample, index) =>
        questionContentIssues(sample).map((issue) => ({
          path: `samples.${index}.${issue.path}`,
          message: `Sample ${index + 1}, ${issue.message}`,
        })),
      ),
    );
    const examinerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, examinerId, async (client) => {
      // The 18+ gate covers examiners too (PRD 12, O05); the server records it, never the page.
      if (!(await identityRepository.getProfile(client, examinerId))?.is_age_verified_18_plus) {
        throw new ApiError(
          400,
          'AGE_CONFIRMATION_REQUIRED',
          'Confirm you are 18 or older before applying.',
        );
      }
      if (
        !(await repo.validateApplicationTaxonomy(client, req.examIds, req.subjectIds, req.samples))
      ) {
        throw new ApiError(
          422,
          'VALIDATION_FAILED',
          'Selected exams, subjects, topics, or sample assignments are invalid.',
        );
      }
      const kycIds = [
        req.photoAssetId,
        req.panDocAssetId,
        req.bankProofAssetId,
        req.businessProofAssetId,
      ].filter((id): id is string => id !== undefined);
      const sampleImages = req.samples.flatMap((sample) => sample.imageAssetIds);
      if (
        !(await assetRepo.validateOwnedAssets(client, examinerId, kycIds, ['examiner_kyc'])) ||
        !(await assetRepo.validateOwnedAssets(client, examinerId, sampleImages, ['question_asset']))
      ) {
        throw new ApiError(
          422,
          'VALIDATION_FAILED',
          'Uploaded documents or images are incomplete or not owned by this account.',
        );
      }

      const id = await repo.createApplication(client, examinerId, req);
      if (!id)
        throw new ApiError(
          409,
          'APPLICATION_ALREADY_EXISTS',
          'A pending or approved application cannot be replaced.',
        );
      await repo.replaceSamples(client, id, req.samples);
      const row = (await repo.getApplication(client, id))!;
      const samples = await repo.listSamples(client, id);
      return this.toApplication(row, samples);
    });
  }

  async listApplications(access: AccessContext): Promise<ExaminerApplicationList> {
    this.requireOps(access);
    return withUser(this.db, access.profileId, async (client) => {
      const rows = await repo.listApplications(client);
      const items: ExaminerApplication[] = [];
      for (const row of rows) {
        items.push(this.toApplication(row, await repo.listSamples(client, row.id)));
      }
      return { items };
    });
  }

  async kycDownloadUrl(
    access: AccessContext,
    applicationId: string,
    assetId: string,
  ): Promise<AdminKycDownloadUrl> {
    this.requireOps(access);
    const asset = await withUser(this.db, access.profileId, async (client) => {
      const asset = await assetRepo.getKycAssetForReview(client, applicationId, assetId);
      if (!asset) throw notFound('KYC document');
      if (!asset.uploaded_at || asset.scan_status !== 'clean') {
        throw new ApiError(
          409,
          'INVALID_ASSET',
          'This document is unavailable until upload verification and malware scanning finish.',
        );
      }
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id,action_name,target_table,target_record_id,after_state)
         VALUES ($1,'examiner_kyc.download_url','assets',$2,$3::jsonb)`,
        [access.profileId, asset.id, JSON.stringify({ applicationId, mimeType: asset.mime_type })],
      );
      return asset;
    });
    const signed = await this.storage.presignedDownload(
      asset.bucket,
      asset.object_key,
      asset.original_name,
    );
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  async decideApplication(
    access: AccessContext,
    id: string,
    req: DecideExaminerApplicationRequest,
  ): Promise<ExaminerApplication> {
    this.requireOps(access);
    return withUser(this.db, access.profileId, async (client) => {
      await client.query("SELECT set_config('app.audit_action', $1, true)", [
        `examiner_application.${req.status}`,
      ]);
      const found = await repo.decide(
        client,
        id,
        access.profileId,
        req.status,
        req.rejectionReason ?? null,
      );
      if (!found) throw notFound('Examiner application');
      const row = (await repo.getApplication(client, id))!;
      return this.toApplication(row, await repo.listSamples(client, id));
    });
  }

  async createUploadIntent(
    identity: VerifiedIdentity,
    req: AssetUploadIntentRequest,
  ): Promise<AssetUploadIntent> {
    if (!identity.emailVerified)
      throw new ApiError(401, 'UNAUTHENTICATED', 'A verified email is required.');
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    const bucket =
      req.classification === 'examiner_kyc'
        ? 'examiner-kyc'
        : req.classification === 'question_asset' || req.classification === 'import_archive'
          ? 'question-assets'
          : 'public-media';
    const limits: Record<typeof req.classification, number> = {
      public_media: 5 * 1024 * 1024,
      question_asset: 10 * 1024 * 1024,
      examiner_kyc: 10 * 1024 * 1024,
      import_archive: 20 * 1024 * 1024,
    };
    if (req.sizeBytes > limits[req.classification]) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'The file exceeds the limit for this asset type.',
      );
    }
    const allowed = new Map([
      ['public_media', ['image/jpeg', 'image/png', 'image/webp']],
      ['question_asset', ['image/jpeg', 'image/png', 'image/webp']],
      ['examiner_kyc', ['image/jpeg', 'image/png', 'application/pdf']],
      [
        'import_archive',
        ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ],
    ]);
    if (!allowed.get(req.classification)?.includes(req.mimeType)) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'This MIME type is not allowed for this asset type.',
      );
    }
    const assetId = randomUUID();
    const intent = await this.storage.presignedPut(bucket, ownerId, assetId, req.filename);
    return withUser(this.db, ownerId, async (client) => {
      await assetRepo.create(
        client,
        assetId,
        ownerId,
        req.classification,
        req.classification === 'examiner_kyc'
          ? 'staff'
          : req.classification === 'public_media'
            ? 'public'
            : 'examiner',
        bucket,
        intent.objectKey,
        req.filename,
        req.mimeType,
        req.sizeBytes,
      );
      return {
        id: assetId,
        bucket,
        objectKey: intent.objectKey,
        uploadUrl: intent.uploadUrl,
        expiresAt: intent.expiresAt.toISOString(),
      };
    });
  }

  async completeUpload(
    identity: VerifiedIdentity,
    assetId: string,
    req: CompleteAssetRequest,
  ): Promise<{ id: string; sha256: string; sizeBytes: number }> {
    if (!identity.emailVerified)
      throw new ApiError(401, 'UNAUTHENTICATED', 'A verified email is required.');
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    const asset = await withUser(this.db, ownerId, (client) =>
      assetRepo.get(client, assetId, ownerId),
    );
    if (!asset) throw notFound('Asset');
    const stat = await this.storage.stat(asset.bucket, asset.object_key);
    if (stat.size !== req.sizeBytes || stat.size !== Number(asset.size_bytes)) {
      throw new ApiError(409, 'STALE_EDIT', 'Uploaded size does not match the upload intent.');
    }
    const actual = await this.storage.download(
      asset.bucket,
      asset.object_key,
      Number(asset.size_bytes),
    );
    if (actual.bytes.length !== req.sizeBytes || actual.sha256 !== req.sha256) {
      throw new ApiError(
        409,
        'STALE_EDIT',
        'Uploaded content does not match the supplied size or SHA-256.',
      );
    }
    if (!this.matchesMimeType(actual.bytes, asset.mime_type)) {
      throw new ApiError(
        422,
        'INVALID_ASSET',
        'Uploaded content does not match its declared file type.',
      );
    }
    if (asset.uploaded_at && asset.sha256 !== actual.sha256) {
      throw new ApiError(
        409,
        'STALE_EDIT',
        'The asset was already completed with different content.',
      );
    }
    let scanResult: 'clean' | 'infected';
    try {
      scanResult = await this.scanner.scan(actual.bytes);
    } catch (error) {
      this.logger.error(
        'ClamAV scan failed for an uploaded asset',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ApiError(
        503,
        'SCANNER_UNAVAILABLE',
        'The malware scanner is unavailable. The upload is not accepted; retry later.',
      );
    }
    const verifiedObjectKey = `${ownerId}/${assetId}/verified/${actual.sha256}`;
    if (scanResult === 'clean') {
      try {
        await this.storage.storeVerified(
          asset.bucket,
          verifiedObjectKey,
          actual.bytes,
          asset.mime_type,
        );
      } catch (error) {
        this.logger.error(
          'Object storage could not promote a scanned asset',
          error instanceof Error ? error.stack : undefined,
        );
        throw new ApiError(
          503,
          'STORAGE_UNAVAILABLE',
          'The verified file could not be stored. The upload is not accepted; retry later.',
        );
      }
    }
    const completed = await withUser(this.db, ownerId, (client) =>
      assetRepo.complete(
        client,
        assetId,
        ownerId,
        scanResult === 'clean' ? verifiedObjectKey : asset.object_key,
        actual.sha256,
        req.sizeBytes,
        scanResult === 'clean' ? 'clean' : 'rejected',
      ),
    );
    if (!completed) throw notFound('Asset');
    if (scanResult === 'infected') {
      throw new ApiError(422, 'INVALID_ASSET', 'The uploaded file failed malware scanning.');
    }
    if (asset.object_key !== verifiedObjectKey) {
      try {
        await this.storage.remove(asset.bucket, asset.object_key);
      } catch (error) {
        this.logger.warn(
          'A staged upload could not be removed after verification',
          error instanceof Error ? error.message : undefined,
        );
      }
    }
    return { id: assetId, sha256: actual.sha256, sizeBytes: req.sizeBytes };
  }

  async listDraftQuestions(
    identity: VerifiedIdentity,
    query: QuestionBankQuery,
  ): Promise<DraftQuestionList> {
    const examinerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, examinerId, async (client) => {
      if (!(await repo.requireExaminer(client, examinerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      const { rows, total } = await repo.listQuestions(client, examinerId, {
        status: query.status,
        examId: query.examId ?? null,
        subjectId: query.subjectId ?? null,
        topicId: query.topicId ?? null,
        difficulty: query.difficulty ?? null,
        // Escape LIKE wildcards so a search for "50%" matches the text, not everything.
        search: query.q ? query.q.replace(/[\\%_]/g, (char) => `\\${char}`) : null,
        limit: QUESTION_BANK_PAGE_SIZE,
        offset: (query.page - 1) * QUESTION_BANK_PAGE_SIZE,
      });
      return {
        items: rows.map((row) => ({
          ...this.toDraftQuestion(row),
          passage:
            row.passage_id && row.passage_en !== null
              ? {
                  id: row.passage_id,
                  contentEn: row.passage_en,
                  contentHi: row.passage_hi,
                  imageAssetIds: row.passage_images ?? [],
                }
              : null,
        })),
        total,
        page: query.page,
        pageSize: QUESTION_BANK_PAGE_SIZE,
      };
    });
  }

  async questionImageUrl(identity: VerifiedIdentity, assetId: string): Promise<AssetViewUrl> {
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    const asset = await withUser(this.db, ownerId, (client) =>
      assetRepo.getOwnCleanImage(client, ownerId, assetId),
    );
    if (!asset) throw notFound('Image');
    const signed = await this.storage.presignedView(asset.bucket, asset.object_key, asset.mime_type);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  async createDraftQuestion(
    identity: VerifiedIdentity,
    req: DraftQuestionInput,
  ): Promise<DraftQuestion> {
    const examinerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, examinerId, async (client) => {
      if (!(await repo.requireExaminer(client, examinerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      const values = await this.validatedQuestionValues(client, examinerId, req);
      return this.toDraftQuestion(await repo.createQuestion(client, examinerId, values));
    });
  }

  /** Shared create/edit validation; the server, not the form, decides what is stored. */
  private async validatedQuestionValues(
    client: Parameters<typeof repo.createQuestion>[0],
    examinerId: string,
    req: DraftQuestionInput,
  ): Promise<Parameters<typeof repo.createQuestion>[2]> {
    this.assertContent(questionContentIssues(req));
    const passageId = req.passageId ?? null;
    if (
      !(await repo.validateQuestionTaxonomy(
        client,
        examinerId,
        req.examId,
        req.subjectId,
        req.topicId,
        passageId,
      ))
    ) {
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'The selected exam, subject, topic, or passage is not available to this examiner.',
      );
    }
    if (
      !(await assetRepo.validateOwnedAssets(client, examinerId, req.imageAssetIds, [
        'question_asset',
      ]))
    ) {
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'Question images must be clean, completed uploads owned by this account.',
      );
    }
    // Blank Hindi is stored as absent; the contract already rejects partial Hindi.
    const stemHi = req.stemHi?.trim() || null;
    const options = req.options.map(({ id, textEn, textHi }) =>
      textHi?.trim() ? { id, textEn, textHi } : { id, textEn },
    );
    const normalized = this.normalizeQuestion(req.stemEn, stemHi ?? undefined, options);
    return {
      examId: req.examId,
      subjectId: req.subjectId,
      topicId: req.topicId,
      passageId,
      questionType: passageId ? 'comprehension_mcq' : 'single_mcq',
      difficulty: req.difficulty,
      stemEn: req.stemEn,
      stemHi,
      options,
      correctOption: req.correctOption,
      solutionEn: req.solutionEn,
      solutionHi: req.solutionHi?.trim() || null,
      isPyq: req.isPyq,
      pyqYear: req.isPyq ? (req.pyqYear ?? null) : null,
      pyqShift: req.isPyq ? req.pyqShift?.trim() || null : null,
      imageAssetIds: req.imageAssetIds,
      normStemEn: normalized.stemEn,
      normStemHi: normalized.stemHi,
      textHash: normalized.textHash,
      maskedHash: normalized.maskedHash,
    };
  }

  async updateDraftQuestion(
    identity: VerifiedIdentity,
    id: string,
    req: DraftQuestionInput,
  ): Promise<DraftQuestion> {
    const examinerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, examinerId, async (client) => {
      if (!(await repo.requireExaminer(client, examinerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      const original = await repo.getQuestion(client, examinerId, id);
      if (!original) throw notFound('Draft question');
      if (original.is_approved_in_corpus)
        throw new ApiError(409, 'QC_LOCKED', 'Approved questions cannot be edited.');
      // An edit must name the version it was based on, or two tabs could silently overwrite.
      if (req.expectedRevision === undefined) {
        throw new ApiError(400, 'VALIDATION_FAILED', 'expectedRevision is required to edit.');
      }
      if (req.expectedRevision !== original.version_number) {
        throw new ApiError(409, 'STALE_EDIT', 'The question changed after you opened it.');
      }
      const values = await this.validatedQuestionValues(client, examinerId, req);
      const row = await repo.createQuestionVersion(
        client,
        examinerId,
        id,
        original.version_number,
        values,
      );
      if (!row)
        throw new ApiError(
          409,
          'STALE_EDIT',
          'The question changed after you opened it. Reload before saving.',
        );
      return this.toDraftQuestion(row);
    });
  }

  /**
   * A blank import workbook for one published template: the Questions and Groups headers the
   * parser reads, plus reference sheets (ignored on import) listing the template's sections and
   * the subject/topic codes this examiner may use, so a workbook can be filled without lookups.
   */
  async importTemplate(identity: VerifiedIdentity, query: ImportTemplateQuery): Promise<Buffer> {
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    const { sections, codes } = await withUser(this.db, ownerId, async (client) => {
      if (!(await repo.requireExaminer(client, ownerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      if (
        !(await repo.validateImportTarget(
          client,
          ownerId,
          query.examId,
          query.stageId,
          query.templateId,
        ))
      ) {
        throw new ApiError(
          422,
          'VALIDATION_FAILED',
          'The selected exam, stage, or published template is not assigned to this examiner.',
        );
      }
      return {
        sections: await repo.listImportSections(client, query.templateId),
        codes: await repo.listImportCodes(client, ownerId, query.examId),
      };
    });

    const workbook = new ExcelJS.Workbook();
    const bold = (sheet: ExcelJS.Worksheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    };
    const questions = workbook.addWorksheet('Questions');
    questions.addRow(IMPORT_QUESTION_COLUMNS);
    questions.columns.forEach((column) => (column.width = 18));
    bold(questions);
    const groups = workbook.addWorksheet('Groups');
    groups.addRow(['group_id', 'passage_en', 'passage_hi', 'image_refs']);
    groups.columns.forEach((column) => (column.width = 30));
    bold(groups);

    const subjectName = new Map(codes.map((code) => [code.subjectId, code.subjectName]));
    const sectionSheet = workbook.addWorksheet('Sections');
    sectionSheet.addRow(['section', 'positions', 'subject', 'subject_code']);
    for (const section of sections) {
      sectionSheet.addRow([
        section.name,
        `1-${section.questionCount}`,
        section.subjectId
          ? (subjectName.get(section.subjectId) ?? 'Not assigned to you')
          : 'Any assigned subject',
        section.subjectId ?? '',
      ]);
    }
    sectionSheet.columns.forEach((column) => (column.width = 28));
    bold(sectionSheet);
    const codeSheet = workbook.addWorksheet('Codes');
    codeSheet.addRow(['subject', 'subject_code', 'topic', 'topic_code']);
    for (const code of codes)
      codeSheet.addRow([code.subjectName, code.subjectId, code.topicName, code.topicId]);
    codeSheet.columns.forEach((column) => (column.width = 40));
    bold(codeSheet);
    const help = workbook.addWorksheet('Instructions');
    for (const line of IMPORT_INSTRUCTIONS) help.addRow([line]);
    help.getColumn(1).width = 120;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async previewImport(
    identity: VerifiedIdentity,
    req: ImportPreviewRequest,
  ): Promise<ImportPreview> {
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    const preflight = await withUser(this.db, ownerId, async (client) => {
      if (!(await repo.requireExaminer(client, ownerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      if (
        !(await repo.validateImportTarget(client, ownerId, req.examId, req.stageId, req.templateId))
      ) {
        throw new ApiError(
          422,
          'VALIDATION_FAILED',
          'The selected exam, stage, or published template is not assigned to this examiner.',
        );
      }
      const asset = await assetRepo.get(client, req.assetId, ownerId);
      if (
        !asset ||
        asset.classification !== 'import_archive' ||
        !asset.uploaded_at ||
        !asset.sha256 ||
        asset.scan_status !== 'clean'
      ) {
        throw new ApiError(
          422,
          'VALIDATION_FAILED',
          'Upload and complete malware scanning for the import archive before previewing it.',
        );
      }
      const sections = await repo.listImportSections(client, req.templateId);
      return { asset, sections };
    });

    const imported = await this.storage.download(
      preflight.asset.bucket,
      preflight.asset.object_key,
      20 * 1024 * 1024,
    );
    const fileHash = imported.sha256;
    if (fileHash !== preflight.asset.sha256) {
      throw new ApiError(409, 'STALE_EDIT', 'The uploaded archive changed after completion.');
    }
    const parsed = await this.parseImportArchive(imported.bytes, req.examId);
    const positions = new Set<string>();
    for (const row of parsed.rows) {
      if (row.errors.length) continue;
      const data = row.data as {
        section: string;
        position: number;
        subjectId: string;
      };
      const section = preflight.sections.find(
        (item) => item.name.trim().toLowerCase() === data.section.trim().toLowerCase(),
      );
      const key = `${data.section.trim().toLowerCase()}:${data.position}`;
      if (
        !section ||
        !Number.isInteger(data.position) ||
        data.position < 1 ||
        data.position > section.questionCount ||
        positions.has(key) ||
        (section.subjectId !== null && section.subjectId !== data.subjectId)
      ) {
        row.errors.push({
          row: row.row,
          cell: 'section',
          code: 'INVALID_TAXONOMY',
          message: 'Section, position, or section subject does not match the selected template.',
        } satisfies ImportRowError);
        continue;
      }
      positions.add(key);
    }

    const collectErrors = (groupErrors: ImportRowError[]) => [
      ...groupErrors,
      ...parsed.rows.flatMap((row) => row.errors as ImportRowError[]),
    ];
    const groupErrors = [...parsed.errors];
    const validated = await withUser(this.db, ownerId, async (client) => {
      if (
        !(await repo.requireExaminer(client, ownerId)) ||
        !(await repo.validateImportTarget(client, ownerId, req.examId, req.stageId, req.templateId))
      ) {
        throw new ApiError(
          409,
          'IMPORT_CONFLICT',
          'Examiner approval or the selected published template changed during preview.',
        );
      }
      const currentAsset = await assetRepo.get(client, req.assetId, ownerId);
      if (
        !currentAsset ||
        currentAsset.classification !== 'import_archive' ||
        !currentAsset.uploaded_at ||
        currentAsset.scan_status !== 'clean' ||
        currentAsset.object_key !== preflight.asset.object_key ||
        currentAsset.sha256 !== fileHash
      ) {
        throw new ApiError(409, 'STALE_EDIT', 'The uploaded archive changed during preview.');
      }
      for (const row of parsed.rows) {
        if (row.errors.length) continue;
        const data = row.data as { subjectId: string; topicId: string };
        if (
          !(await repo.validateQuestionTaxonomy(
            client,
            ownerId,
            req.examId,
            data.subjectId,
            data.topicId,
            null,
          ))
        ) {
          row.errors.push({
            row: row.row,
            cell: 'subject_code',
            code: 'INVALID_TAXONOMY',
            message: 'The subject or topic is not assigned to this examiner for the selected exam.',
          } satisfies ImportRowError);
        }
      }
      parsed.errors = collectErrors(groupErrors);
      parsed.questions = parsed.rows.filter((row) => !row.errors.length).map((row) => row.data);
      const manifestHash = createHash('sha256')
        .update(JSON.stringify(parsed.questions))
        .digest('hex');
      const existing = await repo.getImportByIdempotencyKey(client, ownerId, req.idempotencyKey);
      if (existing) {
        if (
          existing.file_hash !== fileHash ||
          existing.manifest_hash !== manifestHash ||
          existing.exam_id !== req.examId ||
          existing.stage_id !== req.stageId ||
          existing.template_id !== req.templateId ||
          existing.status === 'committed'
        ) {
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'This idempotency key was already used for a different or completed import.',
          );
        }
        return {
          preview: {
            id: existing.id,
            idempotencyKey: req.idempotencyKey,
            status: existing.status === 'rejected' ? 'rejected' : 'accepted',
            fileHash,
            manifestHash,
            parsedCount: existing.parsed_count,
            errorCount: existing.error_count,
            errors: parsed.errors,
          } satisfies ImportPreview,
        };
      }
      if (parsed.errors.length) {
        const run = await repo.previewImport(client, ownerId, {
          examId: req.examId,
          stageId: req.stageId,
          templateId: req.templateId,
          fileHash,
          manifestHash,
          idempotencyKey: req.idempotencyKey,
          parsedCount: parsed.questions.length,
          errorCount: parsed.errors.length,
        });
        if (!run)
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'This import key was submitted concurrently. Retry the preview.',
          );
        await repo.replaceImportRows(client, run.id, parsed.rows);
        return {
          preview: {
            id: run.id,
            idempotencyKey: req.idempotencyKey,
            status: 'rejected',
            fileHash,
            manifestHash,
            parsedCount: parsed.questions.length,
            errorCount: parsed.errors.length,
            errors: parsed.errors,
          } satisfies ImportPreview,
        };
      }
      return { needsAssets: true as const, manifestHash };
    });
    if ('preview' in validated) return validated.preview;
    const manifestHash = validated.manifestHash;

    const imageAssets: {
      path: string;
      id: string;
      bucket: string;
      objectKey: string;
      image: ImportedImage;
    }[] = [];
    const infectedImages = new Set<string>();
    for (const [path, image] of parsed.images) {
      let scanResult: 'clean' | 'infected';
      try {
        scanResult = await this.scanner.scan(image.bytes);
      } catch (error) {
        this.logger.error(
          'ClamAV scan failed for an imported image',
          error instanceof Error ? error.stack : undefined,
        );
        throw new ApiError(
          503,
          'SCANNER_UNAVAILABLE',
          'The malware scanner is unavailable. The import is not accepted; retry later.',
        );
      }
      if (scanResult === 'infected') infectedImages.add(path);
    }
    for (const path of infectedImages) {
      for (const row of parsed.rows) {
        const data = row.data as { imageRefs: string[]; groupId: string | null };
        if (data.imageRefs.includes(path)) {
          row.errors.push({
            row: row.row,
            cell: 'image_refs',
            code: 'INVALID_ASSET',
            message: `Image ${path} failed malware scanning.`,
          });
        }
      }
      for (const [groupId, group] of parsed.groups) {
        const referenced = parsed.rows.some(
          (row) => (row.data as { groupId: string | null }).groupId === groupId,
        );
        if (referenced && group.imageRefs.includes(path)) {
          groupErrors.push({
            sheet: 'Groups',
            row: group.row,
            cell: 'image_refs',
            code: 'INVALID_ASSET',
            message: `Image ${path} failed malware scanning.`,
          });
        }
      }
    }
    if (parsed.rows.some((row) => row.errors.length) || groupErrors.length) {
      parsed.errors = collectErrors(groupErrors);
      parsed.questions = parsed.rows.filter((row) => !row.errors.length).map((row) => row.data);
      return this.saveRejectedImport(ownerId, req, fileHash, manifestHash, parsed);
    }

    const imageAssetIds = new Map<string, string>();
    try {
      for (const [path, image] of parsed.images) {
        const id = randomUUID();
        const bucket = 'question-assets';
        const objectKey = `${ownerId}/${id}/verified/${image.sha256}`;
        imageAssets.push({ path, id, bucket, objectKey, image });
        await this.storage.storeVerified(bucket, objectKey, image.bytes, image.mimeType);
        imageAssetIds.set(path, id);
      }
    } catch (error) {
      await this.cleanupImportedImages(imageAssets);
      this.logger.error(
        'Object storage could not persist imported images',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        'An imported image could not be stored. The import is not accepted; retry later.',
      );
    }
    for (const row of parsed.rows) {
      const data = row.data as {
        imageRefs: string[];
        passageImageRefs: string[];
        imageAssetIds?: string[];
        passageImageAssetIds?: string[];
      };
      data.imageAssetIds = data.imageRefs.map((path) => imageAssetIds.get(path)!);
      data.passageImageAssetIds = data.passageImageRefs.map((path) => imageAssetIds.get(path)!);
    }
    try {
      const result = await withUser(this.db, ownerId, async (client) => {
        if (
          !(await repo.requireExaminer(client, ownerId)) ||
          !(await repo.validateImportTarget(
            client,
            ownerId,
            req.examId,
            req.stageId,
            req.templateId,
          ))
        ) {
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'Examiner approval or the selected published template changed during preview.',
          );
        }
        const currentAsset = await assetRepo.get(client, req.assetId, ownerId);
        if (
          !currentAsset ||
          currentAsset.classification !== 'import_archive' ||
          !currentAsset.uploaded_at ||
          currentAsset.scan_status !== 'clean' ||
          currentAsset.object_key !== preflight.asset.object_key ||
          currentAsset.sha256 !== fileHash
        ) {
          throw new ApiError(409, 'STALE_EDIT', 'The uploaded archive changed during preview.');
        }
        const existing = await repo.getImportByIdempotencyKey(client, ownerId, req.idempotencyKey);
        if (existing) {
          if (
            existing.file_hash !== fileHash ||
            existing.manifest_hash !== manifestHash ||
            existing.exam_id !== req.examId ||
            existing.stage_id !== req.stageId ||
            existing.template_id !== req.templateId ||
            existing.status === 'committed'
          ) {
            throw new ApiError(
              409,
              'IMPORT_CONFLICT',
              'This idempotency key was already used for a different or completed import.',
            );
          }
          return {
            created: false,
            preview: {
              id: existing.id,
              idempotencyKey: req.idempotencyKey,
              status: existing.status === 'rejected' ? 'rejected' : 'accepted',
              fileHash,
              manifestHash,
              parsedCount: existing.parsed_count,
              errorCount: existing.error_count,
              errors: parsed.errors,
            } satisfies ImportPreview,
          };
        }
        for (const image of imageAssets) {
          await assetRepo.createVerified(client, {
            id: image.id,
            ownerId,
            bucket: image.bucket,
            objectKey: image.objectKey,
            originalName: image.path,
            mimeType: image.image.mimeType,
            sizeBytes: image.image.bytes.length,
            sha256: image.image.sha256,
          });
        }
        const run = await repo.previewImport(client, ownerId, {
          examId: req.examId,
          stageId: req.stageId,
          templateId: req.templateId,
          fileHash,
          manifestHash,
          idempotencyKey: req.idempotencyKey,
          parsedCount: parsed.questions.length,
          errorCount: 0,
        });
        if (!run)
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'This import key was submitted concurrently. Retry the preview.',
          );
        await repo.replaceImportRows(client, run.id, parsed.rows);
        return {
          created: true,
          preview: {
            id: run.id,
            idempotencyKey: req.idempotencyKey,
            status: 'accepted',
            fileHash,
            manifestHash,
            parsedCount: parsed.questions.length,
            errorCount: 0,
            errors: [],
          } satisfies ImportPreview,
        };
      });
      if (!result.created) await this.cleanupImportedImages(imageAssets);
      return result.preview;
    } catch (error) {
      await this.cleanupImportedImages(imageAssets);
      throw error;
    }
  }

  async commitImport(
    identity: VerifiedIdentity,
    importId: string,
    req: ImportCommitRequest,
  ): Promise<{ id: string; questionIds: string[] }> {
    const ownerId = await identityRepository.ensureProfile(
      this.db,
      identity.uid,
      identity.email,
      identity.name,
    );
    return withUser(this.db, ownerId, async (client) => {
      const run = await repo.getImport(client, importId, ownerId);
      if (!run) throw notFound('Import');
      if (run.manifest_hash !== req.manifestHash || run.idempotency_key !== req.idempotencyKey) {
        throw new ApiError(
          409,
          'IMPORT_CONFLICT',
          'The import manifest or idempotency key changed.',
        );
      }
      if (run.status === 'committed')
        return { id: importId, questionIds: run.committed_question_ids };
      if (!(await repo.requireExaminer(client, ownerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      if (run.status !== 'accepted')
        throw new ApiError(422, 'IMPORT_REJECTED', 'Fix import validation errors before commit.');
      if (
        !run.template_id ||
        !(await repo.validateImportTarget(
          client,
          ownerId,
          run.exam_id,
          run.stage_id,
          run.template_id,
        ))
      ) {
        throw new ApiError(
          409,
          'IMPORT_CONFLICT',
          'The selected published template or examiner assignment changed after preview.',
        );
      }
      const rows = await repo.listImportRows(client, importId);
      const questions = rows
        .map((row) => row.data as Parameters<typeof repo.commitImport>[5][number])
        .filter(Boolean);
      for (const question of questions) {
        if (
          !(await repo.validateQuestionTaxonomy(
            client,
            ownerId,
            question.examId,
            question.subjectId,
            question.topicId,
            null,
          ))
        ) {
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'Question taxonomy or examiner assignment changed after preview.',
          );
        }
      }
      const imageAssetIds = [
        ...new Set(
          questions.flatMap((question) => [
            ...(question.imageAssetIds ?? []),
            ...(question.passageImageAssetIds ?? []),
          ]),
        ),
      ];
      if (
        !(await assetRepo.validateOwnedAssets(client, ownerId, imageAssetIds, ['question_asset']))
      ) {
        throw new ApiError(
          409,
          'IMPORT_CONFLICT',
          'An imported image is no longer an uploaded, clean asset owned by this examiner.',
        );
      }
      const ids = await repo.commitImport(
        client,
        importId,
        ownerId,
        req.manifestHash,
        req.idempotencyKey,
        questions,
      );
      return { id: importId, questionIds: ids };
    });
  }

  private async saveRejectedImport(
    ownerId: string,
    req: ImportPreviewRequest,
    fileHash: string,
    manifestHash: string,
    parsed: {
      questions: unknown[];
      rows: { row: number; cell: string | null; data: unknown; errors: unknown[] }[];
      errors: ImportRowError[];
    },
  ): Promise<ImportPreview> {
    return withUser(this.db, ownerId, async (client) => {
      const existing = await repo.getImportByIdempotencyKey(client, ownerId, req.idempotencyKey);
      if (existing) {
        if (
          existing.file_hash !== fileHash ||
          existing.manifest_hash !== manifestHash ||
          existing.exam_id !== req.examId ||
          existing.stage_id !== req.stageId ||
          existing.template_id !== req.templateId ||
          existing.status === 'committed'
        ) {
          throw new ApiError(
            409,
            'IMPORT_CONFLICT',
            'This idempotency key was already used for a different or completed import.',
          );
        }
        return {
          id: existing.id,
          idempotencyKey: req.idempotencyKey,
          status: existing.status === 'rejected' ? 'rejected' : 'accepted',
          fileHash,
          manifestHash,
          parsedCount: existing.parsed_count,
          errorCount: existing.error_count,
          errors: parsed.errors,
        };
      }
      const run = await repo.previewImport(client, ownerId, {
        examId: req.examId,
        stageId: req.stageId,
        templateId: req.templateId,
        fileHash,
        manifestHash,
        idempotencyKey: req.idempotencyKey,
        parsedCount: parsed.questions.length,
        errorCount: parsed.errors.length,
      });
      if (!run)
        throw new ApiError(
          409,
          'IMPORT_CONFLICT',
          'This import key was submitted concurrently. Retry the preview.',
        );
      await repo.replaceImportRows(client, run.id, parsed.rows);
      return {
        id: run.id,
        idempotencyKey: req.idempotencyKey,
        status: 'rejected',
        fileHash,
        manifestHash,
        parsedCount: parsed.questions.length,
        errorCount: parsed.errors.length,
        errors: parsed.errors,
      };
    });
  }

  private async cleanupImportedImages(
    images: {
      bucket: string;
      objectKey: string;
    }[],
  ): Promise<void> {
    for (const image of images) {
      try {
        await this.storage.remove(image.bucket, image.objectKey);
      } catch (error) {
        this.logger.warn(
          'An uncommitted imported image could not be removed',
          error instanceof Error ? error.message : undefined,
        );
      }
    }
  }

  private assertContent(issues: { path: string; message: string }[]): void {
    if (issues.length) throw new ApiError(422, 'VALIDATION_FAILED', issues[0]!.message, { issues });
  }

  private toDraftQuestion(row: DraftQuestionRow): DraftQuestion {
    return {
      id: row.id,
      examId: row.exam_id,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      passageId: row.passage_id,
      versionNumber: row.version_number,
      questionType: row.question_type,
      difficulty: row.difficulty,
      stemEn: row.stem_en,
      stemHi: row.stem_hi,
      options: row.options as DraftQuestion['options'],
      correctOption: row.correct_option,
      solutionEn: row.solution_en,
      solutionHi: row.solution_hi,
      isApproved: row.is_approved_in_corpus,
      isPyq: row.is_pyq,
      pyqYear: row.pyq_year,
      pyqShift: row.pyq_shift,
      imageAssetIds: row.image_urls,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private normalizeQuestion(
    stemEn: string,
    stemHi: string | undefined,
    options: { id: 'A' | 'B' | 'C' | 'D'; textEn: string; textHi?: string | undefined }[],
  ) {
    const normStemEn = this.normalizeText(stemEn);
    const normStemHi = stemHi ? this.normalizeText(stemHi) : null;
    const sortedOptions = [...options]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((option) => this.normalizeText(option.textEn));
    const canonical = JSON.stringify({ stem: normStemEn, options: sortedOptions });
    const textHash = createHash('sha256').update(canonical).digest('hex');
    const maskedStem = normStemEn
      .replace(/\b\d+(?:[,.]\d+)*(?:%|\/\d+)?\b/g, '<NUMBER>')
      .replace(/₹|rs\.?/gi, '<CURRENCY>');
    const maskedHash = createHash('sha256')
      .update(
        JSON.stringify({
          stem: maskedStem,
          options: sortedOptions.map((option) =>
            option.replace(/\b\d+(?:[,.]\d+)*\b/g, '<NUMBER>'),
          ),
        }),
      )
      .digest('hex');
    return { stemEn: normStemEn, stemHi: normStemHi, textHash, maskedHash };
  }

  private matchesMimeType(bytes: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg')
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png')
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/webp')
      return (
        bytes.length >= 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP'
      );
    if (mimeType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    if (
      mimeType === 'application/zip' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        [0x03, 0x05, 0x07].includes(bytes[2]!) &&
        [0x04, 0x06, 0x08].includes(bytes[3]!)
      );
    }
    return false;
  }

  private async parseImportArchive(
    archive: Buffer,
    examId: string,
  ): Promise<{
    questions: unknown[];
    rows: { row: number; cell: string | null; data: unknown; errors: unknown[] }[];
    errors: ImportRowError[];
    groups: Map<string, ImportedGroup>;
    images: Map<string, ImportedImage>;
  }> {
    const archiveNames = this.inspectZip(archive);
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(archive));
    } catch {
      throw new ApiError(
        400,
        'INVALID_IMPORT',
        'The upload is not a supported XLSX or ZIP archive.',
      );
    }

    let decompressed = 0;
    for (const bytes of Object.values(entries)) {
      decompressed += bytes.byteLength;
    }
    if (decompressed > 100 * 1024 * 1024) {
      throw new ApiError(400, 'IMPORT_TOO_LARGE', 'The expanded import exceeds 100 MB.');
    }
    if (
      archiveNames.some((name) =>
        /(^|\/)(vbaProject\.bin|externalLinks|embeddings|macrosheets)(\/|$)/i.test(name),
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_IMPORT',
        'Macros, embedded objects, and external workbook links are not supported.',
      );
    }

    const xlsxEntry = Object.entries(entries).find(
      ([name]) =>
        name.toLowerCase() === 'questions.xlsx' ||
        name.toLowerCase().endsWith('/questions.xlsx') ||
        name.toLowerCase() === 'xl/workbook.xml',
    );
    let workbookBuffer: Buffer;
    if (xlsxEntry) {
      workbookBuffer =
        xlsxEntry[0].toLowerCase() === 'xl/workbook.xml' ? archive : Buffer.from(xlsxEntry[1]);
    } else if (Object.keys(entries).some((name) => name.endsWith('.xlsx'))) {
      const candidate = Object.entries(entries).find(([name]) => name.endsWith('.xlsx'));
      if (!candidate) throw new ApiError(400, 'INVALID_IMPORT', 'No XLSX workbook was found.');
      workbookBuffer = Buffer.from(candidate[1]);
    } else {
      throw new ApiError(400, 'INVALID_IMPORT', 'No Questions.xlsx sheet was found.');
    }

    const workbook = new ExcelJS.Workbook();
    const workbookNames = this.inspectZip(workbookBuffer);
    if (
      workbookNames.some((name) =>
        /(^|\/)(vbaProject\.bin|externalLinks|embeddings|macrosheets)(\/|$)/i.test(name),
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_IMPORT',
        'Macros, embedded objects, and external workbook links are not supported.',
      );
    }
    try {
      await (
        workbook.xlsx as unknown as {
          load(buffer: never): Promise<unknown>;
        }
      ).load(workbookBuffer as never);
    } catch {
      throw new ApiError(
        400,
        'INVALID_IMPORT',
        'The XLSX workbook is corrupt or uses unsupported formatting.',
      );
    }
    const sheet = workbook.getWorksheet('Questions');
    if (!sheet)
      throw new ApiError(400, 'INVALID_IMPORT', 'The workbook must contain a Questions sheet.');
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) => {
      const value = String(cell.value ?? '')
        .trim()
        .toLowerCase();
      if (value && headers.has(value)) {
        throw new ApiError(400, 'INVALID_IMPORT', `The workbook has a duplicate ${value} column.`);
      }
      if (value) headers.set(value, col);
    });
    const required = [
      'row_id',
      'section',
      'position',
      'stem_en',
      'option_a_en',
      'option_b_en',
      'option_c_en',
      'option_d_en',
      'correct_option',
      'solution_en',
      'subject_code',
      'topic_code',
      'difficulty',
    ];
    const missing = required.filter((header) => !headers.has(header));
    if (missing.length) {
      throw new ApiError(400, 'INVALID_IMPORT', `Missing required columns: ${missing.join(', ')}`);
    }

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const questions: unknown[] = [];
    const importRows: { row: number; cell: string | null; data: unknown; errors: unknown[] }[] = [];
    const groups = new Map<string, ImportedGroup>();
    const images = new Map<string, ImportedImage>();
    const groupErrors: ImportRowError[] = [];
    const usedGroups = new Set<string>();
    const imageRefs = (value: string) => {
      if (!value) return { refs: [] as string[], malformed: false };
      const refs = value.split(';').map((ref) => ref.trim());
      return {
        refs: refs.filter(Boolean),
        malformed: refs.some((ref) => !ref),
      };
    };
    const safeImagePath = (path: string) =>
      path.length <= 255 &&
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes(':') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
    const loadImage = (path: string): ImportedImage | undefined => {
      const entry = entries[path];
      if (!entry) return undefined;
      const bytes = Buffer.from(entry);
      if (bytes.length > 10 * 1024 * 1024) return undefined;
      const extension = path.split('.').pop()?.toLowerCase();
      const mimeType =
        extension === 'jpg' || extension === 'jpeg'
          ? 'image/jpeg'
          : extension === 'png'
            ? 'image/png'
            : extension === 'webp'
              ? 'image/webp'
              : undefined;
      if (!mimeType || !this.matchesMimeType(bytes, mimeType)) return undefined;
      return { bytes, mimeType, sha256: createHash('sha256').update(bytes).digest('hex') };
    };

    const groupsSheet = workbook.getWorksheet('Groups');
    if (groupsSheet) {
      const groupHeaders = new Map<string, number>();
      groupsSheet.getRow(1).eachCell((cell, col) => {
        const value = String(cell.value ?? '')
          .trim()
          .toLowerCase();
        if (value && groupHeaders.has(value)) {
          throw new ApiError(
            400,
            'INVALID_IMPORT',
            `The Groups sheet has a duplicate ${value} column.`,
          );
        }
        if (value) groupHeaders.set(value, col);
      });
      const groupRequired = ['group_id', 'passage_en'];
      const missingGroupHeaders = groupRequired.filter((header) => !groupHeaders.has(header));
      if (missingGroupHeaders.length) {
        for (const header of missingGroupHeaders) {
          groupErrors.push({
            sheet: 'Groups',
            row: 1,
            cell: header,
            code: 'REQUIRED',
            message: `The Groups sheet requires a ${header} column.`,
          });
        }
      } else {
        groupsSheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          if (rowNumber > 201) {
            throw new ApiError(
              400,
              'IMPORT_TOO_LARGE',
              'An import may contain at most 200 passage groups.',
            );
          }
          const text = (header: string) => {
            const column = groupHeaders.get(header);
            return column === undefined ? '' : String(row.getCell(column).text ?? '').trim();
          };
          const groupId = text('group_id');
          const passageEn = text('passage_en');
          const parsedRefs = imageRefs(text('image_refs'));
          const rowErrors: ImportRowError[] = [];
          const formulaColumn = [...groupHeaders.values()].find(
            (col) => row.getCell(col).type === ExcelJS.ValueType.Formula,
          );
          if (formulaColumn !== undefined) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell:
                [...groupHeaders.entries()].find(([, col]) => col === formulaColumn)?.[0] ?? null,
              code: 'UNSUPPORTED_FORMULA',
              message: 'Formula cells are not supported; replace them with plain values.',
            });
          }
          if (!groupId) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell: 'group_id',
              code: 'REQUIRED',
              message: 'group_id is required.',
            });
          } else if (groups.has(groupId)) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell: 'group_id',
              code: 'INVALID_GROUP',
              message: 'group_id must be unique.',
            });
          }
          if (!passageEn) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell: 'passage_en',
              code: 'REQUIRED',
              message: 'passage_en is required.',
            });
          }
          for (const column of ['passage_en', 'passage_hi']) {
            for (const message of contentIssues(text(column))) {
              rowErrors.push({
                sheet: 'Groups',
                row: rowNumber,
                cell: column,
                code: 'INVALID_CONTENT',
                message,
              });
            }
          }
          if (parsedRefs.malformed || parsedRefs.refs.length > 20) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell: 'image_refs',
              code: 'INVALID_GROUP',
              message: 'image_refs must contain at most 20 semicolon-separated paths.',
            });
          }
          const uniqueRefs = new Set(parsedRefs.refs);
          if (uniqueRefs.size !== parsedRefs.refs.length) {
            rowErrors.push({
              sheet: 'Groups',
              row: rowNumber,
              cell: 'image_refs',
              code: 'INVALID_GROUP',
              message: 'An image path may appear only once in a group.',
            });
          }
          for (const ref of parsedRefs.refs) {
            const image = safeImagePath(ref) ? loadImage(ref) : undefined;
            if (!image) {
              rowErrors.push({
                sheet: 'Groups',
                row: rowNumber,
                cell: 'image_refs',
                code: 'INVALID_GROUP',
                message: `Image ${ref} is missing, unsafe, oversized, or not a supported image.`,
              });
            } else {
              images.set(ref, image);
            }
          }
          groupErrors.push(...rowErrors);
          if (groupId && !groups.has(groupId) && passageEn) {
            groups.set(groupId, {
              row: rowNumber,
              passageEn,
              passageHi: text('passage_hi') || null,
              imageRefs: parsedRefs.refs,
            });
          }
        });
      }
    }

    const rowIds = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (rowNumber > 201) {
        throw new ApiError(
          400,
          'IMPORT_TOO_LARGE',
          'An import may contain at most 200 question rows.',
        );
      }
      const text = (header: string) => {
        const column = headers.get(header);
        return column === undefined ? '' : String(row.getCell(column).text ?? '').trim();
      };
      const subjectId = text('subject_code');
      const topicId = text('topic_code');
      const rowId = text('row_id');
      const section = text('section');
      const position = Number(text('position'));
      const correctOption = text('correct_option').toUpperCase();
      const difficulty = text('difficulty').toLowerCase();
      const rowErrors: ImportRowError[] = [];
      const groupId = text('group_id') || null;
      const parsedRefs = imageRefs(text('image_refs'));
      const formulaColumn = [...headers.values()].find(
        (col) => row.getCell(col).type === ExcelJS.ValueType.Formula,
      );
      if (formulaColumn !== undefined) {
        rowErrors.push({
          row: rowNumber,
          cell: [...headers.entries()].find(([, col]) => col === formulaColumn)?.[0] ?? null,
          code: 'UNSUPPORTED_FORMULA',
          message: 'Formula cells are not supported; replace them with plain values.',
        });
      }
      if (parsedRefs.malformed || parsedRefs.refs.length > 20) {
        rowErrors.push({
          row: rowNumber,
          cell: 'image_refs',
          code: 'INVALID_GROUP',
          message: 'image_refs must contain at most 20 semicolon-separated paths.',
        });
      }
      if (new Set(parsedRefs.refs).size !== parsedRefs.refs.length) {
        rowErrors.push({
          row: rowNumber,
          cell: 'image_refs',
          code: 'INVALID_GROUP',
          message: 'An image path may appear only once in a question.',
        });
      }
      if (groupId) {
        if (!groups.has(groupId)) {
          rowErrors.push({
            row: rowNumber,
            cell: 'group_id',
            code: 'INVALID_GROUP',
            message: 'group_id must match a row in the Groups sheet.',
          });
        } else {
          usedGroups.add(groupId);
        }
      }
      for (const ref of parsedRefs.refs) {
        const image = safeImagePath(ref) ? loadImage(ref) : undefined;
        if (!image) {
          rowErrors.push({
            row: rowNumber,
            cell: 'image_refs',
            code: 'INVALID_GROUP',
            message: `Image ${ref} is missing, unsafe, oversized, or not a supported image.`,
          });
        } else {
          images.set(ref, image);
        }
      }
      if (!text('stem_en'))
        rowErrors.push({
          row: rowNumber,
          cell: 'stem_en',
          code: 'REQUIRED',
          message: 'stem_en is required.',
        });
      if (!text('solution_en'))
        rowErrors.push({
          row: rowNumber,
          cell: 'solution_en',
          code: 'REQUIRED',
          message: 'solution_en is required.',
        });
      if (!rowId)
        rowErrors.push({
          row: rowNumber,
          cell: 'row_id',
          code: 'REQUIRED',
          message: 'row_id is required.',
        });
      else if (rowIds.has(rowId))
        rowErrors.push({
          row: rowNumber,
          cell: 'row_id',
          code: 'DUPLICATE_ROW',
          message: 'row_id must be unique.',
        });
      else rowIds.add(rowId);
      if (!section)
        rowErrors.push({
          row: rowNumber,
          cell: 'section',
          code: 'REQUIRED',
          message: 'section is required.',
        });
      if (!Number.isInteger(position) || position < 1)
        rowErrors.push({
          row: rowNumber,
          cell: 'position',
          code: 'INVALID_POSITION',
          message: 'position must be a positive integer.',
        });
      if (!uuidPattern.test(subjectId))
        rowErrors.push({
          row: rowNumber,
          cell: 'subject_code',
          code: 'INVALID_UUID',
          message: 'subject_code must be a UUID.',
        });
      if (!uuidPattern.test(topicId))
        rowErrors.push({
          row: rowNumber,
          cell: 'topic_code',
          code: 'INVALID_UUID',
          message: 'topic_code must be a UUID.',
        });
      if (!['A', 'B', 'C', 'D'].includes(correctOption))
        rowErrors.push({
          row: rowNumber,
          cell: 'correct_option',
          code: 'INVALID_OPTION',
          message: 'correct_option must be A, B, C or D.',
        });
      if (!['easy', 'medium', 'hard'].includes(difficulty))
        rowErrors.push({
          row: rowNumber,
          cell: 'difficulty',
          code: 'INVALID_ENUM',
          message: 'difficulty must be easy, medium or hard.',
        });
      const options = [
        { id: 'A' as const, textEn: text('option_a_en'), textHi: text('option_a_hi') || undefined },
        { id: 'B' as const, textEn: text('option_b_en'), textHi: text('option_b_hi') || undefined },
        { id: 'C' as const, textEn: text('option_c_en'), textHi: text('option_c_hi') || undefined },
        { id: 'D' as const, textEn: text('option_d_en'), textHi: text('option_d_hi') || undefined },
      ];
      if (options.some((option) => !option.textEn))
        rowErrors.push({
          row: rowNumber,
          code: 'INVALID_OPTION_COUNT',
          cell: null,
          message: 'Exactly four English options are required.',
        });
      const hindiGaps = missingHindiFields({
        stemHi: text('stem_hi'),
        solutionHi: text('solution_hi'),
        options,
      });
      for (const path of hindiGaps) {
        const optionIndex = /^options\.(\d)\./.exec(path)?.[1];
        rowErrors.push({
          row: rowNumber,
          cell:
            optionIndex !== undefined
              ? `option_${'abcd'[Number(optionIndex)]}_hi`
              : path === 'stemHi'
                ? 'stem_hi'
                : 'solution_hi',
          code: 'REQUIRED',
          message: 'This row has partial Hindi. Fill this Hindi cell or clear all Hindi cells.',
        });
      }
      for (const column of [
        'stem_en',
        'stem_hi',
        ...['a', 'b', 'c', 'd'].flatMap((letter) => [`option_${letter}_en`, `option_${letter}_hi`]),
        'solution_en',
        'solution_hi',
      ]) {
        for (const message of contentIssues(text(column))) {
          rowErrors.push({ row: rowNumber, cell: column, code: 'INVALID_CONTENT', message });
        }
      }
      if (groupId && text('stem_hi') && !groups.get(groupId)?.passageHi) {
        rowErrors.push({
          row: rowNumber,
          cell: 'group_id',
          code: 'REQUIRED',
          message: 'This question has Hindi, so its Groups row needs passage_hi.',
        });
      }

      const source = text('source').toLowerCase();
      const pyqYear = Number(text('pyq_year') || 0);
      if (source && source !== 'pyq' && source !== 'original') {
        rowErrors.push({
          row: rowNumber,
          cell: 'source',
          code: 'INVALID_SOURCE',
          message: 'source must be pyq or original.',
        });
      }
      if (source === 'pyq' && (!Number.isInteger(pyqYear) || pyqYear < 1900 || pyqYear > 2100)) {
        rowErrors.push({
          row: rowNumber,
          cell: 'pyq_year',
          code: 'INVALID_ENUM',
          message: 'PYQ rows require a valid pyq_year.',
        });
      }
      const stemEn = text('stem_en');
      const stemHi = text('stem_hi') || null;
      const normalized = this.normalizeQuestion(stemEn, stemHi ?? undefined, options);
      const data = {
        rowId,
        section,
        position,
        examId,
        subjectId,
        topicId,
        stemEn,
        stemHi,
        options,
        correctOption,
        solutionEn: text('solution_en'),
        solutionHi: text('solution_hi') || null,
        difficulty,
        isPyq: source === 'pyq',
        pyqYear: source === 'pyq' && pyqYear >= 1900 ? pyqYear : null,
        pyqShift: source === 'pyq' ? text('pyq_shift') || null : null,
        groupId,
        imageRefs: parsedRefs.refs,
        passageEn: groupId ? (groups.get(groupId)?.passageEn ?? null) : null,
        passageHi: groupId ? (groups.get(groupId)?.passageHi ?? null) : null,
        passageImageRefs: groupId ? (groups.get(groupId)?.imageRefs ?? []) : [],
        normStemEn: normalized.stemEn,
        normStemHi: normalized.stemHi,
        textHash: normalized.textHash,
        maskedHash: normalized.maskedHash,
      };
      if (!rowErrors.length) questions.push(data);
      importRows.push({ row: rowNumber, cell: null, data, errors: rowErrors });
    });
    for (const [groupId, group] of groups) {
      if (!usedGroups.has(groupId)) {
        groupErrors.push({
          sheet: 'Groups',
          row: group.row,
          cell: 'group_id',
          code: 'INVALID_GROUP',
          message: 'This passage group is not referenced by any question.',
        });
      }
    }
    return { questions, rows: importRows, errors: groupErrors, groups, images };
  }

  private inspectZip(archive: Buffer): string[] {
    const invalid = () =>
      new ApiError(400, 'INVALID_IMPORT', 'The archive is malformed or contains an unsafe entry.');
    const minimum = 22;
    if (archive.length < minimum) throw invalid();
    const searchStart = Math.max(0, archive.length - 65_557);
    let eocd = -1;
    for (let offset = archive.length - minimum; offset >= searchStart; offset--) {
      if (archive.readUInt32LE(offset) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw invalid();
    const disk = archive.readUInt16LE(eocd + 4);
    const directoryDisk = archive.readUInt16LE(eocd + 6);
    const diskEntries = archive.readUInt16LE(eocd + 8);
    const totalEntries = archive.readUInt16LE(eocd + 10);
    const directorySize = archive.readUInt32LE(eocd + 12);
    const directoryOffset = archive.readUInt32LE(eocd + 16);
    const commentLength = archive.readUInt16LE(eocd + 20);
    if (
      disk !== 0 ||
      directoryDisk !== 0 ||
      diskEntries !== totalEntries ||
      totalEntries === 0xffff ||
      directorySize === 0xffffffff ||
      directoryOffset === 0xffffffff ||
      eocd + minimum + commentLength !== archive.length ||
      directoryOffset + directorySize > eocd ||
      totalEntries > 500
    )
      throw invalid();

    let cursor = directoryOffset;
    let expanded = 0;
    let compressed = 0;
    const names: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < totalEntries; index++) {
      if (
        cursor + 46 > directoryOffset + directorySize ||
        archive.readUInt32LE(cursor) !== 0x02014b50
      )
        throw invalid();
      const madeBy = archive.readUInt16LE(cursor + 4);
      const flags = archive.readUInt16LE(cursor + 8);
      const method = archive.readUInt16LE(cursor + 10);
      const compressedSize = archive.readUInt32LE(cursor + 20);
      const expandedSize = archive.readUInt32LE(cursor + 24);
      const nameLength = archive.readUInt16LE(cursor + 28);
      const extraLength = archive.readUInt16LE(cursor + 30);
      const entryCommentLength = archive.readUInt16LE(cursor + 32);
      const externalAttributes = archive.readUInt32LE(cursor + 38);
      const localOffset = archive.readUInt32LE(cursor + 42);
      const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
      if (
        end > directoryOffset + directorySize ||
        compressedSize === 0xffffffff ||
        expandedSize === 0xffffffff ||
        localOffset === 0xffffffff ||
        (flags & 1) !== 0 ||
        (method !== 0 && method !== 8)
      )
        throw invalid();
      let name: string;
      try {
        const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
        name =
          (flags & 0x800) !== 0
            ? new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
            : nameBytes.toString('latin1');
      } catch {
        throw invalid();
      }
      const parts = name.split('/');
      const mode = externalAttributes >>> 16;
      const hostSystem = madeBy >>> 8;
      const hasControlCharacter = name.split('').some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      });
      if (
        !name ||
        name.includes('\\') ||
        name.startsWith('/') ||
        /^[a-z]:/i.test(name) ||
        hasControlCharacter ||
        parts.some((part) => part === '.' || part === '..') ||
        (hostSystem === 3 && (mode & 0xf000) === 0xa000)
      )
        throw invalid();
      const key = name.toLocaleLowerCase('en-US');
      if (seen.has(key))
        throw new ApiError(400, 'INVALID_IMPORT', 'The archive contains duplicate file names.');
      seen.add(key);
      names.push(name);
      compressed += compressedSize;
      expanded += expandedSize;
      if (compressed > 20 * 1024 * 1024 || expanded > 100 * 1024 * 1024) {
        throw new ApiError(
          400,
          'IMPORT_TOO_LARGE',
          'The expanded import exceeds the archive size limits.',
        );
      }
      cursor = end;
    }
    if (cursor !== directoryOffset + directorySize) throw invalid();
    return names;
  }

  private requireOps(access: AccessContext): void {
    if (!access.roles.includes('admin') || !(access.admin.ops || access.admin.super)) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
  }

  private toApplication(
    row: ApplicationRow,
    samples: ExaminerApplication['samples'],
  ): ExaminerApplication {
    return {
      id: row.id,
      examinerId: row.examiner_id,
      examinerName: row.examiner_name,
      examinerEmail: row.examiner_email,
      accountType: row.account_type,
      instituteName: row.institute_name,
      bio: row.bio ?? '',
      experienceYears: row.experience_years,
      socialLinks: row.social_links as ExaminerApplication['socialLinks'],
      examIds: row.exam_ids,
      subjectIds: row.subject_ids,
      agreementVersion: row.agreement_version,
      agreementAcceptedAt: iso(row.agreement_accepted_at),
      photoAssetId: row.photo_asset_id,
      panDocAssetId: row.pan_doc_asset_id,
      bankProofAssetId: row.bank_proof_asset_id,
      businessProofAssetId: row.business_proof_asset_id,
      status: row.status,
      rejectionReason: row.rejection_reason,
      reviewedAt: iso(row.reviewed_at),
      createdAt: iso(row.created_at)!,
      samples,
    };
  }
}
