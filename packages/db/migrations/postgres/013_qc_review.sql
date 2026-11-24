-- M4/M5 rule QC and human review (PRD 4.2-4.3, 5.2-5.3, QC_PIPELINE): Stage 1 runs when an
-- examiner submits, routes the test to a mapped reviewer, and the reviewer's verdict either
-- publishes the test or returns it with approved questions locked.

ALTER TABLE public.qc_reviews
  ADD COLUMN assigned_at TIMESTAMPTZ,
  ADD COLUMN reassign_reason TEXT;

-- One open primary review and one open second review per test at a time.
CREATE UNIQUE INDEX qc_reviews_one_open_primary ON public.qc_reviews (test_id)
  WHERE completed_at IS NULL AND NOT is_second_spot_check;
CREATE UNIQUE INDEX qc_reviews_one_open_spot ON public.qc_reviews (test_id)
  WHERE completed_at IS NULL AND is_second_spot_check;
CREATE INDEX idx_qc_reviews_reviewer_open ON public.qc_reviews (reviewer_id) WHERE completed_at IS NULL;
CREATE INDEX idx_qc_question_reviews_question ON public.qc_question_reviews (question_id);
CREATE INDEX idx_question_reports_question ON public.question_reports (question_id, status);

-- Structured reason codes (QC_PIPELINE "Change/reject require reason code and comment").
ALTER TABLE public.qc_question_reviews
  ADD CONSTRAINT qc_question_reviews_reason_code CHECK (reason_code IS NULL OR reason_code IN (
    'key_wrong', 'solution_wrong', 'ambiguous', 'out_of_syllabus', 'duplicate', 'translation',
    'formatting', 'watermark', 'other')),
  ADD CONSTRAINT qc_question_reviews_reason_required CHECK (
    reviewer_action NOT IN ('request_change', 'reject')
    OR (reason_code IS NOT NULL AND length(trim(COALESCE(reviewer_comment, ''))) > 0));

ALTER TABLE public.exams
  ADD CONSTRAINT exams_trigram_thresholds CHECK (
    trigram_mid_threshold > 0 AND trigram_mid_threshold < trigram_high_threshold AND trigram_high_threshold <= 1),
  ADD CONSTRAINT exams_pyq_max CHECK (pyq_max_percentage >= 0 AND pyq_max_percentage <= 100);

-- Stage 1 (PRD 5.2 checks 1-5, 8) on the frozen submission, then routing (PRD 5.3.1).
-- Called by the owning examiner right after submit, or with no user context by the system.
-- SECURITY DEFINER: moves the test to in_qc, which the examiner's row policy does not allow.
CREATE FUNCTION public.start_test_qc(p_test_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_test RECORD;
  v_review UUID;
  v_reviewer UUID;
  v_flags INT;
  v_report JSONB;
BEGIN
  SELECT * INTO v_test FROM public.tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.current_user_id() IS NOT NULL AND public.current_user_id() IS DISTINCT FROM v_test.examiner_id THEN
    RAISE EXCEPTION 'Not authorised to submit this test' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_test.status <> 'submitted' THEN
    RAISE EXCEPTION 'Test is not waiting for QC' USING ERRCODE = 'restrict_violation';
  END IF;

  -- Least-loaded active reviewer mapped to the exam; never the author.
  SELECT m.reviewer_id INTO v_reviewer
    FROM public.qc_reviewer_mappings m
    JOIN public.profiles p ON p.id = m.reviewer_id
   WHERE m.exam_id = v_test.exam_id AND m.is_active AND NOT p.is_blocked
     AND 'qc_reviewer'::user_role_type = ANY(p.roles) AND m.reviewer_id <> v_test.examiner_id
   GROUP BY m.reviewer_id
   ORDER BY (SELECT count(*) FROM public.qc_reviews r WHERE r.reviewer_id = m.reviewer_id AND r.completed_at IS NULL),
            random()
   LIMIT 1;

  INSERT INTO public.qc_reviews (test_id, reviewer_id, status, assigned_at)
  VALUES (p_test_id, v_reviewer, 'in_qc', CASE WHEN v_reviewer IS NULL THEN NULL ELSE now() END)
  RETURNING id INTO v_review;

  -- One row per item. Approved items from an earlier round stay approved (PRD 4.3).
  -- The strongest corpus match outside the question's own version family is recorded.
  INSERT INTO public.qc_question_reviews
    (qc_review_id, test_question_id, question_id, has_completeness_error, duplicate_match_kind,
     matched_question_id, similarity_score, reviewer_action, reviewer_comment, reviewed_at)
  SELECT v_review, tq.id, q.id,
         v_test.has_hindi AND (COALESCE(trim(q.stem_hi), '') = '' OR COALESCE(trim(q.solution_hi), '') = ''),
         m.match_kind, m.matched_question_id, m.similarity_score,
         CASE WHEN tq.is_locked_by_qc THEN 'approve'::qc_action_type ELSE 'pending'::qc_action_type END,
         CASE WHEN tq.is_locked_by_qc THEN 'Approved in an earlier review round.' END,
         CASE WHEN tq.is_locked_by_qc THEN now() END
    FROM public.test_questions tq
    JOIN public.questions q ON q.id = tq.question_id
    LEFT JOIN LATERAL (
      SELECT d.matched_question_id, d.match_kind, d.similarity_score
        FROM public.run_question_duplicate_check(q.exam_id, q.examiner_id, q.text_hash, q.masked_hash,
                                                 q.norm_stem_en, q.id) d
        JOIN public.questions mq ON mq.id = d.matched_question_id
       WHERE COALESCE(mq.parent_question_id, mq.id) <> COALESCE(q.parent_question_id, q.id)
       ORDER BY (d.match_kind IN ('exact_hash', 'pyq_match')) DESC, d.similarity_score DESC
       LIMIT 1
    ) m ON TRUE
   WHERE tq.test_id = p_test_id;

  -- Check 5: identical image file reused from another question family.
  UPDATE public.qc_question_reviews r
     SET duplicate_match_kind = 'image_hash',
         matched_question_id = (
           SELECT o.id FROM public.questions o
            WHERE o.exam_id = q.exam_id AND o.is_approved_in_corpus
              AND o.image_file_hashes && q.image_file_hashes
              AND COALESCE(o.parent_question_id, o.id) <> COALESCE(q.parent_question_id, q.id)
            LIMIT 1)
    FROM public.questions q
   WHERE r.qc_review_id = v_review AND q.id = r.question_id AND r.duplicate_match_kind IS NULL
     AND cardinality(q.image_file_hashes) > 0
     AND EXISTS (
       SELECT 1 FROM public.questions o
        WHERE o.exam_id = q.exam_id AND o.is_approved_in_corpus
          AND o.image_file_hashes && q.image_file_hashes
          AND COALESCE(o.parent_question_id, o.id) <> COALESCE(q.parent_question_id, q.id));

  SELECT count(*) INTO v_flags FROM public.qc_question_reviews
   WHERE qc_review_id = v_review AND reviewer_action = 'pending'
     AND (has_completeness_error OR duplicate_match_kind IS NOT NULL);

  -- Check 8: topic counts next to the template targets (a warning, never a block).
  v_report := COALESCE(public.run_test_presubmit_check(p_test_id) -> 'pattern_fit_warning_report', '{}'::jsonb);

  UPDATE public.qc_reviews
     SET flag_count = v_flags, pattern_fit_report = v_report, stage1_completed_at = now()
   WHERE id = v_review;
  UPDATE public.tests SET status = 'in_qc', current_qc_flag_count = v_flags WHERE id = p_test_id;
  RETURN v_review;
END $$;

-- Test verdict (PRD 5.3.6): passes only when every question is approved, then goes live
-- (PRD 4.3 "On approval, the test goes live"); otherwise returns to the examiner with
-- approved questions locked and flagged ones unlocked. Approved questions join the corpus.
CREATE FUNCTION public.finish_test_qc(p_review_id UUID, p_comments TEXT) RETURNS test_status_type
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_review RECORD;
  v_test RECORD;
  v_pass BOOLEAN;
  v_status test_status_type;
BEGIN
  SELECT * INTO v_review FROM public.qc_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR v_review.is_second_spot_check THEN
    RAISE EXCEPTION 'Review not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_test FROM public.tests WHERE id = v_review.test_id FOR UPDATE;
  IF public.current_user_id() IS NULL
     OR public.current_user_id() = v_test.examiner_id
     OR NOT (public.has_role('admin')
             OR (public.has_role('qc_reviewer') AND v_review.reviewer_id = public.current_user_id())) THEN
    RAISE EXCEPTION 'Not authorised to finish this review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_review.completed_at IS NOT NULL OR v_test.status <> 'in_qc' THEN
    RAISE EXCEPTION 'This review is already finished' USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.qc_question_reviews WHERE qc_review_id = p_review_id AND reviewer_action = 'pending') THEN
    RAISE EXCEPTION 'Every question needs a decision' USING ERRCODE = 'check_violation';
  END IF;

  v_pass := NOT EXISTS (SELECT 1 FROM public.qc_question_reviews
                         WHERE qc_review_id = p_review_id AND reviewer_action IN ('request_change', 'reject'));

  UPDATE public.test_questions tq
     SET qc_status = r.reviewer_action,
         is_locked_by_qc = r.reviewer_action IN ('approve', 'minor_edit')
    FROM public.qc_question_reviews r
   WHERE r.qc_review_id = p_review_id AND tq.id = r.test_question_id;

  UPDATE public.questions q
     SET is_approved_in_corpus = TRUE
    FROM public.qc_question_reviews r
   WHERE r.qc_review_id = p_review_id AND r.reviewer_action IN ('approve', 'minor_edit')
     AND q.id = r.question_id AND NOT q.is_approved_in_corpus;

  v_status := CASE WHEN v_pass THEN 'live'::test_status_type ELSE 'changes_requested'::test_status_type END;
  UPDATE public.tests
     SET status = v_status, published_at = CASE WHEN v_pass THEN now() ELSE published_at END
   WHERE id = v_test.id;
  UPDATE public.qc_reviews
     SET status = CASE WHEN v_pass THEN 'approved'::test_status_type ELSE 'changes_requested'::test_status_type END,
         overall_comments = NULLIF(trim(COALESCE(p_comments, '')), ''),
         reviewer_id = COALESCE(reviewer_id, public.current_user_id()),
         completed_at = now()
   WHERE id = p_review_id;
  RETURN v_status;
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.start_test_qc(uuid)', 'public.finish_test_qc(uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO exam_app, exam_worker', f);
    END IF;
  END LOOP;
END $$;

-- Tests submitted before this migration enter the queue now (system context).
SELECT public.start_test_qc(t.id) FROM public.tests t
 WHERE t.status = 'submitted'
   AND NOT EXISTS (SELECT 1 FROM public.qc_reviews r WHERE r.test_id = t.id AND r.completed_at IS NULL);

UPDATE public.bootstrap_state SET version = 13 WHERE id = 'schema';
