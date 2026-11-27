# Cloudflare Pages setup

For the launch settings of the existing DZ Transport Pages project, see [Production review](docs/PRODUCTION-READINESS.md).

In Workers & Pages → Create application → Pages → Connect to Git, select **DZ-Transport**. Set production branch to `main`, root to the repository root, framework to Astro, build command to `npm run build`, output to `dist` and `NODE_VERSION=24`.

In **Settings → Variables and Secrets**, set `DZ_SITE_MODE=preview` for rehearsal builds and supply the corresponding HTTPS `SITE_URL` and `BASE_PATH=/`. Once the operator, endpoints and legal approvals are ready, configure the production build with `DZ_SITE_MODE=production` and the owner-selected HTTPS origin. Keep production feature flags disabled until their individual acceptance checks pass. Configure the guest Function only if approved. [Supabase setup](SUPABASE-SETUP.md)

Use **Custom domains → Set up a custom domain** after owner approval and follow [Domain migration](DOMAIN-MIGRATION.md). Verify the intended site returns HTTP 200 and inspect generated canonical URLs, sitemap entries, and the localized dashboard and callback routes. Check that guest intake, if enabled, works only on the configured origin and that other deployments reject submissions.

## V9 intake for the standalone Pages project

In Cloudflare, verify the Pages project's Git repository is exactly `girodayzzzz/DZ-Transport`. Reuse that project if present. Otherwise create a Git-connected Pages project named `dz-transport` and select only that repository. Use `main` for production, the Astro settings above, and the actual assigned HTTPS Pages origin in `SITE_URL` and `DZ_SITE_ORIGIN`. Use `BASE_PATH=/`. Keep the existing GitHub Pages preview at `/DZ-Transport/`.

Before enabling intake, confirm the Supabase project belongs to DZ Transport. Apply repository migrations through `202611270011_guest_partners.sql` to that project and set both `SUPABASE_URL` and `PUBLIC_SUPABASE_URL` to its URL. Keep the publishable key in `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the privileged key in the server-only `SUPABASE_SECRET_KEY`. Set `PUBLIC_DZ_PORTAL=true` and `PUBLIC_DZ_MANAGER=true` for the existing administration route. Management access requires an approved administrator with MFA.

| Scope | Variable | Value |
| --- | --- | --- |
| Build | `PUBLIC_DZ_GUEST_INTAKE` | `true` for the transport inquiry form |
| Build | `PUBLIC_DZ_GUEST_PARTNER_INTAKE` | `true` for the carrier application form |
| Build | `PUBLIC_TURNSTILE_SITE_KEY` | DZ Transport widget site key scoped to the assigned Pages hostname |
| Functions | `DZ_GUEST_INTAKE` | `true` to serve `/api/inquiry` |
| Functions | `DZ_GUEST_PARTNER_INTAKE` | `true` to serve `/api/partner-application` |
| Functions | `TURNSTILE_SECRET` | Secret belonging to the same widget |
| Functions | `DZ_IP_HASH_KEY` | Random secret of at least 32 characters |

The public forms are available in the production Astro build after completing the operator, contact and legal configuration in `config/site.json`. With both intake flags enabled, the two Pages Functions serve as the configured endpoints. Both require a hostname- and action-matched Turnstile result. The database limits each form to eight new submissions per network per hour, and a retry with the same reference and normalized payload reuses the existing record.

Submit one synthetic inquiry and one carrier application on the confirmed DZ Transport deployment. Verify the localized receipt and reference, then open both records in the manager portal. A carrier application appears as pending with a details action and notifies administrators. A public submission creates no user or carrier role. An applicant who later needs portal access follows the existing account-based application and approval process. Check that a manager without MFA and an unrelated user cannot access the private application payload. Keep live Stripe credentials out of the project. Optional Stripe testing follows [the isolated V8 procedure](docs/STRIPE-V8-TEST.md).
