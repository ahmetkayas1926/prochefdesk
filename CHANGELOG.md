# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.89**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.89** — Faz 4 Adım 4a: IndexedDB altyapısı + write-through. `js/core/idb-wrapper.js` eklendi (~110 satır, native IDB üzerine Promise wrapper, DB: `prochefdesk`, store: `state`). `store.js`'in 4 yazma noktası (`persist`, `flushSync`, `trimAndPersist`, `reset`) artık LS'ye yazdıktan sonra IDB'ye de paralel yazıyor (fire-and-forget; LS yedek görevi görür). Okuma hâlâ LS'den. Migration script gereksiz: write-through pattern'inde ilk persist çağrısı IDB'yi otomatik dolduracak. Adım 4b'de okuma IDB'ye geçecek; 4c'de LS yazma kapatılıp temizlik yapılacak. localStorage 5 MB sınırı bu adımdan sonra fiilen kalkar.
- **v2.6.88 (schema-only)** — `cost_history` tablosu drop edildi. v2.6.71'de Faz 4 hazırlığı sırasında eklenmişti ama hiç yazılmadı; costHistory verisi `user_prefs.data.costHistory` jsonb içinde yaşıyor. Migration: `migrations/v2.6.88-drop-cost-history.sql`. Kod tarafında değişiklik yok; APP_VERSION bump'ı atlandı (v2.6.87'de kalmıştı, v2.6.89'da tekrar hizalandı).
- **v2.6.87** — Faz 4 SON ADIM: Eski blob yazımı tamamen kapatıldı. `cloud.js`'de `queueSync`, `_doSync`, `pushNow` artık no-op (per-table cloud-pertable.flushNow yeterli emniyet); `pull()` artık sadece per-table'dan okuyor (blob promise null sonuca sabitlendi). `user_data` tablosu DB'de duruyor.
- **v2.6.86** — Demo onboarding seed'in cloud'a sızması durduruldu. `auth.js`'de SIGNED_IN handler'ında pull başlamadan önce `(demoSeeded && !hasUser)` ise `store.clearUserData()` çağrılır. Sign-out → reload → sign-in döngüsünde demo "My Kitchen" + içeriği lokal'den temizlenir, sonra cloud'dan kullanıcının gerçek state'i pull edilir.
- **v2.6.85** — Ghost workspace duplicate kök çözüm: `cloud.js`'e `pullInProgress` flag eklendi. Pull başlarken set edilir, success/null/error path'lerinde `_done()` helper'ı tarafından sıfırlanır. `cloud.queueSync` ve `cloud-pertable.flushNow` flag açıkken push'u erteler.
- **v2.6.84** — Faz 4 tamlık hotfix: `cloud-pertable.js`'in workspaces upsert builder'ı, şemada bulunmayan `data` jsonb kolonuna yazmaya çalışıyordu. Düzeltme: workspaces branch'inde `delete row.data`. v2.6.73 migration `migrationFazV4Done=1` flag'ini set etmiş olmasına rağmen workspaces tablosu boş kalıyordu.
- **v2.6.83** — hCaptcha hotfix: `h-captcha-response` token'ı Web3Forms payload'undan çıkarıldı.
- **v2.6.82** — "Sorun bildir" formuna hCaptcha bot koruması eklendi.
- **v2.6.81** — `workspace_tombstones` Realtime'a eklendi (cross-device cascade wipe).
- **v2.6.80** — Realtime kapsamı tüm tool tablolarına genişletildi (12 → 18 binding).
- **v2.6.79** — Soft-delete pattern `waste`'e taşındı.
- **v2.6.74** — Çift kaynak pull merge (eski blob + per-table newest-wins).
- **v2.6.71–73** — 9 yeni Supabase tablosu + şema migration + çift yazma desteği.
- **v2.6.66** — Per-table sync ilk 11 tablo.
- **v2.6.0–9** — Checklist session history, HACCP Forms (Fridge/Freezer + Cook & Cool).
- **v2.5.9** — Recipe fotoları Supabase Storage'a (WebP @ 0.82, ~100-150 KB).
- **v2.5.7** — Public share lifecycle (list/pause/delete).
- **v2.5.4** — Privacy Policy + Terms of Service.
- **v2.5.3** — TR/EN i18n tam tutarlı baseline.
