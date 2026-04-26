/* ================================================================
   ProChefDesk — sales.js (v3.0)
   Manual daily sales entry — feeds variance tracker.
   Each entry: { id, date, recipeId, qty, note }
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    const log = PCD.store.listTable('salesLog') || [];
    log.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    const recMap = {};
    recipes.forEach(function (r) { recMap[r.id] = r; });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">Sales Log</div>
          <div class="page-subtitle">Daily sales — used for variance tracking (theoretical vs actual food cost)</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newSaleBtn">${PCD.icon('plus', 16)} <span>Log sale</span></button>
        </div>
      </div>

      ${recipes.length === 0 ? `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('book-open', 48)}</div>
          <div class="empty-title">No recipes yet</div>
          <div class="empty-desc">Create some recipes first, then come back to log how many of each you sold.</div>
        </div>
      ` : ''}

      <div id="salesList"></div>
    `;

    const listEl = PCD.$('#salesList', view);
    if (recipes.length === 0) return;

    if (log.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('activity', 48)}</div>
          <div class="empty-title">No sales logged yet</div>
          <div class="empty-desc">Log how many portions of each recipe you sold each day. Used by Variance Report to spot waste, over-portioning, or theft.</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyLogBtn">${PCD.icon('plus', 14)} <span>Log first sale</span></button></div>
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
          '<div class="text-muted text-sm">' + total + ' total portions</div>' +
        '</div>';
        const rows = PCD.el('div', { class: 'flex flex-col gap-1' });
        byDate[d].forEach(function (s) {
          const r = recMap[s.recipeId];
          const row = PCD.el('div', { class: 'card', 'data-sale': s.id, style: { padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } });
          row.innerHTML = '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;">' + (r ? PCD.escapeHtml(r.name) : '<em class="text-muted">(removed recipe)</em>') + '</div>' +
            (s.note ? '<div class="text-muted text-sm">' + PCD.escapeHtml(s.note) + '</div>' : '') +
          '</div>' +
          '<div style="font-weight:700;font-size:18px;color:var(--brand-700);">' + (s.qty || 0) + '</div>' +
          '<button class="icon-btn" data-del-sale="' + s.id + '" title="Delete" onclick="event.stopPropagation()">' + PCD.icon('trash', 16) + '</button>';
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
        title: 'Delete sale entry?',
        okText: 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('salesLog', id);
        PCD.toast.success('Deleted');
        render(view);
      });
    });
  }

  function openSaleEditor(saleId) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (recipes.length === 0) { PCD.toast.warning('Create some recipes first'); return; }

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
        '<div class="field"><label class="field-label">Date</label>' +
          '<input type="date" class="input" id="saleDate" value="' + PCD.escapeHtml(data.date) + '"></div>' +
        '<div class="field"><label class="field-label">Quantity sold</label>' +
          '<input type="number" class="input" id="saleQty" value="' + (data.qty || 1) + '" min="1" step="1" style="font-weight:700;font-size:18px;text-align:center;"></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">Recipe *</label>' +
        '<select class="select" id="saleRecipe">' +
          recipes.map(function (r) { return '<option value="' + r.id + '"' + (data.recipeId === r.id ? ' selected' : '') + '>' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="field"><label class="field-label">Note (optional)</label>' +
        '<input type="text" class="input" id="saleNote" value="' + PCD.escapeHtml(data.note || '') + '" placeholder="e.g. lunch service, banquet"></div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? 'Edit sale' : 'Log sale',
      body: body, footer: footer, size: 'sm', closable: true
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      data.date = PCD.$('#saleDate', body).value;
      data.recipeId = PCD.$('#saleRecipe', body).value;
      data.qty = parseInt(PCD.$('#saleQty', body).value, 10) || 1;
      data.note = (PCD.$('#saleNote', body).value || '').trim();
      if (!data.date) { PCD.toast.error('Date required'); return; }
      if (!data.recipeId) { PCD.toast.error('Recipe required'); return; }
      if (data.qty < 1) { PCD.toast.error('Quantity must be 1 or more'); return; }
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
