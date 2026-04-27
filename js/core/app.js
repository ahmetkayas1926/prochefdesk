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
      // Service
      PCD.router.register('menus', PCD.tools.menus.render);
      PCD.router.register('kitchen_cards', PCD.tools.kitchenCards.render);
      PCD.router.register('shopping', PCD.tools.shopping.render);
      PCD.router.register('portion', PCD.tools.portion.render);
      // Operations
      PCD.router.register('inventory', PCD.tools.inventory.render);
      PCD.router.register('waste', PCD.tools.waste.render);
      PCD.router.register('suppliers', PCD.tools.suppliers.render);
      PCD.router.register('events', PCD.tools.events.render);
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
      ]},
      { title: 'Library', items: [
        { key: 'recipes',     icon: 'book-open', route: 'recipes' },
        { key: 'ingredients', icon: 'carrot', route: 'ingredients' },
        { key: 'menus',       icon: 'menu', route: 'menus' },
      ]},
      { title: 'Kitchen', items: [
        { key: 'kitchen_cards', icon: 'id-card', route: 'kitchen_cards' },
        { key: 'portion',       icon: 'scale', route: 'portion' },
        { key: 'checklist',     icon: 'check-square', route: 'checklist' },
        { key: 'waste',         icon: 'recycle', route: 'waste' },
      ]},
      { title: 'Sourcing', items: [
        { key: 'inventory', icon: 'package', route: 'inventory' },
        { key: 'suppliers', icon: 'truck', route: 'suppliers' },
        { key: 'shopping',  icon: 'shopping-cart', route: 'shopping' },
      ]},
      { title: 'Catering', items: [
        { key: 'events',  icon: 'calendar', route: 'events' },
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
        b.innerHTML = '<span class="sidenav-item-icon">' + iconHtml + '</span>' +
                      '<span>' + PCD.escapeHtml(label) + '</span>';
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
      '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Active workspaces</div>';
    active.forEach(function (w) {
      const stats = workspaceStats(w.id);
      const isActive = w.id === activeId;
      html += '<div data-pickws="' + w.id + '" role="button" tabindex="0" class="ws-row' + (isActive ? ' active' : '') + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:1.5px solid ' + (isActive ? 'var(--brand-600)' : 'var(--border)') + ';border-radius:var(--r-md);background:' + (isActive ? 'var(--brand-50)' : 'var(--surface)') + ';margin-bottom:6px;cursor:pointer;text-align:start;box-sizing:border-box;">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:' + wsColorHex(w.color) + ';color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon(w.icon || 'chef-hat', 18) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(w.name) + (isActive ? ' <span style="font-size:10px;color:var(--brand-700);font-weight:700;letter-spacing:0.04em;">· ACTIVE</span>' : '') + '</div>' +
          '<div class="text-muted" style="font-size:12px;">' +
            (w.concept ? PCD.escapeHtml(w.concept) + ' · ' : '') +
            stats.recipes + ' recipes · ' + stats.menus + ' menus' +
          '</div>' +
        '</div>' +
        '<button type="button" class="icon-btn" data-edit-ws="' + w.id + '" title="Edit workspace" style="flex-shrink:0;">' + PCD.icon('edit', 16) + '</button>' +
      '</div>';
    });
    html += '</div>';

    if (archived.length > 0) {
      html += '<div style="margin-top:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Archived</div>';
      archived.forEach(function (w) {
        html += '<div data-pickws="' + w.id + '" role="button" tabindex="0" class="ws-row" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);margin-bottom:6px;cursor:pointer;opacity:0.6;text-align:start;box-sizing:border-box;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:var(--text-3);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('archive', 16) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:13px;">' + PCD.escapeHtml(w.name) + '</div>' +
            '<div class="text-muted" style="font-size:11px;">Archived' + (w.concept ? ' · ' + PCD.escapeHtml(w.concept) : '') + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '<button class="btn btn-outline" id="newWsBtn" style="width:100%;margin-top:12px;">' + PCD.icon('plus', 16) + ' <span>New workspace</span></button>';

    body.innerHTML = html;

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: 'Workspaces', body: body, footer: footer, size: 'sm', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-pickws]', function (e) {
      if (e.target.closest('[data-edit-ws]')) return;
      const wsId = this.getAttribute('data-pickws');
      if (wsId === activeId) { m.close(); return; }
      const ws = PCD.store.getWorkspace(wsId);
      if (ws && ws.archived) {
        // Unarchive on switch
        PCD.modal.confirm({
          title: 'Reactivate workspace?',
          text: '"' + ws.name + '" is archived. Reactivate and switch to it?',
          okText: 'Reactivate'
        }).then(function (ok) {
          if (!ok) return;
          PCD.store.archiveWorkspace(wsId, false);
          PCD.store.setActiveWorkspaceId(wsId);
          PCD.toast.success('Switched to ' + ws.name);
          m.close();
          setTimeout(function () { window.location.reload(); }, 400);
        });
        return;
      }
      PCD.store.setActiveWorkspaceId(wsId);
      PCD.toast.success('Switched to ' + (ws ? ws.name : 'workspace'));
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
        '<div class="field"><label class="field-label">Workspace name *</label>' +
        '<input type="text" class="input" id="wsNameInp" value="' + PCD.escapeHtml(data.name || '') + '" placeholder="e.g. La Bella, Crown Banquet, Le Bistro"></div>' +

        '<div class="field-row">' +
          '<div class="field"><label class="field-label">Concept</label>' +
            '<input type="text" class="input" id="wsConcept" value="' + PCD.escapeHtml(data.concept || '') + '" placeholder="e.g. Italian a la carte, Banquet, French bistro"></div>' +
          '<div class="field"><label class="field-label">Your role</label>' +
            '<input type="text" class="input" id="wsRole" value="' + PCD.escapeHtml(data.role || '') + '" placeholder="e.g. Sous Chef, Head Chef"></div>' +
        '</div>' +

        '<div class="field-row">' +
          '<div class="field"><label class="field-label">City / location</label>' +
            '<input type="text" class="input" id="wsCity" value="' + PCD.escapeHtml(data.city || '') + '" placeholder="e.g. Perth, AU"></div>' +
          '<div class="field"><label class="field-label">Period</label>' +
            '<div style="display:flex;gap:6px;">' +
              '<input type="month" class="input" id="wsStart" value="' + PCD.escapeHtml((data.periodStart || '').slice(0, 7)) + '" style="flex:1;">' +
              '<input type="month" class="input" id="wsEnd" value="' + PCD.escapeHtml((data.periodEnd || '').slice(0, 7)) + '" placeholder="ongoing" style="flex:1;">' +
            '</div>' +
            '<div class="field-hint">Leave end blank if you\'re still there</div>' +
          '</div>' +
        '</div>' +

        '<div class="field"><label class="field-label">Color</label>' +
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
      title: existing ? 'Edit workspace' : 'New workspace',
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
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: 'Delete "' + existing.name + '"?',
        text: 'All recipes, menus, events and other data in this workspace will be permanently deleted. Ingredients library will remain. This cannot be undone.',
        okText: 'Delete forever'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteWorkspace(existing.id);
        PCD.toast.success('Workspace deleted');
        m.close();
        setTimeout(function () { window.location.reload(); }, 400);
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

      console.log('[Workspace Save] click fired, data:', JSON.parse(JSON.stringify(data)));

      if (!data.name) {
        try { PCD.toast.error('Name required'); } catch (e) { alert('Name required'); }
        return;
      }

      // STEP 2 — Save to store (this is the only step that MUST succeed)
      let saved = null;
      try {
        if (existing) data.id = existing.id;
        saved = PCD.store.upsertWorkspace(data);
        console.log('[Workspace Save] upsert returned:', saved && saved.id);
      } catch (saveErr) {
        console.error('[Workspace Save] upsert ERROR:', saveErr);
        alert('Save failed: ' + (saveErr.message || saveErr));
        return;
      }
      if (!saved || !saved.id) {
        alert('Save failed — workspace was not created.');
        return;
      }

      const isNew = !existing;

      // STEP 3 — Switch active workspace if new
      try {
        if (isNew) PCD.store.setActiveWorkspaceId(saved.id);
      } catch (e) {
        console.warn('[Workspace Save] setActive failed (non-fatal):', e);
      }

      // STEP 4 — UI cleanup (best effort, but reload will fix anything)
      try { PCD.toast.success('Workspace saved'); } catch (e) {}
      try { m.close(); } catch (e) {}

      // STEP 5 — Push to cloud BEFORE reload (so reload doesn't pull stale state)
      console.log('[Workspace Save] success, pushing to cloud before reload');
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

  // Prevent wheel+ctrl zoom on desktop
  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

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
  let _errorCount = 0;
  let _lastErrorAt = 0;
  window.addEventListener('error', function (e) {
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
      PCD.toast.error('Something went wrong. Try again or refresh.', 3000);
    }
  });

  window.addEventListener('unhandledrejection', function (e) {
    PCD.error && PCD.error('[Promise]', e.reason);
    // Silent for promise rejections — most are network related and already handled
  });

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
