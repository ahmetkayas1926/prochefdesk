-- ================================================================
-- ProChefDesk — v2.19 FIX: user_prefs re-sync 42501 hatası
-- ----------------------------------------------------------------
-- SORUN (kesin tespit): "Re-sync my data" → 403 / 42501
--   "permission denied for table user_prefs"
-- KÖK NEDEN: v2.17-monetization-plan-fields migration'ı plan kolonlarını
-- kilitlemek için REVOKE UPDATE yaptı, sonra UPDATE'i (data, active_workspace_id,
-- updated_at) kolonlarına geri verdi — ama `user_id`'ye vermedi. Frontend
-- user_prefs'i upsert(onConflict: user_id) ile yazar; PostgREST'in
-- ON CONFLICT DO UPDATE adımı user_id'yi de SET eder → izin reddi → upsert düşer.
--
-- ÇÖZÜM: UPDATE grant'ına user_id'yi ekle. Güvenlik korunur:
--   - RLS user_prefs_update_own WITH CHECK (auth.uid() = user_id) → kullanıcı
--     user_id'yi başkasınınkine çeviremez (cross-user hijack imkansız).
--   - plan kolonları (plan, plan_source, plan_status, plan_expires_at,
--     stripe_customer_id) UPDATE grant'ında YOK → hâlâ kilitli; kullanıcı
--     kendini pro yapamaz.
--
-- Çalıştırma: Supabase SQL Editor → yapıştır → Run. Idempotent (tekrar güvenli).
-- ================================================================

GRANT UPDATE (user_id, data, active_workspace_id, updated_at) ON user_prefs TO authenticated;

-- Doğrulama (opsiyonel):
-- SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--  WHERE table_name = 'user_prefs' AND privilege_type = 'UPDATE'
--  ORDER BY column_name;
