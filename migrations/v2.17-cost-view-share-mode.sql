-- ================================================================
-- ProChefDesk — v2.17 Cost-view: public_shares.share_mode
-- ----------------------------------------------------------------
-- Spec Bölüm 5. Aynı tarif/menü için hem normal ('public') hem de
-- maliyetli ('cost') paylaşım bağlantısı olabilsin diye public_shares'e
-- share_mode kolonu eklenir ve tekillik (owner, kind, source) →
-- (owner, kind, source, share_mode) olarak genişletilir.
--
-- GÜVENLİK: Cost-share'ler de mevcut "ID'yi bilen okur" (USING true) RLS
-- politikasıyla korunur — paylaşım ID'si 12 karakterlik tahmin edilemez
-- token'dır. Maliyet verisi yalnızca cost-share payload'una gömülür;
-- normal public link maliyet sızdırmaz (frontend snapshot'a maliyet koymaz).
--
-- Çalıştırma: Supabase SQL Editor → yapıştır → Run. Idempotent.
-- ================================================================

ALTER TABLE public_shares
  ADD COLUMN IF NOT EXISTS share_mode text NOT NULL DEFAULT 'public';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public_shares ADD CONSTRAINT public_shares_mode_chk
      CHECK (share_mode IN ('public','cost'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Tekillik artık share_mode'u da içerir → aynı kaynağın public + cost
-- bağlantıları yan yana yaşayabilir (createOrGetShareUrl idempotent kalır).
DROP INDEX IF EXISTS public_shares_unique_source;
CREATE UNIQUE INDEX public_shares_unique_source
  ON public_shares (owner_id, kind, source_id, share_mode);

-- Doğrulama:
-- SELECT id, kind, source_id, share_mode FROM public_shares LIMIT 5;
