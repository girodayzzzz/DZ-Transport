# Deployment

## GitHub Pages review preview

1. Merge the reviewed pull request into `main`.
2. In Settings → Pages → Build and deployment, select **GitHub Actions**.
3. In Settings → Secrets and variables → Actions → Variables, set repository variable `PAGES_DEPLOY=true`.
4. In Actions, run **Verify and deploy GitHub Pages** from `main`. Open the URL shown on the deploy job and check the banner, localized pages and disabled submission. The expected project URL is https://girodayzzzz.github.io/DZ-Transport/.
5. Confirm a preview page returns HTTP 200 and contains `noindex,follow`. Crawling is allowed so crawlers can read that directive. Remove `PAGES_DEPLOY` to stop future deployment runs. Unpublish in Pages settings to take down a previously published site.

The workflow always builds in preview mode. GitHub Pages restricts using Pages to run an online business, e-commerce site or a site primarily directed at commercial transactions or commercial SaaS. Use it for review of the static implementation and use Cloudflare Pages for commercial production. [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#prohibited-uses)

## Cloudflare Pages production

1. Complete [OWNER-CONFIGURATION.md](OWNER-CONFIGURATION.md) and the [launch checklist](LAUNCH-CHECKLIST.md).
2. Create a Cloudflare Pages project connected to this repository. Select `main`, root directory `/`, build command `npm run build` and output directory `dist`. Set `NODE_VERSION=24`.
3. In the **Production** build environment set `DZ_SITE_MODE=production`, `SITE_URL=https://transport.dzautotrade.si`, `BASE_PATH=/` and `ASTRO_TELEMETRY_DISABLED=1`. Keep preview environments in preview mode and set their own site origin as appropriate.
4. In Pages → Custom domains, add `transport.dzautotrade.si`. Have the domain owner authorize and perform any DNS changes Cloudflare requires. Confirm HTTPS before enabling public intake.
5. Verify the canonical URL and sitemap use the intended host. Confirm form posts work from that origin only as intended, run the synthetic inquiries and ensure any secondary public production hostname redirects to the canonical host or is otherwise restricted.

## Reproduce the project-path build

```sh
export SITE_URL=https://girodayzzzz.github.io BASE_PATH=/DZ-Transport
export DZ_SITE_MODE=preview ASTRO_TELEMETRY_DISABLED=1
npm ci
npm run lint
npm test
npm run build
npm run verify
npm run test:browser
```

Repeat with `SITE_URL=https://transport.dzautotrade.si BASE_PATH=/` to verify custom-domain paths in preview mode. Production mode fails the build when essential owner settings are missing.
