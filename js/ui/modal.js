/* ================================================================
   ProChefDesk — modal.js
   Bottom-sheet on mobile, dialog on desktop.
   Automatically integrates with router: back button closes top modal.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const stack = [];

  function createModal(opts) {
    opts = opts || {};
    const id = PCD.uid('m');
    const host = PCD.$('#modalStack');

    const title = opts.title || '';
    const body = opts.body || '';
    const footer = (opts.footer !== undefined) ? opts.footer : null;
    const size = opts.size || 'md';
    const closable = opts.closable !== false;

    const root = PCD.el('div', { class: 'modal modal-' + size, 'data-mid': id });

    const panel = PCD.el('div', { class: 'modal-panel' });

    // Header (with optional close button)
    const header = PCD.el('div', { class: 'modal-header' });
    const titleEl = PCD.el('div', { class: 'modal-title' });
    if (typeof title === 'string') titleEl.textContent = title;
    else if (title instanceof Node) titleEl.appendChild(title);
    header.appendChild(titleEl);
    if (closable) {
      const closeBtn = PCD.el('button', { class: 'icon-btn', 'aria-label': 'Close', type: 'button' });
      closeBtn.innerHTML = PCD.icon('x', 20);
      closeBtn.style.cursor = 'pointer';
      // Bind handler — close in next microtask so this click event finishes
      // (and won't reach elements behind the modal once body.position changes)
      const closeHandler = function (e) {
        if (!modal._isOpen) return;
        e.preventDefault();
        e.stopPropagation();
        // Defer close so the click event completes its dispatch first
        setTimeout(function () { modal.close(); }, 0);
      };
      closeBtn.addEventListener('click', closeHandler);
      // Also catch pointerdown to lock state immediately
      closeBtn.addEventListener('pointerdown', function (e) {
        if (!modal._isOpen) return;
        e.preventDefault();
        e.stopPropagation();
      });
      header.appendChild(closeBtn);
    }
    panel.appendChild(header);

    // Body
    const bodyEl = PCD.el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);
    panel.appendChild(bodyEl);

    // Footer
    let footerEl = null;
    if (footer !== null && footer !== '') {
      footerEl = PCD.el('div', { class: 'modal-footer' });
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else if (footer instanceof Node) footerEl.appendChild(footer);
      panel.appendChild(footerEl);
    }

    root.appendChild(panel);

    // Keyboard form flow (v2.6.32) — applies to ALL modals:
    // - Enter on input/select → move focus to next focusable form element
    //   (mimics Tab). Lets users fill out forms with Enter only.
    // - Enter inside textarea → newline (browser default, untouched).
    // - Ctrl+Enter / Cmd+Enter anywhere → click the primary submit button
    //   in the footer (the .btn-primary, or the last button if none has
    //   that class).
    // - Inputs marked data-skip-enter="true" keep their original Enter
    //   behavior (used by autocompletes like the recipe quick-add).
    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!target) return;

      // Ctrl+Enter / Cmd+Enter → primary save anywhere
      if (e.ctrlKey || e.metaKey) {
        const submitBtn = (footerEl && (footerEl.querySelector('.btn-primary:not([disabled])') || (function () {
          const all = footerEl.querySelectorAll('button:not([disabled])');
          return all.length ? all[all.length - 1] : null;
        })())) || null;
        if (submitBtn) {
          e.preventDefault();
          submitBtn.click();
        }
        return;
      }

      const tag = (target.tagName || '').toLowerCase();
      // Textarea: leave Enter alone (newline)
      if (tag === 'textarea') return;
      // Buttons: leave Enter alone (browser triggers click)
      if (tag === 'button') return;
      // Anything explicitly opted out (autocompletes etc.)
      if (target.getAttribute && target.getAttribute('data-skip-enter') === 'true') return;
      // Only handle inputs and selects from here
      if (tag !== 'input' && tag !== 'select') return;

      // Move focus to next focusable form element inside the panel.
      // If we're already at the last one, click the primary button.
      const focusables = Array.prototype.slice.call(
        panel.querySelectorAll('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
      ).filter(function (el) { return el.offsetParent !== null; });

      const idx = focusables.indexOf(target);
      e.preventDefault();
      if (idx >= 0 && idx < focusables.length - 1) {
        focusables[idx + 1].focus();
        const next = focusables[idx + 1];
        // Select text in number/text inputs so the user can immediately overwrite
        if (next.tagName === 'INPUT' && (next.type === 'number' || next.type === 'text' || next.type === 'search' || next.type === 'email')) {
          try { next.select(); } catch (ex) { /* ignore */ }
        }
      } else {
        // Last field — submit form via primary button
        const submitBtn = (footerEl && (footerEl.querySelector('.btn-primary:not([disabled])') || (function () {
          const all = footerEl.querySelectorAll('button:not([disabled])');
          return all.length ? all[all.length - 1] : null;
        })())) || null;
        if (submitBtn) submitBtn.click();
      }
    });

    // Click on backdrop closes — use mousedown+mouseup pair to avoid
    // accidental close when text selection ends outside the panel.
    let backdropDown = false;
    root.addEventListener('mousedown', function (e) {
      backdropDown = (e.target === root);
    });
    root.addEventListener('mouseup', function (e) {
      if (!closable) return;
      // Only close if BOTH mousedown and mouseup happened on backdrop
      if (backdropDown && e.target === root) {
        // Defer so this click event finishes before body.position changes
        setTimeout(function () { modal.close(); }, 0);
      }
      backdropDown = false;
    });
    // Touch support — on touch devices click works fine since no drag
    root.addEventListener('touchend', function (e) {
      if (!closable) return;
      if (e.target === root) {
        setTimeout(function () { modal.close(); }, 0);
      }
    });

    // Prevent background scroll while modal open
    // (body keeps its scroll via overflow:hidden on html when modal open)

    const modal = {
      id: id,
      el: root,
      panel: panel,
      bodyEl: bodyEl,
      footerEl: footerEl,
      opts: opts,
      _onClose: opts.onClose,
      _isOpen: false,

      open: function () {
        host.appendChild(root);
        // Force reflow then add .open class to trigger transition
        root.offsetHeight;
        stack.push(modal);
        // Lock scroll — preserve position so we don't jump to top
        if (stack.length === 1) {
          const scrollY = window.scrollY || window.pageYOffset || 0;
          document.body.dataset.scrollLock = String(scrollY);
          document.body.style.position = 'fixed';
          document.body.style.top = '-' + scrollY + 'px';
          document.body.style.left = '0';
          document.body.style.right = '0';
          document.body.style.width = '100%';
        }
        requestAnimationFrame(function () { root.classList.add('open'); });
        modal._isOpen = true;

        // Focus first input if any (desktop only — mobile keyboard pop-up is annoying)
        setTimeout(function () {
          const inp = panel.querySelector('input:not([type=hidden]), textarea, select, button');
          if (inp && PCD.isTouch && !PCD.isTouch()) {
            inp.focus();
            // Select text in editable inputs so users can overwrite immediately
            if (inp.tagName === 'INPUT' && (inp.type === 'number' || inp.type === 'text' || inp.type === 'search' || inp.type === 'email')) {
              try { inp.select(); } catch (ex) { /* ignore */ }
            }
          }
        }, 250);
      },

      close: function () {
        if (!modal._isOpen) return;
        modal._isOpen = false;
        root.style.pointerEvents = 'none';
        root.classList.remove('open');
        const idx = stack.indexOf(modal);
        if (idx >= 0) stack.splice(idx, 1);
        // Unlock scroll if no modals left — restore scroll position
        if (stack.length === 0) {
          const scrollY = parseInt(document.body.dataset.scrollLock || '0', 10);
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.left = '';
          document.body.style.right = '';
          document.body.style.width = '';
          delete document.body.dataset.scrollLock;
          if (scrollY > 0) window.scrollTo(0, scrollY);
        }
        // Fire onClose SYNCHRONOUSLY
        if (typeof modal._onClose === 'function') {
          try { modal._onClose(); } catch (e) { PCD.error && PCD.error(e); }
          modal._onClose = null;
        }
        setTimeout(function () {
          if (root.parentNode) root.parentNode.removeChild(root);
        }, 250);
      },

      setTitle: function (t) {
        if (typeof t === 'string') titleEl.textContent = t;
        else if (t instanceof Node) { PCD.clear(titleEl); titleEl.appendChild(t); }
      },
      setBody: function (b) {
        if (typeof b === 'string') bodyEl.innerHTML = b;
        else if (b instanceof Node) { PCD.clear(bodyEl); bodyEl.appendChild(b); }
        if (PCD.i18n) PCD.i18n.applyAll(bodyEl);
      },
      setFooter: function (f) {
        if (!footerEl && f) {
          footerEl = PCD.el('div', { class: 'modal-footer' });
          panel.appendChild(footerEl);
        }
        if (footerEl) {
          if (typeof f === 'string') footerEl.innerHTML = f;
          else if (f instanceof Node) { PCD.clear(footerEl); footerEl.appendChild(f); }
        }
      },
    };
    return modal;
  }

  const api = {
    open: function (opts) {
      const m = createModal(opts);
      m.open();
      return m;
    },

    // Close the top modal (called by router on back button)
    closeTop: function () {
      if (stack.length === 0) return false;
      stack[stack.length - 1].close();
      return true;
    },

    closeAll: function () {
      stack.slice().forEach(function (m) { m.close(); });
    },

    isOpen: function () { return stack.length > 0; },

    // Convenience: confirm dialog
    confirm: function (opts) {
      const t = PCD.i18n.t;
      return new Promise(function (resolve) {
        const body = PCD.el('div', { class: 'text-center' });
        if (opts.icon) {
          body.appendChild(PCD.el('div', { class: 'alert-dialog-icon ' + (opts.iconKind || 'warning'), text: opts.icon }));
        }
        if (opts.title) {
          body.appendChild(PCD.el('h3', { style: { fontSize: '18px', fontWeight: '700', margin: '0 0 6px', letterSpacing: '-0.01em' }, text: opts.title }));
        }
        if (opts.text) {
          body.appendChild(PCD.el('p', { style: { fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.5', margin: '0 auto', maxWidth: '320px' }, text: opts.text }));
        }

        const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: opts.cancelText || t('cancel') });
        const okBtn = PCD.el('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), text: opts.okText || t('confirm') });
        const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
        cancelBtn.style.flex = '1';
        okBtn.style.flex = '1';
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);

        const m = api.open({
          title: '',
          body: body,
          footer: footer,
          size: 'sm',
          closable: true,
          onClose: function () { resolve(false); }
        });
        // remove the header entirely for cleaner alert look
        m.panel.querySelector('.modal-header').style.display = 'none';

        cancelBtn.addEventListener('click', function () {
          m._onClose = null; m.close(); resolve(false);
        });
        okBtn.addEventListener('click', function () {
          m._onClose = null; m.close(); resolve(true);
        });
      });
    },

    alert: function (opts) {
      return api.confirm(Object.assign({ cancelText: null }, opts)).then(function () { return true; });
    },
  };

  PCD.modal = api;
})();
