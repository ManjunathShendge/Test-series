-- Review decisions outlive the test item they judged: an examiner replacing a flagged
-- question during revision must not erase the reviewer's record (invariant 6, PRD 4.3).

ALTER TABLE public.qc_question_reviews
  ADD COLUMN display_order INT,
  ADD COLUMN carried_over BOOLEAN NOT NULL DEFAULT FALSE,
  ALTER COLUMN test_question_id DROP NOT NULL,
  DROP CONSTRAINT qc_question_reviews_test_question_id_fkey,
  ADD CONSTRAINT qc_question_reviews_test_question_id_fkey
    FOREIGN KEY (test_question_id) REFERENCES public.test_questions(id) ON DELETE SET NULL;

UPDATE public.qc_question_reviews r SET display_order = tq.display_order
  FROM public.test_questions tq WHERE tq.id = r.test_question_id;
UPDATE public.qc_question_reviews SET carried_over = TRUE
 WHERE reviewer_comment = 'Approved in an earlier review round.';

-- Same Stage 1 as 013, now recording each item's position and carried-over approvals.
CREATE OR REPLACE FUNCTION public.start_test_qc(p_test_id UUID) RETURNS UUID
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

  INSERT INTO public.qc_question_reviews
    (qc_review_id, test_question_id, question_id, display_order, carried_over, has_completeness_error,
     duplicate_match_kind, matched_question_id, similarity_score, reviewer_action, reviewer_comment, reviewed_at)
  SELECT v_review, tq.id, q.id, tq.display_order, tq.is_locked_by_qc,
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
   WHERE qc_review_id = v_review AND NOT carried_over
     AND (has_completeness_error OR duplicate_match_kind IS NOT NULL);

  v_report := COALESCE(public.run_test_presubmit_check(p_test_id) -> 'pattern_fit_warning_report', '{}'::jsonb);

  UPDATE public.qc_reviews
     SET flag_count = v_flags, pattern_fit_report = v_report, stage1_completed_at = now()
   WHERE id = v_review;
  UPDATE public.tests SET status = 'in_qc', current_qc_flag_count = v_flags WHERE id = p_test_id;
  RETURN v_review;
END $$;

-- Carried-over approvals cannot be reopened by a reviewer.
CREATE FUNCTION public.protect_carried_over_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.carried_over AND (NEW.reviewer_action, NEW.reason_code, NEW.reviewer_comment, NEW.carried_over)
       IS DISTINCT FROM (OLD.reviewer_action, OLD.reason_code, OLD.reviewer_comment, OLD.carried_over) THEN
    RAISE EXCEPTION 'Approved in an earlier round; the decision stands' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_carried_over_decision BEFORE UPDATE ON public.qc_question_reviews
  FOR EACH ROW EXECUTE FUNCTION protect_carried_over_decision();

UPDATE public.bootstrap_state SET version = 14 WHERE id = 'schema';
