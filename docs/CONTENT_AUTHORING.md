# Examiner onboarding and authoring

Examiner responsive web only. Individual/institute is one account at launch. Applicant provides photo/bio/exams/subjects/experience/links, ten sample questions for one exam, manual KYC documents and versioned agreement acceptance. Samples enter ordinary QC. Ops approves/rejects with reason; accepted examiner starts tier New. KYC verification and sample approval are distinct gates; no real sales/payout before required checks.

## Editor

Choose exam/stage/type/template; show section counts, timing and marking. Structured rich text supports tables, images and KaTeX. English required; bilingual test requires English/Hindi stem, options, passage and solution. Stable option IDs separate answer identity from display order. Tag from admin syllabus and examiner-set difficulty. Store source provenance for PYQs. Preview exact student rendering before submit.

Draft save uses expected revision and clear saved/saving/conflict/error states. Server sanitizes allowed nodes/HTML and forbids scripts, remote embeds and executable links. Shared passages are versioned. Reuse own approved questions by reference; warn/block paid reuse per QC. Exam template and price tier selection are validated server-side. Scheduled publication is MVP; competitive live windows are Phase 2.

## Excel contract (to implement M3)

One `Questions` sheet; columns: row_id, section, position, group_id, stem_en, stem_hi, option_a_en through option_d_en, option_a_hi through option_d_hi, correct_option, solution_en, solution_hi, subject_code, topic_code, difficulty, source, pyq_year, image_refs. Template version and example rows supplied separately. Number of options follows template; if not four, version the template contract explicitly. `Groups` sheet maps group_id to English/Hindi passage and image references.

Preserve LaTeX as plain text; images refer to safe relative filenames in supplied ZIP. No OCR, macros, formula execution or implicit external network references. Reject zip traversal, symlinks, duplicate names, unsupported MIME, decompression bombs and oversized batches; proposed starting limits 200 questions/20MB compressed/100MB expanded, verified in S2/M3.

Workflow: upload -> parse/validate preview -> row/column errors -> user fixes source -> commit accepted manifest atomically. No silent partial import. File+manifest digest and idempotency key prevent duplicate commit. Report unsupported formatting rather than destroying it. A 100-question synthetic bilingual import with group/images/math must require zero manual fixes; invalid fixture must point to exact rows/cells. Admin PYQ ingestion uses same parser with official year/shift/provenance fields and coverage register.

## Examiner operations

Dashboard: sales/attempts/revenue by test/day, payout statements, uploaded quarterly TDS certificates, tier inputs (QC pass rate, duplicate rejections, key corrections, report response time), coupon attribution. Admin sets tier monthly and allowed prices/fast review lane. Ratings and detailed examiner question statistics remain Phase 2.
