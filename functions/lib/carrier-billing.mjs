import {rpc} from './transport-payments.mjs';

export const billingOrigin='https://dz-transport.eu';
export const billingVersion='2025-01-27.acacia';
const scope='dz_transport_carrier_v1';
const plans={
 basic:{amount:1900,id:'DZ_STRIPE_BILLING_BASIC_PRICE_ID',expected:'price_1UgoRjLP0d1wngzHgpVmIeco'},
 pro:{amount:4990,id:'DZ_STRIPE_BILLING_PRO_PRICE_ID',expected:'price_1UgoTHLP0d1wngzHEPAhJuL7'}
};
const paths={sl:'/portal-prevozniki/',en:'/en/partner-portal/',de:'/de/partnerportal/'};
const isUUID=value=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const stripeId=value=>typeof value==='string' ? value : value?.id;
const hasID=(value,prefix)=>typeof value==='string' && value.startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(value);
const iso=value=>Number.isSafeInteger(value) && value>0 ? new Date(value*1000).toISOString() : null;
const encode=encodeURIComponent;
const part=value=>Object.hasOwn(paths,value) ? value : 'sl';
const returnURL=language=>billingOrigin+paths[part(language)];
const eventTypes=new Set(['checkout.session.completed','invoice.paid','invoice.payment_failed',
 'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted']);

export class BillingError extends Error {
 constructor(message,status=502) {
  super(message);
  this.status=status;
 }
}
export const billingReply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function billingConfig(env) {
 return {env,account:env.DZ_STRIPE_BILLING_ACCOUNT_ID,portal:env.DZ_STRIPE_BILLING_PORTAL_ID,
  tax:env.DZ_STRIPE_BILLING_TAX_BEHAVIOR,production:env.DZ_SITE_MODE==='production',
  purchaseSwitch:env.DZ_STRIPE_BILLING_PURCHASE_ENABLED==='true',
  prices:Object.fromEntries(Object.entries(plans).map(([plan,value])=>[plan,env[value.id]]))};
}
export const hasDatabase=env=>/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '')
 && Boolean(env.SUPABASE_SECRET_KEY && env.SUPABASE_PUBLISHABLE_KEY);
const hasKey=env=>/^(sk|rk)_live_[A-Za-z0-9]+$/.test(env.DZ_STRIPE_BILLING_API_KEY || '');
export const hasSigningSecret=env=>/^whsec_[A-Za-z0-9]+$/.test(env.DZ_STRIPE_BILLING_WEBHOOK_SECRET || '');

async function stripe(config,path,{body,key}={}) {
 if(!hasKey(config.env)) throw new BillingError('Missing or invalid DZ_STRIPE_BILLING_API_KEY',503);
 const response=await fetch('https://api.stripe.com/v1/'+path,{
  method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Bearer '+config.env.DZ_STRIPE_BILLING_API_KEY,'Stripe-Version':billingVersion,
   ...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},
  body:body && new URLSearchParams(body)
 });
 if(!response.ok) throw new BillingError(path.split('?')[0]+' returned Stripe HTTP '+response.status,502);
 return response.json();
}

async function checkAccount(config) {
 if(!hasID(config.account,'acct_')) throw new BillingError('Set DZ_STRIPE_BILLING_ACCOUNT_ID to the intended Live account',503);
 const account=await stripe(config,'account');
 if(account.id!==config.account) throw new BillingError('Stripe account expected '+config.account+', received '+account.id,503);
 return account;
}

function errorsForPrice(config,plan,price,taxDefaults) {
 const expected={id:config.prices[plan],livemode:true,active:true,currency:'eur',type:'recurring',unit_amount:plans[plan].amount,
  billing_scheme:'per_unit',tax_behavior:config.tax,'recurring.interval':'month','recurring.interval_count':1,
  'recurring.usage_type':'licensed'};
 return Object.entries(expected).flatMap(([field,value])=>{
  let actual=field.split('.').reduce((o,key)=>o?.[key],price);
  if(field==='tax_behavior' && actual==='unspecified') actual=taxDefaults ?? actual;
  return actual===value ? [] : [plan+' ('+config.prices[plan]+') '+field+' expected '+JSON.stringify(value)+', received '+(JSON.stringify(actual) ?? 'missing')];
 });
}

async function verifyPortal(config) {
 if(!hasID(config.portal,'bpc_')) throw new BillingError('Set DZ_STRIPE_BILLING_PORTAL_ID',503);
 const portal=await stripe(config,'billing_portal/configurations/'+config.portal);
 const feature=portal.features;
 const valid=portal.id===config.portal && portal.livemode===true && portal.active===true && portal.is_default===false
  && feature?.invoice_history?.enabled===true && feature?.payment_method_update?.enabled===true
  && feature?.subscription_cancel?.enabled===true && feature?.subscription_cancel?.mode==='at_period_end'
  && feature?.subscription_update?.enabled===false
  && new URL(portal.default_return_url || 'https://invalid.invalid').origin===billingOrigin;
 if(!valid) throw new BillingError('Billing Portal must be Live, active, non-default, return to dz-transport.eu and allow invoices, payment methods and cancellation at period end with plan changes disabled',503);
}

export async function verifyBilling(config) {
 const errors=[];
 if(!config.production) errors.push('Billing purchases require DZ_SITE_MODE=production');
 if(!hasSigningSecret(config.env)) errors.push('Set DZ_STRIPE_BILLING_WEBHOOK_SECRET to the Billing Live destination secret');
 if(!['inclusive','exclusive'].includes(config.tax)) errors.push('Set DZ_STRIPE_BILLING_TAX_BEHAVIOR to the verified inclusive or exclusive setting');
 try {await checkAccount(config);}
 catch(error) {return {errors:[...errors,error instanceof BillingError?error.message:'Stripe account check unavailable']};}
 const checks=Object.keys(plans).map(async plan=>{
  const id=config.prices[plan];
  if(id!==plans[plan].expected) {
   errors.push(plans[plan].id+' expected '+plans[plan].expected+', received '+(hasID(id,'price_')?id:'missing or invalid Price ID'));
   return null;
  }
  return stripe(config,'prices/'+id);
 });
 const results=await Promise.allSettled([stripe(config,'tax/settings'),verifyPortal(config),...checks]);
 const [taxSettings]=results;
 if(taxSettings.status==='fulfilled' && (taxSettings.value.livemode!==true || taxSettings.value.status!=='active'))
  errors.push('Stripe Tax settings must be active in Live');
 const taxDefaults=taxSettings.status==='fulfilled' ? taxSettings.value.defaults?.tax_behavior : null;
 for(const [index,result] of results.entries()) {
  if(result.status==='rejected') errors.push(result.reason instanceof BillingError ? result.reason.message : 'Stripe configuration check unavailable');
  else if(index>=2 && result.value) errors.push(...errorsForPrice(config,Object.keys(plans)[index-2],result.value,taxDefaults));
 }
 return {errors};
}

function meta(carrier,attempt) {
 return {dz_billing:scope,dz_carrier:carrier,...(attempt?{dz_billing_attempt:attempt}:{})};
}
function formMeta(prefix,metadata) {
 return Object.fromEntries(Object.entries(metadata).map(([key,value])=>[prefix+'['+key+']',value]));
}
function owns(object,carrier,attempt) {
 const info=object.metadata;
 return object.livemode===true && info?.dz_billing===scope && info.dz_carrier===carrier
  && (!attempt || info.dz_billing_attempt===attempt);
}

async function ensureCustomer(config,account) {
 if(account.customer_id) return account.customer_id;
 if(Date.now()-Date.parse(account.created_at)>=23*3600000) {
  // The idempotency retention window has passed. Find the original mapping, never recreate blindly.
  const query="metadata['dz_billing']:'"+scope+"' AND metadata['dz_carrier']:'"+account.carrier_id+"'";
  const matches=await stripe(config,'customers/search?limit=2&query='+encode(query));
  if(matches.has_more || matches.data?.length!==1) throw new BillingError('Customer reconciliation required',409);
  const customer=matches.data[0];
  if(!owns(customer,account.carrier_id)) throw new BillingError('Stripe customer mismatch');
  await rpc(config,'carrier_billing_bind',{p_account:config.account,p_carrier:account.carrier_id,p_customer:customer.id});
  return customer.id;
 }
 const customer=await stripe(config,'customers',{
  body:formMeta('metadata',meta(account.carrier_id)),key:'dz-carrier-customer:'+account.customer_request
 });
 if(!owns(customer,account.carrier_id) || !hasID(customer.id,'cus_')) throw new BillingError('Stripe customer mismatch');
 await rpc(config,'carrier_billing_bind',{p_account:config.account,p_carrier:account.carrier_id,p_customer:customer.id});
 return customer.id;
}

async function priorSession(config,account,customer,findUnrecorded) {
 if(account.session_id) return stripe(config,'checkout/sessions/'+account.session_id);
 if(!findUnrecorded || !account.attempt) return null;
 const list=await stripe(config,'checkout/sessions?customer='+encode(customer)+'&limit=100&created[gte]='+Math.floor(Date.parse(account.checkout_until)/1000-7500));
 if(list.has_more) throw new BillingError('Checkout reconciliation required',409);
 const matches=list.data.filter(session=>session.metadata?.dz_billing_attempt===account.attempt);
 if(matches.length>1) throw new BillingError('Checkout reconciliation required',409);
 return matches[0] ?? null;
}

function redirect(url,host) {
 let target;
 try {target=new URL(url);} catch {throw new BillingError('Missing Stripe URL');}
 if(target.protocol!=='https:' || target.host!==host || target.username || target.password)
  throw new BillingError('Unexpected Stripe URL');
 return target.href;
}

export async function startBillingCheckout(config,carrier,plan,language) {
 if(!config.production || !config.purchaseSwitch) throw new BillingError('Purchase disabled',503);
 if(!Object.hasOwn(plans,plan)) throw new BillingError('Invalid plan',400);
 const result=await verifyBilling(config);
 if(result.errors.length) throw new BillingError('Billing verification failed',503);
 const account=await rpc(config,'carrier_billing_account',{p_carrier:carrier,p_account:config.account,p_create:true});
 const customer=await ensureCustomer(config,account);
 const subscriptions=await stripe(config,'subscriptions?customer='+encode(customer)+'&status=all&limit=100');
 if(subscriptions.has_more || subscriptions.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))
  throw new BillingError('Manage the existing subscription',409);
 let previous=null;
 if(account.attempt && Date.parse(account.checkout_until)<=Date.now()) {
  const old=await priorSession(config,account,customer,true);
  const closedSubscription=old?.status==='complete' && account.subscription_id
   && stripeId(old.subscription)===account.subscription_id
   && ['canceled','incomplete_expired'].includes(account.state);
  if(old && (!owns(old,carrier,account.attempt) || stripeId(old.customer)!==customer || (old.status!=='expired' && !closedSubscription)))
   throw new BillingError('Prior Checkout reconciliation required',409);
  previous=account.attempt;
 }
 const reservation=await rpc(config,'carrier_billing_reserve',{
  p_carrier:carrier,p_account:config.account,p_plan:plan,p_language:part(language),p_previous:previous
 });
 if(reservation.blocked) throw new BillingError('A subscription or Checkout is already pending',409);
 const expires=Math.floor(Date.parse(reservation.checkout_until)/1000);
 const tooLate=expires-Math.floor(Date.now()/1000)<1860;
 let session=await priorSession(config,reservation,customer,tooLate);
 if(!session && tooLate) throw new BillingError('Prior Checkout reconciliation required',409);
 if(!session) {
  const language=reservation.checkout_language;
  const url=returnURL(language);
  const metadata=meta(carrier,reservation.attempt);
  session=await stripe(config,'checkout/sessions',{key:'dz-carrier-checkout:'+reservation.attempt,body:{
   mode:'subscription',customer,client_reference_id:carrier,locale:language==='sl'?'auto':language,
   'payment_method_types[0]':'card','line_items[0][price]':config.prices[plan],'line_items[0][quantity]':'1',
   'automatic_tax[enabled]':'true','tax_id_collection[enabled]':'true',billing_address_collection:'required',
   'customer_update[address]':'auto','customer_update[name]':'auto',
   success_url:url+'?billing=processing',cancel_url:url,expires_at:String(expires),
   ...formMeta('metadata',metadata),...formMeta('subscription_data[metadata]',metadata)
  }});
 }
 if(!owns(session,carrier,reservation.attempt) || stripeId(session.customer)!==customer
  || session.mode!=='subscription' || !hasID(session.id,'cs_live_')) throw new BillingError('Checkout ownership mismatch');
 await rpc(config,'carrier_billing_record_session',{p_customer:customer,p_attempt:reservation.attempt,p_session:session.id});
 if(session.status!=='open') throw new BillingError('Checkout is no longer open',409);
 return redirect(session.url,'checkout.stripe.com');
}

export async function openBillingPortal(config,carrier,language) {
 await checkAccount(config);
 await verifyPortal(config);
 const account=await rpc(config,'carrier_billing_account',{p_carrier:carrier,p_account:config.account});
 if(!account?.customer_id) throw new BillingError('No billing account',409);
 const customer=await stripe(config,'customers/'+account.customer_id);
 if(!owns(customer,carrier)) throw new BillingError('Stripe customer mismatch');
 const session=await stripe(config,'billing_portal/sessions',{body:{
  customer:account.customer_id,configuration:config.portal,return_url:returnURL(language),locale:part(language)
 }});
 if(session.livemode!==true || stripeId(session.customer)!==account.customer_id || stripeId(session.configuration)!==config.portal) throw new BillingError('Billing Portal ownership mismatch');
 return redirect(session.url,'billing.stripe.com');
}

function paidPeriod(invoice,subscription,price) {
 if(!invoice || invoice.livemode!==true || invoice.status!=='paid' || invoice.paid_out_of_band===true
  || (!Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid<=0) || invoice.currency!=='eur' || stripeId(invoice.customer)!==stripeId(subscription.customer)
  || stripeId(invoice.subscription)!==subscription.id || !['subscription_create','subscription_cycle'].includes(invoice.billing_reason)) return null;
 if(invoice.lines?.has_more) throw new BillingError('Invoice requires reconciliation');
 const line=invoice.lines?.data?.find(item=>item.type==='subscription' && !item.proration &&
  stripeId(item.price)===price && item.quantity===1 && item.amount>0 && item.period?.end>item.period?.start);
 if(!line || line.period.end>subscription.current_period_end) return null;
 return iso(line.period.end);
}

export async function applyBillingEvent(config,event) {
 if(!eventTypes.has(event.type) || !hasID(event.id,'evt_')) return;
 const object=event.data?.object;
 if(!object) throw new BillingError('Missing Stripe data');
 const subscriptionId=event.type.startsWith('customer.subscription.')?object.id:stripeId(object.subscription);
 if(!hasID(subscriptionId,'sub_')) return;
 // Invoice snapshots can omit subscription metadata. Retrieve the subscription, then use the
 // database revision to protect the subsequent authoritative Stripe read against concurrent writes.
 if((event.type.startsWith('customer.subscription.') || event.type==='checkout.session.completed') && object.metadata?.dz_billing!==scope) return;
 const hint=event.type.startsWith('customer.subscription.') || event.type==='checkout.session.completed'
  ? object : await stripe(config,'subscriptions/'+subscriptionId);
 const attempt=hint.metadata?.dz_billing_attempt;
 const carrier=hint.metadata?.dz_carrier;
 const customer=stripeId(hint.customer);
 if(hint.metadata?.dz_billing!==scope || !isUUID(attempt) || !isUUID(carrier) || !hasID(customer,'cus_')) return;
 const args={p_account:config.account,p_customer:customer,p_attempt:attempt,p_event:event.id};
 const target=await rpc(config,'carrier_billing_event_target',args);
 if(!target || target.carrier_id!==carrier) return;
 await checkAccount(config);
 const subscription=await stripe(config,'subscriptions/'+subscriptionId+'?expand[]=latest_invoice');
 if(subscription.id!==subscriptionId || !owns(subscription,carrier,attempt) || stripeId(subscription.customer)!==customer)
  throw new BillingError('Subscription ownership mismatch');
 if(event.type==='checkout.session.completed' && (object.mode!=='subscription' || object.status!=='complete' || (target.session_id && object.id!==target.session_id)))
  throw new BillingError('Completed Checkout mismatch');
 const price=config.prices[target.checkout_plan];
 const items=subscription.items;
 const item=items?.data?.[0];
 if(!price || price!==plans[target.checkout_plan]?.expected || items?.has_more || items?.data?.length!==1 || item.quantity!==1
  || item.price?.livemode!==true || item.price?.id!==price || item.price.currency!=='eur'
  || item.price.unit_amount!==plans[target.checkout_plan]?.amount || item.price.recurring?.interval!=='month'
  || item.price.recurring?.interval_count!==1) throw new BillingError('Subscription price mismatch');
 let until=paidPeriod(subscription.latest_invoice,subscription,price);
 if(event.type==='invoice.paid' && hasID(object.id,'in_') && stripeId(subscription.latest_invoice)!==object.id) {
  const historical=paidPeriod(await stripe(config,'invoices/'+object.id),subscription,price);
  if(historical && (!until || historical>until)) until=historical;
 }
 await rpc(config,'carrier_billing_apply',{...args,p_revision:target.revision,p_subscription:subscription.id,
  p_plan:target.checkout_plan,p_state:subscription.status,p_period_end:iso(subscription.current_period_end),
  p_cancel_at_end:subscription.cancel_at_period_end===true,p_paid_until:until,p_ended_at:iso(subscription.ended_at)});
}

export async function signedBillingEvent(request,secret,now=Date.now()) {
 const header=request.headers.get('Stripe-Signature');
 if(!header || !request.body) return null;
 const fields=header.split(',').map(field=>field.trim());
 const timestamp=fields.find(field=>/^t=\d+$/.test(field))?.slice(2);
 if(!timestamp || Math.abs(now/1000-Number(timestamp))>300) return null;
 const encoder=new TextEncoder();
 const prefix=encoder.encode(timestamp+'.');
 const chunks=[prefix];
 let size=prefix.length;
 const reader=request.body.getReader();
 for(;;) {
  const {done,value}=await reader.read();
  if(done) break;
  size+=value.byteLength;
  if(size>1024*1024) {await reader.cancel();return null;}
  chunks.push(value);
 }
 const payload=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks) {payload.set(chunk,offset);offset+=chunk.length;}
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const field of fields) {
  if(!/^v1=[0-9a-f]{64}$/.test(field)) continue;
  const signature=Uint8Array.from(field.slice(3).match(/../g),byte=>parseInt(byte,16));
  if(await crypto.subtle.verify('HMAC',key,signature,payload)) {
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload.subarray(prefix.length)));
  }
 }
 return null;
}

export {rpc};
