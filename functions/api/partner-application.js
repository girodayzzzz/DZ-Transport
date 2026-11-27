import {validateGuestPartner} from '../../src/lib/guest-intake.mjs';
import {guestIntake} from '../lib/guest-intake.mjs';

export const onRequest=guestIntake({
 flag:'DZ_GUEST_PARTNER_INTAKE',action:'guest-partner',validate:validateGuestPartner,rpc:'ingest_guest_partner'
});
