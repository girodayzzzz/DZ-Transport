# Owner configuration

Use a reviewed change to `config/site.json` for public values. The default build is a preview. It shows a preview banner, disables both submission endpoints and marks every page noindex.

| Setting | Required owner input |
| --- | --- |
| `operator`, `address`, `registration` | Legal entity, registered business address and registration number |
| `vat`, `vatApplicable` | VAT ID or explicit confirmation that VAT registration is inapplicable |
| `email`, `telephone`, `businessHours` | Monitored public email, international phone and business hours with time zone |
| `socialLinks` | Optional branded HTTPS profiles as label/URL pairs |
| `endpoints.inquiry`, `endpoints.partner` | Two distinct public HTTPS intake URLs without query credentials |
| `privacy.provider`, `privacy.retention` | Processor identity and approved retention wording for inquiries, partner records and relevant backups |
| `legal.contractualRole`, `legal.approvalReference` | Approved public role description and a non-sensitive record of sign-off for the revised legal pages |
| `analytics` | Optional Cloudflare Web Analytics beacon token and documented determination of consent requirements |

1. Provision both intake channels and confirm where data is processed, who can access it, how deletion works and where notifications go. Configure spam controls, permitted origins and a JSON receipt containing `ok: true` only after successful acceptance. If a reference is returned, it must match the submitted reference.
2. Review and replace draft wording in `src/lib/editorial.ts` and `src/components/Page.astro` in all three languages. Confirm the contracting entity and actual carrier role, provider checks, offer acceptance, insurance and liability, complaint contacts and procedures, lawful bases, processor agreement, transfer safeguards, data rights and retention. Record approval once the final text is reviewed.
3. Test synthetic inquiries and partner applications through the intended endpoints from the final HTTPS origin. Verify receipt and owner notification, failure handling and deduplication. Never commit customer records or provider credentials.
4. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for hosting. Enable the production build mode only after these inputs and legal review are complete.
5. Leave analytics off by default. Set `analytics.enabled` and `analytics.consentReviewed` only if the owner confirms the beacon can run without an opt-in. Where opt-in is required, leave it off pending an approved consent flow. The optional integration measures page visits and performance on clean URLs. It excludes form and confirmation pages. Do not export form data or references to analytics.

## Portal and guest intake owner settings

Use [Supabase setup](SUPABASE-SETUP.md) for region selection, SMTP, secure administrator provisioning, protected Cloudflare bindings, staged testing and feature activation. See [free-tier planning limits](FREE-TIER-LIMITS.md) and [backup and restore](BACKUP-AND-RESTORE.md).

## Quick Deal

Follow the [Quick Deal staging and approval steps](QUICK-DEAL.md). Leave the database and dashboard switches off in production until the carrier and contractual workflow is approved.
