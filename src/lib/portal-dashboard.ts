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
 quickDeal?:boolean;
 loadUrl:string;
};
type Row = Record<string,string|number|boolean|null>;
type Columns = [string,string][];

export async function mountDashboard({client,page,body,labels,form,show,el,unwrap,userId,quickDeal,loadUrl}:Context) {
 const text=(key:string)=>labels[key] || key;
 const language=['sl','en','de'].indexOf(document.documentElement.lang);
 const inquiryFieldLabels=new Map([...customerFields,...location('pickup'),...location('delivery'),...Object.values(cargo).flat(),
  ...cargoItem,...companyFields,...recurringFields,...schedule,...consents,regulated,oversized].map(field=>[field.key,field.labels[language]]));
 const cell=(key:string,value:Row[string])=>{
  if(value===null || value===undefined) return '—';
  if(['created_at','expires_at','eligible_until','requested_at','reserved_until'].includes(key)) return new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(String(value)));
  if(key==='pickup_window' || key==='delivery_window') {
   const match=/^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(String(value));
   if(match) {
    const [first,last]=match.slice(1).map(day=>new Date(day));
    last.setUTCDate(last.getUTCDate()-1);
    const formatter=new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeZone:'UTC'});
    return formatter.formatRange(first,last);
   }
  }
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
  article.id=key;
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
  for(const [key,archived] of [['inProgress',false],['pastTransports',true]] as const) {
   table(section(key),inquiries.filter(row=>['completed','cancelled'].includes(String(row.status))===archived),inquiryColumns,(parent,row)=>{
    if(row.status==='offer_sent') link(parent,'#offers','nextAction');
    const order=orders.find(order=>order.inquiry_id===row.id);
    if(order && conversations.some(chat=>chat.order_id===order.id)) chatLink(parent,order.id);
    questionPanel(parent,String(row.id),true,false);
   });
  }
  table(section('offers'),related(quotes.filter(row=>row.opportunity_id===null && row.status!=='draft')),quoteColumns,(parent,row)=>{
   if(row.status!=='sent') return;
   parent.append(el('p',labels.acceptHelp));
   action(parent,'accept',[],async()=>{await rpc('accept_customer_offer',{p_quote:row.id});});
  });
  table(section('orders'),related(orders),orderColumns,(parent,row)=>chatLink(parent,row.id));
  table(section('history'),related(history),historyColumns);
 }

 const dealColumns:Columns=[
  ['reference','reference'],['cargo_category','cargo'],['pickup_region','origin'],['delivery_region','destination'],
  ['status','status'],['carrier_minor','quickDealPrice'],['currency','currency'],['expires_at','valid']
 ];
 const dealDetails:Columns=[
  ['pickup_window','origin'],['delivery_window','destination'],['vehicle_requirements','quickDealVehicle'],
  ['weight_kg','quickDealWeight'],['dimensions','quickDealDimensions'],['vat_treatment','vat'],
  ['conditions','quickDealConditions'],['eligibility_requirements','quickDealRequirements']
 ];
 function showDealDetails(parent:HTMLElement,row:Row) {
  const details=el('details');
  details.append(el('summary',labels.details));
  const list=el('dl');
  for(const [key,label] of dealDetails) {
   list.append(el('dt',text(label)),el('dd',cell(key,row[key])));
  }
  details.append(list);
  parent.append(details);
 }

 async function carrierDeals() {
  const deals=await rpc('list_quick_deals',{}) as Row[];
  const panel=section('quickDeals');
  panel.append(el('p',labels.quickDealHelp));
  const listings=el('div');
  form(panel,[field('status','status',{options:options(['all','available','acceptance_requested','reserved'])})],
   labels.search,async data=>display(read(data,'status')));
  panel.append(listings);
  display('all');
  function display(status:string) {
   listings.replaceChildren();
   table(listings,deals.filter(row=>status==='all' || row.status===status),dealColumns,(parent,row)=>{
    showDealDetails(parent,row);
    const questions=el('details');
    questions.append(el('summary',labels.questions));
    form(questions,[],labels.details,async()=>{
     const inquiry=await rpc('quick_deal_load',{p_deal:row.id}) as string|null;
     if(!inquiry) throw new Error(labels.error);
     questions.replaceChildren(el('summary',labels.questions));
     renderQuestions(questions,inquiry,false,true);
    });
    parent.append(questions);
    if(['available','reserved','acceptance_requested'].includes(String(row.status))) {
     showFee(parent,Number(row.carrier_minor),String(row.currency),carrierPlan);
     action(parent,row.has_requested ? 'acceptFeeTerms' : 'quickDealRequest',[acceptTerms],async()=>{
      await rpc('request_quick_deal',{p_deal:row.id,p_amount:row.carrier_minor,p_currency:row.currency,p_plan:carrierPlan});
     });
    }
   });
  }
 }

 function draftDeal(parent:HTMLElement,inquiry:Row) {
  parent.append(el('p',labels.quickDealSafeSummary));
  action(parent,'quickDealCreate',[
   field('p_category','cargo',{max:120}),field('p_pickup_region','origin',{max:120}),field('p_delivery_region','destination',{max:120}),
   field('pickupStart','quickDealPickupFrom',{type:'date'}),field('pickupEnd','quickDealPickupTo',{type:'date'}),
   field('deliveryStart','quickDealDeliveryFrom',{type:'date'}),field('deliveryEnd','quickDealDeliveryTo',{type:'date'}),
   field('p_vehicle','quickDealVehicle',{max:500}),field('p_weight_kg','quickDealWeight',{type:'number',min:.01,max:1000000,step:.01}),
   field('p_dimensions','quickDealDimensions',{max:500}),field('p_carrier_minor','quickDealPrice',{type:'number',min:1}),
   field('p_currency','currency',{options:options(['EUR','CHF','GBP'])}),field('p_vat','vat'),
   field('p_conditions','quickDealConditions',{type:'textarea',max:1500,optional:true}),
   field('p_requirements','quickDealRequirements',{type:'textarea',max:1500}),field('p_expires_at','valid',{type:'datetime-local'})
  ],async data=>{
   const args=Object.fromEntries([...data].filter(([key])=>key.startsWith('p_')));
   await rpc('draft_quick_deal',{
    ...args,p_inquiry:inquiry.id,p_expires_at:new Date(read(data,'p_expires_at')).toISOString(),
    p_weight_kg:Number(read(data,'p_weight_kg')),p_carrier_minor:Number(read(data,'p_carrier_minor')),
    p_pickup:'['+read(data,'pickupStart')+','+read(data,'pickupEnd')+']',
    p_delivery:'['+read(data,'deliveryStart')+','+read(data,'deliveryEnd')+']'
   });
  });
 }

 function manageDeal(parent:HTMLElement,deal:Row,order:Row|undefined,partners:[string,string][]) {
  table(parent,[deal],dealColumns);
  showDealDetails(parent,deal);
  if(!['draft','available','acceptance_requested','reserved'].includes(String(deal.status))) return;
  parent.append(el('p',labels.quickDealHelp));
  if(deal.status==='reserved') {
   const carrier=partners.find(([id])=>id===deal.reserved_partner)?.[1];
   if(carrier) parent.append(el('p',carrier+' · '+cell('reserved_until',deal.reserved_until)));
  }
  if(deal.status==='draft') {
   action(parent,'quickDealPublish',[],async()=>{await rpc('publish_quick_deal',{p_deal:deal.id});});
  }
  if(partners.length) action(parent,'quickDealAttest',[
   field('partner','partner',{options:partners}),field('until','valid',{type:'datetime-local'})
  ],async data=>{
   await rpc('attest_quick_deal_eligibility',{p_deal:deal.id,p_partner:read(data,'partner'),
    p_eligible_until:new Date(read(data,'until')).toISOString()});
  });
  if(deal.status!=='draft') {
   const requests=el('div');
   form(parent,[],labels.quickDealRequests,async()=>{
    const candidates=await rpc('quick_deal_requests',{p_deal:deal.id}) as Row[];
    requests.replaceChildren();
    table(requests,candidates,[['company_name','company'],['eligible_until','valid'],['requested_at','date']],(cell,row)=>{
     action(cell,'quickDealReserve',[],async()=>{await rpc('reserve_quick_deal',{p_deal:deal.id,p_partner:row.partner_id});});
    });
   });
   parent.append(requests);
  }
  if(deal.status==='reserved' && order) {
   action(parent,'quickDealAssign',[field('instructions','instructions',{type:'textarea',max:4000})],async data=>{
    await rpc('assign_quick_deal',{p_deal:deal.id,p_order:order.id,p_instructions:read(data,'instructions'),p_contract_confirmed:true});
   });
  }
  action(parent,'quickDealCancel',[],async()=>{await rpc('cancel_quick_deal',{p_deal:deal.id});});
 }

 async function carrier() {
  const [applications,companies,opportunities,quotes,assignments,orders,history]=await Promise.all([
   unwrapQuery('partner_applications','id,state','applicant_id',userId),
   unwrapQuery('companies','name,services,coverage','owner_id',userId),
   unwrapQuery('transport_opportunities','id,inquiry_id,summary,open','partner_id',userId),
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
  carrierPlan=String(await rpc('my_carrier_plan',{}));
  if(quickDeal) await carrierDeals();
  const submitted=quotes.filter(row=>opportunities.some(opportunity=>opportunity.id===row.opportunity_id));
  table(section('opportunities'),opportunities.filter(row=>row.open),[['id','reference'],['summary','description']],(parent,row)=>{
   questionPanel(parent,String(row.inquiry_id),false,true);
   if(!submitted.some(quote=>quote.opportunity_id===row.id)) {
    const details=el('details');
    details.append(el('summary',labels.submit));
    const quote=form(details,[...amountFields,acceptTerms],labels.submit,async data=>{
     await rpc('submit_carrier_quote',{p_opportunity:row.id,...money(data),p_plan:carrierPlan});
     await refresh();
    });
    const preview=el('div');
    preview.setAttribute('aria-live','polite');
    quote.querySelector('label.portal-checkbox')?.before(preview);
    const updatePreview=()=>{
     const data=new FormData(quote);
     preview.replaceChildren();
     if(Number(read(data,'p_amount'))>0) showFee(preview,Number(read(data,'p_amount')),read(data,'p_currency'),carrierPlan);
    };
    quote.addEventListener('input',updatePreview);
    parent.append(details);
   }
  });
  table(section('offers'),submitted,[['opportunity_id','opportunities'],...quoteColumns.slice(1)]);
  table(section('assignments'),assignments,[['order_id','orders'],['instructions','instructions']],(parent,row)=>{
   const order=orders.find(order=>order.id===row.order_id);
   if(!order) return;
   chatLink(parent,order.id);
   questionPanel(parent,String(order.inquiry_id),false,false);
   const current=history.find(item=>item.inquiry_id===order.inquiry_id)?.status;
   if(current) parent.append(el('p',labels.status+' · '+text(String(current))));
   const next=partnerSteps[String(current)];
   if(next) action(parent,'update',[field('next','status',{options:options([next])})],async data=>{
    await rpc('advance_transport',{p_inquiry:order.inquiry_id,p_next:read(data,'next')});
   });
  });
 }

 async function manager() {
  const [inquiries,applications,companies,quotes,costs,orders,notes,financials,stats,deletions,quickDeals]=await Promise.all([
   rows('transport_inquiries','id,reference,origin,destination,status,contact_email,contact_name,description,archived_at,customer_id'),
   rows('partner_applications','id,applicant_id,state'),
   rows('companies','owner_id,name,services,coverage'),
   rows('transport_quotes','id,inquiry_id,opportunity_id,status,amount_minor,currency,vat_treatment,valid_until'),
   rows('quote_costs','quote_id,carrier_minor,expenses_minor'),
   rows('transport_orders','id,inquiry_id'),
   rows('internal_notes','inquiry_id,body,created_at'),
   rpc('manager_financials',{}),
   rpc('manager_counts',{}),
   rows('account_deletion_requests','user_id,created_at'),
   quickDeal ? rpc('list_quick_deals',{}) as Promise<Row[]> : []
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
    if(row.applicant_id && row.state==='approved') action(parent,'setPlan',[
     field('plan','feePlan',{options:options(['free','basic','pro'])})
    ],async data=>{await rpc('set_carrier_plan',{p_partner:row.applicant_id,p_plan:read(data,'plan')});});
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
    questionPanel(details,String(row.id),true,false);
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
    const order=orders.find(order=>order.inquiry_id===row.id);
    const deal=quickDeals.find(deal=>deal.reference===row.reference);
    const activeDeal=deal && ['available','acceptance_requested','reserved'].includes(String(deal.status));
    if(deal) manageDeal(details,deal,order,partnerOptions);
    if(!deal && current==='awaiting_carrier_offer') {
     const countries=new Intl.DisplayNames([document.documentElement.lang],{type:'region'});
     const countryOptions=['SI','AT','DE','IT','HR','HU','FR','NL','BE','CH','GB','PL','CZ','SK']
      .map(code=>[code,countries.of(code) ?? code] as [string,string]);
     action(details,'publishLoad',[
      field('visibility','publishChoice',{options:options(['privateListing','publicListing'])}),
      field('category','cargo',{options:options(['vehicle','pallet','cargo','moving','express','special'])}),
      field('origin','origin',{options:countryOptions}),field('destination','destination',{options:countryOptions}),
      field('test','listingType',{options:options(['testListing','liveListing'])})
     ],async data=>{
      await rpc('publish_load',{p_inquiry:row.id,p_category:read(data,'category'),p_origin:read(data,'origin'),
       p_destination:read(data,'destination'),p_test:read(data,'test')==='testListing',p_published:read(data,'visibility')==='publicListing'});
     });
     if(quickDeal) draftDeal(details,row);
    }
    if(order && partnerOptions.length && ['customer_accepted','carrier_assigned','scheduled'].includes(current)) {
     action(details,'proposeFeeTerms',[field('partner','partner',{options:partnerOptions})],async data=>{
      await rpc('propose_carrier_fee_terms',{p_order:order.id,p_partner:read(data,'partner')});
     });
     if(['carrier_assigned','scheduled'].includes(current)) action(details,'replaceCarrier',[
      field('partner','partner',{options:partnerOptions}),field('instructions','instructions',{type:'textarea',max:4000}),
      field('reason','reason',{max:500})
     ],async data=>{await rpc('replace_transport_carrier',{p_order:order.id,p_partner:read(data,'partner'),
      p_instructions:read(data,'instructions'),p_reason:read(data,'reason')});});
    }
    if(current==='awaiting_carrier_offer') {
     if(partnerOptions.length && !activeDeal) action(details,'invite',[
      field('partner','partner',{options:partnerOptions}),field('summary','description',{type:'textarea',max:1500})
     ],async data=>{await rpc('invite_partner',{p_inquiry:row.id,p_partner:read(data,'partner'),p_summary:read(data,'summary')});});
     action(details,'prepare',[...amountFields,field('carrier','carrierCost',{type:'number'}),field('expenses','expenses',{type:'number'})],async data=>{
      await rpc('prepare_customer_offer',{p_inquiry:row.id,...money(data),p_carrier:Number(read(data,'carrier')),p_expenses:Number(read(data,'expenses'))});
     });
    }
    if(current==='customer_accepted' && order && partnerOptions.length && !activeDeal) {
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


 let carrierPlan='free';
 let conversations:Row[]=[];
 const acceptTerms=field('accepted','acceptFeeTerms',{type:'checkbox'});
 const link=(parent:HTMLElement,href:string,label:string)=>{
  const anchor=el('a',text(label));
  anchor.href=href;
  parent.append(anchor);
  return anchor;
 };
 function chatLink(parent:HTMLElement,orderId:Row[string]) {
  const chat=conversations.find(row=>row.order_id===orderId);
  if(chat) link(parent,'#chat-'+chat.id,'chat');
 }
 function showFee(parent:HTMLElement,amount:number,currency:string,plan:string) {
  if(!Number.isSafeInteger(amount) || !['EUR','CHF','GBP'].includes(currency)) return;
  const rate=({free:10,basic:7,pro:5} as Record<string,number>)[plan];
  if(!rate) return;
  const fee=Math.floor((amount*rate+50)/100);
  const format=new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency});
  parent.append(el('p',[
   text(plan)+' · '+rate+' %',labels.feeBase+' '+format.format(amount/100),
   labels.feeAmount+' '+format.format(fee/100),labels.feeNet+' '+format.format((amount-fee)/100)
  ].join(' · ')));
 }
 function questionPanel(parent:HTMLElement,inquiry:string,canReply:boolean,canAsk:boolean) {
  const details=el('details');
  details.append(el('summary',labels.questions));
  parent.append(details);
  renderQuestions(details,inquiry,canReply,canAsk);
 }
 function renderQuestions(parent:HTMLElement,inquiry:string,canReply:boolean,canAsk:boolean) {
  const contents=el('div');
  const askPanel=el('div');
  askPanel.hidden=true;
  form(parent,[],labels.refreshQuestions,async()=>{
   const [questions,publication]=await Promise.all([
    rpc('list_load_questions',{p_inquiry:inquiry}) as Promise<Row[]>,
    rpc('load_publication',{p_inquiry:inquiry}) as Promise<string|null>
   ]);
   contents.replaceChildren();
   askPanel.hidden=Boolean(publication);
   if(publication) link(contents,loadUrl+'?id='+publication,'publicListing');
   if(!questions.length) contents.append(el('p',labels.empty));
   for(const row of questions) {
    const record=el('article');
    record.append(el('h3',String(row.question)));
    if(row.answer) record.append(el('p',String(row.answer)));
    if(canReply && !row.hidden) {
     if(row.public_submission) record.append(el('p',labels.publicQuestionHelp));
     action(record,'reply',[field('body','answer',{type:'textarea',max:1500})],async data=>{
      await rpc('answer_load_question',{p_question:row.id,p_body:read(data,'body')});
     });
    }
    if(page==='manager') {
     const choices=['hideQuestion',...(row.public_submission ? ['publishQuestion'] : []),
      ...(row.public_submission && row.question_public && row.answer ? ['publishAnswer'] : [])];
     action(record,'moderation',[field('moderation','moderation',{options:options(choices)})],async data=>{
      await rpc('moderate_load_question',{p_question:row.id,p_action:read(data,'moderation')});
     });
    }
    contents.append(record);
   }
  });
  parent.append(contents);
  if(canAsk) {
   askPanel.append(el('p',labels.privateQuestionHelp));
   const result=el('p');
   result.setAttribute('role','status');
   const ask=form(askPanel,[field('body','question',{type:'textarea',max:1000})],labels.ask,async data=>{
    await rpc('ask_load_question',{p_load:inquiry,p_public:false,p_body:read(data,'body')});
    ask.reset();
    result.textContent=labels.questionReceived;
   });
   askPanel.append(result);
   parent.append(askPanel);
  }
 }
 function chatPanel() {
  const panel=section('chat');
  if(!conversations.length) panel.append(el('p',labels.empty));
  for(const row of conversations) {
   const details=el('details');
   details.id='chat-'+row.id;
   details.append(el('summary',String(row.reference)));
   panel.append(details);
   const log=el('div');
   log.dataset.chatLog='';
   log.setAttribute('role','log');
   log.tabIndex=0;
   details.append(log);
   const load=async()=>{
    const response=await client.from('transport_messages').select('body,created_at,sender_id')
     .eq('conversation_id',row.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
    const messages=unwrap(response) as Row[];
    log.replaceChildren();
    if(!messages.length) log.append(el('p',labels.empty));
    for(const message of messages.reverse()) log.append(el('p',
     text(message.sender_id===userId ? 'you' : 'participant')+' · '+cell('created_at',message.created_at)+'\n'+message.body));
    log.scrollTop=log.scrollHeight;
   };
   form(details,[],labels.refreshMessages,load);
   details.addEventListener('toggle',()=>{
    if(details.open) void load().catch(()=>log.replaceChildren(el('p',labels.error)));
   });
   let pending:{body:string;id:string}|undefined;
   const composer=form(details,[field('body','message',{type:'textarea',max:4000})],labels.sendMessage,async data=>{
    const message=read(data,'body').trim();
    if(pending?.body!==message) pending={body:message,id:crypto.randomUUID()};
    await rpc('send_transport_message',{p_conversation:row.id,p_request:pending.id,p_body:message});
    composer.reset();
    pending=undefined;
    await load();
   });
  }
 }
 async function feesPanel() {
  const panel=section('fees');
  panel.append(el('p',labels.feesHelp));
  if(page==='carrier') {
   const terms=await rows('carrier_fee_terms','id,order_id,plan,amount_minor,currency,accepted_at');
   panel.append(el('p',labels.feePlan+' · '+text(carrierPlan)));
   table(panel,terms.map(row=>({...row,status:row.accepted_at?'confirmedTerms':'pendingTerms'})),
    [['order_id','reference'],['status','status']],(parent,row)=>{
     showFee(parent,Number(row.amount_minor),String(row.currency),String(row.plan));
     if(!row.accepted_at) action(parent,'acceptFeeTerms',[acceptTerms],async()=>{
      await rpc('confirm_carrier_fee_terms',{p_terms:row.id,p_amount:row.amount_minor,p_currency:row.currency,p_plan:row.plan});
     });
    });
  }
  const target=el('div');
  const month=new Date().toISOString().slice(0,7);
  const load=async(value:string)=>{
   const start=new Date(value+'-01T00:00:00Z');
   const end=new Date(start);
   end.setUTCMonth(end.getUTCMonth()+1);
   const entries:Row[]=[];
   for(let first=0;;first+=100) {
    const batch=unwrap(await client.from('carrier_fees')
     .select('id,order_id,reference,plan,rate,base_minor,fee_minor,currency,created_at,voided_at,void_reason')
     .gte('created_at',start.toISOString()).lt('created_at',end.toISOString())
     .order('created_at',{ascending:false}).order('id').range(first,first+99)) as Row[];
    entries.push(...batch);
    if(batch.length<100) break;
   }
   target.replaceChildren();
   if(!entries.length) target.append(el('p',labels.empty));
   for(const entry of entries) {
    const card=el('article');
    card.append(el('h3',String(entry.reference)));
    const format=new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:String(entry.currency),currencyDisplay:'code'});
    card.append(el('p',[text(String(entry.plan)),entry.rate+' %',labels.feeBase+' '+format.format(Number(entry.base_minor)/100),
     labels.feeAmount+' '+format.format(Number(entry.fee_minor)/100)].join(' · ')));
    card.append(el('p',text(entry.voided_at?'feeVoided':'feeRecorded')+' · '+cell('created_at',entry.created_at)));
    if(entry.void_reason) card.append(el('p',labels.reason+' · '+entry.void_reason));
    if(page==='manager' && !entry.voided_at) {
     const order=await client.from('transport_orders').select('transport_inquiries(status)').eq('id',entry.order_id).maybeSingle();
     const inquiry=unwrap(order)?.transport_inquiries as unknown as {status:string}|null;
     if(inquiry?.status==='cancelled') action(card,'voidFee',[field('reason','reason',{max:500})],async data=>{
      await rpc('void_carrier_fee',{p_fee:entry.id,p_reason:read(data,'reason')});
     });
    }
    target.append(card);
   }
  };
  form(panel,[field('month','feeMonth',{type:'month',value:month})],labels.search,async data=>load(read(data,'month')));
  panel.append(target);
  await load(month);
 }
 function focusChat() {
  const id=window.location.hash.slice(1);
  if(!id.startsWith('chat-')) return;
  const details=document.getElementById(id);
  if(details instanceof HTMLDetailsElement) {
   details.open=true;
   details.scrollIntoView({block:'start'});
   details.querySelector('summary')?.focus({preventScroll:true});
  }
 }
 window.addEventListener('hashchange',focusChat);

 async function unwrapQuery(table:string,columns:string,key:string,value:string) {
  return unwrap(await client.from(table).select(columns).eq(key,value).order('created_at',{ascending:false}).limit(100)) as unknown as Row[];
 }

 async function refresh() {

  body.replaceChildren();
  show(labels.working);
  try {
   if(page!=='manager') conversations=await rows('transport_conversations','id,order_id,reference');
   if(page==='customer') await customer();
   if(page==='carrier') await carrier();
   if(page==='manager') await manager();
   if(page!=='manager') chatPanel();
   if(page==='manager' || (page==='carrier' && await rpc('my_carrier_plan',{}))) await feesPanel();
   const notifications=await unwrapQuery('notifications','id,event,read_at,created_at,conversation_id','recipient_id',userId);
   table(section('notifications'),notifications,[['event','notifications'],['created_at','date']],(parent,row)=>{
    const chat=conversations.find(item=>item.id===row.conversation_id);
    if(chat) link(parent,'#chat-'+chat.id,String(chat.reference));
    if(!row.read_at) action(parent,'markRead',[],async()=>{await rpc('mark_notification_read',{p_notification:row.id});});
   });
   const nav=el('nav');
   nav.setAttribute('aria-label',labels.overview);
   for(const article of body.querySelectorAll<HTMLElement>(':scope > article[id]')) link(nav,'#'+article.id,article.id);
   body.prepend(nav);
   show('');
   focusChat();
  } catch {
   show(labels.error);
  }
 }
 await refresh();
}
