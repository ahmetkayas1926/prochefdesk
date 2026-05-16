-- ============================================================
-- ProChefDesk v2.8.44 — HACCP Receiving + Holding cloud sync
-- ============================================================
-- ARKA PLAN:
-- v2.8.38-v2.8.39'da iki yeni HACCP tool'u eklendi:
--   - haccp_receiving (mal kabul kayıtları)
--   - haccp_holding   (sıcak/soğuk tutma kontrolleri)
--
-- O sürümlerde sadece frontend + IDB persistence vardı; cloud sync
-- kapsamlı CLAUDE.md onayı gerektirdiği için ertelenmişti.
-- v2.8.44 — onay alındı, cloud sync devreye alınıyor.
--
-- BU MIGRATION:
--   1) 2 yeni tablo (idempotent, mevcut HACCP pattern'i ile birebir)
--   2) RLS aktif + 4 policy/tablo (SELECT/INSERT/UPDATE/DELETE)
--   3) updated_at trigger (mevcut pcd_set_updated_at fonksiyonu)
--   4) Realtime publication'a ekleme
--   5) cascade_soft_delete_workspace_data + cascade_restore_workspace_data
--      fonksiyonlarına yeni 2 tabloyu ekle (workspace silindiğinde child
--      satırlar cloud'da da soft-delete edilsin)
--
-- ÖNEMLİ:
--   - Hiçbir mevcut tablo dokunulmadı.
--   - Pattern v2.6.71'deki HACCP tabloları ile birebir aynı
--     (id text PK, user_id uuid, workspace_id text, data jsonb,
--      created_at, updated_at, deleted_at).
--   - Mevcut local IDB verisi (haccp_receiving + haccp_holding) bu
--     migration sonrası ilk push'ta cloud'a sync olacak (drift detection
--     v2.8.33'ten beri local-only → cloud yayılımını otomatik yapıyor).
-- ============================================================

BEGIN;

-- ============ 1. HACCP RECEIVING ============
-- Mal kabul kayıtları. Şef tedarikçiden gelen mal'ı satır satır loglar.
-- data shape: { date, rowIndex, supplier, productName, quantity,
--               quantityUnit, deliveryTemp, expiryDate, conditionOK,
--               note, chef }
CREATE TABLE IF NOT EXISTS haccp_receiving (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_receiving_user_workspace_idx ON haccp_receiving (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS haccp_receiving_updated_at_idx ON haccp_receiving (user_id, updated_at DESC);

-- ============ 2. HACCP HOLDING ============
-- Sıcak/soğuk tutma kontrolleri. Yemek-bazlı saatlik check.
-- data shape: { date, rowIndex, holdType ('hot'|'cold'), foodName,
--               location, check1Temp, check1Time, check2Temp,
--               check2Time, check3Temp, check3Time, correctiveAction,
--               chef }
CREATE TABLE IF NOT EXISTS haccp_holding (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_holding_user_workspace_idx ON haccp_holding (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS haccp_holding_updated_at_idx ON haccp_holding (user_id, updated_at DESC);

-- ============ 3. RLS ============
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['haccp_receiving', 'haccp_holding'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_own ON %I;', tbl, tbl);

    EXECUTE format(
      'CREATE POLICY %I_select_own ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_insert_own ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_update_own ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_delete_own ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id);',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============ 4. updated_at TRIGGER ============
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['haccp_receiving', 'haccp_holding'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at_trg ON %I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at_trg BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============ 5. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_receiving; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_holding;   EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 6. CASCADE TRIGGER UPDATE ============
-- v2.6.98'de eklenen cascade_soft_delete_workspace_data ve v2.7.0'da
-- eklenen cascade_restore_workspace_data fonksiyonları workspace
-- silindiğinde / restore edildiğinde 16 ws-bound tabloya cascade soft
-- delete / restore uyguluyor. Yeni 2 tabloyu da bu zincire eklemek
-- gerekiyor — aksi halde workspace silinince haccp_receiving + holding
-- satırları cloud'da kalır, bir sonraki pull'da diğer cihaza geri sızar.
--
-- Fonksiyonların tamamını yeniden yaratıyoruz (CREATE OR REPLACE).
-- Bu sadece body'i değiştirir, trigger bağlantıları korunur.

CREATE OR REPLACE FUNCTION cascade_soft_delete_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  -- 16 + 2 = 18 ws-bound tablo. NEW row workspace_tombstones'tan geliyor
  -- (workspace_id text PK, user_id uuid, deleted_at timestamptz, created_at).
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
  -- v2.8.44: yeni 2 tablo
  UPDATE haccp_receiving      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_holding        SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  -- workspaces flat tablosunda da deleted_at set
  UPDATE workspaces SET deleted_at = NEW.deleted_at WHERE id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cascade_restore_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  -- workspace_tombstones'tan DELETE event. OLD.workspace_id ve OLD.user_id
  -- mevcut (tombstone PK = workspace_id, user_id de NOT NULL).
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
  -- v2.8.44: yeni 2 tablo
  UPDATE haccp_receiving      SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_holding        SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 7. REPLICA IDENTITY ============
-- v2.6.77'de DELETE event payload'unun tüm sütunları içermesi için
-- FULL identity verildi. Yeni 2 tablo için aynısı.
ALTER TABLE haccp_receiving REPLICA IDENTITY FULL;
ALTER TABLE haccp_holding   REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- 1. Tablolar oluştu mu:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('haccp_receiving','haccp_holding');
--   Beklenen: 2 satır
--
-- 2. RLS açık mı:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('haccp_receiving','haccp_holding');
--   Beklenen: rowsecurity = true
--
-- 3. Politikalar var mı (her tablo için 4):
--   SELECT tablename, COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public'
--   AND tablename IN ('haccp_receiving','haccp_holding')
--   GROUP BY tablename;
--   Beklenen: 2 satır, hepsi count=4
--
-- 4. Realtime publication'da mı:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('haccp_receiving','haccp_holding');
--   Beklenen: 2 satır
--
-- 5. Cascade trigger fonksiyonları update'lendi mi:
--   SELECT routine_name, last_altered FROM information_schema.routines
--   WHERE routine_name IN ('cascade_soft_delete_workspace_data',
--                          'cascade_restore_workspace_data');
--   Beklenen: 2 satır, last_altered bugünün tarihi
--
-- 6. Anon erişimi engelli:
--   Supabase Dashboard → Table Editor → haccp_receiving
--   → "View as: anon" → 0 rows görünmeli
--
-- KOD AYAĞI:
-- v2.8.44 frontend commit'inde aşağıdaki 5 dosya güncelleniyor:
--   - app/js/core/store.js              (+2 mapping)
--   - app/js/core/cloud-pertable.js     (WORKSPACE_TABLES + fetches + destructure + packByWs + wipe + queueFullState)
--   - app/js/core/cloud.js              (drift detection wsTables +2 pair)
--   - app/js/core/cloud-realtime.js     (TABLES +2 + applyChange switch +2 case)
--   - app/js/core/config.js             (APP_VERSION 2.8.43 → 2.8.44)
-- ============================================================
