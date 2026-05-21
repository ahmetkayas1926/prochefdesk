/* ================================================================
   ProChefDesk — tools-hub.js
   Grid of all tools. Active tools navigate. Coming-soon tools
   show a chip and don't navigate.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const TOOLS = [
    { key: 'dashboard',         icon: 'home',            route: 'dashboard',    phase: 1 },
    { key: 'recipes',           icon: 'book-open',       route: 'recipes',      phase: 1 },
    { key: 'ingredients',       icon: 'carrot',          route: 'ingredients',  phase: 1 },
    { key: 'account',           icon: 'user',            route: 'account',      phase: 1 },
    { key: 'menus',             icon: 'menu',            route: 'menus',        phase: 2 },
    { key: 'kitchen_cards',     icon: 'id-card',         route: 'kitchen_cards',phase: 2 },
    { key: 'portion',           icon: 'scale',           route: 'portion',      phase: 2 },
    { key: 'events',            icon: 'calendar',        route: 'events',       phase: 3 },
    { key: 'inventory',         icon: 'package',         route: 'inventory',    phase: 3 },
    { key: 'suppliers',         icon: 'truck',           route: 'suppliers',    phase: 3 },
    { key: 'checklist',         icon: 'check-square',    route: 'checklist',    phase: 4 },
    { key: 'allergens',         icon: 'alert-triangle',  route: 'allergens',    phase: 4 },
    { key: 'yield',             icon: 'percent',         route: 'yield',        phase: 4 },
    { key: 'whatif',            icon: 'activity',        route: 'whatif',       phase: 4 },
    { key: 'team',              icon: 'users',           route: 'team',         phase: 4 },
  ];

  function render(view) {
    const t = PCD.i18n.t;
    const phase = 4; // Currently-active phase

    // v2.8.91 — Phase grouping: tek düz grid yerine 4 section.
    // Phase 1 = Essentials, 2 = Production, 3 = Operations, 4 = Compliance/Other.
    // Şef "Today I need X" → doğru grup'a anında bakar.
    function renderToolCard(tool) {
      const active = tool.phase <= phase;
      const titleKey = 't_' + tool.key + '_title';
      const descKey = 't_' + tool.key + '_desc';
      return '<button class="card ' + (active ? 'card-hover' : '') + '" data-route="' + (active ? tool.route : '') + '" data-active="' + active + '" style="padding:16px;text-align:start;border:1px solid var(--border);position:relative;' + (active ? '' : 'opacity:0.6;cursor:default;') + '">' +
        '<div style="color:var(--brand-600);margin-bottom:8px;">' + PCD.icon(tool.icon, 28) + '</div>' +
        '<div style="font-weight:700;font-size:14px;letter-spacing:-0.01em;margin-bottom:2px;">' + PCD.escapeHtml(t(titleKey)) + '</div>' +
        '<div class="text-muted" style="font-size:12px;line-height:1.4;">' + PCD.escapeHtml(t(descKey)) + '</div>' +
        (!active ? '<div style="position:absolute;top:8px;right:8px;font-size:10px;font-weight:600;color:var(--text-3);background:var(--surface-2);padding:2px 6px;border-radius:var(--r-full);text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('tools_hub_soon') || 'Soon') + '</div>' : '') +
      '</button>';
    }

    const phaseGroups = [
      { num: 1, labelKey: 'tools_hub_phase1_label', descKey: 'tools_hub_phase1_desc' },
      { num: 2, labelKey: 'tools_hub_phase2_label', descKey: 'tools_hub_phase2_desc' },
      { num: 3, labelKey: 'tools_hub_phase3_label', descKey: 'tools_hub_phase3_desc' },
      { num: 4, labelKey: 'tools_hub_phase4_label', descKey: 'tools_hub_phase4_desc' },
    ];

    const sectionsHtml = phaseGroups.map(function (pg) {
      const toolsInPhase = TOOLS.filter(function (tt) { return tt.phase === pg.num; });
      if (toolsInPhase.length === 0) return '';
      return '<div style="margin-bottom:24px;">' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border);">' +
            '<div>' +
              '<div style="font-size:14px;font-weight:700;color:var(--text);letter-spacing:-0.01em;">' + PCD.escapeHtml(t(pg.labelKey) || ('Phase ' + pg.num)) + '</div>' +
              '<div class="text-muted" style="font-size:11px;line-height:1.4;margin-top:2px;">' + PCD.escapeHtml(t(pg.descKey) || '') + '</div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--text-3);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;flex-shrink:0;">' + toolsInPhase.length + ' ' + PCD.escapeHtml(t('tools_hub_tools_label') || 'tools') + '</div>' +
          '</div>' +
          '<div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));gap:10px;">' +
            toolsInPhase.map(renderToolCard).join('') +
          '</div>' +
        '</div>';
    }).join('');

    const html =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">' + t('tools_hub_title') + '</div>' +
          '<div class="page-subtitle">' + t('tools_hub_subtitle') + '</div>' +
        '</div>' +
      '</div>' +
      sectionsHtml;

    view.innerHTML = html;

    PCD.on(view, 'click', '[data-route]', function () {
      const route = this.getAttribute('data-route');
      const active = this.getAttribute('data-active') === 'true';
      if (!active || !route) {
        PCD.haptic('error');
        PCD.toast.info(PCD.i18n.t('toast_coming_in_future'));
        return;
      }
      PCD.router.go(route);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.toolsHub = { render: render };
})();
