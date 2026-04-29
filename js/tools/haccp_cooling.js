/* ================================================================
   ProChefDesk — haccp_cooling.js
   HACCP Forms · Cook & Cool Log (v2.6.21)

   Event-based log: each food item that gets cooked then cooled is
   one record. Tracks the cooking endpoint temp and 4 cooling
   checkpoints over the FDA 6-hour cooling window:
     - End of cooking (target ≥60°C / 135°F)
     - 2 hours later (must be ≤21°C / 70°F — KEY HACCP GATE)
     - 4 hours later
     - 6 hours later (must be ≤5°C / 41°F — DONE)

   Screen: list view, newest first. Active events float to the top
   with a "what's the next checkpoint?" hint.
   Print: filtered date range, multi-page A4 landscape, each event
   = 1 row.

   Storage tables (workspace-bound):
   - haccpCookCool — { id, foodName, quantity, quantityUnit,
                       cookEndAt, cookEndTemp,
                       checkpoints: [{at, temp}],
                       endedAt, endedTemp,
                       correctiveAction, chef, status }
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'haccpCookCool';

  // HACCP cooling targets (FDA Food Code 2017)
  const TARGET_2H_C = 21;   // 70°F
  const TARGET_6H_C = 5;    // 41°F
  const TOTAL_WINDOW_MS = 6 * 60 * 60 * 1000;
  const STAGE_2H_MS    = 2 * 60 * 60 * 1000;

  function getTempUnit() {
    const pref = PCD.store && PCD.store.get && PCD.store.get('prefs.haccpTempUnit');
    return pref === 'F' ? 'F' : 'C';
  }
  function ctoF(c) { return Math.round((c * 9 / 5 + 32) * 10) / 10; }
  function fmtTemp(c) {
    if (c === null || c === undefined || c === '') return '—';
    const u = getTempUnit();
    if (u === 'F') return ctoF(c) + '°F';
    return c + '°C';
  }
  function targetForUI(c) {
    return getTempUnit() === 'F' ? ctoF(c) + '°F' : c + '°C';
  }

  // ============ DATA ============
  function listAll() {
    return (PCD.store.listTable(TABLE) || []).slice().sort(function (a, b) {
      return (b.cookEndAt || '').localeCompare(a.cookEndAt || '');
    });
  }
  function listActive() {
    return listAll().filter(function (r) { return !r.endedAt; });
  }
  function listCompleted() {
    return listAll().filter(function (r) { return !!r.endedAt; });
  }

  // Event status: 'on-track', 'warning' (close to limit), 'failed', 'done'
  function statusFor(r) {
    if (r.endedAt) {
      // Final check: did it reach 5°C within 6 hours?
      const totalMs = new Date(r.endedAt) - new Date(r.cookEndAt);
      if (r.endedTemp > TARGET_6H_C) return 'failed';
      if (totalMs > TOTAL_WINDOW_MS) return 'failed';
      // Also check 2h gate via checkpoints
      const cp2h = (r.checkpoints || []).find(function (c) {
        return new Date(c.at) - new Date(r.cookEndAt) >= STAGE_2H_MS - 60000 // ±1 min tolerance
            && new Date(c.at) - new Date(r.cookEndAt) <= STAGE_2H_MS + 30 * 60000; // 2h..2.5h window
      });
      if (cp2h && cp2h.temp > TARGET_2H_C) return 'failed';
      return 'done';
    }
    // Active
    const elapsed = Date.now() - new Date(r.cookEndAt);
    if (elapsed > TOTAL_WINDOW_MS) return 'failed';
    // Check latest checkpoint
    const latest = (r.checkpoints || [])[((r.checkpoints || []).length - 1)];
    if (latest) {
      const sinceCook = new Date(latest.at) - new Date(r.cookEndAt);
      if (sinceCook >= STAGE_2H_MS && latest.temp > TARGET_2H_C) return 'warning';
    }
    return 'on-track';
  }

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const active = listActive();
    const completed = listCompleted().slice(0, 90); // last 90 days roughly
    const u = getTempUnit();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌡 ' + (t('hcc_title') || 'Cook & Cool Log') + '</div>' +
          '<div class="page-subtitle">' + (t('hcc_subtitle') || 'HACCP cooling: 60°C → 21°C in 2h → 5°C in 6h total') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-primary btn-sm" id="hccNewEventBtn">' + PCD.icon('plus', 16) + ' <span>' + (t('hcc_new_event') || 'New cook') + '</span></button>' +
          (completed.length > 0 ? '<button class="btn btn-outline btn-sm" id="hccPrintBtn">' + PCD.icon('print', 16) + ' <span>' + (t('print') || 'Print/PDF') + '</span></button>' : '') +
        '</div>' +
      '</div>';

    // === Active events (sticky at top) ===
    if (active.length > 0) {
      const activeWrap = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', background: 'var(--brand-50)', border: '1px solid var(--brand-300)' } });
      activeWrap.innerHTML =
        '<div style="font-size:11px;font-weight:700;color:var(--brand-700);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">' +
          (t('hcc_active') || 'Active cooling') + ' (' + active.length + ')' +
        '</div>';
      active.forEach(function (r) {
        const card = buildEventCard(r, t, true);
        activeWrap.appendChild(card);
      });
      view.appendChild(activeWrap);
    }

    // === Completed events list ===
    if (completed.length === 0 && active.length === 0) {
      const empty = PCD.el('div', { class: 'card', style: { padding: '48px 24px', textAlign: 'center', marginTop: '20px' } });
      empty.innerHTML =
        '<div style="font-size:48px;margin-bottom:12px;">🌡</div>' +
        '<div style="font-weight:700;font-size:18px;margin-bottom:6px;">' + PCD.escapeHtml(t('hcc_empty_title') || 'No cook & cool records yet') + '</div>' +
        '<div class="text-muted" style="font-size:14px;line-height:1.6;max-width:480px;margin:0 auto 18px;">' + PCD.escapeHtml(t('hcc_empty_msg') || 'Track every batch you cook and cool — soup, stock, chicken, rice. HACCP requires recording the temperature drop within 6 hours.') + '</div>' +
        '<button class="btn btn-primary" id="hccEmptyAddBtn">' + PCD.icon('plus', 16) + ' <span>' + PCD.escapeHtml(t('hcc_first_event') || 'Start first event') + '</span></button>';
      view.appendChild(empty);
      const handler = function () { openEventEditor(null, function () { render(view); }); };
      PCD.$('#hccNewEventBtn', view).addEventListener('click', handler);
      const emptyAdd = PCD.$('#hccEmptyAddBtn', view);
      if (emptyAdd) emptyAdd.addEventListener('click', handler);
      return;
    }

    if (completed.length > 0) {
      const histTitle = PCD.el('div', { style: { padding: '12px 4px 6px', fontSize: '11px', fontWeight: '700', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' } });
      histTitle.textContent = (t('hcc_history') || 'History') + ' · ' + completed.length;
      view.appendChild(histTitle);
      const histWrap = PCD.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      completed.forEach(function (r) {
        const card = buildEventCard(r, t, false);
        histWrap.appendChild(card);
      });
      view.appendChild(histWrap);
    }

    // Wire up
    PCD.$('#hccNewEventBtn', view).addEventListener('click', function () {
      openEventEditor(null, function () { render(view); });
    });
    const printBtn = PCD.$('#hccPrintBtn', view);
    if (printBtn) printBtn.addEventListener('click', function () { openPrintDateRange(); });

    // Click on any event card → open editor
    PCD.on(view, 'click', '[data-hcc-id]', function () {
      const id = this.getAttribute('data-hcc-id');
      openEventEditor(id, function () { render(view); });
    });
  }

  function buildEventCard(r, t, isActive) {
    const status = statusFor(r);
    const colors = {
      'on-track': { bg: '#fff', icon: '⏱', color: 'var(--brand-700)' },
      'warning':  { bg: '#fef3c7', icon: '⚠',  color: '#92400e' },
      'failed':   { bg: '#fef2f2', icon: '✗',  color: '#991b1b' },
      'done':     { bg: '#fff',    icon: '✓',  color: 'var(--success, #16a34a)' },
    };
    const c = colors[status] || colors['on-track'];

    const card = PCD.el('div', {
      class: 'card card-hover',
      'data-hcc-id': r.id,
      style: { padding: '12px 14px', cursor: 'pointer', background: c.bg, marginBottom: '6px' }
    });

    // Build progress / status line
    let progressStr = '';
    if (r.endedAt) {
      const totalMs = new Date(r.endedAt) - new Date(r.cookEndAt);
      const totalH = (totalMs / (60 * 60 * 1000)).toFixed(1);
      progressStr = (t('hcc_completed_in') || 'Completed in') + ' ' + totalH + 'h · ' + fmtTemp(r.endedTemp);
    } else {
      const elapsed = Date.now() - new Date(r.cookEndAt);
      const elapsedH = (elapsed / (60 * 60 * 1000)).toFixed(1);
      const remaining = (TOTAL_WINDOW_MS - elapsed) / (60 * 60 * 1000);
      const cps = (r.checkpoints || []).length;
      if (remaining > 0) {
        progressStr = (t('hcc_in_progress') || 'In progress') + ' · ' +
          elapsedH + 'h · ' + cps + ' ' + (t('hcc_checkpoints') || 'checkpoints');
      } else {
        progressStr = (t('hcc_overdue') || 'Overdue') + ' · ' + elapsedH + 'h';
      }
    }

    const startDate = new Date(r.cookEndAt);
    const dateStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                    ' · ' + startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:' + c.color + '22;color:' + c.color + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">' + c.icon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.foodName || '?') + '</div>' +
          '<div class="text-muted" style="font-size:12px;margin-top:2px;">' +
            (r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') + ' · ' : '') +
            PCD.escapeHtml(dateStr) + ' · <span style="color:' + c.color + ';font-weight:600;">' + PCD.escapeHtml(progressStr) + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="color:var(--text-3);">›</div>' +
      '</div>';

    return card;
  }

  // ============ EVENT EDITOR ============
  // Single modal that handles: create new, view existing, add checkpoint, complete.
  function openEventEditor(id, onClose) {
    const t = PCD.i18n.t;
    let event = id ? PCD.store.getFromTable(TABLE, id) : null;
    const isNew = !event;
    if (isNew) {
      event = {
        foodName: '',
        quantity: '',
        quantityUnit: '',
        cookEndAt: null,
        cookEndTemp: null,
        checkpoints: [],
        endedAt: null,
        endedTemp: null,
        correctiveAction: '',
        chef: '',
      };
    }

    const body = PCD.el('div');

    function paint() {
      const u = getTempUnit();
      const target2h = targetForUI(TARGET_2H_C);
      const target6h = targetForUI(TARGET_6H_C);

      if (!event.cookEndAt) {
        // === STEP 1: Cooking just finished — record start ===
        body.innerHTML =
          '<div style="background:var(--surface-2);padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:12px;line-height:1.5;color:var(--text-2);">' +
            '🔥 ' + PCD.escapeHtml(t('hcc_step1_intro') || 'Step 1: Record what you just finished cooking. Cooling will start now.') +
          '</div>' +
          '<div style="margin-bottom:12px;">' +
            '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_food_name') || 'Food / batch name') + '</label>' +
            '<input id="hccFood" type="text" maxlength="80" placeholder="' + PCD.escapeHtml(t('hcc_food_placeholder') || 'e.g. Tomato soup, chicken thighs, rice') + '" value="' + PCD.escapeHtml(event.foodName || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
            '<div style="flex:1.2;">' +
              '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_quantity') || 'Quantity') + '</label>' +
              '<input id="hccQty" type="text" maxlength="20" placeholder="' + PCD.escapeHtml(t('hcc_quantity_placeholder') || 'e.g. 5') + '" value="' + PCD.escapeHtml(event.quantity || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
            '</div>' +
            '<div style="flex:1;">' +
              '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_unit') || 'Unit') + '</label>' +
              '<input id="hccQtyU" type="text" maxlength="10" placeholder="' + PCD.escapeHtml(t('hcc_unit_placeholder') || 'L / kg / pcs') + '" value="' + PCD.escapeHtml(event.quantityUnit || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
            '</div>' +
          '</div>' +
          '<div style="margin-bottom:8px;">' +
            '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_cook_end_temp') || 'Temperature now') + ' (°' + u + ')</label>' +
            '<input id="hccTemp" type="number" step="0.1" placeholder="60" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:18px;font-weight:600;box-sizing:border-box;text-align:center;">' +
          '</div>' +
          '<div class="text-muted" style="font-size:11px;line-height:1.5;padding:8px 10px;background:var(--surface-2);border-radius:6px;">ℹ️ ' +
            PCD.escapeHtml(t('hcc_cook_end_tip') || 'HACCP: cooking should end at 60°C+ (135°F+). Record it as you start cooling.') +
          '</div>';
      } else {
        // === STEP 2+: Active or completed event ===
        const startDate = new Date(event.cookEndAt);
        const elapsedMs = Date.now() - startDate;
        const elapsedH = elapsedMs / (60 * 60 * 1000);
        const remainingH = Math.max(0, (TOTAL_WINDOW_MS - elapsedMs) / (60 * 60 * 1000));

        let summaryHtml =
          '<div style="background:var(--surface-2);padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;line-height:1.5;">' +
            '<div style="font-weight:700;margin-bottom:2px;">' + PCD.escapeHtml(event.foodName || '?') +
              (event.quantity ? ' · ' + PCD.escapeHtml(event.quantity) + (event.quantityUnit ? ' ' + PCD.escapeHtml(event.quantityUnit) : '') : '') +
            '</div>' +
            '<div class="text-muted" style="font-size:11px;">' +
              PCD.escapeHtml(t('hcc_cooking_done_at') || 'Cooking ended') + ': ' + startDate.toLocaleString() + ' · ' + fmtTemp(event.cookEndTemp) +
            '</div>' +
          '</div>';

        // Status indicator
        const status = statusFor(event);
        if (!event.endedAt) {
          const stColors = { 'on-track': '#16a34a', 'warning': '#f59e0b', 'failed': '#dc2626' };
          const stLabels = {
            'on-track': t('hcc_st_ontrack') || 'On track',
            'warning':  t('hcc_st_warning') || 'Behind target',
            'failed':   t('hcc_st_failed')  || 'Out of safe window',
          };
          summaryHtml +=
            '<div style="padding:10px 12px;border-radius:8px;background:' + stColors[status] + '15;color:' + stColors[status] + ';font-size:13px;font-weight:600;margin-bottom:12px;">' +
              stLabels[status] + ' · ' + elapsedH.toFixed(1) + 'h ' + (t('hcc_elapsed') || 'elapsed') + ' · ' +
              (remainingH > 0 ? remainingH.toFixed(1) + 'h ' + (t('hcc_left') || 'left') : (t('hcc_window_closed') || 'window closed')) +
            '</div>';
        } else {
          summaryHtml +=
            '<div style="padding:10px 12px;border-radius:8px;background:' + (status === 'done' ? '#16a34a15' : '#dc262615') + ';color:' + (status === 'done' ? '#16a34a' : '#dc2626') + ';font-size:13px;font-weight:600;margin-bottom:12px;">' +
              (status === 'done' ? '✓ ' + (t('hcc_passed') || 'Passed') : '✗ ' + (t('hcc_failed_label') || 'Failed')) +
            '</div>';
        }

        // Checkpoints list
        let cpHtml = '<div style="margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);margin-bottom:6px;">' +
            (t('hcc_checkpoints') || 'Checkpoints') +
          '</div>';

        // Show cook end as first row
        cpHtml += buildCheckpointRow(t('hcc_cook_end') || 'Cook end', startDate, event.cookEndTemp, '🔥', null);

        // Then user checkpoints
        (event.checkpoints || []).forEach(function (cp, idx) {
          const cpDate = new Date(cp.at);
          const sinceCookH = (cpDate - startDate) / (60 * 60 * 1000);
          let target = null;
          if (sinceCookH >= 1.5 && sinceCookH <= 2.5) target = TARGET_2H_C;
          cpHtml += buildCheckpointRow('+' + sinceCookH.toFixed(1) + 'h', cpDate, cp.temp, '🌡', target);
        });

        // End point if completed
        if (event.endedAt) {
          const endDate = new Date(event.endedAt);
          const sinceCookH = (endDate - startDate) / (60 * 60 * 1000);
          cpHtml += buildCheckpointRow((t('hcc_final') || 'Final') + ' (+' + sinceCookH.toFixed(1) + 'h)', endDate, event.endedTemp, '✓', TARGET_6H_C);
        }

        cpHtml += '</div>';
        summaryHtml += cpHtml;

        // If active, show "add checkpoint" inputs
        if (!event.endedAt) {
          summaryHtml +=
            '<div style="border:2px dashed var(--brand-300);padding:12px;border-radius:8px;margin-bottom:12px;background:var(--brand-50);">' +
              '<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--brand-700);margin-bottom:8px;">' +
                (t('hcc_add_checkpoint') || 'Add checkpoint') +
              '</div>' +
              '<div style="margin-bottom:8px;">' +
                '<label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:3px;">' + PCD.escapeHtml(t('hcc_temp_now') || 'Current temperature') + ' (°' + u + ')</label>' +
                '<input id="hccCpTemp" type="number" step="0.1" placeholder="' + target2h + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:16px;font-weight:600;box-sizing:border-box;text-align:center;">' +
              '</div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button id="hccAddCpBtn" class="btn btn-outline btn-sm" style="flex:1;">' + (t('hcc_save_checkpoint') || 'Save checkpoint') + '</button>' +
                '<button id="hccCompleteBtn" class="btn btn-primary btn-sm" style="flex:1;">' + (t('hcc_complete') || 'Complete (final)') + '</button>' +
              '</div>' +
              '<div class="text-muted" style="font-size:11px;line-height:1.5;margin-top:8px;">' +
                '🎯 ' + PCD.escapeHtml(t('hcc_target_2h') || '2h target') + ': ' + target2h + ' · ' +
                '🎯 ' + PCD.escapeHtml(t('hcc_target_6h') || '6h target') + ': ' + target6h +
              '</div>' +
            '</div>';
        }

        // Corrective action / note (always editable)
        summaryHtml +=
          '<div style="margin-bottom:8px;">' +
            '<label style="display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:13px;margin-bottom:4px;">' +
              '<span>' + PCD.escapeHtml(t('hcc_corrective_action') || 'Corrective action / note') + '</span>' +
              '<span style="font-weight:400;font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('optional') || 'optional') + '</span>' +
            '</label>' +
            '<textarea id="hccNote" rows="2" maxlength="400" placeholder="' + PCD.escapeHtml(t('hcc_note_placeholder') || 'e.g. Used ice bath, switched to shallow trays at 14:30') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + PCD.escapeHtml(event.correctiveAction || '') + '</textarea>' +
          '</div>';

        body.innerHTML = summaryHtml;

        // Wire up active inputs
        if (!event.endedAt) {
          setTimeout(function () {
            const addBtn = body.querySelector('#hccAddCpBtn');
            const compBtn = body.querySelector('#hccCompleteBtn');
            if (addBtn) addBtn.addEventListener('click', function () {
              const temp = parseFloat(body.querySelector('#hccCpTemp').value);
              if (isNaN(temp)) { PCD.toast.error(t('haccp_value_required') || 'Enter a temperature value'); return; }
              event.checkpoints = (event.checkpoints || []).concat([{ at: new Date().toISOString(), temp: temp }]);
              event.correctiveAction = body.querySelector('#hccNote').value.trim();
              persist();
              paint();
            });
            if (compBtn) compBtn.addEventListener('click', function () {
              const temp = parseFloat(body.querySelector('#hccCpTemp').value);
              if (isNaN(temp)) { PCD.toast.error(t('haccp_value_required') || 'Enter a temperature value'); return; }
              event.endedAt = new Date().toISOString();
              event.endedTemp = temp;
              event.correctiveAction = body.querySelector('#hccNote').value.trim();
              persist();
              paint();
            });
          }, 50);
        }
      }
    }

    function persist() {
      const user = PCD.store.get('user') || {};
      if (!event.chef) event.chef = user.name || user.email || '';
      const saved = PCD.store.upsertInTable(TABLE, event, 'cce');
      if (saved && saved.id) event.id = saved.id;
    }

    paint();

    // Footer buttons
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close'), style: { flex: '1' } });
    const startBtn = PCD.el('button', { class: 'btn btn-primary', text: t('hcc_start') || 'Start cooling', style: { flex: '2' } });
    const deleteBtn = !isNew ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Delete', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    if (!event.cookEndAt) footer.appendChild(startBtn);

    const m = PCD.modal.open({
      title: '🌡 ' + (isNew ? (t('hcc_new_event') || 'New cook') : PCD.escapeHtml(event.foodName || (t('hcc_event') || 'Event'))),
      body: body, footer: footer, size: 'md', closable: true,
    });
    closeBtn.addEventListener('click', function () { m.close(); if (onClose) onClose(); });
    startBtn.addEventListener('click', function () {
      const food = body.querySelector('#hccFood').value.trim();
      const qty = body.querySelector('#hccQty').value.trim();
      const qtyU = body.querySelector('#hccQtyU').value.trim();
      const temp = parseFloat(body.querySelector('#hccTemp').value);
      if (!food) { PCD.toast.error(t('hcc_food_required') || 'Food name required'); return; }
      if (isNaN(temp)) { PCD.toast.error(t('haccp_value_required') || 'Enter a temperature value'); return; }
      event.foodName = food;
      event.quantity = qty;
      event.quantityUnit = qtyU;
      event.cookEndAt = new Date().toISOString();
      event.cookEndTemp = temp;
      persist();
      paint();
    });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('hcc_delete_title') || 'Delete this record?',
        text: t('hcc_delete_msg') || 'This permanently removes the cook & cool record.',
        okText: t('act_delete') || 'Delete',
      }).then(function (ok) {
        if (!ok) return;
        if (event.id) PCD.store.deleteFromTable(TABLE, event.id);
        PCD.toast.success(t('hcc_deleted') || 'Record deleted');
        m.close();
        if (onClose) onClose();
      });
    });
  }

  function buildCheckpointRow(label, date, temp, icon, targetC) {
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    let badge = '';
    if (targetC !== null && temp !== null && temp !== undefined) {
      const meets = temp <= targetC;
      const color = meets ? '#16a34a' : '#dc2626';
      const sym = meets ? '✓' : '✗';
      badge = '<span style="margin-inline-start:6px;font-size:11px;font-weight:700;color:' + color + ';">' + sym + ' ' + (t_('hcc_target') || 'target') + ' ' + targetForUI(targetC) + '</span>';
    }
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid var(--border);font-size:13px;">' +
      '<div style="width:24px;text-align:center;">' + icon + '</div>' +
      '<div style="flex:1;color:var(--text-3);font-size:11px;">' + PCD.escapeHtml(label) + ' · ' + time + '</div>' +
      '<div style="font-weight:700;">' + fmtTemp(temp) + badge + '</div>' +
    '</div>';
  }
  // Tiny t() shim used inside buildCheckpointRow (which doesn't have closure t)
  function t_(k) { return PCD.i18n && PCD.i18n.t ? PCD.i18n.t(k) : k; }

  // ============ PRINT ============
  function openPrintDateRange() {
    const t = PCD.i18n.t;
    const completed = listCompleted();
    if (completed.length === 0) { PCD.toast.info(t('hcc_no_records_to_print') || 'No completed records to print'); return; }

    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm" style="margin-bottom:14px;">' +
        PCD.escapeHtml(t('hcc_print_intro') || 'Choose a date range. The PDF will list one row per cook & cool event.') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:3px;">' + PCD.escapeHtml(t('from') || 'From') + '</label>' +
          '<input id="hccFrom" type="date" value="' + fmt(monthAgo) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:3px;">' + PCD.escapeHtml(t('to') || 'To') + '</label>' +
          '<input id="hccTo" type="date" value="' + fmt(today) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
      '</div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { flex: '1' } });
    const printBtn = PCD.el('button', { class: 'btn btn-primary', text: t('print') || 'Print/PDF', style: { flex: '2' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: '🖨 ' + (t('hcc_print_title') || 'Print Cook & Cool Log'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      const from = body.querySelector('#hccFrom').value;
      const to = body.querySelector('#hccTo').value;
      m.close();
      printRange(from, to);
    });
  }

  function printRange(fromYmd, toYmd) {
    const completed = listCompleted();
    const fromMs = new Date(fromYmd + 'T00:00:00').getTime();
    const toMs = new Date(toYmd + 'T23:59:59').getTime();
    const filtered = completed.filter(function (r) {
      const t = new Date(r.cookEndAt).getTime();
      return t >= fromMs && t <= toMs;
    }).sort(function (a, b) {
      return (a.cookEndAt || '').localeCompare(b.cookEndAt || '');
    });

    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';
    const u = getTempUnit();

    let html =
      '<style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:0;}' +
        '.h-head{margin-bottom:6px;border-bottom:2px solid #16a34a;padding-bottom:4px;}' +
        '.h-head h1{margin:0;font-size:14px;}' +
        '.h-head .sub{font-size:9px;color:#555;margin-top:1px;}' +
        'table.h-grid{width:100%;border-collapse:collapse;font-size:9px;}' +
        'table.h-grid th, table.h-grid td{border:1px solid #999;padding:3px 4px;text-align:center;vertical-align:middle;}' +
        'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:8px;}' +
        'table.h-grid td.food{text-align:left;font-weight:600;}' +
        'table.h-grid td.fail{background:#fee2e2;color:#991b1b;font-weight:700;}' +
        'table.h-grid td.note{text-align:left;font-size:8px;}' +
        '.h-foot{margin-top:6px;text-align:center;font-size:7px;color:#999;}' +
        '.pcd-print-footer{display:none !important;}' +
        '@page{size:A4 landscape;margin:7mm;}' +
      '</style>' +
      '<div class="h-head">' +
        '<h1>HACCP · Cook & Cool Log</h1>' +
        '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(fromYmd) + ' – ' + PCD.escapeHtml(toYmd) + ' · ' + filtered.length + ' records · °' + u + '</div>' +
      '</div>' +
      '<table class="h-grid"><thead><tr>' +
        '<th>Date</th>' +
        '<th>Food / Batch</th>' +
        '<th>Qty</th>' +
        '<th>Cook end</th>' +
        '<th>+1h</th>' +
        '<th>+2h<br>(≤' + targetForUI(TARGET_2H_C) + ')</th>' +
        '<th>+3h</th>' +
        '<th>+4h</th>' +
        '<th>End<br>(≤' + targetForUI(TARGET_6H_C) + ')</th>' +
        '<th>Total<br>(h)</th>' +
        '<th>Corrective action</th>' +
        '<th>Chef</th>' +
      '</tr></thead><tbody>';

    function findCpAtHour(r, hour, tolerance) {
      tolerance = tolerance || 0.6; // half-hour either side
      const targetMs = new Date(r.cookEndAt).getTime() + hour * 60 * 60 * 1000;
      let best = null;
      let bestDelta = Infinity;
      (r.checkpoints || []).forEach(function (cp) {
        const d = Math.abs(new Date(cp.at).getTime() - targetMs);
        if (d < bestDelta && d <= tolerance * 60 * 60 * 1000) {
          best = cp; bestDelta = d;
        }
      });
      return best;
    }

    filtered.forEach(function (r) {
      const startDate = new Date(r.cookEndAt);
      const endDate = new Date(r.endedAt);
      const totalH = ((endDate - startDate) / (60 * 60 * 1000)).toFixed(1);
      const cp1 = findCpAtHour(r, 1);
      const cp2 = findCpAtHour(r, 2);
      const cp3 = findCpAtHour(r, 3);
      const cp4 = findCpAtHour(r, 4);
      const cell = function (cp, target) {
        if (!cp) return '<td>—</td>';
        const fail = (target !== undefined && cp.temp > target);
        return '<td class="' + (fail ? 'fail' : '') + '">' + (u === 'F' ? ctoF(cp.temp) : cp.temp) + '°</td>';
      };
      const endFail = r.endedTemp > TARGET_6H_C || (totalH * 1 > 6);
      html += '<tr>' +
        '<td>' + startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</td>' +
        '<td class="food">' + PCD.escapeHtml(r.foodName || '?') + '</td>' +
        '<td>' + (r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '—') + '</td>' +
        '<td>' + (u === 'F' ? ctoF(r.cookEndTemp) : r.cookEndTemp) + '° / ' + startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + '</td>' +
        cell(cp1) +
        cell(cp2, TARGET_2H_C) +
        cell(cp3) +
        cell(cp4) +
        '<td class="' + (endFail ? 'fail' : '') + '">' + (u === 'F' ? ctoF(r.endedTemp) : r.endedTemp) + '° / ' + endDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + '</td>' +
        '<td class="' + (totalH * 1 > 6 ? 'fail' : '') + '">' + totalH + '</td>' +
        '<td class="note">' + (r.correctiveAction ? PCD.escapeHtml(r.correctiveAction) : '—') + '</td>' +
        '<td>' + PCD.escapeHtml(r.chef || '') + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    html += '<div class="h-foot">Made with ProChefDesk · prochefdesk.com</div>';

    PCD.print(html, 'HACCP Cook & Cool Log');
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpCooling = {
    render: render,
    openEditor: function () {
      openEventEditor(null, function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'haccp_cooling') render(v);
      });
    },
  };
})();
