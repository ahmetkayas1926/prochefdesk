-- ============================================================
-- ProChefDesk v2.15.3 — Roster (staff shift schedule) cloud sync
-- ============================================================
-- BACKGROUND:
-- v2.15.1 Roster tool shipped local-only (single device). Operator
-- approved cloud sync: multi-device + workspace-scoped (each restaurant
-- its own roster list).
--
-- THIS MIGRATION adds 1 new table, MAP-shaped workspace-scoped
-- (recipes / stock_count_history pattern — NOT the array pattern):
--   - rosters
--
-- IMPORTANT:
--   - No existing table touched.
--   - Same schema shape as every workspace-scoped table
--     (id text PK, user_id uuid, workspace_id text, data jsonb,
--      created_at, updated_at, deleted_at).
--   - Existing local IDB rosters are pushed to cloud on first boot
--     after deploy (per-table push picks them up).
-- ============================================================

BEGIN;

-- ============ 1. ROSTERS ============
-- Weekly staff roster. Each week = one row.
-- data shape: { id, name, weekStart, dayCount, staff:[{id,name,role,rate}],
--               templates:[{id,label,start,end}],
--               cells:{ [staffId]: { [dayIdx]: {start,end,note} } }, updatedAt }
CREATE TABLE IF NOT EXISTS rosters (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS rosters_user_workspace_idx ON rosters (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS rosters_updated_at_idx ON rosters (user_id, updated_at DESC);

-- ============ 2. RLS ============
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rosters_select_own ON rosters;
DROP POLICY IF EXISTS rosters_insert_own ON rosters;
DROP POLICY IF EXISTS rosters_update_own ON rosters;
DROP POLICY IF EXISTS rosters_delete_own ON rosters;

CREATE POLICY rosters_select_own ON rosters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY rosters_insert_own ON rosters
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY rosters_update_own ON rosters
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY rosters_delete_own ON rosters
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ 3. updated_at TRIGGER ============
DROP TRIGGER IF EXISTS rosters_updated_at_trg ON rosters;
CREATE TRIGGER rosters_updated_at_trg
  BEFORE UPDATE ON rosters
  FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();

-- ============ 4. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE rosters; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 5. CASCADE TRIGGER UPDATE ============
-- Add rosters to the workspace soft-delete / restore cascade functions.
-- CREATE OR REPLACE body — trigger binding preserved.

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
  -- v2.15.3: new table
  UPDATE rosters              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

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
  -- v2.15.3: new table
  UPDATE rosters              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 6. REPLICA IDENTITY ============
ALTER TABLE rosters REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- VERIFY (run separately, outside BEGIN/COMMIT):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='rosters';        -- 1 row
--   SELECT rowsecurity FROM pg_tables WHERE tablename='rosters';                              -- true
--   SELECT COUNT(*) FROM pg_policies WHERE tablename='rosters';                               -- 4
--   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='rosters'; -- 1 row
--
-- CODE FOOTPRINT (v2.15.3 frontend, MAP-table pattern like stock_count_history):
--   - app/js/core/store.js            (state.rosters={} + _stateKeyToSqlTable + ws-table lists)
--   - app/js/core/cloud-pertable.js   (WORKSPACE_TABLES + pullAll fetch + packByWs + wipe + queueFullState)
--   - app/js/core/cloud-realtime.js   (applyChange + TABLES + WS_BOUND_TABLES)
--   - app/js/core/cloud.js            (drift wsTables + cascade wsTables)
--   - supabase/functions/backup-to-r2/index.ts (BACKUP_TABLES +1)
--   - app/js/core/config.js           (APP_VERSION → 2.15.3)
-- ============================================================
