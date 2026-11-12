# Attempt engine and synchronization protocol

Applies equally to web and mobile. MVP supports transient disconnection after online start; fully offline testing is deferred. See [decisions](DECISIONS.md), [API](API_CONTRACTS.md), [results](RESULTS.md).

## Start and paper security

Instructions and acceptance checkbox precede start. Server checks account/device, availability, entitlement and active session atomically, pins test/template/group versions, and sets started_at/deadline_at. Return opaque attempt ID, session epoch/credential, server_now, section windows and short-lived paper URL. Retries return the existing attempt with the same start time; failure to download does not reset the clock.

Paper allowlist: question/group IDs, bilingual stems/options, permitted assets, sections and instructions. Exclude keys, worked solutions, AI notes, QC evidence and reviewer comments. Pre-rendered HTML/assets must also be free of solutions. Review uses a separate authenticated endpoint. No public bulk bank endpoint.

## Pure engine

Events: visit, select, clear, mark/unmark, save-next, section transition, language change, zoom, submit request. Five palette states: unvisited, visited unanswered, answered, marked unanswered, marked answered. Marking does not erase a selected answer; answered-and-marked is scored. One correct option only; assertion/reason and matching are formatted MCQs. No calculator at launch.

Client bindings supply clock, persistence and network; reducer performs no I/O. Server uses the same deterministic scoring/section primitives with its own authoritative data. Key material is never bundled into clients even if scoring code is shared.

## Durable outbox protocol

1. Persist event and materialized state in a single SQLite (mobile) or IndexedDB (web) transaction before showing “saved on device”. Storage failure blocks that acknowledgement and shows retry.
2. Sequence increases per attempt/session epoch. Keep selected option, marked flag and navigation cursor; include cumulative timing counters rather than additive retry-sensitive deltas.
3. Flush every 5s when dirty, with jitter, on background best-effort and on submit. Background callbacks are not guaranteed.
4. Request contains epoch, contiguous events and last known ack. Server serializes ingestion per attempt, verifies session, membership, deadline/section window and sequence. Repeated seq with same payload is a no-op; differing payload is a conflict.
5. Commit events, projection and contiguous watermark together. Return ack_seq, server_now, deadline, canonical section state and status. Never ack gaps or silently skip invalid events.
6. Delete only events at or below an acknowledged contiguous watermark for the same epoch. On lost response, resend unchanged batch. Bounded exponential backoff; refresh auth without changing event IDs.
7. On relaunch, restore durable cursor/events, reconnect, reconcile server state, flush, then resume. Keep local data until terminal confirmation and retention cleanup.

Protocol example (illustrative contract, not implemented):

```json
{"epoch":2,"events":[{"seq":18,"kind":"select","questionVersionId":"opaque-id","optionId":"B","marked":false,"cumulativeTimeMs":18000}],"lastAckSeq":17}
```

## Time, sections and device takeover

Use monotonic time + server offset within a running process. Monotonic origins reset across process/device restart: re-anchor with server time before accepting resumed answers. Display cached state while offline after restart, with timing unverified; never silently restart a duration. Device wall-clock changes grant no time.

Server enforces overall and sectional deadlines, locked-section navigation and forward transitions. Early section completion locks that section; unused time is not transferable unless the immutable template explicitly allows it. Offline client may display the next scheduled section; server validates every received event against the applicable window. Client timestamps are telemetry, not proof of timely answering.

Two registered devices per account; one active attempt session. Explicit takeover under row lock increments epoch, revokes prior session and reconciles accepted answers. Old-epoch uploads return SESSION_REPLACED; warn that unsynced old-device changes cannot be merged safely. Browser tabs also coordinate a single writer, with server enforcement remaining authoritative.

## Deadline and submit race

Proposed strict policy E09/O12: only events received by the API before deadline/section close are eligible. Use server ingress timestamp, bounded request sizes and authenticated ingestion; queue delay must not penalize already accepted events. A finalizer delay (proposed 30 seconds) drains in-flight work and does not authorize new late answers.

Manual submit includes final events and expected last sequence in one transaction; server ingests eligible final events and closes attempt atomically. An ack gap returns conflict with canonical state; client retries, without claiming submission succeeded. Finalizer and manual submit acquire the same attempt lock; one terminal transition wins, retries return its result. Persist submit intent offline and display “submission pending”; never show a confirmed result from local scoring.

Unsent offline events after the deadline remain locally recoverable for support but do not automatically change scores. The PRD's reliability promise requires this limitation to be visible and product-approved. No protocol can both trust arbitrary offline timestamps and prevent clock/answer tampering.

## Required evidence

Crash before/after local commit; response lost after server commit; event duplicates and gaps; forged seq/option IDs; app reboot; clock skew; section expiration; timeout/manual-submit race; finalizer retry; lease takeover; revoked entitlement; WebView rendering and 4G load. Measure local save p95 <300ms separately from network sync latency. Test packet loss and restart on physical Android/iOS plus browser storage failure.
