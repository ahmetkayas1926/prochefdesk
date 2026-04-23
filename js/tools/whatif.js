/* ================================================================
   ProChefDesk — whatif.js
   What-If Simulator.
   Add price changes for ingredients; see which recipes are impacted
   and by how much.

   Example: "Beef mince +20%" → shows every recipe using beef mince,
   new food cost, and delta.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients();
    const recipes = PCD.store.listRecipes();

    // In-memory scenario (doesn't persist)
    let changes = []; // [{ ingredientId, percent }]

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('whatif_title')}</div>
          <div class="page-subtitle">${t('whatif_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="addChangeBtn">+ ${t('whatif_add_change')}</button>
        </div>
      </div>

      <div id="changesList" class="flex flex-col gap-2 mb-3"></div>
      <div id="impact"></div>
    `;

    function renderChanges() {
      const listEl = PCD.$('#changesList', view);
      PCD.clear(listEl);
      if (changes.length === 0) {
        listEl.innerHTML = `
          <div class="empty" style="padding:24px;">
            <div class="empty-icon">🔮</div>
            <div class="empty-title">${t('whatif_empty')}</div>
            <div class="empty-desc">${t('whatif_example')}</div>
            <div class="empty-action"><button class="btn btn-primary" id="emptyAdd">+ ${t('whatif_add_change')}</button></div>
          </div>
        `;
        const btn = PCD.$('#emptyAdd', listEl);
        if (btn) btn.addEventListener('click', addChange);
        return;
      }
      const ingMap = {}; ings.forEach(function (i) { ingMap[i.id] = i; });
      changes.forEach(function (c, idx) {
        const ing = ingMap[c.ingredientId];
        if (!ing) return;
        const newPrice = ing.pricePerUnit * (1 + c.percent / 100);
        const row = PCD.el('div', { class: 'card', style: { padding: '12px' } });
        const sign = c.percent >= 0 ? '+' : '';
        const color = c.percent >= 0 ? 'var(--danger)' : 'var(--success)';
        row.innerHTML = `
          <div class="flex items-center gap-3">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;">${PCD.escapeHtml(ing.name)}</div>
              <div class="text-muted text-sm">
                ${PCD.fmtMoney(ing.pricePerUnit)}/${ing.unit} → <span style="color:${color};font-weight:600;">${PCD.fmtMoney(newPrice)}/${ing.unit}</span>
              </div>
            </div>
            <div style="font-size:22px;font-weight:800;color:${color};white-space:nowrap;">
              ${sign}${PCD.fmtPercent(c.percent, 0)}
            </div>
            <button class="icon-btn" data-rm="${idx}">${PCD.icon('x', 18)}</button>
          </div>
          <div class="flex items-center gap-2 mt-2">
            <input type="range" data-slider="${idx}" min="-50" max="100" value="${c.percent}" step="1" style="flex:1;accent-color:var(--brand-600);">
            <input type="number" data-input="${idx}" value="${c.percent}" step="1" min="-90" max="500" style="width:70px;padding:4px 8px;font-size:13px;border:1px solid var(--border);border-radius:var(--r-sm);">
          </div>
        `;
        listEl.appendChild(row);
      });
      PCD.on(listEl, 'input', '[data-slider]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-slider'), 10);
        changes[idx].percent = parseFloat(this.value);
        renderAll();
      }, 100));
      PCD.on(listEl, 'input', '[data-input]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-input'), 10);
        changes[idx].percent = parseFloat(this.value) || 0;
        renderAll();
      }, 300));
      PCD.on(listEl, 'click', '[data-rm]', function () {
        const idx = parseInt(this.getAttribute('data-rm'), 10);
        changes.splice(idx, 1);
        renderAll();
      });
    }

    function computeImpact() {
      const ingMap = {};
      ings.forEach(function (i) {
        ingMap[i.id] = Object.assign({}, i);
      });
      // Apply changes to a cloned map
      const changeMap = {};
      changes.forEach(function (c) { changeMap[c.ingredientId] = c.percent; });
      Object.keys(ingMap).forEach(function (iid) {
        if (changeMap[iid] !== undefined) {
          ingMap[iid].pricePerUnit = ingMap[iid].pricePerUnit * (1 + changeMap[iid] / 100);
        }
      });

      const affected = [];
      recipes.forEach(function (r) {
        const uses = (r.ingredients || []).some(function (ri) { return changeMap[ri.ingredientId] !== undefined; });
        if (!uses) return;
        // compute cost with original, then with simulated
        const originalMap = {};
        ings.forEach(function (i) { originalMap[i.id] = i; });
        const oldCost = PCD.recipes.computeFoodCost(r, originalMap);
        const newCost = PCD.recipes.computeFoodCost(r, ingMap);
        const deltaAbs = newCost - oldCost;
        const deltaPct = oldCost > 0 ? (deltaAbs / oldCost) * 100 : 0;
        affected.push({ recipe: r, oldCost: oldCost, newCost: newCost, deltaAbs: deltaAbs, deltaPct: deltaPct });
      });
      affected.sort(function (a, b) { return Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs); });
      return affected;
    }

    function renderImpact() {
      const impactEl = PCD.$('#impact', view);
      PCD.clear(impactEl);
      if (changes.length === 0) return;
      const affected = computeImpact();
      if (affected.length === 0) {
        impactEl.innerHTML = '<div class="empty"><div class="empty-desc">' + t('whatif_recipes_affected').replace('{n}', 0) + '</div></div>';
        return;
      }
      const totalDelta = affected.reduce(function (a, x) { return a + x.deltaAbs; }, 0);
      const avgDelta = totalDelta / affected.length;

      let html = '<div class="grid mb-3" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">';
      html += '<div class="stat">';
      html += '<div class="stat-label">' + t('whatif_affected') + '</div>';
      html += '<div class="stat-value">' + affected.length + '</div>';
      html += '</div>';
      html += '<div class="stat">';
      html += '<div class="stat-label">' + t('whatif_avg_cost_change') + '</div>';
      html += '<div class="stat-value" style="color:' + (avgDelta >= 0 ? 'var(--danger)' : 'var(--success)') + ';">' + (avgDelta >= 0 ? '+' : '') + PCD.fmtMoney(avgDelta) + '</div>';
      html += '</div>';
      html += '</div>';

      html += '<div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + t('whatif_recipes_affected').replace('{n}', affected.length) + '</div>';
      html += '<div class="flex flex-col gap-2">';
      affected.forEach(function (x) {
        const sign = x.deltaAbs >= 0 ? '+' : '';
        const color = x.deltaAbs >= 0 ? 'var(--danger)' : 'var(--success)';
        html += '<div class="list-item" style="min-height:auto;padding:10px;">';
        html += '<div class="list-item-thumb" style="width:40px;height:40px;' + (x.recipe.photo ? 'background-image:url(' + PCD.escapeHtml(x.recipe.photo) + ');background-size:cover;background-position:center;' : '') + '">' + (x.recipe.photo ? '' : '🍽️') + '</div>';
        html += '<div class="list-item-body">';
        html += '<div class="list-item-title" style="font-size:14px;">' + PCD.escapeHtml(x.recipe.name) + '</div>';
        html += '<div class="list-item-meta" style="font-size:12px;">';
        html += '<span>' + PCD.fmtMoney(x.oldCost) + ' → <span style="color:' + color + ';font-weight:700;">' + PCD.fmtMoney(x.newCost) + '</span></span>';
        html += '<span>·</span>';
        html += '<span style="color:' + color + ';font-weight:700;">' + sign + PCD.fmtMoney(x.deltaAbs) + ' (' + sign + PCD.fmtPercent(x.deltaPct, 1) + ')</span>';
        html += '</div></div></div>';
      });
      html += '</div>';

      impactEl.innerHTML = html;
    }

    function renderAll() {
      renderChanges();
      renderImpact();
    }

    function addChange() {
      const items = ings.map(function (i) {
        return { id: i.id, name: i.name, meta: PCD.fmtMoney(i.pricePerUnit) + '/' + i.unit, thumb: '' };
      });
      if (items.length === 0) { PCD.toast.warning(t('no_ingredients_yet')); return; }
      const excluded = changes.map(function (c) { return c.ingredientId; });
      const available = items.filter(function (it) { return excluded.indexOf(it.id) < 0; });
      if (available.length === 0) { PCD.toast.info('All ingredients already in scenario'); return; }
      PCD.picker.open({
        title: t('whatif_ingredient'), items: available, multi: false,
      }).then(function (sel) {
        if (sel && sel.length) {
          changes.push({ ingredientId: sel[0], percent: 20 });
          renderAll();
        }
      });
    }

    PCD.$('#addChangeBtn', view).addEventListener('click', addChange);
    renderAll();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.whatif = { render: render };
})();
