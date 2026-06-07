/* ================================================================
   ProChefDesk — menu_studio.js  (v2.19 — Menu Studio, Faz 1)
   ----------------------------------------------------------------
   Blok-kanvas menü tasarımcısı. Mevcut "Menus" aracını BOZMAZ;
   tasarımı aynı `menus` tablosunda `menu.studio` alanında saklar →
   bulut senkron + yedek + çoklu menü bedava, klasik editör de aynı
   kayıtta çalışmaya devam eder.

   Faz 1:
     - Çoklu menü (menus tablosu) + bulut senkron + otomatik kayıt
     - Reçete zekâsı: canlı food cost / kâr marjı + otomatik alerjen kodları
     - Klasik menüden içe aktarma (sections → bloklar)
     - Şablon galerisi + marka kiti (font/renk/logo kaydet-uygula)
     - Tek render motoru (kanvas = çıktı, WYSIWYG)
   Sonraki: serbest sürükle/boyut, çok sayfa, share/QR/cost-view, AI.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});
  const BRAND_KEY = 'pcd_menustudio_brandkit';

  // ---- Küratörlü fontlar ----
  // NOTE: css değerleri TEK tırnak kullanır. Bu stringler inline
  // style="..." (çift tırnak) içine enjekte edilir; font adında çift tırnak
  // olursa öznitelik kesilir ve sonraki TÜM CSS (align/color/size) silinir.
  const FONTS = [
    { label: 'Cormorant', css: "'Cormorant Garamond', Georgia, serif" },
    { label: 'Playfair', css: "'Playfair Display', Georgia, serif" },
    { label: 'EB Garamond', css: "'EB Garamond', Georgia, serif" },
    { label: 'Lora', css: "'Lora', Georgia, serif" },
    { label: 'Italiana', css: "'Italiana', Georgia, serif" },
    { label: 'Inter', css: "'Inter', -apple-system, sans-serif" },
    { label: 'Montserrat', css: "'Montserrat', sans-serif" },
    { label: 'Poppins', css: "'Poppins', sans-serif" },
    { label: 'Oswald', css: "'Oswald', sans-serif" },
    { label: 'Bebas Neue', css: "'Bebas Neue', sans-serif" },
    { label: 'Caveat', css: "'Caveat', cursive" },
    { label: 'Nunito', css: "'Nunito', sans-serif" },
  ];
  const GF_HREF = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond&family=Italiana&family=Lora:ital@0;1&family=Montserrat:wght@400;600;700&family=Nunito:wght@400;700&family=Oswald:wght@400;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Poppins:wght@400;600;700&display=swap';
  function ensureFonts(doc) {
    doc = doc || document;
    if (doc.getElementById('pcd-ms-fonts')) return;
    const l = doc.createElement('link');
    l.id = 'pcd-ms-fonts'; l.rel = 'stylesheet'; l.href = GF_HREF;
    doc.head.appendChild(l);
  }
  function fontCss(label) { const f = FONTS.find(function (x) { return x.label === label; }); return f ? f.css : FONTS[0].css; }

  // Kağıt boyutları (96dpi px). pageSpec() yön + kağıttan gerçek w/h üretir.
  const PAPER = {
    A4:     { w: 794,  h: 1123, css: 'A4' },
    A3:     { w: 1123, h: 1587, css: 'A3' },
    A5:     { w: 559,  h: 794,  css: 'A5' },
    letter: { w: 816,  h: 1056, css: 'letter' },
  };
  function pageSpec(page) {
    const p = PAPER[(page && page.paper) || 'A4'] || PAPER.A4;
    const land = !!(page && page.orientation === 'landscape');
    return { w: land ? p.h : p.w, h: land ? p.w : p.h, paperCss: p.css, land: land };
  }
  // Eski tasarımları yeni modele taşı (page.size → paper/orientation) + varsayılanlar.
  function normalizeDesign(d) {
    if (!d || !d.page) return d;
    const p = d.page;
    if (!p.orientation) p.orientation = (p.size === 'landscape' ? 'landscape' : 'portrait');
    if (!p.paper) p.paper = 'A4';
    if (p.columns == null) p.columns = 1;
    if (p.showPrices == null) p.showPrices = true;
    return d;
  }
  function uid() { return PCD.uid ? PCD.uid('b') : 'b' + Math.random().toString(36).slice(2); }
  function cur() { return (PCD.currencySymbol && PCD.currencySymbol()) || '$'; }
  function esc(s) { return PCD.escapeHtml(String(s == null ? '' : s)); }

  // EU alerjen anahtarı → kısa kod (otomatik gösterim)
  const ALLERGEN_CODE = {
    gluten: 'G', wheat: 'G', dairy: 'D', milk: 'D', egg: 'E', eggs: 'E',
    fish: 'F', shellfish: 'SF', crustaceans: 'SF', molluscs: 'M',
    nuts: 'N', treenuts: 'N', peanuts: 'P', soy: 'S', soya: 'S',
    sesame: 'SE', mustard: 'MU', celery: 'C', lupin: 'L', sulphites: 'SU', sulfites: 'SU',
  };

  // ---- Ayraç kütüphanesi (çizgi + süs + kombinasyon) ----
  const DIV_STYLES = [
    { id: 'line',       kind: 'line',  css: 'height:1px;width:100%;background:%C;' },
    { id: 'short',      kind: 'line',  css: 'height:2px;width:64px;margin:0 auto;background:%C;' },
    { id: 'dashed',     kind: 'line',  css: 'height:0;width:100%;border-top:1px dashed %C;' },
    { id: 'dotted',     kind: 'line',  css: 'height:0;width:100%;border-top:2px dotted %C;' },
    { id: 'double',     kind: 'line',  css: 'height:0;width:100%;border-top:3px double %C;' },
    { id: 'floral',     kind: 'glyph', glyph: '❦' },          // ❦
    { id: 'fleur',      kind: 'glyph', glyph: '⚜' },          // ⚜
    { id: 'star',       kind: 'glyph', glyph: '✦' },          // ✦
    { id: 'diamond',    kind: 'glyph', glyph: '❖' },          // ❖
    { id: 'leaf',       kind: 'glyph', glyph: '❧' },          // ❧
    { id: 'dots',       kind: 'glyph', glyph: '• • •' }, // • • •
    { id: 'linestar',   kind: 'combo', glyph: '✦' },          // —— ✦ ——
    { id: 'linefloral', kind: 'combo', glyph: '❦' },          // —— ❦ ——
  ];
  function dividerStyleOf(b) { return b.dividerStyle || (b.variant === 'line' ? 'line' : (b.variant === 'ornament' ? 'floral' : 'line')); }
  function dividerDef(id) { return DIV_STYLES.find(function (x) { return x.id === id; }) || DIV_STYLES[0]; }
  function dividerHtml(b, color) {
    const d = dividerDef(dividerStyleOf(b));
    if (d.kind === 'line') return '<div style="' + d.css.replace(/%C/g, color) + '"></div>';
    if (d.kind === 'glyph') return '<div style="text-align:center;color:' + color + ';font-size:' + (b.size || 20) + 'px;letter-spacing:6px;line-height:1;">' + d.glyph + '</div>';
    return '<div style="display:flex;align-items:center;gap:14px;color:' + color + ';"><span style="flex:1;height:1px;background:' + color + ';"></span><span style="font-size:' + (b.size || 18) + 'px;line-height:1;">' + d.glyph + '</span><span style="flex:1;height:1px;background:' + color + ';"></span></div>';
  }
  function miniDivPreview(d) { return d.kind === 'line' ? '—' : d.glyph; }

  // ================= ŞABLONLAR =================
  function tplBlank(name) {
    return {
      page: { size: 'portrait', bg: '#ffffff', ink: '#111111', accent: '#c5a572', baseFont: 'Cormorant', pad: 56, showAllergens: false },
      blocks: [
        { id: uid(), type: 'heading', text: name || 'Menu', font: 'Cormorant', size: 40, weight: 500, align: 'center', color: '' },
        { id: uid(), type: 'divider', variant: 'ornament', color: '' },
        { id: uid(), type: 'section', title: 'Section', titleFont: 'Cormorant', titleSize: 24, items: [] },
      ],
    };
  }
  const TEMPLATES = [
    { id: 'finedining', label: 'Fine Dining', make: function () { return {
      page: { size: 'portrait', bg: '#fffefb', ink: '#1a1a1a', accent: '#c5a572', baseFont: 'Cormorant', pad: 64, showAllergens: false },
      blocks: [
        { id: uid(), type: 'heading', text: 'RESTAURANT', font: 'Italiana', size: 44, weight: 400, align: 'center', color: '', spacing: 10 },
        { id: uid(), type: 'text', text: 'Tasting Menu', font: 'Montserrat', size: 12, align: 'center', color: '', tracking: 5, upper: true },
        { id: uid(), type: 'divider', variant: 'ornament', color: '' },
        { id: uid(), type: 'section', title: 'To Begin', titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', items: [] },
        { id: uid(), type: 'section', title: 'Mains', titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', items: [] },
        { id: uid(), type: 'section', title: 'Dessert', titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', items: [] },
      ] }; } },
    { id: 'bistro', label: 'Modern Bistro', make: function () { return {
      page: { size: 'portrait', bg: '#fffaf5', ink: '#1a1a1a', accent: '#c2410c', baseFont: 'Playfair', pad: 52, showAllergens: true },
      blocks: [
        { id: uid(), type: 'heading', text: 'Bistro', font: 'Playfair', size: 46, weight: 700, align: 'left', color: '' },
        { id: uid(), type: 'text', text: 'Seasonal · Local · Honest', font: 'Montserrat', size: 12, align: 'left', color: '', tracking: 2, upper: true },
        { id: uid(), type: 'divider', variant: 'line', color: '' },
        { id: uid(), type: 'section', title: 'Starters', titleFont: 'Playfair', titleSize: 24, rule: true, items: [] },
        { id: uid(), type: 'section', title: 'Mains', titleFont: 'Playfair', titleSize: 24, rule: true, items: [] },
      ] }; } },
    { id: 'cafe', label: 'Café', make: function () { return {
      page: { size: 'portrait', bg: '#fdf6e3', ink: '#3a2e1f', accent: '#b45309', baseFont: 'Nunito', pad: 48, showAllergens: false },
      blocks: [
        { id: uid(), type: 'heading', text: 'Café', font: 'Caveat', size: 56, weight: 700, align: 'center', color: '' },
        { id: uid(), type: 'section', title: 'Coffee', titleFont: 'Oswald', titleSize: 22, items: [] },
        { id: uid(), type: 'section', title: 'Bites', titleFont: 'Oswald', titleSize: 22, items: [] },
      ] }; } },
    { id: 'minimal', label: 'Minimalist', make: function () { return {
      page: { size: 'portrait', bg: '#ffffff', ink: '#0a0a0a', accent: '#111111', baseFont: 'Inter', pad: 64, showAllergens: false },
      blocks: [
        { id: uid(), type: 'heading', text: 'MENU', font: 'Inter', size: 38, weight: 800, align: 'left', color: '', spacing: -1 },
        { id: uid(), type: 'divider', variant: 'line', color: '' },
        { id: uid(), type: 'section', title: 'Food', titleFont: 'Inter', titleSize: 18, titleWeight: 700, items: [] },
      ] }; } },
    { id: 'wine', label: 'Wine / Drinks', make: function () { return {
      page: { size: 'portrait', bg: '#1a1a2e', ink: '#f0e9dd', accent: '#c5a572', baseFont: 'Cormorant', pad: 56, showAllergens: false },
      blocks: [
        { id: uid(), type: 'heading', text: 'Wine List', font: 'Cormorant', size: 42, weight: 500, align: 'center', color: '#f0e9dd' },
        { id: uid(), type: 'divider', variant: 'ornament', color: '' },
        { id: uid(), type: 'section', title: 'By the Glass', titleFont: 'Cormorant', titleSize: 22, titleColor: '#c5a572', items: [] },
        { id: uid(), type: 'section', title: 'By the Bottle', titleFont: 'Cormorant', titleSize: 22, titleColor: '#c5a572', items: [] },
      ] }; } },
    { id: 'event', label: 'Event / Banquet', make: function () { return {
      page: { size: 'portrait', bg: '#f5f0eb', ink: '#2d2117', accent: '#8a6d3b', baseFont: 'EB Garamond', pad: 60, showAllergens: true },
      blocks: [
        { id: uid(), type: 'text', text: 'CELEBRATION', font: 'Montserrat', size: 12, align: 'center', color: '', tracking: 6, upper: true },
        { id: uid(), type: 'heading', text: 'Set Menu', font: 'EB Garamond', size: 40, weight: 400, align: 'center', color: '' },
        { id: uid(), type: 'text', text: 'Three courses · per guest', font: 'EB Garamond', size: 14, align: 'center', color: '' },
        { id: uid(), type: 'divider', variant: 'ornament', color: '' },
        { id: uid(), type: 'section', title: 'Entrée', titleFont: 'EB Garamond', titleSize: 22, titleAlign: 'center', items: [] },
        { id: uid(), type: 'section', title: 'Main', titleFont: 'EB Garamond', titleSize: 22, titleAlign: 'center', items: [] },
        { id: uid(), type: 'section', title: 'Dessert', titleFont: 'EB Garamond', titleSize: 22, titleAlign: 'center', items: [] },
      ] }; } },
  ];

  // ================= DURUM =================
  let _view = null, currentId = null, currentMenu = null, design = null, selectedId = null;
  let viewportEl = null, pageScaleEl = null, inspectorEl = null;
  let _saveTimer = null;

  function saveSoon() {
    if (!currentMenu) return;
    currentMenu.studio = design;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      try { PCD.store.upsertInTable('menus', currentMenu, 'm'); } catch (e) { PCD.warn && PCD.warn('menu studio save', e); }
    }, 600);
  }

  function findBlock(id) { return (design.blocks || []).find(function (b) { return b.id === id; }); }

  // ================= REÇETE ZEKÂSI =================
  function ingMapNow() { const m = {}; (PCD.store.listIngredients() || []).forEach(function (i) { m[i.id] = i; }); return m; }
  function itemCost(it) {
    if (!it.recipeId || !PCD.recipes || !PCD.recipes.computeFoodCost) return null;
    const r = PCD.store.getRecipe(it.recipeId); if (!r) return null;
    const c = PCD.recipes.computeFoodCost(r, ingMapNow()) / (r.servings || 1);
    return isFinite(c) ? c : null;
  }
  function itemMargin(it) {
    const price = parseFloat(it.price); if (!price || price <= 0) return null;
    const c = itemCost(it); if (c == null) return null;
    return ((price - c) / price) * 100;
  }
  function itemAllergenCodes(it) {
    if (!it.recipeId || !PCD.allergensDB || !PCD.allergensDB.recipeAllergens) return [];
    const r = PCD.store.getRecipe(it.recipeId); if (!r) return [];
    const keys = PCD.allergensDB.recipeAllergens(r, PCD.store.listIngredients()) || [];
    const codes = [];
    keys.forEach(function (k) {
      const code = ALLERGEN_CODE[String(k).toLowerCase()] || String(k).slice(0, 2).toUpperCase();
      if (codes.indexOf(code) < 0) codes.push(code);
    });
    return codes;
  }
  function computeStats() {
    let rev = 0, mSum = 0, mCount = 0;
    (design.blocks || []).forEach(function (b) {
      if (b.type !== 'section') return;
      (b.items || []).forEach(function (it) {
        const price = parseFloat(it.price); if (price > 0) rev += price;
        const m = itemMargin(it); if (m != null) { mSum += m; mCount++; }
      });
    });
    return { revenue: rev, avgMargin: mCount ? mSum / mCount : null };
  }

  // ================= RENDER PAGE (kanvas + print TEK motor) =================
  function blockInnerHTML(b, page) {
    const ink = page.ink || '#111';
    const accent = page.accent || '#c5a572';
    if (b.type === 'heading')
      return '<div style="font-family:' + fontCss(b.font || page.baseFont) + ';font-size:' + (b.size || 40) + 'px;font-weight:' + (b.weight || 400) + ';text-align:' + (b.align || 'center') + ';color:' + (b.color || ink) + ';letter-spacing:' + (b.spacing || 0) + 'px;line-height:1.1;margin:0;">' + esc(b.text) + '</div>';
    if (b.type === 'text')
      return '<div style="font-family:' + fontCss(b.font || page.baseFont) + ';font-size:' + (b.size || 13) + 'px;text-align:' + (b.align || 'center') + ';color:' + (b.color || ink) + ';letter-spacing:' + (b.tracking || 0) + 'px;' + (b.upper ? 'text-transform:uppercase;' : '') + 'line-height:1.5;white-space:pre-wrap;margin:0;">' + esc(b.text) + '</div>';
    if (b.type === 'divider') return dividerHtml(b, b.color || accent);
    if (b.type === 'image') {
      if (!b.src) return '<div style="text-align:center;color:#bbb;font-size:12px;border:1px dashed #ccc;padding:24px;">Görsel ekle</div>';
      return '<div style="text-align:' + (b.align || 'center') + ';"><img src="' + b.src + '" style="max-width:100%;height:' + (b.height || 200) + 'px;object-fit:cover;border-radius:' + (b.radius || 0) + 'px;"></div>';
    }
    if (b.type === 'section') {
      let h = '<div style="font-family:' + fontCss(b.titleFont || page.baseFont) + ';font-size:' + (b.titleSize || 24) + 'px;font-weight:' + (b.titleWeight || 600) + ';color:' + (b.titleColor || accent) + ';text-align:' + (b.titleAlign || 'left') + ';letter-spacing:' + (b.titleSpacing || 0) + 'px;margin:0 0 10px;border-bottom:1px solid ' + (b.rule ? accent : 'transparent') + ';padding-bottom:6px;">' + esc(b.title) + '</div>';
      (b.items || []).forEach(function (it) {
        h += '<div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start;">';
        if (it.photo) h += '<img src="' + it.photo + '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;">';
        h += '<div style="flex:1;min-width:0;"><div style="display:flex;align-items:baseline;gap:8px;">';
        let nm = esc(it.name);
        if (page.showAllergens) { const codes = itemAllergenCodes(it); if (codes.length) nm += ' <span style="font-size:9px;font-weight:700;color:' + (page.ink || ink) + '99;letter-spacing:0.5px;">(' + codes.join(' ') + ')</span>'; }
        h += '<span style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + (b.itemSize || 15) + 'px;font-weight:600;color:' + (page.ink || ink) + ';">' + nm + '</span>';
        h += '<span style="flex:1;border-bottom:1px dotted ' + (page.ink || ink) + '40;margin:0 4px;transform:translateY(-3px);"></span>';
        if (page.showPrices !== false && it.price !== '' && it.price != null) h += '<span style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + (b.itemSize || 15) + 'px;font-weight:600;color:' + (page.ink || ink) + ';">' + esc(cur() + it.price) + '</span>';
        h += '</div>';
        if (it.desc) h += '<div style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + ((b.itemSize || 15) - 3) + 'px;color:' + (page.ink || ink) + '99;font-style:italic;margin-top:2px;line-height:1.4;">' + esc(it.desc) + '</div>';
        h += '</div></div>';
      });
      return h;
    }
    if (b.type === 'spacer') return '<div style="height:' + (b.height || 24) + 'px;"></div>';
    return '';
  }
  function legendHtml(page) {
    if (!page.showAllergens) return '';
    const used = {};
    (design.blocks || []).forEach(function (b) { if (b.type === 'section') (b.items || []).forEach(function (it) { itemAllergenCodes(it).forEach(function (c) { used[c] = true; }); }); });
    const codes = Object.keys(used); if (!codes.length) return '';
    return '<div style="margin-top:20px;font-family:' + fontCss(page.baseFont) + ';font-size:10px;color:' + (page.ink || '#111') + '99;text-align:center;">' + codes.map(function (c) { return '<b>' + c + '</b>'; }).join(' · ') + '</div>';
  }
  function blockIsFullWidth(b, cols) {
    if (cols <= 1) return false;
    if (typeof b.span === 'boolean') return b.span;
    return b.type === 'heading' || b.type === 'divider' || b.type === 'image' || b.type === 'text';
  }
  function renderPageInner(d) {
    const page = d.page;
    const cols = Math.max(1, Math.min(4, page.columns || 1));
    const blocksHtml = (d.blocks || []).map(function (b) {
      const flow = cols > 1 ? (blockIsFullWidth(b, cols) ? 'column-span:all;-webkit-column-span:all;' : 'break-inside:avoid;-webkit-column-break-inside:avoid;') : '';
      return '<div class="ms-block" data-bid="' + b.id + '" style="margin-bottom:' + (b.type === 'spacer' ? 0 : 18) + 'px;' + flow + '">' + blockInnerHTML(b, page) + '</div>';
    }).join('');
    let body = cols > 1 ? '<div style="column-count:' + cols + ';column-gap:' + (page.columnGap == null ? 28 : page.columnGap) + 'px;">' + blocksHtml + '</div>' : blocksHtml;
    body += legendHtml(page);
    if (page.frame) {
      const spec = pageSpec(page);
      const pad = (page.pad == null ? 56 : page.pad);
      const innerH = Math.max(0, spec.h - 2 * pad);
      const fc = page.frameColor || page.accent || '#c5a572';
      const fb = page.frameStyle === 'double' ? '3px double' : '1px solid';
      body = '<div style="border:' + fb + ' ' + fc + ';padding:' + (page.framePad == null ? 22 : page.framePad) + 'px;box-sizing:border-box;min-height:' + innerH + 'px;">' + body + '</div>';
    }
    return body;
  }

  // ================= KANVAS =================
  function applyScale() {
    if (!viewportEl || !pageScaleEl) return;
    const spec = pageSpec(design.page);
    const avail = viewportEl.clientWidth - 40;
    if (avail <= 0) { requestAnimationFrame(applyScale); return; }
    const scale = Math.min(1, avail / spec.w);
    // transform-origin TOP LEFT zorunlu: 'center' kullanılırsa, eleman
    // viewport'tan genişse (yatay/A3) ölçek merkezden büzülürken sağ yarı
    // kırpılır. Sol-üstten ölçekleyip kalan boşluğu margin ile ortalıyoruz.
    pageScaleEl.style.transform = 'scale(' + scale + ')';
    pageScaleEl.style.transformOrigin = 'top left';
    pageScaleEl.style.marginLeft = Math.max(0, (avail - spec.w * scale) / 2) + 'px';
    viewportEl.style.height = (spec.h * scale + 40) + 'px';
  }
  function refreshPage() {
    if (!pageScaleEl) return;
    normalizeDesign(design);
    const spec = pageSpec(design.page);
    pageScaleEl.style.width = spec.w + 'px';
    pageScaleEl.style.minHeight = spec.h + 'px';
    pageScaleEl.style.background = design.page.bg || '#fff';
    pageScaleEl.style.padding = (design.page.pad || 56) + 'px';
    pageScaleEl.innerHTML = renderPageInner(design);
    if (selectedId) { const sel = pageScaleEl.querySelector('[data-bid="' + selectedId + '"]'); if (sel) sel.style.outline = '2px solid var(--brand-500,#22c55e)'; }
    applyScale();
    updateStatsBar();
    saveSoon();
  }
  function updateStatsBar() {
    const el = _view && PCD.$('#msStats', _view); if (!el) return;
    const s = computeStats();
    el.innerHTML = '<span>Ciro: <b>' + cur() + s.revenue.toFixed(2) + '</b></span>' +
      (s.avgMargin != null ? ' · <span>Ort. marj: <b style="color:' + (s.avgMargin >= 65 ? '#16a34a' : s.avgMargin >= 55 ? '#d97706' : '#dc2626') + ';">%' + s.avgMargin.toFixed(0) + '</b></span>' : '');
  }

  // ================= INSPECTOR (prototipten + marj/alerjen) =================
  function sRow(label, html) { return '<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">' + esc(label) + '</div>' + html + '</div>'; }
  function fontSel(attr, val) { return '<select class="select" data-f="' + attr + '" style="width:100%;">' + FONTS.map(function (f) { return '<option value="' + f.label + '"' + (val === f.label ? ' selected' : '') + '>' + f.label + '</option>'; }).join('') + '</select>'; }
  function numIn(attr, val, mn, mx) { return '<input type="number" class="input" data-f="' + attr + '" value="' + (val == null ? '' : val) + '" min="' + (mn || 0) + '" max="' + (mx || 999) + '" style="width:100%;">'; }
  function colIn(attr, val, fb) { return '<input type="color" data-f="' + attr + '" value="' + (val || fb || '#111111') + '" style="width:46px;height:32px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;"> <button type="button" class="btn btn-ghost btn-sm" data-clear="' + attr + '">Tema</button>'; }
  function alignB(attr, val) { return ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="btn btn-sm ' + (val === a ? 'btn-primary' : 'btn-outline') + '" data-align="' + attr + '|' + a + '">' + (a === 'left' ? '⟸' : a === 'center' ? '≡' : '⟹') + '</button>'; }).join(' '); }
  function pill(dataAttr, cur, opts) { return opts.map(function (o) { return '<button type="button" class="btn btn-sm ' + (String(cur) === String(o.v) ? 'btn-primary' : 'btn-outline') + '" ' + dataAttr + '="' + o.v + '">' + o.l + '</button>'; }).join(' '); }

  function renderInspector() {
    if (!inspectorEl) return;
    normalizeDesign(design);
    const b = selectedId ? findBlock(selectedId) : null;
    const cols = design.page.columns || 1;
    let h = '<div style="font-weight:700;font-size:13px;margin:0 0 8px;">🎨 Sayfa</div>';
    h += sRow('Temel font', fontSel('page.baseFont', design.page.baseFont));
    h += sRow('Kağıt', pill('data-paper', design.page.paper || 'A4', [{ v: 'A4', l: 'A4' }, { v: 'A3', l: 'A3' }, { v: 'A5', l: 'A5' }, { v: 'letter', l: 'Letter' }]));
    h += sRow('Yön', pill('data-orient', design.page.orientation || 'portrait', [{ v: 'portrait', l: 'Dikey' }, { v: 'landscape', l: 'Yatay' }]));
    h += sRow('Sütun', pill('data-cols', cols, [{ v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 4, l: '4' }]));
    if (cols > 1) h += sRow('Sütun aralığı', numIn('page.columnGap', design.page.columnGap == null ? 28 : design.page.columnGap, 8, 80));
    h += sRow('Vurgu rengi', colIn('page.accent', design.page.accent, '#c5a572'));
    h += sRow('Metin rengi', colIn('page.ink', design.page.ink, '#111111'));
    h += sRow('Arka plan', colIn('page.bg', design.page.bg, '#ffffff'));
    h += sRow('Kenar boşluğu', numIn('page.pad', design.page.pad, 16, 120));
    h += sRow('Çerçeve', pill('data-frame', design.page.frame ? (design.page.frameStyle || 'thin') : 'off', [{ v: 'off', l: 'Yok' }, { v: 'thin', l: 'İnce' }, { v: 'double', l: 'Çift' }]) + (design.page.frame ? ' ' + colIn('page.frameColor', design.page.frameColor, design.page.accent) : ''));
    h += sRow('Fiyatları göster', '<button type="button" class="btn btn-sm ' + (design.page.showPrices !== false ? 'btn-primary' : 'btn-outline') + '" data-toggle-page="showPrices">' + (design.page.showPrices !== false ? 'Açık' : 'Kapalı') + '</button>');
    h += sRow('Alerjen kodları', '<button type="button" class="btn btn-sm ' + (design.page.showAllergens ? 'btn-primary' : 'btn-outline') + '" data-toggle-page="showAllergens">' + (design.page.showAllergens ? 'Açık' : 'Kapalı') + '</button> <span style="font-size:11px;color:var(--text-3);">reçeteden otomatik</span>');
    h += '<div style="display:flex;gap:6px;margin-top:6px;"><button type="button" class="btn btn-outline btn-sm" id="msTemplates" style="flex:1;">Şablonlar</button><button type="button" class="btn btn-outline btn-sm" id="msBrandSave" style="flex:1;">Markamı kaydet</button><button type="button" class="btn btn-outline btn-sm" id="msBrandApply" style="flex:1;">Uygula</button></div>';
    h += '<hr style="border:0;border-top:1px solid var(--border);margin:14px 0;">';

    if (!b) { h += '<div class="text-muted text-sm">Düzenlemek için kanvasta bir bloğa dokun.</div>'; inspectorEl.innerHTML = h; wireInspector(); return; }

    const tl = { heading: 'Başlık', text: 'Metin', section: 'Bölüm', image: 'Görsel', divider: 'Ayraç', spacer: 'Boşluk' };
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><div style="font-weight:700;font-size:13px;">✏️ ' + (tl[b.type] || b.type) + '</div><div style="display:flex;gap:4px;"><button type="button" class="btn btn-ghost btn-sm" data-move="up">↑</button><button type="button" class="btn btn-ghost btn-sm" data-move="down">↓</button><button type="button" class="btn btn-ghost btn-sm" data-del-block style="color:var(--danger);">' + (PCD.icon ? PCD.icon('trash', 14) : '✕') + '</button></div></div>';
    if (cols > 1 && b.type !== 'spacer') h += sRow('Sütun genişliği', '<button type="button" class="btn btn-sm ' + (blockIsFullWidth(b, cols) ? 'btn-primary' : 'btn-outline') + '" data-spantoggle>' + (blockIsFullWidth(b, cols) ? 'Tam genişlik' : 'Tek sütun') + '</button>');

    if (b.type === 'heading' || b.type === 'text') {
      h += sRow('Metin', '<textarea class="textarea" data-f="text" rows="2" style="width:100%;">' + esc(b.text) + '</textarea>');
      h += sRow('Font', fontSel('font', b.font || design.page.baseFont));
      h += sRow('Boyut', numIn('size', b.size, 8, 120));
      h += sRow('Hizalama', alignB('align', b.align || 'center'));
      h += sRow('Renk', colIn('color', b.color, design.page.ink));
      if (b.type === 'text') h += sRow('BÜYÜK harf', '<button type="button" class="btn btn-sm ' + (b.upper ? 'btn-primary' : 'btn-outline') + '" data-toggle="upper">' + (b.upper ? 'Açık' : 'Kapalı') + '</button>');
    } else if (b.type === 'section') {
      h += sRow('Bölüm adı', '<input type="text" class="input" data-f="title" value="' + esc(b.title) + '" style="width:100%;">');
      h += sRow('Başlık font', fontSel('titleFont', b.titleFont || design.page.baseFont));
      h += sRow('Başlık boyut', numIn('titleSize', b.titleSize, 12, 60));
      h += sRow('Başlık renk', colIn('titleColor', b.titleColor, design.page.accent));
      h += sRow('Başlık hizası', alignB('titleAlign', b.titleAlign || 'left'));
      h += sRow('Altı çizgi', '<button type="button" class="btn btn-sm ' + (b.rule ? 'btn-primary' : 'btn-outline') + '" data-toggle="rule">' + (b.rule ? 'Açık' : 'Kapalı') + '</button>');
      h += '<hr style="border:0;border-top:1px dashed var(--border);margin:12px 0;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;">Yemekler</div>';
      (b.items || []).forEach(function (it) {
        const m = itemMargin(it);
        h += '<div class="card" style="padding:8px;margin-bottom:8px;" data-iid="' + it.id + '">';
        h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;"><input type="text" class="input" data-itf="name" value="' + esc(it.name) + '" placeholder="Yemek" style="flex:1;"><input type="text" class="input" data-itf="price" value="' + esc(it.price) + '" placeholder="' + cur() + '" style="width:60px;"><button type="button" class="btn btn-ghost btn-sm" data-itmove="up">↑</button><button type="button" class="btn btn-ghost btn-sm" data-itmove="down">↓</button><button type="button" class="btn btn-ghost btn-sm" data-itdel style="color:var(--danger);">✕</button></div>';
        h += '<input type="text" class="input" data-itf="desc" value="' + esc(it.desc) + '" placeholder="Açıklama" style="width:100%;margin-bottom:4px;">';
        h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + (it.photo ? '<img src="' + it.photo + '" style="width:30px;height:30px;object-fit:cover;border-radius:5px;">' : '') + '<button type="button" class="btn btn-outline btn-sm" data-itphoto>' + (it.photo ? 'Foto' : '+ Foto') + '</button>' + (it.photo ? '<button type="button" class="btn btn-ghost btn-sm" data-itphotodel>Kaldır</button>' : '') +
          (m != null ? '<span style="margin-inline-start:auto;font-size:11px;font-weight:700;color:' + (m >= 65 ? '#16a34a' : m >= 55 ? '#d97706' : '#dc2626') + ';">marj %' + m.toFixed(0) + '</span>' : (it.recipeId ? '' : '<span style="margin-inline-start:auto;font-size:10px;color:var(--text-3);">manuel</span>')) + '</div>';
        h += '</div>';
      });
      h += '<div style="display:flex;gap:6px;"><button type="button" class="btn btn-ghost btn-sm" data-additem-recipe style="flex:1;">+ Reçeteden</button><button type="button" class="btn btn-ghost btn-sm" data-additem-manual style="flex:1;">+ Manuel</button></div>';
    } else if (b.type === 'image') {
      h += sRow('Görsel', '<button type="button" class="btn btn-outline btn-sm" data-imgupload>' + (b.src ? 'Değiştir' : '+ Yükle') + '</button>' + (b.src ? ' <button type="button" class="btn btn-ghost btn-sm" data-imgdel>Kaldır</button>' : ''));
      h += sRow('Yükseklik', numIn('height', b.height, 60, 600));
      h += sRow('Hizalama', alignB('align', b.align || 'center'));
      h += sRow('Köşe', numIn('radius', b.radius, 0, 40));
    } else if (b.type === 'divider') {
      const curDiv = dividerStyleOf(b);
      h += sRow('Stil', '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + DIV_STYLES.map(function (d) { return '<button type="button" class="btn btn-sm ' + (curDiv === d.id ? 'btn-primary' : 'btn-outline') + '" data-divstyle="' + d.id + '" title="' + d.id + '" style="min-width:42px;font-size:14px;line-height:1.1;">' + miniDivPreview(d) + '</button>'; }).join('') + '</div>');
      h += sRow('Renk', colIn('color', b.color, design.page.accent));
      if (dividerDef(curDiv).kind !== 'line') h += sRow('Süs boyutu', numIn('size', b.size, 10, 60));
    } else if (b.type === 'spacer') { h += sRow('Yükseklik', numIn('height', b.height, 4, 200)); }

    inspectorEl.innerHTML = h; wireInspector();
  }

  function setField(target, path, value) { if (path.indexOf('.') >= 0) { const p = path.split('.'); design[p[0]][p[1]] = value; } else target[path] = value; }
  function pickImage(cb) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = function () { const f = inp.files && inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = function () { cb(rd.result); }; rd.readAsDataURL(f); }; inp.click(); }

  function wireInspector() {
    const b = selectedId ? findBlock(selectedId) : null;
    inspectorEl.querySelectorAll('[data-f]').forEach(function (el) {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () { let v = el.value; if (el.type === 'number') v = v === '' ? null : Number(v); setField(b || {}, el.getAttribute('data-f'), v); refreshPage(); });
    });
    inspectorEl.querySelectorAll('[data-clear]').forEach(function (el) { el.addEventListener('click', function () { setField(b || {}, el.getAttribute('data-clear'), ''); refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-align]').forEach(function (el) { el.addEventListener('click', function () { const p = el.getAttribute('data-align').split('|'); setField(b || {}, p[0], p[1]); refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-toggle]').forEach(function (el) { el.addEventListener('click', function () { const k = el.getAttribute('data-toggle'); b[k] = !b[k]; refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-toggle-page]').forEach(function (el) { el.addEventListener('click', function () { const k = el.getAttribute('data-toggle-page'); design.page[k] = !design.page[k]; refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-paper]').forEach(function (el) { el.addEventListener('click', function () { design.page.paper = el.getAttribute('data-paper'); refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-orient]').forEach(function (el) { el.addEventListener('click', function () { design.page.orientation = el.getAttribute('data-orient'); refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-cols]').forEach(function (el) { el.addEventListener('click', function () { design.page.columns = Number(el.getAttribute('data-cols')); refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-frame]').forEach(function (el) { el.addEventListener('click', function () { const v = el.getAttribute('data-frame'); design.page.frame = (v !== 'off'); if (v !== 'off') design.page.frameStyle = v; refreshPage(); renderInspector(); }); });
    inspectorEl.querySelectorAll('[data-divstyle]').forEach(function (el) { el.addEventListener('click', function () { if (!b) return; b.dividerStyle = el.getAttribute('data-divstyle'); delete b.variant; refreshPage(); renderInspector(); }); });
    const spanT = inspectorEl.querySelector('[data-spantoggle]'); if (spanT) spanT.addEventListener('click', function () { if (!b) return; b.span = !blockIsFullWidth(b, design.page.columns || 1); refreshPage(); renderInspector(); });
    inspectorEl.querySelectorAll('[data-move]').forEach(function (el) { el.addEventListener('click', function () { moveBlock(selectedId, el.getAttribute('data-move')); }); });
    const delB = inspectorEl.querySelector('[data-del-block]'); if (delB) delB.addEventListener('click', function () { design.blocks = design.blocks.filter(function (x) { return x.id !== selectedId; }); selectedId = null; refreshPage(); renderInspector(); });
    const iu = inspectorEl.querySelector('[data-imgupload]'); if (iu) iu.addEventListener('click', function () { pickImage(function (src) { b.src = src; refreshPage(); renderInspector(); }); });
    const idl = inspectorEl.querySelector('[data-imgdel]'); if (idl) idl.addEventListener('click', function () { b.src = null; refreshPage(); renderInspector(); });
    // global buttons
    const tpl = inspectorEl.querySelector('#msTemplates'); if (tpl) tpl.addEventListener('click', openTemplates);
    const bs = inspectorEl.querySelector('#msBrandSave'); if (bs) bs.addEventListener('click', saveBrand);
    const ba = inspectorEl.querySelector('#msBrandApply'); if (ba) ba.addEventListener('click', applyBrand);

    if (b && b.type === 'section') {
      inspectorEl.querySelectorAll('[data-iid]').forEach(function (row) {
        const iid = row.getAttribute('data-iid'); const it = (b.items || []).find(function (x) { return x.id === iid; }); if (!it) return;
        row.querySelectorAll('[data-itf]').forEach(function (el) { el.addEventListener('input', function () { it[el.getAttribute('data-itf')] = el.value; refreshPage(); if (el.getAttribute('data-itf') === 'price') { /* marj güncellensin */ clearTimeout(it._mt); it._mt = setTimeout(renderInspector, 600); } }); });
        const up = row.querySelector('[data-itmove="up"]'); if (up) up.addEventListener('click', function () { moveItem(b, iid, 'up'); });
        const dn = row.querySelector('[data-itmove="down"]'); if (dn) dn.addEventListener('click', function () { moveItem(b, iid, 'down'); });
        const dl = row.querySelector('[data-itdel]'); if (dl) dl.addEventListener('click', function () { b.items = b.items.filter(function (x) { return x.id !== iid; }); refreshPage(); renderInspector(); });
        const ph = row.querySelector('[data-itphoto]'); if (ph) ph.addEventListener('click', function () { pickImage(function (src) { it.photo = src; refreshPage(); renderInspector(); }); });
        const phd = row.querySelector('[data-itphotodel]'); if (phd) phd.addEventListener('click', function () { it.photo = null; refreshPage(); renderInspector(); });
      });
      const aR = inspectorEl.querySelector('[data-additem-recipe]'); if (aR) aR.addEventListener('click', function () { openRecipePicker(b); });
      const aM = inspectorEl.querySelector('[data-additem-manual]'); if (aM) aM.addEventListener('click', function () { b.items = b.items || []; b.items.push({ id: uid(), name: 'Yeni yemek', price: '', desc: '', photo: null }); refreshPage(); renderInspector(); });
    }
  }

  function moveBlock(id, dir) { const i = design.blocks.findIndex(function (x) { return x.id === id; }); const j = dir === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= design.blocks.length) return; const t = design.blocks[i]; design.blocks[i] = design.blocks[j]; design.blocks[j] = t; refreshPage(); renderInspector(); }
  function moveItem(sec, iid, dir) { const i = sec.items.findIndex(function (x) { return x.id === iid; }); const j = dir === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= sec.items.length) return; const t = sec.items[i]; sec.items[i] = sec.items[j]; sec.items[j] = t; refreshPage(); renderInspector(); }

  function openRecipePicker(sec) {
    const recipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    if (!recipes.length) { if (PCD.toast) PCD.toast.info('Henüz tarif yok'); return; }
    const body = PCD.el('div');
    body.innerHTML = '<input type="search" class="input" id="msrq" placeholder="Tarif ara…" style="width:100%;margin-bottom:8px;"><div id="msrl" style="max-height:50vh;overflow:auto;"></div>';
    function paint(q) {
      const list = body.querySelector('#msrl'); const ql = (q || '').toLowerCase();
      list.innerHTML = recipes.filter(function (r) { return !ql || (r.name || '').toLowerCase().indexOf(ql) >= 0; }).map(function (r) { return '<button type="button" class="btn btn-ghost btn-sm" data-rid="' + r.id + '" style="display:block;width:100%;text-align:left;">' + esc(r.name) + (r.salePrice ? ' · ' + cur() + r.salePrice : '') + '</button>'; }).join('');
      list.querySelectorAll('[data-rid]').forEach(function (el) { el.addEventListener('click', function () { const r = recipes.find(function (x) { return x.id === el.getAttribute('data-rid'); }); sec.items = sec.items || []; sec.items.push({ id: uid(), name: r.name, price: r.salePrice != null ? String(r.salePrice) : '', desc: r.plating || '', photo: r.photo || null, recipeId: r.id }); refreshPage(); renderInspector(); m.close(); }); });
    }
    paint('');
    const m = PCD.modal.open({ title: 'Reçeteden ekle', body: body, size: 'sm', closable: true });
    setTimeout(function () { const s = body.querySelector('#msrq'); if (s) { s.focus(); s.addEventListener('input', function () { paint(s.value); }); } }, 100);
  }

  function addBlock(type) {
    const nb = { id: uid(), type: type };
    if (type === 'heading') Object.assign(nb, { text: 'Başlık', font: design.page.baseFont, size: 32, weight: 500, align: 'center', color: '' });
    else if (type === 'text') Object.assign(nb, { text: 'Metin…', font: 'Montserrat', size: 12, align: 'center', color: '' });
    else if (type === 'section') Object.assign(nb, { title: 'Yeni Bölüm', titleFont: design.page.baseFont, titleSize: 24, items: [] });
    else if (type === 'image') Object.assign(nb, { src: null, height: 200, align: 'center', radius: 0 });
    else if (type === 'divider') Object.assign(nb, { dividerStyle: 'floral', color: '', size: 20 });
    else if (type === 'spacer') Object.assign(nb, { height: 24 });
    design.blocks.push(nb); selectedId = nb.id; refreshPage(); renderInspector();
  }

  // ---- Şablon galerisi ----
  function openTemplates() {
    const body = PCD.el('div');
    body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + TEMPLATES.map(function (t) { return '<button type="button" class="btn btn-outline" data-tpl="' + t.id + '" style="padding:14px;">' + esc(t.label) + '</button>'; }).join('') + '</div><div class="text-muted text-sm" style="margin-top:10px;">Şablon mevcut tasarımın yerine geçer (içerik/renk/font). Yemekleri sonra eklersin.</div>';
    const m = PCD.modal.open({ title: 'Şablon seç', body: body, size: 'sm', closable: true });
    body.querySelectorAll('[data-tpl]').forEach(function (el) { el.addEventListener('click', function () { const t = TEMPLATES.find(function (x) { return x.id === el.getAttribute('data-tpl'); }); if (t) { design = t.make(); selectedId = null; refreshPage(); renderInspector(); } m.close(); }); });
  }

  // ---- Marka kiti ----
  function saveBrand() {
    const kit = { baseFont: design.page.baseFont, accent: design.page.accent, ink: design.page.ink, bg: design.page.bg };
    try { localStorage.setItem(BRAND_KEY, JSON.stringify(kit)); if (PCD.toast) PCD.toast.success('Marka kiti kaydedildi'); } catch (e) {}
  }
  function applyBrand() {
    let kit = null; try { kit = JSON.parse(localStorage.getItem(BRAND_KEY)); } catch (e) {}
    if (!kit) { if (PCD.toast) PCD.toast.info('Önce "Markamı kaydet" ile bir kit oluştur'); return; }
    design.page.baseFont = kit.baseFont; design.page.accent = kit.accent; design.page.ink = kit.ink; design.page.bg = kit.bg;
    refreshPage(); renderInspector();
  }

  // ---- Klasik menüden içe aktar ----
  function importFromClassic(menu) {
    const blocks = [];
    blocks.push({ id: uid(), type: 'heading', text: menu.name || 'Menu', font: 'Cormorant', size: 40, weight: 500, align: 'center', color: '' });
    if (menu.subtitle) blocks.push({ id: uid(), type: 'text', text: menu.subtitle, font: 'Montserrat', size: 12, align: 'center', color: '', tracking: 3, upper: true });
    blocks.push({ id: uid(), type: 'divider', variant: 'ornament', color: '' });
    (menu.sections || []).forEach(function (sec) {
      const items = (sec.items || []).map(function (it) {
        const r = it.recipeId ? PCD.store.getRecipe(it.recipeId) : null;
        return { id: uid(), name: it.recipeId ? (r ? r.name : (it.customName || '')) : (it.customName || ''), price: (it.price != null && it.price !== '') ? String(it.price) : (r && r.salePrice != null ? String(r.salePrice) : ''), desc: it.description || (r && r.plating) || '', photo: (r && r.photo) || null, recipeId: it.recipeId || undefined };
      });
      blocks.push({ id: uid(), type: 'section', title: sec.name || '', titleFont: 'Cormorant', titleSize: 24, items: items });
    });
    if (menu.footer) blocks.push({ id: uid(), type: 'text', text: menu.footer, font: 'Montserrat', size: 9, align: 'center', color: '#888' });
    return { page: { size: 'portrait', bg: '#fffefb', ink: '#1a1a1a', accent: '#c5a572', baseFont: 'Cormorant', pad: 56, showAllergens: false }, blocks: blocks };
  }

  function buildPrintHtml() {
    normalizeDesign(design);
    const page = design.page; const spec = pageSpec(page);
    return '<style>@page{size:' + spec.paperCss + (spec.land ? ' landscape' : ' portrait') + ';margin:0;}@import url("' + GF_HREF + '");body{margin:0;}.ms-print{box-sizing:border-box;width:' + spec.w + 'px;min-height:' + spec.h + 'px;background:' + (page.bg || '#fff') + ';padding:' + (page.pad || 56) + 'px;margin:0 auto;}.ms-block{margin-bottom:18px;}</style><div class="ms-print">' + renderPageInner(design) + '</div>';
  }

  // ================= LİSTE GÖRÜNÜMÜ =================
  function renderList() {
    const menus = (PCD.store.listTable('menus') || []).slice().sort(function (a, b) { return (b.updatedAt || 0) > (a.updatedAt || 0) ? 1 : -1; });
    let h = '<div class="page-header"><div class="page-header-text"><div class="page-title">Menu Studio</div><div class="page-subtitle">Tam özelleştirilebilir menü tasarımcısı</div></div><div class="page-header-actions"><button class="btn btn-outline btn-sm" id="msToMenus">← Menüler</button><button class="btn btn-primary" id="msNew">+ Yeni tasarım</button></div></div>';
    if (!menus.length) {
      h += '<div class="empty"><div class="empty-icon">🎨</div><div class="empty-title">Henüz menü yok</div><div class="empty-desc">Yeni bir tasarım oluştur.</div><div class="empty-action"><button class="btn btn-primary" id="msNew2">+ Yeni tasarım</button></div></div>';
    } else {
      h += '<div class="flex flex-col gap-2">' + menus.map(function (m) {
        const hasStudio = !!m.studio;
        const items = (m.studio ? (m.studio.blocks || []).reduce(function (a, b) { return a + (b.type === 'section' ? (b.items || []).length : 0); }, 0) : (m.sections || []).reduce(function (a, s) { return a + ((s.items || []).length); }, 0));
        return '<div class="list-item" data-open="' + m.id + '"><div class="list-item-thumb">🎨</div><div class="list-item-body"><div class="list-item-title">' + esc(m.name || 'İsimsiz') + (hasStudio ? '' : ' <span style="font-size:10px;color:var(--text-3);">(klasik)</span>') + '</div><div class="list-item-meta"><span>' + items + ' kalem</span><span>·</span><span>' + (PCD.fmtRelTime ? PCD.fmtRelTime(m.updatedAt) : '') + '</span></div></div><button class="icon-btn" data-del="' + m.id + '" title="Sil">' + (PCD.icon ? PCD.icon('trash', 18) : '✕') + '</button></div>';
      }).join('') + '</div>';
    }
    _view.innerHTML = h;
    const nw = function () { createNew(); };
    const n1 = PCD.$('#msNew', _view); if (n1) n1.addEventListener('click', nw);
    const n2 = PCD.$('#msNew2', _view); if (n2) n2.addEventListener('click', nw);
    const tm = PCD.$('#msToMenus', _view); if (tm) tm.addEventListener('click', function () { PCD.router.go('menus'); });
    PCD.on(_view, 'click', '[data-open]', function (e) { if (e.target.closest('[data-del]')) return; openDesign(this.getAttribute('data-open')); });
    PCD.on(_view, 'click', '[data-del]', function (e) {
      e.stopPropagation(); const id = this.getAttribute('data-del');
      PCD.modal.confirm({ title: 'Menüyü sil', text: 'Bu menü kalıcı silinecek. Emin misin?', okText: 'Sil' }).then(function (ok) { if (!ok) return; PCD.store.deleteFromTable('menus', id); renderList(); });
    });
  }

  function createNew() {
    PCD.modal.prompt ? PCD.modal.prompt({ title: 'Yeni tasarım', label: 'Menü adı', okText: 'Oluştur' }).then(go) : go(prompt('Menü adı'));
    function go(name) {
      if (name === false || name == null) return;
      name = (name || 'Yeni Menü').trim() || 'Yeni Menü';
      const rec = PCD.store.upsertInTable('menus', { name: name, sections: [], studio: tplBlank(name) }, 'm');
      if (rec && rec.id) openDesign(rec.id);
    }
  }

  function openDesign(id) {
    const menu = PCD.store.getFromTable('menus', id);
    if (!menu) { if (PCD.toast) PCD.toast.error('Menü bulunamadı'); return; }
    currentId = id; currentMenu = PCD.clone(menu); selectedId = null;
    if (currentMenu.studio) { design = currentMenu.studio; renderEditor(); return; }
    // studio yok → klasik içerik varsa içe aktarmayı öner
    const hasClassic = (currentMenu.sections || []).some(function (s) { return (s.items || []).length; });
    if (hasClassic && PCD.modal.confirm) {
      PCD.modal.confirm({ title: 'Klasik menüden içe aktar', text: 'Bu menünün klasik bölüm/yemekleri Studio bloklarına aktarılsın mı?', okText: 'İçe aktar', cancelText: 'Boş başla' }).then(function (ok) {
        design = ok ? importFromClassic(currentMenu) : tplBlank(currentMenu.name); renderEditor();
      });
    } else { design = tplBlank(currentMenu.name); renderEditor(); }
  }

  // ================= EDİTÖR GÖRÜNÜMÜ =================
  function renderEditor() {
    _view.innerHTML =
      '<style>.ms-wrap{display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;}@media(max-width:860px){.ms-wrap{grid-template-columns:1fr;}}.ms-viewport{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;overflow:hidden;min-height:200px;}.ms-page{box-shadow:0 8px 30px rgba(0,0,0,.15);box-sizing:border-box;}.ms-block{cursor:pointer;border-radius:4px;}.ms-inspector{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;position:sticky;top:12px;max-height:calc(100vh - 100px);overflow:auto;}.ms-addbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;}</style>' +
      '<div class="page-header"><div class="page-header-text"><div class="page-title" style="display:flex;align-items:center;gap:8px;"><input id="msName" class="input" value="' + esc(currentMenu.name || '') + '" style="font-size:18px;font-weight:800;max-width:280px;"></div>' +
        '<div class="page-subtitle" id="msStats" style="font-size:12px;"></div></div>' +
        '<div class="page-header-actions"><button class="btn btn-outline btn-sm" id="msBack">← Liste</button><button class="btn btn-primary btn-sm" id="msPrint">' + (PCD.icon ? PCD.icon('print', 14) : '') + ' Yazdır</button></div></div>' +
      '<div class="ms-addbar"><span style="font-size:12px;color:var(--text-3);">+ Blok:</span>' +
        '<button class="btn btn-outline btn-sm" data-add="heading">Başlık</button><button class="btn btn-outline btn-sm" data-add="text">Metin</button><button class="btn btn-outline btn-sm" data-add="section">Bölüm</button><button class="btn btn-outline btn-sm" data-add="image">Görsel</button><button class="btn btn-outline btn-sm" data-add="divider">Ayraç</button><button class="btn btn-outline btn-sm" data-add="spacer">Boşluk</button></div>' +
      '<div class="ms-wrap"><div class="ms-viewport" id="msViewport"><div class="ms-page" id="msPage"></div></div><div class="ms-inspector" id="msInspector"></div></div>';

    viewportEl = PCD.$('#msViewport', _view); pageScaleEl = PCD.$('#msPage', _view); inspectorEl = PCD.$('#msInspector', _view);
    refreshPage(); renderInspector();

    PCD.on(pageScaleEl, 'click', '.ms-block', function (e) { e.stopPropagation(); selectedId = this.getAttribute('data-bid'); refreshPage(); renderInspector(); });
    _view.querySelectorAll('[data-add]').forEach(function (el) { el.addEventListener('click', function () { addBlock(el.getAttribute('data-add')); }); });
    PCD.$('#msBack', _view).addEventListener('click', function () { clearTimeout(_saveTimer); if (currentMenu) { currentMenu.studio = design; try { PCD.store.upsertInTable('menus', currentMenu, 'm'); } catch (e) {} } currentId = null; currentMenu = null; renderList(); });
    PCD.$('#msPrint', _view).addEventListener('click', function () { PCD.print(buildPrintHtml(), currentMenu.name || 'Menu'); });
    const nm = PCD.$('#msName', _view); if (nm) nm.addEventListener('input', function () { currentMenu.name = nm.value; saveSoon(); });
    let _rsz = null; window.addEventListener('resize', function () { clearTimeout(_rsz); _rsz = setTimeout(applyScale, 120); });
  }

  // ================= ANA RENDER =================
  function render(view) {
    ensureFonts(document);
    _view = view;
    if (currentId && currentMenu) { design = currentMenu.studio; renderEditor(); }
    else renderList();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menuStudio = { render: render };
})();
