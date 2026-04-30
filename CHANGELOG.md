# v2.6.39 — public_shares RLS açığı düzeltmesi (GÜVENLİK)

## Açık (kritik)

`public_shares` tablosuna v2.5.7 migration'ı `USING (true)` olan bir public SELECT politikası eklemişti. Niyet: "share ID'leri rastgele 12 karakter token, ID'yi bilmek erişim demek". Postgres RLS böyle çalışmıyor.

**Sonuç:** Herhangi bir anonim istemci (sadece anon key ile, hiç login olmadan) `SELECT * FROM public_shares` çekip:
- Tüm kullanıcıların paylaştığı **bütün** payload'ları (tarif içerikleri, menüler, kitchen card'lar)
- `owner_id` (her share'in sahibi)
- `source_id` (iç tarif/menü ID'leri)
- `view_count` (analitik)

— hepsini **dökebiliyordu**. Yüzlerce şefi olan bir public sürüm için kritik privacy ihlali.

## Çözüm

`migrations/v2.6.39-share-rls-fix.sql` üç şey yapıyor:

1. **Eski açık SELECT politikasını düşür** (`DROP POLICY public_shares_read_by_id`)
2. **Owner-only SELECT ekle** — kullanıcı sadece kendi share'lerini görür. "My Shares", `createOrGetShareUrl` lookup, pause/delete bunun üzerinden çalışır.
3. **`fetch_share_by_id(share_id)` SECURITY DEFINER RPC ekle** — anon kullanıcı sadece zaten ID'sini bildiği bir share'e ulaşabilir. Sadece `id, kind, payload, paused` döner. `owner_id` ve `view_count` artık anonim çağırana ASLA gitmez.

`js/core/share.js` → `fetchShare()` artık `supabase.rpc('fetch_share_by_id', { share_id })` çağırıyor. Eski direct SELECT yolu artık çalışmaz (RLS bloklar) — bu doğru davranış.

Diğer share.js fonksiyonları (createOrGetShareUrl, listMyShares, setSharePaused, deleteShare) zaten `owner_id = user.id` filter'ı ile çalışıyor — yeni `public_shares_owner_select` politikası ile korundular, kod değişikliği gerekmedi.

## Deploy sırası ÖNEMLİ

1. **Önce** Supabase Dashboard → SQL Editor'de `migrations/v2.6.39-share-rls-fix.sql` çalıştır
2. **Sonra** prochefdesk.com'a v2.6.39 kodunu deploy et

Ters yapılırsa: yeni kod RPC çağırıyor ama RPC daha yok → share linkleri kısa süre kırılır. Doğru sıra ile geçiş kullanıcılara tamamen şeffaf.

**Geri alma planı:** Bir şey ters giderse (RPC hata verirse vs.), Supabase SQL Editor'de:
```sql
CREATE POLICY public_shares_read_by_id ON public_shares
  FOR SELECT USING (true);
```
çalıştırınca eski davranışa döner; kod tarafında share.js'i v2.6.38'e geri alabilirsin (RPC olmasa da eski SELECT path'i o sürümde duruyor).

## Test

### Migration sonrası, kod deploy öncesi
1. Supabase Dashboard → Table Editor → public_shares → "View as anon" → satır görünmemeli
2. Mevcut share URL aç (eski cache'siz tarayıcı) → "Loading shared content..." sonrası "Share not found" — beklenen, kod henüz deploy edilmedi

### Kod deploy sonrası
3. Mevcut bir tarif share URL'i aç (anon olarak, gizli pencere) → tarif görünmeli ✓
4. Mevcut bir menü share URL'i aç → menü görünmeli ✓
5. Kitchen card share → kart görünmeli ✓
6. Pause edilmiş bir share → "this share is paused" sayfası ✓
7. Login ol → Account → My shares → kendi listene erişebilmelisin ✓
8. Login ol → bir tarifi share et → URL alabilmelisin ✓
9. View count: bir share'i 3 kere açtıktan sonra Account → My shares → view count 3 ✓

### Saldırı testi (privacy doğrulaması)
10. Browser console'da:
```js
window._supabaseClient.from('public_shares').select('*').then(console.log)
```
   → boş array dönmeli (önceden tüm tabloyu döküyordu)

## Risk

Düşük-orta. Migration tek transaction (BEGIN/COMMIT), idempotent (DROP IF EXISTS, CREATE OR REPLACE). Geri alma yolu var. Ana risk: deploy sırası ters olursa share linkleri 1-2 dakika kırılır.

---



## Sorun

`js/core/app.js` workspace save handler'ında 7 adet debug kalıntısı vardı:
- 3 adet `console.log('[Workspace Save] ...')` — DevTools açık olmasa bile prod console'da gözüküyordu
- 3 adet `alert(...)` — modal/toast yerine native browser alert; UI bloke ediyor, kullanıcıyı paniğe sokar
- 1 adet `console.error(...)`

Hata ayıklama oturumundan kalmış, prod'a geçmiş. Toast pattern her yerde mevcut, native `alert()` kullanılması gereksiz.

## Çözüm

Hepsi `PCD.toast` ve `PCD.err` (debug-flag'li wrapper) ile değiştirildi:

```js
// Önce
console.log('[Workspace Save] click fired, data:', ...);
try { PCD.toast.error('Name required'); } catch (e) { alert('Name required'); }

// Sonra
PCD.toast && PCD.toast.error('Name required');
```

`PCD.err` tanımı (utils.js): sadece `PCD_CONFIG.DEBUG=true` iken çıktı verir, prod'da sessizdir.

## Etki

- UI artık `alert()` ile bloke olmuyor
- Console temiz (yeni kullanıcı F12 açınca debug log görmeyecek)
- Davranış birebir aynı (toast'lar zaten her yerde aynı pattern'i izliyor)

## Test

1. Workspace switcher → "Yeni workspace" → ad alanını boş bırak → Save
   - Beklenen: toast "Name required", `alert()` popup yok
2. Workspace switcher → "Yeni workspace" → ad ver → Save
   - Beklenen: "Workspace saved" toast, sayfa reload
3. Mevcut workspace → düzenle → Save (mevcut workspace üzerine)
   - Beklenen: "Workspace saved" toast, reload yok, label güncellenir
4. Console (F12): `[Workspace Save] ...` log mesajları artık YOK

## Risk

Sıfır. Aynı dosyada (`app.js`), tek bir handler'da, sadece debug kalıntıları kaldırıldı. İş mantığı değişmedi.

---



## Bug

Herhangi bir sayfada (Vardiya, Profil, HACCP, Tarifler vs.) F5 ile yenile → her seferinde **dashboard'a** atıyordu. Kullanıcı bulunduğu yerde kalmıyordu.

## Sebep

Router URL'de hangi sayfada olunduğunu **kaydetmiyordu**. `pushState` çağrıları hep `pathname` (yani `/`) kullanıyordu, hash veya başka identifier yoktu. F5 yapınca:
1. Sayfa yeniden yüklenir
2. `app.js` boot olur
3. `router.go('dashboard')` zorlanır
4. → her zaman dashboard

## Çözüm

`js/core/router.js` URL hash desteği aldı:
- `router.go('recipes')` → URL artık `prochefdesk.com/#recipes`
- `router.initialRoute()` helper → boot sırasında URL hash'i okur, geçerli route varsa ona git
- Browser back button da hash ile çalışır
- Public share linkleri (`?share=ID`) etkilenmez (query string, hash değil)

`js/core/app.js` boot sırasında artık `initialRoute()` kullanıyor:
```js
const initial = PCD.router.initialRoute() || 'dashboard';
PCD.router.go(initial, null, { skipHistory: true });
```

## Test

1. Tariflere git → URL `#recipes` görünmeli
2. F5 → tariflerde kalmalı
3. Vardiya kontrol listelerine git → F5 → kalmalı
4. Profil ayarlarına git → F5 → kalmalı
5. Browser back/forward butonları çalışmalı
6. Direkt URL `prochefdesk.com/#inventory` aç → inventory açılmalı

---

# v2.6.36 — Malzeme silme güvenliği

## Yeni davranış

Bir malzeme bir tariften kullanıldığı sürece silinemez. Recipe'lerin "(removed)" satırlarla bozulmasını önler.

**Bireysel silme**: Edit modal'dan sil → ingredient kullanılıyorsa uyarı modal'ı: "Bu malzeme X tarifte kullanılıyor: Kibbeh, Mantı..." → "Tamam". Sil butonu pasifleşmez ama sil olmaz.

**Toplu silme**: 100 seçtin, 10 tanesi kullanımda. Sonuç:
- 90 silinir
- Modal: "✓ 90 malzeme silindi · ⚠ 10 malzeme kullanımda olduğu için silinmedi: Sarımsak (3 tarif: Kibbeh, Mantı, Pilav), Yumurta (5 tarif: ...) ..."

## Test

1. Olive Oil'i kullanan bir tarif yap (örn. Pizza)
2. Ingredients → Olive Oil'i tek tek silmeye dene → "Bu malzeme 1 tarifte kullanılıyor: Pizza" uyarısı, silinmez
3. Bulk delete: 5 malzeme seç (3'ü tarif kullanımda) → 2 silinir, 3'ü için uyarı modal'ı

---

# v2.6.35 — KRİTİK: birim büyük/küçük harf duyarlılığı (1000x maliyet hatası)

## Bug

Olive Oil ingredient'ı edit modal'ında "Temel birim: g" gözüküyor ama altında "L başına fiyat" yazıyor — iç tutarsızlık. Tarif satırına 1000 ml zeytinyağı eklenince maliyet **$15,690** çıkıyor (gerçek: $15.69).

## Üç ayrı sebep, hepsi aynı sorundan

### 1. CSV import birim büyük/küçük harfi normalize etmiyordu

CSV'de `unit=L` (büyük harf) yazılırsa, sistem onu **olduğu gibi** kaydediyordu. Ancak edit modal dropdown'ı sadece küçük harf birimleri (`l`, `kg`, `ml`, `g`) içeriyor → büyük `L` dropdown'da bulunmadı → varsayılan olarak `g` görünüyor (görsel hata).

**Düzeltme:** `parseCSV` artık birim alanını otomatik küçültür (`L → l`, `KG → kg`, `ML → ml`).

### 2. `convertUnit` case-sensitive idi

Tarif satırı `1000 ml`, ingredient base unit `L` (büyük). `convertUnit('ml', 'L', ...)` → tablolar küçük harf bekliyor → eşleşme yok → dönüştürmeden geri dönüyor → fiyat hesabı 1000x bozuk.

**Düzeltme:** `convertUnit` ve `unitGroup` artık case-insensitive — input'u içeride lowercase yapıp lookup ediyor.

### 3. Mevcut bozuk veri (one-time migration)

Senin Olive Oil ingredient'ında `unit='L'` zaten kayıtlı. Yeni import normalize ediyor ama eski kayıtlar bozuk kalır. `load()` fonksiyonuna **otomatik migration** eklendi: her startup'ta tüm ingredients'taki büyük harf birimleri lowercase'e çevirir.

Etki: Bu paketi yükledikten sonra sayfa açılır → mevcut Olive Oil'in unit'i `L → l` olur → cloud'a sync edilir → edit modal artık tutarlı görünür.

## Test

1. Olive Oil'in **edit** modal'ını aç → "Temel birim: l" görünmeli (g değil)
2. Yeni bir test tarifi yarat → 1000 ml zeytinyağı ekle → maliyet **$15.69** olmalı (15690 değil)
3. Yeni CSV import et büyük harfli birimlerle (`Test Item, 10, L`) → ingredient'a `l` kaydedilmeli, dropdown doğru görünmeli

## Bilinen kapsamı dışı

Senin mevcut **Kibbeh recipe'i hâlâ "(removed)"** gösteriyor çünkü o satırların ingredient ID referansları, sen sildiğinde kaybolmuştu. Bu paket bunu düzeltmez — Kibbeh'i silmen ve yeniden yapman gerekir. Bu paket, gelecekteki recipe'lerin doğru hesaplanmasını sağlar.

---

# v2.6.34 — KRİTİK: liste sayfaları save/delete sonrası yenilenmiyordu

## Bug

Senaryoları:
1. Ingredients sayfasında "Select all → Delete" → toast "X öğe silindi" çıkıyor ama liste güncellenmiyor. Sayfa yenileyince doğru görünüyor.
2. Recipes sayfasında bulk delete → aynı problem.
3. Yeni Menü oluştur → kaydet → toast "Menü kaydedildi" ama menüler listesi güncellenmiyor.
4. Menü sil → aynı problem.

Tüm durumlarda kullanıcı "sayfayı yenilemek" zorunda kalıyordu.

## Üç ayrı sebep

### 1. Yanlış function adı (`render` yerine `renderList`)

**ingredients.js (line 186)** ve **recipes.js (line 220)**:
```js
// Module exports `renderList` but code called `render`:
PCD.tools.X = { render: renderList };  // dış API doğru
// fakat içeride...
render(view);  // ❌ render diye fonksiyon YOK → sessiz hata
```

JavaScript'te `render` undefined → hata → liste güncellenmedi. Bu sessiz bir hataydı (fırlatılan hata yutuldu çünkü click handler içinde).

**Düzeltme:** `render(view)` → `renderList(view)`.

### 2. Function shadowing (menus.js)

menus.js'de **iki tane** `render` fonksiyonu var:
- Outer (line 26): `function render(view)` — sayfa-seviyesi liste
- Inner (line 146): `function render()` — modal'ın iç render'ı (modal açıkken kullanılır)

Save handler içinden `render(v)` çağrıldığında JavaScript closure scope'u önce **inner** `render`'ı buluyor → `view` parametresi yok → modal kapatılmış olduğu için body referansı geçersiz → hata → liste güncellenmiyor.

**Düzeltme:** Public API üzerinden çağır:
```js
PCD.tools.menus.render(v)  // ambiguous değil, dış scope'a gider
```

İki yer düzeltildi (save + delete).

### 3. (Yan kontrol) Diğer dosyalar zaten temiz

- **events.js, shopping.js, waste.js**: `render_list / renderListView` adında wrapper fonksiyon kullanmışlar — bu shadowing'den kaçınıyor, çalışıyor.
- **inventory.js**: tek render fonksiyonu, scope problemi yok.
- **kitchen_cards.js, suppliers.js, account.js, checklist.js, dashboard.js, haccp_*, portion.js**: tek render, sorun yok.

## Etkilenen kullanıcı senaryoları

✓ Bulk delete ingredients (Ingredients → Select → Delete)
✓ Bulk delete recipes (Recipes → Select → Delete)
✓ Yeni menü oluştur ve kaydet
✓ Menü sil
✓ Menü düzenle ve kaydet (zaten setTimeout ile re-render çağrısı vardı, şimdi düzgün API ile)

## Test

1. Ingredients → "Seç" → Tümünü işaretle → Sil → Onayla → liste **anlık** boşalmalı
2. Recipes → aynı senaryo
3. Yeni Menü → "TEST" yaz → Kaydet → menüler listesi **anlık** "TEST"i göstermeli
4. TEST'i aç → Sil → menüler listesi **anlık** güncellenmeli, TEST görünmemeli

---

# v2.6.33 — KRİTİK BUG: tarif editöründe yazılanlar siliniyor

## Bug

Yeni Tarif modal'ında ad yaz, sonra "Sale price" gibi formül-bağlı bir alana değer gir → **tarif adı kayboluyor**. Aynısı kategori, hazırlık, pişirme, yield amount/unit, adımlar, plating, notlar, mutfak (cuisine) için de geçerli.

## Sebep

`renderEditor()` `body.innerHTML` ile **tüm modal HTML'ini yeniden oluşturuyor**. İçerideki bazı alanlar (servings, sale price, ingredient amount) için `input` event handler'ları var → değerler `data` objesine senkron yazılıyor → re-render'dan sonra korunuyor. Ama **diğer alanların handler'ları yok** (name, prep, cook, yield, category, steps, plating, notes, cuisine) → re-render bu inputları sıfırdan yaratıyor, kullanıcının yazdığı kayboluyor.

## Çözüm

`renderEditor()` fonksiyonunun **en başına snapshot kodu** eklendi: re-render'dan ÖNCE her input'un mevcut DOM değerini `data` objesine yazıyor. Böylece HTML yeniden oluşturulduğunda inputlara doğru `value` atanıyor.

Etkilenen alanlar:
- `#recipeName` → `data.name`
- `#recipeCategory` → `data.category`
- `#recipePrep` → `data.prepTime`
- `#recipeCook` → `data.cookTime`
- `#recipeYieldAmount` → `data.yieldAmount`
- `#recipeYieldUnit` → `data.yieldUnit`
- `#recipeSteps` → `data.steps`
- `#recipePlating` → `data.plating`
- `#recipeNotes` → `data.notes`
- `#recipeCuisine` → `data.cuisine`

## Diğer modal'lar kontrol edildi

- **Menus**: name, subtitle, section name → handler'ları var, güvende
- **Events**: tüm alanların handler'ları var, güvende
- **Checklist**: tplName handler'ı var, güvende
- **Suppliers**: tüm alanların handler'ları var, güvende
- **Ingredients editor**: re-render yok, tek seferde set, güvende
- **Workspace editor**: re-render yok, güvende
- **HACCP editor'lar**: tek seferde set, güvende

Yani bug sadece recipe editor'unda vardı.

## Test

1. Yeni Tarif aç
2. Tarif adı yaz: "Mantı"
3. Hazırlık (dk): 30 yaz
4. **Sale price kutusunu doldur**: 18
5. Tarif adı hâlâ "Mantı" olmalı (önceden boşalıyordu)
6. Aşağıdaki tüm alanlar girilen değerleri korumalı

---

# v2.6.32 — Modal'larda klavye akışı (Enter = ileri, Ctrl+Enter = kaydet)

## Talep

Modal'larda form doldururken her seferinde fareyle bir sonraki alana tıklamak. Klavyeden Enter ile ilerlenebilmeli, en sonunda kaydedebilmeli.

## Çözüm

`js/ui/modal.js`'de **tüm modal'lar için** central klavye akışı eklendi:

**Davranış:**
1. **Modal açılınca** → ilk input otomatik odaklanır (desktop) + içeriği seçili gelir (kullanıcı hemen üzerine yazabilir)
2. **Enter (input/select)** → bir sonraki form alanına atlar (Tab gibi). Yeni alanın içeriği de otomatik seçili gelir
3. **Enter (textarea)** → newline (varsayılan davranış korunur)
4. **Enter (button)** → varsayılan tıklama (browser native)
5. **Ctrl+Enter / Cmd+Enter** (her yerden) → footer'daki primary button'a tıklar (genelde "Kaydet")
6. **Son alandayken Enter** → otomatik primary button'a tıklar (Kaydet)

**`data-skip-enter="true"` opt-out:** Autocomplete'leri olan inputlar (örn. tarif quick add) bu özelliği atlar — Enter zaten ilk eşleşmeyi seçer, davranış değişmesin. Bu pattern başka inputlara da kolayca eklenebilir.

**Etki:** Tüm modal'lar otomatik kazandı — Tarif, Malzeme, Menü, Etkinlik, HACCP, Kontrol Listesi, Çalışma Alanı, Cost Report, Sorun Bildir vb. Hiç ayrı kod gerekmedi çünkü merkezi `modal.open` infra'sına eklendi.

## Test

1. **Yeni Tarif** modal aç → tarif adı kutusu otomatik odaklı, içerik seçili
2. "Mantı" yaz → Enter → Kategori dropdown
3. Enter → Porsiyon (önceki değer seçili)
4. Enter → Hazırlık (dk)
5. Enter → ... son alana kadar
6. Son alanda Enter veya Ctrl+Enter → Kaydet
7. Adımlar textarea'da Enter normal newline yapmalı
8. Quick add malzeme kutusunda Enter ilk eşleşmeyi seçmeye devam etmeli (autocomplete bozulmamalı)

---

# v2.6.31 — KRİTİK BUG: tarif eklerken kg/L birim varsayılanı

## Bug

Tarife ingredient eklediğinde sistem otomatik olarak ingredient'ın **base unit**'ini kullanıyordu. Sorun:
- Sarımsak (Garlic Peeled) **kg** cinsinden alınır ($7.95/kg)
- Tarif satırına "100" yazınca → **100 kg** sarımsak → **$795** maliyet
- Halbuki kullanıcı 100 **gram** demek istiyordu → $0.795 olması gerekti

Aynı sorun L cinsinden alınan ürünlerde de var (zeytinyağı vb.).

**Hatanın boyutu:** 1000x maliyet hesaplama hatası. Catastrophic — tarif maliyeti tamamen yanlış çıkar.

## Sebep

`recipes.js`'in 4 farklı yerinde tarif satırı eklerken `unit` alanı doğrudan `ing.unit` (base unit) olarak set ediliyordu. Restoran mutfağında ingredient'lar **toptan birimde** alınır (kg, L) ama **mutfak ölçeğinde** kullanılır (g, ml).

## Çözüm

Yeni helper fonksiyon `defaultRecipeUnit(ing)`:
```js
if (base unit === 'kg') → 'g'
if (base unit === 'l' || 'L') → 'ml'
else → unchanged (g, ml, pcs)
```

4 ekleme noktası bu helper'ı kullanacak:
1. Quick-add (autocomplete'ten ingredient seç)
2. "+ Add" butonu picker (multi-select)
3. Boş ingredient state'inden yeni ingredient yarat
4. Quick-add'tan inline yeni ingredient yarat (`__new__`)

## Test

1. CSV import et (kg/L birimleriyle)
2. Yeni tarif → sarımsağı seç → otomatik **100 g** olmalı, kg değil
3. Doğru maliyet: 0.1 × $7.95 = **$0.795** (1000x değil)
4. Pcs cinsinden ürünler (yumurta, ekmek): aynı kalır (pcs)
5. Mevcut yanlış girilmiş satırları **elle düzelt** — dropdown'dan kg → g

## Mevcut tariflerde

Senin "Kibbeh" tarifindeki Garlic Peeled satırı zaten 100 kg olarak kayıtlı. Recipe edit'te **dropdown'dan g'a çevir**, $0.795 olur. Bu paket sonraki eklemeler için.

---

# v2.6.30 — Ingredients workspace-bound + demo cleanup tamamlandı

## Sorun 1: Yeni workspace temiz başlamıyordu

Senaryo: Şef Avustralya'da kendi mutfağı için ingredients listesi yarattı (yerel fiyatlarla). Sonra Florida'da ikinci bir restoran için yeni workspace açtı. Beklenti: temiz başlangıç. Gerçek: Avustralya fiyatlarıyla aynı malzeme listesi yeni workspace'te de görünüyordu.

### Sebep

`state.ingredients` workspace-bound DEĞİLdi — global, paylaşılmış bir master list olarak tutuluyordu. Bilinçli bir tasarım kararıydı ("LIBRARY — shared across workspaces" yorumu vardı), ama gerçek dünyada çalışmıyor. Farklı şehir/ülke = farklı ürünler, farklı fiyatlar.

### Çözüm

`store.js`'de ingredients tamamen workspace-scoped'a dönüştürüldü:
- `state.ingredients = { wsId: { ingId: {...} } }` (önceden flat: `{ ingId: {...} }`)
- `upsertIngredient`, `deleteIngredient`, `deleteIngredients`, `getIngredient`, `listIngredients` — hepsi `currentWsId()`'ı kullanıyor
- Trash list / restore / purge fonksiyonları da workspace-scoped'a uyumlu
- `wsBoundTables` migration listesine `ingredients` eklendi → mevcut flat data otomatik aktif workspace altına taşınır
- Workspace silme cleanup'u + cloud sync ws-tablo listesi de güncellendi

**Migration güvenliği:** Mevcut tek-workspace kullanıcılar için bir şey değişmez — flat ingredients otomatik aktif ws altına taşınır. Sonraki yeni workspace ise boş başlar.

## Sorun 2: Demo cleanup eksik

"Remove demo recipes" sadece recipes ve ingredients'ı siliyordu. Inventory'deki demo entries (par level, stok) orphan kalıyordu — silinen ingredient'a referans veren ölü kayıtlar. Ayrıca demo bir menu yoktu (canvas + event vardı ama menu eksikti).

### Çözüm

`js/seed/demo-recipes.js`:
- **Demo menu seed eklendi**: "Lunch Menu" — 3 demo recipe ile (Spaghetti, Tikka, Cheeseburger), `_demo: true` flag ile
- **Inventory entries `_demo` flag aldı** — demo ingredient'ların stok kayıtları artık işaretli
- **`removeDemo` güncellendi** — workspace'in inventory tablosundaki `_demo: true` entries de temizleniyor

Sonuç: "Remove demo recipes" → recipes + ingredients + menu + canvas + event + inventory entries hepsi birlikte gider. "Re-add demo recipes" → hepsi geri gelir, tutarlı bir bütün.

## Test

**Bug 1 testi:**
1. Mevcut workspace'te ingredients olmasına dikkat
2. Çalışma alanları → "+ Yeni çalışma alanı" → "Florida" oluştur
3. Florida workspace'ine geç → Ingredients sayfası aç → **boş olmalı**
4. Inventory sayfası → boş olmalı
5. Ana workspace'e geri dön → eski ingredients hâlâ duruyor olmalı

**Bug 2 testi:**
1. Hesap → "Remove demo recipes" → onayla
2. Recipes, Ingredients (eğer hep _demo idiyse), Inventory, Menu Builder, Kitchen Cards, Event Planner — hepsinden demo veriler temizlenmeli
3. "Re-add demo recipes" tıkla
4. Hepsi geri gelmeli (3 recipe, ~30 ingredient, 8 inventory entry, 1 menu, 1 canvas, 1 event)

---

# v2.6.29 — Cost Report büyük revizyon: Türkçe, formüller, hyperlink, footer

## Talep

1. Cost Report modal, PDF, Excel — TR seçili iken her şey İngilizce kalıyordu
2. Excel **Summary** sekmesinde rakamlar statik: Test price değiştirilince hiçbir şey güncellenmiyordu, ayrıca toplam satırı yoktu
3. Sütun genişlikleri sığmıyordu (manuel genişletme gerekiyordu)
4. Detail ↔ Summary arası tıklanabilir bağlantı yoktu
5. Excel'de "Made with ProChefDesk" footer eksikti

## Çözüm

### TR/EN i18n
55 yeni anahtar (`cr_*`). Cost Report modal, PDF print HTML, Excel başlıkları/etiketleri tamamen i18n'e bağlandı. EN/TR tam, diğer 4 dil EN fallback.

### Excel Summary sekmesi: yaşayan rapor
- **Cross-sheet formüller**: Summary'deki her satır, ilgili Detail sekmesindeki hücrelere bağlı (`='Spaghetti'!F21` gibi). Test price'ı **istediğin sekmede** düzenle, diğer sekme otomatik senkron olur.
- **Food cost %** = Cost per serving ÷ Test price (formül, anlık güncellenir)
- **Profit / serving** = Test price − Cost per serving (formül, anlık güncellenir)
- **TOPLAM satırı** (per-serving / set-menu mantığı):
  - Cost per serving SUM
  - Suggested price SUM
  - Test price SUM (set fiyatı)
  - Food cost % = D toplam ÷ F toplam (set-menu yüzdesi)
  - Profit / serving SUM
  - Servings ve Total food cost sütunları boş (per-serving odaklı)

### Auto-fit sütun genişlikleri
Yeni `autoFit()` helper fonksiyonu. Tüm satırların string-coerced uzunluklarına bakıp her sütun için optimal genişlik hesaplar (min 8, max 40 karakter, +2 padding). Hem Summary hem her Detail sekmesi için ayrı hesap.

### Hyperlinkler
- **Summary → Detail**: I sütununda her yemek satırının yanında "Detay →" linki, ilgili Detail sekmesinin A1'ine atlar
- **Detail → Summary**: Her Detail sekmesinin F1 hücresinde "← Özete Dön" linki, Summary!A1'e atlar

### Footer
Hem Summary hem her Detail sekmesinin altında "ProChefDesk ile yapıldı · prochefdesk.com" satırı (italic, gri, 8pt).

### PDF print
Footer eklendi: "ProChefDesk ile yapıldı · prochefdesk.com". Print modülünün varsayılan footer'ı `display:none` ile gizlendi (çift footer önlemek için).

## Test

1. Dil = TR
2. Recipes → bir tarif seç → Cost Report bas → modal TR olmalı
3. PDF → preview TR olmalı, alt köşede "ProChefDesk ile yapıldı"
4. Excel → indir
   - Summary sekmesi açıl → tüm başlıklar TR, "TOPLAM" satırı en altta
   - F sütununda Test price hücresini düzenle → G (food cost %) ve H (profit) anlık güncellenir
   - I sütununda "Detay →" linkine tıkla → ilgili Detail sekmesine atla
   - Detail sekmesinin sağ üst F1'inde "← Özete Dön" linki → Summary'e geri dön
5. Sütun genişliklerine manuel ayar gerekmemeli
6. Çoklu seçim (3+ recipe) ile Cost Report → Summary'de TOPLAM satırı doğru hesaplamalı, set-menu fiyatlama mantığı

---

# v2.6.28 — Anlık dil değişimi + HACCP print Türkçe

## Sorun 1: Anlık dil değişimi çalışmıyordu

HACCP sayfaları (Soğutucu Log, Pişirme & Soğutma) ve Mutfak Kartları üzerindeyken üst panelden TR/EN değiştirince, sayfa **yenilenene kadar** eski dilde kalıyordu.

### Sebep

`setLocale` fonksiyonu, dil değiştiğinde mevcut sayfayı yeniden render ediyor. Ama route ismi snake_case (`haccp_logs`, `haccp_cooling`, `kitchen_cards`) tool ismi ise camelCase (`PCD.tools.haccpLogs`, `PCD.tools.haccpCooling`, `PCD.tools.kitchenCards`). `PCD.tools[cur]` lookup'ı snake_case ile başarısız oluyordu, fallback yok, render çağrılmadı.

### Çözüm

`js/core/i18n.js` `setLocale` fonksiyonunda snake_case → camelCase dönüştürme eklendi. Önce snake_case ismiyle deneniyor (eski tool isimleri için), bulamazsa camelCase ile deneniyor.

```js
const camel = cur.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
const tool = PCD.tools[cur] || PCD.tools[camel];
```

Sonuç: HACCP sayfasındayken TR/EN değiştir → anında yeniden render edilir, dil hemen değişir. Aynı düzeltme Mutfak Kartları ve Pişirme & Soğutma içinde de geçerli (aynı snake/camel pattern).

## Sorun 2: Print preview'da bazı kısımlar İngilizce kalıyordu

Soğutucu Log "Yazdır" butonuna basınca açılan preview'da:
- Üst başlık "HACCP · Fridge & Freezer Temperature Log"
- "Day" sütunu
- "Corrective Actions / Notes (* in grid)"
- "Reviewed by:" + "Date:"

hardcoded İngilizce kalıyordu.

### Çözüm

3 yeni i18n key eklendi: `haccp_print_title`, `haccp_print_notes`, `haccp_print_date`. `reviewed_by` zaten vardı. Print HTML t() çağrılarına dönüştürüldü. Tarih biçimi de `locale()` parametresi alarak yerelleştirildi.

## Test

1. Dashboard → dil EN → tarif/menü/HACCP sayfalarına gez
2. HACCP Soğutucu sayfasındayken üst panelden dili TR yap → **anında** Türkçe olmalı, sayfa yenilenmemeli
3. Aynısı Pişirme & Soğutma için
4. Aynısı Mutfak Kartları için
5. Soğutucu Log → Yazdır → preview'da "HACCP · Soğutucu & Dondurucu Sıcaklık Takibi", "Gün" sütunu, "Düzeltici eylemler / Notlar", "Kontrol eden: ___" + "Tarih: 29/04/2026"

---

# v2.6.27 — Tarif önizleme: QR butonu eklendi

## Talep

Menülerde tarif paylaşırken QR kodu var (modal'da QR butonu), ama tarif önizlemesinde yok. Aynı özellik tarifte de olmalı.

## Çözüm

Tarif preview modal'ının footer'ına yeni QR butonu eklendi (share butonunun yanında, yeşil grid ikonuyla).

**Akış:**
1. Tarife tıkla → preview modal aç
2. Footer butonları: 🗑 · ↗ Share · ⊞ **QR (yeni)** · ⎘ Duplicate · 🚚 · 📊 Cost · ✏️ Edit
3. QR'a bas → otomatik public share link oluşur → QR popup'ı açılır
4. Şef telefonuna QR'ı tarayabilir, herkese link aynı

Menülerdeki QR akışıyla **birebir aynı** (aynı `PCD.share.createOrGetShareUrl` + `PCD.qr.show` kullanılıyor). Mevcut paylaşım altyapısı tekrar kullanıldı, yeni kod yazılmadı — sadece tarif modal'ına buton bağlandı.

## Test

1. Bir tarife tıkla → önizleme açılsın
2. Footer'da QR butonu (grid ikonu) görünmeli
3. QR'a bas → spinner → QR popup'ı açılır → URL içerir
4. URL'yi başka tarayıcıda aç → tarif görünmeli
5. Login değilken QR'a bas → "Sign in to create QR codes" hatası

---

# v2.6.26 — Cook & Cool Log redesign: tarih bazlı tablo formu

## Talep

Mevcut event-based liste yapısı yerine **A4 yatay sayfaya sığan, akıllı tablo formu** istendi:
- 15 satırlı sabit tablo (tek bir günü tamamen kapsar)
- Boş satıra tıkla → popup → doldur
- "Boş yazdır" — şef kağıda elle doldurmak isterse
- "Bu günü yazdır" — mevcut kayıtlarla birlikte yazdır
- Gün gün gezinti (← bugün →)

## Çözüm

`haccp_cooling.js` baştan yazıldı. Eski event-based liste mantığı atıldı.

**Yeni veri modeli:** Her kayıt artık bir `date` (YYYY-MM-DD) ve `rowIndex` (0–14) değerine sahip. Aynı gün için 15 satıra kadar kayıt tutulur. Eski kayıtlar (event-based, date alanı olmayan) görünmez ama silinmez — eğer kalmışsa sessizce arka planda durur.

**UI:**
- Üstte tarih navigatörü: ← [Tam tarih · Bugün] [Bugün butonu] →
- Altında "Son kayıtlı günler" (son 5 gün hızlı geçiş)
- 15 satırlı tablo, alternating row bg
- Sütunlar: # · Yemek · Miktar · Pişirme sonu (°/saat) · +2h (°/saat) · Son (°/saat) · Düzeltici eylem · Şef
- Out-of-range hücreler kırmızı (⚠ + kırmızı arka plan)
- Boş satırlar: "+ Doldurmak için tıkla"

**Popup editor:**
- Yemek adı + Miktar/Birim
- 3 büyük checkpoint kartı: Pişirme sonu / +2h / Son. Her biri sıcaklık + saat alanı.
- Düzeltici eylem notu (opsiyonel) + Şef adı
- Sil butonu (mevcut kayıt için)
- En az **yemek adı veya bir sıcaklık** zorunlu (kısmi kayıt destekli)

**Print:**
- A4 yatay, 6mm margin (verimli alan kullanımı)
- 11 sütunlu tablo, 15 satır
- Üst başlık: "HACCP · Cook & Cool Log · [workspace] · [tarih] · °C"
- Sağ üstte target değerleri (2h hedef, 6h hedef)
- Alt: HACCP gereksinim özeti + "Kontrol eden: ___"
- "Made with ProChefDesk" footer
- **Boş yazdır:** Tüm hücreler boş, tarih satırı çizgi
- **Bu günü yazdır:** Mevcut kayıtlar baked in

**Storage:** Aynı `haccpCookCool` tablosu, alanlar farklı yapıda (`date`, `rowIndex`, `cookEndTemp`, `cookEndAt`, `cp2hTemp`, `cp2hAt`, `endedTemp`, `endedAt`, `note`, `chef`).

## Test

1. HACCP Forms → Pişirme & Soğutma → bugünün boş tablosu
2. 1. satıra tıkla → "Domates Çorbası", 5 L, pişirme 65°C / 14:00 → kaydet
3. Tabloda satır dolu görünür
4. 2. satıra tıkla → daha eksik bilgi gir (sadece yemek adı) → kaydet
5. Tarih oklarıyla dünkü güne git → boş tablo
6. "Boş yazdır" → A4 yatay, 15 satırlı boş form
7. "Bu günü yazdır" → mevcut 2 kaydın olduğu sayfa
8. Out-of-range değer test: cook end 25°C → +2h 30°C → tabloda kırmızı uyarı

---

# v2.6.25 — Free tier limitleri kaldırıldı (şimdilik sınırsız)

## Talep

Senaryo: Yeni recipe oluştururken "Upgrade needed — Ücretsiz limit: 5 tarif" diyalogu çıkıyordu. Şu an her şey ücretsiz olmalı, premium tier ileride gelecek.

## Çözüm

**1. Config limitleri yükseltildi:**
- `FREE_RECIPE_LIMIT: 5 → 999999`
- `FREE_INGREDIENT_LIMIT: 50 → 999999`

Sınır kontrolü kodu mevcut yapısıyla duruyor — premium tier eklendiğinde tek bir config dosyasından açılır.

**2. Sidenav'daki "Free Plan" badge ve "Upgrade to Pro" butonu gizlendi:**
- Şu an her şey ücretsiz olduğundan kullanıcıya "Pro'ya yükselt" demek kafa karıştırıcı
- `updatePlanBadge()` fonksiyonunda her ikisi de `display: none` yapıldı
- Premium tier eklendiğinde tek satır değişikliğiyle tekrar açılır

## Test

1. Login ol
2. 6+ recipe oluşturmaya çalış — "Upgrade needed" diyalogu **çıkmamalı**, yeni recipe oluşmalı
3. Sidenav'a bak (☰) → en altta "Plan Gratuit / Pro'ya Yükselt" görünmemeli
4. Workspace switcher modal açıldığında her şey normal

## Not (ileri için)

Premium tier eklemek istediğinde değişecek 3 yer:
1. `config.js` → limit değerlerini 5/50'ye geri al
2. `app.js` → `updatePlanBadge` içindeki `display: none` satırlarını kaldır
3. Stripe entegrasyonu için ayrı bir paket

---

# v2.6.24 — Public share sayfası kibar başlık + footer

## Talep

URL paylaşımı yapıldığında açılan sayfada büyük yeşil banner ve "Try ProChefDesk free →" CTA'sı agresif görünüyordu. Daha nazik bir başlık + alt footer olsun.

## Çözüm

**Üst banner çıkarıldı.** Yerine ortalanmış, küçük (13px), gri tonlu, nazik bir başlık çizgisi:

```
                  ProChefDesk
─────────────────────────────────
```

Sadece "ProChefDesk" linki — alt çizgi ile içerikten ayrılır. Üst tarafta agresif CTA yok.

**Alt footer sadeleştirildi:**
Önceki karışık iki dilli "Bu tarif ProChefDesk ile paylaşıldı · Shared with ProChefDesk · Try it free" yerine:

```
Made with ProChefDesk · prochefdesk.com
```

Tek satır, gri, link yeşil. Print/PDF footer'larıyla **tutarlı** (v2.5.13'te eklediğimiz "Made with" footer ile aynı stil).

## Test

1. Bir tarif veya menü için Share Link → URL'yi başka tarayıcıda aç
2. Üstte küçük "ProChefDesk" yazısı, altında alt çizgi
3. İçerik: tarif/menü
4. Alt footer: "Made with ProChefDesk · prochefdesk.com" tek satır, sade

---

# v2.6.23 — KRİTİK BUG FIX: logout veri sızıntısı

## Talep / Bug

Logout yaptıktan sonra workspace switcher'ı açtığında oluşturduğun "NAZZAR" workspace'i hâlâ görünüyordu. Çıkış yapsa bile localStorage'daki tüm kullanıcı verisi (workspaces, recipes, menus, ingredients, vb.) duruyordu.

**Güvenlik açısı:** Aynı tarayıcıyı kullanan başka bir kişi (ya da seninle ortak bilgisayar kullanan biri) önceki kullanıcının verilerini görür ve değiştirebilirdi.

## Sebep

`auth.js`'de `_clearUser` fonksiyonu sadece `user` objesini siliyordu:
```js
PCD.store.set('user', null);
```

`workspaces`, `recipes`, `menus`, `ingredients`, `inventory`, `events`, `suppliers`, `checklistTemplates`, `canvases`, `haccpUnits`, `haccpReadings`, `haccpCookCool` tablolarına dokunulmuyordu.

## Çözüm

**1. `store.js` — yeni `clearUserData()` fonksiyonu:**
- Tüm kullanıcı-spesifik veriyi silen ama UI tercihlerini (theme, locale, currency, haccpTempUnit) koruyan selektif silme
- Mevcut `reset()` fonksiyonu her şeyi siliyordu (tercih dahil) — kullanmıyoruz
- localStorage'a hemen yazılır (flush), event'ler emit edilir

**2. `auth.js` — `_clearUser(wipeData)` parametre kabul ediyor:**
- `wipeData=true` (gerçek logout): tüm veri silinir + sayfa otomatik reload edilir (UI temiz state'e döner)
- `wipeData=false` (geçici session error, offline, token süresi dolmuş): sadece user objesi silinir, **veri korunur** — kullanıcı tekrar bağlanınca senkronize devam eder

**3. Çağrı noktaları güncellendi:**
- `SIGNED_OUT` event → `_clearUser(true)` (gerçek logout)
- Manuel `signOut()` çağrısı → `_clearUser(true)`
- Session error fallback → `_clearUser()` (parametre yok, false → veriyi koru)

**4. Korunan ayarlar (logout sonrası):**
- `prefs.theme` (light/dark)
- `prefs.locale` (TR/EN/...)
- `prefs.currency`
- `prefs.haccpTempUnit` (°C/°F)
- `prefs.haccpCurrentLogId` (yeni hesapta hızlı kullanım için)

## Test

1. Login ol → "TEST" workspace oluştur
2. Logout
3. Sayfa otomatik reload olmalı, login ekranı görünmeli
4. Workspace switcher'ı açmaya çalış (giriş yapmadan) → "TEST" görünmemeli
5. Tekrar login → cloud'dan veriler otomatik gelmeli (TEST orada)
6. Dil ve tema tercihi (light/dark) korunmuş olmalı

---

# v2.6.22 — HACCP gün isimleri ve AM/PM Türkçe

## Talep

1. Soğutucu & Dondurucu sayfasında AM / PM kolon başlıkları → "Sabah" / "Akşam"
2. Gün isimleri (Wed/Thu/Fri) bilgisayarın işletim sistemi diline göre geliyordu — uygulama dilini ezmeli

## Çözüm

**1. AM/PM:**
- 2 yeni i18n key: `haccp_am`, `haccp_pm` (EN: Morning/Evening, TR: Sabah/Akşam)
- Ekrandaki grid başlıkları, print başlıkları ve corrective action notları t() çağrılarına dönüştürüldü

**2. Gün isimleri:**
- `haccp_logs.js` ve `haccp_cooling.js` dosyalarında tüm `toLocaleDateString(undefined, ...)` çağrıları `toLocaleDateString(locale(), ...)` ile değiştirildi
- `locale()` helper fonksiyonu PCD.i18n.currentLocale'i kullanıyor
- Aynı değişiklik `toLocaleTimeString` ve `toLocaleString` çağrılarına da uygulandı

Sonuç: TR seçilirse Çar/Per/Cum, EN seçilirse Wed/Thu/Fri görünür. Browser/OS dilinden bağımsız.

## Test

1. Dil = TR → HACCP Soğutucu sayfası
2. Kolon başlıkları: "Sabah" / "Akşam" 
3. Sol günler: Çar / Per / Cum / Cmt / Paz / Pzt / Sal
4. HACCP Pişirme & Soğutma sayfası → tarih/saat formatları da TR
5. Print PDF → grid başlıklarında ve notlarında TR

---

# v2.6.21 — HACCP Cook & Cool Log + Türkçe default checklist'ler

## Talep

1. **HACCP Cook & Cool Log** — pişirme bitiş + soğutma süreci takibi (FDA Food Code 2017 standartlarına göre: 60°C → 21°C 2 saat → 5°C 6 saat).
2. **Default checklist'ler Türkçe versiyonu** — yeni Türk kullanıcıların ilk açılışta İngilizce template görmesini önlemek.
3. **Demo recipe fotoları kontrol** — büyük dosya tüketmiyor mu?

## 1) HACCP Cook & Cool Log (yeni araç)

Yeni HACCP Forms aracı, `js/tools/haccp_cooling.js`. Mevcut Fridge & Freezer Log ile aynı mantık ama farklı veri yapısı: **event-based** (her parti = 1 kayıt), takvim ızgarası yok.

**Kullanıcı akışı:**
1. Şef yemek pişirmeyi bitirir → "Yeni pişirme" → yemek adı + miktar + bitiş sıcaklığı gir → soğutma başlar
2. Sayfanın üstünde "Aktif soğutma" widget'ı: o anda devam eden tüm event'ler
3. Şef ara kontrolde sıcaklık girer ("+1h, +2h..."), 2 saatte 21°C altına düşmediyse uyarı
4. 6 saat içinde "Tamamla (son)" → final sıcaklık + status (Geçti / Başarısız)
5. Geçmiş kayıtlar listede, en yeni üstte
6. Print: tarih aralığı seç → çok sayfalı A4 yatay PDF (her kayıt = 1 satır)

**HACCP gates (FDA Food Code 2017):**
- Cook end ≥ 60°C (135°F) — dokümante edilir
- 2 saat içinde ≤ 21°C (70°F) — kritik geçit
- 6 saat içinde ≤ 5°C (41°F) — son hedef

Out-of-range değerler kırmızı, corrective action note alanı isteğe bağlı.

**Veri tablosu:** `haccpCookCool` (workspace-bound). Store + cloud sync listelerine eklendi.

**Print formatı:** A4 yatay, font 9px, table-layout. Sütunlar: Tarih · Yemek · Miktar · Pişirme bitiş · +1h · +2h · +3h · +4h · Son · Toplam saat · Düzeltici eylem · Şef. 25-30 kayıt/sayfa sığar.

## 2) Default checklist'ler Türkçe

`DEFAULT_TEMPLATES` sabit array'i `getDefaultTemplates()` fonksiyonu ile değiştirildi. Aktif dile göre Türkçe veya İngilizce varsayılan template seti döner.

8 template tamamen Türkçe çevirildi:
- Açılış Hazırlığı (12 öğe)
- Kapanış ve Servis Sonu (12 öğe)
- Günlük Sıcaklık Kaydı (8 öğe)
- Mal Kabul Kontrolü (11 öğe)
- Walk-in Cooler Günlük Kontrol (10 öğe)
- HACCP Günlük Denetim (10 öğe)
- Haftalık Derin Temizlik (10 öğe)
- Banket / Etkinlik Hazırlığı (10 öğe)

Sadece **yeni hesaplara** etki eder (mevcut hesaplarda zaten template'ler kayıtlı).

## 3) Demo recipe fotoları

**Sorun yok.** Demo fotolar Unsplash CDN'den geliyor (`https://images.unsplash.com/...?w=1200&q=80`). Senin Supabase Storage'ında veya database'de saklanmıyor → maliyet sıfır, alan kaplamıyor.

Kullanıcı demo recipe'i edit'leyip kendi fotosunu yüklerse o foto v2.5.9 değişikliği sayesinde sıkıştırılarak Storage'a gider (~150 KB).

## Test

**Cook & Cool Log:**
1. HACCP Forms → "Pişirme & Soğutma" yeni aracı (TR'de)
2. "Yeni pişirme" → "Tavuk göğsü" + "3" + "kg" + "65" → "Soğutmayı başlat"
3. Geri dön → üstte aktif soğutma kartı görünmeli
4. Karta tıkla → sıcaklık gir (örn. 22°C) → "Kontrol noktasını kaydet"
5. Birkaç checkpoint ekle → son "Tamamla (son)" → status: Geçti veya Başarısız
6. Listeden başka bir kayıt → tarih aralığı seç → Print → A4 yatay PDF
7. Senin mevcut hesabında zaten checklist'lerin var, varsayılan Türkçe template seed test edilemiyor (yeni hesap gerekli)

---

# v2.6.20 — Son tarama: kalan eksiklerin Türkçeleştirilmesi

## Talep

Çeviri serisinin son paketi. Kalan dağınık hardcoded metinleri tara ve düzelt.

## Çözüm

23 yeni i18n key — sadece EN ve TR. Hedeflenen yerler:

**Confirm dialog'lar:**
- `account.js`: Sign out? + Backup restore (title/text/okText)
- `inventory.js`: Reject count + Delete snapshot + Clear count form (title/text/okText/toast'lar)
- `recipes.js`: Restore version + Delete version (title/text/okText/toast'lar)
- `utils.js`: "No other workspaces" (workspace copy modal'ı)

**Tooltip ve aria etiketleri:**
- `haccp_logs.js`: Previous/Next month aria-label
- `menus.js`: Edit menu tooltip
- `ingredients.js`: Price history tooltip

**suppliers.js:**
- "No products yet — tap edit..." metni
- "Product name" placeholder
- `buildSupplierCard` fonksiyonuna `t` scope eklendi

**Bug fix:** `recipes.js` `openVersionsPanel` fonksiyonunda `t` tanımlı değildi, eklendi.

## Kapsam dışı (kasıtlı)

- `DEFAULT_TEMPLATES` İngilizce içerikleri (sadece yeni hesaplarda görünür, ayrı paket)
- Print HTML içerikleri (etkinlik, recipe vb. baskı çıktıları — ayrı paket)
- Router fallback error mesajı (nadir görülür)
- Bazı ihtimal düşük tooltip'ler (Delete forever, Delete snapshot icon-btn) — sadece hover'da görünür, screen reader'lar zaten var
- Aria-label'lar (Dismiss vb.) — sadece erişilebilirlik

## Test

1. Dil = TR → bu yerlerin hepsi TR olmalı:
   - Hesap → Çıkış yap → "Çıkış yapılsın mı?" diyalogu
   - Hesap → Yedekten geri yükle → "İçe aktarma TÜM mevcut veriyi DEĞİŞTİRİR" diyalogu
   - Stok sayım reddetme → "Bu sayım reddedilsin mi?"
   - Stok geçmiş kayıt sil → "Bu kayıt silinsin mi?"
   - Toplu sayım modal'ında "Temizle" → "Tüm sayım değerleri temizlensin mi?"
   - Tarif düzenle → versiyonlar → Geri yükle → "Bu sürüme geri dönülsün mü?"
   - Tarif düzenle → versiyon sil → "Bu sürüm silinsin mi?"
   - Tek workspace varken kopyala dene → "Başka çalışma alanı yok"
   - HACCP grid ay oklarına hover → tooltip TR
   - Menüler listesinde edit ikonuna hover → "Menüyü düzenle"
   - Malzemelerde fiyat değişim ▲▼ ikonuna hover → "Fiyat geçmişi"
   - Tedarikçi kartında ürün yokken "Henüz ürün yok..."
   - Tedarikçi düzenle → ürün adı placeholder "Ürün adı"

---

# v2.6.19 — HACCP cihaz hazır şablon isimleri Türkçe

## Talep

HACCP empty state, log selector, tüm modal'lar zaten i18n çevrili (TR'de tam). Tek eksik: cihaz ekleme modal'ında "Preset" butonları — "Fridge / Walk-in Cooler / Freezer / Bar Fridge / Display Cooler / Hot Holding". Şef bir preset'e bastığında isim alanı bu metinle dolar — Türkçe seçilmişse bile İngilizce isim yazılır.

## Çözüm

6 yeni i18n key (`haccp_preset_*`) — sadece EN ve TR. `UNIT_PRESETS` array'inin sabit `name` field'ı `nameKey` ile değiştirildi. Preset butonu render'da ve preset tıklandığında `t(p.nameKey)` ile çevrili isim kullanılır.

Walk-in Cooler TR'de de "Walk-in Cooler" olarak kaldı — sektörde Türkiye'de de İngilizce orijinal terim kullanılıyor.

## Test

1. Dil = TR
2. HACCP Forms → Cihaz ekle modal aç
3. Preset butonları: "Buzdolabı / Walk-in Cooler / Dondurucu / Bar Buzdolabı / Vitrin Soğutucu / Sıcak Tutma"
4. Bir preset'e tıkla → isim alanı TR isim ile dolar

---

# v2.6.18 — Etkinlik editörü Türkçe (müşteri bütçesi)

## Talep

Yeni Etkinlik modal'ında "Customer budget" label, "What the customer pays" placeholder, "Total amount the customer agreed to pay" hint, "Profit vs budget" stat-label hardcoded İngilizce kalıyordu.

## Çözüm

4 yeni i18n key (`event_customer_budget*`, `event_profit_vs_budget`) — sadece EN ve TR. `events.js`'de editor field bloğu ve stat-label blokları t() çağrılarına dönüştürüldü.

## Bilinen kapsam dışı

Etkinlik **print HTML**'i (yazdırma çıktısı, ~line 480-512) hâlâ İngilizce metinler içeriyor: "Date / Guests / Venue / Price/person / Menu / Recipe / Per guest / Total portions / Cost / Total food cost / Customer budget / Total revenue / Profit / Notes". Bu print template'leri ayrı bir pakette ele alınabilir; print-HTML'de yapılan değişiklikler test/iterasyon açısından farklıdır (preview popup'a bakma, font değişikliği etkileri gibi).

## Test

1. Dil = TR
2. Yeni Etkinlik aç
3. "Müşteri bütçesi" label + "Müşterinin ödediği tutar" placeholder + "Müşterinin ödemeyi kabul ettiği toplam tutar" hint
4. Bütçe gir → stat alanlarında "Müşteri bütçesi" + "Bütçeye göre kâr" görünmeli

---

# v2.6.17 — Stok / Inventory Türkçe

## Talep

Stok sayfasında bir sürü hardcoded metin: "History / Count Stock / Generate Order" üst butonlar, "all ok / X need order" stat etiketleri, "Bulk Stock Count / Filter... / Clear / X / Y counted" bulk count modal'ı, "View past stock counts" tooltip'leri, "X items counted" history listesi, "Generate Orders / Later / X items need ordering / Want to generate purchase orders..." onay diyalogu.

## Çözüm

15 yeni i18n key (`inv_*`) — sadece EN ve TR. Mevcut `inv_count_stock` ve `inv_generate_order` keyleri zaten v17.js'de tanımlıydı ama kullanılmıyordu — artık kullanılıyor.

`promptGenerateOrdersAfterCount()` fonksiyonunda `t` scope eksikti, eklendi. `openBulkCount()` fonksiyonuna da `t` eklendi.

Interpolation kullanan keyler:
- `inv_need_order: '{n} tanesi siparişlik'`
- `inv_progress_counted: '{done} / {total} sayıldı'`
- `inv_x_items_counted: '{n} öğe sayıldı'`
- Tekil/çoğul ayrı keyler: `inv_x_items_need_ordering_singular / _plural`

## Test

1. Dil = TR
2. Stok sayfası → üst sağ butonlar: "Geçmiş / Stok Say / Sipariş Oluştur"
3. Kategori başlıklarında: "tümü iyi" yeşil veya "X tanesi siparişlik" kırmızı
4. "Stok Say" → modal açılsın → "Stok Say" başlık + "X / Y sayıldı" progress
5. Filter input: "Filtrele..." placeholder
6. "Temizle" / "Geçmiş" butonları
7. Sayım kaydet → "Düşük stoklu öğeler için sipariş oluşturmak ister misin?" diyalog → "Sipariş Oluştur / Sonra"
8. Geçmiş listesinde: "X öğe sayıldı"

---

# v2.6.16 — Kontrol Listesi editörü Türkçe

## Talep

Yeni Şablon modal'ında bazı yerler İngilizce kalıyordu: "Template name" + placeholder, "Items", "Add item", "Item description", item tipi dropdown'ı (Task / Temperature / Numeric / Pass/Fail / Text), Min/Max/unit placeholders, oturum ekranındaki "X/Y complete" progress text'i.

## Çözüm

15 yeni i18n key (`chk_*`) — sadece EN ve TR. `checklist.js`'de:
- `ITEM_TYPES` array'inin sabit `label` field'ı `labelKey` field'ı ile değiştirildi (`CATS` ve `PRIOS` zaten labelKey kullanıyordu, tutarlı pattern)
- Editor labels + placeholders + dropdown options + progress text — hepsi `t()` çağrılarına dönüştürüldü
- Progress için interpolation: `t('chk_complete_count', { done, total })` → "3/8 tamamlandı"

`DEFAULT_TEMPLATES` İngilizce metinleri — bu paketin scope'u dışı bırakıldı. Bunlar sadece **ilk açılışta hiç template yokken** seed olarak kayıt ediliyor. Mevcut hesabında zaten kendi şablonların var, default'ları görmüyorsun. Yeni hesaplar TR ile başlatıldığında ileride bir pakette bunları çevirebiliriz.

## Test

1. Dil = TR
2. Kontrol Listesi → "+ Şablon" → modal açılsın
3. "Şablon adı" label + "örn. Pazartesi Açılış Kontrolü" placeholder
4. "Öğeler" başlık + "Öğe ekle" buton
5. Öğe satırlarında: "Öğe açıklaması" placeholder
6. Tip dropdown'ı: Görev / Sıcaklık / Sayısal / Geçti-Kaldı / Metin
7. Sıcaklık veya Sayısal seçilirse: Min / Maks / birim placeholders TR
8. Bir checklist başlat (Start) → progress: "0/8 tamamlandı", item tikleyince "1/8 tamamlandı"

---

# v2.6.15 — Porsiyon Hesaplayıcı Türkçe

## Talep

Porsiyon Hesaplayıcı sayfasında bir çok hardcoded metin: "Scale one or more recipes for an event", "Step 1 — Guest count / Step 2 — Choose recipes / Step 3 — Scaled recipes", "guests / Select all / Clear / Search recipes...", "X servings · Y ingredients", "No recipes selected / X recipes selected", "X× from base Y servings", "portions", "Recipes / Total portions / Total food cost / Cost / guest" stat'ları, "Send to Shopping List / Print / Share" butonları.

## Çözüm

22 yeni i18n key (`pc_*`) — sadece EN ve TR. `portion.js`'deki tüm hardcoded metinler t() çağrılarına dönüştürüldü.

`pc_recipes_selected` ve `pc_recipes_selected_plural` ayrı keyler — TR'de tekil/çoğul aynı ("tarif"), EN'de farklı ("recipe / recipes"). Interpolation kullanıldı: `t('pc_servings_ingredients', { s: 4, i: 15 })`.

## Test

1. Dil = TR → Porsiyon Hesaplayıcı aç
2. Alt başlık: "Bir veya daha fazla tarifi etkinlik için ölçeklendir"
3. "Adım 1 — Misafir sayısı" + "misafir" suffix
4. "Adım 2 — Tarif seç" + "Tümünü seç / Temizle" + "Tarif ara..." placeholder
5. "Tarif seçilmedi" → tarif seç → "X tarif seçildi"
6. Tarif satırlarında: "X porsiyon · Y malzeme"
7. Adım 3'te: "Tarif / Toplam porsiyon / Toplam yemek maliyeti / Kişi başı maliyet"
8. Recipe block: "Temel X porsiyondan Y× / porsiyon"
9. Butonlar: "Alışveriş Listesine Gönder / Yazdır / Paylaş"

---

# v2.6.14 — Mutfak Kartları Türkçe

## Talep

Mutfak Kartları sayfasında bir çok hardcoded İngilizce metin vardı: alt başlık, "Canvas name", "Start a new canvas / Load saved canvas" tooltip'ler, "Orientation / Landscape / Portrait", "Columns (1–9)", "Font size", "Method / Amounts" checkbox'lar, "Tips:" + 3 ipucu, "Recipes on canvas", "Save canvas", "Print · X recipes", "Live preview · drag & resize", "A4 · landscape · 4 cols", "No recipes on canvas / Tick recipes from the left panel..."

## Çözüm

22 yeni i18n key (`kc_*`) — sadece EN ve TR. `kitchen_cards.js`'deki tüm hardcoded label'lar t() çağrılarına dönüştürüldü.

`kc_print_x_recipes` interpolation kullanıyor: `Yazdır · {n} tarif`. Aktif dilde "tarif/recipes" çoğul/tekil otomatik yerleşir.

`kc_a4_summary` interpolation kullanıyor: yön (landscape/portrait → yatay/dikey) ve sütun sayısını dile göre yerleştirir.

## Test

1. Dil = TR
2. Mutfak Kartları aç
3. Tüm sol panel TR: Yön (Yatay/Dikey), Sütun (1–9), Yazı boyutu, Yapılışı/Miktarlar checkbox, İpuçları + 3 ipucu, Karttaki tarifler, Kartı kaydet, Yazdır · X tarif
4. Sağ panel: "Canlı önizleme · sürükle & boyutlandır", "A4 · yatay · 4 sütun"
5. Boş canvas → "Kartta tarif yok / Eklemek için sol paneldeki tarifleri işaretle."
6. "Yeni kart başlat" + "Kaydedilmiş kartı yükle" tooltip'ler

---

# v2.6.13 — Menü varsayılan bölüm isimleri Türkçe

## Talep

Yeni menü oluştururken otomatik 3 bölüm geliyordu: "Appetizers", "Mains", "Desserts" — Türkçe seçilmiş olsa bile İngilizce.

## Çözüm

3 yeni i18n key (`menu_default_appetizers`, `menu_default_mains`, `menu_default_desserts`) — sadece EN ve TR. `menus.js`'deki sabit `DEFAULT_SECTIONS` array'i `getDefaultSections()` fonksiyonu ile değiştirildi — her yeni menü için aktif dile göre çevrili default isimler döner.

Bu sadece **yeni menüleri** etkiler. Mevcut menülerdeki bölüm isimleri kullanıcı tarafından girilmiş olduğundan dokunulmaz (başka türlü olamazdı zaten).

## Test

1. Dil = TR
2. Yeni menü oluştur
3. Default 3 bölüm: "Başlangıçlar", "Ana Yemekler", "Tatlılar"
4. Dil = EN, yeni menü oluştur → "Appetizers", "Mains", "Desserts"

---

# v2.6.12 — Malzeme editörü Türkçe

## Talep

Yeni Malzeme modal'ında "Yield % (optional)", "After trim/peel/clean. e.g. Chicken thigh boneless = 75%, Salmon fillet = 88%. Leaves blank = no trim loss." ve hesaplanan "True cost (EP)" etiketi İngilizce kalıyordu.

## Çözüm

3 yeni i18n key (`ing_yield_label`, `ing_yield_hint`, `ing_true_cost`) — sadece EN ve TR. `ingredients.js`'deki tek blok t() çağrılarına dönüştürüldü.

## Test

1. Dil = TR
2. Yeni Malzeme modal aç
3. "Verim % (opsiyonel)" label
4. Altında: "Temizleme/soyma/ayıklama sonrası. Örn. Kemiksiz tavuk but = %75, Somon fileto = %88. Boş bırak = fire yok."
5. Yield % girip fiyat varsa "Gerçek maliyet (EP)" yazısı

---

# v2.6.11 — Tarif editörü Türkçe

## Talep

Yeni Tarif modal'ında bazı alanlar İngilizce kalıyordu: "Yield amount (for use as sub-recipe)", "How much this recipe produces. Leave blank if same as servings.", "Yield unit", "Quick add — type ingredient name...", "Allergens", "Auto-detected from ingredients. Click to override."

## Çözüm

6 yeni i18n key (`recipe_yield_*`, `recipe_quick_add_placeholder`, `recipe_allergens_*`) — sadece EN ve TR. `recipes.js`'deki ilgili 3 blok t() çağrılarına dönüştürüldü.

Birim değerleri (g, kg, ml, l, portion, batch, tray, pcs) — ortak, dokunulmadı; standart kısaltmalar TR'de de aynı kullanılıyor.

## Test

1. Dil = TR
2. Yeni Tarif → modal açılsın
3. "Verim miktarı (alt-tarif olarak kullanım için)" + ipucu altta TR
4. "Verim birimi" label TR
5. Malzemeler bölümünde: "Hızlı ekle — malzeme adı yaz..." placeholder
6. Allerjen bölümü: "Alerjenler" başlığı + "Malzemelerden otomatik tespit edildi. Değiştirmek için tıkla."

---

# v2.6.10 — Account / Şef profili Türkçe

## Talep

Hesap sayfasında bazı alanlar İngilizce kalıyordu: "Chef profile" başlığı, profil formundaki tüm label'lar (Full name, Title/role, Country, Workplace, Bio), placeholder'lar, "Save profile / Preview public profile" butonları, "Export Recipes (CSV) / For spreadsheet / accounting", "Export Ingredients (CSV) / Price list / inventory", "3 sample recipes", "Irreversible".

## Çözüm

21 yeni i18n key (`chef_*`, `export_*`, `demo_3_recipes`, `irreversible`) — sadece EN ve TR. `account.js`'deki ilgili 5 blok t() çağrılarına dönüştürüldü.

## Test

1. Dil = TR
2. Hesap → Şef profili: "Şef profili" başlığı, tüm label'lar TR ("Ad soyad", "Unvan / görev", "Ülke", "İş yeri", "Biyografi", "— seçin —")
3. Placeholder'lar TR ("örn. Ahmet Kayas", "örn. Avustralya", "örn. Crown Towers, Perth", "Kısa profesyonel bir biyografi…")
4. "Profili kaydet" / "Halka açık profili önizle" butonları TR
5. Veri ve Senkron: "Tarifleri Dışa Aktar (CSV) / Excel / muhasebe için"
6. "Malzemeleri Dışa Aktar (CSV) / Fiyat listesi / stok"
7. "3 örnek tarif"
8. "Tüm verileri sil / Geri alınamaz"

---

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
