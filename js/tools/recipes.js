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
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
          <div class="flex items-center gap-3">
            <label class="checkbox" style="min-height:auto;"><input type="checkbox" id="selAll"><span class="text-sm font-semibold"><span id="selCount">0</span> ${t('selected')}</span></label>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="bulkCostReport">${PCD.icon('activity',14)} <span>Cost Report</span></button>
            <button type="button" class="btn btn-danger btn-sm" id="bulkDelete">${PCD.icon('trash',14)} ${t('delete')}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="exitSelect">${t('cancel')}</button>
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

        // Copy-to-workspace icon button (only when not in select mode)
        if (!selectMode) {
          const copyBtn = PCD.el('button', {
            type: 'button',
            class: 'icon-btn',
            'data-copy-rid': r.id,
            'data-name': r.name,
            title: 'Copy to workspace',
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
    PCD.$('#bulkCostReport', view).addEventListener('click', function () {
      if (selectedIds.size === 0) {
        PCD.toast.info('Select at least one recipe');
        return;
      }
      openCostReport(Array.from(selectedIds));
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
            PCD.toast.success('Duplicated');
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
  // ============ COST REPORT ============
  // Multi-recipe cost report. Shows detailed breakdown, lets user override
  // sale price live, exports to PDF or Excel.
  function openCostReport(recipeIds) {
    const t = PCD.i18n.t;
    const TARGET_FOOD_COST_PCT = 30;  // industry standard
    const ingMap = currentIngMap();

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
      PCD.toast.error('No recipes to report');
      return;
    }

    const body = PCD.el('div');
    function paint() {
      let summaryTotalCost = 0;
      let summaryTotalRevenue = 0;
      let html = '<div class="text-muted text-sm mb-3">' +
        items.length + ' recipe' + (items.length === 1 ? '' : 's') +
        ' · Target food cost: <strong>' + TARGET_FOOD_COST_PCT + '%</strong>' +
        ' · Tip: edit "Test price" to see live food cost % updates.' +
      '</div>';

      items.forEach(function (it, idx) {
        const r = it.recipe;
        summaryTotalCost += it.totalCost;
        summaryTotalRevenue += (it.testPrice || 0) * it.servings;
        const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) * 100 : 0;
        const status = fcPct === 0 ? 'gray' : fcPct < 25 ? 'green' : fcPct < 35 ? 'amber' : 'red';
        const statusColor = status === 'green' ? 'var(--success)' : status === 'amber' ? '#d97706' : status === 'red' ? 'var(--danger)' : 'var(--text-3)';

        // Ingredient table
        let ingRowsHtml = '';
        (r.ingredients || []).forEach(function (ri) {
          const ing = ingMap[ri.ingredientId];
          if (!ing) return;
          const unitPrice = Number(ing.pricePerUnit) || 0;
          const amt = Number(ri.amount) || 0;
          let lineCost = amt * unitPrice;
          if (ri.unit && ing.unit && ri.unit !== ing.unit) {
            try { lineCost = PCD.convertUnit(amt, ri.unit, ing.unit) * unitPrice; } catch (e) {}
          }
          ingRowsHtml +=
            '<tr>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(ing.name) + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-size:12px;color:var(--text-3);">' + PCD.fmtMoney(unitPrice) + '/' + PCD.escapeHtml(ing.unit) + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-size:13px;">' + PCD.fmtNumber(amt) + ' ' + PCD.escapeHtml(ri.unit || ing.unit) + '</td>' +
              '<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:end;font-family:var(--font-mono);font-weight:700;color:var(--brand-700);">' + PCD.fmtMoney(lineCost) + '</td>' +
            '</tr>';
        });

        html +=
          '<div class="card mb-3" data-idx="' + idx + '" style="padding:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
              '<div>' +
                '<div style="font-weight:800;font-size:16px;">' + PCD.escapeHtml(r.name) + '</div>' +
                '<div class="text-muted" style="font-size:12px;">' + (r.category || 'recipe') + ' · ' + it.servings + ' servings</div>' +
              '</div>' +
              '<div style="text-align:end;">' +
                '<div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Food cost %</div>' +
                '<div style="font-size:22px;font-weight:800;color:' + statusColor + ';">' + fcPct.toFixed(1) + '%</div>' +
              '</div>' +
            '</div>' +

            // Ingredient breakdown
            '<div style="overflow-x:auto;margin-bottom:10px;">' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<thead><tr>' +
                  '<th style="text-align:start;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Ingredient</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Unit price</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>' +
                  '<th style="text-align:end;padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Cost</th>' +
                '</tr></thead><tbody>' + ingRowsHtml +
                '<tr><td colspan="3" style="padding:6px 8px;border-top:2px solid var(--border);font-weight:700;text-align:end;">Total food cost</td>' +
                '<td style="padding:6px 8px;border-top:2px solid var(--border);text-align:end;font-weight:800;color:var(--brand-700);font-family:var(--font-mono);">' + PCD.fmtMoney(it.totalCost) + '</td></tr>' +
                '<tr><td colspan="3" style="padding:4px 8px;text-align:end;color:var(--text-3);font-size:12px;">Cost per serving</td>' +
                '<td style="padding:4px 8px;text-align:end;font-weight:700;font-family:var(--font-mono);">' + PCD.fmtMoney(it.costPerServing) + '</td></tr>' +
                '</tbody>' +
              '</table>' +
            '</div>' +

            // Pricing area — current + test (live)
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:10px;background:var(--surface-2);border-radius:var(--r-md);">' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Current price</div>' +
                '<div style="font-weight:700;font-size:15px;">' + (it.currentPrice != null ? PCD.fmtMoney(it.currentPrice) : '<span style="color:var(--text-3);">—</span>') + '</div>' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Suggested @ ' + TARGET_FOOD_COST_PCT + '%</div>' +
                '<div style="font-weight:700;font-size:15px;color:var(--brand-700);">' + PCD.fmtMoney(it.suggestedPrice) + '</div>' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Test price (live)</div>' +
                '<input type="number" data-test-price="' + idx + '" value="' + (it.testPrice || 0).toFixed(2) + '" step="0.01" min="0" style="width:100%;padding:4px 8px;border:1.5px solid var(--brand-300);border-radius:6px;font-weight:700;font-size:15px;font-family:var(--font-mono);">' +
              '</div>' +
              '<div>' +
                '<div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Margin / serving</div>' +
                '<div style="font-weight:700;font-size:15px;color:' + statusColor + ';">' + PCD.fmtMoney(Math.max(0, (it.testPrice || 0) - it.costPerServing)) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      });

      // Summary
      const summaryFcPct = summaryTotalRevenue > 0 ? (summaryTotalCost / summaryTotalRevenue) * 100 : 0;
      html +=
        '<div class="card" style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
          '<div style="font-weight:800;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Summary across ' + items.length + ' recipes</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;">' +
            '<div><div class="text-muted text-sm">Total food cost</div><div style="font-weight:800;font-size:18px;">' + PCD.fmtMoney(summaryTotalCost) + '</div></div>' +
            '<div><div class="text-muted text-sm">Total revenue (test prices)</div><div style="font-weight:800;font-size:18px;">' + PCD.fmtMoney(summaryTotalRevenue) + '</div></div>' +
            '<div><div class="text-muted text-sm">Average food cost %</div><div style="font-weight:800;font-size:18px;color:' + (summaryFcPct < 30 ? 'var(--success)' : summaryFcPct < 40 ? '#d97706' : 'var(--danger)') + ';">' + summaryFcPct.toFixed(1) + '%</div></div>' +
            '<div><div class="text-muted text-sm">Total profit</div><div style="font-weight:800;font-size:18px;color:var(--success);">' + PCD.fmtMoney(Math.max(0, summaryTotalRevenue - summaryTotalCost)) + '</div></div>' +
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

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: 'Close' });
    const pdfBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary' });
    pdfBtn.innerHTML = PCD.icon('print', 16) + ' <span>PDF</span>';
    const xlsxBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline' });
    xlsxBtn.innerHTML = PCD.icon('book-open', 16) + ' <span>Excel</span>';

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(xlsxBtn);
    footer.appendChild(pdfBtn);

    const m = PCD.modal.open({
      title: 'Cost Report' + (items.length > 1 ? ' · ' + items.length + ' recipes' : ''),
      body: body, footer: footer, size: 'lg', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    pdfBtn.addEventListener('click', function () { exportCostReportPDF(items, TARGET_FOOD_COST_PCT); });
    xlsxBtn.addEventListener('click', function () { exportCostReportXLSX(items, TARGET_FOOD_COST_PCT); });
  }

  // PDF: minimal, professional, image-free
  function exportCostReportPDF(items, targetPct) {
    const ingMap = currentIngMap();
    const dateStr = new Date().toLocaleDateString();
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = ws ? ws.name : '';

    let summaryTotalCost = 0, summaryTotalRevenue = 0;
    let recipesHtml = '';

    items.forEach(function (it) {
      const r = it.recipe;
      summaryTotalCost += it.totalCost;
      summaryTotalRevenue += (it.testPrice || 0) * it.servings;
      const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) * 100 : 0;

      let ingRows = '';
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        if (!ing) return;
        const unitPrice = Number(ing.pricePerUnit) || 0;
        const amt = Number(ri.amount) || 0;
        let lineCost = amt * unitPrice;
        if (ri.unit && ing.unit && ri.unit !== ing.unit) {
          try { lineCost = PCD.convertUnit(amt, ri.unit, ing.unit) * unitPrice; } catch (e) {}
        }
        ingRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(ing.name) + '</td>' +
            '<td class="num">' + PCD.fmtMoney(unitPrice) + '/' + PCD.escapeHtml(ing.unit) + '</td>' +
            '<td class="num">' + PCD.fmtNumber(amt) + ' ' + PCD.escapeHtml(ri.unit || ing.unit) + '</td>' +
            '<td class="num bold">' + PCD.fmtMoney(lineCost) + '</td>' +
          '</tr>';
      });

      recipesHtml +=
        '<section class="recipe">' +
          '<div class="recipe-header">' +
            '<div>' +
              '<h2>' + PCD.escapeHtml(r.name) + '</h2>' +
              '<div class="meta">' + (r.category || 'recipe') + ' · ' + it.servings + ' servings</div>' +
            '</div>' +
            '<div class="fc-badge">FC <b>' + fcPct.toFixed(1) + '%</b></div>' +
          '</div>' +

          '<table class="ing-table">' +
            '<thead><tr>' +
              '<th>Ingredient</th><th>Unit price</th><th>Qty</th><th>Cost</th>' +
            '</tr></thead>' +
            '<tbody>' + ingRows + '</tbody>' +
            '<tfoot>' +
              '<tr><td colspan="3" class="num">Total food cost</td><td class="num bold">' + PCD.fmtMoney(it.totalCost) + '</td></tr>' +
              '<tr><td colspan="3" class="num minor">Cost per serving</td><td class="num">' + PCD.fmtMoney(it.costPerServing) + '</td></tr>' +
            '</tfoot>' +
          '</table>' +

          '<div class="pricing">' +
            '<div><div class="lbl">Current price</div><div class="val">' + (it.currentPrice != null ? PCD.fmtMoney(it.currentPrice) : '—') + '</div></div>' +
            '<div><div class="lbl">Suggested @ ' + targetPct + '%</div><div class="val brand">' + PCD.fmtMoney(it.suggestedPrice) + '</div></div>' +
            '<div><div class="lbl">Test price</div><div class="val">' + PCD.fmtMoney(it.testPrice || 0) + '</div></div>' +
            '<div><div class="lbl">Margin / serving</div><div class="val">' + PCD.fmtMoney(Math.max(0, (it.testPrice || 0) - it.costPerServing)) + '</div></div>' +
          '</div>' +
        '</section>';
    });

    const summaryFcPct = summaryTotalRevenue > 0 ? (summaryTotalCost / summaryTotalRevenue) * 100 : 0;

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
      '</style>' +
      '<div class="report-header">' +
        '<div>' +
          '<h1>Cost Report</h1>' +
          '<div class="sub">' + items.length + ' recipe' + (items.length === 1 ? '' : 's') + ' · Target food cost ' + targetPct + '%</div>' +
        '</div>' +
        '<div class="meta">' + dateStr + (wsName ? ' · ' + PCD.escapeHtml(wsName) : '') + '</div>' +
      '</div>' +
      recipesHtml +
      (items.length > 1 ?
      '<div class="summary">' +
        '<h3>Summary</h3>' +
        '<div class="summary-grid">' +
          '<div class="pricing"><div><div class="lbl">Total food cost</div><div class="val">' + PCD.fmtMoney(summaryTotalCost) + '</div></div></div>' +
          '<div class="pricing"><div><div class="lbl">Total revenue</div><div class="val">' + PCD.fmtMoney(summaryTotalRevenue) + '</div></div></div>' +
          '<div class="pricing"><div><div class="lbl">Avg food cost %</div><div class="val brand">' + summaryFcPct.toFixed(1) + '%</div></div></div>' +
          '<div class="pricing"><div><div class="lbl">Total profit</div><div class="val">' + PCD.fmtMoney(Math.max(0, summaryTotalRevenue - summaryTotalCost)) + '</div></div></div>' +
        '</div>' +
      '</div>' : '');

    PCD.print(html, 'Cost Report ' + new Date().toISOString().slice(0, 10));
  }

  // Excel: 1 sheet per recipe + Summary sheet, with full professional styling
  function exportCostReportXLSX(items, targetPct) {
    if (!window.XLSX) {
      PCD.toast.error('Excel library not loaded — try refreshing the page');
      return;
    }
    const ingMap = currentIngMap();
    const wb = XLSX.utils.book_new();

    // ============ STYLE PRESETS ============
    const BRAND = '16A34A';        // green
    const BRAND_LIGHT = 'F0FDF4';  // very light green
    const HEADER_BG = '16A34A';
    const ROW_ALT = 'FAFAFA';
    const TEST_BG = 'FEF3C7';      // amber/yellow for editable test price
    const BORDER_COLOR = 'D4D4D4';

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
    const cellNumAltStyle = Object.assign({}, cellNumStyle, {
      fill: { fgColor: { rgb: ROW_ALT } },
    });
    const cellAltStyle = Object.assign({}, cellStyle, {
      fill: { fgColor: { rgb: ROW_ALT } },
    });
    const cellQtyAltStyle = Object.assign({}, cellQtyStyle, {
      fill: { fgColor: { rgb: ROW_ALT } },
    });
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

    // Helper to set a cell value+style
    function setCell(ws, addr, value, style, formula) {
      const cell = {};
      if (formula) {
        // Both formula AND cached value — Excel shows the value, recalculates on edit
        cell.f = formula;
        cell.v = value;
        cell.t = 'n';
      } else {
        cell.v = value;
        if (typeof value === 'number') cell.t = 'n';
        else if (typeof value === 'string') cell.t = 's';
      }
      if (style) cell.s = style;
      ws[addr] = cell;
    }

    // ============ SUMMARY SHEET ============
    const summaryWs = {};
    const summaryRange = { s: { c: 0, r: 0 }, e: { c: 7, r: 0 } };
    setCell(summaryWs, 'A1', 'COST REPORT', titleStyle);
    setCell(summaryWs, 'A2', 'Generated: ' + new Date().toLocaleString(), subtitleStyle);
    setCell(summaryWs, 'A3', 'Target food cost: ' + targetPct + '%', subtitleStyle);
    // Row 5: header
    const sumHeaders = ['Recipe', 'Servings', 'Total food cost', 'Cost per serving', 'Suggested price', 'Test price', 'Food cost %', 'Profit / serving'];
    sumHeaders.forEach(function (h, i) {
      const col = String.fromCharCode(65 + i);
      setCell(summaryWs, col + '5', h, i === 0 ? tableHeaderStyle : tableHeaderRightStyle);
    });
    // Data rows from row 6
    let sumRow = 6;
    items.forEach(function (it, idx) {
      const r = it.recipe;
      const fcPct = (it.testPrice && it.testPrice > 0) ? (it.costPerServing / it.testPrice) : 0;
      const profit = Math.max(0, (it.testPrice || 0) - it.costPerServing);
      const isAlt = idx % 2 === 1;
      setCell(summaryWs, 'A' + sumRow, r.name, isAlt ? cellAltStyle : cellStyle);
      setCell(summaryWs, 'B' + sumRow, it.servings, isAlt ? cellQtyAltStyle : cellQtyStyle);
      setCell(summaryWs, 'C' + sumRow, it.totalCost, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'D' + sumRow, it.costPerServing, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'E' + sumRow, it.suggestedPrice, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'F' + sumRow, it.testPrice || 0, isAlt ? cellNumAltStyle : cellNumStyle);
      setCell(summaryWs, 'G' + sumRow, fcPct, isAlt ? Object.assign({}, pctStyle, { fill: { fgColor: { rgb: ROW_ALT } } }) : pctStyle);
      setCell(summaryWs, 'H' + sumRow, profit, isAlt ? cellNumAltStyle : cellNumStyle);
      sumRow++;
    });

    // Column widths and merge for title
    summaryWs['!cols'] = [
      { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }
    ];
    summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    summaryWs['!rows'] = [{ hpt: 28 }];  // taller title row
    summaryWs['!ref'] = 'A1:H' + (sumRow - 1);
    summaryWs['!freeze'] = { xSplit: 0, ySplit: 5 };

    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // ============ ONE SHEET PER RECIPE ============
    items.forEach(function (it, idx) {
      const r = it.recipe;
      const sheetName = (r.name || ('Recipe' + (idx + 1))).slice(0, 28).replace(/[\\\/\?\*\[\]:]/g, '_');
      const ws = {};
      let row = 1;

      // Title
      setCell(ws, 'A' + row, r.name, titleStyle);
      row++;
      setCell(ws, 'A' + row, (r.category || 'recipe') + ' · ' + it.servings + ' servings', subtitleStyle);
      row++;
      row++;  // blank

      // Section: Ingredients
      setCell(ws, 'A' + row, 'INGREDIENT BREAKDOWN', sectionHeaderStyle);
      row++;

      // Header row
      const headerRow = row;
      setCell(ws, 'A' + row, 'Ingredient', tableHeaderStyle);
      setCell(ws, 'B' + row, 'Unit price', tableHeaderRightStyle);
      setCell(ws, 'C' + row, 'Unit', tableHeaderStyle);
      setCell(ws, 'D' + row, 'Qty', tableHeaderRightStyle);
      setCell(ws, 'E' + row, 'Qty unit', tableHeaderStyle);
      setCell(ws, 'F' + row, 'Line cost', tableHeaderRightStyle);
      row++;

      const startIngRow = row;
      let lastIngRow = row - 1;

      (r.ingredients || []).forEach(function (ri, ingIdx) {
        const ing = ingMap[ri.ingredientId];
        if (!ing) return;
        let qtyForFormula = Number(ri.amount) || 0;
        if (ri.unit && ing.unit && ri.unit !== ing.unit) {
          try { qtyForFormula = PCD.convertUnit(qtyForFormula, ri.unit, ing.unit); } catch (e) {}
        }
        const unitPrice = Number(ing.pricePerUnit) || 0;
        const lineCost = unitPrice * qtyForFormula;  // cached value
        const isAlt = ingIdx % 2 === 1;
        setCell(ws, 'A' + row, ing.name, isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'B' + row, unitPrice, isAlt ? cellNumAltStyle : cellNumStyle);
        setCell(ws, 'C' + row, ing.unit || '', isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'D' + row, qtyForFormula, isAlt ? cellQtyAltStyle : cellQtyStyle);
        setCell(ws, 'E' + row, ing.unit || '', isAlt ? cellAltStyle : cellStyle);
        setCell(ws, 'F' + row, lineCost, isAlt ? cellNumAltStyle : cellNumStyle, 'B' + row + '*D' + row);
        lastIngRow = row;
        row++;
      });

      row++;  // blank

      // Totals
      const totalRow = row;
      setCell(ws, 'A' + row, '', totalLabelStyle);
      setCell(ws, 'B' + row, '', totalLabelStyle);
      setCell(ws, 'C' + row, '', totalLabelStyle);
      setCell(ws, 'D' + row, '', totalLabelStyle);
      setCell(ws, 'E' + row, 'TOTAL FOOD COST', totalLabelStyle);
      setCell(ws, 'F' + row, it.totalCost, totalRowStyle, 'SUM(F' + startIngRow + ':F' + lastIngRow + ')');
      row++;

      const servingsRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Servings', pricingLabelStyle);
      setCell(ws, 'F' + row, it.servings, Object.assign({}, pricingValStyle, { numFmt: '0' }));
      row++;

      const cpsRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Cost per serving', pricingLabelStyle);
      setCell(ws, 'F' + row, it.costPerServing, pricingValStyle, 'F' + totalRow + '/F' + servingsRow);
      row++;

      row++;  // blank

      // Pricing section
      setCell(ws, 'A' + row, 'PRICING — edit Test price below to see live impact', sectionHeaderStyle);
      row++;

      const targetRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Target food cost %', pricingLabelStyle);
      setCell(ws, 'F' + row, targetPct / 100, Object.assign({}, pricingValStyle, { numFmt: '0%' }));
      row++;

      const suggRow = row;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Suggested price (per serving)', pricingLabelStyle);
      setCell(ws, 'F' + row, it.suggestedPrice, pricingValStyle, 'F' + cpsRow + '/F' + targetRow);
      row++;

      const testPriceVal = it.testPrice || it.suggestedPrice || 0;
      const testRow = row;
      setCell(ws, 'A' + row, '', editableLabelStyle);
      setCell(ws, 'B' + row, '', editableLabelStyle);
      setCell(ws, 'C' + row, '', editableLabelStyle);
      setCell(ws, 'D' + row, '', editableLabelStyle);
      setCell(ws, 'E' + row, '✏ TEST PRICE — EDIT ME', editableLabelStyle);
      setCell(ws, 'F' + row, testPriceVal, editableStyle);
      row++;

      const fcPctRow = row;
      const fcPctVal = testPriceVal > 0 ? it.costPerServing / testPriceVal : 0;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Food cost % at test price', pricingLabelStyle);
      setCell(ws, 'F' + row, fcPctVal, pctStyle, 'IF(F' + testRow + '>0, F' + cpsRow + '/F' + testRow + ', 0)');
      row++;

      const marginRow = row;
      const marginVal = testPriceVal - it.costPerServing;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Margin per serving', pricingLabelStyle);
      setCell(ws, 'F' + row, marginVal, pricingValStyle, 'F' + testRow + '-F' + cpsRow);
      row++;

      const revRow = row;
      const revVal = testPriceVal * it.servings;
      setCell(ws, 'A' + row, '', cellStyle);
      setCell(ws, 'B' + row, '', cellStyle);
      setCell(ws, 'C' + row, '', cellStyle);
      setCell(ws, 'D' + row, '', cellStyle);
      setCell(ws, 'E' + row, 'Total revenue', pricingLabelStyle);
      setCell(ws, 'F' + row, revVal, pricingValStyle, 'F' + testRow + '*F' + servingsRow);
      row++;

      const profitRow = row;
      const profitVal = revVal - it.totalCost;
      setCell(ws, 'A' + row, '', totalLabelStyle);
      setCell(ws, 'B' + row, '', totalLabelStyle);
      setCell(ws, 'C' + row, '', totalLabelStyle);
      setCell(ws, 'D' + row, '', totalLabelStyle);
      setCell(ws, 'E' + row, 'TOTAL PROFIT', totalLabelStyle);
      setCell(ws, 'F' + row, profitVal, totalRowStyle, 'F' + testRow + '*F' + servingsRow + '-F' + totalRow);
      row++;

      // Column widths
      ws['!cols'] = [
        { wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
      ];
      ws['!ref'] = 'A1:F' + (row - 1);
      // Merge title
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },  // title
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },  // subtitle
      ];
      ws['!rows'] = [{ hpt: 28 }];  // taller title

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const filename = 'cost-report-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    // Force Excel to recalculate all formulas when the file is opened.
    // Without this, cached zero values stay and editing test price doesn't update %.
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
    wb.Workbook.CalcPr.fullCalcOnLoad = true;
    XLSX.writeFile(wb, filename);
    PCD.toast.success('Excel downloaded · open and edit yellow Test price cells');
  }

  function openPreview(rid) {
    const t = PCD.i18n.t;
    const r = PCD.store.getRecipe(rid);
    if (!r) { PCD.toast.error('Recipe not found'); return; }
    const ingMap = currentIngMap();
    const cost = PCD.recipes.computeFoodCost(r, ingMap, PCD.recipes.buildRecipeMap());
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
    const editBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('edit'), style: { flex: '1', minWidth: '100px' } });
    const duplicateBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Duplicate' });
    duplicateBtn.innerHTML = PCD.icon('copy', 16);
    const copyToWsBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Copy to workspace' });
    copyToWsBtn.innerHTML = PCD.icon('truck', 16);
    const costReportBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Cost Report' });
    costReportBtn.innerHTML = PCD.icon('activity', 16) + ' <span>Cost Report</span>';
    const shareBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const deleteBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: t('delete'), style: { color: 'var(--danger)' } });
    deleteBtn.innerHTML = PCD.icon('trash', 16);
    footer.appendChild(deleteBtn);
    footer.appendChild(shareBtn);
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
      '<div style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);border-radius:8px;margin-bottom:14px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:4px;">🔗 Public link · Herkese açık link</div>' +
        '<div class="text-muted text-sm" style="margin-bottom:10px;">Login olmadan da bu tarifi görebilen kalıcı bir link. WhatsApp, Instagram, e-posta, neye yapıştırırsan oraya yapışır.</div>' +
        '<button type="button" class="btn btn-primary btn-sm" id="rShPublicLink" style="width:100%;">' +
          PCD.icon('share', 14) + ' <span>Generate share link</span>' +
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
        PCD.toast.error('Sign in to create public links');
        return;
      }
      if (!PCD.share || !PCD.share.createOrGetShareUrl) {
        PCD.toast.error('Share unavailable');
        return;
      }
      linkBtn.disabled = true;
      linkBtn.innerHTML = '<span class="spinner"></span> Generating...';
      PCD.share.createOrGetShareUrl('recipe', opts.recipe.id).then(function (url) {
        linkOut.value = url;
        linkOut.style.display = 'block';
        linkBtn.innerHTML = PCD.icon('copy', 14) + ' <span>Copy link</span>';
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
              PCD.toast.success('Copied');
            });
          } else {
            linkOut.select();
            document.execCommand('copy');
            PCD.toast.success('Copied');
          }
        };
      }).catch(function (e) {
        PCD.toast.error('Share failed: ' + (e.message || e));
        linkBtn.disabled = false;
        linkBtn.innerHTML = PCD.icon('share', 14) + ' <span>Generate share link</span>';
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

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: 'Versions · ' + r.name, body: body, footer: footer, size: 'md', closable: true });
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
            <input type="text" class="input" id="quickIngInput" placeholder="${PCD.escapeHtml(t('recipe_quick_add_placeholder'))}" autocomplete="off" style="padding-inline-start:36px;">
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
          : ['g','kg','ml','l','tsp','tbsp','cup','oz','lb','pcs','unit'];
        row.innerHTML = `
          <div class="list-item-body">
            <div class="list-item-title">${PCD.escapeHtml(name)}${subBadge}</div>
            <div class="list-item-meta">
              <input type="number" class="input" data-amount data-idx="${idx}" value="${ri.amount || 0}" step="0.01" min="0" style="width:90px;padding:6px 8px;min-height:32px;font-size:14px;">
              <select class="select" data-unit data-idx="${idx}" style="width:auto;padding:6px 8px;min-height:32px;font-size:14px;padding-right:28px;">
                ${unitOptions.map(function (u) { return '<option value="' + u + '"' + ((ri.unit || defaultUnit) === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
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
            if (!cropped) return;
            // v2.5.9: Upload the cropped photo to Supabase Storage so we
            // store a small URL instead of a multi-MB base64 string in
            // the recipe row. If upload fails (offline, no auth, etc.)
            // the helper falls back to the dataURL — same as before.
            const t = PCD.i18n.t;
            PCD.toast.info(t('photo_uploading'));
            PCD.photoStorage.upload(cropped).then(function (urlOrDataUrl) {
              data.photo = urlOrDataUrl;
              renderEditor();
            });
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
        document.addEventListener('click', function (e) {
          if (!e.target.closest || (!e.target.closest('#quickIngInput') && !e.target.closest('#quickIngDD'))) {
            if (qDD) qDD.style.display = 'none';
          }
        });

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
          renderEditor();
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
