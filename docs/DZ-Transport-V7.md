# DZ Transport V7 review guide

Apply migrations `202611260008_v7.sql` and `202611260009_load_questions.sql` on an isolated Supabase project before testing the updated production-mode build. The GitHub Pages preview keeps the portal integration disabled.

Use confirmed synthetic accounts for the customer, two approved carriers, and an approved manager with an AAL2 session. Use an additional signed-out browser window for the public view.

1. Create a synthetic inquiry and advance it to Awaiting carrier offer. In the manager portal use Manage public listing, choose Public listing and Test load, and select the category and countries. Open Questions about the load and use Show questions to retrieve the public link.
2. As an approved carrier, visit the public link and submit a question about the cargo. As the customer, answer in the inquiry's question panel. As manager, approve the question and answer separately. Read the approved text while signed out. Repeat on an invited private inquiry and an eligible Quick Deal using the carrier portal.
3. As the invited carrier, enter a quote for 100,000 minor units in EUR and accept the displayed terms. Prepare and send a customer offer, then accept it as the customer. If the carrier cost, currency, rate or package differs from the carrier's earlier acceptance, use Send terms for confirmation in the manager portal and accept them in the carrier's Fees section. Finalize the assignment.
4. Verify the customer and assigned carrier can exchange messages. Open a message notification and follow its link to the conversation. A hosted check should also exercise the REST endpoints with account tokens for both participants, the manager, and an unrelated account.
5. Ask the new carrier to confirm terms and replace the assigned carrier before pickup. Verify the old entry is voided and the new carrier has a fresh conversation. After cancellation, a manager can void the fee with a reason. The fee view is filtered by UTC month. The existing customer price and internal margin have separate records.
6. Repeat with a Quick Deal. The request and reservation leave the chat and ledger empty until the manager confirms the contract and finalizes the assignment.

An accepted customer account order opens a conversation between the customer account and currently assigned carrier. A guest order has no customer login until it is linked to an account through an authorized process. Fee entries are generated on assignment going forward. Existing carrier offers can be confirmed through the manager's fee terms action before a first V7 assignment.

The ledger stores the order, assignment, carrier, plan, rate, basis, currency, fee amount, reference and void history. The nullable billing reference can link future billing records. A separate update will handle Stripe customers, subscriptions, invoicing, payments, webhooks and tax.
