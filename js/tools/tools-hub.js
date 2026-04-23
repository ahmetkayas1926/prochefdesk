/* ================================================================
   ProChefDesk — tools-hub.js
   Grid of all tools. Active tools navigate. Coming-soon tools
   show a chip and don't navigate.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const TOOLS = [
    { key: 'dashboard',         icon: '🏠', route: 'dashboard',    phase: 1 },
    { key: 'recipes',           icon: '📖', route: 'recipes',      phase: 1 },
    { key: 'ingredients',       icon: '🥕', route: 'ingredients',  phase: 1 },
    { key: 'account',           icon: '👤', route: 'account',      phase: 1 },
    { key: 'menus',             icon: '📋', route: 'menus',        phase: 2 },
    { key: 'kitchen_cards',     icon: '🗂️', route: 'kitchen_cards',phase: 2 },
    { key: 'shopping',          icon: '🛒', route: 'shopping',     phase: 2 },
    { key: 'portion',           icon: '⚖️', route: 'portion',      phase: 2 },
    { key: 'events',            icon: '🎉', route: 'events',       phase: 3 },
    { key: 'inventory',         icon: '📦', route: 'inventory',    phase: 3 },
    { key: 'waste',             icon: '♻️', route: 'waste',        phase: 3 },
    { key: 'suppliers',         icon: '🚚', route: 'suppliers',    phase: 3 },
    { key: 'checklists',        icon: '✅', route: 'checklists',   phase: 4 },
    { key: 'nutrition',         icon: '🥗', route: 'nutrition',    phase: 4 },
    { key: 'menu_engineering',  icon: '📊', route: 'menu_engineering', phase: 4 },
    { key: 'allergens',         icon: '⚠️', route: 'allergens',    phase: 4 },
    { key: 'yield',             icon: '🧮', route: 'yield',        phase: 4 },
    { key: 'whatif',            icon: '🔮', route: 'whatif',       phase: 4 },
    { key: 'team',              icon: '👥', route: 'team',         phase: 4 },
  ];

  function render(view) {
    const t = PCD.i18n.t;
    const phase = 4; // Currently-active phase

    const html = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('tools_hub_title')}</div>
          <div class="page-subtitle">${t('tools_hub_subtitle')}</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
        ${TOOLS.map(function (tool) {
          const active = tool.phase <= phase;
          const titleKey = 't_' + tool.key + '_title';
          const descKey = 't_' + tool.key + '_desc';
          return `
            <button class="card ${active ? 'card-hover' : ''}" data-route="${active ? tool.route : ''}" data-active="${active}" style="padding:16px;text-align:start;border:1px solid var(--border);position:relative;${active ? '' : 'opacity:0.6;cursor:default;'}">
              <div style="font-size:32px;margin-bottom:8px;">${tool.icon}</div>
              <div style="font-weight:700;font-size:14px;letter-spacing:-0.01em;margin-bottom:2px;">${PCD.escapeHtml(t(titleKey))}</div>
              <div class="text-muted" style="font-size:12px;line-height:1.4;">${PCD.escapeHtml(t(descKey))}</div>
              ${!active ? '<div style="position:absolute;top:8px;right:8px;font-size:10px;font-weight:600;color:var(--text-3);background:var(--surface-2);padding:2px 6px;border-radius:var(--r-full);text-transform:uppercase;letter-spacing:0.04em;">Soon</div>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    `;

    view.innerHTML = html;

    PCD.on(view, 'click', '[data-route]', function () {
      const route = this.getAttribute('data-route');
      const active = this.getAttribute('data-active') === 'true';
      if (!active || !route) {
        PCD.haptic('error');
        PCD.toast.info('Coming in a future update');
        return;
      }
      PCD.router.go(route);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.toolsHub = { render: render };
})();
