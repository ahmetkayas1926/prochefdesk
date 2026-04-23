/* ================================================================
   ProChefDesk — allergens.js
   Allergen matrix across all recipes (14 EU allergens).
   Auto-detects from ingredient names, allows manual tagging.
   Printable report.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes();
    const ings = PCD.store.listIngredients();
    const ALLERGENS = PCD.allergensDB.list;

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
      let html = '<div class="text-muted text-sm mb-3">' + t('allerg_auto_detect') + '. Click to override.</div>';
      html += '<div style="max-height:60vh;overflow-y:auto;">';
      ings.forEach(function (ing) {
        const current = ing.allergens && ing.allergens.length ? ing.allergens : PCD.allergensDB.autoDetect(ing.name);
        const isAuto = !ing.allergens || !ing.allergens.length;
        html += '<div class="list-item" style="min-height:auto;padding:10px;margin-bottom:6px;display:flex;flex-direction:column;align-items:stretch;" data-iid="' + ing.id + '">';
        html += '<div class="flex items-center justify-between mb-2"><div style="font-weight:600;">' + PCD.escapeHtml(ing.name) + '</div>';
        if (isAuto && current.length) html += '<span class="chip" style="font-size:10px;">auto</span>';
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
        // If ing has no explicit allergens array yet, initialize from auto-detect
        let current = (ing.allergens && ing.allergens.length) ? ing.allergens : PCD.allergensDB.autoDetect(ing.name);
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
    printBtn.addEventListener('click', function () { window.print(); });
  }

  function render_list(view) { render(view); }

  PCD.tools = PCD.tools || {};
  PCD.tools.allergens = { render: render };
})();
