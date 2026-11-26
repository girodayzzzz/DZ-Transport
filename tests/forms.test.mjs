import test from 'node:test';
import assert from 'node:assert/strict';
import { cargoTotals,emailDetails,endpoint,localDate,payload,phoneValid,reference,scheduleError,submit } from '../src/lib/form-core.mjs';
import {cargo, grouping, countries, types} from '../src/lib/form-schema.mjs';

test('each of the thirteen transport categories has the correct cargo schema',()=>{
 assert.equal(types.length,13);
 assert.deepEqual(types.map(([key])=>grouping[key]),['vehicle','vehicle','vehicle','pallet','general','moving','moving','machinery','general','vehicle','general','general','general']);
 for(const [,fields] of Object.entries(cargo)) assert.equal(fields.length,new Set(fields.map(field=>field.key)).size);
 for(const country of 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ')) assert.ok(countries.includes(country));
});

test('schedule rejects past dates and reversed ranges and allows flexibility',()=>{
 const today='2026-11-26';
 assert.equal(scheduleError('2026-11-25','',today),'pickupPast');
 assert.equal(scheduleError('','2026-11-25',today),'deliveryPast');
 assert.equal(scheduleError('2026-11-28','2026-11-27',today),'order');
 assert.equal(scheduleError(today,today,today),'');
 assert.equal(scheduleError('','',today,false),'datesRequired');
 assert.equal(scheduleError('','',today,true),'');
});

test('phone requires an international prefix with a valid digit count',()=>{
 assert.ok(phoneValid('+386 (40) 123-456'));
 for(const value of ['040123456','+012345678','+123','+1234567890123456','+386oops']) assert.equal(phoneValid(value),false);
});

test('client reference uses local date and six uppercase alphanumeric characters',()=>{
 const now=new Date(2026,10,26,12);
 assert.equal(localDate(now),'2026-11-26');
 assert.match(reference(now),/^DZT-20261126-[A-Z0-9]{6}$/);
});

test('a missing endpoint, credentials, and plaintext transport are rejected',()=>{
 for(const value of ['','file:///tmp/a','http://example.com','https://user:token@example.com/f']) assert.equal(endpoint(value),'');
 assert.equal(endpoint('https://formspree.io/f/example'),'https://formspree.io/f/example');
});

test('structured inquiry payload flags manual assessment and retains separate permissions',()=>{
 const result=payload({kind:'inquiry',language:'sl'},{customer:{name:'Example'},pickup:{pickupCountry:'SI'},delivery:{deliveryCountry:'DE'},cargo:{year:'2019'},schedule:{urgent:false},permission:{privacy:true,marketing:false}},{transportCategory:'car',regulated:'yes',customerType:'private'});
 assert.equal(result.cargo.type,'vehicle');
 assert.equal(result.additionalRequirements.manualAssessment,true);
 assert.equal(result.additionalRequirements.marketing,false);
 assert.equal(result.pickup.pickupCountry,'SI');
});

test('transport partners use a separate structure',()=>{
 assert.deepEqual(payload({kind:'partner'},{application:{company:'Example'},permission:{privacy:true}},{}),{kind:'partner',application:{company:'Example'},permission:{privacy:true}});
});

test('provider confirmation requires an explicit JSON receipt and rejects mismatches',async()=>{
 const url='https://example.com';
 const data={reference:'DZT-20261126-ABC123'};
 for (const status of [400,429,500]) {
  assert.equal(await submit(url,data,async()=>Response.json({ok:false},{status})),false);
 }
 assert.equal(await submit(url,data,async()=>new Response('<html>')),false);
 assert.equal(await submit(url,data,async()=>Response.json({ok:false})),false);
 assert.equal(await submit(url,data,async()=>Response.json({ok:true,reference:'different'})),false);
 assert.equal(await submit(url,data,async(_,options)=>{
  assert.equal(options.method,'POST');
  assert.equal(options.credentials,'omit');
  assert.equal(JSON.parse(options.body).reference,data.reference);
  return Response.json({ok:true,reference:data.reference});
 }),true);
 await assert.rejects(()=>submit(url,data,async()=>{throw new TypeError('Network error');}));
 await assert.rejects(()=>submit(url,data,async(_,options)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(resolve,100);
  options.signal.addEventListener('abort',()=>{
   clearTimeout(timer);
   reject(options.signal.reason);
  });
 }),5),{name:'TimeoutError'});
});

test('mixed units and multiple cargo quantities are included in totals',()=>{
 const items=[
  {quantity:3,length:120,width:80,height:50,dimensionUnit:'cm',unitWeightKg:50},
  {quantity:2,length:2,width:1,height:1,dimensionUnit:'m',unitWeightKg:11}
 ];
 const totals=cargoTotals(items);
 assert.equal(totals.weightKg,172);
 assert.ok(Math.abs(totals.volumeM3-5.44)<1e-12);
 assert.deepEqual(cargoTotals([{...items[0],quantity:0},{...items[1],length:NaN}]),{weightKg:0,volumeM3:0});
});

test('intake email includes the reference, route, cargo and review flag',()=>{
 const data=payload({kind:'inquiry',language:'de',reference:'DZT-20261126-ABC123'},
  {pickup:{pickupCountry:'SI'},delivery:{deliveryCountry:'DE'},cargo:{},permission:{privacy:true}}, {transportCategory:'machinery'});
 const email=emailDetails(data);
 for (const text of ['DZT-20261126-ABC123','language: de','Pickup address','Delivery address','category: machinery','manualAssessment: true']) assert.ok(email.includes(text));
});
