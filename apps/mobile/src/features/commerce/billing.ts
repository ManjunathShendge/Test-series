/**
 * Store billing hook-up point (Apple In-App Purchase, Google Play Billing). The client's
 * billing integration implements `BillingAdapter` and registers it once at start-up:
 *
 *   registerBillingAdapter(myStoreBilling);
 *
 * Contract for the adapter:
 * - `purchase` runs the platform purchase flow for the item's store product and sends the
 *   store proof (Apple signed transaction / Play purchase token) to the server for
 *   verification. It must not grant anything on the device.
 * - Resolve 'purchased' once the server has accepted the proof, 'pending' for a deferred or
 *   pending store payment, 'cancelled' when the student backs out. Throw on failure.
 * - Access is unlocked only when GET /v1/me/entitlements lists the item (the server decides
 *   entitlement, CLAUDE.md invariant 4); the purchase sheet waits for that.
 *
 * Until an adapter is registered the app shows paid items as "available soon" and never
 * offers a purchase or a link to pay elsewhere (store rules on external payment links).
 */

export interface BillingItem {
  kind: 'test' | 'series';
  /** Our item id; the adapter maps it to the store product id. */
  id: string;
  title: string;
  /** Catalogue price in paise, for display; the store charges its own localized price. */
  pricePaise: number;
}

export type BillingOutcome = 'purchased' | 'pending' | 'cancelled';

export interface BillingAdapter {
  purchase(item: BillingItem): Promise<BillingOutcome>;
  /** Optional "Restore purchases" (required by Apple when non-consumables exist). */
  restore?(): Promise<void>;
}

let adapter: BillingAdapter | null = null;

export function registerBillingAdapter(next: BillingAdapter | null): void {
  adapter = next;
}

export function getBillingAdapter(): BillingAdapter | null {
  return adapter;
}
