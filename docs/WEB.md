# Web application

One Next.js App Router app serves public/student routes plus examiner and staff areas. Public discovery pages render indexable metadata; authenticated responses never enter shared caches. NestJS owns business logic and authorization; route guards and layouts are UX conveniences only.

| Routes | Principal screens |
|---|---|
| /, /exams, /exams/[slug] | Home, filtered catalogue, syllabus/dates/cutoffs |
| /series/[id], /tests/[id], /examiners/[id] | Coverage/schedule/price, detail, credentials and follow |
| /learn, /attempts/[id], /results/[id] | Continue, CBT, results and review |
| /progress, /profile, /purchases | Trends/mistakes/bookmarks, preferences/deletion, invoices |
| /examiner/apply, /examiner/tests, /examiner/imports | Onboarding, editor/version history, import preview |
| /examiner/earnings, /examiner/reports | Payouts/TDS statements, QC/report responses |
| /admin/qc, /admin/exams, /admin/examiners | Reviewer queue, templates, applications/KYC |
| /admin/students, /admin/payouts, /admin/reports, /admin/settings | Ops/finance functions and audit |

Feature folders own query hooks, components and forms; shared primitives remain small and accessible. Student attempts use IndexedDB, shared engine and [sync protocol](TEST_ENGINE.md). A service worker must not cache keys, authenticated APIs or purchases indiscriminately. Optional PWA installation is not full offline support.

Auth adapter manages verified identity; if using server session cookies, Secure/HttpOnly/SameSite + CSRF protection on mutations. Explicit provider linking. Browser tabs coordinate one attempt writer; stale tab cannot override active epoch.

Reviewer console: bilingual content, worked solution, flags/matches, topic-count table, required reason codes, keyboard actions with confirmation for destructive verdicts. Examiner never receives another examiner's entire private bank through precheck. Finance panel checks finance permissions on each backend action.

SEO: canonical exam/series/examiner URLs, sitemap of public live content, accurate structured data; no invented ratings. Private/admin/result routes noindex. Mobile layouts use safe areas, readable table overflow and actual form labels. See design master and reviewer override.
