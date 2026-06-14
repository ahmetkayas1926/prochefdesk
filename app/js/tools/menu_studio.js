/* ================================================================
   ProChefDesk — menu_studio.js  (Menu Studio — ana menü aracı)
   ----------------------------------------------------------------
   Blok-kanvas menü tasarımcısı. Tasarımlar `menus` tablosunda
   `menu.studio` alanında saklanır → bulut senkron + yedek + çoklu
   menü bedava. Eski klasik menüler (sections) açılırken otomatik
   Studio bloklarına aktarılır (importFromClassic).

   Özellikler:
     - Library görünümü (canlı önizleme kartları) + çoklu menü
     - Blok katman paneli (yeşil kartlar) + sürükle-bırak sıralama
     - Reçete zekâsı: canlı food cost / kâr marjı + otomatik alerjen
     - 10 dolu profesyonel şablon + marka kiti
     - Sayfa boyutu (A4/A3/A5/Letter) + yön + çok sütun + çerçeve
     - Ayraç kütüphanesi (çizgi/süs/kombinasyon)
     - Tek render motoru (kanvas = çıktı, WYSIWYG)
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
  function t(k, v) { return (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t(k, v) : k; }
  function blockTypeLabel(type) { return t('ms_block_' + type); }

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
    { id: 'floral',     kind: 'glyph', glyph: '❦' },
    { id: 'fleur',      kind: 'glyph', glyph: '⚜' },
    { id: 'star',       kind: 'glyph', glyph: '✦' },
    { id: 'diamond',    kind: 'glyph', glyph: '❖' },
    { id: 'leaf',       kind: 'glyph', glyph: '❧' },
    { id: 'dots',       kind: 'glyph', glyph: '• • •' },
    { id: 'linestar',   kind: 'combo', glyph: '✦' },
    { id: 'linefloral', kind: 'combo', glyph: '❦' },
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

  // Blok meta (ikon glyph + etiket)
  const BLOCK_META = {
    heading: { label: 'Başlık', glyph: 'H' },
    text:    { label: 'Metin',  glyph: '¶' },
    section: { label: 'Bölüm',  glyph: '≣' },
    image:   { label: 'Görsel', glyph: '▦' },
    divider: { label: 'Ayraç',  glyph: '—' },
    spacer:  { label: 'Boşluk', glyph: '↕' },
  };
  function blockLabel(b) {
    if (b.type === 'heading' || b.type === 'text') return (String(b.text || '').trim().slice(0, 30)) || blockTypeLabel(b.type);
    if (b.type === 'section') return (String(b.title || '').trim().slice(0, 30)) || blockTypeLabel('section');
    return blockTypeLabel(b.type);
  }

  // ================= ŞABLONLAR (10 dolu profesyonel) =================
  function _it(name, price, desc) { return { id: uid(), name: name, price: price == null ? '' : String(price), desc: desc || '' }; }
  function _sec(title, items, opts) { const s = { id: uid(), type: 'section', title: title, items: items || [] }; if (opts) Object.assign(s, opts); return s; }
  function _hd(text, opts) { const b = { id: uid(), type: 'heading', text: text, align: 'center', color: '' }; if (opts) Object.assign(b, opts); return b; }
  function _tx(text, opts) { const b = { id: uid(), type: 'text', text: text, align: 'center', color: '' }; if (opts) Object.assign(b, opts); return b; }
  function _dv(style, opts) { const b = { id: uid(), type: 'divider', dividerStyle: style || 'floral', color: '', size: 20 }; if (opts) Object.assign(b, opts); return b; }

  function tplBlank(name) {
    return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#ffffff', ink: '#111111', accent: '#c5a572', baseFont: 'Cormorant', pad: 56, showAllergens: false, showPrices: true },
      blocks: [
        _hd(name || 'Menu', { font: 'Cormorant', size: 42, weight: 500 }),
        _dv('linefloral'),
        _sec(t('ms_ph_section'), [], { titleSize: 24, titleAlign: 'center' }),
      ],
    };
  }

  const TEMPLATES = [
    { id: 'finedining', label: 'Fine Dining', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#fffdf7', ink: '#23201a', accent: '#b8902f', baseFont: 'Cormorant', pad: 64, showAllergens: false, showPrices: true, frame: true, frameStyle: 'double', framePad: 30 },
      blocks: [
        _tx('ESTABLISHED 1998', { font: 'Montserrat', size: 11, tracking: 6, upper: true }),
        _hd('Maison Laurent', { font: 'Italiana', size: 46, weight: 400, spacing: 2 }),
        _tx('Five-Course Tasting Menu', { font: 'Cormorant', size: 16 }),
        _dv('linefloral'),
        _sec('To Begin', [
          _it('Oyster & Champagne Mignonette', '24', 'Fine de Claire, shallot, aged vinegar'),
          _it('Hand-Dived Scallop', '28', 'Cauliflower, brown butter, hazelnut'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center' }),
        _sec('From the Sea', [
          _it('Turbot, Beurre Blanc', '42', 'Roasted leek, sea herbs, caviar'),
          _it('Native Lobster', '52', 'Bisque, fennel, tarragon'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center' }),
        _sec('From the Land', [
          _it('Aged Beef Fillet', '58', 'Bone marrow, girolles, red wine jus'),
          _it('Herdwick Lamb', '46', 'Aubergine, garlic, rosemary'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center' }),
        _sec('To Finish', [
          _it('Dark Chocolate, Praline', '18', 'Salted caramel, cocoa nib'),
          _it('Selection of Cheeses', '22', 'Quince, walnut, sourdough crackers'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center' }),
      ] }; } },

    { id: 'bistro', label: 'Modern Bistro', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#fffaf4', ink: '#231a12', accent: '#c2410c', baseFont: 'Lora', pad: 54, showAllergens: true, showPrices: true },
      blocks: [
        _hd('Bistro Twenty-Two', { font: 'Playfair', size: 44, weight: 700, align: 'left' }),
        _tx('Seasonal · Local · Honest', { font: 'Montserrat', size: 12, tracking: 2, upper: true, align: 'left' }),
        _dv('line'),
        _sec('Small Plates', [
          _it('Burrata & Heirloom Tomato', '14', 'Basil oil, aged balsamic, sourdough'),
          _it('Crispy Calamari', '13', 'Lemon aioli, smoked paprika'),
          _it('Wild Mushroom Toast', '12', 'Garlic, thyme, parmesan'),
        ], { titleFont: 'Playfair', titleSize: 26, rule: true, titleAlign: 'left' }),
        _sec('Mains', [
          _it('Pan-Roasted Chicken', '24', 'Confit potato, tenderstem, jus'),
          _it('Seared Sea Bass', '27', 'Saffron risotto, samphire'),
          _it('Dry-Aged Burger', '19', 'Cheddar, bacon jam, triple-cooked chips'),
          _it('Wild Mushroom Risotto', '18', 'Truffle, parmesan, chive'),
        ], { titleFont: 'Playfair', titleSize: 26, rule: true, titleAlign: 'left' }),
        _sec('Sweet', [
          _it('Sticky Toffee Pudding', '9', 'Butterscotch, clotted cream'),
          _it('Lemon Tart', '9', 'Italian meringue, raspberry'),
        ], { titleFont: 'Playfair', titleSize: 26, rule: true, titleAlign: 'left' }),
      ] }; } },

    { id: 'cafe', label: 'Café & Brunch', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 34, bg: '#fdf6e3', ink: '#3a2e1f', accent: '#b45309', baseFont: 'Nunito', pad: 50, showAllergens: false, showPrices: true },
      blocks: [
        _hd('Sunny Side', { font: 'Caveat', size: 60, weight: 700 }),
        _tx('All-Day Brunch', { font: 'Oswald', size: 14, tracking: 3, upper: true }),
        _dv('dots'),
        _sec('Coffee', [
          _it('Flat White', '4.5'),
          _it('Cappuccino', '4.2'),
          _it('Cold Brew', '4.8'),
          _it('Matcha Latte', '5.2'),
        ], { titleFont: 'Oswald', titleSize: 22 }),
        _sec('Brunch', [
          _it('Smashed Avocado', '12', 'Poached egg, chilli, feta, sourdough'),
          _it('Buttermilk Pancakes', '11', 'Maple, berries, mascarpone'),
          _it('Full Breakfast', '14', 'Egg, bacon, sausage, beans, toast'),
          _it('Shakshuka', '12', 'Baked eggs, pepper, harissa'),
        ], { titleFont: 'Oswald', titleSize: 22 }),
        _sec('Pastries', [
          _it('Butter Croissant', '3.5'),
          _it('Cinnamon Roll', '4.5'),
          _it('Banana Bread', '4.0'),
        ], { titleFont: 'Oswald', titleSize: 22 }),
      ] }; } },

    { id: 'minimal', label: 'Minimalist', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 40, bg: '#ffffff', ink: '#0a0a0a', accent: '#111111', baseFont: 'Inter', pad: 64, showAllergens: false, showPrices: true },
      blocks: [
        _hd('MENU', { font: 'Inter', size: 40, weight: 800, align: 'left', spacing: -1 }),
        _dv('line'),
        _sec('Food', [
          _it('Steak Tartare', '16'),
          _it('Roast Cod', '24'),
          _it('Ribeye 300g', '32'),
          _it('Garden Salad', '11'),
        ], { titleFont: 'Inter', titleSize: 16, titleWeight: 700 }),
        _sec('Dessert', [
          _it('Basque Cheesecake', '10'),
          _it('Chocolate Mousse', '9'),
        ], { titleFont: 'Inter', titleSize: 16, titleWeight: 700 }),
        _sec('Drinks', [
          _it('House Red / White', '8'),
          _it('Craft Lager', '6'),
          _it('Espresso Martini', '12'),
        ], { titleFont: 'Inter', titleSize: 16, titleWeight: 700 }),
      ] }; } },

    { id: 'wine', label: 'Wine & Cocktails', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#15192e', ink: '#ece4d6', accent: '#c5a572', baseFont: 'Cormorant', pad: 58, showAllergens: false, showPrices: true },
      blocks: [
        _hd('The Cellar', { font: 'Cormorant', size: 46, weight: 500, color: '#ece4d6' }),
        _tx('Wine & Cocktails', { font: 'Montserrat', size: 11, tracking: 5, upper: true, color: '#c5a572' }),
        _dv('linestar', { color: '#c5a572' }),
        _sec('By the Glass', [
          _it('Champagne Brut NV', '14'),
          _it('Sancerre, Loire', '12'),
          _it('Barolo, Piedmont', '16'),
          _it('Malbec, Mendoza', '11'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleColor: '#c5a572', titleAlign: 'center' }),
        _sec('Signature Cocktails', [
          _it('Old Fashioned', '13', 'Bourbon, bitters, orange'),
          _it('Negroni', '12', 'Gin, Campari, vermouth'),
          _it('Espresso Martini', '13', 'Vodka, coffee, vanilla'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleColor: '#c5a572', titleAlign: 'center' }),
      ] }; } },

    { id: 'event', label: 'Event / Banquet', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#f6f1ea', ink: '#2d2117', accent: '#8a6d3b', baseFont: 'EB Garamond', pad: 64, showAllergens: true, showPrices: false, frame: true, frameStyle: 'thin', framePad: 26 },
      blocks: [
        _tx('IN CELEBRATION', { font: 'Montserrat', size: 11, tracking: 6, upper: true }),
        _hd('Wedding Set Menu', { font: 'EB Garamond', size: 42, weight: 400 }),
        _tx('Three courses, served per guest', { font: 'EB Garamond', size: 15 }),
        _dv('linefloral'),
        _sec('Entrée', [
          _it('Heritage Beetroot & Goat Cheese', '', 'Candied walnut, watercress'),
          _it('Cured Salmon', '', 'Dill, cucumber, lemon crème fraîche'),
        ], { titleFont: 'EB Garamond', titleSize: 24, titleAlign: 'center' }),
        _sec('Main', [
          _it('Roast Sirloin of Beef', '', 'Fondant potato, root vegetables, jus'),
          _it('Pan-Roast Chicken Supreme', '', 'Wild mushroom, truffle pomme purée'),
        ], { titleFont: 'EB Garamond', titleSize: 24, titleAlign: 'center' }),
        _sec('Dessert', [
          _it('Vanilla Crème Brûlée', '', 'Shortbread, seasonal berries'),
          _it('Chocolate Delice', '', 'Honeycomb, salted caramel'),
        ], { titleFont: 'EB Garamond', titleSize: 24, titleAlign: 'center' }),
      ] }; } },

    { id: 'steakhouse', label: 'Steakhouse', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#1c1a17', ink: '#ece6db', accent: '#c0392b', baseFont: 'Lora', pad: 56, showAllergens: false, showPrices: true },
      blocks: [
        _hd('PRIME & FLAME', { font: 'Oswald', size: 42, weight: 600, color: '#ece6db', spacing: 2 }),
        _tx('Charcoal Grill · Dry-Aged', { font: 'Oswald', size: 12, tracking: 3, upper: true, color: '#c0392b' }),
        _dv('short', { color: '#c0392b' }),
        _sec('The Cuts', [
          _it('Ribeye 350g', '38', 'Dry-aged 35 days, bone marrow butter'),
          _it('Fillet Mignon 250g', '42', 'Centre cut, peppercorn sauce'),
          _it('Tomahawk 1kg', '85', 'For two, chimichurri'),
          _it('Picanha 300g', '32', 'Brazilian cut, sea salt'),
        ], { titleFont: 'Oswald', titleSize: 24, titleColor: '#c0392b' }),
        _sec('Sides', [
          _it('Triple-Cooked Chips', '6'),
          _it('Creamed Spinach', '6'),
          _it('Mac & Cheese', '7'),
          _it('Grilled Asparagus', '7'),
        ], { titleFont: 'Oswald', titleSize: 24, titleColor: '#c0392b' }),
      ] }; } },

    { id: 'seafood', label: 'Seafood / Raw Bar', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#f2f8fb', ink: '#102a33', accent: '#0e7490', baseFont: 'Cormorant', pad: 56, showAllergens: true, showPrices: true },
      blocks: [
        _hd('The Oyster House', { font: 'Cormorant', size: 46, weight: 500 }),
        _tx('Raw Bar · Catch of the Day', { font: 'Montserrat', size: 11, tracking: 4, upper: true, color: '#0e7490' }),
        _dv('leaf', { color: '#0e7490' }),
        _sec('Raw Bar', [
          _it('Oysters (half dozen)', '18', 'Mignonette, lemon'),
          _it('Tuna Crudo', '16', 'Yuzu, avocado, sesame'),
          _it('Prawn Cocktail', '14', 'Marie Rose, baby gem'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleColor: '#0e7490', titleAlign: 'center' }),
        _sec('From the Sea', [
          _it('Grilled Sea Bream', '26', 'Salsa verde, charred lemon'),
          _it('Fish & Chips', '18', 'Mushy peas, tartare'),
          _it('Seafood Linguine', '22', 'Clam, prawn, chilli, garlic'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleColor: '#0e7490', titleAlign: 'center' }),
      ] }; } },

    { id: 'trattoria', label: 'Trattoria / Pizza', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 34, bg: '#fffdf6', ink: '#2a2118', accent: '#15803d', baseFont: 'Lora', pad: 50, showAllergens: false, showPrices: true },
      blocks: [
        _hd('Trattoria Bella', { font: 'Playfair', size: 44, weight: 700 }),
        _tx('Cucina Italiana', { font: 'Montserrat', size: 12, tracking: 4, upper: true, color: '#b91c1c' }),
        _dv('linefloral', { color: '#15803d' }),
        _sec('Antipasti', [
          _it('Bruschetta Pomodoro', '8'),
          _it('Tagliere di Salumi', '14'),
          _it('Caprese', '10'),
        ], { titleFont: 'Playfair', titleSize: 24, titleColor: '#15803d' }),
        _sec('Pizza', [
          _it('Margherita', '11', 'San Marzano, fior di latte, basil'),
          _it('Diavola', '14', 'Spicy salami, chilli'),
          _it('Quattro Formaggi', '14', 'Mozzarella, gorgonzola, fontina, parmesan'),
        ], { titleFont: 'Playfair', titleSize: 24, titleColor: '#15803d' }),
        _sec('Pasta', [
          _it('Spaghetti Carbonara', '13', 'Guanciale, pecorino, egg'),
          _it('Tagliatelle Ragù', '15', 'Slow-cooked beef, red wine'),
          _it('Gnocchi Sorrentina', '13', 'Tomato, mozzarella, basil'),
        ], { titleFont: 'Playfair', titleSize: 24, titleColor: '#15803d' }),
      ] }; } },

    { id: 'vegan', label: 'Vegan / Plant', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#f5faf2', ink: '#1f2e1a', accent: '#16a34a', baseFont: 'Poppins', pad: 56, showAllergens: true, showPrices: true },
      blocks: [
        _hd('Roots & Shoots', { font: 'Poppins', size: 40, weight: 700 }),
        _tx('100% Plant-Based · Organic', { font: 'Poppins', size: 11, tracking: 3, upper: true, color: '#16a34a' }),
        _dv('leaf', { color: '#16a34a' }),
        _sec('To Start', [
          _it('Roasted Beet Hummus', '9', 'Dukkah, flatbread'),
          _it('Tempura Cauliflower', '10', 'Sriracha, lime, coriander'),
        ], { titleFont: 'Poppins', titleSize: 22, titleColor: '#16a34a' }),
        _sec('Bowls', [
          _it('Buddha Bowl', '14', 'Quinoa, avocado, edamame, tahini'),
          _it('Smoky Jackfruit Tacos', '13', 'Slaw, lime crema, salsa'),
          _it('Wild Mushroom Risotto', '15', 'Arborio, truffle, rocket'),
        ], { titleFont: 'Poppins', titleSize: 22, titleColor: '#16a34a' }),
        _sec('Sweet', [
          _it('Vegan Chocolate Torte', '8', 'Coconut cream, berries'),
          _it('Baked Apple Crumble', '8', 'Oat, cinnamon, vanilla'),
        ], { titleFont: 'Poppins', titleSize: 22, titleColor: '#16a34a' }),
      ] }; } },

    // ---- v2.35 — 10 yeni profesyonel şablon (toplam 20) ----
    { id: 'tasting', label: "Chef's Tasting", make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#16130f', ink: '#ece3d2', accent: '#c9a86a', baseFont: 'Cormorant', pad: 60, showAllergens: false, showPrices: false, frame: true, frameStyle: 'thin', framePad: 26 },
      blocks: [
        _tx("THE CHEF'S TABLE", { font: 'Montserrat', size: 10, tracking: 6, upper: true, color: '#c9a86a' }),
        _hd('Degustation', { font: 'Italiana', size: 44, weight: 400, spacing: 2 }),
        _tx('Seven courses · 165 per guest · Wine pairing 95', { font: 'Cormorant', size: 15 }),
        _dv('linestar', { color: '#c9a86a' }),
        _sec('I · Snack', [ _it('Gougère', '', 'Aged comté, black truffle') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('II · Sea', [ _it('Cured Hamachi', '', 'Yuzu, kohlrabi, finger lime') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('III · Garden', [ _it('Heritage Beetroot', '', 'Goat curd, smoked honey, walnut') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('IV · Pasta', [ _it('Hand-Rolled Agnolotti', '', 'Braised oxtail, parmesan, sage') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('V · Land', [ _it('Aged Duck Breast', '', 'Cherry, salsify, juniper jus') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('VI · Cheese', [ _it('Affineur Selection', '', 'Quince, lavash, toasted grain') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
        _sec('VII · Sweet', [ _it('Valrhona Soufflé', '', 'Crème anglaise, cocoa nib') ], { titleFont: 'Cormorant', titleSize: 22, titleAlign: 'center', titleColor: '#c9a86a' }),
      ] }; } },

    { id: 'cocktail', label: 'Cocktail Bar', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#121417', ink: '#e8e6e1', accent: '#b08d57', baseFont: 'Lora', pad: 54, showAllergens: false, showPrices: true },
      blocks: [
        _hd('The Gilded Owl', { font: 'Bebas Neue', size: 54, weight: 400, spacing: 2 }),
        _tx('COCKTAILS & SPIRITS', { font: 'Oswald', size: 13, tracking: 5, upper: true, color: '#b08d57' }),
        _dv('short', { color: '#b08d57' }),
        _sec('Signatures', [
          _it('Smoked Old Fashioned', '18', 'Bourbon, demerara, applewood smoke, bitters'),
          _it('Garden Gimlet', '16', 'Gin, cucumber, basil, lime cordial'),
          _it('Velvet Negroni', '17', 'Barrel-aged gin, Campari, sweet vermouth'),
          _it('Paloma Brava', '15', 'Tequila, grapefruit, lime, sea salt, soda'),
        ], { titleFont: 'Oswald', titleSize: 22, titleColor: '#b08d57', titleAlign: 'left' }),
        _sec('Low & No', [
          _it('Seedlip Spritz', '11', 'Non-alcoholic, citrus, tonic, rosemary'),
          _it('Spiced Ginger Fizz', '9', 'Ginger, honey, lime, soda'),
        ], { titleFont: 'Oswald', titleSize: 22, titleColor: '#b08d57', titleAlign: 'left' }),
        _sec('Spirits · 25ml', [
          _it('Single Malt Selection', 'from 9'),
          _it('Small-Batch Gin', 'from 7'),
          _it('Aged Rum', 'from 8'),
        ], { titleFont: 'Oswald', titleSize: 22, titleColor: '#b08d57', titleAlign: 'left' }),
      ] }; } },

    { id: 'winelist', label: 'Wine List', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 38, bg: '#fbf7f0', ink: '#2a211c', accent: '#7c2233', baseFont: 'EB Garamond', pad: 52, showAllergens: false, showPrices: true },
      blocks: [
        _hd('Cellar List', { font: 'Cormorant', size: 42, weight: 500 }),
        _tx('BY THE GLASS · BY THE BOTTLE', { font: 'Montserrat', size: 10, tracking: 4, upper: true, color: '#7c2233' }),
        _dv('line', { color: '#7c2233' }),
        _sec('Sparkling', [
          _it('Prosecco DOC, Veneto', '11 / 48', 'Italy · NV'),
          _it('Champagne Brut, Reims', '16 / 82', 'France · NV'),
        ], { titleFont: 'Cormorant', titleSize: 22, titleColor: '#7c2233' }),
        _sec('White', [
          _it('Picpoul de Pinet', '9 / 36', 'Languedoc · 2022'),
          _it('Chablis, Domaine', '14 / 62', 'Burgundy · 2021'),
          _it('Sauvignon Blanc', '10 / 42', 'Marlborough · 2023'),
        ], { titleFont: 'Cormorant', titleSize: 22, titleColor: '#7c2233' }),
        _sec('Red', [
          _it('Côtes du Rhône', '9 / 38', 'Rhône · 2021'),
          _it('Rioja Reserva', '12 / 54', 'Spain · 2018'),
          _it('Barolo DOCG', '18 / 96', 'Piedmont · 2019'),
        ], { titleFont: 'Cormorant', titleSize: 22, titleColor: '#7c2233' }),
        _sec('Dessert · 75ml', [
          _it('Sauternes', '12', 'Bordeaux · 2019'),
          _it('Tawny Port 10yr', '10', 'Douro'),
        ], { titleFont: 'Cormorant', titleSize: 22, titleColor: '#7c2233' }),
      ] }; } },

    { id: 'patisserie', label: 'Pâtisserie', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#fdf2f4', ink: '#3a2230', accent: '#c2557a', baseFont: 'Playfair', pad: 56, showAllergens: true, showPrices: true, frame: true, frameStyle: 'thin', framePad: 24 },
      blocks: [
        _hd('Maison Sucrée', { font: 'Playfair', size: 42, weight: 500 }),
        _tx('PÂTISSERIE FINE', { font: 'Montserrat', size: 11, tracking: 5, upper: true, color: '#c2557a' }),
        _dv('linefloral', { color: '#c2557a' }),
        _sec('Plated Desserts', [
          _it('Tarte au Citron', '11', 'Torched meringue, raspberry, basil'),
          _it('Chocolate Fondant', '12', 'Molten Valrhona, salted caramel ice cream'),
          _it('Vanilla Mille-Feuille', '11', 'Crème pâtissière, caramelised puff'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#c2557a' }),
        _sec('From the Counter', [
          _it('Pistachio Éclair', '6'),
          _it('Raspberry Macaron', '3.5'),
          _it('Opéra Slice', '7'),
          _it('Seasonal Fruit Tart', '6.5'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#c2557a' }),
        _sec('Viennoiserie', [
          _it('Butter Croissant', '3.5'),
          _it('Pain au Chocolat', '4'),
          _it('Almond Croissant', '4.5'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#c2557a' }),
      ] }; } },

    { id: 'coffee', label: 'Coffee Roasters', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 34, bg: '#f4ece2', ink: '#2c211a', accent: '#7b4b27', baseFont: 'Inter', pad: 48, showAllergens: false, showPrices: true },
      blocks: [
        _hd('Daybreak Coffee', { font: 'Oswald', size: 40, weight: 600 }),
        _tx('SPECIALTY · ROASTED IN-HOUSE', { font: 'Inter', size: 10, tracking: 3, upper: true, color: '#7b4b27' }),
        _dv('dotted', { color: '#7b4b27' }),
        _sec('Espresso', [
          _it('Espresso', '3.0'),
          _it('Macchiato', '3.4'),
          _it('Flat White', '4.2'),
          _it('Cappuccino', '4.2'),
          _it('Latte', '4.5'),
          _it('Mocha', '4.8'),
        ], { titleFont: 'Oswald', titleSize: 20, titleColor: '#7b4b27' }),
        _sec('Filter & Cold', [
          _it('Batch Brew', '3.8'),
          _it('V60 Pour-Over', '5.0', 'Single origin, rotating'),
          _it('Cold Brew', '4.8'),
          _it('Iced Latte', '4.8'),
        ], { titleFont: 'Oswald', titleSize: 20, titleColor: '#7b4b27' }),
        _sec('Beans · 250g', [
          _it('House Blend', '12', 'Chocolate, hazelnut, caramel'),
          _it('Ethiopia Yirgacheffe', '15', 'Floral, citrus, tea-like'),
        ], { titleFont: 'Oswald', titleSize: 20, titleColor: '#7b4b27' }),
        _tx('Oat · Almond · Soy +0.6', { font: 'Inter', size: 11, color: '#7b4b27' }),
      ] }; } },

    { id: 'bbq', label: 'Smokehouse BBQ', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#1a1614', ink: '#efe6da', accent: '#d4762a', baseFont: 'Oswald', pad: 52, showAllergens: false, showPrices: true },
      blocks: [
        _hd('Ember & Oak', { font: 'Bebas Neue', size: 58, weight: 400, spacing: 1 }),
        _tx('LOW · SLOW · WOOD-SMOKED', { font: 'Oswald', size: 13, tracking: 4, upper: true, color: '#d4762a' }),
        _dv('double', { color: '#d4762a' }),
        _sec('From the Pit', [
          _it('Beef Brisket', '24', '14-hour oak smoke, per 250g'),
          _it('Baby Back Ribs', '22', 'Full rack, house dry rub'),
          _it('Pulled Pork', '18', 'Brioche bun, slaw, pickles'),
          _it('Smoked Half Chicken', '19', 'Honey-chipotle glaze'),
        ], { titleFont: 'Bebas Neue', titleSize: 30, titleColor: '#d4762a', titleAlign: 'left' }),
        _sec('Platters', [
          _it('The Pitmaster', '58', 'Brisket, ribs, sausage, 3 sides — serves 2'),
          _it('Burnt Ends Bowl', '20', 'Cheesy grits, pickled onion'),
        ], { titleFont: 'Bebas Neue', titleSize: 30, titleColor: '#d4762a', titleAlign: 'left' }),
        _sec('Sides', [
          _it('Mac & Cheese', '7'),
          _it('Smoked Beans', '6'),
          _it('Buttermilk Slaw', '5'),
          _it('Skillet Cornbread', '5'),
        ], { titleFont: 'Bebas Neue', titleSize: 30, titleColor: '#d4762a', titleAlign: 'left' }),
      ] }; } },

    { id: 'sushi', label: 'Sushi / Omakase', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 40, bg: '#fbfbf9', ink: '#1b1b1b', accent: '#b3252b', baseFont: 'Montserrat', pad: 52, showAllergens: true, showPrices: true },
      blocks: [
        _hd('Kaze', { font: 'Montserrat', size: 46, weight: 700, spacing: 4 }),
        _tx('SUSHI · OMAKASE', { font: 'Montserrat', size: 11, tracking: 6, upper: true, color: '#b3252b' }),
        _dv('short', { color: '#b3252b' }),
        _sec('Nigiri · per piece', [
          _it('Salmon · Sake', '4'),
          _it('Tuna · Maguro', '5'),
          _it('Yellowtail · Hamachi', '5'),
          _it('Eel · Unagi', '5.5'),
          _it('Prawn · Ebi', '4'),
        ], { titleFont: 'Montserrat', titleSize: 18, titleColor: '#b3252b', titleWeight: 700 }),
        _sec('Maki', [
          _it('Spicy Tuna Roll', '9'),
          _it('Dragon Roll', '14', 'Eel, avocado, tobiko'),
          _it('Salmon Avocado', '8'),
          _it('Vegetable Futomaki', '7'),
        ], { titleFont: 'Montserrat', titleSize: 18, titleColor: '#b3252b', titleWeight: 700 }),
        _sec('Sashimi', [
          _it('Chef Selection', '24', '12 slices, daily catch'),
        ], { titleFont: 'Montserrat', titleSize: 18, titleColor: '#b3252b', titleWeight: 700 }),
        _sec('Omakase', [
          _it("Chef's Tasting", '85', '12 courses, seasonal'),
        ], { titleFont: 'Montserrat', titleSize: 18, titleColor: '#b3252b', titleWeight: 700 }),
      ] }; } },

    { id: 'tapas', label: 'Tapas & Mezze', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 2, columnGap: 36, bg: '#fbf3e8', ink: '#33241a', accent: '#c0532b', baseFont: 'Lora', pad: 50, showAllergens: true, showPrices: true },
      blocks: [
        _hd('Plaza', { font: 'Playfair', size: 46, weight: 700 }),
        _tx('SMALL PLATES TO SHARE', { font: 'Montserrat', size: 11, tracking: 4, upper: true, color: '#c0532b' }),
        _dv('diamond', { color: '#c0532b' }),
        _sec('Cold', [
          _it('Marinated Olives', '5'),
          _it('Jamón Ibérico', '12', '24-month cured'),
          _it('Pan con Tomate', '6', 'Grilled sourdough, garlic'),
          _it('Whipped Feta', '7', 'Honey, thyme, pistachio'),
        ], { titleFont: 'Playfair', titleSize: 22, titleColor: '#c0532b', rule: true }),
        _sec('Hot', [
          _it('Gambas al Ajillo', '11', 'Garlic prawns, chilli, lemon'),
          _it('Patatas Bravas', '7', 'Smoked aioli, spicy tomato'),
          _it('Croquetas de Jamón', '8'),
          _it('Chorizo al Vino', '9', 'Red wine, rosemary'),
          _it('Grilled Halloumi', '8', "Za'atar, pomegranate"),
        ], { titleFont: 'Playfair', titleSize: 22, titleColor: '#c0532b', rule: true }),
        _sec('Sweet', [
          _it('Churros', '7', 'Dark chocolate'),
          _it('Basque Cheesecake', '8'),
        ], { titleFont: 'Playfair', titleSize: 22, titleColor: '#c0532b', rule: true }),
      ] }; } },

    { id: 'gastropub', label: 'Gastropub', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#faf4e6', ink: '#2b2316', accent: '#9a6a1f', baseFont: 'Lora', pad: 54, showAllergens: true, showPrices: true },
      blocks: [
        _hd('The Crown & Anchor', { font: 'Playfair', size: 40, weight: 700, align: 'left' }),
        _tx('EST. 1911 · KITCHEN & TAP', { font: 'Oswald', size: 12, tracking: 3, upper: true, align: 'left', color: '#9a6a1f' }),
        _dv('line', { color: '#9a6a1f' }),
        _sec('Starters', [
          _it('Scotch Egg', '8', 'Black pudding, piccalilli'),
          _it('Soup of the Day', '7', 'Warm sourdough'),
          _it('Crispy Whitebait', '8', 'Tartare, lemon'),
        ], { titleFont: 'Playfair', titleSize: 24, rule: true, titleAlign: 'left' }),
        _sec('Pub Classics', [
          _it('Fish & Chips', '17', 'Beer batter, mushy peas, tartare'),
          _it('Steak & Ale Pie', '16', 'Buttery mash, gravy'),
          _it('The Anchor Burger', '16', 'Aged beef, cheddar, bacon, chips'),
          _it('Bangers & Mash', '15', 'Cumberland sausage, onion gravy'),
        ], { titleFont: 'Playfair', titleSize: 24, rule: true, titleAlign: 'left' }),
        _sec('Sunday Roast', [
          _it('Roast Sirloin', '19', 'Yorkshire pud, duck-fat potatoes, greens'),
          _it('Roast Chicken', '17'),
          _it('Nut Roast', '15'),
        ], { titleFont: 'Playfair', titleSize: 24, rule: true, titleAlign: 'left' }),
        _sec('On Tap', [
          _it('House Pale Ale', '6'),
          _it('Guest Cask', '6.5'),
          _it('Cider', '5.5'),
        ], { titleFont: 'Playfair', titleSize: 24, rule: true, titleAlign: 'left' }),
      ] }; } },

    { id: 'afternoontea', label: 'Afternoon Tea', make: function () { return {
      page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#f7f4ef', ink: '#33302a', accent: '#9c7b4a', baseFont: 'EB Garamond', pad: 58, showAllergens: true, showPrices: false, frame: true, frameStyle: 'double', framePad: 28 },
      blocks: [
        _tx('THE DRAWING ROOM', { font: 'Montserrat', size: 10, tracking: 6, upper: true, color: '#9c7b4a' }),
        _hd('Afternoon Tea', { font: 'Cormorant', size: 44, weight: 500, spacing: 1 }),
        _tx('Served daily 2 – 5 pm · 38 per guest · with Champagne 52', { font: 'EB Garamond', size: 15 }),
        _dv('linefloral', { color: '#9c7b4a' }),
        _sec('Savouries', [
          _it('Coronation Chicken', '', 'Toasted brioche'),
          _it('Cucumber & Cream Cheese', '', 'Dill, white bloomer'),
          _it('Smoked Salmon', '', 'Lemon crème fraîche'),
          _it('Honey-Glazed Ham', '', 'English mustard'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#9c7b4a' }),
        _sec('Scones', [
          _it('Plain & Fruit Scones', '', 'Clotted cream, strawberry preserve, lemon curd'),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#9c7b4a' }),
        _sec('Pastries', [
          _it('Victoria Sponge', ''),
          _it('Lemon & Elderflower Tart', ''),
          _it('Chocolate Délice', ''),
          _it('Seasonal Macaron', ''),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#9c7b4a' }),
        _sec('Loose-Leaf Teas', [
          _it('English Breakfast · Earl Grey · Darjeeling', ''),
          _it('Jasmine Green · Peppermint · Chamomile', ''),
        ], { titleFont: 'Cormorant', titleSize: 24, titleAlign: 'center', titleColor: '#9c7b4a' }),
      ] }; } },
  ];

  // ================= DURUM =================
  let _view = null, currentId = null, currentMenu = null, design = null, selectedId = null;
  let viewportEl = null, pageScaleEl = null, inspectorEl = null;
  let _saveTimer = null, canvasDragId = null;

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
      if (!b.src) return '<div style="display:flex;align-items:center;justify-content:center;color:#bbb;font-size:12px;border:1px dashed #ccc;padding:24px;border-radius:8px;">' + esc(t('ms_img_empty')) + '</div>';
      // Uygulama global CSS'i img{display:block} yapar → text-align ortalamaz.
      // Bu yüzden FLEX justify-content ile hizalanır (her zaman çalışır).
      const j = b.align === 'left' ? 'flex-start' : (b.align === 'right' ? 'flex-end' : 'center');
      return '<div style="display:flex;justify-content:' + j + ';"><img src="' + b.src + '" style="max-width:100%;height:' + (b.height || 200) + 'px;object-fit:cover;border-radius:' + (b.radius || 0) + 'px;display:block;"></div>';
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
  function legendHtml(d, page) {
    if (!page.showAllergens) return '';
    const used = {};
    (d.blocks || []).forEach(function (b) { if (b.type === 'section') (b.items || []).forEach(function (it) { itemAllergenCodes(it).forEach(function (c) { used[c] = true; }); }); });
    const codes = Object.keys(used); if (!codes.length) return '';
    return '<div style="margin-top:20px;font-family:' + fontCss(page.baseFont) + ';font-size:10px;color:' + (page.ink || '#111') + '99;text-align:center;">' + codes.map(function (c) { return '<b>' + c + '</b>'; }).join(' · ') + '</div>';
  }
  function blockIsFullWidth(b, cols) {
    if (cols <= 1) return false;
    if (typeof b.span === 'boolean') return b.span;
    return b.type === 'heading' || b.type === 'divider' || b.type === 'image' || b.type === 'text';
  }
  function renderPageInner(d, opts) {
    opts = opts || {};
    const page = d.page;
    const cols = Math.max(1, Math.min(4, page.columns || 1));
    const blocksHtml = (d.blocks || []).map(function (b) {
      const flow = cols > 1 ? (blockIsFullWidth(b, cols) ? 'column-span:all;-webkit-column-span:all;' : 'break-inside:avoid;-webkit-column-break-inside:avoid;') : '';
      const drag = opts.draggable ? ' draggable="true"' : '';
      return '<div class="ms-block" data-bid="' + b.id + '"' + drag + ' style="margin-bottom:' + (b.type === 'spacer' ? 0 : 18) + 'px;' + flow + '">' + blockInnerHTML(b, page) + '</div>';
    }).join('');
    let body = cols > 1 ? '<div style="column-count:' + cols + ';column-gap:' + (page.columnGap == null ? 28 : page.columnGap) + 'px;">' + blocksHtml + '</div>' : blocksHtml;
    body += legendHtml(d, page);
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
    // transform-origin TOP LEFT zorunlu: 'center' kullanılırsa eleman
    // viewport'tan genişse (yatay/A3) ölçek merkezden büzülürken sağ yarı kırpılır.
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
    pageScaleEl.innerHTML = renderPageInner(design, { draggable: true });
    if (selectedId) { const sel = pageScaleEl.querySelector('[data-bid="' + selectedId + '"]'); if (sel) sel.style.outline = '2px solid var(--brand-500,#22c55e)'; }
    applyScale();
    updateStatsBar();
    saveSoon();
  }
  function updateStatsBar() {
    const el = _view && PCD.$('#msStats', _view); if (!el) return;
    const s = computeStats();
    el.innerHTML = '<span>' + esc(t('ms_revenue')) + ': <b>' + cur() + s.revenue.toFixed(2) + '</b></span>' +
      (s.avgMargin != null ? ' · <span>' + esc(t('ms_avg_margin')) + ': <b style="color:' + (s.avgMargin >= 65 ? '#16a34a' : s.avgMargin >= 55 ? '#d97706' : '#dc2626') + ';">%' + s.avgMargin.toFixed(0) + '</b></span>' : '');
  }

  // ================= INSPECTOR =================
  function sRow(label, html) { return '<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">' + esc(label) + '</div>' + html + '</div>'; }
  function fontSel(attr, val, allowInherit) {
    let opts = allowInherit ? '<option value=""' + (!val ? ' selected' : '') + '>' + esc(t('ms_font_inherit')) + '</option>' : '';
    opts += FONTS.map(function (f) { return '<option value="' + f.label + '"' + (val === f.label ? ' selected' : '') + '>' + f.label + '</option>'; }).join('');
    return '<select class="select" data-f="' + attr + '" style="width:100%;">' + opts + '</select>';
  }
  function numIn(attr, val, mn, mx) { return '<input type="number" class="input" data-f="' + attr + '" value="' + (val == null ? '' : val) + '" min="' + (mn || 0) + '" max="' + (mx || 999) + '" style="width:100%;">'; }
  function colIn(attr, val, fb) { return '<input type="color" data-f="' + attr + '" value="' + (val || fb || '#111111') + '" style="width:46px;height:32px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;"> <button type="button" class="btn btn-ghost btn-sm" data-clear="' + attr + '">' + esc(t('ms_theme')) + '</button>'; }
  function alignB(attr, val) { return ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="btn btn-sm ' + (val === a ? 'btn-primary' : 'btn-outline') + '" data-align="' + attr + '|' + a + '">' + (a === 'left' ? '⟸' : a === 'center' ? '≡' : '⟹') + '</button>'; }).join(' '); }
  function pill(dataAttr, current, opts) { return opts.map(function (o) { return '<button type="button" class="btn btn-sm ' + (String(current) === String(o.v) ? 'btn-primary' : 'btn-outline') + '" ' + dataAttr + '="' + o.v + '">' + o.l + '</button>'; }).join(' '); }

  // Katman listesi (yeşil kartlar + sürükle-bırak)
  function layersHtml() {
    if (!design.blocks || !design.blocks.length) return '<div class="text-muted text-sm">' + esc(t('ms_layers_empty')) + '</div>';
    return design.blocks.map(function (b) {
      const sel = b.id === selectedId;
      const meta = BLOCK_META[b.type] || { glyph: '•' };
      return '<div class="ms-layer' + (sel ? ' sel' : '') + '" draggable="true" data-layer="' + b.id + '">' +
        '<span class="ms-layer-grip">⠿</span>' +
        '<span class="ms-layer-ico">' + meta.glyph + '</span>' +
        '<span class="ms-layer-name">' + esc(blockLabel(b)) + '</span>' +
        '<button type="button" class="ms-layer-del" data-layerdel="' + b.id + '" title="' + esc(t('ms_delete')) + '">✕</button>' +
        '</div>';
    }).join('');
  }

  function pageControlsHtml() {
    const cols = design.page.columns || 1;
    const ON = esc(t('ms_on')), OFF = esc(t('ms_off'));
    let h = '';
    h += sRow(t('ms_base_font'), fontSel('page.baseFont', design.page.baseFont));
    h += sRow(t('ms_paper'), pill('data-paper', design.page.paper || 'A4', [{ v: 'A4', l: 'A4' }, { v: 'A3', l: 'A3' }, { v: 'A5', l: 'A5' }, { v: 'letter', l: 'Letter' }]));
    h += sRow(t('ms_orientation'), pill('data-orient', design.page.orientation || 'portrait', [{ v: 'portrait', l: esc(t('ms_portrait')) }, { v: 'landscape', l: esc(t('ms_landscape')) }]));
    h += sRow(t('ms_columns'), pill('data-cols', cols, [{ v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 4, l: '4' }]));
    if (cols > 1) h += sRow(t('ms_column_gap'), numIn('page.columnGap', design.page.columnGap == null ? 28 : design.page.columnGap, 8, 80));
    h += sRow(t('ms_accent_color'), colIn('page.accent', design.page.accent, '#c5a572'));
    h += sRow(t('ms_text_color'), colIn('page.ink', design.page.ink, '#111111'));
    h += sRow(t('ms_background'), colIn('page.bg', design.page.bg, '#ffffff'));
    h += sRow(t('ms_margin'), numIn('page.pad', design.page.pad, 16, 120));
    h += sRow(t('ms_frame'), pill('data-frame', design.page.frame ? (design.page.frameStyle || 'thin') : 'off', [{ v: 'off', l: esc(t('ms_frame_off')) }, { v: 'thin', l: esc(t('ms_frame_thin')) }, { v: 'double', l: esc(t('ms_frame_double')) }]) + (design.page.frame ? ' ' + colIn('page.frameColor', design.page.frameColor, design.page.accent) : ''));
    h += sRow(t('ms_show_prices'), '<button type="button" class="btn btn-sm ' + (design.page.showPrices !== false ? 'btn-primary' : 'btn-outline') + '" data-toggle-page="showPrices">' + (design.page.showPrices !== false ? ON : OFF) + '</button>');
    h += sRow(t('ms_allergen_codes'), '<button type="button" class="btn btn-sm ' + (design.page.showAllergens ? 'btn-primary' : 'btn-outline') + '" data-toggle-page="showAllergens">' + (design.page.showAllergens ? ON : OFF) + '</button> <span style="font-size:11px;color:var(--text-3);">' + esc(t('ms_allergen_auto')) + '</span>');
    h += '<div style="display:flex;gap:6px;margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="msBrandSave" style="flex:1;">' + esc(t('ms_save_brand')) + '</button><button type="button" class="btn btn-ghost btn-sm" id="msBrandApply" style="flex:1;">' + esc(t('ms_apply')) + '</button></div>';
    return h;
  }

  function blockControlsHtml(b, cols) {
    const ON = esc(t('ms_on')), OFF = esc(t('ms_off'));
    let h = '';
    if (cols > 1 && b.type !== 'spacer') h += sRow(t('ms_col_width'), '<button type="button" class="btn btn-sm ' + (blockIsFullWidth(b, cols) ? 'btn-primary' : 'btn-outline') + '" data-spantoggle>' + (blockIsFullWidth(b, cols) ? esc(t('ms_span_full')) : esc(t('ms_span_single'))) + '</button>');

    if (b.type === 'heading' || b.type === 'text') {
      h += sRow(t('ms_text_label'), '<textarea class="textarea" data-f="text" rows="2" style="width:100%;">' + esc(b.text) + '</textarea>');
      h += sRow(t('ms_font'), fontSel('font', b.font, true));
      h += sRow(t('ms_size'), numIn('size', b.size, 8, 120));
      h += sRow(t('ms_align'), alignB('align', b.align || 'center'));
      h += sRow(t('ms_color'), colIn('color', b.color, design.page.ink));
      if (b.type === 'text') h += sRow(t('ms_uppercase'), '<button type="button" class="btn btn-sm ' + (b.upper ? 'btn-primary' : 'btn-outline') + '" data-toggle="upper">' + (b.upper ? ON : OFF) + '</button>');
    } else if (b.type === 'section') {
      h += sRow(t('ms_section_name'), '<input type="text" class="input" data-f="title" value="' + esc(b.title) + '" style="width:100%;">');
      h += sRow(t('ms_title_font'), fontSel('titleFont', b.titleFont, true));
      h += sRow(t('ms_title_size'), numIn('titleSize', b.titleSize, 12, 60));
      h += sRow(t('ms_title_color'), colIn('titleColor', b.titleColor, design.page.accent));
      h += sRow(t('ms_title_align'), alignB('titleAlign', b.titleAlign || 'left'));
      h += sRow(t('ms_underline'), '<button type="button" class="btn btn-sm ' + (b.rule ? 'btn-primary' : 'btn-outline') + '" data-toggle="rule">' + (b.rule ? ON : OFF) + '</button>');
      h += '<hr style="border:0;border-top:1px dashed var(--border);margin:12px 0;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;">' + esc(t('ms_dishes')) + '</div>';
      (b.items || []).forEach(function (it) {
        const m = itemMargin(it);
        h += '<div class="card" style="padding:8px;margin-bottom:8px;" data-iid="' + it.id + '">';
        h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;"><input type="text" class="input" data-itf="name" value="' + esc(it.name) + '" placeholder="' + esc(t('ms_dish_ph')) + '" style="flex:1;"><input type="text" class="input" data-itf="price" value="' + esc(it.price) + '" placeholder="' + cur() + '" style="width:60px;"><button type="button" class="btn btn-ghost btn-sm" data-itmove="up">↑</button><button type="button" class="btn btn-ghost btn-sm" data-itmove="down">↓</button><button type="button" class="btn btn-ghost btn-sm" data-itdel style="color:var(--danger);">✕</button></div>';
        h += '<input type="text" class="input" data-itf="desc" value="' + esc(it.desc) + '" placeholder="' + esc(t('ms_desc_ph')) + '" style="width:100%;margin-bottom:4px;">';
        h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + (it.photo ? '<img src="' + it.photo + '" style="width:30px;height:30px;object-fit:cover;border-radius:5px;">' : '') + '<button type="button" class="btn btn-outline btn-sm" data-itphoto>' + (it.photo ? esc(t('ms_photo')) : esc(t('ms_add_photo'))) + '</button>' + (it.photo ? '<button type="button" class="btn btn-ghost btn-sm" data-itphotodel>' + esc(t('ms_remove')) + '</button>' : '') +
          (m != null ? '<span style="margin-inline-start:auto;font-size:11px;font-weight:700;color:' + (m >= 65 ? '#16a34a' : m >= 55 ? '#d97706' : '#dc2626') + ';">' + esc(t('ms_margin_pct', { n: m.toFixed(0) })) + '</span>' : (it.recipeId ? '' : '<span style="margin-inline-start:auto;font-size:10px;color:var(--text-3);">' + esc(t('ms_manual_tag')) + '</span>')) + '</div>';
        h += '</div>';
      });
      h += '<div style="display:flex;gap:6px;"><button type="button" class="btn btn-ghost btn-sm" data-additem-recipe style="flex:1;">' + esc(t('ms_add_from_recipe')) + '</button><button type="button" class="btn btn-ghost btn-sm" data-additem-manual style="flex:1;">' + esc(t('ms_add_manual')) + '</button></div>';
    } else if (b.type === 'image') {
      h += sRow(t('ms_image'), '<button type="button" class="btn btn-outline btn-sm" data-imgupload>' + (b.src ? esc(t('ms_replace')) : esc(t('ms_upload'))) + '</button>' + (b.src ? ' <button type="button" class="btn btn-ghost btn-sm" data-imgdel>' + esc(t('ms_remove')) + '</button>' : ''));
      h += sRow(t('ms_height'), numIn('height', b.height, 60, 600));
      h += sRow(t('ms_align'), alignB('align', b.align || 'center'));
      h += sRow(t('ms_corner'), numIn('radius', b.radius, 0, 40));
    } else if (b.type === 'divider') {
      const curDiv = dividerStyleOf(b);
      h += sRow(t('ms_style'), '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + DIV_STYLES.map(function (d) { return '<button type="button" class="btn btn-sm ' + (curDiv === d.id ? 'btn-primary' : 'btn-outline') + '" data-divstyle="' + d.id + '" title="' + d.id + '" style="min-width:42px;font-size:14px;line-height:1.1;">' + miniDivPreview(d) + '</button>'; }).join('') + '</div>');
      h += sRow(t('ms_color'), colIn('color', b.color, design.page.accent));
      if (dividerDef(curDiv).kind !== 'line') h += sRow(t('ms_ornament_size'), numIn('size', b.size, 10, 60));
    } else if (b.type === 'spacer') { h += sRow(t('ms_height'), numIn('height', b.height, 4, 200)); }
    return h;
  }

  // v2.32 — Sağ panel SADECE katman (Blocks) listesi. Blok düzenleme + sayfa
  // ayarları artık POPUP ile (Whiteboard/Prep mantığı). Page settings artık her
  // blok altında çıkmıyor — ayrı "Sayfa" butonuyla açılır.
  let _blockRepaint = null;
  function renderInspector() {
    if (!inspectorEl) return;
    normalizeDesign(design);
    inspectorEl.innerHTML = '<div class="ms-card"><div class="ms-card-title">🧱 ' + esc(t('ms_blocks')) + '</div><div id="msLayers">' + layersHtml() + '</div>' +
      '<div class="text-muted text-sm" style="margin-top:9px;line-height:1.4;">✏️ ' + esc(t('ms_select_hint')) + '</div></div>';
    wireLayers(inspectorEl);
  }

  function wireLayers(root) {
    root.querySelectorAll('[data-layer]').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target.closest('[data-layerdel]')) return; openBlockEditor(el.getAttribute('data-layer')); });
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function () { canvasDragId = el.getAttribute('data-layer'); el.style.opacity = '0.4'; });
      el.addEventListener('dragend', function () { el.style.opacity = ''; root.querySelectorAll('.ms-layer.dragover').forEach(function (x) { x.classList.remove('dragover'); }); });
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('dragover'); });
      el.addEventListener('dragleave', function () { el.classList.remove('dragover'); });
      el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('dragover'); reorderBlocks(canvasDragId, el.getAttribute('data-layer')); });
    });
    root.querySelectorAll('[data-layerdel]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); const id = el.getAttribute('data-layerdel'); design.blocks = design.blocks.filter(function (x) { return x.id !== id; }); if (selectedId === id) selectedId = null; refreshPage(); renderInspector(); }); });
  }

  function openBlockEditor(id) {
    selectedId = id;
    const b = findBlock(id); if (!b) { refreshPage(); return; }
    refreshPage();
    const cols = design.page.columns || 1;
    const meta = BLOCK_META[b.type] || { glyph: '•' };
    const body = PCD.el('div');
    function repaint() {
      body.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-bottom:10px;">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-move="up" title="↑">↑</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-move="down" title="↓">↓</button>' +
        '</div>' + blockControlsHtml(b, cols);
      wireBlockControls(body, b, repaint);
    }
    _blockRepaint = repaint;
    repaint();
    const delBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', text: t('ms_delete'), style: { color: 'var(--danger)', borderColor: 'var(--danger)', marginInlineEnd: 'auto' } });
    const dupBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', text: t('ms_duplicate') });
    const doneBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('ms_done') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', alignItems: 'center' } });
    footer.appendChild(delBtn); footer.appendChild(dupBtn); footer.appendChild(doneBtn);
    const m = PCD.modal.open({ title: meta.glyph + ' ' + blockTypeLabel(b.type), body: body, footer: footer, size: 'sm', closable: true });
    const close = function () { _blockRepaint = null; m.close(); };
    delBtn.addEventListener('click', function () { design.blocks = design.blocks.filter(function (x) { return x.id !== id; }); selectedId = null; refreshPage(); renderInspector(); close(); });
    dupBtn.addEventListener('click', function () { const copy = JSON.parse(JSON.stringify(b)); copy.id = uid(); const i = design.blocks.findIndex(function (x) { return x.id === id; }); design.blocks.splice(i + 1, 0, copy); refreshPage(); renderInspector(); close(); openBlockEditor(copy.id); });
    doneBtn.addEventListener('click', close);
  }

  function openPageSettings() {
    const body = PCD.el('div');
    function repaint() { body.innerHTML = pageControlsHtml(); wirePageControls(body, repaint); }
    repaint();
    PCD.modal.open({ title: '🎨 ' + t('ms_page'), body: body, size: 'sm', closable: true });
  }

  function setField(target, path, value) { if (path.indexOf('.') >= 0) { const p = path.split('.'); design[p[0]][p[1]] = value; } else target[path] = value; }
  function pickImage(cb) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = function () { const f = inp.files && inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = function () { cb(rd.result); }; rd.readAsDataURL(f); }; inp.click(); }

  function reorderBlocks(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const arr = design.blocks;
    const fi = arr.findIndex(function (x) { return x.id === fromId; });
    const ti = arr.findIndex(function (x) { return x.id === toId; });
    if (fi < 0 || ti < 0) return;
    const item = arr.splice(fi, 1)[0];
    arr.splice(ti, 0, item);
    refreshPage(); renderInspector();
  }

  // v2.32 — Blok kontrolleri popup gövdesinde wire'lanır (root = modal body, repaint = popup'ı tazele)
  function wireBlockControls(root, b, repaint) {
    if (!b) return;
    root.querySelectorAll('[data-f]').forEach(function (el) {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () { let v = el.value; if (el.type === 'number') v = v === '' ? null : Number(v); setField(b, el.getAttribute('data-f'), v); refreshPage(); });
    });
    root.querySelectorAll('[data-clear]').forEach(function (el) { el.addEventListener('click', function () { setField(b, el.getAttribute('data-clear'), ''); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-align]').forEach(function (el) { el.addEventListener('click', function () { const p = el.getAttribute('data-align').split('|'); setField(b, p[0], p[1]); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-toggle]').forEach(function (el) { el.addEventListener('click', function () { const k = el.getAttribute('data-toggle'); b[k] = !b[k]; refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-divstyle]').forEach(function (el) { el.addEventListener('click', function () { b.dividerStyle = el.getAttribute('data-divstyle'); delete b.variant; refreshPage(); repaint(); }); });
    const spanT = root.querySelector('[data-spantoggle]'); if (spanT) spanT.addEventListener('click', function () { b.span = !blockIsFullWidth(b, design.page.columns || 1); refreshPage(); repaint(); });
    root.querySelectorAll('[data-move]').forEach(function (el) { el.addEventListener('click', function () { moveBlock(b.id, el.getAttribute('data-move')); }); });
    const iu = root.querySelector('[data-imgupload]'); if (iu) iu.addEventListener('click', function () { pickImage(function (src) { b.src = src; refreshPage(); repaint(); }); });
    const idl = root.querySelector('[data-imgdel]'); if (idl) idl.addEventListener('click', function () { b.src = null; refreshPage(); repaint(); });
    if (b.type === 'section') {
      root.querySelectorAll('[data-iid]').forEach(function (row) {
        const iid = row.getAttribute('data-iid'); const it = (b.items || []).find(function (x) { return x.id === iid; }); if (!it) return;
        row.querySelectorAll('[data-itf]').forEach(function (el) { el.addEventListener('input', function () { it[el.getAttribute('data-itf')] = el.value; refreshPage(); }); });
        const up = row.querySelector('[data-itmove="up"]'); if (up) up.addEventListener('click', function () { moveItem(b, iid, 'up'); repaint(); });
        const dn = row.querySelector('[data-itmove="down"]'); if (dn) dn.addEventListener('click', function () { moveItem(b, iid, 'down'); repaint(); });
        const dl = row.querySelector('[data-itdel]'); if (dl) dl.addEventListener('click', function () { b.items = b.items.filter(function (x) { return x.id !== iid; }); refreshPage(); repaint(); });
        const ph = row.querySelector('[data-itphoto]'); if (ph) ph.addEventListener('click', function () { pickImage(function (src) { it.photo = src; refreshPage(); repaint(); }); });
        const phd = row.querySelector('[data-itphotodel]'); if (phd) phd.addEventListener('click', function () { it.photo = null; refreshPage(); repaint(); });
      });
      const aR = root.querySelector('[data-additem-recipe]'); if (aR) aR.addEventListener('click', function () { openRecipePicker(b); });
      const aM = root.querySelector('[data-additem-manual]'); if (aM) aM.addEventListener('click', function () { b.items = b.items || []; b.items.push({ id: uid(), name: t('ms_new_dish'), price: '', desc: '', photo: null }); refreshPage(); repaint(); });
    }
  }

  // v2.40 — Tema cascade: şablonlar accent/font'u blok-seviyesinde gömdüğü için
  // (titleColor/titleFont/itemFont/divider color), sayfa teması değişince ESKİ tema
  // değerini izleyen blokları da yeni değere taşı. Kullanıcının elle FARKLI renge/fonta
  // ayarladığı bloklar (oldVal'a eşit olmayan) dokunulmadan korunur. titleColor hiç
  // set edilmemiş bloklar zaten accent fallback'i kullanır (otomatik takip).
  function cascadeTheme(kind, oldVal, newVal) {
    if (!newVal || oldVal === newVal) return;
    (design.blocks || []).forEach(function (b) {
      if (kind === 'accent') {
        // Güçlü global accent: section başlık + ayraç override'larını temizle →
        // hepsi page.accent'i izler (şablon başlık rengini ezse bile accent çalışır).
        // Bölüm-bazlı özel renk hâlâ blok editöründen accent değişiminden SONRA verilebilir.
        if (b.type === 'section') delete b.titleColor;
        if (b.type === 'divider') delete b.color;
      } else if (kind === 'font') {
        // Base font: yalnız ESKİ temayı izleyen blokları güncelle — kasıtlı display
        // fontları (ör. büyük başlıkta Bebas Neue) korunur.
        if (b.titleFont && b.titleFont === oldVal) b.titleFont = newVal;
        if (b.itemFont && b.itemFont === oldVal) b.itemFont = newVal;
        if (b.font && b.font === oldVal) b.font = newVal;
      }
    });
    if (kind === 'accent') delete design.page.frameColor; // çerçeve de accent'i izlesin
  }

  // v2.32 — Sayfa ayarları popup gövdesinde wire'lanır
  function wirePageControls(root, repaint) {
    // v2.40 — FIX: data-f (renk/font/sayı) + data-clear input'ları sayfa popup'ında
    // bağlanmıyordu (v2.32 refactor'unda unutulmuştu) → Base font, Column gap, Theme
    // accent, Text color, Background, Margin, Frame color hiçbir değişiklik yapmıyordu.
    // wireBlockControls ile aynı desen.
    root.querySelectorAll('[data-f]').forEach(function (el) {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () {
        let v = el.value; if (el.type === 'number') v = v === '' ? null : Number(v);
        const path = el.getAttribute('data-f');
        if (path === 'page.accent') { cascadeTheme('accent', design.page.accent, v); design.page.accent = v; }
        else if (path === 'page.baseFont') { cascadeTheme('font', design.page.baseFont, v); design.page.baseFont = v; }
        else { setField(design, path, v); }
        refreshPage();
      });
    });
    root.querySelectorAll('[data-clear]').forEach(function (el) { el.addEventListener('click', function () { setField(design, el.getAttribute('data-clear'), ''); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-toggle-page]').forEach(function (el) { el.addEventListener('click', function () { const k = el.getAttribute('data-toggle-page'); design.page[k] = !design.page[k]; refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-paper]').forEach(function (el) { el.addEventListener('click', function () { design.page.paper = el.getAttribute('data-paper'); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-orient]').forEach(function (el) { el.addEventListener('click', function () { design.page.orientation = el.getAttribute('data-orient'); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-cols]').forEach(function (el) { el.addEventListener('click', function () { design.page.columns = Number(el.getAttribute('data-cols')); refreshPage(); repaint(); }); });
    root.querySelectorAll('[data-frame]').forEach(function (el) { el.addEventListener('click', function () { const v = el.getAttribute('data-frame'); design.page.frame = (v !== 'off'); if (v !== 'off') design.page.frameStyle = v; refreshPage(); repaint(); }); });
    const bs = root.querySelector('#msBrandSave'); if (bs) bs.addEventListener('click', saveBrand);
    const ba = root.querySelector('#msBrandApply'); if (ba) ba.addEventListener('click', applyBrand);
  }

  function moveBlock(id, dir) { const i = design.blocks.findIndex(function (x) { return x.id === id; }); const j = dir === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= design.blocks.length) return; const t = design.blocks[i]; design.blocks[i] = design.blocks[j]; design.blocks[j] = t; refreshPage(); renderInspector(); }
  function moveItem(sec, iid, dir) { const i = sec.items.findIndex(function (x) { return x.id === iid; }); const j = dir === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= sec.items.length) return; const t = sec.items[i]; sec.items[i] = sec.items[j]; sec.items[j] = t; refreshPage(); renderInspector(); }

  function openRecipePicker(sec) {
    const recipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    if (!recipes.length) { if (PCD.toast) PCD.toast.info(t('ms_no_recipes')); return; }
    const body = PCD.el('div');
    body.innerHTML = '<input type="search" class="input" id="msrq" placeholder="' + esc(t('ms_recipe_search_ph')) + '" style="width:100%;margin-bottom:8px;"><div id="msrl" style="max-height:50vh;overflow:auto;"></div>';
    function paint(q) {
      const list = body.querySelector('#msrl'); const ql = (q || '').toLowerCase();
      list.innerHTML = recipes.filter(function (r) { return !ql || (r.name || '').toLowerCase().indexOf(ql) >= 0; }).map(function (r) { return '<button type="button" class="btn btn-ghost btn-sm" data-rid="' + r.id + '" style="display:block;width:100%;text-align:left;">' + esc(r.name) + (r.salePrice ? ' · ' + cur() + r.salePrice : '') + '</button>'; }).join('');
      list.querySelectorAll('[data-rid]').forEach(function (el) { el.addEventListener('click', function () { const r = recipes.find(function (x) { return x.id === el.getAttribute('data-rid'); }); sec.items = sec.items || []; sec.items.push({ id: uid(), name: r.name, price: r.salePrice != null ? String(r.salePrice) : '', desc: r.plating || '', photo: r.photo || null, recipeId: r.id }); refreshPage(); renderInspector(); m.close(); if (_blockRepaint) _blockRepaint(); }); });
    }
    paint('');
    const m = PCD.modal.open({ title: t('ms_recipe_pick_title'), body: body, size: 'sm', closable: true });
    setTimeout(function () { const s = body.querySelector('#msrq'); if (s) { s.focus(); s.addEventListener('input', function () { paint(s.value); }); } }, 100);
  }

  function addBlock(type) {
    const nb = { id: uid(), type: type };
    if (type === 'heading') Object.assign(nb, { text: t('ms_ph_heading'), font: '', size: 32, weight: 500, align: 'center', color: '' });
    else if (type === 'text') Object.assign(nb, { text: t('ms_ph_text'), font: '', size: 13, align: 'center', color: '' });
    else if (type === 'section') Object.assign(nb, { title: t('ms_ph_section'), titleFont: '', titleSize: 24, items: [] });
    else if (type === 'image') Object.assign(nb, { src: null, height: 200, align: 'center', radius: 0 });
    else if (type === 'divider') Object.assign(nb, { dividerStyle: 'floral', color: '', size: 20 });
    else if (type === 'spacer') Object.assign(nb, { height: 24 });
    design.blocks.push(nb); refreshPage(); renderInspector(); openBlockEditor(nb.id);
  }

  // ---- Şablon galerisi ---- (forNew=true → home'dan yeni menü olarak oluştur)
  function openTemplates(forNew) {
    const body = PCD.el('div');
    body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + TEMPLATES.map(function (tpl) {
      return '<button type="button" class="ms-tplcard" data-tpl="' + tpl.id + '"><div class="ms-tplcard-prev" id="mstp-' + tpl.id + '"></div><div class="ms-tplcard-label">' + esc(tpl.label) + '</div></button>';
    }).join('') + '</div><div class="text-muted text-sm" style="margin-top:10px;">' + esc(t('ms_tpl_note')) + '</div>' +
      '<style>.ms-tplcard{display:block;width:100%;text-align:left;border:1px solid var(--border);border-radius:10px;padding:0;overflow:hidden;cursor:pointer;background:var(--surface);transition:.12s;}.ms-tplcard:hover{border-color:var(--brand-500,#22c55e);transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.1);}.ms-tplcard-prev{height:150px;overflow:hidden;position:relative;background:#fff;}.ms-tplcard-prev>div{transform-origin:top left;pointer-events:none;}.ms-tplcard-label{padding:8px 10px;font-weight:700;font-size:13px;}</style>';
    const m = PCD.modal.open({ title: t('ms_tpl_title'), body: body, size: 'md', closable: true });
    // mini önizlemeler
    setTimeout(function () {
      TEMPLATES.forEach(function (tpl) {
        const host = body.querySelector('#mstp-' + tpl.id); if (!host) return;
        let d; try { d = tpl.make(); normalizeDesign(d); } catch (e) { return; }
        const spec = pageSpec(d.page);
        const w = host.clientWidth || 240; const k = w / spec.w;
        host.innerHTML = '<div style="width:' + spec.w + 'px;height:' + spec.h + 'px;background:' + (d.page.bg || '#fff') + ';padding:' + (d.page.pad || 56) + 'px;box-sizing:border-box;transform:scale(' + k + ');">' + renderPageInner(d) + '</div>';
      });
    }, 60);
    body.querySelectorAll('[data-tpl]').forEach(function (el) { el.addEventListener('click', function () { const tpl = TEMPLATES.find(function (x) { return x.id === el.getAttribute('data-tpl'); }); m.close(); if (!tpl) return; if (forNew) { const d = tpl.make(); normalizeDesign(d); const rec = PCD.store.upsertInTable('menus', { name: tpl.label || t('ms_default_menu'), sections: [], studio: d }, 'm'); if (rec && rec.id) openDesign(rec.id); } else { design = tpl.make(); normalizeDesign(design); selectedId = null; refreshPage(); renderInspector(); } }); });
  }

  // ---- Marka kiti ----
  function saveBrand() {
    const kit = { baseFont: design.page.baseFont, accent: design.page.accent, ink: design.page.ink, bg: design.page.bg };
    try { localStorage.setItem(BRAND_KEY, JSON.stringify(kit)); if (PCD.toast) PCD.toast.success(t('ms_brand_saved')); } catch (e) {}
  }
  function applyBrand() {
    let kit = null; try { kit = JSON.parse(localStorage.getItem(BRAND_KEY)); } catch (e) {}
    if (!kit) { if (PCD.toast) PCD.toast.info(t('ms_brand_need_save')); return; }
    design.page.baseFont = kit.baseFont; design.page.accent = kit.accent; design.page.ink = kit.ink; design.page.bg = kit.bg;
    refreshPage(); renderInspector();
  }

  // ---- Klasik menüden içe aktar ----
  function importFromClassic(menu) {
    const blocks = [];
    blocks.push(_hd(menu.name || 'Menu', { font: 'Cormorant', size: 40, weight: 500 }));
    if (menu.subtitle) blocks.push(_tx(menu.subtitle, { font: 'Montserrat', size: 12, tracking: 3, upper: true }));
    blocks.push(_dv('linefloral'));
    (menu.sections || []).forEach(function (sec) {
      const items = (sec.items || []).map(function (it) {
        const r = it.recipeId ? PCD.store.getRecipe(it.recipeId) : null;
        return { id: uid(), name: it.recipeId ? (r ? r.name : (it.customName || '')) : (it.customName || ''), price: (it.price != null && it.price !== '') ? String(it.price) : (r && r.salePrice != null ? String(r.salePrice) : ''), desc: it.description || (r && r.plating) || '', photo: (r && r.photo) || null, recipeId: it.recipeId || undefined };
      });
      blocks.push(_sec(sec.name || sec.title || '', items, { titleFont: 'Cormorant', titleSize: 24 }));
    });
    if (menu.footer) blocks.push(_tx(menu.footer, { font: 'Montserrat', size: 9, color: '#888' }));
    return { page: { paper: 'A4', orientation: 'portrait', columns: 1, bg: '#fffefb', ink: '#1a1a1a', accent: '#c5a572', baseFont: 'Cormorant', pad: 56, showAllergens: false, showPrices: true }, blocks: blocks };
  }

  function buildPrintHtml() {
    normalizeDesign(design);
    const page = design.page; const spec = pageSpec(page);
    // v2.40 — FIX: print-color-adjust:exact eklendi. Tarayıcı varsayılan olarak arka plan
    // renklerini YAZDIRMAZ → menü arka planı (page.bg) print diyaloğunda beyaz çıkıyordu.
    // Bu özellik kalıtsaldır (html/body'de tüm alt öğeleri kapsar) → önizleme = Chrome print
    // = local print birebir aynı arka plan + renkler.
    return '<style>@page{size:' + spec.paperCss + (spec.land ? ' landscape' : ' portrait') + ';margin:0;}@import url("' + GF_HREF + '");html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.ms-print{box-sizing:border-box;width:' + spec.w + 'px;min-height:' + spec.h + 'px;background:' + (page.bg || '#fff') + ';padding:' + (page.pad || 56) + 'px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.ms-block{margin-bottom:18px;}</style><div class="ms-print">' + renderPageInner(design) + '</div>';
  }

  // Studio tasarımını paylaşım/snapshot için standalone HTML üretir.
  // share.js public sayfada bunu doğrudan enjekte eder (Studio yüklü olmadan).
  function renderShareDoc(d) {
    normalizeDesign(d);
    const spec = pageSpec(d.page);
    const html = '<div style="width:' + spec.w + 'px;min-height:' + spec.h + 'px;background:' + (d.page.bg || '#fff') + ';padding:' + (d.page.pad || 56) + 'px;box-sizing:border-box;">' + renderPageInner(d) + '</div>';
    return { html: html, w: spec.w, h: spec.h, bg: d.page.bg || '#fff', fonts: GF_HREF };
  }

  // ---- Paylaş (public link + QR, opsiyonel cost-view) ----
  function openShare() {
    const user = PCD.store.get && PCD.store.get('user');
    if (!user || !user.id) { if (PCD.toast) PCD.toast.info(t('ms_share_signin')); return; }
    if (!PCD.share || !PCD.share.createOrGetShareUrl) { if (PCD.toast) PCD.toast.error(t('ms_share_unavailable')); return; }
    if (currentMenu) { currentMenu.studio = design; try { PCD.store.upsertInTable('menus', currentMenu, 'm'); } catch (e) {} }
    const canCost = !(PCD.gate && PCD.gate.canUseCostView) || PCD.gate.canUseCostView();
    const body = PCD.el('div');
    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;">' +
      '<button type="button" class="btn btn-primary" id="msShPublic" style="justify-content:flex-start;">' + (PCD.icon ? PCD.icon('share', 16) : '') + ' ' + esc(t('ms_share_public')) + '</button>' +
      '<button type="button" class="btn btn-outline" id="msShCost" style="justify-content:flex-start;">' + (PCD.icon ? PCD.icon('grid', 16) : '') + ' ' + esc(t('ms_share_cost')) + (canCost ? '' : ' ' + esc(t('ms_pro_suffix'))) + '</button>' +
      '<div class="text-muted text-sm">' + esc(t('ms_share_note')) + '</div></div>';
    const m = PCD.modal.open({ title: t('ms_share_title'), body: body, size: 'sm', closable: true });
    body.querySelector('#msShPublic').addEventListener('click', function () { m.close(); doShare('public'); });
    body.querySelector('#msShCost').addEventListener('click', function () {
      m.close();
      if (!canCost) { if (PCD.gate && PCD.gate.showUpgradeModal) PCD.gate.showUpgradeModal({ feature: 'costview' }); return; }
      doShare('cost');
    });
  }
  function doShare(mode) {
    PCD.share.createOrGetShareUrl('menu', currentId, mode).then(function (urlStr) {
      if (PCD.qr && PCD.qr.show) PCD.qr.show({ title: (currentMenu && currentMenu.name) || 'Menu', subtitle: mode === 'cost' ? t('ms_sub_cost') : t('ms_sub_menu'), text: urlStr });
      else if (PCD.toast) PCD.toast.success(urlStr);
    }).catch(function (e) { if (PCD.toast) PCD.toast.error(t('ms_share_error', { msg: ((e && e.message) || e) })); });
  }

  // ================= LIBRARY (liste) =================
  function thumbHtml(menu) {
    let d = menu.studio;
    if (!d) {
      const hasClassic = (menu.sections || []).some(function (s) { return (s.items || []).length; });
      d = hasClassic ? importFromClassic(menu) : null;
    }
    if (!d || !d.page) return '<div class="ms-thumb ms-thumb--empty">🎨</div>';
    normalizeDesign(d);
    const spec = pageSpec(d.page);
    return '<div class="ms-thumb"><div class="ms-thumb-inner" data-pw="' + spec.w + '" data-ph="' + spec.h + '" style="width:' + spec.w + 'px;height:' + spec.h + 'px;background:' + (d.page.bg || '#fff') + ';padding:' + (d.page.pad || 56) + 'px;box-sizing:border-box;">' + renderPageInner(d) + '</div></div>';
  }
  // v2.40 — FIX: hard refresh / F5'te layout henüz hazır olmadığında host.clientWidth=0
  // oluyordu → eski kod sessizce return edip scale'i HİÇ uygulamıyordu → thumbnail tam
  // A4 boyutta kalıp karttan taşıyordu. Artık bir kart bile ölçülemiyorsa bounded rAF
  // self-retry yapılır (genişlik birkaç frame içinde gelir). Desen: applyScale (742).
  function sizeThumbs(_tries) {
    if (!_view) return;
    _tries = _tries || 0;
    let pending = false;
    _view.querySelectorAll('.ms-thumb-inner').forEach(function (inner) {
      const pw = parseFloat(inner.getAttribute('data-pw')) || 794;
      const ph = parseFloat(inner.getAttribute('data-ph')) || 1123;
      const host = inner.parentElement;
      const w = host.clientWidth;
      if (!w) { pending = true; return; }   // bu kart henüz ölçülemedi
      const k = w / pw;
      inner.style.transform = 'scale(' + k + ')';
      host.style.height = (ph * k) + 'px';
    });
    if (pending && _tries < 60) { requestAnimationFrame(function () { sizeThumbs(_tries + 1); }); }
  }

  function renderList() {
    ensureFonts(document);
    const menus = (PCD.store.listTable('menus') || []).slice().sort(function (a, b) { return (b.updatedAt || 0) > (a.updatedAt || 0) ? 1 : -1; });
    let h = '<style>' +
      '.ms-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px;}' +
      '.ms-libcard{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface);cursor:pointer;transition:.14s;position:relative;}' +
      '.ms-libcard:hover{border-color:var(--brand-500,#22c55e);transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.12);}' +
      '.ms-thumb{width:100%;overflow:hidden;background:#fff;border-bottom:1px solid var(--border);}' +
      '.ms-thumb-inner{transform-origin:top left;pointer-events:none;}' +
      '.ms-thumb--empty{height:220px;display:flex;align-items:center;justify-content:center;font-size:42px;}' +
      '.ms-libcard-body{padding:11px 13px;}' +
      '.ms-libcard-title{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.ms-libcard-meta{font-size:11px;color:var(--text-3);margin-top:3px;}' +
      '.ms-libcard-actions{position:absolute;top:8px;right:8px;display:flex;gap:5px;opacity:0;transition:.14s;}' +
      '.ms-libcard:hover .ms-libcard-actions{opacity:1;}' +
      '.ms-libcard-actions button{border:0;background:rgba(255,255,255,.92);color:#333;border-radius:7px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.15);}' +
      '.ms-libcard-actions button:hover{background:#fff;}' +
      '</style>';
    h += '<div class="page-header"><div class="page-header-text"><div class="page-title">Menu Studio</div><div class="page-subtitle">' + esc(t('ms_subtitle')) + '</div></div><div class="page-header-actions"><button class="btn btn-outline" id="msTplHome">' + (PCD.icon ? PCD.icon('grid', 14) : '📋') + ' ' + esc(t('ms_templates')) + '</button><button class="btn btn-primary" id="msNew">' + esc(t('ms_new_menu')) + '</button></div></div>';
    h += PCD.guideCard('menu', t('menu_g_t'), [t('menu_g1'), t('menu_g2'), t('menu_g3')]);
    if (!menus.length) {
      h += '<div class="empty"><div class="empty-icon">🎨</div><div class="empty-title">' + esc(t('ms_no_menus_title')) + '</div><div class="empty-desc">' + esc(t('ms_no_menus_desc')) + '</div><div class="empty-action" style="display:flex;gap:8px;justify-content:center;"><button class="btn btn-outline" id="msTpl2">' + (PCD.icon ? PCD.icon('grid', 14) : '📋') + ' ' + esc(t('ms_templates')) + '</button><button class="btn btn-primary" id="msNew2">' + esc(t('ms_new_menu')) + '</button></div></div>';
    } else {
      h += '<div class="ms-lib">' + menus.map(function (m) {
        const items = (m.studio ? (m.studio.blocks || []).reduce(function (a, b) { return a + (b.type === 'section' ? (b.items || []).length : 0); }, 0) : (m.sections || []).reduce(function (a, s) { return a + ((s.items || []).length); }, 0));
        return '<div class="ms-libcard" data-ms-open="' + m.id + '">' + thumbHtml(m) +
          '<div class="ms-libcard-body"><div class="ms-libcard-title">' + esc(m.name || t('ms_default_menu')) + '</div><div class="ms-libcard-meta">' + items + ' ' + esc(t('ms_items')) + ' · ' + (PCD.fmtRelTime ? PCD.fmtRelTime(m.updatedAt) : '') + '</div></div>' +
          '<div class="ms-libcard-actions"><button data-ms-dup="' + m.id + '">' + (PCD.icon ? PCD.icon('copy', 16) : '⧉') + '</button><button data-ms-del="' + m.id + '" title="' + esc(t('ms_delete')) + '">' + (PCD.icon ? PCD.icon('trash', 16) : '✕') + '</button></div></div>';
      }).join('') + '</div>';
    }
    _view.innerHTML = h;
    sizeThumbs();
    setTimeout(sizeThumbs, 120);
    const nw = function () { createNew(); };
    const n1 = PCD.$('#msNew', _view); if (n1) n1.addEventListener('click', nw);
    const n2 = PCD.$('#msNew2', _view); if (n2) n2.addEventListener('click', nw);
    const th1 = PCD.$('#msTplHome', _view); if (th1) th1.addEventListener('click', function () { openTemplates(true); });
    const th2 = PCD.$('#msTpl2', _view); if (th2) th2.addEventListener('click', function () { openTemplates(true); });
    // v2.40 — FIX: data-open/dup/del menü-özel (data-ms-*) yapıldı. Eskiden bu GENEL
    // attribute'lar paylaşılan #view'a delege ediliyordu → roster gibi data-open kullanan
    // araçlara sızıp "Menu not found" toast'ı tetikliyordu. Artık çakışma yok.
    PCD.on(_view, 'click', '[data-ms-open]', function (e) { if (e.target.closest('[data-ms-del]') || e.target.closest('[data-ms-dup]')) return; openDesign(this.getAttribute('data-ms-open')); });
    PCD.on(_view, 'click', '[data-ms-dup]', function (e) {
      e.stopPropagation(); const id = this.getAttribute('data-ms-dup');
      const src = PCD.store.getFromTable('menus', id); if (!src) return;
      const copy = PCD.clone(src); delete copy.id; delete copy.updatedAt; copy.name = (src.name || t('ms_default_menu')) + ' ' + t('ms_copy_suffix');
      PCD.store.upsertInTable('menus', copy, 'm'); renderList();
      if (PCD.toast) PCD.toast.success(t('ms_copied'));
    });
    PCD.on(_view, 'click', '[data-ms-del]', function (e) {
      e.stopPropagation(); const id = this.getAttribute('data-ms-del');
      PCD.modal.confirm({ title: t('ms_del_title'), text: t('ms_del_text'), okText: t('ms_delete') }).then(function (ok) { if (!ok) return; PCD.store.deleteFromTable('menus', id); renderList(); });
    });
    let _rsz = null; window.addEventListener('resize', function () { clearTimeout(_rsz); _rsz = setTimeout(sizeThumbs, 150); });
  }

  // Site stiline uygun isim modalı (native prompt YERİNE)
  function askName(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const body = PCD.el('div');
      body.innerHTML = '<label style="display:block;font-size:13px;color:var(--text-2);margin-bottom:6px;">' + esc(opts.label || t('ms_menu_name')) + '</label>' +
        '<input type="text" id="msNameInput" class="input" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '" style="width:100%;">' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;"><button type="button" class="btn btn-ghost" id="msNameCancel">' + esc(t('ms_cancel')) + '</button><button type="button" class="btn btn-primary" id="msNameOk">' + esc(opts.okText || t('ms_ok')) + '</button></div>';
      const m = PCD.modal.open({ title: opts.title || t('ms_new_title'), body: body, size: 'sm', closable: true });
      const inp = body.querySelector('#msNameInput');
      let done = false;
      function finish(val) { if (done) return; done = true; try { m.close(); } catch (e) {} resolve(val); }
      body.querySelector('#msNameOk').addEventListener('click', function () { finish(inp.value); });
      body.querySelector('#msNameCancel').addEventListener('click', function () { finish(null); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(inp.value); } });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 120);
    });
  }

  function createNew() {
    askName({ title: t('ms_new_title'), label: t('ms_menu_name'), placeholder: t('ms_menu_name_ph'), okText: t('ms_create') }).then(function (name) {
      if (name == null) return;
      name = (name || '').trim() || t('ms_default_menu');
      const rec = PCD.store.upsertInTable('menus', { name: name, sections: [], studio: tplBlank(name) }, 'm');
      if (rec && rec.id) openDesign(rec.id);
    });
  }

  function openDesign(id) {
    const menu = PCD.store.getFromTable('menus', id);
    if (!menu) { if (PCD.toast) PCD.toast.error(t('ms_menu_not_found')); return; }
    currentId = id; currentMenu = PCD.clone(menu); selectedId = null;
    if (currentMenu.studio) { design = currentMenu.studio; normalizeDesign(design); renderEditor(); return; }
    const hasClassic = (currentMenu.sections || []).some(function (s) { return (s.items || []).length; });
    if (hasClassic) { design = importFromClassic(currentMenu); }
    else { design = tplBlank(currentMenu.name); }
    normalizeDesign(design);
    renderEditor();
  }

  // ================= EDİTÖR =================
  function renderEditor() {
    normalizeDesign(design);
    _view.innerHTML =
      '<style>' +
      '.ms-wrap{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start;}@media(max-width:900px){.ms-wrap{grid-template-columns:1fr;}}' +
      '.ms-viewport{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;overflow:hidden;min-height:200px;}' +
      '.ms-page{box-shadow:0 8px 30px rgba(0,0,0,.15);box-sizing:border-box;}' +
      '.ms-block{cursor:pointer;border-radius:4px;outline:1px dashed rgba(127,127,127,.4);outline-offset:2px;transition:outline-color .12s,outline-width .12s;}' +
      '.ms-block:hover{outline:2px solid var(--brand-500,#22c55e);outline-offset:2px;}' +
      '.ms-inspector{position:sticky;top:12px;max-height:calc(100vh - 90px);overflow:auto;padding-right:2px;}' +
      '.ms-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:13px;margin-bottom:12px;}' +
      '.ms-card-title{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3);margin-bottom:10px;}' +
      '.ms-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(34,197,94,.14);color:var(--brand-700,#15803d);border:1px solid var(--brand-500,#22c55e);border-radius:999px;padding:3px 11px;font-weight:700;font-size:12px;}' +
      '.ms-layer{display:flex;align-items:center;gap:8px;border:1.5px solid var(--brand-500,#22c55e);border-radius:9px;padding:7px 8px;margin-bottom:7px;cursor:pointer;background:var(--surface);transition:.12s;}' +
      '.ms-layer:hover{background:var(--surface-2);}' +
      '.ms-layer.sel{background:rgba(34,197,94,.12);box-shadow:0 0 0 1px var(--brand-500,#22c55e);}' +
      '.ms-layer.dragover{border-style:dashed;background:rgba(34,197,94,.08);}' +
      '.ms-layer-grip{color:var(--text-3);cursor:grab;font-size:13px;}' +
      '.ms-layer-ico{width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(34,197,94,.14);color:var(--brand-700,#15803d);border-radius:6px;font-weight:800;font-size:13px;flex-shrink:0;}' +
      '.ms-layer-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600;}' +
      '.ms-layer-del{border:0;background:none;color:var(--text-3);cursor:pointer;font-size:13px;padding:2px 5px;border-radius:5px;}' +
      '.ms-layer-del:hover{color:var(--danger,#dc2626);background:var(--surface-2);}' +
      '.ms-addbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}' +
      '.ms-addbar-label{font-size:12px;color:var(--text-3);font-weight:700;margin-right:2px;}' +
      '.ms-addbtn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface);border-radius:9px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:.12s;color:var(--text);}' +
      '.ms-addbtn:hover{border-color:var(--brand-500,#22c55e);background:var(--surface-2);transform:translateY(-1px);}' +
      '.ms-addbtn-ico{width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(34,197,94,.14);color:var(--brand-700,#15803d);border-radius:6px;font-weight:800;font-size:13px;}' +
      '</style>' +
      '<div class="page-header"><div class="page-header-text"><div class="page-title" style="display:flex;align-items:center;gap:8px;"><input id="msName" class="input" value="' + esc(currentMenu.name || '') + '" style="font-size:18px;font-weight:800;max-width:280px;"></div>' +
        '<div class="page-subtitle" id="msStats" style="font-size:12px;"></div></div>' +
        '<div class="page-header-actions"><button class="btn btn-outline btn-sm" id="msBack">' + esc(t('ms_back_library')) + '</button><button class="btn btn-outline btn-sm" id="msPageBtn">🎨 ' + esc(t('ms_page')) + '</button><button class="btn btn-outline btn-sm" id="msTemplatesHdr">' + (PCD.icon ? PCD.icon('grid', 14) : '') + ' ' + esc(t('ms_templates')) + '</button><button class="btn btn-outline btn-sm" id="msShare">' + (PCD.icon ? PCD.icon('share', 14) : '') + ' ' + esc(t('ms_share')) + '</button><button class="btn btn-primary btn-sm" id="msPrint">' + (PCD.icon ? PCD.icon('print', 14) : '') + ' ' + esc(t('ms_print')) + '</button></div></div>' +
      '<div class="ms-addbar"><span class="ms-addbar-label">' + esc(t('ms_add_block')) + '</span>' +
        addBtnHtml('heading') + addBtnHtml('text') + addBtnHtml('section') + addBtnHtml('image') + addBtnHtml('divider') + addBtnHtml('spacer') + '</div>' +
      '<div class="ms-wrap"><div class="ms-viewport" id="msViewport"><div class="ms-page" id="msPage"></div></div><div class="ms-inspector" id="msInspector"></div></div>';

    viewportEl = PCD.$('#msViewport', _view); pageScaleEl = PCD.$('#msPage', _view); inspectorEl = PCD.$('#msInspector', _view);
    refreshPage(); renderInspector();

    // kanvas: tıkla-seç + sürükle-bırak (delegation, kalıcı)
    PCD.on(pageScaleEl, 'click', '.ms-block', function (e) { e.stopPropagation(); openBlockEditor(this.getAttribute('data-bid')); });
    pageScaleEl.addEventListener('dragstart', function (e) { const blk = e.target.closest && e.target.closest('.ms-block'); if (blk) { canvasDragId = blk.getAttribute('data-bid'); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; } });
    pageScaleEl.addEventListener('dragover', function (e) { if (e.target.closest && e.target.closest('.ms-block')) e.preventDefault(); });
    pageScaleEl.addEventListener('drop', function (e) { const blk = e.target.closest && e.target.closest('.ms-block'); if (blk && canvasDragId) { e.preventDefault(); reorderBlocks(canvasDragId, blk.getAttribute('data-bid')); } });

    _view.querySelectorAll('[data-add]').forEach(function (el) { el.addEventListener('click', function () { addBlock(el.getAttribute('data-add')); }); });
    PCD.$('#msBack', _view).addEventListener('click', function () { clearTimeout(_saveTimer); if (currentMenu) { currentMenu.studio = design; try { PCD.store.upsertInTable('menus', currentMenu, 'm'); } catch (e) {} } currentId = null; currentMenu = null; renderList(); });
    PCD.$('#msTemplatesHdr', _view).addEventListener('click', openTemplates);
    var _pgBtn = PCD.$('#msPageBtn', _view); if (_pgBtn) _pgBtn.addEventListener('click', openPageSettings);
    PCD.$('#msShare', _view).addEventListener('click', openShare);
    PCD.$('#msPrint', _view).addEventListener('click', function () { PCD.print(buildPrintHtml(), currentMenu.name || 'Menu'); });
    const nm = PCD.$('#msName', _view); if (nm) nm.addEventListener('input', function () { currentMenu.name = nm.value; saveSoon(); });
    let _rsz = null; window.addEventListener('resize', function () { clearTimeout(_rsz); _rsz = setTimeout(applyScale, 120); });
  }
  function addBtnHtml(type) {
    const meta = BLOCK_META[type] || { glyph: '+' };
    return '<button class="ms-addbtn" data-add="' + type + '"><span class="ms-addbtn-ico">' + meta.glyph + '</span>' + esc(blockTypeLabel(type)) + '</button>';
  }

  // ================= ANA RENDER =================
  function render(view) {
    ensureFonts(document);
    _view = view;
    if (currentId && currentMenu) { design = currentMenu.studio; normalizeDesign(design); renderEditor(); }
    else renderList();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menuStudio = { render: render, renderShareDoc: renderShareDoc };
  // 'menus' route bu aracı yükler; i18n canlı dil değişiminde currentView()='menus'
  // ile PCD.tools['menus']'i arar → alias olmadan editör anlık çevrilmez.
  PCD.tools.menus = PCD.tools.menuStudio;
})();
