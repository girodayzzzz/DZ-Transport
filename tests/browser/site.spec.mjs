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

async function useFiles(page,{configured=false}={}) {
 await page.route(origin+'/**',async route=>{
  try {
   const uri=new URL(route.request().url()).pathname;
   const file=uri.slice(root.length).replace(/^\//,'')+(uri.endsWith('/')?'index.html':'');
   const location=resolve('dist',file);
   if (!location.startsWith(resolve('dist')+'/')) return route.abort();
   const content=await readFile(location);
   const extension=location.split('.').pop();
   const body=configured&&extension==='html'
    ? content.toString().replace(/data-endpoint(?:="[^"]*")?(?=\s|>)/g,'data-endpoint="'+(uri.includes('/partners/')?partnerFixture:fixture)+'"')
    : content;
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
 for(const width of [1440,820,375,320]){
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

test('all ten categories select the right conditional fields and show validation',async({page})=>{
 await useFiles(page);
 for(const category of Object.keys(grouping)){
  await page.goto(path('/en/inquiry/'));
  await btn(page,'Next').click();
  await expect(page.getByText('Complete this field.',{exact:true})).toBeVisible();
  await routeAndCargo(page,category);
  await fillRequired(page);
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
 }
});

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
