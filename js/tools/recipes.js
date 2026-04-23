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
        visible = sorted.filter(function (r) { return (r.name || '').toLowerCase().indexOf(q) >= 0; });
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

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    const editBtn = PCD.el('button', { class: 'btn btn-primary', text: t('edit'), style: { flex: '1' } });
    const deleteBtn = PCD.el('button', { class: 'btn btn-outline', text: t('delete'), style: { color: 'var(--danger)' } });
    footer.appendChild(deleteBtn);
    footer.appendChild(editBtn);

    const m = PCD.modal.open({ title: r.name, body: body, footer: footer, size: 'md', closable: true });

    editBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { openEditor(rid); }, 280);
    });
    deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteRecipe(rid);
        PCD.toast.success(t('item_deleted'));
        m.close();
        // re-render current view
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'recipes') renderList(view);
        else if (PCD.router.currentView() === 'dashboard') PCD.tools.dashboard.render(view);
      });
    });
  }

  // ============ EDITOR ============
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
          <input type="file" id="photoInput" accept="image/*" style="display:none;">
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
          <label class="field-label">${t('recipe_steps')}</label>
          <textarea class="textarea" id="recipeSteps" rows="8" placeholder="${t('recipe_steps_placeholder')}">${PCD.escapeHtml(data.steps || '')}</textarea>
        </div>

        <div class="field">
          <label class="field-label">${t('recipe_plating')}</label>
          <textarea class="textarea" id="recipePlating" rows="3">${PCD.escapeHtml(data.plating || '')}</textarea>
        </div>
      `;

      renderIngList();
      wireEditor();
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
      const photoInput = PCD.$('#photoInput', body);

      photoZone.addEventListener('click', function (e) {
        if (e.target.closest('#removePhoto')) return;
        photoInput.click();
      });
      const removeBtn = PCD.$('#removePhoto', body);
      if (removeBtn) removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        data.photo = null;
        renderEditor();
      });
      photoInput.addEventListener('change', function (e) {
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
      });

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
