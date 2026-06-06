-- ================================================================
-- ProChefDesk — v2.17 Monetization: user_prefs plan kolonları
-- ----------------------------------------------------------------
-- Spec Bölüm 1. Plan artık user_prefs'in AYRI KOLONLARINDA tutulur
-- (data jsonb blob'unda DEĞİL). Sebep: Stripe webhook'u service_role
-- ile sadece bu kolonları güvenle güncelleyebilsin; frontend'in tüm
-- data blob'unu overwrite etmesi planı ezmesin.
--
-- KRİTİK GÜVENLİK: Kolon-seviyesi yetki kilidi. Frontend (authenticated)
-- bu kolonları YAZAMAZ — yalnızca okuyabilir. Yazma yetkisi service_role'da
-- (Stripe webhook) veya doğrudan SQL'de (operatör manuel pro). Bu olmadan
-- kullanıcı API'den plan='pro' set edip kendini ücretsiz pro yapabilirdi.
--
-- Çalıştırma: Supabase SQL Editor → bu dosyayı yapıştır → Run.
-- Idempotent: tekrar çalıştırmak güvenli.
-- ================================================================

-- ============ 1. KOLONLAR ============
ALTER TABLE user_prefs
  ADD COLUMN IF NOT EXISTS plan               text        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_source        text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS plan_status        text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS plan_expires_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text        NULL;

-- ============ 2. DEĞER KONTROLLERİ (veri hijyeni) ============
-- Webhook bu kümelere maplenmiş değerler yazar (trialing→active vb.).
DO $$
BEGIN
  BEGIN
    ALTER TABLE user_prefs ADD CONSTRAINT user_prefs_plan_chk
      CHECK (plan IN ('free','pro'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE user_prefs ADD CONSTRAINT user_prefs_plan_source_chk
      CHECK (plan_source IN ('stripe','manual','none'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE user_prefs ADD CONSTRAINT user_prefs_plan_status_chk
      CHECK (plan_status IN ('active','canceled','past_due','none'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============ 3. GERİYE DÖNÜK TAŞIMA (grandfather) ============
-- Eski sürümlerde plan, data jsonb blob'unda tutuluyordu. Orada 'pro'/'team'
-- olan mevcut kullanıcılar manuel pro olarak korunur (kimse pro'sunu kaybetmesin).
UPDATE user_prefs
   SET plan = 'pro', plan_source = 'manual', plan_status = 'active'
 WHERE (data->>'plan') IN ('pro','team')
   AND plan = 'free';

-- ============ 4. KOLON-SEVİYESİ YETKİ KİLİDİ ============
-- Önce user_prefs üzerindeki blanket INSERT/UPDATE yetkilerini kaldır,
-- sonra frontend'in GERÇEKTEN yazdığı kolonları geri ver. Plan kolonları
-- bilinçli olarak DIŞARIDA bırakılır → authenticated/anon onları yazamaz.
-- SELECT tam kalır (frontend planını okuyabilmeli). service_role tüm
-- kolon kısıtlarını baypas eder (webhook yazabilir).
REVOKE INSERT, UPDATE ON user_prefs FROM authenticated, anon;

GRANT SELECT ON user_prefs TO authenticated, anon;
GRANT INSERT (user_id, data, active_workspace_id, updated_at) ON user_prefs TO authenticated;
GRANT UPDATE (data, active_workspace_id, updated_at)          ON user_prefs TO authenticated;

-- Not: RLS politikaları (satır sahipliği) aynen geçerli kalır; bu yetki
-- kilidi onların ÜSTÜNE kolon-bazlı ikinci bir katman ekler.

-- ============ 5. DOĞRULAMA (opsiyonel, çalıştırınca görmek için) ============
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'user_prefs' ORDER BY ordinal_position;
