-- app_config: signed-in users may read only the public flag; admins read everything
DROP POLICY IF EXISTS "app_config readable by authenticated" ON public.app_config;
DROP POLICY IF EXISTS "app_config public keys readable by authenticated" ON public.app_config;
CREATE POLICY "app_config public keys readable by authenticated" ON public.app_config FOR SELECT TO authenticated USING (key = 'monetization_enabled');
DROP POLICY IF EXISTS "app_config readable by admins" ON public.app_config;
CREATE POLICY "app_config readable by admins" ON public.app_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- map_data_pulse: bind reads to the single aggregate heartbeat row
DROP POLICY IF EXISTS "Authenticated users can read the map pulse" ON public.map_data_pulse;
DROP POLICY IF EXISTS "Authenticated users can read the singleton map pulse" ON public.map_data_pulse;
CREATE POLICY "Authenticated users can read the singleton map pulse" ON public.map_data_pulse FOR SELECT TO authenticated USING (id IS TRUE AND auth.uid() IS NOT NULL);

-- Public buckets serve files by URL without a SELECT policy; drop the broad listing policies
DROP POLICY IF EXISTS "Anyone can view deal images" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can list own avatar files" ON storage.objects;
CREATE POLICY "Users can list own avatar files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Admins can list deal images" ON storage.objects;
CREATE POLICY "Admins can list deal images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'deal-images' AND public.has_role(auth.uid(), 'admin'::app_role));