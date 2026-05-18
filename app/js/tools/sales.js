/* ================================================================
   ProChefDesk — sales.js (v3.0)
   Manual daily sales entry — feeds variance tracker.
   Each entry: { id, date, recipeId, qty, note }

   v2.9.10 — NAKED→RICH upgrade: full i18n sweep (was 2 keys), closeable
   inline guide, stats hero (this week portions + top recipe + active days).
   Pattern: buffet v2.8.77, variance v2.9.2.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.9.10 — Volume status for "portions this week" hero
  function volumeStatus(count) {
    if (count >= 200) return 'busy';
    if (count >= 50) return 'steady';
    if (count > 0) return 'slow';
    return 'none';
  }
  function volumeColor(s) {
    if (s === 'busy') return '#16a34a';
    if (s === 'steady') return '#16a34a';
    if (s === 'slow') return '#f59e0b';
    return '#6b7280';
  }
  function volumeLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'busy') return t('sales_vol_busy') || 'Busy week';
    if (s === 'steady') return t('sales_vol_steady') || 'Steady';
    if (s === 'slow') return t('sales_vol_slow') || 'Slow';
    return t('sales_vol_none') || 'No data';
  }

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    const log = PCD.store.listTable('salesLog') || [];
    log.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    const recMap = {};
    recipes.forEach(function (r) { recMap[r.id] = r; });

    // v2.9.10 — Stats hero data
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    let weekPortions = 0;
    let monthPortions = 0;
    const monthDates = {};
    const recipeCounts = {};
    log.forEach(function (s) {
      if (!s.date) return;
      const ts = new Date(s.date).getTime();
      const qty = s.qty || 0;
      if (ts >= weekAgo) weekPortions += qty;
      if (ts >= monthAgo) {
        monthPortions += qty;
        monthDates[s.date] = true;
      }
      if (s.recipeId && recMap[s.recipeId]) {
        recipeCounts[s.recipeId] = (recipeCounts[s.recipeId] || 0) + qty;
      }
    });
    const activeDays = Object.keys(monthDates).length;
    let topRecipe = null;
    let topRecipeCount = 0;
    Object.keys(recipeCounts).forEach(function (rid) {
      if (recipeCounts[rid] > topRecipeCount) {
        topRecipeCount = recipeCounts[rid];
        topRecipe = recMap[rid];
      }
    });
    const volStatus = log.length > 0 ? volumeStatus(weekPortions) : null;
    const volColor = volStatus ? volumeColor(volStatus) : '#6b7280';

    // v2.9.10 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_sales_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${PCD.escapeHtml(t('sales_title') || 'Sales Log')}</div>
          <div class="page-subtitle">${PCD.escapeHtml(t('sales_subtitle') || 'Daily sales — used for variance tracking (theoretical vs actual food cost)')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newSaleBtn">${PCD.icon('plus', 16)} <span>${PCD.escapeHtml(t('sales_log_sale') || 'Log sale')}</span></button>
        </div>
      </div>

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('sales_guide_title') || 'How daily sales logging works')}</span>
            <button type="button" id="salesGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('sales_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('sales_guide_step1_title') || 'Log at end of service')}</strong> — ${PCD.escapeHtml(t('sales_guide_step1_body') || 'Pick the date, recipe, and portion count. Add a note (lunch service / banquet / catering) if useful. Takes 10 seconds per recipe.')}</li>
              <li><strong>${PCD.escapeHtml(t('sales_guide_step2_title') || 'Feeds the Variance Report')}</strong> — ${PCD.escapeHtml(t('sales_guide_step2_body') || 'Variance Report multiplies recipes × portions sold = theoretical food usage. Compared against actual stock counts, it spots over-portioning, waste, theft, or recipe inaccuracy.')}</li>
              <li><strong>${PCD.escapeHtml(t('sales_guide_step3_title') || 'Top recipe insight')}</strong> — ${PCD.escapeHtml(t('sales_guide_step3_body') || 'The stats above surface your top seller. Reorder ingredients with that in mind, and consider featuring it in marketing.')}</li>
              <li><strong>${PCD.escapeHtml(t('sales_guide_step4_title') || 'Tap to edit, delete to remove')}</strong> — ${PCD.escapeHtml(t('sales_guide_step4_body') || 'Click any row to edit qty/recipe/date. Trash icon removes an entry. Edits + deletes sync immediately if logged in.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('sales_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('sales_guide_tip_body') || 'If you have a POS, batch-enter daily totals each evening from the POS report. Variance Report needs sales data covering the same period as the stocktake.')}
            </div>
          </div>
        </details>
      ` : ''}

      ${recipes.length === 0 ? `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('book-open', 48)}</div>
          <div class="empty-title">${PCD.escapeHtml(t('sales_no_recipes_title') || 'No recipes yet')}</div>
          <div class="empty-desc">${PCD.escapeHtml(t('sales_no_recipes_desc') || 'Create some recipes first, then come back to log how many of each you sold.')}</div>
        </div>
      ` : ''}

      ${recipes.length > 0 && log.length > 0 ? `
        <div class="stat mb-3" style="background:linear-gradient(135deg,${volColor}18,var(--surface));border-color:${volColor};padding:18px;">
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('sales_week_portions') || 'Portions this week')}</div>
              <div style="font-size:42px;font-weight:900;color:${volColor};line-height:1;letter-spacing:-0.02em;">${weekPortions}</div>
            </div>
            <div style="flex:1;min-width:180px;">
              ${volStatus ? `<span style="display:inline-block;padding:4px 10px;background:${volColor}25;color:${volColor};font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">${PCD.escapeHtml(volumeLabel(volStatus))}</span>` : ''}
              <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">${monthPortions} ${PCD.escapeHtml(t('sales_month_total') || 'portions in last 30 days')}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('sales_top_recipe') || 'Top recipe (30d)')}</div><div style="font-size:14px;font-weight:700;color:var(--text-2);">${topRecipe ? PCD.escapeHtml(topRecipe.name) + ' · ' + topRecipeCount : '—'}</div></div>
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('sales_active_days') || 'Active days (30d)')}</div><div style="font-size:18px;font-weight:700;color:var(--text-2);">${activeDays}</div></div>
          </div>
        </div>
      ` : ''}

      <div id="salesList"></div>
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#salesGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_sales_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    const listEl = PCD.$('#salesList', view);
    if (recipes.length === 0) return;

    if (log.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('activity', 48)}</div>
          <div class="empty-title">${PCD.escapeHtml(t('sales_empty_title') || 'No sales logged yet')}</div>
          <div class="empty-desc">${PCD.escapeHtml(t('sales_empty_desc') || 'Log how many portions of each recipe you sold each day. Used by Variance Report to spot waste, over-portioning, or theft.')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyLogBtn">${PCD.icon('plus', 14)} <span>${PCD.escapeHtml(t('sales_log_first') || 'Log first sale')}</span></button></div>
        </div>
      `;
      const btn = PCD.$('#emptyLogBtn', listEl);
      if (btn) btn.addEventListener('click', function () { openSaleEditor(); });
    } else {
      // Group by date
      const byDate = {};
      log.forEach(function (s) {
        const d = s.date || 'unknown';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(s);
      });
      Object.keys(byDate).sort().reverse().forEach(function (d) {
        const section = PCD.el('div', { style: { marginBottom: '20px' } });
        const total = byDate[d].reduce(function (n, s) { return n + (s.qty || 0); }, 0);
        const dateStr = (function () {
          try { return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
          catch (e) { return d; }
        })();
        section.innerHTML = '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(dateStr) + '</div>' +
          '<div class="text-muted text-sm">' + total + ' ' + PCD.escapeHtml(t('sales_total_portions') || 'total portions') + '</div>' +
        '</div>';
        const rows = PCD.el('div', { class: 'flex flex-col gap-1' });
        byDate[d].forEach(function (s) {
          const r = recMap[s.recipeId];
          const row = PCD.el('div', { class: 'card', 'data-sale': s.id, style: { padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } });
          row.innerHTML = '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;">' + (r ? PCD.escapeHtml(r.name) : '<em class="text-muted">(' + PCD.escapeHtml(t('sales_removed_recipe') || 'removed recipe') + ')</em>') + '</div>' +
            (s.note ? '<div class="text-muted text-sm">' + PCD.escapeHtml(s.note) + '</div>' : '') +
          '</div>' +
          '<div style="font-weight:700;font-size:18px;color:var(--brand-700);">' + (s.qty || 0) + '</div>' +
          '<button class="icon-btn" data-del-sale="' + s.id + '" title="' + PCD.escapeHtml(t('delete') || 'Delete') + '" onclick="event.stopPropagation()">' + PCD.icon('trash', 16) + '</button>';
          rows.appendChild(row);
        });
        section.appendChild(rows);
        listEl.appendChild(section);
      });
    }

    PCD.$('#newSaleBtn', view).addEventListener('click', function () { openSaleEditor(); });
    PCD.on(view, 'click', '[data-sale]', function (e) {
      if (e.target.closest('[data-del-sale]')) return;
      openSaleEditor(this.getAttribute('data-sale'));
    });
    PCD.on(view, 'click', '[data-del-sale]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-del-sale');
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('sales_delete_title'),
        okText: t('sales_delete_ok')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('salesLog', id);
        PCD.toast.success(t('toast_deleted'));
        render(view);
      });
    });
  }

  function openSaleEditor(saleId) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (recipes.length === 0) { PCD.toast.warning(t('toast_create_recipes_first')); return; }

    const existing = saleId ? PCD.store.getFromTable('salesLog', saleId) : null;
    const data = existing ? Object.assign({}, existing) : {
      date: new Date().toISOString().slice(0, 10),
      recipeId: recipes[0].id,
      qty: 1,
      note: '',
    };

    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field-row">' +
        '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('date') || 'Date') + '</label>' +
          '<input type="date" class="input" id="saleDate" value="' + PCD.escapeHtml(data.date) + '"></div>' +
        '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('sales_qty_sold') || 'Quantity sold') + '</label>' +
          '<input type="number" class="input" id="saleQty" value="' + (data.qty || 1) + '" min="1" step="1" style="font-weight:700;font-size:18px;text-align:center;"></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('recipe') || 'Recipe') + ' *</label>' +
        '<select class="select" id="saleRecipe">' +
          recipes.map(function (r) { return '<option value="' + r.id + '"' + (data.recipeId === r.id ? ' selected' : '') + '>' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('sales_note_label') || 'Note (optional)') + '</label>' +
        '<input type="text" class="input" id="saleNote" value="' + PCD.escapeHtml(data.note || '') + '" placeholder="' + PCD.escapeHtml(t('sales_note_ph') || 'e.g. lunch service, banquet') + '"></div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (t('sales_edit') || 'Edit sale') : (t('sales_log_sale') || 'Log sale'),
      body: body, footer: footer, size: 'sm', closable: true
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      data.date = PCD.$('#saleDate', body).value;
      data.recipeId = PCD.$('#saleRecipe', body).value;
      data.qty = parseInt(PCD.$('#saleQty', body).value, 10) || 1;
      data.note = (PCD.$('#saleNote', body).value || '').trim();
      if (!data.date) { PCD.toast.error(t('toast_date_required')); return; }
      if (!data.recipeId) { PCD.toast.error(t('toast_recipe_required')); return; }
      if (data.qty < 1) { PCD.toast.error(t('toast_quantity_min')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('salesLog', data, 'sl');
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'sales') render(v);
      }, 150);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.sales = { render: render, openEditor: openSaleEditor };
})();
