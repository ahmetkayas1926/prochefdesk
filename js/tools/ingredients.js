/* ================================================================
   ProChefDesk — ingredients.js
   Ingredient management:
   - List with bulk select + delete (works on mobile)
   - Add/edit modal (category, unit, price, supplier)
   - Price history tracked automatically
   - CSV import
   - FIX: New ingredient visible in list immediately
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const ING_CATEGORIES = ['cat_meat', 'cat_poultry', 'cat_seafood', 'cat_dairy', 'cat_produce', 'cat_dry_goods', 'cat_spices', 'cat_oils', 'cat_beverages', 'cat_baking', 'cat_other'];
  const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pcs', 'unit'];

  let selectMode = false;
  let selectedIds = new Set();

  function renderList(view) {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('ingredients_title')}</div>
          <div class="page-subtitle">${ings.length} items</div>
        </div>
        <div class="page-header-actions">
          ${ings.length > 0 ? `<button class="btn btn-outline btn-sm" id="toggleSelIng">${PCD.icon('check-square',14)} ${t('select_mode')}</button>` : ''}
          <button class="btn btn-outline btn-sm" id="importBtn" title="${t('ingredients_import_title') || 'Bulk import'}">${PCD.icon('upload',14)} ${t('ingredients_import') || 'Import'}</button>
          <button class="btn btn-primary" id="newIngBtn">${PCD.icon('plus',14)} ${t('new_ingredient')}</button>
        </div>
      </div>

      <div class="searchbar mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>
        <input type="search" id="ingSearch" placeholder="${t('search_ingredients_placeholder')}" autocomplete="off">
      </div>

      <div id="bulkBarI" class="card" style="display:none;padding:10px 12px;margin-bottom:12px;background:var(--brand-50);border-color:var(--brand-300);position:sticky;top:0;z-index:5;">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <label class="checkbox" style="min-height:auto;"><input type="checkbox" id="selAllI"><span class="text-sm font-semibold"><span id="selCountI">0</span> ${t('selected')}</span></label>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-danger btn-sm" id="bulkDeleteI">${PCD.icon('trash',14)} ${t('delete')}</button>
            <button class="btn btn-ghost btn-sm" id="exitSelectI">${t('cancel')}</button>
          </div>
        </div>
      </div>

      <div id="ingListView"></div>
    `;

    const listEl = PCD.$('#ingListView', view);
    let filter = '';

    function paint() {
      PCD.clear(listEl);
      let visible = ings;
      if (filter) {
        const q = filter.toLowerCase();
        visible = ings.filter(function (i) { return (i.name || '').toLowerCase().indexOf(q) >= 0; });
      }
      if (visible.length === 0 && !filter) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">🥕</div>
            <div class="empty-title">${t('no_ingredients_yet')}</div>
            <div class="empty-desc">${t('no_ingredients_yet_desc')}</div>
            <div class="empty-action"><button class="btn btn-primary" id="emptyNewIng">+ ${t('new_ingredient')}</button></div>
          </div>
        `;
        const btn = PCD.$('#emptyNewIng', listEl);
        if (btn) btn.addEventListener('click', function () { openEditor(); });
        return;
      }
      if (visible.length === 0) {
        listEl.innerHTML = '<div class="empty"><div class="empty-desc">No results</div></div>';
        return;
      }

      // Group by category
      const groups = {};
      visible.forEach(function (i) {
        const cat = i.category || 'cat_other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(i);
      });

      Object.keys(groups).forEach(function (cat) {
        const section = PCD.el('div', { class: 'section' });
        section.appendChild(PCD.el('div', {
          class: 'section-title',
          style: { fontSize: '13px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' },
          text: t(cat)
        }));
        const inner = PCD.el('div', { class: 'flex flex-col gap-2' });
        groups[cat].forEach(function (i) {
          const row = PCD.el('div', { class: 'list-item', 'data-iid': i.id });
          const thumb = PCD.el('div', { class: 'list-item-thumb' });
          thumb.textContent = (i.name || '?').charAt(0).toUpperCase();
          const bodyDiv = PCD.el('div', { class: 'list-item-body' });
          // Compute price trend indicator if priceHistory exists
          const hist = (i.priceHistory || []).slice();
          let trendHtml = '';
          if (hist.length >= 1) {
            // Latest history entry's price vs current
            const last = hist[hist.length - 1];
            const cur = Number(i.pricePerUnit) || 0;
            const prev = Number(last.price) || 0;
            if (prev && cur && prev !== cur) {
              const up = cur > prev;
              trendHtml = '<span data-hist="' + i.id + '" style="color:' + (up ? 'var(--danger)' : 'var(--success)') + ';font-weight:700;cursor:pointer;font-size:11px;" title="' + PCD.escapeHtml(t('price_history_tooltip')) + '">' +
                (up ? '▲' : '▼') + ' ' + Math.abs(((cur-prev)/prev)*100).toFixed(0) + '%</span>';
            }
          }
          bodyDiv.innerHTML = `
            <div class="list-item-title">${PCD.escapeHtml(i.name)}</div>
            <div class="list-item-meta">
              <span>${PCD.fmtMoney(i.pricePerUnit)} / ${i.unit}</span>
              ${trendHtml ? '<span>·</span>' + trendHtml : ''}
              ${i.supplier ? '<span>·</span><span>' + PCD.escapeHtml(i.supplier) + '</span>' : ''}
            </div>
          `;
          row.appendChild(thumb);
          row.appendChild(bodyDiv);

          if (selectMode) {
            const cb = PCD.el('input', { type: 'checkbox', class: 'select-cb-i' });
            cb.style.width = '20px'; cb.style.height = '20px'; cb.style.flexShrink = '0';
            cb.checked = selectedIds.has(i.id);
            cb.addEventListener('click', function (e) { e.stopPropagation(); });
            cb.addEventListener('change', function () {
              if (cb.checked) selectedIds.add(i.id); else selectedIds.delete(i.id);
              updateBulkBar();
            });
            row.insertBefore(cb, row.firstChild);
          }
          inner.appendChild(row);
        });
        section.appendChild(inner);
        listEl.appendChild(section);
      });
    }

    function updateBulkBar() {
      const bar = PCD.$('#bulkBarI', view);
      if (!bar) return;
      bar.style.display = selectMode ? '' : 'none';
      PCD.$('#selCountI', view).textContent = selectedIds.size;
    }

    function enterSelect() { selectMode = true; selectedIds = new Set(); paint(); updateBulkBar(); }
    function exitSelect() { selectMode = false; selectedIds = new Set(); paint(); updateBulkBar(); }

    PCD.$('#newIngBtn', view).addEventListener('click', function () { openEditor(); });
    const importBtn = PCD.$('#importBtn', view);
    if (importBtn) importBtn.addEventListener('click', function () { openImportDialog(); });
    const togSel = PCD.$('#toggleSelIng', view);
    if (togSel) togSel.addEventListener('click', enterSelect);
    PCD.$('#exitSelectI', view).addEventListener('click', exitSelect);
    PCD.$('#selAllI', view).addEventListener('change', function () {
      const visible = ings.filter(function (i) { return !filter || (i.name || '').toLowerCase().indexOf(filter.toLowerCase()) >= 0; });
      if (this.checked) visible.forEach(function (i) { selectedIds.add(i.id); });
      else selectedIds.clear();
      paint();
      updateBulkBar();
    });
    PCD.$('#bulkDeleteI', view).addEventListener('click', function () {
      if (selectedIds.size === 0) return;
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: PCD.i18n.t('confirm_delete_n').replace('{n}', selectedIds.size),
        text: PCD.i18n.t('confirm_delete_desc'),
        okText: PCD.i18n.t('delete')
      }).then(function (ok) {
        if (!ok) return;
        // v2.6.36: split selection into "safe to delete" vs "in use".
        // Ingredients that are referenced by any recipe stay alive so
        // recipes don't end up with broken "(removed)" lines.
        const ingMap = currentIngMap();
        const safeIds = [];
        const blocked = []; // { name, recipes: [...] }
        Array.from(selectedIds).forEach(function (id) {
          const usedIn = (PCD.store.findRecipesUsingIngredient && PCD.store.findRecipesUsingIngredient(id)) || [];
          if (usedIn.length === 0) {
            safeIds.push(id);
          } else {
            const ing = ingMap[id];
            blocked.push({ name: (ing && ing.name) || '?', recipes: usedIn });
          }
        });

        let deletedCount = 0;
        if (safeIds.length > 0) {
          deletedCount = PCD.store.deleteIngredients(safeIds);
        }

        // Result feedback
        if (blocked.length === 0) {
          // Pure success
          PCD.toast.success(PCD.i18n.t('items_deleted').replace('{n}', deletedCount));
        } else {
          // Mixed or all-blocked — show explanatory modal
          showBulkDeleteResult(deletedCount, blocked);
        }

        selectedIds = new Set(); selectMode = false;
        renderList(view);
      });
    });

    PCD.$('#ingSearch', view).addEventListener('input', PCD.debounce(function (e) {
      filter = e.target.value;
      paint();
    }, 150));

    PCD.on(listEl, 'click', '[data-hist]', function (e) {
      e.stopPropagation();
      openPriceHistory(this.getAttribute('data-hist'));
    });

    PCD.on(listEl, 'click', '[data-iid]', function (e) {
      if (e.target.closest('.select-cb-i')) return;
      if (e.target.closest('[data-hist]')) return;
      if (selectMode) {
        const cb = this.querySelector('.select-cb-i');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
      }
      openEditor(this.getAttribute('data-iid'));
    });

    paint();
  }

  function openPriceHistory(iid) {
    const ing = PCD.store.getIngredient(iid);
    if (!ing) return;
    const hist = (ing.priceHistory || []).slice();
    // Prepend current price as "now"
    const now = { at: ing.updatedAt || new Date().toISOString(), price: ing.pricePerUnit, current: true };
    const series = hist.concat([now]).slice(-10);

    const body = PCD.el('div');
    if (series.length < 2) {
      body.innerHTML = '<div class="empty"><div class="empty-desc">No price history yet. Price changes will be tracked automatically.</div></div>';
    } else {
      // Simple SVG line chart
      const W = 540, H = 160, pad = 24;
      const prices = series.map(function (s) { return s.price || 0; });
      const min = Math.min.apply(null, prices);
      const max = Math.max.apply(null, prices);
      const range = max - min || 1;
      const step = (W - pad * 2) / (series.length - 1);
      let path = '';
      let dots = '';
      series.forEach(function (s, i) {
        const x = pad + i * step;
        const y = H - pad - ((s.price - min) / range) * (H - pad * 2);
        path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1);
        dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="var(--brand-600)"/>';
      });
      const rows = series.slice().reverse().map(function (s, idx) {
        const realIdx = series.length - 1 - idx;
        const prev = realIdx > 0 ? series[realIdx - 1].price : null;
        const change = prev !== null ? s.price - prev : 0;
        const up = change > 0;
        const color = change === 0 ? 'var(--text-3)' : (up ? 'var(--danger)' : 'var(--success)');
        const arrow = change === 0 ? '—' : (up ? '▲' : '▼');
        const d = new Date(s.at);
        return '<tr><td style="padding:6px 10px;font-size:12px;color:var(--text-3);">' + PCD.fmtDate(d, {month:'short',day:'numeric',year:'numeric'}) + '</td>' +
          '<td style="padding:6px 10px;font-family:var(--font-mono);font-weight:600;">' + PCD.fmtMoney(s.price) + '/' + ing.unit + '</td>' +
          '<td style="padding:6px 10px;color:' + color + ';font-weight:600;font-size:12px;">' + arrow + (change !== 0 ? ' ' + PCD.fmtMoney(Math.abs(change)) : '') + '</td></tr>';
      }).join('');
      body.innerHTML =
        '<div style="padding:8px 0;margin-bottom:12px;">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
            '<path d="' + path + '" fill="none" stroke="var(--brand-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            dots +
          '</svg>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;">' +
          '<thead><tr><th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Date</th>' +
          '<th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Price</th>' +
          '<th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Change</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>';
    }

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({
      title: ing.name + ' — Price History',
      body: body, footer: footer, size: 'md', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  function openEditor(iid, callback) {
    const t = PCD.i18n.t;
    const existing = iid ? PCD.store.getIngredient(iid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', unit: 'g', pricePerUnit: 0, supplier: '', category: 'cat_other'
    };

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="field">
        <label class="field-label">${t('ingredient_name')} *</label>
        <input type="text" class="input" id="ingName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('ingredient_name_placeholder')}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">${t('ingredient_category')}</label>
          <select class="select" id="ingCategory">
            ${ING_CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + t(c) + '</option>'; }).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">${t('ingredient_unit')}</label>
          <select class="select" id="ingUnit">
            ${UNITS.map(function (u) { return '<option value="' + u + '"' + (data.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">${t('ingredient_price')}</label>
        <div class="input-group">
          <span class="input-group-addon" id="priceSymbol">$</span>
          <input type="number" class="input" id="ingPrice" value="${data.pricePerUnit || 0}" step="0.001" min="0">
          <span class="input-group-addon">/ <span id="unitSymbol">${data.unit}</span></span>
        </div>
        <div class="field-hint">${t('price_per_unit').replace('{unit}', data.unit)}</div>
      </div>
      <div class="field">
        <label class="field-label">${t('ingredient_supplier')}</label>
        <input type="text" class="input" id="ingSupplier" value="${PCD.escapeHtml(data.supplier || '')}">
      </div>
      <div class="field">
        <label class="field-label">${t('ing_yield_label')}</label>
        <div class="input-group">
          <input type="number" class="input" id="ingYield" value="${data.yieldPercent || ''}" step="1" min="1" max="100" placeholder="100">
          <span class="input-group-addon">%</span>
        </div>
        <div class="field-hint">${t('ing_yield_hint')}</div>
        ${data.pricePerUnit && data.yieldPercent && data.yieldPercent < 100 ? `
          <div class="text-sm mt-2" style="padding:8px 10px;background:var(--brand-50);border-radius:var(--r-sm);color:var(--brand-700);font-weight:600;">
            ${t('ing_true_cost')}: ${PCD.fmtMoney((data.pricePerUnit / (data.yieldPercent / 100)))} / ${data.unit}
          </div>
        ` : ''}
      </div>

      ${existing && existing.priceHistory && existing.priceHistory.length > 0 ? `
        <div class="section">
          <div class="section-title" style="font-size:14px;color:var(--text-3);margin-bottom:6px;">${t('price_history')}</div>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-md);padding:8px;">
            ${existing.priceHistory.slice(-10).reverse().map(function (h) {
              return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed var(--border);"><span class="text-muted">' + PCD.fmtDate(h.at) + '</span><span>' + PCD.fmtMoney(h.price) + '</span></div>';
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Update symbol on unit change
    PCD.$('#ingUnit', body).addEventListener('change', function () {
      PCD.$('#unitSymbol', body).textContent = this.value;
    });
    // Currency symbol
    const curCode = PCD.store.get('prefs.currency') || 'USD';
    const curCfg = (window.PCD_CONFIG.CURRENCIES || []).find(function (c) { return c.code === curCode; });
    PCD.$('#priceSymbol', body).textContent = curCfg ? curCfg.symbol : '$';

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('edit') + ' · ' + existing.name : t('new_ingredient'),
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); if (callback) callback(null); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      // v2.6.36: block deletion if ingredient is used in any recipe.
      // Prevents recipes from showing "(removed)" lines and silent
      // cost-calculation breakage.
      const usedIn = (PCD.store.findRecipesUsingIngredient && PCD.store.findRecipesUsingIngredient(existing.id)) || [];
      if (usedIn.length > 0) {
        const previewList = usedIn.slice(0, 5);
        const more = usedIn.length - previewList.length;
        let listText = '• ' + previewList.join('\n• ');
        if (more > 0) listText += '\n• … +' + more;
        PCD.modal.confirm({
          icon: '⚠', iconKind: 'warning',
          title: t('ing_cannot_delete') || 'Silinemez',
          text: (t('ing_used_in_n') || 'Bu malzeme {n} tarifte kullanılıyor:').replace('{n}', usedIn.length) + '\n\n' +
                listText + '\n\n' +
                (t('ing_remove_first') || 'Önce bu tariflerden çıkar, sonra tekrar dene.'),
          okText: t('ok') || 'Tamam',
          cancelText: null,
        });
        return;
      }
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteIngredient(existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(view);
      });
    });
    saveBtn.addEventListener('click', function () {
      data.name = PCD.$('#ingName', body).value.trim();
      data.category = PCD.$('#ingCategory', body).value;
      data.unit = PCD.$('#ingUnit', body).value;
      data.pricePerUnit = parseFloat(PCD.$('#ingPrice', body).value) || 0;
      data.supplier = PCD.$('#ingSupplier', body).value.trim();
      const yld = PCD.$('#ingYield', body);
      if (yld) {
        const v = parseFloat(yld.value);
        data.yieldPercent = (!isNaN(v) && v > 0 && v <= 100) ? v : null;
      }

      if (!data.name) {
        PCD.toast.error(t('ingredient_name') + ' ' + t('required'));
        return;
      }

      if (existing) data.id = existing.id;
      const saved = PCD.store.upsertIngredient(data);
      PCD.toast.success(t('ingredient_saved'));
      m.close();
      // FIX: Force re-render so new item appears immediately
      setTimeout(function () {
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(view);
        if (callback) callback(saved);
      }, 250);
    });
  }

  // ============ BULK IMPORT ============
  function openImportDialog() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');

    body.innerHTML = `
      <div style="padding:12px;background:var(--surface-2);border-radius:var(--r-sm);margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">${t('import_format_title') || 'Format'}</div>
        <div class="text-muted" style="font-size:13px;line-height:1.6;">
          ${t('import_format_desc') || 'Paste CSV/TSV or upload a file. Columns in this order:'}
        </div>
        <pre style="background:var(--surface);padding:10px;border-radius:var(--r-sm);margin-top:8px;font-family:var(--font-mono);font-size:12px;overflow-x:auto;border:1px solid var(--border);"><code>Name,Price,Unit,Category,Supplier
Olive oil,0.012,ml,cat_oils,Perth Fresh
Chicken breast,0.018,g,cat_poultry,Meat Co
Tomato,0.005,g,cat_produce,
Pasta,0.003,g,cat_dry_goods,</code></pre>
        <div class="text-muted" style="font-size:11px;margin-top:6px;">
          <strong>Price</strong> is per unit (g / ml / pcs). Category and Supplier are optional.<br>
          Supported units: <code>g, kg, ml, l, tsp, tbsp, cup, oz, lb, pcs, unit</code><br>
          Supported categories: <code>cat_meat, cat_poultry, cat_seafood, cat_dairy, cat_produce, cat_dry_goods, cat_spices, cat_oils, cat_beverages, cat_baking, cat_other</code>
        </div>
      </div>

      <div class="field">
        <label class="field-label">${t('import_paste') || 'Paste CSV/TSV'}</label>
        <textarea class="textarea" id="importText" rows="8" placeholder="Name,Price,Unit,Category,Supplier&#10;Olive oil,0.012,ml,cat_oils,Perth Fresh" style="font-family:var(--font-mono);font-size:13px;"></textarea>
      </div>

      <div class="flex gap-2 items-center mb-2">
        <div style="height:1px;flex:1;background:var(--border);"></div>
        <div class="text-muted text-sm">or</div>
        <div style="height:1px;flex:1;background:var(--border);"></div>
      </div>

      <div class="field">
        <input type="file" id="importFile" accept=".csv,.tsv,.txt,.xlsx" style="display:none;">
        <button class="btn btn-outline btn-block" id="pickFileBtn">${PCD.icon('upload',16)} ${t('import_upload_file') || 'Upload CSV or Excel file'}</button>
        <div class="field-hint">${t('import_file_hint') || 'Supports .csv, .tsv, or .xlsx (Excel)'}</div>
      </div>

      <div id="importPreview"></div>
    `;

    let parsed = null;

    const fileInp = PCD.$('#importFile', body);
    PCD.$('#pickFileBtn', body).addEventListener('click', function () { fileInp.click(); });

    fileInp.addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const name = f.name.toLowerCase();
      if (name.endsWith('.xlsx')) {
        // Parse XLSX — use SheetJS if available, else inform user
        loadSheetJS(function (err, XLSX) {
          if (err) {
            PCD.toast.error('Excel parser failed to load. Try CSV export instead.');
            return;
          }
          const reader = new FileReader();
          reader.onload = function (evt) {
            try {
              const data = new Uint8Array(evt.target.result);
              const wb = XLSX.read(data, { type: 'array' });
              const sheet = wb.Sheets[wb.SheetNames[0]];
              const csv = XLSX.utils.sheet_to_csv(sheet);
              PCD.$('#importText', body).value = csv;
              previewParse(csv);
            } catch (err) {
              PCD.toast.error('Could not parse Excel file: ' + err.message);
            }
          };
          reader.readAsArrayBuffer(f);
        });
      } else {
        const reader = new FileReader();
        reader.onload = function (evt) {
          PCD.$('#importText', body).value = evt.target.result;
          previewParse(evt.target.result);
        };
        reader.readAsText(f);
      }
    });

    const importTextEl = PCD.$('#importText', body);
    importTextEl.addEventListener('input', PCD.debounce(function () {
      previewParse(this.value);
    }, 300));

    function previewParse(text) {
      const prev = PCD.$('#importPreview', body);
      if (!text || !text.trim()) { prev.innerHTML = ''; parsed = null; return; }
      const rows = parseCSV(text);
      parsed = rows;
      if (!rows.length) {
        prev.innerHTML = '<div class="text-muted text-sm mt-2">Could not parse.</div>';
        return;
      }
      prev.innerHTML = `
        <div class="mt-3" style="padding:10px;background:var(--brand-50);border-radius:var(--r-sm);">
          <strong>${rows.length}</strong> rows detected. First 3:
          <div style="margin-top:6px;font-family:var(--font-mono);font-size:12px;color:var(--text-2);">
            ${rows.slice(0, 3).map(function (r) { return PCD.escapeHtml(r.name) + ' · $' + r.pricePerUnit + '/' + r.unit + (r.category ? ' · ' + r.category : '') + (r.supplier ? ' · ' + r.supplier : ''); }).join('<br>')}
          </div>
        </div>
      `;
    }

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const importGoBtn = PCD.el('button', { class: 'btn btn-primary', text: t('import_go') || 'Import', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(importGoBtn);

    const m = PCD.modal.open({
      title: t('ingredients_import') || 'Bulk Import',
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    importGoBtn.addEventListener('click', function () {
      if (!parsed || !parsed.length) { PCD.toast.error('Nothing to import'); return; }
      let added = 0, updated = 0;
      const existing = {};
      PCD.store.listIngredients().forEach(function (i) { existing[i.name.toLowerCase()] = i; });
      parsed.forEach(function (row) {
        const key = row.name.toLowerCase();
        if (existing[key]) {
          // Update existing: price, unit, category, supplier
          const ing = existing[key];
          ing.pricePerUnit = row.pricePerUnit;
          if (row.unit) ing.unit = row.unit;
          if (row.category) ing.category = row.category;
          if (row.supplier) ing.supplier = row.supplier;
          PCD.store.upsertIngredient(ing);
          updated++;
        } else {
          PCD.store.upsertIngredient({
            name: row.name,
            unit: row.unit || 'g',
            pricePerUnit: row.pricePerUnit,
            category: row.category || 'cat_other',
            supplier: row.supplier || '',
          });
          added++;
        }
      });
      PCD.toast.success('Imported: ' + added + ' new, ' + updated + ' updated');
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(v);
      }, 150);
    });
  }

  // ============ BULK DELETE RESULT MODAL (v2.6.36) ============
  // Shown after a bulk delete when at least one ingredient was kept
  // because it's used in recipes. Tells the chef exactly what happened.
  function showBulkDeleteResult(deletedCount, blocked) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    let html = '';
    if (deletedCount > 0) {
      html += '<div style="padding:10px 12px;background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;margin-bottom:12px;font-weight:600;color:#15803d;">' +
        '✓ ' + (t('ing_bulk_deleted') || '{n} malzeme silindi').replace('{n}', deletedCount) +
      '</div>';
    }
    html += '<div style="padding:10px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:13px;line-height:1.5;color:#92400e;">' +
      '<div style="font-weight:700;margin-bottom:6px;">⚠ ' +
        (t('ing_bulk_blocked') || '{n} malzeme kullanımda olduğu için silinmedi:').replace('{n}', blocked.length) +
      '</div>' +
      '<ul style="margin:6px 0 0;padding-inline-start:20px;max-height:240px;overflow-y:auto;">';
    blocked.forEach(function (b) {
      const recipesPreview = b.recipes.slice(0, 3);
      const more = b.recipes.length - recipesPreview.length;
      let recipesStr = recipesPreview.map(PCD.escapeHtml).join(', ');
      if (more > 0) recipesStr += ' +' + more;
      const recipesLabel = b.recipes.length === 1
        ? '1 ' + (t('cr_recipe') || 'tarif').toLowerCase()
        : b.recipes.length + ' ' + (t('cr_recipe') || 'tarif').toLowerCase();
      html += '<li style="margin-bottom:4px;"><strong>' + PCD.escapeHtml(b.name) + '</strong> <span style="color:#78350f;">(' + recipesLabel + ': ' + recipesStr + ')</span></li>';
    });
    html += '</ul></div>';
    body.innerHTML = html;

    const okBtn = PCD.el('button', { class: 'btn btn-primary', text: t('close') || 'Kapat', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(okBtn);

    const m = PCD.modal.open({
      title: deletedCount > 0
        ? (t('ing_bulk_partial_title') || 'Silme tamamlandı (kısmen)')
        : (t('ing_bulk_blocked_title') || 'Hiçbir malzeme silinmedi'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    okBtn.addEventListener('click', function () { m.close(); });
  }

  // CSV/TSV parser
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
    if (!lines.length) return [];
    // Detect separator
    const sep = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    // Check if first line is header
    const firstCells = splitLine(lines[0], sep);
    const hasHeader = firstCells.length >= 2 && /name/i.test(firstCells[0]) && /price/i.test(firstCells[1] || '');
    const rows = [];
    (hasHeader ? lines.slice(1) : lines).forEach(function (line) {
      const cells = splitLine(line, sep);
      if (cells.length < 2) return;
      const name = (cells[0] || '').trim();
      const price = parseFloat((cells[1] || '').replace(/[^0-9.\-]/g, ''));
      if (!name || isNaN(price)) return;
      // Normalize unit case so 'L'/'KG'/'ML' (common in invoices) match
      // the lowercase canonical units (l, kg, ml). Without this the unit
      // would be saved as 'L', not appear in the dropdown, and break
      // unit conversion in recipe lines.
      let rawUnit = (cells[2] || '').trim() || 'g';
      const lcUnit = rawUnit.toLowerCase();
      if (UNITS.indexOf(lcUnit) >= 0) rawUnit = lcUnit;
      rows.push({
        name: name,
        pricePerUnit: price,
        unit: rawUnit,
        category: (cells[3] || '').trim() || 'cat_other',
        supplier: (cells[4] || '').trim() || '',
      });
    });
    return rows;
  }

  function splitLine(line, sep) {
    // Simple CSV split with basic quote handling
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === sep && !inQuote) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  // Load SheetJS from CDN on demand
  let sheetJSLoading = null;
  function loadSheetJS(cb) {
    if (window.XLSX) return cb(null, window.XLSX);
    if (sheetJSLoading) { sheetJSLoading.push(cb); return; }
    sheetJSLoading = [cb];
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = function () {
      const q = sheetJSLoading; sheetJSLoading = null;
      q.forEach(function (c) { c(null, window.XLSX); });
    };
    script.onerror = function () {
      const q = sheetJSLoading; sheetJSLoading = null;
      q.forEach(function (c) { c(new Error('load failed')); });
    };
    document.head.appendChild(script);
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.ingredients = {
    render: renderList,
    openEditor: openEditor,
  };
})();
