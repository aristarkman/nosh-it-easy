
-- Lovable's native Jobs feature already runs "requote-scheduled-deliveries" every 5 minutes,
-- hitting the same /api/public/hooks/requote-scheduled endpoint. Remove the duplicate pg_cron
-- job added in 20260723193938_add_requote_scheduled_cron.sql to avoid double-dispatch.

SELECT cron.unschedule('requote-scheduled') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'requote-scheduled');
