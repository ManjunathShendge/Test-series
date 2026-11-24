import 'reflect-metadata';
import { createServer } from 'node:http';
import { checkDatabase, createDatabase } from '@exam-prep/db';
import { parseEnvironment } from './config/env.js';
import { checkQuestionHandler, checkTestHandler } from './jobs/ai-checks.js';
import { deleteIdentityHandler, finalizeDeletionsHandler, purchaseAnalyticsHandler } from './jobs/account.js';
import { notificationHandler } from './jobs/notifications.js';
import { enqueue, JobRunner } from './jobs/runner.js';
import { PostHogCapture } from './providers/analytics/posthog.js';
import { SmtpEmail } from './providers/email/smtp-email.js';
import { FirebaseAdminIdentity, parseServiceAccount } from './providers/firebase/admin-identity.js';
import { AnthropicLlm } from './providers/llm/anthropic.js';
import { ExpoPush } from './providers/push/expo-push.js';

const env = parseEnvironment(process.env);
const database = createDatabase(env.WORKER_DATABASE_URL ?? env.DATABASE_URL, {
  caCertPath: env.DATABASE_CA_CERT_PATH,
  max: 4,
});

// Providers are optional: anything not configured is skipped and recorded, never fatal.
const email = env.EMAIL_SMTP_URL && env.EMAIL_FROM ? new SmtpEmail(env.EMAIL_SMTP_URL, env.EMAIL_FROM) : null;
const push = new ExpoPush(env.EXPO_ACCESS_TOKEN);
const posthog = env.POSTHOG_API_KEY ? new PostHogCapture(env.POSTHOG_API_KEY, env.POSTHOG_HOST) : null;
const llm = env.LLM_API_KEY ? new AnthropicLlm(env.LLM_API_KEY, env.LLM_MODEL) : null;
const firebase = env.FIREBASE_SERVICE_ACCOUNT_JSON ? new FirebaseAdminIdentity(parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON)) : null;

const runner = new JobRunner(database, {
  notify: notificationHandler({ db: database, push, email, webOrigin: env.PUBLIC_WEB_ORIGIN, brand: env.SELLER_LEGAL_NAME ?? 'MakeMePrepare' }),
  analytics: purchaseAnalyticsHandler(database, posthog),
  'account.finalize_deletions': finalizeDeletionsHandler(database),
  'account.delete_identity': deleteIdentityHandler(firebase),
  'ai.check_test': checkTestHandler(database, llm !== null),
  'ai.check_question': checkQuestionHandler({
    db: database,
    llm,
    priceInPerMTok: env.LLM_PRICE_INPUT_PER_MTOK_USD,
    priceOutPerMTok: env.LLM_PRICE_OUTPUT_PER_MTOK_USD,
    monthlyCapUsd: env.AI_MONTHLY_CAP_USD,
  }),
});

/** Periodic work is queued like any job; the hourly key keeps several workers from doubling it. */
async function schedule(): Promise<void> {
  const hour = new Date().toISOString().slice(0, 13);
  await enqueue(database, 'account.finalize_deletions', hour, {});
}

let ready = false;
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health/live') {
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url !== '/health/ready') {
    response.writeHead(404).end(JSON.stringify({ status: 'not_found' }));
    return;
  }
  try {
    if (!ready) throw new Error('Starting or stopping');
    await checkDatabase(database);
    await database.query('SELECT id FROM jobs LIMIT 1');
    response.end(JSON.stringify({ status: 'ok', checks: { database: 'ok', queue: 'ok' } }));
  } catch {
    response.writeHead(503).end(JSON.stringify({ status: 'unavailable' }));
  }
});
server.listen(env.WORKER_PORT);

let stopping = false;
let timer: NodeJS.Timeout | undefined;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  ready = false;
  clearInterval(timer);
  server.close();
  await runner.stop();
  await database.end();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await checkDatabase(database);
  await database.query('SELECT id FROM jobs LIMIT 1');
  if (email) await email.verify().catch((e: unknown) => console.error(`Email provider check failed: ${e instanceof Error ? e.message : String(e)}`));
  await schedule();
  timer = setInterval(() => void schedule().catch(() => undefined), 15 * 60_000);
  runner.start();
  ready = true;
  console.log(
    `Worker ready on port ${env.WORKER_PORT}; email ${email ? 'on' : 'off'}, analytics ${posthog ? 'on' : 'off'}, identity deletion ${firebase ? 'on' : 'off'}, AI ${llm ? `on (${env.LLM_MODEL})` : 'off'}`,
  );
} catch {
  console.error('Worker startup failed: check database connectivity and migrations');
  await stop();
  process.exitCode = 1;
}
