import type { Queryable } from '@exam-prep/db';

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string;
  preferred_language: 'en' | 'hi';
  preparation_stage: string | null;
  is_age_verified_18_plus: boolean;
  target_exam_ids: string[] | null;
  roles: string[];
  is_ops_admin: boolean;
  is_finance_admin: boolean;
  is_super_admin: boolean;
  is_blocked: boolean;
  deleted_at: Date | null;
  deletion_requested_at: Date | null;
}

export interface AccessRow {
  id: string;
  roles: string[];
  is_ops_admin: boolean;
  is_finance_admin: boolean;
  is_super_admin: boolean;
}

export interface DeviceRow {
  id: string;
  device_name: string | null;
  platform: 'android' | 'ios' | 'web';
  is_active: boolean;
  last_active_at: Date;
}

const PROFILE_COLUMNS =
  'id, email, full_name, preferred_language, preparation_stage, is_age_verified_18_plus, target_exam_ids, roles::text[] AS roles, is_ops_admin, is_finance_admin, is_super_admin, is_blocked, deleted_at, deletion_requested_at';
const DEVICE_COLUMNS = 'id, device_name, platform, is_active, last_active_at';

/** Parameterised SQL only. Authorization is decided by the service, with RLS as a second barrier. */
export const identityRepository = {
  /** Finds or creates the profile for a verified Firebase uid (runs before a user context exists). */
  async ensureProfile(db: Queryable, uid: string, email: string | null, name: string | null): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      'SELECT ensure_profile_for_firebase_user($1, $2, $3) AS id',
      [uid, email, name],
    );
    return rows[0]!.id;
  },

  async getProfile(db: Queryable, id: string): Promise<ProfileRow | undefined> {
    const { rows } = await db.query<ProfileRow>(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1`, [id]);
    return rows[0];
  },

  async getAccess(db: Queryable, id: string): Promise<AccessRow | undefined> {
    const { rows } = await db.query<AccessRow>(
      'SELECT id, roles::text[] AS roles, is_ops_admin, is_finance_admin, is_super_admin FROM profiles WHERE id = $1',
      [id],
    );
    return rows[0];
  },

  async updateProfile(
    db: Queryable,
    id: string,
    fields: { full_name?: string; preferred_language?: string; preparation_stage?: string; target_exam_ids?: string[] },
  ): Promise<ProfileRow> {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    const assignments = entries.map(([column], i) => `${column} = $${i + 2}`).join(', ');
    const { rows } = await db.query<ProfileRow>(
      `UPDATE profiles SET ${assignments} WHERE id = $1 RETURNING ${PROFILE_COLUMNS}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return rows[0]!;
  },

  /** Records the 18+ confirmation once; a later confirmation keeps the first time. */
  async confirmAge(db: Queryable, id: string): Promise<void> {
    await db.query(
      'UPDATE profiles SET is_age_verified_18_plus = true, age_confirmed_at = COALESCE(age_confirmed_at, now()) WHERE id = $1 AND NOT is_age_verified_18_plus',
      [id],
    );
  },

  async countActiveExams(db: Queryable, ids: string[]): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM exams WHERE id = ANY($1::uuid[]) AND is_active',
      [ids],
    );
    return rows[0]!.n;
  },

  async findDevice(db: Queryable, userId: string, deviceId: string): Promise<DeviceRow | undefined> {
    const { rows } = await db.query<DeviceRow>(
      `SELECT ${DEVICE_COLUMNS} FROM user_devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    return rows[0];
  },

  /** The device id is server-issued (DECISIONS E19) and doubles as the stored fingerprint. */
  async createDevice(db: Queryable, userId: string, name: string, platform: string): Promise<DeviceRow> {
    const { rows } = await db.query<DeviceRow>(
      `INSERT INTO user_devices (id, user_id, device_fingerprint, device_name, platform)
       SELECT id, $1, id::text, $2, $3 FROM (SELECT gen_random_uuid() AS id) issued
       RETURNING ${DEVICE_COLUMNS}`,
      [userId, name, platform],
    );
    return rows[0]!;
  },

  async activateDevice(db: Queryable, userId: string, deviceId: string, name: string): Promise<DeviceRow> {
    const { rows } = await db.query<DeviceRow>(
      `UPDATE user_devices SET is_active = true, device_name = $3, last_active_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING ${DEVICE_COLUMNS}`,
      [deviceId, userId, name],
    );
    return rows[0]!;
  },

  async listDevices(db: Queryable, userId: string, activeOnly = false): Promise<DeviceRow[]> {
    const { rows } = await db.query<DeviceRow>(
      `SELECT ${DEVICE_COLUMNS} FROM user_devices WHERE user_id = $1 ${activeOnly ? 'AND is_active' : ''}
       ORDER BY is_active DESC, last_active_at DESC`,
      [userId],
    );
    return rows;
  },

  /** Revokes a device and forgets its push token; returns false when it is not the user's. */
  async deactivateDevice(db: Queryable, userId: string, deviceId: string): Promise<boolean> {
    const result = await db.query(
      'UPDATE user_devices SET is_active = false, expo_push_token = NULL WHERE id = $1 AND user_id = $2',
      [deviceId, userId],
    );
    return result.rowCount === 1;
  },

  /** Starts (or keeps) a deletion request; an existing request keeps its original time. */
  async requestDeletion(db: Queryable, id: string): Promise<Date> {
    const { rows } = await db.query<{ at: Date }>(
      `UPDATE profiles SET deletion_requested_at = COALESCE(deletion_requested_at, NOW())
        WHERE id = $1 AND deleted_at IS NULL RETURNING deletion_requested_at AS at`,
      [id],
    );
    return rows[0]!.at;
  },

  async cancelDeletion(db: Queryable, id: string): Promise<void> {
    await db.query('UPDATE profiles SET deletion_requested_at = NULL WHERE id = $1 AND deleted_at IS NULL', [id]);
  },

  /** The account's own records for a data export. Every query is scoped to the student. */
  async exportData(db: Queryable, id: string) {
    const all = async (sql: string) => (await db.query<Record<string, unknown>>(sql, [id])).rows;
    const [profile] = await all(
      `SELECT id, email, phone, full_name, preferred_language, preparation_stage, target_exam_ids,
              is_age_verified_18_plus, deletion_requested_at, created_at, updated_at
         FROM profiles WHERE id = $1`,
    );
    return {
      profile: profile ?? {},
      devices: await all(
        'SELECT id, device_name, platform, is_active, last_active_at, created_at FROM user_devices WHERE user_id = $1 ORDER BY created_at',
      ),
      follows: await all('SELECT examiner_id, created_at FROM examiner_followers WHERE student_id = $1 ORDER BY created_at'),
      attempts: await all(
        `SELECT a.id, t.title AS test_title, a.attempt_number, a.status, a.started_at, a.submitted_at,
                a.total_questions, a.attempted_count, a.correct_count, a.incorrect_count, a.skipped_count,
                a.total_score, a.rank, a.percentile
           FROM student_attempts a JOIN tests t ON t.id = a.test_id
          WHERE a.student_id = $1 ORDER BY a.started_at`,
      ),
      savedQuestions: await all(
        `SELECT question_id, test_id, is_bookmarked, is_in_mistake_notebook, last_wrong_at, created_at
           FROM student_saved_questions WHERE student_id = $1 ORDER BY created_at`,
      ),
      reports: await all(
        `SELECT id, question_id, attempt_id, reason, student_comment, status, examiner_response, resolved_at, created_at
           FROM question_reports WHERE student_id = $1 ORDER BY created_at`,
      ),
      purchases: await all(
        `SELECT id, invoice_number, item_type, test_id, series_id, pass_plan_id, gross_amount_paise, discount_paise,
                gst_amount_paise, total_paid_paise, payment_channel, status, refunded_at, created_at, captured_at
           FROM purchases WHERE student_id = $1 ORDER BY created_at`,
      ),
    };
  },

  /** Stores (or clears) the Expo push token of one of the user's active devices. */
  async setPushToken(db: Queryable, userId: string, deviceId: string, token: string | null): Promise<boolean> {
    // A token belongs to one device: drop it from any other device row of this user first.
    if (token) await db.query('UPDATE user_devices SET expo_push_token = NULL WHERE user_id = $1 AND expo_push_token = $2 AND id <> $3', [userId, token, deviceId]);
    const result = await db.query('UPDATE user_devices SET expo_push_token = $3 WHERE id = $1 AND user_id = $2 AND is_active', [deviceId, userId, token]);
    return result.rowCount === 1;
  },

  async notificationPrefs(db: Queryable, id: string): Promise<Record<string, unknown>> {
    const { rows } = await db.query<{ prefs: Record<string, unknown> }>('SELECT notification_prefs AS prefs FROM profiles WHERE id = $1', [id]);
    return rows[0]?.prefs ?? {};
  },

  async setNotificationPrefs(db: Queryable, id: string, prefs: Record<string, boolean>): Promise<void> {
    await db.query('UPDATE profiles SET notification_prefs = notification_prefs || $2::jsonb WHERE id = $1', [id, JSON.stringify(prefs)]);
  },
};
