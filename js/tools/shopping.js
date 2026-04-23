/* ================================================================
   ProChefDesk — shopping.js
   Shopping List tool:
   - Pick recipes + portion counts
   - Consolidate identical ingredients across recipes
   - Group by category or supplier
   - Print A4 list with checkboxes
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const lists = PCD.store.listTable('shoppingLists').sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('shopping_title')}</div>
          <div class="page-subtitle">${lists.length} ${lists.length === 1 ? 'list' : 'lists'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newShopBtn">+ ${t('new_shop')}</button>
        </div>
      </div>
      <div id="shopList"></div>
    `;

    const listEl = PCD.$('#shopList', view);

    if (lists.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🛒</div>
          <div class="empty-title">${t('no_shop_yet')}</div>
          <div class="empty-desc">${t('no_shop_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyShopNew">+ ${t('new_shop')}</button></div>
        </div>
      `;
      const btn = PCD.$('#emptyShopNew', listEl);
      if (btn) btn.addEventListener('click', function () { openEditor(); });
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      lists.forEach(function (l) {
        const row = PCD.el('div', { class: 'list-item', 'data-lid': l.id });
        const count = (l.items || []).length;
        row.innerHTML = `
          <div class="list-item-thumb">🛒</div>
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(l.name || t('untitled'))}</div>
            <div class="list-item-meta">
              <span>${t('shop_recipes_count').replace('{n}', count)}</span>
              <span>·</span>
              <span>${PCD.fmtRelTime(l.updatedAt)}</span>
            </div>
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newShopBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-lid]', function () {
      openEditor(this.getAttribute('data-lid'));
    });
  }

  // ============ EDITOR ============
  function openEditor(lid) {
    const t = PCD.i18n.t;
    const existing = lid ? PCD.store.getFromTable('shoppingLists', lid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '',
      items: [], // { recipeId, portions }
      groupBy: 'category',
    };

    const body = PCD.el('div');

    function render() {
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = {};
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

      // Compute consolidated ingredient list
      const consolidated = {}; // key: ingredientId_unit, value: { ingredient, unit, totalAmount, totalCost }
      (data.items || []).forEach(function (it) {
        const r = recipeMap[it.recipeId];
        if (!r) return;
        const factor = (it.portions || r.servings || 1) / (r.servings || 1);
        (r.ingredients || []).forEach(function (ri) {
          const ing = ingMap[ri.ingredientId];
          if (!ing) return;
          const key = ri.ingredientId + '|' + (ri.unit || ing.unit);
          if (!consolidated[key]) {
            consolidated[key] = {
              ingredient: ing,
              unit: ri.unit || ing.unit,
              totalAmount: 0,
              totalCost: 0,
            };
          }
          const amt = (ri.amount || 0) * factor;
          consolidated[key].totalAmount += amt;
          // cost calculation
          let cost = amt * (ing.pricePerUnit || 0);
          if (ri.unit && ing.unit && ri.unit !== ing.unit) {
            try { cost = PCD.convertUnit(amt, ri.unit, ing.unit) * (ing.pricePerUnit || 0); } catch(e){}
          }
          consolidated[key].totalCost += cost;
        });
      });

      const totalCost = Object.values(consolidated).reduce(function (a, c) { return a + c.totalCost; }, 0);

      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('shop_list_name')}</label>
          <input type="text" class="input" id="shopName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('shop_list_name_ph')}">
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('recipes')} (${(data.items || []).length})</div>
            <button class="btn btn-outline btn-sm" id="addRecipesBtn">+ ${t('shop_add_recipe')}</button>
          </div>
          <div id="shopRecipesList" class="flex flex-col gap-2"></div>
        </div>

        ${Object.keys(consolidated).length > 0 ? `
          <div class="section">
            <div class="section-header">
              <div class="section-title">${t('shop_consolidated')}</div>
              <div class="btn-group">
                <button class="btn${data.groupBy === 'category' ? ' active' : ''}" data-group="category">${t('shop_by_category')}</button>
                <button class="btn${data.groupBy === 'supplier' ? ' active' : ''}" data-group="supplier">${t('shop_by_supplier')}</button>
              </div>
            </div>
            <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:12px;">
              <div class="flex items-center justify-between">
                <div>
                  <div class="stat-label">${t('total')}</div>
                  <div style="font-size:22px;font-weight:800;">${PCD.fmtMoney(totalCost)}</div>
                </div>
                <div class="text-muted">${Object.keys(consolidated).length} items</div>
              </div>
            </div>
            <div id="shopConsolidated"></div>
          </div>
        ` : '<div class="empty"><div class="empty-desc">Add recipes to build the list</div></div>'}
      `;

      // Render recipe list
      const recList = PCD.$('#shopRecipesList', body);
      if (recList) {
        (data.items || []).forEach(function (it, idx) {
          const r = recipeMap[it.recipeId];
          if (!r) return;
          const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '10px' } });
          const thumb = PCD.el('div', { class: 'list-item-thumb', style: { width: '44px', height: '44px' } });
          if (r.photo) thumb.style.backgroundImage = 'url(' + r.photo + ')';
          else thumb.textContent = '🍽️';
          const bodyDiv = PCD.el('div', { class: 'list-item-body' });
          bodyDiv.innerHTML = `
            <div class="list-item-title" style="font-size:14px;">${PCD.escapeHtml(r.name)}</div>
            <div class="list-item-meta">
              <input type="number" data-portions="${idx}" value="${it.portions || r.servings || 1}" min="1" class="input" style="width:70px;padding:4px 8px;min-height:28px;font-size:13px;">
              <span class="text-muted">${t('shop_portions').toLowerCase()}</span>
            </div>
          `;
          row.appendChild(thumb);
          row.appendChild(bodyDiv);
          const rm = PCD.el('button', { class: 'icon-btn', 'data-remove-idx': idx });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          recList.appendChild(row);
        });
      }

      // Render consolidated
      const consolEl = PCD.$('#shopConsolidated', body);
      if (consolEl) {
        const groupBy = data.groupBy || 'category';
        const groups = {};
        Object.values(consolidated).forEach(function (c) {
          let key;
          if (groupBy === 'supplier') {
            key = c.ingredient.supplier || '(no supplier)';
          } else {
            key = t(c.ingredient.category || 'cat_other');
          }
          if (!groups[key]) groups[key] = [];
          groups[key].push(c);
        });
        Object.keys(groups).sort().forEach(function (g) {
          const section = PCD.el('div', { style: { marginBottom: '14px' } });
          section.appendChild(PCD.el('div', {
            style: { fontSize: '12px', fontWeight: '700', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' },
            text: g
          }));
          groups[g].forEach(function (c) {
            const row = PCD.el('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                marginBottom: '4px', background: 'var(--surface)', fontSize: '14px'
              }
            });
            row.innerHTML = `
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;">${PCD.escapeHtml(c.ingredient.name)}</div>
                ${c.ingredient.supplier && groupBy !== 'supplier' ? '<div style="font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(c.ingredient.supplier) + '</div>' : ''}
              </div>
              <div style="font-family:var(--font-mono);font-weight:600;text-align:end;">
                <div>${PCD.fmtNumber(c.totalAmount)} ${c.unit}</div>
                <div style="font-size:11px;color:var(--text-3);font-weight:500;">${PCD.fmtMoney(c.totalCost)}</div>
              </div>
            `;
            section.appendChild(row);
          });
          consolEl.appendChild(section);
        });
      }

      wire();
    }

    function wire() {
      // Name input
      const nameEl = PCD.$('#shopName', body);
      if (nameEl) nameEl.addEventListener('input', function () { data.name = this.value; });

      // Add recipes
      const addBtn = PCD.$('#addRecipesBtn', body);
      if (addBtn) addBtn.addEventListener('click', function () {
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: (r.servings || 1) + ' portions', thumb: r.photo || '' };
        });
        if (items.length === 0) {
          PCD.toast.warning(t('no_recipes_yet'));
          return;
        }
        const selected = (data.items || []).map(function (it) { return it.recipeId; });
        PCD.picker.open({
          title: t('shop_add_recipe'),
          items: items,
          multi: true,
          selected: selected
        }).then(function (selIds) {
          if (!selIds) return;
          // Keep existing portion values; add new at default servings
          const existingMap = {};
          (data.items || []).forEach(function (it) { existingMap[it.recipeId] = it; });
          data.items = selIds.map(function (id) {
            if (existingMap[id]) return existingMap[id];
            const r = PCD.store.getRecipe(id);
            return { recipeId: id, portions: r ? (r.servings || 4) : 4 };
          });
          render();
        });
      });

      // Portion inputs
      PCD.on(body, 'input', '[data-portions]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-portions'), 10);
        data.items[idx].portions = parseInt(this.value, 10) || 1;
        render();
      }, 400));

      // Remove recipe
      PCD.on(body, 'click', '[data-remove-idx]', function () {
        const idx = parseInt(this.getAttribute('data-remove-idx'), 10);
        data.items.splice(idx, 1);
        render();
      });

      // Group toggle
      PCD.on(body, 'click', '[data-group]', function () {
        data.groupBy = this.getAttribute('data-group');
        render();
      });
    }

    render();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline', text: t('shop_print') });
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
      title: existing ? (existing.name || t('untitled')) : t('new_shop'),
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('shoppingLists', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'shopping') renderListView(v);
      });
    });
    printBtn.addEventListener('click', function () {
      data.name = (PCD.$('#shopName', body).value || '').trim();
      // Save first so it has id
      const saved = existing ? PCD.store.upsertInTable('shoppingLists', Object.assign({}, existing, data), 's') : PCD.store.upsertInTable('shoppingLists', data, 's');
      m.close();
      setTimeout(function () { openPrintView(saved.id); }, 280);
    });
    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#shopName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(t('shop_list_name') + ' ' + t('required')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('shoppingLists', data, 's');
      PCD.toast.success(t('shop_saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'shopping') renderListView(v);
      }, 250);
    });
  }

  function renderListView(view) { render(view); }

  // ============ PRINT VIEW ============
  function openPrintView(lid) {
    const t = PCD.i18n.t;
    const list = PCD.store.getFromTable('shoppingLists', lid);
    if (!list) return;

    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = {};
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

    const consolidated = {};
    (list.items || []).forEach(function (it) {
      const r = recipeMap[it.recipeId];
      if (!r) return;
      const factor = (it.portions || r.servings || 1) / (r.servings || 1);
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        if (!ing) return;
        const key = ri.ingredientId + '|' + (ri.unit || ing.unit);
        if (!consolidated[key]) {
          consolidated[key] = { ingredient: ing, unit: ri.unit || ing.unit, totalAmount: 0 };
        }
        consolidated[key].totalAmount += (ri.amount || 0) * factor;
      });
    });

    const groupBy = list.groupBy || 'category';
    const groups = {};
    Object.values(consolidated).forEach(function (c) {
      const key = (groupBy === 'supplier') ? (c.ingredient.supplier || '(no supplier)') : t(c.ingredient.category || 'cat_other');
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    let groupsHtml = '';
    Object.keys(groups).sort().forEach(function (g) {
      groupsHtml += '<div class="shop-group"><div class="shop-group-title">' + PCD.escapeHtml(g) + '</div>';
      groups[g].forEach(function (c) {
        groupsHtml += '<div class="shop-row">' +
          '<div class="shop-cb"></div>' +
          '<div class="shop-name">' + PCD.escapeHtml(c.ingredient.name) +
            (c.ingredient.supplier && groupBy !== 'supplier' ? ' <span class="shop-note">· ' + PCD.escapeHtml(c.ingredient.supplier) + '</span>' : '') +
          '</div>' +
          '<div class="shop-amt">' + PCD.fmtNumber(c.totalAmount) + ' ' + c.unit + '</div>' +
        '</div>';
      });
      groupsHtml += '</div>';
    });

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="print-wrap">
        <div class="print-page shop-page">
          <div class="shop-header">
            <h1 class="shop-title">${PCD.escapeHtml(list.name || t('untitled'))}</h1>
            <div class="shop-subtitle">${(list.items || []).length} ${t('recipes').toLowerCase()} · ${PCD.fmtDate(new Date())}</div>
          </div>
          ${groupsHtml || '<div class="empty">No ingredients</div>'}
        </div>
      </div>
    `;

    const printBtn = PCD.el('button', { class: 'btn btn-primary', text: PCD.icon('print',16) + ' ' + t('print'), html: PCD.icon('print',16) + ' ' + t('print') });
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: t('preview') + ' · ' + (list.name || t('untitled')),
      body: body, footer: footer, size: 'xl', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.innerHTML = PCD.icon('print',16) + ' <span>' + t('print') + '</span>';
    printBtn.addEventListener('click', function () { window.print(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.shopping = { render: render, openEditor: openEditor, openPrintView: openPrintView };
})();
