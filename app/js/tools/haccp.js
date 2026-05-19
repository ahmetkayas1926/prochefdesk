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

  // Count today's records across the various HACCP tables.
  // Each form stores under a different state key — we touch each
  // gently and return a count. Errors silently → 0 (defensive).
  function countTodayEntries(stateKey, dateField) {
    try {
      const wsId = PCD.store.getActiveWorkspaceId();
      const all = PCD.store._read(stateKey) || {};
      const arr = Array.isArray(all) ? all : (all[wsId] || []);
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
        todayCount: countTodayEntries('haccpLogs', 'recordedAt'),
      },
      {
        route: 'haccp_cooling',
        icon: 'clock',
        title: t('haccp_hub_card_cooling_title') || 'Cook & Cool Log',
        desc: t('haccp_hub_card_cooling_desc') || 'Cooked food cooling — 2-stage verification',
        accent: '#3b82f6',
        todayCount: countTodayEntries('haccpCooling', 'monthYM'),
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
    const cards = getCards();
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
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('haccp_hub_guide_title') || 'How to use the HACCP Hub')}</span>
            <button type="button" id="haccpGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('haccp_hub_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('haccp_hub_guide_step1_title') || 'Open daily, check the status')}</strong> — ${PCD.escapeHtml(t('haccp_hub_guide_step1_body') || 'The hero card shows today’s completion (X / 4 forms logged). Green = all done, amber = partial, red = nothing yet. Aim for full green every service day.')}</li>
              <li><strong>${PCD.escapeHtml(t('haccp_hub_guide_step2_title') || 'Four forms cover the basics')}</strong> — ${PCD.escapeHtml(t('haccp_hub_guide_step2_body') || 'Daily Temp (fridges/freezers AM+PM), Cook & Cool (60→21→5°C verification), Receiving (delivery temps + supplier), Hot/Cold Holding (bain-marie + display). Each card jumps straight to its form.')}</li>
              <li><strong>${PCD.escapeHtml(t('haccp_hub_guide_step3_title') || 'Log within minutes of the action')}</strong> — ${PCD.escapeHtml(t('haccp_hub_guide_step3_body') || 'Auditors expect timestamps. Don’t batch-log Sunday’s readings on Monday — each form has a date input but real-time entries are stronger evidence.')}</li>
              <li><strong>${PCD.escapeHtml(t('haccp_hub_guide_step4_title') || 'Print monthly for the binder')}</strong> — ${PCD.escapeHtml(t('haccp_hub_guide_step4_body') || 'Every form has a print button. Generate monthly A4 PDFs, file in a binder by form type. EU/UK/US auditors all expect the same format.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('haccp_hub_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('haccp_hub_guide_tip_body') || 'Make the morning chef responsible for Daily Temp + Receiving as part of the opening routine. Hot Holding is whoever sets up service. Cook & Cool is whoever batch cooks — assign roles so nobody assumes it’s someone else’s job.')}
            </div>
          </div>
        </details>
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

      <div class="card mb-3" style="padding:14px 18px;background:var(--surface-2);margin-top:16px;border:1px dashed var(--border-strong);">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="font-size:18px;">📋</div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.55;">
            <strong>${t('haccp_hub_audit_hint_title') || 'Preparing for an audit?'}</strong>
            ${t('haccp_hub_audit_hint_body') || 'Open each form and use its print button to generate a 30-day or monthly record. Keep printouts in a binder organised by form type — that’s what auditors expect to flip through.'}
          </div>
        </div>
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
