-- ============================================================
-- ProChefDesk v2.6.71 — Multi-device sync, Faz 4 Adım 1
-- Eksik tabloların şeması (additive, hiçbir mevcut veri etkilenmiyor)
-- ============================================================
-- ARKA PLAN:
-- v2.6.66'da per-table sync için 11 tablo eklendi (workspaces, recipes,
-- ingredients, menus, events, suppliers, canvases, shopping_lists,
-- checklist_templates, inventory, user_prefs).
--
-- Ancak şu state alanları o şemaya dahil EDİLMEDİ:
--   - waste                  (workspace-scoped, item array)
--   - checklistSessions      (workspace-scoped, item array)
--   - stockCountHistory      (workspace-scoped, id-keyed map)
--   - haccpLogs              (workspace-scoped, id-keyed map)
--   - haccpUnits             (workspace-scoped, id-keyed map)
--   - haccpReadings          (workspace-scoped, id-keyed map)
--   - haccpCookCool          (workspace-scoped, id-keyed map)
--   - costHistory            (user-scoped, item array — ws YOK)
--   - _deletedWorkspaces     (user-scoped, tombstone map — ws YOK)
--
-- Faz 4'te eski user_data blob'tan yeni tablolara geçiş yapılacak.
-- Bu geçişten ÖNCE hedef tablolar mevcut olmalı, yoksa migration
-- bu 9 veri kümesini kaybeder.
--
-- BU MIGRATION:
--   1) 9 yeni tablo (idempotent)
--   2) RLS açık + 4 policy/tablo (SELECT/INSERT/UPDATE/DELETE)
--   3) updated_at trigger (mevcut pcd_set_updated_at fonksiyonu kullanılıyor)
--   4) Realtime publication'a ekleme
--
-- ÖNEMLİ:
--   - Hiçbir mevcut tablo dokunulmadı. user_data blob aynen çalışıyor.
--   - Pattern v2.6.66 ile birebir aynı (id text PK, user_id uuid,
--     workspace_id text [gerekirse], data jsonb, created_at,
--     updated_at, deleted_at).
--   - workspace_tombstones özel: PK doğrudan workspace_id (text), ws
--     başına 1 satır.
--   - cost_history user-scoped, workspace_id kolonu YOK.
-- ============================================================

BEGIN;

-- ============ 1. WASTE ============
-- Atık kayıtları. Şef workspace bazında atılan malzemeleri loglar.
-- State'te { wsId: [array] }, her item id'li.
CREATE TABLE IF NOT EXISTS waste (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS waste_user_workspace_idx ON waste (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS waste_updated_at_idx ON waste (user_id, updated_at DESC);

-- ============ 2. CHECKLIST SESSIONS ============
-- Tamamlanmış checklist oturumları. Geçmiş günlerin checklist tikleri.
CREATE TABLE IF NOT EXISTS checklist_sessions (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS checklist_sessions_user_workspace_idx ON checklist_sessions (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS checklist_sessions_updated_at_idx ON checklist_sessions (user_id, updated_at DESC);

-- ============ 3. STOCK COUNT HISTORY ============
-- Geçmiş stok sayımları. Snapshot bazında, dönüştürülemez.
CREATE TABLE IF NOT EXISTS stock_count_history (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS stock_count_history_user_workspace_idx ON stock_count_history (user_id, workspace_id);

-- ============ 4. HACCP LOGS ============
-- Mutfak alanı başına ayrı log (örn. "Banket Mutfak", "Restoran").
-- Shape: { id, name, sortIndex }
CREATE TABLE IF NOT EXISTS haccp_logs (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_logs_user_workspace_idx ON haccp_logs (user_id, workspace_id);

-- ============ 5. HACCP UNITS ============
-- Soğutucu üniteleri (fridge, freezer, vs.). data içinde logId.
-- Shape: { id, logId, name, min, max, unit, sortIndex }
CREATE TABLE IF NOT EXISTS haccp_units (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_units_user_workspace_idx ON haccp_units (user_id, workspace_id);

-- ============ 6. HACCP READINGS ============
-- Günlük sıcaklık okumaları. data içinde unitId, date, morning, evening.
-- Shape: { id, unitId, date (YYYY-MM-DD), morning, evening }
CREATE TABLE IF NOT EXISTS haccp_readings (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_readings_user_workspace_idx ON haccp_readings (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS haccp_readings_updated_at_idx ON haccp_readings (user_id, updated_at DESC);

-- ============ 7. HACCP COOK COOL ============
-- Cook & Cool log: pişir-soğut sıcaklık takibi (60°C → 21°C 2h → 5°C 6h).
CREATE TABLE IF NOT EXISTS haccp_cook_cool (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS haccp_cook_cool_user_workspace_idx ON haccp_cook_cool (user_id, workspace_id);

-- ============ 8. COST HISTORY ============
-- Global fiyat değişim logu (workspace-scoped DEĞİL, user-scoped).
-- Bir malzemenin fiyatı değiştiğinde tüm workspace'leri etkiler,
-- tarihçe ortak.
CREATE TABLE IF NOT EXISTS cost_history (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS cost_history_user_idx ON cost_history (user_id, created_at DESC);

-- ============ 9. WORKSPACE TOMBSTONES ============
-- Silinmiş workspace ID'leri. Cloud merge sırasında "diriltme" engellenir.
-- PK doğrudan workspace_id — ws başına 1 satır.
-- _deletedWorkspaces state'i: { wsId: deletedAt timestamp }
CREATE TABLE IF NOT EXISTS workspace_tombstones (
  workspace_id    text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at      timestamptz  NOT NULL DEFAULT now(),
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_tombstones_user_idx ON workspace_tombstones (user_id);

-- ============ 10. RLS ============
-- 9 yeni tablo için aynı pattern: user sadece kendi satırlarını görür.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'waste','checklist_sessions','stock_count_history',
    'haccp_logs','haccp_units','haccp_readings','haccp_cook_cool',
    'cost_history','workspace_tombstones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Idempotent — eski isimde politikalar varsa düşür
    EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_own ON %I;', tbl, tbl);

    -- SELECT: sadece kendi satırları
    EXECUTE format(
      'CREATE POLICY %I_select_own ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id);',
      tbl, tbl
    );
    -- INSERT: kendi user_id'si ile
    EXECUTE format(
      'CREATE POLICY %I_insert_own ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);',
      tbl, tbl
    );
    -- UPDATE: kendi satırlarını
    EXECUTE format(
      'CREATE POLICY %I_update_own ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      tbl, tbl
    );
    -- DELETE: kendi satırlarını
    EXECUTE format(
      'CREATE POLICY %I_delete_own ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id);',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============ 11. updated_at TRIGGER ============
-- pcd_set_updated_at fonksiyonu v2.6.66'da yaratıldı, mevcut.
-- Sadece trigger ekliyoruz. workspace_tombstones'ta updated_at YOK
-- (immutable kayıt — silinen ws geri açılmaz), bu yüzden o hariç tutulur.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'waste','checklist_sessions','stock_count_history',
    'haccp_logs','haccp_units','haccp_readings','haccp_cook_cool',
    'cost_history'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at_trg ON %I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at_trg BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============ 12. REALTIME PUBLICATION ============
-- Faz 3'te eklenen kanal aynı, sadece yeni tabloları katıyoruz.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE waste; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE checklist_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_count_history; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_units; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_readings; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE haccp_cook_cool; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE cost_history; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_tombstones; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- 1. Tablolar oluştu mu (9 satır beklenir):
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('waste','checklist_sessions','stock_count_history',
--                     'haccp_logs','haccp_units','haccp_readings',
--                     'haccp_cook_cool','cost_history',
--                     'workspace_tombstones')
--   ORDER BY tablename;
--
-- 2. RLS açık mı:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN (...)
--   ORDER BY tablename;
--   Beklenen: hepsi rowsecurity = true
--
-- 3. Politikalar var mı (her tablo için 4):
--   SELECT tablename, COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN (...)
--   GROUP BY tablename ORDER BY tablename;
--   Beklenen: 9 satır, hepsi count=4
--
-- 4. Anon erişimi engelli mi:
--   Supabase Dashboard → Table Editor → herhangi bir tablo
--   → "View as: anon" → 0 rows görünmeli
--
-- 5. Realtime publication'da mı (9 satır beklenir):
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('waste','checklist_sessions','stock_count_history',
--                     'haccp_logs','haccp_units','haccp_readings',
--                     'haccp_cook_cool','cost_history',
--                     'workspace_tombstones');
--
-- KOD AYAĞI:
-- Bu migration için js/ tarafında DEĞİŞİKLİK GEREKMİYOR.
-- v2.6.72'de cloud-pertable.js'e bu tablolar için çift yazma desteği
-- eklenecek. v2.6.73'te ise mevcut blob veriyi yeni tablolara taşıyan
-- migration script gelecek.
-- ============================================================
