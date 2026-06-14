/* ================================================================
   ProChefDesk — variance.js (tool)
   ----------------------------------------------------------------
   Periodic cost-variance check (no POS, no stock-count required):
   chef enters PRODUCTION (recipe × qty) → THEORETICAL ingredient usage
   is computed. Each ingredient row shows an editable ACTUAL-used field
   (defaults to theoretical); the chef edits what they really used (or
   lost) for items they measured → VARIANCE ($) updates live, biggest
   leak first. If stock counts exist, one tap can pre-fill actuals from
   them. Transient — nothing is saved.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  let production = [];   // [{recipeId, qty}]
  let actuals = {};      // { ingredientId: actualAmountString } — user overrides

  function snapshots() {
    return (PCD.store.listTable('stockCountHistory') || []).filter(function (s) { return s && !s._deletedAt; })
      .slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
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
    const keys = Object.keys(inv || {});
    if (keys.length && inv[keys[0]] && inv[keys[0]].stock === undefined && root[wsId]) inv = root[wsId];
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

  // Recursive theoretical usage (core/variance.js isn't loaded in index.html — inlined).
  function computeTheoreticalUsage(entries, recipeMap, ingMap) {
    const usage = {};
    (entries || []).forEach(function (s) {
      const recipe = recipeMap[s.recipeId];
      if (!recipe) return;
      const qty = Number(s.qty) || 0;
      if (qty <= 0) return;
      addRecipeUsage(recipe, qty / (recipe.servings || 1), recipeMap, ingMap, usage, {});
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
        addRecipeUsage(sub, amt / (sub.yieldAmount || sub.servings || 1), recipeMap, ingMap, usage, Object.assign({}, _visited));
        return;
      }
      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      let a = amt;
      if (ri.unit && ing.unit && ri.unit !== ing.unit) {
        try { a = PCD.convertUnit(amt, ri.unit, ing.unit); } catch (e) { /* keep */ }
      }
      usage[ri.ingredientId] = (usage[ri.ingredientId] || 0) + a;
    });
  }

  function buildRows() {
    const m = maps();
    const theo = computeTheoreticalUsage(production.filter(function (p) { return p.recipeId && Number(p.qty) > 0; }), m.recipeMap, m.ingMap);
    const rows = Object.keys(theo).map(function (iid) {
      const ing = m.ingMap[iid];
      if (!ing) return null;
      const theoAmt = Number(theo[iid]) || 0;
      const has = actuals[iid] != null && actuals[iid] !== '';
      const actual = has ? (Number(actuals[iid]) || 0) : theoAmt;
      const price = Number(ing.pricePerUnit) || 0;
      return { iid: iid, ing: ing, theo: theoAmt, actual: actual, hasActual: has, price: price, varCost: (actual - theoAmt) * price };
    }).filter(Boolean);
    rows.sort(function (a, b) { return Math.abs(b.varCost) - Math.abs(a.varCost); });
    return rows;
  }

  function varColor(v) { return v > 0.005 ? 'var(--danger)' : (v < -0.005 ? 'var(--warning)' : 'var(--text-2)'); }

  function render(view) {
    const t = PCD.i18n.t;
    const recs = PCD.store.listRecipes().filter(function (r) { return !(PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(r)); })
      .slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    const hasSnaps = snapshots().length > 0;

    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('var_title')) + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('var_subtitle')) + '</div>' +
      '</div></div>' +
      '<div class="card mb-3" style="padding:14px;">' +
        '<div style="font-weight:700;margin-bottom:2px;">' + PCD.escapeHtml(t('var_production')) + '</div>' +
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
          '<select class="select" data-vrec="' + idx + '" style="flex:1;min-width:0;"><option value="">—</option>' +
            recs.map(function (r) { return '<option value="' + r.id + '"' + (p.recipeId === r.id ? ' selected' : '') + '>' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
          '</select>' +
          '<input type="number" class="input" data-vqty="' + idx + '" value="' + (p.qty != null && p.qty !== '' ? p.qty : '') + '" min="0" step="1" placeholder="' + PCD.escapeHtml(t('var_qty')) + '" style="width:84px;">' +
          '<button class="icon-btn" data-vdel="' + idx + '">' + PCD.icon('x', 16) + '</button>';
        prodList.appendChild(row);
      });
      prodList.querySelectorAll('[data-vrec]').forEach(function (s) { s.addEventListener('change', function () { production[+s.getAttribute('data-vrec')].recipeId = s.value; }); });
      prodList.querySelectorAll('[data-vqty]').forEach(function (q) { q.addEventListener('input', function () { production[+q.getAttribute('data-vqty')].qty = q.value; }); });
      prodList.querySelectorAll('[data-vdel]').forEach(function (b) { b.addEventListener('click', function () { production.splice(+b.getAttribute('data-vdel'), 1); renderProd(); }); });
    }
    renderProd();

    PCD.$('#vAddProd', view).addEventListener('click', function () { production.push({ recipeId: '', qty: '' }); renderProd(); });
    PCD.$('#vCompute', view).addEventListener('click', function () { renderTable(PCD.$('#vReport', view), t, hasSnaps); });
  }

  function prefillFromCounts() {
    const snaps = snapshots();
    if (!snaps.length) return;
    const opening = snapStocks(snaps[snaps.length - 1].id); // oldest snapshot = opening
    const closing = snaps.length >= 2 ? snapStocks(snaps[0].id) : currentStocks(); // newest snapshot, else current
    const rows = buildRows();
    rows.forEach(function (r) {
      if (opening[r.iid] != null) {
        const used = (Number(opening[r.iid]) || 0) - (Number(closing[r.iid]) || 0);
        actuals[r.iid] = String(Math.round(used * 100) / 100);
      }
    });
  }

  function renderTable(el, t, hasSnaps) {
    const rows = buildRows();
    if (!rows.length) {
      el.innerHTML = '<div class="empty" style="padding:30px 0;"><div class="empty-title">' + PCD.escapeHtml(t('var_no_result')) + '</div><div class="empty-desc">' + PCD.escapeHtml(t('var_no_result_desc')) + '</div></div>';
      return;
    }
    let total = rows.reduce(function (s, r) { return s + r.varCost; }, 0);

    let html =
      '<div class="card mb-2" id="vTotalCard" style="background:var(--brand-50);border-color:var(--brand-300);padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<div><div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('var_total_variance')) + '</div>' +
        '<div id="vTotalVal" style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;color:' + varColor(total) + ';">' + (total >= 0 ? '+' : '') + PCD.fmtMoney(total) + '</div></div>' +
        (hasSnaps ? '<button class="btn btn-outline btn-sm" id="vPrefill">' + PCD.escapeHtml(t('var_prefill')) + '</button>' : '') +
      '</div>' +
      '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(t('var_actual_hint')) + '</div>' +
      '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid var(--border);">' +
          '<th style="padding:6px 8px;">' + PCD.escapeHtml(t('var_ingredient')) + '</th>' +
          '<th style="padding:6px 6px;text-align:right;">' + PCD.escapeHtml(t('var_theoretical')) + '</th>' +
          '<th style="padding:6px 6px;text-align:right;">' + PCD.escapeHtml(t('var_actual')) + '</th>' +
          '<th style="padding:6px 8px;text-align:right;">' + PCD.escapeHtml(t('var_variance')) + '</th>' +
        '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:6px 8px;">' + PCD.escapeHtml(r.ing.name) + '</td>' +
        '<td style="padding:6px 6px;text-align:right;white-space:nowrap;">' + PCD.fmtNumber(Math.round(r.theo * 10) / 10) + ' <span class="text-muted">' + PCD.escapeHtml(r.ing.unit || '') + '</span></td>' +
        '<td style="padding:4px 6px;text-align:right;"><input type="number" class="input" data-aiid="' + r.iid + '" value="' + (Math.round(r.actual * 100) / 100) + '" step="0.1" min="0" style="width:78px;text-align:right;padding:4px 6px;font-variant-numeric:tabular-nums;"></td>' +
        '<td style="padding:6px 8px;text-align:right;font-weight:700;white-space:nowrap;color:' + varColor(r.varCost) + ';" data-vc="' + r.iid + '">' + (r.varCost >= 0 ? '+' : '') + PCD.fmtMoney(r.varCost) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="text-muted text-sm mt-2">' + PCD.escapeHtml(t('var_legend')) + '</div>';
    el.innerHTML = html;

    // map iid → row for live recompute
    const byId = {}; rows.forEach(function (r) { byId[r.iid] = r; });
    function recomputeTotal() {
      let tot = 0; Object.keys(byId).forEach(function (k) { tot += byId[k].varCost; });
      const tv = PCD.$('#vTotalVal', el);
      if (tv) { tv.textContent = (tot >= 0 ? '+' : '') + PCD.fmtMoney(tot); tv.style.color = varColor(tot); }
    }
    el.querySelectorAll('[data-aiid]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const iid = inp.getAttribute('data-aiid');
        actuals[iid] = inp.value;
        const r = byId[iid];
        if (!r) return;
        r.actual = inp.value === '' ? r.theo : (Number(inp.value) || 0);
        r.varCost = (r.actual - r.theo) * r.price;
        const cell = el.querySelector('[data-vc="' + iid + '"]');
        if (cell) { cell.textContent = (r.varCost >= 0 ? '+' : '') + PCD.fmtMoney(r.varCost); cell.style.color = varColor(r.varCost); }
        recomputeTotal();
      });
    });
    const pf = PCD.$('#vPrefill', el);
    if (pf) pf.addEventListener('click', function () { prefillFromCounts(); renderTable(el, t, hasSnaps); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.variance = { render: render, computeTheoreticalUsage: computeTheoreticalUsage };
})();
