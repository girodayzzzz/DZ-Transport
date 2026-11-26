# Owner launch checklist

- [ ] Add the verified legal operator, address, registration, VAT details where applicable, email and phone.
- [ ] Review Slovenian, English and German privacy, terms and cookie copy. Finalize lawful bases, operator contact, retention, processor and subprocessors, data transfers, marketing consent, complaints process and contractual roles. Record owner approval in the configuration after review.
- [ ] Create and verify separate HTTPS endpoints and recipients. Use test data to confirm successful and failed submissions, provider notification emails, manual assessment labels and reference handling.
- [ ] Confirm processor terms and restrict internal access to inquiries. Set retention and deletion procedures.
- [ ] Confirm images and temporary branding for launch. Replace the wordmark and favicon if official assets are ready.
- [ ] Run build, lint, route checks, unit tests and browser tests. Measure production performance and run a manual keyboard and screen-reader review before claiming WCAG conformance.
- [ ] For a public review preview, enable GitHub Pages, set the deploy variable and validate the default Pages URL.
- [ ] Authorize DNS separately for the custom subdomain, configure Cloudflare Pages, verify HTTPS and verify the deployed domain and sitemap.

## Production gate

- [ ] Complete [OWNER-CONFIGURATION.md](OWNER-CONFIGURATION.md) and record approval of all localized legal pages.
- [ ] Verify production build with operator data and separate approved endpoints.
- [ ] Confirm test intake, matching receipts, owner notifications, manual assessment and retry deduplication from the final origin.
- [ ] Check private retention and deletion procedures across provider, inbox, exports and backups.
- [ ] Keep analytics off until approved consent requirements are implemented.

## Optional portal and database intake

- Rehearse Auth, RLS, MFA, notifications, guest receipts and deletion workflows using synthetic data. Complete [Supabase setup](SUPABASE-SETUP.md) and [security testing](SECURITY-TESTING.md).
- Keep portal flags disabled until the owner approves activation. Formspree can continue to serve public inquiries while the optional PostgreSQL intake is under review.

## Quick Deal rollout

- [ ] Verify carrier eligibility evidence and owner-approved contract steps.
- [ ] Apply and rehearse the migration in staging with synthetic manager, carrier and customer accounts, including expiry, cancellation and document validity.
- [ ] Confirm the production switches remain disabled until approval. Follow the [Quick Deal guide](QUICK-DEAL.md).
