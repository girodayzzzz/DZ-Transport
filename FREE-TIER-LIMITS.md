# Free-tier limits

Checked provider documentation on 26 November 2026. Quotas apply subject to provider terms and can change. Keep the organization and services on Free and review dashboard metering before activation.

| Service | Planning limits |
| --- | --- |
| Supabase Free | 50,000 monthly active users, 500 MB database size per project, 1 GB file storage, 5 GB egress and 5 GB cached egress. Free projects can pause after inactivity. Verify recovery capabilities and keep manual backups. |
| Cloudflare Pages Free | 500 builds per month and 20,000 static files per site. Static site serving and Functions have separate meters. |
| Cloudflare Workers Free | Pages Function invocations count toward the shared 100,000 requests per day. Runtime CPU and other platform limits also apply. |
| Turnstile Free | Unlimited challenges within plan limits for widgets and hostnames. Verification still uses a Functions invocation. |
| GitHub Pages | Use the static owner review preview. Keep commercial operations on the separately configured production host. |
| Authentication mail | Public signup requires approved custom SMTP. Provider free quotas and recipients depend on the selected service. Review provider pricing, Supabase Auth rate limits and delivery performance before enabling signup. |

Track database growth from JSON intake payloads, audit records and notifications. Check guest Functions usage and rate-limit failures after launch. No paid upgrade is required by the code, and availability may be affected by exceeded quotas.

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase SMTP and Auth rate limits](https://supabase.com/docs/guides/auth/auth-smtp) · [Rate limit reference](https://supabase.com/docs/guides/auth/rate-limits)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)
- [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
