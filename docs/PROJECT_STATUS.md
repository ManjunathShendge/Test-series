# Project status

Date: 13 November 2026.

## Completed

- Reviewed requirement.text and all 19 extracted PRD pages; visually inspected the payment policy page.
- Preserved source inputs and created reconciled architecture/system/Claude Code documentation.
- Identified latest authentication/billing decisions and technical/business gates.
- Ran SKILL.md searches after supporting files appeared; applied relevant accessibility matches and retained a disclosed manual visual fallback because returned styles did not fit adult timed exams.

## Implementation state

M0 in progress: directory structure and .gitignore only. No package manifests, application code, database migrations, CI jobs, provider accounts or deployments were created. No application tests or native/store checks have run. Documentation validation is recorded in SOURCES.

## Log

```text
Date / milestone / requirement IDs: 11 November 2026 / M0 (started: folder skeleton only) / R26
Implemented behavior and changed paths:
  - Moved UI/UX Pro Max support folders data/, scripts/, templates/ into
    .claude/skills/ui-ux-pro-max/ (the path SKILL.md's search commands expect);
    removed generated scripts/__pycache__. Root SKILL.md unchanged (source input).
  - Created ARCHITECTURE package layout: apps/api/src/{common,config,providers,
    modules/<10 modules>}, apps/api/test, apps/{web,mobile}/{app,src/features,
    src/lib,src/ui}, packages/contracts/src/<6 domains>,
    packages/engine/src/{reducer,timing,scoring,sections},
    packages/db/{prisma,migrations,seeds}, docker/postgres, .github/workflows.
    Empty folders hold .gitkeep only; no manifests or code yet.
Checks run: search.py "error summary validation" --domain ux from new location returned
  the expected Focusable Error Summary result.
Unavailable checks and reason: no package manifests yet, so no typecheck/lint/test/build.
  Docker is not installed on this machine (Node v22.18.0, pnpm 11.12.0, Python 3.12 present).
  Repository is not a git repository yet.
Open decision IDs / blocking dependency: none for M0; Docker required for Compose verification.
Next concrete action: M0 tooling: verify current Next/Nest/Expo/Prisma/pg-boss compatibility,
  then root package.json, pnpm-workspace, turbo, strict tsconfig, per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (folder structure only) / R26
Implemented behavior and changed paths:
  - Expanded the skeleton into the full documented layout. apps/api/src gains
    common/{decorators,filters,guards,interceptors,pipes,errors,logging,types,utils},
    config/env, database, health, outbox, jobs, providers/<8 adapters> and
    modules/<10>/{http,application,domain,repositories,jobs} matching the
    ARCHITECTURE dependency direction; apps/api/test/{integration,e2e,fixtures,helpers}.
  - apps/web: app route groups (public)/(student)/(examiner)/(staff), src/features/<9>,
    src/lib/{api,auth,config,query,storage,utils}, src/ui/{primitives,patterns,tokens},
    public, test/{unit,e2e}.
  - apps/mobile: expo-router app/{(auth),(tabs),attempt}, src/features/<6 student-only>,
    src/lib/{api,auth,billing,storage,notifications,config}, src/ui/<3>, assets, test/unit.
  - packages/contracts/src adds common/ beside the six documented domains, plus test/;
    packages/engine adds test/; packages/db adds src/ and test/.
  - docker/{postgres/init,minio,mailpit,firebase} for the SETUP.md Compose services.
  - Root .gitignore created (env/secret, native credential, build, volume and coverage rules).
    144 .gitkeep markers; no empty directory left unmarked.
Checks run: directory tree printed and verified against ARCHITECTURE "Package layout" and
  the module ownership table; no empty directories remain.
Unavailable checks and reason: no package manifests, so typecheck/lint/test/build still
  cannot run. Docker not installed on this machine. Repository is still not git-initialised,
  so .gitkeep/.gitignore are inert until `git init`.
Open decision IDs / blocking dependency: contracts coverage for the results, payouts,
  notifications and admin modules is undefined - ARCHITECTURE lists six contract domains
  against ten API modules. Resolve by folding them into existing domains or amending
  ARCHITECTURE before M1 contracts work.
Next concrete action: git init plus initial commit, install Docker Desktop, then M0 tooling:
  verify Next/Nest/Expo/Prisma/pg-boss compatibility and create root package.json,
  pnpm-workspace, turbo, strict tsconfig and per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (documentation reconciliation) / R13 R15 R17 R18 R26 R27
Implemented behavior and changed paths:
  - Preserved the owner-supplied mobile stack note verbatim at
    docs/sources/MOBILE_STACK_NOTE_2026-11-12.md with a provenance header; registered it in SOURCES.
  - DECISIONS gains E14-E20 (storage, package naming, attempt sub-routes, timer offset,
    S2-gated renderer, server-issued device ID, analytics residency), a refinements paragraph,
    conflicts C1-C4 and an unverified-version note.
  - Applied the adopted structural items only: apps/mobile/app/attempt/[id] and
    apps/mobile/src/lib/guards.
Checks run: mobile tree reprinted and compared against DECISIONS E15/E16; no empty directories.
Unavailable checks and reason: still no manifests, so typecheck/lint/test/build cannot run;
  library versions in the note were not verified because that is M0 tooling work against vendor docs.
Open decision IDs / blocking dependency: C1 phone OTP versus D01, C2 Android Razorpay versus D02,
  C3 late-batch grace window versus E09/O12, C4 third-device behavior. C1-C3 block dependent
  M1, M7 and M9b work; they do not block M0 tooling.
Next concrete action: owner rules on C1-C4, then git init and M0 tooling version resolution.
```

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (decision resolution) / R13 R15 R18 R26 R27
Implemented behavior and changed paths:
  - Researched and resolved C1-C4 in DECISIONS against vendor documentation, at owner instruction:
    C1 no phone OTP (D01 stands), C2 Apple IAP on iOS and Play Billing only on Android for MVP
    (D02 stands, user choice billing deferred to Phase 2), C3 strict deadline (E09/O12 stand),
    C4 third device blocked with student-initiated revoke.
  - Replaced the unverified-version note with a validated table: Expo SDK 58 current, not 55;
    expo-iap required because react-native-iap dropped Expo support at v15; mmkv v4 createMMKV
    confirmed; iOS screenshot behavior corrected; Razorpay not applicable on mobile.
Checks run: five web searches against Expo changelog/docs, Play Console Help, OpenIAP/npm and
  Apple external-purchase-entitlement coverage. Findings recorded with sources in the chat reply.
Unavailable checks and reason: no manifests, so typecheck/lint/test/build still cannot run;
  store behavior and device screenshot behavior need real-device and sandbox evidence (S4, M13).
Open decision IDs / blocking dependency: none blocking M0. O03 net-revenue definition and O09
  GST/TDS treatment remain owner/CA items; C2 keeps them simpler by using one provider per platform.
Next concrete action: git init plus initial commit, then M0 tooling: resolve Expo SDK 58 /
  React Native 0.88 / Next / Nest / Prisma / pg-boss compatibility as a set and write the manifests.
```

## Next action

Continue M0 tooling per the latest log entry, using the bootstrap prompt in PROMPTS.md. Business choices in DECISIONS may proceed independently; S4 must resolve mobile SKU type and correlation before mobile checkout implementation is finalized.

## Update template

```text
Date / milestone / requirement IDs:
Implemented behavior and changed paths:
Checks run (command, outcome, evidence):
Unavailable checks and reason:
Open decision IDs / blocking dependency:
Next concrete action:
```
