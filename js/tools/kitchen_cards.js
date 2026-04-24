/* ================================================================
   ProChefDesk — kitchen_cards.js
   Kitchen Cards: A4 printable cards for the line. Takes a recipe +
   target yield/station/prep-by, prints beautifully on A4.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const cards = PCD.store.listTable('canvases').sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('kitchen_cards_title')}</div>
          <div class="page-subtitle">${cards.length} ${cards.length === 1 ? 'card' : 'cards'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newKCardBtn">+ ${t('new_kcard')}</button>
        </div>
      </div>
      <div id="kcardList"></div>
    `;

    const listEl = PCD.$('#kcardList', view);
    if (cards.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🗂️</div>
          <div class="empty-title">${t('no_kcards_yet')}</div>
          <div class="empty-desc">${t('no_kcards_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewKCard">+ ${t('new_kcard')}</button></div>
        </div>
      `;
      const b = PCD.$('#emptyNewKCard', listEl);
      if (b) b.addEventListener('click', function () { openEditor(); });
    } else {
      const grid = PCD.el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' } });
      cards.forEach(function (c) {
        const r = c.recipeId ? PCD.store.getRecipe(c.recipeId) : null;
        const cell = PCD.el('div', { class: 'card card-hover', 'data-cid': c.id, style: { padding: '12px' } });
        cell.innerHTML = `
          <div class="list-item-thumb" style="width:100%;height:100px;margin-bottom:10px;border-radius:var(--r-md);${r && r.photo ? 'background-image:url(' + PCD.escapeHtml(r.photo) + ');background-size:cover;background-position:center;' : ''}">${r && r.photo ? '' : '🗂️'}</div>
          <div style="font-weight:700;font-size:14px;letter-spacing:-0.01em;">${PCD.escapeHtml(c.name || (r ? r.name : t('untitled')))}</div>
          <div class="text-muted text-sm">${c.station || '—'} · ${c.yield || ''}p</div>
        `;
        grid.appendChild(cell);
      });
      listEl.appendChild(grid);
    }

    PCD.$('#newKCardBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-cid]', function () {
      openEditor(this.getAttribute('data-cid'));
    });
  }

  function openEditor(cid) {
    const t = PCD.i18n.t;
    const existing = cid ? PCD.store.getFromTable('canvases', cid) : null;
    const data = existing ? PCD.clone(existing) : {
      recipeId: null, name: '', yield: null, station: '', prepBy: '',
    };

    const body = PCD.el('div');

    function render() {
      const r = data.recipeId ? PCD.store.getRecipe(data.recipeId) : null;
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('kcard_choose_recipe')} *</label>
          <button class="btn btn-outline btn-block" id="pickBtn" style="justify-content:flex-start;">
            ${r ? PCD.escapeHtml(r.name) : t('kcard_choose_recipe') + ' →'}
          </button>
        </div>

        ${r ? `
          <div class="field">
            <label class="field-label">${t('kcard_portions')} / ${t('kcard_yield')}</label>
            <input type="number" class="input" id="kcYield" value="${data.yield || r.servings || 4}" min="1">
            <div class="field-hint">${t('kcard_scale_to')}: original ${r.servings || 1}p</div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label">${t('kcard_station')}</label>
              <input type="text" class="input" id="kcStation" value="${PCD.escapeHtml(data.station || '')}" placeholder="Hot / Cold / Pastry">
            </div>
            <div class="field">
              <label class="field-label">${t('kcard_prep_by')}</label>
              <input type="text" class="input" id="kcPrepBy" value="${PCD.escapeHtml(data.prepBy || '')}" placeholder="Chef's name">
            </div>
          </div>
        ` : '<div class="text-muted text-sm">Pick a recipe to configure card</div>'}
      `;

      PCD.$('#pickBtn', body).addEventListener('click', function () {
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: (r.servings || 1) + 'p', thumb: r.photo || '' };
        });
        if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet')); return; }
        PCD.picker.open({
          title: t('kcard_choose_recipe'),
          items: items, multi: false, selected: data.recipeId ? [data.recipeId] : []
        }).then(function (sel) {
          if (sel && sel.length) {
            data.recipeId = sel[0];
            const r2 = PCD.store.getRecipe(data.recipeId);
            data.name = r2.name;
            if (!data.yield) data.yield = r2.servings || 4;
            render();
          }
        });
      });

      const yEl = PCD.$('#kcYield', body);
      if (yEl) yEl.addEventListener('input', function () { data.yield = parseInt(this.value, 10) || null; });
      const sEl = PCD.$('#kcStation', body);
      if (sEl) sEl.addEventListener('input', function () { data.station = this.value; });
      const pEl = PCD.$('#kcPrepBy', body);
      if (pEl) pEl.addEventListener('input', function () { data.prepBy = this.value; });
    }

    render();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline' });
    printBtn.innerHTML = PCD.icon('print',16) + ' ' + t('kcard_print');
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : t('new_kcard'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('canvases', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'kitchen_cards') render(v);
      });
    });
    printBtn.addEventListener('click', function () {
      if (!data.recipeId) { PCD.toast.error(t('kcard_choose_recipe')); return; }
      const saved = existing
        ? PCD.store.upsertInTable('canvases', Object.assign({}, existing, data), 'c')
        : PCD.store.upsertInTable('canvases', data, 'c');
      m.close();
      setTimeout(function () { openPrintView(saved.id); }, 280);
    });
    saveBtn.addEventListener('click', function () {
      if (!data.recipeId) { PCD.toast.error(t('kcard_choose_recipe')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('canvases', data, 'c');
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'kitchen_cards') render(v);
      }, 250);
    });
  }

  // ============ PRINT VIEW ============
  function openPrintView(cid) {
    const t = PCD.i18n.t;
    const card = PCD.store.getFromTable('canvases', cid);
    if (!card || !card.recipeId) return;
    const r = PCD.store.getRecipe(card.recipeId);
    if (!r) return;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    const yield_ = card.yield || r.servings || 1;
    const factor = yield_ / (r.servings || 1);
    const cost = PCD.recipes.computeFoodCost(r, ingMap) * factor;
    const cps = cost / yield_;

    let ingsHtml = '';
    (r.ingredients || []).forEach(function (ri) {
      const ing = ingMap[ri.ingredientId];
      const name = ing ? ing.name : '(?)';
      const amt = (ri.amount || 0) * factor;
      ingsHtml += '<div class="kcard-ing-row">' +
        '<span class="kcard-ing-name">' + PCD.escapeHtml(name) + '</span>' +
        '<span class="kcard-ing-amt">' + PCD.fmtNumber(amt) + ' ' + (ri.unit || '') + '</span>' +
      '</div>';
    });

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="print-wrap">
        <div class="print-page kcard-page">
          <div class="kcard-header">
            <div class="kcard-photo" style="${r.photo ? 'background-image:url(' + PCD.escapeHtml(r.photo) + ');' : ''}"></div>
            <div class="kcard-head-body">
              <h1 class="kcard-title">${PCD.escapeHtml(r.name)}</h1>
              <div class="kcard-meta">
                <span class="kcard-meta-item"><strong>${t('kcard_yield')}:</strong> ${yield_}p</span>
                ${card.station ? '<span class="kcard-meta-item"><strong>' + t('kcard_station') + ':</strong> ' + PCD.escapeHtml(card.station) + '</span>' : ''}
                ${(r.prepTime || r.cookTime) ? '<span class="kcard-meta-item"><strong>Time:</strong> ' + ((r.prepTime || 0) + (r.cookTime || 0)) + 'min</span>' : ''}
                <span class="kcard-meta-item"><strong>${t('cost_per_serving')}:</strong> ${PCD.fmtMoney(cps)}</span>
              </div>
            </div>
          </div>
          <div class="kcard-grid">
            <div>
              <div class="kcard-ings-label">${t('recipe_ingredients')}</div>
              <div class="kcard-ings">${ingsHtml}</div>
            </div>
            <div>
              <div class="kcard-method-label">${t('kcard_method')}</div>
              <div class="kcard-method">${PCD.escapeHtml(r.steps || '')}</div>
            </div>
          </div>
          <div class="kcard-footer">
            <span>${card.prepBy ? t('kcard_prep_by') + ': ' + PCD.escapeHtml(card.prepBy) : ''}</span>
            <span>${PCD.fmtDate(new Date())}</span>
          </div>
        </div>
      </div>
    `;

    const printBtn = PCD.el('button', { class: 'btn btn-primary' });
    printBtn.innerHTML = PCD.icon('print',16) + ' <span>' + t('print') + '</span>';
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: t('preview') + ' · ' + r.name,
      body: body, footer: footer, size: 'xl', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { const wrap = body.querySelector('.print-wrap'); if (wrap) PCD.print(wrap.innerHTML); else window.print(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.kitchenCards = { render: render, openEditor: openEditor, openPrintView: openPrintView };
})();
