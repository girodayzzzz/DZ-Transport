import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/site.json' with {type:'json'};
import {assertConfiguration, configurationIssues, localizedDisclosure, pagesDeploymentIssues} from '../src/lib/site-config.mjs';

test('confirmed operator details allow preview while production requires legal approval and endpoints',()=>{
 assert.doesNotThrow(()=>assertConfiguration('preview'));
 assert.throws(()=>assertConfiguration('production'), /privacy.retention.*approvalReference.*endpoints.inquiry/);
 assert.throws(()=>assertConfiguration('unknown'), /DZ_SITE_MODE/);
});

test('production accepts distinct mock HTTPS endpoints and approved operator settings',()=>{
 const configured={
  ...config,
  operator:'Fixture operator',address:'Fixture address',registration:'Fixture registration',
  vatApplicable:false,email:'test@example.invalid',telephone:'+38640123456',businessHours:'Fixture hours',
  legal:{approvalReference:'Fixture approval',contractualRole:'Fixture role'},
  privacy:{retention:'Fixture retention',provider:'Fixture processor'},
  endpoints:{inquiry:'https://example.invalid/inquiry',partner:'https://example.invalid/partner'}
 };
 assert.deepEqual(configurationIssues(configured,'production',{siteUrl:'https://transport.example'}),[]);
 configured.endpoints.partner=configured.endpoints.inquiry;
 assert.deepEqual(configurationIssues(configured,'production',{siteUrl:'https://transport.example'}),['endpoints must be distinct']);
});

test('pilot requires a dedicated Cloudflare Pages preview branch and origin',()=>{
 const pilot={pages:'1',pagesBranch:'codex/closed-pilot',siteUrl:'https://codex-closed-pilot.dz-transport.pages.dev',basePath:'/'};
 assert.deepEqual(configurationIssues(config,'pilot',pilot),[]);
 for(const override of [{pages:'0'},{pagesBranch:'main'},{siteUrl:'https://dz-transport.pages.dev'},
  {siteUrl:'https://different.pages.dev'},{basePath:'/DZ-Transport/'}]) {
  assert.notEqual(configurationIssues(config,'pilot',{...pilot,...override}).length,0);
 }
 const production=configurationIssues(config,'production',{...pilot,guestIntake:true,guestPartnerIntake:true});
 assert.ok(production.includes('legal.approvalReference'));
 assert.ok(production.includes('privacy.retention'));
});


test('Cloudflare validates public/runtime deployment consistency without reading secrets',()=>{
 const url='https://dz-transport.eu';
 const project='https://hgnwrtqpjxhidzeemaqb.supabase.co';
 const good={CF_PAGES:'1',CF_PAGES_BRANCH:'main',DZ_SITE_MODE:'production',SITE_URL:url,BASE_PATH:'/',
  DZ_SITE_ORIGIN:url,PUBLIC_DZ_PORTAL:'true',PUBLIC_DZ_MANAGER:'true',PUBLIC_DZ_PARTNER:'true',
  PUBLIC_DZ_GUEST_INTAKE:'true',DZ_GUEST_INTAKE:'true',PUBLIC_DZ_GUEST_PARTNER_INTAKE:'true',
  DZ_GUEST_PARTNER_INTAKE:'true',PUBLIC_SUPABASE_URL:project,SUPABASE_URL:project};
 assert.deepEqual(pagesDeploymentIssues(good),[]);
 assert.deepEqual(pagesDeploymentIssues({...good,DZ_SITE_MODE:'preview',SITE_URL:'https://dz-transport.pages.dev'}),[]);
 assert.deepEqual(pagesDeploymentIssues({...good,PUBLIC_DZ_PORTAL:'false',DZ_GUEST_PARTNER_INTAKE:'false'}),[
  'PUBLIC_DZ_PORTAL=true is required for manager and carrier panels','PUBLIC_DZ_GUEST_PARTNER_INTAKE and DZ_GUEST_PARTNER_INTAKE must agree'
 ]);
 assert.ok(pagesDeploymentIssues({...good,DZ_SITE_ORIGIN:'https://other.invalid',SUPABASE_URL:'https://other.supabase.co'})
  .includes('SUPABASE_URL must match PUBLIC_SUPABASE_URL'));
});

test('localized legal disclosures require all three translations for production',()=>{
 assert.match(localizedDisclosure(config.legal.contractualRole,'de'),/Beförderungsvertrag/);
 const incomplete={...config,privacy:{provider:{sl:'Podatek',en:'Information'},retention:'Fixture retention'},
  legal:{...config.legal,approvalReference:'Fixture approval'}};
 assert.deepEqual(configurationIssues(incomplete,'production',{
  siteUrl:'https://dz-transport.eu',guestIntake:true,guestPartnerIntake:true
 }),['privacy.provider']);
});
