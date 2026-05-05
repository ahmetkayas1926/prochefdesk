# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.93**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.93** — Backup restore akışı tam yeniden yazıldı. Önceki davranış: store.set() ile lokal'e yazıyor, ama cloud'da silinmiş kayıtlar yine duruyor → reload sonrası cloud pull eski silinmemişleri geri getiriyor → restore boşa gidiyor (test edilince doğrulandı). Yeni davranış: (1) `cloud-pertable.wipeAllUserData()` ile kullanıcının tüm cloud tabloları DELETE edilir (RLS user_id ile sadece kendi verisini siler), (2) `replaceAll(data)` ile lokal state backup ile değiştirilir + runMigrations çalışır (eski sürüm backup uyumluluğu), (3) activeWorkspaceId backup'ta yoksa ilk geçerli workspace'e ata, (4) flushSync ile IDB'ye sync yazım, (5) `cloud-pertable.flushNow()` artık Promise döndürür → tüm cloud yazımları bitene kadar await edilir, (6) reload. Tüm akış async/await ile sıralı; restore butonu işlem sırasında disable. Hata yakalama: fail durumunda butonlar yeniden aktif, toast hata mesajı. Sonuç: backup → restore "tam geri yükleme" anlamına gelir, sıfır veri tutarsızlığı.
- **v2.6.92** — Faz 4 Adım 4c: localStorage yazma yolu kapatıldı + tek seferlik LS cleanup. `_idbWriteOnly` ve `_migrationDone` flag'leri. İlk başarılı IDB persist'inden sonra `state.prefs.idbWriteOnly = true`, LS temizlenir, sonraki yazmalar sadece IDB'ye.
- **v2.6.91** — Faz 4 Adım 4b: Okuma IDB-first. `app.js` boot async; hem `await PCD.store.init()` hem `await PCD.auth.init()` ediyor.
- **v2.6.89** — Faz 4 Adım 4a: IndexedDB altyapısı + write-through.
- **v2.6.88 (schema-only)** — `cost_history` tablosu drop edildi.
- **v2.6.87** — Faz 4 son adım: Eski blob yazımı/okuması kapatıldı.
- **v2.6.86** — Demo onboarding seed cloud sızması durduruldu.
- **v2.6.85** — Ghost workspace duplicate çözümü: pullInProgress flag.
- **v2.6.84** — Faz 4 hotfix: workspaces upsert'inde `delete row.data`.
- **v2.6.83** — hCaptcha hotfix.
