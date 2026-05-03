# ProChefDesk — Sürüm geçmişi

Mevcut sürüm: **v2.6.83**

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
