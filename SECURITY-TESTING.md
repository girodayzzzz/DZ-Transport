# Security testing

Run `npm run lint`, `npm test`, `npm run build`, `npm run verify` and `npm run test:browser` in preview mode using the repository base path. The browser suite uses Chromium and synthetic fixtures. Run the CI PostgreSQL service job or use a disposable PostgreSQL 17 database with `tests/database/bootstrap.sql`, the migrations in order and `tests/database/policies.sql`. Stop on the first SQL error. The bootstrap supplies a minimal Supabase-style JWT context for local tests.

The SQL fixtures verify anonymous denial, unconfirmed account denial, cross-customer isolation, denied escalation, manual approval and suspension, carrier visibility, administrator MFA, guarded status transitions, receipt replay, rate limiting, financial arithmetic and history. The Node fixtures cover server schema validation, Turnstile rejection and acknowledgment only after a database response. These tests run without Supabase or customer data.

## Hosted staging release gates

- Use separate staging accounts for two customers, two carriers and an administrator. Test registration, mail confirmation, recovery, logout, refresh, expired sessions and one-time links. Verify the callback stays on its exact locale path.
- From each account, request another customer’s rows and offer, set the role directly and try a manager RPC. Confirm none are accessible. Confirm an AAL1 administrator cannot fetch internal notes, costs, business notifications or guest payloads. Step up with TOTP and rerun permitted actions.
- Apply as a pending carrier, approve it, invite it with a limited brief, submit a quote, assign it after recorded customer intent and suspend it. Confirm suspension immediately removes access. Inspect all visible data before and after assignment.
- Perform a real staging Turnstile check and submit a synthetic inquiry. Retry once with a fresh challenge and the same reference and payload. A conflicting reference must fail. Verify the returned reference matches the committed record lookup. Confirm external Formspree receives no copy when the alternate endpoint is enabled.
- Test hostile markup and oversized payloads, cross-origin submissions, the database rate limit, locale links and mobile layouts. Inspect response security headers, logs and asset bundles for personal data and private secrets.
- After switching GitHub Pages source to GitHub Actions, run the gated preview from main and verify the Pages URL, review banner, noindex, project base path and disabled live forms. Check Cloudflare production only with approval and synthetic records.

Database model and mocked endpoint testing cannot verify a hosted project’s configuration. Release depends on the owner verifying Auth email, provider credentials, policies as deployed, project region and required legal approvals. Public CAPTCHA coverage currently applies to the optional guest endpoint. Auth signup and recovery are also subject to Supabase’s own rates and owner-selected abuse settings.

V4 exercises customer onboarding in the isolated PostgreSQL policy suite, including anonymous and unconfirmed rejection, privileged account type rejection, blocked direct writes, business-name validation, duplicate activation and customer isolation. The Playwright OAuth test uses synthetic intercepted responses and verifies the browser's PKCE exchange, resumed setup and free activation. Hosted verification requires the rehearsal in [Google OAuth setup](GOOGLE-OAUTH-SETUP.md).

## Quick Deal

After applying all migrations to a disposable PostgreSQL database with `tests/database/bootstrap.sql`, run `psql -v ON_ERROR_STOP=1 -f tests/database/policies.sql`, `psql -v ON_ERROR_STOP=1 -f tests/database/quick-deal.sql` and `bash tests/database/quick-deal-concurrency.sh`. The concurrency test uses independent authenticated sessions and verifies actual lock contention, exclusive reservation and rejection of the competing carrier. CI uses the same scripts. Playwright covers the partner flow with mocked Supabase responses. Hosted Supabase and production rehearsal remain pending.
