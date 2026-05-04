# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.90**

Yapısal kilometre taşları (kronolojik tersine):

- **v2.6.90** — Faz 4 Adım 4b: Okuma yolu IndexedDB'ye geçti. `store.js` `load()` async oldu — önce IDB'den (`prochefdesk` DB, `state` store, `main` key) okuyor, IDB boşsa veya hata varsa `localStorage` fallback'i çalışıyor. `store.init()` artık Promise döndürüyor; `app.js` `boot()` async function olarak `await PCD.store.init()` ediyor. Sonraki boot adımları (theme, locale, auth.init) state hazır olduktan sonra çalışıyor. Yazma hâlâ hem LS hem IDB'ye gidiyor (write-through, v2.6.89'dan). Bir sonraki adımda (4c) LS yazma kapatılıp temizlik yapılacak.

Yapısal kilometre taşları (kronolojik tersine):

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
