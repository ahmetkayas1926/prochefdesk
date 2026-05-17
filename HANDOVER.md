# ProChefDesk — Operasyon Handover

> **Bu dokümanın amacı:** Yeni Claude session'ında hızlı devralma. Kabul et, varsayma. Önce oku, sonra çalış.
>
> Claude Code için kısa operasyonel rehber: **`CLAUDE.md`**.

## 1. Genel

**Ürün:** ProChefDesk — profesyonel chef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya, Perth Western Australia, profesyonel şef. Solo non-commercial proje.
**Mevcut sürüm:** **v2.8.57** (push'a hazır local; production v2.8.50 — operatör push edince Cloudflare Pages otomatik deploy eder).
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

### 22 Aktif tablo

**Workspace-scoped (16):** recipes, ingredients, menus, events, suppliers, canvases, shopping_lists, checklist_templates, inventory, waste, checklist_sessions, stock_count_history, haccp_logs, haccp_units, haccp_readings, haccp_cook_cool
> Hepsinde `workspace_id` + `user_id` PK, `data` jsonb, `deleted_at` timestamptz.

**Top-level (6):** workspaces (flat schema, jsonb yok), workspace_tombstones, user_prefs, public_shares, client_errors (insert-only), subscriptions (premium için boş).

**DROP edilmiş:** `user_data` (v2.6.87), `cost_history` (v2.6.88). Frontend referansları temizlendi.

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

### Realtime: 19 tablo subscribed

canvases, checklist_sessions, checklist_templates, events, haccp_cook_cool, haccp_logs, haccp_readings, haccp_units, ingredients, inventory, menus, recipes, shopping_lists, stock_count_history, suppliers, user_prefs, waste, workspace_tombstones, workspaces.

> **Bilinen sorun:** Console'da `cloud-realtime: subscribe failed CHANNEL_ERROR`. Solo workflow için kritik değil — pull-on-open + v2.8.33 drift detection veri kaybı riskini yok ediyor. Backlog'da bekliyor (madde 10).

### 3 Edge Function (deployed)

- `backup-to-r2` — v3 (2026-05-06). 23 per-table tabloyu (v2.8.44'te haccp_receiving + haccp_holding eklendi) jsonl olarak R2'ye yazar (`<YYYY-MM-DD>/<table>.jsonl` + summary.json + photos-manifest.json). 30-day retention. **Foto bytes'ı yedeklenmiyor**, sadece manifest — Supabase Storage kaybı = foto kaybı (kabul edilebilir trade-off, Pro tier'a geçince Storage PITR var).
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

8. ~~Discover MVP~~ → **✅ v2.8.41 (skeleton + isPublic toggle) + v2.8.46 (backend: anonymous SELECT RLS + recipe_likes + view counter RPC + like buton + view bumper)**
9. ~~Auto diet rebuild — küratörlü ingredient DB~~ → **✅ v2.8.45 (ingredient tri-state diet flags + computeDietCompat helper + recipe diet chips)**
10. ~~Realtime CHANNEL_ERROR~~ → **✅ v2.8.43 (explicit JWT setAuth + TOKEN_REFRESHED dinleyici)**
11. **Categories functional** ⏳ — şu an kozmetik. 50+ menu item olursa anlamlı.
12. **Marketing / SEO / blog kurulumu** ⏳ — ileri faz.

### Yeni bekleyen işler (audit sonrası)

13. **CHANGELOG.md güncel hazırla zincirleme commit yöntemi** — bu sürümde manuel hatırlamayla yapıldı (v2.8.34-v2.8.50). İleride otomatize edilebilir (CI hook: her commit'te entry kontrolü).
14. **`supabase-functions/` duplicate silme** — operatör Supabase Dashboard'dan deploy doğrulaması yapana kadar bekliyor.
15. **Discover view count rate limit** — `increment_recipe_view` RPC anonymous'a açık, spam riski (MVP'de kabul). Viral olursa Edge Function ile IP+recipe başına 1 saat 1 view.
16. **R2 backup foto bytes yedekleme** — şu an sadece manifest; Supabase Storage kaybı = foto kaybı. Solo workflow için kabul edilebilir; Pro tier'da Storage PITR var.

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
| Production sürümü | **v2.8.57** (push'a hazır local; production v2.8.50) |
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
| **Pull** (cloud→local) | `cloud.js` boot'ta 22 tablodan kullanıcı satırlarını çeker, IDB yazar, state merge. `pullInProgress` flag ghost duplicate önler. v2.8.3: pull akışı local-only ws'leri queueUpsert ile cloud'a iletir. **v2.8.33: drift detection** — local'de olup remote'ta olmayan her tablodaki kayıt otomatik queueUpsert'lenir (self-healing). |
| **Realtime** (cloud→local canlı) | `cloud-realtime.js` 19 tabloya WebSocket subscribe. v2.7.9 orphan channel leak fix, v2.8.5 init() çift subscribe path race silindi. Şu an CHANNEL_ERROR — solo workflow için kritik değil. |
| **Queue persistence** (v2.6.95+) | `cloud-pertable.queue` her mutation'da IDB'ye yansır. Boot'ta restore. v2.8.4 `clearQueue()` (logout cross-user leak önleme). |

Sync bug'ında ÖNCE hangi yön sor — push mu, pull mu, realtime mı, queue mu? Tahmin yürütme.

### 11.4 v2.8.33 sync mimarisi

Operatörün şu an gördüğü "her şey çalışıyor" deneyimini sağlayan 3 katman:

1. **Drift detection** (cloud.js pull akışında): local-cloud uyumsuzluğu pull sırasında sessizce iyileştirir. Restore başarısızlığı, transient push hatası, network kesintisi sonrası kalan local-only kayıtlar otomatik cloud'a gider.
2. **Auto-retry** (cloud-pertable.js): Transient hatalar (no status, 5xx, 408, 429, timeout/network keyword) için 1s + 2s backoff ile 3 deneme. Hard hatalar (RLS, 4xx) anında raporlanır.
3. **Ambient sync indicator** (app.js): Sağ alt köşede 10px floating dot. Syncing (mavi pulse), synced (yeşil, 2sn sonra solar), offline (gri), error (kırmızı, tıklayınca retry). DOM event `pcd-sync-status` ile besleniyor.

Force re-sync butonu **Account → Yardım** altına taşındı (v2.8.33), gündelik UI'da değil — troubleshooting aracı.

### 11.5 RLS aktif (tüm 22 tablo)

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

`index.html`, `privacy.html`, `terms.html` — üçü de kendi inline CSS'i var (Inter + green palette). App CSS değişiklikleri etkilemez, tersi de. Sadece **brand tutarlılığı** için: renk, font, "PC" mark hep tutarlı.

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

## 12. Operatör Bağlamı

Operatör profesyonel şef, full-time mutfakta çalışmak fiziksel olarak zorlanıyor (bacak ağrısı, yaşlanma). ProChefDesk'i gradual transition aracı olarak görüyor — şefliği bırakmak değil, yan-zamanlıya çekip teknolojiden gelir tamamlayıcı yapmak.

**Donanım:** ASUS ROG Strix Scar 18 (RTX 5090 Laptop, 24GB GDDR7 VRAM). ComfyUI/Automatic1111/Kohya_ss kullanıyor. Faz 2 marketing içerik üretimi için (food photography, kısa videolar) bu donanım stratejik.

**Bilinen tercihler:**
- Manipülatif satış teknikleri istemiyor
- Karmaşık premium tier'lardan kaçınıyor (basit tek tier tercihi)
- Erken yatırımcı/exit konusuna kapalı (uzun vadeli, yan-iş zihniyetiyle)
- Acele kararlardan kaçınıyor — yeni Claude baskı yapmasın, destek versin
