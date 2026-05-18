/* ================================================================
   ProChefDesk — tutorial.js (v2.8.83 modernize)
   Two modes:
   1) Main onboarding tour (4 steps) shown once on first app open
   2) Per-tool first-visit tooltips (Skip + Don't show again)

   Tool tooltips are stored in store.onboarding.toolsSeen[name]

   v2.8.83 modernization:
   - Hero illustration per step (gradient circle + emoji, brand-themed)
   - Feature chips (3 chips per step — quick scan)
   - Modern progress bar (replaces simple dots)
   - Back/Next/Skip layout with smoother transitions
   - Larger card (440px) on desktop, full-bleed mobile sheet
   - Each step has title + tagline + body (3-tier content hierarchy)
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
  // Step model: each step has illustration + brand gradient + 3 feature chips +
  // tagline + body. i18n keys are looked up at render time so language switching
  // mid-tour works correctly.
  const mainSteps = [
    {
      emoji: '👨‍🍳',
      gradient: 'linear-gradient(135deg, #22c55e, #15803d)',
      titleKey: 'tour_welcome_title',
      taglineKey: 'tour_welcome_tagline',
      bodyKey: 'tour_welcome_body',
      chipKeys: ['tour_chip_live_cost', 'tour_chip_auto_sync', 'tour_chip_offline'],
    },
    {
      emoji: '📊',
      gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      titleKey: 'tour_cost_title',
      taglineKey: 'tour_cost_tagline',
      bodyKey: 'tour_cost_body',
      chipKeys: ['tour_chip_recipes', 'tour_chip_kitchen_cards', 'tour_chip_portion'],
    },
    {
      emoji: '🌡️',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      titleKey: 'tour_haccp_title',
      taglineKey: 'tour_haccp_tagline',
      bodyKey: 'tour_haccp_body',
      chipKeys: ['tour_chip_temp_logs', 'tour_chip_cook_cool', 'tour_chip_receiving'],
    },
    {
      emoji: '🚀',
      gradient: 'linear-gradient(135deg, #a855f7, #7e22ce)',
      titleKey: 'tour_start_title',
      taglineKey: 'tour_start_tagline',
      bodyKey: 'tour_start_body',
      chipKeys: ['tour_chip_try_free', 'tour_chip_no_card', 'tour_chip_sign_later'],
    },
  ];
  let stepIndex = 0;

  function renderStep() {
    const t = PCD.i18n.t;
    const s = mainSteps[stepIndex];
    const totalSteps = mainSteps.length;
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === totalSteps - 1;
    const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);

    const chipsHtml = s.chipKeys.map(function (k) {
      return '<span class="tutorial-chip">' + PCD.escapeHtml(t(k)) + '</span>';
    }).join('');

    const stepLabel = (t('tour_step_label') || 'STEP') + ' ' + (stepIndex + 1) + ' / ' + totalSteps;

    const nextLabel = isLast ? (t('tour_finish') || "Let's cook") : (t('next') || 'Next');
    const nextIcon = isLast ? '🚀' : '→';

    const html = `
      <div class="tutorial-illustration" aria-hidden="true">
        <div class="tutorial-illust-circle" style="background:${s.gradient};">
          <span class="tutorial-illust-emoji">${s.emoji}</span>
        </div>
      </div>

      <div class="tutorial-step">${PCD.escapeHtml(stepLabel)}</div>
      <div class="tutorial-title">${PCD.escapeHtml(t(s.titleKey))}</div>
      <div class="tutorial-tagline">${PCD.escapeHtml(t(s.taglineKey))}</div>
      <div class="tutorial-text">${PCD.escapeHtml(t(s.bodyKey))}</div>

      <div class="tutorial-chips">${chipsHtml}</div>

      <div class="tutorial-progress">
        <div class="tutorial-progress-bar" style="width:${progressPct}%;"></div>
      </div>

      <div class="tutorial-actions">
        <button class="btn btn-ghost btn-sm" data-tour-skip>${PCD.escapeHtml(t('skip'))}</button>
        <div class="tutorial-actions-right">
          ${!isFirst ? `<button class="btn btn-secondary btn-sm" data-tour-back>${PCD.escapeHtml(t('tour_back') || 'Back')}</button>` : ''}
          <button class="btn btn-primary" data-tour-next>${PCD.escapeHtml(nextLabel)} <span style="margin-left:4px;">${nextIcon}</span></button>
        </div>
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
    const back = b.querySelector('[data-tour-back]');
    const next = b.querySelector('[data-tour-next]');
    if (skip) skip.addEventListener('click', finishTour);
    if (back) back.addEventListener('click', function () {
      if (stepIndex > 0) {
        stepIndex--;
        renderStep();
      }
    });
    if (next) next.addEventListener('click', function () {
      stepIndex++;
      if (stepIndex >= mainSteps.length) finishTour();
      else renderStep();
    });
  }

  function finishTour() {
    // v2.6.93 — Tour tamamlama bayrağı localStorage'a taşındı. Önceden
    // state.onboarding.mainTourDone idi; ama state.onboarding cloud-pertable
    // sync zincirinde güvenilir yazılmıyor → her F5'te boot pull onboarding'i
    // boş çekiyor → tour yeniden açılıyordu. localStorage cloud-bağımsız ve
    // tek seferlik; tarayıcı temizlenmediği sürece F5/sign-in/out'tan etkilenmez.
    try { localStorage.setItem('pcd_tour_done', '1'); } catch (e) {}
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
    if (title === titleKey) { PCD.store.markToolSeen(toolKey); return; }

    const html = `
      <div class="tutorial-step">💡 ${PCD.escapeHtml(t('new').toUpperCase())}</div>
      <div class="tutorial-title">${PCD.escapeHtml(title)}</div>
      <div class="tutorial-text">${PCD.escapeHtml(text)}</div>
      <div class="tutorial-actions" style="margin-top:16px;">
        <label class="checkbox" style="font-size:12px;">
          <input type="checkbox" data-dontshow>
          <span>${PCD.escapeHtml(t('dont_show_again'))}</span>
        </label>
        <button class="btn btn-primary btn-sm" data-tip-ok>${PCD.escapeHtml(t('done'))}</button>
      </div>
    `;
    currentOverlay = createOverlay(html);
    const dontshow = currentOverlay.bubble.querySelector('[data-dontshow]');
    const okBtn = currentOverlay.bubble.querySelector('[data-tip-ok]');
    dontshow.checked = true; // default to "don't show" (user hits OK = dismiss permanently)
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
