/* ================================================================
   ProChefDesk — haccp_logs.js
   HACCP Forms · Fridge & Freezer Temperature Log (v2.6.1)

   Two storage tables:
   - haccpUnits     — list of refrigeration units (workspace-bound)
                      shape: { id, name, type, min, max, unit, sortIndex }
   - haccpReadings  — daily readings for each unit (workspace-bound)
                      shape: { id, unitId, date (YYYY-MM-DD),
                               morning: { value, time, chef, note } | null,
                               evening: { value, time, chef, note } | null }

   View structure:
   1. Header: month picker + unit count
   2. Grid: rows = days of the month, columns = unit × shift (AM/PM)
            Out-of-range cells highlighted red, click to edit
   3. Toolbar: + Add unit, Print/PDF, settings
   4. Detail modal: enter value, optional note ("corrective action")
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE_UNITS = 'haccpUnits';
  const TABLE_READINGS = 'haccpReadings';

  // ============ DEFAULT UNIT TEMPLATES ============
  // Used as suggestions when chef adds a new unit.
  const UNIT_PRESETS = [
    { type: 'fridge',      name: 'Fridge',           min: 0,    max: 4 },
    { type: 'cooler',      name: 'Walk-in Cooler',   min: 0,    max: 4 },
    { type: 'freezer',     name: 'Freezer',          min: -25,  max: -18 },
    { type: 'bar_fridge',  name: 'Bar Fridge',       min: 0,    max: 4 },
    { type: 'display',     name: 'Display Cooler',   min: 0,    max: 4 },
    { type: 'hot_holding', name: 'Hot Holding',      min: 63,   max: 90 },
  ];

  // Default temperature unit per workspace ('C' or 'F').
  function getDefaultTempUnit() {
    const pref = PCD.store && PCD.store.get && PCD.store.get('prefs.haccpTempUnit');
    return pref === 'F' ? 'F' : 'C';
  }
  function setDefaultTempUnit(u) {
    PCD.store.set('prefs.haccpTempUnit', u === 'F' ? 'F' : 'C');
  }

  // ============ DATA HELPERS ============
  function listUnits() {
    return (PCD.store.listTable(TABLE_UNITS) || []).slice().sort(function (a, b) {
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
      '<button class="btn btn-outline btn-sm" id="haccpPrevMonth" aria-label="Previous month">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;font-weight:700;font-size:16px;">' + PCD.escapeHtml(monthLabel(_viewYear, _viewMonth)) + '</div>' +
      '<button class="btn btn-outline btn-sm" id="haccpNextMonth" aria-label="Next month">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(monthNav);

    // Build the grid table.
    // Sticky-header table; rows = days, columns = unit×shift.
    // For mobile we wrap in a scroll container.
    const wrap = PCD.el('div', { class: 'card', style: { padding: '0', overflowX: 'auto' } });
    let table =
      '<table style="width:100%;min-width:' + (220 + units.length * 200) + 'px;border-collapse:collapse;font-size:13px;">' +
        '<thead style="position:sticky;top:0;z-index:2;background:var(--surface-2);">' +
          '<tr>' +
            '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface-2);z-index:3;min-width:120px;">' +
              PCD.escapeHtml(t('haccp_col_day') || 'Day') +
            '</th>';
    units.forEach(function (u) {
      const range = (u.min !== undefined && u.max !== undefined)
        ? u.min + '–' + u.max + '°' + tempUnit
        : '—';
      table +=
        '<th colspan="2" style="padding:10px 8px;text-align:center;font-size:11px;font-weight:700;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' +
          '<div style="font-size:13px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--text-1);">' + PCD.escapeHtml(u.name) + '</div>' +
          '<div style="font-size:10px;font-weight:400;color:var(--text-3);text-transform:none;letter-spacing:0;margin-top:2px;">' + range + '</div>' +
        '</th>';
    });
    table += '</tr>' +
          '<tr style="background:var(--surface);">' +
            '<th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:3;"></th>';
    units.forEach(function () {
      table +=
        '<th style="padding:6px 4px;text-align:center;font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">AM</th>' +
        '<th style="padding:6px 4px;text-align:center;font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">PM</th>';
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
        '<td style="padding:8px 12px;border-bottom:1px solid var(--border);font-weight:' + (isToday ? '700' : '500') + ';position:sticky;left:0;background:' + (isToday ? 'var(--brand-50)' : 'var(--surface)') + ';z-index:1;min-width:120px;">' +
          '<div>' + d + ' <span style="color:var(--text-3);font-weight:400;font-size:11px;">' + dow + '</span></div>' +
        '</td>';

      units.forEach(function (u) {
        const reading = readingsByKey[u.id + '|' + dateStr];
        ['morning', 'evening'].forEach(function (shift) {
          const r = reading && reading[shift];
          const cellStyle = 'padding:6px 4px;border-bottom:1px solid var(--border);text-align:center;cursor:' + (isFuture ? 'not-allowed' : 'pointer') + ';' +
            (shift === 'morning' ? 'border-left:1px solid var(--border);' : '');
          let cellContent = '';
          if (r && r.value !== undefined && r.value !== null && r.value !== '') {
            const oor = isOutOfRange(u, r.value);
            const hasNote = !!r.note;
            cellContent =
              '<div style="display:inline-flex;align-items:center;gap:3px;font-weight:600;color:' + (oor ? '#dc2626' : 'var(--text-1)') + ';font-size:13px;">' +
                (oor ? '⚠' : '') +
                PCD.escapeHtml(String(r.value)) + '°' +
                (hasNote ? '<span title="Has note" style="color:var(--brand-600);font-size:10px;">📝</span>' : '') +
              '</div>';
          } else if (!isFuture) {
            cellContent = '<span style="color:var(--text-3);font-size:18px;font-weight:300;">+</span>';
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
              return '<button type="button" class="btn btn-outline btn-sm" data-preset="' + p.type + '" style="font-size:12px;">' + PCD.escapeHtml(p.name) + ' (' + p.min + '–' + p.max + '°' + tempUnit + ')</button>';
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
            body.querySelector('#huName').value = p.name;
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
                               : { name: name, min: min, max: max, unit: tempUnit, sortIndex: listUnits().length };
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

    let html =
      '<style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:16px;}' +
        '.h-head{margin-bottom:16px;border-bottom:2px solid #16a34a;padding-bottom:8px;}' +
        '.h-head h1{margin:0;font-size:20px;}' +
        '.h-head .sub{font-size:12px;color:#555;margin-top:2px;}' +
        'table.h-grid{width:100%;border-collapse:collapse;font-size:10px;}' +
        'table.h-grid th, table.h-grid td{border:1px solid #999;padding:3px 4px;text-align:center;}' +
        'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:9px;}' +
        'table.h-grid td.day{text-align:left;font-weight:600;background:#fafafa;}' +
        'table.h-grid td.oor{background:#fee2e2;color:#991b1b;font-weight:700;}' +
        'table.h-grid td.has-note::after{content:" *";color:#16a34a;}' +
        '.h-notes{margin-top:14px;font-size:10px;}' +
        '.h-notes .nh{font-weight:700;margin-bottom:6px;font-size:11px;}' +
        '.h-notes .ni{padding:4px 0;border-bottom:1px solid #eee;}' +
        '.h-sign{margin-top:18px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;display:flex;justify-content:space-between;}' +
        '@page{size:A4 landscape;margin:12mm;}' +
      '</style>' +
      '<div class="h-head">' +
        '<h1>HACCP · Fridge & Freezer Temperature Log</h1>' +
        '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(monthLabel(year, monthIdx0)) + ' · Temperatures in °' + tempUnit + '</div>' +
      '</div>' +
      '<table class="h-grid"><thead>' +
        '<tr><th rowspan="2">Day</th>';
    units.forEach(function (u) {
      const range = (u.min !== undefined && u.max !== undefined) ? '(' + u.min + '–' + u.max + ')' : '';
      html += '<th colspan="2">' + PCD.escapeHtml(u.name) + '<br><span style="font-weight:400;color:#666;">' + range + '</span></th>';
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
