# Authentication

Astro renders localized login, register, password recovery, verification, callback, account, logout and deletion routes. The portal is unavailable in preview. The separate manager, partner and Google switches default to disabled.

Supabase Auth handles password operations. The application passes passwords over HTTPS to Auth during the specific action and discards them with the form. It persists access and refresh tokens in tab-scoped session storage. Protect the origin from unreviewed JavaScript and use a short, operationally suitable JWT lifetime. A signed-out tab is sent back to login. An already issued JWT can remain valid until expiry after sign-out or some account changes. Role suspension is enforced in the database even against a still-valid token.

Mail confirmation and recovery use one-time token hashes in URL fragments. Google OAuth uses PKCE and fixed localized callbacks. Links never accept a caller-supplied destination. Confirmed email is checked again in PostgreSQL for customer operations. Admin operations additionally require a verified administrator grant and an AAL2 token. TOTP enrollment lives in account settings. Owners should complete factor enrollment before granting the role.

Account settings allow display name changes and submitting a deletion request. The owner handles account deletion after verifying identity and retention obligations. Notifications are in-app. A later email worker can use a dedicated private outbox and an approved provider with retry and delivery tests. Auth SMTP and mail notifications have separate purposes.

See [Supabase setup](SUPABASE-SETUP.md) for external configuration and [Security testing](SECURITY-TESTING.md) for the hosted rehearsal.

Enable the customer onboarding wizard with `PUBLIC_DZ_CUSTOMER_ONBOARDING=true` after applying migration 005 and verifying the staged flow. Existing customers can complete the wizard without changing ownership of inquiries or orders. The account-type step is persisted to the profile and resumes on return. Choosing Free completes setup without payment details. The browser flag controls whether the wizard is shown and is independent of database authorization. See [Google OAuth setup](GOOGLE-OAUTH-SETUP.md).
