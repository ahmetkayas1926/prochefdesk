-- ============================================================================
-- ProChefDesk — Server-side cleanup (v2.6.97)
-- ============================================================================
-- AMAÇ:
-- Soft-deleted kayıtlar (deleted_at IS NOT NULL) 30 gün boyunca Trash'te
-- tutuluyor; sonrasında DB'de kalmamalı (yoksa şişer). Bu migration:
--   1. Tüm ws-scoped tabloları + workspaces + workspace_tombstones'tan
--      30 günü geçen soft-delete kayıtlarını fiziksel siliyor.
--   2. pg_cron ile günlük (UTC 03:00) otomatik çalışıyor.
--
-- KAPSAM (17 tablo):
--   recipes, ingredients, menus, events, suppliers, canvases,
--   shopping_lists, checklist_templates, inventory, waste,
--   checklist_sessions, stock_count_history,
--   haccp_logs, haccp_units, haccp_readings, haccp_cook_cool,
--   workspaces
--   + workspace_tombstones (kendisi tombstone, 30 gün sonra ihtiyaç biter)
--
-- KURULUM (Supabase Studio):
--   1) Database → Extensions → "pg_cron" ara → Enable
--   2) SQL Editor → bu dosyanın TAMAMINI yapıştır → Run
--   3) Cron job'un kaydedildiğini doğrula:
--      SELECT * FROM cron.job WHERE jobname = 'pcd-cleanup-old-deleted';
--
-- MANUEL TEST (kurulumdan sonra):
--   SELECT * FROM pcd_cleanup_old_deleted();
--   → Her tablo için kaç satır silindiğini döner. İlk çağrıda muhtemelen
--     hepsi 0 (mevcut Trash 30 günden yeni). Sonraki günlerde silmeye başlar.
-- ============================================================================

-- 1) pg_cron extension (Dashboard'dan da etkinleştirilebilir, idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2) Cleanup function — döndürüğü tablo: silinen tablo adı + satır sayısı
CREATE OR REPLACE FUNCTION public.pcd_cleanup_old_deleted()
RETURNS TABLE(tbl text, removed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tbls text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
    'workspaces'
  ];
  t text;
  cnt bigint;
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL ''30 days''',
      t
    );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    tbl := t;
    removed := cnt;
    RETURN NEXT;
  END LOOP;

  -- workspace_tombstones: 30 günü geçen tombstone'lar artık cross-device
  -- cascade için gerekli değil (devices çoktan eşitlendi).
  DELETE FROM workspace_tombstones WHERE deleted_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  tbl := 'workspace_tombstones';
  removed := cnt;
  RETURN NEXT;
END;
$$;

-- 3) Cron schedule — günde bir kez UTC 03:00 (Perth/Avustralya saatiyle gece-sabah)
-- Var olan kaydı silip yeniden ekliyoruz ki yeniden çalıştırma idempotent olsun.
DO $$
BEGIN
  PERFORM cron.unschedule('pcd-cleanup-old-deleted');
EXCEPTION WHEN OTHERS THEN
  -- Job mevcut değilse hata fırlatır, sessizce geç.
  NULL;
END $$;

SELECT cron.schedule(
  'pcd-cleanup-old-deleted',
  '0 3 * * *',                              -- her gün 03:00 UTC
  $$ SELECT public.pcd_cleanup_old_deleted(); $$
);

-- 4) Doğrulama (Studio'da çalıştırırken son ekrana yansır)
SELECT 'cron job registered' AS status,
       jobname, schedule, active
FROM cron.job
WHERE jobname = 'pcd-cleanup-old-deleted';
