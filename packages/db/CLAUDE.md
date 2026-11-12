# Database instructions

- Prisma schema plus explicit SQL migrations where extensions/indexes/triggers/grants require them.
- Update docs/DATA_MODEL.md alongside schema changes; never silently erase data.
- Separate migration/app roles; ledger/audit append-only and published versions immutable.
- Use FKs, unique economic source IDs and transactional locks for concurrency, not application checks alone.
- Synthetic deterministic seeds only; no credentials/PII/real question banks.
- Test migrations and invariants on real PostgreSQL with required extensions.
