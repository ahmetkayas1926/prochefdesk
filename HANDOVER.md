# ProChefDesk — Operasyon Handover

> **Bu dokümanın amacı:** Yeni Claude session'da hızlı devralma. Kabul et, varsayma. Önce oku, sonra çalış.

## 1. Genel

**Ürün:** ProChefDesk — profesyonel chef'ler için web tabanlı mutfak yönetim sistemi.
**Operatör:** Ahmet Kaya, Perth Western Australia, profesyonel şef. Solo non-commercial proje.
**Production sürümü:** **v2.8.5** (2026-05-08) + lansman paketi (root landing page + Privacy/Terms refresh).
**Domain:** prochefdesk.com (Cloudflare Pages, SSL Full mode, GitHub push'unda otomatik build + deploy).

**URL yapısı:**
- `prochefdesk.com/` → landing page (lansman paketi)
- `prochefdesk.com/app/` → app (login + tüm tool'lar)
- `prochefdesk.com/privacy.html` → Privacy Policy (6 dil, app'ten bağımsız stil)
- `prochefdesk.com/terms.html` → Terms of Service (6 dil, app'ten bağımsız stil)
- Eski paylaşım linkleri (`prochefdesk.com/?share=xxx`) → JS sniffer ile otomatik `/app/?share=xxx`'e redirect.

**Repo:** `C:\Users\ahmet\Desktop\prochefdesk` → GitHub: `ahmetkayas1926/prochefdesk` → Cloudflare Pages auto-deploy.

## 2. Mevcut Durum (Kritik — Yeni Claude bunu anlamadan iş yapma)

**Ürün lansman aşamasında.** Operatör şu hafta sistemi kendisi kullanarak test ediyor (dogfooding). Sonraki hafta 5 yakın şef arkadaşına ücretsiz link gönderecek.

**Lansman stratejisi (operatör onaylı):**
- **Faz 1 (0-3 ay):** Validation. 5 arkadaş → her birinden 30 dk geri bildirim + 3 referans. Hedef: ürün gerçek değer üretiyor mu kanıtla.
- **Faz 2 (3-9 ay):** Distribution. Şef toplulukları, content marketing, organic growth. Hedef: 50 aktif kullanıcı + %40 retention.
- **Faz 3 (9-18 ay):** Monetization. 50+ kullanıcı + retention metrikleri yeşilse paid tier ekle.

**Şu an yapılması GEREKEN tek şey:** Operatörün dogfooding test'i + 5 arkadaşa lansman + geri bildirim toplama. Yeni özellik geliştirme YASAK.

## 3. Frontend Stack

- Vanilla JavaScript, no bundling, no service worker
- ~23,900 satır JS (core 6928 + tools 15790 + ui 1171) + ~7700 satır i18n = ~31,600 satır toplam
- IndexedDB ana storage (write-only, v2.6.92'den itibaren localStorage write yolu kapatıldı)
- PWA (Android Chrome'da install ✅, iOS Safari **test edilmedi**)
- 6 dil i18n (EN/TR/ES/FR/DE/AR) + phase modülleri (phase2.js, phase3.js, phase4.js, phase4-1.js, v17.js)
  - **Sadece EN ve TR dolu.** Diğer 4 dil EN fallback ile çalışıyor.
  - Yeni i18n key sadece **en.js + tr.js**'e eklenir.
- **Cache-busting (v2.8.0+):** `app/index.html`'de `?v=__VERSION__` placeholder'ları (49 yerde). Cloudflare build command (`node build.js`) `app/js/core/config.js`'teki `APP_VERSION` ile replace eder. Sürüm bump'ı **sadece config.js**'i değiştirir, başka hiçbir yere dokunulmaz.

### Repo dosya yapısı

**Repo kök:**
- `index.html` — Landing page (modern SaaS, Inter font, app paletiyle uyumlu, 22 KB)
- `privacy.html`, `terms.html` — 6 dil, app'ten bağımsız stil
- `build.js` — Cache-busting injection
- `app/` — uygulama
- `migrations/` — 14 SQL migration
- `supabase/functions/` — 3 Edge Function
- `supabase-functions/` — **DUPLICATE klasör (eski organizasyon kalıntısı)** — içeriği `supabase/functions/delete-account/` ile identical, repoda hiçbir referans yok. Operatör Supabase Dashboard'dan deploy kontrolü yapmadan silmeyi reddetti. **Yeni Claude bu konuyu açmasın.**
- `docs/DISASTER_RECOVERY.md` — restore prosedürü (prod'da test edildi)

**`app/js/core/` (16 modül):**
allergens-db.js, app.js, auth.js, cloud-pertable.js, cloud-realtime.js, cloud.js, config.js, i18n.js, idb-wrapper.js, photo-storage.js, qr.js, router.js, share.js, store.js, utils.js, variance.js
> `cloud-migrate-v4.js` v2.7.0'da silindi.

**`app/js/tools/` (24 araç):**
account.js, allergens.js, checklist.js, dashboard.js, events.js, haccp_cooling.js, haccp_logs.js, ingredients.js, inventory.js, kitchen_cards.js, menu_matrix.js, menus.js, nutrition.js, portion.js, recipes.js, sales.js, shopping.js, suppliers.js, team.js, tools-hub.js, variance.js, waste.js, whatif.js, yield.js

**Kullanıcıya görünen 10 ana tool:**
1. Recipes (live food cost) — 2. Ingredients — 3. Menu Builder — 4. Kitchen Cards (A4 print) — 5. Portion Calculator — 6. Shopping List — 7. Inventory — 8. Suppliers — 9. Events & Catering — 10. Checklists & HACCP

## 4. Cloud / Backend (Supabase)

**Project ref:** `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, **Free tier**)

### 22 Aktif tablo

**Workspace-scoped (16):** recipes, ingredients, menus, events, suppliers, canvases, shopping_lists, checklist_templates, inventory, waste, checklist_sessions, stock_count_history, haccp_logs, haccp_units, haccp_readings, haccp_cook_cool
> Hepsinde `workspace_id` + `user_id` PK, `data` jsonb, `deleted_at` timestamptz.

**Top-level (6):**
- `workspaces` (flat schema, data jsonb YOK — name/concept/role/city/color/period_start/period_end/archived/is_active/deleted_at)
- `workspace_tombstones` (workspace_id PK, user_id, deleted_at)
- `user_prefs` (user_id PK, data jsonb)
- `public_shares`
- `client_errors` (insert-only)
- `subscriptions` (premium için boş tutuluyor)

**DROP edilmiş:** `user_data` (v2.6.87'de), `cost_history` (v2.6.88'de). Frontend referansları temizlendi (v2.7.0-v2.7.2).

### 14 Migration dosyası (hepsi repoda)

v2.5.7-share-lifecycle, v2.5.9-recipe-photos-rls, v2.6.39-share-rls-fix, v2.6.47-user-data-rls, v2.6.63-client-errors, v2.6.66-per-table-sync-schema, v2.6.71-extra-tables-schema, v2.6.77-replica-identity-full, v2.6.97-cleanup-cron, **v2.6.98-cascade-triggers**, **v2.6.98-inventory-deleted-at**, **v2.7.0-restore-trigger**, **v2.7.6-purge-workspace-fn**, **v2.7.8-backup-cron-timeout**.

**Repo↔DB drift YOK.** Disaster recovery'de DB sıfırdan kurulabilir.

### Cascade trigger zinciri (v2.6.98 + v2.7.0)

| Trigger | Olay | İş |
|---|---|---|
| `trg_cascade_workspace_tombstone` | INSERT on workspace_tombstones | `cascade_soft_delete_workspace_data()` → 16 tablo + workspaces deleted_at SET |
| `trg_reverse_cascade_workspace_tombstone` | DELETE on workspace_tombstones | `cascade_restore_workspace_data()` → 16 tablo + workspaces deleted_at NULL (UNDO için) |

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

### 3 Edge Function (deployed)

- `backup-to-r2` — **v3 (2026-05-06 deploy)**. v2'si DROPPED `user_data` tablosundan okuduğu için **6 ay sessizce boş yedek üretmiş**. v3 21 per-table tabloyu jsonl olarak R2'ye yazar (`<YYYY-MM-DD>/<table>.jsonl` + summary.json + photos-manifest.json). 30-day retention.
- `cleanup-photos` — Storage orphan foto temizliği. `x-cleanup-secret` header zorunlu.
- `delete-account` — kullanıcı hesap silme.

**R2 bucket:** `prochefdesk-backups`. Backup-restore prod'da test edildi (docs/DISASTER_RECOVERY.md §5.3.5).

### Storage / Auth

- **Storage:** `recipe-photos` bucket (private, signed URL)
- **Auth:** Email + Google OAuth (production'da aktif)

## 5. Tamamlanmış İşler (kategori bazlı özet)

**Bu liste her sürümü tek tek değil, kategorileri özetler. Detay için CHANGELOG.md'ye bak.**

| Faz | Konu | Sürümler | Durum |
|---|---|---|---|
| 1 | Per-table sync schema (16 ws-scoped + 6 top-level tablo) | v2.6.66, v2.6.71 | ✅ |
| 2 | RLS audit + user_data DROP + 23 tablo RLS aktif | DB-only | ✅ |
| 3 | Workspace cascade trigger sistemi | v2.6.98 + v2.7.0 | ✅ |
| 4 | Workspace Trash UI (Active/Archived/Deleted, soft-delete + 30-gün retention + restore + purge) | v2.7.3-v2.7.7 | ✅ |
| 5 | IndexedDB migration (LS yazma yolu kapandı) | v2.6.89-v2.6.92 | ✅ |
| 5 | Server-side cleanup (pg_cron + cleanup-photos) | v2.6.97 | ✅ |
| 5 | Cloud sync queue persistence (offline güvenliği) | v2.6.95 | ✅ |
| 5 | Realtime channel orphan leak fix | v2.7.9 | ✅ |
| 6 | Cache-busting standardı (build.js + __VERSION__ placeholder) | v2.8.0 | ✅ |
| 6 | App `/app/` altına taşındı | v2.8.2 | ✅ |
| 6 | Bug fix arc (signup workspace push, cross-user queue leak, demo orphan, realtime CHANNEL_ERROR) | v2.8.3-v2.8.5 | ✅ |
| 7 | Lansman paketi (landing + Privacy/Terms refresh) | post-v2.8.5 | ✅ |
| Ops | Backup function v3 (per-table mimariye uyumlu) + restore prosedürü prod test | Edge deploy + docs | ✅ |
| Ops | DISASTER_RECOVERY.md güncel | docs | ✅ |

## 6. Yapılacaklar — KISA ve NET

### 🟡 Lansmandan ÖNCE manuel doğrulama (~1 saat, operatör yapacak)

1. **R2 backup dashboard kontrolü** (15 dk) — Cloudflare R2 → `prochefdesk-backups` → son tarih klasörü → `recipes.jsonl` ve `workspaces.jsonl` byte boyutu > 0 mı? İçinde gerçek satır var mı? Sebep: v2 backup function 6 ay sessizce boş yedek üretmişti. v3'ün gerçekten çalıştığını tek seferlik doğrula.
2. **Privacy/Terms içerik gözden geçirme** (30 dk) — Tarayıcıda aç. Email/isim doğru mu? Boilerplate kalıntı var mı? Avustralya Privacy Act 1988 ile uyumlu mu? TR de kontrol et.
3. **Onboarding deneyimi testi** (15 dk) — Anonim sekmede yeni Google hesabıyla signup → app'i 10 dakika kullan → garip yer var mı not et.

### 🟢 Operatörün şu hafta yaptığı

**Dogfooding (1 hafta):** Operatör kendi tariflerini ve menülerini ekleyerek tüm araçları detaylı kullanıyor. Bug bulursa bug log tutuyor. Hafta sonu 5 arkadaşa lansman.

### 🟢 Lansman sonrası akış

1. **Pazartesi:** 5 arkadaşa link + her birine "30 dk geri bildirim + 3 referans" ricası
2. **2 hafta:** Pasif gözlem, soru gelirse cevapla, bug çıkarsa düzelt
3. **3 hafta sonra:** Her arkadaşla 30 dk konuş, geri bildirim topla
4. **4 hafta sonra:** Karar — devam mı, iterasyon mı, şefliğe odaklanma mı

## 7. ❌ YAPMA Listesi (yeni Claude bunları önermesin)

**Bu işler ya zaten tamamlandı, ya operatör erteledi, ya gereksiz. Yeni Claude bunları "öneri" olarak ortaya çıkarırsa operatörün zamanını ve güvenini kaybeder.**

| İş | Neden YAPMA |
|---|---|
| **"Report an issue" modal eklemek** | **ZATEN VAR.** account.js satır 213-628-880, hCaptcha korumalı, 6 dil i18n. `grep -n "openReportIssueModal" app/js/tools/account.js` ile doğrula. |
| **Bug 2/3/4 debug log temizliği (`PCD.log` çağrıları)** | `PCD.log` fonksiyonu `PCD_CONFIG.DEBUG = false` iken **silent no-op**. Production'da console'a yazmıyor. Temizlik gereksiz. |
| **`supabase-functions/` duplicate klasörünü silmek** | Operatör Supabase Dashboard'da "hangisi production'da deploy edilmiş" doğrulamasını **kendisi** yapacak. Doğrulamadan silme, önerme. |
| **i18n hardcoded string fix** | ~30 string var (suppliers.js 5, recipes.js 4, vb.), çoğu `title` attribute (mobile'da görünmez). Lansman bloker DEĞİL. Operatör erteledi — kullanıcı şikayet ederse yapacak. |
| **Türkçe landing page** | Operatör erteledi. Lansman İngilizce. TR sonradan eklenebilir, kullanıcı talebi varsa. |
| **Ekran görüntüleri eklemek** | Operatör kendi çekecek. Lansman sonrası kullanıcı geri bildirimine göre karar verecek. |
| **Yeni özellik geliştirme** | Lansman öncesi ve ilk 4 hafta YASAK. Önce gerçek kullanıcı geri bildirimi. |
| **Pricing/paid tier eklemek** | 50 aktif kullanıcı + %40 retention kanıtlanmadan YOK. Hedef ay 7-9. |
| **Premium tier altyapısı (Stripe vs.)** | Yukarıyla aynı. Erken eklemek psikolojik baskı yaratır. |
| **Marketing/SEO/blog/Substack kurulumu** | Faz 2 işi (3+ ay sonra). Şu an erken. |
| **Demo seed verilerini değiştirmek** | Operatör tariflerini ekleyecek, demo seed mevcut hali iyi. |
| **AI image generation entegrasyonu** | Operatörün RTX 5090 24GB donanımı var, kendisi marketing içerikleri için kullanacak. **Ürüne entegre etmek** şu an gereksiz, GPU server maliyeti yüksek. |

## 8. Operatör Çalışma Kuralları (kanıtlanmış, ihlal etme)

### Çekirdek

1. **Bir hedef → en küçük adım.** SQL ile çözülecek bir şey için frontend kod temizliği + sürüm bump YAPMA.
2. **Birden fazla iyileştirmeyi tek sürüme paketleme.** DB ve kod ayrı sürümler.
3. **Bulk regex YOK, otomatik script YOK.** Manuel dosya-by-dosya edit. v2.6-v2.8 regression arc'ı (226+ syntax error, v2.5.3'e rollback) bulk script'ten geldi.
4. **Her değişiklikten sonra `node -c` syntax check.**
5. **Frontend tahmin yürütmeden önce SQL ile DB durumunu kontrol et.**
6. **Operatör screenshot gönderdiyse Console (DevTools) açıksa ÖNCE oraya bak.**
7. **Türkçe iletişim, sade dil, kısa cevaplar.**
8. **Operatör yorgun veya kızgınsa seçenek sunma — net karar al, tek talimat ver.**

### İşletim

9. **GitHub Desktop GUI kullanılır, terminal/cmd değil.** Push talimatları GUI adımları olarak verilir.
10. **Cloudflare Pages build hook ile sürüm injection (v2.8.0+):** Sürüm bump'ı **sadece** `app/js/core/config.js`'in `APP_VERSION` satırını değiştirir + CHANGELOG günceller. **`app/index.html`'e ASLA literal sürüm string'i yazılmaz.**
11. **Cevaplar kısa, sade, doğrudan tek bir adımla devam edilebilir formda.**
12. **Operatöre teknik kod gösterilmez** — diff blokları, syntax detayları kafa karıştırır. Onun bilmesi: ne değişecek (sade dilde), ne risk, dosyayı nereye kopyalayacak.
13. **Onay süreci kısa olmalı.** Küçük işler için doğrudan yap, dosya sun. Büyük işler için kısa cümleyle onay.
14. **Edge Function manuel test:** pg_net SQL ile test (`SELECT net.http_post(url, headers, body, timeout_milliseconds := 60000)`).
15. **Restore prosedürü:** R2 jsonl → temp tablo → `jsonb_populate_record(NULL::<table>, line)` → `INSERT ON CONFLICT DO UPDATE`. Detay: docs/DISASTER_RECOVERY.md §5.3.5.
16. **Yeni özellik önerisi yapmadan ÖNCE repo'da grep ile var mı kontrol et.** "Report an issue modal" yanlış önerisi (2026-05-08) bu kuralı doğurdu.

### Onay zorunlu

- Herhangi bir DROP TABLE veya destructive SQL
- 50+ satır frontend değişikliği
- Yeni dosya/modül ekleme
- Cron schedule veya RLS policy değişikliği
- Cross-device sync mantığı değişikliği
- Edge Function deploy

### Sürüm numaralandırma

- DB-only migration'lar kendi sürüm numarası alabilir (frontend'de görünmez). Örn: v2.7.0 hem kod (cloud-migrate-v4 silindi) hem DB (restore trigger eklendi) içerir.
- v2.7.8-backup-cron-timeout DB-only idi, frontend sürümü v2.7.7'den v2.7.9'a atladı (OK).
- **Root dosyalar** (landing, privacy, terms) app sürüm sisteminin parçası DEĞİL. CHANGELOG'da "Lansman paketi (post-vX.Y.Z)" notuyla işaretlenir.

## 9. Önemli Yerler / Değerler

| | |
|---|---|
| Repo path (operatör Windows) | `C:\Users\ahmet\Desktop\prochefdesk` |
| GitHub repo | `ahmetkayas1926/prochefdesk` |
| Production sürümü | **v2.8.5** + lansman paketi (post-v2.8.5) |
| Supabase project ref | `muuwhrcogikpqylsfvgg` (Tokyo, Postgres 17, Free tier) |
| Cloudflare R2 bucket | `prochefdesk-backups` |
| CLEANUP_SECRET | `ec79a445-7e92-499b-9322-5c2c949788d4d2886e66-d556-4498-ba9e-17fda6c11ac1` |
| Operatör e-posta | ahmetkaya.s1926@gmail.com |
| App e-posta | hello@prochefdesk.com (Cloudflare Email Routing → Gmail) |
| Test edilmiş platformlar | Desktop Chrome ✅, Android Chrome (PWA install) ✅ |
| Test edilmemiş | iOS Safari (PWA) — arkadaş iPhone'u beklenirken |
| Cloudflare Pages build command | `node build.js` (v2.8.0+) |
| Aylık altyapı maliyeti | $1 (sadece domain). 50 aktif kullanıcıya kadar Supabase Free tier. |

## 10. Yeni Claude Başlangıç Kontrol Listesi

1. ☐ Bu HANDOVER.md tamamen okundu mu?
2. ☐ CHANGELOG.md son entry'leri okundu mu? (v2.8.5 + lansman paketi)
3. ☐ Operatör dilini doğrula: **Türkçe, sade dil, kısa cevaplar, GitHub Desktop GUI**
4. ☐ §7 YAPMA listesi okundu mu? Bu işleri önerme.
5. ☐ §2 mevcut durum: lansman + dogfooding fazında. Yeni özellik geliştirme YOK.
6. ☐ Bir iş yapmadan önce: bu iş zaten yapıldı mı? §5 ve repo'da grep ile kontrol et.
7. ☐ DB durumunu varsayma — gerekiyorsa SQL ile sor.
8. ☐ Cloudflare Pages durumunu varsayma — gerekiyorsa Dashboard ekran görüntüsü iste.

## 11. Mimari Kurallar (gotcha'lar — geçmişte bug üretti)

### 11.1 Cloud sync race condition (KRİTİK)

UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada explicit `await PCD.cloudPertable.pushNow()` olmalı**. Aksi halde debounced sync tamamlanmadan reload tetiklenir → kullanıcı "verim kayboldu" der.

### 11.2 PCD.icon registry — silent info fallback

`PCD.icon(name, size)` registry'de olmayan isim verince **sessizce info ikonuna fallback** yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) kabul etmez.

**Yeni ikon kullanmadan önce:** `grep -n "<name>:" app/js/core/utils.js` ile registry'de var olduğunu doğrula.

### 11.3 Per-table sync akışı

| Yön | Mekanizma |
|---|---|
| **Push** (local→cloud) | `cloud-pertable.js` UI yazımlarını dinler, 1.5sn debounce ile Supabase'e UPSERT/PATCH/DELETE |
| **Pull** (cloud→local) | `cloud.js` boot'ta tüm 22 tablodan kullanıcıya ait satırları çeker, IDB'ye yazar, state'e merge. `pullInProgress` flag ghost duplicate önler (v2.6.85). v2.8.3 sonrası: pull akışı local-only ws'leri queueUpsert ile cloud'a iletir. |
| **Realtime** (cloud→local canlı) | `cloud-realtime.js` 19 tabloya WebSocket subscribe. v2.7.9'da orphan channel leak fix, v2.8.5'te init() içindeki çift subscribe path race silindi. |
| **Queue persistence** (v2.6.95+) | `cloud-pertable.queue` her mutation'da IDB'ye yansır. Boot'ta restore. v2.8.4'te `clearQueue()` eklendi (logout sırasında cross-user leak önleme). |

Sync bug'ında önce **hangi yön** sor — push mu, pull mu, realtime mı, queue mu? Tahmin yürütme.

### 11.4 RLS aktif (tüm 22 tablo)

Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy de ekle.

**Standart şablon:**
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 11.5 OAuth callback URL'leri (v2.8.2+)

Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://prochefdesk.com`
- **Redirect URLs:** `https://prochefdesk.com/**` ve `https://prochefdesk.com/app/**`
- `auth.js` Google OAuth `redirectTo: window.location.origin + '/app/'`

### 11.6 Misafir vs üye davranışı

- **Misafir (login yok):** Sadece IDB. **Cloud yazma KAPALI.** Demo seed yüklenir.
- **Üye (login var):** IDB + cloud çift yönlü. Realtime aktif.

Yeni feature: misafir kullanıcı için cloud push tetiklenmemeli (v2.6.93'te bu sızıntı kapatıldı).

### 11.7 `app/index.html` sürüm string'i ASLA literal yazılmaz (v2.8.0+)

49 yerde `?v=__VERSION__` placeholder yaşar. `node build.js` deploy zamanı replace eder. **Operatör veya AI tarafından literal yazılırsa build fail eder** ("No __VERSION__ placeholders found").

**Sürüm bump için tek dokunulan yer: `app/js/core/config.js` APP_VERSION satırı.**

### 11.8 Root dosyalar (landing, privacy, terms) app'ten BAĞIMSIZ

Üç root dosyanın da kendi inline CSS'i var (Inter + app green palette). App CSS değişiklikleri etkilemez, tersi de doğru.

**Pratik kural:**
- App içi UI değişikliği yaparken landing/privacy/terms kontrol etmene gerek yok.
- Bu üç dosyayı değiştirirken app'i kontrol etmene gerek yok.
- Sadece **brand tutarlılığı** için: renk, font, "PC" mark hep tutarlı olsun.

### 11.9 Çoklu kullanıcı / paid tier hazırlığı (henüz aktif değil)

`subscriptions` tablosu DB'de hazır, kullanılmıyor. Operatör "Free now, premium possible later" planına göre 50+ aktif kullanıcı + %40 retention kanıtlanana kadar paid tier eklemiyor.

## 12. Operatör Bağlamı (insan tarafı)

**Vizyon:** Operatör profesyonel şef, full-time mutfakta çalışmak fiziksel olarak zorlanıyor (bacak ağrısı, yaşlanma). ProChefDesk'i **gradual transition** aracı olarak görüyor — şefliği bırakmak değil, yan-zamanlıya çekip teknolojiden gelir tamamlayıcı yapmak.

**Bu HANDOVER için anlamı:**
- Operatör acele kararlardan kaçınmalı (psikolojik baskı altında SaaS başarısız olur).
- "Bu hafta paid tier ekleyim" gibi cazip ama erken kararlar reddedilmeli.
- Yeni Claude operatöre **destek ver, baskı yapma**. Strateji yavaş ve gerçekçi.

**Donanım avantajı:** Operatörde ASUS ROG Strix Scar 18 (RTX 5090 Laptop, 24GB GDDR7 VRAM) var. ComfyUI/Automatic1111/Kohya_ss kullanıyor. Bu donanım Faz 2 marketing içerik üretimi için (food photography, kısa videolar) **stratejik avantaj**. Lansman sonrası 2-4. haftada bu konu açılır. Şu an gündeme alma.

**Bilinen tercihler:**
- Manipülatif satış teknikleri istemiyor (şefler dürüstlük ister)
- Karmaşık premium tier'lardan kaçınıyor (basit tek tier tercihi)
- Erken yatırımcı/exit konusuna kapalı (uzun vadeli, yan-iş zihniyetiyle)
