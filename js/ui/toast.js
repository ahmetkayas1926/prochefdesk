/* ================================================================
   ProChefDesk — toast.js
   Stackable toasts (top-center on mobile, top-right on desktop)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const host = function () { return PCD.$('#toastHost'); };

  function icon(kind) {
    switch (kind) {
      case 'success': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      case 'error': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6" stroke-linecap="round"/></svg>';
      case 'warning': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      case 'info': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round"/></svg>';
      default: return '';
    }
  }

  function show(msg, kind, duration) {
    const h = host();
    if (!h) return;
    const el = PCD.el('div', { class: 'toast toast-' + (kind || 'info') });
    el.innerHTML = icon(kind || 'info') + '<span>' + PCD.escapeHtml(msg) + '</span>';
    h.appendChild(el);
    // trigger transition
    requestAnimationFrame(function () { el.classList.add('show'); });
    const dur = duration || (kind === 'error' ? 4500 : 2500);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, dur);

    if (kind === 'error') PCD.haptic('error');
    else if (kind === 'success') PCD.haptic('success');
    else PCD.haptic('tick');
  }

  PCD.toast = {
    success: function (m, d) { show(m, 'success', d); },
    error:   function (m, d) { show(m, 'error', d); },
    warning: function (m, d) { show(m, 'warning', d); },
    info:    function (m, d) { show(m, 'info', d); },
    show:    show,
  };
})();
