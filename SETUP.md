# Configuration and form setup

1. Use Node 24, run `npm ci` and start `npm run dev`.
2. In `config/site.json`, add the legal operator, registered address, registration and VAT details where applicable, contact email and telephone. Set the processor name and the approved retention policy in the legal copy. Review `src/lib/editorial.ts` in all three languages.
3. In Formspree, create two forms and verify their destination email addresses. Set `endpoints.inquiry` and `endpoints.partner` to each form’s public HTTPS URL. Set feature flags to `false` to pause a form. An empty or invalid endpoint disables sending in all languages.
4. Enable provider-side spam protection and origin restrictions if offered by your plan. Use the Pages URL and approved custom domain as appropriate. Allow cross-origin JSON requests from the site. Configure notifications with the submission reference and the `inquiryDetails` field so staff can read an inquiry without opening the dashboard.
5. Use dummy data to test both forms from the deployed origin. Confirm 2xx JSON responses, notifications, provider records, readable cargo details, manual assessment flags and the two types of consent. Test failures and confirm the form retains entered data. Use dedicated test endpoints when testing CI or staging.

## Provider contract

The frontend sends a JSON POST with `Accept: application/json`, without credentials or uploads. The body includes `kind`, `reference`, `submittedAt`, `language` and `inquiryDetails`. Transport payloads include customer type, transport category, contact, pickup, delivery, cargo, schedule and additional requirements. Partner payloads contain application and acknowledgment sections. The readable `inquiryDetails` field is provided for notifications that flatten or omit nested fields. An equivalent endpoint must support CORS and return a 2xx response only after accepting the submission.

The reference uses the visitor’s local date and six randomized uppercase alphanumeric characters. It is generated per distinct submission attempt and reused on retry when the payload is identical. Use it for correspondence. A booking requires a separate agreement.

## Future integrations

Use the provider’s server-side integration features or a private webhook. Write selected fields to Google Sheets, a CRM or TMS using a narrowly scoped service account. Email automation should use the reference for deduplication and follow the separate marketing opt-in. A Cloudflare Worker or Supabase Edge Function can validate schemas, enforce limits, apply a unique constraint on the reference, queue integration jobs and send acknowledgments. Store credentials as server-side secrets and keep database access private. Apply the approved retention, logging and deletion policy across providers.
