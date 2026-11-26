# Google OAuth setup

Use the existing DZ Transport Supabase project. Keep `PUBLIC_DZ_GOOGLE=false` during configuration.

1. In Google Cloud, configure the OAuth consent screen for the DZ Transport operator. During testing, add only the approved synthetic test accounts. Review publishing status, the support contact, the authorized domain and the linked privacy policy before opening access.
2. Create an OAuth client of type **Web application**. In its **Authorized redirect URIs**, copy the callback shown in the Supabase Google provider panel. For the existing project this is `https://hgnwrtqpjxhidzeemaqb.supabase.co/auth/v1/callback`. For authorized JavaScript origins use the approved application origin and any approved private rehearsal origin used by the integration.
3. In Supabase → Authentication → Sign In / Providers → Google, enter the client ID and client secret and save. Store the secret in Supabase only. Configure the hosted redirect allowlist and Site URL under Authentication → URL Configuration. Add only the exact callback routes below and the verification routes listed in [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Keep public GitHub Pages preview out of the allowlist.
4. For the approved rehearsal deployment, set `PUBLIC_DZ_PORTAL=true` and `PUBLIC_DZ_GOOGLE=true`. Apply migration 005 before using `PUBLIC_DZ_CUSTOMER_ONBOARDING=true`. Use a separate approved rehearsal origin and its corresponding exact routes where available.
5. With a synthetic Google account, start from Register, allow consent, verify return to the same browser tab, complete customer onboarding, sign out and sign in through Google again. Repeat in Slovenian, English and German. Check that a returning user goes to the portal and an unfinished user resumes. Test the email flow independently with the production SMTP configuration in [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Keep public activation disabled until the rehearsals pass.

| Language | Application callback |
| --- | --- |
| Slovenian | `https://<approved-host>/prijava-potrditev/` |
| English | `https://<approved-host>/en/auth-callback/` |
| German | `https://<approved-host>/de/anmeldung-abschliessen/` |

OAuth uses PKCE and tab-scoped storage. Finish the consent flow in the tab where it began. Supabase remains the authority for identity and verified email.

[Supabase Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google) · [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
