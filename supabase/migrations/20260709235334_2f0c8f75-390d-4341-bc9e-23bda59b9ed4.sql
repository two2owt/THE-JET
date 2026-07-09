-- Revoke public/anon execute on every SECURITY DEFINER helper in the public schema.
-- Lint 0028 flags any SECURITY DEFINER function callable without signing in;
-- these helpers should only run via authenticated contexts, triggers, or the
-- service_role (edge functions / cron).

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   fn.proname, fn.args);
  END LOOP;
END $$;

-- Trigger-only helpers: never called directly by clients. Also revoke from
-- authenticated so no client can invoke them out of context.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_admin_role_if_authorized()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_favorite_deal_change()         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_of_new_deal()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_minimum_age()                 FROM authenticated;

-- Maintenance / edge-function-only helpers: called by service_role via cron
-- or edge functions, never by end users.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_search_history()          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_security_audit_logs()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_location_data_retention()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_ending_soon_favorites()      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_favorite_update_notify(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.obfuscate_coordinates(numeric, numeric) FROM authenticated;

-- Retain authenticated EXECUTE on helpers that are legitimately called from
-- RLS policies or the app: has_role, can_view_profile_field,
-- check_connection_rate_limit. No change needed for those.