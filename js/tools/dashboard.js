/* ================================================================
   ProChefDesk — dashboard.js
   Overview: quick stats, recent recipes, quick actions.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function computeFoodCost(recipe, ingMap) {
    if (!recipe || !recipe.ingredients) return 0;
    let total = 0;
    recipe.ingredients.forEach(function (ri) {
      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      const amt = Number(ri.amount) || 0;
      let price = Number(ing.pricePerUnit) || 0;
      // Convert units if needed
      if (ri.unit && ing.unit && ri.unit !== ing.unit) {
        try {
          const converted = PCD.convertUnit(amt, ri.unit, ing.unit);
          total += converted * price;
          return;
        } catch (e) {}
      }
      total += amt * price;
    });
    return total;
  }

  PCD.recipes = PCD.recipes || {};
  PCD.recipes.computeFoodCost = computeFoodCost;

  function render(view) {
    const t = PCD.i18n.t;
    const user = PCD.store.get('user');
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const ingMap = {};
    ings.forEach(function (i) { ingMap[i.id] = i; });

    // Stats
    let avgFoodCost = null;
    let totalFoodCostPct = 0, pctCount = 0;
    recipes.forEach(function (r) {
      const cost = computeFoodCost(r, ingMap);
      if (r.salePrice && r.salePrice > 0) {
        const costPerServing = cost / (r.servings || 1);
        const pricePerServing = r.salePrice;
        const pct = (costPerServing / pricePerServing) * 100;
        totalFoodCostPct += pct;
        pctCount++;
      }
    });
    if (pctCount > 0) avgFoodCost = totalFoodCostPct / pctCount;

    // Phase 3 stats: low stock count
    let lowStockCount = 0;
    if (PCD.tools && PCD.tools.inventory && PCD.tools.inventory.computeStatus) {
      const invAll = PCD.store._read('inventory') || {};
      ings.forEach(function (i) {
        const row = invAll[i.id];
        const s = PCD.tools.inventory.computeStatus(row);
        if (s === 'low' || s === 'critical' || s === 'out') lowStockCount++;
      });
    }

    // Phase 3 stats: upcoming event
    let upcomingEvent = null;
    if (PCD.store.listTable) {
      const events = PCD.store.listTable('events');
      const nowIso = new Date().toISOString().slice(0, 10);
      const upcoming = events.filter(function (e) {
        return e.date && e.date >= nowIso && e.status !== 'cancelled' && e.status !== 'done';
      }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      upcomingEvent = upcoming[0] || null;
    }

    const greeting = user && user.name
      ? `${t('dashboard_title')}, ${PCD.escapeHtml(user.name.split(' ')[0])}`
      : t('dashboard_title');

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${greeting}</div>
          <div class="page-subtitle">${t('dashboard_subtitle')}</div>
        </div>
      </div>

      <div class="grid grid-2 mb-4" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
        <div class="stat">
          <div class="stat-label">${t('stat_recipes')}</div>
          <div class="stat-value">${recipes.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('stat_ingredients')}</div>
          <div class="stat-value">${ings.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('stat_avg_food_cost')}</div>
          <div class="stat-value">${avgFoodCost !== null ? PCD.fmtPercent(avgFoodCost, 0) : '—'}</div>
        </div>
        <div class="stat${lowStockCount > 0 ? ' card-hover' : ''}" ${lowStockCount > 0 ? 'data-action="view-inventory" style="cursor:pointer;"' : ''}>
          <div class="stat-label">${t('stat_low_stock')}</div>
          <div class="stat-value" style="${lowStockCount > 0 ? 'color:var(--warning);' : ''}">${lowStockCount}</div>
        </div>
      </div>

      ${upcomingEvent ? `
        <div class="card card-hover mb-4" data-action="view-event" data-eid="${upcomingEvent.id}" style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--brand-100));border-color:var(--brand-300);cursor:pointer;">
          <div class="flex items-center gap-3">
            <div style="flex-shrink:0;color:var(--brand-700);">${PCD.icon('calendar', 28)}</div>
            <div style="flex:1;min-width:0;">
              <div class="text-muted text-sm" style="font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--brand-700);">Upcoming event</div>
              <div style="font-weight:700;font-size:15px;letter-spacing:-0.01em;">${PCD.escapeHtml(upcomingEvent.name)}</div>
              <div class="text-muted text-sm">${PCD.fmtDate(upcomingEvent.date, {weekday:'short', month:'short', day:'numeric'})}${upcomingEvent.guestCount ? ' · ' + upcomingEvent.guestCount + ' guests' : ''}</div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="section">
        <div class="section-header">
          <div class="section-title">${t('quick_actions')}</div>
        </div>
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));">
          <button class="card card-hover" data-action="new-recipe" style="padding:16px;text-align:center;border:1px solid var(--border);">
            <div style="margin-bottom:6px;display:flex;justify-content:center;color:var(--brand-600);">${PCD.icon('book-open', 28)}</div>
            <div style="font-weight:600;font-size:13px;">${t('new_recipe')}</div>
          </button>
          <button class="card card-hover" data-action="new-ingredient" style="padding:16px;text-align:center;border:1px solid var(--border);">
            <div style="margin-bottom:6px;display:flex;justify-content:center;color:var(--brand-600);">${PCD.icon('carrot', 28)}</div>
            <div style="font-weight:600;font-size:13px;">${t('new_ingredient')}</div>
          </button>
          <button class="card card-hover" data-action="all-tools" style="padding:16px;text-align:center;border:1px solid var(--border);">
            <div style="margin-bottom:6px;display:flex;justify-content:center;color:var(--brand-600);">${PCD.icon('grid', 28)}</div>
            <div style="font-weight:600;font-size:13px;">${t('nav_tools')}</div>
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">${t('recent_recipes')}</div>
          ${recipes.length > 0 ? `<button class="btn btn-ghost btn-sm" data-action="view-recipes">${t('view')} →</button>` : ''}
        </div>
        <div id="dashRecentRecipes" class="flex flex-col gap-2"></div>
      </div>
    `;

    const listEl = PCD.$('#dashRecentRecipes', view);
    const recentRecipes = recipes.slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }).slice(0, 5);

    if (recentRecipes.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🍽️</div>
          <div class="empty-title">${t('no_recipes_yet')}</div>
          <div class="empty-desc">${t('no_recipes_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" data-action="new-recipe">+ ${t('new_recipe')}</button></div>
        </div>
      `;
    } else {
      recentRecipes.forEach(function (r) {
        const cost = computeFoodCost(r, ingMap);
        const row = PCD.el('div', { class: 'list-item', 'data-rid': r.id });
        const thumb = PCD.el('div', { class: 'list-item-thumb' });
        if (r.photo) thumb.style.backgroundImage = 'url(' + r.photo + ')';
        else thumb.textContent = '🍽️';
        const body = PCD.el('div', { class: 'list-item-body' });
        body.innerHTML = `
          <div class="list-item-title">${PCD.escapeHtml(r.name)}</div>
          <div class="list-item-meta">
            <span>${t(r.category || 'cat_main')}</span>
            <span>·</span>
            <span>${r.servings || 1} ${t('recipe_servings').toLowerCase()}</span>
            ${cost > 0 ? '<span>·</span><span>' + PCD.fmtMoney(cost) + '</span>' : ''}
          </div>
        `;
        row.appendChild(thumb);
        row.appendChild(body);
        listEl.appendChild(row);
      });
    }

    // Wire up
    PCD.on(view, 'click', '[data-action="new-recipe"]', function () {
      PCD.tools.recipes.openEditor();
    });
    PCD.on(view, 'click', '[data-action="new-ingredient"]', function () {
      PCD.tools.ingredients.openEditor();
    });
    PCD.on(view, 'click', '[data-action="all-tools"]', function () {
      PCD.router.go('tools');
    });
    PCD.on(view, 'click', '[data-action="view-recipes"]', function () {
      PCD.router.go('recipes');
    });
    PCD.on(view, 'click', '[data-action="view-inventory"]', function () {
      PCD.router.go('inventory');
    });
    PCD.on(view, 'click', '[data-action="view-event"]', function () {
      const eid = this.getAttribute('data-eid');
      PCD.router.go('events');
      setTimeout(function () {
        if (PCD.tools.events && PCD.tools.events.openEditor) PCD.tools.events.openEditor(eid);
      }, 200);
    });
    PCD.on(view, 'click', '[data-rid]', function () {
      const rid = this.getAttribute('data-rid');
      PCD.tools.recipes.openPreview(rid);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.dashboard = { render: render };
})();
