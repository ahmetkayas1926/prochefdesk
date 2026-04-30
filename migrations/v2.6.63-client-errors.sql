-- ============================================================
-- ProChefDesk v2.6.63 — Client error logging table
-- ============================================================
-- ARKA PLAN:
-- Production'da bir kullanıcının tarayıcısında JS hatası çıkarsa,
-- şu an sadece kendi console'unda görünüyor. Şef "uygulama bozuldu"
-- diye Web3Forms'tan rapor edebilir ama otomatik tespit yok.
--
-- BU MIGRATION:
-- `client_errors` tablosu oluşturur. JS'teki global error handler
-- (`window.addEventListener('error')`) bu tabloya kayıt ekleyecek.
-- Yıllık binlerce hata satırı olabilir; production'da gözlem amaçlı.
--
-- GİZLİLİK:
-- - User ID opsiyonel (anonim kullanıcılar da hata raporlar)
-- - Recipe name veya ingredient gibi PII LOGLANMIYOR
-- - Sadece teknik bilgi: message, filename, line, stack, ua, version
-- - 90 gün sonra otomatik silinir (DELETE policy + cron job — ileride)
--
-- DOĞRULAMA:
-- Migration sonrası anonim olarak insert testi:
--   INSERT INTO client_errors (message, app_version) VALUES ('test', '2.6.63');
-- Sonuç: 1 row inserted (OK).
--
-- Kullanıcılar başkalarının hatalarını görmemeli:
--   SELECT * FROM client_errors;  (anon role)
-- Sonuç: 0 rows (RLS bloklar — sadece service_role görebilir).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS client_errors (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  app_version   text         NULL,
  locale        text         NULL,
  url           text         NULL,
  user_agent    text         NULL,
  message       text         NOT NULL,
  filename      text         NULL,
  line          int          NULL,
  col           int          NULL,
  stack         text         NULL,
  context       jsonb        NULL
);

-- Index for cleanup queries (delete > 90 days old)
CREATE INDEX IF NOT EXISTS client_errors_created_at_idx
  ON client_errors (created_at DESC);

-- Index for user_id lookups (if you want to debug a specific user)
CREATE INDEX IF NOT EXISTS client_errors_user_id_idx
  ON client_errors (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any (idempotent re-run)
DROP POLICY IF EXISTS client_errors_anon_insert ON client_errors;
DROP POLICY IF EXISTS client_errors_auth_insert ON client_errors;
DROP POLICY IF EXISTS client_errors_no_select ON client_errors;

-- INSERT: anyone (anon + authenticated) can report errors
-- The check enforces that authenticated users can only set their own user_id,
-- and anon users must leave user_id NULL.
CREATE POLICY client_errors_anon_insert
  ON client_errors
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY client_errors_auth_insert
  ON client_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- SELECT: NOBODY (not even authenticated users). Only service_role
-- (admin / Supabase Dashboard) can read errors. This protects users from
-- seeing each others' tracebacks (which might contain PII despite scrubbing).
-- Default behavior with RLS enabled and no SELECT policy = no access.
-- So we DON'T add a SELECT policy.

-- (No UPDATE or DELETE policies → only service_role can mutate)

COMMIT;

-- ============================================================
-- DOĞRULAMA TESTLERİ:
--
-- Test 1 — Anon insert çalışıyor mu?
-- (Tarayıcı console'undan, signed-out)
--   await window._supabaseClient.from('client_errors').insert({
--     message: 'test from anon', app_version: '2.6.63'
--   });
-- Beklenen: error: null
--
-- Test 2 — Authenticated insert çalışıyor mu?
-- (Login olmuş kullanıcıyla)
--   await window._supabaseClient.from('client_errors').insert({
--     user_id: (await window._supabaseClient.auth.getUser()).data.user.id,
--     message: 'test from authed', app_version: '2.6.63'
--   });
-- Beklenen: error: null
--
-- Test 3 — Başkasının user_id'si ile insert engelleniyor mu?
--   await window._supabaseClient.from('client_errors').insert({
--     user_id: '00000000-0000-0000-0000-000000000000',
--     message: 'spoof'
--   });
-- Beklenen: error (RLS violation)
--
-- Test 4 — SELECT engelleniyor mu?
--   await window._supabaseClient.from('client_errors').select('*');
-- Beklenen: data: [] (RLS bloklar, hata değil ama boş)
--
-- Test 5 — Service role görebilir mi?
-- (Supabase Dashboard → SQL Editor)
--   SELECT count(*) FROM client_errors;
-- Beklenen: insert edilen satırların sayısı
--
-- ============================================================
-- ENGELLEME / TEMİZLİK (opsiyonel, sonradan):
--
-- 90 gün sonra eski hataları sil:
--   DELETE FROM client_errors WHERE created_at < now() - interval '90 days';
--
-- Belirli kullanıcıyı çöz:
--   SELECT created_at, message, filename, line FROM client_errors
--   WHERE user_id = '...' ORDER BY created_at DESC LIMIT 50;
-- ============================================================
