# ProChefDesk — Sürüm Geçmişi

Kronolojik tersine (en son üstte). Her sürüm: başlık + ana değişiklikler.

---

## v2.19.0 — Menu Studio Faz 1 (gerçek ürün) · 2026-06-07

Prototip gerçek ürüne dönüştü. Tasarımlar `menus` tablosunda `menu.studio` alanında saklanır (yeni tablo yok) → bulut senkron + yedek + çoklu menü bedava; klasik editör aynı kayıtta çalışmaya devam eder.

- **Çoklu menü + bulut + otomatik kayıt:** Studio artık tüm menüleri listeler; yeni tasarım oluştur, aç, otomatik kaydet (bulut senkron). localStorage tek-doc kaldırıldı.
- **Reçete zekâsı:** kalemler reçeteye bağlı → editörde **canlı kâr marjı** (kalem başına renkli yüzde) + üstte **ciro / ort. marj** çubuğu + reçeteden **otomatik alerjen kodları** (aç/kapa, menüde + lejant).
- **Klasik menüden içe aktar:** mevcut bölüm/yemekleri Studio bloklarına aktarma (reçete bağlantısı korunur).
- **Şablon galerisi** (6 profesyonel başlangıç: fine dining, bistro, café, minimalist, şarap, etkinlik) + **marka kiti** (font/renk kaydet-uygula).
- Tek render motoru (kanvas = çıktı), serbest font/renk/foto/blok sıralama korundu.
- *Sıradaki (Faz 2): serbest sürükle/boyut, çok sayfa, share/QR/cost-view, AI kancaları.*

---

## v2.18.0 — Menu Studio (beta prototip) · 2026-06-07

- **YENİ (beta):** Menu Studio — blok-kanvas menü tasarımcısı prototipi. Gerçek A4 kanvas (önizleme = çıktı, tek render motoru), serbest font (12 küratörlü), özel hex renk (vurgu/metin/arka plan), yemek fotoğrafı, blok ekle/sil/sırala (başlık, metin, bölüm, görsel, ayraç, boşluk), reçeteden veya manuel yemek, dikey/yatay, hazır şablon. Mevcut "Menus" aracına dokunulmadı; yanına eklendi (Menus header → "✨ Menu Studio beta"). Kalıcılık şimdilik localStorage (prototip). Değerlendirme amaçlı; beğenilirse tam sürümde bulut + çoklu menü + reçete-maliyet zekâsı + serbest yerleşim eklenecek.

---

## v2.17.1 — Recipes: kalıcı Cost Report butonu · 2026-06-07

- Recipes header'ına her zaman görünür **Cost Report** butonu. O an ekranda görünen tariflere göre rapor üretir (sekme/arama/etiket filtresine saygı; boşsa tüm tarifler). Select modundaki seçili-alt-küme raporu korundu.

---

## v2.17.0 — Monetization (Free / Pro + Stripe) · 2026-06-07

Tek katmanlı ücretsiz üründen Free + Pro modele geçiş. Tüm limitler/gate'ler tek dosyadan okunur: `app/js/core/plans.js`.

- **Merkezi plan config:** `plans.js` (`PLAN_LIMITS` + `getPlanLimits` + `getUserPlan`). `gate.js` tüm gate'leri + upgrade modalını + Stripe checkout/portal tetikleyicilerini barındırır.
- **Plan alanı:** `user_prefs`'e ayrı kolonlar (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`). Sunucu otoriter; frontend kolon-seviyesi yetki kilidiyle bu kolonları yazamaz (kullanıcı kendini pro yapamaz). Plan artık data blob'undan değil kolondan okunur.
- **Manuel pro:** operatör SQL'de set eder → kalıcı (Stripe'sız); webhook manuel satırları asla ezmez.
- **Stripe:** 3 Edge Function (`create-checkout-session`, `create-portal-session`, `stripe-webhook` — imza doğrulamalı). Pro Monthly 19 AUD / Annual 190 AUD. Account ekranında Pro'ya geç / Aboneliği yönet. `?checkout=success` ve `?upgrade=1` dönüş handler'ları.
- **Feature gating:** tarif (15) · malzeme (50) · workspace (1) · HACCP (Pro) · roster işçilik maliyeti (Pro) · bulut sync (Pro; free = yalnız yerel, push gate'li) · watermark. Limit aşımında engelleme değil, "Pro'ya geç" yumuşak duvarı + kilit ikonu.
- **Watermark plana bağlı:** print footer + paylaşılan sayfa footer'ı `showWatermark()`'tan. Free'de kalır, Pro'da kalkar (paylaşılan sayfada karar paylaşanın planına göre snapshot'a gömülür).
- **Cost-view paylaşım (Pro):** tarif/menü için fiyat + food cost % gösteren özel link (`?view=cost`, salt-okunur, giriş yok). `public_shares.share_mode`; maliyet yalnızca cost-share payload'una gömülür.
- **Chef office dashboard:** komuta merkezi — 4 metrik (ort. menü food cost%, bu hafta işçilik [Pro], düşük stok, eksik tarif) + 2 grafik (tarif food cost dağılımı, malzeme fiyat tazeliği). Tamamı gerçek veriden, sahte sayı yok. Eksik tarif uyarı ikonu (liste + dashboard).
- **Güvenilirlik:** tarif önizlemede "Fiyatlar N gün önce güncellendi" rozeti (>30 gün sarı uyarı).
- **Landing page:** Free vs Pro fiyatlandırma tablosu + Stripe CTA, dark mode, 6 dilli (en/tr/es/fr/de/ar) dil seçici, oturum durumuna göre dinamik CTA. Kaldırılmış araçlar tanıtımdan çıkarıldı.
- **Privacy/Terms:** 6 dilde güncellendi — Stripe alt-işleyen + ödeme verisi, abonelik/iade şartları, HACCP/maliyet sorumluluk reddi, Avustralya hukuku.
- Yeni ikonlar: `lock`, `star`. Migration'lar: `v2.17-monetization-plan-fields.sql`, `v2.17-cost-view-share-mode.sql`.

---

## v2.16.0 — Prep Sheet aracı · 2026-05-22

- **YENİ araç:** Prep Sheet — yemek başına bileşen listesi, tariften otomatik çekme + manuel düzenleme, 1–4 sütun yazdırma, Kayıtlılar (library)
- Prep Sheet bulut senkronu (`prepSheets` MAP-tablosu, 3 yönlü sync)
- Birim ekleme / düzeltmeler

---

## v2.15.x — Roster aracı + büyük güncelleme · 2026-05-22

### v2.15.7
- Roster JPEG'inde hücre yazıları ortalandı (html2canvas için HTML `align`/`valign` attribute)
- Excel sütun genişliği içeriğe göre genişletildi; `fitToWidth` tek sayfa korundu

### v2.15.6
- Roster liste → tıkla = önizleme, Edit butonu = editör
- JPEG gönder: html2canvas → mobil native share (WhatsApp vb.), masaüstü indir
- Geri tuşu: editör/önizlemeden listeye güvenilir döner
- Excel otomatik yatay + tek sayfa (JSZip XML enjeksiyonu)
- Yazı boyutu S/M/L + kalın; print / JPEG / Excel'e uygulanır

### v2.15.5
- Roster Excel: PDF ile aynı renkli görünüm — departman bantları + renkli durum hücreleri (xlsx-js-style inline worksheet)

### v2.15.4
- Menü alerjen/diyet kodları: filtre/kısıtlama değil, sadece bilgi; yemek gizleyen filtre kaldırıldı
- Tarif menü öğesinde alerjen otomatik gösterim (`recipeAllergens`'ten); orijinal tarife dokunulmaz
- Roster: 6 renkli durum kodu (OFF/AL/PH/SL/RDO/UNP) + departman grupları + renkli yazdırma + venue başlık bandı

### v2.15.3
- Roster bulut senkronu (`rosters` MAP-tablosu, HIGH_EDIT per-record merge)

### v2.15.2
- Menü önizlemesinde "N öğe filtreyle gizlendi" uyarı şeridi

### v2.15.1
- **YENİ araç:** Roster (haftalık vardiya planı) — personel × gün ızgara, vardiya saati, işçilik maliyeti göster/gizle, tarihçe, print + Excel + JPEG paylaş

### v2.15.0
- Tedarikçi sipariş geçmişi (son 50 kayıt, tüm gönderim kanalları)

---

## v2.14.x — Veri I/O standardı + menü kodları + demo seed · 2026-05-22

### v2.14.8
- Menü allergen-safe filtre genişletildi (18 chip, `it.codes` ile eşleşme)

### v2.14.7
- Para birimi kalıcılık düzeltmesi — kaydet + yenile sonrası currency korunur
- Tüm export / rapor / paylaşım `PCD.currencySymbol()` ile currency'e bağlandı

### v2.14.6
- Discover "My public recipes" hesap bazlı sayaç (tüm workspace'ler, aktif workspace değil)
- Whiteboard template adları 4 dile (es/fr/de/ar) çevrildi

### v2.14.5
- Menü fiyat gösterim stili: simgeli / simgesiz (Cornell) / gizli
- es/fr/de/ar çeviri: menü kodları + Excel import/export + fiyat stili (~35 anahtar)

### v2.14.4
- Demo büfe maliyet hesabı düzeltildi (porsiyon/kişi — gram değil)
- Demo etkinlik menü alanı düzeltildi (`menu:` → `recipes:` değil)

### v2.14.3
- Demo seed genişletildi: 3 yeni tarif + 9 malzeme + 1 büfe (Sunday Brunch) + 1 tedarikçi
- Demo envanter yüklenme ve tedarikçi kategori hataları giderildi

### v2.14.2
- Ortak styled-Excel motoru (`PCD.xlsx`): kalın başlık + çerçeve + gölge + autofit; tüm yeni exportlar buradan geçer
- Malzeme Excel export + doldur-geri-yükle şablonu (Lists sekmeli)
- Stok sayım Excel export (YENİ)

### v2.14.1
- Menü manuel harf kodları: küçük = diyet/uygunluk (v/vg/gf…), BÜYÜK = "içerir" alerjen (G/D/N…)
- `MENU_CODES` registry + `displayCodeIds` (manuel ∪ otomatik) + lejant

### v2.14.0
- Whiteboard mobil blok düzenleme: bottom sheet her zaman canlı DOM'a bağlanır

---

## v2.13.x — Whiteboard WYSIWYG + araç sadeleştirme · 2026-05-21/22

### v2.13.9
- Menü rozetinde 🌶 emoji → "SPICY" metin etiketi

### v2.13.8
- Re-sync sonrası workspace karışıklığı giderildi (`location.reload()` pattern)

### v2.13.6
- Whiteboard Ctrl+wheel zoom hata spam'i giderildi (ResizeObserver benign hataları filtreli)
- Canvas ölçek: ilk yüklemede self-retry (clientWidth=0 durumu güvenilir)

### v2.13.5
- "Sync now" butonu kaldırıldı (auto-sync zaten aktif)
- `i18n t()` interpolasyon hatası giderildi (3. arg yok sayılıyordu)

### v2.13.4
- Profil kaydı anında IDB'ye yazılır (`PCD.store.flush()` explicit — close/reload race giderildi)

### v2.13.3
- Whiteboard 6 yeni profesyonel template (Tonight's Service, Steak Doneness, Allergen Board…)
- Print footer tek sayfada kalır (flex-column + sheet flex:1)

### v2.13.2
- Portion Calculator: birleşik malzeme görünümü (by recipe / category / supplier) — Shopping'den taşındı

### v2.13.1
- Waste Log + Shopping List araçları kaldırıldı (JS + i18n silindi; bulut şeması korundu)

### v2.13.0
- Whiteboard WYSIWYG: canvas önizleme = print çıktısı (tek `renderBlockContent` + `blockBoxStyle`)
- Canvas gerçek A4/A3 px + `transform:scale`; print aynı px mm `@page`'de basar

---

## v2.12.x — Checklist yeniden + profil + Privacy/Terms · 2026-05-20/21

- **Checklist aracı baştan yazıldı:** Control + Prep iki tip; oturum geçmişi, ilerleme takibi, özelleştirilebilir yazdırma (sütun/yön/punto)
- Profil alanları (rol/ülke/işyeri/bio) her session'da merge edilir, artık kaybolmaz
- Privacy + Terms 6 dilde yayınlandı
- HACCP Fridge Log şablonunda tarih damgası kaldırıldı (şef elle yazar)
- Masaüstü Ctrl+wheel zoom etkin; whiteboard ek print ince ayarları

---

## v2.11.x — Whiteboard Block Composer · 2026-05-20

### v2.11.16
- Mise en Place Planner kaldırıldı (bulut şeması + veri korundu)

### v2.11.15
- FAQ 3 cevap faktüel düzeltildi (IndexedDB doğru, "offline-first" yeniden tanımlandı)

### v2.11.14
- Whiteboard: 4 yeni blok tipi (Step List, Allergen Strip, Doneness Ladder, Time Range)
- Layout 6 kademe (tam → 1/6); Size 6 kademe (XS–XXL)

### v2.11.13
- Whiteboard Key·Value blok inspector dikey layout (taşma giderildi)

### v2.11.12
- HACCP alt form geri tuşu: her yoldan hub'a döner (`ROUTE_PARENTS` pattern)

### v2.11.11
- Discover arama debounce 400ms

### v2.11.10
- Tarif etiketleri: yeni etiket için `+ Add "X"` CTA chip

### v2.11.9
- Whiteboard Tablo blok inspector dikey layout (taşma giderildi)

### v2.11.8
- HACCP Fridge Log: gün isimleri kaldırıldı (sadece rakam); log seçici/print uyumsuzluğu giderildi

### v2.11.4-5
- Kitchen Cards WYSIWYG: önizleme = print popup = PDF (`column-fill:balance`)

### v2.11.3
- Discover arama eklendi (name/description/yazar/etiket, debounce 200ms)

### v2.11.2
- Whiteboard A4/A3 sayfa sınırı çerçevesi + taşma uyarısı

### v2.11.0-1
- **Whiteboard tam yeniden yazıldı:** Notion-tarzı blok besteci, 8 blok tipi, 3 sütun masaüstü UI, mobil bottom sheet, sürükle-sırala, A4/A3 print engine

---

## v2.10.x — Whiteboard pro + Kitchen Cards · 2026-05-20

### v2.10.4
- Araçlar arası geçişte delegated event listener bleed giderildi

### v2.10.3
- Diyet uyumluluk sistemi kaldırıldı (bulut şeması korundu)
- Kitchen Cards dark mode renk düzeltildi

### v2.10.2
- Kitchen Cards Orientation butonu → Whiteboard yönlendirmesi giderildi

### v2.10.0-1
- Whiteboard pro: tipografi + palet + hücre tipleri (header/bigNumber/alert/text) + sürükle-boyutlandır + 5 şablon + kullanıcı şablonları

---

## v2.9.x — NAKED→RICH araç sweep + Discover + cloud sync · 2026-05-19

- **NAKED→RICH sweep tamamlandı** (5 round, 13 araç): kapatılabilir inline guide + stats hero + per-field hint + empty state CTA + dark mode kontrast. Araçlar: Yield, Variance, Nutrition, Allergens, Discover, Account, Team, Sales, What-If, Menu Matrix, HACCP Hub
- Buffets + Mise + Team bulut senkronu (v2.9.17)
- Kitchen Whiteboard bulut senkronu (v2.9.42)
- Discover Tag filter + Allergen free-from filter (v2.9.15-16)
- Discover görüntülenme rate limit: Edge Function, 60 dk/IP (v2.9.18)
- `recipe_likes` RLS sıkılaştırıldı (v2.9.24)
- hCaptcha `render=explicit` + window callback pattern (v2.9.29)
- Modal scroll lock `overflow:hidden` (hCaptcha popup offset giderildi — v2.9.30)
- Buffet Quick Start 4 preset (v2.9.89); Buffet UX modernize stats hero + search (v2.9.88)
- Blog 13 yazı: Faz A SEO upgrade (3 yazı) + Faz B 5 round (10 yeni yazı) — v2.8.94→v2.8.99

---

## v2.8.x — Altyapı + büyük araçlar · 2025-2026

### v2.8.80-89
- Buffet overhaul: 3 item tipi (recipe/ingredient/custom) + Excel + UX
- Buffet liste kartında prep/cost/Excel butonları (editor açmadan)
- Profile ↔ Discover bağlantısı (authorName, public recipe enrich)
- Welcome tour modernizasyon (4-step, animasyonlu)
- Modal focus root cause fix (evrensel — ilk form field'ına focus)
- Recipe ingredient editor "+Add new" tam modal akışı

### v2.8.59-79
- App boot perf L1+L2 (lazy load, defer, preload, dns-prefetch)
- Tarif serbest etiket sistemi + filtre
- HACCP Hub konsolidasyon (4 form → tek hub, sidenav sadeleşti)
- Sub-recipe ingredient flattening helper (`PCD.recipes.flattenIngredients`)
- Menu Builder modernizasyon (4 tema + 12 renk + 2 sütun + duplicate)
- Allergen Guardrail (free-from filter)
- **YENİ araç:** Buffet Planner (v2.8.73)
- **YENİ araç:** Mise en Place Planner (v2.8.74 — v2.11.16'da kaldırıldı)

### v2.8.34-58
- Standart tıklanabilir footer (tüm print/share/QR, tek format)
- Kitchen Cards: recipe arama + drag-drop sıralama
- Recipe ingredient grup ayracı (`separator` tipi)
- HACCP Receiving + Holding formları (YENİ, bulut sync dahil)
- **Discover MVP:** anonim view, like, public recipe paylaşımı
- Realtime JWT `setAuth` fix

### v2.6.x — v2.8.33
- Per-table sync schema (16 workspace-scoped + top-level tablolar)
- RLS tüm tablolarda aktif
- Cascade trigger'lar + workspace silme
- Çok cihazlı senkron temel altyapısı (push/pull/realtime 3 yön)
- Cache-busting, queue IDB persist (offline yazım korunur)
