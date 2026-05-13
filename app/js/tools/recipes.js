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
    return PCD.recipes.computeFoodCost(recipe, currentIngMap(), PCD.recipes.buildRecipeMap());
  }

  // v2.8.29 — Subtitle for cost reports (HTML / PDF / XLSX). Was using
  // raw `r.category` ("Cat_main" after CSS capitalize) and always
  // appending "X servings" which is wrong for preps. Now translates
  // the category key, and for preps shows "Sub-recipe" (+ yield when
  // recorded) instead of menu-item phrasing.
  function recipeSubtitle(r, it) {
    const t = PCD.i18n.t;
    const isPrep = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
    if (isPrep) {
      const yieldStr = (r.yieldAmount && r.yieldUnit) ? ' · ' + PCD.fmtNumber(r.yieldAmount) + ' ' + r.yieldUnit : '';
      return t('recipes_subrecipe_subtitle') + yieldStr;
    }
    const servings = (it && it.servings) || r.servings || 1;
    return t(r.category || 'cat_main') + ' · ' + servings + ' ' + t('cr_servings').toLowerCase();
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

      <!-- v2.8.22 — Filter tabs: All / Menu / Preps. Splits the library
           between 1-portion plates and batch preps (recipes with
           yieldAmount set). Combines with the search and bulk-select
           features. -->
      <div id="recipeFilterTabs" class="flex gap-2 mb-3" style="background:var(--surface-2);padding:4px;border-radius:8px;">
        <button type="button" class="btn btn-sm" data-tab="all" style="flex:1;background:transparent;">${t('recipes_tab_all', { n: recipes.length })}</button>
        <button type="button" class="btn btn-sm" data-tab="menu" style="flex:1;background:transparent;">${t('recipes_tab_menu', { n: recipes.filter(function(r){return !PCD.recipes.isPrep(r);}).length })}</button>
        <button type="button" class="btn btn-sm" data-tab="preps" style="flex:1;background:transparent;">${t('recipes_tab_preps', { n: recipes.filter(function(r){return PCD.recipes.isPrep(r);}).length })}</button>
      </div>

      <div id="bulkBar" class="card" style="display:none;padding:10px 12px;margin-bottom:12px;background:var(--brand-50);border-color:var(--brand-300);position:sticky;top:0;z-index:5;">
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
          <div class="flex items-center gap-3">
            <label class="checkbox" style="min-height:auto;"><input type="checkbox" id="selAll"><span class="text-sm font-semibold"><span id="selCount">0</span> ${t('selected')}</span></label>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="bulkCostReport">${PCD.icon('activity',14)} <span>Cost Report</span></button>
            <!-- v2.8.25 — Bulk yield set/clear: flips recipes between Menu
                 and Preps in one go. "To Prep" opens a small modal to pick
                 a default yield (amount + unit) applied to all selected.
                 "To Menu" just clears yieldAmount/yieldUnit. -->
            <button type="button" class="btn btn-outline btn-sm" id="bulkToPrep" title="${PCD.escapeHtml(t('recipes_bulk_to_prep'))}">${PCD.icon('check',14)} <span>${t('recipes_bulk_to_prep')}</span></button>
            <button type="button" class="btn btn-outline btn-sm" id="bulkToMenu" title="${PCD.escapeHtml(t('recipes_bulk_to_menu'))}">${PCD.icon('book',14)} <span>${t('recipes_bulk_to_menu')}</span></button>
            <button type="button" class="btn btn-danger btn-sm" id="bulkDelete">${PCD.icon('trash',14)} ${t('delete')}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="exitSelect">${t('cancel')}</button>
          </div>
        </div>
      </div>

      <div id="recipeList"></div>
    `;

    const listEl = PCD.$('#recipeList', view);
    let filter = '';
    // v2.8.22 — Active filter tab: 'all' | 'menu' | 'preps'. Combines
    // with the search filter. Menu = no yieldAmount (1-portion plates).
    // Preps = recipes with yieldAmount + yieldUnit set (batch/sub-recipes).
    let activeTab = 'all';
    let sorted = recipes.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

    function isPrep(r) {
      // v2.8.26 — Delegated to PCD.recipes.isPrep so all tools share the
      // same classification logic (explicit isSubRecipe flag wins, legacy
      // yield-based fallback for unflagged records).
      return PCD.recipes && PCD.recipes.isPrep ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
    }

    function paintTabs() {
      const tabsWrap = PCD.$('#recipeFilterTabs', view);
      if (!tabsWrap) return;
      tabsWrap.querySelectorAll('[data-tab]').forEach(function (b) {
        const isActive = b.getAttribute('data-tab') === activeTab;
        // Active tab: white card-style background with shadow; inactive: transparent
        b.style.background = isActive ? 'var(--surface)' : 'transparent';
        b.style.boxShadow = isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none';
        b.style.fontWeight = isActive ? '700' : '500';
        b.style.color = isActive ? 'var(--text)' : 'var(--text-3)';
      });
    }

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
      // v2.8.22 — Tab filter applies AFTER search filter so the count in
      // search results stays scoped to the chosen tab.
      if (activeTab === 'menu') visible = visible.filter(function (r) { return !isPrep(r); });
      else if (activeTab === 'preps') visible = visible.filter(isPrep);

      if (visible.length === 0 && !filter && activeTab === 'all') {
        const ws = PCD.store.getActiveWorkspace();
        const wsLabel = ws ? PCD.escapeHtml(ws.name) : '';
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📖</div>
            <div class="empty-title">${t('no_recipes_yet')}</div>
            <div class="empty-desc">
              ${t('no_recipes_yet_desc')}
              ${wsLabel ? '<div style="margin-top:8px;font-size:13px;">In workspace <strong>' + wsLabel + '</strong></div>' : ''}
            </div>
            <div class="empty-action"><button class="btn btn-primary" id="emptyNewBtn">+ ${t('new_recipe')}</button></div>
          </div>
        `;
        const btn = PCD.$('#emptyNewBtn', listEl);
        if (btn) btn.addEventListener('click', function () { openEditor(); });
        return;
      }
      if (visible.length === 0) {
        const msg = filter
          ? 'No results for "' + PCD.escapeHtml(filter) + '"'
          : (activeTab === 'preps' ? t('recipes_empty_preps') : t('recipes_empty_menu'));
        listEl.innerHTML = '<div class="empty"><div class="empty-desc">' + msg + '</div></div>';
        return;
      }

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });

      // v2.8.22 — On "All" tab, group rows into Menu items + Preps
      // sections with headers (preserves sort order within each section).
      // On a specific tab, render a single flat list.
      function appendSectionHeader(labelKey, count) {
        const h = PCD.el('div');
        h.style.cssText = 'padding:8px 12px 4px;font-size:10px;font-weight:700;color:var(--brand-700);text-transform:uppercase;letter-spacing:0.08em;background:var(--brand-50);border-radius:6px;margin-top:6px;';
        h.textContent = t(labelKey) + ' · ' + count;
        cont.appendChild(h);
      }
      function appendRow(r) {
        const cost = computeCost(r);
        const costPerServing = r.servings ? cost / r.servings : cost;
        const pct = (r.salePrice && cost > 0 && r.servings) ? (costPerServing / r.salePrice) * 100 : null;
        const row = PCD.el('div', { class: 'list-item', 'data-rid': r.id });
        const thumb = PCD.el('div', { class: 'list-item-thumb' });
        // v2.6.61 — Native lazy loading for thumbnails. Previously every
        // recipe in the list would download its photo immediately, even
        // for items below the fold. With 100+ recipes this added 5-10MB
        // of unnecessary network on first paint. <img loading="lazy">
        // defers download until the row is near the viewport.
        if (r.photo) {
          const img = PCD.el('img');
          img.src = r.photo;
          img.loading = 'lazy';
          img.alt = '';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.borderRadius = 'inherit';
          img.style.display = 'block';
          thumb.appendChild(img);
        } else thumb.textContent = '🍽️';

        // v2.8.22 — Small SUB badge in the row meta for prep recipes,
        // so the chef can tell at a glance even when scrolling fast.
        const subBadge = isPrep(r) ? '<span class="chip" style="background:var(--brand-50);color:var(--brand-700);font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:2px 6px;">SUB</span>' : '';
        // Yield label for prep recipes; servings for menu items.
        // v2.8.28 — Prep without yield → empty (was rendering "0 " junk).
        const yieldOrServings = isPrep(r)
          ? ((r.yieldAmount && r.yieldUnit) ? '<span>' + PCD.fmtNumber(r.yieldAmount) + ' ' + PCD.escapeHtml(r.yieldUnit) + '</span>' : '')
          : (r.servings ? '<span>' + r.servings + 'p</span>' : '');

        const body = PCD.el('div', { class: 'list-item-body' });
        // v2.8.28 — Preps hide the category meta ("Main") since the SUB
        // badge in the title already conveys classification and category
        // is a menu-item concept.
        body.innerHTML = `
          <div class="list-item-title">${PCD.escapeHtml(r.name)} ${subBadge}</div>
          <div class="list-item-meta">
            ${!isPrep(r) ? '<span>' + t(r.category || 'cat_main') + '</span>' : ''}
            ${yieldOrServings ? (!isPrep(r) ? '<span>·</span>' : '') + yieldOrServings : ''}
            ${cost > 0 ? '<span>·</span><span>' + PCD.fmtMoney(cost) + '</span>' : ''}
            ${pct !== null ? '<span class="chip chip-' + (pct <= 35 ? 'success' : (pct <= 45 ? 'warning' : 'danger')) + '">' + PCD.fmtPercent(pct, 0) + '</span>' : ''}
          </div>
        `;
        row.appendChild(thumb);
        row.appendChild(body);

        // Copy-to-workspace icon button (only when not in select mode)
        if (!selectMode) {
          const copyBtn = PCD.el('button', {
            type: 'button',
            class: 'icon-btn',
            'data-copy-rid': r.id,
            'data-name': r.name,
            title: PCD.i18n.t('modal_copy_to_workspace_title'),
            style: { flexShrink: '0' }
          });
          copyBtn.innerHTML = PCD.icon('truck', 18);
          row.appendChild(copyBtn);
        }

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
      }

      if (activeTab === 'all') {
        const mains = visible.filter(function (r) { return !isPrep(r); });
        const preps = visible.filter(isPrep);
        if (mains.length > 0) {
          appendSectionHeader('recipes_section_menu', mains.length);
          mains.forEach(appendRow);
        }
        if (preps.length > 0) {
          appendSectionHeader('recipes_section_preps', preps.length);
          preps.forEach(appendRow);
        }
      } else {
        visible.forEach(appendRow);
      }

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
    // v2.8.22 — Filter tabs: clicking switches activeTab and repaints
    // both the tab visual state and the list contents.
    PCD.on(view, 'click', '#recipeFilterTabs [data-tab]', function () {
      const tab = this.getAttribute('data-tab');
      if (tab === activeTab) return;
      activeTab = tab;
      paintTabs();
      paint();
    });
    paintTabs();
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
        renderList(view);
      });
    });
    PCD.$('#bulkCostReport', view).addEventListener('click', function () {
      if (selectedIds.size === 0) {
        PCD.toast.info(PCD.i18n.t('toast_select_at_least_one_recipe'));
        return;
      }
      openCostReport(Array.from(selectedIds));
    });

    // v2.8.26 — Bulk "Convert to Prep": flips the isSubRecipe flag on
    // every selected recipe. No more yield modal — yield is a separate
    // factual measurement the chef enters when known; the prep
    // classification is independent of it. (Replaces v2.8.25's modal
    // which forced fake yield data just to categorise.)
    PCD.$('#bulkToPrep', view).addEventListener('click', function () {
      if (selectedIds.size === 0) {
        PCD.toast.info(PCD.i18n.t('toast_select_at_least_one_recipe'));
        return;
      }
      let n = 0;
      Array.from(selectedIds).forEach(function (rid) {
        const r = PCD.store.getRecipe(rid);
        if (!r) return;
        const copy = PCD.clone(r);
        copy.isSubRecipe = true;
        PCD.store.upsertRecipe(copy);
        n++;
      });
      PCD.toast.success(PCD.i18n.t('recipes_bulk_to_prep_done', { n: n }));
      selectedIds = new Set();
      selectMode = false;
      renderList(view);
    });

    // v2.8.26 — Bulk "Convert to Menu": clears the isSubRecipe flag.
    // Yield fields are preserved — if the chef had recorded a yield it
    // stays for reference; only the classification changes.
    PCD.$('#bulkToMenu', view).addEventListener('click', function () {
      if (selectedIds.size === 0) {
        PCD.toast.info(PCD.i18n.t('toast_select_at_least_one_recipe'));
        return;
      }
      PCD.modal.confirm({
        title: PCD.i18n.t('recipes_bulk_to_menu_confirm_title', { n: selectedIds.size }),
        text: PCD.i18n.t('recipes_bulk_to_menu_confirm_text'),
        okText: PCD.i18n.t('recipes_bulk_apply'),
      }).then(function (ok) {
        if (!ok) return;
        let n = 0;
        Array.from(selectedIds).forEach(function (rid) {
          const r = PCD.store.getRecipe(rid);
          if (!r) return;
          const copy = PCD.clone(r);
          copy.isSubRecipe = false;
          PCD.store.upsertRecipe(copy);
          n++;
        });
        PCD.toast.success(PCD.i18n.t('recipes_bulk_to_menu_done', { n: n }));
        selectedIds = new Set();
        selectMode = false;
        renderList(view);
      });
    });

    PCD.$('#recipeSearch', view).addEventListener('input', PCD.debounce(function (e) {
      filter = e.target.value;
      paint();
      updateBulkBar();
    }, 150));

    // Tap row → preview (NOT edit) — fix from v43
    PCD.on(listEl, 'click', '[data-rid]', function (e) {
      // ignore if clicked on checkbox or copy button
      if (e.target.closest('.select-cb')) return;
      if (e.target.closest('[data-copy-rid]')) return;
      if (selectMode) {
        const cb = this.querySelector('.select-cb');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
      }
      const rid = this.getAttribute('data-rid');
      openPreview(rid);
    });

    // Copy-to-workspace icon
    PCD.on(listEl, 'click', '[data-copy-rid]', function (e) {
      e.stopPropagation();
      const rid = this.getAttribute('data-copy-rid');
      const name = this.getAttribute('data-name');
      if (PCD.openCopyToWorkspace) PCD.openCopyToWorkspace('recipes', rid, name);
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
            PCD.toast.success(PCD.i18n.t('toast_duplicated'));
            renderList(view);
            setTimeout(function () { openEditor(saved.id); }, 200);
          }},
          { icon: 'truck', label: 'Copy to workspace...', onClick: function () {
            PCD.openCopyToWorkspace('recipes', rid, r.name);
          }},
          { icon: 'share', label: PCD.i18n.t('act_share'), onClick: function () { openPreview(rid); } },
          { icon: 'grid', label: PCD.i18n.t('act_show_qr'), onClick: function () {
            // Generate a share URL and put THAT in the QR — so scanning opens
            // the recipe in a browser, not just a wall of text.
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
            PCD.toast.info(t('qr_generating'));
            PCD.share.createOrGetShareUrl('recipe', rid).then(function (url) {
              PCD.qr.show({
                title: r.name,
                subtitle: t('act_show_qr'),
                text: url
              });
            }).catch(function (e) {
              PCD.toast.error(t('qr_share_error') + ': ' + (e.message || e));
            });
          }},
          { icon: 'trash', label: PCD.i18n.t('act_delete'), danger: true, onClick: function () {
            const backup = PCD.clone(r);
            PCD.store.deleteRecipe(rid);
            renderList(view);
            PCD.toast.success(PCD.i18n.t('toast_deleted'), 5000, {
              action: { label: 'UNDO', onClick: function () {
                PCD.store.upsertRecipe(backup);
                PCD.toast.success(PCD.i18n.t('toast_restored'));
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
  // ============ COST REPORT ============
  // Multi-recipe cost report. Shows detailed breakdown, lets user override
  // sale price live, exports to PDF or Excel.
  function openCostReport(recipeIds) {
    const t = PCD.i18n.t;
    const TARGET_FOOD_COST_PCT = 30;  // industry standard
    const ingMap = currentIngMap();
    // v2.8.16 — recipeMap for resolving sub-recipe rows in the breakdown
    // table. Without this, sub-recipe lines were silently dropped, so
    // the per-line costs didn't sum to the (correct) totalCost.
    const recipeMap = PCD.recipes.buildRecipeMap();

    // Collect recipes + working prices (user-editable copy)
    const items = [];
    recipeIds.forEach(function (rid) {
      const r = PCD.store.getRecipe(rid);
      if (!r) return;
      const totalCost = PCD.recipes.computeFoodCost(r, ingMap, PCD.recipes.buildRecipeMap());
      const servings = r.servings || 1;
      const costPerServing = totalCost / servings;
      const currentPrice = r.salePrice != null ? Number(r.salePrice) : null;
      const suggestedPrice = costPerServing > 0 ? (costPerServing / (TARGET_FOOD_COST_PCT / 100)) : 0;
      items.push({
        recipe: r,
        totalCost: totalCost,
        servings: servings,
        costPerServing: costPerServing,
        currentPrice: currentPrice,
        suggestedPrice: suggestedPrice,
        // User-editable working price for live testing
        testPrice: currentPrice != null ? currentPrice : suggestedPrice,
      });
    });

    if (items.length === 0) {
      PCD.toast.error(t('cr_no_recipes') || 'No recipes to report');
      return;
    }

    const body = PCD.el('div');
    function paint() {
      let summaryTotalCost = 0;
      let summaryTotalRevenue = 0;
      const recipeKey = items.length === 1 ? 'cr_n_recipes' : 'cr_n_recipes_plural';
      let html = '<div class="text-muted text-sm mb-3">' +
        t(recipeKey, { n: items.length }) +
        ' · ' + t('cr_target_food_cost') + ': <strong>' + TARGET_FOOD_COST_PCT + '%</strong>' +
        ' · ' + t('cr_tip') +
      '</div>';

      items.forEach(function (it, idx) {
        const r = it.recipe;
        summaryTotalCost += it.totalCost;
        // v2.8.30 — Preps don't contribute to revenue (no sale price).
        if (!PCD.recipes.isPrep(r)) {
          summaryTotalRevenue += (it.testPrice || 0) * it.servings;
        }
        const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) * 100 : 0;
        const status = fcPct === 0 ? 'gray' : fcPct < 25 ? 'green' : fcPct < 35 ? 'amber' : 'red';
        const statusColor = status === 'green' ? 'var(--success)' : status === 'amber' ? '#d97706' : status === 'red' ? 'var(--danger)' : 'var(--text-3)';

        // Ingredient table
        let ingRowsHtml = '';
        (r.ingredients || []).forEach(function (ri) {
          const row = PCD.recipes.resolveRow(ri, ingMap, recipeMap);
          if (!row || !row.found) return;
          const subBadge = row.isSub
            ? ' <span style="display:inline-block;background:var(--brand-50);color:var(--brand-700);font-size:9px;font-weight:700;padding:2px 6px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;">SUB</span>'
            : '';
          ingRowsHtml +=
            '<tr>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(row.name) + subBadge + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-size:12px;color:var(--text-3);">' + PCD.fmtMoney(row.unitPrice) + '/' + PCD.escapeHtml(row.stockUnit) + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-size:13px;">' + PCD.fmtNumber(row.amount) + ' ' + PCD.escapeHtml(row.qtyUnit) + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-weight:700;color:var(--brand-700);">' + PCD.fmtMoney(row.lineCost) + '</td>' +
            '</tr>';
        });

        html +=
          '<div class="card mb-3" data-idx="' + idx + '" style="padding:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
              '<div>' +
                '<div style="font-weight:800;font-size:16px;">' + PCD.escapeHtml(r.name) + '</div>' +
                '<div class="text-muted" style="font-size:12px;">' + PCD.escapeHtml(recipeSubtitle(r, it)) + '</div>' +
              '</div>' +
              '<div style="text-align:end;">' +
                '<div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">' + t('cr_food_cost_pct') + '</div>' +
                '<div style="font-size:22px;font-weight:800;color:' + statusColor + ';">' + fcPct.toFixed(1) + '%</div>' +
              '</div>' +
            '</div>' +

            // Ingredient breakdown
            '<div style="overflow-x:auto;margin-bottom:10px;">' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<thead><tr>' +
                  '<th style="text-align:start;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + t('cr_ingredient') + '</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + t('cr_unit_price') + '</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + t('cr_qty') + '</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' + t('cr_cost') + '</th>' +
                '</tr></thead><tbody>' + ingRowsHtml +
                '<tr><td colspan="3" style="padding:6px 8px;border-top:2px solid var(--border);font-weight:700;text-align:end;">' + t('cr_total_food_cost') + '</td>' +
                '<td style="padding:6px 8px;border-top:2px solid var(--border);text-align:end;font-weight:800;color:var(--brand-700);font-family:var(--font-mono);">' + PCD.fmtMoney(it.totalCost) + '</td></tr>' +
                // v2.8.30 — Prep handling: hide "Cost per serving" (menu-item
                // concept). For preps with recorded yield, show "Cost per
                // [yieldUnit]" instead (genuinely useful: cost of 1 kg of
                // muhammara). Preps without yield → only Total food cost.
                (PCD.recipes.isPrep(it.recipe)
                  ? ((it.recipe.yieldAmount && it.recipe.yieldUnit)
                    ? '<tr><td colspan="3" style="padding:4px 8px;text-align:end;color:var(--text-3);font-size:12px;">' + t('cr_cost_per_yield', { unit: it.recipe.yieldUnit }) + '</td>' +
                      '<td style="padding:4px 8px;text-align:end;font-weight:700;font-family:var(--font-mono);">' + PCD.fmtMoney(it.totalCost / it.recipe.yieldAmount) + '</td></tr>'
                    : '')
                  : '<tr><td colspan="3" style="padding:4px 8px;text-align:end;color:var(--text-3);font-size:12px;">' + t('cr_cost_per_serving') + '</td>' +
                    '<td style="padding:4px 8px;text-align:end;font-weight:700;font-family:var(--font-mono);">' + PCD.fmtMoney(it.costPerServing) + '</td></tr>'
                ) +
                '</tbody>' +
              '</table>' +
            '</div>' +

            // v2.8.30 — Pricing area (Current / Suggested / Test / Margin)
            // hidden entirely for preps. Preps aren't sold directly; their
            // cost rolls into the parent menu item's cost. Showing a
            // suggested price for a sauce is misleading.
            (PCD.recipes.isPrep(it.recipe) ? '' :
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:10px;background:var(--surface-2);border-radius:var(--r-md);">' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">' + t('cr_current_price') + '</div>' +
                '<div style="font-weight:700;font-size:15px;">' + (it.currentPrice != null ? PCD.fmtMoney(it.currentPrice) : '<span style="color:var(--text-3);">—</span>') + '</div>' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">' + t('cr_suggested', { n: TARGET_FOOD_COST_PCT }) + '</div>' +
                '<div style="font-weight:700;font-size:15px;color:var(--brand-700);">' + PCD.fmtMoney(it.suggestedPrice) + '</div>' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">' + t('cr_test_price_live') + '</div>' +
                '<input type="number" data-test-price="' + idx + '" value="' + (it.testPrice || 0).toFixed(2) + '" step="0.01" min="0" style="width:100%;padding:4px 8px;border:1.5px solid var(--brand-300);border-radius:6px;font-weight:700;font-size:15px;font-family:var(--font-mono);">' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">' + t('cr_margin_serving') + '</div>' +
                '<div style="font-weight:700;font-size:15px;color:' + statusColor + ';">' + PCD.fmtMoney(Math.max(0, (it.testPrice || 0) - it.costPerServing)) + '</div>' +
              '</div>' +
            '</div>'
            ) +
          '</div>';
      });

      // Summary
      const summaryFcPct = summaryTotalRevenue > 0 ? (summaryTotalCost / summaryTotalRevenue) * 100 : 0;
      // v2.8.30 — Hide revenue/avg-fc/profit cells when no menu items
      // contributed (all-prep report). Total food cost remains useful.
      const hasMenuItems = items.some(function (it) { return !PCD.recipes.isPrep(it.recipe); });
      html +=
        '<div class="card" style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
          '<div style="font-weight:800;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + t('cr_summary_across', { n: items.length }) + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;">' +
            '<div><div class="text-muted text-sm">' + t('cr_total_food_cost') + '</div><div style="font-weight:800;font-size:18px;">' + PCD.fmtMoney(summaryTotalCost) + '</div></div>' +
            (hasMenuItems ?
              '<div><div class="text-muted text-sm">' + t('cr_total_revenue') + '</div><div style="font-weight:800;font-size:18px;">' + PCD.fmtMoney(summaryTotalRevenue) + '</div></div>' +
              '<div><div class="text-muted text-sm">' + t('cr_avg_food_cost') + '</div><div style="font-weight:800;font-size:18px;color:' + (summaryFcPct < 30 ? 'var(--success)' : summaryFcPct < 40 ? '#d97706' : 'var(--danger)') + ';">' + summaryFcPct.toFixed(1) + '%</div></div>' +
              '<div><div class="text-muted text-sm">' + t('cr_total_profit') + '</div><div style="font-weight:800;font-size:18px;color:var(--success);">' + PCD.fmtMoney(Math.max(0, summaryTotalRevenue - summaryTotalCost)) + '</div></div>'
              : ''
            ) +
          '</div>' +
        '</div>';

      body.innerHTML = html;

      // Wire test-price inputs (live update)
      PCD.on(body, 'input', '[data-test-price]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-test-price'), 10);
        const val = parseFloat(this.value);
        if (!isNaN(val) && val >= 0 && items[idx]) {
          items[idx].testPrice = val;
          paint();
        }
      }, 200));
    }
    paint();

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cr_close') });
    const pdfBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary' });
    pdfBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + t('cr_pdf') + '</span>';
    const xlsxBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline' });
    xlsxBtn.innerHTML = PCD.icon('book-open', 16) + ' <span>' + t('cr_excel') + '</span>';

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(xlsxBtn);
    footer.appendChild(pdfBtn);

    const m = PCD.modal.open({
      title: t('cr_title') + (items.length > 1 ? ' · ' + t(items.length === 1 ? 'cr_n_recipes' : 'cr_n_recipes_plural', { n: items.length }) : ''),
      body: body, footer: footer, size: 'lg', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    pdfBtn.addEventListener('click', function () { exportCostReportPDF(items, TARGET_FOOD_COST_PCT); });
    xlsxBtn.addEventListener('click', function () { exportCostReportXLSX(items, TARGET_FOOD_COST_PCT); });
  }

  // PDF: minimal, professional, image-free
  function exportCostReportPDF(items, targetPct) {
    const t = PCD.i18n.t;
    const ingMap = currentIngMap();
    // v2.8.16 — recipeMap for sub-recipe rows (same fix as openCostReport)
    const recipeMap = PCD.recipes.buildRecipeMap();
    const dateStr = new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en');
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = ws ? ws.name : '';

    let summaryTotalCost = 0, summaryTotalRevenue = 0;
    let recipesHtml = '';

    items.forEach(function (it) {
      const r = it.recipe;
      summaryTotalCost += it.totalCost;
      // v2.8.30 — Preps don't contribute to revenue.
      if (!PCD.recipes.isPrep(r)) {
        summaryTotalRevenue += (it.testPrice || 0) * it.servings;
      }
      const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) * 100 : 0;

      let ingRows = '';
      (r.ingredients || []).forEach(function (ri) {
        const row = PCD.recipes.resolveRow(ri, ingMap, recipeMap);
        if (!row || !row.found) return;
        // For PDF: small inline (SUB) marker keeps the badge in monochrome print
        const subMark = row.isSub ? ' <span style="font-size:8pt;color:#16a34a;font-weight:700;">(SUB)</span>' : '';
        ingRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(row.name) + subMark + '</td>' +
            '<td class="num">' + PCD.fmtMoney(row.unitPrice) + '/' + PCD.escapeHtml(row.stockUnit) + '</td>' +
            '<td class="num">' + PCD.fmtNumber(row.amount) + ' ' + PCD.escapeHtml(row.qtyUnit) + '</td>' +
            '<td class="num bold">' + PCD.fmtMoney(row.lineCost) + '</td>' +
          '</tr>';
      });

      recipesHtml +=
        '<section class="recipe">' +
          '<div class="recipe-header">' +
            '<div>' +
              '<h2>' + PCD.escapeHtml(r.name) + '</h2>' +
              '<div class="meta">' + PCD.escapeHtml(recipeSubtitle(r, it)) + '</div>' +
            '</div>' +
            '<div class="fc-badge">FC <b>' + fcPct.toFixed(1) + '%</b></div>' +
          '</div>' +

          '<table class="ing-table">' +
            '<thead><tr>' +
              '<th>' + t('cr_ingredient') + '</th><th>' + t('cr_unit_price') + '</th><th>' + t('cr_qty') + '</th><th>' + t('cr_cost') + '</th>' +
            '</tr></thead>' +
            '<tbody>' + ingRows + '</tbody>' +
            '<tfoot>' +
              '<tr><td colspan="3" class="num">' + t('cr_total_food_cost') + '</td><td class="num bold">' + PCD.fmtMoney(it.totalCost) + '</td></tr>' +
              // v2.8.30 — Prep: hide "Cost per serving"; show "Cost per
              // [yieldUnit]" when yield is recorded. Menu items unchanged.
              (PCD.recipes.isPrep(it.recipe)
                ? ((it.recipe.yieldAmount && it.recipe.yieldUnit)
                  ? '<tr><td colspan="3" class="num minor">' + t('cr_cost_per_yield', { unit: it.recipe.yieldUnit }) + '</td><td class="num">' + PCD.fmtMoney(it.totalCost / it.recipe.yieldAmount) + '</td></tr>'
                  : '')
                : '<tr><td colspan="3" class="num minor">' + t('cr_cost_per_serving') + '</td><td class="num">' + PCD.fmtMoney(it.costPerServing) + '</td></tr>'
              ) +
            '</tfoot>' +
          '</table>' +

          // v2.8.30 — Pricing block hidden for preps (not sold directly).
          (PCD.recipes.isPrep(it.recipe) ? '' :
          '<div class="pricing">' +
            '<div><div class="lbl">' + t('cr_current_price') + '</div><div class="val">' + (it.currentPrice != null ? PCD.fmtMoney(it.currentPrice) : '—') + '</div></div>' +
            '<div><div class="lbl">' + t('cr_suggested', { n: targetPct }) + '</div><div class="val brand">' + PCD.fmtMoney(it.suggestedPrice) + '</div></div>' +
            '<div><div class="lbl">' + t('cr_test_price') + '</div><div class="val">' + PCD.fmtMoney(it.testPrice || 0) + '</div></div>' +
            '<div><div class="lbl">' + t('cr_margin_serving') + '</div><div class="val">' + PCD.fmtMoney(Math.max(0, (it.testPrice || 0) - it.costPerServing)) + '</div></div>' +
          '</div>'
          ) +
        '</section>';
    });

    const summaryFcPct = summaryTotalRevenue > 0 ? (summaryTotalCost / summaryTotalRevenue) * 100 : 0;
    const recipesText = items.length === 1 ? t('cr_n_recipes', { n: items.length }) : t('cr_n_recipes_plural', { n: items.length });

    const html =
      '<style>' +
        '@page { size: A4; margin: 14mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
        '.report-header { border-bottom: 3px solid #16a34a; padding-bottom: 10px; margin-bottom: 18px; display:flex; justify-content:space-between; align-items:flex-end; }' +
        '.report-header h1 { font-size: 22pt; color: #16a34a; margin: 0; }' +
        '.report-header .sub { color: #666; font-size: 10pt; margin-top: 4px; }' +
        '.report-header .meta { color: #888; font-size: 9pt; text-align: end; }' +
        '.recipe { margin-bottom: 22px; padding-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }' +
        '.recipe + .recipe { border-top: 1px solid #e5e5e5; padding-top: 14px; }' +
        '.recipe-header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 8px; }' +
        '.recipe-header h2 { font-size: 14pt; margin: 0; color: #111; }' +
        '.recipe-header .meta { font-size: 9pt; color: #888; text-transform: capitalize; }' +
        '.fc-badge { font-size: 10pt; color: #16a34a; padding: 4px 10px; border: 1.5px solid #16a34a; border-radius: 999px; }' +
        '.fc-badge b { font-size: 11pt; }' +
        '.ing-table { width:100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 10px; }' +
        '.ing-table th { background: #f8f8f8; text-align: start; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 1.5px solid #ddd; }' +
        '.ing-table th.num, .ing-table td.num { text-align: end; }' +
        '.ing-table td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }' +
        '.ing-table tfoot td { border-bottom: 0; padding-top: 6px; }' +
        '.ing-table tfoot tr:first-child td { border-top: 2px solid #16a34a; padding-top: 8px; }' +
        '.ing-table .bold { font-weight: 700; color: #16a34a; }' +
        '.ing-table .minor { color: #888; font-size: 9pt; }' +
        '.pricing { display:grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 10px 14px; background: #f8f8f8; border-radius: 6px; }' +
        '.pricing .lbl { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }' +
        '.pricing .val { font-size: 12pt; font-weight: 700; }' +
        '.pricing .brand { color: #16a34a; }' +
        '.summary { margin-top: 20px; padding: 14px; background: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 8px; }' +
        '.summary h3 { font-size: 11pt; color: #16a34a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }' +
        '.summary-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }' +
        '.pcd-print-footer { display: none !important; }' +
        '.cr-foot { margin-top: 18px; text-align: center; font-size: 8pt; color: #999; padding-top: 10px; border-top: 1px solid #eee; }' +
      '</style>' +
      '<div class="report-header">' +
        '<div>' +
          '<h1>' + t('cr_title') + '</h1>' +
          '<div class="sub">' + recipesText + ' · ' + t('cr_target_food_cost') + ' ' + targetPct + '%</div>' +
        '</div>' +
        '<div class="meta">' + dateStr + (wsName ? ' · ' + PCD.escapeHtml(wsName) : '') + '</div>' +
      '</div>' +
      recipesHtml +
      (items.length > 1 ?
      '<div class="summary">' +
        '<h3>' + t('cr_summary') + '</h3>' +
        '<div class="summary-grid">' +
          '<div class="pricing"><div><div class="lbl">' + t('cr_total_food_cost') + '</div><div class="val">' + PCD.fmtMoney(summaryTotalCost) + '</div></div></div>' +
          // v2.8.30 — Hide revenue/avg-fc/profit cells in PDF summary when no menu items (all-prep report).
          (items.some(function (it) { return !PCD.recipes.isPrep(it.recipe); }) ?
            '<div class="pricing"><div><div class="lbl">' + t('cr_total_revenue') + '</div><div class="val">' + PCD.fmtMoney(summaryTotalRevenue) + '</div></div></div>' +
            '<div class="pricing"><div><div class="lbl">' + t('cr_avg_food_cost') + '</div><div class="val brand">' + summaryFcPct.toFixed(1) + '%</div></div></div>' +
            '<div class="pricing"><div><div class="lbl">' + t('cr_total_profit') + '</div><div class="val">' + PCD.fmtMoney(Math.max(0, summaryTotalRevenue - summaryTotalCost)) + '</div></div></div>'
            : ''
          ) +
        '</div>' +
      '</div>' : '') +
      '<div class="cr-foot">' + t('cr_made_with') + '</div>';

    PCD.print(html, t('cr_title') + ' ' + new Date().toISOString().slice(0, 10));
  }

  // Excel: 1 sheet per recipe + Summary sheet, with full professional styling
  function exportCostReportXLSX(items, targetPct) {
    const t = PCD.i18n.t;
    if (!window.XLSX) {
      PCD.toast.error(t('cr_xlsx_unavailable') || 'Excel library not loaded — try refreshing the page');
      return;
    }
    const ingMap = currentIngMap();
    // v2.8.16 — recipeMap for sub-recipe rows (same fix pattern)
    const recipeMap = PCD.recipes.buildRecipeMap();
    const wb = XLSX.utils.book_new();

    // ============ STYLE PRESETS ============
    const BRAND = '16A34A';        // green
    const BRAND_LIGHT = 'F0FDF4';
    const HEADER_BG = '16A34A';
    const ROW_ALT = 'FAFAFA';
    const TEST_BG = 'FEF3C7';      // amber for editable test price
    const BORDER_COLOR = 'D4D4D4';
    const LINK_COLOR = '0066CC';

    const thinBorder = {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    };
    const thickBorder = {
      top: { style: 'medium', color: { rgb: BRAND } },
      bottom: { style: 'medium', color: { rgb: BRAND } },
      left: { style: 'medium', color: { rgb: BRAND } },
      right: { style: 'medium', color: { rgb: BRAND } },
    };

    const titleStyle = {
      font: { name: 'Calibri', sz: 18, bold: true, color: { rgb: BRAND } },
      alignment: { vertical: 'center', horizontal: 'left' },
    };
    const subtitleStyle = {
      font: { name: 'Calibri', sz: 10, color: { rgb: '666666' } },
      alignment: { vertical: 'center' },
    };
    const sectionHeaderStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: BRAND } },
      alignment: { vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: BRAND } } },
    };
    const tableHeaderStyle = {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: HEADER_BG } },
      alignment: { vertical: 'center', horizontal: 'left' },
      border: thinBorder,
    };
    const tableHeaderRightStyle = Object.assign({}, tableHeaderStyle, {
      alignment: { vertical: 'center', horizontal: 'right' },
    });
    const tableHeaderCenterStyle = Object.assign({}, tableHeaderStyle, {
      alignment: { vertical: 'center', horizontal: 'center' },
    });
    const cellStyle = {
      font: { name: 'Calibri', sz: 10 },
      alignment: { vertical: 'center', horizontal: 'left' },
      border: thinBorder,
    };
    const cellNumStyle = {
      font: { name: 'Calibri', sz: 10 },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: thinBorder,
      numFmt: '"$"#,##0.00',
    };
    const cellQtyStyle = {
      font: { name: 'Calibri', sz: 10 },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: thinBorder,
      numFmt: '#,##0.##',
    };
    const cellNumAltStyle = Object.assign({}, cellNumStyle, { fill: { fgColor: { rgb: ROW_ALT } } });
    const cellAltStyle = Object.assign({}, cellStyle, { fill: { fgColor: { rgb: ROW_ALT } } });
    const cellQtyAltStyle = Object.assign({}, cellQtyStyle, { fill: { fgColor: { rgb: ROW_ALT } } });
    const totalRowStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: BRAND } },
      fill: { fgColor: { rgb: BRAND_LIGHT } },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: { top: { style: 'medium', color: { rgb: BRAND } }, bottom: thinBorder.bottom, left: thinBorder.left, right: thinBorder.right },
      numFmt: '"$"#,##0.00',
    };
    const totalLabelStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: BRAND } },
      fill: { fgColor: { rgb: BRAND_LIGHT } },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: { top: { style: 'medium', color: { rgb: BRAND } }, bottom: thinBorder.bottom, left: thinBorder.left, right: thinBorder.right },
    };
    const totalLabelLeftStyle = Object.assign({}, totalLabelStyle, {
      alignment: { vertical: 'center', horizontal: 'left' },
    });
    const totalQtyStyle = Object.assign({}, totalRowStyle, { numFmt: '0' });
    const totalPctStyle = Object.assign({}, totalRowStyle, { numFmt: '0.00%' });
    const pricingLabelStyle = {
      font: { name: 'Calibri', sz: 10, bold: true },
      alignment: { vertical: 'center', horizontal: 'left' },
      border: thinBorder,
      fill: { fgColor: { rgb: ROW_ALT } },
    };
    const pricingValStyle = {
      font: { name: 'Calibri', sz: 11, bold: true },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: thinBorder,
      numFmt: '"$"#,##0.00',
    };
    const editableStyle = {
      font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: '92400E' } },
      fill: { fgColor: { rgb: TEST_BG } },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: thickBorder,
      numFmt: '"$"#,##0.00',
    };
    const editableLabelStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '92400E' } },
      fill: { fgColor: { rgb: TEST_BG } },
      alignment: { vertical: 'center', horizontal: 'left' },
      border: thickBorder,
    };
    const pctStyle = {
      font: { name: 'Calibri', sz: 11, bold: true },
      alignment: { vertical: 'center', horizontal: 'right' },
      border: thinBorder,
      numFmt: '0.00%',
    };
    const linkStyle = {
      font: { name: 'Calibri', sz: 10, color: { rgb: LINK_COLOR }, underline: true },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: thinBorder,
    };
    const linkAltStyle = Object.assign({}, linkStyle, { fill: { fgColor: { rgb: ROW_ALT } } });
    const footerStyle = {
      font: { name: 'Calibri', sz: 8, italic: true, color: { rgb: '999999' } },
      alignment: { vertical: 'center', horizontal: 'center' },
    };

    // Helper to set a cell value+style (+ optional formula and hyperlink target)
    function setCell(ws, addr, value, style, formula, hyperlink) {
      const cell = {};
      if (formula) {
        cell.f = formula;
        cell.v = value;
        cell.t = 'n';
      } else {
        cell.v = value;
        if (typeof value === 'number') cell.t = 'n';
        else if (typeof value === 'string') cell.t = 's';
      }
      if (style) cell.s = style;
      if (hyperlink) cell.l = { Target: hyperlink, Tooltip: hyperlink };
      ws[addr] = cell;
    }

    // Compute the actual sheet name for each recipe (Excel-safe)
    // We need this in advance so Summary can hyperlink to the right sheet.
    const sheetNames = items.map(function (it, idx) {
      const r = it.recipe;
      return (r.name || ('Recipe' + (idx + 1))).slice(0, 28).replace(/[\\\/\?\*\[\]:]/g, '_');
    });

    // ============ SUMMARY SHEET ============
    // Layout:
    //   A1: title
    //   A2: generated date
    //   A3: target food cost
    //   Row 5: header row
    //   Row 6+: data rows (one per recipe)
    //   Row N: TOTAL row (formulas)
    //   Row N+2: footer (Made with ProChefDesk)
    //
    // Columns: A=Recipe, B=Servings, C=Total food cost, D=Cost per serving,
    //          E=Suggested price, F=Test price, G=Food cost %, H=Profit/serving,
    //          I=Detail link

    const summaryWs = {};
    setCell(summaryWs, 'A1', t('cr_title') + ' · ' + t('cr_summary'), titleStyle);
    setCell(summaryWs, 'A2', t('cr_generated') + ': ' + new Date().toLocaleString((PCD.i18n && PCD.i18n.currentLocale) || 'en'), subtitleStyle);
    setCell(summaryWs, 'A3', t('cr_target_food_cost') + ': ' + targetPct + '%', subtitleStyle);

    // Row 5: header
    const sumHeaderRow = 5;
    const sumHeaders = [
      { col: 'A', label: t('cr_recipe'),           style: tableHeaderStyle },
      { col: 'B', label: t('cr_servings'),         style: tableHeaderRightStyle },
      { col: 'C', label: t('cr_total_food_cost'),  style: tableHeaderRightStyle },
      { col: 'D', label: t('cr_cost_per_serving'), style: tableHeaderRightStyle },
      { col: 'E', label: t('cr_suggested_price'),  style: tableHeaderRightStyle },
      { col: 'F', label: t('cr_test_price'),       style: tableHeaderRightStyle },
      { col: 'G', label: t('cr_food_cost_pct'),    style: tableHeaderRightStyle },
      { col: 'H', label: t('cr_profit_serving'),   style: tableHeaderRightStyle },
      { col: 'I', label: '',                       style: tableHeaderCenterStyle },
    ];
    sumHeaders.forEach(function (h) {
      setCell(summaryWs, h.col + sumHeaderRow, h.label, h.style);
    });

    // Detail sheet keeps its values in F-column at known offsets — these are
    // the rows we'll cross-link from Summary so the Test price stays in sync.
    // We store per-recipe row offsets while building Summary, then patch
    // Summary formulas after Detail sheets exist.
    const detailRefs = []; // {sheetName, totalRow, servingsRow, cpsRow, suggRow, testRow}

    // Data rows from row 6
    let sumRow = 6;
    const firstDataRow = sumRow;
    items.forEach(function (it, idx) {
      const r = it.recipe;
      const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) : 0;
      const profit = Math.max(0, (it.testPrice || 0) - it.costPerServing);
      const isAlt = idx % 2 === 1;
      // v2.8.30 — Preps leave Servings/Suggested/Test/FC%/Profit blank
      // in Summary (menu-item concepts). Total cost stays.
      const isPrepSum = PCD.recipes.isPrep(r);
      // Cells filled with cached values now; we'll add formulas after detail sheets exist.
      setCell(summaryWs, 'A' + sumRow, r.name, isAlt ? cellAltStyle : cellStyle);
      setCell(summaryWs, 'B' + sumRow, isPrepSum ? '' : it.servings, isAlt ? cellQtyAltStyle : cellQtyStyle);
      setCell(summaryWs, 'C' + sumRow, it.totalCost, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'D' + sumRow, isPrepSum ? '' : it.costPerServing, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'E' + sumRow, isPrepSum ? '' : it.suggestedPrice, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'F' + sumRow, isPrepSum ? '' : (it.testPrice || 0), isAlt
        ? Object.assign({}, editableStyle, { fill: { fgColor: { rgb: TEST_BG } } })
        : editableStyle);
      setCell(summaryWs, 'G' + sumRow, isPrepSum ? '' : fcPct, isAlt ? Object.assign({}, pctStyle, { fill: { fgColor: { rgb: ROW_ALT } } }) : pctStyle);
      setCell(summaryWs, 'H' + sumRow, isPrepSum ? '' : profit, isAlt ? cellNumAltStyle : cellNumStyle);
      // Hyperlink to detail sheet (added below once sheet name is known)
      sumRow++;
    });
    const lastDataRow = sumRow - 1;

    // TOTAL row (per-serving set-menu math)
    const totalRow = sumRow;
    setCell(summaryWs, 'A' + totalRow, t('cr_total_row'), totalLabelLeftStyle);
    // Servings + Total food cost left blank intentionally (per-serving focus)
    setCell(summaryWs, 'B' + totalRow, '', totalLabelStyle);
    setCell(summaryWs, 'C' + totalRow, '', totalLabelStyle);
    // D: Cost per serving SUM
    setCell(summaryWs, 'D' + totalRow,
      items.reduce(function (a, it) { return a + it.costPerServing; }, 0),
      totalRowStyle,
      'SUM(D' + firstDataRow + ':D' + lastDataRow + ')');
    // E: Suggested price SUM
    setCell(summaryWs, 'E' + totalRow,
      items.reduce(function (a, it) { return a + it.suggestedPrice; }, 0),
      totalRowStyle,
      'SUM(E' + firstDataRow + ':E' + lastDataRow + ')');
    // F: Test price SUM (set-menu price)
    setCell(summaryWs, 'F' + totalRow,
      items.reduce(function (a, it) { return a + (it.testPrice || 0); }, 0),
      totalRowStyle,
      'SUM(F' + firstDataRow + ':F' + lastDataRow + ')');
    // G: Food cost % = D / F (set-menu cost % set-menu price)
    setCell(summaryWs, 'G' + totalRow,
      0,  // cached value computed below
      totalPctStyle,
      'IF(F' + totalRow + '>0, D' + totalRow + '/F' + totalRow + ', 0)');
    // H: Profit/serving SUM (per-serving profits added)
    setCell(summaryWs, 'H' + totalRow,
      items.reduce(function (a, it) { return a + Math.max(0, (it.testPrice || 0) - it.costPerServing); }, 0),
      totalRowStyle,
      'SUM(H' + firstDataRow + ':H' + lastDataRow + ')');
    // Recompute cached G value
    {
      const dSum = items.reduce(function (a, it) { return a + it.costPerServing; }, 0);
      const fSum = items.reduce(function (a, it) { return a + (it.testPrice || 0); }, 0);
      summaryWs['G' + totalRow].v = fSum > 0 ? dSum / fSum : 0;
    }
    // I column on total row blank
    setCell(summaryWs, 'I' + totalRow, '', totalLabelStyle);

    // Footer row
    const footerRow = totalRow + 2;
    setCell(summaryWs, 'A' + footerRow, t('cr_made_with'), footerStyle);

    // Column widths — auto-fit based on content
    function autoFit(rows) {
      // rows = array of arrays of string-coerced cell values
      const cols = [];
      rows.forEach(function (row) {
        row.forEach(function (val, c) {
          const s = String(val == null ? '' : val);
          if (!cols[c] || s.length > cols[c]) cols[c] = s.length;
        });
      });
      // Add a bit of padding, clamp min 8 / max 40
      return cols.map(function (w) {
        return { wch: Math.min(40, Math.max(8, (w || 8) + 2)) };
      });
    }

    // Build a string-table to size from
    const summaryStrRows = [
      sumHeaders.map(function (h) { return h.label; }),
    ];
    items.forEach(function (it) {
      summaryStrRows.push([
        it.recipe.name,
        String(it.servings),
        '$' + it.totalCost.toFixed(2),
        '$' + it.costPerServing.toFixed(2),
        '$' + it.suggestedPrice.toFixed(2),
        '$' + (it.testPrice || 0).toFixed(2),
        ((it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) * 100 : 0).toFixed(2) + '%',
        '$' + Math.max(0, (it.testPrice || 0) - it.costPerServing).toFixed(2),
        t('cr_go_to_detail'),
      ]);
    });
    summaryStrRows.push([t('cr_total_row'), '', '', '$0.00', '$0.00', '$0.00', '0%', '$0.00', '']);
    summaryWs['!cols'] = autoFit(summaryStrRows);

    // Title spans all columns
    summaryWs['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // A1:I1 title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, // A2 generated
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }, // A3 target
      { s: { r: footerRow - 1, c: 0 }, e: { r: footerRow - 1, c: 8 } }, // footer
    ];
    summaryWs['!rows'] = [{ hpt: 28 }];
    summaryWs['!ref'] = 'A1:I' + footerRow;
    // Freeze panes below header row
    summaryWs['!freeze'] = { xSplit: 0, ySplit: sumHeaderRow };

    XLSX.utils.book_append_sheet(wb, summaryWs, t('cr_summary'));

    // ============ ONE SHEET PER RECIPE ============
    items.forEach(function (it, idx) {
      const r = it.recipe;
      const sheetName = sheetNames[idx];
      const ws = {};
      let row = 1;

      // Title (column A) + back-link (column F)
      setCell(ws, 'A' + row, r.name, titleStyle);
      // Back-link in F column same row
      setCell(ws, 'F' + row, t('cr_go_to_summary'), linkStyle, null, "#'" + t('cr_summary') + "'!A1");
      row++;
      setCell(ws, 'A' + row, recipeSubtitle(r, it), subtitleStyle);
      row++;
      row++;  // blank

      // Section: Ingredients
      setCell(ws, 'A' + row, t('cr_ingredient_breakdown'), sectionHeaderStyle);
      row++;

      // Header row
      setCell(ws, 'A' + row, t('cr_ingredient'), tableHeaderStyle);
      setCell(ws, 'B' + row, t('cr_unit_price'), tableHeaderRightStyle);
      setCell(ws, 'C' + row, t('cr_unit'), tableHeaderStyle);
      setCell(ws, 'D' + row, t('cr_qty'), tableHeaderRightStyle);
      setCell(ws, 'E' + row, t('cr_qty_unit'), tableHeaderStyle);
      setCell(ws, 'F' + row, t('cr_line_cost'), tableHeaderRightStyle);
      row++;

      const startIngRow = row;
      let lastIngRow = row - 1;

      (r.ingredients || []).forEach(function (ri, ingIdx) {
        const rRow = PCD.recipes.resolveRow(ri, ingMap, recipeMap);
        if (!rRow || !rRow.found) return;
        // v2.8.16 — Sub-recipe rows were silently dropped; now included.
        // D holds qty in stock unit so the B*D formula stays valid (the
        // existing xlsx behavior shows converted quantities, e.g. "1 kg"
        // entered → "1000 g" displayed when stockUnit is g). E shows the
        // stock unit to match D. Sub-recipes get a "(SUB)" suffix in the
        // name cell since xlsx cells can't carry HTML badges.
        const displayName = rRow.isSub ? rRow.name + ' (SUB)' : rRow.name;
        const isAlt = ingIdx % 2 === 1;
        setCell(ws, 'A' + row, displayName, isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'B' + row, rRow.unitPrice, isAlt ? cellNumAltStyle : cellNumStyle);
        setCell(ws, 'C' + row, rRow.stockUnit, isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'D' + row, rRow.qtyInStock, isAlt ? cellQtyAltStyle : cellQtyStyle);
        setCell(ws, 'E' + row, rRow.stockUnit, isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'F' + row, rRow.lineCost, isAlt ? cellNumAltStyle : cellNumStyle, 'B' + row + '*D' + row);
        lastIngRow = row;
        row++;
      });

      row++;  // blank

      // Totals
      const detailTotalRow = row;
      setCell(ws, 'A' + row, '', totalLabelStyle);
      setCell(ws, 'B' + row, '', totalLabelStyle);
      setCell(ws, 'C' + row, '', totalLabelStyle);
      setCell(ws, 'D' + row, '', totalLabelStyle);
      setCell(ws, 'E' + row, t('cr_total_food_cost_xlsx'), totalLabelStyle);
      setCell(ws, 'F' + row, it.totalCost, totalRowStyle, 'SUM(F' + startIngRow + ':F' + lastIngRow + ')');
      row++;

      // v2.8.30 — Prep handling: replace Servings + Cost-per-serving
      // rows with Yield + Cost-per-yield (when yield is set), and skip
      // the entire pricing section (Target/Suggested/Test/FC%/Margin/
      // Revenue/Profit) since preps aren't sold directly.
      const isPrepXlsx = PCD.recipes.isPrep(it.recipe);

      const servingsRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      if (isPrepXlsx) {
        if (it.recipe.yieldAmount && it.recipe.yieldUnit) {
          setCell(ws, 'E' + row, t('cr_yield_label', { unit: it.recipe.yieldUnit }), pricingLabelStyle);
          setCell(ws, 'F' + row, it.recipe.yieldAmount, Object.assign({}, pricingValStyle, { numFmt: '0.##' }));
        }
        // If no yield, skip this row entirely (leave blank cells already set)
      } else {
        setCell(ws, 'E' + row, t('cr_servings'), pricingLabelStyle);
        setCell(ws, 'F' + row, it.servings, Object.assign({}, pricingValStyle, { numFmt: '0' }));
      }
      row++;

      const cpsRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      if (isPrepXlsx) {
        if (it.recipe.yieldAmount && it.recipe.yieldUnit) {
          setCell(ws, 'E' + row, t('cr_cost_per_yield', { unit: it.recipe.yieldUnit }), pricingLabelStyle);
          setCell(ws, 'F' + row, it.totalCost / it.recipe.yieldAmount, pricingValStyle, 'F' + detailTotalRow + '/F' + servingsRow);
        }
      } else {
        setCell(ws, 'E' + row, t('cr_cost_per_serving'), pricingLabelStyle);
        setCell(ws, 'F' + row, it.costPerServing, pricingValStyle, 'F' + detailTotalRow + '/F' + servingsRow);
      }
      row++;

      // v2.8.30 — For preps, skip the entire pricing section.
      // Their cost rolls into parent menu items; suggesting a sale
      // price for a sauce is misleading.
      let suggRow = null, testRow = null;  // hoisted for detailRefs.push below
      if (!isPrepXlsx) {

      row++;  // blank

      // Pricing section
      setCell(ws, 'A' + row, t('cr_pricing_section'), sectionHeaderStyle);
      row++;

      const targetRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, t('cr_target_pct'), pricingLabelStyle);
      setCell(ws, 'F' + row, targetPct / 100, Object.assign({}, pricingValStyle, { numFmt: '0%' }));
      row++;

      suggRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, t('cr_suggested_price'), pricingLabelStyle);
      setCell(ws, 'F' + row, it.suggestedPrice, pricingValStyle, 'F' + cpsRow + '/F' + targetRow);
      row++;

      const testPriceVal = it.testPrice || it.suggestedPrice || 0;
      testRow = row;
      setCell(ws, 'A' + row, '', editableLabelStyle);
      setCell(ws, 'B' + row, '', editableLabelStyle);
      setCell(ws, 'C' + row, '', editableLabelStyle);
      setCell(ws, 'D' + row, '', editableLabelStyle);
      setCell(ws, 'E' + row, t('cr_test_price_edit'), editableLabelStyle);
      setCell(ws, 'F' + row, testPriceVal, editableStyle);
      row++;

      const fcPctRow = row;
      const fcPctVal = testPriceVal > 0 ? it.costPerServing / testPriceVal : 0;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, t('cr_food_cost_at_test'), pricingLabelStyle);
      setCell(ws, 'F' + row, fcPctVal, pctStyle, 'IF(F' + testRow + '>0, F' + cpsRow + '/F' + testRow + ', 0)');
      row++;

      const marginRow = row;
      const marginVal = testPriceVal - it.costPerServing;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, t('cr_margin_per_serving'), pricingLabelStyle);
      setCell(ws, 'F' + row, marginVal, pricingValStyle, 'F' + testRow + '-F' + cpsRow);
      row++;

      const revRow = row;
      const revVal = testPriceVal * it.servings;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, t('cr_total_revenue'), pricingLabelStyle);
      setCell(ws, 'F' + row, revVal, pricingValStyle, 'F' + testRow + '*F' + servingsRow);
      row++;

      const profitRow = row;
      const profitVal = revVal - it.totalCost;
      setCell(ws, 'A' + row, '', totalLabelStyle);
      setCell(ws, 'B' + row, '', totalLabelStyle);
      setCell(ws, 'C' + row, '', totalLabelStyle);
      setCell(ws, 'D' + row, '', totalLabelStyle);
      setCell(ws, 'E' + row, t('cr_total_profit_xlsx'), totalLabelStyle);
      setCell(ws, 'F' + row, profitVal, totalRowStyle, 'F' + testRow + '*F' + servingsRow + '-F' + detailTotalRow);
      row++;

      }  // end !isPrepXlsx pricing section

      // Footer
      const detailFooterRow = row + 1;
      setCell(ws, 'A' + detailFooterRow, t('cr_made_with'), footerStyle);

      // Column widths — compute based on actual content for this sheet
      const detailRows = [
        [r.name],
        [recipeSubtitle(r, it)],
        [t('cr_ingredient_breakdown')],
        [t('cr_ingredient'), t('cr_unit_price'), t('cr_unit'), t('cr_qty'), t('cr_qty_unit'), t('cr_line_cost')],
      ];
      (r.ingredients || []).forEach(function (ri) {
        const rRow = PCD.recipes.resolveRow(ri, ingMap, recipeMap);
        if (!rRow || !rRow.found) return;
        // v2.8.16 — Sub-recipe rows are now included. Also incidentally
        // fixes a pre-existing unit-conversion bug: the old code did
        // `pricePerUnit × ri.amount` without converting when ri.unit
        // differed from ing.unit, so a "1 kg" line against a g-priced
        // ingredient showed cost as ~$0.0004 instead of correct value.
        const displayName = rRow.isSub ? rRow.name + ' (SUB)' : rRow.name;
        detailRows.push([
          displayName,
          '$' + rRow.unitPrice.toFixed(2),
          rRow.stockUnit,
          String(rRow.qtyInStock),
          rRow.stockUnit,
          '$' + rRow.lineCost.toFixed(2),
        ]);
      });
      detailRows.push(['', '', '', '', t('cr_total_food_cost_xlsx'), '$' + it.totalCost.toFixed(2)]);
      // v2.8.30 — Mirror the actual rendered rows. Preps render Yield +
      // Cost-per-yield-unit (or nothing if no yield) and skip the entire
      // pricing block, so detailRows must match — otherwise autoFit
      // references undefined vars (testPriceVal, marginVal, etc.) and
      // throws "Something went wrong" before download.
      if (isPrepXlsx) {
        if (it.recipe.yieldAmount && it.recipe.yieldUnit) {
          detailRows.push(['', '', '', '', t('cr_yield_label', { unit: it.recipe.yieldUnit }), String(it.recipe.yieldAmount)]);
          detailRows.push(['', '', '', '', t('cr_cost_per_yield', { unit: it.recipe.yieldUnit }), '$' + (it.totalCost / it.recipe.yieldAmount).toFixed(2)]);
        }
      } else {
        detailRows.push(['', '', '', '', t('cr_servings'), String(it.servings)]);
        detailRows.push(['', '', '', '', t('cr_cost_per_serving'), '$' + it.costPerServing.toFixed(2)]);
        detailRows.push(['', '', '', '', t('cr_pricing_section')]);
        detailRows.push(['', '', '', '', t('cr_target_pct'), targetPct + '%']);
        detailRows.push(['', '', '', '', t('cr_suggested_price'), '$' + it.suggestedPrice.toFixed(2)]);
        detailRows.push(['', '', '', '', t('cr_test_price_edit'), '$' + testPriceVal.toFixed(2)]);
        detailRows.push(['', '', '', '', t('cr_food_cost_at_test'), '0.00%']);
        detailRows.push(['', '', '', '', t('cr_margin_per_serving'), '$' + marginVal.toFixed(2)]);
        detailRows.push(['', '', '', '', t('cr_total_revenue'), '$' + revVal.toFixed(2)]);
        detailRows.push(['', '', '', '', t('cr_total_profit_xlsx'), '$' + profitVal.toFixed(2)]);
      }
      ws['!cols'] = autoFit(detailRows);

      ws['!ref'] = 'A1:F' + detailFooterRow;
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // title A1:E1 (F1 has back-link)
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // subtitle
        { s: { r: detailFooterRow - 1, c: 0 }, e: { r: detailFooterRow - 1, c: 5 } }, // footer
      ];
      ws['!rows'] = [{ hpt: 28 }];

      detailRefs.push({
        sheetName: sheetName,
        totalRow: detailTotalRow,
        servingsRow: servingsRow,
        cpsRow: cpsRow,
        suggRow: suggRow,
        testRow: testRow,
        isPrep: isPrepXlsx,  // v2.8.30 — drives Summary formula skipping
      });

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // === PATCH SUMMARY: hyperlinks + cross-sheet formulas ===
    detailRefs.forEach(function (ref, idx) {
      const r = firstDataRow + idx;
      const sn = ref.sheetName;
      const isAlt = idx % 2 === 1;
      // Quote sheet name for Excel formula syntax
      const qsn = "'" + sn.replace(/'/g, "''") + "'!";

      // Cross-sheet formulas: pull live values from Detail sheet so that
      // editing Test price on EITHER sheet keeps the report consistent.
      // v2.8.30 — Preps skip the pricing section in the Detail sheet,
      // so suggRow/testRow are null; for those rows, leave the
      // pre-populated literal values in place (no formula overlay).
      // CPS/G/H are also skipped for preps — Summary cells for those
      // columns are blank for preps and shouldn't be overlaid with
      // formulas referencing menu-item-only rows.
      summaryWs['C' + r].f = qsn + 'F' + ref.totalRow;
      if (!ref.isPrep) {
        summaryWs['D' + r].f = qsn + 'F' + ref.cpsRow;
        if (ref.suggRow != null) summaryWs['E' + r].f = qsn + 'F' + ref.suggRow;
        if (ref.testRow != null) summaryWs['F' + r].f = qsn + 'F' + ref.testRow;
        // G = D / F (food cost % on this row, live)
        summaryWs['G' + r].f = 'IF(F' + r + '>0, D' + r + '/F' + r + ', 0)';
        // H = F - D (profit per serving, live)
        summaryWs['H' + r].f = 'F' + r + '-D' + r;
      }

      // Hyperlink in column I to the detail sheet
      const linkCell = {
        v: t('cr_go_to_detail'),
        t: 's',
        s: isAlt ? linkAltStyle : linkStyle,
        l: { Target: '#' + qsn + 'A1', Tooltip: sn },
      };
      summaryWs['I' + r] = linkCell;
    });

    const filename = (t('cr_title') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx').replace(/\s+/g, '-').toLowerCase();
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;
    XLSX.writeFile(wb, filename);
    PCD.toast.success(t('cr_xlsx_done') || 'Excel downloaded · open and edit yellow Test price cells');
  }

  function openPreview(rid) {
    const t = PCD.i18n.t;
    const r = PCD.store.getRecipe(rid);
    if (!r) { PCD.toast.error(PCD.i18n.t('toast_recipe_not_found')); return; }
    const ingMap = currentIngMap();
    const recipeMap = PCD.recipes.buildRecipeMap();
    const cost = PCD.recipes.computeFoodCost(r, ingMap, recipeMap);
    const costPerServing = r.servings ? cost / r.servings : cost;
    const pct = (r.salePrice && cost > 0 && r.servings) ? (costPerServing / r.salePrice) * 100 : null;

    let ingsHtml = '';
    // v2.8.14 — Sub-recipe rows (ri.recipeId set) were showing as
    // "(removed)" because this loop only looked up ri.ingredientId.
    // Now resolves the sub-recipe name from recipeMap when present.
    (r.ingredients || []).forEach(function (ri) {
      let name;
      if (ri.recipeId) {
        const sub = recipeMap[ri.recipeId];
        name = sub ? sub.name : '(removed sub-recipe)';
      } else {
        const ing = ingMap[ri.ingredientId];
        name = ing ? ing.name : '(removed ingredient)';
      }
      ingsHtml += `<li style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
        <span>${PCD.escapeHtml(name)}</span>
        <span class="text-muted">${PCD.fmtNumber(ri.amount)} ${ri.unit || ''}</span>
      </li>`;
    });

    const body = PCD.el('div');
    // v2.8.28 — Preps hide Category, Servings, and "cost per serving"
    // in the preview popup. These fields are menu-item concepts; a
    // prep showing "Main · 1 servings · $X per serving" is misleading.
    // The prep's yield (if set) is shown via the kitchen card label.
    const _isPrepForView = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
    body.innerHTML = `
      ${r.photo ? `<img src="${PCD.escapeHtml(r.photo)}" loading="lazy" alt="" style="width:100%;height:220px;object-fit:cover;border-radius:var(--r-lg);margin-bottom:14px;">` : ''}
      <div class="flex flex-col gap-2 mb-3">
        <div class="flex gap-2" style="flex-wrap:wrap;">
          ${_isPrepForView ? '<span class="chip chip-brand" style="background:var(--brand-50);color:var(--brand-700);font-weight:700;letter-spacing:0.06em;">SUB-RECIPE</span>' : '<span class="chip chip-brand">' + t(r.category || 'cat_main') + '</span>'}
          ${r.cuisine ? '<span class="chip">' + PCD.escapeHtml(r.cuisine) + '</span>' : ''}
          ${(!_isPrepForView && r.servings) ? '<span class="chip">' + r.servings + ' ' + t('recipe_servings').toLowerCase() + '</span>' : ''}
          ${(_isPrepForView && r.yieldAmount && r.yieldUnit) ? '<span class="chip">' + PCD.fmtNumber(r.yieldAmount) + ' ' + PCD.escapeHtml(r.yieldUnit) + '</span>' : ''}
          ${(r.prepTime || r.cookTime) ? '<span class="chip">⏱ ' + ((r.prepTime||0) + (r.cookTime||0)) + 'min</span>' : ''}
        </div>
      </div>

      <div class="grid grid-2 mb-3" style="gap:8px;">
        <div class="stat" style="padding:10px;"><div class="stat-label">${t('food_cost')}</div><div class="stat-value" style="font-size:18px;">${PCD.fmtMoney(cost)}</div></div>
        ${!_isPrepForView ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + t('cost_per_serving') + '</div><div class="stat-value" style="font-size:18px;">' + PCD.fmtMoney(costPerServing) + '</div></div>' : ''}
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
    const editBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('edit'), style: { flex: '1', minWidth: '100px' } });
    const duplicateBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Duplicate' });
    duplicateBtn.innerHTML = PCD.icon('copy', 16);
    const copyToWsBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: PCD.i18n.t('modal_copy_to_workspace_title') });
    copyToWsBtn.innerHTML = PCD.icon('truck', 16);
    const costReportBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Cost Report' });
    costReportBtn.innerHTML = PCD.icon('activity', 16) + ' <span>' + PCD.i18n.t('btn_cost_report') + '</span>';
    const shareBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const qrBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'QR' });
    qrBtn.innerHTML = PCD.icon('grid', 16);
    const deleteBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: t('delete'), style: { color: 'var(--danger)' } });
    deleteBtn.innerHTML = PCD.icon('trash', 16);
    footer.appendChild(deleteBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(qrBtn);
    footer.appendChild(duplicateBtn);
    footer.appendChild(copyToWsBtn);
    footer.appendChild(costReportBtn);
    footer.appendChild(editBtn);

    const m = PCD.modal.open({ title: r.name, body: body, footer: footer, size: 'md', closable: true });

    copyToWsBtn.addEventListener('click', function () {
      if (PCD.openCopyToWorkspace) PCD.openCopyToWorkspace('recipes', rid, r.name);
    });

    costReportBtn.addEventListener('click', function () {
      openCostReport([rid]);
    });

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
      PCD.toast.success(PCD.i18n.t('toast_recipe_duplicated'));
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
      // v2.8.14 — Build recipeMap so sub-recipe rows resolve to their
      // names instead of showing "(removed)". Also passed through to
      // openRecipeShareSheet so the downstream print path uses it.
      const recipeMap = PCD.recipes.buildRecipeMap();
      const lines = [r.name, ''];
      // v2.8.29 — Text share: skip servings line for preps; show yield instead when set.
      const _isPrepText = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
      if (_isPrepText) {
        if (r.yieldAmount && r.yieldUnit) {
          lines.push(t('recipe_yield_amount_label') + ': ' + PCD.fmtNumber(r.yieldAmount) + ' ' + r.yieldUnit);
        }
      } else {
        lines.push(t('recipe_servings') + ': ' + (r.servings || 1));
      }
      if (r.salePrice) lines.push(t('sale_price') + ': ' + PCD.fmtMoney(r.salePrice));
      lines.push('');
      lines.push(t('recipe_ingredients') + ':');
      (r.ingredients || []).forEach(function (ri) {
        let name;
        if (ri.recipeId) {
          const sub = recipeMap[ri.recipeId];
          name = sub ? sub.name : '(removed sub-recipe)';
        } else {
          const ing = ingMap[ri.ingredientId];
          name = ing ? ing.name : '(removed ingredient)';
        }
        lines.push('• ' + name + ' — ' + PCD.fmtNumber(ri.amount) + ' ' + (ri.unit || ''));
      });
      if (r.steps) {
        lines.push('');
        lines.push('Method:');
        lines.push(r.steps);
      }
      openRecipeShareSheet({ title: r.name, text: lines.join('\n'), recipe: r, ingMap: ingMap, recipeMap: recipeMap });
    });

    qrBtn.addEventListener('click', function () {
      // Generate a share URL and put THAT in the QR — so scanning opens
      // the recipe in a browser, not just a wall of text.
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error(t('qr_signin_required') || 'Sign in to create QR codes');
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error(t('qr_share_error') || 'QR generation failed');
        return;
      }
      qrBtn.disabled = true;
      const orig = qrBtn.innerHTML;
      qrBtn.innerHTML = '<span class="spinner"></span>';
      PCD.share.createOrGetShareUrl('recipe', rid).then(function (url) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = orig;
        PCD.qr.show({
          title: r.name,
          subtitle: t('act_show_qr') || 'Scan to view',
          text: url
        });
      }).catch(function (e) {
        qrBtn.disabled = false;
        qrBtn.innerHTML = orig;
        PCD.toast.error((t('qr_share_error') || 'QR error') + ': ' + (e.message || e));
      });
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
            PCD.toast.success(PCD.i18n.t('toast_restored'));
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
      '<div style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);border-radius:8px;margin-bottom:14px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:4px;">🔗 Public link · Herkese açık link</div>' +
        '<div class="text-muted text-sm" style="margin-bottom:10px;">Login olmadan da bu tarifi görebilen kalıcı bir link. WhatsApp, Instagram, e-posta, neye yapıştırırsan oraya yapışır.</div>' +
        '<button type="button" class="btn btn-primary btn-sm" id="rShPublicLink" style="width:100%;">' +
          PCD.icon('share', 14) + ' <span>' + PCD.i18n.t('btn_generate_share_link') + '</span>' +
        '</button>' +
        '<input type="text" id="rShLinkOutput" readonly style="display:none;width:100%;margin-top:8px;padding:8px;border:1.5px solid var(--brand-600);border-radius:6px;font-family:var(--font-mono);font-size:12px;background:#fff;">' +
      '</div>' +

      '<div style="font-weight:600;font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Or share as text</div>' +
      '<div class="field"><label class="field-label">Message</label>' +
      '<textarea class="textarea" id="rShareText" rows="8" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(opts.text) + '</textarea></div>' +
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

    // Public share link
    const linkBtn = PCD.$('#rShPublicLink', body);
    const linkOut = PCD.$('#rShLinkOutput', body);
    linkBtn.addEventListener('click', function () {
      const user = PCD.store.get('user');
      if (!user || !user.id) {
        PCD.toast.error(PCD.i18n.t('toast_sign_in_to_share'));
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error(PCD.i18n.t('toast_share_unavailable'));
        return;
      }
      linkBtn.disabled = true;
      linkBtn.innerHTML = '<span class="spinner"></span> Generating...';
      PCD.share.createOrGetShareUrl('recipe', opts.recipe.id).then(function (url) {
        linkOut.value = url;
        linkOut.style.display = 'block';
        linkBtn.innerHTML = PCD.icon('copy', 14) + ' <span>' + PCD.i18n.t('btn_copy_link') + '</span>';
        linkBtn.disabled = false;
        // First click: select all in input. Second click: copy.
        linkOut.focus();
        linkOut.select();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            PCD.toast.success('✓ Link copied · ' + url.length + ' chars');
          });
        }
        // Subsequent clicks just copy
        linkBtn.onclick = function () {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function () {
              PCD.toast.success(PCD.i18n.t('toast_copied'));
            });
          } else {
            linkOut.select();
            document.execCommand('copy');
            PCD.toast.success(PCD.i18n.t('toast_copied'));
          }
        };
      }).catch(function (e) {
        PCD.toast.error(PCD.i18n.t('toast_share_failed', { msg: e.message || e }));
        linkBtn.disabled = false;
        linkBtn.innerHTML = PCD.icon('share', 14) + ' <span>' + PCD.i18n.t('btn_generate_share_link') + '</span>';
      });
    });

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
      // v2.8.14 — Defensive build if caller didn't supply recipeMap, so
      // sub-recipe rows always resolve to their names instead of showing
      // "(removed)" on print/email.
      const recipeMap = opts.recipeMap || PCD.recipes.buildRecipeMap();
      const tt = PCD.i18n.t;
      const rows = (r.ingredients || []).map(function (ri) {
        let name;
        if (ri.recipeId) {
          const sub = recipeMap[ri.recipeId];
          name = sub ? sub.name : '(removed sub-recipe)';
        } else {
          const ing = ingMap[ri.ingredientId];
          name = ing ? ing.name : '(removed ingredient)';
        }
        return '<tr><td>' + PCD.escapeHtml(name) + '</td><td style="text-align:right">' + PCD.fmtNumber(ri.amount) + ' ' + PCD.escapeHtml(ri.unit || '') + '</td></tr>';
      }).join('');
      // v2.8.29 — Preview/print HTML respects prep classification:
      // preps with yield show "X kg" subtitle; preps without yield show
      // nothing (instead of "1 servings" which is meaningless for an
      // unmeasured batch prep); menu items show servings as before.
      const _isPrepShare = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
      let subtitleHtml = '';
      if (_isPrepShare) {
        if (r.yieldAmount && r.yieldUnit) {
          subtitleHtml = '<div style="color:#666;font-size:12px;margin-bottom:16px">' + PCD.fmtNumber(r.yieldAmount) + ' ' + PCD.escapeHtml(r.yieldUnit) + '</div>';
        }
      } else if (r.servings) {
        subtitleHtml = '<div style="color:#666;font-size:12px;margin-bottom:16px">' + r.servings + ' ' + tt('recipe_servings').toLowerCase() + '</div>';
      }
      const html =
        '<div style="max-width:680px;margin:0 auto">' +
        (r.photo ? '<img src="' + r.photo + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:16px">' : '') +
        '<h1>' + PCD.escapeHtml(r.name) + '</h1>' +
        subtitleHtml +
        '<h3 style="margin-top:16px">' + tt('recipe_ingredients') + '</h3>' +
        '<table>' + rows + '</table>' +
        (r.steps ? '<h3 style="margin-top:16px">' + tt('recipe_steps') + '</h3><pre>' + PCD.escapeHtml(r.steps) + '</pre>' : '') +
        (r.plating ? '<h3 style="margin-top:16px">' + tt('recipe_plating') + '</h3><pre>' + PCD.escapeHtml(r.plating) + '</pre>' : '') +
        '</div>';
      PCD.print(html, r.name);
      m.close();
    });
    PCD.$('#rShCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () {
          PCD.toast.success(PCD.i18n.t('toast_copied'));
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
    const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pcs', 'each', 'bottle', 'bunch'];
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
          UNITS.map(function (u) { return '<option value="' + u + '"' + (u === 'kg' ? ' selected' : '') + '>' + PCD.unitLabel(u) + '</option>'; }).join('') +
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
              UNITS.map(function (u) { return '<option value="' + u + '"' + (u === 'g' ? ' selected' : '') + '>' + PCD.unitLabel(u) + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: 'Save & Add', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({ title: 'New ingredient', body: body, footer: footer, size: 'sm', closable: true });
    // v2.8.6 — Focus Name field on open (desktop only). Override modal's
    // default auto-focus which lands on the header close (X) button. 300ms
    // wins the race against modal.js's own 250ms auto-focus. Enter-walk
    // through fields (Name → Buy Unit → Price → Qty → Qty Unit → Save & Add)
    // is provided by modal.js keydown handler — no extra wiring needed here.
    setTimeout(function () {
      if (PCD.isTouch && PCD.isTouch()) return;
      const inp = PCD.$('#niName', body);
      if (inp) {
        inp.focus();
        try { inp.select(); } catch (e) {}
      }
    }, 300);

    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      draft.name = (PCD.$('#niName', body).value || '').trim();
      if (!draft.name) { PCD.toast.error(PCD.i18n.t('toast_name_required')); return; }
      draft.unit = PCD.$('#niBuyUnit', body).value || 'g';
      draft.pricePerUnit = parseFloat(PCD.$('#niPrice', body).value) || 0;
      const qty = parseFloat(PCD.$('#niQty', body).value) || 100;
      const qtyUnit = PCD.$('#niQtyUnit', body).value || draft.unit;
      const saved = PCD.store.upsertIngredient(draft);
      m.close();
      setTimeout(function () { onDone(saved, qty, qtyUnit); }, 200);
    });
  }

  // Versions panel — shows all snapshots of a recipe, lets user view/restore/delete each.
  function openVersionsPanel(recipeId, onAfterRestore) {
    const t = PCD.i18n.t;
    const r = PCD.store.getRecipe(recipeId);
    if (!r) return;
    const versions = (r.versions || []).slice().reverse(); // newest first

    const body = PCD.el('div');
    function renderBody() {
      const cur = PCD.store.getRecipe(recipeId);
      const v = (cur.versions || []).slice().reverse();
      let html = '<div class="text-muted text-sm mb-3">Each save captures the previous state. Restore to roll back, or delete old snapshots.</div>';
      if (v.length === 0) {
        html += '<div class="empty"><div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('clock', 40) + '</div>' +
          '<div class="empty-title">No previous versions yet</div>' +
          '<div class="empty-desc">Versions are auto-captured when you save changes to ingredients, steps, or servings. The current state is always live.</div></div>';
      } else {
        html += '<div class="flex flex-col gap-2">';
        v.forEach(function (ver) {
          const ingCount = (ver.snapshot.ingredients || []).length;
          html += '<div class="card" style="padding:12px;display:flex;align-items:center;gap:12px;">' +
            '<div style="width:32px;height:32px;border-radius:8px;background:var(--brand-50);color:var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('clock', 16) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(ver.label || 'Version') + '</div>' +
              '<div class="text-muted" style="font-size:12px;">' + PCD.fmtRelTime(ver.snapshotAt) + ' · ' + ingCount + ' ingredients · ' + (ver.snapshot.servings || 1) + ' servings</div>' +
            '</div>' +
            '<button class="btn btn-outline btn-sm" data-restore="' + ver.snapshotId + '">Restore</button>' +
            '<button class="icon-btn" data-delv="' + ver.snapshotId + '" title="Delete">' + PCD.icon('trash', 16) + '</button>' +
          '</div>';
        });
        html += '</div>';
      }
      body.innerHTML = html;
    }
    renderBody();

    PCD.on(body, 'click', '[data-restore]', function () {
      const sid = this.getAttribute('data-restore');
      PCD.modal.confirm({
        icon: '↩', iconKind: 'info',
        title: t('recipe_restore_title'),
        text: t('recipe_revert_msg'),
        okText: t('recipe_restore_ok')
      }).then(function (ok) {
        if (!ok) return;
        const success = PCD.store.restoreRecipeVersion ? PCD.store.restoreRecipeVersion(recipeId, sid) : false;
        if (success) {
          PCD.toast.success(t('recipe_restored_msg'));
          if (typeof onAfterRestore === 'function') onAfterRestore();
        } else {
          PCD.toast.error(t('recipe_restore_failed'));
        }
      });
    });
    PCD.on(body, 'click', '[data-delv]', function () {
      const sid = this.getAttribute('data-delv');
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('recipe_delete_version_title'),
        text: t('recipe_delete_version_msg'),
        okText: t('act_delete') || 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        if (PCD.store.deleteRecipeVersion) PCD.store.deleteRecipeVersion(recipeId, sid);
        PCD.toast.success(t('recipe_version_deleted'));
        renderBody();
      });
    });

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_versions_named', { name: r.name }), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
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
          title: PCD.i18n.t('modal_upgrade_needed_title'),
          text: t('recipe_limit_reached').replace('{n}', window.PCD_CONFIG.FREE_RECIPE_LIMIT),
          okText: t('upgrade_to_pro')
        });
        return;
      }
    }

    const data = existing ? PCD.clone(existing) : {
      name: '', category: 'cat_main', servings: 1,
      prepTime: null, cookTime: null,
      photo: null, ingredients: [], steps: '', plating: '',
      // v2.8.19 — allergensExcluded enables overriding auto-detected
      // allergens. Without it, clicking an auto-detected chip had no
      // visible effect because removing from `allergens` left the auto
      // detection active. Now: included = data.allergens (user adds),
      // excluded = data.allergensExcluded (user removes from auto).
      salePrice: null, allergens: [], allergensExcluded: [],
      // v2.8.26 — Explicit prep classification (default false = menu item)
      isSubRecipe: false
    };

    const body = PCD.el('div');

    // v2.6.40 — Memory leak fix: outside-click handler for quick-add
    // dropdown is attached ONCE per editor session (not on every
    // renderEditor() call), and removed on modal close. Without this,
    // every keystroke that triggered a re-render was adding a fresh
    // document-level click listener that never got cleaned up.
    let _qDDOutsideHandler = null;

    function renderEditor() {
      // v2.6.49 — The v2.6.33 input-snapshot block (which read DOM values
      // back into `data` before rebuilding HTML) was removed here. With
      // the v2.6.48 partial-update refactor renderEditor() runs only on
      // initial mount, so there are no DOM values to snapshot — and on
      // first call the inputs don't exist yet anyway. The save handler
      // reads input values directly. Cancel discards them. Keystrokes
      // update `data` live.

      const ingMap = currentIngMap();
      const cost = PCD.recipes.computeFoodCost(data, ingMap, PCD.recipes.buildRecipeMap());
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

        <!-- v2.8.26 — Mode toggle: "Mark as Prep / Sub-recipe". Moved
             above Category+Servings so the chef picks the mode first;
             form below adapts (v2.8.27: Category and Servings hide when
             toggled on — they're meaningless for a batch prep). -->
        <div class="field" style="margin-bottom:14px;">
          <label class="checkbox" style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
            <input type="checkbox" id="recipeIsSubRecipe" ${(PCD.recipes && PCD.recipes.isPrep ? PCD.recipes.isPrep(data) : !!(data.yieldAmount && data.yieldUnit)) ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;">
            <span>
              <span style="font-weight:600;">${t('recipe_is_subrecipe_label')}</span>
              <div class="text-muted" style="font-size:12px;line-height:1.4;margin-top:2px;">${t('recipe_is_subrecipe_hint')}</div>
            </span>
          </label>
        </div>

        <div class="field-row" id="catServingsRow"${(PCD.recipes && PCD.recipes.isPrep && PCD.recipes.isPrep(data)) ? ' style="display:none;"' : ''}>
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

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('recipe_yield_amount_label')}</label>
            <input type="number" class="input" id="recipeYieldAmount" value="${data.yieldAmount || ''}" step="0.01" min="0" placeholder="e.g. 800">
            <div class="field-hint">${t('recipe_yield_amount_hint')}</div>
          </div>
          <div class="field">
            <label class="field-label">${t('recipe_yield_unit_label')}</label>
            <select class="select" id="recipeYieldUnit">
              ${['portion','g','kg','ml','l','batch','tray','pcs'].map(function (u) { return '<option value="' + u + '"' + ((data.yieldUnit || 'portion') === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
            </select>
          </div>
        </div>

        <div class="section" style="margin-bottom:16px;">
          <div class="section-header">
            <div class="section-title">${t('recipe_ingredients')}</div>
            <button type="button" class="btn btn-outline btn-sm" id="addIngBtn">+ ${t('add')}</button>
          </div>

          <!-- Quick-add autocomplete -->
          <div style="position:relative;margin-bottom:10px;">
            <input type="text" class="input" id="quickIngInput" placeholder="${PCD.escapeHtml(t('recipe_quick_add_placeholder'))}" autocomplete="off" data-skip-enter="true" style="padding-inline-start:36px;">
            <div style="position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none;">${PCD.icon('search', 16)}</div>
            <div id="quickIngDD" style="display:none;position:absolute;top:100%;inset-inline-start:0;inset-inline-end:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);box-shadow:var(--shadow-lg);max-height:240px;overflow-y:auto;z-index:5;margin-top:4px;"></div>
          </div>

          <div id="ingList"></div>
          <div class="text-sm text-muted mt-2" style="font-size:12px;">${t('recipe_ingredients_hint')}</div>
        </div>

        <div id="costStrip" class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);padding:12px;">
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
          <label class="field-label">${t('recipe_allergens_label')}</label>
          <div class="text-muted text-sm mb-2" style="font-size:12px;">${t('recipe_allergens_hint')}</div>
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

      // v2.8.27 — Live toggle: hide Category + Servings row when
      // "Mark as Prep" is checked. Field values are preserved (untoggling
      // restores them), only DOM visibility changes. Hidden inputs still
      // submit so save logic stays simple.
      const subCb = PCD.$('#recipeIsSubRecipe', body);
      const catRow = PCD.$('#catServingsRow', body);
      if (subCb && catRow) {
        subCb.addEventListener('change', function () {
          catRow.style.display = this.checked ? 'none' : '';
        });
      }
    }

    function renderAllergenChips() {
      const wrap = PCD.$('#allergenChips', body);
      if (!wrap) return;
      const ingMap = currentIngMap();
      const auto = (PCD.allergensDB && PCD.allergensDB.recipeAllergens)
        ? PCD.allergensDB.recipeAllergens(data, ingMap)
        : [];
      const included = data.allergens || [];
      // v2.8.19 — allergensExcluded: user-overridden auto-detections.
      // Defensive default for recipes saved before this field existed.
      if (!data.allergensExcluded) data.allergensExcluded = [];
      const excluded = data.allergensExcluded;
      const all = (PCD.allergensDB && PCD.allergensDB.list) || [];
      wrap.innerHTML = '';
      all.forEach(function (a) {
        const inAuto = auto.indexOf(a.key) >= 0;
        const inIncluded = included.indexOf(a.key) >= 0;
        const inExcluded = excluded.indexOf(a.key) >= 0;
        // Effective active: explicitly included always wins; otherwise
        // auto-detected unless excluded.
        const active = inIncluded || (inAuto && !inExcluded);
        // Show (auto) tag only when active via auto (not explicit include)
        const showAutoTag = inAuto && !inIncluded && !inExcluded;
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
            opacity: active ? '1' : '0.55'
          },
        });
        chip.innerHTML = (a.icon || '') + ' ' + (a.label_en || a.key) + (showAutoTag ? ' <span style="font-size:9px;opacity:0.6;">(auto)</span>' : '');
        wrap.appendChild(chip);
      });
      // Click to toggle: if active → deactivate; if inactive → activate.
      // For auto-detected chips, deactivation records the override in
      // allergensExcluded so future renders respect the user's choice.
      PCD.on(wrap, 'click', '[data-allerg]', function () {
        const key = this.getAttribute('data-allerg');
        if (!data.allergens) data.allergens = [];
        if (!data.allergensExcluded) data.allergensExcluded = [];
        const inAuto = auto.indexOf(key) >= 0;
        const idxIncluded = data.allergens.indexOf(key);
        const idxExcluded = data.allergensExcluded.indexOf(key);
        const wasActive = (idxIncluded >= 0) || (inAuto && idxExcluded < 0);
        if (wasActive) {
          // Deactivate
          if (idxIncluded >= 0) data.allergens.splice(idxIncluded, 1);
          if (inAuto && idxExcluded < 0) data.allergensExcluded.push(key);
        } else {
          // Activate
          if (idxExcluded >= 0) data.allergensExcluded.splice(idxExcluded, 1);
          if (!inAuto && idxIncluded < 0) data.allergens.push(key);
        }
        renderAllergenChips();
      });
    }

    function renderIngList() {
      const ingMap = currentIngMap();
      const recipeMap = PCD.recipes.buildRecipeMap();
      const ingListEl = PCD.$('#ingList', body);
      if (!ingListEl) return;
      PCD.clear(ingListEl);

      if (!data.ingredients || data.ingredients.length === 0) {
        ingListEl.innerHTML = '<div class="text-muted text-sm" style="padding:12px 0;text-align:center;">—</div>';
        return;
      }
      data.ingredients.forEach(function (ri, idx) {
        const isSubRecipe = !!ri.recipeId;
        let name, lineCost, defaultUnit;

        if (isSubRecipe) {
          // SUB-RECIPE LINE
          const sub = recipeMap[ri.recipeId];
          name = sub ? sub.name : '(removed sub-recipe)';
          const subYield = sub ? (sub.yieldAmount || sub.servings || 1) : 1;
          defaultUnit = sub ? (sub.yieldUnit || 'portion') : 'portion';
          if (sub) {
            const subTotalCost = PCD.recipes.computeFoodCost(sub, ingMap, recipeMap);
            const amt = Number(ri.amount) || 0;
            let scale = amt / (subYield || 1);
            if (ri.unit && defaultUnit && ri.unit !== defaultUnit) {
              try { scale = PCD.convertUnit(amt, ri.unit, defaultUnit) / (subYield || 1); }
              catch (e) {}
            }
            lineCost = subTotalCost * scale;
          } else {
            lineCost = 0;
          }
        } else {
          // INGREDIENT LINE
          const ing = ingMap[ri.ingredientId];
          name = ing ? ing.name : '(removed ingredient)';
          defaultUnit = ing && ing.unit;
          lineCost = ing ? (function () {
            const amt = Number(ri.amount) || 0;
            let price = Number(ing.pricePerUnit) || 0;
            const yld = Number(ing.yieldPercent);
            if (yld && yld > 0 && yld < 100) price = price / (yld / 100);
            if (ri.unit && ing.unit && ri.unit !== ing.unit) {
              try { return PCD.convertUnit(amt, ri.unit, ing.unit) * price; } catch(e) {}
            }
            return amt * price;
          })() : 0;
        }

        const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '10px' } });
        const subBadge = isSubRecipe ? '<span style="display:inline-block;background:var(--brand-50);color:var(--brand-700);font-size:9px;font-weight:700;padding:2px 6px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;margin-inline-start:6px;">SUB</span>' : '';
        const unitOptions = isSubRecipe
          ? ['portion','g','kg','ml','l','batch','tray','pcs']
          : ['g','kg','ml','l','tsp','tbsp','cup','oz','lb','pcs','each','bottle','bunch','unit'];
        // v2.8.8 — Reorder buttons. Up disabled on first row, down on last.
        // Disabled styling: 0.3 opacity + not-allowed cursor (icon-btn CSS
        // doesn't define :disabled). The `disabled` attribute alone prevents
        // click event firing, so handler defensive checks are belt-and-braces.
        const _total = data.ingredients.length;
        const _upDis = (idx === 0) ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : '';
        const _dnDis = (idx === _total - 1) ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : '';
        row.innerHTML = `
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(name)}${subBadge}</div>
            <div class="list-item-meta">
              <input type="number" class="input" data-amount data-idx="${idx}" value="${ri.amount || 0}" step="0.01" min="0" style="width:90px;padding:6px 8px;min-height:32px;font-size:14px;">
              <select class="select" data-unit data-idx="${idx}" style="width:auto;padding:6px 8px;min-height:32px;font-size:14px;padding-right:28px;">
                ${unitOptions.map(function (u) { return '<option value="' + u + '"' + ((ri.unit || defaultUnit) === u ? ' selected' : '') + '>' + PCD.unitLabel(u) + '</option>'; }).join('')}
              </select>
              <span class="text-muted">·</span>
              <span data-line-cost data-idx="${idx}" style="font-weight:600;">${PCD.fmtMoney(lineCost)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn" data-moveup="${idx}" ${_upDis} aria-label="Move up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="icon-btn" data-movedown="${idx}" ${_dnDis} aria-label="Move down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="icon-btn" data-remove="${idx}" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>
        `;
        ingListEl.appendChild(row);
      });
    }

    // v2.6.48 — Partial-update helpers replace the old "rebuild the
    // entire modal HTML on every keystroke" pattern. The full
    // renderEditor() is now only called on (1) initial mount, (2) when
    // ingredient list structure changes (add/remove), and (3) explicit
    // version restore. Numeric edits (amount/unit/servings/salePrice)
    // and photo changes use targeted DOM updates that keep focus,
    // selection, scroll position, and dropdown state intact.

    function _computeCostNumbers() {
      const ingMap = currentIngMap();
      const recipeMap = PCD.recipes.buildRecipeMap();
      const cost = PCD.recipes.computeFoodCost(data, ingMap, recipeMap);
      const costPerServing = data.servings ? cost / data.servings : cost;
      const pct = (data.salePrice && cost > 0 && data.servings)
        ? (costPerServing / data.salePrice) * 100
        : null;
      return { cost: cost, costPerServing: costPerServing, pct: pct, ingMap: ingMap, recipeMap: recipeMap };
    }

    function updateCostStripDOM() {
      const strip = body.querySelector('#costStrip');
      if (!strip) return;
      const t = PCD.i18n.t;
      const c = _computeCostNumbers();
      const pctHtml = (c.pct !== null)
        ? '<div style="text-align:right;"><div class="stat-label">' + t('food_cost_percent') +
          '</div><div style="font-size:20px;font-weight:800;color:' +
          (c.pct <= 35 ? 'var(--success)' : (c.pct <= 45 ? 'var(--warning)' : 'var(--danger)')) +
          ';">' + PCD.fmtPercent(c.pct, 1) + '</div></div>'
        : '';
      strip.innerHTML =
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<div class="stat-label">' + t('food_cost') + '</div>' +
            '<div style="font-size:20px;font-weight:800;letter-spacing:-0.01em;">' + PCD.fmtMoney(c.cost) + '</div>' +
          '</div>' +
          pctHtml +
        '</div>';
    }

    // Update each ingredient row's "line cost" span without touching
    // the surrounding inputs, selects, or list structure. Called when
    // amount or unit changes — preserves focus on the input being edited.
    function updateLineCostsDOM() {
      const c = _computeCostNumbers();
      const ingMap = c.ingMap;
      const recipeMap = c.recipeMap;
      const spans = body.querySelectorAll('[data-line-cost]');
      for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        const idx = parseInt(span.getAttribute('data-idx'), 10);
        const ri = data.ingredients && data.ingredients[idx];
        if (!ri) { span.textContent = ''; continue; }
        let lineCost = 0;
        if (ri.recipeId) {
          const sub = recipeMap[ri.recipeId];
          if (sub) {
            const subYield = sub.yieldAmount || sub.servings || 1;
            const defaultUnit = sub.yieldUnit || 'portion';
            const subTotalCost = PCD.recipes.computeFoodCost(sub, ingMap, recipeMap);
            const amt = Number(ri.amount) || 0;
            let scale = amt / (subYield || 1);
            if (ri.unit && defaultUnit && ri.unit !== defaultUnit) {
              try { scale = PCD.convertUnit(amt, ri.unit, defaultUnit) / (subYield || 1); } catch (e) {}
            }
            lineCost = subTotalCost * scale;
          }
        } else {
          const ing = ingMap[ri.ingredientId];
          if (ing) {
            const amt = Number(ri.amount) || 0;
            let price = Number(ing.pricePerUnit) || 0;
            const yld = Number(ing.yieldPercent);
            if (yld && yld > 0 && yld < 100) price = price / (yld / 100);
            if (ri.unit && ing.unit && ri.unit !== ing.unit) {
              try { lineCost = PCD.convertUnit(amt, ri.unit, ing.unit) * price; } catch (e) { lineCost = amt * price; }
            } else {
              lineCost = amt * price;
            }
          }
        }
        span.textContent = PCD.fmtMoney(lineCost);
      }
    }

    // Re-render only the photo zone (`#photoZone` + `#photoActions`).
    // Used after photo upload / remove so the rest of the form (with
    // its inputs and current focus) stays untouched.
    function renderPhotoZoneDOM() {
      const t = PCD.i18n.t;
      const zone = body.querySelector('#photoZone');
      const actions = body.querySelector('#photoActions');
      if (!zone || !actions) return;
      // Update background and dashed border
      zone.style.background = data.photo ? 'url(' + data.photo + ') center/cover' : 'var(--surface-2)';
      zone.style.border = '2px dashed ' + (data.photo ? 'transparent' : 'var(--border-strong)');
      zone.innerHTML =
        (!data.photo
          ? '<div class="text-center text-muted"><div style="font-size:32px;margin-bottom:4px;">📷</div><div class="text-sm">' + t('recipe_photo_hint') + '</div></div>'
          : '') +
        (data.photo
          ? '<button type="button" id="removePhoto" class="icon-btn" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:white;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg></button>'
          : '');
      actions.style.display = data.photo ? 'none' : 'flex';
      // Re-bind the freshly-created remove button
      const removeBtn = body.querySelector('#removePhoto');
      if (removeBtn) {
        removeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          data.photo = null;
          renderPhotoZoneDOM();
        });
      }
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
        renderPhotoZoneDOM();
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
            if (!cropped) return;
            // v2.5.9: Upload the cropped photo to Supabase Storage so we
            // store a small URL instead of a multi-MB base64 string in
            // the recipe row. If upload fails (offline, no auth, etc.)
            // the helper falls back to the dataURL — same as before.
            const t = PCD.i18n.t;
            PCD.toast.info(t('photo_uploading'));
            PCD.photoStorage.upload(cropped).then(function (urlOrDataUrl) {
              data.photo = urlOrDataUrl;
              renderPhotoZoneDOM();
            });
          });
        };
        reader.readAsDataURL(f);
        // Reset input so selecting same file again fires change
        e.target.value = '';
      }
      if (photoCamera) photoCamera.addEventListener('change', handlePhotoFile);
      if (photoGallery) photoGallery.addEventListener('change', handlePhotoFile);

      // Helper: pick the recipe-line unit when adding an ingredient.
      // Most kitchen recipes use grams or millilitres at the dish level;
      // ingredients bought by kg or L would otherwise default to "100 kg"
      // which is a 1000x cost-calculation mistake.
      function defaultRecipeUnit(ing) {
        let u = (ing && ing.unit) || 'g';
        if (u === 'kg') return 'g';
        if (u === 'l' || u === 'L') return 'ml';
        return u;
      }

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
                data.ingredients = data.ingredients.concat([{ ingredientId: newIng.id, amount: 100, unit: defaultRecipeUnit(newIng) }]);
                // v2.6.48 — list structure changed (new row), targeted re-render
                renderIngList();
                updateCostStripDOM();
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
              next.push({ ingredientId: id, amount: 100, unit: defaultRecipeUnit(i) });
            }
          });
          data.ingredients = next;
          // v2.6.48 — list structure changed, targeted re-render (not full)
          renderIngList();
          renderAllergenChips();  // auto-detected allergens may shift
          updateCostStripDOM();
        });
      });

      // v2.6.48 — Live updates on amount / unit / servings / salePrice.
      // These handlers used to call renderEditor() (full modal rebuild),
      // which broke focus, scroll position, and dropdown state on every
      // keystroke. Now they use targeted DOM updates that touch only
      // the cost numbers, leaving inputs and selects intact.
      PCD.on(body, 'input', '[data-amount]', function () {
        const idx = parseInt(this.getAttribute('data-idx'), 10);
        if (!data.ingredients[idx]) return;
        data.ingredients[idx].amount = parseFloat(this.value) || 0;
        // Light debounce so big numbers typed quickly don't thrash
        clearTimeout(wireEditor._t);
        wireEditor._t = setTimeout(function () {
          updateLineCostsDOM();
          updateCostStripDOM();
        }, 150);
      });
      PCD.on(body, 'change', '[data-unit]', function () {
        const idx = parseInt(this.getAttribute('data-idx'), 10);
        if (!data.ingredients[idx]) return;
        data.ingredients[idx].unit = this.value;
        updateLineCostsDOM();
        updateCostStripDOM();
      });
      PCD.on(body, 'click', '[data-remove]', function () {
        const idx = parseInt(this.getAttribute('data-remove'), 10);
        data.ingredients.splice(idx, 1);
        // List structure changed, but inputs outside the list keep state
        renderIngList();
        renderAllergenChips();  // auto-detected allergens may shift
        updateCostStripDOM();
      });

      // v2.8.8 — Reorder ingredients up/down. Defensive bounds check belt-
      // and-braces with the disabled attribute on edge rows. Allergen chips
      // don't need re-render (set of ingredients unchanged), but cost strip
      // does (some downstream layouts care about order).
      PCD.on(body, 'click', '[data-moveup]', function () {
        const idx = parseInt(this.getAttribute('data-moveup'), 10);
        if (isNaN(idx) || idx <= 0 || idx >= data.ingredients.length) return;
        const tmp = data.ingredients[idx];
        data.ingredients[idx] = data.ingredients[idx - 1];
        data.ingredients[idx - 1] = tmp;
        renderIngList();
        updateCostStripDOM();
      });
      PCD.on(body, 'click', '[data-movedown]', function () {
        const idx = parseInt(this.getAttribute('data-movedown'), 10);
        if (isNaN(idx) || idx < 0 || idx >= data.ingredients.length - 1) return;
        const tmp = data.ingredients[idx];
        data.ingredients[idx] = data.ingredients[idx + 1];
        data.ingredients[idx + 1] = tmp;
        renderIngList();
        updateCostStripDOM();
      });

      const servingsEl = PCD.$('#recipeServings', body);
      servingsEl.addEventListener('input', function () {
        data.servings = parseInt(this.value, 10) || 1;
        clearTimeout(wireEditor._t2);
        wireEditor._t2 = setTimeout(function () {
          // Servings affects cost-per-serving and cost % — line costs
          // are total amount × price (not per-serving), so they don't
          // change. Update only the cost strip.
          updateCostStripDOM();
        }, 150);
      });
      const priceEl = PCD.$('#recipeSalePrice', body);
      priceEl.addEventListener('input', function () {
        data.salePrice = parseFloat(this.value) || null;
        clearTimeout(wireEditor._t3);
        wireEditor._t3 = setTimeout(function () {
          // Sale price only affects the % display in the strip
          updateCostStripDOM();
        }, 150);
      });

      // ===== QUICK-ADD AUTOCOMPLETE =====
      const qInput = PCD.$('#quickIngInput', body);
      const qDD = PCD.$('#quickIngDD', body);
      if (qInput && qDD) {
        function renderDD(query) {
          const q = (query || '').toLowerCase().trim();
          if (!q) { qDD.style.display = 'none'; qDD.innerHTML = ''; return; }
          const allIngs = PCD.store.listIngredients();
          const alreadyInRecipe = new Set((data.ingredients || []).map(function (ri) { return ri.ingredientId || ri.recipeId; }));
          const matches = allIngs.filter(function (i) {
            return (i.name || '').toLowerCase().indexOf(q) >= 0 && !alreadyInRecipe.has(i.id);
          }).slice(0, 6);

          // Sub-recipe matches — exclude self + already-added + cycles
          const allRecipes = PCD.store.listRecipes();
          const recipeMatches = allRecipes.filter(function (r) {
            if (data.id && r.id === data.id) return false; // can't include self
            if (alreadyInRecipe.has(r.id)) return false;
            return (r.name || '').toLowerCase().indexOf(q) >= 0;
          }).slice(0, 6);

          let html = '';
          if (matches.length > 0) {
            html += '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;background:var(--surface-2);">Ingredients</div>';
            matches.forEach(function (i) {
              html += '<div data-pick-ing="' + i.id + '" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:600;">' + PCD.escapeHtml(i.name) + '</div>' +
                '<div class="text-muted" style="font-size:11px;">' + PCD.fmtMoney(i.pricePerUnit || 0) + '/' + (i.unit || '') + '</div></div>' +
                '</div>';
            });
          }
          if (recipeMatches.length > 0) {
            html += '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;background:var(--surface-2);">Sub-recipes</div>';
            recipeMatches.forEach(function (r) {
              html += '<div data-pick-recipe="' + r.id + '" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:600;">' + PCD.escapeHtml(r.name) +
                ' <span style="font-size:9px;background:var(--brand-100);color:var(--brand-700);padding:2px 6px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-inline-start:4px;">SUB</span></div>' +
                '<div class="text-muted" style="font-size:11px;">' + (r.servings || 1) + ' ' + (r.yieldUnit || 'portions') + '</div></div>' +
                '</div>';
            });
          }
          // Always show "create new" at the bottom
          html += '<div data-pick-ing="__new__" data-name="' + PCD.escapeHtml(query.trim()) + '" style="padding:10px 12px;cursor:pointer;background:var(--brand-50);color:var(--brand-700);font-weight:600;font-size:13px;">' +
            PCD.icon('plus', 14) + ' Create new ingredient "' + PCD.escapeHtml(query.trim()) + '"</div>';
          qDD.innerHTML = html;
          qDD.style.display = 'block';
        }

        qInput.addEventListener('input', function () { renderDD(this.value); });
        qInput.addEventListener('focus', function () { if (this.value) renderDD(this.value); });
        // Outside-click handler — attach ONCE per editor session.
        // The listener uses getElementById to find the current qDD
        // (which is recreated on every renderEditor) so a single
        // listener works across all re-renders. Cleanup happens in the
        // modal's onClose callback below. Without this guard, every
        // renderEditor() call was leaking a fresh document listener.
        if (!_qDDOutsideHandler) {
          _qDDOutsideHandler = function (e) {
            const dd = document.getElementById('quickIngDD');
            if (!dd) return;
            if (!e.target.closest || (!e.target.closest('#quickIngInput') && !e.target.closest('#quickIngDD'))) {
              dd.style.display = 'none';
            }
          };
          document.addEventListener('click', _qDDOutsideHandler);
        }

        // Pick a sub-recipe
        PCD.on(qDD, 'click', '[data-pick-recipe]', function () {
          const rid = this.getAttribute('data-pick-recipe');
          const sub = PCD.store.getRecipe(rid);
          if (!sub) return;
          const defaultUnit = sub.yieldUnit || 'portion';
          const defaultAmt = 1;
          data.ingredients = (data.ingredients || []).concat([{
            recipeId: rid, amount: defaultAmt, unit: defaultUnit
          }]);
          qInput.value = '';
          qDD.style.display = 'none';
          // v2.6.48 — list grew, targeted re-render only
          renderIngList();
          renderAllergenChips();
          updateCostStripDOM();
          setTimeout(function () {
            const fresh = PCD.$('#quickIngInput', body);
            if (fresh) fresh.focus();
          }, 50);
        });

        // Pick an ingredient
        PCD.on(qDD, 'click', '[data-pick-ing]', function () {
          const id = this.getAttribute('data-pick-ing');
          if (id === '__new__') {
            const newName = this.getAttribute('data-name') || qInput.value.trim();
            if (!newName) return;
            qDD.style.display = 'none';
            promptNewIngredientDetails(newName, function (saved, qty, qtyUnit) {
              data.ingredients = (data.ingredients || []).concat([{
                ingredientId: saved.id, amount: qty || 100, unit: qtyUnit || defaultRecipeUnit(saved)
              }]);
              PCD.toast.success(PCD.i18n.t('toast_quick_added_synced', { name: newName }));
              qInput.value = '';
              // v2.6.48 — targeted re-render
              renderIngList();
              renderAllergenChips();
              updateCostStripDOM();
              setTimeout(function () {
                const fresh = PCD.$('#quickIngInput', body);
                if (fresh) fresh.focus();
              }, 50);
            });
            return;
          }
          const ing = PCD.store.getIngredient(id);
          if (!ing) return;
          // Bug fix (v2.6.31): use cooking-scale unit (g/ml) when the
          // ingredient is bought in bulk units (kg/L), so a chef typing
          // "100" doesn't end up with 100 KG of garlic.
          data.ingredients = (data.ingredients || []).concat([{ ingredientId: id, amount: 100, unit: defaultRecipeUnit(ing) }]);
          qInput.value = '';
          qDD.style.display = 'none';
          // v2.6.48 — targeted re-render
          renderIngList();
          renderAllergenChips();
          updateCostStripDOM();
          setTimeout(function () {
            const fresh = PCD.$('#quickIngInput', body);
            if (fresh) fresh.focus();
          }, 50);
        });

        // Enter key: pick first match
        qInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = qDD.querySelector('[data-pick-ing], [data-pick-recipe]');
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
    let versionsBtn = null;
    if (existing && PCD.store.snapshotRecipeVersion) {
      versionsBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Versions' });
      const vCount = (existing.versions || []).length;
      versionsBtn.innerHTML = PCD.icon('clock', 16) + ' <span>Versions' + (vCount > 0 ? ' (' + vCount + ')' : '') + '</span>';
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(cancelBtn);
    if (versionsBtn) footer.appendChild(versionsBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('edit') + ' · ' + existing.name : t('new_recipe'),
      body: body,
      footer: footer,
      size: 'lg',
      closable: true,
      onClose: function () {
        // v2.6.40 — Remove the document-level outside-click listener
        // we attached for the quick-add ingredient dropdown. Without
        // this, every editor session leaked a global click listener
        // that fired on EVERY click for the rest of the page lifetime.
        if (_qDDOutsideHandler) {
          document.removeEventListener('click', _qDDOutsideHandler);
          _qDDOutsideHandler = null;
        }
      },
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (versionsBtn) versionsBtn.addEventListener('click', function () {
      openVersionsPanel(existing.id, function () {
        // After restore, reload editor
        m.close();
        setTimeout(function () { openEditor(existing.id); }, 200);
      });
    });
    saveBtn.addEventListener('click', function () {
      // Collect latest values from form
      data.name = PCD.$('#recipeName', body).value.trim();
      data.category = PCD.$('#recipeCategory', body).value;
      data.servings = parseInt(PCD.$('#recipeServings', body).value, 10) || 1;
      data.prepTime = parseInt(PCD.$('#recipePrep', body).value, 10) || null;
      data.cookTime = parseInt(PCD.$('#recipeCook', body).value, 10) || null;
      const yldAmtInp = PCD.$('#recipeYieldAmount', body);
      const yldUnitInp = PCD.$('#recipeYieldUnit', body);
      data.yieldAmount = (yldAmtInp && yldAmtInp.value) ? parseFloat(yldAmtInp.value) : null;
      data.yieldUnit = (yldUnitInp && yldUnitInp.value) ? yldUnitInp.value : 'portion';
      // v2.8.26 — Explicit prep classification flag, independent of yield
      const isSubInp = PCD.$('#recipeIsSubRecipe', body);
      data.isSubRecipe = isSubInp ? !!isSubInp.checked : false;
      data.salePrice = parseFloat(PCD.$('#recipeSalePrice', body).value) || null;
      data.steps = PCD.$('#recipeSteps', body).value;
      data.plating = PCD.$('#recipePlating', body).value;

      if (!data.name) {
        PCD.toast.error(t('recipe_name') + ' ' + t('required'));
        return;
      }

      if (existing) {
        data.id = existing.id;
        // Auto-snapshot if content meaningfully changed (ingredients or steps).
        // Saves the OLD state into versions before applying the new save.
        const ingChanged = JSON.stringify(existing.ingredients || []) !== JSON.stringify(data.ingredients || []);
        const stepsChanged = (existing.steps || '') !== (data.steps || '');
        const servingsChanged = (existing.servings || 0) !== (data.servings || 0);
        if (ingChanged || stepsChanged || servingsChanged) {
          // snapshot the OLD recipe state (before save)
          if (PCD.store.snapshotRecipeVersion) {
            PCD.store.snapshotRecipeVersion(existing.id, 'Auto · ' + new Date().toLocaleDateString());
          }
        }
      }
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
