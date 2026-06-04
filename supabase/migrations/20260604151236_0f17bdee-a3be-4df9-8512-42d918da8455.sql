
-- 1) Tighten user_connections UPDATE policy: only recipient can change status,
--    and neither party can swap user_id/friend_id.
DROP POLICY IF EXISTS "Users can update connections they're part of" ON public.user_connections;

CREATE POLICY "Recipient can update connection status"
ON public.user_connections
FOR UPDATE
TO authenticated
USING (auth.uid() = friend_id)
WITH CHECK (auth.uid() = friend_id);

-- 2) Pin search_path and lock down execute on internal email queue helpers.
ALTER FUNCTION public.delete_email(text, bigint)            SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb)            SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- 3) Revoke EXECUTE on definer functions only used by triggers/cron jobs.
REVOKE ALL ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_of_new_deal()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_search_history()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_security_audit_logs()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_location_data_retention()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_admin_role_if_authorized()       FROM PUBLIC, anon, authenticated;
