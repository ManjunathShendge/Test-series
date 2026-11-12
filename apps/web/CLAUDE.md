# Web instructions

Read docs/WEB.md and root CLAUDE.md. For UI read root SKILL.md, design master and matching override.

- Thin route/layout composition; feature folders own UI/query logic. NestJS owns domain rules.
- Public SEO metadata may cache; private attempts, keys, invoices and admin data must not enter shared caches.
- Use API adapter/contracts, no ad hoc DTOs or database access from browser code.
- Web attempt writes IndexedDB before saved acknowledgement; use shared engine and server session epoch.
- Razorpay appears only on web. Confirmation needs server-verified purchase state.
- Client role checks do not replace backend access checks.
- Keep secret env vars server-only; cookie-based mutations require CSRF controls.
- Verify keyboard/zoom/Hindi/math/responsive behavior and every pending/error state.
