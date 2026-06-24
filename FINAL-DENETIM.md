# ProChefDesk — FİNAL Kapsamlı Denetim (yeni oturumda çalıştır)

> Yeni bir Claude Code oturumunda: **"FINAL-DENETIM.md'yi oku ve baştan sona uygula"** de — gerisi aşağıdaki görevde.

---

GÖREV: ProChefDesk — FİNAL Kapsamlı Denetim (SALT-OKUNUR · OTONOM · KANIT-TEMELLİ)

Bu lansman öncesi SON tarama. Amaç: ürünün bağlı, tutarlı, tam ve SATIN ALINABİLİR bir
mutfak işletme sistemi olduğunu KANITLA — ya da olmayan her yeri kanıtla. Yüzeysel cevap yok.

──────────────────────────────────────────────
ROL — üç gözle birden bak, her bulguyu üçünden de değerlendir:
1) ÖDEME YAPAN OPERATÖR: maliyet/menü/uyumdan sorumlu gerçek bir şef (head chef, sorumlu
   sous, chef-owner) gibi her ekranı GERÇEK iş akışıyla kullan. "İlk açınca ne hisseder,
   nerede takılır, hangi sayı ona yanlış/mantıksız gelir?"
2) KIDEMLİ QA + YAZILIM DENETÇİSİ: kod doğruluğu, edge-case, tutarlılık, performans,
   güvenlik, senkron bütünlüğü.
3) ŞÜPHECİ ALICI: "Tüm işimi burada yönetebilir miyim ve buna $19/ay verir miyim?"

AMAÇ — iki büyük soruya kanıtla cevap ver:
A) TEKNİK BÜTÜNLÜK — ürün şu 8 kriterin her birini karşılıyor mu: (1) çalışıyor (2) iyi
   görünüyor (3) mantıklı (4) tutarlı (5) tam (6) tek bir bütün (7) bağlı (8) sistematik.
B) SATIN ALINABİLİRLİK — gerçek bir operatör tüm operasyonunu burada KAYIT/KONTROL/ORGANİZE
   edip $19/ay öder mi.
Sonda her ikisine de NET verdict ver; her iddianın arkasında SOMUT kanıt (dosya:satır veya
preview gözlemi + screenshot) olacak.

──────────────────────────────────────────────
MUTLAK KURALLAR:
- KOD/KONFİG DEĞİŞİKLİĞİ YOK. Hiçbir uygulama/kaynak/konfig dosyasını düzenleme/oluşturma/
  silme; build/push/deploy/sürüm bump YOK. Tamamen salt-okunur. (Tek istisna: en sonda
  raporu repo köküne DENETIM-RAPORU.md olarak yazabilirsin — başka HİÇBİR dosyaya dokunma.)
- BANA SORU SORMA. "Devam edeyim mi / onaylıyor musun" YOK. Otonom çalış; tüm kapsamı
  durmadan, kendi kendine, sonuna kadar bitir.
- TEORİ/VARSAYIM/"olabilir/muhtemelen/sanırım/genelde" YASAK. Yalnız kodda OKUYARAK
  (dosya:satır) veya preview'da ÜRETEREK doğruladığını yaz. İddia etmeden önce gör.
- TAHMİN YOK. Emin olmadığını önce kod + DevTools console/network ile doğrula.
- YARIDA BIRAKMA. Devasa kapsamı bir TODO listesiyle takip et, tek tek bitir.
- RAPOR KISA & KESKİN OLACAK: direkt verdict + kanıt; dolgu, övgü, pazarlama dili YOK.
  → DETAYLI ÇALIŞ, KISA YAZ. (Rapor formatı en altta.)

──────────────────────────────────────────────
YÖNTEM — her alan için ZORUNLU mod kombinasyonu:
A) KOD SEVİYESİ: gerçek dosyaları oku; mantığı uçtan uca izle; her hesabı formülle doğrula;
   edge-case türet ve kodda karşılığını ara: boş veri, 0, negatif, çok büyük sayı, eksik alan,
   birim uyuşmazlığı (g/kg/ml/adet), sıfıra bölme, eksik fiyat, sub-recipe döngüsü, separator
   satırı, çok dilli karakter, RTL.
B) PREVIEW SEVİYESİ: dev server başlat; MOBİL (375px) ve MASAÜSTÜ ayrı ayrı dolaş. Her ekranda:
   her butona/sekmeye/forma/modala bas; gerçekçi veri gir; snapshot ile doğrula; console hata=0
   ve network fail=0 mı bak; yatay taşma/kırpılma/üst üste binme ara; CSS'i inspect ile ölç;
   resize + dark mode test et; görsel kanıt için screenshot al. Mobil ve masaüstü farklarını AYRI not et.
C) FİZİKSEL OPERASYON: persona kur, tam operasyon döngüsünü HİÇBİR ADIM ATLAMADAN yürüt, her
   aşamada sayıyı (matematik) doğrula ve ekranda ne olduğunu göster.

Rota master listesi = app/js/core/app.js (TEK doğruluk kaynağı). Aşağıdaki araç/özellik
listeleri ANLIK GÖRÜNTÜdür → app.js'teki TÜM rotaları + CHANGELOG.md'deki SON sürümü esas al;
listede adı geçmeyen ama app.js/CHANGELOG'da olan her şeyi de denetle. Mimari/gotcha referansı
= CLAUDE.md + HANDOVER.md.

══════════════════════════════════════════════
KISIM 1 — TEKNİK BÜTÜNLÜK DENETİMİ (kod + preview, A+B modu)
══════════════════════════════════════════════
1.1 ARAÇLAR (hiçbirini atlama): dashboard, account/auth, inventory, suppliers, recipes +
   discover, menu_studio, buffets, events, roster, haccp (logs/cooling/receiving/holding 4
   form), whiteboard, kitchen_cards, nutrition, variance, waste, batch (eski portion),
   prep/prep sheets, stock count, checklists, menu_engineering. Şema-only olanları
   (shopping_lists, mise_plans, team) da kontrol et: route var mı, UI var mı, ölü/yetim
   bağlantı var mı.
1.1b SON EKLENEN ÖZELLİKLER (mutlaka ayrıca derinlemesine denetle — bunlar bu listeyi
   yazdıktan SONRA eklendi, kod + gerçek kullanım + i18n 6 dil):
   - Recipe toplu IMPORT (Excel/CSV: header eşleştirme, fill-down, sub-recipe linkleme,
     otomatik ingredient, Type/Category/Yield, styled .xlsx şablon).
   - Inventory "Record sales" (satış→tüketim; sub-recipe cascade; kategori filtresi
     Menu items/Preps/All) + buffet "Deduct stock".
   - Tedarikçi → envanter "GELDİ → STOĞA EKLE" köprüsü (order history'den; isimle eşleşen
     malzemeye applyStockAdditions; kısmi teslim; birim çevrimi; receivedAt çift-ekleme
     koruması; eski kayıtta mesaj-parse fallback). Gönderme akışı değişmedi — köprü opsiyonel.
   - Menü Mühendisliği aracı (Star/Plowhorse/Puzzle/Dog matrisi + P&L özet kartı).
   - "Batch" aracı (eski "Portion" — recipe/sub-recipe'yi N'e ölçekle → toplam malzeme+maliyet).
   - Recipes Select modu: navigasyonda sıfırlanır; select-all aktif sekmeye (Menu/Preps/All)
     uyar; menu-level çıktılar (Cost Report/Allergen/Menu eng.) prep'leri dışlar (isPrep).
1.2 HESAPLAR (formül + edge-case + preview'da gerçek sayıyla çapraz doğrula): tarif maliyeti
   (sub-recipe flatten + yield + birim dönüşümü + separator skip), maliyet/porsiyon, labor
   cost, menü fiyat/marj, menu engineering (Star/Plowhorse/Puzzle/Dog + P&L), büfe maliyeti
   (3 path: recipeId / ingredientId / customName + amountPerGuest porsiyon mantığı — gram
   girilirse şişme riski), variance (teorik vs gerçek), nutrition, waste, batch ölçekleme,
   roster saat/maliyet, otomatik alerjen tespiti, HACCP sıcaklık eşikleri (bölgesel).
1.3 ÇIKTILAR (her yol AYRI): print/PDF, Excel, roster JPEG, paylaşım linki (public + cost
   mode), recipe import Excel şablonu. Watermark gate'i (Free=footer / Pro=temiz) HER yolda
   mı; Deep Pine paleti tüm çıktılarda tutarlı mı; tarayıcı damgası (tarih/sayfa no) sızıyor
   mu; önizleme == çıktı mı (scale-to-fit yarışları: whiteboard/kitchen_cards/roster/menu).
1.4 ÇAPRAZ KESENLER: i18n 6 dil (en/tr/es/fr/de/ar) simetri + eksik/ham anahtar + Arapça RTL;
   plan gating (free/pro, sunucu-otoriter, frontend plan yazamaz); offline-first IDB + 3-yönlü
   sync (push/pull/realtime) bütünlüğü + drift; misafir vs üye davranışı; lazy yükleme; modal
   focus; ikon registry (eksik isim "i" fallback'i var mı).
1.5 ALTYAPI/GÜVENLİK (salt gözlem): RLS, kolon-seviyesi GRANT, Edge Functions verify_jwt,
   hCaptcha, rate-limit, foto storage akışı, CSP yokluğu etkisi.
1.6 "TEK BÜTÜN ARAÇ" TUTARLILIĞI: navigasyon (ölü link/404/boş ekran); görsel dil (palet/
   tipografi/buton/boşluk/ikon araçlar arası AYNI mı); davranış (ekle/sil/çoğalt/düzenle/
   paylaş her araçta aynı mı; data-* handler çakışması/sızıntısı); terminoloji (aynı kavram
   her yerde + 6 dilde aynı kelime mi).
1.7 REHBER / İPUCU KARTLARI ("How X works" — açılır/kapanır guide kartı, `PCD.guideCard`):
   HER araç ve alanda tek tek dolaş ve cevapla:
   - VAR MI / EKSİK Mİ: her aracın üstünde bu açıklama kartı var mı? Olması gerekip olmayan
     hangileri (özellikle son eklenenler: suppliers köprüsü, record sales, recipe import,
     menu_engineering, batch — bunların kartı/metni var mı, güncel mi)?
   - İÇERİK DOĞRU MU (aracı GERÇEKTEN kullandıktan SONRA değerlendir): kart, aracın bugün
     yaptığı işi doğru anlatıyor mu? Eksik adım / yanlış-eski bilgi / artık olmayan özellik /
     yeni özelliğin hiç anılmaması var mı? (ör. "Portion" → "Batch" oldu, kart hâlâ porsiyon mu
     diyor; record sales/stoğa-ekle köprüsü kartta geçiyor mu.)
   - TUTARLILIK: kartların dili/uzunluğu/üslubu/aç-kapa davranışı (× ile kapanma, kalıcılık)
     araçlar arası AYNI mı; 6 dilde çevrili + simetrik mi; kapatınca geri geliyor mu.
   - YETERLİLİK: yeni bir şef o kartı okuyunca aracı kullanabilir mi, yoksa kart yüzeysel /
     kritik adımı atlıyor mu? Her bulgu: araç adı + kart durumu (yok / var-doğru / var-eksik /
     var-yanlış) + somut örnek.

══════════════════════════════════════════════
KISIM 2 — ENVANTER ↔ ARAÇ ZİNCİRİ (uçtan uca bağlılık, A+B+C modu)
══════════════════════════════════════════════
Tek soru: recipe / menü / event / buffet / satış / sipariş / teslim alma araçları envanterle
UÇTAN UCA, doğru ve tutarlı bağlı mı — yoksa kopuk/yarım mı? Önce KOD (inventory.js, events.js,
buffet.js, recipes/menu_studio, store.js, dashboard.js, cloud-pertable/cloud/cloud-realtime):
envanter nerede/nasıl değişiyor (düşüş/ekleme), recipe→ingredient ve sub-recipe flattening
tüketime nasıl yansıyor, generate-order + receiving akışı, cihazlar-arası senkron. Sonra
DAVRANIŞ: gerçek veriyle senaryoları çalıştır, envanter SAYILARINI gözle, matematiği doğrula
(beklenen tüketim = sub-recipe alt malzemeleri dahil + birim dönüşümü + yield).

Senaryolar:
A) Küçük restoran/günlük satış: 10 yemekli menü (bazıları sub-recipe'li), her yemek X adet
   satıldı → "Record sales" girince 1 porsiyon tüketim envanterden OTOMATİK mi düşüyor?
   Sub-recipe alt malzemeleri gerçek malzeme seviyesine inip düşüyor mu? Sayılar tutarlı mı?
B) Food truck (tek menü, yüksek hacim): aynı tüketim mantığı basit kurulumda çalışıyor mu?
C) Banket/event ve/veya buffet: yemekler+malzemeler+alt-recipe'ler eklendi → "Deduct stock"
   sonrası envanterden doğru ve tutarlı düşüyor mu?
D) Sipariş döngüsü: birkaç ürün düşük → "generate order" → miktar düzenle → tedarikçiye göre
   grupla → GÖNDER (stok değişmemeli) → TESLİM AL (stok artmalı, miktar doğru). Tedarikçi
   bağlantısı + receiving akışı var mı, tutarlı mı?
Her senaryo: TAM / KISMİ / YOK-BOZUK · otomatik mi manuel mi · matematik doğru mu · araçlar &
cihazlar arası tutarlı mı · kod (dosya:satır) + preview (gerçek sayı) kanıtı · eksikse ne gerekir.

══════════════════════════════════════════════
KISIM 3 — KATEGORİ BAZLI OPERASYON KULLANIM TESTİ (fiziksel, C modu)
══════════════════════════════════════════════
Her kategori için AYRI persona ol; GERÇEK veri kur (malzeme: fiyat/birim/yield/tedarikçi/par;
recipe: direkt + sub-recipe'li; menü/dishes; tedarikçiler; envanter sayımı; event/buffet) ve
TAM operasyon döngüsünü HİÇBİR ADIM ATLAMADAN yürüt:
1. Kurulum (workspace · malzeme kütüphanesi · recipe'ler · menü · tedarikçi · par level)
2. Envanter başlangıç sayımı
3. Operasyon→tüketim: (a) satış gir → stok düşüyor mu; (b) event/buffet → "Deduct stock"
4. Periyodik stok sayımı → teorik(düşülen) vs fiili = variance görülüyor mu
5. Düşük stok tespiti (par altı net mi)
6. Sipariş üret → miktar düzenle → tedarikçiye grupla
7. PO gönder (stok değişmemeli)
8. Teslim al (stok artmalı, miktar doğru)
9. Maliyet kontrolü (recipe cost · menü marjı · food cost % · variance · waste · menu eng.)
10. Uyum: HACCP (gerekiyorsa)
11. Çıktı: kitchen card · prep sheet · roster · cost report · order list (print/share/excel)
12. Çoklu-cihaz tutarlılığı/senkronu
13. Plan/gating: bu operatör için Free vs Pro pratikte ne demek

PERSONALAR:
Tier 1: (1) bağımsız restoran/kafe chef-owner (~40 malzeme, ~12 yemek, günlük satış)
        (2) catering (150 kişi düğün: buffet + plated, kişi-başı maliyet, prep, sipariş)
        (3) banket/function şefi (otel, 200 kişi buffet, refill, roster, prep, stok düşüş)
Tier 2: (4) food truck (~8 ürün, yüksek hacim, dar marj) (5) ghost kitchen (2 marka tek mutfak)
        (6) private/personal chef (etkinlik bazlı menü+maliyet+alerjen) (7) bakery/patisserie/
        meal-prep (AĞIR sub-recipe cascade + yield)
Tier 3: (8) bağımsız operasyonun head/sous'u (9) mutfak danışmanı/menü geliştirici (çoklu
        workspace, devir-teslim) (10) küçük grup (2-3 mekân, çoklu-workspace tutarlılık)
Her kategori verdict: "Tüm operasyonumu KAYIT/KONTROL/ORGANİZE edebiliyor muyum?" TAM/KISMİ/YOK
+ hangi aşama çalıştı/eksik (kanıtla) + "$19/ay öder mi?" net evet/hayır + tek sebep.

══════════════════════════════════════════════
KISIM 4 — "SATIN ALIR MI" BOYUTLARI (satın almayı belirleyen asıl şeyler)
══════════════════════════════════════════════
- KURULUM YÜKÜ: tüm malzeme/recipe/envanteri girmek ne kadar zahmetli? Bulk import feasible mi?
- GÜNLÜK SÜRDÜRÜLEBİLİRLİK: her gün satış/sayım girmek gerçekçi mi, yoksa 1 hafta sonra bırakır mı?
- DOĞRULUK/GÜVEN: bir tam döngüde sayılar drift ediyor mu? Karar için güvenilir mi?
- POS/MUHASEBE ENTEGRASYONU YOK → satış manuel; hangi kategoride dealbreaker?
- ÇOKLU KULLANICI/EKİP: çok personel aynı veriye erişebilir mi? Tek hesap modeli sorun mu?
- OFFLINE: mutfak wifi'si kötüyken çalışıyor mu? · MOBİL: tüm akış telefon/tablet'te çalışıyor mu?
- ÖLÇEK: 50-200 malzeme / 30-80 recipe'te performans + giriş pratik mi?
- KARAR DESTEĞİ: hangi yemek para kaybettiriyor / food cost % / fire nerede — gösteriyor mu?
- VERİ TAŞINABİLİRLİĞİ / LOCK-IN: yedek/export var mı?
- FİYAT GEREKÇESİ: $19/ay — bedava Excel'e VE $50-200 rakiplere (MarketMan/meez) göre değerli mi?
- STATUS-QUO: operatör bugün ne kullanıyor (Excel/kâğıt/hiçbir şey)? Bundan AÇIKÇA daha iyi mi?
- TEK-DOĞRULUK-KAYNAĞI: her şey gerçekten tek yerde mi, yoksa boşluklar operatörü Excel/kâğıda mı itiyor?
- DEĞER-ZAMANI: ilk gerçek faydaya (ilk maliyetli yemek, ilk sipariş) ne kadar çabuk ulaşıyor?

══════════════════════════════════════════════
KISIM 5 — GÖZDEN KAÇANLAR (bu son tarama; bunları da denetle)
══════════════════════════════════════════════
- İLK-ÇALIŞTIRMA / BOŞ DURUM / ONBOARDING: 0 veriyle yeni kullanıcı ne görüyor, ne yapacağını
  anlıyor mu? Demo seed davranışı (misafir vs üye), boş-durum ekranları, ilk-değer süresi.
- HATA & KURTARMA: kaydederken ağ koparsa / sekme kapanırsa kuyruk kalıcı mı (debounce flush);
  iki cihaz aynı kaydı düzenlerse last-write-wins doğru mu, veri sessizce kaybolur mu.
- SİLME & YETİM REFERANS: menü/büfe/event'te kullanılan tarifi/malzemeyi silince ne oluyor —
  dangling ref, çökme, "not found", sessiz yanlış hesap?
- VERİ BÜTÜNLÜĞÜ & GÖÇ: sürüm güncellemesi/migration veri kaybetmiyor; eski paylaşılan linkler
  hâlâ açılıyor mu.
- DERİN GÜVENLİK: free→pro frontend'den yükseltilebiliyor mu (sunucu-otoriter doğrula); bir
  kullanıcı başkasının verisini görebiliyor mu (RLS); public link maliyeti sızdırıyor mu;
  kullanıcı girdisinde (recipe adı, not) XSS — escapeHtml her render yolunda var mı.
- FATURALAMA UÇ DURUMLARI: checkout/portal/cancel/refund/downgrade; manuel-pro guard
  (.neq('plan_source','manual')) duruyor mu; downgrade'de free kullanıcı ne kaybeder (veri
  KALMALI, yalnız sync/pro özellikleri durmalı), webhook idempotent mi.
- ERİŞİLEBİLİRLİK & DOKUNMA: mobilde buton/dokunma hedefi yeterli mi, kontrast, klavye/focus,
  modal focus tuzağı, hCaptcha/modal scroll-lock.
- PERFORMANS & İLK YÜK: 50-200 malzeme/30-80 recipe'te akıcı mı; ilk açılış süresi; xlsx/i18n lazy.
- iOS/SAFARI GERÇEK-CİHAZ RİSKLERİ (kod denetimi + bilinen tuzaklar): kamera, share-sheet, PWA
  install, hCaptcha render, WebKit foto upload.
- PARA BİRİMİ/LOCALE BİÇİMLEME: currencySymbol, sayı formatı, Arapça RTL sayı/hizalama, tüm
  çıktılarda doğru sembol.
- YASAL/LANDING TUTARLILIK: terms/privacy (ProChefDesk LLC / USD / Delaware / US$100 cap) 6
  dilde tutarlı; landing fiyat $0/$19/$190; üründe Perth/AUD sızıntısı yok.

══════════════════════════════════════════════
TESLİM — TEK, KISA, NET RAPOR (chat + DENETIM-RAPORU.md). Madde madde, tablo tercih et,
paragraf dolgusu yok:
══════════════════════════════════════════════
1) KARAR: GO / NO-GO (lansmana hazır mı) — tek satır + en kritik 3 madde.
2) TEKNİK BÜTÜNLÜK: 8 kriterin her biri → ✅ / ⚠️ / ❌ + 3-5 kelime gerekçe.
3) SATIN ALINABİLİRLİK: 10 persona × tek satır → "alır / almaz" + tek sebep.
4) ENVANTER ZİNCİRİ: tablo → senaryo A/B/C/D → TAM/KISMİ/YOK + tek not.
5) BULGULAR: KRİTİK → ÖNEMLİ → KÜÇÜK → KOZMETİK. Her biri TEK satır:
   [önem] ne — nerede (dosya:satır / ekran) — kullanıcı etkisi. Düzeltme önerisi tek cümle,
   UYGULAMA YOK.
6) SAĞLAM ALANLAR: tek satırlık isim listesi (kanıt detayı değil — sadece "şu doğrulandı").
7) MOBİL vs MASAÜSTÜ farkları: yalnız fark varsa, kısa.

Şimdi başla; bitene kadar DURMA; sonunda yukarıdaki KISA formatta raporu sun.
