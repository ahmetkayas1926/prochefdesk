/* ================================================================
   ProChefDesk — recipes.js
   Full recipe management:
   - List view with bulk select + bulk delete (mobile works!)
   - Tapping a recipe opens preview (NOT edit)
   - Edit modal with photo+cropper, ingredient picker, steps
   - Save → toast → navigate to preview
   - Instant food cost calculation
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const CATEGORIES = ['cat_appetizer', 'cat_soup', 'cat_salad', 'cat_main', 'cat_side', 'cat_dessert', 'cat_breakfast', 'cat_drink', 'cat_other'];

  function currentIngMap() {
    const m = {};
    PCD.store.listIngredients().forEach(function (i) { m[i.id] = i; });
    return m;
  }

  function computeCost(recipe) {
    return PCD.recipes.computeFoodCost(recipe, currentIngMap());
  }

  // ============ LIST VIEW ============
  let selectMode = false;
  let selectedIds = new Set();

  function renderList(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes();
    const ingMap = currentIngMap();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('recipes_title')}</div>
          <div class="page-subtitle">${recipes.length} ${recipes.length === 1 ? t('stat_recipes').toLowerCase().slice(0,-1) : t('stat_recipes').toLowerCase()}</div>
        </div>
        <div class="page-header-actions">
          ${recipes.length > 0 ? `<button class="btn btn-outline btn-sm" id="toggleSelectMode">${t('select_mode')}</button>` : ''}
          <button class="btn btn-primary" id="newRecipeBtn">+ ${t('new_recipe')}</button>
        </div>
      </div>

      <div class="searchbar mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>
        <input type="search" id="recipeSearch" placeholder="${t('search_recipes_placeholder')}" autocomplete="off">
      </div>

      <div id="bulkBar" class="card" style="display:none;padding:10px 12px;margin-bottom:12px;background:var(--brand-50);border-color:var(--brand-300);position:sticky;top:0;z-index:5;">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <label class="checkbox" style="min-height:auto;"><input type="checkbox" id="selAll"><span class="text-sm font-semibold"><span id="selCount">0</span> ${t('selected')}</span></label>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-danger btn-sm" id="bulkDelete">${PCD.icon('trash',14)} ${t('delete')}</button>
            <button class="btn btn-ghost btn-sm" id="exitSelect">${t('cancel')}</button>
          </div>
        </div>
      </div>

      <div id="recipeList"></div>
    `;

    const listEl = PCD.$('#recipeList', view);
    let filter = '';
    let sorted = recipes.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

    function paint() {
      PCD.clear(listEl);
      let visible = sorted;
      if (filter) {
        const q = filter.toLowerCase();
        const ingMap = {};
        PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
        visible = sorted.filter(function (r) {
          if ((r.name || '').toLowerCase().indexOf(q) >= 0) return true;
          // Search by ingredient content too
          return (r.ingredients || []).some(function (ri) {
            const ing = ingMap[ri.ingredientId];
            return ing && (ing.name || '').toLowerCase().indexOf(q) >= 0;
          });
        });
      }
      if (visible.length === 0 && !filter) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📖</div>
            <div class="empty-title">${t('no_recipes_yet')}</div>
            <div class="empty-desc">${t('no_recipes_yet_desc')}</div>
            <div class="empty-action"><button class="btn btn-primary" id="emptyNewBtn">+ ${t('new_recipe')}</button></div>
          </div>
        `;
        const btn = PCD.$('#emptyNewBtn', listEl);
        if (btn) btn.addEventListener('click', function () { openEditor(); });
        return;
      }
      if (visible.length === 0) {
        listEl.innerHTML = '<div class="empty"><div class="empty-desc">No results for "' + PCD.escapeHtml(filter) + '"</div></div>';
        return;
      }

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      visible.forEach(function (r) {
        const cost = computeCost(r);
        const costPerServing = r.servings ? cost / r.servings : cost;
        const pct = (r.salePrice && cost > 0 && r.servings) ? (costPerServing / r.salePrice) * 100 : null;
        const row = PCD.el('div', { class: 'list-item', 'data-rid': r.id });
        const thumb = PCD.el('div', { class: 'list-item-thumb' });
        if (r.photo) thumb.style.backgroundImage = 'url(' + r.photo + ')';
        else thumb.textContent = '🍽️';

        const body = PCD.el('div', { class: 'list-item-body' });
        body.innerHTML = `
          <div class="list-item-title">${PCD.escapeHtml(r.name)}</div>
          <div class="list-item-meta">
            <span>${t(r.category || 'cat_main')}</span>
            ${r.servings ? '<span>·</span><span>' + r.servings + 'p</span>' : ''}
            ${cost > 0 ? '<span>·</span><span>' + PCD.fmtMoney(cost) + '</span>' : ''}
            ${pct !== null ? '<span class="chip chip-' + (pct <= 35 ? 'success' : (pct <= 45 ? 'warning' : 'danger')) + '">' + PCD.fmtPercent(pct, 0) + '</span>' : ''}
          </div>
        `;
        row.appendChild(thumb);
        row.appendChild(body);

        // Select checkbox when in select mode
        if (selectMode) {
          const cb = PCD.el('input', { type: 'checkbox', class: 'select-cb' });
          cb.style.width = '20px'; cb.style.height = '20px'; cb.style.flexShrink = '0';
          cb.checked = selectedIds.has(r.id);
          cb.addEventListener('click', function (e) { e.stopPropagation(); });
          cb.addEventListener('change', function () {
            if (cb.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
            updateBulkBar();
          });
          row.insertBefore(cb, row.firstChild);
        }
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    function updateBulkBar() {
      const bar = PCD.$('#bulkBar', view);
      if (!bar) return;
      bar.style.display = selectMode ? '' : 'none';
      PCD.$('#selCount', view).textContent = selectedIds.size;
      const selAll = PCD.$('#selAll', view);
      const currentShown = sorted.filter(function (r) {
        if (!filter) return true;
        return (r.name || '').toLowerCase().indexOf(filter.toLowerCase()) >= 0;
      });
      selAll.checked = currentShown.length > 0 && currentShown.every(function (r) { return selectedIds.has(r.id); });
    }

    function enterSelect() {
      selectMode = true;
      selectedIds = new Set();
      paint();
      updateBulkBar();
    }
    function exitSelect() {
      selectMode = false;
      selectedIds = new Set();
      paint();
      updateBulkBar();
    }

    // Wire
    PCD.$('#newRecipeBtn', view).addEventListener('click', function () { openEditor(); });
    const toggleSel = PCD.$('#toggleSelectMode', view);
    if (toggleSel) toggleSel.addEventListener('click', enterSelect);
    PCD.$('#exitSelect', view).addEventListener('click', exitSelect);
    PCD.$('#selAll', view).addEventListener('change', function () {
      const currentShown = sorted.filter(function (r) {
        if (!filter) return true;
        return (r.name || '').toLowerCase().indexOf(filter.toLowerCase()) >= 0;
      });
      if (this.checked) currentShown.forEach(function (r) { selectedIds.add(r.id); });
      else selectedIds.clear();
      paint();
      updateBulkBar();
    });
    PCD.$('#bulkDelete', view).addEventListener('click', function () {
      if (selectedIds.size === 0) return;
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: PCD.i18n.t('confirm_delete_n').replace('{n}', selectedIds.size),
        text: PCD.i18n.t('confirm_delete_desc'),
        okText: PCD.i18n.t('delete')
      }).then(function (ok) {
        if (!ok) return;
        const n = PCD.store.deleteRecipes(Array.from(selectedIds));
        PCD.toast.success(PCD.i18n.t('items_deleted').replace('{n}', n));
        selectedIds = new Set();
        selectMode = false;
        // re-render entire view
        render(view);
      });
    });

    PCD.$('#recipeSearch', view).addEventListener('input', PCD.debounce(function (e) {
      filter = e.target.value;
      paint();
      updateBulkBar();
    }, 150));

    // Tap row → preview (NOT edit) — fix from v43
    PCD.on(listEl, 'click', '[data-rid]', function (e) {
      // ignore if clicked on checkbox
      if (e.target.closest('.select-cb')) return;
      if (selectMode) {
        const cb = this.querySelector('.select-cb');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
      }
      const rid = this.getAttribute('data-rid');
      openPreview(rid);
    });

    // Long-press / right-click for quick actions (mobile + desktop)
    PCD.longPress(listEl, '[data-rid]', function (el) {
      const rid = el.getAttribute('data-rid');
      const r = PCD.store.getRecipe(rid);
      if (!r) return;
      PCD.actionSheet({
        title: r.name,
        actions: [
          { icon: 'edit', label: PCD.i18n.t('act_edit'), onClick: function () { openEditor(rid); } },
          { icon: 'copy', label: PCD.i18n.t('act_duplicate'), onClick: function () {
            const copy = PCD.clone(r);
            delete copy.id; delete copy.createdAt; delete copy.updatedAt;
            copy.name = copy.name + ' (Copy)';
            const saved = PCD.store.upsertRecipe(copy);
            PCD.toast.success('Duplicated');
            renderList(view);
            setTimeout(function () { openEditor(saved.id); }, 200);
          }},
          { icon: 'share', label: PCD.i18n.t('act_share'), onClick: function () { openPreview(rid); } },
          { icon: 'grid', label: PCD.i18n.t('act_show_qr'), onClick: function () {
            const ingMap = currentIngMap();
            const lines = [r.name, ''];
            lines.push((r.servings || 1) + ' servings');
            lines.push('');
            lines.push('Ingredients:');
            (r.ingredients || []).forEach(function (ri) {
              const ing = ingMap[ri.ingredientId];
              lines.push('• ' + (ing ? ing.name : '(removed)') + ' — ' + PCD.fmtNumber(ri.amount) + ' ' + (ri.unit || ''));
            });
            if (r.steps) { lines.push(''); lines.push('Method:'); lines.push(r.steps); }
            PCD.qr.show({ title: r.name, subtitle: 'Recipe QR', text: lines.join('\n') });
          }},
          { icon: 'trash', label: PCD.i18n.t('act_delete'), danger: true, onClick: function () {
            const backup = PCD.clone(r);
            PCD.store.deleteRecipe(rid);
            renderList(view);
            PCD.toast.success('Deleted', 5000, {
              action: { label: 'UNDO', onClick: function () {
                PCD.store.upsertRecipe(backup);
                PCD.toast.success('Restored');
                renderList(view);
              }}
            });
          }},
        ]
      });
    });

    paint();
  }

  // ============ PREVIEW ============
  function openPreview(rid) {
    const t = PCD.i18n.t;
    const r = PCD.store.getRecipe(rid);
    if (!r) { PCD.toast.error('Recipe not found'); return; }
    const ingMap = currentIngMap();
    const cost = PCD.recipes.computeFoodCost(r, ingMap);
    const costPerServing = r.servings ? cost / r.servings : cost;
    const pct = (r.salePrice && cost > 0 && r.servings) ? (costPerServing / r.salePrice) * 100 : null;

    let ingsHtml = '';
    (r.ingredients || []).forEach(function (ri) {
      const ing = ingMap[ri.ingredientId];
      const name = ing ? ing.name : '(removed)';
      ingsHtml += `<li style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
        <span>${PCD.escapeHtml(name)}</span>
        <span class="text-muted">${PCD.fmtNumber(ri.amount)} ${ri.unit || ''}</span>
      </li>`;
    });

    const body = PCD.el('div');
    body.innerHTML = `
      ${r.photo ? `<img src="${PCD.escapeHtml(r.photo)}" style="width:100%;height:220px;object-fit:cover;border-radius:var(--r-lg);margin-bottom:14px;">` : ''}
      <div class="flex flex-col gap-2 mb-3">
        <div class="flex gap-2" style="flex-wrap:wrap;">
          <span class="chip chip-brand">${t(r.category || 'cat_main')}</span>
          ${r.cuisine ? '<span class="chip">' + PCD.escapeHtml(r.cuisine) + '</span>' : ''}
          ${r.servings ? '<span class="chip">' + r.servings + ' ' + t('recipe_servings').toLowerCase() + '</span>' : ''}
          ${(r.prepTime || r.cookTime) ? '<span class="chip">⏱ ' + ((r.prepTime||0) + (r.cookTime||0)) + 'min</span>' : ''}
        </div>
      </div>

      <div class="grid grid-2 mb-3" style="gap:8px;">
        <div class="stat" style="padding:10px;"><div class="stat-label">${t('food_cost')}</div><div class="stat-value" style="font-size:18px;">${PCD.fmtMoney(cost)}</div></div>
        <div class="stat" style="padding:10px;"><div class="stat-label">${t('cost_per_serving')}</div><div class="stat-value" style="font-size:18px;">${PCD.fmtMoney(costPerServing)}</div></div>
        ${r.salePrice ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + t('recipe_sale_price') + '</div><div class="stat-value" style="font-size:18px;">' + PCD.fmtMoney(r.salePrice) + '</div></div>' : ''}
        ${pct !== null ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + t('food_cost_percent') + '</div><div class="stat-value" style="font-size:18px;color:' + (pct <= 35 ? 'var(--success)' : (pct <= 45 ? 'var(--warning)' : 'var(--danger)')) + ';">' + PCD.fmtPercent(pct, 1) + '</div></div>' : ''}
      </div>

      <div class="section-title mt-3 mb-2">${t('recipe_ingredients')}</div>
      <ul style="list-style:none;padding:0;margin:0 0 16px;">${ingsHtml || '<li class="text-muted" style="padding:8px 0;">—</li>'}</ul>

      ${r.steps ? `<div class="section-title mb-2">${t('recipe_steps')}</div>
        <div style="white-space:pre-wrap;line-height:1.7;font-size:15px;">${PCD.escapeHtml(r.steps)}</div>` : ''}

      ${r.plating ? `<div class="section-title mt-3 mb-2">${t('recipe_plating')}</div>
        <div style="white-space:pre-wrap;line-height:1.7;font-size:15px;color:var(--text-2);">${PCD.escapeHtml(r.plating)}</div>` : ''}
    `;

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    const editBtn = PCD.el('button', { class: 'btn btn-primary', text: t('edit'), style: { flex: '1', minWidth: '100px' } });
    const duplicateBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Duplicate' });
    duplicateBtn.innerHTML = PCD.icon('copy', 16);
    const shareBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const deleteBtn = PCD.el('button', { class: 'btn btn-outline', title: t('delete'), style: { color: 'var(--danger)' } });
    deleteBtn.innerHTML = PCD.icon('trash', 16);
    footer.appendChild(deleteBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(duplicateBtn);
    footer.appendChild(editBtn);

    const m = PCD.modal.open({ title: r.name, body: body, footer: footer, size: 'md', closable: true });

    editBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { openEditor(rid); }, 280);
    });

    duplicateBtn.addEventListener('click', function () {
      const original = PCD.store.getRecipe(rid);
      if (!original) return;
      const copy = PCD.clone(original);
      delete copy.id;
      delete copy.createdAt;
      delete copy.updatedAt;
      copy.name = copy.name + ' (Copy)';
      const saved = PCD.store.upsertRecipe(copy);
      PCD.toast.success('Recipe duplicated');
      m.close();
      setTimeout(function () {
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'recipes') renderList(view);
        // Open new one for editing
        setTimeout(function () { openEditor(saved.id); }, 200);
      }, 150);
    });

    shareBtn.addEventListener('click', function () {
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const lines = [r.name, ''];
      lines.push(t('recipe_servings') + ': ' + (r.servings || 1));
      if (r.salePrice) lines.push(t('sale_price') + ': ' + PCD.fmtMoney(r.salePrice));
      lines.push('');
      lines.push(t('recipe_ingredients') + ':');
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        lines.push('• ' + (ing ? ing.name : '(removed)') + ' — ' + PCD.fmtNumber(ri.amount) + ' ' + (ri.unit || ''));
      });
      if (r.steps) {
        lines.push('');
        lines.push('Method:');
        lines.push(r.steps);
      }
      openRecipeShareSheet({ title: r.name, text: lines.join('\n'), recipe: r, ingMap: ingMap });
    });

    deleteBtn.addEventListener('click', function () {
      // Soft delete with undo
      const original = PCD.store.getRecipe(rid);
      if (!original) return;
      const backup = PCD.clone(original);
      PCD.store.deleteRecipe(rid);
      m.close();
      const view = PCD.$('#view');
      if (PCD.router.currentView() === 'recipes') renderList(view);
      else if (PCD.router.currentView() === 'dashboard') PCD.tools.dashboard.render(view);
      PCD.toast.success(t('item_deleted'), 5000, {
        action: {
          label: 'UNDO',
          onClick: function () {
            PCD.store.upsertRecipe(backup);
            PCD.toast.success('Restored');
            const v = PCD.$('#view');
            if (PCD.router.currentView() === 'recipes') renderList(v);
            else if (PCD.router.currentView() === 'dashboard') PCD.tools.dashboard.render(v);
          }
        }
      });
    });
  }

  // Share sheet for a recipe
  function openRecipeShareSheet(opts) {
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">Message</label>' +
      '<textarea class="textarea" id="rShareText" rows="10" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(opts.text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:12px">' +
        '<button class="btn btn-outline" id="rShWa" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px">' +
          '<div style="color:#25D366">' + PCD.icon('message-circle', 22) + '</div>' +
          '<div style="font-weight:600;font-size:12px">WhatsApp</div></button>' +
        '<button class="btn btn-outline" id="rShEmail" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px">' +
          '<div style="color:#EA4335">' + PCD.icon('mail', 22) + '</div>' +
          '<div style="font-weight:600;font-size:12px">Email</div></button>' +
        '<button class="btn btn-outline" id="rShPrint" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px">' +
          '<div style="color:var(--brand-600)">' + PCD.icon('print', 22) + '</div>' +
          '<div style="font-weight:600;font-size:12px">Print/PDF</div></button>' +
        '<button class="btn btn-outline" id="rShCopy" style="flex-direction:column;height:auto;padding:12px 4px;gap:4px">' +
          '<div style="color:var(--text-2)">' + PCD.icon('copy', 22) + '</div>' +
          '<div style="font-weight:600;font-size:12px">Copy</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: 'Share · ' + opts.title, body: body, footer: footer, size: 'md', closable: true });

    function getText() { return PCD.$('#rShareText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#rShWa', body).addEventListener('click', function () {
      window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank');
      m.close();
    });
    PCD.$('#rShEmail', body).addEventListener('click', function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(opts.title) + '&body=' + encodeURIComponent(getText());
      m.close();
    });
    PCD.$('#rShPrint', body).addEventListener('click', function () {
      const r = opts.recipe;
      const ingMap = opts.ingMap;
      const rows = (r.ingredients || []).map(function (ri) {
        const ing = ingMap[ri.ingredientId];
        return '<tr><td>' + PCD.escapeHtml(ing ? ing.name : '(removed)') + '</td><td style="text-align:right">' + PCD.fmtNumber(ri.amount) + ' ' + PCD.escapeHtml(ri.unit || '') + '</td></tr>';
      }).join('');
      const html =
        '<div style="max-width:680px;margin:0 auto">' +
        (r.photo ? '<img src="' + r.photo + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:16px">' : '') +
        '<h1>' + PCD.escapeHtml(r.name) + '</h1>' +
        '<div style="color:#666;font-size:12px;margin-bottom:16px">' + (r.servings || 1) + ' servings</div>' +
        '<h3 style="margin-top:16px">Ingredients</h3>' +
        '<table>' + rows + '</table>' +
        (r.steps ? '<h3 style="margin-top:16px">Method</h3><pre>' + PCD.escapeHtml(r.steps) + '</pre>' : '') +
        '</div>';
      PCD.print(html, r.name);
      m.close();
    });
    PCD.$('#rShCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () {
          PCD.toast.success('Copied');
          m.close();
        });
      }
    });
  }

  // ============ EDITOR ============
  // Prompt user for details of a brand-new ingredient created inline.
  // Captures unit + price/unit + amount-used-in-this-recipe.
  // On save: creates Ingredient in library, then calls onDone(savedIng, qty, qtyUnit).
  function promptNewIngredientDetails(name, onDone) {
    const UNITS = ['g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'cup', 'oz', 'lb', 'pcs', 'bunch'];
    const draft = { name: name, unit: 'g', pricePerUnit: 0, category: 'cat_other' };
    const recipeQty = { amount: 100, unit: 'g' };
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm mb-3">This ingredient is not in your library yet. Quickly fill its purchase price so cost auto-calculates and it gets added to Ingredients.</div>' +
      '<div class="field"><label class="field-label">Name</label>' +
      '<input type="text" class="input" id="niName" value="' + PCD.escapeHtml(name) + '"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label class="field-label">Purchase unit</label>' +
        '<select class="select" id="niBuyUnit">' +
          UNITS.map(function (u) { return '<option value="' + u + '"' + (u === 'kg' ? ' selected' : '') + '>' + u + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label class="field-label">Price / unit</label>' +
          '<div class="input-group">' +
          '<span class="input-group-addon">' + (PCD.fmtCurrencySymbol ? PCD.fmtCurrencySymbol() : '$') + '</span>' +
          '<input type="number" class="input" id="niPrice" placeholder="0.00" step="0.01" min="0">' +
          '</div>' +
          '<div class="field-hint">e.g. you buy chicken at $8 / kg → enter 8</div>' +
        '</div>' +
      '</div>' +
      '<div class="field" style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;">' +
        '<label class="field-label">In this recipe</label>' +
        '<div class="field-row">' +
          '<div class="field"><div class="input-group">' +
            '<input type="number" class="input" id="niQty" value="100" step="0.1" min="0">' +
          '</div></div>' +
          '<div class="field">' +
            '<select class="select" id="niQtyUnit">' +
              UNITS.map(function (u) { return '<option value="' + u + '"' + (u === 'g' ? ' selected' : '') + '>' + u + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Cancel' });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: 'Save & Add', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({ title: 'New ingredient', body: body, footer: footer, size: 'sm', closable: true });
    setTimeout(function () { const inp = PCD.$('#niPrice', body); if (inp) inp.focus(); }, 100);

    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      draft.name = (PCD.$('#niName', body).value || '').trim();
      if (!draft.name) { PCD.toast.error('Name required'); return; }
      draft.unit = PCD.$('#niBuyUnit', body).value || 'g';
      draft.pricePerUnit = parseFloat(PCD.$('#niPrice', body).value) || 0;
      const qty = parseFloat(PCD.$('#niQty', body).value) || 100;
      const qtyUnit = PCD.$('#niQtyUnit', body).value || draft.unit;
      const saved = PCD.store.upsertIngredient(draft);
      m.close();
      setTimeout(function () { onDone(saved, qty, qtyUnit); }, 200);
    });
  }

  function openEditor(rid) {
    const t = PCD.i18n.t;
    const existing = rid ? PCD.store.getRecipe(rid) : null;

    // Check free plan limit
    if (!existing) {
      const plan = PCD.store.get('plan') || 'free';
      const count = PCD.store.listRecipes().length;
      if (plan === 'free' && count >= window.PCD_CONFIG.FREE_RECIPE_LIMIT) {
        PCD.modal.alert({
          icon: '⭐', iconKind: 'warning',
          title: 'Upgrade needed',
          text: t('recipe_limit_reached').replace('{n}', window.PCD_CONFIG.FREE_RECIPE_LIMIT),
          okText: t('upgrade_to_pro')
        });
        return;
      }
    }

    const data = existing ? PCD.clone(existing) : {
      name: '', category: 'cat_main', servings: 4,
      prepTime: null, cookTime: null,
      photo: null, ingredients: [], steps: '', plating: '',
      salePrice: null, allergens: []
    };

    const body = PCD.el('div');

    function renderEditor() {
      const ingMap = currentIngMap();
      const cost = PCD.recipes.computeFoodCost(data, ingMap);
      const costPerServing = data.servings ? cost / data.servings : cost;
      const pct = (data.salePrice && cost > 0 && data.servings) ? (costPerServing / data.salePrice) * 100 : null;

      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('recipe_photo')}</label>
          <div id="photoZone" style="position:relative;width:100%;height:180px;border-radius:var(--r-lg);background:${data.photo ? 'url(' + data.photo + ') center/cover' : 'var(--surface-2)'};display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px dashed ${data.photo ? 'transparent' : 'var(--border-strong)'};overflow:hidden;">
            ${!data.photo ? '<div class="text-center text-muted"><div style="font-size:32px;margin-bottom:4px;">📷</div><div class="text-sm">' + t('recipe_photo_hint') + '</div></div>' : ''}
            ${data.photo ? '<button type="button" id="removePhoto" class="icon-btn" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:white;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>' : ''}
          </div>
          <div class="flex gap-2 mt-2" id="photoActions" style="display:${data.photo ? 'none' : 'flex'};">
            <button type="button" class="btn btn-outline btn-sm" id="cameraBtn" style="flex:1;">${PCD.icon('camera', 16)} Camera</button>
            <button type="button" class="btn btn-outline btn-sm" id="galleryBtn" style="flex:1;">${PCD.icon('image', 16)} Gallery</button>
          </div>
          <input type="file" id="photoCamera" accept="image/*" capture="environment" style="display:none;">
          <input type="file" id="photoGallery" accept="image/*" style="display:none;">
        </div>

        <div class="field">
          <label class="field-label">${t('recipe_name')} *</label>
          <input type="text" class="input" id="recipeName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('recipe_name_placeholder')}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('recipe_category')}</label>
            <select class="select" id="recipeCategory">
              ${CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + t(c) + '</option>'; }).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label">${t('recipe_servings')}</label>
            <input type="number" class="input" id="recipeServings" value="${data.servings || 4}" min="1">
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('recipe_prep_time')}</label>
            <input type="number" class="input" id="recipePrep" value="${data.prepTime || ''}" min="0">
          </div>
          <div class="field">
            <label class="field-label">${t('recipe_cook_time')}</label>
            <input type="number" class="input" id="recipeCook" value="${data.cookTime || ''}" min="0">
          </div>
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('recipe_ingredients')}</div>
            <button type="button" class="btn btn-outline btn-sm" id="addIngBtn">+ ${t('add')}</button>
          </div>

          <!-- Quick-add autocomplete -->
          <div style="position:relative;margin-bottom:10px;">
            <input type="text" class="input" id="quickIngInput" placeholder="Quick add — type ingredient name..." autocomplete="off" style="padding-inline-start:36px;">
            <div style="position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none;">${PCD.icon('search', 16)}</div>
            <div id="quickIngDD" style="display:none;position:absolute;top:100%;inset-inline-start:0;inset-inline-end:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);box-shadow:var(--shadow-lg);max-height:240px;overflow-y:auto;z-index:5;margin-top:4px;"></div>
          </div>

          <div id="ingList"></div>
          <div class="text-sm text-muted mt-2" style="font-size:12px;">${t('recipe_ingredients_hint')}</div>
        </div>

        <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:12px;">
          <div class="flex items-center justify-between">
            <div>
              <div class="stat-label">${t('food_cost')}</div>
              <div style="font-size:20px;font-weight:800;letter-spacing:-0.01em;">${PCD.fmtMoney(cost)}</div>
            </div>
            ${pct !== null ? '<div style="text-align:right;"><div class="stat-label">' + t('food_cost_percent') + '</div><div style="font-size:20px;font-weight:800;color:' + (pct <= 35 ? 'var(--success)' : (pct <= 45 ? 'var(--warning)' : 'var(--danger)')) + ';">' + PCD.fmtPercent(pct, 1) + '</div></div>' : ''}
          </div>
        </div>

        <div class="field">
          <label class="field-label">${t('recipe_sale_price')}</label>
          <input type="number" class="input" id="recipeSalePrice" value="${data.salePrice || ''}" step="0.01" min="0">
        </div>

        <div class="field">
          <label class="field-label">Allergens</label>
          <div class="text-muted text-sm mb-2" style="font-size:12px;">Auto-detected from ingredients. Click to override.</div>
          <div id="allergenChips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('recipe_steps')}</label>
          <textarea class="textarea" id="recipeSteps" rows="8" placeholder="${t('recipe_steps_placeholder')}">${PCD.escapeHtml(data.steps || '')}</textarea>
        </div>

        <div class="field">
          <label class="field-label">${t('recipe_plating')}</label>
          <textarea class="textarea" id="recipePlating" rows="3">${PCD.escapeHtml(data.plating || '')}</textarea>
        </div>
      `;

      renderAllergenChips();
      renderIngList();
      wireEditor();
    }

    function renderAllergenChips() {
      const wrap = PCD.$('#allergenChips', body);
      if (!wrap) return;
      const ingMap = currentIngMap();
      const auto = (PCD.allergensDB && PCD.allergensDB.recipeAllergens)
        ? PCD.allergensDB.recipeAllergens(data, ingMap)
        : [];
      const manual = data.allergens || [];
      const all = (PCD.allergensDB && PCD.allergensDB.list) || [];
      wrap.innerHTML = '';
      all.forEach(function (a) {
        const isAuto = auto.indexOf(a.key) >= 0;
        const isManual = manual.indexOf(a.key) >= 0;
        const active = isAuto || isManual;
        const chip = PCD.el('button', {
          type: 'button',
          'data-allerg': a.key,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            border: '1.5px solid ' + (active ? 'var(--brand-600)' : 'var(--border)'),
            background: active ? 'var(--brand-50)' : 'var(--surface)',
            color: active ? 'var(--brand-700)' : 'var(--text-3)',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            opacity: isAuto && !isManual ? '1' : (active ? '1' : '0.55')
          },
        });
        chip.innerHTML = (a.icon || '') + ' ' + (a.label_en || a.key) + (isAuto ? ' <span style="font-size:9px;opacity:0.6;">(auto)</span>' : '');
        wrap.appendChild(chip);
      });
      // Click to toggle manual override
      PCD.on(wrap, 'click', '[data-allerg]', function () {
        const key = this.getAttribute('data-allerg');
        if (!data.allergens) data.allergens = [];
        const idx = data.allergens.indexOf(key);
        if (idx >= 0) data.allergens.splice(idx, 1);
        else data.allergens.push(key);
        renderAllergenChips();
      });
    }

    function renderIngList() {
      const ingMap = currentIngMap();
      const ingListEl = PCD.$('#ingList', body);
      if (!ingListEl) return;
      PCD.clear(ingListEl);

      if (!data.ingredients || data.ingredients.length === 0) {
        ingListEl.innerHTML = '<div class="text-muted text-sm" style="padding:12px 0;text-align:center;">—</div>';
        return;
      }
      data.ingredients.forEach(function (ri, idx) {
        const ing = ingMap[ri.ingredientId];
        const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '10px' } });
        const name = ing ? ing.name : '(removed ingredient)';
        const lineCost = ing ? (function () {
          const amt = Number(ri.amount) || 0;
          let price = Number(ing.pricePerUnit) || 0;
          if (ri.unit && ing.unit && ri.unit !== ing.unit) {
            try { return PCD.convertUnit(amt, ri.unit, ing.unit) * price; } catch(e) {}
          }
          return amt * price;
        })() : 0;

        row.innerHTML = `
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(name)}</div>
            <div class="list-item-meta">
              <input type="number" class="input" data-amount data-idx="${idx}" value="${ri.amount || 0}" step="0.01" min="0" style="width:90px;padding:6px 8px;min-height:32px;font-size:14px;">
              <select class="select" data-unit data-idx="${idx}" style="width:auto;padding:6px 8px;min-height:32px;font-size:14px;padding-right:28px;">
                ${['g','kg','ml','l','tsp','tbsp','cup','oz','lb','pcs','unit'].map(function (u) { return '<option value="' + u + '"' + ((ri.unit || (ing && ing.unit)) === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
              </select>
              <span class="text-muted">·</span>
              <span style="font-weight:600;">${PCD.fmtMoney(lineCost)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn" data-remove="${idx}" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>
        `;
        ingListEl.appendChild(row);
      });
    }

    function updateCostStrip() {
      // Only update the cost strip + individual ingredient line costs — lightweight
      renderEditor();
    }

    function wireEditor() {
      const photoZone = PCD.$('#photoZone', body);
      const photoCamera = PCD.$('#photoCamera', body);
      const photoGallery = PCD.$('#photoGallery', body);
      const cameraBtn = PCD.$('#cameraBtn', body);
      const galleryBtn = PCD.$('#galleryBtn', body);

      // Photo zone: default to gallery (desktop-friendly)
      photoZone.addEventListener('click', function (e) {
        if (e.target.closest('#removePhoto')) return;
        if (e.target.closest('#cameraBtn') || e.target.closest('#galleryBtn')) return;
        if (photoGallery) photoGallery.click();
      });
      const removeBtn = PCD.$('#removePhoto', body);
      if (removeBtn) removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        data.photo = null;
        renderEditor();
      });

      if (cameraBtn) cameraBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (photoCamera) photoCamera.click();
      });
      if (galleryBtn) galleryBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (photoGallery) photoGallery.click();
      });

      function handlePhotoFile(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function () {
          PCD.cropper.open(reader.result).then(function (cropped) {
            if (cropped) {
              data.photo = cropped;
              renderEditor();
            }
          });
        };
        reader.readAsDataURL(f);
        // Reset input so selecting same file again fires change
        e.target.value = '';
      }
      if (photoCamera) photoCamera.addEventListener('change', handlePhotoFile);
      if (photoGallery) photoGallery.addEventListener('change', handlePhotoFile);

      PCD.$('#addIngBtn', body).addEventListener('click', function () {
        const items = PCD.store.listIngredients().map(function (i) {
          return { id: i.id, name: i.name, meta: t(i.category || 'cat_other') + ' · ' + PCD.fmtMoney(i.pricePerUnit) + '/' + i.unit };
        });
        if (items.length === 0) {
          PCD.modal.confirm({
            icon: '🥕', title: t('no_ingredients_yet'),
            text: t('no_ingredients_yet_desc'),
            okText: t('new_ingredient'), cancelText: t('cancel')
          }).then(function (ok) {
            if (ok) PCD.tools.ingredients.openEditor(null, function (newIng) {
              if (newIng) {
                data.ingredients = data.ingredients.concat([{ ingredientId: newIng.id, amount: 100, unit: newIng.unit }]);
                renderEditor();
              }
            });
          });
          return;
        }
        PCD.picker.open({
          title: t('add_ingredient_to_recipe'),
          items: items,
          multi: true,
          selected: data.ingredients.map(function (ri) { return ri.ingredientId; })
        }).then(function (selIds) {
          if (!selIds) return;
          // Keep existing rows for items still selected, remove deselected, add new with default amount
          const ingMap2 = currentIngMap();
          const existingMap = {};
          data.ingredients.forEach(function (ri) { existingMap[ri.ingredientId] = ri; });
          const next = [];
          selIds.forEach(function (id) {
            if (existingMap[id]) next.push(existingMap[id]);
            else {
              const i = ingMap2[id];
              next.push({ ingredientId: id, amount: 100, unit: i ? i.unit : 'g' });
            }
          });
          data.ingredients = next;
          renderEditor();
        });
      });

      // Live updates on amount / unit / servings / salePrice
      PCD.on(body, 'input', '[data-amount]', function () {
        const idx = parseInt(this.getAttribute('data-idx'), 10);
        data.ingredients[idx].amount = parseFloat(this.value) || 0;
        // Instead of full re-render (which would break focus), just update cost strip + line cost:
        const strip = body.querySelector('.stat');
        // Light debounce
        clearTimeout(wireEditor._t);
        wireEditor._t = setTimeout(renderEditor, 300);
      });
      PCD.on(body, 'change', '[data-unit]', function () {
        const idx = parseInt(this.getAttribute('data-idx'), 10);
        data.ingredients[idx].unit = this.value;
        renderEditor();
      });
      PCD.on(body, 'click', '[data-remove]', function () {
        const idx = parseInt(this.getAttribute('data-remove'), 10);
        data.ingredients.splice(idx, 1);
        renderEditor();
      });

      const servingsEl = PCD.$('#recipeServings', body);
      servingsEl.addEventListener('input', function () {
        data.servings = parseInt(this.value, 10) || 1;
        clearTimeout(wireEditor._t2);
        wireEditor._t2 = setTimeout(renderEditor, 300);
      });
      const priceEl = PCD.$('#recipeSalePrice', body);
      priceEl.addEventListener('input', function () {
        data.salePrice = parseFloat(this.value) || null;
        clearTimeout(wireEditor._t3);
        wireEditor._t3 = setTimeout(renderEditor, 300);
      });

      // ===== QUICK-ADD AUTOCOMPLETE =====
      const qInput = PCD.$('#quickIngInput', body);
      const qDD = PCD.$('#quickIngDD', body);
      if (qInput && qDD) {
        function renderDD(query) {
          const q = (query || '').toLowerCase().trim();
          if (!q) { qDD.style.display = 'none'; qDD.innerHTML = ''; return; }
          const allIngs = PCD.store.listIngredients();
          const alreadyInRecipe = new Set((data.ingredients || []).map(function (ri) { return ri.ingredientId; }));
          const matches = allIngs.filter(function (i) {
            return (i.name || '').toLowerCase().indexOf(q) >= 0 && !alreadyInRecipe.has(i.id);
          }).slice(0, 8);

          // If no existing ingredient matches, offer "create new"
          const createOption = { id: '__new__', name: 'Create new: "' + query.trim() + '"', isCreate: true };

          let html = '';
          matches.forEach(function (i) {
            html += '<div data-pick="' + i.id + '" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
              '<div style="flex:1;min-width:0;"><div style="font-weight:600;">' + PCD.escapeHtml(i.name) + '</div>' +
              '<div class="text-muted" style="font-size:11px;">' + PCD.fmtMoney(i.pricePerUnit || 0) + '/' + (i.unit || '') + '</div></div>' +
              '</div>';
          });
          // Always show "create new" at the bottom if query has content
          html += '<div data-pick="__new__" data-name="' + PCD.escapeHtml(query.trim()) + '" style="padding:10px 12px;cursor:pointer;background:var(--brand-50);color:var(--brand-700);font-weight:600;font-size:13px;">' +
            PCD.icon('plus', 14) + ' Create "' + PCD.escapeHtml(query.trim()) + '"</div>';
          qDD.innerHTML = html;
          qDD.style.display = 'block';
        }

        qInput.addEventListener('input', function () { renderDD(this.value); });
        qInput.addEventListener('focus', function () { if (this.value) renderDD(this.value); });
        // close on outside click
        document.addEventListener('click', function (e) {
          if (!e.target.closest || (!e.target.closest('#quickIngInput') && !e.target.closest('#quickIngDD'))) {
            if (qDD) qDD.style.display = 'none';
          }
        });

        PCD.on(qDD, 'click', '[data-pick]', function () {
          const id = this.getAttribute('data-pick');
          if (id === '__new__') {
            const newName = this.getAttribute('data-name') || qInput.value.trim();
            if (!newName) return;
            qDD.style.display = 'none';
            // Open mini-dialog to capture unit + price BEFORE saving
            promptNewIngredientDetails(newName, function (saved, qty, qtyUnit) {
              data.ingredients = (data.ingredients || []).concat([{
                ingredientId: saved.id, amount: qty || 100, unit: qtyUnit || saved.unit
              }]);
              PCD.toast.success('Added "' + newName + '" — synced to Ingredients library');
              qInput.value = '';
              renderEditor();
              setTimeout(function () {
                const fresh = PCD.$('#quickIngInput', body);
                if (fresh) fresh.focus();
              }, 50);
            });
            return;
          }
          const ing = PCD.store.getIngredient(id);
          if (!ing) return;
          data.ingredients = (data.ingredients || []).concat([{ ingredientId: id, amount: 100, unit: ing.unit || 'g' }]);
          qInput.value = '';
          qDD.style.display = 'none';
          renderEditor();
          setTimeout(function () {
            const fresh = PCD.$('#quickIngInput', body);
            if (fresh) fresh.focus();
          }, 50);
        });

        // Enter key: pick first match
        qInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = qDD.querySelector('[data-pick]');
            if (first) first.click();
          } else if (e.key === 'Escape') {
            qDD.style.display = 'none';
          }
        });
      }
    }

    renderEditor();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save_recipe'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('edit') + ' · ' + existing.name : t('new_recipe'),
      body: body,
      footer: footer,
      size: 'lg',
      closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      // Collect latest values from form
      data.name = PCD.$('#recipeName', body).value.trim();
      data.category = PCD.$('#recipeCategory', body).value;
      data.servings = parseInt(PCD.$('#recipeServings', body).value, 10) || 1;
      data.prepTime = parseInt(PCD.$('#recipePrep', body).value, 10) || null;
      data.cookTime = parseInt(PCD.$('#recipeCook', body).value, 10) || null;
      data.salePrice = parseFloat(PCD.$('#recipeSalePrice', body).value) || null;
      data.steps = PCD.$('#recipeSteps', body).value;
      data.plating = PCD.$('#recipePlating', body).value;

      if (!data.name) {
        PCD.toast.error(t('recipe_name') + ' ' + t('required'));
        return;
      }

      if (existing) data.id = existing.id;
      const saved = PCD.store.upsertRecipe(data);
      PCD.toast.success(t('recipe_saved'));
      m.close();
      // After modal close animation, open preview (FIX from v43!)
      setTimeout(function () {
        // Refresh list if we're on recipes view
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'recipes') renderList(view);
        else if (PCD.router.currentView() === 'dashboard') PCD.tools.dashboard.render(view);
        openPreview(saved.id);
      }, 300);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.recipes = {
    render: renderList,
    openPreview: openPreview,
    openEditor: openEditor,
  };
})();
