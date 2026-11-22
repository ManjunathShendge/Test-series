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
  is_blocked: boolean;
  deleted_at: Date | null;
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
  'id, email, full_name, preferred_language, preparation_stage, is_age_verified_18_plus, target_exam_ids, roles::text[] AS roles, is_blocked, deleted_at';
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
};
