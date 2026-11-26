# DZ Transport V4 foundation and customer onboarding

## Baseline audit

The branch starts at `b47ec3e`. PRs #1, #2 and #3 are merged. PR #1 introduced the localized Astro website, inquiry wizard and review build. PR #2 extended structured inquiries, receipt validation, SEO and deployment safeguards. PR #3 introduced gated Supabase Auth, customer and partner portals, an AAL2 manager, an optional Turnstile intake Function, and SQL authorization and workflow tests.

The repository has four V3 migrations for RLS-secured transport records, RPC-only workflow writes, guest intake and contact retention. The customer, carrier and manager UI use the same app-level portal. V3 has a curated per-carrier invitation workflow. V4 marketplace listings should extend that authorization model. V3 also has private quotes and costs, controlled order transitions and status history. Its basic financial report aggregates completed accepted offers by currency. Payment reconciliation and the wider finance scope remain outstanding.

The V3 Google button was available through Login only. Both entry points now use the same PKCE callback. Registration and existing Login still enter the customer route, where the optional onboarding flow reads its progress from the authenticated user's profile. Partner and administrator onboarding remain separate work.

V3's legacy partner approval uses only name, coverage and services. Keep the partner rollout disabled until verification requirements, private document access, expiry and suspension are enforced in trusted operations. Guest-to-account linking and hosted end-to-end Auth testing also remain open.

The latest main Astro verification and database jobs are in [run 45885091312](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45885091312). Pages is set to legacy source publishing and its [latest deployment run](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45885091523) failed. The [review URL](https://girodayzzzz.github.io/DZ-Transport/) returned HTTP 404. The execution environment’s network proxy denied the production hostname, so production availability is unverified. See [deployment setup](../DEPLOYMENT.md).

## Completion matrix

| Area | Status | Scope |
| --- | --- | --- |
| Repository baseline and preview diagnosis | Implemented and verified | Reviewed merged PRs, migration and portal code, CI history and live preview response. |
| Localized customer onboarding | Implemented and verified locally | Private/business account selection, server-persisted progress, profile and free activation. Google browser flow uses a fixture. |
| Email and Google authentication | Implemented but awaiting configuration | Existing email operations, Google entry from Login and Register. Owner rehearsal requires configured redirects, SMTP and Google credentials. |
| Customer dashboard | Partially implemented | Existing V3 inquiries, offers and transport workflows plus V4 onboarding. Business reporting and secure guest linking remain open. |
| Partner and manager dashboards | Partially implemented | Existing invitation and transport operations, MFA and currency-level financial summaries. |
| Business verification | Partially implemented | Legacy application and approval. Structured business and compliance profiles, private uploads and audit decisions remain open. |
| Membership and Stripe | Not implemented | Free onboarding is cardless. No paid plan, checkout, billing state or entitlements shipped. |
| Marketplace and logistics | Partially implemented | V3 invite-only opportunities and quotations. General anonymized publication and quota enforcement remain open. |
| Messaging, fleet and return loads | Not implemented | Existing V3 in-app notifications cover selected workflow events. |
| Public preview and production launch | Blocked by external requirements | Repository-admin Pages settings, Cloudflare configuration, DNS authorization, legal and operational review. |

## Continuing V4

1. Rehearse guest intake and authentication on approved infrastructure. Keep guest inquiries independent of account setup. Put the existing review build online through the documented GitHub Actions publishing source.
2. Extend existing company and application records with structured legal profiles, requirement rules and a private document workflow. Add server-side eligibility to invitations, quotes and assignments, with a reviewed transition for legacy partners. Add authorized organization membership before shipping multi-employee features.
3. Ship the versioned plan catalog and atomic entitlements once each included benefit is usable. Integrate Stripe test-mode Checkout, Portal, signed idempotent events and renewal handling. Obtain pricing, VAT and contract approvals before activating paid plans.
4. Extend existing invitations into reviewed, anonymized marketplace listings. Add quote quotas, safe assignment transitions, guest linking and reviewed online acceptance.
5. Extend manager reporting and add private messaging, notification preferences, fleet and rule-based return loads. Complete retention, restore rehearsal, accessibility, production deployment checks and owner/legal review.

The operator's legal identity, contractual role, carrier requirements, consumer terms, data retention and any applicable DSA, P2B and DAC7 obligations require review. Keep the existing production safeguards enabled. See [owner configuration](../OWNER-CONFIGURATION.md) and [free-tier limits](../FREE-TIER-LIMITS.md). No production service changes or paid infrastructure were made for this slice.
