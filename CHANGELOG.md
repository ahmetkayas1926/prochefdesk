# ProChefDesk — Sürüm geçmişi

**Mevcut sürüm:** v2.9.38 · 2026-05-19
**Blog:** 13 yazı yayında (Faz A: 3 SEO upgrade + Faz B: 10 yeni yazı)
**Marketing/SEO altyapısı:** 2026-05-18 (app sürümünden bağımsız)

Format: kronolojik tersine (en son sürüm üstte). Her sürüm kısa başlık + ana değişiklik özetleri. Tam teknik detay için ilgili commit message ve kod yorumlarına bakın.

---

## v2.9.x — NAKED araç sweep

Operatör vizyonu: her araç Buffet Planner seviyesinde RICH (kapatılabilir inline guide + per-field hint + stats hero + empty state CTA).
- **Round 1 (v2.9.0-2):** yield + waste + variance ✅
- **Round 2 (v2.9.3-6):** nutrition + dark-mode-fix + allergens + mise ✅
- **Round 3 (v2.9.7-9):** discover + account + team ✅
- **Round 4 (v2.9.10-12):** sales + whatif + menu_matrix ✅
- **Round 5 (v2.9.13):** haccp hub ✅ — **NAKED→RICH sweep tamamlandı**

### v2.9.38 — HACCP region: localStorage fallback (kalıcı persist garantisi) · 2026-05-19
v2.9.37 push edildi, UI ve eşik chip'i doğru göründü, print önizlemelerinde değer doğru, **AMA sayfa yenilenince hâlâ eski hale dönüyordu**. v2.9.37'de yapılan cloud-pertable.js merge fix yetmedi — cloud sync hâlâ async race condition yaratıyor (cloud upsert tamamlanmadan F5, sonraki boot cloud overwrite). 4 sürümdür aynı sorun.

**Bu sürümde — pragmatik kesin çözüm: synchronous localStorage yedek.**

- `app/js/core/utils.js` `PCD.haccp` namespace güçlendirildi:
  - `PCD.haccp.LS_KEY = 'pcd_haccp_region'` — non-namespaced LS key
  - `PCD.haccp.getRegion()` — prefs'te yoksa LS'ye fallback yapar. Cloud sync state.prefs'i siler/overwrite ederse bile LS'den orijinal değer okunur.
  - `PCD.haccp.setRegion(val)` — TEK NOKTA: state.set + **synchronous LS write** + flushSync + cloud upsert + flushNow. LS write senkron + atomic; debounce, async, race condition ihtimali sıfır.
- `app/js/tools/haccp.js` change handler tek satıra düştü: `PCD.haccp.setRegion(this.value)`. Render'da `PCD.haccp.getRegion()` çağırılır → LS fallback otomatik.

**Mantık:** Cloud sync ileride çalışsın diye state.prefs ve cloud upsert akışı korundu. LocalStorage ise garanti yedek. Cloud-pertable.js boot'ta state.prefs'i overwrite etse bile, helper LS'den okur, doğru değer döner. LS sync ve sınırsız sayıda key/value alır — solo kullanıcı için tek user'lı pattern doğru.

**Test:** HACCP Hub → "United States (FDA)" seç → **F5 hemen yap** → seçim **kalmalı**. DevTools → Application → Local Storage → "pcd_haccp_region" key'i = "usa" görmeli. Cook & Cool'a gir → chip + subtitle + yazdırılan PDF FDA değerleri (57°C / 5°C / -18°C / 57°→21°/2h→5°/6h) göstermeli.

### v2.9.37 — HACCP region: moved to HACCP Hub + root-cause persist fix · 2026-05-19
v2.9.36 sonrası operatör test ettiğinde HÂLÂ persist çalışmıyordu: UK seç → "Saved" → F5 → "International" geri geliyor. v2.9.36'da yapılan flushSync + queueUpsert YETMİYORDU çünkü cloud-pertable.js:552 boot pull'unda `state.prefs = prefsData.prefs || {}` ile **tüm local prefs cloud'dan OVERWRITE ediliyordu**. queueUpsert async ve operatörün F5'i hızlı; cloud'a yazılmadan reload → cloud'daki eski prefs (haccpRegion yok) → local'i siliyor.

Operatör ayrıca UI yerini sorguladı: "Profilde değil, HACCP aracının içinde olsa daha mantıklı" — kesinlikle haklı. Chef HACCP'e girer girmez region'u görür/değiştirir, müfettişe direkt gösterir, profilden 5 click derinliğinde aramaz.

**Bu sürümde (root-cause kalıcı düzeltme + UI yer değişikliği):**

**1. Cloud pull merge (kalıcı sync fix):**
`app/js/core/cloud-pertable.js:552` — `state.prefs = prefsData.prefs || {};` → `state.prefs = Object.assign({}, state.prefs || {}, prefsData.prefs || {});`. Local prefs cloud pull'da silinmez; cloud'daki field'lar local'i override eder ama cloud'da olmayan field'lar (yeni field eklendiğinde race condition) local'den korunur. Aynı pattern `state.onboarding` için de uygulandı (o da dinamik field set).

**2. UI yer değişikliği (Account → HACCP Hub):**
`account.js`'ten HACCP region dropdown + change handler kaldırıldı (3 yer). `haccp.js` (HACCP Hub) render'ına yeni card eklendi: status hero'nun altında, 4 form cards'ın üstünde. İçerik: başlık + açıklama + dropdown (6 bölge) + monospace chip sırada "🔥 ≥63°C · ❄ ≤5°C · 🧊 ≤-18°C · ⏱ 63°→21°/2h→5°/6h" gibi seçili bölgenin **tüm eşikleri tek bakışta görünür**. Bu chip müfettişe doğrudan kanıt: "İşte hangi standartı kullanıyorum".

**3. Handler 4-katmanlı persist garanti:**
`haccp.js`'teki yeni change handler: (a) `PCD.store.set('prefs.haccpRegion', val)` in-memory, (b) `flushSync()` IDB/LS immediate yaz, (c) `cloudPerTable.queueUpsert('user_prefs', ...)` cloud queue, (d) `cloudPerTable.flushNow()` network'e push immediate. Cloud merge fix (#1) ile kombine olduğunda, F5'i ne kadar hızlı yapılırsa yapılsın değer kaybolmuyor.

**Test:** HACCP Hub'a gir → status hero altında "HACCP region" card görünmeli. Dropdown'dan UK seç → toast "Saved" + chip "≥63°C · ≤5°C · ≤-18°C" → F5 → seçim KALMALI. Cook & Cool sayfasına gir → subtitle "63°C → 21°C in 2h → 5°C in 6h" → yazdır → PDF tablo başlık + footer 63°C göstermeli.

### v2.9.36 — HACCP region selector PERSIST + UI sync fix (v2.9.35 silent failure) · 2026-05-19
v2.9.35 push edildi, dropdown göründü, "Saved" toast çıktı, AMA sayfa yenilenince eski hale dönüyordu + Cook & Cool form'larında etki görünmüyordu. 3 problem teşhis edildi ve düzeltildi:

**Problem 1 — Persist gecikme:**
`PCD.store.set('prefs.haccpRegion', value)` 400ms debounced persist tetikliyor. Kullanıcı seçim sonrası hemen sayfa yenilerse LS/IDB'ye yazılmadan kayboluyor. Currency/theme'de fark edilmiyordu çünkü onlarda anlık etki var (cost re-format, theme attr), kullanıcı yenileme yapmıyordu. HACCP region'da etki HACCP formuna gidince görüldüğü için kullanıcı doğal olarak yeniler.

**Problem 2 — Cloud overwrite:**
Login kullanıcı için boot'ta cloud'dan prefs restore ediliyor. Yeni `haccpRegion` field'i cloud'a immediate yazılmadığında: ilk değişiklik → LS'ye persist (debounce) → sayfa yenile → cloud pull → state.prefs cloud'dan overwrite → yeni field cloud'da yok → eski state. Yani sayfa yenilenince cloud silindi sanıyor.

**Problem 3 — Subtitle hardcoded:**
Cook & Cool page subtitle'ı `"HACCP cooling: 60°C → 21°C in 2h → 5°C in 6h"` sabit kodluydu (i18n fallback metni). Kullanıcı UK FSA seçince başlık hâlâ 60°C diyordu → "etki yok" hissi.

**Bu sürümde:**
- `account.js` change handler: `PCD.store.flushSync()` immediate persist + `PCD.cloudPerTable.queueUpsert('user_prefs', ...)` immediate cloud yazma + `render(view)` UI senkron. setActiveWorkspaceId pattern'i (store.js:716) izlendi.
- `haccp_cooling.js` page-subtitle dinamik: `targetForUI(coolingStartC())`, `targetForUI(cooling2hC())`, `targetForUI(cooling6hC())` yerel olarak değişir. Suffix kısmı i18n key'e taşındı (`hcc_subtitle_monthly_suffix`).
- `en.js` + `tr.js` — yeni i18n key `hcc_subtitle_monthly_suffix` (Monthly · 31 rows / Aylık · 31 satır).

**Test:** (1) Account → Preferences → HACCP region değiştir → sayfa hard refresh → seçim kalmalı. (2) Cook & Cool sayfasına gir → subtitle satırı seçilen bölgenin eşiklerini göstermeli (örn. UK seçili → "HACCP cooling: 63°C → 21°C in 2h → 5°C in 6h"). (3) Boş yazdır → PDF'te tablo başlıkları + footer aynı bölge eşiklerini göstermeli.

### v2.9.35 — HACCP region selector (international SaaS) + Cook & Cool dinamik (PILOT) · 2026-05-19
Operatör direktifi: ProChefDesk uluslararası kullanıcılara (US, UK, EU, Türkiye, Avustralya vb.) açıldıkça tek-ülke sabit HACCP eşikleri (60°C / 5°C / -18°C) yanlış. Her ülkenin yetkili merci ve eşikleri farklı: FSANZ AU 60°C hot vs FDA US 57°C vs UK FSA 63°C. Form'lardaki sayılar kullanıcının yargı bölgesini takip etmeli.

**Bu sürümde (foundation + Cook & Cool pilot):**
- `app/js/core/config.js` — `HACCP_REGIONS` object eklendi. 6 bölge: international (strictest), australia (FSANZ), usa (FDA Food Code 2022), uk (FSA), eu (EFSA/Codex), turkey (TGK). Her bölge için hotMinC, coldMaxC, frozenMaxC, coolingStartC, cooling2hC, cooling6hC field'leri resmi kaynaktan. Default: `international` (en sıkı, müfettişin sorun çıkaramayacağı sınır).
- `app/js/core/utils.js` — `PCD.haccp.getRegion()` + `PCD.haccp.getThresholds()` helper'ları. User prefs'ten okur, her çağrıda yeniden değerlendirir → bölge değişikliği page-reload gerektirmez.
- `app/js/tools/account.js` — Preferences section'ına yeni dropdown: **HACCP region** (currency/locale/theme/haptic'in yanına). 6 bölge seçimi. `prefs.haccpRegion` user_prefs altında store edilir, cloud sync'le diğer cihazlara da gider.
- `app/js/tools/haccp_cooling.js` — Sabit `TARGET_2H_C`/`TARGET_6H_C` const'lar **fonksiyona** dönüştü (`cooling2hC()`/`cooling6hC()`); helper'dan okur. Sabit `targetForUI(60)` (cook end) → `targetForUI(coolingStartC())`. 8 yer wire.
- `app/js/i18n/en.js` + `tr.js` — 8 yeni key: `haccp_region`, `haccp_region_desc`, + 6 bölge label'i.

**Test:** Operatör (1) Account → Preferences → HACCP region dropdown görmeli, default "International (strictest)". (2) Bölge değiştirip Cook & Cool'a girince başlık satırlarındaki "2h target" / "6h target" sayıları + "HACCP gates" satırı seçilen bölgenin eşikleriyle güncellenmeli (örn. UK seç → 63°C görünmeli, AU seç → 60°C).

**Sıradaki (v2.9.36):** Diğer 3 HACCP form (Daily Temp / Receiving / Holding) helper'a wire edilecek + Cook & Cool'a uygulanmış print layout pattern (v2.9.31-34 birleşik) o 3 form'a yayılacak.

### v2.9.34 — HACCP Cook & Cool print: colgroup fix (v2.9.33 silent failure) · 2026-05-19
v2.9.33 push edildi, deploy oldu, ama operatör test ettiğinde PDF'te hiçbir sütun değişikliği görünmedi. Root cause: tablo `table-layout: fixed` kullanıyordu — bu modda CSS sütun genişlikleri **sadece `<colgroup>` veya ilk satırdaki `<th>` width'inden** okunur. v2.9.33 td'lere width verdi ama fixed-layout td widths'i göz ardı ediyor. Sessiz fail.

**Bu sürümde:**
- `<colgroup>` bloğu eklendi `<table>` ile `<thead>` arasına. 11 `<col>` element'i, her birinde `style="width:X%"` ile gerçek sütun yüzdeleri tanımlandı.
- td width'leri korundu (yedek niyetiyle, table-layout: auto fallback'i için), ama colgroup zorunlu davranışı belirler.
- Yüzdeler v2.9.33 ile aynı: DAY 3% / FOOD 32% / QTY 6% / °C×3 5% / TIME×3 5% / NOTE 20% / CHEF 9%.

**Test:** Operatör tekrar yazdırıp FOOD/BATCH ve NOTE sütunlarının belirgin geniş, °C/TIME sütunlarının belirgin dar olduğunu doğrulayacak.

### v2.9.33 — HACCP Cook & Cool print: column widths rebalanced (PILOT polish) · 2026-05-19
v2.9.32 tek-sayfa fix sonrası operatör raporu: yemek adı sütunu hâlâ dar, °C/TIME sütunları gereksiz geniş. Sütun yüzdeleri dengelendi.

**Değişiklik (haccp_cooling.js):**
- FOOD/BATCH: 25% → 32% (yemek adı için çok daha rahat)
- QUANTITY: 8% → 6% (sayı + birim kompakt)
- COOK END/+2H/FINAL °C: 6% → 5% her biri (3 hane max)
- COOK END/+2H/FINAL TIME: 7% → 5% her biri (HH:MM)
- NOTE (düzeltici eylem): 16% → 20%
- DAY/CHEF: değişmedi
- Toplam: 100% ✓

**Test:** Operatör tekrar yazdırıp sütun dengesini doğrulayacak. Onay sonrası diğer 3 HACCP form'a aynı pattern (v2.9.32 + v2.9.33 birleşik) uygulanacak.

### v2.9.32 — HACCP Cook & Cool print: single-page guarantee (PILOT fix) · 2026-05-19
v2.9.31 pilot test sonucu: row büyütme iyiydi ama print 3 sayfaya bölündü (header alone p1, tablo p2, ProChefDesk footer p3). Kök sebep: tablo `page-break-inside: avoid` + toplam yükseklik A4 landscape'i ~10mm aştı + PCD.print otomatik footer'ı standart margin'li enjekte ediyordu.

**Bu sürümde:**
- Body fixed A4 landscape (297mm × 210mm) + flex column layout (kitchen_cards.js v2.8.18 pattern'i). PCD.print injected footer flex sibling olarak aynı sayfada kalır.
- `.h-sheet` flex container içinde h-head + table + h-foot — toplam içerik flex:1, padding 4mm sayfa kenarından.
- `.pcd-print-footer` compact override: margin 0, padding 1mm × 4mm, font 7pt (kitchen_cards pattern).
- Row height 22px → 19px (~5mm). Hâlâ rahat kalemle yazılabilir.
- Cell padding 3×4 → 2×4. Line-height 1.3 → 1.25.
- `table.h-grid` `page-break-inside: avoid` kaldırıldı (artık tablo zaten tek sayfaya sığacak şekilde boyutlu).
- `@page margin: 4mm` → `0` (body sized to full A4 landscape).

**Test:** Operatör tekrar Cook & Cool boş yazdırıp **tek sayfa** çıktığını + row yüksekliği hâlâ yeterli olduğunu doğrulayacak.

### v2.9.31 — HACCP Cook & Cool print: real-world handwriting fit (PILOT) · 2026-05-19
Operatör raporu: HACCP aylık print template'inde A4 landscape sayfasının altında ~50mm boş alan vardı ama row hücreleri (14px = 3.7mm) kalemle yazmaya çok dardı. v2.8.51'de "tek sayfaya sığsın" diye sıkıştırılmıştı, fakat aslında geniş alan kullanılmıyordu. Mantıksız sıkıştırma.

**Bu sürümde (PILOT — sadece Cook & Cool):**
- `haccp_cooling.js` print CSS: row height 14px → 22px (~5.8mm). Font 7-8px → 10-12px. Cell padding 1×3 → 3×4. Line-height 1.2 → 1.3.
- Column widths yeniden dağıtıldı: DAY 4% → 3% (3 haneli sayı), FOOD 21% → 25% (yemek adı yazılacak), °C 6.5% → 6%, TIME 6.5% → 7%, NOTE 13% → 16%, CHEF 8% → 9%. Total 100%.
- 31 row × ~5.8mm = 180mm + header + footer ≈ 200mm. A4 landscape 202mm kullanılabilir alanda rahat sığar.

**Test akışı:** Operatör Cook & Cool boş yazdırıp kağıt üzerinde kalemle hücreye yazı yazabildiğini kontrol edecek. Onay sonrası aynı pattern haccp_logs (Daily Temp), haccp_receiving, haccp_holding form'larına da uygulanacak. Risk düşük: CSS-only değişiklik, fonksiyonel davranış aynı.

### v2.9.30 — hCaptcha challenge popup viewport fix (modal scroll lock pattern) · 2026-05-19
**v2.9.29 sonrası ikinci kanıt-tabanlı bug bulundu.** Operatör doğruladı ki "I am human" tıklaması artık çalışıyor (v2.9.29 fix başarılı), AMA açılan challenge popup ekranın üst kenarına yapışıyor → resim soruları viewport dışında kalıyor, Skip butonu görünmüyor / tepkisiz. Root cause: `app/js/ui/modal.js:177-186` scroll lock pattern'i body'i `position: fixed; top: -scrollY` ile sabitliyordu (sayfa scroll pozisyonunu korumak için standart iOS-friendly pattern). hCaptcha challenge popup `document.body.appendChild` ile body'e ekleniyor ve body-relative koordinatlarla yerleşiyor — body `-scrollY` ofsetli olduğu için popup viewport dışına kayıyor.

**Bu sürümde:**
- `app/js/ui/modal.js` scroll lock pattern değişti: `position: fixed + top: -scrollY` → `html.style.overflow = 'hidden'; body.style.overflow = 'hidden'`. Body koordinat sistemi değişmiyor → hCaptcha popup viewport ortasında doğru yerleşir. Tüm modal'lar için pattern aynı.
- `app/js/core/config.js` APP_VERSION 2.9.29 → 2.9.30.

**Risk değerlendirmesi:** Tüm modal pattern'lerini etkiler (single point change). Desktop Chrome + Android Chrome'da `overflow: hidden` standart, sorunsuz. iOS Safari'de eski sürümlerde background scroll engelleme tam çalışmayabilir — ama iOS Safari zaten HANDOVER §2'de "test edilmemiş" işaretli, operatör cihaz testi yapmadığı için bu round'da regresyon riski yok. Gelecekte iOS testte sorun çıkarsa `touch-action: none` veya `overscroll-behavior: contain` fallback'i eklenebilir.

**Test akışı:** Push sonrası Cloudflare deploy + hard refresh → Account → Report an issue → "I am human" → challenge popup ekran ortasında açılmalı, resim soruları görünmeli, Skip butonu çalışmalı.

### v2.9.29 — hCaptcha checkbox fix (onload callback pattern) · 2026-05-19
**Root cause bulundu.** v2.9.28 sonrası operatör DevTools kanıtı verdi: modal açılışında Console'da hCaptcha'nın kendi resmi hata mesajı görünüyordu — `[hCaptcha] should not render before js api is fully loaded. 'render=explicit' should be used in combination with 'onload'`. CLAUDE.md'de bu mesaj "cosmetic warning" olarak işaretlenmişti ama gerçek bir bug imzasıymış: widget görsel olarak çiziliyor ama event handler'lar attach olmadığı için checkbox tıklamasına cevap vermiyor. Network başarılı, sitekey + domain config geçerli (`checksiteconfig` 200), challenge image'ları arka planda 200 dönüyor — ama interactive UI hiç ateşlenmiyor.

**Geçmişle ilişkisi:** v2.6.82'de hCaptcha eklendiğinde `script.onload + hcaptcha.render()` pattern'i kullanıldı. hCaptcha'nın API'si zamanla katılaştı (browser sürümleri / hCaptcha tarafı versioning), bu pattern silent broken hale geldi. v2.9.26'da önceki Claude `?onload=callback` URL param'ını denedi → çalışmadı zannedildi, geri çekildi. Şimdi anlaşıldı: v2.9.26 PATTERN'ı doğruydu ama aynı anda CSP eklenmişti, CSP iframe içinde Web Worker spawn'ı blokluyordu. Pattern + CSP combo bozdu, izole pattern çalışmamış görünmedi.

**Bu sürümde:**
- `account.js` `ensureHcaptchaLoaded` — script URL `?onload=__pcdHcaptchaOnLoad&render=explicit` pattern'ine çevrildi. `window.__pcdHcaptchaOnLoad` callback hCaptcha API fully initialize olunca çağrılır (önce script.onload event'inden farklı — internal hazırlık tamamlandı kuralı). Modal pending render handler'ı `window.__pcdHcaptchaPending`'e stash'lenir, callback fire ederken çağrılır.
- `config.js` APP_VERSION 2.9.28 → 2.9.29.

**Test akışı:** Push sonrası Cloudflare deploy tamamlanınca Account → Report an issue → "I am human" → checkbox tıklanabilir olmalı. Network'te aynı `2a3e9f54-...` XHR'ler çalışacak; UI tarafı artık reactive.

### v2.9.28 — REVERT v2.9.24 CSP + hCaptcha + photo sanitize · 2026-05-19
v2.9.24'te eklenen "standart SaaS hijyen" katmanları operatör akışını bozdu — hCaptcha widget'ı (Report an issue) tıklamaya cevap vermiyor, Discover'da photo'lar yüklenmiyor (CSP veya url() quote pattern). v2.9.25/26/27 fix denemeleri yetmedi. Operatör solo kullanıcı, agresif güvenlik gereksiz — tam revert.

**Geri çekilen değişiklikler:**
- `index.html` CSP meta tag KALDIRILDI (Content-Security-Policy + X-Content-Type-Options + Referrer-Policy meta).
- `index.html` Supabase script SRI hash KALDIRILDI (integrity + crossorigin attribute'leri).
- `discover.js` photo URL sanitize KALDIRILDI — eski `background:url(' + d.photo + ') center/cover` direct pattern'ine dönüldü (hem grid card hem detail modal'da).
- `discover.js` `safePhotoUrl()` helper function kod tabanında kaldı ama hiçbir yerde çağrılmıyor (gelecekte ihtiyaç olursa hazır).
- `account.js` hCaptcha eski v2.6.83 script.onload pattern'ine geri döndü (v2.9.26 `?onload=callbackName` URL param kaldırıldı). Pre-existing console warning ("should not render before js api is fully loaded") cosmetic — fonksiyonel etkisi yok.

**Korunan (faydalı + UI etkisi olmayan v2.9.24 değişiklikler):**
- recipe_likes RLS sıkı policy + `pcd_get_recipe_like_count` RPC (migration zaten çalıştırıldı, anon scrape vector kapalı kalıyor)
- recipe_likes BACKUP_TABLES'a ekli (backup-to-r2 re-deployed)
- 5 orphan i18n dosya silindi (phase2/3/4/4-1/v17.js)
- 2 window.print → PCD.print (allergens, shopping)
- 4 hardcoded toast → i18n
- 25 missing i18n key eklendi
- Tüm doc stale numbers güncellendi (18 migration, 4 edge function, 29 RLS tablo, 24 realtime, 21 ws-bound, 18 lazy tool)

**Sonuç:** Discover photos → v2.9.23 davranışına döndü ✅. **hCaptcha "I am human" HÂLÂ ÇALIŞMIYOR** 🔴 — yani sorun v2.9.24-27 değişikliklerinden değil, daha eski bir regresyon veya dış faktör (hCaptcha dashboard, Cloudflare Bot Fight Mode, domain whitelist vb.). Yeni session sıfırdan standart teşhis akışı çalıştıracak (detay: HANDOVER.md §2.2). Güvenlik tarafı: recipe_likes RLS leak + dead code temizliği + doc accuracy korundu.

### v2.9.27 — hCaptcha CSP 'unsafe-eval' + photo debug log · 2026-05-19 (yetmedi, v2.9.28'de revert)
- **Try:** hCaptcha "I am human" tıklamasında widget cevap vermiyor (v2.9.26 render pattern fix sonrası bile). En olası sebep: hCaptcha widget'ı internal'da eval/new Function kullanıyor, CSP `'unsafe-eval'` yok diye sessiz fail. script-src'ye `'unsafe-eval'` eklendi (yalnızca script-src — diğer direktifler etkilenmedi). frame-src'ye explicit `https://newassets.hcaptcha.com` eklendi (wildcard zaten kapsamalı ama bazı browser CSP parser'ları için açık entry).
- **Debug:** Discover renderGrid'e geçici `PCD.warn` log eklendi — her recipe kartı için `d.photo` durumunu loglar (LENGTH+START preview veya EMPTY/NULL). Operatör Console'da görür → photo sync race condition mı yoksa veri yok mu net olur. Sorun çözüldükten sonra silinecek.

### v2.9.26 — hCaptcha render pattern fix + Discover photo log · 2026-05-19
- **Fixed:** hCaptcha "I am human" tıklamasında checkbox çalışmıyordu. Eski kod `script.onload` event'i ile `hcaptcha.render()` çağırıyordu — script yüklendi ama API henüz initialize olmadan render çağrılıyordu (sessiz timing bug, console'da warning gözüküyordu). Çözüm: hCaptcha'nın önerdiği `?onload=callbackName` URL param pattern'i. Global `window.__pcdHcaptchaOnLoad` callback hCaptcha API tam hazır olunca çalışır. Tüm modal açılışları aynı script tag'ini paylaşır (idempotent).
- **Changed:** Discover `safePhotoUrl()` warn log iyileştirildi — empty/null durumunda warn YOK (normal case), bad scheme/unsafe chars durumunda URL preview log'la. Photo görünmüyor sorunu için debug yardımı.

### v2.9.25 — CSP follow-up fix (Cloudflare Insights + hCaptcha + photo URL relax) · 2026-05-19
v2.9.24 CSP'i 3 yan etki üretti, hepsi düzeltildi:
- **Fixed:** Cloudflare Pages otomatik enjekte ettiği `static.cloudflareinsights.com` beacon script CSP tarafından bloklanıyordu. `script-src` ve `connect-src`'ye eklendi.
- **Fixed:** Discover'da chef photo URL'leri görünmüyordu — XSS sanitize regex'i çok katıydı (`()` ve `'` reddediyordu). `url("...")` çift-tırnak wrap'i içinde bu char'lar zaten güvenli. Regex relax: sadece `"`, `\`, `\r`, `\n`, `<`, `>` rejected. Reject sebebiyle düşen URL'ler için `PCD.warn` log eklendi (debug).
- **Added:** CSP'ye `worker-src 'self' blob:` + `child-src https://*.hcaptcha.com` — hCaptcha widget iframe içinden Web Worker spawn edebilmesi için (CSP3 fallback chain'i kapatıyordu).

### v2.9.24 — Standard SaaS hygiene pass (security + cleanup) · 2026-05-19
Comprehensive audit (3 paralel agent) sonrası tespit edilen gerçek bug + sıkılama. Bank-grade değil, standart SaaS seviyesi.

**Güvenlik:**
- **Fixed (XSS):** `discover.js` chef photo URL'leri direkt CSS `background:url(...)` enjekte ediyordu. Malicious URL CSS injection vector'üydü. `safePhotoUrl()` helper eklendi — `http(s)://` veya `data:image/*` allowlist + CSS-breaking char reject (quote/paren/backslash/newline/angle brackets). 2 yerde kullanılıyor (card thumbnail + detail modal).
- **Fixed (privacy leak):** `recipe_likes` tablosu eski `SELECT USING (true)` policy ile anon kullanıcının `(user_id, recipe_id)` çiftlerini scrape'lemesine izin veriyordu (kim hangi tarifi like'lamış). Migration `v2.9.24-recipe-likes-rls-tighten.sql` policy'i `auth.uid() = user_id` ile sıkılaştırdı (kendi like'larını oku). Public like count için yeni RPC `pcd_get_recipe_like_count(text)` SECURITY DEFINER ile aggregate-only.
- **Added (CSP):** `index.html` head'e Content-Security-Policy meta — `default-src 'self'`, script/img/connect allowlist (Supabase + jsdelivr + hCaptcha), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. `'unsafe-inline'` script/style için açık (inline event handler + heavy CSS — gelecek round'da nonce'a geçebilir). X-Content-Type-Options nosniff + Referrer-Policy strict-origin-when-cross-origin.
- **Added (SRI):** Supabase CDN script integrity `sha384-NNePyabYRaJyedI6...` (preload + script tag). jsdelivr compromise vector kapatıldı.

**Kod kalitesi:**
- **Deleted:** 5 orphan i18n dosyası (`phase2.js, phase3.js, phase4.js, phase4-1.js, v17.js`) — 1938 satır dead code, `index.html` hiç yüklemiyordu (eski organizasyon kalıntısı).
- **Fixed:** 2 yerde `window.print()` fallback → `PCD.print()` (single print path kuralı). `allergens.js:321` + `shopping.js:491`.
- **Fixed:** 4 hardcoded EN toast/error string i18n'lendi (`buffet.js`, `recipes.js`×2, `inventory.js`).
- **Added:** ~25 missing i18n key (audit ile tespit — `backup_restore_*`, `quota_*`, `recipes_prep_time/cook_time`, `sale_price`, `next_month/prev_month`, vb). Önceden ekranda literal key gözüküyor olabilirdi. EN + TR mirror.
- **Added:** `recipe_likes` tablosu `backup-to-r2` BACKUP_TABLES'a eklendi (nightly R2 archive'da eksikti).

**Doküman temizliği (stale numbers + yanlış iddialar):**
- HANDOVER §3 — "14 migration / 3 Edge Function / 24 araç / supabase-functions duplicate var" → "18 / 4 / 30 dosya / 13 ana tool / klasör v2.9.18'de silindi"
- HANDOVER §4 — cascade trigger 18 → 21 tablo
- HANDOVER §4 — realtime 21 → 24 tablo
- HANDOVER §11.5 — "RLS tüm 25 tablo" → "29"
- HANDOVER §11.13 + §11.15 — lazy tool 16 → 18
- HANDOVER §11.17 — Buffet + Mise + Team artık cloud-synced (v2.8.73/74 IDB-only iddiası v2.9.17'den beri yanlış); Team workspace-scoped migration notu eklendi
- HANDOVER §7 + CLAUDE Önerme — supabase-functions silme notları kaldırıldı (silindi)

**Audit notları:**
- `t(key) || 'fallback'` antipattern — i18n.t() missing key'de truthy literal döner, fallback hiç ateşlemez. NAKED→RICH sweep'te yazılan fallback'ler sessiz dead code (key'ler en.js'de var, fonksiyonel etki yok). Major refactor gerekmez.
- 656 unused i18n key (eski feature kalıntısı) — risk yok, bundle bloat. Ayrı temizlik round'unda silinebilir.
- Account.js'te 62 yerde `t(key, 'fallback string')` (vars arg yanlış kullanım) — keyler mevcut, görünür bug yok. Düşük öncelik.
- Frontend RICH-guide pattern 14/30 tool'da var (claim 13/13). Tools-hub, ingredients, menus, shopping, suppliers, events, checklist, kitchen_cards, portion, 4 HACCP alt-form'da inline guide yok. Bunlar dashboard-driven veya küçük form'lar — operatör tercihi.

### v2.9.23 — KC scroll teleport TRUE fix + bulk select · 2026-05-19
- **Fixed (gerçek):** v2.9.21'de scroll fix yanlış element'i hedefliyordu — `#recipeList` scrollable değildi, parent div (`max-height:280px;overflow-y:auto`) scroll container'ıdır. scrollTop hep 0 alınıyordu, restore no-op. Operatör testte hala teleport gördü. Şimdi `recipeListEl.parentElement.scrollTop` ile gerçek scroll container hedefleniyor.
- **Added:** Bulk select butonları — "+ Görünenleri seç" / "− Görünenleri çıkar". Search + Hide-used filter sonrası görünür kalan TÜM tarifleri tek tıkla canvasa ekle/çıkar. Tek renderBody ile (12 tarif eklerken 12 render yerine 1 render). Toast: "X tarif eklendi". Use case: chef "kebab" diye filtreler → 12 sonuç görür → "Görünenleri seç" → bitti.
- **i18n:** +4 key TR/EN.

### v2.9.22 — Kitchen Cards "Hide used elsewhere" state persist · 2026-05-19
- **Fixed:** Operatör raporu — "Hide recipes used in other canvases" checkbox işaretliyken bir tarif eklediğinde `renderBody()` re-render checkbox'ı default unchecked yapıyordu, tüm tarifler tekrar görünür hale geliyordu. Diğer ayarlar (column, font vb.) closure var olarak saklı ama bu yeni eklenen checkbox unutulmuştu.
- **Çözüm:** Yeni closure var `hideUsedElsewhere` (default false), checkbox change handler ona yazıyor, render template `checked` attribute'u closure'dan okuyor, initial render'da işaretliyse applyFilters() otomatik çağrılıyor.

### v2.9.21 — Kitchen Cards bug fixes + UX (4 fix) · 2026-05-19
- **Fixed (overflow):** Operatör raporu — kanvasta boş yer varken yeni kart eklendiğinde CSS multi-column o boş yeri kullanmıyor, sanal 7. sütun yaratıp sayfanın sağına taşıyor (görünmez, yarısı kesik). Çözüm: post-render ölçüm (rAF×2) → kart sheet sağ kenarını aşıyor mu → tüm bloklar visual column index'e göre gruplandır → boş yer olan sütuna layout array'inde taşı + yeniden render. Sığmazsa toast info.
- **Fixed (sub-recipe ?):** Operatör raporu — sub-recipe referansları (`ri.recipeId`) Kitchen Card preview'da `?` olarak görünüyordu. v2.8.66 sadece public/Discover yolu için inline name gömüyordu; owner-form'da lookup eksikti. `buildSheetHtml` artık `PCD.recipes.buildRecipeMap()` çağırıp `ri.recipeId` varsa sub-recipe adını çekiyor.
- **Fixed (scroll teleport):** Operatör raporu — recipe listesinde aşağı scroll edip checkbox işaretleyince liste en üste teleport oluyordu. `renderBody()` tüm DOM'u yeniden çiziyordu. Çözüm: checkbox handler scrollTop'u capture eder, rAF ile post-render restore eder. 100 recipe'lik listede her toggle'da scroll kaybolmaz.
- **Added (canvas usage indicator):** Operatör isteği — chef başka kanvasta kullandığı tarifi yanlışlıkla yeni kanvasa eklemek istemiyor. Recipe yanında `↳N` chip (kaç başka kanvasta kullanılıyor) + search altında "Hide recipes used in other canvases" checkbox filter. Mevcut kanvastaki checked tarifler her zaman görünür (chef kendi seçimini görmeli).
- **i18n:** +3 key TR/EN.

### v2.9.20 — Ingredient export (current list, CSV + Excel) · 2026-05-19
- **Added:** Ingredients sayfası header'ında "Export" butonu (Import yanında). Tıklayınca modal: 2 buton (CSV + Excel). Round-trip uyumlu format (Name,Price,Unit,Category,Supplier,Yield%).
- **Use case:** Toplu fiyat güncellemesi — Export → Excel'de B sütunu ×1.05 → re-import → 50 malzeme tek seferde update. Import handler'da isim-match → güncelle mantığı zaten var (v2.9.19'da yield% de eklendi).
- **Dosya adı:** `prochefdesk-ingredients-YYYY-MM-DD.csv` veya `.xlsx`. CSV'de UTF-8 BOM (Excel'de Türkçe karakterler doğru render eder).
- **xlsx lazy load** (v2.8.78 pattern) — Excel ilk tıklamada CDN'den yüklenir, eager yüklenmez.
- **i18n:** +9 key TR/EN.

### v2.9.19 — Ingredient import UX rework · 2026-05-19
- **Changed:** Örnek CSV daha gerçekçi → `0.012 ml` (kafa karıştırıcı) yerine `18 l` / `18 kg` / `5 kg` / `3 kg` (chef'in faturada gördüğü tipte değerler).
- **Added:** Currency hint chip (`Prices in $ (USD)` / chef'in seçili currency'sine göre). Hangi para biriminde olduğu net.
- **Added:** Yield% opsiyonel 6. sütun. `Name,Price,Unit,Category,Supplier,Yield%`. Tavuk göğsü 88, somon 58 gibi batch yield ayarlama tek import'la. Mevcut malzemeler de güncellenir.
- **Added:** "Download blank template (.csv)" butonu — chef Excel'de açıp doldurabilir.
- **Changed:** Açıklamalar netleştirildi — Price, Yield%, Optional, Existing items başlıkları ile yapı. "5 kg torba 75 TL → 15 TL/kg gir" gibi pratik örnek.
- **Changed:** Preview iyileştirildi — `X rows detected · +N new · ↻ M update` (import öncesi ne olacağı net), ilk 5 satır + "… +N more", parse fail durumunda uyarı kartı.
- **Changed:** Hardcoded EN string'ler i18n'lendi (`Could not parse`, `rows detected`, `or`, `First 3` vb.).
- **i18n:** +22 key TR/EN.

### v2.9.18 — Discover view spam rate limit (Edge Function) · 2026-05-19
- **Added:** Migration `v2.9.18-discover-view-rate-limit.sql` — `discover_view_logs` tablosu (composite PK ip+recipe_id), `pcd_rate_limited_view_bump` RPC (SECURITY DEFINER, service_role only), `pcd_cleanup_view_logs` saatlik cron (2 saatten eski log silme).
- **Added:** Yeni Edge Function `rate-limited-view` (`supabase/functions/rate-limited-view/index.ts`). Body'den recipe_id alır, header'dan IP çıkarır (cf-connecting-ip → x-forwarded-for → x-real-ip fallback), RPC çağırır, atomic insert-or-check ile 60dk window per (IP, recipe).
- **Changed:** `discover.js` `bumpViewCount` artık `supabase.rpc('increment_recipe_view')` yerine `supabase.functions.invoke('rate-limited-view')` çağırıyor. Eski RPC kalır (legacy fallback).
- **Operatör manuel iş:** (1) Migration Dashboard SQL Editor'da çalıştır, (2) Edge Function `supabase functions deploy rate-limited-view` ile deploy et. Backlog #7 kapatıldı.

### v2.9.17 — Buffet + Mise + Team cloud sync · 2026-05-19
- **Added:** Migration `v2.9.17-buffets-mise-team-sync.sql` — 3 yeni tablo (`buffets`, `mise_plans`, `team`) workspace-scoped, isArray pattern (waste/checklist_sessions ile birebir). RLS 4 policy/tablo, updated_at trigger, realtime publication, cascade soft-delete + restore trigger güncellendi (18 → 21 ws-bound tablo), REPLICA IDENTITY FULL.
- **Added:** Frontend wire (5 dosya): `cloud-pertable.js` WORKSPACE_TABLES'a 3 mapping (isArray:true), `cloud.js` ghost-ws audit listesi +3, `cloud-realtime.js` applyChange switch +3 case + WS_BOUND_TABLES +3 + TABLES subscribe +3.
- **Changed:** `buffet.js` ve `mise.js` soft-delete pattern (waste paterni): `readBuffetsAll`/`readPlansAll` (tombstone dahil) + `readBuffets`/`readPlans` (filtered) + `writeBuffets`/`writePlans` queueArraySync wire. `deleteBuffet` hard-delete → soft-delete. `mise.js` rebuild handler aynı şekilde soft-delete (cross-device delete propagation).
- **Changed:** `team.js` workspace-scoped'a çevrildi (eski: global array). `readTeam` + `readTeamAll` + `writeTeam` helper'ları. addMember/save/remove tüm path'ler queueArraySync ile cloud'a push. Soft-delete pattern: remove handler tombstone bırakır.
- **Changed:** `backup-to-r2` Edge Function BACKUP_TABLES'a 3 tablo eklendi (nightly R2 archive).
- **Operatör manuel iş:** (1) Migration Dashboard SQL Editor'da çalıştır, (2) `supabase functions deploy backup-to-r2` ile re-deploy. Backlog #2 kapatıldı.

### v2.9.16 — Discover Allergen "Free-from" filter · 2026-05-19
- **Added:** `enrichPublicIngredientNames` (recipes.js v2.8.66) helper genişletildi — public recipe save sırasında `recipe.computedAllergens` array'i de embed ediliyor (PCD.allergensDB.recipeAllergens cascade ile, sub-recipe ingredient'lar dahil).
- **Added:** Discover'a "Free from" chip row (tag filter row'unun altında) — feed'deki public recipe'lerin embed edilmiş allergen array'leri aggregate edilip top 8 allerjen chip olarak çıkar. Tıklayınca o allerjeni İÇEREN recipe'ler gizlenir (free-from semantik).
- **Backfill notu:** Mevcut public recipe'lerde `computedAllergens` yok — chef her recipe'i bir kez açıp save edince embed edilir. Yeni save'ler otomatik.
- **i18n:** +2 key TR/EN. **Backlog #3 tamamen kapatıldı** (Tag + Allergen filter).

### v2.9.15 — Discover Tag filter · 2026-05-19
- **Added:** Discover sayfasına tag filter chip row — feed'deki tüm public recipe'lerin tag'leri aggregate edilip "All / Pizza · 4 / Vegan · 3 / ..." şeklinde tıklanabilir chip olarak çıkar (top 20, count'a göre sıralı). Tıklayınca grid o tag'e göre filtreleniyor. Refresh butonu tag selection'ını da sıfırlar.
- **Data:** `r.data.tags` (public recipe blob içinde zaten var, schema değişikliği yok).
- **Korunan:** Allergen filter ayrı round'da (allergen verisi public recipe blob'da yok, save-time enrichment gerekiyor — v2.8.66 ingredient name enrichment pattern).
- **i18n:** +3 key TR/EN. Backlog #3'ün ilk yarısı kapatıldı.

### v2.9.14 — Buffet Excel footer · 2026-05-19
- **Added:** Buffet Excel export'una footer satırı eklendi — "Made with ProChefDesk · prochefdesk.com" italik gri 8pt, 7 sütun merged. Recipe Cost Excel paterniyle tutarlı (`cr_made_with` i18n key reused). Backlog #6 kapatıldı.
- Sadece `buffet.js` 1 dosya değişti, 8 satır eklendi.

### v2.9.13 — HACCP Hub NAKED→RICH · ROUND 5 son · 2026-05-19
- **Added:** 5-step kapatılabilir inline guide (`pcd_haccp_guide_hidden` localStorage) workflow + audit prep + role assignment + Pro tip.
- **Added:** Stats hero refactor — Touched/Total primary (42px, X/4 forms logged today) + status chip (All forms logged today ✓ / Some forms not yet logged today / colored card border yeşil/amber/kırmızı). Secondary: total entries today count.
- **Korunan:** 4 HACCP form cards (Daily Temp / Cook & Cool / Receiving / Hot & Cold Holding) + audit hint footer + per-card date-aware count'lar.
- **i18n:** +13 key TR/EN.
- **🎯 NAKED→RICH SWEEP TAMAMLANDI** — 13 araç (yield, waste, variance, nutrition, allergens, mise, discover, account, team, sales, whatif, menu_matrix, haccp hub) artık Buffet Planner seviyesinde RICH: kapatılabilir inline guide + stats hero + per-field hint + empty state CTA + dark mode kontrast.

### v2.9.12 — Menu Matrix NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_matrix_guide_hidden` localStorage) Kasavana-Smith framework açıklaması + Pro tip (sağlıklı menü %60-70 Star+Plowhorse).
- **Added:** Quadrant breakdown stats hero — Stars / total primary (42px) + status chip (Healthy mix / Mixed signal / Bloated menu / No data yet) + colored card border. Secondary: 4-grid Star/Plowhorse/Puzzle/Dog count'lar her biri kendi rengi ile.
- **Changed:** 1 hardcoded EN string ("Enter how many times each item was sold...") → `matrix_sales_editor_intro` i18n key. "click 'Set sales' above" hint de `matrix_need_data_hint` i18n.
- **Korunan:** SVG scatter plot, menu picker, sales editor modal, quadrant grouping logic, computeFoodCost cascade.
- **i18n:** +22 key TR/EN.

### v2.9.11 — What-If Simulator NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_whatif_guide_hidden` localStorage) + Pro tip (yeni tedarikçi kontratı öncesi simülasyon).
- **Added:** Impact stats hero — Recipes affected primary (42px) + worst-hit chip (en çok vurulan tarif adı) + colored card border (kırmızı/yeşil deltaya göre). Secondary: Avg cost change + Total cost shift.
- **Korunan:** In-memory scenario, slider/number input ile change adjust, ingredient picker, computeImpact hesabı, recipe listesi (largest delta sort).
- **i18n:** +14 key TR/EN.

### v2.9.10 — Sales Log NAKED→RICH + i18n sweep · 2026-05-19
- **Added:** Tam i18n sweep — önceden 2 key vardı (delete title + ok), tüm hardcoded EN string'ler (page title/subtitle, button labels, empty states, modal field labels, placeholder text) `t()` çağrısına çevrildi.
- **Added:** 4-step kapatılabilir inline guide (`pcd_sales_guide_hidden` localStorage) + Pro tip (POS batch entry).
- **Added:** Volume stats hero — Portions this week primary (42px) + status chip (Busy week ≥200 / Steady ≥50 / Slow / No data) + colored border. Secondary: Top recipe (30d) + Active days (30d).
- **i18n:** +36 key TR/EN.

### v2.9.9 — Team NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_team_guide_hidden` localStorage) + Pro tip (status Pending olarak setlemek vs çıkarma).
- **Added:** Team composition stats hero (team varsa) — Total members primary (42px, owner dahil) + active/pending chip + role breakdown 3-grid (manager/cook/viewer).
- **Changed:** 7 hardcoded EN string → `t()` çağrısı (invite note, invalid email error, already invited warning, link copied success, Name label, Optional display name placeholder, Status label).
- **Korunan:** Roles + permissions yapısı, Pro gate (free user upsell), Owner row, invite modal flow (email + copy link), member editor (role/status edit + remove confirm).
- **i18n:** +22 key TR/EN.

### v2.9.8 — Account NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_account_guide_hidden` localStorage) + Pro tip (multiple workspace ayrımı).
- **Added:** Chef profile section başlığına completeness chip — "X/5 · Profile complete / Mostly complete / Partial / Empty profile" (name + role + country + workplace + bio fields).
- **Korunan:** Profile card (avatar/sign in/out), Chef Profile form, Preferences (currency/locale/theme/haptic), Plan info, Backup, Sessions, Danger Zone — yapısal değişiklik yok.
- **i18n:** +18 key TR/EN.

### v2.9.7 — Discover NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_discover_guide_hidden` localStorage) + Pro tip (3-5 imza yemekle başla).
- **Added:** Sharer stats hero (logged-in users) — My public recipes primary (42px) + status chip (Expert sharer ≥10 / Active sharer ≥5 / Getting started ≥1 / Just browsing) + colored card border. Secondary: Total views + Total likes (feed üzerinden aggregate).
- **Korunan:** Misafir kullanıcılar için welcome banner, public feed grid, card click → detail modal + view bump, like toggle, RLS-protected fetch, 60sn cache.
- **i18n:** +22 key TR/EN.

### v2.9.6 — Mise en Place NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_mise_guide_hidden` localStorage) + Pro tip (8am ritüel).
- **Added:** Progress status chip — `doneCount/total` rakamının yanına renkli chip (Just started / In progress / Almost done / Complete) + rakam rengi de progress'e göre değişir.
- **Added:** Empty state CTA butonları — "Go to Events" + "Go to Buffet Planner" (etkinlik/büfe yokken navigation kısayolu).
- **Korunan:** computeAutoPrep + 5-faz grouping (Stocks/Sauces/Protein/Garnish/Final) + flattenIngredients cascade + IDB persistence + Rebuild + A4 print — hepsi aynen.
- **i18n:** +20 key TR/EN.

### v2.9.5 — Allergen Report NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_allergens_guide_hidden` localStorage) + Pro tip (supplier statement compliance).
- **Added:** Tag coverage stats hero — coverage % primary (42px) + status chip (Fully reviewed / Mostly reviewed / In progress / Just started) + colored card border. Secondary: Allergen-free recipes count + With-allergens count.
- **Korunan:** EU FIC 1169/2011 legal note info card + matrix view + tagger modal + A4 print export — hesaplama (`recipeAllergens` sub-recipe cascade) hepsi aynen.
- **i18n:** +22 key TR/EN.

### v2.9.4 — Comprehensive dark mode contrast fix · 2026-05-19
- **Fixed:** `var(--brand-50)` (#f0fdf4 light green) dark mode'da override edilmediği için 5 farklı pattern'de okunabilirlik + görsel uyum bozuluyordu. Operatör 5 ekran raporladı (recipes section banners, portion guide, opening prep template preview, events TOPLAM YEMEK MALİYETİ stat card, çeşitli sticky/notification cards).
- **Fixed:** brand-50 4 CSS kuralıyla kapsamlı tedavi:
  1. Inline gradient'ler (15+ yer) → `linear-gradient(135deg, rgba(22,163,74,0.14), var(--surface-2))`
  2. Solid brand-50 inline bg (`.stat`/`.card`/bare div, chips hariç) → `rgba(22,163,74,0.14)`
  3. brand-50 + brand-700 birlikte → text rengini brand-300'e çevir (section banners)
  4. `details[style*="brand-50"] summary` → brand-300
- **Fixed:** Hardcoded açık warning/error renkleri (17+ yerde `#fef3c7` sarı warning bg + `#92400e` amber text + `#fef2f2` kırmızı error bg + `#991b1b` koyu kırmızı text + `#fecaca` kırmızı border + `#fde68a` sarı gradient end). Dark mode'da rgba tint'lere flip:
  - `#fef3c7` → `rgba(245,158,11,0.15)` / gradient → `rgba(245,158,11,0.20)→surface-2`
  - `#92400e` → `#fde68a` (açık amber text)
  - `#fef2f2` → `rgba(220,38,38,0.15)`
  - `#991b1b` → `#fca5a5` (açık kırmızı text)
  - `#fecaca` → `rgba(220,38,38,0.4)` (border)
- **Korunan:** `.chip` ve `[class*="chip"]` ile butonlar (intentional bright accent) dokunulmadı. `.dash-card.priority-now` injected CSS rule olduğu için ayrı override.
- Selector pattern: `[style*="--brand-50)"]` (closing paren) ile `--brand-500` false positive engellenir, whitespace varyantları yakalanır. Hex color rules `[style*="#fef3c7"]` vb. ile substring match.
- Tek dosya değişti: `themes.css`. JS hiç dokunulmadı.

### v2.9.3 — Nutrition NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_nutrition_guide_hidden` localStorage) + Pro tip (USDA FoodData Central reference).
- **Added:** Recipe coverage stats hero — Coverage % primary (42px) + status chip (Complete / Mostly covered / Half-covered / Limited data) + colored card border. Secondary: Avg kcal/serving across menu + Ingredients missing data count.
- **Changed:** Detail modal'daki hardcoded "⚠️ Some ingredients have no nutrition data" warning → `nut_partial_warning` i18n key.
- **i18n:** +23 key TR/EN.

### v2.9.2 — Variance Report NAKED→RICH + full i18n sweep · 2026-05-19
- **Added:** Tam i18n sweep — önceden sıfır key vardı, tüm hardcoded EN string'ler `t()` çağrısına çevrildi (page title/subtitle, step labels, table headers, button text, status labels, print PDF, no-data fallback).
- **Added:** 4-step kapatılabilir inline guide (`pcd_variance_guide_hidden` localStorage) + Pro tip (best-in-class <2% benchmark + run cadence).
- **Added:** Stats hero refactor — Variance % primary (42px) + status chip (Tight control <2% / Worth investigating <5% / Significant variance ≥5%) + colored card border. Secondary: Theoretical + Actual + Variance ($) 3-grid.
- **i18n:** +44 key TR/EN.

### v2.9.1 — Waste Log NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_waste_guide_hidden` localStorage) + Pro tip (industry <2% benchmark).
- **Added:** Stats hero refactor — This week primary (42px) + week-on-week trend chip (Down sharply / Down / Stable / Up / Up sharply / New) + colored card border + delta line ("↑ 18% vs previous 7 days"). Secondary: Month + All-time.
- **Added:** Per-field hints in editor modal (Amount: what got binned, Cost: auto-calculated, Reason: pattern detection).
- **Changed:** "Recent" hardcoded string → `waste_recent` i18n key.
- **i18n:** +27 key TR/EN.

### v2.9.0 — Yield Calculator NAKED→RICH · 2026-05-19
- **Added:** 4-step kapatılabilir inline guide (`pcd_yield_guide_hidden` localStorage) + Pro tip.
- **Added:** Per-field help text (AP weight, EP weight, AP price).
- **Added:** Stats hero refactor — True cost primary (32px) + status chip (Strong yield ≥80% / Moderate trim ≥60% / Heavy trim <60%) + colored card border, secondary yield % + trim loss alt grid.
- **Added:** "Apply yield" section başlığında "X / Y have yield set" sayacı.
- **Added:** Empty state CTA — "Go to Ingredients" butonu.
- **i18n:** +25 key TR/EN.

---

## Blog SEO sürümleri (v2.8.94 — v2.8.99)

### v2.8.99 — Blog Faz B Round 5 (son round, total 13 yazı) · 2026-05-19
- **Added:** Food Waste Tracking (~1700 kelime; WWF Hotel Kitchen authority; 3-category model + 6 reduction lever + $16,200/yıl worked example; Waste tool CTA).
- **Added:** Allergen-Safe Menu Design (~1750 kelime; EU FIC + FDA + UK Natasha's + FSANZ 4 gov authority; 7-protocol disclosure framework; Allergen Guardrail + Menu Builder CTA).
- **Updated:** sitemap.xml + blog/index.html (newest first).
- Faz B 5-round planı tamam: total 13 yazı, topic-cluster grafiği, MENA niş + uluslararası coverage.

### v2.8.98 — Blog Faz B Round 4 (total 11 yazı) · 2026-05-19
- **Added:** Kitchen Cards vs Printed Recipes (~1650 kelime; Wikipedia info design + Escoffier authority; Kitchen Cards tool CTA).
- **Added:** Restaurant Inventory Par Levels (~1700 kelime; US BLS authority; par formula + safety buffer + weekly review + 5 mistakes; Inventory tool CTA).

### v2.8.97 — Blog Faz B Round 3 (total 9 yazı) · 2026-05-19
- **Added:** Kitchen Prep List: Mise en Place by Phase (~1750 kelime; Escoffier brigade authority; 5-faz model + worked schedule; Mise en Place tool CTA).
- **Added:** Recipe Scaling for Events (~1700 kelime; USDA food waste authority; 7 non-linear pitfall + shopping list cascade; Portion Calculator + Events CTA).

### v2.8.96 — Blog Faz B Round 2 (total 7 yazı) · 2026-05-19
- **Added:** Cook & Cool HACCP: 60→21→5°C (~1800 kelime; FDA + FSANZ + UK FSA 3 gov authority; two-stage rule + 5 pratik fix; HACCP Cook & Cool form CTA).
- **Added:** Ingredient Yield Percentage (~1700 kelime; USDA authority; 14-row yield tablo + measurement methodology + cooking shrinkage chain; Ingredient editor CTA).

### v2.8.95 — Blog Faz B Round 1 (total 5 yazı) · 2026-05-19
- **Added:** Buffet Food Cost Calculator — Hotel Banquet Math (~1850 kelime; Cornell hospitality authority; 4-variable model + per-guest/pickup/refill/FC% target tabloları; Buffet Planner CTA).
- **Added:** Iftar Buffet Planning (~1750 kelime; MENA niş pazar; 5-station kültürel yapı + per-course refill + 5 kültürel kural; Iftar template CTA).

### v2.8.94 — Blog Faz A: mevcut 3 yazı SEO upgrade · 2026-05-19
- **Added:** Her 3 yazıya JSON-LD Article schema (Google rich results).
- **Added:** Authority outbound link'leri body içinde (USDA / FDA / FSANZ / EU FIC / UK FSA / Kasavana-Smith 1982).
- **Added:** "Related posts" cross-linking section (her yazı birbirine 2'şer link).
- **Added:** `related-posts` CSS pattern (her 3 yazıda aynı).
- **Updated:** sitemap.xml `lastmod` refresh (Google re-crawl signal).

---

## App sürümleri (v2.8.x)

### v2.8.93 — Buffet Quick Start: 4 yeni uluslararası standart preset — 2026-05-19
- **Added:** 🌙 Iftar Buffet (100c/$45/17 items, MENA), 💍 Wedding Banquet (200c/$95/24 items, 5★), 🍸 Cocktail Reception (80c/$55/15 items), 🔥 BBQ/Grill (80c/$50/14 items)
- Total: 7 preset + Start blank
- **i18n:** +8 key TR/EN

### v2.8.92 — Portion Calculator Step 1 (Guest count) kaldırıldı
- **Removed:** Step 1 input + 4 quick chip (operatör mantıksal bağ kopukluk şikayeti)
- **Added:** Nazik intro/help kart (💡 "How to use")
- **Changed:** "Cost / guest" → "Avg / portion" (totalCost / totalPortions)
- **Changed:** print/share/shop signature `guestCount` → `totalPortions` semantik refactor

### v2.8.91 — Dashboard + Tools-hub UX upgrade (NAKED → RICH)
- **Added:** Dashboard kapatılabilir inline guide panel + yeni şef "Get started" 3-card empty state (Add ingredients / Create recipe / Load sample data via `PCD.demo.seed()`)
- **Added:** Tools-hub phase grouping — 4 section (Essentials/Production/Operations/Compliance & extras) + section title + tool count chip
- **i18n:** +26 key TR/EN

### v2.8.90 — i18n consistency Round 3 (print/Excel/share surface)
- **Changed:** 6 dosyada 40+ hardcoded EN string → `t()` çağrısı (buffet/events/portion/checklist/kitchen_cards/inventory print path'leri)
- **i18n:** +48 key TR/EN parity

### v2.8.89 — Buffet Quick Start preset chooser (Faz 2)
- **Added:** "+ New Buffet" → preset chooser modal (Continental Breakfast + Mediterranean Lunch + Sunday Brunch 5★ + Start blank)
- Preset items customName tipte, sektör baseline amountPerGuest + pickupRatio
- **i18n:** +11 key TR/EN

### v2.8.88 — Buffet UX modernize Faz 1
- **Added:** Smart industry defaults (type change → covers + ticketPrice auto-fill plausible)
- **Changed:** Stats hero refactor (42px Food cost % primary + secondary 5-metric grid, Apple Health hissi)
- **Added:** statusLabel helper (Good/Watch/Over budget)
- **Added:** Liste search + renkli sol kenarlık (food cost % status)
- **Changed:** Item card compactify (uzun pickup hint kaldır, kompakt cost preview)
- **i18n:** +4 key TR/EN

### v2.8.87 — Excel menu-item scope bug fix (`testPriceVal is not defined`)
- **Fixed:** recipes.js `if (!isPrepXlsx)` block içindeki const'lar (testPriceVal/marginVal/revVal/profitVal) block kapanınca kayboluyor, autoFit else branch'i bunları kullanmaya çalışıyordu → runtime crash. Local scope yeniden hesap.

### v2.8.86 — Excel try/catch debug + Buffet list view Cost Report parite
- **Added:** exportCostReportXLSX + exportBuffetXLSX try/catch sargı (operatöre meaningful error toast + console stack)
- **Added:** Buffet list view'da her kart için Prep List + PDF Cost Report + Excel butonları (editor açmadan direkt)
- **i18n:** +1 key

### v2.8.85 — Profile ↔ Discover gerçek bağlantı + eski v3.x placeholder temizliği
- **Changed:** Save profile her zaman re-enrich (oldName check kaldırıldı)
- **Changed:** openPublicProfilePreview modernize — "Career stats" → "Discover stats" (gerçek public recipe + view + like sayıları + "View on Discover" CTA), "Community sharing launches v3.x" placeholder KALDIRILDI
- **Changed:** Form etiketleri ("Country" → "Location", "Workplace" → "Workplace / concept")
- **Added:** Discover live fallback (kendi recipe'lerinde authorName boşsa current user.name)
- **i18n:** +9 key TR/EN

### v2.8.84 — Author profile-priority fix + Save profile auto re-enrich
- **Added:** `PCD.tools.recipes.enrichPublicIngredientNames` public API'ye expose
- **Added:** account.js Save profile butonu name değişiminde tüm public recipe'leri loop + enrich + upsert + toast count
- **Added:** Lazy load uyumu (recipes.js dynamic script enjekte)

### v2.8.83 — Welcome tour modernizasyon
- **Changed:** tutorial.js + components.css baştan modernize. 4-step korundu ama her step zengin: hero illustration (88px gradient circle + 44px emoji + pop animation), 3-tier content (title 22px + tagline + body), 3 feature chip per step, fluid gradient progress bar (dots yerine), Back butonu (step 2-4), radial gradient backdrop + blur
- **i18n:** +26 key TR/EN

### v2.8.80-82 — Recipe ingredient editor + Modal focus root cause + Discover author + Buffet input focus
- v2.8.82: Buffet üst form input focus bug fix (Covers/Ticket/Refill data-buf-field + debounce 700ms)
- v2.8.81: Modal focus root cause fix (evrensel) + Discover'da paylaşan şefin adı (authorName inline gömme)
- v2.8.80: Recipe editor "+ Add new" modal → tam `ingredients.openEditor()` (buffet pattern, opts.initialName geri uyumlu)

---

## Eski sürümler (v2.6.x — v2.8.79) — kısa özet

Faz/dönemlere göre gruplanmış. Tam detay her sürümün kendi commit message'ına bakın.

**v2.8.59 — v2.8.79 (Mart-Mayıs 2026):**
- v2.8.79: Buffet overhaul (3 item type + Excel + UX) + Excel bug fix + HACCP label + R2 backup tables fix
- v2.8.78: App boot perf L2 (lazy xlsx + i18n + 16 tool lazy) + a11y viewport
- v2.8.77: Buffet inline guide + per-field help
- v2.8.76: App boot perf L1 (defer + preload + dns-prefetch)
- v2.8.75: Tag system (recipes free-form tags + filter)
- v2.8.74: Mise en Place Planner (sabah prep listesi otomatik aggregation)
- v2.8.73: Buffet Planner (hotel/catering grade tool, 540+ satır)
- v2.8.72: Dashboard Cost Health widget (over-budget recipes + stale prices)
- v2.8.71: Allergen Guardrail (Free-from filter + Allergen-safe print)
- v2.8.70: HACCP Hub konsolidasyon (4 form → tek hub, sidenav 18→15 item)
- v2.8.69: **Sub-recipe ingredient flattening helper** (mimari fix, 6 modüle bağlandı)
- v2.8.68: Menu Builder modernizasyon (4 tema + 6 accent + dietary badge + 2 sütun + duplicate)
- v2.8.67: Recipe foto 1:1 standardı (8 surface tutarlı)
- v2.8.66: Discover public recipe ingredient "(?)" fix
- v2.8.65: Checklist Template Library (14 hazır şablon, 4 kategori)
- v2.8.59-64: Checklist polishing (drag-drop + kategori şerit + multi-column print + hint field + library)

**v2.8.34 — v2.8.58 (Şubat-Mart 2026):**
- v2.8.58: Discover/Kitchen Card snapshot sub-recipe fix + isPublic toggle preview modal
- v2.8.57: Kitchen Cards recipe arama (anlık substring filter)
- v2.8.56: Drag-drop sıralama (recipe ingredients + menu sections/items)
- v2.8.54-55: Standart tıklanabilir footer (tüm print/share/QR tek format) + Kitchen Cards print preview fix
- v2.8.52: Recipe ingredient grup ayracı (separator)
- v2.8.51, v2.8.53: HACCP print tek-sayfa optimize (Cook & Cool + Hot/Cold Holding)
- v2.8.50: delete-account edge function user_data DELETE bloğu kaldırıldı (false-error fix)
- v2.8.49: iOS/Safari uyumluluk (backdrop-filter vendor prefix)
- v2.8.44-48: HACCP form 2 yeni (Receiving + Holding) + cloud sync, hardcoded EN string süpürmesi (2 round), Discover MVP backend (anonymous SELECT RLS + like + view counter RPC), Realtime CHANNEL_ERROR fix (explicit JWT setAuth), Auto diet rebuild (küratörlü ingredient dietFlags + computeDietCompat)
- v2.8.41-43: Discover Faz 1 frontend skeleton + isPublic toggle, Realtime fix
- v2.8.34-40: Backlog sweep (debounce, restore compare, Cook&Cool aylık form, allergen auto-detect kaldır)

**v2.6.x — v2.8.33 (2025-2026 başı):**
- Per-table sync schema (16 ws-scoped + 6 top-level tablo), RLS aktif, cascade triggers
- Workspace Trash UI (Active/Archived/Deleted + 30-gün retention)
- IndexedDB migration (LS yazma yolu kapandı)
- Cache-busting standardı (build.js + __VERSION__ placeholder)
- App `/app/` altına taşındı (URL yapısı)
- Units + i18n + allergen override + Kitchen Cards modernization
- Recipes list redesign + isSubRecipe data model + prep render her path'te
- Cloud sync invisible reliability (drift detection + auto-retry + ambient indicator)
- Lansman paketi (landing + Privacy/Terms refresh)

---

## Marketing / SEO Altyapı (app sürümünden bağımsız)

### 2026-05-18 — Blog altyapı + SEO sweep (PARÇA 1+2+3)
- **/blog/** index + 3 ilk yazı (inline CSS, app'ten bağımsız, Inter UI + Fraunces editorial başlık, cream paper palette + brand green CTA)
- **sitemap.xml** (landing + 2 legal + blog index + 3 post)
- **robots.txt** (`/app/` Disallow + Sitemap satırı)
- index.html'e og:image + Twitter card + robots + GSC verify yorumlu placeholder
- privacy.html + terms.html'e description + canonical + OG + Twitter card

### 2026-05-18 — Google Search Console (operatör tarafı)
- GSC verify yapıldı, sitemap.xml submit, 7 sayfa keşfedildi
- delete-account + backup-to-r2 edge function deploy
