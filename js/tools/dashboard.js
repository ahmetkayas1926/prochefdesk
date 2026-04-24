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

    // Compute recipe stats for trend + top widgets (ingMap already built above)
    const myRecipes = recipes.filter(function (r) { return !r.isSample; });
    const recipeStats = myRecipes.map(function (r) {
      const cost = PCD.recipes && PCD.recipes.computeFoodCost ? PCD.recipes.computeFoodCost(r, ingMap) : 0;
      const cps = r.servings ? cost / r.servings : cost;
      const margin = (r.salePrice && r.salePrice > 0) ? r.salePrice - cps : null;
      return { r: r, cost: cost, cps: cps, margin: margin };
    });
    const topExpensive = recipeStats.slice().sort(function (a, b) { return b.cps - a.cps; }).slice(0, 3);
    const topMargin = recipeStats.filter(function (s) { return s.margin !== null; }).sort(function (a, b) { return b.margin - a.margin; }).slice(0, 3);

    // Food cost trend: last N recipes by updatedAt
    const trendData = myRecipes
      .filter(function (r) { return r.salePrice && r.salePrice > 0; })
      .slice()
      .sort(function (a, b) { return (a.updatedAt || '').localeCompare(b.updatedAt || ''); })
      .slice(-8)
      .map(function (r) {
        const cost = PCD.recipes && PCD.recipes.computeFoodCost ? PCD.recipes.computeFoodCost(r, ingMap) : 0;
        const cps = r.servings ? cost / r.servings : cost;
        const pct = r.salePrice > 0 ? (cps / r.salePrice) * 100 : 0;
        return { name: r.name, pct: pct };
      });

    const greeting = user && user.name
      ? `${t('dashboard_title')}, ${PCD.escapeHtml(user.name.split(' ')[0])}`
      : t('dashboard_title');

    // Build trend SVG
    let trendSvg = '';
    if (trendData.length >= 2) {
      const W = 560, H = 130, pad = 20;
      const vals = trendData.map(function (d) { return d.pct; });
      const min = Math.min.apply(null, vals.concat([20]));
      const max = Math.max.apply(null, vals.concat([50]));
      const range = max - min || 1;
      const step = (W - pad * 2) / (trendData.length - 1);
      let path = '';
      let dots = '';
      trendData.forEach(function (d, i) {
        const x = pad + i * step;
        const y = H - pad - ((d.pct - min) / range) * (H - pad * 2);
        path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1);
        const color = d.pct <= 35 ? 'var(--success)' : d.pct <= 45 ? 'var(--warning)' : 'var(--danger)';
        dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + color + '"><title>' + PCD.escapeHtml(d.name) + ': ' + d.pct.toFixed(1) + '%</title></circle>';
      });
      trendSvg =
        '<div class="card mb-4" style="padding:14px 16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">' +
            '<div style="font-weight:700;font-size:14px;">Food cost trend · last ' + trendData.length + ' recipes</div>' +
            '<div class="text-muted" style="font-size:11px;">Green ≤ 35% · Amber ≤ 45% · Red &gt;</div>' +
          '</div>' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
            '<path d="' + path + '" fill="none" stroke="var(--brand-600)" stroke-width="2"/>' +
            dots +
          '</svg>' +
        '</div>';
    }

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

      ${trendSvg}

      ${(topExpensive.length > 0 || topMargin.length > 0) ? `
        <div class="grid mb-4" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));gap:12px;">
          ${topExpensive.length > 0 ? `
            <div class="card" style="padding:14px;">
              <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Most Expensive Recipes</div>
              ${topExpensive.map(function (s) { return '<div data-rid="' + s.r.id + '" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;">' +
                '<span style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(s.r.name) + '</span>' +
                '<span style="font-weight:700;color:var(--danger);white-space:nowrap;">' + PCD.fmtMoney(s.cps) + '</span>' +
              '</div>'; }).join('')}
            </div>
          ` : ''}
          ${topMargin.length > 0 ? `
            <div class="card" style="padding:14px;">
              <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Best Margin Recipes</div>
              ${topMargin.map(function (s) { return '<div data-rid="' + s.r.id + '" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;">' +
                '<span style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(s.r.name) + '</span>' +
                '<span style="font-weight:700;color:var(--success);white-space:nowrap;">' + PCD.fmtMoney(s.margin) + '</span>' +
              '</div>'; }).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

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
