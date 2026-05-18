/* ================================================================
   ProChefDesk — yield.js
   Yield Calculator — account for trim loss and cooking loss.

   Concept:
   - AP (As Purchased) cost = base ing.pricePerUnit
   - Yield % = (EP weight / AP weight) × 100
   - True cost (EP) = AP cost / (yield / 100)

   Common yields reference:
   - Whole chicken: 65-75% (after bone removal)
   - Salmon whole: 55-60% (head/skin/bones)
   - Beef tenderloin: 75-80% (fat/silver skin)
   - Lettuce: 70-80% (core/outer leaves)
   - Onion: 85-90% (skin/root)

   v2.9.0 — NAKED→RICH upgrade: closeable inline guide, per-field hints,
   stats hero, empty state CTA. Pattern: buffet v2.8.77 + v2.8.88.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Reference yields for common ingredients (used for quick-fill)
  const COMMON_YIELDS = [
    { keywords: ['chicken whole'], yield: 70 },
    { keywords: ['chicken breast'], yield: 88 },
    { keywords: ['chicken thigh'], yield: 75 },
    { keywords: ['beef tenderloin'], yield: 78 },
    { keywords: ['beef mince', 'ground beef'], yield: 95 },
    { keywords: ['salmon whole'], yield: 58 },
    { keywords: ['salmon fillet'], yield: 88 },
    { keywords: ['tuna'], yield: 75 },
    { keywords: ['shrimp', 'prawn'], yield: 50 },
    { keywords: ['lettuce'], yield: 75 },
    { keywords: ['cabbage'], yield: 80 },
    { keywords: ['onion'], yield: 88 },
    { keywords: ['carrot'], yield: 78 },
    { keywords: ['garlic'], yield: 90 },
    { keywords: ['tomato'], yield: 90 },
    { keywords: ['cucumber'], yield: 85 },
    { keywords: ['pepper', 'capsicum'], yield: 82 },
    { keywords: ['potato'], yield: 80 },
    { keywords: ['mushroom'], yield: 95 },
    { keywords: ['broccoli'], yield: 60 },
    { keywords: ['cauliflower'], yield: 55 },
    { keywords: ['pineapple'], yield: 53 },
    { keywords: ['watermelon'], yield: 52 },
    { keywords: ['mango'], yield: 70 },
  ];

  function suggestYield(ingredientName) {
    if (!ingredientName) return null;
    const lower = ingredientName.toLowerCase();
    for (let i = 0; i < COMMON_YIELDS.length; i++) {
      for (let j = 0; j < COMMON_YIELDS[i].keywords.length; j++) {
        if (lower.indexOf(COMMON_YIELDS[i].keywords[j]) >= 0) {
          return COMMON_YIELDS[i].yield;
        }
      }
    }
    return null;
  }

  // v2.9.0 — Yield % status bands. Visual signal for quick calc hero.
  function yieldStatus(pct) {
    if (pct == null || pct <= 0) return null;
    if (pct >= 80) return 'good';   // strong yield, minimal trim
    if (pct >= 60) return 'warn';   // moderate trim
    return 'bleed';                  // heavy trim, consider alt cut
  }
  function statusColor(s) {
    if (s === 'good') return '#16a34a';
    if (s === 'warn') return '#f59e0b';
    if (s === 'bleed') return '#dc2626';
    return '#6b7280';
  }

  function render(view) {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });
    const withYield = ings.filter(function (i) { return i.yieldPercent > 0; }).length;

    // v2.9.0 — Closeable inline guide. Preference persisted in localStorage.
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_yield_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('yield_title')}</div>
          <div class="page-subtitle">${t('yield_subtitle')}</div>
        </div>
      </div>

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('yield_guide_title') || 'How to use the Yield Calculator')}</span>
            <button type="button" id="yieldGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('yield_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('yield_guide_step1_title') || 'Weigh before + after trim')}</strong> — ${PCD.escapeHtml(t('yield_guide_step1_body') || 'Weigh the ingredient as it arrives (AP = As Purchased). Trim/peel/portion, then weigh the usable part (EP = Edible Portion).')}</li>
              <li><strong>${PCD.escapeHtml(t('yield_guide_step2_title') || 'Run the quick calculator')}</strong> — ${PCD.escapeHtml(t('yield_guide_step2_body') || 'Enter AP weight, EP weight and AP price. The tool returns yield %, trim loss and your true (EP) cost — the real number for recipe costing.')}</li>
              <li><strong>${PCD.escapeHtml(t('yield_guide_step3_title') || 'Save % per ingredient')}</strong> — ${PCD.escapeHtml(t('yield_guide_step3_body') || 'In the list below, set each ingredient’s yield % once. Suggested values appear for common items (chicken, salmon, onion, etc.) — adjust to your butcher / supplier reality.')}</li>
              <li><strong>${PCD.escapeHtml(t('yield_guide_step4_title') || 'Watch recipes update')}</strong> — ${PCD.escapeHtml(t('yield_guide_step4_body') || 'Recipes referencing those ingredients automatically use the trimmed cost, so your food cost % reflects what you actually pay per usable gram — not the wholesale invoice.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('yield_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('yield_guide_tip_body') || 'Trim a few orders, average them, lock the % in. Don’t re-measure every delivery — supplier consistency makes one careful pass enough for the year.')}
            </div>
          </div>
        </details>
      ` : ''}

      <div class="card mb-3" style="padding:16px;">
        <div style="font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>${PCD.escapeHtml(t('yield_quick_calc') || 'Quick calculator')}</span>
          <span class="text-muted text-sm" style="font-size:11px;font-weight:500;">${PCD.escapeHtml(t('yield_quick_calc_hint') || 'Weigh AP + EP once, get true cost')}</span>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('yield_as_purchased')} (weight)</label>
            <input type="number" class="input" id="qAP" placeholder="1000" step="0.01" min="0">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('yield_ap_help') || 'Raw weight before any trimming (skin, bones, stems included).')}</div>
          </div>
          <div class="field">
            <label class="field-label">${t('yield_edible_portion')} (weight)</label>
            <input type="number" class="input" id="qEP" placeholder="750" step="0.01" min="0">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('yield_ep_help') || 'Usable weight after trimming and prep.')}</div>
          </div>
        </div>
        <div class="field">
          <label class="field-label">${PCD.escapeHtml(t('yield_ap_price') || 'AP price')}</label>
          <input type="number" class="input" id="qAPprice" placeholder="10.00" step="0.01" min="0">
          <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('yield_ap_price_help') || 'What you paid for the full AP amount. Used for true cost calculation.')}</div>
        </div>

        <div class="stat" style="background:var(--brand-50);border-color:var(--brand-300);margin-top:12px;padding:14px;" id="qStatsCard">
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:10px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${t('yield_true_cost')}</div>
              <div style="font-size:32px;font-weight:900;color:var(--brand-700);line-height:1;letter-spacing:-0.02em;" id="qTrue">—</div>
            </div>
            <div style="flex:1;min-width:140px;">
              <span id="qStatusChip" style="display:none;padding:4px 10px;font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;"></span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><div class="stat-label" style="font-size:11px;">${t('yield_yield_percent')}</div><div style="font-size:18px;font-weight:700;" id="qYield">—</div></div>
            <div><div class="stat-label" style="font-size:11px;">${t('yield_trim_loss')}</div><div style="font-size:18px;font-weight:700;color:var(--danger);" id="qLoss">—</div></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span>${t('yield_apply_to_ing')}</span>
          ${ings.length ? '<span class="text-muted text-sm" style="font-size:11px;font-weight:500;text-transform:none;letter-spacing:0;">' + withYield + ' / ' + ings.length + ' ' + PCD.escapeHtml(t('yield_set_count') || 'have yield set') + '</span>' : ''}
        </div>
        <div id="yieldList" class="flex flex-col gap-2"></div>
      </div>
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#yieldGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_yield_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    // Quick calculator wiring
    function recalc() {
      const ap = parseFloat(PCD.$('#qAP', view).value) || 0;
      const ep = parseFloat(PCD.$('#qEP', view).value) || 0;
      const price = parseFloat(PCD.$('#qAPprice', view).value) || 0;
      const yp = ap > 0 ? (ep / ap) * 100 : 0;
      const loss = ap - ep;
      const lossPct = ap > 0 ? (loss / ap) * 100 : 0;
      const truePrice = ep > 0 && price > 0 ? price / (yp / 100) : 0;
      PCD.$('#qYield', view).textContent = yp > 0 ? PCD.fmtPercent(yp, 1) : '—';
      PCD.$('#qLoss', view).textContent = loss > 0 ? PCD.fmtNumber(loss) + ' (' + PCD.fmtPercent(lossPct, 0) + ')' : '—';
      PCD.$('#qTrue', view).textContent = truePrice > 0 ? PCD.fmtMoney(truePrice) + ' (AP total)' : '—';

      // v2.9.0 — Status chip + colored hero (band by yield %)
      const chip = PCD.$('#qStatusChip', view);
      const card = PCD.$('#qStatsCard', view);
      const trueEl = PCD.$('#qTrue', view);
      const status = yp > 0 ? yieldStatus(yp) : null;
      if (status) {
        const color = statusColor(status);
        const label = status === 'good' ? (t('yield_status_good') || 'Strong yield') :
                      status === 'warn' ? (t('yield_status_warn') || 'Moderate trim') :
                      (t('yield_status_bleed') || 'Heavy trim');
        chip.textContent = label;
        chip.style.display = 'inline-block';
        chip.style.background = color + '25';
        chip.style.color = color;
        card.style.borderColor = color;
        card.style.background = color + '12';
        trueEl.style.color = color;
      } else {
        chip.style.display = 'none';
        card.style.borderColor = 'var(--brand-300)';
        card.style.background = 'var(--brand-50)';
        trueEl.style.color = 'var(--brand-700)';
      }
    }
    ['qAP', 'qEP', 'qAPprice'].forEach(function (id) {
      PCD.$('#' + id, view).addEventListener('input', recalc);
    });

    // Ingredient yield list
    const listEl = PCD.$('#yieldList', view);
    if (ings.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-desc">${PCD.escapeHtml(t('yield_empty_title') || 'Add ingredients to set their yield %')}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:6px;line-height:1.5;">${PCD.escapeHtml(t('yield_empty_hint') || 'Yield % lets ProChefDesk show your real food cost — not just what you paid the supplier.')}</div>
          <button class="btn btn-primary mt-2" data-go-ing style="margin-top:10px;">${PCD.escapeHtml(t('yield_go_ingredients') || 'Go to Ingredients')}</button>
        </div>
      `;
      const goBtn = listEl.querySelector('[data-go-ing]');
      if (goBtn) goBtn.addEventListener('click', function () { PCD.router.go('ingredients'); });
      return;
    }
    ings.forEach(function (ing) {
      const row = PCD.el('div', { class: 'card', 'data-iid': ing.id, style: { padding: '12px' } });
      const yp = ing.yieldPercent;
      const trueCost = yp && yp > 0 ? (ing.pricePerUnit / (yp / 100)) : ing.pricePerUnit;
      const suggestion = suggestYield(ing.name);
      row.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;">${PCD.escapeHtml(ing.name)}</div>
            <div class="text-muted text-sm">
              AP: ${PCD.fmtMoney(ing.pricePerUnit)}/${ing.unit}
              ${yp ? ' · <span style="color:var(--brand-700);font-weight:600;">True: ' + PCD.fmtMoney(trueCost) + '/' + ing.unit + '</span>' : ''}
            </div>
          </div>
          <span class="chip${yp ? ' chip-brand' : ''}">${yp ? yp + '%' : 'not set'}</span>
        </div>
        <div class="flex items-center gap-2">
          <input type="number" class="input" data-yield-input value="${yp || ''}" min="1" max="100" placeholder="${suggestion || 'e.g. 75'}" style="flex:1;min-height:36px;padding:6px 10px;font-size:13px;">
          <span class="text-muted text-sm">%</span>
          ${suggestion ? '<button class="btn btn-outline btn-sm" data-suggest="' + suggestion + '" title="Suggested">Use ' + suggestion + '%</button>' : ''}
          <button class="btn btn-primary btn-sm" data-save>${t('save')}</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    PCD.on(listEl, 'click', '[data-suggest]', function () {
      const card = this.closest('[data-iid]');
      card.querySelector('[data-yield-input]').value = this.getAttribute('data-suggest');
    });
    PCD.on(listEl, 'click', '[data-save]', function () {
      const card = this.closest('[data-iid]');
      const iid = card.getAttribute('data-iid');
      const val = parseFloat(card.querySelector('[data-yield-input]').value);
      const ing = PCD.store.getIngredient(iid);
      if (!ing) return;
      if (isNaN(val) || val <= 0 || val > 100) {
        ing.yieldPercent = null;
      } else {
        ing.yieldPercent = val;
      }
      PCD.store.upsertIngredient(ing);
      PCD.toast.success(t('saved'));
      // Re-render
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'yield') render(v);
      }, 200);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.yield_calc = { render: render, suggestYield: suggestYield };
})();
