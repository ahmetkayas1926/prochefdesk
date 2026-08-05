-- ============================================================================
-- ProChefDesk v2.44.169b — Workspace cascade: DOĞRU fonksiyonu düzelt
-- ============================================================================
-- NEDEN AYRI DOSYA:
--   v2.44.169-audit-fixes.sql `cascade_soft_delete_workspace_data` /
--   `cascade_restore_workspace_data` fonksiyonlarını güncelledi — repo'daki
--   migration'lar bu isimleri kullanıyor. AMA canlı veritabanında tetikleyiciler
--   BAŞKA fonksiyonlara bağlı:
--
--     workspace_tombstones -> trg_cascade_workspace_tombstone         -> trg_cascade_workspace_tombstone()
--     workspace_tombstones -> trg_reverse_cascade_workspace_tombstone -> trg_reverse_cascade_workspace_tombstone()
--
--   Bu iki fonksiyon ESKİ tablo listesinde kalmış (sales_log / rosters /
--   buffets / whiteboards / prep_sheets / haccp_receiving / haccp_holding YOK).
--   Sonuç: workspace silinince bu 7 tablonun satırları `deleted_at` almıyor,
--   canlı kalıyor; 30 gün sonra temizlik workspaces satırını silince sahipsiz
--   kalıyorlar ve bir daha hiç temizlenmiyorlar.
--
--   Canlı testte iki kez doğrulandı: menus/suppliers/waste doğru silindi,
--   yukarıdaki 7 tablo canlı kaldı.
--
-- BU DOSYA: tetikleyicilerin gerçekten çağırdığı iki fonksiyonu 25 tabloyu
--   kapsayacak şekilde günceller. Tetikleyicilerin kendisine DOKUNULMAZ
--   (CREATE OR REPLACE gövdeyi değiştirir, bağlantı korunur).
--
-- ÇALIŞTIRMA: Supabase → SQL Editor → tamamını yapıştır → Run. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tombstone eklenince (workspace silinince) → çocukları soft-delete et
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_cascade_workspace_tombstone()
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
  -- v2.44.169b — canlıda eksik olan 7 tablo (+ mise_plans/team):
  UPDATE haccp_receiving      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_holding        SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE buffets              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE mise_plans           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE team                 SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE whiteboards          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE rosters              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE prep_sheets          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE sales_log            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  UPDATE workspaces SET deleted_at = NEW.deleted_at WHERE id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 2) Tombstone silinince (workspace geri yüklenince) → çocukları geri getir
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_reverse_cascade_workspace_tombstone()
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
  UPDATE sales_log            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DOĞRULAMA (çalıştırdıktan sonra):
--   SELECT proname,
--          prosrc LIKE '%sales_log%'       AS sales_log,
--          prosrc LIKE '%rosters%'         AS rosters,
--          prosrc LIKE '%buffets%'         AS buffets,
--          prosrc LIKE '%haccp_holding%'   AS haccp_holding
--   FROM pg_proc
--   WHERE proname IN ('trg_cascade_workspace_tombstone',
--                     'trg_reverse_cascade_workspace_tombstone');
--   → dört sütun da true olmalı.
-- ============================================================================
