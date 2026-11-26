# Future domain migration

1. Choose the approved production hostname and record it in the owner checklist. Keep the GitHub Pages demo on its current project path.
2. Create the production build using [Cloudflare Pages setup](CLOUDFLARE-PAGES-SETUP.md). Set `SITE_URL` to the selected HTTPS origin and `BASE_PATH=/`. The build uses the origin and base for canonical URLs, social metadata, the sitemap and localized links.
3. Have the authorized DNS operator add the approved domain using the records provided by Cloudflare. Verify HTTPS and the intended canonical host before allowing authenticated traffic.
4. In Supabase → Authentication → URL Configuration, set the Site URL and add exact localized verification/recovery and Google callback destinations on the new application origin. Verify Google’s OAuth client has the approved application origin and the existing Supabase callback. Verify the SMTP templates and synthetic flows. [Supabase setup](SUPABASE-SETUP.md) · [Google OAuth setup](GOOGLE-OAUTH-SETUP.md)
5. If using guest intake, set the runtime binding `DZ_SITE_ORIGIN` to the same HTTPS origin and authorize its hostname in Turnstile. Check the provider endpoints, rollback path and synthetic submissions.
6. Rehearse direct localized route access, password resets, Google login, account permissions, mobile layouts and custom 404 handling. Users may need to sign in again because browser sessions are scoped to each origin. Reuse the existing Supabase project and user records.
7. If billing is implemented later, verify exact success and cancellation URLs and the server-side webhook in test mode using the existing test catalog where appropriate. Before adding a PWA, verify that manifest URLs and service-worker scope follow the chosen base path.

Rollback by reverting the Cloudflare deployment and the corresponding Supabase allowlist or binding changes to the previous approved configuration. Leave the development URL available during validation.
