-- ============================================================
-- ProChefDesk v2.9.42 — Kitchen Whiteboard cloud sync
-- ============================================================
-- ARKA PLAN:
-- v2.9.40 Whiteboard tool LS-only başlangıç (single device).
-- v2.9.41 cell merge eklendi. Operatör onay verdi: çoklu cihaz +
-- workspace bazlı (her restoran kendi whiteboard listesi) için
-- cloud sync gerek.
--
-- BU MIGRATION 1 yeni tablo ekliyor (buffets/mise_plans/team
-- pattern'i ile birebir):
--   - whiteboards (workspace-scoped, isArray)
--
-- ÖNEMLİ:
--   - Hiçbir mevcut tablo dokunulmadı.
--   - Pattern v2.9.17 buffets/mise_plans/team ile birebir aynı
--     (id text PK, user_id uuid, workspace_id text, data jsonb,
--     created_at, updated_at, deleted_at).
--   - Mevcut local LS verisi (pcd_whiteboard_canvases_v2) ilk
--     boot'tan sonra frontend migration ile cloud'a aktarılacak.
--
-- DOĞRULAMA: SQL sonu doğrulama bloğunda.
-- ============================================================

BEGIN;

-- ============ 1. WHITEBOARDS ============
-- Kitchen Whiteboard kanvasları. Her kanvas ayrı row.
-- data shape: { id, name, title, paper, orient, rows, cols,
--               cells: [{r,c,text,color,fontSize,align,rowSpan,colSpan}],
--               updatedAt }
CREATE TABLE IF NOT EXISTS whiteboards (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS whiteboards_user_workspace_idx ON whiteboards (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS whiteboards_updated_at_idx ON whiteboards (user_id, updated_at DESC);

-- ============ 2. RLS ============
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whiteboards_select_own ON whiteboards;
DROP POLICY IF EXISTS whiteboards_insert_own ON whiteboards;
DROP POLICY IF EXISTS whiteboards_update_own ON whiteboards;
DROP POLICY IF EXISTS whiteboards_delete_own ON whiteboards;

CREATE POLICY whiteboards_select_own ON whiteboards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY whiteboards_insert_own ON whiteboards
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY whiteboards_update_own ON whiteboards
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY whiteboards_delete_own ON whiteboards
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ 3. updated_at TRIGGER ============
DROP TRIGGER IF EXISTS whiteboards_updated_at_trg ON whiteboards;
CREATE TRIGGER whiteboards_updated_at_trg
  BEFORE UPDATE ON whiteboards
  FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();

-- ============ 4. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE whiteboards; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 5. CASCADE TRIGGER UPDATE ============
-- v2.9.17 cascade fonksiyonları 21 ws-bound tablo. Şimdi 22.
-- CREATE OR REPLACE body — trigger bağlantısı korunur.

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
  -- v2.9.42: yeni tablo
  UPDATE whiteboards          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

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
  -- v2.9.42: yeni tablo
  UPDATE whiteboards          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 6. REPLICA IDENTITY ============
ALTER TABLE whiteboards REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışında, ayrı çalıştır):
--
-- 1. Tablo oluştu mu:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename = 'whiteboards';
--   Beklenen: 1 satır
--
-- 2. RLS açık mı:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'whiteboards';
--   Beklenen: rowsecurity = true
--
-- 3. Politikalar (4 tane):
--   SELECT COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'whiteboards';
--   Beklenen: 4
--
-- 4. Realtime publication'da mı:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'whiteboards';
--   Beklenen: 1 satır
--
-- 5. Cascade fonksiyonları güncel mi (whiteboards içeriyor mu):
--   SELECT routine_definition FROM information_schema.routines
--   WHERE routine_name = 'cascade_soft_delete_workspace_data';
--   Beklenen: text'te "UPDATE whiteboards" var
--
-- 6. Replica identity:
--   SELECT relname, relreplident FROM pg_class WHERE relname = 'whiteboards';
--   Beklenen: relreplident = 'f' (FULL)
--
-- KOD AYAĞI (v2.9.42 frontend commit'inde 6+ dosya):
--   - app/js/core/cloud-pertable.js     (+1 mapping isArray:true)
--   - app/js/core/cloud.js              (drift detection +1 tablo + pull)
--   - app/js/core/cloud-realtime.js     (TABLES +1 + applyChange switch)
--   - app/js/core/store.js              (state.whiteboards = {} initial)
--   - app/js/tools/whiteboard.js        (LS → store.js + queueArraySync)
--   - supabase/functions/backup-to-r2/index.ts (BACKUP_TABLES +1)
--   - app/js/core/config.js             (APP_VERSION 2.9.41 → 2.9.42)
-- ============================================================
