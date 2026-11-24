import type { Queryable } from '@exam-prep/db';
import type { ExaminerApplicationStatus, ExaminerSample } from '@exam-prep/contracts';

export interface ApplicationRow {
  id: string;
  examiner_id: string;
  examiner_name: string;
  examiner_email: string | null;
  account_type: 'individual' | 'institute';
  institute_name: string | null;
  bio: string | null;
  experience_years: number | null;
  social_links: unknown;
  exam_ids: string[];
  subject_ids: string[];
  agreement_version: string | null;
  agreement_accepted_at: Date | null;
  photo_asset_id: string | null;
  pan_doc_asset_id: string | null;
  bank_proof_asset_id: string | null;
  business_proof_asset_id: string | null;
  status: ExaminerApplicationStatus;
  rejection_reason: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

export interface SampleRow {
  position: number;
  exam_id: string;
  subject_id: string;
  topic_id: string;
  stem_en: string;
  stem_hi: string | null;
  options: unknown;
  correct_option: 'A' | 'B' | 'C' | 'D';
  solution_en: string;
  solution_hi: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  image_asset_ids: string[];
}

export interface DraftQuestionRow {
  id: string;
  parent_question_id?: string | null;
  exam_id: string;
  subject_id: string;
  topic_id: string;
  passage_id: string | null;
  version_number: number;
  question_type: 'single_mcq' | 'comprehension_mcq' | 'multi_mcq' | 'numeric';
  difficulty: 'easy' | 'medium' | 'hard';
  stem_en: string;
  stem_hi: string | null;
  options: unknown;
  correct_option: 'A' | 'B' | 'C' | 'D';
  solution_en: string;
  solution_hi: string | null;
  is_approved_in_corpus: boolean;
  is_pyq: boolean;
  pyq_year: number | null;
  pyq_shift: string | null;
  image_urls: string[];
  updated_at: Date;
}

export interface BankQuestionRow extends DraftQuestionRow {
  passage_en: string | null;
  passage_hi: string | null;
  passage_images: string[] | null;
}

export const authoringRepository = {
  async requireExaminer(db: Queryable, examinerId: string): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM examiner_profiles
         WHERE user_id=$1 AND onboarding_status='approved'
       ) AS exists`,
      [examinerId],
    );
    return rows[0]!.exists;
  },
  /** Unblocked admin with the finance (or super) flag; profiles RLS lets a user read their own row. */
  async isFinanceAdmin(db: Queryable, profileId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM profiles WHERE id=$1 AND 'admin'::user_role_type=ANY(roles) AND NOT is_blocked
          AND (is_finance_admin OR is_super_admin)`,
      [profileId],
    );
    return rowCount === 1;
  },
  async countExamsAndSubjects(
    db: Queryable,
    examIds: string[],
    subjectIds: string[],
  ): Promise<{ exams: number; subjects: number }> {
    const { rows } = await db.query<{ exams: number; subjects: number }>(
      `SELECT
         (SELECT count(*)::int FROM exams WHERE id = ANY($1::uuid[]) AND is_active) AS exams,
         (SELECT count(*)::int FROM subjects WHERE id = ANY($2::uuid[])) AS subjects`,
      [examIds, subjectIds],
    );
    return rows[0]!;
  },

  async listAuthoringOptions(db: Queryable): Promise<{
    exams: {
      id: string;
      name: string;
      stageId: string;
      stageName: string;
      templateId: string;
      templateName: string;
      version: number;
    }[];
    subjects: { id: string; examId: string; name: string; topicId: string; topicName: string }[];
  }> {
    const exams = await db.query<{
      id: string;
      name: string;
      stage_id: string;
      stage_name: string;
      template_id: string;
      template_name: string;
      version: number;
    }>(
      `SELECT e.id,e.name,es.id AS stage_id,es.name AS stage_name,et.id AS template_id,et.name AS template_name,et.version
           FROM exams e
           JOIN exam_stages es ON es.exam_id=e.id
           JOIN exam_templates et ON et.stage_id=es.id
          WHERE e.is_active AND et.is_active AND et.published_at IS NOT NULL
          ORDER BY e.name,es.display_order,et.version DESC,et.name`,
    );
    const subjects = await db.query<{
      id: string;
      exam_id: string;
      name: string;
      topic_id: string;
      topic_name: string;
    }>(
      `SELECT e.id AS exam_id,s.id,s.name,t.id AS topic_id,t.name AS topic_name
           FROM exams e JOIN subjects s ON s.exam_id=e.id
           JOIN topics t ON t.subject_id=s.id
          WHERE e.is_active ORDER BY e.name,s.name,t.name`,
    );
    return {
      exams: exams.rows.map((row) => ({
        id: row.id,
        name: row.name,
        stageId: row.stage_id,
        stageName: row.stage_name,
        templateId: row.template_id,
        templateName: row.template_name,
        version: row.version,
      })),
      subjects: subjects.rows.map((row) => ({
        id: row.id,
        examId: row.exam_id,
        name: row.name,
        topicId: row.topic_id,
        topicName: row.topic_name,
      })),
    };
  },

  async validateApplicationTaxonomy(
    db: Queryable,
    examIds: string[],
    subjectIds: string[],
    samples: ExaminerSample[],
  ): Promise<boolean> {
    const sampleExamIds = [...new Set(samples.map((sample) => sample.examId))].sort();
    const selectedExamIds = [...examIds].sort();
    const sampleSubjectIds = [...new Set(samples.map((sample) => sample.subjectId))].sort();
    const selectedSubjectIds = [...subjectIds].sort();
    if (
      JSON.stringify(sampleExamIds) !== JSON.stringify(selectedExamIds) ||
      JSON.stringify(sampleSubjectIds) !== JSON.stringify(selectedSubjectIds)
    )
      return false;
    const valid = await authoringRepository.countExamsAndSubjects(db, examIds, subjectIds);
    if (valid.exams !== examIds.length || valid.subjects !== subjectIds.length) return false;
    for (const sample of samples) {
      if (!examIds.includes(sample.examId) || !subjectIds.includes(sample.subjectId)) return false;
      if (
        !(await authoringRepository.validateTaxonomy(
          db,
          sample.examId,
          sample.subjectId,
          sample.topicId,
        ))
      )
        return false;
    }
    return true;
  },

  async createApplication(
    db: Queryable,
    examinerId: string,
    req: {
      accountType: 'individual' | 'institute';
      instituteName?: string | undefined;
      bio: string;
      experienceYears?: number | undefined;
      socialLinks: unknown;
      examIds: string[];
      subjectIds: string[];
      photoAssetId?: string | undefined;
      panDocAssetId?: string | undefined;
      bankProofAssetId?: string | undefined;
      businessProofAssetId?: string | undefined;
      agreementVersion: string;
    },
  ): Promise<string | undefined> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO examiner_applications
       (examiner_id, account_type, institute_name, bio, experience_years, social_links,
        exam_ids, subject_ids, photo_asset_id, pan_doc_asset_id, bank_proof_asset_id,
        business_proof_asset_id, agreement_version, agreement_accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (examiner_id) DO UPDATE SET
         account_type = EXCLUDED.account_type,
         institute_name = EXCLUDED.institute_name,
         bio = EXCLUDED.bio,
         experience_years = EXCLUDED.experience_years,
         social_links = EXCLUDED.social_links,
         exam_ids = EXCLUDED.exam_ids,
         subject_ids = EXCLUDED.subject_ids,
         photo_asset_id = EXCLUDED.photo_asset_id,
         pan_doc_asset_id = EXCLUDED.pan_doc_asset_id,
         bank_proof_asset_id = EXCLUDED.bank_proof_asset_id,
         business_proof_asset_id = EXCLUDED.business_proof_asset_id,
         agreement_version = EXCLUDED.agreement_version,
         agreement_accepted_at = now(),
         status = 'pending'
       WHERE examiner_applications.status='rejected'
       RETURNING id`,
      [
        examinerId,
        req.accountType,
        req.instituteName ?? null,
        req.bio,
        req.experienceYears ?? null,
        JSON.stringify(req.socialLinks),
        req.examIds,
        req.subjectIds,
        req.photoAssetId ?? null,
        req.panDocAssetId ?? null,
        req.bankProofAssetId ?? null,
        req.businessProofAssetId ?? null,
        req.agreementVersion,
      ],
    );
    return rows[0]?.id;
  },

  async replaceSamples(
    db: Queryable,
    applicationId: string,
    samples: ExaminerSample[],
  ): Promise<void> {
    await db.query('DELETE FROM examiner_sample_submissions WHERE application_id = $1', [
      applicationId,
    ]);
    for (const sample of samples) {
      await db.query(
        `INSERT INTO examiner_sample_submissions
         (application_id, position, exam_id, subject_id, topic_id, stem_en, stem_hi, options,
          correct_option, solution_en, solution_hi, difficulty, image_asset_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          applicationId,
          sample.position,
          sample.examId,
          sample.subjectId,
          sample.topicId,
          sample.stemEn,
          sample.stemHi ?? null,
          JSON.stringify(sample.options),
          sample.correctOption,
          sample.solutionEn,
          sample.solutionHi ?? null,
          sample.difficulty,
          sample.imageAssetIds,
        ],
      );
    }
  },

  async listApplications(db: Queryable): Promise<ApplicationRow[]> {
    const { rows } = await db.query<ApplicationRow>(
      `SELECT a.id, a.examiner_id, p.full_name AS examiner_name, p.email AS examiner_email,
              a.account_type, a.institute_name, a.bio, a.experience_years, a.social_links,
              a.exam_ids, a.subject_ids, a.agreement_version, a.agreement_accepted_at,
              a.photo_asset_id,a.pan_doc_asset_id,a.bank_proof_asset_id,a.business_proof_asset_id,
              a.status, a.rejection_reason, a.reviewed_at, a.created_at
         FROM examiner_applications a JOIN profiles p ON p.id = a.examiner_id
         ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`,
    );
    return rows;
  },

  async getApplication(db: Queryable, id: string): Promise<ApplicationRow | undefined> {
    const { rows } = await db.query<ApplicationRow>(
      `SELECT a.id, a.examiner_id, p.full_name AS examiner_name, p.email AS examiner_email,
              a.account_type, a.institute_name, a.bio, a.experience_years, a.social_links,
              a.exam_ids, a.subject_ids, a.agreement_version, a.agreement_accepted_at,
              a.photo_asset_id,a.pan_doc_asset_id,a.bank_proof_asset_id,a.business_proof_asset_id,
              a.status, a.rejection_reason, a.reviewed_at, a.created_at
         FROM examiner_applications a JOIN profiles p ON p.id = a.examiner_id
         WHERE a.id = $1`,
      [id],
    );
    return rows[0];
  },

  async getOwnApplication(db: Queryable, examinerId: string): Promise<ApplicationRow | undefined> {
    const { rows } = await db.query<ApplicationRow>(
      `SELECT a.id,a.examiner_id,p.full_name AS examiner_name,p.email AS examiner_email,
              a.account_type,a.institute_name,a.bio,a.experience_years,a.social_links,
              a.exam_ids,a.subject_ids,a.agreement_version,a.agreement_accepted_at,
              a.photo_asset_id,a.pan_doc_asset_id,a.bank_proof_asset_id,a.business_proof_asset_id,
              a.status,a.rejection_reason,a.reviewed_at,a.created_at
         FROM examiner_applications a JOIN profiles p ON p.id=a.examiner_id
        WHERE a.examiner_id=$1`,
      [examinerId],
    );
    return rows[0];
  },

  async listSamples(db: Queryable, applicationId: string): Promise<ExaminerSample[]> {
    const { rows } = await db.query<SampleRow>(
      `SELECT position, exam_id, subject_id, topic_id, stem_en, stem_hi, options,
              correct_option, solution_en, solution_hi, difficulty, image_asset_ids
         FROM examiner_sample_submissions WHERE application_id = $1 ORDER BY position`,
      [applicationId],
    );
    return rows.map((row) => ({
      position: row.position,
      examId: row.exam_id,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      stemEn: row.stem_en,
      stemHi: row.stem_hi ?? undefined,
      options: row.options as ExaminerSample['options'],
      correctOption: row.correct_option,
      solutionEn: row.solution_en,
      solutionHi: row.solution_hi ?? undefined,
      difficulty: row.difficulty,
      imageAssetIds: row.image_asset_ids,
    }));
  },

  async decide(
    db: Queryable,
    id: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<boolean> {
    const { rows } = await db.query<{
      examiner_id: string;
      account_type: 'individual' | 'institute';
      institute_name: string | null;
      bio: string | null;
      experience_years: number | null;
      exam_ids: string[];
      subject_ids: string[];
      social_links: unknown;
    }>(
      `SELECT examiner_id, account_type, institute_name, bio, experience_years, exam_ids, subject_ids, social_links
         FROM examiner_applications WHERE id = $1 AND status = 'pending'`,
      [id],
    );
    const application = rows[0];
    if (!application) return false;

    const changed = await db.query(
      `UPDATE examiner_applications SET status=$2,rejection_reason=$3,reviewed_by=$4,reviewed_at=now()
       WHERE id=$1 AND status='pending'`,
      [id, status, reason, reviewerId],
    );
    if (changed.rowCount !== 1) return false;

    if (status === 'approved') {
      await db.query(
        `INSERT INTO examiner_profiles
         (user_id, account_type, institute_name, bio, experience_years, social_links, exam_ids, subject_ids,
          onboarding_status, tier, agreement_version, agreement_accepted_at)
         SELECT examiner_id, account_type, institute_name, bio, experience_years, social_links, exam_ids, subject_ids,
                'approved','new',agreement_version,agreement_accepted_at
           FROM examiner_applications WHERE id=$1
         ON CONFLICT (user_id) DO UPDATE SET
           account_type=EXCLUDED.account_type,
           institute_name=EXCLUDED.institute_name,
           bio=EXCLUDED.bio,
           experience_years=EXCLUDED.experience_years,
           social_links=EXCLUDED.social_links,
           exam_ids=EXCLUDED.exam_ids,
           subject_ids=EXCLUDED.subject_ids,
           onboarding_status='approved',
           agreement_version=EXCLUDED.agreement_version,
           agreement_accepted_at=EXCLUDED.agreement_accepted_at`,
        [id],
      );
      await db.query(
        `UPDATE profiles
           SET roles = CASE
             WHEN 'examiner'::user_role_type = ANY(roles) THEN roles
             ELSE array_append(roles, 'examiner'::user_role_type)
           END
         WHERE id=$1`,
        [application.examiner_id],
      );
    }
    return true;
  },

  async validateTaxonomy(
    db: Queryable,
    examId: string,
    subjectId: string,
    topicId: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM subjects s JOIN topics t ON t.subject_id=s.id
         WHERE s.id=$2 AND t.id=$3 AND EXISTS(
           SELECT 1 FROM exam_stages es
           JOIN exam_templates et ON et.stage_id=es.id
           WHERE es.exam_id=$1 AND et.published_at IS NOT NULL
         )
       ) AS valid`,
      [examId, subjectId, topicId],
    );
    return rows[0]!.valid;
  },

  async validateQuestionTaxonomy(
    db: Queryable,
    examinerId: string,
    examId: string,
    subjectId: string,
    topicId: string,
    passageId: string | null,
  ): Promise<boolean> {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM examiner_profiles ep
         JOIN subjects s ON s.id=$3 AND s.exam_id=$2
         JOIN topics t ON t.id=$4 AND t.subject_id=s.id
         WHERE ep.user_id=$1 AND ep.onboarding_status='approved'
           AND $2=ANY(ep.exam_ids) AND $3=ANY(ep.subject_ids)
           AND EXISTS (
             SELECT 1 FROM exam_stages es JOIN exam_templates et ON et.stage_id=es.id
              WHERE es.exam_id=$2 AND et.published_at IS NOT NULL AND et.is_active
           )
           AND ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM question_passages p WHERE p.id=$5 AND p.examiner_id=$1 AND p.exam_id=$2
           ))
       ) AS valid`,
      [examinerId, examId, subjectId, topicId, passageId],
    );
    return rows[0]!.valid;
  },

  async validateImportTarget(
    db: Queryable,
    examinerId: string,
    examId: string,
    stageId: string,
    templateId: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM examiner_profiles ep
         JOIN exams e ON e.id=$2 AND e.is_active
         JOIN exam_stages s ON s.exam_id=e.id AND s.id=$3
         JOIN exam_templates t ON t.stage_id=s.id AND t.exam_id=e.id
         WHERE ep.user_id=$1 AND ep.onboarding_status='approved' AND $2=ANY(ep.exam_ids)
           AND t.id=$4 AND t.is_active AND t.published_at IS NOT NULL
       ) AS valid`,
      [examinerId, examId, stageId, templateId],
    );
    return rows[0]!.valid;
  },

  async listImportSections(
    db: Queryable,
    templateId: string,
  ): Promise<{ name: string; questionCount: number; subjectId: string | null }[]> {
    const { rows } = await db.query<{
      name: string;
      question_count: number;
      subject_id: string | null;
    }>(
      `SELECT name,question_count,subject_id FROM exam_template_sections
        WHERE template_id=$1 ORDER BY section_order`,
      [templateId],
    );
    return rows.map((row) => ({
      name: row.name,
      questionCount: row.question_count,
      subjectId: row.subject_id,
    }));
  },

  /** Subjects and topics the approved examiner may use in the exam (their application subjects). */
  async listImportCodes(
    db: Queryable,
    examinerId: string,
    examId: string,
  ): Promise<{ subjectId: string; subjectName: string; topicId: string; topicName: string }[]> {
    const { rows } = await db.query<{
      subject_id: string;
      subject_name: string;
      topic_id: string;
      topic_name: string;
    }>(
      `SELECT s.id AS subject_id,s.name AS subject_name,t.id AS topic_id,t.name AS topic_name
         FROM examiner_profiles ep
         JOIN subjects s ON s.exam_id=$2 AND s.id=ANY(ep.subject_ids)
         JOIN topics t ON t.subject_id=s.id
        WHERE ep.user_id=$1 AND ep.onboarding_status='approved' AND $2=ANY(ep.exam_ids)
        ORDER BY s.name,t.name`,
      [examinerId, examId],
    );
    return rows.map((row) => ({
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      topicId: row.topic_id,
      topicName: row.topic_name,
    }));
  },

  async getImportByIdempotencyKey(db: Queryable, ownerId: string, idempotencyKey: string) {
    const { rows } = await db.query<{
      id: string;
      exam_id: string;
      stage_id: string;
      template_id: string | null;
      file_hash: string;
      manifest_hash: string;
      idempotency_key: string;
      status: 'previewing' | 'accepted' | 'rejected' | 'committed';
      parsed_count: number;
      error_count: number;
      committed_question_ids: string[];
    }>(
      `SELECT id,exam_id,stage_id,template_id,file_hash,manifest_hash,idempotency_key,status,
              parsed_count,error_count,committed_question_ids
         FROM import_runs WHERE owner_id=$1 AND idempotency_key=$2`,
      [ownerId, idempotencyKey],
    );
    return rows[0];
  },

  /** Latest version of each own question, filtered and paged; `search` is an ILIKE-escaped term. */
  async listQuestions(
    db: Queryable,
    examinerId: string,
    filter: {
      status: 'all' | 'draft' | 'approved';
      examId: string | null;
      subjectId: string | null;
      topicId: string | null;
      difficulty: string | null;
      search: string | null;
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: BankQuestionRow[]; total: number }> {
    const where = `q.examiner_id=$1
          AND NOT EXISTS (
            SELECT 1 FROM questions newer
             WHERE COALESCE(newer.parent_question_id,newer.id)=COALESCE(q.parent_question_id,q.id)
               AND newer.version_number>q.version_number
          )
          AND ($2::text='all' OR q.is_approved_in_corpus=($2::text='approved'))
          AND ($3::uuid IS NULL OR q.exam_id=$3)
          AND ($4::uuid IS NULL OR q.subject_id=$4)
          AND ($5::uuid IS NULL OR q.topic_id=$5)
          AND ($6::text IS NULL OR q.difficulty::text=$6)
          AND ($7::text IS NULL OR q.stem_en ILIKE '%'||$7||'%' OR q.stem_hi ILIKE '%'||$7||'%')`;
    const params = [
      examinerId,
      filter.status,
      filter.examId,
      filter.subjectId,
      filter.topicId,
      filter.difficulty,
      filter.search,
    ];
    const { rows: counted } = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM questions q WHERE ${where}`,
      params,
    );
    const { rows } = await db.query<BankQuestionRow>(
      `SELECT q.id,q.parent_question_id,q.exam_id,q.subject_id,q.topic_id,q.passage_id,q.version_number,q.question_type,q.difficulty,
              q.stem_en,q.stem_hi,q.options,q.correct_option,q.solution_en,q.solution_hi,
              q.is_approved_in_corpus,q.is_pyq,q.pyq_year,q.pyq_shift,q.image_urls,q.updated_at,
              p.content_en AS passage_en,p.content_hi AS passage_hi,p.images AS passage_images
         FROM questions q LEFT JOIN question_passages p ON p.id=q.passage_id
        WHERE ${where}
        ORDER BY q.updated_at DESC, q.id
        LIMIT $8 OFFSET $9`,
      [...params, filter.limit, filter.offset],
    );
    return { rows, total: counted[0]!.total };
  },

  async getQuestion(
    db: Queryable,
    examinerId: string,
    id: string,
  ): Promise<DraftQuestionRow | undefined> {
    const { rows } = await db.query<DraftQuestionRow>(
      `SELECT id,parent_question_id,exam_id,subject_id,topic_id,passage_id,version_number,question_type,difficulty,
              stem_en,stem_hi,options,correct_option,solution_en,solution_hi,
              is_approved_in_corpus,is_pyq,pyq_year,pyq_shift,image_urls,updated_at
         FROM questions WHERE id=$1 AND examiner_id=$2`,
      [id, examinerId],
    );
    return rows[0];
  },

  async createQuestion(
    db: Queryable,
    examinerId: string,
    values: {
      examId: string;
      subjectId: string;
      topicId: string;
      passageId: string | null;
      questionType: DraftQuestionRow['question_type'];
      difficulty: DraftQuestionRow['difficulty'];
      stemEn: string;
      stemHi: string | null;
      options: unknown;
      correctOption: DraftQuestionRow['correct_option'];
      solutionEn: string;
      solutionHi: string | null;
      isPyq: boolean;
      pyqYear: number | null;
      pyqShift: string | null;
      imageAssetIds: string[];
      normStemEn: string;
      normStemHi: string | null;
      textHash: string;
      maskedHash: string;
    },
  ): Promise<DraftQuestionRow> {
    const { rows } = await db.query<DraftQuestionRow>(
      `INSERT INTO questions
       (exam_id,examiner_id,subject_id,topic_id,passage_id,version_number,question_type,difficulty,
        stem_en,stem_hi,options,correct_option,solution_en,solution_hi,is_pyq,pyq_year,pyq_shift,
        image_urls,norm_stem_en,norm_stem_hi,text_hash,masked_hash,is_approved_in_corpus)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,false)
       RETURNING id,exam_id,subject_id,topic_id,passage_id,version_number,question_type,difficulty,
                 stem_en,stem_hi,options,correct_option,solution_en,solution_hi,
                 is_approved_in_corpus,is_pyq,pyq_year,pyq_shift,image_urls,updated_at`,
      [
        values.examId,
        examinerId,
        values.subjectId,
        values.topicId,
        values.passageId,
        values.questionType,
        values.difficulty,
        values.stemEn,
        values.stemHi,
        JSON.stringify(values.options),
        values.correctOption,
        values.solutionEn,
        values.solutionHi,
        values.isPyq,
        values.pyqYear,
        values.pyqShift,
        values.imageAssetIds,
        values.normStemEn,
        values.normStemHi,
        values.textHash,
        values.maskedHash,
      ],
    );
    return rows[0]!;
  },

  async createQuestionVersion(
    db: Queryable,
    examinerId: string,
    originalId: string,
    revision: number,
    values: {
      examId: string;
      subjectId: string;
      topicId: string;
      passageId: string | null;
      questionType: DraftQuestionRow['question_type'];
      difficulty: DraftQuestionRow['difficulty'];
      stemEn: string;
      stemHi: string | null;
      options: unknown;
      correctOption: DraftQuestionRow['correct_option'];
      solutionEn: string;
      solutionHi: string | null;
      isPyq: boolean;
      pyqYear: number | null;
      pyqShift: string | null;
      imageAssetIds: string[];
      normStemEn: string;
      normStemHi: string | null;
      textHash: string;
      maskedHash: string;
    },
  ): Promise<DraftQuestionRow | undefined> {
    const original = await authoringRepository.getQuestion(db, examinerId, originalId);
    if (!original || original.is_approved_in_corpus) return undefined;
    const rootId = original.parent_question_id ?? original.id;
    await db.query('SELECT id FROM questions WHERE id=$1 FOR UPDATE', [rootId]);
    const { rows: versionRows } = await db.query<{ n: number }>(
      `SELECT COALESCE(max(version_number),0)::int AS n FROM questions
       WHERE id=$1 OR parent_question_id=$1`,
      [rootId],
    );
    if (versionRows[0]!.n !== revision || original.version_number !== revision) return undefined;
    const version = revision + 1;
    const { rows } = await db.query<DraftQuestionRow>(
      `INSERT INTO questions
       (exam_id,examiner_id,subject_id,topic_id,passage_id,parent_question_id,version_number,
        question_type,difficulty,stem_en,stem_hi,options,correct_option,solution_en,solution_hi,
        is_pyq,pyq_year,pyq_shift,image_urls,norm_stem_en,norm_stem_hi,text_hash,masked_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id,exam_id,subject_id,topic_id,passage_id,version_number,question_type,difficulty,
                 stem_en,stem_hi,options,correct_option,solution_en,solution_hi,
                 is_approved_in_corpus,is_pyq,pyq_year,pyq_shift,image_urls,updated_at`,
      [
        values.examId,
        examinerId,
        values.subjectId,
        values.topicId,
        values.passageId,
        rootId,
        version,
        values.questionType,
        values.difficulty,
        values.stemEn,
        values.stemHi,
        JSON.stringify(values.options),
        values.correctOption,
        values.solutionEn,
        values.solutionHi,
        values.isPyq,
        values.pyqYear,
        values.pyqShift,
        values.imageAssetIds,
        values.normStemEn,
        values.normStemHi,
        values.textHash,
        values.maskedHash,
      ],
    );
    return rows[0];
  },

  async previewImport(
    db: Queryable,
    ownerId: string,
    values: {
      examId: string;
      stageId: string;
      templateId: string;
      fileHash: string;
      manifestHash: string;
      idempotencyKey: string;
      parsedCount: number;
      errorCount: number;
    },
  ): Promise<{ id: string } | undefined> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO import_runs
       (owner_id,exam_id,stage_id,template_id,file_hash,manifest_hash,idempotency_key,status,parsed_count,error_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (owner_id,idempotency_key) DO NOTHING
       RETURNING id`,
      [
        ownerId,
        values.examId,
        values.stageId,
        values.templateId,
        values.fileHash,
        values.manifestHash,
        values.idempotencyKey,
        values.errorCount ? 'rejected' : 'accepted',
        values.parsedCount,
        values.errorCount,
      ],
    );
    return rows[0];
  },

  async replaceImportRows(
    db: Queryable,
    importId: string,
    rowsToInsert: { row: number; cell: string | null; data: unknown; errors: unknown[] }[],
  ): Promise<void> {
    await db.query('DELETE FROM import_rows WHERE import_id=$1', [importId]);
    for (const row of rowsToInsert) {
      await db.query(
        `INSERT INTO import_rows (import_id,row_number,cell_name,data,errors)
         VALUES ($1,$2,$3,$4,$5)`,
        [importId, row.row, row.cell, JSON.stringify(row.data), JSON.stringify(row.errors)],
      );
    }
  },

  async listImportRows(db: Queryable, importId: string): Promise<{ data: unknown }[]> {
    const { rows } = await db.query<{ data: unknown }>(
      'SELECT data FROM import_rows WHERE import_id=$1 ORDER BY row_number',
      [importId],
    );
    return rows;
  },

  async getImport(db: Queryable, importId: string, ownerId: string) {
    const { rows } = await db.query<{
      id: string;
      owner_id: string;
      exam_id: string;
      stage_id: string;
      template_id: string | null;
      file_hash: string;
      manifest_hash: string;
      idempotency_key: string;
      status: 'previewing' | 'accepted' | 'rejected' | 'committed';
      parsed_count: number;
      error_count: number;
      committed_question_ids: string[];
    }>(
      `SELECT id,owner_id,exam_id,stage_id,template_id,file_hash,manifest_hash,idempotency_key,status,
              parsed_count,error_count,committed_question_ids
         FROM import_runs WHERE id=$1 AND owner_id=$2`,
      [importId, ownerId],
    );
    return rows[0];
  },

  async commitImport(
    db: Queryable,
    importId: string,
    ownerId: string,
    manifestHash: string,
    idempotencyKey: string,
    questions: {
      examId: string;
      subjectId: string;
      topicId: string;
      stemEn: string;
      stemHi: string | null;
      options: unknown;
      correctOption: 'A' | 'B' | 'C' | 'D';
      solutionEn: string;
      solutionHi: string | null;
      difficulty: 'easy' | 'medium' | 'hard';
      isPyq: boolean;
      pyqYear: number | null;
      pyqShift: string | null;
      groupId?: string | null;
      passageEn?: string | null;
      passageHi?: string | null;
      passageImageAssetIds?: string[];
      imageAssetIds?: string[];
      normStemEn: string;
      normStemHi: string | null;
      textHash: string;
      maskedHash: string;
    }[],
  ): Promise<string[]> {
    const { rows } = await db.query<{
      id: string;
      owner_id: string;
      exam_id: string;
      stage_id: string;
      file_hash: string;
      manifest_hash: string;
      idempotency_key: string;
      status: 'previewing' | 'accepted' | 'rejected' | 'committed';
      parsed_count: number;
      error_count: number;
      committed_question_ids: string[];
    }>(
      `SELECT id,owner_id,exam_id,stage_id,file_hash,manifest_hash,idempotency_key,status,
              parsed_count,error_count,committed_question_ids
         FROM import_runs WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
      [importId, ownerId],
    );
    const run = rows[0];
    if (!run) throw new Error('Import run not found');
    if (run.status === 'committed') return run.committed_question_ids;
    if (run.status !== 'accepted') throw new Error('Import is rejected');
    if (run.manifest_hash !== manifestHash || run.idempotency_key !== idempotencyKey)
      throw new Error('Import manifest mismatch');
    const ids: string[] = [];
    const passageIds = new Map<string, string>();
    for (const q of questions) {
      let passageId: string | null = null;
      if (q.groupId) {
        passageId = passageIds.get(q.groupId) ?? null;
        if (!passageId) {
          const passage = await db.query<{ id: string }>(
            `INSERT INTO question_passages (exam_id,examiner_id,content_en,content_hi,images)
             VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
            [
              q.examId,
              ownerId,
              q.passageEn,
              q.passageHi,
              JSON.stringify(q.passageImageAssetIds ?? []),
            ],
          );
          passageId = passage.rows[0]!.id;
          passageIds.set(q.groupId, passageId);
        }
      }
      const inserted = await authoringRepository.createQuestion(db, ownerId, {
        examId: q.examId,
        subjectId: q.subjectId,
        topicId: q.topicId,
        passageId,
        questionType: q.groupId ? 'comprehension_mcq' : 'single_mcq',
        difficulty: q.difficulty,
        stemEn: q.stemEn,
        stemHi: q.stemHi,
        options: q.options,
        correctOption: q.correctOption,
        solutionEn: q.solutionEn,
        solutionHi: q.solutionHi,
        isPyq: q.isPyq,
        pyqYear: q.pyqYear,
        pyqShift: q.pyqShift,
        imageAssetIds: q.imageAssetIds ?? [],
        normStemEn: q.normStemEn,
        normStemHi: q.normStemHi,
        textHash: q.textHash,
        maskedHash: q.maskedHash,
      });
      ids.push(inserted.id);
    }
    await db.query(
      `UPDATE import_runs SET status='committed',committed_question_ids=$3 WHERE id=$1 AND owner_id=$2`,
      [importId, ownerId, ids],
    );
    return ids;
  },
};
