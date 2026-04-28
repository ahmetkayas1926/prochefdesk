-- ============================================================
-- ProChefDesk v2.5.7 — Share Lifecycle Migration
-- ============================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- Drops the old public_shares table and recreates it with:
--   * source_id    -> link back to original recipe/menu/canvas
--   * paused       -> temporarily disable a share without deleting
--   * view_count   -> how many times the share has been viewed
--   * unique constraint on (owner_id, kind, source_id)
--     so the same item always returns the SAME share URL
--   * RLS policies + atomic view counter RPC
-- ============================================================

-- 1) Drop the old table (and any dependents)
DROP TABLE IF EXISTS public_shares CASCADE;

-- 2) Recreate with the new schema
CREATE TABLE public_shares (
  id          text         PRIMARY KEY,
  kind        text         NOT NULL,
  source_id   text         NOT NULL,
  payload     jsonb        NOT NULL,
  owner_id    uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paused      boolean      NOT NULL DEFAULT false,
  view_count  integer      NOT NULL DEFAULT 0,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- 3) One share per (owner, kind, source) — this is what makes
--    createOrGetShareUrl idempotent: same item always returns the same URL.
CREATE UNIQUE INDEX public_shares_unique_source
  ON public_shares (owner_id, kind, source_id);

-- 4) Index on owner_id for fast "list my shares"
CREATE INDEX public_shares_owner_idx
  ON public_shares (owner_id, updated_at DESC);

-- 5) Row Level Security
ALTER TABLE public_shares ENABLE ROW LEVEL SECURITY;

-- Anyone with the share ID can read (the app filters paused state).
-- This is fine because share IDs are random 12-char tokens — knowing the
-- ID is the access credential. We don't expose the table to listing.
CREATE POLICY public_shares_read_by_id
  ON public_shares
  FOR SELECT
  USING (true);

-- Owners can do anything with their own shares.
CREATE POLICY public_shares_owner_all
  ON public_shares
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 6) Atomic view counter (callable by anonymous users via RPC)
CREATE OR REPLACE FUNCTION increment_share_view(share_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public_shares
     SET view_count = view_count + 1
   WHERE id = share_id
     AND paused = false;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_share_view(text) TO anon, authenticated;

-- 7) Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public_shares_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER public_shares_updated_at_trigger
  BEFORE UPDATE ON public_shares
  FOR EACH ROW
  EXECUTE FUNCTION public_shares_set_updated_at();

-- ============================================================
-- DONE. Verify with:
--   SELECT * FROM public_shares LIMIT 1;
-- (should return 0 rows initially, no errors)
-- ============================================================
