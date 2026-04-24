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
      PCD.router.register('allergens', PCD.tools.allergens.render);
      PCD.router.register('yield', PCD.tools.yield_calc.render);
      PCD.router.register('whatif', PCD.tools.whatif.render);
      PCD.router.register('team', PCD.tools.team.render);
      PCD.router.register('checklist', PCD.tools.checklist.render);

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
        { key: 'dashboard', icon: 'home', route: 'dashboard' },
        { key: 'recipes',   icon: 'book-open', route: 'recipes' },
        { key: 'ingredients', icon: 'carrot', route: 'ingredients' },
      ]},
      { title: 'Service', items: [
        { key: 'menus',          icon: 'menu', route: 'menus' },
        { key: 'kitchen_cards',  icon: 'id-card', route: 'kitchen_cards' },
        { key: 'portion',        icon: 'scale', route: 'portion' },
      ]},
      { title: 'Operations', items: [
        { key: 'inventory',      icon: 'package', route: 'inventory' },
        { key: 'waste',          icon: 'recycle', route: 'waste' },
        { key: 'suppliers',      icon: 'truck', route: 'suppliers' },
        { key: 'shopping',       icon: 'shopping-cart', route: 'shopping' },
        { key: 'events',         icon: 'calendar', route: 'events' },
        { key: 'checklist',      icon: 'check-square', route: 'checklist' },
      ]},
      { title: 'Analytics', items: [
        { key: 'allergens',        icon: 'alert-triangle', route: 'allergens' },
        { key: 'whatif',           icon: 'activity', route: 'whatif' },
        { key: 'yield',            icon: 'percent', route: 'yield' },
        { key: 'team',             icon: 'users', route: 'team' },
      ]},
      { title: t('nav_tools'), items: [
        { key: 'tools',          icon: 'grid', route: 'tools' },
        { key: 'account',        icon: 'user', route: 'account' },
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
        b.innerHTML = '<span class="sidenav-item-icon">' + iconHtml + '</span>' +
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
      '<div style="width:40px;height:40px;border-radius:var(--r-sm);background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">PC</div>' +
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
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span>You are offline — changes will sync when you reconnect</span>';
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
      const cur = PCD.router.currentView();
      const search = document.querySelector('#recipeSearch, #ingSearch, input[type=search]');
      if (search) {
        search.focus();
      } else {
        PCD.router.go('recipes');
        setTimeout(function () {
          const s = document.querySelector('#recipeSearch, input[type=search]');
          if (s) s.focus();
        }, 200);
      }
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

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
