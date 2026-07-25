CREATE OR REPLACE FUNCTION public.admin_list_user_emails()
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;