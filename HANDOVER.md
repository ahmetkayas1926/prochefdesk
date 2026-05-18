# ProChefDesk — Operasyon Handover

> **Bu dokümanın amacı:** Yeni Claude session'ında hızlı devralma. Kabul et, varsayma. Önce oku, sonra çalış.
>
> Claude Code için kısa operasyonel rehber: **`CLAUDE.md`**.

## 1. Genel

**Ürün:** ProChefDesk — profesyonel chef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya, Perth Western Australia, profesyonel şef. Solo non-commercial proje.
**Mevcut sürüm:** **v2.8.84** (push'a hazır local; production v2.8.79).
**Domain:** prochefdesk.com (Cloudflare Pages, SSL Full, GitHub push'ta auto build + deploy).

**URL yapısı:**
- `prochefdesk.com/` → landing page
- `prochefdesk.com/app/` → app (login + tüm araçlar)
- `prochefdesk.com/privacy.html`, `/terms.html` → 6 dil, app'ten bağımsız stil
- Eski paylaşım linkleri (`prochefdesk.com/?share=xxx`) → JS sniffer ile `/app/?share=xxx`'e otomatik redirect

**Repo:** `C:\Users\ahmet\Desktop\prochefdesk` → GitHub: `ahmetkayas1926/prochefdesk` → Cloudflare Pages auto-deploy.

## 2. Mevcut Durum

**Ürün canlı ve aktif kullanımda.** Operatör profesyonel şef olarak kendi restoranının gerçek tariflerini sisteme yüklemiş, gündelik mutfak operasyonunda kullanıyor.

Yeni Claude'un bilmesi gereken: **bu hâlâ tek kullanıcılı bir ürün** — operatör + birkaç yakın şef arkadaşı. Roadmap'te 50+ aktif kullanıcı + %40 retention hedefine ulaşmadan paid tier / büyük marketing yatırımı yapılmıyor.

## 3. Frontend Stack

- Vanilla JavaScript, no bundling, no service worker
- ~24,000+ satır JS + ~7,700 satır i18n
- IndexedDB ana storage (write-only, v2.6.92'den beri)
- PWA (Android Chrome'da install ✅, iOS Safari **test edilmedi**)
- 6 dil i18n (EN/TR/ES/FR/DE/AR), sadece EN ve TR dolu. Diğer 4 dil EN fallback ile çalışıyor. Yeni i18n key sadece **en.js + tr.js**'e eklenir.
- **Cache-busting (v2.8.0+):** `app/index.html`'de `?v=__VERSION__` placeholder'ları (49 yerde). Cloudflare build command (`node build.js`) `app/js/core/config.js`'teki `APP_VERSION` ile replace eder. Sürüm bump'ı **sadece config.js**'i değiştirir.

### Repo dosya yapısı

**Repo kök:**
- `index.html` — Landing page (modern SaaS, ~600 satır, Inter/Fraunces font, app paletiyle uyumlu)
- `privacy.html`, `terms.html` — 6 dil, app'ten bağımsız stil
- `build.js` — Cache-busting injection
- `app/` — uygulama
- `migrations/` — 14 SQL migration
- `supabase/functions/` — 3 Edge Function (deployed)
- `supabase-functions/` — **duplicate klasör** (eski organizasyon kalıntısı), `supabase/functions/delete-account/` ile identical, repoda hiç referans yok. Operatör Supabase Dashboard'dan deploy doğrulaması yapmadan silmedi. **Yeni Claude bu konuyu açmasın.**
- `docs/DISASTER_RECOVERY.md` — restore prosedürü (prod'da test edildi)
- `CLAUDE.md` — Claude Code rehberi (kısa, operasyonel)
- `HANDOVER.md` — bu dosya
- `CHANGELOG.md` — sürüm geçmişi

**`app/js/core/` (16 modül):**
allergens-db.js, app.js, auth.js, cloud-pertable.js, cloud-realtime.js, cloud.js, config.js, i18n.js, idb-wrapper.js, photo-storage.js, qr.js, router.js, share.js, store.js, utils.js, variance.js

**`app/js/tools/` (24 araç):**
account.js, allergens.js, checklist.js, dashboard.js, events.js, haccp_cooling.js, haccp_logs.js, ingredients.js, inventory.js, kitchen_cards.js, menu_matrix.js, menus.js, nutrition.js, portion.js, recipes.js, sales.js, shopping.js, suppliers.js, team.js, tools-hub.js, variance.js, waste.js, whatif.js, yield.js

**Kullanıcıya görünen 10 ana tool:** Recipes (live food cost), Ingredients, Menu Builder, Kitchen Cards (A4 print), Portion Calculator, Shopping List, Inventory, Suppliers, Events & Catering, Checklists & HACCP.

## 4. Cloud / Backend (Supabase)

**Project ref:** `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, **Free tier**)

### 25 Aktif tablo

**Workspace-scoped (18):** recipes, ingredients, menus, events, suppliers, canvases, shopping_lists, checklist_templates, inventory, waste, checklist_sessions, stock_count_history, haccp_logs, haccp_units, haccp_readings, haccp_cook_cool, **haccp_receiving** (v2.8.44), **haccp_holding** (v2.8.44)
> Hepsinde `workspace_id` + `user_id` PK, `data` jsonb, `deleted_at` timestamptz.

**Top-level (7):** workspaces (flat schema, jsonb yok), workspace_tombstones, user_prefs, public_shares, client_errors (insert-only), subscriptions (premium için boş), **recipe_likes** (v2.8.46, Discover Phase 2 — PK = `(recipe_id, user_id)` native 1-per-user enforcement; trigger `pcd_update_like_count` recipes.like_count'u senkron tutar).

**Sadece IDB (cloud sync YOK):** `buffets` (v2.8.73), `misePlans` (v2.8.74). Sonraki round'da Supabase tablosu + RLS + per-table sync wire (backlog #18).

**DROP edilmiş:** `user_data` (v2.6.87), `cost_history` (v2.6.88). Frontend referansları temizlendi.

**Discover ek kolonlar (v2.8.46):** `recipes` tablosuna `view_count` + `like_count` integer kolonları (denormalized hızlı okuma, trigger ile senkron) + 2 partial index (public order by DESC). Anonymous + authenticated için yeni RLS policy: `data->>'isPublic' = 'true'` herkese SELECT açık (owner-only policy korunur, PostgreSQL UNION mantığı).

### Cascade trigger zinciri (v2.6.98 + v2.7.0)

| Trigger | Olay | İş |
|---|---|---|
| `trg_cascade_workspace_tombstone` | INSERT on workspace_tombstones | `cascade_soft_delete_workspace_data()` → 16 tablo + workspaces deleted_at SET |
| `trg_reverse_cascade_workspace_tombstone` | DELETE on workspace_tombstones | `cascade_restore_workspace_data()` → 16 tablo + workspaces deleted_at NULL |

### DB Function'ları

- `cascade_soft_delete_workspace_data()` (v2.6.98)
- `cascade_restore_workspace_data()` (v2.7.0)
- `pcd_cleanup_old_deleted()` (v2.6.97) — 30 gün eski soft-deleted satırları siler
- `pcd_purge_workspace()` (v2.7.6) — Trash UI "Delete forever" için atomik silme

### 3 Aktif pg_cron Job

| Job | Schedule (UTC) | Süre limit |
|---|---|---|
| nightly-backup-to-r2 | 03:00 her gün | 60sn (v2.7.8'de yükseltildi) |
| pcd-cleanup-old-deleted | 03:00 her gün | — |
| pcd-cleanup-photos-weekly | Pazar 04:00 | — |

### Realtime: 21 tablo subscribed

canvases, checklist_sessions, checklist_templates, events, haccp_cook_cool, haccp_logs, haccp_readings, haccp_units, **haccp_receiving** (v2.8.44), **haccp_holding** (v2.8.44), ingredients, inventory, menus, recipes, shopping_lists, stock_count_history, suppliers, user_prefs, waste, workspace_tombstones, workspaces.

> **CHANNEL_ERROR çözüldü:** v2.8.43 — explicit `realtime.setAuth(token)` + `TOKEN_REFRESHED` dinleyici. Multi-device canlı sync güvenilir (özellikle uzun açık tutulan oturumlar). 1-saatlik token refresh sonrası otomatik re-setAuth yapılıyor.

### 3 Edge Function (deployed)

- `backup-to-r2` — v3 (2026-05-06, v2.8.79'da BACKUP_TABLES array'ine `haccp_receiving` + `haccp_holding` eklendi). 25 per-table tabloyu jsonl olarak R2'ye yazar (`<YYYY-MM-DD>/<table>.jsonl` + summary.json + photos-manifest.json). 30-day retention. **Foto bytes'ı yedeklenmiyor**, sadece manifest — Supabase Storage kaybı = foto kaybı (kabul edilebilir trade-off, Pro tier'a geçince Storage PITR var). **Deploy gerek (operatör):** `supabase functions deploy backup-to-r2`. Aksi halde v2.8.79 öncesi sürüm canlı kalır — `haccp_receiving` + `haccp_holding` cloud sync olmuş ama R2 nightly archive'da yok (disaster recovery boşluk).
- `cleanup-photos` — Storage orphan foto temizliği. `x-cleanup-secret` header zorunlu.
- `delete-account` — kullanıcı hesap silme. **v2.8.50**: `user_data` (DROP edilmiş tablo) DELETE bloğu kaldırıldı; false-error response artık üretmiyor. CASCADE FK ile 24 tabloda owner satırları auto-delete.

**R2 bucket:** `prochefdesk-backups`. Restore prod'da test edildi (docs/DISASTER_RECOVERY.md §5.3.5). **Public Access KAPALI olmalı** — Cloudflare R2 → bucket → Settings'ten her ay teyit (operatör görsel kontrol).

### Storage / Auth

- **Storage:** `recipe-photos` bucket — **PUBLIC bucket**, RLS path-based write (`{user_id}/...`). SELECT herkes (Discover akışında anonymous `<img src>` için zorunlu); INSERT/UPDATE/DELETE sadece owner. Trade-off: URL bilinirse paylaşılmamış foto da görünür, format predictable (`{user_id}/{recipe_id}.jpg`). Lansman + Discover için kabul edilebilir.
- **Auth:** Email + Google OAuth (production'da aktif). `auth.js:157` `redirectTo: origin + '/app/'`. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs whitelist'inde `https://prochefdesk.com/app/**` olmalı.

## 5. Tamamlanmış İşler (kategori özeti)

Tek tek sürüm için → CHANGELOG.md.

| Faz | Konu | Sürümler | Durum |
|---|---|---|---|
| 1 | Per-table sync schema (16 ws-scoped + 6 top-level tablo) | v2.6.66, v2.6.71 | ✅ |
| 2 | RLS audit + user_data DROP + 23 tablo RLS aktif | DB-only | ✅ |
| 3 | Workspace cascade trigger sistemi | v2.6.98 + v2.7.0 | ✅ |
| 4 | Workspace Trash UI (Active/Archived/Deleted + 30-gün retention + restore + purge) | v2.7.3-v2.7.7 | ✅ |
| 5 | IndexedDB migration (LS yazma yolu kapandı) | v2.6.89-v2.6.92 | ✅ |
| 5 | Server-side cleanup (pg_cron + cleanup-photos) | v2.6.97 | ✅ |
| 5 | Cloud sync queue persistence | v2.6.95 | ✅ |
| 6 | Cache-busting standardı (build.js + __VERSION__ placeholder) | v2.8.0 | ✅ |
| 6 | App `/app/` altına taşındı | v2.8.2 | ✅ |
| 6 | Bug fix arc (signup workspace push, cross-user queue leak, demo orphan, realtime CHANNEL_ERROR race) | v2.8.3-v2.8.5 | ✅ |
| 7 | Lansman paketi (landing + Privacy/Terms refresh) | post-v2.8.5 | ✅ |
| 8 | Units + i18n + allergen override + Kitchen Cards modernization | v2.8.19-v2.8.23 | ✅ |
| 9 | Recipes list redesign + isSubRecipe data model + prep render her path'te | v2.8.22, v2.8.26-v2.8.31 | ✅ |
| 10 | Cloud sync invisible reliability (drift detection + auto-retry + ambient indicator) | v2.8.32-v2.8.33 | ✅ |
| 11 | Backlog 1-6 + 8 + 9 + 10 sweep (debounce, restore compare, Cook&Cool aylık form, allergen auto-detect kaldır, 2 yeni HACCP form + cloud sync, i18n round 1+2, Discover Faz 1+2, dietFlags, Realtime JWT fix) | v2.8.34-v2.8.47 | ✅ |
| 12 | Cross-browser tarama (backdrop-filter prefix, 100dvh fallback teyit) + delete-account false-error fix | v2.8.49-v2.8.50 | ✅ |
| 13 | HACCP print tek-sayfa optimize (Cook & Cool + Hot/Cold Holding) + recipe preview share label + ingredient grup ayracı (separator, tam paket) | v2.8.51-v2.8.53 | ✅ |
| 14 | Standart tıklanabilir footer (tüm print/share/QR tek format) + Kitchen Cards print preview uyum fix (window 900→1200px) | v2.8.54-v2.8.55 | ✅ |
| 15 | Drag-drop sıralama (recipe ingredients + menu sections/items): up/down butonları → 6-nokta grip handle, PCD.dragdrop.makeSortable activate | v2.8.56 | ✅ |
| 16 | Kitchen Cards recipe arama: başlık altında anlık substring filter | v2.8.57 | ✅ |
| 17 | Discover/Kitchen Card snapshot sub-recipe fix + isPublic toggle preview modal'a taşındı + privacy notu | v2.8.58 | ✅ |
| 18 | Checklist polishing paketi (boş template print kompakt + drag-drop item editor, session print kompakt, multi-column print toggle, kategori sol şerit, item hint field, session completedBy auto-fill, Template Library 14 hazır şablon 4 kategori) | v2.8.59-v2.8.65 | ✅ |
| 19 | Discover public recipe ingredient "(?)" fix: `enrichPublicIngredientNames` helper public save'de inline name gömme | v2.8.66 | ✅ |
| 20 | Recipe fotoğrafı **1:1 standardı** (8 surface tutarlı): cropper RATIOS = [1:1], editor/preview/print/discover/share/url hepsi aspect-ratio:1/1 max-width:280-360px | v2.8.67 | ✅ |
| 21 | Menu Builder modernizasyon (10 madde): 4 tema (Fine/Bistro/Cafe/Minimal) + 6 accent renk + logo/kapak + dietary badge + item badge (5 tip) + 2 sütun + 4 page size + duplicate + quick legal notes + Design/Layout collapsible panel | v2.8.68 | ✅ |
| 22 | **Sub-recipe ingredient flattening helper** (mimari fix): `PCD.recipes.flattenIngredients()` 6 modüle bağlandı (portion canvas+print+share, shopping consolidation+print, nutrition, allergens-db, computeDietCompat). Cycle protection + birim dönüşümü + scale cascade. Operatör raporu "Beef Skewer içinde Labneh ?" düzeldi. | v2.8.69 | ✅ |
| 23 | HACCP Hub konsolidasyon: 4 form (logs/cooling/receiving/holding) tek `haccp` landing widget'ı altında, mevcut route'lar korunur, sidenav 18→15 item | v2.8.70 | ✅ |
| 24 | Allergen Guardrail: Recipes list "Free from" 6 chip filter + Menu Builder "Allergen-safe print" toggle (coeliac event, peanut-free children's party use case) | v2.8.71 | ✅ |
| 25 | Dashboard Cost Health widget: over-budget recipes (food cost %35 üstü) + stale ingredient prices (60+ gün) — silent margin erosion erken uyarı | v2.8.72 | ✅ |
| 26 | **Buffet Planner** — hotel/catering grade tool (~540 satır). 5-yıldız breakfast/lunch için. Industry ratios (Cornell+Marriott), refill multipliers, food cost % targets, station types, prep + cost report print 2 türde. `buffets` IDB tablosu (cloud sync sonraki round) | v2.8.73 | ✅ |
| 27 | **Mise en Place Planner** — sabah prep listesi (~360 satır). Events + Buffets'ten otomatik prep aggregation, 5 faz grouping (Stocks/Sauces/Protein/Garnish/Final), check-off + remaining time. `misePlans` IDB tablosu | v2.8.74 | ✅ |
| 28 | Tag system: recipes free-form tags + autocomplete + list view multi-select filter (cuisine + diet + allergen + tag kombinasyon). `data.tags` jsonb array | v2.8.75 | ✅ |
| 29 | App boot perf **L1**: 50 sync `<script>` → `defer`, 2 CDN için `preload` + `preconnect` + `dns-prefetch`. Mobile FCP/LCP 5.6→3.0-3.5 sn beklentisi, tek dosya (index.html) | v2.8.76 | ✅ |
| 30 | Buffet inline guide (5-adımlık dismissible) + per-field help texts (Name/Covers/Price/Stations + Refill + station onboarding empty state) | v2.8.77 | ✅ |
| 31 | App boot perf **L2** + a11y: viewport zoom unblock (WCAG fix +5 puan), xlsx-js-style lazy (~500KB), i18n lazy 5 dil (~150KB sadece en eager), 16 tool lazy router (~450KB; dashboard+account+inventory eager). Toplam boot bundle ~1.1MB azalış. Beklenen PageSpeed 72→85 | v2.8.78 | ✅ |
| 32 | Buffet overhaul (4 ekleme yöntemi: Recipe/Ingredient/New Ingredient/Custom Label + numeric input debounce 400→700ms + focus restoration + Unit dropdown + "Tüketim %" rename + Excel export) + Excel cost report bug fix (toast.info API geri çevirme) + HACCP "Add unit" → "Add fridge/freezer" + R2 backup `haccp_receiving`+`haccp_holding` BACKUP_TABLES ekleme | v2.8.79 | ✅ |
| 33 | Recipe editor "+ Add new" modal → `ingredients.openEditor()` tam detay (category + supplier + yield % + diet flags) — buffet pattern'i ile birleştirme. `promptNewIngredientDetails` silindi (~70 satır), buffet `_openNewIngredientFlow` pattern'i kopyalandı + lazy load check. `ingredients.openEditor(iid, callback, opts)` 3. arg `opts.initialName` opsiyonel (geri uyumlu). | v2.8.80 | ✅ |
| 34 | **Modal focus root cause fix** (evrensel — tüm modal'lar etkilenir): `modal.js:192` selector body'ye restrict + `button` çıkarıldı + disabled atlama. Eskiden header'daki "X" close butonuna focus oluyordu. **Discover'da paylaşan şefin adı**: `enrichPublicIngredientNames` recipe.authorName inline gömme (gizlilik için email→authorName mapping engellendi). Card + detail modal author display. 2 yeni i18n key. | v2.8.81 | ✅ |
| 35 | **Buffet üst form input focus bug fix**: Covers/Ticket price/Refill × input'larına `data-buf-field` attribute + focus restoration listesine ekle + 3 handler `PCD.debounce(...,700)` ile sar. v2.8.79 item editor pattern'i (sadece per-guest amount/pickup için yapılmıştı) top form'a da uygulandı. Operatör çok-haneli sayı yazabilir artık. | v2.8.82 | ✅ |
| 36 | **Welcome tour modernizasyon (Faz A başlangıç)** — tutorial.js + components.css baştan modernize. 4-step korundu (sayı değil kalite) ama her step zengin: hero illustration (88px gradient circle + 44px emoji + pop animation), 3-tier content (title 22px + tagline + body), 3 feature chip per step, fluid gradient progress bar (dots yerine), Back butonu (step 2-4), radial gradient backdrop + blur, mobile bottom-sheet feel. 26 yeni i18n key TR+EN parity. Master roadmap'in 1. hamlesi. | v2.8.83 | ✅ |
| 37 | **Author profile-priority fix + Save profile auto re-enrich**: `enrichPublicIngredientNames` public API'ye expose, account.js Save profile butonu name değişiminde tüm public recipe'leri loop + enrich + upsert + toast count. Lazy load uyumu (recipes.js dynamic script enjekte). Mevcut "Anonim Şef" gösteren eski public recipe'ler tek tıkla düzelir. 2 yeni i18n key. | v2.8.84 | ✅ |
| Ops | GSC verify + sitemap submit + 7 sayfa Google'a keşfedildi (landing + 2 legal + blog index + 3 post) | 2026-05-18 | ✅ |
| Ops | Edge function deploy: `delete-account` (v2.8.50 fix CANLI) + `backup-to-r2` (v2.8.79 BACKUP_TABLES haccp_receiving/holding CANLI) | 2026-05-18 | ✅ |
| Ops | Marketing + SEO + Blog altyapısı (PARÇA 1+2+3): `/blog/` 3 yazı + sitemap.xml + robots.txt + meta tag sweep + privacy/terms OG cards. App'ten bağımsız stil. GSC verify operatöre kaldı | 2026-05-18 | ✅ |
| Ops | Backup function v3 + restore prosedürü prod test | Edge deploy + docs | ✅ |
| Ops | DISASTER_RECOVERY.md güncel | docs | ✅ |

## 6. Yapılacaklar (öncelik sırasına göre)

### Gündelik kullanımda hissedilen — hepsi tamamlandı

1. ~~Cost report test price input debounce~~ → **✅ v2.8.34 (300ms) → v2.8.48 (400ms operatör isteğiyle)**
2. ~~Restore modal — current vs backup karşılaştırma~~ → **✅ v2.8.35** (delta sütunu ile)
3. ~~HACCP Cooking & Cooling — aylık 31 satırlık tek form~~ → **✅ v2.8.36 (aylık boş print) + v2.8.47 (tool tamamen aylık formata geçti)**
4. ~~Auto diet detection — kaldır~~ → **✅ v2.8.37 (kaldırıldı) + v2.8.45 (küratörlü dietFlags ile yeniden inşa)**

### Kapsamı büyük — hepsi tamamlandı

5. ~~Yeni HACCP formları~~ → **✅ v2.8.38 (Receiving) + v2.8.39 (Hot/Cold Holding) + v2.8.44 (her ikisi cloud sync)**. Fridge/Freezer zaten haccp_logs'ta vardı.
6. ~~Hardcoded EN string süpürmesi~~ → **✅ v2.8.40 (round 1, 13 string) + v2.8.42 (round 2, 17 string) = 30+ string TR'ye geçti**
7. **iOS/Safari cross-browser test pass** ⏳ — Safari iOS + Safari macOS + Chrome iOS. v2.8.49'da kod tarama yapıldı (temiz), gerçek cihaz manuel testi operatör tarafına bekliyor.

### Büyük feature — tamamlananlar + bekleyenler

8. ~~Discover MVP~~ → **✅ v2.8.41 (skeleton + isPublic toggle) + v2.8.46 (backend: anonymous SELECT RLS + recipe_likes + view counter RPC + like buton + view bumper) + v2.8.58/v2.8.66 (sub-recipe ingredient "(?)" fix)**
9. ~~Auto diet rebuild — küratörlü ingredient DB~~ → **✅ v2.8.45 (ingredient tri-state diet flags + computeDietCompat helper + recipe diet chips)**
10. ~~Realtime CHANNEL_ERROR~~ → **✅ v2.8.43 (explicit JWT setAuth + TOKEN_REFRESHED dinleyici)**
11. **Categories functional** ⏳ — şu an kozmetik. 50+ menu item olursa anlamlı.
12. ~~Marketing / SEO / blog kurulumu~~ — ✅ **TAM TAMAM**. Altyapı 2026-05-18, GSC verify + sitemap submit + 7 sayfa Google'a keşfedildi.

### Yeni bekleyen işler (v2.8.80 sonrası)

13. **CHANGELOG.md güncel hazırla zincirleme commit yöntemi** — manuel hatırlamayla yapılıyor (v2.8.34-v2.8.80). İleride otomatize edilebilir (CI hook: her commit'te entry kontrolü).
14. **`supabase-functions/` duplicate silme** — operatör 2026-05-18'de deploy doğrulaması yaptı (`supabase/functions/`'tan kopyalanıyor); klasör artık güvenle silinebilir, ayrı round'da yapılır.
15. **Discover view count rate limit** — `increment_recipe_view` RPC anonymous'a açık, spam riski (MVP'de kabul). Viral olursa Edge Function ile IP+recipe başına 1 saat 1 view.
16. **R2 backup foto bytes yedekleme** — şu an sadece manifest; Supabase Storage kaybı = foto kaybı. Solo workflow için kabul edilebilir; Pro tier'da Storage PITR var.
17. ~~Edge function deploy: `delete-account`~~ — ✅ operatör deploy etti (2026-05-18). v2.8.50 fix CANLI.
18. ~~Edge function deploy: `backup-to-r2`~~ — ✅ operatör deploy etti (2026-05-18). BACKUP_TABLES'da `haccp_receiving` + `haccp_holding` doğrulandı. İlk doğrulama: yarın sabah UTC 03:00 (Perth 11:00) cron run sonrası Cloudflare R2 bucket'ında iki yeni jsonl dosyası gör.
19. **Buffet + Mise cloud sync** ⏳ — v2.8.73 (`buffets`) + v2.8.74 (`misePlans`) IDB-only. Supabase tablo + RLS + per-table sync wire gerekiyor (pattern: v2.8.44 haccp_receiving/holding migration). **Onay zorunlu** (yeni tablo + RLS + sync mantığı).
20. **Discover'a Tag + Allergen filter** ⏳ — v2.8.75 tag + v2.8.71 allergen guardrail Discover'a inmedi. Public recipe save edilirken `enrichPublicIngredientNames` pattern'i (v2.8.66) ile tag + dietFlags inline gömme; Discover frontend filter chip'leri tek tıkla.
21. **App boot perf L3** — cloud sync ilk paint sonrasına ertele. **Önerilmedi** (CLAUDE.md "cross-device sync değişikliği" yüksek risk). L1 (v2.8.76) + L2 (v2.8.78) yeterli; beklenen PageSpeed ~85, LCP 3.0-3.5 sn.

## 7. ❌ Önerme

Bu işleri spontan öneri olarak ortaya çıkarma:

| İş | Neden |
|---|---|
| Pricing / paid tier / Stripe | 50+ aktif kullanıcı + %40 retention kanıtlanmadan yok |
| AI image gen entegrasyonu | Operatörün kendi GPU donanımı var (RTX 5090 24GB), ürüne entegre gereksiz |
| Demo seed değişikliği | Mevcut hali iyi |
| Türkçe landing page | Operatör erteledi |
| Screenshot ekleme | Operatör kendisi çekecek |
| `supabase-functions/` duplicate silme | Operatör Supabase Dashboard doğrulaması yapana kadar dokunma |
| `PCD.log` çağrılarını temizleme | `PCD_CONFIG.DEBUG = false` iken silent no-op, gereksiz |

## 8. Operatör Çalışma Kuralları

### İletişim

1. Türkçe, sade dil, kısa cevaplar.
2. Operatöre teknik kod (diff, syntax) gösterilmez — değişiklik ne, hangi dosya, ne risk dilinde.
3. "BUNU SEN SÖYLE / önerin nedir" denince doğrudan görüş ver, soruyla cevap verme.
4. Hata yapıldığında kısa kabul et, ileri git. Aşırı özür / öz-eleştiri yok.

### İş süreci

5. **Bir hedef → en küçük adım.** Birden fazla iyileştirmeyi tek sürüme paketleme.
6. **Bulk regex/script YOK.** Manuel dosya-by-dosya. Geçmişte 226+ syntax error + rollback bulk script'ten geldi.
7. Her edit'ten sonra `node -c` syntax check.
8. Frontend tahmin yürütmeden önce SQL ile DB durumunu kontrol et.
9. **Operatör bir sorunla geldiğinde genel cevap verme.** Önce DevTools console + kod ile mevcut uygulamanın gerçek durumuna göre nokta atışı teşhis yap. Operatör screenshot gönderdiğinde console açıksa önce oraya bak. Tahmin değil, kanıt.
10. Yeni özellik önermeden önce repo'da grep ile var mı kontrol et. Memory'de "yapılmamış" notu olsa bile doğrula.
11. GitHub Desktop GUI ile push edilir, terminal/cmd değil.

### Sürüm yönetimi

12. Sürüm bump'ı SADECE `app/js/core/config.js` `APP_VERSION` satırını değiştirir.
13. `app/index.html`'e literal sürüm yazılmaz — `__VERSION__` placeholder'ları build.js inject eder.
14. **CHANGELOG yönetimi:** Claude oturum boyunca yapılan işleri düzenli not alır. Operatör "güncel CHANGELOG hazırla" dediğinde temiz, organize, nizami şekilde hazırlanır.
15. DB-only migration kendi sürüm numarası alabilir (frontend sürüm atlayabilir).

### Onay zorunlu

16. DROP TABLE / destructive SQL
17. 50+ satır frontend değişikliği
18. Yeni dosya/modül ekleme
19. Cron schedule / RLS policy değişikliği
20. Cross-device sync mantığı değişikliği (cloud.js, cloud-pertable.js, cloud-realtime.js)
21. Edge Function deploy

### Backlog & memory

22. Claude memory özelliği KAPALI (operatör manuel kapattı — yanlış yapılacaklar üretiyordu). Backlog tek kaynağı: bu dosya §6.
23. Yapılacaklar listesini güncellemeden önce operatöre göster, doğrulat.
24. "Tamamlandı" bilgisi memory'den varsayılmaz — repo'da kontrol veya operatöre sorulur.

## 9. Önemli Yerler / Değerler

| | |
|---|---|
| Repo path (operatör Windows) | `C:\Users\ahmet\Desktop\prochefdesk` |
| GitHub repo | `ahmetkayas1926/prochefdesk` |
| Production sürümü | **v2.8.84** (push'a hazır local; production v2.8.79) |
| Supabase project ref | `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, Free tier) |
| Cloudflare R2 bucket | `prochefdesk-backups` |
| CLEANUP_SECRET | `ec79a445-7e92-499b-9322-5c2c949788d4d2886e66-d556-4498-ba9e-17fda6c11ac1` |
| Operatör e-posta | ahmetkaya.s1926@gmail.com |
| App e-posta | hello@prochefdesk.com (Cloudflare Email Routing → Gmail) |
| Test edilmiş platformlar | Desktop Chrome ✅, Android Chrome (PWA install) ✅ |
| Test edilmemiş | iOS Safari + Safari macOS + Chrome iOS |
| Cloudflare Pages build command | `node build.js` |
| Aylık altyapı maliyeti | $1 (sadece domain). 50 aktif kullanıcıya kadar Supabase Free tier. |

## 9.5 Push Öncesi Rutin Kontrol Listesi (v2.8.50 audit sonrası eklendi)

Her büyük push'tan önce operatör Cloudflare/Supabase Dashboard'dan görsel olarak doğrulayacak:

1. ☐ **R2 bucket Public Access KAPALI** — Cloudflare R2 → `prochefdesk-backups` → Settings. Açıksa felaket (30 gün tüm backup + jsonb içerik herkese açık).
2. ☐ **OAuth Redirect URLs whitelist** — Supabase → Authentication → URL Configuration → `https://prochefdesk.com/app/**` listede mi?
3. ☐ **3 cron job son run tarihi** — Supabase → Database → Cron Jobs → `nightly-backup-to-r2`, `pcd-cleanup-old-deleted`, `pcd-cleanup-photos-weekly` son 1-2 gün içinde çalışmış mı?
4. ☐ **Migration'lar Dashboard'da çalıştırıldı mı** (varsa) — push'tan ÖNCE. Frontend henüz Supabase'de olmayan tabloyu push'lamaya çalışırsa hata.
5. ☐ **Edge function deploy gerek mi** — `supabase/functions/*` değişti mi? Gerekirse CLI ile `supabase functions deploy <name>`.

## 10. Yeni Claude Başlangıç Kontrol Listesi

1. ☐ Bu HANDOVER.md tamamen okundu mu?
2. ☐ CLAUDE.md okundu mu? (Claude Code'sa otomatik yüklenir.)
3. ☐ CHANGELOG.md son entry'leri okundu mu?
4. ☐ §7 YAPMA listesi okundu mu? Bu işleri önerme.
5. ☐ §2 mevcut durum: ürün canlı, aktif kullanım, yeni özellik geliştirme öncelik değil.
6. ☐ Bir iş yapmadan önce: bu iş zaten yapıldı mı? §5 ve repo'da grep ile kontrol et.
7. ☐ DB durumunu varsayma — gerekiyorsa SQL ile sor.

## 11. Mimari Kurallar (gotcha'lar)

### 11.1 Cloud sync race condition

UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, arada explicit `await PCD.cloudPerTable.flushNow()` olmalı. Aksi halde debounced sync tamamlanmadan reload tetiklenir → "verim kayboldu" raporu gelir.

### 11.2 PCD.icon registry — silent info fallback

`PCD.icon(name, size)` registry'de olmayan isim verince sessizce info ikonuna fallback yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) kabul etmez. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js`.

### 11.3 Per-table sync akışı

| Yön | Mekanizma |
|---|---|
| **Push** (local→cloud) | `cloud-pertable.js` UI yazımlarını dinler, 1.5sn debounce ile Supabase'e UPSERT/DELETE. v2.8.33: auto-retry (1s/2s backoff, 3 deneme, transient hatalar için). v2.8.32: flushNow `{success, pushed, errors[]}` döndürür. |
| **Pull** (cloud→local) | `cloud.js` boot'ta workspace-scoped + user-scoped tablolardan kullanıcı satırlarını çeker, IDB yazar, state merge. `pullInProgress` flag ghost duplicate önler. v2.8.3: pull akışı local-only ws'leri queueUpsert ile cloud'a iletir. **v2.8.33: drift detection** — local'de olup remote'ta olmayan her tablodaki kayıt otomatik queueUpsert'lenir (self-healing). v2.8.44'te haccp_receiving + haccp_holding pull'a eklendi. |
| **Realtime** (cloud→local canlı) | `cloud-realtime.js` 19 tabloya WebSocket subscribe. v2.7.9 orphan channel leak fix, v2.8.5 init() çift subscribe path race silindi. Şu an CHANNEL_ERROR — solo workflow için kritik değil. |
| **Queue persistence** (v2.6.95+) | `cloud-pertable.queue` her mutation'da IDB'ye yansır. Boot'ta restore. v2.8.4 `clearQueue()` (logout cross-user leak önleme). |

Sync bug'ında ÖNCE hangi yön sor — push mu, pull mu, realtime mı, queue mu? Tahmin yürütme.

### 11.4 v2.8.33 sync mimarisi

Operatörün şu an gördüğü "her şey çalışıyor" deneyimini sağlayan 3 katman:

1. **Drift detection** (cloud.js pull akışında): local-cloud uyumsuzluğu pull sırasında sessizce iyileştirir. Restore başarısızlığı, transient push hatası, network kesintisi sonrası kalan local-only kayıtlar otomatik cloud'a gider.
2. **Auto-retry** (cloud-pertable.js): Transient hatalar (no status, 5xx, 408, 429, timeout/network keyword) için 1s + 2s backoff ile 3 deneme. Hard hatalar (RLS, 4xx) anında raporlanır.
3. **Ambient sync indicator** (app.js): Sağ alt köşede 10px floating dot. Syncing (mavi pulse), synced (yeşil, 2sn sonra solar), offline (gri), error (kırmızı, tıklayınca retry). DOM event `pcd-sync-status` ile besleniyor.

Force re-sync butonu **Account → Yardım** altına taşındı (v2.8.33), gündelik UI'da değil — troubleshooting aracı.

### 11.5 RLS aktif (tüm 25 tablo)

Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy şart:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 11.6 OAuth callback URL'leri (v2.8.2+)

Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://prochefdesk.com`
- **Redirect URLs:** `https://prochefdesk.com/**` ve `https://prochefdesk.com/app/**`
- `auth.js` Google OAuth `redirectTo: window.location.origin + '/app/'`

### 11.7 Misafir vs üye davranışı

- **Misafir (login yok):** Sadece IDB. Cloud yazma KAPALI. Demo seed yüklenir.
- **Üye (login var):** IDB + cloud çift yönlü. Realtime aktif (CHANNEL_ERROR'lu da olsa pull akışı çalışıyor).

Yeni feature: misafir kullanıcı için cloud push tetiklenmemeli (v2.6.93'te bu sızıntı kapatıldı).

### 11.8 `app/index.html` sürüm string'i ASLA literal yazılmaz

49 yerde `?v=__VERSION__` placeholder yaşar. `node build.js` deploy zamanı replace eder. Literal yazılırsa build fail ("No __VERSION__ placeholders found"). Sürüm bump için tek dokunulan yer: `app/js/core/config.js` APP_VERSION satırı.

### 11.9 Root dosyalar app'ten BAĞIMSIZ

`index.html`, `privacy.html`, `terms.html`, `/blog/*.html` — hepsi kendi inline CSS'i var. App CSS değişiklikleri etkilemez, tersi de. Sadece **brand tutarlılığı** için: renk (green #16a34a brand CTA, #2D4A3E primary editorial), font, "PC" mark hep tutarlı.

**Font seçimi:**
- Landing (`index.html`): Inter (modern marketing tone)
- Legal (`privacy.html`, `terms.html`): Fraunces (serif başlık) + Manrope (sans body), editorial uzun-okuma feel'i
- Blog (`/blog/*.html`): Fraunces (serif başlık) + Inter (sans body), editorial + brand bridge

**Palette farkları:**
- Landing: `#fafaf9` bg, brand green CTA dominant
- Legal + blog: `#FAF7F2` cream paper bg, `#2D4A3E` deep forest editorial accent, brand green sadece CTA + "PC" mark'ta

### 11.9.1 Blog ekleme prosedürü

`prochefdesk.com/blog/` altında her yazı **standalone HTML**. Build step / template engine YOK.

**Yeni yazı eklemek (5 dk):**
1. Mevcut bir post HTML'i (örn. `/blog/food-cost-percentage-restaurant.html`) → `/blog/your-slug.html` olarak kopyala
2. `<head>` içindeki tüm meta tag'leri yeni içeriğe göre güncelle: `<title>`, `<meta name="description">`, `<link rel="canonical">`, tüm `og:*`, tüm `twitter:*`, `og:image`, `article:published_time`
3. `<article>` içindeki tag/h1/lede/article-meta'yı yenile, body content'i yaz
4. `/blog/index.html`'de `<div class="post-grid">` içine **en üste** yeni `<a class="post-card">` bloku ekle (newest first pattern)
5. `/sitemap.xml`'e yeni `<url>` girdisi ekle (newest first), `<lastmod>` doğru
6. Push → Cloudflare Pages otomatik yayınlar

**SEO standartı per post:**
- `<title>` 60 karakter altı, "— ProChefDesk" suffix
- `<meta description>` 155 karakter altı, ilk cümle hook
- `og:image` ve `twitter:image` 1200×630 px PNG (henüz placeholder URL'ler — `og-food-cost.png` vs. ileride üret)
- `article:published_time` ISO YYYY-MM-DD
- `<link rel="canonical">` absolute https URL

**Stil değiştirmek:**
Her post kendi inline `<style>` taşır. Bir postu değiştirmek diğerlerini etkilemez. Genel stil değişimi için her dosyayı tek tek edit et (DRY değil ama Cloudflare'de bundling yok, herşey statik HTML; bilinçli bir takas).

### 11.9.2 SEO altyapısı

`sitemap.xml` (root) — tüm public sayfalar. Blog ekleme talimatı yorum bloğu içinde.
`robots.txt` (root) — `Disallow: /app/` (uygulama dynamic SPA, crawlable değil) + `Sitemap:` satırı.
`index.html` `<head>` — Google Search Console doğrulama meta-tag yorumlu placeholder (`<!-- <meta name="google-site-verification" content="..."> -->`). Operatör GSC'den token alıp yorumu açar.

**GSC kurulumu (operatör ~15 dk eve gelince):**
1. Search Console → "Add property" → `https://prochefdesk.com`
2. Verification method: "HTML tag" → token kopyala
3. `index.html`'deki yorumlu satırı aç, `content="..."` doldur, push
4. Cloudflare deploy ~2 dk
5. Search Console "Verify" → onay
6. Sol menü "Sitemaps" → `https://prochefdesk.com/sitemap.xml` submit
7. İlk indexleme ~3-7 gün

### 11.10 isSubRecipe data model (v2.8.26)

Recipe artık `isSubRecipe: boolean` alanı tutar (default `false`). `PCD.recipes.isPrep(r)` helper:

```javascript
typeof r.isSubRecipe === 'boolean'
  ? r.isSubRecipe
  : !!(r.yieldAmount && r.yieldUnit)  // legacy fallback
```

Tüm prep/menu ayrımı bu helper'dan geçer (recipes.js, kitchen_cards.js, share.js, cost report render). Yield bilgisi (yieldAmount, yieldUnit) factual üretim miktarı; classification'dan ayrı.

### 11.11.5 Print akışı standartları (v2.8.54-v2.8.55)

`PCD.print(html, title)` (utils.js) tüm yazdırma akışlarının **tek noktası**. Önemli kurallar:

- **Footer otomatik enjekte edilir.** Tüm caller'lar standart `<div class="pcd-print-footer">Made with <a>ProChefDesk</a> · <a>prochefdesk.com</a></div>` alır. Custom footer (örn. eski `.h-brand`) **YAZMA** — duplicate olur veya tutarsız görünür.
- **`.pcd-print-footer{display:none}` override YASAK.** Eskiden HACCP dosyaları tek-sayfa optimizasyonu için bu hack'i kullanıyordu; v2.8.54'te footer margin'i 24→6px düşürüldüğü için artık tek-sayfa bozmuyor.
- **Window boyutu 1200×850px** (utils.js'te sabit). Daha küçük yaparsan Kitchen Cards landscape A4 (≈1122px) body sizing'i taşırır, CSS multi-column hesaplaması bozulur, tek sütun stack olur.
- **Caller HTML formatı:** PCD.print(html) full HTML (`<!DOCTYPE...`) veya partial content kabul eder. Partial verilirse wrapper + style + toolbar otomatik ekler. Full verilirse sadece footer enjekte edilir (body close öncesi).
- **Print path'lerinde A4 zorlanan body sizing kuralları print-only @media içinde olmalı** veya body sizing'i window viewport'a göre seçmeli — aksi halde popup preview ile gerçek print farklı görünür.

### 11.12 Çoklu kullanıcı / paid tier hazırlığı

`subscriptions` tablosu DB'de hazır, kullanılmıyor. Operatör 50+ aktif kullanıcı + %40 retention kanıtlanana kadar paid tier eklemiyor.

### 11.13 App boot performansı (v2.8.76 + v2.8.78 ile L1 + L2 uygulandı)

**Başlangıç tanı (2026-05-18):** `app/index.html` boot: 48 sync `<script>` tag + 5 blocking `<link rel="stylesheet">` + 2 CDN script (supabase-js ~200KB, xlsx-js-style ~500KB), tümü `defer`/`async` YOK. Toplam ~1.9MB local JS. Mobile PageSpeed (4G simülasyonu) FCP/LCP 5.6 sn / 65 puan, TBT=0/CLS=0 (CPU değil, network bound).

**3 katmanlı optimizasyon yolu — sonuç:**

**L1 ✅ (v2.8.76):** Tüm `<script>` tag'lerine `defer` + 2 CDN'e `<link rel="preload">` + `preconnect` + `dns-prefetch`. Tek dosya değişikliği. PageSpeed 65→72.

**L2 ✅ (v2.8.78):** (a) viewport `maximum-scale=1.0, user-scalable=no` kaldırıldı (WCAG a11y +5), (b) xlsx-js-style lazy load (`PCD.loadXLSX()` cached promise, ~500KB), (c) i18n lazy load (sadece `en.js` eager + dinamik `loadLocaleBundle(locale)`, ~150KB), (d) 16 tool lazy router (`registerLazy(name, scriptPath, toolName)` + `_afterToolLoad(toolName, cb)` poll, ~450KB). Eager tutulan 3 tool: dashboard (default home) + account (auth flow) + inventory (dashboard low-stock alert `computeStatus` kullanır). Toplam boot bundle ~1.1MB azalış. Beklenen PageSpeed 72→85, LCP 7.0→3.0-3.5 sn.

**L3 — YÜKSEK RİSK, önerilmedi:** Cloud sync'i ilk paint sonrasına ertele. CLAUDE.md "cross-device sync mantığı değişikliği" listesinde — onay şart. Multi-device "veri kayıp" hissi riski.

**L4 (rewrite):** ESM modules + Service Worker pre-cache. Mimari "no bundling, no SW" kararıyla çelişir, yapılmaz.

### 11.14 Sub-recipe ingredient flattening (v2.8.69)

`PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) — recipe'in tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür.

**Özellikler:**
- Scale cascading: `ri.amount / sub.yieldAmount` her seviyede çarpılır
- Birim dönüşümü: `PCD.convertUnit` ile best-effort (mismatch'te orijinal kalır)
- Cycle protection: visited set ile A→B→A engellenir
- Separator skip: `ri.separator` satırlar atlanır
- Output: her item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` (viaSubRecipe = en sığ kaynak adı, gri italik "via Labneh" gösterimi için)

**Bağlı modüller (6 yer, hepsi v2.8.69'da bağlandı):**
1. `portion.js` canvas render — flat liste + via ipucu
2. `portion.js` printScaled
3. `portion.js` shareScaled — text share
4. `shopping.js` render — consolidation + by-recipe group hiyerarşi
5. `shopping.js` print
6. `nutrition.js` computeRecipeNutrition — sub-recipe kalori cascade
7. `allergens-db.js` recipeAllergens — sub-recipe allergen propagation
8. `dashboard.js` computeDietCompat — sub-recipe diet flag cascade

**Variance.js DOKUNULMADI** — kendi recursive sub-recipe handling'i var (v2.8.16+).

Yeni "tarif → ingredient listesi" ihtiyacında: bu helper'ı kullan, manuel recursion yazma.

### 11.15 Lazy tool loading + router (v2.8.78)

Router'da `registerLazy(name, scriptPath, toolName)` + `loadLazyTool()` helper. 16 tool dinamik script tag ile lazy yüklenir.

**Eager tool'lar (3):**
- `dashboard` — default home, ilk açılış view'ı
- `account` — auth flow (logout, oauth callback)
- `inventory` — dashboard low-stock alert sync `computeStatus` kullanır

**Lazy tool'lar (16):** recipes, ingredients, menus, kitchen_cards, shopping, portion, waste, suppliers, events, checklist, haccp_logs, haccp_cooling, haccp_receiving, haccp_holding, haccp, buffet, mise, discover.

**Akış:**
- `PCD.router.go(name)` lazy route varsa loading state göster → dynamic script tag enjekte → `routes[name]` wire → render
- Popstate `_renderView` yerine `router.go()` çağırır (lazy support)
- Dashboard handler'larında `_afterToolLoad(toolName, cb)` poll helper — `[data-action="new-recipe"]/new-event/view-event` tıklamada lazy tool yüklenene kadar 120ms aralıklı 3sn poll

**Yeni tool ekleme:**
1. Eager mi lazy mi karar ver (default lazy)
2. `app/index.html`'e script tag EKLEME (lazy ise)
3. `router.registerLazy(name, scriptPath, toolName)` ekle (`router.js`)
4. Dashboard click handler kullanılıyorsa `_afterToolLoad(toolName, cb)` poll pattern'i izle

**Tool ilk açılışta 100-300ms network gecikme, sonrası browser cache instant.**

### 11.16 xlsx + i18n lazy load (v2.8.78)

**xlsx:** `PCD.loadXLSX()` (utils.js) cached promise döndürür. xlsx-js-style (~500KB) CDN'den ilk Excel tıklamasında yüklenir. Wire'lı yerler: `recipes.js` cost report XLSX export, `ingredients.js` Excel import, `buffet.js` `exportBuffetXLSX()` (v2.8.79). İlk tıklamada 3-5sn "Loading xlsx" sessiz; sonraki instant.

**API gotcha:** `PCD.toast.info()` return value pattern'i bozuk dönüyor (v2.8.78'de denenmişti). v2.8.79'da "loading-toast remove" pattern KALDIRILDI; sessiz lazy load + re-call yeterli. Yeni Excel/xlsx caller'larda toast manipülasyonu YAPMA.

**i18n:** `setLocale()` async — sadece `en.js` boot'ta baseline (fallback dictionary). TR/ES/FR/DE/AR `loadLocaleBundle(locale)` cached promise ile dinamik fetch. Sync caller'lar `.then` zinciri olmadan çalışır (Promise yutar). Yeni i18n key sadece **en.js + tr.js**'e eklenir.

### 11.17 HACCP Hub + Buffet/Mise tools (v2.8.70, v2.8.73-79)

**HACCP Hub (v2.8.70):** 4 form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında yaşar. `app/js/tools/haccp.js` landing view: bugünkü durum widget + 4 tıklanabilir kart. Mevcut 4 route DOKUNULMADI — bookmark + direct link korunur. Sidenav 18→15 item. Yeni HACCP form eklersen hub landing'i de güncelle.

**Buffet Planner (v2.8.73, v2.8.77 inline guide, v2.8.79 overhaul):** Hotel/catering grade tool (~540+ satır). Industry standards (Cornell hospitality + Marriott/Hilton banquet ops): `INDUSTRY_RATIOS` (hot_protein %85, fruit_fresh %55, cheese %35 vb.), `INDUSTRY_REFILL` (breakfast 1.20× vb.), `INDUSTRY_TARGETS` (food cost % renk kodlu yeşil/sarı/kırmızı). Veri modeli: `buffet = { name, type, coverCount, ticketPrice, serviceDate, durationHours, refillMultiplier, notes, stations[] }`. **`buffets` IDB tablosu — cloud sync YOK (backlog #19).**

**Buffet item 3 tipte (v2.8.79):** item.recipeId / item.ingredientId / item.customName ayrımı. `computeItemCost` 3 path: (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → 0. Print/Excel paths üçünü de handle eder. UI'da renkli chip badge (recipe yeşil / ingredient sarı / custom gri). Add Item butonu 4-action modal: 📖 Recipe Library / 🥬 Ingredient Library / ➕ New Ingredient (inline editor, save sonrası hem buffete hem library'e ekler) / ✎ Custom Label. Yeni computation eklerken 3 path'i de değerlendir, aksi halde custom item NaN/silinebilir.

**Mise en Place Planner (v2.8.74):** Sabah prep listesi (~360 satır). Events + Buffets'ten otomatik prep aggregation, 5 faz grouping: Stocks & Bases / Sauces & Dressings / Protein & Marinade / Garnish & Veg / Final Setup (recipe.category'ye göre auto-assign). Sub-recipe expansion `flattenIngredients` ile. Each item: amount + unit + estimated prep time. Check-off ile ilerleme stats. Source attribution: 📅 Event Name · 🥘 Buffet Name. **`misePlans` IDB tablosu — cloud sync YOK (backlog #19).**

### 11.18 Recipe ingredient separator (v2.8.52)

`data.ingredients` array'inde yeni satır tipi: `{ separator: true, label?: '' }`.

**Hesap path'leri** (cost/diet/allergen/variance/integrity): `if (ri.separator) return;` skip etmeli.
- `dashboard.computeFoodCost` ✓
- `dashboard.resolveRow` separator için `{ found: false, isSeparator: true }` döndürür — cost report ve XLSX detail otomatik atlar
- `dashboard.computeDietCompat` ✓
- `allergens-db.recipeAllergens` ✓
- `variance.js` ✓
- `store.findRecipesUsingIngredient` ✓

**Display path'leri** (editor + preview modal + Kitchen Card + share/print + text-share + Discover detail modal): görsel çizgi + opsiyonel uppercase label olarak render eder. Share + Kitchen Card snapshot'larında separator alanı korunur — public viewer ve diğer cihazlar görür.

Yeni `recipe.ingredients` üzerinde forEach yazarken iki path'ten birini seç.

## 12. Operatör Bağlamı

Operatör profesyonel şef, full-time mutfakta çalışmak fiziksel olarak zorlanıyor (bacak ağrısı, yaşlanma). ProChefDesk'i gradual transition aracı olarak görüyor — şefliği bırakmak değil, yan-zamanlıya çekip teknolojiden gelir tamamlayıcı yapmak.

**Donanım:** ASUS ROG Strix Scar 18 (RTX 5090 Laptop, 24GB GDDR7 VRAM). ComfyUI/Automatic1111/Kohya_ss kullanıyor. Faz 2 marketing içerik üretimi için (food photography, kısa videolar) bu donanım stratejik.

**Bilinen tercihler:**
- Manipülatif satış teknikleri istemiyor
- Karmaşık premium tier'lardan kaçınıyor (basit tek tier tercihi)
- Erken yatırımcı/exit konusuna kapalı (uzun vadeli, yan-iş zihniyetiyle)
- Acele kararlardan kaçınıyor — yeni Claude baskı yapmasın, destek versin
