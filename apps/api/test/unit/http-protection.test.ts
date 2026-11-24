import { describe, expect, it } from 'vitest';
import { buildRules, FixedWindowLimiter, RULES, type Request } from '../../src/common/security/http-protection.js';

const req = (path: string, ip = '1.2.3.4', authorization?: string, method = 'GET'): Request => ({ method, path, ip, headers: { authorization } });

describe('rate limits', () => {
  it('lets a classroom on one network through but stops a flood', () => {
    const limiter = new FixedWindowLimiter(RULES);
    // 60 students, each saving answers every 5 seconds for a minute, behind one address.
    let refused = 0;
    for (let s = 0; s < 60; s++) for (let i = 0; i < 12; i++) refused += limiter.check(req('/v1/attempts/a/events', '9.9.9.9', `Bearer student-${s}`, 'POST'), 0) > 0 ? 1 : 0;
    expect(refused).toBe(0);
    let flood = 0;
    for (let i = 0; i < 1300; i++) flood += limiter.check(req('/v1/exams', '6.6.6.6'), 0) > 0 ? 1 : 0;
    expect(flood).toBe(100);
  });

  it('limits one sign-in across addresses and resets after the window', () => {
    const limiter = new FixedWindowLimiter(RULES);
    let wait = 0;
    for (let i = 0; i < 301; i++) wait = limiter.check(req('/v1/me', `10.0.0.${i % 200}`, 'Bearer same'), 0);
    expect(wait).toBe(60);
    expect(limiter.check(req('/v1/me', '10.0.0.1', 'Bearer same'), 60_001)).toBe(0);
  });

  it('is strict on sign-in and account actions, and never limits webhooks or health', () => {
    const limiter = new FixedWindowLimiter(RULES);
    for (let i = 0; i < 30; i++) expect(limiter.check(req('/v1/identity/session', '5.5.5.5', `Bearer t${i}`, 'POST'), 0)).toBe(0);
    expect(limiter.check(req('/v1/identity/session', '5.5.5.5', 'Bearer new', 'POST'), 0)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) limiter.check(req('/v1/me/export', '7.7.7.7', 'Bearer x'), 0);
    expect(limiter.check(req('/v1/me/export', '7.7.7.7', 'Bearer x'), 0)).toBeGreaterThan(0);
    for (let i = 0; i < 2000; i++) expect(limiter.check(req('/v1/webhooks/razorpay', '8.8.8.8', undefined, 'POST'), 0)).toBe(0);
    expect(limiter.check(req('/health/ready', '8.8.8.8'), 0)).toBe(0);
  });

  it('lets the website server render pages past the network ceiling only with the right token', () => {
    const token = 'x'.repeat(40);
    const limiter = new FixedWindowLimiter(buildRules(token));
    const web = (t: string): Request => ({ method: 'GET', path: '/v1/exams', ip: '4.4.4.4', headers: { 'x-internal-caller': t } });
    let refused = 0;
    for (let i = 0; i < 2000; i++) refused += limiter.check(web(token), 0) > 0 ? 1 : 0;
    expect(refused).toBe(0);
    for (let i = 0; i < 1300; i++) refused += limiter.check(web('wrong-token'), 0) > 0 ? 1 : 0;
    expect(refused).toBeGreaterThan(0);
  });
});
