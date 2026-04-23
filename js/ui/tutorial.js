/* ================================================================
   ProChefDesk — tutorial.js
   Two modes:
   1) Main onboarding tour (4 steps) shown once on first app open
   2) Per-tool first-visit tooltips (Skip + Don't show again)

   Tool tooltips are stored in store.onboarding.toolsSeen[name]
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  let currentOverlay = null;

  function createOverlay(html) {
    const overlay = PCD.el('div', { class: 'tutorial' });
    overlay.appendChild(PCD.el('div', { class: 'tutorial-backdrop' }));
    const bubble = PCD.el('div', { class: 'tutorial-bubble' });
    bubble.innerHTML = html;
    overlay.appendChild(bubble);
    document.body.appendChild(overlay);
    // Position bubble center of screen initially
    bubble.style.left = '50%';
    bubble.style.top = '50%';
    bubble.style.transform = 'translate(-50%, -50%) scale(0.95)';
    requestAnimationFrame(function () {
      overlay.classList.add('show');
      bubble.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    return { overlay: overlay, bubble: bubble };
  }

  function removeOverlay(ov, cb) {
    if (!ov) { if (cb) cb(); return; }
    ov.overlay.classList.remove('show');
    ov.bubble.style.transform = 'translate(-50%, -50%) scale(0.95)';
    setTimeout(function () {
      if (ov.overlay.parentNode) ov.overlay.parentNode.removeChild(ov.overlay);
      if (cb) cb();
    }, 220);
  }

  // ============ MAIN ONBOARDING TOUR ============
  const mainSteps = [
    { title: 'tour_welcome_title', text: 'tour_welcome_text' },
    { title: 'tour_nav_title', text: 'tour_nav_text' },
    { title: 'tour_recipes_title', text: 'tour_recipes_text' },
    { title: 'tour_demo_title', text: 'tour_demo_text' },
  ];
  let stepIndex = 0;

  function renderStep() {
    const t = PCD.i18n.t;
    const s = mainSteps[stepIndex];
    const dots = mainSteps.map(function (_, i) {
      return '<div class="tutorial-dot' + (i === stepIndex ? ' active' : '') + '"></div>';
    }).join('');
    const finishBtn = (stepIndex === mainSteps.length - 1)
      ? '<button class="btn btn-primary" data-tour-next>' + t('tour_finish') + '</button>'
      : '<button class="btn btn-primary" data-tour-next>' + t('next') + '</button>';
    const html = `
      <div class="tutorial-step">STEP ${stepIndex + 1} / ${mainSteps.length}</div>
      <div class="tutorial-title">${PCD.escapeHtml(t(s.title))}</div>
      <div class="tutorial-text">${PCD.escapeHtml(t(s.text))}</div>
      <div class="tutorial-actions">
        <button class="btn btn-ghost btn-sm" data-tour-skip>${t('skip')}</button>
        <div class="tutorial-dots">${dots}</div>
        ${finishBtn}
      </div>
    `;
    if (currentOverlay) {
      currentOverlay.bubble.innerHTML = html;
      wire();
    } else {
      currentOverlay = createOverlay(html);
      wire();
    }
  }

  function wire() {
    if (!currentOverlay) return;
    const b = currentOverlay.bubble;
    const skip = b.querySelector('[data-tour-skip]');
    const next = b.querySelector('[data-tour-next]');
    if (skip) skip.addEventListener('click', finishTour);
    if (next) next.addEventListener('click', function () {
      stepIndex++;
      if (stepIndex >= mainSteps.length) finishTour();
      else renderStep();
    });
  }

  function finishTour() {
    PCD.store.update('onboarding', { mainTourDone: true });
    closeAll();
  }

  function closeAll() {
    const ov = currentOverlay;
    currentOverlay = null;
    removeOverlay(ov);
  }

  // ============ PER-TOOL TOOLTIP ============
  function showToolTip(toolKey) {
    if (PCD.store.isToolSeen(toolKey)) return;
    if (currentOverlay) return; // tour already up
    const t = PCD.i18n.t;
    const titleKey = 'tip_' + toolKey + '_title';
    const textKey = 'tip_' + toolKey + '_text';
    const title = t(titleKey);
    const text = t(textKey);
    // If no translation, skip
    if (title === titleKey) { PCD.store.markToolSeen(toolKey); return; }

    const html = `
      <div class="tutorial-step">💡 ${t('new').toUpperCase()}</div>
      <div class="tutorial-title">${PCD.escapeHtml(title)}</div>
      <div class="tutorial-text">${PCD.escapeHtml(text)}</div>
      <div class="tutorial-actions" style="margin-top:16px;">
        <label class="checkbox" style="font-size:12px;">
          <input type="checkbox" data-dontshow>
          <span>${t('dont_show_again')}</span>
        </label>
        <button class="btn btn-primary btn-sm" data-tip-ok>${t('done')}</button>
      </div>
    `;
    currentOverlay = createOverlay(html);
    const dontshow = currentOverlay.bubble.querySelector('[data-dontshow]');
    const okBtn = currentOverlay.bubble.querySelector('[data-tip-ok]');
    dontshow.checked = true; // default to "don't show" (user hit OK = dismiss permanently)
    okBtn.addEventListener('click', function () {
      if (dontshow.checked) PCD.store.markToolSeen(toolKey);
      closeAll();
    });
  }

  // ============ PUBLIC ============
  PCD.tutorial = {
    startMainTour: function () {
      stepIndex = 0;
      renderStep();
    },
    showToolTip: showToolTip,
    isOpen: function () { return !!currentOverlay; },
    close: function (opts) {
      closeAll();
    },
  };
})();
