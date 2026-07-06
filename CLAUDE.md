# ProChefDesk — Claude Code Rehberi

## Proje

ProChefDesk — profesyonel şefler için web tabanlı mutfak yönetim sistemi. **Operatör:** Ahmet Kaya, aktif kullanıcı şef. Solo proje. **Production:** `prochefdesk.com`, uygulama `/app/` altında.

**Stack:** Vanilla JS (bundler/service worker yok), IndexedDB (yerel-öncelikli ana storage), Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (GitHub push'ta auto-deploy), Cloudflare R2 (gece yedek).

Araç envanteri + mimari → **`HANDOVER.md`** · sürüm geçmişi → **`CHANGELOG.md`**. Launch işleri → aşağıdaki bölüm; büyüme roadmap'i operatörde — yeni özelliği spontan kurma, ne yapılacağını operatör söyler.

---

## Durum

**Ürün lansman-hazır.** Stripe canlı: `ProChefDesk, LLC` (Delaware) · **$19/ay `price_1TkaHBPAp6Hx01isprzC026A` · $190/yıl `price_1TkaI8PAp6Hx01isG2HOVwzQ`** · `config.js STRIPE_PK`=pk_live · 3 Edge Fn + webhook (checkout.completed/subscription.updated/.deleted) · Mercury payout · uçtan uca test geçti. Site LLC/USD/Delaware (terms+privacy 6 dil · liability cap US$100 · 131 Continental Dr Newark DE). Reputation temiz (Google Safe Browsing + Norton OK). 54 blog + sitemap canlı. Profil senkronu çalışır (`prefs.profile`).

**Açık (operatör işi, kod değil):**
- [ ] **Go-to-market — ASIL İŞ.** Tek hedef ↓.
- [ ] iOS/Safari gerçek cihaz testi (kamera/share-sheet/PWA/hCaptcha — kod denetimi tamam).
- [ ] Launch QA — operatörle son manuel pass.
- [ ] **Google Search Console** — 30 yeni blog (toplam 54) canlı & push edildi (2026-07-05). Yapılacak: GSC'de sitemap'i (`prochefdesk.com/sitemap.xml`) yeniden gönder + yeni URL'lere "Request Indexing" (aramada hızlı görünmesi için). Salt operatör işi.
- [ ] **Demo tur videosu** (opsiyonel) — operatör 2 dk'lık uygulama-içi demo videosu çekip YouTube'a yükleyince: Claude landing hero'nun altına responsive `<iframe>` ile gömer (1-2 dk'lık iş, YouTube Paylaş→Yerleştir kodu).
- [ ] **Capacitor mağaza uygulaması** (opsiyonel) — mevcut PWA'yı native app'e sarma (Play Store / App Store). Teknik kurulumu Claude yapar (birkaç saat); **Mac + Xcode + Apple Developer ($99/yıl) + Google Play ($25 tek sefer) hesapları operatörde** (+ App Store inceleme ~1-3 gün). Not: uygulama zaten PWA — "ana ekrana ekle" ile app gibi çalışıyor, mağaza şart değil.
- [ ] **Testimonial (şef referansı) bölümü** — landing'de kod HAZIR ama gizli (`index.html` `#testimonials` `display:none`, 3 placeholder kart). Gerçek 1-3 şef referansı gelince: `display:none`→`display:` yap + `[İsim]/[Rol]/[alıntı]`'yı somut sonuçla doldur ("teklif 2 saatten 15 dk'ya düştü" gibi). **Sahte yorum YOK, gerçek referans gelmeden AÇMA.**
- [ ] (Gelecek) AU PR alınca → AU Stripe'a geç (ABN+AU banka) + ABD LLC feshet. **Vergi:** DE LLC ~$300/yıl (1 Haz) + federal 5472+1120 (15 Nis; gelir 0 olsa bile; 5472 kaçırma $25k; ilk dosyalama 2027).

**Stripe kritik notlar:** kimlik engeli → support.stripe.com specialist (Ask Atlas değil). Para yolu: Stripe→Mercury→Wise→AU/TR. Adaptive Pricing KAPALI ($19 sabit). free→pro: `migrations/v2.44.38` user_prefs satırını trigger'la yaratır — yeni `.update().eq(user_id)` yazan satır var olduğunu varsaymalı / upsert kullanmalı.

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

- Plan limiti / fiyat değişikliği (monetization KURULU; değişiklik operatör kararı — `plans.js` + landing + Stripe birlikte).
- AI image gen entegrasyonu (operatörün RTX 5090'ı var, kendisi yönetir).
- Demo seed değişikliği.
- Screenshot ekleme: operatör kendisi çeker. **html2canvas ile ÜRETME** — liste ekranlarında descender kırpar, "1 4" boşluk artefaktı yapar, modal'ları boş render eder. Gerçek tarayıcı yakalaması şart.

---

## Mimari gotcha'lar

Bilmeden dokunmak beklenmedik davranış üretir. Format: "böyle çalışır → bu yüzden böyle yap."

**Plan/gating tek kaynağı = plans.js.** Limit + feature gate'leri `plans.js` → `PLAN_LIMITS`'ten okunur. Dağınık `if(plan==='pro')` YAZMA; `PCD.plans.getPlanLimits()` / `PCD.gate.can*()` kullan (`canCreateRecipe`, `canUseHaccp`, `canSync`, `canUseCostView`, `canUseLaborCost`, `showWatermark`…). Özelliği plana açıp kapamak = plans.js'te tek satır. Upgrade + Stripe checkout/portal tetikleyicileri `gate.js`'te.

**Plan SUNUCU-OTORİTER; frontend yazamaz.** Plan `user_prefs`'in ayrı kolonlarında (`plan`, `plan_source`, `plan_status`, `plan_expires_at`, `stripe_customer_id`); kolon-seviyesi GRANT authenticated/anon yazmasını engeller. Frontend yalnız OKUR (`cloud.fetchPlan` boot'ta kolondan, data blob'undan DEĞİL). `user_prefs` upsert'ine plan EKLEME — yalnız `stripe-webhook` (service_role) veya manuel SQL yazar. `getUserPlan()` 'team'i de pro sayar.

**Manuel pro kalıcı — webhook ezmez.** `stripe-webhook` tüm plan update'lerini `.neq('plan_source','manual')` ile korur. SQL'de `plan='pro', plan_source='manual'` = Stripe'sız kalıcı pro. Bu guard'ı kaldırma.

**Bulut sync gate'i PUSH tarafında (free = yalnız yerel).** Free'de `cloud-pertable` enqueue (`queueUpsert`/`queueDelete`/`queueArraySync`) `syncAllowed()` ile erken döner. Pull AÇIK kalır (local∪remote merge, yerel veri ASLA ezilmez). Acil fren: plans.js free `cloudSync:true`. Not: operatörün kendisi manuel pro olmalı yoksa kendi senkronu durur.

**Watermark = `showWatermark()` — TÜM çıktı yolları.** Footer şu yolların HEPSİNDE bu gate'ten geçer (Free'de var, Pro'da temiz): `PCD.print` (utils.js — tüm print/PDF, recipe cost-report dahil), Excel (`PCD.xlsx` motoru utils.js otomatik + inline recipes/buffet/roster), roster JPEG (`sendRosterImage`), paylaşılan sayfa (share.js). **Yeni footer üreten her çıktı `!PCD.gate || PCD.gate.showWatermark()` ile sarılmalı.** Paylaşılan sayfada karar PAYLAŞANIN planına göre snapshot'a gömülür (`payload._wm`, create/refresh'te) — görüntüleyeni etkilemez. Metin/WhatsApp paylaşımları (supplier order, event) footer'sız (kapsam dışı).

**Cost-view paylaşım modu.** `createOrGetShareUrl(kind, id, 'cost')` cost-share üretir (yalnız Pro). Maliyet YALNIZCA cost-share payload'una gömülür (`payload.cost` + `payload._mode='cost'`); normal public link sızdırmaz. `public_shares` tekilliği `(owner, kind, source, share_mode)` → bir kaynağın hem public hem cost linki olabilir. Görüntüleme `?view=cost` / `payload._mode` ile maliyet panelini render eder. Recipe cost-share özet panele ek olarak **tam maliyet kırılım tablosu** gömer/basar (`payload.cost.rows`: malzeme · birim fiyat · miktar · satır maliyeti + toplam + cost/serving|kg), iç-uygulama Cost Report (Simple) ile birebir; cost modda sade malzeme listesi gizlenir. `costBreakdownRows` ile üretilir; eski linkler tekrar "paylaş"a basınca payload tazelenir (`createOrGetShareUrl` her çağrıda günceller).

**Stripe Edge Function'ları + verify_jwt.** Supabase dashboard'dan deploy: `create-checkout-session`, `create-portal-session` (verify_jwt AÇIK — frontend user JWT yollar), `stripe-webhook` (verify_jwt KAPALI — Stripe imzayla doğrular). Kod değişirse Edge elle yeniden deploy (git push yalnız frontend'i günceller). Şu an test/sandbox; canlıda secret'lar live olur.

**Reload öncesi explicit flush.** UI state değiştirip `location.reload()` çağırıyorsa arada `await PCD.cloudPerTable.flushNow()` olmalı — debounced sync (600ms) bitmeden reload olursa buluta gitmez.

**PCD.icon — bilinmeyen isim sessizce fallback.** `PCD.icon(name, size)` registry'de olmayan isim için info ikonuna (kırmızı "i") düşer; Lucide isimleri (`trash-2`, `rotate-ccw`) çalışmaz. Kullanmadan önce `grep -n "<name>:" app/js/core/utils.js`.

**Per-table cloud sync 3 yönlü.** Push: `cloud-pertable.js` (debounced 600ms, retry'lı, IDB'ye persist — sekme kapansa kaybolmaz). Pull: `cloud.js` (boot'ta tüm tablolar, drift detection). Realtime: `cloud-realtime.js` (WebSocket, JWT setAuth + TOKEN_REFRESHED). Sync bug'ında önce yönü belirle.

**Print tek noktadan: `PCD.print(html, title)` (utils.js).** Footer otomatik enjekte (tıklanabilir "Made with ProChefDesk · prochefdesk.com"); custom footer / `display:none` override koyma. Window 1200px (Kitchen Cards landscape A4). • Arka plan rengi basılacaksa `print-color-adjust:exact` (+ `-webkit-`) ZORUNLU, kalıtsaldır → body/root'a koy. • Tarayıcı damgalarını (tarih/başlık/about:blank/sayfa no) gizlemek için `@page{margin:0}` ZORUNLU + içeriğe kendi `padding`'i (TÜM print'lerde). • **Tek çıktı paleti (Deep Pine) — TÜM print/Excel/share:** başlık+kenarlık pine `#16433a` · aksan/CTA `#1f9d6b` · metin `#1c1917` · kenarlık `#e7e5e4` · th zemini `#eaf6f0` · Inter+Fraunces. Excel: pine `16433A` başlık + `E0DDD5` kenarlık + `F6F3EE` alt-satır (PCD.xlsx + inline roster/buffet/recipes AYNI). Yeni çıktıda bu paleti kullan, yeni yeşil/renk UYDURMA. Bilerek istisna: whiteboard (Oswald/Barlow), menu_studio temalı menüleri, HACCP grid çizgisi `#999` + danger/success.

**Modal focus.** `PCD.modal.open()` body'deki ilk form field'ına focus eder (X butonuna değil). Belirli field için modal sonrası `setTimeout(300ms)` + `.focus()`.

**Recipe ingredient separator.** `data.ingredients`'te `{separator:true, label?}` satırı var. Hesaplama path'leri (maliyet/alerjen/variance) `if(ri.separator) return;` ile skip; görüntüleme path'leri (editör/önizleme/kitchen card/share/PDF/discover) render etmeli.

**RLS tüm tablolarda aktif** (frontend `anon` key). Yeni tablo:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_owner_all ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Misafir vs üye (3 katman: misafir/free/pro).** Misafir (login yok, `user.id` yok): yalnız IDB, cloud yazma KAPALI, demo seed yüklenir; tüm araçları GÖRÜR ama oluştur/kaydet (`gate.requireAuth`), çıktı (`gate.requireExport` misafiri keser) ve paylaşım (`gate.requireShare`) duvarla durur. Üye: IDB + cloud çift yönlü, plan limitleri (`plans.js`) geçerli. Yeni yazma/çıktı/paylaşım akışına ilgili `require*` gate'ini ekle; misafir için cloud push tetikleme.

**Root dosyalar app'ten bağımsız.** `/` (landing), `/privacy.html`, `/terms.html`, `/blog/` — kendi inline CSS'leri; app CSS değişikliği etkilemez (tersi de). Blog yazıları standalone HTML (Inter + Fraunces, cream paper, brand green CTA). Landing i18n = `index.html` içinde inline `I18N` objesi (en=HTML default, tr/es/fr/de/ar JS blokları) + `apply(lang)` + `#langSelect`.

**Landing'de HAZIR ama GİZLİ: şef referansları (testimonial) bölümü.** `index.html` → `<section id="testimonials" style="display:none;">` (canlıda görünmez — **boş alan yok, sahte yorum yok**) — 3 placeholder kart + kod-içi TR talimat. **Aktive:** `style="display:none;"` → `style=""` + kartlardaki `[İsim]`/`[Rol]`/`[alıntı]`'yı gerçek referansla doldur (somut sonuç: "teklif 2 saatten 15 dk'ya düştü"). Gerçek 1-3 referans gelmeden AÇMA. Canlı olanlar: **ROI bloğu** (pricing altı, ~$179→$19 karşılaştırması, 6 dil, `roi_*` anahtarları) + **kurucu bloğu** (`founder_*`, Marriott/Katar). **Hero food-cost-led** (2026-07): eyebrow "Food costing for restaurants, cafés & caterers" · H1 "Know the true cost of every plate." (6 dil) — title/description/og/twitter + `og-image.png` + `manifest.webmanifest` + `app/index.html` hepsi bu sloganla hizalı. Proof grid'e HACCP Audit Pack görseli + 6 proof screenshot (events/event_detail/buffet/buffet_detail/roster/variance `.png`, food-cost <%25 tutarlı) eklendi.

**Sub-recipe flattening.** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) tüm sub-recipe satırlarını gerçek ingredient seviyesine recursive düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip); `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. "Tarif → ingredient listesi" için bunu kullan. `variance.js` kendi recursion'unu kullanır.

**Recipe compute API + sözleşme (dashboard.js, 16 araç tüketir).** Paylaşılan fonksiyonlar `PCD.recipes.*` = `computeFoodCost` · `flattenIngredients` · `costBreakdownRows` · `resolveRow` · `isPrep` · `buildRecipeMap` **dashboard.js'te** (recipes.js'te DEĞİL — eager yüklü olsun diye). Tüketiciler: menu_studio · events · buffet · kitchen_cards · inventory · variance · nutrition · portion · checklist · waste · share · ingredients · allergens-db · menu_engineering · dashboard · recipes. **DOKUNULAMAZ:** bu fonksiyon imzaları + `ingredients[]` satır şekli (`ingredientId`/`recipeId`/`amount`/`unit`/`separator`) + `servings`/`salePrice`/`yieldAmount`/`yieldUnit`/`isSubRecipe`/`allergens`. Recipe'ye veri eklemek istersen **yeni additive alan** ekle (kimse okumaz, güvenli) — mevcut alan/şekil/ imza DEĞİŞTİRME.

**Recipe fiyatlandırma (editör + Cost Report).** Editörde `targetFoodCostPct` (additive, recipe-bazlı, vars. 30) → önerilen fiyat = `costPerServing / (hedef/100)` + brüt kâr/porsiyon + food cost % rengi hedefe göre (≤hedef yeşil/≤hedef+5 amber/üstü kırmızı). "Önerilen fiyatı uygula" yalnız mevcut `salePrice`'ı yazar. Panel prep'te gizli (`updatePricingDOM`/`updateCostStripDOM` canlı, hedef input'una dokunmaz → focus korunur). **Cost Report aynı per-recipe hedefi kullanır** (`it.target = r.targetFoodCostPct || 30`); editör ile report tutarlı olmalı — biri değişirse diğerini hizala. XLSX hedef hücresi per-row (formül `cps/targetRow`), per-item `it.target` yazılır.

**Lazy tool loading.** Araçlar dinamik script tag ile lazy (`registerLazy`). Eager (boot'ta yüklü) yalnız 3: **dashboard** (home), **account** (auth), **inventory** (dashboard low-stock sync). Yeni araç: (a) `router.registerLazy(name, scriptPath, toolName)`, (b) dashboard click gerekiyorsa `_afterToolLoad(toolName, cb)` poll (120ms × 3sn).

**Olmayan route'lar — yeniden ekleme.** Şu isimlerde tool/route YOK (git geçmişinde): `menu_matrix · sales · whatif · yield · tools-hub`; `allergens` (route yok ama `core/allergens-db.js` CANLI — alerjen DB'si onu kullanır); `menus` (klasik tool yok — `'menus'` route'unu `menu_studio.js` yükler). **Şema var, UI yok:** `shopping_lists · mise_plans · team`. Route tek kaynağı: `app/js/core/app.js`. Detay: HANDOVER.md.

**`PCD.on` delegasyonu kalıcı — GENEL `data-*` araçlar arası sızar.** `PCD.on(node, ev, sel, handler)` paylaşılan kalıcı `#view`'a delege eder, navigasyonda ASLA kaldırılmaz. İki araç aynı genel attribute'u (`data-open/del/dup/edit`) kullanırsa handler'lar çakışır + sızıntı kalıcı olur (örnek: menu_studio `data-open`'ı roster ile çakışırsa → "Menu not found"). **Kural:** araç-özel prefix (`data-ms-open`, `data-rost-open`…); genel `data-open/del/dup/edit` kullanma, eklemeden önce başka araç kullanıyor mu grep et.

**xlsx + i18n lazy.** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) ilk tıklamada CDN'den. `i18n.js` `setLocale()` async — boot'ta yalnız `en.js`; diğer diller dinamik fetch.

**Büfe maliyet (`computeItemCost` 3 path).** (a) `recipeId` → sub-recipe cost cascade; (b) `ingredientId` → `pricePerUnit × (1/yield)`; (c) `customName` → cost=0. **Recipe item (Path B):** maliyet = (tarif maliyeti ÷ servings) × kişi × `amountPerGuest` × refill — `amountPerGuest` = **porsiyon/kişi** (gram girilirse ~100× şişer, dönüşüm yok). Ingredient item (Path A) gramı doğru işler. Yeni hesaplamada 3 path'i de kapsa.

**HACCP Hub.** 4 form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında; 4 form route'u korunmuş (bookmark + direct link çalışır). **Audit Pack:** hub'da ay seçici + birleşik aylık denetim raporu (`collectAuditData`/`buildAuditPackHtml` haccp.js içinde, private). Aggregator 4 formun `PCD.store.listTable()` dizilerini SALT-OKUR toplar (formlara/şemaya/sync'e dokunmaz). Pass/fail KAYNAĞI: cooling/holding/receiving → `PCD.haccp.getThresholds()` (bölge eşikleri); logs → birimin kendi `min/max`'ı (`haccpUnits`). **Yeni eşik mantığı ekleme — formların fail kuralını birebir yansıt yoksa rapor ≠ grid.** Açık-CAPA tanımı: aralık-dışı + corrective notu BOŞ = OPEN. **Dürüstlük modeli — BOZMA:** rapor geçme-oranını "compliance" DİYE göstermez (yanıltıcı); "Readings in range" der + AYRI **günlük-log kapsaması** (N/M gün loglandı, <%90 amber "boşluk = en büyük denetim riski") gösterir — denetçi tamlığa bakar, geçme oranına değil. Event-bazlı formlar (receiving/cooling/holding) her gün yapılmaz → 0 kayıt = nötr "İşlem kaydı yok", uyumsuzluk DEĞİL. Coverage YALNIZ günlük sıcaklık loguna uygulanır (`haccpReadings` günlü gün sayımı / ayda geçen gün). **Çok-aylık yazdırma:** her form + Audit Pack ay-aralığı seçip tek PDF basabilir. Ortak `PCD.haccp.pickMonthRange`/`monthsInRange`/`printSheets` (utils.js). Her formun print fn'inde `returnHtml` parametresi var (tek-ay çıktısı DEĞİŞMEZ — sadece HTML döndürülebiliyor); `printSheets` her ayın sheet'ini landscape page-break ile dizer, iç `body{}` kuralı sarmalanınca etkisiz kalır. **Holding (v2.44.117) artık diğer 3 form gibi ay-ay:** `printMonthFilled` o ayın TÜM kayıtlarını gün gün satır olarak basar (boş ay = boş şablon, toast yok); per-gün range + "Aylık boş" butonu kaldırıldı. Audit Pack range portrait, her ay kendi tam belgesi. **Yeni form print fn yazarken `returnHtml` desenini koru.** **Tek-sayfa fit — TÜM 4 form aynı kompakt print metriğini paylaşmalı** (A4 yatay, 31 satır): `body{width:297mm;height:210mm;flex column}` + `@media screen{height:auto}` + `.h-sheet{flex:1}` + tablo satır **21px** · hücre dolgusu **2px 3px** · line-height **1.25** + `.pcd-print-footer{padding:0.5mm 4mm;line-height:1.1;font-size:7pt !important}`. **`haccp_logs` = REFERANS;** biri kayarsa (örn. 22px satır) içerik tek A4 yatağı aşar → çok-aylık baskıda her ay 2 sayfaya taşar. Cooling v2.44.115'te logs'a yeniden hizalandı (sheet ≈773px ≤ 794px). Doğrulama: ay HTML'ini 297mm genişlikte ölç, `.h-sheet` yüksekliği ≤ 794px olmalı. Veri okuma anahtarları: `haccpReadings`(`{unitId,date,morning/evening:{value,note,chef}}`)+`haccpUnits`, `haccpCookCool`(`monthYM`/`day`+`cp2hTemp`/`endedTemp`/`note`), `haccpReceiving`(`date`+`conditionOK`/`deliveryTemp`/`note`), `haccpHolding`(`date`+`holdType`+`check1/2/3Temp`+`correctiveAction`). Hub today-count `countTodayEntries('haccpCookCool','monthYM')` doğru tabloyu okur; `countTodayEntries` cooling'in `monthYM`+`day` şemasını ayrı dalla eşleştirir (`f===month && r.day` → `Number(r.day)===bugün`) — cooling bugün-sayacı doğru çalışır.

**Cloud sync tablo pattern'leri.** • **Array-tablo** (`buffets`, `mise_plans`, `team`, `whiteboards`, `checklist_sessions`, `waste`, `shopping_lists`): soft-delete tombstone (`_deletedAt`), `queueArraySync` push, realtime. Yeni: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES. • **MAP-tablo** (`rosters`, `prepSheets`, `stock_count_history`, `haccp_*` — `{wsId:{recordId:obj}}`): `upsertInTable`/`deleteFromTable` (`updatedAt` otomatik), `cloud.js` HIGH_EDIT_WS_TABLES'te olmalı (per-record en-yeni-kazanır). Yeni MAP tablo 6 nokta: store.js · cloud-pertable.js · cloud-realtime.js · cloud.js · backup-to-r2 · migration (tablo + RLS + realtime publication + cascade trigger + REPLICA IDENTITY FULL).

**CSP yok.** `index.html`'de Content-Security-Policy meta yok. Eklenecekse minimal `script-src * 'unsafe-inline' 'unsafe-eval'` ile başla; her tightening'de hCaptcha + Discover foto yüklemesini test et.

**hCaptcha.** `account.js`'de `?onload=__pcdHcaptchaOnLoad&render=explicit` + `window.__pcdHcaptchaOnLoad` callback; bozulursa widget çizilir ama handler attach olmaz. Modal scroll lock `html/body{overflow:hidden}` ile — `position:fixed`/`transform`/`top:-scrollY` ile body koordinatını değiştirme (hCaptcha/3rd-party popup ofsetli yerleşir).

**Discover view count rate-limited.** `recipes.view_count` doğrudan artırılmaz → `rate-limited-view` Edge Function: header'dan IP, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC. `discover_view_logs` + saatlik cleanup cron.

**Photo storage flow + race.** Recipe foto → WebP @0.82 → Supabase Storage → public URL → `data.photo`. Upload async; save click anında `data.photo` eski olabilir → sync foto'suz gider. Foto görünmüyor raporunda: recipe'i aç → Save → 5sn → Discover Refresh.

**Sipariş "yolda" (on-order) yaşam döngüsü.** Sipariş gönderilince `suppliers.recordOrder` → `PCD.tools.inventory.markOrdered(ids)` envantere `lastOrderedAt` damgalar (hem Sipariş Oluştur hem Tedarikçiler ekranı). `isOnOrder(row)` = sipariş edildi + henüz teslim alınmadı (`lastReceivedAt < lastOrderedAt`) + hâlâ par-altı + 21 günden yeni → kalem kırmızı "sipariş et" sayacından + Generate Order AKTİF listesinden düşer (çift-sipariş önleme), altta soluk "Sipariş verildi" bölümünde "Tekrar sipariş" (`clearOrdered`) ile geri alınır. Teslim alınınca / par üstüne çıkınca / süre dolunca otomatik temizlenir (flag silinmez). **`recordOrder`'daki `markOrdered` kancasını + sipariş kalemlerindeki `id`'yi kaldırma** — yoksa gönderim envanteri "yolda" işaretleyemez. Generate Order'da gönderim modalı AÇIK kalır (`startOrder(name, items, onSent)` opsiyonel callback → grup "Gönderildi ✓"); Tedarikçiler ekranı çağrısında `onSent` yok, davranış değişmez. **Event "Shopping list" + Buffet "Order list" + Inventory "Shopping list" — 3'ü de aynı `startOrder` + `markOrdered`'a bağlı (v2.44.114, TUTARLI).** **Gruplama:** TÜM malzemeler (alt-tarif içindekiler dahil, `flattenIngredients`) tek seviyede toplanıp YALNIZ tedarikçiye göre gruplanır (`buildEventShopping`/`buildBuffetOrder` artık `direct`/`subs` AYIRMIYOR — alt-tarif malzemeleri öksüz kalmaz, hepsi sipariş edilebilir; aynı ingredient id+unit birleşir). **Render:** her grup açılır-kapanır `<details open>` + kalem sayısı çipi; gerçek tedarikçi grubuna "Send" / gönderince "✓ Ordered" rozeti + "Order again" (çift-sipariş önler). Tedarikçisiz/manuel grup (supplier:''/supplierKey:'') buton ALMAZ. **Persist:** Event `_supplierOrders` (`{supplierName:iso}`) `upsertInTable('events')`; Buffet `_supplierOrders` `writeBuffets` (kalıcı + cloud-sync). **Inventory shopping list** (event+buffet'ten türetilir, owning record yok) → rozet OTURUM-İÇİ (`orderedMap`) + `markOrdered` ile envantere yansır; gönder yalnız tedarikçi-gruplama modunda (varsayılan). Send sınıfları: `.shop-send` (event) · `.buf-send` (buffet) · `.inv-shop-send` (inventory). Yazdırma 3'ünde de düz/damgasız (forPrint dalı), korunur. **`recordOrder`'daki `markOrdered` kancasını + kalem `id`'lerini kaldırma; gruplamayı tekrar alt-tarife BÖLME** (öksüz kalır).

**Whiteboard.** Canvas önizleme + print AYNI `renderBlockContent(block)` + `blockBoxStyle(block)`'u kullanır (canvas gerçek A4/A3 px + `transform:scale`; print aynı px'i mm `@page`'de basar) — iki motoru AYIRMA, yoksa önizleme ≠ çıktı. Print body `display:flex;flex-direction:column` + `.wb-print-sheet{flex:1}` → footer tek sayfada. `.wb-canvas-viewport{min-width:0}` + workspace grid `minmax(0,1fr)` zorunlu (yoksa mobilde yatay taşar). `applyCanvasScale()` ilk yüklemede clientWidth=0 ise rAF self-retry (bounded 60); ResizeObserver sonraki resize için. app.js global error handler'da "ResizeObserver" filtresi var — kaldırma.

**clientWidth=0 ilk-paint yarışı — standart çözüm bounded rAF self-retry.** Scale-to-fit önizleme (sabit doğal genişlikte render → `transform:scale`) ilk mount'ta `clientWidth=0` dönerse ölçek uygulanmaz → çıktı taşar (hard-refresh + mobil). Çözüm: `if(!w){ if((_t||0)<60) requestAnimationFrame(()=>fn((_t||0)+1)); return; }`. Kullanan: whiteboard `applyCanvasScale`, menu_studio `sizeThumbs`, kitchen_cards `applyScale`, roster `fitRosterPv`. Yeni scale-to-fit önizlemede bu deseni kullan.

**Profil kaydı — flush.** `store.set('user', u)` 400ms debounce'lu; profil kaydından SONRA `PCD.store.flush()` (account.js save + preview handler), yoksa kaydet→kapat/yenile race'inde kaybolur. Auth `_setUser` aynı hesapta MERGE eder (role/country/workplace/bio her restore'da korunur) — overwrite'a çevirme.

**i18n.** • `t(key, vars)` — 2 parametre; `t(key, 'fallback', {params})` çalışmaz (3. arg yok sayılır). Eksik anahtar `bundles.en[key]`'e düşer (`L(key,fb)` helper de aynı). • **6 dil** (en/tr/es/fr/de/ar): en/tr master, es/fr/de/ar büyük ölçüde paritede — yeni anahtarı 6 dile birden ekle (eklenmeyen sessizce en'e düşer, kırılmaz). Yeni anahtar: ilgili `app/js/i18n/<lang>.js` SONUNA `window.PCD.i18n.register('<lang>', {…})` bloğu ekle (`register` `Object.assign` MERGE eder, i18n.js:72). Placeholder (`{n}`,`{name}`) + escape tırnak (`\"`) + emoji KORU; İngilizce çoğul işaretçilerini DÜŞÜR; ÖLÜ araç anahtarlarını (sales/yield/matrix/team/allergens/whatif/tools_hub/menus + `t_*`) ÇEVİRME. Doğrulama: preview `setLocale` eski bundle'ı cache'ler → `fetch('...?cb='+Date.now())` + `eval` + setLocale.

**Menü diyet/alerjen kodları (menu_studio.js).** Konvansiyon: küçük harf = diyet/uygunluk rozet (accent renkli; `DIET_CODES`=v/vg/gf/df/nf/h, etiket `menu_code_*`), BÜYÜK = "içerir" alerjen (parantezli; `ALLERGEN_CODE` key→kod, etiket `allerg_*`). Yalnız BİLGİ (filtre değil). **Alerjen efektif küme = `itemAllergenKeys(it)` = tariften otomatik (`itemAutoAllergenKeys`) ∪ şefin manuel `it.allergens[]`** (otomatikler editörde kilitli-açık, silinemez; manuel ekleme = tarifsiz kalem + çapraz-bulaşma). Diyet = `it.diet[]` (şef-girişli). **Okunur legend** (`legendHtml`) kod+açıklama basar (allergens-db sırası); inline kodlar (`itemAllergenCodes`) parantezli. `page.showAllergens` varsayılan KAPALI (otomatik, kalabalık yapmasın), `page.showDiet` varsayılan AÇIK (şef-girişli, işaretlenen görünsün) — `normalizeDesign`'da. Yeni diyet kodu = `DIET_CODES` + 6 dilde `menu_code_*`. **NOT:** eski `displayCodeIds`/`autoAllergenCodeIds`/`it.codes`/`MENU_CODES` API'si KODDA YOK (kaldırılmış) — yukarıdaki gerçek API'yi kullan.

**Roster çıktı motoru tek.** print / Excel / JPEG hepsi `buildRosterTable(data, showCost)` + `rosterMatrix(data)` üzerinden. `groupedStaff(data)` `.group` döndürür (`.name` değil); `rosterMatrix` `name: g.group` map'ler. Hücre: `{start, end, note}` (vardiya) veya `{status:'OFF'}` (0 saat). Excel yatay/tek sayfa: JSZip ile `sheet1.xml`'e `<sheetPr>` + `<pageSetup>` enjekte (`ws['!pageSetup']` SheetJS'te çalışmaz). JPEG: html2canvas lazy → `navigator.canShare({files})` varsa native share. **Çıktı tablosu HTML (`buildRosterTable`) + Excel (`excelRoster`) AYRI iki motor — yeni satır/sütun eklerken İKİSİNE de ekle (departman alt-toplamı + günlük toplam satırı ikisinde de var, biri eklenirse diğeri de).**

**Roster işçilik % KPI (Pro) + Events bağı.** `data.weekSales` (haftalık ciro) + `data.laborTargetPct` (hedef %, vars. 30) JSON blob'da — şema yok, cloud otomatik. İşçilik % = `rosterTotals().cost / weekSales`; renk durumu Buffet food-cost % deseni (good ≤ hedef / warn ≤ hedef+5 / bad). KPI satırı + çıktı footer'ı yalnız `canUseLaborCost()` (Pro) — free'de hiç render edilmez. Çıktı footer'ındaki işçilik % yalnız **showCost açıkken** (personel kopyası temiz). **`weekEventsRevenue(data)` = events.js `computeStats` GELİR kısmının AYNASI** (events modülü lazy; yüklü olmasa da çalışsın diye roster'da bağımsız — dashboard.js'in roster mantığını aynaladığı gibi): billed = tüm fonksiyonlarda max(garanti, beklenen) × `pricePerHead` + `charges[].price` + servis %; yalnız `confirmed`/`done` event'ler, o hafta aralığında. **events.js'te pph/charges/service mantığı değişirse roster'daki `eventRevenue`/`_evBilled` aynasını da güncelle.** Bilinçli: event staffing satırları Roster'a KOPYALANMAZ (granülerlik uyuşmaz → çöp satır); bağ yalnız ciro→%.

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
