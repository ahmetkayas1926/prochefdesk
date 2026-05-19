/* ================================================================
   ProChefDesk — whiteboard.js (v2.9.40 MVP V1)
   Kitchen Whiteboard — customizable A4/A3 reference sheet for the
   pass: cooking times, core temps, plating weights, reheating
   tables, allergen reminders, etc. Replaces the laminated
   permanent-marker board with a printable, editable grid.

   V1 (this version):
   - Single canvas, auto-saved to localStorage
   - A4 / A3 + Portrait / Landscape
   - Configurable rows × cols (2..10)
   - Cell contents are free text (contenteditable)
   - Per-cell background color (small palette)
   - Print to PDF (browser native, A4/A3 sized)
   - Pre-filled starter template (operator can clear with one button)

   V2 (deferred):
   - Multiple saved canvases
   - Cell merging
   - Specialized widgets (doneness ladder, list, big number)
   - Template gallery (cook times, plating, salt list, reheating)
   - Cloud sync (for now LS-only — single device template)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  // v2.9.40 — Çoklu kanvas için yeni LS şeması. Eski `pcd_whiteboard_v1`
  // (single canvas) varsa otomatik canvases[0] olarak migrate edilir.
  const LS_KEY_OLD = 'pcd_whiteboard_v1';
  const LS_KEY = 'pcd_whiteboard_canvases_v2';

  function uid() { return 'wb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowIso() { return new Date().toISOString(); }

  // Color palette for cell background — neutral + 5 accent
  const PALETTE = [
    { id: 'white',   label: 'White',   bg: '#ffffff', text: '#111827' },
    { id: 'cream',   label: 'Cream',   bg: '#fef7ec', text: '#111827' },
    { id: 'green',   label: 'Green',   bg: '#dcfce7', text: '#14532d' },
    { id: 'red',     label: 'Red',     bg: '#fee2e2', text: '#7f1d1d' },
    { id: 'amber',   label: 'Amber',   bg: '#fef3c7', text: '#78350f' },
    { id: 'blue',    label: 'Blue',    bg: '#dbeafe', text: '#1e3a8a' },
    { id: 'dark',    label: 'Dark',    bg: '#1f2937', text: '#f9fafb' },
  ];

  // v2.9.40 — Per-cell font size + text alignment maps
  const FONT_SIZES = {
    sm: { px: 11, label: 'S' },
    md: { px: 14, label: 'M' },
    lg: { px: 20, label: 'L' },
    xl: { px: 28, label: 'XL' },
  };
  const ALIGNS = ['start', 'center', 'end'];
  const ALIGN_LABELS = { start: '⬅', center: '↔', end: '➡' };

  // v2.9.40 — Starter templates (operator-requested examples to show the
  // tool's capacity). Each template overrides title, grid size, and cells.
  // V2: more templates + template editor.
  const TEMPLATES = [
    {
      id: 'cook_times',
      labelKey: 'whiteboard_tpl_cook_times',
      label: 'Cooking Times & Core Temps',
      title: 'COOKING · CORE TEMP',
      paper: 'A4', orient: 'landscape', rows: 4, cols: 6,
      cells: [
        { r:0, c:0, text:'PROTEIN',    color:'dark' },
        { r:0, c:1, text:'BEEF',       color:'dark' },
        { r:0, c:2, text:'CHICKEN',    color:'dark' },
        { r:0, c:3, text:'FISH',       color:'dark' },
        { r:0, c:4, text:'LAMB',       color:'dark' },
        { r:0, c:5, text:'NOTES',      color:'dark' },
        { r:1, c:0, text:'TIME',       color:'amber' },
        { r:1, c:1, text:'8 min',      color:'white' },
        { r:1, c:2, text:'8 min',      color:'white' },
        { r:1, c:3, text:'8 min',      color:'white' },
        { r:1, c:4, text:'12 min',     color:'white' },
        { r:1, c:5, text:'Rest 2 min', color:'cream' },
        { r:2, c:0, text:'CORE TEMP',  color:'amber' },
        { r:2, c:1, text:'63°C',       color:'green' },
        { r:2, c:2, text:'75°C',       color:'green' },
        { r:2, c:3, text:'63°C',       color:'green' },
        { r:2, c:4, text:'65°C',       color:'green' },
        { r:2, c:5, text:'Internal',   color:'cream' },
        { r:3, c:0, text:'SEASONING',  color:'amber' },
        { r:3, c:1, text:'Salt after', color:'red' },
        { r:3, c:2, text:'No salt',    color:'red' },
        { r:3, c:3, text:'Spice mix',  color:'red' },
        { r:3, c:4, text:'Salt before',color:'white' },
        { r:3, c:5, text:'Check label',color:'cream' },
      ],
    },
    {
      id: 'plating',
      labelKey: 'whiteboard_tpl_plating',
      label: 'Plating Weights',
      title: 'PORTIONS · PLATING WEIGHTS',
      paper: 'A4', orient: 'portrait', rows: 7, cols: 2,
      cells: [
        { r:0, c:0, text:'DISH', color:'dark' },
        { r:0, c:1, text:'WEIGHT', color:'dark' },
        { r:1, c:0, text:'Hummus', color:'white' },        { r:1, c:1, text:'150 g', color:'green' },
        { r:2, c:0, text:'Muhammara', color:'white' },     { r:2, c:1, text:'150 g', color:'green' },
        { r:3, c:0, text:'Beef Skewer', color:'white' },   { r:3, c:1, text:'250 g', color:'green' },
        { r:4, c:0, text:'Chicken', color:'white' },       { r:4, c:1, text:'250 g', color:'green' },
        { r:5, c:0, text:'Lamb Shank', color:'white' },    { r:5, c:1, text:'300 g', color:'green' },
        { r:6, c:0, text:'Cauliflower', color:'white' },   { r:6, c:1, text:'250 g', color:'green' },
      ],
    },
    {
      id: 'reheating',
      labelKey: 'whiteboard_tpl_reheating',
      label: 'Reheating Guide',
      title: 'REHEATING',
      paper: 'A4', orient: 'landscape', rows: 3, cols: 4,
      cells: [
        { r:0, c:0, text:'ITEM',     color:'dark' },
        { r:0, c:1, text:'TIME',     color:'dark' },
        { r:0, c:2, text:'TEMP',     color:'dark' },
        { r:0, c:3, text:'NOTES',    color:'dark' },
        { r:1, c:0, text:'Rice',     color:'white' },
        { r:1, c:1, text:'2 min',    color:'amber' },
        { r:1, c:2, text:'75°C',     color:'green' },
        { r:1, c:3, text:'Cover with foil', color:'cream' },
        { r:2, c:0, text:'Sauce',    color:'white' },
        { r:2, c:1, text:'2 min',    color:'amber' },
        { r:2, c:2, text:'75°C',     color:'green' },
        { r:2, c:3, text:'Stir frequently', color:'cream' },
      ],
    },
    {
      id: 'allergens',
      labelKey: 'whiteboard_tpl_allergens',
      label: 'Allergen Quick Reference',
      title: 'ALLERGEN REMINDERS',
      paper: 'A4', orient: 'portrait', rows: 5, cols: 3,
      cells: [
        { r:0, c:0, text:'DISH', color:'dark' },
        { r:0, c:1, text:'CONTAINS', color:'dark' },
        { r:0, c:2, text:'NOTES', color:'dark' },
        { r:1, c:0, text:'Muhammara', color:'white' },
        { r:1, c:1, text:'Walnuts · Sesame', color:'red' },
        { r:1, c:2, text:'Tree-nut allergy alert', color:'cream' },
        { r:2, c:0, text:'Hummus', color:'white' },
        { r:2, c:1, text:'Sesame (tahini)', color:'red' },
        { r:2, c:2, text:'Verify with chef', color:'cream' },
        { r:3, c:0, text:'Kibbeh', color:'white' },
        { r:3, c:1, text:'Wheat · Pine nuts', color:'red' },
        { r:3, c:2, text:'Gluten in bulgur', color:'cream' },
        { r:4, c:0, text:'Katmer', color:'white' },
        { r:4, c:1, text:'Dairy · Wheat · Pistachio', color:'red' },
        { r:4, c:2, text:'No substitutions', color:'cream' },
      ],
    },
    {
      id: 'cleaning',
      labelKey: 'whiteboard_tpl_cleaning',
      label: 'Cleaning Schedule',
      title: 'CLEANING SCHEDULE',
      paper: 'A4', orient: 'landscape', rows: 4, cols: 5,
      cells: [
        { r:0, c:0, text:'AREA', color:'dark' },
        { r:0, c:1, text:'DAILY', color:'dark' },
        { r:0, c:2, text:'WEEKLY', color:'dark' },
        { r:0, c:3, text:'MONTHLY', color:'dark' },
        { r:0, c:4, text:'CHECK', color:'dark' },
        { r:1, c:0, text:'Stoves', color:'white' },
        { r:1, c:1, text:'After service', color:'green' },
        { r:1, c:2, text:'Deep clean', color:'amber' },
        { r:1, c:3, text:'Calibrate', color:'red' },
        { r:1, c:4, text:'☐', color:'white' },
        { r:2, c:0, text:'Fridges', color:'white' },
        { r:2, c:1, text:'Wipe surfaces', color:'green' },
        { r:2, c:2, text:'Empty + scrub', color:'amber' },
        { r:2, c:3, text:'Coil clean', color:'red' },
        { r:2, c:4, text:'☐', color:'white' },
        { r:3, c:0, text:'Floors', color:'white' },
        { r:3, c:1, text:'Mop end of day', color:'green' },
        { r:3, c:2, text:'Degrease', color:'amber' },
        { r:3, c:3, text:'Drain check', color:'red' },
        { r:3, c:4, text:'☐', color:'white' },
      ],
    },
    {
      id: 'service_briefing',
      labelKey: 'whiteboard_tpl_service_briefing',
      label: 'Service Briefing',
      title: 'SERVICE BRIEFING',
      paper: 'A4', orient: 'portrait', rows: 6, cols: 2,
      cells: [
        { r:0, c:0, text:'TOPIC', color:'dark' },
        { r:0, c:1, text:'NOTES', color:'dark' },
        { r:1, c:0, text:"Today's specials", color:'amber' },
        { r:1, c:1, text:'', color:'white' },
        { r:2, c:0, text:'86 list (out of stock)', color:'red' },
        { r:2, c:1, text:'', color:'white' },
        { r:3, c:0, text:'VIP / dietary tables', color:'blue' },
        { r:3, c:1, text:'', color:'white' },
        { r:4, c:0, text:'New menu items', color:'green' },
        { r:4, c:1, text:'', color:'white' },
        { r:5, c:0, text:'Reminders', color:'cream' },
        { r:5, c:1, text:'', color:'white' },
      ],
    },
  ];

  function defaultCanvas(name) {
    return {
      id: uid(),
      name: name || 'Untitled',
      title: name || 'KITCHEN WHITEBOARD',
      paper: 'A4',
      orient: 'landscape',
      rows: 4,
      cols: 4,
      cells: [],
      updatedAt: nowIso(),
    };
  }

  // v2.9.42 — Cloud sync: state.whiteboards = { wsId: [canvas, ...] }
  // (buffets/mise/team pattern, soft-delete tombstone). Eski LS v1/v2
  // verisi ilk boot'ta workspace'e migrate edilir.
  function activeWsId() {
    return (PCD.store && PCD.store.getActiveWorkspaceId && PCD.store.getActiveWorkspaceId()) || 'default';
  }

  function readAllRaw() {
    // Tombstone'lar dahil tüm canvas array (soft-delete diff için)
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
    // Cloud sync (waste/buffets pattern)
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

  function loadStore() {
    // Migration: eski LS keys → cloud-backed state
    migrateLegacyLS();

    let canvases = readAllVisible();
    if (canvases.length === 0) {
      // Hiç canvas yok — varsayılan oluştur
      const initial = defaultCanvas('My Whiteboard');
      writeAll([initial]);
      setActiveId(initial.id);
      canvases = [initial];
    }
    let activeId = getActiveId();
    // Active id mevcut canvas listesinde değilse ilkini seç
    if (!canvases.some(function (c) { return c.id === activeId; })) {
      activeId = canvases[0].id;
      setActiveId(activeId);
    }
    return { activeId: activeId, canvases: canvases };
  }

  function saveStore(store) {
    // store yapısı {activeId, canvases:[]}: aktif id'yi pref'e, kanvasları cloud'a yaz.
    setActiveId(store.activeId);
    // Soft-delete tombstone'larını koru: rawArray'deki silinmiş kayıtlar
    // varsa yeni write'da onları geri ekle.
    const raw = readAllRaw();
    const tombstones = raw.filter(function (c) { return c._deletedAt && !store.canvases.some(function (x) { return x.id === c.id; }); });
    const merged = (store.canvases || []).concat(tombstones);
    writeAll(merged);
  }

  function migrateLegacyLS() {
    // İlk boot'ta eski LS_KEY veya LS_KEY_OLD varsa cloud'a aktar.
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.canvases) && parsed.canvases.length) {
          // Mevcut active workspace'in canvas listesi boşsa ekle.
          const existing = readAllVisible();
          if (existing.length === 0) {
            writeAll(parsed.canvases);
            if (parsed.activeId) setActiveId(parsed.activeId);
          }
          localStorage.removeItem(LS_KEY);
          return;
        }
      }
    } catch (e) { /* fall through */ }
    try {
      const old = localStorage.getItem(LS_KEY_OLD);
      if (old) {
        const oldState = JSON.parse(old);
        if (oldState && typeof oldState === 'object') {
          const existing = readAllVisible();
          if (existing.length === 0) {
            const migrated = Object.assign(defaultCanvas('My Whiteboard'), oldState);
            migrated.id = uid();
            migrated.name = oldState.title || 'My Whiteboard';
            migrated.updatedAt = nowIso();
            writeAll([migrated]);
            setActiveId(migrated.id);
          }
          localStorage.removeItem(LS_KEY_OLD);
        }
      }
    } catch (e) { /* migration failed, ignore */ }
  }

  function getActive(store) {
    return store.canvases.find(function (c) { return c.id === store.activeId; }) || store.canvases[0];
  }

  // Compatibility shim: kalan kod loadState/saveState'i kullanıyor; bunlar
  // store içindeki active canvas üzerinden işliyor.
  function loadState() {
    const store = loadStore();
    return getActive(store);
  }
  function saveState(s) {
    const store = loadStore();
    const idx = store.canvases.findIndex(function (c) { return c.id === store.activeId; });
    if (idx >= 0) {
      // Active canvas'ı update et
      store.canvases[idx] = Object.assign({}, store.canvases[idx], s, { updatedAt: nowIso() });
    } else {
      // No active → append new
      const fresh = Object.assign(defaultCanvas('Untitled'), s);
      store.canvases.push(fresh);
      store.activeId = fresh.id;
    }
    saveStore(store);
  }

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const store = loadStore();
    const s = getActive(store);
    const canvasCount = store.canvases.length;

    // Cell lookup map for quick access
    const cellMap = {};
    (s.cells || []).forEach(function (c) { cellMap[c.r + ':' + c.c] = c; });

    // v2.9.41 — Cell merge support: pre-compute occupied positions covered
    // by merged cells. Spanning cells claim grid coordinates beyond their
    // anchor (r,c); we skip rendering an empty <div> at those positions
    // because the spanning cell visually covers them.
    const occupied = {};
    (s.cells || []).forEach(function (cell) {
      const rs = Math.max(1, parseInt(cell.rowSpan, 10) || 1);
      const cs = Math.max(1, parseInt(cell.colSpan, 10) || 1);
      if (rs === 1 && cs === 1) return;
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (dr === 0 && dc === 0) continue;  // anchor itself, not occupied
          occupied[(cell.r + dr) + ':' + (cell.c + dc)] = true;
        }
      }
    });

    const paperButtons = ['A4', 'A3'].map(function (p) {
      return '<button type="button" class="btn btn-secondary btn-sm' + (s.paper === p ? ' active' : '') + '" data-paper="' + p + '" style="flex:1;">' + p + '</button>';
    }).join('');

    const orientButtons = [
      { id: 'portrait',  label: t('kc_portrait') || 'Portrait' },
      { id: 'landscape', label: t('kc_landscape') || 'Landscape' },
    ].map(function (o) {
      return '<button type="button" class="btn btn-secondary btn-sm' + (s.orient === o.id ? ' active' : '') + '" data-orient="' + o.id + '" style="flex:1;">' + PCD.escapeHtml(o.label) + '</button>';
    }).join('');

    let buildHtml =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">📝 ' + PCD.escapeHtml(t('whiteboard_title') || 'Kitchen Whiteboard') + '</div>' +
          '<div class="page-subtitle">' + PCD.escapeHtml(t('whiteboard_subtitle') || 'Customizable A4/A3 reference sheet — edit cells, pick colors, print') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="wbTemplateBtn">' + PCD.icon('book-open', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_templates') || 'Templates') + '</span></button>' +
          '<button class="btn btn-outline btn-sm" id="wbClearBtn">' + PCD.icon('rotate-ccw', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_reset') || 'Reset') + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="wbPrintBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('print') || 'Print') + '</span></button>' +
        '</div>' +
      '</div>' +
      // v2.9.40 — Canvas selector bar (multi-canvas support).
      '<div class="card mb-3" style="padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;">' +
          PCD.escapeHtml(t('whiteboard_canvas') || 'Canvas') + ':' +
        '</div>' +
        '<select id="wbCanvasSelect" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;">' +
          store.canvases.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === store.activeId ? ' selected' : '') + '>' + PCD.escapeHtml(c.name || c.title || 'Untitled') + '</option>';
          }).join('') +
        '</select>' +
        '<button class="btn btn-outline btn-sm" id="wbNewCanvasBtn">' + PCD.icon('plus', 14) + ' <span>' + PCD.escapeHtml(t('whiteboard_new_canvas') || 'New') + '</span></button>' +
        (canvasCount > 1 ? '<button class="btn btn-outline btn-sm" id="wbDeleteCanvasBtn" style="color:var(--danger);">' + PCD.icon('trash-2', 14) + '</button>' : '') +
      '</div>' +
      '<div class="card mb-3" style="padding:14px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:end;">' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('whiteboard_title_label') || 'Title') + '</div>' +
            '<input id="wbTitle" type="text" class="input" maxlength="80" value="' + PCD.escapeHtml(s.title || '') + '" style="width:100%;">' +
          '</div>' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('whiteboard_paper') || 'Paper') + '</div>' +
            '<div class="flex gap-1">' + paperButtons + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('kc_orientation') || 'Orientation') + '</div>' +
            '<div class="flex gap-1">' + orientButtons + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="text-muted text-sm mb-1">' + PCD.escapeHtml(t('whiteboard_grid') || 'Grid') + ' (' + s.rows + ' × ' + s.cols + ')</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<input id="wbRows" type="number" min="2" max="10" value="' + s.rows + '" style="width:60px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:13px;text-align:center;">' +
              '<span style="display:flex;align-items:center;color:var(--text-3);">×</span>' +
              '<input id="wbCols" type="number" min="2" max="10" value="' + s.cols + '" style="width:60px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:13px;text-align:center;">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="text-muted" style="margin-top:10px;font-size:12px;line-height:1.5;">' +
          '💡 ' + PCD.escapeHtml(t('whiteboard_tip') || 'Click any cell to edit text. Right-click cell to change color. Auto-saved to this browser.') +
        '</div>' +
      '</div>';

    // Build grid preview (scaled to fit screen)
    const paperDims = (function () {
      const isLand = s.orient === 'landscape';
      if (s.paper === 'A3') return isLand ? { w: 420, h: 297 } : { w: 297, h: 420 };
      return isLand ? { w: 297, h: 210 } : { w: 210, h: 297 };
    })();
    // Live preview at ~50% scale so it fits the screen
    const previewScale = 2.4;
    const pxW = Math.round(paperDims.w * previewScale);
    const pxH = Math.round(paperDims.h * previewScale);

    let gridHtml =
      '<div class="card" style="padding:12px;overflow:auto;">' +
        '<div id="wbSheet" style="width:' + pxW + 'px;height:' + pxH + 'px;background:#fff;color:#111827;margin:0 auto;display:flex;flex-direction:column;box-shadow:0 1px 4px rgba(0,0,0,0.1);border:1px solid #d1d5db;">' +
          '<div class="wb-title" style="padding:8px 14px;border-bottom:2px solid #16a34a;font-weight:800;font-size:18px;letter-spacing:0.04em;text-transform:uppercase;flex:0 0 auto;">' + PCD.escapeHtml(s.title || '') + '</div>' +
          '<div class="wb-grid" style="flex:1 1 auto;display:grid;grid-template-rows:repeat(' + s.rows + ',1fr);grid-template-columns:repeat(' + s.cols + ',1fr);gap:2px;padding:4px;background:#cbd5e1;">';

    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        // v2.9.41 — Skip cells covered by a merged neighbor
        if (occupied[r + ':' + c]) continue;
        const cell = cellMap[r + ':' + c] || {};
        const palette = PALETTE.find(function (p) { return p.id === cell.color; }) || PALETTE[0];
        const fz = FONT_SIZES[cell.fontSize] || FONT_SIZES.md;
        const align = ALIGNS.indexOf(cell.align) >= 0 ? cell.align : 'start';
        const rs = Math.max(1, parseInt(cell.rowSpan, 10) || 1);
        const cs = Math.max(1, parseInt(cell.colSpan, 10) || 1);
        // Clamp span to grid bounds
        const rsClamped = Math.min(rs, s.rows - r);
        const csClamped = Math.min(cs, s.cols - c);
        const spanStyle = (rsClamped > 1 ? 'grid-row:' + (r + 1) + ' / span ' + rsClamped + ';' : '') +
                          (csClamped > 1 ? 'grid-column:' + (c + 1) + ' / span ' + csClamped + ';' : '');
        gridHtml +=
          '<div class="wb-cell" data-r="' + r + '" data-c="' + c + '" contenteditable="true" style="' +
            'background:' + palette.bg + ';color:' + palette.text + ';' +
            'padding:6px 8px;font-size:' + fz.px + 'px;line-height:1.3;overflow:hidden;' +
            'outline:none;cursor:text;border-radius:3px;min-height:40px;' +
            'word-break:break-word;overflow-wrap:break-word;' +
            'text-align:' + align + ';' +
            'display:flex;flex-direction:column;justify-content:center;' +
            spanStyle +
          '" data-color="' + palette.id + '" data-font="' + (cell.fontSize || 'md') + '" data-align="' + align + '" data-rs="' + rsClamped + '" data-cs="' + csClamped + '">' + PCD.escapeHtml(cell.text || '') + '</div>';
      }
    }
    gridHtml += '</div></div></div>';

    // Color palette popover (hidden by default, shown on right-click).
    // v2.9.40 — Also exposes font-size + text-align per cell.
    let paletteHtml = '<div id="wbPalette" style="display:none;position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);">';
    paletteHtml += '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:6px;">' + PCD.escapeHtml(t('whiteboard_cell_color') || 'Cell color') + '</div>';
    paletteHtml += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
    PALETTE.forEach(function (p) {
      paletteHtml += '<button type="button" data-set-color="' + p.id + '" title="' + PCD.escapeHtml(p.label) + '" style="width:28px;height:28px;border:1px solid #d1d5db;border-radius:4px;background:' + p.bg + ';cursor:pointer;"></button>';
    });
    paletteHtml += '</div>';
    // Font size selector
    paletteHtml += '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:6px;">' + PCD.escapeHtml(t('whiteboard_cell_font_size') || 'Font size') + '</div>';
    paletteHtml += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
    Object.keys(FONT_SIZES).forEach(function (k) {
      const fz = FONT_SIZES[k];
      paletteHtml += '<button type="button" data-set-font="' + k + '" style="flex:1;min-width:36px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text-1);font-size:' + Math.min(16, fz.px) + 'px;font-weight:700;cursor:pointer;">' + fz.label + '</button>';
    });
    paletteHtml += '</div>';
    // Text align selector
    paletteHtml += '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:6px;">' + PCD.escapeHtml(t('whiteboard_cell_align') || 'Text align') + '</div>';
    paletteHtml += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
    ALIGNS.forEach(function (a) {
      paletteHtml += '<button type="button" data-set-align="' + a + '" style="flex:1;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text-1);font-size:14px;cursor:pointer;">' + ALIGN_LABELS[a] + '</button>';
    });
    paletteHtml += '</div>';
    // v2.9.41 — Cell merge: row span / col span number inputs
    paletteHtml += '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:6px;">' + PCD.escapeHtml(t('whiteboard_cell_merge') || 'Merge (span)') + '</div>';
    paletteHtml += '<div style="display:flex;gap:6px;align-items:center;">';
    paletteHtml += '<label style="font-size:11px;color:var(--text-3);">↓</label>';
    paletteHtml += '<input id="wbRowSpan" type="number" min="1" max="10" value="1" style="width:50px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text-1);font-size:13px;text-align:center;">';
    paletteHtml += '<label style="font-size:11px;color:var(--text-3);margin-left:6px;">→</label>';
    paletteHtml += '<input id="wbColSpan" type="number" min="1" max="10" value="1" style="width:50px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text-1);font-size:13px;text-align:center;">';
    paletteHtml += '<button type="button" id="wbResetSpan" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text-1);font-size:11px;cursor:pointer;">' + PCD.escapeHtml(t('whiteboard_cell_unmerge') || 'Reset') + '</button>';
    paletteHtml += '</div></div>';

    view.innerHTML = buildHtml + gridHtml + paletteHtml;

    // ---------- Wire controls ----------
    function persist() {
      saveState(s);
    }

    PCD.$('#wbTitle', view).addEventListener('input', function () {
      s.title = this.value;
      s.name = this.value;  // canvas adı title ile senkron — basitlik
      const tEl = view.querySelector('.wb-title');
      if (tEl) tEl.textContent = s.title;
      // Dropdown'daki seçili option'un text'ini de güncelle
      const opt = view.querySelector('#wbCanvasSelect option[value="' + s.id + '"]');
      if (opt) opt.textContent = s.title || 'Untitled';
      persist();
    });

    // v2.9.40 — Canvas selector handlers
    PCD.$('#wbCanvasSelect', view).addEventListener('change', function () {
      const newActive = this.value;
      const fresh = loadStore();
      fresh.activeId = newActive;
      saveStore(fresh);
      render(view);
    });
    PCD.$('#wbNewCanvasBtn', view).addEventListener('click', function () {
      const fresh = loadStore();
      const nc = defaultCanvas('New whiteboard ' + (fresh.canvases.length + 1));
      fresh.canvases.push(nc);
      fresh.activeId = nc.id;
      saveStore(fresh);
      render(view);
      PCD.toast.success(t('whiteboard_new_canvas_created') || 'New canvas created');
    });
    const delBtn = PCD.$('#wbDeleteCanvasBtn', view);
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        PCD.modal.confirm({
          icon: '🗑',
          iconKind: 'danger',
          danger: true,
          title: t('whiteboard_delete_canvas_confirm_title') || 'Delete this canvas?',
          text: t('whiteboard_delete_canvas_confirm_text') || 'This canvas will be permanently deleted from this browser. Other saved canvases remain.',
          okText: t('delete') || 'Delete',
          cancelText: t('cancel') || 'Cancel',
        }).then(function (ok) {
          if (!ok) return;
          // v2.9.42 — Soft-delete (tombstone). Raw array içinde _deletedAt
          // bırakılır → queueArraySync diff DELETE değil UPDATE upsert üretir,
          // realtime ile diğer cihazlara cascade. Sonra visible listede yok.
          const all = readAllRaw().slice();
          const fresh = loadStore();
          const idx = all.findIndex(function (c) { return c.id === fresh.activeId; });
          if (idx >= 0) {
            all[idx] = Object.assign({}, all[idx], { _deletedAt: nowIso() });
          }
          writeAll(all);
          const remaining = readAllVisible();
          if (remaining.length === 0) {
            const nc = defaultCanvas('My Whiteboard');
            writeAll(all.concat([nc]));
            setActiveId(nc.id);
          } else {
            setActiveId(remaining[0].id);
          }
          render(view);
        });
      });
    }

    PCD.on(view, 'click', '[data-paper]', function () {
      s.paper = this.getAttribute('data-paper');
      persist();
      render(view);
    });
    PCD.on(view, 'click', '[data-orient]', function () {
      s.orient = this.getAttribute('data-orient');
      persist();
      render(view);
    });

    PCD.$('#wbRows', view).addEventListener('change', function () {
      const v = Math.max(2, Math.min(10, parseInt(this.value, 10) || 4));
      s.rows = v;
      persist();
      render(view);
    });
    PCD.$('#wbCols', view).addEventListener('change', function () {
      const v = Math.max(2, Math.min(10, parseInt(this.value, 10) || 4));
      s.cols = v;
      persist();
      render(view);
    });

    // Cell editing — capture blur to commit text
    PCD.$$('.wb-cell', view).forEach(function (cellEl) {
      cellEl.addEventListener('input', function () {
        const r = parseInt(this.getAttribute('data-r'), 10);
        const c = parseInt(this.getAttribute('data-c'), 10);
        const text = this.innerText || '';
        const color = this.getAttribute('data-color') || 'white';
        // Upsert into cells array
        const idx = (s.cells || []).findIndex(function (x) { return x.r === r && x.c === c; });
        if (idx >= 0) {
          s.cells[idx].text = text;
        } else if (text) {
          s.cells = s.cells || [];
          s.cells.push({ r: r, c: c, text: text, color: color });
        }
        persist();
      });
      // Right-click → open color palette
      cellEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        const palette = view.querySelector('#wbPalette');
        if (!palette) return;
        palette.style.display = 'block';
        palette.style.left = e.clientX + 'px';
        palette.style.top = e.clientY + 'px';
        palette.dataset.targetR = this.getAttribute('data-r');
        palette.dataset.targetC = this.getAttribute('data-c');
        // v2.9.41 — Sync span inputs with current cell
        const rsEl = palette.querySelector('#wbRowSpan');
        const csEl = palette.querySelector('#wbColSpan');
        if (rsEl) rsEl.value = this.getAttribute('data-rs') || '1';
        if (csEl) csEl.value = this.getAttribute('data-cs') || '1';
      });
    });

    // v2.9.40 — Cell property setter: color, fontSize, align — single helper
    function applyCellProp(prop, value) {
      const palette = view.querySelector('#wbPalette');
      if (!palette) return;
      const r = parseInt(palette.dataset.targetR, 10);
      const c = parseInt(palette.dataset.targetC, 10);
      const target = view.querySelector('.wb-cell[data-r="' + r + '"][data-c="' + c + '"]');
      const idx = (s.cells || []).findIndex(function (x) { return x.r === r && x.c === c; });
      if (idx >= 0) {
        s.cells[idx][prop] = value;
      } else {
        s.cells = s.cells || [];
        const newCell = { r: r, c: c, text: (target ? target.innerText : '') };
        newCell[prop] = value;
        s.cells.push(newCell);
      }
      // Live UI update
      if (target) {
        if (prop === 'color') {
          const palObj = PALETTE.find(function (p) { return p.id === value; }) || PALETTE[0];
          target.style.background = palObj.bg;
          target.style.color = palObj.text;
          target.setAttribute('data-color', value);
        } else if (prop === 'fontSize') {
          const fz = FONT_SIZES[value] || FONT_SIZES.md;
          target.style.fontSize = fz.px + 'px';
          target.setAttribute('data-font', value);
        } else if (prop === 'align') {
          target.style.textAlign = value;
          target.setAttribute('data-align', value);
        }
      }
      persist();
    }

    PCD.on(view, 'click', '[data-set-color]', function () {
      applyCellProp('color', this.getAttribute('data-set-color'));
      const palette = view.querySelector('#wbPalette');
      if (palette) palette.style.display = 'none';
    });
    PCD.on(view, 'click', '[data-set-font]', function () {
      applyCellProp('fontSize', this.getAttribute('data-set-font'));
    });
    PCD.on(view, 'click', '[data-set-align]', function () {
      applyCellProp('align', this.getAttribute('data-set-align'));
    });

    // v2.9.41 — Span apply (row + col together so user can set both, then re-render)
    function applySpan(rowSpan, colSpan) {
      const palette = view.querySelector('#wbPalette');
      if (!palette) return;
      const r = parseInt(palette.dataset.targetR, 10);
      const c = parseInt(palette.dataset.targetC, 10);
      const target = view.querySelector('.wb-cell[data-r="' + r + '"][data-c="' + c + '"]');
      const idx = (s.cells || []).findIndex(function (x) { return x.r === r && x.c === c; });
      if (idx >= 0) {
        s.cells[idx].rowSpan = rowSpan;
        s.cells[idx].colSpan = colSpan;
      } else {
        s.cells = s.cells || [];
        s.cells.push({ r: r, c: c, text: (target ? target.innerText : ''), rowSpan: rowSpan, colSpan: colSpan });
      }
      persist();
      // Full re-render so other cells (occupied or not) reflow correctly
      palette.style.display = 'none';
      render(view);
    }
    const rsInput = view.querySelector('#wbRowSpan');
    const csInput = view.querySelector('#wbColSpan');
    if (rsInput && csInput) {
      const onSpanChange = function () {
        const rs = Math.max(1, Math.min(10, parseInt(rsInput.value, 10) || 1));
        const cs = Math.max(1, Math.min(10, parseInt(csInput.value, 10) || 1));
        applySpan(rs, cs);
      };
      rsInput.addEventListener('change', onSpanChange);
      csInput.addEventListener('change', onSpanChange);
    }
    const resetBtn = view.querySelector('#wbResetSpan');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        applySpan(1, 1);
      });
    }

    // Close palette on outside click
    document.addEventListener('click', function (e) {
      const palette = view.querySelector('#wbPalette');
      if (!palette || palette.style.display === 'none') return;
      if (!palette.contains(e.target) && !e.target.closest('.wb-cell')) {
        palette.style.display = 'none';
      }
    }, { once: true });

    // Reset — sadece aktif canvas'ın hücrelerini temizle (grid + title korunur)
    PCD.$('#wbClearBtn', view).addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '↺',
        title: t('whiteboard_reset_confirm_title') || 'Reset whiteboard?',
        text: t('whiteboard_reset_confirm_text') || 'All cells will be cleared (grid + title kept).',
        okText: t('whiteboard_reset') || 'Reset',
        cancelText: t('cancel') || 'Cancel',
      }).then(function (ok) {
        if (!ok) return;
        s.cells = [];
        persist();
        render(view);
      });
    });

    // Print
    PCD.$('#wbPrintBtn', view).addEventListener('click', function () {
      printSheet(s);
    });

    // v2.9.40 — Template picker
    PCD.$('#wbTemplateBtn', view).addEventListener('click', function () {
      openTemplatePicker(view);
    });
  }

  // ============ TEMPLATE PICKER ============
  function openTemplatePicker(view) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    let html = '<div style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.5;">' +
      PCD.escapeHtml(t('whiteboard_template_intro') || 'Pick a starter template. This replaces your current whiteboard — your in-progress work will be lost.') +
    '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    TEMPLATES.forEach(function (tpl) {
      html += '<button type="button" data-tpl="' + tpl.id + '" style="text-align:start;padding:12px 14px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;cursor:pointer;">' +
        '<div style="font-weight:700;font-size:14px;color:var(--text-1);margin-bottom:3px;">' + PCD.escapeHtml(t(tpl.labelKey) || tpl.label) + '</div>' +
        '<div style="font-size:12px;color:var(--text-3);">' + tpl.paper + ' ' + tpl.orient + ' · ' + tpl.rows + ' × ' + tpl.cols + ' · ' + tpl.cells.length + ' ' + PCD.escapeHtml(t('whiteboard_cells') || 'cells') + '</div>' +
      '</button>';
    });
    html += '</div>';
    body.innerHTML = html;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(cancelBtn);

    const m = PCD.modal.open({
      title: '📚 ' + (t('whiteboard_templates') || 'Templates'),
      body: body, footer: footer, size: 'md', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });

    body.querySelectorAll('[data-tpl]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-tpl');
        const tpl = TEMPLATES.find(function (x) { return x.id === id; });
        if (!tpl) return;
        // v2.9.40 — Şablonu YENİ kanvas olarak ekle (mevcut active'ı bozma)
        const fresh = loadStore();
        const nc = Object.assign(defaultCanvas(tpl.title), {
          name: tpl.title,
          title: tpl.title,
          paper: tpl.paper,
          orient: tpl.orient,
          rows: tpl.rows,
          cols: tpl.cols,
          cells: tpl.cells.slice(),
        });
        fresh.canvases.push(nc);
        fresh.activeId = nc.id;
        saveStore(fresh);
        m.close();
        render(view);
      });
    });
  }

  // ============ PRINT ============
  function printSheet(s) {
    const paper = s.paper || 'A4';
    const orient = s.orient || 'landscape';
    const isLand = orient === 'landscape';
    const dims = (paper === 'A3')
      ? (isLand ? { w: 420, h: 297 } : { w: 297, h: 420 })
      : (isLand ? { w: 297, h: 210 } : { w: 210, h: 297 });

    const cellMap = {};
    (s.cells || []).forEach(function (c) { cellMap[c.r + ':' + c.c] = c; });

    // v2.9.41 — Cell merge: print path mirrors live preview occupied skip + span.
    const occupiedPrint = {};
    (s.cells || []).forEach(function (cell) {
      const rs = Math.max(1, parseInt(cell.rowSpan, 10) || 1);
      const cs = Math.max(1, parseInt(cell.colSpan, 10) || 1);
      if (rs === 1 && cs === 1) return;
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (dr === 0 && dc === 0) continue;
          occupiedPrint[(cell.r + dr) + ':' + (cell.c + dc)] = true;
        }
      }
    });

    let gridHtml = '';
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (occupiedPrint[r + ':' + c]) continue;
        const cell = cellMap[r + ':' + c] || {};
        const palette = PALETTE.find(function (p) { return p.id === cell.color; }) || PALETTE[0];
        const fz = FONT_SIZES[cell.fontSize] || FONT_SIZES.md;
        const align = ALIGNS.indexOf(cell.align) >= 0 ? cell.align : 'start';
        const rs = Math.max(1, Math.min(parseInt(cell.rowSpan, 10) || 1, s.rows - r));
        const cs = Math.max(1, Math.min(parseInt(cell.colSpan, 10) || 1, s.cols - c));
        const spanStyle = (rs > 1 ? 'grid-row:' + (r + 1) + ' / span ' + rs + ';' : '') +
                          (cs > 1 ? 'grid-column:' + (c + 1) + ' / span ' + cs + ';' : '');
        gridHtml +=
          '<div style="background:' + palette.bg + ';color:' + palette.text + ';padding:6px 8px;font-size:' + fz.px + 'px;line-height:1.3;overflow:hidden;border-radius:3px;word-break:break-word;overflow-wrap:break-word;text-align:' + align + ';display:flex;flex-direction:column;justify-content:center;' + spanStyle + '">' +
            PCD.escapeHtml(cell.text || '') +
          '</div>';
      }
    }

    const html =
      '<style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;margin:0;padding:0;' +
          'width:' + dims.w + 'mm;height:' + dims.h + 'mm;display:flex;flex-direction:column;}' +
        '.wb-sheet{flex:1 1 auto;min-height:0;padding:5mm;display:flex;flex-direction:column;}' +
        '.wb-title{padding:6px 12px;border-bottom:2.5px solid #16a34a;font-weight:800;font-size:22px;letter-spacing:0.04em;text-transform:uppercase;flex:0 0 auto;}' +
        '.wb-grid{flex:1 1 auto;display:grid;grid-template-rows:repeat(' + s.rows + ',1fr);grid-template-columns:repeat(' + s.cols + ',1fr);gap:2px;padding:4px;background:#cbd5e1;}' +
        '.pcd-print-footer{margin:0 !important;padding:1mm 4mm !important;border-top:none !important;flex:0 0 auto;font-size:7pt !important;line-height:1.2 !important;}' +
        '@page{size:' + paper + ' ' + orient + ';margin:0;}' +
      '</style>' +
      '<div class="wb-sheet">' +
        '<div class="wb-title">' + PCD.escapeHtml(s.title || '') + '</div>' +
        '<div class="wb-grid">' + gridHtml + '</div>' +
      '</div>';

    PCD.print(html, 'Whiteboard · ' + (s.title || ''));
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.whiteboard = { render: render };
})();
