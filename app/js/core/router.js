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
        if (s && s.type === 'view' && s.name) {
          router._renderView(s.name, s.params || null, { skipHistory: true });
          writeHash(s.name);
          return;
        }
        // Fallback: hash if available, else dashboard
        const fromHash = readHash();
        const target = (fromHash && routes[fromHash]) ? fromHash : 'dashboard';
        router._renderView(target, null, { skipHistory: true });
        history.pushState({ type: 'view', name: target }, '', window.location.pathname + '#' + target);
      });
    },

    // Read the route to start with: prefer URL hash so F5 stays in place.
    initialRoute: function () {
      const fromHash = readHash();
      if (fromHash && routes[fromHash]) return fromHash;
      return 'dashboard';
    },

    go: function (name, params, opts) {
      opts = opts || {};
      if (!routes[name]) { PCD.warn('No route:', name); return; }
      if (PCD.modal && PCD.modal.isOpen()) PCD.modal.closeAll();
      router._renderView(name, params, opts);
      writeHash(name);
      if (!opts.skipHistory) {
        history.pushState({ type: 'view', name: name, params: params || null }, '', window.location.pathname + '#' + name);
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
