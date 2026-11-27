import {connectStatus,onboarding,paymentEnvironment,PaymentError,processOperation,readBody,rpc} from '../lib/transport-payments.mjs';

const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function onRequest({request,env}) {
 const config=paymentEnvironment(env);
 if(!config || new URL(request.url).origin!==config.origin) return reply(404,{error:'Unavailable'});
 if(request.method!=='POST') return reply(405,{error:'Method unavailable'});
 if(request.headers.get('Origin')!==config.origin) return reply(403,{error:'Origin unavailable'});
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token) return reply(401,{error:'Sign in required'});
 try {
  const input=JSON.parse(await readBody(request,32768));
  if(input.action==='checkout') {
   if(!uuid.test(input.request || '') || !['quote','quick_deal'].includes(input.kind) ||
    (input.kind==='quote' && !uuid.test(input.target || ''))) throw new PaymentError('Invalid checkout request',400);
   const id=await rpc(config,'v8_begin_checkout',{
    p_kind:input.kind,p_target:input.target || null,p_request:input.request,
    p_input:{...input.details,language:input.language}
   },token);
   const session=await processOperation(config,'checkout:'+id);
   if(!session?.url) return reply(202,{payment:id});
   return reply(200,{payment:id,url:session.url});
  }
  if(!['status','connect','schedule','payout'].includes(input.action)) throw new PaymentError('Invalid action',400);
  const connectArgs={p_schedule:input.schedule || null,p_request:input.request || null,p_amount:input.amount ?? null};
  if(input.action==='payout') {
   const carrier=await rpc(config,'v8_connect_action',{p_action:'status',...connectArgs},token);
   const status=await connectStatus(config,carrier.account,carrier.schedule);
   if(!status.payouts || status.schedule!=='manual' || !Number.isSafeInteger(input.amount) ||
    input.amount<1 || input.amount>status.available) return reply(422,{error:'Amount unavailable for payout'});
  }
  let carrier=await rpc(config,'v8_connect_action',{p_action:input.action,...connectArgs},token);
  if(carrier.operation) {
   const operation=await processOperation(config,carrier.operation);
   if(!operation || operation.failed) return reply(202,{pending:true});
   carrier=await rpc(config,'v8_connect_action',{p_action:'status',...connectArgs},token);
  }
  if(input.action==='connect' && carrier.account) {
   const link=await onboarding(config,carrier.account,input.language);
   return reply(200,{url:link.url});
  }
  return reply(200,await connectStatus(config,carrier.account,carrier.schedule));
 } catch(error) {
  if(error instanceof SyntaxError) return reply(400,{error:'Invalid request'});
  const status=error instanceof PaymentError && error.status>=400 && error.status<500 ? error.status : 502;
  return reply(status,{error:status===502 ? 'Payment service unavailable' : 'Payment action unavailable'});
 }
}
