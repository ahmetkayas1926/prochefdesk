/* ================================================================
   ProChefDesk — portion.js (v2.1 — multi-recipe scaling)

   USER FLOW:
   1) Pick one or more recipes (checkbox)
   2) Set target guest count
   3) See all recipes scaled (ingredients + costs)
   4) Actions:
      - Print → 50-portion versions to give to chef de partie
      - Share → WhatsApp/Email/Copy/More (PDF or text)
      - Send to Shopping List → name it ("Wedding event"), groups by category+recipe
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name||'').localeCompare(b.name||''); });

    if (recipes.length === 0) {
      view.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <div class="page-title">${t('portion_title') || 'Portion Calculator'}</div>
            <div class="page-subtitle">${t('portion_desc') || 'Scale recipes for events'}</div>
          </div>
        </div>
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('scale', 48)}</div>
          <div class="empty-title">No recipes yet</div>
          <div class="empty-desc">Create recipes first to use the portion calculator.</div>
        </div>
      `;
      return;
    }

    // Selection state
    const selected = new Set(); // recipe IDs
    const portionsPerRecipe = {}; // rid -> target portions (default = guests * 1)
    let guestCount = 50;

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('portion_title') || 'Portion Calculator'}</div>
          <div class="page-subtitle">Scale one or more recipes for an event</div>
        </div>
      </div>

      <div class="card mb-3" style="padding:14px;">
        <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Step 1 — Guest count</div>
        <div class="flex items-center gap-3" style="flex-wrap:wrap;">
          <input type="number" class="input" id="pcGuests" value="${guestCount}" min="1" step="1" style="width:120px;font-weight:700;font-size:18px;text-align:center;">
          <span style="color:var(--text-3);">guests</span>
          <div style="flex:1;"></div>
          <button class="btn btn-secondary btn-sm" data-quick="20">20</button>
          <button class="btn btn-secondary btn-sm" data-quick="50">50</button>
          <button class="btn btn-secondary btn-sm" data-quick="100">100</button>
          <button class="btn btn-secondary btn-sm" data-quick="200">200</button>
        </div>
      </div>

      <div class="card mb-3" style="padding:14px;">
        <div class="flex items-center justify-between mb-2">
          <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">Step 2 — Choose recipes</div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="pcAll">Select all</button>
            <button class="btn btn-ghost btn-sm" id="pcNone">Clear</button>
          </div>
        </div>
        <input type="search" class="input mb-2" id="pcSearch" placeholder="Search recipes...">
        <div id="pcRecipeList" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);"></div>
        <div class="text-muted text-sm mt-2" id="pcSelStat">No recipes selected</div>
      </div>

      <div id="pcResult"></div>
    `;

    const recipeListEl = PCD.$('#pcRecipeList', view);
    const searchInp = PCD.$('#pcSearch', view);
    const selStatEl = PCD.$('#pcSelStat', view);

    function paintRecipeList() {
      const q = (searchInp.value || '').toLowerCase().trim();
      const filtered = q ? recipes.filter(function (r) { return (r.name || '').toLowerCase().indexOf(q) >= 0; }) : recipes;
      PCD.clear(recipeListEl);
      filtered.forEach(function (r) {
        const isSel = selected.has(r.id);
        const row = PCD.el('label', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
            background: isSel ? 'var(--brand-50)' : 'var(--surface)'
          }
        });
        row.innerHTML =
          '<input type="checkbox" data-rid="' + r.id + '"' + (isSel ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--brand-600);flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
            '<div class="text-muted" style="font-size:12px;">' + (r.servings || 1) + ' servings · ' + ((r.ingredients || []).length) + ' ingredients</div>' +
          '</div>';
        recipeListEl.appendChild(row);
      });
    }

    function updateSelStat() {
      if (selected.size === 0) {
        selStatEl.textContent = 'No recipes selected';
        selStatEl.style.color = 'var(--text-3)';
      } else {
        selStatEl.textContent = selected.size + ' recipe' + (selected.size === 1 ? '' : 's') + ' selected';
        selStatEl.style.color = 'var(--brand-700)';
        selStatEl.style.fontWeight = '600';
      }
    }

    function refreshResult() {
      const resultEl = PCD.$('#pcResult', view);
      if (selected.size === 0) {
        resultEl.innerHTML = '';
        return;
      }

      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

      const selectedRecipes = recipes.filter(function (r) { return selected.has(r.id); });
      let totalCost = 0;
      let blocksHtml = '';

      selectedRecipes.forEach(function (r) {
        const targetPortions = portionsPerRecipe[r.id] || guestCount;
        const baseServings = r.servings || 1;
        const factor = targetPortions / baseServings;
        const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
        const scaledCost = baseCost * factor;
        totalCost += scaledCost;

        let ingsHtml = '';
        (r.ingredients || []).forEach(function (ri) {
          const ing = ingMap[ri.ingredientId];
          const name = ing ? ing.name : '?';
          const scaledAmt = (Number(ri.amount) || 0) * factor;
          ingsHtml +=
            '<tr>' +
              '<td style="padding:6px 10px;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(name) + '</td>' +
              '<td style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:end;font-weight:700;font-family:var(--font-mono);color:var(--brand-700);white-space:nowrap;">' + PCD.fmtNumber(scaledAmt) + ' ' + PCD.escapeHtml(ri.unit || '') + '</td>' +
            '</tr>';
        });

        blocksHtml +=
          '<div class="card mb-3" style="padding:14px;">' +
            '<div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">' +
              '<div style="font-weight:700;font-size:16px;">' + PCD.escapeHtml(r.name) + '</div>' +
              '<div class="flex items-center gap-2">' +
                '<input type="number" class="input" data-rscale="' + r.id + '" value="' + targetPortions + '" min="1" step="1" style="width:80px;text-align:center;font-weight:700;">' +
                '<span class="text-muted text-sm">portions</span>' +
                '<span class="text-muted text-sm">·</span>' +
                '<span style="font-weight:700;color:var(--brand-700);">' + PCD.fmtMoney(scaledCost) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="text-muted text-sm mb-2">' + factor.toFixed(2) + '× from base ' + baseServings + ' servings</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + ingsHtml + '</table>' +
          '</div>';
      });

      const totalPortions = selectedRecipes.reduce(function (s, r) { return s + (portionsPerRecipe[r.id] || guestCount); }, 0);

      resultEl.innerHTML =
        '<div class="card mb-3" style="padding:16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
          '<div style="font-weight:800;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Step 3 — Scaled recipes</div>' +
          '<div class="flex items-center" style="gap:18px;flex-wrap:wrap;">' +
            '<div><div class="text-muted text-sm">Recipes</div><div style="font-weight:700;font-size:20px;">' + selectedRecipes.length + '</div></div>' +
            '<div><div class="text-muted text-sm">Total portions</div><div style="font-weight:700;font-size:20px;">' + totalPortions + '</div></div>' +
            '<div><div class="text-muted text-sm">Total food cost</div><div style="font-weight:700;font-size:20px;color:var(--brand-700);">' + PCD.fmtMoney(totalCost) + '</div></div>' +
            '<div><div class="text-muted text-sm">Cost / guest</div><div style="font-weight:700;font-size:20px;">' + PCD.fmtMoney(guestCount > 0 ? totalCost / guestCount : 0) + '</div></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap;">' +
            '<button class="btn btn-primary" id="pcShop">' + PCD.icon('shopping-cart', 16) + ' <span>Send to Shopping List</span></button>' +
            '<button class="btn btn-outline" id="pcPrint">' + PCD.icon('print', 16) + ' <span>Print</span></button>' +
            '<button class="btn btn-outline" id="pcShare">' + PCD.icon('share', 16) + ' <span>Share</span></button>' +
          '</div>' +
        '</div>' +
        blocksHtml;

      // Wire per-recipe scale inputs
      PCD.on(resultEl, 'input', '[data-rscale]', function () {
        const rid = this.getAttribute('data-rscale');
        const val = parseInt(this.value, 10);
        if (val > 0) {
          portionsPerRecipe[rid] = val;
          // Don't full re-render to keep focus
          // Just update the cost line for this recipe
          refreshResult();
        }
      });

      PCD.$('#pcShop', resultEl).addEventListener('click', function () {
        sendToShoppingList(selectedRecipes, guestCount, portionsPerRecipe, ingMap);
      });
      PCD.$('#pcPrint', resultEl).addEventListener('click', function () {
        printScaled(selectedRecipes, guestCount, portionsPerRecipe, ingMap);
      });
      PCD.$('#pcShare', resultEl).addEventListener('click', function () {
        shareScaled(selectedRecipes, guestCount, portionsPerRecipe, ingMap);
      });
    }

    // Wire root events
    PCD.$('#pcGuests', view).addEventListener('input', function () {
      const v = parseInt(this.value, 10);
      if (v > 0) {
        guestCount = v;
        // Update default portions for already-selected recipes if user hasn't manually overridden
        // (we keep portionsPerRecipe as override)
        refreshResult();
      }
    });
    PCD.on(view, 'click', '[data-quick]', function () {
      guestCount = parseInt(this.getAttribute('data-quick'), 10);
      PCD.$('#pcGuests', view).value = guestCount;
      refreshResult();
    });
    searchInp.addEventListener('input', paintRecipeList);
    PCD.$('#pcAll', view).addEventListener('click', function () {
      recipes.forEach(function (r) { selected.add(r.id); });
      paintRecipeList(); updateSelStat(); refreshResult();
    });
    PCD.$('#pcNone', view).addEventListener('click', function () {
      selected.clear();
      paintRecipeList(); updateSelStat(); refreshResult();
    });
    PCD.on(recipeListEl, 'change', 'input[data-rid]', function () {
      const rid = this.getAttribute('data-rid');
      if (this.checked) selected.add(rid); else selected.delete(rid);
      const row = this.closest('label');
      if (row) row.style.background = this.checked ? 'var(--brand-50)' : 'var(--surface)';
      updateSelStat();
      refreshResult();
    });

    paintRecipeList();
    updateSelStat();
  }

  // ============ SHOPPING LIST ============
  function sendToShoppingList(recipes, guestCount, portionsMap, ingMap) {
    const defaultName = guestCount + ' guests · ' + new Date().toLocaleDateString();
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm mb-3">Combine all ingredients into a single shopping list, grouped by category and recipe.</div>' +
      '<div class="field"><label class="field-label">Name this shopping list</label>' +
      '<input type="text" class="input" id="slName" value="' + PCD.escapeHtml(defaultName) + '" placeholder="e.g. Wedding · 23 May"></div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Cancel' });
    const okBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    okBtn.innerHTML = PCD.icon('check', 16) + ' <span>Create list</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);

    const m = PCD.modal.open({ title: 'New shopping list', body: body, footer: footer, size: 'sm', closable: true });

    cancelBtn.addEventListener('click', function () { m.close(); });
    okBtn.addEventListener('click', function () {
      const name = (PCD.$('#slName', body).value || '').trim() || defaultName;

      // Aggregate ingredients across recipes
      // items: array of { ingredientId, name, unit, totalAmount, perRecipe: [{recipeName, amount, unit}], category }
      const agg = {};
      recipes.forEach(function (r) {
        const target = portionsMap[r.id] || guestCount;
        const factor = target / (r.servings || 1);
        (r.ingredients || []).forEach(function (ri) {
          const ing = ingMap[ri.ingredientId];
          if (!ing) return;
          const key = ri.ingredientId + '__' + (ri.unit || ing.unit);
          if (!agg[key]) {
            agg[key] = {
              ingredientId: ri.ingredientId,
              name: ing.name,
              unit: ri.unit || ing.unit || '',
              category: ing.category || 'cat_other',
              totalAmount: 0,
              perRecipe: [],
            };
          }
          const scaled = (Number(ri.amount) || 0) * factor;
          agg[key].totalAmount += scaled;
          agg[key].perRecipe.push({ recipeName: r.name, amount: scaled, unit: ri.unit || ing.unit || '' });
        });
      });

      const items = Object.values(agg).map(function (a) {
        return {
          id: PCD.uid('sli'),
          ingredientId: a.ingredientId,
          name: a.name,
          unit: a.unit,
          amount: Number(a.totalAmount.toFixed(3)),
          category: a.category,
          perRecipe: a.perRecipe,
          checked: false,
        };
      });

      const list = {
        name: name,
        sourceRecipes: recipes.map(function (r) { return { id: r.id, name: r.name, portions: portionsMap[r.id] || guestCount }; }),
        guestCount: guestCount,
        items: items,
        createdAt: new Date().toISOString(),
      };
      const saved = PCD.store.upsertInTable('shoppingLists', list, 'sl');
      PCD.toast.success('Shopping list created · ' + items.length + ' items');
      m.close();
      // Navigate to shopping list view if available
      setTimeout(function () {
        if (PCD.router && PCD.router.go) PCD.router.go('shopping');
      }, 250);
    });
  }

  // ============ PRINT ============
  function printScaled(recipes, guestCount, portionsMap, ingMap) {
    let blocks = '';
    let totalCost = 0;

    recipes.forEach(function (r) {
      const target = portionsMap[r.id] || guestCount;
      const factor = target / (r.servings || 1);
      const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
      const scaledCost = baseCost * factor;
      totalCost += scaledCost;

      let ingRows = '';
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '?';
        const scaled = (Number(ri.amount) || 0) * factor;
        ingRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(name) + '</td>' +
            '<td style="text-align:right;font-weight:700;color:#16a34a;font-family:monospace;white-space:nowrap;">' + PCD.fmtNumber(scaled) + ' ' + PCD.escapeHtml(ri.unit || '') + '</td>' +
          '</tr>';
      });

      let methodHtml = '';
      if (r.steps && r.steps.trim()) {
        const steps = r.steps.split(/\n\s*(?=\d+[\.\)\-]\s)|\n\n+/).map(function (s) {
          return s.replace(/^\d+[\.\)\-]\s*/, '').trim();
        }).filter(Boolean);
        if (steps.length === 0) {
          methodHtml = '<div class="kc-method"><p>' + PCD.escapeHtml(r.steps) + '</p></div>';
        } else {
          methodHtml = '<ol class="kc-method">' + steps.map(function (s) { return '<li>' + PCD.escapeHtml(s) + '</li>'; }).join('') + '</ol>';
        }
      }

      blocks +=
        '<div class="kc-block">' +
          '<div class="kc-name">' + PCD.escapeHtml(r.name) + ' <span class="kc-srv">· ' + target + ' portions (' + factor.toFixed(2) + '×)</span></div>' +
          '<table class="kc-ings">' + ingRows + '</table>' +
          methodHtml +
        '</div>';
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }' +
        '.kc-header { border-bottom: 3px solid #16a34a; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; }' +
        '.kc-header h1 { margin: 0; font-size: 22pt; color: #16a34a; }' +
        '.kc-header .meta { font-size: 11pt; color: #666; }' +
        '.kc-block { break-inside: avoid; margin-bottom: 14px; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; page-break-inside: avoid; }' +
        '.kc-block:last-child { border-bottom: 0; }' +
        '.kc-name { font-size: 12pt; font-weight: 800; color: #16a34a; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 4px; border-bottom: 1px solid #16a34a; margin-bottom: 6px; }' +
        '.kc-srv { font-size: 10pt; font-weight: 500; color: #666; text-transform: none; letter-spacing: 0; }' +
        '.kc-ings { width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.4; margin-bottom: 6px; }' +
        '.kc-ings td { padding: 2px 0; }' +
        '.kc-method { padding-left: 18px; margin: 6px 0 0; font-size: 10pt; line-height: 1.5; color: #444; }' +
        '.kc-method li { margin-bottom: 3px; }' +
      '</style>' +
      '<div class="kc-header">' +
        '<h1>Scaled recipes</h1>' +
        '<div class="meta">' + guestCount + ' guests · ' + recipes.length + ' recipes · ' + new Date().toLocaleDateString() + '</div>' +
      '</div>' +
      blocks +
      '<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;font-size:11pt;font-weight:700;">' +
        '<span>Total food cost</span>' +
        '<span style="color:#16a34a;">' + PCD.fmtMoney(totalCost) + ' (' + PCD.fmtMoney(guestCount > 0 ? totalCost / guestCount : 0) + ' / guest)</span>' +
      '</div>';

    PCD.print(html, 'Scaled recipes — ' + guestCount + ' guests');
  }

  // ============ SHARE ============
  function shareScaled(recipes, guestCount, portionsMap, ingMap) {
    const lines = ['Scaled recipes — ' + guestCount + ' guests', new Date().toLocaleDateString(), ''];
    let totalCost = 0;
    recipes.forEach(function (r) {
      const target = portionsMap[r.id] || guestCount;
      const factor = target / (r.servings || 1);
      const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
      totalCost += baseCost * factor;
      lines.push('— ' + r.name + ' (' + target + ' portions · ' + factor.toFixed(2) + '×) —');
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '?';
        const scaled = (Number(ri.amount) || 0) * factor;
        lines.push('• ' + name + ' — ' + PCD.fmtNumber(scaled) + ' ' + (ri.unit || ''));
      });
      lines.push('');
    });
    lines.push('Total cost: ' + PCD.fmtMoney(totalCost) + ' (' + PCD.fmtMoney(guestCount > 0 ? totalCost / guestCount : 0) + ' / guest)');
    const text = lines.join('\n');

    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">Message</label>' +
      '<textarea class="textarea" id="shText" rows="14" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:14px;">' +
        '<button class="btn btn-outline" id="shWa" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#25D366;">' + PCD.icon('message-circle', 24) + '</div><div style="font-weight:600;font-size:12px;">WhatsApp</div></button>' +
        '<button class="btn btn-outline" id="shEmail" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#EA4335;">' + PCD.icon('mail', 24) + '</div><div style="font-weight:600;font-size:12px;">Email</div></button>' +
        '<button class="btn btn-outline" id="shCopy" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--brand-600);">' + PCD.icon('copy', 24) + '</div><div style="font-weight:600;font-size:12px;">Copy</div></button>' +
        '<button class="btn btn-outline" id="shMore" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--text-2);">' + PCD.icon('share', 24) + '</div><div style="font-weight:600;font-size:12px;">More...</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close' });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: 'Share scaled recipes', body: body, footer: footer, size: 'md', closable: true });

    function getText() { return PCD.$('#shText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#shWa', body).addEventListener('click', function () {
      window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank'); m.close();
    });
    PCD.$('#shEmail', body).addEventListener('click', function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent('Scaled recipes — ' + guestCount + ' guests') + '&body=' + encodeURIComponent(getText());
      m.close();
    });
    PCD.$('#shCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success('Copied'); m.close(); });
    });
    PCD.$('#shMore', body).addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'Scaled recipes', text: getText() }).then(function () { m.close(); }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success('Copied'); m.close(); });
      }
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.portion = { render: render };
})();
