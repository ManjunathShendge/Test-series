# Contract instructions

- Zod schemas and inferred types are the API boundary, including responses/errors/events.
- No database, framework or provider imports; explicit versioned enums and discriminated unions.
- Validate money integers, UTC timestamps, bounds and unknown fields. Separate public paper and protected review schemas.
- Additive compatibility for deployed clients; breaking changes require version/migration plan.
- OpenAPI derives from contracts; do not hand-maintain divergent client DTOs.
