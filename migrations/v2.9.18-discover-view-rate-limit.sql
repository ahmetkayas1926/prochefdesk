-- ============================================================
-- ProChefDesk v2.9.18 — Discover view count rate limit
-- ============================================================
-- ARKA PLAN:
-- v2.8.46'da increment_recipe_view() RPC anonymous'a açıldı (Discover
-- public feed view counter için). Spam vulnerability: aynı kullanıcı /
-- script 1000 kez tetikleyip view_count'u fişek edebilir.
--
-- Risk MVP'de kabul edildi (operatör solo kullanıcı, viral değil).
-- Backlog #7 olarak takip edildi. v2.9.18'de operatör onayı geldi.
--
-- ÇÖZÜM:
--   1) Yeni tablo discover_view_logs (ip + recipe_id + viewed_at)
--   2) Edge Function rate-limited-view (anonymous + auth fark etmez):
--      - Client IP'i x-forwarded-for header'ından al
--      - Son 1 saatte (IP, recipe_id) için log var mı kontrol et
--      - Yoksa: log INSERT + recipes.view_count++
--      - Varsa: 204 No Content (throttled)
--   3) Discover.js bumpViewCount → eski RPC yerine edge function çağrısı
--   4) pg_cron job: 2 saatten eski log'ları sil (24h tutsa table şişer)
--
-- ESKİ increment_recipe_view RPC kalır (legacy / fallback için). Yeni
-- frontend artık çağırmaz. Sonraki round'da silinebilir.
-- ============================================================

BEGIN;

-- ============ 1. DISCOVER_VIEW_LOGS TABLOSU ============
-- Composite PK (ip, recipe_id) — aynı IP+recipe için tek satır,
-- INSERT ... ON CONFLICT pattern ile rate limit check.
CREATE TABLE IF NOT EXISTS discover_view_logs (
  ip           text         NOT NULL,
  recipe_id    text         NOT NULL,
  viewed_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (ip, recipe_id)
);

CREATE INDEX IF NOT EXISTS discover_view_logs_viewed_at_idx
  ON discover_view_logs (viewed_at);

-- RLS: bu tablo Edge Function service_role ile yazılır, kullanıcı asla
-- direkt erişmez. Yine de güvenlik açısından RLS aç, hiçbir policy yok.
ALTER TABLE discover_view_logs ENABLE ROW LEVEL SECURITY;

-- ============ 2. RATE-LIMITED INCREMENT FUNCTION ============
-- Edge Function bu RPC'i SECURITY DEFINER ile çağırır.
-- Anonymous client direkt çağıramaz (GRANT execute service_role only).
CREATE OR REPLACE FUNCTION pcd_rate_limited_view_bump(
  p_ip         text,
  p_recipe_id  text,
  p_window_minutes int DEFAULT 60
) RETURNS boolean AS $$
DECLARE
  v_throttled boolean := false;
BEGIN
  -- Atomic insert-or-check: aynı (ip, recipe_id) son window içinde varsa
  -- ON CONFLICT branch fire eder, yeni row insert edilmez.
  INSERT INTO discover_view_logs (ip, recipe_id, viewed_at)
  VALUES (p_ip, p_recipe_id, now())
  ON CONFLICT (ip, recipe_id) DO UPDATE
    SET viewed_at = CASE
      WHEN discover_view_logs.viewed_at < (now() - (p_window_minutes || ' minutes')::interval)
      THEN now()  -- window expired, refresh + allow bump
      ELSE discover_view_logs.viewed_at  -- still within window, no-op
    END
  RETURNING (viewed_at = now()) INTO v_throttled;

  -- v_throttled = true demek "yeni log yazıldı veya window expire'dı" → bump uygula
  -- v_throttled = false demek "halen window içinde" → bump yok
  IF v_throttled THEN
    UPDATE recipes
      SET view_count = COALESCE(view_count, 0) + 1
      WHERE id = p_recipe_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anonymous + authenticated EXECUTE ÇEKMEZ. Sadece service_role
-- (Edge Function context'i) çağırabilir.
REVOKE EXECUTE ON FUNCTION pcd_rate_limited_view_bump(text, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pcd_rate_limited_view_bump(text, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION pcd_rate_limited_view_bump(text, text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION pcd_rate_limited_view_bump(text, text, int) TO service_role;

-- ============ 3. CLEANUP CRON ============
-- 2 saatten eski log'ları sil. 1 saat window içinde sayıldığı için
-- 2 saatten eski log'lar zaten throttling için irrelevant.
CREATE OR REPLACE FUNCTION pcd_cleanup_view_logs()
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM discover_view_logs
    WHERE viewed_at < (now() - interval '2 hours');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION pcd_cleanup_view_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pcd_cleanup_view_logs() TO service_role;

-- Schedule: her saat başı (00 dakikada)
-- pg_cron extension assumed (mevcut migrations'tan: v2.6.97-cleanup-cron,
-- v2.7.8-backup-cron-timeout). schedule signature aynı.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: önce unschedule (varsa), sonra yeniden schedule
    PERFORM cron.unschedule('pcd-cleanup-view-logs') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'pcd-cleanup-view-logs'
    );
    PERFORM cron.schedule(
      'pcd-cleanup-view-logs',
      '0 * * * *',  -- her saat başı
      'SELECT pcd_cleanup_view_logs();'
    );
  END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışı):
--
-- 1. Tablo oluştu mu:
--   SELECT tablename FROM pg_tables WHERE tablename = 'discover_view_logs';
--   Beklenen: 1 satır
--
-- 2. RLS açık (policy yok, sadece service_role yazabilir):
--   SELECT rowsecurity FROM pg_tables WHERE tablename = 'discover_view_logs';
--   Beklenen: t
--
-- 3. RPC fonksiyonu + güvenlik:
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('pcd_rate_limited_view_bump', 'pcd_cleanup_view_logs');
--   Beklenen: 2 satır, prosecdef=true (SECURITY DEFINER)
--
-- 4. Anon EXECUTE engelli:
--   SELECT has_function_privilege('anon', 'pcd_rate_limited_view_bump(text,text,int)', 'EXECUTE');
--   Beklenen: f
--
-- 5. Cron job kaydedildi mi:
--   SELECT jobname, schedule FROM cron.job
--   WHERE jobname = 'pcd-cleanup-view-logs';
--   Beklenen: 1 satır, schedule = '0 * * * *'
--
-- KOD AYAĞI:
--   - supabase/functions/rate-limited-view/index.ts (YENİ, deploy gerek)
--   - app/js/tools/discover.js (bumpViewCount: rpc → functions.invoke)
--   - app/js/core/config.js (APP_VERSION 2.9.17 → 2.9.18)
--
-- DEPLOY ADIMI (operatör):
-- 1. Bu migration'ı Supabase Dashboard → SQL Editor'da çalıştır
-- 2. supabase/functions/rate-limited-view'u Supabase Dashboard'tan
--    "New Function" ile yükle (veya supabase CLI: `supabase functions
--    deploy rate-limited-view`)
-- 3. GitHub Desktop push (frontend wire)
-- ============================================================
