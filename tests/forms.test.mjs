import test from 'node:test';
import assert from 'node:assert/strict';
import { endpoint,localDate,payload,phoneValid,reference,scheduleError,submit } from '../src/lib/form-core.mjs';
import {cargo, grouping, countries, types} from '../src/lib/form-schema.mjs';

test('each of the ten transport categories has the correct cargo schema',()=>{
 assert.equal(types.length,10);
 assert.deepEqual(types.map(([key])=>grouping[key]),['vehicle','vehicle','vehicle','pallet','general','moving','moving','machinery','general','general']);
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

test('HTTP rejection and network failure cannot return success',async()=>{
 assert.equal(await submit('https://example.com',{example:true},async(url,options)=>{
  assert.equal(options.method,'POST');
  assert.equal(options.credentials,'omit');
  assert.equal(JSON.parse(options.body).example,true);
  return {ok:false};
 }),false);
 assert.equal(await submit('https://example.com',{},async()=>({ok:true})),true);
 await assert.rejects(()=>submit('https://example.com',{},async()=>{throw new TypeError('Network error');}));
});
