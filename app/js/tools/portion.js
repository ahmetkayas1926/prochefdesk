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
        ${PCD.subNav('recipes', 'portion')}
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
    // v2.13.2 — Görünüm modu: 'recipe' (tarif-tarif, varsayılan) | 'category' | 'supplier'
    // (birleştirilmiş malzeme listesi). Eski Shopping List'in konsolide görünümü buraya taşındı.
    let viewMode = 'recipe';

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('portion_title') || 'Portion Calculator'}</div>
          <div class="page-subtitle">${t('pc_subtitle')}</div>
        </div>
      </div>

      ${PCD.subNav('recipes', 'portion')}

      ${PCD.guideCard('portion', t('portion_g_t'), [t('portion_g1'), t('portion_g2'), t('portion_g3')])}

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

      // ---- BODY: viewMode'a göre ya tarif-tarif bloklar ya birleştirilmiş liste ----
      let bodyHtml = '';
      if (viewMode === 'recipe') {
        selectedRecipes.forEach(function (r) {
          const targetPortions = portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount;
          const baseServings = r.servings || 1;
          const factor = targetPortions / baseServings;

          // v2.8.69 — Recipe içindeki sub-recipe'leri ingredient seviyesine düşür.
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

          bodyHtml +=
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
      } else {
        // v2.13.2 — Birleştirilmiş görünüm: kompakt porsiyon inputları + gruplu malzeme listesi
        const inputsHtml =
          '<div class="card mb-3" style="padding:14px;">' +
            '<div style="font-weight:700;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + t('pc_step2') + '</div>' +
            selectedRecipes.map(function (r) {
              const target = portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount;
              return '<div class="flex items-center" style="justify-content:space-between;padding:6px 0;gap:10px;">' +
                '<div style="flex:1;min-width:0;font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
                '<input type="number" class="input" data-rscale="' + r.id + '" value="' + target + '" min="1" step="1" style="width:80px;text-align:center;font-weight:700;">' +
                '<span class="text-muted text-sm">' + t('pc_portions') + '</span>' +
              '</div>';
            }).join('') +
          '</div>';
        const init = consolidateRows(selectedRecipes, portionsPerRecipe, guestCount, ingMap, recipeMap);
        bodyHtml = inputsHtml +
          '<div class="card" style="padding:14px;">' +
            '<div style="font-weight:700;font-size:14px;margin-bottom:10px;">' + PCD.escapeHtml(t('pc_consolidated', 'Consolidated ingredients')) + '</div>' +
            '<div id="pcConsList">' + renderGroupsHtml(groupRows(init.rows, viewMode, t), viewMode) + '</div>' +
          '</div>';
      }

      // ---- Görünüm geçiş düğmeleri (segmented) ----
      const views = [['recipe', 'pc_view_recipe', 'By recipe'], ['category', 'pc_view_category', 'By category'], ['supplier', 'pc_view_supplier', 'By supplier']];
      const toggleHtml =
        '<div class="flex gap-1 mt-3" style="flex-wrap:wrap;">' +
          views.map(function (v) {
            return '<button class="btn btn-sm ' + (viewMode === v[0] ? 'btn-primary' : 'btn-outline') + '" data-pcview="' + v[0] + '">' + PCD.escapeHtml(t(v[1], v[2])) + '</button>';
          }).join('') +
        '</div>';

      resultEl.innerHTML =
        '<div class="card mb-3" style="padding:16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));">' +
          '<div style="font-weight:800;font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + t('pc_step3') + '</div>' +
          '<div class="flex items-center" style="gap:18px;flex-wrap:wrap;">' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_recipes') + '</div><div style="font-weight:700;font-size:20px;" data-stat-recipes>' + selectedRecipes.length + '</div></div>' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_total_portions') + '</div><div style="font-weight:700;font-size:20px;" data-stat-total-portions>0</div></div>' +
            '<div><div class="text-muted text-sm">' + t('pc_stat_total_cost') + '</div><div style="font-weight:700;font-size:20px;color:var(--brand-700);" data-stat-total-cost>$0</div></div>' +
            '<div><div class="text-muted text-sm">' + (t('pc_stat_avg_per_portion') || t('pc_stat_cost_per_guest') || 'Avg / portion') + '</div><div style="font-weight:700;font-size:20px;" data-stat-cost-per-guest>$0</div></div>' +
          '</div>' +
          toggleHtml +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap;">' +
            '<button class="btn btn-primary" id="pcPrint">' + PCD.icon('print', 16) + ' <span>' + t('pc_print') + '</span></button>' +
            '<button class="btn btn-outline" id="pcExcel">' + PCD.icon('download', 16) + ' <span>Excel</span></button>' +
            '<button class="btn btn-outline" id="pcShare">' + PCD.icon('share', 16) + ' <span>' + t('pc_share') + '</span></button>' +
          '</div>' +
        '</div>' +
        '<div id="pcBody">' + bodyHtml + '</div>';

      // Görünüm geçişi → tam yeniden çiz
      PCD.on(resultEl, 'click', '[data-pcview]', function () {
        const v = this.getAttribute('data-pcview');
        if (v === viewMode) return;
        viewMode = v;
        refreshResult();
      });

      // Per-recipe scale inputs — recipe modunda surgical, consolidated modunda liste yeniden çizilir
      PCD.on(resultEl, 'input', '[data-rscale]', function () {
        const rid = this.getAttribute('data-rscale');
        const raw = this.value;
        // Allow empty while typing (user is in the middle of typing)
        if (raw === '' || raw === null) return;
        const val = parseInt(raw, 10);
        if (isNaN(val) || val < 1) return;
        portionsPerRecipe[rid] = val;
        // Surgical update — input focus korunur (DOM yeniden kurulmaz)
        if (viewMode === 'recipe') updateResult(); else updateConsolidated();
      });

      // v2.8.92 — Print/share/shop çağrılarına `guestCount` yerine totalPortions
      // hesaplayıp geç. Step 1 kaldırıldığı için "X guests" yerine "X portions"
      // mantığı doğru hesap. Recompute (live, kullanıcı portion input değişebilir).
      function _totalPortionsNow() {
        return selectedRecipes.reduce(function (s, r) {
          return s + (portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount);
        }, 0);
      }
      PCD.$('#pcPrint', resultEl).addEventListener('click', function () {
        if (viewMode === 'recipe') {
          printScaled(selectedRecipes, _totalPortionsNow(), portionsPerRecipe, ingMap);
        } else {
          printConsolidated(selectedRecipes, portionsPerRecipe, guestCount, ingMap, recipeMap, viewMode);
        }
      });
      PCD.$('#pcShare', resultEl).addEventListener('click', function () {
        shareScaled(selectedRecipes, _totalPortionsNow(), portionsPerRecipe, ingMap);
      });
      // v2.39 — Excel export: görünüme uygun (tarif → ölçekli sayfa, kategori/tedarikçi → gruplu sipariş sayfası)
      PCD.$('#pcExcel', resultEl).addEventListener('click', function () {
        exportPortionXLSX(selectedRecipes, portionsPerRecipe, guestCount, ingMap, recipeMap, viewMode);
      });

      // Initial value computation
      if (viewMode === 'recipe') updateResult(); else updateConsolidated();
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

    // v2.13.2 — Consolidated görünüm güncellemesi: porsiyon değişince listeyi + stat'ları
    // yeniden hesapla. Sadece #pcConsList innerHTML değişir (inputlar dokunulmaz → focus korunur).
    function updateConsolidated() {
      const resultEl = PCD.$('#pcResult', view);
      if (!resultEl || selected.size === 0) return;
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = PCD.recipes.buildRecipeMap();
      const selectedRecipes = recipes.filter(function (r) { return selected.has(r.id); });
      const res = consolidateRows(selectedRecipes, portionsPerRecipe, guestCount, ingMap, recipeMap);
      const listEl = resultEl.querySelector('#pcConsList');
      if (listEl) listEl.innerHTML = renderGroupsHtml(groupRows(res.rows, viewMode, t), viewMode);
      let totalPortions = 0;
      selectedRecipes.forEach(function (r) { totalPortions += (portionsPerRecipe[r.id] != null ? portionsPerRecipe[r.id] : guestCount); });
      const sr = resultEl.querySelector('[data-stat-recipes]'); if (sr) sr.textContent = selectedRecipes.length;
      const stp = resultEl.querySelector('[data-stat-total-portions]'); if (stp) stp.textContent = totalPortions;
      const stc = resultEl.querySelector('[data-stat-total-cost]'); if (stc) stc.textContent = PCD.fmtMoney(res.total);
      const sa = resultEl.querySelector('[data-stat-cost-per-guest]'); if (sa) sa.textContent = PCD.fmtMoney(totalPortions > 0 ? res.total / totalPortions : 0);
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
            '<td style="text-align:right;font-weight:700;color:#1f9d6b;font-family:monospace;white-space:nowrap;">' + PCD.fmtNumber(scaled) + ' ' + PCD.escapeHtml(item.unit || '') + '</td>' +
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
        'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c2620; font-variant-numeric: tabular-nums; }' +
        '.kc-header { border-bottom: 3px solid #16433a; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; }' +
        '.kc-header h1 { margin: 0; font-family: "Fraunces","Georgia",serif; font-size: 22pt; font-weight: 600; letter-spacing: -0.01em; color: #16433a; }' +
        '.kc-header .meta { font-size: 11pt; color: #666; }' +
        '.kc-block { break-inside: avoid; margin-bottom: 14px; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; page-break-inside: avoid; }' +
        '.kc-block:last-child { border-bottom: 0; }' +
        '.kc-name { font-size: 12pt; font-weight: 700; color: #16433a; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 4px; border-bottom: 1px solid #cbe8d8; margin-bottom: 6px; }' +
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
        '<span style="color:#16433a;">' + PCD.fmtMoney(totalCost) + ' (' + PCD.fmtMoney(totalPortions > 0 ? totalCost / totalPortions : 0) + ' / ' + PCD.escapeHtml(PCD.i18n.t('portion_per_portion_short') || 'portion') + ')</span>' +
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
      window.location.href = 'mailto:?subject=' + encodeURIComponent('Scaled recipes — ' + totalPortions + ' portions') + '&body=' + encodeURIComponent(getText());
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

  // ============ CONSOLIDATED INGREDIENTS (v2.13.2 — Shopping'den taşındı) ============
  // Seçili tariflerin tüm malzemelerini (alt-tarifler flatten edilir) tek listede
  // birleştirir. key: ingredientId|unit → toplam miktar + toplam maliyet.
  // Maliyet: amt × pricePerUnit (birim farklıysa convertUnit). Eski shopping.js formülü.
  function consolidateRows(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap) {
    const merged = {};
    selectedRecipes.forEach(function (r) {
      const target = portionsMap[r.id] != null ? portionsMap[r.id] : defaultPortions;
      const factor = target / (r.servings || 1);
      const flat = PCD.recipes.flattenIngredients(r, ingMap, recipeMap, { scale: factor });
      flat.forEach(function (item) {
        const ing = item.ingredient;
        if (!ing) return;
        const unit = item.unit || ing.unit || '';
        const key = item.ingredientId + '|' + unit;
        if (!merged[key]) merged[key] = { ingredient: ing, unit: unit, totalAmount: 0, totalCost: 0 };
        const amt = Number(item.amount) || 0;
        merged[key].totalAmount += amt;
        let cost = amt * (ing.pricePerUnit || 0);
        if (item.unit && ing.unit && item.unit !== ing.unit) {
          try { cost = PCD.convertUnit(amt, item.unit, ing.unit) * (ing.pricePerUnit || 0); } catch (e) {}
        }
        merged[key].totalCost += cost;
      });
    });
    const rows = Object.keys(merged).map(function (k) { return merged[k]; });
    const total = rows.reduce(function (a, c) { return a + c.totalCost; }, 0);
    return { rows: rows, total: total };
  }

  function groupRows(rows, groupBy, t) {
    const groups = {};
    rows.forEach(function (c) {
      let key;
      if (groupBy === 'supplier') key = c.ingredient.supplier || t('pc_no_supplier', '(no supplier)');
      else key = t(c.ingredient.category || 'cat_other') || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }

  function renderGroupsHtml(groups, groupBy) {
    return Object.keys(groups).sort().map(function (g) {
      const rowsHtml = groups[g].map(function (c) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px;background:var(--surface);font-size:14px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;">' + PCD.escapeHtml(c.ingredient.name) + '</div>' +
            ((c.ingredient.supplier && groupBy !== 'supplier') ? '<div style="font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(c.ingredient.supplier) + '</div>' : '') +
          '</div>' +
          '<div style="font-family:var(--font-mono);font-weight:600;text-align:end;white-space:nowrap;">' +
            '<div>' + PCD.fmtNumber(c.totalAmount) + ' ' + PCD.escapeHtml(c.unit) + '</div>' +
            '<div style="font-size:11px;color:var(--text-3);font-weight:500;">' + PCD.fmtMoney(c.totalCost) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<div style="margin-bottom:14px;">' +
        '<div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">' + PCD.escapeHtml(g) + '</div>' +
        rowsHtml +
      '</div>';
    }).join('');
  }

  // Print: birleştirilmiş listenin A4 çıktısı (gruplu + toplam).
  function printConsolidated(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap, groupBy) {
    const t = PCD.i18n.t;
    const res = consolidateRows(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap);
    const groups = groupRows(res.rows, groupBy, t);
    const totalPortions = selectedRecipes.reduce(function (s, r) { return s + (portionsMap[r.id] != null ? portionsMap[r.id] : defaultPortions); }, 0);
    const groupsHtml = Object.keys(groups).sort().map(function (g) {
      const rows = groups[g].map(function (c) {
        return '<tr><td>' + PCD.escapeHtml(c.ingredient.name) + '</td><td class="a">' + PCD.fmtNumber(c.totalAmount) + ' ' + PCD.escapeHtml(c.unit) + '</td><td class="a">' + PCD.fmtMoney(c.totalCost) + '</td></tr>';
      }).join('');
      return '<div class="grp"><div class="grp-h">' + PCD.escapeHtml(g) + '</div><table class="t"><tbody>' + rows + '</tbody></table></div>';
    }).join('');
    const title = t('pc_consolidated', 'Consolidated ingredients');
    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c2620; font-variant-numeric: tabular-nums; }' +
        '.h { border-bottom: 3px solid #16433a; padding-bottom: 10px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:baseline; }' +
        '.h h1 { margin:0; font-family: "Fraunces","Georgia",serif; font-size: 22pt; font-weight: 600; letter-spacing: -0.01em; color:#16433a; }' +
        '.h .m { font-size: 11pt; color:#666; }' +
        '.grp { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }' +
        '.grp-h { font-size: 11pt; font-weight: 700; color:#16433a; text-transform:uppercase; letter-spacing:0.04em; border-bottom:1px solid #cbe8d8; padding-bottom:3px; margin-bottom:4px; }' +
        '.t { width:100%; border-collapse:collapse; font-size:10pt; }' +
        '.t td { padding:3px 0; border-bottom:1px solid #eee; }' +
        '.t .a { text-align:right; font-family:monospace; font-weight:700; white-space:nowrap; padding-left:10px; }' +
        '.tot { margin-top:14px; padding:10px 14px; background:#edf6f0; border:1px solid #cbe8d8; border-radius:8px; display:flex; justify-content:space-between; font-size:11pt; font-weight:700; }' +
      '</style>' +
      '<div class="h"><h1>' + PCD.escapeHtml(title) + '</h1>' +
        '<div class="m">' + totalPortions + ' ' + PCD.escapeHtml(t('portion_total_portions_label') || 'total portions') + ' · ' + selectedRecipes.length + ' ' + PCD.escapeHtml(t('portion_recipes_label') || 'recipes') + ' · ' + new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en') + '</div>' +
      '</div>' +
      groupsHtml +
      '<div class="tot"><span>' + PCD.escapeHtml(t('label_total_food_cost') || 'Total food cost') + '</span><span style="color:#16433a;">' + PCD.fmtMoney(res.total) + '</span></div>';
    PCD.print(html, title);
  }

  // ============ EXCEL EXPORT (v2.39) ============
  // Ortak PCD.xlsx motoru (yeşil başlık + çerçeve + autofit). Görünüme uygun:
  //  - 'recipe'  → ölçekli tarif sayfası (Tarif/Malzeme/Miktar/Birim/Maliyet)
  //  - 'category'|'supplier' → konsolide gruplu sipariş sayfası (Grup/Malzeme/...)
  // xlsx lazy-load (buffet/recipes paritesi); try/catch + toast.
  function exportPortionXLSX(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap, viewMode) {
    const t = PCD.i18n.t;
    if (!selectedRecipes || !selectedRecipes.length) return;
    if (!window.XLSX) {
      if (!PCD.loadXLSX) { PCD.toast.error(t('cr_xlsx_unavailable') || 'Excel library not available'); return; }
      PCD.loadXLSX().then(function () {
        exportPortionXLSX(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap, viewMode);
      }).catch(function () { PCD.toast.error(t('cr_xlsx_unavailable') || 'Excel library failed to load.'); });
      return;
    }
    try {
      _doExportPortionXLSX(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap, viewMode);
    } catch (err) {
      PCD.error && PCD.error('exportPortionXLSX failed:', err);
      PCD.toast.error((t('cr_xlsx_export_failed') || 'Excel export failed') + ': ' + (err && err.message ? err.message : 'unknown'));
    }
  }

  function _doExportPortionXLSX(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap, viewMode) {
    const t = PCD.i18n.t;
    const totalPortions = selectedRecipes.reduce(function (s, r) { return s + (portionsMap[r.id] != null ? portionsMap[r.id] : defaultPortions); }, 0);
    const dateStr = new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en');
    const subtitle = totalPortions + ' ' + (t('portion_total_portions_label') || 'total portions') + ' · ' +
      selectedRecipes.length + ' ' + (t('portion_recipes_label') || 'recipes') + ' · ' + dateStr;
    const AMT = '#,##0.##', MONEY = '#,##0.00';
    const totalLabel = t('pc_xl_total') || 'TOTAL';
    let spec;

    if (viewMode === 'recipe') {
      const rows = [];
      let total = 0;
      selectedRecipes.forEach(function (r) {
        const target = portionsMap[r.id] != null ? portionsMap[r.id] : defaultPortions;
        const factor = target / (r.servings || 1);
        const flat = PCD.recipes.flattenIngredients(r, ingMap, recipeMap, { scale: factor });
        flat.forEach(function (item) {
          const ing = item.ingredient; if (!ing) return;
          const amt = Number(item.amount) || 0;
          let cost = amt * (ing.pricePerUnit || 0);
          if (item.unit && ing.unit && item.unit !== ing.unit) {
            try { cost = PCD.convertUnit(amt, item.unit, ing.unit) * (ing.pricePerUnit || 0); } catch (e) {}
          }
          total += cost;
          const nm = (ing.name || '') + (item.viaSubRecipe ? ' (via ' + item.viaSubRecipe + ')' : '');
          rows.push([r.name + ' (' + target + 'p)', nm, amt, item.unit || '', cost]);
        });
      });
      rows.push(['', totalLabel, '', '', total]);
      spec = {
        name: (t('portion_print_title') || 'Scaled recipes').slice(0, 31),
        title: t('portion_print_title') || 'Scaled recipes',
        subtitle: subtitle,
        headers: [t('pc_xl_recipe') || 'Recipe', t('pc_xl_ingredient') || 'Ingredient', t('pc_xl_amount') || 'Amount', t('pc_xl_unit') || 'Unit', t('pc_xl_cost') || 'Cost'],
        align: ['left', 'left', 'right', 'left', 'right'],
        numFmt: { 2: AMT, 4: MONEY },
        rows: rows,
      };
    } else {
      const res = consolidateRows(selectedRecipes, portionsMap, defaultPortions, ingMap, recipeMap);
      const groups = groupRows(res.rows, viewMode, t);
      const rows = [];
      Object.keys(groups).sort().forEach(function (g) {
        groups[g].forEach(function (c) {
          rows.push([g, c.ingredient.name || '', Number(c.totalAmount) || 0, c.unit || '', Number(c.totalCost) || 0]);
        });
      });
      rows.push([totalLabel, '', '', '', res.total]);
      const groupHdr = viewMode === 'supplier' ? (t('pc_xl_supplier') || 'Supplier') : (t('pc_xl_category') || 'Category');
      spec = {
        name: (t('pc_consolidated') || 'Consolidated').slice(0, 31),
        title: t('pc_consolidated') || 'Consolidated ingredients',
        subtitle: subtitle,
        headers: [groupHdr, t('pc_xl_ingredient') || 'Ingredient', t('pc_xl_amount') || 'Amount', t('pc_xl_unit') || 'Unit', t('pc_xl_cost') || 'Cost'],
        align: ['left', 'left', 'right', 'left', 'right'],
        numFmt: { 2: AMT, 4: MONEY },
        rows: rows,
      };
    }

    const fname = (spec.title || 'Portion').replace(/[\\\/\?\*\[\]:]/g, '_') + '.xlsx';
    PCD.xlsx.save(window.XLSX, [spec], fname);
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.portion = { render: render };
})();
