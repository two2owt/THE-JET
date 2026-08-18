DROP POLICY IF EXISTS "Users can view connected profiles with privacy" ON public.profiles;
DROP POLICY IF EXISTS "Users can view connected profiles" ON public.profiles;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can view their own profile row'
  ) THEN
    CREATE POLICY "Users can view their own profile row"
      ON public.profiles FOR SELECT TO authenticated
      USING (id = auth.uid());
  END IF;
END $$;