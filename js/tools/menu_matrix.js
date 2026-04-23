/* ================================================================
   ProChefDesk — menu_matrix.js
   Menu Engineering Matrix (Star / Plowhorse / Puzzle / Dog).

   Method (Kasavana-Smith style):
   - X axis: Popularity = item_sales / total_menu_sales × 100
   - Y axis: Contribution Margin % = (price - food_cost) / price × 100
   - Quadrant dividers = averages across the menu

   Data: menu.items[i].monthlySales (integer, default 0) — user input.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function quadrant(popularity, margin, avgPop, avgMargin) {
    const highPop = popularity >= avgPop;
    const highMargin = margin >= avgMargin;
    if (highPop && highMargin) return 'star';
    if (highPop && !highMargin) return 'plowhorse';
    if (!highPop && highMargin) return 'puzzle';
    return 'dog';
  }

  function quadrantColor(q) {
    return {
      star: '#22c55e',       // green
      plowhorse: '#f59e0b',  // orange
      puzzle: '#3b82f6',     // blue
      dog: '#ef4444',        // red
    }[q];
  }

  function render(view) {
    const t = PCD.i18n.t;
    const menus = PCD.store.listTable('menus');

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('matrix_title')}</div>
          <div class="page-subtitle">${t('matrix_subtitle')}</div>
        </div>
      </div>
      <div id="matrixBody"></div>
    `;

    const bodyEl = PCD.$('#matrixBody', view);

    if (menus.length === 0) {
      bodyEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-title">${t('matrix_no_menu')}</div>
          <div class="empty-desc">${t('no_menus_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="goMenus">+ ${t('new_menu')}</button></div>
        </div>
      `;
      PCD.$('#goMenus', bodyEl).addEventListener('click', function () { PCD.router.go('menus'); });
      return;
    }

    let selectedMenuId = menus[0].id;

    function renderMenu() {
      const menu = PCD.store.getFromTable('menus', selectedMenuId);
      if (!menu) return;

      // Flatten menu items across sections
      const flatItems = [];
      (menu.sections || []).forEach(function (sec) {
        (sec.items || []).forEach(function (it) {
          const r = PCD.store.getRecipe(it.recipeId);
          if (!r) return;
          flatItems.push({ item: it, recipe: r, sectionName: sec.name });
        });
      });

      if (flatItems.length === 0) {
        bodyEl.innerHTML = `
          <div class="mb-3">${renderMenuPicker(menus, selectedMenuId)}</div>
          <div class="empty"><div class="empty-desc">${t('matrix_need_data')}</div></div>
        `;
        wirePicker();
        return;
      }

      // Compute per-item metrics
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

      const analyzed = flatItems.map(function (x) {
        const r = x.recipe;
        const monthlySales = Number(x.item.monthlySales) || 0;
        const price = (x.item.price !== undefined && x.item.price !== null && x.item.price !== '') ? Number(x.item.price) : (r.salePrice || 0);
        const foodCost = PCD.recipes.computeFoodCost(r, ingMap) / (r.servings || 1);
        const cm = price - foodCost; // contribution margin in currency
        const cmPct = price > 0 ? (cm / price) * 100 : 0;
        return {
          itemId: x.item.id, recipeId: r.id, name: r.name,
          monthlySales: monthlySales, price: price, foodCost: foodCost,
          cm: cm, cmPct: cmPct,
        };
      });

      const totalSales = analyzed.reduce(function (a, x) { return a + x.monthlySales; }, 0);
      analyzed.forEach(function (x) {
        x.popularity = totalSales > 0 ? (x.monthlySales / totalSales) * 100 : 0;
      });

      const avgPop = analyzed.length > 0 ? analyzed.reduce(function (a, x) { return a + x.popularity; }, 0) / analyzed.length : 0;
      const avgMargin = analyzed.length > 0 ? analyzed.reduce(function (a, x) { return a + x.cmPct; }, 0) / analyzed.length : 0;

      analyzed.forEach(function (x) {
        x.quadrant = quadrant(x.popularity, x.cmPct, avgPop, avgMargin);
      });

      // Group by quadrant
      const groups = { star: [], plowhorse: [], puzzle: [], dog: [] };
      analyzed.forEach(function (x) { groups[x.quadrant].push(x); });

      bodyEl.innerHTML = `
        <div class="mb-3">${renderMenuPicker(menus, selectedMenuId)}</div>

        <div class="flex items-center justify-between mb-3" style="gap:8px;flex-wrap:wrap;">
          <div class="text-muted text-sm">
            ${analyzed.length} items · ${totalSales} ${totalSales === 1 ? 'sale' : 'sales'} / month
          </div>
          <button class="btn btn-outline btn-sm" id="setSalesBtn">📝 ${t('matrix_set_sales')}</button>
        </div>

        ${totalSales === 0 ? `
          <div class="card mb-3" style="background:var(--warning-bg);border-color:var(--warning);padding:12px;">
            <div class="text-sm" style="color:var(--warning);">
              ⚠️ ${t('matrix_need_data')} — click "${t('matrix_set_sales')}" above to enter sales counts.
            </div>
          </div>
        ` : ''}

        <div class="card mb-3" style="padding:12px;">
          <div id="scatterHost"></div>
        </div>

        <div id="quadrantList"></div>
      `;

      renderScatter(PCD.$('#scatterHost', bodyEl), analyzed, avgPop, avgMargin);
      renderQuadrantList(PCD.$('#quadrantList', bodyEl), groups);

      wirePicker();
      PCD.$('#setSalesBtn', bodyEl).addEventListener('click', function () {
        openSalesEditor(selectedMenuId, function () { renderMenu(); });
      });
    }

    function renderMenuPicker(menus, selectedId) {
      let html = '<div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;">';
      menus.forEach(function (m) {
        const sel = m.id === selectedId;
        html += '<button class="btn btn-' + (sel ? 'primary' : 'secondary') + ' btn-sm" data-menuid="' + m.id + '">' + PCD.escapeHtml(m.name || t('untitled')) + '</button>';
      });
      html += '</div>';
      return html;
    }

    function wirePicker() {
      PCD.on(bodyEl, 'click', '[data-menuid]', function () {
        selectedMenuId = this.getAttribute('data-menuid');
        renderMenu();
      });
    }

    renderMenu();
  }

  function renderScatter(host, analyzed, avgPop, avgMargin) {
    const t = PCD.i18n.t;
    const W = 600, H = 400, pad = 40;
    const plotW = W - pad * 2, plotH = H - pad * 2;

    // Scale: popularity 0-100 on X, margin 0-100 on Y (can be negative, so allow range)
    const minMargin = Math.min(0, Math.min.apply(null, analyzed.map(function (x) { return x.cmPct; })));
    const maxMargin = Math.max(100, Math.max.apply(null, analyzed.map(function (x) { return x.cmPct; })));
    const maxPop = Math.max(50, Math.max.apply(null, analyzed.map(function (x) { return x.popularity; })) * 1.2);

    function xPos(p) { return pad + (p / maxPop) * plotW; }
    function yPos(m) { return pad + plotH - ((m - minMargin) / (maxMargin - minMargin)) * plotH; }

    const avgX = xPos(avgPop), avgY = yPos(avgMargin);

    // Quadrant tinted backgrounds
    let bg = '';
    bg += '<rect x="' + avgX + '" y="' + pad + '" width="' + (W - pad - avgX) + '" height="' + (avgY - pad) + '" fill="#22c55e" opacity="0.08"/>'; // star (top-right)
    bg += '<rect x="' + avgX + '" y="' + avgY + '" width="' + (W - pad - avgX) + '" height="' + (H - pad - avgY) + '" fill="#f59e0b" opacity="0.08"/>'; // plowhorse (bottom-right)
    bg += '<rect x="' + pad + '" y="' + pad + '" width="' + (avgX - pad) + '" height="' + (avgY - pad) + '" fill="#3b82f6" opacity="0.08"/>'; // puzzle (top-left)
    bg += '<rect x="' + pad + '" y="' + avgY + '" width="' + (avgX - pad) + '" height="' + (H - pad - avgY) + '" fill="#ef4444" opacity="0.08"/>'; // dog (bottom-left)

    // Quadrant labels (inside corners)
    const labels = [
      { x: W - pad - 6, y: pad + 18, text: t('matrix_star').toUpperCase(), color: '#16a34a', anchor: 'end' },
      { x: W - pad - 6, y: H - pad - 8, text: t('matrix_plowhorse').toUpperCase(), color: '#d97706', anchor: 'end' },
      { x: pad + 6, y: pad + 18, text: t('matrix_puzzle').toUpperCase(), color: '#2563eb', anchor: 'start' },
      { x: pad + 6, y: H - pad - 8, text: t('matrix_dog').toUpperCase(), color: '#dc2626', anchor: 'start' },
    ];
    let labelsHtml = labels.map(function (l) {
      return '<text x="' + l.x + '" y="' + l.y + '" fill="' + l.color + '" font-size="11" font-weight="800" letter-spacing="1" text-anchor="' + l.anchor + '" opacity="0.6">' + l.text + '</text>';
    }).join('');

    // Axes
    let axes = '';
    axes += '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="currentColor" opacity="0.3"/>';
    axes += '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="currentColor" opacity="0.3"/>';
    // Divider lines (averages)
    axes += '<line x1="' + avgX + '" y1="' + pad + '" x2="' + avgX + '" y2="' + (H - pad) + '" stroke="currentColor" opacity="0.35" stroke-dasharray="4,3"/>';
    axes += '<line x1="' + pad + '" y1="' + avgY + '" x2="' + (W - pad) + '" y2="' + avgY + '" stroke="currentColor" opacity="0.35" stroke-dasharray="4,3"/>';

    // Axis labels
    axes += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" fill="currentColor" font-size="11" opacity="0.7" font-weight="600">' + t('matrix_x_axis') + '</text>';
    axes += '<text x="14" y="' + (H / 2) + '" text-anchor="middle" fill="currentColor" font-size="11" opacity="0.7" font-weight="600" transform="rotate(-90 14 ' + (H / 2) + ')">' + t('matrix_y_axis') + '</text>';

    // Dots
    let dots = '';
    analyzed.forEach(function (x) {
      const cx = xPos(x.popularity);
      const cy = yPos(x.cmPct);
      const color = quadrantColor(x.quadrant);
      const label = x.name.length > 16 ? x.name.slice(0, 14) + '…' : x.name;
      dots += '<g>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="' + color + '" stroke="white" stroke-width="2">' +
          '<title>' + PCD.escapeHtml(x.name) + ' — ' + PCD.fmtPercent(x.popularity, 1) + ' pop, ' + PCD.fmtPercent(x.cmPct, 0) + ' margin</title>' +
        '</circle>' +
        '<text x="' + (cx + 10) + '" y="' + (cy + 4) + '" fill="currentColor" font-size="10" font-weight="600">' + PCD.escapeHtml(label) + '</text>' +
      '</g>';
    });

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;color:var(--text);">' +
      bg + labelsHtml + axes + dots +
    '</svg>';
  }

  function renderQuadrantList(host, groups) {
    const t = PCD.i18n.t;
    const order = [
      { key: 'star', desc: t('matrix_star_desc') },
      { key: 'plowhorse', desc: t('matrix_plowhorse_desc') },
      { key: 'puzzle', desc: t('matrix_puzzle_desc') },
      { key: 'dog', desc: t('matrix_dog_desc') },
    ];
    PCD.clear(host);
    order.forEach(function (q) {
      const items = groups[q.key];
      if (!items || items.length === 0) return;
      const section = PCD.el('div', { class: 'card', style: { padding: '12px', marginBottom: '10px', borderInlineStart: '4px solid ' + quadrantColor(q.key) } });
      let html = '<div style="font-weight:700;font-size:15px;color:' + quadrantColor(q.key) + ';margin-bottom:2px;">' + t('matrix_' + q.key) + ' (' + items.length + ')</div>';
      html += '<div class="text-muted text-sm mb-2">' + q.desc + '</div>';
      items.forEach(function (x) {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px dotted var(--border);font-size:13px;">' +
          '<div style="flex:1;min-width:0;font-weight:600;">' + PCD.escapeHtml(x.name) + '</div>' +
          '<div style="text-align:end;">' +
            '<div style="font-size:11px;color:var(--text-3);">' + t('matrix_popularity') + ' ' + PCD.fmtPercent(x.popularity, 1) + '</div>' +
            '<div style="font-size:11px;color:var(--text-3);">' + t('matrix_margin') + ' ' + PCD.fmtPercent(x.cmPct, 0) + '</div>' +
          '</div>' +
        '</div>';
      });
      section.innerHTML = html;
      host.appendChild(section);
    });
  }

  // ============ SALES EDITOR ============
  function openSalesEditor(menuId, onSaved) {
    const t = PCD.i18n.t;
    const menu = PCD.store.getFromTable('menus', menuId);
    if (!menu) return;
    const data = PCD.clone(menu);

    const body = PCD.el('div');
    let html = '<div class="text-muted text-sm mb-3">Enter how many times each item was sold in the last month.</div>';
    (data.sections || []).forEach(function (sec, sIdx) {
      if (!sec.items || sec.items.length === 0) return;
      html += '<div class="section-title" style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);margin-bottom:6px;margin-top:12px;">' + PCD.escapeHtml(sec.name) + '</div>';
      sec.items.forEach(function (it, iIdx) {
        const r = PCD.store.getRecipe(it.recipeId);
        if (!r) return;
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">' +
          '<div style="flex:1;min-width:0;font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
          '<input type="number" class="input" data-sales="' + sIdx + ':' + iIdx + '" value="' + (it.monthlySales || 0) + '" min="0" style="width:90px;padding:4px 8px;min-height:32px;font-size:13px;text-align:end;">' +
        '</div>';
      });
    });
    body.innerHTML = html;

    PCD.on(body, 'input', '[data-sales]', function () {
      const parts = this.getAttribute('data-sales').split(':');
      const sIdx = parseInt(parts[0], 10), iIdx = parseInt(parts[1], 10);
      data.sections[sIdx].items[iIdx].monthlySales = parseInt(this.value, 10) || 0;
    });

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: t('matrix_set_sales'), body: body, footer: footer, size: 'md', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      data.id = menu.id;
      PCD.store.upsertInTable('menus', data, 'm');
      PCD.toast.success(t('saved'));
      m.close();
      if (onSaved) setTimeout(onSaved, 250);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menuMatrix = { render: render, quadrant: quadrant };
})();
