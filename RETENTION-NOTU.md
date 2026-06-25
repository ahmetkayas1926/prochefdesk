# Retention / "Her gün kullan" notu (2026-06-25 — sonra incelenecek)

## Sorun (kanıtlı)
Saf reçete-maliyeti = "bir kez kur, unut" → düşük churn-direnci. Düşük-ACV ($10-30/ay) self-serve B2B churn %3-7/ay; churn'ün %70'i ilk 90 günde. Recurring mecburiyet olmadan tutmuyor (bkz. araştırma raporu: meez saf costing'den eğitim/tutarlılığa pivot etti; "price updates are manual → don't happen").

## Asıl eksik = ÖZELLİK değil, TETİK
Kodda doğrulandı: uygulamada **gerçek bildirim/hatırlatma sistemi YOK** (`serviceWorker`/`Notification`/`PushManager` yok; tek "reminder" = kitchen_cards kanvas-kaydet uyarısı). Uygulama **pasif çekmece** — açana kadar bekler, kendini hatırlatmaz. Günlük-kullanılan uygulamalar kullanıcıyı **dürter.**

## 4 hamle (uygulamayı "her gün aç"a çevirmek)
1. **Dürtme (en kritik, sunucu gerektirir):** günlük hatırlatma. Hafif yol = Supabase **cron → edge function → e-posta** (cleanup/backup için cron+edge zaten var). "17:00 — kapanış sıcaklıklarını yaz (yasal), 2 dokunuş." HACCP günlük log yasal zorunlu → hatırlatılırsa garantili günlük sebep. *(Güvenlik sınırı: cron/Edge = onay zorunlu.)*
2. **"Bugün" panosu (sunucu GEREKTİRMEZ — ilk hamle bu):** ana ekran açınca "araçlara göz at" değil "bugün ne yapman gerek": vadesi gelen HACCP logları + bugünün prep'i + par-altı stok + yarınki fonksiyon. Dashboard'da düşük-stok uyarısı zaten var → günlük to-do'ya genişlet.
3. **Uyum serisi (don't-break-the-chain):** "14 günlük HACCP serisi". Yasal günlük iş için en güçlü retention psikolojisi (kayıp-korkusu). Ucuz (sayaç).
4. **10-sn günlük aksiyon + onboarding'i loop'a sok:** sıcaklık logu tek-dokunuş; ilk-kurulum "16 aracı keşfet" değil "günlük HACCP + haftalık roster"ı kursun.

## ICP yönü (araştırma sonucu)
Birincil: **event/catering-yoğun bağımsız mutfak** (per-event recurring) + HACCP-zorunlu bölge (UK/EU/AU/Körfez). İkincil: bakery/patisserie/meal-prep; HACCP-zorunlu bağımsız restoran. Kovalama: sabit à-la-carte tek-şube, yüksek-hacim food truck/QSR, çok-şubeli zincir.

## Verdict
$19/ay sürdürülebilir abonelik olur — **AMA** omurgayı "reçeteni bir kez maliyetlen"den "mutfağını her gün/hafta çeviren işletim sistemi"ne kaydırmak şartıyla (HACCP günlük + roster haftalık + per-event + sürtünmesiz fiyat-güncelleme + Bugün panosu/hatırlatma). İlk hafif hamle = **#2 Bugün panosu** (uygulama içi, sunucu yok).
