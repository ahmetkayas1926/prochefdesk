# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.92**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.92** — Faz 4 Adım 4c: localStorage yazma yolu kapatıldı + tek seferlik LS cleanup. `store.js`'de iki module-level flag (`_idbWriteOnly`, `_migrationDone`). İlk başarılı IDB persist'inden sonra `_completeMigration()` çağrılır: `state.prefs.idbWriteOnly = true` (kalıcı flag), `localStorage.removeItem(LS_KEY_STATE)`, module flag'leri set. Boot'ta `load()` flag'i okur ve `_idbWriteOnly` aktif eder; LS'de kalan veri varsa defansif olarak temizler. `persist`, `flushSync`, `trimAndPersist` artık `_idbWriteOnly === true` iken LS yazımını atlar — sadece IDB'ye yazar. `reset()` sign-out döngüsünde flag'leri sıfırlar (yeni hesap normal akışla yeniden migrate olur). Sonuç: localStorage 5 MB sınırı fiilen kaldırıldı; tek state kaynağı IDB. Adım 4 tamamlandı.
- **v2.6.91** — Faz 4 Adım 4b: Okuma IDB-first. `app.js` boot async; hem `await PCD.store.init()` hem `await PCD.auth.init()` ediyor — pull tamamlanmadan router register edilmiyor.
- **v2.6.89** — Faz 4 Adım 4a: IndexedDB altyapısı + write-through.
- **v2.6.88 (schema-only)** — `cost_history` tablosu drop edildi.
- **v2.6.87** — Faz 4 son adım: Eski blob yazımı/okuması kapatıldı.
- **v2.6.86** — Demo onboarding seed cloud sızması durduruldu.
- **v2.6.85** — Ghost workspace duplicate çözümü: pullInProgress flag.
- **v2.6.84** — Faz 4 hotfix: workspaces upsert'inde `delete row.data`.
- **v2.6.83** — hCaptcha hotfix.
