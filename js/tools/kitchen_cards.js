/* ================================================================
   ProChefDesk — kitchen_cards.js (v1.10 - Excel-style)

   Each recipe is a self-contained block with:
   - Recipe name (bold header)
   - 2-column table: ingredient name (left) | amount (right)
   - Method below as numbered steps (split by newline)

   Multiple blocks tile across the A4 page, fitting 8-15+ depending
   on recipe length. Like the chef's existing Excel sheet — laminate-
   ready reference for the kitchen line.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const recipes = PCD.store.listRecipes().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">Kitchen Cards</div>
          <div class="page-subtitle">Print compact A4 reference sheets — laminate, hang in the kitchen</div>
        </div>
      </div>
      <div id="kcBody"></div>
    `;

    const bodyEl = PCD.$('#kcBody', view);

    if (recipes.length === 0) {
      bodyEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('id-card', 48)}</div>
          <div class="empty-title">No recipes yet</div>
          <div class="empty-desc">Create some recipes first, then come back here to build a kitchen reference sheet.</div>
        </div>
      `;
      return;
    }

    const selected = new Set(recipes.map(function (r) { return r.id; })); // default: all
    let columns = 3;
    let orientation = 'landscape';
    let showMethod = true;
    let showAmounts = true;
    let fontSize = 'medium'; // small | medium | large

    function renderBody() {
      bodyEl.innerHTML = `
        <div class="card mb-3" style="padding:14px;">
          <div style="font-weight:700;margin-bottom:12px;">Sheet options</div>

          <div class="grid mb-3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
            <div>
              <div class="text-muted text-sm mb-1">Orientation</div>
              <div class="flex gap-1">
                <button class="btn btn-secondary btn-sm ${orientation==='landscape'?'active':''}" data-orient="landscape" style="flex:1;">Landscape</button>
                <button class="btn btn-secondary btn-sm ${orientation==='portrait'?'active':''}" data-orient="portrait" style="flex:1;">Portrait</button>
              </div>
            </div>
            <div>
              <div class="text-muted text-sm mb-1">Columns</div>
              <div class="flex gap-1">
                <button class="btn btn-secondary btn-sm ${columns===2?'active':''}" data-cols="2" style="flex:1;">2</button>
                <button class="btn btn-secondary btn-sm ${columns===3?'active':''}" data-cols="3" style="flex:1;">3</button>
                <button class="btn btn-secondary btn-sm ${columns===4?'active':''}" data-cols="4" style="flex:1;">4</button>
                <button class="btn btn-secondary btn-sm ${columns===5?'active':''}" data-cols="5" style="flex:1;">5</button>
              </div>
            </div>
            <div>
              <div class="text-muted text-sm mb-1">Font size</div>
              <div class="flex gap-1">
                <button class="btn btn-secondary btn-sm ${fontSize==='small'?'active':''}" data-fs="small" style="flex:1;">S</button>
                <button class="btn btn-secondary btn-sm ${fontSize==='medium'?'active':''}" data-fs="medium" style="flex:1;">M</button>
                <button class="btn btn-secondary btn-sm ${fontSize==='large'?'active':''}" data-fs="large" style="flex:1;">L</button>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 mb-3" style="flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="showMethod" ${showMethod ? 'checked' : ''} style="accent-color:var(--brand-600);">
              <span>Include method</span>
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="showAmounts" ${showAmounts ? 'checked' : ''} style="accent-color:var(--brand-600);">
              <span>Show amounts</span>
            </label>
          </div>

          <div class="flex items-center gap-2" style="flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="selectAllBtn">Select all</button>
            <button class="btn btn-outline btn-sm" id="selectNoneBtn">Select none</button>
            <span class="text-muted text-sm" id="selCount" style="margin-inline-start:auto;">${selected.size} of ${recipes.length} selected</span>
            <button class="btn btn-primary" id="printSheetBtn" ${selected.size === 0 ? 'disabled' : ''}>${PCD.icon('print', 14)} <span>Print sheet</span></button>
          </div>
        </div>

        <div class="card" style="padding:6px 0;">
          <div id="recipeList"></div>
        </div>
      `;

      const listEl = PCD.$('#recipeList', bodyEl);
      recipes.forEach(function (r) {
        const isSelected = selected.has(r.id);
        const row = PCD.el('label', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
            background: isSelected ? 'var(--brand-50)' : 'var(--surface)'
          }
        });
        row.innerHTML =
          '<input type="checkbox" data-rid="' + r.id + '"' + (isSelected ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--brand-600);flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
            '<div class="text-muted" style="font-size:12px;">' +
              ((r.ingredients || []).length) + ' ingredient' + ((r.ingredients || []).length === 1 ? '' : 's') +
              (r.servings ? ' · ' + r.servings + ' servings' : '') +
            '</div>' +
          '</div>';
        listEl.appendChild(row);
      });

      // Wire
      PCD.on(bodyEl, 'click', '[data-orient]', function () {
        orientation = this.getAttribute('data-orient');
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-cols]', function () {
        columns = parseInt(this.getAttribute('data-cols'), 10);
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-fs]', function () {
        fontSize = this.getAttribute('data-fs');
        renderBody();
      });
      PCD.$('#showMethod', bodyEl).addEventListener('change', function () { showMethod = this.checked; });
      PCD.$('#showAmounts', bodyEl).addEventListener('change', function () { showAmounts = this.checked; });
      PCD.$('#selectAllBtn', bodyEl).addEventListener('click', function () {
        recipes.forEach(function (r) { selected.add(r.id); });
        renderBody();
      });
      PCD.$('#selectNoneBtn', bodyEl).addEventListener('click', function () {
        selected.clear();
        renderBody();
      });
      PCD.on(bodyEl, 'change', 'input[type=checkbox][data-rid]', function () {
        const rid = this.getAttribute('data-rid');
        if (this.checked) selected.add(rid); else selected.delete(rid);
        const printBtn = PCD.$('#printSheetBtn', bodyEl);
        if (printBtn) printBtn.disabled = selected.size === 0;
        const row = this.closest('label');
        if (row) row.style.background = this.checked ? 'var(--brand-50)' : 'var(--surface)';
        const countEl = PCD.$('#selCount', bodyEl);
        if (countEl) countEl.textContent = selected.size + ' of ' + recipes.length + ' selected';
      });
      PCD.$('#printSheetBtn', bodyEl).addEventListener('click', function () {
        if (selected.size === 0) return;
        printSheet(recipes.filter(function (r) { return selected.has(r.id); }), {
          columns: columns,
          orientation: orientation,
          showMethod: showMethod,
          showAmounts: showAmounts,
          fontSize: fontSize,
        });
      });
    }

    renderBody();
  }

  // Format ingredient amount nicely
  function formatAmount(amt, unit) {
    if (amt === null || amt === undefined || amt === '') return unit || '';
    const num = Number(amt);
    if (isNaN(num)) return String(amt) + ' ' + (unit || '');
    // Trim trailing zeros: 100.0 → 100, 0.500 → 0.5
    let s = num % 1 === 0 ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
    return s + (unit ? ' ' + unit : '');
  }

  // Method splitting: try numbered steps first, else split by newlines
  function splitMethod(steps) {
    if (!steps) return [];
    const text = String(steps).trim();
    if (!text) return [];

    // Already numbered? "1) ..." or "1. ..." or "1- ..."
    const numbered = text.split(/\n\s*(?=\d+[\.\)\-]\s)/);
    if (numbered.length > 1) {
      return numbered.map(function (s) {
        return s.replace(/^\d+[\.\)\-]\s*/, '').trim();
      }).filter(Boolean);
    }
    // Otherwise split by double newline (paragraphs) or single newline
    const paragraphs = text.split(/\n\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (paragraphs.length > 1) return paragraphs;
    // Final fallback — split by single newline
    return text.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function printSheet(recipes, opts) {
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    const fontSizes = {
      small: { name: 9, ing: 7.5, method: 7 },
      medium: { name: 10.5, ing: 8.5, method: 8 },
      large: { name: 12, ing: 10, method: 9.5 },
    };
    const fs = fontSizes[opts.fontSize] || fontSizes.medium;

    let blocksHtml = '';
    recipes.forEach(function (r) {
      // Ingredients as 2-col table
      let ingsHtml = '';
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '?';
        const amt = opts.showAmounts ? formatAmount(ri.amount, ri.unit) : '';
        ingsHtml +=
          '<tr>' +
            '<td class="kc-ing-name">' + PCD.escapeHtml(name) + '</td>' +
            (opts.showAmounts ? '<td class="kc-ing-amt">' + PCD.escapeHtml(amt) + '</td>' : '') +
          '</tr>';
      });

      // Method as numbered steps
      let methodHtml = '';
      if (opts.showMethod) {
        const steps = splitMethod(r.steps);
        if (steps.length > 0) {
          methodHtml = '<ol class="kc-method">';
          steps.forEach(function (s) {
            methodHtml += '<li>' + PCD.escapeHtml(s) + '</li>';
          });
          methodHtml += '</ol>';
        }
      }

      blocksHtml +=
        '<div class="kc-block">' +
          '<div class="kc-name">' + PCD.escapeHtml(r.name || '') +
            (r.servings ? ' <span class="kc-srv">' + r.servings + 'p</span>' : '') +
          '</div>' +
          (ingsHtml ? '<table class="kc-ings">' + ingsHtml + '</table>' : '') +
          methodHtml +
        '</div>';
    });

    const html =
      '<style>' +
        '@page { size: A4 ' + opts.orientation + '; margin: 6mm; }' +
        'body {' +
          'margin: 0; padding: 0;' +
          'font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;' +
          'color: #1a1a1a; background: #fff;' +
        '}' +
        '.kc-sheet {' +
          'column-count: ' + opts.columns + ';' +
          'column-gap: 6mm;' +
          'column-rule: 1px solid #d4d4d4;' +
        '}' +
        '.kc-header {' +
          'column-span: all;' +
          'margin-bottom: 6px;' +
          'padding-bottom: 4px;' +
          'border-bottom: 2px solid #16a34a;' +
          'display: flex;' +
          'justify-content: space-between;' +
          'align-items: baseline;' +
        '}' +
        '.kc-header h1 {' +
          'margin: 0;' +
          'font-size: 13pt;' +
          'font-weight: 700;' +
          'color: #16a34a;' +
          'letter-spacing: -0.01em;' +
        '}' +
        '.kc-header .meta {' +
          'font-size: 8pt;' +
          'color: #666;' +
        '}' +
        '.kc-block {' +
          'break-inside: avoid;' +
          'page-break-inside: avoid;' +
          'margin-bottom: 8px;' +
          'padding: 4px 6px 6px;' +
          'border-bottom: 1px solid #e5e5e5;' +
        '}' +
        '.kc-name {' +
          'font-size: ' + fs.name + 'pt;' +
          'font-weight: 800;' +
          'color: #16a34a;' +
          'letter-spacing: 0.02em;' +
          'text-transform: uppercase;' +
          'margin-bottom: 4px;' +
          'border-bottom: 1px solid #16a34a;' +
          'padding-bottom: 2px;' +
        '}' +
        '.kc-srv {' +
          'font-size: 0.8em;' +
          'font-weight: 500;' +
          'color: #666;' +
          'margin-inline-start: 4px;' +
          'text-transform: none;' +
          'letter-spacing: 0;' +
        '}' +
        '.kc-ings {' +
          'width: 100%;' +
          'border-collapse: collapse;' +
          'font-size: ' + fs.ing + 'pt;' +
          'line-height: 1.35;' +
          'margin-bottom: 4px;' +
        '}' +
        '.kc-ing-name {' +
          'padding: 1px 0;' +
          'color: #2a2a2a;' +
          'vertical-align: top;' +
        '}' +
        '.kc-ing-amt {' +
          'padding: 1px 0 1px 6px;' +
          'text-align: end;' +
          'font-weight: 700;' +
          'color: #16a34a;' +
          'white-space: nowrap;' +
          'vertical-align: top;' +
          'width: 1%;' +
        '}' +
        '.kc-method {' +
          'list-style-position: outside;' +
          'padding-inline-start: 14px;' +
          'margin: 4px 0 0;' +
          'font-size: ' + fs.method + 'pt;' +
          'line-height: 1.4;' +
          'color: #444;' +
        '}' +
        '.kc-method li {' +
          'margin-bottom: 2px;' +
          'padding-inline-start: 2px;' +
        '}' +
      '</style>' +
      '<div class="kc-sheet">' +
        '<div class="kc-header">' +
          '<h1>Kitchen Reference</h1>' +
          '<div class="meta">' + recipes.length + ' recipes · ' + new Date().toLocaleDateString() + '</div>' +
        '</div>' +
        blocksHtml +
      '</div>';

    PCD.print(html, 'Kitchen Cards — ' + recipes.length + ' recipes');
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.kitchenCards = { render: render };
})();
