# API and worker instructions

Read root CLAUDE.md and relevant docs. These directories are documentation scaffolds until M0.

- Controller parses contract, authenticates and calls application service; no SQL/business rules.
- Service owns state transition, authorization, transaction, audit and outbox. Repositories contain Prisma/parameterized SQL. Pass transaction explicitly across module orchestration.
- Providers live under src/providers with interface + real/fake adapters; never expose SDK types in shared contracts.
- HTTP and worker share domain code/config, run separate entry points and health/metrics.
- Domain handlers dedupe by event/economic source IDs; external calls have recovery states.
- Validate Firebase tokens, device session and object ownership. Reviewer assignment and admin permission flags are enforced in services.
- Use positive student paper serializers; separate staff/review payloads. Assert no keys/solutions/AI notes leak through nested assets.
- Write real Postgres integration tests for mutation invariants and races; use the actual app role for privilege tests.
- Migrations are reviewed SQL/Prisma changes, never production db push. Client timestamps, prices and verdict claims are untrusted.
