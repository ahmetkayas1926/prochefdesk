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
