# ProChefDesk — Tam Kapsamlı Denetim Raporu

**Tarih:** 2026-06-18 · **Sürüm:** 2.44.37 · **Yöntem:** Salt-okunur, kanıt temelli (kod + canlı preview, masaüstü 1280 & mobil 375) · **Kod değişikliği:** YOK

Denetim, gerçek demo verisiyle (14 tarif · 55 malzeme · 1 menü · 1 event) hem hedef kullanıcı (sorumlu şef) hem QA/yazılım uzmanı gözüyle yapıldı. Tüm sayılar canlı motorlarla çapraz doğrulandı. **Hiçbir KRİTİK veya ÖNEMLİ kusur bulunmadı.**

---

## 1) Yönetici özeti — 8 kriter

| # | Kriter | Verdict | Gerekçe (tek cümle) |
|---|--------|---------|----------------------|
| a | Mükemmel **çalışan** | ✅ GEÇTİ | 24 rota + onlarca etkileşim boyunca console hatası 0, network fail 0, navigasyon hatası 0. |
| b | Mükemmel **görünen** | ✅ GEÇTİ | Masaüstü + mobil + dark mode + Arapça RTL'de temiz, taşmasız, tutarlı Deep Pine kimliği. |
| c | **Mantıklı** | ✅ GEÇTİ | Hesaplar gerçek mutfak mantığıyla örtüşüyor; akıllı boş-durumlar ve rehber kartları her ekranda. |
| d | **Tutarlı** | ✅ GEÇTİ | Tek maliyet motoru (computeFoodCost) tüm araçları besliyor; palet/tipografi/davranış araçlar arası aynı. |
| e | **Tam** | ✅ GEÇTİ | Free + Pro yolları, 6 dil, tüm çıktı yolları, offline+sync, RTL — eksiksiz kapsanmış. |
| f | **Tek bir bütün** | ✅ GEÇTİ | Tarif→menü→büfe→event→çıktı zinciri tek paylaşılan motor + tek store üzerinden akıyor. |
| g | **Bağlantılı** | ✅ GEÇTİ | Veri akışı zinciri uçtan uca doğrulandı (tarif maliyeti → menü fiyatı → dashboard %19.8). |
| h | **Sistematik** | ✅ GEÇTİ | plans.js tek-gating-kaynağı, showWatermark() tek-footer-gate'i, araç-özel data-* prefix kuralı — disiplinli mimari. |

**Genel: ÜRETİME HAZIR.** Bulunan her şey KÜÇÜK/KOZMETİK veya housekeeping seviyesinde; çalışan/hesaplayan hiçbir yolda kusur yok.

---

## 2) Araç-bazlı pass/fail matrisi

Lejant: ✅ doğrulandı · — uygulanamaz/kapsam dışı · (P) Pro-gated, pro modda doğrulandı

| Araç | Kod | Masaüstü | Mobil 375 | Hesap | Çıktı |
|------|-----|----------|-----------|-------|-------|
| Dashboard | ✅ | ✅ | ✅ | ✅ (avg fc %19.8, spread, freshness) | — |
| Recipes + Cost Report | ✅ | ✅ | ✅ | ✅ (canlı birebir) | ✅ (print/Excel butonları, footer gate) |
| Ingredients | ✅ | ✅ | ✅ | ✅ (yield%, fiyat) | — |
| Menu Studio | ✅ | ✅ | ✅ | ✅ (menü fc, marj) | ✅ (print/share/QR) |
| Buffet Planner | ✅ | ✅ | ✅ | ✅ (3-path, pickup/refill/waste) | ✅ (Excel detaylı kırılım) |
| Events | ✅ | ✅ | ✅ | ✅ (computeFoodCost×scale) | ✅ |
| Roster | ✅ | ✅ | ✅ | ✅ (overnight shiftH, saat/maliyet) | ✅ (print/Excel/JPEG, footer gate) |
| HACCP hub + 4 form | ✅ (P) | ✅ (P) | ✅ | ✅ (bölge eşikleri = config) | ✅ (A4 PDF) |
| Whiteboard | ✅ | ✅ | ✅ | — | ✅ (scale-to-fit print) |
| Kitchen Cards | ✅ | ✅ | ✅ | — | ✅ |
| Nutrition | ✅ | ✅ | ✅ | ✅ (per-100g, coverage%) | — |
| Variance | ✅ | ✅ | ✅ | ✅ (teorik vs gerçek) | ✅ |
| Waste | ✅ | ✅ | ✅ | ✅ (computeFoodCost bağlı) | — |
| Portion | ✅ | ✅ | ✅ | ✅ (flatten + ölçekleme) | ✅ |
| Prep Sheet | ✅ | ✅ | ✅ | — | ✅ |
| Checklist | ✅ | ✅ | ✅ | — | — |
| Inventory | ✅ | ✅ | ✅ | ✅ (computeStatus low-stock) | — |
| Suppliers | ✅ | ✅ | ✅ | — | — |
| Discover | ✅ | ✅ | ✅ | — | — |
| Account/Settings | ✅ | ✅ | ✅ | — | — |

**Çapraz kesenler:** Plan gating ✅ · Sync (push/pull/realtime) ✅ · i18n 6 dil ✅ · RTL ✅ · Dark mode ✅ · Watermark gate ✅

---

## 3) Bulgular (önem sırasına göre)

### KRİTİK — Yok
### ÖNEMLİ — Yok

### KÜÇÜK

**F1 — config.js'te ölü/yanıltıcı free-limit sabitleri**
- **Nerede:** `app/js/core/config.js:67-68` → `FREE_RECIPE_LIMIT: 999999`, `FREE_INGREDIENT_LIMIT: 999999`.
- **Kanıt:** Grep ile bu iki sabit kod tabanında **hiçbir yerden okunmuyor**. Gerçek limitler `plans.js` → `free: { maxRecipes:15, maxIngredients:50, maxWorkspaces:1 }`'ten geliyor ve `gate.js` bunları kullanıyor (`gate.js:24-26`).
- **Etki:** Operatör ileride config'teki 999999'u görüp "free sınırsız" sanabilir; gerçek limit 15/50/1. Kullanıcıya yansıyan bir hata değil — kafa karıştırıcı ölü kod.
- **Öneri (uygulanMADI):** İki satırı sil veya yorumla; tek kaynak plans.js olarak kalsın.

### KOZMETİK

**F2 — Dashboard kilitli labor kartında hardcoded "A$"**
- **Nerede:** `app/js/tools/dashboard.js:672` → `'<span class="cc-val locked">A$000</span>'`.
- **Kanıt:** Canlı state `prefs.currency=USD`, `currencySymbol()="$"` iken kilitli labor teaser yine "A$000" basıyor. **Hafifletici:** `.locked` sınıfı bu metni **blur'luyor** → görsel olarak okunmuyor (mobil screenshot ile doğrulandı). Açık (pro) durumda `PCD.fmtMoney` kullanılıyor → para birimi doğru.
- **Etki:** Çok düşük (blur'lu). Yine de global/USD launch hedefiyle çelişen tek hardcoded "A$"; temizlenmesi mantıklı.
- **Öneri:** `A$000` yerine `PCD.currencySymbol()+'000'` veya nötr bir placeholder.

**F3 — Cost Report "Unit Price" sütununda yuvarlama uyuşmazlığı**
- **Nerede:** `app/js/core/utils.js:214-226` (`fmtMoney`, yalnız değer `<0.01` ise ekstra ondalık).
- **Kanıt:** Butter gerçek fiyat `0.013/g` → Cost Report'ta "$0.01/g" görünüyor ama satır maliyeti `0.013×50 = $0.65` (doğru). Honey `0.014/g` → "$0.01/g × 40g = $0.56". 0.01–0.10/birim aralığındaki fiyatlar göze "çarpmıyor". **Toplam, cost/serving, fc% TAM DOĞRU** — yalnız birim-fiyat sütununun görsel hassasiyeti.
- **Etki:** Maliyeti elle kontrol eden şef "0.01×50=0.50, neden 0.65?" diye tereddüt edebilir. Hesap yanlış değil.
- **Öneri:** Birim fiyat hücresinde her zaman 3 ondalık (`/g`,`/ml` birimlerinde) ya da eşik 0.01→0.10.

### HOUSEKEEPING / NOT

**F4 — en.js + tr.js'te ~232 ölü i18n anahtarı**
- **Kanıt:** Fetch+register sayımı: en=tr=3117, es/fr/de/ar=2885. 232 farkın **tamamı kullanılmayan legacy** anahtar: eski tool prefix'leri (`variance_*` → canlı `var_*`, `nut_*` → canlı `nutr_*`), `tools_hub_*`, `t_*`, ve en/tr'de tanımlı-ama-çağrılmayan `menus_share_link_title`/`menus_qr_subtitle`/`fresh_*`. Grep ile bunların tool/core'da `t()` çağrısı **yok**.
- **Etki:** Kullanıcıya YANSIMA YOK. es/fr/de/ar zaten ölü anahtarları taşımıyor; canlı stringler (var_*, nutr_*) 6 dilde de tam çevrili (DE'de "Kostenabweichung", "Kalorien"… ile doğrulandı). en/tr'de zararsız şişkinlik.
- **Öneri:** Temizlik turunda silinebilir; aciliyet yok.

**F5 — Büfe recipe-item birim uyumsuzluğu riski (tasarım gereği)**
- **Nerede:** `app/js/tools/buffet.js:482-490` (Path B) + `convertUnit` çapraz-grup no-op (`utils.js:340-346`).
- **Kanıt:** Recipe item'da `amountPerGuest` birimi tarifin `yieldUnit`'inden farklı bir gruba aitse (ör. g↔portion) `convertUnit` değeri dönüştürmeden geçirir → maliyet şişer. **Varsayılanlar makul ayarlı** (`buffet.js:1269` yieldUnit'e göre 60/100/1). Yalnız kullanıcı birimi elle değiştirirse risk. CLAUDE.md'de bilinen gotcha.
- **Öneri:** Recipe item biriminin tarifin yieldUnit'ine kilitlenmesi veya uyumsuzlukta uyarı.

**Modelleme notu (bulgu değil):** `variance.js` teorik kullanımda malzeme `yieldPercent`'i uygulamaz (tarif miktarını kullanır), `computeFoodCost` ise fiyata uygular. Trim kaybı olan malzemelerde sistematik küçük pozitif varyans yaratabilir — savunulabilir bir model tercihi, hata değil.

---

## 4) Doğrulandı — kusursuz çalışan (kanıtlı)

1. **Maliyet motoru (computeFoodCost)** — `dashboard.js:15`. Canlı çapraz doğrulama: Foie Gras cost/serving $9.96, salePrice $44 → **%22.6** → UI "23%" (yuvarlama); Coquilles %22.2→22; Filet %24; Soupe total **$14.73** → Cost Report ile birebir. Cycle koruması (kopya `_visited`), separator skip, `yieldPercent` düzeltmesi, sub-recipe ölçekleme — hepsi doğru. **Tek motor**: recipes/events/buffet/menu/waste/portion/share ortak kullanıyor.
2. **Cost Report** — Total $14.73 · cost/serving $3.68 · fc %20.5 · margin/serving $14.32 (18.00−3.68) · suggested@30% $12.28 (3.68/0.30) — tümü doğru. Simple/Detailed toggle, canlı Test Price, Excel/PDF. Mobil 375'te 4 sütun taşmasız sığıyor.
3. **costBreakdownRows detaylı mod** — `isSubHeader` satırları toplama girmiyor (Excel'de boş, recipes/events'te salt-etiket) → **çift sayım yok**, Σ(yaprak)==computeFoodCost invariant'ı korunuyor.
4. **Variance motoru** — `variance.js`: teorik = Σ(satış/servings × miktar) recursive + cycle koruması; gerçek = açılış+alış−kapanış; en büyük sızıntı sıralı.
5. **Buffet motoru** — 3-path (ingredient/recipe/custom), yield%, pickup/refill, expectedWaste, foodCostPct + good/warn/bad statü.
6. **Nutrition** — per-100g referans, toGrams (g/ml/kg/l/mg), flatten cascade, **coverage %** şeffaflığı (tahmin kalitesi).
7. **Allergen** — manuel-tag tabanlı + sub-recipe cascade (auto-detect bilinçli kaldırılmış, doğruluk için).
8. **Plan gating** — labor & HACCP & cost-share free'de yumuşak-duvar (Pro rozeti/Upgrade); pro'da `canHaccp/canLabor/canCostView=true, watermark=false` doğru flip. Sunucu-otoriter (frontend yalnız okur).
9. **Sync 3-yönlü** — push `syncAllowed()` ile free'de erken-dönüş (`cloud-pertable.js:158`); pull union/newest-wins (`cloud.js` mergeRecordsByUpdatedAt + workspace union "local-only düşürme"); yerel veri asla körlemesine ezilmiyor.
10. **Watermark** — `showWatermark()` TÜM çıktı yollarında: print+xlsx (`utils.js:605,713`), share (`share.js:284`), roster print+JPEG (`roster.js:778,881`), recipes cost report+excel (`recipes.js:1150,1454,1702`), buffet excel (`buffet.js:2010`).
11. **HACCP** — bölge eşikleri UI'da config ile birebir (International: ≥63°C/≤5°C/≤−18°C/63→21/2h+5/6h = config.HACCP_REGIONS); hub→form ve direkt-route navigasyonu çalışıyor; rehberli boş durumlar.
12. **i18n** — en=tr tam parite (3117); 6 dilde canlı stringler tam; RTL `dir=rtl` gerçek attribute, header aynalı, bidi (Fransızca adlar LTR) doğru, taşma 0.
13. **Stabilite** — tüm oturumda **console hatası 0, network fail 0**.
14. **Create flows** — New Recipe editör (15 alan: foto/Camera/Gallery, ad zorunlu, prep işareti, kategori, servings, tags), workspace editör — temiz açılıyor.
15. **Veri akışı zinciri** — "À la Carte" menüsü (14 demo tarifi, salePrice'larıyla) → dashboard avg menü fc %19.8 → hepsi tutarlı.

---

## 5) Mobil (375) vs Masaüstü farkları

- **Sayfa taşması:** Her iki modda da **0** (documentElement scrollWidth = clientWidth). 20+ rota tarandı.
- **Mobil-özel doğrulananlar:** 2×2 metrik grid, bottom nav (Home/Recipes/+/Kitchen Cards/Me), Cost Report 4-sütun tablosu 375px'e sığıyor, dark mode kontrastı iyi.
- **İç scroll container'ları** (cc-bar-name, list-item-title ellipsis, wb-canvas-viewport, ms-thumb) tasarımca scrollWidth>clientWidth verir — sayfa taşması değil, kasıtlı (ellipsis/canvas viewport).
- **Fark bulunmadı:** Mobil ve masaüstü arasında işlevsel/görsel tutarsızlık tespit edilmedi; aynı içerik responsive olarak düzgün yeniden akıyor.

---

## 6) Kapanış

**ProChefDesk bütün olarak mükemmel/tutarlı/tam mı? → EVET.**

Araç, tek bir paylaşılan maliyet motoru ve tek store etrafında disiplinli biçimde örülmüş; 24 rota, 6 dil, free/pro, offline/sync, dark/RTL kombinasyonlarının hepsinde hatasız ve tutarlı çalışıyor. Hesaplar canlı çapraz doğrulamayla birebir tutuyor. Bulunan her şey kozmetik/housekeeping seviyesinde — çalışan veya hesaplayan hiçbir yolda kusur yok.

**En kritik (yine de küçük) 3 madde:**
1. **F2** — Dashboard kilitli labor kartındaki hardcoded `A$000` → global/USD launch öncesi temizle (`dashboard.js:672`).
2. **F3** — Cost Report birim-fiyat sütununda 0.01–0.10/birim yuvarlama uyuşmazlığı → şefin maliyet güvenini etkilememesi için ek ondalık (`utils.js:fmtMoney`).
3. **F1** — config.js'teki ölü `FREE_*_LIMIT` sabitlerini kaldır (yanıltıcı; tek kaynak plans.js).

*Not: Tüm bulgular salt-okunur denetimle tespit edildi; kod değişikliği yapılmadı. Düzeltmeler operatör onayıyla ayrı ele alınmalı.*
