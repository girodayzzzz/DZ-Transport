# GitHub Pages development deployment

The approved development URL is https://girodayzzzz.github.io/DZ-Transport/.

| Priority | Repository dashboard location | Required value and verification | Blocks |
| --- | --- | --- | --- |
| 1 | Settings → Pages → Build and deployment → Source | Select **GitHub Actions**. Reload Settings and confirm the source. This stops Jekyll from interpreting Astro templates. | Public development deployment |
| 2 | Settings → Secrets and variables → Actions → Variables → New repository variable | Name `PAGES_DEPLOY`, value `true`. Confirm it is listed under repository variables. | Public development deployment |
| 3 | Actions → Verify and deploy GitHub Pages → Run workflow | Select `main`. The current main workflow can publish the V5 preview immediately. Merge the reviewed V6 PR before running the extended hosted checks. | Public release verification |
| 4 | Settings → Environments → github-pages | If GitHub reports a deployment restriction, confirm that `main` is allowed and complete any existing required reviewer step. | Deployment if the restriction applies |

Check the Actions build, database and deploy jobs. The V6 deploy job runs Chromium against the URL returned by Pages. It expects HTTP 200 for 27 localized pages and HTTP 404 for an unknown route. It also checks the preview banner, indexing directive, active integration settings, browser resources and mobile navigation.

To verify independently with Node 24 and Chromium installed via Playwright:

```sh
npm ci
npx playwright install chromium
PREVIEW_URL=https://girodayzzzz.github.io/DZ-Transport/ node scripts/verify-pages.mjs
```

The preview artifact uses `/DZ-Transport/`. Login, registration and dashboards show their availability status. Hosted authentication and writes require an approved rehearsal environment. To pause future publishing, remove `PAGES_DEPLOY`. To take down the current deployment, use **Settings → Pages → Unpublish site**.
