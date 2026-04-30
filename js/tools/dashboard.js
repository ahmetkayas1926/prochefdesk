/* ================================================================
   ProChefDesk — dashboard.js
   Overview: quick stats, recent recipes, quick actions.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Compute total food cost of a recipe.
  // Supports SUB-RECIPES: an ingredient line can be a recipe reference
  // ({ recipeId, amount, unit }) instead of an ingredient ({ ingredientId, ... }).
  // Sub-recipe cost is calculated recursively and scaled to the amount used.
  // Cycle-protected via a visited set passed down through recursion.
  function computeFoodCost(recipe, ingMap, recipeMap, _visited) {
    if (!recipe || !recipe.ingredients) return 0;
    // If recipeMap not provided, auto-build (works for sub-recipes from current workspace)
    if (!recipeMap) recipeMap = buildRecipeMap();
    _visited = _visited || {};
    if (recipe.id) {
      if (_visited[recipe.id]) return 0; // cycle — bail out
      _visited[recipe.id] = true;
    }

    let total = 0;
    recipe.ingredients.forEach(function (ri) {
      const amt = Number(ri.amount) || 0;
      if (amt <= 0) return;

      // SUB-RECIPE LINE
      if (ri.recipeId) {
        if (!recipeMap) return;
        const sub = recipeMap[ri.recipeId];
        if (!sub) return;
        // Cost of full sub-recipe
        const subTotalCost = computeFoodCost(sub, ingMap, recipeMap, Object.assign({}, _visited));
        const subYield = sub.yieldAmount || sub.servings || 1;
        const subUnit = sub.yieldUnit || 'portion';
        // Scale: how much of the sub-recipe are we using?
        let scale = amt / (subYield || 1);
        if (ri.unit && subUnit && ri.unit !== subUnit) {
          // Best-effort unit conversion
          try {
            const conv = PCD.convertUnit(amt, ri.unit, subUnit);
            scale = conv / (subYield || 1);
          } catch (e) {}
        }
        total += subTotalCost * scale;
        return;
      }

      // INGREDIENT LINE (legacy)
      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      let price = Number(ing.pricePerUnit) || 0;
      // Apply yield% if defined (e.g. chicken bone-in 70% → true cost = price / 0.7)
      const yld = Number(ing.yieldPercent);
      if (yld && yld > 0 && yld < 100) {
        price = price / (yld / 100);
      }
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

  // Helper for callers that don't have recipeMap
  function buildRecipeMap() {
    const map = {};
    PCD.store.listRecipes().forEach(function (r) { map[r.id] = r; });
    return map;
  }

  PCD.recipes = PCD.recipes || {};
  PCD.recipes.computeFoodCost = computeFoodCost;
  PCD.recipes.buildRecipeMap = buildRecipeMap;

  // ============ TODAY-FOCUSED DASHBOARD ============
  function render(view) {
    const t = PCD.i18n.t;
    const user = PCD.store.get('user');
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const ingMap = {};
    ings.forEach(function (i) { ingMap[i.id] = i; });

    // Greeting with time-of-day awareness
    const hour = new Date().getHours();
    const greet = hour < 12 ? t('dash_good_morning') : (hour < 18 ? t('dash_good_afternoon') : t('dash_good_evening'));
    const firstName = (user && user.name) ? user.name.split(' ')[0] : '';
    const headline = greet + (firstName ? ', ' + PCD.escapeHtml(firstName) : '');
    const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    // === Cards data ===
    // 1) Pending stock count approval
    const pending = PCD.store.get('pendingStockCount');

    // 2) Today's / upcoming event (next 7 days)
    const events = PCD.store.listTable ? PCD.store.listTable('events') : [];
    const today = new Date(); today.setHours(0,0,0,0);
    const sevenAhead = new Date(today.getTime() + 7 * 86400000);
    const upcomingEvents = events.filter(function (e) {
      if (!e.date) return false;
      if (e.status === 'cancelled' || e.status === 'done') return false;
      const d = new Date(e.date);
      return d >= today && d < sevenAhead;
    }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    const nextEvent = upcomingEvents[0] || null;

    // 3) Active checklists (in progress)
    const allSessions = PCD.store._read('checklistSessions') || {};
    const wsId = PCD.store.getActiveWorkspaceId();
    const sessions = Array.isArray(allSessions) ? allSessions : (allSessions[wsId] || []);
    const activeSessions = sessions.filter(function (s) { return !s.completedAt; });

    // 4) Low stock count + critical items
    const allInv = PCD.store._read('inventory') || {};
    const invWsId = PCD.store.getActiveWorkspaceId();
    const invAllKeys = Object.keys(allInv);
    const invSample = invAllKeys.length > 0 ? allInv[invAllKeys[0]] : null;
    const isLegacyInv = invSample && (invSample.stock !== undefined || invSample.parLevel !== undefined);
    const invAll = isLegacyInv ? allInv : (allInv[invWsId] || {});
    let lowStockItems = [];
    if (PCD.tools && PCD.tools.inventory && PCD.tools.inventory.computeStatus) {
      ings.forEach(function (i) {
        const row = invAll[i.id];
        const s = PCD.tools.inventory.computeStatus(row);
        if (s === 'low' || s === 'critical' || s === 'out') {
          lowStockItems.push({ ing: i, status: s });
        }
      });
    }
    const criticalStock = lowStockItems.filter(function (x) { return x.status === 'critical' || x.status === 'out'; });

    // 5) Today's waste cost
    const allWaste = PCD.store._read('waste') || {};
    const wasteWsId = PCD.store.getActiveWorkspaceId();
    const waste = Array.isArray(allWaste) ? allWaste : (allWaste[wasteWsId] || []);
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayWaste = waste.filter(function (w) { return (w.at || '').slice(0, 10) === todayIso; });
    const todayWasteCost = todayWaste.reduce(function (sum, w) { return sum + (w.cost || 0); }, 0);

    // 6) Stats summary (always shown small at top)
    const stats = {
      recipes: recipes.length,
      ingredients: ings.length,
      menus: PCD.store.listTable ? PCD.store.listTable('menus').length : 0,
    };

    // 7) Broken recipes (v2.6.55) — recipes with "(removed ingredient)" or
    // "(removed sub-recipe)" lines. Leftovers from pre-v2.6.36 era when
    // ingredient deletion silently broke recipes.
    const brokenRecipes = (PCD.store.findBrokenRecipes && PCD.store.findBrokenRecipes()) || [];

    // === Build cards HTML ===
    const cards = [];

    // CARD: Pending approval (HIGHEST priority)
    if (pending && pending.status === 'pending') {
      cards.push({
        priority: 1,
        html:
          '<div class="dash-card priority-warn" data-action="view-inventory" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fef3c7;color:#92400e;">' + PCD.icon('clock', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_pending_count') + '</div>' +
              '<div class="dash-card-desc">' + t('dash_pending_count_desc', { name: PCD.escapeHtml(pending.countedBy), time: PCD.fmtRelTime(pending.countedAt), n: Object.keys(pending.counts || {}).length }) + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_review_cta') + '</div>' +
          '</div>'
      });
    }

    // CARD: Today's event
    if (nextEvent) {
      const evDate = new Date(nextEvent.date);
      const isToday = nextEvent.date === todayIso;
      const dayLabel = isToday ? t('dash_today') : (nextEvent.date === new Date(today.getTime() + 86400000).toISOString().slice(0, 10) ? t('dash_tomorrow') : evDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
      const guestStr = nextEvent.guestCount ? t('dash_guests_suffix', { n: nextEvent.guestCount }) : '';
      const venueStr = nextEvent.venue ? t('dash_venue_suffix', { venue: PCD.escapeHtml(nextEvent.venue) }) : '';
      cards.push({
        priority: isToday ? 1 : 3,
        html:
          '<div class="dash-card priority-' + (isToday ? 'now' : 'soon') + '" data-action="view-event" data-eid="' + nextEvent.id + '" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:var(--brand-50);color:var(--brand-700);">' + PCD.icon('calendar', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + PCD.escapeHtml(nextEvent.name) + '</div>' +
              '<div class="dash-card-desc">' + dayLabel + guestStr + venueStr + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_open_cta') + '</div>' +
          '</div>'
      });
    }

    // CARD: Active checklists
    if (activeSessions.length > 0) {
      const s = activeSessions[0];
      const total = (s.items || []).length;
      const done = (s.items || []).filter(function (i) { return i.done || i.value || i.result; }).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      cards.push({
        priority: 2,
        html:
          '<div class="dash-card" data-action="view-checklist" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#dbeafe;color:#1e40af;">' + PCD.icon('check-square', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_active_checklists', { n: activeSessions.length, s: activeSessions.length === 1 ? '' : 's' }) + '</div>' +
              '<div class="dash-card-desc">' + t('dash_session_progress', { name: PCD.escapeHtml(s.templateName || 'Session'), done: done, total: total, pct: pct }) + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_continue_cta') + '</div>' +
          '</div>'
      });
    }

    // CARD: Broken recipes (v2.6.55) — show when there are recipes with
    // orphan ingredient/sub-recipe references. Click → open self-heal modal.
    if (brokenRecipes.length > 0) {
      const sample = brokenRecipes.slice(0, 3).map(function (b) { return b.recipe.name || '(untitled)'; }).join(', ');
      const more = brokenRecipes.length > 3 ? ' +' + (brokenRecipes.length - 3) : '';
      const totalLines = brokenRecipes.reduce(function (sum, b) { return sum + b.brokenLines.length; }, 0);
      cards.push({
        priority: 2,
        html:
          '<div class="dash-card priority-warn" data-action="fix-broken-recipes" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fef3c7;color:#92400e;">' + PCD.icon('alert-triangle', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_broken_recipes_title', { n: brokenRecipes.length, lines: totalLines }) + '</div>' +
              '<div class="dash-card-desc">' + PCD.escapeHtml(sample) + more + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_fix_cta') + '</div>' +
          '</div>'
      });
    }

    // CARD: Critical stock
    if (criticalStock.length > 0) {
      const sample = criticalStock.slice(0, 3).map(function (x) { return x.ing.name; }).join(', ');
      const more = criticalStock.length > 3 ? ' +' + (criticalStock.length - 3) : '';
      cards.push({
        priority: 1,
        html:
          '<div class="dash-card priority-warn" data-action="view-inventory" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fee2e2;color:#991b1b;">' + PCD.icon('alert-triangle', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_critical_stock', { n: criticalStock.length, s: criticalStock.length === 1 ? '' : 's' }) + '</div>' +
              '<div class="dash-card-desc">' + PCD.escapeHtml(sample) + more + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_order_cta') + '</div>' +
          '</div>'
      });
    } else if (lowStockItems.length > 0) {
      cards.push({
        priority: 3,
        html:
          '<div class="dash-card" data-action="view-inventory" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fef3c7;color:#92400e;">' + PCD.icon('package', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_low_stock', { n: lowStockItems.length, s: lowStockItems.length === 1 ? '' : 's' }) + '</div>' +
              '<div class="dash-card-desc">' + t('dash_low_stock_desc') + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_review_cta') + '</div>' +
          '</div>'
      });
    }

    // CARD: Today's waste cost (if any)
    if (todayWasteCost > 0) {
      cards.push({
        priority: 3,
        html:
          '<div class="dash-card" data-action="view-waste" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fee2e2;color:#991b1b;">' + PCD.icon('recycle', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + t('dash_today_waste', { amount: PCD.fmtMoney(todayWasteCost) }) + '</div>' +
              '<div class="dash-card-desc">' + t('dash_today_waste_desc', { n: todayWaste.length, y: todayWaste.length === 1 ? 'y' : 'ies' }) + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + t('dash_log_waste') + ' →</div>' +
          '</div>'
      });
    }

    // Sort by priority
    cards.sort(function (a, b) { return a.priority - b.priority; });

    // === Render ===
    view.innerHTML =
      '<style>' +
        '.dash-greet { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; color: var(--text); }' +
        '.dash-date { font-size: 14px; color: var(--text-3); margin-bottom: 24px; text-transform: capitalize; }' +
        '.dash-card { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); margin-bottom: 10px; transition: all .15s ease; }' +
        '.dash-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); border-color: var(--brand-300); }' +
        '.dash-card.priority-warn { border-left: 4px solid #f59e0b; }' +
        '.dash-card.priority-now { border-left: 4px solid var(--brand-600); background: linear-gradient(135deg, var(--brand-50), var(--surface)); }' +
        '.dash-card.priority-soon { border-left: 4px solid var(--brand-300); }' +
        '.dash-card-icon { width: 44px; height: 44px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }' +
        '.dash-card-body { flex: 1; min-width: 0; }' +
        '.dash-card-title { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 2px; }' +
        '.dash-card-desc { font-size: 13px; color: var(--text-3); }' +
        '.dash-card-cta { font-weight: 700; font-size: 12px; color: var(--brand-700); white-space: nowrap; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.04em; }' +
        '.dash-empty { padding: 32px 16px; text-align: center; border: 1px dashed var(--border-strong); border-radius: var(--r-md); color: var(--text-3); }' +
        '.dash-empty-title { font-size: 16px; font-weight: 600; color: var(--text-2); margin-bottom: 4px; }' +
        '.dash-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 24px; }' +
        '.dash-quick button { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); cursor: pointer; transition: all .15s ease; }' +
        '.dash-quick button:hover { border-color: var(--brand-600); background: var(--brand-50); }' +
        '.dash-quick button .icn { color: var(--brand-600); }' +
        '.dash-quick button .lbl { font-weight: 600; font-size: 14px; color: var(--text); }' +
        '.dash-stats { display: flex; gap: 14px; margin-top: 24px; padding: 14px 16px; background: var(--surface-2); border-radius: var(--r-md); flex-wrap: wrap; }' +
        '.dash-stat { display: flex; flex-direction: column; gap: 2px; padding: 6px 12px; border-radius: 8px; cursor: pointer; transition: all .15s ease; border: 1.5px solid transparent; }' +
        '.dash-stat:hover { background: var(--surface); border-color: var(--brand-300); transform: translateY(-1px); }' +
        '.dash-stat-num { font-size: 18px; font-weight: 700; color: var(--text); }' +
        '.dash-stat-lbl { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }' +
      '</style>' +

      '<h1 class="dash-greet">' + headline + '</h1>' +
      '<div class="dash-date">' + todayStr + (function () {
        const ws = PCD.store.getActiveWorkspace();
        return ws ? ' · <strong style="color:var(--brand-700);">' + PCD.escapeHtml(ws.name) + '</strong>' + (ws.role ? ' (' + PCD.escapeHtml(ws.role) + ')' : '') : '';
      })() + '</div>' +

      // Action cards (today's focus)
      (cards.length > 0
        ? '<div>' + cards.map(function (c) { return c.html; }).join('') + '</div>'
        : '<div class="dash-empty">' +
            '<div class="dash-empty-title">' + t('dash_all_clear') + '</div>' +
            '<div>' + t('dash_nothing_pressing') + '</div>' +
          '</div>'
      ) +

      // Quick actions
      '<div class="dash-quick">' +
        '<button data-action="new-recipe"><span class="icn">' + PCD.icon('book-open', 20) + '</span><span class="lbl">' + t('dash_new_recipe') + '</span></button>' +
        '<button data-action="open-menus"><span class="icn">' + PCD.icon('menu', 20) + '</span><span class="lbl">' + (t('t_menus_title') || 'Menu Builder') + '</span></button>' +
        '<button data-action="start-checklist"><span class="icn">' + PCD.icon('check-square', 20) + '</span><span class="lbl">' + t('dash_start_checklist') + '</span></button>' +
        '<button data-action="new-event"><span class="icn">' + PCD.icon('calendar', 20) + '</span><span class="lbl">' + t('dash_new_event') + '</span></button>' +
        '<button data-action="kitchen-cards"><span class="icn">' + PCD.icon('id-card', 20) + '</span><span class="lbl">' + (t('t_kitchen_cards_title') || 'Kitchen Cards') + '</span></button>' +
      '</div>' +

      // Library stats (small footer)
      '<div class="dash-stats">' +
        '<div class="dash-stat" data-action="open-recipes" role="button" tabindex="0" title="Recipes"><div class="dash-stat-num">' + stats.recipes + '</div><div class="dash-stat-lbl">' + t('dash_recipes_label') + '</div></div>' +
        '<div class="dash-stat" data-action="open-ingredients" role="button" tabindex="0" title="Ingredients"><div class="dash-stat-num">' + stats.ingredients + '</div><div class="dash-stat-lbl">' + t('dash_ingredients_label') + '</div></div>' +
        '<div class="dash-stat" data-action="open-menus-stat" role="button" tabindex="0" title="Menus"><div class="dash-stat-num">' + stats.menus + '</div><div class="dash-stat-lbl">' + t('dash_menus_label') + '</div></div>' +
      '</div>';

    // Wire actions
    PCD.on(view, 'click', '[data-action="new-recipe"]', function () {
      if (PCD.tools.recipes && PCD.tools.recipes.openEditor) PCD.tools.recipes.openEditor();
    });
    PCD.on(view, 'click', '[data-action="new-event"]', function () {
      PCD.router.go('events');
      setTimeout(function () { if (PCD.tools.events && PCD.tools.events.openEditor) PCD.tools.events.openEditor(); }, 200);
    });
    PCD.on(view, 'click', '[data-action="open-menus"]', function () {
      PCD.router.go('menus');
    });
    PCD.on(view, 'click', '[data-action="start-checklist"]', function () {
      PCD.router.go('checklist');
    });
    PCD.on(view, 'click', '[data-action="kitchen-cards"]', function () {
      PCD.router.go('kitchen_cards');
    });
    PCD.on(view, 'click', '[data-action="view-inventory"]', function () {
      PCD.router.go('inventory');
    });
    PCD.on(view, 'click', '[data-action="view-checklist"]', function () {
      PCD.router.go('checklist');
    });
    PCD.on(view, 'click', '[data-action="view-event"]', function () {
      const eid = this.getAttribute('data-eid');
      PCD.router.go('events');
      setTimeout(function () {
        if (PCD.tools.events && PCD.tools.events.openEditor) PCD.tools.events.openEditor(eid);
      }, 200);
    });
    PCD.on(view, 'click', '[data-action="view-waste"]', function () {
      PCD.router.go('waste');
    });
    // v2.6.55 — Self-heal: show broken recipes modal with "Fix all" action
    PCD.on(view, 'click', '[data-action="fix-broken-recipes"]', function () {
      openBrokenRecipesModal(view);
    });
    // Clickable stat tiles (Recipes / Ingredients / Menus counts)
    PCD.on(view, 'click', '[data-action="open-recipes"]', function () {
      PCD.router.go('recipes');
    });
    PCD.on(view, 'click', '[data-action="open-ingredients"]', function () {
      PCD.router.go('ingredients');
    });
    PCD.on(view, 'click', '[data-action="open-menus-stat"]', function () {
      PCD.router.go('menus');
    });
  }

  // v2.6.55 — Self-healing modal: lists recipes with broken
  // ingredient/sub-recipe references and offers a "Fix all" action that
  // strips the orphan lines from each recipe.
  function openBrokenRecipesModal(view) {
    const t = PCD.i18n.t;
    const broken = (PCD.store.findBrokenRecipes && PCD.store.findBrokenRecipes()) || [];
    if (broken.length === 0) {
      PCD.toast.success(t('selfheal_already_clean', '✓ All recipes look clean'));
      return;
    }

    const body = PCD.el('div');
    let html =
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.6;">' +
        t('selfheal_intro', 'These recipes have lines that reference deleted ingredients or sub-recipes. They show as "(removed)" in the editor and break cost calculations. Cleaning removes the orphan lines but keeps the recipe.') +
      '</div>' +
      '<div style="background:var(--surface-2);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--text-3);">' +
        t('selfheal_safety_note', '✓ A version snapshot is taken automatically before cleaning, so you can revert via Recipe → Versions if needed.') +
      '</div>' +
      '<div style="max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);">';

    broken.forEach(function (b, i) {
      const r = b.recipe;
      const lines = b.brokenLines.length;
      const ingMissing = b.brokenLines.filter(function (l) { return l.kind === 'ingredient'; }).length;
      const subMissing = b.brokenLines.filter(function (l) { return l.kind === 'subrecipe'; }).length;
      const malformed = b.brokenLines.filter(function (l) { return l.kind === 'malformed'; }).length;
      const desc = [];
      if (ingMissing) desc.push(ingMissing + ' ' + t('selfheal_label_missing_ing', 'missing ingredient(s)'));
      if (subMissing) desc.push(subMissing + ' ' + t('selfheal_label_missing_sub', 'missing sub-recipe(s)'));
      if (malformed) desc.push(malformed + ' ' + t('selfheal_label_malformed', 'malformed line(s)'));
      html +=
        '<div style="padding:10px 12px;' + (i < broken.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + 'display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name || '(untitled)') + '</div>' +
            '<div class="text-muted" style="font-size:12px;">' + PCD.escapeHtml(desc.join(' · ')) + '</div>' +
          '</div>' +
          '<span style="font-weight:700;color:var(--warning);font-size:12px;background:var(--surface-2);padding:4px 8px;border-radius:999px;">' + lines + '</span>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const fixBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    fixBtn.innerHTML = PCD.icon('check', 16) + ' <span>' + t('selfheal_fix_all', 'Fix all') + ' (' + broken.length + ')</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(fixBtn);

    const m = PCD.modal.open({
      title: t('selfheal_modal_title', 'Recipes with broken references'),
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    fixBtn.addEventListener('click', function () {
      // Confirm before destructive action
      PCD.modal.confirm({
        icon: '🧹', iconKind: 'info',
        title: t('selfheal_confirm_title', 'Clean broken lines?'),
        text: t('selfheal_confirm_text', 'Orphan lines will be removed from {n} recipe(s). Each recipe gets an automatic version snapshot first so you can revert.', { n: broken.length }),
        okText: t('selfheal_fix_all', 'Fix all'),
        cancelText: t('cancel'),
      }).then(function (ok) {
        if (!ok) return;
        // Snapshot each broken recipe before cleaning
        broken.forEach(function (b) {
          if (PCD.store.snapshotRecipeVersion) {
            try { PCD.store.snapshotRecipeVersion(b.recipe.id, 'Before self-heal · ' + new Date().toLocaleDateString()); }
            catch (e) { /* ignore — best effort */ }
          }
        });
        const result = PCD.store.cleanAllBrokenRecipes();
        m.close();
        PCD.toast.success(t('selfheal_done', '✓ Fixed {recipes} recipe(s) — {lines} orphan line(s) removed', result));
        // Re-render dashboard so the card disappears
        setTimeout(function () { render(view); }, 300);
      });
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.dashboard = { render: render };
})();
