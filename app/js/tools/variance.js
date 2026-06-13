/* ================================================================
   ProChefDesk — variance.js (tool)
   ----------------------------------------------------------------
   Periodic cost-variance check (no POS): compares THEORETICAL usage
   (from production counts the chef enters) vs ACTUAL usage (opening
   stock count − closing stock count). Surfaces where food cost is
   leaking — biggest $ gaps first.
   Reuses the recursive engine PCD.variance.computeTheoreticalUsage.
   Directional weekly/period check (not accounting-grade — mid-period
   purchases shown as an optional note). No new table — transient.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  // production rows entered for the current report (transient, not persisted)
  let production = [];
  let openingId = '';   // stockCountHistory snapshot id
  let closingId = '__current__';

  function snapshots() {
    return (PCD.store.listTable('stockCountHistory') || []).slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });
  }
  function snapStocks(id) {
    if (!id) return {};
    const s = PCD.store.getFromTable('stockCountHistory', id);
    if (!s || !s.counts) return {};
    const out = {};
    Object.keys(s.counts).forEach(function (iid) {
      const c = s.counts[iid];
      out[iid] = Number(c && c.amount != null ? c.amount : c) || 0;
    });
    return out;
  }
  function currentStocks() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('inventory') || {};
    let inv = root[wsId] || root;
    const sample = inv && Object.keys(inv)[0] ? inv[Object.keys(inv)[0]] : null;
    if (sample && sample.stock === undefined && root[wsId]) inv = root[wsId];
    const out = {};
    Object.keys(inv || {}).forEach(function (iid) {
      const r = inv[iid];
      if (r && r.stock != null) out[iid] = Number(r.stock) || 0;
    });
    return out;
  }

  function maps() {
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    return { ingMap: ingMap, recipeMap: recipeMap };
  }

  // Recursive theoretical usage (inlined — core/variance.js is not loaded in index.html).
  // production entries: [{recipeId, qty}] → { ingredientId: amountInIngredientUnit }
  function computeTheoreticalUsage(entries, recipeMap, ingMap) {
    const usage = {};
    (entries || []).forEach(function (s) {
      const recipe = recipeMap[s.recipeId];
      if (!recipe) return;
      const qty = Number(s.qty) || 0;
      if (qty <= 0) return;
      const baseServings = recipe.servings || 1;
      addRecipeUsage(recipe, qty / baseServings, recipeMap, ingMap, usage, {});
    });
    return usage;
  }
  function addRecipeUsage(recipe, factor, recipeMap, ingMap, usage, _visited) {
    if (!recipe || !recipe.ingredients) return;
    if (recipe.id) { if (_visited[recipe.id]) return; _visited[recipe.id] = true; }
    recipe.ingredients.forEach(function (ri) {
      if (ri && ri.separator) return;
      const amt = (Number(ri.amount) || 0) * factor;
      if (amt <= 0) return;
      if (ri.recipeId) {
        const sub = recipeMap[ri.recipeId];
        if (!sub) return;
        const subYield = sub.yieldAmount || sub.servings || 1;
        addRecipeUsage(sub, amt / (subYield || 1), recipeMap, ingMap, usage, Object.assign({}, _visited));
        return;
      }
      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      let amtInIngUnit = amt;
      if (ri.unit && ing.unit && ri.unit !== ing.unit) {
        try { amtInIngUnit = PCD.convertUnit(amt, ri.unit, ing.unit); } catch (e) { /* keep */ }
      }
      usage[ri.ingredientId] = (usage[ri.ingredientId] || 0) + amtInIngUnit;
    });
  }

  function computeReport() {
    const m = maps();
    const theoretical = computeTheoreticalUsage(production.filter(function (p) { return p.recipeId && Number(p.qty) > 0; }), m.recipeMap, m.ingMap);
    const opening = snapStocks(openingId);
    const closing = closingId === '__current__' ? currentStocks() : snapStocks(closingId);

    // Only ingredients present in the opening count have a meaningful actual
    // (opening − closing). Uncounted ingredients are skipped to avoid spurious
    // negative "consumption" from items that only exist in closing/current stock.
    const ids = {};
    Object.keys(opening).forEach(function (k) { ids[k] = 1; });

    const rows = [];
    let totalTheoCost = 0, totalActCost = 0;
    Object.keys(ids).forEach(function (iid) {
      const ing = m.ingMap[iid];
      if (!ing) return;
      const theo = Number(theoretical[iid]) || 0;
      const act = (Number(opening[iid]) || 0) - (Number(closing[iid]) || 0); // consumption
      const price = Number(ing.pricePerUnit) || 0;
      const theoCost = theo * price, actCost = act * price;
      const diffCost = actCost - theoCost;
      totalTheoCost += theoCost; totalActCost += actCost;
      rows.push({ ing: ing, theo: theo, act: act, diff: act - theo, theoCost: theoCost, actCost: actCost, diffCost: diffCost });
    });
    rows.sort(function (a, b) { return Math.abs(b.diffCost) - Math.abs(a.diffCost); });
    return { rows: rows, totalTheoCost: totalTheoCost, totalActCost: totalActCost, totalVarCost: totalActCost - totalTheoCost };
  }

  function render(view) {
    const t = PCD.i18n.t;
    const snaps = snapshots();
    const recs = PCD.store.listRecipes().filter(function (r) { return !(PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r)); })
      .slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    if (openingId === '' && snaps.length >= 1) openingId = snaps.length >= 2 ? snaps[1].id : '';

    function snapOpts(sel, includeCurrent) {
      let h = '';
      if (includeCurrent) h += '<option value="__current__"' + (sel === '__current__' ? ' selected' : '') + '>' + PCD.escapeHtml(t('var_current_stock')) + '</option>';
      h += '<option value=""' + (sel === '' ? ' selected' : '') + '>—</option>';
      snaps.forEach(function (s) {
        const d = s.date ? PCD.fmtDate(new Date(s.date).getTime()) : s.id;
        h += '<option value="' + s.id + '"' + (sel === s.id ? ' selected' : '') + '>' + PCD.escapeHtml(d) + '</option>';
      });
      return h;
    }

    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('var_title')) + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('var_subtitle')) + '</div>' +
      '</div></div>' +
      (snaps.length < 1 ?
        '<div class="card mb-3" style="padding:14px;background:var(--brand-50);border-color:var(--brand-300);">' + PCD.escapeHtml(t('var_need_counts')) + '</div>' : '') +
      '<div class="card mb-3" style="padding:14px;">' +
        '<div class="field-row">' +
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('var_opening')) + '</label><select class="select" id="vOpen">' + snapOpts(openingId, false) + '</select></div>' +
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('var_closing')) + '</label><select class="select" id="vClose">' + snapOpts(closingId, true) + '</select></div>' +
        '</div>' +
        '<div class="text-muted text-sm">' + PCD.escapeHtml(t('var_period_hint')) + '</div>' +
      '</div>' +
      '<div class="card mb-3" style="padding:14px;">' +
        '<div style="font-weight:700;margin-bottom:4px;">' + PCD.escapeHtml(t('var_production')) + '</div>' +
        '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(t('var_production_hint')) + '</div>' +
        '<div id="vProdList" class="flex flex-col gap-1"></div>' +
        '<button class="btn btn-ghost btn-sm mt-2" id="vAddProd" style="width:100%;">' + PCD.icon('plus', 14) + ' ' + PCD.escapeHtml(t('var_add_production')) + '</button>' +
      '</div>' +
      '<div class="flex gap-2 mb-3"><button class="btn btn-primary" id="vCompute" style="flex:1;">' + PCD.icon('activity', 16) + ' ' + PCD.escapeHtml(t('var_compute')) + '</button></div>' +
      '<div id="vReport"></div>';

    const prodList = PCD.$('#vProdList', view);
    function renderProd() {
      if (production.length === 0) { prodList.innerHTML = '<div class="text-muted text-sm" style="padding:6px 0;">' + PCD.escapeHtml(t('var_no_production')) + '</div>'; return; }
      prodList.innerHTML = '';
      production.forEach(function (p, idx) {
        const row = PCD.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
        row.innerHTML =
          '<select class="select" data-vrec="' + idx + '" style="flex:1;"><option value="">—</option>' +
            recs.map(function (r) { return '<option value="' + r.id + '"' + (p.recipeId === r.id ? ' selected' : '') + '>' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
          '</select>' +
          '<input type="number" class="input" data-vqty="' + idx + '" value="' + (p.qty != null && p.qty !== '' ? p.qty : '') + '" min="0" step="1" placeholder="' + PCD.escapeHtml(t('var_qty')) + '" style="width:90px;">' +
          '<button class="icon-btn" data-vdel="' + idx + '">' + PCD.icon('x', 16) + '</button>';
        prodList.appendChild(row);
      });
      prodList.querySelectorAll('[data-vrec]').forEach(function (s) { s.addEventListener('change', function () { production[+s.getAttribute('data-vrec')].recipeId = s.value; }); });
      prodList.querySelectorAll('[data-vqty]').forEach(function (q) { q.addEventListener('input', function () { production[+q.getAttribute('data-vqty')].qty = q.value; }); });
      prodList.querySelectorAll('[data-vdel]').forEach(function (b) { b.addEventListener('click', function () { production.splice(+b.getAttribute('data-vdel'), 1); renderProd(); }); });
    }
    renderProd();

    PCD.$('#vAddProd', view).addEventListener('click', function () { production.push({ recipeId: '', qty: '' }); renderProd(); });
    PCD.$('#vOpen', view).addEventListener('change', function () { openingId = this.value; });
    PCD.$('#vClose', view).addEventListener('change', function () { closingId = this.value; });
    PCD.$('#vCompute', view).addEventListener('click', function () {
      const rep = computeReport();
      renderReport(PCD.$('#vReport', view), rep, t);
    });
  }

  function renderReport(el, rep, t) {
    if (!rep.rows.length) { el.innerHTML = '<div class="empty" style="padding:30px 0;"><div class="empty-title">' + PCD.escapeHtml(t('var_no_result')) + '</div><div class="empty-desc">' + PCD.escapeHtml(t('var_no_result_desc')) + '</div></div>'; return; }
    const varCls = rep.totalVarCost > 0.005 ? 'var(--danger)' : (rep.totalVarCost < -0.005 ? 'var(--warning)' : 'var(--success)');
    let html =
      '<div class="card mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
        '<div><div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('var_total_variance')) + '</div>' +
        '<div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;color:' + varCls + ';">' + (rep.totalVarCost >= 0 ? '+' : '') + PCD.fmtMoney(rep.totalVarCost) + '</div></div>' +
        '<div class="text-muted text-sm" style="text-align:right;">' + PCD.escapeHtml(t('var_theoretical')) + ': ' + PCD.fmtMoney(rep.totalTheoCost) + '<br>' + PCD.escapeHtml(t('var_actual')) + ': ' + PCD.fmtMoney(rep.totalActCost) + '</div>' +
      '</div>';
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;">' +
      '<thead><tr style="text-align:left;border-bottom:2px solid var(--border);">' +
        '<th style="padding:6px 8px;">' + PCD.escapeHtml(t('var_ingredient')) + '</th>' +
        '<th style="padding:6px 8px;text-align:right;">' + PCD.escapeHtml(t('var_theoretical')) + '</th>' +
        '<th style="padding:6px 8px;text-align:right;">' + PCD.escapeHtml(t('var_actual')) + '</th>' +
        '<th style="padding:6px 8px;text-align:right;">' + PCD.escapeHtml(t('var_variance')) + '</th>' +
      '</tr></thead><tbody>';
    rep.rows.forEach(function (r) {
      const dc = r.diffCost;
      const col = dc > 0.005 ? 'var(--danger)' : (dc < -0.005 ? 'var(--warning)' : 'var(--text-2)');
      html += '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:6px 8px;">' + PCD.escapeHtml(r.ing.name) + '</td>' +
        '<td style="padding:6px 8px;text-align:right;">' + PCD.fmtNumber(Math.round(r.theo * 10) / 10) + ' ' + PCD.escapeHtml(r.ing.unit || '') + '</td>' +
        '<td style="padding:6px 8px;text-align:right;">' + PCD.fmtNumber(Math.round(r.act * 10) / 10) + ' ' + PCD.escapeHtml(r.ing.unit || '') + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + col + ';">' + (dc >= 0 ? '+' : '') + PCD.fmtMoney(dc) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="text-muted text-sm mt-2">' + PCD.escapeHtml(t('var_legend')) + '</div>';
    el.innerHTML = html;
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.variance = { render: render };
})();
