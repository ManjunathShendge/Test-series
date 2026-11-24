# Operations runbooks

Assign named on-call engineering, ops/reviewer lead and finance owner before launch. Correlate request/event/order IDs; do not copy secrets or student answers into tickets.

## Purchase charged, access absent

Find order/intent and provider transaction; verify correct environment/account. Inspect inbox, verified state, fulfilment/outbox and unique ledger sources. Query provider state using approved adapter. Replay idempotent fulfilment only when captured/purchased. Unmatched tier transaction goes to reconciliation; never grant guessed content. Confirm entitlement, receipt job and provider acknowledgement; close with audit.

## Attempt incident

Check session epoch, accepted watermark/deadline, client sync status and finalizer. Preserve local unsynced events if possible; do not reset timers or silently edit score. Recover confirmed DB events, retry scoring/finalization idempotently. Owner decides exception/compensation under documented policy. Distinguish device persistence loss from unaccepted late events.

## Wrong key or harmful content

Quarantine affected question/papers for new starts; keep existing version evidence. Assign reviewer, approve correction mapping and marking policy, publish replacement. Run rescore with checkpoint, validate counts/totals, swap completed rank snapshot and notify once. Audit resolution; do not update old keys in place.

## Payout uncertainty

Pause affected batch, inspect allocations and bank evidence. Do not mark paid based on CSV export. Obtain bank reference/result, then mark once or record failed state. Duplicate run must not reserve allocated entries. Refunds after payout carry negative ledger balance. Finance signs off reconciliation and TDS certificate upload.

## Worker/provider outage

Check outbox/queue age and failed handler, restore dependency, replay by event ID. Bound concurrency to avoid DB overload. Disable optional AI first if spending/errors spike. Preserve payment notifications and acknowledgement deadlines; alert before deadlines. Optional provider outage must not prevent saved attempt ingestion.

## Restore and rollback

Restore into isolated environment, verify schema/object versions and record counts/checksums, reapply deletion tombstones. Reconcile payments/refunds/payouts externally before enabling consumers; restore may resurrect already-processed events. Verify current provider truth and unique source IDs; never rerun bank transfers from an old snapshot. Smoke test, then controlled cutover. Record actual RPO/RTO and incidents. Roll back compatible app images; use forward schema repair for destructive migration faults.

## Job queue (worker)

All background work (notifications, analytics, deletions, AI checks) is rows in `jobs`. Health: worker `GET /health/ready` on `WORKER_PORT`.
- Backlog: `SELECT kind, status, count(*), min(available_at) FROM jobs GROUP BY 1, 2;` Pending rows far in the past mean the worker is down or stuck; restart it (leases expire and other workers pick the job up).
- Failed jobs stay for inspection: `SELECT id, kind, deduplication_key, attempts, available_at FROM jobs WHERE status = 'failed' ORDER BY available_at DESC LIMIT 50;` The reason is in the worker log line `job <kind> <id> attempt <n> failed: ...`. After fixing the cause, retry one with `UPDATE jobs SET status = 'pending', attempts = 0, available_at = NOW() WHERE id = ...;` Handlers are idempotent.

## Notifications not arriving

Check `notification_deliveries` for the user and kind: `status` and `detail` show whether it was sent, skipped (provider not configured, opted out, no push token) or failed with the provider error. A dead push token is removed automatically; the student gets it back by opening the app.

## Account deletion

Requests finalize after 7 days by the hourly `account.finalize_deletions` job. If a Firebase identity was not removed (no service account set), the `account.delete_identity` job fails visibly; remove the user in the Firebase console, then mark the job done. Staff accounts cannot self-delete (`DELETION_NEEDS_SUPPORT`): remove their roles first, then process the request.

## AI checks

Turn AI off fast by clearing `LLM_API_KEY` on the worker and restarting it, or per exam on the admin exam page. Spend: `SELECT * FROM ai_spend_months ORDER BY month DESC;` Reviews continue without AI; nothing waits on it.

## Scheduled publishing

The API publishes approved tests at their scheduled time every minute (several API instances are safe). A test that did not go live: check its status is `scheduled` and `scheduled_publish_at` has passed, then look for "Scheduled publishing check failed" in API logs.

## Routine cadence

Daily: QC SLA/report backlog, payment pending/ack status, failed jobs and backups. Monthly: bank/provider reconciliation, payout preview, first-cycle holds, examiner tiers, restore drill and budget review. Quarterly: finance certificate upload and access/retention review. Maintain PYQ year/shift coverage and reviewer capacity plan; do not assume 15,000 questions without actual templates.
