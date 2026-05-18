/* ================================================================
   ProChefDesk — whatif.js
   What-If Simulator.
   Add price changes for ingredients; see which recipes are impacted
   and by how much.

   Example: "Beef mince +20%" → shows every recipe using beef mince,
   new food cost, and delta.

   v2.9.11 — NAKED→RICH upgrade: closeable inline guide, impact hero
   (recipes affected + worst delta + total cost shift). Pattern: buffet
   v2.8.77, variance v2.9.2, sales v2.9.10.
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

    // v2.9.11 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_whatif_guide_hidden') === '1'; } catch (e) { return false; }
    })();

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

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('whatif_guide_title') || 'How to run a price-change simulation')}</span>
            <button type="button" id="whatifGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('whatif_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('whatif_guide_step1_title') || 'Add a price change')}</strong> — ${PCD.escapeHtml(t('whatif_guide_step1_body') || 'Pick an ingredient (beef, oil, butter, whatever spiked). Default change is +20% — adjust with the slider or type a value.')}</li>
              <li><strong>${PCD.escapeHtml(t('whatif_guide_step2_title') || 'Stack multiple changes')}</strong> — ${PCD.escapeHtml(t('whatif_guide_step2_body') || 'Add more ingredients to model a supplier-wide price shock or seasonal swing. Each change applies simultaneously to the recipe cost calculation.')}</li>
              <li><strong>${PCD.escapeHtml(t('whatif_guide_step3_title') || 'See which recipes bleed')}</strong> — ${PCD.escapeHtml(t('whatif_guide_step3_body') || 'Affected recipes appear below, sorted by largest absolute delta. The worst-hit dishes are candidates for a portion size, price, or supplier change.')}</li>
              <li><strong>${PCD.escapeHtml(t('whatif_guide_step4_title') || 'Sandbox — nothing saves')}</strong> — ${PCD.escapeHtml(t('whatif_guide_step4_body') || 'Changes here are in-memory only. To actually update prices, go to the Ingredient editor. Reload this page = scenario gone.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('whatif_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('whatif_guide_tip_body') || 'Before signing a new supplier contract, simulate their proposed prices vs current. If 80% of your top dishes go red, walk away from the deal.')}
            </div>
          </div>
        </details>
      ` : ''}

      <div id="changesList" class="flex flex-col gap-2 mb-3"></div>
      <div id="impact"></div>
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#whatifGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_whatif_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

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
      // v2.9.11 — Worst affected recipe (largest absolute delta)
      const worst = affected[0]; // already sorted by deltaAbs desc
      const worstColor = worst && worst.deltaAbs >= 0 ? '#dc2626' : '#16a34a';

      // v2.9.11 — Stats hero
      let html = '<div class="stat mb-3" style="background:linear-gradient(135deg,' + worstColor + '18,var(--surface));border-color:' + worstColor + ';padding:18px;">';
      html += '<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">';
      html += '<div style="flex-shrink:0;">';
      html += '<div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('whatif_affected') || 'Recipes affected') + '</div>';
      html += '<div style="font-size:42px;font-weight:900;color:' + worstColor + ';line-height:1;letter-spacing:-0.02em;">' + affected.length + '</div>';
      html += '</div>';
      html += '<div style="flex:1;min-width:180px;">';
      if (worst) {
        html += '<span style="display:inline-block;padding:4px 10px;background:' + worstColor + '25;color:' + worstColor + ';font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">' + PCD.escapeHtml(t('whatif_worst_hit') || 'Worst hit') + ': ' + PCD.escapeHtml(worst.recipe.name) + '</span>';
      }
      html += '<div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">' + (worst ? (worst.deltaAbs >= 0 ? '+' : '') + PCD.fmtMoney(worst.deltaAbs) + ' (' + (worst.deltaPct >= 0 ? '+' : '') + worst.deltaPct.toFixed(1) + '%) ' + PCD.escapeHtml(t('whatif_per_serving_change') || 'per serving cost shift') : '') + '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('whatif_avg_cost_change') || 'Avg cost change') + '</div><div style="font-size:18px;font-weight:700;color:' + (avgDelta >= 0 ? 'var(--danger)' : 'var(--success)') + ';">' + (avgDelta >= 0 ? '+' : '') + PCD.fmtMoney(avgDelta) + '</div></div>';
      html += '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('whatif_total_shift') || 'Total cost shift') + '</div><div style="font-size:18px;font-weight:700;color:' + (totalDelta >= 0 ? 'var(--danger)' : 'var(--success)') + ';">' + (totalDelta >= 0 ? '+' : '') + PCD.fmtMoney(totalDelta) + '</div></div>';
      html += '</div></div>';

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
      if (available.length === 0) { PCD.toast.info(t('whatif_all_ingredients_in_scenario')); return; }
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
