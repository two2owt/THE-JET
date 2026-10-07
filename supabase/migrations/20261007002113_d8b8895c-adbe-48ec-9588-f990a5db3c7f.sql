-- Scope public.profile_pulse reads to profiles the viewer is permitted to see.
--
-- profile_pulse is consumed exclusively over realtime postgres_changes;
-- surfaces refetch actual profile data through the RLS-scoped
-- `discoverable_profiles` view. The previous policy used USING (true),
-- which let every signed-in user's realtime stream carry every pulse.
-- This aligns the pulse stream with the same visibility model the view
-- already enforces: own profile, discoverable profiles, or connections.

CREATE OR REPLACE FUNCTION public.profile_pulse_visible(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _profile_id
        AND (
          COALESCE(p.discoverable, true)
          OR EXISTS (
            SELECT 1
            FROM public.user_connections uc
            WHERE (uc.user_id = auth.uid() AND uc.friend_id = p.id)
               OR (uc.friend_id = auth.uid() AND uc.user_id = p.id)
          )
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.profile_pulse_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_pulse_visible(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can read profile pulse" ON public.profile_pulse;
DROP POLICY IF EXISTS "Profile pulse readable for visible profiles" ON public.profile_pulse;
CREATE POLICY "Profile pulse readable for visible profiles"
ON public.profile_pulse
FOR SELECT
TO authenticated
USING (public.profile_pulse_visible(profile_id));