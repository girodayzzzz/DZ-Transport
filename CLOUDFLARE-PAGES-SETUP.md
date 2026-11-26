# Cloudflare Pages setup

In Workers & Pages → Create application → Pages → Connect to Git, select **DZ-Transport**. Set production branch to `main`, root to the repository root, framework to Astro, build command to `npm run build`, output to `dist` and `NODE_VERSION=24`.

In **Settings → Variables and Secrets**, set `DZ_SITE_MODE=preview` for rehearsal builds and supply the corresponding HTTPS `SITE_URL` and `BASE_PATH=/`. Once the operator, endpoints and legal approvals are ready, configure the production build with `DZ_SITE_MODE=production` and the owner-selected HTTPS origin. Keep production feature flags disabled until their individual acceptance checks pass. Configure the guest Function only if approved. [Supabase setup](SUPABASE-SETUP.md)

Use **Custom domains → Set up a custom domain** after owner approval and follow [Domain migration](DOMAIN-MIGRATION.md). Verify the intended site returns HTTP 200 and inspect generated canonical URLs, sitemap entries, and the localized dashboard and callback routes. Check that guest intake, if enabled, works only on the configured origin and that other deployments reject submissions.
