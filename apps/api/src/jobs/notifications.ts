import { NotificationKind } from '@exam-prep/contracts';
import type { Database } from '@exam-prep/db';
import type { SmtpEmail } from '../providers/email/smtp-email.js';
import type { ExpoPush, PushMessage } from '../providers/push/expo-push.js';
import { PermanentJobError, type Job, type JobHandler } from './runner.js';
import { emailCopy, pushCopy, type Lang } from './templates.js';

export interface NotifierDeps {
  db: Database;
  push: ExpoPush | null;
  email: SmtpEmail | null;
  webOrigin: string;
  brand: string;
}

interface PushTarget {
  userId: string;
  lang: Lang;
  title: string;
  body: string;
  path: string;
}
interface EmailTarget {
  userId: string;
  to: string | null;
  subject: string;
  text: string;
  html: string;
}

// Recipients must be live accounts; optional notices also respect the student's preference.
const LIVE = 'p.deleted_at IS NULL AND NOT p.is_blocked';
const pref = (key: string) => `COALESCE((p.notification_prefs->>'${key}')::boolean, true)`;
const lang = (v: unknown): Lang => (v === 'hi' ? 'hi' : 'en');
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const REASON: Record<string, string> = {
  wrong_answer: 'wrong answer key',
  ambiguous: 'ambiguous question',
  out_of_syllabus: 'out of syllabus',
  duplicate: 'duplicate',
  translation_error: 'translation error',
};

/**
 * Delivers one notice job (docs/NOTIFICATIONS.md): resolves recipients at send time (so a
 * cancelled or finished state is respected), records one delivery per recipient and channel,
 * and sends through the configured providers. Deliveries already sent are never repeated, so
 * a retried job only sends what failed.
 */
export function notificationHandler(deps: NotifierDeps): JobHandler {
  const { db, webOrigin, brand } = deps;
  const url = (path: string) => `${webOrigin}${path}`;

  async function resolve(job: Job): Promise<{ kind: NotificationKind; push: PushTarget[]; email: EmailTarget[] }> {
    const parsed = NotificationKind.safeParse(job.payload['kind']);
    if (!parsed.success) throw new PermanentJobError('unknown notification kind');
    const kind = parsed.data;
    const id = (key: string) => {
      const value = job.payload[key];
      if (typeof value !== 'string') throw new PermanentJobError(`missing ${key}`);
      return value;
    };
    const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0];
    const none = { kind, push: [], email: [] };

    switch (kind) {
      case 'result_ready':
      case 'unfinished_attempt': {
        const running = kind === 'unfinished_attempt';
        const r = await one<{ user_id: string; lang: string; title: string }>(
          `SELECT a.student_id AS user_id, p.preferred_language AS lang, t.title
             FROM student_attempts a JOIN tests t ON t.id = a.test_id JOIN profiles p ON p.id = a.student_id
            WHERE a.id = $1 AND ${LIVE} AND ${
              running ? `a.status = 'in_progress' AND a.server_expires_at > NOW() AND ${pref('unfinishedAttempt')}` : `a.status IN ('submitted', 'timed_out')`
            }`,
          [id('attemptId')],
        );
        if (!r) return none;
        const copy = pushCopy(kind, lang(r.lang), { test: r.title });
        const path = running ? `/attempt/${id('attemptId')}` : `/attempt/${id('attemptId')}/summary`;
        return { kind, push: [{ userId: r.user_id, lang: lang(r.lang), ...copy, path }], email: [] };
      }
      case 'followed_new_test': {
        const testId = id('testId');
        const { rows } = await db.query<{ user_id: string; lang: string; title: string; examiner: string }>(
          `SELECT p.id AS user_id, p.preferred_language AS lang, t.title, ep.full_name AS examiner
             FROM tests t
             JOIN profiles ep ON ep.id = t.examiner_id
             JOIN examiner_followers f ON f.examiner_id = t.examiner_id
             JOIN profiles p ON p.id = f.student_id
            WHERE t.id = $1 AND t.status = 'live' AND ${LIVE} AND ${pref('newTestsFromFollowed')}`,
          [testId],
        );
        return {
          kind,
          push: rows.map((r) => ({ userId: r.user_id, lang: lang(r.lang), ...pushCopy(kind, lang(r.lang), { test: r.title, examiner: r.examiner }), path: `/test/${testId}` })),
          email: [],
        };
      }
      case 'exam_date_changed': {
        const examId = id('examId');
        const { rows } = await db.query<{ user_id: string; lang: string; exam: string }>(
          `SELECT p.id AS user_id, p.preferred_language AS lang, e.name AS exam
             FROM exams e JOIN profiles p ON e.id = ANY(p.target_exam_ids)
            WHERE e.id = $1 AND e.is_active AND ${LIVE} AND ${pref('examDateChanges')}`,
          [examId],
        );
        return {
          kind,
          push: rows.map((r) => ({ userId: r.user_id, lang: lang(r.lang), ...pushCopy(kind, lang(r.lang), { exam: r.exam }), path: `/exam/${examId}` })),
          email: [],
        };
      }
      case 'qc_verdict': {
        const testId = id('testId');
        const r = await one<{ user_id: string; email: string | null; name: string; title: string }>(
          `SELECT p.id AS user_id, p.email, p.full_name AS name, t.title FROM tests t JOIN profiles p ON p.id = t.examiner_id WHERE t.id = $1 AND ${LIVE}`,
          [testId],
        );
        if (!r) return none;
        const copy = emailCopy(kind, { name: r.name, test: r.title, verdict: String(job.payload['verdict']), url: url(`/examiner/tests/${testId}`) }, brand);
        return { kind, push: [], email: [{ userId: r.user_id, to: r.email, ...copy }] };
      }
      case 'student_report': {
        const r = await one<{ user_id: string; email: string | null; name: string; title: string; reason: string }>(
          `SELECT p.id AS user_id, p.email, p.full_name AS name, COALESCE(t.title, 'your test') AS title, qr.reason::text AS reason
             FROM question_reports qr JOIN questions q ON q.id = qr.question_id JOIN profiles p ON p.id = q.examiner_id
             LEFT JOIN tests t ON t.id = qr.test_id
            WHERE qr.id = $1 AND ${LIVE}`,
          [id('reportId')],
        );
        if (!r) return none;
        const copy = emailCopy(kind, { name: r.name, test: r.title, reason: REASON[r.reason] ?? r.reason, url: url('/examiner/reports') }, brand);
        return { kind, push: [], email: [{ userId: r.user_id, to: r.email, ...copy }] };
      }
      case 'payout_paid': {
        const r = await one<{ user_id: string; email: string | null; name: string; month: Date; net: number; ref: string | null }>(
          `SELECT p.id AS user_id, p.email, p.full_name AS name, x.payout_month AS month, x.net_payable_paise AS net, x.bank_transfer_ref AS ref
             FROM examiner_payouts x JOIN profiles p ON p.id = x.examiner_id WHERE x.id = $1 AND x.status = 'paid' AND ${LIVE}`,
          [id('payoutId')],
        );
        if (!r) return none;
        const month = r.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const copy = emailCopy(kind, { name: r.name, month, amount: rupees(r.net), ref: r.ref ?? '', url: url('/examiner/earnings') }, brand);
        return { kind, push: [], email: [{ userId: r.user_id, to: r.email, ...copy }] };
      }
      case 'receipt_ready': {
        const r = await one<{ user_id: string; email: string | null; name: string; item: string; total: number }>(
          `SELECT p.id AS user_id, p.email, p.full_name AS name, COALESCE(t.title, s.title, 'your purchase') AS item, x.total_paid_paise AS total
             FROM purchases x JOIN profiles p ON p.id = x.student_id
             LEFT JOIN tests t ON t.id = x.test_id LEFT JOIN test_series s ON s.id = x.series_id
            WHERE x.id = $1 AND x.status = 'captured' AND ${LIVE}`,
          [id('purchaseId')],
        );
        if (!r) return none;
        const copy = emailCopy(kind, { name: r.name, item: r.item, amount: rupees(r.total), url: url('/account') }, brand);
        return { kind, push: [], email: [{ userId: r.user_id, to: r.email, ...copy }] };
      }
    }
  }

  /** Records the delivery; returns false when it was already sent or skipped. */
  async function open(userId: string, kind: string, channel: 'push' | 'email', key: string): Promise<boolean> {
    const { rows } = await db.query<{ status: string }>(
      `INSERT INTO notification_deliveries (user_id, kind, channel, dedupe_key) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, channel, dedupe_key) DO UPDATE SET kind = EXCLUDED.kind RETURNING status`,
      [userId, kind, channel, key],
    );
    return rows[0]?.status === 'queued' || rows[0]?.status === 'failed';
  }

  const close = (userId: string, channel: string, key: string, status: 'sent' | 'skipped' | 'failed', detail: string | null, ref: string | null = null) =>
    db.query(
      `UPDATE notification_deliveries SET status = $4, detail = $5, provider_ref = $6, sent_at = CASE WHEN $4 = 'sent' THEN NOW() ELSE sent_at END
        WHERE user_id = $1 AND channel = $2 AND dedupe_key = $3`,
      [userId, channel, key, status, detail, ref],
    );

  return async (job) => {
    const { kind, push, email } = await resolve(job);
    const key = `job:${job.id}`;
    let retry: string | null = null;

    // Push: every active device with a token, batched 100 messages per request.
    const pending: { target: PushTarget; tokens: string[] }[] = [];
    for (const target of push) {
      if (!(await open(target.userId, kind, 'push', key))) continue;
      const { rows } = await db.query<{ token: string }>(
        'SELECT expo_push_token AS token FROM user_devices WHERE user_id = $1 AND is_active AND expo_push_token IS NOT NULL',
        [target.userId],
      );
      if (!deps.push) await close(target.userId, 'push', key, 'skipped', 'push not configured');
      else if (rows.length === 0) await close(target.userId, 'push', key, 'skipped', 'no registered device');
      else pending.push({ target, tokens: rows.map((r) => r.token) });
    }
    const messages: { owner: PushTarget; msg: PushMessage }[] = pending.flatMap(({ target, tokens }) =>
      tokens.map((to) => ({ owner: target, msg: { to, title: target.title, body: target.body, data: { path: target.path } } })),
    );
    const outcome = new Map<string, { ok: string[]; errors: string[] }>();
    for (let i = 0; i < messages.length && deps.push; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const results = await deps.push.send(chunk.map((c) => c.msg));
        for (const [n, result] of results.entries()) {
          const { owner, msg } = chunk[n]!;
          const o = outcome.get(owner.userId) ?? { ok: [], errors: [] };
          if (result.ok) o.ok.push(result.ticketId);
          else {
            o.errors.push(result.error);
            if (result.tokenInvalid) await db.query('UPDATE user_devices SET expo_push_token = NULL WHERE expo_push_token = $1', [msg.to]);
          }
          outcome.set(owner.userId, o);
        }
      } catch (error) {
        retry = error instanceof Error ? error.message : 'push transport error';
        for (const c of chunk) outcome.set(c.owner.userId, { ok: [], errors: [retry] });
      }
    }
    for (const [userId, o] of outcome) {
      if (o.ok.length) await close(userId, 'push', key, 'sent', null, o.ok.join(',').slice(0, 500));
      else await close(userId, 'push', key, o.errors.every((e) => e === 'DeviceNotRegistered') ? 'skipped' : 'failed', o.errors.join(', ').slice(0, 300));
    }

    // Email
    for (const target of email) {
      if (!(await open(target.userId, kind, 'email', key))) continue;
      if (!deps.email) {
        await close(target.userId, 'email', key, 'skipped', 'email not configured');
        continue;
      }
      if (!target.to) {
        await close(target.userId, 'email', key, 'skipped', 'no email address');
        continue;
      }
      try {
        const ref = await deps.email.send({ to: target.to, subject: target.subject, text: target.text, html: target.html });
        await close(target.userId, 'email', key, 'sent', null, ref);
      } catch (error) {
        retry = error instanceof Error ? error.message : 'email error';
        await close(target.userId, 'email', key, 'failed', retry.slice(0, 300));
      }
    }

    // Provider trouble: the job retries with backoff and sends only what has not gone out yet.
    if (retry) throw new Error(retry);
  };
}
