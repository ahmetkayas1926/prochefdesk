-- ============================================================
-- ProChefDesk v2.6.66 — Multi-device sync, Faz 1
-- Per-table schema (additive, mevcut user_data tablosu dokunulmadı)
-- ============================================================
-- BU MIGRATION:
--   1) Workspace + tüm tool tabloları için yeni şema
--   2) Her tabloda RLS açık, sadece sahibi erişebilir
--   3) updated_at otomatik bumb (trigger)
--   4) Realtime için Faz 3'te kullanılacak publication eklenir
--
-- ÖNEMLİ:
--   - Mevcut user_data tablosu DOKUNULMADI. Eski tek-blob sync paralel
--     çalışmaya devam ediyor. Kod hala onu kullanıyor.
--   - Faz 4'te (migration script) mevcut blob veriyi bu tablolara taşıyacağız.
-- ============================================================

BEGIN;

-- ============ 1. WORKSPACES ============
CREATE TABLE IF NOT EXISTS workspaces (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text         NOT NULL,
  concept         text         NULL,
  role            text         NULL,
  city            text         NULL,
  color           text         NULL,
  period_start    text         NULL,
  period_end      text         NULL,
  archived        boolean      NOT NULL DEFAULT false,
  is_active       boolean      NOT NULL DEFAULT false,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS workspaces_user_id_idx ON workspaces (user_id);

-- ============ 2. RECIPES ============
CREATE TABLE IF NOT EXISTS recipes (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS recipes_user_workspace_idx ON recipes (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS recipes_updated_at_idx ON recipes (user_id, updated_at DESC);

-- ============ 3. INGREDIENTS ============
CREATE TABLE IF NOT EXISTS ingredients (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS ingredients_user_workspace_idx ON ingredients (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS ingredients_updated_at_idx ON ingredients (user_id, updated_at DESC);

-- ============ 4. MENUS ============
CREATE TABLE IF NOT EXISTS menus (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS menus_user_workspace_idx ON menus (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS menus_updated_at_idx ON menus (user_id, updated_at DESC);

-- ============ 5. EVENTS ============
CREATE TABLE IF NOT EXISTS events (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS events_user_workspace_idx ON events (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS events_updated_at_idx ON events (user_id, updated_at DESC);

-- ============ 6. SUPPLIERS ============
CREATE TABLE IF NOT EXISTS suppliers (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS suppliers_user_workspace_idx ON suppliers (user_id, workspace_id);

-- ============ 7. CANVASES (kitchen cards) ============
CREATE TABLE IF NOT EXISTS canvases (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS canvases_user_workspace_idx ON canvases (user_id, workspace_id);

-- ============ 8. SHOPPING LISTS ============
CREATE TABLE IF NOT EXISTS shopping_lists (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS shopping_lists_user_workspace_idx ON shopping_lists (user_id, workspace_id);

-- ============ 9. CHECKLIST TEMPLATES ============
CREATE TABLE IF NOT EXISTS checklist_templates (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  data            jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS checklist_templates_user_workspace_idx ON checklist_templates (user_id, workspace_id);

-- ============ 10. INVENTORY ============
-- Inventory benzersiz: workspace_id + ingredient_id pair-key
CREATE TABLE IF NOT EXISTS inventory (
  id              text         PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    text         NOT NULL,
  ingredient_id   text         NOT NULL,
  data            jsonb        NOT NULL,
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_user_workspace_idx ON inventory (user_id, workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ws_ing_unique ON inventory (workspace_id, ingredient_id);

-- ============ 11. USER PREFS ============
-- Top-level user-scoped (workspace dışı): locale, theme, currency, lastViewedTool
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id         uuid         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data            jsonb        NOT NULL DEFAULT '{}'::jsonb,
  active_workspace_id text     NULL,
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

-- ============ 12. RLS ============
-- Tüm yeni tablolar için tek pattern: user sadece kendi satırlarını görür
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'workspaces','recipes','ingredients','menus','events','suppliers',
    'canvases','shopping_lists','checklist_templates','inventory','user_prefs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Drop eski politikaları (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_own ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_own ON %I;', tbl, tbl);

    -- SELECT
    EXECUTE format('CREATE POLICY %I_select_own ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id);', tbl, tbl);
    -- INSERT
    EXECUTE format('CREATE POLICY %I_insert_own ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);', tbl, tbl);
    -- UPDATE
    EXECUTE format('CREATE POLICY %I_update_own ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', tbl, tbl);
    -- DELETE
    EXECUTE format('CREATE POLICY %I_delete_own ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id);', tbl, tbl);
  END LOOP;
END $$;

-- ============ 13. updated_at trigger ============
-- Her UPDATE'te updated_at otomatik bump
CREATE OR REPLACE FUNCTION pcd_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'workspaces','recipes','ingredients','menus','events','suppliers',
    'canvases','shopping_lists','checklist_templates','inventory','user_prefs'
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

-- ============ 14. REALTIME PUBLICATION ============
-- Faz 3'te (Realtime) kullanılacak. Şu an sadece publication ekliyoruz.
-- Supabase'in default 'supabase_realtime' publication'ına yeni tablolar eklenir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Her tabloyu publication'a ekle (idempotent — tekrar çalıştırmak hata vermez)
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspaces; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE recipes; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE ingredients; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE menus; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE events; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE suppliers; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE canvases; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE shopping_lists; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE checklist_templates; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE inventory; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE user_prefs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- Tablolar oluştu mu:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('workspaces','recipes','ingredients','menus','events',
--                     'suppliers','canvases','shopping_lists',
--                     'checklist_templates','inventory','user_prefs');
--   Beklenen: 11 satır
--
-- RLS açık mı:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN (...) ORDER BY tablename;
--   Beklenen: hepsi rowsecurity = true
--
-- Politikalar var mı:
--   SELECT schemaname, tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN (...) ORDER BY tablename, policyname;
--   Beklenen: tablo başına 4 satır (select/insert/update/delete)
-- ============================================================
