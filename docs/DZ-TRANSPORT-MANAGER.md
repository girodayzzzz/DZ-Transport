# DZ Transport Manager

Build a private operator application once the transport intake and contractual workflow are established. Keep the public Astro site static. Put operational records in a private managed PostgreSQL database in an approved region.

## Intake and access

Use a small HTTPS API for inquiries and a separate endpoint for partner applications. Validate the payload and active fields server-side, recompute cargo totals, rate-limit submissions and apply abuse controls. Verify browser origins as a supplementary control. Store a unique key for each submission kind and reference alongside a payload hash. An identical retry should return the original receipt. A conflicting payload using the same reference should receive HTTP 409. Return JSON `{"ok":true,"reference":"…"}` only after a successful transaction. Queue an internal notification after commit using a transactional outbox.

Require SSO or managed authentication with MFA. Enforce permissions at the API and database boundaries. Intake staff triage submissions, dispatch manages carriers and orders, finance sees costs and margins, and administrators manage roles. Audit record access, exports and state changes without copying private field values into logs.

## Records and workflow

- Inquiries include the payload, reference, customer, route, status and assignment. Keep partner applications and manual verification outcomes separate.
- Provider records contain verified coverage, transport categories, vehicle capacity, insurance and license validity. Restrict access to supporting documents.
- Quotations version customer prices, carrier costs, currency and expiry. Store amounts as minor units and use the accepted quote version for order accounting.
- Orders link inquiry, accepted quotation and assigned carrier. Record status changes, dispatch milestones, internal notes and dispute history.
- Reports aggregate order counts, revenue, carrier cost and gross margin by month and currency. Restrict financial exports by role.

Add private object storage for documents only after retention, scanning, access controls and signed download URLs have been approved. Encrypt transport and storage, control backups and test restoration and deletion workflows. Keep customer and provider records outside the public repository.

## CRM and Google Sheets

Use an authenticated server-side job after receipt verification. Map `reference`, `kind`, `language`, `transportCategory`, `contact`, `pickup`, `delivery`, `cargo`, `schedule` and `additionalRequirements` into approved CRM fields. For Sheets, use a restricted workbook and separate item rows keyed by reference. Use raw cell input for untrusted values to avoid spreadsheet formulas. Sync only approved fields, keep service credentials in the server secret store, and apply the same deletion policy to downstream copies.
