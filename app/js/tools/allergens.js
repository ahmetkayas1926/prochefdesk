/* ================================================================
   ProChefDesk — allergens.js
   Allergen matrix across all recipes (14 EU allergens).
   Auto-detects from ingredient names, allows manual tagging.
   Printable report.

   v2.9.5 — NAKED→RICH upgrade: closeable inline guide, coverage stats
   hero (ingredients tagged %), secondary metrics (allergen-free recipes,
   flagged recipes). Pattern: buffet v2.8.77, nutrition v2.9.3.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.9.5 — Coverage status helpers (ingredient tag completeness)
  function tagCoverageStatus(pct) {
    if (pct >= 100) return 'complete';
    if (pct >= 80) return 'mostly';
    if (pct >= 50) return 'half';
    return 'limited';
  }
  function tagCoverageColor(s) {
    if (s === 'complete' || s === 'mostly') return '#16a34a';
    if (s === 'half') return '#f59e0b';
    return '#dc2626';
  }
  function tagCoverageLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'complete') return t('allerg_status_complete') || 'Fully reviewed';
    if (s === 'mostly') return t('allerg_status_mostly') || 'Mostly reviewed';
    if (s === 'half') return t('allerg_status_half') || 'In progress';
    return t('allerg_status_limited') || 'Just started';
  }

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const ALLERGENS = PCD.allergensDB.list;

    // v2.9.5 — Coverage stats for hero
    const taggedCount = ings.filter(function (i) { return i.allergens && i.allergens.length > 0; }).length;
    const coveragePct = ings.length > 0 ? (taggedCount / ings.length) * 100 : 0;
    const covStatus = ings.length > 0 ? tagCoverageStatus(coveragePct) : null;
    const covColor = covStatus ? tagCoverageColor(covStatus) : '#6b7280';

    // Allergen-free vs flagged recipe split
    let allergenFreeCount = 0;
    let flaggedCount = 0;
    recipes.forEach(function (r) {
      const arr = PCD.allergensDB.recipeAllergens(r, ings);
      if (arr.length === 0) allergenFreeCount++;
      else flaggedCount++;
    });

    // v2.9.5 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_allergens_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('allergens_title')}</div>
          <div class="page-subtitle">${t('allergens_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline" id="tagIngBtn">${t('allerg_tag_ingredient')}</button>
          ${recipes.length > 0 ? '<button class="btn btn-primary" id="printBtn">' + PCD.icon('print', 16) + ' ' + t('allerg_print') + '</button>' : ''}
        </div>
      </div>

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('allerg_guide_title') || 'How to build a reliable allergen matrix')}</span>
            <button type="button" id="allergGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('allerg_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('allerg_guide_step1_title') || 'Tag each ingredient')}</strong> — ${PCD.escapeHtml(t('allerg_guide_step1_body') || 'Open Tag Ingredient and walk through your library. For each ingredient toggle the EU 14 allergens that apply. No auto-detect on purpose — keyword matching gives false positives that ruin trust.')}</li>
              <li><strong>${PCD.escapeHtml(t('allerg_guide_step2_title') || 'Recipes auto-aggregate')}</strong> — ${PCD.escapeHtml(t('allerg_guide_step2_body') || 'The matrix below sums up each recipe’s allergens from its tagged ingredients. Sub-recipes cascade — a marinade with mustard flags any main dish using it.')}</li>
              <li><strong>${PCD.escapeHtml(t('allerg_guide_step3_title') || 'Scan the matrix')}</strong> — ${PCD.escapeHtml(t('allerg_guide_step3_body') || 'Rows = recipes, columns = 14 allergens. Filled cell = present. Bottom totals show how many recipes flag each allergen — useful for menu balance.')}</li>
              <li><strong>${PCD.escapeHtml(t('allerg_guide_step4_title') || 'Print for staff + compliance')}</strong> — ${PCD.escapeHtml(t('allerg_guide_step4_body') || 'Print the matrix as a A4 PDF. Pin it in the kitchen for front-of-house. Required reference under EU FIC 1169/2011 + UK Natasha’s Law.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('allerg_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('allerg_guide_tip_body') || 'When you onboard a new supplier, ask for their allergen statement in writing. One supplier change can silently introduce sesame or sulphites — always re-tag the affected ingredient.')}
            </div>
          </div>
        </details>
      ` : ''}

      ${ings.length > 0 ? `
        <div class="stat mb-3" style="background:linear-gradient(135deg,${covColor}18,var(--surface));border-color:${covColor};padding:18px;">
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('allerg_coverage') || 'Tag coverage')}</div>
              <div style="font-size:42px;font-weight:900;color:${covColor};line-height:1;letter-spacing:-0.02em;">${Math.round(coveragePct)}<span style="font-size:24px;">%</span></div>
            </div>
            <div style="flex:1;min-width:180px;">
              <span style="display:inline-block;padding:4px 10px;background:${covColor}25;color:${covColor};font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">${PCD.escapeHtml(tagCoverageLabel(covStatus))}</span>
              <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">${taggedCount} / ${ings.length} ${PCD.escapeHtml(t('allerg_ings_tagged') || 'ingredients tagged')}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('allerg_recipe_clean') || 'Allergen-free')}</div><div style="font-size:18px;font-weight:700;color:var(--success);">${allergenFreeCount}</div></div>
            <div><div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('allerg_with_allergens') || 'With allergens')}</div><div style="font-size:18px;font-weight:700;color:var(--text-2);">${flaggedCount}</div></div>
          </div>
        </div>
      ` : ''}

      <div class="card mb-3" style="background:var(--info-bg);border-color:var(--info);padding:12px;">
        <div class="text-sm" style="color:var(--info);font-weight:500;line-height:1.5;">
          ℹ️ ${t('allerg_legal_note')}
        </div>
      </div>

      ${recipes.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">${t('no_recipes_yet')}</div>
          <div class="empty-desc">${t('no_recipes_yet_desc')}</div>
        </div>
      ` : '<div id="matrixContent"></div>'}
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#allergGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_allergens_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    if (recipes.length === 0) {
      PCD.$('#tagIngBtn', view).addEventListener('click', openIngTagger);
      return;
    }

    renderMatrix(PCD.$('#matrixContent', view), recipes, ings);

    PCD.$('#tagIngBtn', view).addEventListener('click', openIngTagger);
    PCD.$('#printBtn', view).addEventListener('click', function () {
      openPrintView(recipes, ings);
    });
  }

  function renderMatrix(host, recipes, ings) {
    const t = PCD.i18n.t;
    const ALLERGENS = PCD.allergensDB.list;

    // Build recipe × allergen matrix
    const recipeAllergens = {};
    recipes.forEach(function (r) {
      recipeAllergens[r.id] = PCD.allergensDB.recipeAllergens(r, ings);
    });

    // Column totals
    const colCount = {};
    ALLERGENS.forEach(function (a) { colCount[a.key] = 0; });
    Object.values(recipeAllergens).forEach(function (arr) {
      arr.forEach(function (k) { if (colCount[k] !== undefined) colCount[k]++; });
    });

    // Build table
    let head = '<th style="position:sticky;left:0;background:var(--surface-2);z-index:2;padding:10px;min-width:180px;border-right:1px solid var(--border);text-align:start;">' + t('recipe') + '</th>';
    ALLERGENS.forEach(function (a) {
      head += '<th style="padding:8px 4px;min-width:54px;border-bottom:1px solid var(--border);font-size:11px;">' +
        '<div style="font-size:18px;line-height:1;">' + a.icon + '</div>' +
        '<div style="font-size:10px;font-weight:600;color:var(--text-3);margin-top:4px;">' + t('allerg_' + a.key).split(' ').slice(0, 2).join(' ') + '</div>' +
      '</th>';
    });

    let body = '';
    recipes.forEach(function (r) {
      const allergens = recipeAllergens[r.id];
      body += '<tr>';
      body += '<td style="position:sticky;left:0;background:var(--surface);z-index:1;padding:10px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</td>';
      ALLERGENS.forEach(function (a) {
        const has = allergens.indexOf(a.key) >= 0;
        body += '<td style="text-align:center;padding:10px 4px;border-bottom:1px solid var(--border);">' +
          (has ? '<span style="font-size:18px;">' + a.icon + '</span>' : '<span style="color:var(--surface-3);">—</span>') +
        '</td>';
      });
      body += '</tr>';
    });

    // Footer totals row
    let foot = '<tr style="background:var(--surface-2);font-weight:700;">';
    foot += '<td style="position:sticky;left:0;background:var(--surface-2);padding:10px;border-right:1px solid var(--border);font-size:12px;text-transform:uppercase;color:var(--text-3);letter-spacing:0.04em;">Total</td>';
    ALLERGENS.forEach(function (a) {
      foot += '<td style="text-align:center;padding:8px 4px;font-size:13px;color:' + (colCount[a.key] > 0 ? 'var(--brand-700)' : 'var(--text-3)') + ';">' + colCount[a.key] + '</td>';
    });
    foot += '</tr>';

    host.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}${foot}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============ INGREDIENT TAGGER ============
  function openIngTagger() {
    const t = PCD.i18n.t;
    const ALLERGENS = PCD.allergensDB.list;
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    const body = PCD.el('div');

    function render() {
      // v2.8.37 — Auto-detect kaldırıldı (operatör spec'i: keyword matching
      // %100 doğruluk imkansız, yanlış işaretler güveni bozuyor — manuel kalsın).
      let html = '<div class="text-muted text-sm mb-3">' + t('allerg_manual_intro') + '</div>';
      html += '<div style="max-height:60vh;overflow-y:auto;">';
      ings.forEach(function (ing) {
        const current = (ing.allergens && ing.allergens.length) ? ing.allergens : [];
        html += '<div class="list-item" style="min-height:auto;padding:10px;margin-bottom:6px;display:flex;flex-direction:column;align-items:stretch;" data-iid="' + ing.id + '">';
        html += '<div class="flex items-center justify-between mb-2"><div style="font-weight:600;">' + PCD.escapeHtml(ing.name) + '</div>';
        html += '</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
        ALLERGENS.forEach(function (a) {
          const on = current.indexOf(a.key) >= 0;
          html += '<button type="button" class="chip' + (on ? ' chip-brand' : '') + '" data-toggle="' + a.key + '" style="cursor:pointer;padding:4px 8px;font-size:11px;">' +
            a.icon + ' ' + t('allerg_' + a.key).split(' ')[0] +
          '</button>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      body.innerHTML = html;

      PCD.on(body, 'click', '[data-toggle]', function () {
        const key = this.getAttribute('data-toggle');
        const iid = this.closest('[data-iid]').getAttribute('data-iid');
        const ing = PCD.store.getIngredient(iid);
        if (!ing) return;
        let current = (ing.allergens && ing.allergens.length) ? ing.allergens.slice() : [];
        const idx = current.indexOf(key);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(key);
        ing.allergens = current;
        PCD.store.upsertIngredient(ing);
        this.classList.toggle('chip-brand');
      });
    }

    render();

    const closeBtn = PCD.el('button', { class: 'btn btn-primary', text: PCD.i18n.t('done') });
    const footer = PCD.el('div', { style: { width: '100%', display: 'flex', justifyContent: 'end' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({
      title: t('allerg_tag_ingredient'),
      body: body, footer: footer, size: 'md', closable: true,
    });
    closeBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'allergens') render_list(v);
      }, 250);
    });
  }

  // ============ PRINT VIEW ============
  function openPrintView(recipes, ings) {
    const t = PCD.i18n.t;
    const ALLERGENS = PCD.allergensDB.list;

    let html = '<div class="print-wrap"><div class="print-page"><div style="padding:10mm;">';
    html += '<h1 style="font-size:22pt;font-weight:800;margin:0 0 4px;letter-spacing:-0.01em;">' + t('allergens_title') + '</h1>';
    html += '<div style="font-size:10pt;color:#666;margin-bottom:8mm;">' + t('allergens_subtitle') + ' · ' + PCD.fmtDate(new Date()) + '</div>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:9pt;">';
    html += '<thead><tr><th style="text-align:left;padding:6px;border-bottom:2px solid #000;">' + t('recipe') + '</th>';
    ALLERGENS.forEach(function (a) {
      html += '<th style="text-align:center;padding:6px;border-bottom:2px solid #000;font-size:8pt;">' + a.icon + '<br>' + t('allerg_' + a.key).split(' ')[0] + '</th>';
    });
    html += '</tr></thead><tbody>';
    recipes.forEach(function (r) {
      const allergens = PCD.allergensDB.recipeAllergens(r, ings);
      html += '<tr><td style="padding:6px;border-bottom:1px solid #ccc;font-weight:600;">' + PCD.escapeHtml(r.name) + '</td>';
      ALLERGENS.forEach(function (a) {
        const has = allergens.indexOf(a.key) >= 0;
        html += '<td style="text-align:center;padding:6px;border-bottom:1px solid #ccc;">' + (has ? '●' : '') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<div style="font-size:8pt;color:#999;margin-top:8mm;font-style:italic;">' + t('allerg_legal_note') + '</div>';
    html += '</div></div></div>';

    const body = PCD.el('div');
    body.innerHTML = html;

    const printBtn = PCD.el('button', { class: 'btn btn-primary' });
    printBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + t('print') + '</span>';
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: t('allerg_report'),
      body: body, footer: footer, size: 'xl', closable: true,
    });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      // v2.9.24 — standardize on PCD.print (footer auto-inject, window 1200px).
      // Previously fell back to window.print() which violated single-print-path rule.
      const wrap = body.querySelector('.print-wrap');
      PCD.print(wrap ? wrap.innerHTML : body.innerHTML, t('allerg_report'));
    });
  }

  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.allergens = { render: render };
})();
