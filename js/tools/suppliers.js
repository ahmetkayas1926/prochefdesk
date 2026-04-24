/* ================================================================
   ProChefDesk — suppliers.js
   Supplier contacts + quick order workflow.

   SCENARIO: Chef walks into storage, opens supplier card, types
   missing quantities next to ingredients, taps "Send Order" → picks
   WhatsApp / SMS / Email, message opens pre-filled with template.

   Data:
   - suppliers (table): { id, name, phone, email, whatsapp, category, notes }
   - Ingredients link to suppliers via ingredient.supplierId (or supplier field)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const CATS = ['Produce', 'Meat & Poultry', 'Seafood', 'Dairy', 'Dry Goods', 'Beverages', 'Cleaning', 'Other'];

  function render(view) {
    const t = PCD.i18n.t;
    const suppliers = PCD.store.listTable('suppliers').slice().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('suppliers_title') || 'Suppliers'}</div>
          <div class="page-subtitle">${t('suppliers_subtitle') || 'Quick order from your vendor directory'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newSupBtn">${PCD.icon('plus',16)} ${t('supplier_new') || 'Supplier'}</button>
        </div>
      </div>
      <div id="supList"></div>
    `;

    const listEl = PCD.$('#supList', view);

    if (suppliers.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${PCD.icon('truck',48)}</div>
          <div class="empty-title">${t('supplier_empty') || 'No suppliers yet'}</div>
          <div class="empty-desc">${t('supplier_empty_desc') || 'Add your regular suppliers and products for quick ordering from storage.'}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewBtn">${PCD.icon('plus',16)} ${t('supplier_new') || 'Add supplier'}</button></div>
        </div>
      `;
      PCD.$('#emptyNewBtn', listEl).addEventListener('click', function () { openEditor(); });
    } else {
      // Group by category
      const byCat = {};
      suppliers.forEach(function (s) {
        const c = s.category || 'Other';
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(s);
      });
      CATS.forEach(function (cat) {
        if (!byCat[cat]) return;
        const section = PCD.el('div', { style: { marginBottom: '20px' } });
        section.appendChild(PCD.el('div', {
          style: { fontSize: '12px', fontWeight: '700', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' },
          text: cat
        }));
        const grid = PCD.el('div', { class: 'flex flex-col gap-2' });
        byCat[cat].forEach(function (s) {
          const row = PCD.el('div', { class: 'card card-hover', 'data-sid': s.id, style: { padding: '12px' } });
          const productCount = getSupplierIngredients(s).length;
          row.innerHTML = `
            <div class="flex items-center gap-3">
              <div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">${PCD.icon('truck',20)}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:15px;letter-spacing:-0.01em;">${PCD.escapeHtml(s.name || 'Untitled')}</div>
                <div class="text-muted text-sm">
                  ${productCount} ${productCount === 1 ? 'product' : 'products'}
                  ${s.phone ? ' · ' + PCD.escapeHtml(s.phone) : ''}
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-order="${s.id}" onclick="event.stopPropagation();">${PCD.icon('send',14)} ${t('supplier_order') || 'Order'}</button>
            </div>
          `;
          grid.appendChild(row);
        });
        section.appendChild(grid);
        listEl.appendChild(section);
      });
    }

    PCD.$('#newSupBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-order]', function (e) {
      e.stopPropagation();
      openOrderSheet(this.getAttribute('data-order'));
    });
    PCD.on(listEl, 'click', '[data-sid]', function (e) {
      if (e.target.closest('[data-order]')) return;
      openEditor(this.getAttribute('data-sid'));
    });
  }

  // Get ingredients linked to this supplier (by supplierId or name match)
  function getSupplierIngredients(supplier) {
    if (!supplier) return [];
    const all = PCD.store.listIngredients();
    return all.filter(function (i) {
      if (i.supplierId && i.supplierId === supplier.id) return true;
      if (i.supplier && supplier.name && i.supplier.toLowerCase() === supplier.name.toLowerCase()) return true;
      return false;
    });
  }

  // ============ ORDER SHEET (warehouse scenario) ============
  function openOrderSheet(sid) {
    const t = PCD.i18n.t;
    const supplier = PCD.store.getFromTable('suppliers', sid);
    if (!supplier) return;
    const products = getSupplierIngredients(supplier);
    // Track quantities: { ingredientId: { amount, unit } }
    const quantities = {};
    products.forEach(function (p) { quantities[p.id] = { amount: '', unit: p.unit || 'kg' }; });

    const body = PCD.el('div');

    function renderBody() {
      const filled = Object.keys(quantities).filter(function (k) { return quantities[k].amount && parseFloat(quantities[k].amount) > 0; }).length;

      body.innerHTML = `
        <div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">
          <div style="font-weight:700;">${PCD.escapeHtml(supplier.name)}</div>
          <div class="text-muted text-sm">${filled} ${filled === 1 ? 'item' : 'items'} filled · ${products.length} total</div>
        </div>

        ${products.length === 0 ? `
          <div class="empty" style="padding:24px;">
            <div class="empty-desc">No products linked to this supplier yet.</div>
            <div class="empty-desc" style="margin-top:8px;font-size:13px;">Go to <strong>Ingredients</strong> and set the "Supplier" field to "${PCD.escapeHtml(supplier.name)}" for each product you buy from this vendor.</div>
          </div>
        ` : `
          <div class="flex flex-col gap-1" id="prodList"></div>
        `}
      `;

      const prodEl = PCD.$('#prodList', body);
      if (prodEl) {
        products.forEach(function (p, idx) {
          const q = quantities[p.id];
          const row = PCD.el('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: q.amount ? 'var(--brand-50)' : 'var(--surface)' }
          });
          row.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${PCD.escapeHtml(p.name)}</div>
              ${p.pricePerUnit ? '<div class="text-muted" style="font-size:11px;">' + PCD.fmtMoney(p.pricePerUnit) + '/' + p.unit + '</div>' : ''}
            </div>
            <input type="number" class="input" data-qty="${p.id}" value="${q.amount}" step="0.1" min="0" placeholder="0" style="width:70px;padding:6px 8px;min-height:34px;font-size:14px;text-align:center;font-weight:600;">
            <select class="select" data-unit="${p.id}" style="width:65px;padding:6px;min-height:34px;font-size:13px;">
              ${['kg','g','l','ml','pcs','box','case','bag'].map(function(u){return '<option value="'+u+'"'+(q.unit===u?' selected':'')+'>'+u+'</option>';}).join('')}
            </select>
          `;
          prodEl.appendChild(row);
        });
      }

      PCD.on(body, 'input', '[data-qty]', function () {
        const id = this.getAttribute('data-qty');
        if (quantities[id]) quantities[id].amount = this.value;
        // re-render row bg (light, don't rebuild)
        const filledNow = Object.keys(quantities).filter(function (k) { return quantities[k].amount && parseFloat(quantities[k].amount) > 0; }).length;
        const h = body.querySelector('.mb-3 .text-muted');
        if (h) h.textContent = filledNow + (filledNow === 1 ? ' item' : ' items') + ' filled · ' + products.length + ' total';
        // Row bg
        const row = this.parentNode;
        row.style.background = (this.value && parseFloat(this.value) > 0) ? 'var(--brand-50)' : 'var(--surface)';
      });
      PCD.on(body, 'change', '[data-unit]', function () {
        const id = this.getAttribute('data-unit');
        if (quantities[id]) quantities[id].unit = this.value;
      });
    }

    renderBody();

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const sendBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    sendBtn.innerHTML = PCD.icon('send',16) + ' <span>' + (t('supplier_send_order') || 'Send Order') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(sendBtn);

    const m = PCD.modal.open({
      title: (t('supplier_order') || 'Order') + ' · ' + supplier.name,
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    sendBtn.addEventListener('click', function () {
      const filled = products.filter(function (p) {
        const q = quantities[p.id];
        return q && q.amount && parseFloat(q.amount) > 0;
      });
      if (filled.length === 0) {
        PCD.toast.warning('Enter quantities for at least one product');
        return;
      }
      m.close();
      setTimeout(function () { openChannelPicker(supplier, filled, quantities); }, 150);
    });
  }

  // ============ CHANNEL PICKER (WA / SMS / Email) ============
  function openChannelPicker(supplier, items, quantities) {
    const t = PCD.i18n.t;
    // Build message template
    const user = PCD.store.get('user') || {};
    const date = PCD.fmtDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' });
    const lines = ['Order request — ' + date, '', 'Hi ' + (supplier.name || '') + ',', '', 'Please prepare the following:'];
    items.forEach(function (it) {
      const q = quantities[it.id];
      lines.push('• ' + it.name + ' — ' + q.amount + ' ' + q.unit);
    });
    lines.push('');
    lines.push('Thanks,');
    lines.push(user.name || user.email || '');
    const message = lines.join('\n');

    const body = PCD.el('div');

    // Preview + channel buttons
    const phoneClean = (supplier.phone || '').replace(/\D/g, '');
    const waNumber = (supplier.whatsapp || supplier.phone || '').replace(/\D/g, '');
    const email = supplier.email || '';

    body.innerHTML = `
      <div class="mb-3">
        <label class="field-label" style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">Message preview</label>
        <textarea class="textarea" id="orderMsg" rows="10" style="font-family:var(--font-mono);font-size:13px;white-space:pre;">${PCD.escapeHtml(message)}</textarea>
        <div class="text-muted text-sm mt-1">${items.length} items · Edit above if needed</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <button class="btn btn-outline" id="sendWa" ${!waNumber ? 'disabled' : ''} style="flex-direction:column;height:auto;padding:14px 8px;gap:6px;">
          <div style="color:#25D366;">${PCD.icon('message-circle', 24)}</div>
          <div style="font-weight:600;font-size:13px;">WhatsApp</div>
          ${!waNumber ? '<div class="text-muted" style="font-size:10px;">No number</div>' : ''}
        </button>
        <button class="btn btn-outline" id="sendSms" ${!phoneClean ? 'disabled' : ''} style="flex-direction:column;height:auto;padding:14px 8px;gap:6px;">
          <div style="color:var(--brand-600);">${PCD.icon('phone', 24)}</div>
          <div style="font-weight:600;font-size:13px;">SMS</div>
          ${!phoneClean ? '<div class="text-muted" style="font-size:10px;">No number</div>' : ''}
        </button>
        <button class="btn btn-outline" id="sendEmail" ${!email ? 'disabled' : ''} style="flex-direction:column;height:auto;padding:14px 8px;gap:6px;">
          <div style="color:#EA4335;">${PCD.icon('mail', 24)}</div>
          <div style="font-weight:600;font-size:13px;">Email</div>
          ${!email ? '<div class="text-muted" style="font-size:10px;">No email</div>' : ''}
        </button>
      </div>
    `;

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(cancelBtn);

    const m = PCD.modal.open({
      title: 'Send Order',
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });

    function currentMsg() {
      return PCD.$('#orderMsg', body).value;
    }

    const waBtn = PCD.$('#sendWa', body);
    if (waBtn && !waBtn.disabled) waBtn.addEventListener('click', function () {
      const url = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(currentMsg());
      window.open(url, '_blank');
      m.close();
    });
    const smsBtn = PCD.$('#sendSms', body);
    if (smsBtn && !smsBtn.disabled) smsBtn.addEventListener('click', function () {
      const url = 'sms:' + supplier.phone + '?&body=' + encodeURIComponent(currentMsg());
      window.location.href = url;
      m.close();
    });
    const emailBtn = PCD.$('#sendEmail', body);
    if (emailBtn && !emailBtn.disabled) emailBtn.addEventListener('click', function () {
      const subject = 'Order request — ' + PCD.fmtDate(new Date(), { month: 'short', day: 'numeric' });
      const url = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(currentMsg());
      window.location.href = url;
      m.close();
    });
  }

  // ============ SUPPLIER EDITOR ============
  function openEditor(sid) {
    const t = PCD.i18n.t;
    const existing = sid ? PCD.store.getFromTable('suppliers', sid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', category: 'Other', phone: '', whatsapp: '', email: '', notes: ''
    };

    const body = PCD.el('div');

    body.innerHTML = `
      <div class="field">
        <label class="field-label">${t('supplier_name') || 'Name'} *</label>
        <input type="text" class="input" id="sName" value="${PCD.escapeHtml(data.name || '')}" placeholder="e.g. Perth Fresh Produce">
      </div>
      <div class="field">
        <label class="field-label">${t('supplier_category') || 'Category'}</label>
        <select class="select" id="sCat">
          ${CATS.map(function (c) { return '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">${t('supplier_phone') || 'Phone'}</label>
          <input type="tel" class="input" id="sPhone" value="${PCD.escapeHtml(data.phone || '')}" placeholder="+61 ...">
        </div>
        <div class="field">
          <label class="field-label">${t('supplier_whatsapp') || 'WhatsApp'}</label>
          <input type="tel" class="input" id="sWa" value="${PCD.escapeHtml(data.whatsapp || '')}" placeholder="${t('supplier_wa_hint') || 'Leave empty to use phone'}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">${t('supplier_email') || 'Email'}</label>
        <input type="email" class="input" id="sEmail" value="${PCD.escapeHtml(data.email || '')}" placeholder="orders@supplier.com">
      </div>
      <div class="field">
        <label class="field-label">${t('supplier_notes') || 'Notes'}</label>
        <textarea class="textarea" id="sNotes" rows="2" placeholder="Delivery days, minimum order, etc.">${PCD.escapeHtml(data.notes || '')}</textarea>
      </div>
      ${existing ? `
        <div class="mb-2" style="padding:10px;background:var(--surface-2);border-radius:var(--r-sm);">
          <div style="font-size:12px;font-weight:600;color:var(--text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">Linked products</div>
          <div class="text-muted text-sm">${getSupplierIngredients(data).length} ingredients currently set to this supplier. Edit ingredient's "Supplier" field in the Ingredients section to link more.</div>
        </div>
      ` : ''}
    `;

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || 'Supplier') : (t('supplier_new') || 'New Supplier'),
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
          if (PCD.router.currentView() === 'suppliers') render(v);
        }, 150);
      });
    });
    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#sName', body).value || '').trim();
      if (!data.name) { PCD.toast.error('Name required'); return; }
      data.category = PCD.$('#sCat', body).value;
      data.phone = PCD.$('#sPhone', body).value.trim();
      data.whatsapp = PCD.$('#sWa', body).value.trim();
      data.email = PCD.$('#sEmail', body).value.trim();
      data.notes = PCD.$('#sNotes', body).value.trim();
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('suppliers', data, 'sup');
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'suppliers') render(v);
      }, 150);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.suppliers = { render: render, openEditor: openEditor };
})();
