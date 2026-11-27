import {validateGuestInquiry} from '../../src/lib/guest-intake.mjs';
import {guestIntake} from '../lib/guest-intake.mjs';

const route=(place,prefix)=>[place[prefix+'City'],place[prefix+'Postal'],place[prefix+'Country']].join(' · ').slice(0,250);

export const onRequest=guestIntake({
 flag:'DZ_GUEST_INTAKE',action:'guest-inquiry',validate:validateGuestInquiry,rpc:'ingest_guest_inquiry',
 args:payload=>({p_email:payload.contact.email,p_origin:route(payload.pickup,'pickup'),
  p_destination:route(payload.delivery,'delivery'),p_category:payload.transportCategory})
});
