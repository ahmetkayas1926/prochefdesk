/* ================================================================
   ProChefDesk — events.js
   Event planner for banquets, weddings, catering jobs.

   Data model (events table):
   {
     id, name, date, time, guestCount, venue, pricePerHead, budget,
     status: 'draft' | 'confirmed' | 'done' | 'cancelled',
     notes,
     menu: [{ recipeId, portionsPerGuest }]  // 1 = one portion per guest
   }

   Auto-scales food cost with guestCount. Can generate shopping list.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const STATUSES = ['draft', 'confirmed', 'done', 'cancelled'];

  function statusColor(s) {
    return {
      draft: 'var(--text-3)',
      confirmed: 'var(--brand-600)',
      done: 'var(--success)',
      cancelled: 'var(--danger)',
    }[s] || 'var(--text-3)';
  }

  function render(view) {
    const t = PCD.i18n.t;
    const events = PCD.store.listTable('events').slice().sort(function (a, b) {
      // Upcoming first, then past
      const da = a.date || '', db = b.date || '';
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('events_title')}</div>
          <div class="page-subtitle">${t('events_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newEventBtn">+ ${t('new_event')}</button>
        </div>
      </div>
      <div id="eventList"></div>
    `;

    const listEl = PCD.$('#eventList', view);
    if (events.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🎉</div>
          <div class="empty-title">${t('event_empty')}</div>
          <div class="empty-desc">${t('event_empty_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewE">+ ${t('new_event')}</button></div>
        </div>
      `;
      PCD.$('#emptyNewE', listEl).addEventListener('click', function () { openEditor(); });
    } else {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      events.forEach(function (e) {
        const stats = computeStats(e, ingMap, recipeMap);
        const dateStr = e.date ? PCD.fmtDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
        const row = PCD.el('div', { class: 'card card-hover', 'data-eid': e.id, style: { padding: '12px' } });
        row.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">${PCD.escapeHtml(e.name || t('untitled'))}</div>
              <div class="text-muted text-sm">
                ${dateStr}
                ${e.time ? ' · ' + PCD.escapeHtml(e.time) : ''}
                ${e.guestCount ? ' · ' + e.guestCount + ' ' + t('event_guests').toLowerCase() : ''}
                ${e.venue ? ' · ' + PCD.escapeHtml(e.venue) : ''}
              </div>
            </div>
            <span class="chip" style="background:${statusColor(e.status || 'draft')}20;color:${statusColor(e.status || 'draft')};font-weight:700;">${t('event_status_' + (e.status || 'draft'))}</span>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <span class="chip">${t('event_total_cost')}: <strong>${PCD.fmtMoney(stats.totalCost)}</strong></span>
            ${stats.totalRevenue > 0 ? '<span class="chip chip-brand">' + t('event_total_revenue') + ': <strong>' + PCD.fmtMoney(stats.totalRevenue) + '</strong></span>' : ''}
            ${stats.profit !== null ? '<span class="chip chip-' + (stats.profit >= 0 ? 'success' : 'danger') + '">' + t('event_profit') + ': <strong>' + PCD.fmtMoney(stats.profit) + '</strong></span>' : ''}
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newEventBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-eid]', function () {
      openEditor(this.getAttribute('data-eid'));
    });
  }

  function computeStats(event, ingMap, recipeMap) {
    let totalCost = 0;
    const guests = Number(event.guestCount) || 0;
    (event.menu || []).forEach(function (item) {
      const r = recipeMap[item.recipeId];
      if (!r) return;
      const portionsTotal = guests * (Number(item.portionsPerGuest) || 1);
      const factor = portionsTotal / (r.servings || 1);
      const recipeCost = PCD.recipes.computeFoodCost(r, ingMap);
      totalCost += recipeCost * factor;
    });
    const totalRevenue = guests * (Number(event.pricePerHead) || 0);
    const profit = totalRevenue > 0 ? totalRevenue - totalCost : null;
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null;
    return { totalCost: totalCost, totalRevenue: totalRevenue, profit: profit, margin: margin };
  }

  function openEditor(eid) {
    const t = PCD.i18n.t;
    const existing = eid ? PCD.store.getFromTable('events', eid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', date: '', time: '', guestCount: 50, venue: '',
      pricePerHead: null, budget: null, status: 'draft', notes: '',
      menu: [],
    };

    const body = PCD.el('div');

    function render() {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      const stats = computeStats(data, ingMap, recipeMap);

      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('event_name')} *</label>
          <input type="text" class="input" id="eName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('event_name_ph')}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('event_date')}</label>
            <input type="date" class="input" id="eDate" value="${data.date || ''}">
          </div>
          <div class="field">
            <label class="field-label">${t('event_time')}</label>
            <input type="time" class="input" id="eTime" value="${data.time || ''}">
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('event_guests')}</label>
            <input type="number" class="input" id="eGuests" value="${data.guestCount || ''}" min="1">
          </div>
          <div class="field">
            <label class="field-label">${t('event_status')}</label>
            <select class="select" id="eStatus">
              ${STATUSES.map(function (s) { return '<option value="' + s + '"' + (data.status === s ? ' selected' : '') + '>' + t('event_status_' + s) + '</option>'; }).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label">${t('event_venue')}</label>
          <input type="text" class="input" id="eVenue" value="${PCD.escapeHtml(data.venue || '')}" placeholder="${t('event_venue_ph')}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('event_price_per_head')}</label>
            <input type="number" class="input" id="ePrice" value="${data.pricePerHead || ''}" step="0.01" min="0">
          </div>
          <div class="field">
            <label class="field-label">${t('event_budget')}</label>
            <input type="number" class="input" id="eBudget" value="${data.budget || ''}" step="0.01" min="0">
          </div>
        </div>

        <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
            <div>
              <div class="stat-label">${t('event_total_cost')}</div>
              <div style="font-size:18px;font-weight:800;">${PCD.fmtMoney(stats.totalCost)}</div>
            </div>
            ${stats.totalRevenue > 0 ? '<div style="text-align:end;"><div class="stat-label">' + t('event_total_revenue') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.totalRevenue) + '</div></div>' : ''}
            ${stats.profit !== null ? '<div style="text-align:end;"><div class="stat-label">' + t('event_profit') + '</div><div style="font-size:18px;font-weight:800;color:' + (stats.profit >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + PCD.fmtMoney(stats.profit) + (stats.margin !== null ? ' (' + PCD.fmtPercent(stats.margin, 0) + ')' : '') + '</div></div>' : ''}
          </div>
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('event_menu')} (${(data.menu || []).length})</div>
            <button class="btn btn-outline btn-sm" id="addMenuBtn">+ ${t('event_add_recipes')}</button>
          </div>
          <div id="menuList" class="flex flex-col gap-2"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('event_notes')}</label>
          <textarea class="textarea" id="eNotes" rows="2">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>

        <div class="flex gap-2 mt-3">
          <button class="btn btn-outline btn-block" id="genShop">🛒 ${t('event_gen_shopping')}</button>
        </div>
      `;

      // Menu list
      const menuListEl = PCD.$('#menuList', body);
      (data.menu || []).forEach(function (item, idx) {
        const r = recipeMap[item.recipeId];
        if (!r) return;
        const guests = Number(data.guestCount) || 0;
        const portionsTotal = guests * (Number(item.portionsPerGuest) || 1);
        const factor = portionsTotal / (r.servings || 1);
        const cost = PCD.recipes.computeFoodCost(r, ingMap) * factor;

        const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '10px' } });
        const thumb = PCD.el('div', { class: 'list-item-thumb', style: { width: '44px', height: '44px' } });
        if (r.photo) thumb.style.backgroundImage = 'url(' + r.photo + ')';
        else thumb.textContent = '🍽️';
        const bodyDiv = PCD.el('div', { class: 'list-item-body' });
        bodyDiv.innerHTML = `
          <div class="list-item-title" style="font-size:14px;">${PCD.escapeHtml(r.name)}</div>
          <div class="list-item-meta" style="font-size:12px;">
            <input type="number" data-pph="${idx}" value="${item.portionsPerGuest || 1}" step="0.1" min="0" class="input" style="width:60px;padding:4px 8px;min-height:26px;font-size:12px;">
            <span class="text-muted">/ guest</span>
            <span>·</span>
            <span style="font-weight:600;">${PCD.fmtNumber(portionsTotal)} total</span>
            <span>·</span>
            <span style="font-weight:600;color:var(--brand-700);">${PCD.fmtMoney(cost)}</span>
          </div>
        `;
        row.appendChild(thumb);
        row.appendChild(bodyDiv);
        const rm = PCD.el('button', { class: 'icon-btn', 'data-rm-menu': idx });
        rm.innerHTML = PCD.icon('x', 16);
        row.appendChild(rm);
        menuListEl.appendChild(row);
      });

      wire();
    }

    function wire() {
      PCD.$('#eName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#eDate', body).addEventListener('input', function () { data.date = this.value; });
      PCD.$('#eTime', body).addEventListener('input', function () { data.time = this.value; });
      PCD.$('#eGuests', body).addEventListener('input', PCD.debounce(function () {
        data.guestCount = parseInt(this.value, 10) || 0;
        render();
      }, 400));
      PCD.$('#eVenue', body).addEventListener('input', function () { data.venue = this.value; });
      PCD.$('#ePrice', body).addEventListener('input', PCD.debounce(function () {
        data.pricePerHead = parseFloat(this.value) || null;
        render();
      }, 400));
      PCD.$('#eBudget', body).addEventListener('input', function () { data.budget = parseFloat(this.value) || null; });
      PCD.$('#eStatus', body).addEventListener('change', function () { data.status = this.value; });
      PCD.$('#eNotes', body).addEventListener('input', function () { data.notes = this.value; });

      PCD.$('#addMenuBtn', body).addEventListener('click', function () {
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: t(r.category || 'cat_main') + ' · ' + (r.servings || 1) + 'p', thumb: r.photo || '' };
        });
        if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet')); return; }
        const selected = (data.menu || []).map(function (m) { return m.recipeId; });
        PCD.picker.open({
          title: t('event_add_recipes'),
          items: items, multi: true, selected: selected,
        }).then(function (selIds) {
          if (!selIds) return;
          const existingMap = {};
          (data.menu || []).forEach(function (m) { existingMap[m.recipeId] = m; });
          data.menu = selIds.map(function (id) {
            if (existingMap[id]) return existingMap[id];
            return { recipeId: id, portionsPerGuest: 1 };
          });
          render();
        });
      });

      PCD.on(body, 'input', '[data-pph]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-pph'), 10);
        data.menu[idx].portionsPerGuest = parseFloat(this.value) || 0;
        render();
      }, 400));

      PCD.on(body, 'click', '[data-rm-menu]', function () {
        const idx = parseInt(this.getAttribute('data-rm-menu'), 10);
        data.menu.splice(idx, 1);
        render();
      });

      PCD.$('#genShop', body).addEventListener('click', function () {
        if (!data.guestCount || !data.menu || data.menu.length === 0) {
          PCD.toast.warning('Set guest count and add recipes first');
          return;
        }
        // Build shopping list items from menu (convert per-guest to total portions)
        const items = (data.menu || []).map(function (m) {
          const r = PCD.store.getRecipe(m.recipeId);
          if (!r) return null;
          const totalPortions = Math.ceil((data.guestCount || 0) * (m.portionsPerGuest || 1));
          return { recipeId: m.recipeId, portions: totalPortions };
        }).filter(Boolean);
        const list = {
          name: (data.name || t('new_event')) + ' (' + data.guestCount + ' guests)',
          items: items,
          groupBy: 'category',
        };
        const saved = PCD.store.upsertInTable('shoppingLists', list, 's');
        PCD.toast.success(t('shop_saved'));
        setTimeout(function () { PCD.router.go('shopping'); }, 400);
      });
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
      title: existing ? (existing.name || t('untitled')) : t('new_event'),
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('events', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'events') render_list(v);
        }, 250);
      });
    });
    saveBtn.addEventListener('click', function () {
      if (!data.name || !data.name.trim()) { PCD.toast.error(t('event_name') + ' ' + t('required')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('events', data, 'ev');
      PCD.toast.success(t('event_saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'events') render_list(v);
      }, 250);
    });
  }

  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.events = { render: render, openEditor: openEditor };
})();
