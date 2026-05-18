/* ================================================================
   ProChefDesk — buffet.js (v2.8.73)
   ----------------------------------------------------------------
   BUFFET PLANNER — profesyonel otel/catering tool.

   A la carte tarif maliyetinden farklı bir mental model:
   - Misafir başına flat ticket fiyatı (set menu değil)
   - Item başına consumption ratio (hot proteins %85, fruit %55 vb.)
   - Refill multiplier (servis süresi + talep dalgalanması)
   - Stations (cold/hot/bakery/dessert/beverage)
   - Per-cover cost + waste projection + margin

   Sektör standartları (constants):
     INDUSTRY_RATIOS — chef düzenleyebilir ama defaults sektör değeri
     INDUSTRY_REFILL — buffet type'a göre refill multiplier
     INDUSTRY_TARGETS — food cost % hedefleri (a la carte'tan düşük)

   Veri tek IDB tablosunda saklanır (`buffets`). Cloud sync opsiyonel
   (sonraki round; şu an local-only — sub-recipe expansion v2.8.69
   `flattenIngredients` ile shopping list path'i çalışır).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // ---------- SEKTÖR SABİTLERİ ----------

  // Hotel/catering endüstri tüketim oranları (chef değiştirebilir).
  // Kaynak: Cornell hospitality, Marriott/Hilton banquet ops manuals,
  // bir şefin uzun süreli buffet servis tecrübesi.
  const INDUSTRY_RATIOS = {
    hot_protein:   0.85,  // scrambled eggs, bacon, sausage — yüksek pickup
    hot_carb:      0.70,  // pasta, rice, potato — düşük plate fraction
    hot_veg:       0.55,  // roasted veg, gratins — orta
    cold_protein:  0.45,  // smoked salmon, charcuterie, cold cuts
    cold_veg:      0.40,  // crudité, antipasti, salads
    cheese:        0.35,  // cheese platters — düşük per-guest
    fruit_fresh:   0.55,  // taze meyve — mevsim/cuts'a göre değişir
    fruit_dried:   0.20,  // kuru meyve, nuts
    bakery:        0.70,  // croissants, breads, pastries
    dessert:       0.60,  // küçük tatlılar, mini cakes
    yogurt_cereal: 0.35,  // breakfast yoğurt, granola, müsli
    beverage_hot:  0.85,  // kahve, çay — herkes alır
    beverage_cold: 0.95,  // su, juice — herkes alır
    other:         0.60,  // default fallback
  };

  // Buffet type'ına göre refill multiplier (toplam prep = misafir × per_guest × refillX).
  // Endüstri: rest. açık olduğu süre boyunca dolu görünmeli; ilk prep + N refill.
  const INDUSTRY_REFILL = {
    breakfast: 1.20,  // 2-3 saat, talep dalga halinde
    brunch:    1.35,  // 3-4 saat, yoğun dalga
    lunch:     1.25,  // 1.5-2 saat, kısa ama yoğun
    dinner:    1.30,  // 2-3 saat, hızlı tüketim
    cocktail:  1.15,  // 1-2 saat, küçük porsiyonlar
    custom:    1.25,  // genel default
  };

  // Hedef food cost % aralıkları (renk kodlu uyarı için).
  // Buffet a la carte'tan düşük: volume + waste tolerance birleşince.
  const INDUSTRY_TARGETS = {
    breakfast: { good: 22, warn: 28, max: 35 },  // breakfast en düşük (cheap items)
    brunch:    { good: 26, warn: 32, max: 40 },
    lunch:     { good: 25, warn: 32, max: 38 },
    dinner:    { good: 28, warn: 35, max: 42 },
    cocktail:  { good: 22, warn: 28, max: 35 },  // küçük porsiyon, yüksek margin
    custom:    { good: 25, warn: 32, max: 38 },
  };

  // Station tipleri (default sıralama: önce cold, sonra hot, sonra dessert).
  const STATION_TYPES = [
    { id: 'cold',     labelKey: 'buffet_station_cold',     icon: 'snowflake',   color: '#3b82f6' },
    { id: 'hot',      labelKey: 'buffet_station_hot',      icon: 'thermometer', color: '#ef4444' },
    { id: 'bakery',   labelKey: 'buffet_station_bakery',   icon: 'package',     color: '#f59e0b' },
    { id: 'dessert',  labelKey: 'buffet_station_dessert',  icon: 'check-square',color: '#ec4899' },
    { id: 'beverage', labelKey: 'buffet_station_beverage', icon: 'activity',    color: '#10b981' },
    { id: 'other',    labelKey: 'buffet_station_other',    icon: 'grid',        color: '#64748b' },
  ];

  const BUFFET_TYPES = [
    { id: 'breakfast', labelKey: 'buffet_type_breakfast', priceHint: '25-45' },
    { id: 'brunch',    labelKey: 'buffet_type_brunch',    priceHint: '60-95' },
    { id: 'lunch',     labelKey: 'buffet_type_lunch',     priceHint: '35-60' },
    { id: 'dinner',    labelKey: 'buffet_type_dinner',    priceHint: '55-85' },
    { id: 'cocktail',  labelKey: 'buffet_type_cocktail',  priceHint: '40-70' },
    { id: 'custom',    labelKey: 'buffet_type_custom',    priceHint: '—' },
  ];

  // ---------- IDB STORAGE (workspace-scoped) ----------

  function readBuffets() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('buffets') || {};
    if (Array.isArray(root)) return root; // legacy flat
    return root[wsId] || [];
  }

  function writeBuffets(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('buffets') || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    next[wsId] = arr;
    PCD.store.set('buffets', next);
  }

  function getBuffet(id) {
    return readBuffets().find(function (b) { return b.id === id; }) || null;
  }

  function upsertBuffet(b) {
    const all = readBuffets().slice();
    if (b.id) {
      const i = all.findIndex(function (x) { return x.id === b.id; });
      if (i >= 0) all[i] = Object.assign({}, b, { updatedAt: new Date().toISOString() });
      else all.push(Object.assign({}, b, { updatedAt: new Date().toISOString() }));
    } else {
      b.id = PCD.uid('bf');
      b.createdAt = new Date().toISOString();
      b.updatedAt = b.createdAt;
      all.push(b);
    }
    writeBuffets(all);
    return b;
  }

  function deleteBuffet(id) {
    writeBuffets(readBuffets().filter(function (b) { return b.id !== id; }));
  }

  // ---------- COST HESAP ----------

  // Bir buffet item'ının prep miktarı + cost'unu hesaplar.
  // Sub-recipe expansion otomatik (computeFoodCost zaten recursive v2.8.16+).
  function computeItemCost(item, recipe, ingMap, recipeMap, coverCount, refillX) {
    if (!recipe || !item) return { prepAmount: 0, prepCost: 0, expectedConsume: 0, expectedWaste: 0 };
    const perGuest = Number(item.amountPerGuest) || 0;
    const pickup = item.pickupRatio != null ? Number(item.pickupRatio) : 0.6;
    const itemRefill = item.refillX != null ? Number(item.refillX) : refillX;
    // Total preparation: covers × per_guest × refill_multiplier
    const prepAmount = coverCount * perGuest * itemRefill;
    // Recipe's full cost relative to its yield
    const recipeYield = Number(recipe.yieldAmount) || Number(recipe.servings) || 1;
    const totalRecipeCost = PCD.recipes.computeFoodCost(recipe, ingMap, recipeMap);
    const costPerUnit = totalRecipeCost / (recipeYield || 1);
    // Unit conversion (item.unit vs recipe.yieldUnit) — best-effort
    let prepAmountInRecipeUnit = prepAmount;
    if (item.unit && recipe.yieldUnit && item.unit !== recipe.yieldUnit) {
      try { prepAmountInRecipeUnit = PCD.convertUnit(prepAmount, item.unit, recipe.yieldUnit); } catch (e) {}
    }
    const prepCost = costPerUnit * prepAmountInRecipeUnit;
    // Expected actual consumption (pickup ratio applied)
    const expectedConsume = coverCount * perGuest * pickup;
    const expectedConsumeInRecipeUnit = (function () {
      if (item.unit && recipe.yieldUnit && item.unit !== recipe.yieldUnit) {
        try { return PCD.convertUnit(expectedConsume, item.unit, recipe.yieldUnit); } catch (e) {}
      }
      return expectedConsume;
    })();
    const consumeCost = costPerUnit * expectedConsumeInRecipeUnit;
    const expectedWaste = Math.max(0, prepCost - consumeCost);
    return {
      prepAmount: prepAmount,
      prepCost: prepCost,
      expectedConsume: expectedConsume,
      expectedConsumeCost: consumeCost,
      expectedWaste: expectedWaste,
      wastePct: prepCost > 0 ? (expectedWaste / prepCost) * 100 : 0,
    };
  }

  // Buffet-bütünü totals.
  function computeBuffetTotals(buffet, ingMap, recipeMap) {
    const coverCount = Number(buffet.coverCount) || 0;
    const ticketPrice = Number(buffet.ticketPrice) || 0;
    const refillX = buffet.refillMultiplier != null
      ? Number(buffet.refillMultiplier)
      : (INDUSTRY_REFILL[buffet.type] || INDUSTRY_REFILL.custom);
    let totalPrepCost = 0;
    let totalExpectedWaste = 0;
    let itemCount = 0;
    (buffet.stations || []).forEach(function (st) {
      (st.items || []).forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        if (!r) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, coverCount, refillX);
        totalPrepCost += c.prepCost;
        totalExpectedWaste += c.expectedWaste;
        itemCount++;
      });
    });
    const revenue = coverCount * ticketPrice;
    const perGuestCost = coverCount > 0 ? totalPrepCost / coverCount : 0;
    const foodCostPct = revenue > 0 ? (totalPrepCost / revenue) * 100 : 0;
    const profitPerCover = ticketPrice - perGuestCost;
    const targets = INDUSTRY_TARGETS[buffet.type] || INDUSTRY_TARGETS.custom;
    return {
      coverCount: coverCount,
      ticketPrice: ticketPrice,
      revenue: revenue,
      totalPrepCost: totalPrepCost,
      totalExpectedWaste: totalExpectedWaste,
      perGuestCost: perGuestCost,
      foodCostPct: foodCostPct,
      profitPerCover: profitPerCover,
      itemCount: itemCount,
      refillX: refillX,
      targets: targets,
      // status: 'good' | 'warn' | 'bad'
      status: foodCostPct <= targets.good ? 'good' : (foodCostPct <= targets.warn ? 'warn' : 'bad'),
    };
  }

  function statusColor(s) {
    if (s === 'good') return '#16a34a';
    if (s === 'warn') return '#f59e0b';
    return '#dc2626';
  }

  // ---------- LIST VIEW ----------

  function render(view) {
    const t = PCD.i18n.t;
    const buffets = readBuffets().slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('buffet_title') || 'Buffet Planner'}</div>
          <div class="page-subtitle">${buffets.length} ${buffets.length === 1 ? (t('buffet_single') || 'buffet') : (t('buffet_plural') || 'buffets')}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="newBuffetBtn">+ ${t('buffet_new') || 'New Buffet'}</button>
        </div>
      </div>
      <div id="buffetList"></div>
    `;

    const listEl = PCD.$('#buffetList', view);
    if (buffets.length === 0) {
      listEl.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🥘</div>' +
          '<div class="empty-title">' + PCD.escapeHtml(t('buffet_empty_title') || 'No buffets yet') + '</div>' +
          '<div class="empty-desc">' + PCD.escapeHtml(t('buffet_empty_desc') || 'Plan your next breakfast, brunch, or catering buffet. Hotel-standard cost + waste calculations built-in.') + '</div>' +
          '<div class="empty-action"><button class="btn btn-primary" id="emptyNewBuffet">+ ' + PCD.escapeHtml(t('buffet_new') || 'New Buffet') + '</button></div>' +
        '</div>';
      const eb = PCD.$('#emptyNewBuffet', listEl);
      if (eb) eb.addEventListener('click', function () { openEditor(); });
    } else {
      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      buffets.forEach(function (b) {
        const totals = computeBuffetTotals(b, ingMap, recipeMap);
        const dateStr = b.serviceDate ? PCD.fmtDate(b.serviceDate) : '—';
        const typeLabel = (BUFFET_TYPES.find(function (x) { return x.id === b.type; }) || {});
        const row = PCD.el('div', { class: 'list-item', 'data-bid': b.id, style: { cursor: 'pointer' } });
        row.innerHTML =
          '<div class="list-item-thumb" style="background:' + statusColor(totals.status) + '20;color:' + statusColor(totals.status) + ';font-weight:700;font-size:14px;">' + totals.foodCostPct.toFixed(0) + '%</div>' +
          '<div class="list-item-body">' +
            '<div class="list-item-title">' + PCD.escapeHtml(b.name || t('untitled')) + '</div>' +
            '<div class="list-item-meta">' +
              '<span>' + PCD.escapeHtml(t(typeLabel.labelKey) || b.type || '—') + '</span>' +
              '<span>·</span>' +
              '<span>' + totals.coverCount + ' ' + PCD.escapeHtml(t('buffet_covers') || 'covers') + '</span>' +
              '<span>·</span>' +
              '<span>' + dateStr + '</span>' +
              '<span>·</span>' +
              '<span style="font-weight:700;color:' + statusColor(totals.status) + ';">' + PCD.fmtMoney(totals.totalPrepCost) + '</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="icon-btn" data-buf-dup="' + b.id + '" title="' + PCD.escapeHtml(t('buffet_duplicate') || 'Duplicate') + '">' + PCD.icon('copy', 18) + '</button>' +
          '<button type="button" class="icon-btn" data-buf-edit="' + b.id + '" title="' + PCD.escapeHtml(t('edit') || 'Edit') + '">' + PCD.icon('edit', 18) + '</button>';
        cont.appendChild(row);
      });
      listEl.appendChild(cont);
    }

    PCD.$('#newBuffetBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-bid]', function (e) {
      if (e.target.closest('[data-buf-edit]') || e.target.closest('[data-buf-dup]')) return;
      openEditor(this.getAttribute('data-bid'));
    });
    PCD.on(listEl, 'click', '[data-buf-edit]', function (e) {
      e.stopPropagation();
      openEditor(this.getAttribute('data-buf-edit'));
    });
    PCD.on(listEl, 'click', '[data-buf-dup]', function (e) {
      e.stopPropagation();
      const src = getBuffet(this.getAttribute('data-buf-dup'));
      if (!src) return;
      const copy = PCD.clone(src);
      delete copy.id; delete copy.createdAt; delete copy.updatedAt;
      copy.name = (copy.name || t('untitled')) + ' (Copy)';
      (copy.stations || []).forEach(function (st) {
        st.id = PCD.uid('bst');
        (st.items || []).forEach(function (it) { it.id = PCD.uid('bit'); });
      });
      const saved = upsertBuffet(copy);
      PCD.toast.success(t('buffet_duplicated') || 'Buffet duplicated');
      render(view);
      setTimeout(function () { openEditor(saved.id); }, 200);
    });
  }

  // ---------- EDITOR ----------

  function openEditor(bid) {
    const t = PCD.i18n.t;
    const existing = bid ? getBuffet(bid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '',
      type: 'breakfast',
      coverCount: 50,
      ticketPrice: 45,
      serviceDate: new Date().toISOString().slice(0, 10),
      durationHours: 2.5,
      refillMultiplier: null,  // null = use industry default for type
      notes: '',
      stations: STATION_TYPES.slice(0, 3).map(function (st) {  // cold, hot, bakery by default
        return { id: PCD.uid('bst'), name: PCD.i18n.t(st.labelKey) || st.id, type: st.id, items: [] };
      }),
    };
    // Defansif: eski buffet'lerde eksik field'lar
    if (!Array.isArray(data.stations)) data.stations = [];
    data.stations.forEach(function (st) {
      if (!st.id) st.id = PCD.uid('bst');
      if (!Array.isArray(st.items)) st.items = [];
      st.items.forEach(function (it) { if (!it.id) it.id = PCD.uid('bit'); });
    });

    const body = PCD.el('div');

    function refreshTotals() {
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = PCD.recipes.buildRecipeMap();
      return computeBuffetTotals(data, ingMap, recipeMap);
    }

    function renderEditor() {
      const totals = refreshTotals();
      const ingMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      const recipeMap = PCD.recipes.buildRecipeMap();
      const refillForType = INDUSTRY_REFILL[data.type] || INDUSTRY_REFILL.custom;
      const refillEffective = data.refillMultiplier != null ? Number(data.refillMultiplier) : refillForType;
      const typeOptions = BUFFET_TYPES.map(function (bt) {
        return '<option value="' + bt.id + '"' + (data.type === bt.id ? ' selected' : '') + '>' + PCD.escapeHtml(PCD.i18n.t(bt.labelKey) || bt.id) + '</option>';
      }).join('');

      // v2.8.77 — Inline guide panel. Closable; preference persisted in
       // localStorage so a returning chef doesn't see it again unless they
       // explicitly re-open. Helps first-time users understand the workflow.
      const guideHidden = (function () {
        try { return localStorage.getItem('pcd_buffet_guide_hidden') === '1'; } catch (e) { return false; }
      })();

      body.innerHTML = `
        ${!guideHidden ? `
          <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
            <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
              <span style="font-size:16px;">💡</span>
              <span style="flex:1;">${PCD.escapeHtml(t('buffet_guide_title') || 'How to use the Buffet Planner')}</span>
              <button type="button" id="bufGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('buffet_guide_dismiss') || 'Hide')}">✕</button>
            </summary>
            <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
              <ol style="margin:0;padding-inline-start:20px;">
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step1_title') || 'Set the basics')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step1_body') || 'Name (e.g. "Sunday Brunch — 5 Star"), type (breakfast/brunch/lunch/dinner/cocktail), guest count, ticket price per cover. The system loads industry-default refill and target food cost % automatically.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step2_title') || 'Add stations + items')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step2_body') || 'Each section of the buffet (Cold, Hot, Bakery...) is a station. Inside a station, pick recipes from your library. Sub-recipes (e.g. labneh) auto-cascade to real ingredients in shopping list + cost.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step3_title') || 'Tune per-guest amounts')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step3_body') || 'For each item: how many grams/ml per guest, and the realistic pickup % (what fraction actually gets eaten). Defaults follow hotel industry norms — adjust to your venue history.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step4_title') || 'Check the numbers')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step4_body') || 'Live stats panel shows food cost %, per-cover cost, and expected waste. Green = on target, amber = warning, red = bleeding. Adjust portion or price to land in the green.')}</li>
                <li><strong>${PCD.escapeHtml(t('buffet_guide_step5_title') || 'Print the outputs')}</strong> — ${PCD.escapeHtml(t('buffet_guide_step5_body') || 'Prep List = A4 for the kitchen (item + amount + checkbox per row, station-grouped). Cost Report = chef P&L summary with per-station breakdown + waste projection.')}</li>
              </ol>
              <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
                <strong>💎 ${PCD.escapeHtml(t('buffet_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('buffet_guide_tip_body') || 'After the first run, duplicate the buffet for next week and just change the date + cover count. Your station setup and portions stay locked in.')}
              </div>
            </div>
          </details>
        ` : ''}

        <div class="field">
          <label class="field-label">${t('buffet_name_label') || 'Buffet name'} *</label>
          <div class="text-muted text-sm" style="font-size:12px;margin-bottom:4px;">${PCD.escapeHtml(t('buffet_name_help') || 'A short, recognisable label. Shown in the buffet list and on printed sheets.')}</div>
          <input type="text" class="input" id="bufName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${PCD.escapeHtml(t('buffet_name_ph') || 'e.g. Sunday Brunch — 5 Star')}">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field">
            <label class="field-label">${t('buffet_type_label') || 'Type'}</label>
            <select class="select" id="bufType">${typeOptions}</select>
          </div>
          <div class="field">
            <label class="field-label">${t('buffet_date_label') || 'Service date'}</label>
            <input type="date" class="input" id="bufDate" value="${PCD.escapeHtml(data.serviceDate || '')}">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="field">
            <label class="field-label">${t('buffet_covers_label') || 'Covers (guests)'}</label>
            <input type="number" class="input" id="bufCovers" value="${data.coverCount}" min="1" step="1">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('buffet_covers_help') || 'Expected paying guests. Drives all prep calculations.')}</div>
          </div>
          <div class="field">
            <label class="field-label">${t('buffet_price_label') || 'Ticket price'}</label>
            <input type="number" class="input" id="bufPrice" value="${data.ticketPrice}" min="0" step="0.01">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${PCD.escapeHtml(t('buffet_price_help') || 'Per-guest flat price. Used for revenue + food cost % targeting.')}</div>
          </div>
          <div class="field">
            <label class="field-label" title="${PCD.escapeHtml(t('buffet_refill_hint') || 'How much to over-prep for refills. Industry default by type. Override for tight events.')}">${t('buffet_refill_label') || 'Refill ×'}</label>
            <input type="number" class="input" id="bufRefill" value="${refillEffective}" min="1" step="0.05" placeholder="${refillForType}">
            <div class="text-muted text-sm" style="font-size:11px;margin-top:2px;">${(t('buffet_refill_default') || 'Industry default for')} ${PCD.escapeHtml(t((BUFFET_TYPES.find(function(x){return x.id===data.type;})||{}).labelKey) || data.type)}: ${refillForType}× · ${PCD.escapeHtml(t('buffet_refill_help_short') || 'Higher = safer (less stockout), more waste')}</div>
          </div>
        </div>

        <!-- Live stats panel — sektör benchmark + renk uyarısı -->
        <div class="stat mb-3" style="background:linear-gradient(135deg,${statusColor(totals.status)}15,var(--surface));border-color:${statusColor(totals.status)};padding:14px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:10px;">
            <div>
              <div class="stat-label">${t('buffet_stat_revenue') || 'Revenue'}</div>
              <div style="font-size:18px;font-weight:800;">${PCD.fmtMoney(totals.revenue)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_total_cost') || 'Spread cost'}</div>
              <div style="font-size:18px;font-weight:800;">${PCD.fmtMoney(totals.totalPrepCost)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_per_cover') || 'Per cover'}</div>
              <div style="font-size:18px;font-weight:800;">${PCD.fmtMoney(totals.perGuestCost)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_food_cost_pct') || 'Food cost %'}</div>
              <div style="font-size:18px;font-weight:800;color:${statusColor(totals.status)};">${totals.foodCostPct.toFixed(1)}%</div>
              <div class="text-muted text-sm" style="font-size:10px;">${t('buffet_target') || 'target'}: ≤${totals.targets.good}% / ≤${totals.targets.warn}%</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_profit') || 'Profit / cover'}</div>
              <div style="font-size:18px;font-weight:800;color:${totals.profitPerCover > 0 ? 'var(--success)' : 'var(--danger)'};">${PCD.fmtMoney(totals.profitPerCover)}</div>
            </div>
            <div>
              <div class="stat-label">${t('buffet_stat_waste') || 'Expected waste'}</div>
              <div style="font-size:18px;font-weight:800;color:var(--text-3);">${PCD.fmtMoney(totals.totalExpectedWaste)}</div>
            </div>
          </div>
        </div>

        <!-- Stations -->
        <div class="section" style="margin-bottom:14px;">
          <div class="section-header">
            <div class="section-title">${t('buffet_stations_title') || 'Stations'}</div>
            <button class="btn btn-outline btn-sm" id="addStationBtn">+ ${t('buffet_add_station') || 'Add Station'}</button>
          </div>
          <div class="text-muted text-sm" style="font-size:12px;margin-bottom:8px;">${PCD.escapeHtml(t('buffet_stations_help') || 'A station = a physical section of the buffet (Cold Items, Hot Items, Bakery...). Inside, add recipes with per-guest amounts.')}</div>
          <div id="bufStationsList" class="flex flex-col gap-3"></div>
        </div>

        <div class="field">
          <label class="field-label">${t('buffet_notes_label') || 'Notes (chef memo, allergen alerts, VIP)'}</label>
          <textarea class="textarea" id="bufNotes" rows="2">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>
      `;

      // Render each station
      const stListEl = PCD.$('#bufStationsList', body);
      if (data.stations.length === 0) {
        stListEl.innerHTML = '<div class="card" style="padding:18px;text-align:center;color:var(--text-3);font-size:13px;line-height:1.5;background:var(--surface-2);border:1px dashed var(--border-strong);">' +
          '<div style="font-size:24px;margin-bottom:6px;">🍽️</div>' +
          '<div><strong>' + PCD.escapeHtml(t('buffet_no_stations_title') || 'No stations yet') + '</strong></div>' +
          '<div style="margin-top:4px;">' + PCD.escapeHtml(t('buffet_no_stations_body') || 'Click "+ Add Station" above to start. A typical breakfast buffet has Cold, Hot, Bakery, and Beverage stations.') + '</div>' +
        '</div>';
      }
      data.stations.forEach(function (st, sIdx) {
        const stTypeMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
        const secEl = PCD.el('div', { class: 'card', 'data-st-id': st.id, style: { padding: '12px', borderLeft: '4px solid ' + stTypeMeta.color } });

        let itemsHtml = '';
        st.items.forEach(function (it, iIdx) {
          const r = it.recipeId ? recipeMap[it.recipeId] : null;
          const recipeName = r ? r.name : (it.customName || '(removed recipe)');
          const c = r ? computeItemCost(it, r, ingMap, recipeMap, data.coverCount, refillEffective) : null;
          const pickup = it.pickupRatio != null ? it.pickupRatio : (INDUSTRY_RATIOS[st.type === 'cold' ? 'cold_protein' : (st.type === 'hot' ? 'hot_protein' : (st.type === 'bakery' ? 'bakery' : (st.type === 'dessert' ? 'dessert' : (st.type === 'beverage' ? 'beverage_cold' : 'other'))))]);
          itemsHtml +=
            '<div style="padding:8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);margin-bottom:6px;" data-it-id="' + it.id + '">' +
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:140px;font-weight:600;font-size:14px;">' + PCD.escapeHtml(recipeName) + '</div>' +
                '<button class="icon-btn" data-it-del="' + sIdx + ':' + iIdx + '" title="' + PCD.escapeHtml(t('delete') || 'Delete') + '">' + PCD.icon('x', 14) + '</button>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;font-size:12px;">' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_per_guest') || 'Per guest') + '</label>' +
                  '<input type="number" class="input" data-it-amt="' + sIdx + ':' + iIdx + '" value="' + (it.amountPerGuest || '') + '" step="0.01" min="0" style="padding:4px 6px;font-size:12px;">' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_unit') || 'Unit') + '</label>' +
                  '<input type="text" class="input" data-it-unit="' + sIdx + ':' + iIdx + '" value="' + PCD.escapeHtml(it.unit || '') + '" placeholder="g, ml, pc" style="padding:4px 6px;font-size:12px;">' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;" title="' + PCD.escapeHtml(t('buffet_pickup_hint') || 'What % of prepared amount will actually be eaten') + '">' + (t('buffet_pickup') || 'Pickup %') + '</label>' +
                  '<input type="number" class="input" data-it-pickup="' + sIdx + ':' + iIdx + '" value="' + (pickup * 100).toFixed(0) + '" min="0" max="100" step="5" style="padding:4px 6px;font-size:12px;">' +
                '</div>' +
                '<div>' +
                  '<label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;">' + (t('buffet_prep_total') || 'Prep total') + '</label>' +
                  '<div style="padding:4px 6px;font-weight:700;color:' + stTypeMeta.color + ';font-size:13px;">' + (c ? PCD.fmtNumber(c.prepAmount) + ' ' + (it.unit || '') : '—') + '</div>' +
                '</div>' +
              '</div>' +
              (c ? '<div class="text-muted text-sm" style="margin-top:4px;font-size:11px;">' +
                  PCD.fmtMoney(c.prepCost) + ' ' + (t('buffet_prep_cost') || 'prep cost') + ' · ' +
                  PCD.fmtMoney(c.expectedWaste) + ' ' + (t('buffet_expected_waste') || 'expected waste') +
                  (c.wastePct > 25 ? ' <span style="color:var(--danger);font-weight:700;">⚠ ' + c.wastePct.toFixed(0) + '%</span>' : '') +
              '</div>' : '') +
            '</div>';
        });

        const stationTypeBtns = STATION_TYPES.map(function (stt) {
          return '<option value="' + stt.id + '"' + (st.type === stt.id ? ' selected' : '') + '>' + PCD.escapeHtml(PCD.i18n.t(stt.labelKey) || stt.id) + '</option>';
        }).join('');

        secEl.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
            '<span style="color:' + stTypeMeta.color + ';flex-shrink:0;">' + PCD.icon(stTypeMeta.icon, 18) + '</span>' +
            '<input type="text" class="input" data-st-name="' + sIdx + '" value="' + PCD.escapeHtml(st.name || '') + '" placeholder="' + PCD.escapeHtml(t('buffet_station_name_ph') || 'Station name') + '" style="flex:1;min-width:120px;font-weight:600;">' +
            '<select class="select" data-st-type="' + sIdx + '" style="max-width:130px;font-size:12px;">' + stationTypeBtns + '</select>' +
            '<button class="icon-btn" data-st-del="' + sIdx + '" title="' + PCD.escapeHtml(t('delete') || 'Delete') + '">' + PCD.icon('trash', 16) + '</button>' +
          '</div>' +
          itemsHtml +
          '<button class="btn btn-ghost btn-sm" data-st-add-item="' + sIdx + '" style="width:100%;margin-top:4px;">+ ' + PCD.escapeHtml(t('buffet_add_item') || 'Add Item') + '</button>';
        stListEl.appendChild(secEl);
      });

      wireEditor();
    }

    function wireEditor() {
      // v2.8.77 — Guide dismiss persistence
      const dismissBtn = PCD.$('#bufGuideDismiss', body);
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { localStorage.setItem('pcd_buffet_guide_hidden', '1'); } catch (err) {}
          const detailsEl = this.closest('details');
          if (detailsEl) detailsEl.style.display = 'none';
        });
      }

      // Top fields
      PCD.$('#bufName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#bufType', body).addEventListener('change', function () {
        data.type = this.value;
        // Reset refill to industry default for this type
        data.refillMultiplier = null;
        renderEditor();
      });
      PCD.$('#bufDate', body).addEventListener('change', function () { data.serviceDate = this.value; });
      PCD.$('#bufCovers', body).addEventListener('input', function () {
        const v = parseInt(this.value, 10);
        if (!isNaN(v) && v >= 1) {
          data.coverCount = v;
          renderEditor();
        }
      });
      PCD.$('#bufPrice', body).addEventListener('input', function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 0) {
          data.ticketPrice = v;
          renderEditor();
        }
      });
      PCD.$('#bufRefill', body).addEventListener('input', function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 1) {
          data.refillMultiplier = v;
          renderEditor();
        }
      });
      PCD.$('#bufNotes', body).addEventListener('input', function () { data.notes = this.value; });

      // Add station
      PCD.$('#addStationBtn', body).addEventListener('click', function () {
        data.stations.push({
          id: PCD.uid('bst'),
          name: PCD.i18n.t('buffet_new_station') || 'New Station',
          type: 'other',
          items: [],
        });
        renderEditor();
      });

      // Station name + type + delete
      PCD.on(body, 'input', '[data-st-name]', PCD.debounce(function () {
        const sIdx = parseInt(this.getAttribute('data-st-name'), 10);
        if (data.stations[sIdx]) data.stations[sIdx].name = this.value;
      }, 300));
      PCD.on(body, 'change', '[data-st-type]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-type'), 10);
        if (data.stations[sIdx]) { data.stations[sIdx].type = this.value; renderEditor(); }
      });
      PCD.on(body, 'click', '[data-st-del]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-del'), 10);
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: PCD.i18n.t('buffet_confirm_del_station') || 'Delete this station?',
          text: PCD.i18n.t('buffet_confirm_del_station_body') || 'All items in this station will be removed too.',
          okText: PCD.i18n.t('delete') || 'Delete',
        }).then(function (ok) {
          if (!ok) return;
          data.stations.splice(sIdx, 1);
          renderEditor();
        });
      });

      // Item add — recipe picker
      PCD.on(body, 'click', '[data-st-add-item]', function () {
        const sIdx = parseInt(this.getAttribute('data-st-add-item'), 10);
        const sec = data.stations[sIdx];
        if (!sec) return;
        const items = PCD.store.listRecipes().map(function (r) {
          return { id: r.id, name: r.name, meta: PCD.i18n.t(r.category || 'cat_main'), thumb: r.photo || '' };
        });
        if (items.length === 0) { PCD.toast.warning(PCD.i18n.t('no_recipes_yet')); return; }
        PCD.picker.open({
          title: PCD.i18n.t('buffet_pick_recipe') || 'Pick recipe',
          items: items, multi: true,
        }).then(function (selIds) {
          if (!selIds || !selIds.length) return;
          // Industry default consumption ratio for this station type
          const defaultPickupKey = sec.type === 'cold' ? 'cold_protein' : (sec.type === 'hot' ? 'hot_protein' : (sec.type === 'bakery' ? 'bakery' : (sec.type === 'dessert' ? 'dessert' : (sec.type === 'beverage' ? 'beverage_cold' : 'other'))));
          selIds.forEach(function (rid) {
            const r = PCD.store.getRecipe(rid);
            sec.items.push({
              id: PCD.uid('bit'),
              recipeId: rid,
              amountPerGuest: r && r.yieldUnit === 'g' ? 60 : (r && r.yieldUnit === 'ml' ? 100 : 1),
              unit: (r && r.yieldUnit) || 'portion',
              pickupRatio: INDUSTRY_RATIOS[defaultPickupKey] || 0.6,
              refillX: null,  // null = use buffet-level refill
            });
          });
          renderEditor();
        });
      });

      // Item field handlers
      function pickIdx(attr, el) {
        const parts = el.getAttribute(attr).split(':').map(Number);
        return { sIdx: parts[0], iIdx: parts[1] };
      }
      PCD.on(body, 'input', '[data-it-amt]', PCD.debounce(function () {
        const p = pickIdx('data-it-amt', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          data.stations[p.sIdx].items[p.iIdx].amountPerGuest = parseFloat(this.value) || 0;
          renderEditor();
        }
      }, 400));
      PCD.on(body, 'input', '[data-it-unit]', PCD.debounce(function () {
        const p = pickIdx('data-it-unit', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          data.stations[p.sIdx].items[p.iIdx].unit = this.value;
          renderEditor();
        }
      }, 400));
      PCD.on(body, 'input', '[data-it-pickup]', PCD.debounce(function () {
        const p = pickIdx('data-it-pickup', this);
        if (data.stations[p.sIdx] && data.stations[p.sIdx].items[p.iIdx]) {
          let v = parseFloat(this.value);
          if (isNaN(v)) v = 60;
          v = Math.max(0, Math.min(100, v));
          data.stations[p.sIdx].items[p.iIdx].pickupRatio = v / 100;
          renderEditor();
        }
      }, 400));
      PCD.on(body, 'click', '[data-it-del]', function () {
        const p = pickIdx('data-it-del', this);
        if (data.stations[p.sIdx]) {
          data.stations[p.sIdx].items.splice(p.iIdx, 1);
          renderEditor();
        }
      });
    }

    renderEditor();

    // Footer buttons
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save') || 'Save', style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') || 'Cancel' });
    const prepBtn = PCD.el('button', { class: 'btn btn-outline' });
    prepBtn.innerHTML = PCD.icon('list', 16) + ' <span>' + (t('buffet_print_prep') || 'Prep List') + '</span>';
    const reportBtn = PCD.el('button', { class: 'btn btn-outline' });
    reportBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + (t('buffet_print_report') || 'Cost Report') + '</span>';
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete') || 'Delete', style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(prepBtn);
    footer.appendChild(reportBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : (t('buffet_new') || 'New Buffet'),
      body: body, footer: footer, size: 'xl', closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });

    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('buffet_confirm_delete') || 'Delete this buffet?',
        text: t('buffet_confirm_delete_body') || 'This is permanent.',
        okText: t('delete'),
      }).then(function (ok) {
        if (!ok) return;
        deleteBuffet(existing.id);
        PCD.toast.success(t('buffet_deleted') || 'Buffet deleted');
        m.close();
        const v = PCD.$('#view');
        if (v && PCD.router.currentView() === 'buffet') render(v);
      });
    });

    saveBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim();
      if (!data.name) { PCD.toast.error((t('buffet_name_label') || 'Buffet name') + ' ' + (t('required') || 'required')); return; }
      if (existing) data.id = existing.id;
      upsertBuffet(data);
      PCD.toast.success(t('buffet_saved') || 'Buffet saved');
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (v && PCD.router.currentView() === 'buffet') render(v);
      }, 200);
    });

    prepBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim() || t('untitled');
      if (existing) { upsertBuffet(Object.assign({}, existing, data)); }
      printPrepList(data);
    });
    reportBtn.addEventListener('click', function () {
      data.name = (PCD.$('#bufName', body).value || '').trim() || t('untitled');
      if (existing) { upsertBuffet(Object.assign({}, existing, data)); }
      printCostReport(data);
    });
  }

  // ---------- PRINT: PREP LIST ----------

  function printPrepList(buffet) {
    const t = PCD.i18n.t;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();
    const refillX = buffet.refillMultiplier != null ? Number(buffet.refillMultiplier) : (INDUSTRY_REFILL[buffet.type] || 1.25);

    let rowsHtml = '';
    (buffet.stations || []).forEach(function (st) {
      if (!st.items || !st.items.length) return;
      const stMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
      rowsHtml += '<tr><td colspan="3" class="st-head" style="background:' + stMeta.color + '20;color:' + stMeta.color + ';font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:6px 8px;font-size:10pt;">' + PCD.escapeHtml(st.name) + '</td></tr>';
      st.items.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        if (!r) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, buffet.coverCount, refillX);
        rowsHtml +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(r.name) + '</td>' +
            '<td style="text-align:right;font-weight:700;color:' + stMeta.color + ';white-space:nowrap;">' + PCD.fmtNumber(c.prepAmount) + ' ' + PCD.escapeHtml(it.unit || '') + '</td>' +
            '<td style="text-align:center;color:#999;">☐</td>' +
          '</tr>';
      });
    });

    const dateStr = buffet.serviceDate ? PCD.fmtDate(buffet.serviceDate) : new Date().toLocaleDateString();
    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }' +
        '.hdr { border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; }' +
        '.hdr h1 { margin: 0; font-size: 18pt; color: #16a34a; }' +
        '.hdr .meta { font-size: 10pt; color: #666; margin-top: 2px; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 11pt; }' +
        'th, td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }' +
        'th { background: #f5f5f4; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }' +
        '.st-head { padding-top: 10px !important; }' +
      '</style>' +
      '<div class="hdr">' +
        '<h1>' + PCD.escapeHtml(buffet.name || 'Buffet') + ' — Prep List</h1>' +
        '<div class="meta">' + (buffet.coverCount || 0) + ' covers · ' + dateStr + ' · refill ' + refillX + '×</div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th>' + (t('buffet_print_item') || 'Item') + '</th><th style="text-align:right;">' + (t('buffet_print_prep_amt') || 'Prep') + '</th><th style="text-align:center;width:40px;">' + (t('buffet_print_done') || 'Done') + '</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';

    PCD.print(html, (buffet.name || 'Buffet') + ' — Prep');
  }

  // ---------- PRINT: COST REPORT ----------

  function printCostReport(buffet) {
    const t = PCD.i18n.t;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = PCD.recipes.buildRecipeMap();
    const totals = computeBuffetTotals(buffet, ingMap, recipeMap);
    const refillX = totals.refillX;
    const dateStr = buffet.serviceDate ? PCD.fmtDate(buffet.serviceDate) : new Date().toLocaleDateString();

    let rowsHtml = '';
    (buffet.stations || []).forEach(function (st) {
      if (!st.items || !st.items.length) return;
      let stSubtotal = 0;
      let itemRows = '';
      st.items.forEach(function (it) {
        const r = it.recipeId ? recipeMap[it.recipeId] : null;
        if (!r) return;
        const c = computeItemCost(it, r, ingMap, recipeMap, buffet.coverCount, refillX);
        stSubtotal += c.prepCost;
        const wasteStyle = c.wastePct > 25 ? 'color:#dc2626;font-weight:700;' : 'color:#666;';
        itemRows +=
          '<tr>' +
            '<td>' + PCD.escapeHtml(r.name) + '</td>' +
            '<td style="text-align:right;">' + PCD.fmtNumber(c.prepAmount) + ' ' + PCD.escapeHtml(it.unit || '') + '</td>' +
            '<td style="text-align:right;">' + ((it.pickupRatio || 0.6) * 100).toFixed(0) + '%</td>' +
            '<td style="text-align:right;font-weight:700;">' + PCD.fmtMoney(c.prepCost) + '</td>' +
            '<td style="text-align:right;' + wasteStyle + '">' + PCD.fmtMoney(c.expectedWaste) + '</td>' +
          '</tr>';
      });
      const stMeta = STATION_TYPES.find(function (x) { return x.id === st.type; }) || STATION_TYPES[5];
      rowsHtml +=
        '<tr><td colspan="5" style="background:' + stMeta.color + '20;color:' + stMeta.color + ';font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:5px 8px;font-size:9pt;">' + PCD.escapeHtml(st.name) + ' — ' + PCD.fmtMoney(stSubtotal) + '</td></tr>' +
        itemRows;
    });

    const html =
      '<style>' +
        '@page { size: A4; margin: 12mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }' +
        '.hdr { border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; }' +
        '.hdr h1 { margin: 0; font-size: 18pt; color: #16a34a; }' +
        '.hdr .meta { font-size: 10pt; color: #666; margin-top: 2px; }' +
        '.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }' +
        '.stat { background: #f5f5f4; padding: 8px 10px; border-radius: 6px; }' +
        '.stat .lbl { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }' +
        '.stat .val { font-size: 14pt; font-weight: 800; color: #111; }' +
        '.good { color: #16a34a; } .warn { color: #f59e0b; } .bad { color: #dc2626; }' +
        'table { width: 100%; border-collapse: collapse; font-size: 10pt; }' +
        'th, td { padding: 4px 8px; border-bottom: 1px solid #e5e5e5; }' +
        'th { background: #f5f5f4; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }' +
      '</style>' +
      '<div class="hdr">' +
        '<h1>' + PCD.escapeHtml(buffet.name || 'Buffet') + ' — Cost Report</h1>' +
        '<div class="meta">' + (buffet.coverCount || 0) + ' covers · ' + dateStr + ' · refill ' + refillX + '×</div>' +
      '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="lbl">Revenue</div><div class="val">' + PCD.fmtMoney(totals.revenue) + '</div></div>' +
        '<div class="stat"><div class="lbl">Spread cost</div><div class="val">' + PCD.fmtMoney(totals.totalPrepCost) + '</div></div>' +
        '<div class="stat"><div class="lbl">Food cost %</div><div class="val ' + totals.status + '">' + totals.foodCostPct.toFixed(1) + '%</div></div>' +
        '<div class="stat"><div class="lbl">Per cover</div><div class="val">' + PCD.fmtMoney(totals.perGuestCost) + '</div></div>' +
        '<div class="stat"><div class="lbl">Profit / cover</div><div class="val ' + (totals.profitPerCover > 0 ? 'good' : 'bad') + '">' + PCD.fmtMoney(totals.profitPerCover) + '</div></div>' +
        '<div class="stat"><div class="lbl">Expected waste</div><div class="val">' + PCD.fmtMoney(totals.totalExpectedWaste) + '</div></div>' +
      '</div>' +
      '<table>' +
        '<thead><tr><th>Item</th><th style="text-align:right;">Prep</th><th style="text-align:right;">Pickup</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Waste</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';

    PCD.print(html, (buffet.name || 'Buffet') + ' — Cost Report');
  }

  // ---------- EXPORT ----------
  PCD.tools = PCD.tools || {};
  PCD.tools.buffet = {
    render: render,
    openEditor: openEditor,
  };
})();
