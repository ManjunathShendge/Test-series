// Pure deterministic attempt reducer, timing and scoring. No React, HTTP,
// storage, randomness or implicit system clock; time arrives as an input.
// See docs/TEST_ENGINE.md.

export const ENGINE_PACKAGE = '@exam-prep/engine' as const;

export * from './reducer/attempt.js';
export * from './timing/clock.js';
export * from './scoring/score.js';
