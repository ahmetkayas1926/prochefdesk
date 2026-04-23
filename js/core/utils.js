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

  PCD.on = function (node, ev, sel, handler) {
    // delegated event. If sel is function, sel is handler.
    if (typeof sel === 'function') {
      node.addEventListener(ev, sel);
      return;
    }
    node.addEventListener(ev, function (e) {
      let t = e.target;
      while (t && t !== node) {
        if (t.matches && t.matches(sel)) { handler.call(t, e); return; }
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
      print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" stroke-linecap="round" stroke-linejoin="round"/>',
      share: '<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke-linecap="round" stroke-linejoin="round"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-linecap="round" stroke-linejoin="round"/>',
      grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke-linecap="round" stroke-linejoin="round"/>',
      alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke-linecap="round" stroke-linejoin="round"/>',
      info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    const body = icons[name] || '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="' + size + '" height="' + size + '">' + body + '</svg>';
  };

})();
