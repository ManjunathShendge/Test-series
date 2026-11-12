# Exam Prep Marketplace UI master

Provenance: root SKILL.md plus local search results. Supporting scripts/data appeared during the task and were subsequently queried. The design-system search `education exam marketplace accessible` returned Vibrant & Block-based/editorial typography; one narrower retry `education learning dashboard` returned Claymorphism/children's typography. Neither fits adult timed exam preparation, so the visual tokens below remain an explicit manual fallback, not a verified style match. Next.js and React Native/Expo are specified by requirements. This is a small token/interaction specification for existing accessible primitives, not a custom component framework. Brand remains provisional.

Verified relevant results: UX `error summary validation` returned Focusable Error Summary, Error Messages and Error Placement; React Native `accessibility` returned roles, labels and TalkBack/VoiceOver testing. Apply those rules: failed-submit summary receives focus and links to invalid fields; each field retains an associated inline error; native controls expose semantic roles/labels. Initial native query had no match and was retried once. Next.js search supported public-env separation and responsive images; its generic Server Actions recommendation does not override the specified NestJS domain boundary. Dataset version labels are not a dependency compatibility certification.

## Product direction

Calm, readable learning interface with clear progress and trustworthy purchase/QC states. Students use phones in variable connectivity; staff need compact review tables and side-by-side content. Prioritize correctness and legibility over animation. Mobile-first; no marketing embellishments in timed attempts.

## Proposed tokens

| Token | Value / use |
|---|---|
| background / surface | #F8FAFC / #FFFFFF |
| text / secondary text | #0F172A / #475569 |
| primary / on-primary | #1D4ED8 / #FFFFFF |
| success / warning / error | #166534 / #92400E / #B91C1C, paired with text/icon |
| border / focus | #CBD5E1 / #1D4ED8; focus needs contrast against adjacent surfaces |
| font | System sans; bundled Devanagari-capable fallback; validate Hindi shaping and math baseline |
| body | 16px equivalent, line-height >=1.5; never body <12px |
| spacing | 4, 8, 12, 16, 24, 32, 48px |
| radius | 8px controls, 12px cards |
| motion | Subtle 120-200ms interaction feedback; reduced-motion alternative |

Tokens are proposals, not validated brand assets. Verify text contrast >=4.5:1, larger text/UI boundaries per applicable accessibility criteria, and actual component states in implementation. Never encode status by color alone. Use semantic tokens in components rather than scattered hex literals.

## Interaction and responsive rules

44x44px minimum touch targets with adequate spacing; visible labels and focus rings; keyboard navigation and escape/return-focus behavior. SVG icon system, no emoji as interface icons; meaningful alt text, decorative icons hidden from screen readers. Loading/success/error feedback and inline validation with focusable error summary. Never use only hover affordances.

Small screen: one content column and sheet/drawer filters; medium: optional side panel; wide: bounded reading width with staff split view. Proposed breakpoints 640/1024px, verify with content not device names. No page-level horizontal overflow; tables may use labeled local scroll regions. Support font scaling, browser zoom, safe-area insets and touch keyboard.

Lists/cards show exam/language/question count/duration/price and one clear action. Do not show unavailable Phase 2 features as working. Bottom navigation <=5 destinations. Chart values have table/text alternatives, legends and non-color distinctions. Student progress uses simple trend/section bars and sample counts.

## Required states

Loading, empty, error/retry, permission denied, session expired, offline, saved on device, synced, submission pending, payment pending and content quarantined. Keep those states distinct; do not show “saved” for a failed persistence operation or “purchased” for an unverified transaction.

## Review checklist

Keyboard + screen reader; 200% zoom/font scaling; English/Hindi/maths/tables; 320px narrow viewport; touch targets; contrast; reduced motion; safe-area/header overlap; image dimensions and lazy loading; no layout shift from timers; input errors close to field; selected palette meaning announced; privacy-safe analytics. Page override wins only for named exceptions. No visual implementation has been audited yet.
