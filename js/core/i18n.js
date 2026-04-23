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

  const i18n = {
    register: function (locale, dict) {
      bundles[locale] = Object.assign({}, bundles[locale] || {}, dict);
    },

    setLocale: function (locale) {
      if (!bundles[locale]) {
        PCD.warn('Locale not loaded:', locale);
        return false;
      }
      current = locale;
      const cfg = (window.PCD_CONFIG.LOCALES || []).find(function (l) { return l.code === locale; });
      const dir = cfg ? cfg.dir : 'ltr';
      document.documentElement.setAttribute('lang', locale);
      document.documentElement.setAttribute('data-dir', dir);
      i18n.currentLocale = locale;
      i18n.currentDir = dir;
      i18n.applyAll();
      if (PCD.store) PCD.store.set('prefs.locale', locale);
      PCD.log('Locale set to', locale);
      return true;
    },

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
