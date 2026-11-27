import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {test} from 'node:test';
import {onRequestPost as webhook} from '../functions/api/stripe-transport-webhook.js';
import {onRequest as payments} from '../functions/api/transport-payments.js';
import {processOperation} from '../functions/lib/transport-payments.mjs';

const origin='https://transport-test.invalid';
const payment='88100000-0000-0000-0000-000000000001';
const env={
 DZ_STRIPE_TEST:'true',DZ_SITE_ORIGIN:origin,STRIPE_SECRET_KEY:'sk_test_fixture',
 STRIPE_WEBHOOK_SECRET:'whsec_platform_fixture',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_connect_fixture',
 SUPABASE_URL:'https://mock-project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'
};
const sign=(body,key,time)=>'t='+time+',v1='+createHmac('sha256',key).update(time+'.'+body).digest('hex');

test('webhook verifies raw signature, timestamp, account scope and test mode',async()=>{
 const time=Math.floor(Date.now()/1000);
 const event={id:'evt_demo',type:'test.ignored',livemode:false,data:{object:{}}};
 const request=(body,signature)=>new Request(origin+'/api/stripe-transport-webhook',{
  method:'POST',headers:{'Stripe-Signature':signature},body
 });
 const body=JSON.stringify(event);
 const sig=sign(body,env.STRIPE_WEBHOOK_SECRET,time);
 assert.equal((await webhook({env,request:request(body,sig)})).status,204);
 assert.equal((await webhook({env,request:request(body+' ',sig)})).status,400);
 assert.equal((await webhook({env,request:request(body,sign(body,env.STRIPE_WEBHOOK_SECRET,time-301))})).status,400);
 const connect=JSON.stringify({...event,account:'acct_fixture'});
 assert.equal((await webhook({env,request:request(connect,sign(connect,env.STRIPE_WEBHOOK_SECRET,time))})).status,400);
 assert.equal((await webhook({env,request:request(connect,sign(connect,env.STRIPE_CONNECT_WEBHOOK_SECRET,time))})).status,204);
 const live=JSON.stringify({...event,livemode:true});
 assert.equal((await webhook({env,request:request(live,sign(live,env.STRIPE_WEBHOOK_SECRET,time))})).status,400);
 assert.equal((await webhook({env:{...env,STRIPE_SECRET_KEY:'sk_live_invalid'},request:request(body,sig)})).status,404);
});

test('signed checkout delivery reads Stripe and records the matched charge',async t=>{
 const event={id:'evt_paid',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_fixture'}}};
 const time=Math.floor(Date.now()/1000);
 const body=JSON.stringify(event);
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/checkout/sessions/')) return Response.json({
   id:'cs_fixture',amount_total:50000,currency:'eur',payment_status:'paid',
   metadata:{dz_payment:payment},payment_intent:'pi_fixture'
  });
  if(url.includes('/payment_intents/')) return Response.json({
   id:'pi_fixture',status:'succeeded',amount_received:50000,currency:'eur',livemode:false,metadata:{dz_payment:payment},
   latest_charge:{id:'ch_fixture',created:time,balance_transaction:{currency:'eur',fee:775}}
  });
  return Response.json(null);
 });
 const request=new Request(origin+'/api/stripe-transport-webhook',{
  method:'POST',body,headers:{'Stripe-Signature':sign(body,env.STRIPE_WEBHOOK_SECRET,time)}
 });
 assert.equal((await webhook({env,request})).status,204);
 assert.equal(calls.length,3);
 assert.match(calls[2].url,/\/v8_payment_event$/);
 const input=JSON.parse(calls[2].options.body);
 assert.equal(input.p_kind,'paid');
 assert.equal(input.p_data.charge,'ch_fixture');
 assert.equal(input.p_data.stripe_fee,775);
});

test('checkout uses the database amount and reuses the operation id after an interrupted write',async t=>{
 const calls=[];
 const op={id:'89200000-0000-0000-0000-000000000001',kind:'checkout',payload:{language:'de'}};
 let finishes=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/v8_claim_operation')) return Response.json({
   operation:op,payment:{id:payment,gross_minor:50000,currency:'EUR'},stripe:{}
  });
  if(url.endsWith('/checkout/sessions')) return Response.json({id:'cs_test_fixture',url:'https://checkout.stripe.com/fixture'});
  if(url.endsWith('/v8_finish_operation')) {
   const args=JSON.parse(options.body);
   if(!args.p_error && ++finishes===1) return Response.json({message:'Temporary database outage'},{status:503});
   return Response.json(args.p_error ? null : args.p_result);
  }
  throw new Error('Unexpected mock request');
 });
 const config={env,origin};
 assert.deepEqual(await processOperation(config,'checkout:'+payment),{failed:true});
 assert.equal((await processOperation(config,'checkout:'+payment)).id,'cs_test_fixture');
 const stripe=calls.filter(call=>call.url.endsWith('/checkout/sessions'));
 assert.equal(stripe.length,2);
 assert.equal(stripe[0].options.headers['Idempotency-Key'],'dz-v8-'+op.id);
 assert.equal(stripe[0].options.headers['Idempotency-Key'],stripe[1].options.headers['Idempotency-Key']);
 assert.equal(stripe[0].options.body.toString(),stripe[1].options.body.toString());
 assert.equal(stripe[0].options.body.get('line_items[0][price_data][unit_amount]'),'50000');
 assert.equal(stripe[0].options.body.get('success_url'),origin+'/de/kundenportal/');
});

test('payment API rejects cross-origin and unauthenticated requests before a provider call',async t=>{
 const upstream=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected provider call');});
 const make=site=>new Request(origin+'/api/transport-payments',{method:'POST',headers:{Origin:site},body:'{}'});
 assert.equal((await payments({env,request:make('https://other.invalid')})).status,403);
 assert.equal((await payments({env,request:make(origin)})).status,401);
 assert.equal(upstream.mock.callCount(),0);
});
