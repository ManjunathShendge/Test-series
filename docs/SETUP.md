# Local development

The foundation runs API, worker and web against one local SQLite file. Mobile remains a standalone student demo. Real identity, catalogue, payments and attempt APIs are later milestones. Storage follows the 16 November 2026 SQLite decision in [DECISIONS](DECISIONS.md).

## Prerequisites

Node **22.23.5** (`.node-version`), pnpm **11.13.1** and Git. Docker is needed only to build the container images. On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`; no execution-policy change is needed. Native Android needs Java/Android SDK; iOS compilation needs macOS/Xcode or EAS. See DECISIONS X1 about the existing path containing spaces before native Android builds.

## First run

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm services:up
pnpm db:seed
pnpm dev
```

`setup` copies safe examples only when destinations are absent. Root `.env` supplies shared server/CLI configuration; web/mobile have separate public-only examples. Existing files are preserved.

`DATABASE_URL` is a `file:` URL. Relative paths resolve against the workspace root for API, worker and CLI alike; the default is `data/exam-prep.sqlite` (gitignored). `services:up` is an alias for `db:migrate`: there is no database service to start. Migrations in `packages/db/migrations/sqlite` are checksummed and applied in transactions, and the migrator creates the data directory. `db:seed` is idempotent and restricted to local/test. Domain accounts and papers will be seeded once their services exist.

Connections enable WAL, foreign keys, `synchronous = FULL` and a 5-second busy timeout. API and worker share the file on one host; never place it on a network filesystem or share it across hosts. Node prints an `ExperimentalWarning` for `node:sqlite`; that is expected on Node 22.

`dev` builds server dependencies before starting API, worker and web. The API TypeScript watcher recompiles the server graph; Node watchers restart API and worker independently. Mobile starts separately with `pnpm --filter @exam-prep/mobile start` (development client), or `pnpm --filter @exam-prep/mobile exec expo start --go` for the existing Expo Go demo.

## Local endpoints

| Service | Address |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 (domain routes use `/v1`) |
| Worker health | http://localhost:3002/health/ready |
| Database | `data/exam-prep.sqlite` |

API/web development listeners can be accessed from devices through the host LAN address and appropriate firewall rules. Android emulators use `10.0.2.2` for the host.

SQLite has no database roles. Authorization belongs to API services; OS file permissions protect the database. Provider credentials and adapters arrive with their milestones. `docker/firebase` holds the Auth emulator configuration for M1; it is not wired into Compose yet.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check:public-env
pnpm db:migrate
pnpm test:int
pnpm test:e2e
```

Unit tests need no services. Empty contracts/engine/web suites explicitly allow no tests while they remain scaffolds; this is not coverage. `test:int` runs SQLite storage checks (migrations, roles, billing idempotency, append-only ledger and audit, transactional rollback, file BLOBs, job leases, schema mismatch) against temporary files, plus HTTP failure-path checks.

`test:e2e` builds server/web, starts temporary API/worker/web listeners on 43101/43102/43100, verifies readiness, HTML and CORS, then stops its own processes. It uses the configured database, so run `db:migrate` first. This is a foundation HTTP smoke test, not browser or native user-journey coverage.

CI runs these checks, applies migrations, seeds twice and builds API/web images. It does not publish or deploy. `check:public-env` validates public variable names against an allowlist; it is not a general secret or question-key scanner. Synthetic mobile solutions remain bundled for the demo.

API `/health/live` is dependency-free. `/health/ready` returns 503 when the database or schema version is unavailable. Auth/email are not readiness dependencies until their adapters exist.

## Containers

```sh
docker build -f apps/api/Dockerfile -t exam-prep-api:local .
docker build -f apps/web/Dockerfile -t exam-prep-web:local .
docker compose --profile app up
```

API and worker share an image; worker command is `node dist/worker.js`. In Compose both mount the `sqlite-data` volume, migrate on start and bind to host loopback. Supply server environment at runtime. Web public variables are build-time arguments. Images run as non-root users and exclude environment files and confidential source inputs. These are packaging foundations, not production deployment approval.

## Troubleshooting

- `unable to open database file`: run `pnpm db:migrate` first, and check that `DATABASE_URL` points at a writable local directory.
- `Database schema is incompatible`: the file was created by a different migration set. Do not delete data automatically; move the file aside if it is disposable.
- Invalid database URLs, ports/origins or production emulator flags fail application startup. Errors identify variable names without printing credentials.
- Upgrade local Node with your Node manager if it is below the engine range; installing dependencies does not upgrade it. On Windows: `winget install --id OpenJS.NodeJS.22 --version 22.23.5 --exact`.
- The earlier PostgreSQL/MinIO Compose files are preserved in `docs/archive/`. Existing Docker volumes from that setup were not converted or deleted.
