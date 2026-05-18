/* ================================================================
   ProChefDesk — variance.js (tool)
   Variance Report — theoretical vs actual food usage.

   v2.9.2 — NAKED→RICH upgrade: full i18n sweep (sıfır key vardı),
   closeable inline guide, stats hero with Variance % primary metric +
   status chip, per-field hints. Pattern: buffet v2.8.77 + v2.8.88,
   yield v2.9.0, waste v2.9.1.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.9.2 — Variance status helpers. Best-in-class operators stay under 2%.
  function varianceStatus(absPct) {
    if (absPct < 2) return 'good';
    if (absPct < 5) return 'warn';
    return 'bad';
  }
  function varianceColor(s) {
    if (s === 'good') return '#16a34a';
    if (s === 'warn') return '#f59e0b';
    return '#dc2626';
  }
  function varianceLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'good') return t('variance_status_good') || 'Tight control';
    if (s === 'warn') return t('variance_status_warn') || 'Worth investigating';
    return t('variance_status_bad') || 'Significant variance';
  }

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

    // v2.9.2 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_variance_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${PCD.escapeHtml(t('variance_title') || 'Variance Report')}</div>
          <div class="page-subtitle">${PCD.escapeHtml(t('variance_subtitle') || 'Theoretical vs actual food usage — find waste, over-portioning, theft')}</div>
        </div>
      </div>

      ${recipes.length === 0 || ings.length === 0 ? `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('activity', 48)}</div>
          <div class="empty-title">${PCD.escapeHtml(t('variance_empty_title') || 'Need recipes + ingredients first')}</div>
          <div class="empty-desc">${PCD.escapeHtml(t('variance_empty_desc') || 'Variance compares what you should have used (based on recipes × sales) against what you actually used (stock counts).')}</div>
        </div>
      ` : ''}

      ${(recipes.length > 0 && ings.length > 0 && !guideHidden) ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('variance_guide_title') || 'How to read a variance report')}</span>
            <button type="button" id="varianceGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('variance_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('variance_guide_step1_title') || 'Pick the period')}</strong> — ${PCD.escapeHtml(t('variance_guide_step1_body') || 'Choose the start + end of a stocktake window (typically a week or a month). Sales logged in this window become the theoretical usage baseline.')}</li>
              <li><strong>${PCD.escapeHtml(t('variance_guide_step2_title') || 'Enter opening + closing stock')}</strong> — ${PCD.escapeHtml(t('variance_guide_step2_body') || 'Count each ingredient at the START and END of the period. Add purchases received during the window. The Use Inventory button pulls current stock as your closing count.')}</li>
              <li><strong>${PCD.escapeHtml(t('variance_guide_step3_title') || 'Run the report')}</strong> — ${PCD.escapeHtml(t('variance_guide_step3_body') || 'Theoretical = recipes × portions sold. Actual = opening + purchases − closing. Difference shows where reality drifted from the menu.')}</li>
              <li><strong>${PCD.escapeHtml(t('variance_guide_step4_title') || 'Investigate the red rows')}</strong> — ${PCD.escapeHtml(t('variance_guide_step4_body') || 'Highlighted rows = >5% variance + >$0.50 impact. Likely causes: over-portioning (chef heavy hand), waste (binned but not logged), theft, or an inaccurate recipe.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('variance_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('variance_guide_tip_body') || 'Best-in-class operators stay under 2% variance. 5%+ is bleeding money. Run weekly during launch, monthly once stable.')}
            </div>
          </div>
        </details>
      ` : ''}

      <div id="varianceBody"></div>
    `;

    if (recipes.length === 0 || ings.length === 0) return;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#varianceGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_variance_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    const bodyEl = PCD.$('#varianceBody', view);

    function renderForm() {
      const periodSales = sales.filter(function (s) {
        return s.date && s.date >= periodStart && s.date <= periodEnd;
      });
      const portionsSold = periodSales.reduce(function (n, s) { return n + (s.qty || 0); }, 0);
      bodyEl.innerHTML = `
        <div class="card mb-3" style="padding:14px;">
          <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">${PCD.escapeHtml(t('variance_step1_title') || 'Step 1 — Period')}</div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">${PCD.escapeHtml(t('variance_from') || 'From')}</label>
              <input type="date" class="input" id="periodStart" value="${periodStart}">
            </div>
            <div class="field">
              <label class="field-label">${PCD.escapeHtml(t('variance_to') || 'To')}</label>
              <input type="date" class="input" id="periodEnd" value="${periodEnd}">
            </div>
          </div>
          <div class="text-muted text-sm" style="font-size:11px;margin-top:4px;">${periodSales.length} ${PCD.escapeHtml(t('variance_sales_entries') || 'sales entries logged in this period')} · ${portionsSold} ${PCD.escapeHtml(t('variance_portions_sold') || 'portions sold')}</div>
        </div>

        <div class="card mb-3" style="padding:14px;">
          <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">
            <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">${PCD.escapeHtml(t('variance_step2_title') || 'Step 2 — Stock counts')}</div>
            <button class="btn btn-outline btn-sm" id="useInventoryBtn">${PCD.icon('package', 14)} <span>${PCD.escapeHtml(t('variance_use_inventory') || 'Use current inventory as closing')}</span></button>
          </div>
          <div class="text-muted text-sm mb-2" style="font-size:12px;">${PCD.escapeHtml(t('variance_stock_help') || 'Enter the stock count at the START and END of the period. Optionally include purchases received during the period.')}</div>
          <div id="stockTable"></div>
        </div>

        <button class="btn btn-primary" id="runReportBtn" style="width:100%;">${PCD.icon('activity', 16)} <span>${PCD.escapeHtml(t('variance_run_report') || 'Run variance report')}</span></button>

        <div id="reportArea" style="margin-top:14px;"></div>
      `;

      // Stock counts table
      const stockEl = PCD.$('#stockTable', bodyEl);
      const colIng = PCD.escapeHtml(t('variance_col_ingredient') || 'Ingredient');
      const colOpen = PCD.escapeHtml(t('variance_col_opening') || 'Opening');
      const colPurch = PCD.escapeHtml(t('variance_col_purchases') || 'Purchases');
      const colClose = PCD.escapeHtml(t('variance_col_closing') || 'Closing');
      const inLbl = PCD.escapeHtml(t('variance_in') || 'in');
      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr>' +
          '<th style="text-align:start;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + colIng + '</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">' + colOpen + '</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">' + colPurch + '</th>' +
          '<th style="text-align:end;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:90px;">' + colClose + '</th>' +
        '</tr></thead><tbody>';
      ings.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); }).forEach(function (ing) {
        html += '<tr>' +
          '<td style="padding:4px 8px;border-bottom:1px solid var(--border);"><div style="font-weight:500;">' + PCD.escapeHtml(ing.name) + '</div><div class="text-muted" style="font-size:11px;">' + inLbl + ' ' + (ing.unit || '') + '</div></td>' +
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
        PCD.toast.success(n + ' ' + (t('variance_inventory_pulled') || 'closing stock values pulled from inventory'));
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
      const absPct = Math.abs(variancePct);
      const status = varianceStatus(absPct);
      const sColor = varianceColor(status);
      const sLabel = varianceLabel(status);

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
      if (rowsHtml === '') rowsHtml = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-3);">' + PCD.escapeHtml(t('variance_no_data') || 'No data — log some sales and enter stock counts') + '</td></tr>';

      // v2.9.2 — Stats hero: Variance % primary (42px) + status chip + 3 secondary metrics
      reportEl.innerHTML =
        '<div class="card" style="padding:14px;">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">' + PCD.escapeHtml(t('variance_step3_title') || 'Step 3 — Report') + '</div>' +

          '<div class="stat mb-3" style="background:linear-gradient(135deg,' + sColor + '18,var(--surface));border-color:' + sColor + ';padding:18px;">' +
            '<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">' +
              '<div style="flex-shrink:0;">' +
                '<div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('variance_diff_pct') || 'Variance (%)') + '</div>' +
                '<div style="font-size:42px;font-weight:900;color:' + sColor + ';line-height:1;letter-spacing:-0.02em;">' + (variancePct > 0 ? '+' : '') + variancePct.toFixed(1) + '<span style="font-size:24px;">%</span></div>' +
              '</div>' +
              '<div style="flex:1;min-width:180px;">' +
                '<span style="display:inline-block;padding:4px 10px;background:' + sColor + '25;color:' + sColor + ';font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">' + PCD.escapeHtml(sLabel) + '</span>' +
                '<div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">' + PCD.escapeHtml(t('variance_status_help') || 'Best-in-class operators stay under 2%') + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
              '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('variance_theoretical') || 'Theoretical') + '</div><div style="font-size:16px;font-weight:700;color:var(--text-2);">' + PCD.fmtMoney(report.totalTheoreticalCost) + '</div></div>' +
              '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('variance_actual') || 'Actual') + '</div><div style="font-size:16px;font-weight:700;color:var(--text-2);">' + PCD.fmtMoney(report.totalActualCost) + '</div></div>' +
              '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('variance_diff_dollar') || 'Variance ($)') + '</div><div style="font-size:16px;font-weight:700;color:' + sColor + ';">' + (report.totalVarianceCost > 0 ? '+' : '') + PCD.fmtMoney(report.totalVarianceCost) + '</div></div>' +
            '</div>' +
          '</div>' +

          '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr>' +
              '<th style="text-align:start;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('variance_col_ingredient') || 'Ingredient') + '</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('variance_theoretical') || 'Theoretical') + '</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('variance_actual') || 'Actual') + '</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('variance_col_difference') || 'Difference') + '</th>' +
              '<th style="text-align:end;padding:8px 10px;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('variance_col_impact') || '$ Impact') + '</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody>' +
          '</table></div>' +

          '<div class="text-muted text-sm mt-2" style="font-size:11px;">' + PCD.escapeHtml(t('variance_highlight_note') || 'Highlighted rows = >5% variance and >$0.50 cost impact. Investigate over-portioning, waste, theft, or recipe inaccuracy.') + '</div>' +

          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap;">' +
            '<button class="btn btn-outline" id="printReportBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('variance_print_pdf') || 'Print PDF') + '</span></button>' +
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
      const titleStr = t('variance_title') || 'Variance Report';
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
        '<div class="h"><h1>' + PCD.escapeHtml(titleStr) + '</h1>' +
          '<div style="color:#666;font-size:11pt;margin-top:4px;">' + rep.periodStart + ' → ' + rep.periodEnd + ' · ' + rep.salesCount + ' ' + PCD.escapeHtml(t('variance_sales_entries') || 'sales entries') + '</div>' +
        '</div>' +
        '<div class="summary">' +
          '<div><div class="lbl">' + PCD.escapeHtml(t('variance_theoretical') || 'Theoretical') + '</div><div class="val">' + PCD.fmtMoney(rep.totalTheoreticalCost) + '</div></div>' +
          '<div><div class="lbl">' + PCD.escapeHtml(t('variance_actual') || 'Actual') + '</div><div class="val">' + PCD.fmtMoney(rep.totalActualCost) + '</div></div>' +
          '<div><div class="lbl">' + PCD.escapeHtml(t('variance_diff_dollar') || 'Variance ($)') + '</div><div class="val" style="color:' + (rep.totalVarianceCost > 0 ? '#dc2626' : '#16a34a') + ';">' + (rep.totalVarianceCost > 0 ? '+' : '') + PCD.fmtMoney(rep.totalVarianceCost) + '</div></div>' +
          '<div><div class="lbl">' + PCD.escapeHtml(t('variance_diff_pct') || 'Variance (%)') + '</div><div class="val" style="color:' + (rep.totalVariancePercent > 0 ? '#dc2626' : '#16a34a') + ';">' + (rep.totalVariancePercent > 0 ? '+' : '') + rep.totalVariancePercent.toFixed(1) + '%</div></div>' +
        '</div>' +
        '<table>' +
          '<thead><tr><th>' + PCD.escapeHtml(t('variance_col_ingredient') || 'Ingredient') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('variance_theoretical') || 'Theoretical') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('variance_actual') || 'Actual') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('variance_col_difference') || 'Difference') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('variance_col_impact') || '$ Impact') + '</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>';
      PCD.print(html, titleStr + ' ' + rep.periodStart + ' to ' + rep.periodEnd);
    }

    renderForm();
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.varianceTool = { render: render };
})();
