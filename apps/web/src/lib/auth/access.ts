import type { Profile } from '@exam-prep/contracts';

/*
 * Who may open which staff area of the website. The same rules the API enforces on every call
 * (RolesGuard and the services), applied here so people never see a console they cannot use.
 * This decides what the site shows; it is not the security boundary.
 */

export type AdminPermission = 'ops' | 'finance';

const flags = (p: Profile) => p.adminAccess ?? { ops: false, finance: false, super: false };

/** Admin role with at least one permission (operations, finance or super admin). */
export function isAdmin(p: Profile): boolean {
  const a = flags(p);
  return p.roles.includes('admin') && (a.ops || a.finance || a.super);
}

/** Admin with a specific permission; super admins have every permission. */
export function hasAdminPermission(p: Profile, permission: AdminPermission): boolean {
  const a = flags(p);
  return p.roles.includes('admin') && (a.super || a[permission]);
}

/** QC reviewers, and operations admins who supervise them. */
export function isReviewer(p: Profile): boolean {
  return p.roles.includes('qc_reviewer') || hasAdminPermission(p, 'ops');
}

/** Approved examiners (approval adds the examiner role). */
export function isExaminer(p: Profile): boolean {
  return p.roles.includes('examiner');
}
