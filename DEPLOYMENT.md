# GitHub Pages deployment

1. Merge reviewed changes into the `main` branch of `girodayzzzz/DZ-Transport`.
2. In Settings → Pages, choose **GitHub Actions** under Build and deployment.
3. In Settings → Secrets and variables → Actions → Variables, add repository variable `PAGES_DEPLOY` with value `true`. Keep it unset until the launch checks are complete.
4. Run **Verify and deploy GitHub Pages** on `main` from the Actions tab, or push a new commit to `main`. Pull requests run checks without publishing. Use the deployment URL shown in the workflow.
5. For the project URL, the defaults build for `https://girodayzzzz.github.io/DZ-Transport/`. Confirm the multilingual navigation, 404 page, sitemap and both forms from that URL.

## Custom domain

1. Verify `dzautotrade.si` in the GitHub account’s Pages domain verification settings if needed.
2. Set the Pages custom domain to `transport.dzautotrade.si`. Have the domain owner authorize and create a CNAME for `transport` pointing to `girodayzzzz.github.io`, without the repository path. This is a separate subdomain.
3. Set the Actions variables `WEBSITE_URL=https://transport.dzautotrade.si` and `WEBSITE_BASE_PATH=/`. Rerun the workflow on `main`.
4. Once DNS and the certificate are ready, enable **Enforce HTTPS**. Confirm canonical URLs, language alternates, sitemap, social preview and permitted form origins. Submit the new sitemap to your search provider if applicable.

## Reproduce the Pages build locally

```sh
export SITE_URL=https://girodayzzzz.github.io
export BASE_PATH=/DZ-Transport
export ASTRO_TELEMETRY_DISABLED=1
npm ci
npm run lint
npm test
npm run build
npm run verify
npm run test:browser
```
