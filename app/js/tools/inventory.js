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
        return PCD.clone(all); // legacy flat
      }
    }
    // KLON — _read canlı referans döndürür; caller mutate edince state bozulur ve
    // writeInventory eski↔yeni diff'i yapamaz (sync push tetiklenmez). Klon ile
    // caller kopyayı değiştirir, writeInventory state ile karşılaştırıp push eder.
    return PCD.clone(all[wsId] || {});
  }
  function _invRowChanged(a, b) {
    if (!a || !b) return true;
    return a.stock !== b.stock || a.parLevel !== b.parLevel || a.minLevel !== b.minLevel ||
      a.lastReceivedAt !== b.lastReceivedAt || a.lastCountedAt !== b.lastCountedAt || a.lastOrderedAt !== b.lastOrderedAt;
  }
  function writeInventory(invMap) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('inventory') || {};
    // Detect legacy flat
    const keys = Object.keys(root);
    const legacy = keys.length > 0 && root[keys[0]] && (root[keys[0]].stock !== undefined || root[keys[0]].parLevel !== undefined);
    const oldWs = legacy ? root : (root[wsId] || {});
    // Değişen satırlara updatedAt damgala (newest-wins merge + sync için) ve topla.
    const outMap = {};
    const changedIds = [];
    Object.keys(invMap || {}).forEach(function (ingId) {
      const r = invMap[ingId];
      if (!r) { outMap[ingId] = r; return; }
      if (_invRowChanged(oldWs[ingId], r)) {
        outMap[ingId] = Object.assign({}, r, { updatedAt: Date.now() });
        changedIds.push(ingId);
      } else {
        outMap[ingId] = r;
      }
    });
    const next = legacy ? {} : Object.assign({}, root);
    next[wsId] = outMap;
    PCD.store.set('inventory', next);
    // KRİTİK — değişen stok satırlarını buluta push et. Yoksa reload'da cloud pull
    // (newest-wins) yereli ezerdi → stok kaybı. Misafirde queueUpsert sessizce döner.
    if (PCD.cloudPerTable && PCD.cloudPerTable.queueUpsert && changedIds.length) {
      changedIds.forEach(function (ingId) {
        try { PCD.cloudPerTable.queueUpsert('inventory', ingId, wsId, Object.assign({ ingredient_id: ingId }, outMap[ingId])); } catch (e) {}
      });
    }
  }

  // v2.44 — A1: batch-deduct stock for ingredients (event/buffet/sales → inventory).
  // deductions: { ingredientId: amountInBaseUnit }. Reads once, applies, writes once.
  // v2.44.76 — SİMETRİ (kök-neden düzeltmesi): mal kabul (applyStockAdditions) satır
  // yoksa OLUŞTURUYORDU; tüketim ise hiç sayılmamış malzemeyi (satır yok / stock=null)
  // SESSİZCE ATLIYORDU → satın alınan/kullanılan bir malzemenin tüketimi kaybolurdu.
  // Artık tüketim de satır oluşturur ve stok NEGATİFE düşebilir = "bunu say/sipariş et"
  // sinyali. computeStatus negatifte 'out' (kırmızı) döner, liste en üste taşır. Hiçbir
  // malzeme artık sessizce atlanmaz; her tüketim envantere yansır.
  function applyStockDeductions(deductions) {
    const inv = readInventory();
    const report = [];
    Object.keys(deductions || {}).forEach(function (iid) {
      const amt = Number(deductions[iid]) || 0;
      if (!(amt > 0)) return;
      const row = inv[iid];
      const cur = row && row.stock != null ? (Number(row.stock) || 0) : 0;
      const base = row || { stock: null, parLevel: null, minLevel: null };
      const to = cur - amt;   // negatife izin ver — fazla-tüketim/oversold görünür kalsın
      inv[iid] = Object.assign({}, base, { stock: to, updatedAt: Date.now() });
      report.push({ id: iid, tracked: true, from: cur, deducted: amt, to: to, status: computeStatus(inv[iid]) });
    });
    writeInventory(inv);
    return report;
  }

  // v2.44 — A2: batch-add stock for received goods (PO received → inventory).
  // Inverse of applyStockDeductions. additions: { ingredientId: amountInBaseUnit }.
  // Reads once, applies, writes once. If an item has no inventory row yet, a new
  // tracked row is created (stock = amount, par/min null) — receiving starts tracking.
  function applyStockAdditions(additions) {
    const inv = readInventory();
    const report = [];
    Object.keys(additions || {}).forEach(function (iid) {
      const amt = Number(additions[iid]) || 0;
      if (amt <= 0) return;
      const row = inv[iid];
      const cur = row && row.stock != null ? (Number(row.stock) || 0) : 0;
      const to = cur + amt;
      const base = row || { stock: null, parLevel: null, minLevel: null };
      inv[iid] = Object.assign({}, base, { stock: to, lastReceivedAt: new Date().toISOString(), updatedAt: Date.now() });
      report.push({ id: iid, from: cur, added: amt, to: to, status: computeStatus(inv[iid]) });
    });
    writeInventory(inv);
    return report;
  }

  // Ortak stok-değişim onay modalı: ciddi onay + AÇILIR-KAPANIR kalem listesi (uzun
  // olabilir). opts: { title, verb, kind:'add'|'deduct', note, items:[{name,amount,unit}] }
  // → Promise<bool> (onaylandı mı). event/buffet/sales/mark-received hepsi kullanır.
  function confirmStockChange(opts) {
    opts = opts || {};
    const t = PCD.i18n.t;
    const items = opts.items || [];
    const isAdd = opts.kind === 'add';
    return new Promise(function (resolve) {
      const body = PCD.el('div');
      const rows = items.map(function (it) {
        const sign = isAdd ? '+' : '−';
        const col = isAdd ? '#15803d' : '#b45309';
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border);font-size:13px;">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">' + PCD.escapeHtml(it.name || '?') + '</span>' +
          '<span style="font-weight:700;color:' + col + ';white-space:nowrap;flex:0 0 auto;">' + sign + ' ' + PCD.fmtNumber(it.amount) + ' ' + PCD.escapeHtml(it.unit || '') + '</span>' +
        '</div>';
      }).join('');
      body.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:' + (isAdd ? '#f0fdf4' : '#fff7ed') + ';border:1px solid ' + (isAdd ? '#bbf7d0' : '#fed7aa') + ';border-radius:var(--r-md);margin-bottom:12px;">' +
          '<span style="font-size:18px;flex:0 0 auto;">' + (isAdd ? '📥' : '📦') + '</span>' +
          '<div style="font-size:13px;line-height:1.5;color:var(--text-2);">' + PCD.escapeHtml(opts.note || (isAdd ? (t('inv_confirm_add_note') || 'These items will be ADDED to your stock. This cannot be undone.') : (t('inv_confirm_deduct_note') || 'These items will be DEDUCTED from your stock. This cannot be undone.'))) + '</div>' +
        '</div>' +
        '<details style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;">' +
          '<summary style="cursor:pointer;padding:10px 12px;font-weight:700;font-size:13px;background:var(--surface-2);">' +
            PCD.escapeHtml(isAdd ? (t('inv_to_add') || 'To add') : (t('inv_to_deduct') || 'To deduct')) + ' · ' + items.length + ' ' + PCD.escapeHtml(t('items') || 'items') +
          '</summary>' +
          '<div style="max-height:300px;overflow:auto;">' + (rows || '<div style="padding:10px;color:var(--text-3);font-size:13px;">—</div>') + '</div>' +
        '</details>';
      const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
      const okBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
      okBtn.textContent = opts.verb || (isAdd ? (t('inv_mark_received') || 'Add to stock') : (t('event_apply_inventory') || 'Deduct stock'));
      const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
      footer.appendChild(cancelBtn); footer.appendChild(okBtn);
      const m = PCD.modal.open({ title: opts.title || okBtn.textContent, body: body, footer: footer, size: 'md', closable: true });
      let done = false;
      cancelBtn.addEventListener('click', function () { if (done) return; done = true; m.close(); resolve(false); });
      okBtn.addEventListener('click', function () { if (done) return; done = true; m.close(); resolve(true); });
    });
  }

  // v2.44.45 — Satış → tüketim. sales = { recipeId: qtySold }. Her satılan dish =
  // 1 porsiyon; recipe.servings porsiyon verir → scale = qty / servings. Recipe
  // flattenIngredients ile gerçek malzemeye iner (alt-tarifler dahil), stok birimine
  // çevrilir. { ingredientId: amount } döner — events/buffet ile AYNI sözleşme →
  // applyStockDeductions.
  function computeSalesDeductions(sales, ingMap, recipeMap) {
    const need = {};
    const skippedSet = {};
    Object.keys(sales || {}).forEach(function (rid) {
      const qty = Number(sales[rid]) || 0;
      if (qty <= 0) return;
      const r = recipeMap[rid];
      if (!r) return;
      const servings = Number(r.servings) || 1;
      const scale = qty / servings;
      if (!(scale > 0)) return;
      const flat = PCD.recipes.flattenIngredients(r, ingMap, recipeMap, { scale: scale }) || [];
      flat.forEach(function (f) {
        const ing = ingMap[f.ingredientId];
        if (!ing) return;
        let amt = Number(f.amount) || 0;
        if (!(amt > 0)) return;
        if (f.unit && ing.unit && f.unit !== ing.unit) {
          try { amt = PCD.convertUnit(amt, f.unit, ing.unit); }
          catch (e) { skippedSet[ing.name || f.ingredientId] = true; return; }
          if (!(amt > 0)) { skippedSet[ing.name || f.ingredientId] = true; return; }
        }
        need[f.ingredientId] = (need[f.ingredientId] || 0) + amt;
      });
    });
    return { deductions: need, skipped: Object.keys(skippedSet) };
  }

  function computeStatus(invRow) {
    if (!invRow || invRow.parLevel == null) {
      // Par yok = normalde 'untracked'. Ama stok NEGATİFE düştüyse (fazla-tüketim:
      // hiç sayılmamış/sipariş edilmemiş malzeme tüketildi) bunu 'out' (kırmızı) göster —
      // tüketim sessizce kaybolmasın, "say/sipariş et" sinyali olsun.
      if (invRow && invRow.stock != null && Number(invRow.stock) < 0) return 'out';
      return 'untracked';
    }
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
    const L = function (k, fb) { try { const v = t(k); return (v == null || v === k) ? fb : v; } catch (e) { return fb; } };
    const ings = PCD.store.listIngredients();
    const invAll = readInventory();
    const pending = getPendingForCurrentWs();
    let filter = 'all';
    let groupMode = (function () { try { return localStorage.getItem('pcd_inv_group') || 'category'; } catch (e) { return 'category'; } })();
    // v2.44.78 — Kalıcı hatırlatıcı: tedarikçisi olmayan malzeme sayısı (amber rozet).
    const _noSupCount = ings.filter(function (i) { return !(i.supplier || '').trim(); }).length;

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
          ${_noSupCount > 0 ? `<button class="btn btn-sm" id="noSupBadge" title="${PCD.escapeHtml(L('inv_no_supplier_count', '{n} ingredient(s) have no supplier — assign one to order them.').replace('{n}', _noSupCount))}" style="background:#fff7ed;border:1px solid var(--warning);color:#b45309;font-weight:700;">⚠ ${_noSupCount}</button>` : ''}
          <button class="btn btn-outline btn-sm" id="recordSalesBtn">${PCD.icon('edit',14)} ${t('inv_record_sales')}</button>
        </div>
      </div>

      ${PCD.subNav('stock', 'inventory')}

      ${PCD.guideCard('inventory', t('inv_g_t'), [t('inv_g1'), t('inv_g2'), t('inv_g3')])}

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
      <div class="flex gap-2 mb-3" style="align-items:center;flex-wrap:wrap;">
        <span class="text-muted" style="font-size:12px;font-weight:600;">${PCD.escapeHtml(t('group_by') || 'Group by')}:</span>
        <button class="btn btn-sm gb-btn" data-group="category">${PCD.escapeHtml(t('group_category') || 'Category')}</button>
        <button class="btn btn-sm gb-btn" data-group="supplier">${PCD.escapeHtml(t('group_supplier') || 'Supplier')}</button>
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

      // Group by category or supplier (kullanıcı seçimi — pcd_inv_group)
      const groups = {};
      filtered.forEach(function (x) {
        let key, label;
        if (groupMode === 'supplier') {
          const s = (x.ing.supplier || '').trim();
          key = s ? ('s:' + s) : '￿'; // tedarikçisizler en sona
          label = s || (t('sup_none') || 'No supplier');
        } else {
          key = x.ing.category || 'cat_other';
          label = t(key) || key;
        }
        if (!groups[key]) groups[key] = { label: label, items: [] };
        groups[key].items.push(x);
      });

      const cont = PCD.el('div');
      Object.keys(groups).sort().forEach(function (key) {
        const items = groups[key].items;
        const groupLabel = groups[key].label;
        // Group counter — how many need attention?
        const needAttention = items.filter(function (x) {
          return x.status === 'out' || x.status === 'critical' || x.status === 'low';
        }).length;

        const sec = PCD.el('div', { style: { marginBottom: '14px' } });
        sec.innerHTML =
          '<div style="display:flex;align-items:baseline;justify-content:space-between;margin:8px 0 6px;padding:4px 2px;border-bottom:1px solid var(--border);">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">' +
              PCD.escapeHtml(groupLabel) + ' (' + items.length + ')' +
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
          const supBadge = (groupMode === 'supplier') ? '' :
            ((x.ing.supplier || '').trim()
              ? '<span style="display:inline-flex;align-items:center;gap:3px;color:var(--success);font-weight:600;">' + PCD.icon('check', 11) + PCD.escapeHtml(x.ing.supplier) + '</span>'
              : '<span style="display:inline-flex;align-items:center;gap:3px;color:var(--warning);font-weight:700;">⚠ ' + PCD.escapeHtml(L('sup_none', 'No supplier')) + '</span>');
          row.innerHTML = `
            <div class="list-item-thumb" style="background:${color};color:white;font-weight:700;">${statusLabel(x.status).charAt(0)}</div>
            <div class="list-item-body">
              <div class="list-item-title">${PCD.escapeHtml(x.ing.name)}</div>
              <div class="list-item-meta">
                <span><strong>${stockText}</strong> / ${parText}</span>
                ${supBadge ? '<span>·</span>' + supBadge : ''}
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

    // Gruplama modu (Kategori / Tedarikçi)
    function paintInvGroupBar() {
      PCD.$$('.gb-btn', view).forEach(function (b) {
        const on = b.getAttribute('data-group') === groupMode;
        b.className = 'btn btn-sm gb-btn ' + (on ? 'btn-primary' : 'btn-outline');
      });
    }
    PCD.$$('.gb-btn', view).forEach(function (b) {
      b.addEventListener('click', function () {
        groupMode = b.getAttribute('data-group');
        try { localStorage.setItem('pcd_inv_group', groupMode); } catch (e) {}
        paintInvGroupBar(); renderList();
      });
    });
    paintInvGroupBar();

    PCD.on(listEl, 'click', '[data-iid]', function () {
      openEditor(this.getAttribute('data-iid'));
    });

    const genBtn = PCD.$('#genOrderBtn', view);
    if (genBtn) genBtn.addEventListener('click', function () { openGenerateOrder(); });
    const noSupBadge = PCD.$('#noSupBadge', view);
    if (noSupBadge) noSupBadge.addEventListener('click', function () { if (PCD.router && PCD.router.go) PCD.router.go('ingredients'); });
    const rsBtn = PCD.$('#recordSalesBtn', view);
    if (rsBtn) rsBtn.addEventListener('click', function () { openRecordSales(); });

    const bulkBtn = PCD.$('#bulkCountBtn', view);
    if (bulkBtn) bulkBtn.addEventListener('click', function () { openBulkCount(); });

    const histHeaderBtn = PCD.$('#historyHeaderBtn', view);
    if (histHeaderBtn) histHeaderBtn.addEventListener('click', function () { openStockCountHistory(); });

    const approveBtn = PCD.$('#approvePendingBtn', view);
    if (approveBtn) approveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
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
    approveBtn.innerHTML = PCD.icon('check', 16) + ' <span>' + PCD.i18n.t('btn_approve_count') + '</span>';
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
      if (PCD.gate && !PCD.gate.requireAuth()) return;
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
            '<div class="empty-title">' + PCD.i18n.t('inv_count_history_empty_title') + '</div>' +
            '<div class="empty-desc">' + PCD.i18n.t('inv_count_history_empty_desc') + '</div>' +
          '</div>';
        return;
      }

      let html = '<div class="text-muted text-sm mb-2">' + PCD.i18n.t('inv_count_history_intro') + '</div>';
      list.forEach(function (snap) {
        const date = new Date(snap.countedAt);
        const dateStr = date.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString((PCD.i18n && PCD.i18n.currentLocale) || "en", { hour: '2-digit', minute: '2-digit' });
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
    const dateStr = date.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString((PCD.i18n && PCD.i18n.currentLocale) || "en", { hour: '2-digit', minute: '2-digit' });

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
    const xlsxBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', style: { flex: '1' } });
    xlsxBtn.innerHTML = PCD.icon('download', 14) + ' <span>' + (PCD.i18n.t('inv_export_xlsx') || 'Export Excel') + '</span>';
    const printBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', style: { flex: '1' } });
    printBtn.innerHTML = PCD.icon('print', 14) + ' <span>' + PCD.i18n.t('print') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(xlsxBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: PCD.i18n.t('modal_count_snapshot_date', { date: dateStr }),
      body: body, footer: footer, size: 'md', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    xlsxBtn.addEventListener('click', function () { exportSnapshotXlsx(snap); });
    printBtn.addEventListener('click', function () { printSnapshot(snap); });
  }

  function printSnapshot(snap) {
    const date = new Date(snap.countedAt);
    const dateStr = date.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
        '@page { size: A4; margin: 0; }' +
        'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; padding: 15mm; }' +
        'h1 { font-size: 22pt; margin: 0; color: #16433a; border-bottom: 3px solid #16433a; padding-bottom: 8px; }' +
        'h2 { font-size: 11pt; color: #16433a; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 6px; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'td { padding: 4px 8px; border-bottom: 1px solid #eee; }' +
        '.meta { color: #666; font-size: 11pt; margin: 4px 0 14px; }' +
      '</style>' +
      '<h1>' + PCD.escapeHtml(PCD.i18n.t('inv_print_title') || 'Stock Count') + '</h1>' +
      '<div class="meta">' + dateStr + ' · ' + timeStr +
        (snap.countedBy ? ' · ' + PCD.escapeHtml(PCD.i18n.t('inv_print_by') || 'by') + ' ' + PCD.escapeHtml(snap.countedBy) : '') +
        ' · ' + snap.itemCount + ' ' + PCD.escapeHtml(PCD.i18n.t('inv_print_items_label') || 'items') + '</div>' +
      body;

    if (PCD.gate && !PCD.gate.requireExport('inventory')) return;
    PCD.print(html, (PCD.i18n.t('inv_print_title') || 'Stock Count') + ' ' + date.toISOString().slice(0, 10));
  }

  // v2.14.2 — Stok sayım snapshot'ını ortak styled-Excel motoruyla indir.
  // Kategoriye göre sıralı tablo: Ingredient · Category · Counted · Unit.
  function exportSnapshotXlsx(snap) {
    const t = PCD.i18n.t;
    const date = new Date(snap.countedAt);
    const dateStr = date.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { day: 'numeric', month: 'long', year: 'numeric' });
    const go = function (XLSX) {
      if (!XLSX || !XLSX.utils || !PCD.xlsx) { PCD.toast.error(t('toast_excel_parser_unavailable')); return; }
      const list = [];
      Object.keys(snap.counts || {}).forEach(function (iid) {
        const c = snap.counts[iid] || {};
        list.push({
          name: c.name || '',
          catLabel: t(c.category || 'cat_other') || (c.category || 'cat_other'),
          amount: (typeof c.amount === 'number') ? c.amount : (Number(c.amount) || 0),
          unit: c.unit || '',
        });
      });
      list.sort(function (a, b) {
        return a.catLabel.localeCompare(b.catLabel) || a.name.localeCompare(b.name);
      });
      const rows = list.map(function (c) { return [c.name, c.catLabel, c.amount, c.unit]; });
      PCD.xlsx.save(XLSX, [{
        name: 'Stock Count',
        title: (t('inv_print_title') || 'Stock Count') + ' — ' + dateStr,
        subtitle: snap.itemCount + ' items' + (snap.countedBy ? ' · by ' + snap.countedBy : ''),
        headers: ['Ingredient', 'Category', 'Counted', 'Unit'],
        rows: rows,
        align: ['left', 'left', 'right', 'left'],
        widths: [30, 20, 12, 10],
      }], (t('inv_print_title') || 'Stock Count').replace(/\s+/g, '-').toLowerCase() + '-' + date.toISOString().slice(0, 10) + '.xlsx');
    };
    if (window.XLSX && window.XLSX.utils) go(window.XLSX);
    else if (PCD.loadXLSX) PCD.loadXLSX().then(go).catch(function () { PCD.toast.error(t('toast_excel_parser_unavailable')); });
    else PCD.toast.error(t('toast_excel_parser_unavailable'));
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
    const saveLabel = (mode === 'doubleA') ? PCD.i18n.t('inv_save_chef_a') : (mode === 'doubleB' ? PCD.i18n.t('inv_save_chef_b') : PCD.i18n.t('inv_save_all_counts'));
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
      if (PCD.gate && !PCD.gate.requireAuth()) return;
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
      PCD.toast.success((PCD.i18n.t('toast_stock_count_saved', { n: n }) || ('✓ Stock count saved · ' + n + ' item' + (n === 1 ? '' : 's') + ' updated')), 4000);
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
  // v2.44.45 — Satış kaydet: dishes (recipe) listesi + satılan adet → otomatik
  // tüketim (computeSalesDeductions → applyStockDeductions). Event/buffet ile aynı
  // onaylı düşüş akışı + aynı i18n anahtarları.
  // v2.44.75 — Tarihli satış günlüğü: önce GÜN seç, o günün satışlarını gir/düzenle,
  // geçmiş kayıtları gez. salesLog'ta tarih bazlı; tekrar girince ÇİFT-DÜŞME YOK
  // (net fark uygulanır) + cihazlar-arası senkron. Variance/Menü Müh./Dashboard besler.
  function openRecordSales() {
    const t = PCD.i18n.t;
    const esc = PCD.escapeHtml;
    const recipes = (PCD.store.listRecipes() || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (!recipes.length) { PCD.toast.info(t('inv_no_recipes_for_sales')); return; }
    const wsId = PCD.store.getActiveWorkspaceId();
    const today = new Date().toISOString().slice(0, 10);
    function logArr() { const root = PCD.store._read('salesLog') || {}; return (root[wsId] || []).filter(function (s) { return s && !s._deletedAt; }); }
    function salesForDate(date) { const mp = {}; logArr().forEach(function (s) { if (s.date === date && s.recipeId) mp[s.recipeId] = (mp[s.recipeId] || 0) + (Number(s.qty) || 0); }); return mp; }
    function salesDates() { const b = {}; logArr().forEach(function (s) { if (s.date) b[s.date] = (b[s.date] || 0) + (Number(s.qty) || 0); }); return Object.keys(b).sort().reverse().map(function (d) { return { date: d, total: b[d] }; }); }
    const _isPrep = function (r) { return (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit); };
    const _hasDishes = recipes.some(function (r) { return !_isPrep(r); });
    let selectedDate = today;
    let rsCat = _hasDishes ? 'dishes' : 'all';

    const body = PCD.el('div');
    function buildBody() {
      const existing = salesForDate(selectedDate);
      const isEditing = Object.keys(existing).length > 0;
      const dates = salesDates();
      const catBtn = function (cat, label) { return '<button type="button" class="btn btn-sm rs-cat-btn ' + (cat === rsCat ? 'btn-primary' : 'btn-outline') + '" data-cat="' + cat + '">' + esc(label) + '</button>'; };
      let html =
        '<div class="mb-3" style="padding:10px 12px;background:var(--brand-50);border-radius:var(--r-md);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-weight:700;font-size:13px;">' + esc(t('inv_sales_date') || 'Sales date') + '</span>' +
          '<input type="date" id="rsDate" value="' + selectedDate + '" max="' + today + '" style="padding:6px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;">' +
          (isEditing ? '<span style="font-size:11px;font-weight:700;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:2px 9px;">' + esc(t('inv_sales_editing') || 'Editing this date') + '</span>' : '') +
        '</div>';
      if (dates.length) {
        html += '<details style="border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden;">' +
          '<summary style="cursor:pointer;padding:9px 12px;font-weight:700;font-size:13px;background:var(--surface-2);">' + esc(t('inv_sales_history') || 'Past sales records') + ' · ' + dates.length + '</summary>' +
          '<div style="max-height:200px;overflow:auto;">' +
            dates.map(function (d) { return '<button type="button" class="rs-date-pick" data-date="' + d.date + '" style="display:flex;justify-content:space-between;width:100%;padding:8px 12px;border:0;border-bottom:1px solid var(--border);background:' + (d.date === selectedDate ? 'var(--brand-50)' : 'transparent') + ';cursor:pointer;font-size:13px;text-align:left;"><span>' + esc(PCD.fmtDate(new Date(d.date + 'T00:00:00').getTime())) + '</span><span style="font-weight:700;color:var(--brand-700);">' + d.total + ' ' + esc(t('inv_sold') || 'sold') + '</span></button>'; }).join('') +
          '</div></details>';
      }
      html += '<div id="rsCat" style="display:flex;gap:6px;margin-bottom:8px;">' + catBtn('dishes', t('inv_cat_dishes')) + catBtn('preps', t('inv_cat_preps')) + catBtn('all', t('all')) + '</div>';
      html += '<input type="search" id="rsSearch" placeholder="' + esc(t('inv_filter_placeholder')) + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;margin-bottom:8px;box-sizing:border-box;">';
      html += '<div id="rsList">';
      recipes.forEach(function (r) {
        const pre = existing[r.id] || 0;
        html += '<label class="rs-row" data-prep="' + (_isPrep(r) ? '1' : '0') + '" data-name="' + esc((r.name || '').toLowerCase()) + '" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;">' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;">' + esc(r.name || '') + '</div>' +
          '<div class="text-muted" style="font-size:11px;">' + esc(t('inv_servings')) + ': ' + PCD.fmtNumber(r.servings || 1) + '</div></div>' +
          '<input type="number" class="input rs-qty" data-rid="' + r.id + '" value="' + pre + '" min="0" step="1" style="width:72px;text-align:center;font-weight:600;">' +
          '<span class="text-muted" style="font-size:11px;">' + esc(t('inv_sold')) + '</span>' +
          '</label>';
      });
      html += '</div>';
      body.innerHTML = html;
      const dateInp = PCD.$('#rsDate', body);
      if (dateInp) dateInp.addEventListener('change', function () { selectedDate = this.value || today; buildBody(); });
      PCD.$$('.rs-date-pick', body).forEach(function (b) { b.addEventListener('click', function () { selectedDate = b.getAttribute('data-date'); buildBody(); }); });
      const search = PCD.$('#rsSearch', body);
      function rsFilter() {
        const q = (search && search.value || '').toLowerCase();
        PCD.$$('.rs-row', body).forEach(function (row) {
          const isP = row.getAttribute('data-prep') === '1';
          const catOk = rsCat === 'all' || (rsCat === 'preps' ? isP : !isP);
          const textOk = !q || (row.getAttribute('data-name') || '').indexOf(q) >= 0;
          row.style.display = (catOk && textOk) ? '' : 'none';
        });
      }
      if (search) search.addEventListener('input', rsFilter);
      PCD.$$('.rs-cat-btn', body).forEach(function (b) {
        b.addEventListener('click', function () {
          rsCat = b.getAttribute('data-cat');
          PCD.$$('.rs-cat-btn', body).forEach(function (x) { const on = x.getAttribute('data-cat') === rsCat; x.classList.toggle('btn-primary', on); x.classList.toggle('btn-outline', !on); });
          rsFilter();
        });
      });
      rsFilter();
    }
    buildBody();

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    saveBtn.innerHTML = PCD.icon('check', 14) + ' <span>' + (t('save') || 'Save') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    const m = PCD.modal.open({ title: t('inv_record_sales'), body: body, footer: footer, size: 'md', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });

    saveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      const newSales = {};
      PCD.$$('.rs-qty', body).forEach(function (inp) { const q = Number(inp.value) || 0; if (q > 0) newSales[inp.getAttribute('data-rid')] = q; });
      const oldSales = salesForDate(selectedDate);
      if (!Object.keys(newSales).length && !Object.keys(oldSales).length) { PCD.toast.info(t('inv_no_sales_entered')); return; }
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      const ddNew = computeSalesDeductions(newSales, ingMap, recipeMap);
      const newIds = Object.keys(ddNew.deductions);
      confirmStockChange({
        title: (t('inv_record_sales') || 'Record sales') + ' · ' + PCD.fmtDate(new Date(selectedDate + 'T00:00:00').getTime()),
        verb: t('save') || 'Save',
        kind: 'deduct',
        note: t('inv_sales_save_note') || 'Stock is updated to match this day’s sales. If a record already exists for this date, only the difference is applied.',
        items: newIds.map(function (iid) { const ing = ingMap[iid]; return { name: ing ? ing.name : iid, amount: ddNew.deductions[iid], unit: ing ? ing.unit : '' }; }),
      }).then(function (ok) {
        if (!ok) return;
        const inv = PCD.tools.inventory;
        // 1) Inventory net-fark: önce eski kaydın düşüşünü GERİ ekle, sonra yeniyi düş.
        //    Re-save aynı değerlerle → +X / −X = net 0 (çift-düşme yok / idempotent).
        const ddOld = computeSalesDeductions(oldSales, ingMap, recipeMap);
        if (Object.keys(ddOld.deductions).length && inv.applyStockAdditions) inv.applyStockAdditions(ddOld.deductions);
        const report = inv.applyStockDeductions ? inv.applyStockDeductions(ddNew.deductions) : [];
        // 2) recipe.salesCount: fark kadar güncelle (popülerlik ekseni).
        const rids = {}; Object.keys(newSales).forEach(function (k) { rids[k] = 1; }); Object.keys(oldSales).forEach(function (k) { rids[k] = 1; });
        Object.keys(rids).forEach(function (rid) {
          const delta = (Number(newSales[rid]) || 0) - (Number(oldSales[rid]) || 0);
          if (!delta) return;
          const rr = PCD.store.getRecipe(rid);
          if (rr) { rr.salesCount = Math.max(0, (Number(rr.salesCount) || 0) + delta); PCD.store.upsertRecipe(rr); }
        });
        // 3) salesLog: bu TARİHİN kayıtlarını değiştir (eski satırları çıkar + yeni ekle) → senkron.
        try {
          const root = PCD.store._read('salesLog') || {};
          const oldArr = (root[wsId] || []);
          const newArr = oldArr.filter(function (s) { return !s || s.date !== selectedDate; });
          Object.keys(newSales).forEach(function (rid) { const q = Number(newSales[rid]) || 0; if (q > 0) newArr.push({ id: PCD.uid('sl'), date: selectedDate, recipeId: rid, qty: q }); });
          const next = Object.assign({}, root); next[wsId] = newArr;
          PCD.store.set('salesLog', next);
          if (PCD.cloudPerTable && PCD.cloudPerTable.queueArraySync) { try { PCD.cloudPerTable.queueArraySync('sales_log', wsId, oldArr, newArr); } catch (e) { /* offline ok */ } }
        } catch (e) { PCD.warn && PCD.warn('salesLog write failed', e); }
        const deducted = report.filter(function (r) { return r.tracked; }).length;
        const lowNow = report.filter(function (r) { return r.tracked && (r.status === 'low' || r.status === 'critical' || r.status === 'out'); }).length;
        PCD.toast.success((t('inv_sales_saved') || 'Sales saved · {n} item(s) updated').replace('{n}', deducted) + (lowNow ? ' · ' + lowNow + ' ⚠' : ''));
        m.close();
        setTimeout(function () { const v = PCD.$('#view'); if (v && PCD.router.currentView() === 'inventory') render(v); }, 200);
      });
    });
  }

  function openGenerateOrder() {
    const t = PCD.i18n.t;
    const L = function (k, fb) { try { const v = t(k); return (v == null || v === k) ? fb : v; } catch (e) { return fb; } };
    const ings = PCD.store.listIngredients();
    const invAll = readInventory();
    // Par-altı kalemler (out / critical / low)
    const below = [];
    ings.forEach(function (i) {
      const row = invAll[i.id];
      if (!row || row.parLevel == null) return;
      const stock = Number(row.stock) || 0;
      const par = Number(row.parLevel) || 0;
      const status = computeStatus(row);
      if (status === 'out' || status === 'critical' || status === 'low') {
        const need = Math.max(0, par - stock);
        below.push({ ing: i, stock: stock, par: par, need: need || par, status: status, supplier: (i.supplier || '').trim() });
      }
    });

    if (below.length === 0) {
      PCD.toast.info(t('toast_inventory_all_above_par'));
      return;
    }

    // v2.44.78 — Tedarikçi-başı sipariş. Tedarikçisiz kalemler EN ÜSTTE, atanmadan
    // gönderilemez (sessiz atlama YOK). Her tedarikçi grubu kendi GERÇEK gönderim
    // hattına gider (suppliers.startOrder → teslim tarihi + WhatsApp/SMS/Email + geçmiş).
    const noSup = below.filter(function (b) { return !b.supplier; });
    const bySupplier = {};
    below.forEach(function (b) { if (b.supplier) { (bySupplier[b.supplier] = bySupplier[b.supplier] || []).push(b); } });
    const supplierNames = Object.keys(bySupplier).sort();

    const body = PCD.el('div');

    function rowHtml(b, assignable) {
      const tag = assignable ? 'div' : 'label';
      return '<' + tag + ' style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;background:var(--surface);' + (assignable ? '' : 'cursor:pointer;') + '">' +
        (assignable ? '' : '<input type="checkbox" class="po-item" data-iid="' + b.ing.id + '" data-sup="' + PCD.escapeHtml(b.supplier) + '" checked style="accent-color:var(--brand-600);width:18px;height:18px;flex-shrink:0;">') +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(b.ing.name) + '</div>' +
          '<div class="text-muted" style="font-size:11px;">' + PCD.escapeHtml(L('inv_current_stock', 'Stock')) + ': ' + PCD.fmtNumber(b.stock) + ' · Par: ' + PCD.fmtNumber(b.par) + ' ' + (b.ing.unit || '') + '</div>' +
        '</div>' +
        '<input type="number" class="input po-qty" data-iid="' + b.ing.id + '" value="' + b.need.toFixed(2) + '" step="0.01" min="0" style="width:74px;text-align:center;font-weight:600;">' +
        '<span class="text-muted" style="font-size:11px;flex-shrink:0;">' + (b.ing.unit || '') + '</span>' +
        (assignable ? '<button type="button" class="btn btn-sm btn-outline po-assign" data-iid="' + b.ing.id + '" style="flex-shrink:0;white-space:nowrap;">' + PCD.icon('truck', 13) + ' ' + PCD.escapeHtml(L('assign_supplier', 'Assign')) + '</button>' : '') +
      '</' + tag + '>';
    }

    let html = '<div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">' +
      '<div style="font-weight:700;">' + below.length + ' ' + PCD.escapeHtml(L('inv_items_below_par', 'items below par')) + '</div>' +
      '<div class="text-muted text-sm">' + PCD.escapeHtml(L('inv_order_hint', 'Each supplier gets its own order. Assign a supplier to the flagged items first.')) + '</div>' +
      '</div>';

    if (noSup.length) {
      html += '<div class="mb-3" style="border:1px solid var(--warning);border-radius:var(--r-md);overflow:hidden;">' +
        '<div style="padding:9px 12px;background:#fff7ed;color:#b45309;font-weight:700;font-size:13px;">⚠ ' + PCD.escapeHtml(L('inv_order_no_supplier', 'No supplier assigned')) + ' · ' + noSup.length + '</div>' +
        '<div style="padding:8px 9px;">';
      noSup.forEach(function (b) { html += rowHtml(b, true); });
      html += '</div></div>';
    }

    supplierNames.forEach(function (sup) {
      html += '<div class="mb-3">' +
        '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">' + PCD.escapeHtml(sup) + '</div>';
      bySupplier[sup].forEach(function (b) { html += rowHtml(b, false); });
      html += '<button type="button" class="btn btn-primary btn-sm po-send" data-sup="' + PCD.escapeHtml(sup) + '" style="margin-top:2px;">' + PCD.icon('send', 13) + ' ' + PCD.escapeHtml(L('inv_order_send_to', 'Send to {name}').replace('{name}', sup)) + '</button>' +
      '</div>';
    });
    body.innerHTML = html;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline' });
    printBtn.innerHTML = PCD.icon('print', 14) + ' <span>' + t('print') + '</span>';
    const receivedBtn = PCD.el('button', { class: 'btn btn-outline' });
    receivedBtn.innerHTML = '📥 <span>' + t('inv_mark_received') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);
    footer.appendChild(receivedBtn);

    const m = PCD.modal.open({ title: t('modal_purchase_order_title'), body: body, footer: footer, size: 'md', closable: true });

    // Bir tedarikçinin SEÇİLİ kalemleri → startOrder formatı ([{ingId, qty, unit}]).
    function collectForSupplier(sup) {
      const items = [];
      body.querySelectorAll('.po-item:checked').forEach(function (cb) {
        if (cb.getAttribute('data-sup') !== sup) return;
        const iid = cb.getAttribute('data-iid');
        const qi = body.querySelector('.po-qty[data-iid="' + iid + '"]');
        const qty = qi ? parseFloat(qi.value) : 0;
        if (!qty || qty <= 0) return;
        const b = below.find(function (x) { return x.ing.id === iid; });
        if (!b) return;
        items.push({ ingId: iid, qty: qty, unit: b.ing.unit || '' });
      });
      return items;
    }
    // Print + Mark received için: tüm seçili/atanmış kalemler, tedarikçiye göre grup.
    function collectAll() {
      const grouped = {};
      body.querySelectorAll('.po-qty').forEach(function (qi) {
        const iid = qi.getAttribute('data-iid');
        const cb = body.querySelector('.po-item[data-iid="' + iid + '"]');
        if (cb && !cb.checked) return;
        const qty = parseFloat(qi.value);
        if (!qty || qty <= 0) return;
        const b = below.find(function (x) { return x.ing.id === iid; });
        if (!b) return;
        const key = b.supplier || L('sup_none', 'No supplier');
        (grouped[key] = grouped[key] || []).push({ ing: b.ing, qty: qty });
      });
      return grouped;
    }

    // Tedarikçisiz bir kaleme tedarikçi ata (mevcutlardan seç veya yeni oluştur).
    function assignSupplier(ingId, onDone) {
      const ing = PCD.store.getIngredient(ingId);
      if (!ing) return;
      const names = {};
      (PCD.store.listIngredients() || []).forEach(function (i) { const n = (i.supplier || '').trim(); if (n) names[n] = true; });
      const list = Object.keys(names).sort();
      const ab = PCD.el('div');
      let h = '<div class="text-muted text-sm" style="margin-bottom:10px;">' + PCD.escapeHtml(L('inv_assign_to', 'Assign a supplier to') + ' ' + ing.name) + '</div>';
      if (list.length) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';
        list.forEach(function (n) { h += '<button type="button" class="as-pick" data-n="' + PCD.escapeHtml(n) + '" style="padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:13px;font-weight:600;">' + PCD.escapeHtml(n) + '</button>'; });
        h += '</div>';
      }
      h += '<div class="field"><label class="field-label">' + PCD.escapeHtml(L('sup_new', 'New supplier')) + '</label><div style="display:flex;gap:6px;"><input type="text" class="input" id="asNew" placeholder="' + PCD.escapeHtml(L('sup_new', 'New supplier')) + '"><button type="button" class="btn btn-primary" id="asNewBtn">' + PCD.escapeHtml(L('add', 'Add')) + '</button></div></div>';
      ab.innerHTML = h;
      const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
      const f = PCD.el('div', { style: { display: 'flex', width: '100%' } });
      f.appendChild(cancel);
      const am = PCD.modal.open({ title: L('assign_supplier', 'Assign supplier'), body: ab, footer: f, size: 'sm', closable: true });
      cancel.addEventListener('click', function () { am.close(); });
      function apply(n) {
        n = (n || '').trim();
        if (!n) return;
        ing.supplier = n;
        PCD.store.upsertIngredient(ing);
        try {
          const have = (PCD.store.listTable('suppliers') || []).some(function (s) { return (s.name || '').trim().toLowerCase() === n.toLowerCase(); });
          if (!have && PCD.store.upsertInTable) PCD.store.upsertInTable('suppliers', { name: n, category: 'Other', products: [] }, 'sup');
        } catch (e) {}
        am.close();
        if (onDone) onDone();
      }
      ab.addEventListener('click', function (e) { const p = e.target.closest && e.target.closest('.as-pick'); if (p) apply(p.getAttribute('data-n')); });
      PCD.$('#asNewBtn', ab).addEventListener('click', function () { apply(PCD.$('#asNew', ab).value); });
    }

    cancelBtn.addEventListener('click', function () { m.close(); });

    // Body delegasyonu (modal-scoped, sızıntısız): grup "Gönder" + kalem "Ata".
    body.addEventListener('click', function (e) {
      const sendBtn = e.target.closest && e.target.closest('.po-send');
      if (sendBtn) {
        const sup = sendBtn.getAttribute('data-sup');
        const items = collectForSupplier(sup);
        if (!items.length) { PCD.toast.warning(t('toast_no_items_selected')); return; }
        const fire = function () {
          m.close();
          PCD.tools.suppliers.startOrder(sup, items);
          if (noSup.length) PCD.toast.warning(L('inv_order_remaining_nosup', '{n} item(s) still have no supplier — assign to order them.').replace('{n}', noSup.length));
        };
        if (PCD.tools.suppliers && PCD.tools.suppliers.startOrder) { fire(); return; }
        if (PCD.router && PCD.router.loadLazyTool) {
          PCD.router.loadLazyTool('suppliers').then(function () {
            if (PCD.tools.suppliers && PCD.tools.suppliers.startOrder) fire();
          }).catch(function () { PCD.toast.error(L('toast_error', 'Something went wrong')); });
        }
        return;
      }
      const asgBtn = e.target.closest && e.target.closest('.po-assign');
      if (asgBtn) {
        const iid = asgBtn.getAttribute('data-iid');
        assignSupplier(iid, function () { m.close(); setTimeout(openGenerateOrder, 150); });
      }
    });

    printBtn.addEventListener('click', function () {
      const grouped = collectAll();
      const keys = Object.keys(grouped);
      if (keys.length === 0) { PCD.toast.warning(t('toast_no_items_selected')); return; }
      if (PCD.gate && !PCD.gate.requireExport('inventory')) return;
      const user = PCD.store.get('user') || {};
      const userName = user.name || user.email || '';
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      let html = '<div style="max-width:680px;margin:0 auto">';
      html += '<h1>Purchase Order</h1>';
      html += '<div style="color:#666;font-size:12px;margin-bottom:16px;">' + date + (userName ? ' · ' + PCD.escapeHtml(userName) : '') + '</div>';
      keys.forEach(function (sup) {
        html += '<h3 style="margin-top:16px;padding-bottom:4px;border-bottom:1px solid #ddd;">' + PCD.escapeHtml(sup) + '</h3><table>';
        grouped[sup].forEach(function (it) {
          html += '<tr><td style="width:24px;">☐</td><td>' + PCD.escapeHtml(it.ing.name) + '</td><td style="text-align:right;font-family:monospace;">' + PCD.fmtNumber(it.qty) + ' ' + PCD.escapeHtml(it.ing.unit || '') + '</td></tr>';
        });
        html += '</table>';
      });
      html += '</div>';
      PCD.print(html, 'Purchase Order');
    });

    receivedBtn.addEventListener('click', function () {
      const grouped = collectAll();
      const keys = Object.keys(grouped);
      if (keys.length === 0) { PCD.toast.warning(t('toast_no_items_selected')); return; }
      const additions = {};
      const items = [];
      keys.forEach(function (sup) {
        grouped[sup].forEach(function (it) {
          additions[it.ing.id] = (additions[it.ing.id] || 0) + it.qty;
          items.push(it);
        });
      });
      confirmStockChange({
        title: t('inv_mark_received'),
        verb: t('inv_mark_received'),
        kind: 'add',
        items: items.map(function (it) { return { name: it.ing.name, amount: it.qty, unit: it.ing.unit || '' }; }),
      }).then(function (ok) {
        if (!ok) return;
        const report = (PCD.tools.inventory && PCD.tools.inventory.applyStockAdditions)
          ? PCD.tools.inventory.applyStockAdditions(additions) : [];
        PCD.toast.success((t('inv_receive_done') || '{n} item(s) added to stock').replace('{n}', report.length));
        m.close();
        setTimeout(function () { const v = PCD.$('#view'); if (PCD.router.currentView() === 'inventory') render(v); }, 200);
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
            <div class="text-muted text-sm">${PCD.fmtMoney(ing.pricePerUnit)} / ${ing.unit}${ing.supplier ? ' · ' + PCD.icon('truck', 12) + ' ' + PCD.escapeHtml(ing.supplier) : ''}</div>
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
      if (PCD.gate && !PCD.gate.requireAuth()) return;
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
  PCD.tools.inventory = { render: render, openEditor: openEditor, computeStatus: computeStatus, applyStockDeductions: applyStockDeductions, applyStockAdditions: applyStockAdditions, computeSalesDeductions: computeSalesDeductions, confirmStockChange: confirmStockChange };
})();
