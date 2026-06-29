# ProChefDesk — Ürün & Araç Envanteri

> Yeni session'da hızlı bağlam. AI çalışma rehberi: **`CLAUDE.md`** · sürüm geçmişi: **`CHANGELOG.md`**

## ProChefDesk nedir

Profesyonel şefler için offline-öncelikli web tabanlı mutfak yönetim sistemi: tarif maliyetlendirme, menü tasarımı, vardiya planı, HACCP uyumu ve mutfak operasyonu tek platformda. Aktif çalışan bir şef (Ahmet Kaya) tarafından inşa edilmekte + kullanılmaktadır. **Production:** `prochefdesk.com` (uygulama `/app/`).

## Mimari

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vanilla JavaScript (bundler / service worker yok) |
| Offline storage | IndexedDB — birincil depo; cloud ikincil |
| Bulut | Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions) |
| Deploy | Cloudflare Pages ← GitHub push (otomatik; build `node build.js`) |
| Yedek | Cloudflare R2 — gece otomatik JSON |

**Sürüm:** `app/js/core/config.js` → `APP_VERSION`. Bump = SADECE o satır; `app/index.html`'e sürüm YAZMA (`__VERSION__` build zamanı replace edilir, elle yazılırsa build fail).

## Araçlar

Sidebar bölümleri. İkincil araçlar (Menu engineering / Nutrition / Batch / Variance / Waste / Prep) sidebar yerine ana aracın **alt-sekmesinde** (`PCD.subNav`; route'lar app.js'te duruyor): stock = Inventory·Variance·Waste · recipes = Recipes·Menu engineering·Nutrition·Batch (route `portion`) · lists = Checklist·Prep.

### Library

**Recipes** — malzeme / alt-tarif / hazırlık adımı / foto + otomatik maliyet; 9 kategori (Appetizer, Soup, Salad, Main, Side, Dessert, Breakfast, Drink, Other), toplu seçim-silme, "Convert to Prep". Çıktı: maliyet raporu Print + Excel · QR/Link paylaşım + Discover yayın · Sync ✓.
- alt-sekme **Menu engineering** — her yemek Star/Plowhorse/Puzzle/Dog (marj × satış); maliyet `computeFoodCost`, satış `recipe.salesCount` (Record sales artırır), fiyat/satış inline düzenlenir; mini P&L özeti; maliyet-altı satılan kırmızı uyarı.
- alt-sekme **Nutrition** — porsiyon başı tahmini kalori/protein/karb/yağ (recipe malzemelerinden, USDA/FSANZ; tahmin, sertifikalı etiket değil).
- alt-sekme **Batch** (Batch Calculator; route `portion`) — tarifi/alt-tarifi N adete ölçekle → toplam malzeme + maliyet; tarif/kategori/tedarikçi görünümü, alt-tarifler ingredient'e flatten. Print + stilize Excel + metin paylaşımı.

**Ingredients** — birim fiyat, 11 kategori, tedarikçi bağı, yield %, **raf-ömrü (gün, opsiyonel)**, fiyat geçmişi grafiği. CSV/Excel import-export + Lists sekmeli şablon · Sync ✓.

**Menus** (Menu Builder = Menu Studio) — blok-kanvas menü tasarımcı (başlık/metin/bölüm[yemek listesi, tariften otomatik]/görsel/ayraç/boşluk); A4–A3–A5–Letter, dikey/yatay, 1–4 sütun, sayfa çerçevesi, accent/metin/bg rengi, marka kiti. Blok tıkla → düzenleme popup (sağda "Blocks" katman listesi); sayfa ayarları ayrı 🎨 popup. Diyet + alerjen harf kodları (bilgi amaçlı). 10 hazır şablon. WYSIWYG (kanvas = baskı = paylaşım). Print · QR/Link + cost-view (Pro) · Sync ✓ (`menus`, `studio` blob).

### Kitchen

**Kitchen Cards** — sürükle-bırak grid (1–9 sütun, masonry); yazı/kenar/gövde/accent ayarı, özel-not kartları (tarif dışı serbest metin), çoklu canvas + galeri, mobil zoom, dark mode (A4 beyaz kalır), WYSIWYG. Print A4 yatay · QR/Link · Sync ✓ (`canvases`).

**Whiteboard** (Kitchen Whiteboard) — blok pano (Notion tarzı). 12 blok: section header, big number, checklist, key-value, table, alert, step list, allergen strip, doneness ladder, time range, cook sheet, free text, divider. Blok tıkla → ortalı popup; her blokta araç çubuğu (sürükle/düzenle/çoğalt/sil); 12 layout × 6 yazı (XS–XXL) × 14 renk; WYSIWYG (baskıda araç çubuğu çıkmaz). Library + şablonlar. Print A4/A3 · Sync ✓ (`whiteboards`).

**Checklist** (Checklists) — 2 tip: Control (güvenlik/açılış/kapanış/temizlik) + Prep (yemek → bileşen + not). Kategori renk şeritleri, reçete/menüden otomatik doldurma, özelleştirilebilir baskı + canlı A4 önizleme, oturum geçmişi. Print · metin paylaşımı · Sync ✓.
- alt-sekme **Prep** (Prep Sheet) — kanvas-merkezli servis hazırlık; gerçek A4 kanvasta yemek kartı + bileşen + boş kutu (tariften çekme + manuel), karta tıkla→popup, sürükle-sırala, önizleme = baskı (`@page margin:0`, damgasız, dar kenar). 1–5 sütun, dikey/yatay, yazı XS–XXL, çerçeve/boşluk ayarı, istasyon gruplama, galeri. Print · Sync ✓ (`prepSheets`).

**Roster** — haftalık vardiya ızgarası (personel × gün); hücre = saat (start/end) veya 6 durum kodu renk-kodlu: OFF, AL (izin), PH (resmi tatil), SL (hastalık), RDO (dinlenme), UNP (ücretsiz). Departman grupları, işçilik maliyeti göster/gizle (Pro), ⚡ haftayı doldur, önceki haftayı kopyala (isimle eşleştirir), canlı önizleme (tek motor — print/Excel/JPEG aynı; mobilde tıkla→zoom). Print A4 yatay renkli + Excel (yatay, tek sayfa) + JPEG paylaşım · Sync ✓ (`rosters`).

### Sourcing

**Inventory** — par (ideal) / min (kritik) eşik, durum (out/critical/low/ok/untracked), sayım modu + geçmiş, dashboard düşük-stok badge. **Generate Order (satın-alma):** par-altı kalemler → tedarikçiye göre grup → her tedarikçiye AYRI sipariş gönder (`suppliers.startOrder` → WhatsApp/SMS/Email + geçmiş) → gönderilen kalem "yolda" (on-order) işaretlenir (çift-sipariş önleme, modal açık kalır) → "Geldi → stoğa ekle". **Son-kullanma/raf-ömrü:** mal kabulde otomatik SKT (ingredient shelf-life'tan) + "bozulacak/geçti" badge + stat + dashboard kartı + **fire köprüsü** (expired → fire yaz & stoktan düş). **Market/alışveriş listesi:** yaklaşan event + seçili buffet → ingredient konsolide → stok düş → kategori/tedarikçiye grupla → Deep Pine print + paylaş. **Paylaşılan stok sözleşmesi:** `applyStockDeductions/Additions` (event/buffet/waste/sales/receiving hepsi buradan). Print + Excel · Sync ✓ (top-level tablo).
- alt-sekme **Variance** — teorik kullanım (satılan → reçete) vs gerçek kullanım; malzeme başına $ varyans, en büyük sızıntı önce (POS/sayım gerekmez; geçici, kaydetmez).
- alt-sekme **Waste** — fire/bozulma/fazla-üretim kaydı → $ kayıp + opsiyonel stok düşümü + koşan toplam. Sync ✓ (`waste`).

**Suppliers** — 8 kategori, ürün bazlı miktar, sipariş WhatsApp/SMS/Email/share, sipariş geçmişi (son 50). Sync ✓.

### Catering

**Events** (Event Planner) — BEO-seviye çok-fonksiyonlu etkinlik. **5 durum** (draft/tentative/confirmed/done/cancelled) + liste/takvim görünümü. Her event = çok fonksiyon (reception/dinner…), her fonksiyonda menü (tarif+malzeme öğeleri) + diyet/alerjen + kişi/garanti-kişi. **Gerçek P&L:** food cost + işçilik (rol/saat/rate) + itemized charges + servis% → kişi-başı maliyet/fiyat/marj + ödeme planı (deposit/balance). Run-of-show timeline + görev checklist + **e-imza** (müşteri onayı). Stok düş (`computeEventDeductions`). **Shopping list** tedarikçiye gruplu → her tedarikçiye AYRI sipariş gönder + kalıcı "✓ sipariş verildi" rozeti (`_supplierOrders`, çift-sipariş önler). Çıktı: müşteri **teklifi** (maliyet gizli) + iç **BEO/mutfak üretim** sayfası. Print · metin paylaşımı · Sync ✓ (`events`).

**Buffet** (Buffet Planner) — istasyon bazlı; 3-yol maliyet (tarif/malzeme/custom), kişi-başı tüketim + **forecast prep faktörü** + **refill çarpanı + pickup oranı**, yield%, **atık% benchmark (15-25)** + food cost % hedef durumu, batch/replenishment planı, 7 preset + boş başlangıç, çoğalt. 🚚 tedarikçi sipariş listesi (flatten → stok birimine normalize → grupla) → her tedarikçiye AYRI sipariş gönder + kalıcı "✓ sipariş verildi" rozeti (`_supplierOrders`, çift-sipariş önler) → yazdır. Print (prep + sipariş + maliyet raporu) + Excel · Sync ✓ (`buffets`).

### HACCP Forms

Hub + 4 bağımsız form (her biri kendi URL'i, bookmark korunur). Bölge eşikleri (`PCD.haccp.getThresholds`). Print + her form/Audit Pack **ay-aralığı seçip tek PDF** (`PCD.haccp.pickMonthRange/printSheets`) · Sync ✓.

| Route | Form | İçerik |
|-------|------|--------|
| `haccp_logs` | Daily Temperature Log | Buzdolabı + dondurucu günlük iki kez |
| `haccp_cooling` | Cook & Cool Log | Pişirme sonrası 2 aşamalı soğutma |
| `haccp_receiving` | Receiving Inspection | Teslimat sıcaklığı / tedarikçi / ambalaj |
| `haccp_holding` | Hot / Cold Holding | Bain-marie + soğuk servis takibi |

**Audit Pack** (hub): ay/aralık seç → 4 formu tek denetim PDF'inde topla — özet (sıcaklık kontrolü · **günlük-log kapsaması** · in-range% · açık-CAPA) + forma-göre tablo + düzeltici-eylem (exception) günlüğü + imza satırı. Salt-okunur aggregator; "compliance" değil "readings in range" + coverage gösterir (dürüstlük modeli).

### Discover

Herkese açık tarif keşfi: arama, beğeni, görüntülenme sayacı (rate-limited 60 dk/IP). Yalnız üyeler yayınlar; ziyaretçiler arar.

### Account (Profile & Settings)

**Giriş (Supabase Auth):** e-posta/şifre (hCaptcha'lı) · **Google OAuth** (Google Cloud Console OAuth kimliği + Supabase redirect) · **misafir modu** (giriş yok → yalnız yerel IDB + demo seed). Profil (ad/rol/ülke/işyeri/bio — Discover'da görünür), dil + para + tema, paylaşım yönetimi, gece R2 yedek. Plan: "Pro'ya geç" (Stripe Checkout) / "Aboneliği yönet" (Stripe portal). JSON yedek indir + geri yükle (yan yana karşılaştırma önizlemeli).

## Plan modeli (Free / Pro)

Tüm limit + gate'ler tek dosyada: `plans.js` (`PLAN_LIMITS`) — özelliği açıp kapamak tek satır. `gate.js` = tüm `can*()` + upgrade modalı + Stripe checkout/portal çağrıları.

| Özellik | Free | Pro |
|---------|------|-----|
| Tarif / Malzeme / Workspace | 4 / 20 / 1 | sınırsız |
| Menü/Event/Büfe/Roster/Whiteboard/Checklist/Prep | her birinden 1 | sınırsız |
| Bulut sync · Link/QR paylaşım | kapalı (yalnız yerel) | açık |
| HACCP · Roster işçilik · Cost-view paylaşım | kapalı | açık |
| Çıktı footer (watermark) | var | yok |
| Print/Excel çıktı (araç başına 1; roster Free'de tamamen kapalı) | 1/araç | sınırsız |
| Discover yayın | açık | açık |

- **Plan kaynağı = sunucu.** `user_prefs`'in AYRI kolonlarında (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`); frontend kolon-seviyesi yetki kilidiyle **yazamaz**, yalnız okur (`cloud.fetchPlan`, data blob'undan değil) → kullanıcı kendini pro yapamaz.
- **Manuel pro:** SQL'de `plan='pro', plan_source='manual'` → kalıcı pro (Stripe'sız); webhook `plan_source='manual'` satırlarını ASLA ezmez.
- **Stripe (CANLI, 2026-06-21):** Pro **USD $19/ay · $190/yıl**. Tüzel kişi `ProChefDesk, LLC` (Delaware). 3 Edge Function: `create-checkout-session` + `create-portal-session` (verify_jwt AÇIK) · `stripe-webhook` (verify_jwt KAPALI, imza doğrulamalı, plan'ı yazan TEK otorite; olaylar: checkout.completed / subscription.updated / .deleted). **Payout:** Stripe → **Mercury** (US bank) → Wise → AU/TR (TR doğrudan payout desteklemiyor; Treasury ABD-dışı banka için güvenilmez). EIN ~Tem 2026 bekliyor (payout'u bloklamadı). Uçtan uca test geçti (upgrade/cancel/refund/portal). **Gelecek:** operatör AU PR alınca AU Stripe'a geçer (ABN + AU banka, LLC gereksiz), abonelikler taşınır, ABD LLC feshedilir. Güncel durum/notlar: `CLAUDE.md` launch.
- **Cost-view paylaşım (Pro):** fiyat + food cost % gösteren özel salt-okunur link (`?view=cost`); maliyet yalnız cost-share payload'unda (`public_shares.share_mode='cost'`), normal link sızdırmaz.
- **Watermark:** footer TÜM çıktılarda (print/PDF · Excel · roster JPEG · paylaşım/URL) `PCD.gate.showWatermark()`'a bağlı — Free'de var, Pro'da temiz; paylaşılan sayfada paylaşanın planına göre snapshot'a gömülür (`payload._wm`). Metin/WhatsApp paylaşımı kapsam dışı.
- **Çıktı paleti (Deep Pine — tek standart):** TÜM print/PDF · Excel · roster JPEG · share aynı dili konuşur — başlık+kenarlık pine `#16433a` · aksan/CTA `#1f9d6b` · metin `#1c1917` · kenarlık `#e7e5e4` · th zemini `#eaf6f0` · Inter+Fraunces; Excel pine `16433A` başlık + `E0DDD5` kenarlık + `F6F3EE` alt-satır (PCD.xlsx + inline roster/buffet/recipes AYNI). Tüm print `@page{margin:0}`+içerik padding → tarayıcı damgası (tarih/about:blank/sayfa no) yok. Yeni çıktıda bu paleti kullan. Bilerek istisna: whiteboard (Oswald/Barlow), menu_studio temalı menüleri, HACCP grid `#999`.
- **Dashboard:** 4 metrik + 2 grafik, tamamı gerçek veriden (sahte yok); işçilik kartı Pro-gated.

## Veri tabloları

**Workspace-scoped:** `recipes` · `ingredients` · `menus` · `events` · `suppliers` · `canvases` (kitchen cards) · `checklist_templates` · `checklist_sessions` · `stock_count_history` · `haccp_logs`/`haccp_readings`/`haccp_units`/`haccp_cook_cool`/`haccp_receiving`/`haccp_holding` · `rosters` · `prepSheets` · `buffets` · `whiteboards` · `waste`.
→ **Altyapı var, UI yok:** `shopping_lists` · `mise_plans` · `team` (cloud sync/realtime/backup şeması tam, hiçbir araç okumuyor/yazmıyor).

**Top-level (hesap bazlı):** `workspaces` · `inventory` (stok seviyeleri) · `user_prefs` (dil/para/tema/aktif ws + **plan kolonları** — sunucu-yazılır) · `workspace_tombstones` (silme cascade).

**Supabase-only (frontend yazmaz):** `client_errors` · `discover_view_logs` (rate-limit penceresi) · `public_shares` (paylaşım URL'leri + `share_mode` public/cost) · `recipe_likes` (RLS: yalnız kendi beğenileri).

RLS tüm tablolarda aktif; frontend `anon` key kullanır.

## Açık adımlar / roadmap

Durum + go-to-market hedefi → `CLAUDE.md` ("Durum" + "Go-to-market — TEK HEDEF"). Büyüme roadmap'i (yeni özellikler) **operatörde** (doküman dışı). **Uygulama lansman-hazır; öncelik artık kod değil satış/büyüme.**
