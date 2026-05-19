/* ================================================================
   ProChefDesk — haccp_cooling.js (v2.8.47 — aylık 31 satır format)
   HACCP Forms · Cook & Cool Log

   v2.8.47 — REFACTOR: günlük 15 satır → AYLIK 31 SATIR
   ----------------------------------------------------------------
   Operatör spec: şef ay başında bir kez form indirir, ay boyunca
   elle doldurur. Bu yüzden in-app görünüm de aylık olmalı —
   günlük navigasyon yerine ay navigasyonu, 31 satır sabit.

   Veri modeli değişti:
     ESKİ (v2.6.26-v2.8.36): { date: 'YYYY-MM-DD', rowIndex: 0..14, ... }
     YENİ (v2.8.47+):        { monthYM: 'YYYY-MM', rowIndex: 0..30, day?: 1-31, ... }

   Eski kayıtlarla backward compat: render anında r.monthYM yoksa
   r.date.slice(0,7), r.day yoksa parseInt(r.date.slice(8,10)).
   Bu sayede mevcut kayıtlar görünmeye devam eder; sadece yeni
   kayıtlar yeni format yazılır. Eski kayıt edit'lendiğinde
   monthYM + day fields'a tahkim edilir.

   HACCP gates (FDA Food Code 2017):
     - Cook end ≥ 60°C / 135°F
     - 2h checkpoint ≤ 21°C / 70°F
     - 6h end ≤ 5°C / 41°F

   Storage: workspace-bound table 'haccpCookCool' (cloud-sync aktif
   via cloud-pertable per-table sync). Schema değişmedi — data jsonb
   içinde monthYM/day field'leri ek olarak yaşıyor.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'haccpCookCool';
  const ROWS_PER_PAGE = 31;  // v2.8.47: 15 → 31

  // HACCP cooling targets — region-aware (v2.9.35). Source: PCD.haccp.getThresholds()
  // reads user's HACCP region from prefs (Account → Preferences). Resolved on
  // each call so region change in Account takes effect without page reload.
  function cooling2hC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().cooling2hC) || 21; }
  function cooling6hC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().cooling6hC) || 5; }
  function coolingStartC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().coolingStartC) || 60; }

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

  // ============ DATE / MONTH HELPERS ============
  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function ym(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  function todayYM() { return ym(new Date()); }
  function shiftMonth(yymm, delta) {
    const parts = yymm.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = new Date(y, m - 1 + delta, 1);
    return ym(d);
  }
  function monthLabel(yymm) {
    const parts = yymm.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    return d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  }
  function daysInMonth(yymm) {
    const parts = yymm.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return new Date(y, m, 0).getDate();
  }

  // Backward compat: eski kayıtlardan monthYM çıkar
  function recordMonthYM(r) {
    if (r.monthYM) return r.monthYM;
    if (r.date && typeof r.date === 'string' && r.date.length >= 7) return r.date.slice(0, 7);
    return null;
  }
  // Backward compat: eski kayıtlardan day çıkar
  function recordDay(r) {
    if (r.day != null) return r.day;
    if (r.date && typeof r.date === 'string' && r.date.length >= 10) {
      const d = parseInt(r.date.slice(8, 10), 10);
      return isNaN(d) ? null : d;
    }
    return null;
  }

  function listForMonth(monthYM) {
    return (PCD.store.listTable(TABLE) || []).filter(function (r) {
      return recordMonthYM(r) === monthYM;
    }).slice().sort(function (a, b) {
      return (a.rowIndex || 0) - (b.rowIndex || 0);
    });
  }
  function listMonthsWithRecords() {
    const months = {};
    (PCD.store.listTable(TABLE) || []).forEach(function (r) {
      const m = recordMonthYM(r);
      if (m) months[m] = true;
    });
    return Object.keys(months).sort().reverse();
  }

  let _viewMonth = todayYM();

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const records = listForMonth(_viewMonth);
    const months = listMonthsWithRecords();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌡 ' + (t('hcc_title') || 'Cook & Cool Log') + '</div>' +
          '<div class="page-subtitle">HACCP cooling: ' + targetForUI(coolingStartC()) + ' → ' + targetForUI(cooling2hC()) + ' in 2h → ' + targetForUI(cooling6hC()) + ' in 6h · ' + (t('hcc_subtitle_monthly_suffix') || 'Aylık 31 satır') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="hccPrintBlankBtn" title="' + PCD.escapeHtml(t('hcc_print_month_tip') || '31 satırlık aylık boş form yazdır') + '">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hcc_print_blank') || 'Boş yazdır') + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="hccPrintMonthBtn" title="' + PCD.escapeHtml(t('hcc_print_filled_month_tip') || 'Bu ayın doldurulmuş satırlarını yazdır') + '">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hcc_print_filled_month') || 'Bu ayı yazdır') + '</span></button>' +
        '</div>' +
      '</div>';

    const isThisMonth = _viewMonth === todayYM();
    const monthNav = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' } });
    monthNav.innerHTML =
      '<button class="btn btn-outline btn-sm" id="hccPrevMonth" aria-label="' + PCD.escapeHtml(t('prev_month') || 'Önceki ay') + '">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;">' +
        '<div style="font-weight:700;font-size:15px;">' + PCD.escapeHtml(monthLabel(_viewMonth)) + (isThisMonth ? ' · <span style="color:var(--brand-700);font-size:11px;">' + PCD.escapeHtml(t('this_month') || 'Bu ay') + '</span>' : '') + '</div>' +
        '<div class="text-muted" style="font-size:11px;">' + records.length + ' / ' + ROWS_PER_PAGE + ' ' + PCD.escapeHtml(t('hcc_filled') || 'dolu') + '</div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" id="hccThisMonthBtn" ' + (isThisMonth ? 'disabled' : '') + '>' + PCD.escapeHtml(t('this_month') || 'Bu ay') + '</button>' +
      '<button class="btn btn-outline btn-sm" id="hccNextMonth" aria-label="' + PCD.escapeHtml(t('next_month') || 'Sonraki ay') + '">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(monthNav);

    if (months.length > 0) {
      const quickJump = PCD.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' } });
      const label = PCD.el('span', { style: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }, text: (t('hcc_recent_months') || 'Son kayıtlı aylar') + ':' });
      quickJump.appendChild(label);
      months.slice(0, 6).forEach(function (m) {
        const isActive = m === _viewMonth;
        const btn = PCD.el('button', {
          class: 'btn btn-' + (isActive ? 'primary' : 'outline') + ' btn-sm',
          style: { fontSize: '12px', padding: '4px 10px' },
          'data-jump-month': m,
        });
        btn.textContent = monthLabel(m);
        quickJump.appendChild(btn);
      });
      view.appendChild(quickJump);
    }

    // Build the table
    const wrap = PCD.el('div', { class: 'card', style: { padding: '0', overflowX: 'auto' } });
    const target2h = targetForUI(cooling2hC());
    const target6h = targetForUI(cooling6hC());

    let table =
      '<table style="width:100%;min-width:1100px;border-collapse:collapse;font-size:12px;table-layout:fixed;">' +
        '<thead style="background:var(--surface-2);">' +
          '<tr>' +
            '<th style="width:36px;padding:8px 4px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_day') || 'Gün') + '</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:22%;">' + PCD.escapeHtml(t('hcc_col_food') || 'Yemek / Parti') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hcc_col_qty') || 'Miktar') + '</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + '</th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">+2h <span style="font-weight:400;color:var(--text-3);">≤' + target2h + '</span></th>' +
            '<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' <span style="font-weight:400;color:var(--text-3);">≤' + target6h + '</span></th>' +
            '<th style="padding:8px 6px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:13%;">' + PCD.escapeHtml(t('hcc_col_note') || 'Düzeltici eylem') + '</th>' +
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
      // Gün kolonu: kullanıcının verdiği day veya satır numarası (1-31)
      const dayLabel = filled && recordDay(r) != null ? recordDay(r) : (i + 1);
      const dayStyle = filled && recordDay(r) != null
        ? 'font-weight:700;color:var(--text-1);'
        : 'font-weight:400;color:var(--text-3);font-style:italic;';
      table += '<td style="padding:4px;text-align:center;font-size:11px;' + dayStyle + 'border-bottom:1px solid var(--border);">' + dayLabel + '</td>';
      if (filled) {
        const cookTime = r.cookEndAt ? new Date(r.cookEndAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const cp2hTime = r.cp2hAt ? new Date(r.cp2hAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const finalTime = r.endedAt ? new Date(r.endedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
        const cp2hFail = r.cp2hTemp != null && r.cp2hTemp > cooling2hC();
        const endFail = r.endedTemp != null && r.endedTemp > cooling6hC();

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

    PCD.$('#hccPrevMonth', view).addEventListener('click', function () {
      _viewMonth = shiftMonth(_viewMonth, -1);
      render(view);
    });
    PCD.$('#hccNextMonth', view).addEventListener('click', function () {
      _viewMonth = shiftMonth(_viewMonth, 1);
      render(view);
    });
    const thisMonthBtn = PCD.$('#hccThisMonthBtn', view);
    if (thisMonthBtn) thisMonthBtn.addEventListener('click', function () {
      _viewMonth = todayYM();
      render(view);
    });
    PCD.$('#hccPrintBlankBtn', view).addEventListener('click', function () { openMonthPickerModal(true); });
    PCD.$('#hccPrintMonthBtn', view).addEventListener('click', function () { printMonth(_viewMonth, false); });

    PCD.on(view, 'click', '[data-jump-month]', function () {
      _viewMonth = this.getAttribute('data-jump-month');
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
    const target2h = targetForUI(cooling2hC());
    const target6h = targetForUI(cooling6hC());
    const dim = daysInMonth(_viewMonth);

    const data = existing ? Object.assign({}, existing) : {
      monthYM: _viewMonth, rowIndex: rowIndex,
      day: null,
      foodName: '', quantity: '', quantityUnit: '',
      cookEndTemp: null, cookEndAt: null,
      cp2hTemp: null, cp2hAt: null,
      endedTemp: null, endedAt: null,
      note: '', chef: '',
    };
    // Eski formatta açıldıysa backward compat: monthYM + day türet
    if (!data.monthYM && data.date) data.monthYM = data.date.slice(0, 7);
    if (data.day == null && data.date) {
      const dd = parseInt(data.date.slice(8, 10), 10);
      if (!isNaN(dd)) data.day = dd;
    }

    function hhmmFromIso(iso) {
      if (!iso) return '';
      try { return new Date(iso).toTimeString().slice(0, 5); } catch (e) { return ''; }
    }
    function isoFromHhmm(hhmm, monthYM, day) {
      if (!hhmm) return null;
      // Eğer day verilmemişse ay başını kullan (tarih kaba; saat doğru)
      const useDay = (day && day > 0 && day <= 31) ? day : 1;
      const dateStr = monthYM + '-' + String(useDay).padStart(2, '0');
      const d = new Date(dateStr + 'T' + hhmm + ':00');
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // Gün seçim seçenekleri (1..dim ay sonu, opsiyonel boş)
    let dayOptions = '<option value="">' + PCD.escapeHtml(t('hcc_day_optional') || '— (opsiyonel)') + '</option>';
    for (let dd = 1; dd <= dim; dd++) {
      dayOptions += '<option value="' + dd + '"' + (data.day === dd ? ' selected' : '') + '>' + dd + '</option>';
    }

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--text-2);">' +
        '🌡 ' + PCD.escapeHtml(t('hcc_row_intro_monthly') || 'Bu satırı doldur. Gün opsiyoneldir — boş bırakırsan sadece satır numarası görünür.') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<div style="width:110px;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_col_day') || 'Gün') + ' <span style="font-weight:400;color:var(--text-3);">(' + PCD.escapeHtml(monthLabel(_viewMonth)) + ')</span></label>' +
          '<select id="rfDay" style="width:100%;padding:8px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' + dayOptions + '</select>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_food_name') || 'Yemek / Parti adı') + '</label>' +
          '<input id="rfFood" type="text" maxlength="60" value="' + PCD.escapeHtml(data.foodName || '') + '" placeholder="' + PCD.escapeHtml(t('hcc_food_placeholder') || 'örn. Domates çorbası, tavuk göğsü') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
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
      const dayVal = body.querySelector('#rfDay').value;
      data.day = dayVal ? parseInt(dayVal, 10) : null;
      data.monthYM = _viewMonth;
      // Eski `date` field'ını da senkron tut (geri uyumluluk + diğer cihaz pull akışı)
      data.date = data.day ? (_viewMonth + '-' + String(data.day).padStart(2, '0')) : null;

      data.foodName = food;
      data.quantity = body.querySelector('#rfQty').value.trim();
      data.quantityUnit = body.querySelector('#rfQtyU').value.trim();

      const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
      data.cookEndTemp = num(body.querySelector('#rfCookT').value);
      data.cookEndAt = isoFromHhmm(body.querySelector('#rfCookH').value, _viewMonth, data.day);
      data.cp2hTemp = num(body.querySelector('#rfCp2hT').value);
      data.cp2hAt = isoFromHhmm(body.querySelector('#rfCp2hH').value, _viewMonth, data.day);
      data.endedTemp = num(body.querySelector('#rfEndT').value);
      data.endedAt = isoFromHhmm(body.querySelector('#rfEndH').value, _viewMonth, data.day);
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

  // ============ PRINT (MONTH) ============
  // Tek fonksiyon: blank=true ise satırlar boş, blank=false ise mevcut data ile dolu.
  // 31 satır sabit, sol kolonda gün numarası (kullanıcı verdiği day veya satır no).
  function printMonth(monthYM, blank) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const target2h = targetForUI(cooling2hC());
    const target6h = targetForUI(cooling6hC());
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';
    const label = monthLabel(monthYM);

    const records = blank ? [] : listForMonth(monthYM);
    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    let html =
      '<style>' +
        // v2.9.32 — Single-page guarantee (v2.9.31 pilot overflowed to 3 pages).
        // Pattern adapted from kitchen_cards.js: body is sized to A4 landscape
        // with flex column layout, so PCD.print's auto-injected footer becomes
        // a flex sibling and stays on the same page instead of overflowing.
        // Row height tuned to 19px (~5mm) — comfortable for handwriting but
        // total table height stays within A4 landscape usable area.
        'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;padding:0;' +
          'width:297mm;height:210mm;display:flex;flex-direction:column;}' +
        '.h-sheet{flex:1 1 auto;min-height:0;padding:4mm;display:flex;flex-direction:column;}' +
        '.h-head{margin-bottom:4px;border-bottom:1.5px solid #16a34a;padding-bottom:3px;display:flex;justify-content:space-between;align-items:flex-end;flex:0 0 auto;}' +
        '.h-head h1{margin:0;font-size:14px;}' +
        '.h-head .sub{font-size:10px;color:#555;margin-top:2px;}' +
        '.h-head .right{font-size:10px;color:#555;text-align:end;}' +
        'table.h-grid{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;flex:0 0 auto;}' +
        'table.h-grid th, table.h-grid td{border:1px solid #999;padding:3px 4px;vertical-align:middle;line-height:1.3;}' +
        'table.h-grid th{background:#f3f4f6;font-weight:700;font-size:9px;text-align:center;text-transform:uppercase;letter-spacing:0.03em;}' +
        'table.h-grid tr{height:20px;page-break-inside:avoid;}' +
        'table.h-grid td.day{text-align:center;width:3%;font-weight:700;color:#444;}' +
        'table.h-grid td.food{width:32%;font-weight:600;}' +
        'table.h-grid td.qty{width:6%;text-align:center;}' +
        'table.h-grid td.t{width:5%;text-align:center;font-weight:600;}' +
        'table.h-grid td.h{width:5%;text-align:center;color:#666;font-size:10px;}' +
        'table.h-grid td.note{width:20%;font-size:10px;}' +
        'table.h-grid td.chef{width:9%;text-align:center;}' +
        'table.h-grid td.fail{background:#fee2e2;color:#991b1b;font-weight:700;}' +
        '.h-foot{margin-top:4px;display:flex;justify-content:space-between;font-size:9px;flex:0 0 auto;}' +
        '.h-foot .legend{color:#666;}' +
        // v2.9.32 — PCD.print auto-injects a footer (.pcd-print-footer) at the
        // bottom of body. Without this compact override its default margins
        // push content past A4 landscape and force a 3rd page.
        '.pcd-print-footer{margin:0 !important;padding:1mm 4mm !important;' +
          'border-top:none !important;flex:0 0 auto;' +
          'font-size:7pt !important;line-height:1.2 !important;}' +
        '@page{size:A4 landscape;margin:0;}' +
      '</style>' +
      '<div class="h-sheet">' +
      '<div class="h-head">' +
        '<div>' +
          '<h1>HACCP · ' + PCD.escapeHtml(t('hcc_title') || 'Cook & Cool Log') + '</h1>' +
          '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(label) + ' · °' + u + '</div>' +
        '</div>' +
        '<div class="right">' +
          '<div><strong>' + PCD.escapeHtml(t('hcc_target_2h') || '2h hedef') + ':</strong> ≤' + target2h + '</div>' +
          '<div><strong>' + PCD.escapeHtml(t('hcc_target_6h') || '6h hedef') + ':</strong> ≤' + target6h + '</div>' +
        '</div>' +
      '</div>' +
      '<table class="h-grid">' +
        // v2.9.34 — colgroup zorunlu: table-layout:fixed modunda sütun width'leri
        // sadece colgroup veya ilk satırdaki th width'inden alınır, td width'ler
        // dikkate alınmaz. v2.9.33 sadece td'leri değiştirdi → değişiklik PDF'e
        // yansımadı. Şimdi colgroup ile gerçek width tanımı yapılıyor.
        '<colgroup>' +
          '<col style="width:3%">' +
          '<col style="width:32%">' +
          '<col style="width:6%">' +
          '<col style="width:5%">' +
          '<col style="width:5%">' +
          '<col style="width:5%">' +
          '<col style="width:5%">' +
          '<col style="width:5%">' +
          '<col style="width:5%">' +
          '<col style="width:20%">' +
          '<col style="width:9%">' +
        '</colgroup>' +
        '<thead>' +
        '<tr>' +
          '<th rowspan="2">' + PCD.escapeHtml(t('hcc_col_day') || 'Gün') + '</th>' +
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
      const dayLabel = r && recordDay(r) != null ? recordDay(r) : (i + 1);
      const cookT = r && r.cookEndTemp != null ? (u === 'F' ? ctoF(r.cookEndTemp) : r.cookEndTemp) + '°' : '';
      const cookH = r && r.cookEndAt ? new Date(r.cookEndAt).toTimeString().slice(0, 5) : '';
      const cp2hT = r && r.cp2hTemp != null ? (u === 'F' ? ctoF(r.cp2hTemp) : r.cp2hTemp) + '°' : '';
      const cp2hH = r && r.cp2hAt ? new Date(r.cp2hAt).toTimeString().slice(0, 5) : '';
      const endT = r && r.endedTemp != null ? (u === 'F' ? ctoF(r.endedTemp) : r.endedTemp) + '°' : '';
      const endH = r && r.endedAt ? new Date(r.endedAt).toTimeString().slice(0, 5) : '';
      const cp2hFail = r && r.cp2hTemp != null && r.cp2hTemp > cooling2hC();
      const endFail = r && r.endedTemp != null && r.endedTemp > cooling6hC();

      html += '<tr>' +
        '<td class="day">' + dayLabel + '</td>' +
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
          PCD.escapeHtml(t('hcc_col_cook_end') || 'Pişirme sonu') + ' ≥' + targetForUI(coolingStartC()) + ' · ' +
          '+2h ≤' + target2h + ' · ' +
          PCD.escapeHtml(t('hcc_col_final') || 'Son') + ' ≤' + target6h +
        '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('reviewed_by') || 'Kontrol eden') + ':</strong> ____________________</div>' +
      '</div>' +
      '</div>';  // /.h-sheet (v2.9.32) — PCD.print injects footer right after as flex sibling

    PCD.print(html, 'HACCP Cook & Cool · ' + label);
  }

  // ============ MONTH PICKER (boş yazdır için ay seç) ============
  function openMonthPickerModal(blank) {
    const t = PCD.i18n.t;
    const defaultYM = _viewMonth || todayYM();

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:12px;">' +
        PCD.escapeHtml(blank ? (t('hcc_month_picker_intro') || 'Ay seçin. Yazdırılan form 31 satırlık — ay boyunca elle doldurun.') : (t('hcc_month_picker_filled_intro') || 'Yazdırılacak ayı seçin.')) +
      '</div>' +
      '<input id="hccMonthIn" type="month" value="' + defaultYM + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const printBtn = PCD.el('button', { class: 'btn btn-primary', text: t('hcc_print_month_btn') || 'Yazdır', style: { flex: '2' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: '📄 ' + (blank ? (t('hcc_month_picker_title') || 'Aylık boş form yazdır') : (t('hcc_month_picker_filled_title') || 'Aylık dolu form yazdır')),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      const ymVal = body.querySelector('#hccMonthIn').value;
      if (!ymVal) { PCD.toast.error(t('hcc_month_picker_required') || 'Lütfen bir ay seçin'); return; }
      // YYYY-MM format validation
      if (!/^\d{4}-\d{2}$/.test(ymVal)) {
        PCD.toast.error(t('hcc_month_picker_required') || 'Lütfen bir ay seçin');
        return;
      }
      m.close();
      printMonth(ymVal, blank);
    });
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpCooling = {
    render: render,
    openEditor: function () {
      const records = listForMonth(_viewMonth);
      const used = {};
      records.forEach(function (r) { if (typeof r.rowIndex === 'number') used[r.rowIndex] = true; });
      let firstEmpty = 0;
      while (used[firstEmpty] && firstEmpty < ROWS_PER_PAGE) firstEmpty++;
      if (firstEmpty >= ROWS_PER_PAGE) {
        PCD.toast.info((PCD.i18n.t && PCD.i18n.t('hcc_month_full')) || 'Bu ay dolu, sonraki aya geç');
        return;
      }
      openRowEditor(firstEmpty, null, function () {
        const v = document.getElementById('view');
        if (v && PCD.router.currentView() === 'haccp_cooling') render(v);
      });
    },
  };
})();
