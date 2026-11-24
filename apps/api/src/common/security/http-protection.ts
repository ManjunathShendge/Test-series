import { createHash, timingSafeEqual } from 'node:crypto';
import type { ApiErrorBody } from '@exam-prep/contracts';

/** The parts of Express's request and response used here (no direct express dependency). */
export interface Request {
  method: string;
  path: string;
  ip?: string | undefined;
  headers: { authorization?: string | undefined; 'x-internal-caller'?: string | string[] | undefined };
}
interface Response {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}
type NextFunction = () => void;

/**
 * First-line abuse protection for the HTTP API: per-instance fixed-window rate limits and
 * response security headers. Limits are generous enough for a classroom of students sharing
 * one network during a live test (each saves answers every few seconds); the per-network
 * ceiling stops floods, the per-sign-in ceiling stops one account hammering the API, and
 * sign-in and account actions get tighter limits. Provider webhooks and health checks are
 * never limited. Several API instances each keep their own counters, which only loosens the
 * limit; an edge or load-balancer limit can sit in front for distributed attacks.
 */

interface Rule {
  name: string;
  limit: number;
  windowMs: number;
  /** Returns the counter key, or null when the rule does not apply to this request. */
  key(req: Request): string | null;
}

const MINUTE = 60_000;
const MAX_KEYS = 100_000;
const tokenOf = (req: Request) => {
  const auth = req.headers.authorization;
  return auth ? createHash('sha256').update(auth).digest('base64url').slice(0, 22) : null;
};
const path = (req: Request) => req.path.replace(/\/+$/, '');

const sameSecret = (given: unknown, expected: string) => {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
};

/**
 * internalToken: the website's server renders pages from one address, so it identifies itself
 * (INTERNAL_CALLER_TOKEN, server-side only) and skips the per-network ceiling. Every other
 * rule still applies to it.
 */
export const buildRules = (internalToken?: string): Rule[] => [
  {
    name: 'network',
    limit: 1200,
    windowMs: MINUTE,
    key: (req) => (internalToken && sameSecret(req.headers['x-internal-caller'], internalToken) ? null : (req.ip ?? 'unknown')),
  },
  { name: 'signin', limit: 300, windowMs: MINUTE, key: (req) => tokenOf(req) },
  {
    name: 'session',
    limit: 30,
    windowMs: MINUTE,
    key: (req) => (req.method === 'POST' && path(req) === '/v1/identity/session' ? (req.ip ?? 'unknown') : null),
  },
  {
    name: 'account',
    limit: 10,
    windowMs: MINUTE,
    key: (req) => (/^\/v1\/me\/(deletion|export)$/.test(path(req)) ? `${req.ip ?? 'unknown'}:${tokenOf(req) ?? ''}` : null),
  },
];
export const RULES = buildRules();

const EXEMPT = /^\/(health\/|v1\/webhooks\/)/;

export class FixedWindowLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly rules: Rule[]) {}

  /** Seconds to wait when over a limit, otherwise 0. */
  check(req: Request, now = Date.now()): number {
    if (EXEMPT.test(req.path)) return 0;
    if (this.counters.size > MAX_KEYS) this.prune(now);
    let wait = 0;
    for (const rule of this.rules) {
      const k = rule.key(req);
      if (k === null) continue;
      const id = `${rule.name}:${k}`;
      let c = this.counters.get(id);
      if (!c || c.resetAt <= now) {
        c = { count: 0, resetAt: now + rule.windowMs };
        this.counters.set(id, c);
      }
      c.count += 1;
      if (c.count > rule.limit) wait = Math.max(wait, Math.ceil((c.resetAt - now) / 1000));
    }
    return wait;
  }

  private prune(now: number): void {
    for (const [id, c] of this.counters) if (c.resetAt <= now) this.counters.delete(id);
    // Still too many live keys (a spoofed-address flood): start over rather than grow unbounded.
    if (this.counters.size > MAX_KEYS) this.counters.clear();
  }
}

export function rateLimit(limiter = new FixedWindowLimiter(RULES)) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const wait = limiter.check(req);
    if (wait === 0) return next();
    const body: ApiErrorBody = { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } };
    res.setHeader('Retry-After', String(wait));
    res.status(429).json(body);
  };
}

/** JSON API only: nothing here is meant to render or be framed. */
export function securityHeaders(hsts: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
