# v2.5.7 — Share lifecycle (list / pause / delete) + create-or-get fix

⚠️ **Bu sürüm Supabase'de bir migration gerektiriyor.** Paketin içindeki `migrations/v2.5.7-share-lifecycle.sql` dosyasını Supabase Dashboard → SQL Editor'da bir kere çalıştır. Çalıştırmazsan paylaşım/QR butonları "Could not create share" hatası verir.

## Özet

Bu paket yeni bir kullanıcı özelliği eklemekten çok altyapı temizliği. Önceki paketlerde `createOrGetShareUrl` adına rağmen her seferinde yeni share ID üretiyordu (aynı tarife 2 kez QR alırsan 2 farklı URL). Ayrıca oluşturulmuş share'leri görüntülemek, durdurmak veya silmek mümkün değildi — sahibi olduğu paylaşımlardan habersizdi. Bu paket bu iki sorunu kökünden çözüyor.

## Veritabanı değişiklikleri

`public_shares` tablosu drop'lanıp baştan oluşturulur. Yeni schema:

| Kolon | Açıklama |
|---|---|
| `id` | text PRIMARY KEY (random 12-char) |
| `kind` | `'recipe'` \| `'menu'` \| `'kitchencard'` |
| `source_id` | Orijinal item ID'si (yeni) |
| `payload` | jsonb snapshot |
| `owner_id` | uuid → auth.users |
| `paused` | boolean (yeni, default false) |
| `view_count` | integer (yeni, default 0) |
| `created_at`, `updated_at` | timestamptz |

**Unique constraint:** `(owner_id, kind, source_id)` — aynı item için sadece bir share kaydı. createOrGet idempotent çalışır.

**RLS politikaları:**
- `public_shares_read_by_id`: ID'yi bilen okur (anon dahil) — share IDs zaten random, link bilmek = erişim hakkı.
- `public_shares_owner_all`: Sahip kendi share'leri üzerinde her şey yapabilir.

**RPC:** `increment_share_view(share_id text)` — atomik view counter, paused olanları artırmaz, anon callable.

**Trigger:** `updated_at` her UPDATE'te otomatik güncellenir.

## Kod değişiklikleri

### `js/core/share.js` (refactored)

**`createOrGetShareUrl(kind, sourceId)`:**
- Önce `(owner, kind, source_id)` ile mevcut share var mı sorgular
- Varsa → snapshot'ı **otomatik tazeler** (payload UPDATE), aynı URL döner
- Yoksa → yeni kayıt oluşturur
- Sonuç: aynı tarife/menüye 2 kez QR alırsan aynı URL gelir, ve URL her zaman güncel snapshot'ı gösterir
- Otomatik tazeleme avantajı: Mutfak duvarındaki QR her zaman güncel tarifi gösterir, eski snapshot'a saplanıp kalmaz

**`fetchShare(shareId)`:**
- `paused = true` ise özel `code: 'paused'` hatasıyla reddeder
- Başarılı fetch'te fire-and-forget olarak `increment_share_view` RPC'sini çağırır

**Yeni fonksiyonlar:**
- `listMyShares()` — kullanıcının tüm share'lerini getirir (sıralı: en son güncellenen üstte)
- `setSharePaused(shareId, paused)` — pause/resume toggle
- `deleteShare(shareId)` — kalıcı silme
- `snapshotKitchenCard(canvasId)` — şimdilik null döner (v2.5.8'de doldurulacak stub)

**`initShareCheck()`:**
- Paused share için friendly sayfa render eder ("⏸ This share is paused" + "Open ProChefDesk")
- Mevcut "Share not found" sayfası ayrı korunur

**`PCD.share` exports:** `listMyShares`, `setSharePaused`, `deleteShare`, `snapshotKitchenCard` eklendi.

### `js/tools/account.js`

- "Sharing" yeni bölüm (Legal'in altında, About'un üstünde)
- Tek kart: 🔗 **My shares** → modal açar
- Modal: tüm share'leri listeler, her satırda:
  - İkon + kind label (📖 Recipe / 🍽 Menu / 🗂 Kitchen Card)
  - İsim (snapshot'tan okunur)
  - View count ("👁 12 views")
  - Status badge (● Active / ⏸ Paused, renkli)
  - 3 buton: 📋 Copy URL / ⏸ Pause (veya ▶ Resume) / 🗑 Delete
- Delete confirm modal — kalıcı silme uyarısı
- Boş durum: "No shared items yet…" friendly empty state

### `js/i18n/*` (6 dilde 24 yeni key)

`shared_items_*`, `share_kind_*`, `share_active`, `share_paused`, `share_views`, `share_loading`, `share_no_shares_yet`, `share_copy_url`, `share_pause_btn`, `share_unpause_btn`, `share_delete_btn`, `share_url_copied`, `share_paused_msg`, `share_unpaused_msg`, `share_delete_confirm_title`, `share_delete_confirm_msg`, `share_deleted_msg`, `share_unavailable`, `share_signin_required`, `share_paused_page_title`, `share_paused_page_msg`, `share_back_to_app` — EN/TR/ES/FR/DE/AR hepsi tam.

## Cache-busting

- `index.html` — 48 yer `?v=2.5.6` → `?v=2.5.7` + sidenav rozeti `v2.5.7`
- `privacy.html`, `terms.html` — sadece CSS cache-bust (legal metadata `Version 2.5.4` korundu)
- `js/core/config.js` — APP_VERSION 2.5.7

## Migration kılavuzu

1. Bu paketi deploy etmeden ÖNCE `migrations/v2.5.7-share-lifecycle.sql` dosyasını Supabase Dashboard → SQL Editor'a yapıştır ve "Run" tıkla
2. SQL output'unda hata yoksa migration başarılı
3. Sonra paketi Cloudflare Pages'e deploy et
4. Eski share URL'leri artık çalışmaz (eski tablo drop'landı) — sen "direk sil" demiştin, bu beklenen davranış
5. Yeni QR/share URL'leri yeni tabloda oluşacak

## Test senaryoları

1. **Create-or-Get** — Aynı tarife 2 kez QR al → her ikisinde de aynı URL ✓
2. **Auto-refresh** — Tarif düzenle → tekrar QR al → aynı URL ama yeni snapshot ✓
3. **List shares** — Account → Sharing → "My shares" → tüm share'leri listele
4. **Copy URL** — Bir share'in 📋 Copy URL butonu → URL clipboard'a düşer
5. **Pause** — ⏸ Pause → URL'i yeni sekmede aç → "⏸ This share is paused" sayfası
6. **Resume** — ▶ Resume → URL'i tekrar aç → tarif/menü görünür
7. **Delete** — 🗑 → confirm modal → onayla → URL artık 404
8. **View counter** — Bir share URL'sini birkaç kez aç → My shares'da view count artar
9. **Empty state** — Hiç share yokken modal aç → friendly empty state

## Bilinen sınırlamalar (v2.5.8'de gelecek)

- Kitchen Cards için QR/Share UI henüz yok. Altyapı hazır (kind enum, snapshotKitchenCard stub) — UI ve gerçek snapshot v2.5.8'de.

## Doğrulama

- 42 JS dosyası `node --check` ✓
- 6 dilde tüm i18n key'ler ✓
- index.html: 48 adet `?v=2.5.7`, eski cache-bust yok ✓
- account.js, share.js syntax temiz ✓

---

# v2.5.6 — Share link & QR bug fix

## Düzeltilen sorunlar

### 1. Share link sayfası sonsuza kadar splash ekranında takılıyordu

**Sebep:** `share.js` `?share=...` URL'sini algıladığında normal app boot'unu `return` ile atlıyor, ama splash div'i (full-screen "ProChefDesk · Kitchen OS · spinner" ekranı) sadece normal boot'un sonunda gizleniyordu (`app.js` line 87). Share path'te splash hiç gizlenmiyor → kullanıcı sonsuza kadar splash görüyordu. İçerik aslında arka planda yükleniyor ama splash üstünde olduğu için görünmüyordu.

**Düzeltme:** `js/core/share.js` → `initShareCheck()` başında splash'i fade-out + display:none ile gizle. Mevcut splash gizleme kodunun (app.js line 85-88) aynısı.

### 2. QR kodu URL yerine düz metin içeriyordu

**Sebep:** `js/tools/menus.js:767` ve `js/tools/recipes.js:292` — QR'a tarif/menü içeriğinin TEXT formatlanmış halini gönderiyordu (`"Lunch Menu Sample · Chicken Tikka — $18 · ..."`). Telefon kamerasıyla QR taranınca URL yerine bu uzun text Google arama çubuğuna düşüyordu, hiçbir şey açılmıyordu.

**Düzeltme:** Her iki QR butonu artık önce `PCD.share.createOrGetShareUrl()` çağırarak share URL'si üretir, sonra o URL'yi QR'a koyar. Mevcut "Share Link" butonunun pattern'ini takip eder: spinner gösterir, başarılı olursa QR modalı açılır, hata olursa toast ile bildirilir.

**Kullanıcı akışı:**
- Tarife veya menüye QR butonu basılır
- Buton "QR oluşturuluyor…" diye spinner gösterir
- Supabase'de `public_shares` tablosuna kayıt oluşur
- QR modalı açılır, içinde `prochefdesk.com/?share=abc123` URL'sini içeren QR kodu var
- Telefon kamerasıyla taranınca tarayıcıda tarif/menü sayfası açılır

**Önkoşullar:**
- Kullanıcı login olmalı (anonim QR şu an mümkün değil — `createOrGetShareUrl` kullanıcı ID'si ister)
- Cloud bağlantısı aktif olmalı (offline modda QR oluşturulamaz — toast ile bildirilir)

## i18n

3 yeni key — 6 dilde:
- `qr_generating` — "QR oluşturuluyor…"
- `qr_share_error` — "QR oluşturulamadı"
- `qr_signin_required` — "Paylaşılabilir QR için giriş yapın"

EN/TR/ES/FR/DE/AR — hepsi tam.

## Cache-busting

- `index.html` — 48 yerde `?v=2.5.5` → `?v=2.5.6` + sidenav-footer rozeti `v2.5.6`
- `privacy.html` ve `terms.html` — sadece CSS link cache-bust (hukuki belge metadata "Version 2.5.4" aynı, çünkü politikalar değişmedi)
- `js/core/config.js` — APP_VERSION 2.5.6

## Bilinen sınırlamalar (sonraki paketlerde ele alınacak)

- `createOrGetShareUrl` ismine rağmen her seferinde **yeni** share ID üretiyor (aynı tarife 2 kez QR alırsan 2 farklı URL olur). Bu mevcut davranış, scope dışı. Sonraki pakette share lifecycle (revoke, pause, list, delete) eklenecek.
- Kitchen Cards için QR yok — ayrı pakette eklenecek.

## Doğrulama

- 42 JS dosyası `node --check` ✓
- index.html: 48 adet `?v=2.5.6`, eski cache-bust yok ✓
- Tüm `qr_*` ve `report_issue_*` ve `legal_*` key'leri 6 dilde mevcut ✓
- account.js, share.js, menus.js, recipes.js syntax temiz ✓

## Test senaryoları

1. **Share link splash bug** — Bir tarifte "Share Link" butonu → URL al → o URL'yi yeni tarayıcı sekmesinde aç → 2-3 saniye splash sonra share sayfası görünmeli (önceden sonsuza kadar splash görünüyordu)
2. **Recipe QR** — Bir tarif kartında 3-nokta menü → "QR" → spinner → QR modalı açılır → telefonun kamerasıyla tara → tarif sayfası tarayıcıda açılmalı
3. **Menu QR** — Menu detayında "QR" butonu → spinner → QR modalı → telefondan tara → menü sayfası açılmalı
4. **Offline test** — Internet kapalıyken QR butonuna bas → "QR oluşturulamadı" toast'ı görünmeli (sonsuza kadar spinner DEĞİL)
5. **Logout test** — Sign out yap → QR butonuna bas → "Paylaşılabilir QR için giriş yapın" toast'ı görünmeli

---

# v2.5.5 — Sorun bildir modal'ı

## Yeni özellik

### Account → Help → "🐛 Sorun bildir"
- Restart Tour ile Feedback arasına yeni "🐛 Sorun bildir" kartı eklendi
- Tıklanınca modal açılır: Konu (max 120 karakter) + Açıklama (max 2000 karakter) alanları
- "E-posta ile gönder" butonu otomatik `mailto:hello@prochefdesk.com` linki oluşturur
- Konu prefix'i: `[ProChefDesk] <kullanıcının yazdığı>`
- Açıklamanın altına otomatik debug bloğu eklenir:
  - App version (PCD_CONFIG.APP_VERSION)
  - Browser (UA detection: Chrome/Firefox/Safari/Edge/Opera)
  - OS (Windows/macOS/Linux/iOS/Android)
  - Active language (PCD.i18n.currentLocale)
  - Active theme (data-theme attribute)
  - Screen size (window.innerWidth × innerHeight)
  - ISO timestamp
  - Sayfa URL'i
- Validation: hem konu hem açıklama boş olamaz
- Boş alan varsa toast.error gösterir
- Mailto açıldığında toast.success gösterir
- Modal mevcut PCD.modal API'sini kullanır, app'in tasarım diliyle tutarlı

## i18n

### 11 yeni key — 6 dilde
- `report_issue_card_title`, `report_issue_card_subtitle`
- `report_issue_title`, `report_issue_intro`
- `report_issue_subject_label`, `report_issue_subject_placeholder`
- `report_issue_desc_label`, `report_issue_desc_placeholder`
- `report_issue_debug_note`, `report_issue_send`
- `report_issue_validation`, `report_issue_opened`

EN/TR/ES/FR/DE/AR — hepsi tam.

## Cache-busting

### `index.html`
- 48 yerde `?v=2.5.4` → `?v=2.5.5`
- Sidenav-footer içindeki `v2.5.4` rozeti → `v2.5.5`

### `privacy.html` ve `terms.html`
- Sadece CSS link cache-bust güncellendi (`?v=2.5.4` → `?v=2.5.5`)
- "Version 2.5.4" metadata ve footer `<span>v2.5.4</span>` rozeti **korundu** —
  bu değerler hukuki belgenin son güncellenme sürümünü gösterir; metin değişmediği için aynı kaldılar

### `js/core/config.js`
- `APP_VERSION: '2.5.4'` → `'2.5.5'`

## Doğrulama

- 42 JS dosyası `node --check` ✓
- 48 yeni `?v=2.5.5` girişi index.html'de mevcut, eski `?v=1.0.0` ve `?v=2.5.4` kalmadı
- account.js'in syntax'ı temiz
- Mevcut Help bölümünün diğer butonları (About, FAQ, Restart Tour, Feedback) etkilenmedi

---

# v2.5.4 — Privacy Policy + Terms of Service

## Yeni dosyalar

### `privacy.html` ve `terms.html`
- 6 dilde tam Gizlilik Politikası ve Kullanım Şartları (EN/TR/ES/FR/DE/AR)
- Resmi hukuki dil; GDPR, CCPA ve Australian Privacy Principles uyumu gözetildi
- Yargı yetkisi: Batı Avustralya, Avustralya
- Yaş sınırı: 16+
- 30 gün soft-delete + 30 gün şifreli yedek saklama
- Sorumluluk üst sınırı: son 12 ayda ödenen tutar veya 100 AUD (hangisi büyükse)
- Esaslı değişiklikler için 14 gün önceden bildirim
- Avustralya Tüketici Hukuku ve diğer emredici tüketici koruma haklarını kısıtlamadığına dair açık ifade
- Gelecekte ücretli plan için açık kapı bırakıldı
- Kendi kendine yeten sayfalar: `core.css` + `themes.css` yükler, `pcd:prefs.locale` ve `pcd:prefs.theme` localStorage'tan okunur
- AR için otomatik `dir="rtl"`
- Sayfa içi dil seçici ve tema toggle

## Bağlantı entegrasyonu

### `index.html` — sidenav-footer
- "Upgrade to Pro" butonunun altına küçük "Privacy · Terms" linkleri ve `v2.5.4` rozeti eklendi
- `data-i18n="legal_privacy"` ve `data-i18n="legal_terms"` ile mevcut çeviri sistemine bağlandı

### `js/tools/account.js` — Account → Legal bölümü
- Help & About bloğu ile About footer arasına yeni LEGAL bölümü eklendi
- 🔒 Privacy + 📄 Terms kartları, yeni sekmede açılır (`target="_blank"`)
- Mevcut `legal_*` i18n key'leri (zaten 6 dilde var olan) UI'ya bağlandı — yeni key eklenmedi

## Cache-busting

### `index.html` — ?v= parametresi
- 48 yerde `?v=1.0.0` → `?v=2.5.4` (CSS + JS dosyaları için)
- Privacy/terms.html da CSS yüklemelerinde `?v=2.5.4` kullanır
- Plain string replace; regex kullanılmadı

### `js/core/config.js`
- `APP_VERSION: '2.5.3'` → `'2.5.4'`

## Doğrulama

- 49 mevcut JS dosyası `node --check` ✓
- 48 yeni `?v=2.5.4` girişi index.html'de mevcut, eski `?v=1.0.0` kalmadı
- privacy.html ve terms.html standalone yüklenebilir (app.js bağımlılığı yok)

---

# v2.5.3 — Tek dil tutarlılığı + temizlik

## Sorunlar

### 1. EN seçili olmasına rağmen bazı yerler TR (ve tersi)

Hardcoded "TR · EN" karışık metinler vardı:
- "🗑 Çöp kutusu / Trash"
- "📥 Yedek indir / Download backup"
- "ℹ️ Hakkında · About"
- About modalı tamamen TR
- FAQ modalı tamamen TR
- Trash modal'da kategori adları "Tarifler · Recipes" karışık
- "Kapat / Close" tüm modal'larda

Şimdi: hepsi i18n key'lerine taşındı. Aktif dil ne ise sadece o görünür. EN'de pure English, TR'de pure Türkçe.

### 2. Stock count approval toggle kaldırıldı

Multi-user team feature'ı yoktu, tek kişilik şefler için anlamsızdı, kafa karıştırıyordu. Account → Preferences'tan kaldırıldı.

## Eklenen yeni i18n keys (~50 adet)

EN ve TR dillerinde:
- Backup: download, restore, downloaded, descriptions
- Trash: title, empty, count, sections, restore, purge, days_left
- Help: section_title, about, faq, restart_tour, feedback (her birinin title + subtitle)
- About modal içeriği (3 soru-cevap)
- FAQ modal içeriği (8 soru-cevap)
- Clear all data: title, text, btn, done
- close, cancel

ES/FR/DE/AR dillerinde bu key'ler EN fallback ile gösterilir (otomatik).

## Email feedback

`hello@prochefdesk.com` aynı kalıyor. Cloudflare Email Routing kurulduktan sonra Gmail'e otomatik forward edilir. Setup talimatları senin yanında.

## Test
- Syntax clean (54 dosya)
- 18/18 regression
- TR ve EN dilleri tam temiz, karışık yok
