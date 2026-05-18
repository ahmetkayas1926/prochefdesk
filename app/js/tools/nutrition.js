/* ================================================================
   ProChefDesk — nutrition.js
   Nutritional analysis per recipe.

   Data stored on ingredient:
     ing.nutrition = {
       per: 100,        // per 100 (g or ml, matches ing.unit group)
       calories: number, protein: number, carbs: number, fat: number,
       fiber: number, sugar: number, sodium: number  // g, sodium in mg
     }

   Computation: for each recipe ingredient, scale by (amount_in_grams / 100).

   v2.9.3 — NAKED→RICH upgrade: closeable inline guide, recipe coverage
   stats hero, partial-warning i18n, editor field hints. Pattern: buffet
   v2.8.77, yield v2.9.0, waste v2.9.1, variance v2.9.2.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const MACROS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];

  // v2.9.3 — Coverage status helpers (recipe-level completeness signal)
  function coverageStatus(pct) {
    if (pct >= 100) return 'complete';
    if (pct >= 80) return 'mostly';
    if (pct >= 50) return 'half';
    return 'limited';
  }
  function coverageColor(s) {
    if (s === 'complete') return '#16a34a';
    if (s === 'mostly') return '#16a34a';
    if (s === 'half') return '#f59e0b';
    return '#dc2626';
  }
  function coverageLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'complete') return t('nut_status_complete') || 'Complete coverage';
    if (s === 'mostly') return t('nut_status_mostly') || 'Mostly covered';
    if (s === 'half') return t('nut_status_half') || 'Half-covered';
    return t('nut_status_limited') || 'Limited data';
  }

  // Convert recipe ingredient amount to grams (approx for volumes)
  function approxGrams(amount, unit, ingUnit) {
    if (amount == null) return 0;
    const num = Number(amount) || 0;
    // If unit is already in mass group, convert to grams
    try {
      if (unit && ['g', 'kg', 'oz', 'lb'].indexOf(unit) >= 0) {
        return PCD.convertUnit(num, unit, 'g');
      }
      if (unit && ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz'].indexOf(unit) >= 0) {
        return PCD.convertUnit(num, unit, 'ml'); // assume 1g ≈ 1ml for cost-level approximation
      }
    } catch (e) {}
    // pcs / unit — assume 50g average (fallback, user should fix if unrealistic)
    if (unit === 'pcs' || unit === 'unit') return num * 50;
    return num;
  }

  function computeRecipeNutrition(recipe, ingMap) {
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
    let hasMissing = false;
    // v2.8.69 — Sub-recipe cascade. Önceden marinade içindeki ingredient'lar
    // nutrition'a girmiyordu → parent recipe kalori hesabı eksik.
    const flat = (PCD.recipes && PCD.recipes.flattenIngredients)
      ? PCD.recipes.flattenIngredients(recipe, ingMap, PCD.recipes.buildRecipeMap())
      : (recipe.ingredients || []).map(function (ri) {
          return { ingredient: ingMap[ri.ingredientId], amount: ri.amount, unit: ri.unit };
        });
    flat.forEach(function (item) {
      const ing = item.ingredient;
      if (!ing) return;
      const nut = ing.nutrition;
      if (!nut) { hasMissing = true; return; }
      const grams = approxGrams(item.amount, item.unit, ing.unit);
      const factor = grams / (nut.per || 100);
      MACROS.forEach(function (m) {
        totals[m] += (Number(nut[m]) || 0) * factor;
      });
    });
    return { totals: totals, hasMissing: hasMissing };
  }

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const ingMap = {};
    ings.forEach(function (i) { ingMap[i.id] = i; });

    const missingCount = ings.filter(function (i) { return !i.nutrition; }).length;

    // v2.9.3 — Recipe-level coverage stats for hero
    let fullyCovered = 0;
    let totalKcal = 0;
    let kcalSamples = 0;
    recipes.forEach(function (r) {
      const n = computeRecipeNutrition(r, ingMap);
      if (!n.hasMissing) fullyCovered++;
      const servings = r.servings || 1;
      if (n.totals.calories > 0) {
        totalKcal += n.totals.calories / servings;
        kcalSamples++;
      }
    });
    const coveragePct = recipes.length > 0 ? (fullyCovered / recipes.length) * 100 : 0;
    const covStatus = recipes.length > 0 ? coverageStatus(coveragePct) : null;
    const covColor = covStatus ? coverageColor(covStatus) : '#6b7280';
    const avgKcal = kcalSamples > 0 ? Math.round(totalKcal / kcalSamples) : 0;

    // v2.9.3 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_nutrition_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('nutrition_title')}</div>
          <div class="page-subtitle">${t('nutrition_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline" id="setNutBtn">${t('nut_edit_ingredient')}</button>
        </div>
      </div>

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('nut_guide_title') || 'How nutrition analysis works')}</span>
            <button type="button" id="nutGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('nut_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('nut_guide_step1_title') || 'Enter per-100g values once')}</strong> — ${PCD.escapeHtml(t('nut_guide_step1_body') || 'For each ingredient, fill in calories + protein + carbs + fat + fiber + sugar + sodium per 100g. The Edit Ingredients button opens a batch editor.')}</li>
              <li><strong>${PCD.escapeHtml(t('nut_guide_step2_title') || 'Recipes auto-compute')}</strong> — ${PCD.escapeHtml(t('nut_guide_step2_body') || 'Each recipe scales the per-100g values by your actual amounts. Sub-recipes cascade (a marinade inside a main dish contributes its own ingredients).')}</li>
              <li><strong>${PCD.escapeHtml(t('nut_guide_step3_title') || 'Click a recipe for the breakdown')}</strong> — ${PCD.escapeHtml(t('nut_guide_step3_body') || 'Per-serving + total macros, plus a protein/carbs/fat ratio bar. Useful for menu labelling, allergen/diet pairing, and balanced menu design.')}</li>
              <li><strong>${PCD.escapeHtml(t('nut_guide_step4_title') || 'Watch the coverage chip')}</strong> — ${PCD.escapeHtml(t('nut_guide_step4_body') || 'The hero shows what % of recipes have full data. Hit 80%+ before publishing nutrition info to guests — partial recipes show a warning chip on the list.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('nut_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('nut_guide_tip_body') || 'The USDA FoodData Central database (free, online) covers thousands of common ingredients. Search the item, copy per-100g values, paste once — done for life.')}
            </div>
          </div>
        </details>
      ` : ''}

      ${recipes.length > 0 ? `
        <div class="stat mb-3" style="background:linear-gradient(135deg,${covColor}18,var(--surface));border-color:${covColor};padding:18px;">
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('nut_coverage') || 'Coverage')}</div>
              <div style="font-size:42px;font-weight:900;color:${covColor};line-height:1;letter-spacing:-0.02em;">${Math.round(coveragePct)}<span style="font-size:24px;">%</span></div>
            </div>
            <div style="flex:1;min-width:180px;">
              <span style="display:inline-block;padding:4px 10px;background:${covColor}25;color:${covColor};font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">${PCD.escapeHtml(coverageLabel(covStatus))}</span>
              <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">${fullyCovered} / ${recipes.length} ${PCD.escapeHtml(t('nut_recipes_full') || 'recipes fully computed')}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('nut_avg_kcal') || 'Avg kcal / serving')}</div><div style="font-size:18px;font-weight:700;color:var(--text-2);">${avgKcal > 0 ? avgKcal : '—'}</div></div>
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('nut_ings_missing') || 'Ingredients missing data')}</div><div style="font-size:18px;font-weight:700;color:${missingCount > 0 ? 'var(--warning)' : 'var(--success)'};">${missingCount}</div></div>
          </div>
        </div>
      ` : ''}

      ${missingCount > 0 ? `
        <div class="card mb-3" style="background:var(--warning-bg);border-color:var(--warning);padding:12px;">
          <div class="flex items-center gap-2">
            <div style="font-size:20px;">⚠️</div>
            <div style="flex:1;">
              <div style="font-weight:600;">${t('nut_missing')}</div>
              <div class="text-sm" style="color:var(--warning);">${t('nut_missing_desc').replace('{n}', missingCount)}</div>
            </div>
          </div>
        </div>
      ` : ''}

      <div id="nutList"></div>
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#nutGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_nutrition_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    const listEl = PCD.$('#nutList', view);
    if (recipes.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🥗</div>
          <div class="empty-title">${t('nut_no_recipes')}</div>
          <div class="empty-desc">${t('no_recipes_yet_desc')}</div>
        </div>
      `;
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      recipes.forEach(function (r) {
        const n = computeRecipeNutrition(r, ingMap);
        const servings = r.servings || 1;
        const perServing = {};
        MACROS.forEach(function (m) { perServing[m] = n.totals[m] / servings; });

        const row = PCD.el('div', { class: 'card card-hover', 'data-rid': r.id, style: { padding: '14px' } });
        row.innerHTML = `
          <div class="flex items-center gap-3 mb-2">
            <div class="list-item-thumb" style="width:44px;height:44px;${r.photo ? 'background-image:url(' + PCD.escapeHtml(r.photo) + ');background-size:cover;background-position:center;' : ''}">${r.photo ? '' : '🍽️'}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:15px;">${PCD.escapeHtml(r.name)}</div>
              <div class="text-muted text-sm">${servings} ${t('recipe_servings').toLowerCase()}</div>
            </div>
            ${n.hasMissing ? '<span class="chip chip-warning" style="font-size:10px;">' + t('nut_missing') + '</span>' : ''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;font-size:12px;">
            <div style="text-align:center;padding:8px 4px;background:var(--brand-50);border-radius:var(--r-sm);">
              <div style="font-weight:700;font-size:16px;color:var(--brand-700);">${Math.round(perServing.calories)}</div>
              <div style="color:var(--text-3);">${t('nut_kcal')}</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:var(--surface-2);border-radius:var(--r-sm);">
              <div style="font-weight:700;font-size:16px;">${PCD.fmtNumber(perServing.protein, 1)}g</div>
              <div style="color:var(--text-3);">${t('nut_protein')}</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:var(--surface-2);border-radius:var(--r-sm);">
              <div style="font-weight:700;font-size:16px;">${PCD.fmtNumber(perServing.carbs, 1)}g</div>
              <div style="color:var(--text-3);">${t('nut_carbs')}</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:var(--surface-2);border-radius:var(--r-sm);">
              <div style="font-weight:700;font-size:16px;">${PCD.fmtNumber(perServing.fat, 1)}g</div>
              <div style="color:var(--text-3);">${t('nut_fat')}</div>
            </div>
          </div>
        `;
        cont.appendChild(row);
      });
      listEl.appendChild(cont);

      PCD.on(cont, 'click', '[data-rid]', function () {
        openRecipeNutrition(this.getAttribute('data-rid'));
      });
    }

    PCD.$('#setNutBtn', view).addEventListener('click', openIngNutritionEditor);
  }

  // ============ RECIPE NUTRITION DETAIL ============
  function openRecipeNutrition(rid) {
    const t = PCD.i18n.t;
    const r = PCD.store.getRecipe(rid);
    if (!r) return;
    const ings = PCD.store.listIngredients();
    const ingMap = {}; ings.forEach(function (i) { ingMap[i.id] = i; });
    const n = computeRecipeNutrition(r, ingMap);
    const servings = r.servings || 1;
    const perServing = {};
    MACROS.forEach(function (m) { perServing[m] = n.totals[m] / servings; });

    // Build macro bar — protein/carbs/fat ratio
    const caloriesFromProtein = perServing.protein * 4;
    const caloriesFromCarbs = perServing.carbs * 4;
    const caloriesFromFat = perServing.fat * 9;
    const totalCals = caloriesFromProtein + caloriesFromCarbs + caloriesFromFat;
    const pctP = totalCals > 0 ? (caloriesFromProtein / totalCals) * 100 : 0;
    const pctC = totalCals > 0 ? (caloriesFromCarbs / totalCals) * 100 : 0;
    const pctF = totalCals > 0 ? (caloriesFromFat / totalCals) * 100 : 0;

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="text-center mb-3">
        <div style="font-size:36px;font-weight:800;color:var(--brand-700);">${Math.round(perServing.calories)}</div>
        <div class="text-muted">${t('nut_kcal')} ${t('per_serving').toLowerCase()}</div>
      </div>

      <div class="section-title mb-2" style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);">${t('nut_bar_chart')}</div>
      <div style="display:flex;height:32px;border-radius:var(--r-md);overflow:hidden;margin-bottom:6px;">
        <div style="width:${pctP}%;background:var(--info);" title="${t('nut_protein')}"></div>
        <div style="width:${pctC}%;background:var(--warning);" title="${t('nut_carbs')}"></div>
        <div style="width:${pctF}%;background:var(--danger);" title="${t('nut_fat')}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:16px;">
        <span><span style="color:var(--info);">●</span> ${t('nut_protein')} ${PCD.fmtNumber(pctP, 0)}%</span>
        <span><span style="color:var(--warning);">●</span> ${t('nut_carbs')} ${PCD.fmtNumber(pctC, 0)}%</span>
        <span><span style="color:var(--danger);">●</span> ${t('nut_fat')} ${PCD.fmtNumber(pctF, 0)}%</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:start;padding:8px 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;"></th>
            <th style="text-align:end;padding:8px 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">${t('per_serving')}</th>
            <th style="text-align:end;padding:8px 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">${t('total')}</th>
          </tr>
        </thead>
        <tbody>
          ${MACROS.map(function (m) {
            const unit = m === 'calories' ? '' : (m === 'sodium' ? 'mg' : 'g');
            const decimals = m === 'calories' ? 0 : 1;
            return '<tr style="border-bottom:1px solid var(--border);">' +
              '<td style="padding:10px 4px;">' + t('nut_' + m) + '</td>' +
              '<td style="text-align:end;padding:10px 4px;font-weight:600;font-family:var(--font-mono);">' + PCD.fmtNumber(perServing[m], decimals) + unit + '</td>' +
              '<td style="text-align:end;padding:10px 4px;color:var(--text-3);font-family:var(--font-mono);">' + PCD.fmtNumber(n.totals[m], decimals) + unit + '</td>' +
            '</tr>';
          }).join('')}
        </tbody>
      </table>

      ${n.hasMissing ? '<div class="text-sm mt-3" style="color:var(--warning);">⚠️ ' + PCD.escapeHtml(t('nut_partial_warning') || 'Some ingredients have no nutrition data. Results are partial.') + '</div>' : ''}
    `;

    PCD.modal.open({
      title: r.name, body: body, size: 'md', closable: true, footer: ''
    });
  }

  // ============ INGREDIENT NUTRITION EDITOR ============
  function openIngNutritionEditor() {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      const aHas = a.nutrition ? 1 : 0, bHas = b.nutrition ? 1 : 0;
      if (aHas !== bHas) return aHas - bHas;
      return (a.name || '').localeCompare(b.name || '');
    });

    const body = PCD.el('div');
    body.innerHTML = '<div class="text-muted text-sm mb-3">' + t('nut_enter_values') + '</div><div id="nutIngList"></div>';
    const host = PCD.$('#nutIngList', body);

    function renderList() {
      PCD.clear(host);
      ings.forEach(function (ing) {
        const nut = ing.nutrition || {};
        const row = PCD.el('div', { class: 'card', style: { padding: '12px', marginBottom: '8px' }, 'data-iid': ing.id });
        row.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div style="font-weight:600;">${PCD.escapeHtml(ing.name)}</div>
            ${ing.nutrition ? '<span class="chip chip-success" style="font-size:10px;">set</span>' : '<span class="chip" style="font-size:10px;">empty</span>'}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(90px, 1fr));gap:6px;">
            ${MACROS.map(function (m) {
              const unit = m === 'calories' ? '' : (m === 'sodium' ? 'mg' : 'g');
              return '<div>' +
                '<label class="text-xs text-muted" style="font-weight:600;">' + t('nut_' + m) + (unit ? ' (' + unit + ')' : '') + '</label>' +
                '<input type="number" class="input" data-nut="' + m + '" value="' + (nut[m] != null ? nut[m] : '') + '" step="0.1" min="0" style="padding:6px 8px;min-height:32px;font-size:13px;">' +
              '</div>';
            }).join('')}
          </div>
          <div class="text-muted text-sm mt-2" style="font-size:11px;">${t('nut_per_100g')}</div>
        `;
        host.appendChild(row);
      });
      // wire auto-save
      PCD.on(host, 'input', '[data-nut]', PCD.debounce(function () {
        const iid = this.closest('[data-iid]').getAttribute('data-iid');
        const key = this.getAttribute('data-nut');
        const ing = PCD.store.getIngredient(iid);
        if (!ing) return;
        if (!ing.nutrition) ing.nutrition = { per: 100 };
        const v = this.value;
        ing.nutrition[key] = v === '' ? 0 : parseFloat(v);
        PCD.store.upsertIngredient(ing);
      }, 400));
    }
    renderList();

    const closeBtn = PCD.el('button', { class: 'btn btn-primary', text: t('done') });
    const footer = PCD.el('div', { style: { display: 'flex', justifyContent: 'end', width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({
      title: t('nut_edit_ingredient'), body: body, footer: footer, size: 'md', closable: true,
    });
    closeBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'nutrition') render_list(v);
      }, 250);
    });
  }

  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.nutrition = { render: render, computeRecipeNutrition: computeRecipeNutrition };
})();
