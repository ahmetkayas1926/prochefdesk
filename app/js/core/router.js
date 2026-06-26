/* ================================================================
   ProChefDesk — router.js (v1.5)
   Modals don't push history entries.
   v2.6.36: URL hash sync — refresh (F5) now keeps the user on the
   same page instead of bouncing back to dashboard.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const routes = {};
  let currentView = null;
  let viewParams = null;

  // v2.8.78 — Lazy tool loader. Tools registered for lazy loading via
  // `router.registerLazy(name, scriptPath, toolGlobalPath)`. On navigation,
  // if the route is unknown but lazy-registered, the script is loaded
  // dynamically (cached promise), then routes[name] is wired and render
  // fires. First navigation to a tool: ~150-300ms extra (network).
  // Subsequent: instant (script cached in browser).
  const lazyRoutes = {};   // { 'recipes': { script: 'js/tools/recipes.js', tool: 'recipes' } }
  const lazyLoading = {};  // { 'recipes': Promise }

  // v2.11.12 — Route parent map: alt route'lara gidilirken parent route'u
  // otomatik history'ye ara adım olarak push eder. Operatör bug: HACCP alt
  // form'undan ← Back basınca bazen HACCP Hub'a iner, bazen direkt Dashboard'a
  // iner (intermittent). Root cause: kullanıcı bazen Hub'tan, bazen sidenav'dan
  // direkt alt form'a gidiyor → history'de Hub adımı yok → back Dashboard'a iner.
  // Fix: alt form'a gidiş sırasında, history mevcut state Hub değilse, Hub'u
  // ara adım push et. Böylece back her zaman Hub'a düşer (her giriş yolundan).
  const ROUTE_PARENTS = {
    haccp_logs:      'haccp',
    haccp_cooling:   'haccp',
    haccp_receiving: 'haccp',
    haccp_holding:   'haccp',
  };

  // v2.11.12 — Helper: push current route to history; if route has a parent
  // (e.g. haccp_logs → haccp), ensure parent is the previous step in history
  // (Back tuşu garanti hub'a iner). Mevcut state zaten parent ise ara adım
  // eklenmez (idempotent — operatör Hub'tan girerse duplicate parent yok).
  function pushHistoryWithParent(name, params) {
    const parent = ROUTE_PARENTS[name];
    if (parent) {
      const cur = history.state;
      if (!cur || cur.type !== 'view' || cur.name !== parent) {
        history.pushState({ type: 'view', name: parent, params: null }, '', window.location.pathname + '#' + parent);
      }
    }
    history.pushState({ type: 'view', name: name, params: params || null }, '', window.location.pathname + '#' + name);
  }

  function loadLazyTool(name) {
    if (lazyLoading[name]) return lazyLoading[name];
    const spec = lazyRoutes[name];
    if (!spec) return Promise.reject(new Error('No lazy route: ' + name));
    lazyLoading[name] = new Promise(function (resolve, reject) {
      const v = (window.PCD_CONFIG && window.PCD_CONFIG.APP_VERSION) || '';
      const s = document.createElement('script');
      s.src = spec.script + (v ? '?v=' + v : '');
      s.onload = function () {
        // Tool registers itself via PCD.tools.<name> on parse.
        // Camel-case lookup mirrors app.js convention.
        const camel = spec.tool.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
        const tool = PCD.tools[spec.tool] || PCD.tools[camel];
        if (tool && typeof tool.render === 'function') {
          routes[name] = tool.render;
          resolve(tool);
        } else {
          reject(new Error('Lazy tool loaded but render fn missing: ' + name));
        }
      };
      s.onerror = function () {
        delete lazyLoading[name];
        reject(new Error('Failed to load tool script: ' + spec.script));
      };
      document.head.appendChild(s);
    });
    return lazyLoading[name];
  }

  // Read the route name from the URL hash (e.g. "#recipes" → "recipes").
  // Returns null if no valid hash route is present.
  function readHash() {
    const h = (window.location.hash || '').replace(/^#\/?/, '').trim();
    if (!h) return null;
    // Strip query string after the route name
    const name = h.split('?')[0].split('/')[0];
    return name || null;
  }

  // Write the current route to the URL hash without triggering a navigation.
  function writeHash(name) {
    if (!name) return;
    const desired = '#' + name;
    if (window.location.hash !== desired) {
      // Use replaceState so we don't add a history entry every render
      try {
        history.replaceState(history.state, '', desired);
      } catch (e) { /* ignore */ }
    }
  }

  const router = {
    register: function (name, renderFn) { routes[name] = renderFn; },

    // v2.8.78 — Lazy register: tool not loaded yet, will be fetched on first nav
    registerLazy: function (name, scriptPath, toolName) {
      lazyRoutes[name] = { script: scriptPath, tool: toolName || name };
    },

    // v2.44.78 — Public: bir aracı navigasyon yapmadan yükle (peer-tool çağrısı için,
    // örn. inventory → suppliers.startOrder). Promise<tool> döner.
    loadLazyTool: loadLazyTool,

    start: function () {
      history.replaceState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname + window.location.hash);

      window.addEventListener('popstate', function (e) {
        if (PCD.modal && PCD.modal.isOpen()) {
          PCD.modal.closeTop();
          history.pushState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname + window.location.hash);
          return;
        }
        if (PCD.tutorial && PCD.tutorial.isOpen()) {
          PCD.tutorial.close();
          history.pushState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname + window.location.hash);
          return;
        }
        const s = e.state;
        // v2.8.78 — Use router.go() instead of _renderView so lazy routes get loaded
        if (s && s.type === 'view' && s.name) {
          router.go(s.name, s.params || null, { skipHistory: true });
          return;
        }
        // Fallback: hash if available, else dashboard
        const fromHash = readHash();
        const target = (fromHash && (routes[fromHash] || lazyRoutes[fromHash])) ? fromHash : 'dashboard';
        router.go(target, null, { skipHistory: true });
      });
    },

    // Read the route to start with: prefer URL hash so F5 stays in place.
    // v2.8.78 — Lazy routes also count as "valid" for initial route resolution.
    initialRoute: function () {
      const fromHash = readHash();
      if (fromHash && (routes[fromHash] || lazyRoutes[fromHash])) return fromHash;
      return 'dashboard';
    },

    go: function (name, params, opts) {
      opts = opts || {};
      // v2.8.78 — Lazy load: if route not registered but lazy-known, fetch then nav
      if (!routes[name] && lazyRoutes[name]) {
        const view = document.getElementById('view');
        // Show subtle loading state while script downloads (~150-300ms first time)
        if (view) view.innerHTML = '<div style="padding:48px;text-align:center;color:var(--text-3);"><div style="font-size:13px;">' + (PCD.i18n && PCD.i18n.t ? PCD.i18n.t('loading') || 'Loading...' : 'Loading...') + '</div></div>';
        loadLazyTool(name).then(function () {
          // Route is now registered, fire navigation
          if (PCD.modal && PCD.modal.isOpen()) PCD.modal.closeAll();
          router._renderView(name, params, opts);
          writeHash(name);
          if (!opts.skipHistory) {
            pushHistoryWithParent(name, params);
          }
        }).catch(function (err) {
          PCD.error && PCD.error('Lazy load failed for', name, err);
          if (view) view.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Could not load this tool</div><div class="empty-desc">Check your connection and try again.</div></div>';
        });
        return;
      }
      if (!routes[name]) { PCD.warn('No route:', name); return; }
      if (PCD.modal && PCD.modal.isOpen()) PCD.modal.closeAll();
      router._renderView(name, params, opts);
      writeHash(name);
      if (!opts.skipHistory) {
        pushHistoryWithParent(name, params);
      }
    },

    _renderView: function (name, params, opts) {
      opts = opts || {};
      currentView = name;
      viewParams = params;
      const view = document.getElementById('view');
      if (!view) return;
      view.innerHTML = '';
      view.scrollTop = 0;
      try { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } catch (e) {}
      try {
        routes[name](view, params);
      } catch (err) {
        PCD.error && PCD.error('Render error for', name, err);
        view.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Something went wrong</div><div class="empty-desc">' + PCD.escapeHtml(err.message || 'Unknown error') + '</div></div>';
      }
      const navEls = document.querySelectorAll('[data-route]');
      navEls.forEach(function (el) {
        if (el.getAttribute('data-route') === name) el.classList.add('active');
        else el.classList.remove('active');
      });
    },

    currentView: function () { return currentView; },
    params: function () { return viewParams; },
    pushModal: function () {},
    popModal: function () {},
  };

  PCD.router = router;
})();
