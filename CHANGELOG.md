# ProChefDesk — Sürüm geçmişi

**Mevcut sürüm:** v2.9.23 · 2026-05-19
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
