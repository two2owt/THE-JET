-- Allow user_favorites to reference either an active deal (deal_id uuid) or
-- a map venue (venue_id text). Both columns are nullable individually, but
-- at least one must be present, and the pair must be unique per user.

ALTER TABLE public.user_favorites
  ADD COLUMN IF NOT EXISTS venue_id text;

ALTER TABLE public.user_favorites
  ALTER COLUMN deal_id DROP NOT NULL;

-- Drop the legacy unique constraint on (user_id, deal_id) if present so we
-- can replace it with one that accounts for venue_id as well.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_favorites'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(user_id, deal_id)%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_favorites DROP CONSTRAINT %I', con_name);
  END IF;
END$$;

-- Ensure at least one target is set.
ALTER TABLE public.user_favorites
  DROP CONSTRAINT IF EXISTS user_favorites_target_present;
ALTER TABLE public.user_favorites
  ADD CONSTRAINT user_favorites_target_present
  CHECK (deal_id IS NOT NULL OR venue_id IS NOT NULL);

-- Unique per user per (deal_id, venue_id). NULLs are distinct in Postgres, so
-- pair-uniqueness is enforced via partial indexes per target type.
CREATE UNIQUE INDEX IF NOT EXISTS user_favorites_user_deal_uidx
  ON public.user_favorites (user_id, deal_id)
  WHERE deal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_favorites_user_venue_uidx
  ON public.user_favorites (user_id, venue_id)
  WHERE venue_id IS NOT NULL;