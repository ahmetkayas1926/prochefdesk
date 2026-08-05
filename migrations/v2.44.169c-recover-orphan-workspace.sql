-- ============================================================================
-- ProChefDesk — Sahipsiz kalmış workspace verisini kurtar (tek seferlik)
-- ============================================================================
-- DURUM:
--   workspaces tablosunda `ws_mr7yivc3_sdjmei` kaydı VAR ama user_id'si
--   6acb2fa8-258e-436f-9944-88f885c91f60 (başka hesap). Aynı workspace_id'ye
--   bağlı 386 veri satırı ise 7b33191d-70fa-4783-913e-3b87fdb9b58a
--   (yasserraraffatt@gmail.com) kimliğinde. Bağ koptuğu için uygulama bu
--   workspace'i listelemiyor, veriler erişilemez halde duruyor.
--
--   İçerik: sales_log 120 · haccp_readings 180 · haccp_holding 36 ·
--   haccp_receiving 16 · haccp_cook_cool 15 · checklist_templates 5 ·
--   haccp_units 5 · buffets 2 · whiteboards 2 · canvases 1 · haccp_logs 1 ·
--   rosters 1  (6–10 Temmuz 2026)
--
-- BU DOSYA NE YAPAR:
--   1. Hedef kullanıcı için YENİ bir workspace satırı açar ("Kurtarılan Veri").
--   2. Eski workspace_id'ye bağlı satırlardan YALNIZCA hedef kullanıcıya ait
--      olanları yeni workspace'e taşır. Diğer hesabın (6acb2fa8) satırlarına
--      ve workspace kaydına DOKUNMAZ.
--
-- ÇALIŞTIRMA: Supabase → SQL Editor → tamamını yapıştır → Run.
--   Sonra uygulamada sayfayı yenile — yeni workspace switcher'da görünür.
--
-- GERİ ALMA: taşıma tersine çevrilebilir —
--   UPDATE <tablo> SET workspace_id='ws_mr7yivc3_sdjmei'
--   WHERE workspace_id='ws_recovered_20260805' AND user_id='<hedef>';
-- ============================================================================

DO $$
DECLARE
  v_old_ws   text := 'ws_mr7yivc3_sdjmei';
  v_new_ws   text := 'ws_recovered_20260805';
  v_user     uuid := '7b33191d-70fa-4783-913e-3b87fdb9b58a';
  v_tables   text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
    'haccp_receiving', 'haccp_holding',
    'buffets', 'mise_plans', 'team', 'whiteboards',
    'rosters', 'prep_sheets', 'sales_log'
  ];
  t text;
  cnt bigint;
  toplam bigint := 0;
BEGIN
  -- 1) Hedef kullanıcı için yeni workspace kaydı (varsa dokunma)
  INSERT INTO workspaces (id, user_id, name, archived, is_active, deleted_at)
  VALUES (v_new_ws, v_user, 'Kurtarılan Veri (Tem 2026)', false, false, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- 2) Satırları taşı — SADECE hedef kullanıcıya ait olanlar
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format(
      'UPDATE %I SET workspace_id = $1 WHERE workspace_id = $2 AND user_id = $3',
      t
    ) USING v_new_ws, v_old_ws, v_user;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    IF cnt > 0 THEN
      RAISE NOTICE 'tasindi: % -> % satir', t, cnt;
      toplam := toplam + cnt;
    END IF;
  END LOOP;

  RAISE NOTICE 'TOPLAM TASINAN SATIR: %', toplam;
END $$;

-- ============================================================================
-- DOĞRULAMA (ayrı çalıştır):
--   SELECT 'sales_log' AS tbl, count(*) FROM sales_log     WHERE workspace_id='ws_recovered_20260805'
--   UNION ALL SELECT 'haccp_readings', count(*) FROM haccp_readings WHERE workspace_id='ws_recovered_20260805'
--   UNION ALL SELECT 'haccp_holding',  count(*) FROM haccp_holding  WHERE workspace_id='ws_recovered_20260805'
--   UNION ALL SELECT 'buffets',        count(*) FROM buffets        WHERE workspace_id='ws_recovered_20260805'
--   UNION ALL SELECT 'rosters',        count(*) FROM rosters        WHERE workspace_id='ws_recovered_20260805';
--
--   Eski workspace'te hedef kullanıcıya ait satır kalmamalı:
--   SELECT count(*) FROM sales_log
--   WHERE workspace_id='ws_mr7yivc3_sdjmei'
--     AND user_id='7b33191d-70fa-4783-913e-3b87fdb9b58a';   -- 0 olmalı
-- ============================================================================
