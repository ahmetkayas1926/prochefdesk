/* ================================================================
   ProChefDesk — haccp_holding.js (v2.8.39)
   HACCP Forms · Hot/Cold Holding Check Log

   Date-based, food-row format: each day = one A4 landscape page with
   15 rows. Each row tracks ONE food item being held hot or cold,
   with 3 hourly temperature checks (saat + sıcaklık).

   HACCP gates:
     - Hot holding: ≥60°C / 140°F (Danger zone if below)
     - Cold holding: ≤5°C / 41°F (Danger zone if above)

   Storage: workspace-bound table 'haccpHolding'.
   v2.8.39: IDB-only (cloud sync ertelendi)
   v2.8.44: cloud sync devrede — migrations/v2.8.44-haccp-receiving-holding.sql
            ile haccp_holding tablosu + RLS + realtime publication açıldı.
            store.upsertInTable() artık _stateKeyToSqlTable map'inden
            'haccp_holding' karşılığını alıp cloud-pertable queue'ya
            push ediyor. Pull/realtime/drift detection da bu tabloyu
            tanıyor — diğer cihazlar 1-2 sn içinde güncellenir.
   Each record has a `date` (YYYY-MM-DD) so we can group by day.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'haccpHolding';
  const ROWS_PER_PAGE = 15;

  // HACCP targets
  const TARGET_HOT_C = 60;
  const TARGET_COLD_C = 5;

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
  function isPass(holdType, tempC) {
    if (tempC === null || tempC === undefined || tempC === '') return null;
    return holdType === 'cold' ? tempC <= TARGET_COLD_C : tempC >= TARGET_HOT_C;
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
    const targetHot = targetForUI(TARGET_HOT_C);
    const targetCold = targetForUI(TARGET_COLD_C);

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌡 ' + (t('hhd_title') || 'Sıcak/Soğuk Tutma Kontrolü') + '</div>' +
          '<div class="page-subtitle">' + (t('hhd_subtitle') || 'Yemek bazlı saatlik kontrol · Sıcak ≥' + targetHot + ', Soğuk ≤' + targetCold) + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="hhdPrintMonthBtn" title="' + PCD.escapeHtml(t('hhd_print_month_tip') || '31 satırlık aylık form, ay başında bir kez yazdır') + '">' + PCD.icon('calendar', 14) + ' <span>' + PCD.escapeHtml(t('hhd_print_month') || 'Aylık boş') + '</span></button>' +
          '<button class="btn btn-outline btn-sm" id="hhdPrintBlankBtn" title="' + PCD.escapeHtml(t('hhd_print_blank_tip') || 'Boş formu yazdır, elle doldur') + '">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hhd_print_blank') || 'Boş yazdır') + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="hhdPrintDayBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hhd_print_day') || 'Bu günü yazdır') + '</span></button>' +
        '</div>' +
      '</div>';

    const isToday = _viewDate === todayYmd();
    const dateNav = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' } });
    dateNav.innerHTML =
      '<button class="btn btn-outline btn-sm" id="hhdPrevDay" aria-label="' + PCD.escapeHtml(t('prev_day') || 'Önceki gün') + '">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;">' +
        '<div style="font-weight:700;font-size:15px;">' + PCD.escapeHtml(dateLabel(_viewDate)) + (isToday ? ' · <span style="color:var(--brand-700);font-size:11px;">' + PCD.escapeHtml(t('today') || 'Bugün') + '</span>' : '') + '</div>' +
        '<div class="text-muted" style="font-size:11px;">' + records.length + ' / ' + ROWS_PER_PAGE + ' ' + PCD.escapeHtml(t('hhd_filled') || 'dolu') + '</div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" id="hhdTodayBtn" ' + (isToday ? 'disabled' : '') + '>' + PCD.escapeHtml(t('today') || 'Bugün') + '</button>' +
      '<button class="btn btn-outline btn-sm" id="hhdNextDay" aria-label="' + PCD.escapeHtml(t('next_day') || 'Sonraki gün') + '">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(dateNav);

    if (dates.length > 0) {
      const quickJump = PCD.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' } });
      const label = PCD.el('span', { style: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }, text: (t('hhd_recent_days') || 'Son kayıtlı günler') + ':' });
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

    let table =
      '<table style="width:100%;min-width:1150px;border-collapse:collapse;font-size:12px;table-layout:fixed;">' +
        '<thead style="background:var(--surface-2);">' +
          '<tr>' +
            '<th style="width:32px;padding:8px 4px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">#</th>' +
            '<th style="width:40px;padding:8px 4px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hhd_col_type') || 'Tip') + '</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:20%;">' + PCD.escapeHtml(t('hhd_col_food') || 'Yemek') + '</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:13%;">' + PCD.escapeHtml(t('hhd_col_location') || 'Konum') + '</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 1</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 2</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 3</th>' +
            '<th style="padding:8px 6px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:12%;">' + PCD.escapeHtml(t('hhd_col_corrective') || 'Düzeltici') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hhd_col_chef') || 'Şef') + '</th>' +
          '</tr>' +
          '<tr>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);"></th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:6%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:6%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:6%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:6%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:6%;">°' + u + '</th>' +
            '<th style="padding:4px;text-align:center;font-size:9px;color:var(--text-3);border-bottom:1px solid var(--border);width:6%;">' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
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
      table += '<tr data-row="' + i + '" style="background:' + rowBg + ';cursor:pointer;height:32px;" class="hhd-row">';
      table += '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-3);border-bottom:1px solid var(--border);font-weight:600;">' + (i + 1) + '</td>';
      if (filled) {
        const typeMark = r.holdType === 'cold' ? '❄' : '🔥';
        const c1Time = r.check1Time || '';
        const c2Time = r.check2Time || '';
        const c3Time = r.check3Time || '';
        const c1Fail = isPass(r.holdType, r.check1Temp) === false;
        const c2Fail = isPass(r.holdType, r.check2Temp) === false;
        const c3Fail = isPass(r.holdType, r.check3Temp) === false;

        table +=
          '<td style="padding:4px;text-align:center;font-size:14px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + typeMark + '</td>' +
          '<td style="padding:4px 8px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.foodName || '') + '">' + PCD.escapeHtml(r.foodName || '') + '</td>' +
          '<td style="padding:4px 8px;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.location || '') + '">' + PCD.escapeHtml(r.location || '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (c1Fail ? 'background:#fee2e2;color:#991b1b;' : '') + '">' + (r.check1Temp != null ? (c1Fail ? '⚠ ' : '') + fmtTemp(r.check1Temp) : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);' + (c1Fail ? 'background:#fee2e2;' : '') + '">' + (c1Time || '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (c2Fail ? 'background:#fee2e2;color:#991b1b;' : '') + '">' + (r.check2Temp != null ? (c2Fail ? '⚠ ' : '') + fmtTemp(r.check2Temp) : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);' + (c2Fail ? 'background:#fee2e2;' : '') + '">' + (c2Time || '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);' + (c3Fail ? 'background:#fee2e2;color:#991b1b;' : '') + '">' + (r.check3Temp != null ? (c3Fail ? '⚠ ' : '') + fmtTemp(r.check3Temp) : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);' + (c3Fail ? 'background:#fee2e2;' : '') + '">' + (c3Time || '—') + '</td>' +
          '<td style="padding:4px 6px;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.correctiveAction || '') + '">' + PCD.escapeHtml(r.correctiveAction || '—') + '</td>' +
          '<td style="padding:4px 6px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.chef || '—') + '</td>';
      } else {
        table +=
          '<td colspan="11" style="padding:4px 12px;font-size:13px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:var(--text-3);font-weight:300;font-size:16px;">+</span> <span style="font-style:italic;font-size:11px;">' + PCD.escapeHtml(t('hhd_click_to_fill') || 'Doldurmak için tıkla') + '</span></span>' +
          '</td>';
      }
      table += '</tr>';
    }
    table += '</tbody></table>';
    wrap.innerHTML = table;
    view.appendChild(wrap);

    PCD.$('#hhdPrevDay', view).addEventListener('click', function () {
      _viewDate = shiftDate(_viewDate, -1);
      render(view);
    });
    PCD.$('#hhdNextDay', view).addEventListener('click', function () {
      _viewDate = shiftDate(_viewDate, 1);
      render(view);
    });
    const todayBtn = PCD.$('#hhdTodayBtn', view);
    if (todayBtn) todayBtn.addEventListener('click', function () {
      _viewDate = todayYmd();
      render(view);
    });
    PCD.$('#hhdPrintBlankBtn', view).addEventListener('click', function () { printDay(_viewDate, true); });
    PCD.$('#hhdPrintDayBtn', view).addEventListener('click', function () { printDay(_viewDate, false); });
    PCD.$('#hhdPrintMonthBtn', view).addEventListener('click', function () { openMonthPickerModal(); });

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
    const targetHot = targetForUI(TARGET_HOT_C);
    const targetCold = targetForUI(TARGET_COLD_C);

    const data = existing ? Object.assign({}, existing) : {
      date: _viewDate, rowIndex: rowIndex,
      holdType: 'hot',
      foodName: '', location: '',
      check1Temp: null, check1Time: '',
      check2Temp: null, check2Time: '',
      check3Temp: null, check3Time: '',
      correctiveAction: '', chef: '',
    };

    function targetLabel() {
      return data.holdType === 'cold' ? ('≤' + targetCold) : ('≥' + targetHot);
    }
    function targetPlaceholder() {
      if (data.holdType === 'cold') return u === 'F' ? '41' : '5';
      return u === 'F' ? '140' : '60';
    }

    const body = PCD.el('div');
    function paint() {
      body.innerHTML =
        '<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--text-2);">' +
          '🌡 ' + PCD.escapeHtml(t('hhd_row_intro') || 'Tutma kontrolünü doldur. Boş bıraktığın alanlar tabloda — olarak görünür.') +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
          '<button type="button" data-type="hot"  class="btn btn-sm ' + (data.holdType === 'hot'  ? 'btn-primary' : 'btn-outline') + '" style="flex:1;">🔥 ' + PCD.escapeHtml(t('hhd_type_hot')  || 'Sıcak') + '</button>' +
          '<button type="button" data-type="cold" class="btn btn-sm ' + (data.holdType === 'cold' ? 'btn-primary' : 'btn-outline') + '" style="flex:1;">❄ '   + PCD.escapeHtml(t('hhd_type_cold') || 'Soğuk') + '</button>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hhd_col_food') || 'Yemek') + '</label>' +
          '<input id="rfFood" type="text" maxlength="60" value="' + PCD.escapeHtml(data.foodName || '') + '" placeholder="' + PCD.escapeHtml(t('hhd_food_placeholder') || 'örn. Tavuk göğsü, salata bar') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hhd_col_location') || 'Konum') + '</label>' +
          '<input id="rfLoc" type="text" maxlength="40" value="' + PCD.escapeHtml(data.location || '') + '" placeholder="' + PCD.escapeHtml(t('hhd_location_placeholder') || 'örn. Hot table 1, Salat bar') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">' +
          renderCheckCell(1, data.check1Temp, data.check1Time, targetLabel(), targetPlaceholder(), u, t) +
          renderCheckCell(2, data.check2Temp, data.check2Time, targetLabel(), targetPlaceholder(), u, t) +
          renderCheckCell(3, data.check3Temp, data.check3Time, targetLabel(), targetPlaceholder(), u, t) +
        '</div>' +
        '<div style="margin-bottom:8px;">' +
          '<label style="display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:12px;margin-bottom:4px;">' +
            '<span>' + PCD.escapeHtml(t('hhd_col_corrective') || 'Düzeltici eylem') + '</span>' +
            '<span style="font-weight:400;font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('optional') || 'opsiyonel') + '</span>' +
          '</label>' +
          '<textarea id="rfCorr" rows="2" maxlength="200" placeholder="' + PCD.escapeHtml(t('hhd_corrective_placeholder') || 'örn. Yeniden ısıtıldı, ocağa alındı') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + PCD.escapeHtml(data.correctiveAction || '') + '</textarea>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hhd_col_chef') || 'Şef') + '</label>' +
          '<input id="rfChef" type="text" maxlength="40" value="' + PCD.escapeHtml(data.chef || '') + '" placeholder="' + PCD.escapeHtml(t('hhd_chef_placeholder') || 'Adın / inisiyallerin') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>';
    }
    paint();
    setTimeout(function () { const f = body.querySelector('#rfFood'); if (f) f.focus(); }, 80);

    PCD.on(body, 'click', '[data-type]', function () {
      // Capture current input values before repaint
      captureInputs();
      data.holdType = this.getAttribute('data-type');
      paint();
    });

    function captureInputs() {
      const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
      const $ = function (sel) { return body.querySelector(sel); };
      if ($('#rfFood')) data.foodName = $('#rfFood').value.trim();
      if ($('#rfLoc'))  data.location = $('#rfLoc').value.trim();
      if ($('#rfC1T'))  data.check1Temp = num($('#rfC1T').value);
      if ($('#rfC1H'))  data.check1Time = $('#rfC1H').value;
      if ($('#rfC2T'))  data.check2Temp = num($('#rfC2T').value);
      if ($('#rfC2H'))  data.check2Time = $('#rfC2H').value;
      if ($('#rfC3T'))  data.check3Temp = num($('#rfC3T').value);
      if ($('#rfC3H'))  data.check3Time = $('#rfC3H').value;
      if ($('#rfCorr')) data.correctiveAction = $('#rfCorr').value.trim();
      if ($('#rfChef')) data.chef = $('#rfChef').value.trim();
    }

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Kaydet', style: { flex: '2' } });
    const deleteBtn = existing ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Sil', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: '🌡 ' + (existing ? (t('hhd_edit_row') || 'Satırı düzenle') : (t('hhd_new_row') || 'Yeni satır')) + ' #' + (rowIndex + 1),
      body: body, footer: footer, size: 'md', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('hhd_delete_title') || 'Bu satır silinsin mi?',
        text: t('hhd_delete_msg') || 'Tutma kontrolü kaydı kalıcı olarak silinir.',
        okText: t('act_delete') || 'Sil',
      }).then(function (ok) {
        if (!ok) return;
        if (data.id) PCD.store.deleteFromTable(TABLE, data.id);
        PCD.toast.success(t('hhd_deleted') || 'Kayıt silindi');
        m.close();
        if (onClose) onClose();
      });
    });
    saveBtn.addEventListener('click', function () {
      captureInputs();
      if (!data.foodName && data.check1Temp == null && data.check2Temp == null && data.check3Temp == null) {
        PCD.toast.error(t('hhd_at_least_one') || 'En az yemek adı veya bir sıcaklık girin');
        return;
      }
      PCD.store.upsertInTable(TABLE, data, 'hhd');
      PCD.toast.success(t('saved') || 'Kaydedildi');
      m.close();
      if (onClose) onClose();
    });
  }

  function renderCheckCell(idx, temp, time, targetLbl, placeholder, u, t) {
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">⏱ ' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' ' + idx + ' <span style="font-weight:400;">' + targetLbl + '</span></div>' +
      '<div style="display:flex;gap:4px;">' +
        '<input id="rfC' + idx + 'T" type="number" step="0.1" placeholder="' + placeholder + '" value="' + (temp != null ? temp : '') + '" style="flex:1;padding:8px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;text-align:center;box-sizing:border-box;width:0;min-width:0;">' +
        '<span style="display:flex;align-items:center;color:var(--text-3);font-size:13px;">°' + u + '</span>' +
      '</div>' +
      '<input id="rfC' + idx + 'H" type="time" value="' + PCD.escapeHtml(time || '') + '" style="width:100%;padding:6px 8px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:12px;box-sizing:border-box;">' +
    '</div>';
  }

  // ============ PRINT (DAY) ============
  function printDay(dateStr, blank) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';

    const records = (blank || !dateStr) ? [] : listForDate(dateStr);
    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    const headerDate = dateStr && !blank ? new Date(dateStr + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '________________________';

    let html = printStylesAndHeader(wsName, headerDate, u, t) +
      buildPrintTable(t, u, false, byRow) +
      printFooter(t, u);

    PCD.print(html, 'HACCP Hot/Cold Holding · ' + (dateStr || 'Blank'));
  }

  // ============ PRINT (MONTHLY BLANK) ============
  function openMonthPickerModal() {
    const t = PCD.i18n.t;
    const today = new Date();
    const defaultYM = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:12px;">' +
        PCD.escapeHtml(t('hhd_month_picker_intro') || 'Ay seçin. Yazdırılan form 31 satırlık — ay boyunca elle doldurun.') +
      '</div>' +
      '<input id="hhdMonthIn" type="month" value="' + defaultYM + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const printBtn = PCD.el('button', { class: 'btn btn-primary', text: t('hhd_print_month_btn') || 'Yazdır', style: { flex: '2' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: '📄 ' + (t('hhd_month_picker_title') || 'Aylık boş form yazdır'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      const ymVal = body.querySelector('#hhdMonthIn').value;
      if (!ymVal) { PCD.toast.error(t('hhd_month_picker_required') || 'Lütfen bir ay seçin'); return; }
      const parts = ymVal.split('-');
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(mo) || mo < 1 || mo > 12) {
        PCD.toast.error(t('hhd_month_picker_required') || 'Lütfen bir ay seçin');
        return;
      }
      m.close();
      printMonthBlank(y, mo);
    });
  }

  function printMonthBlank(year, month) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

    let html = printStylesAndHeader(wsName, monthLabel, u, t) +
      buildPrintTable(t, u, true, null) +
      printFooter(t, u);

    PCD.print(html, 'HACCP Hot/Cold Holding · ' + monthLabel);
  }

  function buildPrintTable(t, u, isMonthly, byRow) {
    let html = '<table class="h-grid"><thead>' +
      '<tr>' +
        '<th rowspan="2">' + (isMonthly ? PCD.escapeHtml(t('hhd_col_day') || 'Gün') : '#') + '</th>' +
        '<th rowspan="2">' + PCD.escapeHtml(t('hhd_col_type') || 'Tip') + '</th>' +
        '<th rowspan="2">' + PCD.escapeHtml(t('hhd_col_food') || 'Yemek') + '</th>' +
        '<th rowspan="2">' + PCD.escapeHtml(t('hhd_col_location') || 'Konum') + '</th>' +
        '<th colspan="2">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 1</th>' +
        '<th colspan="2">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 2</th>' +
        '<th colspan="2">' + PCD.escapeHtml(t('hhd_col_check') || 'Kontrol') + ' 3</th>' +
        '<th rowspan="2">' + PCD.escapeHtml(t('hhd_col_corrective') || 'Düzeltici') + '</th>' +
        '<th rowspan="2">' + PCD.escapeHtml(t('hhd_col_chef') || 'Şef') + '</th>' +
      '</tr>' +
      '<tr>' +
        '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
        '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
        '<th>°' + u + '</th><th>' + PCD.escapeHtml(t('hcc_col_time') || 'Saat') + '</th>' +
      '</tr>' +
    '</thead><tbody>';

    const rowCount = isMonthly ? 31 : ROWS_PER_PAGE;

    for (let i = 0; i < rowCount; i++) {
      const r = isMonthly ? null : (byRow && byRow[i]);
      const c1T = r && r.check1Temp != null ? (u === 'F' ? ctoF(r.check1Temp) : r.check1Temp) + '°' : '';
      const c1H = r && r.check1Time ? r.check1Time : '';
      const c2T = r && r.check2Temp != null ? (u === 'F' ? ctoF(r.check2Temp) : r.check2Temp) + '°' : '';
      const c2H = r && r.check2Time ? r.check2Time : '';
      const c3T = r && r.check3Temp != null ? (u === 'F' ? ctoF(r.check3Temp) : r.check3Temp) + '°' : '';
      const c3H = r && r.check3Time ? r.check3Time : '';
      const c1Fail = r && isPass(r.holdType, r.check1Temp) === false;
      const c2Fail = r && isPass(r.holdType, r.check2Temp) === false;
      const c3Fail = r && isPass(r.holdType, r.check3Temp) === false;
      const typeMark = r ? (r.holdType === 'cold' ? '❄' : '🔥') : '';

      html += '<tr style="height:22px;">' +
        '<td class="idx">' + (isMonthly ? (i + 1) : (i + 1)) + '</td>' +
        '<td class="type">' + typeMark + '</td>' +
        '<td class="food">' + (r ? PCD.escapeHtml(r.foodName || '') : '') + '</td>' +
        '<td class="loc">' + (r ? PCD.escapeHtml(r.location || '') : '') + '</td>' +
        '<td class="t' + (c1Fail ? ' fail' : '') + '">' + c1T + '</td>' +
        '<td class="h' + (c1Fail ? ' fail' : '') + '">' + c1H + '</td>' +
        '<td class="t' + (c2Fail ? ' fail' : '') + '">' + c2T + '</td>' +
        '<td class="h' + (c2Fail ? ' fail' : '') + '">' + c2H + '</td>' +
        '<td class="t' + (c3Fail ? ' fail' : '') + '">' + c3T + '</td>' +
        '<td class="h' + (c3Fail ? ' fail' : '') + '">' + c3H + '</td>' +
        '<td class="corr">' + (r ? PCD.escapeHtml(r.correctiveAction || '') : '') + '</td>' +
        '<td class="chef">' + (r ? PCD.escapeHtml(r.chef || '') : '') + '</td>' +
      '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  function printStylesAndHeader(wsName, dateOrMonthLabel, u, t) {
    const targetHot = targetForUI(TARGET_HOT_C);
    const targetCold = targetForUI(TARGET_COLD_C);
    return '<style>' +
      'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:0;}' +
      '.h-head{margin-bottom:6px;border-bottom:2px solid #16a34a;padding-bottom:4px;display:flex;justify-content:space-between;align-items:flex-end;}' +
      '.h-head h1{margin:0;font-size:14px;}' +
      '.h-head .sub{font-size:10px;color:#555;margin-top:1px;}' +
      '.h-head .right{font-size:10px;color:#555;text-align:end;}' +
      'table.h-grid{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;}' +
      'table.h-grid th, table.h-grid td{border:1px solid #999;padding:3px 4px;vertical-align:middle;}' +
      'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:0.04em;}' +
      'table.h-grid td.idx{text-align:center;width:3.5%;font-weight:700;color:#444;}' +
      'table.h-grid td.type{text-align:center;width:4%;font-size:11px;}' +
      'table.h-grid td.food{width:18%;font-weight:600;}' +
      'table.h-grid td.loc{width:12%;}' +
      'table.h-grid td.t{width:6.5%;text-align:center;font-weight:600;}' +
      'table.h-grid td.h{width:6.5%;text-align:center;color:#666;font-size:8px;}' +
      'table.h-grid td.corr{width:14%;font-size:8px;}' +
      'table.h-grid td.chef{width:8%;text-align:center;}' +
      'table.h-grid td.fail{background:#fee2e2;color:#991b1b;font-weight:700;}' +
      '.h-foot{margin-top:6px;display:flex;justify-content:space-between;font-size:9px;}' +
      '.h-foot .legend{color:#666;}' +
      '.h-brand{margin-top:4px;text-align:center;font-size:7px;color:#999;}' +
      '.pcd-print-footer{display:none !important;}' +
      '@page{size:A4 landscape;margin:6mm;}' +
    '</style>' +
    '<div class="h-head">' +
      '<div>' +
        '<h1>HACCP · ' + PCD.escapeHtml(t('hhd_title') || 'Hot/Cold Holding') + '</h1>' +
        '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(dateOrMonthLabel) + ' · °' + u + '</div>' +
      '</div>' +
      '<div class="right">' +
        '<div><strong>🔥 ' + PCD.escapeHtml(t('hhd_type_hot') || 'Sıcak') + ':</strong> ≥' + targetHot + '</div>' +
        '<div><strong>❄ ' + PCD.escapeHtml(t('hhd_type_cold') || 'Soğuk') + ':</strong> ≤' + targetCold + '</div>' +
      '</div>' +
    '</div>';
  }

  function printFooter(t, u) {
    const targetHot = targetForUI(TARGET_HOT_C);
    const targetCold = targetForUI(TARGET_COLD_C);
    return '<div class="h-foot">' +
        '<div class="legend">' +
          '<strong>' + PCD.escapeHtml(t('hhd_legend') || 'HACCP eşikleri') + ':</strong> ' +
          PCD.escapeHtml(t('hhd_type_hot') || 'Sıcak') + ' ≥' + targetHot + ' · ' +
          PCD.escapeHtml(t('hhd_type_cold') || 'Soğuk') + ' ≤' + targetCold +
        '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('reviewed_by') || 'Kontrol eden') + ':</strong> ____________________</div>' +
      '</div>' +
      '<div class="h-brand">Made with ProChefDesk · prochefdesk.com</div>';
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpHolding = {
    render: render,
    openEditor: function () {
      const records = listForDate(_viewDate);
      const used = {};
      records.forEach(function (r) { if (typeof r.rowIndex === 'number') used[r.rowIndex] = true; });
      let firstEmpty = 0;
      while (used[firstEmpty] && firstEmpty < ROWS_PER_PAGE) firstEmpty++;
      if (firstEmpty >= ROWS_PER_PAGE) {
        PCD.toast.info((PCD.i18n.t && PCD.i18n.t('hhd_day_full')) || 'Bu gün dolu, sonraki güne geç');
        return;
      }
      openRowEditor(firstEmpty, null, function () {
        const v = document.getElementById('view');
        if (v && PCD.router.currentView() === 'haccp_holding') render(v);
      });
    },
  };
})();
