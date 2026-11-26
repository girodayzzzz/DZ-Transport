type Widget = {
 render:(target:HTMLElement,options:{sitekey:string;action:string;language:string;callback:(token:string)=>void;
  'expired-callback':()=>void;'error-callback':()=>void})=>string;
 reset:(id:string)=>void;
};
let api:Promise<Widget>|undefined;
export function loadTurnstile() {
 if(!api) api=new Promise<Widget>((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.referrerPolicy='no-referrer';
  script.onload=()=>{
   const widget=(window as Window & {turnstile?:Widget}).turnstile;
   if(widget) resolve(widget);
   else reject(new Error('Turnstile unavailable'));
  };
  script.onerror=()=>reject(new Error('Turnstile unavailable'));
  document.head.append(script);
 });
 return api;
}
