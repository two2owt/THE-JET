-- Tighten profile_pulse visibility: heartbeats should only stream to users
-- who are allowed to see that profile at all.
DROP POLICY IF EXISTS "Authenticated users can read profile pulse" ON public.profile_pulse;

DROP POLICY IF EXISTS "Users read pulses for profiles they can see" ON public.profile_pulse;
CREATE POLICY "Users read pulses for profiles they can see"
ON public.profile_pulse
FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_connections uc
    WHERE uc.status = 'accepted'
      AND (
        (uc.user_id = auth.uid() AND uc.friend_id = public.profile_pulse.profile_id)
        OR (uc.friend_id = auth.uid() AND uc.user_id = public.profile_pulse.profile_id)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = public.profile_pulse.profile_id
      AND p.discoverable = true
  )
);

GRANT SELECT ON public.profile_pulse TO authenticated;
REVOKE ALL ON public.profile_pulse FROM anon;
GRANT ALL ON public.profile_pulse TO service_role;

-- idempotency-check: allow-dml
UPDATE public.realtime_guard_allowlist
SET sensitivity = 'private',
    note = 'Heartbeat only (profile id + created/updated flag + timestamp). Reads scoped to self, accepted connections and discoverable profiles.'
WHERE table_name = 'profile_pulse';