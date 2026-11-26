# DZ Transport V5 delivery

This branch delivers Phase A audit and assignment stabilization and the manual Quick Deal workflow from Phase B. See the [V4 baseline audit](V5-BASELINE-AUDIT.md) and [Quick Deal guide](../QUICK-DEAL.md).

## Completion matrix

| Scope | Status | Result or remaining work |
| --- | --- | --- |
| V4 audit | Implemented and verified | All four prior PRs merged. V4 was customer onboarding and OAuth registration entry. Audit records incomplete V4 workflows and hosting results. |
| Existing assignment stabilization | Implemented and verified | Locks the carrier approval during assignment, prevents assigning one's own inquiry, and makes the assignment visible to the status notification trigger. |
| Quick Deal manual workflow | Implemented but awaiting configuration | Local SQL and browser fixture verification. Gated manager drafting, publication, eligibility, booking, expiry and award. Carrier filtering and requests. Supabase stage rehearsal and evidence-backed eligibility approval are required before production. |
| Quick Deal automatic reservation and broader marketplace | Not implemented | Define opt-in rules and notifications, then add editable listings and buyer-safe public content. |
| Trust Score | Not implemented | Start with verified order metrics, versioned weights, score explanations and new-partner handling. |
| Verified reviews | Not implemented | Completed-order eligibility, unique reviews, replies, reports, moderation and appeals. |
| Available Vehicles | Not implemented | Regional capacity, availability intervals, exclusive reservations, expiry and listing entitlements. |
| Smart Matching | Not implemented | Compare compliant partner and vehicle supply with cargo and route requirements. |
| Smart Quote and templates | Not implemented | Internal decimal pricing, quote modes, templates and approval controls. Existing private costs and financial summaries remain in use. |
| Logistics calculators | Not implemented | Eight public calculators, localization, SEO and tier-limited saved calculations and exports. |
| Document Center | Not implemented | Private storage, upload enforcement, retention, PDF generation and approved templates. |
| Transport Timeline and location sharing | Partially implemented | Existing transport history and manual order statuses. V5 stages and incident states are pending. Location sharing depends on consent, access, retention and technical review. |
| Business Automation | Not implemented | Introduce an idempotent event queue, bounded retries, alerting and operator controls. |
| Founding Partner Program | Not implemented | Campaign enrollment, duplicate-company controls and promo entitlements. Activation requires owner approval. |
| Referral Program | Not implemented | Attribution, qualification, fraud checks and approval. Rewards depend on commercial, legal and accounting terms. |
| Assistant | Not implemented | Deterministic hints, provider abstraction and privacy controls. |
| Business API | Not implemented | Organization membership, versioned contracts, scopes and revocation. External access requires review and approval. |
| PWA | Not implemented | Manifest, offline fallback, install guidance and explicit static cache allowlist. |
| Customer, partner and manager dashboards | Partially implemented | Partner Quick Deal listings and manager controls added. Other V5 dashboard modules remain pending. |
| Memberships, billing and SEO | Partially implemented | Existing Free onboarding and localized public routes remain. Paid plans, enforceable quotas, Stripe and V5 public pages remain pending. |
| Hosted preview and production verification | Blocked by external requirements | GitHub Pages uses legacy Jekyll and returns 404. Production responded with an environment gateway 403. Pages settings, Cloudflare, Supabase, Auth and owner launch checks require completion. |

## Verification and release dependencies

Migrations 006 and 007 add assignment stabilization and Quick Deal. The existing PostgreSQL checks and new Quick Deal SQL tests cover RPCs, roles, financial data isolation and two simultaneous request/reservation sessions. Browser tests use synthetic Supabase fixtures. Test commands and interpretation are in [Security testing](../SECURITY-TESTING.md).

Use [Deployment](../DEPLOYMENT.md) to configure the GitHub review build and Cloudflare production. Use [Owner configuration](../OWNER-CONFIGURATION.md) for operator identity, Auth and legal approval. Verify approved commercial terms, mandatory carrier licensing and insurance, handling of expired evidence and suspension, retention, and the actual contract workflow before enabling Quick Deal in production. Hosted OAuth, MFA, Supabase policies and deployment still require staging rehearsal. No migration was applied to hosted Supabase for this delivery.

The Quick Deal slice uses existing PostgreSQL, Auth and static hosting with no additional provider. Database requests, audit history and notifications count against existing project quotas. Review [Free-tier limits](../FREE-TIER-LIMITS.md) for the storage, egress, request and build budgets. The remaining roadmap starts with evidence-backed verification, organization ownership and plan entitlements, then vehicles, reviews and matching.
