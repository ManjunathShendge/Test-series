# Project status

Date: 15 November 2026.

## Completed

- Reviewed requirement.text and all 19 extracted PRD pages; visually inspected the payment policy page.
- Preserved source inputs and created reconciled architecture/system/Claude Code documentation.
- Identified latest authentication/billing decisions and technical/business gates.
- Ran SKILL.md searches after supporting files appeared; applied relevant accessibility matches and retained a disclosed manual visual fallback because returned styles did not fit adult timed exams.

## Implementation state

M0 in progress: workspace manifests, TypeScript project graph and API/web health routes exist (phases 1 to 3). A demo-grade student mobile app runs in Expo Go on local demo data, with no backend calls, real auth or real billing (see the 15 November log entry and DECISIONS X1 to X5). No database migrations, CI jobs, provider accounts or deployments exist. No automated application tests or native/store checks have run.

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

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (toolchain) / R26
Implemented behavior and changed paths:
  - Published the repository baseline to GitHub (commit db7b43e, 284 files). Client-confidential
    sources are gitignored and absent from history; verified the PRD PDF returns 404 on the remote
    while CLAUDE.md returns 200. Added docs/sources/README.md. Fixed the global git user.name value.
  - Installed Docker Desktop 4.99.0 via winget on an existing WSL2/Ubuntu setup.
Checks run (command, outcome, evidence):
  - docker version: client and server 29.9.3; docker compose version: v5.7.0; engine Linux, 8GB.
  - postgres:18-alpine container: server_version 18.6; CREATE EXTENSION pg_trgm and btree_gin both
    succeeded (pg_trgm 1.6, btree_gin 1.3); similarity('railway recruitment','railway recruitement')
    returned 0.77272725. Container removed afterwards.
  - npm registry dist-tags read directly: next 16.4.6, @nestjs/core 12.5.0, @prisma/client 7.10.1,
    pg-boss 12.38.2, expo 58.0.25, expo-iap 6.4.4, zod 4.6.7, turbo 2.11.11.
Unavailable checks and reason: no manifests yet, so typecheck/lint/test/build still cannot run.
Open decision IDs / blocking dependency:
  - prisma npm "latest" tag resolves to 8.0.0-rc.33, a release candidate, while @prisma/client
    latest is 7.10.1 stable. Pin both to 7.10.1; never install prisma from the latest tag.
  - Local Node is 22.18.0. NestJS 12 runtime needs 22.12+, but its CLI generators need 22.22.3+.
    Bump within the 22 line before using nest CLI generators.
  - NestJS 12 ships core packages as ESM and defaults new projects to Vitest and oxlint; TESTING.md
    predates this and needs a decision during manifest work.
Next concrete action: write the M0 workspace manifests, Compose file and env validation against the
  pinned set above, then run the clean-clone flow.
```

```text
Date / milestone / requirement IDs: 15 November 2026 / mobile client demo (ahead of M-series) /
  PRD 6.1 to 6.7
Implemented behavior and changed paths (apps/mobile):
  - Design tokens and primitives from design-system MASTER; typed demo repository with key-free
    papers and solutions held separately; zustand stores for session, results and the attempt.
  - Screens: sign-in, onboarding, Home, Discover, exam, examiner, series, test detail, purchase
    sheet, instructions, attempt, result and review, Progress, practice lists, Profile, edit exams.
  - Phase G: on-device persistence and resume, coupon and examiner codes, GST-inclusive price,
    price band filter, edit target exams, continue-attempt wiring.
  - Phase H: shared review card, cross-attempt mistake notebook and bookmarks, single bookmark
    source, sign-out clears results and any live attempt, chart label and header fixes.
Checks run (command, outcome, evidence):
  - pnpm exec tsc --noEmit in apps/mobile: exit 0. pnpm exec oxlint app src: no findings.
  - Manual walkthrough on Android emulator Pixel_10a in Expo Go with screenshots: sign-in,
    onboarding, Home, Discover filters, purchase with ANITA10, instructions, attempt, kill and
    relaunch mid-attempt resumed on the same question with the saved answer, leave dialog,
    Progress, practice lists, result, exam tabs, series, examiner, Profile, sign-out.
Unavailable checks and reason: no automated tests yet for the mobile app; native Android build
  blocked by the space in the repository path (DECISIONS X1); no iOS device or simulator.
Open decision IDs / blocking dependency: X1 repository relocation (owner), X4 and O09 GST
  treatment (CA), X5 and S4 store coupon and SKU strategy.
Next concrete action: owner decides on relocating the repository; then resume M0 phases 4 and 5
  (Compose, env validation, CI) and add Vitest coverage for the attempt store and practice lists.
```

## Next action

Owner decides on relocating the repository to a path without spaces (DECISIONS X1). Then continue M0 phases 4 and 5 per the latest log entry, using the bootstrap prompt in PROMPTS.md. Business choices in DECISIONS may proceed independently; S4 must resolve mobile SKU type and correlation before mobile checkout implementation is finalized.

## Update template

```text
Date / milestone / requirement IDs:
Implemented behavior and changed paths:
Checks run (command, outcome, evidence):
Unavailable checks and reason:
Open decision IDs / blocking dependency:
Next concrete action:
```
