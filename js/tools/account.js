/* ================================================================
   ProChefDesk — account.js
   Profile, preferences, sync, and data management.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const user = PCD.store.get('user');
    const prefs = PCD.store.get('prefs') || {};
    const meta = PCD.store.get('_meta') || {};
    const plan = PCD.store.get('plan') || 'free';

    const cur = prefs.currency || 'USD';
    const loc = prefs.locale || 'en';
    const theme = prefs.theme || 'light';
    const haptic = prefs.haptic !== false;

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('account_title')}</div>
        </div>
      </div>

      <!-- PROFILE -->
      <div class="card mb-3">
        <div class="card-body">
          ${user ? `
            <div class="flex items-center gap-3">
              <div style="width:52px;height:52px;border-radius:50%;background:var(--brand-100);color:var(--brand-700);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;flex-shrink:0;">
                ${user.avatar ? '<img src="' + PCD.escapeHtml(user.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : (user.name || user.email || '?').charAt(0).toUpperCase()}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:16px;">${PCD.escapeHtml(user.name || user.email)}</div>
                <div class="text-muted text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${PCD.escapeHtml(user.email)}</div>
                <div class="chip chip-${plan === 'pro' ? 'brand' : (plan === 'team' ? 'brand' : '')} mt-1">${t(plan + '_plan')}</div>
              </div>
              <button class="btn btn-outline btn-sm" id="signOutBtn">${t('sign_out')}</button>
            </div>
          ` : `
            <div class="text-center" style="padding:20px 0;">
              <div style="font-size:32px;margin-bottom:8px;">👤</div>
              <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${t('auth_welcome')}</div>
              <div class="text-muted text-sm mb-3">${t('auth_welcome_desc')}</div>
              <button class="btn btn-primary" id="signInBtn">${t('sign_in')}</button>
            </div>
          `}
        </div>
      </div>

      <!-- PREFERENCES -->
      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('preferences')}</div>
        <div class="card">
          <div class="card-body" style="padding:0;">
            <!-- Currency -->
            <div class="flex items-center justify-between" style="padding:14px 16px;border-bottom:1px solid var(--border);">
              <div style="flex:1;">
                <div style="font-weight:600;">${t('currency')}</div>
              </div>
              <select class="select" id="prefCurrency" style="width:auto;min-height:36px;padding:6px 28px 6px 12px;">
                ${(window.PCD_CONFIG.CURRENCIES || []).map(function (c) { return '<option value="' + c.code + '"' + (cur === c.code ? ' selected' : '') + '>' + c.symbol + ' ' + c.code + '</option>'; }).join('')}
              </select>
            </div>
            <!-- Language -->
            <div class="flex items-center justify-between" style="padding:14px 16px;border-bottom:1px solid var(--border);">
              <div style="flex:1;"><div style="font-weight:600;">${t('language')}</div></div>
              <select class="select" id="prefLocale" style="width:auto;min-height:36px;padding:6px 28px 6px 12px;">
                ${(window.PCD_CONFIG.LOCALES || []).map(function (l) { return '<option value="' + l.code + '"' + (loc === l.code ? ' selected' : '') + '>' + l.name + '</option>'; }).join('')}
              </select>
            </div>
            <!-- Theme -->
            <div class="flex items-center justify-between" style="padding:14px 16px;border-bottom:1px solid var(--border);">
              <div style="flex:1;"><div style="font-weight:600;">${t('theme')}</div></div>
              <div class="btn-group">
                <button class="btn${theme === 'light' ? ' active' : ''}" data-theme="light">☀️ ${t('theme_light')}</button>
                <button class="btn${theme === 'dark' ? ' active' : ''}" data-theme="dark">🌙 ${t('theme_dark')}</button>
              </div>
            </div>
            <!-- Haptic -->
            <div class="flex items-center justify-between" style="padding:14px 16px;">
              <div style="flex:1;">
                <div style="font-weight:600;">${t('haptic_feedback')}</div>
                <div class="text-muted text-sm">${PCD.isMobile() ? '' : '(mobile only)'}</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="prefHaptic" ${haptic ? 'checked' : ''}>
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- DATA & SYNC -->
      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('data_and_sync')}</div>
        <div class="card">
          <div class="card-body" style="padding:0;">
            ${user && PCD.cloud.ready ? `
              <div class="flex items-center justify-between" style="padding:14px 16px;border-bottom:1px solid var(--border);">
                <div style="flex:1;">
                  <div style="font-weight:600;">${t('cloud_sync')}</div>
                  <div class="text-muted text-sm">${t('last_synced')}: ${meta.lastSyncAt ? PCD.fmtRelTime(meta.lastSyncAt) : '—'}</div>
                </div>
                <button class="btn btn-outline btn-sm" id="syncNowBtn">${t('sync_now')}</button>
              </div>
            ` : ''}
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="exportDataBtn">
              <div>
                <div style="font-weight:600;">${t('export_data')}</div>
                <div class="text-muted text-sm">JSON file</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="demoToggleBtn">
              <div>
                <div style="font-weight:600;">${PCD.store.get('onboarding.demoSeeded') ? t('clear_demo') : t('reset_demo')}</div>
                <div class="text-muted text-sm">3 sample recipes</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;color:var(--danger);" id="clearAllBtn">
              <div>
                <div style="font-weight:600;">${t('clear_all_data')}</div>
                <div style="color:var(--text-3);font-size:13px;">Irreversible</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ABOUT -->
      <div class="section">
        <div class="text-center text-muted text-sm" style="padding:16px 0;">
          <div><strong>${t('app_name')}</strong> · ${t('app_tagline')}</div>
          <div class="mt-1">${t('version')} ${PCD_CONFIG.APP_VERSION}</div>
        </div>
      </div>
    `;

    // Wire up
    const signInBtn = PCD.$('#signInBtn', view);
    if (signInBtn) signInBtn.addEventListener('click', function () { PCD.auth.openAuthModal(); });
    const signOutBtn = PCD.$('#signOutBtn', view);
    if (signOutBtn) signOutBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '👋', iconKind: 'info',
        title: t('sign_out'), text: 'Sign out?',
        okText: t('sign_out')
      }).then(function (ok) {
        if (!ok) return;
        PCD.auth.signOut().then(function () {
          PCD.toast.success(t('sign_out'));
          render(view);
        });
      });
    });

    PCD.$('#prefCurrency', view).addEventListener('change', function () {
      PCD.store.set('prefs.currency', this.value);
      PCD.toast.success(t('saved'));
      render(view);
    });
    PCD.$('#prefLocale', view).addEventListener('change', function () {
      PCD.i18n.setLocale(this.value);
      render(view);
    });
    PCD.$$('[data-theme]', view).forEach(function (b) {
      b.addEventListener('click', function () {
        const val = this.getAttribute('data-theme');
        PCD.store.set('prefs.theme', val);
        document.documentElement.setAttribute('data-theme', val);
        render(view);
      });
    });
    PCD.$('#prefHaptic', view).addEventListener('change', function () {
      PCD.store.set('prefs.haptic', this.checked);
    });

    const syncBtn = PCD.$('#syncNowBtn', view);
    if (syncBtn) syncBtn.addEventListener('click', function () {
      syncBtn.innerHTML = '<span class="spinner"></span>';
      syncBtn.disabled = true;
      PCD.cloud._doSync();
      setTimeout(function () {
        syncBtn.disabled = false;
        syncBtn.innerHTML = t('sync_now');
        PCD.toast.success(t('saved'));
        render(view);
      }, 800);
    });

    PCD.$('#exportDataBtn', view).addEventListener('click', function () {
      const state = PCD.store.get();
      const payload = {
        exportedAt: new Date().toISOString(),
        version: window.PCD_CONFIG.APP_VERSION,
        data: state
      };
      PCD.download(JSON.stringify(payload, null, 2), 'prochefdesk-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
      PCD.toast.success('Exported');
    });

    PCD.$('#demoToggleBtn', view).addEventListener('click', function () {
      const seeded = PCD.store.get('onboarding.demoSeeded');
      if (seeded) {
        PCD.modal.confirm({
          icon: '🗑', title: t('clear_demo'), text: PCD.i18n.t('confirm_delete_desc'),
          okText: t('delete'), danger: true
        }).then(function (ok) {
          if (!ok) return;
          PCD.demo.remove();
          PCD.toast.success(t('item_deleted'));
          render(view);
        });
      } else {
        PCD.demo.seed();
        PCD.toast.success(t('saved'));
        render(view);
      }
    });

    PCD.$('#clearAllBtn', view).addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '⚠️', iconKind: 'danger', danger: true,
        title: t('clear_all_data'),
        text: 'This will delete ALL recipes, ingredients, and settings permanently.',
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.reset();
        PCD.toast.success(t('item_deleted'));
        setTimeout(function () { window.location.reload(); }, 500);
      });
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.account = { render: render };
})();
