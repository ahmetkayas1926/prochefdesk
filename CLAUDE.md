# ProChefDesk — Claude Code rehberi

Bu dosya repo kökünde durur. Claude Code her session başında otomatik okur.

## Proje

ProChefDesk — profesyonel şef'ler için web tabanlı mutfak yönetim sistemi. Operatör: Ahmet Kaya (Perth WA, aktif kullanıcı şef). Solo proje. Production canlı: `prochefdesk.com`, app `/app/` altında.

Stack: Vanilla JavaScript (no bundling, no service worker), IndexedDB ana storage, Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (auto-deploy on GitHub push), Cloudflare R2 (backups).

**Mevcut sürüm: v2.8.58** (push'a hazır local; production v2.8.50 — push edilene kadar). Detay: `CHANGELOG.md`.

## Çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. Operatör "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme. Operatör yorgun veya kızgınsa tek net talimat ver.

**Push akışı:** GitHub Desktop GUI ile. Operatör Windows'tan çalışır. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js`'in `APP_VERSION` satırını değiştir. `app/index.html`'e literal sürüm yazma — orada `__VERSION__` placeholder'ları var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Literal yazılırsa build fail eder.

## Backlog (öncelik sırasına göre)

**v2.8.34-v2.8.50 sweep ile 1-6 + 8 + 9 + 10 tamamlandı. Kalan açık maddeler:**

7. **iOS/Safari cross-browser test pass** — Safari iOS + Safari macOS + Chrome iOS. v2.8.49'da kod tarama yapıldı (temiz, sadece backdrop-filter vendor prefix eklendi). Manuel cihaz testi operatör tarafına bekliyor.

11. **Categories functional.** Şu an menu kategorileri kozmetik label. 50+ menu item olursa filter/grouping/Prep-specific kategoriler değerli olur.

12. **Marketing / SEO / blog kurulumu** — 2026-05-18'de PARÇA 1+2+3 tamamlandı (blog altyapı + sitemap.xml + robots.txt + meta tag sweep + ilk 3 yazı). Kalan: operatör eve dönünce ~15 dk Google Search Console ekleme + TXT verify + sitemap submit. Detay HANDOVER §11.9.1 (yeni).

**Audit (v2.8.50) sonrası yeni bekleyenler:**

13. **Edge function deploy** — `supabase/functions/delete-account/` v2.8.50'de değişti. Operatör Supabase CLI veya Dashboard'dan `supabase functions deploy delete-account` yapacak.
14. **Discover view spam rate limit** — `increment_recipe_view` RPC anonymous'a açık (MVP kabul). Viral olursa Edge Function ile IP+recipe başına 1 saat 1 view.
15. **R2 foto bytes yedekleme** — şu an sadece manifest. Pro tier'a geçişte Storage PITR ile çözülür.
16. **`supabase-functions/` duplicate silme** — operatör Dashboard'dan deploy doğrulaması yapana kadar bekliyor (v2.8.50'de senkron tutuldu).
17. **App mobil performans L1 optimizasyonu** — Dashboard FCP/LCP 5.6 sn (Mobile PageSpeed 65). Tanı: 48 sync `<script>` + 5 blocking CSS, defer/async yok. Önerim L1 (sadece `<script defer>` + `preload` CDN) tek dosya değişikliği, düşük risk, tahmini 5.6→3.0-3.5 sn. Operatör onayı bekliyor (PARÇA 4 raporu 2026-05-18). L2 (lazy i18n + lazy tools) ve L3 (cloud sync defer) sonraki round'larda ayrı onay gerekir.

**Tamamlanmış maddelerin sürüm referansı:** `CHANGELOG.md`. `HANDOVER.md §5` tablosu da güncel.

## Güvenlik sınırları (onay zorunlu)

Aşağıdaki işlemlerden önce operatörden onay al, kendi başına yapma:

- DROP TABLE veya destructive SQL
- 50+ satır frontend değişikliği tek seferde
- Yeni dosya/modül ekleme
- Cron schedule veya RLS policy değişikliği
- Cross-device sync mantığı (cloud.js, cloud-pertable.js, cloud-realtime.js) değişikliği
- Edge Function deploy

## Çalışma kuralları

- **Bir hedef → en küçük adım.** Birden fazla iyileştirmeyi tek sürüme paketleme.
- **Bulk regex/script YOK.** Manuel dosya-by-dosya edit. Geçmişte 226+ syntax error + rollback bulk script'ten geldi.
- **Her edit'ten sonra `node -c` syntax check.**
- **Tahmin yürütme.** Frontend değiştirmeden önce gerçek dosyayı oku. Operatör bir sorunla geldiğinde önce DevTools console + kod ile mevcut durumu kontrol et, sonra çözüm üret. Genel cevap verme — nokta atışı teşhis yap.
- **Yeni özellik önermeden önce repo'da grep ile var mı kontrol et.** Memory'de "yapılmamış" notu olsa bile doğrula. (Önceki sessions'da "Report an issue modal yok" gibi yanlış öneriler bu kuralı doğurdu — modal zaten `app/js/tools/account.js`'te.)
- **Operatöre teknik kod gösterilmez.** Diff blokları, syntax detayları kafa karıştırır. Değişikliğin ne olduğunu sade dille söyle, hangi dosyayı kopyalayacak ve ne riski var.

## Mimari gotcha'lar

Geçmişte bug üreten yerler, bilmeden dokunma:

**Cloud sync race condition.** UI eylemi state değiştirip ardından `location.reload()` çağırıyorsa, **arada explicit `await PCD.cloudPerTable.flushNow()` olmalı**. Yoksa debounced sync tamamlanmadan reload tetiklenir → "verim kayboldu" raporu gelir.

**PCD.icon registry silent fallback.** `PCD.icon(name, size)` registry'de olmayan isim için **sessizce info ikonuna fallback** yapar (kırmızı yuvarlak içinde "i"). Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Yeni ikon kullanmadan önce: `grep -n "<name>:" app/js/core/utils.js` ile registry'de olduğunu doğrula.

**Per-table sync 3 yönlü.** Push (cloud-pertable.js, debounced, retry'lı), Pull (cloud.js, boot'ta tüm tablolar, drift detection v2.8.33'te eklendi), Realtime (cloud-realtime.js, WebSocket, v2.8.43'te JWT setAuth fix ile CHANNEL_ERROR temizlendi — TOKEN_REFRESHED dinleyici 1-saatlik token refresh sonrası re-setAuth yapıyor). Sync bug'ında ÖNCE hangi yön sor.

**Print akışı tek nokta (v2.8.54-v2.8.55).** Tüm yazdırma `PCD.print(html, title)` (utils.js) üzerinden. Footer otomatik enjekte edilir (standart tıklanabilir "Made with ProChefDesk · prochefdesk.com"); custom footer YAZMA, `.pcd-print-footer{display:none}` override KOYMA. Window genişliği 1200px (Kitchen Cards landscape A4 1122px body sizing'e sığsın). Eski "first preview wrong, second correct" bug'ı bu boyutla kapandı. Detay HANDOVER §11.11.5.

**Recipe ingredient separator (v2.8.52).** `data.ingredients` array'inde yeni satır tipi: `{ separator: true, label?: '' }`. Hesap path'leri (cost/diet/allergen/variance) `if (ri.separator) return;` skip etmeli. Display path'leri (editor/preview/kitchen card/share/PDF/discover) render etmeli — `dashboard.resolveRow` separator için `{ found: false, isSeparator: true }` döndürüyor, cost report ve XLSX detail otomatik atlar. Yeni `recipe.ingredients` üzerinde forEach yazarken iki path'ten birini seç.

**RLS tüm 22 tabloda aktif.** Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy şart:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye davranışı.** Misafir (login yok): sadece IDB, cloud yazma KAPALI, demo seed yüklenir. Üye (login var): IDB + cloud çift yönlü. Yeni feature'da misafir için cloud push tetiklenmemeli.

**Root dosyalar (landing, privacy, terms, blog/) app'ten BAĞIMSIZ.** `prochefdesk.com/index.html`, `/privacy.html`, `/terms.html` ve `/blog/*.html` kendi inline CSS'leriyle çalışır. App CSS değişiklikleri bu dosyaları etkilemez, tersi de. Blog yazıları her biri standalone HTML (Inter + Fraunces, cream paper palette, brand green CTA). Yeni yazı eklerken: (1) mevcut bir post HTML'i kopyala + meta/içerik değiştir, (2) `/blog/index.html`'de en üste yeni `<a class="post-card">` kart bloku ekle (newest first), (3) `sitemap.xml`'e yeni `<url>` girdisi. Build step yok. Detay HANDOVER §11.9.

**`supabase-functions/` klasörü duplicate** — `supabase/functions/delete-account/` ile identical, repoda referans yok. Operatör Supabase Dashboard'dan deploy doğrulaması yapana kadar **silinmeyecek**.

## Önerme

Bu işleri spontan öneri olarak ortaya çıkarma:

- Pricing / paid tier / Stripe (50+ aktif kullanıcı + %40 retention kanıtlanmadan yok)
- AI image gen entegrasyonu (operatörün kendi GPU donanımı var, ürüne entegre etmek gereksiz)
- Demo seed değişikliği (mevcut hali iyi)
- Türkçe landing page (operatör erteledi)
- Screenshot ekleme (operatör kendisi çeker)
- `supabase-functions/` duplicate silme (operatör doğrulama yapacak)

## Daha fazla bilgi

Tam mimari, DB şeması, migration listesi, edge function detayları, operatör bağlamı için: **`HANDOVER.md`** (repo kökü).

Sürüm tarihi için: **`CHANGELOG.md`** (repo kökü).
