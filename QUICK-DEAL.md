# Quick Deal

A Quick Deal is an invitation to request a fixed carrier acquisition price. The manager records eligibility, chooses a reservation and confirms the contract before assigning the existing transport order. The carrier can request consideration while another eligible carrier holds a reservation. The assignment stays exclusive.

## Stage the feature

1. Apply migrations through `202611260007_quick_deal.sql` to a staging Supabase project after a backup. Run the isolated SQL and browser tests in [Security testing](SECURITY-TESTING.md).
2. Configure the existing portal, partner and manager access using [Supabase setup](SUPABASE-SETUP.md). Verify confirmed carrier accounts and an AAL2 manager account in staging.
3. Set `PUBLIC_DZ_QUICK_DEAL=true` on the staging Astro build and rebuild. This setting controls the portal UI.
4. In the staging SQL editor as the database owner, set the reservation duration and enable publication and carrier activity.

```sql
update dz_private.quick_deal_settings
set enabled = true, reservation_minutes = 60
where singleton;
```

Both switches default to off. The database switch independently controls publication, partner access, requests, reservation and final assignment. A manager can cancel a published deal while the switch is off. Cancel outstanding deals before switching their inquiries back to the standard quotation workflow. Rehearse the full process with synthetic users before seeking approval to enable production.

## Manager and carrier workflow

1. Open an inquiry in **Awaiting carrier offer** and choose **Draft a Quick Deal**. Enter approximate pickup and delivery regions, cargo, windows, vehicle and eligibility requirements, fixed carrier amount in minor units, currency, VAT treatment and expiry. Exclude private addresses, contact details and selling prices from the carrier-facing fields.
2. For each carrier, confirm the applicable license, insurance, business identity and deal-specific requirements outside the app. In **Record eligibility review**, select the approved carrier and set the validity deadline to the earliest applicable expiry. To withdraw eligibility, set this deadline to the current time or earlier. Partner suspension also invalidates eligibility.
3. Publish the deal. Publication is available for an inquiry without standard carrier invitations. The carrier sees the listing in **Quick Deals** and can filter by status and send an acceptance request.
4. Open the inquiry and select **Show requests**. Pick a carrier and reserve. A competing reservation will fail while the current reservation is valid. An expired reservation or lost eligibility releases its claim on the next reservation action. No background worker is required.
5. Prepare and send the normal customer offer. The offer must use the deal currency. After customer acceptance and after verifying contractual requirements, choose **Confirm contract and assign** and enter the assignment instructions. This records the assignment and fixed carrier cost together. The carrier receives the normal order notification. Requests and reservations do not create orders or contracts.

Per-deal eligibility is a dated manual attestation. Evidence storage and authority checks are rollout dependencies. Automatic reservation, a public listings page, deal edits or reopening and a carrier reservation notification are future work. The partner dashboard shows up to 100 applicable listings. The manager sees deal controls within the corresponding recent inquiry.

The carrier listing RPC returns the carrier-facing fields, its own request state and any reservation expiry for that carrier. Candidate identities, private contact and inquiry fields, customer quotes and internal costs retain their existing access boundaries.
