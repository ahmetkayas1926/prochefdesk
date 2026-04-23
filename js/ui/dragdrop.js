/* ================================================================
   ProChefDesk — dragdrop.js
   Unified drag-drop for touch + mouse.
   Used by: menu-builder (sections), kitchen-cards (canvas),
   and re-ordering lists in recipes.

   Basic API (Phase 1):
     PCD.dragdrop.makeSortable(listEl, { handle: '.drag-handle', onEnd: function(oldIndex, newIndex) {} });
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function makeSortable(container, opts) {
    opts = opts || {};
    const handleSel = opts.handle || null;
    const itemSel = opts.itemSelector || ':scope > *';

    let dragEl = null;
    let dragStartIndex = -1;
    let placeholder = null;
    let pointerOffsetY = 0;

    function onStart(e) {
      const touch = e.type.startsWith('touch');
      const target = touch ? e.target : e.target;
      let item = target.closest ? target.closest(itemSel) : null;
      if (!item || item.parentNode !== container) {
        // try a different match
        const children = Array.prototype.slice.call(container.children);
        item = children.find(function (c) { return c === target || c.contains(target); });
      }
      if (!item) return;
      if (handleSel && !target.closest(handleSel)) return;

      const pt = getPoint(e);
      const rect = item.getBoundingClientRect();
      pointerOffsetY = pt.y - rect.top;

      e.preventDefault();
      dragEl = item;
      dragStartIndex = Array.prototype.indexOf.call(container.children, dragEl);

      // Create placeholder
      placeholder = dragEl.cloneNode(true);
      placeholder.style.opacity = '0.3';
      placeholder.style.pointerEvents = 'none';
      placeholder.style.border = '2px dashed var(--brand-500)';
      placeholder.style.background = 'var(--brand-50)';

      // Floating clone
      const clone = dragEl.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.left = rect.left + 'px';
      clone.style.top = rect.top + 'px';
      clone.style.width = rect.width + 'px';
      clone.style.zIndex = '9999';
      clone.style.pointerEvents = 'none';
      clone.style.opacity = '0.92';
      clone.style.transform = 'scale(1.03)';
      clone.style.boxShadow = 'var(--shadow-xl)';
      clone.id = '_pcdDragClone';
      document.body.appendChild(clone);
      dragEl.style.visibility = 'hidden';
      dragEl._clone = clone;
      dragEl._placeholder = placeholder;

      PCD.haptic('medium');

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    }

    function onMove(e) {
      if (!dragEl) return;
      e.preventDefault();
      const pt = getPoint(e);
      if (dragEl._clone) {
        dragEl._clone.style.left = (pt.x - 20) + 'px';
        dragEl._clone.style.top = (pt.y - pointerOffsetY) + 'px';
      }
      // Find child under pointer
      const children = Array.prototype.slice.call(container.children).filter(function (c) { return c !== dragEl; });
      let inserted = false;
      for (let i = 0; i < children.length; i++) {
        const r = children[i].getBoundingClientRect();
        if (pt.y < r.top + r.height / 2) {
          container.insertBefore(dragEl, children[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) container.appendChild(dragEl);
    }

    function onEnd() {
      if (!dragEl) return;
      const clone = dragEl._clone;
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      dragEl.style.visibility = '';
      const newIndex = Array.prototype.indexOf.call(container.children, dragEl);
      const el = dragEl;
      dragEl = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);

      if (newIndex !== dragStartIndex && typeof opts.onEnd === 'function') {
        opts.onEnd(dragStartIndex, newIndex, el);
      }
    }

    function getPoint(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    container.addEventListener('mousedown', onStart);
    container.addEventListener('touchstart', onStart, { passive: false });

    return {
      destroy: function () {
        container.removeEventListener('mousedown', onStart);
        container.removeEventListener('touchstart', onStart);
      }
    };
  }

  PCD.dragdrop = { makeSortable: makeSortable };
})();
