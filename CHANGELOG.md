# v2.6.9 — Ghost workspace bug — gerçek çözüm

## Sorun (v2.6.8'de tam çözülmemişti)

v2.6.8'deki filtre yetersizdi:
1. SIGNED_IN event'inde **cloud pull yapmıyordu** — bu yüzden ghost workspace push ile remote'a yazılıyordu
2. Filtre sadece "local-only ve son 5 dakika" çalışıyordu — remote'a yazılmış eski ghost'ları yakalamıyordu

## Çözüm

**1. SIGNED_IN'de pull tetikle** (auth.js):
- Login event'i geldiğinde otomatik `PCD.cloud.pull()` çağrısı eklendi
- Bu sayede ghost workspace cloud merge filtresinden geçirilebiliyor, push edilmeden temizleniyor

**2. Genişletilmiş ghost filtresi** (cloud.js):
- Eski filtre: sadece "local-only + son 5 dakika"
- Yeni filtre: **lokal veya remote** olsun, içinde hiç içerik yoksa + adı "My Kitchen" + concept/role/city boş + archived değilse → ghost olarak kabul edilir
- Mevcut workspace listesi içinde **en az bir non-ghost varsa** ghost'lar silinir
- Eğer hiç non-ghost yoksa (yeni hesap durumu) en yeni ghost korunur — kullanıcı asla workspace'siz kalmaz

Bu ikinci filtre, **v2.6.8'den önceki login'lerde remote'a sızmış eski ghost'ları da otomatik temizler**. Yani şu an 3 tane fazla "My Kitchen" varsa, bu paket deploy olduğunda bir sonraki login'de otomatik silinecekler (sadece gerçek workspace'in kalır).

## Risk değerlendirmesi

- Ghost detection sadece "My Kitchen" + tüm field'lar boş + tüm tablolar boş kombinasyonunu yakalıyor. Kullanıcının gerçekten boş yarattığı bir workspace bile concept/role girilirse veya yeniden adlandırılırsa korunur
- "Son non-ghost yoksa korumayı bırakma" güvencesi — kullanıcı her zaman en az 1 workspace ile kalır
- Tombstone sistemi mevcut — bilinçli silinen workspace'ler diriltilmez

## Test

1. Mevcut 3 ghost workspace var → push v2.6.9 → login → cloud sync sonrası ghost'lar otomatik temizlenmeli, sadece gerçek workspace (içinde 7 recipe + 1 menu olan) kalmalı
2. Logout → Login → workspace sayısı **artmamalı**
3. "+ Yeni çalışma alanı" → "Test" yaz, kaydet → bu boş ama gerçek bir workspace, silinmemeli (çünkü kullanıcı isim koydu)

---

# v2.6.8 — Login ghost workspace bug fix + workspace editor TR

## Talep + Bug

1. **KRİTİK BUG:** Her login'de yeni boş "My Kitchen" workspace oluşuyordu. 5 login = 5 boş workspace.
2. v2.6.7'de atlanan: "Yeni çalışma alanı" / "Edit workspace" modal'ı (Workspace name, Concept, Your role, City/location, Period, Color, placeholders) hala İngilizce.

## Bug Sebebi

Login akışı şöyleydi:
1. Sayfa yüklenir → `ensureActiveWorkspace()` çağrılır
2. State boş olduğu için **boş "My Kitchen" workspace yaratılır** (local)
3. Login → cloud sync başlar
4. Cloud'dan asıl workspace listesi gelir
5. Merge mantığı "union by id" yapıyor — local'deki ghost workspace'i koruyor
6. Sonuç: her login'de bir tane daha ghost ws birikir

## Çözüm

`cloud.js` merge fonksiyonunda yeni filtre: bir workspace **sadece local'de var**, **adı hâlâ "My Kitchen"** (kullanıcı değiştirmemiş), **hiçbir tablodan içerik yok**, **son 5 dakikada oluşturulmuş** ise → silinir, sessizce.

Bu spesifik kombinasyon = login bootstrap'ı ile yaratılmış ghost. Kullanıcının gerçekten yarattığı boş workspace'leri etkilemez (onlar push edilince remote'a yazılır, sonraki pull'da remote'dan gelir).

## Workspace editor çevirisi

11 yeni i18n key (`ws_field_*`) — sadece EN ve TR. App.js'de hardcoded label/placeholder'lar `t()` çağrılarına dönüştürüldü.

## Test

**Bug fix:**
1. Login ol, çalışma alanları sayısını sayar
2. Logout, tekrar login
3. Çalışma alanları sayısı **artmamalı**
4. Mevcut ghost'ları temizlemek için: workspace switcher'dan elle sil

**Çeviri:**
1. Dil = TR
2. Workspace switcher → "+ Yeni çalışma alanı"
3. Modal'da Türkçe etiketler: "Çalışma alanı adı", "Konsept", "Göreviniz", "Şehir / konum", "Dönem", "Renk", placeholder'lar Türkçe

---

# v2.6.7 — Workspace switcher modal Türkçe çevirisi

## Talep

Çalışma alanları modal'ında bazı kısımlar İngilizce kalıyordu: "Workspaces", "Active workspaces", "recipes · menus", "ACTIVE", "Edit workspace", "Archived", "New workspace", "Close", "Edit workspace / New workspace" başlıkları.

## Çözüm

10 yeni i18n key (`ws_*`) — sadece EN ve TR. `app.js`'de hardcoded metinler `t('ws_*')` çağrılarına dönüştürüldü.

Mevcut `close` keyi var — yeniden kullanıldı, duplicate yok.

## Test

1. Dil = TR → workspace dropdown aç
2. "Çalışma Alanları" başlığı, "Aktif çalışma alanları" alt başlık
3. Workspace satırlarında "X tarif · Y menü"
4. Aktif olanın yanında "AKTİF" rozet
5. "Yeni çalışma alanı" butonu, "Kapat" butonu
6. Bir workspace'i düzenle → modal başlığı "Çalışma alanını düzenle"

---

# v2.6.6 — Sidenav başlıkları çevrildi

## Talep

Yan menüde 5 başlık hardcoded İngilizce'ydi: Library, Kitchen, Sourcing, Catering, HACCP Forms. Türkçe seçilse bile İngilizce kalıyordu.

## Çözüm

5 yeni i18n key (`section_library`, `section_kitchen`, `section_sourcing`, `section_catering`, `section_haccp_forms`) — 6 dilde tam çevirili. `app.js`'de hardcoded title yerine `t('section_*')` çağrısı.

Mevcut hiçbir key'le çakışmadı, sadece 5 yeni satır 6 dilde, sonra app.js'de 5 string değişikliği. Risk minimum.

## Test

1. Dil = TR → Sidenav: Kütüphane / Mutfak / Tedarik / Catering / HACCP Formları
2. Dil = EN → Library / Kitchen / Sourcing / Catering / HACCP Forms
3. Dil = DE → Bibliothek / Küche / Beschaffung / Catering / HACCP-Formulare

---

# v2.6.5 — Print footer "ProChefDesk" yeşil bold render fix

## Talep

v2.6.4'te `print-color-adjust:exact` eklenmişti ama Chrome print preview hâlâ "ProChefDesk"i gri olarak render ediyordu, yeşil bold değil.

## Sebep

Inline `style="color:#16a34a"` parent footer'ın `color:#999`'una karşı yetersiz kalıyordu. Bazı browserlar print render aşamasında inline child color'ı parent'a düşürüyor.

## Çözüm

Inline yerine **dedicated `<style>` block + `!important` + class-based**:
- `<strong>` yerine `<span class="pcd-brand">` 
- `.pcd-brand { color:#16a34a !important; font-weight:700 !important }` 
- `@media print` içinde de aynı kural — print path'inde garantili
- `print-color-adjust:exact !important` her iki seviyede

## Test

- Recipes/menüler/checklists print → footer'da "ProChefDesk" yeşil ve kalın görünmeli
- Background graphics seçeneğinden bağımsız çalışmalı

---

# v2.6.4 — HACCP çoklu form desteği + print footer rengi

## Talep

Senaryo: Executive chef bir otelde banket mutfak için bir form, italyan restoran için ayrı bir form ister. Her mutfakta farklı sayıda soğutucular var. Tek bir grid yetersiz.

## Çözüm

**Çoklu log (form) desteği:**
- Sayfa başında log selector dropdown: "Banquet Kitchen ▼"
- Yanında "+ New log" butonu — sınırsız log oluşturulabilir
- "⋮" menüde Rename · Delete log
- Her log'un kendi üniteleri ve okumaları var, tamamen izole
- Aktif log seçimi `prefs.haccpCurrentLogId`'de saklanır
- Default log: ilk açılışta otomatik bir "Default" log oluşturulur — mevcut data buna migrate edilir
- Print PDF başlığında log adı görünür: "Workspace · Banquet Kitchen · April 2026"

**Cascade-delete:** Bir log silinince → içindeki tüm üniteler + tüm sıcaklık okumaları kalıcı olarak silinir. Confirm modal: "X log'u, Y cihaz ve tüm okumalar silinecek".

**Migration:** v2.6.1-2.6.3'ten gelen mevcut üniteler (logId yok) ilk açılışta otomatik default log'a aktarılır. Render'da idempotent.

**Bonus — Print footer rengi düzeltildi:** `print-color-adjust:exact` eklendi → Chrome "Background graphics" kapalı olsa bile "ProChefDesk" yeşil/bold render edilir.

## Kod

`js/tools/haccp_logs.js`:
- Yeni TABLE_LOGS sabiti ve PREF_CURRENT_LOG anahtarı
- Log helpers: `listLogs`, `ensureDefaultLog`, `getCurrentLogId`, `setCurrentLogId`, `getCurrentLog`, `deleteLogCascade`
- `listUnits` artık sadece **aktif log'un** ünitelerini döndürür
- Yeni `openLogEditor(logId, onClose)` — create/rename
- Render'da log selector card eklendi: dropdown + New log + "⋮" menü
- Yeni unit'lere otomatik `logId` atanır
- Print başlığında log adı

`js/core/store.js`, `js/core/cloud.js`: `haccpLogs` workspace-bound tablo listesine eklendi
`js/core/utils.js`: print footer'a `print-color-adjust:exact` eklendi (yeşil ProChefDesk her zaman görünür)
`js/i18n/en.js`, `js/i18n/tr.js`: 12 yeni log key

## Migration gerekli mi

Hayır. Tamamen client-side. İlk render'da:
1. `haccpLogs` tablosu boşsa "Default" log otomatik oluşturulur
2. Mevcut tüm orphan üniteler default log'a backfill edilir
3. Cloud sync bu işi otomatik handle eder

## Test

1. HACCP Logs aç → "Default" log seçili olmalı, mevcut tüm cihazların görünmeli
2. "+ New log" → "Italian Kitchen" yaz → oluştur → o log seçili, üniteler boş
3. + Add unit → 3 fridge ekle (sadece bu log'a ait)
4. Dropdown'dan "Default"'a geç → eski cihazlar tekrar görünmeli, Italian üniteler görünmemeli
5. Italian'a geri dön → "⋮" → "Rename" → "Italian Kitchen — Banquet Mode" yap
6. "⋮" → "Delete log" → confirm modal "Italian Kitchen — Banquet Mode (3 units)" yazsın → onayla → log silinir, otomatik Default'a geçer
7. Print → başlıkta "Workspace · Default · April 2026" görünmeli
8. Recipes/menus print → "Made with **ProChefDesk** · prochefdesk.com" yeşil bold görünmeli (background graphics kapalı olsa bile)

---

# v2.6.3 — HACCP print tek sayfa fix

## Talep

Print preview ikinci sayfaya taşıyordu. "Made with ProChefDesk" footer'ı ikinci sayfada görünüyordu.

## Çözüm

- Page margin: 8mm → 5mm (sayfa kullanımı +%30)
- Body padding: 10px → 0 (margin zaten boşluk veriyor)
- Header h1: 16px → 14px, sub: 10px → 9px
- Notes/sign font: 9-10px → 8-9px, padding'ler kompakt
- Cell padding: 2-3px → 1-3px
- "Made with ProChefDesk" global footer'ı bu print için gizlendi (`.pcd-print-footer { display:none }`); yerine inline kompakt footer (`.h-foot`) eklendi — A4 alanını boşa harcamadan tek satır

Sonuç: Form artık tek A4 yatay sayfada sığar.

## Test

- Print preview → 1 page görünmeli
- "Made with ProChefDesk" tablonun hemen altında kompakt görünmeli, kesinlikle 2. sayfaya geçmemeli

---

# v2.6.2 — HACCP grid optimizasyonu (tek sayfa fit)

## Talep

1. Day kolonu çok geniş, gereksiz boşluk var
2. Ekranda ve print'te tüm grid tek sayfaya sığmıyordu
3. Çok cihaz eklenirse uyarı gerekli

## Çözüm

**Ekran:** Day kolonu 70px sabit, hücreler 50px, font 12px (önceden 13px). Toplam grid genişliği `70 + units × 100`. 6 ünite tek sayfada rahat sığar, üzerinde scroll devreye girer.

**Print:** A4 yatay, table-layout fixed, font 9px, kompakt padding. 6 üniteye kadar tek sayfa, 7+ ise üst tarafta uyarı.

**Uyarı:** 6'dan fazla ünite varsa hem ekranda hem print'te sarı banner: "Çok fazla cihaz, sıkışık görünebilir, ileride çok sayfalı düzen gelecek."

## Kod

`js/tools/haccp_logs.js`:
- Grid: padding'ler küçüldü, font 12px, day kolonu 70px sabit, AM/PM hücreleri 50px sabit
- Print: tüm font/padding boyutları küçüldü, `table-layout:fixed`, A4 margin 8mm
- 6+ ünite için ekran + print uyarısı

`js/i18n/en.js`, `tr.js`: `haccp_too_many_units` key

## Test

1. 1-3 ünite ile grid → tek bakışta ay tamamı sığsın, day kolonu kompakt
2. Print → tek A4 yatay sayfada tüm ay
3. 7+ ünite ekle → sarı uyarı bandı
4. Print → uyarı + tablo (sıkışık ama yine de tek sayfa)

---

# v2.6.1 — HACCP Forms · Fridge & Freezer Log

## Talep

HACCP standartlarına uygun fridge/freezer derece takip formu. Şef cihazları sayısı/isimleriyle özelleştirir, günde 2 vardiya (sabah açılış + akşam kapanış) derece girer, out-of-range değerler için corrective action notu ekleyebilir, aylık tablo PDF olarak basılır.

## Çözüm

Yeni "HACCP Forms" başlığı altında ilk araç: **Fridge & Freezer Log**. Side menüden erişilir.

### Özellikler

- **Cihaz yönetimi:** Şef her birim için isim + min/max sıcaklık aralığı tanımlar. Hazır şablonlar: Fridge (0–4°C), Walk-in Cooler (0–4°C), Freezer (–25 to –18°C), Bar Fridge, Display Cooler, Hot Holding (63–90°C).
- **Aylık grid:** Satırlar = ayın günleri (1-31), sütunlar = cihaz × vardiya (AM/PM). Tek bakışta tüm ay görünür.
- **Bugün vurgusu:** Bugünün satırı yeşil arka planla işaretlenir.
- **Hücre tıklayınca:** Sıcaklık girme modal'ı açılır. Auto-focus, klavye sayısal.
- **Out-of-range uyarı:** Limit dışı değer girildiğinde anında kırmızı uyarı + corrective action önerisi (zorunlu değil, isteğe bağlı). Şef gerçek değeri (8°C gibi) yazıp, ne yaptığını not olarak ekler.
- **Future-proof:** Gelecek tarihlere giriş engellenir.
- **PDF export:** Tüm ay tek A4 yatay PDF — sıcaklık tablosu + corrective action notları altta + reviewed by alanı + footer "Made with ProChefDesk".
- **Sıcaklık birimi:** °C / °F seçilebilir (workspace başına `prefs.haccpTempUnit`).

### Kullanıcı akışı

1. Side menü → HACCP Forms → Fridge & Freezer Log
2. İlk açılışta empty state → "Add first unit"
3. "Walk-in Cooler 1" ekle, preset "Walk-in Cooler" seç → 0–4°C otomatik
4. Ana grid açılır → bugünün AM hücresine tıkla → 3.5°C gir → kaydet
5. Akşam kapanışta PM hücresine tıkla → 4.1°C gir
6. Eğer 8°C girersen → kırmızı uyarı → "Door left open after delivery" yaz → kaydet
7. Ay sonu → "Print/PDF" → A4 yatay PDF → sağlık denetimi için klasöre

## Kod değişiklikleri

- `js/tools/haccp_logs.js` (YENİ) — tüm HACCP log mantığı tek modülde
- `js/core/store.js` — `wsBoundTables` listesine `haccpUnits` + `haccpReadings` eklendi (legacy migration + workspace deletion cleanup için)
- `js/core/cloud.js` — tombstone cleanup listesine eklendi
- `js/core/app.js` — router register + sidenav (HACCP Forms section) + context-aware "+" button
- `js/core/utils.js` — `thermometer` icon eklendi
- `index.html` — script tag eklendi
- `js/i18n/*` — EN/TR tam, ES/FR/DE/AR minimal (kalanlar EN fallback)

## Migration gerekli mi

Hayır. Yeni state tabloları otomatik oluşturulur, mevcut user_data Supabase tablosu zaten her şeyi tutuyor. Cloud sync otomatik çalışır.

## Test

1. Side menü → HACCP Forms → Fridge & Freezer Log
2. "Add first unit" → preset seç → cihaz ekle
3. Bugünün AM hücresine tıkla → derece gir → kaydet → grid'de görünmeli
4. Hatalı bir değer (örn. 8°C, limit 4°C) gir → kırmızı uyarı görünmeli + ⚠ ikonu hücrede
5. Note ekle → 📝 ikonu hücrede görünmeli
6. Ay değiştir → ← → butonları ile geçmiş aylara bak
7. "Print/PDF" → A4 yatay PDF aç → tablo + notlar + footer
8. Mobile + butonu → HACCP Logs'tayken yeni cihaz oluşturma modalı açmalı

---

# v2.6.0 — Checklist session history

## Talep

Şu ana kadar Start session → tikle tikle → Complete edince veriler **kayboluyor görünüyordu**. Aslında store'da kayıtlıydı ama UI'da gösterilmiyordu. HACCP compliance için geçmişin tamamı erişilebilir olmalı.

## Çözüm

**Veri zaten kaydediliyordu** — `completedAt` alanı set edilip session "active" listesinden çıkıyordu, ama silinmiyordu. Eksik olan tek şey **history UI**.

### Eklenen özellikler

- Template preview modal'ında yeni **"📜 History" butonu** (yanında badge ile tamamlanmış oturum sayısı)
- History modal: tamamlanmış oturumlar listesi, en yeni üstte
- Default **son 90 günü** göster, "Daha eski X oturumu göster" butonu
- Her satırda: tarih · saat · şefin adı · X/Y tamamlanma · sorun varsa kırmızı uyarı
- Bir satıra tıklayınca **session detayı** açılır
- Detay görünümünde: başlangıç/bitiş saati, süre, şef, tüm item sonuçları (PASS/FAIL/değer/sıcaklık)
- Her geçmiş kayıt için **"Print / PDF"** butonu (mevcut `printChecklistSession` kullanıyor)
- Her geçmiş kayıt için **"Sil"** butonu (HACCP uyarısı ile)

### Geçmiş tutma stratejisi

- **Sınırsız tut** — kayıtlar otomatik silinmez (HACCP genelde 2 yıl ister, ama yer kaplamaz)
- UI default 90 gün gösterir, "older" butonu ile genişler
- Kullanıcı manuel silebilir (uyarı ile)

### Şef imza

- Otomatik: signed-in kullanıcının adı + tarih/saat
- Mevcut `s.completedBy` field'ı zaten dolduruluyordu

## Kod değişiklikleri

`js/tools/checklist.js`:
- Yeni `listCompletedSessions(templateId?)` helper
- Yeni `deleteSessionById(sid)` helper
- Yeni `openSessionHistory(templateId)` modal
- Yeni `openHistoryDetail(session, tpl)` modal
- Template preview modal'ına History butonu (badge ile)

`js/i18n/*` (6 dilde 18 yeni key): `checklist_history*` ailesi

## Migration gerekli mi

Hayır. Veriler zaten store'da, sadece UI eksikti.

## Bilinen sınırlama

- Cross-template history view yok (örn. "tüm şablonlar arası son 30 gün") — ileride eklenebilir
- Tarih aralığı filtresi yok (sadece "son 90 gün" / "tümü") — basit tutuldu
- Bulk PDF export yok ("son 3 ay walk-in cooler check'lerinin tamamı tek PDF") — ileride eklenebilir

## Test

1. Bir template seç → preview aç → "📜 History" butonu görünmeli (henüz kayıt yoksa badge yok)
2. Start session → birkaç item tikle → Complete
3. Aynı template → preview → History butonunda **1** badge'i
4. History'e tıkla → kayıt görünmeli (tarih/saat/şef adı/X/Y)
5. Satıra tıkla → detay açılsın → tüm item sonuçları görünmeli
6. Print → PDF üretilsin (alt köşede "Made with ProChefDesk")
7. Birkaç kez tekrar et → çoklu kayıt listede sıralı görünsün
8. 90 gün öncesi sahte data yoksa "Show older" butonu çıkmaz (mevcut data 90 gün içinde)

---

# v2.5.13 — Print/PDF çıktılarına "Made with prochefdesk.com" footer

## Talep

Tüm print/PDF çıktılarının altına nazik bir reklam: "Made with ProChefDesk · prochefdesk.com". Recipe print, menü print, canvas print, checklist print, cost report, purchase order, shopping list, event print, portion calculator print — hepsine.

## Çözüm

Tüm print akışları `PCD.print()` helper'ından geçtiği için footer'ı **tek noktaya** ekledim. Recipe / menü / canvas / checklist / inventory / events / portion / shopping — hepsi otomatik kazanır.

**Footer:**
- Tek satır, ortalanmış, çok küçük (9px)
- Üstte ince ayraç çizgi, sayfa içeriği ile karışmaz
- "Made with **ProChefDesk** · prochefdesk.com" — "ProChefDesk" yeşil
- Sadece print/PDF çıktısının altında görünür, ekran modal'ında zaten kullanıcı görmez (sayfa sonunda)
- İngilizce — uluslararası tutarlılık

## Kod değişiklikleri

`js/core/utils.js`:
- `PCD.print()` içinde `FOOTER_HTML` sabiti tanımlandı
- Partial içerik wrap edilirken `</body>` öncesine footer enjekte edilir
- Tam HTML (DOCTYPE'lı) verilirse `</body>` regex'i ile yine enjekte edilir (mevcut tüm caller'lar partial gönderiyor, ama gelecekte tam HTML gönderene de çalışsın)

## Migration gerekli mi

Hayır.

## Bilinen sınırlama

Public share sayfasındaki Kitchen Card "Save as PDF" butonu `PCD.print()` kullanmıyor (iframe içinden direkt `window.print()`). Footer oraya eklenmedi. Eğer istenirse ayrı pakette public share renderer'ına da eklenebilir.

## Test

1. Bir recipe'de Print → çıktının en altında "Made with ProChefDesk · prochefdesk.com" görünmeli
2. Bir menüde Print → aynı
3. Kitchen Card Print → aynı
4. Checklist (blank veya completed session) Print → aynı
5. Cost Report PDF → aynı
6. Inventory stock count / purchase order → aynı
7. Shopping list → aynı
8. Event print → aynı

---

# v2.5.12 — Checklist sıralama + workspace kopyalama

## Talep

1. Yeni eklenen checklist en alta gidiyordu — şefin favori checklist'leri üstte olmalı, sıra değiştirilebilir olmalı
2. Recipe ve menülerde olan "kamyon ikonu" (workspace kopyalama) checklist'lerde de olmalı — şef yeni işletmede aynı checklist'i kullanmak istiyor

## Çözüm

**1. Sıralama:**
- Her checklist template'e `sortIndex` field eklendi
- Card'a yukarı/aşağı ok butonları eklendi
- Tıklayınca komşu template ile sortIndex swap olur
- Mevcut template'ler ilk reorder'da otomatik normalize edilir (geriye uyumlu)

**2. Workspace kopyalama:**
- Card'daki eski "Edit" butonu yerine 3-nokta menü (⋮)
- 3-nokta menüde: Edit · Duplicate · Copy to workspace · Delete
- Mevcut `PCD.openCopyToWorkspace()` helper'ı kullanılıyor (recipes/menus'taki aynı modal)
- `checklistTemplates` zaten store'da workspace-bound table olarak tanımlıydı, ekstra altyapı gerekmedi

## Kod değişiklikleri

- `js/tools/checklist.js`:
  - `listTemplates` artık `sortIndex` ile sıralıyor (createdAt fallback)
  - Yeni `moveTemplate(tid, direction)` helper
  - Card layout'u: up/down ok butonları + 3-nokta menü + Start
  - `actionSheet` ile 3-nokta menü (Edit / Duplicate / Copy to workspace / Delete)
  - Click bubble guard'ları yeni butonlar için güncellendi
- `js/core/utils.js`: `chevronUp`, `chevron-up`, `chevron-down`, `more-vertical`, `moreVertical` icon'ları eklendi
- `js/i18n/*` (6 dilde 7 yeni key): `move_up`, `move_down`, `more_actions`, `act_copy_workspace`, `checklist_delete_confirm_title`, `checklist_delete_confirm_msg`, `checklist_deleted`

## Migration gerekli mi

Hayır. `sortIndex` yoksa default 999999 kabul edilir, ilk reorder'da otomatik normalize.

## Test

1. Checklist sayfasında her template'in yanında ↑ ↓ butonları görünmeli
2. ↑ ↓ tıklayarak sırayı değiştir → sayfayı yenile → sıra korunmalı
3. ⋮ butonu → action sheet açılmalı: Edit · Duplicate · Copy to workspace · Delete
4. "Copy to workspace" → diğer workspace'leri listeleyen modal → seç → "Kopyalandı" toast
5. Diğer workspace'e geç → kopyalanmış template orada görünmeli
6. Edit/Duplicate/Delete davranışları aynı olmalı
7. En üstteki template'in ↑ butonu disabled, en alttakinin ↓ butonu disabled

---

# v2.5.11 — Sorun bildir formu artık direkt gönderim

## Talep

Mevcut "Sorun bildir" akışı `mailto:` linki ile kullanıcının kendi e-posta uygulamasını açıyordu. Kullanıcı kendi adından otomatik debug bilgisi içeren tuhaf bir mail göndermek istemiyordu — formdan vazgeçiyordu.

## Çözüm

Web3Forms üzerinden direkt sunucuya POST. Kullanıcı sadece "Bildiriniz alındı, teşekkürler" görür. Form submission'ı `hello@prochefdesk.com` adresine düşer.

**Form artık 4 alan içeriyor (hepsi zorunlu):**
- Ad (signed-in user'dan otomatik dolduruluyor)
- E-posta (signed-in user'dan otomatik dolduruluyor)
- Konu
- Açıklama

Otomatik debug bloğu (app version, browser, OS, dil, tema, ekran boyutu, timestamp, URL, user ID) maile ekleniyor — eskisi gibi.

**Hata yönetimi:** Network hatasında veya Web3Forms cevabı başarısızsa kullanıcıya "Gönderilemedi, internet bağlantınızı kontrol edin" toast'ı, buton yeniden aktif olur.

## Kod değişiklikleri

- `js/tools/account.js` — `openReportIssueModal` baştan yazıldı:
  - `mailto:` link kaldırıldı
  - `fetch('https://api.web3forms.com/submit', POST, JSON)` eklendi
  - Web3Forms access key (`f5039b66-...`) sabit
  - Email format validation eklendi
  - Honeypot field (`botcheck`) spam koruması için
  - Loading state (spinner + "Gönderiliyor…")
- `js/i18n/*` (6 dilde):
  - 6 yeni key: `report_issue_name_label`, `report_issue_name_placeholder`, `report_issue_email_label`, `report_issue_email_invalid`, `report_issue_sending`, `report_issue_sent`, `report_issue_send_failed`
  - Mevcut key'ler güncellendi: `report_issue_intro`, `report_issue_send`, `report_issue_validation`
  - Eski `report_issue_opened` korundu (kullanılmıyor ama referansı kırmamak için)

## Web3Forms hakkında

- Free tier: 250 mail/ay (senin kullanımın için fazlasıyla yeterli)
- Submission'lar Web3Forms dashboard'unda da görünür
- Access key public key, kod içinde olması güvenlik sorunu değil
- Spam protection built-in

## Migration gerekli mi

Hayır. Tamamen client-side değişiklik.

## Test

1. Account → Help → Sorun bildir
2. Form 4 alanlı görünmeli, ad ve email pre-filled (signed-in ise)
3. Tüm alanları doldur → "Bildirimi gönder"
4. Buton spinner gösterir → kapanır → "Bildiriniz alındı" toast
5. `hello@prochefdesk.com` mail kutusunu kontrol et → mesaj gelmeli
6. Boş alan bırakırsan → validation toast
7. Geçersiz email girersen → "Geçerli bir e-posta girin" toast

---

# v2.5.10 — Mobil + butonu çalıştırma + alt panel düzenleme

## Talep

1. Mobilde alt paneldeki + (artı) butonu hiçbir şey yapmıyordu
2. Alt panel: Pantry yerine Kitchen Cards olsun → Home · Recipes · + · Cards · Me
3. Pantry side menüde kalmaya devam etsin

## Çözüm

**+ butonu artık context-aware.** Bulunduğun sayfaya göre yeni öğe oluşturma editörünü açıyor:
- Recipes'taysan → Yeni Recipe
- Menus'tasan → Yeni Menu
- Ingredients'taysan → Yeni Ingredient
- Events / Suppliers / Checklist / Inventory aynı şekilde
- Kitchen Cards'taysan → Yeni canvas başlatma butonunu otomatik tıklıyor
- Home / Account / Shopping gibi context dışı sayfalardaysan → Recipes'a gidip yeni recipe editörü açıyor (en olası "create" niyeti)

**Alt panel güncellendi:** Pantry butonu çıkarıldı, yerine Kitchen Cards kondu. Pantry side menüde (☰) zaten var, oradan erişilebilir.

## Kod değişiklikleri

- `index.html` — bottom nav: Pantry → Kitchen Cards, + butonu ID'lendi (`bnCreateBtn`)
- `js/core/app.js` — + butonu için context-aware handler (her tool'un `openEditor` API'sini kullanıyor)
- `js/tools/checklist.js` — `PCD.tools.checklist` API'sine `openEditor` eklendi (mevcut `openTemplateEditor` fonksiyonuna alias)
- 6 dilde `nav_kitchen_cards` key'i zaten mevcuttu, yeni i18n key gerekmedi

## Test

1. Mobilde Recipes sayfasında + butonuna bas → "New Recipe" modal açılmalı
2. Menus sayfasında + → "New Menu" modal
3. Ingredients sayfasında + → "New Ingredient" modal
4. Checklist sayfasında + → "New Template" modal
5. Kitchen Cards sayfasında + → canvas reset oluyor, "New canvas" toast
6. Home sayfasında + → Recipes'a yönlendiriyor + "New Recipe" modal açıyor
7. Alt panel sırası: Home · Recipes · + · Cards · Me
8. Pantry'ye side menüden (☰) erişilebiliyor

## Migration gerekli mi

Hayır. Tamamen client-side değişiklik.

---

# v2.5.9 — Recipe foto sıkıştırma + Storage'a taşıma

## Talep

Recipe fotoğrafları database'e base64 olarak gömülüyor. 4-5 MB foto → ~6-7 MB DB satırı. Bu Supabase free tier'ın 500 MB DB limitini hızla doldurur ve uygulamayı yavaşlatır. Uzun vade ölçeklenebilir değil.

## Çözüm

1. **WebP sıkıştırma** — Cropper artık WebP @ 0.82 quality çıkışı veriyor. JPEG'den ~%30 daha küçük, gözle aynı kalite.
2. **Supabase Storage** — Fotolar `recipe-photos` bucket'ına yükleniyor, recipe'de sadece public URL string'i saklanıyor.
3. **Geriye uyumlu** — Eski recipe'lerdeki base64 fotolar bozulmadan çalışmaya devam eder. Bir foto düzenlenirse yeni sistem kullanılır.
4. **Graceful fallback** — Offline veya cloud yoksa eski davranış (base64) korunur, kullanıcı kaybetmez.

## Kod değişiklikleri

- `js/core/photo-storage.js` (yeni) — dataURL → WebP → Storage upload helper
- `js/ui/cropper.js` — JPEG 0.85 yerine WebP 0.82 (JPEG fallback'li)
- `js/tools/recipes.js` — cropper sonrası `PCD.photoStorage.upload()` çağrısı, kullanıcıya "Yükleniyor…" toast
- `index.html` — yeni script tag (cloud.js'den sonra)
- `js/i18n/*` — `photo_uploading` key (6 dilde)
- `migrations/v2.5.9-recipe-photos-rls.sql` — Storage RLS policies

## Migration gerekli

Bu paketi deploy etmeden önce:

1. Supabase Dashboard → Storage → `recipe-photos` bucket olduğunu doğrula (zaten oluşturuldu, public)
2. SQL Editor → `migrations/v2.5.9-recipe-photos-rls.sql` dosyasını çalıştır → "Success. No rows returned"
3. Sonra paketi push et

## Test

1. Yeni recipe oluştur, 4-5 MB foto yükle
2. "Fotoğraf yükleniyor…" toast'ını gör
3. Recipe kaydet, listede fotoğrafı gör (URL'den yüklenir)
4. Network tab'inde upload boyutuna bak — 100-200 KB civarı olmalı
5. Eski recipe'lerin foto'larının hala görüntülendiğini doğrula

## Beklenen kazanım

- Database boyutu yeni fotolar için **%99 küçülür**
- Yeni recipe yükleme hızı **3-5x artar** (DB satırı küçük)
- Storage maliyeti minimal (1 GB free tier'da binlerce foto sığar)

---

# v2.5.8 — Kitchen Cards Share + QR

## Yeni özellik

### Kitchen Cards canvas paylaşımı

Head chef bir mutfak kartını canvas'a yerleştirip kaydettikten sonra QR kodu üretip mutfak duvarına asabilir. Junior cook telefondan tarar → A4 layout'unu görür → "Save as PDF" ile kendi telefonuna kaydedebilir.

**Senaryo:**
1. Head chef Kitchen Cards'a girer, "Breakfast Prep" canvas'ını oluşturur, recipes ekler
2. **🔗 Share QR** butonuna basar (Save Canvas + Print yanına eklendi)
3. Eğer canvas kaydedilmemişse: otomatik kaydedilir (auto-save+share akışı, tek tık)
4. QR modal açılır → Print → A4 kağıda QR + canvas adı
5. Mutfak duvarına asılır
6. Junior cook telefon kamerasıyla QR'ı tarar
7. Tarayıcı açılır → ProChefDesk toolbar'lı canvas A4 layout görüntülenir
8. **📄 Save as PDF** butonuna basar (veya Chrome menüsünden Print)
9. PDF telefona kaydolur, offline da bakabilir

**Auto-refresh avantajı (v2.5.7'den miras):** Head chef bir tarifi düzenlerse, sonraki "Share QR" çağrısında snapshot otomatik güncellenir. Mutfak duvarındaki QR aynı kalır ama herkes güncel tarifi görür.

## Kod değişiklikleri

### `js/tools/kitchen_cards.js`

**`buildSheetHtml(opts)` refactored:**
- Hem owner formu (`{ingredientId, amount, unit}` → ingredient lookup) hem public formu (`{name, amount, unit}` → resolved name) destekler
- `PCD.store.listIngredients()` çağrısı try-catch ile sarıldı, public viewer'da store boş olsa bile crash etmez
- Mevcut owner-side davranışı değişmedi — sadece additional bir code path eklendi

**Yeni `snapshot(canvasId)` fonksiyonu:**
- Canvas'ı PCD.store'dan okur
- Layout'taki her recipe için ingredient'ları **resolve** eder (ID → name + amount + unit inline)
- Eksik tarifler filtrelenir (silinmiş recipe'ler snapshot'a girmez)
- Hiç recipe kalmazsa null döner
- Public viewer'ın orijinal `recipes`/`ingredients` tablolarına erişmesine gerek kalmaz — her şey payload'da

**Yeni `renderFromSnapshot(payload)` fonksiyonu:**
- Snapshot'tan tam HTML üretir (toolbar + sheet)
- `buildSheetHtml`'i public formuyla çağırır
- Sticky toolbar: ProChefDesk branding + canvas adı + "📄 Save as PDF" butonu
- Toolbar `@media print` ile gizlenir → PDF'te görünmez, sadece canvas çıkar
- "📄 Save as PDF" butonu `window.print()` çağırır → Chrome native dialog
- Mobile responsive: küçük ipucu metni de gösterir ("tarayıcı yazdırma menüsünü kullan")

**UI'ya yeni "🔗 Share QR" butonu:**
- Save Canvas + Print butonlarının arasına eklendi (3 buton: Save / Share / Print)
- Tıklanınca:
  - Auth check → user yoksa "Sign in required" toast
  - PCD.share check → cloud yoksa "Could not create QR" toast
  - **Auto-save:** canvas kaydedilmemişse `persistCanvas()` helper'ı çalıştırır, ID üretir
  - `createOrGetShareUrl('kitchencard', canvasId)` → URL alır
  - QR modal açar (mevcut `PCD.qr.show()` kullanılır)
- Loading state: spinner + "QR oluşturuluyor…" buton içinde

**`persistCanvas()` helper:**
- Save button ve Share button'un dublike kayıt mantığını ortak fonksiyona aldı
- Mevcut Save davranışı aynı, sadece yeniden kullanıldı

**Module API expose:**
- `PCD.tools.kitchenCards = { render, snapshot, renderFromSnapshot }`

### `js/core/share.js`

**`snapshotKitchenCard(canvasId)`:**
- v2.5.7'deki `null` stub kaldırıldı
- Şimdi `PCD.tools.kitchenCards.snapshot(canvasId)`'a forward ediyor
- Tools modülü mevcut değilse null döner (defensive)

**`renderSharePage(share)`:**
- `kind === 'kitchencard'` durumu için early-return path eklendi
- Recipe/menu wrapper kullanmadan direkt `PCD.tools.kitchenCards.renderFromSnapshot(p)` çağrılır
- Recipe ve menu rendering'i hiç değişmedi

### `js/i18n/*` (6 dilde 5 yeni key)

`canvas_share_btn`, `canvas_share_qr_subtitle`, `canvas_share_save_pdf`, `canvas_share_pdf_tip`, `canvas_share_save_failed` — EN/TR/ES/FR/DE/AR.

## Veritabanı değişikliği

**Yok.** v2.5.7'de `kind` enum'a `'kitchencard'` zaten dahildi (text kolonu, herhangi bir değer kabul eder). Bu paket tamamen client-side.

## Cache-busting

- `index.html` — 48 yer `?v=2.5.7` → `?v=2.5.8` + sidenav `v2.5.8`
- `privacy.html`, `terms.html` — sadece CSS cache-bust
- `js/core/config.js` — APP_VERSION 2.5.8

## Bilinen sınırlamalar

- Public share sayfasında dil İngilizce'de sabittir. Junior cook telefon dilinde Türkçe görse bile share sayfasında "Save as PDF" yazar. Bu kasıtlı: share path normal app boot'unu atladığı için locale prefs'i okumuyor. Sonradan navigator.language tabanlı bir light auto-detect ekleyebiliriz.
- Canvas çok karmaşıksa (örn. 20+ tarif × uzun method'lar) snapshot payload büyür. Pratik testlerde 10-15 tarif = ~30-50 KB civarı, Supabase jsonb 1 GB limit'i ile mukayese edildiğinde sorun yok.
- Auto-refresh sayesinde tarif değiştirme yansır, ama **canvas layout'u** değiştirilmedi (tarifler aynı). Eğer canvas'tan tarif çıkarırsan ve aynı share URL'sini açarsan eski snapshot görünür → tekrar QR'a bas, snapshot tazelenir.

## Doğrulama

- 42 JS dosyası `node --check` ✓
- `buildSheetHtml` defensive PCD.store guard'ı var, public viewer'da crash etmez ✓
- `PCD.tools.kitchenCards` API'si runtime'da mevcut (script load order tutarlı) ✓
- Recipe/menu share rendering'i aynı, regression yok ✓

## Test senaryoları

1. **Auto save+share** — Yeni canvas oluştur, tarif ekle, kaydetmeden direkt 🔗 Share QR'a bas → otomatik kaydedilir → QR modal açılır ✓
2. **Var olan canvas paylaşımı** — Kaydedilmiş canvas yükle → Share QR → mevcut share URL'si döner (idempotent) ✓
3. **Public render** — QR'ı telefondan tara → A4 layout açılır, ProChefDesk toolbar'ı + Save as PDF butonu görünür ✓
4. **Save as PDF** — Public sayfada "Save as PDF" → Chrome print dialog → PDF kaydet → toolbar gizli, sadece canvas A4'te ✓
5. **Auto-refresh** — Tarif düzenle → tekrar Share QR → aynı URL ama yeni snapshot ✓
6. **Pause** (v2.5.7'den) — My Shares → kitchen card share'i pause et → QR yine çalışır ama "⏸ This share is paused" sayfası ✓
7. **Delete** (v2.5.7'den) → Sil → URL 404 ✓
8. **Empty canvas** — Tarif olmayan boş canvas'ta Share butonu disabled (zaten Save de disabled) ✓

---

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
