/* ================================================================
   ProChefDesk — app.js
   The bootstrap. Wires everything together on page load.
   ================================================================ */

(function () {
  'use strict';

  async function boot() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;
    console.log('[boot] start');

    // 0) Init cloud first (so share.js can use supabase client)
    PCD.cloud.init();
    console.log('[boot] cloud.init done');

    // 0.5) Check for ?share= URL — if present, render share page and skip normal app
    if (PCD.share && PCD.share.initShareCheck && PCD.share.initShareCheck()) {
      console.log('[boot] share page shown, exiting');
      return;
    }

    // 1) Load persisted state (v2.6.91 — async, IDB-first)
    try {
      await PCD.store.init();
      console.log('[boot] store.init resolved');
    } catch (e) {
      console.error('[boot] store.init failed:', e);
    }
    try { PCD.store.autoPurgeOldTrash && PCD.store.autoPurgeOldTrash(30); } catch (e) {}

    // 2) Apply saved theme BEFORE showing UI
    const savedTheme = PCD.store.get('prefs.theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // 3) Apply saved locale (default detect from browser if never set)
    let savedLocale = PCD.store.get('prefs.locale');
    if (!savedLocale) {
      const browser = (navigator.language || 'en').slice(0, 2);
      const supported = (window.PCD_CONFIG.LOCALES || []).some(function (l) { return l.code === browser; });
      savedLocale = supported ? browser : 'en';
    }
    PCD.i18n.setLocale(savedLocale);
    console.log('[boot] theme/locale applied');

    // 5) Init auth (await — getSession + cloud.pull + photo migrate + cloud-migrate)
    // v2.6.91 — Pull tamamlanmadan onAuthResolved çağrılmamalı; aksi halde
    // pull'un emit ettiği state değişiklikleri router/UI listener'larına ulaşmaz.
    try {
      await PCD.auth.init();
      console.log('[boot] auth.init resolved');
    } catch (e) {
      console.error('[boot] auth.init failed:', e);
    }
    onAuthResolved();
    console.log('[boot] onAuthResolved called');

    function onAuthResolved() {
      // 6) Register views
      // v2.8.78 — Eager: only essentials needed for first paint (dashboard
      // is the default home, account drives auth flows that fire on boot).
      // Everything else is lazy-registered → router fetches the JS on first nav.
      PCD.router.register('dashboard', PCD.tools.dashboard.render);
      PCD.router.register('account', PCD.tools.account.render);
      PCD.router.register('inventory', PCD.tools.inventory.render);  // eager — dashboard alert kullanır

      // Lazy routes — { route → script path, tool global name (snake or camel) }
      PCD.router.registerLazy('recipes',         'js/tools/recipes.js',        'recipes');
      PCD.router.registerLazy('ingredients',     'js/tools/ingredients.js',    'ingredients');
      // Menu Studio ana menü aracı (v2.19.3). Klasik menus.js artık route'lanmaz
      // (dosya diskte kalır ama yüklenmez). Eski klasik menüler Studio'da açılırken
      // otomatik bloklara aktarılır (importFromClassic). 'menu_studio' alias korunur.
      PCD.router.registerLazy('menus',           'js/tools/menu_studio.js',    'menuStudio');
      PCD.router.registerLazy('menu_studio',     'js/tools/menu_studio.js',    'menuStudio');
      PCD.router.registerLazy('kitchen_cards',   'js/tools/kitchen_cards.js',  'kitchen_cards');
      PCD.router.registerLazy('whiteboard',      'js/tools/whiteboard.js',     'whiteboard');
      PCD.router.registerLazy('portion',         'js/tools/portion.js',        'portion');
      // Inventory eager-kept: dashboard kullanır (computeStatus low-stock alert için)
      PCD.router.registerLazy('suppliers',       'js/tools/suppliers.js',      'suppliers');
      PCD.router.registerLazy('invoice',         'js/tools/invoice.js',        'invoice');
      PCD.router.registerLazy('waste',           'js/tools/waste.js',          'waste');
      PCD.router.registerLazy('variance',        'js/tools/variance.js',       'variance');
      PCD.router.registerLazy('nutrition',       'js/tools/nutrition.js',      'nutrition');
      PCD.router.registerLazy('events',          'js/tools/events.js',         'events');
      PCD.router.registerLazy('roster',          'js/tools/roster.js',         'roster');
      PCD.router.registerLazy('prep',            'js/tools/prep.js',           'prep');
      PCD.router.registerLazy('checklist',       'js/tools/checklist.js',      'checklist');
      PCD.router.registerLazy('haccp_logs',      'js/tools/haccp_logs.js',     'haccp_logs');
      PCD.router.registerLazy('haccp_cooling',   'js/tools/haccp_cooling.js',  'haccp_cooling');
      PCD.router.registerLazy('haccp_receiving', 'js/tools/haccp_receiving.js','haccp_receiving');
      PCD.router.registerLazy('haccp_holding',   'js/tools/haccp_holding.js',  'haccp_holding');
      PCD.router.registerLazy('haccp',           'js/tools/haccp.js',          'haccp');
      PCD.router.registerLazy('buffet',          'js/tools/buffet.js',         'buffet');
      // v2.11.16 — Mise en Place Planner kaldırıldı (operatör kararı: Events/Buffet
      // dependency, manual task add UI yok, kod yorumu yalan söylüyordu — bkz.
      // CHANGELOG v2.11.16). Cloud sync schema (mise_plans tablosu) korundu,
      // eski veri Supabase'de durur (ileride tekrar tool eklenirse veri kalır).
      PCD.router.registerLazy('discover', 'js/tools/discover.js', 'discover');

      // 7) Start router + render initial view
      // BUG FIX (v2.6.36): Read the route from the URL hash so F5 keeps
      // the user on the same page instead of bouncing back to dashboard.
      PCD.router.start();
      const initial = (PCD.router.initialRoute && PCD.router.initialRoute()) || 'dashboard';
      PCD.router.go(initial, null, { skipHistory: true });

      // 8) Seed demos if first run
      // v2.6.93 — Demo seed artık SADECE misafir kullanıcılar için çalışıyor.
      // Önceki davranış: `if (!demoSeeded)` → onboarding.demoSeeded cloud-bağımlı
      // (user_prefs.data.onboarding) ve cloud'a güvenilir şekilde yazılmıyordu;
      // her F5'te boot pull → onboarding boş → seed yeniden tetikleniyor → her
      // F5'te demo recipe duplicate ediliyordu. Yeni gate: kullanıcı sign-in
      // olduysa user objesi state'te dolu, seed asla çalışmaz. Sign-out misafir
      // ilk açılışta seed bir kez çalışır, demoSeeded lokal flag'i bunu kilitler.
      const isGuest = !PCD.store.get('user');
      if (isGuest && !PCD.store.get('onboarding.demoSeeded')) {
        PCD.demo.seed();
        // Re-render whichever view is current now that we have data
        PCD.router.go(initial, null, { skipHistory: true });
      }

      // 9) Wire chrome (topbar, sidenav, bottom nav)
      wireChrome();

      // 10) Populate sidenav items
      populateSidenav();

      // v2.6.59 — Re-populate sidenav when inventory changes so the
      // critical-count badge stays current without needing a reload.
      try {
        PCD.store.on('inventory', function () { try { populateSidenav(); } catch (e) {} });
        PCD.store.on('ingredients', function () { try { populateSidenav(); } catch (e) {} });
      } catch (e) { /* ignore — boot tolerance */ }

      // v2.17 — Stripe checkout dönüşü: ?checkout=success → kullanıcıyı
      // bilgilendir + planı yeniden çek. Plan, webhook ile aktive olur ve
      // birkaç saniye gecikebilir → kısa aralıklı 2 retry.
      try {
        const sp = new URLSearchParams(location.search);
        if (sp.get('checkout') === 'success') {
          if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
          if (PCD.toast && PCD.toast.success) PCD.toast.success(PCD.i18n.t('checkout_success_toast'));
          const refetch = function () {
            if (!PCD.cloud || !PCD.cloud.fetchPlan) return;
            PCD.cloud.fetchPlan().then(function (p) {
              if (p && p !== (PCD.store.get('plan') || 'free')) {
                PCD.store.set('plan', p);
                try { populateSidenav(); } catch (e) {}
              }
            }).catch(function () {});
          };
          setTimeout(refetch, 3000);
          setTimeout(refetch, 9000);
        } else if (sp.get('upgrade') === '1') {
          // v2.17 — Landing "Go Pro" → /app/?upgrade=1. Plan boot'ta async
          // set edilir; kısa gecikmeyle gerçek plana göre çöz.
          if (history.replaceState) history.replaceState({}, '', location.pathname + location.hash);
          setTimeout(function () {
            const u = PCD.store.get('user');
            if (!u || !u.id) {
              if (PCD.toast) PCD.toast.info(PCD.i18n.t('gate_signin_first'));
              if (PCD.auth && PCD.auth.openAuthModal) PCD.auth.openAuthModal();
              else PCD.router.go('account');
              return;
            }
            if (PCD.gate && PCD.gate.isPro && PCD.gate.isPro()) { PCD.router.go('account'); return; }
            if (PCD.gate && PCD.gate.showUpgradeModal) PCD.gate.showUpgradeModal({});
          }, 1200);
        }
      } catch (e) { /* ignore */ }

      // 11) Hide splash, show app
      setTimeout(function () {
        const splash = PCD.$('#splash');
        if (splash) {
          splash.classList.add('fade-out');
          setTimeout(function () { splash.style.display = 'none'; }, 340);
        }
        PCD.$('#app').classList.remove('hidden');

        // 12) Main tour on very first run
        // v2.6.93 — Önceden state.onboarding.mainTourDone'a bakılıyordu; cloud
        // sync zincirinde bu flag güvenilir yazılmıyordu, her F5'te tour geri
        // geliyordu. Şimdi localStorage flag'i öncelikli (cloud-bağımsız).
        // State flag'i fallback olarak kalıyor — eski cihazlardan zaten true
        // gelen kullanıcılar için tour açılmasın diye.
        let tourDone = false;
        try { tourDone = localStorage.getItem('pcd_tour_done') === '1'; } catch (e) {}
        if (!tourDone && PCD.store.get('onboarding.mainTourDone')) tourDone = true;
        if (!tourDone) {
          setTimeout(function () {
            if (PCD.tutorial && PCD.tutorial.startMainTour) PCD.tutorial.startMainTour();
          }, 700);
        }
      }, 250);
    }

    // Reactive UI updates
    PCD.store.on('user', function () {
      updateUserAvatar();
      updatePlanBadge();
    });
    PCD.store.on('plan', function () {
      updatePlanBadge();
    });
    PCD.store.on('prefs.theme', function (v) {
      document.documentElement.setAttribute('data-theme', v);
    });
  }

  function wireChrome() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;

    // Topbar brand -> dashboard
    PCD.$('.topbar-brand').addEventListener('click', function () {
      PCD.router.go('dashboard');
    });

    // Menu button -> toggle sidenav
    PCD.$('#btnMenu').addEventListener('click', function () {
      PCD.$('#sidenav').classList.add('open');
    });
    PCD.$$('[data-close-sidenav]').forEach(function (el) {
      el.addEventListener('click', function () { PCD.$('#sidenav').classList.remove('open'); });
    });

    // Theme toggle
    PCD.$('#btnTheme').addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'light' ? 'dark' : 'light';
      PCD.store.set('prefs.theme', next);
      document.documentElement.setAttribute('data-theme', next);
      PCD.haptic('tick');
    });

    // Language toggle -> picker
    PCD.$('#btnLang').addEventListener('click', openLanguagePicker);

    // Workspace switcher
    PCD.$('#wsSwitcher').addEventListener('click', openWorkspaceSwitcher);
    refreshWorkspaceLabel();
    PCD.store.on('activeWorkspaceId', refreshWorkspaceLabel);
    PCD.store.on('workspaces', refreshWorkspaceLabel);

    // User button
    PCD.$('#btnUser').addEventListener('click', function () {
      const user = PCD.store.get('user');
      if (user) PCD.router.go('account');
      else PCD.auth.openAuthModal();
    });

    // Sync button -> show status / force sync
    PCD.$('#btnSync').addEventListener('click', function () {
      const user = PCD.store.get('user');
      if (!user) {
        PCD.toast.info(t('auth_backend_not_configured'));
        return;
      }
      if (!navigator.onLine) {
        PCD.toast.warning(t('offline_mode'));
        return;
      }
      PCD.cloud._doSync();
      PCD.toast.info(t('saving'));
    });

    // Upgrade button
    const upgradeBtn = PCD.$('#btnUpgrade');
    if (upgradeBtn) upgradeBtn.addEventListener('click', function () {
      PCD.toast.info(PCD.i18n.t('toast_coming_soon'));
    });

    // Bottom nav
    PCD.$$('.bn-item[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        PCD.router.go(this.getAttribute('data-nav'));
        PCD.haptic('light');
      });
    });

    // Bottom nav center "+" button — context-aware "new item" creator.
    // Mirrors what each tool's own "+ New ..." button does. If the current
    // view doesn't expose openEditor (e.g. kitchen_cards), fall back to
    // routing to recipes and creating a recipe — the most common case.
    const bnCreateBtn = document.getElementById('bnCreateBtn');
    if (bnCreateBtn) {
      bnCreateBtn.addEventListener('click', function () {
        PCD.haptic('light');
        const cur = (PCD.router && PCD.router.currentView && PCD.router.currentView()) || 'dashboard';

        // Tools that expose openEditor — call directly to launch the
        // "new <thing>" editor without leaving the current view.
        const directCreators = {
          recipes:     function () { PCD.tools.recipes && PCD.tools.recipes.openEditor(); },
          ingredients: function () { PCD.tools.ingredients && PCD.tools.ingredients.openEditor(); },
          menus:       function () { PCD.tools.menus && PCD.tools.menus.openEditor(); },
          events:      function () { PCD.tools.events && PCD.tools.events.openEditor(); },
          suppliers:   function () { PCD.tools.suppliers && PCD.tools.suppliers.openEditor && PCD.tools.suppliers.openEditor(); },
          checklist:   function () { PCD.tools.checklist && PCD.tools.checklist.openEditor && PCD.tools.checklist.openEditor(); },
          inventory:   function () { PCD.tools.inventory && PCD.tools.inventory.openEditor && PCD.tools.inventory.openEditor(); },
          haccp_logs:  function () { PCD.tools.haccpLogs && PCD.tools.haccpLogs.openEditor && PCD.tools.haccpLogs.openEditor(); },
          haccp_cooling: function () { PCD.tools.haccpCooling && PCD.tools.haccpCooling.openEditor && PCD.tools.haccpCooling.openEditor(); },
          haccp_receiving: function () { PCD.tools.haccpReceiving && PCD.tools.haccpReceiving.openEditor && PCD.tools.haccpReceiving.openEditor(); },
          haccp_holding: function () { PCD.tools.haccpHolding && PCD.tools.haccpHolding.openEditor && PCD.tools.haccpHolding.openEditor(); },
        };
        if (directCreators[cur]) {
          directCreators[cur]();
          return;
        }

        // Kitchen cards: the "new canvas" reset lives behind an
        // in-page button. Navigate to the view, then click that button
        // once the view has rendered.
        if (cur === 'kitchen_cards') {
          PCD.router.go('kitchen_cards');
          setTimeout(function () {
            const newBtn = document.getElementById('newCanvasBtn');
            if (newBtn) newBtn.click();
          }, 150);
          return;
        }

        // Default for dashboard / account / shopping / unknown views:
        // jump to recipes and open the new-recipe editor — the most
        // common "create" intent.
        // v2.8.78 — recipes is lazy; poll briefly so editor opens once tool loads
        PCD.router.go('recipes');
        let attempts = 0;
        const trial = setInterval(function () {
          if (PCD.tools.recipes && PCD.tools.recipes.openEditor) {
            clearInterval(trial);
            PCD.tools.recipes.openEditor();
          } else if (++attempts > 25) { // ~3s cap on slow connections
            clearInterval(trial);
          }
        }, 120);
      });
    }

    // Sidenav items (delegated — populated later)
    PCD.on(PCD.$('#sidenav'), 'click', '[data-nav]', function () {
      const name = this.getAttribute('data-nav');
      if (name) {
        PCD.router.go(name);
        PCD.$('#sidenav').classList.remove('open');
      }
    });

    // Initial labels
    updateUserAvatar();
    updatePlanBadge();
  }

  function populateSidenav() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;
    const container = PCD.$('#sidenavItems');
    if (!container) return;
    PCD.clear(container);

    const sections = [
      { title: null, items: [
        { key: 'dashboard', icon: 'home', route: 'dashboard' },
      ]},
      { title: t('section_library'), items: [
        { key: 'recipes',     icon: 'book-open', route: 'recipes' },
        { key: 'ingredients', icon: 'carrot', route: 'ingredients' },
        { key: 'menus',       icon: 'menu', route: 'menus' },
        // v2.44.30 — nutrition Recipes sub-nav'a taşındı (route duruyor; recipes sayfasından sekme ile erişilir).
      ]},
      { title: t('section_kitchen'), items: [
        { key: 'kitchen_cards', icon: 'id-card', route: 'kitchen_cards' },
        // v2.9.40 — Kitchen Whiteboard (customizable A4/A3 reference grid)
        { key: 'whiteboard',    icon: 'grid', route: 'whiteboard' },
        // v2.11.16 — 'mise' sidenav item kaldırıldı (Mise en Place Planner tool kaldırıldı).
        // v2.44.30 — portion Recipes sub-nav'a taşındı.
        { key: 'checklist',     icon: 'check-square', route: 'checklist' },
        { key: 'roster',        icon: 'clock', route: 'roster' },
        // v2.44.30 — prep Checklist sub-nav'a taşındı (Listeler · Prep Föyü).
      ]},
      { title: t('section_sourcing'), items: [
        { key: 'inventory', icon: 'package', route: 'inventory' },
        { key: 'suppliers', icon: 'truck', route: 'suppliers' },
        { key: 'invoice',   icon: 'file-text', route: 'invoice' },
        // v2.44.30 — waste + variance Inventory sub-nav'a taşındı (Stok · Varyans · Fire).
      ]},
      { title: t('section_catering'), items: [
        { key: 'events',  icon: 'calendar', route: 'events' },
        // v2.8.73 — Buffet Planner
        { key: 'buffet',  icon: 'grid',     route: 'buffet' },
      ]},
      // v2.8.70 — 4 ayrı HACCP item, tek "HACCP" hub'a konsolide edildi.
      // Form sayfaları silinmedi; hub içinden tıklanarak açılır.
      { title: t('section_haccp_forms'), items: [
        { key: 'haccp', icon: 'thermometer', route: 'haccp' },
      ]},
      { title: t('section_discover'), items: [
        { key: 'discover', icon: 'grid', route: 'discover' },
      ]},
      { title: null, items: [
        { key: 'account', icon: 'user', route: 'account' },
      ]},
    ];

    sections.forEach(function (sec) {
      if (sec.title) {
        container.appendChild(PCD.el('div', { class: 'sidenav-section', text: sec.title }));
      }
      sec.items.forEach(function (it) {
        const b = PCD.el('button', {
          class: 'sidenav-item',
          'data-nav': it.route,
        });
        // If icon is short name (no emoji chars), render as SVG via PCD.icon
        const isIconName = typeof it.icon === 'string' && /^[a-z\-]+$/.test(it.icon);
        const iconHtml = isIconName ? PCD.icon(it.icon, 18) : it.icon;
        // Resolve label with fallback chain: t_X_title → X_title → nav_X → key as-is
        let label = t('t_' + it.key + '_title');
        if (label === 't_' + it.key + '_title') label = t(it.key + '_title');
        if (label === it.key + '_title') label = t('nav_' + it.key);
        if (label === 'nav_' + it.key) {
          // Last resort: capitalize the key
          label = it.key.charAt(0).toUpperCase() + it.key.slice(1).replace(/_/g, ' ');
        }
        // v2.6.59 — Sidenav badge for inventory: show critical count
        // proactively so the chef sees urgent restocks even before
        // opening the dashboard. Updated each time sidenav is repopulated.
        let badgeHtml = '';
        if (it.key === 'inventory') {
          const criticalCount = countCriticalInventory();
          if (criticalCount > 0) {
            badgeHtml =
              '<span class="sidenav-item-badge" style="display:inline-block;margin-inline-start:auto;background:var(--danger);color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;min-width:18px;text-align:center;line-height:14px;">' +
              criticalCount + '</span>';
          }
        }
        b.innerHTML = '<span class="sidenav-item-icon">' + iconHtml + '</span>' +
                      '<span style="flex:1;">' + PCD.escapeHtml(label) + '</span>' +
                      badgeHtml;
        container.appendChild(b);
      });
    });
  }

  // v2.6.59 — Count inventory items with critical/out status. Used by
  // the sidenav badge to flag urgent restocks proactively.
  function countCriticalInventory() {
    try {
      if (!PCD.tools || !PCD.tools.inventory || !PCD.tools.inventory.computeStatus) return 0;
      const wsId = PCD.store.getActiveWorkspaceId();
      const allInv = PCD.store._read ? (PCD.store._read('inventory') || {}) : {};
      const invKeys = Object.keys(allInv);
      const sample = invKeys.length > 0 ? allInv[invKeys[0]] : null;
      const isLegacy = sample && (sample.stock !== undefined || sample.parLevel !== undefined);
      const invForWs = isLegacy ? allInv : (allInv[wsId] || {});
      const ings = PCD.store.listIngredients ? PCD.store.listIngredients() : [];
      let n = 0;
      ings.forEach(function (i) {
        const row = invForWs[i.id];
        const s = PCD.tools.inventory.computeStatus(row);
        if (s === 'critical' || s === 'out') n++;
      });
      return n;
    } catch (e) {
      return 0;
    }
  }

  function updateUserAvatar() {
    const PCD = window.PCD;
    const user = PCD.store.get('user');
    const avatar = PCD.$('#userAvatar');
    if (!avatar) return;
    if (user) {
      if (user.avatar) avatar.innerHTML = '<img src="' + user.avatar + '" style="width:28px;height:28px;border-radius:50%;">';
      else avatar.textContent = (user.name || user.email || '?').charAt(0).toUpperCase();
    } else {
      avatar.textContent = '👤';
    }
  }

  function updatePlanBadge() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;
    const plan = PCD.store.get('plan') || 'free';
    const badge = PCD.$('#planBadge');
    if (!badge) return;
    badge.className = 'plan-badge plan-' + plan;
    badge.textContent = t(plan + '_plan');
    const upgrade = PCD.$('#btnUpgrade');
    // v2.6.25: Şu an her şey ücretsiz, "Pro'ya Yükselt" butonu kullanıcıyı
    // kafa karıştırıyor. Premium tier eklendiğinde bu blok geri açılacak.
    if (upgrade) upgrade.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }

  // ============ WORKSPACE SWITCHER ============
  const WS_COLORS = [
    { id: 'green',  hex: '#16a34a' },
    { id: 'blue',   hex: '#2563eb' },
    { id: 'purple', hex: '#9333ea' },
    { id: 'pink',   hex: '#db2777' },
    { id: 'orange', hex: '#ea580c' },
    { id: 'amber',  hex: '#d97706' },
    { id: 'teal',   hex: '#0d9488' },
    { id: 'slate',  hex: '#475569' },
  ];
  function wsColorHex(colorId) {
    const c = WS_COLORS.find(function (x) { return x.id === colorId; });
    return c ? c.hex : WS_COLORS[0].hex;
  }

  function refreshWorkspaceLabel() {
    const ws = PCD.store.getActiveWorkspace();
    if (!ws) return;
    const nameEl = document.getElementById('wsName');
    const dotEl = document.getElementById('wsDot');
    if (nameEl) nameEl.textContent = ws.name || 'My Kitchen';
    if (dotEl) dotEl.style.background = wsColorHex(ws.color);
  }

  function openWorkspaceSwitcher() {
    const t = PCD.i18n.t;
    const all = PCD.store.listWorkspaces(true);
    const active = all.filter(function (w) { return !w.archived; });
    const archived = all.filter(function (w) { return w.archived; });
    const activeId = PCD.store.getActiveWorkspaceId();

    const body = PCD.el('div');
    let html = '<div style="margin-bottom:10px;">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">' + t('ws_active_section') + '</div>';
    active.forEach(function (w) {
      const stats = workspaceStats(w.id);
      const isActive = w.id === activeId;
      html += '<div data-pickws="' + w.id + '" role="button" tabindex="0" class="ws-row' + (isActive ? ' active' : '') + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:1.5px solid ' + (isActive ? 'var(--brand-600)' : 'var(--border)') + ';border-radius:var(--r-md);background:' + (isActive ? 'var(--brand-50)' : 'var(--surface)') + ';margin-bottom:6px;cursor:pointer;text-align:start;box-sizing:border-box;">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:' + wsColorHex(w.color) + ';color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon(w.icon || 'chef-hat', 18) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(w.name) + (isActive ? ' <span style="font-size:10px;color:var(--brand-700);font-weight:700;letter-spacing:0.04em;">· ' + t('ws_active_badge') + '</span>' : '') + '</div>' +
          '<div class="text-muted" style="font-size:12px;">' +
            (w.concept ? PCD.escapeHtml(w.concept) + ' · ' : '') +
            stats.recipes + ' ' + t('ws_recipes_count') + ' · ' + stats.menus + ' ' + t('ws_menus_count') +
          '</div>' +
        '</div>' +
        '<button type="button" class="icon-btn" data-edit-ws="' + w.id + '" title="' + PCD.escapeHtml(t('ws_edit_tooltip')) + '" style="flex-shrink:0;">' + PCD.icon('edit', 16) + '</button>' +
      '</div>';
    });
    html += '</div>';

    if (archived.length > 0) {
      html += '<div style="margin-top:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">' + t('ws_archived_section') + '</div>';
      archived.forEach(function (w) {
        html += '<div data-pickws="' + w.id + '" role="button" tabindex="0" class="ws-row" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);margin-bottom:6px;cursor:pointer;opacity:0.6;text-align:start;box-sizing:border-box;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:var(--text-3);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('archive', 16) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(w.name) + '</div>' +
            '<div class="text-muted" style="font-size:11px;">' + t('ws_archived_label') + (w.concept ? ' · ' + PCD.escapeHtml(w.concept) : '') + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    // v2.7.5 — Deleted (Trash) bölümü
    const deleted = (PCD.store.listDeletedWorkspaces && PCD.store.listDeletedWorkspaces()) || [];
    if (deleted.length > 0) {
      html += '<div style="margin-top:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">' + t('ws_deleted_section') + '</div>';
      deleted.forEach(function (w) {
        const stats = workspaceStats(w.id);
        // 30 günlük retention sayacı (DB pcd_cleanup_old_deleted cron'u her gün kontrol eder)
        let daysLeft = '';
        if (w.deletedAt) {
          const deletedTs = new Date(w.deletedAt).getTime();
          const expiresTs = deletedTs + 30 * 24 * 60 * 60 * 1000;
          const remaining = Math.max(0, Math.ceil((expiresTs - Date.now()) / (24 * 60 * 60 * 1000)));
          daysLeft = ' · ' + t('ws_days_left', { n: remaining });
        }
        const displayName = w.name || ('(' + t('ws_unnamed') + ')');
        html += '<div class="ws-row" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px dashed var(--border);border-radius:var(--r-md);background:var(--surface);margin-bottom:6px;opacity:0.75;text-align:start;box-sizing:border-box;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:' + wsColorHex(w.color) + ';color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.6;">' + PCD.icon('trash', 16) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(displayName) + '</div>' +
            '<div class="text-muted" style="font-size:11px;">' + stats.recipes + ' ' + t('ws_recipes_count') + ' · ' + stats.menus + ' ' + t('ws_menus_count') + daysLeft + '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-outline" data-restore-ws="' + w.id + '" style="flex-shrink:0;font-size:12px;padding:6px 10px;">' + PCD.icon('refresh', 14) + ' <span>' + t('btn_restore') + '</span></button>' +
          '<button type="button" class="icon-btn" data-purge-ws="' + w.id + '" title="' + PCD.escapeHtml(t('btn_delete_forever')) + '" style="flex-shrink:0;color:var(--danger);">' + PCD.icon('trash', 16) + '</button>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '<button class="btn btn-outline" id="newWsBtn" style="width:100%;margin-top:12px;">' + PCD.icon('plus', 16) + ' <span>' + t('ws_new_workspace') + '</span></button>';

    body.innerHTML = html;

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: t('ws_switcher_title'), body: body, footer: footer, size: 'sm', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-pickws]', function (e) {
      if (e.target.closest('[data-edit-ws]')) return;
      const wsId = this.getAttribute('data-pickws');
      if (wsId === activeId) { m.close(); return; }
      const ws = PCD.store.getWorkspace(wsId);
      if (ws && ws.archived) {
        // Unarchive on switch
        PCD.modal.confirm({
          title: PCD.i18n.t('modal_reactivate_ws_title'),
          text: '"' + ws.name + '" is archived. Reactivate and switch to it?',
          okText: PCD.i18n.t('btn_reactivate')
        }).then(function (ok) {
          if (!ok) return;
          PCD.store.archiveWorkspace(wsId, false);
          PCD.store.setActiveWorkspaceId(wsId);
          PCD.toast.success(PCD.i18n.t('toast_workspace_switched', { name: ws.name }));
          m.close();
          setTimeout(function () { window.location.reload(); }, 400);
        });
        return;
      }
      PCD.store.setActiveWorkspaceId(wsId);
      PCD.toast.success(PCD.i18n.t('toast_workspace_switched', { name: (ws ? ws.name : 'workspace') }));
      m.close();
      // Reload to refresh all views with new workspace data
      setTimeout(function () { window.location.reload(); }, 300);
    });

    PCD.on(body, 'click', '[data-edit-ws]', function (e) {
      e.stopPropagation();
      const wsId = this.getAttribute('data-edit-ws');
      m.close();
      setTimeout(function () { openWorkspaceEditor(wsId); }, 200);
    });

    PCD.$('#newWsBtn', body).addEventListener('click', function () {
      m.close();
      setTimeout(function () { openWorkspaceEditor(); }, 200);
    });

    // v2.7.5 — Restore button (silinmiş ws için)
    PCD.on(body, 'click', '[data-restore-ws]', function (e) {
      e.stopPropagation();
      const wsId = this.getAttribute('data-restore-ws');
      const list = (PCD.store.listDeletedWorkspaces && PCD.store.listDeletedWorkspaces()) || [];
      const w = list.find(function (x) { return x.id === wsId; });
      const wsName = (w && w.name) || PCD.i18n.t('ws_unnamed');
      PCD.modal.confirm({
        title: PCD.i18n.t('modal_restore_ws_title'),
        text: PCD.i18n.t('modal_restore_ws_text', { name: wsName }),
        okText: PCD.i18n.t('btn_restore')
      }).then(function (ok) {
        if (!ok) return;
        const p = PCD.store.restoreWorkspace(wsId);
        Promise.resolve(p).then(function () {
          PCD.toast.success(PCD.i18n.t('toast_workspace_restored', { name: wsName }));
          m.close();
          setTimeout(function () { window.location.reload(); }, 400);
        }).catch(function () {
          PCD.toast.error(PCD.i18n.t('toast_workspace_restore_failed'));
        });
      });
    });

    // v2.7.6 — Delete forever button (kalıcı silme)
    PCD.on(body, 'click', '[data-purge-ws]', function (e) {
      e.stopPropagation();
      const wsId = this.getAttribute('data-purge-ws');
      const list = (PCD.store.listDeletedWorkspaces && PCD.store.listDeletedWorkspaces()) || [];
      const w = list.find(function (x) { return x.id === wsId; });
      const wsName = (w && w.name) || PCD.i18n.t('ws_unnamed');
      PCD.modal.confirm({
        title: PCD.i18n.t('modal_purge_ws_title'),
        text: PCD.i18n.t('modal_purge_ws_text', { name: wsName }),
        okText: PCD.i18n.t('btn_delete_forever'),
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        const p = PCD.store.purgeWorkspace(wsId);
        Promise.resolve(p).then(function (success) {
          if (success === false) {
            PCD.toast.error(PCD.i18n.t('toast_workspace_purge_failed'));
            return;
          }
          PCD.toast.success(PCD.i18n.t('toast_workspace_purged', { name: wsName }));
          m.close();
          setTimeout(function () { window.location.reload(); }, 400);
        }).catch(function () {
          PCD.toast.error(PCD.i18n.t('toast_workspace_purge_failed'));
        });
      });
    });
  }

  function workspaceStats(wsId) {
    const r = (PCD.store.get('recipes') || {})[wsId];
    const m = (PCD.store.get('menus') || {})[wsId];
    return {
      recipes: r ? Object.keys(r).length : 0,
      menus: m ? Object.keys(m).length : 0,
    };
  }

  function openWorkspaceEditor(wsId) {
    const t = PCD.i18n.t;
    const existing = wsId ? PCD.store.getWorkspace(wsId) : null;
    // v2.17 — Free plan workspace limiti (entry-point gate: form açılmadan).
    if (!existing && PCD.gate && !PCD.gate.canAddWorkspace(PCD.store.listWorkspaces().length)) {
      PCD.gate.showUpgradeModal({ feature: 'workspaces' });
      return;
    }
    const data = existing ? Object.assign({}, existing) : {
      name: '',
      concept: '',
      role: '',
      city: '',
      periodStart: null,
      periodEnd: null,
      color: 'green',
      icon: 'chef-hat',
      archived: false,
    };

    const body = PCD.el('div');
    function buildBody() {
      body.innerHTML =
        '<div class="field"><label class="field-label">' + t('ws_field_name') + ' *</label>' +
        '<input type="text" class="input" id="wsNameInp" value="' + PCD.escapeHtml(data.name || '') + '" placeholder="' + PCD.escapeHtml(t('ws_field_name_placeholder')) + '"></div>' +

        '<div class="field-row">' +
          '<div class="field"><label class="field-label">' + t('ws_field_concept') + '</label>' +
            '<input type="text" class="input" id="wsConcept" value="' + PCD.escapeHtml(data.concept || '') + '" placeholder="' + PCD.escapeHtml(t('ws_field_concept_placeholder')) + '"></div>' +
          '<div class="field"><label class="field-label">' + t('ws_field_role') + '</label>' +
            '<input type="text" class="input" id="wsRole" value="' + PCD.escapeHtml(data.role || '') + '" placeholder="' + PCD.escapeHtml(t('ws_field_role_placeholder')) + '"></div>' +
        '</div>' +

        '<div class="field-row">' +
          '<div class="field"><label class="field-label">' + t('ws_field_city') + '</label>' +
            '<input type="text" class="input" id="wsCity" value="' + PCD.escapeHtml(data.city || '') + '" placeholder="' + PCD.escapeHtml(t('ws_field_city_placeholder')) + '"></div>' +
          '<div class="field"><label class="field-label">' + t('ws_field_period') + '</label>' +
            '<div style="display:flex;gap:6px;">' +
              '<input type="month" class="input" id="wsStart" value="' + PCD.escapeHtml((data.periodStart || '').slice(0, 7)) + '" style="flex:1;">' +
              '<input type="month" class="input" id="wsEnd" value="' + PCD.escapeHtml((data.periodEnd || '').slice(0, 7)) + '" placeholder="ongoing" style="flex:1;">' +
            '</div>' +
            '<div class="field-hint">' + t('ws_field_period_hint') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="field"><label class="field-label">' + t('ws_field_color') + '</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="wsColors"></div>' +
        '</div>';
      paintColors();

      // Live sync to data on each keystroke (so color clicks don't lose user's text)
      PCD.on(body, 'input', '#wsNameInp', function () { data.name = this.value; });
      PCD.on(body, 'input', '#wsConcept', function () { data.concept = this.value; });
      PCD.on(body, 'input', '#wsRole', function () { data.role = this.value; });
      PCD.on(body, 'input', '#wsCity', function () { data.city = this.value; });
      PCD.on(body, 'input', '#wsStart', function () { data.periodStart = this.value ? this.value + '-01' : null; });
      PCD.on(body, 'input', '#wsEnd', function () { data.periodEnd = this.value ? this.value + '-01' : null; });
    }

    function paintColors() {
      const wrap = PCD.$('#wsColors', body);
      if (!wrap) return;
      wrap.innerHTML = WS_COLORS.map(function (c) {
        const isSel = data.color === c.id;
        return '<button type="button" data-color="' + c.id + '" style="width:36px;height:36px;border-radius:8px;background:' + c.hex + ';border:3px solid ' + (isSel ? '#fff' : c.hex) + ';outline:' + (isSel ? '2px solid ' + c.hex : 'none') + ';cursor:pointer;"></button>';
      }).join('');
    }

    // Color click: only repaint colors, preserve all input values
    PCD.on(body, 'click', '[data-color]', function () {
      data.color = this.getAttribute('data-color');
      paintColors();
    });

    buildBody();

    const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    let archiveBtn = null, deleteBtn = null;
    if (existing) {
      archiveBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline' });
      archiveBtn.innerHTML = PCD.icon('archive', 14) + ' <span>' + (existing.archived ? 'Unarchive' : 'Archive') + '</span>';
      // Only allow delete if there's another workspace
      const others = PCD.store.listWorkspaces(true).filter(function (w) { return w.id !== existing.id; });
      if (others.length > 0) {
        deleteBtn = PCD.el('button', { type: 'button', class: 'btn btn-ghost', text: 'Delete', style: { color: 'var(--danger)' } });
      }
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    if (archiveBtn) footer.appendChild(archiveBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('ws_edit_title') : t('ws_new_workspace'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (archiveBtn) archiveBtn.addEventListener('click', function () {
      const willArchive = !existing.archived;
      PCD.modal.confirm({
        title: willArchive ? 'Archive workspace?' : 'Reactivate workspace?',
        text: willArchive
          ? '"' + existing.name + '" will be hidden but data is preserved. You can reactivate any time.'
          : '"' + existing.name + '" will appear in the active list again.',
        okText: willArchive ? 'Archive' : 'Reactivate'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.archiveWorkspace(existing.id, willArchive);
        PCD.toast.success(willArchive ? 'Workspace archived' : 'Workspace reactivated');
        m.close();
        setTimeout(function () { window.location.reload(); }, 400);
      });
    });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      // Build counts of data that will be wiped, so user sees consequences
      const wsId = existing.id;
      const recipesInWs = (PCD.store.get('recipes') || {})[wsId] || {};
      const menusInWs = (PCD.store.get('menus') || {})[wsId] || {};
      const eventsInWs = (PCD.store.get('events') || {})[wsId] || {};
      const suppliersInWs = (PCD.store.get('suppliers') || {})[wsId] || {};
      const counts = {
        recipes: Object.keys(recipesInWs).length,
        menus: Object.keys(menusInWs).length,
        events: Object.keys(eventsInWs).length,
        suppliers: Object.keys(suppliersInWs).length,
      };
      const T = PCD.i18n.t;
      const dataLines = [];
      if (counts.recipes) dataLines.push(counts.recipes + ' ' + T('ws_delete_summary_recipes'));
      if (counts.menus) dataLines.push(counts.menus + ' ' + T('ws_delete_summary_menus'));
      if (counts.events) dataLines.push(counts.events + ' ' + T('ws_delete_summary_events'));
      if (counts.suppliers) dataLines.push(counts.suppliers + ' ' + T('ws_delete_summary_suppliers'));
      const dataSummary = dataLines.length > 0
        ? T('ws_delete_summary_will_delete', { items: dataLines.join(' · ') })
        : T('ws_delete_summary_empty');

      PCD.modal.confirm({
        icon: '⚠️', iconKind: 'danger', danger: true,
        title: T('modal_delete_workspace_named', { name: existing.name }),
        text: dataSummary + ' ' + T('ws_delete_summary_tail'),
        okText: T('modal_yes_delete_named', { name: existing.name }),
        cancelText: T('cancel')
      }).then(function (ok) {
        if (!ok) return;
        const success = PCD.store.deleteWorkspace(wsId);
        if (!success) {
          PCD.toast.error(PCD.i18n.t('toast_workspace_min_one'));
          return;
        }
        try { PCD.toast.success(PCD.i18n.t('toast_workspace_deleted')); } catch (e) {}
        try { m.close(); } catch (e) {}

        // Push deletion to cloud BEFORE reload (otherwise reload pulls stale state with the ws back)
        const doReload = function () { window.location.reload(); };
        if (PCD.cloud && typeof PCD.cloud.pushNow === 'function') {
          PCD.cloud.pushNow().then(function () { setTimeout(doReload, 100); });
        } else {
          setTimeout(doReload, 250);
        }
      });
    });
    saveBtn.addEventListener('click', function (clickEvent) {
      // Prevent any default / form submission no matter what
      if (clickEvent && clickEvent.preventDefault) clickEvent.preventDefault();
      if (clickEvent && clickEvent.stopPropagation) clickEvent.stopPropagation();

      // STEP 1 — Read inputs (no UI work, just data)
      const nameInp = body.querySelector('#wsNameInp');
      const conceptInp = body.querySelector('#wsConcept');
      const roleInp = body.querySelector('#wsRole');
      const cityInp = body.querySelector('#wsCity');
      const startInp = body.querySelector('#wsStart');
      const endInp = body.querySelector('#wsEnd');

      if (nameInp) data.name = (nameInp.value || '').trim();
      if (conceptInp) data.concept = (conceptInp.value || '').trim();
      if (roleInp) data.role = (roleInp.value || '').trim();
      if (cityInp) data.city = (cityInp.value || '').trim();
      if (startInp) data.periodStart = startInp.value ? startInp.value + '-01' : null;
      if (endInp) data.periodEnd = endInp.value ? endInp.value + '-01' : null;

      if (!data.name) {
        PCD.toast && PCD.toast.error(PCD.i18n.t('toast_name_required'));
        return;
      }

      // STEP 2 — Save to store (this is the only step that MUST succeed)
      let saved = null;
      try {
        if (existing) data.id = existing.id;
        saved = PCD.store.upsertWorkspace(data);
      } catch (saveErr) {
        PCD.err && PCD.err('[Workspace Save] upsert error', saveErr);
        PCD.toast && PCD.toast.error(PCD.i18n.t('toast_save_failed_with_error', { msg: (saveErr && saveErr.message || saveErr) }));
        return;
      }
      if (!saved || !saved.id) {
        PCD.toast && PCD.toast.error(PCD.i18n.t('toast_workspace_create_failed'));
        return;
      }

      const isNew = !existing;

      // STEP 3 — Switch active workspace if new
      try {
        if (isNew) PCD.store.setActiveWorkspaceId(saved.id);
      } catch (e) {
        PCD.warn && PCD.warn('[Workspace Save] setActive failed (non-fatal):', e);
      }

      // STEP 4 — UI cleanup (best effort, but reload will fix anything)
      try { PCD.toast.success(PCD.i18n.t('toast_workspace_saved')); } catch (e) {}
      try { m.close(); } catch (e) {}

      // STEP 5 — Push to cloud BEFORE reload (so reload doesn't pull stale state)
      const doReload = function () {
        if (isNew) {
          window.location.reload();
        } else {
          try { refreshWorkspaceLabel(); } catch (e) {}
        }
      };
      if (PCD.cloud && typeof PCD.cloud.pushNow === 'function') {
        PCD.cloud.pushNow().then(function () {
          setTimeout(doReload, 100);
        });
      } else {
        // No cloud → just reload after short delay
        setTimeout(doReload, 250);
      }
    });
  }

  function openLanguagePicker() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;
    const locales = PCD.i18n.getLocales();
    const items = locales.map(function (l) {
      return { id: l.code, name: l.name, meta: l.code.toUpperCase() };
    });
    PCD.picker.open({
      title: t('choose_language'),
      items: items,
      multi: false,
      selected: [PCD.i18n.currentLocale]
    }).then(function (sel) {
      if (!sel || !sel.length) return;
      PCD.i18n.setLocale(sel[0]);
      // Re-render current view to apply new translations
      const view = PCD.$('#view');
      const cur = PCD.router.currentView() || 'dashboard';
      if (view && PCD.tools[cur] && typeof PCD.tools[cur].render === 'function') {
        try { PCD.tools[cur].render(view); } catch (e) { PCD.error && PCD.error(e); }
      }
      populateSidenav();
      refreshWorkspaceLabel();
    });
  }

  // ============ PWA INSTALL BANNER ============
  let _deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _deferredInstallPrompt = e;
    showInstallBanner();
  });
  window.addEventListener('appinstalled', function () {
    _deferredInstallPrompt = null;
    const b = document.getElementById('pcd-install-banner');
    if (b) b.remove();
    try { localStorage.setItem('pcd_pwa_installed', '1'); } catch (e) {}
  });

  function showInstallBanner() {
    try {
      if (localStorage.getItem('pcd_pwa_banner_dismissed') === '1') return;
      if (localStorage.getItem('pcd_pwa_installed') === '1') return;
    } catch (e) {}
    if (document.getElementById('pcd-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pcd-install-banner';
    banner.style.cssText = 'position:fixed;bottom:16px;inset-inline-start:16px;inset-inline-end:16px;max-width:420px;margin:0 auto;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-lg);border-radius:var(--r-md);padding:12px 14px;z-index:90;display:flex;align-items:center;gap:12px;animation:slideUp .3s ease;';
    banner.innerHTML =
      '<div style="width:40px;height:40px;border-radius:var(--r-sm);background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="none" style="width:62%;height:62%" aria-hidden="true"><path d="M6.5 13.6 C5 13 4.2 11.6 4.5 10 C4.6 9.3 5 8.6 5.7 8.2 C5.4 7 6 6.1 7 5.8 C7 4.6 7.8 3.8 9 3.8 C9.3 2.8 10.5 2.2 12 2.2 C13.5 2.2 14.7 2.8 15 3.8 C16.2 3.8 17 4.6 17 5.8 C18 6.1 18.6 7 18.3 8.2 C19 8.6 19.4 9.3 19.5 10 C19.8 11.6 19 13 17.5 13.6 Z" fill="#fff"/><path d="M6.3 13.6 L17.7 13.6 L17.7 19.3 C17.7 20.2 17 21 16.1 21 L7.9 21 C7 21 6.3 20.2 6.3 19.3 Z" fill="#fff"/><path d="M8 13.4 C7.7 10.4 8 7.4 8.9 5 M10 13.5 C9.9 10 10 6.6 10.5 3.4 M12 13.5 V2.6 M14 13.5 C14.1 10 14 6.6 13.5 3.4 M16 13.4 C16.3 10.4 16 7.4 15.1 5" stroke="#16433a" stroke-width="0.5" stroke-linecap="round" fill="none"/></svg></div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:14px;">Install ProChefDesk</div>' +
        '<div class="text-muted" style="font-size:12px;">Add to home screen for faster access</div>' +
      '</div>' +
      '<button id="pcd-install-btn" class="btn btn-primary btn-sm" style="flex-shrink:0;">Install</button>' +
      '<button id="pcd-install-dismiss" class="icon-btn" style="flex-shrink:0;width:32px;height:32px;" aria-label="Dismiss">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg>' +
      '</button>';
    document.body.appendChild(banner);

    document.getElementById('pcd-install-btn').onclick = function () {
      if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(function () {
          _deferredInstallPrompt = null;
          banner.remove();
        });
      }
    };
    document.getElementById('pcd-install-dismiss').onclick = function () {
      try { localStorage.setItem('pcd_pwa_banner_dismissed', '1'); } catch (e) {}
      banner.remove();
    };
  }

  // ============ OFFLINE DETECTION ============
  function updateOfflineStatus() {
    const existing = document.getElementById('pcd-offline-banner');
    if (!navigator.onLine) {
      if (existing) return;
      const b = document.createElement('div');
      b.id = 'pcd-offline-banner';
      b.className = 'offline-banner';
      // v2.6.96 — i18n çağrısı (eskiden hardcoded EN idi). t() bulamazsa
      // fallback ile EN gösterir; aktif dile göre ar/de/es/fr/tr varyantları
      // i18n dosyalarında tanımlı.
      const offlineText = (PCD.i18n && PCD.i18n.t)
        ? PCD.i18n.t('offline_msg', "Offline — your changes are safe and will sync automatically when you're back online")
        : "Offline — your changes are safe and will sync automatically when you're back online";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span>' + offlineText + '</span>';
      document.body.appendChild(b);
    } else {
      if (existing) existing.remove();
    }
  }
  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  // Initial check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setTimeout(updateOfflineStatus, 1000);
  }

  // ============ FORCE DISABLE ZOOM (iOS Safari ignores user-scalable=no) ============
  // Pinch-zoom: prevent any 2+ finger touches
  document.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // iOS Safari gesture events (pinch) — block explicitly
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
  document.addEventListener('gestureend', function (e) { e.preventDefault(); });

  // Double-tap zoom: block the second tap if within 300ms
  let _lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    const now = Date.now();
    if (now - _lastTouchEnd <= 300) {
      e.preventDefault();
    }
    _lastTouchEnd = now;
  }, { passive: false });

  // v2.12.6 — Desktop Ctrl+wheel page zoom is now ALLOWED (chefs zoom the
  // page in/out like any site). The previous handler that called
  // preventDefault on ctrl+wheel was removed. This is desktop-only by nature
  // (touch devices have no Ctrl key, so this never affected mobile); pinch-zoom
  // is a touch gesture handled separately and is untouched.

  // ============ GLOBAL SEARCH (Ctrl/Cmd+K command palette) — E2 ============
  PCD.openGlobalSearch = function () {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML =
      '<input type="search" id="gblQ" class="input" placeholder="' + PCD.escapeHtml(t('search')) + '…" autocomplete="off" style="margin-bottom:10px;">' +
      '<div id="gblR" style="max-height:52vh;overflow-y:auto;min-height:48px;"></div>';
    const m = PCD.modal.open({ title: t('search'), body: body, size: 'md', closable: true });
    const input = body.querySelector('#gblQ');
    const out = body.querySelector('#gblR');
    function afterLoad(name, cb) {
      const tl = PCD.tools[name];
      if (tl && tl.openEditor) { cb(tl); return; }
      let a = 0; const tr = setInterval(function () { const x = PCD.tools[name]; if (x && x.openEditor) { clearInterval(tr); cb(x); } else if (++a > 25) clearInterval(tr); }, 120);
    }
    function nav(kind, id) {
      m.close();
      const route = { recipe: 'recipes', ingredient: 'ingredients', event: 'events', supplier: 'suppliers', buffet: 'buffet' }[kind] || 'recipes';
      PCD.router.go(route);
      afterLoad(route, function (tool) { if (tool.openEditor) tool.openEditor(id); });
    }
    function render(q) {
      q = (q || '').toLowerCase().trim();
      if (!q) { out.innerHTML = ''; return; }
      const res = [];
      (PCD.store.listRecipes() || []).forEach(function (r) { if ((r.name || '').toLowerCase().indexOf(q) >= 0) res.push({ k: 'recipe', id: r.id, n: r.name, i: '📖' }); });
      (PCD.store.listIngredients() || []).forEach(function (g) { if ((g.name || '').toLowerCase().indexOf(q) >= 0) res.push({ k: 'ingredient', id: g.id, n: g.name, i: '🥕' }); });
      (PCD.store.listTable('events') || []).forEach(function (e) { var nm = e.name || e.title || ''; if (nm.toLowerCase().indexOf(q) >= 0) res.push({ k: 'event', id: e.id, n: nm, i: '📅' }); });
      (PCD.store.listTable('suppliers') || []).forEach(function (s) { if ((s.name || '').toLowerCase().indexOf(q) >= 0) res.push({ k: 'supplier', id: s.id, n: s.name, i: '🚚' }); });
      (PCD.store.listTable('buffets') || []).forEach(function (b) { if ((b.name || '').toLowerCase().indexOf(q) >= 0) res.push({ k: 'buffet', id: b.id, n: b.name || '—', i: '🍽️' }); });
      if (!res.length) { out.innerHTML = '<div style="padding:22px;text-align:center;color:var(--text-3);font-size:14px;">—</div>'; return; }
      out.innerHTML = res.slice(0, 40).map(function (r) {
        return '<button type="button" class="gblItem" data-k="' + r.k + '" data-id="' + r.id + '" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:var(--r-md);background:transparent;border:0;cursor:pointer;font-size:14px;color:var(--text);">' +
          '<span style="font-size:17px;">' + r.i + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.n) + '</span>' +
          '<span style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;">' + r.k + '</span></button>';
      }).join('');
      out.querySelectorAll('.gblItem').forEach(function (b) {
        b.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-2)'; });
        b.addEventListener('mouseleave', function () { this.style.background = 'transparent'; });
        b.addEventListener('click', function () { nav(this.getAttribute('data-k'), this.getAttribute('data-id')); });
      });
    }
    input.addEventListener('input', function () { render(this.value); });
    setTimeout(function () { input.focus(); }, 80);
  };

  // ============ KEYBOARD SHORTCUTS (desktop) ============
  document.addEventListener('keydown', function (e) {
    // Ignore if typing in input/textarea/select (except for Esc which always works)
    const tag = (e.target && e.target.tagName || '').toUpperCase();
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);

    // Esc: close top modal (already handled by popstate on back button too)
    if (e.key === 'Escape') {
      if (PCD.modal && PCD.modal.isOpen()) {
        e.preventDefault();
        PCD.modal.closeTop();
      }
      return;
    }

    if (inField) return;

    // Ctrl/Cmd + K: focus search (context-aware: go to recipes page and focus search)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (PCD.openGlobalSearch) PCD.openGlobalSearch();
      return;
    }

    // "n" → new recipe (if on recipes page)
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const cur = PCD.router.currentView();
      if (cur === 'recipes') {
        const btn = document.getElementById('newRecipeBtn');
        if (btn) { e.preventDefault(); btn.click(); }
      } else if (cur === 'ingredients') {
        const btn = document.getElementById('newIngBtn');
        if (btn) { e.preventDefault(); btn.click(); }
      }
      return;
    }

    // "/" → focus search
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const search = document.querySelector('#recipeSearch, #ingSearch, input[type=search]');
      if (search) { e.preventDefault(); search.focus(); }
      return;
    }
  });

  // ============ REQUEST PERSISTENT STORAGE ============
  // Prevents iOS 7-day storage eviction + browsers clearing data under pressure
  // when the user relies on the app's local state as primary data.
  (function () {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (isPersisted) {
        if (!isPersisted) {
          navigator.storage.persist().then(function (granted) {
            PCD.log && PCD.log('[Storage] persistent:', granted);
          });
        }
      }).catch(function () {});
    }
  })();

  // ============ GLOBAL ERROR HANDLER ============
  // Catches uncaught exceptions so a single broken tool doesn't crash the whole app.
  // Shows a discreet toast instead of silent failure.
  // v2.6.63 — Also reports to Supabase `client_errors` table so the admin
  // can monitor production issues. Rate-limited and PII-scrubbed.
  let _errorCount = 0;
  let _lastErrorAt = 0;
  // v2.6.63 — Per-message dedupe: don't spam the same error
  const _reportedMessages = {};
  const REPORT_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  // v2.6.63 — Hard cap per session to prevent runaway loops
  let _sessionReportCount = 0;
  const MAX_REPORTS_PER_SESSION = 30;

  function reportErrorToCloud(payload) {
    try {
      if (_sessionReportCount >= MAX_REPORTS_PER_SESSION) return;
      const dedupeKey = (payload.message || '') + '|' + (payload.filename || '') + ':' + (payload.line || 0);
      const now = Date.now();
      const lastReport = _reportedMessages[dedupeKey];
      if (lastReport && now - lastReport < REPORT_DEDUPE_WINDOW_MS) return;
      _reportedMessages[dedupeKey] = now;
      _sessionReportCount++;
      const supabase = (PCD.cloud && PCD.cloud.getClient && PCD.cloud.getClient()) || null;
      if (!supabase) return;
      const user = PCD.store.get('user');
      // Build context (safe metadata only, NO recipe content / PII)
      const context = {
        view: (PCD.router && PCD.router.currentView && PCD.router.currentView()) || null,
        ws_id: (PCD.store && PCD.store.getActiveWorkspaceId && PCD.store.getActiveWorkspaceId()) || null,
        theme: document.documentElement.getAttribute('data-theme') || null,
        screen: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
        online: navigator.onLine,
      };
      // Truncate stack to keep payload small (Supabase row size limit)
      const stackTrunc = (payload.stack || '').slice(0, 4000);
      // Fire-and-forget; don't await, don't block
      supabase.from('client_errors').insert({
        user_id: (user && user.id) || null,
        app_version: (window.PCD_CONFIG && window.PCD_CONFIG.APP_VERSION) || null,
        locale: (PCD.i18n && PCD.i18n.currentLocale) || null,
        url: (window.location && window.location.href) || null,
        user_agent: navigator.userAgent || null,
        message: (payload.message || '').slice(0, 1000),
        filename: (payload.filename || '').slice(0, 500),
        line: payload.line || null,
        col: payload.col || null,
        stack: stackTrunc,
        context: context,
      }).then(function () { /* ok */ }).catch(function () { /* swallow */ });
    } catch (e) { /* never let error reporter throw */ }
  }

  window.addEventListener('error', function (e) {
    // v2.13.6 — "ResizeObserver loop" hataları benign tarayıcı gürültüsü (RO kullanan
    // her şey üretir, özellikle Ctrl+wheel zoom'da). Toast/cloud raporu YOK — yoksa
    // zoom yapınca "Something went wrong" spam'i oluşuyor.
    if (e && e.message && e.message.indexOf('ResizeObserver') !== -1) return;
    const now = Date.now();
    if (now - _lastErrorAt < 1000) {
      _errorCount++;
      if (_errorCount > 10) return; // rate-limit — prevent error loops
    } else {
      _errorCount = 0;
    }
    _lastErrorAt = now;
    PCD.error && PCD.error('[Global]', e.message || e.error, e.filename, e.lineno);
    if (PCD.toast) {
      PCD.toast.error(PCD.i18n.t('toast_generic_error'), 3000);
    }
    // v2.6.63 — Report to cloud (best-effort, async)
    reportErrorToCloud({
      message: (e.message || (e.error && e.error.message) || 'unknown error'),
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: (e.error && e.error.stack) || null,
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    PCD.error && PCD.error('[Promise]', e.reason);
    // v2.6.63 — Also report unhandled promise rejections (often network-related,
    // but some are real bugs we want to know about).
    const reason = e.reason;
    let message = 'unhandledrejection';
    let stack = null;
    if (reason) {
      if (typeof reason === 'string') message = reason;
      else if (reason.message) {
        message = reason.message;
        stack = reason.stack || null;
      } else {
        try { message = JSON.stringify(reason).slice(0, 200); } catch (_) {}
      }
    }
    reportErrorToCloud({ message: 'unhandledrejection: ' + message, stack: stack });
  });

  // v2.8.33 — Ambient sync status indicator. Tiny floating dot
  // bottom-right of the viewport. Default: invisible. Only appears
  // when syncing (pulse animation), offline (gray dot), or error
  // (red dot, tap to retry). Chef-friendly — no jargon, just a
  // passive visual that says "things are fine" by its absence.
  function _installSyncIndicator() {
    if (document.getElementById('pcd-sync-dot')) return;  // already installed
    const dot = document.createElement('div');
    dot.id = 'pcd-sync-dot';
    dot.setAttribute('role', 'status');
    dot.setAttribute('aria-live', 'polite');
    dot.style.cssText = [
      'position:fixed',
      'bottom:14px',
      'right:14px',
      'width:10px',
      'height:10px',
      'border-radius:50%',
      'background:transparent',
      'box-shadow:0 0 0 2px transparent',
      'z-index:9999',
      'opacity:0',
      'transition:opacity 0.3s ease, background 0.3s ease, transform 0.2s ease',
      'pointer-events:none',
      'cursor:default',
    ].join(';');
    // Hidden tooltip span (used on hover / when shown).
    dot.title = '';
    document.body.appendChild(dot);

    // Inject pulsing animation keyframes once.
    if (!document.getElementById('pcd-sync-dot-style')) {
      const style = document.createElement('style');
      style.id = 'pcd-sync-dot-style';
      style.textContent =
        '@keyframes pcd-sync-pulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.35); opacity: 1; } }' +
        '#pcd-sync-dot.pcd-sync-syncing { animation: pcd-sync-pulse 1s ease-in-out infinite; }';
      document.head.appendChild(style);
    }

    let hideTimer = null;
    function render(state, detail) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      dot.classList.remove('pcd-sync-syncing');
      dot.style.pointerEvents = 'none';
      dot.onclick = null;
      switch (state) {
        case 'syncing':
          dot.style.background = '#3b82f6';
          dot.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.18)';
          dot.style.opacity = '1';
          dot.classList.add('pcd-sync-syncing');
          dot.title = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('sync_state_syncing', 'Syncing…') : 'Syncing…';
          break;
        case 'synced':
          dot.style.background = '#16a34a';
          dot.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.18)';
          dot.style.opacity = '1';
          dot.title = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('sync_state_synced', 'Up to date') : 'Up to date';
          // Fade out after 2s — confirmation glimpse, then disappear.
          hideTimer = setTimeout(function () {
            dot.style.opacity = '0';
            hideTimer = null;
          }, 2000);
          break;
        case 'offline':
          dot.style.background = '#6b7280';
          dot.style.boxShadow = '0 0 0 3px rgba(107,114,128,0.18)';
          dot.style.opacity = '1';
          dot.title = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('sync_state_offline', 'Offline — changes will sync when back online') : 'Offline';
          break;
        case 'error':
          dot.style.background = '#dc2626';
          dot.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.18)';
          dot.style.opacity = '1';
          dot.style.pointerEvents = 'auto';
          dot.style.cursor = 'pointer';
          dot.title = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('sync_state_error_tap', 'Sync issue — tap to retry') : 'Tap to retry sync';
          dot.onclick = function () {
            if (PCD.cloudPerTable && PCD.cloudPerTable.queueFullState && PCD.cloudPerTable.flushNow) {
              PCD.cloudPerTable.queueFullState();
              PCD.cloudPerTable.flushNow();
            }
          };
          break;
        default:
          dot.style.opacity = '0';
      }
    }

    window.addEventListener('pcd-sync-status', function (e) {
      const d = e && e.detail;
      if (!d) return;
      render(d.state, d.detail);
    });

    window.addEventListener('online', function () {
      // Triggers a flushNow to push anything that queued during offline.
      if (PCD.cloudPerTable && PCD.cloudPerTable.flushNow) {
        try { PCD.cloudPerTable.flushNow(); } catch (e) {}
      }
    });
    window.addEventListener('offline', function () { render('offline'); });

    // If we boot offline, reflect that.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      render('offline');
    }
  }

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      _installSyncIndicator();
    });
  } else {
    boot();
    _installSyncIndicator();
  }
})();
