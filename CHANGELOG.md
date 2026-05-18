# ProChefDesk — Sürüm geçmişi

**Mevcut sürüm:** v2.9.0 · 2026-05-19
**Blog:** 13 yazı yayında (Faz A: 3 SEO upgrade + Faz B: 10 yeni yazı)
**Marketing/SEO altyapısı:** 2026-05-18 (app sürümünden bağımsız)

Format: kronolojik tersine (en son sürüm üstte). Her sürüm kısa başlık + ana değişiklik özetleri. Tam teknik detay için ilgili commit message ve kod yorumlarına bakın.

---

## v2.9.x — NAKED araç sweep

Operatör vizyonu: her araç Buffet Planner seviyesinde RICH (kapatılabilir inline guide + per-field hint + stats hero + empty state CTA). Round 1 = yield + waste + variance.

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
