import {applyBillingEvent,billingConfig,billingOrigin,billingVersion,hasDatabase,hasSigningSecret,
 signedBillingEvent} from '../../lib/carrier-billing.mjs';

export async function onRequestPost({request,env}) {
 if(new URL(request.url).origin!==billingOrigin || !hasDatabase(env)) return new Response(null,{status:404});
 if(!hasSigningSecret(env)) return new Response(null,{status:503});
 let event;
 try {event=await signedBillingEvent(request,env.DZ_STRIPE_BILLING_WEBHOOK_SECRET);}
 catch {return new Response(null,{status:400});}
 if(!event || event.livemode!==true || event.account || event.context || event.api_version!==billingVersion)
  return new Response(null,{status:400});
 try {
  await applyBillingEvent(billingConfig(env),event);
  return new Response(null,{status:204});
 } catch {
  return new Response(null,{status:503});
 }
}
