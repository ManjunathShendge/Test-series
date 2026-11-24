// Zod request/response contracts. Domain modules are added in M1 onwards and
// re-exported here; see docs/API_CONTRACTS.md. No database, framework or
// provider imports may appear anywhere in this package.

export const CONTRACTS_PACKAGE = '@exam-prep/contracts' as const;

export * from './common/errors.js';
export * from './identity/index.js';
export * from './catalogue/index.js';
export * from './admin/index.js';
export * from './authoring/index.js';
export * from './authoring/rich-text.js';
export * from './authoring/examiner-tests.js';
export * from './qc/index.js';
export * from './commerce/index.js';
export * from './attempts/index.js';
export * from './notifications/index.js';
