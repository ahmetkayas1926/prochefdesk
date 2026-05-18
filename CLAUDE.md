# ProChefDesk — Claude Code rehberi

Bu dosya repo kökünde durur. Claude Code her session başında otomatik okur.

## Proje

ProChefDesk — profesyonel şef'ler için web tabanlı mutfak yönetim sistemi. Operatör: Ahmet Kaya (Perth WA, aktif kullanıcı şef). Solo proje. Production canlı: `prochefdesk.com`, app `/app/` altında.

Stack: Vanilla JavaScript (no bundling, no service worker), IndexedDB ana storage, Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (auto-deploy on GitHub push), Cloudflare R2 (backups).

**Mevcut sürüm: v2.8.92** (push'a hazır local; production v2.8.91 — push edilene kadar). Detay: `CHANGELOG.md`.

**Master roadmap (operatör onayıyla):** ✅ v2.8.83 Welcome tour → ✅ v2.8.84 Author profile-priority → ✅ v2.8.85 Profile↔Discover bağlantı → ✅ v2.8.86 Excel bug fix + Buffet list Cost Report parite → ✅ v2.8.87 Excel menu-item scope fix → ✅ v2.8.88 Buffet UX modernize Faz 1 → ✅ v2.8.89 Buffet Quick start preset → ✅ v2.8.90 i18n consistency Round 3 → ✅ v2.8.91 Dashboard + Tools-hub UX upgrade → ✅ v2.8.92 Portion Calculator Step 1 kaldır (operatör direct istek) → v2.8.93 yield + waste + variance → v2.8.94+ kalan NAKED araçlar (nutrition/allergens/mise/discover/account/team/sales/whatif/menu_matrix/haccp hub, ~5-6 sürüm) → v2.8.99'a kadar tüm araçlar RICH seviyesinde. **Backlog:** Buffet Excel footer "Made with ProChefDesk · prochefdesk.com" — düşük öncelik, operatör "bir ara yaparsın" dedi. Her tur tek bir sürüm bump. Baseline her araçta: (1) kapatılabilir inline guide (buffet v2.8.77 pattern), (2) her input altında italik gri 11-12px hint, (3) yarı-transparan örnek placeholder ("e.g. 800"), (4) empty state onboarding kartı. i18n: TR + EN tam parity, ES/FR/DE/AR EN fallback (operatör onayladı).

## Çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. Operatör "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme. Operatör yorgun veya kızgınsa tek net talimat ver.

**Push akışı:** GitHub Desktop GUI ile. Operatör Windows'tan çalışır. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js`'in `APP_VERSION` satırını değiştir. `app/index.html`'e literal sürüm yazma — orada `__VERSION__` placeholder'ları var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Literal yazılırsa build fail eder.

## Backlog (öncelik sırasına göre)

**v2.8.34-v2.8.79 sweep ile büyük öncelik paketleri tamamlandı** (perf L1+L2, Buffet Planner + overhaul, Mise en Place, Tag system, HACCP Hub, Allergen Guardrail, Cost Health, Sub-recipe flatten helper, Checklist library/drag-drop, Menu Builder modernizasyon, Photo 1:1 standart, R2 backup haccp tables fix, Excel bug fix). Detay: `CHANGELOG.md`. **Kalan açık maddeler (yeniden numaralandı):**

7. **iOS/Safari cross-browser test pass** — v2.8.49'da kod tarama yapıldı (temiz, sadece backdrop-filter vendor prefix eklendi). Manuel cihaz testi operatör tarafına bekliyor.

11. **Categories functional.** Şu an menu kategorileri kozmetik label. 50+ menu item olursa filter/grouping/Prep-specific kategoriler değerli olur.

12. **Marketing / SEO / blog kurulumu** — ✅ tüm fazlar tamam. 2026-05-18 altyapı + GSC verify + sitemap submit + 7 sayfa Google'a keşfedildi. Backlog'da kalan iş yok.

**Audit sonrası yeni bekleyenler:**

13. ~~Edge function deploy: `delete-account`~~ — ✅ operatör Supabase Dashboard'dan deploy etti (2026-05-18).
14. ~~Edge function deploy: `backup-to-r2`~~ — ✅ operatör deploy etti, BACKUP_TABLES'da `haccp_receiving` + `haccp_holding` doğrulandı (2026-05-18). İlk doğrulama: yarın sabah UTC 03:00 (Perth 11:00) cron run sonrası Cloudflare R2 bucket'ında iki yeni jsonl dosyası gör.
15. **Discover view spam rate limit** — `increment_recipe_view` RPC anonymous'a açık (MVP kabul). Viral olursa Edge Function ile IP+recipe başına 1 saat 1 view.
16. **R2 foto bytes yedekleme** — şu an sadece manifest. Pro tier'a geçişte Storage PITR ile çözülür.
17. **`supabase-functions/` duplicate silme** — operatör Dashboard'dan deploy doğrulaması yaptı; klasör artık güvenle silinebilir (deploy artık her zaman `supabase/functions/`'tan kopyalanıyor).
18. **Buffet + Mise cloud sync** — v2.8.73 (`buffets`) + v2.8.74 (`misePlans`) IDB-only. Cloud sync için Supabase tablo + RLS + per-table sync wire gerekiyor. Pattern: v2.8.44 (haccp_receiving/holding) örnek alınabilir. **Onay zorunlu** (yeni tablo + RLS + sync mantığı).
19. **Discover'a Tag + Allergen filter** — v2.8.75 tag + v2.8.71 allergen guardrail Discover'a inmedi (public snapshot enrichment gerekli). Public recipe save edilirken inline `tags` + `dietFlags` gömme — v2.8.66 `enrichPublicIngredientNames` pattern'i izlenir.
20. **App boot perf L3** (cloud sync ilk paint sonrasına ertele) — yüksek risk, **önerilmedi**. L1 (v2.8.76 defer) + L2 (v2.8.78 lazy xlsx + i18n + tools) yeterli; beklenen PageSpeed Performance ~85, LCP 3.0-3.5 sn.

**Tamamlanmış maddelerin sürüm referansı:** `CHANGELOG.md`. `HANDOVER.md §5` tablosu da güncel.

## Güvenlik sınırları (onay zorunlu)

Aşağıdaki işlemlerden önce operatörden onay al, kendi başına yapma:

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
- **Yeni özellik önermeden önce repo'da grep ile var mı kontrol et.** Memory'de "yapılmamış" notu olsa bile doğrula. (Önceki sessions'da "Report an issue modal yok" gibi yanlış öneriler bu kuralı doğurdu — modal zaten `app/js/tools/account.js`'te.)
- **Operatöre teknik kod gösterilmez.** Diff blokları, syntax detayları kafa karıştırır. Değişikliğin ne olduğunu sade dille söyle, hangi dosyayı kopyalayacak ve ne riski var.

## Mimari gotcha'lar

Geçmişte bug üreten yerler, bilmeden dokunma:

**Cloud sync race condition.** UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada explicit `await PCD.cloudPerTable.flushNow()` olmalı**. Yoksa debounced sync tamamlanmadan reload tetiklenir → "verim kayboldu" raporu gelir.

**PCD.icon registry silent fallback.** `PCD.icon(name, size)` registry'de olmayan isim için **sessizce info ikonuna fallback** yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js` ile registry'de olduğunu doğrula.

**Per-table sync 3 yönlü.** Push (cloud-pertable.js, debounced, retry'lı), Pull (cloud.js, boot'ta tüm tablolar, drift detection v2.8.33'te eklendi), Realtime (cloud-realtime.js, WebSocket, v2.8.43'te JWT setAuth fix ile CHANNEL_ERROR temizlendi — TOKEN_REFRESHED dinleyici 1-saatlik token refresh sonrası re-setAuth yapıyor). Sync bug'ında ÖNCE hangi yön sor.

**Print akışı tek nokta (v2.8.54-v2.8.55).** Tüm yazdırma `PCD.print(html, title)` (utils.js) üzerinden. Footer otomatik enjekte edilir (standart tıklanabilir "Made with ProChefDesk · prochefdesk.com"); custom footer YAZMA, `.pcd-print-footer{display:none}` override KOYMA. Window genişliği 1200px (Kitchen Cards landscape A4 1122px body sizing'e sığsın). Eski "first preview wrong, second correct" bug'ı bu boyutla kapandı. Detay HANDOVER §11.11.5.

**Modal focus (v2.8.81).** `PCD.modal.open()` açılışta body'deki ilk form field'ına (input/textarea/select) focus eder — header'daki "X" close butonuna DEĞİL. `modal.js:192` selector `bodyEl` ile restrict + button çıkarılmış + disabled atlama. Yeni modal yazarken: özel focus istemiyorsan hiçbir şey yapma, evrensel davranış body'deki ilk input'u focus eder. Özel field'a focus istersen modal açtıktan sonra setTimeout 300ms ile manuel `.focus()` çağır (recipe editor quick-add v2.8.6 pattern'i — root cause fix sonrası gereksiz ama zararsız).

**Recipe ingredient separator (v2.8.52).** `data.ingredients` array'inde yeni satır tipi: `{ separator: true, label?: '' }`. Hesap path'leri (cost/diet/allergen/variance) `if (ri.separator) return;` skip etmeli. Display path'leri (editor/preview/kitchen card/share/PDF/discover) render etmeli — `dashboard.resolveRow` separator için `{ found: false, isSeparator: true }` döndürüyor, cost report ve XLSX detail otomatik atlar. Yeni `recipe.ingredients` üzerinde forEach yazarken iki path'ten birini seç.

**RLS tüm 25 tabloda aktif** (18 workspace-scoped + 7 top-level — v2.8.44 haccp_receiving/holding + v2.8.46 recipe_likes son eklenenler). Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy şart:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye davranışı.** Misafir (login yok): sadece IDB, cloud yazma KAPALI, demo seed yüklenir. Üye (login var): IDB + cloud çift yönlü. Yeni feature'da misafir için cloud push tetiklenmemeli.

**Root dosyalar (landing, privacy, terms, blog/) app'ten BAĞIMSIZ.** `prochefdesk.com/index.html`, `/privacy.html`, `/terms.html` ve `/blog/*.html` kendi inline CSS'leriyle çalışır. App CSS değişiklikleri bu dosyaları etkilemez, tersi de. Blog yazıları her biri standalone HTML (Inter + Fraunces, cream paper palette, brand green CTA). Yeni yazı eklerken: (1) mevcut bir post HTML'i kopyala + meta/içerik değiştir, (2) `/blog/index.html`'de en üste yeni `<a class="post-card">` kart bloku ekle (newest first), (3) `sitemap.xml`'e yeni `<url>` girdisi. Build step yok. Detay HANDOVER §11.9.

**`supabase-functions/` klasörü duplicate** — `supabase/functions/delete-account/` ile identical, repoda referans yok. Operatör Supabase Dashboard'dan deploy doğrulaması yapana kadar **silinmeyecek**.

**Sub-recipe ingredient flattening (v2.8.69).** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) — recipe'in tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip). Her flattened item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. Bağlı 6 modül: portion.js (canvas + print + share), shopping.js (consolidation + by-recipe group), nutrition.js, allergens-db.js `recipeAllergens`, dashboard.js `computeDietCompat`. Yeni "tarif → ingredient listesi" ihtiyacında bu helper'ı kullan, manuel recursion yazma. Variance.js zaten kendi recursion'una sahip, dokunma.

**Lazy tool loading (v2.8.78).** Router'da 16 tool dinamik script tag ile lazy yüklenir. Eager kalanlar: **dashboard** (default home), **account** (auth flow), **inventory** (dashboard low-stock alert sync `computeStatus` kullanır). `PCD.router.go(name)` lazy route varsa loading state göster → script load → routes[name] wire → render. Popstate `_renderView` yerine `router.go()` çağırır (lazy support). Yeni tool eklerken: (a) eager mi lazy mi karar ver (default lazy), (b) `router.registerLazy(name, scriptPath, toolName)` ekle, (c) dashboard click handler kullanılıyorsa `_afterToolLoad(toolName, cb)` poll pattern'i (`[data-action="new-recipe"]`/`new-event`/`view-event` örneği var, 120ms × 3sn).

**xlsx + i18n lazy load (v2.8.78).** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) CDN'den ilk tıklamada yüklenir. `recipes.js` cost report export + `ingredients.js` Excel import wire'lı. `i18n.js` `setLocale()` async — sadece `en.js` boot'ta baseline; TR/ES/FR/DE/AR dinamik fetch (`loadLocaleBundle(locale)` cached). Sync caller'lar `.then` zinciri olmadan da çalışır. **API gotcha:** `PCD.toast.info()` return value pattern'i güvenli değil — v2.8.79'da "loading-toast remove" pattern kaldırıldı; sessiz lazy load + re-call yeterli.

**Buffet item 3 tipte (v2.8.79).** `buffet.js` item'da `recipeId` / `ingredientId` / `customName` ayrımı: (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → cost=0, sadece printout. `computeItemCost` 3 path'e split, print/Excel üçünü de handle eder. Add Item butonu 4-action modal: 📖 Recipe Library / 🥬 Ingredient Library / ➕ New Ingredient (inline editor, save sonrası hem buffete hem library'e ekler) / ✎ Custom Label. UI'da renkli chip badge ile tip görünür (recipe yeşil / ingredient sarı / custom gri). Yeni computation eklerken her 3 path'i de değerlendirme zorunlu, aksi halde custom item kart silinebilir / cost 0 yerine NaN çıkabilir.

**HACCP Hub konsolidasyon (v2.8.70).** 4 HACCP form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında landing widget ile yaşar. Mevcut 4 route DOKUNULMADI — bookmark + direct link korunur. Hub içinden tıklayınca aynı view açılır. Sidenav 18→15 item; yeni HACCP form eklersen hub landing widget'ı da güncelle (`app/js/tools/haccp.js`).

**Buffet + Mise IDB-only (v2.8.73, v2.8.74).** `buffets` ve `misePlans` tablolarına şu an cloud sync YOK. Misafir + üye için lokal IDB. Cloud sync sonraki round'da (backlog #18). Yeni feature lokal-only IDB tablo eklerken: (a) `store.js`'te tablo açıkça eklenmeli, (b) `cloud-pertable.js` `WORKSPACE_TABLES`'a EKLEME (sync isteme kadar), (c) `cloud.js` pull'una EKLEME, (d) `cloud-realtime.js`'e EKLEME. Pattern temiz.

## Önerme

Bu işleri spontan öneri olarak ortaya çıkarma:

- Pricing / paid tier / Stripe (50+ aktif kullanıcı + %40 retention kanıtlanmadan yok)
- AI image gen entegrasyonu (operatörün kendi GPU donanımı var, ürüne entegre etmek gereksiz)
- Demo seed değişikliği (mevcut hali iyi)
- Türkçe landing page (operatör erteledi)
- Screenshot ekleme (operatör kendisi çeker)
- `supabase-functions/` duplicate silme (operatör doğrulama yapacak)

## Daha fazla bilgi

Tam mimari, DB şeması, migration listesi, edge function detayları, operatör bağlamı için: **`HANDOVER.md`** (repo kökü).

Sürüm tarihi için: **`CHANGELOG.md`** (repo kökü).
