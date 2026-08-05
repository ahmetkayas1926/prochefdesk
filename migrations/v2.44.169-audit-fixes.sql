-- ============================================================================
-- ProChefDesk v2.44.169 — Altyapı denetimi düzeltmeleri (SQL ayağı)
-- ============================================================================
-- Bu dosya 2026-08-05 altyapı denetiminde CANLI olarak doğrulanmış üç sorunu
-- kapatır. Üçü de kod değil VERİTABANI kaynaklı: ilgili migration'lar repoda
-- vardı ama Supabase'de hiç çalıştırılmamıştı.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tamamını yapıştır → Run.
-- Idempotent — tekrar çalıştırmak güvenlidir. Hiçbir tablo DROP edilmez.
--
-- ----------------------------------------------------------------------------
-- 1) public_shares HERKESE AÇIK LİSTELENİYOR  (gizlilik — acil)
--    Bulgu: oturum açmamış bir ziyaretçi bile, yalnızca sitenin herkese açık
--    anon anahtarıyla `GET /rest/v1/public_shares?select=*` çağırıp TÜM
--    kullanıcıların paylaşım satırlarını dökebiliyordu — cost-share
--    payload'ları (malzeme maliyetleri, ciro, food cost %) dahil.
--    Kök neden: v2.5.7'deki `public_shares_read_by_id ... USING (true)`
--    politikası hâlâ ayaktaydı; onu düşüren v2.6.39 çalıştırılmamıştı.
--    Paylaşılan sayfalar bundan etkilenmez: viewer zaten SECURITY DEFINER
--    olan fetch_share_by_id() RPC'sini kullanıyor (share.js).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS public_shares_read_by_id ON public_shares;

DROP POLICY IF EXISTS public_shares_owner_select ON public_shares;
CREATE POLICY public_shares_owner_select
  ON public_shares
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- NOT: fetch_share_by_id() BİLEREK burada yeniden tanımlanmıyor.
-- Canlıdaki sürüm v2.44.130 ile 5 kolon döndürüyor (id, kind, payload, paused,
-- signed_at) — imza akışı signed_at'e bağlı. Bu dosyanın ilk halinde v2.6.39'un
-- 4 kolonlu tanımı vardı ve Postgres haklı olarak 42P13 ("cannot change return
-- type of existing function") ile reddetti. Fonksiyon SECURITY DEFINER olduğu
-- için RLS'ten etkilenmez; aşağıdaki politika değişikliği paylaşılan sayfaların
-- görüntülenmesini BOZMAZ. Fonksiyona dokunmuyoruz.
--
-- Yalnızca yetkinin yerinde olduğunu garantiye alıyoruz (idempotent):
GRANT EXECUTE ON FUNCTION fetch_share_by_id(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) WORKSPACE SİLME CASCADE'İ 7 TABLOYU ATLIYOR  (erişilemez veri)
--    Bulgu: workspace silindiğinde şu tabloların satırları deleted_at ALMIYOR
--    ve canlı kalıyordu: rosters, prep_sheets, haccp_receiving, haccp_holding,
--    buffets, whiteboards, sales_log (+ mise_plans, team).
--    30 gün sonra temizlik cron'u workspaces satırını silince bu satırlar
--    sahipsiz kalıyor ve bir daha HİÇ temizlenmiyor.
--    Kök neden: canlı trigger fonksiyonu v2.8.44 öncesi sürümde kalmış.
--    İki kez, iki ayrı test workspace'inde doğrulandı.
-- ----------------------------------------------------------------------------
--    NOT: gövde v2.44.67 migration'ından BİREBİR alınmıştır (trigger
--    workspace_tombstones üzerinde çalışır: NEW.workspace_id / OLD.workspace_id).
--    Kendi yeniden yazımım yerine doğrulanmış sürüm kullanıldı.
CREATE OR REPLACE FUNCTION cascade_soft_delete_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE ingredients          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE menus                SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE events               SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE suppliers            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE canvases             SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE shopping_lists       SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE checklist_templates  SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE inventory            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE waste                SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE checklist_sessions   SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE stock_count_history  SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_logs           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_units          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_readings       SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_cook_cool      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_receiving      SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE haccp_holding        SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE buffets              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE mise_plans           SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE team                 SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE whiteboards          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE rosters              SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE prep_sheets          SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;
  UPDATE sales_log            SET deleted_at = NEW.deleted_at WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  UPDATE workspaces SET deleted_at = NEW.deleted_at WHERE id = NEW.workspace_id AND user_id = NEW.user_id AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cascade_restore_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE ingredients          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE menus                SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE events               SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE suppliers            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE canvases             SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE shopping_lists       SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE checklist_templates  SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE inventory            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE waste                SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE checklist_sessions   SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE stock_count_history  SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_logs           SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_units          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_readings       SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_cook_cool      SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_receiving      SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE haccp_holding        SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE buffets              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE mise_plans           SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE team                 SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE whiteboards          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE rosters              SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE prep_sheets          SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;
  UPDATE sales_log            SET deleted_at = NULL WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  UPDATE workspaces SET deleted_at = NULL WHERE id = OLD.workspace_id AND user_id = OLD.user_id AND deleted_at = OLD.deleted_at;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3) 30-GÜNLÜK TEMİZLİK LİSTESİ EKSİK  (bloat)
--    pcd_cleanup_old_deleted 17 tabloda kalmıştı; 2. maddeyle birlikte artık
--    deleted_at alan tabloların hepsi temizlenmeli.
-- ----------------------------------------------------------------------------
-- Dönüş şeması canlıda farklıysa CREATE OR REPLACE 42P13 verir; önce düşür.
-- Cron yalnızca `SELECT public.pcd_cleanup_old_deleted();` çağırır, imza aynı kalıyor.
DROP FUNCTION IF EXISTS public.pcd_cleanup_old_deleted();

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
    'haccp_receiving', 'haccp_holding',
    'buffets', 'mise_plans', 'team', 'whiteboards',
    'rosters', 'prep_sheets', 'sales_log',
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

  DELETE FROM workspace_tombstones WHERE deleted_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  tbl := 'workspace_tombstones';
  removed := cnt;
  RETURN NEXT;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) MEVCUT SAHİPSİZ (ORPHAN) SATIRLARI TEMİZLE
--    2. maddedeki eski hatanın bıraktığı kalıntı: workspaces tablosunda
--    KARŞILIĞI OLMAYAN workspace_id'lere ait satırlar. Denetimde tek bir
--    workspace altında 384 canlı satır ölçüldü (sales_log 120,
--    haccp_readings 180, haccp_holding 36, …). Bunlara hiçbir cihazdan
--    erişilemiyor; yalnız yer kaplıyor ve yedeklerde taşınıyor.
--
--    ÖNCE SAY, SONRA SİL. Aşağıdaki SELECT'i çalıştır, sayıyı gör; sonra
--    DELETE bloğunu (yorumu kaldırarak) çalıştır.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pcd_count_orphan_rows();

CREATE OR REPLACE FUNCTION public.pcd_count_orphan_rows()
RETURNS TABLE(tbl text, orphan_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tbls text[] := ARRAY[
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
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    -- NOT: user_id eşleşmesi ZORUNLU. Yalnız id'ye bakan sürüm, workspaces
    -- satırı BAŞKA (veya NULL) bir user_id ile duran vakaları "sahipli" sayıp
    -- atlıyordu — denetim hesabındaki 386 satırlık vaka tam olarak buydu:
    -- çocuk satırlar kullanıcıya ait, parent satır ona ait değil → uygulamada
    -- workspace görünmüyor, veri erişilemez halde kalıyor.
    EXECUTE format(
      'SELECT count(*) FROM %I x WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = x.workspace_id AND w.user_id = x.user_id)',
      t
    ) INTO cnt;
    IF cnt > 0 THEN
      tbl := t;
      orphan_rows := cnt;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.pcd_delete_orphan_rows();

CREATE OR REPLACE FUNCTION public.pcd_delete_orphan_rows()
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
    'haccp_receiving', 'haccp_holding',
    'buffets', 'mise_plans', 'team', 'whiteboards',
    'rosters', 'prep_sheets', 'sales_log'
  ];
  t text;
  cnt bigint;
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format(
      'DELETE FROM %I x WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = x.workspace_id AND w.user_id = x.user_id)',
      t
    );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    IF cnt > 0 THEN
      tbl := t;
      removed := cnt;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) BAKIM FONKSİYONLARININ YETKİSİ — herkese açık BIRAKMA
--    Postgres yeni fonksiyonlara varsayılan olarak PUBLIC'e EXECUTE verir.
--    Bu fonksiyonlar SECURITY DEFINER (RLS'i baypas eder) olduğundan, yetki
--    kısıtlanmazsa oturum açmamış bir istemci bile `rpc('pcd_delete_orphan_rows')`
--    çağırıp TÜM kullanıcıların satırlarını silebilirdi. Canlıda doğrulandı:
--    anon istemci pcd_count_orphan_rows'u çağırabiliyordu.
--    Cron ve manuel bakım `postgres` rolüyle çalışır, REVOKE onları etkilemez.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pcd_count_orphan_rows()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pcd_delete_orphan_rows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pcd_cleanup_old_deleted() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- DOĞRULAMA (migration'dan SONRA, ayrı ayrı çalıştır)
--
-- 1) Paylaşım tablosu artık listelenemiyor mu?
--    Tarayıcıda (giriş yapmadan) şu adres BOŞ dizi dönmeli:
--    https://<proje>.supabase.co/rest/v1/public_shares?select=id&apikey=<anon>
--    → beklenen: []
--
-- 2) Cascade doğru mu? (bir test workspace'i silip bak)
--    SELECT pg_get_functiondef('cascade_soft_delete_workspace_data()'::regprocedure)
--      LIKE '%sales_log%';   -- true dönmeli
--
-- 3) Sahipsiz satırlar:
--    SELECT * FROM pcd_count_orphan_rows();          -- önce SAY
--    SELECT * FROM pcd_delete_orphan_rows();         -- sonra SİL
--    SELECT * FROM pcd_count_orphan_rows();          -- tekrar say → boş olmalı
-- ============================================================================
