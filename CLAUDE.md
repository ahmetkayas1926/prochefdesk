# ProChefDesk — Claude Code Rehberi

## Proje

ProChefDesk — profesyonel şefler için web tabanlı mutfak yönetim sistemi. **Operatör:** Ahmet Kaya, Perth WA, aktif kullanıcı şef. Solo proje. **Production:** `prochefdesk.com`, uygulama `/app/` altında.

**Stack:** Vanilla JS (bundler/service worker yok), IndexedDB (offline-first ana storage), Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (GitHub push'ta auto-deploy), Cloudflare R2 (gece yedek).

Araç envanteri + mimari → **`HANDOVER.md`** · sürüm geçmişi → **`CHANGELOG.md`**. Launch işleri → aşağıdaki bölüm; büyüme roadmap'i operatörde — yeni özelliği spontan kurma, ne yapılacağını operatör söyler.

---

## Durum

**Ürün lansman-hazır.** Stripe canlı: `ProChefDesk, LLC` (Delaware) · **$19/ay `price_1TkaHBPAp6Hx01isprzC026A` · $190/yıl `price_1TkaI8PAp6Hx01isG2HOVwzQ`** · `config.js STRIPE_PK`=pk_live · 3 Edge Fn + webhook (checkout.completed/subscription.updated/.deleted) · Mercury payout · uçtan uca test geçti. Site LLC/USD/Delaware (terms+privacy 6 dil · liability cap US$100 · 131 Continental Dr Newark DE). Reputation temiz (Google Safe Browsing + Norton OK). 24 blog + sitemap canlı. Profil senkronu çalışır (`prefs.profile`).

**Açık (operatör işi, kod değil):**
- [ ] **Go-to-market — ASIL İŞ.** Tek hedef ↓.
- [ ] iOS/Safari gerçek cihaz testi (kamera/share-sheet/PWA/hCaptcha — kod denetimi tamam).
- [ ] Launch QA — operatörle son manuel pass.
- [ ] (Gelecek) AU PR alınca → AU Stripe'a geç (ABN+AU banka) + ABD LLC feshet. **Vergi:** DE LLC ~$300/yıl (1 Haz) + federal 5472+1120 (15 Nis; gelir 0 olsa bile; 5472 kaçırma $25k; ilk dosyalama 2027).

**Stripe kritik notlar:** kimlik engeli → support.stripe.com specialist (Ask Atlas değil). Para yolu: Stripe→Mercury→Wise→AU/TR. Adaptive Pricing KAPALI ($19 sabit). free→pro: `migrations/v2.44.38` user_prefs satırını trigger'la yaratır — yeni `.update().eq(user_id)` yazan satır var olduğunu varsaymalı / upsert kullanmalı.

---

## Go-to-market — TEK HEDEF (şüpheci, araştırma-temelli)

> Bu strateji kelimeyle değişmez. Ekonomi + gerçeklere dayalı. Yeni özellik/cila DEĞİL — ürünü satma zamanı.

**Rahatsız edici gerçek:** $19/ay, solo-kurucu B2B SaaS'ın viable bandının ALTINDA ($50-500). Sonuç: paid reklam matematiği tutmaz (CAC $200-500 » $19 ARPU), düşük ARPU churn-hassas, anlamlı MRR için YÜZLERCE kullanıcı gerek (~260 = $5K MRR). Tek çıkış: **sıfıra-yakın-CAC + hacim + retention.**

**Kaldıraç avantajı:** kurucu = ICP (çalışan baş şef + şef ağı). Founder-led satışta derin ürün bilgisi > cilalı pitch.

**Asıl risk acquisition değil RETENTION:** uygulama pasif (bildirim/tetik sistemi YOK) → yalnız iş akışı günlük kullanımı ZORUNLU kılan kullanıcıda tutar. O yüzden niş = **HACCP-zorunlu bölgede bağımsız caterer / event chef / private chef** (HACCP günlük log yasal + per-event iş = dış tetik; bildirim gerekmez).

**HEDEF (90 gün):** Bu nişten **10 retained, ödeyen kullanıcı** — founder-led warm outreach + nişin toplandığı yerlerde varlık (şef subreddit / catering FB grup / LinkedIn). **Tek metrik = 2. ay retention** (hâlâ kullanıyor + ödüyor), signup DEĞİL. Paid / yeni özellik / geniş içerik → bu kohort $19 modelin tuttuğunu kanıtlayana kadar BEKLER.

**Yol (sıra):** (1) 30-50 gerçek şef listele (ağın: AU/Körfez/Katar/İstanbul). (2) Her birine kişisel DM — "sat" değil: "güvendiğim yargı, ücretsiz, dürüst söyle". (3) İlkleri SEN onboard et → GERÇEK sıradaki event/haftalarında kullansınlar (demo değil; ürün gerçek iş akışına girmezse tutmaz). (4) Nişin yerlerinde gerçek soru cevapla (pitch değil) = sıfır-CAC inbound. (5) 2. ay retention ölç + churn edenlerle konuş — gerçek eksiği onlar söyler. (6) 2-3 retained → testimonial (en büyük eksik = sosyal kanıt). (7) 10 retained SONRA → fiyat testi / kanıtlanmış içeriği boost / ölçek.

**Fiyat:** $19 bilinçli erişilebilirlik bahsi ama bandın altı. App ~$179/ay araç yerine geçiyor (ROI bloğu) → yukarı test yeri VAR (yıllık vurgu / $29-39) — ama retained kullanıcıya SORDUKTAN sonra, körlemesine değil.

**Gerçekçi beklenti:** medyan micro-SaaS = 6 ayda $1-3K MRR. Viralite değil, tutarlılık. Outreach=haftalar · organik blog=3-6 ay+ · paid=sonra.

---

## Operatör + çalışma akışı

- **Türkçe konuş.** Verilen talimatı tam olarak anla → istenen sonucu veren **en doğru yolu** seç ve uygula. Doğrudan, sade, kısa; varsayımsal/teorik seçenek sıralama, karar ver. **Not yalnızca gerçek riskte:** istenen değişiklik **başka bir aracı/ayarı/akışı** etkileyip bozacaksa kısa bir uyarı ekle — onun dışında "olabilir" türü teorik uyarı yazma.
- **Memory KULLANMA** (operatör kapattı, 2026-06). Her oturum tertemiz başla; iş durumu/geçmiş tek kaynağı = CLAUDE.md + HANDOVER.md + CHANGELOG.md + kod.
- **Push:** GitHub Desktop GUI, Windows. Terminal/cmd komutu önerme.
- **Sürüm bump:** SADECE `app/js/core/config.js` → `APP_VERSION`. `app/index.html`'e sürüm YAZMA — `__VERSION__` placeholder'ı `node build.js` (Cloudflare build command) deploy'da replace eder, elle yazılırsa build fail eder.

---

## Çalışma kuralları

- **Bir hedef → en küçük adım.** Birden çok iyileştirmeyi tek sürüme paketleme.
- **Bulk regex/script YOK.** Manuel dosya-by-dosya edit (geçmişte bulk script 226+ syntax error + rollback üretti). Her edit'ten sonra `node -c` syntax check.
- **Tahmin yürütme.** Değiştirmeden önce gerçek dosyayı oku; sorun gelince önce DevTools console + kod ile mevcut durumu kontrol et, sonra çöz.
- **Yeni özellik önermeden önce repo'da grep ile var mı bak** — kod seviyesinden doğrula.
- **Operatöre teknik kod gösterilmez.** Diff/syntax detayı değil; değişikliği sade dille anlat (ne, hangi dosya, risk).

---

## Güvenlik sınırları (onay zorunlu)

DROP TABLE / destructive SQL · 50+ satır tek-seferde frontend değişikliği · yeni dosya/modül · cron veya RLS policy değişikliği · cross-device sync mantığı (cloud.js / cloud-pertable.js / cloud-realtime.js) · Edge Function deploy · plan/gating/yetki (plans.js / gate.js / user_prefs plan kolonları + kolon-seviyesi GRANT).

---

## Önerme — bunları spontan önerme

- Plan limiti / fiyat değişikliği (monetization v2.17'de KURULDU; değişiklik operatör kararı — `plans.js` + landing + Stripe birlikte).
- AI image gen entegrasyonu (operatörün RTX 5090'ı var, kendisi yönetir).
- Demo seed değişikliği.
- Screenshot ekleme: operatör kendisi çeker. **html2canvas ile ÜRETME** — liste ekranlarında descender kırpar, "1 4" boşluk artefaktı yapar, modal'ları boş render eder (v2.44.30 denendi → v2.44.31 geri alındı). Gerçek tarayıcı yakalaması şart.

---

## Mimari gotcha'lar

Bilmeden dokunmak beklenmedik davranış üretir. Format: "böyle çalışır → bu yüzden böyle yap."

**Plan/gating tek kaynağı = plans.js.** Limit + feature gate'leri `plans.js` → `PLAN_LIMITS`'ten okunur. Dağınık `if(plan==='pro')` YAZMA; `PCD.plans.getPlanLimits()` / `PCD.gate.can*()` kullan (`canCreateRecipe`, `canUseHaccp`, `canSync`, `canUseCostView`, `canUseLaborCost`, `showWatermark`…). Özelliği plana açıp kapamak = plans.js'te tek satır. Upgrade + Stripe checkout/portal tetikleyicileri `gate.js`'te.

**Plan SUNUCU-OTORİTER; frontend yazamaz.** Plan `user_prefs`'in ayrı kolonlarında (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`); kolon-seviyesi GRANT authenticated/anon yazmasını engeller. Frontend yalnız OKUR (`cloud.fetchPlan` boot'ta kolondan, data blob'undan DEĞİL). `user_prefs` upsert'ine plan EKLEME — yalnız `stripe-webhook` (service_role) veya manuel SQL yazar. `getUserPlan()` 'team'i de pro sayar.

**Manuel pro kalıcı — webhook ezmez.** `stripe-webhook` tüm plan update'lerini `.neq('plan_source','manual')` ile korur. SQL'de `plan='pro', plan_source='manual'` = Stripe'sız kalıcı pro. Bu guard'ı kaldırma.

**Bulut sync gate'i PUSH tarafında (free = yalnız yerel).** Free'de `cloud-pertable` enqueue (`queueUpsert`/`queueDelete`/`queueArraySync`) `syncAllowed()` ile erken döner. Pull AÇIK kalır (local∪remote merge, yerel veri ASLA ezilmez). Acil fren: plans.js free `cloudSync:true`. Not: operatörün kendisi manuel pro olmalı yoksa kendi senkronu durur.

**Watermark = `showWatermark()` — TÜM çıktı yolları.** Footer şu yolların HEPSİNDE bu gate'ten geçer (Free'de var, Pro'da temiz): `PCD.print` (utils.js — tüm print/PDF, recipe cost-report dahil), Excel (`PCD.xlsx` motoru utils.js otomatik + inline recipes/buffet/roster), roster JPEG (`sendRosterImage`), paylaşılan sayfa (share.js). **Yeni footer üreten her çıktı `!PCD.gate || PCD.gate.showWatermark()` ile sarılmalı.** Paylaşılan sayfada karar PAYLAŞANIN planına göre snapshot'a gömülür (`payload._wm`, create/refresh'te) — görüntüleyeni etkilemez. Metin/WhatsApp paylaşımları (supplier order, event) footer'sız (kapsam dışı).

**Cost-view paylaşım modu.** `createOrGetShareUrl(kind, id, 'cost')` cost-share üretir (yalnız Pro). Maliyet YALNIZCA cost-share payload'una gömülür (`payload.cost` + `payload._mode='cost'`); normal public link sızdırmaz. `public_shares` tekilliği `(owner, kind, source, share_mode)` → bir kaynağın hem public hem cost linki olabilir. Görüntüleme `?view=cost` / `payload._mode` ile maliyet panelini render eder. v2.44.34 — recipe cost-share artık özet panele ek olarak **tam maliyet kırılım tablosu** gömer/basar (`payload.cost.rows`: malzeme · birim fiyat · miktar · satır maliyeti + toplam + cost/serving|kg), iç-uygulama Cost Report (Simple) ile birebir; cost modda sade malzeme listesi gizlenir. `costBreakdownRows` ile üretilir; eski linkler tekrar "paylaş"a basınca payload tazelenir (`createOrGetShareUrl` her çağrıda günceller).

**Stripe Edge Function'ları + verify_jwt.** Supabase dashboard'dan deploy: `create-checkout-session`, `create-portal-session` (verify_jwt AÇIK — frontend user JWT yollar), `stripe-webhook` (verify_jwt KAPALI — Stripe imzayla doğrular). Kod değişirse Edge elle yeniden deploy (git push yalnız frontend'i günceller). Şu an test/sandbox; canlıda secret'lar live olur.

**Reload öncesi explicit flush.** UI state değiştirip `location.reload()` çağırıyorsa arada `await PCD.cloudPerTable.flushNow()` olmalı — debounced sync (600ms) bitmeden reload olursa buluta gitmez.

**PCD.icon — bilinmeyen isim sessizce fallback.** `PCD.icon(name, size)` registry'de olmayan isim için info ikonuna (kırmızı "i") düşer; Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Kullanmadan önce `grep -n "<name>:" app/js/core/utils.js`.

**Per-table cloud sync 3 yönlü.** Push: `cloud-pertable.js` (debounced 600ms, retry'lı, IDB'ye persist — sekme kapansa kaybolmaz). Pull: `cloud.js` (boot'ta tüm tablolar, drift detection). Realtime: `cloud-realtime.js` (WebSocket, JWT setAuth + TOKEN_REFRESHED). Sync bug'ında önce yönü belirle.

**Print tek noktadan: `PCD.print(html, title)` (utils.js).** Footer otomatik enjekte (tıklanabilir "Made with ProChefDesk · prochefdesk.com"); custom footer / `display:none` override koyma. Window 1200px (Kitchen Cards landscape A4). • Arka plan rengi basılacaksa `print-color-adjust:exact` (+ `-webkit-`) ZORUNLU, kalıtsaldır → body/root'a koy (menu_studio unuttu → v2.40 fix). • Tarayıcı damgalarını (tarih/başlık/about:blank/sayfa no) gizlemek için `@page{margin:0}` ZORUNLU + içeriğe kendi `padding`'i (roster v2.44.31; v2.44.33'te TÜM print'lere yayıldı). • **Tek çıktı paleti (v2.44 Deep Pine) — TÜM print/Excel/share:** başlık+kenarlık pine `#16433a` · aksan/CTA `#1f9d6b` · metin `#1c1917` · kenarlık `#e7e5e4` · th zemini `#eaf6f0` · Inter+Fraunces. Excel: pine `16433A` başlık + `E0DDD5` kenarlık + `F6F3EE` alt-satır (PCD.xlsx + inline roster/buffet/recipes AYNI). Yeni çıktıda bu paleti kullan, yeni yeşil/renk UYDURMA. Bilerek istisna: whiteboard (Oswald/Barlow), menu_studio temalı menüleri, HACCP grid çizgisi `#999` + danger/success.

**Modal focus.** `PCD.modal.open()` body'deki ilk form field'ına focus eder (X butonuna değil). Belirli field için modal sonrası `setTimeout(300ms)` + `.focus()`.

**Recipe ingredient separator.** `data.ingredients`'te `{separator:true, label?}` satırı var. Hesaplama path'leri (maliyet/alerjen/variance) `if(ri.separator) return;` ile skip; görüntüleme path'leri (editör/önizleme/kitchen card/share/PDF/discover) render etmeli.

**RLS tüm tablolarda aktif** (frontend `anon` key). Yeni tablo:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye.** Misafir (login yok): yalnız IDB, cloud yazma KAPALI, demo seed yüklenir. Üye: IDB + cloud çift yönlü. Yeni feature'da misafir için cloud push tetikleme.

**Root dosyalar app'ten bağımsız.** `/` (landing), `/privacy.html`, `/terms.html`, `/blog/` — kendi inline CSS'leri; app CSS değişikliği etkilemez (tersi de). Blog yazıları standalone HTML (Inter + Fraunces, cream paper, brand green CTA). Landing i18n = `index.html` içinde inline `I18N` objesi (en=HTML default, tr/es/fr/de/ar JS blokları) + `apply(lang)` + `#langSelect`.

**Landing'de HAZIR ama GİZLİ: şef referansları (testimonial) bölümü (v2.44.95).** `index.html` → `<section id="testimonials" style="display:none;">` (canlıda görünmez — **boş alan yok, sahte yorum yok**) — 3 placeholder kart + kod-içi TR talimat. **Aktive:** `style="display:none;"` → `style=""` + kartlardaki `[İsim]`/`[Rol]`/`[alıntı]`'yı gerçek referansla doldur (somut sonuç: "teklif 2 saatten 15 dk'ya düştü"). Gerçek 1-3 referans gelmeden AÇMA. Canlı olanlar: **ROI bloğu** (pricing altı, ~$179→$19 karşılaştırması, 6 dil, `roi_*` anahtarları) + **kurucu bloğu** (`founder_*`, Marriott/Katar). Hero (v2.44.95) ICP-konumlu: "caterer, event chefs & professional kitchens".

**Sub-recipe flattening.** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) tüm sub-recipe satırlarını gerçek ingredient seviyesine recursive düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip); `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. "Tarif → ingredient listesi" için bunu kullan. `variance.js` kendi recursion'unu kullanır.

**Lazy tool loading.** 16 araç dinamik script tag ile lazy. Eager: **dashboard** (home), **account** (auth), **inventory** (dashboard low-stock sync). Yeni araç: (a) `router.registerLazy(name, scriptPath, toolName)`, (b) dashboard click gerekiyorsa `_afterToolLoad(toolName, cb)` poll (120ms × 3sn).

**Kaldırılmış araçlar (v2.43 → v2.44.21).** v2.43'te 10 ölü dosya silindi; **8 hâlâ silik** (route yok, git geçmişinde): `menu_matrix, sales, whatif, yield, team` (TOOL), `allergens` (TOOL — `core/allergens-db.js` CANLI), `menus` (klasik; route'u menu_studio yükler), `tools-hub`. **3 yeniden inşa → CANLI:** `nutrition`, `variance` (UI; motor `core/variance.js` zaten canlıydı), `waste`. Bu 3 + `portion` + `prep` v2.44.30'da sidebar yerine sub-nav sekmelerinde (`PCD.subNav`) — route'lar app.js'te DURUYOR. **Hâlâ şema-only (UI YOK):** `shopping_lists`, `mise_plans`, `team`. Route tek kaynağı: `app/js/core/app.js`. Detay: HANDOVER.md.

**`PCD.on` delegasyonu kalıcı — GENEL `data-*` araçlar arası sızar.** `PCD.on(node, ev, sel, handler)` paylaşılan kalıcı `#view`'a delege eder, navigasyonda ASLA kaldırılmaz. İki araç aynı genel attribute'u (`data-open/del/dup/edit`) kullanırsa handler'lar çakışır + sızıntı kalıcı olur (v2.40: menu_studio `data-open`'ı roster'la çakıştı → "Menu not found"). **Kural:** araç-özel prefix (`data-ms-open`, `data-rost-open`…); genel `data-open/del/dup/edit` kullanma, eklemeden önce başka araç kullanıyor mu grep et.

**xlsx + i18n lazy.** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) ilk tıklamada CDN'den. `i18n.js` `setLocale()` async — boot'ta yalnız `en.js`; diğer diller dinamik fetch.

**Büfe maliyet (`computeItemCost` 3 path).** (a) `recipeId` → sub-recipe cost cascade; (b) `ingredientId` → `pricePerUnit × (1/yield)`; (c) `customName` → cost=0. **Recipe item (Path B):** maliyet = (tarif maliyeti ÷ servings) × kişi × `amountPerGuest` × refill — `amountPerGuest` = **porsiyon/kişi** (gram girilirse ~100× şişer, dönüşüm yok). Ingredient item (Path A) gramı doğru işler. Yeni hesaplamada 3 path'i de kapsa.

**HACCP Hub.** 4 form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında; 4 form route'u korunmuş (bookmark + direct link çalışır). **Audit Pack (v2.44.97):** hub'da ay seçici + birleşik aylık denetim raporu (`collectAuditData`/`buildAuditPackHtml` haccp.js içinde, private). Aggregator 4 formun `PCD.store.listTable()` dizilerini SALT-OKUR toplar (formlara/şemaya/sync'e dokunmaz). Pass/fail KAYNAĞI: cooling/holding/receiving → `PCD.haccp.getThresholds()` (bölge eşikleri); logs → birimin kendi `min/max`'ı (`haccpUnits`). **Yeni eşik mantığı ekleme — formların fail kuralını birebir yansıt yoksa rapor ≠ grid.** Açık-CAPA tanımı: aralık-dışı + corrective notu BOŞ = OPEN. **Dürüstlük modeli (v2.44.100) — BOZMA:** rapor geçme-oranını "compliance" DİYE göstermez (yanıltıcı); "Readings in range" der + AYRI **günlük-log kapsaması** (N/M gün loglandı, <%90 amber "boşluk = en büyük denetim riski") gösterir — denetçi tamlığa bakar, geçme oranına değil. Event-bazlı formlar (receiving/cooling/holding) her gün yapılmaz → 0 kayıt = nötr "İşlem kaydı yok", uyumsuzluk DEĞİL. Coverage YALNIZ günlük sıcaklık loguna uygulanır (`haccpReadings` günlü gün sayımı / ayda geçen gün). **Çok-aylık yazdırma (v2.44.101):** her form + Audit Pack ay-aralığı seçip tek PDF basabilir. Ortak `PCD.haccp.pickMonthRange`/`monthsInRange`/`printSheets` (utils.js). Her formun print fn'inde `returnHtml` parametresi var (tek-ay çıktısı DEĞİŞMEZ — sadece HTML döndürülebiliyor); `printSheets` her ayın sheet'ini landscape page-break ile dizer, iç `body{}` kuralı sarmalanınca etkisiz kalır. Holding günlük → aralıktaki kayıtlı günler. Audit Pack range portrait, her ay kendi tam belgesi. **Yeni form print fn yazarken `returnHtml` desenini koru.** Veri okuma anahtarları: `haccpReadings`(`{unitId,date,morning/evening:{value,note,chef}}`)+`haccpUnits`, `haccpCookCool`(`monthYM`/`day`+`cp2hTemp`/`endedTemp`/`note`), `haccpReceiving`(`date`+`conditionOK`/`deliveryTemp`/`note`), `haccpHolding`(`date`+`holdType`+`check1/2/3Temp`+`correctiveAction`). Hub today-count `countTodayEntries('haccpCooling',…)` YANLIŞ anahtar okur (gerçek tablo `haccpCookCool`) — cooling bugün-sayacı hep 0, ama Audit Pack doğru anahtarı kullanır.

**Cloud sync tablo pattern'leri.** • **Array-tablo** (`buffets`, `mise_plans`, `team`, `whiteboards`, `checklist_sessions`, `waste`, `shopping_lists`): soft-delete tombstone (`_deletedAt`), `queueArraySync` push, realtime. Yeni: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES. • **MAP-tablo** (`rosters`, `prepSheets`, `stock_count_history`, `haccp_*` — `{wsId:{recordId:obj}}`): `upsertInTable`/`deleteFromTable` (`updatedAt` otomatik), `cloud.js` HIGH_EDIT_WS_TABLES'te olmalı (per-record en-yeni-kazanır). Yeni MAP tablo 6 nokta: store.js · cloud-pertable.js · cloud-realtime.js · cloud.js · backup-to-r2 · migration (tablo + RLS + realtime publication + cascade trigger + REPLICA IDENTITY FULL).

**CSP yok.** `index.html`'de Content-Security-Policy meta yok. Eklenecekse minimal `script-src * 'unsafe-inline' 'unsafe-eval'` ile başla; her tightening'de hCaptcha + Discover foto yüklemesini test et.

**hCaptcha.** `account.js`'de `?onload=__pcdHcaptchaOnLoad&render=explicit` + `window.__pcdHcaptchaOnLoad` callback; bozulursa widget çizilir ama handler attach olmaz. Modal scroll lock `html/body{overflow:hidden}` ile — `position:fixed`/`transform`/`top:-scrollY` ile body koordinatını değiştirme (hCaptcha/3rd-party popup ofsetli yerleşir).

**Discover view count rate-limited.** `recipes.view_count` doğrudan artırılmaz → `rate-limited-view` Edge Function: header'dan IP, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC. `discover_view_logs` + saatlik cleanup cron.

**Photo storage flow + race.** Recipe foto → WebP @0.82 → Supabase Storage → public URL → `data.photo`. Upload async; save click anında `data.photo` eski olabilir → sync foto'suz gider. Foto görünmüyor raporunda: recipe'i aç → Save → 5sn → Discover Refresh.

**Sipariş "yolda" (on-order) yaşam döngüsü (v2.44.103).** Sipariş gönderilince `suppliers.recordOrder` → `PCD.tools.inventory.markOrdered(ids)` envantere `lastOrderedAt` damgalar (hem Sipariş Oluştur hem Tedarikçiler ekranı). `isOnOrder(row)` = sipariş edildi + henüz teslim alınmadı (`lastReceivedAt < lastOrderedAt`) + hâlâ par-altı + 21 günden yeni → kalem kırmızı "sipariş et" sayacından + Generate Order AKTİF listesinden düşer (çift-sipariş önleme), altta soluk "Sipariş verildi" bölümünde "Tekrar sipariş" (`clearOrdered`) ile geri alınır. Teslim alınınca / par üstüne çıkınca / süre dolunca otomatik temizlenir (flag silinmez). **`recordOrder`'daki `markOrdered` kancasını + sipariş kalemlerindeki `id`'yi kaldırma** — yoksa gönderim envanteri "yolda" işaretleyemez. Generate Order'da gönderim modalı AÇIK kalır (`startOrder(name, items, onSent)` opsiyonel callback → grup "Gönderildi ✓"); Tedarikçiler ekranı çağrısında `onSent` yok, davranış değişmez. **Event "Shopping list" + Buffet "Order list" de (v2.44.104) aynı `startOrder` + `markOrdered`'a bağlı:** her gerçek tedarikçi grubuna "Send" butonu; gönderince o tedarikçi event/buffet kaydının `_supplierOrders` (`{supplierName:iso}`) alanına yazılır → tekrar açınca "✓ Ordered" rozeti + "Order again" (deduct-stock guard mantığı, çift-sipariş önler). Bağlanmamış/manuel kalemler ve sub-recipe grupları buton almaz. Event rozeti `upsertInTable('events')`, buffet rozeti `writeBuffets` ile kalıcı + cloud-sync.

**Whiteboard.** Canvas önizleme + print AYNI `renderBlockContent(block)` + `blockBoxStyle(block)`'u kullanır (canvas gerçek A4/A3 px + `transform:scale`; print aynı px'i mm `@page`'de basar) — iki motoru AYIRMA, yoksa önizleme ≠ çıktı. Print body `display:flex;flex-direction:column` + `.wb-print-sheet{flex:1}` → footer tek sayfada. `.wb-canvas-viewport{min-width:0}` + workspace grid `minmax(0,1fr)` zorunlu (yoksa mobilde yatay taşar). `applyCanvasScale()` ilk yüklemede clientWidth=0 ise rAF self-retry (bounded 60); ResizeObserver sonraki resize için. app.js global error handler'da "ResizeObserver" filtresi var — kaldırma.

**clientWidth=0 ilk-paint yarışı — standart çözüm bounded rAF self-retry.** Scale-to-fit önizleme (sabit doğal genişlikte render → `transform:scale`) ilk mount'ta `clientWidth=0` dönerse ölçek uygulanmaz → çıktı taşar (hard-refresh + mobil). Çözüm: `if(!w){ if((_t||0)<60) requestAnimationFrame(()=>fn((_t||0)+1)); return; }`. Kullanan: whiteboard `applyCanvasScale`, menu_studio `sizeThumbs`, kitchen_cards `applyScale`, roster `fitRosterPv`. Yeni scale-to-fit önizlemede bu deseni kullan.

**Profil kaydı — flush.** `store.set('user', u)` 400ms debounce'lu; profil kaydından SONRA `PCD.store.flush()` (account.js save + preview handler), yoksa kaydet→kapat/yenile race'inde kaybolur. Auth `_setUser` aynı hesapta MERGE eder (role/country/workplace/bio her restore'da korunur) — overwrite'a çevirme.

**i18n.** • `t(key, vars)` — 2 parametre; `t(key, 'fallback', {params})` çalışmaz (3. arg yok sayılır). Eksik anahtar `bundles.en[key]`'e düşer. • **6 dil TAM** (en/tr/es/fr/de/ar): en+tr (2942) + es/fr/de/ar (2598, v2.43.17 — 0 eksik). Yeni anahtar: ilgili `app/js/i18n/<lang>.js` SONUNA `window.PCD.i18n.register('<lang>', {…})` bloğu ekle (`register` `Object.assign` MERGE eder, i18n.js:72). Placeholder (`{n}`,`{name}`) + escape tırnak (`\"`) + emoji KORU; İngilizce çoğul işaretçilerini DÜŞÜR; ÖLÜ araç anahtarlarını (sales/yield/matrix/team/allergens/whatif/tools_hub/menus + `t_*`) ÇEVİRME. Doğrulama: preview `setLocale` eski bundle'ı cache'ler → `fetch('...?cb='+Date.now())` + `eval` + setLocale.

**Menü diyet/alerjen harf kodları.** `MENU_CODES`: küçük harf = diyet/uygunluk (v/vg/gf/gfo/df/dfo/nf/h), BÜYÜK = "içerir" alerjen (N/G/D/E/F/SF/S/SE). Kodlar yalnız BİLGİ (filtre değil). Gösterim `displayCodeIds(it)` = manuel `it.codes` ∪ otomatik `autoAllergenCodeIds(it)`. Manuel kodlar recipe'yi değiştirmez. Yeni kod = MENU_CODES + 6 dilde `menu_code_*`.

**Roster çıktı motoru tek.** print / Excel / JPEG hepsi `buildRosterTable(data, showCost)` + `rosterMatrix(data)` üzerinden. `groupedStaff(data)` `.group` döndürür (`.name` değil); `rosterMatrix` `name: g.group` map'ler. Hücre: `{start, end, note}` (vardiya) veya `{status:'OFF'}` (0 saat). Excel yatay/tek sayfa: JSZip ile `sheet1.xml`'e `<sheetPr>` + `<pageSetup>` enjekte (`ws['!pageSetup']` SheetJS'te çalışmaz). JPEG: html2canvas lazy → `navigator.canShare({files})` varsa native share.

**Ortak styled-Excel = `PCD.xlsx`.** Yeni export'lar `PCD.loadXLSX().then(XLSX => PCD.xlsx.save(...))` (kalın yeşil başlık + çerçeve + alt-satır gölgesi + autofit + **Free'de otomatik gate'li footer satırı**). Roster kendi inline worksheet'ini kullanır (hücre rengi `PCD.xlsx`'te yok; footer'ı da kendi gate'leyerek ekler) — dokunma.

**Demo seed (`app/js/seed/demo-recipes.js`) — 5 kural.** (1) Tek seferlik `onboarding.demoSeeded` flag; sürüm değişince yeniden yüklenmez (görmek için incognito). (2) Event menü alanı `menu` ('recipes' değil — `events.js` `event.menu` okur). (3) Inventory seed `findId(upserted, name)`. (4) Supplier `category` görünen ad (Produce / Meat & Poultry / Seafood / Dairy / Dry Goods…), i18n key değil. (5) Büfe ayrı kayıt yolu (`_read('buffets')` ws-keyed dizi, `upsertInTable` değil).

**Discover skorları hesap bazlı.** "My public recipes" = `_read('recipes')` ile TÜM workspace'lerdeki `isPublic` tarifler (aktif ws'in `listRecipes()` değil), yoksa boş ws'te 0 görünür.

**recipe_likes RLS sıkı.** SELECT yalnız kendi like'ları. Public like count gerekirse `pcd_get_recipe_like_count(text)` RPC (SECURITY DEFINER, aggregate-only, anon+authenticated EXECUTE). `recipes.like_count` denormalized kolon zaten public.

---

## Blog SEO standardı

Her yeni blog yazısı:

1. **JSON-LD Article schema** (`<head>`) — headline + description + datePublished + dateModified + author.Person + publisher.Organization + mainEntityOfPage + wordCount + keywords.
2. **≥1 authority outbound link** — gov/akademik (USDA / FDA / FSANZ / EU / UK FSA / Cornell), `target="_blank" rel="noopener"`.
3. **`<section class="related-posts">` 2-card cross-link** (footer'dan önce) — topic cluster.
4. **sitemap.xml** — yeni `<url>` + etkilenen `<lastmod>`.
5. **blog/index.html** — en üste yeni `<a class="post-card">` (newest first).

**Stil:** Standalone HTML, Inter + Fraunces, cream paper (`#FAF7F2` bg / `#FFFEFA` paper), `#2D4A3E` deep forest + `#16a34a` brand green CTA (CSS her yazıda aynı, build step yok). **Push sonrası:** Google Search Console → URL Inspection → Request Indexing.
