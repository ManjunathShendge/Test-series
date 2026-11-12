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

## Routine cadence

Daily: QC SLA/report backlog, payment pending/ack status, failed jobs and backups. Monthly: bank/provider reconciliation, payout preview, first-cycle holds, examiner tiers, restore drill and budget review. Quarterly: finance certificate upload and access/retention review. Maintain PYQ year/shift coverage and reviewer capacity plan; do not assume 15,000 questions without actual templates.
