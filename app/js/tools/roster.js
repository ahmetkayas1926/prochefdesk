/* ================================================================
   ProChefDesk — roster.js (v2.15.1)
   Weekly staff roster / shift schedule.

   - Master-detail in one view: list of weeks → editor grid.
   - Self-contained weekly rosters (staff + templates + shifts embedded)
     so "duplicate last week" gives continuity and each week is a complete
     history snapshot. Stored via generic table API (table 'rosters').
   - Shift entry: pick a customizable template (one tap) OR free time.
   - Optional labour cost (hourly rate) — and a per-output toggle to SHOW
     or HIDE cost in print / Excel / share (staff vs boss/accounting).
   - Outputs: Print (A4 landscape), Excel (shared PCD.xlsx engine), Share
     (WhatsApp / SMS / Email / Copy — same flow as supplier orders).

   Cloud sync: table 'rosters' uses the generic per-table sync hook; it goes
   live once 'rosters' is mapped in _stateKeyToSqlTable + the Supabase table
   exists (Stage 2). Until then it persists locally (push is skipped, no error).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const t = function (k, v) { return PCD.i18n.t(k, v); };

  let _editingId = null;        // null = list view; id = editor
  let _showCost = false;        // include labour cost in print/excel/share

  const DAY_OPTIONS = [5, 6, 7];

  // ---- helpers ----
  function isoToday() { return new Date().toISOString().slice(0, 10); }
  function mondayOf(d) {
    const dt = new Date(d); const wd = (dt.getDay() + 6) % 7; // 0=Mon
    dt.setDate(dt.getDate() - wd); return dt.toISOString().slice(0, 10);
  }
  function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d; }
  function dayLabel(iso, n) {
    return addDays(iso, n).toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function weekRange(r) {
    const start = addDays(r.weekStart, 0);
    const end = addDays(r.weekStart, (r.dayCount || 7) - 1);
    const loc = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    return start.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ' – ' + end.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function parseHM(s) { const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim()); return m ? (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) : null; }
  function shiftHours(cell) {
    if (!cell || !cell.start || !cell.end) return 0;
    let a = parseHM(cell.start), b = parseHM(cell.end);
    if (a == null || b == null) return 0;
    if (b < a) b += 24; // overnight
    return Math.max(0, b - a);
  }
  function staffHours(r, sid) {
    let h = 0; const cells = (r.cells && r.cells[sid]) || {};
    for (let d = 0; d < (r.dayCount || 7); d++) h += shiftHours(cells[d]);
    return h;
  }
  function staffCost(r, st) {
    const rate = Number(st.rate) || 0;
    return rate > 0 ? staffHours(r, st.id) * rate : 0;
  }
  function rosterTotals(r) {
    let hours = 0, cost = 0;
    (r.staff || []).forEach(function (st) { hours += staffHours(r, st.id); cost += staffCost(r, st); });
    return { hours: hours, cost: cost };
  }

  function defaultTemplates() {
    return [
      { id: PCD.uid('st'), label: t('roster_tpl_am') || 'AM', start: '08:00', end: '16:00' },
      { id: PCD.uid('st'), label: t('roster_tpl_pm') || 'PM', start: '16:00', end: '23:00' },
    ];
  }
  function newRoster(seed) {
    const base = {
      name: '',
      weekStart: mondayOf(isoToday()),
      dayCount: 7,
      staff: [],
      templates: defaultTemplates(),
      cells: {},
    };
    if (seed) {
      base.staff = PCD.clone(seed.staff || []);
      base.templates = PCD.clone(seed.templates || base.templates);
      base.cells = PCD.clone(seed.cells || {});
      base.dayCount = seed.dayCount || 7;
      base.name = '';
      base.weekStart = mondayOf(addDays(seed.weekStart || isoToday(), 7).toISOString().slice(0, 10));
    }
    return base;
  }

  function listRosters() {
    return PCD.store.listTable('rosters').sort(function (a, b) { return (b.weekStart || '').localeCompare(a.weekStart || ''); });
  }

  // ============ MAIN RENDER (branch) ============
  function render(view) {
    if (_editingId) {
      const r = PCD.store.getFromTable('rosters', _editingId);
      if (r) { renderEditor(view, r); return; }
      _editingId = null;
    }
    renderList(view);
  }

  // ============ LIST VIEW ============
  function renderList(view) {
    const rosters = listRosters();
    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('roster_title') || 'Roster') + '</div>' +
        '<div class="page-subtitle">' + rosters.length + ' ' + PCD.escapeHtml(t('roster_weeks') || 'weeks') + '</div>' +
      '</div><div class="page-header-actions">' +
        '<button class="btn btn-primary" id="newRosterBtn">' + PCD.icon('plus', 16) + ' ' + PCD.escapeHtml(t('roster_new') || 'New roster') + '</button>' +
      '</div></div>' +
      guideHtml() +
      '<div id="rosterList"></div>';

    const listEl = PCD.$('#rosterList', view);
    if (!rosters.length) {
      listEl.innerHTML =
        '<div class="empty"><div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('calendar', 48) + '</div>' +
        '<div class="empty-title">' + PCD.escapeHtml(t('roster_empty') || 'No rosters yet') + '</div>' +
        '<div class="empty-desc">' + PCD.escapeHtml(t('roster_empty_desc') || 'Create a weekly schedule: add staff, assign shifts, then print or share.') + '</div>' +
        '<div class="empty-action"><button class="btn btn-primary" id="emptyNewRoster">' + PCD.icon('plus', 16) + ' ' + PCD.escapeHtml(t('roster_new') || 'New roster') + '</button></div></div>';
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      rosters.forEach(function (r) {
        const tot = rosterTotals(r);
        const row = PCD.el('div', { class: 'list-item', 'data-open': r.id });
        row.innerHTML =
          '<div class="list-item-thumb">' + PCD.icon('calendar', 20) + '</div>' +
          '<div class="list-item-body"><div class="list-item-title">' + PCD.escapeHtml(r.name || weekRange(r)) + '</div>' +
            '<div class="list-item-meta"><span>' + PCD.escapeHtml(weekRange(r)) + '</span><span>·</span>' +
            '<span>' + (r.staff || []).length + ' ' + PCD.escapeHtml(t('roster_staff') || 'staff') + '</span><span>·</span>' +
            '<span>' + PCD.fmtNumber(tot.hours) + ' ' + PCD.escapeHtml(t('roster_hours') || 'h') + '</span></div></div>' +
          '<button class="icon-btn" data-dup="' + r.id + '" title="' + PCD.escapeHtml(t('roster_duplicate') || 'Duplicate') + '">' + PCD.icon('copy', 18) + '</button>';
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    function openNew() { const saved = PCD.store.upsertInTable('rosters', newRoster(), 'rost'); _editingId = saved.id; render(view); }
    const nb = PCD.$('#newRosterBtn', view); if (nb) nb.addEventListener('click', openNew);
    const en = PCD.$('#emptyNewRoster', view); if (en) en.addEventListener('click', openNew);
    wireGuide(view);
    PCD.on(listEl, 'click', '[data-open]', function (e) {
      if (e.target.closest('[data-dup]')) return;
      _editingId = this.getAttribute('data-open'); render(view);
    });
    PCD.on(listEl, 'click', '[data-dup]', function (e) {
      e.stopPropagation();
      const src = PCD.store.getFromTable('rosters', this.getAttribute('data-dup'));
      if (!src) return;
      const saved = PCD.store.upsertInTable('rosters', newRoster(src), 'rost');
      _editingId = saved.id; render(view);
    });
  }

  function guideHtml() {
    return '<details class="card" id="rosterGuide" style="padding:0;margin-bottom:14px;overflow:hidden;border-color:var(--brand-200);">' +
      '<summary style="cursor:pointer;padding:12px 14px;font-weight:700;color:var(--brand-700);list-style:none;">💡 ' + PCD.escapeHtml(t('roster_guide_title') || 'How the Roster works') + '</summary>' +
      '<div style="padding:0 14px 14px;font-size:13px;line-height:1.6;color:var(--text-2);">' +
        '<b>' + PCD.escapeHtml(t('roster_guide_1_t') || 'Add staff') + '</b> — ' + PCD.escapeHtml(t('roster_guide_1') || 'Name + role (+ optional hourly rate for labour cost).') + '<br>' +
        '<b>' + PCD.escapeHtml(t('roster_guide_2_t') || 'Assign shifts') + '</b> — ' + PCD.escapeHtml(t('roster_guide_2') || 'Tap a cell, pick a shift template or type a time range.') + '<br>' +
        '<b>' + PCD.escapeHtml(t('roster_guide_3_t') || 'Share') + '</b> — ' + PCD.escapeHtml(t('roster_guide_3') || 'Print, Excel or send via WhatsApp. Toggle whether labour cost is shown (hide it for staff, show it for the boss).') +
      '</div></details>';
  }
  function wireGuide(view) {
    // remembered open/closed via store flag (optional, cheap)
    const g = PCD.$('#rosterGuide', view);
    if (g && !PCD.store.isToolSeen('roster')) { g.open = true; PCD.store.markToolSeen('roster'); }
  }

  // ============ EDITOR VIEW ============
  function renderEditor(view, data) {
    const dayCount = data.dayCount || 7;
    const tot = rosterTotals(data);
    const sym = (PCD.currencySymbol && PCD.currencySymbol()) || '$';

    // Header
    let html =
      '<div class="page-header"><div class="page-header-text">' +
        '<button class="btn btn-ghost btn-sm" id="rosterBack" style="margin-bottom:6px;">' + PCD.icon('chevronLeft', 16) + ' ' + PCD.escapeHtml(t('btn_back') || 'Back') + '</button>' +
        '<div class="page-title" style="font-size:20px;">' + PCD.escapeHtml(data.name || weekRange(data)) + '</div>' +
      '</div></div>';

    // Meta row
    html +=
      '<div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div class="field" style="flex:2;min-width:160px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_name') || 'Name') + '</label>' +
          '<input type="text" class="input" id="rName" value="' + PCD.escapeHtml(data.name || '') + '" placeholder="' + PCD.escapeHtml(t('roster_name_ph') || 'e.g. Week 21 — Main kitchen') + '"></div>' +
        '<div class="field" style="flex:1;min-width:120px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_week_start') || 'Week start') + '</label>' +
          '<input type="date" class="input" id="rStart" value="' + PCD.escapeHtml(data.weekStart) + '"></div>' +
        '<div class="field" style="min-width:90px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_days') || 'Days') + '</label>' +
          '<select class="select" id="rDays">' + DAY_OPTIONS.map(function (d) { return '<option value="' + d + '"' + (dayCount === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
      '</div>';

    // Shift templates
    html += '<div class="card" style="padding:12px;margin-bottom:12px;">' +
      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);margin-bottom:8px;">' + PCD.escapeHtml(t('roster_templates') || 'Shift templates') + '</div>' +
      '<div id="tplList" style="display:flex;flex-direction:column;gap:6px;"></div>' +
      '<button class="btn btn-ghost btn-sm" id="addTpl" style="margin-top:6px;">' + PCD.icon('plus', 14) + ' ' + PCD.escapeHtml(t('roster_add_template') || 'Add template') + '</button></div>';

    // Grid
    html += '<div class="card" style="padding:12px;margin-bottom:12px;overflow-x:auto;">' +
      '<table id="rosterGrid" style="width:100%;border-collapse:collapse;min-width:' + (160 + dayCount * 96) + 'px;">' + gridHtml(data) + '</table>' +
      '<button class="btn btn-ghost btn-sm" id="addStaff" style="margin-top:10px;">' + PCD.icon('plus', 14) + ' ' + PCD.escapeHtml(t('roster_add_staff') || 'Add staff') + '</button></div>';

    // Labour summary + cost toggle + actions
    html += '<div class="card" style="padding:14px;margin-bottom:12px;">' +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">' +
        '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('roster_total_hours') || 'Total hours') + '</div><div style="font-size:20px;font-weight:800;">' + PCD.fmtNumber(tot.hours) + '</div></div>' +
        '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('roster_labour_cost') || 'Labour cost') + '</div><div style="font-size:20px;font-weight:800;color:var(--brand-700);">' + (tot.cost > 0 ? PCD.fmtMoney(tot.cost) : '—') + '</div></div>' +
        '<label class="checkbox" style="margin-inline-start:auto;"><input type="checkbox" id="rShowCost"' + (_showCost ? ' checked' : '') + '><span>' + PCD.escapeHtml(t('roster_show_cost') || 'Show labour cost in print / share / Excel') + '</span></label>' +
      '</div></div>';

    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-secondary" id="rPrint">' + PCD.icon('print', 14) + ' ' + PCD.escapeHtml(t('print') || 'Print') + '</button>' +
      '<button class="btn btn-secondary" id="rExcel">' + PCD.icon('download', 14) + ' ' + PCD.escapeHtml(t('roster_excel') || 'Excel') + '</button>' +
      '<button class="btn btn-primary" id="rShare">' + PCD.icon('send', 14) + ' ' + PCD.escapeHtml(t('roster_share') || 'Share / Send') + '</button>' +
      '<div style="flex:1;"></div>' +
      '<button class="btn btn-ghost" id="rDelete" style="color:var(--danger);">' + PCD.icon('trash', 14) + ' ' + PCD.escapeHtml(t('delete') || 'Delete') + '</button>' +
      '</div>';

    view.innerHTML = html;
    renderTemplates(view, data);
    wireEditor(view, data);
  }

  function gridHtml(data) {
    const dayCount = data.dayCount || 7;
    let h = '<thead><tr>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);font-size:12px;min-width:150px;">' + PCD.escapeHtml(t('roster_staff') || 'Staff') + '</th>';
    for (let d = 0; d < dayCount; d++) h += '<th style="padding:6px 4px;border-bottom:2px solid var(--border);font-size:11px;font-weight:600;color:var(--text-2);">' + PCD.escapeHtml(dayLabel(data.weekStart, d)) + '</th>';
    h += '</tr></thead><tbody>';
    if (!(data.staff || []).length) {
      h += '<tr><td colspan="' + (dayCount + 1) + '" class="text-muted" style="padding:14px 8px;font-size:13px;font-style:italic;">' + PCD.escapeHtml(t('roster_no_staff') || 'No staff yet — add your team below.') + '</td></tr>';
    }
    (data.staff || []).forEach(function (st) {
      const cells = (data.cells && data.cells[st.id]) || {};
      h += '<tr data-staff-row="' + st.id + '">' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top;">' +
          '<div style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(st.name || '—') + '</div>' +
          '<div class="text-muted" style="font-size:11px;">' + PCD.escapeHtml(st.role || '') + (Number(st.rate) > 0 ? ' · ' + (PCD.currencySymbol && PCD.currencySymbol() || '$') + PCD.fmtNumber(st.rate) + '/h' : '') + '</div>' +
          '<button class="btn btn-ghost btn-sm" data-edit-staff="' + st.id + '" style="padding:2px 6px;font-size:11px;margin-top:2px;">' + PCD.escapeHtml(t('edit') || 'Edit') + '</button>' +
        '</td>';
      for (let d = 0; d < dayCount; d++) {
        const c = cells[d];
        const filled = c && c.start && c.end;
        h += '<td style="padding:3px;border-bottom:1px solid var(--border);text-align:center;">' +
          '<button class="roster-cell" data-cell="' + st.id + ':' + d + '" style="width:100%;min-height:42px;border:1px dashed ' + (filled ? 'var(--brand-400)' : 'var(--border-strong)') + ';border-radius:6px;background:' + (filled ? 'var(--brand-50)' : 'var(--surface)') + ';cursor:pointer;font-size:11px;font-weight:600;color:' + (filled ? 'var(--brand-700)' : 'var(--text-3)') + ';padding:4px;line-height:1.25;">' +
            (filled ? PCD.escapeHtml(c.start + '-' + c.end) + (c.note ? '<br><span style="font-weight:400;font-size:10px;">' + PCD.escapeHtml(c.note) + '</span>' : '') : '+') +
          '</button></td>';
      }
      h += '</tr>';
    });
    h += '</tbody>';
    return h;
  }

  function renderTemplates(view, data) {
    const listEl = PCD.$('#tplList', view);
    if (!listEl) return;
    listEl.innerHTML = '';
    (data.templates || []).forEach(function (tp, idx) {
      const row = PCD.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
      row.innerHTML =
        '<input type="text" class="input" data-tpl-label="' + idx + '" value="' + PCD.escapeHtml(tp.label || '') + '" placeholder="' + PCD.escapeHtml(t('roster_tpl_label_ph') || 'Label') + '" style="flex:1;min-width:0;padding:4px 8px;min-height:30px;font-size:13px;">' +
        '<input type="time" class="input" data-tpl-start="' + idx + '" value="' + PCD.escapeHtml(tp.start || '') + '" style="width:108px;padding:4px 6px;min-height:30px;font-size:12px;">' +
        '<input type="time" class="input" data-tpl-end="' + idx + '" value="' + PCD.escapeHtml(tp.end || '') + '" style="width:108px;padding:4px 6px;min-height:30px;font-size:12px;">' +
        '<button class="icon-btn" data-tpl-del="' + idx + '">' + PCD.icon('x', 14) + '</button>';
      listEl.appendChild(row);
    });
  }

  function persist(data) { PCD.store.upsertInTable('rosters', data, 'rost'); }

  function wireEditor(view, data) {
    PCD.$('#rosterBack', view).addEventListener('click', function () { _editingId = null; render(view); });
    PCD.$('#rName', view).addEventListener('input', function () { data.name = this.value; persist(data); });
    PCD.$('#rStart', view).addEventListener('change', function () { data.weekStart = this.value || data.weekStart; persist(data); render(view); });
    PCD.$('#rDays', view).addEventListener('change', function () { data.dayCount = parseInt(this.value, 10) || 7; persist(data); render(view); });
    PCD.$('#rShowCost', view).addEventListener('change', function () { _showCost = this.checked; });

    // Templates
    PCD.$('#addTpl', view).addEventListener('click', function () {
      data.templates = data.templates || []; data.templates.push({ id: PCD.uid('st'), label: '', start: '09:00', end: '17:00' }); persist(data); renderTemplates(view, data);
    });
    PCD.on(view, 'input', '[data-tpl-label]', function () { const i = +this.getAttribute('data-tpl-label'); if (data.templates[i]) { data.templates[i].label = this.value; persist(data); } });
    PCD.on(view, 'change', '[data-tpl-start]', function () { const i = +this.getAttribute('data-tpl-start'); if (data.templates[i]) { data.templates[i].start = this.value; persist(data); } });
    PCD.on(view, 'change', '[data-tpl-end]', function () { const i = +this.getAttribute('data-tpl-end'); if (data.templates[i]) { data.templates[i].end = this.value; persist(data); } });
    PCD.on(view, 'click', '[data-tpl-del]', function () { const i = +this.getAttribute('data-tpl-del'); data.templates.splice(i, 1); persist(data); renderTemplates(view, data); });

    // Staff
    PCD.$('#addStaff', view).addEventListener('click', function () { openStaffEditor(view, data, null); });
    PCD.on(view, 'click', '[data-edit-staff]', function () { openStaffEditor(view, data, this.getAttribute('data-edit-staff')); });

    // Cells
    PCD.on(view, 'click', '[data-cell]', function () {
      const parts = this.getAttribute('data-cell').split(':'); openCellEditor(view, data, parts[0], parseInt(parts[1], 10));
    });

    // Outputs
    PCD.$('#rPrint', view).addEventListener('click', function () { printRoster(data, _showCost); });
    PCD.$('#rExcel', view).addEventListener('click', function () { excelRoster(data, _showCost); });
    PCD.$('#rShare', view).addEventListener('click', function () { shareRoster(data, _showCost); });
    PCD.$('#rDelete', view).addEventListener('click', function () {
      PCD.modal.confirm({ icon: '🗑', iconKind: 'danger', danger: true, title: t('confirm_delete') || 'Delete?', text: (data.name || weekRange(data)), okText: t('delete') || 'Delete' }).then(function (ok) {
        if (!ok) return; PCD.store.deleteFromTable('rosters', data.id); _editingId = null; render(view);
      });
    });
  }

  function openStaffEditor(view, data, sid) {
    const existing = sid ? (data.staff || []).find(function (s) { return s.id === sid; }) : null;
    const st = existing ? PCD.clone(existing) : { id: PCD.uid('rs'), name: '', role: '', rate: '' };
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_name') || 'Name') + ' *</label><input type="text" class="input" id="stName" value="' + PCD.escapeHtml(st.name || '') + '" placeholder="' + PCD.escapeHtml(t('roster_staff_name_ph') || 'e.g. Maria') + '"></div>' +
      '<div class="field-row"><div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_role') || 'Role') + '</label><input type="text" class="input" id="stRole" value="' + PCD.escapeHtml(st.role || '') + '" placeholder="' + PCD.escapeHtml(t('roster_staff_role_ph') || 'e.g. Chef de Partie') + '"></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_rate') || 'Hourly rate') + '</label><input type="number" class="input" id="stRate" value="' + PCD.escapeHtml(st.rate != null ? String(st.rate) : '') + '" step="0.01" min="0" placeholder="' + PCD.escapeHtml((PCD.currencySymbol && PCD.currencySymbol() || '$')) + '/h"></div></div>';
    const save = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Save', style: { flex: '1' } });
    const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
    let del = null; if (existing) del = PCD.el('button', { class: 'btn btn-ghost', text: t('delete') || 'Delete', style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (del) footer.appendChild(del); footer.appendChild(cancel); footer.appendChild(save);
    const m = PCD.modal.open({ title: existing ? (existing.name || t('roster_staff') || 'Staff') : (t('roster_add_staff') || 'Add staff'), body: body, footer: footer, size: 'sm', closable: true });
    cancel.addEventListener('click', function () { m.close(); });
    if (del) del.addEventListener('click', function () {
      data.staff = (data.staff || []).filter(function (s) { return s.id !== st.id; });
      if (data.cells) delete data.cells[st.id];
      persist(data); m.close(); render(view);
    });
    save.addEventListener('click', function () {
      st.name = (PCD.$('#stName', body).value || '').trim();
      if (!st.name) { PCD.toast.error(t('toast_name_required') || 'Name required'); return; }
      st.role = (PCD.$('#stRole', body).value || '').trim();
      const rv = PCD.$('#stRate', body).value; st.rate = rv === '' ? '' : (Number(rv) || 0);
      data.staff = data.staff || [];
      if (existing) { const i = data.staff.findIndex(function (s) { return s.id === st.id; }); if (i >= 0) data.staff[i] = st; else data.staff.push(st); }
      else data.staff.push(st);
      persist(data); m.close(); render(view);
    });
  }

  function openCellEditor(view, data, sid, day) {
    const st = (data.staff || []).find(function (s) { return s.id === sid; });
    if (!st) return;
    data.cells = data.cells || {}; data.cells[sid] = data.cells[sid] || {};
    const cur = data.cells[sid][day] || { start: '', end: '', note: '' };
    const body = PCD.el('div');
    const tplBtns = (data.templates || []).map(function (tp) {
      return '<button type="button" class="btn btn-outline btn-sm" data-pick-tpl="' + tp.id + '">' + PCD.escapeHtml((tp.label || '') + ' ' + (tp.start || '') + '-' + (tp.end || '')) + '</button>';
    }).join('');
    body.innerHTML =
      '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(st.name + ' · ' + dayLabel(data.weekStart, day)) + '</div>' +
      (tplBtns ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + tplBtns + '</div>' : '') +
      '<div class="field-row"><div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_start') || 'Start') + '</label><input type="time" class="input" id="cStart" value="' + PCD.escapeHtml(cur.start || '') + '"></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_end') || 'End') + '</label><input type="time" class="input" id="cEnd" value="' + PCD.escapeHtml(cur.end || '') + '"></div></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_note') || 'Note') + '</label><input type="text" class="input" id="cNote" value="' + PCD.escapeHtml(cur.note || '') + '" placeholder="' + PCD.escapeHtml(t('roster_note_ph') || 'optional') + '"></div>';
    const save = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Save', style: { flex: '1' } });
    const clear = PCD.el('button', { class: 'btn btn-ghost', text: t('roster_clear') || 'Clear', style: { color: 'var(--danger)' } });
    const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(clear); footer.appendChild(cancel); footer.appendChild(save);
    const m = PCD.modal.open({ title: t('roster_shift') || 'Shift', body: body, footer: footer, size: 'sm', closable: true });
    PCD.on(body, 'click', '[data-pick-tpl]', function () {
      const id = this.getAttribute('data-pick-tpl');
      const tp = (data.templates || []).find(function (x) { return x.id === id; });
      if (tp) { PCD.$('#cStart', body).value = tp.start || ''; PCD.$('#cEnd', body).value = tp.end || ''; }
    });
    cancel.addEventListener('click', function () { m.close(); });
    clear.addEventListener('click', function () { delete data.cells[sid][day]; persist(data); m.close(); render(view); });
    save.addEventListener('click', function () {
      const s = PCD.$('#cStart', body).value, e = PCD.$('#cEnd', body).value;
      if (!s || !e) { delete data.cells[sid][day]; } else { data.cells[sid][day] = { start: s, end: e, note: (PCD.$('#cNote', body).value || '').trim() }; }
      persist(data); m.close(); render(view);
    });
  }

  // ============ OUTPUTS ============
  function rosterRows(data, showCost) {
    // returns { headers, rows, align } for table/excel
    const dayCount = data.dayCount || 7;
    const headers = [t('roster_staff') || 'Staff'];
    for (let d = 0; d < dayCount; d++) headers.push(dayLabel(data.weekStart, d));
    headers.push(t('roster_hours') || 'Hours');
    if (showCost) headers.push(t('roster_labour_cost') || 'Cost');
    const rows = [];
    (data.staff || []).forEach(function (st) {
      const cells = (data.cells && data.cells[st.id]) || {};
      const row = [st.name + (st.role ? ' (' + st.role + ')' : '')];
      for (let d = 0; d < dayCount; d++) { const c = cells[d]; row.push(c && c.start && c.end ? (c.start + '-' + c.end + (c.note ? ' ' + c.note : '')) : '—'); }
      row.push(PCD.fmtNumber(staffHours(data, st.id)));
      if (showCost) row.push(staffCost(data, st) > 0 ? PCD.fmtMoney(staffCost(data, st)) : '—');
      rows.push(row);
    });
    const align = headers.map(function (_, i) { return i === 0 ? 'left' : (i >= dayCount + 1 ? 'right' : 'center'); });
    return { headers: headers, rows: rows, align: align };
  }

  function printRoster(data, showCost) {
    const tbl = rosterRows(data, showCost);
    const tot = rosterTotals(data);
    let body = '<h1>' + PCD.escapeHtml(data.name || (t('roster_title') || 'Roster')) + '</h1>' +
      '<div class="meta">' + PCD.escapeHtml(weekRange(data)) + '</div><table><thead><tr>' +
      tbl.headers.map(function (h) { return '<th>' + PCD.escapeHtml(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      tbl.rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i === 0 ? '' : ' style="text-align:center;"') + '>' + PCD.escapeHtml(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>' +
      '<div class="tot">' + PCD.escapeHtml(t('roster_total_hours') || 'Total hours') + ': <b>' + PCD.fmtNumber(tot.hours) + '</b>' + (showCost && tot.cost > 0 ? ' · ' + PCD.escapeHtml(t('roster_labour_cost') || 'Labour cost') + ': <b>' + PCD.fmtMoney(tot.cost) + '</b>' : '') + '</div>';
    const html = '<style>@page{size:A4 landscape;margin:12mm;}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;}h1{font-size:20pt;margin:0;color:#16a34a;}.meta{color:#666;margin:2px 0 12px;font-size:11pt;}table{width:100%;border-collapse:collapse;font-size:9pt;}th,td{border:1px solid #ddd;padding:4px 6px;}th{background:#16a34a;color:#fff;font-size:8.5pt;}.tot{margin-top:12px;font-size:11pt;}</style>' + body;
    PCD.print(html, (t('roster_title') || 'Roster') + ' ' + data.weekStart);
  }

  function excelRoster(data, showCost) {
    const go = function (XLSX) {
      if (!XLSX || !XLSX.utils || !PCD.xlsx) { PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable'); return; }
      const tbl = rosterRows(data, showCost);
      PCD.xlsx.save(XLSX, [{
        name: 'Roster',
        title: (data.name || (t('roster_title') || 'Roster')) + ' — ' + weekRange(data),
        headers: tbl.headers, rows: tbl.rows, align: tbl.align,
      }], (t('roster_title') || 'Roster').replace(/\s+/g, '-').toLowerCase() + '-' + data.weekStart + '.xlsx');
    };
    if (window.XLSX && window.XLSX.utils) go(window.XLSX);
    else if (PCD.loadXLSX) PCD.loadXLSX().then(go).catch(function () { PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable'); });
    else PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable');
  }

  function buildShareText(data, showCost) {
    const dayCount = data.dayCount || 7;
    const lines = [];
    lines.push((data.name || (t('roster_title') || 'Roster')) + ' — ' + weekRange(data));
    lines.push('');
    (data.staff || []).forEach(function (st) {
      const cells = (data.cells && data.cells[st.id]) || {};
      const parts = [];
      for (let d = 0; d < dayCount; d++) { const c = cells[d]; if (c && c.start && c.end) parts.push(addDays(data.weekStart, d).toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { weekday: 'short' }) + ' ' + c.start + '-' + c.end); }
      let line = st.name + ': ' + (parts.length ? parts.join(', ') : (t('roster_off') || 'off'));
      if (showCost && staffCost(data, st) > 0) line += '  (' + PCD.fmtNumber(staffHours(data, st.id)) + 'h · ' + PCD.fmtMoney(staffCost(data, st)) + ')';
      lines.push(line);
    });
    const tot = rosterTotals(data);
    lines.push('');
    lines.push((t('roster_total_hours') || 'Total hours') + ': ' + PCD.fmtNumber(tot.hours) + (showCost && tot.cost > 0 ? ' · ' + PCD.fmtMoney(tot.cost) : ''));
    return lines.join('\n');
  }

  function shareRoster(data, showCost) {
    const message = buildShareText(data, showCost);
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_message') || 'Message (editable)') + '</label>' +
      '<textarea class="textarea" id="rMsg" rows="10" style="font-family:var(--font-mono);font-size:13px;white-space:pre;">' + PCD.escapeHtml(message) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:12px;">' +
        '<button class="btn btn-outline" id="rWa" style="flex-direction:column;height:auto;padding:12px 6px;gap:5px;"><span style="color:#25D366;">' + PCD.icon('message-circle', 22) + '</span><span style="font-size:11px;font-weight:600;">WhatsApp</span></button>' +
        '<button class="btn btn-outline" id="rSms" style="flex-direction:column;height:auto;padding:12px 6px;gap:5px;"><span style="color:var(--brand-600);">' + PCD.icon('phone', 22) + '</span><span style="font-size:11px;font-weight:600;">SMS</span></button>' +
        '<button class="btn btn-outline" id="rMail" style="flex-direction:column;height:auto;padding:12px 6px;gap:5px;"><span style="color:#EA4335;">' + PCD.icon('mail', 22) + '</span><span style="font-size:11px;font-weight:600;">Email</span></button>' +
        '<button class="btn btn-outline" id="rCopy" style="flex-direction:column;height:auto;padding:12px 6px;gap:5px;"><span style="color:var(--text-2);">' + PCD.icon('copy', 22) + '</span><span style="font-size:11px;font-weight:600;">' + PCD.escapeHtml(t('supplier_ch_copy') || 'Copy') + '</span></button>' +
      '</div>';
    const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('btn_close') || 'Close' });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } }); footer.appendChild(cancel);
    const m = PCD.modal.open({ title: t('roster_share') || 'Share / Send', body: body, footer: footer, size: 'md', closable: true });
    function msg() { return PCD.$('#rMsg', body).value; }
    cancel.addEventListener('click', function () { m.close(); });
    PCD.$('#rWa', body).addEventListener('click', function () { window.open('https://wa.me/?text=' + encodeURIComponent(msg()), '_blank'); m.close(); });
    PCD.$('#rSms', body).addEventListener('click', function () { window.location.href = 'sms:?&body=' + encodeURIComponent(msg()); m.close(); });
    PCD.$('#rMail', body).addEventListener('click', function () { window.location.href = 'mailto:?subject=' + encodeURIComponent((data.name || 'Roster') + ' — ' + weekRange(data)) + '&body=' + encodeURIComponent(msg()); m.close(); });
    PCD.$('#rCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(msg()).then(function () { PCD.toast.success(t('toast_copied_to_clipboard') || 'Copied'); });
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.roster = { render: render };
})();
