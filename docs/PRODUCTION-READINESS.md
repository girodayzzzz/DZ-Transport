# DZ Transport production review

The public brand is DZ Transport. The sole proprietor and business contact details confirmed by the owner are in `config/site.json`. The Terms and Privacy pages are drafts. Complete the reviewing steps below before setting the public production flags.

## Contract and payment decisions

The owner confirmed that the carrier contracts directly with the customer, supplies and performs the transport and invoices the customer. DZ Transport coordinates the service, manages receipt and settlement of payment and invoices the carrier separately for its commission. Define the carrier's collection authorization, when the customer's payment discharges the transport debt, the contracting moment, and responsibilities for support, cancellations, refunds and chargebacks in the carrier agreement and customer terms. Review the operational flow against this model. A party that concludes carriage in its own name on the customer's account may instead fall under the freight-forwarding rules of the Obligations Code. Own-name supply also needs separate VAT analysis. Review cross-border VAT, invoice and advance-payment requirements, corrections and fiscal verification with the accountant. [OZ, including Article 851](https://pisrs.si/pregledPredpisa?sop=2007-01-4826) · [ZDDV-1](https://pisrs.si/pregledPredpisa?id=ZAKO6168) · [FURS invoice guidance](https://www.fu.gov.si/poslovni_dogodki_podjetja/izdajanje_racunov/)

V8's Checkout Session is created on the platform and only sets a transfer group and metadata on the PaymentIntent. The carrier's account appears later as the transfer destination. Stripe documents this as a platform merchant of record configuration. Transferring funds does not change the merchant for the original charge. For a known carrier, review separate charges and transfers with the carrier as `payment_intent_data[on_behalf_of]`, subject to appropriate account capabilities, regional support and Stripe approval of the flow. Validate the seller shown before acceptance, at Checkout, on the statement and receipt, and on the tax invoice. Test refunds and disputes. The business agreement, tax supplier and payment merchant need separate verification. [Stripe merchant of record](https://docs.stripe.com/connect/merchant-of-record) · [Stripe Connect charges](https://docs.stripe.com/connect/separate-charges-and-transfers)

For Quick Deal, V8 currently collects payment before the carrier is known. If nobody accepts by the deadline, V8 starts a full refund. The proposed launch flow is to publish the fixed price, provisionally match a carrier, identify that carrier to the customer and create the Checkout Session only after the customer can review the carrier and terms. If no carrier accepts, close without a charge. Confirm reservation and payment expiry, what happens if the customer declines, and treatment of existing test records. A platform charge made before the carrier is identified remains a platform charge. Review any earlier payment or authorization alternative with Stripe and legal and accounting advisers before product changes. The draft uses the proposed flow. This PR leaves V8 test code and live billing controls as they are.

For consumer orders, finalize precontract disclosures, the applicable withdrawal information and any model form, payment-obligation wording, and durable confirmation before launch. Check the specific-date or period exception for carriage of goods transaction by transaction, including the separate coordination service. Approve cancellation fees and refund decisions, complaint contacts and escalation, insurance and claim handling, and the applicable consumer dispute notice. Check domestic road carriage rules and the scope and exclusions of CMR for each international service. [ZVPot-1](https://pisrs.si/pregledPredpisa?id=ZAKO7054) · [ZPPCP-1](https://pisrs.si/pregledPredpisa?id=ZAKO3743) · [CMR](https://unece.org/DAM/trans/conventn/cmr_e.pdf)

## Privacy decisions

Confirm the supplier and processing roles for Cloudflare Pages, Turnstile, Supabase (including Auth and database), the actual SMTP provider, and Stripe test processing. Verify whether the services are enabled in the intended environment, regions and subcontractors, processor agreements where applicable, and safeguards and access information for transfers outside the EEA. Confirm carrier/controller relationships, legal bases by purpose and the legitimate interests relied on, required fields and consequences, whether marketing runs, and retention periods or criteria by data category, including expired requests, partner applications, accounts, chat and backups. Use the published business address for rights requests. Review storage of sessions, Turnstile and any future analytics before approving the disclosures. [GDPR, Articles 5, 6, 13, 28 and 44 onward](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

After review, replace pending language in all three versions of the policies and record the approved public provider and retention wording in `privacy.provider` and `privacy.retention`. Set `legal.contractualRole` to the approved role text and `legal.approvalReference` to a real, non-sensitive approval reference. The production build requires these fields. The confirmed business model is in the draft, and final public wording and approval still require review.

## Cloudflare production settings after approval

Verify Cloudflare project `dz-transport` uses repository `girodayzzzz/DZ-Transport`, branch `main`, build command `npm run build` and output `dist`. Use the production scope for the public hostname and an isolated set of variables for staging. Cloudflare Pages invokes Functions only on the paths in `public/_routes.json`.

| Scope | Name | Expected setting |
| --- | --- | --- |
| Build | `NODE_VERSION`, `BASE_PATH` | `24`, `/` |
| Build | `SITE_URL` | `https://dz-transport.pages.dev` |
| Build | `DZ_SITE_MODE` | `production` after content approval |
| Build | `PUBLIC_DZ_PORTAL` | `true` to expose portal auth |
| Build | `PUBLIC_DZ_MANAGER`, `PUBLIC_DZ_PARTNER` | `true` for the respective panels. UI flags do not grant database roles |
| Build | `PUBLIC_DZ_GUEST_INTAKE`, `PUBLIC_DZ_GUEST_PARTNER_INTAKE` | `true` for the inquiry and partner forms |
| Build | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL and publishable key for the same DZ Transport project. The portal requires the modern publishable key |
| Build | `PUBLIC_TURNSTILE_SITE_KEY` | Public site key for the widget allowing the Pages hostname |
| Runtime | `DZ_SITE_ORIGIN`, `SUPABASE_URL` | Exact public Pages origin and the same Supabase URL used by the portal. Both URL variables are needed |
| Runtime | `DZ_GUEST_INTAKE`, `DZ_GUEST_PARTNER_INTAKE` | `true` for the corresponding Functions |
| Runtime secrets | `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET`, `DZ_IP_HASH_KEY` | Supabase server key, matching widget secret, and a random secret of at least 32 characters |
| Runtime payments | `DZ_STRIPE_TEST` | Keep disabled on the public site while payment and invoice flows are pending. If testing in isolation, follow the V8 test setup and use test keys and non-live webhooks |

Verify approved carrier and administrator roles, TOTP enrollment and AAL2. In Supabase Auth check email signup and confirmation, custom SMTP provider, verified sender, localized redirect allowlist and templates. The public contact address does not establish the sender or SMTP provider. Check deliverability to an external test mailbox. Supabase's default SMTP has recipient restrictions. [Auth setup](../SUPABASE-SETUP.md#configure-urls-and-mail) · [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/) · [Stripe test setup](STRIPE-V8-TEST.md)

Before the public switch, run registration, confirmation, login and password reset in an authorized staging environment. Submit a synthetic inquiry and a separate carrier application, compare receipts to the manager records, verify an approved carrier's offer and assignment, and check private chat participation. Verify AAL1 and an ordinary user cannot use management endpoints, and an approved administrator with MFA can. Review the deployment and its form endpoints at the Pages hostname. Keep GitHub Pages in preview.
