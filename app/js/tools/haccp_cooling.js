/* ================================================================
   ProChefDesk — haccp_cooling.js (v2.6.26 redesign)
   HACCP Forms · Cook & Cool Log

   Date-based form: each day = one A4 landscape page with 15 rows.
   Rows can be filled directly via tap (popup), printed blank for
   manual writing, or printed with current data baked in.

   HACCP gates (FDA Food Code 2017):
     - Cook end ≥ 60°C / 135°F
     - 2h checkpoint ≤ 21°C / 70°F
     - 6h end ≤ 5°C / 41°F

   Storage: workspace-bound table 'haccpCookCool'.
   Each record has a `date` (YYYY-MM-DD) so we can group by day.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'haccpCookCool';
  const ROWS_PER_PAGE = 15;

  // HACCP cooling targets
  const TARGET_2H_C = 21;
  const TARGET_6H_C = 5;

  function locale() { return (PCD.i18n && PCD.i18n.currentLocale) || 'en'; }
  function getTempUnit() {
    const pref = PCD.store && PCD.store.get && PCD.store.get('prefs.haccpTempUnit');
    return pref === 'F' ? 'F' : 'C';
  }
  function ctoF(c) { return Math.round((c * 9 / 5 + 32) * 10) / 10; }
  function fmtTemp(c) {
    if (c === null || c === undefined || c === '') return '—';
    const u = getTempUnit();
    const v = u === 'F' ? ctoF(c) : c;
    return v + '°';
  }
  function targetForUI(c) {
    return getTempUnit() === 'F' ? ctoF(c) + '°F' : c + '°C';
  }

  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function todayYmd() { return ymd(new Date()); }
  function shiftDate(yymmdd, days) {
    const d = new Date(yymmdd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return ymd(d);
  }
  function dateLabel(yymmdd) {
    const d = new Date(yymmdd + 'T00:00:00');
    return d.toLocaleDateString(locale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function listForDate(dateStr) {
    return (PCD.store.listTable(TABLE) || []).filter(function (r) {
      return r.date === dateStr;
    }).slice().sort(function (a, b) {
      return (a.rowIndex || 0) - (b.rowIndex || 0);
    });
  }
  function listDatesWithRecords() {
    const dates = {};
    (PCD.store.listTable(TABLE) || []).forEach(function (r) {
      if (r.date) dates[r.date] = true;
    });
    return Object.keys(dates).sort().reverse();
  }

  let _viewDate = todayYmd();

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const records = listForDate(_viewDate);
    const dates = listDatesWithRecords();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌡 ' + (t('hcc_title') || 'Cook & Cool Log') + '</div>' +
          '<div class="page-subtitle">' + (t('hcc_subtitle') || 'HACCP cooling: 60°C → 21°C in 2h → 5°C in 6h total') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="hccPrintBlankBtn" title="' + PCD.escapeHtml(t('hcc_print_blank_tip') || 'Boş formu yazdır, elle doldur') + '">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hcc_print_blank') || 'Boş yazdır') + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="hccPrintDayBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hcc_print_day') || 'Bu günü yazdır') + '</span></button>' +
        '</div>' +
      '</div>';

    const isToday = _viewDate === todayYmd();
    const dateNav = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' } });
    dateNav.innerHTML =
      '<button class="btn btn-outline btn-sm" id="hccPrevDay" aria-label="' + PCD.escapeHtml(t('prev_day') || 'Önceki gün') + '">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;">' +
        '<div style="font-weight:700;font-size:15px;">' + PCD.escapeHtml(dateLabel(_viewDate)) + (isToday ? ' · <span style="color:var(--brand-700);font-size:11px;">' + PCD.escapeHtml(t('today') || 'Bugün') + '</span>' : '') + '</div>' +
        '<div class="text-muted" style="font-size:11px;">' + records.length + ' / ' + ROWS_PER_PAGE + ' ' + PCD.escapeHtml(t('hcc_filled') || 'dolu') + '</div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" id="hccTodayBtn" ' + (isToday ? 'disabled' : '') + '>' + PCD.escapeHtml(t('today') || 'Bugün') + '</button>' +
      '<button class="btn btn-outline btn-sm" id="hccNextDay" aria-label="' + PCD.escapeHtml(t('next_day') || 'Sonraki gün') + '">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(dateNav);

    if (dates.length > 0) {
      const quickJump = PCD.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' } });
      const label = PCD.el('span', { style: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }, text: (t('hcc_recent_days') || 'Son kayıtlı günler') + ':' });
      quickJump.appendChild(label);
      dates.slice(0, 5).forEach(function (d) {
        const isActive = d === _viewDate;
        const btn = PCD.el('button', {
          class: 'btn btn-' + (isActive ? 'primary' : 'outline') + ' btn-sm',
          style: { fontSize: '12px', padding: '4px 10px' },
          'data-jump': d,
        });
        const dDate = new Date(d + 'T00:00:00');
        btn.textContent = dDate.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
        quickJump.appendChild(btn);
      });
      view.appendChild(quickJump);
    }

    // Build the table
    const wrap = PCD.el('div', { class: 'card', style: { padding: '0', overflowX: 'auto' } });
    const target2h = targetForUI(TARGET_2H_C);
    const target6h = targetForUI(TARGET_6H_C);

    let table =
      '<table style="width:100%;min-width:1100px;border-collapse:collapse;font-size:12px;table-layout:fixed;">' +
        '<thead style="background:var(--surface-2);">' +
          '<tr>' +
            '<th style="width:32px;padding:8px 4px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">#</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:22%;">' + PCD.escapeHtml(t('hcc_col_food') || 'Yemek / Parti') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hcc_col_qty') || 'Miktar') + '</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + '</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">+2h <span style="font-weight:400;color:var(--text-3);">≤' + target2h + '</span></th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' <span style="font-weight:400;color:var(--text-3);">≤' + target6h + '</span></th>' +
            '<th style="padding:8px 6px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:14%;">' + PCD.escapeHtml(t('hcc_col_note') || 'Düzeltici eylem') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hcc_col_chef') || 'Şef') + '</th>' +
          '</tr>' +
          '<tr>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:7%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:7%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:7%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:7%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:7%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:7%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
          '</tr>' +
        '</thead><tbody>';

    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const r = byRow[i];
      const filled = !!r;
      const rowBg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-1)';
      table += '<tr data-row="' + i + '" style="background:' + rowBg + ';cursor:pointer;height:32px;" class="hcc-row">';
      table += '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-3);border-bottom:1px solid var(--border);font-weight:600;">' + (i + 1) + '</td>';
      if (filled) {
        const cookTime = r.cookEndAt ? new Date(r.cookEndAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const cp2hTime = r.cp2hAt ? new Date(r.cp2hAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const finalTime = r.endedAt ? new Date(r.endedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const cp2hFail = r.cp2hTemp != null && r.cp2hTemp > TARGET_2H_C;
        const endFail = r.endedTemp != null && r.endedTemp > TARGET_6H_C;

        table +=
          '<td style="padding:4px 8px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.foodName || '') + '</td>' +
          '<td style="padding:4px 6px;text-align:center;font-size:11px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + (r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + fmtTemp(r.cookEndTemp) + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);">' + (cookTime || '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (cp2hFail ? 'background:#fee2e2;color:#991b1b;' : '') + '">' + (r.cp2hTemp != null ? (cp2hFail ? '⚠ ' : '') + fmtTemp(r.cp2hTemp) : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);' + (cp2hFail ? 'background:#fee2e2;' : '') + '">' + (cp2hTime || '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (endFail ? 'background:#fee2e2;color:#991b1b;' : '') + '">' + (r.endedTemp != null ? (endFail ? '⚠ ' : '') + fmtTemp(r.endedTemp) : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);' + (endFail ? 'background:#fee2e2;' : '') + '">' + (finalTime || '—') + '</td>' +
          '<td style="padding:4px 6px;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.note || '') + '">' + PCD.escapeHtml(r.note || '—') + '</td>' +
          '<td style="padding:4px 6px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.chef || '—') + '</td>';
      } else {
        table +=
          '<td colspan="10" style="padding:4px 12px;font-size:13px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:var(--text-3);font-weight:300;font-size:16px;">+</span> <span style="font-style:italic;font-size:11px;">' + PCD.escapeHtml(t('hcc_click_to_fill') || 'Doldurmak için tıkla') + '</span></span>' +
          '</td>';
      }
      table += '</tr>';
    }
    table += '</tbody></table>';
    wrap.innerHTML = table;
    view.appendChild(wrap);

    PCD.$('#hccPrevDay', view).addEventListener('click', function () {
      _viewDate = shiftDate(_viewDate, -1);
      render(view);
    });
    PCD.$('#hccNextDay', view).addEventListener('click', function () {
      _viewDate = shiftDate(_viewDate, 1);
      render(view);
    });
    const todayBtn = PCD.$('#hccTodayBtn', view);
    if (todayBtn) todayBtn.addEventListener('click', function () {
      _viewDate = todayYmd();
      render(view);
    });
    PCD.$('#hccPrintBlankBtn', view).addEventListener('click', function () { printDay(_viewDate, true); });
    PCD.$('#hccPrintDayBtn', view).addEventListener('click', function () { printDay(_viewDate, false); });

    PCD.on(view, 'click', '[data-jump]', function () {
      _viewDate = this.getAttribute('data-jump');
      render(view);
    });
    PCD.on(view, 'click', '[data-row]', function () {
      const idx = parseInt(this.getAttribute('data-row'), 10);
      const existing = byRow[idx];
      openRowEditor(idx, existing, function () { render(view); });
    });
  }

  // ============ ROW EDITOR ============
  function openRowEditor(rowIndex, existing, onClose) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const target2h = targetForUI(TARGET_2H_C);
    const target6h = targetForUI(TARGET_6H_C);

    const data = existing ? Object.assign({}, existing) : {
      date: _viewDate, rowIndex: rowIndex,
      foodName: '', quantity: '', quantityUnit: '',
      cookEndTemp: null, cookEndAt: null,
      cp2hTemp: null, cp2hAt: null,
      endedTemp: null, endedAt: null,
      note: '', chef: '',
    };

    function hhmmFromIso(iso) {
      if (!iso) return '';
      try { return new Date(iso).toTimeString().slice(0, 5); } catch (e) { return ''; }
    }
    function isoFromHhmm(hhmm, dateStr) {
      if (!hhmm) return null;
      const d = new Date(dateStr + 'T' + hhmm + ':00');
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--text-2);">' +
        '🌡 ' + PCD.escapeHtml(t('hcc_row_intro') || 'Bu satırı doldur. Boş bıraktığın alanlar tabloda — olarak görünür.') +
      '</div>' +
      '<div style="margin-bottom:10px;">' +
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_food_name') || 'Yemek / Parti adı') + '</label>' +
        '<input id="rfFood" type="text" maxlength="60" value="' + PCD.escapeHtml(data.foodName || '') + '" placeholder="' + PCD.escapeHtml(t('hcc_food_placeholder') || 'örn. Domates çorbası, tavuk göğsü') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
        '<div style="flex:1.4;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_quantity') || 'Miktar') + '</label>' +
          '<input id="rfQty" type="text" maxlength="15" value="' + PCD.escapeHtml(data.quantity || '') + '" placeholder="örn. 5" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_unit') || 'Birim') + '</label>' +
          '<input id="rfQtyU" type="text" maxlength="8" value="' + PCD.escapeHtml(data.quantityUnit || '') + '" placeholder="L / kg / adet" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">🔥 ' + PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<input id="rfCookT" type="number" step="0.1" placeholder="60" value="' + (data.cookEndTemp != null ? data.cookEndTemp : '') + '" style="flex:1;padding:8px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;text-align:center;box-sizing:border-box;width:0;min-width:0;">' +
            '<span style="display:flex;align-items:center;color:var(--text-3);font-size:13px;">°' + u + '</span>' +
          '</div>' +
          '<input id="rfCookH" type="time" value="' + hhmmFromIso(data.cookEndAt) + '" style="width:100%;padding:6px 8px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:12px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">🌡 +2h <span style="font-weight:400;">≤' + target2h + '</span></div>' +
          '<div style="display:flex;gap:4px;">' +
            '<input id="rfCp2hT" type="number" step="0.1" placeholder="' + (u === 'F' ? '70' : '21') + '" value="' + (data.cp2hTemp != null ? data.cp2hTemp : '') + '" style="flex:1;padding:8px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;text-align:center;box-sizing:border-box;width:0;min-width:0;">' +
            '<span style="display:flex;align-items:center;color:var(--text-3);font-size:13px;">°' + u + '</span>' +
          '</div>' +
          '<input id="rfCp2hH" type="time" value="' + hhmmFromIso(data.cp2hAt) + '" style="width:100%;padding:6px 8px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:12px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">✓ ' + PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' <span style="font-weight:400;">≤' + target6h + '</span></div>' +
          '<div style="display:flex;gap:4px;">' +
            '<input id="rfEndT" type="number" step="0.1" placeholder="' + (u === 'F' ? '41' : '5') + '" value="' + (data.endedTemp != null ? data.endedTemp : '') + '" style="flex:1;padding:8px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;text-align:center;box-sizing:border-box;width:0;min-width:0;">' +
            '<span style="display:flex;align-items:center;color:var(--text-3);font-size:13px;">°' + u + '</span>' +
          '</div>' +
          '<input id="rfEndH" type="time" value="' + hhmmFromIso(data.endedAt) + '" style="width:100%;padding:6px 8px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:12px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:8px;">' +
        '<label style="display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:12px;margin-bottom:4px;">' +
          '<span>' + PCD.escapeHtml(t('hcc_corrective_action') || 'Düzeltici eylem / not') + '</span>' +
          '<span style="font-weight:400;font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('optional') || 'opsiyonel') + '</span>' +
        '</label>' +
        '<textarea id="rfNote" rows="2" maxlength="200" placeholder="' + PCD.escapeHtml(t('hcc_note_placeholder') || 'örn. Buz banyosu kullanıldı, sığ tepsilere alındı') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + PCD.escapeHtml(data.note || '') + '</textarea>' +
      '</div>' +
      '<div>' +
        '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_col_chef') || 'Şef') + '</label>' +
        '<input id="rfChef" type="text" maxlength="40" value="' + PCD.escapeHtml(data.chef || '') + '" placeholder="' + PCD.escapeHtml(t('hcc_chef_placeholder') || 'Adın / inisiyallerin') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
      '</div>';

    setTimeout(function () { body.querySelector('#rfFood').focus(); }, 80);

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Kaydet', style: { flex: '2' } });
    const deleteBtn = existing ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Sil', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: '🌡 ' + (existing ? (t('hcc_edit_row') || 'Satırı düzenle') : (t('hcc_new_row') || 'Yeni satır')) + ' #' + (rowIndex + 1),
      body: body, footer: footer, size: 'md', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('hcc_delete_title') || 'Bu satır silinsin mi?',
        text: t('hcc_delete_msg') || 'Pişirme & soğutma kaydı kalıcı olarak silinir.',
        okText: t('act_delete') || 'Sil',
      }).then(function (ok) {
        if (!ok) return;
        if (data.id) PCD.store.deleteFromTable(TABLE, data.id);
        PCD.toast.success(t('hcc_deleted') || 'Kayıt silindi');
        m.close();
        if (onClose) onClose();
      });
    });
    saveBtn.addEventListener('click', function () {
      const food = body.querySelector('#rfFood').value.trim();
      data.foodName = food;
      data.quantity = body.querySelector('#rfQty').value.trim();
      data.quantityUnit = body.querySelector('#rfQtyU').value.trim();

      const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
      data.cookEndTemp = num(body.querySelector('#rfCookT').value);
      data.cookEndAt = isoFromHhmm(body.querySelector('#rfCookH').value, _viewDate);
      data.cp2hTemp = num(body.querySelector('#rfCp2hT').value);
      data.cp2hAt = isoFromHhmm(body.querySelector('#rfCp2hH').value, _viewDate);
      data.endedTemp = num(body.querySelector('#rfEndT').value);
      data.endedAt = isoFromHhmm(body.querySelector('#rfEndH').value, _viewDate);
      data.note = body.querySelector('#rfNote').value.trim();
      data.chef = body.querySelector('#rfChef').value.trim();

      if (!food && data.cookEndTemp == null && data.cp2hTemp == null && data.endedTemp == null) {
        PCD.toast.error(t('hcc_at_least_one') || 'En az yemek adı veya bir sıcaklık girin');
        return;
      }

      PCD.store.upsertInTable(TABLE, data, 'cce');
      PCD.toast.success(t('saved') || 'Kaydedildi');
      m.close();
      if (onClose) onClose();
    });
  }

  // ============ PRINT ============
  function printDay(dateStr, blank) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const target2h = targetForUI(TARGET_2H_C);
    const target6h = targetForUI(TARGET_6H_C);
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';

    const records = (blank || !dateStr) ? [] : listForDate(dateStr);
    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    const headerDate = dateStr && !blank ? new Date(dateStr + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '________________________';

    let html =
      '<style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:0;}' +
        '.h-head{margin-bottom:6px;border-bottom:2px solid #16a34a;padding-bottom:4px;display:flex;justify-content:space-between;align-items:flex-end;}' +
        '.h-head h1{margin:0;font-size:14px;}' +
        '.h-head .sub{font-size:10px;color:#555;margin-top:1px;}' +
        '.h-head .right{font-size:10px;color:#555;text-align:end;}' +
        'table.h-grid{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;}' +
        'table.h-grid th, table.h-grid td{border:1px solid #999;padding:3px 4px;vertical-align:middle;}' +
        'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:0.04em;}' +
        'table.h-grid td.idx{text-align:center;width:3%;font-weight:700;color:#666;}' +
        'table.h-grid td.food{width:22%;font-weight:600;}' +
        'table.h-grid td.qty{width:9%;text-align:center;}' +
        'table.h-grid td.t{width:7%;text-align:center;font-weight:600;}' +
        'table.h-grid td.h{width:7%;text-align:center;color:#666;font-size:8px;}' +
        'table.h-grid td.note{width:14%;font-size:8px;}' +
        'table.h-grid td.chef{width:9%;text-align:center;}' +
        'table.h-grid td.fail{background:#fee2e2;color:#991b1b;font-weight:700;}' +
        '.h-foot{margin-top:6px;display:flex;justify-content:space-between;font-size:9px;}' +
        '.h-foot .legend{color:#666;}' +
        '.h-brand{margin-top:4px;text-align:center;font-size:7px;color:#999;}' +
        '.pcd-print-footer{display:none !important;}' +
        '@page{size:A4 landscape;margin:6mm;}' +
      '</style>' +
      '<div class="h-head">' +
        '<div>' +
          '<h1>HACCP · ' + PCD.escapeHtml(t('hcc_title') || 'Cook & Cool Log') + '</h1>' +
          '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(headerDate) + ' · °' + u + '</div>' +
        '</div>' +
        '<div class="right">' +
          '<div><strong>' + PCD.escapeHtml(t('hcc_target_2h') || '2h hedef') + ':</strong> ≤' + target2h + '</div>' +
          '<div><strong>' + PCD.escapeHtml(t('hcc_target_6h') || '6h hedef') + ':</strong> ≤' + target6h + '</div>' +
        '</div>' +
      '</div>' +
      '<table class="h-grid"><thead>' +
        '<tr>' +
          '<th rowspan="2">#</th>' +
          '<th rowspan="2">' + PCD.escapeHtml(t('hcc_col_food') || 'Yemek / Parti') + '</th>' +
          '<th rowspan="2">' + PCD.escapeHtml(t('hcc_col_qty') || 'Miktar') + '</th>' +
          '<th colspan="2">' + PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + '</th>' +
          '<th colspan="2">+2h <span style="font-weight:400;">≤' + target2h + '</span></th>' +
          '<th colspan="2">' + PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' <span style="font-weight:400;">≤' + target6h + '</span></th>' +
          '<th rowspan="2">' + PCD.escapeHtml(t('hcc_col_note') || 'Düzeltici eylem') + '</th>' +
          '<th rowspan="2">' + PCD.escapeHtml(t('hcc_col_chef') || 'Şef') + '</th>' +
        '</tr>' +
        '<tr>' +
          '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
          '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
          '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
        '</tr>' +
      '</thead><tbody>';

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const r = byRow[i];
      const cookT = r && r.cookEndTemp != null ? (u === 'F' ? ctoF(r.cookEndTemp) : r.cookEndTemp) + '°' : '';
      const cookH = r && r.cookEndAt ? new Date(r.cookEndAt).toTimeString().slice(0, 5) : '';
      const cp2hT = r && r.cp2hTemp != null ? (u === 'F' ? ctoF(r.cp2hTemp) : r.cp2hTemp) + '°' : '';
      const cp2hH = r && r.cp2hAt ? new Date(r.cp2hAt).toTimeString().slice(0, 5) : '';
      const endT = r && r.endedTemp != null ? (u === 'F' ? ctoF(r.endedTemp) : r.endedTemp) + '°' : '';
      const endH = r && r.endedAt ? new Date(r.endedAt).toTimeString().slice(0, 5) : '';
      const cp2hFail = r && r.cp2hTemp != null && r.cp2hTemp > TARGET_2H_C;
      const endFail = r && r.endedTemp != null && r.endedTemp > TARGET_6H_C;

      html += '<tr style="height:22px;">' +
        '<td class="idx">' + (i + 1) + '</td>' +
        '<td class="food">' + (r ? PCD.escapeHtml(r.foodName || '') : '') + '</td>' +
        '<td class="qty">' + (r && r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '') + '</td>' +
        '<td class="t">' + cookT + '</td>' +
        '<td class="h">' + cookH + '</td>' +
        '<td class="t' + (cp2hFail ? ' fail' : '') + '">' + cp2hT + '</td>' +
        '<td class="h' + (cp2hFail ? ' fail' : '') + '">' + cp2hH + '</td>' +
        '<td class="t' + (endFail ? ' fail' : '') + '">' + endT + '</td>' +
        '<td class="h' + (endFail ? ' fail' : '') + '">' + endH + '</td>' +
        '<td class="note">' + (r ? PCD.escapeHtml(r.note || '') : '') + '</td>' +
        '<td class="chef">' + (r ? PCD.escapeHtml(r.chef || '') : '') + '</td>' +
      '</tr>';
    }

    html += '</tbody></table>' +
      '<div class="h-foot">' +
        '<div class="legend">' +
          '<strong>' + PCD.escapeHtml(t('hcc_legend') || 'HACCP gates') + ':</strong> ' +
          PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + ' ≥' + targetForUI(60) + ' · ' +
          '+2h ≤' + target2h + ' · ' +
          PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' ≤' + target6h +
        '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('reviewed_by') || 'Kontrol eden') + ':</strong> ____________________</div>' +
      '</div>' +
      '<div class="h-brand">Made with ProChefDesk · prochefdesk.com</div>';

    PCD.print(html, 'HACCP Cook & Cool · ' + (dateStr || 'Blank'));
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpCooling = {
    render: render,
    openEditor: function () {
      const records = listForDate(_viewDate);
      const used = {};
      records.forEach(function (r) { if (typeof r.rowIndex === 'number') used[r.rowIndex] = true; });
      let firstEmpty = 0;
      while (used[firstEmpty] && firstEmpty < ROWS_PER_PAGE) firstEmpty++;
      if (firstEmpty >= ROWS_PER_PAGE) {
        PCD.toast.info((PCD.i18n.t && PCD.i18n.t('hcc_day_full')) || 'Bu gün dolu, sonraki güne geç');
        return;
      }
      openRowEditor(firstEmpty, null, function () {
        const v = document.getElementById('view');
        if (v && PCD.router.currentView() === 'haccp_cooling') render(v);
      });
    },
  };
})();
