/* ================================================================
   ProChefDesk — waste.js
   Track daily waste entries. Shows 7-day bar chart of cost,
   top wasted items, weekly/monthly totals.

   Data: PCD.store.waste = [ {
     id, ingredientId, amount, unit, reason, cost, notes, at
   } ]
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const REASONS = ['spoilage', 'overcooked', 'dropped', 'wrong_order', 'trim', 'expired', 'other'];

  function calcEntryCost(entry, ingredient) {
    if (!ingredient) return 0;
    const amt = Number(entry.amount) || 0;
    let price = Number(ingredient.pricePerUnit) || 0;
    if (entry.unit && ingredient.unit && entry.unit !== ingredient.unit) {
      try {
        return PCD.convertUnit(amt, entry.unit, ingredient.unit) * price;
      } catch (e) {}
    }
    return amt * price;
  }

  function render(view) {
    const t = PCD.i18n.t;
    const entries = (PCD.store._read('waste') || []).slice();
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    // Enrich with cost
    entries.forEach(function (e) {
      if (e.cost == null) e.cost = calcEntryCost(e, ingMap[e.ingredientId]);
    });

    // Stats
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    let weekTotal = 0, monthTotal = 0, allTotal = 0;
    entries.forEach(function (e) {
      const ts = new Date(e.at).getTime();
      allTotal += e.cost || 0;
      if (ts >= weekAgo) weekTotal += e.cost || 0;
      if (ts >= monthAgo) monthTotal += e.cost || 0;
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('waste_title')}</div>
          <div class="page-subtitle">${t('waste_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newWasteBtn">+ ${t('new_waste')}</button>
        </div>
      </div>

      <div class="grid mb-3" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
        <div class="stat">
          <div class="stat-label">${t('waste_total_week')}</div>
          <div class="stat-value" style="color:var(--danger);">${PCD.fmtMoney(weekTotal)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${t('waste_total_month')}</div>
          <div class="stat-value" style="color:var(--danger);">${PCD.fmtMoney(monthTotal)}</div>
        </div>
      </div>

      ${entries.length > 0 ? `
        <div class="section">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('waste_chart')}</div>
          <div class="card"><div class="card-body" id="wasteChart"></div></div>
        </div>

        <div class="section">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('waste_top_items')}</div>
          <div id="topItems" class="flex flex-col gap-2"></div>
        </div>

        <div class="section">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Recent</div>
          <div id="wasteList" class="flex flex-col gap-2"></div>
        </div>
      ` : ''}

      <div id="wasteEmpty"></div>
    `;

    if (entries.length === 0) {
      PCD.$('#wasteEmpty', view).innerHTML = `
        <div class="empty">
          <div class="empty-icon">♻️</div>
          <div class="empty-title">${t('waste_empty')}</div>
          <div class="empty-desc">${t('waste_empty_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNew">+ ${t('new_waste')}</button></div>
        </div>
      `;
      PCD.$('#emptyNew', view).addEventListener('click', function () { openEditor(); });
    } else {
      renderChart(PCD.$('#wasteChart', view), entries);
      renderTopItems(PCD.$('#topItems', view), entries, ingMap);
      renderRecent(PCD.$('#wasteList', view), entries, ingMap);
    }

    PCD.$('#newWasteBtn', view).addEventListener('click', function () { openEditor(); });
  }

  function renderChart(host, entries) {
    // 7-day cost bar chart using inline SVG
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      days.push({ date: d, total: 0 });
    }
    entries.forEach(function (e) {
      const d = new Date(e.at);
      d.setHours(0, 0, 0, 0);
      const idx = days.findIndex(function (x) { return x.date.getTime() === d.getTime(); });
      if (idx >= 0) days[idx].total += (e.cost || 0);
    });
    const maxVal = Math.max.apply(null, days.map(function (x) { return x.total; }).concat([1]));

    const dayLabels = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'];
    const t = PCD.i18n.t;

    const W = 560, H = 160, pad = 8, barW = (W - pad * 2) / 7;
    let bars = '';
    let labels = '';
    days.forEach(function (d, i) {
      const ratio = maxVal > 0 ? d.total / maxVal : 0;
      const h = Math.max(ratio * (H - 50), 2);
      const x = pad + i * barW + barW * 0.15;
      const y = H - 30 - h;
      const w = barW * 0.7;
      const isToday = i === 6;
      const color = d.total > 0 ? (isToday ? 'var(--danger)' : 'var(--brand-500)') : 'var(--surface-3)';
      bars += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="' + color + '" opacity="' + (d.total > 0 ? 1 : 0.4) + '">' +
        '<title>' + PCD.fmtMoney(d.total) + '</title></rect>';
      if (d.total > 0) {
        bars += '<text x="' + (x + w / 2) + '" y="' + (y - 4) + '" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">' + PCD.fmtMoney(d.total) + '</text>';
      }
      const dayKey = dayLabels[d.date.getDay()];
      labels += '<text x="' + (x + w / 2) + '" y="' + (H - 10) + '" text-anchor="middle" fill="currentColor" font-size="11" opacity="0.6">' + t(dayKey) + '</text>';
    });
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;color:var(--text);">' + bars + labels + '</svg>';
  }

  function renderTopItems(host, entries, ingMap) {
    const t = PCD.i18n.t;
    // Group by ingredient, sum cost
    const byIng = {};
    entries.forEach(function (e) {
      if (!byIng[e.ingredientId]) byIng[e.ingredientId] = { count: 0, cost: 0 };
      byIng[e.ingredientId].count++;
      byIng[e.ingredientId].cost += (e.cost || 0);
    });
    const arr = Object.keys(byIng).map(function (id) {
      return Object.assign({ id: id, ing: ingMap[id] }, byIng[id]);
    }).filter(function (x) { return x.ing; })
      .sort(function (a, b) { return b.cost - a.cost; })
      .slice(0, 5);
    const maxCost = Math.max.apply(null, arr.map(function (x) { return x.cost; }).concat([1]));

    PCD.clear(host);
    arr.forEach(function (x) {
      const pct = (x.cost / maxCost) * 100;
      const row = PCD.el('div', { class: 'card', style: { padding: '10px 12px' } });
      row.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <div style="font-weight:600;font-size:14px;">${PCD.escapeHtml(x.ing.name)}</div>
          <div style="font-weight:700;color:var(--danger);font-size:14px;">${PCD.fmtMoney(x.cost)}</div>
        </div>
        <div class="progress" style="height:4px;">
          <div class="progress-bar" style="width:${pct}%;background:var(--danger);"></div>
        </div>
        <div class="text-muted text-sm mt-1">${x.count} ${x.count === 1 ? 'entry' : 'entries'}</div>
      `;
      host.appendChild(row);
    });
  }

  function renderRecent(host, entries, ingMap) {
    const t = PCD.i18n.t;
    const recent = entries.slice().sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 20);
    PCD.clear(host);
    recent.forEach(function (e) {
      const ing = ingMap[e.ingredientId];
      const name = ing ? ing.name : '(removed)';
      const row = PCD.el('div', { class: 'list-item', 'data-wid': e.id, style: { minHeight: 'auto', padding: '10px' } });
      row.innerHTML = `
        <div class="list-item-thumb" style="width:40px;height:40px;font-size:18px;background:var(--danger-bg);color:var(--danger);">♻️</div>
        <div class="list-item-body">
          <div class="list-item-title" style="font-size:14px;">${PCD.escapeHtml(name)}</div>
          <div class="list-item-meta">
            <span>${PCD.fmtNumber(e.amount)} ${e.unit || ''}</span>
            <span>·</span>
            <span>${t('waste_reason_' + e.reason) !== 'waste_reason_' + e.reason ? t('waste_reason_' + e.reason) : e.reason}</span>
            <span>·</span>
            <span>${PCD.fmtRelTime(e.at)}</span>
          </div>
        </div>
        <div style="font-weight:700;color:var(--danger);">${PCD.fmtMoney(e.cost || 0)}</div>
      `;
      host.appendChild(row);
    });
    PCD.on(host, 'click', '[data-wid]', function () {
      openEditor(this.getAttribute('data-wid'));
    });
  }

  function openEditor(wid) {
    const t = PCD.i18n.t;
    const entries = (PCD.store._read('waste') || []).slice();
    const existing = wid ? entries.find(function (e) { return e.id === wid; }) : null;
    const data = existing ? PCD.clone(existing) : {
      ingredientId: null, amount: null, unit: null, reason: 'spoilage', notes: '', at: new Date().toISOString()
    };

    const body = PCD.el('div');

    function render() {
      const ing = data.ingredientId ? PCD.store.getIngredient(data.ingredientId) : null;
      const liveCost = ing ? calcEntryCost(data, ing) : 0;

      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('waste_ingredient')} *</label>
          <button class="btn btn-outline btn-block" id="pickIng" style="justify-content:flex-start;">
            ${ing ? PCD.escapeHtml(ing.name) + ' <span class="text-muted" style="margin-inline-start:auto;">' + PCD.fmtMoney(ing.pricePerUnit) + '/' + ing.unit + '</span>' : '— ' + t('waste_ingredient') + ' →'}
          </button>
        </div>

        ${ing ? `
          <div class="field-row">
            <div class="field">
              <label class="field-label">${t('waste_amount')}</label>
              <div class="input-group">
                <input type="number" class="input" id="wAmt" value="${data.amount || ''}" step="0.01" min="0">
                <select class="select" id="wUnit" style="border:0;background:var(--surface-2);">
                  ${['g','kg','ml','l','tsp','tbsp','cup','pcs','unit'].map(function (u) { return '<option value="' + u + '"' + ((data.unit || ing.unit) === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
                </select>
              </div>
            </div>
            <div class="field">
              <label class="field-label">${t('waste_cost')}</label>
              <div class="input" style="background:var(--surface-2);display:flex;align-items:center;color:var(--danger);font-weight:700;">${PCD.fmtMoney(liveCost)}</div>
            </div>
          </div>

          <div class="field">
            <label class="field-label">${t('waste_reason')}</label>
            <select class="select" id="wReason">
              ${REASONS.map(function (r) { return '<option value="' + r + '"' + (data.reason === r ? ' selected' : '') + '>' + t('waste_reason_' + r) + '</option>'; }).join('')}
            </select>
          </div>

          <div class="field">
            <label class="field-label">${t('date')}</label>
            <input type="datetime-local" class="input" id="wDate" value="${new Date(data.at).toISOString().slice(0, 16)}">
          </div>

          <div class="field">
            <label class="field-label">${t('notes')}</label>
            <textarea class="textarea" id="wNotes" rows="2" placeholder="${t('waste_notes_ph')}">${PCD.escapeHtml(data.notes || '')}</textarea>
          </div>
        ` : '<div class="text-muted text-sm">Pick an ingredient to continue</div>'}
      `;

      PCD.$('#pickIng', body).addEventListener('click', function () {
        const items = PCD.store.listIngredients().map(function (i) {
          return { id: i.id, name: i.name, meta: t(i.category || 'cat_other') + ' · ' + PCD.fmtMoney(i.pricePerUnit) + '/' + i.unit };
        });
        if (items.length === 0) {
          PCD.toast.warning(t('no_ingredients_yet'));
          return;
        }
        PCD.picker.open({
          title: t('waste_ingredient'), items: items, multi: false,
          selected: data.ingredientId ? [data.ingredientId] : []
        }).then(function (sel) {
          if (sel && sel.length) {
            data.ingredientId = sel[0];
            const ing2 = PCD.store.getIngredient(data.ingredientId);
            if (ing2 && !data.unit) data.unit = ing2.unit;
            render();
          }
        });
      });

      const amtEl = PCD.$('#wAmt', body);
      if (amtEl) {
        amtEl.addEventListener('input', PCD.debounce(function () {
          data.amount = parseFloat(this.value) || 0;
          render();
        }, 300));
      }
      const unitEl = PCD.$('#wUnit', body);
      if (unitEl) {
        unitEl.addEventListener('change', function () {
          data.unit = this.value;
          render();
        });
      }
      const reasonEl = PCD.$('#wReason', body);
      if (reasonEl) {
        reasonEl.addEventListener('change', function () { data.reason = this.value; });
      }
      const dateEl = PCD.$('#wDate', body);
      if (dateEl) {
        dateEl.addEventListener('change', function () {
          const d = new Date(this.value);
          if (!isNaN(d.getTime())) data.at = d.toISOString();
        });
      }
      const notesEl = PCD.$('#wNotes', body);
      if (notesEl) {
        notesEl.addEventListener('input', function () { data.notes = this.value; });
      }
    }

    render();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('edit') + ' · ' + t('waste_title') : t('new_waste'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        const cur = (PCD.store._read('waste') || []).filter(function (e) { return e.id !== existing.id; });
        PCD.store.set('waste', cur);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'waste') render_list(v);
        }, 250);
      });
    });
    saveBtn.addEventListener('click', function () {
      if (!data.ingredientId) { PCD.toast.error(t('waste_ingredient') + ' ' + t('required')); return; }
      if (!data.amount || data.amount <= 0) { PCD.toast.error(t('waste_amount') + ' ' + t('required')); return; }
      const ing = PCD.store.getIngredient(data.ingredientId);
      data.cost = calcEntryCost(data, ing);
      if (!existing) data.id = PCD.uid('w');
      else data.id = existing.id;
      const cur = PCD.store._read('waste') || [];
      let next;
      if (existing) {
        next = cur.map(function (e) { return e.id === existing.id ? data : e; });
      } else {
        next = cur.concat([data]);
      }
      PCD.store.set('waste', next);
      PCD.toast.success(t('waste_logged'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'waste') render_list(v);
      }, 250);
    });
  }

  // Avoid name collision with inner render()
  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.waste = { render: render, openEditor: openEditor };
})();
