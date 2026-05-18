/* ================================================================
   ProChefDesk — buffet.js (v2.8.73)
   ----------------------------------------------------------------
   BUFFET PLANNER — profesyonel otel/catering tool.

   A la carte tarif maliyetinden farklı bir mental model:
   - Misafir başına flat ticket fiyatı (set menu değil)
   - Item başına consumption ratio (hot proteins %85, fruit %55 vb.)
   - Refill multiplier (servis süresi + talep dalgalanması)
   - Stations (cold/hot/bakery/dessert/beverage)
   - Per-cover cost + waste projection + margin

   Sektör standartları (constants):
     INDUSTRY_RATIOS — chef düzenleyebilir ama defaults sektör değeri
     INDUSTRY_REFILL — buffet type'a göre refill multiplier
     INDUSTRY_TARGETS — food cost % hedefleri (a la carte'tan düşük)

   Veri tek IDB tablosunda saklanır (`buffets`). Cloud sync opsiyonel
   (sonraki round; şu an local-only — sub-recipe expansion v2.8.69
   `flattenIngredients` ile shopping list path'i çalışır).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // ---------- SEKTÖR SABİTLERİ ----------

  // Hotel/catering endüstri tüketim oranları (chef değiştirebilir).
  // Kaynak: Cornell hospitality, Marriott/Hilton banquet ops manuals,
  // bir şefin uzun süreli buffet servis tecrübesi.
  const INDUSTRY_RATIOS = {
    hot_protein:   0.85,  // scrambled eggs, bacon, sausage — yüksek pickup
    hot_carb:      0.70,  // pasta, rice, potato — düşük plate fraction
    hot_veg:       0.55,  // roasted veg, gratins — orta
    cold_protein:  0.45,  // smoked salmon, charcuterie, cold cuts
    cold_veg:      0.40,  // crudité, antipasti, salads
    cheese:        0.35,  // cheese platters — düşük per-guest
    fruit_fresh:   0.55,  // taze meyve — mevsim/cuts'a göre değişir
    fruit_dried:   0.20,  // kuru meyve, nuts
    bakery:        0.70,  // croissants, breads, pastries
    dessert:       0.60,  // küçük tatlılar, mini cakes
    yogurt_cereal: 0.35,  // breakfast yoğurt, granola, müsli
    beverage_hot:  0.85,  // kahve, çay — herkes alır
    beverage_cold: 0.95,  // su, juice — herkes alır
    other:         0.60,  // default fallback
  };

  // Buffet type'ına göre refill multiplier (toplam prep = misafir × per_guest × refillX).
  // Endüstri: rest. açık olduğu süre boyunca dolu görünmeli; ilk prep + N refill.
  const INDUSTRY_REFILL = {
    breakfast: 1.20,  // 2-3 saat, talep dalga halinde
    brunch:    1.35,  // 3-4 saat, yoğun dalga
    lunch:     1.25,  // 1.5-2 saat, kısa ama yoğun
    dinner:    1.30,  // 2-3 saat, hızlı tüketim
    cocktail:  1.15,  // 1-2 saat, küçük porsiyonlar
    custom:    1.25,  // genel default
  };

  // Hedef food cost % aralıkları (renk kodlu uyarı için).
  // Buffet a la carte'tan düşük: volume + waste tolerance birleşince.
  const INDUSTRY_TARGETS = {
    breakfast: { good: 22, warn: 28, max: 35 },  // breakfast en düşük (cheap items)
    brunch:    { good: 26, warn: 32, max: 40 },
    lunch:     { good: 25, warn: 32, max: 38 },
    dinner:    { good: 28, warn: 35, max: 42 },
    cocktail:  { good: 22, warn: 28, max: 35 },  // küçük porsiyon, yüksek margin
    custom:    { good: 25, warn: 32, max: 38 },
  };

  // Station tipleri (default sıralama: önce cold, sonra hot, sonra dessert).
  const STATION_TYPES = [
    { id: 'cold',     labelKey: 'buffet_station_cold',     icon: 'snowflake',   color: '#3b82f6' },
    { id: 'hot',      labelKey: 'buffet_station_hot',      icon: 'thermometer', color: '#ef4444' },
    { id: 'bakery',   labelKey: 'buffet_station_bakery',   icon: 'package',     color: '#f59e0b' },
    { id: 'dessert',  labelKey: 'buffet_station_dessert',  icon: 'check-square',color: '#ec4899' },
    { id: 'beverage', labelKey: 'buffet_station_beverage', icon: 'activity',    color: '#10b981' },
    { id: 'other',    labelKey: 'buffet_station_other',    icon: 'grid',        color: '#64748b' },
  ];

  // v2.8.88 — Smart industry defaults: type seçince Cover/Price otomatik
  // plausible doldurur (kullanıcı override edebilir). Defaults 4-5★ hotel
  // banquet ops orta-büyük operasyon baseline'ı (Cornell hospitality +
  // Marriott banquet handbook tipik değerleri).
  const BUFFET_TYPES = [
    { id: 'breakfast', labelKey: 'buffet_type_breakfast', priceHint: '25-45', defaultCovers: 80,  defaultPrice: 35 },
    { id: 'brunch',    labelKey: 'buffet_type_brunch',    priceHint: '60-95', defaultCovers: 80,  defaultPrice: 75 },
    { id: 'lunch',     labelKey: 'buffet_type_lunch',     priceHint: '35-60', defaultCovers: 100, defaultPrice: 45 },
    { id: 'dinner',    labelKey: 'buffet_type_dinner',    priceHint: '55-85', defaultCovers: 120, defaultPrice: 70 },
    { id: 'cocktail',  labelKey: 'buffet_type_cocktail',  priceHint: '40-70', defaultCovers: 150, defaultPrice: 55 },
    { id: 'custom',    labelKey: 'buffet_type_custom',    priceHint: '—',     defaultCovers: 50,  defaultPrice: 50 },
  ];

  // v2.8.79 — Unit dropdown (recipes.js ile aynı liste). Manuel yazım yerine
  // sabit liste — operatör request: "unitler tıklamalı opsiyonlar şeklinde
  // olmalı. recipe builderdeki gibi".
  const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pcs', 'each', 'portion', 'bottle', 'bunch', 'slice'];

  // v2.8.89 — Quick start presets. Yeni şef "+ New Buffet" tıklayınca chooser
  // modal'da bu 3 hazır şablon + "Start blank" görür. Custom items olarak
  // ekleniyor (recipeId/ingredientId yok) — şef sonradan kendi recipe/ing
  // library'sine bağlayabilir. amountPerGuest + unit + pickupRatio sektör
  // norm'larıyla doldurulmuş; cost=0 (bağlama sonrası gerçek hesaba geçer).
  const PRESETS = [
    {
      id: 'continental',
      icon: '🥐',
      nameKey: 'buffet_preset_continental',
      descKey: 'buffet_preset_continental_desc',
      template: {
        name: 'Continental Breakfast',
        type: 'breakfast',
        coverCount: 60, ticketPrice: 30, durationHours: 2.5, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Cold', type: 'cold', items: [
            { customName: 'Greek yogurt with honey', amountPerGuest: 120, unit: 'g',  pickupRatio: 0.70, refillX: null },
            { customName: 'Seasonal fruit platter',  amountPerGuest: 100, unit: 'g',  pickupRatio: 0.55, refillX: null },
            { customName: 'Cheese selection',        amountPerGuest: 40,  unit: 'g',  pickupRatio: 0.35, refillX: null },
          ]},
          { name: 'Hot', type: 'hot', items: [
            { customName: 'Scrambled eggs', amountPerGuest: 80, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Pork sausages',  amountPerGuest: 60, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Hash browns',    amountPerGuest: 70, unit: 'g', pickupRatio: 0.75, refillX: null },
          ]},
          { name: 'Bakery', type: 'bakery', items: [
            { customName: 'Croissants',       amountPerGuest: 1, unit: 'pcs',   pickupRatio: 0.80, refillX: null },
            { customName: 'Sourdough slices', amountPerGuest: 2, unit: 'slice', pickupRatio: 0.60, refillX: null },
            { customName: 'Mini pastries',    amountPerGuest: 1, unit: 'pcs',   pickupRatio: 0.50, refillX: null },
          ]},
          { name: 'Beverage', type: 'beverage', items: [
            { customName: 'Filter coffee',  amountPerGuest: 200, unit: 'ml', pickupRatio: 0.95, refillX: null },
            { customName: 'Orange juice',   amountPerGuest: 150, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Tea selection',  amountPerGuest: 100, unit: 'ml', pickupRatio: 0.65, refillX: null },
          ]},
        ],
      },
    },
    {
      id: 'mediterranean',
      icon: '🌿',
      nameKey: 'buffet_preset_mediterranean',
      descKey: 'buffet_preset_mediterranean_desc',
      template: {
        name: 'Mediterranean Lunch',
        type: 'lunch',
        coverCount: 100, ticketPrice: 48, durationHours: 2, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Mezze', type: 'cold', items: [
            { customName: 'Hummus',         amountPerGuest: 40, unit: 'g', pickupRatio: 0.60, refillX: null },
            { customName: 'Tzatziki',       amountPerGuest: 35, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Baba ganoush',   amountPerGuest: 30, unit: 'g', pickupRatio: 0.50, refillX: null },
            { customName: 'Mixed olives',   amountPerGuest: 25, unit: 'g', pickupRatio: 0.45, refillX: null },
          ]},
          { name: 'Mains', type: 'hot', items: [
            { customName: 'Grilled chicken souvlaki', amountPerGuest: 120, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Slow-roast lamb shoulder', amountPerGuest: 100, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Vegetable tagine',         amountPerGuest: 90,  unit: 'g', pickupRatio: 0.70, refillX: null },
            { customName: 'Saffron rice pilaf',       amountPerGuest: 110, unit: 'g', pickupRatio: 0.75, refillX: null },
          ]},
          { name: 'Salads', type: 'other', items: [
            { customName: 'Greek salad',  amountPerGuest: 80, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Tabouleh',     amountPerGuest: 60, unit: 'g', pickupRatio: 0.45, refillX: null },
          ]},
          { name: 'Bread', type: 'bakery', items: [
            { customName: 'Pita bread',        amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.80, refillX: null },
            { customName: 'Lavash',            amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.45, refillX: null },
          ]},
          { name: 'Beverage', type: 'beverage', items: [
            { customName: 'House lemonade',  amountPerGuest: 200, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Sparkling water', amountPerGuest: 250, unit: 'ml', pickupRatio: 0.75, refillX: null },
            { customName: 'Espresso',        amountPerGuest: 60,  unit: 'ml', pickupRatio: 0.60, refillX: null },
          ]},
        ],
      },
    },
    {
      id: 'sunday_brunch',
      icon: '🥞',
      nameKey: 'buffet_preset_sunday_brunch',
      descKey: 'buffet_preset_sunday_brunch_desc',
      template: {
        name: 'Sunday Brunch',
        type: 'brunch',
        coverCount: 80, ticketPrice: 75, durationHours: 3, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Cold seafood & charcuterie', type: 'cold', items: [
            { customName: 'Smoked salmon',          amountPerGuest: 60, unit: 'g', pickupRatio: 0.75, refillX: null },
            { customName: 'Charcuterie board',      amountPerGuest: 50, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Artisan cheese board',   amountPerGuest: 45, unit: 'g', pickupRatio: 0.45, refillX: null },
            { customName: 'Fresh fruit display',    amountPerGuest: 80, unit: 'g', pickupRatio: 0.50, refillX: null },
            { customName: 'Yogurt parfait',         amountPerGuest: 100, unit: 'g', pickupRatio: 0.70, refillX: null },
          ]},
          { name: 'Live hot station', type: 'hot', items: [
            { customName: 'Eggs Benedict (live)',   amountPerGuest: 150, unit: 'g', pickupRatio: 0.90, refillX: null },
            { customName: 'French toast',           amountPerGuest: 100, unit: 'g', pickupRatio: 0.75, refillX: null },
            { customName: 'Pan-seared salmon',      amountPerGuest: 90,  unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Slow-roast beef',        amountPerGuest: 80,  unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Streaky bacon',          amountPerGuest: 40,  unit: 'g', pickupRatio: 0.90, refillX: null },
          ]},
          { name: 'Bakery', type: 'bakery', items: [
            { customName: 'Croissants',  amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.80, refillX: null },
            { customName: 'Danish',      amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.55, refillX: null },
            { customName: 'Brioche',     amountPerGuest: 1, unit: 'slice', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Sweet finish', type: 'dessert', items: [
            { customName: 'Mini cheesecakes',     amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.65, refillX: null },
            { customName: 'Assorted macarons',    amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.55, refillX: null },
            { customName: 'Chocolate fondue',     amountPerGuest: 50, unit: 'g',  pickupRatio: 0.45, refillX: null },
          ]},
          { name: 'Beverage', type: 'beverage', items: [
            { customName: 'Sparkling wine / mimosa', amountPerGuest: 150, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Specialty coffee',        amountPerGuest: 200, unit: 'ml', pickupRatio: 0.95, refillX: null },
            { customName: 'Fresh-pressed juices',    amountPerGuest: 180, unit: 'ml', pickupRatio: 0.80, refillX: null },
            { customName: 'Filtered water',          amountPerGuest: 350, unit: 'ml', pickupRatio: 0.95, refillX: null },
          ]},
        ],
      },
    },
    // v2.8.93 — 4 additional uluslararası standart preset (operator request:
    // "makul miktarda standart buffet template" — MENA + premium banquet +
    // cocktail + outdoor BBQ kapsamı). Total 7 preset + Start blank.
    {
      id: 'iftar',
      icon: '🌙',
      nameKey: 'buffet_preset_iftar',
      descKey: 'buffet_preset_iftar_desc',
      template: {
        name: 'Iftar Buffet',
        type: 'dinner',
        coverCount: 100, ticketPrice: 45, durationHours: 2, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Suhoor / Opening', type: 'cold', items: [
            { customName: 'Medjool dates',         amountPerGuest: 30, unit: 'g', pickupRatio: 0.80, refillX: null },
            { customName: 'Dried apricots & nuts', amountPerGuest: 25, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'White cheese & olives', amountPerGuest: 50, unit: 'g', pickupRatio: 0.60, refillX: null },
            { customName: 'Cucumber & tomato slices', amountPerGuest: 80, unit: 'g', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Soups', type: 'hot', items: [
            { customName: 'Lentil soup (mercimek)', amountPerGuest: 200, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Yogurt mint soup',       amountPerGuest: 150, unit: 'ml', pickupRatio: 0.45, refillX: null },
          ]},
          { name: 'Mains', type: 'hot', items: [
            { customName: 'Lamb stew with vegetables', amountPerGuest: 150, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Chicken biryani',           amountPerGuest: 180, unit: 'g', pickupRatio: 0.80, refillX: null },
            { customName: 'Rice pilaf',                amountPerGuest: 120, unit: 'g', pickupRatio: 0.75, refillX: null },
            { customName: 'Grilled mixed vegetables',  amountPerGuest: 100, unit: 'g', pickupRatio: 0.65, refillX: null },
          ]},
          { name: 'Sweets', type: 'dessert', items: [
            { customName: 'Baklava',         amountPerGuest: 60, unit: 'g', pickupRatio: 0.75, refillX: null },
            { customName: 'Künefe',          amountPerGuest: 80, unit: 'g', pickupRatio: 0.60, refillX: null },
            { customName: 'Fresh fruit platter', amountPerGuest: 100, unit: 'g', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Beverages', type: 'beverage', items: [
            { customName: 'Cold water',     amountPerGuest: 400, unit: 'ml', pickupRatio: 0.95, refillX: null },
            { customName: 'Ayran',          amountPerGuest: 200, unit: 'ml', pickupRatio: 0.70, refillX: null },
            { customName: 'Turkish tea',    amountPerGuest: 150, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Traditional sherbet', amountPerGuest: 180, unit: 'ml', pickupRatio: 0.60, refillX: null },
          ]},
        ],
      },
    },
    {
      id: 'wedding',
      icon: '💍',
      nameKey: 'buffet_preset_wedding',
      descKey: 'buffet_preset_wedding_desc',
      template: {
        name: 'Wedding Banquet',
        type: 'dinner',
        coverCount: 200, ticketPrice: 95, durationHours: 4, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Welcome canapés', type: 'cold', items: [
            { customName: 'Smoked salmon canapé',  amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.80, refillX: null },
            { customName: 'Mini bruschetta',       amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.75, refillX: null },
            { customName: 'Cheese & charcuterie',  amountPerGuest: 40, unit: 'g', pickupRatio: 0.50, refillX: null },
            { customName: 'Mini caprese skewer',   amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.70, refillX: null },
            { customName: 'Foie gras crostini',    amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.65, refillX: null },
          ]},
          { name: 'Cold appetizers / mezze', type: 'cold', items: [
            { customName: 'Caesar salad',          amountPerGuest: 80, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Beetroot & feta salad', amountPerGuest: 60, unit: 'g', pickupRatio: 0.45, refillX: null },
            { customName: 'Marinated octopus',     amountPerGuest: 50, unit: 'g', pickupRatio: 0.60, refillX: null },
            { customName: 'Prosciutto & melon',    amountPerGuest: 40, unit: 'g', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Carving & mains', type: 'hot', items: [
            { customName: 'Roast prime rib (carving)', amountPerGuest: 180, unit: 'g', pickupRatio: 0.90, refillX: null },
            { customName: 'Pan-seared salmon fillet',  amountPerGuest: 140, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Chicken supreme',           amountPerGuest: 130, unit: 'g', pickupRatio: 0.80, refillX: null },
            { customName: 'Beef tenderloin medallion', amountPerGuest: 100, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Wild mushroom risotto',     amountPerGuest: 120, unit: 'g', pickupRatio: 0.65, refillX: null },
          ]},
          { name: 'Dessert station', type: 'dessert', items: [
            { customName: 'Wedding cake slice',  amountPerGuest: 100, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Mini éclair',         amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.55, refillX: null },
            { customName: 'Panna cotta',         amountPerGuest: 80, unit: 'g', pickupRatio: 0.50, refillX: null },
            { customName: 'Fresh seasonal berries', amountPerGuest: 60, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Chocolate fountain',  amountPerGuest: 40, unit: 'g', pickupRatio: 0.45, refillX: null },
            { customName: 'Assorted macarons',   amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.50, refillX: null },
          ]},
          { name: 'Bar & beverage', type: 'beverage', items: [
            { customName: 'Champagne toast',     amountPerGuest: 150, unit: 'ml', pickupRatio: 0.90, refillX: null },
            { customName: 'White wine',          amountPerGuest: 200, unit: 'ml', pickupRatio: 0.60, refillX: null },
            { customName: 'Red wine',            amountPerGuest: 200, unit: 'ml', pickupRatio: 0.55, refillX: null },
            { customName: 'Beer (craft selection)', amountPerGuest: 250, unit: 'ml', pickupRatio: 0.50, refillX: null },
          ]},
        ],
      },
    },
    {
      id: 'cocktail',
      icon: '🍸',
      nameKey: 'buffet_preset_cocktail',
      descKey: 'buffet_preset_cocktail_desc',
      template: {
        name: 'Cocktail Reception',
        type: 'cocktail',
        coverCount: 80, ticketPrice: 55, durationHours: 2, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Passed canapés (cold)', type: 'cold', items: [
            { customName: 'Smoked salmon blini',         amountPerGuest: 3, unit: 'pcs', pickupRatio: 0.85, refillX: null },
            { customName: 'Prawn cocktail shot',         amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.80, refillX: null },
            { customName: 'Beef carpaccio crostini',     amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.75, refillX: null },
            { customName: 'Vegetable spring roll',       amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.70, refillX: null },
          ]},
          { name: 'Live hot station', type: 'hot', items: [
            { customName: 'Mini wagyu slider',       amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.90, refillX: null },
            { customName: 'Tempura prawn',           amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.85, refillX: null },
            { customName: 'Mini beef meatball',      amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.80, refillX: null },
            { customName: 'Truffle arancini',        amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.75, refillX: null },
          ]},
          { name: 'Sweet bites', type: 'dessert', items: [
            { customName: 'Mini cupcakes',     amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.65, refillX: null },
            { customName: 'Macarons',          amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.55, refillX: null },
            { customName: 'Chocolate truffles', amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.50, refillX: null },
          ]},
          { name: 'Bar', type: 'beverage', items: [
            { customName: 'Signature cocktail',  amountPerGuest: 150, unit: 'ml', pickupRatio: 0.85, refillX: null },
            { customName: 'Prosecco',            amountPerGuest: 150, unit: 'ml', pickupRatio: 0.70, refillX: null },
            { customName: 'Craft beer',          amountPerGuest: 250, unit: 'ml', pickupRatio: 0.55, refillX: null },
            { customName: 'Sparkling water',     amountPerGuest: 250, unit: 'ml', pickupRatio: 0.75, refillX: null },
          ]},
        ],
      },
    },
    {
      id: 'bbq',
      icon: '🔥',
      nameKey: 'buffet_preset_bbq',
      descKey: 'buffet_preset_bbq_desc',
      template: {
        name: 'BBQ / Grill Buffet',
        type: 'dinner',
        coverCount: 80, ticketPrice: 50, durationHours: 2.5, refillMultiplier: null, notes: '',
        stations: [
          { name: 'Salads & sides', type: 'cold', items: [
            { customName: 'Coleslaw',                amountPerGuest: 70, unit: 'g', pickupRatio: 0.60, refillX: null },
            { customName: 'Potato salad',            amountPerGuest: 90, unit: 'g', pickupRatio: 0.70, refillX: null },
            { customName: 'Grilled vegetable salad', amountPerGuest: 80, unit: 'g', pickupRatio: 0.55, refillX: null },
            { customName: 'Corn on the cob',         amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.75, refillX: null },
          ]},
          { name: 'Grill station', type: 'hot', items: [
            { customName: 'Beef burger patty',         amountPerGuest: 150, unit: 'g', pickupRatio: 0.90, refillX: null },
            { customName: 'Marinated chicken thigh',   amountPerGuest: 130, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Lamb chops',                amountPerGuest: 120, unit: 'g', pickupRatio: 0.85, refillX: null },
            { customName: 'Pork sausages',             amountPerGuest: 80, unit: 'g', pickupRatio: 0.80, refillX: null },
            { customName: 'Grilled fish fillet',       amountPerGuest: 120, unit: 'g', pickupRatio: 0.70, refillX: null },
          ]},
          { name: 'Condiments & breads', type: 'bakery', items: [
            { customName: 'Burger buns',     amountPerGuest: 2, unit: 'pcs', pickupRatio: 0.85, refillX: null },
            { customName: 'Garlic bread',    amountPerGuest: 60, unit: 'g', pickupRatio: 0.65, refillX: null },
            { customName: 'BBQ sauce selection', amountPerGuest: 25, unit: 'g', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Beverage', type: 'beverage', items: [
            { customName: 'Craft beer',      amountPerGuest: 330, unit: 'ml', pickupRatio: 0.70, refillX: null },
            { customName: 'House lemonade',  amountPerGuest: 200, unit: 'ml', pickupRatio: 0.80, refillX: null },
          ]},
        ],
      },
    },
  ];

  // ---------- IDB STORAGE (workspace-scoped) ----------
  // v2.9.17 — Cloud sync wire (waste pattern):
  //   readBuffetsAll()  → raw, _deletedAt tombstone'lar dahil
  //   readBuffets()     → görünür, soft-delete filtered (UI render için)
  //   writeBuffets()    → queueArraySync ile cloud'a push
  //   deleteBuffet()    → soft-delete (tombstone bırakır)

  function readBuffetsAll() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('buffets') || {};
    if (Array.isArray(root)) return root; // legacy flat
    return root[wsId] || [];
  }

  function readBuffets() {
    return readBuffetsAll().filter(function (b) { return !b._deletedAt; });
  }

  function writeBuffets(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('buffets') || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    const oldArr = Array.isArray(root) ? root : (root[wsId] || []);
    next[wsId] = arr;
    PCD.store.set('buffets', next);
    // v2.9.17 — Cloud sync (array tablo, soft-delete pattern)
    if (PCD.cloudPerTable) {
      PCD.cloudPerTable.queueArraySync('buffets', wsId, oldArr, arr);
    }
  }

  function getBuffet(id) {
    return readBuffets().find(function (b) { return b.id === id; }) || null;
  }

  function upsertBuffet(b) {
    const all = readBuffetsAll().slice(); // soft-delete pattern: tombstones must persist through diff
    if (b.id) {
      const i = all.findIndex(function (x) { return x.id === b.id; });
      if (i >= 0) all[i] = Object.assign({}, b, { updatedAt: new Date().toISOString() });
      else all.push(Object.assign({}, b, { updatedAt: new Date().toISOString() }));
    } else {
      b.id = PCD.uid('bf');
      b.createdAt = new Date().toISOString();
      b.updatedAt = b.createdAt;
      all.push(b);
    }
    writeBuffets(all);
    return b;
  }

  function deleteBuffet(id) {
    // v2.9.17 — Soft-delete: tombstone bırak, queueArraySync UPSERT atar
    const all = readBuffetsAll().slice();
    const idx = all.findIndex(function (b) { return b.id === id; });
    if (idx !== -1) {
      all[idx] = Object.assign({}, all[idx], { _deletedAt: new Date().toISOString() });
      writeBuffets(all);
    }
  }

  // ---------- COST HESAP ----------

  // Bir buffet item'ının prep miktarı + cost'unu hesaplar.
  // v2.8.79 — 3 item tipi: (1) recipe-bound, (2) ingredient-bound, (3) custom name only.
  // ingredient-bound: ing.pricePerUnit × prep amount (sub-recipe cost cascade yok).
  // custom name only: cost = 0 (chef sadece "label" eklemiş, fiyat girmemiş).
  function computeItemCost(item, recipe, ingMap, recipeMap, coverCount, refillX, ingredient) {
    if (!item) return { prepAmount: 0, prepCost: 0, expectedConsume: 0, expectedWaste: 0, wastePct: 0 };
    const perGuest = Number(item.amountPerGuest) || 0;
    const pickup = item.pickupRatio != null ? Number(item.pickupRatio) : 0.6;
    const itemRefill = item.refillX != null ? Number(item.refillX) : refillX;
    // Total preparation: covers × per_guest × refill_multiplier
    const prepAmount = coverCount * perGuest * itemRefill;
    const expectedConsume = coverCount * perGuest * pickup;

    // === Path A: ingredient-bound item ===
    if (item.ingredientId && ingredient) {
      const pricePerUnit = Number(ingredient.pricePerUnit) || 0;
      // Apply yield% (e.g. lamb shoulder 62% yield → true price = price / 0.62)
      const yld = Number(ingredient.yieldPercent);
      const effectivePrice = (yld && yld > 0 && yld < 100) ? pricePerUnit / (yld / 100) : pricePerUnit;
      let prepInIngUnit = prepAmount;
      let consumeInIngUnit = expectedConsume;
      if (item.unit && ingredient.unit && item.unit !== ingredient.unit) {
        try { prepInIngUnit = PCD.convertUnit(prepAmount, item.unit, ingredient.unit); } catch (e) {}
        try { consumeInIngUnit = PCD.convertUnit(expectedConsume, item.unit, ingredient.unit); } catch (e) {}
      }
      const prepCost = effectivePrice * prepInIngUnit;
      const consumeCost = effectivePrice * consumeInIngUnit;
      const expectedWaste = Math.max(0, prepCost - consumeCost);
      return {
        prepAmount: prepAmount, prepCost: prepCost,
        expectedConsume: expectedConsume, expectedConsumeCost: consumeCost,
        expectedWaste: expectedWaste,
        wastePct: prepCost > 0 ? (expectedWaste / prepCost) * 100 : 0,
      };
    }

    // === Path B: recipe-bound item ===
    if (item.recipeId && recipe) {
      const recipeYield = Number(recipe.yieldAmount) || Number(recipe.servings) || 1;
      const totalRecipeCost = PCD.recipes.computeFoodCost(recipe, ingMap, recipeMap);
      const costPerUnit = totalRecipeCost / (recipeYield || 1);
      let prepAmountInRecipeUnit = prepAmount;
      if (item.unit && recipe.yieldUnit && item.unit !== recipe.yieldUnit) {
        try { prepAmountInRecipeUnit = PCD.convertUnit(prepAmount, item.unit, recipe.yieldUnit); } catch (e) {}
      }
      const prepCost = costPerUnit * prepAmountInRecipeUnit;
      const expectedConsumeInRecipeUnit = (function () {
        if (item.unit && recipe.yieldUnit && item.unit !== recipe.yieldUnit) {
          try { return PCD.convertUnit(expectedConsume, item.unit, recipe.yieldUnit); } catch (e) {}
        }
        return expectedConsume;
      })();
      const consumeCost = costPerUnit * expectedConsumeInRecipeUnit;
      const expectedWaste = Math.max(0, prepCost - consumeCost);
      return {
        prepAmount: prepAmount, prepCost: prepCost,
        expectedConsume: expectedConsume, expectedConsumeCost: consumeCost,
        expectedWaste: expectedWaste,
        wastePct: prepCost > 0 ? (expectedWaste / prepCost) * 100 : 0,
      };
    }

    // === Path C: custom-name item (no recipe, no ingredient) → 0 cost ===
    return {
      prepAmount: prepAmount, prepCost: 0,
      expectedConsume: expectedConsume, expectedConsumeCost: 0,
      expectedWaste: 0, wastePct: 0,
    };
  }

  // Buffet-bütünü totals.
  function computeBuffetTotals(buffet, ingMap, recipeMap) {
    const coverCount = Number(buffet.coverCount) || 0;
    const ticketPrice = Number(buffet.ticketPrice) || 0;
    const refillX = buffet.refillMultiplier != null
      ? Number(buffet.refillMultiplier)
      : (INDUSTRY_REFILL[buffet.type] || INDUSTRY_REFILL.custom);
    let totalPrepCost = 0;
    let totalExpectedWaste = 0;
    let itemCount = 0;
    (buffet.stations || []).forEach(function (st) {
      (st.items || []).forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const ing = it.ingredientId ? ingMap[it.ingredientId] : null;
        // v2.8.79 — 3 path: recipe, ingredient, or custom (no cost)
        if (!r && !ing && !it.customName) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, coverCount, refillX, ing);
        totalPrepCost += c.prepCost;
        totalExpectedWaste += c.expectedWaste;
        itemCount++;
      });
    });
    const revenue = coverCount * ticketPrice;
    const perGuestCost = coverCount > 0 ? totalPrepCost / coverCount : 0;
    const foodCostPct = revenue > 0 ? (totalPrepCost / revenue) * 100 : 0;
    const profitPerCover = ticketPrice - perGuestCost;
    const targets = INDUSTRY_TARGETS[buffet.type] || INDUSTRY_TARGETS.custom;
    return {
      coverCount: coverCount,
      ticketPrice: ticketPrice,
      revenue: revenue,
      totalPrepCost: totalPrepCost,
      totalExpectedWaste: totalExpectedWaste,
      perGuestCost: perGuestCost,
      foodCostPct: foodCostPct,
      profitPerCover: profitPerCover,
      itemCount: itemCount,
      refillX: refillX,
      targets: targets,
      // status: 'good' | 'warn' | 'bad'
      status: foodCostPct <= targets.good ? 'good' : (foodCostPct <= targets.warn ? 'warn' : 'bad'),
    };
  }

  function statusColor(s) {
    if (s === 'good') return '#16a34a';
    if (s === 'warn') return '#f59e0b';
    return '#dc2626';
  }

  // v2.8.88 — Status label (i18n) — Stats hero card primary metric'in altında
  // "Good" / "Watch" / "Over budget" chip olarak gösterilir.
  function statusLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'good') return t('buffet_status_good') || 'Good';
    if (s === 'warn') return t('buffet_status_warn') || 'Watch';
    return t('buffet_status_over') || 'Over budget';
  }

  // ---------- LIST VIEW ----------

  function render(view) {
    const t = PCD.i18n.t;
    const buffets = readBuffets().slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('buffet_title') || 'Buffet Planner'}</div>
          <div class="page-subtitle">${buffets.length} ${buffets.length === 1 ? (t('buffet_single') || 'buffet') : (t('buffet_plural') || 'buffets')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newBuffetBtn">+ ${t('buffet_new') || 'New Buffet'}</button>
        </div>
      </div>
      ${buffets.length > 1 ? `
        <div class="searchbar mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>
          <input type="search" id="bufSearch" placeholder="${PCD.escapeHtml(t('buffet_search_placeholder') || 'Search by name, type, or date…')}" autocomplete="off">
        </div>
      ` : ''}
      <div id="buffetList"></div>
    `;

    const listEl = PCD.$('#buffetList', view);
    if (buffets.length === 0) {
      listEl.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🥘</div>' +
          '<div class="empty-title">' + PCD.escapeHtml(t('buffet_empty_title') || 'No buffets yet') + '</div>' +
          '<div class="empty-desc">' + PCD.escapeHtml(t('buffet_empty_desc') || 'Plan your next breakfast, brunch, or catering buffet. Hotel-standard cost + waste calculations built-in.') + '</div>' +
          '<div class="empty-action"><button class="btn btn-primary" id="emptyNewBuffet">+ ' + PCD.escapeHtml(t('buffet_new') || 'New Buffet') + '</button></div>' +
        '</div>';
      const eb = PCD.$('#emptyNewBuffet', listEl);
      if (eb) eb.addEventListener('click', function () { openPresetChooser(view); });
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      buffets.forEach(function (b) {
        const totals = computeBuffetTotals(b, ingMap, recipeMap);
        const dateStr = b.serviceDate ? PCD.fmtDate(b.serviceDate) : '—';
        const typeLabel = (BUFFET_TYPES.find(function (x) { return x.id === b.type; }) || {});
        // v2.8.88 — Renkli sol kenarlık (food cost % status'a göre yeşil/sarı/kırmızı)
        // — listede gözden geçirilirken hangi buffet'in margin'i tehlikede anında belli.
        const row = PCD.el('div', { class: 'list-item', 'data-bid': b.id,
          'data-buf-name': (b.name || '').toLowerCase(),
          style: { cursor: 'pointer', borderLeft: '4px solid ' + statusColor(totals.status) } });
        row.innerHTML =
          '<div class="list-item-thumb" style="background:' + statusColor(totals.status) + '20;color:' + statusColor(totals.status) + ';font-weight:700;font-size:14px;">' + totals.foodCostPct.toFixed(0) + '%</div>' +
          '<div class="list-item-body">' +
            '<div class="list-item-title">' + PCD.escapeHtml(b.name || t('untitled')) + '</div>' +
            '<div class="list-item-meta">' +
              '<span>' + PCD.escapeHtml(t(typeLabel.labelKey) || b.type || '—') + '</span>' +
              '<span>·</span>' +
              '<span>' + totals.coverCount + ' ' + PCD.escapeHtml(t('buffet_covers') || 'covers') + '</span>' +
              '<span>·</span>' +
              '<span>' + dateStr + '</span>' +
              '<span>·</span>' +
              '<span style="font-weight:700;color:' + statusColor(totals.status) + ';">' + PCD.fmtMoney(totals.totalPrepCost) + '</span>' +
            '</div>' +
          '</div>' +
          // v2.8.86 — Liste kartında Prep / PDF (Cost Report) / Excel butonları
          // (operatör: "kaydedilmiş büfelerde de cost report, pdf ve excel olmalı").
          // Editor açmadan doğrudan print/export. Mobile'da sığması için kompakt.
          '<button type="button" class="icon-btn" data-buf-prep="' + b.id + '" title="' + PCD.escapeHtml(t('buffet_print_prep') || 'Prep List') + '">' + PCD.icon('list', 18) + '</button>' +
          '<button type="button" class="icon-btn" data-buf-pdf="' + b.id + '" title="' + PCD.escapeHtml(t('buffet_print_report') || 'Cost Report') + '">' + PCD.icon('print', 18) + '</button>' +
          '<button type="button" class="icon-btn" data-buf-excel="' + b.id + '" title="Excel">' + PCD.icon('book-open', 18) + '</button>' +
          '<button type="button" class="icon-btn" data-buf-dup="' + b.id + '" title="' + PCD.escapeHtml(t('buffet_duplicate') || 'Duplicate') + '">' + PCD.icon('copy', 18) + '</button>' +
          '<button type="button" class="icon-btn" data-buf-edit="' + b.id + '" title="' + PCD.escapeHtml(t('edit') || 'Edit') + '">' + PCD.icon('edit', 18) + '</button>';
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    // v2.8.89 — "+ New Buffet" tıklayınca preset chooser modal aç (4 seçenek:
    // Continental / Mediterranean / Sunday Brunch / Start blank). Eski direkt
    // openEditor() yerine. Boş empty-state'teki buton da aynı chooser'a gider.
    PCD.$('#newBuffetBtn', view).addEventListener('click', function () { openPresetChooser(view); });
    // v2.8.88 — Liste search (case-insensitive substring filter, name + type + date)
    const bufSearch = PCD.$('#bufSearch', view);
    if (bufSearch) {
      bufSearch.addEventListener('input', function () {
        const q = (this.value || '').toLowerCase().trim();
        const rows = listEl.querySelectorAll('[data-bid]');
        rows.forEach(function (row) {
          const hay = (row.getAttribute('data-buf-name') || '') + ' ' +
                      (row.querySelector('.list-item-meta')?.textContent || '').toLowerCase();
          row.style.display = (!q || hay.indexOf(q) >= 0) ? '' : 'none';
        });
      });
    }
    PCD.on(listEl, 'click', '[data-bid]', function (e) {
      // v2.8.86 — Edit/Dup butonları + yeni Prep/PDF/Excel butonları satır click'i tetiklemesin
      if (e.target.closest('[data-buf-edit]') || e.target.closest('[data-buf-dup]') ||
          e.target.closest('[data-buf-prep]') || e.target.closest('[data-buf-pdf]') ||
          e.target.closest('[data-buf-excel]')) return;
      openEditor(this.getAttribute('data-bid'));
    });
    PCD.on(listEl, 'click', '[data-buf-edit]', function (e) {
      e.stopPropagation();
      openEditor(this.getAttribute('data-buf-edit'));
    });
    // v2.8.86 — Liste kartından direkt print/export (editor açmadan)
    PCD.on(listEl, 'click', '[data-buf-prep]', function (e) {
      e.stopPropagation();
      const b = getBuffet(this.getAttribute('data-buf-prep'));
      if (b) printPrepList(b);
    });
    PCD.on(listEl, 'click', '[data-buf-pdf]', function (e) {
      e.stopPropagation();
      const b = getBuffet(this.getAttribute('data-buf-pdf'));
      if (b) printCostReport(b);
    });
    PCD.on(listEl, 'click', '[data-buf-excel]', function (e) {
      e.stopPropagation();
      const b = getBuffet(this.getAttribute('data-buf-excel'));
      if (b) exportBuffetXLSX(b);
    });
    PCD.on(listEl, 'click', '[data-buf-dup]', function (e) {
      e.stopPropagation();
      const src = getBuffet(this.getAttribute('data-buf-dup'));
      if (!src) return;
      const copy = PCD.clone(src);
      delete copy.id; delete copy.createdAt; delete copy.updatedAt;
      copy.name = (copy.name || t('untitled')) + ' (Copy)';
      (copy.stations || []).forEach(function (st) {
        st.id = PCD.uid('bst');
        (st.items || []).forEach(function (it) { it.id = PCD.uid('bit'); });
      });
      const saved = upsertBuffet(copy);
      PCD.toast.success(t('buffet_duplicated') || 'Buffet duplicated');
      render(view);
      setTimeout(function () { openEditor(saved.id); }, 200);
    });
  }

  // ---------- PRESET CHOOSER (v2.8.89) ----------
  // "+ New Buffet" tıklaması açar. 4 seçenek:
  //   1) 🥐 Continental Breakfast — 60 cover · $30 · 12 item
  //   2) 🌿 Mediterranean Lunch    — 100 cover · $48 · 16 item
  //   3) 🥞 Sunday Brunch           — 80 cover · $75 · 20 item
  //   4) ✨ Start blank             — mevcut openEditor() akışı
  //
  // Preset seçilince: template clone'lanır, yeni uid'ler atanır (buffet/station/
  // item), upsertBuffet ile kaydedilir, sonra editor o id ile açılır. Şef
  // anında item'ları görür, kendi recipe/ingredient'larıyla bağlayabilir.
  function openPresetChooser(view) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm mb-3" style="font-size:13px;line-height:1.5;">' +
        PCD.escapeHtml(t('buffet_chooser_intro') || 'Pick a ready-to-edit template, or start with a blank buffet. All template items are placeholders — link them to your recipes or ingredients afterwards.') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">' +
        PRESETS.map(function (p) {
          const itemCount = p.template.stations.reduce(function (n, st) { return n + (st.items || []).length; }, 0);
          const stationCount = p.template.stations.length;
          return '<button type="button" class="card card-hover" data-preset="' + p.id + '" style="padding:14px;text-align:left;cursor:pointer;border:1px solid var(--border);background:var(--surface);">' +
              '<div style="font-size:34px;line-height:1;margin-bottom:8px;">' + p.icon + '</div>' +
              '<div style="font-weight:700;font-size:14px;margin-bottom:4px;letter-spacing:-0.01em;">' + PCD.escapeHtml(t(p.nameKey) || p.template.name) + '</div>' +
              '<div class="text-muted text-sm" style="font-size:11px;line-height:1.5;margin-bottom:8px;color:var(--text-3);">' + PCD.escapeHtml(t(p.descKey) || '') + '</div>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-3);">' +
                '<span style="padding:2px 7px;background:var(--surface-2);border-radius:999px;font-weight:600;">' + p.template.coverCount + ' ' + PCD.escapeHtml(t('buffet_covers') || 'covers') + '</span>' +
                '<span style="padding:2px 7px;background:var(--surface-2);border-radius:999px;font-weight:600;">' + PCD.fmtMoney(p.template.ticketPrice) + '</span>' +
                '<span style="padding:2px 7px;background:var(--surface-2);border-radius:999px;font-weight:600;">' + stationCount + '+' + itemCount + ' ' + PCD.escapeHtml(t('buffet_chooser_items_label') || 'items') + '</span>' +
              '</div>' +
            '</button>';
        }).join('') +
        // Start blank — daha sade card
        '<button type="button" class="card card-hover" data-preset="__blank__" style="padding:14px;text-align:left;cursor:pointer;border:1px dashed var(--border-strong);background:var(--surface-2);">' +
          '<div style="font-size:34px;line-height:1;margin-bottom:8px;opacity:0.6;">✨</div>' +
          '<div style="font-weight:700;font-size:14px;margin-bottom:4px;letter-spacing:-0.01em;">' + PCD.escapeHtml(t('buffet_start_blank') || 'Start blank') + '</div>' +
          '<div class="text-muted text-sm" style="font-size:11px;line-height:1.5;color:var(--text-3);">' + PCD.escapeHtml(t('buffet_start_blank_desc') || 'Empty buffet, add your own stations and items from scratch.') + '</div>' +
        '</button>' +
      '</div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(cancelBtn);

    const m = PCD.modal.open({
      title: t('buffet_chooser_title') || 'Start a new buffet',
      body: body, footer: footer, size: 'lg', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-preset]', function () {
      const pid = this.getAttribute('data-preset');
      m.close();
      if (pid === '__blank__') {
        setTimeout(function () { openEditor(); }, 150);
        return;
      }
      const preset = PRESETS.find(function (p) { return p.id === pid; });
      if (!preset) { openEditor(); return; }
      // Clone template + yeni uid'ler
      const clone = PCD.clone(preset.template);
      // Lokalize edilmiş name (var ise) — chef sonra düzenleyebilir
      const localName = t(preset.nameKey);
      if (localName && localName !== preset.nameKey) clone.name = localName;
      clone.serviceDate = new Date().toISOString().slice(0, 10);
      (clone.stations || []).forEach(function (st) {
        st.id = PCD.uid('bst');
        (st.items || []).forEach(function (it) { it.id = PCD.uid('bit'); });
      });
      const saved = upsertBuffet(clone);
      PCD.toast.success(t('buffet_preset_loaded') || 'Template loaded — customize and save');
      setTimeout(function () { openEditor(saved.id); }, 150);
    });
  }

  // ---------- EDITOR ----------

  function openEditor(bid) {
    const t = PCD.i18n.t;
    const existing = bid ? getBuffet(bid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '',
      type: 'breakfast',
      coverCount: 50,
      ticketPrice: 45,
      serviceDate: new Date().toISOString().slice(0, 10),
      durationHours: 2.5,
      refillMultiplier: null,  // null = use industry default for type
      notes: '',
      stations: STATION_TYPES.slice(0, 3).map(function (st) {  // cold, hot, bakery by default
        return { id: PCD.uid('bst'), name: PCD.i18n.t(st.labelKey) || st.id, type: st.id, items: [] };
      }),
    };
    // Defansif: eski buffet'lerde eksik field'lar
    if (!Array.isArray(data.stations)) data.stations = [];
    data.stations.forEach(function (st) {
      if (!st.id) st.id = PCD.uid('bst');
      if (!Array.isArray(st.items)) st.items = [];
      st.items.forEach(function (it) { if (!it.id) it.id = PCD.uid('bit'); });
    });

    const body = PCD.el('div');

    function refreshTotals() {
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = PCD.recipes.buildRecipeMap();
      return computeBuffetTotals(data, ingMap, recipeMap);
    }

    function renderEditor() {
      // v2.8.79 — Focus capture pre-render. Sorun: numeric input handler debounce
      // sonrası renderEditor full innerHTML rebuild yapıyordu → kullanıcı "2"
      // yazıp duraklayınca focus kayboluyor, "20" yazamıyor. Çözüm: render
      // öncesi aktif input'un cursor + value pozisyonunu sakla, render sonrası
      // aynı `data-` attribute'una sahip yeni elementi bul + focus + setSelectionRange.
      const _active = document.activeElement;
      let _restoreFocus = null;
      if (_active && body.contains(_active)) {
        // v2.8.82 — `data-buf-field` eklendi: bufCovers/bufPrice/bufRefill üst form
        // input'larında focus restoration. Eskiden bu üç input listede yoktu →
        // operatör "20" yazmaya başlayınca render rebuild focus'u atıyordu.
        const _attrs = ['data-it-amt', 'data-it-pickup', 'data-it-unit', 'data-st-name', 'data-st-type', 'data-it-custom-name', 'data-buf-field'];
        for (let k = 0; k < _attrs.length; k++) {
          const v = _active.getAttribute(_attrs[k]);
          if (v != null) {
            _restoreFocus = {
              attr: _attrs[k], value: v,
              start: (_active.selectionStart != null) ? _active.selectionStart : null,
              end:   (_active.selectionEnd != null)   ? _active.selectionEnd   : null,
            };
            break;
          }
        }
      }

      const totals = refreshTotals();
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = PCD.recipes.buildRecipeMap();
      const refillForType = INDUSTRY_REFILL[data.type] || INDUSTRY_REFILL.custom;
      const refillEffective = data.refillMultiplier != null ? Number(data.refillMultiplier) : refillForType;
      const typeOptions = BUFFET_TYPES.map(function (bt) {
        return '<option value="' + bt.id + '"' + (data.type === bt.id ? ' selected' : '') + '>' + PCD.escapeHtml(PCD.i18n.t(bt.labelKey) || bt.id) + '</option>';
      }).join('');

      // v2.8.77 — Inline guide panel. Closable; preference persisted in
       // localStorage so a returning chef doesn't see it again unless they
       // explicitly re-open. Helps first-time users understand the workflow.
      const guideHidden = (function () {
        try { return localStorage.getItem('pcd_buffet_guide_hidden') === '1'; } catch (e) { return false; }
      })();

      body.innerHTML = `
        ${!guideHidden ? `
          <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
            <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
              <span style="font-size:16px;">💡</span>
              <span style="flex:1;">${PCD.escapeHtml(t('buffet_guide_title') || 'How to use the Buffet Planner')}</span>
              <button type="button" id="bufGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('buffet_guide_dismiss') || 'Hide')}">✕</button>
            </summary>
            <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
              <ol style="margin:0;padding-inline-start:20px;">
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step1_title') || 'Set the basics')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step1_body') || 'Name (e.g. "Sunday Brunch — 5 Star"), type (breakfast/brunch/lunch/dinner/cocktail), guest count, ticket price per cover. The system loads industry-default refill and target food cost % automatically.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step2_title') || 'Add stations + items')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step2_body') || 'Each section of the buffet (Cold, Hot, Bakery...) is a station. Inside a station, pick recipes from your library. Sub-recipes (e.g. labneh) auto-cascade to real ingredients in shopping list + cost.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step3_title') || 'Tune per-guest amounts')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step3_body') || 'For each item: how many grams/ml per guest, and the realistic pickup % (what fraction actually gets eaten). Defaults follow hotel industry norms — adjust to your venue history.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step4_title') || 'Check the numbers')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step4_body') || 'Live stats panel shows food cost %, per-cover cost, and expected waste. Green = on target, amber = warning, red = bleeding. Adjust portion or price to land in the green.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step5_title') || 'Print the outputs')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step5_body') || 'Prep List = A4 for the kitchen (item + amount + checkbox per row, station-grouped). Cost Report = chef P&L summary with per-station breakdown + waste projection.')}</li>
              </ol>
              <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
                <strong>💎 ${PCD.escapeHtml(t('buffet_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('buffet_guide_tip_body') || 'After the first run, duplicate the buffet for next week and just change the date + cover count. Your station setup and portions stay locked in.')}
              </div>
            </div>
          </details>
        ` : ''}

        <div class="field">
          <label class="field-label">${t('buffet_name_label') || 'Buffet name'} *</label>
          <div class="text-muted text-sm" style="font-size:12px;margin-bottom:4px;">${PCD.escapeHtml(t('buffet_name_help') || 'A short, recognisable label. Shown in the buffet list and on printed sheets.')}</div>
          <input type="text" class="input" id="bufName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${PCD.escapeHtml(t('buffet_name_ph') || 'e.g. Sunday Brunch — 5 Star')}">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field">
            <label class="field-label">${t('buffet_type_label') || 'Type'}</label>
            <select class="select" id="bufType">${typeOptions}</select>
          </div>
          <div class="field">
            <label class="field-label">${t('buffet_date_label') || 'Service date'}</label>
            <input type="date" class="input" id="bufDate" value="${PCD.escapeHtml(data.serviceDate || '')}">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="field">
            <label class="field-label">${t('buffet_covers_label') || 'Covers (guests)'}</label>
            <input type="number" class="input" id="bufCovers" data-buf-field="coverCount" value="${data.coverCount}" min="1" step="1">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('buffet_covers_help') || 'Expected paying guests. Drives all prep calculations.')}</div>
          </div>
          <div class="field">
            <label class="field-label">${t('buffet_price_label') || 'Ticket price'}</label>
            <input type="number" class="input" id="bufPrice" data-buf-field="ticketPrice" value="${data.ticketPrice}" min="0" step="0.01">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('buffet_price_help') || 'Per-guest flat price. Used for revenue + food cost % targeting.')}</div>
          </div>
          <div class="field">
            <label class="field-label" title="${PCD.escapeHtml(t('buffet_refill_hint') || 'How much to over-prep for refills. Industry default by type. Override for tight events.')}">${t('buffet_refill_label') || 'Refill ×'}</label>
            <input type="number" class="input" id="bufRefill" data-buf-field="refillMultiplier" value="${refillEffective}" min="1" step="0.05" placeholder="${refillForType}">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${(t('buffet_refill_default') || 'Industry default for')} ${PCD.escapeHtml(t((BUFFET_TYPES.find(function(x){return x.id===data.type;})||{}).labelKey) || data.type)}: ${refillForType}× · ${PCD.escapeHtml(t('buffet_refill_help_short') || 'Higher = safer (less stockout), more waste')}</div>
          </div>
        </div>

        <!-- v2.8.88 — Stats hero refactor: primary metric (Food cost %) hero,
             secondary 5 metric grid altında. Apple Health / Stripe dashboard
             hissi. Eski 6 metric tek grid çok yassı görünüyordu. -->
        <div class="stat mb-3" style="background:linear-gradient(135deg,${statusColor(totals.status)}18,var(--surface));border-color:${statusColor(totals.status)};padding:18px;">
          <!-- Hero: Food cost % primary -->
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${t('buffet_stat_food_cost_pct') || 'Food cost %'}</div>
              <div style="font-size:42px;font-weight:900;color:${statusColor(totals.status)};line-height:1;letter-spacing:-0.02em;">
                ${totals.foodCostPct.toFixed(1)}<span style="font-size:24px;">%</span>
              </div>
            </div>
            <div style="flex:1;min-width:180px;">
              <span style="display:inline-block;padding:4px 10px;background:${statusColor(totals.status)}25;color:${statusColor(totals.status)};font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">
                ${PCD.escapeHtml(statusLabel(totals.status))}
              </span>
              <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">
                ${PCD.escapeHtml(t('buffet_target') || 'Target')}: ≤${totals.targets.good}% ${PCD.escapeHtml(t('buffet_status_good') || 'good')} · ≤${totals.targets.warn}% ${PCD.escapeHtml(t('buffet_status_warn') || 'watch')}
              </div>
            </div>
          </div>

          <!-- Secondary: 5 metric grid -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:10px;border-top:1px solid var(--border);padding-top:12px;">
            <div>
              <div class="stat-label">${t('buffet_stat_revenue') || 'Revenue'}</div>
              <div style="font-size:16px;font-weight:700;">${PCD.fmtMoney(totals.revenue)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_total_cost') || 'Spread cost'}</div>
              <div style="font-size:16px;font-weight:700;">${PCD.fmtMoney(totals.totalPrepCost)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_per_cover') || 'Per cover'}</div>
              <div style="font-size:16px;font-weight:700;">${PCD.fmtMoney(totals.perGuestCost)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_profit') || 'Profit / cover'}</div>
              <div style="font-size:16px;font-weight:700;color:${totals.profitPerCover > 0 ? 'var(--success)' : 'var(--danger)'};">${PCD.fmtMoney(totals.profitPerCover)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_waste') || 'Expected waste'}</div>
              <div style="font-size:16px;font-weight:700;color:var(--text-3);">${PCD.fmtMoney(totals.totalExpectedWaste)}</div>
            </div>
          </div>
        </div>

        <!-- Stations -->
        <div class="section" style="margin-bottom:14px;">
          <div class="section-header">
            <div class="section-title">${t('buffet_stations_title') || 'Stations'}</div>
            <button class="btn btn-outline btn-sm" id="addStationBtn">+ ${t('buffet_add_station') || 'Add Station'}</button>
          </div>
          <div class="text-muted text-sm" style="font-size:12px;margin-bottom:8px;">${PCD.escapeHtml(t('buffet_stations_help') || 'A station = a physical section of the buffet (Cold Items, Hot Items, Bakery...). Inside, add recipes with per-guest amounts.')}</div>
          <div id="bufStationsList" class="flex flex-col gap-3"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('buffet_notes_label') || 'Notes (chef memo, allergen alerts, VIP)'}</label>
          <textarea class="textarea" id="bufNotes" rows="2">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>
      `;

      // Render each station
      const stListEl = PCD.$('#bufStationsList', body);
      if (data.stations.length === 0) {
        stListEl.innerHTML = '<div class="card" style="padding:18px;text-align:center;color:var(--text-3);font-size:13px;line-height:1.5;background:var(--surface-2);border:1px dashed var(--border-strong);">' +
          '<div style="font-size:24px;margin-bottom:6px;">🍽️</div>' +
          '<div><strong>' + PCD.escapeHtml(t('buffet_no_stations_title') || 'No stations yet') + '</strong></div>' +
          '<div style="margin-top:4px;">' + PCD.escapeHtml(t('buffet_no_stations_body') || 'Click "+ Add Station" above to start. A typical breakfast buffet has Cold, Hot, Bakery, and Beverage stations.') + '</div>' +
        '</div>';
      }
      data.stations.forEach(function (st, sIdx) {
        const stTypeMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
        const secEl = PCD.el('div', { class: 'card', 'data-st-id': st.id, style: { padding: '12px', borderLeft: '4px solid ' + stTypeMeta.color } });

        let itemsHtml = '';
        st.items.forEach(function (it, iIdx) {
          // v2.8.79 — Item 3 tipte olabilir:
          //   (a) recipeId → recipe library'den
          //   (b) ingredientId → ingredient library'den (kahvaltıda peynir/zeytin gibi)
          //   (c) customName → sadece label (cost=0, manuel kuru kalan)
          const r = it.recipeId ? recipeMap[it.recipeId] : null;
          const ing = it.ingredientId ? ingMap[it.ingredientId] : null;
          let displayName = '(removed)';
          let typeChip = '';
          let isCustom = false;
          if (r) { displayName = r.name; typeChip = '<span style="background:var(--brand-50);color:var(--brand-700);font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.04em;margin-inline-start:6px;">' + (t('buffet_chip_recipe') || 'recipe') + '</span>'; }
          else if (ing) { displayName = ing.name; typeChip = '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.04em;margin-inline-start:6px;">' + (t('buffet_chip_ingredient') || 'ingredient') + '</span>'; }
          else if (it.customName !== undefined) { isCustom = true; displayName = it.customName || ''; typeChip = '<span style="background:var(--surface-2);color:var(--text-3);font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.04em;margin-inline-start:6px;">' + (t('buffet_chip_custom') || 'custom') + '</span>'; }
          // v2.8.79 — Custom items: editable name input
          const nameCell = isCustom
            ? '<input type="text" class="input" data-it-custom-name="' + sIdx + ':' + iIdx + '" value="' + PCD.escapeHtml(displayName) + '" placeholder="' + PCD.escapeHtml(t('buffet_custom_name_ph') || 'Item name (e.g. Sliced cucumber)') + '" style="flex:1;min-width:140px;font-weight:600;font-size:14px;padding:4px 8px;">' + typeChip
            : '<div style="flex:1;min-width:140px;font-weight:600;font-size:14px;">' + PCD.escapeHtml(displayName) + typeChip + '</div>';
          const c = (r || ing) ? computeItemCost(it, r, ingMap, recipeMap, data.coverCount, refillEffective, ing) : null;
          const pickup = it.pickupRatio != null ? it.pickupRatio : (INDUSTRY_RATIOS[st.type === 'cold' ? 'cold_protein' : (st.type === 'hot' ? 'hot_protein' : (st.type === 'bakery' ? 'bakery' : (st.type === 'dessert' ? 'dessert' : (st.type === 'beverage' ? 'beverage_cold' : 'other'))))]);
          // v2.8.79 — Unit dropdown HTML
          const unitOptions = UNITS.map(function (u) {
            return '<option value="' + u + '"' + ((it.unit || '') === u ? ' selected' : '') + '>' + u + '</option>';
          }).join('');
          itemsHtml +=
            '<div style="padding:8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);margin-bottom:6px;" data-it-id="' + it.id + '">' +
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">' +
                nameCell +
                '<button class="icon-btn" data-it-del="' + sIdx + ':' + iIdx + '" title="' + PCD.escapeHtml(t('delete') || 'Delete') + '">' + PCD.icon('x', 14) + '</button>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;font-size:12px;">' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_per_guest') || 'Per guest') + '</label>' +
                  '<input type="number" class="input" data-it-amt="' + sIdx + ':' + iIdx + '" value="' + (it.amountPerGuest || '') + '" step="0.01" min="0" style="padding:4px 6px;font-size:12px;">' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_unit') || 'Unit') + '</label>' +
                  '<select class="select" data-it-unit="' + sIdx + ':' + iIdx + '" style="padding:4px 6px;font-size:12px;">' + unitOptions + '</select>' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;" title="' + PCD.escapeHtml(t('buffet_pickup_hint') || 'What % of prepared amount will actually be eaten') + '">' + (t('buffet_pickup_label') || 'Consumption %') + '</label>' +
                  '<input type="number" class="input" data-it-pickup="' + sIdx + ':' + iIdx + '" value="' + (pickup * 100).toFixed(0) + '" min="0" max="100" step="5" style="padding:4px 6px;font-size:12px;">' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_prep_total') || 'Prep total') + '</label>' +
                  '<div style="padding:4px 6px;font-weight:700;color:' + stTypeMeta.color + ';font-size:13px;">' + (c ? PCD.fmtNumber(c.prepAmount) + ' ' + (it.unit || '') : '—') + '</div>' +
                '</div>' +
              '</div>' +
              // v2.8.88 — Compact cost preview. Eski uzun "Tüketim % = hazırlananın yüzde
              // kaçı yenecek..." hint her satırda repeat ediyordu → gürültü. Operatör
              // istek: kafa karıştırmayan modern tasarım. Pickup tooltip zaten label
              // title attribute'unda var (satır 609). Inline hint kaldırıldı.
              (c ? '<div style="margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-2);">' +
                  '<span><strong style="color:var(--text-1);">' + PCD.fmtMoney(c.prepCost) + '</strong> ' + (t('buffet_prep_cost') || 'prep cost') + '</span>' +
                  '<span><strong style="color:' + (c.wastePct > 25 ? 'var(--danger)' : 'var(--text-3)') + ';">' + PCD.fmtMoney(c.expectedWaste) + '</strong> ' + (t('buffet_expected_waste') || 'waste') +
                    (c.wastePct > 25 ? ' <span style="color:var(--danger);font-weight:700;">⚠ ' + c.wastePct.toFixed(0) + '%</span>' : '') +
                  '</span>' +
              '</div>' : '') +
            '</div>';
        });

        const stationTypeBtns = STATION_TYPES.map(function (stt) {
          return '<option value="' + stt.id + '"' + (st.type === stt.id ? ' selected' : '') + '>' + PCD.escapeHtml(PCD.i18n.t(stt.labelKey) || stt.id) + '</option>';
        }).join('');

        secEl.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
            '<span style="color:' + stTypeMeta.color + ';flex-shrink:0;">' + PCD.icon(stTypeMeta.icon, 18) + '</span>' +
            '<input type="text" class="input" data-st-name="' + sIdx + '" value="' + PCD.escapeHtml(st.name || '') + '" placeholder="' + PCD.escapeHtml(t('buffet_station_name_ph') || 'Station name') + '" style="flex:1;min-width:120px;font-weight:600;">' +
            '<select class="select" data-st-type="' + sIdx + '" style="max-width:130px;font-size:12px;">' + stationTypeBtns + '</select>' +
            '<button class="icon-btn" data-st-del="' + sIdx + '" title="' + PCD.escapeHtml(t('delete') || 'Delete') + '">' + PCD.icon('trash', 16) + '</button>' +
          '</div>' +
          itemsHtml +
          '<button class="btn btn-ghost btn-sm" data-st-add-item="' + sIdx + '" style="width:100%;margin-top:4px;">+ ' + PCD.escapeHtml(t('buffet_add_item') || 'Add Item') + '</button>';
        stListEl.appendChild(secEl);
      });

      wireEditor();

      // v2.8.79 — Focus restore (post-render)
      if (_restoreFocus) {
        const sel = '[' + _restoreFocus.attr + '="' + _restoreFocus.value + '"]';
        const el = body.querySelector(sel);
        if (el && typeof el.focus === 'function') {
          el.focus();
          if (_restoreFocus.start != null && typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(_restoreFocus.start, _restoreFocus.end); } catch (e) {}
          }
        }
      }
    }

    function wireEditor() {
      // v2.8.77 — Guide dismiss persistence
      const dismissBtn = PCD.$('#bufGuideDismiss', body);
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { localStorage.setItem('pcd_buffet_guide_hidden', '1'); } catch (err) {}
          const detailsEl = this.closest('details');
          if (detailsEl) detailsEl.style.display = 'none';
        });
      }

      // Top fields
      PCD.$('#bufName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#bufType', body).addEventListener('change', function () {
        data.type = this.value;
        // Reset refill to industry default for this type
        data.refillMultiplier = null;
        // v2.8.88 — Smart industry defaults: type change → covers + ticket price
        // otomatik plausible güncellenir (kullanıcı override edebilir).
        const newType = BUFFET_TYPES.find(function (b) { return b.id === data.type; });
        if (newType) {
          if (newType.defaultCovers) data.coverCount = newType.defaultCovers;
          if (newType.defaultPrice) data.ticketPrice = newType.defaultPrice;
        }
        renderEditor();
      });
      PCD.$('#bufDate', body).addEventListener('change', function () { data.serviceDate = this.value; });
      // v2.8.82 — Debounce 700ms (item editor pattern v2.8.79 ile birebir).
      // Operatör "23", "35", "5567" gibi çok-haneli sayı yazmaya çalışıyordu;
      // ilk basışta render rebuild + focus loss vardı. Debounce + focus restore
      // (renderEditor başında data-buf-field listede) artık doğal akış sağlar.
      PCD.$('#bufCovers', body).addEventListener('input', PCD.debounce(function () {
        const v = parseInt(this.value, 10);
        if (!isNaN(v) && v >= 1) {
          data.coverCount = v;
          renderEditor();
        }
      }, 700));
      PCD.$('#bufPrice', body).addEventListener('input', PCD.debounce(function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 0) {
          data.ticketPrice = v;
          renderEditor();
        }
      }, 700));
      PCD.$('#bufRefill', body).addEventListener('input', PCD.debounce(function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 1) {
          data.refillMultiplier = v;
          renderEditor();
        }
      }, 700));
      PCD.$('#bufNotes', body).addEventListener('input', function () { data.notes = this.value; });

      // Add station
      PCD.$('#addStationBtn', body).addEventListener('click', function () {
        data.stations.push({
          id: PCD.uid('bst'),
          name: PCD.i18n.t('buffet_new_station') || 'New Station',
          type: 'other',
          items: [],
        });
        renderEditor();
      });

      // Station name + type + delete
      PCD.on(body, 'input', '[data-st-name]', PCD.debounce(function () {
        const sIdx = parseInt(this.getAttribute('data-st-name'), 10);
        if (data.stations[sIdx]) data.stations[sIdx].name = this.value;
      }, 300));
      PCD.on(body, 'change', '[data-st-type]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-type'), 10);
        if (data.stations[sIdx]) { data.stations[sIdx].type = this.value; renderEditor(); }
      });
      PCD.on(body, 'click', '[data-st-del]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-del'), 10);
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: PCD.i18n.t('buffet_confirm_del_station') || 'Delete this station?',
          text: PCD.i18n.t('buffet_confirm_del_station_body') || 'All items in this station will be removed too.',
          okText: PCD.i18n.t('delete') || 'Delete',
        }).then(function (ok) {
          if (!ok) return;
          data.stations.splice(sIdx, 1);
          renderEditor();
        });
      });

      // v2.8.79 — Add Item: 3-action chooser (Recipe / Ingredient / Custom).
      // Operatör request: "büfe hazırlarken herzaman hazır sub-recipeler
      // kullanılmaz... peynir, zeytin, roka vs. gibi sadece malzemelerde
      // eklenebilir. inventoryde olmasa bile yeni malzeme ekle olmalı."
      PCD.on(body, 'click', '[data-st-add-item]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-add-item'), 10);
        const sec = data.stations[sIdx];
        if (!sec) return;
        const defaultPickupKey = sec.type === 'cold' ? 'cold_protein' : (sec.type === 'hot' ? 'hot_protein' : (sec.type === 'bakery' ? 'bakery' : (sec.type === 'dessert' ? 'dessert' : (sec.type === 'beverage' ? 'beverage_cold' : 'other'))));
        const defaultPickup = INDUSTRY_RATIOS[defaultPickupKey] || 0.6;

        // 3 buton: Recipe / Ingredient / Custom + "yeni ingredient oluştur" alt-opsiyon
        const chooserBody = PCD.el('div');
        chooserBody.innerHTML =
          '<div class="text-muted text-sm mb-3" style="font-size:13px;">' + PCD.escapeHtml(t('buffet_add_item_chooser_hint') || 'Choose how to add this item:') + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<button type="button" id="bufAddFromRecipe" class="card card-hover" style="padding:14px;text-align:start;cursor:pointer;display:flex;align-items:center;gap:12px;">' +
              '<div style="font-size:24px;">📖</div>' +
              '<div><div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(t('buffet_add_from_recipe') || 'From Recipe Library') + '</div>' +
              '<div class="text-muted text-sm" style="font-size:12px;">' + PCD.escapeHtml(t('buffet_add_from_recipe_hint') || 'Pick a prep or dish (sub-recipes auto-expand to ingredients)') + '</div></div>' +
            '</button>' +
            '<button type="button" id="bufAddFromIngredient" class="card card-hover" style="padding:14px;text-align:start;cursor:pointer;display:flex;align-items:center;gap:12px;">' +
              '<div style="font-size:24px;">🥬</div>' +
              '<div><div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(t('buffet_add_from_ingredient') || 'From Ingredient Library') + '</div>' +
              '<div class="text-muted text-sm" style="font-size:12px;">' + PCD.escapeHtml(t('buffet_add_from_ingredient_hint') || 'Direct ingredient (cheese, olives, fruit — no recipe needed)') + '</div></div>' +
            '</button>' +
            '<button type="button" id="bufAddNewIngredient" class="card card-hover" style="padding:14px;text-align:start;cursor:pointer;display:flex;align-items:center;gap:12px;">' +
              '<div style="font-size:24px;">➕</div>' +
              '<div><div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(t('buffet_add_new_ingredient') || 'New Ingredient') + '</div>' +
              '<div class="text-muted text-sm" style="font-size:12px;">' + PCD.escapeHtml(t('buffet_add_new_ingredient_hint') || 'Create a new ingredient now (added to your library too)') + '</div></div>' +
            '</button>' +
            '<button type="button" id="bufAddCustom" class="card card-hover" style="padding:14px;text-align:start;cursor:pointer;display:flex;align-items:center;gap:12px;">' +
              '<div style="font-size:24px;">✎</div>' +
              '<div><div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(t('buffet_add_custom') || 'Custom Label (no cost)') + '</div>' +
              '<div class="text-muted text-sm" style="font-size:12px;">' + PCD.escapeHtml(t('buffet_add_custom_hint') || 'Just a name on the printout — no cost calculation') + '</div></div>' +
            '</button>' +
          '</div>';
        const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
        const footer = PCD.el('div', { style: { width: '100%' } });
        footer.appendChild(closeBtn);
        const chooserModal = PCD.modal.open({
          title: t('buffet_add_item') || 'Add Item',
          body: chooserBody, footer: footer, size: 'sm', closable: true,
        });
        closeBtn.addEventListener('click', function () { chooserModal.close(); });

        // Action 1: From Recipe Library
        PCD.$('#bufAddFromRecipe', chooserBody).addEventListener('click', function () {
          chooserModal.close();
          setTimeout(function () {
            const items = PCD.store.listRecipes().map(function (r) {
              return { id: r.id, name: r.name, meta: PCD.i18n.t(r.category || 'cat_main'), thumb: r.photo || '' };
            });
            if (items.length === 0) { PCD.toast.warning(PCD.i18n.t('no_recipes_yet')); return; }
            PCD.picker.open({
              title: t('buffet_pick_recipe') || 'Pick recipe(s)',
              items: items, multi: true,
            }).then(function (selIds) {
              if (!selIds || !selIds.length) return;
              selIds.forEach(function (rid) {
                const r = PCD.store.getRecipe(rid);
                sec.items.push({
                  id: PCD.uid('bit'),
                  recipeId: rid,
                  amountPerGuest: r && r.yieldUnit === 'g' ? 60 : (r && r.yieldUnit === 'ml' ? 100 : 1),
                  unit: (r && r.yieldUnit) || 'portion',
                  pickupRatio: defaultPickup,
                  refillX: null,
                });
              });
              renderEditor();
            });
          }, 200);
        });

        // Action 2: From Ingredient Library
        PCD.$('#bufAddFromIngredient', chooserBody).addEventListener('click', function () {
          chooserModal.close();
          setTimeout(function () {
            const items = PCD.store.listIngredients().map(function (i) {
              return { id: i.id, name: i.name, meta: PCD.i18n.t(i.category || 'cat_other') + (i.unit ? ' · ' + i.unit : ''), thumb: '' };
            });
            if (items.length === 0) { PCD.toast.warning(t('buffet_no_ingredients') || 'No ingredients in your library yet'); return; }
            PCD.picker.open({
              title: t('buffet_pick_ingredient') || 'Pick ingredient(s)',
              items: items, multi: true,
            }).then(function (selIds) {
              if (!selIds || !selIds.length) return;
              selIds.forEach(function (iid) {
                const ing = PCD.store.getFromTable('ingredients', iid);
                sec.items.push({
                  id: PCD.uid('bit'),
                  ingredientId: iid,
                  amountPerGuest: ing && ing.unit === 'g' ? 30 : (ing && ing.unit === 'ml' ? 50 : 1),
                  unit: (ing && ing.unit) || 'g',
                  pickupRatio: defaultPickup,
                  refillX: null,
                });
              });
              renderEditor();
            });
          }, 200);
        });

        // Action 3: New Ingredient (open ingredient editor, then add to buffet)
        PCD.$('#bufAddNewIngredient', chooserBody).addEventListener('click', function () {
          chooserModal.close();
          if (!PCD.tools.ingredients || !PCD.tools.ingredients.openEditor) {
            // Lazy: tool may not be loaded yet (v2.8.78 lazy tools)
            // PCD.router.go would change view, but we want to stay here.
            // Manual lazy load:
            const s = document.createElement('script');
            const v = (window.PCD_CONFIG && window.PCD_CONFIG.APP_VERSION) || '';
            s.src = 'js/tools/ingredients.js' + (v ? '?v=' + v : '');
            s.onload = function () { _openNewIngredientFlow(); };
            s.onerror = function () { PCD.toast.error('Could not load ingredient editor'); };
            document.head.appendChild(s);
          } else {
            _openNewIngredientFlow();
          }
          function _openNewIngredientFlow() {
            // Open ingredient editor; on save, push as item in buffet
            const prevCount = (PCD.store.listIngredients() || []).length;
            PCD.tools.ingredients.openEditor(null, function () {
              setTimeout(function () {
                const after = PCD.store.listIngredients() || [];
                if (after.length <= prevCount) return; // user cancelled
                const newIng = after[after.length - 1]; // most recent
                sec.items.push({
                  id: PCD.uid('bit'),
                  ingredientId: newIng.id,
                  amountPerGuest: newIng.unit === 'g' ? 30 : (newIng.unit === 'ml' ? 50 : 1),
                  unit: newIng.unit || 'g',
                  pickupRatio: defaultPickup,
                  refillX: null,
                });
                renderEditor();
                PCD.toast.success(t('buffet_added_new_ingredient') || 'New ingredient added to buffet');
              }, 150);
            });
          }
        });

        // Action 4: Custom (no cost, just a label on the printout)
        PCD.$('#bufAddCustom', chooserBody).addEventListener('click', function () {
          chooserModal.close();
          sec.items.push({
            id: PCD.uid('bit'),
            customName: '',
            amountPerGuest: 1,
            unit: 'portion',
            pickupRatio: defaultPickup,
            refillX: null,
          });
          renderEditor();
          // Focus the new item's per-guest input for quick edit
          setTimeout(function () {
            const all = body.querySelectorAll('[data-it-amt]');
            if (all.length) all[all.length - 1].focus();
          }, 50);
        });
      });

      // Item field handlers
      function pickIdx(attr, el) {
        const parts = el.getAttribute(attr).split(':').map(Number);
        return { sIdx: parts[0], iIdx: parts[1] };
      }
      // v2.8.79 — Debounce 400ms → 700ms (operatör request: "20 yazmak istiyorum
      // 2 yazdığım anda beni atıyor"). 2-digit input için yeterli pencere.
      // Focus restoration renderEditor başında — kayıp olmaz.
      PCD.on(body, 'input', '[data-it-amt]', PCD.debounce(function () {
        const p = pickIdx('data-it-amt', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          data.stations[p.sIdx].items[p.iIdx].amountPerGuest = parseFloat(this.value) || 0;
          renderEditor();
        }
      }, 700));
      // v2.8.79 — Unit artık <select>. Tek tıkla seçim → input yerine change.
      PCD.on(body, 'change', '[data-it-unit]', function () {
        const p = pickIdx('data-it-unit', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          data.stations[p.sIdx].items[p.iIdx].unit = this.value;
          renderEditor();
        }
      });
      PCD.on(body, 'input', '[data-it-pickup]', PCD.debounce(function () {
        const p = pickIdx('data-it-pickup', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          let v = parseFloat(this.value);
          if (isNaN(v)) v = 60;
          v = Math.max(0, Math.min(100, v));
          data.stations[p.sIdx].items[p.iIdx].pickupRatio = v / 100;
          renderEditor();
        }
      }, 700));
      PCD.on(body, 'click', '[data-it-del]', function () {
        const p = pickIdx('data-it-del', this);
        if (data.stations[p.sIdx]) {
          data.stations[p.sIdx].items.splice(p.iIdx, 1);
          renderEditor();
        }
      });
      // v2.8.79 — Custom name input (debounced; full re-render not needed but
      // we re-render to refresh display name in print preview consistency).
      PCD.on(body, 'input', '[data-it-custom-name]', PCD.debounce(function () {
        const p = pickIdx('data-it-custom-name', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          data.stations[p.sIdx].items[p.iIdx].customName = this.value;
          // Don't re-render on name edit — would steal focus. Name is only used
          // in print/save, not in live cost calc.
        }
      }, 400));
    }

    renderEditor();

    // Footer buttons
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Save', style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
    const prepBtn = PCD.el('button', { class: 'btn btn-outline' });
    prepBtn.innerHTML = PCD.icon('list', 16) + ' <span>' + (t('buffet_print_prep') || 'Prep List') + '</span>';
    const reportBtn = PCD.el('button', { class: 'btn btn-outline' });
    reportBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + (t('buffet_print_report') || 'Cost Report') + '</span>';
    // v2.8.79 — Excel export butonu (operatör request: "excel cost report
    // buffet costing'e de ekle"). Aynı pattern: xlsx on-demand load.
    const excelBtn = PCD.el('button', { class: 'btn btn-outline' });
    excelBtn.innerHTML = PCD.icon('book-open', 16) + ' <span>Excel</span>';
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete') || 'Delete', style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(prepBtn);
    footer.appendChild(reportBtn);
    footer.appendChild(excelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : (t('buffet_new') || 'New Buffet'),
      body: body, footer: footer, size: 'xl', closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });

    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('buffet_confirm_delete') || 'Delete this buffet?',
        text: t('buffet_confirm_delete_body') || 'This is permanent.',
        okText: t('delete'),
      }).then(function (ok) {
        if (!ok) return;
        deleteBuffet(existing.id);
        PCD.toast.success(t('buffet_deleted') || 'Buffet deleted');
        m.close();
        const v = PCD.$('#view');
        if (v && PCD.router.currentView() === 'buffet') render(v);
      });
    });

    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim();
      if (!data.name) { PCD.toast.error((t('buffet_name_label') || 'Buffet name') + ' ' + (t('required') || 'required')); return; }
      if (existing) data.id = existing.id;
      upsertBuffet(data);
      PCD.toast.success(t('buffet_saved') || 'Buffet saved');
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (v && PCD.router.currentView() === 'buffet') render(v);
      }, 200);
    });

    prepBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim() || t('untitled');
      if (existing) { upsertBuffet(Object.assign({}, existing, data)); }
      printPrepList(data);
    });
    reportBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim() || t('untitled');
      if (existing) { upsertBuffet(Object.assign({}, existing, data)); }
      printCostReport(data);
    });
    // v2.8.79 — Excel export click: lazy-load xlsx if needed, then export
    excelBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim() || t('untitled');
      if (existing) { upsertBuffet(Object.assign({}, existing, data)); }
      exportBuffetXLSX(data);
    });
  }

  // ---------- PRINT: PREP LIST ----------

  function printPrepList(buffet) {
    const t = PCD.i18n.t;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();
    const refillX = buffet.refillMultiplier != null ? Number(buffet.refillMultiplier) : (INDUSTRY_REFILL[buffet.type] || 1.25);

    // v2.8.79 — Print all 3 item types: recipe / ingredient / custom
    let rowsHtml = '';
    (buffet.stations || []).forEach(function (st) {
      if (!st.items || !st.items.length) return;
      const stMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
      rowsHtml += '<tr><td colspan="3" class="st-head" style="background:' + stMeta.color + '20;color:' + stMeta.color + ';font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:6px 8px;font-size:10pt;">' + PCD.escapeHtml(st.name) + '</td></tr>';
      st.items.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const ing = it.ingredientId ? ingMap[it.ingredientId] : null;
        const name = r ? r.name : (ing ? ing.name : (it.customName || ''));
        if (!name) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, buffet.coverCount, refillX, ing);
        rowsHtml +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(name) + '</td>' +
            '<td style="text-align:right;font-weight:700;color:' + stMeta.color + ';white-space:nowrap;">' + PCD.fmtNumber(c.prepAmount) + ' ' + PCD.escapeHtml(it.unit || '') + '</td>' +
            '<td style="text-align:center;color:#999;">☐</td>' +
          '</tr>';
      });
    });

    const dateStr = buffet.serviceDate ? PCD.fmtDate(buffet.serviceDate) : new Date().toLocaleDateString();
    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }' +
        '.hdr { border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; }' +
        '.hdr h1 { margin: 0; font-size: 18pt; color: #16a34a; }' +
        '.hdr .meta { font-size: 10pt; color: #666; margin-top: 2px; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 11pt; }' +
        'th, td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }' +
        'th { background: #f5f5f4; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }' +
        '.st-head { padding-top: 10px !important; }' +
      '</style>' +
      '<div class="hdr">' +
        '<h1>' + PCD.escapeHtml(buffet.name || (t('buffet_untitled') || 'Buffet')) + ' — ' + PCD.escapeHtml(t('buffet_print_prep') || 'Prep List') + '</h1>' +
        '<div class="meta">' + (buffet.coverCount || 0) + ' ' + PCD.escapeHtml(t('buffet_covers') || 'covers') + ' · ' + dateStr + ' · ' + PCD.escapeHtml(t('buffet_refill_label') || 'Refill') + ' ' + refillX + '×</div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th>' + (t('buffet_print_item') || 'Item') + '</th><th style="text-align:right;">' + (t('buffet_print_prep_amt') || 'Prep') + '</th><th style="text-align:center;width:40px;">' + (t('buffet_print_done') || 'Done') + '</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';

    PCD.print(html, (buffet.name || (t('buffet_untitled') || 'Buffet')) + ' — ' + (t('buffet_print_prep') || 'Prep'));
  }

  // ---------- PRINT: COST REPORT ----------

  function printCostReport(buffet) {
    const t = PCD.i18n.t;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();
    const totals = computeBuffetTotals(buffet, ingMap, recipeMap);
    const refillX = totals.refillX;
    const dateStr = buffet.serviceDate ? PCD.fmtDate(buffet.serviceDate) : new Date().toLocaleDateString();

    // v2.8.79 — Cost report: all 3 item types
    let rowsHtml = '';
    (buffet.stations || []).forEach(function (st) {
      if (!st.items || !st.items.length) return;
      let stSubtotal = 0;
      let itemRows = '';
      st.items.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const ing = it.ingredientId ? ingMap[it.ingredientId] : null;
        const name = r ? r.name : (ing ? ing.name : (it.customName || ''));
        if (!name) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, buffet.coverCount, refillX, ing);
        stSubtotal += c.prepCost;
        const wasteStyle = c.wastePct > 25 ? 'color:#dc2626;font-weight:700;' : 'color:#666;';
        itemRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(name) + '</td>' +
            '<td style="text-align:right;">' + PCD.fmtNumber(c.prepAmount) + ' ' + PCD.escapeHtml(it.unit || '') + '</td>' +
            '<td style="text-align:right;">' + ((it.pickupRatio || 0.6) * 100).toFixed(0) + '%</td>' +
            '<td style="text-align:right;font-weight:700;">' + PCD.fmtMoney(c.prepCost) + '</td>' +
            '<td style="text-align:right;' + wasteStyle + '">' + PCD.fmtMoney(c.expectedWaste) + '</td>' +
          '</tr>';
      });
      const stMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
      rowsHtml +=
        '<tr><td colspan="5" style="background:' + stMeta.color + '20;color:' + stMeta.color + ';font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:5px 8px;font-size:9pt;">' + PCD.escapeHtml(st.name) + ' — ' + PCD.fmtMoney(stSubtotal) + '</td></tr>' +
        itemRows;
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }' +
        '.hdr { border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; }' +
        '.hdr h1 { margin: 0; font-size: 18pt; color: #16a34a; }' +
        '.hdr .meta { font-size: 10pt; color: #666; margin-top: 2px; }' +
        '.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }' +
        '.stat { background: #f5f5f4; padding: 8px 10px; border-radius: 6px; }' +
        '.stat .lbl { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }' +
        '.stat .val { font-size: 14pt; font-weight: 800; color: #111; }' +
        '.good { color: #16a34a; } .warn { color: #f59e0b; } .bad { color: #dc2626; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'th, td { padding: 4px 8px; border-bottom: 1px solid #e5e5e5; }' +
        'th { background: #f5f5f4; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }' +
      '</style>' +
      '<div class="hdr">' +
        '<h1>' + PCD.escapeHtml(buffet.name || (t('buffet_untitled') || 'Buffet')) + ' — ' + PCD.escapeHtml(t('buffet_print_report') || 'Cost Report') + '</h1>' +
        '<div class="meta">' + (buffet.coverCount || 0) + ' ' + PCD.escapeHtml(t('buffet_covers') || 'covers') + ' · ' + dateStr + ' · ' + PCD.escapeHtml(t('buffet_refill_label') || 'Refill') + ' ' + refillX + '×</div>' +
      '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_revenue') || 'Revenue') + '</div><div class="val">' + PCD.fmtMoney(totals.revenue) + '</div></div>' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_total_cost') || 'Spread cost') + '</div><div class="val">' + PCD.fmtMoney(totals.totalPrepCost) + '</div></div>' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_food_cost_pct') || 'Food cost %') + '</div><div class="val ' + totals.status + '">' + totals.foodCostPct.toFixed(1) + '%</div></div>' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_per_cover') || 'Per cover') + '</div><div class="val">' + PCD.fmtMoney(totals.perGuestCost) + '</div></div>' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_profit') || 'Profit / cover') + '</div><div class="val ' + (totals.profitPerCover > 0 ? 'good' : 'bad') + '">' + PCD.fmtMoney(totals.profitPerCover) + '</div></div>' +
        '<div class="stat"><div class="lbl">' + PCD.escapeHtml(t('buffet_stat_waste') || 'Expected waste') + '</div><div class="val">' + PCD.fmtMoney(totals.totalExpectedWaste) + '</div></div>' +
      '</div>' +
      '<table>' +
        '<thead><tr>' +
          '<th>' + PCD.escapeHtml(t('buffet_print_item') || 'Item') + '</th>' +
          '<th style="text-align:right;">' + PCD.escapeHtml(t('buffet_print_prep_amt') || 'Prep') + '</th>' +
          '<th style="text-align:right;">' + PCD.escapeHtml(t('buffet_pickup_label') || 'Pickup') + '</th>' +
          '<th style="text-align:right;">' + PCD.escapeHtml(t('cr_cost') || 'Cost') + '</th>' +
          '<th style="text-align:right;">' + PCD.escapeHtml(t('buffet_expected_waste') || 'Waste') + '</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';

    PCD.print(html, (buffet.name || (t('buffet_untitled') || 'Buffet')) + ' — ' + (t('buffet_print_report') || 'Cost Report'));
  }

  // ---------- EXCEL EXPORT (v2.8.79) ----------

  function exportBuffetXLSX(buffet) {
    const t = PCD.i18n.t;
    if (!window.XLSX) {
      if (!PCD.loadXLSX) {
        PCD.toast.error(t('cr_xlsx_unavailable') || 'Excel library not available');
        return;
      }
      PCD.loadXLSX().then(function () {
        exportBuffetXLSX(buffet);
      }).catch(function () {
        PCD.toast.error(t('cr_xlsx_unavailable') || 'Excel library failed to load.');
      });
      return;
    }
    // v2.8.86 — Try/catch sargı (recipes.js paritesi)
    try {
      _doExportBuffetXLSX(buffet);
    } catch (err) {
      PCD.error && PCD.error('exportBuffetXLSX failed:', err);
      PCD.toast.error((t('cr_xlsx_export_failed') || 'Excel export failed') + ': ' + (err && err.message ? err.message : 'unknown'));
    }
  }

  function _doExportBuffetXLSX(buffet) {
    const t = PCD.i18n.t;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();
    const totals = computeBuffetTotals(buffet, ingMap, recipeMap);
    const refillX = totals.refillX;

    const BRAND = '16A34A';
    const HEADER_BG = '16A34A';
    const BORDER_COLOR = 'D4D4D4';
    const thinBorder = {
      top:    { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left:   { style: 'thin', color: { rgb: BORDER_COLOR } },
      right:  { style: 'thin', color: { rgb: BORDER_COLOR } },
    };
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    };
    const labelStyle = { font: { bold: true }, alignment: { vertical: 'center' }, border: thinBorder };
    const moneyStyle = { numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, border: thinBorder };
    const numStyle   = { numFmt: '#,##0.00',  alignment: { horizontal: 'right' }, border: thinBorder };
    const pctStyle   = { numFmt: '0%',         alignment: { horizontal: 'right' }, border: thinBorder };

    const aoa = [];
    aoa.push([{ v: (buffet.name || (t('buffet_untitled') || 'Buffet')) + ' — ' + (t('buffet_print_report') || 'Cost Report'), s: { font: { bold: true, sz: 16, color: { rgb: BRAND } } } }]);
    aoa.push([{ v: (buffet.coverCount || 0) + ' ' + (t('buffet_covers') || 'covers') + ' · ' + (t('buffet_refill_label') || 'Refill') + ' ' + refillX + '× · ' + (buffet.serviceDate || ''), s: { font: { italic: true, color: { rgb: '666666' } } } }]);
    aoa.push([]);
    aoa.push([
      { v: t('buffet_stat_revenue') || 'Revenue', s: labelStyle }, { v: totals.revenue, s: moneyStyle },
      { v: t('buffet_stat_total_cost') || 'Spread cost', s: labelStyle }, { v: totals.totalPrepCost, s: moneyStyle },
    ]);
    aoa.push([
      { v: t('buffet_stat_per_cover') || 'Per cover', s: labelStyle }, { v: totals.perGuestCost, s: moneyStyle },
      { v: t('buffet_stat_food_cost_pct') || 'Food cost %', s: labelStyle }, { v: totals.foodCostPct / 100, s: pctStyle },
    ]);
    aoa.push([
      { v: t('buffet_stat_profit') || 'Profit / cover', s: labelStyle }, { v: totals.profitPerCover, s: moneyStyle },
      { v: t('buffet_stat_waste') || 'Expected waste', s: labelStyle }, { v: totals.totalExpectedWaste, s: moneyStyle },
    ]);
    aoa.push([]);
    aoa.push([
      { v: t('buffet_station') || 'Station', s: headerStyle },
      { v: t('buffet_print_item') || 'Item', s: headerStyle },
      { v: t('buffet_print_prep_amt') || 'Prep amount', s: headerStyle },
      { v: t('buffet_unit') || 'Unit', s: headerStyle },
      { v: (t('buffet_pickup_label') || 'Pickup') + ' %', s: headerStyle },
      { v: t('buffet_prep_cost') || 'Prep cost', s: headerStyle },
      { v: t('buffet_stat_waste') || 'Expected waste', s: headerStyle },
    ]);

    (buffet.stations || []).forEach(function (st) {
      if (!st.items || !st.items.length) return;
      (st.items || []).forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const ing = it.ingredientId ? ingMap[it.ingredientId] : null;
        const name = r ? r.name : (ing ? ing.name : (it.customName || ''));
        if (!name) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, buffet.coverCount, refillX, ing);
        aoa.push([
          { v: st.name || '', s: labelStyle },
          { v: name, s: { alignment: { vertical: 'center' }, border: thinBorder } },
          { v: c.prepAmount, s: numStyle },
          { v: it.unit || '', s: { alignment: { horizontal: 'center' }, border: thinBorder } },
          { v: (it.pickupRatio || 0.6), s: pctStyle },
          { v: c.prepCost, s: moneyStyle },
          { v: c.expectedWaste, s: moneyStyle },
        ]);
      });
    });

    // v2.9.14 — Footer row (matches Recipe Cost Excel pattern, backlog #6)
    const footerRowIdx = aoa.length + 1; // empty row inserted next, then footer
    aoa.push([]);
    aoa.push([{
      v: t('cr_made_with') || 'Made with ProChefDesk · prochefdesk.com',
      s: {
        font: { name: 'Calibri', sz: 8, italic: true, color: { rgb: '999999' } },
        alignment: { vertical: 'center', horizontal: 'center' },
      },
    }]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: footerRowIdx, c: 0 }, e: { r: footerRowIdx, c: 6 } }, // footer merged across all columns
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buffet Cost');
    const safeName = (buffet.name || 'buffet').replace(/[^a-zA-Z0-9\-_]/g, '_');
    XLSX.writeFile(wb, safeName + '_cost_report.xlsx');
  }

  // ---------- EXPORT ----------
  PCD.tools = PCD.tools || {};
  PCD.tools.buffet = {
    render: render,
    openEditor: openEditor,
  };
})();
