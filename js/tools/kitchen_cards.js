/* ================================================================
   ProChefDesk — kitchen_cards.js (v1.9 - REDESIGN)

   USER REQUEST:
   "A4 yatay kağıt boyutunda. Tek bir A4 kağıdında 10-12 veya daha
   fazla veya daha az (recipenin uzunluğuna ve kısalığına göre)
   recipe sığabiliyordu. Sadece yemeğin adı, malzemeler miktarları,
   hemen altında talimat. Sous chef bir A4 kağıdına 10-15 recipe
   sığdırıyor. Bunu yazdırıyor. Sonra laminant kaplatıyor. Mutfağa
   bırakıyor. Şefler gidip istedikleri recipeyi A4'te buluyor."

   APPROACH:
   - Pick which recipes to include
   - Render as 2-3 column compact layout on A4 landscape
   - Each recipe block: name (bold) → ingredients (one-line) → method
   - Auto-scale font and columns based on recipe count
   - Print directly via PCD.print() — no per-card editing
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">Kitchen Cards</div>
          <div class="page-subtitle">Compact A4 sheets — 10-15 recipes per page for the kitchen</div>
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

    // Selected set
    const selected = new Set(recipes.map(function (r) { return r.id; })); // default: all
    let columns = 3;
    let showMethod = true;

    function renderBody() {
      bodyEl.innerHTML = `
        <div class="card mb-3" style="padding:14px;">
          <div style="font-weight:700;margin-bottom:10px;">Sheet options</div>

          <div class="flex items-center gap-2 mb-2" style="flex-wrap:wrap;">
            <span class="text-muted text-sm" style="margin-inline-end:4px;">Columns:</span>
            <button class="btn btn-secondary btn-sm ${columns===2?'btn-primary':''}" data-cols="2">2</button>
            <button class="btn btn-secondary btn-sm ${columns===3?'btn-primary':''}" data-cols="3">3</button>
            <button class="btn btn-secondary btn-sm ${columns===4?'btn-primary':''}" data-cols="4">4</button>
            <span class="text-muted text-sm" style="margin-inline-start:12px;margin-inline-end:4px;">Show method:</span>
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="showMethod" ${showMethod ? 'checked' : ''} style="accent-color:var(--brand-600);">
            </label>
          </div>

          <div class="flex items-center gap-2 mt-3" style="flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="selectAllBtn">Select all</button>
            <button class="btn btn-outline btn-sm" id="selectNoneBtn">Select none</button>
            <span class="text-muted text-sm" style="margin-inline-start:auto;">${selected.size} of ${recipes.length} selected</span>
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
      PCD.on(bodyEl, 'click', '[data-cols]', function () {
        columns = parseInt(this.getAttribute('data-cols'), 10);
        renderBody();
      });
      PCD.$('#showMethod', bodyEl).addEventListener('change', function () {
        showMethod = this.checked;
      });
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
        // Update count without full re-render
        const countEl = bodyEl.querySelector('.text-muted.text-sm[style*="margin-inline-start"]');
        const printBtn = PCD.$('#printSheetBtn', bodyEl);
        if (printBtn) printBtn.disabled = selected.size === 0;
        // Update row bg
        const row = this.closest('label');
        if (row) row.style.background = this.checked ? 'var(--brand-50)' : 'var(--surface)';
        // Update count text
        const counts = bodyEl.querySelectorAll('.text-muted');
        counts.forEach(function (el) {
          if (el.textContent && el.textContent.indexOf('of ' + recipes.length + ' selected') >= 0) {
            el.textContent = selected.size + ' of ' + recipes.length + ' selected';
          }
        });
      });
      PCD.$('#printSheetBtn', bodyEl).addEventListener('click', function () {
        if (selected.size === 0) return;
        printSheet(recipes.filter(function (r) { return selected.has(r.id); }), columns, showMethod);
      });
    }

    renderBody();
  }

  function printSheet(recipes, columns, showMethod) {
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    // Build compact recipe blocks
    let blocksHtml = '';
    recipes.forEach(function (r) {
      // Inline ingredients: "ingredient1 100g · ingredient2 50g · ..."
      const ingList = (r.ingredients || []).map(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '?';
        return PCD.escapeHtml(name) + ' <span class="amt">' + PCD.fmtNumber(ri.amount) + ' ' + PCD.escapeHtml(ri.unit || '') + '</span>';
      }).join(' &nbsp;·&nbsp; ');

      const method = (r.steps || '').trim();

      blocksHtml +=
        '<div class="kc-block">' +
          '<div class="kc-name">' + PCD.escapeHtml(r.name || '') + (r.servings ? ' <span class="kc-servings">(' + r.servings + 'p)</span>' : '') + '</div>' +
          '<div class="kc-ings">' + ingList + '</div>' +
          (showMethod && method ? '<div class="kc-method">' + PCD.escapeHtml(method) + '</div>' : '') +
        '</div>';
    });

    // A4 landscape, multi-column layout
    const html =
      '<style>' +
        '@page { size: A4 landscape; margin: 8mm; }' +
        'body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; background: #fff; }' +
        '.kc-sheet {' +
          ' column-count: ' + columns + ';' +
          ' column-gap: 10px;' +
          ' column-rule: 1px solid #ccc;' +
        '}' +
        '.kc-block {' +
          ' break-inside: avoid;' +
          ' page-break-inside: avoid;' +
          ' margin-bottom: 8px;' +
          ' padding: 6px 8px;' +
          ' border-bottom: 1px solid #e0e0e0;' +
        '}' +
        '.kc-name {' +
          ' font-weight: 800;' +
          ' font-size: 11pt;' +
          ' margin-bottom: 2px;' +
          ' color: #16a34a;' +
        '}' +
        '.kc-servings { font-weight: 500; color: #666; font-size: 9pt; }' +
        '.kc-ings {' +
          ' font-size: 8.5pt;' +
          ' line-height: 1.4;' +
          ' color: #333;' +
          ' margin-bottom: 3px;' +
        '}' +
        '.kc-ings .amt {' +
          ' font-weight: 700;' +
          ' color: #000;' +
          ' white-space: nowrap;' +
        '}' +
        '.kc-method {' +
          ' font-size: 8pt;' +
          ' line-height: 1.45;' +
          ' color: #444;' +
          ' white-space: pre-wrap;' +
          ' margin-top: 2px;' +
        '}' +
        '.kc-header {' +
          ' column-span: all;' +
          ' margin-bottom: 6px;' +
          ' padding-bottom: 4px;' +
          ' border-bottom: 2px solid #16a34a;' +
          ' display: flex;' +
          ' justify-content: space-between;' +
          ' align-items: baseline;' +
        '}' +
        '.kc-header h1 { margin: 0; font-size: 14pt; }' +
        '.kc-header .meta { font-size: 9pt; color: #666; }' +
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
