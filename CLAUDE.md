# ProChefDesk — Claude Code rehberi

Bu dosya repo kökünde durur. Claude Code her session başında otomatik okur.

## Proje

ProChefDesk — profesyonel şef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya (Perth WA, aktif kullanıcı şef). Solo proje.
**Production:** `prochefdesk.com`, app `/app/` altında.

**Stack:** Vanilla JavaScript (no bundling, no service worker), IndexedDB ana storage, Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (auto-deploy on GitHub push), Cloudflare R2 (backups).

**Mevcut sürüm:** v2.9.28 (push'a hazır local; production v2.9.27). **REVERT v2.9.24 CSP + hCaptcha + photo sanitize** — hepsi v2.9.23 working state'e döndü. recipe_likes RLS sıkı korundu. Detay: `CHANGELOG.md`.

**Blog:** 13 yazı yayında (Faz A: 3 SEO upgrade + Faz B: 10 yeni yazı). SEO standardı aşağıda `## Blog SEO standardı` bölümünde.

## Çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme. Yorgun veya kızgınsa tek net talimat ver.

**Push akışı:** GitHub Desktop GUI. Operatör Windows. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js` `APP_VERSION` satırı. `app/index.html`'e literal sürüm YAZMA — orada `__VERSION__` placeholder'ları var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Literal yazılırsa build fail eder.

## Master roadmap

**Tamamlanmış (yüksek seviye):**
- **v2.6.x — v2.8.79:** Altyapı (per-table sync + RLS + cascade triggers + cache-busting), büyük araçlar (Buffet Planner, Mise en Place, HACCP Hub, Allergen Guardrail, Cost Health, Sub-recipe flatten helper), perf L1+L2.
- **v2.8.80 — v2.8.93:** UX hijyen (modal focus root cause, recipe editor birleştirme, welcome tour modernize, Profile↔Discover bağlantı), Excel bug fix, Buffet UX modernize + Quick Start (7 preset), Portion Calculator semantik refactor, Dashboard + Tools-hub upgrade.
- **v2.8.94 — v2.8.99:** Blog SEO — Faz A (3 yazı JSON-LD + authority + cross-link upgrade) + Faz B 5-round (10 yeni yazı, total 13 yayında).
- **v2.9.0 — v2.9.13:** NAKED→RICH sweep TAMAMLANDI. 5 round'da 13 araç buffet seviyesinde RICH: kapatılabilir inline guide + stats hero + per-field hint + empty state CTA + dark mode kapsamlı kontrast fix. Tüm araçlarda artık tutarlı UX paterni.

**Sıradaki (v2.10.x — yeni faz):**
- Backlog #1: iOS/Safari cross-browser test (operatör manuel)
- Backlog #2: Buffet + Mise cloud sync (Supabase tablo + RLS + per-table sync wire)
- Backlog #3: Discover'a Tag + Allergen filter
- Diğer backlog için: HANDOVER.md §6

Her tur baseline: kapatılabilir inline guide + per-field hint + örnek placeholder + empty state onboarding (v2.8.77 buffet pattern). Dark mode kontrast otomatik (themes.css v2.9.4 universal rules).

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

**Sub-recipe ingredient flattening (v2.8.69).** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) recipe'in tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip). Her flattened item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. Bağlı 6 modül: portion.js (canvas + print + share), shopping.js (consolidation + by-recipe group), nutrition.js, allergens-db.js `recipeAllergens`, dashboard.js `computeDietCompat`. Yeni "tarif → ingredient listesi" ihtiyacında bu helper'ı kullan. Variance.js zaten kendi recursion'una sahip, dokunma.

**Lazy tool loading (v2.8.78).** Router'da 18 tool dinamik script tag ile lazy yüklenir. Eager kalanlar: **dashboard** (default home), **account** (auth flow), **inventory** (dashboard low-stock alert sync). `PCD.router.go(name)` lazy route varsa loading state → script load → routes[name] wire → render. Yeni tool eklerken: (a) eager mi lazy mi karar ver (default lazy), (b) `router.registerLazy(name, scriptPath, toolName)` ekle, (c) dashboard click handler kullanılıyorsa `_afterToolLoad(toolName, cb)` poll pattern'i (120ms × 3sn).

**xlsx + i18n lazy load (v2.8.78).** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) CDN'den ilk tıklamada yüklenir. `i18n.js` `setLocale()` async — sadece `en.js` boot'ta baseline; TR/ES/FR/DE/AR dinamik fetch. **API gotcha:** `PCD.toast.info()` return value pattern'i güvenli değil — v2.8.79'da "loading-toast remove" pattern kaldırıldı.

**Buffet item 3 tipte (v2.8.79).** `buffet.js` item'da `recipeId` / `ingredientId` / `customName` ayrımı: (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → cost=0. `computeItemCost` 3 path'e split, print/Excel üçünü de handle eder. Yeni computation eklerken her 3 path'i değerlendirme zorunlu.

**HACCP Hub konsolidasyon (v2.8.70).** 4 HACCP form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında landing widget ile yaşar. Mevcut 4 route DOKUNULMADI — bookmark + direct link korunur. Sidenav 18→15 item.

**Buffet + Mise + Team cloud sync (v2.9.17).** `buffets`, `mise_plans`, `team` tabloları artık waste/checklist_sessions array pattern'i ile cloud-synced. Soft-delete tombstone (`_deletedAt`), `queueArraySync` ile push, realtime aktif. Eski "IDB-only" notu STALE — silindi. Yeni array tablo eklerken: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES'a ekle.

**❌ CSP yok (v2.9.28'de REVERT).** `index.html`'de Content-Security-Policy meta TAG YOK. v2.9.24'te eklenmişti ama hCaptcha widget'ı tıklamaya cevap vermiyordu + Discover photo'lar yüklenmiyordu. v2.9.25-27 arası fix denemeleri (Cloudflare Insights ekleme, unsafe-eval, worker-src vb.) yetmedi → tam revert. Operatör solo kullanıcı, CSP eklemeden önce uçtan-uca test gerek.
**Tekrar denenirse:** Önce minimal CSP `default-src 'self'; script-src * 'unsafe-inline' 'unsafe-eval'; ...` ile başla, sonra her tightening adımında hCaptcha + Discover photo test et.

**❌ Discover photo sanitize yok (v2.9.28'de REVERT).** `discover.js`'de `safePhotoUrl()` helper kod tabanında duruyor ama HİÇ ÇAĞRILMIYOR. Photo URL'leri direkt CSS `background:url(' + d.photo + ')` pattern'i ile enjekte ediliyor (v2.9.23 behavior). XSS risk teorik + operatör scale'inde ihmal edilebilir. Gerekirse `safePhotoUrl(d.photo)` ile sarmak yeter — sade halde URL'leri olduğu gibi pass eder.

**recipe_likes RLS sıkı (v2.9.24, KORUNDU).** Anon scrape vector kapatıldı — `recipe_likes` SELECT artık sadece kendi like'larını okutur (`auth.uid() = user_id`). Public like count gerekirse `pcd_get_recipe_like_count(text)` RPC kullan (SECURITY DEFINER, aggregate-only, anon+authenticated EXECUTE). Recipes.like_count denormalized kolon zaten public, çoğu UI'da o kullanılıyor.

**🔴 hCaptcha "I am human" BROKEN (v2.9.28 revert sonrası dahi).** v2.9.26 onload pattern denendi → çalışmadı, v2.9.28'de v2.6.83 orijinal `script.onload` pattern'ine geri dönüldü → HÂLÂ çalışmıyor. Yani sorun v2.9.24-27 değişikliklerinden DEĞİL. Daha eski bir regresyon veya dış faktör. Yeni Claude bu sorunla geldiğinde **sıfırdan standart bir teşhis akışı çalıştır**: (1) `git log --all -- app/js/tools/account.js` ile hCaptcha-related tüm commit'leri çıkar, (2) hCaptcha sitekey `2a3e9f54-70aa-4078-a5b6-fec0e2266ac4` hCaptcha dashboard'da aktif + `prochefdesk.com` domain whitelist'te mi (operatöre doğrulat), (3) DevTools Network: `js.hcaptcha.com/1/api.js` + iframe (`newassets.hcaptcha.com`) request'leri başarılı mı? Console'da gerçek error var mı (cosmetic "should not render" warning hariç)? (4) Cloudflare Dashboard → Security → Bot Fight Mode / Browser Integrity Check / Super Bot Fight Mode hCaptcha'yı bloklayabilir — kontrol et, (5) Operatöre başka browser (Edge/Firefox) + incognito test ettir — issue browser-specific mi global mı? Tahmin yürütme; kanıt topla, sonra düzelt. **CSP veya custom render pattern eklemeye TEKRAR girişme** (önceki Claude denedi, üst üste 4 sürümde başarısız).

**Discover view count rate limit (v2.9.18).** `recipes.view_count` artık doğrudan RPC ile incremenetlenmez. `rate-limited-view` Edge Function üzerinden gider — header'dan IP çıkarır, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC çağırır, atomic insert-or-check ile 60dk window per (IP, recipe). `discover_view_logs` tablosu + saatlik `pcd-cleanup-view-logs` cron eski log'ları siler. Spam protection.

**Photo storage flow.** Recipe photo upload `photoStorage.upload(dataUrl)` → WebP re-encode @ 0.82 → Supabase Storage `recipe-photos/{userId}/{ts}-{rand}.webp` → public URL döner → `data.photo` set. Eski recipe'lerde data URL kalabilir (`data:image/...;base64,...`) — `migrateDataUrlPhotos()` housekeeping (üye boot'unda otomatik tetiklenir). **Race:** Photo upload promise async, save click submission o anda data.photo eski olabilir → cloud sync photo'suz gider. Operatör Discover'da photo görünmüyor raporlarsa: recipe'i editör'de aç → Save → 5sn bekle → Discover Refresh.

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
