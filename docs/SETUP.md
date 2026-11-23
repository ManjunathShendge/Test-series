# Local development

The foundation runs API, worker and web against PostgreSQL 17 in Docker. Staging and production use Supabase PostgreSQL (Mumbai). Mobile remains a standalone student demo. Real identity, catalogue, payments and attempt APIs are later milestones. See "PostgreSQL on Supabase" in [DECISIONS](DECISIONS.md).

## Prerequisites

Node **22.23.5** (`.node-version`), pnpm **11.13.1**, Git and a running Docker engine (Docker Desktop on Windows). On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`; no execution-policy change is needed. Native Android needs Java/Android SDK; iOS compilation needs macOS/Xcode or EAS. Keep the repository on a path without spaces: the React Native Android CMake step fails otherwise (DECISIONS X1).

## First run

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm services:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`setup` copies safe examples only when destinations are absent. Root `.env` supplies shared server/CLI configuration; web/mobile have separate public-only examples. Existing files are preserved.

`services:up` starts `postgres:17.12-alpine` (the Supabase version), local object storage, and the digest-pinned ClamAV scanner; it waits until all are healthy. The named volumes preserve database and malware definitions. A new PostgreSQL volume runs `docker/postgres/init`, which creates three roles:

| Role | Used by | Rights |
|---|---|---|
| `exam_migrator` | `db:migrate`, `db:seed` (`MIGRATION_DATABASE_URL`) | Owns the schema |
| `exam_app` | API (`DATABASE_URL`) | Row reads/writes only; cannot create, alter or drop tables |
| `exam_worker` | Worker (`WORKER_DATABASE_URL`) | Row reads/writes only |

`db:migrate` applies `packages/db/migrations/postgres` in one transaction under an advisory lock; a changed, already-applied migration is rejected. `db:seed` is idempotent and restricted to local/test. `pnpm --filter @exam-prep/db seed:demo` adds the synthetic demo catalogue (the mobile demo's exams, examiner personas, series, 11 live tests and their questions, from `seeds/demo-catalogue.json`); it is idempotent, allowed on local/test, and on staging only with `APP_ENV=staging CONFIRM_DEMO_SEED=staging`. It creates no student accounts, purchases, entitlements or attempts.

`dev` builds server dependencies before starting API, worker and web. The API TypeScript watcher recompiles the server graph; Node watchers restart API and worker independently. Mobile starts separately with `pnpm --filter @exam-prep/mobile start` (development client), or `pnpm --filter @exam-prep/mobile exec expo start --go` for the existing Expo Go demo. Current device testing is Expo Go on a physical iPhone on the same Wi-Fi: set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to the computer's LAN address and allow port 3001 through the Windows firewall.

## Local endpoints

| Service | Address |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 (domain routes use `/v1`) |
| Worker health | http://localhost:3002/health/ready |
| PostgreSQL | localhost:15432, database `exam_prep` |

Containers bind only to host loopback. API/web development listeners can be accessed from devices through the host LAN address and appropriate firewall rules. Android emulators use `10.0.2.2` for the host. All database passwords in examples and Compose are public local-only fixtures. `docker/firebase` holds the Auth emulator configuration for M1; it is not wired into Compose yet.

## Supabase staging

Supabase is used as a database only: Supabase Auth and Edge Functions are unused, and the Data API must stay disabled so the NestJS API is the only path to data.

| Setting | Supabase connection |
|---|---|
| `DATABASE_URL` (API) | Transaction pooler, port 6543 |
| `WORKER_DATABASE_URL`, `MIGRATION_DATABASE_URL` | Session pooler, port 5432 |
| `DATABASE_CA_CERT_PATH` | CA certificate downloaded from the Supabase dashboard (Database settings, SSL) |

Direct connections are IPv6-only and are not used. Staging and production refuse to start without `DATABASE_CA_CERT_PATH`, so TLS always verifies the server certificate. Keep connection strings in the gitignored `.env` or the host's secret store; never commit them.

Provisioning a hosted database (done for staging on 19 November 2026):

1. Migrate with the owner (`postgres.<project-ref>`) session-pooler URL as `MIGRATION_DATABASE_URL` and `DATABASE_CA_CERT_PATH` set: `pnpm db:migrate`.
2. Create or rotate the restricted roles: `pnpm --filter @exam-prep/db provision-roles` with the same two variables plus `OUTPUT_ENV_FILE` and `OUTPUT_PREFIX` (for example `.env` and `STAGING_`). It generates passwords, writes `<PREFIX>DATABASE_URL` (exam_app, port 6543), `<PREFIX>WORKER_DATABASE_URL` (exam_worker, port 5432) and `<PREFIX>DATABASE_CA_CERT_PATH` into that file and never prints them. Re-running rotates both passwords.

Supabase enables row-level security on every new table (its `ensure_rls` event trigger). The migrator therefore keeps RLS on for every public table, everywhere, with one `exam_service_access` policy for `exam_app` and `exam_worker`; it reapplies this after every run. Provisioning also revokes Supabase's `anon` and `authenticated` access to public tables, so data stays closed even if the Data API is re-enabled. In the local `.env`, staging values use the `STAGING_` and `SUPABASE_` prefixes so they never replace the Docker URLs.

### Keeping the free-plan project awake

Supabase pauses free-plan projects after about a week without activity. `.github/workflows/keep-supabase-awake.yml` runs `SELECT now()` every three days (and on demand from the Actions tab) as `exam_keepalive`, a login-only role with no access to any table. It verifies TLS against the committed public Supabase root certificate in `.github/certs/`.

- Create or rotate the role: `pnpm --filter @exam-prep/db provision-keepalive-role` with the owner `MIGRATION_DATABASE_URL`, `DATABASE_CA_CERT_PATH`, `OUTPUT_ENV_FILE` and `OUTPUT_PREFIX`; it writes `<PREFIX>KEEPALIVE_DATABASE_URL` without printing it.
- Copy that value into the repository secret `SUPABASE_KEEPALIVE_DATABASE_URL` (Settings, Secrets and variables, Actions). Rotating the role requires updating the secret.
- GitHub disables scheduled workflows after 60 days without repository activity; re-enable it from the Actions tab if that happens. A paid Supabase plan does not pause, so the workflow can be removed then.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check:public-env
pnpm services:up
pnpm db:migrate
pnpm test:int
pnpm test:e2e
```

Unit tests need no services. Empty contracts/engine/web suites explicitly allow no tests while they remain scaffolds; this is not coverage. `test:int` needs running PostgreSQL: database tests create an isolated database per test, apply `docker/postgres/init/002-grants.sql` and the migrations, then drop it. They cover migrations and extensions, role restrictions, billing idempotency and integer money, append-only ledger and audit, transactional rollback and concurrent job claims. API tests cover readiness against an unreachable and a migrated database. Missing services cause failures, never skips.

`test:e2e` builds server/web, starts temporary API/worker/web listeners on free ports chosen at run time (printed first) against the configured database, verifies readiness, HTML and CORS, then stops its own processes. Run `db:migrate` first. A failure names the service and its exit code. This is a foundation HTTP smoke test, not browser or native user-journey coverage.

CI starts PostgreSQL with Compose, runs these checks, applies migrations, seeds twice and builds API/web images. It does not publish or deploy. `check:public-env` validates public variable names against an allowlist; it is not a general secret or question-key scanner. Synthetic mobile solutions remain bundled for the demo.

API `/health/live` is dependency-free. `/health/ready` returns 503 when PostgreSQL or the schema version is unavailable; responses never include connection details. Worker readiness also checks the job table.

## Containers

```sh
docker build -f apps/api/Dockerfile -t exam-prep-api:local .
docker build -f apps/web/Dockerfile -t exam-prep-web:local .
docker compose --profile app up
```

API and worker share an image; worker command is `node dist/worker.js`. The Compose `app` profile runs both against the local PostgreSQL service, migrating before the API starts. Supply server environment at runtime. Web public variables are build-time arguments. Images run as non-root users and exclude environment files and confidential source inputs. These are packaging foundations, not production deployment approval.

## Troubleshooting

- Start Docker Desktop before `services:up`. Inspect `docker compose ps` and `docker compose logs --tail=100 postgres`.
- Windows rejected port 5432, so the default is 15432. To override, set `POSTGRES_PORT` and update all three database URLs together.
- Role initialization runs only on a new volume. Do not delete existing data automatically to repair configuration.
- `pnpm services:stop` and `docker compose down` preserve the volume. Avoid `down -v` unless you intend to erase local data.
- The earlier PostgreSQL 18 volume `exam-prep-local_postgres-data` and the SQLite file under `data/` are no longer used; they were left in place, not converted or deleted.
- Invalid database URLs, ports/origins or production emulator flags fail application startup. Errors identify variable names without printing credentials.
- Upgrade local Node with your Node manager if it is below the engine range; installing dependencies does not upgrade it. On Windows: `winget install --id OpenJS.NodeJS.22 --version 22.23.5 --exact`.

## Development build and Google sign-in

Expo Go cannot load Google Sign-In, so Google needs a development build (`expo-dev-client`), built in the cloud with EAS from Windows. Email sign-in keeps working in Expo Go. The consent screen in **Testing** mode needs no product domain; add yourself as a test user. Publishing it for all students needs the domain with privacy and terms pages.

1. **Firebase** (project in `EXPO_PUBLIC_FIREBASE_PROJECT_ID`): Authentication > Sign-in method > Add provider > Google > Enable, set the support email, Save. Copy **Web client ID** from Web SDK configuration.
2. **Google Cloud** (same project): Google Auth Platform > Branding (app name, support and developer email); Audience > Test users > add the Gmail you will test with.
3. **Bundle ID**: choose it, because the OAuth clients are tied to it. Put it in `apps/mobile/.env` as `APP_BUNDLE_ID`.
4. **Firebase iOS app**: Project settings > Add app > iOS with that bundle ID; download `GoogleService-Info.plist` (keep it out of git). `CLIENT_ID` goes in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `REVERSED_CLIENT_ID` in `GOOGLE_IOS_URL_SCHEME`.
5. **`apps/mobile/.env`**: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `APP_BUNDLE_ID`, `GOOGLE_IOS_URL_SCHEME`.
6. **EAS** (needs a paid Apple Developer account for a physical iPhone), from `apps/mobile`:

```powershell
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init --id 3036cec0-1fd4-4295-b0ed-765e950af6d8   # projectId is already in app.config.ts
pnpm dlx eas-cli@latest env:create --environment development --name APP_BUNDLE_ID --value <bundle id> --visibility plaintext
pnpm dlx eas-cli@latest env:create --environment development --name GOOGLE_IOS_URL_SCHEME --value <REVERSED_CLIENT_ID> --visibility plaintext
pnpm dlx eas-cli@latest device:create          # open the link on the iPhone, install the profile
pnpm dlx eas-cli@latest build --profile development --platform ios
```

The cloud build cannot read the gitignored `.env`, so the two build-time values must be EAS environment variables; a build without `GOOGLE_IOS_URL_SCHEME` stops with an error. The `EXPO_PUBLIC_` values reach the app from your local `.env` through Metro. Install the finished build from its link, enable Developer Mode on the iPhone (Settings > Privacy & Security), then run `pnpm --filter @exam-prep/mobile start` and open the installed app instead of Expo Go. Rebuild only when native packages or these build-time values change.

Android later: add the Android app in Firebase with the same package and the SHA-1 from `eas credentials`; the web client ID is enough in code.

## Website sign-in (local)

`apps/web/.env.local` (gitignored) holds the Firebase web config (`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`; same project as the app and the API's `FIREBASE_PROJECT_ID`) and `NEXT_PUBLIC_API_BASE_URL` (the API as the browser reaches it). The website's origin must be in the API's `CORS_ORIGINS` (local default `http://localhost:3000`). For Google on a deployed domain, add the domain under Firebase console > Authentication > Settings > Authorized domains; `localhost` is authorized by default. Firebase loads only on `/sign-in`, `/forgot-password`, `/onboarding` and `/account`.

