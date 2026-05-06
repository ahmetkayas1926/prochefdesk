-- ProChefDesk migration: re-define nightly-backup-to-r2 cron job with timeout
--
-- BACKGROUND
--   pg_cron's net.http_post() defaults to a 5-second timeout. The backup-to-r2
--   Edge Function takes ~6 seconds to dump 21 tables to R2 (and could take
--   longer as the chef's data grows). Without an explicit timeout, the cron
--   job fires the request, the request completes successfully on the Edge
--   Function side, but pg_cron's net._http_response gets status_code=NULL
--   because pg_net abandoned waiting for the response.
--
--   This was discovered when investigating "why are backups silently failing":
--   the answer was "they aren't — but pg_cron thinks they are because it
--   stops listening too early."
--
-- FIX
--   Override the cron schedule with timeout_milliseconds := 60000 (60s).
--   Anything under 60s will resolve normally and write a real response
--   to net._http_response, allowing future monitoring to actually work.
--
-- WHY cron.schedule() AND NOT cron.alter_job()
--   cron.schedule() with the same jobname is idempotent — it deletes the
--   existing job and creates a new one with the same name. Cleaner than
--   alter_job which can leave stale state.
--
-- IDEMPOTENT
--   Safe to re-run on any environment. Always overrides the current job.
--
-- DEPENDENCIES
--   - vault.decrypted_secrets must contain BACKUP_CRON_TOKEN
--   - backup-to-r2 Edge Function must be deployed
--   - pg_cron extension enabled
--   - pg_net extension enabled

SELECT cron.schedule(
  'nightly-backup-to-r2',
  '0 3 * * *',  -- 03:00 UTC every day
  $$
  SELECT net.http_post(
    url := 'https://muuwhrcogikpqylsfvgg.supabase.co/functions/v1/backup-to-r2',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11dXdocmNvZ2lrcHF5bHNmdmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTk5MDAsImV4cCI6MjA5MjQzNTkwMH0.swsIn1OnMj5h_z1z_7CkoixtuoZAYTR_AAr_4B0jot4',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'BACKUP_CRON_TOKEN' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
