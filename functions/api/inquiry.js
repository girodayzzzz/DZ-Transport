import {validateGuestInquiry} from '../../src/lib/guest-intake.mjs';

import {httpsOrigin} from '../../src/lib/site-origin.mjs';
const maxBytes=32768;
const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

async function readJson(request) {
 if(!request.body) throw new Error('Missing body');
 const reader=request.body.getReader();
 const decoder=new TextDecoder();
 let bytes=0;
 let raw='';
 for (;;) {
  const {value,done}=await reader.read();
  if (done) break;
  bytes+=value.byteLength;
  if(bytes>maxBytes) {await reader.cancel();throw new Error('Too large');}
  raw+=decoder.decode(value,{stream:true});
 }
 return JSON.parse(raw+decoder.decode());
}

async function networkKey(secret,ip) {
 const encode=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',key,encode.encode(ip));
 return Array.from(new Uint8Array(signed),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function onRequest({request,env}) {
 const origin = httpsOrigin(env.DZ_SITE_ORIGIN);
 if (!origin || env.DZ_GUEST_INTAKE!=='true' || new URL(request.url).origin!==origin) return reply(404,{ok:false});
 if (request.method!=='POST') return reply(405,{ok:false});
 if (request.headers.get('Origin')!==origin || request.headers.get('Sec-Fetch-Site')==='cross-site') return reply(403,{ok:false});
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return reply(415,{ok:false});
 const ip=request.headers.get('CF-Connecting-IP');
 if (!ip || !env.TURNSTILE_SECRET || !env.DZ_IP_HASH_KEY || env.DZ_IP_HASH_KEY.length<32 ||
     !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '') || !env.SUPABASE_SECRET_KEY) {
  return reply(503,{ok:false});
 }
 let payload,token;
 try {
  const input=await readJson(request);
  token=input.turnstileToken;
  if (typeof token!=='string' || !token || token.length>2048) return reply(400,{ok:false});
  payload=validateGuestInquiry(input);
 } catch {
  return reply(400,{ok:false});
 }
 try {
  const verified=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:ip}),
   redirect:'error',signal:AbortSignal.timeout(8000)
  });
  if(!verified.ok) return reply(503,{ok:false});
  const challenge=await verified.json();
  if(challenge.success!==true || challenge.hostname!==new URL(origin).hostname || challenge.action!=='guest-inquiry') return reply(403,{ok:false});
  const route=(place,prefix)=>[place[prefix+'City'],place[prefix+'Postal'],place[prefix+'Country']].join(' · ').slice(0,250);
  const database=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/ingest_guest_inquiry',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
   headers:{'Content-Type':'application/json',apikey:env.SUPABASE_SECRET_KEY},
   body:JSON.stringify({
    p_ref:payload.reference,p_network:await networkKey(env.DZ_IP_HASH_KEY,ip),p_email:payload.contact.email,
    p_origin:route(payload.pickup,'pickup'),p_destination:route(payload.delivery,'delivery'),
    p_category:payload.transportCategory,p_payload:payload
   })
  });
  const result=await database.json();
  if (!database.ok) return reply(result?.code==='P0002' ? 429 : 503,{ok:false});
  if(typeof result!=='string' || !/^[0-9a-f-]{36}$/.test(result)) return reply(503,{ok:false});
  return reply(200,{ok:true,reference:payload.reference});
 } catch {
  return reply(503,{ok:false});
 }
}
