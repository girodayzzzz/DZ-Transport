# Supabase setup

Reuse the existing DZ Transport Supabase project, reference `hgnwrtqpjxhidzeemaqb`. Keep production feature flags disabled during rehearsal. Use local PostgreSQL with synthetic fixtures first. A separate hosted project may be used only if the owner has already approved it.

## Review and apply migrations

1. In the existing project's dashboard, verify the project reference, plan, region, retention and authorized operators.
2. Run the isolated policy tests in [Security testing](SECURITY-TESTING.md). Prepare a verified backup and verify the linked target with the owner before running any hosted migration.
3. With an authorized operator account, run `supabase login`, `supabase link --project-ref hgnwrtqpjxhidzeemaqb` and `supabase db push --dry-run`. Compare the migration history with the dry run, then run `supabase db push` only after approval. Keep only `public` in the application's API-exposed schemas. Apply migration 005 before setting `PUBLIC_DZ_CUSTOMER_ONBOARDING=true`.
4. In **Authentication → Sign In / Providers → Email**, enable signup, require confirmation, and set minimum password length to 12. Set Auth rates appropriate to the SMTP provider and review Auth abuse settings. The product sends only synthetic mail until this configuration is tested.

## Configure URLs and mail

5. In **Authentication → URL Configuration**, set Site URL to the approved HTTPS production origin. Add the exact HTTPS paths below to the redirect allowlist. Use the equivalent staging host in the staging project, and avoid wildcard redirects.

| Language | Verification and recovery | Optional Google callback |
| --- | --- | --- |
| Slovenian | `/potrditev-e-poste/` | `/prijava-potrditev/` |
| English | `/en/verify-email/` | `/en/auth-callback/` |
| German | `/de/e-mail-bestaetigen/` | `/de/anmeldung-abschliessen/` |

6. In the confirmation and recovery templates, link to the localized redirect using these template values. The fragment keeps the token off normal server access logs.

   - Confirm signup link URL `{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=email`
   - Reset password link URL `{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=recovery`

   Use these values inside the HTML anchor’s `href`. Disable link tracking and verify delivery and one-time consumption in all languages. If mail scanners open links automatically, use a staging rehearsal before selecting the approved mail flow.

7. The owner approves an SMTP provider and configures the verified From address, sender domain, port, host, username and password under **Authentication → SMTP Settings**. Arrange SPF, DKIM and DMARC with the authorized DNS operator. Test receipt, reset, spam placement and limits. Supabase’s built-in mailer is restricted and is unsuitable for public production signup.
8. If Google is approved, create Google OAuth web credentials and enter the client ID and secret in Supabase Auth. Set Google’s authorized redirect URI to the exact Supabase Auth callback displayed in the provider panel. Test the allowlisted Astro callback using PKCE before setting `PUBLIC_DZ_GOOGLE=true`.

## Bind Cloudflare configuration

9. Copy the hosted project URL and **publishable** key from the project’s Connect/API Keys panel into the Pages production build environment as `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Keep feature flags false until owner-approved. Configure the static build as described in [Deployment](DEPLOYMENT.md).
10. For the optional guest endpoint, create a Turnstile widget bound to the production domain. Use its public key as `PUBLIC_TURNSTILE_SITE_KEY`. Add protected Pages Function bindings for `SUPABASE_URL`, the modern `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET`, and a high-entropy `DZ_IP_HASH_KEY` of at least 32 characters. Use separate secrets for an already approved staging project and production. Set the Function binding `DZ_SITE_ORIGIN` to the same approved HTTPS origin as the build’s `SITE_URL`. For an approved rehearsal, use the rehearsal origin and a Turnstile widget authorized for its hostname. Roll back to Formspree by disabling both guest flags and redeploying with the approved Formspree inquiry URL.
11. Deploy and validate the function with synthetic submissions before switching public intake to it. Set runtime `DZ_GUEST_INTAKE=true` to enable the endpoint and set build variable `PUBLIC_DZ_GUEST_INTAKE=true` after acceptance. Keep the approved public partner endpoint separate. Review the Function’s 32 KiB request cap and the rate of eight accepted submissions per network hash per hour.

## Create the first administrator

12. Enable the base portal after a successful staging rehearsal. A dedicated owner-controlled account signs up, verifies its email, signs in and enrolls a TOTP factor in account settings. Save recovery arrangements with the owner before granting privileges. Confirm the intended user ID and mailbox through Supabase’s **Authentication → Users** and a trusted channel. Confirm the verified factor in the dashboard or SQL.
13. A trusted database operator runs the following with the verified UUID substituted. Check that exactly one row is affected.

   ```sql
   insert into public.user_roles(user_id, role, approved)
   select u.id, 'admin', true
   from auth.users u
   where u.id = '<verified-user-uuid>'::uuid and u.email_confirmed_at is not null
     and exists (
       select 1 from auth.mfa_factors f
       where f.user_id = u.id and f.factor_type = 'totp' and f.status = 'verified'
     )
   on conflict (user_id, role) do update set approved = excluded.approved;
   ```

   Revoke approval immediately if control of the account or factor is lost. Enable `PUBLIC_DZ_MANAGER=true` only after testing that AAL1 reads and writes are denied and AAL2 works. Keep `PUBLIC_DZ_PARTNER=false` for V4 launch until the required business verification controls are implemented and tested.

14. Run [Security testing](SECURITY-TESTING.md), check the public HTTP responses, process one staging shipment through completion and exercise restoration procedures. Track the [free-tier limits](FREE-TIER-LIMITS.md) in the provider dashboards after activation.
