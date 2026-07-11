-- ============================================================
-- ProChefDesk v2.44.134 — İmza sonrası otomatik e-posta (Faz 1e)
-- ============================================================
-- ARKA PLAN:
-- v2.44.130'da eklenen uzaktan e-imza akışı imzayı kaydediyordu ama
-- hiçbir tarafa haber vermiyordu — şef "Preview"i tekrar açıp kontrol
-- etmek zorundaydı. Operatör talebi: imzalanınca hem müşteriye hem şefe
-- otomatik "imzalandı" e-postası gitsin, içinde imzalı proposal linki.
--
-- ÇÖZÜM: pcd_submit_event_signature RPC'nin dönüş tipi boolean → jsonb
-- olur (event adı + şefin auth.users e-postası + event.clientEmail +
-- share id döner) — submit-event-signature Edge Function bu bilgiyle
-- Resend API'sine 2 e-posta isteği atar. RPC hâlâ SECURITY DEFINER +
-- yalnız service_role EXECUTE edebilir (v2.44.130 ile AYNI güvenlik
-- deseni) — anon hiçbir zaman auth.users'a dolaylı bile erişemez,
-- yalnız Edge Function'ın döndürdüğü email'i okur.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS pcd_submit_event_signature(text, text, text);

CREATE FUNCTION pcd_submit_event_signature(
  p_share_id             text,
  p_signature_data_url   text,
  p_signed_by            text
) RETURNS jsonb AS $$
DECLARE
  v_owner_id     uuid;
  v_source_id    text;
  v_event_name   text;
  v_client_email text;
  v_owner_email  text;
BEGIN
  SELECT owner_id, source_id INTO v_owner_id, v_source_id
  FROM public_shares
  WHERE id = p_share_id
    AND kind = 'event'
    AND paused = false
    AND signed_at IS NULL
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('signed', false); -- yok, paused, veya zaten imzalanmış
  END IF;

  UPDATE events
    SET data = jsonb_set(
          data,
          '{signature}',
          jsonb_build_object(
            'dataUrl', p_signature_data_url,
            'signedBy', p_signed_by,
            'signedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        ),
        updated_at = now()
    WHERE id = v_source_id AND user_id = v_owner_id AND deleted_at IS NULL
    RETURNING data->>'name', data->>'clientEmail' INTO v_event_name, v_client_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('signed', false); -- event silinmiş/bulunamadı
  END IF;

  UPDATE public_shares
    SET signed_at = now(), signed_by = p_signed_by
    WHERE id = p_share_id;

  -- SECURITY DEFINER (postgres sahipli) → auth.users okunabilir; anon/authenticated
  -- bu fonksiyona hiç erişemiyor (aşağıdaki REVOKE), yalnız Edge Function (service_role) çağırır.
  SELECT email INTO v_owner_email FROM auth.users WHERE id = v_owner_id;

  RETURN jsonb_build_object(
    'signed', true,
    'eventName', COALESCE(v_event_name, 'Event'),
    'ownerEmail', v_owner_email,
    'clientEmail', v_client_email,
    'shareId', p_share_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION pcd_submit_event_signature(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pcd_submit_event_signature(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION pcd_submit_event_signature(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION pcd_submit_event_signature(text, text, text) TO service_role;

COMMIT;

-- ============================================================
-- DOĞRULAMA (BEGIN/COMMIT dışı):
--
-- 1. Dönüş tipi jsonb oldu mu:
--   SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname = 'pcd_submit_event_signature';
--   Beklenen: jsonb
--
-- 2. Anon hâlâ çağıramaz:
--   SELECT has_function_privilege('anon', 'pcd_submit_event_signature(text,text,text)', 'EXECUTE');
--   Beklenen: f
--
-- KOD AYAĞI:
--   - supabase/functions/submit-event-signature/index.ts (RPC dönüşünü okuyup Resend'e 2 mail atar — YENİDEN DEPLOY GEREK)
--   - app/js/tools/events.js (event.clientEmail alanı editöre eklendi)
--   - app/js/core/config.js (APP_VERSION → 2.44.134)
--
-- OPERATÖR KURULUMU (bu migration'dan bağımsız, ayrıca gerekli):
-- 1. Bu migration'ı Supabase Dashboard → SQL Editor'da çalıştır.
-- 2. resend.com'da hesap aç, bir API key oluştur.
-- 3. Supabase Dashboard → Edge Functions → submit-event-signature → Secrets
--    → RESEND_API_KEY = <key> ekle.
-- 4. Resend'de prochefdesk.com domaini doğrulanmadıysa e-posta YALNIZ
--    Resend hesabının kendi doğrulanmış adresine gider (sandbox limiti) —
--    gerçek müşteri/şef adreslerine gitmesi için Resend → Domains →
--    prochefdesk.com ekle + verilen DNS (SPF/DKIM) kayıtlarını domain
--    sağlayıcında (Cloudflare) ekle.
-- 5. supabase/functions/submit-event-signature'ı yeniden deploy et
--    (Dashboard'tan "Deploy new version" veya CLI:
--    `supabase functions deploy submit-event-signature`).
-- ============================================================
