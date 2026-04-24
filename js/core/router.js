/* ================================================================
   ProChefDesk — router.js (v1.4 simplified)
   Modals no longer push history entries — fixes chained close bugs.
   Back button: close modal if open, else pop view.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const routes = {};
  let currentView = null;
  let viewParams = null;

  const router = {
    register: function (name, renderFn) { routes[name] = renderFn; },

    start: function () {
      history.replaceState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname);

      window.addEventListener('popstate', function (e) {
        if (PCD.modal && PCD.modal.isOpen()) {
          PCD.modal.closeTop();
          history.pushState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname);
          return;
        }
        if (PCD.tutorial && PCD.tutorial.isOpen()) {
          PCD.tutorial.close();
          history.pushState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname);
          return;
        }
        const s = e.state;
        if (s && s.type === 'view' && s.name) {
          router._renderView(s.name, s.params || null, { skipHistory: true });
          return;
        }
        router._renderView('dashboard', null, { skipHistory: true });
        history.pushState({ type: 'view', name: 'dashboard' }, '', window.location.pathname);
      });
    },

    go: function (name, params, opts) {
      opts = opts || {};
      if (!routes[name]) { PCD.warn('No route:', name); return; }
      if (PCD.modal && PCD.modal.isOpen()) PCD.modal.closeAll();
      router._renderView(name, params, opts);
      if (!opts.skipHistory) {
        history.pushState({ type: 'view', name: name, params: params || null }, '', window.location.pathname);
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
