-- =============================================================================
-- 1) CRITICAL: Drop the broad public SELECT policy on chat-images bucket.
--    The scoped "sender or recipient" policy remains and is the only path in.
-- =============================================================================
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND cmd        = 'SELECT'
      AND (
        policyname ILIKE '%anyone%chat%image%'
        OR policyname ILIKE '%public%chat%image%'
        OR policyname ILIKE '%chat-images%public%'
        OR policyname ILIKE '%chat_images_public%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- Belt-and-suspenders: drop any remaining permissive SELECT policy on
-- storage.objects for chat-images that grants access to anon or public.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT pol.policyname, pol.roles
    FROM pg_policies pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename  = 'objects'
      AND pol.cmd        = 'SELECT'
      AND pol.qual ILIKE '%chat-images%'
      AND (
        'public' = ANY(pol.roles) OR 'anon' = ANY(pol.roles)
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- =============================================================================
-- 2) Revoke EXECUTE from PUBLIC and anon on every SECURITY DEFINER function in
--    the public schema. Signed-in users keep the grants app features need.
-- =============================================================================
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT n.nspname AS schema_name,
           p.proname  AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      f.schema_name, f.func_name, f.args
    );
  END LOOP;
END $$;