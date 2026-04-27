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
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Chef profile</div>
          <div class="card">
            <div class="card-body" style="padding:14px;">
              <div class="text-muted text-sm mb-3">Personalize your workspace. This information will appear on printed recipes, menus, and event sheets — and on your public profile when sharing recipes with the chef community.</div>
              <div class="field">
                <label class="field-label">Full name</label>
                <input type="text" class="input" id="chefName" value="${PCD.escapeHtml(user.name || '')}" placeholder="e.g. Ahmet Kayas">
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">Title / role</label>
                  <select class="select" id="chefRole">
                    <option value="">— select —</option>
                    ${['Head Chef','Executive Chef','Sous Chef','Chef de Cuisine','Chef de Partie','Pastry Chef','Private Chef','Catering Chef','Culinary Student','Kitchen Owner','Other'].map(function(r){
                      return '<option value="'+r+'"'+((user.role===r)?' selected':'')+'>'+r+'</option>';
                    }).join('')}
                  </select>
                </div>
                <div class="field">
                  <label class="field-label">Country</label>
                  <input type="text" class="input" id="chefCountry" value="${PCD.escapeHtml(user.country || '')}" placeholder="e.g. Australia">
                </div>
              </div>
              <div class="field">
                <label class="field-label">Workplace (restaurant / hotel / private)</label>
                <input type="text" class="input" id="chefWorkplace" value="${PCD.escapeHtml(user.workplace || '')}" placeholder="e.g. Crown Towers, Perth">
              </div>
              <div class="field">
                <label class="field-label">Bio</label>
                <textarea class="textarea" id="chefBio" rows="3" placeholder="${PCD.escapeHtml(t('placeholder_chef_bio'))}">${PCD.escapeHtml(user.bio || '')}</textarea>
                <div class="field-hint">Will be visible on your public profile when community sharing launches.</div>
              </div>
              <button class="btn btn-primary btn-sm" id="saveChefProfileBtn" style="margin-top:6px;">${PCD.icon('check', 14)} Save profile</button>
              <button class="btn btn-outline btn-sm" id="previewChefProfileBtn" style="margin-top:6px;margin-inline-start:6px;">${PCD.icon('user', 14)} <span>Preview public profile</span></button>
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
                <div style="font-weight:600;">Export Recipes (CSV)</div>
                <div class="text-muted text-sm">For spreadsheet / accounting</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="exportIngredientsBtn">
              <div>
                <div style="font-weight:600;">Export Ingredients (CSV)</div>
                <div class="text-muted text-sm">Price list / inventory</div>
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
            <button type="button" class="tappable" id="reportIssueBtn" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;color:inherit;cursor:pointer;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:600;">🐛 ${t('report_issue_title')}</div>
                <div class="text-muted text-sm">${t('report_issue_subtitle')}</div>
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

      <!-- LEGAL LINKS -->
      <div class="section">
        <div class="text-center" style="padding:8px 0 0;">
          <a href="/privacy.html" target="_blank" rel="noopener" style="color:var(--text-3);font-size:13px;text-decoration:none;margin:0 10px;">${t('legal_privacy')}</a>
          <span style="color:var(--text-3);">·</span>
          <a href="/terms.html" target="_blank" rel="noopener" style="color:var(--text-3);font-size:13px;text-decoration:none;margin:0 10px;">${t('legal_terms')}</a>
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
        title: t('sign_out'), text: t('confirm_sign_out_title'),
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
      PCD.toast.success(t('toast_profile_saved'));
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
        const reader = new FileReader();
        reader.onload = function (evt) {
          try {
            const parsed = JSON.parse(evt.target.result);
            const data = parsed.data || parsed;
            PCD.modal.confirm({
              icon: '⚠️', iconKind: 'warning', danger: true,
              title: t('confirm_import_replace_title'),
              text: t('confirm_restore_text'),
              okText: t('confirm_replace_everything')
            }).then(function (ok) {
              if (!ok) return;
              // Merge restore — replace top-level keys
              Object.keys(data).forEach(function (k) {
                if (k !== '_meta') PCD.store.set(k, data[k]);
              });
              PCD.toast.success(t('backup_restored_reloading'));
              setTimeout(function () { window.location.reload(); }, 800);
            });
          } catch (err) {
            PCD.toast.error(t('invalid_backup_file', { err: err.message }));
          }
        };
        reader.readAsText(f);
      };
      inp.click();
    });

    const expRec = PCD.$('#exportRecipesBtn', view);
    if (expRec) expRec.addEventListener('click', function () {
      const recipes = PCD.store.listRecipes();
      if (!recipes.length) { PCD.toast.info(t('toast_no_recipes_to_export')); return; }
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
      PCD.toast.success(t('recipes_exported', { n: recipes.length }));
    });

    const expIng = PCD.$('#exportIngredientsBtn', view);
    if (expIng) expIng.addEventListener('click', function () {
      const ings = PCD.store.listIngredients();
      if (!ings.length) { PCD.toast.info(t('toast_no_ingredients_to_export')); return; }
      const rows = [['Name', 'Price', 'Unit', 'Category', 'Supplier']];
      ings.forEach(function (i) {
        rows.push([i.name, i.pricePerUnit || 0, i.unit || '', i.category || '', i.supplier || '']);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      PCD.download(csv, 'ingredients-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
      PCD.toast.success(t('ingredients_exported', { n: ings.length }));
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
        PCD.toast.info(t('toast_tour_unavailable'));
      }
    });
    const reportIssueBtn = PCD.$('#reportIssueBtn', view);
    if (reportIssueBtn) reportIssueBtn.addEventListener('click', openReportIssueModal);
  }

  // ============ REPORT ISSUE MODAL ============
  function openReportIssueModal() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="text-muted text-sm mb-3">' + PCD.escapeHtml(t('report_issue_intro')) + '</div>' +
      '<div class="field mb-3">' +
        '<label class="field-label">' + PCD.escapeHtml(t('report_issue_subject_label')) + '</label>' +
        '<input type="text" class="input" id="reportSubject" placeholder="' + PCD.escapeHtml(t('report_issue_subject_placeholder')) + '" maxlength="120">' +
      '</div>' +
      '<div class="field mb-3">' +
        '<label class="field-label">' + PCD.escapeHtml(t('report_issue_description_label')) + '</label>' +
        '<textarea class="textarea" id="reportDescription" rows="6" placeholder="' + PCD.escapeHtml(t('report_issue_description_placeholder')) + '" maxlength="2000"></textarea>' +
      '</div>' +
      '<div class="text-muted" style="font-size:11px;line-height:1.5;padding:10px 12px;background:var(--surface-2);border-radius:6px;">' +
        '<strong>' + PCD.escapeHtml(t('report_issue_auto_info_title')) + ':</strong> ' +
        PCD.escapeHtml(t('report_issue_auto_info')) +
      '</div>';

    const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('btn_cancel_action') });
    const sendBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary' });
    sendBtn.innerHTML = PCD.icon('mail', 14) + ' <span>' + PCD.escapeHtml(t('report_issue_send_btn')) + '</span>';

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    cancelBtn.style.flex = '1';
    sendBtn.style.flex = '2';
    footer.appendChild(cancelBtn);
    footer.appendChild(sendBtn);

    const m = PCD.modal.open({
      title: '🐛 ' + t('report_issue_title'),
      body: body, footer: footer, size: 'md', closable: true
    });
    cancelBtn.addEventListener('click', function () { m.close(); });
    sendBtn.addEventListener('click', function () {
      const subj = (PCD.$('#reportSubject', body).value || '').trim();
      const desc = (PCD.$('#reportDescription', body).value || '').trim();
      if (!subj) { PCD.toast.error(t('toast_name_required')); return; }
      if (!desc) { PCD.toast.error(t('report_issue_description_required')); return; }

      // Auto-collect technical info
      const user = PCD.store.get('user') || {};
      const techInfo =
        '\n\n---\n' +
        'Technical info (auto-included):\n' +
        '• Version: ' + (PCD_CONFIG.APP_VERSION || 'unknown') + '\n' +
        '• Browser: ' + navigator.userAgent + '\n' +
        '• Page: ' + (location.hash || location.pathname || '/') + '\n' +
        '• Locale: ' + (PCD.i18n.currentLocale || 'unknown') + '\n' +
        '• User: ' + (user.email || 'not signed in') + '\n' +
        '• Time: ' + new Date().toISOString();

      const mailtoUrl = 'mailto:hello@prochefdesk.com' +
        '?subject=' + encodeURIComponent('[ProChefDesk Issue] ' + subj) +
        '&body=' + encodeURIComponent(desc + techInfo);

      window.location.href = mailtoUrl;
      m.close();
      PCD.toast.success(t('report_issue_sent'));
    });
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

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: 'Close', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: t('modal_public_profile_preview'), body: body, footer: footer, size: 'md', closable: true });
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
            '<button type="button" class="btn btn-outline btn-sm" data-restore="' + it.table + '|' + it.id + '" title="' + PCD.escapeHtml(t('btn_restore_action')) + '">↶</button>' +
            '<button type="button" class="icon-btn" data-purge="' + it.table + '|' + it.id + '" title="' + PCD.escapeHtml(t('btn_delete_forever')) + '" style="color:var(--danger);">' + PCD.icon('trash', 14) + '</button>' +
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
        PCD.toast.error(t('toast_restore_failed'));
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
