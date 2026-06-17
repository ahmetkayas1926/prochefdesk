/* ================================================================
   ProChefDesk — i18n.js
   Translation engine. Individual locale files register via
   PCD.i18n.register('en', { key: 'value', ... }).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const bundles = {}; // { 'en': {...}, 'tr': {...} }
  let current = 'en';
  // v2.8.78 — Lazy load: sadece en.js boot'ta yüklenir; diğer 5 dil
  // ilk kullanımda dynamic script tag ile çekilir. ~150 KB initial save.
  const _loadingPromises = {};

  function loadLocaleBundle(locale) {
    if (bundles[locale]) return Promise.resolve(bundles[locale]);
    if (_loadingPromises[locale]) return _loadingPromises[locale];
    _loadingPromises[locale] = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      // Cache-bust ile aynı versiyon tag'i. PCD_CONFIG'den okur.
      const v = (window.PCD_CONFIG && window.PCD_CONFIG.APP_VERSION) || '';
      s.src = 'js/i18n/' + locale + '.js' + (v ? '?v=' + v : '');
      s.onload = function () {
        // Locale dosyası kendi içinde PCD.i18n.register('xx', {...}) çağırır
        // → bundles[locale] yüklü olur.
        if (bundles[locale]) resolve(bundles[locale]);
        else reject(new Error('Locale ' + locale + ' loaded but bundle not registered'));
      };
      s.onerror = function () {
        delete _loadingPromises[locale];
        reject(new Error('Failed to load locale ' + locale));
      };
      document.head.appendChild(s);
    });
    return _loadingPromises[locale];
  }

  // Forward declaration so _applyLocale can reference i18n object
  // (assigned below).
  let i18n;

  function _applyLocale(locale) {
    current = locale;
    const cfg = (window.PCD_CONFIG.LOCALES || []).find(function (l) { return l.code === locale; });
    const dir = cfg ? cfg.dir : 'ltr';
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('data-dir', dir);
    // v2.44.36 — Gerçek `dir` attribute'u da set et → tarayıcının native RTL
    // motoru devreye girer (flex sıra ters, metin sağa yaslı, logical props).
    // Önceden yalnız data-dir vardı → Arapça düzeni yalnız kısmen aynalanıyordu.
    document.documentElement.setAttribute('dir', dir);
    i18n.currentLocale = locale;
    i18n.currentDir = dir;
    i18n.applyAll();
    if (PCD.store) PCD.store.set('prefs.locale', locale);
    // Auto re-render current view so all strings update immediately.
    // BUG FIX (v2.6.28): Route names are snake_case (e.g. haccp_logs) but
    // tool names are camelCase (PCD.tools.haccpLogs). Convert before lookup.
    if (PCD.router && PCD.tools) {
      const cur = PCD.router.currentView() || 'dashboard';
      const camel = cur.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
      const view = document.getElementById('view');
      const tool = PCD.tools[cur] || PCD.tools[camel];
      if (view && tool && typeof tool.render === 'function') {
        try { tool.render(view); } catch (e) { /* ignore */ }
      }
    }
    PCD.log('Locale set to', locale);
    return true;
  }

  i18n = {
    register: function (locale, dict) {
      bundles[locale] = Object.assign({}, bundles[locale] || {}, dict);
    },

    // v2.8.78 — setLocale artık async. Bundle yüklenmemişse lazy load
    // eder; geriye uyumluluk için return değeri true/false yerine Promise.
    // Çoğu caller dönüşü kullanmıyor zaten; kullananlar (settings UI)
    // .then() ile chain edebilir. Sync caller'lar olduğu gibi çalışır.
    setLocale: function (locale) {
      if (bundles[locale]) {
        return Promise.resolve(_applyLocale(locale));
      }
      return loadLocaleBundle(locale).then(function () {
        return _applyLocale(locale);
      }).catch(function (err) {
        PCD.warn('Locale load failed:', locale, err);
        // Fallback to 'en' so app doesn't break
        if (locale !== 'en' && bundles.en) {
          _applyLocale('en');
        }
        return false;
      });
    },

    // Eager preload helper — settings ekranı arka planda diğer dilleri çekebilir
    preloadLocale: function (locale) { return loadLocaleBundle(locale); },

    t: function (key, vars) {
      const dict = bundles[current] || {};
      let str = dict[key];
      if (str === undefined) {
        // fallback to English
        str = (bundles.en || {})[key];
      }
      if (str === undefined) str = key;
      if (vars) {
        Object.keys(vars).forEach(function (k) {
          str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
      }
      return str;
    },

    // Apply translations to any element with data-i18n or data-i18n-placeholder etc.
    applyAll: function (root) {
      root = root || document;
      const nodes = root.querySelectorAll('[data-i18n]');
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.textContent = i18n.t(n.getAttribute('data-i18n'));
      }
      const phs = root.querySelectorAll('[data-i18n-placeholder]');
      for (let i = 0; i < phs.length; i++) {
        phs[i].setAttribute('placeholder', i18n.t(phs[i].getAttribute('data-i18n-placeholder')));
      }
      const titles = root.querySelectorAll('[data-i18n-title]');
      for (let i = 0; i < titles.length; i++) {
        titles[i].setAttribute('title', i18n.t(titles[i].getAttribute('data-i18n-title')));
      }
      const aria = root.querySelectorAll('[data-i18n-aria-label]');
      for (let i = 0; i < aria.length; i++) {
        aria[i].setAttribute('aria-label', i18n.t(aria[i].getAttribute('data-i18n-aria-label')));
      }
      // Update lang button label
      const label = document.getElementById('langLabel');
      if (label) {
        const cfg = (window.PCD_CONFIG.LOCALES || []).find(function (l) { return l.code === current; });
        label.textContent = cfg ? cfg.label : current.toUpperCase();
      }
    },

    currentLocale: 'en',
    currentDir: 'ltr',

    getLocales: function () { return window.PCD_CONFIG.LOCALES || []; },
  };

  PCD.i18n = i18n;
})();
