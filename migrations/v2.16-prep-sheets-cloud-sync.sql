-- ============================================================
-- ProChefDesk v2.16 — Prep Sheet (dish prep checklist) cloud sync
-- ============================================================
-- BACKGROUND:
-- v2.16 Prep Sheet tool: dish → components (+ blank box for handwritten
-- quantities), printed and laminated. Operator approved cloud sync:
-- multi-device + workspace-scoped (each restaurant its own list).
--
-- THIS MIGRATION adds 1 new table, MAP-shaped workspace-scoped
-- (recipes / rosters / stock_count_history pattern — NOT array pattern):
--   - prep_sheets
--
-- IMPORTANT:
--   - No existing table touched (cascade funcs are CREATE OR REPLACE,
--     same body as v2.15.3 + the new prep_sheets line).
--   - Same schema shape as every workspace-scoped table
--     (id text PK, user_id uuid, workspace_id text, data jsonb,
--      created_at, updated_at, deleted_at).
--   - Existing local IDB prep sheets are pushed to cloud on first boot
--     after deploy (per-table push picks them up).
-- ============================================================

BEGIN;

-- ============ 1. PREP_SHEETS ============
-- One prep sheet = one row.
-- data shape: { id, name, columns,
--               dishes:[{ id, recipeId|null, name,
--                         components:[{ id, text }] }],
--               updatedAt }
CREATE TABLE IF NOT EXISTS prep_sheets (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS prep_sheets_user_workspace_idx ON prep_sheets (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS prep_sheets_updated_at_idx ON prep_sheets (user_id, updated_at DESC);

-- ============ 2. RLS ============
ALTER TABLE prep_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prep_sheets_select_own ON prep_sheets;
DROP POLICY IF EXISTS prep_sheets_insert_own ON prep_sheets;
DROP POLICY IF EXISTS prep_sheets_update_own ON prep_sheets;
DROP POLICY IF EXISTS prep_sheets_delete_own ON prep_sheets;

CREATE POLICY prep_sheets_select_own ON prep_sheets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY prep_sheets_insert_own ON prep_sheets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY prep_sheets_update_own ON prep_sheets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY prep_sheets_delete_own ON prep_sheets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ 3. updated_at TRIGGER ============
DROP TRIGGER IF EXISTS prep_sheets_updated_at_trg ON prep_sheets;
CREATE TRIGGER prep_sheets_updated_at_trg
  BEFORE UPDATE ON prep_sheets
  FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();

-- ============ 4. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE prep_sheets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 5. CASCADE TRIGGER UPDATE ============
-- Add prep_sheets to the workspace soft-delete / restore cascade functions.
-- CREATE OR REPLACE body (same as v2.15.3 + prep_sheets) — trigger binding preserved.

CREATE OR REPLACE FUNCTION cascade_soft_delete_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE ingredients          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE menus                SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE events               SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE suppliers            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE canvases             SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE shopping_lists       SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE checklist_templates  SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE inventory            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE waste                SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE checklist_sessions   SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE stock_count_history  SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_logs           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_units          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_readings       SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_cook_cool      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_receiving      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_holding        SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE buffets              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE mise_plans           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE team                 SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE whiteboards          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE rosters              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  -- v2.16: new table
  UPDATE prep_sheets          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  UPDATE workspaces SET deleted_at = NEW.deleted_at WHERE id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cascade_restore_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE ingredients          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE menus                SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE events               SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE suppliers            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE canvases             SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE shopping_lists       SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE checklist_templates  SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE inventory            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE waste                SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE checklist_sessions   SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE stock_count_history  SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_logs           SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_units          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_readings       SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_cook_cool      SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_receiving      SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_holding        SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE buffets              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE mise_plans           SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE team                 SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE whiteboards          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE rosters              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  -- v2.16: new table
  UPDATE prep_sheets          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 6. REPLICA IDENTITY ============
ALTER TABLE prep_sheets REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- VERIFY (run separately, outside BEGIN/COMMIT):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='prep_sheets';        -- 1 row
--   SELECT rowsecurity FROM pg_tables WHERE tablename='prep_sheets';                              -- true
--   SELECT COUNT(*) FROM pg_policies WHERE tablename='prep_sheets';                               -- 4
--   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='prep_sheets'; -- 1 row
--
-- CODE FOOTPRINT (v2.16 frontend, MAP-table pattern like rosters):
--   - app/js/tools/prep.js            (NEW tool)
--   - app/js/core/app.js              (registerLazy + nav item)
--   - app/js/core/store.js            (state.prepSheets={} + _stateKeyToSqlTable + ws-table lists)
--   - app/js/core/cloud-pertable.js   (WORKSPACE_TABLES + pullAll fetch + packByWs + wipe + queueFullState)
--   - app/js/core/cloud-realtime.js   (applyChange + TABLES + WS_BOUND_TABLES)
--   - app/js/core/cloud.js            (ghost-ws + HIGH_EDIT + drift wsTables)
--   - supabase/functions/backup-to-r2/index.ts (BACKUP_TABLES +1)
--   - app/js/i18n/en.js + tr.js       (prep_* keys + t_prep_title nav label)
--   - app/js/core/config.js           (APP_VERSION → 2.16.0)
--
-- AFTER RUNNING THIS MIGRATION:
--   1. Re-deploy backup-to-r2 Edge Function (so prep_sheets is backed up).
--   Without this migration, prep sheet cloud push returns 400/404 (table
--   missing) — local IDB keeps working; cloud activates once table exists.
-- ============================================================
