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

Sidebar bölümleri. İkincil araçlar (Nutrition / Portion / Variance / Waste / Prep) sidebar yerine ana aracın **alt-sekmesinde** (`PCD.subNav`; route'lar app.js'te duruyor): stock = Inventory·Variance·Waste · recipes = Recipes·Nutrition·Portion · lists = Checklist·Prep.

### Library

**Recipes** — malzeme / alt-tarif / hazırlık adımı / foto + otomatik maliyet; 9 kategori (Appetizer, Soup, Salad, Main, Side, Dessert, Breakfast, Drink, Other), toplu seçim-silme, "Convert to Prep". Çıktı: maliyet raporu Print + Excel · QR/Link paylaşım + Discover yayın · Sync ✓.
- alt-sekme **Nutrition** — porsiyon başı tahmini kalori/protein/karb/yağ (recipe malzemelerinden, USDA/FSANZ; tahmin, sertifikalı etiket değil).
- alt-sekme **Portion** (Portion Calculator) — çoklu tarifi kişi sayısına ölçekle → konsolide malzeme + maliyet; tarif/kategori/tedarikçi görünümü, alt-tarifler ingredient'e flatten. Print + stilize Excel + metin paylaşımı.

**Ingredients** — birim fiyat, 11 kategori, tedarikçi bağı, yield %, fiyat geçmişi grafiği. CSV/Excel import-export + Lists sekmeli şablon · Sync ✓.

**Menus** (Menu Builder = Menu Studio) — blok-kanvas menü tasarımcı (başlık/metin/bölüm[yemek listesi, tariften otomatik]/görsel/ayraç/boşluk); A4–A3–A5–Letter, dikey/yatay, 1–4 sütun, sayfa çerçevesi, accent/metin/bg rengi, marka kiti. Blok tıkla → düzenleme popup (sağda "Blocks" katman listesi); sayfa ayarları ayrı 🎨 popup. Diyet + alerjen harf kodları (bilgi amaçlı). 10 hazır şablon. WYSIWYG (kanvas = baskı = paylaşım). Print · QR/Link + cost-view (Pro) · Sync ✓ (`menus`, `studio` blob).

### Kitchen

**Kitchen Cards** — sürükle-bırak grid (1–9 sütun, masonry); yazı/kenar/gövde/accent ayarı, özel-not kartları (tarif dışı serbest metin), çoklu canvas + galeri, mobil zoom, dark mode (A4 beyaz kalır), WYSIWYG. Print A4 yatay · QR/Link · Sync ✓ (`canvases`).

**Whiteboard** (Kitchen Whiteboard) — blok pano (Notion tarzı). 12 blok: section header, big number, checklist, key-value, table, alert, step list, allergen strip, doneness ladder, time range, cook sheet, free text, divider. Blok tıkla → ortalı popup; her blokta araç çubuğu (sürükle/düzenle/çoğalt/sil); 12 layout × 6 yazı (XS–XXL) × 14 renk; WYSIWYG (baskıda araç çubuğu çıkmaz). Library + şablonlar. Print A4/A3 · Sync ✓ (`whiteboards`).

**Checklist** (Checklists) — 2 tip: Control (güvenlik/açılış/kapanış/temizlik) + Prep (yemek → bileşen + not). Kategori renk şeritleri, reçete/menüden otomatik doldurma, özelleştirilebilir baskı + canlı A4 önizleme, oturum geçmişi. Print · metin paylaşımı · Sync ✓.
- alt-sekme **Prep** (Prep Sheet) — kanvas-merkezli servis hazırlık; gerçek A4 kanvasta yemek kartı + bileşen + boş kutu (tariften çekme + manuel), karta tıkla→popup, sürükle-sırala, önizleme = baskı (`@page margin:0`, damgasız, dar kenar). 1–5 sütun, dikey/yatay, yazı XS–XXL, çerçeve/boşluk ayarı, istasyon gruplama, galeri. Print · Sync ✓ (`prepSheets`).

**Roster** — haftalık vardiya ızgarası (personel × gün); hücre = saat (start/end) veya 6 durum kodu renk-kodlu: OFF, AL (izin), PH (resmi tatil), SL (hastalık), RDO (dinlenme), UNP (ücretsiz). Departman grupları, işçilik maliyeti göster/gizle (Pro), ⚡ haftayı doldur, önceki haftayı kopyala (isimle eşleştirir), canlı önizleme (tek motor — print/Excel/JPEG aynı; mobilde tıkla→zoom). Print A4 yatay renkli + Excel (yatay, tek sayfa) + JPEG paylaşım · Sync ✓ (`rosters`).

### Sourcing

**Inventory** — par (ideal) / min (kritik) eşik, 4 durum (OUT / CRITICAL / LOW / OK), sayım modu + geçmiş, dashboard düşük-stok badge. Print + Excel · Sync ✓ (top-level tablo).
- alt-sekme **Variance** — teorik kullanım (satılan → reçete) vs gerçek kullanım; malzeme başına $ varyans, en büyük sızıntı önce (POS/sayım gerekmez; geçici, kaydetmez).
- alt-sekme **Waste** — fire/bozulma/fazla-üretim kaydı → $ kayıp + opsiyonel stok düşümü + koşan toplam. Sync ✓ (`waste`).

**Suppliers** — 8 kategori, ürün bazlı miktar, sipariş WhatsApp/SMS/Email/share, sipariş geçmişi (son 50). Sync ✓.

### Catering

**Events** (Event Planner) — tarih/konuk/menü/bütçe vs maliyet; 4 durum (draft/confirmed/done/cancelled), otomatik ölçek + kişi-başı maliyet, 🛒 alışveriş listesi (menüyü ölçekle → flatten → tedarikçi grupla → yazdır), çoğalt, canlı A4 önizleme (izole iframe). Print · metin paylaşımı · Sync ✓ (`events`).

**Buffet** (Buffet Planner) — istasyon bazlı; 3-yol maliyet (tarif/malzeme/custom), kişi-başı tüketim oranı, refill çarpanı, yield%, israf projeksiyonu, food cost % hedef durumu (yeşil/sarı/kırmızı), 7 preset + boş başlangıç, çoğalt. 🚚 tedarikçi sipariş listesi (flatten → stok birimine normalize → grupla → yazdır). Print (prep + sipariş + maliyet raporu) + Excel · Sync ✓ (`buffets`).

### HACCP Forms

Hub + 4 bağımsız form (her biri kendi URL'i, bookmark korunur). Print (30 günlük / aylık) · Sync ✓.

| Route | Form | İçerik |
|-------|------|--------|
| `haccp_logs` | Daily Temperature Log | Buzdolabı + dondurucu günlük iki kez |
| `haccp_cooling` | Cook & Cool Log | Pişirme sonrası 2 aşamalı soğutma |
| `haccp_receiving` | Receiving Inspection | Teslimat sıcaklığı / tedarikçi / ambalaj |
| `haccp_holding` | Hot / Cold Holding | Bain-marie + soğuk servis takibi |

### Discover

Herkese açık tarif keşfi: arama, beğeni, görüntülenme sayacı (rate-limited 60 dk/IP). Yalnız üyeler yayınlar; ziyaretçiler arar.

### Account (Profile & Settings)

Profil (ad/rol/ülke/işyeri/bio — Discover'da görünür), dil + para + tema, paylaşım yönetimi, gece R2 yedek. Plan: "Pro'ya geç" (Stripe Checkout) / "Aboneliği yönet" (Stripe portal). JSON yedek indir + geri yükle (yan yana karşılaştırma önizlemeli).

## Plan modeli (Free / Pro)

Tüm limit + gate'ler tek dosyada: `plans.js` (`PLAN_LIMITS`) — özelliği açıp kapamak tek satır. `gate.js` = tüm `can*()` + upgrade modalı + Stripe checkout/portal çağrıları.

| Özellik | Free | Pro |
|---------|------|-----|
| Tarif / Malzeme / Workspace | 15 / 50 / 1 | sınırsız |
| Bulut sync | kapalı (yalnız yerel) | açık |
| HACCP · Roster işçilik · Cost-view paylaşım | kapalı | açık |
| Çıktı footer (watermark) | var | yok |
| Print/Excel export · Discover yayın | açık | açık |

- **Plan kaynağı = sunucu.** `user_prefs`'in AYRI kolonlarında (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`); frontend kolon-seviyesi yetki kilidiyle **yazamaz**, yalnız okur (`cloud.fetchPlan`, data blob'undan değil) → kullanıcı kendini pro yapamaz.
- **Manuel pro:** SQL'de `plan='pro', plan_source='manual'` → kalıcı pro (Stripe'sız); webhook `plan_source='manual'` satırlarını ASLA ezmez.
- **Stripe (CANLI, 2026-06-21):** Pro **USD $19/ay · $190/yıl**. Tüzel kişi `ProChefDesk, LLC` (Delaware). 3 Edge Function: `create-checkout-session` + `create-portal-session` (verify_jwt AÇIK) · `stripe-webhook` (verify_jwt KAPALI, imza doğrulamalı, plan'ı yazan TEK otorite; olaylar: checkout.completed / subscription.updated / .deleted). **Payout:** Stripe → **Mercury** (US bank) → Wise → AU/TR (TR doğrudan payout desteklemiyor; Treasury ABD-dışı banka için güvenilmez). EIN ~Tem 2026 bekliyor (payout'u bloklamadı). Uçtan uca test geçti (upgrade/cancel/refund/portal). **Gelecek:** operatör AU PR alınca AU Stripe'a geçer (ABN + AU banka, LLC gereksiz), abonelikler taşınır, ABD LLC feshedilir. Güncel durum/notlar: `CLAUDE.md` launch.
- **Cost-view paylaşım (Pro):** fiyat + food cost % gösteren özel salt-okunur link (`?view=cost`); maliyet yalnız cost-share payload'unda (`public_shares.share_mode='cost'`), normal link sızdırmaz.
- **Watermark:** footer TÜM çıktılarda (print/PDF · Excel · roster JPEG · paylaşım/URL) `PCD.gate.showWatermark()`'a bağlı — Free'de var, Pro'da temiz; paylaşılan sayfada paylaşanın planına göre snapshot'a gömülür (`payload._wm`). Metin/WhatsApp paylaşımı kapsam dışı.
- **Çıktı paleti (v2.44 Deep Pine — tek standart):** TÜM print/PDF · Excel · roster JPEG · share aynı dili konuşur — başlık+kenarlık pine `#16433a` · aksan/CTA `#1f9d6b` · metin `#1c1917` · kenarlık `#e7e5e4` · th zemini `#eaf6f0` · Inter+Fraunces; Excel pine `16433A` başlık + `E0DDD5` kenarlık + `F6F3EE` alt-satır (PCD.xlsx + inline roster/buffet/recipes AYNI). Tüm print `@page{margin:0}`+içerik padding → tarayıcı damgası (tarih/about:blank/sayfa no) yok. Yeni çıktıda bu paleti kullan. Bilerek istisna: whiteboard (Oswald/Barlow), menu_studio temalı menüleri, HACCP grid `#999`.
- **Dashboard:** 4 metrik + 2 grafik, tamamı gerçek veriden (sahte yok); işçilik kartı Pro-gated.

## Veri tabloları

**Workspace-scoped:** `recipes` · `ingredients` · `menus` · `events` · `suppliers` · `canvases` (kitchen cards) · `checklist_templates` · `checklist_sessions` · `stock_count_history` · `haccp_logs`/`haccp_readings`/`haccp_units`/`haccp_cook_cool`/`haccp_receiving`/`haccp_holding` · `rosters` · `prepSheets` · `buffets` · `whiteboards` · `waste`.
→ **Altyapı var, UI yok:** `shopping_lists` · `mise_plans` · `team` (cloud sync/realtime/backup şeması tam, hiçbir araç okumuyor/yazmıyor).

**Top-level (hesap bazlı):** `workspaces` · `inventory` (stok seviyeleri) · `user_prefs` (dil/para/tema/aktif ws + **plan kolonları** — sunucu-yazılır) · `workspace_tombstones` (silme cascade).

**Supabase-only (frontend yazmaz):** `client_errors` · `discover_view_logs` (rate-limit penceresi) · `public_shares` (paylaşım URL'leri + `share_mode` public/cost) · `recipe_likes` (RLS: yalnız kendi beğenileri).

RLS tüm tablolarda aktif; frontend `anon` key kullanır.

## Kaldırılmış araçlar (v2.43 silindi · v2.44.21 kısmen yeniden inşa)

v2.43'te 10 ölü tool dosyası silindi (route'lanmıyor, yüklenmiyordu). **8 hâlâ silik** (gerekirse git geçmişinden): `menu_matrix` · `sales` · `whatif` · `yield` · `team` · `allergens` (**NOT:** `core/allergens-db.js` CANLI) · `menus` (klasik; `'menus'` route'u `menu_studio.js` yükler) · `tools-hub`.

**v2.44.21'de yeniden inşa → CANLI:** `nutrition` · `variance` (`core/variance.js` motorunun UI'ı) · `waste`. Bu 3 + `portion` + `prep` v2.44.30'da sub-nav sekmelerine taşındı (route'lar app.js'te duruyor). Route tek kaynağı: `app/js/core/app.js`.

## Açık adımlar / roadmap

Launch checklist → `CLAUDE.md` → "Launch — yapılacaklar". Büyüme roadmap'i (yeni özellikler) **operatörde** (doküman dışı).
