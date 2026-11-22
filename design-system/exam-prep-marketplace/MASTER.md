# Exam Prep Marketplace UI master

Provenance: root SKILL.md plus local search results. Supporting scripts/data appeared during the task and were subsequently queried. The design-system search `education exam marketplace accessible` returned Vibrant & Block-based/editorial typography; one narrower retry `education learning dashboard` returned Claymorphism/children's typography. Neither fits adult timed exam preparation, so the visual tokens below remain an explicit manual fallback, not a verified style match. Next.js and React Native/Expo are specified by requirements. This is a small token/interaction specification for existing accessible primitives, not a custom component framework. Brand remains provisional.

Verified relevant results: UX `error summary validation` returned Focusable Error Summary, Error Messages and Error Placement; React Native `accessibility` returned roles, labels and TalkBack/VoiceOver testing. Apply those rules: failed-submit summary receives focus and links to invalid fields; each field retains an associated inline error; native controls expose semantic roles/labels. Initial native query had no match and was retried once. Next.js search supported public-env separation and responsive images; its generic Server Actions recommendation does not override the specified NestJS domain boundary. Dataset version labels are not a dependency compatibility certification.

## Product direction

Calm, readable learning interface with clear progress and trustworthy purchase/QC states. Students use phones in variable connectivity; staff need compact review tables and side-by-side content. Prioritize correctness and legibility over animation. Mobile-first; no marketing embellishments in timed attempts.

## Tokens (mobile and web, owner palette 19 November 2026 plus logo blue 22 November 2026; DECISIONS V1-V9)

| Token | Value / use |
|---|---|
| brand palette | #001D39 navy, #0A4174 navy blue, #49769F steel, #4E8EA2 teal, #6EA2B3 cyan, #7BBDE8 sky, #BDD8E9 ice, #0569D6 logo blue |
| brand / on-brand | #0569D6 / #FFFFFF (links, emphasis, active and progress indicators on light surfaces; never text on navy) |
| background / surface / muted | #F2F7FB / #FFFFFF / #E4EEF6 |
| text / secondary text | #001D39 / #49769F (not on ice tiles; use #0A4174 there) |
| primary / on-primary | #0A4174 / #FFFFFF; pressed #001D39 |
| accent / on-accent | #7BBDE8 / #001D39 (CTAs and selection on navy) |
| inverse surfaces | #001D39 with #FFFFFF and #BDD8E9 text |
| success / warning / error / review | #166534 / #92400E / #B91C1C / #6D28D9, state only, paired with icon/shape |
| border / focus | #D3E3EF / #0A4174 |
| font | Outfit (display, title, heading, metric) + Inter (body, labels, tabular digits); system Devanagari fallback |
| type scale | hero 30, display 26, title 20, heading 17, metric 36, body 15/22, small 13/18, caption 12/16 |
| spacing | 4, 8, 12, 16, 24, 32, 48px; page gutter 20 |
| radius | 8, 12, 20 cards and tiles, 28 hero cards, pill buttons |
| motion | 120-200ms feedback, 320ms slides; illustration drift off with Reduce Motion |

Web keeps the earlier provisional tokens until the web UI is restyled.

Tokens are proposals, not validated brand assets. Verify text contrast >=4.5:1, larger text/UI boundaries per applicable accessibility criteria, and actual component states in implementation. Never encode status by color alone. Use semantic tokens in components rather than scattered hex literals.

## Interaction and responsive rules

44x44px minimum touch targets with adequate spacing; visible labels and focus rings; keyboard navigation and escape/return-focus behavior. SVG icon system, no emoji as interface icons; meaningful alt text, decorative icons hidden from screen readers. Loading/success/error feedback and inline validation with focusable error summary. Never use only hover affordances.

Small screen: one content column and sheet/drawer filters; medium: optional side panel; wide: bounded reading width with staff split view. Proposed breakpoints 640/1024px, verify with content not device names. No page-level horizontal overflow; tables may use labeled local scroll regions. Support font scaling, browser zoom, safe-area insets and touch keyboard.

Lists/cards show exam/language/question count/duration/price and one clear action. Do not show unavailable Phase 2 features as working. Bottom navigation <=5 destinations. Chart values have table/text alternatives, legends and non-color distinctions. Student progress uses simple trend/section bars and sample counts.

## Required states

Loading, empty, error/retry, permission denied, session expired, offline, saved on device, synced, submission pending, payment pending and content quarantined. Keep those states distinct; do not show “saved” for a failed persistence operation or “purchased” for an unverified transaction.

## Review checklist

Keyboard + screen reader; 200% zoom/font scaling; English/Hindi/maths/tables; 320px narrow viewport; touch targets; contrast; reduced motion; safe-area/header overlap; image dimensions and lazy loading; no layout shift from timers; input errors close to field; selected palette meaning announced; privacy-safe analytics. Page override wins only for named exceptions. No visual implementation has been audited yet.
