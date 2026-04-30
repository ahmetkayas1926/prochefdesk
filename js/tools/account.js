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

      ${user ? `
        <!-- CHEF PROFILE -->
        <div class="section mb-3">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('chef_profile_title')}</div>
          <div class="card">
            <div class="card-body" style="padding:14px;">
              <div class="text-muted text-sm mb-3">${t('chef_profile_intro')}</div>
              <div class="field">
                <label class="field-label">${t('chef_full_name')}</label>
                <input type="text" class="input" id="chefName" value="${PCD.escapeHtml(user.name || '')}" placeholder="${PCD.escapeHtml(t('chef_full_name_placeholder'))}">
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">${t('chef_title_role')}</label>
                  <select class="select" id="chefRole">
                    <option value="">${t('chef_select')}</option>
                    ${['Head Chef','Executive Chef','Sous Chef','Chef de Cuisine','Chef de Partie','Pastry Chef','Private Chef','Catering Chef','Culinary Student','Kitchen Owner','Other'].map(function(r){
                      return '<option value="'+r+'"'+((user.role===r)?' selected':'')+'>'+r+'</option>';
                    }).join('')}
                  </select>
                </div>
                <div class="field">
                  <label class="field-label">${t('chef_country')}</label>
                  <input type="text" class="input" id="chefCountry" value="${PCD.escapeHtml(user.country || '')}" placeholder="${PCD.escapeHtml(t('chef_country_placeholder'))}">
                </div>
              </div>
              <div class="field">
                <label class="field-label">${t('chef_workplace')}</label>
                <input type="text" class="input" id="chefWorkplace" value="${PCD.escapeHtml(user.workplace || '')}" placeholder="${PCD.escapeHtml(t('chef_workplace_placeholder'))}">
              </div>
              <div class="field">
                <label class="field-label">${t('chef_bio')}</label>
                <textarea class="textarea" id="chefBio" rows="3" placeholder="${PCD.escapeHtml(t('chef_bio_placeholder'))}">${PCD.escapeHtml(user.bio || '')}</textarea>
                <div class="field-hint">${t('chef_bio_hint')}</div>
              </div>
              <button class="btn btn-primary btn-sm" id="saveChefProfileBtn" style="margin-top:6px;">${PCD.icon('check', 14)} ${t('chef_save_profile')}</button>
              <button class="btn btn-outline btn-sm" id="previewChefProfileBtn" style="margin-top:6px;margin-inline-start:6px;">${PCD.icon('user', 14)} <span>${t('chef_preview_public')}</span></button>
            </div>
          </div>
        </div>
      ` : ''}

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
            <div class="flex items-center justify-between" style="padding:14px 16px;border-bottom:1px solid var(--border);">
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
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="trashBtn">
              <div>
                <div style="font-weight:600;">🗑 ${t('trash_title')}</div>
                <div class="text-muted text-sm" id="trashCount">${t('trash_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="exportDataBtn">
              <div>
                <div style="font-weight:600;">📥 ${t('backup_download')}</div>
                <div class="text-muted text-sm">${t('backup_download_desc')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="importDataBtn">
              <div>
                <div style="font-weight:600;">📤 ${t('backup_restore')}</div>
                <div class="text-muted text-sm">${t('backup_restore_desc')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="exportRecipesBtn">
              <div>
                <div style="font-weight:600;">${t('export_recipes')}</div>
                <div class="text-muted text-sm">${t('export_recipes_desc')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="exportIngredientsBtn">
              <div>
                <div style="font-weight:600;">${t('export_ingredients')}</div>
                <div class="text-muted text-sm">${t('export_ingredients_desc')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="demoToggleBtn">
              <div>
                <div style="font-weight:600;">${PCD.store.get('onboarding.demoSeeded') ? t('clear_demo') : t('reset_demo')}</div>
                <div class="text-muted text-sm">${t('demo_3_recipes')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;color:var(--danger);" id="clearAllBtn">
              <div>
                <div style="font-weight:600;">${t('clear_all_data')}</div>
                <div style="color:var(--text-3);font-size:13px;">${t('irreversible')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- HELP & ABOUT -->
      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('help_section_title')}</div>
        <div class="card">
          <div class="card-body" style="padding:0;">
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="aboutBtn">
              <div>
                <div style="font-weight:600;">ℹ️ ${t('about_title')}</div>
                <div class="text-muted text-sm">${t('about_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="faqBtn">
              <div>
                <div style="font-weight:600;">❓ ${t('faq_title')}</div>
                <div class="text-muted text-sm">${t('faq_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="restartTourBtn">
              <div>
                <div style="font-weight:600;">🎓 ${t('restart_tour_title')}</div>
                <div class="text-muted text-sm">${t('restart_tour_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="reportIssueBtn">
              <div>
                <div style="font-weight:600;">🐛 ${t('report_issue_card_title')}</div>
                <div class="text-muted text-sm">${t('report_issue_card_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <a href="mailto:hello@prochefdesk.com?subject=ProChefDesk Feedback" class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;text-decoration:none;color:inherit;">
              <div>
                <div style="font-weight:600;">✉️ ${t('feedback_title')}</div>
                <div class="text-muted text-sm">${t('feedback_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>
        </div>
      </div>

      <!-- LEGAL -->
      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('legal_section_title')}</div>
        <div class="card">
          <div class="card-body" style="padding:0;">
            <a href="privacy.html" target="_blank" rel="noopener" class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;text-decoration:none;color:inherit;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:600;">🔒 ${t('legal_privacy')}</div>
                <div class="text-muted text-sm">${t('legal_privacy_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <a href="terms.html" target="_blank" rel="noopener" class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;text-decoration:none;color:inherit;">
              <div>
                <div style="font-weight:600;">📄 ${t('legal_terms')}</div>
                <div class="text-muted text-sm">${t('legal_terms_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>
        </div>
      </div>

      <!-- SHARED ITEMS -->
      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('shared_items_section_title')}</div>
        <div class="card">
          <div class="card-body" style="padding:0;">
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;" id="sharedItemsBtn">
              <div>
                <div style="font-weight:600;">🔗 ${t('shared_items_card_title')}</div>
                <div class="text-muted text-sm">${t('shared_items_card_subtitle')}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      ${user ? `
        <!-- DANGER ZONE (v2.6.60) — Account deletion / GDPR -->
        <div class="section">
          <div class="section-title" style="font-size:13px;color:var(--danger);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('danger_zone_title')}</div>
          <div class="card" style="border-color:rgba(220,38,38,0.3);">
            <div class="card-body" style="padding:0;">
              <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;color:var(--danger);" id="deleteAccountBtn">
                <div>
                  <div style="font-weight:600;">🗑️ ${t('delete_account_title')}</div>
                  <div class="text-muted text-sm" style="color:var(--text-3);">${t('delete_account_subtitle')}</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- ABOUT -->
      <div class="section">
        <div class="text-center text-muted text-sm" style="padding:16px 0;">
          <div><strong>${t('app_name')}</strong> · ${t('app_tagline')}</div>
          <div class="mt-1">${t('version')} ${PCD_CONFIG.APP_VERSION}</div>
        </div>
      </div>
    `;

    // v2.6.60 — Account deletion flow (GDPR-compliant)
    const deleteAccountBtn = PCD.$('#deleteAccountBtn', view);
    if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', openDeleteAccountModal);

    const signInBtn = PCD.$('#signInBtn', view);
    if (signInBtn) signInBtn.addEventListener('click', function () { PCD.auth.openAuthModal(); });
    const signOutBtn = PCD.$('#signOutBtn', view);
    if (signOutBtn) signOutBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '👋', iconKind: 'info',
        title: t('sign_out'), text: t('sign_out_confirm'),
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

    const saveChefBtn = PCD.$('#saveChefProfileBtn', view);
    if (saveChefBtn) saveChefBtn.addEventListener('click', function () {
      const u = PCD.store.get('user') || {};
      u.name = (PCD.$('#chefName', view).value || '').trim();
      u.role = PCD.$('#chefRole', view).value;
      u.country = (PCD.$('#chefCountry', view).value || '').trim();
      u.workplace = (PCD.$('#chefWorkplace', view).value || '').trim();
      u.bio = (PCD.$('#chefBio', view).value || '').trim();
      PCD.store.set('user', u);
      PCD.toast.success(PCD.i18n.t('toast_profile_saved'));
    });
    const previewChefBtn = PCD.$('#previewChefProfileBtn', view);
    if (previewChefBtn) previewChefBtn.addEventListener('click', function () {
      // Save first to capture latest values
      const u = PCD.store.get('user') || {};
      u.name = (PCD.$('#chefName', view).value || '').trim();
      u.role = PCD.$('#chefRole', view).value;
      u.country = (PCD.$('#chefCountry', view).value || '').trim();
      u.workplace = (PCD.$('#chefWorkplace', view).value || '').trim();
      u.bio = (PCD.$('#chefBio', view).value || '').trim();
      PCD.store.set('user', u);
      openPublicProfilePreview(u);
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
      PCD.toast.success('✓ ' + t('backup_downloaded'));
    });

    // Trash button
    const trashBtn = PCD.$('#trashBtn', view);
    if (trashBtn) {
      // Update count
      const trashItems = PCD.store.listTrash ? PCD.store.listTrash() : [];
      const countEl = PCD.$('#trashCount', view);
      if (countEl) {
        if (trashItems.length === 0) {
          countEl.textContent = t('trash_empty');
        } else {
          countEl.textContent = t('trash_count').replace('{n}', trashItems.length);
        }
      }
      trashBtn.addEventListener('click', function () { openTrashModal(); });
    }

    const importBtn = PCD.$('#importDataBtn', view);
    if (importBtn) importBtn.addEventListener('click', function () {
      // File picker
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.size > 50 * 1024 * 1024) {
          PCD.toast.error(t('backup_restore_too_large') || 'Backup file too large (>50MB)');
          return;
        }
        const reader = new FileReader();
        reader.onload = function (evt) {
          let parsed, data;
          try {
            parsed = JSON.parse(evt.target.result);
            data = parsed.data || parsed;
          } catch (err) {
            PCD.toast.error(PCD.i18n.t('toast_invalid_backup', { msg: err.message }));
            return;
          }

          // v2.6.57 — Validate schema before restoring
          const validation = validateBackup(data, parsed);
          if (!validation.valid) {
            PCD.toast.error(t('backup_restore_invalid_schema', { msg: validation.error }) ||
                            'Invalid backup: ' + validation.error);
            return;
          }

          // Build a preview summary so the chef knows what's about to be restored
          const summary = buildBackupSummary(data);
          const versionInfo = parsed.version ? '<div class="text-muted" style="font-size:11px;margin-bottom:8px;">' +
            t('backup_restore_meta', { version: PCD.escapeHtml(parsed.version), date: parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : '?' }) +
            '</div>' : '';
          const previewHtml = versionInfo +
            '<div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:12px;">' +
              t('backup_restore_preview_intro', 'This backup contains:') +
            '</div>' +
            '<div style="background:var(--surface-2);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:14px;font-size:13px;">' +
              summary.lines.map(function (l) { return '<div>· ' + l + '</div>'; }).join('') +
            '</div>' +
            '<div style="background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:var(--r-sm);font-size:12px;line-height:1.5;">' +
              '⚠️ ' + t('backup_restore_warning', 'Restoring will OVERWRITE your current workspaces, recipes, ingredients and other data. Make a fresh backup of the current state first if you might want to come back.') +
            '</div>';

          // v2.6.57 — Custom modal (instead of confirm) so the HTML
          // preview block renders properly. confirm() uses textContent
          // for the message which would show raw HTML.
          const previewBody = PCD.el('div');
          previewBody.innerHTML = previewHtml;
          const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel'), style: { flex: '1' } });
          const restoreBtn = PCD.el('button', { type: 'button', class: 'btn btn-danger', text: t('backup_restore_ok'), style: { flex: '1' } });
          const previewFooter = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
          previewFooter.appendChild(cancelBtn);
          previewFooter.appendChild(restoreBtn);
          const previewModal = PCD.modal.open({
            title: '⚠️ ' + t('backup_restore_title'),
            body: previewBody,
            footer: previewFooter,
            size: 'md',
            closable: true,
          });
          cancelBtn.addEventListener('click', function () { previewModal.close(); });
          restoreBtn.addEventListener('click', function () {
            // Replace top-level keys, but skip dangerous ones
            const SKIP = ['_meta', 'user', '_deletedWorkspaces'];
            Object.keys(data).forEach(function (k) {
              if (SKIP.indexOf(k) >= 0) return;
              PCD.store.set(k, data[k]);
            });
            previewModal.close();
            PCD.toast.success(PCD.i18n.t('toast_backup_restored'));
            setTimeout(function () { window.location.reload(); }, 800);
          });
        };
        reader.readAsText(f);
      };
      inp.click();
    });

    // v2.6.57 — Validate that the parsed JSON looks like a PCD backup.
    // Checks for at least one expected top-level key + sane shapes.
    function validateBackup(data, raw) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { valid: false, error: 'Top-level must be an object' };
      }
      // Required: at least ONE of the expected keys must be present
      const EXPECTED = ['recipes','ingredients','menus','events','suppliers','inventory','waste','workspaces','prefs','canvases','shoppingLists','checklistTemplates','checklistSessions','stockCountHistory'];
      const hasAny = EXPECTED.some(function (k) { return Object.prototype.hasOwnProperty.call(data, k); });
      if (!hasAny) {
        return { valid: false, error: 'Missing all expected fields (recipes, ingredients, ...)' };
      }
      // Recipes/menus/events should be objects (key-value), not arrays or strings
      if (data.recipes !== undefined && (typeof data.recipes !== 'object' || Array.isArray(data.recipes))) {
        return { valid: false, error: 'recipes field has wrong shape' };
      }
      if (data.workspaces !== undefined && (typeof data.workspaces !== 'object' || Array.isArray(data.workspaces))) {
        return { valid: false, error: 'workspaces field has wrong shape' };
      }
      return { valid: true };
    }

    // v2.6.57 — Build a short human-readable preview of backup contents.
    function buildBackupSummary(data) {
      const lines = [];
      function countDeep(obj) {
        // For workspace-scoped data: { wsId: { id: {...} } } — count inner items across all wsIds
        if (!obj || typeof obj !== 'object') return 0;
        if (Array.isArray(obj)) return obj.length;
        let total = 0;
        Object.values(obj).forEach(function (v) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            // Could be a record (has id) OR a wsId map of records
            if (v.id) total += 1;
            else total += Object.keys(v).length;
          }
        });
        return total;
      }
      const T = PCD.i18n.t;
      if (data.workspaces) lines.push(Object.keys(data.workspaces).length + ' ' + T('backup_summary_workspaces', 'workspace(s)'));
      if (data.recipes) lines.push(countDeep(data.recipes) + ' ' + T('backup_summary_recipes', 'recipe(s)'));
      if (data.ingredients) lines.push(countDeep(data.ingredients) + ' ' + T('backup_summary_ingredients', 'ingredient(s)'));
      if (data.menus) lines.push(countDeep(data.menus) + ' ' + T('backup_summary_menus', 'menu(s)'));
      if (data.events) lines.push(countDeep(data.events) + ' ' + T('backup_summary_events', 'event(s)'));
      if (data.suppliers) lines.push(countDeep(data.suppliers) + ' ' + T('backup_summary_suppliers', 'supplier(s)'));
      if (data.checklistTemplates) lines.push(countDeep(data.checklistTemplates) + ' ' + T('backup_summary_checklists', 'checklist template(s)'));
      if (data.canvases) lines.push(countDeep(data.canvases) + ' ' + T('backup_summary_canvases', 'kitchen card(s)'));
      if (lines.length === 0) lines.push(T('backup_summary_empty', '(metadata only — no recipes or workspaces)'));
      return { lines: lines };
    }

    const expRec = PCD.$('#exportRecipesBtn', view);
    if (expRec) expRec.addEventListener('click', function () {
      const recipes = PCD.store.listRecipes();
      if (!recipes.length) { PCD.toast.info(PCD.i18n.t('toast_no_recipes_to_export')); return; }
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const rows = [['Name', 'Category', 'Servings', 'Food Cost', 'Cost/Serving', 'Sale Price', 'Food Cost %', 'Prep Time', 'Cook Time', 'Ingredients']];
      recipes.forEach(function (r) {
        const cost = PCD.recipes.computeFoodCost(r, ingMap);
        const cps = (r.servings ? cost / r.servings : cost);
        const fcp = (r.salePrice && r.salePrice > 0) ? ((cps / r.salePrice) * 100) : '';
        const ingList = (r.ingredients || []).map(function (ri) {
          const ing = ingMap[ri.ingredientId];
          return (ing ? ing.name : '(removed)') + ':' + PCD.fmtNumber(ri.amount) + (ri.unit || '');
        }).join('; ');
        rows.push([r.name, r.category || '', r.servings || '', cost.toFixed(2), cps.toFixed(2), r.salePrice || '', fcp ? fcp.toFixed(1) : '', r.prepTime || '', r.cookTime || '', ingList]);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      PCD.download(csv, 'recipes-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
      PCD.toast.success(PCD.i18n.t('toast_recipes_exported_n', { n: recipes.length }));
    });

    const expIng = PCD.$('#exportIngredientsBtn', view);
    if (expIng) expIng.addEventListener('click', function () {
      const ings = PCD.store.listIngredients();
      if (!ings.length) { PCD.toast.info(PCD.i18n.t('toast_no_ingredients_to_export')); return; }
      const rows = [['Name', 'Price', 'Unit', 'Category', 'Supplier']];
      ings.forEach(function (i) {
        rows.push([i.name, i.pricePerUnit || 0, i.unit || '', i.category || '', i.supplier || '']);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      PCD.download(csv, 'ingredients-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
      PCD.toast.success(PCD.i18n.t('toast_ingredients_exported_n', { n: ings.length }));
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
        title: t('clear_all_title'),
        text: t('clear_all_text'),
        okText: t('clear_all_btn'),
        cancelText: t('cancel')
      }).then(function (ok) {
        if (!ok) return;

        PCD.store.reset();

        const doReload = function () {
          PCD.toast.success('✓ ' + t('clear_all_done'));
          setTimeout(function () { window.location.reload(); }, 500);
        };
        if (PCD.cloud && typeof PCD.cloud.pushNow === 'function') {
          PCD.cloud.pushNow().then(doReload).catch(doReload);
        } else {
          doReload();
        }
      });
    });

    // Help & About
    const aboutBtn = PCD.$('#aboutBtn', view);
    if (aboutBtn) aboutBtn.addEventListener('click', openAboutModal);
    const faqBtn = PCD.$('#faqBtn', view);
    if (faqBtn) faqBtn.addEventListener('click', openFaqModal);
    const restartTourBtn = PCD.$('#restartTourBtn', view);
    if (restartTourBtn) restartTourBtn.addEventListener('click', function () {
      if (PCD.tutorial && PCD.tutorial.startMainTour) {
        PCD.tutorial.startMainTour();
      } else {
        PCD.toast.info(PCD.i18n.t('toast_tour_unavailable'));
      }
    });
    const reportIssueBtn = PCD.$('#reportIssueBtn', view);
    if (reportIssueBtn) reportIssueBtn.addEventListener('click', openReportIssueModal);
    const sharedItemsBtn = PCD.$('#sharedItemsBtn', view);
    if (sharedItemsBtn) sharedItemsBtn.addEventListener('click', openSharedItemsModal);
  }

  function openAboutModal() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML =
      '<div style="text-align:center;padding:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border-radius:12px;margin-bottom:16px;">' +
        '<div style="font-size:32px;font-weight:800;color:var(--brand-700);">ProChefDesk</div>' +
        '<div class="text-muted text-sm">' + PCD.escapeHtml(t('about_tagline')) + '</div>' +
        '<div class="text-muted" style="font-size:11px;margin-top:8px;">v' + PCD_CONFIG.APP_VERSION + '</div>' +
      '</div>' +
      '<div style="line-height:1.7;font-size:14px;">' +
        '<p><strong>' + PCD.escapeHtml(t('about_q1')) + '</strong><br>' +
        PCD.escapeHtml(t('about_a1')) + '</p>' +
        '<p><strong>' + PCD.escapeHtml(t('about_q2')) + '</strong><br>' +
        '• ' + PCD.escapeHtml(t('about_a2_l1')) + '<br>' +
        '• ' + PCD.escapeHtml(t('about_a2_l2')) + '<br>' +
        '• ' + PCD.escapeHtml(t('about_a2_l3')) + '<br>' +
        '• ' + PCD.escapeHtml(t('about_a2_l4')) + '</p>' +
        '<p><strong>' + PCD.escapeHtml(t('about_q3')) + '</strong><br>' +
        PCD.escapeHtml(t('about_a3')) + '</p>' +
      '</div>';

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: t('about_title'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  function openFaqModal() {
    const t = PCD.i18n.t;
    const faqs = [
      { q: t('faq_q1'), a: t('faq_a1') },
      { q: t('faq_q2'), a: t('faq_a2') },
      { q: t('faq_q3'), a: t('faq_a3') },
      { q: t('faq_q4'), a: t('faq_a4') },
      { q: t('faq_q5'), a: t('faq_a5') },
      { q: t('faq_q6'), a: t('faq_a6') },
      { q: t('faq_q7'), a: t('faq_a7') },
      { q: t('faq_q8'), a: t('faq_a8') },
    ];
    const body = PCD.el('div');
    body.innerHTML = faqs.map(function (f) {
      return '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;padding:12px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:6px;">' + PCD.escapeHtml(f.q) + '</div>' +
        '<div class="text-muted" style="font-size:13px;line-height:1.6;">' + PCD.escapeHtml(f.a) + '</div>' +
      '</div>';
    }).join('');

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: t('faq_title'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  // Public Web3Forms key — submissions land in hello@prochefdesk.com.
  // Safe to ship in client code (this is a public access key, not a secret).
  const WEB3FORMS_KEY = 'f5039b66-3003-485b-9b72-5fdd9c9abaa1';

  // v2.6.60 — Account deletion flow (GDPR Art. 17 — Right to erasure)
  // Deletes:
  //   1. Recipe photos from Storage bucket (recipe-photos/{userId}/...)
  //   2. Public share rows (public_shares where owner_id = user.id)
  //   3. user_data row (RLS allows DELETE on own rows since v2.6.47)
  //   4. Local state (clearUserData wipes localStorage but keeps prefs)
  // Then signs out. The auth.users row itself stays (Supabase requires
  // admin SDK for that — we email the user how to delete the auth row,
  // or it's delete-on-cascade if the project is configured that way).
  function openDeleteAccountModal() {
    const t = PCD.i18n.t;
    const user = PCD.store.get('user') || {};
    if (!user.id) {
      PCD.toast.error(t('delete_account_signin_required'));
      return;
    }

    // Step 1 modal: educational + email confirmation gate
    const body = PCD.el('div');
    body.innerHTML =
      '<div style="background:#fee2e2;color:#991b1b;padding:12px 14px;border-radius:var(--r-sm);font-size:13px;line-height:1.6;margin-bottom:14px;">' +
        '⚠️ <strong>' + PCD.escapeHtml(t('delete_account_warning_title')) + '</strong><br>' +
        PCD.escapeHtml(t('delete_account_warning_body')) +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:12px;line-height:1.6;">' +
        PCD.escapeHtml(t('delete_account_what_happens')) +
        '<ul style="margin:8px 0 0 22px;padding:0;">' +
          '<li>' + PCD.escapeHtml(t('delete_account_will_delete_state')) + '</li>' +
          '<li>' + PCD.escapeHtml(t('delete_account_will_delete_photos')) + '</li>' +
          '<li>' + PCD.escapeHtml(t('delete_account_will_delete_shares')) + '</li>' +
          '<li>' + PCD.escapeHtml(t('delete_account_will_delete_local')) + '</li>' +
        '</ul>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.6;">' +
        PCD.escapeHtml(t('delete_account_backup_advice')) +
      '</div>' +
      '<div style="margin-bottom:8px;">' +
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('delete_account_email_confirm_label')) + '</label>' +
        '<input id="confirmDeleteEmail" type="email" placeholder="' + PCD.escapeHtml(user.email || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      '<div class="text-muted" style="font-size:11px;line-height:1.5;">' + PCD.escapeHtml(t('delete_account_email_confirm_hint', { email: user.email || '' })) + '</div>';

    const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel'), style: { flex: '1' } });
    const deleteBtn = PCD.el('button', { type: 'button', class: 'btn btn-danger', text: t('delete_account_confirm_btn'), style: { flex: '1' } });
    deleteBtn.disabled = true;
    deleteBtn.style.opacity = '0.55';

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(deleteBtn);

    const m = PCD.modal.open({
      title: '🗑️ ' + t('delete_account_title'),
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });

    // Enable delete button only when typed email matches
    const emailInp = body.querySelector('#confirmDeleteEmail');
    emailInp.addEventListener('input', function () {
      const matches = this.value.trim().toLowerCase() === (user.email || '').toLowerCase();
      deleteBtn.disabled = !matches;
      deleteBtn.style.opacity = matches ? '1' : '0.55';
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    deleteBtn.addEventListener('click', function () {
      // Final hard-confirm
      PCD.modal.confirm({
        icon: '⚠️', iconKind: 'danger', danger: true,
        title: t('delete_account_final_confirm_title'),
        text: t('delete_account_final_confirm_text'),
        okText: t('delete_account_final_confirm_ok'),
        cancelText: t('cancel'),
      }).then(function (ok) {
        if (!ok) return;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<span class="spinner"></span> ' + t('delete_account_in_progress');
        runAccountDeletion(user).then(function (result) {
          m.close();
          if (result.allOk) {
            PCD.toast.success(t('delete_account_success'));
          } else {
            PCD.toast.warning(t('delete_account_partial_success', { details: result.errors.join(', ') }));
          }
          // Sign out + reload (auth.signOut already calls clearUserData)
          setTimeout(function () {
            if (PCD.auth && PCD.auth.signOut) PCD.auth.signOut();
            else location.reload();
          }, 1200);
        }).catch(function (err) {
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = t('delete_account_confirm_btn');
          PCD.toast.error(t('delete_account_failed', { msg: (err && err.message) || err }));
        });
      });
    });
  }

  // v2.6.60 — Run the actual deletion sequence. Best-effort:
  // each step's failure is logged but doesn't block the next step.
  // Returns Promise<{ allOk: boolean, errors: string[] }>.
  function runAccountDeletion(user) {
    return new Promise(function (resolve) {
      const errors = [];
      const supabase = PCD.cloud && PCD.cloud.getClient && PCD.cloud.getClient();
      if (!supabase) {
        // No cloud — just clear local state
        if (PCD.store && PCD.store.clearUserData) PCD.store.clearUserData();
        resolve({ allOk: true, errors: [] });
        return;
      }

      // 1) Delete all recipe photos in user's storage folder
      const deletePhotos = supabase.storage.from('recipe-photos')
        .list(user.id + '/', { limit: 1000 })
        .then(function (res) {
          if (res.error) { errors.push('photo list: ' + res.error.message); return; }
          if (!res.data || !res.data.length) return;
          const paths = res.data.map(function (f) { return user.id + '/' + f.name; });
          return supabase.storage.from('recipe-photos').remove(paths).then(function (rm) {
            if (rm.error) errors.push('photo delete: ' + rm.error.message);
          });
        }).catch(function (e) { errors.push('photo step: ' + (e.message || e)); });

      // 2) Delete all public share rows owned by this user
      const deleteShares = supabase.from('public_shares').delete().eq('owner_id', user.id)
        .then(function (res) { if (res.error) errors.push('shares: ' + res.error.message); })
        .catch(function (e) { errors.push('shares step: ' + (e.message || e)); });

      // 3) Delete user_data row(s)
      const deleteUserData = supabase.from('user_data').delete().eq('user_id', user.id)
        .then(function (res) { if (res.error) errors.push('user_data: ' + res.error.message); })
        .catch(function (e) { errors.push('user_data step: ' + (e.message || e)); });

      // 4) Wipe local storage
      Promise.all([deletePhotos, deleteShares, deleteUserData]).then(function () {
        try {
          if (PCD.store && PCD.store.clearUserData) PCD.store.clearUserData();
        } catch (e) { errors.push('local: ' + (e.message || e)); }
        resolve({ allOk: errors.length === 0, errors: errors });
      });
    });
  }

  function openReportIssueModal() {
    const t = PCD.i18n.t;

    // Pre-fill name and email from the signed-in user when available so
    // the chef doesn't have to type it again.
    const user = (PCD.store && PCD.store.get('user')) || {};
    const prefName = PCD.escapeHtml(user.name || '');
    const prefEmail = PCD.escapeHtml(user.email || '');

    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm" style="margin-bottom:14px;line-height:1.5;">' + PCD.escapeHtml(t('report_issue_intro')) + '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:160px;">' +
          '<label for="reportName" style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('report_issue_name_label')) + '</label>' +
          '<input id="reportName" type="text" maxlength="80" value="' + prefName + '" placeholder="' + PCD.escapeHtml(t('report_issue_name_placeholder')) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1;min-width:160px;">' +
          '<label for="reportEmail" style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('report_issue_email_label')) + '</label>' +
          '<input id="reportEmail" type="email" maxlength="120" value="' + prefEmail + '" placeholder="hello@example.com" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label for="reportSubject" style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('report_issue_subject_label')) + '</label>' +
        '<input id="reportSubject" type="text" maxlength="120" placeholder="' + PCD.escapeHtml(t('report_issue_subject_placeholder')) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label for="reportDesc" style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">' + PCD.escapeHtml(t('report_issue_desc_label')) + '</label>' +
        '<textarea id="reportDesc" rows="6" maxlength="2000" placeholder="' + PCD.escapeHtml(t('report_issue_desc_placeholder')) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-1);font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;"></textarea>' +
      '</div>' +
      '<div class="text-muted" style="font-size:11px;line-height:1.5;padding:8px 10px;background:var(--surface-2);border-radius:6px;">ℹ️ ' + PCD.escapeHtml(t('report_issue_debug_note')) + '</div>';

    const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close'), style: { flex: '1' } });
    const sendBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('report_issue_send'), style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(sendBtn);

    const m = PCD.modal.open({ title: '🐛 ' + t('report_issue_title'), body: body, footer: footer, size: 'md', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });
    sendBtn.addEventListener('click', function () {
      const nameEl = body.querySelector('#reportName');
      const emailEl = body.querySelector('#reportEmail');
      const subjectEl = body.querySelector('#reportSubject');
      const descEl = body.querySelector('#reportDesc');
      const reporterName = (nameEl && nameEl.value || '').trim();
      const reporterEmail = (emailEl && emailEl.value || '').trim();
      const subject = (subjectEl && subjectEl.value || '').trim();
      const desc = (descEl && descEl.value || '').trim();

      if (!reporterName || !reporterEmail || !subject || !desc) {
        PCD.toast.error(t('report_issue_validation'));
        return;
      }
      // Light email shape check (server validates too).
      if (reporterEmail.indexOf('@') < 1 || reporterEmail.indexOf('.') < 0) {
        PCD.toast.error(t('report_issue_email_invalid'));
        return;
      }

      // Build debug block — same data the old mailto version sent.
      const ua = navigator.userAgent || '';
      let browser = 'Unknown';
      if (/Edg\//.test(ua)) browser = 'Edge';
      else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
      else if (/Chrome\//.test(ua)) browser = 'Chrome';
      else if (/Firefox\//.test(ua)) browser = 'Firefox';
      else if (/Safari\//.test(ua)) browser = 'Safari';
      let os = 'Unknown';
      if (/Windows/.test(ua)) os = 'Windows';
      else if (/Android/.test(ua)) os = 'Android';
      else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
      else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
      else if (/Linux/.test(ua)) os = 'Linux';

      const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
      const theme = (document.documentElement.getAttribute('data-theme')) || 'light';
      const screenSize = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0);
      const ts = new Date().toISOString();

      const debugBlock =
        '\n\n---\n' +
        'App version: ' + (window.PCD_CONFIG && PCD_CONFIG.APP_VERSION) + '\n' +
        'Browser: ' + browser + '\n' +
        'OS: ' + os + '\n' +
        'Language: ' + locale + '\n' +
        'Theme: ' + theme + '\n' +
        'Screen: ' + screenSize + '\n' +
        'Timestamp: ' + ts + '\n' +
        'URL: ' + (window.location && window.location.href || '') + '\n' +
        'User ID: ' + (user.id || 'anonymous');

      // Disable button while sending; restore on error.
      sendBtn.disabled = true;
      const origLabel = sendBtn.textContent;
      sendBtn.innerHTML = '<span class="spinner"></span> ' + t('report_issue_sending');

      const payload = {
        access_key: WEB3FORMS_KEY,
        subject: '[ProChefDesk] ' + subject,
        from_name: 'ProChefDesk Issue Reporter',
        name: reporterName,
        email: reporterEmail,
        message: desc + debugBlock,
        // Honeypot (Web3Forms ignores submissions where botcheck != "")
        botcheck: '',
      };

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (result) {
        if (result.ok && result.data && result.data.success) {
          m.close();
          PCD.toast.success(t('report_issue_sent'));
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = origLabel;
          PCD.toast.error(t('report_issue_send_failed'));
          PCD.err && PCD.err('web3forms response', result);
        }
      }).catch(function (err) {
        sendBtn.disabled = false;
        sendBtn.textContent = origLabel;
        PCD.toast.error(t('report_issue_send_failed'));
        PCD.err && PCD.err('web3forms error', err);
      });
    });
  }

  // ============ MY SHARES (v2.5.7) ============
  // Lists every public_share owned by the current user so they can
  // pause, resume, copy URL or delete it. Refreshed each time the
  // modal is opened (no local cache).

  function openSharedItemsModal() {
    const t = PCD.i18n.t;

    if (!PCD.share || !PCD.share.listMyShares) {
      PCD.toast.error(t('share_unavailable'));
      return;
    }
    const user = PCD.store.get('user');
    if (!user || !user.id) {
      PCD.toast.error(t('share_signin_required'));
      return;
    }

    const body = PCD.el('div');
    body.innerHTML = '<div class="text-muted" style="padding:40px 20px;text-align:center;"><div class="spinner" style="margin:0 auto 12px;"></div>' + PCD.escapeHtml(t('share_loading')) + '</div>';

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({
      title: '🔗 ' + t('shared_items_section_title'),
      body: body,
      footer: footer,
      size: 'md',
      closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });

    function reload() {
      PCD.share.listMyShares().then(function (shares) {
        renderSharesList(body, shares, reload);
      }).catch(function (e) {
        body.innerHTML = '<div class="text-muted" style="padding:30px;text-align:center;">' + PCD.escapeHtml(e.message || 'Error') + '</div>';
      });
    }
    reload();
  }

  function renderSharesList(body, shares, reload) {
    const t = PCD.i18n.t;

    if (!shares || shares.length === 0) {
      body.innerHTML =
        '<div class="text-muted" style="padding:48px 20px;text-align:center;line-height:1.6;">' +
          '<div style="font-size:40px;margin-bottom:10px;">🔗</div>' +
          '<div>' + PCD.escapeHtml(t('share_no_shares_yet')) + '</div>' +
        '</div>';
      return;
    }

    body.innerHTML = '';
    shares.forEach(function (share) {
      const card = buildShareCard(share, reload);
      body.appendChild(card);
    });
  }

  function buildShareCard(share, reload) {
    const t = PCD.i18n.t;
    const name = (share.payload && share.payload.name) || '(unnamed)';
    const kindIcon =
      share.kind === 'recipe'      ? '📖' :
      share.kind === 'menu'        ? '🍽' :
      share.kind === 'kitchencard' ? '🗂' : '🔗';
    const kindLabel = t('share_kind_' + share.kind) || share.kind;
    const url = location.origin + location.pathname + '?share=' + share.id;

    const statusColor = share.paused ? 'var(--text-3)' : 'var(--brand-600)';
    const statusText  = share.paused ? '⏸ ' + t('share_paused') : '● ' + t('share_active');

    const card = PCD.el('div', {
      class: 'card',
      style: { padding: '12px 14px', marginBottom: '10px' }
    });

    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">' +
        '<div style="min-width:0;flex:1;">' +
          '<div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + kindIcon + ' ' + PCD.escapeHtml(name) + '</div>' +
          '<div class="text-muted text-sm" style="margin-top:2px;">' + PCD.escapeHtml(kindLabel) + ' · 👁 ' + share.view_count + ' ' + PCD.escapeHtml(t('share_views')) + '</div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:700;color:' + statusColor + ';white-space:nowrap;">' + statusText + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<button class="btn btn-secondary btn-sm" data-act="copy" style="flex:1;min-width:90px;">📋 ' + PCD.escapeHtml(t('share_copy_url')) + '</button>' +
        '<button class="btn btn-secondary btn-sm" data-act="toggle" style="flex:1;min-width:90px;">' +
          (share.paused ? '▶ ' + PCD.escapeHtml(t('share_unpause_btn')) : '⏸ ' + PCD.escapeHtml(t('share_pause_btn'))) +
        '</button>' +
        '<button class="btn btn-secondary btn-sm" data-act="delete" style="flex:0 0 auto;color:#dc2626;">🗑</button>' +
      '</div>';

    card.querySelector('[data-act="copy"]').addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          PCD.toast.success(t('share_url_copied'));
        });
      }
    });

    card.querySelector('[data-act="toggle"]').addEventListener('click', function () {
      const shouldPause = !share.paused;
      PCD.share.setSharePaused(share.id, shouldPause).then(function () {
        PCD.toast.success(shouldPause ? t('share_paused_msg') : t('share_unpaused_msg'));
        reload();
      }).catch(function (e) {
        PCD.toast.error(e.message || 'Error');
      });
    });

    card.querySelector('[data-act="delete"]').addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger',
        title: t('share_delete_confirm_title'),
        text: t('share_delete_confirm_msg'),
        okText: t('share_delete_btn'),
        cancelText: t('cancel'),
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        PCD.share.deleteShare(share.id).then(function () {
          PCD.toast.success(t('share_deleted_msg'));
          reload();
        }).catch(function (e) {
          PCD.toast.error(e.message || 'Error');
        });
      });
    });

    return card;
  }

  // ============ PUBLIC PROFILE PREVIEW ============
  // Shows what other chefs will see when community sharing launches.
  function openPublicProfilePreview(user) {
    const recipes = PCD.store.listRecipes();
    const workspaces = (PCD.store.listWorkspaces && PCD.store.listWorkspaces(true)) || [];
    const initials = (user.name || user.email || '?').split(' ').map(function (s) { return s[0]; }).slice(0, 2).join('').toUpperCase();

    // Public stats
    const totalRecipes = recipes.length;
    let totalAcrossWs = 0;
    if (workspaces.length > 0) {
      // count recipes across all workspaces
      const allR = PCD.store.get('recipes') || {};
      Object.keys(allR).forEach(function (wsId) {
        totalAcrossWs += Object.keys(allR[wsId] || {}).length;
      });
    } else {
      totalAcrossWs = totalRecipes;
    }

    const body = PCD.el('div');
    const conceptList = workspaces.filter(function (w) { return !w.archived; }).map(function (w) {
      return '<span style="display:inline-block;padding:4px 10px;background:var(--brand-50);color:var(--brand-700);border-radius:999px;font-size:12px;font-weight:600;margin:2px;">' +
        PCD.escapeHtml(w.name) + (w.concept ? ' · ' + PCD.escapeHtml(w.concept) : '') +
      '</span>';
    }).join('');

    body.innerHTML =
      '<div style="background:linear-gradient(135deg,var(--brand-600),var(--brand-700));color:#fff;border-radius:12px;padding:32px 20px;text-align:center;margin-bottom:16px;">' +
        '<div style="width:88px;height:88px;border-radius:50%;background:rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;margin-bottom:12px;">' +
          (user.avatar ? '<img src="' + PCD.escapeHtml(user.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : initials) +
        '</div>' +
        '<h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.01em;">' + PCD.escapeHtml(user.name || 'Unnamed Chef') + '</h1>' +
        (user.role ? '<div style="font-size:13px;opacity:0.9;margin-top:4px;font-weight:500;">' + PCD.escapeHtml(user.role) + '</div>' : '') +
        ((user.workplace || user.country) ? '<div style="font-size:12px;opacity:0.8;margin-top:8px;">' +
          (user.workplace ? PCD.escapeHtml(user.workplace) : '') +
          (user.workplace && user.country ? ' · ' : '') +
          (user.country ? PCD.escapeHtml(user.country) : '') +
        '</div>' : '') +
      '</div>' +

      (user.bio ? '<div class="card mb-3" style="padding:16px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">About</div>' +
        '<div style="font-size:14px;line-height:1.6;color:var(--text);">' + PCD.escapeHtml(user.bio) + '</div>' +
      '</div>' : '') +

      '<div class="card mb-3" style="padding:16px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Career stats</div>' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
          '<div><div class="text-muted text-sm">Recipes</div><div style="font-weight:800;font-size:24px;color:var(--brand-700);">' + totalAcrossWs + '</div></div>' +
          '<div><div class="text-muted text-sm">Workspaces</div><div style="font-weight:800;font-size:24px;color:var(--brand-700);">' + workspaces.filter(function (w) { return !w.archived; }).length + '</div></div>' +
        '</div>' +
      '</div>' +

      (conceptList ? '<div class="card mb-3" style="padding:16px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Concepts &amp; Career</div>' +
        '<div>' + conceptList + '</div>' +
      '</div>' : '') +

      '<div style="background:var(--surface-2);padding:14px;border-radius:8px;text-align:center;font-size:13px;color:var(--text-3);">' +
        PCD.icon('users', 16) + ' Community sharing launches in v3.x — your profile, recipe shares, and chef-to-chef ratings will live here.' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: PCD.i18n.t('modal_public_profile_preview'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  // ============ TRASH MODAL ============
  function openTrashModal() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');

    function paint() {
      const items = PCD.store.listTrash ? PCD.store.listTrash() : [];
      if (items.length === 0) {
        body.innerHTML =
          '<div class="empty" style="padding:30px 16px;">' +
            '<div class="empty-icon" style="color:var(--brand-600);">' + PCD.icon('trash', 40) + '</div>' +
            '<div class="empty-title">' + t('trash_empty') + '</div>' +
            '<div class="empty-desc">' + t('trash_empty_desc') + '</div>' +
          '</div>';
        return;
      }

      // Group by table — labels from i18n
      const labels = {
        recipes: { name: t('trash_section_recipes'), icon: 'book-open' },
        ingredients: { name: t('trash_section_ingredients'), icon: 'carrot' },
        menus: { name: t('trash_section_menus'), icon: 'menu' },
        events: { name: t('trash_section_events'), icon: 'calendar' },
        suppliers: { name: t('trash_section_suppliers'), icon: 'truck' },
        canvases: { name: t('trash_section_canvases'), icon: 'id-card' },
        shoppingLists: { name: t('trash_section_shopping'), icon: 'shopping-cart' },
        checklistTemplates: { name: t('trash_section_checklists'), icon: 'check-square' },
      };

      const grouped = {};
      items.forEach(function (it) {
        if (!grouped[it.table]) grouped[it.table] = [];
        grouped[it.table].push(it);
      });

      let html = '<div class="text-muted text-sm mb-3" style="padding:10px 12px;background:var(--surface-2);border-radius:6px;">' +
        t('trash_intro').replace('{n}', items.length) +
      '</div>';

      Object.keys(grouped).forEach(function (table) {
        const lbl = labels[table] || { name: table, icon: 'trash' };
        html += '<div style="margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<span style="color:var(--brand-700);">' + PCD.icon(lbl.icon, 14) + '</span>' +
            '<span style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">' + PCD.escapeHtml(lbl.name) + ' (' + grouped[table].length + ')</span>' +
          '</div>';
        grouped[table].forEach(function (it) {
          const ageDays = Math.floor((Date.now() - new Date(it.deletedAt).getTime()) / 86400000);
          const daysLeft = 30 - ageDays;
          html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(it.label) + '</div>' +
              '<div class="text-muted" style="font-size:11px;">' + PCD.fmtRelTime(it.deletedAt) + ' · ' + t('trash_days_left').replace('{n}', Math.max(0, daysLeft)) + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-outline btn-sm" data-restore="' + it.table + '|' + it.id + '" title="Restore">↶</button>' +
            '<button type="button" class="icon-btn" data-purge="' + it.table + '|' + it.id + '" title="Delete forever" style="color:var(--danger);">' + PCD.icon('trash', 14) + '</button>' +
          '</div>';
        });
        html += '</div>';
      });

      body.innerHTML = html;
    }
    paint();

    PCD.on(body, 'click', '[data-restore]', function () {
      const parts = this.getAttribute('data-restore').split('|');
      if (PCD.store.restoreFromTrash(parts[0], parts[1])) {
        PCD.toast.success('✓ ' + t('trash_restored'));
        paint();
      } else {
        PCD.toast.error(PCD.i18n.t('toast_restore_failed'));
      }
    });
    PCD.on(body, 'click', '[data-purge]', function () {
      const parts = this.getAttribute('data-purge').split('|');
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('trash_purge_confirm'),
        text: t('trash_purge_text'),
        okText: t('trash_purge_btn'),
        cancelText: t('cancel')
      }).then(function (ok) {
        if (!ok) return;
        if (PCD.store.purgeFromTrash(parts[0], parts[1])) {
          PCD.toast.success(t('trash_purged'));
          paint();
        }
      });
    });

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: '🗑 ' + t('trash_title'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.account = { render: render };
})();
