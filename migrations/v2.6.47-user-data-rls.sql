-- ============================================================
-- ProChefDesk v2.6.47 — user_data RLS (DOCUMENTATION + DEFENSIVE)
-- ============================================================
-- ARKA PLAN:
-- `user_data` tablosu cloud sync'in ana taşıyıcısı (cloud.js):
--   - Her kullanıcının TÜM state'i (recipes, ingredients, menus,
--     workspaces, inventory, suppliers, events, vs.) tek bir jsonb
--     blob olarak burada tutuluyor.
--   - Şema: user_data (user_id uuid, key text, value jsonb, updated_at)
--   - Tek key kullanılıyor: 'state'
--   - UNIQUE(user_id, key) ile idempotent upsert
--
-- TARİHSEL DURUM:
-- Bu tablo Supabase Dashboard üzerinden ELLE oluşturulmuştu. RLS
-- politikaları da elle yapıldı, repo'da SQL yoktu. Yeni Supabase
-- ortamına deploy edilirse veya mevcut ortam yanlışlıkla yeniden
-- yapılandırılırsa açık kalma riski vardı.
--
-- BU MIGRATION:
-- Mevcut tabloyu DEĞİŞTİRMEZ (CREATE TABLE IF NOT EXISTS, DROP/CREATE
-- POLICY IF EXISTS). Sadece doğru RLS politikalarının yerinde olduğunu
-- garantiler. Mevcut Supabase'inde zaten doğru ayarlanmışsa bu migration
-- no-op'tur.
--
-- ÇALIŞTIRDIĞINDA NE OLUR:
-- 1. Tablo yoksa oluşur (defensive — production'da zaten var)
-- 2. RLS açık değilse açılır
-- 3. Var olan eski politikalar (eğer farklı isimlerle varsa) etkilenmez
-- 4. Yeni standardize edilmiş politikalar idempotent şekilde kurulur
--
-- DOĞRULAMA:
-- Migration sonrası anon role ile şu sorgu boş dönmeli:
--   SELECT * FROM user_data;
--
-- Authenticated kullanıcı ile sadece kendi satırını görmeli:
--   SELECT * FROM user_data;
-- ============================================================

BEGIN;

-- 1) Tablo (yoksa)
CREATE TABLE IF NOT EXISTS user_data (
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key         text         NOT NULL,
  value       jsonb        NOT NULL,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- 2) RLS aktif
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 3) Eski politikaları (varsa) düşür ve yenilerini idempotent kur.
--    Politikaları tek bir net standartla yeniden oluşturuyoruz:
--    "Authenticated kullanıcı sadece kendi satırına dokunabilir."
--    Anon kullanıcının HİÇ erişimi yok (SELECT/INSERT/UPDATE/DELETE).

DROP POLICY IF EXISTS user_data_select_own ON user_data;
DROP POLICY IF EXISTS user_data_insert_own ON user_data;
DROP POLICY IF EXISTS user_data_update_own ON user_data;
DROP POLICY IF EXISTS user_data_delete_own ON user_data;
-- Ek olarak Supabase Dashboard'un default politika isimlerini de drop et
DROP POLICY IF EXISTS "Users can view own data" ON user_data;
DROP POLICY IF EXISTS "Users can insert own data" ON user_data;
DROP POLICY IF EXISTS "Users can update own data" ON user_data;
DROP POLICY IF EXISTS "Users can delete own data" ON user_data;
DROP POLICY IF EXISTS "Enable read access for users" ON user_data;
DROP POLICY IF EXISTS "Enable insert for users" ON user_data;
DROP POLICY IF EXISTS "Enable update for users" ON user_data;

-- SELECT: kullanıcı sadece kendi satırlarını okur
CREATE POLICY user_data_select_own
  ON user_data
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: kullanıcı sadece kendi user_id'si ile insert edebilir
CREATE POLICY user_data_insert_own
  ON user_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: kullanıcı sadece kendi satırlarını günceller (cloud.js upsert
-- bu politikayı tetikler — sync sırasında satır varsa update path)
CREATE POLICY user_data_update_own
  ON user_data
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: kullanıcı sadece kendi satırlarını siler (account silme akışı
-- için; ON DELETE CASCADE auth.users zaten temizler ama defansif)
CREATE POLICY user_data_delete_own
  ON user_data
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) updated_at otomatik güncelleme (cloud.js her upsert'te elle de
-- gönderiyor ama trigger garantili)
CREATE OR REPLACE FUNCTION user_data_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_data_updated_at_trigger ON user_data;
CREATE TRIGGER user_data_updated_at_trigger
  BEFORE UPDATE ON user_data
  FOR EACH ROW
  EXECUTE FUNCTION user_data_set_updated_at();

COMMIT;

-- ============================================================
-- DOĞRULAMA TESTLERİ:
--
-- Test 1 — Anon erişimi engellendi mi?
-- Supabase Dashboard → Table Editor → user_data → "View as: anon"
-- Beklenen: "0 rows" (RLS bloklar)
--
-- Test 2 — Kullanıcı sadece kendi verisini görüyor mu?
-- Supabase Dashboard → SQL Editor (kendi JWT'nizle):
--   SELECT user_id, key, length(value::text) AS bytes FROM user_data;
-- Beklenen: sadece kendi satırlarınız (key='state' olan tek satır)
--
-- Test 3 — Başka kullanıcının verisi gözükmemeli:
-- (eğer test database'inde başka kullanıcı varsa)
-- Beklenen: query başkasının satırını döndürmemeli
--
-- Test 4 — Politika listesi:
--   SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'user_data'::regclass;
-- Beklenen: 4 satır
--   user_data_select_own | r
--   user_data_insert_own | a
--   user_data_update_own | w
--   user_data_delete_own | d
--
-- ============================================================
-- KOD AYAĞI:
-- Bu migration için js/core/cloud.js'de DEĞİŞİKLİK GEREKMİYOR.
-- Mevcut .from('user_data').upsert(...) çağrıları authenticated context'te
-- çalışıyor (oturum açık olmadan zaten queueSync skip ediyor) ve
-- auth.uid() = user_id koşulunu sağlıyor (cloud.js user_id'yi kendisi
-- gönderiyor: payload.user_id = user.id).
-- ============================================================
