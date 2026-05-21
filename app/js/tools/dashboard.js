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
      // v2.8.52 — Separator satırları (görsel grup ayracı) cost'a girmez.
      if (ri && ri.separator) return;
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

  // v2.8.16 — Normalize an ingredient OR sub-recipe row to a single shape
  // for display (cost reports, xlsx exports, etc). Encapsulates the math
  // so all callers stay consistent. Returns null when the referenced
  // ingredient/sub-recipe was deleted, letting callers skip or render
  // a placeholder. For sub-recipes the effective "unit price" is the
  // sub-recipe's total cost divided by its yield, in the yield unit;
  // for ingredients it's pricePerUnit adjusted by yieldPercent.
  function resolveRow(ri, ingMap, recipeMap) {
    if (!ri) return null;
    // v2.8.52 — Separator satırları cost/qty hesabına girmez; resolveRow
    // çağıranların hepsi { found: false } kontrolüyle skip ediyor.
    if (ri.separator) return { found: false, isSeparator: true, label: ri.label || '' };
    const amt = Number(ri.amount) || 0;

    if (ri.recipeId) {
      const sub = recipeMap ? recipeMap[ri.recipeId] : null;
      if (!sub) return { found: false, isSub: true, name: '(removed sub-recipe)' };
      const subTotalCost = computeFoodCost(sub, ingMap, recipeMap);
      const subYield = Number(sub.yieldAmount) || Number(sub.servings) || 1;
      const stockUnit = sub.yieldUnit || 'portion';
      const unitPrice = subTotalCost / (subYield || 1);
      let qtyInStock = amt;
      if (ri.unit && stockUnit && ri.unit !== stockUnit) {
        try { qtyInStock = PCD.convertUnit(amt, ri.unit, stockUnit); } catch (e) {}
      }
      return {
        found: true,
        isSub: true,
        name: sub.name || '',
        unitPrice: unitPrice,
        stockUnit: stockUnit,
        amount: amt,
        qtyUnit: ri.unit || stockUnit,
        qtyInStock: qtyInStock,
        lineCost: unitPrice * qtyInStock,
      };
    }

    const ing = ingMap ? ingMap[ri.ingredientId] : null;
    if (!ing) return { found: false, isSub: false, name: '(removed ingredient)' };
    let unitPrice = Number(ing.pricePerUnit) || 0;
    const yld = Number(ing.yieldPercent);
    if (yld && yld > 0 && yld < 100) unitPrice = unitPrice / (yld / 100);
    const stockUnit = ing.unit || '';
    let qtyInStock = amt;
    if (ri.unit && stockUnit && ri.unit !== stockUnit) {
      try { qtyInStock = PCD.convertUnit(amt, ri.unit, stockUnit); } catch (e) {}
    }
    return {
      found: true,
      isSub: false,
      name: ing.name || '',
      unitPrice: unitPrice,
      stockUnit: stockUnit,
      amount: amt,
      qtyUnit: ri.unit || stockUnit,
      qtyInStock: qtyInStock,
      lineCost: unitPrice * qtyInStock,
    };
  }

  // v2.8.26 — Single source of truth for "is this a prep / sub-recipe?"
  // Explicit `isSubRecipe` flag wins. Legacy recipes saved before the
  // flag existed fall back to the original heuristic (yieldAmount +
  // yieldUnit set), so the categorisation doesn't shift under the
  // chef's feet on upgrade. Once a recipe is edited and the flag is
  // explicitly set/cleared, the legacy fallback is no longer consulted.
  function isPrep(r) {
    if (!r) return false;
    if (typeof r.isSubRecipe === 'boolean') return r.isSubRecipe;
    return !!(r.yieldAmount && r.yieldUnit);
  }

  // v2.8.69 — RECURSIVE INGREDIENT FLATTENING.
  //
  // Tek mimari fix: bir tarifin tüm sub-recipe satırlarını recursive olarak
  // gerçek ingredient seviyesine düşürür. Operatör örnek: "Beef Skewer
  // Marination" recipe'sinin altında "Labneh" sub-recipe → portion calculator,
  // shopping list, nutrition, variance, allergen, diet hesaplarında labneh
  // satırı atlanıyordu ("?" görünüyor veya tamamen kayboluyor). Şimdi
  // flatten ile labneh içindeki yogurt+salt gerçek ingredient olarak çıkar.
  //
  // Scale cascading: ri.amount/sub.yieldAmount oranı her seviyede çarpılır.
  // Birim dönüşümü best-effort (PCD.convertUnit).
  // Cycle protection: visited set ile A→B→A döngüsü engellenir.
  // Separator satırları skip edilir.
  //
  // Returns: [{ ingredient, ingredientId, amount, unit, viaSubRecipe }]
  // viaSubRecipe: null (direkt ingredient) | "Sub-recipe name" (en sığ kaynak)
  //
  // KULLANIM YERLERİ (v2.8.69'da bağlandı):
  //   - portion.js (canvas + printScaled + shareScaled + sendToShoppingList)
  //   - shopping.js (render + print consolidation)
  //   - nutrition.js (kalori/protein cascade)
  //   - variance.js (sub-recipe ingredient stoktan düşürme)
  //   - allergens-db.js recipeAllergens (sub-recipe allergen cascade)
  function flattenIngredients(recipe, ingMap, recipeMap, opts) {
    opts = opts || {};
    const scale = opts.scale || 1;
    const visited = opts.visited || {};
    const out = [];

    if (!recipe || !Array.isArray(recipe.ingredients)) return out;
    if (recipe.id && visited[recipe.id]) return out; // cycle — bail
    const newVisited = Object.assign({}, visited);
    if (recipe.id) newVisited[recipe.id] = true;

    if (!recipeMap) recipeMap = buildRecipeMap();

    recipe.ingredients.forEach(function (ri) {
      if (!ri || ri.separator) return;

      // SUB-RECIPE LINE — recurse and tag flattened items with source name.
      if (ri.recipeId) {
        const sub = recipeMap[ri.recipeId];
        if (!sub) return;
        const amt = Number(ri.amount) || 0;
        if (amt <= 0) return;
        const subYield = Number(sub.yieldAmount) || Number(sub.servings) || 1;
        const stockUnit = sub.yieldUnit || 'portion';
        let qtyInStock = amt;
        if (ri.unit && stockUnit && ri.unit !== stockUnit) {
          try { qtyInStock = PCD.convertUnit(amt, ri.unit, stockUnit); } catch (e) {}
        }
        const subScale = qtyInStock / (subYield || 1);
        const flattened = flattenIngredients(sub, ingMap, recipeMap, {
          scale: scale * subScale,
          visited: newVisited,
        });
        flattened.forEach(function (item) {
          // En sığ sub-recipe kaynağı kazanır (nested durumda en dış sub-recipe etiketi)
          if (!item.viaSubRecipe) item.viaSubRecipe = sub.name || '';
          out.push(item);
        });
        return;
      }

      // INGREDIENT LINE — direct, scaled.
      if (ri.ingredientId) {
        const ing = ingMap[ri.ingredientId];
        if (!ing) return;
        out.push({
          ingredient: ing,
          ingredientId: ri.ingredientId,
          amount: (Number(ri.amount) || 0) * scale,
          unit: ri.unit || ing.unit || '',
          viaSubRecipe: null,
        });
      }
    });

    return out;
  }

  PCD.recipes = PCD.recipes || {};
  PCD.recipes.computeFoodCost = computeFoodCost;
  PCD.recipes.buildRecipeMap = buildRecipeMap;
  PCD.recipes.resolveRow = resolveRow;
  PCD.recipes.isPrep = isPrep;
  PCD.recipes.flattenIngredients = flattenIngredients;

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
    // v2.6.64 — Use PCD locale instead of undefined (which uses browser default)
    // so date strings respect the user's selected language.
    const _locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    const todayStr = new Date().toLocaleDateString(_locale, { weekday: 'long', month: 'long', day: 'numeric' });

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
    // v2.12.8 — also exclude soft-deleted (_deletedAt) sessions so a discarded
    // checklist no longer shows as "in progress" on the dashboard.
    const activeSessions = sessions.filter(function (s) { return s && !s.completedAt && !s._deletedAt; });

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

    // v2.8.72 — Cost Health: proactive margin erosion detection. Real-world
    // chef pain point: silent price drift on a few key ingredients erodes
    // 2-4 points of food cost over a quarter, only spotted when the
    // accountant flags it. This widget surfaces it daily.
    //
    // Two signals computed:
    //   (a) Over-budget recipes: menu items where current food cost % > 35%
    //       (industry "concern" threshold). Uses live computeFoodCost +
    //       salePrice. Ignores preps (no salePrice expected).
    //   (b) Stale-price ingredients: ingredient rows that haven't been
    //       updated in 60+ days (proxy for "price not refreshed since last
    //       invoice"). Only counts ingredients with pricePerUnit > 0,
    //       used by at least one recipe.
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const now60 = Date.now();
    const recipeMapForCost = (PCD.recipes && PCD.recipes.buildRecipeMap) ? PCD.recipes.buildRecipeMap() : {};
    const usedIngIds = {};
    recipes.forEach(function (r) {
      (r.ingredients || []).forEach(function (ri) {
        if (ri && ri.ingredientId) usedIngIds[ri.ingredientId] = true;
      });
    });
    const overBudgetRecipes = [];
    recipes.forEach(function (r) {
      if (PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r)) return; // preps skipped
      if (!r.salePrice || r.salePrice <= 0) return;
      const cost = PCD.recipes.computeFoodCost(r, ingMap, recipeMapForCost);
      const perServing = (r.servings && r.servings > 0) ? cost / r.servings : cost;
      const pct = (perServing / r.salePrice) * 100;
      if (pct > 35) overBudgetRecipes.push({ recipe: r, pct: pct });
    });
    overBudgetRecipes.sort(function (a, b) { return b.pct - a.pct; });
    const stalePriceIngs = ings.filter(function (i) {
      if (!usedIngIds[i.id]) return false;
      if (!i.pricePerUnit || i.pricePerUnit <= 0) return false;
      if (!i.updatedAt) return true; // never updated = stale
      const ts = new Date(i.updatedAt).getTime();
      if (isNaN(ts)) return false;
      return (now60 - ts) > SIXTY_DAYS_MS;
    });

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
      const dayLabel = isToday ? t('dash_today') : (nextEvent.date === new Date(today.getTime() + 86400000).toISOString().slice(0, 10) ? t('dash_tomorrow') : evDate.toLocaleDateString(_locale, { weekday: 'short', month: 'short', day: 'numeric' }));
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

    // v2.8.72 — CARD: Cost Health (over-budget recipes + stale ingredient prices)
    if (overBudgetRecipes.length > 0 || stalePriceIngs.length >= 5) {
      const topNames = overBudgetRecipes.slice(0, 2).map(function (x) {
        return PCD.escapeHtml(x.recipe.name) + ' ' + x.pct.toFixed(0) + '%';
      }).join(' · ');
      const moreOver = overBudgetRecipes.length > 2 ? ' +' + (overBudgetRecipes.length - 2) : '';
      const parts = [];
      if (overBudgetRecipes.length > 0) {
        parts.push(t('dash_cost_health_over', { n: overBudgetRecipes.length }) || (overBudgetRecipes.length + ' recipe(s) over 35% food cost'));
      }
      if (stalePriceIngs.length >= 5) {
        parts.push(t('dash_cost_health_stale', { n: stalePriceIngs.length }) || (stalePriceIngs.length + ' ingredient prices not updated in 60+ days'));
      }
      const desc = parts.join(' · ') + (topNames ? ' — ' + topNames + moreOver : '');
      cards.push({
        priority: 2,
        html:
          '<div class="dash-card priority-warn" data-action="view-recipes" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:#fef3c7;color:#92400e;">' + PCD.icon('activity', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + (t('dash_cost_health_title') || 'Cost health alert') + '</div>' +
              '<div class="dash-card-desc">' + desc + '</div>' +
            '</div>' +
            '<div class="dash-card-cta">' + (t('dash_review_cta') || 'Review') + ' →</div>' +
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

    // v2.8.91 — Inline guide panel (kapatılabilir, localStorage). Buffet v2.8.77
    // pattern'i ile birebir. Deneyimli şef bir kez ✕ → bir daha görmez.
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_dash_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    // v2.8.91 — Yeni şef için "Get started" 3-card empty state. recipes + ings
    // ikisi de boşsa (demo seed yüklenmemiş veya yeni workspace) → action cards
    // yerine guided onboarding göster.
    const isNewChef = recipes.length === 0 && ings.length === 0;

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
        // v2.8.91 — New chef "Get started" 3-card grid
        '.dash-gs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; }' +
        '.dash-gs-card { padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); cursor: pointer; transition: all .15s ease; text-align: left; }' +
        '.dash-gs-card:hover { border-color: var(--brand-600); transform: translateY(-2px); box-shadow: var(--shadow-md); }' +
        '.dash-gs-emoji { font-size: 32px; line-height: 1; margin-bottom: 10px; display: block; }' +
        '.dash-gs-title { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 6px; }' +
        '.dash-gs-desc { font-size: 12px; color: var(--text-3); line-height: 1.5; }' +
      '</style>' +

      '<h1 class="dash-greet">' + headline + '</h1>' +
      '<div class="dash-date">' + todayStr + (function () {
        const ws = PCD.store.getActiveWorkspace();
        return ws ? ' · <strong style="color:var(--brand-700);">' + PCD.escapeHtml(ws.name) + '</strong>' + (ws.role ? ' (' + PCD.escapeHtml(ws.role) + ')' : '') : '';
      })() + '</div>' +

      // v2.8.91 — Inline guide (collapsible, dismissable)
      (!guideHidden ? (
        '<details class="card" open style="padding:0;margin-bottom:16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">' +
          '<summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">' +
            '<span style="font-size:16px;">💡</span>' +
            '<span style="flex:1;">' + PCD.escapeHtml(t('dash_guide_title') || 'What you\'ll see on your Dashboard') + '</span>' +
            '<button type="button" id="dashGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="' + PCD.escapeHtml(t('dash_guide_dismiss') || 'Hide') + '">✕</button>' +
          '</summary>' +
          '<div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">' +
            '<ol style="margin:0;padding-inline-start:20px;">' +
              '<li><strong>' + PCD.escapeHtml(t('dash_guide_step1_title') || "Today's focus") + '</strong> — ' + PCD.escapeHtml(t('dash_guide_step1_body') || 'Smart action cards: today\'s event, pending stock approvals, active checklists, low-stock alerts, cost-health warnings. Priority-sorted so the most urgent thing is on top.') + '</li>' +
              '<li><strong>' + PCD.escapeHtml(t('dash_guide_step2_title') || 'Quick actions') + '</strong> — ' + PCD.escapeHtml(t('dash_guide_step2_body') || 'One-tap shortcuts to start a new recipe, menu, checklist, event, or print Kitchen Cards.') + '</li>' +
              '<li><strong>' + PCD.escapeHtml(t('dash_guide_step3_title') || 'Library stats') + '</strong> — ' + PCD.escapeHtml(t('dash_guide_step3_body') || 'Total recipes, ingredients, menus in your workspace. Click any number to jump there.') + '</li>' +
              '<li><strong>' + PCD.escapeHtml(t('dash_guide_step4_title') || 'Sidebar (≡ icon)') + '</strong> — ' + PCD.escapeHtml(t('dash_guide_step4_body') || 'Full tool menu: Buffet Planner, HACCP forms, Discover community, Suppliers, Variance, Nutrition, and more.') + '</li>' +
            '</ol>' +
          '</div>' +
        '</details>'
      ) : '') +

      // v2.8.91 — Yeni şef "Get started" empty state veya action cards
      (isNewChef ? (
        '<div class="dash-empty" style="padding:20px 16px;margin-bottom:16px;text-align:left;">' +
          '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">🌱 ' + PCD.escapeHtml(t('dash_get_started_title') || 'Let\'s set up your kitchen') + '</div>' +
          '<div style="color:var(--text-2);font-size:13px;margin-bottom:14px;line-height:1.6;">' + PCD.escapeHtml(t('dash_get_started_intro') || 'Your workspace is empty. Start with one of these — or load the sample data to explore.') + '</div>' +
          '<div class="dash-gs-grid">' +
            '<button class="dash-gs-card" data-action="open-ingredients" type="button">' +
              '<span class="dash-gs-emoji">🥕</span>' +
              '<div class="dash-gs-title">' + PCD.escapeHtml(t('dash_get_started_ing_title') || 'Add ingredients') + '</div>' +
              '<div class="dash-gs-desc">' + PCD.escapeHtml(t('dash_get_started_ing_desc') || 'Start with what you buy regularly. Set purchase prices for instant cost calculation.') + '</div>' +
            '</button>' +
            '<button class="dash-gs-card" data-action="new-recipe" type="button">' +
              '<span class="dash-gs-emoji">📖</span>' +
              '<div class="dash-gs-title">' + PCD.escapeHtml(t('dash_get_started_rec_title') || 'Create your first recipe') + '</div>' +
              '<div class="dash-gs-desc">' + PCD.escapeHtml(t('dash_get_started_rec_desc') || 'Add ingredients, steps, and a photo. Live food cost % shows as you build.') + '</div>' +
            '</button>' +
            '<button class="dash-gs-card" data-action="load-demo" type="button">' +
              '<span class="dash-gs-emoji">✨</span>' +
              '<div class="dash-gs-title">' + PCD.escapeHtml(t('dash_get_started_demo_title') || 'Load sample data') + '</div>' +
              '<div class="dash-gs-desc">' + PCD.escapeHtml(t('dash_get_started_demo_desc') || '3 recipes, 30+ ingredients, a menu, an event — ready to explore. Edit or delete anytime.') + '</div>' +
            '</button>' +
          '</div>' +
        '</div>'
      ) :
      // Action cards (today's focus)
      (cards.length > 0
        ? '<div>' + cards.map(function (c) { return c.html; }).join('') + '</div>'
        : '<div class="dash-empty">' +
            '<div class="dash-empty-title">' + t('dash_all_clear') + '</div>' +
            '<div>' + t('dash_nothing_pressing') + '</div>' +
          '</div>'
      )) +

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

    // v2.8.78 — Lazy tools: poll briefly so editor opens once tool loads
    function _afterToolLoad(toolName, cb) {
      let attempts = 0;
      const trial = setInterval(function () {
        const tool = PCD.tools[toolName];
        if (tool && tool.openEditor) {
          clearInterval(trial);
          cb(tool);
        } else if (++attempts > 25) {
          clearInterval(trial);
        }
      }, 120);
    }

    // v2.8.91 — Dashboard inline guide dismiss (kapatınca localStorage'a yaz)
    const guideDismissBtn = PCD.$('#dashGuideDismiss', view);
    if (guideDismissBtn) guideDismissBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { localStorage.setItem('pcd_dash_guide_hidden', '1'); } catch (e) {}
      const detailsEl = this.closest('details');
      if (detailsEl) detailsEl.style.display = 'none';
    });

    // v2.8.91 — New chef empty state: load-demo button → reset to demo seed
    PCD.on(view, 'click', '[data-action="load-demo"]', function () {
      PCD.modal.confirm({
        icon: '✨', iconKind: 'info',
        title: PCD.i18n.t('dash_demo_confirm_title') || 'Load sample data?',
        text: PCD.i18n.t('dash_demo_confirm_text') || '3 recipes, 30+ ingredients, a menu, an event will be loaded. You can edit or delete anything afterwards.',
        okText: PCD.i18n.t('dash_demo_confirm_ok') || 'Load',
      }).then(function (ok) {
        if (!ok) return;
        if (PCD.demo && PCD.demo.seed) {
          PCD.demo.seed();
          PCD.toast.success(PCD.i18n.t('dash_demo_loaded') || 'Sample data loaded');
          setTimeout(function () { render(view); }, 300);
        } else {
          PCD.router.go('account');
          PCD.toast.info(PCD.i18n.t('dash_demo_via_account') || 'Open Account → Reset demo data');
        }
      });
    });

    // v2.8.91 — New chef: open-ingredients button → ingredients tool
    PCD.on(view, 'click', '[data-action="open-ingredients"]', function () {
      PCD.router.go('ingredients');
    });

    // Wire actions
    PCD.on(view, 'click', '[data-action="new-recipe"]', function () {
      if (PCD.tools.recipes && PCD.tools.recipes.openEditor) PCD.tools.recipes.openEditor();
      else { PCD.router.go('recipes'); _afterToolLoad('recipes', function (t) { t.openEditor(); }); }
    });
    PCD.on(view, 'click', '[data-action="new-event"]', function () {
      PCD.router.go('events');
      _afterToolLoad('events', function (t) { t.openEditor(); });
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
    // v2.8.72 — Cost health card → recipes view
    PCD.on(view, 'click', '[data-action="view-recipes"]', function () {
      PCD.router.go('recipes');
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
      _afterToolLoad('events', function (t) { t.openEditor(eid); });
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
