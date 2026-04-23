/* ================================================================
   ProChefDesk — router.js
   Handles view navigation AND modal back-button integration.

   KEY FEATURE: Pressing browser back (or Android back, or iOS/macOS
   swipe-back) closes the top-most modal FIRST before navigating.
   This is the #1 fix for "swipe-back closes the app" issues.

   How: every modal open() pushes a history entry with
   state = { type: 'modal', id }. popstate handler checks the state
   and closes top modal if it was a modal entry.

   View navigation uses a simple in-memory stack keyed by view name.
   We use one history entry per view change.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const routes = {}; // name -> render function
  let currentView = null;
  let viewParams = null;

  const router = {
    // Register a view renderer
    register: function (name, renderFn) {
      routes[name] = renderFn;
    },

    start: function () {
      // Initial entry — replace current history to anchor our SPA
      history.replaceState({ type: 'view', name: currentView || 'dashboard' }, '', window.location.pathname);

      window.addEventListener('popstate', function (e) {
        const s = e.state;
        PCD.log('popstate', s);

        // CASE 1: top-most open modal/tutorial — close it
        if (PCD.modal && PCD.modal.isOpen()) {
          PCD.modal.closeTop({ skipHistory: true });
          return;
        }
        if (PCD.tutorial && PCD.tutorial.isOpen()) {
          PCD.tutorial.close({ skipHistory: true });
          return;
        }

        // CASE 2: we got a view state — render it (without pushing)
        if (s && s.type === 'view' && s.name) {
          router._renderView(s.name, s.params || null, { skipHistory: true });
          return;
        }

        // CASE 3: no state — means user went back past our initial entry.
        // Render dashboard as fallback, don't exit.
        router._renderView('dashboard', null, { skipHistory: true });
        // And push a new entry so next back doesn't exit immediately
        history.pushState({ type: 'view', name: 'dashboard' }, '', window.location.pathname);
      });
    },

    go: function (name, params, opts) {
      opts = opts || {};
      if (!routes[name]) {
        PCD.warn('No route:', name);
        return;
      }
      router._renderView(name, params, opts);
      if (!opts.skipHistory) {
        history.pushState({ type: 'view', name: name, params: params || null }, '', window.location.pathname);
      }
    },

    _renderView: function (name, params, opts) {
      const view = PCD.$('#view');
      if (!view) return;
      currentView = name;
      viewParams = params;

      // Scroll to top
      if (PCD.$('#main')) PCD.$('#main').scrollTop = 0;

      // Clear & render
      PCD.clear(view);
      try {
        routes[name](view, params || {});
      } catch (e) {
        PCD.err('render error for view', name, e);
        view.innerHTML = '<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">' + PCD.escapeHtml(e.message || String(e)) + '</div></div>';
      }
      PCD.i18n.applyAll(view);

      // Update bottom nav active state
      PCD.$$('.bn-item').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-nav') === name);
      });
      // Update sidenav active state
      PCD.$$('.sidenav-item').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-nav') === name);
      });

      // Mark tool as seen & show tooltip if first visit
      if (name !== 'dashboard' && name !== 'tools' && name !== 'account') {
        if (PCD.tutorial && !PCD.store.isToolSeen(name)) {
          setTimeout(function () { PCD.tutorial.showToolTip(name); }, 400);
        }
      }
    },

    currentView: function () { return currentView; },
    params: function () { return viewParams; },

    // Called when a modal opens — pushes a modal-entry so back closes it
    pushModal: function (modalId) {
      history.pushState({ type: 'modal', id: modalId, parentView: currentView }, '', window.location.pathname);
    },

    // Called when a modal closes — removes its history entry
    popModal: function () {
      if (history.state && history.state.type === 'modal') {
        history.back();
      }
    },
  };

  PCD.router = router;
})();
