import {createClient} from '@supabase/supabase-js';
import {mountDashboard} from './portal-dashboard';

export type Field = {name:string; label:string; type?:string; min?:number; max?:number; step?:number; value?:string;
 options?:[string,string][]; autocomplete?:string; optional?:boolean};

export async function mountPortal(root:HTMLElement) {
 const {configuration,labels,links}=JSON.parse(root.dataset.init!) as {
  configuration:{url:string;key:string;google:boolean;onboarding?:boolean;quickDeal?:boolean};
  labels:Record<string,string>;
  links:Record<string,string>;
 };
 const page=root.dataset.portal!;
 const body=root.querySelector<HTMLElement>('[data-portal-body]')!;
 const status=root.querySelector<HTMLElement>('[data-portal-status]')!;
 const client=createClient(configuration.url,configuration.key,{
  auth:{storage:sessionStorage,flowType:'pkce',detectSessionInUrl:false}
 });
 const absolute=(path:string)=>new URL(path,location.origin).href;
 const move=(target:string)=>location.replace(absolute(links[target]));
 const show=(message:string)=>{status.textContent=message;};
 const ensure=(response:{error:unknown})=>{if(response.error) throw new Error(labels.error);};
 const unwrap=<T>(response:{data:T;error:unknown})=>{
  ensure(response);
  return response.data;
 };
 const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{
  const node=document.createElement(tag);
  if (text!==undefined) node.textContent=text;
  return node;
 };
 function form(parent:HTMLElement,fields:Field[],caption:string,perform:(values:FormData)=>Promise<void>) {
  const node=el('form');
  const button=el('button',caption);
  button.className='button primary';
  for (const field of fields) {
   const label=el('label',field.label);
   const input=field.options ? el('select') : field.type==='textarea' ? el('textarea') : el('input');
   if (input instanceof HTMLInputElement) {
    input.type=field.type || 'text';
    if (field.autocomplete) input.setAttribute('autocomplete',field.autocomplete);
    if(field.name==='code') {input.inputMode='numeric';input.pattern='[0-9]{6}';}
    if(input.type==='number') {
     input.step=String(field.step ?? 1);
     input.min=String(field.min ?? 0);
     input.max=String(field.max ?? 1000000000);
    }
   }
   if(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement && input.type!=='number') {
    if(field.max) input.maxLength=field.max;
    if(field.min) input.minLength=field.min;
   }
   if (input instanceof HTMLSelectElement) {
    for (const [value,text] of field.options!) {
     const option=el('option',text);
     option.value=value;
     input.append(option);
    }
   }
   input.name=field.name;
   input.required=!field.optional;
   if(field.value!==undefined) input.value=field.value;
   if (field.type==='checkbox') label.classList.add('portal-checkbox');
   label.append(input);
   node.append(label);
  }
  const feedback=el('p');
  feedback.setAttribute('role','status');
  node.append(button,feedback);
  node.addEventListener('submit',async event=>{
   event.preventDefault();
   button.disabled=true;
   feedback.textContent=labels.working;
   node.setAttribute('aria-busy','true');
   try {
    await perform(new FormData(node));
    feedback.textContent='';
   } catch {
    feedback.textContent=labels.error;
   } finally {
    button.disabled=false;
    node.removeAttribute('aria-busy');
   }
  });
  parent.append(node);
  return node;
 }
 const value=(values:FormData,key:string)=>String(values.get(key) ?? '');
 const email:Field={name:'email',label:labels.email,type:'email',autocomplete:'email',max:254};
 const password:Field={name:'password',label:labels.password,type:'password',autocomplete:'current-password'};
 const strongPassword={...password,min:12,max:72,autocomplete:'new-password'};
 const auth=client.auth;
 const googleButton=()=>{
  if(configuration.google) form(body,[],labels.google,async ()=>{
   ensure(await auth.signInWithOAuth({provider:'google',options:{redirectTo:absolute(links.callback)}}));
  });
 };

 try {
  show('');
  if(page==='load') {
   const id=new URLSearchParams(location.search).get('id');
   if(!id || !/^[a-f0-9-]{36}$/i.test(id)) {show(labels.loadUnavailable);return;}
   for(const anchor of document.querySelectorAll<HTMLAnchorElement>('a[data-language]')) {
    const destination=new URL(anchor.href);
    destination.searchParams.set('id',id);
    anchor.href=destination.href;
   }
   const load=unwrap(await client.rpc('public_load',{p_load:id}))[0];
   if(!load) {show(labels.loadUnavailable);return;}
   const countries=new Intl.DisplayNames([document.documentElement.lang],{type:'region'});
   body.append(el('p',[labels[load.category] ?? load.category,countries.of(load.origin_country),countries.of(load.destination_country)].join(' · ')));
   if(load.test_data) body.append(el('p',labels.testListing));
   const list=el('section');
   list.append(el('h2',labels.questions));
   body.append(list);
   const published=unwrap(await client.rpc('public_load_questions',{p_load:id})) as {question:string;answer:string|null}[];
   if(!published.length) list.append(el('p',labels.empty));
   for(const row of published) {
    const card=el('article');
    card.append(el('h3',row.question));
    if(row.answer) card.append(el('p',row.answer));
    list.append(card);
   }
   if(load.can_ask) {
    list.append(el('p',labels.publicQuestionHelp));
    const result=el('p');
    result.setAttribute('role','status');
    const ask=form(list,[{name:'body',label:labels.question,type:'textarea',max:1000}],labels.ask,async data=>{
     unwrap(await client.rpc('ask_load_question',{p_load:id,p_public:true,p_body:value(data,'body')}));
     ask.reset();
     result.textContent=labels.questionReceived;
    });
    list.append(result);
   }
   return;
  }
  if (['callback','verify'].includes(page)) {
   const query=new URLSearchParams(location.search);
   const fragment=new URLSearchParams(location.hash.slice(1));
   history.replaceState(null,'',location.pathname);
   const token=fragment.get('token_hash');
   const type=fragment.get('type');
   const code=query.get('code');
   if(token && (type==='email' || type==='recovery')) {
    const result=unwrap(await auth.verifyOtp({token_hash:token,type}));
    if (!result.session) throw new Error(labels.error);
    if(type==='recovery') {
     sessionStorage.setItem('dz-recovery',result.session.user.id);
     move('reset');
    } else move('customer');
   } else if(code && page==='callback') {
    ensure(await auth.exchangeCodeForSession(code));
    move('customer');
   } else show(query.size || fragment.size ? labels.error : labels.verifyHelp);
   return;
  }
  if(page==='login') {
   form(body,[email,password],labels.login,async values=>{
    ensure(await auth.signInWithPassword({email:value(values,'email'),password:value(values,'password')}));
    move('customer');
   });
   googleButton();
   return;
  }
  if(page==='register') {
   body.append(el('p',labels.passwordHint));
   form(body,[email,strongPassword],labels.register,async values=>{
    const result=unwrap(await auth.signUp({
     email:value(values,'email'),password:value(values,'password'),
     options:{emailRedirectTo:absolute(links.verify)}
    }));
    if(result.session) ensure(await auth.signOut());
    show(labels.mailSent);
   });
   googleButton();
   return;
  }
  if(page==='forgot') {
   form(body,[email],labels.submit,async values=>{
    unwrap(await auth.resetPasswordForEmail(value(values,'email'),{redirectTo:absolute(links.verify)}));
    show(labels.mailSent);
   });
   return;
  }
  const {data,error}=await auth.getUser();
  if(error || !data.user?.email_confirmed_at) {
   show(labels.authRequired);
   const link=el('a',labels.login);
   link.href=links.login;
   body.append(link);
   return;
  }
  const user=data.user;
  auth.onAuthStateChange(event=>{
   if (event==='SIGNED_OUT') {
    body.replaceChildren();
    move('login');
   }
  });
  if(page==='customer' && configuration.onboarding) {
   const profile=unwrap(await client.from('profiles')
    .select('account_type,display_name,onboarding_completed_at').eq('id',user.id).maybeSingle());
   if(!profile?.onboarding_completed_at) {
    const renderType=()=>{
     body.replaceChildren(el('h2',labels.chooseAccountType));
     form(body,[{name:'account_type',label:labels.accountType,value:profile?.account_type,options:[
      ['private_customer',labels.privateCustomer],['business_customer',labels.businessCustomer]
     ]}],labels.continueSetup,async values=>{
      ensure(await client.rpc('choose_customer_account_type',{p_type:value(values,'account_type')}));
      move('customer');
     });
    };
    if(!profile?.account_type) {
     renderType();
     return;
    }
    body.append(el('h2',labels.completeCustomerProfile),el('p',labels.freeCustomerSetup));
    const fields:Field[]=[{name:'display_name',label:labels.name,max:120,value:profile.display_name,autocomplete:'name'}];
    if(profile.account_type==='business_customer') {
     fields.push({name:'business_name',label:labels.registeredBusinessName,max:160,autocomplete:'organization'});
    }
    form(body,fields,labels.activateFree,async values=>{
     ensure(await client.rpc('complete_free_customer_onboarding',{
      p_name:value(values,'display_name'),p_business_name:value(values,'business_name') || null
     }));
     move('customer');
    });
    const back=el('button',labels.changeAccountType);
    back.type='button';
    back.addEventListener('click',renderType);
    body.append(back);
    return;
   }
  }
  if(page==='reset') {
   if(sessionStorage.getItem('dz-recovery')!==user.id) {show(labels.recoveryHelp);return;}
   form(body,[strongPassword],labels.save,async values=>{
    ensure(await auth.updateUser({password:value(values,'password')}));
    sessionStorage.removeItem('dz-recovery');
    ensure(await auth.signOut({scope:'global'}));
    move('login');
   });
  } else if(page==='logout') {
   form(body,[],labels.logout,async ()=>{
    sessionStorage.removeItem('dz-recovery');
    ensure(await auth.signOut({scope:'local'}));
    move('login');
   });
  } else if(page==='account') {
   const profile=unwrap(await client.from('profiles').select('display_name').eq('id',user.id).maybeSingle());
   body.append(el('p',user.email));
   form(body,[{name:'display_name',label:labels.name,max:120,optional:true,value:profile?.display_name}],labels.save,async values=>{
    const name=value(values,'display_name');
    if(profile) ensure(await client.from('profiles').update({display_name:name}).eq('id',user.id));
    else ensure(await client.from('profiles').insert({id:user.id,display_name:name}));
    move('account');
   });
   const factors=unwrap(await auth.mfa.listFactors());
   if(factors && !factors.totp.length) {
    const enrollment=form(body,[],labels.mfa,async ()=>{
     for(const old of factors.all.filter(factor=>factor.factor_type==='totp' && factor.status==='unverified')) {
      ensure(await auth.mfa.unenroll({factorId:old.id}));
     }
     const factor=unwrap(await auth.mfa.enroll({factorType:'totp'}));
     if(!factor) throw new Error(labels.error);
     const setup=el('section');
     setup.append(el('p',labels.mfaSecret),el('code',factor.totp.secret));
     body.append(setup);
     form(setup,[{name:'code',label:labels.code,min:6,max:6,autocomplete:'one-time-code'}],labels.mfa,async values=>{
      ensure(await auth.mfa.challengeAndVerify({factorId:factor.id,code:value(values,'code')}));
      move('account');
     });
     enrollment.remove();
    });
   }
  } else if(page==='deletion') {
   const request=unwrap(await client.from('account_deletion_requests').select('id').eq('user_id',user.id).maybeSingle());
   if(request) show(labels.saved);
   else {
    body.append(el('p',labels.deletionHelp));
    form(body,[],labels.deletion,async ()=>{
     unwrap(await client.from('account_deletion_requests').insert({user_id:user.id}));
     move('deletion');
    });
   }
  } else {
   if(page==='manager') {
    const role=unwrap(await client.from('user_roles').select('id').eq('user_id',user.id).eq('role','admin').eq('approved',true).maybeSingle());
    if(!role) {show(labels.accessDenied);return;}
    const assurance=unwrap(await auth.mfa.getAuthenticatorAssuranceLevel());
    if(assurance?.currentLevel!=='aal2') {
     const factors=unwrap(await auth.mfa.listFactors());
     const factor=factors?.totp[0];
     if(!factor) {show(labels.mfaRequired);return;}
     form(body,[{name:'code',label:labels.code,min:6,max:6,autocomplete:'one-time-code'}],labels.mfa,async values=>{
      ensure(await auth.mfa.challengeAndVerify({factorId:factor.id,code:value(values,'code')}));
      move('manager');
     });
     return;
    }
   }
   await mountDashboard({client,page,body,labels,form,show,el,unwrap,userId:user.id,quickDeal:configuration.quickDeal,loadUrl:links.load});
  }
 } catch {
  show(labels.error);
 }
}
