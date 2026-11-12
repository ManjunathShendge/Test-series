# Requirement traceability and acceptance

Original PRD sections/pages preserved in [PRD](PRD.md); later amendments in [DECISIONS](DECISIONS.md). R IDs are stable references for tickets/tests. All implementation evidence pending.

| ID | Source | Requirement | Design / milestone / acceptance |
|---|---|---|---|
| R01 | PRD 0,7 | AI suggests only; no embeddings/training/OCR | QC_PIPELINE, M12; disabled/no mutation tests |
| R02 | PRD 1-2,11 | Three student platforms; one web staff console, multi-role | ARCHITECTURE/SECURITY, M1/M6; permission matrix |
| R03 | PRD 3 | Exam hierarchy/templates/syllabus; single-correct/grouped MCQ | DATA_MODEL, M2/M3; template and grouped fixtures |
| R04 | PRD 3 | English required; optional complete Hindi | CONTENT_AUTHORING, M3; completeness validation |
| R05 | PRD 4.1 | Profile, ten samples, manual KYC, agreement, approval | CONTENT_AUTHORING, M3/M11; application gate |
| R06 | PRD 4.2 | Editor/math/images/tables/Excel zip/tagging | CONTENT_AUTHORING, M3; 100-question import |
| R07 | PRD 4.2-3 | Own-bank reuse, precheck, pricing, revision locks | QC_PIPELINE, M4/M5; policy and lock tests |
| R08 | PRD 4.3 | Scheduled publication, immutable live content | ARCHITECTURE, M5; artifact/approval gate |
| R09 | PRD 4.4 | Sales/earnings/tier/report response/code | WEB/PAYMENTS, M11; dashboard and 72h queue |
| R10 | PRD 5.1-2 | Hash/trigram/masked/image/PYQ/pattern checks | QC_PIPELINE, M4; calibrated fixtures |
| R11 | PRD 5.3 | Routing, 48h SLA, checklist/verdicts/reasons, 10% second review | QC_PIPELINE, M5; exact-version approval |
| R12 | PRD 5.4 | Reports, five distinct auto-hide, correction/rescore | QC_PIPELINE/RESULTS, M8; quarantine and revisions |
| R13 | PRD 6.1 + amendment | Google/email/Apple, preferences, free test | MOBILE/SECURITY, M1/M6; identity linking |
| R14 | PRD 6.2 | Continue/recommendations/follow/featured/exam/series/search | WEB/RESULTS, M6/M8; routes/filter tests |
| R15 | PRD 6.3 + amendment | Web/store purchases, tiers, coupons, recovery | PAYMENTS, M9a/b; transaction race/recovery |
| R16 | PRD 6.3,9.3 | Invoice/refund/payout/hold/minimum/TDS | PAYMENTS, M9a/M11; finance fixtures |
| R17 | PRD 6.4 | Instructions/timers/palette/sections/language/zoom/actions | TEST_ENGINE/design override, M7; reducer/E2E |
| R18 | PRD 6.4,11-12 | Local save/sync/crash resume/autosubmit | TEST_ENGINE, M7; crash and deadline tests |
| R19 | PRD 6.5 | Score/rank/percentile/benchmarks/solutions/time/stats | RESULTS, M8; cohort/scoring fixtures |
| R20 | PRD 6.5-7 | Bookmark/report/mistakes/reattempt/topic/trend/profile/deletion | RESULTS/SECURITY, M8/M13; own-data access |
| R21 | PRD 7 | Template performance text and rule recommendations | RESULTS, M8; no student AI calls |
| R22 | PRD 8 | Admin exam/QC/examiner/student/catalogue/finance/CMS | WEB/SECURITY, M2/M11; role-specific actions/audit |
| R23 | PRD 9.1 | Proposed 65/75%, 50% Pass pool | PAYMENTS/DECISIONS, O03; approval before real money |
| R24 | PRD 10 | Push/email triggers and future SMS/WhatsApp scope | NOTIFICATIONS, M10; trigger matrix |
| R25 | PRD 10,13.4 | SEO/public pages/shared access/optional PWA | WEB, M6/M13; sitemap/private noindex |
| R26 | PRD 11 | Next/Expo/Nest/Postgres/pg-boss/S3 | ARCHITECTURE, M0; build and dependency boundaries |
| R27 | PRD 12 | Capture mitigation/watermark/2 devices/1 session/switch logs | MOBILE/TEST_ENGINE/SECURITY, M7; real devices |
| R28 | PRD 12 | 2s load, 300ms save, 30MB, live uptime | TESTING/INFRA, M13; recorded measurements |
| R29 | PRD 12 | Font scaling/screen reader; high contrast later | Design master, M6/M7; assistive checks |
| R30 | PRD 12 | Consent/deletion/grievance/18+/agreements/tax | SECURITY/LAUNCH_CHECKLIST, M13; legal/CA gate |
| R31 | PRD 13.1 | 3 exams, PYQ coverage, 20+ examiners, 20/50 tests, beta | LAUNCH_CHECKLIST, M13; ops evidence |
| R32 | PRD 13.2-4 | Organization accounts/store listings/privacy/testing/domain | LAUNCH_CHECKLIST, M13; store gates |
| R33 | PRD 13 phase 2 | Pass/live/ratings/stats/AI buttons/anomaly/fraud | ROADMAP Phase 2; features disabled in MVP |
| R34 | PRD 14 | Unresolved business decisions and risks | DECISIONS, O01-O12; owners and gates |
| R35 | requirement.text | Free-to-start with paid production path | INFRA; no unverified quota guarantees |
| R36 | SKILL.md | Accessibility-first responsive coherent UI | Design master/page overrides; fallback disclosed |

Product targets (PRD 1), not launch guarantees: 2,000 live approved tests, 50,000 monthly active students, 4% free-to-paid conversion, QC <48h, live duplicates <1%, confirmed wrong keys <2 per 1,000 attempts, Day-30 retention 20%. Define denominators/cohorts in analytics before judging success. Prelaunch inventory target is separately 20 or 50 tests per selected exam.
