/* ================================================================
   ProChefDesk — menus.js
   Menu Builder:
   - Multiple sections (Appetizer, Main, Dessert, etc.)
   - Drag-to-reorder sections and items
   - Per-item description + price override
   - A4 elegant print preview
   - Revenue + avg margin stats
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const DEFAULT_SECTIONS = [
    { id: null, name: 'Appetizers', items: [] },
    { id: null, name: 'Mains',      items: [] },
    { id: null, name: 'Desserts',   items: [] },
  ];

  function render(view) {
    const t = PCD.i18n.t;
    const menus = PCD.store.listTable('menus').sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('menus_title')}</div>
          <div class="page-subtitle">${menus.length} ${menus.length === 1 ? 'menu' : 'menus'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newMenuBtn">+ ${t('new_menu')}</button>
        </div>
      </div>
      <div id="menuList"></div>
    `;

    const listEl = PCD.$('#menuList', view);
    if (menus.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-title">${t('no_menus_yet')}</div>
          <div class="empty-desc">${t('no_menus_yet_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewMenu">+ ${t('new_menu')}</button></div>
        </div>
      `;
      const b = PCD.$('#emptyNewMenu', listEl);
      if (b) b.addEventListener('click', function () { openEditor(); });
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      menus.forEach(function (m) {
        const totalItems = (m.sections || []).reduce(function (a, s) { return a + ((s.items || []).length); }, 0);
        const row = PCD.el('div', { class: 'list-item', 'data-mid': m.id });
        row.innerHTML = `
          <div class="list-item-thumb">📋</div>
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(m.name || t('untitled'))}</div>
            <div class="list-item-meta">
              <span>${(m.sections || []).length} ${t('menu_sections').toLowerCase()}</span>
              <span>·</span>
              <span>${totalItems} ${t('recipes').toLowerCase()}</span>
              <span>·</span>
              <span>${PCD.fmtRelTime(m.updatedAt)}</span>
            </div>
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newMenuBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-mid]', function () {
      openEditor(this.getAttribute('data-mid'));
    });
  }

  // ============ EDITOR ============
  function openEditor(mid) {
    const t = PCD.i18n.t;
    const existing = mid ? PCD.store.getFromTable('menus', mid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '',
      subtitle: '',
      footer: '',
      hidePrices: false,
      sections: DEFAULT_SECTIONS.map(function (s) {
        return { id: PCD.uid('sec'), name: s.name, items: [] };
      }),
    };
    // Ensure existing sections have IDs
    (data.sections || []).forEach(function (s) {
      if (!s.id) s.id = PCD.uid('sec');
      (s.items || []).forEach(function (it) { if (!it.id) it.id = PCD.uid('mi'); });
    });

    const body = PCD.el('div');

    function computeStats() {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      let totalRevenue = 0, marginSum = 0, marginCount = 0;
      (data.sections || []).forEach(function (s) {
        (s.items || []).forEach(function (it) {
          const r = recipeMap[it.recipeId];
          if (!r) return;
          const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r.salePrice || 0);
          totalRevenue += price;
          if (price > 0) {
            const cost = PCD.recipes.computeFoodCost(r, ingMap) / (r.servings || 1);
            const margin = ((price - cost) / price) * 100;
            marginSum += margin;
            marginCount++;
          }
        });
      });
      return {
        totalRevenue: totalRevenue,
        avgMargin: marginCount > 0 ? marginSum / marginCount : null,
      };
    }

    function render() {
      const stats = computeStats();
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('menu_name')} *</label>
          <input type="text" class="input" id="menuName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('menu_name_placeholder')}">
        </div>
        <div class="field">
          <label class="field-label">${t('menu_subtitle_ph')}</label>
          <input type="text" class="input" id="menuSubtitle" value="${PCD.escapeHtml(data.subtitle || '')}">
        </div>

        <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);">
          <div class="flex items-center justify-between">
            <div>
              <div class="stat-label">${t('menu_total_revenue')}</div>
              <div style="font-size:20px;font-weight:800;">${PCD.fmtMoney(stats.totalRevenue)}</div>
            </div>
            ${stats.avgMargin !== null ? '<div style="text-align:right;"><div class="stat-label">' + t('menu_avg_margin') + '</div><div style="font-size:20px;font-weight:800;color:' + (stats.avgMargin >= 65 ? 'var(--success)' : (stats.avgMargin >= 55 ? 'var(--warning)' : 'var(--danger)')) + ';">' + PCD.fmtPercent(stats.avgMargin, 0) + '</div></div>' : ''}
          </div>
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('menu_sections')}</div>
            <button class="btn btn-outline btn-sm" id="addSectionBtn">+ ${t('menu_add_section')}</button>
          </div>
          <div id="sectionsList" class="flex flex-col gap-3"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('menu_footer_ph')}</label>
          <textarea class="textarea" id="menuFooter" rows="2">${PCD.escapeHtml(data.footer || '')}</textarea>
        </div>

        <div class="checkbox">
          <input type="checkbox" id="menuHidePrice" ${data.hidePrices ? 'checked' : ''}>
          <span>${t('menu_hide_price')}</span>
        </div>
      `;

      // Render sections
      const secListEl = PCD.$('#sectionsList', body);
      (data.sections || []).forEach(function (sec, sIdx) {
        const secEl = PCD.el('div', { class: 'card', 'data-sid': sec.id, style: { padding: '12px' } });
        secEl.innerHTML = `
          <div class="flex items-center gap-2 mb-2">
            <input type="text" class="input" data-secname value="${PCD.escapeHtml(sec.name || '')}" placeholder="${PCD.i18n.t('menu_section_name')}" style="flex:1;font-weight:600;">
            <button class="icon-btn" data-secdel title="${PCD.i18n.t('delete')}">${PCD.icon('trash',18)}</button>
          </div>
          <div class="section-items flex flex-col gap-1" data-sidx="${sIdx}"></div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-ghost btn-sm" data-addrec="${sec.id}" style="flex:1;">+ ${PCD.i18n.t('menu_add_item')}</button>
            <button class="btn btn-ghost btn-sm" data-addmanual="${sec.id}" style="flex:1;">✎ ${PCD.i18n.t('menu_add_manual') || 'Manual'}</button>
          </div>
        `;
        const itemsEl = secEl.querySelector('.section-items');
        (sec.items || []).forEach(function (it, iIdx) {
          const isManual = !it.recipeId;
          const r = it.recipeId ? PCD.store.getRecipe(it.recipeId) : null;
          const name = isManual ? (it.customName || '') : (r ? r.name : '(removed recipe)');
          const defaultPrice = r && r.salePrice ? r.salePrice : '';
          const row = PCD.el('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }
          });
          // Manual items: editable name field. Recipe items: static name.
          if (isManual) {
            row.innerHTML = `
              <div style="flex:1;min-width:0;">
                <input type="text" class="input" data-itemname="${sIdx}:${iIdx}" value="${PCD.escapeHtml(name)}" placeholder="${PCD.i18n.t('menu_item_name_ph') || 'Dish name'}" style="padding:4px 8px;min-height:26px;font-size:14px;font-weight:600;">
                <input type="text" class="input" data-itemdesc="${sIdx}:${iIdx}" value="${PCD.escapeHtml(it.description || '')}" placeholder="${PCD.i18n.t('menu_item_desc_ph')}" style="padding:4px 8px;min-height:26px;font-size:12px;margin-top:4px;">
              </div>
              <input type="number" class="input" data-itemprice="${sIdx}:${iIdx}" value="${it.price || ''}" placeholder="0" step="0.01" min="0" style="width:70px;padding:4px 8px;min-height:26px;font-size:13px;">
              <button class="icon-btn" data-itemdel="${sIdx}:${iIdx}">${PCD.icon('x',14)}</button>
            `;
          } else {
            row.innerHTML = `
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${PCD.escapeHtml(name)}</div>
                <input type="text" class="input" data-itemdesc="${sIdx}:${iIdx}" value="${PCD.escapeHtml(it.description || '')}" placeholder="${PCD.i18n.t('menu_item_desc_ph')}" style="padding:4px 8px;min-height:26px;font-size:12px;margin-top:4px;">
              </div>
              <input type="number" class="input" data-itemprice="${sIdx}:${iIdx}" value="${it.price || defaultPrice}" placeholder="${defaultPrice}" step="0.01" min="0" style="width:70px;padding:4px 8px;min-height:26px;font-size:13px;">
              <button class="icon-btn" data-itemdel="${sIdx}:${iIdx}">${PCD.icon('x',14)}</button>
            `;
          }
          itemsEl.appendChild(row);
        });
        secListEl.appendChild(secEl);
      });

      wire();
    }

    function wire() {
      // Name / subtitle / footer / hide-price
      PCD.$('#menuName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#menuSubtitle', body).addEventListener('input', function () { data.subtitle = this.value; });
      PCD.$('#menuFooter', body).addEventListener('input', function () { data.footer = this.value; });
      PCD.$('#menuHidePrice', body).addEventListener('change', function () { data.hidePrices = this.checked; render(); });

      // Section name
      PCD.on(body, 'input', '[data-secname]', PCD.debounce(function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (sec) sec.name = this.value;
      }, 300));

      // Section delete
      PCD.on(body, 'click', '[data-secdel]', function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: t('confirm_delete'), text: t('section') + '?',
          okText: t('delete')
        }).then(function (ok) {
          if (!ok) return;
          data.sections = data.sections.filter(function (s) { return s.id !== sid; });
          render();
        });
      });

      // Add section
      PCD.$('#addSectionBtn', body).addEventListener('click', function () {
        data.sections.push({ id: PCD.uid('sec'), name: t('section'), items: [] });
        render();
      });

      // Add recipe to section
      PCD.on(body, 'click', '[data-addrec]', function () {
        const sid = this.getAttribute('data-addrec');
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: t(r.category || 'cat_main') + (r.salePrice ? ' · ' + PCD.fmtMoney(r.salePrice) : ''), thumb: r.photo || '' };
        });
        if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet')); return; }
        const sec = data.sections.find(function (s) { return s.id === sid; });
        const selected = (sec.items || []).filter(function (it) { return it.recipeId; }).map(function (it) { return it.recipeId; });
        PCD.picker.open({
          title: t('menu_add_item'),
          items: items, multi: true, selected: selected,
        }).then(function (selIds) {
          if (!selIds) return;
          // Keep existing recipe items, update set. Manual items preserved separately.
          const existingByRecipe = {};
          const manualItems = [];
          (sec.items || []).forEach(function (it) {
            if (it.recipeId) existingByRecipe[it.recipeId] = it;
            else manualItems.push(it);
          });
          const newRecipeItems = selIds.map(function (id) {
            if (existingByRecipe[id]) return existingByRecipe[id];
            return { id: PCD.uid('mi'), recipeId: id, description: '', price: null };
          });
          sec.items = newRecipeItems.concat(manualItems);
          render();
        });
      });

      // Manual item: add blank line that chef fills in directly
      PCD.on(body, 'click', '[data-addmanual]', function () {
        const sid = this.getAttribute('data-addmanual');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (!sec) return;
        sec.items = (sec.items || []).concat([{
          id: PCD.uid('mi'),
          recipeId: null,
          customName: '',
          description: '',
          price: null,
        }]);
        render();
        // Focus the new name input
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-itemname]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50);
      });

      // Manual item name input
      PCD.on(body, 'input', '[data-itemname]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemname').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].customName = this.value;
        }
      }, 300));

      // Item description
      PCD.on(body, 'input', '[data-itemdesc]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemdesc').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].description = this.value;
        }
      }, 300));

      // Item price
      PCD.on(body, 'input', '[data-itemprice]', PCD.debounce(function () {
        const parts = this.getAttribute('data-itemprice').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx] && data.sections[sIdx].items[iIdx]) {
          data.sections[sIdx].items[iIdx].price = this.value === '' ? null : parseFloat(this.value);
          render();
        }
      }, 400));

      // Item delete
      PCD.on(body, 'click', '[data-itemdel]', function () {
        const parts = this.getAttribute('data-itemdel').split(':').map(Number);
        const sIdx = parts[0], iIdx = parts[1];
        if (data.sections[sIdx]) {
          data.sections[sIdx].items.splice(iIdx, 1);
          render();
        }
      });
    }

    render();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const previewBtn = PCD.el('button', { class: 'btn btn-outline' });
    previewBtn.innerHTML = PCD.icon('print',16) + ' ' + t('menu_preview');
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(previewBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : t('new_menu'),
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
        PCD.store.deleteFromTable('menus', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'menus') render(v);
      });
    });
    previewBtn.addEventListener('click', function () {
      data.name = (PCD.$('#menuName', body).value || '').trim() || t('untitled');
      const saved = existing
        ? PCD.store.upsertInTable('menus', Object.assign({}, existing, data), 'm')
        : PCD.store.upsertInTable('menus', data, 'm');
      if (existing) existing.id = saved.id; // keep reference stable
      m.close();
      setTimeout(function () { openPrintView(saved.id); }, 280);
    });
    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#menuName', body).value || '').trim();
      if (!data.name) { PCD.toast.error(t('menu_name') + ' ' + t('required')); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('menus', data, 'm');
      PCD.toast.success(t('menu_saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'menus') render(v);
      }, 250);
    });
  }

  // ============ PRINT VIEW ============
  function openPrintView(mid) {
    const t = PCD.i18n.t;
    const menu = PCD.store.getFromTable('menus', mid);
    if (!menu) return;

    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

    let sectionsHtml = '';
    (menu.sections || []).forEach(function (sec) {
      if (!sec.items || sec.items.length === 0) return;
      sectionsHtml += '<div class="menu-section">';
      sectionsHtml += '<div class="menu-section-title">' + PCD.escapeHtml(sec.name) + '</div>';
      sec.items.forEach(function (it) {
        const r = recipeMap[it.recipeId];
        if (!r) return;
        const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r.salePrice || 0);
        const desc = it.description || r.plating || '';
        sectionsHtml += '<div class="menu-item">' +
          '<div class="menu-item-info">' +
            '<div class="menu-item-name">' + PCD.escapeHtml(r.name) + '</div>' +
            (desc ? '<div class="menu-item-desc">' + PCD.escapeHtml(desc) + '</div>' : '') +
          '</div>';
        if (!menu.hidePrices && price > 0) {
          sectionsHtml += '<div class="menu-item-dots"></div>' +
            '<div class="menu-item-price">' + PCD.fmtMoney(price) + '</div>';
        }
        sectionsHtml += '</div>';
      });
      sectionsHtml += '</div>';
    });

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="print-wrap">
        <div class="print-page menu-page">
          <div class="menu-header">
            <h1 class="menu-title">${PCD.escapeHtml(menu.name || t('untitled'))}</h1>
            ${menu.subtitle ? '<div class="menu-subtitle">' + PCD.escapeHtml(menu.subtitle) + '</div>' : ''}
          </div>
          ${sectionsHtml}
          ${menu.footer ? '<div class="menu-footer">' + PCD.escapeHtml(menu.footer) + '</div>' : ''}
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
      title: t('preview') + ' · ' + (menu.name || t('untitled')),
      body: body, footer: footer, size: 'xl', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { const wrap = body.querySelector('.print-wrap'); if (wrap) PCD.print(wrap.innerHTML); else window.print(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menus = { render: render, openEditor: openEditor, openPrintView: openPrintView };
})();
