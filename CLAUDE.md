# ProChefDesk — Claude Code Rehberi

## Proje

ProChefDesk — profesyonel şefler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya, Perth WA, aktif kullanıcı şef. Solo proje.
**Production:** `prochefdesk.com`, uygulama `/app/` altında.

**Stack:** Vanilla JavaScript (bundler yok, service worker yok), IndexedDB ana storage (offline-first), Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (GitHub push'ta auto-deploy), Cloudflare R2 (gece otomatik yedek).

Araç envanteri ve mimari detay için: **`HANDOVER.md`** · Sürüm geçmişi için: **`CHANGELOG.md`**

---

## Operatör + çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. Yorgun veya kızgınsa tek net talimat ver. "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme.

**Push akışı:** GitHub Desktop GUI. Operatör Windows kullanır. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js` → `APP_VERSION` satırı değiştirilir. `app/index.html`'e sürüm numarası YAZMA — orada `__VERSION__` placeholder'ı var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Elle yazılırsa build fail eder.

---

## Çalışma kuralları

- **Bir hedef → en küçük adım.** Birden fazla iyileştirmeyi tek sürüme paketleme.
- **Bulk regex/script YOK.** Manuel dosya-by-dosya edit. Geçmişte bulk script 226+ syntax error + rollback üretmiştir.
- **Her edit'ten sonra `node -c` syntax check.**
- **Tahmin yürütme.** Frontend değiştirmeden önce gerçek dosyayı oku. Operatör bir sorunla geldiğinde önce DevTools console + kod ile mevcut durumu kontrol et, sonra çözüm üret.
- **Yeni özellik önermeden önce repo'da grep ile var mı kontrol et.** Memory'de "yapılmamış" notu olsa bile kod seviyesinden doğrula.
- **Operatöre teknik kod gösterilmez.** Diff blokları, syntax detayları kafa karıştırır. Değişikliğin ne olduğunu sade dille anlat, hangi dosyayı değiştirdi, riski neydi.

---

## Güvenlik sınırları (onay zorunlu)

- DROP TABLE veya destructive SQL
- 50+ satır frontend değişikliği tek seferde
- Yeni dosya/modül ekleme
- Cron schedule veya RLS policy değişikliği
- Cross-device sync mantığı değişikliği (cloud.js, cloud-pertable.js, cloud-realtime.js)
- Edge Function deploy

---

## Önerme — bunları spontan önerme

- Pricing / paid tier / Stripe (50+ aktif kullanıcı + %40 retention kanıtlanmadan)
- AI image gen entegrasyonu (operatörün RTX 5090 24GB'ı var, kendisi yönetir)
- Demo seed değişikliği
- Türkçe landing page (ertelendi)
- Screenshot ekleme (operatör kendisi çeker)

---

## Mimari gotcha'lar

Bunlara bilmeden dokunmak beklenmedik davranışa yol açar. Her biri "bu şekilde çalışır, bu nedenle böyle yap" formatında yazılmıştır.

---

**Reload öncesi explicit flush zorunlu.**
UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada `await PCD.cloudPerTable.flushNow()` olmalı.** Debounced sync (600ms) tamamlanmadan reload tetiklenirse yazım buluta gitmez.

---

**PCD.icon registry — bilinmeyen isim sessizce fallback yapar.**
`PCD.icon(name, size)` registry'de olmayan isim için info ikonuna (kırmızı yuvarlak "i") fallback yapar. Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js` ile registry'de olduğunu doğrula.

---

**Per-table cloud sync 3 yönlüdür.**
Push: `cloud-pertable.js` (debounced 600ms, retry'lı, IDB'ye persist edilir — sekme kapansa bile kaybolmaz).
Pull: `cloud.js` (boot'ta tüm tablolar, drift detection).
Realtime: `cloud-realtime.js` (WebSocket, JWT setAuth + TOKEN_REFRESHED dinleyici).
Sync bug'ında önce hangi yön sorun yaşıyor onu belirle.

---

**Print akışı tek noktadan geçer.**
Tüm yazdırma `PCD.print(html, title)` (utils.js) üzerinden. Footer otomatik enjekte edilir (tıklanabilir "Made with ProChefDesk · prochefdesk.com"). Custom footer yazma, `.pcd-print-footer{display:none}` override koyma. Window genişliği 1200px (Kitchen Cards landscape A4 için).

---

**Modal focus davranışı.**
`PCD.modal.open()` açılışta body'deki ilk form field'ına (input/textarea/select) focus eder — header'daki "X" close butonuna değil. Belirli bir field'a focus istersen modal açtıktan sonra `setTimeout(300ms)` ile manuel `.focus()` çağır.

---

**Recipe ingredient separator.**
`data.ingredients` array'inde `{ separator: true, label?: '' }` tipi satır var. Hesaplama path'leri (maliyet/alerjen/variance) `if (ri.separator) return;` ile skip etmeli. Görüntüleme path'leri (editör/önizleme/kitchen card/share/PDF/discover) render etmeli.

---

**RLS tüm tablolarda aktif.**
Frontend `anon` key kullanır. Yeni tablo eklerken:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

**Misafir vs üye davranışı.**
Misafir (login yok): sadece IDB, cloud yazma KAPALI, demo seed yüklenir.
Üye (login var): IDB + cloud çift yönlü.
Yeni feature'da misafir için cloud push tetiklenmemeli.

---

**Root dosyalar app'ten bağımsız.**
`/` (landing), `/privacy.html`, `/terms.html`, `/blog/` — hepsi kendi inline CSS'i ile çalışır. App CSS değişiklikleri bu dosyaları etkilemez, tersi de. Blog yazıları her biri standalone HTML (Inter + Fraunces, cream paper palette, brand green CTA).

---

**Sub-recipe ingredient flattening.**
`PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip). Her item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. "Tarif → ingredient listesi" ihtiyacında bu helper'ı kullan. `variance.js` kendi recursion'una sahiptir, bu helper'dan bağımsızdır.

---

**Lazy tool loading.**
17 araç dinamik script tag ile lazy yüklenir. Eager kalanlar: **dashboard** (default home), **account** (auth flow), **inventory** (dashboard low-stock alert sync). `PCD.router.go(name)` lazy route varsa: loading state → script load → routes[name] wire → render. Yeni araç eklerken: (a) `router.registerLazy(name, scriptPath, toolName)` ekle, (b) dashboard click handler gerektiriyorsa `_afterToolLoad(toolName, cb)` poll pattern'i kullan (120ms × 3sn).

---

**xlsx + i18n lazy load.**
`PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) CDN'den ilk tıklamada yüklenir. `i18n.js` `setLocale()` async — sadece `en.js` boot'ta baseline; diğer diller dinamik fetch.

---

**Buffet item 3 tiptir.**
`recipeId` / `ingredientId` / `customName`. (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → cost=0. `computeItemCost` 3 path'e split. Yeni hesaplama eklerken her 3 path'i kapsadığından emin ol.

---

**HACCP Hub konsolidasyon.**
4 HACCP form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında yaşar. 4 form route'u korunmuştur — bookmark + direct link çalışmaya devam eder.

---

**Array-tablo cloud sync pattern.**
`buffets`, `mise_plans`, `team`, `whiteboards`, `checklist_sessions`, `waste`, `shopping_lists` array tablolardır. Soft-delete tombstone (`_deletedAt`), `queueArraySync` ile push, realtime aktif. Yeni array tablo eklerken: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES.

---

**MAP-tablo cloud sync pattern.**
`rosters`, `prepSheets`, `stock_count_history`, `haccp_*` — array değil, `{wsId:{recordId:obj}}` yapılı. `upsertInTable`/`deleteFromTable` ile yazılır (`updatedAt` otomatik damgalanır). `cloud.js` HIGH_EDIT_WS_TABLES listesinde olmalı (per-record en-yeni-kazanır mantığı). Yeni MAP tablo eklerken 6 nokta birlikte: store.js · cloud-pertable.js · cloud-realtime.js · cloud.js · backup-to-r2 · migration (tablo + RLS + realtime publication + cascade trigger + REPLICA IDENTITY FULL).

---

**CSP yok.**
`index.html`'de Content-Security-Policy meta tag yoktur. Eklenecekse: önce minimal `script-src * 'unsafe-inline' 'unsafe-eval'` ile başla, her tightening adımında hCaptcha widget'ı + Discover foto yüklemesini test et.

---

**hCaptcha — onload + scroll lock pattern birlikte çalışır.**
`account.js`'de hCaptcha `?onload=__pcdHcaptchaOnLoad&render=explicit` URL param + `window.__pcdHcaptchaOnLoad` callback. Bu pattern bozulursa widget çizilir ama event handler attach olmaz.
Modal scroll lock `html/body { overflow: hidden }` ile çalışır. `position:fixed` / `transform` / `top:-scrollY` ile body koordinat sistemini değiştirme — hCaptcha/3rd-party popup'ları ofsetli yerleşir.

---

**Discover view count rate-limited.**
`recipes.view_count` doğrudan artırılmaz. `rate-limited-view` Edge Function üzerinden gider: header'dan IP alır, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC. `discover_view_logs` tablosu + saatlik cleanup cron.

---

**Photo storage flow + race.**
Recipe foto upload → WebP re-encode @ 0.82 → Supabase Storage → public URL → `data.photo`. Upload async; save click o anda `data.photo` eski olabilir → cloud sync foto'suz gider. Operatör foto görünmüyor raporlarsa: recipe'i editörde aç → Save → 5sn bekle → Discover Refresh.

---

**Whiteboard tek render motoru = WYSIWYG.**
Canvas önizleme ve print AYNI `renderBlockContent(block)` + `blockBoxStyle(block)` fonksiyonlarını kullanır. Canvas gerçek A4/A3 px'te + `transform:scale` ile pane'e sığar; print aynı px içeriği mm `@page`'de basar. Bu iki motoru ayırma — önizleme ≠ çıktı geri gelir.
Print body `display:flex;flex-direction:column` + `.wb-print-sheet{flex:1}` → footer tek sayfada kalır.
`.wb-canvas-viewport{min-width:0}` + workspace grid `minmax(0,1fr)` zorunludur (yoksa gerçek-A4 canvas mobilde yatay taşar).

---

**Whiteboard canvas ölçek + zoom.**
`applyCanvasScale()` ilk yüklemede clientWidth=0 ise self-retry yapar (rAF, bounded 60). ResizeObserver sadece sonraki resize/zoom için. `app.js` global error handler'da "ResizeObserver" içeren hatalar filtrelidir — bu filtreyi kaldırma.

---

**Profil kaydı — flush zorunlu.**
`store.set('user', u)` 400ms debounce'lu persist eder. Profil kaydından SONRA `PCD.store.flush()` çağır (account.js save + preview handler) — yoksa kaydet→kapat/yenile race'inde veri kaybolur. Auth `_setUser` aynı hesapta MERGE eder (role/country/workplace/bio her session restore'da korunur) — overwrite'a çevirme.

---

**i18n `t()` — 2 parametre.**
`t(key, vars)` şeklinde çağrılır. `t(key, 'fallback string', {params})` çalışmaz — 3. arg yok sayılır, interpolation bozulur. Eksik anahtar `bundles.en[key]`'e düşer, fallback string gerekmez.

---

**Menü diyet/alerjen harf kodları.**
`MENU_CODES` registry: küçük harf = diyet/uygunluk (v/vg/gf/gfo/df/dfo/nf/h), BÜYÜK = "içerir" alerjen (N/G/D/E/F/SF/S/SE). Kodlar SADECE BİLGİ amaçlıdır — filtre veya kısıtlama değil. Gösterim `displayCodeIds(it)` = manuel `it.codes` ∪ otomatik `autoAllergenCodeIds(it)` (recipe malzeme alerjenlerinden). Manuel kodlar recipe'yi değiştirmez. Yeni kod eklersen MENU_CODES + 6 dilde `menu_code_*` i18n.

---

**Roster — groupedStaff ve rosterMatrix.**
`groupedStaff(data)` `.group` döndürür (`.name` değil). `rosterMatrix(data)` bunu `name: g.group` olarak map'ler. Çıktı motoru tekdir: print / Excel / JPEG önizleme hepsi `buildRosterTable(data, showCost)` + `rosterMatrix(data)` üzerinden üretilir.
Hücre formatı: `{start, end, note}` (vardiya) veya `{status:'OFF'}` (durum, 0 saat).
Excel yatay/tek sayfa: JSZip ile `xl/worksheets/sheet1.xml`'e `<sheetPr>` + `<pageSetup>` enjekte edilir. `ws['!pageSetup']` SheetJS'te çalışmaz.
JPEG: html2canvas CDN lazy → `navigator.canShare({files})` varsa native share, yoksa indir.

---

**Ortak styled-Excel motoru = `PCD.xlsx`.**
Yeni Excel export'larını `PCD.loadXLSX().then(XLSX => PCD.xlsx.save(...))` üzerinden geçir: kalın yeşil başlık + çerçeve + alt-satır gölgesi + autofit standart. Roster kendi inline worksheet'ini kullanır (hücre rengi `PCD.xlsx`'te desteklenmediğinden) — dokunma.

---

**Büfe tarif kalemi — porsiyon/kişi (gram değil).**
`computeItemCost` Path B: recipe item → maliyet = (tarif maliyeti ÷ servings) × kişi × `amountPerGuest` × refill. `amountPerGuest` = **porsiyon/kişi**. Gram girilirse maliyet ~100× şişer (gram → porsiyon dönüşümü yoktur). Ingredient item (Path A) gramı doğru işler.

---

**Demo seed (demo-recipes.js) — 5 kural.**
1. Tek seferlik — `onboarding.demoSeeded` flag; sürüm değişince yeniden yüklenmez (görmek için incognito).
2. Event menüsü alanı `menu` ('recipes' değil — `events.js` `event.menu` okur).
3. Inventory seed `findId(upserted, name)` kullanmalı.
4. Supplier `category` görünen ad olmalı (Produce / Meat & Poultry / Seafood / Dairy / Dry Goods…), i18n key değil.
5. Büfe ayrı kayıt yolu (`_read('buffets')` ws-keyed dizi, `upsertInTable` değil).

---

**Discover skorları — hesap bazlı.**
"My public recipes" sayısı `_read('recipes')` ile TÜM workspace'lerdeki `isPublic` tarifleri sayar — aktif workspace'in `listRecipes()` değil. Yoksa boş workspace'te 0 görünür.

---

**recipe_likes RLS — sıkı.**
SELECT sadece kendi like'larını döndürür. Public like count gerekirse `pcd_get_recipe_like_count(text)` RPC kullan (SECURITY DEFINER, aggregate-only, anon+authenticated EXECUTE). `recipes.like_count` denormalized kolon zaten public.

---

## Blog SEO standardı

Her yeni blog yazısı şunları içermelidir:

1. **JSON-LD Article schema** (`<head>` içinde) — `headline` + `description` + `datePublished` + `dateModified` + `author.Person` + `publisher.Organization` + `mainEntityOfPage` + `wordCount` + `keywords`
2. **≥1 authority outbound link** — gov/akademik (USDA / FDA / FSANZ / EU / UK FSA / Cornell / akademik paper), `target="_blank" rel="noopener"`
3. **`<section class="related-posts">` 2-card cross-link** (footer'dan önce) — eski yazılara bağlantı (topic cluster)
4. **sitemap.xml** — yeni `<url>` bloğu + etkilenen `<lastmod>` güncelle
5. **blog/index.html** — en üste yeni `<a class="post-card">` bloğu (newest first)

**Blog stili:** Standalone HTML, Inter + Fraunces, cream paper palette (`#FAF7F2` bg / `#FFFEFA` paper), `#2D4A3E` deep forest primary + `#16a34a` brand green CTA. CSS her yazıda aynı (build step yok).

**Push sonrası:** Google Search Console → URL Inspection → "Request Indexing".
