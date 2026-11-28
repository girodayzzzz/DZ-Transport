const origin='https://dz-transport.eu';
const pages={
 '/prijava/':'login','/registracija/':'register','/upravljanje/':'manager',
 '/portal-prevozniki/':'carrier','/portal-stranke/':'customer',
 '/en/login/':'login','/de/anmelden/':'login',
 '/povprasevanje/':'/api/inquiry','/partnerji/':'/api/partner-application'
};

// These probes use no credentials, Turnstile token, customer details or Stripe signature.
async function pageCheck([path,expected]) {
 const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(12000)});
 const html=await response.text();
 const marker=expected.startsWith('/') ? 'data-endpoint="'+origin+expected+'"'
  : 'data-portal="'+expected+'" data-init=';
 return {path,status:response.status,ready:response.status===200 && html.includes(marker)};
}
async function endpointCheck([path,expected]) {
 const response=await fetch(origin+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
  headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
 await response.body?.cancel();
 return {path,status:response.status,ready:response.status===expected};
}
const checks=await Promise.allSettled([
 ...Object.entries(pages).map(pageCheck),
 ...[['/api/inquiry',400],['/api/partner-application',400],
  ['/api/stripe/billing',401],['/api/stripe/billing-webhook',400]].map(endpointCheck)
]);
for(const check of checks) {
 if(check.status==='rejected') {
  console.log('FAIL  Request did not complete');
  process.exitCode=1;
 } else {
  const {path,status,ready}=check.value;
  console.log((ready?'PASS':'FAIL')+'  '+status+'  '+path);
  if(!ready) process.exitCode=1;
 }
}
console.log('Checks cover public rendering and rejected requests only. Auth, Turnstile verification, database writes and signed Stripe delivery require separate authorized tests.');
