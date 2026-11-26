# Security

Report issues privately to the operator using the contact listed on the site once it is configured. Use sample data when reporting form bugs.

The site renders review entries with text nodes, keeps personal entries in the active form only and posts data over HTTPS to the configured provider. Browser storage holds a language preference and a short-lived confirmation reference and form type. There are no analytics events, uploads, public inquiry records or client-side database credentials. Do not send production inquiries to test systems or commit real submissions.

HTML and client-side validation provide user feedback. Anyone can call a public form endpoint directly. Use provider-side rate limits, spam checks and validation. The honeypot and submission lock reduce accidental and simple automated submissions. A lost response can leave acceptance uncertain. Check the reference before processing a repeat, or enforce idempotency through a future server-side gateway. The local reference does not prove acceptance or identify a booking.

GitHub Pages is static. It does not provide application-side access controls or configurable application response headers. Review processor terms, access controls, data transfers, notifications and retention. Use separate provider accounts or roles for staff, enable MFA and review access periodically.
