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

#### Menus (Menu Builder = Menu Studio)
**Blok tabanlı menü tasarım kanvası.** Blok tipleri: başlık, metin, bölüm (yemek listesi — ad/fiyat/açıklama/foto, tariften otomatik çekme), görsel, ayraç, boşluk. Sayfa: A4/A3/A5/Letter, dikey/yatay, 1–4 sütun, sayfa çerçevesi, accent/metin/arka plan rengi, marka kiti (renk kaydet→uygula). **Düzenleme popup ile:** kanvasta blok/grup tıkla → düzenleme modalı (sağdaki "Blocks" katman listesi de tıklanır); her blok etrafında saydam çerçeve (hover'da yeşil belirgin). Sayfa ayarları ayrı 🎨 **Sayfa** popup'ında (her blok altında çıkmaz). Blok ekleyince popup hemen açılır (hızlı yazma). 10 profesyonel hazır şablon (galeri) — home'da **Şablonlar** butonu → şablondan yeni menü. Diyet + alerjen harf kodları (küçük = uygunluk, BÜYÜK = içerir; bilgi amaçlı). WYSIWYG: kanvas = baskı = paylaşım.
- Print ✓
- QR + Link paylaşımı + cost-view (Pro) — herkese açık menü URL'si
- Bulut sync ✓ (`menus` tablosu, `studio` blob)
- _(Yol haritası: şablon sayısı 20'ye çıkarılacak.)_

---

### Kitchen

#### Kitchen Cards (Kitchen Cards)
Sürükle-bırak grid (1–9 sütun, masonry). Yazı boyutu, kenar kalınlığı, gövde ağırlığı, accent renk (picker + swatch). **Aksiyon çubuğu kanvasın üstünde** (canvas adı + kaydet/yeni · paylaş/yazdır/sil); sol panel = Düzen & stil + reçete seçimi + custom kartlar. **Özel/not kartları** (tarif dışı serbest metin — alerjen anahtarı, sıcaklık notu vb.). Çoklu canvas + **library galerisi** (mini önizleme + kopyala + sil). Mobil zoom/fit. **Dark mode uyumlu** (site yüzeyi temalı, A4 kanvas beyaz kalır). WYSIWYG (önizleme = baskı). Her kart: tarif adı, malzeme listesi, adımlar.
- Print ✓ (A4 yatay)
- QR + Link paylaşımı
- Bulut sync ✓ (`canvases` tablosu)

#### Whiteboard (Kitchen Whiteboard)
Blok tabanlı pano (Notion tarzı). 12 blok tipi: section header, big number, checklist, key-value, table, alert, step list, allergen strip, doneness ladder, time range, **cook sheet (sütun + satır ekle/sil)**, free text, divider. **Düzenleme popup ile:** kanvasta blok tıkla → ortalı modal (blok-tipine özel alanlar korunur); her blokta görünür araç çubuğu (⠿ sürükle + ✎ düzenle + çoğalt + sil); kart hover'da yeşil çerçeve. Sayfa ayarları ayrı. Palette'ten ekle → popup. 12 layout kademe (tam genişlik → 1/12), 6 yazı boyutu (XS–XXL), 14 renk paleti. WYSIWYG — önizleme = çıktı (baskıda araç çubuğu çıkmaz). Kayıtlılar (library) + şablonlar.
- Print ✓ (A4/A3 dikey/yatay)
- Bulut sync ✓ (`whiteboards` tablosu)

#### Portion (Portion Calculator)
Çoklu tarif seçme, tarif başına porsiyon hedefi, otomatik ölçekleme, konsolide malzeme listesi + maliyet. 3 görünüm: tarif bazlı / kategori / tedarikçi. Alt-tarifler ingredient seviyesine flatten edilir. Canlı stats (tarif / toplam porsiyon / toplam maliyet / ortalama porsiyon).
- Print ✓ (tarif-tarif veya konsolide gruplu)
- Excel ✓ (stilize, görünüme uygun — tarif sayfası veya konsolide kategori/tedarikçi sipariş sayfası + TOPLAM satırı)
- Metin paylaşımı (navigator.share)

#### Checklist (Checklists)
2 tip: Control (güvenlik/açılış/kapanış/temizlik) ve Prep (yemek → bileşenler + not alanı). Kategori renk şeritleri, reçete/menüden otomatik doldurma. Özelleştirilebilir yazdırma: sütun sayısı, yön, yazı boyutu, aralık, kalın. **Editörde canlı A4 baskı önizlemesi** (ayar değiştikçe anında — WYSIWYG). Oturum geçmişi, ilerleme takibi.
- Print ✓ (özelleştirilebilir layout)
- Metin paylaşımı (oturum sonuçları)
- Bulut sync ✓

#### Roster
Haftalık çalışan vardiyası. Personel × gün ızgara; her hücre vardiya saati (başlangıç/bitiş) veya durum kodu. 6 durum kodu (renk kodlu): OFF, AL (izinli), PH (resmi tatil), SL (hastalık), RDO (dinlenme), UNP (ücretsiz izin). Departman/grup bölümleri. İşçilik maliyeti göster/gizle. **⚡ Haftayı doldur:** tek personelin tüm haftasını bir vardiya/durum/saat ile tek tıkla doldur veya temizle. **Önceki haftayı kopyala:** en son rosterı bulup personeli isimle eşleştirir, vardiyaları kopyalar. **Editörde canlı baskı önizlemesi** (tek motor — print/Excel/JPEG ile aynı; mobilde fit + önizlemeye tıkla→zoom popup). Kompakt editör: aksiyonlar header'da, shift şablonları daraltılabilir. Tarihçe.
- Print ✓ (A4 yatay, renkli)
- Excel ✓ (yatay, renkli, otomatik tek sayfa)
- JPEG paylaşımı: mobilde native share (WhatsApp vb.), masaüstünde indir
- Bulut sync ✓ (`rosters` tablosu)

#### Prep (Prep Sheet)
Servis hazırlık listesi — **kanvas-merkezli**. Yemekler gerçek A4 kanvasta kart olarak; her yemek başına bileşen + boş kutu; tariften otomatik çekme + manuel. **Düzenleme popup ile:** karta tıkla → modal (isim / istasyon / bileşenler ekle-sil-sırala-foto). Kartta görünür araç çubuğu (⠿ sürükle + ✎ düzenle + 🗑 sil); Whiteboard-stili işaretçi-takipli sürükle-sırala (üst/alt göstergesi). **Önizleme = baskı birebir** (açık sayfalama motoru; `@page margin:0` → Chrome'un tarih/URL/sayfa-no damgaları çıkmaz; ~sıfır kenar boşluğu). Kontroller: 1–5 sütun, dikey/yatay, yazı boyutu XS–XXL, Bold, çerçeve kalınlığı (orta/kalın/extra), kart arası boşluk (extra-bitişik / bitişik / orta / geniş), accent renk, hazır düzenler. İstasyon gruplama. Library galerisi (mini önizleme + kopyala + sil).
- Print ✓ (gerçek A4 WYSIWYG, dar kenar, damgasız)
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
Etkinlik tarihi, konuk sayısı, menü atama, bütçe vs maliyet karşılaştırması. 4 durum: draft / confirmed / done / cancelled. Otomatik maliyet ölçeği (konuk sayısına göre) + kişi başı yemek maliyeti göstergesi. **🛒 Alışveriş listesi:** menüyü konuk sayısına ölçekle → alt-tarifler dahil gerçek malzemeye in (flattenIngredients) → tedarikçiye göre grupla → yazdır. **Etkinliği çoğalt** (liste kartından, "(kopya)" + taslak). **Editörde canlı A4 önizleme** (baskıyla aynı `eventPrintHtml` motoru, izole iframe → sızıntı yok).
- Print ✓ (A4 stilize)
- Metin paylaşımı (navigator.share)
- Bulut sync ✓ (`events` tablosu)

#### Buffet (Buffet Planner)
İstasyon bazlı büfe planlama. 3-yol maliyet (tarif / malzeme / custom), kişi başı tüketim oranı (sektör standartları), refill çarpanı, yield%, israf projeksiyonu, food cost % hedef durumu (yeşil/sarı/kırmızı). 7 uluslararası hazır preset + boş başlangıç, arama, çoğalt. **🚚 Tedarikçiye göre sipariş listesi:** tarif kalemlerini alt-tarifler dahil gerçek malzemeye in → stok birimine normalize edip topla → tedarikçiye grupla → yazdır (custom kalemler "bağlanmamış" grubunda).
- Print ✓ (prep list + sipariş listesi + maliyet raporu)
- Excel ✓ (maliyet raporu)
- Bulut sync ✓ (`buffets` tablosu)

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

## Kaldırılmış araçlar (dosyalar silindi, şema korunuyor)

v2.43'te şu **10 ölü tool dosyası tamamen silindi** (`app/js/tools/`'tan) — route'lanmıyor, hiçbir `<script>` ile yüklenmiyor, sidenav'da yoktular → erişilemiyordu. Eski kod git geçmişinde; gerekirse oradan canlandırılır:

`menu_matrix.js` (menuMatrix) · `sales.js` · `nutrition.js` · `whatif.js` · `yield.js` (yield_calc) · `variance.js` (varianceTool — **NOT:** `core/variance.js` CANLI, silinmedi) · `team.js` · `allergens.js` (**NOT:** `core/allergens-db.js` CANLI, silinmedi) · `menus.js` (klasik; `'menus'` route'u `menu_studio.js` yükler) · `tools-hub.js`

**UI'sız sync tabloları (kod VAR, ekran YOK — SİLİNMEDİ):** `waste` · `shopping_lists` · `mise_plans` · `team` — cloud sync/realtime/backup şeması tam ama hiçbir araç bu state'i okumuyor/yazmıyor. İleride tekrar tool eklenirse veri durur. Tüm route kayıtları `app/js/core/app.js`'tedir.

---

## Operatöre açık adımlar (konsolide yapılacaklar — tek liste)

**Devam eden**
1. **i18n çoklu dil dolumu.** es/fr/de/ar görünür-öncelikli dolduruluyor (~%44, v2.43.6). Her batch tek tek çevrilir → doğrulanır → sürüm bump → push. Kalan: whiteboard · buffet · prep · discover · inventory · portion · cost-report · haccp · workspace/account/chef/tour/import. Ölü araç anahtarları (sales/yield/nutrition/matrix/team/allergens/variance ~189) atlanıyor.

**Bug / kalite**
2. **`fmtMoney` düzeltmesi (utils.js 128-142).** Compact format iki uçta bozuk: cost report'ta ucuz birim fiyatlar `$0/g` görünüyor (<$0.005 sıfıra yuvarlanıyor); büyük sayıda binlik ayraç yok + 1 ondalık (`$4800.0`, `$1000000`). → her zaman 2 ondalık + binlik ayraç (`$4,800.00`) + birim fiyat `$/kg`-`$/L`. **Uygulama geneli** (print/Excel/share/kitchen cards) → değiştirince hepsi doğrulanmalı (sütun taşması riski). QA taramasında bulundu.

**Tasarım / marka (i18n bitince)**
3. **Yeni logo** — mevcut çok basit; profesyonel, özel tasarlanmış logo.
4. **Renk paleti** — daha profesyonel, daha güven veren, göz yormayan bir palet.
5. **Tek standart UI** — dashboard grafik/çerçeveler daha modern + yüksek-teknolojik; bu görünüm tüm araçlara yayılıp tek tasarım dili olur.

**Launch öncesi QA (tasarım sonrası, operatör + Claude birlikte)**
6. **Footer denetimi** — Free: indirme/PDF/share/yazdırma HEPSİNDE ProChefDesk footer + tek standart. Pro: TÜM footer'lar temiz. (`showWatermark()` gate'i; her çıktı yolu tek tek denetlenecek.)
7. **iOS/Safari gerçek cihaz testi** — offline PWA + IndexedDB + print + hCaptcha riskli.

**Lansman / altyapı**
8. **Stripe canlıya geçiş.** Operatör ABN sürecinde; sonra: live ürünler (19/190 AUD) + live API key + live webhook + Supabase secret'ları (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ID'ler) + live Customer Portal.
9. **Legal gözden geçirme.** Privacy/Terms taslak; AU tüketici hukukuna göre iade/ödeme şartlarını doğrulat.
10. **McAfee / site reputation.** `sitelookup.mcafee.com` + `safeweb.norton.com`'a URL submit; Google Safe Browsing kontrol. Opsiyonel kod: `_headers` (CSP YOK) + `/.well-known/security.txt`.

**SEO**
11. **Blog yazısı.** 13 yazı var; eksik konular: Labour cost % · Menu pricing · Cleaning schedule · Catering cost-per-head.
