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

  // Workspace-scoped inventory read/write
  function readInventory() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const all = PCD.store._read('inventory') || {};
    // Detect legacy flat shape (values are inventory rows with stock/parLevel)
    const keys = Object.keys(all);
    if (keys.length > 0) {
      const sample = all[keys[0]];
      if (sample && (sample.stock !== undefined || sample.parLevel !== undefined)) {
        return all; // legacy flat
      }
    }
    return all[wsId] || {};
  }
  function writeInventory(invMap) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('inventory') || {};
    // Detect legacy flat
    const keys = Object.keys(root);
    let next;
    if (keys.length > 0) {
      const sample = root[keys[0]];
      if (sample && (sample.stock !== undefined || sample.parLevel !== undefined)) {
        // Legacy → migrate now
        next = { [wsId]: invMap };
      } else {
        next = Object.assign({}, root);
        next[wsId] = invMap;
      }
    } else {
      next = { [wsId]: invMap };
    }
    PCD.store.set('inventory', next);
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
    const invAll = readInventory();
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
          <button class="btn btn-outline btn-sm" id="historyHeaderBtn" title="${PCD.escapeHtml(t('inv_view_past_counts_tooltip'))}">${PCD.icon('clock',14)} ${t('inv_history')}</button>
          <button class="btn btn-outline btn-sm" id="bulkCountBtn">${PCD.icon('list',14)} ${t('inv_count_stock')}</button>
          <button class="btn btn-outline btn-sm" id="genOrderBtn">${PCD.icon('send',14)} ${t('inv_generate_order')}</button>
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

      // Group by category — same as Bulk Count for consistency
      const byCat = {};
      filtered.forEach(function (x) {
        const cat = x.ing.category || 'cat_other';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(x);
      });

      const cont = PCD.el('div');
      Object.keys(byCat).sort().forEach(function (cat) {
        const items = byCat[cat];
        // Category counter — how many need attention?
        const needAttention = items.filter(function (x) {
          return x.status === 'out' || x.status === 'critical' || x.status === 'low';
        }).length;

        const sec = PCD.el('div', { style: { marginBottom: '14px' } });
        sec.innerHTML =
          '<div style="display:flex;align-items:baseline;justify-content:space-between;margin:8px 0 6px;padding:4px 2px;border-bottom:1px solid var(--border);">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">' +
              PCD.escapeHtml(t(cat) || cat) + ' (' + items.length + ')' +
            '</div>' +
            (needAttention > 0
              ? '<div style="font-size:11px;font-weight:700;color:var(--danger);">' + t('inv_need_order', { n: needAttention }) + '</div>'
              : '<div style="font-size:11px;color:var(--success);">' + t('inv_all_ok') + '</div>'
            ) +
          '</div>';

        const list = PCD.el('div', { class: 'flex flex-col gap-2' });
        items.forEach(function (x) {
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
          list.appendChild(row);
        });
        sec.appendChild(list);
        cont.appendChild(sec);
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

    const histHeaderBtn = PCD.$('#historyHeaderBtn', view);
    if (histHeaderBtn) histHeaderBtn.addEventListener('click', function () { openStockCountHistory(); });

    const approveBtn = PCD.$('#approvePendingBtn', view);
    if (approveBtn) approveBtn.addEventListener('click', function () {
      const p = getPendingForCurrentWs();
      if (!p) return;
      PCD.modal.confirm({
        icon: '✓', iconKind: 'success',
        title: PCD.i18n.t('modal_approve_count_title'),
        text: Object.keys(p.counts || {}).length + ' items counted by ' + p.countedBy + '. Stock levels will be updated.',
        okText: PCD.i18n.t('btn_approve')
      }).then(function (ok) {
        if (!ok) return;
        applyCountsToInventory(p.counts);
        setPendingForCurrentWs(null);
        PCD.toast.success(PCD.i18n.t('toast_count_approved'));
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
    const rejectBtn = PCD.el('button', { class: 'btn btn-outline', text: PCD.i18n.t('btn_reject'), style: { color: 'var(--danger)' } });
    const approveBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    approveBtn.innerHTML = PCD.icon('check', 16) + ' <span>Approve count</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(rejectBtn);
    footer.appendChild(approveBtn);

    const m = PCD.modal.open({
      title: PCD.i18n.t('modal_review_count_title'),
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    rejectBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '⚠', iconKind: 'danger', danger: true,
        title: t('inv_reject_count_title'),
        text: t('inv_discard_count_msg'),
        okText: t('inv_reject')
      }).then(function (ok) {
        if (!ok) return;
        setPendingForCurrentWs(null);
        PCD.toast.info(t('inv_count_rejected'));
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
      PCD.toast.success(PCD.i18n.t('toast_count_approved_n_items', { n: Object.keys(edited).length }));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'inventory') render(v);
        setTimeout(function () { promptGenerateOrdersAfterCount(); }, 500);
      }, 150);
    });
  }

  // ============ STOCK COUNT HISTORY ============
  // Shows all past bulk counts with date, who counted, and the values.
  function openStockCountHistory() {
    const t = PCD.i18n.t;
    const all = (PCD.store.listTable('stockCountHistory') || []).slice();
    all.sort(function (a, b) { return (b.countedAt || '').localeCompare(a.countedAt || ''); });

    const body = PCD.el('div');

    function paintList() {
      const list = (PCD.store.listTable('stockCountHistory') || []).slice();
      list.sort(function (a, b) { return (b.countedAt || '').localeCompare(a.countedAt || ''); });
      if (list.length === 0) {
        body.innerHTML =
          '<div class="empty" style="padding:30px 16px;">' +
            '<div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('clock', 40) + '</div>' +
            '<div class="empty-title">No stock counts yet</div>' +
            '<div class="empty-desc">Each "Save All Counts" creates a dated snapshot. Open it later to see what was on hand on any given day.</div>' +
          '</div>';
        return;
      }

      let html = '<div class="text-muted text-sm mb-2">Most recent first. Each entry is a snapshot of stock at that moment.</div>';
      list.forEach(function (snap) {
        const date = new Date(snap.countedAt);
        const dateStr = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        html += '<div class="card mb-2" data-snap="' + snap.id + '" style="padding:12px;cursor:pointer;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:6px;background:var(--brand-50);color:var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('clock', 18) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;font-size:14px;">' + dateStr + ' · ' + timeStr + '</div>' +
              '<div class="text-muted" style="font-size:12px;">' +
                t('inv_x_items_counted', { n: snap.itemCount }) +
                (snap.countedBy ? ' · ' + PCD.escapeHtml(snap.countedBy) : '') +
              '</div>' +
            '</div>' +
            '<button type="button" class="icon-btn" data-del-snap="' + snap.id + '" title="Delete snapshot">' + PCD.icon('trash', 16) + '</button>' +
          '</div>' +
        '</div>';
      });
      body.innerHTML = html;
    }
    paintList();

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close') || 'Close', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_count_history_title'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-snap]', function (e) {
      if (e.target.closest('[data-del-snap]')) return;
      const id = this.getAttribute('data-snap');
      const snap = PCD.store.getFromTable('stockCountHistory', id);
      if (!snap) return;
      m.close();
      setTimeout(function () { openSnapshotDetail(snap); }, 200);
    });
    PCD.on(body, 'click', '[data-del-snap]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-del-snap');
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('inv_delete_snapshot_title'),
        text: t('inv_delete_snapshot_msg'),
        okText: t('act_delete') || 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('stockCountHistory', id);
        PCD.toast.success(t('inv_snapshot_deleted'));
        paintList();
      });
    });
  }

  function openSnapshotDetail(snap) {
    const t = PCD.i18n.t;
    const date = new Date(snap.countedAt);
    const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    // Group by category
    const byCat = {};
    Object.keys(snap.counts || {}).forEach(function (iid) {
      const c = snap.counts[iid];
      const cat = c.category || 'cat_other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(c);
    });

    let html = '<div class="text-muted mb-3">' + dateStr + ' · ' + timeStr +
      (snap.countedBy ? ' · by ' + PCD.escapeHtml(snap.countedBy) : '') +
      ' · ' + snap.itemCount + ' items</div>';

    Object.keys(byCat).sort().forEach(function (cat) {
      html += '<div style="margin-bottom:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">' +
          PCD.escapeHtml(PCD.i18n.t(cat) || cat) + ' (' + byCat[cat].length + ')</div>';
      byCat[cat].forEach(function (c) {
        html += '<div style="display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:3px;">' +
          '<span style="font-weight:500;">' + PCD.escapeHtml(c.name) + '</span>' +
          '<span style="font-weight:700;font-family:var(--font-mono);color:var(--brand-700);">' + PCD.fmtNumber(c.amount) + ' ' + PCD.escapeHtml(c.unit || '') + '</span>' +
        '</div>';
      });
      html += '</div>';
    });

    const body = PCD.el('div');
    body.innerHTML = html;

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const printBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', style: { flex: '1' } });
    printBtn.innerHTML = PCD.icon('print', 14) + ' <span>Print</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: PCD.i18n.t('modal_count_snapshot_date', { date: dateStr }),
      body: body, footer: footer, size: 'md', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { printSnapshot(snap); });
  }

  function printSnapshot(snap) {
    const date = new Date(snap.countedAt);
    const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString();

    const byCat = {};
    Object.keys(snap.counts || {}).forEach(function (iid) {
      const c = snap.counts[iid];
      const cat = c.category || 'cat_other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(c);
    });

    let body = '';
    Object.keys(byCat).sort().forEach(function (cat) {
      body += '<h2>' + PCD.escapeHtml(PCD.i18n.t(cat) || cat) + '</h2><table>';
      byCat[cat].forEach(function (c) {
        body += '<tr><td>' + PCD.escapeHtml(c.name) + '</td><td style="text-align:right;font-weight:700;">' + PCD.fmtNumber(c.amount) + ' ' + PCD.escapeHtml(c.unit || '') + '</td></tr>';
      });
      body += '</table>';
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 15mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
        'h1 { font-size: 22pt; margin: 0; color: #16a34a; border-bottom: 3px solid #16a34a; padding-bottom: 8px; }' +
        'h2 { font-size: 11pt; color: #16a34a; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 6px; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'td { padding: 4px 8px; border-bottom: 1px solid #eee; }' +
        '.meta { color: #666; font-size: 11pt; margin: 4px 0 14px; }' +
      '</style>' +
      '<h1>Stock Count</h1>' +
      '<div class="meta">' + dateStr + ' · ' + timeStr +
        (snap.countedBy ? ' · by ' + PCD.escapeHtml(snap.countedBy) : '') +
        ' · ' + snap.itemCount + ' items</div>' +
      body;

    PCD.print(html, 'Stock Count ' + date.toISOString().slice(0, 10));
  }

  function openBulkCount(options) {
    options = options || {};
    const t = PCD.i18n.t;
    const mode = options.mode || 'single';
    const title = options.title || t('inv_bulk_stock_count');
    const ings = PCD.store.listIngredients();
    if (ings.length === 0) { PCD.toast.info(t('inv_no_ingredients_to_count')); return; }
    const invAll = readInventory();
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
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<div><div style="font-weight:700;">' + t('inv_count_stock') + '</div>' +
          '<div class="text-muted text-sm" id="countProgress">' + t('inv_progress_counted', { done: done, total: ings.length }) + '</div></div>' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
            '<input type="search" id="countSearch" placeholder="' + PCD.escapeHtml(t('inv_filter_placeholder')) + '" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;width:140px;">' +
            '<button type="button" class="btn btn-outline btn-sm" id="clearAllBtn" title="' + PCD.escapeHtml(t('inv_clear_all_tooltip')) + '">' + PCD.icon('x', 14) + ' <span>' + t('inv_clear') + '</span></button>' +
            '<button type="button" class="btn btn-outline btn-sm" id="historyBtn" title="' + PCD.escapeHtml(t('inv_view_past_counts_tooltip_short')) + '">' + PCD.icon('clock', 14) + ' <span>' + t('inv_history') + '</span></button>' +
          '</div>' +
        '</div></div>';

      const cats = Object.keys(byCat).sort();
      cats.forEach(function (c) {
        html += '<div class="cat-section mb-3" data-cat="' + c + '">';
        html += '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;padding:4px 0;">' +
          PCD.escapeHtml(PCD.i18n.t(c) || c) + ' (' + byCat[c].length + ')</div>';
        byCat[c].forEach(function (i) {
          const val = draft[i.id] || '';
          const filled = val !== '';
          const row = invAll[i.id];
          const lastSeen = (row && row.lastCountedAt)
            ? '<div class="text-muted" style="font-size:10px;line-height:1;">last: ' + PCD.fmtRelTime(row.lastCountedAt) + '</div>'
            : '';
          html += '<div class="count-row" data-iid="' + i.id + '" data-name="' + PCD.escapeHtml((i.name || '').toLowerCase()) + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;background:' + (filled ? 'var(--brand-50)' : 'var(--surface)') + ';">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:' + (filled ? '600' : '500') + ';">' + PCD.escapeHtml(i.name) + '</div>' +
              lastSeen +
            '</div>' +
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

      // Clear all values in the bulk count modal
      const clearBtn = PCD.$('#clearAllBtn', body);
      if (clearBtn) clearBtn.addEventListener('click', function () {
        PCD.modal.confirm({
          title: t('inv_clear_count_form_title'),
          text: t('inv_clear_count_form_msg'),
          okText: t('inv_clear'), cancelText: t('cancel') || 'Cancel'
        }).then(function (ok) {
          if (!ok) return;
          ings.forEach(function (i) { draft[i.id] = ''; });
          renderBody();
          PCD.toast.success(t('inv_clear'));
        });
      });

      // Open count history
      const histBtn = PCD.$('#historyBtn', body);
      if (histBtn) histBtn.addEventListener('click', function () { openStockCountHistory(); });

      // Update progress on input change
      PCD.on(body, 'input', '.count-input', function () {
        const iid = this.getAttribute('data-iid');
        draft[iid] = this.value;
        // Update row bg
        const row = this.closest('.count-row');
        if (row) row.style.background = (this.value !== '') ? 'var(--brand-50)' : 'var(--surface)';
        // Update progress
        const prog = PCD.$('#countProgress', body);
        if (prog) prog.textContent = t('inv_progress_counted', { done: countCompleted(), total: ings.length });
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
        PCD.toast.warning(PCD.i18n.t('toast_no_counts_entered'));
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
        PCD.toast.success(PCD.i18n.t('toast_count_saved_pending'));
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
      PCD.toast.success('✓ Stock count saved · ' + n + ' item' + (n === 1 ? '' : 's') + ' updated', 4000);
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

  function applyCountsToInventory(countedValues, options) {
    options = options || {};
    const cur = readInventory();
    const next = Object.assign({}, cur);
    const now = new Date().toISOString();
    const snapshot = {
      countedAt: now,
      countedBy: (PCD.store.get('user') && PCD.store.get('user').name) || 'You',
      counts: {},  // ingredientId → { amount, unit, name }
      itemCount: 0,
    };

    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    Object.keys(countedValues).forEach(function (iid) {
      const num = countedValues[iid];
      if (num == null || num === '' || isNaN(Number(num))) return;
      const row = next[iid] || { stock: null, parLevel: null, minLevel: null };
      row.stock = Number(num);
      row.lastCountedAt = now;
      next[iid] = row;
      // Snapshot record
      const ing = ingMap[iid];
      snapshot.counts[iid] = {
        amount: Number(num),
        unit: ing ? ing.unit : '',
        name: ing ? ing.name : '?',
        category: ing ? ing.category : 'cat_other',
      };
      snapshot.itemCount++;
    });
    writeInventory(next);

    // Save snapshot to history (workspace-scoped)
    if (snapshot.itemCount > 0 && !options.skipHistory) {
      try {
        PCD.store.upsertInTable('stockCountHistory', snapshot, 'sch');
      } catch (e) { /* table may not exist yet — silently */ }
    }
  }

  function promptGenerateOrdersAfterCount() {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients();
    const invAll = readInventory();
    // Count tracked items needing reorder (out / critical / low)
    let belowCount = 0;
    ings.forEach(function (i) {
      const row = invAll[i.id];
      if (!row || row.parLevel == null) return;
      const status = computeStatus(row);
      if (status === 'out' || status === 'critical' || status === 'low') belowCount++;
    });
    if (belowCount === 0) return;
    const titleKey = belowCount === 1 ? 'inv_x_items_need_ordering_singular' : 'inv_x_items_need_ordering_plural';
    PCD.modal.confirm({
      icon: '📦', iconKind: 'info',
      title: t(titleKey, { n: belowCount }),
      text: t('inv_generate_orders_msg'),
      okText: t('inv_generate_orders'),
      cancelText: t('inv_later')
    }).then(function (ok) {
      if (ok) openGenerateOrder();
    });
  }

  // ============ AUTO-GENERATE PURCHASE ORDER ============
  function openGenerateOrder() {
    const ings = PCD.store.listIngredients();
    const invAll = readInventory();
    // Collect all items that need ordering: status critical, low, or out
    const below = [];
    ings.forEach(function (i) {
      const row = invAll[i.id];
      if (!row || row.parLevel == null) return;
      const stock = Number(row.stock) || 0;
      const par = Number(row.parLevel) || 0;
      const min = Number(row.minLevel) || 0;
      const status = computeStatus(row);
      // Order if: out, critical, or low
      if (status === 'out' || status === 'critical' || status === 'low') {
        // Need = enough to bring back up to par level
        const need = Math.max(0, par - stock);
        below.push({
          ing: i,
          stock: stock,
          par: par,
          need: need || par,  // if par > stock then top up; if min > par (weird), at least order par amount
          status: status,
          supplier: i.supplier || '(no supplier)',
        });
      }
    });

    if (below.length === 0) {
      PCD.toast.info(PCD.i18n.t('toast_inventory_all_above_par'));
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
      title: PCD.i18n.t('modal_purchase_order_title'), body: body, footer: footer, size: 'md', closable: true
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
      if (supKeys.length === 0) { PCD.toast.warning(PCD.i18n.t('toast_no_items_selected')); return; }
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
      if (!msg) { PCD.toast.warning(PCD.i18n.t('toast_no_items_selected')); return; }
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
      const sm = PCD.modal.open({ title: PCD.i18n.t('modal_share_po_title'), body: shareBody, footer: shFooter, size: 'md', closable: true });
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
            PCD.toast.success(PCD.i18n.t('toast_copied'));
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
    if (!ing) { PCD.toast.error(PCD.i18n.t('toast_ingredient_not_found')); return; }
    const invAll = readInventory();
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
      const allCurrent = readInventory();
      const next = Object.assign({}, allCurrent);
      next[ingId] = Object.assign({}, row);
      writeInventory(next);
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

      const allCurrent = readInventory();
      const next = Object.assign({}, allCurrent);
      next[ingId] = row;
      writeInventory(next);
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
