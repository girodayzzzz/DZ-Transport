import {billingConfig,billingOrigin,billingReply,BillingError,hasDatabase,openBillingPortal,rpc,
 startBillingCheckout,verifyBilling} from '../../lib/carrier-billing.mjs';
import {readBody} from '../../lib/transport-payments.mjs';

export async function onRequestPost({request,env}) {
 if(new URL(request.url).origin!==billingOrigin || !hasDatabase(env)) return billingReply(404,{error:'Unavailable'});
 if(request.headers.get('Origin')!==billingOrigin) return billingReply(403,{error:'Origin unavailable'});
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token) return billingReply(401,{error:'Sign in required'});
 const config=billingConfig(env);
 try {
  const input=JSON.parse(await readBody(request,4096));
  const actor=await rpc(config,'carrier_billing_actor',{},token);
  if(input.action==='verify' && actor?.admin) {
   const result=await verifyBilling(config);
   return billingReply(200,{verified:result.errors.length===0,purchaseSwitch:config.purchaseSwitch,...result});
  }
  if(!actor?.carrier) return billingReply(403,{error:'Approved carrier required'});
  if(input.action==='status') {
   const state=await rpc(config,'my_carrier_billing',{},token);
   const verification=config.production && config.purchaseSwitch ? await verifyBilling(config) : null;
   const enabled=verification?.errors.length===0;
   return billingReply(200,{state,purchase:enabled,tax:enabled?config.tax:null,portal:Boolean(state?.has_customer && config.portal)});
  }
  if(input.action==='checkout') return billingReply(200,{url:await startBillingCheckout(config,actor.id,input.plan,input.language)});
  if(input.action==='portal') return billingReply(200,{url:await openBillingPortal(config,actor.id,input.language)});
  return billingReply(400,{error:'Invalid action'});
 } catch(error) {
  if(error instanceof SyntaxError) return billingReply(400,{error:'Invalid request'});
  if(error?.status===401 || error?.status===403) return billingReply(error.status,{error:'Access unavailable'});
  const status=error instanceof BillingError ? error.status : 503;
  return billingReply(status,{error:status===409?'Manage or resume the existing subscription':'Billing unavailable'});
 }
}
