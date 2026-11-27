import {httpsOrigin} from '../../src/lib/site-origin.mjs';

export function paymentEnvironment(env) {
 const origin=httpsOrigin(env.DZ_SITE_ORIGIN);
 if(env.DZ_STRIPE_TEST!=='true' || !origin || !/^sk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || '') ||
   !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '') || !env.SUPABASE_SECRET_KEY ||
   !env.SUPABASE_PUBLISHABLE_KEY) return null;
 return {env,origin};
}

export class PaymentError extends Error {
 constructor(message,status=502) {
  super(message);
  this.status=status;
 }
}

async function jsonFetch(url,options) {
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});
 const data=await response.json();
 if(!response.ok) throw new PaymentError(data.error?.message || data.message || 'Service request failed',response.status);
 return data;
}

export function rpc(config,name,args={},token) {
 const key=token ? config.env.SUPABASE_PUBLISHABLE_KEY : config.env.SUPABASE_SECRET_KEY;
 return jsonFetch(config.env.SUPABASE_URL+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token ? {Authorization:'Bearer '+token} : {})},
  body:JSON.stringify(args)
 });
}

export function stripe(config,path,{body,account,key}={}) {
 return jsonFetch('https://api.stripe.com/v1/'+path,{
  method:body ? 'POST' : 'GET',
  headers:{
   Authorization:'Bearer '+config.env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',
   ...(body ? {'Content-Type':'application/x-www-form-urlencoded'} : {}),
   ...(account ? {'Stripe-Account':account} : {}),
   ...(key ? {'Idempotency-Key':key} : {})
  },
  body:body && new URLSearchParams(body)
 });
}

const stripeId=value=>typeof value==='string' ? value : value?.id;
const amountFor=(list,currency)=>list.find(entry=>entry.currency===currency)?.amount ?? 0;
const returnPaths={
 customer:{sl:'/portal-stranke/',en:'/en/customer-portal/',de:'/de/kundenportal/'},
 carrier:{sl:'/portal-prevozniki/',en:'/en/partner-portal/',de:'/de/partnerportal/'}
};
export function returnUrl(config,language,role='customer') {
 const paths=returnPaths[role];
 const url=new URL((Object.hasOwn(paths,language) ? paths[language] : paths.sl),config.origin);
 return url.href;
}

export async function verifyEvent(raw,header,secret,now=Date.now()) {
 if(!secret || !header) return false;
 const values=header.split(',').map(item=>item.trim());
 const timestamp=values.find(item=>item.startsWith('t='))?.slice(2);
 if(!/^\d+$/.test(timestamp || '') || Math.abs(now/1000-Number(timestamp))>300) return false;
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const item of values) {
  if(!/^v1=[0-9a-f]{64}$/.test(item)) continue;
  const signature=Uint8Array.from(item.slice(3).match(/../g),byte=>parseInt(byte,16));
  if(await crypto.subtle.verify('HMAC',key,signature,encoder.encode(timestamp+'.'+raw))) return true;
 }
 return false;
}

export async function readBody(request,maxBytes) {
 if(!request.body) throw new PaymentError('Missing body',400);
 const reader=request.body.getReader();
 const decoder=new TextDecoder();
 let length=0, text='';
 for(;;) {
  const {done,value}=await reader.read();
  if(done) return text+decoder.decode();
  length+=value.byteLength;
  if(length>maxBytes) {
   await reader.cancel();
   throw new PaymentError('Request too large',413);
  }
  text+=decoder.decode(value,{stream:true});
 }
}

async function checkoutEvent(config,session,eventId) {
 const id=session.metadata?.dz_payment;
 if(!id) return;
 const details={session:session.id,amount:session.amount_total,currency:session.currency};
 let kind;
 if(session.payment_status==='paid') {
  const intent=await stripe(config,'payment_intents/'+stripeId(session.payment_intent)+'?expand[]=latest_charge.balance_transaction');
  const charge=intent.latest_charge;
  if(intent.livemode || intent.status!=='succeeded' || !charge?.id || intent.metadata?.dz_payment!==id ||
    intent.amount_received!==session.amount_total || intent.currency!==session.currency) throw new PaymentError('Payment mismatch');
  Object.assign(details,{intent:intent.id,charge:charge.id,receipt:charge.receipt_url,captured_at:charge.created,
   stripe_fee:charge.balance_transaction?.currency==='eur' ? charge.balance_transaction.fee : null});
  kind='paid';
 } else if(session.status==='expired') kind='expired';
 else return;
 await rpc(config,'v8_payment_event',{p_event:eventId,p_payment:id,p_kind:kind,p_data:details});
}

async function refundEvent(config,id,charge,eventId) {
 const amounts=await stripe(config,'refunds?charge='+encodeURIComponent(charge)+'&limit=100');
 if(amounts.has_more) throw new PaymentError('Refund reconciliation required');
 const refunded=amounts.data.filter(item=>item.status==='succeeded').reduce((sum,item)=>sum+item.amount,0);
 await rpc(config,'v8_payment_event',{p_event:eventId,p_payment:id,p_kind:'refund',p_data:{charge,refunded}});
}

async function retryUnrecordedCharge(config,intentId) {
 const intent=await stripe(config,'payment_intents/'+intentId);
 if(intent.metadata?.dz_payment) throw new PaymentError('Checkout confirmation must be reconciled first');
}

export async function applyEvent(config,event) {
 if(event.livemode!==false) throw new PaymentError('Only Stripe test events are accepted',400);
 const object=event.data.object;
 if(event.account) {
  if(event.type.startsWith('payout.')) {
   const payout=await stripe(config,'payouts/'+object.id,{account:event.account});
   await rpc(config,'v8_connect_event',{p_account:event.account,p_event:event.id,p_payout:payout});
  }
  return;
 }
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type)) {
  const session=await stripe(config,'checkout/sessions/'+object.id);
  await checkoutEvent(config,session,event.id);
 } else if(event.type==='payment_intent.payment_failed' && object.metadata?.dz_payment) {
  await rpc(config,'v8_card_failure',{p_event:event.id,p_payment:object.metadata.dz_payment,p_amount:object.amount,p_currency:object.currency});
 } else if(event.type==='transfer.created' && object.metadata?.dz_payment) {
  const transfer=await stripe(config,'transfers/'+object.id);
  await rpc(config,'v8_transfer_event',{p_event:event.id,p_payment:object.metadata.dz_payment,p_transfer:transfer});
 } else if(event.type.startsWith('charge.dispute.')) {
  const id=await rpc(config,'v8_payment_reference',{p_intent:stripeId(object.payment_intent) ?? null,p_charge:stripeId(object.charge) ?? null});
  if(!id && object.payment_intent) await retryUnrecordedCharge(config,stripeId(object.payment_intent));
  if(id) {
   const dispute=await stripe(config,'disputes/'+object.id);
   await rpc(config,'v8_payment_event',{p_event:event.id,p_payment:id,p_kind:'card_dispute',
    p_data:{id:dispute.id,status:dispute.status,amount:dispute.amount,reason:dispute.reason}});
  }
 } else if(event.type.startsWith('refund.') || event.type==='charge.refunded') {
  const charge=event.type==='charge.refunded' ? object.id : stripeId(object.charge);
  const id=await rpc(config,'v8_payment_reference',{p_intent:stripeId(object.payment_intent) ?? null,p_charge:charge ?? null});
  if(!id && object.payment_intent) await retryUnrecordedCharge(config,stripeId(object.payment_intent));
  if(id && event.type.startsWith('refund.')) {
   const refund=await stripe(config,'refunds/'+object.id);
   if(['failed','canceled'].includes(refund.status)) {
    await rpc(config,'v8_payment_event',{p_event:event.id,p_payment:id,p_kind:'refund_failed',p_data:{charge}});
    return;
   }
  }
  if(id) await refundEvent(config,id,charge,event.id);
 }
}

class PaymentPreflightError extends PaymentError {}

async function runOperation(config,bundle) {
 const {operation:op,payment,stripe:ids,connect}=bundle;
 const account=connect?.account_id;
 const key='dz-v8-'+op.id;
 const post=(path,body,connected)=>stripe(config,path,{body,account:connected,key});
 switch(op.kind) {
  case 'checkout': {
   // Let the database own the reservation deadline. The worker explicitly expires Stripe's session.
   const url=returnUrl(config,op.payload.language || 'sl');
   const context={'metadata[dz_payment]':payment.id,'payment_intent_data[metadata][dz_payment]':payment.id};
   const session=await post('checkout/sessions',{
    mode:'payment','payment_method_types[0]':'card',success_url:url,cancel_url:url,
    'line_items[0][quantity]':'1','line_items[0][price_data][currency]':payment.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]':String(payment.gross_minor),
    'line_items[0][price_data][product_data][name]':'DZ Transport',
    'payment_intent_data[transfer_group]':'dz_'+payment.id,...context
   });
   return {id:session.id,url:session.url};
  }
  case 'expire': {
   let session=await stripe(config,'checkout/sessions/'+ids.session_id);
   if(session.status==='open') {
    try {
     session=await post('checkout/sessions/'+session.id+'/expire',{});
    } catch(error) {
     if(!(error instanceof PaymentError) || error.status!==400) throw error;
     session=await stripe(config,'checkout/sessions/'+session.id);
     if(session.status==='open') throw error;
    }
   }
   await checkoutEvent(config,session,'reconcile:'+session.id+':'+session.status);
   return {id:session.id,status:session.status};
  }
  case 'refund': {
   const refund=await post('refunds',{charge:ids.charge_id,amount:String(op.payload.amount),'metadata[dz_operation]':op.id});
   if(refund.status==='succeeded') await refundEvent(config,payment.id,ids.charge_id,'reconcile:'+refund.id);
   if(['failed','canceled'].includes(refund.status)) throw new PaymentError('Stripe refund '+refund.status);
   return {id:refund.id,status:refund.status};
  }
  case 'transfer': {
   if(!ids.charge_id) throw new PaymentError('Missing charge');
   const carrier=await stripe(config,'accounts/'+account);
   if(carrier.capabilities?.transfers!=='active') throw new PaymentPreflightError('Transfer capability unavailable');
   const amount=op.payload.amount;
   if(!Number.isSafeInteger(amount) || amount<0) throw new PaymentError('Invalid net amount');
   if(amount===0) return {amount};
   const transfer=await post('transfers',{amount:String(amount),currency:payment.currency.toLowerCase(),
    destination:account,source_transaction:ids.charge_id,transfer_group:'dz_'+payment.id,'metadata[dz_payment]':payment.id});
   return {id:transfer.id,amount:transfer.amount};
  }
  case 'reversal': {
   const reversal=await post('transfers/'+ids.transfer_id+'/reversals',{
    amount:String(op.payload.amount),'metadata[dz_operation]':op.id
   });
   return {id:reversal.id,amount:reversal.amount};
  }
  case 'account': {
   const result=await post('accounts',{
    type:'express',country:'SI','capabilities[transfers][requested]':'true',
    'settings[payouts][schedule][interval]':'weekly','settings[payouts][schedule][weekly_anchor]':'monday',
    'metadata[dz_partner]':op.partner_id
   });
   return {id:result.id};
  }
  case 'schedule': {
   const body={'settings[payouts][schedule][interval]':op.payload.schedule};
   if(op.payload.schedule==='weekly') body['settings[payouts][schedule][weekly_anchor]']='monday';
   if(op.payload.schedule==='monthly') body['settings[payouts][schedule][monthly_anchor]']='1';
   if(op.payload.schedule==='manual') {
    const balance=await stripe(config,'balance',{account});
    const settings=await stripe(config,'accounts/'+account);
    // Require an empty account on entry to manual mode to establish the holding clock.
    if(settings.settings?.payouts?.schedule?.interval!=='manual' &&
      [...balance.available,...balance.pending].some(item=>item.amount!==0)) throw new PaymentError('Clear the balance before switching to manual payouts',422);
   }
   const result=await post('accounts/'+account,body);
   return {id:result.id};
  }
  case 'payout': {
   if(!op.first_attempt_at) {
    const balance=await stripe(config,'balance',{account});
    if(amountFor(balance.available,'eur')<op.payload.amount) throw new PaymentPreflightError('Insufficient available Stripe funds',422);
   }
   const payout=await post('payouts',{currency:'eur',amount:String(op.payload.amount),'metadata[dz_operation]':op.id},account);
   return {id:payout.id,status:payout.status};
  }
  default: throw new PaymentError('Unsupported operation');
 }
}

export async function processOperation(config,operationKey=null) {
 const bundle=await rpc(config,'v8_claim_operation',{p_key:operationKey});
 if(!bundle?.operation) return bundle;
 const id=bundle.operation.id;
 try {
  const result=await runOperation(config,bundle);
  return await rpc(config,'v8_finish_operation',{p_id:id,p_result:result});
 } catch(error) {
  await rpc(config,'v8_finish_operation',{p_id:id,p_result:{},p_error:error.message,
   p_preflight:error instanceof PaymentPreflightError && !bundle.operation.first_attempt_at});
  return {failed:true};
 }
}

export async function connectStatus(config,account,schedule) {
 if(!account) return {schedule,connected:false};
 const [profile,balance,payouts]=await Promise.all([
  stripe(config,'accounts/'+account),stripe(config,'balance',{account}),stripe(config,'payouts?limit=20',{account})
 ]);
 return {
  connected:true,schedule,transfers:profile.capabilities?.transfers==='active',payouts:profile.payouts_enabled,
  requirements:profile.requirements?.currently_due || [],disabledReason:profile.requirements?.disabled_reason,
  available:amountFor(balance.available,'eur'),pending:amountFor(balance.pending,'eur'),
  history:payouts.data.map(payout=>({id:payout.id,amount:payout.amount,currency:payout.currency,status:payout.status,
   date:payout.created,arrival:payout.arrival_date,failure:payout.failure_message}))
 };
}

export async function onboarding(config,account,language) {
 const url=returnUrl(config,language,'carrier');
 return stripe(config,'account_links',{body:{account,refresh_url:url,return_url:url,type:'account_onboarding'}});
}
