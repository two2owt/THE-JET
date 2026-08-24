CREATE TABLE public.profile_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text NOT NULL,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_social_links TO authenticated;
GRANT ALL ON public.profile_social_links TO service_role;

ALTER TABLE public.profile_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile social links"
ON public.profile_social_links
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profile_social_links_updated_at
BEFORE UPDATE ON public.profile_social_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();