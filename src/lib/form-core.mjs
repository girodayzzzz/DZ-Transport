import { grouping } from './form-schema.mjs';

export const localDate = (now = new Date()) => {
 const offset = now.getTimezoneOffset() * 60_000;
 return new Date(now.getTime() - offset).toISOString().slice(0,10);
};

export function scheduleError(pickup, delivery, today = localDate(), flexible = true) {
 if (pickup && pickup < today) return 'pickupPast';
 if (delivery && delivery < today) return 'deliveryPast';
 if (pickup && delivery && delivery < pickup) return 'order';
 if (!pickup && !delivery && !flexible) return 'datesRequired';
 return '';
}

export const phoneValid = phone => /^\+[1-9][\d ()-]*$/.test(phone.trim()) &&
 /^\+[1-9]\d{6,14}$/.test(phone.replace(/[ ()-]/g,''));

export function reference(now = new Date(), random = globalThis.crypto) {
 const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
 let suffix = '';
 while (suffix.length < 6) {
  for (const byte of random.getRandomValues(new Uint8Array(8))) {
   if (byte < 252 && suffix.length < 6) suffix += chars[byte % 36];
  }
 }
 return 'DZT-' + localDate(now).replaceAll('-','') + '-' + suffix;
}

export function endpoint(value) {
 if (!value) return '';
 try {
  const parsed = new URL(value);
  if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash && !parsed.search) return parsed.href;
 } catch {}
 return '';
}

export function cargoTotals(items) {
 return items.reduce((totals, item) => {
  const {quantity, length, width, height, unitWeightKg, dimensionUnit} = item;
  if (!['cm', 'm'].includes(dimensionUnit) || !Number.isSafeInteger(quantity) ||
      ![quantity,length,width,height,unitWeightKg].every(value => Number.isFinite(value) && value > 0)) return totals;
  const factor = dimensionUnit === 'm' ? 1 : 0.01;
  return {
   weightKg:totals.weightKg + quantity * unitWeightKg,
   volumeM3:totals.volumeM3 + quantity * (length * factor) * (width * factor) * (height * factor)
  };
 }, {weightKg:0, volumeM3:0});
}

export function payload(meta, sections, values) {
 if (meta.kind === 'partner') return {...meta,application:sections.application,permission:sections.permission};
 return {
  ...meta,customerType:values.customerType,transportCategory:values.transportCategory,
  contact:sections.customer,pickup:sections.pickup,delivery:sections.delivery,
  cargo:{type:grouping[values.transportCategory],...sections.cargo},
  schedule:sections.schedule,
  additionalRequirements:{manualAssessment:values.regulated === 'yes' || values.oversized === 'yes' || values.transportCategory === 'machinery',comments:values.comments || '',...sections.permission}
 };
}

export function emailDetails(data) {
 const section = (name, fields) => name + '\n' + Object.entries(fields || {}).map(([key,value]) =>
  key + ': ' + (typeof value === 'object' ? JSON.stringify(value) : String(value))
 ).join('\n');
 const header = section('Submission', {reference:data.reference, language:data.language, submittedAt:data.submittedAt});
 const blocks = data.kind === 'partner'
  ? [section('Partner application', data.application)]
  : [section('Transport', {category:data.transportCategory, customerType:data.customerType}),
     section('Customer', data.contact), section('Pickup address', data.pickup),
     section('Delivery address', data.delivery), section('Cargo', data.cargo),
     section('Schedule', data.schedule), section('Additional services and manual assessment', data.additionalRequirements)];
 return [header, ...blocks, ...(data.permission ? [section('Permissions', data.permission)] : [])].join('\n\n');
}

export async function submit(postTo, data, request = fetch, timeout = 18000) {
 const response = await request(postTo,{
  method:'POST',credentials:'omit',redirect:'error',
  headers:{Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify(data),
  signal:AbortSignal.timeout(timeout)
 });
 if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
 const receipt = await response.json();
 return receipt?.ok === true && (!('reference' in receipt) || receipt.reference === data.reference);
}

export function confirmationNext(copy,kind,contactMethod) {
 if(kind==='partner') return copy.partnerNext;
 if(contactMethod==='phone') return copy.phoneNext;
 if(contactMethod==='email') return copy.emailNext;
 return copy.inquiryNext;
}
