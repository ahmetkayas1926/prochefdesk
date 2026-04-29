/* ================================================================
   ProChefDesk — haccp_logs.js
   HACCP Forms · Fridge & Freezer Temperature Log

   Storage tables (workspace-bound):
   - haccpLogs      — separate logs per kitchen area
                      shape: { id, name, sortIndex }
   - haccpUnits     — refrigeration units, scoped to a log
                      shape: { id, logId, name, min, max, unit, sortIndex }
   - haccpReadings  — daily readings, scoped to a unit
                      shape: { id, unitId, date (YYYY-MM-DD),
                               morning: { value, time, chef, note } | null,
                               evening: { value, time, chef, note } | null }

   Multi-log support added in v2.6.4:
   - Workspace contains many logs ("Banquet Kitchen", "Italian Restaurant")
   - Each log has its own units and readings
   - Header has a log selector dropdown + log management menu
   - Existing data is migrated to a "Default" log on first run
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE_LOGS = 'haccpLogs';
  const TABLE_UNITS = 'haccpUnits';
  const TABLE_READINGS = 'haccpReadings';
  const PREF_CURRENT_LOG = 'prefs.haccpCurrentLogId';

  // ============ DEFAULT UNIT TEMPLATES ============
  // Used as suggestions when chef adds a new unit.
  // nameKey is resolved via i18n at render time so the chef sees the
  // preset name in their current language.
  const UNIT_PRESETS = [
    { type: 'fridge',      nameKey: 'haccp_preset_fridge',       min: 0,    max: 4 },
    { type: 'cooler',      nameKey: 'haccp_preset_cooler',       min: 0,    max: 4 },
    { type: 'freezer',     nameKey: 'haccp_preset_freezer',      min: -25,  max: -18 },
    { type: 'bar_fridge',  nameKey: 'haccp_preset_bar_fridge',   min: 0,    max: 4 },
    { type: 'display',     nameKey: 'haccp_preset_display',      min: 0,    max: 4 },
    { type: 'hot_holding', nameKey: 'haccp_preset_hot_holding',  min: 63,   max: 90 },
  ];

  // Default temperature unit per workspace ('C' or 'F').
  function getDefaultTempUnit() {
    const pref = PCD.store && PCD.store.get && PCD.store.get('prefs.haccpTempUnit');
    return pref === 'F' ? 'F' : 'C';
  }
  function setDefaultTempUnit(u) {
    PCD.store.set('prefs.haccpTempUnit', u === 'F' ? 'F' : 'C');
  }

  // ============ LOG HELPERS (v2.6.4) ============
  function listLogs() {
    return (PCD.store.listTable(TABLE_LOGS) || []).slice().sort(function (a, b) {
      const ai = (typeof a.sortIndex === 'number') ? a.sortIndex : 999999;
      const bi = (typeof b.sortIndex === 'number') ? b.sortIndex : 999999;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  // Migration + default-log bootstrap.
  // - If no logs exist, create a "Default" log.
  // - Any units without a logId get attached to the default log.
  // Runs every render — cheap, idempotent.
  function ensureDefaultLog() {
    let logs = listLogs();
    let defaultLog = null;

    if (logs.length === 0) {
      defaultLog = PCD.store.upsertInTable(TABLE_LOGS, {
        name: 'Default',
        sortIndex: 0,
      }, 'log');
      logs = [defaultLog];
    } else {
      defaultLog = logs[0];
    }

    // Backfill any orphan units (created before v2.6.4).
    const orphanUnits = (PCD.store.listTable(TABLE_UNITS) || []).filter(function (u) { return !u.logId; });
    if (orphanUnits.length > 0) {
      orphanUnits.forEach(function (u) {
        u.logId = defaultLog.id;
        PCD.store.upsertInTable(TABLE_UNITS, u, 'unit');
      });
    }

    return logs;
  }

  function getCurrentLogId() {
    const logs = listLogs();
    if (logs.length === 0) return null;
    const stored = PCD.store.get(PREF_CURRENT_LOG);
    if (stored && logs.some(function (l) { return l.id === stored; })) return stored;
    return logs[0].id;
  }
  function setCurrentLogId(logId) {
    PCD.store.set(PREF_CURRENT_LOG, logId);
  }

  function getCurrentLog() {
    const id = getCurrentLogId();
    if (!id) return null;
    return PCD.store.getFromTable(TABLE_LOGS, id);
  }

  // Cascade-delete a log: removes all units in the log, all readings for
  // those units, then the log itself.
  function deleteLogCascade(logId) {
    const allUnits = PCD.store.listTable(TABLE_UNITS) || [];
    const unitsToDelete = allUnits.filter(function (u) { return u.logId === logId; });
    const unitIds = unitsToDelete.map(function (u) { return u.id; });

    const allReadings = PCD.store.listTable(TABLE_READINGS) || [];
    allReadings.forEach(function (r) {
      if (unitIds.indexOf(r.unitId) >= 0) {
        PCD.store.deleteFromTable(TABLE_READINGS, r.id);
      }
    });
    unitsToDelete.forEach(function (u) {
      PCD.store.deleteFromTable(TABLE_UNITS, u.id);
    });
    PCD.store.deleteFromTable(TABLE_LOGS, logId);
  }

  // ============ DATA HELPERS ============
  function listUnits() {
    const logId = getCurrentLogId();
    return (PCD.store.listTable(TABLE_UNITS) || []).filter(function (u) {
      return u.logId === logId;
    }).slice().sort(function (a, b) {
      const ai = (typeof a.sortIndex === 'number') ? a.sortIndex : 999999;
      const bi = (typeof b.sortIndex === 'number') ? b.sortIndex : 999999;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  // Reading lookup is O(N) — fine for hundreds of readings (one row per
  // unit per day = 30 readings/month/unit = 90/month for 3 units = trivial).
  function listReadings() {
    return PCD.store.listTable(TABLE_READINGS) || [];
  }

  function findReading(unitId, dateStr) {
    return listReadings().find(function (r) {
      return r.unitId === unitId && r.date === dateStr;
    }) || null;
  }

  function saveReading(unitId, dateStr, shift, payload) {
    const existing = findReading(unitId, dateStr);
    const reading = existing || { unitId: unitId, date: dateStr };
    reading[shift] = payload;
    return PCD.store.upsertInTable(TABLE_READINGS, reading, 'rd');
  }

  // ============ DATE HELPERS ============
  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function daysInMonth(year, monthIdx0) {
    return new Date(year, monthIdx0 + 1, 0).getDate();
  }
  function monthLabel(year, monthIdx0) {
    return new Date(year, monthIdx0, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  // ============ VALIDATION ============
  function isOutOfRange(unit, value) {
    if (value === null || value === undefined || value === '') return false;
    const v = parseFloat(value);
    if (isNaN(v)) return false;
    if (typeof unit.min === 'number' && v < unit.min) return true;
    if (typeof unit.max === 'number' && v > unit.max) return true;
    return false;
  }

  // ============ MAIN RENDER ============
  // viewState: which month is currently displayed (sticky during navigation)
  let _viewYear = new Date().getFullYear();
  let _viewMonth = new Date().getMonth();

  function render(view) {
    const t = PCD.i18n.t;
    // Bootstrap default log + migrate any orphan units. Cheap, idempotent.
    ensureDefaultLog();
    const logs = listLogs();
    const currentLog = getCurrentLog();
    const units = listUnits();
    const tempUnit = getDefaultTempUnit();
    const days = daysInMonth(_viewYear, _viewMonth);

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌡 ' + (t('haccp_logs_title') || 'Fridge & Freezer Log') + '</div>' +
          '<div class="page-subtitle">' + (t('haccp_logs_subtitle') || 'Daily temperature monitoring · HACCP compliant records') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="haccpAddUnitBtn">' + PCD.icon('plus', 16) + ' <span>' + (t('haccp_add_unit') || 'Add unit') + '</span></button>' +
          (units.length > 0 ? '<button class="btn btn-outline btn-sm" id="haccpPrintBtn">' + PCD.icon('print', 16) + ' <span>' + (t('print') || 'Print/PDF') + '</span></button>' : '') +
        '</div>' +
      '</div>';

    // ===== Log selector (v2.6.4) =====
    // Always rendered. Lets the chef switch between separate logs
    // (e.g. "Banquet Kitchen" vs "Italian Restaurant") and manage them.
    const logSelector = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } });
    let logOptionsHtml = '';
    logs.forEach(function (l) {
      const sel = l.id === (currentLog && currentLog.id) ? ' selected' : '';
      logOptionsHtml += '<option value="' + l.id + '"' + sel + '>' + PCD.escapeHtml(l.name) + '</option>';
    });
    logSelector.innerHTML =
      '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;">' +
        PCD.escapeHtml(t('haccp_log') || 'Log') +
      '</div>' +
      '<select id="haccpLogSelect" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;">' +
        logOptionsHtml +
      '</select>' +
      '<button class="btn btn-outline btn-sm" id="haccpNewLogBtn" title="' + PCD.escapeHtml(t('haccp_new_log') || 'New log') + '">' + PCD.icon('plus', 16) + ' <span>' + PCD.escapeHtml(t('haccp_new_log') || 'New log') + '</span></button>' +
      (currentLog ? '<button class="btn btn-outline btn-sm" id="haccpLogMenuBtn" title="' + PCD.escapeHtml(t('more_actions') || 'More actions') + '">' + PCD.icon('more-vertical', 16) + '</button>' : '');
    view.appendChild(logSelector);

    // Wire up log selector
    PCD.$('#haccpLogSelect', view).addEventListener('change', function () {
      setCurrentLogId(this.value);
      render(view);
    });
    PCD.$('#haccpNewLogBtn', view).addEventListener('click', function () {
      openLogEditor(null, function (newLog) {
        if (newLog && newLog.id) setCurrentLogId(newLog.id);
        render(view);
      });
    });
    const logMenuBtn = PCD.$('#haccpLogMenuBtn', view);
    if (logMenuBtn) {
      logMenuBtn.addEventListener('click', function () {
        PCD.actionSheet({
          title: currentLog.name,
          actions: [
            { icon: 'edit', label: t('haccp_rename_log') || 'Rename log', onClick: function () {
              openLogEditor(currentLog.id, function () { render(view); });
            }},
            { icon: 'trash', label: t('haccp_delete_log') || 'Delete log', danger: true, onClick: function () {
              const otherLogs = logs.filter(function (l) { return l.id !== currentLog.id; });
              const unitCount = (PCD.store.listTable(TABLE_UNITS) || []).filter(function (u) { return u.logId === currentLog.id; }).length;
              PCD.modal.confirm({
                icon: '🗑', iconKind: 'danger', danger: true,
                title: t('haccp_delete_log_title') || 'Delete this log?',
                text: ((t('haccp_delete_log_msg') || 'This permanently deletes "{name}" along with its {count} unit(s) and all temperature readings. This cannot be undone.')
                  .replace('{name}', currentLog.name)
                  .replace('{count}', unitCount)),
                okText: t('act_delete') || 'Delete',
              }).then(function (ok) {
                if (!ok) return;
                deleteLogCascade(currentLog.id);
                // Switch to another log, or create a fresh default if none left.
                if (otherLogs.length > 0) {
                  setCurrentLogId(otherLogs[0].id);
                } else {
                  PCD.store.set(PREF_CURRENT_LOG, null);
                }
                PCD.toast.success(t('haccp_log_deleted') || 'Log deleted');
                render(view);
              });
            }},
          ],
        });
      });
    }

    if (units.length === 0) {
      const empty = PCD.el('div', { class: 'card', style: { padding: '48px 24px', textAlign: 'center', marginTop: '20px' } });
      empty.innerHTML =
        '<div style="font-size:48px;margin-bottom:12px;">🌡</div>' +
        '<div style="font-weight:700;font-size:18px;margin-bottom:6px;">' + PCD.escapeHtml(t('haccp_no_units_title') || 'Set up your refrigeration units') + '</div>' +
        '<div class="text-muted" style="font-size:14px;line-height:1.6;max-width:480px;margin:0 auto 18px;">' + PCD.escapeHtml(t('haccp_no_units_msg') || 'Add each fridge, freezer, walk-in cooler, or other temperature-controlled unit in your kitchen. You\'ll then log readings twice a day to maintain your HACCP records.') + '</div>' +
        '<button class="btn btn-primary" id="haccpEmptyAddBtn">' + PCD.icon('plus', 16) + ' <span>' + PCD.escapeHtml(t('haccp_add_first_unit') || 'Add first unit') + '</span></button>';
      view.appendChild(empty);
      const addBtn = PCD.$('#haccpAddUnitBtn', view);
      const emptyAdd = PCD.$('#haccpEmptyAddBtn', view);
      const handler = function () { openUnitEditor(null, function () { render(view); }); };
      if (addBtn) addBtn.addEventListener('click', handler);
      if (emptyAdd) emptyAdd.addEventListener('click', handler);
      return;
    }

    // Month navigator
    const monthNav = PCD.el('div', { class: 'card', style: { padding: '12px 16px', marginTop: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' } });
    monthNav.innerHTML =
      '<button class="btn btn-outline btn-sm" id="haccpPrevMonth" aria-label="' + PCD.escapeHtml(t('prev_month_aria')) + '">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;font-weight:700;font-size:16px;">' + PCD.escapeHtml(monthLabel(_viewYear, _viewMonth)) + '</div>' +
      '<button class="btn btn-outline btn-sm" id="haccpNextMonth" aria-label="' + PCD.escapeHtml(t('next_month_aria')) + '">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(monthNav);

    // Build the grid table.
    // Tight layout — fit as many units as possible on one page.
    // Day column: ~70px, each unit×shift cell: ~50px each (so 100px per unit).
    // ~6 units fit comfortably on a 1200px desktop / 8 fits on 1440px.
    // For mobile we wrap in a scroll container.
    const FIT_LIMIT = 6; // beyond this, the grid gets too tight on a single page
    const showFitWarning = units.length > FIT_LIMIT;
    if (showFitWarning) {
      const banner = PCD.el('div', {
        class: 'card',
        style: {
          padding: '10px 14px',
          marginTop: '10px',
          marginBottom: '12px',
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          color: '#92400e',
          fontSize: '12px',
          lineHeight: '1.5',
        }
      });
      banner.innerHTML = '⚠ ' + PCD.escapeHtml(t('haccp_too_many_units') ||
        'You have ' + units.length + ' units. The grid may feel tight on screen and on print. Multi-page layout is coming in a future update.');
      view.appendChild(banner);
    }

    const wrap = PCD.el('div', { class: 'card', style: { padding: '0', overflowX: 'auto' } });
    // Per-unit width: 100px (50 AM + 50 PM). Day column: 70px.
    const minW = 70 + units.length * 100;
    let table =
      '<table style="width:100%;min-width:' + minW + 'px;border-collapse:collapse;font-size:12px;">' +
        '<thead style="position:sticky;top:0;z-index:2;background:var(--surface-2);">' +
          '<tr>' +
            '<th style="padding:8px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface-2);z-index:3;width:70px;min-width:70px;">' +
              PCD.escapeHtml(t('haccp_col_day') || 'Day') +
            '</th>';
    units.forEach(function (u) {
      const range = (u.min !== undefined && u.max !== undefined)
        ? u.min + '–' + u.max + '°' + tempUnit
        : '—';
      table +=
        '<th colspan="2" style="padding:8px 4px;text-align:center;font-size:11px;font-weight:700;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' +
          '<div style="font-size:12px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(u.name) + '</div>' +
          '<div style="font-size:9px;font-weight:400;color:var(--text-3);text-transform:none;letter-spacing:0;margin-top:1px;">' + range + '</div>' +
        '</th>';
    });
    table += '</tr>' +
          '<tr style="background:var(--surface);">' +
            '<th style="padding:4px 8px;text-align:left;font-size:9px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:3;width:70px;min-width:70px;"></th>';
    units.forEach(function () {
      table +=
        '<th style="padding:4px 2px;text-align:center;font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:50px;">AM</th>' +
        '<th style="padding:4px 2px;text-align:center;font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);width:50px;">PM</th>';
    });
    table += '</tr></thead><tbody>';

    const todayStr = ymd(new Date());
    const readingsByKey = {}; // key = unitId|date
    listReadings().forEach(function (r) { readingsByKey[r.unitId + '|' + r.date] = r; });

    for (let d = 1; d <= days; d++) {
      const date = new Date(_viewYear, _viewMonth, d);
      const dateStr = ymd(date);
      const isToday = dateStr === todayStr;
      const isFuture = dateStr > todayStr;
      const dow = date.toLocaleDateString(undefined, { weekday: 'short' });
      const rowBg = isToday ? 'var(--brand-50)' : 'transparent';
      table += '<tr style="background:' + rowBg + ';">' +
        '<td style="padding:5px 8px;border-bottom:1px solid var(--border);font-weight:' + (isToday ? '700' : '500') + ';position:sticky;left:0;background:' + (isToday ? 'var(--brand-50)' : 'var(--surface)') + ';z-index:1;width:70px;min-width:70px;font-size:11px;">' +
          '<div>' + d + ' <span style="color:var(--text-3);font-weight:400;font-size:10px;">' + dow + '</span></div>' +
        '</td>';

      units.forEach(function (u) {
        const reading = readingsByKey[u.id + '|' + dateStr];
        ['morning', 'evening'].forEach(function (shift) {
          const r = reading && reading[shift];
          const cellStyle = 'padding:4px 2px;border-bottom:1px solid var(--border);text-align:center;cursor:' + (isFuture ? 'not-allowed' : 'pointer') + ';width:50px;' +
            (shift === 'morning' ? 'border-left:1px solid var(--border);' : '');
          let cellContent = '';
          if (r && r.value !== undefined && r.value !== null && r.value !== '') {
            const oor = isOutOfRange(u, r.value);
            const hasNote = !!r.note;
            cellContent =
              '<div style="display:inline-flex;align-items:center;gap:2px;font-weight:600;color:' + (oor ? '#dc2626' : 'var(--text-1)') + ';font-size:12px;">' +
                (oor ? '⚠' : '') +
                PCD.escapeHtml(String(r.value)) + '°' +
                (hasNote ? '<span title="Has note" style="color:var(--brand-600);font-size:9px;">📝</span>' : '') +
              '</div>';
          } else if (!isFuture) {
            cellContent = '<span style="color:var(--text-3);font-size:16px;font-weight:300;">+</span>';
          } else {
            cellContent = '<span style="color:var(--text-3);">·</span>';
          }
          table += '<td data-cell="' + u.id + '|' + dateStr + '|' + shift + '" style="' + cellStyle + '">' + cellContent + '</td>';
        });
      });
      table += '</tr>';
    }
    table += '</tbody></table>';
    wrap.innerHTML = table;
    view.appendChild(wrap);

    // Wire up
    PCD.$('#haccpAddUnitBtn', view).addEventListener('click', function () {
      openUnitEditor(null, function () { render(view); });
    });
    const printBtn = PCD.$('#haccpPrintBtn', view);
    if (printBtn) printBtn.addEventListener('click', function () { printMonth(_viewYear, _viewMonth); });
    PCD.$('#haccpPrevMonth', view).addEventListener('click', function () {
      _viewMonth--;
      if (_viewMonth < 0) { _viewMonth = 11; _viewYear--; }
      render(view);
    });
    PCD.$('#haccpNextMonth', view).addEventListener('click', function () {
      _viewMonth++;
      if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; }
      render(view);
    });

    // Cell click → reading editor
    PCD.on(view, 'click', '[data-cell]', function () {
      const parts = this.getAttribute('data-cell').split('|');
      const unitId = parts[0];
      const dateStr = parts[1];
      const shift = parts[2];
      // Block editing future dates.
      if (dateStr > todayStr) {
        PCD.toast.info(t('haccp_no_future') || 'Cannot log a reading for a future date');
        return;
      }
      openReadingEditor(unitId, dateStr, shift, function () { render(view); });
    });

    // Long-press on unit header → edit/delete unit
    PCD.on(view, 'click', '[data-edit-unit]', function (e) {
      e.stopPropagation();
      const uid = this.getAttribute('data-edit-unit');
      openUnitEditor(uid, function () { render(view); });
    });
  }

  // ============ LOG EDITOR (v2.6.4) ============
  // Create or rename a log. Delete is handled separately via confirm modal
  // because it requires cascade-delete warnings.
  function openLogEditor(logId, onClose) {
    const t = PCD.i18n.t;
    const existing = logId ? PCD.store.getFromTable(TABLE_LOGS, logId) : null;

    const body = PCD.el('div');
    body.innerHTML =
      (existing ? '' :
        '<div class="text-muted text-sm" style="margin-bottom:14px;line-height:1.5;">' +
          PCD.escapeHtml(t('haccp_log_intro') || 'Create a separate log for each kitchen area. Useful when you manage multiple kitchens (e.g. banquet, à la carte, bar) with different refrigeration units.') +
        '</div>'
      ) +
      '<div style="margin-bottom:6px;">' +
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('haccp_log_name') || 'Log name') + '</label>' +
        '<input id="hlName" type="text" maxlength="80" placeholder="' + PCD.escapeHtml(t('haccp_log_name_placeholder') || 'e.g. Banquet Kitchen') + '" value="' + PCD.escapeHtml(existing && existing.name || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
      '</div>';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { flex: '1' } });
    const saveBtn = PCD.el('button', {
      class: 'btn btn-primary',
      text: existing ? (t('save') || 'Save') : (t('haccp_new_log') || 'Create log'),
      style: { flex: '2' },
    });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (t('haccp_rename_log') || 'Rename log') : (t('haccp_new_log') || 'New log'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    setTimeout(function () {
      const inp = body.querySelector('#hlName');
      if (inp) inp.focus();
    }, 60);
    saveBtn.addEventListener('click', function () {
      const name = body.querySelector('#hlName').value.trim();
      if (!name) {
        PCD.toast.error(t('haccp_log_name_required') || 'Log name is required');
        return;
      }
      const payload = existing
        ? Object.assign({}, existing, { name: name })
        : { name: name, sortIndex: listLogs().length };
      const saved = PCD.store.upsertInTable(TABLE_LOGS, payload, 'log');
      PCD.toast.success(existing ? (t('saved') || 'Saved') : (t('haccp_log_created') || 'Log created'));
      m.close();
      if (onClose) onClose(saved);
    });
  }

  // ============ UNIT EDITOR ============
  function openUnitEditor(unitId, onClose) {
    const t = PCD.i18n.t;
    const tempUnit = getDefaultTempUnit();
    const existing = unitId ? PCD.store.getFromTable(TABLE_UNITS, unitId) : null;

    const body = PCD.el('div');
    body.innerHTML =
      (existing ? '' :
        '<div class="text-muted text-sm" style="margin-bottom:14px;line-height:1.5;">' +
          PCD.escapeHtml(t('haccp_unit_intro') || 'Add a refrigeration unit (fridge, freezer, walk-in cooler, etc.). You can adjust its safe temperature range based on your menu and HACCP plan.') +
        '</div>'
      ) +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('haccp_unit_name') || 'Unit name') + '</label>' +
        '<input id="huName" type="text" maxlength="80" placeholder="' + PCD.escapeHtml(t('haccp_unit_name_placeholder') || 'e.g. Walk-in Cooler 1') + '" value="' + PCD.escapeHtml(existing && existing.name || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      (existing ? '' :
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">' + PCD.escapeHtml(t('haccp_unit_preset') || 'Preset (optional)') + '</label>' +
          '<div id="huPresets" style="display:flex;gap:6px;flex-wrap:wrap;">' +
            UNIT_PRESETS.map(function (p) {
              return '<button type="button" class="btn btn-outline btn-sm" data-preset="' + p.type + '" style="font-size:12px;">' + PCD.escapeHtml(t(p.nameKey)) + ' (' + p.min + '–' + p.max + '°' + tempUnit + ')</button>';
            }).join('') +
          '</div>' +
        '</div>'
      ) +
      '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('haccp_unit_min') || 'Min °' + tempUnit) + '</label>' +
          '<input id="huMin" type="number" step="0.1" placeholder="0" value="' + (existing && existing.min !== undefined ? existing.min : '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('haccp_unit_max') || 'Max °' + tempUnit) + '</label>' +
          '<input id="huMax" type="number" step="0.1" placeholder="4" value="' + (existing && existing.max !== undefined ? existing.max : '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div class="text-muted" style="font-size:11px;line-height:1.5;padding:8px 10px;background:var(--surface-2);border-radius:6px;">ℹ️ ' +
        PCD.escapeHtml(t('haccp_unit_range_tip') || 'HACCP cold storage is typically 0–4°C. Freezers ≤ –18°C. Hot holding ≥ 63°C.') +
      '</div>';

    // Wire up presets
    if (!existing) {
      setTimeout(function () {
        body.querySelectorAll('[data-preset]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const type = this.getAttribute('data-preset');
            const p = UNIT_PRESETS.find(function (x) { return x.type === type; });
            if (!p) return;
            body.querySelector('#huName').value = t(p.nameKey);
            body.querySelector('#huMin').value = p.min;
            body.querySelector('#huMax').value = p.max;
          });
        });
      }, 10);
    }

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { flex: '1' } });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: existing ? (t('save') || 'Save') : (t('haccp_add_unit') || 'Add unit'), style: { flex: '1' } });
    const deleteBtn = existing ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Delete', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (t('haccp_edit_unit') || 'Edit unit') : (t('haccp_add_unit') || 'Add unit'),
      body: body,
      footer: footer,
      size: 'sm',
      closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: t('haccp_delete_unit_title') || 'Delete this unit?',
          text: t('haccp_delete_unit_msg') || 'The unit will be removed. Past readings stay in the database for HACCP records but will no longer be visible in the grid.',
          okText: t('act_delete') || 'Delete',
        }).then(function (ok) {
          if (!ok) return;
          PCD.store.deleteFromTable(TABLE_UNITS, unitId);
          PCD.toast.success(t('haccp_unit_deleted') || 'Unit removed');
          m.close();
          if (onClose) onClose();
        });
      });
    }
    saveBtn.addEventListener('click', function () {
      const name = body.querySelector('#huName').value.trim();
      const minStr = body.querySelector('#huMin').value;
      const maxStr = body.querySelector('#huMax').value;
      if (!name) { PCD.toast.error(t('haccp_unit_name_required') || 'Name is required'); return; }
      const min = minStr === '' ? undefined : parseFloat(minStr);
      const max = maxStr === '' ? undefined : parseFloat(maxStr);
      if (min !== undefined && max !== undefined && min >= max) {
        PCD.toast.error(t('haccp_unit_range_invalid') || 'Min must be less than max'); return;
      }
      const payload = existing ? Object.assign({}, existing, { name: name, min: min, max: max })
                               : { name: name, min: min, max: max, unit: tempUnit, sortIndex: listUnits().length, logId: getCurrentLogId() };
      PCD.store.upsertInTable(TABLE_UNITS, payload, 'unit');
      PCD.toast.success(existing ? (t('saved') || 'Saved') : (t('haccp_unit_added') || 'Unit added'));
      m.close();
      if (onClose) onClose();
    });
  }

  // ============ READING EDITOR ============
  function openReadingEditor(unitId, dateStr, shift, onClose) {
    const t = PCD.i18n.t;
    const unit = PCD.store.getFromTable(TABLE_UNITS, unitId);
    if (!unit) return;
    const tempUnit = getDefaultTempUnit();
    const existing = findReading(unitId, dateStr);
    const r = (existing && existing[shift]) || null;

    const shiftLabel = shift === 'morning' ? (t('haccp_shift_morning') || 'Morning (opening)') : (t('haccp_shift_evening') || 'Evening (closing)');
    const dateLabel = new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="margin-bottom:14px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;">' +
        '<div style="font-weight:700;margin-bottom:2px;">' + PCD.escapeHtml(unit.name) + '</div>' +
        '<div class="text-muted" style="font-size:12px;">' + PCD.escapeHtml(dateLabel) + ' · ' + PCD.escapeHtml(shiftLabel) + '</div>' +
        '<div class="text-muted" style="font-size:11px;margin-top:4px;">' +
          PCD.escapeHtml(t('haccp_safe_range') || 'Safe range') + ': ' +
          (unit.min !== undefined ? unit.min : '?') + '°' + tempUnit + ' – ' +
          (unit.max !== undefined ? unit.max : '?') + '°' + tempUnit +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('haccp_reading_value') || 'Temperature') + ' (°' + tempUnit + ')</label>' +
        '<input id="hrValue" type="number" step="0.1" placeholder="3.5" value="' + (r && r.value !== undefined ? r.value : '') + '" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:18px;font-weight:600;box-sizing:border-box;text-align:center;">' +
      '</div>' +
      '<div id="hrOorWarning" style="display:none;margin-bottom:12px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:12px;line-height:1.5;">' +
        '⚠ ' + PCD.escapeHtml(t('haccp_oor_warning') || 'This value is outside the safe range. Add a corrective action note below to document what you did.') +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:13px;margin-bottom:4px;">' +
          '<span>' + PCD.escapeHtml(t('haccp_corrective_action') || 'Corrective action / note') + '</span>' +
          '<span style="font-weight:400;font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('optional') || 'optional') + '</span>' +
        '</label>' +
        '<textarea id="hrNote" rows="3" maxlength="500" placeholder="' + PCD.escapeHtml(t('haccp_note_placeholder') || 'e.g. Door left open after delivery, closed at 14:30. Re-check at 15:00 = 4°C.') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + PCD.escapeHtml(r && r.note || '') + '</textarea>' +
      '</div>';

    // Live OOR warning toggle
    setTimeout(function () {
      const valEl = body.querySelector('#hrValue');
      const warnEl = body.querySelector('#hrOorWarning');
      function update() {
        warnEl.style.display = isOutOfRange(unit, valEl.value) ? 'block' : 'none';
      }
      valEl.addEventListener('input', update);
      update();
      valEl.focus();
    }, 50);

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel', style: { flex: '1' } });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Save', style: { flex: '2' } });
    const deleteBtn = r ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Delete', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: '🌡 ' + (t('haccp_reading_title') || 'Log temperature reading'),
      body: body,
      footer: footer,
      size: 'sm',
      closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        const merged = Object.assign({}, existing);
        delete merged[shift];
        // If both shifts gone, delete the row entirely
        if (!merged.morning && !merged.evening) {
          PCD.store.deleteFromTable(TABLE_READINGS, existing.id);
        } else {
          PCD.store.upsertInTable(TABLE_READINGS, merged, 'rd');
        }
        PCD.toast.success(t('haccp_reading_deleted') || 'Reading removed');
        m.close();
        if (onClose) onClose();
      });
    }
    saveBtn.addEventListener('click', function () {
      const valStr = body.querySelector('#hrValue').value;
      const note = body.querySelector('#hrNote').value.trim();
      if (valStr === '' || isNaN(parseFloat(valStr))) {
        PCD.toast.error(t('haccp_value_required') || 'Enter a temperature value');
        return;
      }
      const user = PCD.store.get('user') || {};
      const now = new Date();
      const payload = {
        value: parseFloat(valStr),
        time: now.toTimeString().slice(0, 5), // HH:MM
        chef: user.name || user.email || '',
        note: note || null,
        recordedAt: now.toISOString(),
      };
      saveReading(unitId, dateStr, shift, payload);
      PCD.toast.success(t('saved') || 'Saved');
      m.close();
      if (onClose) onClose();
    });
  }

  // ============ PRINT MONTH ============
  function printMonth(year, monthIdx0) {
    const t = PCD.i18n.t;
    const units = listUnits();
    const days = daysInMonth(year, monthIdx0);
    const tempUnit = getDefaultTempUnit();
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';
    const currentLog = getCurrentLog();
    const logName = (currentLog && currentLog.name) || '';

    let html =
      '<style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:0;}' +
        '.h-head{margin-bottom:6px;border-bottom:2px solid #16a34a;padding-bottom:4px;}' +
        '.h-head h1{margin:0;font-size:14px;}' +
        '.h-head .sub{font-size:9px;color:#555;margin-top:1px;}' +
        'table.h-grid{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;}' +
        'table.h-grid th, table.h-grid td{border:1px solid #999;padding:1px 3px;text-align:center;}' +
        'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:8px;}' +
        'table.h-grid td.day{text-align:left;font-weight:600;background:#fafafa;font-size:9px;}' +
        'table.h-grid td.oor{background:#fee2e2;color:#991b1b;font-weight:700;}' +
        'table.h-grid td.has-note::after{content:" *";color:#16a34a;}' +
        '.h-notes{margin-top:6px;font-size:8px;}' +
        '.h-notes .nh{font-weight:700;margin-bottom:3px;font-size:9px;}' +
        '.h-notes .ni{padding:1px 0;border-bottom:1px solid #eee;}' +
        '.h-sign{margin-top:6px;padding-top:4px;border-top:1px solid #ccc;font-size:9px;display:flex;justify-content:space-between;}' +
        // The global PCD.print() footer ("Made with ProChefDesk") would be
        // injected below the table and push everything to page 2 on a
        // tight landscape A4. Hide it; we render our own compact footer.
        '.pcd-print-footer{display:none !important;}' +
        '.h-foot{margin-top:4px;text-align:center;font-size:7px;color:#999;}' +
        '@page{size:A4 landscape;margin:5mm;}' +
        (units.length > 6 ? '.h-warn{padding:3px 6px;background:#fef3c7;color:#92400e;font-size:8px;border-radius:3px;margin-bottom:4px;}' : '') +
      '</style>' +
      '<div class="h-head">' +
        '<h1>HACCP · Fridge & Freezer Temperature Log</h1>' +
        '<div class="sub">' + PCD.escapeHtml(wsName) + (logName ? ' · ' + PCD.escapeHtml(logName) : '') + ' · ' + PCD.escapeHtml(monthLabel(year, monthIdx0)) + ' · °' + tempUnit + '</div>' +
      '</div>' +
      (units.length > 6 ? '<div class="h-warn">⚠ ' + units.length + ' units on one page — text is tight. Consider splitting into two groups.</div>' : '') +
      '<table class="h-grid"><thead>' +
        '<tr><th rowspan="2" style="width:7%;">Day</th>';
    units.forEach(function (u) {
      const range = (u.min !== undefined && u.max !== undefined) ? '(' + u.min + '–' + u.max + ')' : '';
      html += '<th colspan="2">' + PCD.escapeHtml(u.name) + '<br><span style="font-weight:400;color:#666;font-size:7px;">' + range + '</span></th>';
    });
    html += '</tr><tr>';
    units.forEach(function () { html += '<th>AM</th><th>PM</th>'; });
    html += '</tr></thead><tbody>';

    const readingsByKey = {};
    listReadings().forEach(function (r) { readingsByKey[r.unitId + '|' + r.date] = r; });

    const notesAccum = []; // { dateStr, unit, shift, value, note }
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, monthIdx0, d);
      const dateStr = ymd(date);
      const dow = date.toLocaleDateString(undefined, { weekday: 'short' });
      html += '<tr><td class="day">' + d + ' ' + dow + '</td>';
      units.forEach(function (u) {
        ['morning', 'evening'].forEach(function (shift) {
          const reading = readingsByKey[u.id + '|' + dateStr];
          const r = reading && reading[shift];
          if (r && r.value !== undefined && r.value !== null && r.value !== '') {
            const oor = isOutOfRange(u, r.value);
            const hasNote = !!r.note;
            const cls = (oor ? 'oor ' : '') + (hasNote ? 'has-note' : '');
            html += '<td class="' + cls.trim() + '">' + PCD.escapeHtml(String(r.value)) + '</td>';
            if (hasNote) {
              notesAccum.push({ dateStr: dateStr, unit: u.name, shift: shift, value: r.value, note: r.note, chef: r.chef });
            }
          } else {
            html += '<td>—</td>';
          }
        });
      });
      html += '</tr>';
    }
    html += '</tbody></table>';

    if (notesAccum.length > 0) {
      html += '<div class="h-notes"><div class="nh">Corrective Actions / Notes (* in grid)</div>';
      notesAccum.forEach(function (n) {
        html += '<div class="ni"><strong>' + PCD.escapeHtml(n.dateStr) + ' · ' + PCD.escapeHtml(n.unit) + ' (' + (n.shift === 'morning' ? 'AM' : 'PM') + ') · ' + PCD.escapeHtml(String(n.value)) + '°' + tempUnit + '</strong> — ' + PCD.escapeHtml(n.note) + (n.chef ? ' <span style="color:#666;">(' + PCD.escapeHtml(n.chef) + ')</span>' : '') + '</div>';
      });
      html += '</div>';
    }

    const user = PCD.store.get('user') || {};
    html += '<div class="h-sign"><div>Reviewed by: ____________________________</div><div>Date: ' + new Date().toLocaleDateString() + '</div></div>';
    html += '<div class="h-foot">Made with ProChefDesk · prochefdesk.com</div>';

    PCD.print(html, 'HACCP Fridge Log — ' + monthLabel(year, monthIdx0));
  }

  // ============ MODULE EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpLogs = {
    render: render,
    openEditor: function () { openUnitEditor(null, function () {
      const v = PCD.$('#view');
      if (PCD.router.currentView() === 'haccp_logs') render(v);
    }); },
    setTempUnit: setDefaultTempUnit,
    getTempUnit: getDefaultTempUnit,
  };
})();
