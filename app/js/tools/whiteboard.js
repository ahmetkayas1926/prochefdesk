/* ================================================================
   ProChefDesk — whiteboard.js (v2.11.0 — Block Composer)
   Kitchen Whiteboard — block-based composer for kitchen reference
   sheets (mise en place, cook times, allergen alerts, prep schedules,
   station maps). Replaces the v2.9.40 cells-grid architecture with
   a Notion-style block composition pattern: each canvas is a list
   of typed blocks (section_header / big_number / checklist / kv /
   table / alert / text / divider), each block stylable + layoutable
   (full / half width). Print engine flows blocks into A4/A3 columns.

   Major shift vs v2.10.x:
   - Fixed rows × cols grid → free-flowing block list
   - Cell merge (drag-resize) → block layout (full / half)
   - Right-click palette → desktop inspector panel + mobile bottom
     sheet editor (touch-native, no right-click required)
   - Cells `r,c,text,color` data → blocks `id,type,content,style,layout`

   Backward compat: any canvas without `format:'v2'` is treated as
   legacy (operator pre-confirmed: no real data; render with reset
   CTA). New canvases always use v2 format.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // ============ CONSTANTS ============
  const LS_KEY = 'pcd_whiteboard_canvases_v2';
  const LS_KEY_USER_TEMPLATES = 'pcd_whiteboard_user_templates_v1';
  const LS_KEY_OLD = 'pcd_whiteboard_v1';
  const FORMAT_VERSION = 'v2';

  // v2.10.0 — Renk paleti korunur, v2.11'de blok arka planı + accent renk olarak kullanılır.
  const PALETTE = [
    { id: 'white',     label: 'White',       bg: '#ffffff', text: '#111827', accent: '#16a34a' },
    { id: 'cream',     label: 'Cream',       bg: '#faf7f2', text: '#1c1a17', accent: '#9a6a16' },
    { id: 'paper',     label: 'Paper',       bg: '#fbf7ef', text: '#1c1a17', accent: '#2d4a3e' },
    { id: 'ink',       label: 'Ink',         bg: '#1c1a17', text: '#fbf7ef', accent: '#fcd34d' },
    { id: 'dark',      label: 'Dark',        bg: '#1f2937', text: '#f9fafb', accent: '#16a34a' },
    { id: 'forest',    label: 'Forest',      bg: '#2d4a3e', text: '#fbf7ef', accent: '#fcd34d' },
    { id: 'brand',     label: 'Brand Green', bg: '#16a34a', text: '#ffffff', accent: '#fbf7ef' },
    { id: 'mint',      label: 'Mint',        bg: '#dcfce7', text: '#14532d', accent: '#16a34a' },
    { id: 'steak',     label: 'Steak Red',   bg: '#a23b2d', text: '#ffffff', accent: '#fcd34d' },
    { id: 'red',       label: 'Soft Red',    bg: '#fee2e2', text: '#7f1d1d', accent: '#dc2626' },
    { id: 'amber',     label: 'Soft Amber',  bg: '#fef3c7', text: '#78350f', accent: '#d97706' },
    { id: 'katmer',    label: 'Katmer',      bg: '#9a6a16', text: '#ffffff', accent: '#fcd34d' },
    { id: 'reheat',    label: 'Reheat Teal', bg: '#1f6f6b', text: '#ffffff', accent: '#fcd34d' },
    { id: 'blue',      label: 'Cool Blue',   bg: '#dbeafe', text: '#1e3a8a', accent: '#2563eb' },
  ];

  // v2.11.0 — Block tipleri ve metadata. Her tip için: render fonksiyonu (renderBlock'ta switch'le),
  // default content (makeBlock factory), inspector field set (renderInspector'da switch).
  // v2.11.0 — Block tipleri için emoji glyph kullanılır (icon registry'de
  // heading/hash/columns/align-left/plus-square/layout/sliders YOK, silent
  // info fallback bug riski. Emoji unicode tüm cihazlarda renderlanır.)
  // v2.11.14 — 4 yeni mutfak-spesifik block tipi: step_list / allergen_strip
  // / doneness / time_range (operatör isteği).
  const BLOCK_TYPES = [
    { id: 'section_header', labelKey: 'wb_block_section_header', glyph: '🏷',  label: 'Section Header' },
    { id: 'big_number',     labelKey: 'wb_block_big_number',     glyph: '🔢',  label: 'Big Number' },
    { id: 'checklist',      labelKey: 'wb_block_checklist',      glyph: '☑️',  label: 'Checklist' },
    { id: 'step_list',      labelKey: 'wb_block_step_list',      glyph: '🔢',  label: 'Step List' },
    { id: 'kv',             labelKey: 'wb_block_kv',             glyph: '🔑',  label: 'Key · Value' },
    { id: 'table',          labelKey: 'wb_block_table',          glyph: '📊',  label: 'Table' },
    { id: 'alert',          labelKey: 'wb_block_alert',          glyph: '⚠️',  label: 'Alert Banner' },
    { id: 'allergen_strip', labelKey: 'wb_block_allergen_strip', glyph: '🥜',  label: 'Allergen Strip' },
    { id: 'doneness',       labelKey: 'wb_block_doneness',       glyph: '🥩',  label: 'Doneness Ladder' },
    { id: 'time_range',     labelKey: 'wb_block_time_range',     glyph: '🕒',  label: 'Time Range' },
    { id: 'cook_sheet',     labelKey: 'wb_block_cook_sheet',     glyph: '🍳',  label: 'Cook Sheet' },
    { id: 'text',           labelKey: 'wb_block_text',           glyph: '📝',  label: 'Free Text' },
    { id: 'divider',        labelKey: 'wb_block_divider',        glyph: '➖',  label: 'Divider' },
  ];

  // v2.11.14 — Size 6 kademe (operatör isteği "S ve XXL ekle"). XS dramatik
  // küçük (caption/footnote), XXL dramatik büyük (hero number/temp).
  const FONT_SIZES = {
    xs:  { px: 9,  headPx: 11 },
    sm:  { px: 11, headPx: 13 },
    md:  { px: 13, headPx: 16 },
    lg:  { px: 16, headPx: 22 },
    xl:  { px: 22, headPx: 36 },
    xxl: { px: 32, headPx: 52 },
  };

  // v2.11.1 — Font weight 3 kademe (operatör isteği "ince/orta/bold"). Body
  // text (text, kv values, checklist items, table cells, alert subtitle)
  // bu weight'i inherit eder. Section header + big_number value + alert
  // text kendi başlık ağırlıklarını korur (hardcoded 800-900) çünkü onlarda
  // weight slider'ı görsel olarak fark üretmez.
  const WEIGHTS = { light: 400, medium: 600, bold: 800 };

  // v2.11.1 — Layout: 4 kademe (operatör isteği "4 hücreye kadar yan yana").
  // half=2, third=3, quarter=4 → ardışık aynı layout'lu blocks N-col grid'e
  // auto-pair olur. full → tek satır tam genişlik.
  // v2.11.14 — fifth=5, sixth=6 eklendi (operatör isteği). 6 sütun A4
  // landscape'te dar olsa da bigNumber/allergen icon strip için yararlı.
  const LAYOUTS = ['full', 'half', 'third', 'quarter', 'fifth', 'sixth'];
  const LAYOUT_COLS = { full: 1, half: 2, third: 3, quarter: 4, fifth: 5, sixth: 6 };
  const LAYOUT_SPAN = {
    full: 12, half: 6, third: 4, quarter: 3, fifth: 2, sixth: 2,
    span1: 1, span2: 2, span3: 3, span4: 4, span5: 5, span6: 6,
    span7: 7, span8: 8, span9: 9, span10: 10, span11: 11, span12: 12,
  };
  function layoutSpan(lay) { return LAYOUT_SPAN[lay] || 12; }

  // ============ HELPERS ============
  function uid(prefix) { return (prefix || 'b') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowIso() { return new Date().toISOString(); }
  function t(key, fallback) {
    const fn = PCD && PCD.i18n && PCD.i18n.t;
    if (!fn) return fallback || key;
    const v = fn(key);
    return v && v !== key ? v : (fallback || key);
  }
  function paletteFor(id) {
    return PALETTE.find(function (p) { return p.id === id; }) || PALETTE[0];
  }
  function blockTypeMeta(id) {
    return BLOCK_TYPES.find(function (b) { return b.id === id; }) || BLOCK_TYPES[0];
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  // ============ BLOCK FACTORIES ============
  // Default content per block type. Stil + layout default'ları da burada set.
  function makeBlock(type) {
    const id = uid('blk');
    const base = { id: id, type: type, layout: 'full', style: { color: 'white', size: 'md', align: 'left', weight: 'medium' } };
    switch (type) {
      case 'section_header':
        return Object.assign(base, {
          content: { text: 'SECTION TITLE' },
          style: { color: 'forest', size: 'lg', align: 'left' },
        });
      case 'big_number':
        return Object.assign(base, {
          content: { value: '0', label: 'LABEL', sub: '' },
          style: { color: 'white', size: 'xl', align: 'center' },
          layout: 'half',
        });
      case 'checklist':
        return Object.assign(base, {
          content: { items: [{ text: 'Task 1', done: false }, { text: 'Task 2', done: false }, { text: 'Task 3', done: false }] },
          style: { color: 'white', size: 'md', align: 'left' },
        });
      case 'kv':
        return Object.assign(base, {
          content: { pairs: [{ key: 'TEMP', value: '75°C' }, { key: 'TIME', value: '8 min' }] },
          style: { color: 'cream', size: 'md', align: 'left' },
        });
      case 'table':
        return Object.assign(base, {
          content: { headers: ['Item', 'Value', 'Note'], rows: [['', '', ''], ['', '', ''], ['', '', '']] },
          style: { color: 'white', size: 'md', align: 'left' },
        });
      case 'alert':
        return Object.assign(base, {
          content: { text: '⚠ IMPORTANT NOTICE', icon: '⚠' },
          style: { color: 'steak', size: 'md', align: 'center' },
        });
      case 'text':
        return Object.assign(base, {
          content: { text: '' },
          style: { color: 'white', size: 'md', align: 'left' },
        });
      case 'divider':
        return Object.assign(base, {
          content: { label: '' },
          style: { color: 'white', size: 'sm', align: 'center' },
        });
      // v2.11.14 — 4 yeni mutfak-spesifik block tipi
      case 'step_list':
        return Object.assign(base, {
          content: { items: [{ text: 'Step 1' }, { text: 'Step 2' }, { text: 'Step 3' }] },
          style: { color: 'white', size: 'md', align: 'left' },
        });
      case 'allergen_strip':
        return Object.assign(base, {
          content: { active: [] },  // active=[] → tümü görünür, hiçbiri vurgulu değil; active=['dairy','nuts'] → bu ikisi kırmızı vurgulu
          style: { color: 'cream', size: 'md', align: 'left' },
        });
      case 'doneness':
        return Object.assign(base, {
          content: { levels: [
            { label: 'RARE',     temp: '46-49°C' },
            { label: 'MED-RARE', temp: '52-54°C' },
            { label: 'MEDIUM',   temp: '57-60°C' },
            { label: 'MED-WELL', temp: '63-66°C' },
            { label: 'WELL',     temp: '70°C+'   },
          ] },
          style: { color: 'white', size: 'md', align: 'center' },
        });
      case 'time_range':
        return Object.assign(base, {
          content: { start: '08:00', end: '17:30', label: 'SERVICE HOURS' },
          style: { color: 'forest', size: 'md', align: 'center' },
        });
      // cook_sheet — transposed param table (items as columns, Time/Temp/Note as rows)
      case 'cook_sheet':
        return Object.assign(base, {
          content: {
            items: ['ITEM 1', 'ITEM 2', 'ITEM 3'],
            rows: [
              { label: 'Time', values: ['', '', ''] },
              { label: 'Temp', values: ['', '', ''] },
              { label: 'Note', values: ['', '', ''] },
            ],
          },
          style: { color: 'cream', size: 'md', align: 'center' },
        });
    }
    return base;
  }

  // ============ BUILT-IN TEMPLATES (block format) ============
  // v2.11.0 — 6 profesyonel template, hepsi block diziği. Live preview + print
  // aynı block list'i render eder (WYSIWYG).
  // v2.13.3 — 6 yeniden tasarlanmış template. Yeni mutfak block tiplerini
  // (doneness ladder, allergen strip, time range, step list) öne çıkarır;
  // renkler + boyut + layout dengeli, tek A4'e sığar, pratik servis panoları.
  const TEMPLATES = [
    // 1) Tonight's Service — kapak sayısı + diyet sayaçları + 86 list + spesyaller
    {
      id: 'tonight_service', labelKey: 'wb_tpl_tonight', label: "Tonight's Service",
      paper: 'A4', orient: 'landscape', title: "TONIGHT'S SERVICE",
      blocks: [
        { type: 'section_header', layout: 'full',  style: { color: 'forest', size: 'xl',  align: 'center' }, content: { text: "TONIGHT'S SERVICE" } },
        { type: 'big_number',     layout: 'half',  style: { color: 'brand',  size: 'xxl', align: 'center' }, content: { value: '0', label: 'COVERS BOOKED', sub: '' } },
        { type: 'big_number',     layout: 'half',  style: { color: 'amber',  size: 'xxl', align: 'center' }, content: { value: '0', label: 'WALK-IN ROOM', sub: '' } },
        { type: 'big_number',     layout: 'third', style: { color: 'mint',   size: 'lg',  align: 'center' }, content: { value: '0', label: 'VEGAN' } },
        { type: 'big_number',     layout: 'third', style: { color: 'blue',   size: 'lg',  align: 'center' }, content: { value: '0', label: 'GF / DF' } },
        { type: 'big_number',     layout: 'third', style: { color: 'red',    size: 'lg',  align: 'center' }, content: { value: '0', label: 'ALLERGY' } },
        { type: 'divider',        layout: 'full',  style: { color: 'steak',  size: 'sm',  align: 'center' }, content: { label: '86 · OUT OF STOCK' } },
        { type: 'checklist',      layout: 'full',  style: { color: 'white',  size: 'md',  align: 'left' },   content: { items: [ { text: '', done: false }, { text: '', done: false }, { text: '', done: false } ] } },
        { type: 'divider',        layout: 'full',  style: { color: 'forest', size: 'sm',  align: 'center' }, content: { label: "TONIGHT'S SPECIALS" } },
        { type: 'text',           layout: 'full',  style: { color: 'cream',  size: 'md',  align: 'left' },   content: { text: '' } },
      ],
    },
    // 2) Steak Doneness Guide — gradient doneness ladder (grill istasyonu)
    {
      id: 'doneness_guide', labelKey: 'wb_tpl_doneness', label: 'Steak Doneness Guide',
      paper: 'A4', orient: 'landscape', title: 'STEAK — DONENESS GUIDE',
      blocks: [
        { type: 'section_header', layout: 'full', style: { color: 'steak', size: 'xl', align: 'center' }, content: { text: 'STEAK — DONENESS GUIDE' } },
        { type: 'doneness',       layout: 'full', style: { color: 'white', size: 'lg', align: 'center' }, content: { levels: [
          { label: 'RARE', temp: '46-49°C' }, { label: 'MED-RARE', temp: '52-54°C' }, { label: 'MEDIUM', temp: '57-60°C' }, { label: 'MED-WELL', temp: '63-66°C' }, { label: 'WELL', temp: '70°C+' },
        ] } },
        { type: 'kv',             layout: 'full', style: { color: 'cream', size: 'md', align: 'left' }, content: { pairs: [
          { key: 'Rest time',  value: '⅓ of cook time · min 3 min' },
          { key: 'Carryover',  value: '+2-3°C after pull' },
          { key: 'Probe spot', value: 'Thickest centre · avoid bone' },
        ] } },
        { type: 'alert',          layout: 'full', style: { color: 'amber', size: 'md', align: 'center' }, content: { text: 'Probe every steak · Calibrate weekly', icon: '🌡️' } },
      ],
    },
    // 3) Allergen Awareness — allergen icon strip + tonight's flag table
    {
      id: 'allergen_board', labelKey: 'wb_tpl_allergen', label: 'Allergen Board',
      paper: 'A4', orient: 'landscape', title: 'ALLERGEN AWARENESS',
      blocks: [
        { type: 'alert',          layout: 'full', style: { color: 'steak', size: 'xl', align: 'center' }, content: { text: 'ALLERGEN AWARENESS', icon: '⚠' } },
        { type: 'allergen_strip', layout: 'full', style: { color: 'cream', size: 'md', align: 'center' }, content: { active: [] } },
        { type: 'table',          layout: 'full', style: { color: 'white', size: 'md', align: 'left' }, content: {
          headers: ['Table', 'Allergen', 'Dish affected', 'Action'],
          rows: [ ['', '', '', ''], ['', '', '', ''], ['', '', '', ''] ],
        } },
        { type: 'alert',          layout: 'full', style: { color: 'katmer', size: 'md', align: 'center' }, content: { text: 'CROSS-CONTACT: clean board · fresh oil · new gloves', icon: '🧤' } },
      ],
    },
    // 4) Prep Timeline — time range bantları + step list (AM/PM akış)
    {
      id: 'prep_timeline', labelKey: 'wb_tpl_prep_timeline', label: 'Prep Timeline',
      paper: 'A4', orient: 'portrait', title: 'PREP TIMELINE',
      blocks: [
        { type: 'section_header', layout: 'full', style: { color: 'forest', size: 'lg', align: 'center' }, content: { text: 'PREP TIMELINE — TODAY' } },
        { type: 'time_range',     layout: 'full', style: { color: 'forest', size: 'md', align: 'center' }, content: { start: '06:00', end: '12:00', label: 'AM PREP' } },
        { type: 'step_list',      layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: { items: [ { text: 'Stocks & broths on' }, { text: 'Sauces & dressings' }, { text: 'Protein portioning' }, { text: 'Garnish & herbs' } ] } },
        { type: 'divider',        layout: 'full', style: { color: 'reheat', size: 'sm', align: 'center' }, content: { label: 'SERVICE SET-UP' } },
        { type: 'time_range',     layout: 'full', style: { color: 'reheat', size: 'md', align: 'center' }, content: { start: '16:00', end: '17:30', label: 'PM SET-UP' } },
        { type: 'step_list',      layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: { items: [ { text: 'Restock the line' }, { text: 'Polish plates & cutlery' }, { text: 'Pre-service brief' } ] } },
      ],
    },
    // 5) Station Mise en Place — istasyon istasyon kontrol listeleri
    {
      id: 'mise_stations', labelKey: 'wb_tpl_mise', label: 'Station Mise en Place',
      paper: 'A4', orient: 'portrait', title: 'MISE EN PLACE',
      blocks: [
        { type: 'section_header', layout: 'full', style: { color: 'dark',   size: 'lg', align: 'center' }, content: { text: 'MISE EN PLACE — CHECK' } },
        { type: 'divider',        layout: 'full', style: { color: 'forest', size: 'sm', align: 'center' }, content: { label: 'COLD · GARDE MANGER' } },
        { type: 'checklist',      layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: { items: [ { text: 'Salads washed & spun', done: false }, { text: 'Dressings labelled & dated', done: false }, { text: 'Cold proteins portioned', done: false } ] } },
        { type: 'divider',        layout: 'full', style: { color: 'steak',  size: 'sm', align: 'center' }, content: { label: 'HOT · SAUTÉ / GRILL' } },
        { type: 'checklist',      layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: { items: [ { text: 'Sauces hot & seasoned', done: false }, { text: 'Pans & oil ready', done: false }, { text: 'Proteins tempered', done: false } ] } },
        { type: 'divider',        layout: 'full', style: { color: 'katmer', size: 'sm', align: 'center' }, content: { label: 'PASS' } },
        { type: 'checklist',      layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: { items: [ { text: 'Plates warm & wiped', done: false }, { text: 'Garnish station full', done: false }, { text: 'Dockets / printer ready', done: false } ] } },
      ],
    },
    // 6) Cook Times & Core Temps — referans tablo + alert
    {
      id: 'cook_temps', labelKey: 'wb_tpl_cook_temps', label: 'Cook Times & Core Temps',
      paper: 'A4', orient: 'landscape', title: 'COOK TIMES & CORE TEMPS',
      blocks: [
        { type: 'section_header', layout: 'full', style: { color: 'forest', size: 'xl', align: 'center' }, content: { text: 'COOK TIMES & CORE TEMPS' } },
        { type: 'table',          layout: 'full', style: { color: 'white',  size: 'md', align: 'left' }, content: {
          headers: ['Protein', 'Method', 'Core °C', 'Notes'],
          rows: [
            ['Beef',    'Sear + rest',   '63°C', 'Medium · rest 3 min'],
            ['Lamb',    'Roast',         '65°C', 'Rest 4 min'],
            ['Chicken', 'Grill / roast', '75°C', 'Probe every piece'],
            ['Pork',    'Roast',         '71°C', 'Rest 3 min'],
            ['Fish',    'Pan / steam',   '63°C', 'Just-set centre'],
          ],
        } },
        { type: 'alert',          layout: 'full', style: { color: 'amber', size: 'md', align: 'center' }, content: { text: 'Hot-hold ≥ 63°C · Calibrate probes weekly', icon: '🌡️' } },
      ],
    },
  ];

  // ============ USER TEMPLATES (LS) ============
  function loadUserTemplates() {
    try {
      const raw = localStorage.getItem(LS_KEY_USER_TEMPLATES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }
  function saveUserTemplates(arr) {
    try { localStorage.setItem(LS_KEY_USER_TEMPLATES, JSON.stringify(arr)); } catch (e) {}
  }

  // ============ STORE LAYER (cloud-synced) ============
  function activeWsId() {
    return (PCD.store && PCD.store.getActiveWorkspaceId && PCD.store.getActiveWorkspaceId()) || 'default';
  }
  function readAllRaw() {
    const wsId = activeWsId();
    const root = (PCD.store && PCD.store._read && PCD.store._read('whiteboards')) || {};
    if (Array.isArray(root)) return root;
    return root[wsId] || [];
  }
  function readAllVisible() {
    return readAllRaw().filter(function (c) { return !c._deletedAt; });
  }
  function writeAll(arr) {
    const wsId = activeWsId();
    const root = (PCD.store && PCD.store._read && PCD.store._read('whiteboards')) || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    const oldArr = Array.isArray(root) ? root : (root[wsId] || []);
    next[wsId] = arr;
    if (PCD.store && PCD.store.set) PCD.store.set('whiteboards', next);
    if (PCD.cloudPerTable && PCD.cloudPerTable.queueArraySync) {
      try { PCD.cloudPerTable.queueArraySync('whiteboards', wsId, oldArr, arr); } catch (e) {}
    }
  }
  function getActiveId() {
    return (PCD.store && PCD.store.get && PCD.store.get('prefs.whiteboardActiveId')) || null;
  }
  function setActiveId(id) {
    if (PCD.store && PCD.store.set) PCD.store.set('prefs.whiteboardActiveId', id);
  }

  function defaultCanvas(name) {
    return {
      id: uid('wb'),
      name: name || 'Untitled',
      title: (name || 'MY WHITEBOARD').toUpperCase(),
      paper: 'A4',
      orient: 'landscape',
      format: FORMAT_VERSION,
      blocks: [],
      updatedAt: nowIso(),
    };
  }

  function canvasFromTemplate(tpl, customName) {
    const blocks = (tpl.blocks || []).map(function (b) {
      return Object.assign({ id: uid('blk') }, JSON.parse(JSON.stringify(b)));
    });
    return {
      id: uid('wb'),
      name: customName || tpl.label || 'Untitled',
      title: tpl.title || (customName || tpl.label || 'WHITEBOARD').toUpperCase(),
      paper: tpl.paper || 'A4',
      orient: tpl.orient || 'landscape',
      format: FORMAT_VERSION,
      blocks: blocks,
      updatedAt: nowIso(),
    };
  }

  function migrateLegacyLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.canvases) && parsed.canvases.length) {
          const existing = readAllVisible();
          if (existing.length === 0) {
            writeAll(parsed.canvases);
            if (parsed.activeId) setActiveId(parsed.activeId);
          }
          localStorage.removeItem(LS_KEY);
          return;
        }
      }
    } catch (e) {}
    try { localStorage.removeItem(LS_KEY_OLD); } catch (e) {}
  }

  function loadStore() {
    migrateLegacyLS();
    let canvases = readAllVisible();
    // v2.11.0 — Legacy v1 (cells-based) canvases'i sıfırla. Operatör onay verdi
    // (eski veri yok). Eski format görürse sessizce sil + temiz v2 başlat.
    const v1Detected = canvases.some(function (c) { return c && c.format !== FORMAT_VERSION; });
    if (v1Detected) {
      canvases = canvases.filter(function (c) { return c && c.format === FORMAT_VERSION; });
      writeAll(canvases);
    }
    if (canvases.length === 0) {
      const initial = defaultCanvas('My Whiteboard');
      writeAll([initial]);
      setActiveId(initial.id);
      canvases = [initial];
    }
    let activeId = getActiveId();
    if (!canvases.some(function (c) { return c.id === activeId; })) {
      activeId = canvases[0].id;
      setActiveId(activeId);
    }
    return { activeId: activeId, canvases: canvases };
  }

  function saveStore(store) {
    setActiveId(store.activeId);
    const raw = readAllRaw();
    const tombstones = raw.filter(function (c) {
      return c._deletedAt && !store.canvases.some(function (x) { return x.id === c.id; });
    });
    const merged = (store.canvases || []).concat(tombstones);
    writeAll(merged);
  }

  function getActive(store) {
    return store.canvases.find(function (c) { return c.id === store.activeId; }) || store.canvases[0];
  }

  function persistCanvas(canvas) {
    const store = loadStore();
    const idx = store.canvases.findIndex(function (c) { return c.id === canvas.id; });
    canvas.updatedAt = nowIso();
    if (idx >= 0) store.canvases[idx] = canvas;
    else store.canvases.push(canvas);
    saveStore(store);
  }

  // ============ BLOCK CONTENT RENDERER (shared canvas + print) ============
  // v2.13.0 — WYSIWYG: tek inner-content üreteci. Hem interactive canvas hem
  // print AYNI HTML'i, AYNI px ölçülerini kullanır → önizleme = çıktı.
  // Wrapper (chrome) ayrı: canvas interactive (handle/tag/select), print sade.
  function renderBlockContent(block) {
    const fs = FONT_SIZES[(block.style && block.style.size) || 'md'];
    const align = (block.style && block.style.align) || 'left';

    let inner = '';
    switch (block.type) {
      case 'section_header': {
        inner =
          '<div class="wb-blk-section-header" style="font-family:\'Oswald\',-apple-system,sans-serif;font-weight:800;font-size:' + fs.headPx + 'px;letter-spacing:0.06em;text-transform:uppercase;text-align:' + align + ';line-height:1.2;padding:6px 0;">' +
            PCD.escapeHtml(block.content.text || '') +
          '</div>';
        break;
      }
      case 'big_number': {
        inner =
          '<div style="display:flex;flex-direction:column;align-items:' + (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start') + ';gap:2px;padding:4px 0;">' +
            '<div style="font-size:' + (fs.headPx * 1.6) + 'px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;">' +
              PCD.escapeHtml(block.content.value || '0') +
              (block.content.sub ? '<span style="font-size:0.5em;margin-left:4px;opacity:0.7;">' + PCD.escapeHtml(block.content.sub) + '</span>' : '') +
            '</div>' +
            '<div style="font-size:' + fs.px + 'px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;opacity:0.75;">' +
              PCD.escapeHtml(block.content.label || '') +
            '</div>' +
          '</div>';
        break;
      }
      case 'checklist': {
        const items = (block.content.items || []).map(function (it) {
          return '<div style="display:flex;align-items:flex-start;gap:8px;font-size:' + fs.px + 'px;line-height:1.45;padding:3px 0;">' +
            '<span style="flex:0 0 auto;width:14px;height:14px;border:1.5px solid currentColor;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;margin-top:2px;">' + (it.done ? '✓' : '') + '</span>' +
            '<span style="flex:1 1 auto;' + (it.done ? 'opacity:0.55;text-decoration:line-through;' : '') + 'text-align:' + align + ';">' + PCD.escapeHtml(it.text || '') + '</span>' +
          '</div>';
        }).join('');
        inner = '<div style="padding:2px 0;">' + items + '</div>';
        break;
      }
      case 'kv': {
        const pairs = (block.content.pairs || []).map(function (p) {
          return '<div style="display:flex;align-items:baseline;gap:10px;padding:4px 0;border-bottom:1px dashed rgba(127,127,127,0.25);font-size:' + fs.px + 'px;line-height:1.4;">' +
            '<span style="flex:0 0 auto;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;opacity:0.8;min-width:80px;">' + PCD.escapeHtml(p.key || '') + '</span>' +
            '<span style="flex:1 1 auto;text-align:right;font-variant-numeric:tabular-nums;">' + PCD.escapeHtml(p.value || '') + '</span>' +
          '</div>';
        }).join('');
        inner = '<div>' + pairs + '</div>';
        break;
      }
      case 'table': {
        const headers = (block.content.headers || []).map(function (h) {
          return '<th style="padding:5px 8px;line-height:1.5;text-align:left;font-size:' + (fs.px - 1) + 'px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid currentColor;background:rgba(127,127,127,0.08);">' + PCD.escapeHtml(h || '') + '</th>';
        }).join('');
        const rows = (block.content.rows || []).map(function (row) {
          const cells = (row || []).map(function (c) {
            return '<td style="padding:5px 8px;line-height:1.5;font-size:' + fs.px + 'px;border-bottom:1px solid rgba(127,127,127,0.18);vertical-align:top;">' + PCD.escapeHtml(c || '') + '</td>';
          }).join('');
          return '<tr>' + cells + '</tr>';
        }).join('');
        inner = '<table style="width:100%;border-collapse:collapse;"><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
        break;
      }
      case 'alert': {
        inner =
          '<div style="display:flex;align-items:center;justify-content:' + (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start') + ';gap:10px;font-size:' + fs.headPx + 'px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;line-height:1.25;padding:8px 0;">' +
            (block.content.icon ? '<span style="font-size:1.1em;">' + PCD.escapeHtml(block.content.icon) + '</span>' : '') +
            '<span>' + PCD.escapeHtml(block.content.text || '') + '</span>' +
          '</div>';
        break;
      }
      case 'text': {
        const txt = block.content.text || '';
        inner = '<div style="font-size:' + fs.px + 'px;line-height:1.5;white-space:pre-wrap;text-align:' + align + ';padding:4px 0;">' + (txt ? PCD.escapeHtml(txt) : '<span style="opacity:0.35;font-style:italic;">' + PCD.escapeHtml(t('wb_empty_text', 'Empty text block — tap to edit')) + '</span>') + '</div>';
        break;
      }
      case 'divider': {
        const lbl = block.content && block.content.label;
        if (lbl) {
          inner =
            '<div style="display:flex;align-items:center;gap:12px;padding:6px 0;">' +
              '<div style="flex:1;height:1px;background:currentColor;opacity:0.3;"></div>' +
              '<div style="font-size:' + fs.px + 'px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7;">' + PCD.escapeHtml(lbl) + '</div>' +
              '<div style="flex:1;height:1px;background:currentColor;opacity:0.3;"></div>' +
            '</div>';
        } else {
          inner = '<div style="height:1px;background:currentColor;opacity:0.25;margin:8px 0;"></div>';
        }
        break;
      }
      // v2.11.14 — 4 yeni mutfak-spesifik block tipi
      case 'step_list': {
        const items = (block.content.items || []).map(function (it, n) {
          return '<div style="display:flex;align-items:flex-start;gap:10px;padding:4px 0;font-size:' + fs.px + 'px;line-height:1.4;">' +
            '<span style="flex:0 0 auto;width:' + (fs.px * 1.8) + 'px;height:' + (fs.px * 1.8) + 'px;border-radius:50%;background:rgba(127,127,127,0.18);color:currentColor;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:' + (fs.px * 0.9) + 'px;font-variant-numeric:tabular-nums;">' + (n + 1) + '</span>' +
            '<span style="flex:1 1 auto;text-align:' + align + ';">' + PCD.escapeHtml(it.text || '') + '</span>' +
          '</div>';
        }).join('');
        inner = '<div>' + items + '</div>';
        break;
      }
      case 'allergen_strip': {
        const all = (PCD.allergensDB && PCD.allergensDB.list) || [];
        const active = (block.content.active || []).map(function (s) { return (s || '').toLowerCase(); });
        // v2.12.2 — Show only the allergens marked "contains". With all 14 the
        // labels don't fit (clipped to icons, worst in print). A dish has 2–4
        // allergens, so showing only the active ones keeps labels legible and
        // makes canvas + print match. If none are marked, show the full faded set.
        const shown = active.length ? all.filter(function (a) { return active.indexOf(a.key) >= 0; }) : all;
        const cells = shown.map(function (a) {
          const isActive = active.indexOf(a.key) >= 0;
          return '<div style="flex:1;min-width:0;text-align:center;padding:4px 2px;' +
              (isActive ? 'background:rgba(220,38,38,0.18);color:#a23b2d;border-radius:4px;font-weight:800;' : 'opacity:0.5;') +
            '">' +
            '<div style="font-size:' + (fs.headPx * 0.9) + 'px;line-height:1;">' + PCD.escapeHtml(a.icon || '?') + '</div>' +
            '<div style="font-size:' + (fs.px * 0.65) + 'px;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(a.key) + '</div>' +
          '</div>';
        }).join('');
        inner = '<div style="display:flex;align-items:center;gap:2px;padding:4px 0;">' + cells + '</div>';
        break;
      }
      case 'doneness': {
        // Gradient red→brown 5-segment + label + temp under each
        const colors = ['#c92a2a', '#b8543b', '#a36b3a', '#7d5a2c', '#3b2a1e'];
        const cells = (block.content.levels || []).map(function (lv, i) {
          const bg = colors[i] || colors[colors.length - 1];
          return '<div style="flex:1;min-width:0;background:' + bg + ';color:white;padding:8px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-right:1px solid rgba(255,255,255,0.15);">' +
            '<div style="font-size:' + (fs.headPx * 0.7) + 'px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;line-height:1.1;">' + PCD.escapeHtml(lv.label || '') + '</div>' +
            '<div style="font-size:' + (fs.px * 0.9) + 'px;font-weight:700;font-variant-numeric:tabular-nums;opacity:0.95;margin-top:3px;">' + PCD.escapeHtml(lv.temp || '') + '</div>' +
          '</div>';
        }).join('');
        inner = '<div style="display:flex;border-radius:4px;overflow:hidden;">' + cells + '</div>';
        break;
      }
      case 'time_range': {
        // Yatay band: [start] ━━━━━━━━━━ [end] · altta label
        inner =
          '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;font-variant-numeric:tabular-nums;">' +
            '<div style="font-size:' + (fs.headPx * 0.85) + 'px;font-weight:900;letter-spacing:-0.01em;flex:0 0 auto;">' + PCD.escapeHtml(block.content.start || '00:00') + '</div>' +
            '<div style="flex:1 1 auto;position:relative;height:6px;background:currentColor;opacity:0.18;border-radius:3px;">' +
              '<div style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:currentColor;opacity:1;"></div>' +
              '<div style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:currentColor;opacity:1;"></div>' +
            '</div>' +
            '<div style="font-size:' + (fs.headPx * 0.85) + 'px;font-weight:900;letter-spacing:-0.01em;flex:0 0 auto;">' + PCD.escapeHtml(block.content.end || '00:00') + '</div>' +
          '</div>' +
          (block.content.label ? '<div style="text-align:center;font-size:' + fs.px + 'px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85;margin-top:6px;">' + PCD.escapeHtml(block.content.label) + '</div>' : '');
        break;
      }
      // cook_sheet — transposed parameter table: items as columns, rows as Time/Temp/Note
      case 'cook_sheet': {
        const csItems = (block.content.items || []);
        const csRows  = (block.content.rows  || []);
        const corner = '<th style="width:28px;padding:4px 6px;border-bottom:2px solid currentColor;border-right:1px solid rgba(127,127,127,0.25);background:rgba(127,127,127,0.08);"></th>';
        const colHeaders = csItems.map(function (item) {
          return '<th style="padding:6px 8px;text-align:center;font-size:' + (fs.px - 1) + 'px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid currentColor;border-left:1px solid rgba(127,127,127,0.2);background:rgba(127,127,127,0.08);">' +
            PCD.escapeHtml(item || '') + '</th>';
        }).join('');
        const tableRows = csRows.map(function (row, ri) {
          const isLast = ri === csRows.length - 1;
          const bb = isLast ? 'none' : '1px solid rgba(127,127,127,0.18)';
          const rowLabel = '<td style="padding:4px 3px;text-align:center;vertical-align:middle;border-bottom:' + bb + ';border-right:1px solid rgba(127,127,127,0.25);background:rgba(127,127,127,0.05);">' +
            '<span style="display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);font-size:' + Math.round(fs.px * 0.72) + 'px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;opacity:0.65;">' +
            PCD.escapeHtml(row.label || '') + '</span>' +
          '</td>';
          const cells = csItems.map(function (_, ci) {
            const val = (row.values || [])[ci] || '';
            return '<td style="padding:6px 8px;text-align:center;font-size:' + fs.px + 'px;border-bottom:' + bb + ';border-left:1px solid rgba(127,127,127,0.18);font-variant-numeric:tabular-nums;vertical-align:middle;">' +
              (val ? PCD.escapeHtml(val) : '<span style="opacity:0.2;">—</span>') +
            '</td>';
          }).join('');
          return '<tr>' + rowLabel + cells + '</tr>';
        }).join('');
        inner = '<table style="width:100%;border-collapse:collapse;"><thead><tr>' + corner + colHeaders + '</tr></thead><tbody>' + tableRows + '</tbody></table>';
        break;
      }
      default:
        inner = '<div style="font-style:italic;opacity:0.5;">Unknown block type: ' + PCD.escapeHtml(block.type) + '</div>';
    }

    return inner;
  }

  // v2.13.0 — Block kutu stili (bg/renk/weight/padding) — canvas + print ORTAK.
  // divider & doneness şeffaf + padding yok (kendi iç görselleri var).
  function blockBoxStyle(block) {
    const palette = paletteFor(block.style && block.style.color);
    const weight = WEIGHTS[(block.style && block.style.weight) || 'medium'];
    if (block.type === 'divider' || block.type === 'doneness') {
      return 'background:transparent;color:' + palette.text + ';font-weight:' + weight + ';padding:0;';
    }
    return 'background:' + palette.bg + ';color:' + palette.text + ';font-weight:' + weight + ';padding:10px 12px;';
  }

  // ============ BLOCK RENDERER (interactive canvas wrapper) ============
  // Selected ise vurgu. Inner content renderBlockContent'ten (print ile ortak).
  function renderBlockHtml(block, idx, selectedIdx) {
    const layout = block.layout || 'full';
    const span = layoutSpan(layout);
    const isSelected = idx === selectedIdx;
    const meta = blockTypeMeta(block.type);
    return '' +
      '<div class="wb-block wb-block-' + block.type + (isSelected ? ' wb-block-selected' : '') + '" data-blk-idx="' + idx + '" data-blk-id="' + PCD.escapeHtml(block.id) + '" data-layout="' + layout + '" style="' +
        'grid-column:span ' + span + ';' +
        'position:relative;' + blockBoxStyle(block) +
        'border-radius:6px;margin:0;cursor:pointer;' +
        'transition:box-shadow 0.12s ease, transform 0.12s ease;' +
      '">' +
        '<div class="wb-block-handle" style="position:absolute;top:6px;left:6px;width:18px;height:18px;display:none;align-items:center;justify-content:center;cursor:grab;opacity:0.5;font-size:14px;">⋮⋮</div>' +
        renderBlockContent(block) +
        '<div class="wb-block-tag" style="position:absolute;top:4px;right:6px;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.4;pointer-events:none;">' + PCD.escapeHtml(t(meta.labelKey, meta.label)) + '</div>' +
      '</div>';
  }

  // ============ SHEET RENDERER (interactive canvas preview) ============
  function renderSheet(canvas, selectedIdx) {
    const blocks = canvas.blocks || [];
    if (blocks.length === 0) {
      return '<div class="wb-empty-state" style="padding:48px 24px;text-align:center;color:rgba(127,127,127,0.7);border:2px dashed rgba(127,127,127,0.25);border-radius:12px;">' +
          '<div style="font-size:42px;margin-bottom:8px;">📋</div>' +
          '<div style="font-size:15px;font-weight:700;margin-bottom:4px;">' + PCD.escapeHtml(t('wb_empty_title', 'Empty canvas')) + '</div>' +
          '<div style="font-size:13px;">' + PCD.escapeHtml(t('wb_empty_subtitle', 'Add blocks from the palette or load a template.')) + '</div>' +
        '</div>';
    }
    return '<div class="wb-grid12" style="display:grid;grid-template-columns:repeat(12,1fr);gap:10px;">' +
      blocks.map(function (b, i) { return renderBlockHtml(b, i, selectedIdx); }).join('') +
    '</div>';
  }

  // ============ MAIN RENDER ============
  // UI state — module-level so render() çağrıları arasında korunur (re-render
  // sonrası seçili block kaybolmasın).
  let _ui = {
    selectedBlockIdx: -1,
    bottomSheetOpen: false,
  };

  function render(view) {
    const store = loadStore();
    const canvas = getActive(store);
    const canvasCount = store.canvases.length;

    // Selected idx clamp
    if (_ui.selectedBlockIdx >= (canvas.blocks || []).length) _ui.selectedBlockIdx = -1;

    const html =
      buildStyles() +
      '<div id="wbRoot">' +
        buildHeader(t) +
        buildCanvasSelector(store, canvasCount) +
        buildCanvasMeta(canvas) +
        '<div class="wb-workspace" style="display:grid;grid-template-columns:220px minmax(0, 1fr) 280px;gap:16px;margin-top:16px;">' +
          buildPalettePane() +
          buildCanvasPane(canvas) +
          buildInspectorPane(canvas) +
        '</div>' +
        buildBottomSheet() +
      '</div>';

    view.innerHTML = html;
    const wbRoot = view.querySelector('#wbRoot');

    // ============ WIRE EVENTS ============
    wireHeader(wbRoot, canvas);
    wireCanvasSelector(wbRoot, store);
    wireCanvasMeta(wbRoot, canvas);
    wirePalette(wbRoot, canvas, view);
    wireCanvasPane(wbRoot, canvas, view);
    wireInspector(wbRoot, canvas, view);
    wireBottomSheet(wbRoot, canvas, view);

    // v2.13.0 — Gerçek A4-px canvas'ı viewport'a sığacak şekilde ölçekle.
    // v2.13.6 — applyCanvasScale, pane henüz layout almadıysa (clientWidth=0) kendini
    // sonraki frame'de tekrar çağırır (bounded retry) → ilk yükleme garanti ölçeklenir.
    // RO yalnızca sonraki resize/zoom için (ilk callback'i bazı tarayıcılarda güvenilmez).
    _scaleRetries = 0;
    applyCanvasScale();

    // v2.11.2 — Overflow detection: block list page boundary'i aşıyor mu?
    checkOverflow(wbRoot);

    // v2.13.0 — ResizeObserver: pane ilk layout'u aldığında (lazy load) VE her
    // genişlik değişiminde (pencere resize / responsive) scale'i güncelle. rAF
    // polling'e göre daha sağlam: 0-width lazy-load durumunu kendiliğinden iyileştirir,
    // scale(0) ile canvas kaybolması imkânsız. Re-render'da eski observer kapatılır.
    const vpEl = wbRoot.querySelector('#wbCanvasViewport');
    if (window.ResizeObserver && vpEl) {
      if (_canvasRO) { try { _canvasRO.disconnect(); } catch (e) {} }
      _canvasRO = new ResizeObserver(function () { applyCanvasScale(); });
      _canvasRO.observe(vpEl);
    } else if (!_resizeBound) {
      // Fallback (ResizeObserver yoksa): pencere resize.
      _resizeBound = true;
      window.addEventListener('resize', function () {
        if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
        _resizeRaf = requestAnimationFrame(function () { applyCanvasScale(); });
      });
    }
  }
  let _canvasRO = null;
  let _resizeBound = false;
  let _resizeRaf = null;
  let _scaleRetries = 0;

  // v2.11.2 — Canvas içeriği aspect-ratio frame'i aşıyorsa "wb-canvas-overflowing"
  // class eklenir (CSS warn gradient + fit tag gizler). Aşmıyorsa "✓ Fits one page".
  // Sheet inner padding (14px) + block gap (10px) frame içinde sayılır.
  // requestAnimationFrame ile DOM layout sonrası ölçüm.
  function checkOverflow(root) {
    if (!root) root = document.getElementById('wbRoot');
    if (!root) return;
    const canvasEl = root.querySelector('#wbCanvas');
    if (!canvasEl) return;
    requestAnimationFrame(function () {
      // scrollHeight = içerik + padding; clientHeight = visible area
      const fits = canvasEl.scrollHeight <= canvasEl.clientHeight + 2;  // 2px tolerance
      if (fits) {
        canvasEl.classList.remove('wb-canvas-overflowing');
        const fitTag = canvasEl.querySelector('#wbFitTag');
        if (fitTag) fitTag.style.display = (canvas_blockCount(canvasEl) > 0 ? 'block' : 'none');
      } else {
        canvasEl.classList.add('wb-canvas-overflowing');
        const fitTag = canvasEl.querySelector('#wbFitTag');
        if (fitTag) fitTag.style.display = 'none';
      }
    });
  }
  function canvas_blockCount(canvasEl) {
    return canvasEl.querySelectorAll('.wb-block').length;
  }

  // ============ STYLES (inline, scoped to #wbRoot) ============
  function buildStyles() {
    return '<style>' +
      '@import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700;800&family=Barlow:wght@400;500;600;700;800;900&display=swap");' +
      '#wbRoot { font-family: "Barlow", -apple-system, system-ui, sans-serif; }' +
      '#wbRoot .wb-pane { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-height: 200px; }' +
      '#wbRoot .wb-pane-title { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); margin-bottom: 10px; display:flex; align-items:center; gap:6px; }' +
      // v2.11.2 — Live preview canvas A4/A3 page boundary olarak render edilir.
      // aspect-ratio paper+orient'e göre değişir, overflow:hidden ile sayfa
      // sınırı net görünür. Block list sığamazsa overflow detect + kırmızı
      // gradient uyarı (alttan slide up). Operatör 100+ block koyarsa sığmadığını
      // anında görür.
      // v2.13.0 WYSIWYG — Canvas artık GERÇEK A4/A3 px boyutunda (genişlik/yükseklik
      // inline, mm×3.7795). transform:scale ile viewport'a sığdırılır → ekrandaki
      // önizleme print'in birebir küçültülmüş hali. checkOverflow gerçek sayfa
      // yüksekliğini ölçer (transform scrollHeight/clientHeight'i bozmaz).
      // min-width:0 ŞART — yoksa viewport gerçek-A4 canvas'ın (794px+) min-content
      // genişliğinin altına inemez, grid track 794'te kilitlenir, sayfa yatay taşar
      // (mobilde 794px canvas 375px ekrana sığmaz). 0 ile küçülür, transform:scale sığdırır.
      '#wbRoot .wb-canvas-pane { min-width: 0; }' +
      '#wbRoot .wb-canvas-viewport { width: 100%; overflow: hidden; min-width: 0; }' +
      '#wbRoot .wb-canvas { display: flex; flex-direction: column; gap: 14px; padding: 14px; background: #ffffff; color: #111827; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06); position: relative; overflow: hidden; box-sizing: border-box; transform-origin: top left; }' +
      '#wbRoot .wb-canvas-page-label { position: absolute; top: 6px; right: 10px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(0,0,0,0.32); pointer-events: none; font-family: "Oswald", sans-serif; z-index: 4; }' +
      '#wbRoot .wb-canvas-corner { position: absolute; width: 14px; height: 14px; pointer-events: none; z-index: 3; }' +
      '#wbRoot .wb-canvas-corner.tl { top: 4px; left: 4px; border-top: 2px solid rgba(0,0,0,0.18); border-left: 2px solid rgba(0,0,0,0.18); }' +
      '#wbRoot .wb-canvas-corner.tr { top: 4px; right: 4px; border-top: 2px solid rgba(0,0,0,0.18); border-right: 2px solid rgba(0,0,0,0.18); }' +
      '#wbRoot .wb-canvas-corner.bl { bottom: 4px; left: 4px; border-bottom: 2px solid rgba(0,0,0,0.18); border-left: 2px solid rgba(0,0,0,0.18); }' +
      '#wbRoot .wb-canvas-corner.br { bottom: 4px; right: 4px; border-bottom: 2px solid rgba(0,0,0,0.18); border-right: 2px solid rgba(0,0,0,0.18); }' +
      '#wbRoot .wb-canvas-overflow-warn { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(220,38,38,0.95) 0%, rgba(220,38,38,0.75) 60%, transparent 100%); color: white; padding: 36px 14px 12px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none; z-index: 5; display: none; }' +
      '#wbRoot .wb-canvas.wb-canvas-overflowing .wb-canvas-overflow-warn { display: block; }' +
      '#wbRoot .wb-canvas-fit-tag { position: absolute; bottom: 8px; left: 10px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(0,0,0,0.4); background: rgba(255,255,255,0.85); padding: 2px 6px; border-radius: 3px; z-index: 4; pointer-events: none; }' +
      '#wbRoot .wb-row { width: 100%; }' +
      '#wbRoot .wb-block { box-shadow: 0 0 0 1px rgba(127,127,127,0.18), 0 1px 2px rgba(0,0,0,0.05); user-select: none; }' +
      '#wbRoot .wb-block:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(127,127,127,0.25), 0 3px 8px rgba(0,0,0,0.10); }' +
      '#wbRoot .wb-block-selected { box-shadow: 0 0 0 2px #16a34a, 0 4px 12px rgba(22,163,74,0.18) !important; transform: translateY(-1px); }' +
      '#wbRoot .wb-block:hover .wb-block-handle { display: inline-flex !important; }' +
      '#wbRoot .wb-block.dragging { opacity: 0.4; }' +
      '#wbRoot .wb-block.drag-over-top { box-shadow: 0 -3px 0 0 #16a34a !important; }' +
      '#wbRoot .wb-block.drag-over-bottom { box-shadow: 0 3px 0 0 #16a34a !important; }' +
      '#wbRoot .wb-palette-item { display:flex; align-items:center; gap:8px; padding:8px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.12s ease, border-color 0.12s ease; user-select: none; }' +
      '#wbRoot .wb-palette-item:hover { background: var(--brand-50); border-color: var(--brand-600); color: var(--brand-700); }' +
      '#wbRoot .wb-palette-item-icon { flex: 0 0 auto; width: 22px; height: 22px; display:inline-flex; align-items:center; justify-content:center; color: var(--brand-600); }' +
      '#wbRoot .wb-inspector-section { padding: 10px 0; border-bottom: 1px solid var(--border); }' +
      '#wbRoot .wb-inspector-section:last-child { border-bottom: 0; }' +
      '#wbRoot .wb-inspector-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); margin-bottom: 6px; }' +
      '#wbRoot .wb-swatch-row { display:flex; flex-wrap: wrap; gap: 5px; }' +
      '#wbRoot .wb-swatch { width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; flex: 0 0 auto; transition: transform 0.12s ease; }' +
      '#wbRoot .wb-swatch:hover { transform: scale(1.15); }' +
      '#wbRoot .wb-swatch.active { box-shadow: 0 0 0 2px #16a34a; }' +
      '#wbRoot .wb-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }' +
      '#wbRoot .wb-seg button { background: var(--surface-2); border: 0; padding: 6px 10px; font-size: 12px; font-weight: 600; color: var(--text-2); cursor: pointer; }' +
      '#wbRoot .wb-seg button.active { background: var(--brand-50); color: var(--brand-700); font-weight: 800; box-shadow: inset 0 0 0 1px var(--brand-600); }' +
      '#wbRoot .wb-list-item { display:flex; gap:6px; align-items:center; padding:4px 0; }' +
      '#wbRoot .wb-list-item input[type="text"] { flex:1; padding:5px 8px; border:1px solid var(--border); border-radius:5px; background: var(--surface-1); color: var(--text); font-size: 12px; }' +
      '#wbRoot .wb-list-item .wb-icon-btn { flex:0 0 auto; }' +
      '#wbRoot .wb-icon-btn { background: transparent; border: 0; cursor: pointer; padding: 4px 6px; color: var(--text-3); border-radius: 4px; font-size: 14px; line-height: 1; }' +
      '#wbRoot .wb-icon-btn:hover { background: var(--surface-2); color: var(--text); }' +
      '#wbRoot .wb-icon-btn.danger:hover { background: rgba(220,38,38,0.1); color: #dc2626; }' +
      '#wbRoot .wb-bottom-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9998; display: none; opacity: 0; transition: opacity 0.18s ease; }' +
      '#wbRoot .wb-bottom-sheet-backdrop.open { display: block; opacity: 1; }' +
      '#wbRoot .wb-bottom-sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 85vh; overflow-y: auto; background: var(--surface); border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; box-shadow: 0 -8px 32px rgba(0,0,0,0.25); z-index: 9999; padding: 14px 16px env(safe-area-inset-bottom) 16px; transform: translateY(100%); transition: transform 0.22s cubic-bezier(0.32,0.72,0,1); }' +
      '#wbRoot .wb-bottom-sheet.open { transform: translateY(0); }' +
      '#wbRoot .wb-bottom-sheet-grab { width: 36px; height: 4px; background: var(--border-strong); border-radius: 2px; margin: 4px auto 12px; }' +
      '#wbRoot .wb-bottom-sheet-title { font-size: 14px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; }' +
      // RESPONSIVE — mobile breakpoint
      '@media (max-width: 900px) {' +
        '#wbRoot .wb-workspace { grid-template-columns: 1fr !important; }' +
        '#wbRoot .wb-palette-pane-desktop, #wbRoot .wb-inspector-pane-desktop { display: none !important; }' +
        '#wbRoot .wb-mobile-add-bar { display: flex !important; }' +
        '#wbRoot .wb-block-tag { display: none; }' +
      '}' +
      '@media (min-width: 901px) {' +
        '#wbRoot .wb-mobile-add-bar { display: none !important; }' +
      '}' +
      '@media (hover: none) and (pointer: coarse) {' +
        '#wbRoot .wb-block-handle { display: inline-flex !important; opacity: 0.7; }' +
      '}' +
    '</style>';
  }

  // ============ HEADER ============
  function buildHeader() {
    return '' +
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">📝 ' + PCD.escapeHtml(t('whiteboard_title', 'Kitchen Whiteboard')) + '</div>' +
          '<div class="page-subtitle">' + PCD.escapeHtml(t('whiteboard_subtitle_v2', 'Block-based composer for kitchen reference sheets — mise en place, cook times, allergen alerts')) + '</div>' +
        '</div>' +
        '<div class="page-header-actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
          '<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;background:var(--brand-50);border:1px solid var(--brand-200,#bbf7d0);border-radius:6px;font-size:11px;font-weight:700;color:var(--brand-700);letter-spacing:0.03em;text-transform:uppercase;">' + PCD.icon('check', 12) + '<span>' + PCD.escapeHtml(t('whiteboard_autosaved', 'Auto-saved')) + '</span></span>' +
          '<button class="btn btn-outline btn-sm" id="wbTemplateBtn">' + PCD.icon('book-open', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_templates', 'Templates')) + '</span></button>' +
          '<button class="btn btn-outline btn-sm" id="wbClearBtn">' + PCD.icon('refresh', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_reset', 'Reset')) + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="wbPrintBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('print', 'Print')) + '</span></button>' +
        '</div>' +
      '</div>';
  }

  // ============ CANVAS SELECTOR ============
  function buildCanvasSelector(store, canvasCount) {
    return '' +
      '<div class="card mb-3" style="padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;">' +
          PCD.escapeHtml(t('whiteboard_canvas', 'Canvas')) + ':' +
        '</div>' +
        '<select id="wbCanvasSelect" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;">' +
          store.canvases.map(function (c) {
            return '<option value="' + PCD.escapeHtml(c.id) + '"' + (c.id === store.activeId ? ' selected' : '') + '>' + PCD.escapeHtml(c.name || c.title || 'Untitled') + '</option>';
          }).join('') +
        '</select>' +
        '<button class="btn btn-outline btn-sm" id="wbNewCanvasBtn">' + PCD.icon('plus', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_new_canvas', 'New')) + '</span></button>' +
        (canvasCount > 1 ? '<button class="btn btn-outline btn-sm" id="wbDeleteCanvasBtn" style="color:var(--danger);" title="' + PCD.escapeHtml(t('whiteboard_delete_canvas', 'Delete this canvas')) + '">' + PCD.icon('trash', 14) + '</button>' : '') +
      '</div>';
  }

  // ============ CANVAS META (title / paper / orientation) ============
  function buildCanvasMeta(canvas) {
    const paperBtns = ['A4', 'A3'].map(function (p) {
      return '<button type="button" class="btn btn-secondary btn-sm' + (canvas.paper === p ? ' active' : '') + '" data-wb-paper="' + p + '" style="flex:1;">' + p + '</button>';
    }).join('');
    const orientBtns = [
      { id: 'portrait',  label: t('kc_portrait', 'Portrait') },
      { id: 'landscape', label: t('kc_landscape', 'Landscape') },
    ].map(function (o) {
      return '<button type="button" class="btn btn-secondary btn-sm' + (canvas.orient === o.id ? ' active' : '') + '" data-wb-orient="' + o.id + '" style="flex:1;">' + PCD.escapeHtml(o.label) + '</button>';
    }).join('');

    return '' +
      '<div class="card mb-3" style="padding:14px;">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;align-items:end;">' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('whiteboard_title_label', 'Title')) + '</div>' +
            '<input id="wbTitle" type="text" class="input" maxlength="80" value="' + PCD.escapeHtml(canvas.title || '') + '" style="width:100%;">' +
          '</div>' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('whiteboard_paper', 'Paper')) + '</div>' +
            '<div class="flex gap-1">' + paperBtns + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('kc_orientation', 'Orientation')) + '</div>' +
            '<div class="flex gap-1">' + orientBtns + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="text-muted" style="margin-top:10px;font-size:12px;line-height:1.5;">' +
          '💡 ' + PCD.escapeHtml(t('whiteboard_tip_v2', 'Add blocks from the left palette (desktop) or the + button (mobile). Click a block to edit its style on the right or in the bottom sheet.')) +
        '</div>' +
      '</div>';
  }

  // ============ PALETTE PANE (desktop left) ============
  function buildPalettePane() {
    const items = BLOCK_TYPES.map(function (b) {
      return '<div class="wb-palette-item" data-add-block="' + b.id + '" title="' + PCD.escapeHtml(t(b.labelKey, b.label)) + '">' +
        '<span class="wb-palette-item-icon" style="font-size:16px;line-height:1;">' + b.glyph + '</span>' +
        '<span>' + PCD.escapeHtml(t(b.labelKey, b.label)) + '</span>' +
      '</div>';
    }).join('');
    return '' +
      '<div class="wb-pane wb-palette-pane-desktop">' +
        '<div class="wb-pane-title">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_palette_title', 'Add block')) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' + items + '</div>' +
      '</div>';
  }

  // ============ CANVAS PANE (center) ============
  function buildCanvasPane(canvas) {
    const sheetHtml = renderSheet(canvas, _ui.selectedBlockIdx);
    // Mobile add-block bar (operatör mobil ekranında bottom add bar görür)
    const mobileAddBar =
      '<div class="wb-mobile-add-bar" style="display:none;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
        BLOCK_TYPES.map(function (b) {
          return '<button type="button" class="btn btn-secondary btn-sm" data-add-block="' + b.id + '" style="flex:1;min-width:90px;font-size:11px;padding:6px 8px;display:inline-flex;align-items:center;gap:4px;">' +
            '<span style="font-size:13px;">' + b.glyph + '</span> <span>' + PCD.escapeHtml(t(b.labelKey, b.label)) + '</span>' +
          '</button>';
        }).join('') +
      '</div>';
    // v2.13.0 — Canvas GERÇEK A4/A3 px boyutunda (mm × 96/25.4). transform:scale
    // (applyCanvasScale) viewport'a sığdırır. Corner markers + page label rozet +
    // overflow uyarısı (block list sayfaya sığmıyorsa alttan kırmızı gradient).
    const aspectKey = (canvas.paper || 'A4') + '_' + (canvas.orient || 'landscape');
    const pageLabel = (canvas.paper || 'A4') + ' · ' + (canvas.orient || 'landscape');
    const px = pagePx(canvas);
    return '' +
      '<div class="wb-pane wb-canvas-pane">' +
        '<div class="wb-pane-title" style="justify-content:space-between;">' +
          '<span>' + PCD.icon('grid', 13) + ' ' + PCD.escapeHtml(t('wb_canvas_title', 'Canvas')) + '</span>' +
          '<span style="font-weight:600;color:var(--text-3);">' + (canvas.blocks || []).length + ' ' + PCD.escapeHtml(t('wb_blocks_count', 'blocks')) + '</span>' +
        '</div>' +
        mobileAddBar +
        '<div class="wb-canvas-viewport" id="wbCanvasViewport">' +
          '<div class="wb-canvas" id="wbCanvas" data-aspect="' + aspectKey + '" style="width:' + px.w + 'px;height:' + px.h + 'px;">' +
            '<div class="wb-canvas-corner tl"></div>' +
            '<div class="wb-canvas-corner tr"></div>' +
            '<div class="wb-canvas-corner bl"></div>' +
            '<div class="wb-canvas-corner br"></div>' +
            '<div class="wb-canvas-page-label">' + PCD.escapeHtml(pageLabel) + '</div>' +
            // v2.11.2 — Block list ayrı inner wrapper'a yerleştirilir. Bu sayede
            // light commit'lerde sadece block list innerHTML değişir, corner/label/
            // warn frame yapısı korunur.
            '<div class="wb-canvas-blocks" id="wbCanvasBlocks" style="display:flex;flex-direction:column;gap:14px;flex:1 1 auto;min-height:0;">' + sheetHtml + '</div>' +
            '<div class="wb-canvas-fit-tag" id="wbFitTag" style="display:none;">' + PCD.escapeHtml(t('wb_fits_one_page', '✓ Fits one page')) + '</div>' +
            '<div class="wb-canvas-overflow-warn">⚠ ' + PCD.escapeHtml(t('wb_overflow_warn', 'Will not fit on one printed page — remove blocks or use larger paper (A3)')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // v2.13.0 — Sayfa boyutunu px olarak döndür (96dpi: 1mm = 96/25.4 px).
  // Canvas bu boyutta render edilir; print @page aynı mm boyutunu kullanır.
  function pagePx(canvas) {
    const MM = 96 / 25.4; // 3.77953
    const isLand = (canvas.orient || 'landscape') === 'landscape';
    let wMM, hMM;
    if ((canvas.paper || 'A4') === 'A3') { wMM = isLand ? 420 : 297; hMM = isLand ? 297 : 420; }
    else                                 { wMM = isLand ? 297 : 210; hMM = isLand ? 210 : 297; }
    return { w: Math.round(wMM * MM), h: Math.round(hMM * MM) };
  }

  // v2.13.0 — Canvas'ı viewport genişliğine göre ölçekle. Gerçek A4-px container
  // transform:scale ile küçültülür; viewport yüksekliği ölçekli yüksekliğe set
  // edilir (scale layout box'ı değiştirmez, bu yüzden manuel ayar gerekir).
  function applyCanvasScale() {
    const vp = document.getElementById('wbCanvasViewport');
    const cv = document.getElementById('wbCanvas');
    if (!vp || !cv) return;
    const pageWpx = parseFloat(cv.style.width) || cv.offsetWidth;
    const pageHpx = parseFloat(cv.style.height) || cv.offsetHeight;
    if (!pageWpx || !pageHpx) return;
    const avail = vp.clientWidth;
    // v2.13.6 — Pane henüz layout almadıysa (lazy load / boot) clientWidth=0.
    // scale(0) ile canvas kaybolmasın: bir sonraki frame'de tekrar dene (bounded;
    // canvas DOM'dan kalkarsa yukarıdaki !vp guard döngüyü durdurur).
    if (!avail) {
      if (_scaleRetries < 60) { _scaleRetries++; requestAnimationFrame(applyCanvasScale); }
      return;
    }
    _scaleRetries = 0;
    let scale = avail / pageWpx;
    if (scale > 1) scale = 1; // büyütme yok — gerçek boyutu aşma
    cv.style.transform = 'scale(' + scale + ')';
    vp.style.height = Math.ceil(pageHpx * scale) + 'px';
  }

  // ============ INSPECTOR PANE (desktop right) ============
  function buildInspectorPane(canvas) {
    const idx = _ui.selectedBlockIdx;
    const block = (canvas.blocks || [])[idx];
    if (!block) {
      return '' +
        '<div class="wb-pane wb-inspector-pane-desktop">' +
          '<div class="wb-pane-title">' + PCD.icon('settings', 13) + ' ' + PCD.escapeHtml(t('wb_inspector_title', 'Block style')) + '</div>' +
          '<div style="font-size:12px;color:var(--text-3);text-align:center;padding:24px 8px;line-height:1.5;">' +
            '<div style="font-size:32px;margin-bottom:8px;opacity:0.4;">👆</div>' +
            PCD.escapeHtml(t('wb_inspector_empty', 'Click a block on the canvas to edit its content and style.')) +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div class="wb-pane wb-inspector-pane-desktop">' +
        '<div class="wb-pane-title" style="justify-content:space-between;">' +
          '<span>' + PCD.icon('settings', 13) + ' ' + PCD.escapeHtml(t('wb_inspector_title', 'Block style')) + '</span>' +
          '<span style="font-weight:600;color:var(--brand-700);font-size:10px;">' + PCD.escapeHtml(t(blockTypeMeta(block.type).labelKey, blockTypeMeta(block.type).label)) + '</span>' +
        '</div>' +
        buildInspectorContent(block, idx) +
      '</div>';
  }

  // ============ INSPECTOR CONTENT (per block type) ============
  function buildInspectorContent(block, idx) {
    let html = '';
    // 1) Content fields
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_content', 'Content')) + '</div>' +
      buildContentEditor(block, idx) +
    '</div>';
    // 2) Layout — 6 kademe (full / half / 1-of-3 / 1-of-4 / 1-of-5 / 1-of-6)
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_layout', 'Layout')) + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;">' +
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function (n) {
          const key = n === 12 ? 'full' : 'span' + n;
          const cur = block.layout || 'full';
          const isActive = layoutSpan(cur) === n;
          const activeStyle = isActive
            ? 'background:var(--brand-600,#16a34a);color:#fff;border-color:var(--brand-600,#16a34a);'
            : 'background:var(--surface-2);color:var(--text);border-color:var(--border);';
          return '<button type="button" data-set-layout="' + key + '" style="padding:5px 2px;font-size:11px;font-weight:700;border:1px solid;border-radius:5px;cursor:pointer;' + activeStyle + '" title="' + n + '/12">' + n + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
    // 3) Color
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_color', 'Color')) + '</div>' +
      '<div class="wb-swatch-row">' +
        PALETTE.map(function (p) {
          return '<div class="wb-swatch' + (block.style && block.style.color === p.id ? ' active' : '') + '" data-set-color="' + p.id + '" title="' + PCD.escapeHtml(p.label) + '" style="background:' + p.bg + ';"></div>';
        }).join('') +
      '</div>' +
    '</div>';
    // 4) Size — 6 kademe (XS / SM / MD / LG / XL / XXL)
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_size', 'Size')) + '</div>' +
      '<div class="wb-seg" style="width:100%;display:flex;">' +
        ['xs','sm','md','lg','xl','xxl'].map(function (s) {
          return '<button type="button" data-set-size="' + s + '" class="' + (block.style && block.style.size === s ? 'active' : '') + '" style="flex:1;text-transform:uppercase;font-size:11px;">' + s + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
    // 4b) Weight — 3 kademe (ince/orta/bold)
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_weight', 'Weight')) + '</div>' +
      '<div class="wb-seg" style="width:100%;display:flex;">' +
        [['light',   t('wb_weight_light',  'Light')],
         ['medium',  t('wb_weight_medium', 'Medium')],
         ['bold',    t('wb_weight_bold',   'Bold')]].map(function (w) {
          const wt = WEIGHTS[w[0]];
          const isActive = (block.style && block.style.weight === w[0]) || (!block.style.weight && w[0] === 'medium');
          return '<button type="button" data-set-weight="' + w[0] + '" class="' + (isActive ? 'active' : '') + '" style="flex:1;font-weight:' + wt + ';">' + PCD.escapeHtml(w[1]) + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
    // 5) Align
    html += '<div class="wb-inspector-section">' +
      '<div class="wb-inspector-label">' + PCD.escapeHtml(t('wb_inspector_align', 'Align')) + '</div>' +
      '<div class="wb-seg" style="width:100%;display:flex;">' +
        [['left','←'],['center','↔'],['right','→']].map(function (a) {
          return '<button type="button" data-set-align="' + a[0] + '" class="' + (block.style && block.style.align === a[0] ? 'active' : '') + '" style="flex:1;">' + a[1] + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
    // 6) Actions
    html += '<div class="wb-inspector-section" style="display:flex;gap:6px;">' +
      '<button class="btn btn-outline btn-sm" data-blk-action="duplicate" style="flex:1;">' + PCD.icon('copy', 13) + ' ' + PCD.escapeHtml(t('wb_action_duplicate', 'Duplicate')) + '</button>' +
      '<button class="btn btn-outline btn-sm" data-blk-action="move-up" style="flex:0 0 auto;" title="' + PCD.escapeHtml(t('wb_action_move_up', 'Move up')) + '">' + PCD.icon('chevron-up', 13) + '</button>' +
      '<button class="btn btn-outline btn-sm" data-blk-action="move-down" style="flex:0 0 auto;" title="' + PCD.escapeHtml(t('wb_action_move_down', 'Move down')) + '">' + PCD.icon('chevron-down', 13) + '</button>' +
      '<button class="btn btn-outline btn-sm" data-blk-action="delete" style="flex:0 0 auto;color:var(--danger);border-color:var(--danger);" title="' + PCD.escapeHtml(t('wb_action_delete', 'Delete block')) + '">' + PCD.icon('trash', 13) + '</button>' +
    '</div>';
    return html;
  }

  // ============ CONTENT EDITOR (per block type) ============
  function buildContentEditor(block, idx) {
    const c = block.content || {};
    switch (block.type) {
      case 'section_header':
      case 'alert':
      case 'text':
        return '<textarea data-ct-field="text" rows="' + (block.type === 'text' ? '4' : '2') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:13px;font-family:inherit;resize:vertical;">' + PCD.escapeHtml(c.text || '') + '</textarea>' +
          (block.type === 'alert' ? '<input data-ct-field="icon" type="text" maxlength="4" placeholder="⚠" value="' + PCD.escapeHtml(c.icon || '') + '" style="margin-top:6px;width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);font-size:13px;">' : '');
      case 'big_number':
        return '<input data-ct-field="value" type="text" maxlength="20" placeholder="0" value="' + PCD.escapeHtml(c.value || '') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:18px;font-weight:900;text-align:center;">' +
          '<input data-ct-field="label" type="text" maxlength="40" placeholder="LABEL" value="' + PCD.escapeHtml(c.label || '') + '" style="margin-top:6px;width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">' +
          '<input data-ct-field="sub" type="text" maxlength="8" placeholder="' + PCD.escapeHtml(t('wb_bignum_sub_ph', 'Unit (°C, $, min)')) + '" value="' + PCD.escapeHtml(c.sub || '') + '" style="margin-top:6px;width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);font-size:12px;">';
      case 'checklist': {
        const items = (c.items || []).map(function (it, i) {
          return '<div class="wb-list-item">' +
            '<input type="checkbox" data-ct-checklist-done="' + i + '"' + (it.done ? ' checked' : '') + '>' +
            '<input type="text" data-ct-checklist-text="' + i + '" value="' + PCD.escapeHtml(it.text || '') + '" placeholder="' + PCD.escapeHtml(t('wb_checklist_item_ph', 'Task...')) + '">' +
            '<button class="wb-icon-btn danger" data-ct-checklist-del="' + i + '" title="' + PCD.escapeHtml(t('delete', 'Delete')) + '">×</button>' +
          '</div>';
        }).join('');
        return items +
          '<button class="btn btn-outline btn-sm" data-ct-checklist-add style="width:100%;margin-top:6px;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_checklist_add', 'Add item')) + '</button>';
      }
      case 'kv': {
        // v2.11.13 — KV content editor dikey layout (table pattern'ı, v2.11.9).
        // Yatay flex (key + value + delete) inspector ~280px'i taşıyordu →
        // operatör bug. Dikey: her pair "PAIR N" başlığı + altında key satırı +
        // value satırı. Inspector dar olsa bile sığar.
        const pairs = (c.pairs || []).map(function (p, i) {
          return '<div style="border-top:1px dashed var(--border);padding:6px 0 4px;margin-top:' + (i === 0 ? '0' : '6px') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
              '<span style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;">' + PCD.escapeHtml(t('wb_kv_pair_label', 'Pair')) + ' ' + (i + 1) + '</span>' +
              '<button class="wb-icon-btn danger" data-ct-kv-del="' + i + '" title="' + PCD.escapeHtml(t('wb_kv_del_pair', 'Delete pair')) + '">×</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;padding:2px 0;">' +
              '<span style="flex:0 0 42px;font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">' + PCD.escapeHtml(t('wb_kv_key_label', 'Key')) + '</span>' +
              '<input type="text" data-ct-kv-key="' + i + '" value="' + PCD.escapeHtml(p.key || '') + '" placeholder="' + PCD.escapeHtml(t('wb_kv_key_ph', 'KEY')) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;text-transform:uppercase;font-weight:700;">' +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;padding:2px 0;">' +
              '<span style="flex:0 0 42px;font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">' + PCD.escapeHtml(t('wb_kv_value_label', 'Value')) + '</span>' +
              '<input type="text" data-ct-kv-value="' + i + '" value="' + PCD.escapeHtml(p.value || '') + '" placeholder="' + PCD.escapeHtml(t('wb_kv_value_ph', 'Value')) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;">' +
            '</div>' +
          '</div>';
        }).join('');
        return pairs +
          '<button class="btn btn-outline btn-sm" data-ct-kv-add style="width:100%;margin-top:10px;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_kv_add', 'Add row')) + '</button>';
      }
      case 'table': {
        // v2.11.9 — Table content editor dikey layout. Eski yatay flex 4-col
        // header'lar dar inspector'da (~280px) sığamayıp sağ tarafa taşıyordu
        // (operatör bug). Yeni layout: her sütun başlığı tek satır (label C1/C2 +
        // input + col-delete butonu), sonra her row için "ROW N" başlığı +
        // altında her cell column-adı label'lı bir satır. Inspector scrollable
        // zaten — büyük tablo dikey akar, taşmaz.
        const headerCount = (c.headers || []).length;
        const headers = (c.headers || []).map(function (h, i) {
          return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0;">' +
            '<span style="flex:0 0 28px;font-size:10px;font-weight:800;color:var(--text-3);letter-spacing:0.06em;">C' + (i + 1) + '</span>' +
            '<input type="text" data-ct-table-header="' + i + '" value="' + PCD.escapeHtml(h || '') + '" placeholder="' + PCD.escapeHtml(t('wb_table_header_ph', 'Header')) + ' ' + (i + 1) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;font-weight:700;">' +
            (headerCount > 1 ? '<button class="wb-icon-btn danger" data-ct-table-coldel="' + i + '" style="flex:0 0 auto;" title="' + PCD.escapeHtml(t('wb_table_del_col', 'Delete column')) + '">×</button>' : '<span style="flex:0 0 24px;"></span>') +
          '</div>';
        }).join('');
        const rows = (c.rows || []).map(function (row, ri) {
          const cells = (row || []).map(function (cell, ci) {
            const colLabel = ((c.headers || [])[ci] || ('C' + (ci + 1))).toString();
            return '<div style="display:flex;gap:6px;align-items:center;padding:2px 0 2px 12px;">' +
              '<span style="flex:0 0 60px;font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(colLabel) + '">' + PCD.escapeHtml(colLabel) + '</span>' +
              '<input type="text" data-ct-table-cell="' + ri + ',' + ci + '" value="' + PCD.escapeHtml(cell || '') + '" placeholder="—" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;">' +
            '</div>';
          }).join('');
          return '<div style="border-top:1px dashed var(--border);padding:6px 0 4px;margin-top:6px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">' +
              '<span style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;">' + PCD.escapeHtml(t('wb_table_row_label', 'Row')) + ' ' + (ri + 1) + '</span>' +
              '<button class="wb-icon-btn danger" data-ct-table-rowdel="' + ri + '" title="' + PCD.escapeHtml(t('wb_table_del_row', 'Delete row')) + '">×</button>' +
            '</div>' +
            cells +
          '</div>';
        }).join('');
        return '<div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">' + PCD.escapeHtml(t('wb_table_columns_label', 'Columns')) + '</div>' +
          headers +
          '<div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-top:10px;margin-bottom:0;">' + PCD.escapeHtml(t('wb_table_rows_label', 'Rows')) + '</div>' +
          rows +
          '<div style="display:flex;gap:4px;margin-top:10px;">' +
            '<button class="btn btn-outline btn-sm" data-ct-table-addrow style="flex:1;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_table_add_row', 'Add row')) + '</button>' +
            '<button class="btn btn-outline btn-sm" data-ct-table-addcol style="flex:1;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_table_add_col', 'Add column')) + '</button>' +
          '</div>';
      }
      case 'divider':
        return '<input data-ct-field="label" type="text" maxlength="40" placeholder="' + PCD.escapeHtml(t('wb_divider_label_ph', 'Optional label')) + '" value="' + PCD.escapeHtml(c.label || '') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:13px;">';
      // v2.11.14 — 4 yeni block tipi content editor
      case 'step_list': {
        const items = (c.items || []).map(function (it, i) {
          return '<div class="wb-list-item">' +
            '<span style="flex:0 0 24px;font-size:11px;font-weight:800;color:var(--text-3);text-align:center;">' + (i + 1) + '.</span>' +
            '<input type="text" data-ct-step-text="' + i + '" value="' + PCD.escapeHtml(it.text || '') + '" placeholder="' + PCD.escapeHtml(t('wb_step_item_ph', 'Step...')) + '">' +
            '<button class="wb-icon-btn danger" data-ct-step-del="' + i + '">×</button>' +
          '</div>';
        }).join('');
        return items +
          '<button class="btn btn-outline btn-sm" data-ct-step-add style="width:100%;margin-top:6px;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_step_add', 'Add step')) + '</button>';
      }
      case 'allergen_strip': {
        const all = (PCD.allergensDB && PCD.allergensDB.list) || [];
        const active = (c.active || []).map(function (s) { return (s || '').toLowerCase(); });
        const cells = all.map(function (a) {
          const isActive = active.indexOf(a.key) >= 0;
          return '<button type="button" data-ct-allerg-toggle="' + PCD.escapeHtml(a.key) + '" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid ' + (isActive ? '#a23b2d' : 'var(--border)') + ';background:' + (isActive ? 'rgba(220,38,38,0.15)' : 'var(--surface-1)') + ';color:' + (isActive ? '#a23b2d' : 'var(--text-2)') + ';border-radius:5px;cursor:pointer;font-size:11px;font-weight:' + (isActive ? '800' : '500') + ';text-align:left;text-transform:uppercase;letter-spacing:0.04em;">' +
            '<span style="font-size:14px;line-height:1;">' + PCD.escapeHtml(a.icon || '?') + '</span>' +
            '<span style="flex:1;">' + PCD.escapeHtml(a.key) + '</span>' +
            (isActive ? '<span style="color:#a23b2d;font-weight:900;">✓</span>' : '') +
          '</button>';
        }).join('');
        return '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">' + PCD.escapeHtml(t('wb_allerg_hint', 'Tap to mark "contains" — red vurgu')) + '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">' + cells + '</div>';
      }
      case 'doneness': {
        const levels = (c.levels || []).map(function (lv, i) {
          return '<div style="border-top:1px dashed var(--border);padding:6px 0 4px;margin-top:' + (i === 0 ? '0' : '4px') + ';">' +
            '<div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">' + PCD.escapeHtml(t('wb_doneness_level', 'Level')) + ' ' + (i + 1) + '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<input type="text" data-ct-done-label="' + i + '" value="' + PCD.escapeHtml(lv.label || '') + '" placeholder="' + PCD.escapeHtml(t('wb_doneness_label_ph', 'Label')) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;font-weight:700;text-transform:uppercase;">' +
              '<input type="text" data-ct-done-temp="' + i + '" value="' + PCD.escapeHtml(lv.temp || '') + '" placeholder="' + PCD.escapeHtml(t('wb_doneness_temp_ph', '°C')) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;">' +
            '</div>' +
          '</div>';
        }).join('');
        return levels + '<div style="font-size:9px;color:var(--text-3);margin-top:8px;font-style:italic;">' + PCD.escapeHtml(t('wb_doneness_hint', 'Levels are fixed at 5 (rare → well-done gradient). Edit label/temp.')) + '</div>';
      }
      case 'time_range': {
        // v2.12.2 — min-width:0 + box-sizing so the flex inputs don't overflow
        // the inspector panel (long placeholders were pushing them to the right).
        return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
            '<input type="text" data-ct-field="start" value="' + PCD.escapeHtml(c.start || '') + '" placeholder="' + PCD.escapeHtml(t('wb_time_start_ph', 'Start (08:00)')) + '" style="flex:1;min-width:0;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:14px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;">' +
            '<span style="color:var(--text-3);font-size:14px;flex:0 0 auto;">→</span>' +
            '<input type="text" data-ct-field="end" value="' + PCD.escapeHtml(c.end || '') + '" placeholder="' + PCD.escapeHtml(t('wb_time_end_ph', 'End (17:30)')) + '" style="flex:1;min-width:0;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:14px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;">' +
          '</div>' +
          '<input type="text" data-ct-field="label" maxlength="40" value="' + PCD.escapeHtml(c.label || '') + '" placeholder="' + PCD.escapeHtml(t('wb_time_label_ph', 'Label (e.g. SERVICE HOURS)')) + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">';
      }
      case 'cook_sheet': {
        const csItems = (c.items || []);
        const csRows  = (c.rows  || []);
        const itemInputs = csItems.map(function (item, i) {
          return '<div style="display:flex;gap:6px;align-items:center;padding:2px 0;">' +
            '<span style="flex:0 0 24px;font-size:10px;font-weight:800;color:var(--text-3);">C' + (i + 1) + '</span>' +
            '<input type="text" data-ct-cs-item="' + i + '" value="' + PCD.escapeHtml(item || '') + '" placeholder="' + PCD.escapeHtml(t('wb_cs_item_ph', 'Item name')) + '" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;font-weight:700;text-transform:uppercase;">' +
            (csItems.length > 1 ? '<button class="wb-icon-btn danger" data-ct-cs-delitem="' + i + '" title="' + PCD.escapeHtml(t('delete', 'Delete')) + '">×</button>' : '<span style="flex:0 0 24px;"></span>') +
          '</div>';
        }).join('');
        const rowEditors = csRows.map(function (row, ri) {
          const cells = csItems.map(function (item, ci) {
            return '<div style="display:flex;gap:6px;align-items:center;padding:2px 0 2px 12px;">' +
              '<span style="flex:0 0 60px;font-size:9px;color:var(--text-3);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(item || ('C' + (ci + 1))) + '">' + PCD.escapeHtml(item || ('C' + (ci + 1))) + '</span>' +
              '<input type="text" data-ct-cs-cell="' + ri + ',' + ci + '" value="' + PCD.escapeHtml((row.values || [])[ci] || '') + '" placeholder="—" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:12px;">' +
            '</div>';
          }).join('');
          return '<div style="border-top:1px dashed var(--border);padding:6px 0 4px;margin-top:6px;">' +
            '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">' +
              '<span style="flex:0 0 42px;font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700;">' + PCD.escapeHtml(t('wb_cs_row_label', 'Row')) + '</span>' +
              '<input type="text" data-ct-cs-rowlabel="' + ri + '" value="' + PCD.escapeHtml(row.label || '') + '" placeholder="Time / Temp / Note" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-1);color:var(--text);font-size:11px;font-weight:800;text-transform:uppercase;">' +
            '</div>' +
            cells +
          '</div>';
        }).join('');
        return '<div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">' + PCD.escapeHtml(t('wb_cs_items_label', 'Items (Columns)')) + '</div>' +
          itemInputs +
          '<button class="btn btn-outline btn-sm" data-ct-cs-additem style="width:100%;margin-top:6px;">' + PCD.icon('plus', 13) + ' ' + PCD.escapeHtml(t('wb_cs_add_item', 'Add item')) + '</button>' +
          '<div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-top:12px;margin-bottom:0;">' + PCD.escapeHtml(t('wb_cs_rows_label', 'Parameters (Rows)')) + '</div>' +
          rowEditors;
      }
    }
    return '<div style="color:var(--text-3);font-size:12px;">' + PCD.escapeHtml(t('wb_no_content_fields', 'No content fields for this block.')) + '</div>';
  }

  // ============ BOTTOM SHEET (mobile) ============
  function buildBottomSheet() {
    return '' +
      '<div class="wb-bottom-sheet-backdrop" id="wbSheetBackdrop"></div>' +
      '<div class="wb-bottom-sheet" id="wbBottomSheet">' +
        '<div class="wb-bottom-sheet-grab"></div>' +
        '<div class="wb-bottom-sheet-title">' +
          '<span id="wbBSTitle">' + PCD.escapeHtml(t('wb_inspector_title', 'Block style')) + '</span>' +
          '<button class="wb-icon-btn" id="wbBSClose" style="font-size:20px;">×</button>' +
        '</div>' +
        '<div id="wbBSBody"></div>' +
      '</div>';
  }

  // ============ EVENT WIRING ============
  function wireHeader(root, canvas) {
    const tpl = root.querySelector('#wbTemplateBtn');
    if (tpl) tpl.addEventListener('click', function () { openTemplatesPicker(root); });
    const clr = root.querySelector('#wbClearBtn');
    if (clr) clr.addEventListener('click', function () { resetCanvas(root); });
    const prn = root.querySelector('#wbPrintBtn');
    if (prn) prn.addEventListener('click', function () { printCanvas(canvas); });
  }

  function wireCanvasSelector(root, store) {
    const sel = root.querySelector('#wbCanvasSelect');
    if (sel) sel.addEventListener('change', function () {
      const id = this.value;
      setActiveId(id);
      _ui.selectedBlockIdx = -1;
      rerender();
    });
    const nw = root.querySelector('#wbNewCanvasBtn');
    if (nw) nw.addEventListener('click', function () {
      const fresh = defaultCanvas('New whiteboard ' + (store.canvases.length + 1));
      const arr = store.canvases.slice();
      arr.push(fresh);
      saveStore({ activeId: fresh.id, canvases: arr });
      _ui.selectedBlockIdx = -1;
      rerender();
      PCD.toast.success(t('whiteboard_new_canvas_created', 'New canvas created'));
    });
    const del = root.querySelector('#wbDeleteCanvasBtn');
    if (del) del.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑',
        iconKind: 'danger',
        danger: true,
        title: t('whiteboard_delete_canvas_confirm_title', 'Delete this canvas?'),
        text: t('whiteboard_delete_canvas_confirm_text', 'This canvas will be permanently deleted from this browser. Other saved canvases remain.'),
        okText: t('delete', 'Delete'),
        cancelText: t('cancel', 'Cancel'),
      }).then(function (ok) {
        if (!ok) return;
        const all = readAllRaw().slice();
        const active = getActiveId();
        const idx = all.findIndex(function (c) { return c.id === active; });
        if (idx >= 0) all[idx] = Object.assign({}, all[idx], { _deletedAt: nowIso() });
        writeAll(all);
        const remaining = readAllVisible();
        if (remaining.length === 0) {
          const fresh = defaultCanvas('My Whiteboard');
          writeAll(all.concat([fresh]));
          setActiveId(fresh.id);
        } else {
          setActiveId(remaining[0].id);
        }
        _ui.selectedBlockIdx = -1;
        rerender();
      });
    });
  }

  function wireCanvasMeta(root, canvas) {
    const titleEl = root.querySelector('#wbTitle');
    if (titleEl) titleEl.addEventListener('input', function () {
      canvas.title = this.value;
      canvas.name = this.value || 'Untitled';
      persistCanvas(canvas);
      // Update dropdown option live
      const opt = root.querySelector('#wbCanvasSelect option[value="' + CSS.escape(canvas.id) + '"]');
      if (opt) opt.textContent = canvas.name;
      // Update sheet title preview if visible
      const sheetTitle = root.querySelector('.wb-canvas .wb-canvas-title-preview');
      if (sheetTitle) sheetTitle.textContent = canvas.title || '';
    });
    PCD.on(root, 'click', '[data-wb-paper]', function () {
      canvas.paper = this.getAttribute('data-wb-paper');
      persistCanvas(canvas);
      rerender();
    });
    PCD.on(root, 'click', '[data-wb-orient]', function () {
      canvas.orient = this.getAttribute('data-wb-orient');
      persistCanvas(canvas);
      rerender();
    });
  }

  function wirePalette(root, canvas, view) {
    PCD.on(root, 'click', '[data-add-block]', function () {
      const type = this.getAttribute('data-add-block');
      const block = makeBlock(type);
      canvas.blocks = canvas.blocks || [];
      canvas.blocks.push(block);
      persistCanvas(canvas);
      _ui.selectedBlockIdx = canvas.blocks.length - 1;
      rerender();
      // Auto-open inspector on mobile (bottom sheet)
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        openBottomSheet(root, canvas);
      }
    });
  }

  function wireCanvasPane(root, canvas, view) {
    // Block click → select + open inspector
    PCD.on(root, 'click', '.wb-block', function (e) {
      // Skip clicks on handle (drag) or action buttons
      if (e.target.closest('.wb-block-handle')) return;
      const idx = parseInt(this.getAttribute('data-blk-idx'), 10);
      if (isNaN(idx)) return;
      _ui.selectedBlockIdx = idx;
      // Mobile: open bottom sheet
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        rerender();
        openBottomSheet(root, canvas);
      } else {
        rerender();
      }
    });

    // Drag-reorder: HTML5 + touch fallback via unified handlers
    wireBlockReorder(root, canvas);
  }

  // Drag-reorder: unified mouse + touch. Each block is draggable;
  // drop position determined by midpoint.
  // v2.11.0 — Module-level cleanup ref: render her çağrıldığında eski document
  // listener'ları sil, yenilerini attach. Aksi takdirde her render 4 leaked
  // listener bırakır (long-running session memory bloat).
  let _wbDragCleanup = null;
  function wireBlockReorder(root, canvas) {
    if (_wbDragCleanup) { try { _wbDragCleanup(); } catch (e) {} _wbDragCleanup = null; }
    const canvasEl = root.querySelector('#wbCanvas');
    if (!canvasEl) return;

    let dragState = null;  // { idx, ghostY, blocks: NodeListOf<.wb-block> }

    function onStart(e, blockEl) {
      const idx = parseInt(blockEl.getAttribute('data-blk-idx'), 10);
      if (isNaN(idx)) return;
      const pt = pointFromEvent(e);
      dragState = {
        idx: idx,
        startX: pt.x,
        startY: pt.y,
        moved: false,
        blockEl: blockEl,
      };
      blockEl.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }
    function onMove(e) {
      if (!dragState) return;
      const pt = pointFromEvent(e);
      const dx = pt.x - dragState.startX;
      const dy = pt.y - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < 6) return;
      dragState.moved = true;
      if (e.cancelable) e.preventDefault();

      // Find block under pointer
      const blockEls = canvasEl.querySelectorAll('.wb-block');
      blockEls.forEach(function (b) { b.classList.remove('drag-over-top'); b.classList.remove('drag-over-bottom'); });
      for (let i = 0; i < blockEls.length; i++) {
        const b = blockEls[i];
        if (b === dragState.blockEl) continue;
        const rect = b.getBoundingClientRect();
        if (pt.y >= rect.top && pt.y <= rect.bottom) {
          const mid = rect.top + rect.height / 2;
          if (pt.y < mid) b.classList.add('drag-over-top');
          else b.classList.add('drag-over-bottom');
          dragState.dropTarget = b;
          dragState.dropPosition = pt.y < mid ? 'top' : 'bottom';
          break;
        }
      }
    }
    function onEnd() {
      if (!dragState) return;
      const blockEls = canvasEl.querySelectorAll('.wb-block');
      blockEls.forEach(function (b) { b.classList.remove('drag-over-top'); b.classList.remove('drag-over-bottom'); b.classList.remove('dragging'); });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (dragState.moved && dragState.dropTarget) {
        const fromIdx = dragState.idx;
        const targetIdx = parseInt(dragState.dropTarget.getAttribute('data-blk-idx'), 10);
        if (!isNaN(targetIdx) && fromIdx !== targetIdx) {
          let toIdx = dragState.dropPosition === 'bottom' ? targetIdx + 1 : targetIdx;
          if (fromIdx < toIdx) toIdx -= 1;
          const blocks = canvas.blocks || [];
          const [moved] = blocks.splice(fromIdx, 1);
          blocks.splice(toIdx, 0, moved);
          canvas.blocks = blocks;
          persistCanvas(canvas);
          _ui.selectedBlockIdx = toIdx;
          rerender();
        }
      }
      dragState = null;
    }
    function pointFromEvent(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    // Attach to each block's handle (or block itself for touch)
    canvasEl.querySelectorAll('.wb-block').forEach(function (blockEl) {
      const handle = blockEl.querySelector('.wb-block-handle');
      if (handle) {
        handle.addEventListener('mousedown', function (e) { e.stopPropagation(); onStart(e, blockEl); });
        handle.addEventListener('touchstart', function (e) { e.stopPropagation(); onStart(e, blockEl); }, { passive: false });
      }
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    // Module-level cleanup (file load -> render N -> cleanup before render N+1)
    _wbDragCleanup = function () {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    };
  }

  function wireInspector(root, canvas, view) {
    const inspector = root.querySelector('.wb-inspector-pane-desktop');
    const bsBody = root.querySelector('#wbBSBody');
    function getActiveBlock() {
      return (canvas.blocks || [])[_ui.selectedBlockIdx];
    }
    function commit() {
      persistCanvas(canvas);
      // Re-render canvas blocks (inner wrapper, frame yapısı korunur)
      const cvBlocks = root.querySelector('#wbCanvasBlocks');
      if (cvBlocks) cvBlocks.innerHTML = renderSheet(canvas, _ui.selectedBlockIdx);
      // Also refresh inspector to reflect any normalization
      if (inspector) {
        const block = getActiveBlock();
        inspector.innerHTML = '' +
          '<div class="wb-pane-title" style="justify-content:space-between;">' +
            '<span>' + PCD.icon('settings', 13) + ' ' + PCD.escapeHtml(t('wb_inspector_title', 'Block style')) + '</span>' +
            (block ? '<span style="font-weight:600;color:var(--brand-700);font-size:10px;">' + PCD.escapeHtml(t(blockTypeMeta(block.type).labelKey, blockTypeMeta(block.type).label)) + '</span>' : '') +
          '</div>' +
          (block ? buildInspectorContent(block, _ui.selectedBlockIdx) : '<div style="font-size:12px;color:var(--text-3);text-align:center;padding:24px 8px;">' + PCD.escapeHtml(t('wb_inspector_empty', 'Click a block.')) + '</div>');
      }
      // Bottom sheet body refresh
      if (bsBody && _ui.bottomSheetOpen) {
        const block = getActiveBlock();
        if (block) bsBody.innerHTML = buildInspectorContent(block, _ui.selectedBlockIdx);
      }
      // Re-attach reorder listeners after re-render
      wireBlockReorder(root, canvas);
      // Re-bind canvas pane click
      bindCanvasPaneClicks(root, canvas);
      // v2.11.2 — Re-check page overflow after content/style change
      checkOverflow(root);
    }

    // Style setters
    PCD.on(root, 'click', '[data-set-color]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.style = block.style || {};
      block.style.color = this.getAttribute('data-set-color');
      commit();
    });
    PCD.on(root, 'click', '[data-set-size]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.style = block.style || {};
      block.style.size = this.getAttribute('data-set-size');
      commit();
    });
    PCD.on(root, 'click', '[data-set-weight]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.style = block.style || {};
      block.style.weight = this.getAttribute('data-set-weight');
      commit();
    });
    PCD.on(root, 'click', '[data-set-align]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.style = block.style || {};
      block.style.align = this.getAttribute('data-set-align');
      commit();
    });
    PCD.on(root, 'click', '[data-set-layout]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.layout = this.getAttribute('data-set-layout');
      commit();
    });

    // Block actions
    PCD.on(root, 'click', '[data-blk-action]', function () {
      const block = getActiveBlock(); if (!block) return;
      const action = this.getAttribute('data-blk-action');
      const blocks = canvas.blocks || [];
      const idx = _ui.selectedBlockIdx;
      if (action === 'duplicate') {
        const copy = JSON.parse(JSON.stringify(block));
        copy.id = uid('blk');
        blocks.splice(idx + 1, 0, copy);
        _ui.selectedBlockIdx = idx + 1;
        persistCanvas(canvas);
        rerender();
      } else if (action === 'delete') {
        blocks.splice(idx, 1);
        _ui.selectedBlockIdx = -1;
        persistCanvas(canvas);
        rerender();
        closeBottomSheet(root);
      } else if (action === 'move-up' && idx > 0) {
        const tmp = blocks[idx - 1];
        blocks[idx - 1] = blocks[idx];
        blocks[idx] = tmp;
        _ui.selectedBlockIdx = idx - 1;
        persistCanvas(canvas);
        rerender();
      } else if (action === 'move-down' && idx < blocks.length - 1) {
        const tmp = blocks[idx + 1];
        blocks[idx + 1] = blocks[idx];
        blocks[idx] = tmp;
        _ui.selectedBlockIdx = idx + 1;
        persistCanvas(canvas);
        rerender();
      }
    });

    // Content field editors (delegated)
    function onContentInput(e) {
      const block = getActiveBlock(); if (!block) return;
      const target = e.target;
      const field = target.getAttribute('data-ct-field');
      if (field) {
        block.content = block.content || {};
        block.content[field] = target.value;
        // Debounce-light commit (no full re-render — only canvas blocks refresh)
        persistCanvas(canvas);
        const cvBlocks = root.querySelector('#wbCanvasBlocks');
        if (cvBlocks) cvBlocks.innerHTML = renderSheet(canvas, _ui.selectedBlockIdx);
        wireBlockReorder(root, canvas);
        bindCanvasPaneClicks(root, canvas);
        checkOverflow(root);
        return;
      }
      // Checklist
      const chkText = target.getAttribute('data-ct-checklist-text');
      if (chkText !== null) {
        const i = parseInt(chkText, 10);
        block.content = block.content || { items: [] };
        block.content.items[i] = block.content.items[i] || { text: '', done: false };
        block.content.items[i].text = target.value;
        commitLight(); return;
      }
      // v2.11.14 — Step List text input
      const stepText = target.getAttribute('data-ct-step-text');
      if (stepText !== null) {
        const i = parseInt(stepText, 10);
        block.content = block.content || { items: [] };
        block.content.items[i] = block.content.items[i] || { text: '' };
        block.content.items[i].text = target.value;
        commitLight(); return;
      }
      // v2.11.14 — Doneness label/temp inputs
      const doneLabel = target.getAttribute('data-ct-done-label');
      if (doneLabel !== null) {
        const i = parseInt(doneLabel, 10);
        block.content = block.content || { levels: [] };
        block.content.levels[i] = block.content.levels[i] || { label: '', temp: '' };
        block.content.levels[i].label = target.value;
        commitLight(); return;
      }
      const doneTemp = target.getAttribute('data-ct-done-temp');
      if (doneTemp !== null) {
        const i = parseInt(doneTemp, 10);
        block.content = block.content || { levels: [] };
        block.content.levels[i] = block.content.levels[i] || { label: '', temp: '' };
        block.content.levels[i].temp = target.value;
        commitLight(); return;
      }
      // KV
      const kvKey = target.getAttribute('data-ct-kv-key');
      if (kvKey !== null) {
        const i = parseInt(kvKey, 10);
        block.content = block.content || { pairs: [] };
        block.content.pairs[i] = block.content.pairs[i] || { key: '', value: '' };
        block.content.pairs[i].key = target.value;
        commitLight(); return;
      }
      const kvVal = target.getAttribute('data-ct-kv-value');
      if (kvVal !== null) {
        const i = parseInt(kvVal, 10);
        block.content = block.content || { pairs: [] };
        block.content.pairs[i] = block.content.pairs[i] || { key: '', value: '' };
        block.content.pairs[i].value = target.value;
        commitLight(); return;
      }
      // Cook Sheet
      const csItem = target.getAttribute('data-ct-cs-item');
      if (csItem !== null) {
        const i = parseInt(csItem, 10);
        block.content = block.content || { items: [], rows: [] };
        block.content.items[i] = target.value;
        commitLight(); return;
      }
      const csRowLabel = target.getAttribute('data-ct-cs-rowlabel');
      if (csRowLabel !== null) {
        const i = parseInt(csRowLabel, 10);
        block.content = block.content || { items: [], rows: [] };
        block.content.rows[i] = block.content.rows[i] || { label: '', values: [] };
        block.content.rows[i].label = target.value;
        commitLight(); return;
      }
      const csCell = target.getAttribute('data-ct-cs-cell');
      if (csCell !== null) {
        const parts = csCell.split(',').map(function (n) { return parseInt(n, 10); });
        block.content = block.content || { items: [], rows: [] };
        block.content.rows[parts[0]] = block.content.rows[parts[0]] || { label: '', values: [] };
        block.content.rows[parts[0]].values[parts[1]] = target.value;
        commitLight(); return;
      }
      // Table
      const thIdx = target.getAttribute('data-ct-table-header');
      if (thIdx !== null) {
        const i = parseInt(thIdx, 10);
        block.content = block.content || { headers: [], rows: [] };
        block.content.headers[i] = target.value;
        commitLight(); return;
      }
      const tdRC = target.getAttribute('data-ct-table-cell');
      if (tdRC !== null) {
        const parts = tdRC.split(',').map(function (n) { return parseInt(n, 10); });
        block.content = block.content || { headers: [], rows: [] };
        block.content.rows[parts[0]] = block.content.rows[parts[0]] || [];
        block.content.rows[parts[0]][parts[1]] = target.value;
        commitLight(); return;
      }
    }
    function onContentChange(e) {
      const block = getActiveBlock(); if (!block) return;
      const target = e.target;
      const chkDone = target.getAttribute('data-ct-checklist-done');
      if (chkDone !== null) {
        const i = parseInt(chkDone, 10);
        block.content = block.content || { items: [] };
        block.content.items[i] = block.content.items[i] || { text: '', done: false };
        block.content.items[i].done = target.checked;
        commitLight();
      }
    }
    function commitLight() {
      persistCanvas(canvas);
      const cvBlocks = root.querySelector('#wbCanvasBlocks');
      if (cvBlocks) cvBlocks.innerHTML = renderSheet(canvas, _ui.selectedBlockIdx);
      wireBlockReorder(root, canvas);
      bindCanvasPaneClicks(root, canvas);
      checkOverflow(root);
    }

    root.addEventListener('input', onContentInput);
    root.addEventListener('change', onContentChange);

    // Checklist add/del
    PCD.on(root, 'click', '[data-ct-checklist-add]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { items: [] };
      block.content.items.push({ text: '', done: false });
      commit();
    });
    PCD.on(root, 'click', '[data-ct-checklist-del]', function () {
      const block = getActiveBlock(); if (!block) return;
      const i = parseInt(this.getAttribute('data-ct-checklist-del'), 10);
      block.content.items.splice(i, 1);
      commit();
    });
    // v2.11.14 — Step List add/del
    PCD.on(root, 'click', '[data-ct-step-add]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { items: [] };
      block.content.items.push({ text: '' });
      commit();
    });
    PCD.on(root, 'click', '[data-ct-step-del]', function () {
      const block = getActiveBlock(); if (!block) return;
      const i = parseInt(this.getAttribute('data-ct-step-del'), 10);
      if (block.content && Array.isArray(block.content.items)) block.content.items.splice(i, 1);
      commit();
    });
    // v2.11.14 — Allergen Strip toggle
    PCD.on(root, 'click', '[data-ct-allerg-toggle]', function () {
      const block = getActiveBlock(); if (!block) return;
      const key = this.getAttribute('data-ct-allerg-toggle');
      block.content = block.content || { active: [] };
      const arr = block.content.active = (block.content.active || []).slice();
      const idx = arr.indexOf(key);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(key);
      commit();
    });
    // KV add/del
    PCD.on(root, 'click', '[data-ct-kv-add]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { pairs: [] };
      block.content.pairs.push({ key: '', value: '' });
      commit();
    });
    PCD.on(root, 'click', '[data-ct-kv-del]', function () {
      const block = getActiveBlock(); if (!block) return;
      const i = parseInt(this.getAttribute('data-ct-kv-del'), 10);
      block.content.pairs.splice(i, 1);
      commit();
    });
    // Table add row/col, delete row
    PCD.on(root, 'click', '[data-ct-table-addrow]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { headers: [], rows: [] };
      const colCount = block.content.headers.length || 3;
      block.content.rows.push(new Array(colCount).fill(''));
      commit();
    });
    PCD.on(root, 'click', '[data-ct-table-addcol]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { headers: [], rows: [] };
      block.content.headers.push('');
      block.content.rows.forEach(function (r) { r.push(''); });
      commit();
    });
    PCD.on(root, 'click', '[data-ct-table-rowdel]', function () {
      const block = getActiveBlock(); if (!block) return;
      const i = parseInt(this.getAttribute('data-ct-table-rowdel'), 10);
      block.content.rows.splice(i, 1);
      commit();
    });
    // v2.11.9 — Column delete (operatör asimetri fix: Add column var, delete yoktu).
    // Min 1 column şart (UI'da son column'un X butonu zaten gizli).
    PCD.on(root, 'click', '[data-ct-table-coldel]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { headers: [], rows: [] };
      if ((block.content.headers || []).length <= 1) return;
      const i = parseInt(this.getAttribute('data-ct-table-coldel'), 10);
      block.content.headers.splice(i, 1);
      block.content.rows.forEach(function (r) { if (Array.isArray(r)) r.splice(i, 1); });
      commit();
    });
    // Cook Sheet add/del item (column)
    PCD.on(root, 'click', '[data-ct-cs-additem]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { items: [], rows: [] };
      block.content.items.push('');
      (block.content.rows || []).forEach(function (row) {
        row.values = (row.values || []);
        row.values.push('');
      });
      commit();
    });
    PCD.on(root, 'click', '[data-ct-cs-delitem]', function () {
      const block = getActiveBlock(); if (!block) return;
      block.content = block.content || { items: [], rows: [] };
      if ((block.content.items || []).length <= 1) return;
      const i = parseInt(this.getAttribute('data-ct-cs-delitem'), 10);
      block.content.items.splice(i, 1);
      (block.content.rows || []).forEach(function (row) {
        if (Array.isArray(row.values)) row.values.splice(i, 1);
      });
      commit();
    });
  }

  // Re-bind canvas pane clicks (called after canvas innerHTML refreshed)
  function bindCanvasPaneClicks(root, canvas) {
    const canvasEl = root.querySelector('#wbCanvas');
    if (!canvasEl) return;
    canvasEl.querySelectorAll('.wb-block').forEach(function (blockEl) {
      blockEl.addEventListener('click', function (e) {
        if (e.target.closest('.wb-block-handle')) return;
        const idx = parseInt(this.getAttribute('data-blk-idx'), 10);
        if (isNaN(idx)) return;
        _ui.selectedBlockIdx = idx;
        // Update visual selection (don't full rerender)
        canvasEl.querySelectorAll('.wb-block').forEach(function (b) { b.classList.remove('wb-block-selected'); });
        this.classList.add('wb-block-selected');
        // Refresh inspector + maybe open bottom sheet
        const root2 = document.getElementById('wbRoot');
        if (!root2) return;
        const inspector = root2.querySelector('.wb-inspector-pane-desktop');
        if (inspector) {
          const block = (canvas.blocks || [])[idx];
          inspector.innerHTML = '' +
            '<div class="wb-pane-title" style="justify-content:space-between;">' +
              '<span>' + PCD.icon('settings', 13) + ' ' + PCD.escapeHtml(t('wb_inspector_title', 'Block style')) + '</span>' +
              (block ? '<span style="font-weight:600;color:var(--brand-700);font-size:10px;">' + PCD.escapeHtml(t(blockTypeMeta(block.type).labelKey, blockTypeMeta(block.type).label)) + '</span>' : '') +
            '</div>' +
            (block ? buildInspectorContent(block, idx) : '');
        }
        if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
          openBottomSheet(root2, canvas);
        }
      });
    });
  }

  function wireBottomSheet(root, canvas) {
    const backdrop = root.querySelector('#wbSheetBackdrop');
    const sheet = root.querySelector('#wbBottomSheet');
    const close = root.querySelector('#wbBSClose');
    function doClose() { closeBottomSheet(root); }
    if (close) close.addEventListener('click', doClose);
    if (backdrop) backdrop.addEventListener('click', doClose);
  }

  function openBottomSheet(root, canvas) {
    // v2.14.0 — Mobilde tap → rerender() #wbRoot'u baştan kurar; çağıran closure'daki
    // `root` artık kopuk (detached) node olur. Paneli HER ZAMAN canlı #wbRoot'a bağla;
    // yoksa .open kopuk ağaca eklenir, panel görünmez şekilde açılır (mobil edit bug).
    root = document.getElementById('wbRoot') || root;
    if (!root) return;
    const backdrop = root.querySelector('#wbSheetBackdrop');
    const sheet = root.querySelector('#wbBottomSheet');
    const body = root.querySelector('#wbBSBody');
    const title = root.querySelector('#wbBSTitle');
    if (!backdrop || !sheet || !body) return;
    const block = (canvas.blocks || [])[_ui.selectedBlockIdx];
    if (!block) return;
    body.innerHTML = buildInspectorContent(block, _ui.selectedBlockIdx);
    if (title) title.textContent = t(blockTypeMeta(block.type).labelKey, blockTypeMeta(block.type).label);
    backdrop.classList.add('open');
    requestAnimationFrame(function () {
      sheet.classList.add('open');
    });
    _ui.bottomSheetOpen = true;
  }
  function closeBottomSheet(root) {
    root = document.getElementById('wbRoot') || root;
    if (!root) return;
    const backdrop = root.querySelector('#wbSheetBackdrop');
    const sheet = root.querySelector('#wbBottomSheet');
    if (sheet) sheet.classList.remove('open');
    if (backdrop) {
      setTimeout(function () { backdrop.classList.remove('open'); }, 200);
    }
    _ui.bottomSheetOpen = false;
  }

  // ============ RESET ============
  function resetCanvas(root) {
    const store = loadStore();
    const canvas = getActive(store);
    PCD.modal.confirm({
      icon: '↺',
      title: t('whiteboard_reset_confirm_title', 'Reset whiteboard?'),
      text: t('whiteboard_reset_confirm_text_v2', 'All blocks will be removed. Title, paper, and orientation are kept.'),
      okText: t('whiteboard_reset', 'Reset'),
      cancelText: t('cancel', 'Cancel'),
    }).then(function (ok) {
      if (!ok) return;
      canvas.blocks = [];
      _ui.selectedBlockIdx = -1;
      persistCanvas(canvas);
      rerender();
    });
  }

  // ============ TEMPLATES PICKER ============
  function openTemplatesPicker(root) {
    const userTpls = loadUserTemplates();

    let html = '<div style="display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto;padding-right:4px;">';

    // Save current as template
    html += '<button type="button" id="wbSaveAsTpl" style="width:100%;text-align:center;padding:10px;background:var(--brand-50);border:1px dashed var(--brand-300);border-radius:8px;cursor:pointer;color:var(--brand-700);font-weight:700;font-size:13px;">' +
      '+ ' + PCD.escapeHtml(t('whiteboard_save_as_template', 'Save current canvas as template')) +
    '</button>';

    // User templates
    if (userTpls.length > 0) {
      html += '<div>' +
        '<div style="font-size:11px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">' +
          PCD.escapeHtml(t('whiteboard_user_templates', 'Your templates')) + ' (' + userTpls.length + ')' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      userTpls.forEach(function (tpl) {
        html += '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;">' +
          '<div style="font-weight:700;font-size:13px;">' + PCD.escapeHtml(tpl.name || 'Untitled') + '</div>' +
          '<div style="font-size:11px;color:var(--text-3);">' + (tpl.blocks || []).length + ' ' + PCD.escapeHtml(t('wb_blocks_count', 'blocks')) + ' · ' + PCD.escapeHtml(tpl.paper || 'A4') + ' ' + PCD.escapeHtml(tpl.orient || 'landscape') + '</div>' +
          '<div style="display:flex;gap:4px;margin-top:4px;">' +
            '<button class="btn btn-primary btn-sm" data-apply-user-tpl="' + PCD.escapeHtml(tpl.id) + '" style="flex:1;font-size:11px;">' + PCD.escapeHtml(t('wb_template_apply', 'Apply')) + '</button>' +
            '<button class="btn btn-outline btn-sm" data-del-user-tpl="' + PCD.escapeHtml(tpl.id) + '" style="flex:0 0 auto;color:var(--danger);" title="' + PCD.escapeHtml(t('delete', 'Delete')) + '">×</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div></div>';
    }

    // Built-in templates
    html += '<div>' +
      '<div style="font-size:11px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">' +
        PCD.escapeHtml(t('whiteboard_builtin_templates', 'Built-in templates')) + ' (' + TEMPLATES.length + ')' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    TEMPLATES.forEach(function (tpl) {
      html += '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--surface-2);">' +
        '<div style="font-weight:700;font-size:13px;">' + PCD.escapeHtml(t(tpl.labelKey, tpl.label)) + '</div>' +
        '<div style="font-size:11px;color:var(--text-3);">' + (tpl.blocks || []).length + ' ' + PCD.escapeHtml(t('wb_blocks_count', 'blocks')) + ' · ' + PCD.escapeHtml(tpl.paper) + ' ' + PCD.escapeHtml(tpl.orient) + '</div>' +
        '<button class="btn btn-primary btn-sm" data-apply-tpl="' + PCD.escapeHtml(tpl.id) + '" style="font-size:11px;margin-top:4px;">' + PCD.escapeHtml(t('wb_template_apply', 'Apply')) + '</button>' +
      '</div>';
    });
    html += '</div></div></div>';

    const closeFooterBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', text: t('close', 'Close') });
    closeFooterBtn.style.width = '100%';
    const m = PCD.modal.open({
      title: t('whiteboard_templates', 'Templates'),
      body: html,
      footer: closeFooterBtn,
      size: 'lg',
      closable: true,
    });
    closeFooterBtn.addEventListener('click', function () { m.close(); });
    (function () {
      const modalEl = m.panel;
      if (modalEl) {
        // Save as template
        const saveBtn = modalEl.querySelector('#wbSaveAsTpl');
        if (saveBtn) saveBtn.addEventListener('click', function () {
          const store = loadStore();
          const canvas = getActive(store);
          if ((canvas.blocks || []).length === 0) {
            PCD.toast.warning(t('wb_template_empty_warn', 'Canvas is empty — add blocks first.'));
            return;
          }
          // PCD.modal.prompt yok → modal.open + input ile custom prompt.
          const promptBody = PCD.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
          const lbl = PCD.el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-2)' }, text: t('whiteboard_template_name_label', 'Template name') });
          const inp = PCD.el('input', { type: 'text', class: 'input', placeholder: t('whiteboard_template_name_ph', 'My custom template') });
          inp.style.width = '100%';
          promptBody.appendChild(lbl);
          promptBody.appendChild(inp);
          const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel', 'Cancel') });
          const okBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('save', 'Save') });
          cancelBtn.style.flex = '1'; okBtn.style.flex = '1';
          const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
          footer.appendChild(cancelBtn);
          footer.appendChild(okBtn);
          const m2 = PCD.modal.open({
            title: t('whiteboard_save_as_template', 'Save as template'),
            body: promptBody,
            footer: footer,
            size: 'sm',
            closable: true,
          });
          setTimeout(function () { try { inp.focus(); } catch (e) {} }, 100);
          function commitPrompt() {
            const name = (inp.value || '').trim();
            if (!name) { try { inp.focus(); } catch (e) {} return; }
            const tpls = loadUserTemplates();
            tpls.push({
              id: uid('utpl'),
              name: name,
              paper: canvas.paper,
              orient: canvas.orient,
              blocks: JSON.parse(JSON.stringify(canvas.blocks)),
              savedAt: nowIso(),
            });
            saveUserTemplates(tpls);
            PCD.toast.success(t('whiteboard_template_saved', 'Template saved'));
            PCD.modal.closeAll();
            openTemplatesPicker(document.getElementById('wbRoot'));
          }
          okBtn.addEventListener('click', commitPrompt);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') commitPrompt(); });
          cancelBtn.addEventListener('click', function () { m2.close(); });
        });
        // Apply built-in
        modalEl.querySelectorAll('[data-apply-tpl]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const id = this.getAttribute('data-apply-tpl');
            const tpl = TEMPLATES.find(function (x) { return x.id === id; });
            if (!tpl) return;
            const fresh = canvasFromTemplate(tpl);
            const store = loadStore();
            const arr = store.canvases.slice();
            arr.push(fresh);
            saveStore({ activeId: fresh.id, canvases: arr });
            PCD.modal.closeAll();
            _ui.selectedBlockIdx = -1;
            rerender();
            PCD.toast.success(t('whiteboard_template_applied', 'Template applied as new canvas'));
          });
        });
        // Apply user template
        modalEl.querySelectorAll('[data-apply-user-tpl]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const id = this.getAttribute('data-apply-user-tpl');
            const tpl = loadUserTemplates().find(function (x) { return x.id === id; });
            if (!tpl) return;
            const fresh = canvasFromTemplate(tpl, tpl.name);
            const store = loadStore();
            const arr = store.canvases.slice();
            arr.push(fresh);
            saveStore({ activeId: fresh.id, canvases: arr });
            PCD.modal.closeAll();
            _ui.selectedBlockIdx = -1;
            rerender();
            PCD.toast.success(t('whiteboard_template_applied', 'Template applied as new canvas'));
          });
        });
        // Delete user template
        modalEl.querySelectorAll('[data-del-user-tpl]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const id = this.getAttribute('data-del-user-tpl');
            const arr = loadUserTemplates().filter(function (x) { return x.id !== id; });
            saveUserTemplates(arr);
            PCD.modal.closeAll();
            openTemplatesPicker(document.getElementById('wbRoot'));
          });
        });
      }
    })();
  }

  // ============ PRINT ============
  function printCanvas(canvas) {
    const isLand = canvas.orient === 'landscape';
    let pageW, pageH;
    if (canvas.paper === 'A3') { pageW = isLand ? 420 : 297; pageH = isLand ? 297 : 420; }
    else                       { pageW = isLand ? 297 : 210; pageH = isLand ? 210 : 297; }

    // v2.16 — tek 12-col grid
    const blocks = canvas.blocks || [];
    const blocksHtml = '<div class="wb-print-grid12" style="display:grid;grid-template-columns:repeat(12,1fr);gap:10px;">' +
      blocks.map(renderPrintBlock).join('') +
    '</div>';

    const html =
      '<style>' +
        '@page { size: ' + canvas.paper + ' ' + canvas.orient + '; margin: 0; }' +
        '@import url("https://fonts.googleapis.com/css2?family=Oswald:wght@600;700;800&family=Barlow:wght@400;500;600;700;800;900&display=swap");' +
        '* { box-sizing: border-box; }' +
        'body { margin: 0; padding: 0; font-family: "Barlow", -apple-system, system-ui, sans-serif; font-size: 15px; line-height: 1.5; color: #111827; background: #fff; width: ' + pageW + 'mm; height: ' + pageH + 'mm; display: flex; flex-direction: column; overflow: hidden; }' +
        '.wb-print-sheet { width: ' + pageW + 'mm; flex: 1 1 auto; min-height: 0; padding: 14px; display: flex; flex-direction: column; overflow: hidden; }' +
        '.wb-print-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; }' +
        '.wb-print-block { break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid; }' +
        '@media screen { body { height: auto !important; overflow: visible !important; } }' +
        '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }' +
      '</style>' +
      '<div class="wb-print-sheet">' +
        '<div class="wb-print-body">' + blocksHtml + '</div>' +
      '</div>';

    PCD.print(html, canvas.title || (t('whiteboard_title', 'Kitchen Whiteboard')));
  }

  // Print-mode block renderer — v2.13.0 WYSIWYG: canvas ile AYNI inner content
  // (renderBlockContent) + AYNI kutu stili (blockBoxStyle). Tek fark: interactive
  // chrome (handle/tag/select border) yok. Böylece print = canvas önizlemesi.
  function renderPrintBlock(block) {
    const span = layoutSpan(block.layout || 'full');
    return '<div class="wb-print-block wb-print-block-' + block.type + '" style="grid-column:span ' + span + ';' + blockBoxStyle(block) + 'border-radius:6px;">' + renderBlockContent(block) + '</div>';
  }

  // ============ RE-RENDER HELPER ============
  let _currentView = null;
  function rerender() {
    if (!_currentView) _currentView = document.getElementById('view');
    if (_currentView) render(_currentView);
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.whiteboard = {
    render: function (view) {
      _currentView = view;
      _ui = { selectedBlockIdx: -1, bottomSheetOpen: false };
      render(view);
    },
  };
})();
