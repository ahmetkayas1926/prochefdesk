/* ================================================================
   ProChefDesk — menus.js
   Menu Builder (v2.8.68 / v2.8.69 — full builder):
   - 4 themes (fine-dining, modern bistro, cafe, minimalist)
   - 6 accent colour overrides
   - Logo + optional cover photo (1:1, v2.8.67 cropper)
   - 1-column or 2-column layout
   - Page size: A4 / A5 / US Letter / Landscape A4
   - Multiple sections (Appetizer, Main, Dessert, etc.)
   - Drag-to-reorder sections + items
   - Per-item: description, price override, dietary auto-badge,
     special badge (chef pick / signature / new / spicy)
   - Quick-insert legal notices (VAT, service, allergen disclaimer)
   - Duplicate menu from list (variant workflow)
   - Revenue + avg margin stats
   - Print + share link + QR
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.8.68 — 4 themes. Each theme defines font + accent + section divider style.
  // After selecting a theme, the chef can override the accent colour (PALETTES).
  // This config is read at print/preview build time.
  const THEMES = {
    fine_dining: {
      labelKey: 'menu_theme_fine_dining',
      titleFont: '"Cormorant Garamond", Georgia, serif',
      bodyFont: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      bodyWeight: 300,
      titleWeight: 500,
      itemWeight: 600,
      accent: '#c5a572',           // gold default
      bg: '#ffffff',
      ink: '#111111',
      mutedInk: '#666666',
      sectionTransform: 'uppercase',
      sectionLetterSpacing: '0.18em',
      sectionDecor: 'lines',       // small accent lines flanking section title
      titleLetterSpacing: '0.02em',
    },
    modern_bistro: {
      labelKey: 'menu_theme_modern_bistro',
      titleFont: '"Playfair Display", Georgia, serif',
      bodyFont: '"Inter", -apple-system, sans-serif',
      bodyWeight: 400,
      titleWeight: 700,
      itemWeight: 700,
      accent: '#c2410c',           // burnt orange
      bg: '#fffaf5',
      ink: '#1a1a1a',
      mutedInk: '#7a6b5d',
      sectionTransform: 'none',
      sectionLetterSpacing: '0',
      sectionDecor: 'underline',
      titleLetterSpacing: '-0.01em',
    },
    cafe: {
      labelKey: 'menu_theme_cafe',
      titleFont: '"Caveat", "Brush Script MT", cursive',
      bodyFont: '"Nunito", -apple-system, sans-serif',
      bodyWeight: 400,
      titleWeight: 700,
      itemWeight: 700,
      accent: '#b45309',           // warm amber
      bg: '#fdf6e3',
      ink: '#3a2e1f',
      mutedInk: '#8a7355',
      sectionTransform: 'none',
      sectionLetterSpacing: '0',
      sectionDecor: 'wavy',
      titleLetterSpacing: '0',
    },
    minimalist: {
      labelKey: 'menu_theme_minimalist',
      titleFont: '"Inter", -apple-system, sans-serif',
      bodyFont: '"Inter", -apple-system, sans-serif',
      bodyWeight: 400,
      titleWeight: 800,
      itemWeight: 600,
      accent: '#111111',           // black
      bg: '#ffffff',
      ink: '#0a0a0a',
      mutedInk: '#666666',
      sectionTransform: 'uppercase',
      sectionLetterSpacing: '0.16em',
      sectionDecor: 'none',
      titleLetterSpacing: '-0.02em',
    },
  };

  // 6 preset colours — override the theme accent. If left empty
  // (data.accentColor undefined) the theme default accent is used.
  const PALETTES = [
    // Dark / saturated
    { id: 'gold',    label: 'Gold',       color: '#c5a572' },
    { id: 'burgundy',label: 'Burgundy',   color: '#8b1a1a' },
    { id: 'navy',    label: 'Navy',       color: '#1e3a5f' },
    { id: 'forest',  label: 'Forest',     color: '#2d5016' },
    { id: 'black',   label: 'Black',      color: '#111111' },
    { id: 'choco',   label: 'Chocolate',  color: '#5c2c0f' },
    // Light / pastel
    { id: 'cream',   label: 'Cream',      color: '#c8a96e' },
    { id: 'sage',    label: 'Sage',       color: '#7a9e7e' },
    { id: 'blush',   label: 'Blush',      color: '#c47c8a' },
    { id: 'slate',   label: 'Slate',      color: '#607d8b' },
    { id: 'dustrose',label: 'Dust Rose',  color: '#b07080' },
    { id: 'olive',   label: 'Olive',      color: '#8a8a4a' },
  ];

  // Per-item special badges. Yok / chef_pick / signature / new / spicy.
  // Small coloured chip shown next to item name in print.
  const ITEM_BADGES = [
    { id: '',           labelKey: 'menu_badge_none',      icon: '',  color: '' },
    { id: 'chef_pick',  labelKey: 'menu_badge_chef_pick', icon: '★', color: '#c5a572' },
    { id: 'signature',  labelKey: 'menu_badge_signature', icon: '✦', color: '#8b1a1a' },
    { id: 'new',        labelKey: 'menu_badge_new',       icon: '◆', color: '#2d5016' },
    { id: 'spicy',      labelKey: 'menu_badge_spicy',     icon: '🌶', color: '#c2410c' },
  ];

  // v2.14.1 — Manual diet + allergen letter codes. Chef selects per item
  // (no auto-detection → works for items without recipes, avoids false "gluten free"
  // claims). Rule: lowercase = diet/suitability, UPPERCASE = "contains"
  // allergen warning. Shown next to dish name as "(gf) (gfo) (N)"; legend below.
  // `id` = stored unique key, `code` = text shown on menu.
  const MENU_CODES = [
    // Diet / suitability (lowercase)
    { id: 'v',   code: 'v',   group: 'diet',     labelKey: 'menu_code_v' },
    { id: 'vo',  code: 'vo',  group: 'diet',     labelKey: 'menu_code_vo' },
    { id: 'vg',  code: 'vg',  group: 'diet',     labelKey: 'menu_code_vg' },
    { id: 'vgo', code: 'vgo', group: 'diet',     labelKey: 'menu_code_vgo' },
    { id: 'gf',  code: 'gf',  group: 'diet',     labelKey: 'menu_code_gf' },
    { id: 'gfo', code: 'gfo', group: 'diet',     labelKey: 'menu_code_gfo' },
    { id: 'df',  code: 'df',  group: 'diet',     labelKey: 'menu_code_df' },
    { id: 'dfo', code: 'dfo', group: 'diet',     labelKey: 'menu_code_dfo' },
    { id: 'nf',  code: 'nf',  group: 'diet',     labelKey: 'menu_code_nf' },
    { id: 'h',   code: 'h',   group: 'diet',     labelKey: 'menu_code_h' },
    // Allergen "contains" (UPPERCASE)
    { id: 'a_n',  code: 'N',  group: 'allergen', labelKey: 'menu_code_a_n' },
    { id: 'a_g',  code: 'G',  group: 'allergen', labelKey: 'menu_code_a_g' },
    { id: 'a_d',  code: 'D',  group: 'allergen', labelKey: 'menu_code_a_d' },
    { id: 'a_e',  code: 'E',  group: 'allergen', labelKey: 'menu_code_a_e' },
    { id: 'a_f',  code: 'F',  group: 'allergen', labelKey: 'menu_code_a_f' },
    { id: 'a_sf', code: 'SF', group: 'allergen', labelKey: 'menu_code_a_sf' },
    { id: 'a_s',  code: 'S',  group: 'allergen', labelKey: 'menu_code_a_s' },
    { id: 'a_se', code: 'SE', group: 'allergen', labelKey: 'menu_code_a_se' },
  ];

  // v2.15.4 — Auto-show allergens on recipe menu items.
  // allergens-db EU key → menu "contains" code (a_*). recipeAllergens() comes
  // from allergen tags manually added to recipe ingredients by the chef
  // (no name-based detection — v2.8.37). If a menu item is linked to a recipe
  // these codes appear automatically; ORIGINAL RECIPE IS NOT MODIFIED (read only).
  // Diet codes (v/vg/gf/df…) cannot be reliably derived → remain manual.
  const ALLERGEN_KEY_TO_CODE = {
    gluten: 'a_g', nuts: 'a_n', peanuts: 'a_n', dairy: 'a_d', eggs: 'a_e',
    fish: 'a_f', crustaceans: 'a_sf', molluscs: 'a_sf', soybeans: 'a_s', sesame: 'a_se',
  };
  function autoAllergenCodeIds(it) {
    if (!it || !it.recipeId || !PCD.allergensDB || !PCD.allergensDB.recipeAllergens) return [];
    const r = PCD.store && PCD.store.getRecipe ? PCD.store.getRecipe(it.recipeId) : null;
    if (!r) return [];
    let ings = [];
    try { ings = (PCD.store && PCD.store.listIngredients) ? PCD.store.listIngredients() : []; } catch (e) { ings = []; }
    const keys = PCD.allergensDB.recipeAllergens(r, ings) || [];
    const out = [];
    keys.forEach(function (k) {
      const id = ALLERGEN_KEY_TO_CODE[k];
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }
  // Combined codes for display: manual (it.codes) ∪ auto allergens from recipe.
  function displayCodeIds(it) {
    const manual = Array.isArray(it.codes) ? it.codes : [];
    const merged = manual.slice();
    autoAllergenCodeIds(it).forEach(function (id) { if (merged.indexOf(id) < 0) merged.push(id); });
    return merged;
  }

  // v2.18 — Page size removed. Orientation only: portrait / landscape.
  // User selects A4/Letter in Chrome print dialog.
  const PAGE_SIZES = [
    { id: 'portrait',  labelKey: 'menu_page_portrait',  cssSize: 'A4',           orientation: 'portrait',  previewW: 595, previewH: 842 },
    { id: 'landscape', labelKey: 'menu_page_landscape', cssSize: 'A4 landscape', orientation: 'landscape', previewW: 842, previewH: 595 },
  ];

  // Quick-insert legal note templates. Added to footer with one click.
  function getLegalTemplates() {
    const t = PCD.i18n.t;
    return [
      { id: 'vat',      label: t('menu_legal_vat')      || 'Prices include VAT',         text: t('menu_legal_vat_text')      || 'All prices include VAT.' },
      { id: 'service',  label: t('menu_legal_service')  || '10% service charge',         text: t('menu_legal_service_text')  || '10% service charge added to all bills.' },
      { id: 'allergen', label: t('menu_legal_allergen') || 'Allergen disclaimer',        text: t('menu_legal_allergen_text') || 'Please inform staff of any allergies before ordering.' },
    ];
  }

  function resolveAccent(menu) {
    const theme = THEMES[menu.theme] || THEMES.fine_dining;
    if (menu.accentColor) {
      const p = PALETTES.find(function (x) { return x.id === menu.accentColor; });
      if (p) return p.color;
    }
    return theme.accent;
  }

  // v2.17 — Ink (text) colour: falls back to theme default if no user selection.
  function resolveInk(menu) {
    const theme = THEMES[menu.theme] || THEMES.fine_dining;
    if (menu.inkColor) return menu.inkColor;
    return theme.ink;
  }

  // v2.17 — Background colour: falls back to theme default if no user selection.
  function resolveBg(menu) {
    const theme = THEMES[menu.theme] || THEMES.fine_dining;
    if (menu.bgColor) return menu.bgColor;
    return theme.bg;
  }

  // v2.17 — Muted ink: use theme mutedInk; if ink is overridden apply rgba 60% opacity.
  function resolveMutedInk(menu) {
    const theme = THEMES[menu.theme] || THEMES.fine_dining;
    if (menu.inkColor) {
      // hex → rgba %60
      var h = menu.inkColor.replace('#','');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
      return 'rgba(' + r + ',' + g + ',' + b + ',0.6)';
    }
    return theme.mutedInk;
  }

  // Localized default section names — built at call time so the chef's
  // current language is used when creating a new menu.
  function getDefaultSections() {
    const t = PCD.i18n.t;
    return [
      { id: null, name: t('menu_default_appetizers'), items: [] },
      { id: null, name: t('menu_default_mains'),      items: [] },
      { id: null, name: t('menu_default_desserts'),   items: [] },
    ];
  }

  function render(view) {
    const t = PCD.i18n.t;
    const menus = PCD.store.listTable('menus').sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('menus_title')}</div>
          <div class="page-subtitle">${menus.length} ${menus.length === 1 ? 'menu' : 'menus'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newMenuBtn">+ ${t('new_menu')}</button>
        </div>
      </div>
      <div id="menuList"></div>
    `;

    const listEl = PCD.$('#menuList', view);
    if (menus.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-title">${t('no_menus_yet')}</div>
          <div class="empty-desc">${t('no_menus_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewMenu">+ ${t('new_menu')}</button></div>
        </div>
      `;
      const b = PCD.$('#emptyNewMenu', listEl);
      if (b) b.addEventListener('click', function () { openEditor(); });
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      menus.forEach(function (m) {
        const totalItems = (m.sections || []).reduce(function (a, s) { return a + ((s.items || []).length); }, 0);
        const row = PCD.el('div', { class: 'list-item', 'data-mid': m.id });
        row.innerHTML = `
          <div class="list-item-thumb">📋</div>
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(m.name || t('untitled'))}</div>
            <div class="list-item-meta">
              <span>${(m.sections || []).length} ${t('menu_sections').toLowerCase()}</span>
              <span>·</span>
              <span>${totalItems} ${t('recipes').toLowerCase()}</span>
              <span>·</span>
              <span>${PCD.fmtRelTime(m.updatedAt)}</span>
            </div>
          </div>
          <button class="icon-btn" data-dup-mid="${m.id}" title="${PCD.escapeHtml(t('menu_duplicate') || 'Duplicate')}">${PCD.icon('copy', 18)}</button>
          <button class="icon-btn" data-copy-mid="${m.id}" data-name="${PCD.escapeHtml(m.name || 'menu')}" title="Copy to workspace">${PCD.icon('truck', 18)}</button>
          <button class="icon-btn" data-edit-mid="${m.id}" title="${PCD.escapeHtml(t('edit_menu_tooltip'))}">${PCD.icon('edit', 18)}</button>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newMenuBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-mid]', function (e) {
      // If user clicked the inline edit/delete/duplicate icon let those handlers fire
      if (e.target.closest('[data-edit-mid]') || e.target.closest('[data-del-mid]') || e.target.closest('[data-copy-mid]') || e.target.closest('[data-dup-mid]')) return;
      openPrintView(this.getAttribute('data-mid'));
    });
    PCD.on(listEl, 'click', '[data-edit-mid]', function (e) {
      e.stopPropagation();
      openEditor(this.getAttribute('data-edit-mid'));
    });
    PCD.on(listEl, 'click', '[data-copy-mid]', function (e) {
      e.stopPropagation();
      const mid = this.getAttribute('data-copy-mid');
      const name = this.getAttribute('data-name');
      PCD.openCopyToWorkspace('menus', mid, name);
    });
    // v2.8.68 — Menu duplicate. Recipes/Checklist pattern: clone data,
    // strip id/createdAt, append "(Copy)" to name, regenerate section/item ids,
    // open editor on the new copy. Seasonal variant / Sunday special workflow.
    PCD.on(listEl, 'click', '[data-dup-mid]', function (e) {
      e.stopPropagation();
      const mid = this.getAttribute('data-dup-mid');
      const src = PCD.store.getFromTable('menus', mid);
      if (!src) return;
      const copy = PCD.clone(src);
      delete copy.id; delete copy.createdAt; delete copy.updatedAt;
      copy.name = (copy.name || t('untitled')) + ' (Copy)';
      // Regenerate section + item ids so drag-drop / edit doesn't collide
      (copy.sections || []).forEach(function (s) {
        s.id = PCD.uid('sec');
        (s.items || []).forEach(function (it) { it.id = PCD.uid('mi'); });
      });
      const saved = PCD.store.upsertInTable('menus', copy, 'm');
      PCD.toast.success(t('menu_duplicated') || 'Menu duplicated');
      render(view);
      setTimeout(function () { openEditor(saved.id); }, 200);
    });
  }

  // ============ EDITOR ============
  function openEditor(mid) {
    const t = PCD.i18n.t;
    const existing = mid ? PCD.store.getFromTable('menus', mid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '',
      subtitle: '',
      footer: '',
      hidePrices: false,
      hideAllergens: false,
      theme: 'fine_dining',        // v2.8.68 — theme picker default
      accentColor: '',             // v2.8.68 — '' = theme default
      inkColor: '',                // v2.17 — '' = theme default ink
      bgColor: '',                 // v2.17 — '' = theme default bg
      columns: 1,                  // v2.8.69 — 1 or 2 print columns
      pageSize: 'portrait',         // v2.18 — portrait | landscape
      logo: null,                  // v2.8.69 — base64 (1:1 cropped)
      coverPhoto: null,            // v2.8.69 — base64 (cropped)
      coverRatio: '16/9',          // v2.16 — aspect ratio for cover photo
      sections: getDefaultSections().map(function (s) {
        return { id: PCD.uid('sec'), name: s.name, items: [] };
      }),
    };
    // v2.8.68 — Defensive: set defaults for new fields on legacy menus.
    if (!data.theme) data.theme = 'fine_dining';
    if (typeof data.accentColor !== 'string') data.accentColor = '';
    if (typeof data.columns !== 'number') data.columns = 1;
    // v2.18: migrate legacy a4/a5/us_letter/a4_land → portrait/landscape
    if (!data.pageSize || ['a4','a5','us_letter'].indexOf(data.pageSize) >= 0) data.pageSize = 'portrait';
    if (data.pageSize === 'a4_land') data.pageSize = 'landscape';
    if (!data.coverRatio) data.coverRatio = '16/9';
    if (typeof data.inkColor !== 'string') data.inkColor = '';
    if (typeof data.bgColor !== 'string') data.bgColor = '';
    if (!data.priceStyle) data.priceStyle = data.hidePrices ? 'hidden' : 'symbol';
    // v2.18 — New print opts (backward compat defaults)
    if (!data.printFontSize)    data.printFontSize    = 'medium';
    if (!data.printMargin)      data.printMargin      = 'medium';
    if (!data.printLineSpacing) data.printLineSpacing = 'normal';
    if (!data.printSecSpacing)  data.printSecSpacing  = 'normal';
    if (!data.printLogoSize)    data.printLogoSize    = 'medium';
    // Ensure existing sections have IDs
    (data.sections || []).forEach(function (s) {
      if (!s.id) s.id = PCD.uid('sec');
      (s.items || []).forEach(function (it) {
        if (!it.id) it.id = PCD.uid('mi');
        if (typeof it.badge !== 'string') it.badge = '';
        if (!Array.isArray(it.codes)) it.codes = [];
      });
    });

    const body = PCD.el('div');

    function computeStats() {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      let totalRevenue = 0, marginSum = 0, marginCount = 0;
      (data.sections || []).forEach(function (s) {
        (s.items || []).forEach(function (it) {
          const r = recipeMap[it.recipeId];
          if (!r) return;
          const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r.salePrice || 0);
          totalRevenue += price;
          if (price > 0) {
            const cost = PCD.recipes.computeFoodCost(r, ingMap) / (r.servings || 1);
            const margin = ((price - cost) / price) * 100;
            marginSum += margin;
            marginCount++;
          }
        });
      });
      return {
        totalRevenue: totalRevenue,
        avgMargin: marginCount > 0 ? marginSum / marginCount : null,
      };
    }

    function render() {
      const stats = computeStats();
      // v2.8.68/v2.8.69 — Builder UI: Identity + Design + Layout + Sections + Footer/Toggles
      const themeBtns = Object.keys(THEMES).map(function (k) {
        const th = THEMES[k];
        const active = (data.theme || 'fine_dining') === k;
        return '<button type="button" class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '" data-theme="' + k + '" style="flex:1;min-width:130px;">' + PCD.escapeHtml(t(th.labelKey) || k) + '</button>';
      }).join('');
      const accentSwatches = '<button type="button" data-accent="" class="' + ((!data.accentColor) ? 'pcd-swatch-active' : '') + '" title="' + PCD.escapeHtml(t('menu_accent_default') || 'Theme default') + '" style="width:28px;height:28px;border-radius:50%;border:2px solid ' + ((!data.accentColor) ? 'var(--brand-600)' : 'var(--border)') + ';background:linear-gradient(135deg,#fff 50%,#999 50%);cursor:pointer;"></button>' +
        PALETTES.map(function (p) {
          const active = data.accentColor === p.id;
          return '<button type="button" data-accent="' + p.id + '" title="' + PCD.escapeHtml(p.label) + '" style="width:28px;height:28px;border-radius:50%;border:2px solid ' + (active ? 'var(--brand-600)' : 'var(--border)') + ';background:' + p.color + ';cursor:pointer;' + (active ? 'box-shadow:0 0 0 2px var(--brand-200);' : '') + '"></button>';
        }).join('');

      // v2.17 — Text colour selector (dark tones + theme default)
      const INK_OPTIONS = [
        { id: '', label: 'Theme default', color: null },
        { id: '#111111', label: 'Black',        color: '#111111' },
        { id: '#1a1a2e', label: 'Dark Navy',    color: '#1a1a2e' },
        { id: '#3a2e1f', label: 'Dark Brown',   color: '#3a2e1f' },
        { id: '#2d3436', label: 'Charcoal',     color: '#2d3436' },
        { id: '#4a4a4a', label: 'Soft Black',   color: '#4a4a4a' },
        { id: '#ffffff', label: 'White',         color: '#ffffff', border: '#ccc' },
      ];
      const inkSwatches = INK_OPTIONS.map(function (o) {
        const active = (data.inkColor || '') === o.id;
        const bg = o.color ? o.color : 'linear-gradient(135deg,#fff 50%,#999 50%)';
        return '<button type="button" data-ink="' + o.id + '" title="' + PCD.escapeHtml(o.label) + '" style="width:28px;height:28px;border-radius:50%;border:2px solid ' + (active ? 'var(--brand-600)' : (o.border || 'var(--border)')) + ';background:' + bg + ';cursor:pointer;' + (active ? 'box-shadow:0 0 0 2px var(--brand-200);' : '') + '"></button>';
      }).join('');

      // v2.17 — Background colour selector (light/soft tones + theme default)
      const BG_OPTIONS = [
        { id: '', label: 'Theme default', color: null },
        { id: '#ffffff', label: 'White',          color: '#ffffff', border: '#ddd' },
        { id: '#fffaf5', label: 'Warm White',      color: '#fffaf5', border: '#ddd' },
        { id: '#fdf6e3', label: 'Cream',           color: '#fdf6e3', border: '#ddd' },
        { id: '#f5f0eb', label: 'Linen',           color: '#f5f0eb', border: '#ddd' },
        { id: '#f0f4f0', label: 'Soft Sage',       color: '#f0f4f0', border: '#ddd' },
        { id: '#fdf0f3', label: 'Blush',           color: '#fdf0f3', border: '#ddd' },
        { id: '#f0f2f5', label: 'Ice Blue',        color: '#f0f2f5', border: '#ddd' },
        { id: '#1a1a1a', label: 'Black',            color: '#1a1a1a' },
        { id: '#1a1a2e', label: 'Dark Navy',        color: '#1a1a2e' },
        { id: '#2d1b0e', label: 'Dark Espresso',    color: '#2d1b0e' },
      ];
      const bgSwatches = BG_OPTIONS.map(function (o) {
        const active = (data.bgColor || '') === o.id;
        const bg = o.color ? o.color : 'linear-gradient(135deg,#fff 50%,#999 50%)';
        return '<button type="button" data-bg="' + o.id + '" title="' + PCD.escapeHtml(o.label) + '" style="width:28px;height:28px;border-radius:50%;border:2px solid ' + (active ? 'var(--brand-600)' : (o.border || 'var(--border)')) + ';background:' + bg + ';cursor:pointer;' + (active ? 'box-shadow:0 0 0 2px var(--brand-200);' : '') + '"></button>';
      }).join('');
      const colsBtns = '<button type="button" class="btn btn-sm ' + (data.columns === 1 ? 'btn-primary' : 'btn-outline') + '" data-cols="1" style="flex:1;">1 ' + (t('menu_column') || 'column') + '</button>' +
                       '<button type="button" class="btn btn-sm ' + (data.columns === 2 ? 'btn-primary' : 'btn-outline') + '" data-cols="2" style="flex:1;">2 ' + (t('menu_columns') || 'columns') + '</button>';
      // v2.18 — Portrait / Landscape buttons
      const orientBtns = PAGE_SIZES.map(function (ps) {
        const active = (data.pageSize || 'portrait') === ps.id;
        const icon = ps.id === 'portrait' ? '▯' : '▭';
        const label = ps.id === 'portrait' ? (t('menu_page_portrait') || 'Portrait') : (t('menu_page_landscape') || 'Landscape');
        return '<button type="button" class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '" data-pagesize="' + ps.id + '" style="flex:1;">' + icon + ' ' + PCD.escapeHtml(label) + '</button>';
      }).join('');
      // Logo + cover photo preview tiles (1:1, v2.8.67 standard)
      const logoTile = '<div id="menuLogoZone" style="position:relative;width:90px;height:90px;border-radius:var(--r-md);background:' + (data.logo ? 'url(' + data.logo + ') center/cover' : 'var(--surface-2)') + ';border:2px dashed ' + (data.logo ? 'transparent' : 'var(--border-strong)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">' +
        (!data.logo ? '<div class="text-center text-muted" style="font-size:11px;">📷<br>' + PCD.escapeHtml(t('menu_logo') || 'Logo') + '</div>' : '') +
        (data.logo ? '<button type="button" id="menuLogoRemove" class="icon-btn" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;width:20px;height:20px;padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>' : '') +
      '</div>';
      // v2.16.8: cover tile — fixed width 240px, height auto from aspect-ratio.
      // flex:1 removed to prevent overflow when container is wide.
      const coverTile = '<div id="menuCoverZone" style="position:relative;width:240px;aspect-ratio:' + (data.coverRatio || '16/9') + ';border-radius:var(--r-md);background:' + (data.coverPhoto ? 'url(' + data.coverPhoto + ') center/cover no-repeat' : 'var(--surface-2)') + ';border:2px dashed ' + (data.coverPhoto ? 'transparent' : 'var(--border-strong)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">' +
        (!data.coverPhoto ? '<div class="text-center text-muted" style="font-size:11px;">🖼<br>' + PCD.escapeHtml(t('menu_cover') || 'Cover photo (optional)') + '</div>' : '') +
        (data.coverPhoto ? '<button type="button" id="menuCoverRemove" class="icon-btn" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;width:22px;height:22px;padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>' : '') +
        (data.coverPhoto ? '<div style="position:absolute;bottom:4px;left:6px;font-size:10px;color:rgba(255,255,255,0.85);background:rgba(0,0,0,0.4);padding:1px 6px;border-radius:3px;font-weight:600;">' + (data.coverRatio || '16/9').replace('/', ':') + '</div>' : '') +
      '</div>';
      // v2.16.3 — Print size controls moved to preview modal (refreshPreview).
      // Editor shows logo + cover tile only.

      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('menu_name')} *</label>
          <input type="text" class="input" id="menuName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('menu_name_placeholder')}">
        </div>
        <div class="field">
          <label class="field-label">${t('menu_subtitle_ph')}</label>
          <input type="text" class="input" id="menuSubtitle" value="${PCD.escapeHtml(data.subtitle || '')}">
        </div>

        <details class="field" open style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;background:var(--surface-2);">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-2);">🎨 ${PCD.escapeHtml(t('menu_design') || 'Design')}</summary>
          <div style="margin-top:10px;">
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_theme') || 'Theme')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${themeBtns}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_accent') || 'Accent colour')}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">${accentSwatches}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_text_color') || 'Text colour')}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">${inkSwatches}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_bg_color') || 'Background colour')}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">${bgSwatches}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_branding') || 'Logo + cover')}</div>
            <div style="display:flex;gap:8px;align-items:stretch;">${logoTile}${coverTile}</div>
          </div>
        </details>

        <details class="field" style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;background:var(--surface-2);">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-2);">📐 ${PCD.escapeHtml(t('menu_layout') || 'Layout & paper')}</summary>
          <div style="margin-top:10px;">
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_orientation') || 'Orientation')}</div>
            <div style="display:flex;gap:6px;margin-bottom:12px;">${orientBtns}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_columns_label') || 'Columns')}</div>
            <div style="display:flex;gap:6px;margin-bottom:0;">${colsBtns}</div>
          </div>
        </details>

        <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);">
          <div class="flex items-center justify-between">
            <div>
              <div class="stat-label">${t('menu_total_revenue')}</div>
              <div style="font-size:20px;font-weight:800;">${PCD.fmtMoney(stats.totalRevenue)}</div>
            </div>
            ${stats.avgMargin !== null ? '<div style="text-align:right;"><div class="stat-label">' + t('menu_avg_margin') + '</div><div style="font-size:20px;font-weight:800;color:' + (stats.avgMargin >= 65 ? 'var(--success)' : (stats.avgMargin >= 55 ? 'var(--warning)' : 'var(--danger)')) + ';">' + PCD.fmtPercent(stats.avgMargin, 0) + '</div></div>' : ''}
          </div>
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('menu_sections')}</div>
            <button class="btn btn-outline btn-sm" id="addSectionBtn">+ ${t('menu_add_section')}</button>
          </div>
          <div id="sectionsList" class="flex flex-col gap-3"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('menu_footer_ph')}</label>
          <textarea class="textarea" id="menuFooter" rows="2" placeholder="${PCD.escapeHtml(t('menu_footer_placeholder') || 'Custom footer text (optional)')}">${PCD.escapeHtml(data.footer || '')}</textarea>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${getLegalTemplates().map(function (lg) {
              return '<button type="button" class="btn btn-ghost btn-sm" data-legal="' + lg.id + '" style="font-size:11px;">+ ' + PCD.escapeHtml(lg.label) + '</button>';
            }).join('')}
          </div>
        </div>

        <div class="field" style="margin-top:10px;">
          <label class="field-label">${PCD.escapeHtml(t('menu_price_display') || 'Price display')}</label>
          <select class="select" id="menuPriceStyle">
            <option value="symbol"${(data.priceStyle === 'symbol') ? ' selected' : ''}>${PCD.escapeHtml((t('menu_price_symbol') || 'With currency symbol ($24)').replace('$', (PCD.currencySymbol && PCD.currencySymbol()) || '$'))}</option>
            <option value="plain"${(data.priceStyle === 'plain') ? ' selected' : ''}>${PCD.escapeHtml(t('menu_price_plain') || 'Number only — no symbol (24)')}</option>
            <option value="hidden"${(data.priceStyle === 'hidden') ? ' selected' : ''}>${PCD.escapeHtml(t('menu_price_hidden') || 'Hidden')}</option>
          </select>
          <div class="field-hint">${PCD.escapeHtml(t('menu_price_hint') || 'Menus without a currency symbol nudge guests to spend a little more (Cornell study).')}</div>
        </div>
        <div class="field" style="margin-top:10px;">
          <label class="field-label">${PCD.escapeHtml(t('menu_allergen_display') || 'Diet & allergen codes')}</label>
          <select class="select" id="menuAllergenStyle">
            <option value="codes"${((data.allergenStyle || (data.hideAllergens ? 'off' : 'codes')) === 'codes') ? ' selected' : ''}>${PCD.escapeHtml(t('menu_allergen_codes') || 'Letter codes (gf, N…) + legend')}</option>
            <option value="off"${((data.allergenStyle || (data.hideAllergens ? 'off' : 'codes')) === 'off') ? ' selected' : ''}>${PCD.escapeHtml(t('menu_allergen_off') || 'Off')}</option>
          </select>
          <div class="field-hint">${PCD.escapeHtml(t('menu_allergen_info_hint') || 'Codes are shown next to each dish for guest information only. Recipe items show their allergens automatically; add any extra by tapping Codes.')}</div>
        </div>
      `;

      // Render sections
      // v2.8.56 — Drag-drop section and item reordering. Up/down buttons removed
      // ('not practical', operator feedback); 6-dot grip handle at row start.
      // Section and item handles use different CSS classes
      // (.sec-drag-handle vs .item-drag-handle) to prevent sortable conflicts.

      const secListEl = PCD.$('#sectionsList', body);
      const dragHandleSvg = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
      function makeDragHandle(extraCls) {
        return '<button type="button" class="drag-handle ' + extraCls + '" aria-label="' + PCD.escapeHtml(t('menu_drag_handle')) + '" title="' + PCD.escapeHtml(t('menu_drag_handle')) + '" style="cursor:grab;background:transparent;border:0;padding:6px 4px;color:var(--text-3);touch-action:none;flex-shrink:0;">' + dragHandleSvg + '</button>';
      }
      const sectionDragHandleHtml = makeDragHandle('sec-drag-handle');
      const itemDragHandleHtml = makeDragHandle('item-drag-handle');
      (data.sections || []).forEach(function (sec, sIdx) {
        const secEl = PCD.el('div', { class: 'card', 'data-sid': sec.id, style: { padding: '12px' } });
        secEl.innerHTML = `
          <div class="flex items-center gap-2 mb-2">
            ${sectionDragHandleHtml}
            <input type="text" class="input" data-secname value="${PCD.escapeHtml(sec.name || '')}" placeholder="${PCD.i18n.t('menu_section_name')}" style="flex:1;font-weight:600;">
            <button class="icon-btn" data-secdel title="${PCD.i18n.t('delete')}">${PCD.icon('trash',18)}</button>
          </div>
          <div class="section-items flex flex-col gap-1" data-sidx="${sIdx}"></div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-ghost btn-sm" data-addrec="${sec.id}" style="flex:1;">+ ${PCD.i18n.t('menu_add_item')}</button>
            <button class="btn btn-ghost btn-sm" data-addmanual="${sec.id}" style="flex:1;">✎ ${PCD.i18n.t('menu_add_manual') || 'Manual'}</button>
          </div>
        `;
        const itemsEl = secEl.querySelector('.section-items');
        (sec.items || []).forEach(function (it, iIdx) {
          const isManual = !it.recipeId;
          const r = it.recipeId ? PCD.store.getRecipe(it.recipeId) : null;
          const name = isManual ? (it.customName || '') : (r ? r.name : '(removed recipe)');
          const defaultPrice = r && r.salePrice ? r.salePrice : '';
          const row = PCD.el('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }
          });
          // v2.8.68 — Badge dropdown: chef pick / signature / new / spicy.
          // Small so it doesn't crowd the row; renders as a chip next to item name in print.
          const badgeOpts = ITEM_BADGES.map(function (b) {
            const sel = (it.badge || '') === b.id ? ' selected' : '';
            const lbl = (b.icon ? b.icon + ' ' : '') + (PCD.i18n.t(b.labelKey) || b.id || '—');
            return '<option value="' + b.id + '"' + sel + '>' + lbl + '</option>';
          }).join('');
          // v2.14.1 — Per-item diet/allergen code picker. Multi-select via PCD.picker;
          // selection summarised as "gf · gfo · N" on button, or "+ Codes" if empty.
          const selCodes = Array.isArray(it.codes) ? it.codes : [];
          const codesText = selCodes.length
            ? MENU_CODES.filter(function (c) { return selCodes.indexOf(c.id) >= 0; }).map(function (c) { return c.code; }).join(' · ')
            : ('+ ' + (PCD.i18n.t('menu_codes_btn') || 'Codes'));
          const codesBtnHtml = '<button type="button" class="btn btn-outline btn-sm" data-itemcodes="' + sIdx + ':' + iIdx + '" style="padding:2px 8px;min-height:24px;font-size:11px;margin-top:4px;margin-left:6px;vertical-align:top;">' + PCD.escapeHtml(codesText) + '</button>';
          // v2.15.4 — Tariften otomatik gelen alerjenler (info; orijinal recipe'e dokunmaz)
          const autoIds = autoAllergenCodeIds(it);
          const autoText = autoIds.length ? MENU_CODES.filter(function (c) { return autoIds.indexOf(c.id) >= 0; }).map(function (c) { return c.code; }).join(' ') : '';
          const autoHintHtml = autoText
            ? '<span title="' + PCD.escapeHtml(PCD.i18n.t('menu_codes_auto_hint') || 'Allergens from this recipe (automatic)') + '" style="display:inline-block;margin-top:5px;margin-left:6px;font-size:10px;font-weight:700;color:var(--text-3);vertical-align:top;">⟲ ' + PCD.escapeHtml((PCD.i18n.t('menu_codes_auto_prefix') || 'recipe:') + ' ' + autoText) + '</span>'
            : '';
          // Manual items: editable name field. Recipe items: static name.
          // v2.8.56 — Drag handle added; reorder within same section.
          if (isManual) {
            row.innerHTML = `
              ${itemDragHandleHtml}
              <div style="flex:1;min-width:0;">
                <input type="text" class="input" data-itemname="${sIdx}:${iIdx}" value="${PCD.escapeHtml(name)}" placeholder="${PCD.i18n.t('menu_item_name_ph') || 'Dish name'}" style="padding:4px 8px;min-height:26px;font-size:14px;font-weight:600;">
                <input type="text" class="input" data-itemdesc="${sIdx}:${iIdx}" value="${PCD.escapeHtml(it.description || '')}" placeholder="${PCD.i18n.t('menu_item_desc_ph')}" style="padding:4px 8px;min-height:26px;font-size:12px;margin-top:4px;">
                <select class="select" data-itembadge="${sIdx}:${iIdx}" style="padding:2px 6px;min-height:24px;font-size:11px;margin-top:4px;max-width:160px;">${badgeOpts}</select>${codesBtnHtml}${autoHintHtml}
              </div>
              <input type="number" class="input" data-itemprice="${sIdx}:${iIdx}" value="${it.price || ''}" placeholder="0" step="0.01" min="0" style="width:70px;padding:4px 8px;min-height:26px;font-size:13px;">
              <button class="icon-btn" data-itemdel="${sIdx}:${iIdx}">${PCD.icon('x',14)}</button>
            `;
          } else {
            row.innerHTML = `
              ${itemDragHandleHtml}
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${PCD.escapeHtml(name)}</div>
                <input type="text" class="input" data-itemdesc="${sIdx}:${iIdx}" value="${PCD.escapeHtml(it.description || '')}" placeholder="${PCD.i18n.t('menu_item_desc_ph')}" style="padding:4px 8px;min-height:26px;font-size:12px;margin-top:4px;">
                <select class="select" data-itembadge="${sIdx}:${iIdx}" style="padding:2px 6px;min-height:24px;font-size:11px;margin-top:4px;max-width:160px;">${badgeOpts}</select>${codesBtnHtml}${autoHintHtml}
              </div>
              <input type="number" class="input" data-itemprice="${sIdx}:${iIdx}" value="${it.price || defaultPrice}" placeholder="${defaultPrice}" step="0.01" min="0" style="width:70px;padding:4px 8px;min-height:26px;font-size:13px;">
              <button class="icon-btn" data-itemdel="${sIdx}:${iIdx}">${PCD.icon('x',14)}</button>
            `;
          }
          itemsEl.appendChild(row);
        });
        // v2.8.56 — Per-section item drag-drop sortable (by item handle)
        if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
          PCD.dragdrop.makeSortable(itemsEl, {
            handle: '.item-drag-handle',
            onEnd: function (oldIndex, newIndex) {
              if (oldIndex === newIndex) return;
              if (!sec.items) return;
              const moved = sec.items[oldIndex];
              sec.items.splice(oldIndex, 1);
              sec.items.splice(newIndex, 0, moved);
              render();  // full render required for section reindex
            }
          });
        }
        secListEl.appendChild(secEl);
      });

      // v2.8.56 — Sections seviyesi drag-drop sortable (sadece section handle)
      if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
        PCD.dragdrop.makeSortable(secListEl, {
          handle: '.sec-drag-handle',
          itemSelector: '[data-sid]',
          onEnd: function (oldIndex, newIndex) {
            if (oldIndex === newIndex) return;
            const moved = data.sections[oldIndex];
            data.sections.splice(oldIndex, 1);
            data.sections.splice(newIndex, 0, moved);
            render();
          }
        });
      }

      wire();
    }

    function wire() {
      // Name / subtitle / footer / hide-price
      PCD.$('#menuName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#menuSubtitle', body).addEventListener('input', function () { data.subtitle = this.value; });
      PCD.$('#menuFooter', body).addEventListener('input', function () { data.footer = this.value; });
      const priceStyleEl = PCD.$('#menuPriceStyle', body);
      if (priceStyleEl) priceStyleEl.addEventListener('change', function () {
        data.priceStyle = this.value;
        data.hidePrices = (this.value === 'hidden'); // back-compat: eski bayrak senkron
        render();
      });
      const allergStyleEl = PCD.$('#menuAllergenStyle', body);
      if (allergStyleEl) allergStyleEl.addEventListener('change', function () {
        data.allergenStyle = this.value;
        data.hideAllergens = (this.value === 'off'); // back-compat: eski bayrak senkron
        render();
      });

      // v2.8.68 — Theme picker
      PCD.on(body, 'click', '[data-theme]', function () {
        data.theme = this.getAttribute('data-theme');
        render();
      });
      // Accent color swatches
      PCD.on(body, 'click', '[data-accent]', function () {
        data.accentColor = this.getAttribute('data-accent');
        render();
      });
      // v2.17 — Text colour handler
      PCD.on(body, 'click', '[data-ink]', function (e) {
        e.stopPropagation();
        data.inkColor = this.getAttribute('data-ink');
        render();
      });
      // v2.17 — Arka plan rengi handler
      PCD.on(body, 'click', '[data-bg]', function (e) {
        e.stopPropagation();
        data.bgColor = this.getAttribute('data-bg');
        render();
      });
      // v2.8.69 — Columns + page size
      PCD.on(body, 'click', '[data-cols]', function () {
        data.columns = parseInt(this.getAttribute('data-cols'), 10) === 2 ? 2 : 1;
        render();
      });
      PCD.on(body, 'click', '[data-pagesize]', function () {
        data.pageSize = this.getAttribute('data-pagesize');
        render();
      });
      // v2.8.69 — Logo + cover upload (uses v2.8.67 1:1 cropper)
      function pickAndCrop(onDone) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.addEventListener('change', function (e) {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = function (ev) {
            if (PCD.cropper && PCD.cropper.open) {
              PCD.cropper.open(ev.target.result).then(function (cropped) {
                if (cropped) onDone(cropped);
              });
            } else {
              onDone(ev.target.result);
            }
          };
          reader.readAsDataURL(f);
        });
        inp.click();
      }
      // v2.16.2 — Cover photo flow: pick ratio via inline modal first,
      // then open file picker, then open cropper with the chosen ratio.
      // Bypasses the 1:1 lock in PCD.cropper by passing aspectRatio option.
      function pickAndCropCover(onDone) {
        const RATIOS_COVER = [
          { label: '2:1',  value: '2/1',  desc: 'Cinematic — wide panoramic banner' },
          { label: '3:1',  value: '3/1',  desc: 'Ultra-wide — full-width hero strip' },
          { label: '21:9', value: '21/9', desc: 'Ultrawide cinema — cinematic widescreen' },
          { label: '16:9', value: '16/9', desc: 'Widescreen — best for landscape photos' },
          { label: '3:2',  value: '3/2',  desc: 'Classic — versatile, slightly wider' },
          { label: '4:3',  value: '4/3',  desc: 'Standard — balanced, good for portraits' },
          { label: '1:1',  value: '1/1',  desc: 'Square — symmetrical, social-media style' },
        ];
        // Build ratio picker UI
        const pickerBody = PCD.el('div');
        pickerBody.innerHTML =
          '<p style="font-size:13px;color:var(--text-2);margin:0 0 14px;">Choose the crop ratio for your cover photo before selecting the image.</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
          RATIOS_COVER.map(function(r) {
            const isDefault = r.value === (data.coverRatio || '16/9');
            return '<button type="button" data-pick-ratio="' + r.value + '" style="' +
              'padding:12px 10px;border-radius:var(--r-md);border:2px solid ' + (isDefault ? 'var(--brand)' : 'var(--border)') + ';' +
              'background:' + (isDefault ? 'var(--brand-50,#f0fdf4)' : 'var(--surface-1)') + ';' +
              'cursor:pointer;text-align:left;">' +
              '<div style="font-weight:700;font-size:16px;color:' + (isDefault ? 'var(--brand)' : 'var(--text-1)') + ';margin-bottom:3px;">' + r.label + '</div>' +
              '<div style="font-size:11px;color:var(--text-3);">' + r.desc + '</div>' +
            '</button>';
          }).join('') +
          '</div>';

        const cancelRatioBtn = PCD.el('button', { class: 'btn btn-secondary', text: (PCD.i18n.t && PCD.i18n.t('cancel')) || 'Cancel' });
        const ratioFooter = PCD.el('div');
        ratioFooter.appendChild(cancelRatioBtn);

        const ratioModal = PCD.modal.open({
          title: (PCD.i18n.t && PCD.i18n.t('menu_cover_pick_ratio')) || 'Cover photo ratio',
          body: pickerBody,
          footer: ratioFooter,
          size: 'sm',
          closable: true,
          onClose: function() {}
        });

        cancelRatioBtn.addEventListener('click', function() { ratioModal.close(); });

        PCD.on(pickerBody, 'click', '[data-pick-ratio]', function() {
          const chosenRatio = this.getAttribute('data-pick-ratio');
          ratioModal.close();
          // Save ratio immediately so tile badge updates after crop
          data.coverRatio = chosenRatio;
          // Now open file picker
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*';
          inp.addEventListener('change', function(e) {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
              if (PCD.cropper && PCD.cropper.open) {
                const parts = chosenRatio.split('/');
                const ar = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : 16 / 9;
                PCD.cropper.open(ev.target.result, { aspectRatio: ar }).then(function(cropped) {
                  if (cropped) onDone(cropped);
                });
              } else {
                onDone(ev.target.result);
              }
            };
            reader.readAsDataURL(f);
          });
          inp.click();
        });
      }
      const logoZone = PCD.$('#menuLogoZone', body);
      if (logoZone) logoZone.addEventListener('click', function (e) {
        if (e.target.closest('#menuLogoRemove')) return;
        pickAndCrop(function (url) { data.logo = url; render(); });
      });
      const logoRemove = PCD.$('#menuLogoRemove', body);
      if (logoRemove) logoRemove.addEventListener('click', function (e) {
        e.stopPropagation();
        data.logo = null; render();
      });
      const coverZone = PCD.$('#menuCoverZone', body);
      if (coverZone) coverZone.addEventListener('click', function (e) {
        if (e.target.closest('#menuCoverRemove')) return;
        // v2.16.2: ratio chosen inside pickAndCropCover flow
        pickAndCropCover(function (url) { data.coverPhoto = url; render(); });
      });
      const coverRemove = PCD.$('#menuCoverRemove', body);
      if (coverRemove) coverRemove.addEventListener('click', function (e) {
        e.stopPropagation();
        data.coverPhoto = null; render();
      });
      // v2.8.68 — Legal note quick-insert
      PCD.on(body, 'click', '[data-legal]', function () {
        const id = this.getAttribute('data-legal');
        const lg = getLegalTemplates().find(function (x) { return x.id === id; });
        if (!lg) return;
        const cur = (data.footer || '').trim();
        if (cur.indexOf(lg.text) >= 0) {
          PCD.toast && PCD.toast.warning && PCD.toast.warning(t('menu_legal_already') || 'Already added');
          return;
        }
        data.footer = cur ? (cur + '\n' + lg.text) : lg.text;
        const fEl = PCD.$('#menuFooter', body);
        if (fEl) fEl.value = data.footer;
      });
      // v2.8.68 — Item badge dropdown
      PCD.on(body, 'change', '[data-itembadge]', function () {
        const parts = this.getAttribute('data-itembadge').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].badge = this.value;
        }
      });

      // v2.14.1 — Per-item diet/allergen code picker (PCD.picker multi-select)
      PCD.on(body, 'click', '[data-itemcodes]', function () {
        const parts = this.getAttribute('data-itemcodes').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        const sec = data.sections[sIdx];
        const it = sec && sec.items[iIdx];
        if (!it) return;
        const autoIdsP = autoAllergenCodeIds(it);
        const pickerItems = MENU_CODES.map(function (c) {
          const isAuto = autoIdsP.indexOf(c.id) >= 0;
          return {
            id: c.id,
            name: '(' + c.code + ')  ' + (PCD.i18n.t(c.labelKey) || c.id) + (isAuto ? '  ⟲' : ''),
            meta: (isAuto ? (PCD.i18n.t('menu_codes_auto_meta') || 'Auto from recipe') + ' · ' : '') + (c.group === 'diet'
              ? (PCD.i18n.t('menu_codes_group_diet') || 'Dietary / suitability')
              : (PCD.i18n.t('menu_codes_group_allergen') || 'Allergen — contains')),
          };
        });
        PCD.picker.open({
          title: (PCD.i18n.t('menu_codes_picker_title') || 'Diet & allergen codes') + (autoIdsP.length ? '  ·  ⟲ ' + MENU_CODES.filter(function (c) { return autoIdsP.indexOf(c.id) >= 0; }).map(function (c) { return c.code; }).join(' ') : ''),
          items: pickerItems, multi: true,
          selected: Array.isArray(it.codes) ? it.codes : [],
        }).then(function (sel) {
          if (!sel) return;
          it.codes = MENU_CODES.filter(function (c) { return sel.indexOf(c.id) >= 0; }).map(function (c) { return c.id; });
          render();
        });
      });

      // Section name
      PCD.on(body, 'input', '[data-secname]', PCD.debounce(function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (sec) sec.name = this.value;
      }, 300));

      // NOTE: data-secup / data-secdown handlers removed (v2.16.1).
      // Section reordering handled by PCD.dragdrop.makeSortable (sec-drag-handle).

      PCD.on(body, 'click', '[data-secdel]', function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: t('confirm_delete'), text: t('section') + '?',
          okText: t('delete')
        }).then(function (ok) {
          if (!ok) return;
          data.sections = data.sections.filter(function (s) { return s.id !== sid; });
          render();
        });
      });

      // Add section
      PCD.$('#addSectionBtn', body).addEventListener('click', function () {
        data.sections.push({ id: PCD.uid('sec'), name: t('section'), items: [] });
        render();
      });

      // Add recipe to section
      PCD.on(body, 'click', '[data-addrec]', function () {
        const sid = this.getAttribute('data-addrec');
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: t(r.category || 'cat_main') + (r.salePrice ? ' · ' + PCD.fmtMoney(r.salePrice) : ''), thumb: r.photo || '' };
        });
        if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet')); return; }
        const sec = data.sections.find(function (s) { return s.id === sid; });
        const selected = (sec.items || []).filter(function (it) { return it.recipeId; }).map(function (it) { return it.recipeId; });
        PCD.picker.open({
          title: t('menu_add_item'),
          items: items, multi: true, selected: selected,
        }).then(function (selIds) {
          if (!selIds) return;
          // Keep existing recipe items, update set. Manual items preserved separately.
          const existingByRecipe = {};
          const manualItems = [];
          (sec.items || []).forEach(function (it) {
            if (it.recipeId) existingByRecipe[it.recipeId] = it;
            else manualItems.push(it);
          });
          const newRecipeItems = selIds.map(function (id) {
            if (existingByRecipe[id]) return existingByRecipe[id];
            return { id: PCD.uid('mi'), recipeId: id, description: '', price: null };
          });
          sec.items = newRecipeItems.concat(manualItems);
          render();
        });
      });

      // Manual item: add blank line that chef fills in directly
      PCD.on(body, 'click', '[data-addmanual]', function () {
        const sid = this.getAttribute('data-addmanual');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (!sec) return;
        sec.items = (sec.items || []).concat([{
          id: PCD.uid('mi'),
          recipeId: null,
          customName: '',
          description: '',
          price: null,
        }]);
        render();
        // Focus the new name input
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-itemname]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50);
      });

      // Manual item name input
      PCD.on(body, 'input', '[data-itemname]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemname').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].customName = this.value;
        }
      }, 300));

      // Item description
      PCD.on(body, 'input', '[data-itemdesc]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemdesc').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].description = this.value;
        }
      }, 300));

      // Item price
      PCD.on(body, 'input', '[data-itemprice]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemprice').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].price = this.value === '' ? null : parseFloat(this.value);
          render();
        }
      }, 400));

      // Item delete
      PCD.on(body, 'click', '[data-itemdel]', function () {
        const parts = this.getAttribute('data-itemdel').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx]) {
          data.sections[sIdx].items.splice(iIdx, 1);
          render();
        }
      });
    }

    render();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const previewBtn = PCD.el('button', { class: 'btn btn-outline' });
    previewBtn.innerHTML = PCD.icon('print',16) + ' ' + t('menu_preview');
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(previewBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : t('new_menu'),
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('menus', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'menus' && v && PCD.tools.menus && PCD.tools.menus.render) PCD.tools.menus.render(v);
      });
    });
    previewBtn.addEventListener('click', function () {
      data.name = (PCD.$('#menuName', body).value || '').trim() || t('untitled');
      const saved = existing
        ? PCD.store.upsertInTable('menus', Object.assign({}, existing, data), 'm')
        : PCD.store.upsertInTable('menus', data, 'm');
      if (existing) existing.id = saved.id; // keep reference stable
      m.close();
      setTimeout(function () { openPrintView(saved.id); }, 280);
    });
    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#menuName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(t('menu_name') + ' ' + t('required')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('menus', data, 'm');
      PCD.toast.success(t('menu_saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        // Always re-render the list view if we're on (or coming back to) the menus page.
        // BUG FIX (v2.6.34): inner render() shadows outer page-level render().
        // Use the public tool API which is unambiguous.
        const cur = (PCD.router && PCD.router.currentView && PCD.router.currentView()) || '';
        if (cur === 'menus' || (location.hash && location.hash.indexOf('menus') >= 0) || !cur) {
          if (v && PCD.tools.menus && PCD.tools.menus.render) PCD.tools.menus.render(v);
        }
      }, 200);
    });
  }

  // ============ PRINT VIEW ============
  function openPrintView(mid) {
    const t = PCD.i18n.t;
    const menu = PCD.store.getFromTable('menus', mid);
    if (!menu) return;

    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

    // v2.8.68 — Resolve theme + accent
    const theme = THEMES[menu.theme] || THEMES.fine_dining;
    const accent = resolveAccent(menu);

    // v2.8.68 — Item special badge (chef pick / signature / new / spicy)
    function itemBadge(it) {
      if (!it.badge) return '';
      const b = ITEM_BADGES.find(function (x) { return x.id === it.badge; });
      if (!b) return '';
      // v2.13.9 — Spicy: text label instead of emoji (🌶) — more professional,
      // readable by guests. Other badges remain typographic glyphs (★ ✦ ◆).
      const isText = (b.id === 'spicy');
      const content = isText ? (PCD.i18n.t('menu_badge_spicy') || 'Spicy').toUpperCase() : b.icon;
      if (!content) return '';
      const extra = isText ? 'font-size:9px;letter-spacing:0.1em;font-weight:700;' : '';
      return ' <span class="m-itembadge" style="background:' + b.color + '20;color:' + b.color + ';border:1px solid ' + b.color + '60;' + extra + '">' + PCD.escapeHtml(content) + '</span>';
    }

    // v2.15.4 — Allergen/diet codes are INFO ONLY (not warnings/filters/restrictions).
    // A legacy "allergen-safe print" filter that hid non-matching items was removed →
    // conceptually wrong + "dish disappeared" bug. All items always print.
    // Code display: lowercase = diet/suitability (manual), UPPERCASE = "contains"
    // allergen (auto from recipe + manual). allergenStyle: 'codes' (show) | 'off'.
    const allergenStyle = menu.allergenStyle || (menu.hideAllergens ? 'off' : 'codes');
    // v2.14.5 — Price display style: symbol ($24) | plain (24, no symbol) | hidden
    const priceStyle = menu.priceStyle || (menu.hidePrices ? 'hidden' : 'symbol');
    function plainPrice(p) { const n = Number(p); return (n % 1 === 0) ? String(n) : n.toFixed(2); }
    const showAllergens = allergenStyle === 'codes';
    const usedCodes = {}; // id → true (codes used on menu; for legend)

    // Build sections HTML using a simple, professional layout
    let sectionsBody = '';
    (menu.sections || []).forEach(function (sec) {
      if (!sec.items || sec.items.length === 0) return;
      // v2.15.4 — Filter removed: all valid items (with name / active recipe) always shown.
      const visibleItems = (sec.items || []).filter(function (it) {
        if (it.recipeId) return !!recipeMap[it.recipeId];
        return !!(it.customName || '').trim();
      });
      if (!visibleItems.length) return; // skip empty sections
      sectionsBody += '<div class="m-section">';
      sectionsBody += '<div class="m-section-title">' + PCD.escapeHtml(sec.name || '') + '</div>';
      sectionsBody += '<div class="m-items">';
      visibleItems.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const isManual = !it.recipeId;
        const itemName = isManual ? (it.customName || '') : (r ? r.name : '(removed)');
        const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r && r.salePrice ? r.salePrice : 0);
        const desc = it.description || (r && r.plating) || '';

        // v2.15.4 — Displayed codes = manual (it.codes) ∪ auto allergens from recipe.
        // Shown next to dish name as "(gf) (gfo) (N)". Info only.
        let allergenCodes = '';
        if (showAllergens) {
          const ids = displayCodeIds(it);
          if (ids.length) {
            const parts = [];
            MENU_CODES.forEach(function (c) {
              if (ids.indexOf(c.id) >= 0) { parts.push('(' + c.code + ')'); usedCodes[c.id] = true; }
            });
            if (parts.length) {
              allergenCodes = '<span class="m-codes">' + parts.join(' ') + '</span>';
            }
          }
        }

        sectionsBody += '<div class="m-item">';
        sectionsBody += '<div class="m-item-row"><div class="m-item-name">' + PCD.escapeHtml(itemName) + itemBadge(it) + allergenCodes + '</div>';
        if (priceStyle !== 'hidden' && price > 0) {
          sectionsBody += '<div class="m-item-leader"></div>';
          sectionsBody += '<div class="m-item-price">' + (priceStyle === 'plain' ? PCD.escapeHtml(plainPrice(price)) : PCD.fmtMoney(price)) + '</div>';
        }
        sectionsBody += '</div>';
        if (desc) sectionsBody += '<div class="m-item-desc">' + PCD.escapeHtml(desc) + '</div>';
        sectionsBody += '</div>';
      });
      sectionsBody += '</div></div>';
    });

    // v2.14.1 — Code legend: explains codes used on the menu (registry order: diet → allergen).
    let allergenLegendHtml = '';
    if (showAllergens) {
      const usedList = MENU_CODES.filter(function (c) { return usedCodes[c.id]; });
      if (usedList.length) {
        allergenLegendHtml = '<div class="m-allergen-legend"><span class="m-leg-title">' +
          PCD.escapeHtml(t('menu_allergen_legend') || 'Key') + '</span> ' +
          usedList.map(function (c) { return '<span class="m-leg-item"><b>' + PCD.escapeHtml(c.code) + '</b> ' + PCD.escapeHtml(t(c.labelKey) || c.id) + '</span>'; }).join(' &nbsp;·&nbsp; ') +
        '</div>';
      }
    }

    // v2.18 — New print opts system: 5 independent controls
    // Font size: xsmall/small/medium/large/xlarge
    // Margin: very_narrow/narrow/medium/wide
    // Line spacing: tight/normal/spacious
    // Section gap: tight/normal/spacious
    // Logo size: small/medium/large
    function resolvePrintOpts(menu) {
      // Font size → pt
      const fontMap = { xsmall: 8, small: 10, medium: 12, large: 14, xlarge: 16 };
      const itemPt   = fontMap[menu.printFontSize] || 12;
      const titlePt  = Math.round(itemPt * 2.4);   // title ratio fixed
      const secPt    = Math.round(itemPt * 1.4);   // section ratio fixed
      // Margin → pt
      const marginMap = { very_narrow: 18, narrow: 26, medium: 36, wide: 50 };
      const paddingPt = marginMap[menu.printMargin] || 36;
      // Line spacing → pt (item gap)
      const lineMap = { tight: Math.round(itemPt*0.5), normal: Math.round(itemPt*0.9), spacious: Math.round(itemPt*1.4) };
      const itemGapPt = lineMap[menu.printLineSpacing] || Math.round(itemPt*0.9);
      // Section gap → multiplier
      const secMap = { tight: 1.2, normal: 1.8, spacious: 2.8 };
      const secMult = secMap[menu.printSecSpacing] || 1.8;
      // Logo size → pt
      const logoMap = { small: 44, medium: 64, large: 88 };
      const logoPt = logoMap[menu.printLogoSize] || 64;
      return { itemPt, titlePt, secPt, paddingPt, itemGapPt, secMult, logoPt };
    }
    const PO = resolvePrintOpts(menu);

    function buildStyledHtml() {
      const O = PO; // v2.18: PO = resolvePrintOpts(menu)
      // v2.18 — Orientation: portrait=595pt, landscape=842pt
      const pageSpec = PAGE_SIZES.find(function (p) { return p.id === (menu.pageSize || 'portrait'); }) || PAGE_SIZES[0];
      // pageMaxWidth: portrait=595pt, landscape=842pt
      const pageMaxWidth = pageSpec.previewW || 595;
      // Multi-column layout
      const cols = (menu.columns === 2) ? 2 : 1;
      // Section decoration helpers (theme-specific)
      const decorBefore = (theme.sectionDecor === 'lines')
        ? '.m-section-title::before,.m-section-title::after{content:"";display:inline-block;width:24px;height:1px;background:' + accent + ';vertical-align:middle;margin:0 16px;}'
        : (theme.sectionDecor === 'underline')
          ? '.m-section-title{border-bottom:2px solid ' + accent + ';padding-bottom:6px;display:inline-block;padding-left:24px;padding-right:24px;}'
          : (theme.sectionDecor === 'wavy')
            ? '.m-section-title::after{content:"~";display:block;color:' + accent + ';font-size:1.4em;line-height:0.4;margin-top:6px;}'
            : '';
      return (
      '<style>' +
        '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Caveat:wght@400;600;700&family=Inter:wght@300;400;500;600;700;800&family=Nunito:wght@300;400;500;600;700&display=swap");' +
        '@page { size: ' + pageSpec.cssSize + '; margin: 0; }' +
        // v2.17: ink and bg can be overridden by user selection
        '.m-page {' +
          'background: ' + resolveBg(menu) + '; color: ' + resolveInk(menu) + ';' +
          'max-width: ' + pageMaxWidth + 'pt; margin: 0 auto; padding: ' + O.paddingPt + 'pt ' + (O.paddingPt + 6) + 'pt;' +
          'font-family: ' + theme.bodyFont + ';' +
          'font-weight: ' + theme.bodyWeight + ';' +
        '}' +
        // v2.16.4: screen preview — height mirrors coverHeight, aspect-ratio removed.
        // object-fit:contain → full image always visible, never clipped.
        (function(){
          var hMap = {'25mm':'95px','40mm':'151px','60mm':'227px'};
          var screenH = hMap[menu.coverHeight] || '151px';
          return '.m-cover { width: 100%; height: ' + screenH + '; max-height: ' + screenH + '; aspect-ratio: unset; max-width: 100%; margin: 0 0 ' + Math.round(O.paddingPt * 0.5) + 'px; object-fit: contain; display: block; border-radius: 6px; background: transparent; }';
        })() +
        '.m-logo { display:block; width: ' + O.logoPt + 'pt; height: ' + O.logoPt + 'pt; margin: 0 auto 12px; object-fit: cover; border-radius: 50%; }' +
        '.m-page { overflow-x: hidden; }' +
        '.m-header { text-align: center; margin-bottom: ' + Math.round(O.paddingPt * 0.75) + 'pt; padding-bottom: 0; }' +
        '.m-title {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.titlePt + 'pt; font-weight: ' + theme.titleWeight + ';' +
          'letter-spacing: ' + theme.titleLetterSpacing + ';' +
          'margin: 0 0 8px; color: ' + resolveInk(menu) + ';' +
          'line-height: 1.1;' +
        '}' +
        '.m-subtitle {' +
          'font-size: 11px; color: ' + resolveMutedInk(menu) + ';' +
          'letter-spacing: 0.24em;' +
          'text-transform: uppercase; font-weight: 400;' +
          'margin-bottom: 24px;' +
        '}' +
        '.m-divider {' +
          'width: 60px; height: 1px;' +
          'background: ' + accent + ';' +
          'margin: 18px auto 0;' +
        '}' +
        '.m-sections { ' + (cols === 2 ? 'column-count: 2; column-gap: ' + (O.paddingPt * 0.7) + 'pt;' : '') + ' }' +
        '.m-section { margin: ' + Math.round(O.itemGapPt * O.secMult) + 'pt 0 ' + Math.round(O.itemGapPt * (O.secMult * 0.8)) + 'pt; break-inside: avoid; page-break-inside: avoid; }' +
        '.m-section-title {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.secPt + 'pt; font-weight: ' + theme.titleWeight + ';' +
          'letter-spacing: ' + theme.sectionLetterSpacing + ';' +
          'text-transform: ' + theme.sectionTransform + ';' +
          'text-align: center;' +
          'color: ' + resolveInk(menu) + ';' +
          'margin: 0 0 ' + Math.round(O.itemGapPt * 1.3) + 'pt;' +
          'position: relative;' +
        '}' +
        decorBefore +
        '.m-items { display: flex; flex-direction: column; gap: ' + O.itemGapPt + 'pt; }' +
        '.m-item { break-inside: avoid; page-break-inside: avoid; }' +
        '.m-item-row { display: flex; align-items: baseline; gap: 0; overflow: hidden; }' +
        '.m-item-name {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.itemPt + 'pt; font-weight: ' + theme.itemWeight + ';' +
          'color: ' + resolveInk(menu) + ';' +
          'letter-spacing: 0.02em;' +
          'flex-shrink: 1;' +
          'min-width: 0;' +
          'overflow-wrap: break-word;' +
          'word-break: break-word;' +
        '}' +
        '.m-allerg {' +
          'font-size: 0.6em;' +
          'font-weight: 600;' +
          'margin-inline-start: 3px;' +
          'color: ' + resolveMutedInk(menu) + ';' +
          'letter-spacing: 0.04em;' +
        '}' +
        '.m-codes {' +
          'font-family: ' + theme.bodyFont + ';' +
          'font-size: 0.56em;' +
          'font-weight: 600;' +
          'margin-inline-start: 6px;' +
          'color: ' + resolveMutedInk(menu) + ';' +
          'letter-spacing: 0.02em;' +
          'white-space: nowrap;' +
          'vertical-align: middle;' +
        '}' +
        '.m-allergen-legend {' +
          'margin-top: 30px; padding-top: 14px;' +
          'border-top: 1px solid ' + accent + '33;' +
          'font-size: 11px; color: ' + resolveMutedInk(menu) + ';' +
          'line-height: 1.9; text-align: center; font-weight: 400;' +
        '}' +
        '.m-allergen-legend .m-leg-title {' +
          'text-transform: uppercase; letter-spacing: 0.14em;' +
          'font-weight: 600; margin-inline-end: 6px; color: ' + resolveInk(menu) + ';' +
        '}' +
        '.m-allergen-legend b { font-weight: 700; color: ' + resolveInk(menu) + '; }' +
        '.m-itembadge {' +
          'font-size: 10px;' +
          'font-weight: 700;' +
          'padding: 1px 6px;' +
          'border-radius: 4px;' +
          'margin-inline-start: 6px;' +
          'vertical-align: middle;' +
        '}' +
        '.m-item-leader {' +
          'flex: 1;' +
          'border-bottom: 1px dotted ' + accent + ';' +
          'margin: 0 8px 4px;' +
          'min-width: 30px;' +
          'opacity: 0.6;' +
        '}' +
        '.m-item-price {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.itemPt + 'pt; font-weight: ' + theme.itemWeight + ';' +
          'color: ' + accent + ';' +
          'flex-shrink: 0;' +
          'white-space: nowrap;' +
        '}' +
        '.m-item-desc {' +
          'font-size: ' + Math.max(9, O.itemPt - 4) + 'pt; color: ' + resolveMutedInk(menu) + ';' +
          'font-style: italic;' +
          'margin-top: 4px;' +
          'line-height: 1.5;' +
          'max-width: 90%;' +
          'font-weight: ' + theme.bodyWeight + ';' +
        '}' +
        '.m-footer {' +
          'text-align: center;' +
          'font-size: 11px; color: ' + resolveMutedInk(menu) + ';' +
          'letter-spacing: 0.12em;' +
          'text-transform: uppercase;' +
          'margin-top: 40px;' +
          'padding-top: 20px;' +
          'border-top: 1px solid ' + accent + '40;' +
          'font-weight: 400;' +
          'white-space: pre-wrap;' +
        '}' +
        // v2.18: @media print — identical CSS to screen (pt units consistent)
        '@media print {' +
          'body { margin: 0; padding: 0; background: ' + resolveBg(menu) + '; }' +
          // Force background colours and images to print (even with Background Graphics off)
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }' +
          '.m-page { max-width: ' + pageMaxWidth + 'pt; width: 100%; margin: 0 auto; box-sizing: border-box; overflow: hidden;' +
            'padding: ' + (menu.coverPhoto ? '0' : O.paddingPt) + 'pt ' + (O.paddingPt + 6) + 'pt ' + O.paddingPt + 'pt; }' +
          (menu.coverPhoto ? '.m-header { padding-top: 0; }' : '') +
          '.m-cover { height: ' + (menu.coverHeight || '40mm') + '; max-height: ' + (menu.coverHeight || '40mm') + '; width: auto; max-width: 100%; margin-left: auto; margin-right: auto; margin-bottom: ' + Math.round(O.paddingPt * 0.5) + 'pt; aspect-ratio: unset; border-radius: 0; object-fit: contain; display: block; }' +
          '.m-item-row { overflow: hidden; }' +
          '.m-item-name { flex-shrink: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word; }' +
          '.m-section { break-inside: avoid; page-break-inside: avoid; }' +
          '.m-item { break-inside: avoid; page-break-inside: avoid; }' +
        '}' +
      '</style>' +
      '<div class="m-page">' +
        '<div class="m-header">' +
          (menu.coverPhoto ? '<img class="m-cover" src="' + PCD.escapeHtml(menu.coverPhoto) + '" alt="">' : '') +
          (menu.logo ? '<img class="m-logo" src="' + PCD.escapeHtml(menu.logo) + '" alt="">' : '') +
          '<h1 class="m-title">' + PCD.escapeHtml(menu.name || t('untitled')) + '</h1>' +
          (menu.subtitle ? '<div class="m-subtitle">' + PCD.escapeHtml(menu.subtitle) + '</div>' : '') +
          '<div class="m-divider"></div>' +
        '</div>' +
        '<div class="m-sections">' + sectionsBody + '</div>' +
        allergenLegendHtml +
        (menu.footer ? '<div class="m-footer">' + PCD.escapeHtml(menu.footer) + '</div>' : '') +
      '</div>'
      );
    }

    const body = PCD.el('div');

    // v2.18 — saveOpt: update menu field, persist to store, refresh preview
    function saveOpt(key, val) {
      menu[key] = val;
      const m = PCD.store.getFromTable('menus', mid);
      if (m) { m[key] = val; PCD.store.upsertInTable('menus', m, 'm'); }
      // Update PO with fresh values
      const fresh = resolvePrintOpts(menu);
      Object.assign(PO, fresh);
      refreshPreview();
    }

    function makeOptRow(label, key, options) {
      const cur = menu[key];
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
        '<span style="font-size:11px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:0.04em;min-width:90px;">' + label + '</span>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
          options.map(function(o) {
            const active = cur ? cur === o.val : !!o.isDefault;
            return '<button class="btn btn-secondary btn-sm" data-opt-key="' + key + '" data-opt-val="' + o.val + '" style="' + (active ? 'background:var(--brand-600);color:#fff;border-color:var(--brand-600);' : '') + '">' + o.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }

    function refreshPreview() {
      const pageSpec = PAGE_SIZES.find(function(p){ return p.id === (menu.pageSize || 'portrait'); }) || PAGE_SIZES[0];
      // 1pt = 96/72px at screen DPI — render at true print dimensions then scale to fit
      var PT = 96 / 72;
      var pageWpx = Math.round(pageSpec.previewW * PT);  // portrait:793, landscape:1123
      var pageHpx = Math.round(pageSpec.previewH * PT);  // portrait:1123, landscape:793
      var areaW = 700;
      var scale = Math.round(areaW / pageWpx * 10000) / 10000;
      var scaledH = Math.round(pageHpx * scale);

      const controls =
        makeOptRow('Font', 'printFontSize', [
          {val:'xsmall',label:'XS'},{val:'small',label:'S'},{val:'medium',label:'M',isDefault:true},{val:'large',label:'L'},{val:'xlarge',label:'XL'}
        ]) +
        makeOptRow('Margin', 'printMargin', [
          {val:'very_narrow',label:'Very Narrow'},{val:'narrow',label:'Narrow'},{val:'medium',label:'Medium',isDefault:true},{val:'wide',label:'Spacious'}
        ]) +
        makeOptRow('Line Spacing', 'printLineSpacing', [
          {val:'tight',label:'Tight'},{val:'normal',label:'Normal',isDefault:true},{val:'spacious',label:'Spacious'}
        ]) +
        makeOptRow('Section Gap', 'printSecSpacing', [
          {val:'tight',label:'Tight'},{val:'normal',label:'Normal',isDefault:true},{val:'spacious',label:'Spacious'}
        ]) +
        makeOptRow('Logo', 'printLogoSize', [
          {val:'small',label:'Small'},{val:'medium',label:'Medium',isDefault:true},{val:'large',label:'Large'}
        ]) +
        (!menu.coverPhoto ? '' : makeOptRow('Cover', 'coverHeight', [
          {val:'25mm',label:'S'},{val:'40mm',label:'M',isDefault:true},{val:'60mm',label:'L'}
        ]));

      body.innerHTML =
        '<div style="margin-bottom:12px;padding:10px 14px;background:var(--surface-2);border-radius:var(--r-md);">' +
          controls +
        '</div>' +
        '<div style="background:#c8c8c8;padding:16px;">' +
          '<div style="font-size:10px;color:#888;margin-bottom:8px;letter-spacing:0.05em;">' + pageSpec.previewW + ' × ' + pageSpec.previewH + 'pt · ' + pageSpec.orientation + '</div>' +
          '<div style="width:' + areaW + 'px;height:' + scaledH + 'px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.25);margin:0 auto;">' +
            '<div style="width:' + pageWpx + 'px;height:' + pageHpx + 'px;transform:scale(' + scale + ');transform-origin:top left;overflow:hidden;background:' + resolveBg(menu) + ';">' +
              buildStyledHtml() +
            '</div>' +
          '</div>' +
        '</div>';

      PCD.on(body, 'click', '[data-opt-key]', function () {
        saveOpt(this.getAttribute('data-opt-key'), this.getAttribute('data-opt-val'));
      });
    }

    refreshPreview();

    const printBtn = PCD.el('button', { class: 'btn btn-primary' });
    printBtn.innerHTML = PCD.icon('print',16) + ' <span>' + t('print') + '</span>';
    const qrBtn = PCD.el('button', { class: 'btn btn-outline' });
    qrBtn.innerHTML = PCD.icon('grid',16) + ' <span>QR</span>';
    const shareLinkBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: PCD.i18n.t('menus_share_link_title') });
    shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>' + PCD.i18n.t('btn_share_link') + '</span>';
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(qrBtn);
    footer.appendChild(shareLinkBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: t('preview') + ' · ' + (menu.name || t('untitled')),
      body: body, footer: footer, size: 'xl', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      PCD.print(buildStyledHtml(), menu.name || 'Menu');
    });
    shareLinkBtn.addEventListener('click', function () {
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error(PCD.i18n.t('toast_sign_in_to_share'));
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error(PCD.i18n.t('toast_share_unavailable'));
        return;
      }
      shareLinkBtn.disabled = true;
      shareLinkBtn.innerHTML = '<span class="spinner"></span>';
      PCD.share.createOrGetShareUrl('menu', mid).then(function (url) {
        shareLinkBtn.disabled = false;
        shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>' + PCD.i18n.t('btn_share_link') + '</span>';
        // Show modal with the link
        const linkBody = PCD.el('div');
        linkBody.innerHTML =
          '<div class="text-muted text-sm mb-2">Copy the link below to share this menu publicly:</div>' +
          '<input type="text" id="menuShareLink" value="' + PCD.escapeHtml(url) + '" readonly style="width:100%;padding:10px;border:1.5px solid var(--brand-600);border-radius:6px;font-family:var(--font-mono);font-size:13px;background:#fff;margin-bottom:10px;">' +
          '<div class="flex gap-2">' +
            '<button type="button" class="btn btn-primary" id="copyMenuLink" style="flex:1;">' + PCD.icon('copy',16) + ' <span>Copy link</span></button>' +
            '<button type="button" class="btn btn-outline" id="waMenuLink" style="flex:1;">' + PCD.icon('message-circle',16) + ' <span>WhatsApp</span></button>' +
          '</div>';
        const lc = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close'), style: { width: '100%' } });
        const lf = PCD.el('div', { style: { width: '100%' } });
        lf.appendChild(lc);
        const lm = PCD.modal.open({ title: '🔗 Share link', body: linkBody, footer: lf, size: 'sm', closable: true });
        lc.addEventListener('click', function () { lm.close(); });
        // Auto-select
        setTimeout(function () { const inp = PCD.$('#menuShareLink', linkBody); if (inp) { inp.focus(); inp.select(); } }, 100);
        PCD.$('#copyMenuLink', linkBody).addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { PCD.toast.success(PCD.i18n.t('toast_link_copied_ok')); });
        });
        PCD.$('#waMenuLink', linkBody).addEventListener('click', function () {
          window.open('https://wa.me/?text=' + encodeURIComponent(url), '_blank');
        });
      }).catch(function (e) {
        shareLinkBtn.disabled = false;
        shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>' + PCD.i18n.t('btn_share_link') + '</span>';
        PCD.toast.error(PCD.i18n.t('toast_share_failed', { msg: e.message || e }));
      });
    });
    qrBtn.addEventListener('click', function () {
      // Generate a share URL and put THAT in the QR — so scanning opens
      // the menu in a browser, not just a wall of text.
      const t = PCD.i18n.t;
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error(t('qr_signin_required'));
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error(t('qr_share_error'));
        return;
      }
      qrBtn.disabled = true;
      const origHTML = qrBtn.innerHTML;
      qrBtn.innerHTML = '<span class="spinner"></span> ' + t('qr_generating');
      PCD.share.createOrGetShareUrl('menu', menu.id).then(function (url) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = origHTML;
        PCD.qr.show({
          title: menu.name || 'Menu',
          subtitle: t('menus_qr_subtitle'),
          text: url
        });
      }).catch(function (e) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = origHTML;
        PCD.toast.error(t('qr_share_error') + ': ' + (e.message || e));
      });
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menus = { render: render, openEditor: openEditor, openPrintView: openPrintView };
})();
