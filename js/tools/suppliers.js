/* ================================================================
   ProChefDesk — suppliers.js
   Supplier/vendor contact management.
   Features:
   - Add/edit suppliers with contact info, delivery days, categories
   - Click-to-call (tel:), click-to-email (mailto:), click-to-website
   - Linked ingredients auto-detected from ingredient.supplier field
   - Delivery day chips (Mon-Sun)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const ING_CATEGORIES = ['cat_meat', 'cat_poultry', 'cat_seafood', 'cat_dairy', 'cat_produce', 'cat_dry_goods', 'cat_spices', 'cat_oils', 'cat_beverages', 'cat_baking', 'cat_other'];

  function render(view) {
    const t = PCD.i18n.t;
    const suppliers = PCD.store.listTable('suppliers').sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('suppliers_title')}</div>
          <div class="page-subtitle">${suppliers.length} ${suppliers.length === 1 ? 'supplier' : 'suppliers'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newSupBtn">+ ${t('new_supplier')}</button>
        </div>
      </div>
      <div id="supList"></div>
    `;

    const listEl = PCD.$('#supList', view);
    if (suppliers.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🚚</div>
          <div class="empty-title">${t('supplier_empty')}</div>
          <div class="empty-desc">${t('supplier_empty_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewSup">+ ${t('new_supplier')}</button></div>
        </div>
      `;
      PCD.$('#emptyNewSup', listEl).addEventListener('click', function () { openEditor(); });
    } else {
      // Count linked ingredients per supplier name
      const ingCounts = {};
      PCD.store.listIngredients().forEach(function (i) {
        if (i.supplier) {
          const key = i.supplier.toLowerCase();
          ingCounts[key] = (ingCounts[key] || 0) + 1;
        }
      });

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      suppliers.forEach(function (s) {
        const row = PCD.el('div', { class: 'card card-hover', 'data-sid': s.id, style: { padding: '12px' } });
        const ingCount = s.name ? (ingCounts[s.name.toLowerCase()] || 0) : 0;
        const daysChips = DAYS.filter(function (d) { return s.deliveryDays && s.deliveryDays[d]; })
          .map(function (d) { return '<span class="chip chip-brand">' + PCD.i18n.t('day_' + d) + '</span>'; })
          .join(' ');

        row.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">${PCD.escapeHtml(s.name || PCD.i18n.t('untitled'))}</div>
              ${s.contactPerson ? '<div class="text-muted text-sm">' + PCD.escapeHtml(s.contactPerson) + '</div>' : ''}
            </div>
            <span class="chip">${t('supplier_items_count').replace('{n}', ingCount)}</span>
          </div>

          ${daysChips ? '<div class="mb-2" style="display:flex;gap:4px;flex-wrap:wrap;">' + daysChips + '</div>' : ''}

          <div class="flex gap-2" style="flex-wrap:wrap;">
            ${s.phone ? '<a href="tel:' + PCD.escapeHtml(s.phone) + '" class="btn btn-outline btn-sm" onclick="event.stopPropagation();">📞 ' + t('supplier_call') + '</a>' : ''}
            ${s.email ? '<a href="mailto:' + PCD.escapeHtml(s.email) + '" class="btn btn-outline btn-sm" onclick="event.stopPropagation();">✉️ ' + t('supplier_send_email') + '</a>' : ''}
            ${s.website ? '<a href="' + PCD.escapeHtml(s.website) + '" target="_blank" rel="noopener" class="btn btn-outline btn-sm" onclick="event.stopPropagation();">🌐 Web</a>' : ''}
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newSupBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-sid]', function (e) {
      if (e.target.closest('a')) return; // allow tel:/mailto: links
      openEditor(this.getAttribute('data-sid'));
    });
  }

  function openEditor(sid) {
    const t = PCD.i18n.t;
    const existing = sid ? PCD.store.getFromTable('suppliers', sid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', contactPerson: '', phone: '', email: '', website: '',
      address: '', notes: '',
      deliveryDays: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false },
      minOrder: null, leadTimeHours: null,
      categories: [],
    };
    if (!data.deliveryDays) data.deliveryDays = { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false };
    if (!data.categories) data.categories = [];

    const body = PCD.el('div');

    function render() {
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('supplier_name')} *</label>
          <input type="text" class="input" id="sName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('supplier_name_ph')}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('supplier_contact')}</label>
            <input type="text" class="input" id="sContact" value="${PCD.escapeHtml(data.contactPerson || '')}">
          </div>
          <div class="field">
            <label class="field-label">${t('supplier_phone')}</label>
            <input type="tel" class="input" id="sPhone" value="${PCD.escapeHtml(data.phone || '')}" placeholder="+61 4...">
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('supplier_email')}</label>
            <input type="email" class="input" id="sEmail" value="${PCD.escapeHtml(data.email || '')}">
          </div>
          <div class="field">
            <label class="field-label">${t('supplier_website')}</label>
            <input type="url" class="input" id="sWebsite" value="${PCD.escapeHtml(data.website || '')}" placeholder="https://">
          </div>
        </div>

        <div class="field">
          <label class="field-label">${t('supplier_address')}</label>
          <input type="text" class="input" id="sAddress" value="${PCD.escapeHtml(data.address || '')}">
        </div>

        <div class="field">
          <label class="field-label">${t('supplier_delivery_days')}</label>
          <div class="flex gap-1" style="flex-wrap:wrap;">
            ${DAYS.map(function (d) {
              return '<button type="button" class="chip' + (data.deliveryDays[d] ? ' chip-brand' : '') + '" data-day="' + d + '" style="cursor:pointer;padding:6px 12px;font-size:13px;">' + t('day_' + d) + '</button>';
            }).join('')}
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('supplier_min_order')}</label>
            <input type="number" class="input" id="sMinOrder" value="${data.minOrder || ''}" step="0.01" min="0">
          </div>
          <div class="field">
            <label class="field-label">${t('supplier_lead_time')}</label>
            <input type="number" class="input" id="sLeadTime" value="${data.leadTimeHours || ''}" min="0">
          </div>
        </div>

        <div class="field">
          <label class="field-label">${t('supplier_categories')}</label>
          <div class="flex gap-1" style="flex-wrap:wrap;">
            ${ING_CATEGORIES.map(function (c) {
              const on = (data.categories || []).indexOf(c) >= 0;
              return '<button type="button" class="chip' + (on ? ' chip-brand' : '') + '" data-cat="' + c + '" style="cursor:pointer;padding:6px 12px;font-size:13px;">' + t(c) + '</button>';
            }).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">${t('supplier_notes')}</label>
          <textarea class="textarea" id="sNotes" rows="2">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>
      `;

      PCD.on(body, 'click', '[data-day]', function () {
        const d = this.getAttribute('data-day');
        data.deliveryDays[d] = !data.deliveryDays[d];
        this.classList.toggle('chip-brand');
      });
      PCD.on(body, 'click', '[data-cat]', function () {
        const c = this.getAttribute('data-cat');
        const idx = data.categories.indexOf(c);
        if (idx >= 0) data.categories.splice(idx, 1);
        else data.categories.push(c);
        this.classList.toggle('chip-brand');
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
      title: existing ? (existing.name || t('untitled')) : t('new_supplier'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('suppliers', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'suppliers') render_list(v);
        }, 250);
      });
    });
    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#sName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(t('supplier_name') + ' ' + t('required')); return; }
      data.contactPerson = PCD.$('#sContact', body).value.trim();
      data.phone = PCD.$('#sPhone', body).value.trim();
      data.email = PCD.$('#sEmail', body).value.trim();
      data.website = PCD.$('#sWebsite', body).value.trim();
      data.address = PCD.$('#sAddress', body).value.trim();
      data.notes = PCD.$('#sNotes', body).value.trim();
      data.minOrder = parseFloat(PCD.$('#sMinOrder', body).value) || null;
      data.leadTimeHours = parseFloat(PCD.$('#sLeadTime', body).value) || null;

      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('suppliers', data, 'sup');
      PCD.toast.success(t('supplier_saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'suppliers') render_list(v);
      }, 250);
    });
  }

  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.suppliers = { render: render, openEditor: openEditor };
})();
