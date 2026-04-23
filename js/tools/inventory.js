/* ================================================================
   ProChefDesk — inventory.js
   Stock tracking with par levels and reorder alerts.

   Data: PCD.store.inventory = {
     <ingredientId>: {
       stock: number,        // current stock in ingredient.unit
       parLevel: number,     // desired stock level
       minLevel: number,     // critical threshold
       lastCountedAt: iso,
       lastOrderedAt: iso,
     }
   }

   Status rules:
   - stock <= 0                    → OUT (red)
   - stock < minLevel              → CRITICAL (red)
   - stock < parLevel              → LOW (orange/yellow)
   - stock >= parLevel             → OK (green)
   - no data / parLevel == null    → Not tracked (gray)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function computeStatus(invRow) {
    if (!invRow || invRow.parLevel == null) return 'untracked';
    const stock = Number(invRow.stock) || 0;
    const par = Number(invRow.parLevel) || 0;
    const min = Number(invRow.minLevel) || 0;
    if (stock <= 0) return 'out';
    if (min > 0 && stock < min) return 'critical';
    if (stock < par) return 'low';
    return 'ok';
  }

  function statusColor(s) {
    return {
      out: 'var(--danger)',
      critical: 'var(--danger)',
      low: 'var(--warning)',
      ok: 'var(--success)',
      untracked: 'var(--text-3)',
    }[s];
  }

  function statusLabel(s) {
    const t = PCD.i18n.t;
    return {
      out: t('inv_status_out'),
      critical: t('inv_status_critical'),
      low: t('inv_status_low'),
      ok: t('inv_status_ok'),
      untracked: '—',
    }[s];
  }

  function render(view) {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients();
    const invAll = PCD.store._read('inventory') || {};
    let filter = 'all';

    // Aggregate stats
    function getRow(id) { return invAll[id] || null; }

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('inventory_title')}</div>
          <div class="page-subtitle">${t('inventory_subtitle')}</div>
        </div>
      </div>
      <div id="invStats" class="grid mb-3" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));"></div>
      <div class="flex gap-2 mb-3" style="overflow-x:auto;scrollbar-width:none;">
        <button class="btn btn-secondary btn-sm active" data-filter="all">${t('inv_filter_all')}</button>
        <button class="btn btn-secondary btn-sm" data-filter="low">${t('inv_filter_low')}</button>
        <button class="btn btn-secondary btn-sm" data-filter="ok">${t('inv_filter_ok')}</button>
      </div>
      <div id="invList"></div>
    `;

    const statsEl = PCD.$('#invStats', view);
    const listEl = PCD.$('#invList', view);

    function computeStats() {
      let ok = 0, low = 0, crit = 0, untracked = 0, value = 0;
      ings.forEach(function (i) {
        const row = getRow(i.id);
        const s = computeStatus(row);
        if (s === 'ok') ok++;
        else if (s === 'low') low++;
        else if (s === 'critical' || s === 'out') crit++;
        else untracked++;
        if (row && row.stock != null) {
          value += (Number(row.stock) || 0) * (Number(i.pricePerUnit) || 0);
        }
      });
      return { ok: ok, low: low, crit: crit, untracked: untracked, value: value };
    }

    function renderStats() {
      const s = computeStats();
      statsEl.innerHTML = `
        <div class="stat">
          <div class="stat-label">${t('inv_status_ok')}</div>
          <div class="stat-value" style="color:var(--success);">${s.ok}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('inv_status_low')}</div>
          <div class="stat-value" style="color:var(--warning);">${s.low}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('inv_status_critical')}</div>
          <div class="stat-value" style="color:var(--danger);">${s.crit}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('inv_stock_value')}</div>
          <div class="stat-value">${PCD.fmtMoney(s.value)}</div>
        </div>
      `;
    }

    function renderList() {
      PCD.clear(listEl);
      if (ings.length === 0) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📦</div>
            <div class="empty-title">${t('no_ingredients_yet')}</div>
            <div class="empty-desc">${t('no_ingredients_yet_desc')}</div>
            <div class="empty-action"><button class="btn btn-primary" id="goIng">${t('new_ingredient')}</button></div>
          </div>
        `;
        PCD.$('#goIng', listEl).addEventListener('click', function () { PCD.router.go('ingredients'); });
        return;
      }

      // Group by status-priority (critical/out first, then low, then ok, then untracked)
      const rows = ings.map(function (i) {
        const r = getRow(i.id);
        const s = computeStatus(r);
        return { ing: i, row: r, status: s };
      });
      const filtered = rows.filter(function (x) {
        if (filter === 'all') return true;
        if (filter === 'low') return x.status === 'out' || x.status === 'critical' || x.status === 'low';
        if (filter === 'ok') return x.status === 'ok';
        return true;
      });

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="empty"><div class="empty-desc">No items in this filter</div></div>';
        return;
      }

      // Sort: out > critical > low > untracked > ok
      const order = { out: 0, critical: 1, low: 2, untracked: 3, ok: 4 };
      filtered.sort(function (a, b) {
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return (a.ing.name || '').localeCompare(b.ing.name || '');
      });

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      filtered.forEach(function (x) {
        const row = PCD.el('div', { class: 'list-item', 'data-iid': x.ing.id });
        const color = statusColor(x.status);
        const stockText = x.row && x.row.stock != null
          ? PCD.fmtNumber(x.row.stock) + ' ' + x.ing.unit
          : '—';
        const parText = x.row && x.row.parLevel != null
          ? PCD.fmtNumber(x.row.parLevel) + ' ' + x.ing.unit
          : '—';
        row.innerHTML = `
          <div class="list-item-thumb" style="background:${color};color:white;font-weight:700;">${statusLabel(x.status).charAt(0)}</div>
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(x.ing.name)}</div>
            <div class="list-item-meta">
              <span><strong>${stockText}</strong> / ${parText}</span>
              ${x.row && x.row.lastOrderedAt ? '<span>·</span><span>' + t('inv_last_ordered') + ': ' + PCD.fmtRelTime(x.row.lastOrderedAt) + '</span>' : ''}
            </div>
          </div>
          <div style="flex-shrink:0;">
            <span class="chip" style="background:${color}20;color:${color};font-weight:700;">${statusLabel(x.status)}</span>
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.on(view, 'click', '[data-filter]', function () {
      PCD.$$('[data-filter]', view).forEach(function (b) { b.classList.remove('active'); b.classList.replace('btn-primary', 'btn-secondary'); });
      this.classList.add('active');
      this.classList.replace('btn-secondary', 'btn-primary');
      filter = this.getAttribute('data-filter');
      renderList();
    });

    PCD.on(listEl, 'click', '[data-iid]', function () {
      openEditor(this.getAttribute('data-iid'));
    });

    renderStats();
    renderList();
  }

  // ============ EDITOR ============
  function openEditor(ingId) {
    const t = PCD.i18n.t;
    const ing = PCD.store.getIngredient(ingId);
    if (!ing) { PCD.toast.error('Ingredient not found'); return; }
    const invAll = PCD.store._read('inventory') || {};
    const row = invAll[ingId] ? PCD.clone(invAll[ingId]) : { stock: null, parLevel: null, minLevel: null, lastCountedAt: null, lastOrderedAt: null };
    const status = computeStatus(row);

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="card mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:12px;">
        <div class="flex items-center justify-between">
          <div>
            <div style="font-weight:700;font-size:16px;">${PCD.escapeHtml(ing.name)}</div>
            <div class="text-muted text-sm">${PCD.fmtMoney(ing.pricePerUnit)} / ${ing.unit}</div>
          </div>
          <span class="chip" style="background:${statusColor(status)}20;color:${statusColor(status)};font-weight:700;">${statusLabel(status)}</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field-label">${t('inv_current_stock')}</label>
          <div class="input-group">
            <input type="number" class="input" id="invStock" value="${row.stock != null ? row.stock : ''}" step="0.01" min="0" placeholder="0">
            <span class="input-group-addon">${ing.unit}</span>
          </div>
          ${row.lastCountedAt ? '<div class="field-hint">' + t('inv_last_counted') + ': ' + PCD.fmtRelTime(row.lastCountedAt) + '</div>' : ''}
        </div>
        <div class="field">
          <label class="field-label">${t('inv_stock_value')}</label>
          <div class="input" style="background:var(--surface-2);display:flex;align-items:center;" id="invValue">—</div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field-label">${t('inv_par_level')}</label>
          <div class="input-group">
            <input type="number" class="input" id="invPar" value="${row.parLevel != null ? row.parLevel : ''}" step="0.01" min="0" placeholder="0">
            <span class="input-group-addon">${ing.unit}</span>
          </div>
          <div class="field-hint">Target stock level</div>
        </div>
        <div class="field">
          <label class="field-label">${t('inv_min_level')}</label>
          <div class="input-group">
            <input type="number" class="input" id="invMin" value="${row.minLevel != null ? row.minLevel : ''}" step="0.01" min="0" placeholder="0">
            <span class="input-group-addon">${ing.unit}</span>
          </div>
          <div class="field-hint">Critical threshold</div>
        </div>
      </div>

      <div class="flex gap-2 mt-3">
        <button class="btn btn-outline btn-block" id="markOrdered">${t('inv_mark_ordered')}</button>
      </div>
      ${row.lastOrderedAt ? '<div class="text-muted text-sm mt-2">' + t('inv_last_ordered') + ': ' + PCD.fmtRelTime(row.lastOrderedAt) + '</div>' : ''}
    `;

    function updateValue() {
      const s = parseFloat(PCD.$('#invStock', body).value) || 0;
      const v = s * (Number(ing.pricePerUnit) || 0);
      PCD.$('#invValue', body).textContent = PCD.fmtMoney(v);
    }
    updateValue();
    PCD.$('#invStock', body).addEventListener('input', updateValue);

    PCD.$('#markOrdered', body).addEventListener('click', function () {
      row.lastOrderedAt = new Date().toISOString();
      // Save immediately
      const allCurrent = PCD.store._read('inventory') || {};
      const next = Object.assign({}, allCurrent);
      next[ingId] = Object.assign({}, row);
      PCD.store.set('inventory', next);
      PCD.toast.success(t('inv_mark_ordered') + ' ✓');
      this.innerHTML = '✓ ' + t('inv_mark_ordered');
      this.disabled = true;
    });

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: t('inventory_title') + ' · ' + ing.name,
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      const stock = PCD.$('#invStock', body).value;
      const par = PCD.$('#invPar', body).value;
      const min = PCD.$('#invMin', body).value;
      const oldStock = row.stock;
      row.stock = stock === '' ? null : parseFloat(stock);
      row.parLevel = par === '' ? null : parseFloat(par);
      row.minLevel = min === '' ? null : parseFloat(min);
      if (row.stock !== oldStock) row.lastCountedAt = new Date().toISOString();

      const allCurrent = PCD.store._read('inventory') || {};
      const next = Object.assign({}, allCurrent);
      next[ingId] = row;
      PCD.store.set('inventory', next);
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'inventory') render(v);
      }, 250);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.inventory = { render: render, openEditor: openEditor, computeStatus: computeStatus };
})();
