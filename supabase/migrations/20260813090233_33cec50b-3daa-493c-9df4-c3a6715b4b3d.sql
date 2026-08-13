
-- 1. Storage: remove broad listing policies on public buckets
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view deal images" ON storage.objects;

DROP POLICY IF EXISTS "Users can list own avatar folder" ON storage.objects;
CREATE POLICY "Users can list own avatar folder"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Admins can list deal images" ON storage.objects;
CREATE POLICY "Admins can list deal images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deal-images' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Analytics events: constrain inserts so anonymous rows cannot be attributed
DROP POLICY IF EXISTS "Authenticated users can insert own analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated users can insert own analytics events"
ON public.analytics_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Anon can insert anonymous analytics events" ON public.analytics_events;
CREATE POLICY "Anon can insert anonymous analytics events"
ON public.analytics_events FOR INSERT TO anon
WITH CHECK (user_id IS NULL);

-- 3. SECURITY DEFINER surface reduction
REVOKE EXECUTE ON FUNCTION public.can_view_profile_field(uuid, uuid, text) FROM authenticated;
