/* ================================================================
   ProChefDesk — mise.js (v2.8.74)
   ----------------------------------------------------------------
   MISE EN PLACE PLANNER

   Sabah 08:00 senaryosu: şef açar → "bugün hangi prep'leri ne sırayla
   yapacağım?" Tek ekran cevap.

   Veri kaynakları:
   - Events (selected date'te aktif olanlar) — recipe + portion bilgisi
   - Buffets (selected date'te servis edilenler) — sub-recipe ingredient'ları
   - Manuel eklemeler (chef "bugün ekstra stok da yap" tipi)

   Tek sihirli adım: flattenIngredients (v2.8.69 helper) ile tüm
   sub-recipe satırları gerçek ingredient seviyesine açılır. Şef
   "labneh 3 kg" görmez; "yogurt 5 kg, salt 100 g" görür.

   Prep ordering: standart kitchen workflow sıralaması:
   1. Stocks & bases (ilk başlar, en uzun)
   2. Sauces & dressings (stoklardan sonra)
   3. Protein portion & marinade (servisten 2-3 saat önce)
   4. Vegetable & garnish prep (servisten 1 saat önce)
   5. Beverage / cold setup (servis anında)

   Recipe kategorilerine göre auto-assign. Şef manuel re-order yapabilir.

   Storage: local-only IDB (`misePlans` table). Cloud sync sonraki round.

   v2.9.6 — NAKED→RICH upgrade: closeable inline guide, progress status
   chip, empty state CTA buttons. Pattern: buffet v2.8.77, nutrition
   v2.9.3, allergens v2.9.5.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.9.6 — Progress status (visual signal for completion state)
  function miseProgressStatus(donePct) {
    if (donePct >= 100) return 'complete';
    if (donePct >= 50) return 'almost';
    if (donePct > 0) return 'progress';
    return 'start';
  }
  function miseProgressColor(s) {
    if (s === 'complete') return '#16a34a';
    if (s === 'almost') return '#f59e0b';
    if (s === 'progress') return '#3b82f6';
    return '#6b7280';
  }
  function miseProgressLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'complete') return t('mise_status_complete') || 'Complete';
    if (s === 'almost') return t('mise_status_almost') || 'Almost done';
    if (s === 'progress') return t('mise_status_progress') || 'In progress';
    return t('mise_status_start') || 'Just started';
  }

  // Recipe category → mise en place sırası (1=ilk, 5=son)
  const PREP_ORDER = {
    cat_soup:      1,  // stocks, broths
    cat_main:      3,  // protein portion
    cat_appetizer: 4,  // cold/garnish
    cat_salad:     4,
    cat_side:      4,
    cat_dessert:   5,  // genelde önceden hazır
    cat_breakfast: 2,  // bakery, sauces
    cat_drink:     5,
    cat_other:     3,
  };

  // Phase labels for grouping
  const PHASES = [
    { id: 1, labelKey: 'mise_phase_stocks',  icon: 'thermometer', color: '#ef4444' },
    { id: 2, labelKey: 'mise_phase_sauces',  icon: 'activity',    color: '#f59e0b' },
    { id: 3, labelKey: 'mise_phase_protein', icon: 'check-square',color: '#dc2626' },
    { id: 4, labelKey: 'mise_phase_garnish', icon: 'carrot',      color: '#16a34a' },
    { id: 5, labelKey: 'mise_phase_final',   icon: 'clock',       color: '#3b82f6' },
  ];

  // ---------- IDB STORAGE ----------

  function readPlans() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('misePlans') || {};
    if (Array.isArray(root)) return root;
    return root[wsId] || [];
  }
  function writePlans(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('misePlans') || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    next[wsId] = arr;
    PCD.store.set('misePlans', next);
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function getPlanForDate(d) {
    return readPlans().find(function (p) { return p.date === d; }) || null;
  }
  function upsertPlan(p) {
    const all = readPlans().slice();
    const i = all.findIndex(function (x) { return x.date === p.date; });
    if (i >= 0) all[i] = Object.assign({}, p, { updatedAt: new Date().toISOString() });
    else all.push(Object.assign({}, p, { id: PCD.uid('mp'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    writePlans(all);
    return p;
  }

  // ---------- AUTO-PREP COMPUTATION ----------

  // Pulls all events on date + buffets on date, expands all recipes
  // via flattenIngredients, groups by phase.
  function computeAutoPrep(date) {
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();

    // Events on date
    const events = (PCD.store.listTable ? PCD.store.listTable('events') : []) || [];
    const todaysEvents = events.filter(function (e) {
      return e.date === date && e.status !== 'cancelled' && e.status !== 'done';
    });

    // Buffets on date
    const allBuffets = (function () {
      const wsId = PCD.store.getActiveWorkspaceId();
      const root = PCD.store._read('buffets') || {};
      if (Array.isArray(root)) return root;
      return root[wsId] || [];
    })();
    const todaysBuffets = allBuffets.filter(function (b) { return b.serviceDate === date; });

    // Build list of "demands": { recipe, portions, source }
    const demands = [];
    todaysEvents.forEach(function (e) {
      (e.recipes || []).forEach(function (rid) {
        const r = recipeMap[rid];
        if (r) demands.push({ recipe: r, portions: e.guestCount || r.servings || 1, source: 'event:' + (e.name || e.id) });
      });
    });
    todaysBuffets.forEach(function (b) {
      (b.stations || []).forEach(function (st) {
        (st.items || []).forEach(function (it) {
          const r = it.recipeId ? recipeMap[it.recipeId] : null;
          if (!r) return;
          // For buffets, the "prep amount" = covers × per_guest × refill — but
          // we represent it as a "portion equivalent" using yieldAmount as basis.
          const refillX = b.refillMultiplier != null ? Number(b.refillMultiplier) : 1.25;
          const prepAmount = (b.coverCount || 0) * (Number(it.amountPerGuest) || 0) * refillX;
          const yieldAmt = Number(r.yieldAmount) || Number(r.servings) || 1;
          const portionEquiv = yieldAmt > 0 ? prepAmount / yieldAmt : 1;
          demands.push({ recipe: r, portions: portionEquiv, source: 'buffet:' + (b.name || b.id) });
        });
      });
    });

    // Aggregate recipes — if same recipe appears in multiple events/buffets,
    // sum portions so the chef does the prep once.
    const recipeTotals = {};
    demands.forEach(function (d) {
      if (!recipeTotals[d.recipe.id]) {
        recipeTotals[d.recipe.id] = { recipe: d.recipe, portions: 0, sources: [] };
      }
      recipeTotals[d.recipe.id].portions += d.portions;
      if (recipeTotals[d.recipe.id].sources.indexOf(d.source) < 0) {
        recipeTotals[d.recipe.id].sources.push(d.source);
      }
    });

    // Build prep items: one row per recipe, with computed prep amount.
    // For sub-recipes (preps): "make X kg/L of this sub-recipe"
    // For menu items: "portion X covers worth of this dish"
    const prepItems = [];
    Object.values(recipeTotals).forEach(function (rt) {
      const r = rt.recipe;
      const isPrep = PCD.recipes.isPrep ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
      const phase = PREP_ORDER[r.category] || 3;
      let totalAmount, unit;
      if (isPrep) {
        // Sub-recipe: prep amount = yield × portion count
        const yieldAmt = Number(r.yieldAmount) || 1;
        totalAmount = yieldAmt * rt.portions;
        unit = r.yieldUnit || 'portion';
      } else {
        // Menu item: prep N covers
        totalAmount = Math.ceil(rt.portions);
        unit = 'portion' + (totalAmount === 1 ? '' : 's');
      }
      prepItems.push({
        id: PCD.uid('mi'),
        recipeId: r.id,
        recipeName: r.name,
        category: r.category || 'cat_other',
        isPrep: isPrep,
        phase: phase,
        amount: totalAmount,
        unit: unit,
        portions: rt.portions,
        sources: rt.sources,
        estimateMinutes: estimatePrepTime(r, rt.portions),
        done: false,
      });
    });

    // Sort by phase, then by recipe name
    prepItems.sort(function (a, b) {
      if (a.phase !== b.phase) return a.phase - b.phase;
      return (a.recipeName || '').localeCompare(b.recipeName || '');
    });

    return {
      date: date,
      eventCount: todaysEvents.length,
      buffetCount: todaysBuffets.length,
      items: prepItems,
    };
  }

  // Naive prep time estimator: prep_time × scale factor (capped)
  function estimatePrepTime(recipe, portions) {
    const baseMin = Number(recipe.prepTime) || 15;
    // Scaling isn't linear (parallel work) — apply diminishing factor
    const scale = Math.max(1, portions);
    const factor = 1 + Math.log(scale) / 2;
    return Math.round(baseMin * factor);
  }

  // ---------- RENDER ----------

  function render(view) {
    const t = PCD.i18n.t;
    let selectedDate = todayIso();
    let plan = getPlanForDate(selectedDate);
    let autoPrep = null;
    let displayItems = [];  // either plan.items or auto-generated

    function refresh() {
      plan = getPlanForDate(selectedDate);
      if (plan && plan.items && plan.items.length) {
        autoPrep = null;
        displayItems = plan.items;
      } else {
        autoPrep = computeAutoPrep(selectedDate);
        displayItems = autoPrep.items;
      }
      paint();
    }

    function paint() {
      // Group by phase
      const byPhase = {};
      displayItems.forEach(function (it) {
        if (!byPhase[it.phase]) byPhase[it.phase] = [];
        byPhase[it.phase].push(it);
      });
      const doneCount = displayItems.filter(function (it) { return it.done; }).length;
      const totalMin = displayItems.reduce(function (s, it) { return s + (it.estimateMinutes || 0); }, 0);
      const remainingMin = displayItems.filter(function (it) { return !it.done; }).reduce(function (s, it) { return s + (it.estimateMinutes || 0); }, 0);

      // v2.9.6 — Progress status (visual signal)
      const donePct = displayItems.length > 0 ? (doneCount / displayItems.length) * 100 : 0;
      const progStatus = displayItems.length > 0 ? miseProgressStatus(donePct) : null;
      const progColor = progStatus ? miseProgressColor(progStatus) : '#6b7280';

      // v2.9.6 — Closeable inline guide
      const guideHidden = (function () {
        try { return localStorage.getItem('pcd_mise_guide_hidden') === '1'; } catch (e) { return false; }
      })();

      let phaseHtml = '';
      PHASES.forEach(function (ph) {
        const items = byPhase[ph.id] || [];
        if (!items.length) return;
        let itemsHtml = '';
        items.forEach(function (it) {
          const sourcesStr = (it.sources || []).map(function (s) {
            const parts = s.split(':');
            const kind = parts[0]; const name = parts.slice(1).join(':');
            const tag = kind === 'event' ? '📅' : (kind === 'buffet' ? '🥘' : '➕');
            return tag + ' ' + PCD.escapeHtml(name);
          }).join(' · ');
          itemsHtml +=
            '<label class="card" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm);background:' + (it.done ? 'var(--surface-2)' : 'var(--surface)') + ';margin-bottom:6px;cursor:pointer;opacity:' + (it.done ? '0.6' : '1') + ';">' +
              '<input type="checkbox" data-mp-done="' + it.id + '" ' + (it.done ? 'checked' : '') + ' style="margin-top:2px;flex-shrink:0;width:18px;height:18px;accent-color:var(--brand-600);">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:600;font-size:14px;' + (it.done ? 'text-decoration:line-through;' : '') + '">' + PCD.escapeHtml(it.recipeName) + (it.isPrep ? ' <span class="chip" style="background:var(--brand-50);color:var(--brand-700);font-size:9px;font-weight:700;padding:2px 6px;text-transform:uppercase;letter-spacing:0.04em;">prep</span>' : '') + '</div>' +
                '<div class="text-muted text-sm" style="font-size:12px;margin-top:2px;">' +
                  '<strong style="color:' + ph.color + ';">' + PCD.fmtNumber(it.amount) + ' ' + PCD.escapeHtml(it.unit) + '</strong>' +
                  (it.estimateMinutes ? ' · ~' + it.estimateMinutes + ' ' + (t('mise_min_short') || 'min') : '') +
                  (sourcesStr ? '<div style="margin-top:2px;color:var(--text-3);font-size:11px;">' + sourcesStr + '</div>' : '') +
                '</div>' +
              '</div>' +
            '</label>';
        });
        phaseHtml +=
          '<div style="margin-bottom:18px;">' +
            '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1.5px solid ' + ph.color + '33;margin-bottom:8px;">' +
              '<span style="color:' + ph.color + ';">' + PCD.icon(ph.icon, 16) + '</span>' +
              '<span style="font-size:12px;font-weight:700;color:' + ph.color + ';text-transform:uppercase;letter-spacing:0.06em;">' + PCD.escapeHtml(t(ph.labelKey) || ph.id) + '</span>' +
              '<span class="text-muted text-sm" style="margin-inline-start:auto;font-size:11px;">' + items.length + '</span>' +
            '</div>' +
            itemsHtml +
          '</div>';
      });

      view.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <div class="page-title">${t('mise_title') || 'Mise en Place'}</div>
            <div class="page-subtitle">${t('mise_subtitle') || 'Today’s prep plan, auto-built from your events and buffets'}</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-outline btn-sm" id="misePrintBtn">${PCD.icon('print', 14)} ${t('mise_print') || 'Print'}</button>
            <button class="btn btn-outline btn-sm" id="miseRebuildBtn" title="${PCD.escapeHtml(t('mise_rebuild_tip') || 'Rebuild from events + buffets (clears check marks)')}">${PCD.icon('refresh', 14)} ${t('mise_rebuild') || 'Rebuild'}</button>
          </div>
        </div>

        ${!guideHidden ? `
          <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
            <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
              <span style="font-size:16px;">💡</span>
              <span style="flex:1;">${PCD.escapeHtml(t('mise_guide_title') || 'How to use Mise en Place Planner')}</span>
              <button type="button" id="miseGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('mise_guide_dismiss') || 'Hide')}">✕</button>
            </summary>
            <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
              <ol style="margin:0;padding-inline-start:20px;">
                <li><strong>${PCD.escapeHtml(t('mise_guide_step1_title') || 'Pick the date')}</strong> — ${PCD.escapeHtml(t('mise_guide_step1_body') || 'Choose today (default) or any service date. The tool reads your events + buffets scheduled for that date and builds the prep list automatically.')}</li>
                <li><strong>${PCD.escapeHtml(t('mise_guide_step2_title') || 'Auto-grouped by phase')}</strong> — ${PCD.escapeHtml(t('mise_guide_step2_body') || 'Sub-recipes flatten to real prep tasks, grouped into 5 kitchen phases (Stocks → Sauces → Protein → Garnish → Final). Same recipe across multiple events aggregates — you prep once.')}</li>
                <li><strong>${PCD.escapeHtml(t('mise_guide_step3_title') || 'Check off as you go')}</strong> — ${PCD.escapeHtml(t('mise_guide_step3_body') || 'Tap a row to mark done. Progress + remaining time update live. Your check-marks persist across reloads — pick up where you left off.')}</li>
                <li><strong>${PCD.escapeHtml(t('mise_guide_step4_title') || 'Print or rebuild')}</strong> — ${PCD.escapeHtml(t('mise_guide_step4_body') || 'Print A4 for the kitchen wall. If events/buffets changed after you started checking, hit Rebuild to refresh (clears check marks).')}</li>
              </ol>
              <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
                <strong>💎 ${PCD.escapeHtml(t('mise_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('mise_guide_tip_body') || 'Open this at 8am with coffee. Skim the phase order — Stocks first, Final last — and you have your whole shift mapped before service.')}
              </div>
            </div>
          </details>
        ` : ''}

        <div class="card mb-3" style="padding:14px;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <label class="field-label" style="font-size:11px;">${t('mise_date_label') || 'Date'}</label>
              <input type="date" class="input" id="miseDate" value="${selectedDate}" style="max-width:200px;">
            </div>
            <div style="padding:0 14px;border-left:1px solid var(--border);">
              <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;font-weight:700;font-size:10px;">${t('mise_progress') || 'Progress'}</div>
              <div style="display:flex;align-items:baseline;gap:8px;">
                <div style="font-size:24px;font-weight:900;color:${progColor};line-height:1;">${doneCount}/${displayItems.length}</div>
                ${progStatus ? `<span style="padding:2px 8px;background:${progColor}25;color:${progColor};font-weight:700;font-size:10px;text-transform:uppercase;border-radius:5px;letter-spacing:0.06em;">${PCD.escapeHtml(miseProgressLabel(progStatus))}</span>` : ''}
              </div>
            </div>
            <div style="text-align:center;padding:0 14px;border-left:1px solid var(--border);">
              <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;font-weight:700;font-size:10px;">${t('mise_remaining') || 'Remaining'}</div>
              <div style="font-size:20px;font-weight:800;">~${remainingMin}m</div>
            </div>
            <div style="text-align:center;padding:0 14px;border-left:1px solid var(--border);">
              <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;font-weight:700;font-size:10px;">${t('mise_total_time') || 'Total time'}</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-3);">~${totalMin}m</div>
            </div>
          </div>
        </div>

        ${displayItems.length === 0 ? `
          <div class="empty">
            <div class="empty-icon">🥄</div>
            <div class="empty-title">${PCD.escapeHtml(t('mise_empty_title') || 'No prep needed today')}</div>
            <div class="empty-desc">${PCD.escapeHtml(t('mise_empty_desc') || 'No events or buffets scheduled for this date. Schedule one in Events or Buffet Planner, then come back here.')}</div>
            <div class="empty-action" style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <button class="btn btn-primary" data-mise-go="events">${PCD.escapeHtml(t('mise_go_events') || 'Go to Events')}</button>
              <button class="btn btn-outline" data-mise-go="buffet">${PCD.escapeHtml(t('mise_go_buffet') || 'Go to Buffet Planner')}</button>
            </div>
          </div>
        ` : '<div id="misePhasesList">' + phaseHtml + '</div>'}
      `;

      // Guide dismiss handler
      const dismissBtn = PCD.$('#miseGuideDismiss', view);
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { localStorage.setItem('pcd_mise_guide_hidden', '1'); } catch (er) {}
          paint();
        });
      }

      // Empty state navigation
      PCD.on(view, 'click', '[data-mise-go]', function () {
        const target = this.getAttribute('data-mise-go');
        if (target === 'events') PCD.router.go('events');
        else if (target === 'buffet') PCD.router.go('buffet');
      });

      const dateInp = PCD.$('#miseDate', view);
      if (dateInp) dateInp.addEventListener('change', function () { selectedDate = this.value; refresh(); });

      PCD.$('#miseRebuildBtn', view).addEventListener('click', function () {
        PCD.modal.confirm({
          icon: '🔄', iconKind: 'warning',
          title: t('mise_rebuild_confirm_title') || 'Rebuild prep list?',
          text: t('mise_rebuild_confirm_body') || 'This will rebuild from current events + buffets and clear all check marks.',
          okText: t('mise_rebuild') || 'Rebuild',
        }).then(function (ok) {
          if (!ok) return;
          // Remove saved plan for this date — refresh will regenerate
          const all = readPlans().filter(function (p) { return p.date !== selectedDate; });
          writePlans(all);
          refresh();
        });
      });

      PCD.$('#misePrintBtn', view).addEventListener('click', function () {
        printPrepList(selectedDate, displayItems);
      });

      PCD.on(view, 'change', '[data-mp-done]', function () {
        const id = this.getAttribute('data-mp-done');
        const item = displayItems.find(function (it) { return it.id === id; });
        if (!item) return;
        item.done = this.checked;
        // Persist current state as plan
        upsertPlan({ date: selectedDate, items: displayItems });
        refresh();
      });
    }

    refresh();
  }

  // ---------- PRINT ----------

  function printPrepList(date, items) {
    const t = PCD.i18n.t;
    let rowsHtml = '';
    let currentPhase = null;
    items.forEach(function (it) {
      if (it.phase !== currentPhase) {
        currentPhase = it.phase;
        const ph = PHASES.find(function (p) { return p.id === currentPhase; });
        const phLabel = ph ? (PCD.i18n.t(ph.labelKey) || ('Phase ' + currentPhase)) : ('Phase ' + currentPhase);
        rowsHtml += '<tr><td colspan="4" style="background:' + (ph ? ph.color : '#666') + '20;color:' + (ph ? ph.color : '#666') + ';font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:6px 8px;font-size:10pt;">' + PCD.escapeHtml(phLabel) + '</td></tr>';
      }
      rowsHtml +=
        '<tr>' +
          '<td style="text-align:center;color:#999;width:30px;">☐</td>' +
          '<td>' + PCD.escapeHtml(it.recipeName) + (it.isPrep ? ' <span style="background:#dcfce7;color:#166534;font-size:8pt;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:0.04em;">prep</span>' : '') + '</td>' +
          '<td style="text-align:right;font-weight:700;color:#16a34a;white-space:nowrap;">' + PCD.fmtNumber(it.amount) + ' ' + PCD.escapeHtml(it.unit) + '</td>' +
          '<td style="text-align:right;color:#666;width:60px;">~' + (it.estimateMinutes || 0) + ' min</td>' +
        '</tr>';
    });

    const dateStr = PCD.fmtDate(date);
    const totalMin = items.reduce(function (s, it) { return s + (it.estimateMinutes || 0); }, 0);
    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }' +
        '.hdr { border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; display:flex;justify-content:space-between;align-items:baseline; }' +
        '.hdr h1 { margin: 0; font-size: 18pt; color: #16a34a; }' +
        '.hdr .meta { font-size: 10pt; color: #666; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 11pt; }' +
        'th, td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; }' +
        'th { background: #f5f5f4; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }' +
      '</style>' +
      '<div class="hdr">' +
        '<h1>Mise en Place — ' + PCD.escapeHtml(dateStr) + '</h1>' +
        '<div class="meta">' + items.length + ' tasks · ~' + totalMin + ' min total</div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th style="width:30px;">✓</th><th>Item</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Est.</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';

    PCD.print(html, 'Mise en Place — ' + dateStr);
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.mise = { render: render };
})();
