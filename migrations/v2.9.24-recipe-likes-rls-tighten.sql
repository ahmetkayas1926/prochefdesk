-- ============================================================
-- ProChefDesk v2.9.24 — recipe_likes RLS tighten (privacy leak fix)
-- ============================================================
-- ARKA PLAN:
-- v2.8.46'da Discover Phase 2 için recipe_likes tablosuna açık SELECT
-- policy konuldu (`USING (true)`) — like count + "ben like'ladım mı"
-- kontrolünü herkes için açık tutmak amaçlı. Ancak bu policy aynı
-- zamanda anon + authenticated user'ın (user_id, recipe_id) ÇİFTLERİNİ
-- direkt sorgulayabilmesine izin veriyor.
--
-- AUDIT BULGU (v2.9.23):
-- Anon scraper: `supabase.from('recipe_likes').select('user_id, recipe_id')`
-- → tüm "kim hangi tarifi like'lamış" social graph'ı dökülür. Privacy
-- standardı için kapatılmalı. SaaS hijyeni yeterli (bank-grade değil).
--
-- ÇÖZÜM (3 katman):
--   1) SELECT policy değiştir: kullanıcı SADECE kendi like'larını okuyabilir
--      (frontend "ben like'ladım mı" check için yeter).
--   2) Yeni RPC `pcd_get_recipe_like_count(recipe_id)` — SECURITY DEFINER,
--      sadece COUNT döner, user_id sızdırmaz. Anon + authenticated her ikisi
--      çağırabilir. Discover view'da like count gösterim için.
--   3) Mevcut `recipes.like_count` denormalized kolonu zaten public feed'de
--      görünür (RLS isPublic=true SELECT açık). UI'da çoğu yerde bu kolon
--      kullanılıyor — frontend değişikliği minimum.
--
-- INSERT/DELETE policy değişmez (zaten own-only).
-- ============================================================

BEGIN;

-- ============ 1. SELECT POLICY TIGHTEN ============
-- Eski: USING (true) — herkese tam okuma (privacy leak)
-- Yeni: USING (auth.uid() = user_id) — sadece kendi like'ları
DROP POLICY IF EXISTS recipe_likes_select_all ON recipe_likes;

CREATE POLICY recipe_likes_select_own ON recipe_likes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Anon için hiçbir SELECT policy yok = anon SELECT'i tamamen engellenir.
-- "ben like'ladım mı" check'i sadece authenticated user için anlamlı zaten.

-- ============ 2. PUBLIC LIKE-COUNT RPC ============
-- Frontend'de Discover detay modal'da bireysel recipe'in like sayısını
-- göstermek için anon-friendly bir yol gerek (önceden direkt SELECT ile
-- yapılıyordu — şimdi SECURITY DEFINER RPC ile aggregate-only).
-- `recipes.like_count` kolonu zaten denormalized + RLS-friendly olduğu
-- için çoğu UI noktası bu RPC'ye ihtiyaç duymayabilir. Yine de güvenli
-- bir public API olsun diye ekliyoruz (gelecekte cache-busting için).
CREATE OR REPLACE FUNCTION pcd_get_recipe_like_count(p_recipe_id text)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM recipe_likes
  WHERE recipe_id = p_recipe_id;
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anon + authenticated her ikisi çağırabilir
GRANT EXECUTE ON FUNCTION pcd_get_recipe_like_count(text) TO anon, authenticated;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışı):
--
-- 1. Yeni policy yerinde:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'recipe_likes' AND cmd = 'SELECT';
--   Beklenen: 1 satır, policyname='recipe_likes_select_own',
--   qual='(auth.uid() = user_id)'
--
-- 2. Eski açık policy silindi:
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'recipe_likes' AND policyname = 'recipe_likes_select_all';
--   Beklenen: 0 satır
--
-- 3. RPC oluştu + güvenli:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'pcd_get_recipe_like_count';
--   Beklenen: 1 satır, prosecdef=true (SECURITY DEFINER)
--
-- 4. Anon RPC çağırabilir:
--   SELECT has_function_privilege('anon', 'pcd_get_recipe_like_count(text)', 'EXECUTE');
--   Beklenen: t
--
-- 5. Anon direkt SELECT engelli:
--   Supabase Dashboard → Table Editor → recipe_likes
--   → "View as: anon" → 0 rows (önceden tüm satırlar görünüyordu)
--
-- KOD AYAĞI:
-- Frontend (discover.js) zaten "fetchMyLikes" path'inde
--   .eq('user_id', uid) filter ile kendi like'larını çekiyor — yeni policy
--   ile uyumlu (auth.uid() ile match).
-- Diğer like UI'ları `recipe.like_count` denormalized kolonu kullanıyor
--   (which is in `recipes` table → isPublic=true policy gereği herkese
--   açık). Hiçbir frontend değişikliği gerekmez.
-- ============================================================
