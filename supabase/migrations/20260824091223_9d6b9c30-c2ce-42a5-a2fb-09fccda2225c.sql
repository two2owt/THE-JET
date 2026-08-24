CREATE OR REPLACE FUNCTION public.social_profiles_rows()
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.social_profiles_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_profiles_rows() TO authenticated, service_role;

DROP VIEW IF EXISTS public.social_profiles;
CREATE VIEW public.social_profiles WITH (security_invoker = on) AS
  SELECT * FROM public.social_profiles_rows();

REVOKE ALL ON public.social_profiles FROM PUBLIC, anon, public;
GRANT SELECT ON public.social_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.social_people(_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, display_name text, avatar_url text, preference_tags text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id,
         v.display_name,
         v.avatar_url,
         COALESCE(
           (SELECT array_agg(t.tag ORDER BY t.ord)
              FROM (
                SELECT elem::text AS tag, ord
                  FROM jsonb_array_elements_text(
                         CASE WHEN jsonb_typeof(p.preferences->'dealTypes') = 'array'
                              THEN p.preferences->'dealTypes' ELSE '[]'::jsonb END
                       ) WITH ORDINALITY AS x(elem, ord)
              ) t
           ),
           ARRAY[]::text[]
         ) AS preference_tags
  FROM public.social_profiles_rows() v
  JOIN public.profiles p ON p.id = v.id
  ORDER BY v.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 25), 100));
$$;

REVOKE ALL ON FUNCTION public.social_people(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_people(integer) TO authenticated;

DROP POLICY IF EXISTS "Users read pulses for profiles they can see" ON public.profile_pulse;
DROP POLICY IF EXISTS "Authenticated users can read profile pulse" ON public.profile_pulse;
CREATE POLICY "Authenticated users can read profile pulse"
  ON public.profile_pulse FOR SELECT TO authenticated USING (true);

-- idempotency-check: allow-dml
UPDATE public.realtime_guard_allowlist
SET sensitivity = 'private',
    note = 'Heartbeat only (profile id + created/updated flag + timestamp). All authenticated users can read because /social surfaces every signed-up user.'
WHERE table_name = 'profile_pulse';