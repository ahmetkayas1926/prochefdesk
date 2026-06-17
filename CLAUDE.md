# ProChefDesk — Claude Code Rehberi

## Proje

ProChefDesk — profesyonel şefler için web tabanlı mutfak yönetim sistemi. **Operatör:** Ahmet Kaya, Perth WA, aktif kullanıcı şef. Solo proje. **Production:** `prochefdesk.com`, uygulama `/app/` altında.

**Stack:** Vanilla JS (bundler/service worker yok), IndexedDB (offline-first ana storage), Supabase (Postgres 17 + Auth + Storage + Realtime + Edge Functions), Cloudflare Pages (GitHub push'ta auto-deploy), Cloudflare R2 (gece yedek).

Araç envanteri + mimari → **`HANDOVER.md`** · sürüm geçmişi → **`CHANGELOG.md`**. Launch işleri → aşağıdaki bölüm; büyüme roadmap'i operatörde — yeni özelliği spontan kurma, ne yapılacağını operatör söyler.

---

## Launch — yapılacaklar

Operatör'ün launch öncesi açık iş listesi (büyüme roadmap'i burada DEĞİL — o operatörde). Madde bitince işaretle/çıkar.

- [ ] Stripe canlı bağlantısı — **DURUM (2026-06-17): Stripe Atlas başvurusu YAPILDI + ÖDENDİ (~500$); `ProChefDesk, LLC` (Delaware) kuruluyor.** Akış: application review (aynı gün) → incorporation (1-2 iş günü) → EIN (3-5 hafta ≈ Temmuz 2026; SSN yok → ödemeyi BLOKLAMAZ). Yeni LLC Stripe hesabı var (şu an test mode); eski kişisel Gmail Stripe test hesabı AYRI → canlıya geçince silinecek. **Incorporation bitince OPERATÖR:** "Get a business account" (Mercury banka aç) + "Start accepting payments" (LLC Stripe'ı aktive) → Claude'a "kuruldu" der. **Sonra CLAUDE:** (a) legal docs'u LLC'ye güncelle (ayrı madde), (b) Stripe canlıya al — test→live key + webhook + ürünler (fiyat 19/190 → **AUD mı USD mi karar**) + 1 test ödemesi. Neden ABD LLC: TR doğrudan payout desteklemiyor. Vazgeçilirse alt: Lemon Squeezy MoR (~%5). Yıllık sabit: ~400-600$ (franchise + registered agent).
- [ ] **Vergi/uyumluluk hatırlatıcıları AÇIK kalsın** — operatör hiçbir şey kaçırmak/unutmak/atlamak istemiyor. Atlas'ta **"Set reminders for tax deadlines" AÇ**. Yıllık ZORUNLU: Delaware franchise tax ~$300 (~her 1 Haziran) + federal beyan **Form 5472 + 1120** (gelir sıfır olsa bile). **5472 kaçırma cezası $25.000** → ya bir uyumluluk/muhasebe servisine bağla (yıllık ~birkaç yüz $, otomatik dosyalar) ya da takvim hatırlatıcısı kur. Bu tarz kritik tarihlerde hatırlatıcı hep açık olsun.
- [ ] (Gelecek) Operatör AU kalıcı oturum (PR) alınca → doğrudan **AU Stripe**'a geç (ABN/sole trader + AU banka; ABD LLC GEREKMEZ) · abonelikleri yeni hesaba taşı (Stripe kart/müşteri migration + app key/webhook güncelle — kod tarafı Claude) · **ABD LLC'yi feshet** (dissolution + final ABD beyanı + Mercury kapat) → yıllık ABD yükü tamamen biter.
- [ ] Yasal içerik güncelleme — **ABD LLC kurulup Stripe canlı OLUNCA yapılacak (şimdi DEĞİL)**. Şu an `privacy.html` + `terms.html` "Perth, Batı Avustralya'da birey Ahmet Kaya tarafından işletiliyor" + governing law/jurisdiction = Batı Avustralya mahkemeleri + liability cap & fiyat **AUD** (A$19/A$190, 100 AUD) + "Australian Consumer Law" + Stripe = "Stripe Payments Australia Pty Ltd" diyor. Global uygulama + ABD LLC gerçeğine göre düzelt: işletici tüzel kişi → ABD LLC adı/adresi · governing law/jurisdiction → LLC eyaleti (Delaware/WY) · para birimi & tüketici-hukuku referansları · Stripe tüzel kişi referansı. **6 dilde senkron** (en/tr/es/fr/de/ar — her dilde aynı paragraflar var). Not: landing'deki gerçek "Perth WA şef" kurucu hikâyesi KALABİLİR — sorun yalnız tüzel-kişi/yetki ifadeleri.
- [ ] McAfee/Norton reputation submit
- [ ] **Pazarlama / satış / PR stratejisi** — operatör + Claude BİRLİKTE yürütür (agresif ama gerçekçi, net adımlı). Hedef: ürünü hedef kitleye (profesyonel şefler, mutfak/sous şefleri, küçük-orta işletme mutfakları) ulaştırmak + ilk bakışta dikkat çekip deneme→aboneliğe dönüştürmek. Kapsam: landing hook/mesaj nettliği · kanal seçimi (şef toplulukları, Reddit/FB grupları, IG/TikTok kısa video, LinkedIn, hospitality forumları) · SEO/blog (standart kuruldu, hacim artır) · soft-launch + erken kullanıcı toplama · demo/onboarding ilk-izlenim cilası. Strateji oturumu operatörle tasarlanır; Claude = öneri + uygulama (landing kopyası, blog/SEO, sayfa/asset). Büyüme yönünü operatör belirler.
- [ ] iOS/Safari gerçek cihaz testi — kod denetimi TAMAM (viewport-fit/safe-area · 100dvh fallback · input 16px no-zoom · WebP→JPEG fallback · IDB private-mode→LS fallback · overflow scroll-lock); gerçek cihazda kamera/share-sheet/PWA-install/hCaptcha testi kaldı
- [x] Blog 2 yazı: "Labour cost %" · "Cleaning schedule" — yazıldı (SEO standardına uygun: JSON-LD + gov authority link + related-posts + sitemap + index), push'landı
- [ ] Launch QA — beraber, doğrulama pass'leri. Kod/preview denetimi yapıldı: 18 rota mobil(375)+tablet(768) yatay taşma YOK · console hata 0 · network fail 0 · i18n simetrik (en=tr 3119, es/fr/de/ar 2816) tanımsız anahtar 0. **Bulgular ÇÖZÜLDÜ (2026-06-18):** Arapça RTL → `_applyLocale`'e gerçek `dir` attribute eklendi (i18n.js; native RTL: dir=rtl + body direction rtl + başlık sağa yaslı + 7 rotada taşma 0; LTR'de regresyon yok) · `book` ikonu → `book-open` (recipes bulk-to-menu; 18 rotada eksik ikon 0). Kalan: operatörle son manuel pass.
- [x] Çıktı tutarlılığı — TÜM çıktılar Deep Pine paletine standartlaştırıldı (print/PDF · Excel · roster JPEG · share): pine `#16433a` başlık + `#1f9d6b` aksan + `#1c1917` metin + `#eaf6f0` th + Inter/Fraunces; Excel pine `16433A` + `E0DDD5`/`F6F3EE`; `@page{margin:0}`+padding → tarayıcı damgası (tarih/about:blank/sayfa no) YOK. Roster mavi/generik + buffet/recipes Excel parlak yeşil → pine'a çekildi. Tasarım ürünleri (whiteboard, menu_studio menüleri) bilerek temalı. Push'landı; operatör manuel görsel pass yapacak.
- [x] Footer — Free=footer / Pro=temiz, HER çıktı yolunda (print/PDF · Excel · roster JPEG · share/URL) → tek `showWatermark()` gate'i; canlı doğrulandı (free=footer, pro=temiz)
- [x] Veri bütünlüğü — denetlendi: 23 ws-tablo + top-level 6 katmanda tam (push/pull/realtime/R2-yedek/manuel/restore); manuel yedek = tam state objesi; restore tam → veri kaybı boşluğu YOK

---

## Operatör + çalışma akışı

- Operatör Türkçe konuşur → Türkçe cevap ver. Yorgun/kızgınsa tek net talimat. "BUNU SEN SÖYLE" / "öneri ver" → doğrudan görüş ver, soruyla cevap verme.
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

**Root dosyalar app'ten bağımsız.** `/` (landing), `/privacy.html`, `/terms.html`, `/blog/` — kendi inline CSS'leri; app CSS değişikliği etkilemez (tersi de). Blog yazıları standalone HTML (Inter + Fraunces, cream paper, brand green CTA).

**Sub-recipe flattening.** `PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, opts)` (dashboard.js) tüm sub-recipe satırlarını gerçek ingredient seviyesine recursive düşürür (scale cascade + birim dönüşümü + cycle protection + separator skip); `{ingredient, ingredientId, amount, unit, viaSubRecipe}` döndürür. "Tarif → ingredient listesi" için bunu kullan. `variance.js` kendi recursion'unu kullanır.

**Lazy tool loading.** 16 araç dinamik script tag ile lazy. Eager: **dashboard** (home), **account** (auth), **inventory** (dashboard low-stock sync). Yeni araç: (a) `router.registerLazy(name, scriptPath, toolName)`, (b) dashboard click gerekiyorsa `_afterToolLoad(toolName, cb)` poll (120ms × 3sn).

**Kaldırılmış araçlar (v2.43 → v2.44.21).** v2.43'te 10 ölü dosya silindi; **8 hâlâ silik** (route yok, git geçmişinde): `menu_matrix, sales, whatif, yield, team` (TOOL), `allergens` (TOOL — `core/allergens-db.js` CANLI), `menus` (klasik; route'u menu_studio yükler), `tools-hub`. **3 yeniden inşa → CANLI:** `nutrition`, `variance` (UI; motor `core/variance.js` zaten canlıydı), `waste`. Bu 3 + `portion` + `prep` v2.44.30'da sidebar yerine sub-nav sekmelerinde (`PCD.subNav`) — route'lar app.js'te DURUYOR. **Hâlâ şema-only (UI YOK):** `shopping_lists`, `mise_plans`, `team`. Route tek kaynağı: `app/js/core/app.js`. Detay: HANDOVER.md.

**`PCD.on` delegasyonu kalıcı — GENEL `data-*` araçlar arası sızar.** `PCD.on(node, ev, sel, handler)` paylaşılan kalıcı `#view`'a delege eder, navigasyonda ASLA kaldırılmaz. İki araç aynı genel attribute'u (`data-open/del/dup/edit`) kullanırsa handler'lar çakışır + sızıntı kalıcı olur (v2.40: menu_studio `data-open`'ı roster'la çakıştı → "Menu not found"). **Kural:** araç-özel prefix (`data-ms-open`, `data-rost-open`…); genel `data-open/del/dup/edit` kullanma, eklemeden önce başka araç kullanıyor mu grep et.

**xlsx + i18n lazy.** `PCD.loadXLSX()` (utils.js) cached promise — xlsx-js-style (~500KB) ilk tıklamada CDN'den. `i18n.js` `setLocale()` async — boot'ta yalnız `en.js`; diğer diller dinamik fetch.

**Büfe maliyet (`computeItemCost` 3 path).** (a) `recipeId` → sub-recipe cost cascade; (b) `ingredientId` → `pricePerUnit × (1/yield)`; (c) `customName` → cost=0. **Recipe item (Path B):** maliyet = (tarif maliyeti ÷ servings) × kişi × `amountPerGuest` × refill — `amountPerGuest` = **porsiyon/kişi** (gram girilirse ~100× şişer, dönüşüm yok). Ingredient item (Path A) gramı doğru işler. Yeni hesaplamada 3 path'i de kapsa.

**HACCP Hub.** 4 form (`haccp_logs`, `haccp_cooling`, `haccp_receiving`, `haccp_holding`) tek `haccp` hub route altında; 4 form route'u korunmuş (bookmark + direct link çalışır).

**Cloud sync tablo pattern'leri.** • **Array-tablo** (`buffets`, `mise_plans`, `team`, `whiteboards`, `checklist_sessions`, `waste`, `shopping_lists`): soft-delete tombstone (`_deletedAt`), `queueArraySync` push, realtime. Yeni: store.js + cloud-pertable.js WORKSPACE_TABLES (isArray:true) + cloud-realtime.js applyChange + WS_BOUND_TABLES + TABLES + cascade trigger migration + backup-to-r2 BACKUP_TABLES. • **MAP-tablo** (`rosters`, `prepSheets`, `stock_count_history`, `haccp_*` — `{wsId:{recordId:obj}}`): `upsertInTable`/`deleteFromTable` (`updatedAt` otomatik), `cloud.js` HIGH_EDIT_WS_TABLES'te olmalı (per-record en-yeni-kazanır). Yeni MAP tablo 6 nokta: store.js · cloud-pertable.js · cloud-realtime.js · cloud.js · backup-to-r2 · migration (tablo + RLS + realtime publication + cascade trigger + REPLICA IDENTITY FULL).

**CSP yok.** `index.html`'de Content-Security-Policy meta yok. Eklenecekse minimal `script-src * 'unsafe-inline' 'unsafe-eval'` ile başla; her tightening'de hCaptcha + Discover foto yüklemesini test et.

**hCaptcha.** `account.js`'de `?onload=__pcdHcaptchaOnLoad&render=explicit` + `window.__pcdHcaptchaOnLoad` callback; bozulursa widget çizilir ama handler attach olmaz. Modal scroll lock `html/body{overflow:hidden}` ile — `position:fixed`/`transform`/`top:-scrollY` ile body koordinatını değiştirme (hCaptcha/3rd-party popup ofsetli yerleşir).

**Discover view count rate-limited.** `recipes.view_count` doğrudan artırılmaz → `rate-limited-view` Edge Function: header'dan IP, `pcd_rate_limited_view_bump(ip, recipe_id, 60min)` SECURITY DEFINER RPC. `discover_view_logs` + saatlik cleanup cron.

**Photo storage flow + race.** Recipe foto → WebP @0.82 → Supabase Storage → public URL → `data.photo`. Upload async; save click anında `data.photo` eski olabilir → sync foto'suz gider. Foto görünmüyor raporunda: recipe'i aç → Save → 5sn → Discover Refresh.

**Whiteboard.** Canvas önizleme + print AYNI `renderBlockContent(block)` + `blockBoxStyle(block)`'u kullanır (canvas gerçek A4/A3 px + `transform:scale`; print aynı px'i mm `@page`'de basar) — iki motoru AYIRMA, yoksa önizleme ≠ çıktı. Print body `display:flex;flex-direction:column` + `.wb-print-sheet{flex:1}` → footer tek sayfada. `.wb-canvas-viewport{min-width:0}` + workspace grid `minmax(0,1fr)` zorunlu (yoksa mobilde yatay taşar). `applyCanvasScale()` ilk yüklemede clientWidth=0 ise rAF self-retry (bounded 60); ResizeObserver sonraki resize için. app.js global error handler'da "ResizeObserver" filtresi var — kaldırma.

**clientWidth=0 ilk-paint yarışı — standart çözüm bounded rAF self-retry.** Scale-to-fit önizleme (sabit doğal genişlikte render → `transform:scale`) ilk mount'ta `clientWidth=0` dönerse ölçek uygulanmaz → çıktı taşar (hard-refresh + mobil). Çözüm: `if(!w){ if((_t||0)<60) requestAnimationFrame(()=>fn((_t||0)+1)); return; }`. Kullanan: whiteboard `applyCanvasScale`, menu_studio `sizeThumbs`, kitchen_cards `applyScale`, roster `fitRosterPv`. Yeni scale-to-fit önizlemede bu deseni kullan.

**Profil kaydı — flush.** `store.set('user', u)` 400ms debounce'lu; profil kaydından SONRA `PCD.store.flush()` (account.js save + preview handler), yoksa kaydet→kapat/yenile race'inde kaybolur. Auth `_setUser` aynı hesapta MERGE eder (role/country/workplace/bio her restore'da korunur) — overwrite'a çevirme.

**i18n.** • `t(key, vars)` — 2 parametre; `t(key, 'fallback', {params})` çalışmaz (3. arg yok sayılır). Eksik anahtar `bundles.en[key]`'e düşer. • **6 dil TAM** (en/tr/es/fr/de/ar): en+tr (2942) + es/fr/de/ar (2598, v2.43.17 — 0 eksik). Yeni anahtar: ilgili `app/js/i18n/<lang>.js` SONUNA `window.PCD.i18n.register('<lang>', {…})` bloğu ekle (`register` `Object.assign` MERGE eder, i18n.js:72). Placeholder (`{n}`,`{name}`) + escape tırnak (`\"`) + emoji KORU; İngilizce çoğul işaretçilerini DÜŞÜR; ÖLÜ araç anahtarlarını (sales/yield/matrix/team/allergens/whatif/tools_hub/menus + `t_*`) ÇEVİRME. Doğrulama: preview `setLocale` eski bundle'ı cache'ler → `fetch('...?cb='+Date.now())` + `eval` + setLocale.

**Menü diyet/alerjen harf kodları.** `MENU_CODES`: küçük harf = diyet/uygunluk (v/vg/gf/gfo/df/dfo/nf/h), BÜYÜK = "içerir" alerjen (N/G/D/E/F/SF/S/SE). Kodlar yalnız BİLGİ (filtre değil). Gösterim `displayCodeIds(it)` = manuel `it.codes` ∪ otomatik `autoAllergenCodeIds(it)`. Manuel kodlar recipe'yi değiştirmez. Yeni kod = MENU_CODES + 6 dilde `menu_code_*`.

**Roster çıktı motoru tek.** print / Excel / JPEG hepsi `buildRosterTable(data, showCost)` + `rosterMatrix(data)` üzerinden. `groupedStaff(data)` `.group` döndürür (`.name` değil); `rosterMatrix` `name: g.group` map'ler. Hücre: `{start, end, note}` (vardiya) veya `{status:'OFF'}` (0 saat). Excel yatay/tek sayfa: JSZip ile `sheet1.xml`'e `<sheetPr>` + `<pageSetup>` enjekte (`ws['!pageSetup']` SheetJS'te çalışmaz). JPEG: html2canvas lazy → `navigator.canShare({files})` varsa native share.

**Ortak styled-Excel = `PCD.xlsx`.** Yeni export'lar `PCD.loadXLSX().then(XLSX => PCD.xlsx.save(...))` (kalın yeşil başlık + çerçeve + alt-satır gölgesi + autofit + **Free'de otomatik gate'li footer satırı**). Roster kendi inline worksheet'ini kullanır (hücre rengi `PCD.xlsx`'te yok; footer'ı da kendi gate'leyerek ekler) — dokunma.

**Demo seed (demo-recipes.js) — 5 kural.** (1) Tek seferlik `onboarding.demoSeeded` flag; sürüm değişince yeniden yüklenmez (görmek için incognito). (2) Event menü alanı `menu` ('recipes' değil — `events.js` `event.menu` okur). (3) Inventory seed `findId(upserted, name)`. (4) Supplier `category` görünen ad (Produce / Meat & Poultry / Seafood / Dairy / Dry Goods…), i18n key değil. (5) Büfe ayrı kayıt yolu (`_read('buffets')` ws-keyed dizi, `upsertInTable` değil).

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
