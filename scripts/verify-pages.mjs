import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const site = new URL(process.env.PREVIEW_URL);
assert.equal(site.protocol, 'https:');
assert.equal(site.pathname, '/DZ-Transport/');
const routes = {
 sl: ['', 'prijava/', 'registracija/', 'prijava-potrditev/', 'portal-stranke/', 'portal-prevozniki/', 'upravljanje/', 'povprasevanje/', 'partnerji/'],
 en: ['en/', 'en/login/', 'en/register/', 'en/auth-callback/', 'en/customer-portal/', 'en/partner-portal/', 'en/transport-manager/', 'en/inquiry/', 'en/partners/'],
 de: ['de/', 'de/anmelden/', 'de/registrieren/', 'de/anmeldung-abschliessen/', 'de/kundenportal/', 'de/partnerportal/', 'de/transport-manager/', 'de/anfrage/', 'de/partner/']
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
try {
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('requestfailed', request => {
  if (new URL(request.url()).origin === site.origin) errors.push(request.url() + ' ' + request.failure()?.errorText);
 });
 page.on('response', response => {
  if (response.status() >= 400 && ['stylesheet','script','image'].includes(response.request().resourceType())) {
   errors.push(response.status() + ' ' + response.url());
  }
 });
 for (const [language, paths] of Object.entries(routes)) {
  for (const path of paths) {
   const url = new URL(path, site).href;
   const response = await page.goto(url);
   assert.equal(response?.status(), 200, url);
   assert.equal(page.url(), url);
   assert.equal(await page.locator('html').getAttribute('lang'), language);
   assert.match(await page.title(), /DZ Transport/);
   assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,follow');
   assert.ok(await page.locator('.preview-status').isVisible());
   assert.equal(await page.locator('[data-init], [data-endpoint^="http"]').count(), 0);
   console.log('HTTP 200 ' + url);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(new URL('en/', site).href);
 const menu = page.getByRole('button', {name:'Menu',exact:true});
 await menu.click();
 assert.equal(await menu.getAttribute('aria-expanded'), 'true');
 const login = page.locator('header nav a[href="/DZ-Transport/en/login/"]');
 assert.ok(await login.isVisible());
 const logo = page.locator('header img');
 assert.ok(await logo.evaluate(image => image.complete && image.naturalWidth > 0));
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
 const missing = await page.goto(new URL('dz-pages-verification-missing/', site).href);
 assert.equal(missing?.status(), 404);
 assert.ok(await page.locator('main h1').isVisible());
 assert.match(await page.title(), /DZ Transport/);
 assert.ok(await page.locator('header .brand').isVisible());
 assert.deepEqual(errors, []);
 console.log('Verified mobile menu, image, JavaScript, stylesheets and custom HTTP 404.');
} finally {
 await browser.close();
}
