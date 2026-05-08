# ProChefDesk — Operasyon Handover

> **Bu dokümanın amacı:** Yeni bir Opus konuşmasında (yeni session) hızla devralma. Repodaki kod, DB durumu, kalan işler, operatör çalışma kuralları — hepsi burada. Bu dokümanı oku, **kabul et, varsayma**, ondan sonra çalışmaya başla.

## 1. Genel

**Ürün:** ProChefDesk — profesyonel chef'ler için web tabanlı mutfak yönetim sistemi (recipe maliyetleme, menü mühendisliği, envanter, HACCP).

**Operatör:** Ahmet Kaya, Perth Western Australia, profesyonel chef. Solo non-commercial proje. Hedef: 6 ay içinde 20+ chef arkadaşını production kullanıcısı yapmak. **Lansman planı:** önce 5 arkadaşa gönderim, sonra organik genişleme.

**Production sürümü:** **v2.8.5** (2026-05-08 deploy edildi). Bu sürümün üzerine, sürüm bump'ı yapılmadan **landing page (root index.html) + Privacy/Terms bağımsız stillendirme** eklendi (post-v2.8.5 lansman polish).

**Domain:** prochefdesk.com (Cloudflare Pages, SSL Full mode, auto-deploy on GitHub push, Cloudflare build hook ile sürüm injection)

**Repo:** `C:\Users\ahmet\Desktop\prochefdesk` → GitHub: `ahmetkayas1926/prochefdesk` → Cloudflare Pages

**URL yapısı:**
- `prochefdesk.com/` — Landing page (statik HTML, Fraunces + Manrope fonts, post-v2.8.5)
- `prochefdesk.com/app/` — Web app (vanilla JS PWA)
- `prochefdesk.com/privacy.html` — Privacy Policy (6 dil, bağımsız stilli)
- `prochefdesk.com/terms.html` — Terms of Service (6 dil, bağımsız stilli)

**Eski paylaşım linkleri korundu:** `prochefdesk.com/?share=xxx` formatındaki public share URL'leri landing JS tarafından otomatik `/app/?share=xxx`'e yönlendirilir (landing render edilmez).

## 2. Frontend Stack

- Vanilla JavaScript, no bundling, no service worker
- 6 dil i18n (EN/TR/ES/FR/DE/AR), `PCD.i18n.t()` EN fallback
  - **Sadece EN ve TR dolu.** ES/FR/DE/AR dosyaları kısa, EN fallback ile çalışıyor. Yeni i18n key sadece en.js + tr.js'e eklenir, otomatik fallback'e güvenilir.
- IndexedDB ana storage (write-only, v2.6.92'den itibaren localStorage write yolu kapatıldı)
- PWA (Android Chrome'da install ✅, iOS Safari test edilmedi)
- **Cache-busting (v2.8.0 sonrası):** `app/index.html`'de tüm `?v=__VERSION__` placeholder'ları (49 yerde), Cloudflare build command (`node build.js`) tarafından deploy zamanı `app/js/core/config.js`'teki `APP_VERSION` ile replace edilir. Yeni sürüm bump'ı **sadece config.js**'i değiştirir, başka hiçbir yere dokunulmaz.

### Frontend dosyaları (zip yapısı, v2.8.2 sonrası)

**Repo kökü:**
- `index.html` — Landing page (post-v2.8.5, ~600 satır, tek dosya HTML/CSS/JS)
- `privacy.html` — Privacy Policy (6 dil, bağımsız stilli, Fraunces + Manrope)
- `terms.html` — Terms of Service (6 dil, bağımsız stilli)
- `build.js` — Cloudflare build hook (sürüm injection)
- `app/` — Web app (aşağıda)
- `migrations/` — SQL migration'ları
- `supabase/functions/` — Edge Function'ları
- `docs/` — DISASTER_RECOVERY.md vb.
- `CHANGELOG.md`, `HANDOVER.md`

**`app/` klasörü:**
- `app/index.html` — App entry point (cache-busting placeholder'ları burada)
- `app/manifest.webmanifest` — PWA manifest (`start_url: "/app/"`, `scope: "/app/"`)
- `app/assets/` — icons, images
- `app/css/` — core.css, themes.css
- `app/js/core/` — app.js, auth.js, cloud.js, cloud-pertable.js, cloud-realtime.js, config.js, i18n.js, idb-wrapper.js, photo-storage.js, qr.js, router.js, share.js, store.js, utils.js, variance.js, allergens-db.js
  - **`cloud-migrate-v4.js` v2.7.0'da silindi.** Eski blob → per-table migration script'iydi, görevi v2.6.92'de tamamlandı, v2.7.0'da tamamen silindi.
- `app/js/seed/` — demo recipes (misafir kullanıcıya seed)
- `app/js/tools/` — 22 tool ekranı (recipes, ingredients, menus, events, suppliers, kitchen-cards, portion-calc, shopping-list, inventory, waste, checklists, haccp, account, dashboard, vb.) — toplam ~22.700 satır
- `app/js/ui/` — modal, toast, calendar UI primitives
- `app/js/i18n/` — en.js, tr.js, es.js, fr.js, de.js, ar.js + phase modülleri

## 3. Cloud / Backend (Supabase)

**Project ref:** `muuwhrcogikpqylsfvgg` (Tokyo region, Postgres 17, Free tier)

### Aktif tablolar — 22

| Tablo | Rol |
|---|---|
| **Workspace-scoped (16):** | `workspace_id` + `user_id` PK, `data` jsonb, `deleted_at` timestamptz |
| recipes, ingredients, menus, events, suppliers, canvases, shopping_lists, checklist_templates, inventory, waste, checklist_sessions, stock_count_history, haccp_logs, haccp_units, haccp_readings, haccp_cook_cool | Tool verileri |
| **Top-level (6):** | |
| workspaces | Flat schema (data jsonb YOK) — name/concept/role/city/color/period_start/period_end/archived/is_active/deleted_at |
| workspace_tombstones | Workspace silme tombstone (workspace_id PK, user_id, deleted_at) |
| user_prefs | user_id PK, data jsonb (locale/theme/currency/onboarding/costHistory), active_workspace_id |
| public_shares | Public link paylaşımı |
| client_errors | Error reporting (insert-only) |
| subscriptions | Premium gelecek için boş tutuluyor |

**DROP edilmiş (DB'de YOK):** user_data, cost_history.
- `user_data` referansları frontend'den temizlendi: cloud-migrate-v4.js silindi (v2.7.0), account.js delete-account akışından user_data DELETE çağrısı kaldırıldı (v2.7.1), cloud.js mergePullSources blob branch silindi (v2.7.2). Bu yüzden frontend'de "relation does not exist" hatası olmuyor artık.

### inventory.deleted_at kolonu
**VAR.** v2.6.66 schema'sında eksikti, sonradan ALTER TABLE ile eklendi. **Repoya commit edildi:** `migrations/v2.6.98-inventory-deleted-at.sql`.

### Workspace_tombstones cascade trigger zinciri (DB'de aktif)

Bu zincir Trash UI'nın (Workspace silme/restore/purge) bel kemiği. **Hepsi `migrations/v2.6.98-cascade-triggers.sql`'de repoya commit edildi.**

| Bileşen | Olay | İş |
|---|---|---|
| `trg_cascade_workspace_tombstone` (trigger) | AFTER INSERT on workspace_tombstones | `trg_cascade_workspace_tombstone()` wrapper function'ını çağırır |
| `trg_cascade_workspace_tombstone()` (wrapper fn) | — | `cascade_soft_delete_workspace_data(NEW.workspace_id, NEW.user_id, NEW.deleted_at)` çağırır |
| `cascade_soft_delete_workspace_data` (data fn) | — | workspaces + 16 ws-scoped tabloda `deleted_at` SET |
| `trg_reverse_cascade_workspace_tombstone` (trigger) | AFTER DELETE on workspace_tombstones | `trg_reverse_cascade_workspace_tombstone()` wrapper function'ını çağırır |
| `trg_reverse_cascade_workspace_tombstone()` (wrapper fn) | — | `cascade_restore_workspace_data(OLD.workspace_id, OLD.user_id)` çağırır |
| `cascade_restore_workspace_data` (data fn) | — | workspaces + 16 ws-scoped tabloda `deleted_at` NULL |

### DB function'ları (mevcut)

- `cascade_soft_delete_workspace_data(p_workspace_id, p_user_id, p_deleted_at)` — repo: v2.6.98-cascade-triggers.sql
- `cascade_restore_workspace_data(p_workspace_id, p_user_id)` — repo: v2.6.98-cascade-triggers.sql
- `trg_cascade_workspace_tombstone()` (wrapper) — repo: v2.6.98-cascade-triggers.sql
- `trg_reverse_cascade_workspace_tombstone()` (wrapper) — repo: v2.6.98-cascade-triggers.sql
- `pcd_cleanup_old_deleted()` — 30 günden eski soft-deleted satırları fiziksel siler. Repo: v2.6.97-cleanup-cron.sql
- `pcd_purge_workspace(p_workspace_id, p_user_id)` (v2.7.6'da eklendi) — Trash UI'nın "Delete forever" butonu çağırır. Atomik transaction'da 16 ws-scoped tablo + workspaces + workspace_tombstones'tan ilgili satırları fiziksel siler. SECURITY DEFINER. Repo: v2.7.6-purge-workspace-fn.sql

### Aktif pg_cron jobs (3)

| Job | Schedule (UTC) | İş | Repo |
|---|---|---|---|
| nightly-backup-to-r2 | `0 3 * * *` (03:00 her gün) | DB → Cloudflare R2 backup. **timeout 60sn** (v2.7.8'de 5sn'den yükseltildi, çünkü Edge Function ~6sn alıyor) | v2.7.8-backup-cron-timeout.sql |
| pcd-cleanup-old-deleted | `0 3 * * *` (03:00 her gün) | 30 gün eski soft-deleted fiziksel sil | v2.6.97-cleanup-cron.sql |
| pcd-cleanup-photos-weekly | `0 4 * * 0` (Pazar 04:00) | cleanup-photos Edge Function tetikler | v2.6.97-cleanup-cron.sql |

### Realtime publication (19 tablo subscribed — değişmedi)

canvases, checklist_sessions, checklist_templates, events, haccp_cook_cool, haccp_logs, haccp_readings, haccp_units, ingredients, inventory, menus, recipes, shopping_lists, stock_count_history, suppliers, user_prefs, waste, workspace_tombstones, workspaces

**Subscribe edilmemiş (3):** client_errors (backend log), public_shares (public okuma RLS), subscriptions (premium boş)

### Edge Function'ları (3 deploy, hepsi canlı)

- `supabase/functions/backup-to-r2/index.ts` — **v3 (v2.8.0 öncesi yeniden yazıldı, 2026-05-06)**. v2 `user_data` tablosundan okuyordu (v2.6.87'de DROP edilmişti) → ~6 ay boş yedek üretmiş. v3 21 per-table tabloyu (16 ws-scoped + 5 top-level) ayrı ayrı `<YYYY-MM-DD>/<table>.jsonl` olarak R2'ye yazar + summary.json + photos-manifest.json. 30-day retention. **Lansman öncesi gözle doğrulama önerilir** (15 dk): R2 dashboard → son tarih klasörü → `recipes.jsonl` ve `workspaces.jsonl` byte boyutu > 0 mı kontrol.
- `supabase/functions/cleanup-photos/index.ts` — Storage orphan foto temizliği. Internal `x-cleanup-secret` header zorunlu.
- `supabase/functions/delete-account/index.ts` — kullanıcı hesap silme.

**⚠️ Repo kirliği — duplicate Edge Function klasörü:** `supabase-functions/delete-account/index.ts` adında ikinci bir klasör daha mevcut, içerik `supabase/functions/delete-account/index.ts` ile birebir aynı (diff boş). Eski klasör organizasyonun kalıntısı — hangisinin deploy edildiği şüpheli değil (`supabase/functions/` Supabase CLI'ın standart yolu), ama duplicate kafa karışıklığı yaratabilir. **Lansman bloker DEĞİL**, sonra silinmeli (5dk iş).

**R2 bucket:** `prochefdesk-backups` (Cloudflare R2). Yedek formatı: tarih klasörü + 21 jsonl + summary + photos manifest. **Backup-restore prosedürü 2026-05-06'da prod'da kanıtlandı**, doküman `docs/DISASTER_RECOVERY.md` (§5.3.5).

### Migration SQL'leri (repoda — hepsi)

v2.5.7-share-lifecycle, v2.5.9-recipe-photos-rls, v2.6.39-share-rls-fix, v2.6.47-user-data-rls, v2.6.63-client-errors, v2.6.66-per-table-sync-schema, v2.6.71-extra-tables-schema, v2.6.77-replica-identity-full, v2.6.97-cleanup-cron, **v2.6.98-cascade-triggers**, **v2.6.98-inventory-deleted-at**, **v2.7.6-purge-workspace-fn**, **v2.7.8-backup-cron-timeout**.

**v2.8.x sürümleri DB-only migration üretmedi** (v2.8.3, v2.8.4, v2.8.5 hepsi frontend-only fix'ler). Repo↔DB drift'i SIFIRDIR. Disaster recovery'de DB sıfırdan kurulabilir, hiçbir trigger/function/cron kayıp olmaz.

### Storage / Auth

- **Storage bucket:** `recipe-photos` (private, signed URL ile erişim).
- **Auth providers:** Email + Google OAuth (her ikisi de production'da aktif).
- **OAuth callback (v2.8.2 sonrası):** Site URL `https://prochefdesk.com`, Redirect URLs `https://prochefdesk.com/**` (wildcard) + `https://prochefdesk.com/app/**`. Login sonrası kullanıcı `/app/`'e döner (auth.js `redirectTo: window.location.origin + '/app/'`).

## 4. Frontend ↔ DB Durumu (v2.8.5)

v2.8.5 itibarıyla **drift yok**. Repodaki migration'lar DB'deki gerçek durumu birebir yansıtıyor. Frontend'deki ölü kod (cloud-migrate-v4, user_data DELETE, blob merge branch) tamamen temizlendi (v2.7.0–v2.7.2). v2.8.x sürümleri yalnızca frontend bug fix'leri (v2.8.3 onboarding workspace push, v2.8.4 queue/orphan fix'leri, v2.8.5 realtime CHANNEL_ERROR cosmetic fix).

## 5. Tamamlanmış İşler (Operatör Onaylı, v2.8.5'e Kadar)

| # | İş | Sürüm |
|---|---|---|
| 1 | Per-table sync schema (16 ws-scoped + 7 top-level tablo) | v2.6.66 |
| 2 | Workspaces flat schema fix (data jsonb yok) | v2.6.84 |
| 3 | Ghost workspace duplicate kök çözüm (pullInProgress flag) | v2.6.85 |
| 4 | Demo onboarding seed cloud sızması durduruldu | v2.6.86 |
| 5 | Eski blob mimarisi yazma+okuma kapatıldı (no-op) | v2.6.87 |
| 6 | cost_history tablosu DROP | v2.6.88 |
| 7 | IndexedDB altyapısı + write-through | v2.6.89 |
| 8 | Pull akışı IndexedDB'den okuyor (async boot) | v2.6.91 |
| 9 | localStorage yazma yolu kapatıldı, IDB-only | v2.6.92 |
| 10 | Misafir/üye demo ayrımı + welcome tour cloud-bağımsızlığı + backup restore tam zincir + Clear all cloud temizliği | v2.6.93 |
| 11 | Demo Add/Remove butonu kaldırıldı | v2.6.94 |
| 12 | Cloud sync queue persistence (offline yazımda kayıp önleme) | v2.6.95 |
| 13 | Offline banner i18n (6 dil, güven verici metin) | v2.6.96 |
| 14 | Server-side cleanup: pg_cron + cleanup-photos Edge Function | v2.6.97 |
| 15 | Account ekranı sadeleştirme (Photo cleanup UI, CSV export butonları, ölü i18n) | v2.6.98 |
| 16 | RLS audit (22 tabloda RLS aktif doğrulandı) | DB-only |
| 17 | user_data DROP (boş, kullanılmayan tablo) | DB-only |
| 18 | A5 cascade soft-delete trigger (workspace_tombstones INSERT → 16 tablo + workspaces deleted_at SET) | DB-only, repoya v2.6.98 |
| 19 | inventory.deleted_at kolonu eklendi | DB-only, repoya v2.6.98 |
| 20 | Reverse cascade trigger (tombstone DELETE → restore) | DB-only, repoya v2.6.98 |
| 21 | listWorkspaces soft-delete filter (workspace selector'a sızıntı önleme) | v2.6.99 |
| 22 | cloud-migrate-v4 ekosistemi tamamen silindi (290+15+1 satır) | v2.7.0 |
| 23 | account.js'ten user_data DELETE çağrısı silindi | v2.7.1 |
| 24 | cloud.js mergePullSources blob branch silindi (79 satır) | v2.7.2 |
| 25 | listDeletedWorkspaces store API (Trash UI veri katmanı) | v2.7.3 |
| 26 | cloud.js pull merge tombstone filter ve cleanup blok kaldırıldı (silinmiş ws meta'sı state'te yaşar artık) | v2.7.4 |
| 27 | Workspace Trash UI: Active/Archived/Deleted üç-bölümlü modal + Restore butonu + i18n | v2.7.5 |
| 28 | pcd_purge_workspace SQL fonksiyonu (atomik DB silme) | DB-only, repoya v2.7.6 |
| 29 | Workspace Permanent Delete UI: kırmızı Delete forever butonu + iki aşamalı confirm | v2.7.6 |
| 30 | Trash UI ikon hotfix (rotate-ccw → refresh, trash-2 → trash) | v2.7.7 |
| 31 | nightly-backup-to-r2 cron timeout 5sn → 60sn (yedeğin response'unu yakalamak için) | DB-only, repoya v2.7.8 |
| 32 | backup-to-r2 Edge Function v3 (per-table mimariye uyumlu) | Edge deploy |
| 33 | DISASTER_RECOVERY.md güncellendi (R2 backup era + restore prosedürü dokümante edildi, prod'da test edildi) | docs |
| 34 | Realtime channel orphan leak fix (subscribe başına unsubscribe) | v2.7.9 |
| 35 | Cache-busting standardı: `__VERSION__` placeholder + Cloudflare build hook (`node build.js`) | v2.8.0 |
| 36 | App `/app/` altına taşındı (root URL'i landing için boşaltıldı). OAuth redirect, manifest, build script, link path'leri güncellendi | v2.8.2 |
| 37 | Onboarding "My Kitchen" workspace cloud push fix (yeni hesap signup → workspace artık DB'ye yazılıyor → mobil cihazda görünür) | v2.8.3 |
| 38 | Cross-user queue leak + demo seed orphan fix (clearUserData artık queue'yu da temizliyor; yeni `clearQueue()` API) | v2.8.4 |
| 39 | Realtime CHANNEL_ERROR cosmetic fix (init'teki çift subscribe race kapatıldı) | v2.8.5 |
| 40 | DB orphan temizliği (1 BUG3 SIMULATION recipe silindi); 7 ws-scoped tablo zaten 0 orphan | DB-only |
| 41 | Landing page (root index.html) — editorial/refined warm-minimal tasarım, Fraunces+Manrope, 10-tool grid, eski share linkleri korundu | post-v2.8.5 |
| 42 | Privacy + Terms bağımsız stillendirme — app CSS bağımlılığı kaldırıldı, kendi light+dark mode CSS variables, theme localStorage persist, version stringleri 6 dilde temizlendi | post-v2.8.5 |

## 6. Yapılacaklar (Operatör Onaylı, Yarım Kalmış / Henüz Yapılmamış)

### Lansman öncesi (1 saat toplam)

**1) Cloudflare R2 backup dashboard görsel doğrulama (15 dk)**

R2 dashboard → `prochefdesk-backups` bucket → son tarih klasörü (`<YYYY-MM-DD>/`) → `recipes.jsonl`, `workspaces.jsonl`, `ingredients.jsonl` byte boyutu > 0 mı kontrol. **Backup v3 ne zamandır prod'da çalışıyor?** v2 6 ay sessizce boş backup üretmişti (v2.6.87'de `user_data` DROP'tan sonra). v3 deploy'undan sonraki backup'lar dolu olmalı, daha öncesi boş olabilir. Operatör için: yeni hesap olduğun için zarar yok, ama v3 sonrası en az 1 backup dolu mu görmeden lansman yapma.

**2) Privacy/Terms içerik gözden geçirme (30 dk)**

Tarayıcıda aç (her iki dosya): boilerplate kalıntısı var mı, ProChefDesk adı doğru kullanılmış mı, Avustralya Privacy Act 1988 referansı uygun mu, GDPR maddeleri doğru mu, Türkçe versiyon doğal mı (özellikle "we", "you" gibi şahıslar Türkçe'de doğru çevrilmiş mi). 6 dilin hepsini gezerek kontrol etmeye gerek yok — EN ve TR yeter.

**3) Onboarding deneyimi son kontrol (15 dk)**

Anonim/incognito sekmede `prochefdesk.com` → landing → "Get started" → app → **yeni Google hesabıyla** signup. Demo seed güzel mi, "Yeni recipe ekle" butonu görünür mü, 5 dakikada uygulama anlaşılır mı. Mobilde aynı şey. **5 arkadaşının gözünden bak — sen şefsin, alışkınsın, onlar değil.**

### Lansman sonrası — gerçek geri bildirimle önceliklendirilecek

**4) Duplicate `supabase-functions/` klasörü temizliği (5 dk)**

`supabase-functions/delete-account/` klasörü silinmeli. İçerik `supabase/functions/delete-account/`'la aynı, eski organizasyonun kalıntısı. GitHub Desktop GUI'den delete + commit.

**5) Bug 2/3/4 cleanup (debug log'lar)**

v2.8.3, v2.8.4 fix'lerini izlemek için eklenen `PCD.log && PCD.log('cloud pull: ...')` benzeri debug satırları kalmış olabilir. Sürüm sonrası kod hijyeni — kullanıcı için fark yok, console gürültüsü.

**6) i18n hardcoded string fix'leri**

App'in 6 dil desteği var ama bazı UI yazıları hâlâ hardcoded English. Suppliers form için v2.8.6 plan hazırlanmıştı (8 dosya: en/tr/es/fr/de/ar.js + suppliers.js + config.js — `/home/claude/work/` altında lansmandan önce hazırlandı, operatör beklemeyi seçti). Toplam ~50-100 string. **Sürümlere bölünecek** — operatör kuralı: tek seferde bulk değil, tool-by-tool.

**7) Türkçe landing page**

Şu an EN tek dil. Önerilen yaklaşım: **Seçenek B** (iki ayrı sayfa). `prochefdesk.com/` = EN (mevcut), `prochefdesk.com/tr/index.html` = TR. Üstte küçük EN/TR linki. ~1-2 saat iş, lansman sonrası düşünülür.

**8) Lansman ekran görüntüleri (1 saat)**

3 stratejik shot önerildi: hero recipe (live food cost gösterir), multi-device (laptop+phone yan yana), kitchen card veya menu builder. Operatör çekecek (Chrome DevTools veya snipping tool, Hi-DPI), TinyPNG ile optimize edecek, repo'da `/assets/landing/` altına koyacak. Entegrasyon Claude tarafında (yeni `<img>` tagleri + alt text + responsive).

### Orta öncelik (lansman sonrası, dış faktör beklenir)

**9) iOS Safari PWA testi**

Android Chrome'da PWA install çalışıyor. iOS Safari hiç test edilmedi. Operatörün kendi iPhone'u yok, arkadaşına sorması gerekiyor. **Lansman bloker'ı değil** — iOS chef gelmeden önce yapsa yeter. Test checklist'i bir önceki Claude konuşmasında verildi (10 madde: Safari render, login, recipe yarat, foto upload, PWA install, standalone mode, login persistence, workspace switcher, sync, görsel kontrol). Süre: sorun yoksa 15-20 dk.

### Düşük öncelik (lansman sonrası, gerek olursa)

**10) Realtime subscription leak Edge Case #2** — hızlı logout/login race. Lansman öncesi gerçekleşme ihtimali çok düşük (tek kullanıcı), atlandı.

**11) Daha fazla landing section (testimonials, FAQ, blog)** — Organik gelişim. Testimonials için 5 arkadaştan birkaç cümle alınabilir; FAQ için ilk hafta gelen sorulara göre yazılır; blog için Substack ücretsiz yeterli (kendi kurulum gereksiz şu an).

### Gelecek / hazır altyapı (kullanılmıyor)

**12) Subscriptions tablosu** — Premium tier için DB'de hazır, kullanılmıyor. "Free now, premium possible later" planına göre.

## 7. Operatör Çalışma Kuralları

**Bu kurallar opsiyonel değil — ihlal edildiğinde veri kaybı paniği yaşanmıştır. Yeni Opus instance bu kuralları kabul ederek başlamalı:**

### Çekirdek kurallar (orijinal handover'dan, kanıtlanmış)

1. **Bir hedef → en küçük adım.** SQL ile çözülecek bir şey için frontend kod temizliği + sürüm bump YAPMA.
2. **Birden fazla iyileştirmeyi tek sürüme paketleme.** DB ve kod ayrı sürümler. Geçen sefer paket halinde deploy patladı (v2.6.99 deploy bug'ı).
3. **Bulk regex YOK, otomatik script YOK.** Manuel dosya-by-dosya edit.
4. **Her değişiklikten sonra `node -c` ile syntax check.**
5. **Frontend tahmin yürütmeden önce SQL ile DB durumunu kontrol et.**
6. **Operatör screenshot gönderdiyse Console (DevTools) açıksa ÖNCE oraya bak.**
7. **Türkçe iletişim, sade dil. Operatör kod yazmıyor — "ne olur" diliyle açıkla.**
8. **Operatör yorgun veya kızgınsa seçenek sunma — net karar al, tek talimat ver.**

### Yeni öğrenilen kurallar (2026-05-06 ve 2026-05-08 konuşmalarından)

9. **GitHub Desktop GUI kullanılır, terminal/cmd değil.** Push talimatları "git add/commit/push" gibi shell komutları DEĞİL, GUI adımları olarak verilir: dosyaları kopyala → GitHub Desktop → Changes → Commit message yaz → Commit to main → Push origin.

10. **Cloudflare Pages build hook ile sürüm injection (v2.8.0 sonrası):** `app/index.html`'de `?v=__VERSION__` placeholder'ları yaşar. Sürüm bump'ı **sadece** `app/js/core/config.js`'in `APP_VERSION` satırını değiştirir + CHANGELOG günceller. Cloudflare push'ta `node build.js` çalıştırarak placeholder'ları gerçek sürümle replace eder. **`app/index.html`'e bir daha asla manuel sürüm string'i yazma** — yoksa build fail eder.

11. **Operatör çok bullet/uzun metin sevmez.** Cevaplar kısa, sade, doğrudan tek bir adımla devam edilebilir formda olmalı. "Şu seçenekler var, hangisini istersin?" yerine "Önerim X, başlıyorum" tarzı.

12. **Operatöre teknik kod gösterilmez.** Diff blokları, syntax detayları, fonksiyon iç yapıları operatöre fayda etmez — kafa karıştırır. Onun bilmesi gereken: ne değişecek (sade dilde), ne risk taşır, dosyayı nereye kopyalayacak.

13. **Onay süreci kısa olmalı.** "Şunu yapacağım, onaylar mısın?" diye uzun açıklamadan sonra sormak yerine; küçük işler için doğrudan yap, operatöre dosya sun. Büyük işler için (50+ satır, yeni dosya, DB değişikliği) açık onay al ama kısa cümleyle.

14. **Edge Function manuel test prosedürü:** Cloudflare Pages farklı, Supabase Edge Function farklı. Edge Function'ı test etmek için pg_net SQL: `SELECT net.http_post(url, headers, body, timeout_milliseconds := 60000)` kullan. Cron tanımındaki `command` alanından kopyalanabilir, vault.decrypted_secrets'tan token okunur. Response `net._http_response` tablosundan alınır.

15. **Restore prosedürü kanıtlanmış formül:** R2 jsonl dosyası → temp tablo → `jsonb_populate_record(NULL::<table>, line)` ile auto column mapping → `INSERT ON CONFLICT DO UPDATE`. Detay: docs/DISASTER_RECOVERY.md §5.3.5.

16. **🚨 ÖNERİ YAPMADAN ÖNCE REPO'YU KONTROL ET.** Bir özelliğin yokmuş gibi öneri yapmak (örn. "Report an issue modal eklenmeli") = operatöre boş yere iş çıkarır + güveni sarsar. **2026-05-08 hatası:** "Report an issue modal" lansman sonrası iş listesine yazıldı, ama mevcut özellik (account.js satır 213, openReportIssueModal 880-1000+ satır, hCaptcha + 6 dil i18n key'leri ile birlikte) zaten tam fonksiyonel. **Pratik kural:** Yeni özellik önermeden önce `grep -rn "<feature_name>\|<related_keyword>" app/js --include="*.js"` ile arama yap. Var ise "zaten var, kontrol ettim" diyerek listeden çıkar. Yok ise öner.

17. **Eski paylaşım linklerini koru — landing page eklerken (post-v2.8.5).** Root `index.html` artık landing page. Ama `prochefdesk.com/?share=xxx` formatındaki public share URL'lerini bozmamak için landing JS başında `?share=` query veya hash kontrolü var → varsa landing render edilmeden hemen `/app/?share=xxx`'e redirect. **Yeni section/feature eklerken bu redirect bloğunu silme** (landing dosyasının tepe kısmında, head içindeki `<script>` bloğu). Test: `prochefdesk.com/?share=test` → otomatik `/app/?share=test`.

### Onay zorunlu durumlar

- Herhangi bir DROP TABLE veya destructive SQL
- 50+ satır frontend değişikliği
- Yeni dosya/modül ekleme
- Cron schedule veya RLS policy değişikliği
- Cross-device sync mantığı değişikliği
- Edge Function deploy

### Sürüm numaralandırma kuralı

- DB-only migration'lar **kendi sürüm numarası alabilir** ama bu sürüm frontend'de görünmez (config.js'te değişmez). Örn: v2.6.98 cascade-triggers DB-only sürümdü; aynı dönemde frontend v2.6.98 vardı (Account sadeleştirme).
- v2.7.8-backup-cron-timeout DB-only idi, frontend v2.7.8 deploy edilmedi → frontend sürümü v2.7.7'den v2.7.9'a atladı (bu OK).
- **Landing page + Privacy/Terms (post-v2.8.5)** sürüm bump'ı YAPMADI — sadece root `index.html`, `privacy.html`, `terms.html` değişti, app kodu (`app/`) etkilenmedi. APP_VERSION v2.8.5'te kaldı.

## 8. Önemli Yerler / Değerler

| Bilgi | Değer |
|---|---|
| Repo path (operatör Windows) | `C:\Users\ahmet\Desktop\prochefdesk` |
| GitHub repo | `ahmetkayas1926/prochefdesk` |
| Production sürümü (frontend) | **v2.8.5** (+ post-v2.8.5 landing/legal) |
| Supabase project ref | `muuwhrcogikpqylsfvgg` (Tokyo region, Postgres 17, Free tier) |
| Cloudflare R2 bucket | `prochefdesk-backups` |
| CLEANUP_SECRET | `ec79a445-7e92-499b-9322-5c2c949788d4d2886e66-d556-4498-ba9e-17fda6c11ac1` |
| Operatör e-posta | ahmetkaya.s1926@gmail.com |
| App e-posta | hello@prochefdesk.com (Cloudflare Email Routing → Gmail) |
| Test edilen platformlar | Desktop Chrome ✅, Android Chrome (PWA install) ✅ |
| Test edilmemiş | iOS Safari (PWA) — arkadaş iPhone'u beklenirken |
| Cloudflare Pages build command | `node build.js` (production env, v2.8.0 sonrası kuruldu) |
| Landing page fontları | Fraunces (display) + Manrope (body), Google Fonts |
| Landing page palette | cream `#FAF7F2` + forest green `#2D4A3E` + copper `#B85C3C` |

## 9. Yeni Opus Instance İçin Başlangıç Kontrol Listesi

Yeni bir konuşma açtığında ÖNCE bunlara bak:

1. ☐ Bu HANDOVER.md tamamen okundu mu?
2. ☐ CHANGELOG.md son sürüm girdisi okundu mu? (Mevcut: v2.8.5 + post-v2.8.5 landing/legal)
3. ☐ Operatör dilini doğrula: **Türkçe, sade dil, kısa cevaplar, GitHub Desktop GUI**
4. ☐ Bir iş yapmadan önce: bu iş zaten yapıldı mı? (Bu doküman §5'i kontrol et)
5. ☐ **Bir özellik önermeden önce repo'da `grep` ile var olup olmadığını kontrol et** (kural 16)
6. ☐ DB durumunu varsayma — gerekiyorsa SQL ile sor
7. ☐ Cloudflare Pages durumunu varsayma — gerekiyorsa Dashboard ekran görüntüsü iste
8. ☐ Sürüm bump için sadece `app/js/core/config.js`'i değiştir, `app/index.html`'e dokunma (build hook v2.8.0'da kuruldu)
9. ☐ Landing page (root index.html) ile app (`app/index.html`) iki ayrı dosya — birini değiştirirken diğerine dokunma

## 10. Sürtünme Noktaları ve Mimari Kurallar (gotcha'lar)

Bu bölüm, geçmişte birden fazla tur yenilenen veya kafa karışıklığı yaratan konuları kalıcı olarak kayda alır. Yeni Opus bunlara dikkat etmezse aynı bug'lar yeniden çıkar.

### 10.1 — Cloud sync race condition (KRİTİK, tekrar etme)

**Bug class:** Bir UI aksiyonu hem local state'e yazar hem de cloud sync'i tetikler. Sonra kod hemen `location.reload()` yaparsa, debounced sync henüz yazımı tamamlamadan reload tetiklenir. Reload sonrası cloud'dan eski veri çekilip local'in üstüne yazılır → kullanıcı yazdığı verinin "kaybolduğunu" görür.

**Çözüm formülü:** Reload öncesi `await PCD.cloud.pushNow()` veya `await PCD.cloudPertable.pushNow()` çağrılır — sync resolve olmadan reload TETİKLENMEZ. Bu, Workspace Trash UI'da (v2.7.5/v2.7.6 restore/purge) ve cascade tombstone'ların DB → Realtime → IDB yolculuğunda kanıtlandı.

**Pratik kural:** Bir UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada explicit pushNow await olmalı**. Yeni özellik eklerken bu zincire dikkat.

### 10.2 — PCD.icon registry — silent info fallback (v2.7.7 hatası)

`PCD.icon(name, size)` fonksiyonu (`app/js/core/utils.js`'te) registry'de olmayan bir isim verilince **info ikonuna fallback** yapar. Hata fırlatmaz, console warn vermez — sadece kırmızı yuvarlak içinde "i" görüntüler.

**Sonuç:** Lucide ikon ismi (örn. `trash-2`, `rotate-ccw`, `chevron-right`) verirsen registry'de yok → görsel info ikonu çıkar, kod bug'ı aramak zaman alır.

**Mevcut registry'deki yaygın isimler:** `trash`, `refresh`, `archive`, `edit`, `plus`, `x`, `check`, `info`, `warn`, `chef-hat`, `chevron-down`, vb. (registry tam liste için `app/js/core/utils.js`'i incele.)

**Pratik kural:** Yeni ikon kullanmadan önce `grep -n "<name>:" app/js/core/utils.js` ile registry'de var olduğunu doğrula. Eğer yoksa ya o iconu registry'ye ekle, ya mevcut bir ikona düş.

### 10.3 — Per-table sync akışı (özet)

Sync iki yönlü, debounce'lu:

- **Push (local → cloud):** `cloud-pertable.js` UI yazımlarını dinler, batch'leyip 1.5sn debounce ile Supabase'e PATCH/INSERT/UPSERT atar. `pushNow()` debounce'u atlar (kritik akışlar için).
- **Pull (cloud → local):** `cloud.js` boot'ta tüm 22 tablodan kullanıcıya ait satırları çeker, IDB'ye yazar, state'e merge eder. `pullInProgress` flag'i ghost duplicate önler (v2.6.85). v2.8.3'te ek davranış: pull tamamlanırken lokal-only workspace'ler queueUpsert ile cloud'a push edilir (onboarding workspace fix).
- **Realtime (cloud → local, canlı):** `cloud-realtime.js` 19 tabloya WebSocket subscribe olur. Postgres change event'leri local state'i otomatik günceller (cross-device sync). v2.7.9'da orphan channel leak fix'i, v2.8.5'te init'teki çift subscribe race fix'i eklendi.

Sync ile ilgili bir bug görüldüğünde önce **hangi yön** soru sor — push mu, pull mu, realtime mı? Tahmin yürütme.

### 10.4 — RLS aktif (tüm 22 tablo)

Tüm tablolar `ENABLE ROW LEVEL SECURITY` ile korunmuş. Service-role key bypass eder, ama frontend `anon` key kullanıyor. **Yeni tablo eklersen RLS policy de ekle**, yoksa frontend'den okuma/yazma çalışmaz (ya da daha kötüsü: başka kullanıcının verisini görür).

**Standart policy şablonu** (workspace-scoped tablo için):
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 10.5 — OAuth callback URL'leri

Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL:** `https://prochefdesk.com`
- **Redirect URLs:** `https://prochefdesk.com/**` (wildcard) ve dev için `http://localhost:*`

**`/app/` taşımasından sonra (v2.8.2):** `https://prochefdesk.com/app/**` Redirect URLs listesine eklendi. `auth.js` Google OAuth `redirectTo: window.location.origin + '/app/'` kullanıyor — login sonrası kullanıcı `/app/`'e döner, root'taki landing'e değil.

### 10.6 — App'in 10 ana tool'u (kullanıcı tarafından görünür)

| Tool | Rol |
|---|---|
| 1. Recipes | Tarif girme + maliyet hesaplama (live food cost) |
| 2. Ingredients | Malzeme veritabanı (alerjen, fiyat, ölçü dönüşüm) |
| 3. Menu Builder | Menü kurgu + variance analizi |
| 4. Kitchen Cards | A4 print mise-en-place kartı |
| 5. Portion Calculator | Porsiyon ölçeklendirme |
| 6. Shopping List | Otomatik alışveriş listesi |
| 7. Inventory | Stok takibi (composite PK: workspace_id+ingredient_id) |
| 8. Suppliers | Tedarikçi yönetimi |
| 9. Events / Catering | Etkinlik planı + maliyet |
| 10. Checklists | HACCP/açılış-kapanış checklist'leri |

Workspace'ler her chef için izole (restoran/iş değiştirince yeni workspace, eski erişilebilir).

### 10.7 — Misafir vs üye davranışı

- **Misafir (login yok):** Sadece IDB, cloud yazma KAPALI. Demo seed yüklenir, onboarding tour gösterilir. Cloud kontaminasyonu önlemek için herhangi bir push tetiklenmemeli (v2.6.93'te bu sızıntı kapatıldı, v2.8.4'te queue temizliği ile pekiştirildi).
- **Üye (login var):** IDB + cloud tam çift yönlü. Realtime aktif.

Yeni feature eklerken: bu yazım yolu **misafir kullanıcı için aktif olmamalı** (cloud-bağımsız demo deneyimi korunsun).

### 10.8 — `app/index.html` sürüm string'i ASLA literal yazılmaz (v2.8.0+)

Repodaki `app/index.html`'in 49 yerinde `?v=__VERSION__` veya `>v__VERSION__<` placeholder yaşar. Cloudflare deploy zamanı `node build.js` çalıştırarak bu placeholder'ları gerçek sürümle replace eder. Operatör veya AI tarafından `app/index.html`'e literal sürüm string'i yazılırsa (`?v=2.8.1` gibi):

- **Build başarısız olur:** `[build] FATAL: No __VERSION__ placeholders found in app/index.html`
- Cloudflare Pages deploy reddeder, eski sürüm canlı kalır (operatör için zarar yok ama yeni sürüm gitmez)

**Sürüm bump için tek dokunulan yer: `app/js/core/config.js`'in APP_VERSION satırı.**

### 10.9 — `clearUserData` zinciri queue'yu da temizlemeli (v2.8.4 dersi)

`store.clearUserData()` çağrıldığında lokal state temizlenir ama bu YETMEZ — `cloud-pertable.queue` (in-memory + IDB persist) de temizlenmeli. Yoksa:

- **Bug 2 senaryosu (demo orphan):** Misafir → demo seed queue'ya birikir → SIGN UP → clearUserData state'i temizler → 250ms sonra flushNow demo'yu yeni user'ın user_id'siyle DB'ye yazar.
- **Bug 3 senaryosu (cross-user leak):** User A logout → queue dolu kalır + IDB'ye persist → User B login → boot'ta loadPersistedQueue → clearUserData state'i temizler → flushNow User A'nın yazımlarını User B'nin user_id'siyle DB'ye yazar.

**Pratik kural:** State temizleyen herhangi bir kod path'i yazarken **`PCD.cloudPerTable.clearQueue()` çağrısını da düşün**. v2.8.4'te eklenen public API: in-memory queue + queueIndex + flushTimer + IDB `pertable_queue` key — atomik sıfırlar.

### 10.10 — Doğrudan state mutation queue tetiklemez (v2.8.3 dersi)

`state.workspaces[wsId] = { id, name, ... }` veya `state.recipes[rId] = {...}` gibi doğrudan mutation **cloud-pertable queue'yu tetiklemez**. Queue mekanizması sadece public API çağrılarına bağlı: `upsertWorkspace`, `upsertRecipe`, `upsertIngredient`, vb.

**Sonuç:** Lokal'de görünür ama cloud'a hiç gitmez → mobil cihazda yok → kullanıcı "verim kayboldu" zanneder.

**v2.8.3 örneği:** `ensureActiveWorkspace()` doğrudan mutation yapıyordu, "My Kitchen" workspace yaratıyordu ama DB'ye hiç yazılmıyordu. Fix: pull tamamlama akışında lokal-only workspace'leri queueUpsert ile push.

**Pratik kural:** Yeni state değiştiren kod yazarken iki yoldan biri:
1. **Tercih edilen:** `PCD.store.upsertX(...)` API'si üzerinden git (queue otomatik tetiklenir).
2. Doğrudan mutation şartsa, sonrasında **explicit `PCD.cloudPerTable.queueUpsert('table', row)` çağrısı ekle**.

### 10.11 — Realtime init: tek subscribe path, fallback setTimeout YOK (v2.8.5 dersi)

`cloud-realtime.js`'in `init()` fonksiyonunda subscribe'ı tetikleyen path **bir tane** olmalı. Defensive fallback `setTimeout` eklemek (örn. "auth event hiç gelmezse diye" mantığıyla) **race condition yaratır**:

- Path 1 channel oluşturur, SUBSCRIBED'a geçmeden
- Path 2 aynı channel referansını `removeChannel()` eder → CHANNEL_ERROR callback fırlar

**Doğru yaklaşım:** SIGNED_IN ve mevcut session getSession() iki yolu da `auth._setUser` → `store.set('user')` zincirini tetikler. `store.on('user')` listener tek subscribe yolu olarak yeter, fallback gerek yok.

**Pratik kural:** Subscribe/unsubscribe operasyonları idempotent değil. Aynı channel'ı iki yerden tetiklemek = race. Tek source of truth seç (auth event), defensive fallback ekleme.

### 10.12 — Landing page (root) vs App (app/index.html) iki ayrı dosya

v2.8.2 sonrası repo yapısı:
- `index.html` (root) = Landing page (post-v2.8.5: tam HTML/CSS/JS landing, önceden mini redirect idi)
- `app/index.html` = App entry point (cache-busting placeholder'larını içerir)

Bu iki dosya **birbirinden bağımsız**. Birini değiştirirken diğerine dokunma. Cache-busting build script (`node build.js`) sadece `app/index.html`'i işler — root `index.html` dokunulmaz, kendi statik içeriği vardır.

**Privacy/Terms da bağımsız:** v2.8.5 sonrası `privacy.html` ve `terms.html` artık app CSS'inden bağımsız (kendi inline stilleri var). App'in `core.css` veya `themes.css`'i değişse bu sayfalar etkilenmez.

**Eski paylaşım linki uyumluluğu** (kural 17 ile birlikte oku): Landing page JS başında `?share=` veya hash kontrolü vardır → varsa landing render edilmez, hemen `/app/`'e yönlendirilir. Bu blok silinirse eski public share URL'leri kırılır.
