# Quality control

Sources: PRD sections 4-5, 7; requirement.text. No paper goes live without human approval of every exact question version. Owner sign-off of policy defaults remains in [DECISIONS](DECISIONS.md).

## Normalization and corpus

Corpus is all PYQs and approved questions in the same exam. Include author identity and publication/access state; do not conflate same-question version history with unauthorized reuse. Normalize from structured text, not arbitrary regex-stripped HTML. NFKC, whitespace/zero-width normalization, case folding and punctuation normalization are versioned. Preserve meaningful math operators and tokens; aggressive normalization may create collisions, which require review. English required; Hindi is a separate representation.

Exact hash covers normalized stem + sorted normalized options; include passage/group digest for contextual sets. Masked hash additionally replaces recognized numbers/currency/fractions/names with typed placeholders. Curated name rules must not erase math variables; pin golden fixtures. Image hashes are SHA-256 of file bytes, not perceptual similarity. A normalization change triggers versioned corpus reindex with old/new comparisons before activation.

pg_trgm compares English stems within exam with a bounded indexed candidate search. Calibrate high/mid thresholds on about 200 labelled pairs including Hindi in S1; no invented threshold promoted to production. If Hindi quality is weak, English-only trigram plus bilingual human review. Similarity cannot establish cross-language equivalence.

## Checks and policy

| Check | Enforcement |
|---|---|
| Required text/options/key/solution/tags and declared languages | Block incomplete submit |
| Duplicate within same paper | Hard block |
| Exact another examiner corpus match | Block by default; reviewer resolves false positives or provenance, with audit |
| Own question already live in paid content | Block paid reuse; free reuse allowed; version edits do not evade ownership check |
| Exact PYQ in mock | Must be tagged year; proposed 10% cap, including detected untagged matches |
| PYQ paper | Reviewer compares to official paper/provenance; mock cap does not apply |
| High/mid trigram, masked hash, image reuse | Flag with evidence; human decides |
| Pattern topic counts vs template | Warning; exact section counts/timing still validated |
| Optional AI blind answer, ambiguity, bilingual equivalence | Suggestions only; never approval/block |

Rules run at authoring precheck and again on frozen submission manifest. Large corpus checks return queued precheck progress rather than holding a request indefinitely. Publication rechecks manifest/version and policy validity to prevent stale approval races. Matches from another examiner shown to examiners are limited/redacted to prevent bank exfiltration; reviewers receive authorized evidence.

## Review and revisions

Assign via exam/subject mapping; no reviewer approves their own content. Queue order: flag count descending, then 48h SLA deadline ascending. Staff may reassign with reason. Reviewer checks key against worked solution, single defensible option, bilingual meaning, syllabus, source rights and absence of book scans/other-brand watermarks.

Actions approve/minor_edit/request_change/reject bind to exact version. Change/reject require reason code and comment. Minor edit creates a new version and revalidates; it cannot inherit approval blindly. Approved questions lock during examiner revision; only flagged positions can change. A resubmission gets a new manifest/run and retains prior audit. Admin manually assigns second review for 10% of approvals; sampled tests must pass before release (proposed operational gate).

## AI boundary

Input contains stem/options/passages and both languages, never answer key or solution. Treat text as untrusted data; no tools, arbitrary URL fetches, or instructions from questions. Output JSON: selected stable option ID or unknown, ambiguity_note, language_note. Validate schema/length. Compare returned ID with key on the server.

Cache key covers full ordered bilingual input, group/assets digest, normalization/prompt version, provider and model. Exact duplicate hash alone is insufficient because it sorts options and may omit translation changes. Suggestions are separate immutable records and flags; no background content/verdict mutation. Human Accept/Edit creates a new draft version with provenance and audit.

Per-exam disabled by default. Reserve estimated cost atomically before requests; enforce monthly cap and provider cap, timeout/retry limits, private-content data terms. Unavailable/invalid response records “AI check unavailable”; rule/human review continues.

## Post-publication

Reports: wrong answer, ambiguous, out of syllabus, duplicate, translation error. Five distinct eligible students reporting a question trigger quarantine; repeat reports from same user count once. Notify examiner and reviewer; examiner response target 72h. Quarantine blocks new attempts on every affected published paper until a reviewed replacement is ready; existing attempts retain pinned content. Reinstatement requires audited review.

Key correction pins old/new mapping and deterministic marking policy, rescores affected attempts, rebuilds rank snapshot and notifies students. Never substitute unrelated changed question text into an old attempt. Phase 2 adds wrong-key SQL anomaly and examiner-facing question analytics.
