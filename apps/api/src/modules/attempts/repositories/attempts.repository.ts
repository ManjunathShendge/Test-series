import type { Queryable } from '@exam-prep/db';

export interface AttemptRow {
  id: string;
  student_id: string;
  test_id: string;
  test_title: string;
  test_slug: string;
  exam_name: string;
  has_hindi: boolean;
  status: 'in_progress' | 'submitted' | 'timed_out' | 'abandoned';
  attempt_number: number;
  started_at: Date;
  server_expires_at: Date;
  submitted_at: Date | null;
  current_question_id: string | null;
  active_session_token: string | null;
  session_epoch: number;
  ack_seq: number;
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  incorrect_count: number;
  skipped_count: number;
  total_score: string;
  rank: number | null;
  percentile: string | null;
  sectional_scores: Record<string, { score: number; correct: number; incorrect: number; attempted: number; total: number }>;
  server_now: Date;
}

const ATTEMPT_SELECT = `
  SELECT sa.id,sa.student_id,sa.test_id,t.title AS test_title,t.slug AS test_slug,e.name AS exam_name,t.has_hindi,
         sa.status::text AS status,sa.attempt_number,sa.started_at,sa.server_expires_at,sa.submitted_at,
         sa.current_question_id,sa.active_session_token,sa.session_epoch,sa.ack_seq,sa.total_questions,
         sa.attempted_count,sa.correct_count,sa.incorrect_count,sa.skipped_count,sa.total_score,sa.rank,sa.percentile,
         sa.sectional_scores,now() AS server_now
    FROM student_attempts sa
    JOIN tests t ON t.id=sa.test_id
    JOIN exams e ON e.id=t.exam_id`;

export interface SectionRow {
  section_id: string;
  name: string;
  section_order: number;
  question_count: number;
  positive_marks: string;
  negative_marks: string;
  duration_seconds: number | null;
  opens_at: Date | null;
  closes_at: Date | null;
  closed_at: Date | null;
  state: 'upcoming' | 'open' | 'closed';
}

export interface AnswerRow {
  id: string;
  test_question_id: string;
  question_id: string;
  section_id: string;
  palette_state: 'not_visited' | 'not_answered' | 'answered' | 'marked_for_review' | 'answered_and_marked';
  selected_option: 'A' | 'B' | 'C' | 'D' | null;
  time_spent_seconds: number;
}

export interface PaperRow {
  test_question_id: string;
  section_id: string;
  display_order: number;
  stem_en: string;
  stem_hi: string | null;
  options: { id: 'A' | 'B' | 'C' | 'D'; textEn: string; textHi?: string }[];
  passage_en: string | null;
  passage_hi: string | null;
  image_asset_ids: string[];
  positive_marks: string;
  negative_marks: string;
}

export const attemptsRepository = {
  async start(db: Queryable, testId: string, sessionHash: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>('SELECT public.start_attempt($1,$2) AS id', [testId, sessionHash]);
    return rows[0]!.id;
  },

  async attempt(db: Queryable, attemptId: string, lock = false): Promise<AttemptRow | undefined> {
    if (lock) await db.query('SELECT 1 FROM student_attempts WHERE id=$1 FOR UPDATE', [attemptId]);
    const { rows } = await db.query<AttemptRow>(`${ATTEMPT_SELECT} WHERE sa.id=$1`, [attemptId]);
    return rows[0];
  },

  /** Applies scheduled section changes (and optionally finishes the open one early). */
  async tick(db: Queryable, attemptId: string, advance: boolean): Promise<void> {
    await db.query('SELECT public.attempt_tick_sections($1,$2)', [attemptId, advance]);
  },

  async sections(db: Queryable, attemptId: string): Promise<SectionRow[]> {
    const { rows } = await db.query<SectionRow>(
      `SELECT w.section_id,s.name,w.section_order,s.question_count,s.positive_marks,s.negative_marks,w.duration_seconds,
              w.opens_at,w.closes_at,w.closed_at,
              CASE WHEN w.closed_at IS NOT NULL OR (w.closes_at IS NOT NULL AND w.closes_at <= now()) THEN 'closed'
                   WHEN w.opens_at IS NULL OR w.opens_at > now() THEN 'upcoming' ELSE 'open' END AS state
         FROM student_attempt_sections w JOIN test_sections s ON s.id=w.section_id
        WHERE w.attempt_id=$1 ORDER BY w.section_order`,
      [attemptId],
    );
    return rows;
  },

  async answers(db: Queryable, attemptId: string): Promise<AnswerRow[]> {
    const { rows } = await db.query<AnswerRow>(
      `SELECT saa.id,saa.test_question_id,saa.question_id,saa.section_id,saa.palette_state::text AS palette_state,
              saa.selected_option,saa.time_spent_seconds
         FROM student_attempt_answers saa JOIN test_questions tq ON tq.id=saa.test_question_id
        WHERE saa.attempt_id=$1 ORDER BY tq.display_order`,
      [attemptId],
    );
    return rows;
  },

  async paper(db: Queryable, attemptId: string): Promise<PaperRow[]> {
    const { rows } = await db.query<PaperRow>('SELECT * FROM public.attempt_paper($1)', [attemptId]);
    return rows;
  },

  async image(db: Queryable, attemptId: string, assetId: string) {
    const { rows } = await db.query<{ bucket: string; object_key: string; mime_type: 'image/jpeg' | 'image/png' | 'image/webp' }>(
      'SELECT bucket,object_key,mime_type FROM public.attempt_image($1,$2)',
      [attemptId, assetId],
    );
    return rows[0];
  },

  async setSession(db: Queryable, attemptId: string, sessionHash: string): Promise<void> {
    await db.query(
      `UPDATE student_attempts SET active_session_token=$2,session_epoch=session_epoch+1,ack_seq=0
        WHERE id=$1 AND status='in_progress'`,
      [attemptId, sessionHash],
    );
  },

  async storedEvent(db: Queryable, attemptId: string, epoch: number, seq: number): Promise<{ payload: unknown } | undefined> {
    const { rows } = await db.query<{ payload: unknown }>(
      'SELECT payload FROM student_attempt_events WHERE attempt_id=$1 AND epoch=$2 AND seq=$3',
      [attemptId, epoch, seq],
    );
    return rows[0];
  },

  async recordEvent(
    db: Queryable,
    attemptId: string,
    epoch: number,
    seq: number,
    payload: unknown,
    accepted: boolean,
    reason: string | null,
  ): Promise<void> {
    await db.query(
      `INSERT INTO student_attempt_events (attempt_id,epoch,seq,payload,accepted,reason) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
      [attemptId, epoch, seq, JSON.stringify(payload), accepted, reason],
    );
  },

  async saveAnswer(
    db: Queryable,
    answerId: string,
    change: { selected: string | null; palette: AnswerRow['palette_state']; seconds: number },
  ): Promise<void> {
    await db.query(
      `UPDATE student_attempt_answers
          SET selected_option=$2,palette_state=$3::palette_state_type,time_spent_seconds=GREATEST(time_spent_seconds,$4)
        WHERE id=$1`,
      [answerId, change.selected, change.palette, change.seconds],
    );
  },

  async noteFocusLost(db: Queryable, attemptId: string): Promise<void> {
    await db.query('UPDATE student_attempts SET app_switch_count=app_switch_count+1 WHERE id=$1', [attemptId]);
  },

  async setProgress(db: Queryable, attemptId: string, ackSeq: number, currentQuestionId: string | null): Promise<void> {
    await db.query(
      `UPDATE student_attempts
          SET ack_seq=$2,current_question_id=COALESCE($3,current_question_id),
              remaining_seconds_at_last_sync=GREATEST(0,floor(extract(epoch FROM server_expires_at-now())))::int
        WHERE id=$1`,
      [attemptId, ackSeq, currentQuestionId],
    );
  },

  async finish(db: Queryable, attemptId: string, timedOut: boolean): Promise<string> {
    const { rows } = await db.query<{ status: string }>('SELECT public.finish_attempt($1,$2) AS status', [attemptId, timedOut]);
    return rows[0]!.status;
  },

  async summaryExtras(db: Queryable, attemptId: string, testId: string) {
    const { rows } = await db.query<{ max_score: string; ranked: number; late: number }>(
      `SELECT (SELECT COALESCE(sum(tq.positive_marks),0) FROM student_attempt_answers saa
                 JOIN test_questions tq ON tq.id=saa.test_question_id WHERE saa.attempt_id=$1) AS max_score,
              (SELECT count(*)::int FROM student_attempts WHERE test_id=$2 AND attempt_number=1
                  AND status IN ('submitted','timed_out')) AS ranked,
              (SELECT count(*)::int FROM student_attempt_events WHERE attempt_id=$1 AND NOT accepted
                  AND reason IN ('time_up','attempt_closed')) AS late`,
      [attemptId, testId],
    );
    return rows[0]!;
  },

  async sectionMax(db: Queryable, attemptId: string) {
    const { rows } = await db.query<{ section_id: string; name: string; max_score: string; section_order: number }>(
      `SELECT s.id AS section_id,s.name,s.section_order,COALESCE(sum(tq.positive_marks),0) AS max_score
         FROM student_attempt_answers saa JOIN test_questions tq ON tq.id=saa.test_question_id
         JOIN test_sections s ON s.id=saa.section_id
        WHERE saa.attempt_id=$1 GROUP BY s.id,s.name,s.section_order ORDER BY s.section_order`,
      [attemptId],
    );
    return rows;
  },

  async mine(db: Queryable, studentId: string) {
    const { rows } = await db.query<{
      id: string;
      test_id: string;
      test_title: string;
      test_slug: string;
      status: AttemptRow['status'];
      started_at: Date;
      server_expires_at: Date;
      submitted_at: Date | null;
      total_score: string;
      total_questions: number;
    }>(
      `SELECT sa.id,sa.test_id,t.title AS test_title,t.slug AS test_slug,sa.status::text AS status,sa.started_at,
              sa.server_expires_at,sa.submitted_at,sa.total_score,sa.total_questions
         FROM student_attempts sa JOIN tests t ON t.id=sa.test_id
        WHERE sa.student_id=$1 ORDER BY sa.started_at DESC LIMIT 100`,
      [studentId],
    );
    return rows;
  },

  // Results (M8) ---------------------------------------------------------------------------------

  async review(db: Queryable, attemptId: string) {
    const { rows } = await db.query<ReviewRow>('SELECT * FROM public.attempt_review($1)', [attemptId]);
    return rows;
  },

  async cohort(db: Queryable, attemptId: string) {
    const { rows } = await db.query<{ cohort_size: number; average_score: string | null; topper_score: string | null; average_seconds: string | null }>(
      'SELECT * FROM public.attempt_cohort($1)',
      [attemptId],
    );
    return rows[0]!;
  },

  async saveQuestion(db: Queryable, questionId: string, bookmarked: boolean | null, notebook: boolean | null): Promise<void> {
    await db.query('SELECT public.set_saved_question($1,$2,$3)', [questionId, bookmarked, notebook]);
  },

  async practice(db: Queryable, kind: 'mistakes' | 'bookmarks') {
    const { rows } = await db.query<PracticeRow>('SELECT * FROM public.practice_list($1)', [kind]);
    return rows;
  },

  async topicAccuracy(db: Queryable) {
    const { rows } = await db.query<{ subject_name: string; topic_name: string; attempted: number; correct: number; total: number }>(
      'SELECT * FROM public.my_topic_accuracy() ORDER BY subject_name, topic_name',
    );
    return rows;
  },

  async trend(db: Queryable, studentId: string) {
    const { rows } = await db.query<{
      id: string;
      test_title: string;
      test_slug: string;
      submitted_at: Date;
      total_score: string;
      max_score: string;
      total_questions: number;
      attempted_count: number;
      correct_count: number;
    }>(
      `SELECT sa.id,t.title AS test_title,t.slug AS test_slug,sa.submitted_at,sa.total_score,t.total_marks AS max_score,
              sa.total_questions,sa.attempted_count,sa.correct_count
         FROM student_attempts sa JOIN tests t ON t.id=sa.test_id
        WHERE sa.student_id=$1 AND sa.status IN ('submitted','timed_out') AND sa.submitted_at IS NOT NULL
        ORDER BY sa.submitted_at DESC LIMIT 30`,
      [studentId],
    );
    return rows;
  },

  /** Live tests in the student's target exams they have not attempted; free and popular first. */
  async recommended(db: Queryable, studentId: string) {
    const { rows } = await db.query<{
      id: string;
      slug: string;
      title: string;
      exam_name: string;
      total_questions: number;
      total_duration_seconds: number;
      price_paise: number;
    }>(
      `SELECT t.id,t.slug,t.title,e.name AS exam_name,t.total_questions,t.total_duration_seconds,t.price_paise
         FROM tests t JOIN exams e ON e.id=t.exam_id
         JOIN profiles p ON p.id=$1
        WHERE t.status='live'
          AND (cardinality(COALESCE(p.target_exam_ids,'{}'))=0 OR t.exam_id=ANY(p.target_exam_ids))
          AND NOT EXISTS (SELECT 1 FROM student_attempts sa WHERE sa.student_id=$1 AND sa.test_id=t.id)
        ORDER BY (t.price_paise=0) DESC, t.attempts_count DESC, t.published_at DESC NULLS LAST
        LIMIT 6`,
      [studentId],
    );
    return rows;
  },

  async report(db: Queryable, attemptId: string, questionId: string, reason: string, comment: string | null): Promise<string> {
    const { rows } = await db.query<{ id: string }>('SELECT public.report_question($1,$2,$3,$4) AS id', [attemptId, questionId, reason, comment]);
    return rows[0]!.id;
  },
};

type OptionRow = { id: 'A' | 'B' | 'C' | 'D'; textEn: string; textHi?: string };

export interface ReviewRow {
  test_question_id: string;
  question_id: string;
  section_id: string;
  display_order: number;
  subject_name: string | null;
  topic_name: string | null;
  stem_en: string;
  stem_hi: string | null;
  options: OptionRow[];
  passage_en: string | null;
  passage_hi: string | null;
  image_asset_ids: string[];
  positive_marks: string;
  negative_marks: string;
  selected_option: 'A' | 'B' | 'C' | 'D' | null;
  is_correct: boolean | null;
  marks_awarded: string;
  time_spent_seconds: number;
  marked: boolean;
  correct_option: 'A' | 'B' | 'C' | 'D';
  key_corrected: boolean;
  solution_en: string | null;
  solution_hi: string | null;
  cohort_attempted: number;
  cohort_correct: number;
  cohort_avg_seconds: string | null;
  bookmarked: boolean;
  in_notebook: boolean;
  reported: boolean;
}

export interface PracticeRow {
  question_id: string;
  test_id: string;
  test_title: string;
  attempt_id: string;
  subject_name: string | null;
  topic_name: string | null;
  stem_en: string;
  stem_hi: string | null;
  options: OptionRow[];
  passage_en: string | null;
  passage_hi: string | null;
  image_asset_ids: string[];
  selected_option: 'A' | 'B' | 'C' | 'D' | null;
  correct_option: 'A' | 'B' | 'C' | 'D';
  solution_en: string | null;
  solution_hi: string | null;
  bookmarked: boolean;
  in_notebook: boolean;
  saved_at: Date;
}
