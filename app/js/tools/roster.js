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
  let _previewId = null;        // v2.15.6 — id = read-only preview view
  let _showCost = false;        // include labour cost in print/excel/share
  let _rPreviewOpen = true;     // v2.40 — önizleme details açık/kapalı durumu (re-render'lar arası korunur; varsayılan açık)
  let _h2cPromise = null;       // v2.15.6 — html2canvas lazy-load cache

  const DAY_OPTIONS = [5, 6, 7];

  // v2.15.6 — Çıktı yazı boyutu (S/M/L) + kalınlık. data.fontSize / data.bold.
  const FONT_SIZES = { s: 11, m: 13, l: 15 };
  function fontPx(data) { return FONT_SIZES[(data && data.fontSize) || 'm'] || 13; }

  let _jszipPromise = null;     // v2.15.6 — JSZip lazy-load cache (Excel landscape)

  // v2.15.6 — html2canvas (JPEG export) lazy CDN load — xlsx pattern.
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (_h2cPromise) return _h2cPromise;
    _h2cPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () { window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas missing')); };
      s.onerror = function () { _h2cPromise = null; reject(new Error('html2canvas load failed')); };
      document.head.appendChild(s);
    });
    return _h2cPromise;
  }

  // v2.15.6 — JSZip lazy CDN load. Gerek: SheetJS (xlsx-js-style) yazımda
  // <pageSetup>/<sheetPr> üretmiyor → Excel portre + çok sayfa açılıyor.
  // JSZip ile yazılan .xlsx'in sheet XML'ine print ayarları enjekte edilir.
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (_jszipPromise) return _jszipPromise;
    _jszipPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function () { window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip missing')); };
      s.onerror = function () { _jszipPromise = null; reject(new Error('JSZip load failed')); };
      document.head.appendChild(s);
    });
    return _jszipPromise;
  }

  // v2.15.6 — Excel'i OTOMATİK YATAY + tek sayfaya sığacak şekilde kaydet.
  // SheetJS yazıp, JSZip ile sheet1.xml'e <sheetPr fitToPage> + <pageSetup
  // landscape fitToWidth> enjekte eder. Başarısız olursa düz writeFile'a düşer.
  function saveXlsxLandscape(XLSX, wb, filename) {
    function plain() { try { XLSX.writeFile(wb, filename); } catch (e) {} }
    loadJSZip().then(function (JSZip) {
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      return JSZip.loadAsync(buf).then(function (zip) {
        const path = 'xl/worksheets/sheet1.xml';
        const f = zip.file(path);
        if (!f) { plain(); return null; }
        return f.async('string').then(function (xml) {
          if (xml.indexOf('<sheetPr') < 0) xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
          if (xml.indexOf('<pageSetup') < 0) {
            const ps = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
            if (/<pageMargins[^>]*\/>/.test(xml)) xml = xml.replace(/(<pageMargins[^>]*\/>)/, '$1' + ps);
            else xml = xml.replace('</worksheet>', ps + '</worksheet>');
          }
          zip.file(path, xml);
          return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }).then(function (blob) {
          if (!blob) return;
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        });
      });
    }).catch(function () { plain(); });
  }

  // v2.15.4 — Vardiya saati YERİNE atanabilen durum/izin kodları.
  // Renkler print + grid'de kullanılır (otel rosterleri: OFF mavi, AL turuncu,
  // PH yeşil…). Durum hücresi = 0 saat (start/end yok). id = kısa kod (print/
  // excel/share aynı kodu basar). Yeni kod gerekirse buraya + roster_st_* i18n.
  const ROSTER_STATUS = [
    { id: 'OFF', labelKey: 'roster_st_off', color: '#1d4ed8', fill: '#dbeafe' },
    { id: 'AL',  labelKey: 'roster_st_al',  color: '#b45309', fill: '#fde9d3' },
    { id: 'PH',  labelKey: 'roster_st_ph',  color: '#15803d', fill: '#dcfce7' },
    { id: 'SL',  labelKey: 'roster_st_sl',  color: '#b91c1c', fill: '#fee2e2' },
    { id: 'RDO', labelKey: 'roster_st_rdo', color: '#0e7490', fill: '#cffafe' },
    { id: 'UNP', labelKey: 'roster_st_unp', color: '#525252', fill: '#ededed' },
  ];
  function statusDef(id) { return ROSTER_STATUS.find(function (s) { return s.id === id; }); }
  function cellIsStatus(c) { return !!(c && c.status); }
  function cellHasShift(c) { return !!(c && c.start && c.end); }

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

  // v2.15.4 — Personeli departman/gruba göre böl (BANQUET, COLD KITCHEN…).
  // Hiç grup tanımlı değilse tek grupta toplar (başlıksız) — eski rosterler
  // aynen çalışır. Grup sırası ilk-görünen sıraya göre.
  function groupedStaff(r) {
    const staff = (r.staff || []);
    const anyGroup = staff.some(function (s) { return (s.group || '').trim(); });
    if (!anyGroup) return [{ group: '', staff: staff }];
    const order = [], map = {};
    staff.forEach(function (s) {
      const g = (s.group || '').trim() || (t('roster_no_group') || 'Other');
      if (!map[g]) { map[g] = []; order.push(g); }
      map[g].push(s);
    });
    return order.map(function (g) { return { group: g, staff: map[g] }; });
  }

  // v2.15.4 — Çıktılar (print/excel/share) için ortak yapısal matris:
  // { days:[label], groups:[{ name, rows:[{ staff, cells:[{text,status?}], hours, cost }] }] }
  function rosterMatrix(data) {
    const dayCount = data.dayCount || 7;
    const days = [];
    for (let d = 0; d < dayCount; d++) days.push(dayLabel(data.weekStart, d));
    const groups = groupedStaff(data).map(function (g) {
      return {
        name: g.group,
        rows: g.staff.map(function (st) {
          const cells = (data.cells && data.cells[st.id]) || {};
          const out = [];
          for (let d = 0; d < dayCount; d++) {
            const c = cells[d];
            if (cellIsStatus(c)) out.push({ status: c.status, text: c.status });
            else if (cellHasShift(c)) out.push({ text: c.start + '-' + c.end + (c.note ? ' ' + c.note : '') });
            else out.push({ text: '' });
          }
          return { staff: st, cells: out, hours: staffHours(data, st.id), cost: staffCost(data, st) };
        })
      };
    });
    return { days: days, groups: groups };
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
  // v2.15.6 — Mod route param'dan gelir (router.go('roster',{editId|previewId}));
  // böylece Chrome geri tuşu editör/önizlemeden listeye düşer (dashboard'a değil).
  // params VERİLİRSE (router navigasyonu, arguments.length>=2) mod sıfırlanır;
  // params YOKSA (içeriden render(view) refresh) mevcut mod korunur.
  function render(view, params) {
    if (arguments.length >= 2) {
      _editingId = (params && params.editId) || null;
      _previewId = (params && params.previewId) || null;
    }
    if (_editingId) {
      const r = PCD.store.getFromTable('rosters', _editingId);
      if (r) { renderEditor(view, r); return; }
      _editingId = null;
    }
    if (_previewId) {
      const r = PCD.store.getFromTable('rosters', _previewId);
      if (r) { renderPreview(view, r); return; }
      _previewId = null;
    }
    renderList(view);
  }

  // ============ LIST VIEW ============
  function renderList(view) {
    const rosters = listRosters();
    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('roster_title') || 'Roster') + '</div>' +
        '<div class="page-subtitle">' + rosters.length + ' ' + PCD.escapeHtml(rosters.length === 1 ? (t('roster_week') || 'week') : (t('roster_weeks') || 'weeks')) + '</div>' +
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
          '<button class="icon-btn" data-edit="' + r.id + '" title="' + PCD.escapeHtml(t('edit') || 'Edit') + '">' + PCD.icon('edit', 18) + '</button>' +
          '<button class="icon-btn" data-dup="' + r.id + '" title="' + PCD.escapeHtml(t('roster_duplicate') || 'Duplicate') + '">' + PCD.icon('copy', 18) + '</button>';
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    // v2.15.6 — Yeni/duplicate → editör; satır tıkla → önizleme; Edit → editör.
    function openNew() {
      if (PCD.gate) {
        if (!PCD.gate.requireAuth()) return;
        if (!PCD.gate.canCreate('rosters', (PCD.store.listTable('rosters') || []).length)) { PCD.gate.showUpgradeModal({ feature: 'rosters', message: PCD.i18n.t('gate_create_limit') }); return; }
      }
      const saved = PCD.store.upsertInTable('rosters', newRoster(), 'rost'); PCD.router.go('roster', { editId: saved.id });
    }
    const nb = PCD.$('#newRosterBtn', view); if (nb) nb.addEventListener('click', openNew);
    const en = PCD.$('#emptyNewRoster', view); if (en) en.addEventListener('click', openNew);
    wireGuide(view);
    PCD.on(listEl, 'click', '[data-open]', function (e) {
      if (e.target.closest('[data-dup]') || e.target.closest('[data-edit]')) return;
      PCD.router.go('roster', { previewId: this.getAttribute('data-open') });
    });
    PCD.on(listEl, 'click', '[data-edit]', function (e) {
      e.stopPropagation();
      PCD.router.go('roster', { editId: this.getAttribute('data-edit') });
    });
    PCD.on(listEl, 'click', '[data-dup]', function (e) {
      e.stopPropagation();
      const src = PCD.store.getFromTable('rosters', this.getAttribute('data-dup'));
      if (!src) return;
      if (PCD.gate) {
        if (!PCD.gate.requireAuth()) return;
        if (!PCD.gate.canCreate('rosters', (PCD.store.listTable('rosters') || []).length)) { PCD.gate.showUpgradeModal({ feature: 'rosters', message: PCD.i18n.t('gate_create_limit') }); return; }
      }
      const saved = PCD.store.upsertInTable('rosters', newRoster(src), 'rost');
      PCD.router.go('roster', { editId: saved.id });
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
        '<div class="page-title" style="font-size:20px;">' + PCD.escapeHtml(data.venue || data.name || weekRange(data)) + '</div>' +
      '</div>' +
      // v2.40 — Aksiyonlar header'a taşındı (en alta kaydırmaya gerek yok; mobilde flex-wrap ile sarar)
      '<div class="page-header-actions">' +
        '<button class="btn btn-secondary btn-sm" id="rPrint">' + PCD.icon('print', 14) + ' ' + PCD.escapeHtml(t('print') || 'Print') + '</button>' +
        '<button class="btn btn-secondary btn-sm" id="rExcel">' + PCD.icon('download', 14) + ' ' + PCD.escapeHtml(t('roster_excel') || 'Excel') + '</button>' +
        '<button class="btn btn-primary btn-sm" id="rShare">' + PCD.icon('share', 14) + ' ' + PCD.escapeHtml(t('roster_share') || 'Share / Send') + '</button>' +
        '<button class="btn btn-ghost btn-sm" id="rDelete" style="color:var(--danger);">' + PCD.icon('trash', 14) + ' ' + PCD.escapeHtml(t('delete') || 'Delete') + '</button>' +
      '</div></div>';

    // Meta row
    html +=
      '<div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div class="field" style="flex:2;min-width:170px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_venue') || 'Kitchen / Department (heading)') + '</label>' +
          '<input type="text" class="input" id="rVenue" value="' + PCD.escapeHtml(data.venue || '') + '" placeholder="' + PCD.escapeHtml(t('roster_venue_ph') || 'e.g. Main Kitchen — Duty Roster') + '"></div>' +
        '<div class="field" style="flex:2;min-width:150px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_name') || 'Name') + '</label>' +
          '<input type="text" class="input" id="rName" value="' + PCD.escapeHtml(data.name || '') + '" placeholder="' + PCD.escapeHtml(t('roster_name_ph') || 'e.g. Week 21') + '"></div>' +
        '<div class="field" style="flex:1;min-width:120px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_week_start') || 'Week start') + '</label>' +
          '<input type="date" class="input" id="rStart" value="' + PCD.escapeHtml(data.weekStart) + '"></div>' +
        '<div class="field" style="min-width:90px;margin:0;"><label class="field-label">' + PCD.escapeHtml(t('roster_days') || 'Days') + '</label>' +
          '<select class="select" id="rDays">' + DAY_OPTIONS.map(function (d) { return '<option value="' + d + '"' + (dayCount === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
      '</div>';

    // Shift templates — v2.40: daraltılabilir (yer kazanır; cell-fill yine kullanır)
    html += '<details class="card" style="padding:0;margin-bottom:12px;overflow:hidden;">' +
      '<summary style="cursor:pointer;padding:11px 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);list-style:none;">⏱ ' + PCD.escapeHtml(t('roster_templates') || 'Shift templates') + '</summary>' +
      '<div style="padding:0 12px 12px;">' +
        '<div id="tplList" style="display:flex;flex-direction:column;gap:6px;"></div>' +
        '<button class="btn btn-ghost btn-sm" id="addTpl" style="margin-top:6px;">' + PCD.icon('plus', 14) + ' ' + PCD.escapeHtml(t('roster_add_template') || 'Add template') + '</button>' +
      '</div></details>';

    // Grid
    html += '<div class="card" style="padding:12px;margin-bottom:12px;overflow-x:auto;">' +
      '<table id="rosterGrid" style="width:100%;border-collapse:collapse;min-width:' + (160 + dayCount * 96) + 'px;">' + gridHtml(data) + '</table>' +
      '<button class="btn btn-ghost btn-sm" id="addStaff" style="margin-top:10px;">' + PCD.icon('plus', 14) + ' ' + PCD.escapeHtml(t('roster_add_staff') || 'Add staff') + '</button>' +
      '<button class="btn btn-ghost btn-sm" id="rCopyPrev" style="margin-top:10px;margin-inline-start:8px;">⧉ ' + PCD.escapeHtml(t('roster_copy_prev') || 'Copy previous week') + '</button></div>';

    // Labour summary + cost toggle + actions
    html += '<div class="card" style="padding:14px;margin-bottom:12px;">' +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">' +
        '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('roster_total_hours') || 'Total hours') + '</div><div style="font-size:20px;font-weight:800;">' + PCD.fmtNumber(tot.hours) + '</div></div>' +
        // v2.17 — İşçilik maliyeti Pro özelliği. Free'de kilitli önizleme.
        '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('roster_labour_cost') || 'Labour cost') + '</div><div style="font-size:20px;font-weight:800;color:var(--brand-700);">' + ((PCD.gate && !PCD.gate.canUseLaborCost()) ? PCD.gate.lockChip(12) : (tot.cost > 0 ? PCD.fmtMoney(tot.cost) : '—')) + '</div></div>' +
        ((PCD.gate && !PCD.gate.canUseLaborCost())
          ? '<label class="checkbox" id="rShowCostLocked" style="margin-inline-start:auto;cursor:pointer;opacity:0.7;"><span>' + PCD.icon('lock', 12) + ' ' + PCD.escapeHtml(t('roster_show_cost') || 'Show labour cost in print / share / Excel') + '</span></label>'
          : '<label class="checkbox" style="margin-inline-start:auto;"><input type="checkbox" id="rShowCost"' + (_showCost ? ' checked' : '') + '><span>' + PCD.escapeHtml(t('roster_show_cost') || 'Show labour cost in print / share / Excel') + '</span></label>') +
      '</div>' +
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' + fontControlsHtml(data) + '</div>' +
      '</div>';

    // v2.36 — Canlı A4 baskı önizlemesi (çıktıyla birebir; tek motor buildRosterTable)
    html += '<details class="card" id="rPreviewWrap" ' + (_rPreviewOpen ? 'open' : '') + ' style="padding:0;margin-bottom:12px;overflow:hidden;">' +
      '<summary style="cursor:pointer;padding:12px 14px;font-weight:700;list-style:none;">📄 ' + PCD.escapeHtml(t('roster_preview') || 'Print preview') + '</summary>' +
      '<div id="rPreview" style="padding:12px 14px;background:#fff;border-top:1px solid var(--border);"></div></details>';

    view.innerHTML = html;
    renderTemplates(view, data);
    wireEditor(view, data);
  }

  // v2.15.4 — Tek hücre butonu (vardiya / durum kodu / boş). Renkli durum kodları.
  function cellButtonHtml(stId, d, c) {
    const isSt = cellIsStatus(c);
    const sd = isSt ? statusDef(c.status) : null;
    const filled = cellHasShift(c);
    let bg, border, color, label;
    if (isSt) {
      bg = sd ? sd.fill : '#ededed'; border = sd ? sd.color : '#999'; color = sd ? sd.color : '#444';
      label = PCD.escapeHtml(c.status);
    } else if (filled) {
      bg = 'var(--brand-50)'; border = 'var(--brand-400)'; color = 'var(--brand-700)';
      label = PCD.escapeHtml(c.start + '-' + c.end) + (c.note ? '<br><span style="font-weight:400;font-size:10px;">' + PCD.escapeHtml(c.note) + '</span>' : '');
    } else {
      bg = 'var(--surface)'; border = 'var(--border-strong)'; color = 'var(--text-3)'; label = '+';
    }
    const solid = (isSt || filled) ? 'solid' : 'dashed';
    return '<button class="roster-cell" data-cell="' + stId + ':' + d + '" style="width:100%;min-height:42px;border:1px ' + solid + ' ' + border + ';border-radius:6px;background:' + bg + ';cursor:pointer;font-size:11px;font-weight:700;color:' + color + ';padding:4px;line-height:1.25;">' + label + '</button>';
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
    // v2.15.4 — Departman/grup başlıklı satırlar (groupedStaff `.group` döndürür)
    groupedStaff(data).forEach(function (grp) {
      if (grp.group) {
        h += '<tr><td colspan="' + (dayCount + 1) + '" style="padding:7px 8px;background:var(--brand-50);border-top:2px solid var(--brand-200);border-bottom:1px solid var(--brand-200);font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--brand-700);">' + PCD.escapeHtml(grp.group) + '</td></tr>';
      }
      grp.staff.forEach(function (st) {
        const cells = (data.cells && data.cells[st.id]) || {};
        h += '<tr data-staff-row="' + st.id + '">' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top;">' +
            '<div style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(st.name || '—') + '</div>' +
            '<div class="text-muted" style="font-size:11px;">' + PCD.escapeHtml(st.role || '') + (Number(st.rate) > 0 ? ' · ' + (PCD.currencySymbol && PCD.currencySymbol() || '$') + PCD.fmtNumber(st.rate) + '/h' : '') + '</div>' +
            '<button class="btn btn-ghost btn-sm" data-edit-staff="' + st.id + '" style="padding:2px 6px;font-size:11px;margin-top:2px;">' + PCD.escapeHtml(t('edit') || 'Edit') + '</button>' +
            '<button class="btn btn-ghost btn-sm" data-fill-row="' + st.id + '" style="padding:2px 6px;font-size:11px;margin-top:2px;color:var(--brand-700);" title="' + PCD.escapeHtml(t('roster_fill_week') || 'Fill week') + '">⚡ ' + PCD.escapeHtml(t('roster_fill_week') || 'Fill week') + '</button>' +
          '</td>';
        for (let d = 0; d < dayCount; d++) {
          h += '<td style="padding:3px;border-bottom:1px solid var(--border);text-align:center;">' + cellButtonHtml(st.id, d, cells[d]) + '</td>';
        }
        h += '</tr>';
      });
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
    PCD.$('#rosterBack', view).addEventListener('click', function () { history.back(); });
    const _venueEl = PCD.$('#rVenue', view); if (_venueEl) _venueEl.addEventListener('input', function () { data.venue = this.value; persist(data); });
    PCD.$('#rName', view).addEventListener('input', function () { data.name = this.value; persist(data); });
    PCD.$('#rStart', view).addEventListener('change', function () { data.weekStart = this.value || data.weekStart; persist(data); render(view); });
    PCD.$('#rDays', view).addEventListener('change', function () { data.dayCount = parseInt(this.value, 10) || 7; persist(data); render(view); });
    // v2.17 — Pro'da gerçek toggle; free'de kilitli label → upgrade modal.
    const _showCostEl = PCD.$('#rShowCost', view);
    if (_showCostEl) _showCostEl.addEventListener('change', function () { _showCost = this.checked; mountRosterPv(PCD.$('#rPreview', view), data, _showCost); });
    // v2.40 — Önizlemeyi scale-to-fit mount et; details açılınca/yeniden boyutlanınca yeniden ölçekle.
    mountRosterPv(PCD.$('#rPreview', view), data, _showCost);
    const _rpWrap = PCD.$('#rPreviewWrap', view);
    if (_rpWrap) _rpWrap.addEventListener('toggle', function () { _rPreviewOpen = _rpWrap.open; if (_rpWrap.open) { const b = view.querySelector('#rPreview .rost-pvbox'); if (b) fitRosterPv(b); } });
    let _rpRsz = null; window.addEventListener('resize', function () { clearTimeout(_rpRsz); _rpRsz = setTimeout(function () { const b = view.querySelector('.rost-pvbox'); if (b) fitRosterPv(b); }, 150); });
    const _showCostLocked = PCD.$('#rShowCostLocked', view);
    if (_showCostLocked) _showCostLocked.addEventListener('click', function () {
      if (PCD.gate && PCD.gate.showUpgradeModal) PCD.gate.showUpgradeModal({ feature: 'labor', message: t('labor_cost_locked') });
    });
    wireFontControls(view, data);

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
    // v2.36 — Hızlı doldurma + önceki haftayı kopyala
    PCD.on(view, 'click', '[data-fill-row]', function () { openRowFill(view, data, this.getAttribute('data-fill-row')); });
    const _cpEl = PCD.$('#rCopyPrev', view); if (_cpEl) _cpEl.addEventListener('click', function () { copyPreviousWeek(view, data); });

    // Cells
    PCD.on(view, 'click', '[data-cell]', function () {
      const parts = this.getAttribute('data-cell').split(':'); openCellEditor(view, data, parts[0], parseInt(parts[1], 10));
    });

    // Outputs (v2.15.6 — Share/Send artık görsel JPEG; vasat metin kaldırıldı)
    PCD.$('#rPrint', view).addEventListener('click', function () { printRoster(data, _showCost); });
    PCD.$('#rExcel', view).addEventListener('click', function () { excelRoster(data, _showCost); });
    PCD.$('#rShare', view).addEventListener('click', function () { sendRosterImage(data, _showCost); });
    PCD.$('#rDelete', view).addEventListener('click', function () {
      PCD.modal.confirm({ icon: '🗑', iconKind: 'danger', danger: true, title: t('confirm_delete') || 'Delete?', text: (data.name || weekRange(data)), okText: t('delete') || 'Delete' }).then(function (ok) {
        if (!ok) return; PCD.store.deleteFromTable('rosters', data.id); PCD.router.go('roster');
      });
    });
  }

  function openStaffEditor(view, data, sid) {
    const existing = sid ? (data.staff || []).find(function (s) { return s.id === sid; }) : null;
    const st = existing ? PCD.clone(existing) : { id: PCD.uid('rs'), name: '', role: '', rate: '', group: '' };
    // v2.15.4 — Mevcut departman/grup adlarından datalist (hızlı seçim)
    const groupNames = [];
    (data.staff || []).forEach(function (s) { const g = (s.group || '').trim(); if (g && groupNames.indexOf(g) < 0) groupNames.push(g); });
    const groupDatalist = '<datalist id="stGroupList">' + groupNames.map(function (g) { return '<option value="' + PCD.escapeHtml(g) + '">'; }).join('') + '</datalist>';
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_name') || 'Name') + ' *</label><input type="text" class="input" id="stName" value="' + PCD.escapeHtml(st.name || '') + '" placeholder="' + PCD.escapeHtml(t('roster_staff_name_ph') || 'e.g. Maria') + '"></div>' +
      '<div class="field-row"><div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_role') || 'Role') + '</label><input type="text" class="input" id="stRole" value="' + PCD.escapeHtml(st.role || '') + '" placeholder="' + PCD.escapeHtml(t('roster_staff_role_ph') || 'e.g. Chef de Partie') + '"></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_rate') || 'Hourly rate') + '</label><input type="number" class="input" id="stRate" value="' + PCD.escapeHtml(st.rate != null ? String(st.rate) : '') + '" step="0.01" min="0" placeholder="' + PCD.escapeHtml((PCD.currencySymbol && PCD.currencySymbol() || '$')) + '/h"></div></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_staff_group') || 'Department / group') + '</label><input type="text" class="input" id="stGroup" list="stGroupList" value="' + PCD.escapeHtml(st.group || '') + '" placeholder="' + PCD.escapeHtml(t('roster_staff_group_ph') || 'e.g. Cold Kitchen (optional)') + '">' + groupDatalist + '<div class="field-hint">' + PCD.escapeHtml(t('roster_staff_group_hint') || 'Staff with the same department are grouped together with a heading on the roster.') + '</div></div>';
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
      st.group = (PCD.$('#stGroup', body).value || '').trim();
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
    // v2.15.4 — Durum/izin kodu butonları (tek tıkla OFF/AL/PH/SL…). Renkli.
    const grpHd = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);margin:2px 0 6px;';
    const statusBtns = ROSTER_STATUS.map(function (s) {
      const active = cellIsStatus(cur) && cur.status === s.id;
      return '<button type="button" class="btn btn-sm" data-pick-status="' + s.id + '" style="background:' + s.fill + ';border:1px solid ' + s.color + ';color:' + s.color + ';font-weight:700;' + (active ? 'box-shadow:0 0 0 2px ' + s.color + ';' : '') + '">' + PCD.escapeHtml(s.id + ' · ' + (t(s.labelKey) || s.id)) + '</button>';
    }).join('');
    body.innerHTML =
      '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(st.name + ' · ' + dayLabel(data.weekStart, day)) + '</div>' +
      '<div style="' + grpHd + '">' + PCD.escapeHtml(t('roster_shift_time') || 'Shift time') + '</div>' +
      (tplBtns ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + tplBtns + '</div>' : '') +
      '<div class="field-row"><div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_start') || 'Start') + '</label><input type="time" class="input" id="cStart" value="' + PCD.escapeHtml(cur.start || '') + '"></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_end') || 'End') + '</label><input type="time" class="input" id="cEnd" value="' + PCD.escapeHtml(cur.end || '') + '"></div></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_note') || 'Note') + '</label><input type="text" class="input" id="cNote" value="' + PCD.escapeHtml(cur.note || '') + '" placeholder="' + PCD.escapeHtml(t('roster_note_ph') || 'optional') + '"></div>' +
      '<div style="border-top:1px solid var(--border);margin:12px 0 10px;"></div>' +
      '<div style="' + grpHd + '">' + PCD.escapeHtml(t('roster_status_or') || 'Or mark as leave / day off') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + statusBtns + '</div>';
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
    // v2.15.4 — Durum kodu tek tıkla uygula (vardiya saatini temizler)
    PCD.on(body, 'click', '[data-pick-status]', function () {
      const id = this.getAttribute('data-pick-status');
      data.cells[sid][day] = { status: id };
      persist(data); m.close(); render(view);
    });
    cancel.addEventListener('click', function () { m.close(); });
    clear.addEventListener('click', function () { delete data.cells[sid][day]; persist(data); m.close(); render(view); });
    save.addEventListener('click', function () {
      const s = PCD.$('#cStart', body).value, e = PCD.$('#cEnd', body).value;
      // v2.15.4 — Saat girilince durum kodunu temizle (ikisi bir arada olmaz)
      if (!s || !e) { delete data.cells[sid][day]; } else { data.cells[sid][day] = { start: s, end: e, note: (PCD.$('#cNote', body).value || '').trim() }; }
      persist(data); m.close(); render(view);
    });
  }

  // v2.36 — Hızlı doldurma: bir personelin TÜM haftasını tek popup'tan doldur/temizle.
  function openRowFill(view, data, sid) {
    const st = (data.staff || []).find(function (s) { return s.id === sid; });
    if (!st) return;
    data.cells = data.cells || {}; data.cells[sid] = data.cells[sid] || {};
    const dayCount = data.dayCount || 7;
    const grpHd = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);margin:2px 0 6px;';
    const body = PCD.el('div');
    const tplBtns = (data.templates || []).map(function (tp) {
      return '<button type="button" class="btn btn-outline btn-sm" data-fill-tpl="' + tp.id + '">' + PCD.escapeHtml((tp.label || '') + ' ' + (tp.start || '') + '-' + (tp.end || '')) + '</button>';
    }).join('');
    const statusBtns = ROSTER_STATUS.map(function (s) {
      return '<button type="button" class="btn btn-sm" data-fill-status="' + s.id + '" style="background:' + s.fill + ';border:1px solid ' + s.color + ';color:' + s.color + ';font-weight:700;">' + PCD.escapeHtml(s.id + ' · ' + (t(s.labelKey) || s.id)) + '</button>';
    }).join('');
    body.innerHTML =
      '<div class="text-muted text-sm mb-2">' + PCD.escapeHtml(st.name + ' — ' + (t('roster_fill_week_hint') || ('apply to all ' + dayCount + ' days'))) + '</div>' +
      '<div style="' + grpHd + '">' + PCD.escapeHtml(t('roster_shift_time') || 'Shift time') + '</div>' +
      (tplBtns ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + tplBtns + '</div>' : '') +
      '<div class="field-row"><div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_start') || 'Start') + '</label><input type="time" class="input" id="fStart"></div>' +
      '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('roster_end') || 'End') + '</label><input type="time" class="input" id="fEnd"></div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="fApplyTime" style="width:100%;">' + PCD.escapeHtml(t('roster_fill_apply') || 'Fill week with this time') + '</button>' +
      '<div style="border-top:1px solid var(--border);margin:12px 0 10px;"></div>' +
      '<div style="' + grpHd + '">' + PCD.escapeHtml(t('roster_fill_status') || 'Or mark whole week as') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + statusBtns + '</div>';
    const clear = PCD.el('button', { class: 'btn btn-ghost', text: t('roster_clear_week') || 'Clear week', style: { color: 'var(--danger)' } });
    const cancel = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(clear); footer.appendChild(cancel);
    const m = PCD.modal.open({ title: t('roster_fill_week') || 'Fill week', body: body, footer: footer, size: 'sm', closable: true });
    function fillAll(makeCell) { for (let d = 0; d < dayCount; d++) data.cells[sid][d] = makeCell(); persist(data); m.close(); render(view); }
    PCD.on(body, 'click', '[data-fill-tpl]', function () {
      const id = this.getAttribute('data-fill-tpl');
      const tp = (data.templates || []).find(function (x) { return x.id === id; });
      if (tp && tp.start && tp.end) fillAll(function () { return { start: tp.start, end: tp.end }; });
    });
    PCD.on(body, 'click', '[data-fill-status]', function () {
      const id = this.getAttribute('data-fill-status');
      fillAll(function () { return { status: id }; });
    });
    PCD.$('#fApplyTime', body).addEventListener('click', function () {
      const s = PCD.$('#fStart', body).value, e = PCD.$('#fEnd', body).value;
      if (!s || !e) { PCD.toast.error(t('roster_need_time') || 'Enter start and end'); return; }
      fillAll(function () { return { start: s, end: e }; });
    });
    cancel.addEventListener('click', function () { m.close(); });
    clear.addEventListener('click', function () { data.cells[sid] = {}; persist(data); m.close(); render(view); });
  }

  // v2.36 — Önceki haftanın vardiyalarını bu rostera kopyala (isimle eşleştirir).
  function copyPreviousWeek(view, data) {
    const prev = listRosters().filter(function (r) { return r.id !== data.id && (r.weekStart || '') < (data.weekStart || ''); })
      .sort(function (a, b) { return (b.weekStart || '').localeCompare(a.weekStart || ''); })[0];
    if (!prev) { PCD.toast.info(t('roster_copy_none') || 'No earlier roster to copy from'); return; }
    PCD.modal.confirm({
      icon: '⧉', title: t('roster_copy_prev') || 'Copy previous week',
      text: (t('roster_copy_confirm') || 'Copy shifts from') + ' ' + (prev.name || weekRange(prev)) + '? ' + (t('roster_copy_overwrite') || 'This overwrites the current week.'),
      okText: t('roster_copy_prev') || 'Copy',
    }).then(function (ok) {
      if (!ok) return;
      const byName = {};
      (prev.staff || []).forEach(function (s) { byName[(s.name || '').trim().toLowerCase()] = (prev.cells || {})[s.id]; });
      data.cells = data.cells || {};
      let n = 0;
      (data.staff || []).forEach(function (s) { const pc = byName[(s.name || '').trim().toLowerCase()]; if (pc) { data.cells[s.id] = PCD.clone(pc); n++; } });
      persist(data); render(view);
      PCD.toast.success((n || 0) + ' ' + (t('roster_copy_done') || 'staff copied from previous week'));
    });
  }

  // ============ OUTPUTS ============
  // v2.15.6 — Tek kaynak renkli tablo (inline stiller → print + JPEG + önizleme
  // aynı). Yazı boyutu data.fontSize (s/m/l) + data.bold uygulanır. table-layout
  // fixed + % genişlik → A4 yatay tek sayfaya sığar (font değişse de).
  function buildRosterTable(data, showCost) {
    const esc = PCD.escapeHtml;
    const mx = rosterMatrix(data);
    const ndays = mx.days.length;
    const ncol = 2 + ndays + 1 + (showCost ? 1 : 0);
    const title = data.venue || data.name || (t('roster_title') || 'Roster');
    const sub = (data.venue && data.name ? data.name + '  ·  ' : '') + weekRange(data);
    const fp = fontPx(data);
    const wt = data.bold ? '700' : '400';
    const cb = 'border:1px solid #d6d3d1;padding:5px 7px;font-size:' + fp + 'px;text-align:center;vertical-align:middle;line-height:1.3;';
    const hd = 'border:1px solid #d6d3d1;padding:5px 7px;font-size:' + (fp - 1) + 'px;text-align:center;vertical-align:middle;line-height:1.3;background:#16433a;color:#fff;font-weight:700;text-transform:uppercase;';
    // v2.41 — html2canvas 1.4.1 td/th `vertical-align:middle`'ı DOĞRU uyguluyor.
    // Eski flex-wrapper `align-items:center`'ı UYGULAMIYORDU → notlu (2-satırlık)
    // hücreler satırı uzatınca tek-satırlık hücrelerin yazısı yukarı kayıyordu
    // (JPEG export'ta "ortalanmıyor" bug'ı). Ortalama artık doğrudan td'de
    // (vertical-align:middle + text-align:left/center). cw() pass-through; sol
    // hizalı hücrelerin td'sinde zaten `text-align:left` var.
    function cw(content) { return content; }
    let h = '';
    h += '<div style="background:#16433a;color:#fff;padding:11px 15px;border-radius:6px;margin-bottom:11px;">'
      + '<div style="font-size:' + (fp + 8) + 'px;font-weight:800;">' + esc(title) + '</div>'
      + '<div style="font-size:' + fp + 'px;opacity:0.93;margin-top:2px;">' + esc(sub) + '</div></div>';
    h += '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">';
    h += '<tr><th align="left" valign="middle" style="' + hd + 'text-align:left;width:15%;">' + cw(esc(t('roster_staff') || 'Staff'), 'flex-start') + '</th>'
      + '<th align="left" valign="middle" style="' + hd + 'text-align:left;width:12%;">' + cw(esc(t('roster_staff_role') || 'Role'), 'flex-start') + '</th>';
    mx.days.forEach(function (d) { h += '<th align="center" valign="middle" style="' + hd + '">' + cw(esc(d)) + '</th>'; });
    h += '<th align="center" valign="middle" style="' + hd + 'width:5%;">' + cw(esc(t('roster_hours') || 'H')) + '</th>';
    if (showCost) h += '<th align="center" valign="middle" style="' + hd + 'width:8%;">' + cw(esc(t('roster_labour_cost') || 'Cost')) + '</th>';
    h += '</tr>';
    mx.groups.forEach(function (g) {
      if (g.name) h += '<tr><td colspan="' + ncol + '" align="left" valign="middle" style="' + cb + 'background:#eaf6f0;color:#16433a;font-weight:800;text-align:left;text-transform:uppercase;">' + cw(esc(g.name), 'flex-start') + '</td></tr>';
      g.rows.forEach(function (row) {
        h += '<tr><td align="left" valign="middle" style="' + cb + 'text-align:left;">' + cw('<span style="font-weight:700;word-break:break-word;">' + esc(row.staff.name || '') + '</span>', 'flex-start') + '</td>'
          + '<td align="left" valign="middle" style="' + cb + 'text-align:left;">' + cw('<span style="color:#555;font-size:' + (fp - 1) + 'px;word-break:break-word;">' + esc(row.staff.role || '') + '</span>', 'flex-start') + '</td>';
        row.cells.forEach(function (cell) {
          if (cell.status) { const sd = statusDef(cell.status); h += '<td align="center" valign="middle" style="' + cb + 'background:' + (sd ? sd.fill : '#eee') + ';">' + cw('<span style="font-weight:800;color:' + (sd ? sd.color : '#333') + ';">' + esc(cell.status) + '</span>') + '</td>'; }
          else h += '<td align="center" valign="middle" style="' + cb + '">' + cw('<span style="font-weight:' + wt + ';">' + esc(cell.text || '') + '</span>') + '</td>';
        });
        h += '<td align="center" valign="middle" style="' + cb + '">' + cw('<span style="font-weight:700;">' + PCD.fmtNumber(row.hours) + '</span>') + '</td>';
        if (showCost) h += '<td align="center" valign="middle" style="' + cb + '">' + cw(row.cost > 0 ? PCD.fmtMoney(row.cost) : '—') + '</td>';
        h += '</tr>';
      });
    });
    h += '</table>';
    const usedStatus = {};
    mx.groups.forEach(function (g) { g.rows.forEach(function (row) { row.cells.forEach(function (c) { if (c.status) usedStatus[c.status] = true; }); }); });
    const legendItems = ROSTER_STATUS.filter(function (s) { return usedStatus[s.id]; });
    if (legendItems.length) {
      h += '<div style="margin-top:11px;font-size:' + (fp - 1) + 'px;">' + legendItems.map(function (s) { return '<span style="display:inline-block;margin-right:14px;white-space:nowrap;"><b style="display:inline-block;min-width:26px;text-align:center;padding:1px 6px;border-radius:4px;background:' + s.fill + ';color:' + s.color + ';border:1px solid ' + s.color + ';">' + esc(s.id) + '</b> ' + esc(t(s.labelKey) || s.id) + '</span>'; }).join('') + '</div>';
    }
    const tot = rosterTotals(data);
    h += '<div style="margin-top:9px;font-size:' + (fp + 1) + 'px;font-weight:700;">' + esc(t('roster_total_hours') || 'Total hours') + ': ' + PCD.fmtNumber(tot.hours) + (showCost && tot.cost > 0 ? '  ·  ' + esc(t('roster_labour_cost') || 'Labour cost') + ': ' + PCD.fmtMoney(tot.cost) : '') + '</div>';
    return h;
  }

  // v2.40 — Roster önizleme: tabloyu SABİT doğal genişlikte (ROST_PV_W) render edip
  // kapsayıcıya scale-to-fit → mobilde hücreler sıkışmaz, gerçek oranla tam sığar.
  // Tıkla → zoom popup (geniş tablo + yatay pan; tüm günleri kaydırarak gör).
  var ROST_PV_W = 760, ROST_ZOOM_W = 920;
  function rosterPvBox(data, showCost) {
    return '<div class="rost-pvbox" style="overflow:hidden;position:relative;cursor:zoom-in;background:#fff;border-radius:6px;">' +
      '<div class="rost-pvbox-in" style="width:' + ROST_PV_W + 'px;transform-origin:top left;">' + buildRosterTable(data, showCost) + '</div>' +
      '<div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;pointer-events:none;">🔍 ' + PCD.escapeHtml(t('roster_tap_zoom') || 'Tap to zoom') + '</div>' +
    '</div>';
  }
  function fitRosterPv(box, _tries) {
    if (!box) return;
    var inner = box.querySelector('.rost-pvbox-in'); if (!inner) return;
    var w = box.clientWidth;
    // Hard refresh / kapalı details → clientWidth=0 olabilir; bounded rAF self-retry.
    if (!w) { if ((_tries || 0) < 60) requestAnimationFrame(function () { fitRosterPv(box, (_tries || 0) + 1); }); return; }
    var k = Math.min(1, w / ROST_PV_W);
    inner.style.transform = 'scale(' + k + ')';
    box.style.height = Math.ceil(inner.scrollHeight * k) + 'px';
  }
  function mountRosterPv(container, data, showCost) {
    if (!container) return;
    container.innerHTML = rosterPvBox(data, showCost);
    var box = container.querySelector('.rost-pvbox');
    if (box) { box.addEventListener('click', function () { openRosterZoom(data, showCost); }); fitRosterPv(box); }
  }
  function openRosterZoom(data, showCost) {
    var body = PCD.el('div');
    body.innerHTML = '<div style="overflow:auto;-webkit-overflow-scrolling:touch;max-height:78vh;border:1px solid var(--border);border-radius:8px;background:#fff;"><div style="width:' + ROST_ZOOM_W + 'px;padding:14px;">' + buildRosterTable(data, showCost) + '</div></div>' +
      '<div class="text-muted text-sm" style="margin-top:8px;text-align:center;">' + PCD.escapeHtml(t('roster_zoom_hint') || 'Swipe left / right to view all days') + '</div>';
    PCD.modal.open({ title: data.venue || data.name || (t('roster_title') || 'Roster'), body: body, size: 'lg', closable: true });
  }

  // v2.15.6 — Print = renkli tablo + A4 yatay. print-color-adjust:exact →
  // "Background graphics" kapalıyken bile renkler basar. table-layout fixed → tek sayfa.
  function printRoster(data, showCost) {
    if (PCD.gate && !PCD.gate.requireExport('roster')) return;
    const css = '<style>@page{size:A4 landscape;margin:0;}body{font-family:"Inter",-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;padding:10mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style>';
    PCD.print(css + buildRosterTable(data, showCost), (data.venue || t('roster_title') || 'Roster') + ' ' + data.weekStart);
  }

  // v2.15.6 — JPEG gönder/indir: tabloyu html2canvas ile görsele çevir, mobilde
  // navigator.share(files) ile native paylaş (WhatsApp vb.), masaüstünde indir.
  function sendRosterImage(data, showCost) {
    if (PCD.gate && !PCD.gate.requireExport('roster')) return;
    const run = function (h2c) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:1180px;background:#fff;padding:22px;font-family:"Inter",-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;';
      wrap.innerHTML = buildRosterTable(data, showCost) +
        ((!PCD.gate || PCD.gate.showWatermark()) ? '<div style="margin-top:10px;padding-top:6px;border-top:1px solid #e5e5e5;text-align:center;font-size:11px;color:#999;font-family:"Inter",-apple-system,Segoe UI,Roboto,sans-serif;">Made with ProChefDesk · prochefdesk.com</div>' : '');
      document.body.appendChild(wrap);
      h2c(wrap, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(function (canvas) {
        wrap.remove();
        canvas.toBlob(function (blob) {
          if (!blob) { PCD.toast.error(t('roster_img_fail') || 'Could not create image'); return; }
          const fname = (data.venue || t('roster_title') || 'Roster').replace(/\s+/g, '-').toLowerCase() + '-' + data.weekStart + '.jpg';
          let file = null;
          try { file = new File([blob], fname, { type: 'image/jpeg' }); } catch (e) { file = null; }
          if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: data.venue || data.name || 'Roster', text: (data.venue || data.name || 'Roster') + ' — ' + weekRange(data) }).catch(function () {});
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
            PCD.toast.success(t('roster_img_saved') || 'Image saved');
          }
        }, 'image/jpeg', 0.95);
      }).catch(function () { wrap.remove(); PCD.toast.error(t('roster_img_fail') || 'Could not create image'); });
    };
    if (window.html2canvas) run(window.html2canvas);
    else loadHtml2Canvas().then(run).catch(function () { PCD.toast.error(t('roster_img_fail') || 'Could not create image'); });
  }

  // v2.15.5/6 — Renkli Excel = PDF ile aynı görünüm + OTOMATİK YATAY + tek sayfaya
  // sığma (pageSetup landscape/fitToWidth). Ortak PCD.xlsx hücre rengi desteklemez →
  // roster kendi worksheet'ini xlsx-js-style ile inline kurar. Font data.fontSize'a bağlı.
  function excelRoster(data, showCost) {
    const go = function (XLSX) {
      if (!XLSX || !XLSX.utils) { PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable'); return; }
      const hex = function (h) { return (h || '').replace('#', '').toUpperCase(); };
      const esz = ({ s: 9, m: 10, l: 12 })[(data.fontSize) || 'm'] || 10;
      const ebold = !!data.bold;
      const mx = rosterMatrix(data);
      const ndays = mx.days.length;
      const ncol = 2 + ndays + 1 + (showCost ? 1 : 0);
      const lastC = ncol - 1;
      const ws = {};
      const merges = [];
      const thin = { style: 'thin', color: { rgb: 'E0DDD5' } };
      const allB = { top: thin, bottom: thin, left: thin, right: thin };
      let r = 0;
      function put(rr, cc, v, s) {
        const cell = { v: (v == null ? '' : v), t: (typeof v === 'number' ? 'n' : 's') };
        if (s) cell.s = s;
        ws[XLSX.utils.encode_cell({ r: rr, c: cc })] = cell;
      }
      function fillRow(rr, fillRgb) { for (let c = 0; c < ncol; c++) put(rr, c, '', { fill: { fgColor: { rgb: fillRgb } } }); }

      fillRow(r, '16433A');
      put(r, 0, data.venue || data.name || (t('roster_title') || 'Roster'), { font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '16433A' } }, alignment: { vertical: 'center', horizontal: 'left' } });
      merges.push({ s: { r: r, c: 0 }, e: { r: r, c: lastC } }); r++;
      put(r, 0, weekRange(data) + (data.venue && data.name ? '  ·  ' + data.name : ''), { font: { name: 'Calibri', sz: 10, color: { rgb: '666666' } }, alignment: { vertical: 'center' } });
      merges.push({ s: { r: r, c: 0 }, e: { r: r, c: lastC } }); r++;
      r++;

      const headers = [t('roster_staff') || 'Staff', t('roster_staff_role') || 'Role'].concat(mx.days);
      headers.push(t('roster_hours') || 'H'); if (showCost) headers.push(t('roster_labour_cost') || 'Cost');
      headers.forEach(function (h, c) { put(r, c, h, { font: { name: 'Calibri', sz: esz, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '16433A' } }, alignment: { vertical: 'center', horizontal: c <= 1 ? 'left' : 'center' }, border: allB }); });
      r++;

      mx.groups.forEach(function (g) {
        if (g.name) {
          fillRow(r, 'EAF6F0');
          put(r, 0, g.name, { font: { name: 'Calibri', sz: esz, bold: true, color: { rgb: '16433A' } }, fill: { fgColor: { rgb: 'EAF6F0' } }, alignment: { vertical: 'center', horizontal: 'left' }, border: allB });
          for (let c = 1; c < ncol; c++) put(r, c, '', { fill: { fgColor: { rgb: 'EAF6F0' } }, border: allB });
          merges.push({ s: { r: r, c: 0 }, e: { r: r, c: lastC } }); r++;
        }
        g.rows.forEach(function (row) {
          put(r, 0, row.staff.name || '', { font: { name: 'Calibri', sz: esz, bold: true }, alignment: { vertical: 'center', horizontal: 'left' }, border: allB });
          put(r, 1, row.staff.role || '', { font: { name: 'Calibri', sz: Math.max(8, esz - 1), color: { rgb: '555555' } }, alignment: { vertical: 'center', horizontal: 'left' }, border: allB });
          row.cells.forEach(function (cell, d) {
            let st;
            if (cell.status) { const sd = statusDef(cell.status); st = { font: { name: 'Calibri', sz: esz, bold: true, color: { rgb: sd ? hex(sd.color) : '333333' } }, fill: { fgColor: { rgb: sd ? hex(sd.fill) : 'EEEEEE' } }, alignment: { vertical: 'center', horizontal: 'center' }, border: allB }; }
            else st = { font: { name: 'Calibri', sz: esz, bold: ebold }, alignment: { vertical: 'center', horizontal: 'center' }, border: allB };
            put(r, 2 + d, cell.text || '', st);
          });
          put(r, 2 + ndays, row.hours, { font: { name: 'Calibri', sz: esz, bold: true }, alignment: { vertical: 'center', horizontal: 'right' }, border: allB });
          if (showCost) put(r, 2 + ndays + 1, row.cost > 0 ? PCD.fmtMoney(row.cost) : '—', { font: { name: 'Calibri', sz: esz }, alignment: { vertical: 'center', horizontal: 'right' }, border: allB });
          r++;
        });
      });

      const tot = rosterTotals(data);
      r++;
      put(r, 0, (t('roster_total_hours') || 'Total hours') + ': ' + PCD.fmtNumber(tot.hours) + (showCost && tot.cost > 0 ? '   ·   ' + (t('roster_labour_cost') || 'Labour cost') + ': ' + PCD.fmtMoney(tot.cost) : ''), { font: { name: 'Calibri', sz: esz + 1, bold: true } });
      merges.push({ s: { r: r, c: 0 }, e: { r: r, c: lastC } }); r++;

      const usedStatus = {};
      mx.groups.forEach(function (g) { g.rows.forEach(function (row) { row.cells.forEach(function (c) { if (c.status) usedStatus[c.status] = true; }); }); });
      const legendItems = ROSTER_STATUS.filter(function (s) { return usedStatus[s.id]; });
      if (legendItems.length) {
        r++;
        put(r, 0, t('roster_legend') || 'Key', { font: { name: 'Calibri', sz: Math.max(8, esz - 1), bold: true, color: { rgb: '888888' } } }); r++;
        legendItems.forEach(function (s) {
          put(r, 0, s.id, { font: { name: 'Calibri', sz: esz, bold: true, color: { rgb: hex(s.color) } }, fill: { fgColor: { rgb: hex(s.fill) } }, alignment: { horizontal: 'center' }, border: allB });
          put(r, 1, t(s.labelKey) || s.id, { font: { name: 'Calibri', sz: esz }, alignment: { horizontal: 'left' } });
          if (ncol > 2) merges.push({ s: { r: r, c: 1 }, e: { r: r, c: lastC } });
          r++;
        });
      }

      // v2.44.32 — Watermark footer (Free plan only; Pro = clean), same gate as print/share.
      if (!PCD.gate || PCD.gate.showWatermark()) {
        r++;
        put(r, 0, (t('cr_made_with') || 'Made with ProChefDesk · prochefdesk.com'), { font: { name: 'Calibri', sz: 8, italic: true, color: { rgb: '999999' } }, alignment: { vertical: 'center', horizontal: 'left' } });
        merges.push({ s: { r: r, c: 0 }, e: { r: r, c: lastC } }); r++;
      }
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 1), c: lastC } });
      ws['!merges'] = merges;
      // v2.15.7 — Sütunlar içeriğe sığacak kadar GENİŞ ("Mon, May 18" / "08:00-18:00"
      // = 11 karakter → 12 wch). Tek sayfaya sığma JSZip fitToWidth ile ölçekleyerek
      // sağlanır (dar sütun → metin kırpılıyordu; düzeltildi).
      ws['!cols'] = [{ wch: 18 }, { wch: 14 }].concat(mx.days.map(function () { return { wch: 12 }; })).concat([{ wch: 6 }]).concat(showCost ? [{ wch: 11 }] : []);
      ws['!margins'] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
      ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, scale: 100 };
      ws['!sheetPr'] = { pageSetUpPr: { fitToPage: true } };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roster');
      const fname = (t('roster_title') || 'Roster').replace(/\s+/g, '-').toLowerCase() + '-' + data.weekStart + '.xlsx';
      // v2.15.6 — JSZip ile yatay + tek sayfa enjekte ederek kaydet
      saveXlsxLandscape(XLSX, wb, fname);
    };
    if (window.XLSX && window.XLSX.utils) go(window.XLSX);
    else if (PCD.loadXLSX) PCD.loadXLSX().then(go).catch(function () { PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable'); });
    else PCD.toast.error(t('toast_excel_parser_unavailable') || 'Excel unavailable');
  }

  // v2.15.6 — Yazı boyutu (S/M/L) + kalınlık kontrolleri (editör + önizleme).
  function fontControlsHtml(data) {
    const cur = (data.fontSize || 'm');
    const seg = ['s', 'm', 'l'].map(function (sz) {
      const on = cur === sz;
      return '<button type="button" class="btn btn-sm" data-font="' + sz + '" style="min-width:34px;' + (on ? 'background:var(--brand-600);color:#fff;border-color:var(--brand-600);' : '') + '">' + sz.toUpperCase() + '</button>';
    }).join('');
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span style="font-size:12px;color:var(--text-3);font-weight:600;">' + PCD.escapeHtml(t('roster_font_size') || 'Text size') + '</span>'
      + '<div style="display:flex;gap:4px;">' + seg + '</div>'
      + '<label class="checkbox" style="margin-left:6px;"><input type="checkbox" id="rBold"' + (data.bold ? ' checked' : '') + '><span>' + PCD.escapeHtml(t('roster_bold') || 'Bold') + '</span></label>'
      + '</div>';
  }
  function wireFontControls(view, data) {
    PCD.on(view, 'click', '[data-font]', function () { data.fontSize = this.getAttribute('data-font'); persist(data); render(view); });
    const b = PCD.$('#rBold', view); if (b) b.addEventListener('change', function () { data.bold = this.checked; persist(data); render(view); });
  }

  // ============ PREVIEW VIEW (read-only + export) ============
  // v2.15.6 — Listede rostere tıklayınca açılır (Edit ayrı). Renkli tablo +
  // Print/PDF + Excel + JPEG gönder + yazı boyutu + maliyet göster/gizle.
  function renderPreview(view, data) {
    const esc = PCD.escapeHtml;
    let html =
      '<div class="page-header"><div class="page-header-text">' +
        '<button class="btn btn-ghost btn-sm" id="rosterBack" style="margin-bottom:6px;">' + PCD.icon('chevronLeft', 16) + ' ' + esc(t('btn_back') || 'Back') + '</button>' +
        '<div class="page-title" style="font-size:20px;">' + esc(data.venue || data.name || weekRange(data)) + '</div>' +
      '</div></div>';
    html += '<div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">' +
      fontControlsHtml(data) +
      '<label class="checkbox" style="margin-inline-start:auto;"><input type="checkbox" id="rShowCost"' + (_showCost ? ' checked' : '') + '><span>' + esc(t('roster_show_cost') || 'Show labour cost in print / share / Excel') + '</span></label>' +
      '</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      '<button class="btn btn-primary" id="pvEdit">' + PCD.icon('edit', 14) + ' ' + esc(t('edit') || 'Edit') + '</button>' +
      '<button class="btn btn-secondary" id="pvImg">' + PCD.icon('image', 14) + ' ' + esc(t('roster_send_image') || 'Send image') + '</button>' +
      '<button class="btn btn-secondary" id="pvPrint">' + PCD.icon('print', 14) + ' ' + esc(t('roster_pdf') || 'Print / PDF') + '</button>' +
      '<button class="btn btn-secondary" id="pvExcel">' + PCD.icon('download', 14) + ' ' + esc(t('roster_excel') || 'Excel') + '</button>' +
      '</div>';
    html += '<div class="card" style="padding:16px;"><div id="pvTable"></div></div>';
    view.innerHTML = html;
    // v2.40 — scale-to-fit önizleme + tıkla→zoom (mobilde tablo sıkışmaz, gerçek oran)
    mountRosterPv(PCD.$('#pvTable', view), data, _showCost);
    let _pvRsz = null; window.addEventListener('resize', function () { clearTimeout(_pvRsz); _pvRsz = setTimeout(function () { const b = view.querySelector('.rost-pvbox'); if (b) fitRosterPv(b); }, 150); });
    PCD.$('#rosterBack', view).addEventListener('click', function () { history.back(); });
    PCD.$('#pvEdit', view).addEventListener('click', function () { PCD.router.go('roster', { editId: data.id }); });
    PCD.$('#pvImg', view).addEventListener('click', function () { sendRosterImage(data, _showCost); });
    PCD.$('#pvPrint', view).addEventListener('click', function () { printRoster(data, _showCost); });
    PCD.$('#pvExcel', view).addEventListener('click', function () { excelRoster(data, _showCost); });
    PCD.$('#rShowCost', view).addEventListener('change', function () { _showCost = this.checked; render(view); });
    wireFontControls(view, data);
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.roster = { render: render };
})();
