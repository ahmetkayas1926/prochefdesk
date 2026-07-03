/* ================================================================
   ProChefDesk — haccp.js (v2.8.70)
   ----------------------------------------------------------------
   HACCP HUB — single landing page that consolidates the four HACCP
   form tools (Daily Temperature, Cook & Cool, Receiving, Hot/Cold
   Holding). Previously each form had its own sidenav entry, forcing
   the chef to bounce between four pages during an audit prep or a
   morning routine.

   This hub:
   - Shows today's HACCP status at a glance (how many entries today
     per form, which haven't been touched).
   - Provides four large cards that route into the existing forms.
   - The four form tools themselves are untouched — the hub just
     wraps them with cleaner navigation.

   Real-world use: chef opens the app, taps HACCP → sees "Daily Temp:
   logged ✓, Cook & Cool: not started, Receiving: 2 deliveries, Hot
   Holding: 1 check" → knows exactly what's still owed.

   v2.9.13 — NAKED→RICH upgrade: closeable inline guide explaining HACCP
   workflow + audit prep, status card upgrade to hero with done/total chip.
   Pattern: buffet v2.8.77. ROUND 5 — NAKED sweep tamamlanma sürümü.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // -------- Local helpers --------
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function currentMonthYM() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // i18n with safe fallback (stale-cache proof: a missing key returns the key
  // itself, which is truthy — so `t(k) || fb` leaks the raw key. L() guards.)
  function L(key, fb) {
    const v = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t(key) : null;
    return (v == null || v === key) ? (fb != null ? fb : key) : v;
  }

  // ================================================================
  //  AUDIT PACK — one combined, auditor-ready report aggregating all
  //  four HACCP forms for a given month. Reuses each form's stored
  //  records (read-only) + the same region thresholds the forms use,
  //  so pass/fail never diverges from what the chef sees in the grid.
  // ================================================================
  function tUnit() {
    const p = PCD.store && PCD.store.get && PCD.store.get('prefs.haccpTempUnit');
    return p === 'F' ? 'F' : 'C';
  }
  function ctoF(c) { return Math.round((c * 9 / 5 + 32) * 10) / 10; }
  function showTemp(c) {
    if (c === null || c === undefined || c === '') return '—';
    const u = tUnit();
    return (u === 'F' ? ctoF(Number(c)) : Number(c)) + '°' + u;
  }
  function showLimit(c) {
    const u = tUnit();
    return (u === 'F' ? ctoF(Number(c)) : Number(c)) + '°' + u;
  }
  function padDay(n) { return String(n).padStart(2, '0'); }
  function inMonth(d, ym) { return typeof d === 'string' && d.slice(0, 7) === ym; }

  // Aggregate every temperature check across the four forms for one month.
  // Returns per-form rollups, an exception log (out-of-range events) and
  // totals incl. open corrective actions (a fail with no note = OPEN CAPA).
  function collectAuditData(ym) {
    const th = (PCD.haccp && PCD.haccp.getThresholds) ? PCD.haccp.getThresholds()
      : { hotMinC: 63, coldMaxC: 5, frozenMaxC: -18, cooling2hC: 21, cooling6hC: 5 };
    const exceptions = [];
    const byForm = {
      logs:      { key: 'logs',      label: L('haccp_audit_form_logs', 'Daily Temperature'),  checks: 0, fails: 0 },
      cooling:   { key: 'cooling',   label: L('haccp_audit_form_cooling', 'Cook & Cool'),       checks: 0, fails: 0 },
      receiving: { key: 'receiving', label: L('haccp_audit_form_receiving', 'Receiving'),       checks: 0, fails: 0 },
      holding:   { key: 'holding',   label: L('haccp_audit_form_holding', 'Hot/Cold Holding'),  checks: 0, fails: 0 },
    };

    function pushCheck(form, fail, ex) {
      form.checks++;
      if (fail) {
        form.fails++;
        const open = !(ex.corrective && String(ex.corrective).trim());
        exceptions.push({
          date: ex.date || '', area: form.label, item: ex.item || '—',
          reading: ex.reading, limit: ex.limit,
          corrective: (ex.corrective && String(ex.corrective).trim()) || '',
          chef: ex.chef || '', open: open,
        });
      }
    }

    // --- 1. Daily temperature log (per-unit min/max) ---
    try {
      const units = PCD.store.listTable('haccpUnits') || [];
      const unitById = {};
      units.forEach(function (u) { if (u && u.id) unitById[u.id] = u; });
      (PCD.store.listTable('haccpReadings') || []).forEach(function (r) {
        if (!r || r._deletedAt || !inMonth(r.date, ym)) return;
        const u = unitById[r.unitId];
        if (!u) return;
        ['morning', 'evening'].forEach(function (shift) {
          const s = r[shift];
          if (!s || s.value == null || s.value === '') return;
          const v = Number(s.value);
          const fail = (typeof u.min === 'number' && v < u.min) || (typeof u.max === 'number' && v > u.max);
          pushCheck(byForm.logs, fail, {
            date: r.date, item: u.name, reading: showTemp(v),
            limit: showLimit(u.min) + '–' + showLimit(u.max),
            corrective: s.note, chef: s.chef,
          });
        });
      });
    } catch (e) { /* defensive */ }

    // --- 2. Cook & Cool (2-stage: ≤cooling2h in 2h, ≤cooling6h in 6h) ---
    try {
      (PCD.store.listTable('haccpCookCool') || []).forEach(function (r) {
        if (!r || r._deletedAt) return;
        const rym = r.monthYM || (r.date ? r.date.slice(0, 7) : '');
        if (rym !== ym) return;
        const dateStr = r.date || (r.day ? ym + '-' + padDay(r.day) : ym);
        if (r.cp2hTemp != null) {
          pushCheck(byForm.cooling, r.cp2hTemp > th.cooling2hC, {
            date: dateStr, item: r.foodName, reading: showTemp(r.cp2hTemp),
            limit: '≤' + showLimit(th.cooling2hC) + ' / 2h', corrective: r.note, chef: r.chef,
          });
        }
        if (r.endedTemp != null) {
          pushCheck(byForm.cooling, r.endedTemp > th.cooling6hC, {
            date: dateStr, item: r.foodName, reading: showTemp(r.endedTemp),
            limit: '≤' + showLimit(th.cooling6hC) + ' / 6h', corrective: r.note, chef: r.chef,
          });
        }
      });
    } catch (e) { /* defensive */ }

    // --- 3. Receiving (condition pass/fail flag) ---
    try {
      (PCD.store.listTable('haccpReceiving') || []).forEach(function (r) {
        if (!r || r._deletedAt || !inMonth(r.date, ym)) return;
        const filled = r.supplier || r.productName || r.conditionOK != null || r.deliveryTemp != null;
        if (!filled) return;
        pushCheck(byForm.receiving, r.conditionOK === false, {
          date: r.date, item: r.productName || r.supplier,
          reading: r.deliveryTemp != null ? showTemp(r.deliveryTemp) : '—',
          limit: L('haccp_audit_cond_ok', 'Condition OK'), corrective: r.note, chef: r.chef,
        });
      });
    } catch (e) { /* defensive */ }

    // --- 4. Hot / Cold holding (3 checks, hot≥hotMin / cold≤coldMax) ---
    try {
      (PCD.store.listTable('haccpHolding') || []).forEach(function (r) {
        if (!r || r._deletedAt || !inMonth(r.date, ym)) return;
        ['check1Temp', 'check2Temp', 'check3Temp'].forEach(function (k) {
          const v = r[k];
          if (v == null || v === '') return;
          const cold = r.holdType === 'cold';
          const pass = cold ? Number(v) <= th.coldMaxC : Number(v) >= th.hotMinC;
          pushCheck(byForm.holding, !pass, {
            date: r.date, item: r.foodName, reading: showTemp(v),
            limit: (cold ? '≤' + showLimit(th.coldMaxC) : '≥' + showLimit(th.hotMinC)),
            corrective: r.correctiveAction, chef: r.chef,
          });
        });
      });
    } catch (e) { /* defensive */ }

    let checks = 0, fails = 0, openCapa = 0;
    Object.keys(byForm).forEach(function (k) { checks += byForm[k].checks; fails += byForm[k].fails; });
    exceptions.forEach(function (x) { if (x.open) openCapa++; });
    exceptions.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    // "In range" = pass rate of the readings that WERE recorded. NOT compliance:
    // auditors weigh record completeness (gaps) above pass rate, so this is
    // reported alongside coverage, never as a standalone "compliance" figure.
    const inRangePct = checks > 0 ? Math.round(((checks - fails) / checks) * 1000) / 10 : null;

    // Daily-log coverage (completeness) — the metric auditors weigh most. Only
    // the daily temperature log is a per-day obligation; receiving / cook-cool /
    // holding are activity-based (logged only when there's a delivery, cook or
    // hold), so a blank one is "no activity", not a gap.
    const parts2 = ym.split('-');
    const yy = Number(parts2[0]), mm = Number(parts2[1]);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === yy && (now.getMonth() + 1) === mm);
    const isFuture = (yy > now.getFullYear()) || (yy === now.getFullYear() && mm > (now.getMonth() + 1));
    const daysElapsed = isFuture ? 0 : (isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth);
    const hasUnits = (PCD.store.listTable('haccpUnits') || []).length > 0;
    const loggedDays = {};
    (PCD.store.listTable('haccpReadings') || []).forEach(function (r) {
      if (!r || r._deletedAt || !inMonth(r.date, ym)) return;
      const has = ['morning', 'evening'].some(function (s) { return r[s] && r[s].value != null && r[s].value !== ''; });
      if (has) loggedDays[r.date] = true;
    });
    const daysCovered = Object.keys(loggedDays).length;
    const coveragePct = (hasUnits && daysElapsed > 0) ? Math.round((daysCovered / daysElapsed) * 100) : null;

    return {
      ym: ym, byForm: byForm, exceptions: exceptions,
      totals: { checks: checks, fails: fails, openCapa: openCapa, inRangePct: inRangePct },
      coverage: { hasUnits: hasUnits, daysCovered: daysCovered, daysElapsed: daysElapsed, daysInMonth: daysInMonth, pct: coveragePct },
    };
  }

  function complianceColor(pct) {
    return pct >= 95 ? '#1f9d6b' : (pct >= 80 ? '#b45309' : '#dc2626');
  }

  function monthLabelLong(ym) {
    try {
      const parts = ym.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      const loc = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
      return d.toLocaleDateString(loc, { year: 'numeric', month: 'long' });
    } catch (e) { return ym; }
  }

  // Build the Deep Pine A4 audit report HTML (PCD.print injects the gated
  // watermark footer automatically). esc = escape helper.
  function buildAuditPackHtml(ym, opts) {
    opts = opts || {};
    const data = collectAuditData(ym);
    const esc = PCD.escapeHtml;
    const user = (PCD.store.get && PCD.store.get('user')) || {};
    const business = user.workplace || user.company || user.name || '';
    const regions = (window.PCD_CONFIG && window.PCD_CONFIG.HACCP_REGIONS) || {};
    const regionId = (PCD.haccp && PCD.haccp.getRegion) ? PCD.haccp.getRegion() : 'international';
    const regionLabel = L((regions[regionId] && regions[regionId].labelKey) || 'haccp_region_international', regionId);
    const genDate = new Date().toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { year: 'numeric', month: 'short', day: 'numeric' });
    const inRange = data.totals.inRangePct;
    const c = (inRange == null) ? '#a8a29e' : complianceColor(inRange);
    const cov = data.coverage;
    const covColor = (cov.pct == null) ? '#a8a29e' : (cov.pct >= 90 ? '#1f9d6b' : (cov.pct >= 50 ? '#b45309' : '#dc2626'));

    const PINE = '#16433a', ACC = '#1f9d6b', INK = '#1c1917', BD = '#e7e5e4', THBG = '#eaf6f0';

    // Completeness banner — auditors weigh record gaps above pass rate.
    let coverageBanner = '';
    if (cov.hasUnits && cov.pct != null) {
      if (cov.pct >= 90) {
        coverageBanner = '<div style="padding:10px 14px;border-radius:8px;background:#f0fdf4;color:#166534;font-weight:600;font-size:12px;margin-bottom:16px;">✓ ' +
          PCD.escapeHtml(L('haccp_audit_coverage_full', 'Daily temperature log complete — {d} of {n} days recorded.').replace('{d}', cov.daysCovered).replace('{n}', cov.daysElapsed)) + '</div>';
      } else {
        coverageBanner = '<div style="padding:10px 14px;border-radius:8px;background:#fff7ed;color:#b45309;font-weight:700;font-size:12px;margin-bottom:16px;border:1px solid #fbbf24;">⚠ ' +
          PCD.escapeHtml(L('haccp_audit_coverage_gap', 'Daily log has gaps: {d} of {n} days recorded. Missing records are the biggest audit risk — fill them before the audit.').replace('{d}', cov.daysCovered).replace('{n}', cov.daysElapsed)) + '</div>';
      }
    }

    function stat(label, value, color) {
      return '<div style="flex:1;min-width:120px;border:1px solid ' + BD + ';border-radius:10px;padding:12px 14px;background:#fff;">' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#78716c;font-weight:700;margin-bottom:4px;">' + esc(label) + '</div>' +
        '<div style="font-size:26px;font-weight:800;color:' + (color || INK) + ';line-height:1;font-family:Fraunces,Georgia,serif;">' + value + '</div>' +
      '</div>';
    }

    // Per-form summary rows. Forms with no records show a neutral "no activity"
    // line — receiving/cook-cool/holding are activity-based, so blank ≠ a gap.
    let formRows = '';
    ['logs', 'cooling', 'receiving', 'holding'].forEach(function (k) {
      const f = data.byForm[k];
      if (f.checks === 0) {
        formRows += '<tr>' +
          '<td style="padding:7px 10px;border:1px solid ' + BD + ';font-weight:600;color:' + INK + ';">' + esc(f.label) + '</td>' +
          '<td colspan="4" style="padding:7px 10px;border:1px solid ' + BD + ';text-align:center;color:#a8a29e;font-style:italic;">' + esc(L('haccp_audit_no_activity', 'No activity logged')) + '</td>' +
        '</tr>';
        return;
      }
      const pass = f.checks - f.fails;
      const pct = Math.round(((f.checks - f.fails) / f.checks) * 1000) / 10;
      formRows += '<tr>' +
        '<td style="padding:7px 10px;border:1px solid ' + BD + ';font-weight:600;color:' + INK + ';">' + esc(f.label) + '</td>' +
        '<td style="padding:7px 10px;border:1px solid ' + BD + ';text-align:center;">' + f.checks + '</td>' +
        '<td style="padding:7px 10px;border:1px solid ' + BD + ';text-align:center;color:#166534;">' + pass + '</td>' +
        '<td style="padding:7px 10px;border:1px solid ' + BD + ';text-align:center;color:' + (f.fails ? '#991b1b' : '#78716c') + ';font-weight:' + (f.fails ? '700' : '400') + ';">' + (f.fails || '—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid ' + BD + ';text-align:center;font-weight:700;color:' + complianceColor(pct) + ';">' + pct + '%</td>' +
      '</tr>';
    });

    // Exception log
    let exHtml;
    if (data.exceptions.length === 0) {
      exHtml = '<div style="padding:18px;border:1px solid ' + BD + ';border-radius:10px;background:#f0fdf4;color:#166534;font-weight:600;text-align:center;">✓ ' +
        esc(L('haccp_audit_no_exceptions', 'No out-of-range readings among the recorded checks.')) + '</div>';
    } else {
      let rows = '';
      data.exceptions.forEach(function (x) {
        const statusChip = x.open
          ? '<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:700;font-size:10px;">' + esc(L('haccp_audit_status_open', 'OPEN')) + '</span>'
          : '<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:10px;">' + esc(L('haccp_audit_status_closed', 'Documented')) + '</span>';
        rows += '<tr>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';white-space:nowrap;">' + esc(x.date) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';">' + esc(x.area) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';font-weight:600;">' + esc(x.item) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';text-align:center;color:#991b1b;font-weight:700;">⚠ ' + esc(x.reading) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';text-align:center;color:#78716c;">' + esc(x.limit) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';">' + (x.corrective ? esc(x.corrective) : '<span style="color:#dc2626;font-style:italic;">' + esc(L('haccp_audit_no_action', 'No action recorded')) + '</span>') + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';text-align:center;">' + statusChip + '</td>' +
          '<td style="padding:6px 8px;border:1px solid ' + BD + ';text-align:center;color:#78716c;">' + esc(x.chef || '—') + '</td>' +
        '</tr>';
      });
      exHtml = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
        '<thead><tr style="background:' + THBG + ';">' +
          ['haccp_audit_col_date|Date', 'haccp_audit_col_area|Area', 'haccp_audit_col_item|Item', 'haccp_audit_col_reading|Reading', 'haccp_audit_col_limit|Limit', 'haccp_audit_col_action|Corrective action', 'haccp_audit_col_status|Status', 'haccp_audit_col_by|By'].map(function (p) {
            const kv = p.split('|');
            return '<th style="padding:7px 8px;border:1px solid ' + BD + ';text-align:start;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:' + PINE + ';">' + esc(L(kv[0], kv[1])) + '</th>';
          }).join('') +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div style="margin-top:8px;font-size:10.5px;color:#78716c;font-style:italic;">' + esc(L('haccp_audit_open_note', 'Open = an out-of-range event with no corrective action recorded. Close these before the audit.')) + '</div>';
    }

    return '' +
      '<div style="font-family:Inter,system-ui,sans-serif;color:' + INK + ';max-width:760px;margin:0 auto;">' +
        '<div style="border-bottom:3px solid ' + PINE + ';padding-bottom:12px;margin-bottom:16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">' +
            '<div>' +
              '<div style="font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:800;color:' + PINE + ';line-height:1.05;">' + esc(L('haccp_audit_report_title', 'HACCP Audit Pack')) + '</div>' +
              (business ? '<div style="font-size:14px;font-weight:600;color:' + INK + ';margin-top:3px;">' + esc(business) + '</div>' : '') +
            '</div>' +
            '<div style="text-align:end;font-size:11px;color:#57534e;line-height:1.6;">' +
              '<div><strong style="color:' + PINE + ';">' + esc(L('haccp_audit_period', 'Period')) + ':</strong> ' + esc(monthLabelLong(ym)) + '</div>' +
              '<div><strong style="color:' + PINE + ';">' + esc(L('haccp_audit_region_label', 'Region standard')) + ':</strong> ' + esc(regionLabel) + '</div>' +
              '<div><strong style="color:' + PINE + ';">' + esc(L('haccp_audit_generated', 'Generated')) + ':</strong> ' + esc(genDate) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">' +
          stat(L('haccp_audit_stat_checks', 'Temperature checks'), data.totals.checks, PINE) +
          (cov.hasUnits ? stat(L('haccp_audit_stat_coverage', 'Daily-log coverage'), cov.daysCovered + ' / ' + cov.daysElapsed, covColor) : '') +
          stat(L('haccp_audit_stat_inrange', 'Readings in range'), (inRange == null ? '—' : inRange + '%'), c) +
          stat(L('haccp_audit_stat_fails', 'Out-of-range'), data.totals.fails || '0', data.totals.fails ? '#dc2626' : INK) +
          stat(L('haccp_audit_stat_open', 'Open corrective actions'), data.totals.openCapa || '0', data.totals.openCapa ? '#dc2626' : ACC) +
        '</div>' +

        coverageBanner +

        '<div style="font-family:Fraunces,Georgia,serif;font-size:16px;font-weight:700;color:' + PINE + ';margin:0 0 8px;">' + esc(L('haccp_audit_by_form', 'Records by form')) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;">' +
          '<thead><tr style="background:' + THBG + ';">' +
            ['haccp_audit_form_col|Form', 'haccp_audit_checks_col|Checks', 'haccp_audit_pass_col|Pass', 'haccp_audit_fail_col|Out-of-range', 'haccp_audit_inrange_col|In range'].map(function (p, i) {
              const kv = p.split('|');
              return '<th style="padding:8px 10px;border:1px solid ' + BD + ';text-align:' + (i === 0 ? 'start' : 'center') + ';font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:' + PINE + ';">' + esc(L(kv[0], kv[1])) + '</th>';
            }).join('') +
          '</tr></thead><tbody>' + formRows + '</tbody></table>' +
        '<div style="margin:0 0 22px;font-size:10.5px;color:#78716c;font-style:italic;">' + esc(L('haccp_audit_event_note', 'Receiving, Cook & Cool and Holding are activity-based — logged only when there is a delivery, cook or hold. A blank form means no logged activity, not non-compliance.')) + '</div>' +

        '<div style="font-family:Fraunces,Georgia,serif;font-size:16px;font-weight:700;color:' + PINE + ';margin:0 0 8px;">' + esc(L('haccp_audit_exceptions_title', 'Corrective-action log (out-of-range events)')) + '</div>' +
        exHtml +

        '<div style="margin-top:34px;display:flex;gap:40px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:220px;">' +
            '<div style="border-bottom:1px solid ' + INK + ';height:30px;"></div>' +
            '<div style="font-size:11px;color:#57534e;margin-top:4px;">' + esc(L('haccp_audit_signoff', 'Reviewed & verified by')) + ' &nbsp;·&nbsp; ' + esc(L('haccp_audit_signature', 'Signature')) + '</div>' +
          '</div>' +
          '<div style="width:160px;">' +
            '<div style="border-bottom:1px solid ' + INK + ';height:30px;"></div>' +
            '<div style="font-size:11px;color:#57534e;margin-top:4px;">' + esc(L('haccp_audit_date_label', 'Date')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Print one month, or a whole month range into ONE PDF (each month its own
  // page-set). Empty months are skipped so a quarter export stays tight.
  function printAuditPack(from, to) {
    to = to || from;
    const months = (PCD.haccp && PCD.haccp.monthsInRange) ? PCD.haccp.monthsInRange(from, to) : [from];
    const sheets = months.map(function (m) {
      const d = collectAuditData(m);
      if (d.totals.checks === 0 && d.coverage.daysCovered === 0) return null;  // skip empty month
      return buildAuditPackHtml(m);
    }).filter(Boolean);
    const title = L('haccp_audit_report_title', 'HACCP Audit Pack');
    if (!sheets.length) {
      PCD.toast.error(L('haccp_audit_empty', 'No HACCP records found for this month. Log entries in the four forms first.'));
      return;
    }
    if (sheets.length === 1) {
      PCD.print(sheets[0], title + ' — ' + months[0]);
      return;
    }
    PCD.haccp.printSheets(sheets, title + ' · ' + from + ' – ' + to, 'portrait');
  }

  // Live one-line summary for the hub Audit Pack card (recomputed on month
  // change). Empty month → friendly "no records yet" line.
  function auditSummaryInner(d) {
    if (!d || d.totals.checks === 0) {
      return '<span style="color:var(--text-3);">' + PCD.escapeHtml(L('haccp_audit_none_yet', 'No records logged for this month yet.')) + '</span>';
    }
    const inRange = d.totals.inRangePct;
    const col = (inRange == null) ? 'var(--text-3)' : complianceColor(inRange);
    const cov = d.coverage;
    const covCol = (cov.pct == null) ? 'var(--text-3)' : (cov.pct >= 90 ? '#15803d' : (cov.pct >= 50 ? '#b45309' : '#dc2626'));
    return '<strong>' + PCD.escapeHtml(L('haccp_audit_summary_label', 'Selected month')) + ':</strong> ' +
      d.totals.checks + ' ' + PCD.escapeHtml(L('haccp_audit_sum_checks', 'checks')) +
      (cov.hasUnits && cov.pct != null ? ' · <span style="color:' + covCol + ';font-weight:700;">' + PCD.escapeHtml(L('haccp_audit_sum_coverage', '{d}/{n} days logged').replace('{d}', cov.daysCovered).replace('{n}', cov.daysElapsed)) + '</span>' : '') +
      ' · <span style="color:' + col + ';font-weight:700;">' + (inRange == null ? '—' : inRange + '%') + ' ' + PCD.escapeHtml(L('haccp_audit_sum_inrange', 'in range')) + '</span>' +
      (d.totals.openCapa ? ' · <span style="color:#dc2626;font-weight:700;">' + d.totals.openCapa + ' ' + PCD.escapeHtml(L('haccp_audit_sum_open', 'open actions')) + '</span>' : '');
  }

  // Count today's records across the various HACCP tables.
  // Each form stores under a different state key — we touch each
  // gently and return a count. Errors silently → 0 (defensive).
  function countTodayEntries(stateKey, dateField) {
    try {
      const wsId = PCD.store.getActiveWorkspaceId();
      const all = PCD.store._read(stateKey) || {};
      // v2.44.122 — BUG FIX: haccp tabloları MAP şeklinde ({wsId:{recordId:obj}}).
      // Eski kod all[wsId]'yi dizi sanıp .filter çağırıyordu → TypeError → catch → hep 0
      // ("Today's status" hiç güncellenmiyordu). Map ise Object.values ile diziye çevir.
      const raw = Array.isArray(all) ? all : (all[wsId] || {});
      const arr = Array.isArray(raw) ? raw : Object.values(raw || {});
      const today = todayStr();
      const month = currentMonthYM();
      return arr.filter(function (r) {
        if (!r || r._deletedAt) return false;
        const f = r[dateField] || r.date || r.recordedAt || r.monthYM || '';
        // Daily date match
        if (typeof f === 'string') {
          if (f.indexOf(today) === 0) return true;
          // Cook & Cool stores monthYM + day separately (v2.8.47)
          if (f === month && r.day) {
            const d = new Date();
            return Number(r.day) === d.getDate();
          }
        }
        return false;
      }).length;
    } catch (e) {
      return 0;
    }
  }

  // -------- Card data --------
  function getCards() {
    const t = PCD.i18n.t;
    return [
      {
        route: 'haccp_logs',
        icon: 'thermometer',
        title: t('haccp_hub_card_logs_title') || 'Daily Temperature Log',
        desc: t('haccp_hub_card_logs_desc') || 'Fridge & freezer readings — twice daily',
        accent: '#ef4444',
        // Daily readings live in haccpReadings (per unit/date); haccpLogs only
        // holds log definitions. Top-level reading.date drives the today match.
        todayCount: countTodayEntries('haccpReadings', 'recordedAt'),
      },
      {
        route: 'haccp_cooling',
        icon: 'clock',
        title: t('haccp_hub_card_cooling_title') || 'Cook & Cool Log',
        desc: t('haccp_hub_card_cooling_desc') || 'Cooked food cooling — 2-stage verification',
        accent: '#3b82f6',
        // Cook & Cool records are stored under haccpCookCool (not haccpCooling).
        todayCount: countTodayEntries('haccpCookCool', 'monthYM'),
      },
      {
        route: 'haccp_receiving',
        icon: 'archive',
        title: t('haccp_hub_card_receiving_title') || 'Receiving Inspection',
        desc: t('haccp_hub_card_receiving_desc') || 'Delivery temperatures, supplier, packaging',
        accent: '#f59e0b',
        todayCount: countTodayEntries('haccpReceiving', 'recordedAt'),
      },
      {
        route: 'haccp_holding',
        icon: 'activity',
        title: t('haccp_hub_card_holding_title') || 'Hot / Cold Holding',
        desc: t('haccp_hub_card_holding_desc') || 'Bain-marie hot holding · cold display',
        accent: '#8b5cf6',
        todayCount: countTodayEntries('haccpHolding', 'recordedAt'),
      },
    ];
  }

  // -------- RENDER --------
  function render(view) {
    const t = PCD.i18n.t;

    // v2.17 — HACCP Pro özelliğidir. Free'de kilitli önizleme (gizleme değil:
    // kullanıcı ne olduğunu görsün, istesin — spec 2.3).
    if (PCD.gate && !PCD.gate.canUseHaccp()) {
      view.innerHTML =
        '<div class="page-header"><div class="page-title">' + PCD.escapeHtml(t('haccp_hub_title') || 'HACCP Forms') + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('haccp_hub_subtitle') || '') + '</div></div>' +
        '<div class="card" style="max-width:520px;margin:24px auto;text-align:center;"><div class="card-body" style="padding:28px;">' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:var(--brand-50,#f0fdf4);color:var(--brand-600,#16a34a);margin-bottom:14px;">' + PCD.icon('lock', 30) + '</div>' +
          '<div style="font-weight:800;font-size:18px;margin-bottom:6px;">' + PCD.escapeHtml(t('haccp_locked_title')) + '</div>' +
          '<div class="text-muted" style="font-size:13px;line-height:1.6;margin-bottom:18px;max-width:380px;margin-inline:auto;">' + PCD.escapeHtml(t('haccp_locked_desc')) + '</div>' +
          '<button class="btn btn-primary" id="haccpUpgradeBtn">' + PCD.icon('star', 16) + ' ' + PCD.escapeHtml(t('upgrade_to_pro')) + '</button>' +
        '</div></div>';
      const ub = PCD.$('#haccpUpgradeBtn', view);
      if (ub) ub.addEventListener('click', function () { if (PCD.gate.showUpgradeModal) PCD.gate.showUpgradeModal({ feature: 'haccp' }); });
      return;
    }

    const cards = getCards();
    const auditYm = currentMonthYM();
    const auditData = collectAuditData(auditYm);
    const totalToday = cards.reduce(function (a, c) { return a + c.todayCount; }, 0);
    const touchedCount = cards.filter(function (c) { return c.todayCount > 0; }).length;
    const allTouched = touchedCount === cards.length;
    const heroColor = allTouched ? '#16a34a' : (touchedCount >= 2 ? '#f59e0b' : '#dc2626');

    // v2.9.38 — Read via PCD.haccp.getRegion() helper (handles LS fallback
    // if cloud sync wiped state.prefs.haccpRegion on boot).
    const regions = (window.PCD_CONFIG && window.PCD_CONFIG.HACCP_REGIONS) || {};
    const regionId = (PCD.haccp && PCD.haccp.getRegion) ? PCD.haccp.getRegion() : ((window.PCD_CONFIG && window.PCD_CONFIG.HACCP_REGION_DEFAULT) || 'international');
    const regionData = regions[regionId] || regions.international || {};
    const regionChip = '🔥 ≥' + (regionData.hotMinC || 60) + '°C  ·  ❄ ≤' + (regionData.coldMaxC || 5) + '°C  ·  🧊 ≤' + (regionData.frozenMaxC || -18) + '°C  ·  ⏱ ' + (regionData.coolingStartC || 60) + '°→' + (regionData.cooling2hC || 21) + '°/2h→' + (regionData.cooling6hC || 5) + '°/6h';

    // v2.9.13 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_haccp_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    let cardsHtml = '';
    cards.forEach(function (c) {
      const statusChip = c.todayCount > 0
        ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#166534;font-weight:700;font-size:11px;padding:3px 8px;border-radius:999px;">✓ ' + c.todayCount + ' ' + (c.todayCount === 1 ? (t('haccp_hub_entry') || 'entry') : (t('haccp_hub_entries') || 'entries')) + '</span>'
        : '<span style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#92400e;font-weight:700;font-size:11px;padding:3px 8px;border-radius:999px;">○ ' + (t('haccp_hub_no_entries_today') || 'No entries today') + '</span>';

      cardsHtml +=
        '<button type="button" class="card card-hover" data-haccp-route="' + c.route + '" style="display:flex;align-items:center;gap:14px;padding:18px;text-align:start;border:1px solid var(--border);background:var(--surface);cursor:pointer;width:100%;">' +
          '<div style="width:48px;height:48px;border-radius:12px;background:' + c.accent + '15;color:' + c.accent + ';display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            PCD.icon(c.icon, 24) +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">' +
              '<div style="font-weight:700;font-size:16px;color:var(--text-1);">' + PCD.escapeHtml(c.title) + '</div>' +
              statusChip +
            '</div>' +
            '<div style="font-size:13px;color:var(--text-3);">' + PCD.escapeHtml(c.desc) + '</div>' +
          '</div>' +
          '<div style="color:var(--text-3);flex-shrink:0;">' + PCD.icon('chevronRight', 18) + '</div>' +
        '</button>';
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('haccp_hub_title') || 'HACCP Forms'}</div>
          <div class="page-subtitle">${t('haccp_hub_subtitle') || 'Food safety record-keeping in one place'}</div>
        </div>
      </div>

      ${!guideHidden ? `
        <div class="card" style="padding:10px 14px;margin-bottom:12px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">💡</span>
          <div style="flex:1;font-size:13px;color:var(--text-2);line-height:1.5;">${PCD.escapeHtml(t('haccp_hub_guide_short') || 'Daily HACCP record-keeping. Log entries in real time, print monthly A4 PDFs for the audit binder. Region thresholds below apply to all four forms.')}</div>
          <button type="button" id="haccpGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('haccp_hub_guide_dismiss') || 'Hide')}">✕</button>
        </div>
      ` : ''}

      <div class="stat mb-3" style="background:linear-gradient(135deg,${heroColor}18,var(--surface));border-color:${heroColor};padding:18px;">
        <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
          <div style="flex-shrink:0;">
            <div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('haccp_hub_today_status') || 'Today’s status')}</div>
            <div style="font-size:42px;font-weight:900;color:${heroColor};line-height:1;letter-spacing:-0.02em;">${touchedCount}<span style="font-size:18px;color:var(--text-3);font-weight:600;"> / ${cards.length}</span></div>
          </div>
          <div style="flex:1;min-width:180px;">
            <span style="display:inline-block;padding:4px 10px;background:${heroColor}25;color:${heroColor};font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">${allTouched ? (PCD.escapeHtml(t('haccp_hub_all_logged_today') || 'All forms logged today')) : (PCD.escapeHtml(t('haccp_hub_pending_today') || 'Some forms not yet logged today'))}</span>
            <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">${totalToday} ${PCD.escapeHtml(t('haccp_hub_total_today_label') || 'total entries today')}</div>
          </div>
        </div>
      </div>

      <div class="card mb-3" style="padding:14px 18px;border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <div style="font-weight:700;font-size:14px;color:var(--text-1);margin-bottom:4px;">${PCD.escapeHtml(t('haccp_region') || 'HACCP region')}</div>
            <div class="text-muted" style="font-size:12px;line-height:1.45;">${PCD.escapeHtml(t('haccp_region_desc') || 'Sets food safety thresholds (hot/cold/cooling) on HACCP forms per your jurisdiction.')}</div>
          </div>
          <select class="select" id="haccpRegionSelect" style="min-width:240px;min-height:38px;padding:6px 28px 6px 12px;font-size:13px;">
            ${Object.keys(regions).map(function (key) {
              const reg = regions[key];
              return '<option value="' + key + '"' + (regionId === key ? ' selected' : '') + '>' + PCD.escapeHtml(t(reg.labelKey)) + '</option>';
            }).join('')}
          </select>
        </div>
        <div style="margin-top:10px;padding:8px 12px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.01em;">
          ${regionChip}
        </div>
      </div>

      <div id="haccpCards" class="flex flex-col gap-2"></div>

      <div class="card mb-3" style="padding:16px 18px;margin-top:16px;border:1px solid var(--brand-300);background:linear-gradient(135deg,var(--brand-50),var(--surface));">
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div style="font-size:22px;line-height:1;">📋</div>
          <div style="flex:1;min-width:220px;">
            <div style="font-weight:800;font-size:15px;color:var(--text-1);margin-bottom:3px;">${L('haccp_audit_card_title', 'Audit-ready report')}</div>
            <div style="font-size:12.5px;color:var(--text-2);line-height:1.5;">${L('haccp_audit_card_desc', 'Combine all four forms into one auditor-ready PDF for any month — summary, compliance %, and a corrective-action log.')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <label for="haccpAuditFrom" style="font-size:12px;font-weight:600;color:var(--text-2);">${L('haccp_range_from', 'From')}</label>
          <input type="month" id="haccpAuditFrom" value="${auditYm}" max="${auditYm}" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;">
          <label for="haccpAuditTo" style="font-size:12px;font-weight:600;color:var(--text-2);">${L('haccp_range_to', 'To')}</label>
          <input type="month" id="haccpAuditTo" value="${auditYm}" max="${auditYm}" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:13px;">
          <button type="button" class="btn btn-primary" id="haccpAuditBtn" style="font-size:13px;">${PCD.icon('print', 15)} ${L('haccp_audit_btn', 'Generate audit report')}</button>
        </div>
        <div id="haccpAuditSummary" style="margin-top:10px;font-size:12px;color:var(--text-2);">${auditSummaryInner(auditData)}</div>
      </div>
    `;

    const cardsEl = PCD.$('#haccpCards', view);
    if (cardsEl) cardsEl.innerHTML = cardsHtml;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#haccpGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_haccp_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    PCD.on(view, 'click', '[data-haccp-route]', function () {
      const r = this.getAttribute('data-haccp-route');
      if (r && PCD.router && PCD.router.go) PCD.router.go(r);
    });

    // Audit Pack — generate report for a month or a whole range into one PDF.
    const auditFromEl = PCD.$('#haccpAuditFrom', view);
    const auditToEl = PCD.$('#haccpAuditTo', view);
    const auditBtn = PCD.$('#haccpAuditBtn', view);
    if (auditBtn) {
      auditBtn.addEventListener('click', function () {
        const from = (auditFromEl && auditFromEl.value) || currentMonthYM();
        const to = (auditToEl && auditToEl.value) || from;
        printAuditPack(from, to);
      });
    }
    // Live summary tracks the "from" month (the range's first); recomputed on
    // either input change so the chef sees coverage before printing.
    function _refreshAuditSummary() {
      const sEl = PCD.$('#haccpAuditSummary', view);
      if (sEl) sEl.innerHTML = auditSummaryInner(collectAuditData((auditFromEl && auditFromEl.value) || currentMonthYM()));
    }
    if (auditFromEl) auditFromEl.addEventListener('change', _refreshAuditSummary);
    if (auditToEl) auditToEl.addEventListener('change', _refreshAuditSummary);

    // v2.9.37 — HACCP region change handler. Four-layer persist guarantee:
    // (1) in-memory state set, (2) flushSync to LS/IDB, (3) cloud queue
    // upsert into user_prefs, (4) flushNow to force network write before
    // the user can reload. cloud-pertable.js pull was also patched to
    // MERGE prefs instead of overwrite, so any race condition where the
    // cloud row is stale won't wipe the new field.
    const regionSel = PCD.$('#haccpRegionSelect', view);
    if (regionSel) {
      regionSel.addEventListener('change', function () {
        // v2.9.38 — Single source of truth: PCD.haccp.setRegion handles
        // state set + LS write + flushSync + cloud upsert + flushNow.
        // LS fallback guarantees value survives any reload race.
        if (PCD.haccp && PCD.haccp.setRegion) {
          PCD.haccp.setRegion(this.value);
        }
        PCD.toast.success(t('saved'));
        render(view);
      });
    }
  }

  // -------- EXPORT --------
  PCD.tools = PCD.tools || {};
  PCD.tools.haccp = {
    render: render,
  };
})();
