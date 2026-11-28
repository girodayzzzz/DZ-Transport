import {afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {billingOrigin,billingVersion} from '../functions/lib/carrier-billing.mjs';
import {onRequestPost as billing} from '../functions/api/stripe/billing.js';
import {onRequestPost as webhook} from '../functions/api/stripe/billing-webhook.js';

const carrier='13000000-0000-0000-0000-000000000001';
const attempt='13000000-0000-0000-0000-000000000002';
const metadata={dz_billing:'dz_transport_carrier_v1',dz_carrier:carrier,dz_billing_attempt:attempt};
const basic='price_1UgoRjLP0d1wngzHgpVmIeco';
const pro='price_1UgoTHLP0d1wngzHEPAhJuL7';
const fixture={
 DZ_SITE_MODE:'production',
 SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
 DZ_STRIPE_BILLING_ACCOUNT_ID:'acct_fixture',DZ_STRIPE_BILLING_API_KEY:'rk_live_fictionalkey',DZ_STRIPE_BILLING_WEBHOOK_SECRET:'whsec_fixture',
 DZ_STRIPE_BILLING_BASIC_PRICE_ID:basic,DZ_STRIPE_BILLING_PRO_PRICE_ID:pro,DZ_STRIPE_BILLING_PORTAL_ID:'bpc_fixture',
 DZ_STRIPE_BILLING_TAX_BEHAVIOR:'inclusive',DZ_STRIPE_BILLING_PURCHASE_ENABLED:'true'
};
const periodEnd=1799000000;
const now=()=>Math.floor(Date.now()/1000);
const actor=(admin=false)=>({id:carrier,admin,carrier:!admin});
const price=(id,amount)=>({id,livemode:true,active:true,type:'recurring',currency:'eur',unit_amount:amount,
 billing_scheme:'per_unit',tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
const portal={id:'bpc_fixture',active:true,livemode:true,is_default:false,default_return_url:billingOrigin,
 features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},
  subscription_update:{enabled:false}}};
const account={carrier_id:carrier,customer_request:attempt,created_at:new Date().toISOString(),customer_id:'cus_fixture'};
const openSession={id:'cs_live_fixture',livemode:true,customer:'cus_fixture',mode:'subscription',
 status:'open',metadata,url:'https://checkout.stripe.com/c/pay/fixture'};
const invoice={id:'in_fixture',livemode:true,customer:'cus_fixture',subscription:'sub_fixture',currency:'eur',status:'paid',
 amount_paid:1900,billing_reason:'subscription_cycle',lines:{data:[{price:{id:basic},type:'subscription',quantity:1,
  proration:false,amount:1900,period:{start:1796300000,end:periodEnd}}]}};
const subscription={id:'sub_fixture',customer:'cus_fixture',metadata,livemode:true,status:'active',current_period_end:periodEnd,
 items:{data:[{quantity:1,price:price(basic,1900)}]},latest_invoice:invoice};

const saved=globalThis.fetch;
afterEach(()=>{globalThis.fetch=saved;});
function emulate(t,changes={}) {
 const calls=[];
 const reservation={...account,attempt,checkout_plan:'basic',checkout_language:'de',
  checkout_until:new Date((now()+7200)*1000).toISOString()};
 const resolve=async (path,request)=>{
  if(Object.hasOwn(changes,path)) return typeof changes[path]==='function' ? changes[path](request) : changes[path];
  if(path==='/rest/v1/rpc/carrier_billing_actor') return actor();
  if(path==='/rest/v1/rpc/my_carrier_billing') return {plan:'free',has_customer:true};
  if(path==='/rest/v1/rpc/carrier_billing_account') return account;
  if(path==='/rest/v1/rpc/carrier_billing_reserve') return reservation;
  if(path==='/rest/v1/rpc/carrier_billing_event_target') return {...reservation,revision:4,session_id:openSession.id};
  if(path==='/rest/v1/rpc/carrier_billing_apply' || path==='/rest/v1/rpc/carrier_billing_record_session'
   || path==='/rest/v1/rpc/carrier_billing_bind') return null;
  if(path==='/v1/account') return {id:'acct_fixture'};
  if(path==='/v1/prices/'+basic) return price(basic,1900);
  if(path==='/v1/prices/'+pro) return price(pro,4990);
  if(path==='/v1/billing_portal/configurations/bpc_fixture') return portal;
  if(path==='/v1/tax/settings') return {livemode:true,status:'active',defaults:{tax_behavior:'inclusive'}};
  if(path==='/v1/customers/cus_fixture' || path==='/v1/customers') return {id:'cus_fixture',livemode:true,metadata};
  if(path==='/v1/subscriptions') return {data:[],has_more:false};
  if(path==='/v1/subscriptions/sub_fixture') return subscription;
  if(path==='/v1/invoices/in_fixture') return invoice;
  if(path==='/v1/checkout/sessions') return openSession;
  if(path==='/v1/billing_portal/sessions') return {customer:'cus_fixture',configuration:'bpc_fixture',livemode:true,
   url:'https://billing.stripe.com/p/session/fixture'};
  throw Error('Unexpected route '+path);
 };
 globalThis.fetch=async (url,options)=>{
  const parsed=new URL(url);
  assert.ok(['api.stripe.com','fixture.supabase.co'].includes(parsed.hostname));
  if(parsed.hostname==='api.stripe.com') {
   assert.equal(options.headers['Stripe-Version'],billingVersion);
   assert.equal(options.headers.Authorization,'Bearer '+fixture.DZ_STRIPE_BILLING_API_KEY);
  }
  const body=typeof options.body==='string' ? JSON.parse(options.body) : Object.fromEntries(options.body ?? []);
  const request={path:parsed.pathname,search:parsed.search,body,headers:options.headers,method:options.method};
  calls.push(request);
  const result=await resolve(parsed.pathname,request);
  return result instanceof Response ? result : Response.json(result);
 };
 return calls;
}
const action=(input,env=fixture,origin=billingOrigin,auth='Bearer fixture')=>billing({env,request:new Request(billingOrigin+'/api/stripe/billing',{
 method:'POST',headers:{Origin:origin,Authorization:auth},body:JSON.stringify(input)
})});
function webhookRequest(type,object,fields={},signedBody) {
 const raw=JSON.stringify({id:'evt_fixture',type,livemode:true,api_version:billingVersion,data:{object},...fields},null,2);
 const timestamp=now();
 const digest=createHmac('sha256',fixture.DZ_STRIPE_BILLING_WEBHOOK_SECRET).update(timestamp+'.'+(signedBody ?? raw)).digest('hex');
 return webhook({env:{...fixture,DZ_STRIPE_BILLING_PURCHASE_ENABLED:'false'},request:new Request(billingOrigin+'/api/stripe/billing-webhook',{
  method:'POST',headers:{'Stripe-Signature':'t='+timestamp+',v1='+digest},body:raw
 })});
}

test('checkout defaults off, validates origin and limits actions to approved carriers',async t=>{
 const calls=emulate(t,{'/rest/v1/rpc/carrier_billing_actor':null});
 assert.equal((await action({action:'checkout',plan:'basic'},fixture,'https://other.invalid')).status,403);
 assert.equal((await action({action:'checkout',plan:'basic'},fixture,billingOrigin,'')).status,401);
 assert.equal((await action({action:'checkout',plan:'basic'})).status,403);
 assert.ok(calls.every(call=>call.path.startsWith('/rest')));
 const approved=emulate(t);
 assert.equal((await action({action:'checkout',plan:'basic'},{...fixture,DZ_STRIPE_BILLING_PURCHASE_ENABLED:''})).status,503);
 assert.equal((await action({action:'checkout',plan:'basic'},{...fixture,DZ_SITE_MODE:'preview'})).status,503);
 assert.equal(approved.length,2);
});

test('read-only Live diagnostics report exact deviations and disable checkout',async t=>{
 const calls=emulate(t,{
  '/rest/v1/rpc/carrier_billing_actor':actor(true),
  ['/v1/prices/'+pro]:{...price(pro,4991),active:false,livemode:false,recurring:{interval:'year',interval_count:1,usage_type:'licensed'}}
 });
 const result=await action({action:'verify'},{...fixture,DZ_STRIPE_BILLING_PURCHASE_ENABLED:'false'});
 assert.equal(result.status,200);
 const report=await result.json();
 assert.equal(report.verified,false);
 assert.equal(report.purchaseSwitch,false);
 assert.deepEqual(report.errors,[
  'pro ('+pro+') livemode expected true, received false','pro ('+pro+') active expected true, received false',
  'pro ('+pro+') unit_amount expected 4990, received 4991','pro ('+pro+') recurring.interval expected "month", received "year"'
 ]);
 assert.ok(calls.filter(call=>call.path.startsWith('/v1')).every(call=>call.method==='GET'));
 const purchase=emulate(t,{['/v1/prices/'+basic]:{...price(basic,1900),tax_behavior:'exclusive'}});
 assert.equal((await action({action:'checkout',plan:'basic'})).status,503);
 assert.ok(!purchase.some(call=>call.path.endsWith('/checkout/sessions')));
});

test('the wrong Stripe account and a substituted Price ID cannot enable checkout',async t=>{
 const wrong=emulate(t,{'/v1/account':{id:'acct_unrelated'}});
 assert.equal((await action({action:'checkout',plan:'basic'})).status,503);
 assert.ok(wrong.every(call=>call.path!=='/v1/prices/'+basic));
 const calls=emulate(t,{'/rest/v1/rpc/carrier_billing_actor':actor(true)});
 const data=await (await action({action:'verify'},{...fixture,DZ_STRIPE_BILLING_BASIC_PRICE_ID:'price_other'})).json();
 assert.ok(data.errors.includes('DZ_STRIPE_BILLING_BASIC_PRICE_ID expected '+basic+', received price_other'));
 assert.ok(!calls.some(call=>call.path==='/v1/prices/price_other'));
});

test('checkout retries and concurrent same-plan clicks use one reservation and stable Stripe keys',async t=>{
 const calls=emulate(t,{'/rest/v1/rpc/carrier_billing_account':{...account,customer_id:null}});
 const results=await Promise.all([action({action:'checkout',plan:'basic',language:'de',price:'price_unrelated'}),
  action({action:'checkout',plan:'basic',language:'sl'})]);
 assert.deepEqual(await Promise.all(results.map(r=>r.json())),[{url:openSession.url},{url:openSession.url}]);
 const sessions=calls.filter(call=>call.path==='/v1/checkout/sessions');
 assert.equal(sessions.length,2);
 assert.deepEqual(sessions[0].body,sessions[1].body);
 assert.equal(sessions[0].headers['Idempotency-Key'],'dz-carrier-checkout:'+attempt);
 assert.equal(sessions[0].body.mode,'subscription');
 assert.equal(sessions[0].body['line_items[0][price]'],basic);
 assert.equal(sessions[0].body['subscription_data[metadata][dz_billing_attempt]'],attempt);
 assert.equal(sessions[0].body.success_url,billingOrigin+'/de/partnerportal/?billing=processing');
 assert.ok(calls.filter(call=>call.path==='/v1/customers').every(call=>call.headers['Idempotency-Key']==='dz-carrier-customer:'+attempt));
 const blocked=emulate(t,{'/rest/v1/rpc/carrier_billing_reserve':{blocked:'checkout'}});
 assert.equal((await action({action:'checkout',plan:'pro'})).status,409);
 assert.ok(!blocked.some(call=>call.path==='/v1/checkout/sessions'));
});

test('a previous completed Checkout is replaceable only after its associated subscription closes',async t=>{
 const existing={...account,attempt,checkout_until:new Date((now()-3600)*1000).toISOString(),session_id:'cs_live_previous',
  subscription_id:'sub_previous',state:'canceled'};
 const completed={...openSession,id:existing.session_id,status:'complete',subscription:'sub_previous'};
 const calls=emulate(t,{
  '/rest/v1/rpc/carrier_billing_account':existing,
  '/v1/checkout/sessions/cs_live_previous':completed,
  '/v1/subscriptions':{data:[{id:'sub_previous',status:'canceled'}],has_more:false}
 });
 assert.equal((await action({action:'checkout',plan:'basic'})).status,200);
 assert.equal(calls.find(call=>call.path.endsWith('/carrier_billing_reserve')).body.p_previous,attempt);
 const blocked=emulate(t,{
  '/rest/v1/rpc/carrier_billing_account':existing,
  '/v1/checkout/sessions/cs_live_previous':{...completed,subscription:'sub_unrelated'}
 });
 assert.equal((await action({action:'checkout',plan:'basic'})).status,409);
 assert.ok(!blocked.some(call=>call.path.endsWith('/carrier_billing_reserve')));
});

test('the dedicated portal remains available with buying off and receives localized return URL',async t=>{
 const calls=emulate(t);
 const response=await action({action:'portal',language:'sl'},{...fixture,DZ_STRIPE_BILLING_PURCHASE_ENABLED:'false'});
 assert.equal(response.status,200);
 assert.deepEqual(calls.find(c=>c.path.endsWith('/billing_portal/sessions')).body,{
  customer:'cus_fixture',configuration:'bpc_fixture',locale:'sl',return_url:billingOrigin+'/portal-prevozniki/'
 });
});

test('webhook accepts only the signed Live snapshot and retrieves a paid invoice even while purchase is off',async t=>{
 const calls=emulate(t);
 const object={...openSession,status:'complete',subscription:subscription.id};
 assert.equal((await webhookRequest('checkout.session.completed',object,{},'{"wrong":"raw bytes"}')).status,400);
 assert.equal((await webhookRequest('checkout.session.completed',object,{livemode:false})).status,400);
 assert.equal((await webhookRequest('checkout.session.completed',object,{account:'acct_other'})).status,400);
 assert.equal((await webhookRequest('checkout.session.completed',object,{api_version:'2024-06-20'})).status,400);
 assert.equal(calls.length,0);
 assert.equal((await webhookRequest('checkout.session.completed',object)).status,204);
 const application=calls.find(call=>call.path.endsWith('/carrier_billing_apply'));
 assert.equal(application.body.p_revision,4);
 assert.equal(application.body.p_paid_until,new Date(periodEnd*1000).toISOString());
});

test('a failed current invoice cannot extend benefits and another price cannot be applied',async t=>{
 const failed={...subscription,status:'past_due',latest_invoice:{...invoice,status:'open',amount_paid:0}};
 const calls=emulate(t,{'/v1/subscriptions/sub_fixture':failed});
 assert.equal((await webhookRequest('invoice.payment_failed',invoice)).status,204);
 assert.equal(calls.find(call=>call.path.endsWith('/carrier_billing_apply')).body.p_paid_until,null);
 const wrong=emulate(t,{'/v1/subscriptions/sub_fixture':{...subscription,items:{data:[{quantity:1,price:price(pro,4990)}]}}});
 assert.equal((await webhookRequest('invoice.paid',invoice)).status,503);
 assert.ok(!wrong.some(call=>call.path.endsWith('/carrier_billing_apply')));
});

test('unrelated subscriptions and previously handled events do not mutate billing',async t=>{
 const calls=emulate(t,{'/rest/v1/rpc/carrier_billing_event_target':null});
 assert.equal((await webhookRequest('customer.subscription.updated',{...subscription,metadata:{}})).status,204);
 assert.equal(calls.length,0);
 assert.equal((await webhookRequest('customer.subscription.updated',subscription)).status,204);
 assert.equal(calls.length,1);
});
