# Scoring, review and progress

Server scores pinned question and template versions after terminal attempt transition. Correct gets positive mark, wrong incurs configured penalty, skipped gets zero; selected-and-marked counts as answered. Use exact scaled units/rational arithmetic; round only for presentation. Client score previews cannot unlock results or keys.

Result includes score, correct/wrong/skipped, sectional totals, rank/percentile/attempt count, topper and average comparison, authorized question review with solutions, own time vs aggregate average and percentage correct. Empty/tiny cohorts show sample count and meaningful “not enough data” state, not fabricated comparisons.

Proposed rank: descending score, equal scores share competition rank (1,1,3); deterministic display order by attempt ID, no hidden timing tiebreak. Percentile = 100 * strictly-lower scores / cohort size, label definition in UI. Cohort: same comparable paper/template/scoring epoch, first completed normal attempt per student. Reattempts excluded. Rank snapshot has calculated_at/population; not falsely realtime. Product can change convention before M8 with versioned acceptance fixtures.

Corrections retain original delivered paper/answers and original result. Reviewer-approved old/new key mapping creates result revision keyed by attempt+correction. Text changes that alter the question need an explicit neutralization/marking policy, not retrospective replacement. Batch rescore with restart checkpoints; rebuild cohort snapshot when all affected results finish; atomically activate corrected snapshot, then notify once. Show corrected result provenance.

Progress aggregates topic accuracy, weakest-topic template text, recommended untaken tests in target/weak topics, score trend with dated admin cutoff. Practice lists: wrong-answer notebook and bookmarks. Review access verifies original authorized attempt; question stats expose aggregates only. Reattempt mode creates separate attempt and does not inflate competitive ranks.

Phase 2 live ranking waits until window closes plus admin integrity review; solutions released only at configured release time. Live attempt submission alone must not leak keys to other active participants. Examiner-facing stats/ratings are Phase 2, written reviews later.
