-- ============================================================
-- ProChefDesk v2.44.130 — Event proposal remote e-signature
-- ============================================================
-- ARKA PLAN:
-- Event proposal imzası şu ana kadar YALNIZ şefin kendi cihazında
-- (openSignaturePad, events.js) yakalanıyordu — müşteri tableti elden
-- almadan imza atamıyordu. Sektör standardı (HoneyBook/SignNow/CaterZen):
-- proposal linki müşteriye gider, müşteri kendi cihazından uzaktan
-- imzalar, imza otomatik şefe döner.
--
-- ÇÖZÜM: mevcut public_shares altyapısı (recipe/menu/kitchencard share
-- linkleri, v2.5.7/v2.6.39/v2.17) 'event' kind'i + yeni 'sign' share_mode
-- ile genişletilir. Anon kullanıcı asla events tablosuna doğrudan
-- yazmaz — rate-limited-view (v2.9.18) ile AYNI güvenlik deseni:
-- Edge Function → service_role-only SECURITY DEFINER RPC.
--
-- Event silinince ilgili public_shares satırı da silinir — bu DB
-- trigger'ı ile değil, uygulama kodunda yapılır (events.js delete akışı,
-- share.js'e eklenen deleteShareBySource ile) çünkü public_shares.source_id
-- kind'e göre farklı tablolara işaret eden generic bir text kolon —
-- repo'da buna FK/trigger emsali yok, uygulama-seviyesi temizlik mevcut
-- desenle tutarlı ve daha basit.
-- ============================================================

BEGIN;

-- ============ 1. share_mode 'sign' desteği ============
ALTER TABLE public_shares DROP CONSTRAINT IF EXISTS public_shares_mode_chk;
ALTER TABLE public_shares ADD CONSTRAINT public_shares_mode_chk
  CHECK (share_mode IN ('public', 'cost', 'sign'));

-- ============ 2. İmza durumu kolonları ============
ALTER TABLE public_shares ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public_shares ADD COLUMN IF NOT EXISTS signed_by text;

-- ============ 3. fetch_share_by_id — signed_at da dönsün ============
-- Public görüntüleme sayfası "zaten imzalandı" durumunu bilmeli (yeniden
-- imza atmayı engellemek için). Dönüş şeması değiştiği için DROP+CREATE.
DROP FUNCTION IF EXISTS fetch_share_by_id(text);

CREATE FUNCTION fetch_share_by_id(share_id text)
RETURNS TABLE(id text, kind text, payload jsonb, paused boolean, signed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.kind, s.payload, s.paused, s.signed_at
  FROM public_shares s
  WHERE s.id = share_id;
END;
$$;
GRANT EXECUTE ON FUNCTION fetch_share_by_id(text) TO anon, authenticated;

-- ============ 4. İmza submit RPC (service_role only) ============
-- rate-limited-view (v2.9.18) ile birebir aynı güvenlik deseni: anon asla
-- doğrudan çağıramaz, yalnız Edge Function (service_role context) çağırır.
-- Kontroller: share var mı / kind='event' mi / paused değil mi / daha önce
-- imzalanmamış mı (tek seferlik imza — race condition'a karşı de facto
-- koruma, iki eşzamanlı submit'ten yalnız ilki geçer).
CREATE OR REPLACE FUNCTION pcd_submit_event_signature(
  p_share_id             text,
  p_signature_data_url   text,
  p_signed_by            text
) RETURNS boolean AS $$
DECLARE
  v_owner_id   uuid;
  v_source_id  text;
BEGIN
  SELECT owner_id, source_id INTO v_owner_id, v_source_id
  FROM public_shares
  WHERE id = p_share_id
    AND kind = 'event'
    AND paused = false
    AND signed_at IS NULL
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN false; -- yok, paused, veya zaten imzalanmış
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
    WHERE id = v_source_id AND user_id = v_owner_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false; -- event silinmiş/bulunamadı — imza kaybolmasın diye share'i de imzalanmış işaretleme
  END IF;

  UPDATE public_shares
    SET signed_at = now(), signed_by = p_signed_by
    WHERE id = p_share_id;

  RETURN true;
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
-- 1. CHECK constraint genişledi mi:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'public_shares_mode_chk';
--   Beklenen: ... IN ('public','cost','sign')
--
-- 2. Yeni kolonlar:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'public_shares' AND column_name IN ('signed_at','signed_by');
--   Beklenen: 2 satır
--
-- 3. fetch_share_by_id yeni şema:
--   SELECT proname FROM pg_proc WHERE proname = 'fetch_share_by_id';
--   + SELECT * FROM fetch_share_by_id('<mevcut bir share id>'); → signed_at kolonu dönmeli (recipe/menu paylaşımlarında NULL)
--
-- 4. Anon submit RPC'yi çağıramaz:
--   SELECT has_function_privilege('anon', 'pcd_submit_event_signature(text,text,text)', 'EXECUTE');
--   Beklenen: f
--
-- KOD AYAĞI:
--   - supabase/functions/submit-event-signature/index.ts (YENİ, deploy gerek)
--   - app/js/core/share.js (snapshotEvent + createOrGetShareUrl 'event' kind + renderSharePage 'event' dalı + deleteShareBySource)
--   - app/js/tools/events.js (Send signing link UI + delete-cascade çağrısı)
--   - app/js/core/config.js (APP_VERSION → 2.44.130)
--
-- DEPLOY ADIMI (operatör):
-- 1. Bu migration'ı Supabase Dashboard → SQL Editor'da çalıştır
-- 2. supabase/functions/submit-event-signature'ı Supabase Dashboard'tan
--    "New Function" ile yükle (veya CLI: `supabase functions deploy submit-event-signature`)
-- 3. GitHub Desktop push (frontend wire)
-- ============================================================
