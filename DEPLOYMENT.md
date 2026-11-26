# Deployment

## GitHub Pages review preview

The public URL returned HTTP 404. The V5 main workflow passed build and database checks and skipped deployment. The legacy Pages workflow failed when Jekyll read Astro front matter. The integration received HTTP 403 when updating Pages publishing and the deployment variable. Follow [GitHub Pages setup](GITHUB-PAGES-SETUP.md) to switch the source and enable the existing workflow.

The workflow always builds in preview mode. GitHub Pages restricts using Pages to run an online business, e-commerce site or a site primarily directed at commercial transactions or commercial SaaS. Use it for review of the static implementation and use Cloudflare Pages for commercial production. [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#prohibited-uses)

## Cloudflare Pages production

Follow [Cloudflare Pages setup](CLOUDFLARE-PAGES-SETUP.md) and [Domain migration](DOMAIN-MIGRATION.md) once the owner selects the production domain.

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

Repeat with `SITE_URL=https://transport.example BASE_PATH=/` to verify custom-domain paths in preview mode. Production mode fails the build when essential owner settings are missing.

## V5 baseline result

The [V4 main workflow](https://github.com/girodayzzzz/DZ-Transport/actions/runs/45886737666) passed verification and skipped deployment. The separate legacy Pages job failed. The [V5 audit](docs/V5-BASELINE-AUDIT.md) records endpoint checks. Use the [Quick Deal guide](QUICK-DEAL.md) to stage migrations and independently configure the UI and database switches.
