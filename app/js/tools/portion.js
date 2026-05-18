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
    const portionsPerRecipe = {}; // rid -> target portions (kullanıcı her tarif için yazar)
    // v2.8.92 — Step 1 (Guest count input) kaldırıldı. Operatör raporu: "Step 1 ile
    // Step 3 mantıksal bağ kopuk; her tarifin kendi portion input'u var, toplu rakam
    // kafa karıştırıyor." Yeni model: kullanıcı doğrudan her tarif için porsiyon
    // sayısı yazar. Internal default (ilk seçim başlangıç değeri) 50 portion.
    let guestCount = 50;

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('portion_title') || 'Portion Calculator'}</div>
          <div class="page-subtitle">${t('pc_subtitle')}</div>
        </div>
      </div>

      <!-- v2.8.92 — Step 1 input kaldırıldı, yerine nazik intro/help kartı -->
      <div class="card mb-3" style="padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:20px;line-height:1;flex-shrink:0;margin-top:2px;">💡</span>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;color:var(--brand-700);margin-bottom:4px;letter-spacing:-0.01em;">${PCD.escapeHtml(t('pc_intro_title') || 'How to use')}</div>
            <div style="font-size:13px;color:var(--text-2);line-height:1.55;">${PCD.escapeHtml(t('pc_intro_body') || 'Pick the recipes you want to scale below, then enter how many portions you need for each one. Total food cost and average per-portion cost are calculated instantly.')}</div>
          </div>
        </div>
      </div>

      <div class="card mb-3" style="padding:14px;">
        <div class="flex items-center justify-between mb-2">
          <div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">${t('pc_step2')}</div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="pcAll">${t('pc_select_all')}</button>
            <button class="btn btn-ghost btn-sm" id="pcNone">${t('pc_clear')}</button>
          </div>
        </div>
        <input type="search" class="input mb-2" id="pcSearch" placeholder="${PCD.escapeHtml(t('pc_search_placeholder'))}">
        <div id="pcRecipeList" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);"></div>
        <div class="text-muted text-sm mt-2" id="pcSelStat">${t('pc_no_recipes_selected')}</div>
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
            '<div class="text-muted" style="font-size:12px;">' + t('pc_servings_ingredients', { s: r.servings || 1, i: (r.ingredients || []).length }) + '</div>' +
          '</div>';
        recipeListEl.appendChild(row);
      });
    }

    function updateSelStat() {
      if (selected.size === 0) {
        selStatEl.textContent = t('pc_no_recipes_selected');
        selStatEl.style.color = 'var(--text-3)';
      } else {
        const k = selected.size === 1 ? 'pc_recipes_selected' : 'pc_recipes_selected_plural';
        selStatEl.textContent = t(k, { n: selected.size });
        selStatEl.style.color = 'var(--brand-700)';
        selStatEl.style.fontWeight = '600';
      }
    }

    function buildResult() {
      // Builds the full result DOM ONCE. Subsequent value changes use updateResult().
      const resultEl = PCD.$('#pcResult', view);
      if (selected.size === 0) {
        resultEl.innerHTML = '';
        return;
      }

      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      // v2.8.69 — Sub-recipe expansion. recipeMap'i bir kez build et,
      // selectedRecipes içindeki her r için flattenIngredients çağır.
      const recipeMap = PCD.recipes.buildRecipeMap();
      const selectedRecipes = recipes.filter(function (r) { return selected.has(r.id); });

      let blocksHtml = '';
      selectedRecipes.forEach(function (r) {
        const targetPortions = portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount;
        const baseServings = r.servings || 1;
        const factor = targetPortions / baseServings;

        // v2.8.69 — Recipe içindeki sub-recipe'leri ingredient seviyesine düşür.
        // Tag'lenmiş viaSubRecipe alanı ile satır altında "via Labneh" ipucu gösterilir.
        const flat = PCD.recipes.flattenIngredients(r, ingMap, recipeMap);
        let ingsHtml = '';
        flat.forEach(function (item, idx) {
          const name = item.ingredient && item.ingredient.name || '?';
          const baseAmt = Number(item.amount) || 0;
          const scaledAmt = baseAmt * factor;
          const viaHint = item.viaSubRecipe
            ? '<div style="font-size:11px;color:var(--text-3);font-style:italic;margin-top:2px;">via ' + PCD.escapeHtml(item.viaSubRecipe) + '</div>'
            : '';
          ingsHtml +=
            '<tr>' +
              '<td style="padding:6px 10px;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(name) + viaHint + '</td>' +
              '<td style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:end;font-weight:700;font-family:var(--font-mono);color:var(--brand-700);white-space:nowrap;" data-amt-cell="' + r.id + ':' + idx + '" data-base-amt="' + baseAmt + '" data-unit="' + PCD.escapeHtml(item.unit || '') + '">' +
                PCD.fmtNumber(scaledAmt) + ' ' + PCD.escapeHtml(item.unit || '') +
              '</td>' +
            '</tr>';
        });

        blocksHtml +=
          '<div class="card mb-3" data-recipe-block="' + r.id + '" style="padding:14px;">' +
            '<div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">' +
              '<div style="font-weight:700;font-size:16px;">' + PCD.escapeHtml(r.name) + '</div>' +
              '<div class="flex items-center gap-2">' +
                '<input type="number" class="input" data-rscale="' + r.id + '" value="' + targetPortions + '" min="1" step="1" style="width:80px;text-align:center;font-weight:700;">' +
                '<span class="text-muted text-sm">' + t('pc_portions') + '</span>' +
                '<span class="text-muted text-sm">·</span>' +
                '<span style="font-weight:700;color:var(--brand-700);" data-recipe-cost="' + r.id + '">$0</span>' +
              '</div>' +
            '</div>' +
            '<div class="text-muted text-sm mb-2" data-recipe-factor="' + r.id + '">' + t('pc_factor_from_base', { factor: factor.toFixed(2), n: baseServings }) + '</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + ingsHtml + '</table>' +
          '</div>';
      });

      resultEl.innerHTML =
        '<div class="card mb-3" style="padding:16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
          '<div style="font-weight:800;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + t('pc_step3') + '</div>' +
          '<div class="flex items-center" style="gap:18px;flex-wrap:wrap;">' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_recipes') + '</div><div style="font-weight:700;font-size:20px;" data-stat-recipes>' + selectedRecipes.length + '</div></div>' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_total_portions') + '</div><div style="font-weight:700;font-size:20px;" data-stat-total-portions>0</div></div>' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_total_cost') + '</div><div style="font-weight:700;font-size:20px;color:var(--brand-700);" data-stat-total-cost>$0</div></div>' +
            '<div><div class="text-muted text-sm">' + (t('pc_stat_avg_per_portion') || t('pc_stat_cost_per_guest') || 'Avg / portion') + '</div><div style="font-weight:700;font-size:20px;" data-stat-cost-per-guest>$0</div></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap;">' +
            '<button class="btn btn-primary" id="pcShop">' + PCD.icon('shopping-cart', 16) + ' <span>' + t('pc_send_to_shopping') + '</span></button>' +
            '<button class="btn btn-outline" id="pcPrint">' + PCD.icon('print', 16) + ' <span>' + t('pc_print') + '</span></button>' +
            '<button class="btn btn-outline" id="pcShare">' + PCD.icon('share', 16) + ' <span>' + t('pc_share') + '</span></button>' +
          '</div>' +
        '</div>' +
        blocksHtml;

      // Wire per-recipe scale inputs - DEBOUNCED so user can type multi-digit
      PCD.on(resultEl, 'input', '[data-rscale]', function () {
        const rid = this.getAttribute('data-rscale');
        const raw = this.value;
        // Allow empty while typing (user is in the middle of typing)
        if (raw === '' || raw === null) return;
        const val = parseInt(raw, 10);
        if (isNaN(val) || val < 1) return;
        portionsPerRecipe[rid] = val;
        // Surgical update — DO NOT rebuild DOM, do not steal focus
        updateResult();
      });

      // v2.8.92 — Print/share/shop çağrılarına `guestCount` yerine totalPortions
      // hesaplayıp geç. Step 1 kaldırıldığı için "X guests" yerine "X portions"
      // mantığı doğru hesap. Recompute (live, kullanıcı portion input değişebilir).
      function _totalPortionsNow() {
        return selectedRecipes.reduce(function (s, r) {
          return s + (portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount);
        }, 0);
      }
      PCD.$('#pcShop', resultEl).addEventListener('click', function () {
        sendToShoppingList(selectedRecipes, _totalPortionsNow(), portionsPerRecipe, ingMap);
      });
      PCD.$('#pcPrint', resultEl).addEventListener('click', function () {
        printScaled(selectedRecipes, _totalPortionsNow(), portionsPerRecipe, ingMap);
      });
      PCD.$('#pcShare', resultEl).addEventListener('click', function () {
        shareScaled(selectedRecipes, _totalPortionsNow(), portionsPerRecipe, ingMap);
      });

      // Initial value computation
      updateResult();
    }

    function updateResult() {
      // Updates the values WITHOUT rebuilding DOM (so input focus is preserved)
      const resultEl = PCD.$('#pcResult', view);
      if (!resultEl || selected.size === 0) return;

      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const selectedRecipes = recipes.filter(function (r) { return selected.has(r.id); });

      let totalCost = 0;
      let totalPortions = 0;

      selectedRecipes.forEach(function (r) {
        const targetPortions = portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount;
        totalPortions += targetPortions;
        const baseServings = r.servings || 1;
        const factor = targetPortions / baseServings;
        const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
        const scaledCost = baseCost * factor;
        totalCost += scaledCost;

        // Update recipe-level cost
        const costEl = resultEl.querySelector('[data-recipe-cost="' + r.id + '"]');
        if (costEl) costEl.textContent = PCD.fmtMoney(scaledCost);
        const factorEl = resultEl.querySelector('[data-recipe-factor="' + r.id + '"]');
        if (factorEl) factorEl.textContent = t('pc_factor_from_base', { factor: factor.toFixed(2), n: baseServings });

        // v2.8.69 — Cells read base amount + unit from data attributes
        // (already set during buildResult flatten). Recompute scaledAmt.
        // Sub-recipe expanded rows just work because they share the same
        // [data-amt-cell="recipeId:flatIdx"] convention.
        const cells = resultEl.querySelectorAll('[data-amt-cell^="' + r.id + ':"]');
        cells.forEach(function (cell) {
          const baseAmt = Number(cell.getAttribute('data-base-amt')) || 0;
          const unit = cell.getAttribute('data-unit') || '';
          const scaledAmt = baseAmt * factor;
          cell.textContent = PCD.fmtNumber(scaledAmt) + (unit ? ' ' + unit : '');
        });
      });

      // Update top stats
      const statRecipes = resultEl.querySelector('[data-stat-recipes]');
      if (statRecipes) statRecipes.textContent = selectedRecipes.length;
      const statTotalPortions = resultEl.querySelector('[data-stat-total-portions]');
      if (statTotalPortions) statTotalPortions.textContent = totalPortions;
      const statTotalCost = resultEl.querySelector('[data-stat-total-cost]');
      if (statTotalCost) statTotalCost.textContent = PCD.fmtMoney(totalCost);
      // v2.8.92 — "Cost/guest" → "Avg per portion" (totalCost / totalPortions).
      // Eski mantık: guestCount (Step 1 input) ile bölüyordu — Step 1 kaldırıldığı
      // için artık toplam portion'a böl. Daha doğru, çünkü tarifler farklı
      // porsiyon sayıları olabilir.
      const statCpg = resultEl.querySelector('[data-stat-cost-per-guest]');
      if (statCpg) statCpg.textContent = PCD.fmtMoney(totalPortions > 0 ? totalCost / totalPortions : 0);
    }

    // Public refresh: rebuilds full DOM (used when selection changes)
    function refreshResult() {
      buildResult();
    }

    // Wire root events
    // v2.8.92 — #pcGuests input handler ve [data-quick] chip handler kaldırıldı.
    // Step 1 input artık yok; her tarif kendi portion input'unu yönetir.
    // `guestCount` internal default state (=50) olarak korunur — yeni tarif
    // seçildiğinde başlangıç portion sayısı.
    searchInp.addEventListener('input', paintRecipeList);
    PCD.$('#pcAll', view).addEventListener('click', function () {
      recipes.forEach(function (r) {
        selected.add(r.id);
        if (portionsPerRecipe[r.id] == null) portionsPerRecipe[r.id] = guestCount;
      });
      paintRecipeList(); updateSelStat(); refreshResult();
    });
    PCD.$('#pcNone', view).addEventListener('click', function () {
      selected.clear();
      // Also clear overrides so old data doesn't leak
      Object.keys(portionsPerRecipe).forEach(function (k) { delete portionsPerRecipe[k]; });
      paintRecipeList(); updateSelStat(); refreshResult();
    });
    PCD.on(recipeListEl, 'change', 'input[data-rid]', function () {
      const rid = this.getAttribute('data-rid');
      if (this.checked) {
        selected.add(rid);
        // Initialize override to current guestCount so it stays in sync
        if (portionsPerRecipe[rid] == null) portionsPerRecipe[rid] = guestCount;
      } else {
        selected.delete(rid);
        delete portionsPerRecipe[rid];
      }
      const row = this.closest('label');
      if (row) row.style.background = this.checked ? 'var(--brand-50)' : 'var(--surface)';
      updateSelStat();
      refreshResult();
    });

    paintRecipeList();
    updateSelStat();
  }

  // ============ SHOPPING LIST ============
  // v2.8.92 — Parametre `guestCount` → `totalPortions` semantik (Step 1 kaldırıldı).
  function sendToShoppingList(recipes, totalPortions, portionsMap, ingMap) {
    const t = PCD.i18n.t;
    const defaultName = totalPortions + ' ' + (t('portion_total_portions_label') || 'portions') + ' · ' + new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en');
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm mb-3">' + PCD.escapeHtml(t('pc_shopping_intro') || 'Combine all ingredients into a single shopping list, grouped by category and recipe.') + '</div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('pc_shopping_name_label') || 'Name this shopping list') + '</label>' +
      '<input type="text" class="input" id="slName" value="' + PCD.escapeHtml(defaultName) + '" placeholder="' + PCD.escapeHtml(t('pc_shopping_name_ph') || 'e.g. Wedding · 23 May') + '"></div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('cancel') });
    const okBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    okBtn.innerHTML = PCD.icon('check', 16) + ' <span>' + PCD.i18n.t('btn_create_list') + '</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);

    const m = PCD.modal.open({ title: PCD.i18n.t('modal_new_shopping_list_title'), body: body, footer: footer, size: 'sm', closable: true });

    cancelBtn.addEventListener('click', function () { m.close(); });
    okBtn.addEventListener('click', function () {
      const name = (PCD.$('#slName', body).value || '').trim() || defaultName;

      // Shopping list editor consolidates ingredients itself from recipes + portions.
      // Send recipes with their target portion count.
      const itemsForShopping = recipes.map(function (r) {
        return {
          recipeId: r.id,
          portions: portionsMap[r.id] != null ? portionsMap[r.id] : 50
        };
      });

      const list = {
        name: name,
        items: itemsForShopping,
        guestCount: totalPortions,  // legacy field name kept for shopping.js compat
        groupBy: 'category',
        createdAt: new Date().toISOString(),
      };
      const saved = PCD.store.upsertInTable('shoppingLists', list, 'sl');
      PCD.toast.success(PCD.i18n.t('toast_shopping_created_n', { n: recipes.length }));
      m.close();
      // Navigate to shopping list view if available
      setTimeout(function () {
        if (PCD.router && PCD.router.go) PCD.router.go('shopping');
      }, 250);
    });
  }

  // ============ PRINT ============
  // v2.8.92 — Parametre `guestCount` → `totalPortions` semantik (Step 1 kaldırıldı).
  function printScaled(recipes, totalPortions, portionsMap, ingMap) {
    let blocks = '';
    let totalCost = 0;

    recipes.forEach(function (r) {
      // v2.8.92 — Fallback 50 (eski guestCount default'u). portionsMap[r.id]
      // her tarif için kullanıcı override'ı, override edilmemişse 50 portion.
      const target = portionsMap[r.id] || 50;
      const factor = target / (r.servings || 1);
      const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
      const scaledCost = baseCost * factor;
      totalCost += scaledCost;

      // v2.8.69 — flattenIngredients: sub-recipe satırları gerçek ingredient'lara açılır
      const flatPrint = PCD.recipes.flattenIngredients(r, ingMap, PCD.recipes.buildRecipeMap());
      let ingRows = '';
      flatPrint.forEach(function (item) {
        const name = item.ingredient && item.ingredient.name || '?';
        const scaled = (Number(item.amount) || 0) * factor;
        const viaHint = item.viaSubRecipe
          ? ' <span style="font-size:8pt;color:#999;font-style:italic;">(via ' + PCD.escapeHtml(item.viaSubRecipe) + ')</span>'
          : '';
        ingRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(name) + viaHint + '</td>' +
            '<td style="text-align:right;font-weight:700;color:#16a34a;font-family:monospace;white-space:nowrap;">' + PCD.fmtNumber(scaled) + ' ' + PCD.escapeHtml(item.unit || '') + '</td>' +
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
        '<h1>' + PCD.escapeHtml(PCD.i18n.t('portion_print_title') || 'Scaled recipes') + '</h1>' +
        // v2.8.92 — "X guests" → "X total portions". Step 1 (Guest count) kaldırıldı;
        // print meta artık tüm tariflerin toplam porsiyon sayısı.
        '<div class="meta">' + totalPortions + ' ' + PCD.escapeHtml(PCD.i18n.t('portion_total_portions_label') || 'total portions') + ' · ' + recipes.length + ' ' + PCD.escapeHtml(PCD.i18n.t('portion_recipes_label') || 'recipes') + ' · ' + new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en') + '</div>' +
      '</div>' +
      blocks +
      '<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;font-size:11pt;font-weight:700;">' +
        '<span>' + PCD.i18n.t('label_total_food_cost') + '</span>' +
        '<span style="color:#16a34a;">' + PCD.fmtMoney(totalCost) + ' (' + PCD.fmtMoney(totalPortions > 0 ? totalCost / totalPortions : 0) + ' / ' + PCD.escapeHtml(PCD.i18n.t('portion_per_portion_short') || 'portion') + ')</span>' +
      '</div>';

    PCD.print(html, (PCD.i18n.t('portion_print_title') || 'Scaled recipes') + ' — ' + totalPortions + ' ' + (PCD.i18n.t('portion_total_portions_label') || 'portions'));
  }

  // ============ SHARE ============
  // v2.8.92 — Parametre adı `guestCount` → `totalPortions` semantik gerçeği yansıtır.
  // (Step 1 input kaldırıldı, çağıran tarafta totalPortions hesaplanıp gönderilir.)
  function shareScaled(recipes, totalPortions, portionsMap, ingMap) {
    const t = PCD.i18n.t;
    const dateStr = new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en');
    const lines = [(t('portion_print_title') || 'Scaled recipes') + ' — ' + totalPortions + ' ' + (t('portion_total_portions_label') || 'total portions'), dateStr, ''];
    let totalCost = 0;
    recipes.forEach(function (r) {
      // v2.8.92 — Her tarif kendi portionsMap[r.id] override'ını kullanır.
      // Fallback: 50 portion (eski guestCount default'u). Genelde her tarif
      // override edildiği için fallback'e nadiren düşülür.
      const target = portionsMap[r.id] || 50;
      const factor = target / (r.servings || 1);
      const baseCost = PCD.recipes.computeFoodCost(r, ingMap);
      totalCost += baseCost * factor;
      lines.push('— ' + r.name + ' (' + target + ' portions · ' + factor.toFixed(2) + '×) —');
      // v2.8.69 — flattenIngredients: sub-recipe satırları açılır
      const flatShare = PCD.recipes.flattenIngredients(r, ingMap, PCD.recipes.buildRecipeMap());
      flatShare.forEach(function (item) {
        const name = item.ingredient && item.ingredient.name || '?';
        const scaled = (Number(item.amount) || 0) * factor;
        const via = item.viaSubRecipe ? ' (via ' + item.viaSubRecipe + ')' : '';
        lines.push('• ' + name + via + ' — ' + PCD.fmtNumber(scaled) + ' ' + (item.unit || ''));
      });
      lines.push('');
    });
    lines.push((t('portion_total_cost_label') || 'Total cost') + ': ' + PCD.fmtMoney(totalCost) + ' (' + PCD.fmtMoney(totalPortions > 0 ? totalCost / totalPortions : 0) + ' / ' + (t('portion_per_portion_short') || 'portion') + ')');
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

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_share_scaled_title'), body: body, footer: footer, size: 'md', closable: true });

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
      if (navigator.clipboard) navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
    });
    PCD.$('#shMore', body).addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'Scaled recipes', text: getText() }).then(function () { m.close(); }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
      }
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.portion = { render: render };
})();
