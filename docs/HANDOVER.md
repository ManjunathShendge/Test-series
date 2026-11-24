# Handover

State on 24 November 2026, for the team taking over operation and the remaining client work. Details live in the linked documents; PROJECT_STATUS has the dated log with the checks run for each milestone.

## What is built

| Area | Web | App | Server |
|---|---|---|---|
| Sign-in and devices | Google and email | Google (development builds) and email | Firebase token verification, server-issued devices, two-device limit |
| Catalogue | Exams, tests, series, examiners, follows, banners | Same | Public catalogue, follows, banners |
| Tests | Timed player, sections, resume | Same | Server time and scoring, durable answers, ranks |
| Results | Solutions after close, progress, saved questions | Same | Keys hidden until the attempt closes |
| Buying | Razorpay checkout, invoices | "Available soon" until store billing is added | Orders, webhook, ledger, entitlements, refunds |
| Examiners | Application, authoring, import, earnings, payouts | Not in the app (by design) | Malware scan, duplicate checks, QC submission |
| QC reviewers | Review queue, checklist, AI suggestions | Not in the app | Rule checks, advisory AI checks, scheduled publishing |
| Admin | Catalogue, CMS, reports and CSV, audit log, money, students, QC settings | Not in the app | Permission-checked, audited |
| Account | Export, deletion | Deletion, notification settings | 7-day grace deletion, Firebase identity removal |
| Notifications | Email | Push | Outbox and worker, retries, opt-outs |

## Turning on providers

Every provider is optional: unset means off, never a crash. A wrong or half-set key stops the API or worker at start-up with the variable's name (values are never printed). All server keys go in the API and worker environment (`.env.example`); app and web values are public identifiers only.

| Provider | Variables | Effect |
|---|---|---|
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Web checkout. Live keys only when `APP_ENV=production`; production refuses test keys |
| Invoices | `SELLER_LEGAL_NAME`, `SELLER_GSTIN`, `SELLER_ADDRESS`, `SUPPORT_EMAIL` | Tax invoices only with a GSTIN, receipts otherwise |
| Email | `EMAIL_SMTP_URL`, `EMAIL_FROM` | Receipts, QC and report emails (any SMTP, including Amazon SES) |
| Push | `EXPO_ACCESS_TOKEN` (only with enhanced push security) | Push through Expo |
| Analytics | `POSTHOG_API_KEY` (server), `NEXT_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` | Opt-in product events; `purchase_confirmed` from the server |
| Identity deletion | `FIREBASE_SERVICE_ACCOUNT_JSON` | Deleted accounts also lose their Firebase sign-in; must belong to `FIREBASE_PROJECT_ID` |
| AI for reviewers | `LLM_API_KEY`, `LLM_MODEL`, prices, `AI_MONTHLY_CAP_USD` | Advisory checks, also switched on per exam by an admin |
| Object storage | `STORAGE_*` | Examiner uploads and KYC (required when deployed) |
| Malware scan | `ANTIVIRUS_HOST`, `ANTIVIRUS_PORT` | ClamAV (required when deployed) |

## Running it

- Local: SETUP.md (`pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`).
- Processes in production: API (`apps/api/dist/main.js`), worker (`apps/api/dist/worker.js`, its own health on `WORKER_PORT`), web (Next.js). Images: `apps/api/Dockerfile`, `apps/web/Dockerfile`.
- Database: PostgreSQL 17 (Supabase Mumbai for staging). Migrations run with the migration role before the new images start; they are forward-only (INFRA "CI and release").
- CI (`.github/workflows/ci.yml`): lint, typecheck, unit, database integration, smoke tests and image builds on every push.
- Runbooks: OPERATIONS.md.

## Security model in one paragraph

The API is the only path to data. The database refuses rows a signed-in user may not see (row-level security on every table, evaluated against the verified user); the worker has its own role; Supabase's public Data API roles have no access. Keys and solutions never reach a student before their attempt closes. Money is integer paise in an append-only ledger. Admin and reviewer actions are written to the audit log by database triggers. AI only suggests. See SECURITY.md; tables that still rely on the API for row checks are listed in DATA_MODEL "Row rules (C6)".

## Left for the client's team

- Store billing in the app and the server-side store purchase verification (STORE_RELEASE.md). Blocked first on the store product decision (PAYMENTS "Store catalog gate").
- Sign in with Apple, required before App Store submission (STORE_RELEASE.md).
- Store listings, privacy labels and builds (STORE_RELEASE.md "Listing answers", "Release steps").

## Owner decisions and external gates still open

LAUNCH_CHECKLIST lists them. The main ones: business decisions O01-O12 in DECISIONS, legal and CA review of terms, refunds, privacy and invoices, production hosting choice for the API, worker and web, the store product gate, backups with a restore drill, monitoring and alerts, a load test at the founder's chosen concurrency, and the closed beta.
