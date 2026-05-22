# ProChefDesk — Claude Code rehberi

Bu dosya repo kökünde durur. Claude Code her session başında otomatik okur.

## Proje

ProChefDesk — profesyonel şef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya (Perth WA, aktif kullanıcı şef). Solo proje.
**Production:** `prochefdesk.com`, app `/app/` altında.

**Stack:** Vanilla JavaScript (no bundling, no service worker), IndexedDB ana storage, Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (auto-deploy on GitHub push), Cloudflare R2 (backups).

**Mevcut sürüm:** v2.15.5 (operatör v2.15.4'e kadar push etti + migration çalıştırıldı; v2.15.5 working tree'de). **v2.15.5:** Roster Excel = PDF ile aynı renkli görünüm (kendi xlsx-js-style worksheet'i; başlık bandı + departman bantları + renkli izin hücreleri). **Bu oturumda (v2.14.7 → v2.15.4):** **Roster (vardiya planı) aracı YENİ + büyük güncelleme** (personel×gün ızgara + şablon/serbest saat + **izin/durum kodları** OFF/AL/PH/SL/RDO/UNP renkli + **departman/grup bölümleri** tek sayfada + **profesyonel renkli print + üst başlık** + işçilik maliyeti göster/gizle + history/print/Excel/paylaş + **bulut sync**) + **menü alerjen mantığı düzeltildi** (kod = SADECE BİLGİ; yemek gizleyen filtre KALDIRILDI; tarif öğesinde alerjen OTOMATİK + manuel, recipe'e dokunmadan) + **para birimi kalıcılık fix** + tüm export `PCD.currencySymbol()` + **tedarikçi sipariş geçmişi** (History). Menü + roster canlı önizlemede uçtan uca test edildi. (Önceki v2.13.7-2.14.6: menü manuel harf kodları + fiyat stili, whiteboard mobil fix, tek Excel standardı, demo seed, Discover hesap-bazlı sayaç.) Detay: `CHANGELOG.md`.

**Blog:** 13 yazı yayında (Faz A: 3 SEO upgrade + Faz B: 10 yeni yazı). SEO standardı aşağıda `## Blog SEO standardı` bölümünde.

## Çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme. Yorgun veya kızgınsa tek net talimat ver.

**Push akışı:** GitHub Desktop GUI. Operatör Windows. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js` `APP_VERSION` satırı. `app/index.html`'e literal sürüm YAZMA — orada `__VERSION__` placeholder'ları var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Literal yazılırsa build fail eder.

## Master roadmap

**Tamamlanmış (yüksek seviye):**
- **v2.6.x — v2.8.79:** Altyapı (per-table sync + RLS + cascade triggers + cache-busting), büyük araçlar (Buffet Planner, HACCP Hub, Allergen Guardrail, Cost Health, Sub-recipe flatten helper), perf L1+L2.
- **v2.8.80 — v2.8.93:** UX hijyen (modal focus root cause, recipe editor birleştirme, welcome tour modernize, Profile↔Discover bağlantı), Excel bug fix, Buffet UX modernize + Quick Start (7 preset), Portion Calculator semantik refactor, Dashboard + Tools-hub upgrade.
- **v2.8.94 — v2.8.99:** Blog SEO — Faz A (3 yazı JSON-LD + authority + cross-link upgrade) + Faz B 5-round (10 yeni yazı, total 13 yayında).
- **v2.9.0 — v2.9.13:** NAKED→RICH sweep TAMAMLANDI. 5 round'da 13 araç buffet seviyesinde RICH: kapatılabilir inline guide + stats hero + per-field hint + empty state CTA + dark mode kapsamlı kontrast fix.
- **v2.9.14 — v2.9.42:** Cloud sync 3 yeni tablo (buffets, mise_plans, team) + Discover rate limit + hCaptcha v2.9.29-30 fix + Whiteboard MVP V1 (cells grid).
- **v2.10.0 — v2.10.4:** Whiteboard pro upgrade (typography + palette + cell types + drag-resize + 5+6 template + user templates) + Kitchen Cards border/weight ince ayar + listener bleed fix + segmented toggle active state + diet sistemi komple kaldırıldı.
- **v2.11.0 — v2.11.13:** Whiteboard full rewrite (Notion-style block composer + 8 block tipi + 3-col desktop UI + mobile bottom sheet + drag-reorder + A4/A3 print engine + page boundary overflow uyarısı) + Discover search (debounce 400ms) + Kitchen Cards print WYSIWYG fix + popup footer overlay fix (5 tool) + HACCP form typography uniformity + KV/Table inspector dikey layout + HACCP Fridge Log day-name + log selector mismatch + HACCP alt form Back → Hub güvenilir (ROUTE_PARENTS pattern) + Tags "+ Add" CTA.
- **v2.11.14 — v2.11.16:** Whiteboard 4 yeni mutfak block tipi (Step List / Allergen Strip / Doneness Ladder / Time Range) + Layout 6 kademe (1/5 + 1/6) + Size 6 kademe (XS + XXL) + FAQ 3 cevap faktüel düzeltme + **Mise en Place tool kaldırıldı** (UI sil, cloud schema koru — Diet flags pattern).
- **v2.12.0 — v2.13.6:** Checklist baştan (2 tür Control+Prep, modern UX + özelleştirilebilir print) + profil persist fix (auth merge + anında flush) + Privacy/Terms 6-dil + **Whiteboard WYSIWYG** (canvas=print tek render motoru, gerçek A4-px + transform:scale) + 6 template yenileme + print footer tek-sayfa + **Waste Log + Shopping List KALDIRILDI** (Mise pattern) + Portion'a birleştirilmiş malzeme görünümü (By recipe/category/supplier, Shopping consolidation taşındı) + "Sync now" kaldırıldı + Ctrl+wheel zoom hata filtresi. Kitchen section sidebar: 5 → 4 item (Waste gitti); Sourcing: Inventory + Suppliers (Shopping gitti).
- **v2.13.7 — v2.14.6:** Menü **manuel diyet+alerjen harf kodları** (küçük=diyet, BÜYÜK=içerir; `it.codes`, otomatik tahmin yok, lejant; emoji/sayı sistemi gitti) + **fiyat gösterim stili** (Cornell simgesiz: $24/24/gizli) + **Whiteboard mobil blok düzenleme fix** (bottom sheet daima canlı `#wbRoot`) + **tek profesyonel Excel standardı** (ortak `PCD.xlsx`: malzeme styled export + Excel template(Lists sayfası) + stok sayım Excel) + **demo seed genişletme** (3 recipe + Sunday Brunch büfe + tedarikçi kategori fix + envanter/event/büfe-cost bug fix) + **Discover "My public recipes" sayacı hesap-bazlı** (workspace değil, tüm ws) + es/fr/de/ar yeni anahtar + whiteboard template adı çevirileri.
- **v2.14.7 — v2.15.4:** **Para birimi kalıcılık fix** (account.js flush + user_prefs cloud push) + tüm export `PCD.currencySymbol()` + **tedarikçi sipariş geçmişi** (History, son-50) + **Roster (vardiya) aracı YENİ** (`roster.js` lazy, Kitchen) + **Roster bulut sync** (`rosters` MAP-tablo, 6 dosya + migration; cloud.js HIGH_EDIT per-record merge) + **menü alerjen mantığı düzeltildi** (kod = SADECE BİLGİ; gizleyen filtre KALDIRILDI — kavramsal yanlış + bug kaynağı; tarif öğesinde alerjen `recipeAllergens`'ten OTOMATİK + manuel `it.codes`, recipe'e dokunmadan; gösterim `displayCodeIds` = manuel ∪ otomatik) + **Roster büyük güncelleme** (izin/durum kodları OFF/AL/PH/SL/RDO/UNP renkli + departman/grup bölümleri + profesyonel renkli print + üst başlık `venue`; çıktı motoru `rosterMatrix`). Menü + roster canlı test edildi (yakalanan bug: groupedStaff `.group` vs gridHtml `.name`).

**Sıradaki:**
- **v2.15.3 deploy adımı (operatör):** `migrations/v2.15.3-rosters-cloud-sync.sql`'i Supabase SQL Editor'de çalıştır + `backup-to-r2` Edge Function re-deploy + push. Bunlar yapılmadan roster cloud sync ÇALIŞMAZ (tablo yok → push 400/404).
- iOS/Safari cross-browser test (operatör manuel)
- R2 foto bytes yedekleme (operatör deferred)
- Açık öneri: Whiteboard ek block tipleri (Recipe Card / Photo / QR / Bar Chart / Cost Snapshot...) — operatör isterse
- Küçük: Privacy/Terms + yeni eklenen menü kodu/Excel/whiteboard/**roster** çevirileri es/fr/de/ar (roster EN+TR dolu, diğer 4 dil EN fallback; hepsi baseline, native değil)
- Açık öneri: Büfe tarif kalemi "porsiyon/kişi" alanını UI'da netleştir (gram girince maliyet ~100× şişer — bugünkü tuzak; operatör şimdilik istemedi)

Her yeni tool/araç baseline: kapatılabilir inline guide + per-field hint + örnek placeholder + empty state onboarding (v2.8.77 buffet pattern). Dark mode kontrast otomatik (themes.css v2.9.4 universal rules).

## Backlog

Öncelik sırasıyla açık maddeler:

1. **iOS/Safari cross-browser test** — v2.8.49 kod tarama temiz. Manuel cihaz testi operatör tarafına bekliyor.
2. ~~**Buffet + Mise cloud sync**~~ ✅ **v2.9.17'de kapatıldı** (buffets + mise_plans + team).
3. ~~**Discover'a Tag + Allergen filter**~~ ✅ v2.9.15-16.
4. ~~**Categories functional**~~ ❌ Operatör v2.9.18'de listeden çıkardı.
5. ~~**`supabase-functions/` duplicate silme**~~ ✅ v2.9.18'de silindi.
6. ~~**Buffet Excel footer**~~ ✅ v2.9.14.
7. ~~**Discover view spam rate limit**~~ ✅ **v2.9.18'de kapatıldı** (Edge Function + saatlik cleanup cron).
8. **R2 foto bytes yedekleme** — operatör v2.9.18: "para ödeyeceksem şimdilik kalsın". Bekliyor.
9. ~~**App boot perf L3**~~ ❌ Operatör v2.9.18'de listeden çıkardı (yüksek risk).

## Güvenlik sınırları (onay zorunlu)

- DROP TABLE veya destructive SQL
- 50+ satır frontend değişikliği tek seferde
- Yeni dosya/modül ekleme
- Cron schedule veya RLS policy değişikliği
- Cross-device sync mantığı (cloud.js, cloud-pertable.js, cloud-realtime.js) değişikliği
- Edge Function deploy

## Çalışma kuralları

- **Bir hedef → en küçük adım.** Birden fazla iyileştirmeyi tek sürüme paketleme.
- **Bulk regex/script YOK.** Manuel dosya-by-dosya edit. Geçmişte 226+ syntax error + rollback bulk script'ten geldi.
- **Her edit'ten sonra `node -c` syntax check.**
- **Tahmin yürütme.** Frontend değiştirmeden önce gerçek dosyayı oku. Operatör bir sorunla geldiğinde önce DevTools console + kod ile mevcut durumu kontrol et, sonra çözüm üret. Genel cevap verme — nokta atışı teşhis yap.
- **Yeni özellik önermeden önce repo'da grep ile var mı kontrol et.** Memory'de "yapılmamış" notu olsa bile doğrula.
- **Operatöre teknik kod gösterilmez.** Diff blokları, syntax detayları kafa karıştırır. Değişikliğin ne olduğunu sade dille söyle, hangi dosyayı kopyalayacak ve ne riski var.

## Mimari gotcha'lar

Geçmişte bug üreten yerler, bilmeden dokunma:

**Cloud sync race condition.** UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada explicit `await PCD.cloudPerTable.flushNow()` olmalı**. Yoksa debounced sync tamamlanmadan reload tetiklenir → "verim kayboldu" raporu gelir.

**PCD.icon registry silent fallback.** `PCD.icon(name, size)` registry'de olmayan isim için **sessizce info ikonuna fallback** yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js` ile registry'de olduğunu doğrula.

**Per-table sync 3 yönlü.** Push (cloud-pertable.js, debounced, retry'lı), Pull (cloud.js, boot'ta tüm tablolar, drift detection v2.8.33), Realtime (cloud-realtime.js, WebSocket, v2.8.43 JWT setAuth fix + TOKEN_REFRESHED dinleyici). Sync bug'ında ÖNCE hangi yön sor.

**Print akışı tek nokta (v2.8.54-55).** Tüm yazdırma `PCD.print(html, title)` (utils.js) üzerinden. Footer otomatik enjekte edilir (standart tıklanabilir "Made with ProChefDesk · prochefdesk.com"); custom footer YAZMA, `.pcd-print-footer{display:none}` override KOYMA. Window genişliği 1200px (Kitchen Cards landscape A4 1122px'e sığsın).

**Modal focus (v2.8.81).** `PCD.modal.open()` açılışta body'deki ilk form field'ına (input/textarea/select) focus eder — header'daki "X" close butonuna DEĞİL. `modal.js:192` selector `bodyEl` ile restrict + button çıkarılmış. Özel field'a focus istersen modal açtıktan sonra setTimeout 300ms ile manuel `.focus()` çağır (recipe editor quick-add v2.8.6 pattern).

**Recipe ingredient separator (v2.8.52).** `data.ingredients` array'inde yeni satır tipi: `{ separator: true, label?: '' }`. Hesap path'leri (cost/diet/allergen/variance) `if (ri.separator) return;` skip etmeli. Display path'leri (editor/preview/kitchen card/share/PDF/discover) render etmeli. `dashboard.resolveRow` separator için `{ found: false, isSeparator: true }` döndürüyor.

**RLS tüm 25 tabloda aktif** (18 workspace-scoped + 7 top-level — v2.8.44 haccp_receiving/holding + v2.8.46 recipe_likes son eklenenler). Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy şart:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye davranışı.** Misafir (login yok): sadece IDB, cloud yazma KAPALI, demo seed yüklenir. Üye (login var): IDB + cloud çift yönlü. Yeni feature'da misafir için cloud push tetiklenmemeli.

**Root dosyalar (landing, privacy, terms, blog/) app'ten BAĞIMSIZ.** Hepsi kendi inline CSS'i ile çalışır. App CSS değişiklikleri bu dosyaları etkilemez, tersi de. Blog yazıları her biri standalone HTML (Inter + Fraunces, cream paper palette, brand green CTA).

**Sub-recipe ingredient flattening (v2.8.69).** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) recipe'in tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip). Her flattened item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. Bağlı modüller: portion.js (canvas + print + share + **birleştirilmiş malzeme görünümü** — v2.13.2'de Shopping'den taşındı: consolidate + category/supplier group), nutrition.js, allergens-db.js `recipeAllergens`, dashboard.js `computeDietCompat`. (shopping.js v2.13.1'de kaldırıldı.) Yeni "tarif → ingredient listesi" ihtiyacında bu helper'ı kullan. Variance.js zaten kendi recursion'una sahip, dokunma.

**Lazy tool loading (v2.8.78).** Router'da 17 tool dinamik script tag ile lazy yüklenir (waste + shopping v2.13.1'de kaldırıldı; roster v2.15.1'de eklendi). Eager kalanlar: **dashboard** (default home), **account** (auth flow), **inventory** (dashboard low-stock alert sync). `PCD.router.go(name)` lazy route varsa loading state → script load → routes[name] wire → render. Yeni tool eklerken: (a) eager mi lazy mi karar ver (default lazy), (b) `router.registerLazy(name, scriptPath, toolName)` ekle, (c) dashboard click handler kullanılıyorsa `_afterToolLoad(toolName, cb)` poll pattern'i (120ms × 3sn).

**xlsx + i18n lazy load (v2.8.78).** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) CDN'den ilk tıklamada yüklenir. `i18n.js` `setLocale()` async — sadece `en.js` boot'ta baseline; TR/ES/FR/DE/AR dinamik fetch. **API gotcha:** `PCD.toast.info()` return value pattern'i güvenli değil — v2.8.79'da "loading-toast remove" pattern kaldırıldı.

**Buffet item 3 tipte (v2.8.79).** `buffet.js` item'da `recipeId` / `ingredientId` / `customName` ayrımı: (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → cost=0. `computeItemCost` 3 path'e split, print/Excel üçünü de handle eder. Yeni computation eklerken her 3 path'i değerlendirme zorunlu.

**HACCP Hub konsolidasyon (v2.8.70).** 4 HACCP form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında landing widget ile yaşar. Mevcut 4 route DOKUNULMADI — bookmark + direct link korunur. Sidenav 18→15 item.

**Buffet + Mise + Team cloud sync (v2.9.17).** `buffets`, `mise_plans`, `team` tabloları artık waste/checklist_sessions array pattern'i ile cloud-synced. Soft-delete tombstone (`_deletedAt`), `queueArraySync` ile push, realtime aktif. Eski "IDB-only" notu STALE — silindi. Yeni array tablo eklerken: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES'a ekle.

**Roster cloud sync = MAP-tablo pattern (v2.15.3).** `rosters` array DEĞİL, `stock_count_history`/`haccp_*` ile aynı MAP-yapılı ws-scoped tablo (`{wsId:{rosterId:obj}}`). `upsertInTable`/`deleteFromTable` ile yazılır (generic store API, `updatedAt` otomatik damgalanır). **Yeni MAP tablo eklerken 6 nokta birlikte (sıra önemli):** (1) store.js — state init + `_stateKeyToSqlTable` + ws-table listeleri (5 yer); (2) cloud-pertable.js — WORKSPACE_TABLES (isArray YOK) + pullAll fetch dizisi + destructure (**fetch sırası ↔ destructure sırası UYUMU şart**, yoksa pull bozulur) + `packByWs` + wipeAllUserData + queueFullState; (3) cloud-realtime.js — applyChange `applyToWsTable` + TABLES + WS_BOUND_TABLES; (4) cloud.js — `HIGH_EDIT_WS_TABLES` (user-edited + updatedAt'li → per-record en-yeni-kazanır; `REMOTE_WINS` DEĞİL) + drift wsTables + ghost-ws check + cascade wsTables; (5) backup-to-r2 BACKUP_TABLES; (6) migration (tablo + RLS 4 policy + realtime publication + cascade trigger CREATE OR REPLACE + REPLICA IDENTITY FULL). Operatör migration'ı Supabase'de çalıştırmalı + backup-to-r2 re-deploy.

**❌ CSP yok (v2.9.28'de REVERT).** `index.html`'de Content-Security-Policy meta TAG YOK. v2.9.24'te eklenmişti ama hCaptcha widget'ı tıklamaya cevap vermiyordu + Discover photo'lar yüklenmiyordu. v2.9.25-27 arası fix denemeleri (Cloudflare Insights ekleme, unsafe-eval, worker-src vb.) yetmedi → tam revert. Operatör solo kullanıcı, CSP eklemeden önce uçtan-uca test gerek.
**Tekrar denenirse:** Önce minimal CSP `default-src 'self'; script-src * 'unsafe-inline' 'unsafe-eval'; ...` ile başla, sonra her tightening adımında hCaptcha + Discover photo test et.

**❌ Discover photo sanitize yok (v2.9.28'de REVERT).** `discover.js`'de `safePhotoUrl()` helper kod tabanında duruyor ama HİÇ ÇAĞRILMIYOR. Photo URL'leri direkt CSS `background:url(' + d.photo + ')` pattern'i ile enjekte ediliyor (v2.9.23 behavior). XSS risk teorik + operatör scale'inde ihmal edilebilir. Gerekirse `safePhotoUrl(d.photo)` ile sarmak yeter — sade halde URL'leri olduğu gibi pass eder.

**recipe_likes RLS sıkı (v2.9.24, KORUNDU).** Anon scrape vector kapatıldı — `recipe_likes` SELECT artık sadece kendi like'larını okutur (`auth.uid() = user_id`). Public like count gerekirse `pcd_get_recipe_like_count(text)` RPC kullan (SECURITY DEFINER, aggregate-only, anon+authenticated EXECUTE). Recipes.like_count denormalized kolon zaten public, çoğu UI'da o kullanılıyor.

**✅ hCaptcha "I am human" widget interaction ÇALIŞIYOR (v2.9.29).** Console'daki `[hCaptcha] should not render before js api is fully loaded. 'render=explicit' should be used in combination with 'onload'` mesajı önceki Claude'lar tarafından "cosmetic" olarak yanlış not edilmişti — aslında gerçek bir error imzasıymış. v2.6.82'den beri `script.onload` pattern silent broken — widget çiziliyor ama event handler attach olmuyor. v2.9.29 fix: `account.js` `?onload=__pcdHcaptchaOnLoad&render=explicit` URL param + `window.__pcdHcaptchaOnLoad` callback. **Yeni Claude bu pattern'i bozma** — hCaptcha'nın resmi tavsiyesi, kanıt-tabanlı çözüm.

**✅ hCaptcha challenge popup viewport ÇALIŞIYOR (v2.9.30, operatör doğruladı 2026-05-19).** v2.9.29 sonrası challenge popup ekranın üst kenarına yapışıyordu (resim soruları viewport dışında, Skip tepkisiz). Root cause: `modal.js` scroll lock body'i `position:fixed; top:-scrollY` ile sabitliyordu → hCaptcha popup body-relative pozisyonla yerleşince ofsetli kaydı. v2.9.30 fix: scroll lock pattern `html/body { overflow: hidden }`'a geçti. **YENİ CLAUDE BU PATTERN'I BOZMA:** Modal scroll lock'unu `position:fixed`, `transform`, `top:-scrollY` gibi body koordinat sistemini değiştiren yöntemlere geri çevirme — hCaptcha/Stripe/Google Maps gibi body'e popup ekleyen tüm 3rd-party widget'lar bozulur. Sadece `overflow:hidden` ile durdur. v2.9.29 onload pattern + v2.9.30 scroll lock pattern birlikte report-an-issue formunu uçtan uca açıyor; ikisinden birini bozarsan akış tekrar kırılır.

**Discover view count rate limit (v2.9.18).** `recipes.view_count` artık doğrudan RPC ile incremenetlenmez. `rate-limited-view` Edge Function üzerinden gider — header'dan IP çıkarır, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC çağırır, atomic insert-or-check ile 60dk window per (IP, recipe). `discover_view_logs` tablosu + saatlik `pcd-cleanup-view-logs` cron eski log'ları siler. Spam protection.

**Photo storage flow.** Recipe photo upload `photoStorage.upload(dataUrl)` → WebP re-encode @ 0.82 → Supabase Storage `recipe-photos/{userId}/{ts}-{rand}.webp` → public URL döner → `data.photo` set. Eski recipe'lerde data URL kalabilir (`data:image/...;base64,...`) — `migrateDataUrlPhotos()` housekeeping (üye boot'unda otomatik tetiklenir). **Race:** Photo upload promise async, save click submission o anda data.photo eski olabilir → cloud sync photo'suz gider. Operatör Discover'da photo görünmüyor raporlarsa: recipe'i editör'de aç → Save → 5sn bekle → Discover Refresh.

**Waste Log + Shopping List araçları KALDIRILDI (v2.13.1, Mise pattern).** UI/buton/i18n silindi; `waste` + `shopping_lists` cloud şeması (store.js array tablo + cloud-pertable + cloud-realtime + cloud.js + R2 backup + account trash + EXPECTED listesi + Supabase tablo + RLS) DOKUNULMADI — veri kaybı sıfır, geri eklenirse veri orada. `trash_section_shopping` i18n korundu (trash UI kullanıyor). `waste.js`/`shopping.js` dosyaları yok. Events "alışveriş listesi üret" + Portion "send to shopping" butonları da silindi.

**Whiteboard tek render motoru = WYSIWYG (v2.13.0).** Canvas önizleme ve print AYNI `renderBlockContent(block)` + `blockBoxStyle(block)` fonksiyonlarını kullanır (whiteboard.js). Canvas gerçek A4/A3 px boyutunda (mm × 96/25.4) + `transform:scale` ile pane'e sığar (görsel küçük, ölçü gerçek); print aynı px içeriği mm `@page`'de basar (96dpi → 1px=1/96in). Print base tipografi `body{font-size:15px;line-height:1.5}` (canvas `#wbRoot` ile aynı), table cell line-height 1.5. **Bu iki motoru AYIRMA** (pt/mm'e dönme) — önizleme≠çıktı geri gelir. Print body `display:flex;flex-direction:column` + `.wb-print-sheet{flex:1}` → PCD.print footer'ı tek sayfada tutar; sheet'i sabit `pageH mm` YAPMA (footer 2. sayfaya taşar). `.wb-canvas-viewport{min-width:0}` + workspace grid `minmax(0,1fr)` ŞART (yoksa gerçek-A4 canvas mobilde yatay taşar).

**Whiteboard canvas ölçek + zoom (v2.13.6).** `applyCanvasScale()` ilk yüklemede pane layout almadıysa (clientWidth=0) self-retry yapar (rAF, bounded 60; canvas DOM'dan kalkınca durur). ResizeObserver SADECE sonraki resize/zoom için (ilk callback'i bazı tarayıcılarda güvenilmez). **app.js global error handler'da mesajında "ResizeObserver" geçen hatalar filtreli** (toast + cloud rapor yok) — Ctrl+wheel zoom'un benign "loop limit exceeded" spam'ini engeller. Bu filtreyi kaldırma.

**Profil/user kaydı flush ŞART (v2.13.4).** `store.set('user', u)` 400ms debounce'lu persist eder; profil kaydından SONRA `PCD.store.flush()` çağır (account.js, save + preview handler) — yoksa kaydet→kapat/yenile/arka plan (özellikle mobil) race'inde veri kaybolur. Ayrıca auth `_setUser` (v2.12.1) aynı hesapta MERGE eder (role/country/workplace/bio her session restore'da korunur) — bunu overwrite'a çevirme.

**i18n `t()` 2 parametre alır: `t(key, vars)`.** `t(key, 'fallback string', {params})` ÇALIŞMAZ — 3. arg yok sayılır, fallback string `vars` sanılır → interpolation bozulur, `{x}` literal kalır. Doğru: `t(key, { n: 5 })`. Eksik anahtar otomatik `bundles.en[key]`'e düşer (kod-içi fallback string'e DEĞİL) — yani anahtar en.js'de varsa fallback string gereksiz. (v2.13.5'te force_resync `{r}/{i}` bu yüzden literal çıkıyordu.)

**Menü diyet/alerjen harf kodları (v2.14.1, v2.15.4'te düzeltildi).** `menus.js` `MENU_CODES` registry: küçük harf = diyet/uygunluk (v/vg/gf/gfo/df/dfo/nf/h), BÜYÜK = "içerir" alerjen (N/G/D/E/F/SF/S/SE). **Kodlar SADECE BİLGİ amaçlı — uyarı/yasak/FİLTRE DEĞİL.** Gösterim = manuel ∪ otomatik (`displayCodeIds(it)`): (a) **manuel** `it.codes` (menü öğesi seviyesi, `PCD.picker`); (b) recipe öğesinde **OTOMATİK** alerjenler `autoAllergenCodeIds(it)` → `PCD.allergensDB.recipeAllergens` (malzeme alerjen tag'lerinden; isimden tahmin değil) → `ALLERGEN_KEY_TO_CODE` ile menü koduna. **Manuel kodlar orijinal recipe'i DEĞİŞTİRMEZ** (salt-okuma). Diyet kodları (v/gf/df) manuel kalır. `menu.allergenStyle` 'codes'|'off'. Render: yemek adı yanında `(gf) (G) (D)`, altta kullanılan kodların lejantı. **YOK: yemek gizleyen "allergen-safe" filtre** (v2.15.4'te kaldırıldı — kavramsal yanlış + "manuel yemek görünmüyor" bug kaynağı; geri ekleme; `safePrintFilter` artık okunmaz). Fiyat: `menu.priceStyle` 'symbol'|'plain'(simgesiz, Cornell)|'hidden'. Yeni kod eklersen MENU_CODES + 6 dilde `menu_code_*` i18n.

**Roster aracı (v2.15.1 + v2.15.4).** `roster.js` (lazy, Kitchen). Çıktı motoru tek: **`rosterMatrix(data)`** → `{days, groups:[{name, rows:[{staff,cells:[{text,status?}],hours,cost}]}]}`; print/Excel/share hepsi bundan üretilir (tutarlı). **Departman grupları `groupedStaff(data)` — DİKKAT: `.group` döndürür, `.name` DEĞİL** (gridHtml'de `.group` oku; rosterMatrix `name:g.group`'a map'ler — v2.15.4'te bu uyumsuzluk bug'dı). Hücre = `{start,end,note}` (vardiya) VEYA `{status:'OFF'}` (izin/durum, 0 saat). Durum kodları `ROSTER_STATUS` registry (OFF/AL/PH/SL/RDO/UNP + renk; yeni kod → registry + `roster_st_*` i18n). Renkli print `print-color-adjust:exact` ile basar (Background graphics kapalı olsa bile — kaldırma). `data.venue` = print üst başlık bandı. Roster `data` jsonb içinde sync olur — yeni alan için migration gerekmez. **Excel (v2.15.5): roster KENDİ worksheet'ini xlsx-js-style ile inline kurar** (ortak `PCD.xlsx` hücre rengi desteklemediği için — recipes/buffet gibi); başlık bandı + departman bantları + renkli durum hücreleri (PDF ile aynı). `PCD.xlsx`'i roster için kullanma, inline builder'ı koru.

**Ortak styled-Excel motoru = `PCD.xlsx` (utils.js, v2.14.2).** Tüm YENİ Excel export'larını bundan geçir: `PCD.loadXLSX().then(XLSX => PCD.xlsx.save(XLSX, [{name,title,subtitle,headers,rows,align,numFmt,widths}], 'file.xlsx'))`. Kalın yeşil başlık + çerçeve + alt-satır gölgesi + autofit standart. Her araç kendi workbook'unu inline kurmasın. (recipes/buffet cost report'ları eski, kendi stilleri var — dokunma, çalışıyor.)

**Büfe tarif kalemi maliyeti PORSİYON bazlı (gotcha).** `buffet.js computeItemCost` Path B: recipe item maliyeti = (tarif maliyeti ÷ servings) × kişi × `amountPerGuest` × refill. Yani recipe item'da `amountPerGuest` = **porsiyon/kişi** (gram DEĞİL — recipe'lerde yieldUnit yok → gram→porsiyon dönüşmez). Gram yazarsan ~100× şişer (v2.14.4 demo büfe %4052 bug'ı buydu). Ingredient item ise gram doğru (Path A). Demo/seed büfede recipe kalemi 0.5-0.9 porsiyon/kişi gir.

**Demo seed (demo-recipes.js) gotcha'ları.** (1) Tek seferlik — `onboarding.demoSeeded` flag; sürüm değişince YENİDEN yüklenmez (yeni seed'i görmek için incognito). (2) Event menüsü alanı **`menu`** ('recipes' DEĞİL — events.js `event.menu` okur). (3) Inventory seed `findId(upserted, name)` kullanmalı (`upserted` array, isimle indeksleme undefined döner). (4) Supplier `category` suppliers.js görünen adı olmalı (Produce / Meat & Poultry / Seafood / Dairy / Dry Goods…), `cat_*` DEĞİL (yoksa hepsi "Other"). (5) Büfe ayrı kayıt yolu (`_read('buffets')` ws-keyed dizi, `upsertInTable` değil).

**Discover skorları hesap-bazlı, workspace değil (v2.14.6).** "My public recipes" sayısı `_read('recipes')` ile TÜM workspace'lerdeki `isPublic` tarifleri sayar (aktif ws `listRecipes()` DEĞİL — yoksa boş workspace'te 0 görünür). Görüntülenme/like zaten feed'den `user_id` ile toplanır (hesap-bazlı). discover.js bir araç (sync motoru değil) ama cloud okumalarına dikkat.

## Blog SEO standardı (v2.8.94'te kurulan)

Her yeni blog yazısı şunları içermek zorunda:

1. **`<head>` içinde JSON-LD Article schema** — `headline` + `description` + `datePublished` + `dateModified` + `author.Person` + `publisher.Organization` + `mainEntityOfPage` + `wordCount` + `keywords`
2. **Body içinde ≥1 authority outbound link** — gov/akademik (USDA / FDA / FSANZ / EU / UK FSA / Cornell / akademik paper), `target="_blank" rel="noopener"`
3. **Footer'dan önce `<section class="related-posts">` 2-card cross-link** — eski yazılara (her yeni yazı en az 2 eski yazıya link verir, "topic cluster" pattern)
4. **sitemap.xml** yeni `<url>` blok eklenir + tüm etkilenen `<lastmod>` güncel YYYY-MM-DD
5. **blog/index.html** en üste yeni `<a class="post-card">` blok (newest first pattern)

**Standart blog stili:** standalone HTML, Inter + Fraunces font, cream paper palette (`#FAF7F2` bg / `#FFFEFA` paper), `#2D4A3E` deep forest primary + `#16a34a` brand green CTA. CSS pattern her yazıda aynı (kopya-yapıştır, repo build step yok).

**Push sonrası operatör manuel iş:** Google Search Console → URL Inspection → yazının absolute URL'ini gir → "Request Indexing" (1-2 günde indekslenir, otomatik bekleme 2-3 hafta).

## Önerme

Bu işleri spontan öneri olarak ortaya çıkarma:

- Pricing / paid tier / Stripe (50+ aktif kullanıcı + %40 retention kanıtlanmadan yok)
- AI image gen entegrasyonu (operatörün kendi GPU donanımı var — RTX 5090 24GB)
- Demo seed değişikliği (mevcut hali iyi)
- Türkçe landing page (operatör erteledi)
- Screenshot ekleme (operatör kendisi çeker)

## Daha fazla bilgi

Tam mimari, DB şeması, migration listesi, edge function detayları, operatör bağlamı için: **`HANDOVER.md`** (repo kökü).

Sürüm tarihi için: **`CHANGELOG.md`** (repo kökü).
