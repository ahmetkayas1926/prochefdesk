-- ============================================================
-- ProChefDesk v2.5.9 — Recipe Photos Storage RLS
-- ============================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor.
--
-- The 'recipe-photos' bucket was created via the dashboard as PUBLIC,
-- so anonymous users can already READ photos (which is what we want —
-- the <img src="..."> tag in recipe cards needs no auth).
--
-- This migration adds policies that let authenticated users
-- INSERT (upload) photos into their own folder, and DELETE only their
-- own photos. Each user's photos live under '{user_id}/...' to keep
-- ownership unambiguous.
-- ============================================================

-- INSERT: authenticated users can upload to their own folder.
CREATE POLICY "Users can upload own recipe photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: authenticated users can replace their own files.
CREATE POLICY "Users can update own recipe photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: authenticated users can delete their own files.
CREATE POLICY "Users can delete own recipe photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- (SELECT is already permitted because the bucket is PUBLIC.)

-- ============================================================
-- DONE. Test by uploading a recipe photo from the app.
-- ============================================================
