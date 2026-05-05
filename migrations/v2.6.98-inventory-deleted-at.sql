-- ProChefDesk migration: add deleted_at column to inventory table
--
-- The original v2.6.66 schema for the inventory table did not include the
-- deleted_at column. This was discovered later when the cascade soft-delete
-- pattern (v2.6.98-cascade-triggers.sql) was extended to all 16 ws-scoped
-- tables — inventory was the one table missing the column. Without it, the
-- cascade trigger silently skipped inventory rows when a workspace was
-- soft-deleted, leaving orphan stock records in cloud sync state.
--
-- COLUMN
--   deleted_at  timestamp with time zone  NULL  (no default, no index)
--
-- IDEMPOTENT
--   ADD COLUMN IF NOT EXISTS — safe to re-run on any environment.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
