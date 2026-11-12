# Payments, access and payouts

Confirmed channels: Razorpay on web; Apple IAP on iOS; Google Play Billing on Android. Cross-platform access comes from server entitlements. Apps show localized store prices, one item per purchase, no web checkout promotion. Fixed price tiers are a product decision; provider SKU type/mapping remains a pre-M9b validation gate.

## Store catalog gate

The source proposes reusable consumable price-tier products for tests/series and prepaid Pass types later. Do not treat that as store approval or claim individual SKUs are impossible. Spike must prove: two different items at the same tier, retries after process kill, item/account correlation from server notification alone, completed/consumed purchase recovery, refunds after consumption, concurrent purchases, and store review fit for durable access. If unsuitable, record an alternative such as item-specific non-consumables; preserve the approved price-tier UX. Do not enable mobile sales until this is resolved.

Stable opaque billing account identity maps to user; purchase intent maps to exact order/item and freezes tier/product. Apple account token and Play obfuscated account/profile fields must follow current provider semantics and tested library support. Never assume an order ID fits every account-identity field. Never guess which item a same-tier uncorrelated notification purchased: persist unmatched evidence for reconciliation. Restrict concurrent unresolved same-product intents if correlation cannot disambiguate them.

## Common lifecycle

1. Authenticated order request sends item IDs/coupon/platform, never authoritative amount. Validate availability, no accidental duplicate ownership, allowed tier and currency. Reserve coupon use under lock; freeze amounts, products and share policy. Persist idempotent order/purchase intent.
2. External checkout creation is outside long DB transactions; deterministic idempotency + provider lookup reconciles timeout. Do not create a second charge on blind retry.
3. Verify server-side provider proof, application/package, environment, product, transaction identity, account correlation, amount/currency and purchased/captured state. Pending/authorized-only states do not unlock.
4. A verified callback or verified notification can trigger `fulfilOrder`. Notifications are persisted before acknowledgement and processed asynchronously. Re-fetch provider state for out-of-order events; a stale purchase event must not undo refund/revocation.
5. Fulfil under order lock: mark paid, insert entitlement per order item, unique economic ledger entry, coupon redemption and receipt/invoice outbox event in one transaction. Repeated inputs return same outcome.
6. Finish Apple transaction after durable grant; Play backend acknowledges/consumes as product type requires with retries within provider deadline. Recovery job owns failures; UI closing does not abandon acknowledgement.

Razorpay verify uses order/payment HMAC and server-confirmed captured state; webhook signature uses original bytes and separate secret. Apple validates signed transaction/notification and server state. Play validates Pub/Sub identity/audience and retrieves purchase from Developer API; notification body alone is not purchase proof. Sandbox and production identities are isolated.

Server verification, token uniqueness and backend acknowledgement are supported by [Google Play billing security guidance](https://developer.android.com/google/play/billing/security). Product type, regional terms and storefront behavior must be rechecked against [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) before launch.

## Recovery and access

On launch retry unfinished transactions and pending intents; “Restore purchases” first restores authenticated backend entitlements and then reconciles restorable store transactions. Consumed products may no longer be listed by a store, so the server ledger is essential. No access based only on client callback. UI pending state includes safe retry and support reference.

Test entitlement has no fixed expiry. Series entitlement expires by purchased validity snapshot; proposed membership includes future published tests in that series during validity. Eligibility to start is checked at start; natural expiry does not shorten an already-started timed attempt. Fraud/refund suspension handling must use a separately audited policy. Overlapping grants are independent; revoking one does not erase another valid grant.

Pass is Phase 2: prepaid 1/3/12 months, no auto-renew. Product type/calendar expiry semantics approved then; month arithmetic is calendar-based, defined in UTC, with reminders. Do not sell Pass before pool accounting exists.

## Money and policy snapshots

Launch INR only. Use integer paise and basis points; calculate with integer/decimal-safe arithmetic and round at documented line boundaries. Record gross after discount, tax, provider fee and fee tax if applicable, net and examiner share; freeze policy version. Proposed net = gross less included sales tax and finance-approved channel costs, not an assumed universal tax formula. Example fixture with finance-approved net 10,000 paise yields 6,500 at 6500bps or 7,500 at 7500bps. Rates and deduction basis need O03/O09 approval.

Web coupons may discount; mobile examiner codes attribute higher share only. Reserve/redeem limits atomically, including expiry/user/global caps. Store commission estimates at grant are provisional; reconcile settlement reports with append-only adjustments. Never rewrite old ledger amounts after fee changes.

Web invoices use unique financial-year counter under lock; preserve issued/void records rather than promise gapless PDFs. Rendering/email retries retain same number. CA approves GST data and issuer. Store receipt-only handling remains a proposed default pending CA confirmation. No hardcoded tax or commission claim in code.

## Refunds and payouts

Web proposed policy: within 7 days, none of order's tests started. Lock eligibility snapshot and submit/admin-record provider refund; revoke only after verified refund success. Store requests follow provider process; verified refund/void event revokes matching grants and adds exact compensating ledger entries. Handle duplicate and refund-before-fulfil events, chargebacks, and refunds after payout (negative carry-forward).

Monthly calculation locks eligible unallocated entries. KYC verified, first payout held one cycle, minimum INR 500, configurable TDS. `payout_allocations` prevents concurrent/repeated run double payment without modifying ledger entries. Finance previews, approves and exports escaped CSV, performs bank transfer, records unique bank reference, then appends payout debit once. Failed/uncertain bank transfer remains processing until reconciled; never re-export as a fresh payment automatically. Negative balances carry forward. Certificates uploaded by finance; statements private.

Phase 2 pool: proposed 50% of monthly net Pass revenue, qualified attempts >=50% answered, first eligible attempt per student/test, multiplier 1.0. Version period/eligibility and freeze preview. Resolve no-qualified-attempt periods, refunds and rounding residuals before launch; distribute residual paise deterministically and reconcile exact pool totals.
