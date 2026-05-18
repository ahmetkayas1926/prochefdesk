-- ============================================================
-- ProChefDesk v2.9.17 — Buffets + Mise Plans + Team cloud sync
-- ============================================================
-- ARKA PLAN:
-- v2.8.73 Buffet Planner, v2.8.74 Mise en Place ve v2.6.x Team
-- tool'ları local-only IDB persistence ile yaşıyordu. Operatör
-- onayı v2.9.x sweep sonunda alındı (15 round, NAKED→RICH tamam).
--
-- BU MIGRATION 3 yeni tablo ekliyor (waste/checklist_sessions
-- array pattern'i ile birebir):
--   - buffets       (workspace-scoped, isArray)
--   - mise_plans    (workspace-scoped, isArray)
--   - team          (workspace-scoped, isArray)
--
-- ÖNEMLİ:
--   - Hiçbir mevcut tablo dokunulmadı.
--   - Pattern v2.6.71 waste + checklist_sessions array pattern'i ile
--     birebir aynı (id text PK, user_id uuid, workspace_id text,
--     data jsonb, created_at, updated_at, deleted_at).
--   - Mevcut local IDB verisi (buffets + misePlans + team) bu
--     migration sonrası ilk push'ta drift detection (v2.8.33) ile
--     cloud'a otomatik sync olacak.
--
-- DOĞRULAMA: SQL sonu doğrulama bloğunda.
-- ============================================================

BEGIN;

-- ============ 1. BUFFETS ============
-- Hotel/catering buffet planları. Şef her gün/etkinlik için ayrı
-- buffet oluşturur, içinde stations + items var.
-- data shape: { id, name, type, coverCount, ticketPrice,
--               refillMultiplier, serviceDate, stations: [...] }
CREATE TABLE IF NOT EXISTS buffets (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS buffets_user_workspace_idx ON buffets (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS buffets_updated_at_idx ON buffets (user_id, updated_at DESC);

-- ============ 2. MISE_PLANS ============
-- Mise en Place günlük prep planları. State key 'misePlans',
-- DB tablo adı snake_case 'mise_plans'.
-- data shape: { id, date, items: [...], createdAt, updatedAt }
CREATE TABLE IF NOT EXISTS mise_plans (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS mise_plans_user_workspace_idx ON mise_plans (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS mise_plans_updated_at_idx ON mise_plans (user_id, updated_at DESC);

-- ============ 3. TEAM ============
-- Workspace üyeleri (manager / cook / viewer). Her üye ayrı row.
-- NOT: Mevcut local team state'i workspace-scoped DEĞİL (eski yapı).
-- v2.9.17 frontend update'i ile workspace-scoped'a çevrilecek.
-- Free tier kullanıcısının team data'sı genelde boş, migration için
-- veri taşıma gerekmez (operatör onayı: team kullanılmıyor).
-- data shape: { id, email, name, role, status, invitedAt }
CREATE TABLE IF NOT EXISTS team (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS team_user_workspace_idx ON team (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS team_updated_at_idx ON team (user_id, updated_at DESC);

-- ============ 4. RLS ============
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['buffets', 'mise_plans', 'team'];
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

-- ============ 5. updated_at TRIGGER ============
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['buffets', 'mise_plans', 'team'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at_trg ON %I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at_trg BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pcd_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============ 6. REALTIME PUBLICATION ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE buffets;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE mise_plans; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE team;       EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ============ 7. CASCADE TRIGGER UPDATE ============
-- v2.6.98 cascade_soft_delete + v2.7.0 cascade_restore. 18 → 21
-- ws-bound tablo. CREATE OR REPLACE body, trigger bağlantısı korunur.

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
  -- v2.9.17: yeni 3 tablo
  UPDATE buffets              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE mise_plans           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE team                 SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

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
  -- v2.9.17: yeni 3 tablo
  UPDATE buffets              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE mise_plans           SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE team                 SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 8. REPLICA IDENTITY ============
-- v2.6.77'de DELETE event payload tüm sütunlarını içermesi için FULL.
ALTER TABLE buffets    REPLICA IDENTITY FULL;
ALTER TABLE mise_plans REPLICA IDENTITY FULL;
ALTER TABLE team       REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışında, ayrı çalıştır):
--
-- 1. Tablolar oluştu mu:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('buffets','mise_plans','team');
--   Beklenen: 3 satır
--
-- 2. RLS açık mı:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('buffets','mise_plans','team');
--   Beklenen: 3 satır, rowsecurity = true
--
-- 3. Politikalar (her tablo için 4):
--   SELECT tablename, COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public'
--   AND tablename IN ('buffets','mise_plans','team')
--   GROUP BY tablename;
--   Beklenen: 3 satır, hepsi count=4
--
-- 4. Realtime publication'da mı:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('buffets','mise_plans','team');
--   Beklenen: 3 satır
--
-- 5. Cascade trigger fonksiyonları update'lendi mi:
--   SELECT routine_name, last_altered FROM information_schema.routines
--   WHERE routine_name IN ('cascade_soft_delete_workspace_data',
--                          'cascade_restore_workspace_data');
--   Beklenen: 2 satır, last_altered bugünün tarihi
--
-- 6. Replica identity:
--   SELECT relname, relreplident FROM pg_class
--   WHERE relname IN ('buffets','mise_plans','team');
--   Beklenen: 3 satır, relreplident = 'f' (FULL)
--
-- 7. Anon erişimi engelli:
--   Supabase Dashboard → Table Editor → her 3 tablo
--   → "View as: anon" → 0 rows
--
-- KOD AYAĞI (v2.9.17 frontend commit'inde 5 dosya):
--   - app/js/core/cloud-pertable.js     (+3 mapping isArray:true)
--   - app/js/core/cloud.js              (drift detection +3 tablo)
--   - app/js/core/cloud-realtime.js     (TABLES +3 + applyChange switch)
--   - app/js/tools/team.js              (workspace-scoped reads/writes)
--   - app/js/core/config.js             (APP_VERSION 2.9.16 → 2.9.17)
--   - supabase/functions/backup-to-r2/index.ts (BACKUP_TABLES +3)
-- ============================================================
