/* ================================================================
   ProChefDesk — portion.js
   Instant portion calculator. Pick a recipe, change target portions,
   see all ingredients scaled + new food cost.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name||'').localeCompare(b.name||''); });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('portion_title')}</div>
          <div class="page-subtitle">${t('portion_desc')}</div>
        </div>
      </div>
      <div id="portionBody"></div>
    `;

    const bodyEl = PCD.$('#portionBody', view);

    if (recipes.length === 0) {
      bodyEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⚖️</div>
          <div class="empty-title">${t('no_recipes_yet')}</div>
          <div class="empty-desc">${t('no_recipes_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="pcNewR">+ ${t('new_recipe')}</button></div>
        </div>
      `;
      const nb = PCD.$('#pcNewR', bodyEl);
      if (nb) nb.addEventListener('click', function () { PCD.tools.recipes.openEditor(); });
      return;
    }

    // Pick recipe UI: card showing currently selected + swap button
    let selectedId = recipes[0].id;
    let targetPortions = recipes[0].servings || 4;

    function renderBody() {
      const r = PCD.store.getRecipe(selectedId);
      if (!r) {
        selectedId = recipes[0].id;
        targetPortions = recipes[0].servings || 4;
        return renderBody();
      }
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

      const origServings = r.servings || 1;
      const factor = targetPortions / origServings;
      const origCost = PCD.recipes.computeFoodCost(r, ingMap);
      const scaledCost = origCost * factor;
      const origCPS = origCost / origServings;

      bodyEl.innerHTML = `
        <div class="card mb-3">
          <div class="card-body" style="display:flex;gap:12px;align-items:center;">
            <div class="list-item-thumb" style="width:64px;height:64px;${r.photo ? 'background-image:url(' + PCD.escapeHtml(r.photo) + ');background-size:cover;background-position:center;' : ''}">${r.photo ? '' : '🍽️'}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:17px;font-weight:700;letter-spacing:-0.01em;">${PCD.escapeHtml(r.name)}</div>
              <div class="text-muted text-sm">${origServings} ${t('recipe_servings').toLowerCase()} · ${PCD.fmtMoney(origCPS)} ${t('per_serving').toLowerCase()}</div>
            </div>
            <button class="btn btn-outline btn-sm" id="pickRecipe">${t('portion_pick')}</button>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="stat-label">${t('portion_to')}</div>
                <div style="font-size:32px;font-weight:800;letter-spacing:-0.02em;" id="portionDisplay">${targetPortions}</div>
              </div>
              <div class="text-center">
                <div class="stat-label">${t('portion_multiplier')}</div>
                <div style="font-size:18px;font-weight:700;color:var(--brand-600);">×${factor.toFixed(2)}</div>
              </div>
            </div>

            <div class="flex items-center gap-2 mb-2">
              <button class="btn btn-outline btn-sm" id="decBig" style="min-width:42px;">−5</button>
              <button class="btn btn-outline btn-sm" id="decOne" style="min-width:42px;">−1</button>
              <input type="range" id="portionSlider" min="1" max="200" value="${targetPortions}" style="flex:1;accent-color:var(--brand-600);">
              <button class="btn btn-outline btn-sm" id="incOne" style="min-width:42px;">+1</button>
              <button class="btn btn-outline btn-sm" id="incBig" style="min-width:42px;">+5</button>
            </div>
            <div class="flex gap-2" style="flex-wrap:wrap;">
              ${[2, 4, 6, 10, 20, 50, 100].map(function (n) {
                return '<button class="chip' + (n === targetPortions ? ' chip-brand' : '') + '" data-pset="' + n + '" style="cursor:pointer;">' + n + '</button>';
              }).join('')}
            </div>
          </div>
        </div>

        <div class="grid grid-2 mb-3" style="gap:8px;">
          <div class="stat">
            <div class="stat-label">${t('food_cost')} (${t('total').toLowerCase()})</div>
            <div class="stat-value" style="font-size:22px;">${PCD.fmtMoney(scaledCost)}</div>
            ${origCost > 0 ? '<div class="text-muted text-sm">orig: ' + PCD.fmtMoney(origCost) + '</div>' : ''}
          </div>
          <div class="stat">
            <div class="stat-label">${t('cost_per_serving')}</div>
            <div class="stat-value" style="font-size:22px;">${PCD.fmtMoney(origCPS)}</div>
          </div>
        </div>

        <div class="section-title mb-2">${t('recipe_ingredients')}</div>
        <div id="scaledList" class="flex flex-col gap-2"></div>

        <div class="flex gap-2 mt-4">
          <button class="btn btn-outline btn-block" id="copyList">${PCD.icon('copy',16)} Copy list</button>
          <button class="btn btn-primary btn-block" id="sendShop">${PCD.icon('plus',16)} Create shopping list</button>
        </div>
      `;

      // Render scaled ingredient list
      const listEl = PCD.$('#scaledList', bodyEl);
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '(removed)';
        const scaledAmt = (ri.amount || 0) * factor;
        const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '10px 12px' } });
        row.innerHTML = `
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(name)}</div>
            <div class="list-item-meta" style="font-size:13px;">
              <span style="font-family:var(--font-mono);font-weight:600;">${PCD.fmtNumber(scaledAmt)} ${ri.unit || ''}</span>
              <span class="text-muted">·</span>
              <span class="text-muted">from ${PCD.fmtNumber(ri.amount)} ${ri.unit || ''}</span>
            </div>
          </div>
        `;
        listEl.appendChild(row);
      });

      wireControls();
    }

    function wireControls() {
      const slider = PCD.$('#portionSlider', bodyEl);
      const display = PCD.$('#portionDisplay', bodyEl);

      function setPortions(n) {
        n = Math.max(1, Math.min(200, Math.round(n)));
        targetPortions = n;
        renderBody();
      }

      slider.addEventListener('input', function () { targetPortions = parseInt(this.value, 10); display.textContent = targetPortions; });
      slider.addEventListener('change', function () { renderBody(); });

      PCD.$('#decBig', bodyEl).addEventListener('click', function () { setPortions(targetPortions - 5); PCD.haptic('tick'); });
      PCD.$('#decOne', bodyEl).addEventListener('click', function () { setPortions(targetPortions - 1); PCD.haptic('tick'); });
      PCD.$('#incOne', bodyEl).addEventListener('click', function () { setPortions(targetPortions + 1); PCD.haptic('tick'); });
      PCD.$('#incBig', bodyEl).addEventListener('click', function () { setPortions(targetPortions + 5); PCD.haptic('tick'); });
      PCD.$$('[data-pset]', bodyEl).forEach(function (b) {
        b.addEventListener('click', function () {
          setPortions(parseInt(this.getAttribute('data-pset'), 10));
          PCD.haptic('light');
        });
      });

      PCD.$('#pickRecipe', bodyEl).addEventListener('click', function () {
        const items = recipes.map(function (rec) {
          return { id: rec.id, name: rec.name, meta: (rec.servings || 1) + ' portions', thumb: rec.photo || '' };
        });
        PCD.picker.open({
          title: PCD.i18n.t('portion_pick'),
          items: items, multi: false, selected: [selectedId]
        }).then(function (sel) {
          if (sel && sel.length) {
            selectedId = sel[0];
            const r2 = PCD.store.getRecipe(selectedId);
            targetPortions = r2 ? (r2.servings || 4) : 4;
            renderBody();
          }
        });
      });

      PCD.$('#copyList', bodyEl).addEventListener('click', function () {
        const r = PCD.store.getRecipe(selectedId);
        const ingMap = {};
        PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
        const factor = targetPortions / (r.servings || 1);
        const lines = [
          r.name + ' — ' + targetPortions + ' portions',
          ''
        ];
        (r.ingredients || []).forEach(function (ri) {
          const ing = ingMap[ri.ingredientId];
          const name = ing ? ing.name : '(?)';
          lines.push('- ' + name + ': ' + PCD.fmtNumber((ri.amount||0) * factor) + ' ' + (ri.unit||''));
        });
        const text = lines.join('\n');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () { PCD.toast.success('Copied'); });
        } else {
          PCD.toast.info(text.slice(0, 80));
        }
      });

      PCD.$('#sendShop', bodyEl).addEventListener('click', function () {
        // Create a shopping list with just this recipe+portion
        const r = PCD.store.getRecipe(selectedId);
        const list = {
          name: r.name + ' — ' + targetPortions + 'p',
          items: [{ recipeId: r.id, portions: targetPortions }],
        };
        const saved = PCD.store.upsertInTable('shoppingLists', list, 's');
        PCD.toast.success(PCD.i18n.t('shop_saved'));
        setTimeout(function () { PCD.router.go('shopping'); }, 500);
      });
    }

    renderBody();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.portion = { render: render };
})();
