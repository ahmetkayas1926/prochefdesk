-- ============================================================
-- ProChefDesk v2.6.77 — Realtime DELETE event fix
-- REPLICA IDENTITY FULL ayarı
-- ============================================================
-- SORUN:
-- PostgreSQL'de bir tablo DELETE edildiğinde, Realtime kanalına
-- gönderilen event'in payload'ı REPLICA IDENTITY ayarına bağlı:
--
--   - DEFAULT (varsayılan): sadece primary key gönderilir.
--                          → DELETE event sadece { id } içerir
--                          → user_id YOK, workspace_id YOK
--                          → Realtime filter 'user_id=eq.X' eşleşemez
--                          → event client'a İLETİLMEZ
--
--   - FULL: tüm satır gönderilir (user_id, workspace_id, data dahil)
--           → filter doğru çalışır
--           → DELETE event Cihaz B'ye düzgün ulaşır
--
-- TESPİT:
-- v2.6.76 testlerinde Cihaz A'da waste/HACCP form/workspace sildiğinde
-- Cihaz B'de değişiklik görünmüyordu. Lokal silme + cloud-pertable
-- queueDelete + Supabase DELETE doğru çalışıyordu, ama Cihaz B'ye
-- DELETE event'i ulaşmıyordu çünkü REPLICA IDENTITY DEFAULT.
--
-- ÇÖZÜM:
-- Realtime publication'a dahil tüm tablolar için REPLICA IDENTITY FULL.
-- Eski tablolarda (recipes vs.) zaten soft-delete pattern kullanıyordu
-- (UPDATE event), bu sorun ortaya çıkmamıştı. Ama tutarlılık için tüm
-- Realtime tablolar FULL olmalı.
--
-- MALİYET:
-- FULL biraz daha fazla disk I/O kullanır (her UPDATE'te eski satırın
-- tümü WAL'a yazılır). ProChefDesk için kayıtlar küçük (recipe ~5KB),
-- günlük yazım hacmi düşük. Maliyet ihmal edilebilir.
-- ============================================================

BEGIN;

-- v2.6.66 tabloları
ALTER TABLE workspaces           REPLICA IDENTITY FULL;
ALTER TABLE recipes              REPLICA IDENTITY FULL;
ALTER TABLE ingredients          REPLICA IDENTITY FULL;
ALTER TABLE menus                REPLICA IDENTITY FULL;
ALTER TABLE events               REPLICA IDENTITY FULL;
ALTER TABLE suppliers            REPLICA IDENTITY FULL;
ALTER TABLE canvases             REPLICA IDENTITY FULL;
ALTER TABLE shopping_lists       REPLICA IDENTITY FULL;
ALTER TABLE checklist_templates  REPLICA IDENTITY FULL;
ALTER TABLE inventory            REPLICA IDENTITY FULL;
ALTER TABLE user_prefs           REPLICA IDENTITY FULL;

-- v2.6.71 tabloları
ALTER TABLE waste                REPLICA IDENTITY FULL;
ALTER TABLE checklist_sessions   REPLICA IDENTITY FULL;
ALTER TABLE stock_count_history  REPLICA IDENTITY FULL;
ALTER TABLE haccp_logs           REPLICA IDENTITY FULL;
ALTER TABLE haccp_units          REPLICA IDENTITY FULL;
ALTER TABLE haccp_readings       REPLICA IDENTITY FULL;
ALTER TABLE haccp_cook_cool      REPLICA IDENTITY FULL;
ALTER TABLE workspace_tombstones REPLICA IDENTITY FULL;

COMMIT;

-- ============================================================
-- DOĞRULAMA:
--
-- Tüm tabloların REPLICA IDENTITY'si FULL olmalı:
--
--   SELECT
--     c.relname AS table_name,
--     CASE c.relreplident
--       WHEN 'd' THEN 'DEFAULT'
--       WHEN 'n' THEN 'NOTHING'
--       WHEN 'f' THEN 'FULL'
--       WHEN 'i' THEN 'INDEX'
--     END AS replica_identity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--   AND c.relname IN (
--     'workspaces','recipes','ingredients','menus','events','suppliers',
--     'canvases','shopping_lists','checklist_templates','inventory',
--     'user_prefs','waste','checklist_sessions','stock_count_history',
--     'haccp_logs','haccp_units','haccp_readings','haccp_cook_cool',
--     'workspace_tombstones'
--   )
--   ORDER BY c.relname;
--
-- Beklenen: 19 satır, hepsi replica_identity = 'FULL'
-- ============================================================
