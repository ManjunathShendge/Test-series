# Sources, verification and limitations

Prepared 11 November 2026. This is an implementation blueprint, not a deployed system.

## Supplied sources

- [requirement.text](../requirement.text): 1,212 lines including original ten-file proposal and later authentication/store-billing amendments. Later explicit decisions were applied; superseded snippets were not copied blindly.
- [Original PRD](../PRD__Exam_Prep_Marketplace.pdf): 19 pages, dated 2 November 2026, attributed to @AtharAli. Workspace copy is byte-identical to the Downloads PDF referenced by the IDE. All pages text-extracted; page 12 visually checked for policy table structure. [PRD.md](PRD.md) retains page markers and extraction artifacts.
- [Mobile stack note, 12 November 2026](sources/MOBILE_STACK_NOTE_2026-11-12.md): owner-supplied note pasted from another chat session, preserved verbatim with a provenance header. Adopted, deferred and conflicting items are reconciled in DECISIONS E14-E20 and C1-C4. Its library versions and several aggregator citations are unverified; M0 confirms versions against vendor documentation before pinning.
- [SKILL.md](../SKILL.md): 217-line UI/UX Pro Max instructions. Supporting scripts/data/templates appeared in the workspace during the task and were queried before delivery. Both design-system searches were unsuitable for adult timed exams, so visual tokens remain a disclosed manual fallback. Relevant UX error-summary and React Native accessibility matches were applied; Next.js matches were filtered against the architecture. See design MASTER for queries/results. The referenced references/pro-rules.md remains unavailable; no implemented UI is being delivered. Stack comes from requirements.

## Official technical references consulted

- [Claude Code memory](https://code.claude.com/docs/en/memory): root/scoped instruction-file structure and loading guidance; used in CLAUDE_WORKFLOW.
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/): billing/product/login review context; exact SKU suitability and regional approval remain gates.
- [Google Play billing security](https://developer.android.com/google/play/billing/security): server verification, account association and acknowledgement/consumption safeguards.
- [Firebase account linking](https://firebase.google.com/docs/auth/web/account-linking): authenticated linking rather than a custom email-based account merge.

These sources were accessed during documentation preparation; recheck changing SDK APIs/policies before implementation. Vendor prices, free-tier quotas, tax rates, legal text, store eligibility and official exam patterns have not been certified here. Historical pricing in requirement.text is not repeated as a current guarantee.

## Documentation verification

Validation completed: 37 project Markdown files created; zero broken local Markdown links; balanced code fences in generated files; root CLAUDE.md is 77 lines; all 19 source-page markers present in PRD.md. Two externally added skill-template Markdown files are excluded from the deliverable count. PRD sections and amendments are mapped in REQUIREMENTS and DECISIONS. Original sources were not edited. Code/CI/native/store tests do not exist yet; no application validation is claimed.

Source SHA-256 fingerprints at delivery:

| File | SHA-256 |
|---|---|
| SKILL.md | 14f43337edfbf7822e091428e4ae0c6f92f86e3353deda6a30f6613121e2cf2d |
| requirement.text | f1f95ad982a761c1a39211fea3ad13acb021adbcb84a29ca9d1c9b92b5766b58 |
| PRD__Exam_Prep_Marketplace.pdf | 3d154db6748b78678d451ec16e0c685e78265d047dde63d2064d349b4f651681 |

Engineering additions (outbox, protected immutable AI records, account linking, session epochs, payment correlation, correction maps, quarantine gating) are explicitly reconciled in DECISIONS. Optional business defaults remain proposals with named owner gates. Prompt templates contain intentional angle-bracket task parameters, not unresolved implementation values.
