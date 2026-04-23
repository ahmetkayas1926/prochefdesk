/* ================================================================
   ProChefDesk — app.js
   The bootstrap. Wires everything together on page load.
   ================================================================ */

(function () {
  'use strict';

  function boot() {
    const PCD = window.PCD;
    const t = PCD.i18n.t;

    // 1) Load persisted state
    PCD.store.init();

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

    // 4) Init cloud (no-op if not configured)
    PCD.cloud.init();

    // 5) Init auth (may check session and hydrate user)
    PCD.auth.init().then(function () {
      onAuthResolved();
    }).catch(function (e) {
      PCD.err('auth init err', e);
      onAuthResolved();
    });

    function onAuthResolved() {
      // 6) Register views
      PCD.router.register('dashboard', PCD.tools.dashboard.render);
      PCD.router.register('recipes', PCD.tools.recipes.render);
      PCD.router.register('ingredients', PCD.tools.ingredients.render);
      PCD.router.register('account', PCD.tools.account.render);
      PCD.router.register('tools', PCD.tools.toolsHub.render);
      // Phase 2
      PCD.router.register('menus', PCD.tools.menus.render);
      PCD.router.register('kitchen_cards', PCD.tools.kitchenCards.render);
      PCD.router.register('shopping', PCD.tools.shopping.render);
      PCD.router.register('portion', PCD.tools.portion.render);
      // Phase 3
      PCD.router.register('inventory', PCD.tools.inventory.render);
      PCD.router.register('waste', PCD.tools.waste.render);
      PCD.router.register('suppliers', PCD.tools.suppliers.render);
      PCD.router.register('events', PCD.tools.events.render);
      // Phase 4
      PCD.router.register('nutrition', PCD.tools.nutrition.render);
      PCD.router.register('allergens', PCD.tools.allergens.render);
      PCD.router.register('yield', PCD.tools.yield_calc.render);
      PCD.router.register('whatif', PCD.tools.whatif.render);
      PCD.router.register('menu_engineering', PCD.tools.menuMatrix.render);
      PCD.router.register('team', PCD.tools.team.render);

      // 7) Start router + render initial view
      PCD.router.start();
      PCD.router.go('dashboard', null, { skipHistory: true });

      // 8) Seed demos if first run
      if (!PCD.store.get('onboarding.demoSeeded')) {
        PCD.demo.seed();
        // Re-render dashboard now that we have data
        PCD.router.go('dashboard', null, { skipHistory: true });
      }

      // 9) Wire chrome (topbar, sidenav, bottom nav)
      wireChrome();

      // 10) Populate sidenav items
      populateSidenav();

      // 11) Hide splash, show app
      setTimeout(function () {
        const splash = PCD.$('#splash');
        if (splash) {
          splash.classList.add('fade-out');
          setTimeout(function () { splash.style.display = 'none'; }, 340);
        }
        PCD.$('#app').classList.remove('hidden');

        // 12) Main tour on very first run
        if (!PCD.store.get('onboarding.mainTourDone')) {
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
      PCD.toast.info('Coming soon 🚀');
    });

    // Bottom nav
    PCD.$$('.bn-item[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        PCD.router.go(this.getAttribute('data-nav'));
        PCD.haptic('light');
      });
    });

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
        { key: 'dashboard', icon: '🏠', route: 'dashboard' },
        { key: 'recipes',   icon: '📖', route: 'recipes' },
        { key: 'ingredients', icon: '🥕', route: 'ingredients' },
      ]},
      { title: 'Service', items: [
        { key: 'menus',          icon: '📋', route: 'menus' },
        { key: 'kitchen_cards',  icon: '🗂️', route: 'kitchen_cards' },
        { key: 'portion',        icon: '⚖️', route: 'portion' },
      ]},
      { title: 'Operations', items: [
        { key: 'inventory',      icon: '📦', route: 'inventory' },
        { key: 'waste',          icon: '♻️', route: 'waste' },
        { key: 'suppliers',      icon: '🚚', route: 'suppliers' },
        { key: 'shopping',       icon: '🛒', route: 'shopping' },
        { key: 'events',         icon: '🎉', route: 'events' },
      ]},
      { title: 'Analytics', items: [
        { key: 'nutrition',        icon: '🥗', route: 'nutrition' },
        { key: 'allergens',        icon: '⚠️', route: 'allergens' },
        { key: 'menu_engineering', icon: '📊', route: 'menu_engineering' },
        { key: 'whatif',           icon: '🔮', route: 'whatif' },
        { key: 'yield',            icon: '🧮', route: 'yield' },
        { key: 'team',             icon: '👥', route: 'team' },
      ]},
      { title: t('nav_tools'), items: [
        { key: 'tools',          icon: '🛠️', route: 'tools' },
        { key: 'account',        icon: '👤', route: 'account' },
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
        b.innerHTML = '<span class="sidenav-item-icon">' + it.icon + '</span>' +
                      '<span>' + t('t_' + it.key + '_title') + '</span>';
        container.appendChild(b);
      });
    });
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
    if (upgrade) upgrade.style.display = plan === 'free' ? '' : 'none';
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
      // Re-render current view
      const view = PCD.$('#view');
      const cur = PCD.router.currentView();
      if (cur && PCD.tools[cur]) PCD.tools[cur].render(view);
      populateSidenav();
    });
  }

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
