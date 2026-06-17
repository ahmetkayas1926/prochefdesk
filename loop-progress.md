# Loop İlerleme — ProChefDesk

Oturum başlangıcı: 2026-06-17

---

## GÖREV 1 — Kırık araçları düzelt

### invoice.js / route 'invoice' — BULUNAMADI
- Repoda `invoice|ocr|tesseract` araması yapıldı — hiçbir eşleşme yok.
- Bu araç v2.43 temizliğinde silinen 8 araçtan biri. Git geçmişinde var; şu an route'lanmıyor.
- Eylem yok.

### variance.js — TAMAMLANDI ✅ (v2.44.33)
- `var_no_counts_hint` i18n anahtarı 6 dilde tanımlıydı ama ASLA render edilmiyordu.
- Düzeltme: `renderTable()` içinde toplam kartından sonra, snapshot yoksa bilgi banner'ı eklendi.
- Dosya: `app/js/tools/variance.js`

### kitchen_cards.js mobil ölçekleme — TAMAMLANDI ✅ (v2.44.34)
- **Kök neden:** Boot sequence'da `router.go(initialRoute)` çağrısı lazy tool'u yüklüyor; script yüklendikten sonra `.then()` microtask'ı `render(view)` çağırıyor. Ama `app.classList.remove('hidden')` 250ms `setTimeout` içinde, yani render'dan SONRA gerçekleşiyor. Render sırasında `#app` `display:none` olduğundan tüm `clientWidth` değerleri 0.
- RAF retry (×60) ve `setTimeout(60ms)` fallback'ler 250ms geçmeden bitiyor → app görünür olduğunda `applyScale()` çağıracak kimse kalmıyor.
- **Düzeltme:** `updatePreview()` sonunda `MutationObserver` ile `#app.classList` izleniyor. `hidden` kaldırıldığında — bu tam anda `previewEl.clientWidth=325` — `applyScale()` senkron çağrılıyor.
- Dosya: `app/js/tools/kitchen_cards.js`
- Test: mobil 375px → `transform: scale(0.289)`, masaüstü 1280px → `transform: scale(0.643)` ✅

---

## GÖREV 2 — Desktop + Mobil UI review

### Mobil yatay taşma taraması
- 21 route tarandı (375px). Sadece kitchen_cards'da `kc-preview-frame` taşıyor, ama `overflow:auto` container içinde olduğu için sayfa-düzeyinde 0 taşma → **kritik değil** (ve zaten düzeltildi).
- Diğer 20 route: yatay taşma yok ✅

### Açık bulgular
| Öncelik | Bulgu | Dosya |
|---------|-------|-------|
| Orta | Arapça RTL kısmi: `data-dir` set ama gerçek `dir` attribute yok, ~12 RTL kuralı uygulanmıyor | app.js / CSS |
| Düşük | `book` ikonu "bulk to menu" bilgi mesajında generik bilgi ikonuna düşüyor (`book-open` olmalı) | recipes.js |

### Masaüstü tam tarama — DEVAM EDİYOR
- Henüz tamamlanmadı.

---

## GÖREV 3 — İkon standardizasyonu
- Henüz başlanmadı.

---

## Sürüm geçmişi bu oturumda
- `2.44.33` — variance hint + çıktı @page margin:0 standardizasyonu
- `2.44.34` — kitchen_cards mobil MutationObserver ölçekleme düzeltmesi
