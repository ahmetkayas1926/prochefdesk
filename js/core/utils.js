/* ================================================================
   ProChefDesk — utils.js
   Pure helpers: DOM, formatting, IDs, debounce, throttle, etc.
   ================================================================ */

(function () {
  'use strict';

  const PCD = window.PCD = window.PCD || {};

  // ---------- ID GENERATION ----------
  PCD.uid = function (prefix) {
    prefix = prefix || 'id';
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  };

  // ---------- DOM HELPERS ----------
  PCD.$ = function (sel, root) { return (root || document).querySelector(sel); };
  PCD.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  PCD.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (k === 'class' || k === 'className') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k === 'text' || k === 'textContent') e.textContent = v;
        else if (k === 'html' || k === 'innerHTML') e.innerHTML = v;
        else if (k === 'on' && typeof v === 'object') {
          Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
        }
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), v);
        }
        else if (v !== null && v !== undefined && v !== false) {
          e.setAttribute(k, v === true ? '' : v);
        }
      });
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
        else if (c instanceof Node) e.appendChild(c);
      });
    }
    return e;
  };

  PCD.clear = function (node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  };

  // Delegated event binding. Prevents duplicate listeners on the same
  // (node, event, selector) triple — safe to call repeatedly from render functions.
  PCD.on = function (node, ev, sel, handler) {
    if (typeof sel === 'function') {
      // Direct listener — use a tag to prevent re-binding same function
      node.__pcdListeners = node.__pcdListeners || {};
      const key = ev + ':direct:' + (sel.__pcdId || (sel.__pcdId = Math.random().toString(36).slice(2)));
      if (node.__pcdListeners[key]) return;
      node.__pcdListeners[key] = true;
      node.addEventListener(ev, sel);
      return;
    }
    // Delegated — one listener per (ev, sel) pair on this node
    node.__pcdDelegated = node.__pcdDelegated || {};
    const key = ev + ':' + sel;
    if (node.__pcdDelegated[key]) {
      // Already has delegation for this pair — just swap the handler
      node.__pcdDelegated[key] = handler;
      return;
    }
    node.__pcdDelegated[key] = handler;
    node.addEventListener(ev, function (e) {
      let t = e.target;
      while (t && t !== node) {
        if (t.matches && t.matches(sel)) {
          const currentHandler = node.__pcdDelegated[key];
          if (currentHandler) currentHandler.call(t, e);
          return;
        }
        t = t.parentNode;
      }
    });
  };

  PCD.escapeHtml = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // ---------- TIMING ----------
  PCD.debounce = function (fn, ms) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };

  PCD.throttle = function (fn, ms) {
    let last = 0, t;
    return function () {
      const now = Date.now(), args = arguments, ctx = this;
      const wait = ms - (now - last);
      if (wait <= 0) { last = now; fn.apply(ctx, args); }
      else {
        clearTimeout(t);
        t = setTimeout(function () { last = Date.now(); fn.apply(ctx, args); }, wait);
      }
    };
  };

  PCD.sleep = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // ---------- FORMATTING ----------
  PCD.fmtMoney = function (amount, currency) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    currency = currency || (PCD.store && PCD.store.get('prefs.currency')) || 'USD';
    const cfg = window.PCD_CONFIG.CURRENCIES.find(function (c) { return c.code === currency; });
    const sym = cfg ? cfg.symbol : currency;
    const n = Number(amount);
    const abs = Math.abs(n);
    let str;
    if (abs >= 100000) str = n.toFixed(0);
    else if (abs >= 1000) str = n.toFixed(1);
    else str = n.toFixed(2);
    // remove trailing .00
    str = str.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return sym + str;
  };

  PCD.fmtNumber = function (n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    decimals = decimals === undefined ? 2 : decimals;
    return Number(n).toFixed(decimals).replace(/\.?0+$/, '');
  };

  PCD.fmtPercent = function (n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    decimals = decimals === undefined ? 1 : decimals;
    return Number(n).toFixed(decimals) + '%';
  };

  PCD.fmtDate = function (iso, opts) {
    if (!iso) return '';
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '';
    opts = opts || { year: 'numeric', month: 'short', day: 'numeric' };
    const loc = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    try { return d.toLocaleDateString(loc, opts); }
    catch (e) { return d.toLocaleDateString('en', opts); }
  };

  PCD.fmtRelTime = function (iso) {
    if (!iso) return '';
    const d = (iso instanceof Date) ? iso : new Date(iso);
    const ms = Date.now() - d.getTime();
    const s = Math.floor(ms / 1000);
    const t = PCD.i18n ? PCD.i18n.t : function (k) { return k; };
    if (s < 60) return t('just_now');
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + t('ago');
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + t('ago');
    const dd = Math.floor(h / 24);
    if (dd < 7) return dd + 'd ' + t('ago');
    return PCD.fmtDate(d);
  };

  // ---------- UNITS ----------
  PCD.UNITS = {
    mass: { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 },
    volume: { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 240, 'fl_oz': 29.5735 },
    count: { unit: 1, pcs: 1, piece: 1, each: 1 }
  };

  PCD.convertUnit = function (value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;
    const groups = PCD.UNITS;
    for (const g in groups) {
      const table = groups[g];
      if (fromUnit in table && toUnit in table) {
        return value * table[fromUnit] / table[toUnit];
      }
    }
    return value; // same group not found
  };

  PCD.unitGroup = function (u) {
    for (const g in PCD.UNITS) if (u in PCD.UNITS[g]) return g;
    return null;
  };

  // ---------- HAPTIC ----------
  PCD.haptic = function (kind) {
    if (!navigator.vibrate) return;
    const patterns = {
      light: 10,
      medium: 20,
      heavy: [10, 30, 10],
      success: [10, 40, 10],
      error: [30, 50, 30, 50, 30],
      tick: 5,
    };
    try { navigator.vibrate(patterns[kind] || 10); } catch (e) {}
  };

  // ---------- VALIDATION ----------
  PCD.isEmail = function (s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  };
  PCD.clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  // ---------- CLONE ----------
  PCD.clone = function (obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) { return obj; }
  };

  // ---------- DOWNLOAD (for CSV/JSON export) ----------
  PCD.download = function (content, filename, mime) {
    mime = mime || 'text/plain';
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  };

  // ---------- LOG ----------
  PCD.log = function () {
    if (window.PCD_CONFIG && window.PCD_CONFIG.DEBUG) {
      const args = Array.prototype.slice.call(arguments);
      args.unshift('[PCD]');
      console.log.apply(console, args);
    }
  };
  PCD.warn = function () {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[PCD]');
    console.warn.apply(console, args);
  };
  PCD.err = function () {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[PCD]');
    console.error.apply(console, args);
  };

  // ---------- DETECT MOBILE ----------
  PCD.isMobile = function () {
    return window.matchMedia('(max-width: 899px)').matches;
  };
  PCD.isTouch = function () {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  };

  // ---------- SVG ICONS (shared) ----------
  PCD.icon = function (name, size) {
    size = size || 20;
    const icons = {
      plus: '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>',
      minus: '<path d="M5 12h14" stroke-linecap="round"/>',
      x: '<path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>',
      check: '<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>',
      trash: '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke-linecap="round" stroke-linejoin="round"/>',
      edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/>',
      chevronLeft: '<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>',
      chevronRight: '<path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>',
      chevronDown: '<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>',
      camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="4"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21" stroke-linecap="round" stroke-linejoin="round"/>',
      download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>',
      upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke-linecap="round" stroke-linejoin="round"/>',
      print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" stroke-linecap="round" stroke-linejoin="round"/>',
      share: '<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke-linecap="round" stroke-linejoin="round"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-linecap="round" stroke-linejoin="round"/>',
      grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke-linecap="round" stroke-linejoin="round"/>',
      alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke-linecap="round" stroke-linejoin="round"/>',
      'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke-linecap="round" stroke-linejoin="round"/>',
      info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/>',
      // nav icons
      home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22V12h6v10" stroke-linecap="round" stroke-linejoin="round"/>',
      'book-open': '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" stroke-linecap="round" stroke-linejoin="round"/>',
      carrot: '<path d="M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 00-6.36-6.37C5.77 11.83 2.27 21.7 2.27 21.7zM8.64 14l-2.05-2.04M15.34 15l-2.46-2.46" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9zM15 2s-2 1.33-2 3.5S15 9 15 9s2-1.84 2-3.5S15 2 15 2z" stroke-linecap="round" stroke-linejoin="round"/>',
      menu: '<path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/>',
      'id-card': '<rect x="3" y="4" width="18" height="16" rx="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2M15 12h2M7 16h10" stroke-linecap="round"/>',
      scale: '<path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" stroke-linecap="round" stroke-linejoin="round"/>',
      package: '<path d="M16.5 9.4L7.5 4.21M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke-linecap="round" stroke-linejoin="round"/>',
      recycle: '<path d="M7 19H4.815a1.83 1.83 0 01-1.57-.881 1.785 1.785 0 01-.004-1.784L7.196 9.5M11 19h8.203a1.83 1.83 0 001.556-.89 1.784 1.784 0 000-1.775l-1.226-2.12M14 16l-3 3 3 3M8.293 13.596L4.5 9.5 2.5 14M9.5 5.5l1.982-3.438a1.85 1.85 0 013.156 0l4.362 7.566M9 12l3-3 3 3M21.484 15.5L20 21l-5.5-1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
      'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" stroke-linecap="round" stroke-linejoin="round"/>',
      calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke-linecap="round"/>',
      'check-square': '<path d="M9 11l3 3L22 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke-linecap="round" stroke-linejoin="round"/>',
      activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/>',
      percent: '<line x1="19" y1="5" x2="5" y2="19" stroke-linecap="round"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4"/>',
      user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4"/>',
      phone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke-linecap="round" stroke-linejoin="round"/>',
      mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22,6 12,13 2,6" stroke-linecap="round" stroke-linejoin="round"/>',
      'message-circle': '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke-linecap="round" stroke-linejoin="round"/>',
      send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke-linecap="round" stroke-linejoin="round"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke-linecap="round" stroke-linejoin="round"/>',
      'file-text': '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/><line x1="10" y1="9" x2="8" y2="9" stroke-linecap="round"/>',
      refresh: '<polyline points="23 4 23 10 17 10" stroke-linecap="round" stroke-linejoin="round"/><polyline points="1 20 1 14 7 14" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke-linecap="round" stroke-linejoin="round"/>',
      'chef-hat': '<path d="M6 13.87A4 4 0 017.41 6a5.11 5.11 0 011.05-1.54 5 5 0 017.08 0A5.11 5.11 0 0116.59 6 4 4 0 0118 13.87V21H6z" stroke-linecap="round" stroke-linejoin="round"/><line x1="6" y1="17" x2="18" y2="17" stroke-linecap="round"/>',
      archive: '<rect x="2" y="4" width="20" height="5" rx="1" stroke-linejoin="round"/><path d="M4 9v10a2 2 0 002 2h12a2 2 0 002-2V9M10 13h4" stroke-linecap="round" stroke-linejoin="round"/>',
      thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4 4 0 105 0z" stroke-linecap="round" stroke-linejoin="round"/>',
      snowflake: '<line x1="2" y1="12" x2="22" y2="12" stroke-linecap="round"/><line x1="12" y1="2" x2="12" y2="22" stroke-linecap="round"/><path d="M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    const body = icons[name] || icons.info;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="' + size + '" height="' + size + '">' + body + '</svg>';
  };

  // Print helper — popup window on desktop, iframe modal on mobile.
  // Takes a full HTML string or just the body content (wraps if needed).
  PCD.print = function (htmlOrContent, title) {
    title = title || 'Print';

    // If input looks like partial content (no <!DOCTYPE>), wrap it
    let fullHtml = htmlOrContent;
    if (!/^<!DOCTYPE|^<html/i.test(htmlOrContent.trim())) {
      fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
        title + '</title>' +
        '<style>' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px;color:#000;background:#fff;margin:0}' +
        '@page{margin:15mm;size:A4}' +
        'h1,h2,h3{margin:0 0 8px}' +
        'table{width:100%;border-collapse:collapse}' +
        'td,th{padding:6px 10px;text-align:left;border-bottom:1px solid #ddd}' +
        'th{background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.04em}' +
        'pre{white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8}' +
        '.no-print{display:flex;gap:10px;padding:12px 16px;margin-bottom:16px;border-bottom:2px solid #16a34a;align-items:center;flex-wrap:wrap}' +
        '@media print{.no-print{display:none !important}body{padding:0}}' +
        '</style></head><body>' +
        htmlOrContent +
        '</body></html>';
    }

    // Inject print button at top (skipped when printing)
    const printableHtml = fullHtml.replace(
      /<body[^>]*>/,
      '$&<div class="no-print"><button onclick="window.print()" style="padding:8px 18px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Print / Save as PDF</button><button onclick="window.close()" style="padding:8px 14px;background:#f0f0f0;color:#333;border:none;border-radius:6px;font-size:13px;cursor:pointer">Close</button><span style="font-size:11px;color:#888">Tip: pick "Save as PDF" in the print dialog</span></div>'
    );

    // Try popup (desktop / allowing browsers)
    let w = null;
    try {
      w = window.open('', '_blank', 'width=900,height=750,scrollbars=yes');
      if (w && w.document && w.document.write) {
        w.document.write(printableHtml);
        w.document.close();
        w.focus();
        return;
      }
    } catch (e) { w = null; }

    // Fallback: in-app full-screen iframe modal (mobile / popup-blocked)
    const existing = document.getElementById('pcd-print-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'pcd-print-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#fff';
    modal.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e5e5e5;flex-shrink:0;background:#fff">' +
        '<span style="font-size:14px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + PCD.escapeHtml(title) + '</span>' +
        '<button id="pcd-print-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;padding:0 4px;line-height:1">×</button>' +
      '</div>' +
      '<iframe id="pcd-print-frame" style="flex:1;border:none;background:#fff;width:100%"></iframe>' +
      '<div style="padding:10px 14px;display:flex;gap:8px;border-top:1px solid #e5e5e5;flex-shrink:0;background:#fff">' +
        '<button id="pcd-print-go" style="flex:1;padding:12px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button>' +
        '<button id="pcd-print-close2" style="padding:12px 18px;background:#f0f0f0;color:#333;border:1px solid #ddd;border-radius:8px;font-size:13px;cursor:pointer">Close</button>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('pcd-print-close').onclick = function () { modal.remove(); };
    document.getElementById('pcd-print-close2').onclick = function () { modal.remove(); };
    document.getElementById('pcd-print-go').onclick = function () {
      const f = document.getElementById('pcd-print-frame');
      if (f && f.contentWindow) f.contentWindow.print();
    };
    const frame = document.getElementById('pcd-print-frame');
    if (frame) {
      frame.contentDocument.open();
      frame.contentDocument.write(fullHtml); // no print button needed here
      frame.contentDocument.close();
    }
  };

  // Action sheet — bottom sheet on mobile, center modal on desktop.
  // opts: { title?, actions: [{icon?, label, onClick, danger?}] }
  PCD.actionSheet = function (opts) {
    opts = opts || {};
    const actions = opts.actions || [];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s ease;';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:var(--surface);width:100%;max-width:480px;border-radius:var(--r-xl) var(--r-xl) 0 0;padding:8px 0 calc(8px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .25s ease;';
    let html = '';
    if (opts.title) {
      html += '<div style="padding:12px 16px 8px;font-weight:700;font-size:14px;color:var(--text-2);border-bottom:1px solid var(--border);">' + PCD.escapeHtml(opts.title) + '</div>';
    }
    actions.forEach(function (a, idx) {
      const color = a.danger ? 'var(--danger)' : 'var(--text)';
      html += '<button data-idx="' + idx + '" style="display:flex;align-items:center;gap:14px;width:100%;padding:14px 18px;border:0;background:transparent;color:' + color + ';font-size:15px;font-weight:500;text-align:start;cursor:pointer;">' +
        (a.icon ? '<span style="display:inline-flex;flex-shrink:0;">' + (typeof a.icon === 'string' && a.icon.indexOf('<') < 0 ? PCD.icon(a.icon, 20) : a.icon) + '</span>' : '') +
        '<span>' + PCD.escapeHtml(a.label) + '</span>' +
        '</button>';
    });
    html += '<div style="height:6px;"></div>';
    html += '<button data-idx="cancel" style="display:flex;align-items:center;justify-content:center;width:calc(100% - 24px);margin:0 12px;padding:14px;border:0;background:var(--surface-2);color:var(--text-2);font-size:15px;font-weight:600;border-radius:var(--r-md);cursor:pointer;">Cancel</button>';
    panel.innerHTML = html;
    host.appendChild(panel);
    document.body.appendChild(host);
    // Trigger animation
    requestAnimationFrame(function () {
      host.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });

    function close() {
      host.style.opacity = '0';
      panel.style.transform = 'translateY(100%)';
      setTimeout(function () { if (host.parentNode) host.parentNode.removeChild(host); }, 250);
    }
    host.addEventListener('click', function (e) {
      if (e.target === host) { close(); return; }
      const btn = e.target.closest('[data-idx]');
      if (!btn) return;
      const idx = btn.getAttribute('data-idx');
      if (idx === 'cancel') { close(); return; }
      const action = actions[parseInt(idx, 10)];
      close();
      if (action && action.onClick) setTimeout(action.onClick, 120);
    });
    return { close: close };
  };

  // Long-press + right-click helper. Calls onAction with (element, event).
  // Attach to a parent element with a selector.
  PCD.longPress = function (parent, selector, onAction) {
    if (!parent || parent.__pcdLongPress) return;
    parent.__pcdLongPress = true;
    let pressTimer = null;
    let pressedEl = null;
    let startX = 0, startY = 0;

    parent.addEventListener('contextmenu', function (e) {
      const el = e.target.closest(selector);
      if (!el) return;
      e.preventDefault();
      onAction(el, e);
    });

    parent.addEventListener('touchstart', function (e) {
      const el = e.target.closest(selector);
      if (!el) return;
      pressedEl = el;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        if (pressedEl === el) {
          // Haptic
          try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
          onAction(el, e);
          pressedEl = null; // Prevent click-after
        }
      }, 500);
    }, { passive: true });

    parent.addEventListener('touchmove', function (e) {
      if (!pressTimer) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > 10 || dy > 10) {
        clearTimeout(pressTimer);
        pressTimer = null;
        pressedEl = null;
      }
    }, { passive: true });

    parent.addEventListener('touchend', function () {
      clearTimeout(pressTimer);
      pressTimer = null;
      pressedEl = null;
    });
    parent.addEventListener('touchcancel', function () {
      clearTimeout(pressTimer);
      pressTimer = null;
      pressedEl = null;
    });
  };

  // ============ COPY-TO-WORKSPACE HELPER ============
  // Pickable picker: choose target workspace (from active list excluding current),
  // then store.copyToWorkspace clones the item under target ws.
  // table: 'recipes' | 'menus' | 'events' | 'suppliers' etc.
  PCD.openCopyToWorkspace = function (table, itemId, itemName) {
    const fromWsId = PCD.store.getActiveWorkspaceId();
    const all = PCD.store.listWorkspaces(false);
    const targets = all.filter(function (w) { return w.id !== fromWsId; });

    if (targets.length === 0) {
      PCD.modal.confirm({
        title: PCD.i18n.t('no_other_workspaces') || 'No other workspaces',
        text: 'You only have one active workspace. Create another from the workspace switcher first, then come back to copy.',
        okText: 'OK', cancelText: null,
      });
      return;
    }

    const colorHex = function (cid) {
      const map = {green:'#16a34a',blue:'#2563eb',purple:'#9333ea',pink:'#db2777',orange:'#ea580c',amber:'#d97706',teal:'#0d9488',slate:'#475569'};
      return map[cid] || map.green;
    };

    const body = PCD.el('div');
    let html = '<div class="text-muted text-sm mb-3">Copy <strong>' + PCD.escapeHtml(itemName || 'this item') + '</strong> to another workspace. The original stays untouched. The copy can be edited independently in the target.</div>';
    html += '<div class="flex flex-col gap-2">';
    targets.forEach(function (w) {
      html += '<button data-target="' + w.id + '" class="card card-hover" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);cursor:pointer;text-align:start;">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:' + colorHex(w.color) + ';color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon(w.icon || 'chef-hat', 18) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(w.name) + '</div>' +
          '<div class="text-muted" style="font-size:12px;">' +
            (w.concept ? PCD.escapeHtml(w.concept) : '') +
            (w.role ? (w.concept ? ' · ' : '') + PCD.escapeHtml(w.role) : '') +
          '</div>' +
        '</div>' +
        '<div style="color:var(--text-3);">' + PCD.icon('chevronRight', 18) + '</div>' +
      '</button>';
    });
    html += '</div>';
    body.innerHTML = html;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Cancel', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(cancelBtn);

    const m = PCD.modal.open({ title: PCD.i18n.t('btn_copy_to_workspace'), body: body, footer: footer, size: 'sm', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-target]', function () {
      const targetWsId = this.getAttribute('data-target');
      const copy = PCD.store.copyToWorkspace(table, itemId, fromWsId, targetWsId);
      const targetWs = PCD.store.getWorkspace(targetWsId);
      if (copy && targetWs) {
        PCD.toast.success(PCD.i18n.t('copied_to_workspace', { name: targetWs.name }));
      } else {
        PCD.toast.error(PCD.i18n.t('copy_failed'));
      }
      m.close();
    });
  };

})();
