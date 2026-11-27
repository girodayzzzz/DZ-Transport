import {applyEvent,paymentEnvironment,readBody,verifyEvent} from '../lib/transport-payments.mjs';

export async function onRequestPost({request,env}) {
 const config=paymentEnvironment(env);
 if(!config || new URL(request.url).origin!==config.origin) return new Response(null,{status:404});
 let raw,event;
 try {
  raw=await readBody(request,262144);
  event=JSON.parse(raw);
  const secret=event.account ? env.STRIPE_CONNECT_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET;
  if(event.livemode!==false || !await verifyEvent(raw,request.headers.get('Stripe-Signature'),secret)) {
   return new Response(null,{status:400});
  }
 } catch {
  return new Response(null,{status:400});
 }
 try {
  await applyEvent(config,event);
  return new Response(null,{status:204});
 } catch {
  return new Response(null,{status:503});
 }
}
