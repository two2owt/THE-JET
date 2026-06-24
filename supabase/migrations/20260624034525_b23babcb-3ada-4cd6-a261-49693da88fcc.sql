ALTER TABLE public.user_favorites
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS venue_address text,
  ADD COLUMN IF NOT EXISTS venue_image_url text,
  ADD COLUMN IF NOT EXISTS venue_category text,
  ADD COLUMN IF NOT EXISTS venue_neighborhood text,
  ADD COLUMN IF NOT EXISTS venue_lat numeric,
  ADD COLUMN IF NOT EXISTS venue_lng numeric;