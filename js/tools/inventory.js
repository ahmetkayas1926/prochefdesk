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

  // Pending stock count is now per-workspace
  function getPendingForCurrentWs() {
    const all = PCD.store.get('pendingStockCount') || {};
    const wsId = PCD.store.getActiveWorkspaceId();
    return all[wsId] || null;
  }
  function setPendingForCurrentWs(val) {
    const all = Object.assign({}, PCD.store.get('pendingStockCount') || {});
    const wsId = PCD.store.getActiveWorkspaceId();
    if (val == null) delete all[wsId];
    else all[wsId] = val;
    PCD.store.set('pendingStockCount', all);
  }

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
    const pending = getPendingForCurrentWs();
    let filter = 'all';

    // Aggregate stats
    function getRow(id) { return invAll[id] || null; }

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('inventory_title')}</div>
          <div class="page-subtitle">${t('inventory_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" id="bulkCountBtn">${PCD.icon('list',14)} Count Stock</button>
          <button class="btn btn-outline btn-sm" id="genOrderBtn">${PCD.icon('send',14)} Generate Order</button>
        </div>
      </div>

      ${pending && pending.status === 'pending' ? `
        <div class="card mb-3" style="padding:14px;background:linear-gradient(135deg,#fef3c7,#fde68a);border-color:#f59e0b;">
          <div class="flex items-center gap-3" style="flex-wrap:wrap;">
            <div style="color:#92400e;flex-shrink:0;">${PCD.icon('clock', 24)}</div>
            <div style="flex:1;min-width:180px;">
              <div style="font-weight:700;color:#92400e;">Pending stock count awaits approval</div>
              <div class="text-muted text-sm" style="color:#78350f;">By ${PCD.escapeHtml(pending.countedBy)} · ${PCD.fmtRelTime(pending.countedAt)} · ${Object.keys(pending.counts || {}).length} items counted</div>
            </div>
            <div class="flex gap-2" style="flex-shrink:0;">
              <button class="btn btn-outline btn-sm" id="reviewPendingBtn">Review</button>
              <button class="btn btn-primary btn-sm" id="approvePendingBtn" style="background:#f59e0b;border-color:#f59e0b;">Approve</button>
            </div>
          </div>
        </div>
      ` : ''}

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

    const genBtn = PCD.$('#genOrderBtn', view);
    if (genBtn) genBtn.addEventListener('click', function () { openGenerateOrder(); });

    const bulkBtn = PCD.$('#bulkCountBtn', view);
    if (bulkBtn) bulkBtn.addEventListener('click', function () { openBulkCount(); });

    const approveBtn = PCD.$('#approvePendingBtn', view);
    if (approveBtn) approveBtn.addEventListener('click', function () {
      const p = getPendingForCurrentWs();
      if (!p) return;
      PCD.modal.confirm({
        icon: '✓', iconKind: 'success',
        title: 'Approve stock count?',
        text: Object.keys(p.counts || {}).length + ' items counted by ' + p.countedBy + '. Stock levels will be updated.',
        okText: 'Approve'
      }).then(function (ok) {
        if (!ok) return;
        applyCountsToInventory(p.counts);
        setPendingForCurrentWs(null);
        PCD.toast.success('Count approved');
        render(view);
        setTimeout(function () { promptGenerateOrdersAfterCount(); }, 400);
      });
    });

    const reviewBtn = PCD.$('#reviewPendingBtn', view);
    if (reviewBtn) reviewBtn.addEventListener('click', function () {
      openReviewPending();
    });

    renderStats();
    renderList();
  }

  // Review pending count — head chef can see values, edit individual items, or approve/reject
  function openReviewPending() {
    const p = getPendingForCurrentWs();
    if (!p) return;
    const ings = PCD.store.listIngredients();
    const ingMap = {}; ings.forEach(function (i) { ingMap[i.id] = i; });

    // Working copy for edits
    const edited = Object.assign({}, p.counts);

    const body = PCD.el('div');

    function renderBody() {
      body.innerHTML =
        '<div class="mb-3" style="padding:12px;background:var(--surface-2);border-radius:var(--r-md);">' +
          '<div style="font-weight:700;">Counted by ' + PCD.escapeHtml(p.countedBy) + '</div>' +
          '<div class="text-muted text-sm">' + PCD.fmtRelTime(p.countedAt) + ' · ' + Object.keys(edited).length + ' items</div>' +
        '</div>' +
        '<div class="flex flex-col gap-1" id="reviewList"></div>';

      const listEl = PCD.$('#reviewList', body);
      // Group by category
      const byCat = {};
      Object.keys(edited).forEach(function (iid) {
        const ing = ingMap[iid];
        if (!ing) return;
        const c = ing.category || 'cat_other';
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(ing);
      });
      Object.keys(byCat).sort().forEach(function (c) {
        const section = PCD.el('div', { style: { marginBottom: '10px' } });
        section.appendChild(PCD.el('div', {
          style: { fontSize: '12px', fontWeight: '700', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 0' },
          text: PCD.i18n.t(c) || c
        }));
        byCat[c].forEach(function (ing) {
          const val = edited[ing.id];
          const row = PCD.el('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: '4px' }
          });
          row.innerHTML =
            '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">' + PCD.escapeHtml(ing.name) + '</div>' +
            '<input type="number" class="input" data-iid="' + ing.id + '" value="' + val + '" step="0.01" min="0" style="width:90px;text-align:center;font-weight:700;font-family:var(--font-mono);">' +
            '<span class="text-muted" style="font-size:12px;width:36px;">' + (ing.unit || '') + '</span>';
          section.appendChild(row);
        });
        listEl.appendChild(section);
      });

      PCD.on(body, 'input', '[data-iid]', function () {
        const iid = this.getAttribute('data-iid');
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 0) edited[iid] = v;
      });
    }

    renderBody();

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const rejectBtn = PCD.el('button', { class: 'btn btn-outline', text: 'Reject', style: { color: 'var(--danger)' } });
    const approveBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    approveBtn.innerHTML = PCD.icon('check', 16) + ' <span>Approve count</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(rejectBtn);
    footer.appendChild(approveBtn);

    const m = PCD.modal.open({
      title: 'Review Stock Count',
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    rejectBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '⚠', iconKind: 'danger', danger: true,
        title: 'Reject this count?',
        text: 'The count will be discarded. Sous chef will need to count again.',
        okText: 'Reject'
      }).then(function (ok) {
        if (!ok) return;
        setPendingForCurrentWs(null);
        PCD.toast.info('Count rejected');
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'inventory') render(v);
        }, 150);
      });
    });
    approveBtn.addEventListener('click', function () {
      applyCountsToInventory(edited);
      setPendingForCurrentWs(null);
      PCD.toast.success('Count approved · ' + Object.keys(edited).length + ' items updated');
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'inventory') render(v);
        setTimeout(function () { promptGenerateOrdersAfterCount(); }, 500);
      }, 150);
    });
  }

  function openBulkCount(options) {
    options = options || {};
    const mode = options.mode || 'single';
    const title = options.title || 'Bulk Stock Count';
    const ings = PCD.store.listIngredients();
    if (ings.length === 0) { PCD.toast.info('No ingredients to count'); return; }
    const invAll = PCD.store._read('inventory') || {};
    const draft = {};
    ings.forEach(function (i) {
      if (options.blankStart) {
        draft[i.id] = '';
      } else {
        const row = invAll[i.id];
        draft[i.id] = row && row.stock != null ? String(row.stock) : '';
      }
    });

    // Group by category
    const byCat = {};
    ings.forEach(function (i) {
      const c = i.category || 'cat_other';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(i);
    });

    const body = PCD.el('div');

    function countCompleted() {
      return Object.keys(draft).filter(function (k) { return draft[k] !== '' && draft[k] != null; }).length;
    }

    function renderBody() {
      const done = countCompleted();
      let html = '<div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);position:sticky;top:0;z-index:3;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div><div style="font-weight:700;">Count Stock</div>' +
          '<div class="text-muted text-sm" id="countProgress">' + done + ' / ' + ings.length + ' counted</div></div>' +
          '<input type="search" id="countSearch" placeholder="Filter..." style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;width:140px;">' +
        '</div></div>';

      const cats = Object.keys(byCat).sort();
      cats.forEach(function (c) {
        html += '<div class="cat-section mb-3" data-cat="' + c + '">';
        html += '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;padding:4px 0;">' +
          PCD.escapeHtml(PCD.i18n.t(c) || c) + ' (' + byCat[c].length + ')</div>';
        byCat[c].forEach(function (i) {
          const val = draft[i.id] || '';
          const filled = val !== '';
          html += '<div class="count-row" data-iid="' + i.id + '" data-name="' + PCD.escapeHtml((i.name || '').toLowerCase()) + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;background:' + (filled ? 'var(--brand-50)' : 'var(--surface)') + ';">' +
            '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:' + (filled ? '600' : '500') + ';">' + PCD.escapeHtml(i.name) + '</div>' +
            '<input type="number" class="input count-input" data-iid="' + i.id + '" value="' + PCD.escapeHtml(val) + '" step="0.01" min="0" placeholder="—" style="width:90px;text-align:center;font-weight:700;font-family:var(--font-mono);padding:6px 8px;min-height:36px;">' +
            '<span class="text-muted" style="font-size:12px;width:36px;flex-shrink:0;">' + (i.unit || '') + '</span>' +
          '</div>';
        });
        html += '</div>';
      });
      body.innerHTML = html;

      const searchEl = PCD.$('#countSearch', body);
      if (searchEl) {
        searchEl.addEventListener('input', function () {
          const q = this.value.toLowerCase();
          body.querySelectorAll('.count-row').forEach(function (row) {
            const name = row.getAttribute('data-name');
            row.style.display = (!q || name.indexOf(q) >= 0) ? '' : 'none';
          });
          // Hide empty categories
          body.querySelectorAll('.cat-section').forEach(function (sec) {
            const visible = sec.querySelectorAll('.count-row:not([style*="display: none"])').length;
            sec.style.display = visible > 0 ? '' : 'none';
          });
        });
      }

      // Update progress on input change
      PCD.on(body, 'input', '.count-input', function () {
        const iid = this.getAttribute('data-iid');
        draft[iid] = this.value;
        // Update row bg
        const row = this.closest('.count-row');
        if (row) row.style.background = (this.value !== '') ? 'var(--brand-50)' : 'var(--surface)';
        // Update progress
        const prog = PCD.$('#countProgress', body);
        if (prog) prog.textContent = countCompleted() + ' / ' + ings.length + ' counted';
      });
      // Tab / Enter advance to next input
      PCD.on(body, 'keydown', '.count-input', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const all = Array.from(body.querySelectorAll('.count-input'));
          const idx = all.indexOf(this);
          if (idx >= 0 && idx < all.length - 1) {
            all[idx + 1].focus();
            all[idx + 1].select();
          } else {
            this.blur();
          }
        }
      });
    }

    renderBody();

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    const saveLabel = (mode === 'doubleA') ? 'Save Chef A count' : (mode === 'doubleB' ? 'Save Chef B count' : 'Save All Counts');
    saveBtn.innerHTML = PCD.icon('check', 16) + ' <span>' + saveLabel + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: title,
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      // If caller provided onSave, hand them the raw draft object (for reconcile flow)
      if (options.onSave) {
        m.close();
        setTimeout(function () { options.onSave(draft); }, 200);
        return;
      }

      // Check approval setting
      const prefs = PCD.store.get('prefs') || {};
      const requireApproval = !!prefs.requireCountApproval;
      const user = PCD.store.get('user') || {};

      // Build pending count snapshot (used if approval required)
      const countedValues = {};
      Object.keys(draft).forEach(function (iid) {
        const val = draft[iid];
        if (val === '' || val == null) return;
        const num = parseFloat(val);
        if (isNaN(num)) return;
        countedValues[iid] = num;
      });

      if (Object.keys(countedValues).length === 0) {
        PCD.toast.warning('No counts entered');
        return;
      }

      if (requireApproval && !options.isApproving) {
        // Save as pending
        const pending = {
          countedAt: new Date().toISOString(),
          countedBy: user.name || user.email || 'Unknown',
          counts: countedValues,
          status: 'pending',
        };
        setPendingForCurrentWs(pending);
        PCD.toast.success('Count saved — awaiting approval by head chef');
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'inventory') render(v);
        }, 150);
        return;
      }

      // Apply directly (no approval or currently approving)
      applyCountsToInventory(countedValues);
      const n = Object.keys(countedValues).length;
      PCD.toast.success(n + ' stock level' + (n === 1 ? '' : 's') + ' updated');
      m.close();
      // Clear pending if we just approved
      if (options.isApproving) setPendingForCurrentWs(null);
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'inventory') render(v);
        // Prompt user to generate orders from low-stock items
        setTimeout(function () { promptGenerateOrdersAfterCount(); }, 500);
      }, 150);
    });
  }

  function applyCountsToInventory(countedValues) {
    const cur = PCD.store._read('inventory') || {};
    const next = Object.assign({}, cur);
    const now = new Date().toISOString();
    Object.keys(countedValues).forEach(function (iid) {
      const num = countedValues[iid];
      const row = next[iid] || { stock: null, parLevel: null, minLevel: null };
      row.stock = num;
      row.lastCountedAt = now;
      next[iid] = row;
    });
    PCD.store.set('inventory', next);
  }

  function promptGenerateOrdersAfterCount() {
    const ings = PCD.store.listIngredients();
    const invAll = PCD.store._read('inventory') || {};
    // Count how many items are below par (tracked only)
    let belowCount = 0;
    ings.forEach(function (i) {
      const row = invAll[i.id];
      if (!row || row.parLevel == null) return;
      const stock = Number(row.stock) || 0;
      const par = Number(row.parLevel) || 0;
      if (stock < par) belowCount++;
    });
    if (belowCount === 0) return;
    PCD.modal.confirm({
      icon: '📦', iconKind: 'info',
      title: belowCount + ' item' + (belowCount === 1 ? '' : 's') + ' below par',
      text: 'Want to generate purchase orders for the low-stock items now?',
      okText: 'Generate Orders',
      cancelText: 'Later'
    }).then(function (ok) {
      if (ok) openGenerateOrder();
    });
  }

  // ============ AUTO-GENERATE PURCHASE ORDER ============
  function openGenerateOrder() {
    const ings = PCD.store.listIngredients();
    const invAll = PCD.store._read('inventory') || {};
    // Collect all items below par
    const below = [];
    ings.forEach(function (i) {
      const row = invAll[i.id];
      if (!row || row.parLevel == null) return;
      const stock = Number(row.stock) || 0;
      const par = Number(row.parLevel) || 0;
      if (stock < par) {
        below.push({
          ing: i,
          stock: stock,
          par: par,
          need: Math.max(0, par - stock),
          supplier: i.supplier || '(no supplier)',
        });
      }
    });

    if (below.length === 0) {
      PCD.toast.info('All tracked items are at or above par level ✓');
      return;
    }

    // Group by supplier
    const bySupplier = {};
    below.forEach(function (b) {
      if (!bySupplier[b.supplier]) bySupplier[b.supplier] = [];
      bySupplier[b.supplier].push(b);
    });

    const body = PCD.el('div');
    const supplierNames = Object.keys(bySupplier).sort();

    let html = '<div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">' +
      '<div style="font-weight:700;">' + below.length + ' items below par</div>' +
      '<div class="text-muted text-sm">Grouped by supplier. Tap an item to include/exclude.</div>' +
      '</div>';

    supplierNames.forEach(function (sup) {
      html += '<div class="mb-3">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">' + PCD.escapeHtml(sup) + '</div>';
      bySupplier[sup].forEach(function (b) {
        html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;cursor:pointer;background:var(--surface);">' +
          '<input type="checkbox" class="po-item" data-iid="' + b.ing.id + '" checked style="accent-color:var(--brand-600);width:18px;height:18px;flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(b.ing.name) + '</div>' +
            '<div class="text-muted" style="font-size:11px;">Stock: ' + PCD.fmtNumber(b.stock) + ' · Par: ' + PCD.fmtNumber(b.par) + ' ' + (b.ing.unit || '') + '</div>' +
          '</div>' +
          '<input type="number" class="input po-qty" data-iid="' + b.ing.id + '" value="' + b.need.toFixed(2) + '" step="0.01" min="0" style="width:80px;text-align:center;font-weight:600;">' +
          '<span class="text-muted" style="font-size:11px;">' + (b.ing.unit || '') + '</span>' +
          '</label>';
      });
      html += '</div>';
    });
    body.innerHTML = html;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline' });
    printBtn.innerHTML = PCD.icon('print', 14) + ' <span>Print</span>';
    const shareBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    shareBtn.innerHTML = PCD.icon('send', 14) + ' <span>Share Order</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);
    footer.appendChild(shareBtn);

    const m = PCD.modal.open({
      title: 'Purchase Order', body: body, footer: footer, size: 'md', closable: true
    });

    function collectSelected() {
      const user = PCD.store.get('user') || {};
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const selectedBySupplier = {};
      body.querySelectorAll('.po-item:checked').forEach(function (cb) {
        const iid = cb.getAttribute('data-iid');
        const qtyInp = body.querySelector('.po-qty[data-iid="' + iid + '"]');
        const qty = qtyInp ? parseFloat(qtyInp.value) : 0;
        if (!qty || qty <= 0) return;
        const b = below.find(function (x) { return x.ing.id === iid; });
        if (!b) return;
        if (!selectedBySupplier[b.supplier]) selectedBySupplier[b.supplier] = [];
        selectedBySupplier[b.supplier].push({ ing: b.ing, qty: qty });
      });
      return { selectedBySupplier: selectedBySupplier, date: date, userName: user.name || user.email || '' };
    }

    function buildMessage() {
      const d = collectSelected();
      const supKeys = Object.keys(d.selectedBySupplier);
      if (supKeys.length === 0) return null;

      const lines = ['Purchase Order — ' + d.date, ''];
      supKeys.forEach(function (sup) {
        lines.push('— ' + sup + ' —');
        d.selectedBySupplier[sup].forEach(function (it) {
          lines.push('• ' + it.ing.name + ' — ' + PCD.fmtNumber(it.qty) + ' ' + (it.ing.unit || ''));
        });
        lines.push('');
      });
      lines.push('Best regards,');
      if (d.userName) lines.push(d.userName);
      return lines.join('\n');
    }

    cancelBtn.addEventListener('click', function () { m.close(); });

    printBtn.addEventListener('click', function () {
      const d = collectSelected();
      const supKeys = Object.keys(d.selectedBySupplier);
      if (supKeys.length === 0) { PCD.toast.warning('No items selected'); return; }
      let html = '<div style="max-width:680px;margin:0 auto">';
      html += '<h1>Purchase Order</h1>';
      html += '<div style="color:#666;font-size:12px;margin-bottom:16px;">' + d.date + (d.userName ? ' · ' + PCD.escapeHtml(d.userName) : '') + '</div>';
      supKeys.forEach(function (sup) {
        html += '<h3 style="margin-top:16px;padding-bottom:4px;border-bottom:1px solid #ddd;">' + PCD.escapeHtml(sup) + '</h3>';
        html += '<table>';
        d.selectedBySupplier[sup].forEach(function (it) {
          html += '<tr><td style="width:24px;">☐</td><td>' + PCD.escapeHtml(it.ing.name) + '</td><td style="text-align:right;font-family:monospace;">' + PCD.fmtNumber(it.qty) + ' ' + PCD.escapeHtml(it.ing.unit || '') + '</td></tr>';
        });
        html += '</table>';
      });
      html += '</div>';
      PCD.print(html, 'Purchase Order');
    });

    shareBtn.addEventListener('click', function () {
      const msg = buildMessage();
      if (!msg) { PCD.toast.warning('No items selected'); return; }
      // Open a simple share sheet: WA/SMS/Email/Copy
      const shareBody = PCD.el('div');
      shareBody.innerHTML =
        '<div class="field"><label class="field-label">Message (editable)</label>' +
        '<textarea class="textarea" id="poMsg" rows="12" style="font-family:var(--font-mono);font-size:12px;white-space:pre;">' + PCD.escapeHtml(msg) + '</textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:12px;">' +
          '<button class="btn btn-outline" id="poWa" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px;">' +
            '<div style="color:#25D366;">' + PCD.icon('message-circle', 22) + '</div>' +
            '<div style="font-weight:600;font-size:12px;">WhatsApp</div></button>' +
          '<button class="btn btn-outline" id="poSms" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px;">' +
            '<div style="color:var(--brand-600);">' + PCD.icon('phone', 22) + '</div>' +
            '<div style="font-weight:600;font-size:12px;">SMS</div></button>' +
          '<button class="btn btn-outline" id="poEmail" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px;">' +
            '<div style="color:#EA4335;">' + PCD.icon('mail', 22) + '</div>' +
            '<div style="font-weight:600;font-size:12px;">Email</div></button>' +
          '<button class="btn btn-outline" id="poCopy" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px;">' +
            '<div style="color:var(--text-2);">' + PCD.icon('copy', 22) + '</div>' +
            '<div style="font-weight:600;font-size:12px;">Copy</div></button>' +
        '</div>';
      const closeShBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
      const shFooter = PCD.el('div', { style: { display: 'flex', width: '100%' } });
      shFooter.appendChild(closeShBtn);
      const sm = PCD.modal.open({ title: 'Share Purchase Order', body: shareBody, footer: shFooter, size: 'md', closable: true });
      function getMsg() { return PCD.$('#poMsg', shareBody).value; }
      closeShBtn.addEventListener('click', function () { sm.close(); });
      PCD.$('#poWa', shareBody).addEventListener('click', function () {
        window.open('https://wa.me/?text=' + encodeURIComponent(getMsg()), '_blank');
        sm.close();
      });
      PCD.$('#poSms', shareBody).addEventListener('click', function () {
        window.location.href = 'sms:?&body=' + encodeURIComponent(getMsg());
        sm.close();
      });
      PCD.$('#poEmail', shareBody).addEventListener('click', function () {
        window.location.href = 'mailto:?subject=' + encodeURIComponent('Purchase Order') + '&body=' + encodeURIComponent(getMsg());
        sm.close();
      });
      PCD.$('#poCopy', shareBody).addEventListener('click', function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(getMsg()).then(function () {
            PCD.toast.success('Copied');
            sm.close();
          });
        }
      });
    });
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
