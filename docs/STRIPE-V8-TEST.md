# Stripe test setup for DZ Transport V8

V8 uses Stripe-hosted card Checkout on the platform, followed by a separate Connect transfer to the assigned carrier after delivery is confirmed. The connected account pays funds out to its bank account according to its Stripe schedule. This test implementation uses EUR and Slovenian Express connected accounts.

## Deploy in an isolated test environment

1. Use a separate Supabase project and a Stripe sandbox with Connect enabled. Apply repository migrations through `202611270010_v8_payments.sql`. Create test customer and carrier accounts with confirmed emails, approve the carrier, and set up an approved admin with MFA.
2. Deploy Astro and the Cloudflare Pages Functions to an HTTPS staging origin with the existing authenticated portal configuration. Set `PUBLIC_DZ_PORTAL`, `PUBLIC_DZ_MANAGER`, `PUBLIC_DZ_PARTNER` and `PUBLIC_DZ_QUICK_DEAL` for the test portals. The GitHub Pages workflow continues to build a static preview. If staging is access protected, Stripe and the scheduler need access to their respective endpoints.
3. Set the server-only Cloudflare bindings below. Keep the public Supabase client settings distinct from the server secret. Only an `sk_test_` key and webhook events with `livemode: false` are accepted.
4. Configure both webhook destinations and start the scheduled job. Enable V8 in the **test database** only once those components are available.

| Binding | Purpose |
| --- | --- |
| `DZ_STRIPE_TEST` | Set to `true` on the isolated staging server. |
| `DZ_SITE_ORIGIN` | Exact HTTPS origin, used for allowed requests and the localized portal return paths. |
| `SUPABASE_URL` | URL of the staging Supabase project. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used with the signed-in user's JWT. |
| `SUPABASE_SECRET_KEY` | Supabase secret key for privileged worker and webhook RPCs. |
| `STRIPE_SECRET_KEY` | Stripe sandbox API secret. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for events on the platform account. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for events on connected accounts. |
| `DZ_STRIPE_JOB_TOKEN` | Random token with at least 32 characters for the scheduled job. |

```sql
update dz_private.payment_settings set enabled = true where singleton;
update dz_private.quick_deal_settings set enabled = true where singleton;
```

## Endpoints and events

| Path | Purpose |
| --- | --- |
| `POST /api/transport-payments` | Signed-in customer Checkout and carrier Connect actions. |
| `POST /api/stripe-transport-webhook` | Signed Stripe events. Create separate platform and connected-account event destinations at this URL. |
| `POST /api/transport-payment-jobs` | Checkout expiry, Quick Deal refunds, overdue confirmation, transfers, payout actions and reconciliation retries. |

Subscribe the platform destination to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.payment_failed`, `transfer.created`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated` and `charge.dispute.closed`. Subscribe the connected-account destination to `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` and `payout.canceled`. Account capability and requirements are retrieved directly from Stripe when a carrier opens the payout panel.

Schedule an HTTPS POST to the job endpoint every minute using a trusted scheduler, for example a Cloudflare Cron Worker or Supabase Cron with `pg_net`. Store the job URL and bearer token in the scheduler's secret store. The request uses `Authorization: Bearer <DZ_STRIPE_JOB_TOKEN>` and no body. Monitor the scheduler and webhook destinations for repeated failures. A Checkout redirect is informational. Payment is recorded from the Stripe webhook or server reconciliation against the canonical Stripe session.

## Test operating rules

- Quotes use an actual carrier bid in EUR and reserve that bid for 60 minutes by default. The customer's original inquiry and bids remain available following an unpaid expiry. A late capture on an expired reservation is refunded.
- A new Quick Deal starts private. Payment publishes it for eligible carriers, with a 48-hour default acceptance window. The operations team applies the existing eligibility checks. The first eligible carrier to accept becomes the assigned carrier. The existing publication and moderation workflow covers public questions. Only the assigned carrier and customer can message in the transport conversation.
- The carrier records pickup, transit and delivery. The customer confirms delivery. After 72 hours the case goes to management for a reasoned decision. Management can dismiss a delivery dispute, approve a transfer after resolving the case, or approve a refund with a recorded reason.
- The commission snapshot uses Free 10%, Basic 7%, or Pro 5%. In the test example, EUR 500.00 collected yields EUR 50.00 commission and EUR 450.00 for a Free carrier. The example assumes zero VAT on commission and platform-paid Stripe fees. The test configuration supports changing VAT treatment and fee payer for new reservations. A separate cancellation fee in basis points suggests the refund amount for management review; management records the actual amount and reason. Carrier-paid processor fees, when configured, are prorated to the remaining pre-commission amount after a refund. The platform bears the difference between the actual Stripe fee and that allocation.
- Stripe handles automatic weekly payouts on Monday or monthly payouts on the first day of the month. Switching to manual begins with an empty Stripe balance. The job schedules a switch back to weekly after 60 days in manual mode, leaving time before Stripe's 90-day holding limit for Slovenia. A blocked account or failed payout requires management review.
- Financial records created before V8 are legacy records without a Stripe link. Their existing history, V7 commission, dashboard and conversation remain accessible. New payable quotes use the V8 bid flow while the staging flag is enabled. Guest/manual workflows retain their V7 context.
- A carrier can attach a PDF invoice for the transport after marking delivery. The payment page also offers a separate Stripe receipt and a clearly marked test draft of the commission invoice. The monthly CSV groups entries by reservation month in Europe/Ljubljana and reflects the latest settlement and refund state. It includes document identifiers.
- Approved managers can retry an operation while its original Stripe idempotency key is still within the replay window. After 23 hours an uncertain operation is held for reconciliation. Match the recorded operation ID, payment ID, Stripe object, amount, currency and connected account before resolving an uncertain entry. Keep the original idempotency key. If payout has already emptied the connected balance and a reversal fails, the reversal remains visible in the admin payment details for reconciliation. Review successful transfers that race with a provider dispute or refund.

## Test checklist

Run lint, the Node tests, the build, verify, and Playwright with the existing preview configuration. Run the SQL fixtures in CI against a disposable PostgreSQL database. They cover payment gating, fee snapshots, replay, expiry, authorization, refunds, disputes, payout reconciliation and the competing acceptance lock.

Run the following against Stripe sandbox credentials before promoting the test deployment:

1. Pay a Quick Deal and accept it as an eligible carrier. Repeat with a Quick Deal that expires unassigned and verify Stripe returns the full amount.
2. Submit a carrier bid and verify no payment exists until the customer selects it. Retry and expire a Checkout session, then open a fresh one. Use Stripe's declined test card and confirm the application can resume payment.
3. Complete delivery, confirm it, and reconcile the transfer and commission. Test incomplete Express onboarding, the three payout schedules, a real sandbox payout failure and redelivery of the connected-account webhook.
4. Test partial and full refunds before and after transfer, transfer reversal against insufficient connected funds, and Stripe card disputes. Verify the application blocks release during an unresolved dispute and exposes any provider mismatch to management.
5. Check localization with the actual staging origin, the registered webhooks, the scheduler, and the linked Stripe account. Repeat the required flows with independent users and inspect the invoice access controls.

## Decisions before live operation

Confirm the intermediary and contractual model, Stripe Connect cross-border support and permitted currencies, country and payout limits, tax on the commission for domestic and foreign carriers, invoice issue dates and numbering, document corrections and statutory reporting or fiscal verification. Confirm which party covers Stripe fees and the commercially agreed refund and cancellation amounts. Production tax invoice generation is disabled. The test PDF upload is for transport invoices issued separately by the carrier.

Stripe documentation covers [separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [manual payouts](https://docs.stripe.com/connect/manual-payouts), [payout schedules](https://docs.stripe.com/connect/manage-payout-schedule), and [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
