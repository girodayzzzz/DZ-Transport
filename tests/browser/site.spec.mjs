import {test,expect} from '@playwright/test';
import {AxeBuilder} from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {grouping} from '../../src/lib/form-schema.mjs';

const origin='https://dz-transport.test';
const root=(process.env.BASE_PATH || '/').replace(/\/$/,'');
const path = suffix => origin+root+suffix;
const mime={css:'text/css',js:'text/javascript',html:'text/html',jpg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};
const fixture='https://intake.test/inquiry';
const partnerFixture='https://intake.test/partners';
const endpointHeaders={'access-control-allow-origin':origin,'access-control-allow-headers':'content-type,accept','access-control-allow-methods':'POST, OPTIONS'};

async function useFiles(page,{configured=false,guestPartner=false}={}) {
 await page.route(origin+'/**',async route=>{
  try {
   const uri=new URL(route.request().url()).pathname;
   const file=uri.slice(root.length).replace(/^\//,'')+(uri.endsWith('/')?'index.html':'');
   const location=resolve('dist',file);
   if (!location.startsWith(resolve('dist')+'/')) return route.abort();
   const content=await readFile(location);
   const extension=location.split('.').pop();
   let body=configured&&extension==='html'
    ? content.toString().replace(/data-endpoint(?:="[^"]*")?(?=\s|>)/g,'data-endpoint="'+(uri.includes('/partners/')?partnerFixture:fixture)+'"')
    : content;
   if(guestPartner && uri.endsWith('/en/partners/') && extension==='html') {
    body=content.toString()
     .replace(/data-endpoint(?:="[^"]*")?(?=\s|>)/,'data-endpoint="'+origin+'/api/partner-application" data-turnstile="fixture_site_key"')
     .replace('</form>','<div data-human-check></div></form>');
   }
   await route.fulfill({body,contentType:mime[extension] || 'application/octet-stream'});
  } catch {await route.fulfill({status:404,body:'Not found'});}
 });
}

const byName=(page,name)=>page.locator('[name="'+name+'"]:visible');
const btn=(page,name)=>page.getByRole('button',{name,exact:true});
async function fillRequired(page) {
 const inputs=page.locator('form :is(input,textarea,select):required:visible');
 for(const input of await inputs.all()){
  if(await input.inputValue()) {
   if(await input.getAttribute('type')==='checkbox') await input.check();
   continue;
  }
  const tag=await input.evaluate(node=>node.tagName);
  const type=await input.getAttribute('type');
  if(tag==='SELECT') await input.selectOption({index:1});
  else if(type==='checkbox') await input.check();
  else if(type==='number') await input.fill((await input.getAttribute('name'))==='year'?'2018':'2');
  else if(type==='email') await input.fill('transport@example.invalid');
  else if(type==='tel') await input.fill('+386 40 123 456');
  else await input.fill('Sample for testing');
 }
}

async function routeAndCargo(page,category) {
 await byName(page,'transportCategory').selectOption(category);
 await btn(page,'Next').click();
 await fillRequired(page);
 await btn(page,'Next').click();
 await expect(page.locator('[data-cargo]:visible')).toHaveAttribute('data-cargo',grouping[category]);
}

test('localized desktop, tablet and mobile menus and quick quote transfer',async({page})=>{
 await useFiles(page);
 for(const width of [1440,1024,768,430,390,375,320]){
  await page.setViewportSize({width,height:900});
  await page.goto(path('/'));
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if(width<=1000){
   const menu=page.getByRole('button',{name:'Meni',exact:true});
   await menu.click();
   await expect(page.getByRole('navigation',{name:'Glavna navigacija'})).toBeVisible();
   await page.keyboard.press('Escape');
   await expect(menu).toHaveAttribute('aria-expanded','false');
   await page.locator('[data-quick]').scrollIntoViewIfNeeded();
   await expect(page.locator('.mobile-quote')).toBeHidden();
  }
 }
 await page.getByLabel('Jezik',{exact:true}).click();
 await page.getByRole('link',{name:'English',exact:true}).click();
 await expect(page).toHaveURL(path('/en/'));
 await page.goto(path('/'));
 await expect(page).toHaveURL(path('/en/'));
 await page.getByLabel('Language',{exact:true}).click();
 await page.getByRole('link',{name:'Deutsch',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','de');
 await page.goto(path('/en/'));
 await byName(page,'transportCategory').selectOption('pallet');
 await byName(page,'pickupCountry').selectOption('SI');
 await byName(page,'deliveryCountry').selectOption('DE');
 await byName(page,'pickupPlace').fill('Ljubljana');
 await byName(page,'deliveryPlace').fill('10115');
 await btn(page,'Continue').click();
 await expect(byName(page,'transportCategory')).toHaveValue('pallet');
 await btn(page,'Next').click();
 await expect(byName(page,'pickupCountry')).toHaveValue('SI');
 await expect(byName(page,'pickupCity')).toHaveValue('Ljubljana');
 await expect(byName(page,'deliveryCountry')).toHaveValue('DE');
 await expect(byName(page,'deliveryPostal')).toHaveValue('10115');
});

test('long German footer labels fit on narrow pages',async({page})=>{
 await useFiles(page);
 await page.setViewportSize({width:320,height:880});
 for (const suffix of ['/de/leistungen/','/de/partner/']) {
  await page.goto(path(suffix));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 }
});

for (const category of Object.keys(grouping)) {
 test(category+' selects the right conditional fields and shows validation',async({page})=>{
  await useFiles(page);
  await page.goto(path('/en/inquiry/'));
  await btn(page,'Next').click();
  await expect(page.getByText('Complete this field.',{exact:true})).toBeVisible();
  await routeAndCargo(page,category);
  await fillRequired(page);
  if(category==='nonRunning') await byName(page,'running').selectOption('no');
  await byName(page,'regulated').selectOption('yes');
  await expect(page.locator('[data-regulated]')).toBeVisible();
  await btn(page,'Next').click();
  await byName(page,'pickupDate').fill('2000-01-01');
  await btn(page,'Next').click();
  await expect(page.getByText('The pickup date cannot be in the past.')).toBeVisible();
  await byName(page,'pickupDate').fill('');
  await byName(page,'flexible').check();
  await btn(page,'Next').click();
  await expect(page.getByRole('heading',{name:'Customer information'})).toBeVisible();
 });
}

test('a failed inquiry retains data, retry retains the reference, accepted inquiry redirects once',async({page})=>{
 await useFiles(page,{configured:true});
 const requests=[];
 await page.route(fixture,async route=>{
  if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:endpointHeaders});
  requests.push(route.request().postDataJSON());
  if(requests.length===1) return route.abort('failed');
  await route.fulfill({status:200,headers:endpointHeaders,json:{ok:true}});
 });
 await page.goto(path('/en/inquiry/?customerType=business'));
 await routeAndCargo(page,'car');
 await fillRequired(page);
 await byName(page,'regulated').selectOption('yes');
 await btn(page,'Next').click();
 await byName(page,'flexible').check();
 await btn(page,'Next').click();
 await expect(byName(page,'customerType')).toHaveValue('business');
 await expect(byName(page,'company')).toBeVisible();
 await fillRequired(page);
 await btn(page,'Next').click();
 await expect(page.locator('[data-summary]')).toContainText('Sample for testing');
 await page.getByRole('button',{name:'Edit Customer information'}).click();
 await expect(byName(page,'company')).toHaveValue('Sample for testing');
 await btn(page,'Next').click();
 await btn(page,'Submit inquiry').click();
 await expect(page.getByText('Complete this field.')).toBeVisible();
 await byName(page,'privacy').check();
 await btn(page,'Submit inquiry').click();
 await expect(page.getByRole('alert')).toContainText('could not be confirmed');
 await expect(byName(page,'privacy')).toBeChecked();
 await btn(page,'Submit inquiry').dblclick();
 await expect(page).toHaveURL(path('/en/confirmation/'));
 await expect(page.getByText('Your inquiry was submitted.')).toBeVisible();
 expect(requests).toHaveLength(2);
 expect(requests[0].reference).toMatch(/^DZT-\d{8}-[A-Z0-9]{6}$/);
 expect(requests[1].reference).toBe(requests[0].reference);
 expect(requests[1].additionalRequirements).toMatchObject({manualAssessment:true,privacy:true,marketing:false});
 await page.reload();
 await expect(page.getByText('Your inquiry was submitted.')).toBeHidden();
});

test('partner form uses its own endpoint and the default build disables sending',async({page})=>{
 await useFiles(page);
 await page.goto(path('/en/partners/'));
 await expect(btn(page,'Submit application')).toBeDisabled();
 await expect(page.getByText('Online submission is currently unavailable.',{exact:false})).toBeVisible();
 await page.unrouteAll();
 await useFiles(page,{configured:true});
 await page.route(partnerFixture,async route=>{
  if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:endpointHeaders});
  expect(route.request().postDataJSON()).toMatchObject({kind:'partner',application:{company:'Sample for testing'},permission:{privacy:true}});
  await route.fulfill({status:200,headers:endpointHeaders,json:{ok:true}});
 });
 await page.goto(path('/en/partners/'));
 await fillRequired(page);
 await btn(page,'Submit application').click();
 await expect(page.getByText('Your application was submitted for review.')).toBeVisible();
});

test('guest carrier application retains entered fields and reuses the reference after a failed write',async({page})=>{
 await useFiles(page,{guestPartner:true});
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({
  contentType:'text/javascript',body:`
   let widget;
   window.turnstile={
    render(target,options) {
     widget=options;
     const check=document.createElement('button');
     check.type='button';
     check.textContent='Fixture verification';
     check.onclick=()=>widget.callback(widget.action);
     target.append(check);
     return 'fixture';
    },
    reset() {}
   };`
 }));
 const submissions=[];
 await page.route(origin+'/api/partner-application',async route=>{
  const submission=route.request().postDataJSON();
  submissions.push(submission);
  await route.fulfill(submissions.length===1?{status:503,json:{ok:false}}:{status:200,json:{ok:true,reference:submission.reference}});
 });
 await page.goto(path('/en/partners/'));
 await fillRequired(page);
 await expect(btn(page,'Submit application')).toBeDisabled();
 await btn(page,'Fixture verification').click();
 await btn(page,'Submit application').click();
 await expect(page.locator('[data-form-error]')).toBeVisible();
 await expect(byName(page,'company')).toHaveValue('Sample for testing');
 await expect(btn(page,'Submit application')).toBeDisabled();
 await btn(page,'Fixture verification').click();
 await btn(page,'Submit application').click();
 await expect(page.getByText('Your application was submitted for review.')).toBeVisible();
 expect(submissions).toHaveLength(2);
 expect(submissions[1]).toEqual(submissions[0]);
 expect(submissions[1]).toMatchObject({kind:'partner',turnstileToken:'guest-partner',permission:{privacy:true}});
});

for(const [name,suffix] of [['home','/'],['inquiry','/povprasevanje/'],['partner','/partnerji/'],['services','/de/leistungen/'],['legal','/en/privacy/']]){
 test('axe audit for '+name,async({page})=>{
  await useFiles(page);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(path(suffix));
   const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   expect(results.violations.map(({id,nodes})=>[id,nodes.map(node=>node.target)])).toEqual([]);
  }
 });
}

test('cargo lines calculate and remove independently and appear in the review',async({page})=>{
 await useFiles(page);
 await page.goto(path('/en/inquiry/'));
 await routeAndCargo(page,'pallet');
 await fillRequired(page);
 const panel=page.locator('[data-cargo="pallet"]');
 const first=panel.locator('.cargo-item').first();
 await first.locator('[name=quantity]').fill('2');
 await first.locator('[name=length]').fill('120');
 await first.locator('[name=width]').fill('80');
 await first.locator('[name=height]').fill('50');
 await first.locator('[name=unitWeightKg]').fill('25');
 await expect(panel.locator('[data-weight]')).toHaveText('50');
 await expect(panel.locator('[data-volume]')).toHaveText('0.96');
 await btn(page,'Add cargo item').click();
 const second=panel.locator('.cargo-item').last();
 await second.locator('[name=dimensionUnit]').selectOption('m');
 await fillRequired(page);
 await expect(panel.locator('[data-weight]')).toHaveText('54');
 await expect(panel.locator('[data-volume]')).toHaveText('16.96');
 await second.getByRole('button',{name:'Remove item'}).click();
 await expect(panel.locator('[data-weight]')).toHaveText('50');
 await btn(page,'Next').click();
 await byName(page,'flexible').check();
 await btn(page,'Next').click();
 await fillRequired(page);
 await btn(page,'Next').click();
 await expect(page.locator('[data-summary] [data-volume]')).toHaveText('0.96');
});

test('corridor direction and recurring business details use their localized inquiry entry points',async({page})=>{
 await useFiles(page);
 await page.goto(path('/de/'));
 await page.getByRole('link',{name:'Transport zwischen Slowenien und Italien'}).click();
 await page.getByRole('link',{name:'Nach Slowenien'}).click();
 await expect(page.url()).toContain('pickupCountry=IT');
 await page.goto(path('/en/business/'));
 await page.getByRole('link',{name:'Recurring shipments'}).click();
 await routeAndCargo(page,'car');
 await fillRequired(page);
 await btn(page,'Next').click();
 await byName(page,'flexible').check();
 await btn(page,'Next').click();
 await expect(byName(page,'frequency')).toBeVisible();
 await byName(page,'frequency').fill('Monthly');
 await byName(page,'businessPattern').selectOption('once');
 await expect(byName(page,'frequency')).toBeHidden();
 await fillRequired(page);
 await btn(page,'Next').click();
 await expect(page.locator('[data-summary]')).not.toContainText('Monthly');
});

test('portal preview is unavailable and noindexed in all locales',async({page})=>{
 await useFiles(page);
 await page.setViewportSize({width:320,height:850});
 for(const [suffix,language,title,message] of [
  ['/prijava/','sl','Prijava','Portal še ni na voljo.'],
  ['/en/login/','en','Sign in','The portal is currently unavailable.'],
  ['/de/anmelden/','de','Anmelden','Das Portal ist derzeit nicht verfügbar.']
 ]) {
  await page.goto(path(suffix));
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.getByRole('heading',{level:1,name:title})).toBeVisible();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  await expect(page.locator('[data-portal][data-init]')).toHaveCount(0);
  const register = page.locator('[data-portal] a');
  await register.click();
  await expect(page.locator('[data-portal="register"]')).toBeVisible();
  await expect(page.locator('[data-portal][data-init]')).toHaveCount(0);
  await page.locator('[data-portal] a').click();
  await expect(page).toHaveURL(path(suffix));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 }
});
