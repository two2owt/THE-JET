-- 1. Auto-handle generator (never derived from email)
CREATE OR REPLACE FUNCTION public.generate_auto_handle(_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'jet_' || substr(md5(_user_id::text), 1, 6)
$$;

REVOKE ALL ON FUNCTION public.generate_auto_handle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_auto_handle(uuid) TO authenticated, service_role;

-- 2. Track whether the user has picked their own name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name_claimed boolean NOT NULL DEFAULT false;

-- 3. Backfill: replace null / email-shaped display names with an auto-handle
UPDATE public.profiles
SET display_name = public.generate_auto_handle(id),
    display_name_claimed = false
WHERE display_name IS NULL
   OR btrim(display_name) = ''
   OR display_name LIKE '%@%';

UPDATE public.profiles
SET display_name_claimed = true
WHERE display_name IS NOT NULL
  AND btrim(display_name) <> ''
  AND display_name NOT LIKE '%@%'
  AND display_name <> public.generate_auto_handle(id)
  AND display_name_claimed = false;

-- 4. Signup trigger no longer falls back to the email address
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  meta_name text := nullif(btrim(new.raw_user_meta_data->>'display_name'), '');
BEGIN
  INSERT INTO public.profiles (id, display_name, display_name_claimed)
  VALUES (
    new.id,
    COALESCE(meta_name, public.generate_auto_handle(new.id)),
    meta_name IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();