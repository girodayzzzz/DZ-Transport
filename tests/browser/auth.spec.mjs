import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {portalCopy,portalTitles,statusLabels} from '../../src/lib/portal-copy.ts';
import {paymentCopy} from '../../src/lib/v8-copy.ts';

const origin='https://portal-test.invalid';
const project='https://dz-fixture.supabase.co';
const base=(process.env.BASE_PATH||'/').replace(/\/$/,'');
const routes={
 login:'login',register:'register',forgot:'forgot-password',reset:'reset-password',verify:'verify-email',
 callback:'auth-callback',account:'account',logout:'logout',deletion:'account-deletion',customer:'customer-portal',
 carrier:'partner-portal',manager:'transport-manager',load:'load'
};
const links=Object.fromEntries(Object.entries(routes).map(([key,path])=>[key,base+'/en/'+path+'/']));
const localizedLabels=position=>Object.fromEntries(Object.entries({...portalCopy,...portalTitles,...statusLabels})
 .map(([key,values])=>[key,values[position]]));
const labels=localizedLabels(1);
const v7Routes={
 sl:{login:'prijava',customer:'portal-stranke',carrier:'portal-prevozniki',manager:'upravljanje',load:'tovor'},
 en:routes,
 de:{login:'anmelden',customer:'kundenportal',carrier:'partnerportal',manager:'transport-manager',load:'fracht'}
};
const loadId='77100000-0000-0000-0000-000000000001';
const chatId='77100000-0000-0000-0000-000000000002';
const orderId='77100000-0000-0000-0000-000000000003';
const loadReference='Synthetic transport reference';
const user={id:'cccccccc-cccc-4ccc-bccc-cccccccccccc',email:'customer@example.invalid',
 email_confirmed_at:'2026-11-26T12:00:00Z',app_metadata:{},user_metadata:{},aud:'authenticated'};
const secret='synthetic-test-password';

async function setup(page,{onboarding=false,google=false,quickDeal=false,lang='en',v7=false,v8=false}={}) {
 const paths=Object.fromEntries(Object.entries(v7Routes[lang]).map(([key,path])=>[key,base+'/'+(lang==='sl'?'':lang+'/')+path+'/']));
 const dictionary=localizedLabels(['sl','en','de'].indexOf(lang));
 const init=JSON.stringify({configuration:{url:project,key:'sb_publishable_mock',google,onboarding,quickDeal},labels:dictionary,links:paths});
 let profile=null;
 let requestedDeal=false;
 const calls=[];
 await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  if(v8 && url.pathname==='/api/transport-payments') {
   const data=route.request().postDataJSON();
   calls.push({path:url.pathname,data});
   return route.fulfill({status:202,json:{payment:orderId}});
  }
  const relative=url.pathname.slice(base.length).replace(/^\//,'');
  if(!/^(_astro\/[^/]+\.(js|css)|(?:(?:en|de)\/)?[a-z-]+\/)$/.test(relative)) return route.fulfill({status:404});
  const file=await readFile('dist/'+relative+(relative.endsWith('/')?'index.html':''),'utf8');
  if(relative.endsWith('/')) {
   const escaped=init.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
   const body=file.replace(/(data-portal="[a-z-]+")([^>]*>)/,
    '$1 data-init="'+escaped+'"$2<p role="status" data-portal-status></p><div data-portal-body></div>');
   return route.fulfill({body,contentType:'text/html'});
  }
  return route.fulfill({body:file,contentType:relative.endsWith('.css')?'text/css':'text/javascript'});
 });
 await page.route(project+'/**',async route=>{
  const request=route.request();
  const url=new URL(request.url());
  const headers={
   'access-control-allow-origin':origin,
   'access-control-allow-methods':'GET,POST,PUT,OPTIONS',
   'access-control-allow-headers':request.headers()['access-control-request-headers'] || '*'
  };
  if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
  const data=request.postDataJSON();
  calls.push({path:url.pathname,search:url.search,data});
  const respond=(json,status=200)=>route.fulfill({status,headers,json});
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=v7 ? encoded({alg:'HS256'})+'.'+encoded({aal:'aal2',sub:user.id})+'.fixture' : 'fixture-access-token';
  const session={access_token:token,refresh_token:'fixture-refresh-token',
   token_type:'bearer',expires_in:3600,user};
  if(url.pathname==='/auth/v1/authorize') return route.fulfill({
   contentType:'text/html',
   body:'<a href="'+origin+links.callback+'?code=synthetic-oauth-code">Approve fixture consent</a>'
  });
  if(v7) {
   const fixtures={
    public_load:[{category:'pallet',origin_country:'SI',destination_country:'DE',test_data:true,can_ask:false}],
    public_load_questions:[{question:'Synthetic public question',answer:'Synthetic public answer'}],
    list_load_questions:[],load_publication:null,
    v8_available:v8,
    v8_customer_bids:[{id:loadId,inquiry_id:loadReference,amount_minor:50000,currency:'EUR',vat_treatment:'Fixture',
     valid_until:'2026-12-31',status:'sent'}],
    transport_payments:[{id:orderId,inquiry_id:loadId,quote_id:loadId,kind:'quote',state:'checkout_pending',
     gross_minor:50000,commission_minor:5000,currency:'EUR',refunded_minor:0}],
    payment_activity:[{payment_id:orderId,event:'checkout_pending',created_at:'2026-11-26T12:00:00Z'}],
    user_roles:[{id:'admin'}],manager_counts:[],manager_financials:[],
    partner_applications:[{id:'application',state:'approved'}],my_carrier_plan:'basic',
    transport_inquiries:[{id:loadId,reference:loadReference,origin:'SI',destination:'DE',status:'scheduled'}],
    transport_orders:[{id:orderId,inquiry_id:loadId}],
    transport_assignments:[{order_id:orderId,instructions:'Fixture instructions'}],
    transport_status_history:[{inquiry_id:loadId,status:'scheduled',created_at:'2026-11-26T12:00:00Z'}],
    transport_conversations:[{id:chatId,order_id:orderId,reference:loadReference}],
    transport_messages:[{body:'Synthetic private message',sender_id:user.id,created_at:'2026-11-26T12:00:00Z'}],
    notifications:[{id:'notification',event:'transport_message',conversation_id:chatId,created_at:'2026-11-26T12:00:00Z'}],
    carrier_fees:[{id:'fee',order_id:orderId,reference:loadReference,plan:'basic',rate:7,base_minor:100000,
     fee_minor:7000,currency:'EUR',created_at:'2026-11-26T12:00:00Z',voided_at:'2026-11-26T13:00:00Z'}]
   };
   const key=url.pathname.split('/').at(-1);
   if(Object.hasOwn(fixtures,key)) return respond(fixtures[key]);
   if(key==='send_transport_message') return route.fulfill({status:204,headers});
  }
  if(quickDeal && url.pathname==='/rest/v1/partner_applications') return respond([{id:'application',state:'approved'}]);
  if(quickDeal && url.pathname.endsWith('/rpc/my_carrier_plan')) return respond('free');
 if(quickDeal && url.pathname.endsWith('/rpc/list_quick_deals')) {
   return respond([{
    id:'fixture-deal',reference:'Fixture transport',cargo_category:'Pallets',pickup_region:'SI',delivery_region:'DE',
    status:requestedDeal?'acceptance_requested':'available',has_requested:requestedDeal,carrier_minor:45000,currency:'EUR',
    expires_at:'2026-12-03T12:00:00Z',pickup_window:'[2026-12-01,2026-12-03)',
    delivery_window:'[2026-12-04,2026-12-05)',vehicle_requirements:'Box van',weight_kg:700
   }]);
  }
  if(quickDeal && url.pathname.endsWith('/rpc/request_quick_deal')) {
   requestedDeal=true;
   return route.fulfill({status:204,headers});
  }
  if(url.pathname==='/rest/v1/profiles') return respond(profile ? [profile] : []);
  if(url.pathname.endsWith('/rpc/choose_customer_account_type')) {
   profile={account_type:data.p_type,display_name:'',onboarding_completed_at:null};
   return route.fulfill({status:204,headers});
  }
  if(url.pathname.endsWith('/rpc/complete_free_customer_onboarding')) {
   profile={...profile,display_name:data.p_name,onboarding_completed_at:new Date().toISOString()};
   return route.fulfill({status:204,headers});
  }
  if(url.pathname==='/auth/v1/signup') return respond({user,session:null});
  if(url.pathname==='/auth/v1/recover') return respond({});
  if(url.pathname==='/auth/v1/verify') return respond(session);
  if(url.pathname==='/auth/v1/token') {
   return url.searchParams.get('grant_type')==='refresh_token'
    ? respond({message:'Refresh token invalid',error_code:'refresh_token_not_found'},400) : respond(session);
  }
  if(url.pathname==='/auth/v1/user') return respond(user);
  if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204,headers});
  if(url.pathname.startsWith('/rest/v1/')) return respond([]);
  return respond({},404);
 });
 return {calls,dictionary,open:(key,suffix='')=>page.goto(origin+paths[key]+suffix)};
}

test('registration, email confirmation, sign-out and ordinary login',async({page})=>{
 const {calls,open}=await setup(page,{onboarding:true});
 await open('register');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Register',exact:true}).click();
 await expect(page.locator('[data-portal-status]')).toHaveText(labels.mailSent);
 expect(calls.find(call=>call.path.endsWith('/signup')).search).toContain(encodeURIComponent(origin+links.verify));
 await page.goto(origin+links.verify+'#token_hash=fixture-email&type=email');
 await expect(page).toHaveURL(origin+links.customer);
 await page.getByRole('combobox',{name:labels.accountType,exact:true}).selectOption('private_customer');
 await page.getByRole('button',{name:labels.continueSetup,exact:true}).click();
 await page.getByLabel(labels.name,{exact:true}).fill('Synthetic Private Customer');
 await expect(page.getByLabel(labels.registeredBusinessName,{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:labels.activateFree,exact:true}).click();
 await expect(page.getByRole('heading',{name:labels.inProgress,exact:true})).toBeVisible();
 await open('logout');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page).toHaveURL(origin+links.login);
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(origin+links.customer);
 await expect(page.getByRole('heading',{name:labels.inProgress,exact:true})).toBeVisible();
});

test('password recovery and a refused expired session',async({page})=>{
 const {calls,open}=await setup(page);
 await open('forgot');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.locator('[data-portal-status]')).toHaveText(labels.mailSent);
 await page.goto(origin+links.verify+'#token_hash=fixture-recovery&type=recovery');
 await expect(page).toHaveURL(origin+links.reset);
 await page.getByLabel('Password',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page).toHaveURL(origin+links.login);
 expect(calls.some(call=>call.path.endsWith('/user') && call.data?.password===secret)).toBeTruthy();
 await page.evaluate(user=>{
  sessionStorage.setItem('sb-dz-fixture-auth-token',JSON.stringify({
   user,access_token:'expired',refresh_token:'expired',expires_in:1,expires_at:1,token_type:'bearer'
  }));
 },user);
 await open('customer');
 await expect(page.locator('[data-portal-status]')).toHaveText(labels.authRequired);
 expect(calls.some(call=>call.search.includes('grant_type=refresh_token'))).toBeTruthy();
 await expect(page.getByRole('heading',{name:labels.inProgress,exact:true})).toHaveCount(0);
});

test('Google registration shares resumable business customer onboarding',async({page})=>{
 const {calls,open}=await setup(page,{onboarding:true,google:true});
 await open('register');
 await page.getByRole('button',{name:labels.google,exact:true}).click();
 const consent=page.getByRole('link',{name:'Approve fixture consent'});
 await expect(consent).toBeVisible();
 const authorize=new URL(page.url());
 expect(authorize.searchParams.get('provider')).toBe('google');
 expect(authorize.searchParams.get('redirect_to')).toBe(origin+links.callback);
 expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
 await consent.click();
 await expect(page.getByRole('heading',{name:labels.chooseAccountType})).toBeVisible();
 expect(calls.some(call=>call.search.includes('grant_type=pkce') && call.data?.auth_code==='synthetic-oauth-code')).toBeTruthy();
 await page.getByRole('combobox',{name:labels.accountType,exact:true}).selectOption('business_customer');
 await page.getByRole('button',{name:labels.continueSetup,exact:true}).click();
 await expect(page.getByRole('heading',{name:labels.completeCustomerProfile})).toBeVisible();
 await page.reload();
 await page.getByLabel(labels.name,{exact:true}).fill('Synthetic Customer');
 await page.getByLabel(labels.registeredBusinessName,{exact:true}).fill('Synthetic Transport Buyer');
 await page.getByRole('button',{name:labels.activateFree,exact:true}).click();
 await expect(page.getByRole('heading',{name:labels.inProgress,exact:true})).toBeVisible();
 expect(calls.find(call=>call.path.endsWith('/complete_free_customer_onboarding')).data)
  .toEqual({p_name:'Synthetic Customer',p_business_name:'Synthetic Transport Buyer'});
});

test('eligible carrier filters and requests a Quick Deal',async({page})=>{
 const {calls,open}=await setup(page,{quickDeal:true});
 await page.setViewportSize({width:390,height:844});
 await open('login');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(origin+links.customer);
 await open('carrier');
 const deals=page.locator('article').filter({has:page.getByRole('heading',{name:labels.quickDeals})});
 await expect(deals.getByText('Fixture transport')).toBeVisible();
 await deals.getByRole('combobox',{name:labels.status,exact:true}).selectOption('reserved');
 await deals.getByRole('button',{name:labels.search,exact:true}).click();
 await expect(deals.getByText('Fixture transport')).toHaveCount(0);
 await deals.getByRole('combobox',{name:labels.status,exact:true}).selectOption('all');
 await deals.getByRole('button',{name:labels.search,exact:true}).click();
 await deals.locator('summary').filter({hasText:labels.quickDealRequest}).click();
 await deals.getByRole('checkbox',{name:labels.acceptFeeTerms}).check();
 await deals.getByRole('button',{name:labels.quickDealRequest,exact:true}).click();
 await expect(deals.getByRole('cell',{name:labels.acceptance_requested})).toBeVisible();
 expect(calls.find(call=>call.path.endsWith('/request_quick_deal')).data).toEqual({p_deal:'fixture-deal',p_amount:45000,p_currency:'EUR',p_plan:'free'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


for(const lang of ['sl','en','de']) test('V7 mobile portal flows · '+lang,async({page})=>{
 const {calls,open,dictionary:copy}=await setup(page,{v7:true,lang});
 await page.setViewportSize({width:390,height:844});
 await open('load','?id='+loadId);
 await expect(page.getByRole('heading',{name:copy.questions})).toBeVisible();
 await expect(page.getByText('Synthetic public answer')).toBeVisible();
 await expect(page.getByText(copy.testListing)).toBeVisible();
 await expect(page.getByRole('button',{name:copy.ask,exact:true})).toHaveCount(0);
 await open('login');
 await page.getByLabel(copy.email,{exact:true}).fill(user.email);
 await page.getByLabel(copy.password,{exact:true}).fill(secret);
 await page.getByRole('button',{name:copy.login,exact:true}).click();
 await expect(page.getByRole('heading',{name:copy.inProgress,exact:true})).toBeVisible();
 await page.locator('summary').filter({hasText:copy.questions}).click();
 await page.getByRole('button',{name:copy.refreshQuestions}).click();
 const notification=page.locator('#notifications').getByRole('link',{name:loadReference});
 await notification.click();
 await expect(page.getByText('Synthetic private message')).toBeVisible();
 await page.getByLabel(copy.message,{exact:true}).fill('Fixture reply');
 await page.getByRole('button',{name:copy.sendMessage,exact:true}).click();
 await expect(page.getByLabel(copy.message,{exact:true})).toHaveValue('');
 expect(calls.find(call=>call.path.endsWith('/rpc/send_transport_message')).data)
  .toMatchObject({p_conversation:chatId,p_body:'Fixture reply'});

 await open('carrier');
 await expect(page.locator('#assignments').getByText(copy.scheduled,{exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:copy.fees,exact:true})).toBeVisible();
 await expect(page.locator('#fees article').getByText(copy.feeAmount,{exact:false})).toBeVisible();
 await expect(page.locator('#fees').getByText('7 %',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

 await open('manager');
 await expect(page.getByRole('heading',{name:copy.fees,exact:true})).toBeVisible();
 await expect(page.locator('#inquiries summary').first()).toBeVisible();
 await expect(page.getByRole('heading',{name:copy.chat,exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('V8 customer can select a payable bid and resume its Stripe Checkout',async({page})=>{
 const {calls,open,dictionary:copy}=await setup(page,{v7:true,v8:true,quickDeal:true});
 const paymentLabels=paymentCopy(1);
 await page.setViewportSize({width:390,height:844});
 await open('login');
 await page.getByLabel(copy.email,{exact:true}).fill(user.email);
 await page.getByLabel(copy.password,{exact:true}).fill(secret);
 await page.getByRole('button',{name:copy.login,exact:true}).click();
 const bids=page.locator('#payableBids');
 await expect(bids.getByText('€500.00')).toBeVisible();
 await bids.locator('summary').filter({hasText:paymentLabels.payBid}).click();
 await bids.getByRole('button',{name:paymentLabels.payBid}).click();
 await expect.poll(()=>calls.filter(call=>call.path==='/api/transport-payments').length).toBe(1);
 expect(calls.find(call=>call.path==='/api/transport-payments').data).toMatchObject({
  action:'checkout',kind:'quote',target:loadId
 });
 const payments=page.locator('#payments');
 await payments.locator('summary').filter({hasText:paymentLabels.checkout_pending}).click();
 await payments.getByRole('button',{name:paymentLabels.resumePayment}).click();
 await expect.poll(()=>calls.filter(call=>call.path==='/api/transport-payments').length).toBe(2);
 expect(calls.filter(call=>call.path==='/api/transport-payments').at(-1).data).toMatchObject({
  action:'checkout',kind:'quote',target:loadId,request:orderId
 });
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
