
-- Tighten profiles policies to authenticated role only (drop public role exposure)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view connected profiles with privacy" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can view connected profiles with privacy" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_connections
      WHERE status = 'accepted'
        AND ((user_id = auth.uid() AND friend_id = profiles.id)
          OR (friend_id = auth.uid() AND user_id = profiles.id))
    )
  );

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- Tighten venue_reviews: restrict SELECT scope
DROP POLICY IF EXISTS "Authenticated users can view reviews" ON public.venue_reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON public.venue_reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.venue_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.venue_reviews;

-- Authors and admins can see full review rows (including user_id)
CREATE POLICY "Authors and admins view reviews" ON public.venue_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Connected users can see each other's reviews (social graph)
CREATE POLICY "Connected users view reviews" ON public.venue_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_connections
      WHERE status = 'accepted'
        AND ((user_id = auth.uid() AND friend_id = venue_reviews.user_id)
          OR (friend_id = auth.uid() AND user_id = venue_reviews.user_id))
    )
  );

CREATE POLICY "Users can create their own reviews" ON public.venue_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" ON public.venue_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" ON public.venue_reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
