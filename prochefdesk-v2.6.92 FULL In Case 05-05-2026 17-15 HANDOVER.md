# ProChefDesk — Project Handover

**Tarih:** 5 Mayıs 2026  
**Mevcut sürüm:** v2.6.92 (canlı, stabil)  
**Codebase:** Yeni konuşmaya yüklenecek `prochefdesk-v2_6_92_FULL_In_Case_05-05-2026_17-15.zip` içinde.

---

## 1. Operatör

**Ahmet Kaya** — Perth, Western Australia. Çalışan şef, programcı değil ama kod ve infra ile rahat. ProChefDesk solo non-commercial proje. Hedef: 6 ay içinde 50+ şef kullanıcı.

**Repo yerel yolu:** `C:\Users\ahmet\Desktop\prochefdesk` — GitHub Desktop ile push, Cloudflare auto-deploy.

---

## 2. Stack

- **Frontend:** Vanilla JS (framework yok), 49 JS dosyası, bundling yok
- **Backend:** Supabase (`muuwhrcogikpqylsfvgg`, ap-northeast-1, Tokyo) — Postgres 17 + RLS, Auth (Google OAuth), Storage (foto), Realtime
- **Hosting:** Cloudflare Pages, branch `main`, auto-deploy on push
- **Domain:** `prochefdesk.com` (Cloudflare Full SSL)
- **Email:** Cloudflare Email Routing → `hello@prochefdesk.com` → Gmail
- **Lokal storage:** IndexedDB (DB: `prochefdesk`, store: `state`, key: `main`)
- **PWA:** Desktop Chrome + Android doğrulanmış, iOS test edilmedi
- **i18n:** 6 dil — EN/TR/ES/FR/DE/AR (`PCD.i18n.t()` + EN fallback)

**Supabase credentials** `js/core/config.js`'te embedded — anon key public, RLS koruyor.

---

## 3. Codebase yapısı

```
/
├── index.html, privacy.html, terms.html  (cache-bust ?v=2.6.92, 50 satır içerir)
├── manifest.webmanifest                   (PWA)
├── CHANGELOG.md
├── css/                                   (5 dosya: core, components, themes, mobile, print)
├── js/
│   ├── core/                              (17 modül — altyapı)
│   │   ├── config.js                      ← APP_VERSION burada
│   │   ├── store.js                       ← lokal state, IDB persist
│   │   ├── idb-wrapper.js                 ← IndexedDB Promise wrapper
│   │   ├── cloud.js                       ← Supabase client + pull
│   │   ├── cloud-pertable.js              ← per-table sync (queue + flush)
│   │   ├── cloud-realtime.js              ← Realtime subscriptions
│   │   ├── cloud-migrate-v4.js            ← bir kerelik schema migration
│   │   ├── auth.js                        ← Google OAuth + session
│   │   ├── photo-storage.js               ← recipe foto upload/migrate
│   │   ├── share.js                       ← public share linkleri
│   │   ├── i18n.js, router.js, qr.js, utils.js, allergens-db.js, variance.js
│   ├── tools/                             (24 araç)
│   ├── ui/                                (modal, toast, picker, cropper, dragdrop, tutorial)
│   ├── i18n/                              (6 dil + 4 phase ek dosyası)
│   └── seed/demo-recipes.js               (demo seed)
├── migrations/                            (8 SQL — v2.5.7 → v2.6.77)
├── supabase-functions/delete-account/     (Edge Function — auth.users silme)
├── supabase/functions/                    (backup-to-r2, delete-account)
├── docs/DISASTER_RECOVERY.md              (felaket kurtarma playbook)
└── assets/icons/                          (PWA ikonları)
```

---

## 4. Mimari özet

### Lokal state (`store.js`)
- Single in-memory `state` object — tüm uygulama datası
- IndexedDB'de tek `main` key altında saklı (v2.6.92 ile localStorage tamamen kapalı, `prefs.idbWriteOnly` flag ile geçiş tek seferlik)
- Boot async (`app.js`):
  ```
  cloud.init() → await store.init() → theme/locale → await auth.init() → onAuthResolved() → router register
  ```
- **Kritik:** `await auth.init()` pull tamamlanmadan UI register'ı yapılmaz — aksi halde pull emit'leri router listener'larına ulaşmaz (v2.6.91'de düzeltildi).

### Cloud sync (`cloud-pertable.js`)
- 19 tablo, her biri `user_id` RLS koruması altında
- `queueUpsert/queueDelete` → 250ms debounce → `flushNow` batch upsert
- `pullAll`: tüm tablolardan kullanıcı verisini çekip merge eder
- `cloud.js` blob (`user_data` tablo) yazma/okumaları **kapalı** (v2.6.87) — eski blob tablosu DB'de duruyor ama kullanılmıyor
- `pullInProgress` flag (v2.6.85) — pull sırasında push erteleniyor, ghost workspace duplicate önleme

### 24 araç
Recipes (live food cost), Ingredients, Menu Builder, Kitchen Cards, Portion Calculator, Shopping List, Inventory, Suppliers, Events/Catering, HACCP (Cook & Cool, Logs, Units, Readings), Waste Log, Variance, Sales, Yield, Allergens, Nutrition, What-if, Team, Tools Hub, Account, Checklist, Dashboard, Menu Matrix.

### Workspace izolasyonu
Her venue/job ayrı workspace. ws-bound tablolar `{ wsId: { recordId: record } }` shape. Workspace silme: `workspace_tombstones` tablosuna kayıt → cross-device cascade wipe.

### Soft delete
`_deletedAt` flag + DB'de `deleted_at` kolonu. Trash UI 30 günde otomatik temizler (lokal). **Server-side cleanup yok** — handover sonrası eklenecek.

---

## 5. Faz 4 (tamamlandı)

| Sürüm | Ne yapıldı |
|-------|-----------|
| v2.6.84 | `cloud-pertable` workspaces upsert'inde `delete row.data` (data jsonb kolonu yok şemada) |
| v2.6.85 | `pullInProgress` flag → ghost workspace duplicate çözümü |
| v2.6.86 | SIGNED_IN handler'ında demo seed cleanup → demo cloud'a sızmıyor |
| v2.6.87 | Eski blob (`user_data`) yazma/okuma tamamen kapatıldı |
| v2.6.88 | `cost_history` tablosu drop edildi (boş ve kullanılmıyordu) |
| v2.6.89 | IndexedDB altyapısı (`idb-wrapper.js`) + write-through |
| v2.6.91 | Async boot, IDB-first read |
| v2.6.92 | LS yazma kapatıldı, tek seferlik LS cleanup migration |

---

## 6. Kritik kod kuralları

### 6.1 Manuel dosya editleme zorunlu
Bulk regex/sed scriptleri **yasak** — geçmişte bir tanesi 226+ syntax hatası yarattı. Tek tek dosya editlenir, syntax kontrolü yapılır.

### 6.2 Sürüm bump'ı 5 yerde — hiçbiri atlanamaz
Eski handover'lar "4 yer" derdi, gerçek **5**. İlk geliştirme döngüsünde hardcoded badge satırı atlandı, footer eski sürüm gösterdi, operatör hatasını yakaladı.

1. `js/core/config.js` → `APP_VERSION`
2. `index.html` satır ~111 → hardcoded `<div>v2.X.Y</div>` **(en kolay atlanan)**
3. `index.html` → ~50 cache-bust `?v=X.Y.Z` string'i
4. `privacy.html` + `terms.html` → her birinde 2 cache-bust
5. `CHANGELOG.md` → yeni entry

### 6.3 Kümülatif zip kuralı
Her zip eski base'den geliyor. Daha önceki sürümlerin fix'leri her yeni zip'e **manuel olarak yeniden uygulanmalı**. Atlanırsa eski bug'lar geri gelir.

**v2.6.93 paketinde tam bu yaşandı:** v2.6.84'ün `delete row.data` fix'i atlandı, `Could not find 'data' column` hatası geri döndü, restore akışı bu yüzden çalışmadı, sürüm revert edildi.

**Sahaya çıkmamış sürümler:** v2.6.93 (yanlış paketleme + sonra revert), v2.6.94 (v2.6.93 düzeltme denemesi, push edilmedi). v2.6.92 sonrası fiili commit yok.

### 6.4 Operatörün dosyasıyla çalış
Eğer Claude'un staged kopyası eski bir sürümse, operatöre ilgili dosyayı (örn. `store.js`) yükletmeden zip atma — kümülatif fix kaybı yaşanır. **Bu konuşmada zaten tam codebase yüklü, problem yok.**

### 6.5 Onay almadan zip atma
Hızlı yeni zip atmak güveni eritiyor. Önce teşhis, kanıt topla, sonra onay, sonra kod. Operatör test ederken bug çıktığında refleks zip atmak en sık yapılan hatadır.

### 6.6 Soru sorma sınırı
Ardışık birden fazla "ne istersin/A mı B mi" sorusu operatörü patlatır. Tahmin yapma, kanıt topla — net teşhis için tek soru sor, sonra harekete geç.

### 6.7 Yeni özellik yok
Mevcut araçları cilala. Yeni form/araç sadece kullanıcı geri bildiriminden sonra. Şu an bilenen 1 kullanıcı var (operatörün kendisi).

---

## 7. Operatör tercihleri

- Workflow: Claude zip → indir → GitHub Desktop ile commit + push → Cloudflare auto-deploy
- SQL'i inline kod bloğu olarak ver, zip'in içine değil — kopyalayıp Supabase SQL Editor'da çalıştırıyor
- Açıklama yerine eylem ister, uzun yazılar tetikleyici
- "Wait and observe" yasak — operatör bunu "saçmalık" olarak görür
- Hata olduğunda kabul et, savunma yapma; kümülatif kaynak listesi göstererek onayla ilerle
- Türkçe iletişim — kod yorumları da Türkçe (mevcut codebase tutarlı)

---

## 8. Yarım kalan / planlanan işler

### 8.1 Bilinen aktif bug — backup restore çalışmıyor

**Davranış:** "Restore from backup" tuşuna basıldığında modal açılır, "Replace everything" tıklandığında reload sonrası veri **örtüşmez**. 

**Nedenler:**
1. `account.js`'in restore handler'ı `store.set()` ile lokali değiştiriyor ama 800ms timeout sonrası reload, debounced persist'in tamamlandığını garanti etmiyor
2. `runMigrations` çağrılmıyor — eski schema backup'lar yarım kalıyor
3. `activeWorkspaceId` validation yok
4. **En kritik:** Cloud'da silinmemiş kayıtlar var, restore lokali değiştiriyor ama cloud'da kalan eski kayıtlar pull ile geri geliyor → "tam geri yükleme" değil

**Çözüm tasarımı (operatör onayladı, implementasyon henüz sahaya inmedi):**
- `cloud-pertable.wipeAllUserData()` (yeni fonksiyon — tüm user tablolarına RLS user_id ile DELETE)
- `replaceAll(data)` lokal state replace + runMigrations
- `activeWorkspaceId` validation (backup'ta yoksa ilk geçerli ws'e ata)
- `flushSync` IDB'ye sync yazım
- `cloud-pertable.flushNow()` Promise dönsün, await edilebilsin
- Tüm zincir async/await ile sıralı, sonra reload

### 8.2 Standart SaaS hedefi için 3 madde (operatör onaylı plan)

Sırayla yapılacak:

**Madde 1 — Backup restore'u düzelt** (yukarıdaki).  
Tek seferlik; restore = "tam geri yükleme" garantisi. Veri güvenliği için kritik.

**Madde 2 — Cloud sync queue persistence.**  
Şu an `cloud-pertable.queue` JS hafızasında. Offline yazma sırasında sekme kapanırsa kuyruk uçar → veri kaybı. Çözüm: kuyruğu IDB'de bir array olarak persist et, boot'ta yeniden yükle, online olunca flush. ~100 satır kod.

**Madde 3 — Server-side cleanup (Supabase Edge Function + cron).**  
Tek kerelik kur, unut:
- 30 günden eski `_deletedAt` kayıtlarını gerçek DELETE
- Silinen tariflerin orphan foto path'lerini Supabase Storage'dan temizle

Bu üçü tamamlanırsa standart SaaS seviyesinde — beta kullanıcılar için yeterince stabil.

### 8.3 Atılmış maddeler (eski handover'da vardı, gereksiz çıktı)

- iOS `navigator.storage.persist()` — Apple zaten honor etmiyor, asıl koruma sağlam cloud sync (Madde 2)
- DB indexler — 100+ kullanıcıdan sonra, şimdi gereksiz
- Sentry/error tracking — şu an "Report an issue" formu yeterli
- Otomatik testler — solo dev için aşırı yatırım

### 8.4 Adım 6 — beta hazırlığı (Madde 1-3 sonrası)

- **Landing page:** app `/app/` altına taşı, root URL marketing sayfası olsun
- **Privacy Policy + Terms** zaten var
- **"Report an issue" form** (planlandı, yapılmadı)
- Beta kullanıcı kabulü
- Instagram içeriği — pazarlama
- Premium tier (uzak vade)

---

## 9. Operatör verisi (canlı)

- **User ID:** `5d080161-9e10-4b80-af0a-89e72a590218`
- Hesap son test sırasında (5 Mayıs) sıfırlandı; yeni Google sign-in ile baştan başladı
- Demo seed: ilk sign-in'de gelir, SIGNED_IN handler'ında temizlenir (v2.6.86)

---

## 10. Yeni konuşmada ilk yapılacak

1. **v2.6.92 sahada, sağlam — onaylama.** Codebase tam yüklü, çalışıyor.
2. **Operatöre ne yapmak istediğini sor:** Madde 1 (restore fix) mi, başka bir şey mi.
3. **Onay alınca:**
   - Hangi dosyalar etkilenir, hangi önceki fix'lerin korunması gerekiyor — yazılı liste ver
   - Onay al
   - Sonra kod
4. **Sürüm bump 5 yerde** — kontrol listesini her seferinde tek tek tikle, hardcoded badge satırını (`index.html:~111`) atlama.
5. **Push öncesi:** zip içeriğini doğrula (eksik dosya, eksik fix var mı), `node -c` ile syntax kontrolü yap.
