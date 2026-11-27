import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGuestInquiry} from '../src/lib/guest-intake.mjs';
import {onRequest} from '../functions/api/inquiry.js';
import {portalConfiguration} from '../src/lib/portal-config.mjs';

const fixture=()=>({
 kind:'inquiry',reference:'DZT-20261126-ABC123',language:'sl',transportCategory:'pallet',customerType:'private',
 contact:{customerType:'private',name:'Test Applicant',email:'guest@example.invalid',phone:'+38640123456',contactMethod:'email'},
 pickup:{pickupCountry:'SI',pickupCity:'Ljubljana',pickupPostal:'1000',pickupSiteType:'commercial'},
 delivery:{deliveryCountry:'DE',deliveryCity:'Berlin',deliveryPostal:'10115',deliverySiteType:'commercial'},
 cargo:{palletType:'eur',stackable:'yes',loadingEquipmentAvailable:'yes',tailLift:'no',oversized:'no',regulated:'no',
  items:[{quantity:2,length:100,width:100,height:100,dimensionUnit:'cm',unitWeightKg:100}],weightKg:8},
 schedule:{flexible:true,urgent:false},
 additionalRequirements:{privacy:true,marketing:false}
});
const now=new Date('2026-11-26T13:00:00Z');
test('guest intake verifies each section and recalculates item totals',()=>{
 const result=validateGuestInquiry({...fixture(),role:'admin',inquiryDetails:'Untrusted summary'},now);
 assert.equal(result.cargo.weightKg,200);
 assert.equal(result.cargo.volumeM3,2);
 assert.equal(result.role,undefined);
 assert.equal(result.inquiryDetails,undefined);
 for(const corrupt of [
  data=>{data.cargo.items[0].quantity=-1;},
  data=>{data.pickup.pickupCountry='XX';},
  data=>{data.contact.email='invalid';},
  data=>{data.cargo.items[0].length=null;},
  data=>{data.additionalRequirements.privacy=false;},
  data=>{data.schedule.pickupDate='2026-02-30';},
  data=>{data.reference='not-a-reference';}
 ]) {
  const data=fixture();
  corrupt(data);
  assert.throws(()=>validateGuestInquiry(data,now));
 }
});

test('guest endpoint requires approved origin, Turnstile and a confirmed database receipt',async t=>{
 const origin='https://transport.example';
 const env={
  DZ_GUEST_INTAKE:'true',DZ_SITE_ORIGIN:origin,TURNSTILE_SECRET:'test',DZ_IP_HASH_KEY:'x'.repeat(32),
  SUPABASE_URL:'https://test-ref.supabase.co',SUPABASE_SECRET_KEY:'stub'
 };
 const request=(override={})=>new Request(origin+'/api/inquiry',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.12',...override},
  body:JSON.stringify({...fixture(),turnstileToken:'test-turnstile-token'})
 });
 assert.equal((await onRequest({request:request(),env:{}})).status,404);
 assert.equal((await onRequest({request:request(),env:{...env,DZ_SITE_ORIGIN:''}})).status,404);
 assert.equal((await onRequest({request:request({Origin:'https://invalid.example'}),env})).status,403);
 let outcome='invalid';
 let databaseCalls=0;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  if(url.includes('siteverify')) return Response.json({success:outcome!=='invalid',hostname:new URL(origin).hostname,action:'guest-inquiry'});
  databaseCalls++;
  const payload=JSON.parse(options.body);
  assert.match(payload.p_network,/^[0-9a-f]{64}$/);
  assert.equal(payload.p_payload.turnstileToken,undefined);
  if(outcome==='failure') return Response.json({code:'P0002'},{status:400});
  if(outcome==='missingReceipt') return Response.json(null);
  return Response.json('12345678-1234-1234-1234-123456789abc');
 });
 assert.equal((await onRequest({request:request(),env})).status,403);
 assert.equal(databaseCalls,0);
 outcome='failure';
 assert.equal((await onRequest({request:request(),env})).status,429);
 outcome='missingReceipt';
 assert.equal((await onRequest({request:request(),env})).status,503);
 outcome='success';
 assert.deepEqual(await (await onRequest({request:request(),env})).json(),{ok:true,reference:'DZT-20261126-ABC123'});
});

test('portal stays disabled in preview and rejects secret or placeholder keys',()=>{
 const vars={PUBLIC_DZ_PORTAL:'true',PUBLIC_SUPABASE_URL:'https://test-ref.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_invalid'};
 assert.equal(portalConfiguration(vars,false),null);
 assert.throws(()=>portalConfiguration(vars,true),/publishable key/);
 vars.PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 assert.equal(portalConfiguration(vars,true).manager,false);
});

test('guest partner handler validates the public form and uses the partner Turnstile action',async t=>{
 const {onRequest:submitPartner}=await import('../functions/api/partner-application.js');
 const {partner}=await import('../src/lib/form-schema.mjs');
 const origin='https://transport.example';
 const env={
  DZ_GUEST_PARTNER_INTAKE:'true',DZ_SITE_ORIGIN:origin,TURNSTILE_SECRET:'fixture',DZ_IP_HASH_KEY:'x'.repeat(32),
  SUPABASE_URL:'https://test-ref.supabase.co',SUPABASE_SECRET_KEY:'fixture'
 };
 const application=Object.fromEntries(partner.filter(field=>field.required).map(field=>[field.key,
  ({country:'SI',email:'partner@example.invalid',tel:'+38640123456'})[field.type] || 'Fixture']));
 const input={kind:'partner',reference:'DZT-20261127-TEST01',language:'de',application,
  permission:{privacy:true},turnstileToken:'fixture',role:'admin'};
 const request=(patch={})=>new Request(origin+'/api/partner-application',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.12'},
  body:JSON.stringify({...input,...patch})
 });
 let action='guest-inquiry';
 let databaseCalls=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('siteverify')) return Response.json({success:true,hostname:new URL(origin).hostname,action});
  databaseCalls++;
  assert.match(url,/ingest_guest_partner$/);
  const data=JSON.parse(options.body);
  assert.deepEqual(data.p_payload,{reference:input.reference,language:'de',application,permission:{privacy:true}});
  return Response.json('12345678-1234-1234-1234-123456789abc');
 });
 assert.equal((await submitPartner({request:request(),env:{...env,DZ_GUEST_PARTNER_INTAKE:false}})).status,404);
 assert.equal((await submitPartner({request:request({permission:{privacy:false}}),env})).status,400);
 assert.equal((await submitPartner({request:request(),env})).status,403);
 assert.equal(databaseCalls,0);
 action='guest-partner';
 assert.deepEqual(await (await submitPartner({request:request(),env})).json(),{ok:true,reference:input.reference});
 assert.equal(databaseCalls,1);
});

test('V10 cargo fields are optional for older submissions and only accepted in their category',()=>{
 const data=fixture();
 const current={...data.cargo,unloadingEquipmentAvailable:'no',pickupCarryingHelp:'yes'};
 const pallet=validateGuestInquiry({...data,cargo:current},now);
 assert.equal(pallet.cargo.unloadingEquipmentAvailable,'no');
 assert.equal(pallet.cargo.pickupCarryingHelp,undefined);
 assert.equal(validateGuestInquiry(data,now).cargo.unloadingEquipmentAvailable,undefined);
 assert.throws(()=>validateGuestInquiry({...data,cargo:{...current,unloadingEquipmentAvailable:'unknown'}},now));

 const moving={...data,transportCategory:'moving',cargo:{
  propertyType:'Apartment',volumeM3:'6',itemCount:'8',floor:'2',elevator:'yes',loadingAssistance:'no',
  deliveryFloor:'0',deliveryElevator:'no',packing:'no',assembly:'no',disassembly:'no',regulated:'no',oversized:'no',
  pickupCarryingHelp:'no',deliveryCarryingHelp:'yes',unloadingEquipmentAvailable:'yes'
 }};
 const details=validateGuestInquiry(moving,now).cargo;
 assert.equal(details.pickupCarryingHelp,'no');
 assert.equal(details.deliveryCarryingHelp,'yes');
 assert.equal(details.unloadingEquipmentAvailable,undefined);
 delete moving.cargo.pickupCarryingHelp;
 delete moving.cargo.deliveryCarryingHelp;
 assert.equal(validateGuestInquiry(moving,now).cargo.deliveryCarryingHelp,undefined);
});
