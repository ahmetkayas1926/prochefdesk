# ProChefDesk — Ürün & Araç Envanteri

> Yeni bir Claude session'ında hızlı bağlam kurmak için okuma belgesi.
> AI çalışma rehberi: **`CLAUDE.md`** · Sürüm geçmişi: **`CHANGELOG.md`**

---

## ProChefDesk nedir

Profesyonel şefler için web tabanlı mutfak yönetim sistemi. Tarif maliyetlendirme, menü tasarımı, vardiya planı, HACCP uyumu ve mutfak operasyonunu tek platformda birleştiren, offline-öncelikli uygulamadır. Perth WA'da aktif şef Ahmet Kaya tarafından inşa edilmekte ve kullanılmaktadır.

**Production:** `prochefdesk.com` — uygulama `/app/` altında.

---

## Mimari

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vanilla JavaScript (bundler yok, service worker yok) |
| Offline storage | IndexedDB — verinin birincil deposu; cloud ikincil |
| Bulut | Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions) |
| Deploy | Cloudflare Pages → GitHub push'ta otomatik; build komutu `node build.js` |
| Yedek | Cloudflare R2 — gece otomatik JSON yedek |

**Güncel sürüm:** `app/js/core/config.js` → `APP_VERSION`

**Sürüm bump kuralı:** Yalnızca `config.js`'deki `APP_VERSION` satırını değiştir. `app/index.html`'e sürüm numarası YAZMA — `__VERSION__` placeholder'ı build zamanı replace edilir, elle yazılırsa build fail eder.

---

## Araçlar ve kapasiteleri

Sidebar sırası. Parantez içi = sitedeki görünüm adı (JS route adından farklıysa).

---

### Library

#### Recipes
Tarif oluştur/düzenle: malzeme, alt tarif (sub-recipe), hazırlık adımları, fotoğraf; otomatik maliyet hesaplama. 9 kategori (Appetizer, Soup, Salad, Main, Side, Dessert, Breakfast, Drink, Other). Toplu seçim/silme, "Convert to Prep" işlemi.
- Print: maliyet raporu (PDF)
- Excel: maliyet raporu
- QR + Link paylaşımı: herkese açık tarif URL'si
- Discover'a yayın
- Bulut sync ✓

#### Ingredients
Malzeme birim fiyatı, 11 kategori, tedarikçi bağlantısı, verim % (yield). Fiyat geçmişi grafiği.
- Import: CSV veya Excel yükle (toplu güncelleme)
- Export: CSV + Excel (mevcut liste)
- Excel template: Lists sekmeli doldur-geri-yükle şablonu
- Bulut sync ✓

#### Menus (Menu Builder)
4 tema (Fine Dining, Modern Bistro, Cafe, Minimalist), 12 renk paleti, logo/kapak fotoğrafı, 2–6 sütun, A4/A3 dikey/yatay. Diyet + alerjen harf kodları (küçük = diyet uygunluğu, BÜYÜK = içerir; sadece bilgi amaçlı). Fiyat stili: simgeli / simgesiz / gizli. Bölüm sürükle-bırak sıralama.
- Print ✓
- QR + Link paylaşımı: herkese açık menü URL'si
- Bulut sync ✓

---

### Kitchen

#### Kitchen Cards (Kitchen Cards)
Sürükle-bırak grid (1–9 sütun). Yazı boyutu, kenar kalınlığı, gövde ağırlığı seçenekleri. Mobil zoom/fit. Her kart: tarif adı, malzeme listesi, adımlar.
- Print ✓ (A4 yatay)
- QR + Link paylaşımı
- Bulut sync ✓ (`canvases` tablosu)

#### Whiteboard (Kitchen Whiteboard)
Blok tabanlı pano (Notion tarzı). 13 blok tipi: başlık, büyük sayı, checklist, tablo, uyarı, adım listesi, allergen strip, doneness ladder, time range, cook sheet, divider. 6 layout kademe (tam genişlik → 1/6), 6 yazı boyutu (XS–XXL), 14 renk paleti. WYSIWYG — önizleme = çıktı. Kayıtlılar (library).
- Print ✓ (A4/A3 dikey/yatay)
- Bulut sync ✓

#### Portion (Portion Calculator)
Çoklu tarif seçme, porsiyon hedefi girme, otomatik ölçekleme, konsolide malzeme listesi + maliyet. 3 görünüm: tarif bazlı / kategori / tedarikçi.
- Print ✓
- Metin paylaşımı (navigator.share)
- Bulut sync ✓

#### Checklist (Checklists)
2 tip: Control (güvenlik/açılış/kapanış/temizlik) ve Prep (yemek → bileşenler + not alanı). Özelleştirilebilir yazdırma: sütun sayısı ve yön seçimi. Oturum geçmişi, ilerleme takibi.
- Print ✓ (özelleştirilebilir layout)
- Metin paylaşımı (oturum sonuçları)
- Bulut sync ✓

#### Roster
Haftalık çalışan vardiyası. Personel × gün ızgara; her hücre vardiya saati (başlangıç/bitiş) veya durum kodu. 6 durum kodu (renk kodlu): OFF, AL (izinli), PH (resmi tatil), SL (hastalık), RDO (dinlenme), UNP (ücretsiz izin). Departman/grup bölümleri. İşçilik maliyeti göster/gizle. Tarihçe, şablon kopyalama.
- Print ✓ (A4 yatay, renkli)
- Excel ✓ (yatay, renkli, otomatik tek sayfa)
- JPEG paylaşımı: mobilde native share (WhatsApp vb.), masaüstünde indir
- Bulut sync ✓ (`rosters` tablosu)

#### Prep (Prep Sheet)
Servis hazırlık listesi. Yemek başına bileşen + boş kutu; tariften otomatik çekme + manuel düzenleme. Lamine yazdırma için optimize edilmiş çok sütunlu layout. Kayıtlılar (library).
- Print ✓ (1–4 sütun seçimi)
- Bulut sync ✓ (`prepSheets` tablosu)

---

### Sourcing

#### Inventory
Stok seviyeleri: par (ideal) ve min (kritik) eşikleri. 4 durum: OUT / CRITICAL / LOW / OK. Sayım modu, sayım geçmişi. Dashboard'da düşük stok uyarı badge'i.
- Print ✓ (stok sayım çıktısı)
- Excel ✓ (stok sayım snapshot)
- Bulut sync ✓ (top-level tablo)

#### Suppliers
8 kategori. Ürün bazlı miktar girişi. Sipariş gönderimi: WhatsApp / SMS / Email / navigator.share. Sipariş geçmişi (son 50 kayıt).
- Bulut sync ✓

---

### Catering

#### Events (Event Planner)
Etkinlik tarihi, konuk sayısı, menü atama, bütçe vs maliyet karşılaştırması. 4 durum: draft / confirmed / done / cancelled. Otomatik maliyet ölçeği (konuk sayısına göre).
- Print ✓
- Metin paylaşımı (navigator.share)
- Bulut sync ✓

#### Buffet (Buffet Planner)
İstasyon bazlı büfe planlama. Kişi başı tüketim oranı (sektör standartları), refill çarpanı, israf projeksiyonu, toplam kişi başı maliyet.
- Print ✓ (prep list + maliyet raporu)
- Excel ✓ (maliyet raporu)
- Bulut sync ✓

---

### HACCP Forms

#### HACCP
Hub + 4 form — her form bağımsız URL'e sahip (bookmark korunur):

| Route | Sidebar / Form adı | İçerik |
|-------|--------------------|--------|
| `haccp_logs` | Daily Temperature Log | Buzdolabı + dondurucudan günlük iki kez sıcaklık kaydı |
| `haccp_cooling` | Cook & Cool Log | Pişirme sonrası soğutma — 2 aşamalı doğrulama |
| `haccp_receiving` | Receiving Inspection | Teslimat sıcaklığı, tedarikçi, ambalaj kontrolü |
| `haccp_holding` | Hot / Cold Holding | Bain-marie sıcak tutma · soğuk servis takibi |

- Print ✓ (tüm formlar, 30 günlük / aylık çıktı)
- Bulut sync ✓

---

### Discover

#### Discover
Herkese açık tarif keşfi feed'i. Arama, beğeni, görüntülenme sayacı (rate-limited, 60 dk/IP). Sadece üyeler tarif yayınlayabilir; ziyaretçiler arama yapabilir.

---

### Account (Profile & Settings)
Profil (ad, rol, ülke, işyeri, bio — Discover'da görünür), dil + para birimi + tema tercihleri. Paylaşılan öğe yönetimi. Gece otomatik R2 yedek.
- Plan/abonelik: "Pro'ya geç" (Stripe Checkout) · "Aboneliği yönet" (Stripe portal) — bkz. **Plan modeli**
- JSON yedek indir ✓ (tüm veriyi yerel dosyaya al)
- JSON geri yükle ✓ (yan yana karşılaştırma önizlemesi ile)

---

## Plan modeli (Free / Pro)

İki katman. **Tüm limitler/gate'ler tek dosyadan:** `app/js/core/plans.js` (`PLAN_LIMITS`). Bir özelliği plana açıp kapamak için orada tek satır değiştirilir. `gate.js` tüm `can*()` gate'lerini + upgrade modalını + Stripe checkout/portal çağrılarını barındırır.

| Özellik | Free | Pro |
|---------|------|-----|
| Tarif | 15 | sınırsız |
| Malzeme | 50 | sınırsız |
| Workspace | 1 | sınırsız |
| Bulut sync | kapalı (yalnız yerel) | açık |
| HACCP | kapalı | açık |
| Roster işçilik maliyeti | kapalı | açık |
| Cost-view paylaşım | kapalı | açık |
| Çıktı/paylaşım footer (watermark) | var | yok |
| Print/Excel export | açık | açık |
| Discover yayın | açık | açık |

- **Plan kaynağı = sunucu.** Plan `user_prefs`'in AYRI kolonlarında (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`). Frontend bu kolonları **yazamaz** (kolon-seviyesi yetki kilidi), yalnızca okur → kullanıcı kendini pro yapamaz. Plan data blob'undan değil kolondan okunur (`cloud.fetchPlan`).
- **Manuel pro:** operatör SQL'de `plan='pro', plan_source='manual'` set eder → kalıcı pro (Stripe gerekmez). Webhook `plan_source='manual'` satırları **asla ezmez**.
- **Stripe:** Pro Monthly 19 AUD / Annual 190 AUD. 3 Edge Function — `create-checkout-session`, `create-portal-session`, `stripe-webhook` (imza doğrulamalı; plan'ı yazan **tek otorite**). Şu an **sandbox/test** modunda; canlıya geçiş için Operatöre açık adımlara bak.
- **Cost-view paylaşım (Pro):** tarif/menü için fiyat + food cost % gösteren özel link (`?view=cost`, salt-okunur, giriş yok). `public_shares.share_mode='cost'`; maliyet **yalnızca** cost-share payload'una gömülür (normal public link maliyet sızdırmaz).
- **Watermark:** print footer (`PCD.print`) + paylaşılan sayfa footer'ı `PCD.gate.showWatermark()`'a bağlı. Free'de kalır, Pro'da kalkar. Paylaşılan sayfada karar paylaşanın planına göre snapshot'a gömülür (`payload._wm`).
- **Dashboard komuta merkezi:** 4 metrik kartı + 2 grafik, tamamı gerçek kullanıcı verisinden (sahte sayı yok); işçilik kartı Pro-gated.

---

## Veri tabloları

### Workspace-scoped (her workspace için ayrı veri)

| Tablo | İçerik |
|-------|--------|
| `recipes` | Tarifler |
| `ingredients` | Malzeme kütüphanesi |
| `menus` | Menü tasarımları |
| `events` | Etkinlikler |
| `suppliers` | Tedarikçiler |
| `canvases` | Kitchen card panoları |
| `checklist_templates` | Checklist şablonları |
| `checklist_sessions` | Checklist oturumları |
| `stock_count_history` | Stok sayım geçmişi |
| `haccp_logs` / `haccp_readings` / `haccp_units` / `haccp_cook_cool` | HACCP günlük + soğutma kayıtları |
| `haccp_receiving` / `haccp_holding` | HACCP kabul + bekletme kayıtları |
| `rosters` | Vardiya planları |
| `prepSheets` | Prep sheet kayıtları |
| `buffets` | Büfe planları |
| `whiteboards` | Whiteboard panoları |
| `waste` / `shopping_lists` / `mise_plans` / `team` | Altyapı mevcut, UI devre dışı |

### Top-level (hesap bazlı, workspace'ten bağımsız)

| Tablo | İçerik |
|-------|--------|
| `workspaces` | Workspace tanımları |
| `inventory` | Stok seviyeleri |
| `user_prefs` | Dil, para birimi, tema, aktif workspace + **plan kolonları** (plan/source/status/expires/stripe_customer_id — sunucu-yazılır) |
| `workspace_tombstones` | Silme cascade için |

### Supabase-only (frontend'den yazılmaz)

| Tablo | İçerik |
|-------|--------|
| `client_errors` | Frontend hata logları |
| `discover_view_logs` | Rate-limit penceresi (60 dk/IP) |
| `public_shares` | Paylaşım URL'leri (tarif/menü/kitchen card) + `share_mode` (public/cost) |
| `recipe_likes` | Beğeniler — RLS: kullanıcı sadece kendi beğenilerini okur |

RLS tüm tablolarda aktif. Frontend `anon` key kullanır.

---

## Kaldırılmış araçlar (JS mevcut, route yok, şema korunuyor)

Bu araçların JS dosyaları ve i18n anahtarları `app/js/tools/` altında duruyor. Router'da kayıtlı değiller, sidenav'da görünmüyorlar. Bulut şeması ve mevcut veri bozulmadan korunuyor; ilerleyen sürümlerde geri eklenebilir.

Nutrition · Yield Calculator · Variance · Sales · What-If · Menu Matrix · Team · Allergens · Tools Hub

---

## Operatöre açık adımlar

1. **Stripe canlıya geçiş.** Şu an sandbox/test modu (test anahtarları + test webhook). Canlı için: Stripe'ta live ürünleri (19/190 AUD) + live API anahtarı oluştur, live webhook endpoint'i ekle, Supabase secret'larını live değerlerle güncelle (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ID'ler), live Customer Portal'ı aktif et.
2. **Legal gözden geçirme.** Privacy/Terms profesyonel taslaktır; ticari lansman öncesi iade/ödeme şartlarını Avustralya tüketici hukukuna göre bir avukata/şablona doğrulat.
3. **iOS/Safari çapraz-tarayıcı testi** — cihazda manuel test bekliyor.
