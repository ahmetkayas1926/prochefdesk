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
  // nutrition, variance, allergen, diet hesaplarında labneh
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
  //   - portion.js (canvas + printScaled + shareScaled)
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

  // v2.43.18 — Cost-report breakdown rows (simple vs detailed sub-recipe view).
  // detailed=false → one row per recipe line (sub-recipes as a single SUB line,
  // current behaviour). detailed=true → each sub-recipe row becomes a sub-header
  // followed by its underlying ingredients (indented), expanded via
  // flattenIngredients at the exact usage scale and costed via resolveRow.
  // Σ(lineCost) is IDENTICAL in both modes (== computeFoodCost): cost is linear
  // in amount, so a sub-recipe's expanded children always sum back to its own
  // line cost. Shared by recipe/event/buffet cost reports.
  // Returns [{ name, isSub, isSubHeader, indent, unitPrice, stockUnit, amount,
  // qtyUnit, lineCost }].
  function costBreakdownRows(recipe, ingMap, recipeMap, detailed) {
    if (!recipeMap) recipeMap = buildRecipeMap();
    const rows = [];
    if (!recipe || !Array.isArray(recipe.ingredients)) return rows;
    recipe.ingredients.forEach(function (ri) {
      if (!ri || ri.separator) return;
      const rr = resolveRow(ri, ingMap, recipeMap);
      if (!rr || !rr.found) return;

      // Direct ingredient, OR sub-recipe in simple mode → single line.
      if (!detailed || !rr.isSub) {
        rows.push({
          name: rr.name, isSub: !!rr.isSub, isSubHeader: false, indent: 0,
          unitPrice: rr.unitPrice, stockUnit: rr.stockUnit, amount: rr.amount,
          qtyUnit: rr.qtyUnit, qtyInStock: rr.qtyInStock, lineCost: rr.lineCost,
        });
        return;
      }

      // Detailed sub-recipe → header line + expanded children at usage scale.
      const sub = recipeMap[ri.recipeId];
      rows.push({
        name: rr.name, isSub: true, isSubHeader: !!sub, indent: 0,
        unitPrice: rr.unitPrice, stockUnit: rr.stockUnit, amount: rr.amount,
        qtyUnit: rr.qtyUnit, qtyInStock: rr.qtyInStock, lineCost: rr.lineCost,
      });
      if (!sub) return;
      const subYield = Number(sub.yieldAmount) || Number(sub.servings) || 1;
      const subScale = (Number(rr.qtyInStock) || 0) / (subYield || 1);
      flattenIngredients(sub, ingMap, recipeMap, { scale: subScale }).forEach(function (item) {
        const cr = resolveRow({ ingredientId: item.ingredientId, amount: item.amount, unit: item.unit }, ingMap, recipeMap);
        if (!cr || !cr.found) return;
        rows.push({
          name: cr.name, isSub: false, isSubHeader: false, indent: 1,
          unitPrice: cr.unitPrice, stockUnit: cr.stockUnit, amount: cr.amount,
          qtyUnit: cr.qtyUnit, qtyInStock: cr.qtyInStock, lineCost: cr.lineCost,
        });
      });
    });
    return rows;
  }

  PCD.recipes = PCD.recipes || {};
  PCD.recipes.computeFoodCost = computeFoodCost;
  PCD.recipes.buildRecipeMap = buildRecipeMap;
  PCD.recipes.resolveRow = resolveRow;
  PCD.recipes.isPrep = isPrep;
  PCD.recipes.flattenIngredients = flattenIngredients;
  PCD.recipes.costBreakdownRows = costBreakdownRows;

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

    const todayIso = new Date().toISOString().slice(0, 10);

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
      // v2.44.90 — çok-fonksiyonlu etkinlikte fonksiyon zaman çizelgesi (saatler/adlar)
      const _fns = (nextEvent.functions || []).filter(function (f) { return f && f.time; });
      const timeStr = (_fns.length > 1)
        ? '<div class="dash-card-desc" style="margin-top:2px;">🕐 ' + _fns.map(function (f) { return (f.name ? PCD.escapeHtml(f.name) + ' ' : '') + PCD.escapeHtml(f.time); }).join('  ·  ') + '</div>'
        : '';
      cards.push({
        priority: isToday ? 1 : 3,
        html:
          '<div class="dash-card priority-' + (isToday ? 'now' : 'soon') + '" data-action="view-event" data-eid="' + nextEvent.id + '" style="cursor:pointer;">' +
            '<div class="dash-card-icon" style="background:var(--brand-50);color:var(--brand-700);">' + PCD.icon('calendar', 22) + '</div>' +
            '<div class="dash-card-body">' +
              '<div class="dash-card-title">' + PCD.escapeHtml(nextEvent.name) + '</div>' +
              '<div class="dash-card-desc">' + dayLabel + guestStr + venueStr + '</div>' +
              timeStr +
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

    // v2.44.83 — HACCP günlük sıcaklık logu vadesi (yasal günlük zorunluluk → en güçlü
    // günlük retention sinyali). Birim kurulu + bugün için kaydı OLMAYAN birimler varsa
    // "bugünün logu eksik" kartı (CTA → log formu). Birim yoksa / HACCP kapalıysa kart yok.
    if (!PCD.gate || !PCD.gate.canUseHaccp || PCD.gate.canUseHaccp()) {
      const haccpUnits = PCD.store.listTable ? (PCD.store.listTable('haccpUnits') || []) : [];
      if (haccpUnits.length > 0) {
        const _hd = new Date();
        const haccpToday = _hd.getFullYear() + '-' + String(_hd.getMonth() + 1).padStart(2, '0') + '-' + String(_hd.getDate()).padStart(2, '0');
        const loggedTodayUnits = {};
        (PCD.store.listTable ? (PCD.store.listTable('haccpReadings') || []) : []).forEach(function (r) {
          if (r && r.date === haccpToday && r.unitId) loggedTodayUnits[r.unitId] = true;
        });
        const haccpPending = haccpUnits.filter(function (u) { return !loggedTodayUnits[u.id]; }).length;
        if (haccpPending > 0) {
          cards.push({
            priority: 1,
            html:
              '<div class="dash-card priority-warn" data-action="view-haccp" style="cursor:pointer;">' +
                '<div class="dash-card-icon" style="background:#fee2e2;color:#991b1b;">' + PCD.icon('thermometer', 22) + '</div>' +
                '<div class="dash-card-body">' +
                  '<div class="dash-card-title">' + t('dash_haccp_due_title') + '</div>' +
                  '<div class="dash-card-desc">' + t('dash_haccp_due_desc', { n: haccpPending }) + '</div>' +
                '</div>' +
                '<div class="dash-card-cta">' + t('dash_haccp_due_cta') + ' →</div>' +
              '</div>'
          });
        }
      }
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

    // ============ v2.17 — CHEF OFFICE COMMAND CENTER ============
    // MUTLAK KURAL: her sayı kullanıcının GERÇEK verisinden. Sahte/örnek
    // rakam YOK. Verisi olmayan metrik "veri yok — ekle" boş durumunda.
    let commandCenterHtml = '';
    if (!isNewChef) {
      const fcColor = function (pct) { return pct == null ? '' : (pct < 30 ? 'ok' : (pct <= 35 ? 'warn' : 'bad')); };

      // 6.2a — Ortalama menü food cost % (menüler + tarifler)
      let avgFc = null;
      (function () {
        const menus = PCD.store.listTable ? PCD.store.listTable('menus') : [];
        const recById = {}; recipes.forEach(function (r) { recById[r.id] = r; });
        let sum = 0, n = 0;
        menus.forEach(function (mn) {
          // Studio menüsü öğeleri studio.blocks[].items içinde; klasik menü sections[].items içinde.
          let items = [];
          if (mn.studio && mn.studio.blocks) {
            mn.studio.blocks.forEach(function (b) { if (b.type === 'section') items = items.concat(b.items || []); });
          } else {
            (mn.sections || []).forEach(function (sec) { items = items.concat(sec.items || []); });
          }
          items.forEach(function (it) {
            const r = it.recipeId ? recById[it.recipeId] : null;
            if (!r) return;
            const price = (it.price != null && it.price !== '') ? Number(it.price) : (r.salePrice != null ? Number(r.salePrice) : null);
            if (!price || price <= 0) return;
            const cost = PCD.recipes.computeFoodCost(r, ingMap, recipeMapForCost);
            const per = (r.servings > 0) ? cost / r.servings : cost;
            sum += per / price * 100; n++;
          });
        });
        if (n > 0) avgFc = { pct: sum / n, n: n };
      })();

      // 6.2b — Bugün P&L: salesLog'tan bugünün satışları → ciro · food cost % · kâr.
      // Günlük "kokpit" — Record sales'e girilen tarihli satışları besler.
      // v2.44.85 — SON 7 GÜN P&L (eski "bugün" yerine). Şef satışı HAFTALIK girer; günlük
      // kart çoğu gün boş/eski kalıyordu. Tarih YEREL (eski UTC `toISOString` → Perth gibi
      // UTC+8'de her sabah "yanlış gün" gösteriyordu). salesLog son 7 gün → ciro/fc%/kâr.
      let todayPL = null;
      (function () {
        try {
          const ws = PCD.store.getActiveWorkspaceId && PCD.store.getActiveWorkspaceId();
          const root = (PCD.store._read && PCD.store._read('salesLog')) || {};
          const ymdLocal = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
          const fromYmd = ymdLocal(new Date(Date.now() - 6 * 86400000)); // bugün dahil 7 gün
          const toYmd = ymdLocal(new Date());
          const recById = {}; recipes.forEach(function (r) { recById[r.id] = r; });
          let rev = 0, cost = 0, units = 0;
          (root[ws] || []).forEach(function (s) {
            if (!s || s._deletedAt || !s.recipeId || !s.date || s.date < fromYmd || s.date > toYmd) return;
            const r = recById[s.recipeId]; if (!r) return;
            const qty = Number(s.qty) || 0; if (qty <= 0) return;
            units += qty;
            const price = Number(r.salePrice) || 0;
            if (price <= 0) return;
            const c = PCD.recipes.computeFoodCost(r, ingMap, recipeMapForCost) || 0;
            const costPer = (Number(r.servings) > 0) ? c / Number(r.servings) : c;
            rev += price * qty; cost += costPer * qty;
          });
          if (units > 0) todayPL = { units: units, rev: rev, cost: cost, profit: rev - cost, fcPct: rev > 0 ? (cost / rev * 100) : null };
        } catch (e) {}
      })();

      // 6.2b — Bu haftanın işçilik maliyeti (rosters). Pro-gated.
      let labour = null;
      (function () {
        const allR = PCD.store._read('rosters') || {};
        const rWs = allR[wsId] || {};
        const list = Object.keys(rWs).map(function (k) { return rWs[k]; }).filter(function (r) { return r && !r._deletedAt && r.weekStart; });
        if (!list.length) return;
        const todayMs = Date.now();
        const startMs = function (r) { const d = new Date(r.weekStart + 'T00:00:00'); return isNaN(d) ? 0 : d.getTime(); };
        let chosen = null;
        list.forEach(function (r) { const s = startMs(r); if (!s) return; if (todayMs >= s && todayMs < s + (r.dayCount || 7) * 86400000) chosen = r; });
        const current = !!chosen;
        if (!chosen) { list.sort(function (a, b) { return startMs(b) - startMs(a); }); chosen = list[0]; }
        if (!chosen) return;
        const parseHM = function (s) { const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim()); return m ? (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) : null; };
        const shiftH = function (c) { if (!c || !c.start || !c.end) return 0; let a = parseHM(c.start), b = parseHM(c.end); if (a == null || b == null) return 0; if (b < a) b += 24; return Math.max(0, b - a); };
        let cost = 0, hours = 0;
        (chosen.staff || []).forEach(function (st) {
          const cells = (chosen.cells && chosen.cells[st.id]) || {};
          let h = 0; for (let d = 0; d < (chosen.dayCount || 7); d++) h += shiftH(cells[d]);
          hours += h; cost += (Number(st.rate) || 0) > 0 ? h * Number(st.rate) : 0;
        });
        labour = { cost: cost, hours: hours, current: current };
      })();

      // 6.2d — Eksik tarifler (malzemesi YOK veya satış fiyatı yok [prep hariç])
      const incompleteRecipes = recipes.filter(function (r) {
        const hasIng = (r.ingredients || []).some(function (ri) { return ri && !ri.separator && (ri.ingredientId || ri.recipeId); });
        if (!hasIng) return true;
        const prep = PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r);
        if (!prep && (r.salePrice == null || r.salePrice === '' || Number(r.salePrice) <= 0)) return true;
        return false;
      });

      // 6.3a — Tarif food cost % dağılımı (fiyatlı, prep olmayan)
      const marginData = [];
      recipes.forEach(function (r) {
        if (PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r)) return;
        if (!r.salePrice || r.salePrice <= 0) return;
        const cost = PCD.recipes.computeFoodCost(r, ingMap, recipeMapForCost);
        const per = (r.servings > 0) ? cost / r.servings : cost;
        marginData.push({ name: r.name, pct: per / r.salePrice * 100 });
      });
      marginData.sort(function (a, b) { return b.pct - a.pct; });

      // 6.3b — Malzeme fiyat tazeliği (updatedAt'tan)
      const DAY = 86400000;
      const fresh = { f: 0, a: 0, s: 0 };
      ings.forEach(function (i) {
        if (!i.pricePerUnit || i.pricePerUnit <= 0) return;
        const ts = i.updatedAt ? new Date(i.updatedAt).getTime() : 0;
        const age = ts ? (Date.now() - ts) / DAY : 99999;
        if (age < 30) fresh.f++; else if (age <= 60) fresh.a++; else fresh.s++;
      });
      const freshTotal = fresh.f + fresh.a + fresh.s;

      // ---- Kart yapıcı ----
      const labourLocked = (PCD.gate && !PCD.gate.canUseLaborCost());
      const metricCard = function (action, lbl, valHtml, sub, cls, extraAttr) {
        return '<button class="cc-card ' + (cls || '') + '" data-action="' + action + '"' + (extraAttr || '') + '>' +
          '<span class="cc-lbl">' + lbl + '</span>' +
          '<span class="cc-val">' + valHtml + '</span>' +
          '<span class="cc-sub">' + sub + '</span></button>';
      };

      // avg food cost card
      const fcCard = avgFc
        ? metricCard('open-menus', PCD.escapeHtml(t('cc_avg_food_cost') || 'Avg menu food cost'),
            avgFc.pct.toFixed(1) + '%', PCD.escapeHtml((t('cc_across_items') || 'across {n} menu items').replace('{n}', avgFc.n)), fcColor(avgFc.pct))
        : metricCard('open-menus', PCD.escapeHtml(t('cc_avg_food_cost') || 'Avg menu food cost'),
            '—', PCD.escapeHtml(t('cc_add_menu_prices') || 'Add menu items with prices'), '');

      // labour card
      let labourCard;
      if (labourLocked) {
        labourCard = '<button class="cc-card" data-action="upgrade-labor">' +
          '<span class="cc-lbl">' + (PCD.icon('lock', 12)) + ' ' + PCD.escapeHtml(t('cc_this_week_labour') || 'This week labour') + '</span>' +
          '<span class="cc-val locked">' + ((PCD.currencySymbol && PCD.currencySymbol()) || '$') + '000</span>' +
          '<span class="cc-sub">' + PCD.escapeHtml(t('cc_pro_unlock') || 'Pro — tap to unlock') + '</span></button>';
      } else if (labour) {
        labourCard = metricCard('open-roster', PCD.escapeHtml(t('cc_this_week_labour') || 'This week labour'),
          PCD.fmtMoney(labour.cost), PCD.fmtNumber(labour.hours) + ' ' + PCD.escapeHtml(t('roster_hours') || 'h') + (labour.current ? '' : ' · ' + PCD.escapeHtml(t('cc_latest_roster') || 'latest roster')), '');
      } else {
        labourCard = metricCard('open-roster', PCD.escapeHtml(t('cc_this_week_labour') || 'This week labour'),
          '—', PCD.escapeHtml(t('cc_add_roster') || 'Build a weekly roster'), '');
      }

      // low stock card
      const lowN = lowStockItems.length;
      const stockCard = metricCard('view-inventory', PCD.escapeHtml(t('cc_low_stock') || 'Low stock items'),
        String(lowN), lowN > 0 ? PCD.escapeHtml((t('cc_need_reorder') || '{n} need reorder').replace('{n}', lowN)) : PCD.escapeHtml(t('cc_all_stocked') || 'All stocked'),
        lowN > 0 ? 'warn' : 'ok');

      // incomplete card
      const incN = incompleteRecipes.length;
      const incCard = metricCard('view-recipes', PCD.escapeHtml(t('cc_incomplete') || 'Incomplete recipes'),
        String(incN), incN > 0 ? PCD.escapeHtml(t('cc_missing_data') || 'Missing ingredients or price') : PCD.escapeHtml(t('cc_all_complete') || 'All complete'),
        incN > 0 ? 'warn' : 'ok');

      // ---- Grafik: margin spread ----
      let marginChart;
      if (marginData.length >= 2) {
        const top = marginData.slice(0, 7);
        const barColor = function (pct) { return pct < 30 ? 'var(--brand-600)' : (pct <= 35 ? 'var(--warning)' : 'var(--danger)'); };
        const rows = top.map(function (d) {
          // width scaled to a 30% reference so healthy bars are substantial (not mostly-empty gray)
          const w = Math.max(8, Math.min(100, d.pct / 30 * 100));
          return '<div class="cc-bar-row"><span class="cc-bar-name">' + PCD.escapeHtml(d.name) + '</span>' +
            '<span class="cc-bar-track"><span class="cc-bar-fill" style="width:' + w.toFixed(0) + '%;background:' + barColor(d.pct) + ';"></span></span>' +
            '<span class="cc-bar-pct" style="color:' + barColor(d.pct) + ';">' + d.pct.toFixed(0) + '%</span></div>';
        }).join('');
        marginChart = '<div class="cc-chart" data-action="view-recipes"><h3>' + PCD.escapeHtml(t('cc_margin_spread') || 'Recipe food cost % spread') + '</h3>' + rows + '</div>';
      } else {
        marginChart = '<div class="cc-chart" data-action="view-recipes"><h3>' + PCD.escapeHtml(t('cc_margin_spread') || 'Recipe food cost % spread') + '</h3>' +
          '<div class="cc-empty">' + PCD.escapeHtml(t('cc_not_enough_data') || 'Add priced recipes to see the spread.') + '</div></div>';
      }

      // ---- Grafik: ingredient freshness donut ----
      let freshChart;
      if (freshTotal > 0) {
        const aDeg = fresh.f / freshTotal * 360;
        const bDeg = (fresh.f + fresh.a) / freshTotal * 360;
        const donut = 'background:conic-gradient(#1f9d6b 0 ' + aDeg.toFixed(1) + 'deg,#d97706 ' + aDeg.toFixed(1) + 'deg ' + bDeg.toFixed(1) + 'deg,#dc2626 ' + bDeg.toFixed(1) + 'deg 360deg);';
        const stalePct = Math.round(fresh.s / freshTotal * 100);
        freshChart = '<div class="cc-chart" data-action="open-ingredients-aging" style="cursor:pointer;"><h3>' + PCD.escapeHtml(t('cc_price_freshness') || 'Ingredient price freshness') + '</h3>' +
          '<div class="cc-donut-wrap"><div class="cc-donut" style="' + donut + '"><div class="cc-donut-c">' + (100 - stalePct) + '%</div></div>' +
          '<div class="cc-legend">' +
            '<div><i style="background:#1f9d6b;"></i>' + PCD.escapeHtml(t('cc_fresh') || 'Fresh (<30d)') + ' · ' + fresh.f + '</div>' +
            '<div><i style="background:#d97706;"></i>' + PCD.escapeHtml(t('cc_aging') || 'Aging (30–60d)') + ' · ' + fresh.a + '</div>' +
            '<div><i style="background:#dc2626;"></i>' + PCD.escapeHtml(t('cc_stale') || 'Stale (>60d)') + ' · ' + fresh.s + '</div>' +
          '</div></div></div>';
      } else {
        freshChart = '<div class="cc-chart" data-action="open-ingredients"><h3>' + PCD.escapeHtml(t('cc_price_freshness') || 'Ingredient price freshness') + '</h3>' +
          '<div class="cc-empty">' + PCD.escapeHtml(t('cc_add_priced_ings') || 'Add ingredients with prices to track freshness.') + '</div></div>';
      }

      // E4 — upcoming events widget (catering niche, DB-free; reuses data-action="view-event" handler)
      let upcomingChart = '';
      const _evList = (PCD.store.listTable ? PCD.store.listTable('events') : []) || [];
      const _todayStr = new Date().toISOString().slice(0, 10);
      const _upcoming = _evList.filter(function (e) { return e && !e._deletedAt && e.date && e.date >= _todayStr; })
        .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).slice(0, 3);
      if (_upcoming.length) {
        upcomingChart = '<div class="cc-chart" style="cursor:default;"><h3>' + PCD.escapeHtml(t('cc_upcoming_events') || 'Upcoming events') + '</h3>' +
          _upcoming.map(function (e) {
            const _d = e.date ? PCD.fmtDate(new Date(e.date).getTime()) : '';
            const _g = e.guestCount ? (' · ' + e.guestCount + ' ' + (t('event_guests') || 'guests').toLowerCase()) : '';
            return '<div data-action="view-event" data-eid="' + e.id + '" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(e.name || '(untitled)') + '</span><span style="color:var(--text-3);white-space:nowrap;">' + _d + _g + '</span></div>';
          }).join('') +
          '</div>';
      }
      // Bugün P&L kartı — günlük kokpit (en üstte)
      let todayCard = '';
      {
        const tile = function (lbl, val, color) {
          return '<div style="flex:1;min-width:88px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;">' + PCD.escapeHtml(lbl) + '</div>' +
            '<div style="font-size:22px;font-weight:800;color:' + (color || 'var(--text)') + ';margin-top:2px;">' + val + '</div></div>';
        };
        if (todayPL) {
          const fcCol = todayPL.fcPct == null ? 'var(--text-3)' : (todayPL.fcPct <= 35 ? '#1f9d6b' : (todayPL.fcPct <= 40 ? '#d97706' : '#dc2626'));
          const pCol = todayPL.profit >= 0 ? '#1f9d6b' : '#dc2626';
          todayCard = '<div class="cc-today" data-action="view-inventory" style="cursor:pointer;border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
            '<div style="font-weight:800;font-size:14px;margin-bottom:10px;">' + PCD.escapeHtml(t('cc_today_pl') || "Today's P&L") + '</div>' +
            '<div style="display:flex;gap:14px;flex-wrap:wrap;">' +
              tile(t('cc_today_sold') || 'Sold', String(Math.round(todayPL.units))) +
              tile(t('cc_today_revenue') || 'Revenue', PCD.fmtMoney(todayPL.rev)) +
              tile(t('cc_today_fcpct') || 'Food cost %', todayPL.fcPct == null ? '—' : Math.round(todayPL.fcPct) + '%', fcCol) +
              tile(t('cc_today_profit') || 'Profit', PCD.fmtMoney(todayPL.profit), pCol) +
            '</div></div>';
        } else {
          todayCard = '<div class="cc-today" data-action="view-inventory" style="cursor:pointer;border:1px dashed var(--border-strong);border-radius:var(--r-md);padding:14px 16px;margin-bottom:14px;">' +
            '<div style="font-weight:800;font-size:14px;color:var(--text-2);margin-bottom:2px;">' + PCD.escapeHtml(t('cc_today_pl') || "Today's P&L") + '</div>' +
            '<div style="font-size:13px;color:var(--text-3);">' + PCD.escapeHtml(t('cc_today_empty') || 'Record today’s sales (Inventory → Record sales) to see revenue, food cost % and profit.') + '</div></div>';
        }
      }
      commandCenterHtml =
        '<div class="cc-wrap">' +
          todayCard +
          '<div class="cc-metrics">' + fcCard + labourCard + stockCard + incCard + '</div>' +
          '<div class="cc-charts">' + marginChart + freshChart + upcomingChart + '</div>' +
        '</div>';
    }

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
        // v2.17 — Command center
        '.cc-wrap { margin-bottom: 20px; }' +
        '.cc-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }' +
        '.cc-card { text-align: left; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); cursor: pointer; transition: all .15s ease; display: flex; flex-direction: column; gap: 4px; }' +
        '.cc-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); border-color: var(--brand-300); }' +
        '.cc-card.warn { border-left: 3px solid #f59e0b; }' +
        '.cc-card.bad { border-left: 3px solid #dc2626; }' +
        '.cc-card.ok { border-left: 3px solid #1f9d6b; }' +
        '.cc-card .cc-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); font-weight: 600; display: flex; align-items: center; gap: 5px; }' +
        '.cc-card .cc-val { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: var(--text); }' +
        '.cc-card .cc-val.locked { filter: blur(6px); user-select: none; }' +
        '.cc-card .cc-sub { font-size: 11px; color: var(--text-3); }' +
        '.cc-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }' +
        '.cc-chart { padding: 14px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); cursor: pointer; }' +
        '.cc-chart:hover { border-color: var(--brand-300); }' +
        '.cc-chart h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); margin: 0 0 12px; font-weight: 700; }' +
        '.cc-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }' +
        '.cc-bar-name { flex: 0 0 38%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-2); }' +
        '.cc-bar-track { flex: 1; height: 10px; background: var(--surface-2); border-radius: 6px; overflow: hidden; }' +
        '.cc-bar-fill { display: block; height: 100%; border-radius: 6px; }' +
        '.cc-bar-pct { flex: 0 0 42px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }' +
        '.cc-donut-wrap { display: flex; align-items: center; gap: 16px; }' +
        '.cc-donut { width: 96px; height: 96px; border-radius: 50%; flex-shrink: 0; position: relative; }' +
        '.cc-donut::after { content: ""; position: absolute; inset: 18px; background: var(--surface); border-radius: 50%; z-index: 0; }' +
        '.cc-donut-c { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; z-index: 1; color: var(--text); }' +
        '.cc-legend { font-size: 12px; display: flex; flex-direction: column; gap: 5px; }' +
        '.cc-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-inline-end: 6px; }' +
        '.cc-empty { font-size: 12px; color: var(--text-3); padding: 8px 0; }' +
      '</style>' +

      '<h1 class="dash-greet">' + headline + '</h1>' +
      '<div class="dash-date">' + todayStr + (function () {
        const ws = PCD.store.getActiveWorkspace();
        return ws ? ' · <strong style="color:var(--brand-700);">' + PCD.escapeHtml(ws.name) + '</strong>' + (ws.role ? ' (' + PCD.escapeHtml(ws.role) + ')' : '') : '';
      })() + '</div>' +

      // v2.17 — Chef office command center (4 metrik + 2 grafik, gerçek veri)
      commandCenterHtml +

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

    // v2.44 — price-freshness donut → ingredients filtered to aging-price items (actionable)
    PCD.on(view, 'click', '[data-action="open-ingredients-aging"]', function () {
      try { sessionStorage.setItem('pcd_ing_aging', '1'); } catch (e) {}
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
    // v2.17 — Command center: roster + labour upgrade
    PCD.on(view, 'click', '[data-action="open-roster"]', function () {
      PCD.router.go('roster');
    });
    PCD.on(view, 'click', '[data-action="upgrade-labor"]', function () {
      if (PCD.gate && PCD.gate.showUpgradeModal) PCD.gate.showUpgradeModal({ feature: 'labor', message: PCD.i18n.t('labor_cost_locked') });
    });
    PCD.on(view, 'click', '[data-action="view-inventory"]', function () {
      PCD.router.go('inventory');
    });
    PCD.on(view, 'click', '[data-action="view-haccp"]', function () {
      PCD.router.go('haccp_logs');
    });
    PCD.on(view, 'click', '[data-action="view-checklist"]', function () {
      PCD.router.go('checklist');
    });
    PCD.on(view, 'click', '[data-action="view-event"]', function () {
      const eid = this.getAttribute('data-eid');
      PCD.router.go('events');
      _afterToolLoad('events', function (t) { t.openEditor(eid); });
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
