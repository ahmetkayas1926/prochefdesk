# ProChefDesk — Sürüm Geçmişi

Kronolojik tersine (en son üstte). Her sürüm: tarih + ana değişiklikler.

---

## v2.44.101 — HACCP çok-aylık yazdırma: her form + Audit Pack tek PDF'te ay aralığı · 2026-06-28
Şimdiye dek her HACCP formu yalnız TEK ay basıyordu. Denetim çeyreklik/dönemsel olur (kayıt saklama 90+ gün) — operatör "Nisan→Haziran seç, tek PDF al" istedi. **5 yerin hepsine** eklendi: Daily Temperature, Cook & Cool, Receiving, Hot/Cold Holding + Audit Pack.
- **YENİ — Ortak ay-aralığı altyapısı** (`PCD.haccp` · utils.js): `pickMonthRange` (Başlangıç/Bitiş modalı), `monthsInRange`, `printSheets` (her ayın sayfasını tek landscape PDF'e page-break ile dizer). Tek noktadan, her form aynı akışı kullanır.
- **Her formda "Aylar…" butonu** mevcut tek-ay yazdırmanın yanında. Aylık formlar (logs/cooling/receiving) → her ay bir sayfa; **Holding günlük** → aralıktaki tüm kayıtlı günler ayrı sayfalar. Audit Pack → her ay kendi tam raporu (portrait), aralarında page-break.
- **Tek-ay çıktısı DEĞİŞMEDİ.** Yaklaşım: her formun mevcut print fonksiyonuna `returnHtml` parametresi (tek satır) — tek-ay HTML'i birebir aynı, sadece artık döndürülebiliyor; iç sheet'in `body{}` kuralı sarmalanınca etkisiz kalır, tek-sayfa layout korunur.
- **Preview'da uçtan uca doğrulandı:** Cook&Cool May+June → 2 landscape sayfa + page-break + her ayın dolu verisi; Receiving aynı; **Audit Pack 2026-05→2026-06 → tek PDF, 2 ay başlığı (her ay tam rapor), portrait, page-break, corrective notu render**; butonlar "Months…" + From/To i18n çözülü; 0 console hatası. 9 yeni i18n anahtarı **6 dilde TAM**. Tüm syntax `node -c` temiz.

## v2.44.100 — HACCP Audit Pack dürüstlük düzeltmesi: tamlık (coverage) + "in range" ≠ "compliance" · 2026-06-28
Operatör gerçek bir kusur yakaladı: Haziran'da 1 log girilince rapor "%100 compliance · full compliance" diyordu. Dış-kaynak araştırması ([envigilance](https://envigilance.com/temperature-monitoring/temperature-compliance/), [securvo](https://securvo.com/resources/haccp-temperature-logging-guide), [paddl](https://paddl-ai.co/haccp/monitoring/temperature-logs), [FDA](https://www.fda.gov/food/hazard-analysis-critical-control-point-haccp/haccp-principles-application-guidelines)) bunu doğruladı: denetçinin baktığı **tamlık** (kayıt boşluğu), kayıtlı-okumaların geçme oranı değil — *"kayıtlardaki boşluklar, belgelenmiş düzeltici-eylemli aralık-dışı okumalardan HACCP güvenilirliğine DAHA çok zarar verir."* Üç defekt giderildi:
- **"Compliance" → "Readings in range".** Metrik artık dürüst: *kayıtlı* okumaların geçme oranı (uyum DEĞİL). Yeşil "full compliance" bandı → "Kayıtlı okumalarda aralık-dışı yok."
- **YENİ — Günlük-log kapsaması (completeness).** Günlük-zorunlu sıcaklık logu için **"N/M gün loglandı"** stat'ı + kapsama <%90 ise **amber boşluk uyarısı** ("eksik kayıt en büyük denetim riski"). 30 günde 1 log artık "%100" değil, **"1/28 gün · boşluk var"** olarak görünür. Renk: ≥%90 yeşil · ≥%50 amber · altı kırmızı.
- **Event-bazlı formlar nötr.** Receiving/Cook&Cool/Holding **her gün yapılmaz** (teslimat/pişirme/bekletme olunca yapılır). 0 kayıt artık 0/0/—/— değil, gri **"İşlem kaydı yok"** — bir işletme hiç hot/cold holding yapmıyorsa bile uyumsuz gösterilmez. Altına standart açıklama notu (FDA: "işlem yoksa boş bırakma, 'işlem yok' yaz" prensibi).
- **Preview'da operatörün senaryosuyla doğrulandı:** 2 birim + 1 gün log + cooling 1 yarım satır (sadece dolu cp2h sayıldı=1 kontrol) + receiving/holding HİÇ yok → rapor: Coverage **1/28 amber** · **In range %100** (compliance değil) · gap banner · Receiving+Holding **"No activity logged"** · "full compliance" ibaresi YOK · 0 console hatası. 9 yeni i18n anahtarı + no_exceptions metni **6 dilde TAM**. `node -c` temiz.

## v2.44.99 — Inventory: Raf-ömrü/SKT + FIFO uyarısı → fire köprüsü (üçlü yükseltme #2) · 2026-06-28
Dış-kaynak araştırması ([restaurant inventory FIFO/expiry](https://foodready.ai/app/food-inventory-management-software/), [waste reduction](https://kitchennmbrs.app/en/knowledge-base/inventory-management-stock-control/why-does-fifo-reduce-food-waste-and-lower-your-food-cost)) kesin ve tutarlıydı: **son-kullanma takibi + FIFO/FEFO + bozulma uyarısı** başarmış HER gıda-envanter uygulamasının (FoodReady, Supy, Your Food App) açılış özelliği; bozulma gıda bütçesinin **%8-15'i** = en hızlı ROI. İnce marjlı solo caterer/private chef'in **her gün** kullanacağı şey. Migration yok (mevcut ingredient/inventory alanı).
- **YENİ — Raf-ömrü (ingredient) + son-kullanma tarihi (inventory).** Malzeme editörüne opsiyonel **raf ömrü (gün)**; envanter editörüne **son-kullanma tarihi**. Mal kabulde (`applyStockAdditions`) raf ömründen **otomatik SKT** hesaplanır (her tazelenmede sıfırlanır — tek-lot FIFO; çok-lot kurumsal aşırılık, bu niş için gereksiz).
- **YENİ — Bozulma uyarıları.** Stoğu olan kalemler için: liste satırında **"Süresi geçti" (kırmızı) / "{n}g içinde kullan" (amber)** badge'i, envanterde **"Bozulacak" stat'ı** (yalnız >0'da görünür — clutter yok), dashboard'da **"{n} ürün yakında bozulacak/süresi geçti"** kartı (CTA → envanter). Eşik: ≤3 gün.
- **YENİ — Fire köprüsü.** Süresi geçen/yaklaşan kalemin editöründe **"Fire yaz & stoktan düş"** → waste tablosuna `spoilage` kaydı (waste aracının yazdığı şekille birebir) + **paylaşılan `applyStockDeductions` sözleşmesiyle** stok düşülür. Tek tıkla bozulma → kayıtlı fire + güncel stok.
- **Mantık tek yerde.** `expiryInfo`/`expiringSummary` inventory'de; dashboard `PCD.tools.inventory.expiringSummary()` çağırır (tarih matematiği kopyalanmaz). Stok yoksa SKT uyarısı YOK (bozulacak bir şey yok).
- **Preview'da uçtan uca doğrulandı:** mal kabul → otomatik SKT (raf 2g→bugün+2 'soon'; raf 10g→bugün+10 **işaretlenmez**); açık geçmiş tarih→'expired'; `expiringSummary` soon=1/expired=1 (raf-10 doğru hariç); liste badge + stat "Expiring 2" + dashboard kartı + fire köprüsü (3kg spoilage kaydı + stok 3→0) · 0 console hatası. 16 i18n anahtarı **6 dilde TAM**. Tüm syntax `node -c` temiz.
- **Bilinçli HARİÇ (niş kullanmıyor — şişirme değil):** stok hareket defteri/denetim izi (MarketMan/MarginEdge kurumsal katmanı), tedarikçi-ID göçü (görünmez iç sağlamlık), pack-size/lead-time/çok-tedarikçi fiyatı. Gerçek talep + başarmış uygulama referansı olmayan hiçbir şey eklenmedi.

## v2.44.98 — Inventory: İş-bazlı Market/Alışveriş Listesi (üçlü yükseltme #1) · 2026-06-28
Inventory + Ingredients + Suppliers üçlüsünü $19 pro seviyesine çıkarma fazının ilk parçası. Dış-kaynak araştırması ([catering inventory](https://restaurantinventorymanagementsoftware.com/blog/catering-inventory-software-2025), [personal chef workflow](https://www.deelo.ai/blog/best-personal-chef-business-software-2026)) hedef nişin (caterer + private chef) **en çok istediği** şeyi gösterdi: iş/etkinlik başına **konsolide market listesi** ("finalize the grocery list before shopping"). Par-temelli "tedarikçiye sipariş"ten AYRI, talep-temelli bir çıktı eklendi.
- **YENİ — Shopping list (inventory header).** Yaklaşan **event**'leri (14 gün içi otomatik seçili) + seçili **buffet**'leri ingredient seviyesinde **konsolide eder** → mevcut stoğu **düşer** → kalanı **kategoriye (market reyonu) veya tedarikçiye** göre gruplar. Tahmini toplam maliyet + "zaten stokta" sayacı. Deep Pine A4 **yazdır** (onay kutucuklu liste + watermark gate) + **paylaş** (WhatsApp/pano metni). *Stoğu DÜŞMEZ — sadece ihtiyaç hesaplar; düşüm yine "Deduct stock" butonlarında.*
- **Mantık kopyalanmadı.** Her aracın KENDİ motoru çağrılır: `events.computeEventDeductions` + `buffet.computeBuffetDeductions` (ikisi de `{deductions, skipped}` döndürür; sub-recipe flatten + birim dönüşümü + dönüşemeyen-atlama içlerinde). Lazy araçlar `PCD.router.loadLazyTool` ile talep üzerine yüklenir → grid ile rapor asla çelişmez.
- **Paylaşılan stok sözleşmesi KORUNDU** — `applyStockDeductions/Additions` imzası/davranışı değişmedi; 5 tüketici akış (event/buffet/waste/sales/receiving) etkilenmedi.
- **Preview'da uçtan uca doğrulandı:** seed (3 malzeme + tarif servings 4 + 40 kişilik event + stok) → liste **2 alınacak** (chicken 5kg = 10 ihtiyaç−5 stok · oil 1l) · **1 stokta** (rice, 20 stok kapsadı) · **≈$46** (5×8+1×6) · kategoriye gruplu (Oils/Poultry) · print HTML tam · 0 console hatası.
- 27 yeni i18n anahtarı **6 dilde TAM** (kullanılan=tanımlı, simetrik). Yan-düzeltme: HACCP Audit Pack + bu rapor tarih lokalizasyonu `PCD.i18n.getLocale()` (yok → hep 'en') yerine doğru `PCD.i18n.currentLocale` kullanır. Tüm syntax `node -c` temiz.
- **Sıradaki (operatör onayı bekliyor — talimatın "onay zorunlu" maddesi):** stok hareket defteri + geri al (yeni sync tablo = migration/RLS) · tedarikçi bağı ID'ye (veri göçü). Onaysız ilerlenebilen: raf-ömrü/SKT → fire köprüsü (mevcut ingredient alanı, migration yok).

## v2.44.97 — HACCP Audit Pack: 4 formu tek denetime-hazır rapora birleştir · 2026-06-28
HACCP araçları kod seviyesinde incelendi — pass/fail flag + düzeltici-eylem (corrective) alanı + form-başı print ZATEN olgundu. Gerçek boşluk: denetçi **tek belge** ister, ama 4 form AYRI basılıyordu + açık-CAPA takibi yoktu. Formlara DOKUNULMADAN (şema/sync değişikliği yok), salt-okunur aggregator eklendi:
- **YENİ — Audit Pack (birleşik aylık rapor).** HACCP hub'ında ay seçici + "Denetim raporu oluştur" + canlı özet (kontrol/uyum%/açık-CAPA). Tek A4 PDF: **özet bandı** (sıcaklık kontrolü · uyum% · aralık-dışı · açık düzeltici eylem) + **forma göre kayıtlar tablosu** (Daily Temp/Cook&Cool/Receiving/Hot-Cold Holding × kontrol/geçer/aralık-dışı/uyum%) + **düzeltici-eylem günlüğü** (her aralık-dışı olay: tarih·alan·öğe·okuma·limit·düzeltici·durum·kaydeden) + imza satırı. Denetçinin tam istediği belge.
- **YENİ — Açık-CAPA takibi (şema değişikliği olmadan).** Aralık-dışı + düzeltici-eylem notu BOŞ = **OPEN** (kırmızı çip); notu dolu = **Documented** (yeşil). Özet "açık eylem" sayısını gösterir → "denetimden önce şunları kapat" listesi.
- **Hesap = formlarla birebir.** Pass/fail aynı bölge eşiklerini (`PCD.haccp.getThresholds()`) + logs'un kendi birim min/max'ını kullanır (yeniden türetme yok → grid'de görünenle rapor asla çelişmez). 4 formun `listTable()` API'siyle salt-okunur toplanır.
- Deep Pine (#16433a + Fraunces) · @page A4 margin 0 · `PCD.print` otomatik watermark gate (Free footer / Pro temiz). 46 yeni i18n anahtarı **6 dilde TAM** (kullanılan=tanımlı=46, simetrik). Tüm syntax `node -c` temiz.
- **Preview'da uçtan uca doğrulandı:** 6 form-kaydı seed → rapor **7 kontrol · 42.9% uyum · 4 aralık-dışı · 2 açık CAPA** (el hesabıyla birebir) · 4 form ayrı satır · OPEN/Documented chip'leri · corrective metinleri · boş-ay → toast (print yok) · 0 console hatası. Ekran görüntüsüyle teyit.
- **Yan-düzeltme — hub "bugün" sayacı.** Aggregator'ı kurarken bulundu: hub status hero'su logs için `haccpLogs` (gerçek kayıt tablosu `haccpReadings`) ve cooling için `haccpCooling` (gerçek tablo `haccpCookCool`) okuyordu → bu iki form için bugün-sayacı hep 0 görünüyordu. Doğru tablolara çevrildi (try/catch'li, düşük risk). Artık "X/4 form bugün kaydedildi" hero'su logs+cooling'i doğru sayar.
- **Bilerek YAPILMADI (gerekçeli):** (1) **Foto kanıt** — her forma per-record foto alanı = 4 dosya + yeni sync kolonu + Storage upload (yüksek risk, sync mantığı); HACCP denetim klasörü standardı foto değil sıcaklık+CAPA+imza. (2) **Rapora dijital imza pad'i** — iç denetim klasörü fiziksel basılıp elle imzalanır; rapordaki **basılı imza satırı** standardı karşılar (dijital pad redundant; client-facing event teklifinde zaten var). (3) **Temizlik takvimi** — ayrı araç kapsamı, opsiyonel. (4) **Hatırlatma/overdue** — dashboard günlük-sıcaklık "bugün eksik" kartı (v2.44.83) en kritik forma zaten kurulu; cooling/receiving/holding olay-bazlı (günlük kadans yok).

## v2.44.95 — Çıktı denetimi: buffet cost report/prep list/Excel pro seviye + i18n bütünlük teyidi · 2026-06-27
- **Çıktılar yeni metrikleri taşıyor.** Buffet **Cost Report** (print + simple/detailed önizleme): atık stat'ı artık **atık% + 15-25 benchmark renk**; özetin altına **forecast + atık benchmark + batch/holding (HACCP)** bilgi şeridi. **Prep List** (mutfak A4): forecast + **batch/replenishment + bekletme** rehber şeridi. **Excel**: özet'e atık% + forecast% satırı (Deep Pine başlık + watermark gate korunur).
- **i18n bütünlük denetimi (şüpheci, kod seviyesinde).** Event+buffet kapsamındaki **287 anahtar 6 dilde de TAM** (0 eksik); kodda kullanılan TÜM literal key'ler en.js'te tanımlı → **ham-key ("_") sızıntısı YOK**. Operatörün gördüğü "_" isimleri = tarayıcı eski en.js cache'i (kesin teşhis); push + hard-refresh + savunmacı `L(key,fb)` ile çözüldü.
- **Tutarlılık:** event + buffet çıktıları aynı pro dil — Deep Pine (#16433a + Fraunces) · @page A4 margin 0 · `showWatermark()` gate (Free footer / Pro temiz). PDF kaydet = tarayıcı print diyaloğu (aynı HTML). Tüm syntax `node -c` temiz.
- **Not:** preview tarayıcısı bu oturumda `/app/`'i tutamadı (altyapı); canlı re-screenshot yapılamadı. Çekirdek özellikler v2.44.94'te canlı doğrulanmıştı; bu sürümün eklemeleri doğrulanmış `computeBuffetTotals` alanlarını + editörde render'ı teyit edilmiş string'leri yeniden kullanıyor.

## v2.44.94 — Buffet forecast/atık-benchmark + 5 event düzeltmesi · 2026-06-26
Buffet sektör araştırması ([Kitchen CUT](https://kitchencut.com/buffet-analysis/), [Metafoodx](https://www.metafoodx.com/post/how-buffet-operations-in-hotels-can-reduce-food-waste-efficiently), [FoodSight](https://foodsight.com/blog/hotel-buffet-waste-reduction/), [kitchennmbrs](https://kitchennmbrs.app/en/knowledge-base/food-waste-as-a-financial-system/how-do-i-calculate-waste-costs-at-a-buffet-compared-to-a-la-carte)) referansıyla. Mevcut güçlü motor (P&L, food-cost% benchmark, prep list + cost report, envanter düşümü, 3-yollu öğe) KORUNDU; gerçek eksikler eklendi:
- **YENİ — Forecast prep faktörü:** "beklenenin %X'i için hazırla, gerisini taze yetiştir" (araştırma: doğru tahmin overproduction'ı %40↓). Prep miktarları + maliyet + envanter düşümü + alışveriş listesi forecast'la ölçeklenir; tüketim beklentisi değişmez; prep<tüketim ise "shortfall" uyarısı. Editör: Forecast % + Servis süresi (s) alanları.
- **YENİ — Atık% benchmark (15-25%):** food-cost%'ten AYRI buffet-spesifik metrik. Toplam atık% renk kodlu (yeşil <%15 · amber %15-25 · kırmızı >%25). Özet barda: forecast satırı + atık benchmark + **batch/replenishment planı** (süreye göre N küçük parti → taze hat + kısa bekletme/HACCP) + shortfall.
- **İstasyon kartı çerçevesi** belirginleşti (2px frame + 5px renkli sol-aksan).
- **EVENT düzeltmeleri (5):** **(A)** Staffing/Charges dar sayı inputları genişledi + wrap (rakamlar okunur). **(B)** Ham i18n key sızıntısı: kök neden = tarayıcı cache (key'ler doğru, doğrulandı); savunmacı `L(key,fb)` helper ile görünür string'ler stale-cache'te bile ham-key sızdırmaz. **(C)** Çift print kaldırıldı (editör içi "Print preview" iframe silindi; footer BEO print kaldı). **(D)** Function kartı kalın/koyu çerçeve (2px brand + dolu #N badge + header ayraç). **(E)** Durum filtre çipleri artık TÜM durumları gösteriyor (Draft·Tentative·Confirmed·Done·Cancelled, 0 olsa bile).
- Preview doğrulandı: forecast %50→"40 of 80" prep · atık/batch satırları · station+function 2px frame · 6 durum çipi · 0 ham-key · 0 console hatası. 8 yeni buffet i18n anahtarı 6 dile. **Bilerek yapılmadı:** buffet 3-sekmeli picker (kendi 3-yollu recipe/ingredient/custom öğe seçici akışı zaten var — redundant olurdu).

## v2.44.93 — Events: takvim görünümü + e-imza · 2026-06-26
- **YENİ — Aylık takvim görünümü.** Events başlığında **Liste / Takvim** geçişi. Takvim: Pazartesi-başlangıç ay ızgarası · etkinlik çipleri (saat + ad, durum rengiyle) · bugün vurgulu · ‹ › ay gezinme + "Bugün" · çipe tıkla → editör açılır. Durum filtresi çipleri takvime de uygulanır. (Araştırmadaki "haftalık görünüm yetersiz" şikayetini kapatır.) Tam frontend, backend yok.
- **YENİ — E-imza (client-side).** Editörde "Müşteri onayı" bölümü → **İmza al**: canvas imza pad'i (fare + dokunma/tablet) + imzalayan adı + temizle. Kaydedince `signature` (PNG data-URL + imzalayan + tarih) etkinliğe yazılır, editörde gösterilir ve **müşteri teklifi çıktısına gömülür** (boş imza satırı yerine gerçek imza + ad + tarih). Toplantıda tablette onay → CaterCamp/Tripleseat'in "online approve" karşılığının yerel/offline versiyonu.
- **Kat planı (floor-plan) bilerek YAPILMADI:** görsel sürükle-bırak CAD editörü = devasa efor + front-of-house odaklı (mutfak ICP'sine en uzak özellik); fonksiyon "salon" + notlar kurulum referansını zaten veriyor. Yanlış yatırım — atlandı.
- Preview'da doğrulandı: takvim (June 2026 · Pzt-Paz · "19:00 Degustation Dinner" çipi · ay nav · çip→editör) · imza (çizim→PNG→"Signed by: Jane Client · Jun 26") · 0 console hatası. 10 yeni i18n anahtarı 6 dile.

## v2.44.92 — FIX: par=0 malzeme "untracked" sayılır (yanlış kırmızı/sipariş) · 2026-06-26
- **Bug:** Bir malzemenin **par seviyesi 0** yazılınca (girilmemiş `null` değil), `computeStatus` "takip ediliyor" dalına girip stok 0'da **'out' (kırmızı)** döndürüyordu → kullanıcı par+min'i sıfırlasa bile kalem kırmızı kalıyor, "Generate Order" rozetinde ve "Need reorder" listesinde sayılıyordu.
- **Kök neden:** `if (invRow.parLevel == null)` yalnız `null`'ı untracked sayıyordu; elle yazılan `0` sayı olduğu için tracked dalına düşüp `if (stock <= 0) return 'out'` tetikliyordu.
- **Çözüm:** **par VE min ikisi de ≤0 = eşik yok = takip edilmiyor → 'untracked'** (gri "—", uyarı/sipariş YOK). Negatif stok yine 'out' (fazla-tüketim sinyali korunur). `min>0` ayrı eşik olarak çalışmaya devam eder (par=0, min=20 → stok 0'da hâlâ kritik — kasıtlı). Preview'da 5 senaryo doğrulandı (par0/min0/stok0→untracked · par10/stok0→out · min20/stok5→critical · negatif→out · normal→ok). Not: "⚠ 129" rozeti AYRI bir şey = tedarikçisi atanmamış malzeme sayısı (bu bug'la ilgisiz).

## v2.44.91 — Events PRO: tam kapasite etkinlik aracı · 2026-06-26
Sektör araştırması (Tripleseat · Caterease · Total Party Planner · CaterCamp · Planning Pod + BEO standardı: Amadeus/Cvent/Mews + gerçek kullanıcı eksik-özellik talepleri) referans alınarak eksik pro katmanlar eklendi.
- **YENİ — Kalemli ek ücretler (içecek/kiralama/AV/diğer):** her kalem **maliyet** (sen ödersin) + **fiyat** (müşteri öder). P&L'e tam yansır (yemek + işçilik + ek-kalem maliyeti; ciro + ek-kalem fiyatı).
- **YENİ — Ödeme planı:** depozito + taksitler, vade tarihleri + "ödendi" işareti → **ödenen / kalan bakiye** otomatik. Eski tek-depozito buna göç eder.
- **YENİ — Run-of-show (zaman çizelgesi):** kurulum → servis → toplama; BEO'da kronolojik basılır.
- **YENİ — Görev/checklist:** geri sayım listesi (tadım, son sayı, kiralama) + done oranı; liste kartında rozet.
- **YENİ — Müşteri teklifi (client-facing):** ayrı yazdırılır — kalemli fiyat + ödeme planı + şartlar + **imza satırları**. İç maliyet/kâr GÖSTERMEZ (rakiplerin "proposal" çekirdeği).
- **YENİ — Satış hattı + liste:** durum +`tentative` (opsiyon) · liste **durum filtre çipleri** (sayılı) + **Yaklaşan/Geçmiş** gruplama + bakiye/görev çipleri.
- **BEO zenginleşti:** run-of-show + ek ücretler bölümleri + gelir kalemlendirme (yemek/extras/servis) + ödenen/bakiye satırları.
- **ProChefDesk avantajı:** kullanıcıların pro araçlarda "eksik" dediği gerçek tarif/maliyet/envanter/dietary/HACCP ZATEN var. Preview'da uçtan uca doğrulandı (Food $4.800 + Extras +$200 = $5.000 · Paid −$500 · Balance $4.500 · BEO + breakdown + filtre/gruplama · 0 console hatası). 36 yeni i18n anahtarı 6 dile. **Not:** save guest modunda auth ister (üyede çalışır; yeni alanlar functions/staffing ile aynı kanaldan kalıcı/sync).

## v2.44.90 — Events Faz 4: işçilik maliyeti + dashboard zaman çizelgesi · 2026-06-26
- **YENİ — Etkinlik işçilik maliyeti (gerçek P&L = yemek + işçilik).** Editörde katlanır "Personel & işçilik" bölümü: rol satırları (rol × kişi × saat × ücret). `computeStats` artık `laborCost` + `grandTotal` (yemek+işçilik) döndürüyor; **kâr/marj grandTotal'a göre** — catering kârının yarısı işçilik, eskiden hiç hesaba katılmıyordu. Özet kutusu (Labor cost · Total cost), BEO çıktısı (Staffing tablosu + Labor/Total satırları) ve paylaşım metni güncellendi. **Geriye-uyumlu:** staffing yoksa profit eskisi gibi (yemek). Preview'da doğrulandı: Waiter 4×6h×$25=$600 · food $979.51 + labor $600 = $1.579,51 · kâr %80→%67.
- **YENİ — Dashboard sonraki-etkinlik fonksiyon zaman çizelgesi.** Çok-fonksiyonlu etkinlik kartı artık fonksiyon saatlerini gösteriyor: "🕐 Reception 18:00 · Dinner 20:00". Tek fonksiyonlu/düz etkinlikler değişmedi. (Dashboard↔Events bağlantısı zaten vardı — kart + yaklaşan-widget; bu sadece çok-fonksiyon timeline'ını ekledi.)
- **Tarafsız not:** Faz 4'ün diğer iki kalemi (Buffet büfe-fonksiyon · HACCP banquet) düşük değer/yüksek efor görüldü ve **bilerek yapılmadı** — büfe-tipi kalem zaten ingredient/recipe olarak fonksiyona eklenebiliyor, HACCP ayrı loglanıyor. 11 yeni i18n anahtarı 6 dile.

## v2.44.89 — Events Faz 3: garanti kişi + fiyat kırılımı · 2026-06-26
- **YENİ — Fonksiyon-başı garanti kişi sayısı.** Her fonksiyonda "Garanti" alanı (beklenenin yanında). Faturalama bazı = **max(garanti, beklenen)** — garanti minimumdur, daha çok gelirse fazlası faturalanır. Üretim/maliyet hâlâ beklenen kişiye göre (pişirilen sayı).
- **YENİ — Fiyat kırılımı.** Etkinlik seviyesinde **Servis ücreti %** + **Depozito** alanları. Özet: ara toplam (faturalanan × kişi-başı) · servis ücreti (+%) · toplam ciro · depozito (−) · **kalan bakiye**. Editörde tek satır özet + BEO çıktısında tam satırlar + paylaşım metni.
- Preview'da doğrulandı: garanti 45 (beklenen 40 → faturalanan 45) · ara toplam $5.400 · servis %10 +$540 · toplam $5.940 · depozito −$1.000 · bakiye $4.940 · 0 console hatası. 7 yeni i18n anahtarı 6 dile.

## v2.44.88 — Events: ingredient öğeleri + 3 sekmeli seçici · 2026-06-26
- **YENİ — Picker'a opsiyonel sekme desteği (paylaşılan bileşen, geriye-uyumlu).** `picker.js` artık `tabs` seçeneği alıyor → segmented sekme barı + sekmeye göre filtre. Sekme verilmezse eski grup davranışı (recipes/buffet/prep etkilenmedi — doğrulandı).
- **YENİ — Etkinliğe doğrudan malzeme (ingredient) ekleme.** "Add dishes" → **"Add item"**; seçici 3 sekme: **Menu items · Sub-recipes · Ingredients**. Fonksiyon menüsü artık tarif `{recipeId,portionsPerGuest}` VEYA malzeme `{ingredientId,amountPerGuest,unit}` tutuyor (su/ekmek/şişe su gibi tarif olmayan kalemler için). Malzeme maliyeti Buffet ile aynı model (birim fiyat × yield × kişi-başı miktar, birim çevrili). Varsayılan kişi-başı: gram/ml=100, adet=1.
- **Tüm yollar iki tipi işler:** maliyet (`itemFoodCost` tek nokta) · stok düşümü · konsolide alışveriş listesi · menü alerjen özeti · editör kartı · BEO/print · paylaşım. Preview'da doğrulandı: 3 sekme (17 dish · 59 ingredient) · Brown onion 100g/kişi × 40 = 4000g = $12 hem ekranda hem print'te · düşüm 50×200=10000g · 0 console hatası. 4 yeni i18n anahtarı 6 dile.

## v2.44.87 — Events Faz 2: diyet & alerjen katmanı · 2026-06-26
- **YENİ — Fonksiyon-başı diyet sayıları (client'tan, manuel).** Her fonksiyonda 5 sayaç: Vejetaryen · Vegan · Glutensiz · Sütsüz · Kuruyemiş alerjisi + serbest not ("2 kabuklu deniz alerjisi, 1 helal"). Mutfak üretimi için kritik bilgi — BEO standardının çekirdek parçası. Editörde katlanır bölüm (veri varsa açık + rozet).
- **YENİ — Menü alerjenleri otomatik özeti.** Her fonksiyonun menüsündeki alerjenler (tariflerdeki manuel etiketlerden, sub-recipe cascade'li) "Menü içeriği: 🥛 Dairy 🥚 Eggs" olarak otomatik gösterilir — editörde + çıktıda. Alerjen adı = ikon + İngilizce key (uygulama geneliyle tutarlı). Güvenlik amaçlı, salt-okunur.
- **Çıktı:** diyet + alerjen satırları hem BEO bloklarında (fonksiyon-başı) hem eski tek-fonksiyon düzeninde basılır + paylaşım metnine eklendi. Diyet düzenlemesi maliyeti etkilemediği için re-render tetiklemez (bölüm açık + odak korunur). 8 yeni i18n anahtarı 6 dile. Preview'da doğrulandı (oto-alerjen Dairy/Eggs · diyet 5 Vegetarian + not · 0 console hatası).

## v2.44.86 — Events Faz 1: çok-fonksiyon (BEO) · 2026-06-26
- **YENİ — Bir etkinlik artık birden çok fonksiyon içerebilir (karşılama 18:00 · yemek 20:00 · gece 23:00).** Her fonksiyon kendi adı, tarihi, başlangıç/bitiş saati, salonu, kişi sayısı ve menüsüyle. Otel/banquet sektöründeki **BEO (Banquet Event Order)** mantığı — eski araç tek set-menü/tek saatti. Editör: müşteri/firma + ilgili kişi + telefon alanları (üst seviye) + "Fonksiyon ekle" ile sınırsız fonksiyon; her fonksiyonda ayrı tarif seçici + maliyet.
- **Hesaplama:** maliyet fonksiyonlar boyunca **toplanır** (her fonksiyon için ayrı üretim); ciro = kişi-başı × **katılımcı** (fonksiyonların en büyüğü ≈ benzersiz kişi, TOPLANMAZ). Stok düşümü + alışveriş listesi tüm fonksiyonları konsolide eder.
- **Çıktı:** çok-fonksiyonlu etkinlik **BEO bölümleri** halinde basılır (#1, #2… her biri saat/salon/kişi + kendi menü tablosu); tek isimsiz fonksiyon eski temiz düzeni korur (regresyon yok). Print/PDF/paylaşım/canlı önizleme aynı motoru kullanır.
- **Geriye-uyumlu:** eski düz etkinlikler (date/time/guestCount/menu) açılışta tek fonksiyona göç eder, birebir aynı hesaplanır; kaydedince liste/sıralama için temsilî düz alanlar aynalanır. 14 yeni i18n anahtarı 6 dile. Uçtan uca preview'da doğrulandı (2 fonksiyon = 2× düşüm · ciro doğru · 0 console hatası).

## v2.44.63 — Tedarikçi→envanter köprüsü + Recipes select-all kategori uyumu · 2026-06-24
- **YENİ — "Geldi → stoğa ekle" köprüsü (tedarikçi → envanter, opsiyonel/manuel).** Gönderilen sipariş artık yapısal kalemleri (ad/miktar/birim) history'e gömüyor (`recordOrder`). Order history'de her siparişin altında **"Add to stock"** butonu: açılır → siparişteki kalemlerden **isimle eşleşen** envanter malzemeleri checklist (varsayılan açık) + **düzenlenebilir miktar** (kısmi teslim) gösterir → onayla → `applyStockAdditions` ile stok artar (birim `convertUnit` ile çevrilir; stok yoksa tracked satır yaratır = receiving takip başlatır). Eşleşmeyen kalem "atlandı" der. Çift-ekleme koruması: `o.receivedAt` → sonra "✓ Stoğa eklendi" rozeti. **Gönderme akışı değişmedi** (hız korundu); köprü opsiyonel. Eski kayıtlarda mesaj parse fallback'i. 8 `sup_*` anahtarı 6 dile çevrildi. Uçtan uca doğrulandı (Brown onion 0→7, receivedAt set).
- **FIX — Recipes select-all artık aktif sekmeye uyuyor.** Menu sekmesi açıkken "tümünü seç" TÜM tarifleri (67, prep'ler dahil) seçiyordu. Sebep: `currentShown` yalnız metin süzüyordu, sekme/etiket değil. Çözüm: ortak `computeVisible()` (arama+sekme+etiket) → liste, select-all ve bulk bar AYNI seti kullanır. Sekme değişince `selAll`/sayaç da tazelenir. Doğrulandı: Menu→tümünü seç=25 (28 değil); Preps/All'da selAll doğru durum.

## v2.44.62 — Recipes Select modu sızıntısı düzeltildi · 2026-06-24
- **Bug:** Recipes'te Select moduna girip (seçili/seçimsiz) başka araca geçip dönünce checkbox'lar kalıyordu ama bulk araç çubuğu (X selected / Cost Report / Convert / Delete / Cancel) gidiyordu → yarım/bozuk durum. Sebep: `selectMode`/`selectedIds` modül-seviyesindeydi, navigasyonda sürüyordu; `renderList` re-render'da checkbox'ları çiziyor ama bulkBar `display:none` default'ta kalıyordu (refresh yalnız event'le çağrılıyordu).
- **Çözüm:** `renderList` başında `selectMode=false; selectedIds=new Set()` → liste her taze render'da (navigasyon dönüşü dahil) temiz. İç repaint'ler (arama/sort/tab/tag) `paint()` kullanır, etkilenmez. Doğrulandı: select+sort modu KORUYOR · araç değiştir+dön TEMİZ (0 checkbox/bar) · 0 console hatası.

## v2.44.61 — Record sales: kategori filtresi · 2026-06-24
- **Record sales modal'ına segmented kategori filtresi** eklendi: **Menu items** (default) · **Preps** · **All**. Önceden tüm tarifler (prep'ler + menu item'lar) karışık listeleniyordu; satılan şey menu item, prep'ler zaten tüketim cascade'iyle otomatik düşüyor → varsayılan yalnız menu item'ları gösteriyor. `PCD.recipes.isPrep` ile ayrım (Menu Engineering/Allergen/Cost Report ile aynı sınıflandırıcı). Metin arama ile birleşik çalışır; hiç dish yoksa otomatik "All"a düşer. Yeni etiketler `inv_cat_dishes`/`inv_cat_preps` 6 dile çevrildi (`all` mevcut). Preview'da doğrulandı (25 dish / 3 prep · default prep'leri gizliyor · 0 console hatası).

## v2.44.59–.60 — i18n: yeni etiketler 5 dile + sızıntı denetimi · 2026-06-23
- **v2.44.60 — Denetim sonrası kapatma.** Tüm oturum-içi yeni metinler kod seviyesinde tarandı: Menü Mühendisliği/Satış kaydet/Recipe import/Batch UI'si 5 dilde TAM (0 eksik). Ek bulgular: (a) Excel şablonu 2 kozmetik sayfa başlığı (`ri_xlsx_title` "Tarif Şablonu" + `ri_xlsx_lists_title` "Geçerli değerler") çevrildi — alt-açıklamalarla tutarlı; (b) **eski** (v2.8.2) `bulkCostReport` butonundaki ham `Cost Report` → `t('btn_cost_report')` ile çevrildi. **Kasıtlı İngilizce kalan tek şey:** import dosya formatı (sütun başlıkları Recipe/Type/Ingredient + `dish`/`prep`/`cat_*` token + örnek satırlar) — parser bunları eşleştiriyor, çeviri import'u bozardı.
- Bu oturumda eklenen İngilizce etiketler (Menü Mühendisliği `me_*` · Satış kaydet `inv_*` · Recipe import `ri_*` · `tab_menu_eng` · Batch adı/portion override) **tr/es/fr/de/ar**'a çevrildi. Her dilin sonuna tek `register` bloğu (MERGE); portion anahtarları (tab_portion/portion_title/portion_desc/pc_subtitle) override edildi.
- **Batch** ürün adı tüm dillerde İngilizce korundu (sekme "Batch"); başlık yerelleştirildi (Batch Hesaplayıcı / Calculadora Batch / Calculateur Batch / Batch-Rechner / حاسبة الدفعات). Çeyrek etiketleri yerel (Yıldız/İş Atı/Bilmece/Köpek · Estrella/… · Star/Arbeitspferd/Rätsel/Ladenhüter · نجم/…). `import_*` zaten 6 dilde vardı (dokunulmadı). en.js'te `me_*`/`ri_*` L() fallback ile İngilizce kalıyor (tasarım). `{nr}`/`{ni}` placeholder + `prep`/`dish`/`Lists` literal değerleri korundu. **5 dil canlı preview'da doğrulandı** (raw key/fallback sızıntısı yok).

## v2.44.57–.58 — Sub-nav sırası + Portion → Batch · 2026-06-23
- **v2.44.57 — Menu engineering Recipes'in yanına.** Recipes sub-nav sırası: Recipes · **Menu engineering** · Nutrition · Batch (önce sondaydı).
- **v2.44.58 — "Portion" → "Batch" yeniden adlandırma.** Araç gerçekte recipe/sub-recipe'yi N'e ölçekleyip toplam malzeme + maliyet veriyor (porsiyon değil). Sekme `Batch`, başlık `Batch Calculator`, alt-açıklama "Scale any recipe or sub-recipe to the quantity you need — total ingredients + cost". **Route `portion` SABİT** (bookmark/link güvenli). en.js güncellendi; tr/es/fr/de/ar mevcut i18n-temizlik TODO'sunda (şu an eski çeviri görünür).

## v2.44.56 — Menu Engineering P&L özeti · 2026-06-23
Menünün mini P&L'i: tablonun üstüne tek özet kartı (girilen satışlardan otomatik toplanır). Takvim/geçmiş bilinçli ERTELENDİ (manuel günlük giriş disiplini şüpheli — önce şefler satışı gerçekten giriyor mu doğrula, sonra geçmiş'e yatırım yap).
- **5 metrik:** Sold (adet) · Revenue (ciro) · Food cost ($) · **Food cost %** (KPI; renk: ≤35 yeşil · ≤40 amber · >40 kırmızı) · **Profit** (yeşil/kırmızı). Fiyatsız yemekler ciro/kâr'a girmez. Satış yoksa "satış gir" ipucu.
- **Doğrulandı:** 2 dish (rev 50/60, cost 10/10) → Sold 30 · Revenue $110 · Food cost $20 · FC% 18 · Profit $90. 0 console hatası.

## v2.44.51–.55 — Recipe toplu import (Excel/CSV) · 2026-06-23
Kategori denetimi bulgusu: kurulum yükü (40-80 tarifi elle girmek) ASIL hedef kitleyi (caterer/private chef/danışman/restoran) zorluyordu. Mevcut malzeme-import desenini tariflere taşıdım (recipes.js header "Import" butonu).
- **Format:** her satır = bir malzeme satırı, aynı Recipe adı = bir tarif (`Recipe·Servings·Price·Ingredient·Amount·Unit`). CSV/TSV/XLSX dosya + yapıştır + indirilebilir CSV şablon.
- **Akıllı eşleştirme (ID yok):** malzeme isimle eşleşir (yoksa otomatik oluşur, price 0); bir ad başka bir tarif adıyla (mevcut veya aynı import) eşleşirse **sub-recipe** olarak bağlanır (iki-pass). Mevcut tarif adı → günceller (kopya değil).
- **Güvenli önizleme:** import'tan önce "X tarif (+Y yeni/↻Z güncelle) · N satır · M eşleşti · +K yeni malzeme · L sub-link · uyarılar" gösterir.
- **Kapsamlı test (preview, gerçek UI):** çok-satır gruplama · yeni/mevcut malzeme · sub-recipe (aynı+mevcut, büyük/küçük harf) · TSV · başlıksız pozisyonel · güncelleme-kopya-değil · eksik miktar→0+uyarı · eksik birim→g · $fiyat parse · cost cascade hatasız · liste+sayı güncelleme. 6 senaryo batch'i, 0 console hatası.
- **Notlar:** yeni etiketler İngilizce (L() fallback; sonra çevrilir).
- **v2.44.52 — 3 yeni sütun:** `Type` (prep/dish → isSubRecipe), `Category` (recipe.category), `Yield` ("4 portion" → yieldAmount+yieldUnit). Başlıkla isimle bulunur, pozisyonel eski 6-sütun korunur; yalnız Recipe+Ingredient zorunlu. Doğrulandı: Type=prep → prep sınıflandı + Menü Mühendisliği'nden otomatik dışlandı; dish → category set + dish kaldı; Yield→yieldAmount/Unit; önizleme "N preps" gösterir. 0 console hatası.
- **v2.44.53 — Stilize Excel template** (malzeme import paritesi). `PCD.xlsx.save` motoruyla 2-sayfalı `.xlsx`: **Recipes** (9 sütun + 6 örnek satır, kalın yeşil başlık + çerçeve) + **Lists** (geçerli Type/Category/Unit). Modal artık 2 buton: yeşil "Download Excel template (.xlsx)" + "Blank .csv". CSV örneğindeki geçersiz `cat_starter` → `cat_appetizer`/`cat_soup` düzeltildi. Doğrulandı: 2 sheet, 9 başlık, Lists doğru.
- **v2.44.54 — `PCD.xlsx` subtitle satır yüksekliği (motor fix).** Subtitle merge+wrapText ile sarılıyordu ama satır yüksekliği ayarlanmadığından metin kırpılıyordu (sıkışık). Artık toplam genişlik + metin uzunluğundan satır sayısı hesaplanıp `!rows` hpt ayarlanıyor (örn. 42pt ≈ 3 satır). **Tüm stilize Excel template'lerini düzeltir** (recipe + ingredient + cost report vb.). Doğrulandı: subtitle satırı hpt=42, wrapText korundu.
- **v2.44.55 — Fill-down (UX fix).** Eskiden 10-malzemeli tarifte her satıra tarif adı + tüm tarif-seviyesi alanları tekrar gerekiyordu (saçma). Artık tarif adı + detayları **yalnız ilk satıra**, kalan malzeme satırları **boş** bırakılır → boş Recipe satırı üstteki tarife ait olur (`current` takibi). Tekrar yazmak da çalışır (geriye uyumlu). Şablonlar + yardım metni fill-down stiline güncellendi. Doğrulandı: "FD Soup" adı 1 kez + 3 boş satır → tek tarif 4 malzeme, servings/price/category ilk satırdan; prep+yield çalışıyor.

## v2.44.46–.50 — Menü Mühendisliği + prep/yemek ayrımı · 2026-06-23
Kategori denetimi bulgusu: app food cost % gösteriyor ama "hangi yemek para kaybettiriyor"u tablo olarak vermiyordu (eski `menu_matrix` izole + elle veriydi, silinmişti). Yeni **bağlı + eyleme dönük** araç (`menu_engineering.js`, recipes sub-nav'ında yeni sekme, `grid` ikonu).
- **Veri (yeni toplama yok):** maliyet → `computeFoodCost` (sub-recipe dahil) · fiyat → `recipe.salePrice` · satış → `recipe.salesCount`. Fiyat/satış inline düzenlenir → recipe'ye yazılır (recipes tablosu zaten senkron).
- **Otomatik bağlantı:** envanter **Record sales** artık `recipe.salesCount`'u artırır → popülerlik ekseni kendiliğinden dolar (eski matrix'in yapamadığı).
- **Çıktı:** her yemek 4 kutuya → ⭐Star · 🐴Plowhorse · ❓Puzzle · 🐶Dog + kutu başına tek-cümle tavsiye + tablo (maliyet/fiyat/satış/marj/kâr + food cost %). **Maliyetin altında satılan** yemekler kırmızı + üstte uyarı bandı. "Reset period sales" ile dönem sıfırlama. Tıkla→tarifi düzenle kısayolu.
- **Test:** Soupe — maliyet $3.68, fiyat $20, sat 10 → marj $16.32 (18% fc), kâr $163.17, Plowhorse. salesCount bağlantısı 10→+5→15. 0 console hatası. Gating eklenmedi (monetization operatör kararı — istenirse plans.js).
- **v2.44.47 fix:** Sub-recipe/prep'ler (HERB LABNEH/GHEE/marinasyonlar gibi — yemeğin İÇİNDE kullanılan bileşenler) analiz listesinden çıkarıldı; yalnız satılabilir yemekler analiz edilir (`PCD.recipes.isPrep` paylaşımlı sınıflandırıcı). recipeMap TÜM tarifleri tutmaya devam eder → maliyet cascade korunur (doğrulandı: prep dışlandı, yemek + maliyeti kaldı).
- **v2.44.48 — Allergen matrisi (recipes.js) aynı düzeltme.** FOH/menü belgesi → sub-recipe/prep'ler çıkarıldı, yalnız satılabilir yemekler. Yemek allergenleri zaten sub-recipe'lerden cascade ettiği için bilgi kaybolmaz (recipeAllergens, v2.8.69 flatten). Boş kalırsa base'e düşer. Doğrulandı: PCD.print HTML'inde prep yok, yemek var.
- **v2.44.49 — Allergen print kenar boşluğu.** `body{padding:12mm → 5mm}` (@page margin:0 zaten); yatay+dikey ~14mm kazanç → daha çok satır/sütun sığar. 5mm yazıcının basamadığı kenar payı için güvenli alt sınır.
- **v2.44.50 — Header Cost Report aynı düzeltme.** Recipes başlığındaki "Cost Report" artık yalnız satılabilir yemekleri raporlar (sub-recipe/prep hariç); bir prep raporu istenirse **Select** ile elle seçilir (o yol + tek-tarif raporu dokunulmadı). Prep, kullanan yemeğin maliyet KIRILIMINDA alt-tarif satırı olarak kalır (cascade korunur). Doğrulandı: 16 tarif (1 prep+15 yemek) → rapor 15.

## v2.44.44–.45 — Envanter zinciri: buffet + satış → otomatik tüketim · 2026-06-23
Denetim bulgusu: envanter tüketimi yarımdı — yalnız Event "Deduct stock" + Order/Receiving çalışıyordu; **satış→tüketim YOK**, **buffet→envanter YOK**. İki boşluk kapatıldı (kanıtlı primitive'i yeniden kullanır: `flattenIngredients` + `applyStockDeductions`, events ile AYNI sözleşme).
- **v2.44.44 — Buffet → envanter.** Yeni `computeBuffetDeductions` (buffet.js): `buildBuffetOrder` ile AYNI miktar modeli (`prepAmount = covers × per_guest × refillX`, item override dahil; recipe kalemi flatten, ingredient kalemi direkt, custom atlanır; stok birimine normalize). Editöre **"📦 Deduct stock"** butonu (event ile aynı onaylı akış + aynı i18n). **Test:** buffet 10 kişi, sub-recipe'li recipe + ingredient item → flour 7000g, butter 2kg, envanter doğru düştü.
- **v2.44.45 — Satış → tüketim.** Envantere **"Record sales"** (inventory.js): dishes listesi + satılan adet → `computeSalesDeductions` (scale = qty/servings, flatten, stok birimine çevir) → onay → `applyStockDeductions`. **Test:** 8 Pastry sat (servings 1) → flour 4000g + butter 1.6kg, envanter 10000→6000g / 5→3.4kg doğru. 6 yeni i18n anahtarı (en.js; diğer diller en'e fallback — sonra çevrilebilir).
- **Mimari:** üç tüketim yolu (event/buffet/satış) artık AYNI `{ingredientId: amount}` sözleşmesi + tek `applyStockDeductions`. İnventory top-level senkron tablo → cihazlar-arası geçer. Hepsi manuel + onaylı (otomatik ezme yok).

## v2.44.40–.43 — Whiteboard + Kitchen Cards düzeltmeleri · 2026-06-22
- **v2.44.40 — Kitchen Cards önizleme = print.** Önizleme çerçevesindeki `padding:8mm` (print'te olmayan sahte kenar) önizlemenin kullanılabilir yüksekliğini ~16mm kısaltıyordu; `column-fill:balance` yükseklik-kısıtlı multicol'da fazlalığı 7. sütuna taşırıyordu (önizleme ≠ çıktı). `padding:0` → sheet alanı print'le birebir (yatay+dikey). Whiteboard/prep'te aynı sınıf yok (kontrol edildi).
- **v2.44.41 — STATION template temp düzeltme.** `me_station_ref` cook_sheet: CHICKEN + FISH `64°C → 74°C` (64 tavuk için güvensizdi).
- **v2.44.42 — Whiteboard hayalet-overlay bug.** Kapalı edit modalı (`​.wb-bottom-sheet`) sadece `opacity:0` ile gizleniyordu ama `pointer-events:none` yoktu → masaüstünde görünmez 560px katman canvas ortasında tıklamaları yutuyordu (renk/boyut değişiyor, blok tıklanamıyor). Fix: kapalıyken `pointer-events:none`, `.open` ile `auto` (fade korunur).
- **v2.44.43 — Edit popup'a Kaydet butonu.** Bottom-sheet altına sticky, tam genişlik yeşil "Save" (değişiklikler zaten canlı commit; buton = onayla & kapat, × ile aynı).

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
