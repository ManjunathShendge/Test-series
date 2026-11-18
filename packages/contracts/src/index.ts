// Zod request/response contracts. Domain modules are added in M1 onwards and
// re-exported here; see docs/API_CONTRACTS.md. No database, framework or
// provider imports may appear anywhere in this package.

export const CONTRACTS_PACKAGE = '@exam-prep/contracts' as const;

export * from './common/errors.js';
export * from './identity/index.js';
