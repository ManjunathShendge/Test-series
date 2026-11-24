import { z } from 'zod';
import { parseServiceAccount } from '../providers/firebase/admin-identity.js';

const origin = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Expected an HTTP(S) origin without a path');
const databaseUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
    url.hostname !== '' &&
    url.pathname.length > 1
  );
}, 'Expected a postgresql:// URL with host and database name');
/** An empty `KEY=` line in .env means "not set". */
const blankAsUnset = <T extends z.ZodType>(inner: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), inner);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    PUBLIC_WEB_ORIGIN: origin,
    // Load balancers or proxies in front of the API, so rate limits see the real client address.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Shared with the website's server (never the browser): its page rendering skips the
    // per-network rate limit. A long random string, e.g. `openssl rand -base64 32`.
    INTERNAL_CALLER_TOKEN: blankAsUnset(z.string().trim().min(32).optional()),
    CORS_ORIGINS: z
      .string()
      .transform((s) => s.split(',').map((v) => v.trim()))
      .pipe(z.array(origin).min(1)),
    DATABASE_URL: databaseUrl,
    // Worker uses a session-mode connection (Supabase session pooler); defaults to DATABASE_URL.
    WORKER_DATABASE_URL: databaseUrl.optional(),
    DATABASE_CA_CERT_PATH: z.string().min(1).optional(),
    // Firebase ID tokens must be issued for this project (issuer and audience).
    FIREBASE_PROJECT_ID: z.string().regex(/^[a-z0-9-]{4,40}$/),
    // Test-only public JWKS (JSON) used instead of Google's keys, so integration and smoke
    // tests can sign their own tokens. Rejected outside NODE_ENV=test with APP_ENV=test.
    FIREBASE_TEST_JWKS: z.string().min(2).optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z
      .string()
      .regex(/^[\w.-]+:\d+$/)
      .optional(),
    STORAGE_ENDPOINT: z.string().trim().min(1).optional(),
    STORAGE_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    STORAGE_USE_SSL: z.enum(['true', 'false']).optional(),
    STORAGE_PUBLIC_ENDPOINT: z.string().trim().min(1).optional(),
    STORAGE_PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    STORAGE_PUBLIC_USE_SSL: z.enum(['true', 'false']).optional(),
    STORAGE_ACCESS_KEY: z.string().trim().min(1).optional(),
    STORAGE_SECRET_KEY: z.string().trim().min(1).optional(),
    STORAGE_REGION: z.string().trim().min(1).optional(),
    ANTIVIRUS_HOST: z.string().trim().min(1).optional(),
    ANTIVIRUS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    EXAMINER_AGREEMENT_VERSION: z.string().trim().min(1).max(100).optional(),
    EXAMINER_AGREEMENT_TEXT: z.string().trim().min(1).max(20_000).optional(),
    // Razorpay web checkout (PAYMENTS.md). Test keys (rzp_test_) everywhere except production.
    RAZORPAY_KEY_ID: blankAsUnset(z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/).optional()),
    RAZORPAY_KEY_SECRET: blankAsUnset(z.string().trim().min(8).optional()),
    RAZORPAY_WEBHOOK_SECRET: blankAsUnset(z.string().trim().min(8).optional()),
    // Prices include GST at this rate until the CA confirms it (DECISIONS O09).
    GST_RATE_PERCENT: z.coerce.number().min(0).max(28).default(18),
    // Seller details printed on invoices. Without a GSTIN the document is a receipt, not a tax invoice.
    SELLER_LEGAL_NAME: blankAsUnset(z.string().trim().min(2).max(200).optional()),
    SELLER_GSTIN: blankAsUnset(z.string().trim().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional()),
    SELLER_ADDRESS: blankAsUnset(z.string().trim().min(5).max(400).optional()),
    SUPPORT_EMAIL: blankAsUnset(z.email().optional()),
    // Notifications (docs/NOTIFICATIONS.md). Unset providers are skipped and logged, never fatal.
    // smtp://user:pass@host:587 or smtps://...:465 (Amazon SES SMTP works the same way).
    EMAIL_SMTP_URL: blankAsUnset(z.string().trim().regex(/^smtps?:\/\//).optional()),
    EMAIL_FROM: blankAsUnset(z.string().trim().min(3).max(200).optional()),
    // Optional Expo access token when "enhanced push security" is on for the Expo project.
    EXPO_ACCESS_TOKEN: blankAsUnset(z.string().trim().min(10).optional()),
    // Server-side PostHog capture (purchase_confirmed); project API key, not a personal key.
    POSTHOG_API_KEY: blankAsUnset(
      z.string().trim().regex(/^phc_\w{10,}$/, 'Expected a PostHog project API key (phc_...), not a personal key').optional(),
    ),
    POSTHOG_HOST: blankAsUnset(origin.optional()),
    // Firebase service account JSON (one line, or base64 of it): lets the worker delete the
    // sign-in identity of a deleted account. Without it the identity is left for manual removal.
    FIREBASE_SERVICE_ACCOUNT_JSON: blankAsUnset(z.string().trim().min(20).optional()),
    // AI suggestions for QC reviewers (QC_PIPELINE "AI boundary"). Off without a key; also off
    // per exam until an admin enables it. Prices are USD per million tokens: check the
    // provider's current price list for the chosen model before launch.
    LLM_API_KEY: blankAsUnset(z.string().trim().regex(/^sk-ant-[\w-]{20,}$/, 'Expected an Anthropic API key (sk-ant-...)').optional()),
    LLM_MODEL: z.string().trim().min(3).max(100).default('claude-opus-5'),
    LLM_PRICE_INPUT_PER_MTOK_USD: z.coerce.number().min(0).max(1000).default(5),
    LLM_PRICE_OUTPUT_PER_MTOK_USD: z.coerce.number().min(0).max(1000).default(25),
    AI_MONTHLY_CAP_USD: z.coerce.number().min(0).max(100_000).default(25),
  })
  .superRefine((env, ctx) => {
    const deployed =
      env.NODE_ENV === 'production' || ['staging', 'production'].includes(env.APP_ENV);
    if (deployed && env.FIREBASE_AUTH_EMULATOR_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_AUTH_EMULATOR_HOST'],
        message: 'Emulator is forbidden outside local/test development',
      });
    }
    if (
      ['staging', 'production'].includes(env.APP_ENV) &&
      (env.FIREBASE_PROJECT_ID?.startsWith('demo-') ||
        env.CORS_ORIGINS.some((s) => !s.startsWith('https://')))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Deployed environments require a real project and HTTPS origins',
      });
    }
    if (env.FIREBASE_TEST_JWKS && !(env.NODE_ENV === 'test' && env.APP_ENV === 'test')) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_TEST_JWKS'],
        message: 'Test signing keys are only allowed when NODE_ENV and APP_ENV are test',
      });
    }
    if (['staging', 'production'].includes(env.APP_ENV) && !env.DATABASE_CA_CERT_PATH) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_CA_CERT_PATH'],
        message: 'Deployed environments require verified database TLS',
      });
    }
    if (['staging', 'production'].includes(env.APP_ENV)) {
      for (const path of ['STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY']) {
        if (!env[path as keyof typeof env]) {
          ctx.addIssue({
            code: 'custom',
            path: [path],
            message: 'Deployed environments require object-storage credentials',
          });
        }
      }
      if (!env.STORAGE_PUBLIC_ENDPOINT) {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_PUBLIC_ENDPOINT'],
          message: 'Deployed examiner uploads require a browser-reachable object-storage endpoint',
        });
      }
      if (!env.EXAMINER_AGREEMENT_VERSION || !env.EXAMINER_AGREEMENT_TEXT) {
        ctx.addIssue({
          code: 'custom',
          path: ['EXAMINER_AGREEMENT_VERSION'],
          message:
            'Deployed environments require owner-approved examiner agreement text and version',
        });
      }
      if (!env.ANTIVIRUS_HOST || !env.ANTIVIRUS_PORT) {
        ctx.addIssue({
          code: 'custom',
          path: ['ANTIVIRUS_HOST'],
          message: 'Deployed environments require a malware scanner host and port',
        });
      }
    }
    if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET))
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_SECRET'],
        message: 'Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither',
      });
    if (env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && env.APP_ENV !== 'production')
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'Live Razorpay keys are allowed only in production; use rzp_test_ keys',
      });
    // Provider keys: a mistyped or half-set key fails here at boot, never at first use.
    // Messages name the variable only; values are never echoed.
    if (env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') && env.APP_ENV === 'production')
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'Production needs live Razorpay keys (rzp_live_); test keys take no real payments',
      });
    if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_WEBHOOK_SECRET && ['staging', 'production'].includes(env.APP_ENV))
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_WEBHOOK_SECRET'],
        message: 'Deployed Razorpay checkout needs the webhook secret so missed payments are still fulfilled',
      });
    if (Boolean(env.EMAIL_SMTP_URL) !== Boolean(env.EMAIL_FROM))
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'Set both EMAIL_SMTP_URL and EMAIL_FROM, or neither' });
    if (env.EMAIL_SMTP_URL && (!URL.canParse(env.EMAIL_SMTP_URL) || new URL(env.EMAIL_SMTP_URL).hostname === ''))
      ctx.addIssue({ code: 'custom', path: ['EMAIL_SMTP_URL'], message: 'Expected smtp://user:pass@host:port or smtps://...' });
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      let projectId: string | undefined;
      try {
        projectId = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
          message: 'Expected the service account JSON file contents (one line, or base64 of it)',
        });
      }
      if (projectId && projectId !== env.FIREBASE_PROJECT_ID)
        ctx.addIssue({
          code: 'custom',
          path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
          message: 'Service account belongs to a different Firebase project than FIREBASE_PROJECT_ID',
        });
    }
    if (env.API_PORT === env.WORKER_PORT)
      ctx.addIssue({
        code: 'custom',
        path: ['WORKER_PORT'],
        message: 'API and worker ports must differ',
      });
  });

export type Environment = z.infer<typeof schema>;
export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}
