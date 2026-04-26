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
                <textarea class="textarea" id="chefBio" rows="3" placeholder="A short professional bio — your style, training, signature dishes...">${PCD.escapeHtml(user.bio || '')}</textarea>
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
            <!-- Require approval for stock counts -->
            <div class="flex items-center justify-between" style="padding:14px 16px;">
              <div style="flex:1;">
                <div style="font-weight:600;">Stock count approval</div>
                <div class="text-muted text-sm">Require head chef approval for stock counts</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="prefRequireApproval" ${prefs.requireCountApproval ? 'checked' : ''}>
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
                <div class="text-muted text-sm">Full JSON backup</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="tappable" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;border:0;background:transparent;text-align:start;border-bottom:1px solid var(--border);" id="importDataBtn">
              <div>
                <div style="font-weight:600;">Import Backup</div>
                <div class="text-muted text-sm">Restore from JSON</div>
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
    const approvalInp = PCD.$('#prefRequireApproval', view);
    if (approvalInp) approvalInp.addEventListener('change', function () {
      PCD.store.set('prefs.requireCountApproval', this.checked);
      PCD.toast.success(this.checked ? 'Approval enabled' : 'Approval disabled');
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
      PCD.toast.success('Profile saved');
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
      PCD.toast.success('Exported');
    });

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
              title: 'Import will REPLACE all current data',
              text: 'This cannot be undone. Your current recipes, ingredients, menus, etc. will be replaced with the backup contents. Continue?',
              okText: 'Replace everything'
            }).then(function (ok) {
              if (!ok) return;
              // Merge restore — replace top-level keys
              Object.keys(data).forEach(function (k) {
                if (k !== '_meta') PCD.store.set(k, data[k]);
              });
              PCD.toast.success('Backup restored — reloading...');
              setTimeout(function () { window.location.reload(); }, 800);
            });
          } catch (err) {
            PCD.toast.error('Invalid backup file: ' + err.message);
          }
        };
        reader.readAsText(f);
      };
      inp.click();
    });

    const expRec = PCD.$('#exportRecipesBtn', view);
    if (expRec) expRec.addEventListener('click', function () {
      const recipes = PCD.store.listRecipes();
      if (!recipes.length) { PCD.toast.info('No recipes to export'); return; }
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
      PCD.toast.success('Recipes exported (' + recipes.length + ')');
    });

    const expIng = PCD.$('#exportIngredientsBtn', view);
    if (expIng) expIng.addEventListener('click', function () {
      const ings = PCD.store.listIngredients();
      if (!ings.length) { PCD.toast.info('No ingredients to export'); return; }
      const rows = [['Name', 'Price', 'Unit', 'Category', 'Supplier']];
      ings.forEach(function (i) {
        rows.push([i.name, i.pricePerUnit || 0, i.unit || '', i.category || '', i.supplier || '']);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      PCD.download(csv, 'ingredients-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
      PCD.toast.success('Ingredients exported (' + ings.length + ')');
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

    const m = PCD.modal.open({ title: 'Public profile preview', body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.account = { render: render };
})();
