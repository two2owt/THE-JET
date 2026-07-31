
SELECT cron.unschedule('process-location-data-retention-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-location-data-retention-daily');
SELECT cron.unschedule('location-data-retention') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='location-data-retention');
SELECT cron.schedule('cleanup-search-history', '30 3 * * *', $$SELECT public.cleanup_old_search_history();$$);
SELECT cron.schedule('cleanup-security-audit-logs', '45 3 * * 0', $$SELECT public.cleanup_old_security_audit_logs();$$);
