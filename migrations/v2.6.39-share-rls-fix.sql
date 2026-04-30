-- ============================================================
-- ProChefDesk v2.6.39 — public_shares RLS açığı düzeltmesi
-- ============================================================
-- ARKA PLAN:
-- v2.5.7 migration'ı public_shares tablosuna USING (true) olan bir
-- public SELECT politikası eklemişti. Niyet: "share ID'leri rastgele
-- 12 karakter token, ID'yi bilmek erişim demek."
--
-- Postgres RLS böyle çalışmıyor: USING (true) ile herhangi bir anonim
-- istemci `SELECT * FROM public_shares` çekip tüm tabloyu dökebilir.
-- Bu da şunları açığa çıkarıyordu:
--   - owner_id (her share'in sahibi)
--   - source_id (iç tarif/menü ID'leri)
--   - view_count (özel analytics)
--   - başka kullanıcıların paylaştığı tüm payload'lar
--
-- ÇÖZÜM:
-- 1) Açık SELECT politikasını kaldır.
-- 2) Owner-only SELECT politikası ekle (My Shares listesi çalışsın diye).
-- 3) SECURITY DEFINER `fetch_share_by_id(share_id)` RPC ekle. Bu fonksiyon
--    SADECE public viewer'ın ihtiyacı olan kolonları döner: id, kind,
--    payload, paused. owner_id ve view_count anonim çağırana ASLA gitmez.
-- 4) js/core/share.js'teki fetchShare() artık doğrudan SELECT yerine bu
--    RPC'yi çağırıyor (v2.6.39 kod paketinde değişti).
--
-- DEPLOY SIRASI (ÖNEMLİ):
-- 1. Bu migration'ı Supabase Dashboard → SQL Editor'de çalıştır.
-- 2. v2.6.39 kodunu prochefdesk.com'a deploy et.
--
-- Sıra önemli: önce kod deploy edilirse, eski tarayıcı cache'leri
-- kısa süre "share not found" görebilir.
-- ============================================================

BEGIN;

-- 1) Açık public SELECT politikasını düşür.
DROP POLICY IF EXISTS public_shares_read_by_id ON public_shares;

-- 2) Owner-only SELECT — kullanıcı sadece kendi share'lerini görür.
--    "My Shares" listesi, share lookup (createOrGetShareUrl), pause/delete
--    bu politika sayesinde çalışmaya devam eder.
DROP POLICY IF EXISTS public_shares_owner_select ON public_shares;
CREATE POLICY public_shares_owner_select
  ON public_shares
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- 3) Public fetcher RPC. Sadece public viewer'ın ihtiyacı olan kolonları
--    döner. SECURITY DEFINER ile RLS bypass edilir; ama anon kullanıcı
--    sadece zaten ID'sini bildiği bir share'e ulaşabilir, listele(ye)mez.
CREATE OR REPLACE FUNCTION fetch_share_by_id(share_id text)
RETURNS TABLE(
  id      text,
  kind    text,
  payload jsonb,
  paused  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.kind, s.payload, s.paused
  FROM public_shares s
  WHERE s.id = share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fetch_share_by_id(text) TO anon, authenticated;

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- Migration sonrası Supabase Dashboard → Table Editor → public_shares
-- üzerinde "Anon" rolüyle "View as" deneyince tablo BOŞ görünmeli.
-- (Çünkü artık anon SELECT yetkisi yok.)
--
-- RPC çalışıyor mu:
--   SELECT * FROM fetch_share_by_id('test-share-id-buraya');
--   -- mevcut bir share ID için 1 satır dönmeli (id, kind, payload, paused)
--
-- Authenticated kullanıcı kendi share'lerini görebilmeli:
--   (kendi JWT'nizle SQL Editor'de)
--   SELECT * FROM public_shares;
--   -- sadece kendi rowlarınız dönmeli
--
-- KOD AYAĞI:
-- v2.6.39 paketindeki js/core/share.js içindeki fetchShare() artık
-- supabase.rpc('fetch_share_by_id', { share_id: shareId }) çağırıyor.
-- Eski .from('public_shares').select('*') yolu artık kullanılmıyor.
-- ============================================================
