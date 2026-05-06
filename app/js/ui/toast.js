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

  function show(msg, kind, duration, opts) {
    const h = host();
    if (!h) return null;
    opts = opts || {};
    const el = PCD.el('div', { class: 'toast toast-' + (kind || 'info') });
    el.innerHTML = icon(kind || 'info') + '<span style="flex:1;">' + PCD.escapeHtml(msg) + '</span>';
    if (opts.action) {
      const actionBtn = PCD.el('button', {
        style: { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'inherit', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', marginInlineStart: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' },
        text: opts.action.label || 'UNDO'
      });
      actionBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        try { opts.action.onClick(); } catch (err) {}
        el.classList.remove('show');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
      });
      el.appendChild(actionBtn);
    }
    h.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    const dur = duration || (kind === 'error' ? 4500 : (opts.action ? 5000 : 2500));
    const timer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, dur);

    if (kind === 'error') PCD.haptic('error');
    else if (kind === 'success') PCD.haptic('success');
    else PCD.haptic('tick');

    return {
      dismiss: function () {
        clearTimeout(timer);
        el.classList.remove('show');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
      }
    };
  }

  PCD.toast = {
    success: function (m, d, o) { return show(m, 'success', d, o); },
    error:   function (m, d, o) { return show(m, 'error', d, o); },
    warning: function (m, d, o) { return show(m, 'warning', d, o); },
    info:    function (m, d, o) { return show(m, 'info', d, o); },
    show:    show,
  };
})();
