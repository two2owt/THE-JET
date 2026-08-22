-- idempotency-check: allow-dml
-- messages and email_send_log were restored to the realtime publication but
-- their guard allowlist rows were missing, tripping the realtime guard audit.
-- idempotency-check: allow-dml
INSERT INTO public.realtime_guard_allowlist (table_name, sensitivity, note, allow_replica_identity_full)
VALUES
  ('messages', 'private', 'Direct messages; RLS scopes rows to sender/recipient.', false),
  ('email_send_log', 'private', 'Admin-only email delivery log; RLS restricts reads to admins.', false)
ON CONFLICT (table_name) DO NOTHING;