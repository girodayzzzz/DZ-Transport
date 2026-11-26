import { grouping } from './form-schema.mjs';
import { cargoTotals, localDate, scheduleError, phoneValid, reference, payload, emailDetails, submit } from './form-core.mjs';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const controls = (root:ParentNode) => [...root.querySelectorAll<Control>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
const get = <T extends HTMLElement = HTMLElement>(root:ParentNode,selector:string) => root.querySelector<T>(selector)!;

export function initializeForms() {
 for (const form of document.querySelectorAll<HTMLFormElement>('[data-workflow]')) initialize(form);
}

function initialize(form:HTMLFormElement) {
 const strings = JSON.parse(form.dataset.copy!);
 const kind = form.dataset.workflow!;
 const steps = [...form.querySelectorAll<HTMLElement>('[data-step]')];
 const send = get<HTMLButtonElement>(form,'[data-send]');
 const error = get(form,'[data-form-error]');
 const previous = form.querySelector<HTMLButtonElement>('[data-prev]');
 const next = form.querySelector<HTMLButtonElement>('[data-next]');
 const values = () => Object.fromEntries(controls(form).map(input=>[input.name,input instanceof HTMLInputElement && input.type==='checkbox' ? input.checked : input.value.trim()]));
 let active = 0;
 let working = false;
 let finished = false;
 let fingerprint = '';
 let meta = {};
 const endpoint = form.dataset.endpoint!;
 const query = new URLSearchParams(location.search);
 const markers = [...form.querySelectorAll('[data-marker]')];

 function batchItems(panel:Element) {
  return [...panel.querySelectorAll<HTMLFieldSetElement>('.cargo-item')].map(item =>
   Object.fromEntries(controls(item).map(input=>[
    input.name, input instanceof HTMLInputElement && input.type==='number' ? input.valueAsNumber : input.value
   ]))
  );
 }

 const numberFormat=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:6});
 function updateTotals() {
  for (const panel of form.querySelectorAll<HTMLElement>('[data-cargo]:not([disabled])')) {
   const weight=panel.querySelector('[data-weight]');
   if (!weight) continue;
   const totals=cargoTotals(batchItems(panel));
   weight.textContent=numberFormat.format(totals.weightKg);
   get(panel,'[data-volume]').textContent=numberFormat.format(totals.volumeM3);
  }
 }

 for (const list of form.querySelectorAll<HTMLElement>('[data-items]')) {
  const parent=list.parentElement!;
  const add=get<HTMLButtonElement>(parent,'[data-add]');
  const template=get<HTMLTemplateElement>(parent,'template');
  let sequence=0;
  function updateButtons() {
   add.disabled=list.children.length>=20;
   for (const button of list.querySelectorAll<HTMLButtonElement>('[data-remove]')) button.disabled=list.children.length===1;
  }
  function append(focus:boolean) {
   const row=template.content.firstElementChild!.cloneNode(true) as HTMLFieldSetElement;
   const suffix='-'+(++sequence);
   for (const element of row.querySelectorAll('[id]')) {
    element.id=element.id.endsWith('-error')
     ? element.id.slice(0,-6)+suffix+'-error'
     : element.id+suffix;
   }
   for (const label of row.querySelectorAll('label')) label.htmlFor+=suffix;
   get(row,'[data-remove]').addEventListener('click',()=>{
    row.remove();
    updateButtons();
    updateTotals();
    add.focus();
   });
   list.append(row);
   updateButtons();
   if (focus) row.querySelector('input')?.focus();
  }
  append(false);
  add.addEventListener('click',()=>append(true));
 }

 if (kind === 'inquiry') {
  for (const key of ['transportCategory','pickupCountry','deliveryCountry','customerType']) {
   const input = form.elements.namedItem(key) as HTMLSelectElement;
   const initial = query.get(key);
   if (initial && [...input.options].some(option=>option.value===initial)) input.value=initial;
  }
  let places: Record<string,string> = {};
  try {
   const stored=sessionStorage.getItem('dzt-quick-route');
   sessionStorage.removeItem('dzt-quick-route');
   if (query.has('quick') && stored) places=JSON.parse(stored);
  } catch {}
  for (const place of ['pickup','delivery']) {
   const value=places?.[place+'Place'];
   const initial = typeof value==='string' ? value.trim().slice(0,120) : '';
   if (!initial) continue;
   const suffix = /^\d[\d -]*$|^[A-Z]{1,3}\d[A-Z\d]*[ -]?[A-Z\d]+$/i.test(initial) ? 'Postal' : 'City';
   (form.elements.namedItem(place+suffix) as HTMLInputElement).value=initial;
  }
  const pattern=query.get('businessPattern');
  if (pattern==='once' || pattern==='recurring') (form.elements.namedItem('businessPattern') as HTMLSelectElement).value=pattern;
  if (query.has('urgent') && values().transportCategory === 'express') (form.elements.namedItem('urgent') as HTMLInputElement).checked=true;
  next!.disabled=false;
 }
 send.disabled=!endpoint;

 function refresh() {
  const current = values();
  for (const panel of form.querySelectorAll<HTMLFieldSetElement>('[data-cargo], [data-company]')) {
   const enabled = panel.hasAttribute('data-company')
    ? current.customerType==='business'
    : panel.dataset.cargo===grouping[current.transportCategory as keyof typeof grouping];
   panel.hidden=!enabled;
   panel.disabled=!enabled;
  }
  const recurring=form.querySelector<HTMLFieldSetElement>('[data-recurring]');
  if (recurring) recurring.hidden=recurring.disabled=current.customerType!=='business' || current.businessPattern!=='recurring';
  updateTotals();
  const flag = form.querySelector<HTMLElement>('[data-regulated]');
  if (flag) flag.hidden=current.regulated!=='yes' && current.oversized!=='yes' && current.transportCategory!=='machinery';
  for (const date of form.querySelectorAll<HTMLInputElement>('input[type=date]')) date.min=localDate();
 }

 function setError(input:Control, message:string) {
  const hint = get(document,'#'+input.id+'-error');
  hint.hidden=!message;
  hint.textContent=message;
  if (message) {
   input.setAttribute('aria-invalid','true');
   input.setAttribute('aria-describedby',hint.id);
  } else {
   input.removeAttribute('aria-invalid');
   input.removeAttribute('aria-describedby');
  }
 }

 function valid(step:number) {
  const entries=controls(steps[step]);
  const current=values();
  const dateIssue=step===3 ? scheduleError(current.pickupDate,current.deliveryDate,localDate(),current.flexible === true) : '';
  const dateField=dateIssue==='deliveryPast'||dateIssue==='order' ? 'deliveryDate' : 'pickupDate';
  let first:Control|undefined;
  for (const input of entries) {
   let message='';
   if (input.name===dateField && dateIssue) message=strings[dateIssue];
   else if (input.validity.valueMissing || (input.required && input.type!=='checkbox' && !input.value.trim())) message=strings.required;
   else if (input.validity.typeMismatch && input.type==='email') message=strings.email;
   else if (input.name==='phone' && !phoneValid(String(current.phone))) message=strings.phone;
   else if (input.name==='running' && current.transportCategory==='nonRunning' && input.value==='yes') message=strings.nonRunning;
   else if (!input.validity.valid) message=strings.invalid;
   setError(input,message);
   if (message && !first) first=input;
  }
  return first;
 }

 function sections() {
  const grouped=Object.fromEntries([...form.querySelectorAll<HTMLElement>('[data-group]')].map(group=>[
   group.dataset.group!,Object.fromEntries(controls(group).filter(input=>!input.closest('.cargo-item')).map(input=>[
    input.name,input instanceof HTMLInputElement && input.type==='checkbox' ? input.checked : input.value.trim()
   ]))
  ]));
  const panel=form.querySelector('[data-cargo]:not([disabled]) [data-items]')?.parentElement;
  if (!panel) return grouped;
  const items=batchItems(panel);
  return {...grouped,cargo:{...grouped.cargo,items,...cargoTotals(items)}};
 }

 function summary() {
  const container=get(form,'[data-summary]');
  container.replaceChildren();
  steps.slice(0,-1).forEach((step,index)=>{
   const block=document.createElement('section');
   const header=document.createElement('div');
   header.className='summary-heading';
   const heading=document.createElement('h3');
   heading.textContent=markers[index].textContent;
   const edit=document.createElement('button');
   edit.type='button';
   edit.className='text-button';
   edit.textContent=strings.edit;
   edit.setAttribute('aria-label',strings.edit+' '+heading.textContent);
   edit.addEventListener('click',()=>show(index));
   header.append(heading,edit);
   block.append(header);
   for (const group of step.querySelectorAll<HTMLElement>('[data-group]')) {
    if (group.dataset.title) {
     const sub=document.createElement('h4');
     sub.textContent=group.dataset.title;
     block.append(sub);
    }
    const list=document.createElement('dl');
    for (const input of controls(group).filter(input=>!input.closest('.cargo-item'))) {
     const term=document.createElement('dt');
     const definition=document.createElement('dd');
     term.textContent=input.labels?.[0]?.textContent?.trim() || input.name;
     definition.textContent=input instanceof HTMLSelectElement && input.value
      ? input.selectedOptions[0].textContent
      : input instanceof HTMLInputElement && input.type==='checkbox'
       ? (input.checked ? strings.yes : strings.no)
       : input.value.trim() || strings.noValue;
     list.append(term,definition);
    }
    block.append(list);
    const items=group.querySelector('[data-cargo]:not([disabled]) .cargo-items');
    if (items) {
     const metrics=items.querySelector('.cargo-totals');
     for (const row of items.querySelectorAll('.cargo-item')) {
      const details=document.createElement('p');
      details.textContent=controls(row).map(input=>{
       const label=input.labels?.[0]?.textContent?.trim() || input.name;
       const value=input instanceof HTMLSelectElement ? input.selectedOptions[0]?.textContent : input.value;
       return label+' · '+value;
      }).join(' / ');
      block.append(details);
     }
     if (metrics) block.append(metrics.cloneNode(true));
    }
   }
   container.append(block);
  });
 }

 function show(index:number) {
  active=index;
  steps.forEach((step,position)=>step.hidden=position!==index);
  markers.forEach((marker,position)=>{
   if (position===index) marker.setAttribute('aria-current','step');
   else marker.removeAttribute('aria-current');
  });
  get<HTMLProgressElement>(form,'progress').value=index+1;
  get(form,'[data-progress]').textContent=strings.step+' '+(index+1)+' '+strings.of+' '+steps.length;
  previous!.hidden=index===0;
  next!.hidden=index===steps.length-1;
  send.hidden=!next!.hidden;
  if (!send.hidden) summary();
  get(steps[index],'h2').focus();
 }

 refresh();
 form.addEventListener('change',refresh);
 form.addEventListener('input',event=>{
  const field=event.target as Control;
  updateTotals();
  if (field.hasAttribute('aria-invalid')) setError(field,'');
 });
 previous?.addEventListener('click',()=>show(active-1));
 next?.addEventListener('click',()=>{
  const invalid=valid(active);
  if (invalid) invalid.focus();
  else show(active+1);
 });

 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if (kind==='inquiry' && active<steps.length-1) {
   next!.click();
   return;
  }
  if (working || finished || !endpoint) return;
  refresh();
  error.hidden=true;
  for (let index=0;index<steps.length;index++) {
   const invalid=valid(index);
   if (invalid) {
    if (index!==active) show(index);
    invalid.focus();
    return;
   }
  }
  const current=values();
  if (current._gotcha) {
   error.textContent=strings.failed;
   error.hidden=false;
   return;
  }
  const grouped=sections();
  const serialized=JSON.stringify(grouped);
  if (serialized!==fingerprint) {
   fingerprint=serialized;
   meta={kind,reference:reference(),submittedAt:new Date().toISOString(),language:document.documentElement.lang};
  }
  const data=payload(meta,grouped,current);
  const details=emailDetails(data);
  working=true;
  send.disabled=true;
  if (previous) previous.disabled=true;
  const locked=[...controls(form),...form.querySelectorAll<HTMLButtonElement>('.summary button')];
  for (const control of locked) control.disabled=true;
  form.setAttribute('aria-busy','true');
  const label=send.textContent;
  send.textContent=strings.sending;
  try {
   const accepted=await submit(endpoint,{...data,_subject:'DZ Transport | '+data.reference,inquiryDetails:details});
   if (!accepted) throw new Error('Rejected');
   finished=true;
   try {
    sessionStorage.setItem('dzt-confirmation',JSON.stringify({reference:data.reference,kind}));
    location.assign(form.dataset.confirmation!);
   } catch {
    const confirmation=document.createElement('div');
    confirmation.className='notice';
    confirmation.tabIndex=-1;
    confirmation.textContent=(kind==='partner'?strings.partnerReceived:strings.received)+' '+strings.reference+' '+data.reference;
    form.replaceWith(confirmation);
    confirmation.focus();
   }
  } catch {
   error.textContent=strings.failed;
   error.hidden=false;
  } finally {
   working=false;
   form.removeAttribute('aria-busy');
   send.textContent=label;
   if (!finished) {
    for (const control of locked) control.disabled=false;
    refresh();
    error.tabIndex=-1;
    error.focus();
    send.disabled=false;
    if (previous) previous.disabled=false;
   }
  }
 });
}
