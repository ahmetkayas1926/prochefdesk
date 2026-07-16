-- ============================================================
-- ProChefDesk v2.44.146 — Müşteri imza linkinde imza GÖRSELİ
-- ============================================================
-- ARKA PLAN:
-- v2.44.130/134'te imza `events.data.signature.dataUrl`'e yazılıyordu ve
-- şefin uygulama-içi Proposal ekranı (eventProposalHtml) bunu zaten doğru
-- gösteriyordu. Ama müşterinin gördüğü genel link (?share=...) imza
-- ANINDA alınmış donuk `public_shares.payload` kopyasını okuyor
-- (renderSignatureView, events.js) — imza atıldıktan SONRA bu payload hiç
-- güncellenmediği için müşteri kendi imzasını, adını ve tarihini bir daha
-- asla göremiyor, yalnız düz "already signed" yazısı görüyor.
--
-- ÇÖZÜM: pcd_submit_event_signature RPC'si imza kaydedilirken
-- public_shares.payload'a da aynı signature bloğunu yazar — events.js
-- tarafında yeni sorgu/RPC gerekmez, mevcut `p.signature.dataUrl` kontrolü
-- artık dolu gelir.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION pcd_submit_event_signature(
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
  v_signed_at    text;
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

  v_signed_at := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  UPDATE events
    SET data = jsonb_set(
          data,
          '{signature}',
          jsonb_build_object(
            'dataUrl', p_signature_data_url,
            'signedBy', p_signed_by,
            'signedAt', v_signed_at
          )
        ),
        updated_at = now()
    WHERE id = v_source_id AND user_id = v_owner_id AND deleted_at IS NULL
    RETURNING data->>'name', data->>'clientEmail' INTO v_event_name, v_client_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('signed', false); -- event silinmiş/bulunamadı
  END IF;

  -- v2.44.146: signed_at/signed_by yanında payload'a da signature bloğunu
  -- yaz — müşteri linkine tekrar girdiğinde imza görseli/isim/tarih görünsün.
  UPDATE public_shares
    SET signed_at = now(),
        signed_by = p_signed_by,
        payload = jsonb_set(
          payload,
          '{signature}',
          jsonb_build_object(
            'dataUrl', p_signature_data_url,
            'signedBy', p_signed_by,
            'signedAt', v_signed_at
          )
        )
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
-- 1. Yeni bir event üzerinde uçtan uca imza testi:
--   - "Send signing link" ile link oluştur, incognito'da aç, imzala.
--   - İmzadan hemen sonra sayfa görseli+isim+tarih göstermeli (events.js tarafı).
--   - Linki tekrar aç (yeni sekme/refresh) → görsel/isim/tarih hâlâ görünmeli
--     (bu migration'ın asıl testi — payload artık kalıcı taşıyor).
--
-- 2. Var olan imzalı share'lerde (bu migration'dan ÖNCE imzalanmış):
--   payload.signature YOK olacak (migration geriye dönük yazmaz) — bu satırlar
--   için düz "already signed" metni görünmeye devam eder, hata vermez
--   (renderSignatureView zaten dataUrl yoksa metne düşer).
--
-- KOD AYAĞI:
--   - app/js/tools/events.js (renderSignatureView — imza görseli + isim + tarih + Print butonu)
--   - supabase/functions/submit-event-signature/index.ts (imza görseli e-postaya gömülür — YENİDEN DEPLOY GEREK)
--   - app/js/core/config.js (APP_VERSION → 2.44.146)
--
-- DEPLOY ADIMI (operatör):
-- 1. Bu migration'ı Supabase Dashboard → SQL Editor'da çalıştır.
-- 2. submit-event-signature Edge Function'ı yeniden deploy et (Dashboard → Edge Functions → Deploy new version).
-- 3. GitHub Desktop push (frontend wire).
-- ============================================================
