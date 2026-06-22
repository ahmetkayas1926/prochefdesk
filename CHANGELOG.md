# ProChefDesk — Sürüm Geçmişi

Kronolojik tersine (en son üstte). Her sürüm: tarih + ana değişiklikler.

---

## v2.44.39 — Şef profili cihazlar-arası senkron · 2026-06-22
- **Kök neden:** Şef profili (ad/rol/ülke/işyeri/bio) yalnız yerel `user` objesinde tutuluyordu — hiçbir senkron yola bağlı değildi. Bir cihazda değişiklik diğerine GİTMİYORDU; HACCP log'una giriş anında o cihazın YEREL adı snapshot olarak gömülüyordu → masaüstü eski isimle log basıyordu.
- **Çözüm (mevcut çalışan kanalı kullan):** Profil artık `prefs.profile` içinde tutulur → `user_prefs.data.prefs` üzerinden cihazlar-arası senkron olur (currency/haccpRegion ile AYNI kanal: push+pull-merge+realtime). `auth._applyProfileFromPrefs` aynası senkron `prefs.profile`'ı yerel `user` okuma-objesine yansıtır (boot pull sonrası + realtime 'prefs' event). 70 okuyucu (HACCP/header/Discover/form) `user.name` okumaya devam eder. **Sync-core'a (cloud.js/cloud-pertable/cloud-realtime) SIFIR dokunuş** — profil, prefs'in içinde olduğu için 4 user_prefs builder'ına otomatik biner (wipe riski yok).
- **Not:** Senkron, profil bir kez kaydedildiğinde aktifleşir (ilk save `prefs.profile`'ı doldurur + push eder). Geniş tarama: profil, cihazlar-arası senkron olmayan TEK hesap-verisiydi; başka araçta bu sorun yok.

## v2.44.32–.38 — Stripe canlı + USD/LLC geçişi + free→pro fix · 2026-06-21
- **Stripe CANLI:** `ProChefDesk, LLC` (Delaware) · ürünler **USD $19/$190** · pk_live + 3 Edge Function + webhook (3 olay) live · Mercury payout · uçtan uca test geçti (upgrade/cancel/refund/portal/realtime).
- **free→pro fix** (`migrations/v2.44.38`): signup'ta `user_prefs` satırı yaratan SECURITY DEFINER trigger + backfill. Kök neden: free kullanıcı sync etmez + trigger yoktu → satırsız hesapta `.update().eq(user_id)` 0 satır eşler → plan yazılmaz. **Kural:** yeni böyle Edge Function/SQL satırın varlığını varsaymalı ya da upsert.
- **Site → LLC/USD/Delaware (6 dil):** terms+privacy (işletici→ProChefDesk LLC · governing law→Delaware · liability cap→US$100 · Stripe→Stripe Inc. · adres→Newark DE) · landing $0/$19/$190 · app gate butonları $ · `dashboard.js` A$→`currencySymbol()` · örnek placeholder'lar + kurucu "Perth" yer-pini temizlendi. **Üründe Perth/AUD=0**; kurucu kimliği + kariyer hikâyesi (İstanbul/Körfez/Katar) + FSANZ/AUD-para-seçeneği bilerek KALDI.

## v2.44.31 — Landing orijinale dönüş + roster print + toplu fiyat-onay · 2026-06-15
- **Landing:** v2.44.30'un html2canvas ile üretilmiş ürün görselleri metni kırpıyordu → net orijinallere geri alındı; 7 orphan görsel silindi. **Kural:** ürün screenshot'ları html2canvas ile ÜRETİLMEZ (operatör gerçek tarayıcı yakalaması alır). Araç konsolidasyonu/sub-nav korundu.
- **Roster print:** `@page margin:0` + içeriğe `padding` → Chrome'un başlık/altbilgi damgaları kalktı.
- **Ingredients:** toplu "Fiyatları onayla" — seçili malzemelerin fiyat tarihini bugüne çeker (fiyat değişmez), eski-fiyat etiketini temizler; 6 dil.

## v2.44.30 — Araç konsolidasyonu + landing görsel yenileme · 2026-06-15
- **Sidebar 20 → 15:** sıkı-bağlı araçlar ortak alt-sekme (`PCD.subNav`) altında — Stok (Inventory·Variance·Waste) · Tarif (Recipes·Nutrition·Portion) · Liste (Checklist·Prep). Route'lar korundu; `tab_*` 6 dil.
- **Landing görselleri** canlı app'ten yenilendi (light+dark+mobil) + "Day & night" vitrini + ürün-kanıtı 4 → 6 kart.

## v2.44.21–.29 — Operasyonel araçlar + marka + QA · 2026-06-13…14
- **Waste** şema-only → canlı UI (stok düşümü + $ fire); **Variance** + **Nutrition** araç UI'ları yeniden inşa.
- Events/inventory/recipes/ingredients/dashboard genişletildi (~100/dil i18n).
- Toque app ikonu tüm web sayfalarında + merkezi `icon.svg`; restore/purge senkron fix; catering-cost-per-head blog.

## v2.43.0–.18 — Sadeleştirme + Whiteboard + i18n 6 dil + maliyet · 2026-06-10…11
- **10 ölü tool dosyası silindi** (route'lanmıyordu; core motorlar kaldı; nutrition/variance/waste sonra v2.44.21'de yeniden inşa).
- **Whiteboard** aracı (gerçek-A4 WYSIWYG).
- **i18n 6 dil tam** (2598 anahtar, 0 eksik — v2.43.17).
- **fmtMoney:** her zaman 2 ondalık + binlik ayraç + küçük-birim-fiyat hassasiyeti; cost report alt-tarif genişletme (malzeme + tek tek fiyat); tarif sıralama dropdown.

## v2.41.0 — Kitchen Cards araç + demo overhaul · 2026-06-09
- Kitchen Cards tam araç (lazy route + sidebar); demo seed overhaul (whiteboard + kitchen card + zengin veri); landing/roster/menu/buffet cilaları.

## v2.40.0 — Landing yeniden tasarımı + mobil & print fix · 2026-06-09
- **Landing satış-odaklı redesign:** light-mode sabiti (`color-scheme:light`), fayda hero + UI mockup, yeni bölümler (canlı an / problem / ürün-kanıtı / kurucu), og-image, "No lock-in, no surprises" fiyat-notu. EN+TR tam (es/fr/de/ar yeni bölümlerde EN'e düşer).
- **Kitchen Cards:** aksiyon çubuğu kanvas üstüne + mobil scale fix.
- **Menu Studio:** page/theme renk+font kontrolleri bağlandı (v2.32'de unutulmuş), thumbnail hard-refresh fix, print `print-color-adjust:exact`, "Menu not found" toast fix (araç-özel `data-ms-*`).
- **Roster:** mobil scale-to-fit + tıkla-zoom, önizleme stay-open, editör kompakt. **Buffet:** mobil kart squish fix. **Ingredients/Inventory:** header wrap fix.
- Desen notu: clientWidth=0 ilk-paint yarışı = bounded rAF self-retry (menü thumb, kitchen cards, roster, whiteboard).

## v2.16–v2.39 — 8-araç profesyonel revizyon programı + Menu Studio · 2026-06-07…08
Her araç: kod-önce analiz → gerçek değer katan geliştirme → tarayıcı doğrulaması (köklü rewrite zorlanmadı). Çekirdek değişiklikler:
- **v2.39** Portion Calculator: stilize Excel export (PCD.xlsx; tarif/kategori/tedarikçi görünümüne uygun). → 8-araç programı tamam.
- **v2.38** Buffet Planner: tedarikçiye göre sipariş/satın-alma listesi (`flattenIngredients` + stok birimine normalize + grupla).
- **v2.37** Event Planner: alışveriş listesi + etkinliği çoğalt + canlı A4 önizleme + kişi-başı maliyet.
- **v2.36** Roster: ⚡ haftayı doldur + önceki haftayı kopyala (isimle eşleştir) + canlı önizleme.
- **v2.35** Menu Studio: +10 profesyonel şablon (toplam 20).
- **v2.34** Menu Studio: "Page & theme" + "Theme accent" etiket netleştirme.
- **v2.33** Whiteboard cook-sheet satır ekle/sil; HANDOVER güncellendi.
- **v2.32** Menu Studio: popup düzenleme + Page settings ayrı popup + kanvas çerçeve + home şablon butonu.
- **v2.31** Fix: Kitchen Cards dark mode'da site yüzeyi beyaz (sızan `body{background:#fff}` `.kc-preview-frame`'e scope'landı).
- **v2.30** Prep Sheet: kartta sil ikonu + "Extra tight" boşluk + 5 sütun.
- **v2.29** Prep Sheet: Whiteboard-stili pointer sürükle (üst/alt gösterge) + ~sıfır kenar.
- **v2.28** Prep Sheet print: `@page margin:0` (Chrome damgaları kalktı) + dar kenar.
- **v2.27** Whiteboard: popup editör + kanvas blok araç çubuğu (sürükle/düzenle/çoğalt/sil).
- **v2.26** Prep Sheet: kanvas-merkezli redesign (sol liste kalktı, modal düzenleme).
- **v2.25** Prep Sheet: kanvasta sürükle-bırak + kart-arası boşluk kontrolü.
- **v2.24** Prep Sheet: önizleme = baskı (gerçek A4 sayfalama motoru) + yazı boyutu/Bold/çerçeve.
- **v2.23** Checklist: editörde canlı A4 önizleme (tek `buildChecklistHtml` motoru).
- **v2.22** Prep Sheet: canlı önizleme + vurgu rengi/yön/preset + sürükle + istasyon gruplama + library.
- **v2.20.3–.21** Kitchen Cards: presets + accent renk + özel/not kartları + library galerisi.
- **v2.20.0–.2** Menu Studio ANA menü aracı (`menus` route; klasik import) + library + sürükle + 10 şablon + i18n (`ms_*` 6 dil) + Paylaş/QR/cost-view.
- **v2.19.0/.2** Menu Studio Faz 1 (gerçek ürün: çoklu menü + bulut + reçete zekâsı/canlı marj + import + şablon/marka kiti) — `menu.studio` blob; **v2.19.2** kritik stil fix (font çift-tırnağı inline `style`'ı kesiyordu) + sayfa boyut/sütun/ayraç kütüphanesi.
- **v2.19.1** Sync fix: array tablo pull (whiteboard/buffet/team/mise 2. cihaza inmiyordu) + `user_prefs` UPDATE grant (42501).
- **v2.18** Menu Studio beta prototip (localStorage).
- **v2.17.0/.1** **Monetization (Free/Pro + Stripe):** `plans.js` merkezi limit/gate; sunucu-otoriter plan kolonları (frontend yazamaz); 3 Edge Function (19/190 AUD); feature gating + watermark + cost-view share; chef dashboard (gerçek veri); landing fiyatlandırma + Privacy/Terms 6 dil. **.1** kalıcı Cost Report butonu.
- **v2.16** **YENİ araç:** Prep Sheet + bulut sync (`prepSheets` MAP-tablo).

## v2.15.x — Roster aracı · 2026-05-22
- **YENİ:** Roster (personel×gün ızgara, vardiya saati/durum kodu, işçilik maliyeti, tarihçe). 6 renkli durum (OFF/AL/PH/SL/RDO/UNP) + departman grupları + renkli çıktı. Bulut sync (`rosters` MAP). Çıktı: print + Excel (yatay tek-sayfa, JSZip) + JPEG paylaşım. Tedarikçi sipariş geçmişi (son 50).

## v2.14.x — Veri I/O + menü kodları + demo · 2026-05-22
- Ortak styled-Excel motoru (`PCD.xlsx`); malzeme/stok Excel import-export + doldur-geri-yükle şablonu.
- Menü harf kodları (küçük=diyet, BÜYÜK=alerjen — bilgi amaçlı, filtre değil) + tariften otomatik alerjen.
- Currency kalıcılık fix; Discover hesap-bazlı public sayaç; demo seed genişletme + maliyet/menü-alanı fix'leri.

## v2.13.x — Whiteboard WYSIWYG + sadeleştirme · 2026-05-21/22
- Whiteboard WYSIWYG (canvas = print, tek `renderBlockContent`/`blockBoxStyle`) + 6 şablon.
- Waste Log + Shopping List araçları kaldırıldı (bulut şeması korundu); Portion birleşik malzeme görünümü.
- `i18n t()` interpolasyon fix; profil flush fix; "Sync now" kaldırıldı (auto-sync aktif).

## v2.12.x — Checklist + profil + legal · 2026-05-20/21
- Checklist baştan yazıldı (Control + Prep, oturum geçmişi, özelleştirilebilir baskı). Profil alanları her session merge (kaybolmaz). Privacy + Terms 6 dil.

## v2.11.x — Whiteboard Block Composer · 2026-05-20
- Whiteboard tam yeniden (Notion-tarzı blok besteci, 12 blok tipi, sürükle-sırala, A4/A3 print engine). Mise en Place kaldırıldı (şema korundu). HACCP alt-form geri-tuş hub'a döner; Discover arama + debounce.

## v2.10.x — Whiteboard pro + Kitchen Cards · 2026-05-20
- Whiteboard pro (tipografi/palet/hücre tipleri/şablon). Diyet uyumluluk sistemi kaldırıldı (şema korundu). Araçlar-arası delegated listener bleed fix.

## v2.9.x — NAKED→RICH sweep + Discover + cloud sync · 2026-05-19
- NAKED→RICH araç sweep (kapatılabilir guide + stats hero + per-field hint + empty CTA + dark kontrast). Buffets/Mise/Team + Whiteboard bulut sync. Discover tag/allergen filtre + rate-limited view (60dk/IP Edge) + `recipe_likes` RLS sıkılaştırma. hCaptcha `render=explicit` + scroll-lock fix. Blog: 13 yazı (SEO upgrade + Faz B).

## v2.8.x — Altyapı + büyük araçlar · 2025–2026
- **YENİ araçlar:** Buffet Planner (v2.8.73), Mise en Place (v2.8.74 — v2.11.16'da kaldırıldı). **Discover MVP** (anonim view/like/public recipe). HACCP Receiving+Holding (+sync) + HACCP Hub konsolidasyon (4 form → tek hub).
- Buffet overhaul (3 item tipi: recipe/ingredient/custom + Excel). Sub-recipe flattening helper (`flattenIngredients`). Menu Builder modernizasyon. Standart tıklanabilir footer (tüm print/share). Modal focus root-cause fix. Recipe etiket + ingredient ayraç. App boot perf (lazy/defer/preload).

## v2.6–v2.8.33 — Çok-cihazlı senkron temeli
- Per-table sync schema (workspace-scoped + top-level tablolar) + RLS tüm tablolarda + cascade trigger'lar + workspace silme. Push/pull/realtime 3-yön; queue IDB persist (offline yazım korunur); cache-busting.
