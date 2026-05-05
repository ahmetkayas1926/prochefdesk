# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.91**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.91** — Faz 4 Adım 4b (yeniden): Okuma yolu IndexedDB-first. v2.6.90'da denenmişti ama auth.init pull zinciri ile router register sırası ters geldiği için workspace switch ve sign-out UI etkileşimleri kopmuştu. Bu sürümde düzeltme: `app.js boot()` artık `await PCD.auth.init()` ediyor — auth zinciri (getSession → cloud.pull → photo migrate → cloud-migrate → fetchPlan) tamamlanmadan `onAuthResolved()` çağrılmıyor. Yani router register pull'dan SONRA, UI listener'lar pull-edilmiş state üzerine kuruluyor. Boot'un her adımına `console.log('[boot] ...')` eklendi (teşhis için). Defansif: store.init veya auth.init fail ederse app yine açılır (degraded mode). store.js: `load()` async (önce IDB get('state','main'), fallback localStorage), `init()` Promise döndürür. Yazma yolu hâlâ write-through (LS + IDB).
- **v2.6.90 — GERİ ALINDI** — async boot ilk denemesi; auth pull / router register sıralaması ters gidip UI etkileşimleri koptu. v2.6.89'a geri dönüldü, v2.6.91'de doğru sırayla yeniden uygulandı.
- **v2.6.89** — Faz 4 Adım 4a: IndexedDB altyapısı (`js/core/idb-wrapper.js`) + write-through. `store.js` 4 yazma noktası (`persist`, `flushSync`, `trimAndPersist`, `reset`) LS yazımına ek olarak IDB'ye de yazıyor (fire-and-forget).
- **v2.6.88 (schema-only)** — `cost_history` tablosu drop edildi.
- **v2.6.87** — Faz 4 son adım: Eski blob yazımı/okuması kapatıldı; cloud sadece per-table.
- **v2.6.86** — Demo onboarding seed cloud'a sızması durduruldu (auth.js SIGNED_IN handler'ı).
- **v2.6.85** — Ghost workspace duplicate çözümü: pullInProgress flag.
- **v2.6.84** — Faz 4 hotfix: workspaces upsert'inde `delete row.data`.
- **v2.6.83** — hCaptcha hotfix.
