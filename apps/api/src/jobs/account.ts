import { createHash } from 'node:crypto';
import { DELETION_GRACE_DAYS } from '@exam-prep/contracts';
import type { Database } from '@exam-prep/db';
import type { PostHogCapture } from '../providers/analytics/posthog.js';
import type { FirebaseAdminIdentity } from '../providers/firebase/admin-identity.js';
import { enqueue, PermanentJobError, type JobHandler } from './runner.js';

/** Pseudonymous analytics id: a hash of the profile id, never an email or name. */
export const analyticsId = (profileId: string) => createHash('sha256').update(`exam-prep:${profileId}`).digest('hex').slice(0, 32);

/**
 * Finalizes account deletions whose grace period has passed (docs/SECURITY.md), then queues the
 * removal of each Firebase sign-in identity as its own retryable job.
 */
export function finalizeDeletionsHandler(db: Database): JobHandler {
  return async () => {
    const { rows } = await db.query<{ profile_id: string; firebase_uid: string }>('SELECT * FROM finalize_account_deletions(make_interval(days => $1))', [
      DELETION_GRACE_DAYS,
    ]);
    for (const r of rows) await enqueue(db, 'account.delete_identity', r.profile_id, { uid: r.firebase_uid });
  };
}

export function deleteIdentityHandler(firebase: FirebaseAdminIdentity | null): JobHandler {
  return async (job) => {
    const uid = job.payload['uid'];
    if (typeof uid !== 'string' || uid.length === 0) throw new PermanentJobError('missing uid');
    // Left as a failed job for ops to finish by hand (Firebase console) when not configured.
    if (!firebase) throw new PermanentJobError('FIREBASE_SERVICE_ACCOUNT_JSON is not set; delete this sign-in identity in the Firebase console');
    await firebase.deleteUser(uid);
  };
}

/** Server-confirmed purchase_confirmed event (docs/NOTIFICATIONS.md); a no-op without PostHog. */
export function purchaseAnalyticsHandler(db: Database, posthog: PostHogCapture | null): JobHandler {
  return async (job) => {
    if (!posthog) return;
    const { rows } = await db.query<{ student_id: string; item_type: string; total: number; channel: string }>(
      `SELECT student_id, item_type::text AS item_type, total_paid_paise AS total, payment_channel AS channel FROM purchases WHERE id = $1 AND status = 'captured'`,
      [job.payload['purchaseId']],
    );
    const r = rows[0];
    if (!r) return;
    await posthog.capture('purchase_confirmed', analyticsId(r.student_id), { amount_paise: r.total, item_type: r.item_type, channel: r.channel });
  };
}
