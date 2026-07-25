-- ============================================================
-- ProChefDesk v2.44.157 — Discover: fiyat/maliyet sızıntısı düzeltmesi
-- ============================================================
-- SORUN (v2.8.46'dan beri mevcuttu):
--   "Share publicly in Discover" işaretlenen bir tarifte UI şu vaadi
--   veriyor: "Only the recipe name, ingredients list (names + amounts
--   + units), and method steps are shared. Your prices, suppliers,
--   cost calculation and sale price are NEVER shared."
--
--   Ama recipes_public_select_anon / recipes_public_select_auth RLS
--   policy'leri SATIR bazlı izin veriyordu (bu tarif public mi?),
--   KOLON bazlı değil — izin verilince recipes.data jsonb'nin TAMAMI
--   (salePrice, targetFoodCostPct dahil) döndürülüyordu. discover.js
--   fetchPublicFeed() bu tam veriyi çekiyor, sadece EKRANDA bir
--   kısmını gösteriyordu — ama ağ cevabında fiyat zaten vardı.
--   Giriş yapmamış (anon) herkes, uygulamanın herkese açık anon
--   API key'iyle bu veriyi doğrudan çekebilirdi.
--
-- ETKİ: Discover'da paylaşılan HER kullanıcının tarifi için satış
--   fiyatı + hedef food-cost % (ve data blob'undaki başka her alan)
--   herkese açıktı.
--
-- ÇÖZÜM:
--   1) Ham `recipes` tablosuna anon/başka-kullanıcı SELECT'i tamamen
--      KAPATILIYOR (recipes_public_select_anon tamamen silinir;
--      recipes_public_select_auth silinip SADECE "auth.uid()=user_id"
--      ile — yani sadece kendi satırın — yeniden yaratılır, "OR
--      isPublic" dalı kaldırılır).
--   2) Yeni `pcd_discover_feed()` SECURITY DEFINER fonksiyonu — sadece
--      GÜVENLİ alanları (name, description, plating, authorName,
--      author, photo, steps, prepTime, cookTime, tags, ingredients,
--      computedAllergens) whitelist ile döndürür. salePrice,
--      targetFoodCostPct, suppliers, vs. asla döndürülmez.
--   3) discover.js fetchPublicFeed() artık ham tablo yerine bu
--      fonksiyonu çağırıyor (aynı commit'te, ayrı dosya).
--
--   recipe_likes (SELECT herkese açık, sadece recipe_id+user_id) ve
--   increment_recipe_view RPC (zaten SECURITY DEFINER, dar) bu
--   sorundan ETKİLENMEDİ, değiştirilmedi.
--
-- ÖNEMLİ — BU MIGRATION'I SADECE OPERATÖR ÇALIŞTIRABİLİR:
--   Claude Code'un canlı Supabase veritabanına doğrudan yazma erişimi
--   yok. Bu dosyayı Supabase Dashboard → SQL Editor'de ÇALIŞTIR.
--   Aynı zamanda app/js/tools/discover.js ve app/js/core/config.js
--   içindeki eşlik eden kod değişikliği git push ile otomatik
--   yayılacak (Cloudflare Pages) — ama SQL migration ayrı, elle.
-- ============================================================

BEGIN;

-- ============ 1. HAM TABLOYA CROSS-USER / ANON SELECT'İ KAPAT ============
-- anon policy tamamen kaldırılıyor (anon'un ham tabloya hiç erişimi
-- olmamalı — public feed sadece pcd_discover_feed() üzerinden).
DROP POLICY IF EXISTS recipes_public_select_anon ON recipes;

-- authenticated policy DROP edilip SADECE "kendi satırın" ile
-- yeniden yaratılıyor (silinmiyor — varsayımla bir yerlerde başka bir
-- owner-only policy olduğuna güvenmek yerine, bu policy'nin kendisi
-- kendi satırına erişimi garanti ediyor; "OR isPublic" dalı kaldırıldı).
DROP POLICY IF EXISTS recipes_public_select_auth ON recipes;
CREATE POLICY recipes_public_select_auth ON recipes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- Not: Eğer bu tablo için ayrıca "FOR ALL" bir owner policy zaten
-- varsa (CLAUDE.md'de belgelenen genel <table>_owner_all deseni),
-- bu policy onunla YIĞILIR (OR) — zararsız, fazladan güvenli taraf.

-- ============ 2. GÜVENLİ, ALAN-KISITLI PUBLIC FEED FONKSİYONU ============
CREATE OR REPLACE FUNCTION pcd_discover_feed()
RETURNS TABLE (
  id          text,
  user_id     uuid,
  data        jsonb,
  view_count  integer,
  like_count  integer,
  updated_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id,
    r.user_id,
    jsonb_build_object(
      'isPublic',          true,
      'name',              r.data->>'name',
      'description',       r.data->>'description',
      'plating',           r.data->>'plating',
      'authorName',        r.data->>'authorName',
      'author',            r.data->>'author',
      'photo',             r.data->>'photo',
      'steps',             r.data->>'steps',
      'prepTime',          r.data->'prepTime',
      'cookTime',          r.data->'cookTime',
      'tags',              COALESCE(r.data->'tags', '[]'::jsonb),
      'ingredients',       COALESCE(r.data->'ingredients', '[]'::jsonb),
      'computedAllergens', COALESCE(r.data->'computedAllergens', '[]'::jsonb)
    ) AS data,
    r.view_count,
    r.like_count,
    r.updated_at
  FROM recipes r
  WHERE r.deleted_at IS NULL
    AND COALESCE(r.data->>'isPublic', 'false') = 'true'
  ORDER BY r.view_count DESC, r.updated_at DESC
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION pcd_discover_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pcd_discover_feed() TO anon, authenticated;

COMMIT;

-- ============================================================
-- DOĞRULAMA (Supabase SQL Editor'de "Run as: anon" seçip çalıştır):
--
-- 1. Ham tablo artık başkasının public tarifini döndürmemeli:
--   SELECT id, data->>'salePrice' FROM recipes
--   WHERE COALESCE(data->>'isPublic','false')='true' LIMIT 5;
--   Beklenen: 0 satır (anon rolü için — policy kalmadı) veya
--   "permission denied" DEĞİL, sadece boş sonuç.
--
-- 2. Yeni fonksiyon çalışıyor ve salePrice YOK:
--   SELECT id, data->>'name', data ? 'salePrice' AS has_price
--   FROM pcd_discover_feed() LIMIT 5;
--   Beklenen: satırlar döner, has_price her satırda FALSE.
--
-- 3. Uygulamada Discover sayfasını aç (giriş yapmadan, gizli sekmede
--   test edilebilir) → tarifler eskisi gibi görünmeli (foto, isim,
--   malzeme, method, beğeni/görüntülenme sayısı) — hiçbir görsel
--   fark olmamalı, sadece arka plandaki veri artık temiz.
--
-- GERİ ALMA (sorun çıkarsa — DİKKAT: eski sızıntıyı geri getirir):
--   BEGIN;
--     DROP FUNCTION IF EXISTS pcd_discover_feed();
--     CREATE POLICY recipes_public_select_anon ON recipes
--       FOR SELECT TO anon
--       USING (deleted_at IS NULL AND COALESCE(data->>'isPublic','false')='true');
--     CREATE POLICY recipes_public_select_auth ON recipes
--       FOR SELECT TO authenticated
--       USING (auth.uid() = user_id OR (deleted_at IS NULL AND COALESCE(data->>'isPublic','false')='true'));
--   COMMIT;
-- ============================================================
