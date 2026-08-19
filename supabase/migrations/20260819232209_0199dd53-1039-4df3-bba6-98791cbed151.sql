CREATE OR REPLACE VIEW public.discoverable_profiles
WITH (security_invoker = on) AS
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (
      p.discoverable IS TRUE
      OR EXISTS (
        SELECT 1 FROM public.user_connections uc
        WHERE (uc.user_id = auth.uid() AND uc.friend_id = p.id)
           OR (uc.friend_id = auth.uid() AND uc.user_id = p.id)
      )
    );

GRANT SELECT ON public.discoverable_profiles TO authenticated;