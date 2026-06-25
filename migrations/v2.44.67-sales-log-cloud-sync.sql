-- ============================================================
-- ProChefDesk v2.44.67 — Sales Log cloud sync
-- ============================================================
-- BACKGROUND:
-- v2.44.x "Record sales" (Inventory) artık her satışı tarihli salesLog'a
-- yazıyor (id, date, recipeId, qty). Bunu Variance "Load from sales",
-- Menu Engineering dönem-popülerliği ve Dashboard "Today P&L" okuyor.
-- Şimdiye kadar salesLog YALNIZ yereldi. Operatör onayı: çoklu cihaz +
-- workspace-scoped (her restoran kendi satış kaydı) için cloud sync.
--
-- THIS MIGRATION adds 1 new table, ARRAY-shaped workspace-scoped
-- (waste / checklist_sessions / buffets pattern — append-only log):
--   - sales_log
--
-- IMPORTANT:
--   - Hiçbir mevcut tablo DROP edilmez / dokunulmaz.
--   - Şema her workspace-scoped tablo ile aynı (id text PK, user_id uuid,
--     workspace_id text, data jsonb, created_at, updated_at, deleted_at).
--   - Mevcut yerel IDB salesLog kayıtları deploy sonrası ilk boot'ta
--     per-table push ile buluta gider (queueArraySync).
--   - 3 DB mekanizması birlikte güncellenir (v2.44.26 notu):
--     cascade_soft_delete_workspace_data · cascade_restore_workspace_data
--     · pcd_purge_workspace.
-- ============================================================

BEGIN;

-- ============ 1. SALES_LOG ============
-- Bir satış kaydı = bir row. Append-only (asla düzenlenmez).
-- data shape: { id, date: 'YYYY-MM-DD', recipeId, qty }
CREATE TABLE IF NOT EXISTS sales_log (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS sales_log_user_workspace_idx ON sales_log (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS sales_log_updated_at_idx ON sales_log (user_id, updated_at DESC);

-- ============ 2. RLS ============
ALTER TABLE sales_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_log_select_own ON sales_log;
DROP POLICY IF EXISTS sales_log_insert_own ON sales_log;
DROP POLICY IF EXISTS sales_log_update_own ON sales_log;
DROP POLICY IF EXISTS sales_log_delete_own ON sales_log;

CREATE POLICY sales_log_select_own ON sales_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY sales_log_insert_own ON sales_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY sales_log_update_own ON sales_log
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sales_log_delete_own ON sales_log
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ 3. updated_at TRIGGER ============
DROP TRIGGER IF EXISTS sales_log_updated_at_trg ON sales_log;
CREATE TRIGGER sales_log_updated_at_trg
  BEFORE UPDATE ON sales_log
  FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();

-- ============ 4. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 5. CASCADE TRIGGER UPDATE ============
-- v2.16 + sales_log. CREATE OR REPLACE body — trigger bağlantısı korunur.

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
  UPDATE prep_sheets          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  -- v2.44.67: yeni tablo
  UPDATE sales_log            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

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
  UPDATE prep_sheets          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  -- v2.44.67: yeni tablo
  UPDATE sales_log            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 6. PURGE (hard-delete) UPDATE ============
-- v2.44.26 ws_tables (24) + sales_log = 25. Davranış aynı, liste tam.
CREATE OR REPLACE FUNCTION public.pcd_purge_workspace(
  p_workspace_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  ws_tables text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
    'haccp_receiving', 'haccp_holding',
    'buffets', 'mise_plans', 'team', 'whiteboards',
    'rosters', 'prep_sheets',
    -- v2.44.67 — yeni tablo
    'sales_log'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE workspace_id = $1 AND user_id = $2',
      t
    ) USING p_workspace_id, p_user_id;
  END LOOP;

  DELETE FROM workspaces
  WHERE id = p_workspace_id AND user_id = p_user_id;

  DELETE FROM workspace_tombstones
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$function$;

-- ============ 7. REPLICA IDENTITY ============
ALTER TABLE sales_log REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışında, ayrı çalıştır):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='sales_log';        -- 1 row
--   SELECT rowsecurity FROM pg_tables WHERE tablename='sales_log';                              -- true
--   SELECT COUNT(*) FROM pg_policies WHERE tablename='sales_log';                               -- 4
--   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='sales_log'; -- 1 row
--   SELECT relreplident FROM pg_class WHERE relname='sales_log';                                -- f (FULL)
--   SELECT pg_get_functiondef('public.pcd_purge_workspace(text,uuid)'::regprocedure) LIKE '%sales_log%';    -- true
--
-- KOD AYAĞI (v2.44.67 frontend — array-tablo pattern, waste ile birebir):
--   - app/js/core/store.js              (state.salesLog={} + ws-table lists + trim)
--   - app/js/core/cloud-pertable.js     (WORKSPACE_TABLES + pullAll fetch + pack + wipe + queueFullState)
--   - app/js/core/cloud-realtime.js     (applyChange + WS_BOUND_TABLES + TABLES)
--   - app/js/core/cloud.js              (ghost-ws wsTables + ARRAY_WS_TABLES)
--   - app/js/tools/inventory.js         (Record sales write → queueArraySync)
--   - supabase/functions/backup-to-r2/index.ts (BACKUP_TABLES +1)
--   - app/js/core/config.js             (APP_VERSION 2.44.66 → 2.44.67)
--
-- MIGRATION SONRASI:
--   1. backup-to-r2 Edge Function'ı yeniden deploy et (sales_log nightly archive'a girsin).
--   Bu migration çalışmadan salesLog cloud push 400/404 döner — yerel IDB çalışmaya
--   devam eder, tablo oluşunca cloud aktifleşir.
-- ============================================================
