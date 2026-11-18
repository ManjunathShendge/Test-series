# Local development

The foundation runs API, worker and web against PostgreSQL 17 in Docker. Staging and production use Supabase PostgreSQL (Mumbai). Mobile remains a standalone student demo. Real identity, catalogue, payments and attempt APIs are later milestones. See "PostgreSQL on Supabase" in [DECISIONS](DECISIONS.md).

## Prerequisites

Node **22.23.5** (`.node-version`), pnpm **11.13.1**, Git and a running Docker engine (Docker Desktop on Windows). On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`; no execution-policy change is needed. Native Android needs Java/Android SDK; iOS compilation needs macOS/Xcode or EAS. See DECISIONS X1 about the existing path containing spaces before native Android builds.

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

`services:up` starts `postgres:17.12-alpine` (the Supabase version) on `127.0.0.1:15432` and waits until healthy. The named volume `postgres17-data` preserves data. A new volume runs `docker/postgres/init`, which creates three roles:

| Role | Used by | Rights |
|---|---|---|
| `exam_migrator` | `db:migrate`, `db:seed` (`MIGRATION_DATABASE_URL`) | Owns the schema |
| `exam_app` | API (`DATABASE_URL`) | Row reads/writes only; cannot create, alter or drop tables |
| `exam_worker` | Worker (`WORKER_DATABASE_URL`) | Row reads/writes only |

`db:migrate` applies `packages/db/migrations/postgres` in one transaction under an advisory lock; a changed, already-applied migration is rejected. `db:seed` is idempotent and restricted to local/test. Domain accounts and papers will be seeded once their services exist.

`dev` builds server dependencies before starting API, worker and web. The API TypeScript watcher recompiles the server graph; Node watchers restart API and worker independently. Mobile starts separately with `pnpm --filter @exam-prep/mobile start` (development client), or `pnpm --filter @exam-prep/mobile exec expo start --go` for the existing Expo Go demo.

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
