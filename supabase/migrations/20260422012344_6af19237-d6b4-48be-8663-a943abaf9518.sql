-- Make chat-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

-- Drop any existing overly-permissive policies on chat-images
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual LIKE '%chat-images%' OR with_check LIKE '%chat-images%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Users can upload chat images into their own folder (first path segment = user id)
CREATE POLICY "Chat images: users upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own chat images
CREATE POLICY "Chat images: users update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own chat images
CREATE POLICY "Chat images: users delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view chat images they uploaded OR images attached to messages where they are sender/recipient
CREATE POLICY "Chat images: sender or recipient can view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.image_url LIKE '%' || storage.objects.name || '%'
        AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
    )
  )
);