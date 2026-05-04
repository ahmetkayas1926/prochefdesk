# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.86**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.86** — Demo onboarding seed'in cloud'a sızması durduruldu. Gerçek kök neden: `js/seed/demo-recipes.js` boot sırasında aktif workspace'in (bootstrap'in yarattığı boş "My Kitchen") içine recipe + ingredient + menu + event seediyor. Workspace artık "boş" olmadığı için `cloud.js:isEmptyGhostWs` filter'ı onu drop edemiyordu; v2.6.85'in pull-in-progress flag'i de bunu çözmüyordu (demo merge sırasında kalıyor, sonradan flush ediliyordu). Düzeltme `auth.js`'de SIGNED_IN handler'ında: pull başlamadan önce `(demoSeeded && !hasUser)` ise `store.clearUserData()` çağrılır. Sign-out → reload → sign-in döngüsünde demo "My Kitchen" + içeriği lokal'den temizlenir, sonra cloud'dan kullanıcının gerçek state'i pull edilir. INITIAL_SESSION ve TOKEN_REFRESHED yolları korunur (mevcut kullanıcı state'ine dokunmaz).
- **v2.6.85** — Ghost workspace duplicate kök çözüm: `cloud.js`'e `pullInProgress` flag eklendi. `pull()` başlarken set edilir, success/null/error path'lerinde `_done()` helper'ı tarafından sıfırlanır. `cloud.queueSync` ve `cloud-pertable.flushNow` flag açıkken push'u erteler (pendingSync = true). Pull bitince `_done()` ertelenmiş push'ları tetikler — bu noktada state pull merge ghost filter'ından geçtiği için ghost'tan arındırılmıştır. Sonuç: lokal bootstrap'in yarattığı ghost "My Kitchen" workspace'i artık cloud'a hiç gitmiyor; mevcut `isEmptyGhostWs` merge filter'ı çift güvenlik olarak devrede kalır.
- **v2.6.84** — Faz 4 tamlık hotfix: `cloud-pertable.js`'in workspaces upsert builder'ı, şemada bulunmayan `data` jsonb kolonuna yazmaya çalışıyordu (Postgres `column "data" does not exist` hatası → tüm workspace per-table yazımları sessizce başarısız oluyordu). Sebep: workspaces tablosu (v2.6.66 şeması) sadece flat kolon kullanıyor, ama generic upsert path'i her satıra `data: it.data` ekliyordu. Düzeltme: workspaces branch'inde `delete row.data`. v2.6.73 migration `migrationFazV4Done=1` flag'ini set etmiş olmasına rağmen workspaces tablosu boş kalıyordu; bu fix sonrası sonraki sign-in/mutation'da parent workspace per-table'a doğru yazılır.
- **v2.6.83** — hCaptcha hotfix: `h-captcha-response` token'ı Web3Forms payload'undan çıkarıldı. Web3Forms Free tier hCaptcha doğrulaması (Secret Key alanı yok) → token gönderilince "Could not validate hCaptcha" reddi. Widget + client-side gate + honeypot yaklaşımıyla %95+ koruma sağlanıyor.
- **v2.6.82** — "Sorun bildir" formuna hCaptcha bot koruması eklendi. Lazy-loaded (modal açıldığında yüklenir, ilk paint'i etkilemez). Web3Forms server-side doğrulaması.
- **v2.6.81** — `workspace_tombstones` Realtime'a eklendi (18 → 19 binding). Bir cihaz workspace silince diğer cihazda 1-2 sn içinde cascade wipe (workspaces map + 16 ws-bound tablo). `cost_history` tablosu hâlâ kullanılmıyor (costHistory verisi user_prefs.data altında); ileride taşınırsa eklenecek.
- **v2.6.80** — Realtime kapsamı tüm tool tablolarına genişletildi (12 → 18 binding). `checklist_sessions` soft-delete pattern'e taşındı. HACCP×4 + `stock_count_history` Realtime'a eklendi.
- **v2.6.79** — Soft-delete pattern `waste`'e taşındı (tüm tablolar artık aynı pattern'de)
- **v2.6.74** — Çift kaynak pull merge (eski blob + per-table newest-wins)
- **v2.6.71–73** — 9 yeni Supabase tablosu + şema migration + çift yazma desteği
- **v2.6.66** — Per-table sync ilk 11 tablo
- **v2.6.0–9** — Checklist session history, HACCP Forms (Fridge/Freezer + Cook & Cool)
- **v2.5.9** — Recipe fotoları Supabase Storage'a (WebP @ 0.82, ~100-150 KB)
- **v2.5.7** — Public share lifecycle (list/pause/delete)
- **v2.5.4** — Privacy Policy + Terms of Service
- **v2.5.3** — TR/EN i18n tam tutarlı baseline
