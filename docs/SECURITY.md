# Security, permissions and privacy

Engineering requirements, not final legal advice. Legal/CA must approve launch policies, applicable obligations and retention. Do not copy draft legal prose into production terms.

## Authorization matrix

| Capability | Student | Examiner | Reviewer | Ops | Finance | Super |
|---|---|---|---|---|---|---|
| Own profile/purchases/attempts | Own | Own | Own | Own | Own | Own |
| Author content | No | Own, approved scope | No | Admin orchestration | No | Audited |
| Review/keys | Own released review | Own content | Assigned exam/subject | Assigned/authorized | No | Audited |
| KYC view/verify, tiers/suspend | No | Own upload/status | No | Yes, logged | Minimum payout data | Yes |
| Grant access/refund operations | No | No | No | Explicit support permission | Financial approval | Yes |
| Payout/bank details/TDS | No | Own statements | No | No by default | Yes | Yes |
| Roles/security settings | No | No | No | No | No | Yes |

Roles can combine; still prohibit self-review. Backend ownership checks required for every object, including uploads/signed URLs, invoice downloads and report evidence. Service accounts narrowly scoped. Reviewer/admin mutation audit is in same transaction; KYC reads also audited.

## Threat controls and tests

- Answer theft: separate positive serializers, per-attempt URLs, no key in HTML/assets/analytics, post-submit/release gates.
- Cross-account data access: deny ID guessing with role+ownership tests, not opaque IDs alone.
- Payment fraud: provider verification and binding, unique economic effects, refunds/void reconciliation; never trust platform field supplied by client without validating allowed route.
- Timer tampering: server ingress/deadlines and session epoch, bounded batches, section gates.
- Malicious author content: structured sanitization, CSP/WebView navigation restrictions, upload scanning/type checks, ZIP limits and path safety.
- AI prompt injection: content is data, no tool execution, schema validation, human approval and no keys in prompts.
- KYC compromise: app-layer envelope encryption with key reference/rotation, private documents, least privilege and redacted logs.
- CSV injection: escape formula-triggering cells in exports, use fixed typed bank format; finance reviews exported file.
- Account takeover: verified auth, secure credential persistence, reauth for linking/deletion, revoked sessions, no email-only merge.

Register at most two active devices under user row lock. One active attempt lease per account. Rate limit authentication, purchase, reports, imports and signed URLs; multi-instance deployment must not rely only on per-process memory.

## HTTP protections (24 November 2026)

- Rate limits (API, per instance, `common/security/http-protection.ts`): 1,200 requests a minute per network address (sized for a classroom on one connection during a live test), 300 per sign-in, 30 sign-in attempts a minute per address, 10 export or deletion requests a minute. Over the limit: HTTP 429 `RATE_LIMITED` with `Retry-After`; web and app attempt sync treat it as retryable, so no answer is dropped. Webhooks and health checks are never limited. Behind a load balancer set `TRUST_PROXY_HOPS`; the website server sends `INTERNAL_CALLER_TOKEN` (its `API_INTERNAL_TOKEN`) so page rendering is not counted as one visitor. Use an edge or CDN limit as well for distributed floods.
- Headers: API sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `default-src 'none'` CSP, HSTS when deployed, and no `X-Powered-By`. Web sends `nosniff`, `DENY` framing, strict referrer, a Permissions-Policy without camera, microphone or location, a CSP limited to framing, plugins, base and form targets (script sources stay open for Firebase, Razorpay and PostHog), and HSTS.
- Inline structured data (JSON-LD) is escaped (`jsonLdHtml`), so examiner-written titles cannot close the script tag. Maths renders through KaTeX with `trust: false`.
- Checked 24 November 2026: no source, config or `.env` files served by either server; no secrets or source maps in the browser bundle; CORS refuses unknown origins; error replies carry no stack traces; images run as a non-root user in production mode. Gitleaks over all commits: 7 findings, all reviewed false positives (an empty `.env.example` value, documentation prose, the local-only MinIO container login in an archived script).

## Privacy and deletion workflow

Inventory profile/preferences, auth identity, attempts, purchase/financial records, KYC, device tokens, analytics and external processors. Version notice/consent records, provide access/export/deletion requests, named grievance contact and documented grievance workflow. 18+ proposal needs owner/legal approval and current exam-age verification before public eligibility claims.

Reauthenticated deletion: revoke sessions and push tokens, cancel optional notices, remove/anonymize profile and discretionary analytics, remove Firebase identity through retryable job, purge eligible KYC/assets/client cache; retain only approved financial/audit obligations with restricted access and explicit retention schedule. Notify completion or explained exceptions. Backups expire under schedule and restoration reapplies deletion tombstones. In-app and web deletion entry points required.

Store privacy/data-safety disclosures must match actual SDK data flows. Account deletion must not promise to erase statutory records immediately or automatically refund purchases. Legal/CA gate covers DPDP/IT Rules process, content licensing, GST/TDS, grievance handling and data transfers.
