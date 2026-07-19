/* ================================================================
   ProChefDesk — waste.js
   ----------------------------------------------------------------
   Waste / spoilage log → $ loss + optional stock deduction.
   Connected: ingredient + recipe cost engine (computeFoodCost) and
   inventory (applyStockDeductions reuse). Array table — soft-delete
   tombstone + queueArraySync (cross-device). Mirrors buffet.js array
   pattern; sync wiring for 'waste' already exists (schema-only table).
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;
  const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'bag', 'tray'];
  const REASONS = ['spoilage', 'overproduction', 'trim', 'expired', 'dropped', 'other'];

  // ---------- Array-table read/write (buffet.js pattern) ----------
  function readWasteAll() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('waste') || {};
    if (Array.isArray(root)) return root; // legacy flat
    return root[wsId] || [];
  }
  function readWaste() {
    return readWasteAll().filter(function (w) { return w && !w._deletedAt; });
  }
  function writeWaste(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('waste') || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    const oldArr = Array.isArray(root) ? root : (root[wsId] || []);
    next[wsId] = arr;
    PCD.store.set('waste', next);
    if (PCD.cloudPerTable && PCD.cloudPerTable.queueArraySync) {
      try { PCD.cloudPerTable.queueArraySync('waste', wsId, oldArr, arr); } catch (e) { /* offline ok */ }
    }
  }
  function saveEntry(entry) {
    const all = readWasteAll().slice();
    const idx = entry.id ? all.findIndex(function (w) { return w.id === entry.id; }) : -1;
    if (idx >= 0) {
      all[idx] = entry;
    } else {
      entry.id = 'wst_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      all.push(entry);
    }
    writeWaste(all);
    return entry;
  }
  function deleteEntry(id) {
    const all = readWasteAll().slice();
    const idx = all.findIndex(function (w) { return w.id === id; });
    if (idx >= 0) {
      all[idx] = Object.assign({}, all[idx], { _deletedAt: new Date().toISOString() });
      writeWaste(all);
    }
  }

  function maps() {
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    return { ingMap: ingMap, recipeMap: recipeMap };
  }

  // $ value of one waste entry
  function computeCost(entry, ingMap, recipeMap) {
    if (entry.itemType === 'ingredient') {
      const ing = ingMap[entry.ingredientId];
      if (!ing) return 0;
      let amt = Number(entry.amount) || 0;
      if (entry.unit && ing.unit && entry.unit !== ing.unit) {
        try { amt = PCD.convertUnit(amt, entry.unit, ing.unit); } catch (e) { /* keep raw */ }
      }
      return amt * (Number(ing.pricePerUnit) || 0);
    }
    if (entry.itemType === 'recipe') {
      const r = recipeMap[entry.recipeId];
      if (!r) return 0;
      let cost = 0;
      try { cost = Number(PCD.recipes.computeFoodCost(r, ingMap, recipeMap)) || 0; } catch (e) { /* */ }
      const perServing = (Number(r.servings) > 0) ? (cost / Number(r.servings)) : cost;
      return perServing * (Number(entry.amount) || 0); // amount = servings wasted
    }
    return Number(entry.costValue) || 0; // custom
  }

  function itemName(entry, ingMap, recipeMap) {
    if (entry.itemType === 'ingredient') return (ingMap[entry.ingredientId] || {}).name || '—';
    if (entry.itemType === 'recipe') return (recipeMap[entry.recipeId] || {}).name || '—';
    return entry.customName || '—';
  }

  // ---------- LIST ----------
  function render(view) {
    const t = PCD.i18n.t;
    const m = maps();
    const list = readWaste().slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    const total = list.reduce(function (s, e) { return s + computeCost(e, m.ingMap, m.recipeMap); }, 0);

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">' + PCD.escapeHtml(t('waste_title')) + '</div>' +
          '<div class="page-subtitle">' + PCD.escapeHtml(t('waste_subtitle')) + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-primary" id="newWasteBtn">' + PCD.icon('plus', 16) + ' ' + PCD.escapeHtml(t('waste_log_btn')) + '</button>' +
        '</div>' +
      '</div>' +
      PCD.subNav('stock', 'waste') +
      PCD.guideCard('waste', t('waste_g_t'), [t('waste_g1'), t('waste_g2'), t('waste_g3')]) +
      '<div id="wasteList"></div>';

    const listEl = PCD.$('#wasteList', view);

    if (list.length === 0) {
      listEl.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('trash', 48) + '</div>' +
          '<div class="empty-title">' + PCD.escapeHtml(t('waste_empty_title')) + '</div>' +
          '<div class="empty-desc">' + PCD.escapeHtml(t('waste_empty_desc')) + '</div>' +
          '<div class="empty-action"><button class="btn btn-primary" id="emptyWasteBtn">' + PCD.icon('plus', 16) + ' ' + PCD.escapeHtml(t('waste_log_btn')) + '</button></div>' +
        '</div>';
      const eb = PCD.$('#emptyWasteBtn', listEl);
      if (eb) eb.addEventListener('click', function () { openEditor(); });
    } else {
      let html =
        '<div class="card mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:14px;display:flex;justify-content:space-between;align-items:center;">' +
          '<div><div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('waste_total_loss')) + '</div>' +
          '<div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--danger);">' + PCD.fmtMoney(total) + '</div></div>' +
          '<div class="text-muted text-sm">' + list.length + ' ' + PCD.escapeHtml(list.length === 1 ? t('waste_entry') : t('waste_entries')) + '</div>' +
        '</div>';
      html += '<div class="list">';
      list.forEach(function (e) {
        const cost = computeCost(e, m.ingMap, m.recipeMap);
        const reasonLabel = t('waste_reason_' + (e.reason || 'other'));
        const dateStr = e.date ? PCD.fmtDate(new Date(e.date).getTime()) : '';
        html +=
          '<div class="list-item" data-wst="' + e.id + '" style="cursor:pointer;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;">' + PCD.escapeHtml(itemName(e, m.ingMap, m.recipeMap)) + '</div>' +
              '<div class="text-muted text-sm">' + PCD.fmtNumber(e.amount) + ' ' + PCD.escapeHtml(e.unit || '') + ' · ' + PCD.escapeHtml(reasonLabel) + (dateStr ? ' · ' + PCD.escapeHtml(dateStr) : '') + '</div>' +
            '</div>' +
            '<div style="font-weight:700;font-variant-numeric:tabular-nums;color:var(--danger);white-space:nowrap;">' + PCD.fmtMoney(cost) + '</div>' +
            '<button class="icon-btn" data-wdel="' + e.id + '" title="' + PCD.escapeHtml(t('delete')) + '">' + PCD.icon('trash', 16) + '</button>' +
          '</div>';
      });
      html += '</div>';
      listEl.innerHTML = html;

      // direct listeners (no shared-view delegation → no cross-tool leak)
      listEl.querySelectorAll('[data-wdel]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          const id = btn.getAttribute('data-wdel');
          PCD.modal.confirm({ icon: '🗑', iconKind: 'danger', danger: true, title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete') }).then(function (ok) {
            if (!ok) return;
            deleteEntry(id);
            PCD.toast.success(t('item_deleted'));
            render(view);
          });
        });
      });
      listEl.querySelectorAll('[data-wst]').forEach(function (row) {
        row.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest('[data-wdel]')) return;
          openEditor(row.getAttribute('data-wst'));
        });
      });
    }

    const nb = PCD.$('#newWasteBtn', view);
    if (nb) nb.addEventListener('click', function () { openEditor(); });
  }

  // ---------- EDITOR ----------
  function openEditor(id) {
    const t = PCD.i18n.t;
    const m = maps();
    const existing = id ? readWaste().find(function (w) { return w.id === id; }) : null;
    const data = existing ? PCD.clone(existing) : {
      itemType: 'ingredient', ingredientId: '', recipeId: '', customName: '',
      amount: '', unit: 'kg', reason: 'spoilage', costValue: '', date: new Date().toISOString(),
    };

    const ings = PCD.store.listIngredients().slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    const recs = PCD.store.listRecipes().slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    const body = PCD.el('div');

    function collect() {
      const g = function (idd) { const el = PCD.$('#' + idd, body); return el ? el.value : undefined; };
      const ty = PCD.$('#wType', body); if (ty) data.itemType = ty.value;
      if (data.itemType === 'ingredient') { const v = g('wIng'); if (v !== undefined) data.ingredientId = v; }
      if (data.itemType === 'recipe') { const v = g('wRec'); if (v !== undefined) data.recipeId = v; }
      if (data.itemType === 'custom') { const v = g('wCustom'); if (v !== undefined) data.customName = v; const c = g('wCost'); if (c !== undefined) data.costValue = c; }
      const a = g('wAmount'); if (a !== undefined) data.amount = a;
      const u = g('wUnit'); if (u !== undefined) data.unit = u;
      if (data.itemType === 'recipe') data.unit = 'srv';
      const rs = g('wReason'); if (rs !== undefined) data.reason = rs;
    }
    function updatePrev() {
      const prev = PCD.$('#wCostPrev', body);
      if (!prev) return;
      const c = computeCost(data, m.ingMap, m.recipeMap);
      prev.innerHTML = PCD.escapeHtml(t('waste_loss')) + ': <span style="color:var(--danger);font-variant-numeric:tabular-nums;font-weight:700;">' + PCD.fmtMoney(c) + '</span>';
    }
    function renderForm() {
      body.innerHTML =
        '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_item_type')) + '</label>' +
          '<select class="select" id="wType">' +
            '<option value="ingredient"' + (data.itemType === 'ingredient' ? ' selected' : '') + '>' + PCD.escapeHtml(t('waste_type_ingredient')) + '</option>' +
            '<option value="recipe"' + (data.itemType === 'recipe' ? ' selected' : '') + '>' + PCD.escapeHtml(t('waste_type_recipe')) + '</option>' +
            '<option value="custom"' + (data.itemType === 'custom' ? ' selected' : '') + '>' + PCD.escapeHtml(t('waste_type_custom')) + '</option>' +
          '</select></div>' +
        (data.itemType === 'ingredient' ?
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_ingredient')) + '</label><select class="select" id="wIng"><option value="">—</option>' +
            ings.map(function (i) { return '<option value="' + i.id + '"' + (data.ingredientId === i.id ? ' selected' : '') + '>' + PCD.escapeHtml(i.name) + '</option>'; }).join('') +
          '</select></div>' : '') +
        (data.itemType === 'recipe' ?
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_recipe')) + '</label><select class="select" id="wRec"><option value="">—</option>' +
            recs.map(function (r) { return '<option value="' + r.id + '"' + (data.recipeId === r.id ? ' selected' : '') + '>' + PCD.escapeHtml(r.name) + '</option>'; }).join('') +
          '</select></div>' : '') +
        (data.itemType === 'custom' ?
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_custom_name')) + '</label><input type="text" class="input" id="wCustom" value="' + PCD.escapeHtml(data.customName || '') + '"></div>' : '') +
        '<div class="field-row">' +
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(data.itemType === 'recipe' ? t('waste_servings') : t('waste_amount')) + '</label><input type="number" class="input" id="wAmount" value="' + (data.amount != null && data.amount !== '' ? data.amount : '') + '" step="0.01" min="0" placeholder="0"></div>' +
          (data.itemType === 'recipe' ? '' :
            '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_unit')) + '</label><select class="select" id="wUnit">' + UNITS.map(function (u) { return '<option value="' + u + '"' + (data.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div>') +
        '</div>' +
        (data.itemType === 'custom' ?
          '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_cost_value')) + '</label><input type="number" class="input" id="wCost" value="' + (data.costValue != null && data.costValue !== '' ? data.costValue : '') + '" step="0.01" min="0" placeholder="0"></div>' : '') +
        '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('waste_reason')) + '</label><select class="select" id="wReason">' +
          REASONS.map(function (r) { return '<option value="' + r + '"' + (data.reason === r ? ' selected' : '') + '>' + PCD.escapeHtml(t('waste_reason_' + r)) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field-hint" id="wCostPrev" style="font-size:14px;margin-top:4px;"></div>' +
        (data.itemType === 'ingredient' ?
          '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;"><input type="checkbox" id="wDeduct" style="width:18px;height:18px;flex-shrink:0;"> <span>' + PCD.escapeHtml(t('waste_deduct_stock')) + '</span></label>' : '');

      const ty = PCD.$('#wType', body);
      if (ty) ty.addEventListener('change', function () { collect(); data.itemType = this.value; renderForm(); });
      ['wIng', 'wRec', 'wCustom', 'wAmount', 'wUnit', 'wCost', 'wReason'].forEach(function (idd) {
        const el = PCD.$('#' + idd, body);
        if (!el) return;
        el.addEventListener('input', function () { collect(); updatePrev(); });
        el.addEventListener('change', function () { collect(); updatePrev(); });
      });
      updatePrev();
    }
    renderForm();

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    let delBtn = null;
    if (existing) { delBtn = PCD.el('button', { class: 'btn btn-danger', text: t('delete') }); footer.appendChild(delBtn); }
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const modal = PCD.modal.open({ title: existing ? t('waste_edit') : t('waste_log_btn'), body: body, footer: footer, size: 'md', closable: true });

    cancelBtn.addEventListener('click', function () { modal.close(); });
    if (delBtn) delBtn.addEventListener('click', function () {
      deleteEntry(existing.id);
      PCD.toast.success(t('item_deleted'));
      modal.close();
      setTimeout(function () { const v = PCD.$('#view'); if (v && PCD.router.currentView() === 'waste') render(v); }, 200);
    });
    saveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      collect();
      if (data.itemType === 'ingredient' && !data.ingredientId) { PCD.toast.error(t('waste_pick_ingredient')); return; }
      if (data.itemType === 'recipe' && !data.recipeId) { PCD.toast.error(t('waste_pick_recipe')); return; }
      if (data.itemType === 'custom' && !(data.customName || '').trim()) { PCD.toast.error(t('waste_enter_name')); return; }
      if (!(Number(data.amount) > 0)) { PCD.toast.error(t('waste_enter_amount')); return; }
      if (!data.date) data.date = new Date().toISOString();
      const wantDeduct = data.itemType === 'ingredient' && PCD.$('#wDeduct', body) && PCD.$('#wDeduct', body).checked;
      const entry = saveEntry(data);
      if (wantDeduct && PCD.tools.inventory && PCD.tools.inventory.applyStockDeductions) {
        const ing = m.ingMap[entry.ingredientId];
        let amt = Number(entry.amount) || 0;
        if (entry.unit && ing && ing.unit && entry.unit !== ing.unit) {
          try { amt = PCD.convertUnit(amt, entry.unit, ing.unit); } catch (e) { /* */ }
        }
        if (amt > 0) {
          const rep = PCD.tools.inventory.applyStockDeductions({ [entry.ingredientId]: amt });
          const tracked = (rep || []).filter(function (r) { return r.tracked; }).length;
          if (tracked) PCD.toast.info((t('waste_deducted') || '{n} deducted from stock').replace('{n}', tracked));
        }
      }
      PCD.toast.success(t('saved'));
      modal.close();
      setTimeout(function () { const v = PCD.$('#view'); if (v && PCD.router.currentView() === 'waste') render(v); }, 200);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.waste = { render: render, openEditor: openEditor };
})();
