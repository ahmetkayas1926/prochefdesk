# ProChefDesk — Claude Code rehberi

Bu dosya repo kökünde durur. Claude Code her session başında otomatik okur.

## Proje

ProChefDesk — profesyonel şef'ler için web tabanlı mutfak yönetim sistemi. Operatör: Ahmet Kaya (Perth WA, aktif kullanıcı şef). Solo proje. Production canlı: `prochefdesk.com`, app `/app/` altında.

Stack: Vanilla JavaScript (no bundling, no service worker), IndexedDB ana storage, Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (auto-deploy on GitHub push), Cloudflare R2 (backups).

**Mevcut sürüm: v2.8.33** (production).

## Çalışma akışı

Operatör Türkçe konuşur, Türkçe cevap ver. Operatör "BUNU SEN SÖYLE" veya "öneri ver" derse doğrudan görüş ver, soruyla cevap verme. Operatör yorgun veya kızgınsa tek net talimat ver.

**Push akışı:** GitHub Desktop GUI ile. Operatör Windows'tan çalışır. Terminal/cmd komutu önerme.

**Sürüm bump:** SADECE `app/js/core/config.js`'in `APP_VERSION` satırını değiştir. `app/index.html`'e literal sürüm yazma — orada `__VERSION__` placeholder'ları var, `node build.js` (Cloudflare Pages build command) deploy zamanı replace eder. Literal yazılırsa build fail eder.

## Backlog (öncelik sırasına göre)

**Gündelik kullanımda hissedilen, hızlı bitirilebilir:**

1. **Cost report test price input — 300ms debounce.** Cost report'ta canlı fiyat girerken her keystroke'ta recalc tetikleniyor, input'tan focus atıyor, çok haneli sayı yazılamıyor. 300-400ms debounce ekleyince son rakam yazılınca hesaplar.
2. **Restore modal — current vs backup karşılaştırma görünümü.** Şu an modal sadece backup içeriğini gösteriyor. İki sütun göstersin: "Şu an cihazda" (workspaces, recipes, ingredients, menus, suppliers, checklist templates sayıları) vs "Backup'ta (yüklenecek)". Kullanıcı kaybedeceğini görerek karar versin.
3. **HACCP Cooking & Cooling — aylık 31 satırlık tek form.** Şu an günlük format. Şef ay başında indirir, ay boyunca elle doldurur, yoğunsa 2-3 forma böler.
4. **Auto diet detection — kaldır.** Keyword-matching ile %100 doğruluk imkansız (yanlış vegan/gluten-free tick'leri var). Manuel kalsın, kullanıcı kendisi seçsin. Post-launch'ta küratörlü ingredient DB ile yeniden inşa edilecek.

**Kapsamı büyük, planlı çalışma gerek:**

5. **Yeni HACCP formları** — Fridge/Freezer daily temperature + Receiving log + Hot/Cold holding temperature. Restoran/mutfak denetimlerinde en çok denetlenen üçü.
6. **Hardcoded EN string süpürmesi.** ~30+ string TR i18n'de eksik (sidenav titles, toasts, modals, placeholders, Account/Help label'ları). Manuel, dosya-by-dosya. Uzun iş.
7. **iOS/Safari cross-browser test pass** — Safari iOS + Safari macOS + Chrome iOS. Sadece Android Chrome + Desktop Chrome'da test edildi.

**Büyük feature / sonraya:**

8. **Discover MVP** — public recipe grid + like + view count. Pinterest tarzı keşif alanı, "Discover" / "Keşfet" tab'ı. Faz 1: recipe başına `is_public` toggle, anonymous SELECT, grid layout, like butonu, view counter. **Rating sistemi yok** (drama getirir). Şu an boş kalır → 60+ aktif kullanıcı sonrası anlamlı.
9. **Auto diet rebuild — küratörlü ingredient DB ile.** Her ingredient'a vegan/vegetarian/gluten-free/dairy-free flag eklenir (ingredient editörü içinde). Recipe otomatik diet kontrolü güvenilir hale gelir.
10. **Realtime CHANNEL_ERROR.** Console'da `cloud-realtime: subscribe failed CHANNEL_ERROR`. Diğer cihazda canlı görünüm yok (sayfa açıldığında pull yine günceller — solo workflow etkilenmiyor). Çoklu cihaz canlı görünüm veya ekip kullanımı gerekirse bakılır.
11. **Categories functional.** Şu an menu kategorileri kozmetik label. 50+ menu item olursa filter/grouping/Prep-specific kategoriler değerli olur.
12. **Marketing / SEO / blog kurulumu** — Faz 2 işi.

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

**Per-table sync 3 yönlü.** Push (cloud-pertable.js, debounced, retry'lı), Pull (cloud.js, boot'ta tüm tablolar, drift detection v2.8.33'te eklendi), Realtime (cloud-realtime.js, WebSocket, şu an CHANNEL_ERROR'lu — solo için kritik değil). Sync bug'ında ÖNCE hangi yön sor.

**RLS tüm 22 tabloda aktif.** Frontend `anon` key kullanıyor. Yeni tablo eklersen RLS policy şart:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye davranışı.** Misafir (login yok): sadece IDB, cloud yazma KAPALI, demo seed yüklenir. Üye (login var): IDB + cloud çift yönlü. Yeni feature'da misafir için cloud push tetiklenmemeli.

**Root dosyalar (landing, privacy, terms) app'ten BAĞIMSIZ.** `prochefdesk.com/index.html`, `/privacy.html`, `/terms.html` kendi inline CSS'leriyle çalışır. App CSS değişiklikleri bu üç dosyayı etkilemez, tersi de.

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
