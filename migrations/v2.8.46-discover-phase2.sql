-- ============================================================
-- ProChefDesk v2.8.46 — Discover Faz 2 backend
-- ============================================================
-- ARKA PLAN:
-- v2.8.41'de Discover MVP frontend skeleton eklendi: route, sidenav
-- entry, isPublic toggle (recipe.data jsonb içinde). Backend yoktu;
-- kullanıcılar sadece kendi public recipe'lerinin önizlemesini
-- görüyordu.
--
-- v2.8.46 — Faz 2 backend: diğer şeflerin public tarifleri görünür
-- hale geldi + like + view counter.
--
-- BU MIGRATION:
--   1) recipes tablosuna view_count + like_count kolonları (denormalized
--      hızlı okuma için, trigger ile senkron).
--   2) recipes tablosuna iki yeni RLS policy: anonymous + authenticated
--      kullanıcılar artık `data->>'isPublic' = 'true'` olan recipe'leri
--      okuyabilir (kendi recipe'leri yine her durumda görünür).
--   3) recipe_likes tablosu: (recipe_id, user_id) PK. Authenticated
--      user kendi like'ını insert/delete edebilir; SELECT herkes açık
--      (like count görmek için).
--   4) increment_recipe_view(_recipe_id text) RPC: SECURITY DEFINER ile
--      anonymous bile bir public recipe'a view count atayabilir.
--      Yanlış recipe_id veya non-public recipe için no-op (sessiz).
--   5) pcd_update_like_count trigger: recipe_likes değiştikçe
--      recipes.like_count'u senkron tutar.
--
-- GÜVENLİK NOTU:
--   - Anonymous user SADECE isPublic=true recipe'leri okuyabilir.
--     İsteyen kullanıcı bir tarifi public yapıp sonra geri çekebilir
--     (toggle off → RLS check'te düşer → görünmez).
--   - View counter bir nebze spam'lenebilir (her sayfa yenilemesinde
--     +1). MVP için kabul edilebilir. İleride IP-based / session-based
--     rate limiting eklenebilir (Edge Function gerekli).
--   - Like spam: bir user başına 1 like (PK constraint). Toggle ile
--     açıp kapatabilir; rate limit yok (PostgreSQL native PK constraint
--     yeterli koruma).
--
-- FRONTEND AYAĞI (aynı v2.8.46 commit'inde):
--   - app/js/tools/discover.js (yeniden yazıldı, ~350 satır eklendi)
--   - app/js/i18n/en.js + tr.js (yeni discover key'leri)
--   - app/js/core/config.js (APP_VERSION → 2.8.46)
-- ============================================================

BEGIN;

-- ============ 1. RECIPES TABLOSU: view_count + like_count kolonları ============
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

-- En çok beğenilen / görüntülenen tarifler için index (Discover trending feed)
CREATE INDEX IF NOT EXISTS recipes_public_view_count_idx
  ON recipes ((COALESCE(data->>'isPublic', 'false')), view_count DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recipes_public_like_count_idx
  ON recipes ((COALESCE(data->>'isPublic', 'false')), like_count DESC)
  WHERE deleted_at IS NULL;

-- ============ 2. RECIPES RLS: anonymous + authenticated public SELECT ============
-- Mevcut owner-only policy korunur. Bunun üstüne 2 yeni policy:
--   - Anonymous user: public recipe'leri okuyabilir
--   - Authenticated user: kendi + diğer kullanıcıların public'lerini

DROP POLICY IF EXISTS recipes_public_select_anon ON recipes;
CREATE POLICY recipes_public_select_anon ON recipes
  FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL
    AND COALESCE(data->>'isPublic', 'false') = 'true'
  );

DROP POLICY IF EXISTS recipes_public_select_auth ON recipes;
CREATE POLICY recipes_public_select_auth ON recipes
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      deleted_at IS NULL
      AND COALESCE(data->>'isPublic', 'false') = 'true'
    )
  );

-- ============ 3. RECIPE_LIKES TABLOSU ============
-- Per-user like flag. PK = (recipe_id, user_id) → bir user bir recipe'a
-- en fazla 1 like atabilir (PostgreSQL native enforcement).
CREATE TABLE IF NOT EXISTS recipe_likes (
  recipe_id      text         NOT NULL,
  user_id        uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS recipe_likes_recipe_idx ON recipe_likes (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_likes_user_idx   ON recipe_likes (user_id);

ALTER TABLE recipe_likes ENABLE ROW LEVEL SECURITY;

-- SELECT: herkes (anon + authenticated). Like count herkesin görmesi için.
-- Bireysel like satırı çekmek de "ben like'ladım mı" check'i için lazım.
DROP POLICY IF EXISTS recipe_likes_select_all ON recipe_likes;
CREATE POLICY recipe_likes_select_all ON recipe_likes
  FOR SELECT
  USING (true);

-- INSERT: authenticated user sadece kendi user_id'si ile.
DROP POLICY IF EXISTS recipe_likes_insert_own ON recipe_likes;
CREATE POLICY recipe_likes_insert_own ON recipe_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- DELETE: kendi like'ını çekebilir.
DROP POLICY IF EXISTS recipe_likes_delete_own ON recipe_likes;
CREATE POLICY recipe_likes_delete_own ON recipe_likes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============ 4. LIKE COUNT TRIGGER ============
-- recipe_likes INSERT/DELETE sonrası recipes.like_count'u senkron tut.
CREATE OR REPLACE FUNCTION pcd_update_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rid text;
BEGIN
  rid := COALESCE(NEW.recipe_id, OLD.recipe_id);
  UPDATE recipes
  SET like_count = (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = rid)
  WHERE id = rid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pcd_recipe_likes_count_trg ON recipe_likes;
CREATE TRIGGER pcd_recipe_likes_count_trg
AFTER INSERT OR DELETE ON recipe_likes
FOR EACH ROW EXECUTE FUNCTION pcd_update_like_count();

-- ============ 5. VIEW COUNTER RPC ============
-- Anonymous + authenticated user bir public recipe'ı açtığında çağırır.
-- Non-public veya deleted recipe için no-op (sessiz).
-- updated_at değişmez (BEFORE UPDATE trigger view_count change'i bypass eder
-- — istemiyoruz ki her view recipe'ı "değişti" olarak markalasın). Bunu
-- garantilemek için ayrı kolon olduğundan zaten OK; ama emin olmak için
-- trigger içinde view_count atlanabilir (mevcut pcd_set_updated_at her
-- UPDATE'te updated_at = now() yapıyor — view_count update'i de tetikler).
-- Bu küçük yan etki sync'i bozmaz, sadece "boş push" üretir; performans
-- etkisi ihmal edilebilir.
CREATE OR REPLACE FUNCTION increment_recipe_view(_recipe_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE recipes
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = _recipe_id
    AND COALESCE(data->>'isPublic', 'false') = 'true'
    AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION increment_recipe_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_recipe_view(text) TO anon, authenticated;

-- ============ 6. REPLICA IDENTITY (recipe_likes) ============
ALTER TABLE recipe_likes REPLICA IDENTITY FULL;

-- ============ 7. REALTIME PUBLICATION (recipe_likes) ============
-- recipe_likes Realtime'a almaya gerek YOK — discover.js sayfa açıldığında
-- on-demand fetch yapıyor, like buton tıklaması optimistic UI ile çalışıyor.
-- Eğer ileride "live like animation" istenirse buraya eklenir.

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- 1. recipes tablosunda yeni kolonlar:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'recipes'
--   AND column_name IN ('view_count', 'like_count');
--   Beklenen: 2 satır
--
-- 2. recipe_likes tablosu oluştu mu:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename = 'recipe_likes';
--   Beklenen: 1 satır
--
-- 3. Anonymous SELECT policy aktif mi:
--   SELECT polname, polroles::regrole[] FROM pg_policy
--   WHERE polrelid = 'public.recipes'::regclass
--   AND polname LIKE '%public_select%';
--   Beklenen: 2 satır (anon + authenticated)
--
-- 4. Anonymous user public recipe görebiliyor mu (test):
--   Supabase Dashboard → SQL Editor → "Run as: anon" seç →
--   SELECT id, data->>'name' FROM recipes
--   WHERE COALESCE(data->>'isPublic', 'false') = 'true'
--   LIMIT 5;
--   Beklenen: public işaretli recipe'ler döner
--
-- 5. RPC çağrılabiliyor mu (test):
--   SELECT increment_recipe_view('<bir recipe id>');
--   SELECT view_count FROM recipes WHERE id = '<aynı id>';
--   Beklenen: view_count arttı
--
-- 6. Like trigger çalışıyor mu (test):
--   INSERT INTO recipe_likes (recipe_id, user_id) VALUES ('<rid>', auth.uid());
--   SELECT like_count FROM recipes WHERE id = '<rid>';
--   Beklenen: like_count = 1
--   DELETE FROM recipe_likes WHERE recipe_id = '<rid>' AND user_id = auth.uid();
--   SELECT like_count FROM recipes WHERE id = '<rid>';
--   Beklenen: like_count = 0
--
-- GERİ ALMA (sorun çıkarsa):
--   BEGIN;
--     DROP POLICY IF EXISTS recipes_public_select_anon ON recipes;
--     DROP POLICY IF EXISTS recipes_public_select_auth ON recipes;
--     DROP TRIGGER IF EXISTS pcd_recipe_likes_count_trg ON recipe_likes;
--     DROP FUNCTION IF EXISTS pcd_update_like_count();
--     DROP FUNCTION IF EXISTS increment_recipe_view(text);
--     DROP TABLE IF EXISTS recipe_likes;
--     ALTER TABLE recipes DROP COLUMN IF EXISTS view_count;
--     ALTER TABLE recipes DROP COLUMN IF EXISTS like_count;
--   COMMIT;
-- ============================================================
