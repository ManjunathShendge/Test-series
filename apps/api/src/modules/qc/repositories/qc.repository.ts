import type { Queryable } from '@exam-prep/db';

/** Updated-at comparison that tolerates JavaScript's millisecond precision. */
const SAME_VERSION = (column: string, param: string) =>
  `abs(extract(epoch FROM ${column} - ${param}::timestamptz)) < 0.001`;

/** A question's version family (all versions share the root id). */
const FAMILY = (alias: string) => `COALESCE(${alias}.parent_question_id,${alias}.id)`;

/** Names this transaction's audit rows (audit_privileged_change reads app.audit_action). */
export async function auditAction(db: Queryable, action: string): Promise<void> {
  await db.query("SELECT set_config('app.audit_action', $1, true)", [action]);
}

// Pre-submit policy and pattern fit (PRD 4.2 steps 4-5, 5.1) --------------------------------

export interface PolicyRow {
  question_id: string;
  section_name: string;
  position: number;
  is_pyq: boolean;
  pyq_year: number | null;
  match_kind: string | null;
  match_same_examiner: boolean | null;
  image_reused: boolean;
  live_paid_test: string | null;
}

export interface PatternFitDbRow {
  section_name: string;
  topic_name: string;
  target: number | null;
  actual: number;
}

export interface QualityRow {
  reviewed: number;
  passed: number;
  duplicate_rejects: number;
  key_corrections: number;
  avg_response_hours: number | null;
  open_reports: number;
  live_tests: number;
}

/** Quality inputs for one examiner (PRD 4.4 "Tier and quality inputs"), computed from records. */
const QUALITY_SELECT = (examiner: string) => `
  SELECT
    (SELECT count(*)::int FROM qc_question_reviews r
       JOIN qc_reviews rv ON rv.id=r.qc_review_id AND rv.completed_at IS NOT NULL AND NOT rv.is_second_spot_check
       JOIN questions q ON q.id=r.question_id
      WHERE q.examiner_id=${examiner} AND NOT r.carried_over AND r.reviewer_action<>'pending') AS reviewed,
    (SELECT count(*)::int FROM qc_question_reviews r
       JOIN qc_reviews rv ON rv.id=r.qc_review_id AND rv.completed_at IS NOT NULL AND NOT rv.is_second_spot_check
       JOIN questions q ON q.id=r.question_id
      WHERE q.examiner_id=${examiner} AND NOT r.carried_over AND r.reviewer_action IN ('approve','minor_edit')) AS passed,
    (SELECT count(*)::int FROM qc_question_reviews r
       JOIN qc_reviews rv ON rv.id=r.qc_review_id AND rv.completed_at IS NOT NULL
       JOIN questions q ON q.id=r.question_id
      WHERE q.examiner_id=${examiner} AND r.reviewer_action='reject' AND r.reason_code='duplicate') AS duplicate_rejects,
    (SELECT count(DISTINCT k.old_question_id)::int FROM question_key_corrections k JOIN questions q ON q.id=k.old_question_id
      WHERE q.examiner_id=${examiner}) AS key_corrections,
    (SELECT (avg(extract(epoch FROM qr.examiner_responded_at-qr.created_at))/3600)::float8
       FROM question_reports qr JOIN questions q ON q.id=qr.question_id
      WHERE q.examiner_id=${examiner} AND qr.examiner_responded_at IS NOT NULL) AS avg_response_hours,
    (SELECT count(*)::int FROM question_reports qr JOIN questions q ON q.id=qr.question_id
      WHERE q.examiner_id=${examiner} AND qr.status='open') AS open_reports,
    (SELECT count(*)::int FROM tests t WHERE t.examiner_id=${examiner} AND t.status='live') AS live_tests`;

// Review queue and detail ---------------------------------------------------------------------

export interface QueueRow {
  review_id: string;
  test_id: string;
  test_title: string;
  exam_name: string;
  examiner_id: string;
  examiner_name: string;
  examiner_tier: 'new' | 'verified' | 'top';
  is_second: boolean;
  flag_count: number;
  question_count: number;
  decided_count: number;
  reviewer_id: string | null;
  reviewer_name: string | null;
  sla_deadline_at: Date;
  created_at: Date;
  status: string;
  overall_comments: string | null;
  completed_at: Date | null;
  has_hindi: boolean;
  test_type: string;
  pyq_percentage: number;
}

const QUEUE_SELECT = `
  SELECT rv.id AS review_id,t.id AS test_id,t.title AS test_title,e.name AS exam_name,
         t.examiner_id,ex.full_name AS examiner_name,ep.tier::text AS examiner_tier,
         rv.is_second_spot_check AS is_second,rv.flag_count,
         (SELECT count(*)::int FROM qc_question_reviews r WHERE r.qc_review_id=rv.id) AS question_count,
         (SELECT count(*)::int FROM qc_question_reviews r WHERE r.qc_review_id=rv.id AND r.reviewer_action<>'pending') AS decided_count,
         rv.reviewer_id,rp.full_name AS reviewer_name,rv.sla_deadline_at,rv.created_at,
         rv.status::text AS status,rv.overall_comments,rv.completed_at,t.has_hindi,t.test_type,
         t.pyq_percentage::float8 AS pyq_percentage
    FROM qc_reviews rv
    JOIN tests t ON t.id=rv.test_id
    JOIN exams e ON e.id=t.exam_id
    JOIN profiles ex ON ex.id=t.examiner_id
    JOIN examiner_profiles ep ON ep.user_id=t.examiner_id
    LEFT JOIN profiles rp ON rp.id=rv.reviewer_id`;

/** Fast lane (Top tier) first, then flag count, then SLA deadline (PRD 5.3.1, 5.5). */
const QUEUE_ORDER = `ORDER BY (ep.tier='top') DESC, rv.flag_count DESC, rv.sla_deadline_at ASC`;

export interface AiSuggestionJson {
  status: 'ok' | 'unavailable';
  checks: ('answer' | 'ambiguity' | 'language')[];
  selected_option: string | null;
  matches_key: boolean | null;
  ambiguity_note: string | null;
  language_note: string | null;
  unavailable_reason: string | null;
  model: string;
  created_at: string;
}

export interface ReviewQuestionRow {
  ai_suggestion: AiSuggestionJson | null;
  item_id: string;
  section_name: string | null;
  display_order: number | null;
  question_id: string;
  version_number: number;
  subject_name: string;
  topic_name: string;
  difficulty: string;
  stem_en: string;
  stem_hi: string | null;
  options: { id: string; textEn: string; textHi?: string }[];
  correct_option: string;
  solution_en: string;
  solution_hi: string | null;
  is_pyq: boolean;
  pyq_year: number | null;
  image_urls: string[];
  has_completeness_error: boolean;
  match_kind: string | null;
  similarity_score: number | null;
  matched_question_id: string | null;
  matched_stem_en: string | null;
  matched_examiner_id: string | null;
  matched_examiner_name: string | null;
  matched_is_pyq: boolean | null;
  question_examiner_id: string | null;
  edited_from_version: number | null;
  carried_over: boolean;
  reviewer_action: string;
  reason_code: string | null;
  reviewer_comment: string | null;
  checklist_key_matches_solution: boolean | null;
  checklist_single_defensible_option: boolean | null;
  checklist_bilingual_match: boolean | null;
  checklist_in_syllabus: boolean | null;
  checklist_no_watermarks: boolean | null;
}

export interface QuestionCopyRow {
  id: string;
  parent_question_id: string | null;
  exam_id: string;
  subject_id: string;
  topic_id: string;
  examiner_id: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  stem_en: string;
  stem_hi: string | null;
  options: { id: 'A' | 'B' | 'C' | 'D'; textEn: string; textHi?: string }[];
  correct_option: 'A' | 'B' | 'C' | 'D';
  solution_en: string;
  solution_hi: string | null;
  is_pyq: boolean;
  pyq_year: number | null;
  is_approved_in_corpus: boolean;
}

const QUESTION_COPY_COLUMNS = `q.id,q.parent_question_id,q.exam_id,q.subject_id,q.topic_id,q.examiner_id,
  q.difficulty::text AS difficulty,q.stem_en,q.stem_hi,q.options,q.correct_option,q.solution_en,q.solution_hi,
  q.is_pyq,q.pyq_year,q.is_approved_in_corpus`;

// Reports ---------------------------------------------------------------------------------------

export interface ReportRow {
  id: string;
  question_id: string;
  stem_en: string;
  test_title: string;
  examiner_name: string | null;
  reason: string;
  student_comment: string | null;
  status: string;
  examiner_response: string | null;
  examiner_responded_at: Date | null;
  examiner_sla_deadline_at: Date;
  resolution_notes: string | null;
  open_report_count: number;
  is_auto_hidden: boolean;
  created_at: Date;
  options: { id: string; textEn: string }[];
  correct_option: string;
  solution_en: string;
  solution_hi: string | null;
  corrected_to: string | null;
}

const REPORT_SELECT = `
  SELECT qr.id,qr.question_id,q.stem_en,t.title AS test_title,ex.full_name AS examiner_name,qr.reason::text AS reason,
         qr.student_comment,qr.status::text AS status,qr.examiner_response,qr.examiner_responded_at,
         qr.examiner_sla_deadline_at,qr.resolution_notes,q.open_report_count,q.is_auto_hidden,qr.created_at,
         q.options,q.correct_option,q.solution_en,q.solution_hi,
         (SELECT c.new_correct_option FROM question_key_corrections c WHERE c.old_question_id=q.id
           ORDER BY c.created_at DESC LIMIT 1) AS corrected_to
    FROM question_reports qr
    JOIN questions q ON q.id=qr.question_id
    JOIN tests t ON t.id=qr.test_id
    LEFT JOIN profiles ex ON ex.id=q.examiner_id`;

// Admin --------------------------------------------------------------------------------------------

export interface AdminExaminerRow extends QualityRow {
  id: string;
  name: string;
  email: string | null;
  account_type: 'individual' | 'institute';
  institute_name: string | null;
  status: string;
  tier: 'new' | 'verified' | 'top';
  kyc_verified_at: Date | null;
  exam_names: string[];
  updated_at: Date;
}

export interface ReviewerRow {
  id: string;
  name: string;
  email: string | null;
  is_blocked: boolean;
  open_reviews: number;
  exams: { mappingId: string; examId: string; examName: string }[];
}

export interface SettingsRow {
  exam_id: string;
  exam_name: string;
  trigram_high: number;
  trigram_mid: number;
  pyq_max: number;
  updated_at: Date;
}

export interface ApprovedRow {
  test_id: string;
  title: string;
  exam_name: string;
  examiner_name: string;
  published_at: Date | null;
  spot_check: 'none' | 'open' | 'passed' | 'failed';
}

export const qcRepository = {
  // Pre-submit -------------------------------------------------------------------------------

  /**
   * One row per placed question with its strongest corpus match outside its own version family,
   * whether an image file is reused, and a live paid test of the same examiner already using it.
   */
  async policyRows(db: Queryable, testId: string): Promise<PolicyRow[]> {
    const { rows } = await db.query<PolicyRow>(
      `SELECT q.id AS question_id,ts.name AS section_name,
              tq.display_order-(SELECT COALESCE(sum(p.question_count),0)::int FROM test_sections p
                                 WHERE p.test_id=ts.test_id AND p.section_order<ts.section_order) AS position,
              q.is_pyq,q.pyq_year,m.match_kind::text AS match_kind,m.is_same_examiner AS match_same_examiner,
              EXISTS (SELECT 1 FROM questions o
                       WHERE o.exam_id=q.exam_id AND o.is_approved_in_corpus AND cardinality(q.image_file_hashes)>0
                         AND o.image_file_hashes && q.image_file_hashes AND o.examiner_id IS DISTINCT FROM q.examiner_id
                         AND ${FAMILY('o')}<>${FAMILY('q')}) AS image_reused,
              (SELECT t2.title FROM test_questions tq2
                 JOIN tests t2 ON t2.id=tq2.test_id
                 JOIN questions q2 ON q2.id=tq2.question_id
                WHERE t2.id<>tq.test_id AND t2.examiner_id=q.examiner_id
                  AND t2.status IN ('approved','scheduled','live') AND t2.access_type<>'free'
                  AND (${FAMILY('q2')}=${FAMILY('q')} OR q2.text_hash=q.text_hash)
                LIMIT 1) AS live_paid_test
         FROM test_questions tq
         JOIN test_sections ts ON ts.id=tq.section_id
         JOIN questions q ON q.id=tq.question_id
         LEFT JOIN LATERAL (
           SELECT d.match_kind,d.is_same_examiner
             FROM run_question_duplicate_check(q.exam_id,q.examiner_id,q.text_hash,q.masked_hash,q.norm_stem_en,q.id) d
             JOIN questions mq ON mq.id=d.matched_question_id
            WHERE ${FAMILY('mq')}<>${FAMILY('q')}
            ORDER BY (d.match_kind IN ('exact_hash','pyq_match')) DESC,d.similarity_score DESC
            LIMIT 1) m ON TRUE
        WHERE tq.test_id=$1
        ORDER BY tq.display_order`,
      [testId],
    );
    return rows;
  },

  /** Topic counts per section next to the template targets (PRD 5.2 check 8). */
  async patternFit(db: Queryable, testId: string): Promise<PatternFitDbRow[]> {
    const { rows } = await db.query<PatternFitDbRow>(
      `WITH targets AS (
         SELECT ts.id AS sid,kv.key::uuid AS topic_id,kv.value::int AS target
           FROM test_sections ts
           JOIN exam_template_sections ets ON ets.id=ts.template_section_id
           CROSS JOIN LATERAL jsonb_each_text(COALESCE(ets.target_topic_counts,'{}'::jsonb)) AS kv(key,value)
          WHERE ts.test_id=$1),
       actual AS (
         SELECT tq.section_id AS sid,q.topic_id,count(*)::int AS n
           FROM test_questions tq JOIN questions q ON q.id=tq.question_id
          WHERE tq.test_id=$1 GROUP BY tq.section_id,q.topic_id),
       keys AS (SELECT sid,topic_id FROM targets UNION SELECT sid,topic_id FROM actual)
       SELECT ts.name AS section_name,tp.name AS topic_name,tg.target,COALESCE(a.n,0) AS actual
         FROM keys k
         JOIN test_sections ts ON ts.id=k.sid
         JOIN topics tp ON tp.id=k.topic_id
         LEFT JOIN targets tg ON tg.sid=k.sid AND tg.topic_id=k.topic_id
         LEFT JOIN actual a ON a.sid=k.sid AND a.topic_id=k.topic_id
        ORDER BY ts.section_order,tp.name`,
      [testId],
    );
    return rows;
  },

  async startQc(db: Queryable, testId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>('SELECT public.start_test_qc($1) AS id', [testId]);
    return rows[0]!.id;
  },

  // Examiner quality and price band ------------------------------------------------------------

  async quality(db: Queryable, examinerId: string): Promise<QualityRow> {
    const { rows } = await db.query<QualityRow>(QUALITY_SELECT('$1'), [examinerId]);
    return rows[0]!;
  },

  async examinerStanding(
    db: Queryable,
    examinerId: string,
  ): Promise<{ tier: 'new' | 'verified' | 'top'; kyc_verified_at: Date | null } | undefined> {
    const { rows } = await db.query<{ tier: 'new' | 'verified' | 'top'; kyc_verified_at: Date | null }>(
      'SELECT tier::text AS tier,kyc_verified_at FROM examiner_profiles WHERE user_id=$1',
      [examinerId],
    );
    return rows[0];
  },

  /** Price band per assigned exam at the examiner's tier (PRD 5.5 "tier decides the price band ceiling"). */
  async priceBands(
    db: Queryable,
    examinerId: string,
    examId?: string,
  ): Promise<{ exam_id: string; exam_name: string; min_paise: number; max_paise: number }[]> {
    const { rows } = await db.query<{ exam_id: string; exam_name: string; min_paise: number; max_paise: number }>(
      `SELECT e.id AS exam_id,e.name AS exam_name,e.price_band_min_paise AS min_paise,
              CASE ep.tier WHEN 'top' THEN e.price_band_max_top_paise
                           WHEN 'verified' THEN e.price_band_max_verified_paise
                           ELSE e.price_band_max_new_paise END AS max_paise
         FROM examiner_profiles ep
         JOIN exams e ON e.id=ANY(ep.exam_ids)
        WHERE ep.user_id=$1 AND ($2::uuid IS NULL OR e.id=$2)
        ORDER BY e.name`,
      [examinerId, examId ?? null],
    );
    return rows;
  },

  // Reviewer queue and review ------------------------------------------------------------------

  /** Open reviews; a reviewer sees their own assignments, an admin sees all. */
  async openQueue(db: Queryable, reviewerId: string | null): Promise<QueueRow[]> {
    const { rows } = await db.query<QueueRow>(
      `${QUEUE_SELECT} WHERE rv.completed_at IS NULL AND ($1::uuid IS NULL OR rv.reviewer_id=$1) ${QUEUE_ORDER} LIMIT 500`,
      [reviewerId],
    );
    return rows;
  },

  async review(db: Queryable, reviewId: string, lock = false): Promise<QueueRow | undefined> {
    const { rows } = await db.query<QueueRow>(
      `${QUEUE_SELECT} WHERE rv.id=$1${lock ? ' FOR UPDATE OF rv' : ''}`,
      [reviewId],
    );
    return rows[0];
  },

  /** The latest finished primary review of a test (used for second reviews and examiner feedback). */
  async latestFinishedPrimary(db: Queryable, testId: string): Promise<string | undefined> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM qc_reviews WHERE test_id=$1 AND NOT is_second_spot_check AND completed_at IS NOT NULL
        ORDER BY completed_at DESC LIMIT 1`,
      [testId],
    );
    return rows[0]?.id;
  },

  async reviewQuestions(db: Queryable, reviewId: string): Promise<ReviewQuestionRow[]> {
    const { rows } = await db.query<ReviewQuestionRow>(
      `SELECT r.id AS item_id,ts.name AS section_name,
              r.display_order-(SELECT COALESCE(sum(p.question_count),0)::int FROM test_sections p
                                WHERE p.test_id=rv.test_id AND p.section_order<ts.section_order) AS display_order,
              q.id AS question_id,q.version_number,sub.name AS subject_name,tp.name AS topic_name,
              q.difficulty::text AS difficulty,q.stem_en,q.stem_hi,q.options,q.correct_option,q.solution_en,
              q.solution_hi,q.is_pyq,q.pyq_year,q.image_urls,r.has_completeness_error,
              r.duplicate_match_kind::text AS match_kind,r.similarity_score::float8 AS similarity_score,
              r.matched_question_id,mq.stem_en AS matched_stem_en,mq.examiner_id AS matched_examiner_id,
              mp.full_name AS matched_examiner_name,mq.is_pyq AS matched_is_pyq,q.examiner_id AS question_examiner_id,
              oq.version_number AS edited_from_version,
              r.carried_over,r.reviewer_action::text AS reviewer_action,r.reason_code,r.reviewer_comment,
              r.checklist_key_matches_solution,r.checklist_single_defensible_option,r.checklist_bilingual_match,
              r.checklist_in_syllabus,r.checklist_no_watermarks,
              CASE WHEN ai.status IS NULL THEN NULL ELSE to_jsonb(ai) END AS ai_suggestion
         FROM qc_question_reviews r
         JOIN qc_reviews rv ON rv.id=r.qc_review_id
         JOIN questions q ON q.id=r.question_id
         JOIN subjects sub ON sub.id=q.subject_id
         JOIN topics tp ON tp.id=q.topic_id
         LEFT JOIN test_sections ts ON ts.test_id=rv.test_id AND r.display_order IS NOT NULL
              AND r.display_order > (SELECT COALESCE(sum(p.question_count),0) FROM test_sections p
                                      WHERE p.test_id=rv.test_id AND p.section_order<ts.section_order)
              AND r.display_order <= (SELECT COALESCE(sum(p.question_count),0) FROM test_sections p
                                       WHERE p.test_id=rv.test_id AND p.section_order<=ts.section_order)
         LEFT JOIN questions mq ON mq.id=r.matched_question_id
         LEFT JOIN profiles mp ON mp.id=mq.examiner_id
         LEFT JOIN questions oq ON oq.id=r.original_question_id
         LEFT JOIN LATERAL (
           SELECT s.status,s.checks,s.selected_option,s.matches_key,s.ambiguity_note,s.language_note,
                  s.unavailable_reason,s.model,s.created_at
             FROM ai_suggestions s WHERE s.question_id=q.id AND s.question_version=q.version_number
            ORDER BY s.created_at DESC LIMIT 1) ai ON true
        WHERE r.qc_review_id=$1
        ORDER BY r.display_order NULLS LAST`,
      [reviewId],
    );
    return rows;
  },

  async decide(
    db: Queryable,
    reviewId: string,
    itemId: string,
    decision: {
      action: string;
      reasonCode: string | null;
      comment: string | null;
      checklist: [boolean, boolean, boolean, boolean, boolean];
    },
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE qc_question_reviews
          SET reviewer_action=$3::qc_action_type,reason_code=$4,reviewer_comment=$5,reviewed_at=now(),
              checklist_key_matches_solution=$6,checklist_single_defensible_option=$7,checklist_bilingual_match=$8,
              checklist_in_syllabus=$9,checklist_no_watermarks=$10
        WHERE id=$2 AND qc_review_id=$1 AND NOT carried_over`,
      [reviewId, itemId, decision.action, decision.reasonCode, decision.comment, ...decision.checklist],
    );
    return rowCount === 1;
  },

  /** One review item with the question it judges, for a reviewer edit. */
  async reviewItem(
    db: Queryable,
    reviewId: string,
    itemId: string,
  ): Promise<QuestionCopyRow & { test_question_id: string | null; carried_over: boolean } | undefined> {
    const { rows } = await db.query<QuestionCopyRow & { test_question_id: string | null; carried_over: boolean }>(
      `SELECT r.test_question_id,r.carried_over,${QUESTION_COPY_COLUMNS}
         FROM qc_question_reviews r JOIN questions q ON q.id=r.question_id
        WHERE r.id=$2 AND r.qc_review_id=$1`,
      [reviewId, itemId],
    );
    return rows[0];
  },

  async question(db: Queryable, questionId: string): Promise<QuestionCopyRow | undefined> {
    const { rows } = await db.query<QuestionCopyRow>(
      `SELECT ${QUESTION_COPY_COLUMNS} FROM questions q WHERE q.id=$1`,
      [questionId],
    );
    return rows[0];
  },

  /**
   * Inserts the next version of a question family. The family root row is locked so two edits
   * cannot take the same version number.
   */
  async insertVersion(
    db: Queryable,
    original: QuestionCopyRow,
    content: {
      stemEn: string;
      stemHi: string | null;
      options: { id: string; textEn: string; textHi?: string }[];
      correctOption: string;
      solutionEn: string;
      solutionHi: string | null;
      normStemEn: string;
      normStemHi: string | null;
      textHash: string;
      maskedHash: string;
    },
    approved: boolean,
  ): Promise<{ id: string; version_number: number }> {
    const root = original.parent_question_id ?? original.id;
    await db.query('SELECT id FROM questions WHERE id=$1 FOR UPDATE', [root]);
    const { rows } = await db.query<{ id: string; version_number: number }>(
      `INSERT INTO questions (exam_id,examiner_id,subject_id,topic_id,passage_id,parent_question_id,version_number,
                              question_type,difficulty,stem_en,stem_hi,options,correct_option,solution_en,solution_hi,
                              norm_stem_en,norm_stem_hi,text_hash,masked_hash,image_file_hashes,image_urls,is_pyq,
                              pyq_year,pyq_shift,is_approved_in_corpus)
       SELECT q.exam_id,q.examiner_id,q.subject_id,q.topic_id,q.passage_id,$2,
              (SELECT max(v.version_number)+1 FROM questions v WHERE v.id=$2 OR v.parent_question_id=$2),
              q.question_type,q.difficulty,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,q.image_file_hashes,q.image_urls,
              q.is_pyq,q.pyq_year,q.pyq_shift,$13
         FROM questions q WHERE q.id=$1
       RETURNING id,version_number`,
      [
        original.id,
        root,
        content.stemEn,
        content.stemHi,
        JSON.stringify(content.options),
        content.correctOption,
        content.solutionEn,
        content.solutionHi,
        content.normStemEn,
        content.normStemHi,
        content.textHash,
        content.maskedHash,
        approved,
      ],
    );
    return rows[0]!;
  },

  /** Exact copy of another examiner's approved question in the same exam (the edit must not create one). */
  async copiesAnotherExaminer(db: Queryable, examId: string, examinerId: string | null, textHash: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM questions WHERE exam_id=$1 AND text_hash=$3 AND is_approved_in_corpus
          AND examiner_id IS DISTINCT FROM $2 LIMIT 1`,
      [examId, examinerId, textHash],
    );
    return rowCount === 1;
  },

  async applyMinorEdit(
    db: Queryable,
    reviewId: string,
    itemId: string,
    testQuestionId: string,
    oldQuestionId: string,
    newQuestionId: string,
    comment: string,
    checklist: [boolean, boolean, boolean, boolean, boolean],
  ): Promise<void> {
    await db.query('UPDATE test_questions SET question_id=$2 WHERE id=$1', [testQuestionId, newQuestionId]);
    await db.query(
      `UPDATE qc_question_reviews
          SET original_question_id=COALESCE(original_question_id,$3),question_id=$4,reviewer_action='minor_edit',
              reason_code=NULL,reviewer_comment=$5,reviewed_at=now(),
              checklist_key_matches_solution=$6,checklist_single_defensible_option=$7,checklist_bilingual_match=$8,
              checklist_in_syllabus=$9,checklist_no_watermarks=$10
        WHERE id=$2 AND qc_review_id=$1 AND NOT carried_over`,
      [reviewId, itemId, oldQuestionId, newQuestionId, comment, ...checklist],
    );
  },

  async reportQuestionId(db: Queryable, reportId: string): Promise<string | undefined> {
    const { rows } = await db.query<{ question_id: string }>('SELECT question_id FROM question_reports WHERE id=$1', [
      reportId,
    ]);
    return rows[0]?.question_id;
  },

  /** Published tests (any state after approval) that contain this exact question version. */
  async testsWithQuestion(db: Queryable, questionId: string): Promise<string[]> {
    const { rows } = await db.query<{ test_id: string }>(
      `SELECT DISTINCT tq.test_id FROM test_questions tq JOIN tests t ON t.id=tq.test_id
        WHERE tq.question_id=$1 AND t.status IN ('approved','scheduled','live','archived')`,
      [questionId],
    );
    return rows.map((row) => row.test_id);
  },

  async recordCorrection(
    db: Queryable,
    input: {
      testId: string;
      oldQuestionId: string;
      newQuestionId: string;
      oldOption: string;
      newOption: string;
      reportId: string;
      correctedBy: string;
      reason: string;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO question_key_corrections (test_id,old_question_id,new_question_id,old_correct_option,
                                             new_correct_option,report_id,corrected_by,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        input.testId,
        input.oldQuestionId,
        input.newQuestionId,
        input.oldOption,
        input.newOption,
        input.reportId,
        input.correctedBy,
        input.reason,
      ],
    );
    const id = rows[0]!.id;
    await db.query('SELECT public.rescore_test_attempts_on_key_change($1)', [id]);
    return id;
  },

  /** Closes every unresolved report on the corrected question and shows it to new attempts again. */
  async resolveAsKeyChanged(db: Queryable, reviewerId: string, questionId: string, notes: string): Promise<void> {
    await db.query(
      `UPDATE question_reports SET status='resolved_key_changed',resolution_notes=$3,resolved_by_reviewer_id=$1,resolved_at=now()
        WHERE question_id=$2 AND status IN ('open','examiner_responded')`,
      [reviewerId, questionId, notes],
    );
    await db.query('UPDATE questions SET open_report_count=0,is_auto_hidden=FALSE WHERE id=$1', [questionId]);
  },

  async finish(db: Queryable, reviewId: string, comments: string): Promise<string> {
    const { rows } = await db.query<{ status: string }>('SELECT public.finish_test_qc($1,$2)::text AS status', [
      reviewId,
      comments,
    ]);
    return rows[0]!.status;
  },

  async finishSpotCheck(db: Queryable, reviewId: string, passed: boolean, comments: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE qc_reviews SET status=$2::test_status_type,overall_comments=NULLIF($3,''),completed_at=now()
        WHERE id=$1 AND is_second_spot_check AND completed_at IS NULL`,
      [reviewId, passed ? 'approved' : 'changes_requested', comments],
    );
    return rowCount === 1;
  },

  /** True when `assetId` is an image of a question in this review or of a match it shows. */
  async reviewHasImage(db: Queryable, reviewId: string, assetId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM qc_question_reviews r
         JOIN questions q ON q.id=r.question_id
         LEFT JOIN questions mq ON mq.id=r.matched_question_id
        WHERE r.qc_review_id=$1 AND ($2=ANY(q.image_urls) OR $2=ANY(COALESCE(mq.image_urls,'{}')))
        LIMIT 1`,
      [reviewId, assetId],
    );
    return rowCount === 1;
  },

  async cleanImage(
    db: Queryable,
    assetId: string,
  ): Promise<{ bucket: string; object_key: string; mime_type: 'image/jpeg' | 'image/png' | 'image/webp' } | undefined> {
    const { rows } = await db.query<{
      bucket: string;
      object_key: string;
      mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
    }>(
      `SELECT bucket,object_key,mime_type FROM assets
        WHERE id=$1 AND classification='question_asset' AND scan_status='clean'
          AND mime_type IN ('image/jpeg','image/png','image/webp')`,
      [assetId],
    );
    return rows[0];
  },

  // Examiner feedback on their own test ---------------------------------------------------------

  async feedbackByPosition(
    db: Queryable,
    testId: string,
  ): Promise<{ display_order: number; question_id: string; action: string; reason_code: string | null; comment: string | null }[]> {
    const { rows } = await db.query<{
      display_order: number;
      question_id: string;
      action: string;
      reason_code: string | null;
      comment: string | null;
    }>(
      `SELECT r.display_order,r.question_id,r.reviewer_action::text AS action,r.reason_code,r.reviewer_comment AS comment
         FROM qc_question_reviews r
        WHERE r.display_order IS NOT NULL AND r.qc_review_id=(
          SELECT id FROM qc_reviews WHERE test_id=$1 AND NOT is_second_spot_check AND completed_at IS NOT NULL
           ORDER BY completed_at DESC LIMIT 1)`,
      [testId],
    );
    return rows;
  },

  async reviewSummary(
    db: Queryable,
    testId: string,
  ): Promise<{
    last: { status: string; comments: string | null; completed_at: Date } | undefined;
    open_deadline: Date | null;
  }> {
    const { rows } = await db.query<{ status: string; comments: string | null; completed_at: Date | null; sla_deadline_at: Date }>(
      `SELECT status::text AS status,overall_comments AS comments,completed_at,sla_deadline_at
         FROM qc_reviews WHERE test_id=$1 AND NOT is_second_spot_check
        ORDER BY created_at DESC LIMIT 2`,
      [testId],
    );
    const open = rows.find((row) => row.completed_at === null);
    const last = rows.find((row) => row.completed_at !== null);
    return {
      last: last ? { status: last.status, comments: last.comments, completed_at: last.completed_at! } : undefined,
      open_deadline: open?.sla_deadline_at ?? null,
    };
  },

  // Reports ----------------------------------------------------------------------------------------

  async examinerReports(db: Queryable, examinerId: string): Promise<ReportRow[]> {
    const { rows } = await db.query<ReportRow>(
      `${REPORT_SELECT} WHERE q.examiner_id=$1 ORDER BY (qr.status='open') DESC,qr.created_at DESC LIMIT 500`,
      [examinerId],
    );
    return rows;
  },

  async respond(db: Queryable, examinerId: string, reportId: string, response: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE question_reports qr SET examiner_response=$3,examiner_responded_at=now(),status='examiner_responded'
         FROM questions q
        WHERE qr.id=$2 AND q.id=qr.question_id AND q.examiner_id=$1 AND qr.status IN ('open','examiner_responded')`,
      [examinerId, reportId, response],
    );
    return rowCount === 1;
  },

  async staffReports(db: Queryable): Promise<ReportRow[]> {
    const { rows } = await db.query<ReportRow>(
      `${REPORT_SELECT} WHERE qr.status IN ('open','examiner_responded')
        ORDER BY q.is_auto_hidden DESC,q.open_report_count DESC,qr.created_at ASC LIMIT 500`,
    );
    return rows;
  },

  /** Resolves every unresolved report on the report's question; optionally lifts the auto-hide. */
  async resolve(
    db: Queryable,
    reviewerId: string,
    reportId: string,
    resolution: string,
    notes: string,
    unhide: boolean,
  ): Promise<boolean> {
    const { rows } = await db.query<{ question_id: string }>(
      `UPDATE question_reports SET status=$3::report_status_type,resolution_notes=$4,resolved_by_reviewer_id=$1,resolved_at=now()
        WHERE question_id=(SELECT question_id FROM question_reports WHERE id=$2)
          AND status IN ('open','examiner_responded')
        RETURNING question_id`,
      [reviewerId, reportId, resolution, notes],
    );
    if (!rows.length) return false;
    await db.query(
      `UPDATE questions SET open_report_count=0,is_auto_hidden=CASE WHEN $2 THEN FALSE ELSE is_auto_hidden END
        WHERE id=$1`,
      [rows[0]!.question_id, unhide],
    );
    return true;
  },

  // Admin ------------------------------------------------------------------------------------------

  async adminExaminers(db: Queryable, examinerId?: string): Promise<AdminExaminerRow[]> {
    const { rows } = await db.query<AdminExaminerRow>(
      `SELECT ep.user_id AS id,p.full_name AS name,p.email,ep.account_type::text AS account_type,ep.institute_name,
              ep.onboarding_status::text AS status,ep.tier::text AS tier,ep.kyc_verified_at,
              COALESCE((SELECT array_agg(e.name ORDER BY e.name) FROM exams e WHERE e.id=ANY(ep.exam_ids)),'{}') AS exam_names,
              ep.updated_at,qual.*
         FROM examiner_profiles ep
         JOIN profiles p ON p.id=ep.user_id
         CROSS JOIN LATERAL (${QUALITY_SELECT('ep.user_id')}) qual
        WHERE ep.onboarding_status IN ('approved','suspended','banned') AND ($1::uuid IS NULL OR ep.user_id=$1)
        ORDER BY p.full_name
        LIMIT 1000`,
      [examinerId ?? null],
    );
    return rows;
  },

  async updateExaminer(
    db: Queryable,
    examinerId: string,
    adminId: string,
    change: { tier?: string | undefined; status?: string | undefined; kycVerified?: boolean | undefined },
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE examiner_profiles
          SET tier=COALESCE($2::examiner_tier_type,tier),
              onboarding_status=COALESCE($3::verification_status_type,onboarding_status),
              kyc_verified_at=CASE WHEN $4 AND kyc_verified_at IS NULL THEN now() ELSE kyc_verified_at END,
              kyc_verified_by=CASE WHEN $4 AND kyc_verified_at IS NULL THEN $5::uuid ELSE kyc_verified_by END
        WHERE user_id=$1 AND onboarding_status IN ('approved','suspended','banned')`,
      [examinerId, change.tier ?? null, change.status ?? null, change.kycVerified === true, adminId],
    );
    return rowCount === 1;
  },

  async writeAudit(db: Queryable, adminId: string, action: string, table: string, targetId: string, after: unknown) {
    await db.query(
      `INSERT INTO admin_audit_logs (admin_id,action_name,target_table,target_record_id,after_state)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [adminId, action, table, targetId, JSON.stringify(after)],
    );
  },

  async reviewers(db: Queryable): Promise<ReviewerRow[]> {
    const { rows } = await db.query<ReviewerRow>(
      `SELECT p.id,p.full_name AS name,p.email,p.is_blocked,
              (SELECT count(*)::int FROM qc_reviews r WHERE r.reviewer_id=p.id AND r.completed_at IS NULL) AS open_reviews,
              COALESCE((SELECT json_agg(json_build_object('mappingId',m.id,'examId',e.id,'examName',e.name) ORDER BY e.name)
                          FROM qc_reviewer_mappings m JOIN exams e ON e.id=m.exam_id
                         WHERE m.reviewer_id=p.id AND m.is_active),'[]') AS exams
         FROM profiles p
        WHERE 'qc_reviewer'::user_role_type=ANY(p.roles)
        ORDER BY p.full_name`,
    );
    return rows;
  },

  async profileByEmail(db: Queryable, email: string): Promise<{ id: string; roles: string[] } | undefined> {
    const { rows } = await db.query<{ id: string; roles: string[] }>(
      'SELECT id,roles::text[] AS roles FROM profiles WHERE lower(email)=$1 LIMIT 2',
      [email],
    );
    return rows.length === 1 ? rows[0] : undefined;
  },

  async isReviewer(db: Queryable, profileId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      "SELECT 1 FROM profiles WHERE id=$1 AND 'qc_reviewer'::user_role_type=ANY(roles) AND NOT is_blocked",
      [profileId],
    );
    return rowCount === 1;
  },

  async grantReviewer(db: Queryable, profileId: string): Promise<void> {
    await db.query(
      `UPDATE profiles SET roles=array_append(roles,'qc_reviewer'::user_role_type)
        WHERE id=$1 AND NOT ('qc_reviewer'::user_role_type=ANY(roles))`,
      [profileId],
    );
  },

  /** Removes the role, its mappings and its open primary assignments (they return to the unassigned queue). */
  async revokeReviewer(db: Queryable, profileId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE profiles SET roles=array_remove(roles,'qc_reviewer'::user_role_type)
        WHERE id=$1 AND 'qc_reviewer'::user_role_type=ANY(roles)`,
      [profileId],
    );
    if (rowCount !== 1) return false;
    await db.query('UPDATE qc_reviewer_mappings SET is_active=FALSE WHERE reviewer_id=$1', [profileId]);
    await db.query(
      `UPDATE qc_reviews SET reviewer_id=NULL,assigned_at=NULL,reassign_reason='Reviewer removed'
        WHERE reviewer_id=$1 AND completed_at IS NULL`,
      [profileId],
    );
    return true;
  },

  async mapReviewer(db: Queryable, reviewerId: string, examId: string): Promise<void> {
    const reactivated = await db.query(
      'UPDATE qc_reviewer_mappings SET is_active=TRUE WHERE reviewer_id=$1 AND exam_id=$2 AND subject_id IS NULL',
      [reviewerId, examId],
    );
    if (reactivated.rowCount) return;
    await db.query('INSERT INTO qc_reviewer_mappings (reviewer_id,exam_id) VALUES ($1,$2)', [reviewerId, examId]);
  },

  async unmapReviewer(db: Queryable, mappingId: string): Promise<boolean> {
    const { rowCount } = await db.query('UPDATE qc_reviewer_mappings SET is_active=FALSE WHERE id=$1 AND is_active', [
      mappingId,
    ]);
    return rowCount === 1;
  },

  async examExists(db: Queryable, examId: string): Promise<boolean> {
    const { rowCount } = await db.query('SELECT 1 FROM exams WHERE id=$1', [examId]);
    return rowCount === 1;
  },

  async assign(db: Queryable, reviewId: string, reviewerId: string, reason: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE qc_reviews rv SET reviewer_id=$2,assigned_at=now(),reassign_reason=$3
         FROM tests t
        WHERE rv.id=$1 AND t.id=rv.test_id AND rv.completed_at IS NULL AND t.examiner_id<>$2`,
      [reviewId, reviewerId, reason],
    );
    return rowCount === 1;
  },

  async createSpotCheck(db: Queryable, testId: string, reviewerId: string): Promise<string | undefined> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO qc_reviews (test_id,reviewer_id,is_second_spot_check,status,assigned_at)
       SELECT t.id,$2,TRUE,'in_qc',now() FROM tests t
        WHERE t.id=$1 AND t.status IN ('approved','scheduled','live') AND t.examiner_id<>$2
       RETURNING id`,
      [testId, reviewerId],
    );
    return rows[0]?.id;
  },

  async approvedTests(db: Queryable): Promise<ApprovedRow[]> {
    const { rows } = await db.query<ApprovedRow>(
      `SELECT t.id AS test_id,t.title,e.name AS exam_name,p.full_name AS examiner_name,t.published_at,
              COALESCE((SELECT CASE WHEN s.completed_at IS NULL THEN 'open'
                                    WHEN s.status='approved' THEN 'passed' ELSE 'failed' END
                          FROM qc_reviews s WHERE s.test_id=t.id AND s.is_second_spot_check
                         ORDER BY s.created_at DESC LIMIT 1),'none') AS spot_check
         FROM tests t JOIN exams e ON e.id=t.exam_id JOIN profiles p ON p.id=t.examiner_id
        WHERE t.status IN ('approved','scheduled','live')
        ORDER BY t.published_at DESC NULLS LAST LIMIT 100`,
    );
    return rows;
  },

  async settings(db: Queryable): Promise<SettingsRow[]> {
    const { rows } = await db.query<SettingsRow>(
      `SELECT id AS exam_id,name AS exam_name,trigram_high_threshold::float8 AS trigram_high,
              trigram_mid_threshold::float8 AS trigram_mid,pyq_max_percentage::float8 AS pyq_max,updated_at
         FROM exams ORDER BY name`,
    );
    return rows;
  },

  async updateSettings(
    db: Queryable,
    examId: string,
    expectedUpdatedAt: string,
    values: { trigramHigh: number; trigramMid: number; pyqMaxPercentage: number },
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE exams SET trigram_high_threshold=$3,trigram_mid_threshold=$4,pyq_max_percentage=$5
        WHERE id=$1 AND ${SAME_VERSION('updated_at', '$2')}`,
      [examId, expectedUpdatedAt, values.trigramHigh, values.trigramMid, values.pyqMaxPercentage],
    );
    return rowCount === 1;
  },
};
