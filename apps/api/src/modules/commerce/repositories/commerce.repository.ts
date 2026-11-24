import type { Queryable } from '@exam-prep/db';

const SAME_VERSION = (column: string, param: string) =>
  `abs(extract(epoch FROM ${column} - ${param}::timestamptz)) < 0.001`;

/** Names this transaction's audit rows (audit_privileged_change reads app.audit_action). */
export async function auditAction(db: Queryable, action: string): Promise<void> {
  await db.query("SELECT set_config('app.audit_action', $1, true)", [action]);
}

/** Examiner share of a sale's net revenue (DECISIONS O03 proposal: 65% direct, 75% own code). */
const SHARE = `ROUND(p.net_revenue_paise * CASE WHEN p.is_examiner_coupon THEN 0.75 ELSE 0.65 END)`;

const ITEM_TITLE = `COALESCE(t.title, s.title)`;
const ITEM_JOIN = `LEFT JOIN tests t ON t.id=p.test_id LEFT JOIN test_series s ON s.id=p.series_id`;

// Checkout ---------------------------------------------------------------------------------------

export interface CheckoutRow {
  id: string;
  student_id: string;
  item_type: 'single_test' | 'test_series';
  item_id: string;
  item_title: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  gross_amount_paise: number;
  discount_paise: number;
  total_paid_paise: number;
  coupon_code: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  invoice_number: string | null;
  student_name: string;
  student_email: string | null;
}

const CHECKOUT_SELECT = `
  SELECT p.id,p.student_id,p.item_type::text AS item_type,COALESCE(p.test_id,p.series_id) AS item_id,
         ${ITEM_TITLE} AS item_title,p.status::text AS status,p.gross_amount_paise,p.discount_paise,p.total_paid_paise,
         c.code AS coupon_code,p.razorpay_order_id,p.razorpay_payment_id,p.invoice_number,
         pr.full_name AS student_name,pr.email AS student_email
    FROM purchases p ${ITEM_JOIN}
    LEFT JOIN coupons c ON c.id=p.coupon_id
    JOIN profiles pr ON pr.id=p.student_id`;

export interface MyPurchaseRow {
  id: string;
  item_type: 'single_test' | 'test_series';
  item_id: string;
  item_title: string;
  item_slug: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  total_paid_paise: number;
  discount_paise: number;
  coupon_code: string | null;
  invoice_number: string | null;
  payment_channel: string;
  valid_until: Date | null;
  captured_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
}

const PURCHASE_SELECT = `
  SELECT p.id,p.item_type::text AS item_type,COALESCE(p.test_id,p.series_id) AS item_id,${ITEM_TITLE} AS item_title,
         COALESCE(t.slug,s.slug) AS item_slug,p.status::text AS status,p.total_paid_paise,p.discount_paise,
         c.code AS coupon_code,p.invoice_number,p.payment_channel,
         (SELECT max(se.valid_until) FROM student_entitlements se WHERE se.purchase_id=p.id) AS valid_until,
         p.captured_at,p.refunded_at,p.created_at
    FROM purchases p ${ITEM_JOIN}
    LEFT JOIN coupons c ON c.id=p.coupon_id`;

// Examiner ---------------------------------------------------------------------------------------

export interface SalesAggregateRow {
  key: string;
  item_type: 'single_test' | 'test_series' | null;
  title: string | null;
  sales: number;
  refunds: number;
  gross_paise: number;
  net_paise: number;
  share_paise: number;
  coupon_sales: number;
}

export interface PayoutRow {
  id: string;
  examiner_id: string;
  examiner_name: string;
  payout_month: string;
  direct_sales_65_paise: string;
  coupon_sales_75_paise: string;
  pass_pool_share_paise: string;
  refund_deductions_paise: string;
  carried_forward_paise: string;
  gross_earnings_paise: string;
  tds_rate_percent: string;
  tds_deducted_paise: string;
  net_payable_paise: string;
  status: 'calculated' | 'on_hold' | 'approved' | 'paid';
  hold_reason: string | null;
  carried_into_month: string | null;
  bank_transfer_ref: string | null;
  paid_at: Date | null;
  tds_certificate_asset_id: string | null;
  kyc_verified: boolean;
  updated_at: Date;
}

const PAYOUT_SELECT = `
  SELECT ep.id,ep.examiner_id,pr.full_name AS examiner_name,to_char(ep.payout_month,'YYYY-MM') AS payout_month,
         ep.direct_sales_65_paise,ep.coupon_sales_75_paise,ep.pass_pool_share_paise,ep.refund_deductions_paise,
         ep.carried_forward_paise,ep.gross_earnings_paise,ep.tds_rate_percent,ep.tds_deducted_paise,ep.net_payable_paise,
         ep.status::text AS status,ep.hold_reason,to_char(nx.payout_month,'YYYY-MM') AS carried_into_month,
         ep.bank_transfer_ref,ep.paid_at,ep.tds_certificate_asset_id,
         (x.kyc_verified_at IS NOT NULL) AS kyc_verified,ep.updated_at
    FROM examiner_payouts ep
    JOIN profiles pr ON pr.id=ep.examiner_id
    LEFT JOIN examiner_profiles x ON x.user_id=ep.examiner_id
    LEFT JOIN examiner_payouts nx ON nx.id=ep.carried_into_payout_id`;

export interface StatementRow {
  happened_at: Date;
  kind: 'sale' | 'refund';
  title: string;
  item_type: string;
  invoice_number: string | null;
  examiner_coupon: boolean;
  total_paid_paise: number;
  net_revenue_paise: number;
  share_paise: number;
}

export interface CouponRow {
  id: string;
  code: string;
  examiner_id: string | null;
  examiner_name: string | null;
  discount_percent: string | null;
  max_discount_paise: number | null;
  flat_discount_paise: number | null;
  valid_from: Date;
  valid_until: Date | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  sales_paise: string;
}

const COUPON_SELECT = `
  SELECT c.id,c.code,c.examiner_id,pr.full_name AS examiner_name,c.discount_percent,c.max_discount_paise,
         c.flat_discount_paise,c.valid_from,c.valid_until,c.max_uses,c.current_uses,c.is_active,
         COALESCE((SELECT sum(p.total_paid_paise) FROM purchases p WHERE p.coupon_id=c.id AND p.status='captured'),0) AS sales_paise
    FROM coupons c LEFT JOIN profiles pr ON pr.id=c.examiner_id`;

// Admin students ---------------------------------------------------------------------------------

export interface StudentRow {
  id: string;
  full_name: string;
  email: string | null;
  is_blocked: boolean;
  roles: string[];
  created_at: Date;
  attempts: number;
}

const STUDENT_SELECT = `
  SELECT pr.id,pr.full_name,pr.email,pr.is_blocked,pr.roles::text[] AS roles,pr.created_at,
         (SELECT count(*)::int FROM student_attempts sa WHERE sa.student_id=pr.id) AS attempts
    FROM profiles pr`;

export interface AdminPurchaseRow extends MyPurchaseRow {
  student_id: string;
  razorpay_payment_id: string | null;
  attempts_since: number;
}

export const commerceRepository = {
  // Checkout -----------------------------------------------------------------------------------

  async createWebOrder(
    db: Queryable,
    itemType: string,
    itemId: string,
    couponCode: string | null,
    gstRate: number,
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>('SELECT public.create_web_order($1,$2,$3,$4) AS id', [
      itemType,
      itemId,
      couponCode,
      gstRate,
    ]);
    return rows[0]!.id;
  },

  async checkout(db: Queryable, purchaseId: string): Promise<CheckoutRow | undefined> {
    const { rows } = await db.query<CheckoutRow>(`${CHECKOUT_SELECT} WHERE p.id=$1`, [purchaseId]);
    return rows[0];
  },

  async attachOrder(db: Queryable, purchaseId: string, orderId: string): Promise<boolean> {
    const { rows } = await db.query<{ ok: boolean }>('SELECT public.attach_razorpay_order($1,$2) AS ok', [
      purchaseId,
      orderId,
    ]);
    return rows[0]?.ok === true;
  },

  async fulfil(
    db: Queryable,
    input: { purchaseId: string; orderId: string; paymentId: string; amount: number; fee: number; event: string; payload: unknown },
  ): Promise<string> {
    const { rows } = await db.query<{ status: string }>(
      'SELECT public.fulfil_razorpay_payment($1,$2,$3,$4,$5,$6,$7::jsonb) AS status',
      [input.purchaseId, input.orderId, input.paymentId, input.amount, input.fee, input.event, JSON.stringify(input.payload)],
    );
    return rows[0]!.status;
  },

  /** Webhook bookkeeping for events that do not change a purchase; repeats are ignored. */
  async recordEvent(db: Queryable, eventId: string, purchaseId: string | null, payload: unknown): Promise<void> {
    await db.query(
      `INSERT INTO billing_events (provider,provider_event_id,purchase_id,payload,verified_at,processed_at)
       VALUES ('razorpay',$1,(SELECT id FROM purchases WHERE id=$2),$3::jsonb,now(),now())
       ON CONFLICT (provider,provider_event_id) DO NOTHING`,
      [eventId, purchaseId, JSON.stringify(payload)],
    );
  },

  async owns(db: Queryable, studentId: string, itemType: 'single_test' | 'test_series', itemId: string): Promise<boolean> {
    const { rows } = await db.query<{ owned: boolean }>(
      itemType === 'single_test'
        ? 'SELECT public.owns_test($1,$2) AS owned'
        : `SELECT EXISTS (SELECT 1 FROM student_entitlements se WHERE se.student_id=$1 AND se.series_id=$2
             AND NOT se.is_revoked AND (se.valid_until IS NULL OR se.valid_until > now())) AS owned`,
      [studentId, itemId],
    );
    return rows[0]?.owned === true;
  },

  async myPurchases(db: Queryable, studentId: string): Promise<MyPurchaseRow[]> {
    const { rows } = await db.query<MyPurchaseRow>(
      `${PURCHASE_SELECT} WHERE p.student_id=$1 AND p.status IN ('captured','refunded') AND p.item_type<>'pass'
        ORDER BY COALESCE(p.captured_at,p.created_at) DESC LIMIT 200`,
      [studentId],
    );
    return rows;
  },

  // Examiner -----------------------------------------------------------------------------------

  /**
   * Sales (by capture time) and refunds (by refund time) of the examiner's items since `from`,
   * grouped by item or by India day. Admin grants never count.
   */
  async sales(db: Queryable, examinerId: string, from: Date, by: 'item' | 'day'): Promise<SalesAggregateRow[]> {
    const key =
      by === 'item'
        ? `COALESCE(p.test_id,p.series_id)::text`
        : `to_char((e.at AT TIME ZONE 'Asia/Kolkata')::date,'YYYY-MM-DD')`;
    const { rows } = await db.query<SalesAggregateRow>(
      `WITH events AS (
         SELECT p.id,p.captured_at AS at,'sale' AS kind FROM purchases p
          WHERE p.examiner_id=$1 AND p.payment_channel<>'admin_grant' AND p.status IN ('captured','refunded')
            AND p.captured_at >= $2
         UNION ALL
         SELECT p.id,p.refunded_at,'refund' FROM purchases p
          WHERE p.examiner_id=$1 AND p.payment_channel<>'admin_grant' AND p.status='refunded' AND p.refunded_at >= $2
       )
       SELECT ${key} AS key,
              ${by === 'item' ? `min(p.item_type::text)` : 'NULL'} AS item_type,
              ${by === 'item' ? `min(${ITEM_TITLE})` : 'NULL'} AS title,
              count(*) FILTER (WHERE e.kind='sale')::int AS sales,
              count(*) FILTER (WHERE e.kind='refund')::int AS refunds,
              COALESCE(sum(CASE WHEN e.kind='sale' THEN p.total_paid_paise ELSE -p.total_paid_paise END),0)::int AS gross_paise,
              COALESCE(sum(CASE WHEN e.kind='sale' THEN p.net_revenue_paise ELSE -p.net_revenue_paise END),0)::int AS net_paise,
              COALESCE(sum(CASE WHEN e.kind='sale' THEN ${SHARE} ELSE -${SHARE} END),0)::int AS share_paise,
              count(*) FILTER (WHERE e.kind='sale' AND p.is_examiner_coupon)::int AS coupon_sales
         FROM events e JOIN purchases p ON p.id=e.id ${ITEM_JOIN}
        GROUP BY 1 ORDER BY 1`,
      [examinerId, from],
    );
    return rows;
  },

  async attemptStats(db: Queryable, from: Date): Promise<{ test_id: string; day: string; attempts: number; title: string }[]> {
    const { rows } = await db.query<{ test_id: string; day: string; attempts: number; title: string }>(
      `SELECT a.test_id,to_char(a.day,'YYYY-MM-DD') AS day,a.attempts,t.title
         FROM public.examiner_attempt_stats($1) a JOIN tests t ON t.id=a.test_id`,
      [from],
    );
    return rows;
  },

  async examinerPayouts(db: Queryable, examinerId: string): Promise<PayoutRow[]> {
    const { rows } = await db.query<PayoutRow>(`${PAYOUT_SELECT} WHERE ep.examiner_id=$1 ORDER BY ep.payout_month DESC`, [
      examinerId,
    ]);
    return rows;
  },

  async payout(db: Queryable, payoutId: string): Promise<PayoutRow | undefined> {
    const { rows } = await db.query<PayoutRow>(`${PAYOUT_SELECT} WHERE ep.id=$1`, [payoutId]);
    return rows[0];
  },

  /** The sales and refunds behind one monthly payout, without any student identity. */
  async statement(db: Queryable, examinerId: string, month: string): Promise<StatementRow[]> {
    const { rows } = await db.query<StatementRow>(
      `WITH bounds AS (
         SELECT (($2||'-01')::date::timestamp AT TIME ZONE 'Asia/Kolkata') AS s,
                ((($2||'-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Kolkata') AS e
       )
       SELECT x.* FROM (
         SELECT p.captured_at AS happened_at,'sale' AS kind,${ITEM_TITLE} AS title,p.item_type::text AS item_type,
                p.invoice_number,p.is_examiner_coupon AS examiner_coupon,p.total_paid_paise,p.net_revenue_paise,
                ${SHARE}::int AS share_paise
           FROM purchases p ${ITEM_JOIN}, bounds b
          WHERE p.examiner_id=$1 AND p.payment_channel<>'admin_grant' AND p.status IN ('captured','refunded')
            AND p.captured_at >= b.s AND p.captured_at < b.e
         UNION ALL
         SELECT p.refunded_at,'refund',${ITEM_TITLE},p.item_type::text,p.invoice_number,p.is_examiner_coupon,
                -p.total_paid_paise,-p.net_revenue_paise,-(${SHARE})::int
           FROM purchases p ${ITEM_JOIN}, bounds b
          WHERE p.examiner_id=$1 AND p.payment_channel<>'admin_grant' AND p.status='refunded'
            AND p.refunded_at >= b.s AND p.refunded_at < b.e
       ) x ORDER BY x.happened_at`,
      [examinerId, month],
    );
    return rows;
  },

  async payoutDocument(
    db: Queryable,
    payoutId: string,
  ): Promise<{ bucket: string; object_key: string; original_name: string } | undefined> {
    const { rows } = await db.query<{ bucket: string; object_key: string; original_name: string }>(
      'SELECT bucket,object_key,original_name FROM public.payout_document($1)',
      [payoutId],
    );
    return rows[0];
  },

  async coupons(db: Queryable, examinerId?: string): Promise<CouponRow[]> {
    const { rows } = await db.query<CouponRow>(
      `${COUPON_SELECT} ${examinerId ? 'WHERE c.examiner_id=$1' : ''} ORDER BY c.is_active DESC,c.created_at DESC`,
      examinerId ? [examinerId] : [],
    );
    return rows;
  },

  // Admin pricing ------------------------------------------------------------------------------

  async createCoupon(
    db: Queryable,
    input: {
      code: string;
      examinerId: string | null;
      discountPercent: number | null;
      maxDiscountPaise: number | null;
      flatDiscountPaise: number | null;
      validUntil: string | null;
      maxUses: number | null;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO coupons (code,examiner_id,discount_percent,max_discount_paise,flat_discount_paise,valid_until,max_uses)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        input.code,
        input.examinerId,
        input.discountPercent,
        input.maxDiscountPaise,
        input.flatDiscountPaise,
        input.validUntil,
        input.maxUses,
      ],
    );
    return rows[0]!.id;
  },

  async setCouponActive(db: Queryable, id: string, active: boolean): Promise<boolean> {
    const { rowCount } = await db.query('UPDATE coupons SET is_active=$2 WHERE id=$1', [id, active]);
    return rowCount === 1;
  },

  async approvedExaminers(db: Queryable): Promise<{ id: string; name: string }[]> {
    const { rows } = await db.query<{ id: string; name: string }>(
      `SELECT pr.id,pr.full_name AS name FROM examiner_profiles x JOIN profiles pr ON pr.id=x.user_id
        WHERE x.onboarding_status='approved' AND NOT pr.is_blocked ORDER BY pr.full_name`,
    );
    return rows;
  },

  async isApprovedExaminer(db: Queryable, id: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM examiner_profiles WHERE user_id=$1 AND onboarding_status='approved'`,
      [id],
    );
    return rowCount === 1;
  },

  async priceBands(db: Queryable) {
    const { rows } = await db.query<{
      exam_id: string;
      exam_name: string;
      min_paise: number;
      max_new_paise: number;
      max_verified_paise: number;
      max_top_paise: number;
      updated_at: Date;
    }>(
      `SELECT id AS exam_id,name AS exam_name,price_band_min_paise AS min_paise,price_band_max_new_paise AS max_new_paise,
              price_band_max_verified_paise AS max_verified_paise,price_band_max_top_paise AS max_top_paise,updated_at
         FROM exams ORDER BY is_active DESC,name`,
    );
    return rows;
  },

  async updatePriceBand(
    db: Queryable,
    examId: string,
    expectedUpdatedAt: string,
    band: { minPaise: number; maxNewPaise: number; maxVerifiedPaise: number; maxTopPaise: number },
  ): Promise<'ok' | 'missing' | 'stale'> {
    const { rowCount } = await db.query(
      `UPDATE exams SET price_band_min_paise=$3,price_band_max_new_paise=$4,price_band_max_verified_paise=$5,
              price_band_max_top_paise=$6
        WHERE id=$1 AND ${SAME_VERSION('updated_at', '$2')}`,
      [examId, expectedUpdatedAt, band.minPaise, band.maxNewPaise, band.maxVerifiedPaise, band.maxTopPaise],
    );
    if (rowCount === 1) return 'ok';
    const exists = await db.query('SELECT 1 FROM exams WHERE id=$1', [examId]);
    return exists.rowCount ? 'stale' : 'missing';
  },

  // Admin payouts ------------------------------------------------------------------------------

  async monthPayouts(db: Queryable, month: string): Promise<PayoutRow[]> {
    const { rows } = await db.query<PayoutRow>(
      `${PAYOUT_SELECT} WHERE ep.payout_month=($1||'-01')::date ORDER BY ep.status,pr.full_name`,
      [month],
    );
    return rows;
  },

  async calculatePayouts(db: Queryable, month: string, tdsRate: number): Promise<void> {
    await db.query("SELECT public.calculate_monthly_examiner_payouts(($1||'-01')::date,$2)", [month, tdsRate]);
  },

  async lockPayout(db: Queryable, payoutId: string, expectedUpdatedAt: string): Promise<PayoutRow | 'missing' | 'stale'> {
    const locked = await db.query<{ fresh: boolean }>(
      `SELECT ${SAME_VERSION('updated_at', '$2')} AS fresh FROM examiner_payouts WHERE id=$1 FOR UPDATE`,
      [payoutId, expectedUpdatedAt],
    );
    if (!locked.rows[0]) return 'missing';
    if (!locked.rows[0].fresh) return 'stale';
    return (await this.payout(db, payoutId))!;
  },

  async setPayout(
    db: Queryable,
    payoutId: string,
    change: {
      status?: 'calculated' | 'on_hold' | 'approved' | 'paid';
      holdReason?: string | null;
      approvedBy?: string;
      bankTransferRef?: string;
      tdsAssetId?: string;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE examiner_payouts SET
          status=COALESCE($2::payout_status_type,status),
          hold_reason=CASE WHEN $3::boolean THEN $4 ELSE hold_reason END,
          approved_by=COALESCE($5,approved_by),
          approved_at=CASE WHEN $5::uuid IS NOT NULL THEN now() ELSE approved_at END,
          bank_transfer_ref=COALESCE($6,bank_transfer_ref),
          paid_at=CASE WHEN $6::text IS NOT NULL THEN now() ELSE paid_at END,
          tds_certificate_asset_id=COALESCE($7,tds_certificate_asset_id)
        WHERE id=$1`,
      [
        payoutId,
        change.status ?? null,
        change.holdReason !== undefined,
        change.holdReason ?? null,
        change.approvedBy ?? null,
        change.bankTransferRef ?? null,
        change.tdsAssetId ?? null,
      ],
    );
  },

  /** Paid payout: the append-only ledger entry (once) and the examiner's first-payout flag. */
  async recordPayoutPaid(db: Queryable, payoutId: string, examinerId: string, amountPaise: string): Promise<void> {
    await db.query(
      `INSERT INTO ledger_entries (payout_id,entry_type,source_event,amount_paise)
       VALUES ($1,'payout','payout:'||$1::text,-$2::bigint) ON CONFLICT (source_event) DO NOTHING`,
      [payoutId, amountPaise],
    );
    await db.query('UPDATE examiner_profiles SET first_payout_completed=TRUE WHERE user_id=$1 AND NOT first_payout_completed', [
      examinerId,
    ]);
  },

  async cleanPayoutDocument(db: Queryable, assetId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM assets WHERE id=$1 AND classification='payout_document' AND scan_status='clean' AND uploaded_at IS NOT NULL`,
      [assetId],
    );
    return rowCount === 1;
  },

  // Admin students -----------------------------------------------------------------------------

  async searchStudents(db: Queryable, q: string): Promise<StudentRow[]> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q) ? q : null;
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await db.query<StudentRow>(
      `${STUDENT_SELECT}
        WHERE pr.deleted_at IS NULL AND 'student'=ANY(pr.roles)
          AND (pr.id=$1::uuid OR pr.email ILIKE $2 OR pr.full_name ILIKE $2 OR pr.phone ILIKE $2)
        ORDER BY pr.created_at DESC LIMIT 50`,
      [uuid, like],
    );
    return rows;
  },

  async student(db: Queryable, id: string): Promise<StudentRow | undefined> {
    const { rows } = await db.query<StudentRow>(`${STUDENT_SELECT} WHERE pr.id=$1 AND pr.deleted_at IS NULL`, [id]);
    return rows[0];
  },

  /** A student's purchases with the attempts started on what each one covers since it was paid. */
  async studentPurchases(db: Queryable, studentId: string, purchaseId?: string): Promise<AdminPurchaseRow[]> {
    const { rows } = await db.query<AdminPurchaseRow>(
      `${PURCHASE_SELECT.replace('SELECT p.id,', 'SELECT p.id,p.student_id,p.razorpay_payment_id,')
        .replace(
          'p.captured_at,p.refunded_at,p.created_at',
          `p.captured_at,p.refunded_at,p.created_at,
           (SELECT count(*)::int FROM student_attempts sa
             WHERE sa.student_id=p.student_id AND sa.started_at >= COALESCE(p.captured_at,p.created_at)
               AND (sa.test_id=p.test_id OR sa.test_id IN (SELECT x.id FROM tests x WHERE x.series_id=p.series_id))
           ) AS attempts_since`,
        )}
        WHERE p.student_id=$1 AND p.status IN ('captured','refunded') AND ($2::uuid IS NULL OR p.id=$2)
        ORDER BY COALESCE(p.captured_at,p.created_at) DESC`,
      [studentId, purchaseId ?? null],
    );
    return rows;
  },

  async purchaseOwner(db: Queryable, purchaseId: string): Promise<string | undefined> {
    const { rows } = await db.query<{ student_id: string }>('SELECT student_id FROM purchases WHERE id=$1', [purchaseId]);
    return rows[0]?.student_id;
  },

  async recordRefund(db: Queryable, purchaseId: string, refundId: string, amount: number, reason: string): Promise<void> {
    await db.query('SELECT public.record_refund($1,$2,$3,$4)', [purchaseId, refundId, amount, reason]);
  },

  async grantAccess(db: Queryable, studentId: string, itemType: string, itemId: string, reason: string): Promise<void> {
    await db.query('SELECT public.grant_access($1,$2,$3,$4)', [studentId, itemType, itemId, reason]);
  },

  async setBlocked(db: Queryable, adminId: string, studentId: string, blocked: boolean, reason: string): Promise<void> {
    await db.query('UPDATE profiles SET is_blocked=$2 WHERE id=$1', [studentId, blocked]);
    await db.query(
      `INSERT INTO admin_audit_logs (admin_id,action_name,target_table,target_record_id,after_state)
       VALUES ($1,$2,'profiles',$3,jsonb_build_object('is_blocked',$4::boolean,'reason',$5::text))`,
      [adminId, blocked ? 'student.block' : 'student.unblock', studentId, blocked, reason],
    );
  },
};
