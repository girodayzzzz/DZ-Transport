# DZ Transport

A static, multilingual transport inquiry site for Slovenia and Europe. DZ Transport collects requests, prepares individual offers and coordinates arrangements with suitable transport providers.

| Area | Implementation |
| --- | --- |
| Site | Astro 5, TypeScript and CSS with static HTML |
| Languages | Slovenian at the site root, English under `/en/`, German under `/de/` |
| Forms | Six-step inquiry and separate partner application, each with a configurable HTTPS endpoint |
| Hosting | GitHub Pages review preview and Cloudflare Pages production |
| Data | No application database. Optional Cloudflare Web Analytics is off by default. |

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm test
npm run build
npm run verify
npx playwright install chromium
npm run test:browser
```

`npm run verify` checks the current build. When setting `SITE_URL` and `BASE_PATH`, pass the same values to the build, verification and browser tests. Set `ASTRO_TELEMETRY_DISABLED=1` to disable Astro development telemetry.

## Source map

- `config/site.json` contains operator details, endpoints, active languages, feature flags and domain settings.
- `src/lib/routes.ts` defines the routes and language-specific slugs.
- `src/lib/content.ts`, `editorial.ts`, `form-copy.ts` and `form-schema.mjs` define localized content and form fields.
- `src/components/` contains the shared layout, page templates, form controls and transport cards.
- `src/lib/forms.ts` drives the wizard, partner form, validation, review and submission.
- `src/lib/form-core.mjs` contains testable helpers for dates, phone numbers, references, payloads and request handling.
- `src/styles/site.css` defines the design system and responsive layout.
- `scripts/`, `tests/`, and `.github/workflows/pages.yml` contain checks and deployment automation.

The site includes the homepage, service overview, six service details and four European corridors, transport inquiry, business and partner pages, process, FAQ, about, contact, privacy, terms, cookies, confirmation and custom 404. Each page type has three language variants.

[Set up forms and configuration](SETUP.md) · [Preview and production deployment](DEPLOYMENT.md) · [Review launch checklist](LAUNCH-CHECKLIST.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

## Assets

The favicon and wordmark are original temporary artwork. Photography is illustrative and does not depict the operator’s assets. The photographs are sourced from Unsplash under its [license](https://unsplash.com/license). The CDN links identify the original photographs.

- Hero truck and mobile crop [Unsplash](https://images.unsplash.com/photo-1601584115197-04ecc0da31d7)
- Vehicle [Unsplash](https://images.unsplash.com/photo-1492144534655-ae79c964c9d7)
- Warehouse [Unsplash](https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d)
- Container yard [Unsplash](https://images.unsplash.com/photo-1494412519320-aa613dfb7738)
- Moving crew [Unsplash](https://images.unsplash.com/photo-1600518464441-9154a4dea21b)
- Logistics yard [Unsplash](https://images.unsplash.com/photo-1565793298595-6a879b1d9492)
- Metalworking [Unsplash](https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122)
- Coverage illustration uses public-domain country outlines from [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). Dotted paths illustrate possible European connections.

## V2 launch configuration

The default build is a noindex preview with both submissions disabled. Start with [OWNER-CONFIGURATION.md](OWNER-CONFIGURATION.md), then follow [DEPLOYMENT.md](DEPLOYMENT.md). The [private management specification](docs/DZ-TRANSPORT-MANAGER.md) covers future intake, dispatch, reporting and CRM integration.

The service cards and service headers use 420 px and 800 px WebP variants of the same licensed source images. The corresponding original JPEGs are used for social sharing. The existing DZ Transport wordmark remains provisional.

## V3 portal and intake

The static Astro preview retains the public site and disables live submissions and portal access. The staged V3 portal uses Supabase Auth and PostgreSQL row-level policies. The optional Cloudflare guest inquiry endpoint can replace the inquiry Formspree endpoint after hosted verification.

- [Supabase setup](SUPABASE-SETUP.md) and [authentication](AUTHENTICATION.md)
- [Database schema](DATABASE-SCHEMA.md) and [security testing](SECURITY-TESTING.md)
- [Manager guide](ADMIN-GUIDE.md), [free-tier limits](FREE-TIER-LIMITS.md) and [backup and restore](BACKUP-AND-RESTORE.md)

See the [V4 repository audit and delivery status](docs/V4-AUDIT.md) and [Google OAuth setup](GOOGLE-OAUTH-SETUP.md) for the staged customer onboarding rollout.
