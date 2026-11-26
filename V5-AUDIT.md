# DZ Transport V1–V5 audit and V6 delivery status

The audited `main` commit was `b11b2d2`. PRs #1–#5 are merged and all five phase branches are ancestors of `main`. V6 branches from that commit. The earlier [V4 audit](docs/V4-AUDIT.md), [V5 baseline audit](docs/V5-BASELINE-AUDIT.md), and [V5 delivery matrix](docs/V5-DELIVERY.md) provide additional evidence.

| Phase | Findings |
| --- | --- |
| V1 | Astro generates localized Slovenian, English and German service, inquiry, contact, partner and legal pages. It includes quote prefill, a multi-step inquiry, a partner application, responsive navigation and a custom 404. Commercial availability depends on configured endpoints and operator information. |
| V2 | Added cargo variants, multi-item totals, recurring intake and corridor pages. Production requires operator, privacy, contractual and endpoint settings. The noindex preview omits active submission endpoints. |
| V3 | Added email/PKCE auth, role-based portals, staff workflow, internal finance, status history, notifications, optional Turnstile guest intake and retention. Manager operations require AAL2. The current private quotation model uses invitations. No public listing or conversation model was found. |
| V4 | Added resumable private/business onboarding, cardless Free activation and the Google entry point on Register. Hosted mail, OAuth, AAL2 and guest-account linking remain open. Basic/Pro entitlements and Stripe billing are absent. Partner approval lacks licensing and insurance evidence, expiry checks and delegated organization access. |
| V5 | Added manual gated Quick Deal with eligibility attestation, filtered carrier listings, reservation and assignment. Assignment now serializes approval and notifies the carrier. Trust Score, reviews, available capacity, Smart Matching, Smart Quote, logistics calculators, Document Center, automation, Founding Partner, referrals, AI Assistant, Business API and PWA remain absent. Transport tracking consists of manual statuses and history. |

## Hosting and external configuration

- The [public development homepage](https://girodayzzzz.github.io/DZ-Transport/) was fetched over HTTPS and returned HTTP 404. Slovenian, English and German homes, English Login, Register, callback and customer dashboard, and an unknown route all returned HTTP 404. A 404 for the unknown route alone does not verify delivery of DZ Transport’s custom page.
- Pages reports `build_type=legacy`, source `main:/` and status `errored`. The [legacy run](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45889178110) failed because Jekyll interpreted `src/pages/404.astro` as YAML. The [Astro main run](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45889178232) passed build and isolated database jobs and skipped deploy. The integration returned HTTP 403 when changing the Pages source and Actions variable. [GitHub Pages setup](GITHUB-PAGES-SETUP.md)
- The existing Supabase Auth health endpoint was accessed without credentials and returned HTTP 401. Hosted migration history, sign-in, portal roles, SMTP and Google OAuth are unverified. The documented Supabase OAuth callback is a configuration value and was not tested through a live Google account. [Supabase setup](SUPABASE-SETUP.md) · [Google OAuth setup](GOOGLE-OAUTH-SETUP.md)
- The owner has yet to select a production hostname. The V6 production build requires an explicit HTTPS origin. No production hostname or DNS change was verified. [Domain migration](DOMAIN-MIGRATION.md)
- Stripe test mode was not configured or exercised. No billing integration exists in the repository. The DZ Auto Trade repository and Checkout are outside this audit.

## Completion matrix

| Scope | Status | Evidence or remaining work |
| --- | --- | --- |
| Project-path preview, mobile navigation, localized pages and preview availability routes | Implemented and verified | Static artifact and local checks. Hosted acceptance is a separate deployment requirement. |
| Hosted Playwright verification | Implemented but awaiting configuration | Runs after publishing from main and checks the HTTPS project URL, noindex, resources, localization, integration isolation, mobile menu and custom 404. |
| Public GitHub Pages deployment | Blocked by external requirements | Owner Pages source and Actions variable changes. |
| Cloudflare and future custom domain | Implemented but awaiting configuration | Explicit build/runtime origin configuration and guides. Host selection, DNS and deployment remain open. |
| Supabase Auth and Google OAuth | Implemented but awaiting configuration | Synthetic browser tests for authentication and PKCE. Hosted SMTP, redirects and AAL2 rehearsal remain open. |
| Membership entitlements | Partially implemented | Free customer onboarding. Basic/Pro quotas, usage and server-side entitlements pending. |
| Stripe billing | Not implemented | Test-mode checkout, webhook handling, test catalog and reconciliation pending. |
| Load Questions | Not implemented | Define shared authorization across invitations and Quick Deals, then moderation, filtered display, rate limits, reporting, notifications and audits. |
| Private Messaging | Not implemented | Add order- and assignment-scoped membership, contract gate, replacement revocation and audited support. Stage attachments separately after storage verification. |
| Communication Center | Not implemented | Existing per-user in-app notifications. Unified threads, reports and communication preferences pending. |
| CRM | Not implemented | Organization-owned contacts, notes, stages and access rules pending. |
| Transport Auctions | Not implemented | Bid authorization, timestamps, deterministic closing and award pending. |
| Quick Deal | Partially implemented | Existing manual workflow tested in fixtures and isolated PostgreSQL. Immediate commercial acceptance and other V6 improvements deferred. |
| Trust Score | Not implemented | Verified-order metrics, review moderation and appeal pending. |
| Available Vehicles | Not implemented | Capacity listings, expiry and reservation pending. |
| Load Consolidation | Not implemented | Part-load constraints and matching pending. |
| Transport Planner | Not implemented | Scheduling, capacity and conflict handling pending. |
| Claims Center | Not implemented | Dispute lifecycle and access-controlled evidence pending. |
| Carrier Network | Not implemented | Organization relationships and preferred/suspended carrier access pending. |
| Contract Transport | Not implemented | Recurrence, schedules, rate agreements and contract approval pending. |
| Green Logistics | Not implemented | Confirm inputs and emissions methodology before reporting. |
| Business Control Center | Not implemented | Existing manager aggregates are limited to accepted quotes on completed orders. |
| Integrations Center | Not implemented | Provider credentials, connection status and scoped integration controls pending. |
| White Label Forms | Not implemented | Tenant isolation, origin control, branding and submission routing pending. |
| Business Automation | Not implemented | Idempotent jobs, bounded retries and operator controls pending. |
| Customer Dashboard | Partially implemented | Own inquiries, offers, orders, transport history and Free onboarding. V6 business tools and communications pending. |
| Partner Dashboard | Partially implemented | Applications, approved coverage, invitations, quotation, assignment and gated Quick Deal. Evidence-backed carrier verification and V6 tools pending. |
| Administrator Dashboard | Partially implemented | MFA-protected approvals, inquiries, offers, assignment and basic financials. V6 permission, communications and operational modules pending. |
| PWA and private documents | Not implemented | Manifest, scope, service worker and offline fallback pending. Private file storage requires authorization tests and retention. |

## Database, security and readiness

Migrations 001–005 cover base tables, RLS, workflow RPCs, guest intake, retention and onboarding. Migration 006 locks carrier approval during assignment and makes assignment visible to the notification trigger. Migration 007 adds gated Quick Deal state and its candidate and reservation controls. V6 makes no schema changes. The existing PostgreSQL test suite checks role isolation, finance, workflow RPCs and concurrent Quick Deal requests and reservations. Hosted permission and operational checks are still required. [Database schema](DATABASE-SCHEMA.md) · [Security testing](SECURITY-TESTING.md)

Before commercial release, confirm operator identity, contractual role, terms, privacy and retention, mandatory carrier license and insurance controls, incident response, SMTP and backups. Configure the free-tier dashboard meters for database, egress, deployments, storage and mail as applicable. Owner settings and verification procedures are in the linked guides. [Owner configuration](OWNER-CONFIGURATION.md) · [Launch checklist](LAUNCH-CHECKLIST.md) · [Free-tier limits](FREE-TIER-LIMITS.md) · [Backup and restore](BACKUP-AND-RESTORE.md)
