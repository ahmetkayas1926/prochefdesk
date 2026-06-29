/* ================================================================
   ProChefDesk — gate.js
   ----------------------------------------------------------------
   Feature gate'leri + upgrade (yumuşak duvar) modalı + Stripe
   checkout/portal tetikleyicileri. TÜM gate'ler plan limitlerini
   PCD.plans.getPlanLimits()'ten okur — dağınık `if(plan==='pro')` YOK.

   Felsefe (spec Bölüm 2):
     - Limit aşımı kullanıcıyı ENGELLEMEZ; yumuşak duvar gösterir
       (Pro'ya geç + farkı anlat). Veri silinmez/gizlenmez.
     - Kilitli özellik UI'da GÖRÜNÜR (kilit ikonu) — kullanıcı
       varlığını görsün, istesin.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});

  function limits() { return (PCD.plans && PCD.plans.getPlanLimits()) || {}; }
  function isPro() { return (PCD.plans && PCD.plans.getUserPlan && PCD.plans.getUserPlan() === 'pro'); }
  function t(k) { return (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t(k) : k; }

  // ---------- MİSAFİR (giriş yok) GATE ----------
  // Misafir = oturum açmamış kullanıcı (user.id yok). Misafir TÜM araçları +
  // demo seed'leri GÖRÜR ama yeni oluşturamaz / kaydedemez / silemez.
  // requireAuth() yazma eyleminin başında çağrılır: misafirse giriş duvarı
  // gösterir + false döner (eylem iptal); üyeyse true döner (devam).
  function isGuest() {
    try { const u = PCD.store && PCD.store.get && PCD.store.get('user'); return !(u && u.id); }
    catch (e) { return true; }
  }
  function requireAuth() {
    if (!isGuest()) return true;
    showSignupGate();
    return false;
  }
  function showSignupGate() {
    if (!PCD.modal || !PCD.modal.open) { if (PCD.router && PCD.router.go) PCD.router.go('account'); return; }
    const body =
      '<div style="text-align:center;margin-bottom:6px;">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--brand-50,#f0fdf4);color:var(--brand-600,#16a34a);margin-bottom:10px;">' +
          (PCD.icon ? PCD.icon('lock', 26) : '🔒') + '</div>' +
        '<div style="font-size:13px;color:var(--text-2,#555);line-height:1.55;">' + PCD.escapeHtml(t('gate_guest_msg')) + '</div>' +
      '</div>';
    const footer = PCD.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' } });
    const signupBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', style: { width: '100%' } });
    signupBtn.textContent = t('gate_guest_signup');
    const laterBtn = PCD.el('button', { type: 'button', class: 'btn btn-ghost', style: { width: '100%' } });
    laterBtn.textContent = t('gate_guest_later');
    footer.appendChild(signupBtn);
    footer.appendChild(laterBtn);
    const m = PCD.modal.open({ title: t('gate_guest_title'), body: body, footer: footer, size: 'sm', closable: true });
    signupBtn.addEventListener('click', function () { m.close(); if (PCD.router && PCD.router.go) PCD.router.go('account'); });
    laterBtn.addEventListener('click', function () { m.close(); });
    return m;
  }

  // ---------- COUNT-BASED GATES (mevcut sayıyı çağıran verir) ----------
  function canCreateRecipe(count)     { return (count || 0) < (limits().maxRecipes || Infinity); }
  function canCreateIngredient(count) { return (count || 0) < (limits().maxIngredients || Infinity); }
  function canAddWorkspace(count)     { return (count || 0) < (limits().maxWorkspaces || Infinity); }

  // ---------- GENEL SAYI GATE'i (her araç) ----------
  // toolKey → plan limit anahtarı. Bilinmeyen araç = sınırsız.
  function _maxFor(toolKey) {
    const lim = limits();
    const map = {
      recipes: lim.maxRecipes, ingredients: lim.maxIngredients, workspaces: lim.maxWorkspaces,
      menus: lim.maxMenus, events: lim.maxEvents, buffets: lim.maxBuffets,
      rosters: lim.maxRosters, whiteboards: lim.maxWhiteboards,
      checklists: lim.maxChecklists, prepSheets: lim.maxPrepSheets,
      canvases: lim.maxCanvases,
    };
    return (map[toolKey] != null) ? map[toolKey] : Infinity;
  }
  function canCreate(toolKey, count) { return (count || 0) < _maxFor(toolKey); }
  function maxFor(toolKey) { return _maxFor(toolKey); }

  // ---------- ÇIKTI GATE'i (Faz 3) ----------
  // Free: araç başına ÖMÜR-BOYU 1 ücretsiz çıktı (pazarlama kancası), 2.'den Pro.
  // (localStorage `pcd_export_log` ile cihaz-başı; tarih sıfırlaması YOK.)
  // Roster: free'de tamamen kapalı. Pro: sınırsız.
  function canExport(toolKey) {
    const lim = limits();
    if (isGuest()) return false;                                    // misafir: HİÇ çıktı yok
    if (toolKey === 'roster' && lim.rosterExport === false) return false; // roster free: tamamen kapalı
    if (!lim.exportFirstFree) return true;                           // pro: sınırsız
    try {
      const log = JSON.parse(localStorage.getItem('pcd_export_log') || '{}');
      return !log[toolKey];                                          // free: araç başına ÖMÜR-BOYU 1
    } catch (e) { return true; }
  }
  function _markExport(toolKey) {
    const lim = limits();
    if (!lim.exportFirstFree) return; // pro → işaretleme yok
    try {
      const log = JSON.parse(localStorage.getItem('pcd_export_log') || '{}');
      log[toolKey] = true; // ömür-boyu işaretle (bu araçtan ücretsiz çıktı tükendi)
      localStorage.setItem('pcd_export_log', JSON.stringify(log));
    } catch (e) {}
  }
  // Çıktı/print tetikleyicisinin başında çağrılır. Misafir → giriş duvarı;
  // free + izin varsa işaretle + true; free + limit dolu → upgrade duvarı + false.
  function requireExport(toolKey) {
    if (isGuest()) { showSignupGate(); return false; }
    if (canExport(toolKey)) { _markExport(toolKey); return true; }
    showUpgradeModal({ feature: 'exports', message: t('gate_export_limit') });
    return false;
  }

  // ---------- BOOLEAN FEATURE GATES ----------
  function canSync()        { return !!limits().cloudSync; }
  function canUseHaccp()    { return !!limits().haccp; }
  function canUseLaborCost(){ return !!limits().laborCost; }
  function canUseCostView() { return !!limits().costViewShare; }
  function canShare()       { return !!limits().publicShare; }       // link/URL/QR = yalnız Pro
  function showWatermark()  { return limits().watermark !== false; } // güvenli varsayılan: göster

  // Paylaşım (link/URL/QR) tetikleyicisinin başında çağrılır. Misafir → giriş
  // duvarı; free → Pro duvarı; Pro → true.
  function requireShare() {
    if (isGuest()) { showSignupGate(); return false; }
    if (canShare()) return true;
    showUpgradeModal({ feature: 'sharing', message: t('gate_share_pro') });
    return false;
  }

  // ---------- KİLİT ROZETİ (inline UI) ----------
  // Pro'da boş döner (rozet yok); free'de küçük kilit chip'i.
  function lockChip(size) {
    if (isPro()) return '';
    const icon = (PCD.icon ? PCD.icon('lock', size || 12) : '');
    return '<span class="pcd-lock-chip" title="' + PCD.escapeHtml(t('gate_pro_badge')) +
      '" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;' +
      'text-transform:uppercase;letter-spacing:0.04em;color:var(--brand-700,#15803d);' +
      'background:var(--brand-50,#f0fdf4);border:1px solid var(--brand-200,#bbf7d0);' +
      'padding:1px 6px;border-radius:999px;vertical-align:middle;">' + icon +
      PCD.escapeHtml(t('gate_pro_badge')) + '</span>';
  }

  // ---------- UPGRADE MODALI (yumuşak duvar) ----------
  // opts: { feature: 'serbest metin' | featureKey, message?: '...' }
  // featureKey → gate_feat_<key> i18n'inden okunur.
  const FEATURE_KEYS = {
    recipes: 'gate_feat_recipes', ingredients: 'gate_feat_ingredients',
    haccp: 'gate_feat_haccp', sync: 'gate_feat_sync', labor: 'gate_feat_labor',
    costview: 'gate_feat_costview', workspaces: 'gate_feat_workspaces',
  };

  function showUpgradeModal(opts) {
    opts = opts || {};
    if (!PCD.modal || !PCD.modal.open) { startCheckout('monthly'); return; }

    const featureLabel = opts.feature
      ? (FEATURE_KEYS[opts.feature] ? t(FEATURE_KEYS[opts.feature]) : opts.feature)
      : t('gate_feat_generic');
    const sub = (opts.message || t('gate_upgrade_sub')).replace('{feature}', featureLabel);

    const perks = [
      t('gate_feat_recipes'), t('gate_feat_haccp'),
      t('gate_feat_sync'), t('gate_feat_costview'),
    ];
    const perksHtml = perks.map(function (p) {
      return '<li style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">' +
        '<span style="color:var(--brand-600,#16a34a);flex:0 0 auto;">' + (PCD.icon ? PCD.icon('check', 16) : '✓') + '</span>' +
        '<span>' + PCD.escapeHtml(p) + '</span></li>';
    }).join('');

    const body =
      '<div style="text-align:center;margin-bottom:8px;">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--brand-50,#f0fdf4);color:var(--brand-600,#16a34a);margin-bottom:10px;">' +
          (PCD.icon ? PCD.icon('star', 28) : '★') + '</div>' +
        '<div style="font-size:13px;color:var(--text-2,#555);line-height:1.5;">' + PCD.escapeHtml(sub) + '</div>' +
      '</div>' +
      '<ul style="list-style:none;padding:0;margin:14px 0 4px;max-width:280px;margin-inline:auto;">' + perksHtml + '</ul>' +
      // v2.17 — Checkout öncesi Terms onayı (spec 9.7). Açık ifade + linkler.
      '<div style="font-size:11px;color:var(--text-3,#888);text-align:center;margin-top:12px;line-height:1.5;">' +
        PCD.escapeHtml(t('gate_terms_agree')) + ' ' +
        '<a href="/terms.html" target="_blank" rel="noopener" style="color:var(--brand-700,#15803d);">' + PCD.escapeHtml(t('gate_terms_link')) + '</a> &amp; ' +
        '<a href="/privacy.html" target="_blank" rel="noopener" style="color:var(--brand-700,#15803d);">' + PCD.escapeHtml(t('gate_privacy_link')) + '</a>.' +
      '</div>';

    const footer = PCD.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' } });

    const monthlyBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', style: { width: '100%' } });
    monthlyBtn.textContent = t('gate_btn_monthly');

    const annualBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', style: { width: '100%' } });
    annualBtn.innerHTML = PCD.escapeHtml(t('gate_btn_annual')) +
      ' <span style="font-size:11px;color:var(--brand-700,#15803d);font-weight:700;">· ' + PCD.escapeHtml(t('gate_annual_save')) + '</span>';

    const laterBtn = PCD.el('button', { type: 'button', class: 'btn btn-ghost', style: { width: '100%' } });
    laterBtn.textContent = t('gate_not_now');

    footer.appendChild(monthlyBtn);
    footer.appendChild(annualBtn);
    footer.appendChild(laterBtn);

    const m = PCD.modal.open({ title: t('gate_upgrade_title'), body: body, footer: footer, size: 'sm', closable: true });
    monthlyBtn.addEventListener('click', function () { m.close(); startCheckout('monthly'); });
    annualBtn.addEventListener('click', function () { m.close(); startCheckout('annual'); });
    laterBtn.addEventListener('click', function () { m.close(); });
    return m;
  }

  // ---------- STRIPE CHECKOUT / PORTAL ----------
  function _client() { return PCD.cloud && PCD.cloud.getClient && PCD.cloud.getClient(); }
  function _toast(kind, key) { if (PCD.toast && PCD.toast[kind]) PCD.toast[kind](t(key)); }

  function startCheckout(plan) {
    const supabase = _client();
    const user = PCD.store && PCD.store.get && PCD.store.get('user');
    if (!supabase || !user || !user.id) {
      _toast('info', 'gate_signin_first');
      if (PCD.router && PCD.router.go) PCD.router.go('account');
      return;
    }
    _toast('info', 'gate_redirecting');
    const returnUrl = location.origin + '/app/';
    supabase.functions.invoke('create-checkout-session', {
      body: { plan: plan === 'annual' ? 'annual' : 'monthly', returnUrl: returnUrl },
    }).then(function (res) {
      if (res.error || !res.data || !res.data.url) { _toast('error', 'gate_checkout_error'); return; }
      window.location.href = res.data.url;
    }).catch(function () { _toast('error', 'gate_checkout_error'); });
  }

  function openPortal() {
    const supabase = _client();
    const user = PCD.store && PCD.store.get && PCD.store.get('user');
    if (!supabase || !user || !user.id) { _toast('info', 'gate_signin_first'); return; }
    _toast('info', 'gate_redirect_portal');
    const returnUrl = location.origin + '/app/';
    supabase.functions.invoke('create-portal-session', {
      body: { returnUrl: returnUrl },
    }).then(function (res) {
      if (res.error || !res.data || !res.data.url) { _toast('error', 'gate_portal_error'); return; }
      window.location.href = res.data.url;
    }).catch(function () { _toast('error', 'gate_portal_error'); });
  }

  PCD.gate = {
    limits: limits,
    isPro: isPro,
    isGuest: isGuest,
    requireAuth: requireAuth,
    canCreate: canCreate,
    maxFor: maxFor,
    canExport: canExport,
    requireExport: requireExport,
    canCreateRecipe: canCreateRecipe,
    canCreateIngredient: canCreateIngredient,
    canAddWorkspace: canAddWorkspace,
    canSync: canSync,
    canUseHaccp: canUseHaccp,
    canUseLaborCost: canUseLaborCost,
    canUseCostView: canUseCostView,
    canShare: canShare,
    requireShare: requireShare,
    showWatermark: showWatermark,
    lockChip: lockChip,
    showUpgradeModal: showUpgradeModal,
    startCheckout: startCheckout,
    openPortal: openPortal,
  };
})();
