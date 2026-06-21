-- ================================================================
-- ProChefDesk — v2.44.38 FIX: free→pro dönüşümü çalışmıyordu
-- ----------------------------------------------------------------
-- KÖK NEDEN (koddan doğrulandı, 2026-06-21):
--   Yeni bir FREE hesabın `user_prefs` satırı HİÇ oluşmuyordu, çünkü:
--     (1) signup'ta user_prefs satırı yaratan bir DB trigger yoktu, ve
--     (2) free kullanıcı buluta yazmaz (cloud-pertable queueUpsert,
--         syncAllowed()/cloudSync:false ile erken döner).
--   stripe-webhook ve create-checkout-session ise plan/customer_id'yi
--   `.update().eq('user_id', ...)` (UPSERT DEĞİL) ile yazıyor. Satır
--   yoksa UPDATE 0 satır eşler, sessizce hiçbir şey yazmaz → ödeme
--   geçer ama plan asla 'pro' olmaz.
--
-- ÇÖZÜM:
--   Her auth.users INSERT'inde user_prefs satırını otomatik oluştur
--   (SECURITY DEFINER trigger) + satırı olmayan mevcut kullanıcılar
--   için tek seferlik backfill. Böylece tüm .update() yolları satırı
--   bulur; manuel-pro guard'ı (plan_source='manual') bozulmaz çünkü
--   yeni satır plan_source='none' default'uyla gelir.
--
-- Çalıştırma: Supabase SQL Editor → bu dosyayı yapıştır → Run.
-- Idempotent: tekrar çalıştırmak güvenli.
-- ================================================================

-- ============ 1. SATIR OLUŞTURMA FONKSİYONU ============
CREATE OR REPLACE FUNCTION public.pcd_handle_new_user_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_prefs (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============ 2. TRIGGER (her yeni kullanıcıda) ============
DROP TRIGGER IF EXISTS pcd_on_auth_user_created_prefs ON auth.users;
CREATE TRIGGER pcd_on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.pcd_handle_new_user_prefs();

-- ============ 3. BACKFILL (mevcut satırsız kullanıcılar + test hesabı) ============
INSERT INTO public.user_prefs (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============ 4. DOĞRULAMA (opsiyonel) ============
-- Satırsız kullanıcı kalmamalı (0 dönmeli):
--   SELECT count(*) FROM auth.users u
--    WHERE NOT EXISTS (SELECT 1 FROM user_prefs p WHERE p.user_id = u.id);
