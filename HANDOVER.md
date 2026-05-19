# ProChefDesk — Operasyon Handover

> **Bu dokümanın amacı:** Yeni Claude session'ında hızlı devralma. Kabul et, varsayma. Önce oku, sonra çalış.
>
> Claude Code için kısa operasyonel rehber: **`CLAUDE.md`**.
> Sürüm geçmişi: **`CHANGELOG.md`**.

## 1. Genel

**Ürün:** ProChefDesk — profesyonel chef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya, Perth Western Australia, profesyonel şef. Solo non-commercial proje.
**Mevcut sürüm:** **v2.9.33** (push'a hazır local; production v2.9.32). **HACCP Cook & Cool print column widths rebalance** — FOOD/BATCH 25→32%, NOTE 16→20%, °C/TIME daraltıldı. Operatör test bekliyor.
**Blog:** 13 yazı yayında (Faz A SEO upgrade + Faz B 5-round, MENA niş + uluslararası coverage).
**Domain:** prochefdesk.com (Cloudflare Pages, SSL Full, GitHub push'ta auto build + deploy).

**URL yapısı:**
- `prochefdesk.com/` → landing page
- `prochefdesk.com/app/` → app (login + tüm araçlar)
- `prochefdesk.com/blog/` → 13 SEO yazı + index
- `prochefdesk.com/privacy.html`, `/terms.html` → 6 dil, app'ten bağımsız stil
- Eski paylaşım linkleri (`prochefdesk.com/?share=xxx`) → JS sniffer ile `/app/?share=xxx`'e auto redirect

**Repo:** `C:\Users\ahmet\Desktop\prochefdesk` → GitHub: `ahmetkayas1926/prochefdesk` → Cloudflare Pages auto-deploy.

## 2. Mevcut Durum

**Ürün canlı ve aktif kullanımda.** Operatör profesyonel şef olarak kendi restoranının gerçek tariflerini sisteme yüklemiş, gündelik mutfak operasyonunda kullanıyor.

Yeni Claude'un bilmesi gereken: **bu hâlâ tek kullanıcılı bir ürün** — operatör + birkaç yakın şef arkadaşı. Roadmap'te 50+ aktif kullanıcı + %40 retention hedefine ulaşmadan paid tier / büyük marketing yatırımı yapılmıyor.

### 2.1 Son session özeti (2026-05-19, NAKED→RICH sweep + büyük audit/sertleştirme)

**Geride bırakılan sürümler (kronolojik tersine):**
- **v2.9.30 LOCAL ONLY** (henüz push edilmedi) — **hCaptcha challenge popup viewport fix.** v2.9.29 fix sonrası operatör test etti: checkbox tıklamasına UI cevap veriyor, AMA challenge popup ekranın üst kenarına yapışıyor → resim soruları viewport dışında. Root cause: `modal.js` scroll lock pattern body'i `position: fixed; top: -scrollY` ile sabitliyordu → hCaptcha popup body-relative koordinatla yerleşince ofsetli kaydı. Fix: scroll lock `html/body { overflow: hidden }` pattern'ine geçti. Tüm modal'ları etkiler ama desktop + Android Chrome'da sorunsuz; iOS Safari (zaten test edilmemiş) gelecekte cihaz testinde değerlendirilir.
- **v2.9.29 LOCAL ONLY** (henüz push edilmedi) — **hCaptcha checkbox fix.** Operatör DevTools kanıtı ile root cause bulundu: hCaptcha resmi error mesajı `"render=explicit should be used in combination with onload"` Console'da görünüyordu (CLAUDE.md'de yanlışlıkla "cosmetic" diye not edilmişti). v2.6.82'den beri `script.onload` pattern silent broken — widget çiziliyor ama event handler attach olmuyor. Fix: `account.js` `?onload=__pcdHcaptchaOnLoad&render=explicit` URL param + `window.__pcdHcaptchaOnLoad` callback. v2.9.26'da denenmişti ama o sırada CSP de eklenmişti, izole değildi. Şimdi CSP yok, temiz fix.
- **v2.9.28** (production) — **REVERT v2.9.24 CSP + hCaptcha onload + photo sanitize.** v2.9.24-27 deneme katmanları operatör akışını bozdu (hCaptcha widget tıklama yok, Discover photo yüklenmiyor). Tam revert: CSP meta + SRI + photo url() quote wrap + hCaptcha onload pattern hepsi geri çekildi. Korunan: recipe_likes RLS sıkı policy + RPC, orphan i18n silme, window.print fix, missing i18n key'ler, doc accuracy.
- **v2.9.27** (production) — hCaptcha CSP `'unsafe-eval'` ekleme denemesi + Discover photo debug log (yetmedi, v2.9.28'de revert).
- **v2.9.26** (production) — hCaptcha `?onload=` URL param pattern (yetmedi, v2.9.28'de revert).
- **v2.9.25 production** — CSP follow-up fix: `static.cloudflareinsights.com` script-src'ye, photo URL regex relax (`()` ve `'` allow, sadece quote/backslash/newline/angle reject), hCaptcha için `worker-src 'self' blob:` + `child-src`.
- **v2.9.24 production** — Standart SaaS hijyen pass (3 paralel audit agent sonrası): discover.js XSS sanitize, recipe_likes RLS sıkı (migration `v2.9.24-recipe-likes-rls-tighten.sql` çalıştırıldı + onaylandı), CSP meta + X-Content-Type-Options + Referrer-Policy, Supabase SRI hash (sha384), 5 orphan i18n dosya silindi (phase2/3/4/4-1/v17.js), 2 window.print → PCD.print, 4 hardcoded toast i18n, ~25 missing i18n key eklendi, recipe_likes BACKUP_TABLES'a eklendi, HANDOVER stale numbers düzeltildi (16→18 lazy tool, 18→21 ws-bound, 21→24 realtime, 25→29 RLS, supabase-functions/ silindi notu kaldırıldı).
- **v2.9.17 + v2.9.18 production** — Cloud sync 3 yeni tablo (buffets, mise_plans, team — backlog #2 kapatıldı) + Discover view spam rate limit Edge Function `rate-limited-view` (backlog #7).
- **v2.9.0-23 production** — NAKED→RICH sweep TAMAMLANDI (13 araç buffet seviyesinde) + Kitchen Cards 4-fix paketi (sub-recipe ?, scroll teleport gerçek fix, overflow auto-fit, canvas usage indicator + bulk select).

### 2.2 Bekleyen / bilinen test gerekleri

- **✅ v2.9.30 push edildi + operatör doğruladı 2026-05-19.** Report an issue formu ucundan uca çalışıyor: "I am human" tıklanıyor (v2.9.29 fix), challenge popup ekran ortasında açılıyor + Skip butonu çalışıyor (v2.9.30 fix). Bu iki fix BİRLİKTE çalışıyor — gelecek Claude ikisinden birini bozarsa akış tekrar kırılır (CLAUDE.md gotcha'larında "YENİ CLAUDE BU PATTERN'I BOZMA" uyarısı var).
- **v2.9.28 push edildi** (operatör daha önce push etti). Push'a dahil dosyalar: `app/index.html` (CSP + SRI kaldırıldı), `app/js/tools/discover.js` (photo direct URL'ye geri), `app/js/tools/account.js` (hCaptcha v2.6.83 script.onload pattern — v2.9.29'da güncellendi), `app/js/core/config.js` (APP_VERSION=2.9.28), 3 doc (CLAUDE/HANDOVER/CHANGELOG).
- **Discover photo testi** — chef'in paylaştığı recipe'lerde photo'lar (Lamb Shank vb.) Discover feed'de tekrar görünmeli. Hâlâ boş görünen recipe'ler varsa root cause sync race değil (CSP kalktı), `d.photo` cloud'da boş kalmış olabilir → recipe'i editör'de aç → Save → 5sn bekle → Discover Refresh.
- **Migration `v2.9.24-recipe-likes-rls-tighten.sql` ZATEN ÇALIŞTIRILDI** (operatör onayladı, policy `auth.uid() = user_id`). RPC `pcd_get_recipe_like_count(text)` aktif. Bu DB tarafı korundu, revert SADECE frontend.
- **Edge Function `backup-to-r2` v4 zaten deploy edildi** (v2.9.24'te recipe_likes BACKUP_TABLES'a eklenmişti). Yeni deploy gerekmez.

### 2.3 Aktif Edge Function'lar (4 deployed)

`backup-to-r2` (v2.9.24'te re-deploy edildi — recipe_likes BACKUP_TABLES'ta), `cleanup-photos`, `delete-account`, `rate-limited-view` (v2.9.18'de yeni deploy).

## 3. Frontend Stack

- Vanilla JavaScript, no bundling, no service worker
- ~24,000+ satır JS + ~7,700 satır i18n
- IndexedDB ana storage (write-only, v2.6.92'den beri)
- PWA (Android Chrome'da install ✅, iOS Safari **test edilmedi**)
- 6 dil i18n (EN/TR/ES/FR/DE/AR), sadece EN ve TR dolu. Diğer 4 dil EN fallback. Yeni i18n key sadece **en.js + tr.js**'e eklenir.
- **Cache-busting (v2.8.0+):** `app/index.html`'de `?v=__VERSION__` placeholder'ları (49 yerde). Cloudflare build command (`node build.js`) `app/js/core/config.js`'teki `APP_VERSION` ile replace eder. Sürüm bump'ı **sadece config.js**'i değiştirir.

### Repo dosya yapısı

**Repo kök:**
- `index.html` — Landing page (modern SaaS, ~600 satır, Inter/Fraunces font)
- `privacy.html`, `terms.html` — 6 dil, app'ten bağımsız stil
- `build.js` — Cache-busting injection
- `app/` — uygulama
- `blog/` — 13 SEO yazı + index.html
- `migrations/` — 18 SQL migration (en yenisi v2.9.18-discover-view-rate-limit)
- `supabase/functions/` — 4 Edge Function (delete-account, backup-to-r2, cleanup-photos, rate-limited-view)
- `docs/DISASTER_RECOVERY.md` — restore prosedürü (prod'da test edildi)
- `sitemap.xml`, `robots.txt` — SEO altyapı
- `CLAUDE.md`, `HANDOVER.md`, `CHANGELOG.md`

**`app/js/core/` (16 modül):**
allergens-db.js, app.js, auth.js, cloud-pertable.js, cloud-realtime.js, cloud.js, config.js, i18n.js, idb-wrapper.js, photo-storage.js, qr.js, router.js, share.js, store.js, utils.js, variance.js

**`app/js/tools/` (30 dosya, 13 kullanıcıya görünen ana tool):**
account, allergens, buffet, checklist, dashboard, discover, events, haccp + 4 alt-form (cooling/holding/logs/receiving), ingredients, inventory, kitchen_cards, menu_matrix, menus, mise, nutrition, portion, recipes, sales, shopping, suppliers, team, tools-hub, variance, waste, whatif, yield.

**Kullanıcıya görünen 13 ana tool (v2.8.78 lazy-loaded):** Recipes, Ingredients, Menu Builder, Kitchen Cards (A4 print), Portion Calculator, Shopping List, Inventory, Suppliers, Events & Catering, Checklists, HACCP Hub, Buffet Planner, Mise en Place. Discover, Allergens ek.

## 4. Cloud / Backend (Supabase)

**Project ref:** `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, **Free tier**)

### 29 Aktif tablo (v2.9.18)

**Workspace-scoped (21):** recipes, ingredients, menus, events, suppliers, canvases, shopping_lists, checklist_templates, inventory, waste, checklist_sessions, stock_count_history, haccp_logs, haccp_units, haccp_readings, haccp_cook_cool, haccp_receiving (v2.8.44), haccp_holding (v2.8.44), **buffets** (v2.9.17), **mise_plans** (v2.9.17), **team** (v2.9.17)
> Hepsinde `workspace_id` + `user_id` PK, `data` jsonb, `deleted_at` timestamptz.

**Top-level (8):** workspaces (flat schema), workspace_tombstones, user_prefs, public_shares, client_errors (insert-only), subscriptions, recipe_likes (v2.8.46, Discover Phase 2), **discover_view_logs** (v2.9.18, rate limit).

**Sadece IDB (cloud sync YOK):** Yok — v2.9.17'de buffets + misePlans + team tamamlandı.

**DROP edilmiş:** `user_data` (v2.6.87), `cost_history` (v2.6.88). Frontend referansları temizlendi.

**Discover ek kolonlar (v2.8.46):** `recipes` tablosuna `view_count` + `like_count` integer + 2 partial index. Anon + auth için RLS policy: `data->>'isPublic' = 'true'` herkese SELECT açık.

### Cascade trigger zinciri (v2.6.98 + v2.7.0)

| Trigger | Olay | İş |
|---|---|---|
| `trg_cascade_workspace_tombstone` | INSERT on workspace_tombstones | `cascade_soft_delete_workspace_data()` → 21 tablo + workspaces deleted_at SET |
| `trg_reverse_cascade_workspace_tombstone` | DELETE on workspace_tombstones | `cascade_restore_workspace_data()` → 21 tablo + workspaces deleted_at NULL |

### DB Function'ları

- `cascade_soft_delete_workspace_data()` (v2.6.98)
- `cascade_restore_workspace_data()` (v2.7.0)
- `pcd_cleanup_old_deleted()` (v2.6.97) — 30 gün eski soft-deleted satırları siler
- `pcd_purge_workspace()` (v2.7.6) — Trash UI "Delete forever" için atomik silme
- `increment_recipe_view(text)` (v2.8.46) — Discover view counter, anonymous EXECUTE
- `pcd_update_like_count` (v2.8.46) trigger — `recipes.like_count`'u `recipe_likes COUNT(*)`'tan senkron

### 4 Aktif pg_cron Job

| Job | Schedule (UTC) | Süre limit |
|---|---|---|
| nightly-backup-to-r2 | 03:00 her gün | 60sn |
| pcd-cleanup-old-deleted | 03:00 her gün | — |
| pcd-cleanup-photos-weekly | Pazar 04:00 | — |
| pcd-cleanup-view-logs (v2.9.18) | Her saat başı (0 * * * *) | — |

### Realtime: 24 tablo subscribed (v2.9.17)

21 tablo + v2.9.17'de `buffets` + `mise_plans` + `team` (3 array tablosu) eklendi. Total 24 ws-bound table'da realtime aktif.
**CHANNEL_ERROR çözüldü:** v2.8.43 — explicit `realtime.setAuth(token)` + `TOKEN_REFRESHED` dinleyici. Multi-device canlı sync güvenilir.

### 4 Edge Function (deployed)

- **`backup-to-r2`** v4 (v2.9.17, BACKUP_TABLES'a 3 yeni tablo eklendi: buffets + mise_plans + team; **operatör re-deploy etmeli**). Per-table tabloyu jsonl olarak R2'ye yazar. 30-day retention. **Foto bytes yedeklenmiyor**, sadece manifest.
- **`cleanup-photos`** — Storage orphan foto temizliği. `x-cleanup-secret` header zorunlu.
- **`delete-account`** — v2.8.50 fix (user_data DELETE bloğu kaldırıldı).
- **`rate-limited-view`** (v2.9.18 YENİ, operatör deploy etmeli) — Discover view counter rate limit. POST recipe_id, IP header'dan çıkarır, `pcd_rate_limited_view_bump` RPC (service_role) çağırır. 60dk window per (IP, recipe).

**R2 bucket:** `prochefdesk-backups`. Restore prod'da test edildi. **Public Access KAPALI olmalı** — operatör görsel kontrol.

### Storage / Auth

- **Storage:** `recipe-photos` bucket — **PUBLIC bucket**, RLS path-based write (`{user_id}/...`). SELECT herkes (Discover anonymous `<img>` için zorunlu); INSERT/UPDATE/DELETE sadece owner.
- **Auth:** Email + Google OAuth (production'da aktif). Redirect URLs whitelist: `https://prochefdesk.com/app/**`.

## 5. Tamamlanmış İşler (kategori özeti)

Tek tek sürüm detay → `CHANGELOG.md`. Aşağıda kategori-bazlı yüksek-seviye özet.

| Faz | Konu | Sürümler |
|---|---|---|
| **Altyapı** | Per-table sync schema + RLS + cascade triggers + cron + Trash UI + IndexedDB migration + queue persistence | v2.6.66 — v2.7.7 |
| **Cache & URL** | Cache-busting (build.js + __VERSION__) + App `/app/` altına taşındı + bug fix arc | v2.8.0 — v2.8.5 |
| **Lansman** | Landing + Privacy/Terms refresh | post-v2.8.5 |
| **UX modernize Faz 1** | Units + i18n + allergen override + Kitchen Cards + Recipes list redesign + isSubRecipe model | v2.8.19 — v2.8.31 |
| **Sync reliability** | Drift detection + auto-retry + ambient sync indicator | v2.8.32 — v2.8.33 |
| **Backlog sweep 1** | Debounce, restore compare, Cook&Cool aylık form, allergen auto-detect kaldır, 2 yeni HACCP form + cloud sync, i18n round 1+2, Discover Faz 1+2, dietFlags, Realtime JWT fix | v2.8.34 — v2.8.47 |
| **Cross-browser + edge fix** | Safari backdrop-filter prefix + delete-account false-error | v2.8.49 — v2.8.50 |
| **Print/UX polishing** | HACCP print tek-sayfa + recipe preview share + ingredient separator + standart footer + KC print preview + drag-drop + KC arama + Discover snapshot fix | v2.8.51 — v2.8.58 |
| **Checklist polishing** | Boş template print + drag-drop editor + session compact + multi-column + kategori şerit + hint + library | v2.8.59 — v2.8.65 |
| **Recipe + Media polish** | Discover ingredient "(?)" fix + 1:1 photo standardı + Menu Builder modernization | v2.8.66 — v2.8.68 |
| **Mimari fix** | **Sub-recipe ingredient flattening helper** (6 modüle bağlandı) | v2.8.69 |
| **Tool consolidation + yeni** | HACCP Hub + Allergen Guardrail + Cost Health + **Buffet Planner** + **Mise en Place** + Tag system + Buffet inline guide | v2.8.70 — v2.8.77 |
| **Performance** | Boot perf L1 (defer/preload) + L2 (lazy xlsx/i18n/16 tool router) + a11y viewport | v2.8.76 + v2.8.78 |
| **Buffet overhaul** | 4 item type + Excel + UX + R2 backup fix | v2.8.79 |
| **UX hijyen** | Recipe ingredient editor birleştirme + Modal focus root cause + Discover author + Buffet input focus + Welcome tour modernize | v2.8.80 — v2.8.83 |
| **Profile↔Discover** | Author profile-priority + Save profile auto re-enrich + preview modernize + form etiket güncel + Discover live fallback | v2.8.84 — v2.8.85 |
| **Excel bug fixes** | try/catch debug + Buffet list Cost Report parite + menu-item scope fix | v2.8.86 — v2.8.87 |
| **Buffet UX modernize** | Smart defaults + Stats hero + status label + list search + compact item + Quick Start preset chooser (7 preset) | v2.8.88 + v2.8.89 + v2.8.93 |
| **i18n Round 3** | Print/Excel/share surface dil senkronizasyonu (6 dosya 40+ hardcoded → t() + 48 yeni key) | v2.8.90 |
| **Dashboard + Tools-hub** | Inline guide panel + new chef Get started 3-card + Tools-hub phase grouping | v2.8.91 |
| **Portion Calculator UX** | Step 1 (Guest count) kaldır + intro/help kart + Avg per portion + signature refactor | v2.8.92 |
| **Blog SEO** | Faz A: 3 mevcut yazı upgrade (JSON-LD + authority + cross-link). Faz B: 10 yeni yazı 5 round'da (Buffet Cost, Iftar, Cook & Cool, Yield %, Mise en Place, Recipe Scaling, Kitchen Cards, Par Levels, Waste Tracking, Allergen Menu). Total **13 yazı yayında**. | v2.8.94 — v2.8.99 |
| **Ops (Marketing/SEO)** | Blog altyapı + sitemap + robots + meta tag sweep + GSC verify + edge function deploy + backup function v3 + DISASTER_RECOVERY.md | 2026-05-18 |

## 6. Yapılacaklar

### Sıradaki büyük iş: v2.9.x — NAKED araç sweep

Operatör vizyonu: her araç Buffet Planner seviyesinde RICH. 13 araç paketleri halinde, her tur 2-3 araç bump.

| Tur | Araçlar |
|---|---|
| v2.9.0 | yield + waste + variance |
| v2.9.1 | nutrition + allergens + mise |
| v2.9.2 | discover + account + team |
| v2.9.3 | sales + whatif + menu_matrix |
| v2.9.4 | haccp hub UX upgrade |

**Her tur baseline:** kapatılabilir inline guide + per-field hint + örnek placeholder + empty state onboarding (v2.8.77 buffet pattern).

### Açık backlog (öncelik sırası)

1. **iOS/Safari cross-browser test** — v2.8.49 kod tarama temiz; gerçek cihaz testi operatör tarafına bekliyor.
2. ~~**Buffet + Mise cloud sync**~~ ✅ **v2.9.17'de kapatıldı** (buffets + mise_plans + team 3 tablo).
3. ~~**Discover'a Tag + Allergen filter**~~ ✅ **v2.9.15-16'da kapatıldı.** Backfill notu: mevcut public recipe'lerde `computedAllergens` yok; chef her recipe'i bir kez açıp save edince embed olur.
4. ~~**Categories functional**~~ ❌ **Operatör v2.9.18'de listeden çıkardı** (gereksiz).
5. ~~**`supabase-functions/` duplicate silme**~~ ✅ **v2.9.18'de kapatıldı** (klasör silindi).
6. ~~**Buffet Excel footer**~~ ✅ **v2.9.14'te kapatıldı.**
7. ~~**Discover view count rate limit**~~ ✅ **v2.9.18'de kapatıldı** (Edge Function + saatlik cleanup cron).
8. **R2 backup foto bytes yedekleme** — şu an sadece manifest. Solo workflow için kabul edilebilir; Pro tier'da Storage PITR çözer. Operatör v2.9.18: "para ödeyecek miyim → şimdilik kalsın".
9. ~~**App boot perf L3**~~ ❌ **Operatör v2.9.18'de listeden çıkardı** (yüksek risk).
10. **CHANGELOG.md otomatize CI hook** — manuel hatırlamayla yapılıyor; ileride opsiyonel.

## 7. ❌ Önerme

| İş | Neden |
|---|---|
| Pricing / paid tier / Stripe | 50+ aktif kullanıcı + %40 retention kanıtlanmadan yok |
| AI image gen entegrasyonu | Operatörün kendi GPU donanımı var (RTX 5090 24GB), ürüne entegre gereksiz |
| Demo seed değişikliği | Mevcut hali iyi |
| Türkçe landing page | Operatör erteledi |
| Screenshot ekleme | Operatör kendisi çekecek |
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
9. **Operatör bir sorunla geldiğinde genel cevap verme.** Önce DevTools console + kod ile mevcut uygulamanın gerçek durumuna göre nokta atışı teşhis yap. Tahmin değil, kanıt.
10. Yeni özellik önermeden önce repo'da grep ile var mı kontrol et.
11. GitHub Desktop GUI ile push edilir, terminal/cmd değil.

### Sürüm yönetimi
12. Sürüm bump'ı SADECE `app/js/core/config.js` `APP_VERSION` satırını değiştirir.
13. `app/index.html`'e literal sürüm yazılmaz — `__VERSION__` placeholder'ları build.js inject eder.
14. CHANGELOG yönetimi: oturum boyunca yapılan işleri düzenli not al. Operatör "güncel CHANGELOG hazırla" dediğinde temiz, organize biçimde hazırlanır.
15. DB-only migration kendi sürüm numarası alabilir (frontend sürüm atlayabilir).

### Onay zorunlu
16. DROP TABLE / destructive SQL
17. 50+ satır frontend değişikliği
18. Yeni dosya/modül ekleme
19. Cron schedule / RLS policy değişikliği
20. Cross-device sync mantığı değişikliği (cloud.js, cloud-pertable.js, cloud-realtime.js)
21. Edge Function deploy

### Backlog & memory
22. Claude memory özelliği KAPALI. Backlog tek kaynağı: bu dosya §6.
23. Yapılacaklar listesini güncellemeden önce operatöre göster, doğrulat.
24. "Tamamlandı" bilgisi memory'den varsayılmaz — repo'da kontrol veya operatöre sorulur.

## 9. Önemli Yerler / Değerler

| | |
|---|---|
| Repo path (operatör Windows) | `C:\Users\ahmet\Desktop\prochefdesk` |
| GitHub repo | `ahmetkayas1926/prochefdesk` |
| Production sürümü | **v2.9.33** (push'a hazır local; production v2.9.32) |
| Supabase project ref | `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, Free tier) |
| Cloudflare R2 bucket | `prochefdesk-backups` |
| CLEANUP_SECRET | `ec79a445-7e92-499b-9322-5c2c949788d4d2886e66-d556-4498-ba9e-17fda6c11ac1` |
| Operatör e-posta | ahmetkaya.s1926@gmail.com |
| App e-posta | hello@prochefdesk.com (Cloudflare Email Routing → Gmail) |
| Test edilmiş platformlar | Desktop Chrome ✅, Android Chrome (PWA install) ✅ |
| Test edilmemiş | iOS Safari + Safari macOS + Chrome iOS |
| Cloudflare Pages build command | `node build.js` |
| Aylık altyapı maliyeti | $1 (sadece domain). 50 aktif kullanıcıya kadar Supabase Free tier. |

### Push Öncesi Rutin Kontrol Listesi (v2.8.50 audit sonrası eklendi)

Her büyük push'tan önce operatör Cloudflare/Supabase Dashboard'dan görsel olarak doğrulayacak:

1. ☐ **R2 bucket Public Access KAPALI** — Cloudflare R2 → `prochefdesk-backups` → Settings. Açıksa felaket.
2. ☐ **OAuth Redirect URLs whitelist** — Supabase → Authentication → URL Configuration → `https://prochefdesk.com/app/**` listede mi?
3. ☐ **3 cron job son run tarihi** — son 1-2 gün içinde çalışmış mı?
4. ☐ **Migration'lar Dashboard'da çalıştırıldı mı** (varsa) — push'tan ÖNCE.
5. ☐ **Edge function deploy gerek mi** — `supabase/functions/*` değişti mi?

## 10. Yeni Claude Başlangıç Kontrol Listesi

1. ☐ Bu HANDOVER.md tamamen okundu mu?
2. ☐ CLAUDE.md okundu mu? (Claude Code'sa otomatik yüklenir.)
3. ☐ CHANGELOG.md son entry'leri okundu mu?
4. ☐ §7 YAPMA listesi okundu mu? Bu işleri önerme.
5. ☐ §2 mevcut durum: ürün canlı, aktif kullanım.
6. ☐ Bir iş yapmadan önce: bu iş zaten yapıldı mı? §5 ve repo'da grep ile kontrol et.
7. ☐ DB durumunu varsayma — gerekiyorsa SQL ile sor.

## 11. Mimari Kurallar (gotcha'lar)

### 11.1 Cloud sync race condition
UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, arada explicit `await PCD.cloudPerTable.flushNow()` olmalı. Yoksa debounced sync tamamlanmadan reload tetiklenir → "verim kayboldu" raporu gelir.

### 11.2 PCD.icon registry — silent info fallback
`PCD.icon(name, size)` registry'de olmayan isim verince sessizce info ikonuna fallback yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) kabul etmez. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js`.

### 11.3 Per-table sync akışı (3 yönlü)

| Yön | Mekanizma |
|---|---|
| **Push** (local→cloud) | `cloud-pertable.js` UI yazımlarını dinler, 1.5sn debounce ile Supabase'e UPSERT/DELETE. v2.8.33: auto-retry (1s/2s backoff, 3 deneme transient hatalar için). |
| **Pull** (cloud→local) | `cloud.js` boot'ta workspace-scoped + user-scoped tablolardan kullanıcı satırlarını çeker. **v2.8.33: drift detection** — local'de olup remote'ta olmayan kayıt otomatik queueUpsert'lenir (self-healing). v2.8.44'te haccp_receiving + haccp_holding pull'a eklendi. |
| **Realtime** (cloud→local canlı) | `cloud-realtime.js` 24 tabloya WebSocket subscribe (v2.9.17 sonrası). v2.8.43'te JWT setAuth + TOKEN_REFRESHED dinleyici ile CHANNEL_ERROR çözüldü. |
| **Queue persistence** (v2.6.95+) | `cloud-pertable.queue` her mutation'da IDB'ye yansır. Boot'ta restore. |

Sync bug'ında ÖNCE hangi yön sor — push mu, pull mu, realtime mı, queue mu? Tahmin yürütme.

### 11.4 v2.8.33 sync güvenilirlik katmanları

3 katman sync deneyimini sessizce ayakta tutar:
1. **Drift detection** (cloud.js pull akışında) — local-cloud uyumsuzluğu pull sırasında otomatik iyileşir.
2. **Auto-retry** (cloud-pertable.js) — transient hatalar için 1s + 2s backoff ile 3 deneme.
3. **Ambient sync indicator** (app.js) — sağ alt köşede 10px floating dot (Syncing mavi pulse / synced yeşil / offline gri / error kırmızı).

### 11.5 RLS aktif (tüm 29 tablo)
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
- **Üye (login var):** IDB + cloud çift yönlü. Realtime aktif.

Yeni feature: misafir kullanıcı için cloud push tetiklenmemeli (v2.6.93'te bu sızıntı kapatıldı).

### 11.8 `app/index.html` sürüm string'i ASLA literal yazılmaz
49 yerde `?v=__VERSION__` placeholder yaşar. `node build.js` deploy zamanı replace eder. Sürüm bump için tek dokunulan yer: `app/js/core/config.js` APP_VERSION satırı.

### 11.9 Root dosyalar (landing, privacy, terms, blog/) app'ten BAĞIMSIZ

`index.html`, `privacy.html`, `terms.html`, `/blog/*.html` — hepsi kendi inline CSS'i var. App CSS değişiklikleri etkilemez, tersi de. Sadece **brand tutarlılığı** için: renk (green #16a34a brand CTA, #2D4A3E primary editorial), font, "PC" mark hep tutarlı.

**Font seçimi:**
- Landing (`index.html`): Inter
- Legal (`privacy.html`, `terms.html`): Fraunces (serif başlık) + Manrope (sans body)
- Blog (`/blog/*.html`): Fraunces (serif başlık) + Inter (sans body)

**Palette farkları:**
- Landing: `#fafaf9` bg, brand green CTA dominant
- Legal + blog: `#FAF7F2` cream paper bg, `#2D4A3E` deep forest editorial accent, brand green sadece CTA + "PC" mark'ta

### 11.9.1 Blog ekleme prosedürü

`prochefdesk.com/blog/` altında her yazı **standalone HTML**. Build step / template engine YOK.

**Yeni yazı eklemek (~30 dk):**
1. Mevcut bir post HTML'i kopyala → `/blog/your-slug.html`
2. `<head>` meta tag'ler güncel: `<title>`, `<meta description>`, `<link rel="canonical">`, tüm `og:*`, tüm `twitter:*`, `og:image`, `article:published_time`
3. **JSON-LD Article schema** (v2.8.94 standardı) — `headline` + `description` + `datePublished` + `dateModified` + `author` + `publisher` + `mainEntityOfPage` + `wordCount` + `keywords`
4. `<article>` içeriği yaz (1500-2000 kelime)
5. **Body içinde ≥1 authority outbound link** (gov/akademik, `target="_blank" rel="noopener"`)
6. **Footer'dan önce `<section class="related-posts">`** 2-card cross-link (eski yazılara)
7. `/blog/index.html` en üste yeni `<a class="post-card">` blok (newest first)
8. `/sitemap.xml`'e yeni `<url>` + tüm etkilenen `<lastmod>` güncel
9. Push → Cloudflare Pages otomatik yayınlar
10. **Operatör manuel:** Google Search Console → URL Inspection → "Request Indexing"

**SEO standartı per post:**
- `<title>` 60 karakter altı, "— ProChefDesk" suffix
- `<meta description>` 155 karakter altı, ilk cümle hook
- `og:image` + `twitter:image` 1200×630 px PNG (henüz placeholder URL'ler)
- `article:published_time` ISO YYYY-MM-DD
- `<link rel="canonical">` absolute https URL

**Stil değiştirmek:** her post kendi inline `<style>` taşır. Bir postu değiştirmek diğerlerini etkilemez. Genel stil değişimi için her dosyayı tek tek edit et (DRY değil ama Cloudflare'de bundling yok; bilinçli takas).

### 11.9.2 SEO altyapısı
- `sitemap.xml` (root) — tüm public sayfalar. Blog ekleme talimatı yorum bloğu içinde.
- `robots.txt` (root) — `Disallow: /app/` + `Sitemap:` satırı.
- `index.html` `<head>` — GSC verification meta-tag (2026-05-18 operatör verify etti, sitemap submit).

### 11.10 isSubRecipe data model (v2.8.26)

Recipe `isSubRecipe: boolean` alanı tutar (default `false`). `PCD.recipes.isPrep(r)` helper:
```javascript
typeof r.isSubRecipe === 'boolean'
  ? r.isSubRecipe
  : !!(r.yieldAmount && r.yieldUnit)  // legacy fallback
```
Tüm prep/menu ayrımı bu helper'dan geçer. Yield bilgisi (yieldAmount, yieldUnit) factual üretim miktarı; classification'dan ayrı.

### 11.11 Print akışı standartları (v2.8.54-v2.8.55)

`PCD.print(html, title)` (utils.js) tüm yazdırma akışlarının **tek noktası**:

- **Footer otomatik enjekte edilir.** Custom footer YAZMA, `.pcd-print-footer{display:none}` override KOYMA.
- **Window boyutu 1200×850px** (sabit). Daha küçük yapma — Kitchen Cards landscape A4 (≈1122px) body sizing'i taşırır, CSS multi-column hesaplaması bozulur.
- **Caller HTML formatı:** PCD.print full HTML veya partial content kabul eder. Partial → wrapper + style + toolbar otomatik. Full → sadece footer enjekte (body close öncesi).
- **A4 zorlanan body sizing print-only @media içinde olmalı** veya viewport'a göre seçmeli — aksi halde popup preview ile gerçek print farklı görünür.

### 11.12 Çoklu kullanıcı / paid tier hazırlığı
`subscriptions` tablosu DB'de hazır, kullanılmıyor. Operatör 50+ aktif kullanıcı + %40 retention kanıtlanana kadar paid tier eklemiyor.

### 11.13 App boot performansı (L1 + L2 uygulandı)

**Başlangıç tanı (v2.8.75 öncesi):** ~1.9MB local JS, Mobile PageSpeed FCP/LCP 5.6 sn / 65 puan, TBT=0/CLS=0 (network bound).

**L1 (v2.8.76):** Tüm `<script>` tag'lerine `defer` + 2 CDN'e `<link rel="preload">` + `preconnect` + `dns-prefetch`. PageSpeed 65→72.

**L2 (v2.8.78):** (a) viewport zoom unblock (WCAG a11y +5), (b) xlsx-js-style lazy (~500KB), (c) i18n lazy (sadece `en.js` eager + dinamik `loadLocaleBundle(locale)`, ~150KB), (d) 18 tool lazy router (~450KB; dashboard + account + inventory eager kalır). Toplam boot bundle ~1.1MB azalış. Beklenen PageSpeed 72→85, LCP 7.0→3.0-3.5 sn.

**L3 — yüksek risk, önerilmedi:** Cloud sync'i ilk paint sonrasına erteleme. Multi-device "veri kayıp" hissi riski.

**L4 (rewrite) — kapsam dışı:** ESM modules + Service Worker pre-cache. Mimari "no bundling, no SW" kararıyla çelişir.

### 11.14 Sub-recipe ingredient flattening (v2.8.69)

`PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) — recipe'in tüm sub-recipe satırlarını recursive olarak gerçek ingredient seviyesine düşürür.

**Özellikler:**
- Scale cascading: `ri.amount / sub.yieldAmount` her seviyede çarpılır
- Birim dönüşümü: `PCD.convertUnit` ile best-effort (mismatch'te orijinal kalır)
- Cycle protection: visited set ile A→B→A engellenir
- Separator skip: `ri.separator` satırlar atlanır
- Output: her item `{ingredient, ingredientId, amount, unit, viaSubRecipe}` (viaSubRecipe = en sığ kaynak adı, gri italik "via Labneh" gösterimi için)

**Bağlı 6 modül:** portion.js (canvas + print + share), shopping.js (consolidation + by-recipe group), nutrition.js, allergens-db.js (recipeAllergens), dashboard.js (computeDietCompat).

**Variance.js DOKUNULMADI** — kendi recursive sub-recipe handling'i var (v2.8.16+).

Yeni "tarif → ingredient listesi" ihtiyacında: bu helper'ı kullan.

### 11.15 Lazy tool loading + router (v2.8.78)

Router'da `registerLazy(name, scriptPath, toolName)` + `loadLazyTool()` helper. 18 tool dinamik script tag ile lazy.

**Eager tool'lar (3):**
- `dashboard` — default home, ilk açılış view'ı
- `account` — auth flow (logout, oauth callback)
- `inventory` — dashboard low-stock alert sync `computeStatus` kullanır

**Lazy tool'lar (18):** recipes, ingredients, menus, kitchen_cards, shopping, portion, waste, suppliers, events, checklist, haccp_logs, haccp_cooling, haccp_receiving, haccp_holding, haccp, buffet, mise, discover.

**Yeni tool ekleme:**
1. Eager mi lazy mi karar ver (default lazy)
2. `app/index.html`'e script tag EKLEME (lazy ise)
3. `router.registerLazy(name, scriptPath, toolName)` ekle
4. Dashboard click handler kullanılıyorsa `_afterToolLoad(toolName, cb)` poll pattern'i (120ms × 3sn)

Tool ilk açılışta 100-300ms network gecikme, sonrası browser cache instant.

### 11.16 xlsx + i18n lazy load (v2.8.78)

**xlsx:** `PCD.loadXLSX()` (utils.js) cached promise. xlsx-js-style (~500KB) CDN'den ilk Excel tıklamasında yüklenir. Wire'lı yerler: `recipes.js` cost report XLSX export, `ingredients.js` Excel import, `buffet.js` `exportBuffetXLSX()`.

**API gotcha:** `PCD.toast.info()` return value pattern'i güvenli değil. v2.8.79'da "loading-toast remove" pattern KALDIRILDI; sessiz lazy load + re-call yeterli.

**i18n:** `setLocale()` async — sadece `en.js` boot'ta baseline. TR/ES/FR/DE/AR `loadLocaleBundle(locale)` cached promise ile dinamik fetch. Yeni i18n key sadece **en.js + tr.js**'e eklenir.

### 11.17 HACCP Hub + Buffet/Mise tools

**HACCP Hub (v2.8.70):** 4 form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında yaşar. Mevcut 4 route DOKUNULMADI — bookmark + direct link korunur. Sidenav 18→15 item.

**Buffet Planner (v2.8.73 onwards):** Hotel/catering grade tool. Industry standards (`INDUSTRY_RATIOS` + `INDUSTRY_REFILL` + `INDUSTRY_TARGETS`). 7 preset + Start blank. **Cloud sync AKTİF (v2.9.17): `buffets` tablosu workspace-scoped array pattern (waste/team gibi), soft-delete tombstone.**

**Buffet item 3 tipte (v2.8.79):** item.recipeId / item.ingredientId / item.customName ayrımı. `computeItemCost` 3 path: (a) recipe → sub-recipe cost cascade, (b) ingredient → `pricePerUnit × (1/yield)`, (c) custom label → 0. Print/Excel paths üçünü de handle eder.

**Mise en Place Planner (v2.8.74):** Sabah prep listesi. Events + Buffets'ten otomatik prep aggregation, 5 faz grouping (Stocks & Bases / Sauces & Dressings / Protein & Marinade / Garnish & Veg / Final Setup). Sub-recipe expansion `flattenIngredients` ile. **Cloud sync AKTİF (v2.9.17): `mise_plans` tablosu (snake_case DB, camelCase state), soft-delete tombstone (rebuild dahil).**

**Team (workspace-scoped, v2.9.17):** Pre-v2.9.17 state global array idi; cloud sync ile workspace-scoped (her workspace kendi team'i). `readTeamAll` legacy array tespit edip current ws'e aktarır (data loss yok).

### 11.18 Recipe ingredient separator (v2.8.52)

`data.ingredients` array'inde yeni satır tipi: `{ separator: true, label?: '' }`.

**Hesap path'leri** (cost/diet/allergen/variance/integrity): `if (ri.separator) return;` skip etmeli.
- `dashboard.computeFoodCost` ✓
- `dashboard.resolveRow` separator için `{ found: false, isSeparator: true }` döndürür
- `dashboard.computeDietCompat` ✓
- `allergens-db.recipeAllergens` ✓
- `variance.js` ✓
- `store.findRecipesUsingIngredient` ✓

**Display path'leri** (editor + preview modal + Kitchen Card + share/print + text-share + Discover detail modal): görsel çizgi + opsiyonel uppercase label render eder. Share + Kitchen Card snapshot'larında separator alanı korunur.

Yeni `recipe.ingredients` üzerinde forEach yazarken iki path'ten birini seç.

### 11.19 Modal focus (v2.8.81)

`PCD.modal.open()` açılışta body'deki ilk form field'ına (input/textarea/select) focus eder — header'daki "X" close butonuna DEĞİL. `modal.js:192` selector `bodyEl` ile restrict + button çıkarılmış + disabled atlama. Özel field'a focus istersen modal açtıktan sonra setTimeout 300ms ile manuel `.focus()` çağır (recipe editor quick-add v2.8.6 pattern).

### 11.20 Blog SEO standardı (v2.8.94'te kurulan)

Her yeni blog yazısı şunları içermek zorunda:
1. **`<head>` içinde JSON-LD Article schema** — `headline` + `description` + `datePublished` + `dateModified` + `author.Person` + `publisher.Organization` + `mainEntityOfPage` + `wordCount` + `keywords`
2. **Body içinde ≥1 authority outbound link** — gov/akademik (USDA / FDA / FSANZ / Cornell / akademik), `target="_blank" rel="noopener"`
3. **Footer'dan önce `<section class="related-posts">` 2-card cross-link** — eski yazılara ("topic cluster" pattern)
4. **sitemap.xml** yeni `<url>` blok + tüm etkilenen `<lastmod>` güncel YYYY-MM-DD
5. **blog/index.html** en üste yeni `<a class="post-card">` blok (newest first)

**Push sonrası operatör manuel iş:** Google Search Console → URL Inspection → "Request Indexing" (1-2 günde indekslenir, otomatik bekleme 2-3 hafta).

## 12. Operatör Bağlamı

Operatör profesyonel şef, full-time mutfakta çalışmak fiziksel olarak zorlanıyor (bacak ağrısı, yaşlanma). ProChefDesk'i gradual transition aracı olarak görüyor — şefliği bırakmak değil, yan-zamanlıya çekip teknolojiden gelir tamamlayıcı yapmak.

**Donanım:** ASUS ROG Strix Scar 18 (RTX 5090 Laptop, 24GB GDDR7 VRAM). ComfyUI/Automatic1111/Kohya_ss kullanıyor. Faz 2 marketing içerik üretimi için (food photography, kısa videolar) bu donanım stratejik.

**Bilinen tercihler:**
- Manipülatif satış teknikleri istemiyor
- Karmaşık premium tier'lardan kaçınıyor (basit tek tier tercihi)
- Erken yatırımcı/exit konusuna kapalı (uzun vadeli, yan-iş zihniyetiyle)
- Acele kararlardan kaçınıyor — yeni Claude baskı yapmasın, destek versin
