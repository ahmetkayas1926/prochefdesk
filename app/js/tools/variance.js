/* ================================================================
   ProChefDesk — variance.js (tool)
   Variance Report — theoretical vs actual food usage.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const sales = PCD.store.listTable('salesLog') || [];

    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    let periodStart = weekAgo.toISOString().slice(0, 10);
    let periodEnd = today.toISOString().slice(0, 10);
    let openingStocks = {};
    let closingStocks = {};
    let purchases = {};
    let report = null;

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">Variance Report</div>
          <div class="page-subtitle">Theoretical vs actual food usage — find waste, over-portioning, theft</div>
        </div>
      </div>

      ${recipes.length === 0 || ings.length === 0 ? `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('activity', 48)}</div>
          <div class="empty-title">Need recipes + ingredients first</div>
          <div class="empty-desc">Variance compares what you should have used (based on recipes × sales) against what you actually used (stock counts).</div>
        </div>
      ` : ''}

      <div id="varianceBody"></div>
    `;

    if (recipes.length === 0 || ings.length === 0) return;

    const bodyEl = PCD.$('#varianceBody', view);

    function renderForm() {
      const periodSales = sales.filter(function (s) {
        return s.date && s.date >= periodStart && s.date <= periodEnd;
      });
      bodyEl.innerHTML = `
        <div class="card mb-3" style="padding:14px;">
          <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Step 1 — Period</div>
          <div class="field-row">
            <div class="field"><label class="field-label">From</label>
              <input type="date" class="input" id="periodStart" value="${periodStart}"></div>
            <div class="field"><label class="field-label">To</label>
              <input type="date" class="input" id="periodEnd" value="${periodEnd}"></div>
          </div>
          <div class="text-muted text-sm">${periodSales.length} sales entries logged in this period · ${periodSales.reduce(function (n, s) { return n + (s.qty || 0); }, 0)} portions sold</div>
        </div>

        <div class="card mb-3" style="padding:14px;">
          <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">
            <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">Step 2 — Stock counts</div>
            <button class="btn btn-outline btn-sm" id="useInventoryBtn">${PCD.icon('package', 14)} <span>Use current inventory as closing</span></button>
          </div>
          <div class="text-muted text-sm mb-2">Enter the stock count at the START and END of the period. Optionally include purchases received during the period.</div>
          <div id="stockTable"></div>
        </div>

        <button class="btn btn-primary" id="runReportBtn" style="width:100%;">${PCD.icon('activity', 16)} <span>Run variance report</span></button>

        <div id="reportArea" style="margin-top:14px;"></div>
      `;

      // Stock counts table
      const stockEl = PCD.$('#stockTable', bodyEl);
      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr>' +
          '<th style="text-align:start;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Ingredient</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">Opening</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">Purchases</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">Closing</th>' +
        '</tr></thead><tbody>';
      ings.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); }).forEach(function (ing) {
        html += '<tr>' +
          '<td style="padding:4px 8px;border-bottom:1px solid var(--border);"><div style="font-weight:500;">' + PCD.escapeHtml(ing.name) + '</div><div class="text-muted" style="font-size:11px;">in ' + (ing.unit || '') + '</div></td>' +
          '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;">' +
            '<input type="number" class="input" data-stock="opening" data-iid="' + ing.id + '" value="' + (openingStocks[ing.id] || '') + '" step="0.01" min="0" placeholder="0" style="width:80px;text-align:end;padding:4px 6px;min-height:30px;font-family:var(--font-mono);">' +
          '</td>' +
          '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;">' +
            '<input type="number" class="input" data-stock="purchases" data-iid="' + ing.id + '" value="' + (purchases[ing.id] || '') + '" step="0.01" min="0" placeholder="0" style="width:80px;text-align:end;padding:4px 6px;min-height:30px;font-family:var(--font-mono);">' +
          '</td>' +
          '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;">' +
            '<input type="number" class="input" data-stock="closing" data-iid="' + ing.id + '" value="' + (closingStocks[ing.id] || '') + '" step="0.01" min="0" placeholder="0" style="width:80px;text-align:end;padding:4px 6px;min-height:30px;font-family:var(--font-mono);">' +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      stockEl.innerHTML = html;

      // Wire
      PCD.$('#periodStart', bodyEl).addEventListener('change', function () { periodStart = this.value; renderForm(); });
      PCD.$('#periodEnd', bodyEl).addEventListener('change', function () { periodEnd = this.value; renderForm(); });
      PCD.on(stockEl, 'input', '[data-stock]', function () {
        const which = this.getAttribute('data-stock');
        const iid = this.getAttribute('data-iid');
        const v = parseFloat(this.value);
        const target = which === 'opening' ? openingStocks : (which === 'closing' ? closingStocks : purchases);
        if (isNaN(v) || v === '') delete target[iid];
        else target[iid] = v;
      });
      PCD.$('#useInventoryBtn', bodyEl).addEventListener('click', function () {
        const inv = PCD.store._read('inventory') || {};
        const wsId = PCD.store.getActiveWorkspaceId();
        const wsInv = inv[wsId] || {};
        let n = 0;
        Object.keys(wsInv).forEach(function (iid) {
          const row = wsInv[iid];
          if (row && row.stock != null) {
            closingStocks[iid] = Number(row.stock);
            n++;
          }
        });
        PCD.toast.success(n + ' closing stock values pulled from inventory');
        renderForm();
      });
      PCD.$('#runReportBtn', bodyEl).addEventListener('click', runReport);
      if (report) renderReport();
    }

    function runReport() {
      report = PCD.variance.buildVarianceReport({
        periodStart: periodStart,
        periodEnd: periodEnd,
        openingStocks: openingStocks,
        closingStocks: closingStocks,
        purchases: purchases,
      });
      renderReport();
    }

    function renderReport() {
      const reportEl = PCD.$('#reportArea', bodyEl);
      if (!report) { reportEl.innerHTML = ''; return; }

      const variancePct = report.totalVariancePercent;
      const status = Math.abs(variancePct) < 2 ? 'good' : Math.abs(variancePct) < 5 ? 'warn' : 'bad';
      const statusColor = status === 'good' ? 'var(--success,#16a34a)' : status === 'warn' ? '#d97706' : '#dc2626';
      const statusLabel = status === 'good' ? 'Tight control' : status === 'warn' ? 'Worth investigating' : 'Significant variance';

      let rowsHtml = '';
      report.rows.slice(0, 30).forEach(function (r) {
        const diffSign = r.differenceCost > 0 ? '+' : '';
        const sigBad = Math.abs(r.diffPercent) > 5 && Math.abs(r.differenceCost) > 0.5;
        rowsHtml += '<tr style="' + (sigBad ? 'background:#fef2f2;' : '') + '">' +
          '<td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:500;">' + PCD.escapeHtml(r.ingredient.name) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);">' + PCD.fmtNumber(r.theoretical) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);">' + PCD.fmtNumber(r.actual) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-weight:700;color:' + (r.differenceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + diffSign + PCD.fmtNumber(r.difference) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-weight:700;color:' + (r.differenceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + diffSign + PCD.fmtMoney(r.differenceCost) + '</td>' +
        '</tr>';
      });
      if (rowsHtml === '') rowsHtml = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-3);">No data — log some sales and enter stock counts</td></tr>';

      reportEl.innerHTML =
        '<div class="card" style="padding:14px;">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Step 3 — Report</div>' +
          '<div class="grid mb-3" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">' +
            '<div class="card" style="padding:12px;background:var(--surface-2);"><div class="text-muted text-sm">Theoretical</div><div style="font-weight:700;font-size:18px;">' + PCD.fmtMoney(report.totalTheoreticalCost) + '</div></div>' +
            '<div class="card" style="padding:12px;background:var(--surface-2);"><div class="text-muted text-sm">Actual</div><div style="font-weight:700;font-size:18px;">' + PCD.fmtMoney(report.totalActualCost) + '</div></div>' +
            '<div class="card" style="padding:12px;background:' + statusColor + '11;"><div class="text-muted text-sm">Variance ($)</div><div style="font-weight:700;font-size:18px;color:' + statusColor + ';">' + (report.totalVarianceCost > 0 ? '+' : '') + PCD.fmtMoney(report.totalVarianceCost) + '</div></div>' +
            '<div class="card" style="padding:12px;background:' + statusColor + '11;"><div class="text-muted text-sm">Variance (%)</div><div style="font-weight:700;font-size:18px;color:' + statusColor + ';">' + (variancePct > 0 ? '+' : '') + variancePct.toFixed(1) + '%</div></div>' +
          '</div>' +
          '<div style="padding:10px 14px;background:' + statusColor + '11;color:' + statusColor + ';border-radius:8px;margin-bottom:14px;font-weight:600;font-size:14px;">' + statusLabel + ' · Best-in-class operators stay under 2%</div>' +

          '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr>' +
              '<th style="text-align:start;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Ingredient</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Theoretical</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Actual</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Difference</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">$ Impact</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody>' +
          '</table></div>' +

          '<div class="text-muted text-sm mt-2" style="font-size:11px;">Highlighted rows = >5% variance and >$0.50 cost impact. Investigate over-portioning, waste, theft, or recipe inaccuracy.</div>' +

          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap;">' +
            '<button class="btn btn-outline" id="printReportBtn">' + PCD.icon('print', 14) + ' <span>Print PDF</span></button>' +
          '</div>' +
        '</div>';

      const printBtn = PCD.$('#printReportBtn', bodyEl);
      if (printBtn) printBtn.addEventListener('click', function () { printReport(report); });
    }

    function printReport(rep) {
      let rowsHtml = '';
      rep.rows.forEach(function (r) {
        const diffSign = r.differenceCost > 0 ? '+' : '';
        rowsHtml += '<tr>' +
          '<td>' + PCD.escapeHtml(r.ingredient.name) + '</td>' +
          '<td style="text-align:right;">' + PCD.fmtNumber(r.theoretical) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="text-align:right;">' + PCD.fmtNumber(r.actual) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="text-align:right;font-weight:700;color:' + (r.differenceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + diffSign + PCD.fmtNumber(r.difference) + ' ' + (r.ingredient.unit || '') + '</td>' +
          '<td style="text-align:right;font-weight:700;color:' + (r.differenceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + diffSign + PCD.fmtMoney(r.differenceCost) + '</td>' +
        '</tr>';
      });
      const html =
        '<style>' +
          '@page { size: A4; margin: 15mm; }' +
          'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
          '.h { border-bottom: 3px solid #16a34a; padding-bottom: 10px; margin-bottom: 16px; }' +
          '.h h1 { margin: 0; font-size: 22pt; color: #16a34a; }' +
          '.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0 18px; padding: 14px; background: #f8f8f8; border-radius: 6px; }' +
          '.summary .lbl { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }' +
          '.summary .val { font-size: 14pt; font-weight: 700; }' +
          'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
          'thead th { background: #f1f1f1; padding: 8px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }' +
          'tbody td { padding: 6px 8px; border-bottom: 1px solid #eee; }' +
        '</style>' +
        '<div class="h"><h1>Variance Report</h1>' +
          '<div style="color:#666;font-size:11pt;margin-top:4px;">' + rep.periodStart + ' → ' + rep.periodEnd + ' · ' + rep.salesCount + ' sales entries</div>' +
        '</div>' +
        '<div class="summary">' +
          '<div><div class="lbl">Theoretical</div><div class="val">' + PCD.fmtMoney(rep.totalTheoreticalCost) + '</div></div>' +
          '<div><div class="lbl">Actual</div><div class="val">' + PCD.fmtMoney(rep.totalActualCost) + '</div></div>' +
          '<div><div class="lbl">Variance ($)</div><div class="val" style="color:' + (rep.totalVarianceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + (rep.totalVarianceCost > 0 ? '+' : '') + PCD.fmtMoney(rep.totalVarianceCost) + '</div></div>' +
          '<div><div class="lbl">Variance (%)</div><div class="val" style="color:' + (rep.totalVariancePercent > 0 ? '#dc2626' : '#16a34a') + ';">' + (rep.totalVariancePercent > 0 ? '+' : '') + rep.totalVariancePercent.toFixed(1) + '%</div></div>' +
        '</div>' +
        '<table>' +
          '<thead><tr><th>Ingredient</th><th style="text-align:right;">Theoretical</th><th style="text-align:right;">Actual</th><th style="text-align:right;">Difference</th><th style="text-align:right;">$ Impact</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>';
      PCD.print(html, 'Variance Report ' + rep.periodStart + ' to ' + rep.periodEnd);
    }

    renderForm();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.varianceTool = { render: render };
})();
