/* ================================================================
   ProChefDesk — haccp_receiving.js (v2.8.38)
   HACCP Forms · Receiving Log (Goods-in)

   Date-based form: each day = one A4 landscape page with 15 rows.
   Rows can be filled directly via tap (popup), printed blank for
   manual writing, printed with current data, or printed as a 31-row
   monthly form (operatör spec: ay başında bir kez yazdır + elle doldur).

   HACCP receiving guidelines (FSA / FDA Food Code):
     - Cold goods: ≤5°C (≤41°F)
     - Frozen goods: ≤-18°C (≤0°F)
     - Hot goods: ≥60°C (≥140°F)
   Condition check covers packaging integrity, visible spoilage, smell.

   Storage: workspace-bound table 'haccpReceiving'.
   v2.8.38: IDB-only (cloud sync ertelendi)
   v2.8.44: cloud sync devrede — migrations/v2.8.44-haccp-receiving-holding.sql
            ile haccp_receiving tablosu + RLS + realtime publication açıldı.
            store.upsertInTable() artık _stateKeyToSqlTable map'inden
            'haccp_receiving' karşılığını alıp cloud-pertable queue'ya
            push ediyor. Pull/realtime/drift detection da bu tabloyu
            tanıyor — diğer cihazlar 1-2 sn içinde güncellenir.
   Each record has a `date` (YYYY-MM-DD) so we can group by day.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'haccpReceiving';
  // v2.9.40 — Operator spec: monthly view (Cook & Cool pattern). Was 15 per day.
  const ROWS_PER_PAGE = 31;

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

  // v2.9.40 — Monthly view helpers (Cook & Cool pattern)
  function todayYM() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthLabel(monthYM) {
    if (!monthYM) return '';
    const parts = monthYM.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(locale(), { year: 'numeric', month: 'long' });
  }
  function shiftMonth(monthYM, delta) {
    const parts = monthYM.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function recordMonthYM(r) {
    if (r.date && typeof r.date === 'string' && r.date.length >= 7) return r.date.slice(0, 7);
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

  function condBadge(condOK) {
    if (condOK === true)  return { mark: '✓', color: 'var(--success)', bg: 'transparent' };
    if (condOK === false) return { mark: '✗', color: '#991b1b',        bg: '#fee2e2' };
    return { mark: '—', color: 'var(--text-3)', bg: 'transparent' };
  }

  // v2.9.40 — Monthly view (was daily _viewDate). Cook & Cool pattern.
  let _viewMonth = todayYM();

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    // v2.17 — HACCP Pro özelliği: free direct-route → hub (kilitli ekran).
    if (PCD.gate && !PCD.gate.canUseHaccp()) { if (PCD.router) PCD.router.go('haccp'); return; }
    const u = getTempUnit();
    const records = listForMonth(_viewMonth);
    const months = listMonthsWithRecords();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">📦 ' + (t('hcr_title') || 'Receiving Log') + '</div>' +
          '<div class="page-subtitle">' + (t('hcr_subtitle') || 'Goods-in checks · supplier, temp, expiry, condition') + ' · ' + (t('hcc_subtitle_monthly_suffix') || 'Aylık 31 satır') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="hcrPrintMonthBtn" title="' + PCD.escapeHtml(t('hcr_print_month_tip') || '31 satırlık aylık form, ay başında bir kez yazdır') + '">' + PCD.icon('calendar', 14) + ' <span>' + PCD.escapeHtml(t('hcr_print_month') || 'Aylık boş') + '</span></button>' +
          '<button class="btn btn-primary btn-sm" id="hcrPrintFilledBtn">' + PCD.icon('print', 14) + ' <span>' + PCD.escapeHtml(t('hcr_print_filled_month') || 'Bu ayı yazdır') + '</span></button>' +
        '</div>' +
      '</div>';

    const isThisMonth = _viewMonth === todayYM();
    const monthNav = PCD.el('div', { class: 'card', style: { padding: '10px 14px', marginTop: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' } });
    monthNav.innerHTML =
      '<button class="btn btn-outline btn-sm" id="hcrPrevMonth" aria-label="' + PCD.escapeHtml(t('prev_month') || 'Önceki ay') + '">' + PCD.icon('chevronLeft', 16) + '</button>' +
      '<div style="flex:1;text-align:center;">' +
        '<div style="font-weight:700;font-size:15px;">' + PCD.escapeHtml(monthLabel(_viewMonth)) + (isThisMonth ? ' · <span style="color:var(--brand-700);font-size:11px;">' + PCD.escapeHtml(t('this_month') || 'Bu ay') + '</span>' : '') + '</div>' +
        '<div class="text-muted" style="font-size:11px;">' + records.length + ' / ' + ROWS_PER_PAGE + ' ' + PCD.escapeHtml(t('hcr_filled') || 'dolu') + '</div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" id="hcrThisMonthBtn" ' + (isThisMonth ? 'disabled' : '') + '>' + PCD.escapeHtml(t('this_month') || 'Bu ay') + '</button>' +
      '<button class="btn btn-outline btn-sm" id="hcrNextMonth" aria-label="' + PCD.escapeHtml(t('next_month') || 'Sonraki ay') + '">' + PCD.icon('chevronRight', 16) + '</button>';
    view.appendChild(monthNav);

    if (months.length > 0) {
      const quickJump = PCD.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' } });
      const label = PCD.el('span', { style: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }, text: (t('hcr_recent_months') || 'Son kayıtlı aylar') + ':' });
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

    let table =
      '<table style="width:100%;min-width:1100px;border-collapse:collapse;font-size:12px;table-layout:fixed;">' +
        '<thead style="background:var(--surface-2);">' +
          '<tr>' +
            '<th style="width:36px;padding:8px 4px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">' + PCD.escapeHtml(t('hcc_col_day') || 'Gün') + '</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:14%;">' + PCD.escapeHtml(t('hcr_col_supplier') || 'Tedarikçi') + '</th>' +
            '<th style="padding:8px 8px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:20%;">' + PCD.escapeHtml(t('hcr_col_product') || 'Ürün') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hcr_col_qty') || 'Miktar') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:8%;">' + PCD.escapeHtml(t('hcr_col_temp') || 'Teslim') + ' °' + u + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:9%;">' + PCD.escapeHtml(t('hcr_col_expiry') || 'SKT') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:6%;">' + PCD.escapeHtml(t('hcr_col_condition') || 'Koşul') + '</th>' +
            '<th style="padding:8px 6px;text-align:start;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:14%;">' + PCD.escapeHtml(t('hcr_col_note') || 'Not') + '</th>' +
            '<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);border-left:1px solid var(--border);width:10%;">' + PCD.escapeHtml(t('hcr_col_chef') || 'Teslim alan') + '</th>' +
          '</tr>' +
        '</thead><tbody>';

    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const r = byRow[i];
      const filled = !!r;
      const rowBg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-1)';
      table += '<tr data-row="' + i + '" style="background:' + rowBg + ';cursor:pointer;height:32px;" class="hcr-row">';
      // v2.9.40 — DAY column: filled rows show actual day from r.date,
      // empty rows show row index (just for reference, not committed).
      const dayLabel = filled && r.date && r.date.length >= 10 ? parseInt(r.date.slice(8, 10), 10) : (i + 1);
      table += '<td style="padding:4px;text-align:center;font-size:11px;color:' + (filled ? 'var(--text-1)' : 'var(--text-3)') + ';border-bottom:1px solid var(--border);font-weight:600;">' + dayLabel + '</td>';
      if (filled) {
        const cond = condBadge(r.conditionOK);
        const expiry = r.expiryDate ? new Date(r.expiryDate + 'T00:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '—';
        table +=
          '<td style="padding:4px 8px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.supplier || '') + '">' + PCD.escapeHtml(r.supplier || '—') + '</td>' +
          '<td style="padding:4px 8px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.productName || '') + '">' + PCD.escapeHtml(r.productName || '—') + '</td>' +
          '<td style="padding:4px 6px;text-align:center;font-size:11px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + (r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '—') + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + fmtTemp(r.deliveryTemp) + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' + expiry + '</td>' +
          '<td style="padding:4px;text-align:center;font-size:14px;font-weight:700;border-bottom:1px solid var(--border);border-left:1px solid var(--border);color:' + cond.color + ';background:' + cond.bg + ';">' + cond.mark + '</td>' +
          '<td style="padding:4px 6px;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + PCD.escapeHtml(r.note || '') + '">' + PCD.escapeHtml(r.note || '—') + '</td>' +
          '<td style="padding:4px 6px;text-align:center;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);border-left:1px solid var(--border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.chef || '—') + '</td>';
      } else {
        table +=
          '<td colspan="8" style="padding:4px 12px;font-size:13px;color:var(--text-3);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:var(--text-3);font-weight:300;font-size:16px;">+</span> <span style="font-style:italic;font-size:11px;">' + PCD.escapeHtml(t('hcr_click_to_fill') || 'Doldurmak için tıkla') + '</span></span>' +
          '</td>';
      }
      table += '</tr>';
    }
    table += '</tbody></table>';
    wrap.innerHTML = table;
    view.appendChild(wrap);

    // v2.9.40 — Aylık view event handler'ları (Cook & Cool pattern)
    PCD.$('#hcrPrevMonth', view).addEventListener('click', function () {
      _viewMonth = shiftMonth(_viewMonth, -1);
      render(view);
    });
    PCD.$('#hcrNextMonth', view).addEventListener('click', function () {
      _viewMonth = shiftMonth(_viewMonth, 1);
      render(view);
    });
    const thisMonthBtn = PCD.$('#hcrThisMonthBtn', view);
    if (thisMonthBtn) thisMonthBtn.addEventListener('click', function () {
      _viewMonth = todayYM();
      render(view);
    });
    PCD.$('#hcrPrintFilledBtn', view).addEventListener('click', function () { printMonthFilled(_viewMonth); });
    PCD.$('#hcrPrintMonthBtn', view).addEventListener('click', function () { openMonthPickerModal(); });

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

    // v2.9.40 — Aylık view'da default tarih = ay içindeki bugün (eğer aktif ay),
    // değilse ayın 1'i. Editor'da kullanıcı day select ile değiştirebilir.
    let defaultDate;
    if (existing) {
      defaultDate = existing.date;
    } else if (_viewMonth === todayYM()) {
      defaultDate = todayYmd();
    } else {
      defaultDate = _viewMonth + '-01';
    }
    const data = existing ? Object.assign({}, existing) : {
      date: defaultDate, rowIndex: rowIndex,
      supplier: '', productName: '',
      quantity: '', quantityUnit: '',
      deliveryTemp: null, expiryDate: null,
      conditionOK: null,
      note: '', chef: '',
    };

    // v2.9.40 — Day select options (1..daysInMonth)
    const dim = (function () {
      const parts = (_viewMonth || '').split('-');
      if (parts.length !== 2) return 31;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return new Date(y, m, 0).getDate();
    })();
    const currentDay = data.date && data.date.length >= 10 ? parseInt(data.date.slice(8, 10), 10) : 1;
    let dayOptions = '';
    for (let d = 1; d <= dim; d++) {
      dayOptions += '<option value="' + d + '"' + (d === currentDay ? ' selected' : '') + '>' + d + '</option>';
    }

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="background:var(--surface-2);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--text-2);">' +
        '📦 ' + PCD.escapeHtml(t('hcr_row_intro') || 'Mal kabul kaydını doldur. Boş bıraktığın alanlar tabloda — olarak görünür.') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<div style="width:110px;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_col_day') || 'Gün') + ' <span style="font-weight:400;color:var(--text-3);">(' + PCD.escapeHtml(monthLabel(_viewMonth)) + ')</span></label>' +
          '<select id="rfDay" style="width:100%;padding:8px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' + dayOptions + '</select>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcr_col_supplier') || 'Tedarikçi') + '</label>' +
          '<input id="rfSupplier" type="text" maxlength="40" value="' + PCD.escapeHtml(data.supplier || '') + '" placeholder="' + PCD.escapeHtml(t('hcr_supplier_placeholder') || 'örn. ABC Gıda') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1.4;">' +
          '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcr_col_product') || 'Ürün') + '</label>' +
          '<input id="rfProduct" type="text" maxlength="60" value="' + PCD.escapeHtml(data.productName || '') + '" placeholder="' + PCD.escapeHtml(t('hcr_product_placeholder') || 'örn. Tavuk göğsü') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
        '<div style="flex:1.4;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcr_col_qty') || 'Miktar') + '</label>' +
          '<input id="rfQty" type="text" maxlength="15" value="' + PCD.escapeHtml(data.quantity || '') + '" placeholder="örn. 5" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1;">' +
          '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcc_unit') || 'Birim') + '</label>' +
          '<input id="rfQtyU" type="text" maxlength="8" value="' + PCD.escapeHtml(data.quantityUnit || '') + '" placeholder="kg / kutu / koli" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">🌡 ' + PCD.escapeHtml(t('hcr_col_temp') || 'Teslim sıcaklığı') + '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<input id="rfTemp" type="number" step="0.1" placeholder="" value="' + (data.deliveryTemp != null ? data.deliveryTemp : '') + '" style="flex:1;padding:8px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-weight:600;text-align:center;box-sizing:border-box;width:0;min-width:0;">' +
            '<span style="display:flex;align-items:center;color:var(--text-3);font-size:13px;">°' + u + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">📅 ' + PCD.escapeHtml(t('hcr_col_expiry') || 'SKT') + '</div>' +
          '<input id="rfExpiry" type="date" value="' + PCD.escapeHtml(data.expiryDate || '') + '" style="width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">📋 ' + PCD.escapeHtml(t('hcr_col_condition') || 'Koşul') + '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<button type="button" data-cond="ok" class="btn btn-sm ' + (data.conditionOK === true ? 'btn-primary' : 'btn-outline') + '" style="flex:1;font-size:12px;">✓ ' + PCD.escapeHtml(t('hcr_condition_ok') || 'Tamam') + '</button>' +
            '<button type="button" data-cond="bad" class="btn btn-sm ' + (data.conditionOK === false ? 'btn-danger' : 'btn-outline') + '" style="flex:1;font-size:12px;">✗ ' + PCD.escapeHtml(t('hcr_condition_problem') || 'Sorun') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:8px;">' +
        '<label style="display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:12px;margin-bottom:4px;">' +
          '<span>' + PCD.escapeHtml(t('hcr_col_note') || 'Not') + '</span>' +
          '<span style="font-weight:400;font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('optional') || 'opsiyonel') + '</span>' +
        '</label>' +
        '<textarea id="rfNote" rows="2" maxlength="200" placeholder="' + PCD.escapeHtml(t('hcr_note_placeholder') || 'örn. Donmuş, paket sağlam') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + PCD.escapeHtml(data.note || '') + '</textarea>' +
      '</div>' +
      '<div>' +
        '<label style="display:block;font-weight:600;font-size:12px;margin-bottom:4px;">' + PCD.escapeHtml(t('hcr_col_chef') || 'Teslim alan') + '</label>' +
        '<input id="rfChef" type="text" maxlength="40" value="' + PCD.escapeHtml(data.chef || '') + '" placeholder="' + PCD.escapeHtml(t('hcr_chef_placeholder') || 'Adın / inisiyallerin') + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">' +
      '</div>';

    setTimeout(function () { body.querySelector('#rfSupplier').focus(); }, 80);

    // Condition button toggle (tri-state via two buttons; click again to clear)
    PCD.on(body, 'click', '[data-cond]', function () {
      const v = this.getAttribute('data-cond');
      if (v === 'ok')  data.conditionOK = (data.conditionOK === true)  ? null : true;
      if (v === 'bad') data.conditionOK = (data.conditionOK === false) ? null : false;
      body.querySelector('[data-cond="ok"]').className  = 'btn btn-sm ' + (data.conditionOK === true  ? 'btn-primary' : 'btn-outline');
      body.querySelector('[data-cond="bad"]').className = 'btn btn-sm ' + (data.conditionOK === false ? 'btn-danger'  : 'btn-outline');
      body.querySelector('[data-cond="ok"]').style.flex = '1';
      body.querySelector('[data-cond="bad"]').style.flex = '1';
      body.querySelector('[data-cond="ok"]').style.fontSize = '12px';
      body.querySelector('[data-cond="bad"]').style.fontSize = '12px';
    });

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Kaydet', style: { flex: '2' } });
    const deleteBtn = existing ? PCD.el('button', { class: 'btn btn-outline', title: t('act_delete') || 'Sil', style: { flexShrink: 0 } }) : null;
    if (deleteBtn) deleteBtn.innerHTML = PCD.icon('trash', 16);

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: '📦 ' + (existing ? (t('hcr_edit_row') || 'Satırı düzenle') : (t('hcr_new_row') || 'Yeni satır')) + ' #' + (rowIndex + 1),
      body: body, footer: footer, size: 'md', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('hcr_delete_title') || 'Bu satır silinsin mi?',
        text: t('hcr_delete_msg') || 'Mal kabul kaydı kalıcı olarak silinir.',
        okText: t('act_delete') || 'Sil',
      }).then(function (ok) {
        if (!ok) return;
        if (data.id) PCD.store.deleteFromTable(TABLE, data.id);
        PCD.toast.success(t('hcr_deleted') || 'Kayıt silindi');
        m.close();
        if (onClose) onClose();
      });
    });
    saveBtn.addEventListener('click', function () {
      // v2.9.40 — Day select'ten ay+gün → YYYY-MM-DD birleştir
      const daySel = body.querySelector('#rfDay');
      if (daySel) {
        const day = parseInt(daySel.value, 10) || 1;
        data.date = _viewMonth + '-' + String(day).padStart(2, '0');
      }
      data.supplier = body.querySelector('#rfSupplier').value.trim();
      data.productName = body.querySelector('#rfProduct').value.trim();
      data.quantity = body.querySelector('#rfQty').value.trim();
      data.quantityUnit = body.querySelector('#rfQtyU').value.trim();
      const tv = parseFloat(body.querySelector('#rfTemp').value);
      data.deliveryTemp = isNaN(tv) ? null : tv;
      data.expiryDate = body.querySelector('#rfExpiry').value || null;
      data.note = body.querySelector('#rfNote').value.trim();
      data.chef = body.querySelector('#rfChef').value.trim();

      if (!data.supplier && !data.productName && data.deliveryTemp == null) {
        PCD.toast.error(t('hcr_at_least_one') || 'En az ürün adı veya sıcaklık girin');
        return;
      }

      PCD.store.upsertInTable(TABLE, data, 'hcr');
      PCD.toast.success(t('saved') || 'Kaydedildi');
      m.close();
      if (onClose) onClose();
    });
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
      '<table class="h-grid">' +
      // v2.9.40 — colgroup zorunlu (table-layout:fixed). DAY=idx dar (3%),
      // FOOD/PRODUCT geniş, QTY/°C kompakt, NOTE genişçe.
      '<colgroup>' +
        '<col style="width:3%">' +    // idx
        '<col style="width:13%">' +   // supplier
        '<col style="width:20%">' +   // product
        '<col style="width:9%">' +    // qty
        '<col style="width:6%">' +    // temp
        '<col style="width:9%">' +    // exp (use-by)
        '<col style="width:5%">' +    // cond (ok/x)
        '<col style="width:22%">' +   // note
        '<col style="width:13%">' +   // chef
      '</colgroup>' +
      '<thead>' +
        '<tr>' +
          '<th>#</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_supplier') || 'Tedarikçi') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_product') || 'Ürün') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_qty') || 'Miktar') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_temp') || 'Teslim') + ' °' + u + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_expiry') || 'SKT') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_condition') || 'Koşul') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_note') || 'Not') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_chef') || 'Teslim alan') + '</th>' +
        '</tr>' +
      '</thead><tbody>';

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const r = byRow[i];
      const tempVal = r && r.deliveryTemp != null ? (u === 'F' ? ctoF(r.deliveryTemp) : r.deliveryTemp) + '°' : '';
      const expiry = r && r.expiryDate ? new Date(r.expiryDate + 'T00:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '';
      const cond = r ? (r.conditionOK === true ? '✓' : r.conditionOK === false ? '✗' : '') : '';
      const condFail = r && r.conditionOK === false;
      html += '<tr style="height:22px;">' +
        '<td class="idx">' + (i + 1) + '</td>' +
        '<td class="sup">' + (r ? PCD.escapeHtml(r.supplier || '') : '') + '</td>' +
        '<td class="prod">' + (r ? PCD.escapeHtml(r.productName || '') : '') + '</td>' +
        '<td class="qty">' + (r && r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '') + '</td>' +
        '<td class="t">' + tempVal + '</td>' +
        '<td class="exp">' + expiry + '</td>' +
        '<td class="cond' + (condFail ? ' fail' : '') + '">' + cond + '</td>' +
        '<td class="note">' + (r ? PCD.escapeHtml(r.note || '') : '') + '</td>' +
        '<td class="chef">' + (r ? PCD.escapeHtml(r.chef || '') : '') + '</td>' +
      '</tr>';
    }

    html += '</tbody></table>' + printFooter(t, u);

    PCD.print(html, 'HACCP Receiving · ' + (dateStr || 'Blank'));
  }

  // ============ PRINT (MONTHLY BLANK) ============
  function openMonthPickerModal() {
    const t = PCD.i18n.t;
    const today = new Date();
    const defaultYM = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:12px;">' +
        PCD.escapeHtml(t('hcr_month_picker_intro') || 'Ay seçin. Yazdırılan form 31 satırlık — ay boyunca elle doldurun.') +
      '</div>' +
      '<input id="hcrMonthIn" type="month" value="' + defaultYM + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">';

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'İptal', style: { flex: '1' } });
    const printBtn = PCD.el('button', { class: 'btn btn-primary', text: t('hcr_print_month_btn') || 'Yazdır', style: { flex: '2' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({
      title: '📄 ' + (t('hcr_month_picker_title') || 'Aylık boş form yazdır'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () {
      const ymVal = body.querySelector('#hcrMonthIn').value;
      if (!ymVal) { PCD.toast.error(t('hcr_month_picker_required') || 'Lütfen bir ay seçin'); return; }
      const parts = ymVal.split('-');
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(mo) || mo < 1 || mo > 12) {
        PCD.toast.error(t('hcr_month_picker_required') || 'Lütfen bir ay seçin');
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
      '<table class="h-grid">' +
      '<colgroup>' +
        '<col style="width:3%">' +
        '<col style="width:13%">' +
        '<col style="width:20%">' +
        '<col style="width:9%">' +
        '<col style="width:6%">' +
        '<col style="width:9%">' +
        '<col style="width:5%">' +
        '<col style="width:22%">' +
        '<col style="width:13%">' +
      '</colgroup>' +
      '<thead>' +
        '<tr>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_day') || 'Gün') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_supplier') || 'Tedarikçi') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_product') || 'Ürün') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_qty') || 'Miktar') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_temp') || 'Teslim') + ' °' + u + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_expiry') || 'SKT') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_condition') || 'Koşul') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_note') || 'Not') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_chef') || 'Teslim alan') + '</th>' +
        '</tr>' +
      '</thead><tbody>';

    for (let d = 1; d <= 31; d++) {
      html += '<tr style="height:22px;">' +
        '<td class="idx">' + d + '</td>' +
        '<td class="sup"></td>' +
        '<td class="prod"></td>' +
        '<td class="qty"></td>' +
        '<td class="t"></td>' +
        '<td class="exp"></td>' +
        '<td class="cond"></td>' +
        '<td class="note"></td>' +
        '<td class="chef"></td>' +
      '</tr>';
    }

    html += '</tbody></table>' + printFooter(t, u);

    PCD.print(html, 'HACCP Receiving · ' + monthLabel);
  }

  // v2.9.40 — Aylık dolu yazdırma: aydaki tüm kayıtları 31 satırlık template'e
  // yerleştirir (Cook & Cool printMonth pattern). Boş satırlar empty kalır.
  function printMonthFilled(monthYM) {
    const t = PCD.i18n.t;
    const u = getTempUnit();
    const ws = PCD.store.getActiveWorkspace ? PCD.store.getActiveWorkspace() : null;
    const wsName = (ws && ws.name) || 'Kitchen';
    const monthLbl = monthLabel(monthYM);

    const records = listForMonth(monthYM);
    const byRow = {};
    records.forEach(function (r) { if (typeof r.rowIndex === 'number') byRow[r.rowIndex] = r; });

    let html = printStylesAndHeader(wsName, monthLbl, u, t) +
      '<table class="h-grid">' +
      '<colgroup>' +
        '<col style="width:3%">' +
        '<col style="width:13%">' +
        '<col style="width:20%">' +
        '<col style="width:9%">' +
        '<col style="width:6%">' +
        '<col style="width:9%">' +
        '<col style="width:5%">' +
        '<col style="width:22%">' +
        '<col style="width:13%">' +
      '</colgroup>' +
      '<thead>' +
        '<tr>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_day') || 'Gün') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_supplier') || 'Tedarikçi') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_product') || 'Ürün') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_qty') || 'Miktar') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_temp') || 'Teslim') + ' °' + u + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_expiry') || 'SKT') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_condition') || 'Koşul') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_note') || 'Not') + '</th>' +
          '<th>' + PCD.escapeHtml(t('hcr_col_chef') || 'Teslim alan') + '</th>' +
        '</tr>' +
      '</thead><tbody>';

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const r = byRow[i];
      const dayLabel = r && r.date && r.date.length >= 10 ? parseInt(r.date.slice(8, 10), 10) : (i + 1);
      const tempVal = r && r.deliveryTemp != null ? (u === 'F' ? (Math.round((r.deliveryTemp * 9 / 5 + 32) * 10) / 10) : r.deliveryTemp) + '°' : '';
      const expiry = r && r.expiryDate ? new Date(r.expiryDate + 'T00:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '';
      const cond = r ? (r.conditionOK === true ? '✓' : (r.conditionOK === false ? '✗' : '')) : '';
      const condFail = r && r.conditionOK === false;
      html += '<tr>' +
        '<td class="idx">' + dayLabel + '</td>' +
        '<td class="sup">' + (r ? PCD.escapeHtml(r.supplier || '') : '') + '</td>' +
        '<td class="prod">' + (r ? PCD.escapeHtml(r.productName || '') : '') + '</td>' +
        '<td class="qty">' + (r && r.quantity ? PCD.escapeHtml(r.quantity) + (r.quantityUnit ? ' ' + PCD.escapeHtml(r.quantityUnit) : '') : '') + '</td>' +
        '<td class="t">' + tempVal + '</td>' +
        '<td class="exp">' + expiry + '</td>' +
        '<td class="cond' + (condFail ? ' fail' : '') + '">' + cond + '</td>' +
        '<td class="note">' + (r ? PCD.escapeHtml(r.note || '') : '') + '</td>' +
        '<td class="chef">' + (r ? PCD.escapeHtml(r.chef || '') : '') + '</td>' +
      '</tr>';
    }

    html += '</tbody></table>' + printFooter(t, u);
    PCD.print(html, 'HACCP Receiving · ' + monthLbl);
  }

  // v2.9.40 — region-aware target helpers
  function rcvHotMinC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().hotMinC) || 60; }
  function rcvColdMaxC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().coldMaxC) || 5; }
  function rcvFrozenMaxC() { return (PCD.haccp && PCD.haccp.getThresholds() && PCD.haccp.getThresholds().frozenMaxC) || -18; }

  function printStylesAndHeader(wsName, dateOrMonthLabel, u, t) {
    const tCold = u === 'F' ? (Math.round((rcvColdMaxC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvColdMaxC() + '°C';
    const tFrozen = u === 'F' ? (Math.round((rcvFrozenMaxC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvFrozenMaxC() + '°C';
    const tHot = u === 'F' ? (Math.round((rcvHotMinC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvHotMinC() + '°C';
    return '<style>' +
      // v2.9.40 — Cook & Cool single-page pattern: A4 sized body + flex column
      // + colgroup widths (added inline in printGrid) + compact footer + row 19px.
      // v2.11.5 — Popup window'da body height fixed + toolbar flex item → tablo
      // taşar → footer overlay bug. Fix: screen'de height auto, print 210mm.
      'body{font-family:"Inter",-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;margin:0;padding:0;' +
        'width:297mm;height:210mm;display:flex;flex-direction:column;}' +
      '@media screen { body { height: auto !important; } }' +
      '.h-sheet{flex:1 1 auto;min-height:0;padding:4mm;display:flex;flex-direction:column;}' +
      '.h-head{margin-bottom:2px;border-bottom:1.5px solid #16433a;padding-bottom:3px;display:flex;justify-content:space-between;align-items:flex-end;flex:0 0 auto;}' +
      '.h-head h1{margin:0;font-size:14px;}' +
      '.h-head .sub{font-size:10px;color:#555;margin-top:2px;}' +
      '.h-head .right{font-size:10px;color:#555;text-align:end;}' +
      'table.h-grid{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;flex:0 0 auto;}' +
      // v2.11.7 revert preserved + row height increased to 22px for better handwriting space
      'table.h-grid th, table.h-grid td{border:1px solid #999;padding:2px 4px;vertical-align:middle;line-height:1.25;}' +
      'table.h-grid th{background:#eaf6f0;color:#16433a;font-weight:700;font-size:9px;text-align:center;text-transform:uppercase;letter-spacing:0.03em;}' +
      'table.h-grid tr{height:22px;page-break-inside:avoid;}' +
      'table.h-grid td.idx{text-align:center;font-weight:700;color:#444;}' +
      'table.h-grid td.sup{font-weight:600;}' +
      'table.h-grid td.prod{font-weight:600;}' +
      'table.h-grid td.qty{text-align:center;}' +
      'table.h-grid td.t{text-align:center;font-weight:600;}' +
      'table.h-grid td.exp{text-align:center;color:#666;font-size:10px;}' +
      'table.h-grid td.cond{text-align:center;font-weight:700;}' +
      'table.h-grid td.note{font-size:10px;}' +
      'table.h-grid td.chef{text-align:center;}' +
      'table.h-grid td.fail{background:#fee2e2;color:#991b1b;}' +
      '.h-foot{margin-top:2px;display:flex;justify-content:space-between;font-size:9px;flex:0 0 auto;}' +
      '.h-foot .legend{color:#666;}' +
      '.pcd-print-footer{margin:0 !important;padding:1mm 4mm !important;border-top:none !important;flex:0 0 auto;font-size:7pt !important;line-height:1.2 !important;}' +
      '@page{size:A4 landscape;margin:0;}' +
    '</style>' +
    '<div class="h-sheet">' +
    '<div class="h-head">' +
      '<div>' +
        '<h1>HACCP · ' + PCD.escapeHtml(t('hcr_title') || 'Receiving Log') + '</h1>' +
        '<div class="sub">' + PCD.escapeHtml(wsName) + ' · ' + PCD.escapeHtml(dateOrMonthLabel) + ' · °' + u + '</div>' +
      '</div>' +
      '<div class="right">' +
        '<div><strong>' + PCD.escapeHtml(t('hcr_target_cold') || 'Soğuk') + ':</strong> ≤' + tCold + '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('hcr_target_frozen') || 'Donmuş') + ':</strong> ≤' + tFrozen + '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('hcr_target_hot') || 'Sıcak') + ':</strong> ≥' + tHot + '</div>' +
      '</div>' +
    '</div>';
  }

  function printFooter(t, u) {
    const tCold = u === 'F' ? (Math.round((rcvColdMaxC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvColdMaxC() + '°C';
    const tFrozen = u === 'F' ? (Math.round((rcvFrozenMaxC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvFrozenMaxC() + '°C';
    const tHot = u === 'F' ? (Math.round((rcvHotMinC() * 9 / 5 + 32) * 10) / 10) + '°F' : rcvHotMinC() + '°C';
    return '<div class="h-foot">' +
        '<div class="legend">' +
          '<strong>' + PCD.escapeHtml(t('hcr_legend') || 'HACCP gates') + ':</strong> ' +
          PCD.escapeHtml(t('hcr_target_cold') || 'Soğuk') + ' ≤' + tCold + ' · ' +
          PCD.escapeHtml(t('hcr_target_frozen') || 'Donmuş') + ' ≤' + tFrozen + ' · ' +
          PCD.escapeHtml(t('hcr_target_hot') || 'Sıcak') + ' ≥' + tHot +
        '</div>' +
        '<div><strong>' + PCD.escapeHtml(t('reviewed_by') || 'Kontrol eden') + ':</strong> ____________________</div>' +
      '</div>' +
      '</div>';  // /.h-sheet (v2.9.40)
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.haccpReceiving = {
    render: render,
    openEditor: function () {
      const records = listForMonth(_viewMonth);
      const used = {};
      records.forEach(function (r) { if (typeof r.rowIndex === 'number') used[r.rowIndex] = true; });
      let firstEmpty = 0;
      while (used[firstEmpty] && firstEmpty < ROWS_PER_PAGE) firstEmpty++;
      if (firstEmpty >= ROWS_PER_PAGE) {
        PCD.toast.info((PCD.i18n.t && PCD.i18n.t('hcr_month_full')) || 'Bu ay dolu, sonraki aya geç');
        return;
      }
      openRowEditor(firstEmpty, null, function () {
        const v = document.getElementById('view');
        if (v && PCD.router.currentView() === 'haccp_receiving') render(v);
      });
    },
  };
})();
