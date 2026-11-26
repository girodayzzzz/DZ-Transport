# V5 baseline audit

Reviewed main at `f13ae54` and PRs [#1](https://github.com/girodayzzzz/DZ-Transport/pull/1), [#2](https://github.com/girodayzzzz/DZ-Transport/pull/2), [#3](https://github.com/girodayzzzz/DZ-Transport/pull/3), and [#4](https://github.com/girodayzzzz/DZ-Transport/pull/4). All four were merged on 26 November 2026. V4 added one migration and delivered customer onboarding and OAuth entry from Register. Its PR describes the remaining V4 work as open.

| Area | Baseline |
| --- | --- |
| Site and mobile | Static Astro site in Slovenian, English and German. Existing Playwright suite tests localized routes, mobile layout, accessibility checks and preview safeguards. |
| Authentication | Supabase email and Google PKCE, gated portal settings and an AAL2 check for manager operations. OAuth browser tests use Supabase fixtures. Hosted email, Google redirect and MFA rehearsal is open. |
| Customer dashboard | Resumable private/business onboarding, cardless Free activation, own inquiries, offers, orders and status history. Guest linking, billing and business reporting are open. |
| Carrier dashboard and verification | Legacy administrator approval/suspension and company name, services and coverage. License evidence, expiry, insurance and multi-user organization access are open. |
| Marketplace | Curated per-carrier invitations and private quotations. General publication, enforceable quotas and fixed-price workflows are absent. |
| Transport manager and finance | MFA-protected administration, controlled order transitions and private cost data. Aggregates cover accepted offers on completed transports by currency. Payment reconciliation and cash revenue reporting are absent. |
| Membership and Stripe | Onboarding includes a Free label. Basic/Pro plan catalog, configurable entitlements, Checkout, billing events and Stripe configuration are absent. |
| Database migrations | Reviewed all five in order. 001 establishes RLS, role and ownership helpers, history and audit. 002 contains workflow RPCs, finance and deletion requests. 003 contains service-role guest intake and deduplication. 004 contains a private retention function. 005 adds customer onboarding fields with column-scoped profile writes. |
| Maintenance and security | Keep common inquiry/order state, notifications, MFA and audit helpers. Legacy assignment checks carrier approval without locking the role, and advances status before inserting the assignment, so the history trigger misses the first carrier notification. Existing customer, carrier and manager portal code shares one entry point. No equivalent Quick Deal workflow was found. |

The [main verification run](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45886737666) passed build and database jobs and skipped deploy. The [Pages run](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45886736603) failed because legacy Jekyll interpreted Astro front matter. Pages reports legacy publishing and an errored state. The review URL returned 404. The production hostname returned a gateway 403 from this environment, leaving production status unverified. Owner setup and verification are documented in [Deployment](../DEPLOYMENT.md).

The launch order is assignment stabilization, database-enforced Quick Deal review and reservation, evidence-backed carrier verification and dashboard integration. Keep commercial rollout gated pending verification of actual carrier requirements and approved terms. Use [Owner Configuration](../OWNER-CONFIGURATION.md) and [Free-tier limits](../FREE-TIER-LIMITS.md) for hosted dependencies.
