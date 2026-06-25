/* ================================================================
   ProChefDesk — menu_engineering.js  (v2.44.46)
   Menu engineering matrix: profitability × popularity →
   Star / Plowhorse / Puzzle / Dog, with a per-dish recommendation.

   Veri kaynağı (yeni veri toplamaz, hepsi mevcut):
     • Maliyet  → PCD.recipes.computeFoodCost (sub-recipe cascade dahil)
     • Fiyat    → recipe.salePrice
     • Satış    → recipe.salesCount (inventory "Record sales" otomatik artırır)
   Fiyat/satış inline düzenlenir → recipe'ye yazılır (recipes tablosu zaten senkron).
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;
  // Eksik i18n anahtarı için İngilizce fallback (anahtarlar sonra eklenebilir).
  function L(key, fb) { try { const v = PCD.i18n.t(key); return (v == null || v === key) ? fb : v; } catch (e) { return fb; } }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort(function (a, b) { return a - b; });
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  const QUAD = {
    star:      { emoji: '⭐', label: 'Star',      color: '#1f9d6b', rec: 'Keep & feature — protect this dish.' },
    plowhorse: { emoji: '🐴', label: 'Plowhorse', color: '#d97706', rec: 'Popular but thin — raise the price or trim the portion.' },
    puzzle:    { emoji: '❓', label: 'Puzzle',    color: '#2563eb', rec: 'Profitable but slow — promote it or move it up the menu.' },
    dog:       { emoji: '🐶', label: 'Dog',       color: '#dc2626', rec: 'Low sales + low profit — consider removing it.' },
  };

  function isPrep(r) {
    return (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r && r.yieldAmount && r.yieldUnit);
  }

  // Faz 2 — dönem-bazlı popülerlik: aralık aktifse "satılan" salesLog'tan o döneme
  // göre; null → recipe.salesCount (tüm zaman, mevcut davranış korunur).
  let mePeriod = null;
  function salesByRecipe(from, to) {
    const map = {};
    try {
      const ws = PCD.store.getActiveWorkspaceId && PCD.store.getActiveWorkspaceId();
      const root = (PCD.store._read && PCD.store._read('salesLog')) || {};
      (root[ws] || []).forEach(function (s) {
        if (!s || !s.recipeId || s._deletedAt) return;
        const d = s.date || '';
        if (from && d < from) return;
        if (to && d > to) return;
        map[s.recipeId] = (map[s.recipeId] || 0) + (Number(s.qty) || 0);
      });
    } catch (e) {}
    return map;
  }

  function buildRows(soldMap) {
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const allRecipes = PCD.store.listRecipes() || [];
    // recipeMap TÜM tarifleri içerir → sub-recipe maliyet cascade'i çözülebilsin.
    allRecipes.forEach(function (r) { recipeMap[r.id] = r; });
    // Analiz YALNIZ satılabilir yemekler: sub-recipe/prep'ler (yemeğin içinde
    // kullanılan bileşenler) hariç — PCD.recipes.isPrep paylaşımlı sınıflandırıcı.
    const recipes = allRecipes.filter(function (r) { return !isPrep(r); });
    const rows = recipes.map(function (r) {
      const totalCost = PCD.recipes.computeFoodCost(r, ingMap, recipeMap) || 0;
      const servings = Number(r.servings) || 1;
      const costPer = totalCost / servings;
      const price = Number(r.salePrice) || 0;
      const sold = soldMap ? (Number(soldMap[r.id]) || 0) : (Number(r.salesCount) || 0);
      const margin = price > 0 ? (price - costPer) : null;
      const profit = margin != null ? margin * sold : 0;
      const fcPct = price > 0 ? (costPer / price) * 100 : null;
      return { r: r, name: r.name || '', costPer: costPer, price: price, sold: sold, margin: margin, profit: profit, fcPct: fcPct };
    });
    const priced = rows.filter(function (x) { return x.price > 0; });
    const medMargin = median(priced.map(function (x) { return x.margin; }));
    const medSold = median(rows.map(function (x) { return x.sold; }));
    rows.forEach(function (x) {
      if (x.price <= 0) { x.quad = 'unpriced'; return; }
      const hiP = x.margin >= medMargin;
      const hiPop = x.sold >= medSold;
      x.quad = hiP && hiPop ? 'star' : (!hiP && hiPop ? 'plowhorse' : (hiP && !hiPop ? 'puzzle' : 'dog'));
    });
    return { rows: rows };
  }

  function render(view) {
    const soldMap = mePeriod ? salesByRecipe(mePeriod.from, mePeriod.to) : null;
    const rows = buildRows(soldMap).rows;
    function money(n) { return PCD.fmtMoney ? PCD.fmtMoney(n) : ('$' + (Number(n) || 0).toFixed(2)); }

    let html = '<div class="page-header"><div class="page-header-text">' +
      '<div class="page-title">' + PCD.escapeHtml(L('me_title', 'Menu Engineering')) + '</div>' +
      '<div class="page-subtitle">' + PCD.escapeHtml(L('me_subtitle', 'Which dishes make money — and which quietly lose it')) + '</div>' +
      '</div></div>';
    html += PCD.subNav('recipes', 'menu_engineering');
    html += PCD.guideCard('menu_engineering', L('me_g_t', 'How menu engineering works'), [
      L('me_g1', 'Set a sale price and how many you sold for each dish (in the table) — cost comes from the recipe automatically.'),
      L('me_g2', 'Each dish lands in a quadrant: ⭐ Star (keep & feature), 🐴 Plowhorse (raise price), ❓ Puzzle (promote), 🐶 Dog (consider dropping).'),
      L('me_g3', 'The summary card shows revenue, food cost % and profit. Dishes selling below cost are flagged red.')
    ]);

    if (!rows.length) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text-3);">' + PCD.escapeHtml(L('me_no_recipes', 'No dishes yet — add recipes first.')) + '</div>';
      view.innerHTML = html; return;
    }

    // Dönem seçici — aralık seçilince popülerlik + mini P&L o döneme göre (salesLog'tan).
    html += '<div class="card mb-3" style="padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<span style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(L('me_period', 'Period')) + '</span>' +
      '<input type="date" class="input" id="mePerFrom" value="' + (mePeriod ? mePeriod.from : '') + '" style="flex:1;min-width:130px;">' +
      '<span class="text-muted">→</span>' +
      '<input type="date" class="input" id="mePerTo" value="' + (mePeriod ? mePeriod.to : '') + '" style="flex:1;min-width:130px;">' +
      '<button class="btn btn-outline btn-sm" id="mePerApply">' + PCD.escapeHtml(L('me_period_apply', 'Apply')) + '</button>' +
      (mePeriod ? '<button class="btn btn-ghost btn-sm" id="mePerClear">' + PCD.escapeHtml(L('me_period_all', 'All time')) + '</button>' : '') +
      '<span class="text-muted" style="font-size:11px;flex-basis:100%;">' + PCD.escapeHtml(mePeriod ? L('me_period_hint_on', 'Popularity = units sold in the selected dates, pulled from Record sales.') : L('me_period_hint_off', 'Showing all-time sales. Pick a date range to rank dishes for a specific period.')) + '</span>' +
      '</div>';

    // v2.44.56 — Menünün mini P&L özeti: satılan adet · ciro · yemek maliyeti ·
    // food cost % · toplam kâr (tek bakışta "kazanıyor muyum?").
    let totSold = 0, totRev = 0, totCost = 0, totProfit = 0;
    rows.forEach(function (x) {
      totSold += x.sold;
      if (x.price > 0) { totRev += x.price * x.sold; totCost += x.costPer * x.sold; totProfit += (x.margin || 0) * x.sold; }
    });
    const fcPct = totRev > 0 ? (totCost / totRev) * 100 : null;
    const fcColor = fcPct == null ? 'var(--text-3)' : (fcPct <= 35 ? '#1f9d6b' : (fcPct <= 40 ? '#d97706' : '#dc2626'));
    const profitColor = totProfit >= 0 ? '#1f9d6b' : '#dc2626';
    function meMetric(label, value, color) {
      return '<div style="background:var(--surface-2);border-radius:var(--r-md);padding:10px 12px;">' +
        '<div style="font-size:12px;color:var(--text-3);">' + PCD.escapeHtml(label) + '</div>' +
        '<div style="font-size:20px;font-weight:700;color:' + (color || 'var(--text-1)') + ';margin-top:2px;">' + PCD.escapeHtml(value) + '</div></div>';
    }
    if (totSold > 0) {
      html += '<div class="card mb-3" style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;">' +
        meMetric(L('me_sum_sold', 'Sold'), String(Math.round(totSold)), 'var(--text-1)') +
        meMetric(L('me_sum_revenue', 'Revenue'), money(totRev), 'var(--text-1)') +
        meMetric(L('me_sum_cost', 'Food cost'), money(totCost), 'var(--text-1)') +
        meMetric(L('me_sum_fcpct', 'Food cost %'), (fcPct == null ? '—' : Math.round(fcPct) + '%'), fcColor) +
        meMetric(L('me_sum_profit', 'Profit'), money(totProfit), profitColor) +
        '</div>';
    } else {
      html += '<div class="card mb-3" style="padding:12px 14px;color:var(--text-3);font-size:13px;">' + PCD.escapeHtml(L('me_sum_hint', 'Enter how many of each dish you sold (in the table below) to see total revenue, food cost % and profit.')) + '</div>';
    }

    const losing = rows.filter(function (x) { return x.margin != null && x.margin < 0; });
    const unpriced = rows.filter(function (x) { return x.price <= 0; });
    if (losing.length) {
      html += '<div class="card mb-3" style="padding:12px 14px;background:#fef2f2;border-color:#dc2626;color:#991b1b;font-weight:600;">⚠ ' +
        losing.length + ' ' + PCD.escapeHtml(L('me_losing_money', 'dish(es) sell below cost — you lose money on every plate.')) + '</div>';
    }
    if (unpriced.length) {
      html += '<div class="card mb-3" style="padding:10px 14px;background:var(--surface-2);color:var(--text-3);font-size:13px;">' +
        unpriced.length + ' ' + PCD.escapeHtml(L('me_unpriced', 'dish(es) have no sale price yet — set a price to analyze them.')) + '</div>';
    }

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:14px;">';
    ['star', 'plowhorse', 'puzzle', 'dog'].forEach(function (q) {
      const list = rows.filter(function (x) { return x.quad === q; });
      const meta = QUAD[q];
      html += '<div class="card" style="padding:12px;border-top:3px solid ' + meta.color + ';">' +
        '<div style="font-weight:800;font-size:14px;">' + meta.emoji + ' ' + PCD.escapeHtml(L('me_' + q, meta.label)) + ' <span style="color:var(--text-3);font-weight:600;">(' + list.length + ')</span></div>' +
        '<div class="text-muted" style="font-size:11px;margin:4px 0 6px;">' + PCD.escapeHtml(L('me_rec_' + q, meta.rec)) + '</div>' +
        (list.length ? '<div style="font-size:12px;color:var(--text-2);">' + list.slice(0, 5).map(function (x) { return PCD.escapeHtml(x.name); }).join(' · ') + (list.length > 5 ? ' …' : '') + '</div>' : '<div style="font-size:12px;color:var(--text-3);">—</div>') +
        '</div>';
    });
    html += '</div>';

    html += '<div class="card" style="padding:0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px;">';
    html += '<thead><tr style="text-align:left;border-bottom:1px solid var(--border);">' +
      '<th style="padding:8px 10px;">' + PCD.escapeHtml(L('me_dish', 'Dish')) + '</th>' +
      '<th style="padding:8px 6px;text-align:right;">' + PCD.escapeHtml(L('me_col_cost', 'Cost')) + '</th>' +
      '<th style="padding:8px 6px;text-align:right;">' + PCD.escapeHtml(L('me_col_price', 'Price')) + '</th>' +
      '<th style="padding:8px 6px;text-align:right;">' + PCD.escapeHtml(L('me_col_sold', 'Sold')) + '</th>' +
      '<th style="padding:8px 6px;text-align:right;">' + PCD.escapeHtml(L('me_col_margin', 'Margin')) + '</th>' +
      '<th style="padding:8px 6px;text-align:right;">' + PCD.escapeHtml(L('me_col_profit', 'Profit')) + '</th>' +
      '<th style="padding:8px 6px;"></th></tr></thead><tbody>';
    rows.slice().sort(function (a, b) { return b.profit - a.profit; }).forEach(function (x) {
      const meta = QUAD[x.quad] || { emoji: '', label: 'No price', color: 'var(--text-3)' };
      const marginStr = x.margin == null ? '—' : money(x.margin);
      const marginColor = (x.margin != null && x.margin < 0) ? '#dc2626' : 'var(--text-1)';
      html += '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:8px 10px;"><div style="font-weight:600;">' + PCD.escapeHtml(x.name) + '</div>' +
          '<div style="font-size:11px;color:' + meta.color + ';font-weight:700;">' + meta.emoji + ' ' + PCD.escapeHtml(x.quad === 'unpriced' ? L('me_no_price', 'No price') : L('me_' + x.quad, meta.label)) + '</div></td>' +
        '<td style="padding:6px 6px;text-align:right;white-space:nowrap;">' + money(x.costPer) + '</td>' +
        '<td style="padding:6px 6px;text-align:right;"><input type="number" class="input me-price" data-rid="' + x.r.id + '" value="' + (x.price || '') + '" step="0.01" min="0" placeholder="—" style="width:74px;text-align:right;padding:4px 6px;"></td>' +
        '<td style="padding:6px 6px;text-align:right;"><input type="number" class="input me-sold" data-rid="' + x.r.id + '" value="' + (x.sold || 0) + '" step="1" min="0"' + (mePeriod ? ' readonly title="' + PCD.escapeHtml(L('me_period_readonly', 'From Record sales for the selected period')) + '"' : '') + ' style="width:62px;text-align:right;padding:4px 6px;' + (mePeriod ? 'background:var(--surface-2);' : '') + '"></td>' +
        '<td style="padding:6px 6px;text-align:right;color:' + marginColor + ';white-space:nowrap;">' + marginStr + (x.fcPct != null ? ' <span style="font-size:10px;color:var(--text-3);">(' + Math.round(x.fcPct) + '%)</span>' : '') + '</td>' +
        '<td style="padding:6px 6px;text-align:right;white-space:nowrap;font-weight:600;">' + money(x.profit) + '</td>' +
        '<td style="padding:6px 6px;text-align:right;"><button class="btn btn-ghost btn-sm me-edit" data-rid="' + x.r.id + '" title="' + PCD.escapeHtml(L('me_edit', 'Edit recipe')) + '">' + PCD.icon('edit', 14) + '</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    html += '<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<div class="text-muted" style="font-size:11px;">' + PCD.escapeHtml(mePeriod ? L('me_period_live', 'Sold counts come live from Record sales for the selected dates — nothing to reset.') : L('me_period_note', '"Sold" auto-fills from Record sales (Inventory). Reset it when a new period starts.')) + '</div>' +
      (mePeriod ? '' : '<button class="btn btn-outline btn-sm" id="meReset">↺ ' + PCD.escapeHtml(L('me_reset_period', 'Reset period sales')) + '</button>') +
      '</div>';

    view.innerHTML = html;

    PCD.$$('.me-price', view).forEach(function (inp) {
      inp.addEventListener('change', function () {
        const r = PCD.store.getRecipe(this.getAttribute('data-rid')); if (!r) return;
        r.salePrice = Number(this.value) || 0; PCD.store.upsertRecipe(r); render(view);
      });
    });
    PCD.$$('.me-sold', view).forEach(function (inp) {
      inp.addEventListener('change', function () {
        const r = PCD.store.getRecipe(this.getAttribute('data-rid')); if (!r) return;
        r.salesCount = Math.max(0, Number(this.value) || 0); PCD.store.upsertRecipe(r); render(view);
      });
    });
    PCD.$$('.me-edit', view).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-rid');
        if (PCD.tools.recipes && PCD.tools.recipes.openEditor) PCD.tools.recipes.openEditor(id);
        else PCD.router.go('recipes');
      });
    });
    const reset = PCD.$('#meReset', view);
    if (reset) reset.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '↺', title: L('me_reset_period', 'Reset period sales'),
        text: L('me_reset_confirm', 'Set every dish’s "sold" count back to zero for a new period? Prices are kept.'),
        okText: L('me_reset_period', 'Reset')
      }).then(function (ok) {
        if (!ok) return;
        (PCD.store.listRecipes() || []).forEach(function (r) { if (r.salesCount) { r.salesCount = 0; PCD.store.upsertRecipe(r); } });
        PCD.toast.success(L('me_reset_done', 'Period sales reset.'));
        render(view);
      });
    });

    const perApply = PCD.$('#mePerApply', view);
    if (perApply) perApply.addEventListener('click', function () {
      const f = PCD.$('#mePerFrom', view).value, tt = PCD.$('#mePerTo', view).value;
      mePeriod = (!f && !tt) ? null : { from: f || '', to: tt || '' };
      render(view);
    });
    const perClear = PCD.$('#mePerClear', view);
    if (perClear) perClear.addEventListener('click', function () { mePeriod = null; render(view); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menuEngineering = { render: render };
})();
