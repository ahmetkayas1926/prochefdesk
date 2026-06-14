-- ============================================================
-- ProChefDesk v2.44.26 — pcd_purge_workspace TÜM tabloları sil (BUG FIX)
-- ============================================================
-- BUG (denetimde bulundu, v2.44.26):
--   pcd_purge_workspace (Trash → "Delete forever" / purgeWorkspace) v2.7.6'da
--   yazıldı ve YALNIZCA 16 ws-scoped tabloyu siliyordu. Sonradan eklenen 8 tablo
--   listeye HİÇ işlenmedi:
--     - haccp_receiving, haccp_holding   (v2.8.44)
--     - buffets, mise_plans, team        (v2.9.17)
--     - whiteboards                      (v2.9.42)
--     - rosters                          (v2.15.3)
--     - prep_sheets                      (v2.16)
--
--   SONUÇ: Kullanıcı bir workspace'i KALICI sildiğinde (purge), bu 8 tablodaki
--   satırlar bulutta SİLİNMİYORDU → ölü workspace_id ile orphan satırlar kalıyor
--   (depolama sızıntısı + gizlilik: "kalıcı sil" verinin tamamını silmiyordu —
--   özellikle Buffet Planner / Whiteboard / Roster / Prep Sheet / HACCP kayıtları).
--
--   NOT: soft-delete + restore CASCADE TRIGGER'ları (cascade_soft_delete_workspace_data
--   + cascade_restore_workspace_data) v2.16'da DOĞRU şekilde 24 tabloyu kapsıyordu.
--   Yalnızca HARD-DELETE purge RPC'si stale kalmıştı.
--
-- BU MIGRATION:
--   pcd_purge_workspace'i CREATE OR REPLACE ile günceller → 24 ws-scoped tablonun
--   HEPSİNİ siler. Davranış aynı (atomik, SECURITY DEFINER), sadece tablo listesi
--   tam. Idempotent — güvenle tekrar çalıştırılabilir. Hiçbir tablo/veri DROP
--   edilmez; yalnızca purge'ün eksik sildiği satırlar artık tam siliniyor.
--
--   Frontend ayağı (app/js/core/store.js): purgeWorkspace + deleteWorkspace +
--   restoreWorkspace + replaceAll orphan-cleanup listelerine aynı 6 yerel anahtar
--   (buffets·misePlans·team·whiteboards·haccpReceiving·haccpHolding) eklendi
--   (rosters + prepSheets zaten vardı) → bu push'la gider.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pcd_purge_workspace(
  p_workspace_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  -- 24 ws-scoped tablo (cascade_soft_delete_workspace_data v2.16 ile birebir aynı küme)
  ws_tables text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
    -- v2.44.26 — purge'e eklenen 8 tablo (önceden eksikti)
    'haccp_receiving', 'haccp_holding',
    'buffets', 'mise_plans', 'team', 'whiteboards',
    'rosters', 'prep_sheets'
  ];
  t text;
BEGIN
  -- 1) 24 ws-scoped tablodan tüm satırları sil
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE workspace_id = $1 AND user_id = $2',
      t
    ) USING p_workspace_id, p_user_id;
  END LOOP;

  -- 2) Workspace meta satırını sil
  DELETE FROM workspaces
  WHERE id = p_workspace_id AND user_id = p_user_id;

  -- 3) Tombstone'u sil (reverse cascade trigger tetiklenir ama hedef satırlar
  --    zaten gitti — no-op UPDATE'ler)
  DELETE FROM workspace_tombstones
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$function$;

-- ============================================================
-- DOĞRULAMA (çalıştırdıktan sonra, ayrı):
--
-- 1. Fonksiyon güncellendi mi (8 yeni tablo metinde var mı):
--   SELECT pg_get_functiondef('public.pcd_purge_workspace(text,uuid)'::regprocedure)
--          LIKE '%buffets%' AND pg_get_functiondef('public.pcd_purge_workspace(text,uuid)'::regprocedure)
--          LIKE '%prep_sheets%' AS purge_complete;
--   Beklenen: purge_complete = true
--
-- 2. Son değişiklik bugünün tarihi mi:
--   SELECT routine_name, last_altered FROM information_schema.routines
--   WHERE routine_name = 'pcd_purge_workspace';
--
-- 3. (Opsiyonel manuel test — DİKKAT, gerçekten siler):
--   Test bir workspace oluştur, içine bir buffet ekle, Trash'ten "Delete forever".
--   Sonra: SELECT count(*) FROM buffets WHERE workspace_id = '<o_ws_id>';  → 0 olmalı.
--
-- GELECEK NOTU: Yeni ws-scoped tablo eklerken 3 DB mekanizmasını birlikte güncelle:
--   cascade_soft_delete_workspace_data · cascade_restore_workspace_data · pcd_purge_workspace.
--   (Bu bug, ilk ikisi güncellenip üçüncüsünün unutulmasından çıktı.)
-- ============================================================
