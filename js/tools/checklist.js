/* ================================================================
   ProChefDesk — checklist.js (v1.11 - PROFESSIONAL REDESIGN)

   Based on industry research (FoodDocs, SafetyCulture, HACCP standards):
   Real kitchens use multiple checklist TYPES, not just text tasks.

   ITEM TYPES SUPPORTED:
   - task       : Plain checkbox task (default, was the only type before)
   - temperature: Numeric °C input + min/max range validation
   - numeric    : Numeric input (e.g., oil TPM, dishwasher temp, weight)
   - pass-fail  : Pass / Fail / N/A radio (HACCP inspections)
   - text       : Free-text input (e.g., supplier name, batch number)

   PER-ITEM EXTRAS:
   - Optional comment (every item, every session)
   - Optional photo evidence (cracked equipment, low stock, etc.)

   SESSION CAPABILITIES:
   - Print as professional PDF (signed-off audit document)
   - Share via WhatsApp / Email / Copy / native share
   - Sign-off (who completed it)

   DEFAULT TEMPLATES (research-driven):
   - Opening Prep (existing, refreshed)
   - Closing & Shutdown (existing, refreshed)
   - Weekly Deep Clean (existing)
   - Banquet Setup (existing)
   - NEW: Daily Temperature Log (HACCP)
   - NEW: Receiving Inspection
   - NEW: Walk-in Cooler Daily Check
   - NEW: HACCP Daily Inspection
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Workspace-scoped session storage: state.checklistSessions = { wsId: [sessions] }
  function readSessions() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const all = PCD.store._read('checklistSessions') || {};
    // Backward-compat: if it was a flat array (old data), treat as no-ws
    if (Array.isArray(all)) return all;
    return all[wsId] || [];
  }
  function writeSessions(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('checklistSessions') || {};
    // If legacy array, migrate it under current ws
    let next = Array.isArray(root) ? {} : Object.assign({}, root);
    next[wsId] = arr;
    PCD.store.set('checklistSessions', next);
  }

  // Categories + priorities (carry over from v1.5)
  const CATS = [
    { id: 'prep',     labelKey: 'chk_categories_prep',     color: '#f59e0b' },
    { id: 'cooking',  labelKey: 'chk_categories_cooking',  color: '#ef4444' },
    { id: 'service',  labelKey: 'chk_categories_service',  color: '#3b82f6' },
    { id: 'cleaning', labelKey: 'chk_categories_cleaning', color: '#8b5cf6' },
    { id: 'admin',    labelKey: 'chk_categories_admin',    color: '#64748b' },
  ];
  const PRIOS = [
    { id: 'high', labelKey: 'chk_prio_high', color: '#ef4444' },
    { id: 'med',  labelKey: 'chk_prio_med',  color: '#f59e0b' },
    { id: 'low',  labelKey: 'chk_prio_low',  color: '#94a3b8' },
  ];
  const ITEM_TYPES = [
    { id: 'task',        labelKey: 'chk_item_type_task',        desc: 'Simple checkbox' },
    { id: 'temperature', labelKey: 'chk_item_type_temperature', desc: '°C input + range' },
    { id: 'numeric',     labelKey: 'chk_item_type_numeric',     desc: 'Number input' },
    { id: 'pass-fail',   labelKey: 'chk_item_type_passfail',    desc: 'Inspection result' },
    { id: 'text',        labelKey: 'chk_item_type_text',        desc: 'Free-text input' },
  ];
  function catLabel(c) { return c ? PCD.i18n.t(c.labelKey) : ''; }
  function prioLabel(p) { return p ? PCD.i18n.t(p.labelKey) : ''; }

  // Default templates seeded for new accounts.
  // Built at call time so the chef's current language is used.
  // Mevcut hesaplarda zaten template'ler kayıtlı; bu yalnızca tablo boşken,
  // hiç template oluşmamış yeni kullanıcılar için seed olarak çalışır.
  function getDefaultTemplates() {
    const lang = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    if (lang === 'tr') {
      return [
        {
          name: 'Açılış Hazırlığı',
          icon: 'clock',
          items: [
            { text: 'Buzdolabı ve dondurucu sıcaklıklarını kontrol et (2–4°C / -18°C)', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Sabah teslimatlarını al ve kontrol et — ağırlık ve tarihleri doğrula', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Bugünkü rezervasyonları ve covers sayısını gözden geçir', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Mutfak ekibini brifle — özel menü, biten ürünler, alerjen uyarıları', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Tüm istasyonları kur — mise en place kontrolü', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Stok, sos ve baz hazırlıklarını yap', cat: 'cooking', prio: 'med', type: 'task' },
            { text: 'Servisi için protein porsiyonla', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Sebze garnitür ve yan ürünlerini hazırla', cat: 'prep', prio: 'med', type: 'task' },
            { text: 'Tüm hazırlık kaplarını etiketle ve tarih at', cat: 'prep', prio: 'med', type: 'task' },
            { text: 'Önceki vardiyadan kalan temizlik programlarını kontrol et', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Tüm çorba, sos ve özel yemeklerin tat kontrolünü yap', cat: 'cooking', prio: 'high', type: 'task' },
            { text: 'Sanitizer kovalarını doldur (200ppm)', cat: 'cleaning', prio: 'high', type: 'task' },
          ]
        },
        {
          name: 'Kapanış ve Servis Sonu',
          icon: 'check-square',
          items: [
            { text: 'Tüm sıcak yemekleri 90 dk içinde 8°C altına soğut', cat: 'cooking', prio: 'high', type: 'task' },
            { text: 'Tüm soğukta saklanacak artıkları etiketle, sar ve tarih at', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Son kullanma tarihi geçen her şeyi at', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Tüm pişirme yüzeylerini ve ekipmanı derin temizle', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Tüm hazırlık tahtalarını ve bıçakları temizle ve sanitize et', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Fritözleri ve ızgaraları yağdan arındır ve temizle', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Mutfak zeminini paspasla', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Çöp kovalarını boşalt ve poşetleri değiştir', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Sabah servisi için buzdolaplarını kontrol et ve doldur', cat: 'prep', prio: 'med', type: 'task' },
            { text: 'Günlük atık kaydını güncelle', cat: 'admin', prio: 'med', type: 'task' },
            { text: 'Sonraki vardiya için notlar yaz — eksiklikler, sorunlar', cat: 'admin', prio: 'med', type: 'task' },
            { text: 'Kapıyı kilitle ve alarmları kur', cat: 'admin', prio: 'high', type: 'task' },
          ]
        },
        {
          name: 'Günlük Sıcaklık Kaydı',
          icon: 'thermometer',
          items: [
            { text: 'Walk-in cooler', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
            { text: 'Walk-in dondurucu', cat: 'admin', prio: 'high', type: 'temperature', min: -22, max: -18, unit: '°C' },
            { text: 'Reach-in soğutucu 1', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
            { text: 'Reach-in soğutucu 2', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
            { text: 'Vitrin buzdolabı', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
            { text: 'Sıcak tutma (bain-marie)', cat: 'cooking', prio: 'high', type: 'temperature', min: 63, max: 90, unit: '°C' },
            { text: 'Bulaşık makinesi durulama', cat: 'cleaning', prio: 'med', type: 'temperature', min: 82, max: 95, unit: '°C' },
            { text: 'Denetçi imzası', cat: 'admin', prio: 'high', type: 'text' },
          ]
        },
        {
          name: 'Mal Kabul Kontrolü',
          icon: 'truck',
          items: [
            { text: 'Tedarikçi adı', cat: 'admin', prio: 'high', type: 'text' },
            { text: 'Fatura / irsaliye numarası', cat: 'admin', prio: 'high', type: 'text' },
            { text: 'Araç temiz ve iyi durumda', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Şoför temiz üniformada', cat: 'admin', prio: 'low', type: 'pass-fail' },
            { text: 'Soğuk ürünler sıcaklığı (≤5°C)', cat: 'admin', prio: 'high', type: 'temperature', min: 0, max: 5, unit: '°C' },
            { text: 'Donmuş ürünler sıcaklığı (≤-15°C)', cat: 'admin', prio: 'high', type: 'temperature', min: -25, max: -15, unit: '°C' },
            { text: 'Ambalaj sağlam (hasarsız, sızıntısız)', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Son kullanma / tavsiye edilen tüketim tarihleri uygun', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Miktarlar fatura ile eşleşiyor', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Kalite / görünüm uygun', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Mallar 30 dk içinde depolandı', cat: 'admin', prio: 'high', type: 'task' },
          ]
        },
        {
          name: 'Walk-in Cooler Günlük Kontrol',
          icon: 'snowflake',
          items: [
            { text: 'Hava sıcaklığı (hedef ≤4°C)', cat: 'admin', prio: 'high', type: 'temperature', min: 0, max: 4, unit: '°C' },
            { text: 'Kapı contaları sağlam (boşluk yok)', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Zemin temiz ve kuru', cat: 'cleaning', prio: 'high', type: 'pass-fail' },
            { text: 'Raflar düzenli (çiğ altta, RTE üstte)', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Tüm yiyecekler tarih etiketli', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'FIFO rotasyonu uygulandı', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Süresi geçmiş ürün yok', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Aydınlatma çalışıyor', cat: 'admin', prio: 'low', type: 'pass-fail' },
            { text: 'Birikmiş su / sızıntı yok', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Haşere izi (görülmedi)', cat: 'admin', prio: 'high', type: 'pass-fail' },
          ]
        },
        {
          name: 'HACCP Günlük Denetim',
          icon: 'check-square',
          items: [
            { text: 'Tüm personel temiz üniforma / önlük giyiyor', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'El yıkama istasyonları dolu (sabun, havlu, su)', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Renk kodlu kesme tahtaları doğru kullanılıyor', cat: 'prep', prio: 'high', type: 'pass-fail' },
            { text: 'Çiğ ve hazır yenebilir ürünler ayrılmış', cat: 'prep', prio: 'high', type: 'pass-fail' },
            { text: 'Pişirme sıcaklıkları doğrulandı (prob ile)', cat: 'cooking', prio: 'high', type: 'pass-fail' },
            { text: 'Sıcak yemek 63°C üzerinde tutuluyor', cat: 'cooking', prio: 'high', type: 'pass-fail' },
            { text: 'Soğuk yemek 5°C altında tutuluyor', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Sanitizer konsantrasyonu ≥200ppm', cat: 'cleaning', prio: 'high', type: 'numeric', min: 200, max: 400, unit: 'ppm' },
            { text: 'Alerjen prosedürlerine uyuldu (çapraz bulaşma yok)', cat: 'admin', prio: 'high', type: 'pass-fail' },
            { text: 'Personel hastalığı bildirilmedi', cat: 'admin', prio: 'high', type: 'pass-fail' },
          ]
        },
        {
          name: 'Haftalık Derin Temizlik',
          icon: 'recycle',
          items: [
            { text: 'Davlumbaz filtrelerini yağdan arındır — sıcak su solüsyonunda beklet', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Fırın içlerini temizle — rafları çıkart, yağı al', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Buharlı pişiriciler ve combi fırınlardan kireç temizle', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Walk-in soğutucuyu temizle — raflar, duvarlar, kapı contaları', cat: 'cleaning', prio: 'high', type: 'task' },
            { text: 'Sandık dondurucuların buzunu çöz ve temizle', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Tüm ekipmanın arkasını ve altını temizle', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Tüm saklama kapları ve kapakları sanitize et', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'Zemin tahliyelerini kontrol et ve temizle', cat: 'cleaning', prio: 'med', type: 'task' },
            { text: 'İlk yardım kitini kontrol et ve doldur', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Yangın söndürme sistemini test et', cat: 'admin', prio: 'high', type: 'task' },
          ]
        },
        {
          name: 'Banket / Etkinlik Hazırlığı',
          icon: 'calendar',
          items: [
            { text: 'F&B müdürü ile son misafir sayısını teyit et', cat: 'admin', prio: 'high', type: 'numeric', unit: 'misafir' },
            { text: 'Tüm misafirler için alerjen listesini doğrula — mutfağa ilet', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Tüm tarifleri etkinlik sayısına ölçeklendir ve yazdır', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Servis başlamadan 2 saat önce mise en place tamamla', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Mezeleri ve soğuk başlangıçları önceden porsiyonla', cat: 'prep', prio: 'high', type: 'task' },
            { text: 'Servis istasyonlarını kur — tabaklar, garnitürler, sos şişeleri', cat: 'service', prio: 'high', type: 'task' },
            { text: 'Tüm mutfak ekibini sıralama ve zamanlama hakkında brifle', cat: 'admin', prio: 'high', type: 'task' },
            { text: 'Sıcak tutma sıcaklıklarını teyit et', cat: 'cooking', prio: 'high', type: 'temperature', min: 63, max: 90, unit: '°C' },
            { text: 'Pass alanını kur — sıcak lambalar, expo istasyonu', cat: 'service', prio: 'med', type: 'task' },
            { text: 'Alerjen tabaklarını ayır — ayrı garnitür alanı', cat: 'service', prio: 'high', type: 'task' },
          ]
        },
      ];
    }
    // Default: English (also fallback for ES/FR/DE/AR)
    return DEFAULT_TEMPLATES_EN;
  }

  const DEFAULT_TEMPLATES_EN = [
    {
      name: 'Opening Prep',
      icon: 'clock',
      items: [
        { text: 'Check fridge & freezer temperatures (2–4°C / -18°C)', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Receive and check morning deliveries — verify weights & dates', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Review today\'s reservations and covers', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Brief kitchen team — specials, 86\'d items, allergen alerts', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Set up all stations — mise en place check', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Prepare stocks, sauces and bases', cat: 'cooking', prio: 'med', type: 'task' },
        { text: 'Portion proteins for service', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Prep vegetable garnishes and sides', cat: 'prep', prio: 'med', type: 'task' },
        { text: 'Label and date all prep containers', cat: 'prep', prio: 'med', type: 'task' },
        { text: 'Check cleaning schedules from previous shift', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Taste test all soups, sauces, specials', cat: 'cooking', prio: 'high', type: 'task' },
        { text: 'Fill sanitizer buckets (200ppm)', cat: 'cleaning', prio: 'high', type: 'task' },
      ]
    },
    {
      name: 'Closing & Shutdown',
      icon: 'check-square',
      items: [
        { text: 'Cool all hot food to below 8°C within 90 minutes', cat: 'cooking', prio: 'high', type: 'task' },
        { text: 'Label, wrap and date all refrigerated leftovers', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Discard anything past use-by date', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Deep clean all cooking surfaces and equipment', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Clean and sanitize all prep boards and knives', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Degrease and clean fryers / grills', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Mop kitchen floor', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Empty bins and replace liners', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Check and restock fridges for morning service', cat: 'prep', prio: 'med', type: 'task' },
        { text: 'Update daily waste log', cat: 'admin', prio: 'med', type: 'task' },
        { text: 'Write notes for next shift — any issues, shortages', cat: 'admin', prio: 'med', type: 'task' },
        { text: 'Lock up and set alarms', cat: 'admin', prio: 'high', type: 'task' },
      ]
    },
    {
      name: 'Daily Temperature Log',
      icon: 'thermometer',
      items: [
        { text: 'Walk-in cooler', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
        { text: 'Walk-in freezer', cat: 'admin', prio: 'high', type: 'temperature', min: -22, max: -18, unit: '°C' },
        { text: 'Reach-in cooler 1', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
        { text: 'Reach-in cooler 2', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
        { text: 'Display fridge', cat: 'admin', prio: 'high', type: 'temperature', min: 1, max: 4, unit: '°C' },
        { text: 'Hot holding (bain-marie)', cat: 'cooking', prio: 'high', type: 'temperature', min: 63, max: 90, unit: '°C' },
        { text: 'Dishwasher rinse', cat: 'cleaning', prio: 'med', type: 'temperature', min: 82, max: 95, unit: '°C' },
        { text: 'Inspector signature', cat: 'admin', prio: 'high', type: 'text' },
      ]
    },
    {
      name: 'Receiving Inspection',
      icon: 'truck',
      items: [
        { text: 'Supplier name', cat: 'admin', prio: 'high', type: 'text' },
        { text: 'Invoice / docket number', cat: 'admin', prio: 'high', type: 'text' },
        { text: 'Vehicle clean and in good condition', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Driver in clean uniform', cat: 'admin', prio: 'low', type: 'pass-fail' },
        { text: 'Chilled goods temperature (≤5°C)', cat: 'admin', prio: 'high', type: 'temperature', min: 0, max: 5, unit: '°C' },
        { text: 'Frozen goods temperature (≤-15°C)', cat: 'admin', prio: 'high', type: 'temperature', min: -25, max: -15, unit: '°C' },
        { text: 'Packaging intact (no damage, no leaks)', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Use-by / best-before dates acceptable', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Quantities match invoice', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Quality / appearance acceptable', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Goods stored within 30 minutes of receipt', cat: 'admin', prio: 'high', type: 'task' },
      ]
    },
    {
      name: 'Walk-in Cooler Daily Check',
      icon: 'snowflake',
      items: [
        { text: 'Air temperature (target ≤4°C)', cat: 'admin', prio: 'high', type: 'temperature', min: 0, max: 4, unit: '°C' },
        { text: 'Door seals intact (no gaps)', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Floor clean and dry', cat: 'cleaning', prio: 'high', type: 'pass-fail' },
        { text: 'Shelves organized (raw bottom, RTE top)', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'All food labeled with date', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'FIFO rotation followed', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'No expired items present', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Light bulb working', cat: 'admin', prio: 'low', type: 'pass-fail' },
        { text: 'No standing water / leaks', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Pest activity (none seen)', cat: 'admin', prio: 'high', type: 'pass-fail' },
      ]
    },
    {
      name: 'HACCP Daily Inspection',
      icon: 'check-square',
      items: [
        { text: 'All staff wearing clean uniforms / aprons', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Hand-wash stations stocked (soap, towels, water)', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Color-coded cutting boards used correctly', cat: 'prep', prio: 'high', type: 'pass-fail' },
        { text: 'Raw and ready-to-eat foods separated', cat: 'prep', prio: 'high', type: 'pass-fail' },
        { text: 'Cooking temperatures verified (probe used)', cat: 'cooking', prio: 'high', type: 'pass-fail' },
        { text: 'Hot food held above 63°C', cat: 'cooking', prio: 'high', type: 'pass-fail' },
        { text: 'Cold food held below 5°C', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'Sanitizer concentration ≥200ppm', cat: 'cleaning', prio: 'high', type: 'numeric', min: 200, max: 400, unit: 'ppm' },
        { text: 'Allergen procedures followed (no cross-contact)', cat: 'admin', prio: 'high', type: 'pass-fail' },
        { text: 'No staff illness reported', cat: 'admin', prio: 'high', type: 'pass-fail' },
      ]
    },
    {
      name: 'Weekly Deep Clean',
      icon: 'recycle',
      items: [
        { text: 'Degrease canopy filters — soak in hot water solution', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Clean inside ovens — remove racks, degrease', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Descale steamers and combi ovens', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Clean walk-in fridge — shelves, walls, door seals', cat: 'cleaning', prio: 'high', type: 'task' },
        { text: 'Defrost and clean chest freezers', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Clean behind and under all equipment', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Sanitize all storage containers and lids', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Check and clean floor drains', cat: 'cleaning', prio: 'med', type: 'task' },
        { text: 'Inspect and restock first aid kit', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Test fire suppression system', cat: 'admin', prio: 'high', type: 'task' },
      ]
    },
    {
      name: 'Banquet / Event Setup',
      icon: 'calendar',
      items: [
        { text: 'Confirm final guest count with F&B manager', cat: 'admin', prio: 'high', type: 'numeric', unit: 'guests' },
        { text: 'Verify allergen list for all guests — update kitchen', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Scale all recipes to event count and print', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Complete all mise en place 2 hours before service', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Pre-portion appetizers and cold starters', cat: 'prep', prio: 'high', type: 'task' },
        { text: 'Set up service stations — plates, garnishes, sauce bottles', cat: 'service', prio: 'high', type: 'task' },
        { text: 'Brief all kitchen staff on sequence and timing', cat: 'admin', prio: 'high', type: 'task' },
        { text: 'Confirm hot holding temperatures', cat: 'cooking', prio: 'high', type: 'temperature', min: 63, max: 90, unit: '°C' },
        { text: 'Set up pass — hot lamps, expo station', cat: 'service', prio: 'med', type: 'task' },
        { text: 'Designate allergen plates — separate garnishing area', cat: 'service', prio: 'high', type: 'task' },
      ]
    },
  ];

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const templates = listTemplates();
    const activeSessions = listActiveSessions();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('checklist_title') || 'Shift Checklists'}</div>
          <div class="page-subtitle">${t('checklist_subtitle') || 'Standardize opening, prep, closing, and HACCP routines'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" id="newTplBtn">${PCD.icon('plus',16)} ${t('checklist_new_template') || 'Template'}</button>
        </div>
      </div>

      ${activeSessions.length > 0 ? `
        <div class="section mb-4">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('checklist_in_progress') || 'In Progress'}</div>
          <div id="activeSessionsList" class="flex flex-col gap-2"></div>
        </div>
      ` : ''}

      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('checklist_templates') || 'Templates'}</div>
        <div id="templatesList" class="flex flex-col gap-2"></div>
      </div>
    `;

    // Active sessions
    const asEl = PCD.$('#activeSessionsList', view);
    if (asEl) {
      activeSessions.forEach(function (s) {
        const tpl = templates.find(function (t) { return t.id === s.templateId; });
        const total = (s.items || []).length;
        const done = (s.items || []).filter(function (it) { return it.done; }).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const row = PCD.el('div', { class: 'card card-hover', 'data-sid': s.id, style: { padding: '12px' } });
        row.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">${PCD.icon('clock',20)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:15px;">${PCD.escapeHtml((tpl && tpl.name) || 'Session')}</div>
              <div class="text-muted text-sm">${done}/${total} · ${PCD.fmtRelTime(s.startedAt)}</div>
              <div class="progress mt-1" style="height:4px;">
                <div class="progress-bar" style="width:${pct}%;background:var(--brand-600);"></div>
              </div>
            </div>
            <div style="font-weight:700;color:var(--brand-700);">${pct}%</div>
          </div>
        `;
        asEl.appendChild(row);
      });
    }

    // Templates
    const tplEl = PCD.$('#templatesList', view);
    templates.forEach(function (tpl, idx) {
      const isFirst = idx === 0;
      const isLast = idx === templates.length - 1;
      const row = PCD.el('div', { class: 'card card-hover', 'data-tid': tpl.id, style: { padding: '12px' } });
      const itemTypes = [...new Set((tpl.items || []).map(function (i) { return i.type || 'task'; }))];
      const typeBadges = itemTypes.length > 1 || (itemTypes[0] && itemTypes[0] !== 'task')
        ? itemTypes.filter(function (t) { return t !== 'task'; }).map(function (t) {
            return '<span style="font-size:9px;padding:2px 6px;border-radius:999px;background:var(--brand-50);color:var(--brand-700);font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-inline-start:4px;">' + t + '</span>';
          }).join('')
        : '';
      // v2.5.12: up/down arrows for chef-controlled ordering, 3-dot menu
      // for edit / copy-to-workspace / delete (replaces the inline edit btn).
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">${PCD.icon(tpl.icon || 'check-square',20)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;">${PCD.escapeHtml(tpl.name)}${typeBadges}</div>
            <div class="text-muted text-sm">${(tpl.items || []).length} items</div>
          </div>
          <div class="flex flex-col" style="gap:2px;">
            <button type="button" class="icon-btn" data-move-up="${tpl.id}" ${isFirst ? 'disabled' : ''} title="${t('move_up') || 'Move up'}" style="padding:4px;height:24px;width:28px;${isFirst ? 'opacity:0.3;cursor:not-allowed;' : ''}">${PCD.icon('chevron-up', 14)}</button>
            <button type="button" class="icon-btn" data-move-down="${tpl.id}" ${isLast ? 'disabled' : ''} title="${t('move_down') || 'Move down'}" style="padding:4px;height:24px;width:28px;${isLast ? 'opacity:0.3;cursor:not-allowed;' : ''}">${PCD.icon('chevron-down', 14)}</button>
          </div>
          <button type="button" class="icon-btn" data-tpl-menu="${tpl.id}" title="${t('more_actions') || 'More actions'}">${PCD.icon('more-vertical', 18)}</button>
          <button type="button" class="btn btn-primary btn-sm" data-startrun="${tpl.id}">${t('checklist_start') || 'Start'}</button>
        </div>
      `;
      tplEl.appendChild(row);
    });

    // Up/down — reorder by swapping sortIndex.
    PCD.on(view, 'click', '[data-move-up]', function (e) {
      e.stopPropagation();
      const tid = this.getAttribute('data-move-up');
      moveTemplate(tid, -1);
      render(view);
    });
    PCD.on(view, 'click', '[data-move-down]', function (e) {
      e.stopPropagation();
      const tid = this.getAttribute('data-move-down');
      moveTemplate(tid, +1);
      render(view);
    });

    // 3-dot menu — Edit / Copy to workspace / Delete.
    PCD.on(view, 'click', '[data-tpl-menu]', function (e) {
      e.stopPropagation();
      const tid = this.getAttribute('data-tpl-menu');
      const tpl = PCD.store.getFromTable('checklistTemplates', tid);
      if (!tpl) return;
      PCD.actionSheet({
        title: tpl.name,
        actions: [
          { icon: 'edit', label: t('act_edit') || 'Edit', onClick: function () { openTemplateEditor(tid); } },
          { icon: 'copy', label: t('act_duplicate') || 'Duplicate', onClick: function () {
            const copy = PCD.clone(tpl);
            delete copy.id; delete copy.createdAt; delete copy.updatedAt;
            copy.name = copy.name + ' (Copy)';
            copy.isDefault = false;
            // New copies go to the end of the list.
            copy.sortIndex = templates.length;
            PCD.store.upsertInTable('checklistTemplates', copy, 'tpl');
            PCD.toast.success(t('act_duplicate') + ' ✓');
            render(view);
          }},
          { icon: 'truck', label: t('act_copy_workspace') || 'Copy to workspace...', onClick: function () {
            PCD.openCopyToWorkspace('checklistTemplates', tid, tpl.name);
          }},
          { icon: 'trash', label: t('act_delete') || 'Delete', danger: true, onClick: function () {
            PCD.modal.confirm({
              icon: '🗑', iconKind: 'danger', danger: true,
              title: t('checklist_delete_confirm_title') || 'Delete this template?',
              text: t('checklist_delete_confirm_msg') || 'This will permanently remove the template. Any in-progress sessions will keep working.',
              okText: t('act_delete') || 'Delete',
            }).then(function (ok) {
              if (!ok) return;
              PCD.store.deleteFromTable('checklistTemplates', tid);
              PCD.toast.success(t('checklist_deleted') || 'Template deleted');
              render(view);
            });
          }},
        ]
      });
    });

    PCD.$('#newTplBtn', view).addEventListener('click', function () { openTemplateEditor(); });
    // Click on the card body (not on inner buttons) → preview
    PCD.on(view, 'click', '[data-tid]', function (e) {
      if (e.target.closest('[data-startrun]')) return;
      if (e.target.closest('[data-edit-tid]')) return;
      if (e.target.closest('[data-move-up]')) return;
      if (e.target.closest('[data-move-down]')) return;
      if (e.target.closest('[data-tpl-menu]')) return;
      openTemplatePreview(this.getAttribute('data-tid'));
    });
    // Edit button: stopPropagation in handler (not inline)
    PCD.on(view, 'click', '[data-edit-tid]', function (e) {
      e.stopPropagation();
      e.preventDefault();
      openTemplateEditor(this.getAttribute('data-edit-tid'));
    });
    // Start button: stopPropagation in handler (not inline)
    PCD.on(view, 'click', '[data-startrun]', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const tid = this.getAttribute('data-startrun');
      startSession(tid);
    });
    PCD.on(view, 'click', '[data-sid]', function () {
      openSession(this.getAttribute('data-sid'));
    });
  }

  // ============ DATA HELPERS ============
  function listTemplates() {
    let tpls = PCD.store.listTable('checklistTemplates');
    if (tpls.length === 0) {
      getDefaultTemplates().forEach(function (def, idx) {
        PCD.store.upsertInTable('checklistTemplates', {
          name: def.name,
          icon: def.icon,
          sortIndex: idx,
          items: def.items.map(function (it) {
            const item = { id: PCD.uid('it'), text: it.text, cat: it.cat || 'prep', prio: it.prio || 'med', type: it.type || 'task' };
            if (it.min !== undefined) item.min = it.min;
            if (it.max !== undefined) item.max = it.max;
            if (it.unit) item.unit = it.unit;
            return item;
          }),
          isDefault: true,
        }, 'tpl');
      });
      tpls = PCD.store.listTable('checklistTemplates');
    }
    // Sort by sortIndex (chef-controlled order). Templates without
    // a sortIndex go to the end, in createdAt order. This handles
    // existing data from before v2.5.12 gracefully.
    return tpls.slice().sort(function (a, b) {
      const ai = (typeof a.sortIndex === 'number') ? a.sortIndex : 999999;
      const bi = (typeof b.sortIndex === 'number') ? b.sortIndex : 999999;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  // Move a template up or down in the user's preferred order.
  // direction: -1 (up) or +1 (down). No-op at the boundaries.
  function moveTemplate(tid, direction) {
    const ordered = listTemplates();
    const i = ordered.findIndex(function (t) { return t.id === tid; });
    if (i < 0) return;
    const j = i + direction;
    if (j < 0 || j >= ordered.length) return;
    // Swap sortIndex values, but normalise the whole list first so
    // every template has a stable integer index. This is cheap and
    // makes future moves simple.
    ordered.forEach(function (t, idx) { t.sortIndex = idx; });
    const tmp = ordered[i].sortIndex;
    ordered[i].sortIndex = ordered[j].sortIndex;
    ordered[j].sortIndex = tmp;
    // Persist both rows.
    PCD.store.upsertInTable('checklistTemplates', ordered[i], 'tpl');
    PCD.store.upsertInTable('checklistTemplates', ordered[j], 'tpl');
    // Also persist any other rows whose sortIndex we just normalised
    // for the first time.
    ordered.forEach(function (t, idx) {
      if (idx !== i && idx !== j) PCD.store.upsertInTable('checklistTemplates', t, 'tpl');
    });
  }

  function listActiveSessions() {
    const all = readSessions();
    return all.filter(function (s) { return !s.completedAt; }).slice().sort(function (a, b) {
      return (b.startedAt || '').localeCompare(a.startedAt || '');
    });
  }

  // List completed sessions for a given template, newest first.
  // If templateId is omitted, returns ALL completed sessions in the workspace.
  function listCompletedSessions(templateId) {
    const all = readSessions();
    return all.filter(function (s) {
      if (!s.completedAt) return false;
      if (templateId && s.templateId !== templateId) return false;
      return true;
    }).slice().sort(function (a, b) {
      return (b.completedAt || '').localeCompare(a.completedAt || '');
    });
  }

  function deleteSessionById(sid) {
    const all = readSessions();
    const next = all.filter(function (s) { return s.id !== sid; });
    writeSessions(next);
  }

  // ============ TEMPLATE PREVIEW ============
  // Click on a template → preview (not editor). Buttons: Start / Print / Edit / Share / Duplicate.
  function openTemplatePreview(tid) {
    const t = PCD.i18n.t;
    const tpl = PCD.store.getFromTable('checklistTemplates', tid);
    if (!tpl) return;

    const items = tpl.items || [];

    // Group items by category for preview
    const groups = {};
    items.forEach(function (it) {
      const c = CATS.find(function (x) { return x.id === it.cat; }) || CATS[0];
      const key = c.id;
      if (!groups[key]) groups[key] = { cat: c, items: [] };
      groups[key].items.push(it);
    });

    let groupedHtml = '';
    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      groupedHtml += '<div style="margin-bottom:18px;">';
      groupedHtml += '<div style="font-size:11px;font-weight:700;color:' + g.cat.color + ';text-transform:uppercase;letter-spacing:0.06em;padding:4px 0;border-bottom:1.5px solid ' + g.cat.color + '33;margin-bottom:8px;">' + catLabel(g.cat) + ' · ' + g.items.length + ' items</div>';
      g.items.forEach(function (it, idx) {
        const prio = PRIOS.find(function (p) { return p.id === it.prio; });
        const prioDot = prio ? '<span style="width:7px;height:7px;border-radius:50%;background:' + prio.color + ';flex-shrink:0;display:inline-block;"></span>' : '';
        let typeBadge = '';
        if (it.type === 'temperature') typeBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:999px;background:#dbeafe;color:#1e40af;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">TEMP ' + (it.min !== undefined ? it.min : '?') + '–' + (it.max !== undefined ? it.max : '?') + (it.unit || '') + '</span>';
        else if (it.type === 'numeric') typeBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">NUMBER ' + (it.unit || '') + '</span>';
        else if (it.type === 'pass-fail') typeBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">PASS/FAIL</span>';
        else if (it.type === 'text') typeBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">TEXT</span>';
        groupedHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--surface);">' +
          '<div style="width:18px;height:18px;border:2px solid var(--border-strong);border-radius:3px;flex-shrink:0;"></div>' +
          prioDot +
          '<div style="flex:1;min-width:0;font-size:14px;font-weight:500;">' + PCD.escapeHtml(it.text || '') + '</div>' +
          typeBadge +
        '</div>';
      });
      groupedHtml += '</div>';
    });

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="margin-bottom:16px;padding:14px 16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border-radius:var(--r-md);">' +
        '<div style="font-size:11px;font-weight:700;color:var(--brand-700);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Template preview</div>' +
        '<div style="font-weight:800;font-size:20px;letter-spacing:-0.01em;">' + PCD.escapeHtml(tpl.name) + '</div>' +
        '<div class="text-muted text-sm mt-1">' + items.length + ' items across ' + Object.keys(groups).length + ' categor' + (Object.keys(groups).length === 1 ? 'y' : 'ies') + '</div>' +
      '</div>' +
      groupedHtml;

    const startBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    startBtn.innerHTML = PCD.icon('clock', 16) + ' <span>Start session</span>';
    const editBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Edit template' });
    editBtn.innerHTML = PCD.icon('edit', 16);
    const dupBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Duplicate' });
    dupBtn.innerHTML = PCD.icon('copy', 16);
    const printBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Print blank checklist' });
    printBtn.innerHTML = PCD.icon('print', 16);
    const shareBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    // History button — shows past completed sessions for this template.
    const completedCount = listCompletedSessions(tid).length;
    const historyBtn = PCD.el('button', {
      class: 'btn btn-outline',
      title: t('checklist_history') || 'History',
    });
    historyBtn.innerHTML = PCD.icon('clock', 16) +
      (completedCount > 0
        ? ' <span style="font-weight:700;font-size:11px;background:var(--brand-600);color:#fff;padding:1px 6px;border-radius:999px;margin-inline-start:4px;">' + completedCount + '</span>'
        : '');
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(historyBtn);
    footer.appendChild(printBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(dupBtn);
    footer.appendChild(editBtn);
    footer.appendChild(startBtn);

    const m = PCD.modal.open({ title: tpl.name, body: body, footer: footer, size: 'md', closable: true });

    closeBtn.addEventListener('click', function () { m.close(); });
    startBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { startSession(tid); }, 200);
    });
    editBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { openTemplateEditor(tid); }, 200);
    });
    historyBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { openSessionHistory(tid); }, 200);
    });
    dupBtn.addEventListener('click', function () {
      const copy = PCD.clone(tpl);
      delete copy.id; delete copy.createdAt; delete copy.updatedAt;
      copy.name = copy.name + ' (Copy)';
      copy.isDefault = false;
      copy.items = (copy.items || []).map(function (it) { return Object.assign({}, it, { id: PCD.uid('it') }); });
      const saved = PCD.store.upsertInTable('checklistTemplates', copy, 'tpl');
      PCD.toast.success(PCD.i18n.t('toast_template_duplicated'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'checklist') render(v);
        setTimeout(function () { openTemplateEditor(saved.id); }, 200);
      }, 150);
    });
    printBtn.addEventListener('click', function () {
      printBlankTemplate(tpl);
    });
    shareBtn.addEventListener('click', function () {
      shareBlankTemplate(tpl);
    });
  }

  function printBlankTemplate(tpl) {
    const items = tpl.items || [];
    let rowsHtml = '';
    items.forEach(function (it, idx) {
      const cat = CATS.find(function (c) { return c.id === it.cat; });
      const type = it.type || 'task';

      let valueCol;
      if (type === 'task') valueCol = '<span style="display:inline-block;width:18px;height:18px;border:2px solid #999;border-radius:3px;"></span>';
      else if (type === 'temperature' || type === 'numeric') valueCol = '<span style="display:inline-block;border-bottom:1px solid #999;min-width:80px;height:18px;"></span> ' + (it.unit || '') +
        ((it.min !== undefined || it.max !== undefined) ? '<div style="font-size:8pt;color:#999;margin-top:2px;">Target ' + (it.min !== undefined ? it.min : '?') + '–' + (it.max !== undefined ? it.max : '?') + '</div>' : '');
      else if (type === 'pass-fail') valueCol = '<span style="font-size:9pt;">PASS &nbsp;<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #999;border-radius:3px;vertical-align:middle;"></span> &nbsp;FAIL &nbsp;<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #999;border-radius:3px;vertical-align:middle;"></span> &nbsp;N/A &nbsp;<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #999;border-radius:3px;vertical-align:middle;"></span></span>';
      else valueCol = '<span style="display:inline-block;border-bottom:1px solid #999;min-width:200px;height:18px;"></span>';

      rowsHtml +=
        '<tr>' +
          '<td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;width:30px;font-weight:700;color:#999;font-size:9pt;">' + (idx + 1) + '</td>' +
          '<td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;">' +
            '<div style="font-weight:600;font-size:11pt;">' + PCD.escapeHtml(it.text) + '</div>' +
            (cat ? '<div style="font-size:8pt;color:' + cat.color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">' + catLabel(cat) + '</div>' : '') +
          '</td>' +
          '<td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:center;width:200px;">' + valueCol + '</td>' +
          '<td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;width:80px;font-size:9pt;color:#999;text-align:center;">__:__</td>' +
        '</tr>';
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 15mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
        '.h-row { border-bottom: 3px solid #16a34a; padding-bottom: 10px; margin-bottom: 16px; }' +
        '.h-row h1 { margin: 0; font-size: 22pt; color: #16a34a; }' +
        '.h-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 12px 0 18px; padding: 12px; background: #f8f8f8; border-radius: 6px; }' +
        '.h-meta-item .lbl { color: #888; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; font-size: 8pt; }' +
        '.h-meta-item .val { font-size: 11pt; font-weight: 600; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'thead th { background: #f1f1f1; padding: 8px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }' +
        '.h-signoff { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; font-size: 10pt; }' +
        '.h-signoff .sig-line { border-bottom: 1px solid #888; padding-bottom: 30px; margin-bottom: 4px; }' +
        '.h-signoff .sig-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }' +
      '</style>' +
      '<div class="h-row">' +
        '<h1>' + PCD.escapeHtml(tpl.name) + '</h1>' +
        '<div style="color:#666;font-size:11pt;margin-top:4px;">Blank checklist · ' + items.length + ' items</div>' +
      '</div>' +
      '<div class="h-meta">' +
        '<div class="h-meta-item"><div class="lbl">Date</div><div class="val">__/__/____</div></div>' +
        '<div class="h-meta-item"><div class="lbl">Shift / Time</div><div class="val">______</div></div>' +
        '<div class="h-meta-item"><div class="lbl">Performed by</div><div class="val">______</div></div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th style="width:30px;">#</th><th>Item</th><th style="text-align:center;width:200px;">Result / Value</th><th style="width:80px;text-align:center;">Time</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="h-signoff">' +
        '<div><div class="sig-line">&nbsp;</div><div class="sig-label">Performed by</div></div>' +
        '<div><div class="sig-line">&nbsp;</div><div class="sig-label">Verified by (signature & date)</div></div>' +
      '</div>';

    PCD.print(html, tpl.name + ' — blank');
  }

  function shareBlankTemplate(tpl) {
    const items = tpl.items || [];
    const lines = [tpl.name + ' — checklist template', items.length + ' items', ''];
    items.forEach(function (it) {
      const cat = CATS.find(function (c) { return c.id === it.cat; });
      const catTag = cat ? '[' + catLabel(cat).toUpperCase() + '] ' : '';
      let typeTag = '';
      if (it.type === 'temperature') typeTag = ' (temp ' + (it.min !== undefined ? it.min : '?') + '–' + (it.max !== undefined ? it.max : '?') + (it.unit || '') + ')';
      else if (it.type === 'numeric') typeTag = ' (' + (it.unit || 'value') + ')';
      else if (it.type === 'pass-fail') typeTag = ' (pass/fail)';
      else if (it.type === 'text') typeTag = ' (text)';
      lines.push('☐ ' + catTag + it.text + typeTag);
    });
    const text = lines.join('\n');

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="padding:14px;background:var(--brand-50);border-radius:var(--r-md);margin-bottom:14px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:6px;">📄 Recommended: PDF</div>' +
        '<div class="text-muted text-sm" style="margin-bottom:10px;">Print as a fillable PDF form, then share the file via WhatsApp / Email / Drive from your device.</div>' +
        '<button class="btn btn-primary" id="tplShPdf" style="width:100%;">' + PCD.icon('print', 16) + ' <span>Save as PDF</span></button>' +
      '</div>' +
      '<div style="font-weight:600;font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Or share as plain text</div>' +
      '<div class="field"><label class="field-label">Message preview</label>' +
      '<textarea class="textarea" id="tplShareText" rows="8" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:10px;">' +
        '<button class="btn btn-outline btn-sm" id="tplShWa" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:#25D366;">' + PCD.icon('message-circle', 18) + '</div><div style="font-weight:600;font-size:11px;">WhatsApp</div></button>' +
        '<button class="btn btn-outline btn-sm" id="tplShEmail" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:#EA4335;">' + PCD.icon('mail', 18) + '</div><div style="font-weight:600;font-size:11px;">Email</div></button>' +
        '<button class="btn btn-outline btn-sm" id="tplShCopy" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:var(--brand-600);">' + PCD.icon('copy', 18) + '</div><div style="font-weight:600;font-size:11px;">Copy</div></button>' +
        '<button class="btn btn-outline btn-sm" id="tplShMore" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:var(--text-2);">' + PCD.icon('share', 18) + '</div><div style="font-weight:600;font-size:11px;">More...</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close' });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: 'Share template', body: body, footer: footer, size: 'md', closable: true });

    PCD.$('#tplShPdf', body).addEventListener('click', function () {
      m.close();
      setTimeout(function () { printBlankTemplate(tpl); }, 250);
    });

    function getText() { return PCD.$('#tplShareText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#tplShWa', body).addEventListener('click', function () { window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank'); m.close(); });
    PCD.$('#tplShEmail', body).addEventListener('click', function () { window.location.href = 'mailto:?subject=' + encodeURIComponent(tpl.name) + '&body=' + encodeURIComponent(getText()); m.close(); });
    PCD.$('#tplShCopy', body).addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); }); });
    PCD.$('#tplShMore', body).addEventListener('click', function () {
      if (navigator.share) navigator.share({ title: tpl.name, text: getText() }).then(function () { m.close(); }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
    });
  }

  function startSession(templateId) {
    const tpl = PCD.store.getFromTable('checklistTemplates', templateId);
    if (!tpl) return;
    const session = {
      id: PCD.uid('s'),
      templateId: templateId,
      templateName: tpl.name,
      startedAt: new Date().toISOString(),
      completedAt: null,
      completedBy: null,
      items: (tpl.items || []).map(function (it) {
        return {
          id: it.id,
          text: it.text,
          cat: it.cat,
          prio: it.prio,
          type: it.type || 'task',
          min: it.min,
          max: it.max,
          unit: it.unit,
          // Session-recorded values
          done: false,
          doneAt: null,
          value: null,        // numeric / temperature / text
          result: null,       // pass-fail: 'pass' | 'fail' | 'na'
          comment: '',
          photo: null,
        };
      }),
    };
    const all = readSessions();
    all.push(session);
    writeSessions(all);
    openSession(session.id);
  }

  function getSession(sid) {
    const all = readSessions();
    return all.find(function (s) { return s.id === sid; });
  }

  function updateSession(sid, mutator) {
    const all = readSessions();
    const idx = all.findIndex(function (s) { return s.id === sid; });
    if (idx < 0) return;
    mutator(all[idx]);
    writeSessions(all);
  }

  // Compute "done" flag based on item type
  function isItemComplete(it) {
    const type = it.type || 'task';
    if (type === 'task') return !!it.done;
    if (type === 'temperature' || type === 'numeric') return it.value !== null && it.value !== '' && !isNaN(parseFloat(it.value));
    if (type === 'pass-fail') return it.result === 'pass' || it.result === 'fail' || it.result === 'na';
    if (type === 'text') return it.value && String(it.value).trim().length > 0;
    return !!it.done;
  }

  // Whether a temperature/numeric value is out of range
  function isValueOutOfRange(it) {
    if ((it.type !== 'temperature' && it.type !== 'numeric') || it.value === null || it.value === '') return false;
    const v = parseFloat(it.value);
    if (isNaN(v)) return false;
    if (it.min !== undefined && v < it.min) return true;
    if (it.max !== undefined && v > it.max) return true;
    return false;
  }

  // ============ SESSION VIEW ============
  function openSession(sid) {
    const t = PCD.i18n.t;
    const session = getSession(sid);
    if (!session) return;
    const tpl = PCD.store.getFromTable('checklistTemplates', session.templateId);

    const body = PCD.el('div');

    function renderBody() {
      const s = getSession(sid);
      if (!s) return;
      const total = s.items.length;
      const done = s.items.filter(isItemComplete).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const outOfRange = s.items.filter(isValueOutOfRange).length;
      const failed = s.items.filter(function (i) { return i.result === 'fail'; }).length;

      body.innerHTML =
        '<div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<div style="font-weight:700;">' + PCD.i18n.t('chk_complete_count', { done: done, total: total }) + '</div>' +
            '<div style="font-weight:700;color:var(--brand-700);font-size:18px;">' + pct + '%</div>' +
          '</div>' +
          '<div class="progress" style="height:6px;">' +
            '<div class="progress-bar" style="width:' + pct + '%;background:var(--brand-600);transition:width 0.3s;"></div>' +
          '</div>' +
          (outOfRange > 0 || failed > 0 ?
            '<div class="text-sm mt-2" style="color:var(--danger);font-weight:600;">⚠️ ' +
              (outOfRange > 0 ? outOfRange + ' value' + (outOfRange === 1 ? '' : 's') + ' out of range' : '') +
              (outOfRange > 0 && failed > 0 ? ' · ' : '') +
              (failed > 0 ? failed + ' failed inspection' + (failed === 1 ? '' : 's') : '') +
            '</div>'
          : '') +
        '</div>' +
        '<div class="flex flex-col gap-2" id="chkItems"></div>';

      const itemsEl = PCD.$('#chkItems', body);
      s.items.forEach(function (it, idx) {
        itemsEl.appendChild(buildItemRow(sid, idx, it));
      });

      wireItemHandlers(sid);
    }

    function buildItemRow(sid, idx, it) {
      const cat = CATS.find(function (c) { return c.id === it.cat; });
      const prio = PRIOS.find(function (p) { return p.id === it.prio; });
      const type = it.type || 'task';
      const complete = isItemComplete(it);
      const outOfRange = isValueOutOfRange(it);

      const wrap = PCD.el('div', {
        style: {
          padding: '12px',
          border: '1px solid ' + (outOfRange || it.result === 'fail' ? 'var(--danger)' : (complete ? 'var(--brand-300)' : 'var(--border)')),
          borderRadius: 'var(--r-sm)',
          background: outOfRange || it.result === 'fail' ? '#fef2f2' : (complete ? 'var(--brand-50)' : 'var(--surface)'),
          transition: 'all 0.2s',
        }
      });

      // Header row: priority dot + text + category chip
      const catChip = cat ? '<span style="font-size:10px;padding:2px 7px;border-radius:999px;background:' + cat.color + '22;color:' + cat.color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;flex-shrink:0;">' + catLabel(cat) + '</span>' : '';
      const prioDot = prio ? '<span style="width:8px;height:8px;border-radius:50%;background:' + prio.color + ';flex-shrink:0;display:inline-block;" title="' + prioLabel(prio) + '"></span>' : '';

      let headerHtml =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (type === 'task' ? '0' : '10px') + ';">' +
          prioDot +
          '<div style="flex:1;min-width:0;font-weight:500;font-size:14px;' + (complete && type === 'task' ? 'text-decoration:line-through;color:var(--text-3);' : '') + '">' + PCD.escapeHtml(it.text) + '</div>' +
          catChip +
        '</div>';

      // Type-specific input
      let inputHtml = '';
      if (type === 'task') {
        // For task type, replace header with checkbox + label combined
        wrap.innerHTML =
          '<div data-toggle-task="' + idx + '" style="display:flex;align-items:center;gap:10px;cursor:pointer;">' +
            '<div style="width:22px;height:22px;border:2px solid ' + (it.done ? 'var(--brand-600)' : 'var(--border-strong)') + ';border-radius:4px;display:flex;align-items:center;justify-content:center;background:' + (it.done ? 'var(--brand-600)' : 'transparent') + ';color:white;flex-shrink:0;">' +
              (it.done ? PCD.icon('check', 14) : '') +
            '</div>' +
            prioDot +
            '<div style="flex:1;min-width:0;font-weight:500;font-size:14px;' + (it.done ? 'text-decoration:line-through;color:var(--text-3);' : '') + '">' + PCD.escapeHtml(it.text) + '</div>' +
            catChip +
            (it.doneAt ? '<div class="text-muted" style="white-space:nowrap;font-size:11px;">' + PCD.fmtRelTime(it.doneAt) + '</div>' : '') +
          '</div>';
      } else if (type === 'temperature' || type === 'numeric') {
        const rangeStr = (it.min !== undefined || it.max !== undefined)
          ? 'Target: ' + (it.min !== undefined ? it.min : '?') + '–' + (it.max !== undefined ? it.max : '?') + ' ' + (it.unit || '')
          : '';
        inputHtml =
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input type="number" class="input" data-numinput="' + idx + '" value="' + (it.value !== null && it.value !== undefined ? it.value : '') + '" step="0.1" placeholder="Enter value" style="flex:1;font-weight:600;font-family:var(--font-mono);' + (outOfRange ? 'border-color:var(--danger);color:var(--danger);' : '') + '">' +
            (it.unit ? '<span style="font-weight:600;color:var(--text-2);min-width:40px;">' + PCD.escapeHtml(it.unit) + '</span>' : '') +
          '</div>' +
          (rangeStr ? '<div class="text-muted text-sm mt-1" style="font-size:11px;">' + rangeStr + (outOfRange ? ' · <strong style="color:var(--danger);">OUT OF RANGE</strong>' : '') + '</div>' : '');
        wrap.innerHTML = headerHtml + inputHtml;
      } else if (type === 'pass-fail') {
        inputHtml =
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' +
            '<button class="btn btn-secondary btn-sm" data-pf="' + idx + ':pass" style="' + (it.result === 'pass' ? 'background:#16a34a;color:#fff;border-color:#16a34a;' : '') + 'flex-direction:row;gap:4px;">' + PCD.icon('check', 14) + ' <span>PASS</span></button>' +
            '<button class="btn btn-secondary btn-sm" data-pf="' + idx + ':fail" style="' + (it.result === 'fail' ? 'background:#ef4444;color:#fff;border-color:#ef4444;' : '') + 'flex-direction:row;gap:4px;">' + PCD.icon('x', 14) + ' <span>FAIL</span></button>' +
            '<button class="btn btn-secondary btn-sm" data-pf="' + idx + ':na" style="' + (it.result === 'na' ? 'background:#94a3b8;color:#fff;border-color:#94a3b8;' : '') + '">N/A</button>' +
          '</div>';
        wrap.innerHTML = headerHtml + inputHtml;
      } else if (type === 'text') {
        inputHtml =
          '<input type="text" class="input" data-textinput="' + idx + '" value="' + PCD.escapeHtml(it.value || '') + '" placeholder="Enter text">';
        wrap.innerHTML = headerHtml + inputHtml;
      }

      // Footer: comment + completion time
      const footerInfo = [];
      if (complete && (it.doneAt || (type !== 'task' && type !== 'pass-fail'))) {
        // Already shown for task type
      }

      // Comment toggle
      const commentRow = PCD.el('div', { style: { marginTop: complete || type !== 'task' ? '8px' : '0' } });
      const hasComment = it.comment && it.comment.length > 0;
      commentRow.innerHTML =
        '<button data-cmtoggle="' + idx + '" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;color:var(--text-3);">' +
          (hasComment ? '✏️ Comment' : '+ Add comment') +
        '</button>' +
        '<div data-cmwrap="' + idx + '" style="display:' + (hasComment ? 'block' : 'none') + ';margin-top:4px;">' +
          '<input type="text" class="input" data-cminput="' + idx + '" value="' + PCD.escapeHtml(it.comment || '') + '" placeholder="Notes for this item..." style="font-size:13px;padding:6px 10px;min-height:32px;">' +
        '</div>';
      wrap.appendChild(commentRow);

      return wrap;
    }

    function wireItemHandlers(sid) {
      // Task toggle
      PCD.on(body, 'click', '[data-toggle-task]', function () {
        const idx = parseInt(this.getAttribute('data-toggle-task'), 10);
        updateSession(sid, function (s) {
          s.items[idx].done = !s.items[idx].done;
          s.items[idx].doneAt = s.items[idx].done ? new Date().toISOString() : null;
        });
        PCD.haptic && PCD.haptic('light');
        renderBody();
      });

      // Numeric / temperature input
      PCD.on(body, 'input', '[data-numinput]', function () {
        const idx = parseInt(this.getAttribute('data-numinput'), 10);
        const val = this.value;
        updateSession(sid, function (s) {
          s.items[idx].value = val;
          s.items[idx].doneAt = val !== '' ? new Date().toISOString() : null;
        });
        // Soft re-render only the item row's class for color change — full render is heavy
        const s = getSession(sid);
        if (s && s.items[idx]) {
          const oor = isValueOutOfRange(s.items[idx]);
          this.style.borderColor = oor ? 'var(--danger)' : '';
          this.style.color = oor ? 'var(--danger)' : '';
          // Update parent wrap colors
          const wrap = this.closest('div').parentElement; // wrap
          if (wrap) {
            const filled = s.items[idx].value !== '' && s.items[idx].value !== null;
            wrap.style.background = oor ? '#fef2f2' : (filled ? 'var(--brand-50)' : 'var(--surface)');
            wrap.style.borderColor = oor ? 'var(--danger)' : (filled ? 'var(--brand-300)' : 'var(--border)');
          }
        }
        // Update top progress
        updateProgressBar();
      });

      // Pass-fail buttons
      PCD.on(body, 'click', '[data-pf]', function () {
        const parts = this.getAttribute('data-pf').split(':');
        const idx = parseInt(parts[0], 10);
        const choice = parts[1];
        updateSession(sid, function (s) {
          s.items[idx].result = choice;
          s.items[idx].doneAt = new Date().toISOString();
        });
        PCD.haptic && PCD.haptic('light');
        renderBody();
      });

      // Text input
      PCD.on(body, 'input', '[data-textinput]', function () {
        const idx = parseInt(this.getAttribute('data-textinput'), 10);
        const val = this.value;
        updateSession(sid, function (s) {
          s.items[idx].value = val;
          s.items[idx].doneAt = val ? new Date().toISOString() : null;
        });
        updateProgressBar();
      });

      // Comment toggle
      PCD.on(body, 'click', '[data-cmtoggle]', function () {
        const idx = this.getAttribute('data-cmtoggle');
        const wrap = body.querySelector('[data-cmwrap="' + idx + '"]');
        if (wrap) {
          wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
          if (wrap.style.display === 'block') {
            const inp = wrap.querySelector('input');
            if (inp) inp.focus();
          }
        }
      });

      // Comment input
      PCD.on(body, 'input', '[data-cminput]', function () {
        const idx = parseInt(this.getAttribute('data-cminput'), 10);
        const val = this.value;
        updateSession(sid, function (s) {
          s.items[idx].comment = val;
        });
      });
    }

    function updateProgressBar() {
      const s = getSession(sid);
      if (!s) return;
      const total = s.items.length;
      const done = s.items.filter(isItemComplete).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const head = body.querySelector('.mb-3');
      if (head) {
        const dEl = head.querySelector('[style*="font-weight:700"]:first-child');
        if (dEl) dEl.textContent = PCD.i18n.t('chk_complete_count', { done: done, total: total });
        const pEl = head.querySelector('[style*="font-size:18px"]');
        if (pEl) pEl.textContent = pct + '%';
        const bar = head.querySelector('.progress-bar');
        if (bar) bar.style.width = pct + '%';
      }
    }

    renderBody();

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Print / PDF' });
    printBtn.innerHTML = PCD.icon('print', 16);
    const shareBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const completeBtn = PCD.el('button', { class: 'btn btn-primary', text: t('checklist_complete') || 'Complete', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(completeBtn);

    const m = PCD.modal.open({
      title: (tpl ? tpl.name : 'Checklist') + ' · ' + PCD.fmtDate(session.startedAt, { month: 'short', day: 'numeric' }),
      body: body, footer: footer, size: 'md', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });

    printBtn.addEventListener('click', function () {
      const s = getSession(sid);
      printChecklistSession(s, tpl);
    });
    shareBtn.addEventListener('click', function () {
      const s = getSession(sid);
      openShareSheet(s, tpl);
    });

    completeBtn.addEventListener('click', function () {
      const s = getSession(sid);
      const total = s.items.length;
      const incomplete = total - s.items.filter(isItemComplete).length;
      if (incomplete > 0) {
        PCD.modal.confirm({
          title: 'Complete with ' + incomplete + ' unfinished?',
          text: 'Mark session as completed anyway?',
          okText: 'Complete',
        }).then(function (ok) {
          if (!ok) return;
          finalizeSession();
        });
      } else {
        finalizeSession();
      }
      function finalizeSession() {
        const user = PCD.store.get('user') || {};
        updateSession(sid, function (s) {
          s.completedAt = new Date().toISOString();
          s.completedBy = user.name || user.email || '';
        });
        PCD.toast.success(PCD.i18n.t('toast_checklist_completed'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'checklist') render(v);
        }, 150);
      }
    });
  }

  // ============ SESSION HISTORY (v2.6.0) ============
  // Show past completed sessions for a template. By default shows last
  // 90 days; user can expand to "all" with one tap. HACCP requires up
  // to 2 years of records — we never auto-delete, just paginate the UI.
  function openSessionHistory(templateId) {
    const t = PCD.i18n.t;
    const tpl = PCD.store.getFromTable('checklistTemplates', templateId);
    if (!tpl) {
      PCD.toast.error(PCD.i18n.t('toast_template_not_found'));
      return;
    }

    let showAll = false;
    const body = PCD.el('div');

    function paint() {
      const all = listCompletedSessions(templateId);
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const visible = showAll ? all : all.filter(function (s) {
        return new Date(s.completedAt).getTime() >= cutoff;
      });
      const hiddenCount = all.length - visible.length;

      if (all.length === 0) {
        body.innerHTML =
          '<div class="text-muted" style="padding:48px 20px;text-align:center;line-height:1.6;">' +
            '<div style="font-size:40px;margin-bottom:10px;">📜</div>' +
            '<div style="font-weight:600;color:var(--text-1);margin-bottom:6px;">' + PCD.escapeHtml(t('checklist_history_empty_title') || 'No completed sessions yet') + '</div>' +
            '<div style="font-size:13px;">' + PCD.escapeHtml(t('checklist_history_empty_msg') || 'Once you complete a session, it will appear here for your records.') + '</div>' +
          '</div>';
        return;
      }

      let html = '<div class="text-muted text-sm" style="margin-bottom:12px;">' +
        PCD.escapeHtml(t('checklist_history_intro') || 'Past completed sessions. Tap any row to view details or save as PDF.') +
      '</div>';

      visible.forEach(function (s) {
        const total = (s.items || []).length;
        const done = (s.items || []).filter(isItemComplete).length;
        const failed = (s.items || []).filter(function (i) { return i.result === 'fail'; }).length;
        const oor = (s.items || []).filter(isValueOutOfRange).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const issues = failed + oor;
        const statusColor = issues > 0 ? '#dc2626' : '#16a34a';
        const statusIcon = issues > 0 ? '⚠' : '✓';
        const completedDate = new Date(s.completedAt);
        const dateStr = completedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = completedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        html += '<div class="card card-hover" data-history-sid="' + s.id + '" style="padding:12px 14px;margin-bottom:8px;cursor:pointer;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:' + statusColor + '15;color:' + statusColor + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">' + statusIcon + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(dateStr) + ' · ' + PCD.escapeHtml(timeStr) + '</div>' +
              '<div class="text-muted" style="font-size:12px;margin-top:2px;">' +
                PCD.escapeHtml(s.completedBy || t('checklist_history_unknown_chef') || 'Unknown') +
                ' · ' + done + '/' + total + ' (' + pct + '%)' +
                (issues > 0 ? ' · <span style="color:' + statusColor + ';font-weight:600;">' + issues + ' ' + (t('checklist_history_issues') || 'issues') + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div style="color:var(--text-3);">›</div>' +
          '</div>' +
        '</div>';
      });

      if (!showAll && hiddenCount > 0) {
        html += '<button id="historyShowAllBtn" class="btn btn-secondary" style="width:100%;margin-top:8px;">' +
          PCD.escapeHtml((t('checklist_history_show_older') || 'Show {n} older sessions').replace('{n}', hiddenCount)) +
        '</button>';
      } else if (showAll && all.length > 0) {
        html += '<div class="text-muted" style="text-align:center;font-size:11px;margin-top:10px;">' +
          PCD.escapeHtml((t('checklist_history_total') || 'Showing all {n} sessions').replace('{n}', all.length)) +
        '</div>';
      }

      body.innerHTML = html;

      // Wire up clicks
      body.querySelectorAll('[data-history-sid]').forEach(function (el) {
        el.addEventListener('click', function () {
          const sid = this.getAttribute('data-history-sid');
          const session = getSession(sid);
          if (session) openHistoryDetail(session, tpl);
        });
      });
      const showAllBtn = body.querySelector('#historyShowAllBtn');
      if (showAllBtn) {
        showAllBtn.addEventListener('click', function () {
          showAll = true;
          paint();
        });
      }
    }
    paint();

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({
      title: '📜 ' + (t('checklist_history') || 'History') + ' · ' + tpl.name,
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  // Show a single past session — read-only view + Print/Delete actions.
  function openHistoryDetail(session, tpl) {
    const t = PCD.i18n.t;
    const total = (session.items || []).length;
    const done = (session.items || []).filter(isItemComplete).length;
    const failed = (session.items || []).filter(function (i) { return i.result === 'fail'; }).length;
    const oor = (session.items || []).filter(isValueOutOfRange).length;
    const issues = failed + oor;
    const completedDate = new Date(session.completedAt);
    const startedDate = new Date(session.startedAt);
    const durationMin = Math.max(1, Math.round((completedDate - startedDate) / 60000));

    const body = PCD.el('div');
    let itemsHtml = '';
    (session.items || []).forEach(function (it) {
      const cat = CATS.find(function (c) { return c.id === it.cat; });
      const tplItem = (tpl.items || []).find(function (x) { return x.id === it.id; }) || {};
      const text = tplItem.text || '(item)';
      const oorThis = isValueOutOfRange(it);
      let valueStr = '';
      if (it.result === 'pass') valueStr = '<span style="color:#16a34a;font-weight:700;">✓ PASS</span>';
      else if (it.result === 'fail') valueStr = '<span style="color:#dc2626;font-weight:700;">✗ FAIL</span>';
      else if (it.value !== undefined && it.value !== null && it.value !== '') {
        valueStr = '<span style="' + (oorThis ? 'color:#dc2626;font-weight:700;' : 'color:var(--text-1);') + '">' + PCD.escapeHtml(String(it.value)) + (tplItem.unit ? ' ' + tplItem.unit : '') + '</span>';
      } else if (isItemComplete(it)) {
        valueStr = '<span style="color:#16a34a;">✓</span>';
      } else {
        valueStr = '<span style="color:var(--text-3);">—</span>';
      }
      itemsHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border);">' +
        '<div style="flex:1;min-width:0;font-size:13px;">' + PCD.escapeHtml(text) + '</div>' +
        '<div style="font-size:13px;flex-shrink:0;">' + valueStr + '</div>' +
      '</div>';
    });

    body.innerHTML =
      '<div style="background:var(--surface-2);padding:12px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;line-height:1.7;">' +
        '<div><strong>' + (t('checklist_history_completed_at') || 'Completed') + ':</strong> ' + completedDate.toLocaleString() + '</div>' +
        '<div><strong>' + (t('checklist_history_started_at') || 'Started') + ':</strong> ' + startedDate.toLocaleString() + ' (' + durationMin + ' ' + (t('checklist_history_minutes') || 'min') + ')</div>' +
        '<div><strong>' + (t('checklist_history_by') || 'By') + ':</strong> ' + PCD.escapeHtml(session.completedBy || (t('checklist_history_unknown_chef') || 'Unknown')) + '</div>' +
        '<div><strong>' + (t('checklist_history_result') || 'Result') + ':</strong> ' + done + '/' + total +
          (issues > 0 ? ' · <span style="color:#dc2626;font-weight:700;">' + issues + ' ' + (t('checklist_history_issues') || 'issues') + '</span>' : ' · <span style="color:#16a34a;font-weight:700;">' + (t('checklist_history_all_pass') || 'all pass') + '</span>') +
        '</div>' +
      '</div>' +
      '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">' + itemsHtml + '</div>';

    const printBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    printBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + (t('print') || 'Print / PDF') + '</span>';
    const deleteBtn = PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Delete' });
    deleteBtn.innerHTML = PCD.icon('trash', 16);
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(deleteBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: tpl.name + ' — ' + completedDate.toLocaleDateString(),
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { printChecklistSession(session, tpl); });
    deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('checklist_history_delete_title') || 'Delete this record?',
        text: t('checklist_history_delete_msg') || 'This permanently removes the session from history. HACCP records cannot be recovered.',
        okText: t('act_delete') || 'Delete',
      }).then(function (ok) {
        if (!ok) return;
        deleteSessionById(session.id);
        PCD.toast.success(t('checklist_history_deleted') || 'Record deleted');
        m.close();
        // Reopen history list to refresh count
        setTimeout(function () { openSessionHistory(tpl.id); }, 200);
      });
    });
  }

  // ============ PRINT SESSION ============
  function printChecklistSession(s, tpl) {
    const user = PCD.store.get('user') || {};
    const total = s.items.length;
    const done = s.items.filter(isItemComplete).length;
    const failed = s.items.filter(function (i) { return i.result === 'fail'; }).length;
    const oor = s.items.filter(isValueOutOfRange).length;

    let rowsHtml = '';
    s.items.forEach(function (it, idx) {
      const cat = CATS.find(function (c) { return c.id === it.cat; });
      const type = it.type || 'task';
      const complete = isItemComplete(it);
      const isOOR = isValueOutOfRange(it);

      let valueCell = '';
      if (type === 'task') {
        valueCell = it.done ? '<span style="color:#16a34a;font-weight:700;">✓ Done</span>' : '<span style="color:#999;">—</span>';
      } else if (type === 'temperature' || type === 'numeric') {
        if (it.value !== null && it.value !== '') {
          const range = (it.min !== undefined || it.max !== undefined) ? ' (' + (it.min !== undefined ? it.min : '?') + '–' + (it.max !== undefined ? it.max : '?') + ' ' + (it.unit || '') + ')' : '';
          valueCell = '<span style="' + (isOOR ? 'color:#dc2626;font-weight:700;' : 'color:#16a34a;font-weight:600;') + '">' + it.value + ' ' + (it.unit || '') + '</span>' +
            (isOOR ? ' <strong style="color:#dc2626;">OOR</strong>' : '') +
            '<div style="font-size:9px;color:#999;">' + range + '</div>';
        } else {
          valueCell = '<span style="color:#999;">—</span>';
        }
      } else if (type === 'pass-fail') {
        if (it.result === 'pass') valueCell = '<span style="color:#16a34a;font-weight:700;">✓ PASS</span>';
        else if (it.result === 'fail') valueCell = '<span style="color:#dc2626;font-weight:700;">✗ FAIL</span>';
        else if (it.result === 'na') valueCell = '<span style="color:#94a3b8;">N/A</span>';
        else valueCell = '<span style="color:#999;">—</span>';
      } else if (type === 'text') {
        valueCell = it.value ? PCD.escapeHtml(it.value) : '<span style="color:#999;">—</span>';
      }

      const time = it.doneAt ? new Date(it.doneAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
      const comment = it.comment ? '<div style="font-size:9pt;color:#666;font-style:italic;margin-top:3px;">📝 ' + PCD.escapeHtml(it.comment) + '</div>' : '';

      rowsHtml +=
        '<tr style="' + (isOOR || it.result === 'fail' ? 'background:#fef2f2;' : '') + '">' +
          '<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;width:24px;font-weight:700;color:#999;">' + (idx + 1) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;">' +
            '<div style="font-weight:500;">' + PCD.escapeHtml(it.text) + '</div>' +
            (cat ? '<span style="font-size:8pt;color:' + cat.color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + catLabel(cat) + '</span>' : '') +
            comment +
          '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;text-align:center;">' + valueCell + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:10pt;color:#666;">' + time + '</td>' +
        '</tr>';
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 15mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
        '.h-row { border-bottom: 3px solid #16a34a; padding-bottom: 10px; margin-bottom: 16px; }' +
        '.h-row h1 { margin: 0; font-size: 22pt; color: #16a34a; }' +
        '.h-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 12px 0 18px; padding: 12px; background: #f8f8f8; border-radius: 6px; }' +
        '.h-meta-item { font-size: 9pt; }' +
        '.h-meta-item .lbl { color: #888; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; font-size: 8pt; }' +
        '.h-meta-item .val { font-size: 13pt; font-weight: 700; color: #111; }' +
        '.h-meta-item.fail .val { color: #dc2626; }' +
        '.h-meta-item.ok .val { color: #16a34a; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'thead th { background: #f1f1f1; padding: 8px 10px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }' +
        '.h-signoff { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; font-size: 10pt; }' +
        '.h-signoff .sig-line { border-bottom: 1px solid #888; padding-bottom: 30px; margin-bottom: 4px; }' +
        '.h-signoff .sig-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }' +
      '</style>' +
      '<div class="h-row">' +
        '<h1>' + PCD.escapeHtml((tpl && tpl.name) || s.templateName || 'Checklist') + '</h1>' +
        '<div style="color:#666;font-size:11pt;margin-top:4px;">' +
          new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
          (s.completedAt ? ' · Completed ' + new Date(s.completedAt).toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'}) : '') +
        '</div>' +
      '</div>' +
      '<div class="h-meta">' +
        '<div class="h-meta-item"><div class="lbl">Items</div><div class="val">' + total + '</div></div>' +
        '<div class="h-meta-item ' + (done === total ? 'ok' : '') + '"><div class="lbl">Completed</div><div class="val">' + done + '/' + total + '</div></div>' +
        '<div class="h-meta-item ' + (failed > 0 ? 'fail' : '') + '"><div class="lbl">Failed</div><div class="val">' + failed + '</div></div>' +
        '<div class="h-meta-item ' + (oor > 0 ? 'fail' : '') + '"><div class="lbl">Out of range</div><div class="val">' + oor + '</div></div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th style="width:24px;">#</th><th>Item</th><th style="text-align:center;width:140px;">Result / Value</th><th style="width:60px;">Time</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="h-signoff">' +
        '<div>' +
          '<div class="sig-line">' + PCD.escapeHtml(s.completedBy || user.name || '') + '</div>' +
          '<div class="sig-label">Completed by</div>' +
        '</div>' +
        '<div>' +
          '<div class="sig-line">&nbsp;</div>' +
          '<div class="sig-label">Verified by (signature & date)</div>' +
        '</div>' +
      '</div>';

    PCD.print(html, ((tpl && tpl.name) || 'Checklist') + ' — ' + PCD.fmtDate(s.startedAt, { month: 'short', day: 'numeric' }));
  }

  // Build human-friendly text version for sharing
  function buildShareText(s, tpl) {
    const total = s.items.length;
    const done = s.items.filter(isItemComplete).length;
    const lines = [
      ((tpl && tpl.name) || s.templateName || 'Checklist'),
      new Date(s.startedAt).toLocaleDateString() + ' · ' + done + '/' + total + ' complete',
      ''
    ];
    s.items.forEach(function (it) {
      const type = it.type || 'task';
      let valStr = '';
      if (type === 'task') valStr = it.done ? '☑' : '☐';
      else if (type === 'temperature' || type === 'numeric') valStr = it.value !== null && it.value !== '' ? '→ ' + it.value + ' ' + (it.unit || '') + (isValueOutOfRange(it) ? ' ⚠️ OUT OF RANGE' : '') : '☐';
      else if (type === 'pass-fail') valStr = it.result === 'pass' ? '✓ PASS' : (it.result === 'fail' ? '✗ FAIL' : (it.result === 'na' ? 'N/A' : '☐'));
      else if (type === 'text') valStr = it.value ? '→ ' + it.value : '☐';
      lines.push(valStr + ' ' + it.text + (it.comment ? '  📝 ' + it.comment : ''));
    });
    return lines.join('\n');
  }

  function openShareSheet(s, tpl) {
    const title = ((tpl && tpl.name) || s.templateName || 'Checklist');
    const text = buildShareText(s, tpl);
    const body = PCD.el('div');
    body.innerHTML =
      '<div style="padding:14px;background:var(--brand-50);border-radius:var(--r-md);margin-bottom:14px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:6px;">📄 Recommended: PDF</div>' +
        '<div class="text-muted text-sm" style="margin-bottom:10px;">Checklists are audit documents. Download as PDF for proper records, then share the file via WhatsApp / Email / Drive from your device.</div>' +
        '<button class="btn btn-primary" id="shPdf" style="width:100%;">' + PCD.icon('print', 16) + ' <span>Save as PDF</span></button>' +
      '</div>' +

      '<div style="font-weight:600;font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Or share as plain text</div>' +
      '<div class="field"><label class="field-label">Message preview (editable)</label>' +
      '<textarea class="textarea" id="shareText" rows="6" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:10px;">' +
        '<button class="btn btn-outline btn-sm" id="shWa" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:#25D366;">' + PCD.icon('message-circle', 18) + '</div>' +
          '<div style="font-weight:600;font-size:11px;">WhatsApp</div></button>' +
        '<button class="btn btn-outline btn-sm" id="shEmail" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:#EA4335;">' + PCD.icon('mail', 18) + '</div>' +
          '<div style="font-weight:600;font-size:11px;">Email</div></button>' +
        '<button class="btn btn-outline btn-sm" id="shCopy" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:var(--brand-600);">' + PCD.icon('copy', 18) + '</div>' +
          '<div style="font-weight:600;font-size:11px;">Copy</div></button>' +
        '<button class="btn btn-outline btn-sm" id="shMore" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;">' +
          '<div style="color:var(--text-2);">' + PCD.icon('share', 18) + '</div>' +
          '<div style="font-weight:600;font-size:11px;">More...</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close' });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: 'Share · ' + title, body: body, footer: footer, size: 'md', closable: true });

    PCD.$('#shPdf', body).addEventListener('click', function () {
      m.close();
      setTimeout(function () { printChecklistSession(s, tpl); }, 250);
    });

    function getText() { return PCD.$('#shareText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#shWa', body).addEventListener('click', function () {
      window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank');
      m.close();
    });
    PCD.$('#shEmail', body).addEventListener('click', function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(getText());
      m.close();
    });
    PCD.$('#shCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () {
          PCD.toast.success(PCD.i18n.t('toast_copied'));
          m.close();
        });
      }
    });
    PCD.$('#shMore', body).addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: title, text: getText() }).then(function () { m.close(); }).catch(function () {});
      } else {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
        }
      }
    });
  }

  // ============ TEMPLATE EDITOR ============
  function openTemplateEditor(tid) {
    const t = PCD.i18n.t;
    const existing = tid ? PCD.store.getFromTable('checklistTemplates', tid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', icon: 'check-square',
      items: [{ id: PCD.uid('it'), text: '', cat: 'prep', prio: 'med', type: 'task' }],
    };

    const body = PCD.el('div');

    function renderEditor() {
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${PCD.i18n.t('chk_tpl_name')} *</label>
          <input type="text" class="input" id="tplName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${PCD.escapeHtml(PCD.i18n.t('chk_tpl_name_placeholder'))}">
        </div>

        <div class="field">
          <label class="field-label">${PCD.i18n.t('chk_items_label')}</label>
          <div id="itemsList" class="flex flex-col gap-2"></div>
          <button class="btn btn-ghost btn-sm mt-2" id="addItemBtn">${PCD.icon('plus',14)} ${PCD.i18n.t('chk_add_item')}</button>
        </div>
      `;

      const itemsListEl = PCD.$('#itemsList', body);
      data.items.forEach(function (it, idx) {
        const row = PCD.el('div', {
          style: { padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }
        });
        const type = it.type || 'task';
        row.innerHTML = `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <div style="color:var(--text-3);font-size:12px;width:24px;text-align:right;font-weight:700;">${idx + 1}.</div>
            <input type="text" class="input" data-itemtext="${idx}" value="${PCD.escapeHtml(it.text || '')}" placeholder="${PCD.escapeHtml(PCD.i18n.t('chk_item_description'))}" style="flex:1;font-weight:500;">
            <button class="icon-btn" data-itemdel="${idx}">${PCD.icon('x',16)}</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
            <select class="select" data-itemtype="${idx}" style="font-size:12px;">
              ${ITEM_TYPES.map(function (it) { return '<option value="' + it.id + '"' + (type === it.id ? ' selected' : '') + '>' + PCD.i18n.t(it.labelKey) + '</option>'; }).join('')}
            </select>
            <select class="select" data-itemcat="${idx}" style="font-size:12px;">
              ${CATS.map(function (c) { return '<option value="' + c.id + '"' + ((it.cat || 'prep') === c.id ? ' selected' : '') + '>' + catLabel(c) + '</option>'; }).join('')}
            </select>
            <select class="select" data-itemprio="${idx}" style="font-size:12px;">
              ${PRIOS.map(function (p) { return '<option value="' + p.id + '"' + ((it.prio || 'med') === p.id ? ' selected' : '') + '>' + prioLabel(p) + '</option>'; }).join('')}
            </select>
          </div>
          ${(type === 'temperature' || type === 'numeric') ? `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px;">
              <input type="number" class="input" data-itemmin="${idx}" value="${it.min !== undefined ? it.min : ''}" step="0.1" placeholder="${PCD.escapeHtml(PCD.i18n.t('chk_min'))}" style="font-size:12px;">
              <input type="number" class="input" data-itemmax="${idx}" value="${it.max !== undefined ? it.max : ''}" step="0.1" placeholder="${PCD.escapeHtml(PCD.i18n.t('chk_max'))}" style="font-size:12px;">
              <input type="text" class="input" data-itemunit="${idx}" value="${PCD.escapeHtml(it.unit || '')}" placeholder="${type === 'temperature' ? '°C' : PCD.escapeHtml(PCD.i18n.t('chk_unit_placeholder'))}" style="font-size:12px;">
            </div>
          ` : ''}
        `;
        itemsListEl.appendChild(row);
      });

      PCD.$('#tplName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#addItemBtn', body).addEventListener('click', function () {
        data.items.push({ id: PCD.uid('it'), text: '', cat: 'prep', prio: 'med', type: 'task' });
        renderEditor();
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-itemtext]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      PCD.on(body, 'input', '[data-itemtext]', function () {
        const idx = parseInt(this.getAttribute('data-itemtext'), 10);
        if (data.items[idx]) data.items[idx].text = this.value;
      });
      PCD.on(body, 'change', '[data-itemcat]', function () {
        const idx = parseInt(this.getAttribute('data-itemcat'), 10);
        if (data.items[idx]) data.items[idx].cat = this.value;
      });
      PCD.on(body, 'change', '[data-itemprio]', function () {
        const idx = parseInt(this.getAttribute('data-itemprio'), 10);
        if (data.items[idx]) data.items[idx].prio = this.value;
      });
      PCD.on(body, 'change', '[data-itemtype]', function () {
        const idx = parseInt(this.getAttribute('data-itemtype'), 10);
        if (data.items[idx]) {
          data.items[idx].type = this.value;
          // For temperature, suggest defaults
          if (this.value === 'temperature' && data.items[idx].unit === undefined) {
            data.items[idx].unit = '°C';
            data.items[idx].min = 1;
            data.items[idx].max = 4;
          }
          renderEditor();
        }
      });
      PCD.on(body, 'input', '[data-itemmin]', function () {
        const idx = parseInt(this.getAttribute('data-itemmin'), 10);
        if (data.items[idx]) data.items[idx].min = this.value === '' ? undefined : parseFloat(this.value);
      });
      PCD.on(body, 'input', '[data-itemmax]', function () {
        const idx = parseInt(this.getAttribute('data-itemmax'), 10);
        if (data.items[idx]) data.items[idx].max = this.value === '' ? undefined : parseFloat(this.value);
      });
      PCD.on(body, 'input', '[data-itemunit]', function () {
        const idx = parseInt(this.getAttribute('data-itemunit'), 10);
        if (data.items[idx]) data.items[idx].unit = this.value;
      });
      PCD.on(body, 'click', '[data-itemdel]', function () {
        const idx = parseInt(this.getAttribute('data-itemdel'), 10);
        data.items.splice(idx, 1);
        if (data.items.length === 0) data.items.push({ id: PCD.uid('it'), text: '', cat: 'prep', prio: 'med', type: 'task' });
        renderEditor();
      });
    }

    renderEditor();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || 'Template') : (t('checklist_new_template') || 'New Template'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('checklistTemplates', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'checklist') render(v);
        }, 150);
      });
    });
    saveBtn.addEventListener('click', function () {
      // Read fresh from DOM
      const nameInp = PCD.$('#tplName', body);
      if (nameInp) data.name = nameInp.value;
      body.querySelectorAll('[data-itemtext]').forEach(function (inp) {
        const idx = parseInt(inp.getAttribute('data-itemtext'), 10);
        if (data.items[idx]) data.items[idx].text = inp.value;
      });

      data.name = (data.name || '').trim();
      if (!data.name) { PCD.toast.error(PCD.i18n.t('toast_name_required')); return; }
      data.items = data.items.filter(function (it) { return it.text && it.text.trim(); });
      if (data.items.length === 0) { PCD.toast.error(PCD.i18n.t('toast_add_at_least_one_item')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('checklistTemplates', data, 'tpl');
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'checklist') render(v);
      }, 150);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.checklist = { render: render, openEditor: openTemplateEditor };
})();
