# Backup and restore

The owner assigns a database operator and approves backup retention and storage in the approved region. Protect backup credentials separately from deployment credentials. Use encrypted backups and limit decryption to authorized operators. Keep exports outside Git and outside public file shares.

## Capture

1. From an authorized workstation, use the staging-rehearsed Supabase CLI and connection settings. Save the source project, migration version and timestamp. Use CLI password prompting or protected environment variables.
2. Use the Supabase CLI dump procedure to capture globals, schema and data with separate private files. Verify whether required Auth data and custom migration history are included using the linked official procedure. Record any additional settings separately. Capture Auth providers, redirect URLs, mail templates, SMTP configuration, Pages variables and secret inventory. Document object-storage exports separately if storage is added.
3. Verify completion, encrypt the archive and test it in an isolated restore environment. Keep backups under the approved deletion schedule.

## Restore and retention

1. Create an isolated EU project authorized for the restore rehearsal. Keep mail and external webhooks disabled. Follow the managed Supabase restore procedure to restore role, schema and data in the supported order. Apply any later migrations after reviewing the dry run.
2. Reconfigure approved Auth and Pages settings, then retest RLS, guest receipts, status history, totals and sample record counts. Verify role grants and MFA manually before opening service. Rotate credentials if the incident requires it.
3. For account requests, confirm identity and applicable retention. Delete the Supabase Auth user through the trusted dashboard or admin process once approved. The schema clears or removes related auth ownership. Review remaining business records and remove or redact retained personal data once allowed.
4. Inspect eligible closed records before calling `select dz_private.purge_archived_inquiries('<approved ISO cutoff>');` as the database owner. Review legal holds before execution. Never use a generic cutoff if records under hold would match. Cascades remove linked payloads, items, quotes, orders and status history. Audit metadata and old backups follow separate approved retention policies. Test affected counts in a transaction and roll back before performing an approved purge.

[Supabase backup and restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
