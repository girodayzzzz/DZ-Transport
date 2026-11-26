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
  if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash) return parsed.href;
 } catch {}
 return '';
}

export function payload(meta, sections, values) {
 if (meta.kind === 'partner') return {...meta,application:sections.application,permission:sections.permission};
 return {
  ...meta,customerType:values.customerType,transportCategory:values.transportCategory,
  contact:sections.customer,pickup:sections.pickup,delivery:sections.delivery,
  cargo:{type:grouping[values.transportCategory],...sections.cargo},
  schedule:sections.schedule,
  additionalRequirements:{manualAssessment:values.regulated === 'yes',comments:values.comments || '',...sections.permission}
 };
}

export async function submit(postTo, data, request = fetch) {
 const response = await request(postTo,{
  method:'POST',credentials:'omit',redirect:'error',
  headers:{Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify(data),
  signal:AbortSignal.timeout(18000)
 });
 return response.ok;
}
