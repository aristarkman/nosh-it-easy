
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('cart-abandonment') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cart-abandonment');

SELECT cron.schedule(
  'cart-abandonment',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nosh-it-easy.lovable.app/api/public/hooks/cart-abandonment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocWV1eXZvdmhsZWFta293anBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzMzNzYsImV4cCI6MjA5MzY0OTM3Nn0.8ge2g8dSWOGZ35Py5KBH5qzdWVS4UE64mdMyb-EAQ7A'
    ),
    body := '{}'::jsonb
  );
  $$
);
