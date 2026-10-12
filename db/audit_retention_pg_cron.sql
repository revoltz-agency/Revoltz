-- 89-day retention cleanup for audit_requests — Neon pg_cron variant.
--
-- ⚠️ READ docs/AUDIT_INBOX.md BEFORE RUNNING ANY OF THIS.
--
-- This file is NOT executed automatically. Nothing in the Express app runs it.
-- It is provided as an ALTERNATIVE to the Neon scheduled Function Trigger in
-- functions/audit-retention.ts.
--
-- ---------------------------------------------------------------------------
-- NEON-SPECIFIC CAVEATS (verified against https://neon.com/docs/extensions/pg_cron)
-- ---------------------------------------------------------------------------
-- 1. pg_cron runs ONLY WHILE THE COMPUTE IS ACTIVE. With Neon scale-to-zero
--    enabled, a job scheduled during a suspension does NOT fire. There is no
--    wake-on-cron. Neon's own docs say: "keep it for in-database maintenance
--    on an always-on compute."
-- 2. Neon recommends scheduled Function Triggers instead: "They run a Neon
--    Function on a cron schedule and fire at scale to zero."
-- 3. Enabling pg_cron requires setting cron.database_name via the Neon API,
--    then RESTARTING the compute, then CREATE EXTENSION. The restart drops
--    current connections.
-- 4. All cron schedules are evaluated in UTC.
-- 5. cron.schedule_in_database() is NOT supported on Neon.
--
-- If your compute scales to zero, use functions/audit-retention.ts instead.

-- Step 1 (Neon API, not SQL): point pg_cron at your database.
--
--   curl --request PATCH \
--        --url https://console.neon.tech/api/v2/projects/<project_id>/endpoints/<endpoint_id> \
--        --header 'authorization: Bearer $NEON_API_KEY' \
--        --header 'content-type: application/json' \
--        --data '{"endpoint":{"settings":{"pg_settings":{"cron.database_name":"neondb"}}}}'
--
-- Step 2 (Neon API, not SQL): restart the compute. THIS DROPS LIVE CONNECTIONS.
--
--   curl --request POST \
--        --url https://console.neon.tech/api/v2/projects/<project_id>/endpoints/<endpoint_id>/restart \
--        --header 'authorization: Bearer $NEON_API_KEY'
--
-- Step 3 (SQL Editor or psql):

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily at 03:00 UTC. Five numeric fields; ranges, lists and steps are allowed.
-- Named days/months, @daily macros, a seconds field and */0 all return 400.
SELECT cron.schedule(
  'audit-requests-89d-retention',
  '0 3 * * *',
  $$DELETE FROM audit_requests WHERE retention_expires_at < now()$$
);

-- Inspect what is scheduled:
--   SELECT * FROM cron.job;
--
-- Confirm an actual run (this is the only acceptable proof of "operational"):
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--
-- Keep the run-history table from growing without bound (7-day history):
SELECT cron.schedule(
  'audit-requests-purge-cron-history',
  '0 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

-- Unschedule if you move to a Function Trigger instead:
--   SELECT cron.unschedule('audit-requests-89d-retention');
--   SELECT cron.unschedule('audit-requests-purge-cron-history');
