import type {SupabaseClient} from '@supabase/supabase-js';
import {cargo,cargoItem,companyFields,consents,customer as customerFields,location,oversized,recurringFields,regulated,schedule,types} from './form-schema.mjs';
import type {Field} from './portal';

type Context = {
 client:SupabaseClient;
 page:string;
 body:HTMLElement;
 labels:Record<string,string>;
 form:(parent:HTMLElement,fields:Field[],caption:string,perform:(values:FormData)=>Promise<void>)=>HTMLFormElement;
 show:(message:string)=>void;
 el:<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>HTMLElementTagNameMap[K];
 unwrap:<T>(response:{data:T;error:unknown})=>T;
 userId:string;
};
type Row = Record<string,string|number|boolean|null>;
type Columns = [string,string][];

export async function mountDashboard({client,page,body,labels,form,show,el,unwrap,userId}:Context) {
 const text=(key:string)=>labels[key] || key;
 const language=['sl','en','de'].indexOf(document.documentElement.lang);
 const inquiryFieldLabels=new Map([...customerFields,...location('pickup'),...location('delivery'),...Object.values(cargo).flat(),
  ...cargoItem,...companyFields,...recurringFields,...schedule,...consents,regulated,oversized].map(field=>[field.key,field.labels[language]]));
 const cell=(key:string,value:Row[string])=>{
  if(value===null || value===undefined) return '—';
  if(key==='created_at') return new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(String(value)));
  if(['status','state','event'].includes(key)) return text(String(value));
  return String(value);
 };
 const rows=async (table:string,columns:string)=>{
  return unwrap(await client.from(table).select(columns).order('created_at',{ascending:false}).limit(100)) as unknown as Row[];
 };
 const rpc=async (name:string,args:Record<string,unknown>)=>unwrap(await client.rpc(name,args));
 const field=(name:string,label:string,extra:Partial<Field>={}):Field=>({name,label:text(label),max:250,...extra});
 const options=(values:string[]):[string,string][]=>values.map(value=>[value,text(value)]);
 const section=(key:string)=>{
  const article=el('article');
  article.append(el('h2',text(key)));
  body.append(article);
  return article;
 };
 const table=(parent:HTMLElement,data:Row[],columns:Columns,actions?:(parent:HTMLElement,row:Row)=>void)=>{
  if(!data.length) {parent.append(el('p',labels.empty));return;}
  const wrapper=el('div');
  wrapper.className='portal-table';
  const grid=el('table');
  const head=grid.createTHead().insertRow();
  for(const [,label] of columns) {
   const th=el('th',text(label));
   th.scope='col';
   head.append(th);
  }
  if(actions) {
   const th=el('th',labels.update);
   th.scope='col';
   head.append(th);
  }
  const list=grid.createTBody();
  for(const row of data) {
   const tr=list.insertRow();
   for(const [key] of columns) tr.insertCell().textContent=cell(key,row[key]);
   if(actions) actions(tr.insertCell(),row);
  }
  wrapper.append(grid);
  parent.append(wrapper);
 };
 const action=(parent:HTMLElement,key:string,fields:Field[],run:(data:FormData)=>Promise<void>)=>{
  const details=el('details');
  details.append(el('summary',text(key)));
  form(details,fields,text(key),async data=>{
   await run(data);
   await refresh();
  });
  parent.append(details);
 };
 const read=(data:FormData,key:string)=>String(data.get(key) ?? '');
 const amountFields=[
  field('p_amount','amount',{type:'number',min:1}),
  field('p_currency','currency',{options:options(['EUR','CHF','GBP'])}),
  field('p_vat','vat'),
  field('p_valid','valid',{type:'date'})
 ];
 const money=(data:FormData)=>({
  p_amount:Number(read(data,'p_amount')),p_currency:read(data,'p_currency'),
  p_vat:read(data,'p_vat'),p_valid:read(data,'p_valid')
 });
 const inquiryColumns:Columns=[['reference','reference'],['origin','origin'],['destination','destination'],['status','status']];
 const quoteColumns:Columns=[['inquiry_id','inquiries'],['status','status'],['amount_minor','amount'],['currency','currency'],['vat_treatment','vat'],['valid_until','valid']];
 const orderColumns:Columns=[['id','reference'],['inquiry_id','inquiries']];
 const historyColumns:Columns=[['inquiry_id','inquiries'],['status','status'],['created_at','date']];
 const partnerSteps:Record<string,string>={scheduled:'picked_up',picked_up:'in_transit',in_transit:'delivered'};
 const managerSteps:Record<string,string>={new_inquiry:'under_review',under_review:'awaiting_carrier_offer',
  offer_prepared:'offer_sent',carrier_assigned:'scheduled',delivered:'completed',...partnerSteps};
 let inquiryRequest:{key:string;fingerprint:string}|undefined;
 let receipt:string|undefined;


 async function customer() {
  const [inquiries,quotes,orders,history,profiles]=await Promise.all([
   unwrapQuery('transport_inquiries','id,reference,origin,destination,status','customer_id',userId),
   rows('transport_quotes','id,inquiry_id,opportunity_id,status,amount_minor,currency,vat_treatment,valid_until'),
   rows('transport_orders','id,inquiry_id'),
   rows('transport_status_history','inquiry_id,status,created_at'),
   unwrapQuery('profiles','display_name','id',userId)
  ]);
  const visible=new Map(inquiries.map(row=>[row.id,row.reference]));
  const related=(items:Row[])=>items.filter(row=>visible.has(row.inquiry_id))
   .map(row=>({...row,inquiry_id:visible.get(row.inquiry_id) ?? null}));
  const start=section('newInquiry');
  if(receipt) {
   const result=el('p',labels.receipt+' '+receipt);
   result.setAttribute('role','status');
   start.append(result);
  }
  form(start,[field('p_name','name',{max:120,optional:true,value:String(profiles[0]?.display_name ?? '')}),field('p_origin','origin'),field('p_destination','destination'),field('p_description','description',{type:'textarea',max:4000})],labels.submit,async data=>{
   const args={p_name:read(data,'p_name'),p_origin:read(data,'p_origin'),p_destination:read(data,'p_destination'),p_description:read(data,'p_description')};
   const fingerprint=JSON.stringify(args);
   if(inquiryRequest?.fingerprint!==fingerprint) inquiryRequest={fingerprint,key:crypto.randomUUID()};
   receipt=String(await rpc('submit_customer_inquiry',{...args,p_request:inquiryRequest.key}));
   inquiryRequest=undefined;
   await refresh();
  });
  table(section('inquiries'),inquiries,inquiryColumns);
  table(section('offers'),related(quotes.filter(row=>row.opportunity_id===null && row.status!=='draft')),quoteColumns,(parent,row)=>{
   if(row.status!=='sent') return;
   parent.append(el('p',labels.acceptHelp));
   action(parent,'accept',[],async()=>{await rpc('accept_customer_offer',{p_quote:row.id});});
  });
  table(section('orders'),related(orders),orderColumns);
  table(section('history'),related(history),historyColumns);
 }

 async function carrier() {
  const [applications,companies,opportunities,quotes,assignments,orders,history]=await Promise.all([
   unwrapQuery('partner_applications','id,state','applicant_id',userId),
   unwrapQuery('companies','name,services,coverage','owner_id',userId),
   unwrapQuery('transport_opportunities','id,summary,open','partner_id',userId),
   rows('transport_quotes','id,opportunity_id,status,amount_minor,currency,vat_treatment,valid_until'),
   unwrapQuery('transport_assignments','order_id,instructions','partner_id',userId),
   rows('transport_orders','id,inquiry_id'),
   rows('transport_status_history','inquiry_id,status,created_at')
  ]);
  const panel=section('application');
  table(panel,applications,[['state','status']]);
  if(!applications.length) {
   action(panel,'apply',[field('p_name','company',{max:160}),field('p_coverage','coverage',{max:500}),field('p_services','services',{max:500})],async data=>{
    await rpc('apply_as_partner',{p_name:read(data,'p_name'),p_services:read(data,'p_services'),p_coverage:read(data,'p_coverage')});
   });
   return;
  }
  table(section('company'),companies,[['name','company'],['services','services'],['coverage','coverage']]);
  if(applications[0].state!=='approved') return;
  const submitted=quotes.filter(row=>opportunities.some(opportunity=>opportunity.id===row.opportunity_id));
  table(section('opportunities'),opportunities.filter(row=>row.open),[['id','reference'],['summary','description']],(parent,row)=>{
   if(!submitted.some(quote=>quote.opportunity_id===row.id)) {
    action(parent,'submit',amountFields,async data=>{await rpc('submit_carrier_quote',{p_opportunity:row.id,...money(data)});});
   }
  });
  table(section('offers'),submitted,[['opportunity_id','opportunities'],...quoteColumns.slice(1)]);
  table(section('assignments'),assignments,[['order_id','orders'],['instructions','instructions']],(parent,row)=>{
   const order=orders.find(order=>order.id===row.order_id);
   if(!order) return;
   const current=history.find(item=>item.inquiry_id===order.inquiry_id)?.status;
   const next=partnerSteps[String(current)];
   if(next) action(parent,'update',[field('next','status',{options:options([next])})],async data=>{
    await rpc('advance_transport',{p_inquiry:order.inquiry_id,p_next:read(data,'next')});
   });
  });
 }

 async function manager() {
  const [inquiries,applications,companies,quotes,costs,orders,notes,financials,stats,deletions]=await Promise.all([
   rows('transport_inquiries','id,reference,origin,destination,status,contact_email,contact_name,description,archived_at,customer_id'),
   rows('partner_applications','id,applicant_id,state'),
   rows('companies','owner_id,name,services,coverage'),
   rows('transport_quotes','id,inquiry_id,opportunity_id,status,amount_minor,currency,vat_treatment,valid_until'),
   rows('quote_costs','quote_id,carrier_minor,expenses_minor'),
   rows('transport_orders','id,inquiry_id'),
   rows('internal_notes','inquiry_id,body,created_at'),
   rpc('manager_financials',{}),
   rpc('manager_counts',{}),
   rows('account_deletion_requests','user_id,created_at')
  ]);
  const overview=section('overview');
  const counts=(stats as Row[])[0];
  if(counts) table(overview,[
   {name:labels.newInquiry,amount:counts.new_inquiries},
   {name:labels.openOffers,amount:counts.open_offers},
   {name:labels.activeTransports,amount:counts.active_transports},
   {name:labels.completed,amount:counts.completed_transports},
   {name:labels.pendingPartners,amount:counts.pending_partners}
  ],[['name','status'],['amount','overview']]);
  table(overview,financials as Row[],[['currency','currency'],['revenue_minor','revenue'],['carrier_minor','carrierCost'],
   ['expenses_minor','expenses'],['profit_minor','profit'],['margin_percent','margin']]);
  const partnerOptions=applications.filter(row=>row.state==='approved' && row.applicant_id)
   .map(row=>[String(row.applicant_id),String(companies.find(company=>company.owner_id===row.applicant_id)?.name ?? row.applicant_id)] as [string,string]);
  table(section('application'),applications.map(row=>({...row,...companies.find(company=>company.owner_id===row.applicant_id)})),
   [['name','company'],['services','services'],['coverage','coverage'],['state','status']],(parent,row)=>{
    if(row.applicant_id && row.name) action(parent,'save',[
     field('services','services',{max:500,value:String(row.services)}),
     field('coverage','coverage',{max:500,value:String(row.coverage)})
    ],async data=>{
     await rpc('update_company_coverage',{p_owner:row.applicant_id,p_services:read(data,'services'),p_coverage:read(data,'coverage')});
    });
    if(row.applicant_id) action(parent,'review',[field('state','status',{options:options(['approved','rejected','suspended'])})],async data=>{
     await rpc('review_partner',{p_application:row.id,p_state:read(data,'state')});
    });
   });
  const panel=section('inquiries');
  const records=el('div');
  const filter=form(panel,[field('search','search',{optional:true}),field('status','status',{options:options(['all','archived',...Object.keys(labels).filter(key=>key in managerSteps || ['awaiting_carrier_offer','offer_sent','customer_accepted','completed','cancelled'].includes(key))])})],
   labels.search,async data=>display(read(data,'search'),read(data,'status')));
  filter.after(records);
  display('','all');
  function display(term:string,status:string) {
   records.replaceChildren();
   const matches=inquiries.filter(row=>(status==='archived' ? Boolean(row.archived_at) :
    status==='all' ? !row.archived_at : row.status===status) &&
    [row.reference,row.origin,row.destination,row.contact_email].some(value=>String(value).toLowerCase().includes(term.trim().toLowerCase())));
   for(const row of matches) {
    const details=el('details');
    details.append(el('summary',[row.reference,row.origin,row.destination,text(String(row.status))].join(' · ')));
    if(row.contact_name) details.append(el('p',String(row.contact_name)));
    details.append(el('p',String(row.contact_email)),el('p',types.find(type=>type[0]===row.description)?.[language+1] ?? String(row.description)));
    const guest=el('div');
    form(guest,[],labels.details,async ()=>{
     const receipt=await rpc('manager_guest_details',{p_inquiry:row.id}) as {reference:string;details:Record<string,unknown>}|null;
     guest.replaceChildren();
     if(!receipt) {guest.append(el('p',labels.empty));return;}
     guest.append(el('p',labels.reference+' '+receipt.reference));
     for (const [key,label] of [['contact','contact'],['pickup','origin'],['delivery','destination'],['cargo','cargo'],['schedule','schedule'],['additionalRequirements','permissions']]) {
      const data=receipt.details[key];
      if(!data || typeof data!=='object') continue;
      guest.append(el('h3',labels[label]));
      const list=el('dl');
      for(const [name,value] of Object.entries(data)) {
       if(name==='items' && Array.isArray(value)) {
        for(const item of value) {
         list.append(el('dt',labels.cargoItem),el('dd',Object.entries(item).map(([key,value])=>(inquiryFieldLabels.get(key) ?? key)+' '+String(value)).join(' · ')));
        }
       } else if(inquiryFieldLabels.has(name)) {
        list.append(el('dt',inquiryFieldLabels.get(name)),el('dd',typeof value==='boolean' ? labels[value ? 'yes' : 'no'] : String(value)));
       }
      }
      guest.append(list);
     }
    });
    if(types.some(type=>type[0]===row.description)) details.append(guest);
    table(details,notes.filter(note=>note.inquiry_id===row.id),[['body','notes'],['created_at','date']]);
    const inquiryQuotes=quotes.filter(quote=>quote.inquiry_id===row.id);
    const pricing=inquiryQuotes.map(quote=>{
     const cost=costs.find(cost=>cost.quote_id===quote.id);
     if(!cost) return quote;
     const amount=BigInt(Number(quote.amount_minor));
     const profit=amount-BigInt(Number(cost.carrier_minor))-BigInt(Number(cost.expenses_minor));
     const hundredths=((profit<0n ? -profit : profit)*10000n+amount/2n)/amount;
     const margin=(profit<0n ? '-' : '')+String(hundredths/100n)+'.'+String(hundredths%100n).padStart(2,'0');
     return {...quote,...cost,profit:String(profit),margin};
    });
    table(details,pricing,[...quoteColumns.slice(1),['carrier_minor','carrierCost'],['expenses_minor','expenses'],['profit','profit'],['margin','margin']]);
    const sent=inquiryQuotes.find(quote=>quote.opportunity_id===null && quote.status==='sent');
    if(sent && row.customer_id===null) {
     action(details,'guestAcceptance',[field('evidence','evidence',{type:'textarea',min:12,max:4000})],async data=>{
      await rpc('record_guest_acceptance',{p_quote:sent.id,p_evidence:read(data,'evidence')});
     });
    }
    action(details,'note',[field('body','notes',{type:'textarea',max:4000})],async data=>{
     unwrap(await client.from('internal_notes').insert({inquiry_id:row.id,body:read(data,'body')}));
    });
    const current=String(row.status);
    const next=[managerSteps[current],...(!['delivered','completed','cancelled'].includes(current) ? ['cancelled'] : [])].filter(Boolean);
    if(next.length) action(details,'update',[field('next','status',{options:options(next)})],async data=>{
     await rpc('advance_transport',{p_inquiry:row.id,p_next:read(data,'next')});
    });
    if(current==='awaiting_carrier_offer') {
     if(partnerOptions.length) action(details,'invite',[
      field('partner','partner',{options:partnerOptions}),field('summary','description',{type:'textarea',max:1500})
     ],async data=>{await rpc('invite_partner',{p_inquiry:row.id,p_partner:read(data,'partner'),p_summary:read(data,'summary')});});
     action(details,'prepare',[...amountFields,field('carrier','carrierCost',{type:'number'}),field('expenses','expenses',{type:'number'})],async data=>{
      await rpc('prepare_customer_offer',{p_inquiry:row.id,...money(data),p_carrier:Number(read(data,'carrier')),p_expenses:Number(read(data,'expenses'))});
     });
    }
    const order=orders.find(order=>order.inquiry_id===row.id);
    if(current==='customer_accepted' && order && partnerOptions.length) {
     action(details,'assign',[field('partner','partner',{options:partnerOptions}),field('instructions','instructions',{type:'textarea',max:4000})],async data=>{
      await rpc('assign_transport',{p_order:order.id,p_partner:read(data,'partner'),p_instructions:read(data,'instructions')});
     });
    }
    if(['completed','cancelled'].includes(current) && !row.archived_at) {
     action(details,'archive',[],async()=>{await rpc('archive_inquiry',{p_inquiry:row.id});});
    }
    records.append(details);
   }
   if(!matches.length) records.append(el('p',labels.empty));
  }
  table(section('deletion'),deletions,[['user_id','reference'],['created_at','date']]);
 }

 async function unwrapQuery(table:string,columns:string,key:string,value:string) {
  return unwrap(await client.from(table).select(columns).eq(key,value).order('created_at',{ascending:false}).limit(100)) as unknown as Row[];
 }

 async function refresh() {

  body.replaceChildren();
  show(labels.working);
  try {
   if(page==='customer') await customer();
   if(page==='carrier') await carrier();
   if(page==='manager') await manager();
   const notifications=await unwrapQuery('notifications','id,event,read_at,created_at','recipient_id',userId);
   table(section('notifications'),notifications,[['event','notifications'],['created_at','date']],(parent,row)=>{
    if(!row.read_at) action(parent,'markRead',[],async()=>{await rpc('mark_notification_read',{p_notification:row.id});});
   });
   show('');
  } catch {
   show(labels.error);
  }
 }
 await refresh();
}
