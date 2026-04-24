/* ================================================================
   ProChefDesk — suppliers.js (v1.4.1 - rewrite)

   WAREHOUSE SCENARIO:
   - Each supplier has a list of products (added manually)
   - Chef opens supplier → sees full product list with quantity inputs
   - Fills what they need, taps Send Order
   - Picks delivery date (Today / Tomorrow / Custom)
   - Template message generated and opens in WhatsApp / SMS / Email

   DATA MODEL:
   - suppliers table: {
       id, name, category,
       phone, whatsapp, email, notes,
       products: [{ id, name, unit }]   // manually entered by chef
     }
   - When a product is added to a supplier, we also upsert it to the
     Ingredients table (pricePerUnit=0 if new) so it can be used in
     recipes later. Same-name ingredients are linked, not duplicated.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const CATS = ['Produce', 'Meat & Poultry', 'Seafood', 'Dairy', 'Dry Goods', 'Beverages', 'Cleaning', 'Other'];
  const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'case', 'bag', 'bunch', 'tray'];

  // ============ MAIN LIST VIEW ============
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
          <button class="btn btn-primary" id="newSupBtn">${PCD.icon('plus',16)} ${t('supplier_new') || 'New Supplier'}</button>
        </div>
      </div>
      <div id="supList"></div>
    `;

    const listEl = PCD.$('#supList', view);

    if (suppliers.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('truck',48)}</div>
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
          const productCount = (s.products || []).length;
          const row = PCD.el('div', { class: 'card card-hover', 'data-sid': s.id, style: { padding: '12px' } });
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

  // ============ ORDER SHEET (warehouse scenario) ============
  function openOrderSheet(sid) {
    const t = PCD.i18n.t;
    const supplier = PCD.store.getFromTable('suppliers', sid);
    if (!supplier) return;
    // Clone products list; track quantities per product
    const products = (supplier.products || []).slice();
    const quantities = {};
    products.forEach(function (p) { quantities[p.id] = { amount: '', unit: p.unit || 'kg' }; });

    const body = PCD.el('div');

    function updateRowBg(inputEl) {
      const row = inputEl.closest('[data-prow]');
      if (row) row.style.background = (inputEl.value && parseFloat(inputEl.value) > 0) ? 'var(--brand-50)' : 'var(--surface)';
    }

    function renderBody() {
      const filled = Object.keys(quantities).filter(function (k) { return quantities[k].amount && parseFloat(quantities[k].amount) > 0; }).length;

      body.innerHTML = `
        <div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">
          <div style="font-weight:700;">${PCD.escapeHtml(supplier.name)}</div>
          <div class="text-muted text-sm" id="filledHint">${filled} ${filled === 1 ? 'item' : 'items'} filled · ${products.length} total</div>
        </div>

        ${products.length === 0 ? `
          <div class="empty" style="padding:24px;">
            <div class="empty-desc">No products in this supplier's list yet.</div>
            <div class="empty-desc" style="margin-top:8px;font-size:13px;">Tap the supplier card to edit and add products they carry.</div>
          </div>
        ` : `
          <div class="flex flex-col gap-1" id="prodList"></div>
          <button class="btn btn-ghost btn-sm mt-2" id="quickAddBtn" style="width:100%;">${PCD.icon('plus',14)} Add product on the fly</button>
        `}
      `;

      const prodEl = PCD.$('#prodList', body);
      if (prodEl) {
        products.forEach(function (p) {
          const q = quantities[p.id];
          const row = PCD.el('div', {
            'data-prow': p.id,
            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: (q.amount && parseFloat(q.amount) > 0) ? 'var(--brand-50)' : 'var(--surface)' }
          });
          row.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${PCD.escapeHtml(p.name)}</div>
            </div>
            <input type="number" class="input" data-qty="${p.id}" value="${q.amount}" step="0.1" min="0" placeholder="0" style="width:70px;padding:6px 8px;min-height:34px;font-size:14px;text-align:center;font-weight:600;">
            <select class="select" data-unit="${p.id}" style="width:65px;padding:6px;min-height:34px;font-size:13px;">
              ${UNITS.map(function(u){return '<option value="'+u+'"'+(q.unit===u?' selected':'')+'>'+u+'</option>';}).join('')}
            </select>
          `;
          prodEl.appendChild(row);
        });
      }

      // Wire quick add
      const quickAddBtn = PCD.$('#quickAddBtn', body);
      if (quickAddBtn) quickAddBtn.addEventListener('click', function () { quickAddProduct(supplier, products, quantities, renderBody); });
    }

    renderBody();

    // Live input handlers
    PCD.on(body, 'input', '[data-qty]', function () {
      const id = this.getAttribute('data-qty');
      if (quantities[id]) quantities[id].amount = this.value;
      updateRowBg(this);
      // update filled count
      const filled = Object.keys(quantities).filter(function (k) { return quantities[k].amount && parseFloat(quantities[k].amount) > 0; }).length;
      const hint = PCD.$('#filledHint', body);
      if (hint) hint.textContent = filled + (filled === 1 ? ' item' : ' items') + ' filled · ' + products.length + ' total';
    });
    PCD.on(body, 'change', '[data-unit]', function () {
      const id = this.getAttribute('data-unit');
      if (quantities[id]) quantities[id].unit = this.value;
    });

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const nextBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    nextBtn.innerHTML = PCD.icon('send', 16) + ' <span>Next: Delivery date</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(nextBtn);

    const m = PCD.modal.open({
      title: (t('supplier_order') || 'Order') + ' · ' + supplier.name,
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    nextBtn.addEventListener('click', function () {
      const filled = products.filter(function (p) {
        const q = quantities[p.id];
        return q && q.amount && parseFloat(q.amount) > 0;
      });
      if (filled.length === 0) {
        PCD.toast.warning('Enter quantities for at least one product');
        return;
      }
      m.close();
      setTimeout(function () { openDeliveryDatePicker(supplier, filled, quantities); }, 200);
    });
  }

  // ============ QUICK ADD PRODUCT (on-the-fly during order) ============
  function quickAddProduct(supplier, products, quantities, rerender) {
    const body = PCD.el('div');
    body.innerHTML = `
      <div class="field">
        <label class="field-label">Product name *</label>
        <input type="text" class="input" id="qpName" placeholder="e.g. Tomato">
      </div>
      <div class="field">
        <label class="field-label">Unit</label>
        <select class="select" id="qpUnit">
          ${UNITS.map(function(u){return '<option value="'+u+'">'+u+'</option>';}).join('')}
        </select>
      </div>
    `;
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: 'Add', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({ title: 'Quick add', body: body, footer: footer, size: 'sm', closable: true });
    setTimeout(function () { const i = PCD.$('#qpName', body); if (i) i.focus(); }, 50);
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      const name = (PCD.$('#qpName', body).value || '').trim();
      const unit = PCD.$('#qpUnit', body).value;
      if (!name) { PCD.toast.error('Name required'); return; }
      const id = PCD.uid('p');
      const newProduct = { id: id, name: name, unit: unit };
      // Persist to supplier
      supplier.products = (supplier.products || []).concat([newProduct]);
      PCD.store.upsertInTable('suppliers', supplier, 'sup');
      // Also upsert as ingredient
      syncProductToIngredients(name, unit);
      // Push to current local arrays
      products.push(newProduct);
      quantities[id] = { amount: '', unit: unit };
      m.close();
      setTimeout(rerender, 150);
    });
  }

  // ============ DELIVERY DATE PICKER ============
  function openDeliveryDatePicker(supplier, items, quantities) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');

    // Default: tomorrow
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);

    function iso(d) { return d.toISOString().slice(0, 10); }
    function dayName(d) {
      const opts = { weekday: 'short', month: 'short', day: 'numeric' };
      return d.toLocaleDateString(PCD.i18n.getLocale ? PCD.i18n.getLocale() : 'en', opts);
    }

    let selectedDate = iso(tomorrow);

    body.innerHTML = `
      <div style="font-weight:600;margin-bottom:12px;">Delivery date</div>
      <div class="flex flex-col gap-2">
        <label class="card card-hover" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;" data-preset="${iso(tomorrow)}">
          <input type="radio" name="dlvDate" value="${iso(tomorrow)}" checked style="accent-color:var(--brand-600);">
          <div style="flex:1;">
            <div style="font-weight:600;">Tomorrow</div>
            <div class="text-muted text-sm">${dayName(tomorrow)}</div>
          </div>
        </label>
        <label class="card card-hover" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;" data-preset="${iso(dayAfter)}">
          <input type="radio" name="dlvDate" value="${iso(dayAfter)}" style="accent-color:var(--brand-600);">
          <div style="flex:1;">
            <div style="font-weight:600;">Day after tomorrow</div>
            <div class="text-muted text-sm">${dayName(dayAfter)}</div>
          </div>
        </label>
        <label class="card" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;" data-preset="custom">
          <input type="radio" name="dlvDate" value="custom" style="accent-color:var(--brand-600);">
          <div style="flex:1;">
            <div style="font-weight:600;">Custom date</div>
            <input type="date" class="input mt-1" id="customDate" min="${iso(new Date())}" style="padding:6px 8px;font-size:13px;">
          </div>
        </label>
      </div>

      <div class="field mt-3">
        <label class="field-label">Additional notes (optional)</label>
        <input type="text" class="input" id="orderNotes" placeholder="e.g. Before 10am, back entrance">
      </div>
    `;

    PCD.on(body, 'change', 'input[name=dlvDate]', function () {
      if (this.value === 'custom') {
        const cd = PCD.$('#customDate', body).value;
        selectedDate = cd || iso(tomorrow);
      } else {
        selectedDate = this.value;
      }
    });
    PCD.$('#customDate', body).addEventListener('change', function () {
      // Auto-select custom radio when user picks a date
      const r = body.querySelector('input[name=dlvDate][value=custom]');
      if (r) r.checked = true;
      selectedDate = this.value;
    });

    const backBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_back') });
    const sendBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    sendBtn.innerHTML = PCD.icon('send', 16) + ' <span>Send Order</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(backBtn);
    footer.appendChild(sendBtn);

    const m = PCD.modal.open({
      title: 'Delivery date · ' + supplier.name,
      body: body, footer: footer, size: 'sm', closable: true
    });

    backBtn.addEventListener('click', function () {
      m.close();
      // Go back to order sheet with same quantities — fresh call, loses state intentionally
      setTimeout(function () { openOrderSheet(supplier.id); }, 200);
    });
    sendBtn.addEventListener('click', function () {
      const notes = PCD.$('#orderNotes', body).value.trim();
      m.close();
      setTimeout(function () { openChannelPicker(supplier, items, quantities, selectedDate, notes); }, 200);
    });
  }

  // ============ CHANNEL PICKER (WA / SMS / Email) ============
  function openChannelPicker(supplier, items, quantities, deliveryDate, notes) {
    const t = PCD.i18n.t;
    const user = PCD.store.get('user') || {};
    const userName = user.name || user.email || '';

    // Format date nicely
    const dateObj = new Date(deliveryDate);
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Build message
    const lines = [];
    lines.push('Hi ' + (supplier.name || 'team') + ',');
    lines.push('');
    lines.push('I would like to place an order for delivery on ' + dateStr + ':');
    lines.push('');
    items.forEach(function (it) {
      const q = quantities[it.id];
      lines.push('• ' + it.name + ' — ' + q.amount + ' ' + q.unit);
    });
    if (notes) {
      lines.push('');
      lines.push('Notes: ' + notes);
    }
    lines.push('');
    lines.push('Thanks,');
    lines.push('Best regards,');
    if (userName) lines.push(userName);
    const message = lines.join('\n');

    const body = PCD.el('div');
    const phoneClean = (supplier.phone || '').replace(/\D/g, '');
    const waNumber = (supplier.whatsapp || supplier.phone || '').replace(/\D/g, '');
    const email = supplier.email || '';

    body.innerHTML = `
      <div class="mb-3">
        <label class="field-label" style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">Message preview · editable</label>
        <textarea class="textarea" id="orderMsg" rows="12" style="font-family:var(--font-mono);font-size:13px;white-space:pre;">${PCD.escapeHtml(message)}</textarea>
        <div class="text-muted text-sm mt-1">${items.length} items · Delivery: ${dateStr}</div>
      </div>

      <div style="font-weight:600;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Choose channel</div>
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

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const copyBtn = PCD.el('button', { class: 'btn btn-outline' });
    copyBtn.innerHTML = PCD.icon('copy', 14) + ' <span>Copy</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(copyBtn);

    const m = PCD.modal.open({
      title: 'Send Order', body: body, footer: footer, size: 'md', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    copyBtn.addEventListener('click', function () {
      const msg = PCD.$('#orderMsg', body).value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(function () { PCD.toast.success('Copied'); });
      }
    });

    function currentMsg() { return PCD.$('#orderMsg', body).value; }

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
      const subject = 'Order · delivery ' + new Date(deliveryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const url = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(currentMsg());
      window.location.href = url;
      m.close();
    });
  }

  // ============ SUPPLIER EDITOR (with products list) ============
  function openEditor(sid) {
    const t = PCD.i18n.t;
    const existing = sid ? PCD.store.getFromTable('suppliers', sid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', category: 'Other', phone: '', whatsapp: '', email: '', notes: '',
      products: [],
    };
    if (!data.products) data.products = [];

    const body = PCD.el('div');

    function renderEditor() {
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
          <textarea class="textarea" id="sNotes" rows="2" placeholder="Delivery days, min order, etc.">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>

        <div class="section-title mt-4 mb-2" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">Products (${data.products.length})</div>
        <div class="text-muted text-sm mb-2">List the products you buy from this supplier. They will appear in the Order sheet for quick ordering.</div>
        <div id="productsList" class="flex flex-col gap-1"></div>
        <button class="btn btn-ghost btn-sm mt-2" id="addProdBtn" style="width:100%;">${PCD.icon('plus', 14)} Add product</button>
      `;

      const listEl = PCD.$('#productsList', body);
      data.products.forEach(function (p, idx) {
        const row = PCD.el('div', {
          style: { display: 'flex', gap: '6px', alignItems: 'center' }
        });
        row.innerHTML = `
          <input type="text" class="input" data-pname="${idx}" value="${PCD.escapeHtml(p.name || '')}" placeholder="Product name" style="flex:1;">
          <select class="select" data-punit="${idx}" style="width:75px;">
            ${UNITS.map(function(u){return '<option value="'+u+'"'+(p.unit===u?' selected':'')+'>'+u+'</option>';}).join('')}
          </select>
          <button class="icon-btn" data-pdel="${idx}">${PCD.icon('x', 16)}</button>
        `;
        listEl.appendChild(row);
      });

      // Header inputs
      PCD.$('#sName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#sCat', body).addEventListener('change', function () { data.category = this.value; });
      PCD.$('#sPhone', body).addEventListener('input', function () { data.phone = this.value; });
      PCD.$('#sWa', body).addEventListener('input', function () { data.whatsapp = this.value; });
      PCD.$('#sEmail', body).addEventListener('input', function () { data.email = this.value; });
      PCD.$('#sNotes', body).addEventListener('input', function () { data.notes = this.value; });

      // Products
      PCD.$('#addProdBtn', body).addEventListener('click', function () {
        data.products.push({ id: PCD.uid('p'), name: '', unit: 'kg' });
        renderEditor();
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-pname]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      PCD.on(body, 'input', '[data-pname]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-pname'), 10);
        if (data.products[idx]) data.products[idx].name = this.value;
      }, 300));
      PCD.on(body, 'change', '[data-punit]', function () {
        const idx = parseInt(this.getAttribute('data-punit'), 10);
        if (data.products[idx]) data.products[idx].unit = this.value;
      });
      PCD.on(body, 'click', '[data-pdel]', function () {
        const idx = parseInt(this.getAttribute('data-pdel'), 10);
        data.products.splice(idx, 1);
        renderEditor();
      });
    }

    renderEditor();

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
      const name = (PCD.$('#sName', body).value || '').trim();
      if (!name) { PCD.toast.error('Name required'); return; }
      data.name = name;
      // Filter empty products and ensure IDs
      data.products = (data.products || []).filter(function (p) { return p.name && p.name.trim(); }).map(function (p) {
        if (!p.id) p.id = PCD.uid('p');
        p.name = p.name.trim();
        return p;
      });
      if (existing) data.id = existing.id;
      const saved = PCD.store.upsertInTable('suppliers', data, 'sup');
      // Sync products to Ingredients table
      let synced = 0;
      data.products.forEach(function (p) {
        if (syncProductToIngredients(p.name, p.unit)) synced++;
      });
      PCD.toast.success(t('saved') + (synced > 0 ? ' · ' + synced + ' product' + (synced === 1 ? '' : 's') + ' linked to ingredients' : ''));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'suppliers') render(v);
      }, 150);
    });
  }

  // ============ SYNC PRODUCT TO INGREDIENTS ============
  // If same-name ingredient exists → no-op (keep existing data).
  // If not → add with pricePerUnit=0 so chef can fill in later.
  function syncProductToIngredients(name, unit) {
    if (!name) return false;
    const existing = PCD.store.listIngredients().find(function (i) {
      return (i.name || '').toLowerCase() === name.toLowerCase();
    });
    if (existing) return false; // don't overwrite
    PCD.store.upsertIngredient({
      name: name,
      unit: unit || 'kg',
      pricePerUnit: 0,
      category: 'cat_other',
    });
    return true;
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.suppliers = { render: render, openEditor: openEditor };
})();
