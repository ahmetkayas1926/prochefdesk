# ProChefDesk — Sürüm geçmişi

**Mevcut sürüm:** v2.10.3 · 2026-05-20
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

## v2.10.x — Whiteboard pro upgrade

### v2.10.3 — Diet sistemi komple kaldırma + Kitchen Cards dark mode fix · 2026-05-20

**1) Diet sistemi komple kaldırıldı (operatör A seçeneği):**

Operatör analizi: v2.8.45'te eklenen tri-state per-ingredient diet flagging sistemi (vegan/vegetarian/glutenFree/dairyFree) pratikte işe yaramıyordu. Conservative match (1 unflagged ingredient → tarif "?"); 46 tarif × 100+ ingredient için manuel flag'leme yorucu; allergens-db zaten ingredient adından gluten/dairy/nuts/fish auto-detect ediyor; vegan/vegetarian ayrımını operatör menüsünü zaten biliyor.

5 yer + 17 i18n key (× 2 dil) temizlendi:
- `recipes.js` — Recipes listesi tepesindeki "Free from" filter chips (vegan/vegetarian/gluten/dairy/nuts/fish) + `freeFromSet` state + filter logic + `paintFreeFrom()` + click handlers
- `recipes.js` — Recipe editor'deki "Diet compatibility" chip alanı (`#dietChips`) + `renderDietChips()` fonksiyonu + render call site
- `ingredients.js` — New/Edit Ingredient modal'daki "Diet flags" tri-state UI + `renderDietFlags()` + click handler + `data.dietFlags` default init
- `dashboard.js` — `computeDietCompat()` helper fonksiyonu + `PCD.recipes.computeDietCompat` export
- `menus.js` — Menu Builder'daki "Hide dietary badges" checkbox + `data.hideDietary` field + `dietaryBadges()` builder + `.m-diet` CSS + dietaryBadges call site
- `menus.js` — Allergen-safe print filter'da diet path (vegan/vegetarian seçenekleri) kaldırıldı; gluten/dairy artık allergen path'ine yönlendirildi (allergens-db.js zaten 'gluten' ve 'dairy' tag'lerini ingredient adından auto-detect ediyor — `wheat` / `un` / `milk` / `süt` keyword'leri). Net davranış aynı, daha temiz mantık.
- `en.js` + `tr.js` — `diet_vegan`, `diet_vegetarian`, `diet_gluten_free`, `diet_dairy_free`, `diet_nut_free`, `diet_fish_free`, `diet_yes`, `diet_no`, `diet_unknown`, `ingredient_diet_label`, `ingredient_diet_hint`, `recipe_diet_label`, `recipe_diet_hint`, `recipe_diet_no_ingredients`, `recipe_diet_unknown_tooltip`, `recipes_filter_free_from`, `menu_hide_dietary` — 17 key her dilde.

**Veri uyumluluğu:** Mevcut ingredient'ların `data.dietFlags` field'ı IDB+cloud'da kalır (silinmedi, sadece UI artık göstermiyor). Sub-recipe `flattenIngredients()` helper'ı korundu (portion/shopping/nutrition/variance/allergens 5 modül kullanıyor). `computeDietCompat` kaldırılınca uyumluluk kırılması yok — sadece `recipes.js`, `menus.js`, `discover.js` (zaten kullanmıyordu) kontrol edildi.

**2) Kitchen Cards dark mode fix (operatör raporu):**

Recipe list (RECIPES ON CANVAS) panelindeki recipe isimlerinin yazısı dark mode'da görünmüyordu — `.kc-recipe-row` label element'i bazı browser'larda parent --text inherit etmiyor. Fix `kitchen_cards.js:278` — `color: var(--text)` explicit set edildi.

Live preview konteyner'ı (kcPreview div) `background:#fff` hardcoded'tı — dark mode'da A4 sheet'in altında/sağında kalan boşluk beyaz görünüyordu. Fix: container bg `var(--surface)`, A4 sheet (`.kc-preview-frame`) kendi `#fff` inline bg'sini koruyor → cards print-WYSIWYG kalıyor + container theme'i respect ediyor.

### v2.10.2 — Kitchen Cards Orientation→Whiteboard sıçrama bug + segmented toggle active state · 2026-05-20

**1) KRITIK BUG: Kitchen Cards Orientation butonu Whiteboard'a atıyordu.**

Root cause: `router.js _renderView` aynı `#view` DOM node'unu tüm araçlar arasında yeniden kullanıyor (`view.innerHTML = ''` sadece içeriği siler, node hayatta kalır). `PCD.on(node, ev, sel, handler)` delegated listener'ları node'un `__pcdDelegated` property'sine attach ediyor. Whiteboard render'ı `PCD.on(view, 'click', '[data-orient]', ...)` çağırdığında listener `#view`'a yapıştı. Operatör Whiteboard'dan Kitchen Cards'a geçtiğinde:
- view DOM aynı kaldı, __pcdDelegated içindeki Whiteboard handler hayatta.
- Kitchen Cards orientation butonları (`data-orient="landscape|portrait"`) bodyEl'e kendi listener'ını ekledi.
- KC orientation tıklaması → event bubble eder: button → kcBody (KC handler çalışır) → view (Whiteboard handler ÇALIŞIR + `render(view)` çağırır) → view innerHTML Whiteboard içeriği olur → operatör Whiteboard'a "atılır".

Aynı bug ortağı `[data-paper]`, `[data-set-color]`, `[data-set-font]`, `[data-set-align]`, `[data-set-type]` selector'ları için de risk taşıyordu (KC'de bu selector'lar yok ama başka tool eklenince bug üretebilirdi).

Fix: Whiteboard render'ı tüm içeriği `<div id="wbRoot">...</div>` wrapper'ında topladı. 6 delegated listener `view` yerine `wbRoot`'a attach. Her Whiteboard render'ında wbRoot yeni bir DOM node → __pcdDelegated kalıntısı yok → tool switch'te listener bleed yok. Tek dosya değişti (`whiteboard.js`), diğer 24 tool dokunulmadı.

**2) Segmented toggle butonlarında "selected" görsel feedback (operatör request):**

Kitchen Cards'taki Orientation/Columns/Font size/Border thickness/Text weight, Whiteboard Paper/Orient, Inventory filter butonlarında `.active` class set ediliyordu ama CSS'te `.btn-secondary.active` rule'u yoktu — seçili buton görsel olarak diğerleriyle özdeş kalıyordu (operatör: "Thin'e bastım fark yok").

Fix `components.css:38-50`: `.btn-secondary.active` için brand-tinted treatment — brand-50 bg + brand-700 text + brand-600 border + inset 1px brand ring + font-weight 700 + hover brand-100. `.btn-group .btn.active` ayrı scope (kendi treatment'i korundu, dokunulmadı). Dark mode themes.css'in mevcut `--brand-50)` selector pattern'ine uyduğu için ek değişiklik gerekmedi.

**Etki:** 3 tool (Kitchen Cards 5 toggle grup × 3-9 buton, Whiteboard 2 toggle grup × 2 buton, Inventory 1 toggle grup × 3 buton) — toplam ~40 buton seçili durumunda artık net görünür.

**Test:**
1. Kitchen Cards → Orientation Portrait/Landscape — seçili buton yeşil çerçeve + light green bg + bold text
2. Kitchen Cards → Columns 1-9 — seçili sayı net görünür
3. Kitchen Cards → Font size XS/S/M/L → Border Thin/Medium/Thick → Text weight Normal/Medium/Bold — hepsi
4. **Kitchen Cards Orientation tıklama → Whiteboard'a SIÇRAMAZ** (kritik bug fix doğrulaması)
5. Whiteboard → Paper A4/A3 → Orient Portrait/Landscape — seçili görünür
6. Inventory → filter chip All/Low/Out — aktif yeşil

### v2.10.1 — HACCP bug fixes + Whiteboard drag-resize + 5 şablon + user templates + Kitchen Cards ince ayar · 2026-05-20

**Tek pakette 5 grup iş:**

**1) HACCP bug fixes (operatör v2.10.0 push sonrası rapor):**
- `haccp_logs.js printMonth` "Something went wrong" toast — `showFitWarning` değişkeni `render()` scope'unda tanımlıydı, `printMonth`'tan erişilemiyor (ReferenceError → global handler toast). Şimdi `FIT_LIMIT_PRINT` + `showFitWarning` local olarak printMonth içinde hesaplanıyor.
- `hcr_print_filled_month` + `hcr_print_filled_month_tip` + `hcr_recent_months` i18n key'leri eksikti (Receiving sayfasındaki "Bu ayı yazdır" butonu literal key string gösteriyordu). EN+TR eklendi.
- Cook & Cool + Hot/Cold Holding print row 19 → 20px + padding 2×4 → 3×4 + line-height 1.25 → 1.3 (Receiving pattern'iyle yakınlaştır, hücrede daha hava). A4 landscape hesabı: 33 row × 20px + header etc = 195mm, 7mm marj kalır. Tek sayfa garanti korunur.

**2) Whiteboard 5 yeni hazır şablon (toplam 11):**
- Hot Line Stations (4×5 landscape) — Sauté/Grill/Pass stations × Chef/Proteins/Sauces/Garnish (header type rows)
- Knife Cuts Reference (6×3 portrait) — Brunoise/Julienne/Mirepoix/Chiffonade/Concassé × Size/Use
- Daily Prep Checklist (6×3 portrait) — Stocks/Sauces/Protein/Garnish/Setup × By time + ☐ checkbox
- Service Recap (6×2 portrait) — Covers/No-shows/Top dish/86 items (bigNumber type ile)
- EU 14 Major Allergens (4×4 landscape) — 14 EU allerjen tek bakışta + cross-contact uyarı (header type)

**3) Whiteboard user templates (operatör isteği: "şef tasarımı tekrar kullanabilir"):**
- LS key `pcd_whiteboard_user_templates_v1` (array of {id, name, paper, orient, rows, cols, cells, savedAt})
- Templates picker'da yeni "💾 Save current canvas as template" butonu (üstte)
- 2 seksiyon: "Your templates" (kullanıcı kayıtlı) + "Built-in templates" (11 hazır)
- Her user template item'ında 🗑 Delete butonu (inline)
- "Apply" tıklayınca template yeni canvas olarak eklenir (mevcut canvas korunur)
- V1 LS-only; V2'de cloud sync (workspace tablo + sharing)

**4) Whiteboard drag-to-resize cell merge:**
- Her hücrenin sağ-alt köşesinde küçük resize handle (12×12px, hover'da görünür yarım üçgen)
- Cursor: nwse-resize
- mousedown → drag mode aktif, cellEl `.wb-resizing` class (yeşil dashed outline)
- mousemove (document) → real-time grid-row/grid-column span güncelle (preview)
- mouseup → commit (rowSpan/colSpan persist + full re-render)
- Grid bounds clamp: 1 ≤ span ≤ remaining cells
- Module-level _wbDrag state + document listener bir kez attach (render duplicate listener engellenmiş)
- Sağ-tık popover'daki manuel span input'lar da çalışmaya devam eder (alternatif giriş)

**5) Kitchen Cards Border + Body Weight ince ayar (operatör raporu):**
- Border thickness Thin (0.5pt) vs Medium (1pt) ayırt edilmiyordu — print 96 DPI'da ikisi de 1px'e yuvarlanıyor → görsel olarak özdeş. **0.5 / 1.5 / 3 pt** spread'i: clean 1/2/4 px üç farklı kalınlık.
- Bold body weight canvas preview'da görünüyor, print/PDF'te görünmüyordu — 7-8pt küçük punto'da Segoe UI'nın 600 + 700 ağırlığı stroke farkı print'te belirsizleşiyor. **400 / 700 / 900** ladder'ı: Regular / Bold / Black — her ağırlık net belli olur.
- Tek satır fix `kitchen_cards.js:994-995` (borderWidths + bodyWeights map'leri). v2.10.0 mimari korundu, sadece sayısal kontrast artırıldı.

**i18n:** 11 yeni key EN+TR (5 yeni şablon adı + user template metinleri).

**Test akışı:**
1. Fridge & Freezer Log print → artık "Something went wrong" yok, PDF çıkar
2. Receiving sayfası → "Bu ayı yazdır" butonu doğru görünür (i18n çevirisi)
3. Cook & Cool + Holding print → row biraz daha geniş, içerikte daha hava
4. Whiteboard → Templates butonu → 11 hazır + "Save as template" + "Your templates" seksiyonu
5. Bir canvas hazırla → "Save current as template" → isim ver → Templates'te görünür
6. Hücreye hover → sağ-alt köşede yarım üçgen handle → tıkla + drag → real-time span preview → bırak → commit
7. v2.10.0 cell type/font/align/color hepsi korunur
8. Kitchen Cards → Border thickness 3 toggle (Thin/Medium/Thick) → print preview'da 3 farklı kalınlık net görünür
9. Kitchen Cards → Body weight 3 toggle (Normal/Medium/Bold) → print preview'da 3 farklı ağırlık net görünür

### v2.10.0 — Whiteboard professional visual upgrade · 2026-05-20
Operatör direktifi: "verdiğim örnek index dosyası harika görünüyordu... mevcut çok ilkel". Whiteboard'ı operatörün kitchen guide A3 HTML örneğine yakın profesyonel görünüme yükseltiyor: tipografi + zengin renk paleti + cell type widget sistemi.

**1) Tipografi (Oswald + Barlow Google Fonts):**
- Whiteboard sayfası için Oswald (başlık) + Barlow (gövde) Google Fonts @import (sadece whiteboard view scope'unda, diğer sayfalar etkilenmez).
- Live preview + Print template ikisinde de aktif.
- Default cell font Barlow; header type cell'leri Oswald (operatörün örneğinde "COOKING / REHEATING / KATMER" başlıkları gibi).

**2) Renk paleti zenginleştirildi (7 → 14 renk):**
- Neutrals: White / Cream / Paper / Ink / Dark
- Brand: Forest (deep editorial) / Brand Green / Mint
- Warm: Steak Red / Soft Red / Soft Amber / Katmer
- Cool: Reheat Teal / Cool Blue

Operatörün örneğindeki mutfak-grafiği tonları: steak red `#a23b2d`, reheat teal `#1f6f6b`, katmer amber `#9a6a16`, deep forest `#2d4a3e`, paper cream `#fbf7ef`. Sağ-tık popover'ında 14 renk butonu — chip palette.

**3) Cell type sistemi (yeni 5 widget):**
Cell.type field ile her hücre farklı görsel rolde çalışır. Sağ-tık menüsüne yeni "Cell type" picker (Text / Header / Number / List / Label).
- `text` (default) — mevcut serbest metin
- `header` — Oswald + 800 weight + uppercase + letter-spaced + center. Operatör örneğinde "COOKING", "REHEATING" tarzı section başlıkları
- `bigNumber` — 900 weight + tabular-nums + center. Operatör örneğinde "75°C" panel başlığı, "8 min" pişirme süresi
- `list` — bullet liste (padding-left + text-indent ile satır içi madde işareti). Operatör "Add Salt To" listesi tarzı
- `twoLine` — CSS `::first-line` ile ilk satır small uppercase label (0.55em + 700 weight + letter-spaced), sonraki satırlar normal değer. Operatör "TIME / 8 min" tarzı label-value pairs

Type değişimi `data-set-type` event → full re-render (typeStyleFor inline style + CSS class).

**4) Live preview ↔ Print birebir:**
Hem live editor hem PDF print Oswald/Barlow tipografisini, 14 renk paletini, 5 cell type'ı aynı şekilde uygular. Şefin ekranda gördüğü her şey aynı PDF olarak çıkar (WYSIWYG).

**i18n:** 6 yeni key (whiteboard_cell_type + wb_type_text/header/bignum/list/twoline), EN + TR.

**Test:**
1. Whiteboard → boş canvas yarat → 6×4 grid yap
2. Sol üst hücreye sağ tık → "Cell type" → "Header" → uppercase Oswald bold görünür
3. Hücre rengi → "Steak Red" → kırmızı bg + beyaz text
4. Sağ taraftaki bir hücreye → "Cell type" → "Number" → büyük font, tabular-numbers
5. Alttaki bir hücreye → "Label" → ilk satır small uppercase, ikinci satır normal değer
6. Print → A4/A3 PDF → aynı tipografi + renk + tip görünür

**Sıradaki (v2.10.x devamı):**
- Whiteboard drag-to-resize cell merge (mouse drag ile span ayarı)
- Pre-built widget palette (doneness ladder / equipment bar / spec sheet sections)
- Kullanıcı kendi şablonunu kaydetme

### v2.9.42 — Kitchen Whiteboard cloud sync (workspace-scoped) · 2026-05-19
v2.9.40+'da LS-only başlayan Whiteboard tool şimdi cloud sync: çoklu cihaz + workspace-scoped (her restoran kendi kanvas listesi). Operatör isteği: "şef özel tasarımı başka restoran için tekrar kullanabilir, sadece içindeki yemek bilgilerini değiştirerek".

**Yeni Supabase tablosu (buffets/mise_plans/team pattern'i ile birebir):**
- `whiteboards` (workspace-scoped, isArray)
- id text PK, user_id uuid, workspace_id text, data jsonb, created_at, updated_at, deleted_at
- 4 RLS policy (select/insert/update/delete) — `auth.uid() = user_id`
- updated_at trigger (`pcd_set_updated_at`)
- Realtime publication
- REPLICA IDENTITY FULL (DELETE event payload için)
- Cascade triggers güncellendi: `cascade_soft_delete_workspace_data` + `cascade_restore_workspace_data` fonksiyonları whiteboards'i de cascade'liyor (21 → 22 ws-bound tablo)

**Migration:** `migrations/v2.9.42-whiteboards-cloud-sync.sql` — operatör Supabase Dashboard SQL Editor'da çalıştırır.

**Frontend wire (7 dosya değişti):**
- `app/js/core/cloud-pertable.js` — `WORKSPACE_TABLES` mapping: `whiteboards: { stateKey: 'whiteboards', wsScoped: true, isArray: true }`
- `app/js/core/cloud.js` — drift detection wsTables listesine 'whiteboards' eklendi (ghost-workspace audit)
- `app/js/core/cloud-realtime.js` — applyChange switch + WS_BOUND_TABLES + TABLES subscribe listesine 'whiteboards' eklendi
- `app/js/tools/whiteboard.js` — LS-only state → store.js + cloud sync (`queueArraySync` ile push). LS migration: eski `pcd_whiteboard_canvases_v2` ve `pcd_whiteboard_v1` ilk boot'ta workspace cloud'a aktarılır. Active canvas id `prefs.whiteboardActiveId` (cloud-synced user_prefs)
- Soft-delete tombstone pattern: canvas Delete'lendiğinde `_deletedAt: nowIso()` set, queueArraySync DELETE upsert üretir, realtime ile diğer cihazlara cascade
- `supabase/functions/backup-to-r2/index.ts` — BACKUP_TABLES'a 'whiteboards' eklendi (nightly R2 archive)
- `app/js/core/config.js` — APP_VERSION 2.9.41 → 2.9.42

**Operatör manuel iş:**
1. Migration: Supabase Dashboard → SQL Editor → `migrations/v2.9.42-whiteboards-cloud-sync.sql` → Run
2. Edge function re-deploy: `supabase functions deploy backup-to-r2` (BACKUP_TABLES güncellendi)
3. Push frontend → Cloudflare deploy

**Test akışı:**
1. Push + migration sonrası whiteboard'a gir → mevcut LS canvas'ları workspace'in cloud'una aktarılır
2. İkinci cihazda aynı kullanıcı ile login → workspace seç → aynı whiteboard'lar görünür
3. Bir cihazda canvas oluştur → 1-2 sn içinde diğer cihazda realtime ile gelir
4. Workspace switch → o ws'in kendi whiteboard listesi (operatör use case: restoran A vs restoran B)
5. Trash'ten workspace restore → canvas'lar cascade ile geri gelir

### v2.9.41 — Whiteboard cell merge (rowspan/colspan) · 2026-05-19
v2.9.40 push edildi, devam: Whiteboard'a operatörün ilk spec'inde olan "hücre boyutu özelleştirilebilir" özelliği eklendi. Sağ-tık menüsünde **row span + col span sayı input'ları** + Reset butonu. Hücre 2×3 yapılınca komşu 5 hücreyi kaplar (içeriği korunur ama görüntüde kapanır), unmerge edilince geri gelir.

**Değişiklik (whiteboard.js):**
- Cell state: `rowSpan` ve `colSpan` field'ları (default 1)
- Live preview render: occupied position map pre-compute (spanning cell'in kapladığı koordinatlar); occupied cell'ler render atlanır; spanning cell'e `grid-row: r+1 / span rs; grid-column: c+1 / span cs;` inline style
- Print template: aynı occupied skip + span pattern (live preview ile birebir)
- Sağ-tık menüsü genişledi: renk + font size + align + **merge (row × col)** + Reset
- Span input'lar 1..10 clamp; grid bounds dışına taşma engellendi
- Change event: render(view) full re-render (komşu hücreler reflow olur)

**i18n:** 2 yeni key (whiteboard_cell_merge / whiteboard_cell_unmerge), EN + TR.

**Test:** Whiteboard → grid 4×6 → bir hücreye sağ tık → "Merge (span)" alanında ↓ 2, → 3 yaz → hücre 2×3 olur, 5 komşu cell saklanır → Reset → tek hücreye döner. Print PDF aynı merge'i gösterir.

### v2.9.40 — HACCP Forms toplu elden geçirme + Kitchen Cards 3 alt-iş · 2026-05-19
Tek pakette iki bağımsız iş kümesi (operatör: "tek seferde push").

---

**Kısım 1: HACCP Forms toplu elden geçirme**

Operatör direktifi: "tek seferde bütün HACCP Forms alanını elden geçir, mevcut sorunları tamamla". 5 yapısal düzeltme:
Operatör direktifi: "tek seferde bütün HACCP Forms alanını elden geçir, mevcut sorunları tamamla". 5 yapısal düzeltme tek pakette:

**1) HACCP Hub guide kısaltıldı (haccp.js):**
4-adım liste + Pro tip = 12 satır → tek paragraf (`haccp_hub_guide_short` i18n key). Mevcut detaylar zaten chip/kart/audit hint'inde var; uzun guide bilgi gürültüsüydü.

**2) Fridge & Freezer Log (haccp_logs.js):**
- `FIT_LIMIT: 6 → 9` — operatör spec: 10+ unit'te uyarı çıksın, 9'da çıkmasın.
- Print row count: ay uzunluğu (28/30/31) → **sabit 31** (ay kısaysa son satırlar boş kalır, Cook & Cool pattern'i).
- Print template: A4 sized body (297×210mm) + flex column + colgroup widths + row height **14px → 19px** + font **9px → 11px** + compact `.pcd-print-footer` override. Tek sayfa garanti, sayfa altındaki boşluk israfı bitti.

**3) Hot/Cold Holding (haccp_holding.js):**
- Sabit `TARGET_HOT_C = 60` + `TARGET_COLD_C = 5` → **`targetHotC()` + `targetColdC()`** fonksiyonları (PCD.haccp.getThresholds() ile region-aware). 14 yer wire.
- Print template aynı Cook & Cool pattern (A4 sized body + colgroup + row 19px + compact footer). PDF'te alt yarısı boştu, artık satırlar büyük ve düzgün yerleşir.

**4) Receiving Log (haccp_receiving.js):**
- Hardcoded `≤5°C / ≤-18°C / ≥60°C` print template → **region-aware** `rcvHotMinC()` / `rcvColdMaxC()` / `rcvFrozenMaxC()` helper'lar.
- Print template Cook & Cool pattern: A4 sized body + colgroup (DAY 3% dar + supplier/product geniş + USE-BY kompakt 9% + NOTE genişçe 22%) + row 19px + compact footer. Footer ikinci sayfaya taşımıyor.
- "Boş yazdır" (günlük blank) butonu kaldırıldı. Sadece "Aylık boş" + "Bu günü yazdır" kalır (operatör spec).

**5) Tüm form'lardaki print pattern v2.9.31-34 birleşik:**
- `body { width:297mm; height:210mm; display:flex; flex-direction:column; }`
- `.h-sheet { flex:1 1 auto; padding:4mm; display:flex; flex-direction:column; }`
- `<colgroup>` her kolonu açıkça width tanımlar (table-layout:fixed mode'da td width'leri ignore edilir).
- `.pcd-print-footer { margin:0; padding:1mm 4mm; font-size:7pt; }` PCD.print otomatik footer kompakt.
- `@page { size:A4 landscape; margin:0; }` — sayfa kenar boşluğu sıfır, .h-sheet kendi padding'i ile.

**ERTELENDİ (büyük UI rewrite):**
Operatör'ün "Receiving canlı doldurma aylık olsun" isteği. Mevcut günlük + ROW_PER_PAGE=15 → aylık + 31 row template (Cook & Cool gibi monthYM + rowIndex pattern). Bu state mantığı + UI baştan yazımı. Bu pakete sığmadı, v2.9.41+'de ayrı sürüm. Şimdilik mevcut günlük UI duruyor + print template aylık zaten çalışıyor.

---

**Kısım 2: Kitchen Cards 3 alt-iş (operatör isteği)**

Operatör önceki tur "Kitchen Cards canvas önizlemesinde alt boşluk + recipe çerçevesi + yazı ağırlığı" üç alt-iş tanımladı. Hepsi tek pakette.

**(a) Alt boşluk verimli kullanım:**
- `.kc-sheet padding: 2mm → 1.5mm`
- `.kc-sheet column-gap: 2mm → 1.5mm`
- `.kc-block margin-bottom: 2mm → 1mm`
Algoritma değişmedi (mevcut akış: card'lar sütunda akar, sığabildiği yere yerleşir). Sadece pixel/mm boşluklar kırpıldı. Aynı sayfaya **15-20% daha fazla kısa recipe** sığar.

**(b) Çerçeve kalınlığı seçimi (yeni state):**
- Canvas state'e `borderWidth: 'thin' | 'medium' | 'thick'` (default 'thin')
- 3-toggle UI font-size satırının altında
- buildSheetHtml CSS: `.kc-block { border: <0.5/1/1.5>pt solid #1f2937; }`
- Canvas save/load + share snapshot/restore yollarına geçiş
- Canvas önizlemesinde anında görünür

**(c) Yazı ağırlığı seçimi (yeni state):**
- Canvas state'e `bodyWeight: 'normal' | 'medium' | 'bold'` (default 'normal')
- 3-toggle UI border'ın altında
- buildSheetHtml CSS: `.kc-ings { font-weight: <400/600/700>; } .kc-method { font-weight: <400/600/700>; }`
- Aynı save/load/share path'leri
- Canvas önizlemesinde anında görünür

**i18n:** 8 yeni key (kc_border_width / kc_border_thin/medium/thick + kc_body_weight / kc_weight_normal/medium/bold), EN + TR.

**Test:** (1) Kitchen Cards aç, canvas paneline yeni 2 toggle satırı (Çerçeve kalınlığı + Yazı ağırlığı). (2) Toggle değiştir → canvas önizlemesi anında güncellenir. (3) Save Canvas → reload → seçimler korunur. (4) Yazdır → PDF'te border + weight uygulanmış. (5) Aynı kanvasta daha kompakt yerleşim, sayfa altında daha az boşluk.

---

---

**Kısım 3: Receiving aylık view UI rewrite**

Operatör direktifi: "canlı doldurma günlük olarak mevcut. bunun aylık olması gerekiyor. diğer formlardaki gibi". Receiving Log mevcut UI günlük view + day picker. Şimdi Cook & Cool pattern'ine geçirildi.

**Değişiklik (haccp_receiving.js):**
- `_viewDate` → `_viewMonth` (yyyy-mm) — global state
- `listForDate(dateStr)` → `listForMonth(monthYM)` — filter `r.date.startsWith(monthYM)`
- `ROWS_PER_PAGE: 15 → 31` (ayda max 31 teslimat row template)
- Day picker → **Month picker** (prev/next/this month + monthLabel)
- Recent days → **Recent months** quick jump chips (top 6)
- Tablo "#" column → **"DAY" column** (3-char width, ayın günü)
- Editor modal: yeni **"Day" select** (1..ay-uzunluğu) — kullanıcı kayıtın hangi gün olduğunu seçer. Default: aktif ay bugün ise bugünün günü, geçmiş ay ise 1.
- Save: `data.date = _viewMonth + '-' + paddedDay`
- "Bu günü yazdır" → **"Bu ayı yazdır"** (`printMonthFilled(_viewMonth)`)
- Yeni `printMonthFilled(monthYM)` function (Cook & Cool monthly-filled pattern): 31 row + dolu satırlar `byRow[rowIndex]`'ten, boş satırlar empty
- Backward compat: eski kayıtlar `r.date` (YYYY-MM-DD) formatında — `recordMonthYM(r)` `r.date.slice(0,7)` ile uyumlu, migration gerekmez

---

**Kısım 4: Kitchen Whiteboard MVP V1 (yeni tool)**

Operatör direktifi (3. ana görev): özelleştirilebilir A4/A3 referans gridi (cooking times, plating weights, reheating, allergen reminders için). Permanent-marker laminated board'un ProChefDesk içi karşılığı. V1 (bu pakette) çekirdek özellikler; V2'de gelişmiş özellikler (çoklu kanvas, şablonlar, hücre birleştirme).

**Yeni dosya:** `app/js/tools/whiteboard.js` (~280 satır)
**Yeni sidenav entry:** "Mutfak Beyaz Tahtası" — KITCHEN bölümünde, Kitchen Cards yanında
**Router:** `registerLazy('whiteboard', 'js/tools/whiteboard.js', 'whiteboard')`

**V1 özellikleri:**
- Tek kanvas (localStorage'da auto-save, key `pcd_whiteboard_v1`)
- Title input (üst yeşil bant)
- Paper: A4 / A3 toggle
- Orientation: Portrait / Landscape toggle
- Grid: 2..10 satır × 2..10 sütun (number input)
- Cells: contenteditable (tıkla, yaz)
- Renk: 7-renk palet (white/cream/green/red/amber/blue/dark). Sağ tıkla hücreye → palet popover → seç → cell bg+text rengi değişir
- Print: PCD.print, gerçek A4/A3 + portrait/landscape print pattern
- Reset butonu: tüm kanvasi varsayılana döndür (confirm modal)

**V2'ye ertelendi:**
- Çoklu kayıtlı kanvas (Kitchen Cards canvas pattern gibi)
- Cell birleştirme (rowspan/colspan)
- Özel widget'lar (doneness ladder / büyük sayı / list)
- Hazır şablonlar (cook times / plating / salt list / reheating)
- Cloud sync (şu an LS-only single device)

**i18n:** 12 yeni key (nav_whiteboard + whiteboard_*), EN + TR.

---

**Genel test:** Tüm 4 HACCP form + Kitchen Cards yeni 2 toggle + Receiving aylık view + Whiteboard tool. Sidenav'da yeni "Mutfak Beyaz Tahtası" entry'si.

---

**Kısım 5: Whiteboard genişletme (çoklu kanvas + 7 şablon) + Photo race fix**

**Whiteboard çoklu kanvas (operatör isteği: "şef özel tasarımı başka restoran için tekrar kullanmak isteyebilir"):**
- State şeması yeniden yapılandı: `{activeId, canvases:[...]}` array pattern. Eski single-canvas `pcd_whiteboard_v1` ilk yüklemede otomatik `canvases[0]` olarak migrate edilir, sonra eski key silinir.
- Yeni UI çubuğu (başlık altında): **Canvas dropdown** (kayıtlı kanvaslar listesi) + **+ New** (boş canvas yarat, isim "New whiteboard N") + **🗑 Delete** (sadece >1 canvas varsa görünür, confirm modal)
- Title input artık iki amaçlı: hem print başlığı hem dropdown'daki canvas adı. Tek alan, basitlik.
- Şablon seç → mevcut canvas üzerine yazmaz, **yeni canvas olarak ekler**. Şef şablonu temel alıp özelleştirebilir.

**Whiteboard 7 hazır şablon (operatör: "birkaç farklı tarzda ve tasarıma sahip örnekler"):**
1. "Cooking Times & Core Temps" — 4×6 landscape, protein × parametre matrisi
2. "Plating Weights" — 7×2 portrait, dish × weight liste
3. "Reheating Guide" — 3×4 landscape, item × time/temp/notes
4. "Allergen Quick Reference" — 5×3 portrait, dish × allerjen × not (kırmızı vurgu)
5. "Cleaning Schedule" — 4×5 landscape, area × daily/weekly/monthly + check column
6. "Service Briefing" — 6×2 portrait, topic × notes (specials / 86 list / VIP / new items / reminders)
7. (Yeni boş canvas her zaman seçenek)

Şablonlar menüsü kanvas yöneticisinin yanında. Tıkla → yeni canvas olarak grid + cells + renkler dolar, activeId set, sayfa yeniler.

**Whiteboard cell-bazlı font-size + text-align (per-cell styling):**
Sağ-tık menüsü genişletildi: renk paleti + **font-size** (S/M/L/XL: 11/14/20/28px) + **text-align** (sol/orta/sağ) — her hücre kendi seviyesinde özelleştirilebilir. Başlık satırı için XL + center, sayı hücreleri için L + center, not hücreleri için M + start gibi profesyonel layout'lar mümkün. Print template aynı per-cell stil'i uygular.

**Photo race fix (recipes.js):**
CLAUDE.md'de "Race" başlığı altında bilinen sorun: Photo upload async, save click eski `data.photo` ile cloud sync yapar → Discover'da photo görünmez (operatörün tekrarlayan raporu).
- `handlePhotoFile` artık `data._pendingPhotoUpload` field'ına Promise atar
- Save handler bu field varsa: **Save butonu disable + toast "Photo uploading"** + promise resolve olunca otomatik `saveBtn.click()` re-trigger
- Kullanıcı Save'i tıklarsa upload bitmiş gibi davranır — cloud sync doğru URL alır
- Workaround "5sn bekle, Discover Refresh" artık gereksiz
- Yeni i18n key `photo_wait_upload` EN+TR

**Photo race fix (recipes.js):**
Operatör'ün CLAUDE.md'de bilinen "Race" issue'su (Photo upload async, save click submission o anda data.photo eski olabilir → cloud sync photo'suz gider → Discover'da photo görünmez):
- `handlePhotoFile` artık `data._pendingPhotoUpload` field'ına Promise atar
- Save handler bu field'ı kontrol eder: varsa **save butonu disable + toast 'Photo uploading'** + promise resolve olunca otomatik `saveBtn.click()` re-trigger
- Kullanıcı Save'i tıklarsa photo upload bitmiş gibi davranır — backend cloud sync'e doğru URL ile gider
- Yeni i18n key `photo_wait_upload` EN+TR

Workaround "5sn bekle, Discover Refresh" artık gereksiz.

### v2.9.39 — HACCP Hub kart desc'lerinden hardcoded eşik temizliği · 2026-05-19
v2.9.38 persist'i çalışıyor (operatör onayladı), AMA kart altlarında hâlâ eski hardcoded sayılar görünüyordu: "Monthly cooling chart — 60°C → 21°C → 5°C" + "Bain-marie ≥63°C, cold display ≤5°C". US (FDA) bölgesi seçilince ana chip 57°C gösteriyor ama alt kartlardaki 60°C/63°C eski sayılar kalıyor → kafa karıştırıcı + tutarsız.

Operatör direktifi: "ya bunlardan derece bilgisini kaldır, sadece ne işe yaradığını açıklayan HACCP standart açıklamasını yaz".

**Değişiklik (haccp.js + en.js + tr.js):**
- `haccp_hub_card_cooling_desc`: "Monthly cooling chart — 60°C → 21°C → 5°C" → **"Cooked food cooling — 2-stage verification"** / "Pişmiş yemek soğutma — 2 aşamalı doğrulama"
- `haccp_hub_card_holding_desc`: "Bain-marie ≥63°C, cold display ≤5°C" → **"Bain-marie hot holding · cold display"** / "Sıcak tutma (bain-marie) · soğuk teşhir"
- Logs + Receiving desc'lerinde zaten sayı yoktu, dokunulmadı.

**Sonuç:** Tek bakışta eşik değerleri **sadece üst chip'te** ("🔥 ≥57°C · ❄ ≤5°C · 🧊 ≤-18°C · ⏱ 57°→21°/2h→5°/6h"). Alt kartlar **iş tanımı** yapar, sayı tekrarlamaz. Bölge değişince tutarsızlık olasılığı sıfır.

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
