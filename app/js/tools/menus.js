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

  // v2.8.68 — 4 hazır tema. Her tema font + accent + section divider
  // stilini belirler. Şef tema seçtikten sonra accent color'ı override
  // edebilir (PALETTES). Print/preview build sırasında bu config okunur.
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

  // 6 hazır renk — tema accent'ini override eder. Şef boş bırakırsa
  // (data.accentColor undefined) tema default accent'i kullanılır.
  const PALETTES = [
    { id: 'gold',    label: 'Gold',     color: '#c5a572' },
    { id: 'burgundy',label: 'Burgundy', color: '#8b1a1a' },
    { id: 'navy',    label: 'Navy',     color: '#1e3a5f' },
    { id: 'forest',  label: 'Forest',   color: '#2d5016' },
    { id: 'black',   label: 'Black',    color: '#111111' },
    { id: 'choco',   label: 'Chocolate',color: '#5c2c0f' },
  ];

  // Per-item special badges. Yok / chef_pick / signature / new / spicy.
  // Print'te item adının yanında küçük renkli chip.
  const ITEM_BADGES = [
    { id: '',           labelKey: 'menu_badge_none',      icon: '',  color: '' },
    { id: 'chef_pick',  labelKey: 'menu_badge_chef_pick', icon: '★', color: '#c5a572' },
    { id: 'signature',  labelKey: 'menu_badge_signature', icon: '✦', color: '#8b1a1a' },
    { id: 'new',        labelKey: 'menu_badge_new',       icon: '◆', color: '#2d5016' },
    { id: 'spicy',      labelKey: 'menu_badge_spicy',     icon: '🌶', color: '#c2410c' },
  ];

  // v2.8.69 — Sayfa boyutu seçenekleri.
  const PAGE_SIZES = [
    { id: 'a4',        labelKey: 'menu_page_a4',        cssSize: 'A4',           orientation: 'portrait'  },
    { id: 'a5',        labelKey: 'menu_page_a5',        cssSize: 'A5',           orientation: 'portrait'  },
    { id: 'us_letter', labelKey: 'menu_page_us_letter', cssSize: 'letter',       orientation: 'portrait'  },
    { id: 'a4_land',   labelKey: 'menu_page_a4_land',   cssSize: 'A4 landscape', orientation: 'landscape' },
  ];

  // Quick-insert legal note templates. Footer'a tek tıkla eklenir.
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
    // open editor on the new copy. Sezonluk varyant / Sunday special akışı.
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
      hideDietary: false,          // v2.8.68 — dietary badges toggle
      theme: 'fine_dining',        // v2.8.68 — theme picker default
      accentColor: '',             // v2.8.68 — '' = theme default
      columns: 1,                  // v2.8.69 — 1 or 2 print columns
      pageSize: 'a4',              // v2.8.69 — a4 | a5 | us_letter | a4_land
      logo: null,                  // v2.8.69 — base64 (1:1 cropped)
      coverPhoto: null,            // v2.8.69 — base64 (1:1 cropped)
      sections: getDefaultSections().map(function (s) {
        return { id: PCD.uid('sec'), name: s.name, items: [] };
      }),
    };
    // v2.8.68 — Defansif: eski menüler için yeni alanların default'u
    if (!data.theme) data.theme = 'fine_dining';
    if (typeof data.accentColor !== 'string') data.accentColor = '';
    if (typeof data.columns !== 'number') data.columns = 1;
    if (!data.pageSize) data.pageSize = 'a4';
    if (typeof data.hideDietary !== 'boolean') data.hideDietary = false;
    // Ensure existing sections have IDs
    (data.sections || []).forEach(function (s) {
      if (!s.id) s.id = PCD.uid('sec');
      (s.items || []).forEach(function (it) {
        if (!it.id) it.id = PCD.uid('mi');
        if (typeof it.badge !== 'string') it.badge = '';
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
      const colsBtns = '<button type="button" class="btn btn-sm ' + (data.columns === 1 ? 'btn-primary' : 'btn-outline') + '" data-cols="1" style="flex:1;">1 ' + (t('menu_column') || 'column') + '</button>' +
                       '<button type="button" class="btn btn-sm ' + (data.columns === 2 ? 'btn-primary' : 'btn-outline') + '" data-cols="2" style="flex:1;">2 ' + (t('menu_columns') || 'columns') + '</button>';
      const pageBtns = PAGE_SIZES.map(function (ps) {
        const active = (data.pageSize || 'a4') === ps.id;
        return '<button type="button" class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '" data-pagesize="' + ps.id + '" style="flex:1;min-width:100px;">' + PCD.escapeHtml(t(ps.labelKey) || ps.id) + '</button>';
      }).join('');
      // Logo + cover photo preview tiles (1:1, v2.8.67 standard)
      const logoTile = '<div id="menuLogoZone" style="position:relative;width:90px;height:90px;border-radius:var(--r-md);background:' + (data.logo ? 'url(' + data.logo + ') center/cover' : 'var(--surface-2)') + ';border:2px dashed ' + (data.logo ? 'transparent' : 'var(--border-strong)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">' +
        (!data.logo ? '<div class="text-center text-muted" style="font-size:11px;">📷<br>' + PCD.escapeHtml(t('menu_logo') || 'Logo') + '</div>' : '') +
        (data.logo ? '<button type="button" id="menuLogoRemove" class="icon-btn" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;width:20px;height:20px;padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>' : '') +
      '</div>';
      const coverTile = '<div id="menuCoverZone" style="position:relative;flex:1;height:90px;border-radius:var(--r-md);background:' + (data.coverPhoto ? 'url(' + data.coverPhoto + ') center/cover' : 'var(--surface-2)') + ';border:2px dashed ' + (data.coverPhoto ? 'transparent' : 'var(--border-strong)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
        (!data.coverPhoto ? '<div class="text-center text-muted" style="font-size:11px;">🖼<br>' + PCD.escapeHtml(t('menu_cover') || 'Cover photo (optional)') + '</div>' : '') +
        (data.coverPhoto ? '<button type="button" id="menuCoverRemove" class="icon-btn" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;width:22px;height:22px;padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>' : '') +
      '</div>';

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
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_branding') || 'Logo + cover')}</div>
            <div style="display:flex;gap:8px;align-items:stretch;">${logoTile}${coverTile}</div>
          </div>
        </details>

        <details class="field" style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;background:var(--surface-2);">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-2);">📐 ${PCD.escapeHtml(t('menu_layout') || 'Layout & paper')}</summary>
          <div style="margin-top:10px;">
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_columns_label') || 'Columns')}</div>
            <div style="display:flex;gap:6px;margin-bottom:12px;">${colsBtns}</div>
            <div class="field-label" style="font-size:12px;">${PCD.escapeHtml(t('menu_page_size') || 'Page size')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${pageBtns}</div>
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

        <div class="checkbox">
          <input type="checkbox" id="menuHidePrice" ${data.hidePrices ? 'checked' : ''}>
          <span>${t('menu_hide_price')}</span>
        </div>
        <div class="checkbox">
          <input type="checkbox" id="menuHideAllergens" ${data.hideAllergens ? 'checked' : ''}>
          <span>${PCD.escapeHtml(t('menu_hide_allergens') || 'Hide allergen icons')}</span>
        </div>
        <div class="checkbox">
          <input type="checkbox" id="menuHideDietary" ${data.hideDietary ? 'checked' : ''}>
          <span>${PCD.escapeHtml(t('menu_hide_dietary') || 'Hide dietary badges (vegan/veg/GF)')}</span>
        </div>

        <!-- v2.8.71 — Allergen-safe print filter. Real-world: special menu
             for a coeliac event or a peanut-free childrens' birthday.
             Toggle one or more "free from" filters; the print/preview
             only includes dishes that pass. The full menu data is not
             modified — this is a print-time view only. -->
        <details class="field" style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;background:var(--surface-2);">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-2);">🛡 ${PCD.escapeHtml(t('menu_safe_print_title') || 'Allergen-safe print')}</summary>
          <div style="margin-top:10px;">
            <div class="text-muted text-sm mb-2" style="font-size:12px;">${PCD.escapeHtml(t('menu_safe_print_hint') || 'Print/preview only items free from the selected categories. Empty = show all.')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${['vegan','vegetarian','gluten','dairy','nuts','fish'].map(function (k) {
                const arr = Array.isArray(data.safePrintFilter) ? data.safePrintFilter : [];
                const active = arr.indexOf(k) >= 0;
                const labels = { vegan: '🌱 Vegan', vegetarian: '🥬 Veg', gluten: '🌾 GF', dairy: '🥛 DF', nuts: '🥜 Nut-free', fish: '🐟 Fish-free' };
                return '<button type="button" class="chip" data-safeprint="' + k + '" style="cursor:pointer;background:' + (active ? 'var(--brand-50)' : 'var(--surface)') + ';border:1px solid ' + (active ? 'var(--brand-600)' : 'var(--border-strong)') + ';color:' + (active ? 'var(--brand-700)' : 'var(--text-2)') + ';font-weight:' + (active ? '700' : '500') + ';">' + labels[k] + '</button>';
              }).join('')}
            </div>
          </div>
        </details>
      `;

      // Render sections
      // v2.8.56 — Drag-drop ile section ve item sıralama. Up/down butonları
      // ('pratik değil' operatör raporu) kaldırıldı; her satır başında
      // 6-nokta grip handle ile basılı tutup sürükle/bırak.
      // Section ve item handle'ları farklı CSS class'ları kullanır
      // (.sec-drag-handle vs .item-drag-handle) — iki sortable çakışmasın.
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
          // Aynı satırda yer almasın diye küçük; print'te item adı yanında chip olur.
          const badgeOpts = ITEM_BADGES.map(function (b) {
            const sel = (it.badge || '') === b.id ? ' selected' : '';
            const lbl = (b.icon ? b.icon + ' ' : '') + (PCD.i18n.t(b.labelKey) || b.id || '—');
            return '<option value="' + b.id + '"' + sel + '>' + lbl + '</option>';
          }).join('');
          // Manual items: editable name field. Recipe items: static name.
          // v2.8.56 — Drag handle eklendi; aynı section içinde sıralama.
          if (isManual) {
            row.innerHTML = `
              ${itemDragHandleHtml}
              <div style="flex:1;min-width:0;">
                <input type="text" class="input" data-itemname="${sIdx}:${iIdx}" value="${PCD.escapeHtml(name)}" placeholder="${PCD.i18n.t('menu_item_name_ph') || 'Dish name'}" style="padding:4px 8px;min-height:26px;font-size:14px;font-weight:600;">
                <input type="text" class="input" data-itemdesc="${sIdx}:${iIdx}" value="${PCD.escapeHtml(it.description || '')}" placeholder="${PCD.i18n.t('menu_item_desc_ph')}" style="padding:4px 8px;min-height:26px;font-size:12px;margin-top:4px;">
                <select class="select" data-itembadge="${sIdx}:${iIdx}" style="padding:2px 6px;min-height:24px;font-size:11px;margin-top:4px;max-width:160px;">${badgeOpts}</select>
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
                <select class="select" data-itembadge="${sIdx}:${iIdx}" style="padding:2px 6px;min-height:24px;font-size:11px;margin-top:4px;max-width:160px;">${badgeOpts}</select>
              </div>
              <input type="number" class="input" data-itemprice="${sIdx}:${iIdx}" value="${it.price || defaultPrice}" placeholder="${defaultPrice}" step="0.01" min="0" style="width:70px;padding:4px 8px;min-height:26px;font-size:13px;">
              <button class="icon-btn" data-itemdel="${sIdx}:${iIdx}">${PCD.icon('x',14)}</button>
            `;
          }
          itemsEl.appendChild(row);
        });
        // v2.8.56 — Section içi item drag-drop sortable (item handle'a göre)
        if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
          PCD.dragdrop.makeSortable(itemsEl, {
            handle: '.item-drag-handle',
            onEnd: function (oldIndex, newIndex) {
              if (oldIndex === newIndex) return;
              if (!sec.items) return;
              const moved = sec.items[oldIndex];
              sec.items.splice(oldIndex, 1);
              sec.items.splice(newIndex, 0, moved);
              render();  // section reindex için tam render
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
      PCD.$('#menuHidePrice', body).addEventListener('change', function () { data.hidePrices = this.checked; render(); });
      const hideAllergEl = PCD.$('#menuHideAllergens', body);
      if (hideAllergEl) hideAllergEl.addEventListener('change', function () { data.hideAllergens = this.checked; render(); });
      const hideDietEl = PCD.$('#menuHideDietary', body);
      if (hideDietEl) hideDietEl.addEventListener('change', function () { data.hideDietary = this.checked; render(); });

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
        pickAndCrop(function (url) { data.coverPhoto = url; render(); });
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
      // v2.8.71 — Safe-print filter chip toggle (multi-select; print/preview
       // filters items not satisfying ALL active "free from" categories).
      PCD.on(body, 'click', '[data-safeprint]', function () {
        const k = this.getAttribute('data-safeprint');
        if (!Array.isArray(data.safePrintFilter)) data.safePrintFilter = [];
        const i = data.safePrintFilter.indexOf(k);
        if (i >= 0) data.safePrintFilter.splice(i, 1);
        else data.safePrintFilter.push(k);
        render();
      });

      // v2.8.68 — Item badge dropdown
      PCD.on(body, 'change', '[data-itembadge]', function () {
        const parts = this.getAttribute('data-itembadge').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].badge = this.value;
        }
      });

      // Section name
      PCD.on(body, 'input', '[data-secname]', PCD.debounce(function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (sec) sec.name = this.value;
      }, 300));

      // Section delete
      PCD.on(body, 'click', '[data-secup]', function () {
        const idx = parseInt(this.getAttribute('data-secup'), 10);
        if (idx <= 0) return;
        const sections = data.sections;
        [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
        render();
      });
      PCD.on(body, 'click', '[data-secdown]', function () {
        const idx = parseInt(this.getAttribute('data-secdown'), 10);
        if (idx >= data.sections.length - 1) return;
        const sections = data.sections;
        [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
        render();
      });

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

    // v2.8.68 — Dietary badge builder (vegan/veg/GF). Uses computeDietCompat
    // from dashboard.js (added in v2.8.45). Conservative tri-state: only
    // shows badge if ALL ingredients confirmed compatible.
    function dietaryBadges(r) {
      if (menu.hideDietary || !r) return '';
      const fn = PCD.recipes && PCD.recipes.computeDietCompat;
      if (!fn) return '';
      const compat = fn(r, ingMap);
      if (!compat) return '';
      const out = [];
      if (compat.vegan === true)       out.push('<span class="m-diet" title="Vegan" style="background:#dcfce7;color:#166534;">🌱 V</span>');
      else if (compat.vegetarian === true) out.push('<span class="m-diet" title="Vegetarian" style="background:#ecfccb;color:#3f6212;">🥬 VG</span>');
      if (compat.glutenFree === true)  out.push('<span class="m-diet" title="Gluten-free" style="background:#fef3c7;color:#92400e;">🌾 GF</span>');
      return out.length ? ' ' + out.join(' ') : '';
    }

    // v2.8.68 — Item special badge (chef pick / signature / new / spicy)
    function itemBadge(it) {
      if (!it.badge) return '';
      const b = ITEM_BADGES.find(function (x) { return x.id === it.badge; });
      if (!b || !b.icon) return '';
      return ' <span class="m-itembadge" style="background:' + b.color + '20;color:' + b.color + ';border:1px solid ' + b.color + '60;">' + b.icon + '</span>';
    }

    // v2.8.71 — Safe-print filter: drop any item that fails any active "free from"
    // category. Manual items (no recipe link) cannot be diet-checked, so they
    // are excluded when ANY filter is active (chef can't certify them anyway).
    const safeFilters = Array.isArray(menu.safePrintFilter) ? menu.safePrintFilter : [];
    function itemPassesSafeFilter(it) {
      if (!safeFilters.length) return true;
      if (!it.recipeId) return false; // manual item — can't verify
      const r = recipeMap[it.recipeId];
      if (!r) return false;
      // Check diet flags via computeDietCompat (cascades sub-recipes per v2.8.69)
      const dietMap = { vegan: 'vegan', vegetarian: 'vegetarian', gluten: 'glutenFree', dairy: 'dairyFree' };
      const compat = (PCD.recipes && PCD.recipes.computeDietCompat) ? PCD.recipes.computeDietCompat(r, ingMap) : null;
      // Allergen tags via allergens-db (cascades sub-recipes per v2.8.69)
      const tags = (PCD.allergensDB && PCD.allergensDB.recipeAllergens) ? (PCD.allergensDB.recipeAllergens(r, ingMap) || []) : [];
      for (let i = 0; i < safeFilters.length; i++) {
        const k = safeFilters[i];
        if (dietMap[k]) {
          if (!compat || compat[dietMap[k]] !== true) return false; // null (unknown) also fails — auditor safety
        } else if (k === 'nuts') {
          if (tags.indexOf('nuts') >= 0 || tags.indexOf('peanuts') >= 0) return false;
        } else if (k === 'fish') {
          if (tags.indexOf('fish') >= 0 || tags.indexOf('shellfish') >= 0 || tags.indexOf('molluscs') >= 0) return false;
        }
      }
      return true;
    }

    // Build sections HTML using a simple, professional layout
    let sectionsBody = '';
    (menu.sections || []).forEach(function (sec) {
      if (!sec.items || sec.items.length === 0) return;
      const safeItems = (sec.items || []).filter(itemPassesSafeFilter);
      if (!safeItems.length) return; // v2.8.71 — skip entire section if no items pass
      sectionsBody += '<div class="m-section">';
      sectionsBody += '<div class="m-section-title">' + PCD.escapeHtml(sec.name || '') + '</div>';
      sectionsBody += '<div class="m-items">';
      safeItems.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const isManual = !it.recipeId;
        if (!r && !isManual) return;
        if (isManual && !(it.customName || '').trim()) return;
        const itemName = isManual ? (it.customName || '') : (r ? r.name : '(removed)');
        const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r && r.salePrice ? r.salePrice : 0);
        const desc = it.description || (r && r.plating) || '';

        // EU FIC 1169/2011 — allergen icons next to dish name (legal requirement)
        let allergenIcons = '';
        if (r && PCD.allergensDB && PCD.allergensDB.recipeAllergens && !menu.hideAllergens) {
          const tags = PCD.allergensDB.recipeAllergens(r, ingMap);
          if (tags && tags.length > 0) {
            const allList = PCD.allergensDB.list || [];
            allergenIcons = ' <span class="m-allerg" title="Allergens: ' + tags.join(', ') + '">' +
              tags.slice(0, 6).map(function (key) {
                const a = allList.find(function (x) { return x.key === key; });
                return a ? a.icon : '';
              }).filter(Boolean).join(' ') +
              '</span>';
          }
        }

        sectionsBody += '<div class="m-item">';
        sectionsBody += '<div class="m-item-row"><div class="m-item-name">' + PCD.escapeHtml(itemName) + itemBadge(it) + dietaryBadges(r) + allergenIcons + '</div>';
        sectionsBody += '<div class="m-item-leader"></div>';
        if (!menu.hidePrices && price > 0) {
          sectionsBody += '<div class="m-item-price">' + PCD.fmtMoney(price) + '</div>';
        }
        sectionsBody += '</div>';
        if (desc) sectionsBody += '<div class="m-item-desc">' + PCD.escapeHtml(desc) + '</div>';
        sectionsBody += '</div>';
      });
      sectionsBody += '</div></div>';
    });

    // Print options — saved on menu so they persist
    const printOpts = {
      density: menu.printDensity || 'comfortable', // tight | comfortable | spacious
      titleSize: menu.printTitleSize || 44,
      itemSize: menu.printItemSize || 18,
      sectionSize: menu.printSectionSize || 22,
      pagePadding: menu.printPagePadding || 48, // px
      itemGap: menu.printItemGap || 16,
    };

    function applyDensity(d) {
      if (d === 'tight') {
        printOpts.titleSize = 36; printOpts.itemSize = 16; printOpts.sectionSize = 18;
        printOpts.pagePadding = 32; printOpts.itemGap = 10;
      } else if (d === 'spacious') {
        printOpts.titleSize = 52; printOpts.itemSize = 20; printOpts.sectionSize = 26;
        printOpts.pagePadding = 64; printOpts.itemGap = 22;
      } else {
        printOpts.titleSize = 44; printOpts.itemSize = 18; printOpts.sectionSize = 22;
        printOpts.pagePadding = 48; printOpts.itemGap = 16;
      }
      printOpts.density = d;
    }

    function buildStyledHtml() {
      const O = printOpts;
      // v2.8.69 — Page size + orientation. Default A4 portrait.
      const pageSpec = PAGE_SIZES.find(function (p) { return p.id === (menu.pageSize || 'a4'); }) || PAGE_SIZES[0];
      const pageMaxWidth = (pageSpec.id === 'a5') ? 420 : (pageSpec.orientation === 'landscape' ? 820 : 580);
      // v2.8.69 — Multi-column layout (1 or 2). Sadece items akışına uygulanır.
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
        '.m-page {' +
          'background: ' + theme.bg + '; color: ' + theme.ink + ';' +
          'max-width: ' + pageMaxWidth + 'px; margin: 0 auto; padding: ' + O.pagePadding + 'px ' + (O.pagePadding + 8) + 'px;' +
          'font-family: ' + theme.bodyFont + ';' +
          'font-weight: ' + theme.bodyWeight + ';' +
        '}' +
        '.m-cover { width: 100%; aspect-ratio: 1/1; max-width: 360px; margin: 0 auto ' + Math.round(O.pagePadding * 0.4) + 'px; background-size: cover; background-position: center; border-radius: 4px; }' +
        '.m-logo { display:block; width: 64px; height: 64px; margin: 0 auto 12px; background-size: cover; background-position: center; border-radius: 50%; }' +
        '.m-header { text-align: center; margin-bottom: ' + Math.round(O.pagePadding * 0.75) + 'px; padding-bottom: 0; }' +
        '.m-title {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.titleSize + 'px; font-weight: ' + theme.titleWeight + ';' +
          'letter-spacing: ' + theme.titleLetterSpacing + ';' +
          'margin: 0 0 8px; color: ' + theme.ink + ';' +
          'line-height: 1.1;' +
        '}' +
        '.m-subtitle {' +
          'font-size: 11px; color: ' + theme.mutedInk + ';' +
          'letter-spacing: 0.24em;' +
          'text-transform: uppercase; font-weight: 400;' +
          'margin-bottom: 24px;' +
        '}' +
        '.m-divider {' +
          'width: 60px; height: 1px;' +
          'background: ' + accent + ';' +
          'margin: 18px auto 0;' +
        '}' +
        '.m-sections { ' + (cols === 2 ? 'column-count: 2; column-gap: ' + (O.pagePadding * 0.7) + 'px;' : '') + ' }' +
        '.m-section { margin: ' + Math.round(O.itemGap * 1.8) + 'px 0 ' + Math.round(O.itemGap * 1.4) + 'px; break-inside: avoid; page-break-inside: avoid; }' +
        '.m-section-title {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.sectionSize + 'px; font-weight: ' + theme.titleWeight + ';' +
          'letter-spacing: ' + theme.sectionLetterSpacing + ';' +
          'text-transform: ' + theme.sectionTransform + ';' +
          'text-align: center;' +
          'color: ' + theme.ink + ';' +
          'margin: 0 0 ' + Math.round(O.itemGap * 1.3) + 'px;' +
          'position: relative;' +
        '}' +
        decorBefore +
        '.m-items { display: flex; flex-direction: column; gap: ' + O.itemGap + 'px; }' +
        '.m-item { break-inside: avoid; page-break-inside: avoid; }' +
        '.m-item-row { display: flex; align-items: baseline; gap: 0; }' +
        '.m-item-name {' +
          'font-family: ' + theme.titleFont + ';' +
          'font-size: ' + O.itemSize + 'px; font-weight: ' + theme.itemWeight + ';' +
          'color: ' + theme.ink + ';' +
          'letter-spacing: 0.02em;' +
          'flex-shrink: 0;' +
        '}' +
        '.m-allerg {' +
          'font-size: 11px;' +
          'margin-inline-start: 6px;' +
          'opacity: 0.7;' +
          'letter-spacing: 0.06em;' +
          'vertical-align: middle;' +
        '}' +
        '.m-diet {' +
          'font-size: 9px;' +
          'font-weight: 700;' +
          'padding: 1px 5px;' +
          'border-radius: 999px;' +
          'margin-inline-start: 4px;' +
          'letter-spacing: 0.04em;' +
          'vertical-align: middle;' +
        '}' +
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
          'font-size: ' + O.itemSize + 'px; font-weight: ' + theme.itemWeight + ';' +
          'color: ' + accent + ';' +
          'flex-shrink: 0;' +
          'white-space: nowrap;' +
        '}' +
        '.m-item-desc {' +
          'font-size: ' + Math.max(11, O.itemSize - 6) + 'px; color: ' + theme.mutedInk + ';' +
          'font-style: italic;' +
          'margin-top: 4px;' +
          'line-height: 1.5;' +
          'max-width: 90%;' +
          'font-weight: ' + theme.bodyWeight + ';' +
        '}' +
        '.m-footer {' +
          'text-align: center;' +
          'font-size: 11px; color: ' + theme.mutedInk + ';' +
          'letter-spacing: 0.12em;' +
          'text-transform: uppercase;' +
          'margin-top: 40px;' +
          'padding-top: 20px;' +
          'border-top: 1px solid ' + accent + '40;' +
          'font-weight: 400;' +
          'white-space: pre-wrap;' +
        '}' +
        '@media print {' +
          '@page { size: ' + pageSpec.cssSize + '; margin: 0; }' +
          '.m-page { padding: ' + (O.pagePadding * 0.4) + 'px ' + (O.pagePadding * 0.45) + 'px; max-width: 100%; }' +
        '}' +
      '</style>' +
      '<div class="m-page">' +
        '<div class="m-header">' +
          (menu.coverPhoto ? '<div class="m-cover" style="background-image:url(' + menu.coverPhoto + ');"></div>' : '') +
          (menu.logo ? '<div class="m-logo" style="background-image:url(' + menu.logo + ');"></div>' : '') +
          '<h1 class="m-title">' + PCD.escapeHtml(menu.name || t('untitled')) + '</h1>' +
          (menu.subtitle ? '<div class="m-subtitle">' + PCD.escapeHtml(menu.subtitle) + '</div>' : '') +
          '<div class="m-divider"></div>' +
        '</div>' +
        '<div class="m-sections">' + sectionsBody + '</div>' +
        (menu.footer ? '<div class="m-footer">' + PCD.escapeHtml(menu.footer) + '</div>' : '') +
      '</div>'
      );
    }

    const body = PCD.el('div');

    function refreshPreview() {
      body.innerHTML =
        '<div style="margin-bottom:14px;padding:12px 14px;background:var(--surface-2);border-radius:var(--r-md);">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text-2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Page density</div>' +
          '<div class="flex gap-2" style="flex-wrap:wrap;">' +
            '<button class="btn btn-secondary btn-sm" data-dens="tight" ' + (printOpts.density === 'tight' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Tight</button>' +
            '<button class="btn btn-secondary btn-sm" data-dens="comfortable" ' + (printOpts.density === 'comfortable' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Comfortable</button>' +
            '<button class="btn btn-secondary btn-sm" data-dens="spacious" ' + (printOpts.density === 'spacious' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Spacious</button>' +
            '<div style="flex:1;"></div>' +
            '<span class="text-muted text-sm" style="font-size:11px;align-self:center;">' +
              'Title ' + printOpts.titleSize + 'px · Item ' + printOpts.itemSize + 'px · Padding ' + printOpts.pagePadding + 'px' +
            '</span>' +
          '</div>' +
        '</div>' +
        buildStyledHtml();

      PCD.on(body, 'click', '[data-dens]', function () {
        applyDensity(this.getAttribute('data-dens'));
        // persist
        const m = PCD.store.getFromTable('menus', mid);
        if (m) {
          m.printDensity = printOpts.density;
          m.printTitleSize = printOpts.titleSize;
          m.printItemSize = printOpts.itemSize;
          m.printSectionSize = printOpts.sectionSize;
          m.printPagePadding = printOpts.pagePadding;
          m.printItemGap = printOpts.itemGap;
          PCD.store.upsertInTable('menus', m, 'm');
        }
        refreshPreview();
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
          '<div class="text-muted text-sm mb-2">Bu menüyü herkese açık olarak paylaşmak için aşağıdaki linki kopyala:</div>' +
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
