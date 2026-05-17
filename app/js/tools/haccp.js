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
        desc: t('haccp_hub_card_cooling_desc') || 'Monthly cooling chart — 60°C → 21°C → 5°C',
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
        desc: t('haccp_hub_card_holding_desc') || 'Bain-marie ≥63°C, cold display ≤5°C',
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
    const allTouched = cards.every(function (c) { return c.todayCount > 0; });

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

    const headerStatus = allTouched
      ? '<span style="color:var(--success);font-weight:700;">✓ ' + (t('haccp_hub_all_logged_today') || 'All forms logged today') + '</span>'
      : '<span style="color:#92400e;font-weight:700;">⚠ ' + (t('haccp_hub_pending_today') || 'Some forms not yet logged today') + '</span>';

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('haccp_hub_title') || 'HACCP Forms'}</div>
          <div class="page-subtitle">${t('haccp_hub_subtitle') || 'Food safety record-keeping in one place'}</div>
        </div>
      </div>

      <div class="card mb-3" style="padding:16px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border-color:var(--brand-300);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:4px;">${t('haccp_hub_today_status') || 'Today’s status'}</div>
            <div style="font-size:16px;">${headerStatus}</div>
          </div>
          <div style="text-align:end;">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:4px;">${t('haccp_hub_total_today') || 'Total entries today'}</div>
            <div style="font-size:22px;font-weight:800;color:var(--brand-700);">${totalToday}</div>
          </div>
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

    PCD.on(view, 'click', '[data-haccp-route]', function () {
      const r = this.getAttribute('data-haccp-route');
      if (r && PCD.router && PCD.router.go) PCD.router.go(r);
    });
  }

  // -------- EXPORT --------
  PCD.tools = PCD.tools || {};
  PCD.tools.haccp = {
    render: render,
  };
})();
