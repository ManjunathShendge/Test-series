import type { Queryable } from '@exam-prep/db';

// India calendar days -> [start, end) instants.
const FROM = `($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`;
const TO = `($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`;
const PAID = `p.status IN ('captured', 'refunded') AND p.payment_channel <> 'admin_grant'`;

export interface CatalogueDbRow {
  id: string;
  title: string;
  slug: string;
  exam_name: string;
  examiner_name: string;
  status: string;
  published: boolean;
  featured: boolean;
  can_feature: boolean;
  price_paise: number;
  attempts: number;
  sales: number;
  published_at: Date | null;
}

export interface BannerRow {
  id: string;
  title: string;
  image_url: string;
  target_link: string;
  placement: 'web' | 'app' | 'both';
  exam_id: string | null;
  display_order: number;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
}

export interface AuditDbRow {
  id: string;
  created_at: Date;
  action_name: string;
  target_table: string;
  target_record_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
}

const BANNER_COLUMNS = 'id, title, image_url, target_link, placement, exam_id, display_order, is_active, starts_at, ends_at';

export const opsRepository = {
  // Catalogue --------------------------------------------------------------------------------
  async catalogueTests(db: Queryable, q: string | null, status: string): Promise<CatalogueDbRow[]> {
    const { rows } = await db.query<CatalogueDbRow>(
      `SELECT t.id, t.title, t.slug, e.name AS exam_name, ep.full_name AS examiner_name, t.status::text AS status,
              t.status IN ('live', 'scheduled') AS published, t.is_admin_featured_free AS featured,
              (t.access_type = 'free' AND t.status IN ('live', 'scheduled')) AS can_feature,
              t.price_paise, t.attempts_count AS attempts,
              (SELECT count(*)::int FROM purchases p WHERE p.test_id = t.id AND ${PAID}) AS sales, t.published_at
         FROM tests t JOIN exams e ON e.id = t.exam_id JOIN profiles ep ON ep.id = t.examiner_id
        WHERE t.status IN ('approved', 'scheduled', 'live', 'archived')
          AND ($1::text IS NULL OR t.title ILIKE '%' || $1 || '%' OR ep.full_name ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR ($2 = 'published') = (t.status IN ('live', 'scheduled')))
        ORDER BY t.published_at DESC NULLS LAST, t.title LIMIT 300`,
      [q, status],
    );
    return rows;
  },

  async catalogueSeries(db: Queryable, q: string | null, status: string): Promise<CatalogueDbRow[]> {
    const { rows } = await db.query<CatalogueDbRow>(
      `SELECT s.id, s.title, s.slug, e.name AS exam_name, ep.full_name AS examiner_name,
              CASE WHEN s.is_published THEN 'published' ELSE 'unpublished' END AS status,
              s.is_published AS published, s.is_featured AS featured, s.is_published AS can_feature, s.price_paise,
              (SELECT COALESCE(sum(t.attempts_count), 0)::int FROM tests t WHERE t.series_id = s.id) AS attempts,
              (SELECT count(*)::int FROM purchases p WHERE p.series_id = s.id AND ${PAID}) AS sales, NULL::timestamptz AS published_at
         FROM test_series s JOIN exams e ON e.id = s.exam_id JOIN profiles ep ON ep.id = s.examiner_id
        WHERE ($1::text IS NULL OR s.title ILIKE '%' || $1 || '%' OR ep.full_name ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR ($2 = 'published') = s.is_published)
        ORDER BY s.created_at DESC LIMIT 300`,
      [q, status],
    );
    return rows;
  },

  async testState(db: Queryable, id: string): Promise<{ status: string; access_type: string } | undefined> {
    const { rows } = await db.query<{ status: string; access_type: string }>('SELECT status::text AS status, access_type::text AS access_type FROM tests WHERE id = $1 FOR UPDATE', [id]);
    return rows[0];
  },

  async setTestFeatured(db: Queryable, id: string, featured: boolean): Promise<void> {
    await db.query('UPDATE tests SET is_admin_featured_free = $2 WHERE id = $1', [id, featured]);
  },

  async archiveTest(db: Queryable, id: string): Promise<void> {
    await db.query(`UPDATE tests SET status = 'archived', is_admin_featured_free = false WHERE id = $1`, [id]);
  },

  async seriesExists(db: Queryable, id: string): Promise<{ is_published: boolean } | undefined> {
    const { rows } = await db.query<{ is_published: boolean }>('SELECT is_published FROM test_series WHERE id = $1 FOR UPDATE', [id]);
    return rows[0];
  },

  async setSeries(db: Queryable, id: string, fields: { is_featured?: boolean; is_published?: boolean }): Promise<void> {
    await db.query(
      'UPDATE test_series SET is_featured = COALESCE($2, is_featured), is_published = COALESCE($3, is_published) WHERE id = $1',
      [id, fields.is_featured ?? null, fields.is_published ?? null],
    );
  },

  async writeAudit(db: Queryable, adminId: string, action: string, table: string, targetId: string, after: unknown): Promise<void> {
    await db.query(
      `INSERT INTO admin_audit_logs (admin_id, action_name, target_table, target_record_id, after_state) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [adminId, action, table, targetId, JSON.stringify(after)],
    );
  },

  // Banners ----------------------------------------------------------------------------------
  async banners(db: Queryable): Promise<BannerRow[]> {
    const { rows } = await db.query<BannerRow>(`SELECT ${BANNER_COLUMNS} FROM cms_banners ORDER BY display_order, created_at`);
    return rows;
  },

  /** What visitors see now; RLS also limits anonymous reads to banners on show. */
  async showingBanners(db: Queryable, placement: 'web' | 'app'): Promise<BannerRow[]> {
    const { rows } = await db.query<BannerRow>(
      `SELECT ${BANNER_COLUMNS} FROM cms_banners
        WHERE is_active AND placement IN ($1, 'both')
          AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
        ORDER BY display_order, created_at LIMIT 10`,
      [placement],
    );
    return rows;
  },

  async createBanner(db: Queryable, b: Omit<BannerRow, 'id'>): Promise<BannerRow> {
    const { rows } = await db.query<BannerRow>(
      `INSERT INTO cms_banners (title, image_url, target_link, placement, exam_id, display_order, is_active, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${BANNER_COLUMNS}`,
      [b.title, b.image_url, b.target_link, b.placement, b.exam_id, b.display_order, b.is_active, b.starts_at, b.ends_at],
    );
    return rows[0]!;
  },

  async updateBanner(db: Queryable, id: string, fields: Partial<Omit<BannerRow, 'id'>>): Promise<BannerRow | undefined> {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    const { rows } = await db.query<BannerRow>(
      `UPDATE cms_banners SET ${entries.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${BANNER_COLUMNS}`,
      [id, ...entries.map(([, v]) => v)],
    );
    return rows[0];
  },

  async deleteBanner(db: Queryable, id: string): Promise<boolean> {
    return (await db.query('DELETE FROM cms_banners WHERE id = $1', [id])).rowCount === 1;
  },

  // Reports ----------------------------------------------------------------------------------
  async salesTotals(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ orders: number; gross: number; discount: number; gst: number; net: number; refunds: number; refunded: number }>(
      `SELECT count(*) FILTER (WHERE p.captured_at >= ${FROM} AND p.captured_at < ${TO})::int AS orders,
              COALESCE(sum(p.gross_amount_paise) FILTER (WHERE p.captured_at >= ${FROM} AND p.captured_at < ${TO}), 0)::bigint AS gross,
              COALESCE(sum(p.discount_paise) FILTER (WHERE p.captured_at >= ${FROM} AND p.captured_at < ${TO}), 0)::bigint AS discount,
              COALESCE(sum(p.gst_amount_paise) FILTER (WHERE p.captured_at >= ${FROM} AND p.captured_at < ${TO}), 0)::bigint AS gst,
              COALESCE(sum(p.net_revenue_paise) FILTER (WHERE p.captured_at >= ${FROM} AND p.captured_at < ${TO}), 0)::bigint AS net,
              count(*) FILTER (WHERE p.refunded_at >= ${FROM} AND p.refunded_at < ${TO})::int AS refunds,
              COALESCE(sum(p.total_paid_paise) FILTER (WHERE p.refunded_at >= ${FROM} AND p.refunded_at < ${TO}), 0)::bigint AS refunded
         FROM purchases p WHERE ${PAID}`,
      [from, to],
    );
    return rows[0]!;
  },

  async salesByChannel(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ channel: string; orders: number; paid: number }>(
      `SELECT p.payment_channel AS channel, count(*)::int AS orders, sum(p.total_paid_paise)::bigint AS paid
         FROM purchases p WHERE ${PAID} AND p.captured_at >= ${FROM} AND p.captured_at < ${TO}
        GROUP BY 1 ORDER BY 3 DESC`,
      [from, to],
    );
    return rows;
  },

  async studentTotals(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ signups: number; active: number; paying: number }>(
      `SELECT (SELECT count(*)::int FROM profiles WHERE created_at >= ${FROM} AND created_at < ${TO} AND 'student' = ANY(roles) AND deleted_at IS NULL) AS signups,
              (SELECT count(DISTINCT student_id)::int FROM student_attempts WHERE started_at >= ${FROM} AND started_at < ${TO}) AS active,
              (SELECT count(DISTINCT p.student_id)::int FROM purchases p WHERE ${PAID} AND p.captured_at >= ${FROM} AND p.captured_at < ${TO}) AS paying`,
      [from, to],
    );
    return rows[0]!;
  },

  async attemptTotals(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ started: number; finished: number; free: number }>(
      `SELECT count(*) FILTER (WHERE a.started_at >= ${FROM} AND a.started_at < ${TO})::int AS started,
              count(*) FILTER (WHERE a.submitted_at >= ${FROM} AND a.submitted_at < ${TO} AND a.status IN ('submitted', 'timed_out'))::int AS finished,
              count(*) FILTER (WHERE a.started_at >= ${FROM} AND a.started_at < ${TO} AND t.access_type = 'free')::int AS free
         FROM student_attempts a JOIN tests t ON t.id = a.test_id`,
      [from, to],
    );
    return rows[0]!;
  },

  async qcTotals(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ decided: number; pending: number; avg_hours: string | null; open_reports: number }>(
      `SELECT count(*) FILTER (WHERE completed_at >= ${FROM} AND completed_at < ${TO} AND NOT is_second_spot_check)::int AS decided,
              count(*) FILTER (WHERE completed_at IS NULL)::int AS pending,
              round((avg(extract(epoch FROM completed_at - created_at)) FILTER (WHERE completed_at >= ${FROM} AND completed_at < ${TO} AND NOT is_second_spot_check) / 3600)::numeric, 1)::text AS avg_hours,
              (SELECT count(*)::int FROM question_reports WHERE status = 'open') AS open_reports
         FROM qc_reviews`,
      [from, to],
    );
    return rows[0]!;
  },

  async topTests(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ id: string; title: string; attempts: number; sales: number; revenue: number }>(
      `WITH a AS (SELECT test_id, count(*)::int AS n FROM student_attempts WHERE started_at >= ${FROM} AND started_at < ${TO} GROUP BY 1),
            s AS (SELECT p.test_id, count(*)::int AS n, sum(p.total_paid_paise)::bigint AS paid FROM purchases p
                   WHERE ${PAID} AND p.test_id IS NOT NULL AND p.captured_at >= ${FROM} AND p.captured_at < ${TO} GROUP BY 1)
       SELECT t.id, t.title, COALESCE(a.n, 0) AS attempts, COALESCE(s.n, 0) AS sales, COALESCE(s.paid, 0) AS revenue
         FROM tests t LEFT JOIN a ON a.test_id = t.id LEFT JOIN s ON s.test_id = t.id
        WHERE a.n IS NOT NULL OR s.n IS NOT NULL
        ORDER BY COALESCE(a.n, 0) + COALESCE(s.n, 0) * 5 DESC, t.title LIMIT 10`,
      [from, to],
    );
    return rows;
  },

  async daily(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<{ day: string; orders: number; paid: number; attempts: number; signups: number }>(
      `WITH days AS (SELECT d::date AS day FROM generate_series($1::date, $2::date, interval '1 day') d)
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM purchases p WHERE ${PAID} AND (p.captured_at AT TIME ZONE 'Asia/Kolkata')::date = days.day) AS orders,
              (SELECT COALESCE(sum(p.total_paid_paise), 0)::bigint FROM purchases p WHERE ${PAID} AND (p.captured_at AT TIME ZONE 'Asia/Kolkata')::date = days.day) AS paid,
              (SELECT count(*)::int FROM student_attempts a WHERE (a.started_at AT TIME ZONE 'Asia/Kolkata')::date = days.day) AS attempts,
              (SELECT count(*)::int FROM profiles pr WHERE (pr.created_at AT TIME ZONE 'Asia/Kolkata')::date = days.day AND 'student' = ANY(pr.roles)) AS signups
         FROM days ORDER BY days.day`,
      [from, to],
    );
    return rows;
  },

  /** Line-level exports for finance and ops; no personal data beyond the internal ids. */
  async salesExport(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<Record<string, string | number | null>>(
      `SELECT p.invoice_number, to_char(p.captured_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS captured_ist, p.item_type::text AS item_type,
              COALESCE(t.title, s.title) AS item, p.payment_channel AS channel, p.gross_amount_paise, p.discount_paise, p.taxable_amount_paise,
              p.gst_amount_paise, p.total_paid_paise, p.net_revenue_paise, p.status::text AS status,
              to_char(p.refunded_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS refunded_ist
         FROM purchases p LEFT JOIN tests t ON t.id = p.test_id LEFT JOIN test_series s ON s.id = p.series_id
        WHERE ${PAID} AND p.captured_at >= ${FROM} AND p.captured_at < ${TO}
        ORDER BY p.captured_at`,
      [from, to],
    );
    return rows;
  },

  async attemptsExport(db: Queryable, from: string, to: string) {
    const { rows } = await db.query<Record<string, string | number | null>>(
      `SELECT a.id AS attempt_id, t.title AS test, a.attempt_number, a.status::text AS status,
              to_char(a.started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS started_ist,
              to_char(a.submitted_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS submitted_ist,
              a.total_questions, a.attempted_count, a.correct_count, a.total_score::text AS score
         FROM student_attempts a JOIN tests t ON t.id = a.test_id
        WHERE a.started_at >= ${FROM} AND a.started_at < ${TO}
        ORDER BY a.started_at LIMIT 100000`,
      [from, to],
    );
    return rows;
  },

  // Audit ------------------------------------------------------------------------------------
  async audit(
    db: Queryable,
    f: { table: string | null; action: string | null; actor: string | null; before: { at: string; id: string } | null; limit: number },
  ): Promise<AuditDbRow[]> {
    const { rows } = await db.query<AuditDbRow>(
      `SELECT l.id, l.created_at, l.action_name, l.target_table, l.target_record_id,
              p.id AS actor_id, p.full_name AS actor_name, p.email AS actor_email, l.before_state, l.after_state
         FROM admin_audit_logs l JOIN profiles p ON p.id = l.admin_id
        WHERE ($1::text IS NULL OR l.target_table = $1)
          AND ($2::text IS NULL OR l.action_name ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR p.full_name ILIKE '%' || $3 || '%' OR p.email ILIKE '%' || $3 || '%')
          AND ($4::timestamptz IS NULL OR (l.created_at, l.id) < ($4::timestamptz, $5::uuid))
        ORDER BY l.created_at DESC, l.id DESC LIMIT $6`,
      [f.table, f.action, f.actor, f.before?.at ?? null, f.before?.id ?? null, f.limit + 1],
    );
    return rows;
  },
};
