/* ================================================================
   ProChefDesk — variance.js (v3.0)

   Theoretical vs Actual food usage variance.
   ================================================================
   THEORETICAL USAGE per ingredient:
     Σ (sales[recipe] × recipe.ingredient[X].amount)  for the period
   ACTUAL USAGE per ingredient:
     openingStock + purchases - closingStock
   VARIANCE = actual - theoretical
     positive = used MORE than recipes say (waste, overportion, theft)
     negative = used LESS or stock count error

   Sales log shape (per workspace):
     [{ id, date: 'YYYY-MM-DD', recipeId, qty, note }]

   Stock counts come from existing inventory tool — we use
   `inventory[wsId][ingId].stock` snapshots stored in `costHistory`
   or via explicit "snapshot" entries we'll record on bulk-count save.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});

  // Compute theoretical usage of each ingredient given a sales log slice.
  // Returns { ingredientId: amountInIngredientUnit }
  function computeTheoreticalUsage(salesEntries, recipeMap, ingMap) {
    const usage = {};
    salesEntries.forEach(function (s) {
      const recipe = recipeMap[s.recipeId];
      if (!recipe) return;
      const qty = Number(s.qty) || 0;
      if (qty <= 0) return;
      const baseServings = recipe.servings || 1;
      const factor = qty / baseServings; // sold qty / base portions
      addRecipeUsage(recipe, factor, recipeMap, ingMap, usage, {});
    });
    return usage;
  }

  // Recursive: for sub-recipes drill into their ingredients
  function addRecipeUsage(recipe, factor, recipeMap, ingMap, usage, _visited) {
    if (!recipe || !recipe.ingredients) return;
    if (recipe.id) {
      if (_visited[recipe.id]) return;
      _visited[recipe.id] = true;
    }
    recipe.ingredients.forEach(function (ri) {
      const amt = (Number(ri.amount) || 0) * factor;
      if (amt <= 0) return;

      if (ri.recipeId) {
        // sub-recipe — drill in
        const sub = recipeMap[ri.recipeId];
        if (!sub) return;
        const subYield = sub.yieldAmount || sub.servings || 1;
        const subFactor = amt / (subYield || 1);
        addRecipeUsage(sub, subFactor, recipeMap, ingMap, usage, Object.assign({}, _visited));
        return;
      }

      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      // Convert to ingredient's own unit if different
      let amtInIngUnit = amt;
      if (ri.unit && ing.unit && ri.unit !== ing.unit) {
        try { amtInIngUnit = PCD.convertUnit(amt, ri.unit, ing.unit); }
        catch (e) { /* keep amt as-is */ }
      }
      usage[ri.ingredientId] = (usage[ri.ingredientId] || 0) + amtInIngUnit;
    });
  }

  // Build a variance report for a workspace + period.
  // periodStart, periodEnd: 'YYYY-MM-DD' inclusive
  // openingStocks, closingStocks: { ingId: amount } — taken from explicit count snapshots
  // purchases (optional): { ingId: amount } — from receiving log
  function buildVarianceReport(opts) {
    const periodStart = opts.periodStart;
    const periodEnd = opts.periodEnd;
    const openingStocks = opts.openingStocks || {};
    const closingStocks = opts.closingStocks || {};
    const purchases = opts.purchases || {};

    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = {};
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

    // Filter sales log by period
    const allSales = PCD.store.listTable('salesLog') || [];
    const sales = allSales.filter(function (s) {
      if (!s.date) return false;
      return s.date >= periodStart && s.date <= periodEnd;
    });

    const theoretical = computeTheoreticalUsage(sales, recipeMap, ingMap);

    // Actual = opening + purchases - closing
    const actual = {};
    const allIngIds = new Set();
    Object.keys(openingStocks).forEach(function (k) { allIngIds.add(k); });
    Object.keys(closingStocks).forEach(function (k) { allIngIds.add(k); });
    Object.keys(purchases).forEach(function (k) { allIngIds.add(k); });
    allIngIds.forEach(function (iid) {
      const op = Number(openingStocks[iid]) || 0;
      const pu = Number(purchases[iid]) || 0;
      const cl = Number(closingStocks[iid]) || 0;
      actual[iid] = op + pu - cl;
    });

    // Build per-ingredient rows
    const allKeys = new Set();
    Object.keys(theoretical).forEach(function (k) { allKeys.add(k); });
    Object.keys(actual).forEach(function (k) { allKeys.add(k); });
    const rows = [];
    let totalTheoretical = 0, totalActual = 0;
    allKeys.forEach(function (iid) {
      const ing = ingMap[iid];
      if (!ing) return;
      const theo = theoretical[iid] || 0;
      const act = actual[iid] || 0;
      const diff = act - theo;
      const pct = theo > 0 ? (diff / theo) * 100 : (act > 0 ? 100 : 0);
      const price = Number(ing.pricePerUnit) || 0;
      const theoCost = theo * price;
      const actCost = act * price;
      const diffCost = diff * price;
      totalTheoretical += theoCost;
      totalActual += actCost;
      rows.push({
        ingredient: ing,
        theoretical: theo,
        actual: act,
        difference: diff,
        diffPercent: pct,
        theoreticalCost: theoCost,
        actualCost: actCost,
        differenceCost: diffCost,
      });
    });

    // Sort by absolute cost variance descending (biggest leaks first)
    rows.sort(function (a, b) { return Math.abs(b.differenceCost) - Math.abs(a.differenceCost); });

    return {
      periodStart: periodStart,
      periodEnd: periodEnd,
      salesCount: sales.length,
      rows: rows,
      totalTheoreticalCost: totalTheoretical,
      totalActualCost: totalActual,
      totalVarianceCost: totalActual - totalTheoretical,
      totalVariancePercent: totalTheoretical > 0
        ? ((totalActual - totalTheoretical) / totalTheoretical) * 100
        : 0,
    };
  }

  PCD.variance = {
    computeTheoreticalUsage: computeTheoreticalUsage,
    buildVarianceReport: buildVarianceReport,
  };
})();
