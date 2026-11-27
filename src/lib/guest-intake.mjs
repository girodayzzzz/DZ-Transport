import {cargo,cargoItem,companyFields,countries,customer,grouping,location,oversized,partner,recurringFields,regulated,schedule} from './form-schema.mjs';
import {cargoTotals,phoneValid,scheduleError} from './form-core.mjs';

const record = value => value && typeof value === 'object' && !Array.isArray(value);
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
 Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

function checked(fields,input,numeric=false) {
 if (!record(input)) throw new Error('Invalid section');
 return Object.fromEntries(fields.flatMap(({key,type,required,options}) => {
  const value = input[key];
  if (value === undefined || value === '') {
   if (required) throw new Error('Missing field');
   return [];
  }
  if (type === 'checkbox') {
   if (typeof value !== 'boolean') throw new Error('Invalid field');
  } else if (['number','integer','floor','year'].includes(type)) {
   const number = Number(value);
   const min = type==='year' ? 1886 : type==='floor' ? -20 : type==='number' ? 0.01 : 1;
   const max = type==='year' ? new Date().getUTCFullYear()+1 : type==='floor' ? 200 : 1000000;
   if (typeof value !== (numeric ? 'number' : 'string') || !Number.isFinite(number) ||
       number<min || number>max || (type!=='number' && !Number.isInteger(number))) throw new Error('Invalid number');
  } else if (typeof value !== 'string' || value.trim() !== value || value.length > (type==='textarea' ? 1500 : 254) ||
      (type==='select' && !options.some(option=>option[0]===value)) ||
      (type==='country' && !countries.includes(value)) ||
      (type==='date' && !validDate(value)) ||
      (type==='email' && !email(value)) ||
      (type==='tel' && !phoneValid(value))) {
   throw new Error('Invalid field');
  }
  return [[key,value]];
 }));
}

export function validateGuestInquiry(input,now=new Date()) {
 if (!record(input) || input.kind!=='inquiry' || typeof input.reference!=='string' || !/^DZT-\d{8}-[A-Z0-9]{6}$/.test(input.reference ?? '') ||
     !['sl','en','de'].includes(input.language) || typeof input.transportCategory!=='string' ||
     !Object.hasOwn(grouping,input.transportCategory)) throw new Error('Invalid inquiry');
 const type = grouping[input.transportCategory];
 const contact = checked(customer,input.contact);
 if (input.customerType !== contact.customerType) throw new Error('Invalid contact');
 if (contact.customerType==='business') {
  Object.assign(contact,checked(companyFields,input.contact));
  if (contact.businessPattern==='recurring') Object.assign(contact,checked(recurringFields,input.contact));
 }
 const pickup=checked(location('pickup'),input.pickup);
 const delivery=checked(location('delivery'),input.delivery);
 const goods=checked([...cargo[type],regulated,oversized],input.cargo);
 if(input.transportCategory==='nonRunning' && goods.running==='yes') throw new Error('Invalid cargo');
 if(['general','pallet'].includes(type)) {
  if(!Array.isArray(input.cargo.items) || input.cargo.items.length<1 || input.cargo.items.length>20) throw new Error('Invalid items');
  goods.items=input.cargo.items.map(item=>checked(cargoItem,item,true));
  Object.assign(goods,cargoTotals(goods.items));
 }
 const timing=checked(schedule,input.schedule);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Ljubljana'}).format(now);
 if(scheduleError(timing.pickupDate,timing.deliveryDate,today,timing.flexible===true)) throw new Error('Invalid dates');
 if (!record(input.additionalRequirements) || input.additionalRequirements.privacy!==true ||
     typeof input.additionalRequirements.marketing!=='boolean') throw new Error('Missing privacy acknowledgment');
 return {
  reference:input.reference,language:input.language,transportCategory:input.transportCategory,contact,pickup,delivery,
  cargo:{type,...goods},schedule:timing,additionalRequirements:{privacy:true,marketing:input.additionalRequirements.marketing,
   manualAssessment:goods.regulated==='yes' || goods.oversized==='yes' || type==='machinery'}
 };
}

export function validateGuestPartner(input) {
 if (!record(input) || input.kind!=='partner' || typeof input.reference!=='string' ||
     !/^DZT-\d{8}-[A-Z0-9]{6}$/.test(input.reference) || !['sl','en','de'].includes(input.language) ||
     !record(input.permission) || input.permission.privacy!==true) throw new Error('Invalid application');
 return {
  reference:input.reference,language:input.language,application:checked(partner,input.application),permission:{privacy:true}
 };
}
