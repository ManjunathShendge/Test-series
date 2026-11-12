# Copy-ready development prompts

These prompts implement the supplied architecture one milestone at a time. Run from repository root. They do not authorize production provisioning or public release.

## Bootstrap: first prompt

```text
Read CLAUDE.md, docs/DECISIONS.md, docs/PROJECT_STATUS.md,
docs/ARCHITECTURE.md, docs/SETUP.md and M0 in docs/ROADMAP.md.
Implement M0 only. Inspect existing files before creating or replacing anything.
This repository currently contains documentation; create the three apps and
three shared packages described there, compatible pinned tooling, local
Compose dependencies/emulators, validated environment examples, health routes,
documented scripts and CI. Use synthetic data and fake/sandbox providers.
Check official compatibility docs before choosing package versions.
Do not build later product features, provision paid resources or deploy.
Verify the clean-clone setup and relevant typecheck/lint/test/build commands.
Update docs/PROJECT_STATUS.md with actual evidence and remaining failures.
Report what works, changed files, exact checks and the next milestone.
```

## Implement a milestone

```text
Implement milestone <MILESTONE_ID> from docs/ROADMAP.md.
Read CLAUDE.md, scoped CLAUDE.md files, docs/DECISIONS.md and the milestone's
referenced documents. Map scope to docs/REQUIREMENTS.md IDs.
Inspect the current implementation and complete only this milestone.
Define contracts before endpoints; include migrations and meaningful invariant
tests. Enforce ownership, audit/outbox atomicity and idempotency where relevant.
Keep proposals distinct from approved policy. If an unresolved owner decision
blocks one part, identify it precisely and continue independent authorized work.
Run the applicable checks, fix failures, and update documentation/status.
Report completed acceptance criteria, evidence, limitations and next action.
```

## UI implementation

```text
Implement <SCREEN/FLOW> for <WEB_OR_MOBILE> within milestone <ID>.
Read SKILL.md, design-system/exam-prep-marketplace/MASTER.md and any matching
page override, plus the feature contract. Inspect existing components first.
Use the supplied stack and accessible primitives. If skill search resources
remain missing, explicitly use the documented manual fallback; do not invent
database results. Include loading, empty, error, offline and permission states.
Verify keyboard/screen-reader behavior, touch targets, Hindi/math rendering,
font scaling, responsive layout and genuine persistence/payment status.
Do not expose Phase 2 features or internal implementation details to users.
Report actual visual/interaction checks and any unavailable device verification.
```

## Payment and synchronization review

```text
Review <CHANGE_OR_PATHS> against docs/PAYMENTS.md, docs/TEST_ENGINE.md,
docs/SECURITY.md and docs/DATA_MODEL.md as applicable.
Trace concurrency, lost responses, duplicate/out-of-order events, process kill,
deadline/section enforcement, session replacement, refunds and recovery.
Identify concrete failures with file/line and reproduction. Check key leakage,
provider/account/product binding, unique economic effects and acknowledged
answer durability. Fix authorized defects and add regression tests that fail
before the fix. Do not invent evidence or weaken invariants to pass tests.
```

## Handoff / resume

```text
Read CLAUDE.md and docs/PROJECT_STATUS.md. Inspect files and test evidence to
verify the handoff. Continue the active milestone from its recorded next step;
do not restart completed work. Preserve user changes and source inputs.
Update status with exact completion, checks, open decisions and next action.
```

## Pre-release assessment

```text
Audit the implemented project against docs/REQUIREMENTS.md and
docs/LAUNCH_CHECKLIST.md. For every gate cite actual code/test/operational
evidence or mark it unverified. Run available checks without production writes.
Separate code defects, missing evidence and owner/legal/store decisions.
Do not claim release readiness from documentation alone or deploy the project.
```
