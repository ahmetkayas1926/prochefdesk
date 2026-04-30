/* ================================================================
   ProChefDesk — suppliers.js (v1.9 - inline UX)

   USER FLOW (simplified per your feedback):
   - Supplier list page shows ALL suppliers expanded
   - Under each supplier name: their products as a list
   - Each product has a quantity input next to its name
   - One "Send Order" button at the supplier card top-right
   - Tap Send → if contact exists, opens directly (WhatsApp/SMS/Email)
   - If no contact → "Share via" sheet (WhatsApp / SMS / Gmail / Copy)
   - Editor still available via tap on supplier header
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const CATS = ['Produce', 'Meat & Poultry', 'Seafood', 'Dairy', 'Dry Goods', 'Beverages', 'Cleaning', 'Other'];
  const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'case', 'bag', 'bunch', 'tray'];

  // In-memory quantities — keyed by supplierId then productId
  // Persists during the session, reset on page reload (intentional)
  const draftQty = {};

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
          <div class="empty-desc">Add your suppliers and the products you buy from each. Quantities, send orders — all from one screen.</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewBtn">${PCD.icon('plus',16)} Add supplier</button></div>
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
        const grid = PCD.el('div', { class: 'flex flex-col gap-3' });
        byCat[cat].forEach(function (s) {
          grid.appendChild(buildSupplierCard(s));
        });
        section.appendChild(grid);
        listEl.appendChild(section);
      });
    }

    PCD.$('#newSupBtn', view).addEventListener('click', function () { openEditor(); });

    // Wire actions via delegation
    PCD.on(listEl, 'click', '[data-edit-sup]', function (e) {
      e.stopPropagation();
      openEditor(this.getAttribute('data-edit-sup'));
    });
    PCD.on(listEl, 'click', '[data-send-sup]', function (e) {
      e.stopPropagation();
      sendOrderFlow(this.getAttribute('data-send-sup'));
    });
    PCD.on(listEl, 'input', '[data-pqty]', function () {
      const sid = this.getAttribute('data-sid');
      const pid = this.getAttribute('data-pqty');
      if (!draftQty[sid]) draftQty[sid] = {};
      draftQty[sid][pid] = this.value;
      // Visual feedback
      const row = this.closest('[data-prow]');
      if (row) row.style.background = (this.value && parseFloat(this.value) > 0) ? 'var(--brand-50)' : 'var(--surface)';
      // Update count
      const card = this.closest('[data-sid-card]');
      if (card) updateFilledCount(card, sid);
    });
    PCD.on(listEl, 'change', '[data-punit]', function () {
      const sid = this.getAttribute('data-sid');
      const pid = this.getAttribute('data-punit');
      if (!draftQty[sid]) draftQty[sid] = {};
      // Store unit override under special key
      draftQty[sid]['_unit_' + pid] = this.value;
    });
  }

  function buildSupplierCard(s) {
    const t = PCD.i18n.t;
    const card = PCD.el('div', {
      class: 'card',
      'data-sid-card': s.id,
      style: { padding: '14px', overflow: 'hidden' }
    });
    const products = s.products || [];

    // Header — name + edit + send
    const filled = countFilled(s.id, products);
    const header = PCD.el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: products.length ? '10px' : '0' } });
    header.innerHTML =
      '<div style="width:40px;height:40px;border-radius:8px;background:var(--brand-50);color:var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('truck', 22) + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:15px;letter-spacing:-0.01em;">' + PCD.escapeHtml(s.name || 'Untitled') + '</div>' +
        '<div class="text-muted" style="font-size:12px;" data-filled-count="' + s.id + '">' +
          products.length + ' ' + (products.length === 1 ? 'product' : 'products') +
          (filled > 0 ? ' · <span style="color:var(--brand-700);font-weight:700;">' + filled + ' to order</span>' : '') +
        '</div>' +
      '</div>' +
      '<button class="icon-btn" data-edit-sup="' + s.id + '" title="Edit" style="flex-shrink:0;">' + PCD.icon('edit', 18) + '</button>' +
      (products.length > 0 ? '<button class="btn btn-primary btn-sm" data-send-sup="' + s.id + '" style="flex-shrink:0;">' + PCD.icon('send', 14) + ' Send' + (filled > 0 ? ' (' + filled + ')' : '') + '</button>' : '');
    card.appendChild(header);

    // Products list inline
    if (products.length > 0) {
      const list = PCD.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      products.forEach(function (p) {
        const q = (draftQty[s.id] && draftQty[s.id][p.id]) || '';
        const customUnit = (draftQty[s.id] && draftQty[s.id]['_unit_' + p.id]) || p.unit || 'kg';
        const row = PCD.el('div', {
          'data-prow': p.id,
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            background: (q && parseFloat(q) > 0) ? 'var(--brand-50)' : 'var(--surface)'
          }
        });
        row.innerHTML =
          '<div style="flex:1;min-width:0;font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(p.name) + '</div>' +
          '<input type="number" class="input" data-pqty="' + p.id + '" data-sid="' + s.id + '" value="' + PCD.escapeHtml(q) + '" step="0.1" min="0" placeholder="0" style="width:70px;text-align:center;font-weight:600;font-family:var(--font-mono);padding:4px 8px;min-height:32px;">' +
          '<select class="select" data-punit="' + p.id + '" data-sid="' + s.id + '" style="width:65px;padding:4px 6px;min-height:32px;font-size:12px;flex-shrink:0;">' +
            UNITS.map(function (u) { return '<option value="' + u + '"' + (customUnit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') +
          '</select>';
        list.appendChild(row);
      });
      card.appendChild(list);
    } else {
      const noProducts = PCD.el('div', {
        class: 'text-muted text-sm',
        style: { padding: '8px 0', fontSize: '13px', fontStyle: 'italic' },
        text: t('suppliers_no_products')
      });
      card.appendChild(noProducts);
    }

    return card;
  }

  function countFilled(sid, products) {
    if (!draftQty[sid]) return 0;
    let n = 0;
    products.forEach(function (p) {
      const v = draftQty[sid][p.id];
      if (v && parseFloat(v) > 0) n++;
    });
    return n;
  }

  function updateFilledCount(card, sid) {
    const supplier = PCD.store.getFromTable('suppliers', sid);
    if (!supplier) return;
    const filled = countFilled(sid, supplier.products || []);
    const total = (supplier.products || []).length;
    const countEl = card.querySelector('[data-filled-count]');
    if (countEl) {
      countEl.innerHTML = total + ' ' + (total === 1 ? 'product' : 'products') +
        (filled > 0 ? ' · <span style="color:var(--brand-700);font-weight:700;">' + filled + ' to order</span>' : '');
    }
    const sendBtn = card.querySelector('[data-send-sup]');
    if (sendBtn) {
      sendBtn.innerHTML = PCD.icon('send', 14) + ' Send' + (filled > 0 ? ' (' + filled + ')' : '');
    }
  }

  // ============ SEND ORDER FLOW ============
  function sendOrderFlow(sid) {
    const supplier = PCD.store.getFromTable('suppliers', sid);
    if (!supplier) return;
    const products = supplier.products || [];
    const dq = draftQty[sid] || {};
    const filled = products.filter(function (p) {
      const v = dq[p.id];
      return v && parseFloat(v) > 0;
    });
    if (filled.length === 0) {
      PCD.toast.warning(PCD.i18n.t('toast_enter_quantities_first'));
      return;
    }
    // Pick delivery date first, then build message + open share sheet
    openDeliveryDate(supplier, filled);
  }

  function openDeliveryDate(supplier, items) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);
    function iso(d) { return d.toISOString().slice(0, 10); }
    function dayName(d) {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    let selected = iso(tomorrow);

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="font-weight:600;margin-bottom:12px;">When do you need delivery?</div>' +
      '<div class="flex flex-col gap-2">' +
        '<label class="card card-hover" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;">' +
          '<input type="radio" name="dlv" value="' + iso(tomorrow) + '" checked style="accent-color:var(--brand-600);">' +
          '<div style="flex:1;"><div style="font-weight:600;">Tomorrow</div><div class="text-muted text-sm">' + dayName(tomorrow) + '</div></div>' +
        '</label>' +
        '<label class="card card-hover" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;">' +
          '<input type="radio" name="dlv" value="' + iso(dayAfter) + '" style="accent-color:var(--brand-600);">' +
          '<div style="flex:1;"><div style="font-weight:600;">Day after tomorrow</div><div class="text-muted text-sm">' + dayName(dayAfter) + '</div></div>' +
        '</label>' +
        '<label class="card" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;">' +
          '<input type="radio" name="dlv" value="custom" style="accent-color:var(--brand-600);">' +
          '<div style="flex:1;"><div style="font-weight:600;">Custom date</div>' +
            '<input type="date" id="customDate" min="' + iso(new Date()) + '" class="input mt-1" style="padding:6px 8px;font-size:13px;">' +
          '</div>' +
        '</label>' +
      '</div>' +
      '<div class="field mt-3"><label class="field-label">Notes (optional)</label>' +
      '<input type="text" id="dlvNotes" class="input" placeholder="e.g. Before 10am, back entrance"></div>';

    PCD.on(body, 'change', 'input[name=dlv]', function () {
      if (this.value === 'custom') {
        const cd = PCD.$('#customDate', body).value;
        selected = cd || iso(tomorrow);
      } else {
        selected = this.value;
      }
    });
    PCD.$('#customDate', body).addEventListener('change', function () {
      const r = body.querySelector('input[name=dlv][value=custom]');
      if (r) r.checked = true;
      selected = this.value;
    });

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const nextBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    nextBtn.innerHTML = PCD.icon('send', 14) + ' <span>' + PCD.i18n.t('btn_next') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(nextBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_send_order_to', { name: supplier.name }), body: body, footer: footer, size: 'sm', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });
    nextBtn.addEventListener('click', function () {
      const notes = (PCD.$('#dlvNotes', body).value || '').trim();
      m.close();
      setTimeout(function () { openShareSheet(supplier, items, selected, notes); }, 200);
    });
  }

  function buildMessage(supplier, items, deliveryDate, notes) {
    const dq = draftQty[supplier.id] || {};
    const dateStr = new Date(deliveryDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const user = PCD.store.get('user') || {};
    const userName = user.name || user.email || '';

    const lines = [];
    lines.push('Hi ' + (supplier.name || 'team') + ',');
    lines.push('');
    lines.push('I would like to order the following for delivery on ' + dateStr + ':');
    lines.push('');
    items.forEach(function (it) {
      const qty = dq[it.id];
      const unit = dq['_unit_' + it.id] || it.unit || '';
      lines.push('• ' + it.name + ' — ' + qty + ' ' + unit);
    });
    if (notes) {
      lines.push('');
      lines.push('Notes: ' + notes);
    }
    lines.push('');
    lines.push('Thanks,');
    if (userName) lines.push(userName);
    return lines.join('\n');
  }

  function openShareSheet(supplier, items, deliveryDate, notes) {
    const message = buildMessage(supplier, items, deliveryDate, notes);
    const phoneClean = (supplier.phone || '').replace(/\D/g, '');
    const waNumber = (supplier.whatsapp || supplier.phone || '').replace(/\D/g, '');
    const email = supplier.email || '';
    const hasAnyContact = phoneClean || waNumber || email;

    // If user device supports Web Share API and any contact info, prefer native share
    // otherwise show our 4-button sheet
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">Message (editable)</label>' +
      '<textarea class="textarea" id="shareMsg" rows="10" style="font-family:var(--font-mono);font-size:13px;white-space:pre;">' + PCD.escapeHtml(message) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:14px;">' +
        '<button class="btn btn-outline" id="shWa" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#25D366;">' + PCD.icon('message-circle', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">WhatsApp</div>' +
          (!waNumber ? '<div class="text-muted" style="font-size:10px;">No number</div>' : '') +
        '</button>' +
        '<button class="btn btn-outline" id="shSms" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--brand-600);">' + PCD.icon('phone', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">SMS</div>' +
          (!phoneClean ? '<div class="text-muted" style="font-size:10px;">No number</div>' : '') +
        '</button>' +
        '<button class="btn btn-outline" id="shEmail" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#EA4335;">' + PCD.icon('mail', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">Email</div>' +
          (!email ? '<div class="text-muted" style="font-size:10px;">No address</div>' : '') +
        '</button>' +
        '<button class="btn btn-outline" id="shMore" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--text-2);">' + PCD.icon('share', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">More...</div>' +
        '</button>' +
      '</div>' +
      (!hasAnyContact ? '<div class="text-muted text-sm mt-3" style="text-align:center;font-size:12px;">No contact saved for this supplier — choose a channel above to send.</div>' : '');

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(cancelBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_send_to', { name: supplier.name }), body: body, footer: footer, size: 'md', closable: true });

    function getMsg() { return PCD.$('#shareMsg', body).value; }
    cancelBtn.addEventListener('click', function () { m.close(); });

    PCD.$('#shWa', body).addEventListener('click', function () {
      const url = waNumber
        ? 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(getMsg())
        : 'https://wa.me/?text=' + encodeURIComponent(getMsg());
      window.open(url, '_blank');
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shSms', body).addEventListener('click', function () {
      const url = phoneClean
        ? 'sms:' + supplier.phone + '?&body=' + encodeURIComponent(getMsg())
        : 'sms:?&body=' + encodeURIComponent(getMsg());
      window.location.href = url;
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shEmail', body).addEventListener('click', function () {
      const subject = 'Order request — delivery ' + new Date(deliveryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const url = email
        ? 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(getMsg())
        : 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(getMsg());
      window.location.href = url;
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shMore', body).addEventListener('click', function () {
      const txt = getMsg();
      // Use Web Share API if available (system share sheet)
      if (navigator.share) {
        navigator.share({
          title: 'Order for ' + supplier.name,
          text: txt
        }).then(function () {
          onSentSuccess(supplier);
          m.close();
        }).catch(function () {
          // user cancelled - ignore
        });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(function () {
          PCD.toast.success(PCD.i18n.t('toast_copied_to_clipboard'));
        });
      }
    });
  }

  function onSentSuccess(supplier) {
    // Clear quantities for this supplier — they were sent
    delete draftQty[supplier.id];
    PCD.toast.success(PCD.i18n.t('toast_order_sent_to', { name: supplier.name }));
    // Re-render so the badge clears
    setTimeout(function () {
      const v = PCD.$('#view');
      if (v && PCD.router.currentView() === 'suppliers') render(v);
    }, 600);
  }

  // ============ EDITOR ============
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
          <label class="field-label">Name *</label>
          <input type="text" class="input" id="sName" value="${PCD.escapeHtml(data.name || '')}" placeholder="e.g. Perth Fresh Produce">
        </div>
        <div class="field">
          <label class="field-label">Category</label>
          <select class="select" id="sCat">
            ${CATS.map(function (c) { return '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Phone</label>
            <input type="tel" class="input" id="sPhone" value="${PCD.escapeHtml(data.phone || '')}" placeholder="+61 ...">
          </div>
          <div class="field">
            <label class="field-label">WhatsApp</label>
            <input type="tel" class="input" id="sWa" value="${PCD.escapeHtml(data.whatsapp || '')}" placeholder="Leave empty to use phone">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Email</label>
          <input type="email" class="input" id="sEmail" value="${PCD.escapeHtml(data.email || '')}" placeholder="orders@supplier.com">
        </div>
        <div class="field">
          <label class="field-label">Notes</label>
          <textarea class="textarea" id="sNotes" rows="2" placeholder="Delivery days, min order, etc.">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>

        <div class="section-title mt-4 mb-2" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">Products (${data.products.length})</div>
        <div class="text-muted text-sm mb-2">List the products you buy from this supplier. They will appear in the Order sheet for quick ordering.</div>
        <div id="productsList" class="flex flex-col gap-1"></div>
        <button class="btn btn-ghost btn-sm mt-2" id="addProdBtn" style="width:100%;">${PCD.icon('plus', 14)} Add product</button>
      `;

      const listEl = PCD.$('#productsList', body);
      data.products.forEach(function (p, idx) {
        const row = PCD.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
        row.innerHTML = `
          <input type="text" class="input" data-pname="${idx}" value="${PCD.escapeHtml(p.name || '')}" placeholder="${PCD.escapeHtml(t('suppliers_product_name_placeholder'))}" style="flex:1;">
          <select class="select" data-punit="${idx}" style="width:75px;">
            ${UNITS.map(function (u) { return '<option value="' + u + '"' + (p.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
          </select>
          <button class="icon-btn" data-pdel="${idx}">${PCD.icon('x', 16)}</button>
        `;
        listEl.appendChild(row);
      });

      // Direct event handlers (no debounce - save on every keystroke)
      PCD.$('#sName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#sCat', body).addEventListener('change', function () { data.category = this.value; });
      PCD.$('#sPhone', body).addEventListener('input', function () { data.phone = this.value; });
      PCD.$('#sWa', body).addEventListener('input', function () { data.whatsapp = this.value; });
      PCD.$('#sEmail', body).addEventListener('input', function () { data.email = this.value; });
      PCD.$('#sNotes', body).addEventListener('input', function () { data.notes = this.value; });
      PCD.$('#addProdBtn', body).addEventListener('click', function () {
        data.products.push({ id: PCD.uid('p'), name: '', unit: 'kg' });
        renderEditor();
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-pname]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      PCD.on(body, 'input', '[data-pname]', function () {
        const idx = parseInt(this.getAttribute('data-pname'), 10);
        if (data.products[idx]) data.products[idx].name = this.value;
      });
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
      title: existing ? (existing.name || 'Supplier') : 'New Supplier',
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
      // Read fresh from DOM (safety net)
      data.name = (PCD.$('#sName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(PCD.i18n.t('toast_name_required')); return; }
      data.category = PCD.$('#sCat', body).value;
      data.phone = (PCD.$('#sPhone', body).value || '').trim();
      data.whatsapp = (PCD.$('#sWa', body).value || '').trim();
      data.email = (PCD.$('#sEmail', body).value || '').trim();
      data.notes = (PCD.$('#sNotes', body).value || '').trim();
      // Read products from DOM
      const newProducts = [];
      body.querySelectorAll('[data-pname]').forEach(function (inp, idx) {
        const name = (inp.value || '').trim();
        if (!name) return;
        const unitSel = body.querySelector('[data-punit="' + idx + '"]');
        const unit = unitSel ? unitSel.value : 'kg';
        const orig = data.products[idx];
        newProducts.push({ id: orig && orig.id || PCD.uid('p'), name: name, unit: unit });
      });
      data.products = newProducts;

      if (existing) data.id = existing.id;
      const saved = PCD.store.upsertInTable('suppliers', data, 'sup');
      // Sync products to Ingredients table (auto-create with price=0)
      let synced = 0;
      data.products.forEach(function (p) {
        if (syncProductToIngredients(p.name, p.unit)) synced++;
      });
      PCD.toast.success(t('saved') + (synced > 0 ? ' · ' + synced + ' new ingredient(s)' : ''));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'suppliers') render(v);
      }, 150);
    });
  }

  function syncProductToIngredients(name, unit) {
    if (!name) return false;
    const existing = PCD.store.listIngredients().find(function (i) {
      return (i.name || '').toLowerCase() === name.toLowerCase();
    });
    if (existing) return false;
    PCD.store.upsertIngredient({
      name: name, unit: unit || 'kg', pricePerUnit: 0, category: 'cat_other',
    });
    return true;
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.suppliers = { render: render, openEditor: openEditor };
})();
