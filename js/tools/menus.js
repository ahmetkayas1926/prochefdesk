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
          <button class="icon-btn" data-copy-mid="${m.id}" data-name="${PCD.escapeHtml(m.name || 'menu')}" title="Copy to workspace">${PCD.icon('truck', 18)}</button>
          <button class="icon-btn" data-edit-mid="${m.id}" title="Edit menu">${PCD.icon('edit', 18)}</button>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newMenuBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-mid]', function (e) {
      // If user clicked the inline edit/delete icon let those handlers fire
      if (e.target.closest('[data-edit-mid]') || e.target.closest('[data-del-mid]') || e.target.closest('[data-copy-mid]')) return;
      openPrintView(this.getAttribute('data-mid'));
    });
    PCD.on(listEl, 'click', '[data-edit-mid]', function (e) {
      e.stopPropagation();
      openEditor(this.getAttribute('data-edit-mid'));
    });
    PCD.on(listEl, 'click', '[data-copy-mid]', function (e) {
      e.stopPropagation();
      const mid = this.getAttribute('data-copy-mid');
      const name = this.getAttribute('data-name');
      PCD.openCopyToWorkspace('menus', mid, name);
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
        <div class="checkbox">
          <input type="checkbox" id="menuHideAllergens" ${data.hideAllergens ? 'checked' : ''}>
          <span>Hide allergen icons</span>
        </div>
      `;

      // Render sections
      const secListEl = PCD.$('#sectionsList', body);
      const totalSections = (data.sections || []).length;
      (data.sections || []).forEach(function (sec, sIdx) {
        const secEl = PCD.el('div', { class: 'card', 'data-sid': sec.id, style: { padding: '12px' } });
        const isFirst = sIdx === 0;
        const isLast = sIdx === totalSections - 1;
        secEl.innerHTML = `
          <div class="flex items-center gap-2 mb-2">
            <button class="icon-btn" data-secup="${sIdx}" ${isFirst ? 'disabled style="opacity:0.3;"' : 'title="Move section up"'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" data-secdown="${sIdx}" ${isLast ? 'disabled style="opacity:0.3;"' : 'title="Move section down"'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
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
      const hideAllergEl = PCD.$('#menuHideAllergens', body);
      if (hideAllergEl) hideAllergEl.addEventListener('change', function () { data.hideAllergens = this.checked; render(); });

      // Section name
      PCD.on(body, 'input', '[data-secname]', PCD.debounce(function () {
        const secEl = this.closest('[data-sid]');
        const sid = secEl.getAttribute('data-sid');
        const sec = data.sections.find(function (s) { return s.id === sid; });
        if (sec) sec.name = this.value;
      }, 300));

      // Section delete
      PCD.on(body, 'click', '[data-secup]', function () {
        const idx = parseInt(this.getAttribute('data-secup'), 10);
        if (idx <= 0) return;
        const sections = data.sections;
        [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
        render();
      });
      PCD.on(body, 'click', '[data-secdown]', function () {
        const idx = parseInt(this.getAttribute('data-secdown'), 10);
        if (idx >= data.sections.length - 1) return;
        const sections = data.sections;
        [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
        render();
      });

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
        // Always re-render the list view if we're on (or coming back to) the menus page.
        // If currentView() is empty (router transition), check the route key directly.
        const cur = (PCD.router && PCD.router.currentView && PCD.router.currentView()) || '';
        if (cur === 'menus' || (location.hash && location.hash.indexOf('menus') >= 0) || !cur) {
          if (v) render(v);
        }
      }, 200);
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

    // Build sections HTML using a simple, professional layout
    let sectionsBody = '';
    (menu.sections || []).forEach(function (sec) {
      if (!sec.items || sec.items.length === 0) return;
      sectionsBody += '<div class="m-section">';
      sectionsBody += '<div class="m-section-title">' + PCD.escapeHtml(sec.name || '') + '</div>';
      sectionsBody += '<div class="m-items">';
      sec.items.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        const isManual = !it.recipeId;
        if (!r && !isManual) return;
        if (isManual && !(it.customName || '').trim()) return;
        const itemName = isManual ? (it.customName || '') : (r ? r.name : '(removed)');
        const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r && r.salePrice ? r.salePrice : 0);
        const desc = it.description || (r && r.plating) || '';

        // EU FIC 1169/2011 — allergen icons next to dish name (legal requirement)
        let allergenIcons = '';
        if (r && PCD.allergensDB && PCD.allergensDB.recipeAllergens && !menu.hideAllergens) {
          const tags = PCD.allergensDB.recipeAllergens(r, ingMap);
          if (tags && tags.length > 0) {
            const allList = PCD.allergensDB.list || [];
            allergenIcons = ' <span class="m-allerg" title="Allergens: ' + tags.join(', ') + '">' +
              tags.slice(0, 6).map(function (key) {
                const a = allList.find(function (x) { return x.key === key; });
                return a ? a.icon : '';
              }).filter(Boolean).join(' ') +
              '</span>';
          }
        }

        sectionsBody += '<div class="m-item">';
        sectionsBody += '<div class="m-item-row"><div class="m-item-name">' + PCD.escapeHtml(itemName) + allergenIcons + '</div>';
        sectionsBody += '<div class="m-item-leader"></div>';
        if (!menu.hidePrices && price > 0) {
          sectionsBody += '<div class="m-item-price">' + PCD.fmtMoney(price) + '</div>';
        }
        sectionsBody += '</div>';
        if (desc) sectionsBody += '<div class="m-item-desc">' + PCD.escapeHtml(desc) + '</div>';
        sectionsBody += '</div>';
      });
      sectionsBody += '</div></div>';
    });

    // Print options — saved on menu so they persist
    const printOpts = {
      density: menu.printDensity || 'comfortable', // tight | comfortable | spacious
      titleSize: menu.printTitleSize || 44,
      itemSize: menu.printItemSize || 18,
      sectionSize: menu.printSectionSize || 22,
      pagePadding: menu.printPagePadding || 48, // px
      itemGap: menu.printItemGap || 16,
    };

    function applyDensity(d) {
      if (d === 'tight') {
        printOpts.titleSize = 36; printOpts.itemSize = 16; printOpts.sectionSize = 18;
        printOpts.pagePadding = 32; printOpts.itemGap = 10;
      } else if (d === 'spacious') {
        printOpts.titleSize = 52; printOpts.itemSize = 20; printOpts.sectionSize = 26;
        printOpts.pagePadding = 64; printOpts.itemGap = 22;
      } else {
        printOpts.titleSize = 44; printOpts.itemSize = 18; printOpts.sectionSize = 22;
        printOpts.pagePadding = 48; printOpts.itemGap = 16;
      }
      printOpts.density = d;
    }

    function buildStyledHtml() {
      const O = printOpts;
      return (
      '<style>' +
        '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap");' +
        '.m-page {' +
          'background: #fff; color: #1a1a1a;' +
          'max-width: 580px; margin: 0 auto; padding: ' + O.pagePadding + 'px ' + (O.pagePadding + 8) + 'px;' +
          'font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;' +
          'font-weight: 300;' +
        '}' +
        '.m-header { text-align: center; margin-bottom: ' + Math.round(O.pagePadding * 0.75) + 'px; padding-bottom: 0; }' +
        '.m-title {' +
          'font-family: "Cormorant Garamond", Georgia, serif;' +
          'font-size: ' + O.titleSize + 'px; font-weight: 500;' +
          'letter-spacing: 0.02em;' +
          'margin: 0 0 8px; color: #111;' +
          'line-height: 1.1;' +
        '}' +
        '.m-subtitle {' +
          'font-size: 11px; color: #888;' +
          'letter-spacing: 0.24em;' +
          'text-transform: uppercase; font-weight: 400;' +
          'margin-bottom: 24px;' +
        '}' +
        '.m-divider {' +
          'width: 60px; height: 1px;' +
          'background: #c5a572;' +
          'margin: 18px auto 0;' +
        '}' +
        '.m-section { margin: ' + Math.round(O.itemGap * 1.8) + 'px 0 ' + Math.round(O.itemGap * 1.4) + 'px; break-inside: avoid; page-break-inside: avoid; }' +
        '.m-section-title {' +
          'font-family: "Cormorant Garamond", Georgia, serif;' +
          'font-size: ' + O.sectionSize + 'px; font-weight: 500;' +
          'letter-spacing: 0.18em;' +
          'text-transform: uppercase;' +
          'text-align: center;' +
          'color: #111;' +
          'margin: 0 0 ' + Math.round(O.itemGap * 1.3) + 'px;' +
          'position: relative;' +
        '}' +
        '.m-section-title::before,' +
        '.m-section-title::after {' +
          'content: "";' +
          'display: inline-block;' +
          'width: 24px; height: 1px;' +
          'background: #c5a572;' +
          'vertical-align: middle;' +
          'margin: 0 16px;' +
        '}' +
        '.m-items { display: flex; flex-direction: column; gap: ' + O.itemGap + 'px; }' +
        '.m-item { break-inside: avoid; page-break-inside: avoid; }' +
        '.m-item-row { display: flex; align-items: baseline; gap: 0; }' +
        '.m-item-name {' +
          'font-family: "Cormorant Garamond", Georgia, serif;' +
          'font-size: ' + O.itemSize + 'px; font-weight: 600;' +
          'color: #111;' +
          'letter-spacing: 0.02em;' +
          'flex-shrink: 0;' +
        '}' +
        '.m-allerg {' +
          'font-size: 11px;' +
          'margin-inline-start: 6px;' +
          'opacity: 0.7;' +
          'letter-spacing: 0.06em;' +
          'vertical-align: middle;' +
        '}' +
        '.m-item-leader {' +
          'flex: 1;' +
          'border-bottom: 1px dotted #c5a572;' +
          'margin: 0 8px 4px;' +
          'min-width: 30px;' +
          'opacity: 0.6;' +
        '}' +
        '.m-item-price {' +
          'font-family: "Cormorant Garamond", Georgia, serif;' +
          'font-size: ' + O.itemSize + 'px; font-weight: 600;' +
          'color: #c5a572;' +
          'flex-shrink: 0;' +
          'white-space: nowrap;' +
        '}' +
        '.m-item-desc {' +
          'font-size: ' + Math.max(11, O.itemSize - 6) + 'px; color: #666;' +
          'font-style: italic;' +
          'margin-top: 4px;' +
          'line-height: 1.5;' +
          'max-width: 90%;' +
          'font-weight: 300;' +
        '}' +
        '.m-footer {' +
          'text-align: center;' +
          'font-size: 11px; color: #888;' +
          'letter-spacing: 0.12em;' +
          'text-transform: uppercase;' +
          'margin-top: 40px;' +
          'padding-top: 20px;' +
          'border-top: 1px solid #e8e8e8;' +
          'font-weight: 400;' +
        '}' +
        '@media print {' +
          '@page { size: A4; margin: 0; }' +
          '.m-page { padding: ' + (O.pagePadding * 0.4) + 'px ' + (O.pagePadding * 0.45) + 'px; max-width: 100%; }' +
        '}' +
      '</style>' +
      '<div class="m-page">' +
        '<div class="m-header">' +
          '<h1 class="m-title">' + PCD.escapeHtml(menu.name || t('untitled')) + '</h1>' +
          (menu.subtitle ? '<div class="m-subtitle">' + PCD.escapeHtml(menu.subtitle) + '</div>' : '') +
          '<div class="m-divider"></div>' +
        '</div>' +
        sectionsBody +
        (menu.footer ? '<div class="m-footer">' + PCD.escapeHtml(menu.footer) + '</div>' : '') +
      '</div>'
      );
    }

    const body = PCD.el('div');

    function refreshPreview() {
      body.innerHTML =
        '<div style="margin-bottom:14px;padding:12px 14px;background:var(--surface-2);border-radius:var(--r-md);">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text-2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Page density</div>' +
          '<div class="flex gap-2" style="flex-wrap:wrap;">' +
            '<button class="btn btn-secondary btn-sm" data-dens="tight" ' + (printOpts.density === 'tight' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Tight</button>' +
            '<button class="btn btn-secondary btn-sm" data-dens="comfortable" ' + (printOpts.density === 'comfortable' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Comfortable</button>' +
            '<button class="btn btn-secondary btn-sm" data-dens="spacious" ' + (printOpts.density === 'spacious' ? 'style="background:var(--brand-600);color:#fff;border-color:var(--brand-600);"' : '') + '>Spacious</button>' +
            '<div style="flex:1;"></div>' +
            '<span class="text-muted text-sm" style="font-size:11px;align-self:center;">' +
              'Title ' + printOpts.titleSize + 'px · Item ' + printOpts.itemSize + 'px · Padding ' + printOpts.pagePadding + 'px' +
            '</span>' +
          '</div>' +
        '</div>' +
        buildStyledHtml();

      PCD.on(body, 'click', '[data-dens]', function () {
        applyDensity(this.getAttribute('data-dens'));
        // persist
        const m = PCD.store.getFromTable('menus', mid);
        if (m) {
          m.printDensity = printOpts.density;
          m.printTitleSize = printOpts.titleSize;
          m.printItemSize = printOpts.itemSize;
          m.printSectionSize = printOpts.sectionSize;
          m.printPagePadding = printOpts.pagePadding;
          m.printItemGap = printOpts.itemGap;
          PCD.store.upsertInTable('menus', m, 'm');
        }
        refreshPreview();
      });
    }

    refreshPreview();

    const printBtn = PCD.el('button', { class: 'btn btn-primary' });
    printBtn.innerHTML = PCD.icon('print',16) + ' <span>' + t('print') + '</span>';
    const qrBtn = PCD.el('button', { class: 'btn btn-outline' });
    qrBtn.innerHTML = PCD.icon('grid',16) + ' <span>QR</span>';
    const shareLinkBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Public share link' });
    shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>Share link</span>';
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(qrBtn);
    footer.appendChild(shareLinkBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: t('preview') + ' · ' + (menu.name || t('untitled')),
      body: body, footer: footer, size: 'xl', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      PCD.print(buildStyledHtml(), menu.name || 'Menu');
    });
    shareLinkBtn.addEventListener('click', function () {
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error('Sign in to create public links');
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error('Share unavailable');
        return;
      }
      shareLinkBtn.disabled = true;
      shareLinkBtn.innerHTML = '<span class="spinner"></span>';
      PCD.share.createOrGetShareUrl('menu', mid).then(function (url) {
        shareLinkBtn.disabled = false;
        shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>Share link</span>';
        // Show modal with the link
        const linkBody = PCD.el('div');
        linkBody.innerHTML =
          '<div class="text-muted text-sm mb-2">Bu menüyü herkese açık olarak paylaşmak için aşağıdaki linki kopyala:</div>' +
          '<input type="text" id="menuShareLink" value="' + PCD.escapeHtml(url) + '" readonly style="width:100%;padding:10px;border:1.5px solid var(--brand-600);border-radius:6px;font-family:var(--font-mono);font-size:13px;background:#fff;margin-bottom:10px;">' +
          '<div class="flex gap-2">' +
            '<button type="button" class="btn btn-primary" id="copyMenuLink" style="flex:1;">' + PCD.icon('copy',16) + ' <span>Copy link</span></button>' +
            '<button type="button" class="btn btn-outline" id="waMenuLink" style="flex:1;">' + PCD.icon('message-circle',16) + ' <span>WhatsApp</span></button>' +
          '</div>';
        const lc = PCD.el('button', { class: 'btn btn-secondary', text: 'Close', style: { width: '100%' } });
        const lf = PCD.el('div', { style: { width: '100%' } });
        lf.appendChild(lc);
        const lm = PCD.modal.open({ title: '🔗 Share link', body: linkBody, footer: lf, size: 'sm', closable: true });
        lc.addEventListener('click', function () { lm.close(); });
        // Auto-select
        setTimeout(function () { const inp = PCD.$('#menuShareLink', linkBody); if (inp) { inp.focus(); inp.select(); } }, 100);
        PCD.$('#copyMenuLink', linkBody).addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { PCD.toast.success('✓ Link copied'); });
        });
        PCD.$('#waMenuLink', linkBody).addEventListener('click', function () {
          window.open('https://wa.me/?text=' + encodeURIComponent(url), '_blank');
        });
      }).catch(function (e) {
        shareLinkBtn.disabled = false;
        shareLinkBtn.innerHTML = PCD.icon('share',16) + ' <span>Share link</span>';
        PCD.toast.error('Share failed: ' + (e.message || e));
      });
    });
    qrBtn.addEventListener('click', function () {
      // Generate a share URL and put THAT in the QR — so scanning opens
      // the menu in a browser, not just a wall of text.
      const t = PCD.i18n.t;
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error(t('qr_signin_required'));
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error(t('qr_share_error'));
        return;
      }
      qrBtn.disabled = true;
      const origHTML = qrBtn.innerHTML;
      qrBtn.innerHTML = '<span class="spinner"></span> ' + t('qr_generating');
      PCD.share.createOrGetShareUrl('menu', menu.id).then(function (url) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = origHTML;
        PCD.qr.show({
          title: menu.name || 'Menu',
          subtitle: 'Scan to view',
          text: url
        });
      }).catch(function (e) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = origHTML;
        PCD.toast.error(t('qr_share_error') + ': ' + (e.message || e));
      });
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.menus = { render: render, openEditor: openEditor, openPrintView: openPrintView };
})();
