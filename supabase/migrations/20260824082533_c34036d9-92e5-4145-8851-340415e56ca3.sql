CREATE OR REPLACE FUNCTION public.discoverable_people(_limit integer DEFAULT 25)
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
  FROM public.profiles_visible() v
  JOIN public.profiles p ON p.id = v.id
  WHERE auth.uid() IS NOT NULL
    AND v.id <> auth.uid()
    AND COALESCE(v.discoverable, true)
  ORDER BY v.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 25), 100));
$$;

REVOKE ALL ON FUNCTION public.discoverable_people(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discoverable_people(integer) TO authenticated;