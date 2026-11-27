import {paymentEnvironment,processOperation,rpc} from '../lib/transport-payments.mjs';

export async function onRequestPost({request,env}) {
 const config=paymentEnvironment(env);
 if(!config || new URL(request.url).origin!==config.origin || !env.DZ_STRIPE_JOB_TOKEN ||
  env.DZ_STRIPE_JOB_TOKEN.length<32 || request.headers.get('Authorization')!=='Bearer '+env.DZ_STRIPE_JOB_TOKEN) {
  return new Response(null,{status:404});
 }
 try {
  await rpc(config,'v8_tick');
  for(let index=0;index<10;index++) {
   if(!await processOperation(config)) break;
  }
  return new Response(null,{status:204});
 } catch {
  return new Response(null,{status:503});
 }
}
