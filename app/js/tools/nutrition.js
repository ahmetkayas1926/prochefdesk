/* ================================================================
   ProChefDesk — nutrition.js (Estimated nutrition)
   ----------------------------------------------------------------
   ESTIMATED per-serving nutrition for a recipe. Reference values are
   per-100g macros from public, official sources (USDA FoodData Central
   / FSANZ — public domain). This is a GUIDE / ESTIMATE, NOT a certified
   nutrition label. Matches recipe ingredients to the reference by name
   keyword, flattens sub-recipes (PCD.recipes.flattenIngredients), and
   sums calories/protein/carbs/fat. Liquids approximated at density 1.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  // Per 100 g: [kcal, protein g, carbohydrate g, fat g]. Public USDA/FSANZ values.
  // keywords are lowercase substrings matched against the ingredient name (en + tr).
  const REF = [
    { k: ['onion', 'soğan', 'sogan', 'échalote', 'shallot'], n: [40, 1.1, 9.3, 0.1] },
    { k: ['garlic', 'sarımsak', 'sarimsak'], n: [149, 6.4, 33, 0.5] },
    { k: ['carrot', 'havuç', 'havuc'], n: [41, 0.9, 10, 0.2] },
    { k: ['potato', 'patates'], n: [77, 2, 17, 0.1] },
    { k: ['tomato', 'domates'], n: [18, 0.9, 3.9, 0.2] },
    { k: ['tomato paste', 'salça', 'salca'], n: [82, 4.3, 19, 0.5] },
    { k: ['leek', 'pırasa', 'pirasa'], n: [61, 1.5, 14, 0.3] },
    { k: ['celery', 'kereviz'], n: [16, 0.7, 3, 0.2] },
    { k: ['mushroom', 'mantar'], n: [22, 3.1, 3.3, 0.3] },
    { k: ['spinach', 'ıspanak', 'ispanak'], n: [23, 2.9, 3.6, 0.4] },
    { k: ['pepper', 'biber', 'capsicum'], n: [31, 1, 6, 0.3] },
    { k: ['zucchini', 'courgette', 'kabak'], n: [17, 1.2, 3.1, 0.3] },
    { k: ['eggplant', 'aubergine', 'patlıcan', 'patlican'], n: [25, 1, 6, 0.2] },
    { k: ['cucumber', 'salatalık', 'salatalik'], n: [15, 0.7, 3.6, 0.1] },
    { k: ['lettuce', 'marul'], n: [15, 1.4, 2.9, 0.2] },
    { k: ['broccoli', 'brokoli'], n: [34, 2.8, 7, 0.4] },
    { k: ['cauliflower', 'karnabahar'], n: [25, 1.9, 5, 0.3] },
    { k: ['green bean', 'fasulye'], n: [31, 1.8, 7, 0.2] },
    { k: ['pea', 'bezelye'], n: [81, 5.4, 14, 0.4] },
    { k: ['corn', 'mısır', 'misir'], n: [86, 3.2, 19, 1.2] },
    { k: ['pumpkin', 'balkabağı', 'balkabagi'], n: [26, 1, 6.5, 0.1] },
    { k: ['apple', 'elma'], n: [52, 0.3, 14, 0.2] },
    { k: ['lemon', 'limon'], n: [29, 1.1, 9, 0.3] },
    { k: ['orange', 'portakal'], n: [47, 0.9, 12, 0.1] },
    { k: ['butter', 'tereyağı', 'tereyagi'], n: [717, 0.9, 0.1, 81] },
    { k: ['milk', 'süt', 'sut'], n: [61, 3.2, 4.8, 3.3] },
    { k: ['cream', 'krema'], n: [340, 2.1, 2.8, 36] },
    { k: ['cheddar'], n: [403, 25, 1.3, 33] },
    { k: ['parmesan', 'parmigiano'], n: [431, 38, 4, 29] },
    { k: ['mozzarella'], n: [280, 28, 3, 17] },
    { k: ['gruyere', 'gruyère'], n: [413, 30, 0.4, 32] },
    { k: ['feta', 'beyaz peynir'], n: [264, 14, 4, 21] },
    { k: ['cheese', 'peynir'], n: [402, 25, 2, 33] },
    { k: ['yogurt', 'yoğurt', 'yogurt'], n: [61, 3.5, 4.7, 3.3] },
    { k: ['egg', 'yumurta'], n: [143, 13, 0.7, 9.5] },
    { k: ['chicken', 'tavuk'], n: [190, 29, 0, 7.5] },
    { k: ['beef', 'dana', 'sığır', 'sigir'], n: [250, 26, 0, 15] },
    { k: ['pork', 'domuz'], n: [242, 27, 0, 14] },
    { k: ['lamb', 'kuzu'], n: [294, 25, 0, 21] },
    { k: ['bacon', 'lardon', 'pastırma', 'pastirma'], n: [541, 37, 1.4, 42] },
    { k: ['duck', 'ördek', 'ordek'], n: [337, 19, 0, 28] },
    { k: ['salmon', 'somon'], n: [208, 20, 0, 13] },
    { k: ['tuna', 'ton balığı'], n: [132, 28, 0, 1] },
    { k: ['shrimp', 'prawn', 'karides'], n: [99, 24, 0.2, 0.3] },
    { k: ['scallop', 'tarak'], n: [88, 17, 2.4, 0.8] },
    { k: ['cod', 'fish', 'balık', 'balik', 'sole', 'bass'], n: [96, 21, 0, 1] },
    { k: ['flour', 'un'], n: [364, 10, 76, 1] },
    { k: ['sugar', 'şeker', 'seker'], n: [387, 0, 100, 0] },
    { k: ['rice', 'pirinç', 'pirinc'], n: [365, 7, 80, 0.7] },
    { k: ['pasta', 'makarna', 'spaghetti', 'noodle'], n: [371, 13, 75, 1.5] },
    { k: ['baguette'], n: [274, 9, 53, 2] },
    { k: ['bread', 'ekmek'], n: [265, 9, 49, 3.2] },
    { k: ['breadcrumb', 'galeta'], n: [395, 14, 72, 5] },
    { k: ['oat', 'yulaf'], n: [389, 17, 66, 7] },
    { k: ['couscous'], n: [376, 13, 77, 0.6] },
    { k: ['starch', 'nişasta', 'nisasta', 'cornflour'], n: [381, 0.3, 91, 0] },
    { k: ['olive oil', 'zeytinyağı', 'zeytinyagi'], n: [884, 0, 0, 100] },
    { k: ['oil', 'yağ', 'yag', 'sunflower', 'canola'], n: [884, 0, 0, 100] },
    { k: ['chickpea', 'nohut'], n: [364, 19, 61, 6] },
    { k: ['lentil', 'mercimek'], n: [352, 25, 60, 1] },
    { k: ['almond', 'badem'], n: [579, 21, 22, 50] },
    { k: ['walnut', 'ceviz'], n: [654, 15, 14, 65] },
    { k: ['honey', 'bal'], n: [304, 0.3, 82, 0] },
    { k: ['wine', 'şarap', 'sarap'], n: [85, 0.1, 2.6, 0] },
    { k: ['stock', 'broth', 'bouillon', 'suyu', 'fond'], n: [7, 1, 0.5, 0.2] },
    { k: ['mustard', 'hardal'], n: [66, 4, 5, 4] },
    { k: ['vinegar', 'sirke'], n: [18, 0, 0.9, 0] },
    { k: ['soy sauce', 'soya'], n: [53, 8, 5, 0.6] },
    { k: ['parsley', 'thyme', 'basil', 'herb', 'maydanoz', 'kekik', 'fesleğen', 'nane', 'mint', 'rosemary', 'biberiye'], n: [28, 1, 5, 0.4] },
    { k: ['chocolate', 'çikolata', 'cikolata'], n: [546, 5, 61, 31] },
    { k: ['cocoa', 'kakao'], n: [228, 20, 58, 14] },
  ];

  function matchNutrition(name) {
    const n = (name || '').toLowerCase();
    if (!n) return null;
    // longest keyword wins (more specific) — e.g. "olive oil" before "oil"
    let best = null, bestLen = 0;
    REF.forEach(function (row) {
      row.k.forEach(function (kw) {
        if (n.indexOf(kw) >= 0 && kw.length > bestLen) { bestLen = kw.length; best = row; }
      });
    });
    return best;
  }

  function toGrams(amount, unit) {
    amount = Number(amount) || 0;
    const u = (unit || '').toLowerCase();
    if (u === 'g' || u === 'ml') return amount;            // ml ≈ g (density ~1, estimate)
    if (u === 'kg' || u === 'l' || u === 'lt') return amount * 1000;
    if (u === 'mg') return amount / 1000;
    return null; // pcs, bunch, tbsp, etc. — cannot weigh reliably
  }

  function estimateRecipe(recipe, ingMap, recipeMap) {
    const flat = (PCD.recipes && PCD.recipes.flattenIngredients)
      ? (PCD.recipes.flattenIngredients(recipe, ingMap, recipeMap, {}) || []) : [];
    let kcal = 0, p = 0, c = 0, f = 0, matched = 0, total = 0;
    const missing = [];
    flat.forEach(function (it) {
      const ing = ingMap[it.ingredientId];
      if (!ing) return;
      total++;
      const grams = toGrams(it.amount, it.unit);
      const nut = matchNutrition(ing.name);
      if (grams == null || !nut) { missing.push(ing.name); return; }
      matched++;
      const factor = grams / 100;
      kcal += nut.n[0] * factor; p += nut.n[1] * factor; c += nut.n[2] * factor; f += nut.n[3] * factor;
    });
    const servings = Number(recipe.servings) || 1;
    return {
      perServing: { kcal: kcal / servings, p: p / servings, c: c / servings, f: f / servings },
      total: { kcal: kcal, p: p, c: c, f: f },
      matched: matched, totalCount: total,
      coverage: total ? Math.round(matched / total * 100) : 0,
      missing: missing,
    };
  }

  function render(view) {
    const t = PCD.i18n.t;
    const recs = PCD.store.listRecipes().filter(function (r) { return !(PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r)); })
      .slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('nutr_title')) + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('nutr_subtitle')) + '</div>' +
      '</div></div>' +
      (recs.length === 0 ? '<div class="card" style="padding:14px;">' + PCD.escapeHtml(t('nutr_no_recipes')) + '</div>' :
      '<div class="card mb-3" style="padding:14px;">' +
        '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('nutr_pick_recipe')) + '</label>' +
          '<select class="select" id="nutRec"><option value="">—</option>' +
            recs.map(function (r) { return '<option value="' + r.id + '">' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
          '</select></div>' +
      '</div>' +
      '<div id="nutOut"></div>');

    const sel = PCD.$('#nutRec', view);
    if (sel) sel.addEventListener('change', function () {
      const out = PCD.$('#nutOut', view);
      const r = PCD.store.getRecipe(sel.value);
      if (!r) { out.innerHTML = ''; return; }
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (x) { recipeMap[x.id] = x; });
      renderResult(out, estimateRecipe(r, ingMap, recipeMap), r, t);
    });
  }

  function macroCard(label, val, unit, color) {
    return '<div style="flex:1;min-width:110px;background:var(--surface-2);border-radius:var(--r-md);padding:10px 12px;text-align:center;">' +
      '<div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(label) + '</div>' +
      '<div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;' + (color ? 'color:' + color + ';' : '') + '">' + val + '<span style="font-size:12px;font-weight:600;"> ' + unit + '</span></div></div>';
  }

  function renderResult(el, est, recipe, t) {
    const ps = est.perServing;
    const r1 = function (x) { return Math.round(x); };
    const r1d = function (x) { return Math.round(x * 10) / 10; };
    let html =
      '<div class="card mb-2" style="padding:16px;">' +
        '<div style="font-weight:700;margin-bottom:2px;">' + PCD.escapeHtml(recipe.name) + '</div>' +
        '<div class="text-muted text-sm mb-3">' + PCD.escapeHtml(t('nutr_per_serving')) + ' · ' + (Number(recipe.servings) || 1) + ' ' + PCD.escapeHtml(t('nutr_servings') || 'servings') + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          macroCard(t('nutr_calories'), r1(ps.kcal), 'kcal', 'var(--brand-700)') +
          macroCard(t('nutr_protein'), r1d(ps.p), 'g') +
          macroCard(t('nutr_carbs'), r1d(ps.c), 'g') +
          macroCard(t('nutr_fat'), r1d(ps.f), 'g') +
        '</div>' +
      '</div>';
    // coverage
    const covColor = est.coverage >= 80 ? 'var(--success)' : (est.coverage >= 50 ? 'var(--warning)' : 'var(--danger)');
    html += '<div class="text-sm mb-2"><span style="color:' + covColor + ';font-weight:700;">' + est.coverage + '%</span> ' +
      PCD.escapeHtml(t('nutr_coverage_note').replace('{m}', est.matched).replace('{n}', est.totalCount)) + '</div>';
    if (est.missing.length) {
      html += '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(t('nutr_missing')) + ': ' + PCD.escapeHtml(est.missing.slice(0, 8).join(', ')) + (est.missing.length > 8 ? '…' : '') + '</div>';
    }
    html += '<div class="card" style="padding:12px;background:var(--brand-50);border-color:var(--brand-300);font-size:12px;line-height:1.5;">' + PCD.escapeHtml(t('nutr_disclaimer')) + '</div>';
    el.innerHTML = html;
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.nutrition = { render: render, estimateRecipe: estimateRecipe, matchNutrition: matchNutrition };
})();
