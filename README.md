# DZ Transport

A static, multilingual transport inquiry site for Slovenia and Europe. DZ Transport collects requests, prepares individual offers and coordinates arrangements with suitable transport providers.

| Area | Implementation |
| --- | --- |
| Site | Astro 5, TypeScript and CSS with static HTML |
| Languages | Slovenian at the site root, English under `/en/`, German under `/de/` |
| Forms | Six-step inquiry and separate partner application, each with a configurable HTTPS endpoint |
| Hosting | GitHub Pages with repository-path and custom-domain builds |
| Data | No application database or analytics scripts |

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

The site includes the homepage, service overview and six service details, transport inquiry, business and partner pages, process, FAQ, about, contact, privacy, terms, cookies, confirmation and custom 404. Each page type has three language variants.

[Set up forms and configuration](SETUP.md) · [Deploy to GitHub Pages](DEPLOYMENT.md) · [Review launch checklist](LAUNCH-CHECKLIST.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

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
