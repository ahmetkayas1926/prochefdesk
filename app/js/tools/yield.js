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

   Data: ing.yieldPercent = 75 (stored on ingredient)
   When set, recipe.computeFoodCost could optionally honor it, but for
   Phase 4 we compute "true cost" separately to avoid breaking Phase 1.
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

  function render(view) {
    const t = PCD.i18n.t;
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('yield_title')}</div>
          <div class="page-subtitle">${t('yield_subtitle')}</div>
        </div>
      </div>

      <div class="card mb-3" style="background:var(--info-bg);border-color:var(--info);padding:12px;">
        <div class="text-sm" style="color:var(--info);font-weight:500;line-height:1.5;">
          💡 ${t('yield_why')}
        </div>
      </div>

      <div class="card mb-3" style="padding:16px;">
        <div style="font-weight:700;margin-bottom:8px;">Quick calculator</div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('yield_as_purchased')} (weight)</label>
            <input type="number" class="input" id="qAP" placeholder="1000" step="0.01" min="0">
          </div>
          <div class="field">
            <label class="field-label">${t('yield_edible_portion')} (weight)</label>
            <input type="number" class="input" id="qEP" placeholder="750" step="0.01" min="0">
          </div>
        </div>
        <div class="field">
          <label class="field-label">AP price</label>
          <input type="number" class="input" id="qAPprice" placeholder="10.00" step="0.01" min="0">
        </div>
        <div class="stat" style="background:var(--brand-50);border-color:var(--brand-300);margin-top:8px;">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
            <div><div class="stat-label">${t('yield_yield_percent')}</div><div style="font-size:22px;font-weight:800;" id="qYield">—</div></div>
            <div><div class="stat-label">${t('yield_trim_loss')}</div><div style="font-size:22px;font-weight:800;color:var(--danger);" id="qLoss">—</div></div>
            <div style="text-align:end;"><div class="stat-label">${t('yield_true_cost')}</div><div style="font-size:22px;font-weight:800;color:var(--brand-700);" id="qTrue">—</div></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('yield_apply_to_ing')}</div>
        <div id="yieldList" class="flex flex-col gap-2"></div>
      </div>
    `;

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
    }
    ['qAP', 'qEP', 'qAPprice'].forEach(function (id) {
      PCD.$('#' + id, view).addEventListener('input', recalc);
    });

    // Ingredient yield list
    const listEl = PCD.$('#yieldList', view);
    if (ings.length === 0) {
      listEl.innerHTML = '<div class="empty"><div class="empty-desc">' + t('no_ingredients_yet') + '</div></div>';
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
