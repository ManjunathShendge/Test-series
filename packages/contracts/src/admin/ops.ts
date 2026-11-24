import { z } from 'zod';
import { AuditEntry } from './index.js';

// Admin operations (PRD 8): catalogue, CMS banners, reports and the audit log -------------------

const Id = z.uuid();
const IsoTime = z.iso.datetime({ offset: true });
const Paise = z.number().int();
const Reason = z.string().trim().min(5).max(500);

// Catalogue ------------------------------------------------------------------------------------

export const CatalogueKind = z.enum(['tests', 'series']);
export type CatalogueKind = z.infer<typeof CatalogueKind>;

export const CatalogueQuery = z.strictObject({
  kind: CatalogueKind.default('tests'),
  q: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['published', 'unpublished', 'all']).default('all'),
});
export type CatalogueQuery = z.infer<typeof CatalogueQuery>;

export const CatalogueRow = z.object({
  id: Id,
  kind: CatalogueKind,
  title: z.string(),
  slug: z.string(),
  examName: z.string(),
  examinerName: z.string(),
  /** Tests: live, scheduled, approved, archived. Series: published or unpublished. */
  status: z.string(),
  published: z.boolean(),
  featured: z.boolean(),
  /** Only free tests can be featured on Home (PRD 6.2 "admin-featured free tests"). */
  canFeature: z.boolean(),
  pricePaise: Paise,
  attempts: z.number().int(),
  sales: z.number().int(),
  publishedAt: IsoTime.nullable(),
});
export type CatalogueRow = z.infer<typeof CatalogueRow>;
export const CatalogueList = z.object({ items: z.array(CatalogueRow) });
export type CatalogueList = z.infer<typeof CatalogueList>;

/** PATCH /v1/admin/ops/{tests|series}/:id. Unpublishing needs a reason, kept in the audit log. */
export const CatalogueAction = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('feature'), featured: z.boolean() }),
  z.strictObject({ action: z.literal('unpublish'), reason: Reason }),
  z.strictObject({ action: z.literal('republish'), reason: Reason }),
]);
export type CatalogueAction = z.infer<typeof CatalogueAction>;

// CMS banners ----------------------------------------------------------------------------------

export const BannerPlacement = z.enum(['web', 'app', 'both']);
export type BannerPlacement = z.infer<typeof BannerPlacement>;

const HttpsUrl = z.url().refine((v) => v.startsWith('https://'), 'Use an https:// address');
/** In-app path ("/exams/ssc-cgl") or an https link. */
const Link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) || v.startsWith('https://'), 'Use a path like /exams/ssc-cgl or an https:// link');

export const Banner = z.object({
  id: Id,
  title: z.string(),
  imageUrl: z.string(),
  link: z.string(),
  placement: BannerPlacement,
  examId: Id.nullable(),
  displayOrder: z.number().int(),
  active: z.boolean(),
  startsAt: IsoTime.nullable(),
  endsAt: IsoTime.nullable(),
});
export type Banner = z.infer<typeof Banner>;
export const BannerList = z.object({ items: z.array(Banner) });
export type BannerList = z.infer<typeof BannerList>;

const BannerFields = {
  title: z.string().trim().min(2).max(120),
  imageUrl: HttpsUrl,
  link: Link,
  placement: BannerPlacement,
  examId: Id.nullable(),
  displayOrder: z.number().int().min(0).max(1000),
  active: z.boolean(),
  startsAt: IsoTime.nullable(),
  endsAt: IsoTime.nullable(),
};
const inOrder = (v: { startsAt?: string | null | undefined; endsAt?: string | null | undefined }) =>
  !v.startsAt || !v.endsAt || Date.parse(v.startsAt) < Date.parse(v.endsAt);
export const CreateBannerRequest = z
  .strictObject({ ...BannerFields, placement: BannerPlacement.default('both'), examId: Id.nullable().default(null), displayOrder: BannerFields.displayOrder.default(0), active: z.boolean().default(true), startsAt: IsoTime.nullable().default(null), endsAt: IsoTime.nullable().default(null) })
  .refine(inOrder, 'The end must be after the start');
export type CreateBannerRequest = z.infer<typeof CreateBannerRequest>;
export const UpdateBannerRequest = z
  .strictObject(BannerFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required')
  .refine(inOrder, 'The end must be after the start');
export type UpdateBannerRequest = z.infer<typeof UpdateBannerRequest>;

/** GET /v1/banners?placement=web|app: active banners for visitors, in display order. */
export const PublicBannerQuery = z.strictObject({ placement: z.enum(['web', 'app']) });
export const PublicBanner = Banner.pick({ id: true, title: true, imageUrl: true, link: true, examId: true });
export type PublicBanner = z.infer<typeof PublicBanner>;
export const PublicBannerList = z.object({ items: z.array(PublicBanner) });
export type PublicBannerList = z.infer<typeof PublicBannerList>;

// Reports --------------------------------------------------------------------------------------

const Day = z.iso.date();
/** Dates are India calendar days, inclusive; at most a year at a time. */
export const ReportQuery = z
  .strictObject({ from: Day, to: Day })
  .refine((v) => v.from <= v.to, 'The start must be on or before the end')
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000, 'Choose at most one year');
export type ReportQuery = z.infer<typeof ReportQuery>;

export const OpsReport = z.object({
  from: Day,
  to: Day,
  sales: z.object({
    orders: z.number().int(),
    grossPaise: Paise,
    discountPaise: Paise,
    gstPaise: Paise,
    netRevenuePaise: Paise,
    refunds: z.number().int(),
    refundedPaise: Paise,
    byChannel: z.array(z.object({ channel: z.string(), orders: z.number().int(), paidPaise: Paise })),
  }),
  students: z.object({ signups: z.number().int(), active: z.number().int(), paying: z.number().int() }),
  attempts: z.object({ started: z.number().int(), finished: z.number().int(), freeShare: z.number() }),
  qc: z.object({ decided: z.number().int(), pending: z.number().int(), avgTurnaroundHours: z.number().nullable(), openReports: z.number().int() }),
  topTests: z.array(z.object({ id: Id, title: z.string(), attempts: z.number().int(), sales: z.number().int(), revenuePaise: Paise })),
  daily: z.array(z.object({ day: Day, orders: z.number().int(), paidPaise: Paise, attempts: z.number().int(), signups: z.number().int() })),
});
export type OpsReport = z.infer<typeof OpsReport>;

export const ReportExportKind = z.enum(['sales', 'attempts', 'daily']);
export type ReportExportKind = z.infer<typeof ReportExportKind>;
export const ReportExportQuery = z.strictObject({ from: Day, to: Day, kind: ReportExportKind });

// Audit log ------------------------------------------------------------------------------------

export const AuditQuery = z.strictObject({
  table: z.string().regex(/^[a-z_]{2,60}$/).optional(),
  action: z.string().trim().min(2).max(80).optional(),
  actor: z.string().trim().min(2).max(120).optional(),
  /** Opaque cursor: the previous page's nextBefore. */
  before: z.string().regex(/^[0-9T:.+\-Z]{20,35}~[0-9a-f-]{36}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditLogEntry = AuditEntry.extend({
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;
export const AuditLogPage = z.object({ items: z.array(AuditLogEntry), nextBefore: z.string().nullable() });
export type AuditLogPage = z.infer<typeof AuditLogPage>;
