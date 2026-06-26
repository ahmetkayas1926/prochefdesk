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
  // Eksik i18n anahtarı için İngilizce fallback (t() eksikte key döndürebilir).
  function tt(key, fb) { try { const v = PCD.i18n.t(key); return (v == null || v === key) ? fb : v; } catch (e) { return fb; } }

  // In-memory quantities — keyed by supplierId then productId
  // Persists during the session, reset on page reload (intentional)
  const draftQty = {};

  // ---- Tek kaynak: tedarikçinin ürünleri = ona bağlı CANLI ingredient'ler ----
  // Bağ anahtarı = isim (ingredient.supplier === supplier.name, harf duyarsız).
  // Ingredients / Inventory / Suppliers hepsi aynı ingredient verisini paylaşır.
  function ingredientsForSupplier(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return [];
    return (PCD.store.listIngredients() || []).filter(function (i) {
      return (i.supplier || '').trim().toLowerCase() === key;
    }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  }
  function productsOf(s) {
    return ingredientsForSupplier(s && s.name).map(function (i) {
      return { id: i.id, name: i.name, unit: i.unit || 'kg' };
    });
  }

  // v2.44.78 — INVENTORY KÖPRÜSÜ. Inventory "Sipariş Oluştur" bir tedarikçinin par-altı
  // kalemlerini buraya geçirir; o tedarikçinin GERÇEK gönderim hattı yeniden kullanılır
  // (teslim tarihi → WhatsApp/SMS/Email gerçek kişi → sipariş geçmişi → "stoğa ekle").
  // items: [{ ingId, qty, unit? }]. İsim → tedarikçi kaydı (backfill garanti eder).
  function supplierByName(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    return (PCD.store.listTable('suppliers') || []).find(function (s) {
      return (s.name || '').trim().toLowerCase() === key;
    }) || null;
  }
  function startOrder(supplierName, items) {
    backfillSupplierRecords();
    const sup = supplierByName(supplierName);
    if (!sup) { if (PCD.toast) PCD.toast.warning(tt('sup_not_found', 'Supplier not found')); return false; }
    draftQty[sup.id] = draftQty[sup.id] || {};
    (items || []).forEach(function (it) {
      if (!it || !it.ingId) return;
      draftQty[sup.id][it.ingId] = it.qty;
      if (it.unit) draftQty[sup.id]['_unit_' + it.ingId] = it.unit;
    });
    sendOrderFlow(sup.id);
    return true;
  }

  // Tek kaynak: her ingredient.supplier için bir tedarikçi kaydı garanti et
  // (ingredient'lere atanmış ama henüz kaydı olmayan tedarikçiler de kart olur).
  function backfillSupplierRecords() {
    const have = {};
    (PCD.store.listTable('suppliers') || []).forEach(function (s) { have[(s.name || '').trim().toLowerCase()] = true; });
    const names = {};
    (PCD.store.listIngredients() || []).forEach(function (i) { const n = (i.supplier || '').trim(); if (n) names[n] = true; });
    Object.keys(names).forEach(function (n) {
      if (!have[n.toLowerCase()]) {
        try { PCD.store.upsertInTable('suppliers', { name: n, category: 'Other', products: [] }, 'sup'); } catch (e) {}
      }
    });
  }

  function render(view) {
    const t = PCD.i18n.t;
    backfillSupplierRecords();
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
      ${PCD.guideCard('suppliers', t('sup_g_t'), [t('sup_g1'), t('sup_g2'), t('sup_g3')])}
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
    PCD.on(listEl, 'click', '[data-history-sup]', function (e) {
      e.stopPropagation();
      openOrderHistory(this.getAttribute('data-history-sup'));
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
    const products = productsOf(s);

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
      '<button class="icon-btn" data-history-sup="' + s.id + '" title="' + PCD.escapeHtml(t('supplier_history_title') || 'Order history') + '" style="flex-shrink:0;">' + PCD.icon('clock', 18) + '</button>' +
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
    const prods = productsOf(supplier);
    const filled = countFilled(sid, prods);
    const total = prods.length;
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
    const products = productsOf(supplier);
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
      return d.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { weekday: 'short', month: 'short', day: 'numeric' });
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
    const dateStr = new Date(deliveryDate).toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { weekday: 'long', month: 'long', day: 'numeric' });
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
    // v2.44.63 — gönderim anındaki kalemleri yapısal yakala (draftQty send sonrası
    // temizlenir) → history'e gömülür → "Geldi → stoğa ekle" köprüsü bunu kullanır.
    const _dq = draftQty[supplier.id] || {};
    const orderItems = items.map(function (it) {
      return { name: it.name, qty: Number(_dq[it.id]) || 0, unit: _dq['_unit_' + it.id] || it.unit || '' };
    });
    cancelBtn.addEventListener('click', function () { m.close(); });

    PCD.$('#shWa', body).addEventListener('click', function () {
      const url = waNumber
        ? 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(getMsg())
        : 'https://wa.me/?text=' + encodeURIComponent(getMsg());
      window.open(url, '_blank');
      recordOrder(supplier.id, 'whatsapp', waNumber, getMsg(), orderItems, deliveryDate);
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shSms', body).addEventListener('click', function () {
      const url = phoneClean
        ? 'sms:' + supplier.phone + '?&body=' + encodeURIComponent(getMsg())
        : 'sms:?&body=' + encodeURIComponent(getMsg());
      window.location.href = url;
      recordOrder(supplier.id, 'sms', (supplier.phone || ''), getMsg(), orderItems, deliveryDate);
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shEmail', body).addEventListener('click', function () {
      const subject = 'Order request — delivery ' + new Date(deliveryDate).toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || "en", { month: 'short', day: 'numeric' });
      const url = email
        ? 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(getMsg())
        : 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(getMsg());
      window.location.href = url;
      recordOrder(supplier.id, 'email', email, getMsg(), orderItems, deliveryDate);
      onSentSuccess(supplier);
      m.close();
    });
    PCD.$('#shMore', body).addEventListener('click', function () {
      const txt = getMsg();
      // Use Web Share API if available (system share sheet)
      if (navigator.share) {
        navigator.share({
          title: PCD.i18n.t('supplier_order_title', { name: supplier.name }),
          text: txt
        }).then(function () {
          recordOrder(supplier.id, 'share', '', txt, orderItems, deliveryDate);
          onSentSuccess(supplier);
          m.close();
        }).catch(function () {
          // user cancelled - ignore
        });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(function () {
          recordOrder(supplier.id, 'copy', '', txt, orderItems, deliveryDate);
          PCD.toast.success(PCD.i18n.t('toast_copied_to_clipboard'));
        });
      }
    });
  }

  function onSentSuccess(supplier) {
    // Clear quantities for this supplier — they were sent
    delete draftQty[supplier.id];
    PCD.toast.success(PCD.i18n.t('toast_order_sent_to', { name: supplier.name }));
    function rerender() {
      setTimeout(function () {
        const v = PCD.$('#view');
        if (v && PCD.router.currentView() === 'suppliers') render(v);
      }, 400);
    }
    // Sipariş gönderildi → "stoğa ekle?" sor. Envanteri takip eden şef ekler;
    // sadece sipariş cetveli kullanan atlar. Kalemler ingredient'e bağlı (tek kaynak).
    const fresh = PCD.store.getFromTable('suppliers', supplier.id);
    const lastOrder = fresh && Array.isArray(fresh.orderHistory) ? fresh.orderHistory[0] : null;
    if (lastOrder && !lastOrder.receivedAt && orderItemsOf(lastOrder).length > 0 && PCD.modal && PCD.modal.confirm) {
      PCD.modal.confirm({
        icon: '📦',
        title: tt('sup_add_stock_q_title', 'Add this order to stock?'),
        text: tt('sup_add_stock_q', 'Tracking inventory? Add these items to your stock now. If you only use the order sheet, skip this.'),
        okText: tt('sup_receive_add', 'Add to stock'),
        cancelText: tt('not_now', 'Not now'),
      }).then(function (ok) {
        if (ok) openReceiveStock(fresh, lastOrder, function () {});
        rerender();
      });
    } else {
      rerender();
    }
  }

  // ============ ORDER HISTORY (v2.15.0) ============
  // Gönderilen siparişi tedarikçi nesnesine göm (suppliers tablosu zaten cloud-sync'li
  // → yeni tablo/RLS gerekmez). Her kayıt: tarih-saat + kanal + alıcı + mesaj + kalem.
  function recordOrder(supplierId, channel, to, message, items, deliveryDate) {
    const sup = PCD.store.getFromTable('suppliers', supplierId);
    if (!sup) return;
    const hist = Array.isArray(sup.orderHistory) ? sup.orderHistory.slice() : [];
    // v2.44.63 — yapısal kalemleri sakla (isim/miktar/birim) → "Geldi → stoğa ekle"
    // köprüsü mesajı parse etmeden doğrudan kullanır. Eski sürüm uyumluluğu: items
    // sayıysa (eski çağrı) itemCount olarak alınır.
    const arr = Array.isArray(items) ? items.filter(function (x) { return x && x.name && Number(x.qty) > 0; }) : [];
    hist.unshift({
      id: PCD.uid('so'),
      sentAt: new Date().toISOString(),
      channel: channel,
      to: to || '',
      message: message || '',
      items: arr,
      itemCount: Array.isArray(items) ? arr.length : (Number(items) || 0),
      deliveryDate: deliveryDate || '',
    });
    sup.orderHistory = hist.slice(0, 50); // son 50 sipariş
    PCD.store.upsertInTable('suppliers', sup, 'sup');
  }

  function openOrderHistory(sid) {
    const t = PCD.i18n.t;
    const sup = PCD.store.getFromTable('suppliers', sid);
    if (!sup) return;
    const hist = Array.isArray(sup.orderHistory) ? sup.orderHistory : [];
    const chLabel = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', share: (t('supplier_ch_share') || 'Share'), copy: (t('supplier_ch_copy') || 'Copy') };
    const body = PCD.el('div');

    function paint() {
      if (!hist.length) {
        body.innerHTML = '<div class="empty" style="padding:24px 8px;">' +
          '<div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('clock', 40) + '</div>' +
          '<div class="empty-title">' + PCD.escapeHtml(t('supplier_history_empty') || 'No orders sent yet') + '</div>' +
          '<div class="empty-desc">' + PCD.escapeHtml(t('supplier_history_empty_desc') || 'Sent orders are saved here with date, channel and message.') + '</div></div>';
        return;
      }
      let html = '';
      hist.forEach(function (o) {
        const d = new Date(o.sentAt);
        const dateStr = d.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
          ' · ' + d.toLocaleTimeString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { hour: '2-digit', minute: '2-digit' });
        // v2.44.63 — "Geldi → stoğa ekle" köprüsü: kalem varsa buton; eklendiyse rozet.
        const receiveCtrl = o.receivedAt
          ? '<span style="font-size:11px;font-weight:700;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:3px 9px;">' + PCD.icon('check', 12) + ' ' + PCD.escapeHtml(t('sup_received') || 'Added to stock') + '</span>'
          : (orderItemsOf(o).length > 0 ? '<button class="btn btn-outline btn-sm" data-receive-oid="' + o.id + '">' + PCD.icon('truck', 14) + ' ' + PCD.escapeHtml(t('sup_receive_add') || 'Add to stock') + '</button>' : '');
        html += '<div style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
            '<span style="font-weight:700;font-size:13px;">' + PCD.escapeHtml(dateStr) + '</span>' +
            '<span style="font-size:11px;font-weight:700;color:var(--brand-700);background:var(--brand-50);border-radius:6px;padding:2px 8px;">' + PCD.escapeHtml(chLabel[o.channel] || o.channel || '') + (o.to ? ' · ' + PCD.escapeHtml(o.to) : '') + '</span>' +
          '</div>' +
          '<div class="text-muted" style="font-size:11px;margin-bottom:6px;">' + (o.itemCount || 0) + ' ' + PCD.escapeHtml(t('supplier_order_items') || 'items') + '</div>' +
          '<pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:11px;background:var(--surface-2);border-radius:var(--r-sm);padding:8px 10px;margin:0;max-height:170px;overflow:auto;">' + PCD.escapeHtml(o.message || '') + '</pre>' +
          (receiveCtrl ? '<div style="margin-top:8px;display:flex;justify-content:flex-end;">' + receiveCtrl + '</div>' : '') +
        '</div>';
      });
      body.innerHTML = html;
    }
    paint();
    body.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-receive-oid]');
      if (!btn) return;
      const o = hist.find(function (x) { return x.id === btn.getAttribute('data-receive-oid'); });
      if (o) openReceiveStock(sup, o, paint);
    });

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: (t('supplier_history_title') || 'Order history') + ' · ' + (sup.name || ''), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  // v2.44.63 — Sipariş kalemlerini al: yapısal items varsa onu, yoksa mesajı parse et
  // (eski kayıtlar). Mesaj formatı buildMessage ile: "• AD — MİKTAR BİRİM".
  function orderItemsOf(o) {
    if (Array.isArray(o.items) && o.items.length) {
      return o.items.map(function (it) { return { name: it.name, qty: Number(it.qty) || 0, unit: it.unit || '' }; })
        .filter(function (it) { return it.name && it.qty > 0; });
    }
    const out = [];
    (o.message || '').split('\n').forEach(function (ln) {
      const mm = ln.match(/^\s*•\s*(.+?)\s+—\s+([0-9]+(?:[.,][0-9]+)?)\s*(\S*)/);
      if (mm) out.push({ name: mm[1].trim(), qty: parseFloat(mm[2].replace(',', '.')) || 0, unit: (mm[3] || '').trim() });
    });
    return out.filter(function (it) { return it.name && it.qty > 0; });
  }

  // v2.44.63 — "Geldi → stoğa ekle": sipariş kalemlerini inventory'ye (isimle eşleşen
  // malzeme) ekler. Eşleşen = checkbox (varsayılan açık) + düzenlenebilir miktar (kısmi
  // teslim). Eşleşmeyen atlanır. applyStockAdditions stok yoksa tracked satır yaratır
  // (receiving takip başlatır). Çift ekleme koruması: o.receivedAt set edilir.
  function openReceiveStock(sup, o, onDone) {
    const t = PCD.i18n.t;
    const items = orderItemsOf(o);
    const byName = {};
    PCD.store.listIngredients().forEach(function (i) { byName[(i.name || '').toLowerCase()] = i; });
    const matched = [];
    const unmatched = [];
    items.forEach(function (it) {
      const ing = byName[(it.name || '').toLowerCase()];
      if (ing) matched.push({ it: it, ing: ing }); else unmatched.push(it);
    });
    const body = PCD.el('div');
    let html = '<div class="text-muted text-sm" style="margin-bottom:10px;">' + PCD.escapeHtml(t('sup_receive_help') || 'Tick what arrived — stock goes up automatically. Edit quantities for partial deliveries.') + '</div>';
    if (matched.length) {
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      matched.forEach(function (r, idx) {
        html += '<label class="rcv-row" data-idx="' + idx + '" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);">' +
          '<input type="checkbox" class="rcv-cb" checked style="width:18px;height:18px;flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.it.name) + '</div>' +
          '<input type="number" class="input rcv-qty" value="' + (r.it.qty || 0) + '" min="0" step="0.1" style="width:74px;text-align:center;font-weight:600;">' +
          '<span class="text-muted" style="font-size:12px;width:34px;">' + PCD.escapeHtml(r.it.unit || r.ing.unit || '') + '</span>' +
          '</label>';
      });
      html += '</div>';
    } else {
      html += '<div class="text-muted text-sm">' + PCD.escapeHtml(t('sup_receive_none_matched') || 'None of these products are tracked in inventory.') + '</div>';
    }
    if (unmatched.length) {
      html += '<div class="text-muted" style="font-size:12px;margin-top:10px;">' + PCD.escapeHtml(t('sup_receive_skipped') || 'Not in inventory (skipped)') + ': ' + unmatched.map(function (it) { return PCD.escapeHtml(it.name); }).join(', ') + '</div>';
    }
    body.innerHTML = html;
    const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const addBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    addBtn.innerHTML = PCD.icon('check', 14) + ' <span>' + PCD.escapeHtml(t('sup_receive_add') || 'Add to stock') + '</span>';
    if (!matched.length) addBtn.style.display = 'none';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancel);
    footer.appendChild(addBtn);
    const m = PCD.modal.open({ title: t('sup_receive_title') || 'Add order to stock', body: body, footer: footer, size: 'md', closable: true });
    cancel.addEventListener('click', function () { m.close(); });
    addBtn.addEventListener('click', function () {
      const additions = {};
      let n = 0;
      const skipped = [];
      PCD.$$('.rcv-row', body).forEach(function (rowEl) {
        const cb = rowEl.querySelector('.rcv-cb');
        if (!cb || !cb.checked) return;
        const r = matched[Number(rowEl.getAttribute('data-idx'))];
        if (!r) return;
        let amt = Number(rowEl.querySelector('.rcv-qty').value) || 0;
        if (!(amt > 0)) return;
        const fromU = r.it.unit || r.ing.unit;
        const toU = r.ing.unit;
        if (fromU && toU && fromU !== toU) {
          try { amt = PCD.convertUnit(amt, fromU, toU); }
          catch (e) { skipped.push(r.it.name); return; }
          if (!(amt > 0)) { skipped.push(r.it.name); return; }
        }
        additions[r.ing.id] = (additions[r.ing.id] || 0) + amt;
        n++;
      });
      if (!n) { PCD.toast.info(t('sup_receive_nothing') || 'Tick at least one product.'); return; }
      const report = (PCD.tools.inventory && PCD.tools.inventory.applyStockAdditions)
        ? PCD.tools.inventory.applyStockAdditions(additions) : [];
      o.receivedAt = new Date().toISOString();
      PCD.store.upsertInTable('suppliers', sup, 'sup');
      PCD.toast.success(t('sup_receive_done', { n: report.length }) + (skipped.length ? ' · ⚠ ' + skipped.length : ''));
      m.close();
      if (typeof onDone === 'function') onDone();
    });
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

    // Çalışma listesi: ürünler = bu tedarikçiye bağlı CANLI ingredient'ler.
    // {ingredientId?, name, unit}. Eski serbest-metin products (henüz ingredient
    // olmamış) migration için sona eklenir (kaydederken ingredient'e dönüşür).
    let prods = [];
    (function () {
      const seen = {};
      ingredientsForSupplier(existing ? existing.name : data.name).forEach(function (i) {
        prods.push({ ingredientId: i.id, name: i.name, unit: i.unit || 'kg' });
        seen[(i.name || '').toLowerCase()] = true;
      });
      (data.products || []).forEach(function (p) {
        const nm = (p.name || '').trim();
        if (nm && !seen[nm.toLowerCase()]) { prods.push({ name: nm, unit: p.unit || 'kg' }); seen[nm.toLowerCase()] = true; }
      });
    })();

    const body = PCD.el('div');

    function renderEditor() {
      body.innerHTML = `
        <div class="field">
          <label class="field-label">Name *</label>
          <input type="text" class="input" id="sName" value="${PCD.escapeHtml(data.name || '')}" placeholder="e.g. Fresh Produce Co">
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
            <input type="tel" class="input" id="sWa" value="${PCD.escapeHtml(data.whatsapp || '')}" placeholder="${PCD.escapeHtml(t('supplier_whatsapp_placeholder'))}">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Email</label>
          <input type="email" class="input" id="sEmail" value="${PCD.escapeHtml(data.email || '')}" placeholder="orders@supplier.com">
        </div>
        <div class="field">
          <label class="field-label">Notes</label>
          <textarea class="textarea" id="sNotes" rows="2" placeholder="${PCD.escapeHtml(t('supplier_notes_placeholder'))}">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>

        <div class="section-title mt-4 mb-2" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">${PCD.escapeHtml(tt('sup_products', 'Products'))} (${prods.length})</div>
        <div class="text-muted text-sm mb-2">${PCD.escapeHtml(tt('sup_products_hint', 'Ingredients you buy from this supplier — linked to your library. Add existing or create new; they stay in sync with Ingredients & Inventory.'))}</div>
        <div id="productsList" class="flex flex-col gap-1"></div>
        <button class="btn btn-outline btn-sm mt-2" id="addProdBtn" style="width:100%;">${PCD.icon('plus', 14)} ${PCD.escapeHtml(tt('sup_add_ingredients', 'Add ingredients'))}</button>
      `;

      const listEl = PCD.$('#productsList', body);
      if (!prods.length) {
        listEl.innerHTML = '<div class="text-muted text-sm" style="padding:6px 2px;font-style:italic;">' + PCD.escapeHtml(tt('suppliers_no_products', 'No products yet.')) + '</div>';
      }
      prods.forEach(function (p, idx) {
        const row = PCD.el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } });
        row.innerHTML =
          '<span style="flex:1;min-width:0;font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(p.name) +
            (p.ingredientId ? '' : ' <span class="text-muted" style="font-size:11px;font-style:italic;">· ' + PCD.escapeHtml(tt('sup_will_create', 'new')) + '</span>') +
          '</span>' +
          '<span class="text-muted" style="font-size:12px;">' + PCD.escapeHtml(p.unit || '') + '</span>' +
          '<button class="icon-btn" data-pdel="' + idx + '" title="' + PCD.escapeHtml(tt('remove', 'Remove')) + '">' + PCD.icon('x', 16) + '</button>';
        listEl.appendChild(row);
      });
      listEl.querySelectorAll('[data-pdel]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          prods.splice(parseInt(btn.getAttribute('data-pdel'), 10), 1);
          renderEditor();
        });
      });

      // Direct field handlers (innerHTML reset her render'da eskileri temizler)
      PCD.$('#sName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#sCat', body).addEventListener('change', function () { data.category = this.value; });
      PCD.$('#sPhone', body).addEventListener('input', function () { data.phone = this.value; });
      PCD.$('#sWa', body).addEventListener('input', function () { data.whatsapp = this.value; });
      PCD.$('#sEmail', body).addEventListener('input', function () { data.email = this.value; });
      PCD.$('#sNotes', body).addEventListener('input', function () { data.notes = this.value; });
      PCD.$('#addProdBtn', body).addEventListener('click', function () {
        const excl = {};
        prods.forEach(function (p) { excl[(p.name || '').toLowerCase()] = true; });
        openIngredientPicker(excl, function (picked) {
          picked.forEach(function (pk) {
            const k = (pk.name || '').toLowerCase();
            if (!k || excl[k]) return;
            prods.push(pk); excl[k] = true;
          });
          renderEditor();
        });
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
      if (PCD.gate && !PCD.gate.requireAuth()) return;
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
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      data.name = (PCD.$('#sName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(PCD.i18n.t('toast_name_required')); return; }
      data.category = PCD.$('#sCat', body).value;
      data.phone = (PCD.$('#sPhone', body).value || '').trim();
      data.whatsapp = (PCD.$('#sWa', body).value || '').trim();
      data.email = (PCD.$('#sEmail', body).value || '').trim();
      data.notes = (PCD.$('#sNotes', body).value || '').trim();

      const supName = data.name;
      // Tek kaynak reconcile: listedeki ingredient'leri bu tedarikçiye bağla,
      // çıkarılanların bağını kaldır, yeni isimleri ingredient olarak oluştur
      // (ingredients + inventory'ye otomatik düşer).
      const prevLinked = ingredientsForSupplier(existing ? existing.name : supName);
      const keep = {};
      let created = 0;
      prods.forEach(function (p) {
        const nm = (p.name || '').trim();
        if (!nm) return;
        let ing = p.ingredientId ? PCD.store.getIngredient(p.ingredientId) : null;
        if (!ing) ing = (PCD.store.listIngredients() || []).find(function (i) { return (i.name || '').toLowerCase() === nm.toLowerCase(); });
        if (ing) {
          keep[ing.id] = true;
          if ((ing.supplier || '') !== supName) { ing.supplier = supName; PCD.store.upsertIngredient(ing); }
        } else {
          const ni = PCD.store.upsertIngredient({ name: nm, unit: p.unit || 'kg', pricePerUnit: 0, category: 'cat_other', supplier: supName });
          if (ni && ni.id) { keep[ni.id] = true; created++; }
        }
      });
      prevLinked.forEach(function (i) {
        if (!keep[i.id]) { i.supplier = ''; PCD.store.upsertIngredient(i); }
      });

      // cache snapshot (geri uyumluluk; gerçek gösterim canlı ingredient'ten)
      data.products = prods.map(function (p) { return { id: p.ingredientId || PCD.uid('p'), name: p.name, unit: p.unit || 'kg' }; });
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('suppliers', data, 'sup');
      PCD.toast.success(t('saved') + (created > 0 ? ' · ' + created + ' ' + tt('sup_new_ingredients', 'new ingredient(s)') : ''));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'suppliers') render(v);
      }, 150);
    });
  }

  // ---- Ingredient çoklu-seçici: mevcut kütüphaneden seç veya yeni oluştur ----
  function openIngredientPicker(excludeNames, onConfirm) {
    const t = PCD.i18n.t;
    const all = (PCD.store.listIngredients() || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    const available = all.filter(function (i) { return !excludeNames[(i.name || '').toLowerCase()]; });
    const selected = {};
    const newOnes = [];
    const body = PCD.el('div');
    body.innerHTML =
      '<input type="search" class="input" id="ipq" placeholder="' + PCD.escapeHtml(tt('search_ingredients_placeholder', 'Search ingredients')) + '" style="width:100%;margin-bottom:8px;">' +
      '<div id="ipl" style="max-height:42vh;overflow:auto;"></div>' +
      '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">' +
        '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(tt('sup_new_ing_hint', 'Not in your library? Create it here — it goes to Ingredients & Inventory too.')) + '</div>' +
        '<div class="flex gap-2" style="align-items:center;">' +
          '<input type="text" class="input" id="ipNewName" placeholder="' + PCD.escapeHtml(tt('sup_new_ing_ph', 'New ingredient name')) + '" style="flex:1;">' +
          '<select class="select" id="ipNewUnit" style="width:80px;">' + UNITS.map(function (u) { return '<option value="' + u + '"' + (u === 'kg' ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="btn btn-outline btn-sm" id="ipNewAdd">' + PCD.escapeHtml(tt('add', 'Add')) + '</button>' +
        '</div>' +
        '<div id="ipNewList" class="text-muted text-sm" style="margin-top:6px;"></div>' +
      '</div>';
    function paintList(q) {
      const list = PCD.$('#ipl', body); const ql = (q || '').toLowerCase();
      const rows = available.filter(function (i) { return !ql || (i.name || '').toLowerCase().indexOf(ql) >= 0; });
      if (!rows.length) { list.innerHTML = '<div class="text-muted text-sm" style="padding:8px;">' + PCD.escapeHtml(tt('sup_no_more_ings', 'No more ingredients to add.')) + '</div>'; return; }
      list.innerHTML = rows.map(function (i) {
        const on = !!selected[i.id];
        const supHint = (i.supplier || '').trim() ? ' <span class="text-muted" style="font-size:11px;">· ' + PCD.escapeHtml(i.supplier) + '</span>' : '';
        return '<label style="display:flex;align-items:center;gap:10px;padding:7px 9px;border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:4px;cursor:pointer;">' +
          '<input type="checkbox" class="ip-cb" data-id="' + i.id + '"' + (on ? ' checked' : '') + ' style="width:17px;height:17px;flex-shrink:0;accent-color:var(--brand-600);">' +
          '<span style="flex:1;min-width:0;">' + PCD.escapeHtml(i.name) + ' <span class="text-muted" style="font-size:11px;">' + PCD.escapeHtml(i.unit || '') + '</span>' + supHint + '</span></label>';
      }).join('');
      list.querySelectorAll('.ip-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          const id = cb.getAttribute('data-id');
          if (cb.checked) { const ing = PCD.store.getIngredient(id); if (ing) selected[id] = { ingredientId: id, name: ing.name, unit: ing.unit || 'kg' }; }
          else delete selected[id];
        });
      });
    }
    paintList('');
    function paintNew() {
      PCD.$('#ipNewList', body).innerHTML = newOnes.length ? (PCD.escapeHtml(tt('sup_to_create', 'Will create')) + ': ' + newOnes.map(function (n) { return PCD.escapeHtml(n.name); }).join(', ')) : '';
    }
    function addNew() {
      const nm = (PCD.$('#ipNewName', body).value || '').trim(); if (!nm) return;
      const un = PCD.$('#ipNewUnit', body).value || 'kg';
      if (!excludeNames[nm.toLowerCase()] && !newOnes.some(function (n) { return n.name.toLowerCase() === nm.toLowerCase(); })) {
        newOnes.push({ name: nm, unit: un });
      }
      PCD.$('#ipNewName', body).value = ''; paintNew();
    }
    PCD.$('#ipNewAdd', body).addEventListener('click', addNew);
    PCD.$('#ipNewName', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    setTimeout(function () { const s = PCD.$('#ipq', body); if (s) { s.focus(); s.addEventListener('input', function () { paintList(s.value); }); } }, 80);
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const addBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    addBtn.textContent = tt('add', 'Add');
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn); footer.appendChild(addBtn);
    const m = PCD.modal.open({ title: tt('sup_add_ingredients', 'Add ingredients'), body: body, footer: footer, size: 'sm', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });
    addBtn.addEventListener('click', function () {
      const out = Object.keys(selected).map(function (id) { return selected[id]; }).concat(newOnes.map(function (n) { return { name: n.name, unit: n.unit }; }));
      m.close();
      if (out.length && onConfirm) onConfirm(out);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.suppliers = { render: render, openEditor: openEditor, startOrder: startOrder };
})();
