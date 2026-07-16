/* ================================================================
   ProChefDesk — events.js
   Event planner for banquets, weddings, catering jobs.

   Data model (events table):
   {
     id, name, date, time, guestCount, venue, pricePerHead, budget,
     status: 'draft' | 'confirmed' | 'done' | 'cancelled',
     notes,
     menu: [{ recipeId, portionsPerGuest }]  // 1 = one portion per guest
   }

   Auto-scales food cost with guestCount. Can generate shopping list.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // v2.44.91 — satış hattı: draft(talep) → tentative(teklif/opsiyon) → confirmed → done → cancelled.
  const STATUSES = ['draft', 'tentative', 'confirmed', 'done', 'cancelled'];
  let _evFilter = 'all';   // liste durum filtresi (oturum içi)
  let _evSignFilter = 'all';  // v2.44.142 — imza durumu filtresi: all | awaiting | signed
  let _signMap = null;     // v2.44.142 — {eventId:{signed,paused}} son toplu sorgu cache'i
  let _evView = 'list';    // v2.44.93 — liste / takvim görünümü
  let _calCursor = null;   // takvimde gösterilen ay (Date); null = bu ay
  // v2.44.94 — Güvenli i18n: t(key) eksik key'de key'in KENDİSİNİ döndürür (truthy) →
  // 't(k) || fb' deseni bozuk (stale cache'te ham key sızar). L(k, fb) eksikte fb verir.
  function L(key, fb) {
    const v = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t(key) : null;
    return (v == null || v === key) ? (fb != null ? fb : key) : v;
  }

  // v2.44.87 — Faz 2: diyet/alerjen. Client'tan gelen kişi-bazlı diyet sayıları (manuel)
  // + fonksiyon menüsündeki alerjenlerin otomatik özeti (tariflerdeki manuel etiketlerden,
  // sub-recipe cascade'li). Alerjen adı = ikon + İngilizce key (uygulama geneliyle tutarlı).
  const DIET_TYPES = [
    { key: 'vegetarian', labelKey: 'diet_vegetarian' },
    { key: 'vegan',      labelKey: 'diet_vegan' },
    { key: 'glutenFree', labelKey: 'diet_gluten_free' },
    { key: 'dairyFree',  labelKey: 'diet_dairy_free' },
    { key: 'nutAllergy', labelKey: 'diet_nut_allergy' },
  ];
  function fnMenuAllergens(fn, ingMap, recipeMap) {
    if (!PCD.allergensDB) return [];
    const set = {};
    ((fn && fn.menu) || []).forEach(function (item) {
      if (item.recipeId) {
        const r = recipeMap[item.recipeId]; if (!r) return;
        (PCD.allergensDB.recipeAllergens ? (PCD.allergensDB.recipeAllergens(r, ingMap) || []) : []).forEach(function (k) { set[k] = true; });
      } else if (item.ingredientId) {
        const ing = ingMap[item.ingredientId];
        if (ing && ing.allergens) ing.allergens.forEach(function (k) { set[k] = true; });
      }
    });
    return Object.keys(set);
  }
  function allergenLabel(k) {
    const a = PCD.allergensDB && PCD.allergensDB.getByKey(k);
    return a ? (a.icon + ' ' + k.charAt(0).toUpperCase() + k.slice(1)) : k;
  }
  // v2.44.136 — Menüye doğrudan ingredient eklerken kişi-başı makul varsayılan.
  // Eskiden yalnız 'g'/'ml' özel işlenip her BAŞKA birim (kg, l, oz, lb...) düz
  // "1" alıyordu — kg'lık bir malzeme "1 kg/kişi" olup 120 kişilik event'te
  // 120kg/$3,360 gibi saçma bir tutar üretiyordu (buffet.js'te de aynı kusur var,
  // bu düzeltme yalnız events.js kapsamında — operatör talebi). Ağırlık/hacim
  // birimlerinde 30g/50ml dengi hedef birime çevrilir; adet-bazlı (pcs, portion,
  // bottle...) birimlerde 1 kalır.
  function ingredientDefaultPerGuest(unit) {
    const grp = PCD.unitGroup ? PCD.unitGroup(unit) : null;
    try {
      if (grp === 'mass') return Math.round(PCD.convertUnit(30, 'g', unit) * 1000) / 1000;
      if (grp === 'volume') return Math.round(PCD.convertUnit(50, 'ml', unit) * 1000) / 1000;
    } catch (e) {}
    return 1;
  }
  // v2.44.88 — fn.menu öğesi recipe VEYA ingredient olabilir. Maliyet tek noktadan.
  // Recipe: tarif maliyeti × (toplam porsiyon / servings). Ingredient: birim fiyat (yield'li)
  // × kişi-başı miktar (ingredient birimine çevrili) × kişi. (Buffet ingredient-path ile aynı.)
  function itemFoodCost(item, guests, ingMap, recipeMap) {
    guests = Number(guests) || 0;
    if (item.recipeId) {
      const r = recipeMap[item.recipeId]; if (!r) return 0;
      const portionsTotal = guests * (Number(item.portionsPerGuest) || 1);
      return PCD.recipes.computeFoodCost(r, ingMap) * (portionsTotal / (r.servings || 1));
    }
    if (item.ingredientId) {
      const ing = ingMap[item.ingredientId]; if (!ing) return 0;
      const totalAmt = guests * (Number(item.amountPerGuest) || 0);
      if (totalAmt <= 0) return 0;
      const price = Number(ing.pricePerUnit) || 0;
      const yld = Number(ing.yieldPercent);
      const eff = (yld && yld > 0 && yld < 100) ? price / (yld / 100) : price;
      let amtInBase = totalAmt;
      if (item.unit && ing.unit && item.unit !== ing.unit) {
        try { amtInBase = PCD.convertUnit(totalAmt, item.unit, ing.unit); } catch (e) { amtInBase = totalAmt; }
      }
      return eff * amtInBase;
    }
    return 0;
  }

  function statusColor(s) {
    return {
      draft: 'var(--text-3)',
      tentative: '#b45309',
      confirmed: 'var(--brand-600)',
      done: 'var(--success)',
      cancelled: 'var(--danger)',
    }[s] || 'var(--text-3)';
  }

  // v2.44.93 — Aylık takvim görünümü. Etkinlikleri (mirror'lanmış) date'lerine göre ay
  // ızgarasına yerleştirir; durum rengiyle çip, tıklayınca editör. Pazartesi-başlangıç.
  function renderCalendar(container, events) {
    const t = PCD.i18n.t;
    const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    const cur = _calCursor || new Date();
    const year = cur.getFullYear(), month = cur.getMonth();
    const monthName = new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const byDate = {};
    events.forEach(function (e) { if (e.date) { (byDate[e.date] = byDate[e.date] || []).push(e); } });
    let startDow = new Date(year, month, 1).getDay();   // 0=Paz..6=Cmt
    startDow = (startDow + 6) % 7;                        // Pazartesi-başlangıç: 0=Pzt
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const weekdays = [];
    for (let i = 0; i < 7; i++) { weekdays.push(new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' })); }  // 2024-01-01 = Pzt

    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
      '<button class="btn btn-outline btn-sm" data-calnav="-1" style="min-width:38px;">‹</button>' +
      '<div style="font-weight:800;font-size:16px;">' + PCD.escapeHtml(monthName) + '</div>' +
      '<div style="display:flex;gap:6px;"><button class="btn btn-outline btn-sm" data-calnav="0">' + PCD.escapeHtml(L('event_today', 'Today')) + '</button><button class="btn btn-outline btn-sm" data-calnav="1" style="min-width:38px;">›</button></div>' +
    '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;">';
    weekdays.forEach(function (w) { html += '<div style="text-align:center;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;padding-bottom:2px;">' + PCD.escapeHtml(w) + '</div>'; });
    for (let i = 0; i < startDow; i++) { html += '<div></div>'; }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const evs = byDate[ds] || [];
      const isToday = ds === todayStr;
      let cell = '<div style="min-height:84px;border:1px solid var(--border);border-radius:8px;padding:5px 6px;background:' + (isToday ? 'var(--brand-50)' : 'var(--surface)') + ';overflow:hidden;">';
      cell += '<div style="font-size:12px;font-weight:' + (isToday ? '800' : '600') + ';color:' + (isToday ? 'var(--brand-700)' : 'var(--text-2)') + ';margin-bottom:3px;">' + d + '</div>';
      evs.slice(0, 3).forEach(function (e) {
        const col = statusColor(e.status || 'draft');
        cell += '<div data-cal-eid="' + e.id + '" title="' + PCD.escapeHtml(e.name || '') + '" style="cursor:pointer;font-size:11px;line-height:1.4;margin-bottom:2px;padding:1px 5px;border-radius:4px;background:' + col + '1f;color:' + col + ';font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (e.time ? PCD.escapeHtml(e.time) + ' ' : '') + PCD.escapeHtml(e.name || t('untitled')) + '</div>';
      });
      if (evs.length > 3) cell += '<div style="font-size:10px;color:var(--text-3);">+' + (evs.length - 3) + '</div>';
      cell += '</div>';
      html += cell;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // v2.44.141 — Liste ekranı imza-durumu rozeti (event ismi yanında). Tek toplu
  // sorgu (tüm event'ler için N+1 sorgu YAPILMAZ) — sonuç DOM'a doğrudan patch
  // edilir, tam re-render tetiklenmez (filtre/scroll durumu bozulmaz). v2.44.142 —
  // sonuç ayrıca _signMap cache'ine yazılır ("İmza bekleniyor"/"İmzalandı" filtre
  // çipleri bunu okur); cache ilk kez doluyorsa (sayfa yeni açıldıysa) çip sayaçlarının
  // ve aktif filtrenin güncel veriyle eşleşmesi için TEK SEFERLİK bir render(view) daha
  // tetiklenir — sonraki her fetch'te tekrar render ETMEZ (sonsuz döngü riski yok).
  function refreshListSignBadges(listEl, view) {
    if (!PCD.cloud || !PCD.cloud.ready) return;
    const supabase = window._supabaseClient;
    const user = PCD.store.get('user');
    if (!supabase || !user || !user.id) return;
    const t = PCD.i18n.t;
    const hadMap = !!_signMap;
    supabase.from('public_shares')
      .select('source_id, signed_at, paused')
      .eq('owner_id', user.id).eq('kind', 'event').eq('share_mode', 'sign')
      .then(function (res) {
        if (res.error || !res.data) return;
        const map = {};
        res.data.forEach(function (r) {
          map[r.source_id] = { signed: !!r.signed_at, paused: !!r.paused };
          const badge = listEl.querySelector('[data-sign-badge="' + r.source_id + '"]');
          if (!badge) return;
          if (r.signed_at) {
            badge.innerHTML = '<span class="chip" style="background:#dcfce7;color:#15803d;font-weight:700;font-size:11px;">✓ ' + PCD.escapeHtml(t('event_signing_link_signed') || 'Signed') + '</span>';
          } else if (!r.paused) {
            badge.innerHTML = '<span class="chip" style="background:#fef3c7;color:#b45309;font-weight:700;font-size:11px;">✉ ' + PCD.escapeHtml(t('event_signing_link_pending') || 'Awaiting signature') + '</span>';
          }
        });
        _signMap = map;
        if (!hadMap && view) render(view);
      }).catch(function () {});
  }

  function render(view) {
    const t = PCD.i18n.t;
    const allEvents = PCD.store.listTable('events').slice().sort(function (a, b) {
      // Upcoming first, then past
      const da = a.date || '', db = b.date || '';
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    // v2.44.91 — durum filtresi çipleri (yalnız mevcut durumlar + All)
    const counts = { all: allEvents.length };
    allEvents.forEach(function (e) { const s = e.status || 'draft'; counts[s] = (counts[s] || 0) + 1; });
    if (_evFilter !== 'all' && !counts[_evFilter]) _evFilter = 'all';
    // v2.44.94 — FIX E: TÜM durumları göster (0 olsa bile), yalnız mevcutlar değil.
    const chipDefs = [{ k: 'all', label: L('event_filter_all', 'All') }].concat(STATUSES.map(function (s) { return { k: s, label: t('event_status_' + s) }; }));
    const chipsHtml = chipDefs.map(function (c) {
      return '<button class="btn btn-sm ' + (_evFilter === c.k ? 'btn-primary' : 'btn-outline') + '" data-evf="' + c.k + '" style="min-height:30px;">' + PCD.escapeHtml(c.label) + ' (' + (counts[c.k] || 0) + ')</button>';
    }).join('');

    // v2.44.142 — imza durumu filtresi: "Awaiting signature" / "Signed" — event
    // lifecycle status'undan (yukarıdaki chipDefs) BAĞIMSIZ, ayrı bir çip grubu.
    // _signMap boşsa (henüz hiç signing link oluşturulmamışsa) hiç gösterilmez.
    const signCounts = { awaiting: 0, signed: 0 };
    if (_signMap) {
      Object.keys(_signMap).forEach(function (id) {
        const s = _signMap[id];
        if (s.signed) signCounts.signed++; else if (!s.paused) signCounts.awaiting++;
      });
    }
    const hasSignData = !!(_signMap && Object.keys(_signMap).length);
    const signChipDefs = [
      { k: 'awaiting', icon: '✉', label: L('event_signing_link_pending', 'Awaiting signature') },
      { k: 'signed', icon: '✓', label: t('event_signing_link_signed') || 'Signed' },
    ];
    const signChipsHtml = signChipDefs.map(function (c) {
      return '<button class="btn btn-sm ' + (_evSignFilter === c.k ? 'btn-primary' : 'btn-outline') + '" data-evsignf="' + c.k + '" style="min-height:30px;">' + c.icon + ' ' + PCD.escapeHtml(c.label) + ' (' + signCounts[c.k] + ')</button>';
    }).join('');

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('events_title')}</div>
          <div class="page-subtitle">${t('events_subtitle')}</div>
        </div>
        <div class="page-header-actions">
          ${allEvents.length ? '<div style="display:inline-flex;gap:3px;background:var(--surface-2);padding:3px;border-radius:9px;margin-right:6px;">' +
            '<button class="btn btn-sm ' + (_evView === 'list' ? 'btn-primary' : 'btn-ghost') + '" data-evview="list" style="min-height:32px;">' + PCD.icon('list', 14) + ' ' + PCD.escapeHtml(L('event_view_list', 'List')) + '</button>' +
            '<button class="btn btn-sm ' + (_evView === 'calendar' ? 'btn-primary' : 'btn-ghost') + '" data-evview="calendar" style="min-height:32px;">' + PCD.icon('calendar', 14) + ' ' + PCD.escapeHtml(L('event_view_calendar', 'Calendar')) + '</button>' +
          '</div>' : ''}
          <button class="btn btn-primary" id="newEventBtn">+ ${t('new_event')}</button>
        </div>
      </div>
      ${PCD.guideCard('events', t('events_g_t'), [t('events_g1'), t('events_g2'), t('events_g3')])}
      ${allEvents.length ? '<div id="evFilters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:' + (hasSignData ? '6px' : '14px') + ';">' + chipsHtml + '</div>' : ''}
      ${(allEvents.length && hasSignData) ? '<div id="evSignFilters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' + signChipsHtml + '</div>' : ''}
      <div id="eventList"></div>
    `;

    const listEl = PCD.$('#eventList', view);
    if (allEvents.length === 0) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🎉</div>
          <div class="empty-title">${t('event_empty')}</div>
          <div class="empty-desc">${t('event_empty_desc')}</div>
          <div class="empty-action"><button class="btn btn-primary" id="emptyNewE">+ ${t('new_event')}</button></div>
        </div>
      `;
      PCD.$('#emptyNewE', listEl).addEventListener('click', function () { openEditor(); });
    } else {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

      let events = allEvents.filter(function (e) { return _evFilter === 'all' || (e.status || 'draft') === _evFilter; });
      if (_evSignFilter !== 'all') {
        events = events.filter(function (e) {
          const s = _signMap && _signMap[e.id];
          if (_evSignFilter === 'awaiting') return !!s && !s.signed && !s.paused;
          if (_evSignFilter === 'signed') return !!s && s.signed;
          return true;
        });
      }
      if (_evView === 'calendar') {
        renderCalendar(listEl, events);
      } else {
      const today = (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
      const upcoming = events.filter(function (e) { return !e.date || e.date >= today; });
      const past = events.filter(function (e) { return e.date && e.date < today; });

      const buildRow = function (e) {
        const stats = computeStats(e, ingMap, recipeMap);
        const dateStr = e.date ? PCD.fmtDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
        const taskDone = (e.tasks || []).filter(function (x) { return x.done; }).length;
        const taskTot = (e.tasks || []).length;
        const row = PCD.el('div', { class: 'card card-hover', 'data-eid': e.id, style: { padding: '12px' } });
        row.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:16px;letter-spacing:-0.01em;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span>${PCD.escapeHtml(e.name || t('untitled'))}</span>
                <span data-sign-badge="${e.id}"></span>
              </div>
              <div class="text-muted text-sm">
                ${dateStr}
                ${e.time ? ' · ' + PCD.escapeHtml(e.time) : ''}
                ${e.guestCount ? ' · ' + e.guestCount + ' ' + t('event_guests').toLowerCase() : ''}
                ${e.venue ? ' · ' + PCD.escapeHtml(e.venue) : ''}
                ${(e.functions && e.functions.length > 1) ? ' · ' + e.functions.length + ' ' + (t('event_functions') || 'functions').toLowerCase() : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              <span class="chip" style="background:${statusColor(e.status || 'draft')}20;color:${statusColor(e.status || 'draft')};font-weight:700;">${t('event_status_' + (e.status || 'draft'))}</span>
              <button class="icon-btn" data-ev-cost="${e.id}" title="${PCD.escapeHtml(t('btn_cost_report') || 'Cost Report')}">${PCD.icon('activity', 16)}</button>
              <button class="icon-btn" data-ev-shop="${e.id}" title="${PCD.escapeHtml(t('event_shopping_list') || 'Shopping list')}">${PCD.icon('list', 16)}</button>
              <button class="icon-btn" data-dup-ev="${e.id}" title="${PCD.escapeHtml(t('event_duplicate') || 'Duplicate')}">${PCD.icon('copy', 16)}</button>
            </div>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <span class="chip">${t('event_total_cost')}: <strong>${PCD.fmtMoney(stats.totalCost)}</strong></span>
            ${stats.totalRevenue > 0 ? '<span class="chip chip-brand">' + t('event_total_revenue') + ': <strong>' + PCD.fmtMoney(stats.totalRevenue) + '</strong></span>' : ''}
            ${stats.profit !== null ? '<span class="chip chip-' + (stats.profit >= 0 ? 'success' : 'danger') + '">' + t('event_profit') + ': <strong>' + PCD.fmtMoney(stats.profit) + '</strong></span>' : ''}
            ${(stats.totalRevenue > 0 && Math.abs(stats.balanceDue) > 0.005) ? '<span class="chip" style="background:#fef3c7;color:#92400e;">' + (stats.balanceDue < 0 ? (t('event_overpaid') || 'Overpaid') : (t('event_balance_due') || 'Balance')) + ': <strong>' + PCD.fmtMoney(Math.abs(stats.balanceDue)) + '</strong></span>' : ''}
            ${taskTot ? '<span class="chip">✅ ' + taskDone + '/' + taskTot + '</span>' : ''}
          </div>
        `;
        return row;
      };

      const cont = PCD.el('div', { class: 'flex flex-col gap-2' });
      const both = upcoming.length && past.length;
      const section = function (label, arr) {
        if (!arr.length) return;
        if (both) {
          const h = PCD.el('div', { class: 'text-muted text-sm', style: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '8px 0 2px' } });
          h.textContent = label;
          cont.appendChild(h);
        }
        arr.forEach(function (e) { cont.appendChild(buildRow(e)); });
      };
      section(t('event_upcoming') || 'Upcoming', upcoming);
      section(t('event_past') || 'Past', past);
      if (!cont.children.length) {
        cont.innerHTML = '<div class="text-muted" style="padding:24px;text-align:center;">' + PCD.escapeHtml(L('event_filter_none', 'No events in this status.')) + '</div>';
      }
      listEl.appendChild(cont);
      refreshListSignBadges(listEl, view);
      }
    }

    PCD.on(view, 'click', '[data-evf]', function () { _evFilter = this.getAttribute('data-evf'); render(view); });
    PCD.on(view, 'click', '[data-evsignf]', function () {
      const k = this.getAttribute('data-evsignf');
      _evSignFilter = (_evSignFilter === k) ? 'all' : k;  // aynı çipe tekrar tıklayınca filtre kalkar
      render(view);
    });
    PCD.on(view, 'click', '[data-evview]', function () { _evView = this.getAttribute('data-evview'); render(view); });
    PCD.on(view, 'click', '[data-calnav]', function () { const dir = parseInt(this.getAttribute('data-calnav'), 10); const cur = _calCursor || new Date(); _calCursor = dir === 0 ? new Date() : new Date(cur.getFullYear(), cur.getMonth() + dir, 1); render(view); });
    PCD.on(view, 'click', '[data-cal-eid]', function () { openPreview(this.getAttribute('data-cal-eid')); });
    PCD.$('#newEventBtn', view).addEventListener('click', function () { openEditor(); });
    PCD.on(listEl, 'click', '[data-eid]', function (e) {
      if (e.target.closest('button')) return;  // any quick-access action button
      openPreview(this.getAttribute('data-eid'));
    });
    // v2.43.18 — Quick-access: cost report (Simple/Detailed preview modal)
    PCD.on(listEl, 'click', '[data-ev-cost]', function (e) {
      e.stopPropagation();
      const ev = PCD.store.getFromTable('events', this.getAttribute('data-ev-cost'));
      if (!ev) return;
      PCD.costReportPreview({
        title: (ev.name || t('untitled')) + ' · ' + (t('btn_cost_report') || 'Cost Report'),
        buildHtml: function (detailed) { return eventPrintHtml(ev, detailed); },
        onPrint: function (detailed) { printEvent(ev, detailed); },
      });
    });
    // v2.43.18 — Quick-access: shopping list
    PCD.on(listEl, 'click', '[data-ev-shop]', function (e) {
      e.stopPropagation();
      const ev = PCD.store.getFromTable('events', this.getAttribute('data-ev-shop'));
      if (ev) openShoppingList(ev);
    });
    // v2.37 — Etkinliği çoğalt
    PCD.on(listEl, 'click', '[data-dup-ev]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-dup-ev');
      const src = PCD.store.getFromTable('events', id);
      if (!src) return;
      const copy = PCD.clone(src); delete copy.id;
      copy.name = (src.name || t('untitled')) + ' ' + (t('event_copy_suffix') || '(copy)');
      copy.status = 'draft';
      PCD.store.upsertInTable('events', copy, 'ev');
      PCD.toast.success(t('event_duplicated') || 'Event duplicated');
      render(view);
    });
  }

  // v2.44.86 — Faz 1: ÇOK-FONKSİYON. Bir etkinlik = bir gün içinde birden çok fonksiyon
  // (karşılama 18:00 · yemek 20:00 · gece 23:00) — her biri kendi saat/kişi/menü/salon.
  // GERİYE-UYUMLU: eski düz etkinlik (date/time/guestCount/menu) → tek örtük fonksiyona
  // normalize edilir; eski etkinlikler birebir aynı hesaplanır.
  function eventFunctions(ev) {
    if (ev && ev.functions && ev.functions.length) return ev.functions;
    return [{
      _legacy: true, name: '', date: (ev && ev.date) || '', time: (ev && ev.time) || '', endTime: '',
      room: (ev && ev.venue) || '', guestCount: Number(ev && ev.guestCount) || 0,
      menu: (ev && ev.menu) || [], notes: ''
    }];
  }
  // Katılımcı (ciro için) = fonksiyonların EN BÜYÜĞÜ (≈ benzersiz kişi); TOPLANMAZ — aynı
  // 100 kişi 3 fonksiyona katılır, ciro 300 değil 100×fiyat olmalı. Maliyet ise toplanır
  // (her fonksiyon için ayrı üretim yapılır).
  function eventGuests(ev) {
    if (ev && ev.functions && ev.functions.length) {
      return ev.functions.reduce(function (mx, f) { return Math.max(mx, Number(f.guestCount) || 0); }, 0);
    }
    return Number(ev && ev.guestCount) || 0;
  }
  // v2.44.89 — Faz 3: faturalanan kişi = max(garanti, beklenen) — garanti minimumdur, daha
  // fazla gelirse fazlası faturalanır. Fonksiyonların en büyüğü (≈ benzersiz kişi).
  function eventBilledGuests(ev) {
    return eventFunctions(ev).reduce(function (mx, f) {
      return Math.max(mx, Math.max(Number(f.guaranteedCount) || 0, Number(f.guestCount) || 0));
    }, 0);
  }

  function computeStats(event, ingMap, recipeMap) {
    let totalCost = 0;
    eventFunctions(event).forEach(function (fn) {
      const guests = Number(fn.guestCount) || 0;
      (fn.menu || []).forEach(function (item) {
        totalCost += itemFoodCost(item, guests, ingMap, recipeMap);
      });
    });
    const attendees = eventGuests(event);
    const billed = eventBilledGuests(event);
    const pph = Number(event.pricePerHead) || 0;
    const foodRevenue = billed * pph;
    // v2.44.91 — kalemli ek ücretler (içecek/kiralama/diğer): maliyet (sen ödersin) + fiyat (müşteri öder).
    let chargesCost = 0, chargesRevenue = 0;
    (event.charges || []).forEach(function (c) {
      chargesCost += Number(c.cost) || 0;
      chargesRevenue += Number(c.price) || 0;
    });
    const subtotal = foodRevenue + chargesRevenue;   // servis ücreti öncesi müşteri tutarı
    const svcPct = Number(event.serviceChargePct) || 0;
    const serviceCharge = subtotal * (svcPct / 100);
    const totalRevenue = subtotal + serviceCharge;
    // v2.44.90 — işçilik. totalCost = YEMEK maliyeti (etiketler korunur); grandTotal = yemek +
    // işçilik + ek-kalem maliyeti. Kâr/marj grandTotal'a göre → gerçek P&L.
    const laborCost = (event.staffing || []).reduce(function (s, l) {
      return s + ((Number(l.count) || 0) * (Number(l.hours) || 0) * (Number(l.rate) || 0));
    }, 0);
    const grandTotal = totalCost + laborCost + chargesCost;
    // v2.44.91 — ödeme planı varsa ödenmişlerin toplamı; yoksa eski tek depozito.
    let paidToDate;
    if (event.payments && event.payments.length) {
      paidToDate = event.payments.reduce(function (s, p) { return s + (p.paid ? (Number(p.amount) || 0) : 0); }, 0);
    } else {
      paidToDate = Number(event.deposit) || 0;
    }
    const scheduledTotal = (event.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    const balanceDue = totalRevenue - paidToDate;
    const profit = totalRevenue > 0 ? totalRevenue - grandTotal : null;
    const margin = totalRevenue > 0 ? ((totalRevenue - grandTotal) / totalRevenue) * 100 : null;
    return {
      totalCost: totalCost, foodCost: totalCost, laborCost: laborCost, chargesCost: chargesCost, grandTotal: grandTotal,
      attendees: attendees, billed: billed,
      foodRevenue: foodRevenue, chargesRevenue: chargesRevenue,
      subtotal: subtotal, svcPct: svcPct, serviceCharge: serviceCharge,
      totalRevenue: totalRevenue, deposit: Number(event.deposit) || 0,
      paidToDate: paidToDate, scheduledTotal: scheduledTotal, balanceDue: balanceDue,
      profit: profit, margin: margin
    };
  }

  // v2.44 — A1 Step 2: compute total ingredient needs for an event, in each
  // ingredient's base unit, ready for inventory deduction.
  // Returns { deductions: {ingredientId: amountInBaseUnit}, skipped: [name,...] }.
  // Units that can't convert to the ingredient's base unit are SKIPPED (not deducted).
  function computeEventDeductions(event, ingMap, recipeMap) {
    const need = {};
    const skippedSet = {};
    eventFunctions(event).forEach(function (fn) {
      const guests = Number(fn.guestCount) || 0;
      (fn.menu || []).forEach(function (item) {
        // Ingredient öğesi → doğrudan düş (tarif gibi flatten gerekmez).
        if (item.ingredientId) {
          const ing = ingMap[item.ingredientId]; if (!ing) return;
          const totalAmt = guests * (Number(item.amountPerGuest) || 0);
          if (totalAmt <= 0) return;
          let amt = totalAmt;
          if (item.unit && ing.unit && item.unit !== ing.unit) {
            try { amt = PCD.convertUnit(totalAmt, item.unit, ing.unit); }
            catch (e) { skippedSet[ing.name || item.ingredientId] = true; return; }
            if (!(amt > 0)) { skippedSet[ing.name || item.ingredientId] = true; return; }
          }
          need[item.ingredientId] = (need[item.ingredientId] || 0) + amt;
          return;
        }
        const r = recipeMap[item.recipeId];
        if (!r) return;
        const portionsTotal = guests * (Number(item.portionsPerGuest) || 1);
        if (portionsTotal <= 0) return;
        const scale = portionsTotal / (r.servings || 1);
        const flat = PCD.recipes.flattenIngredients(r, ingMap, recipeMap, { scale: scale }) || [];
        flat.forEach(function (it) {
          const ing = ingMap[it.ingredientId];
          if (!ing) return;
          let amt = Number(it.amount) || 0;
          if (amt <= 0) return;
          if (it.unit && ing.unit && it.unit !== ing.unit) {
            try { amt = PCD.convertUnit(amt, it.unit, ing.unit); }
            catch (e) { skippedSet[ing.name || it.ingredientId] = true; return; }
            if (!(amt > 0)) { skippedSet[ing.name || it.ingredientId] = true; return; }
          }
          need[it.ingredientId] = (need[it.ingredientId] || 0) + amt;
        });
      });
    });
    return { deductions: need, skipped: Object.keys(skippedSet) };
  }

  // v2.44.93 — Fare/dokunma ile canvas'a çizim wiring'i. openSignaturePad (şefin
  // kendi cihazı) VE v2.44.130 renderSignatureView (uzaktan imza linki) aynı çizim
  // mantığını paylaşır — tek noktadan bakım.
  function wireSignatureCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c1917';
    let drawing = false, hasInk = false, lastX = 0, lastY = 0;
    const pos = function (ev) {
      const r = canvas.getBoundingClientRect();
      const cx = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY) - r.top;
      return { x: cx * (canvas.width / r.width), y: cy * (canvas.height / r.height) };
    };
    const start = function (ev) { ev.preventDefault(); drawing = true; const p = pos(ev); lastX = p.x; lastY = p.y; };
    const move = function (ev) { if (!drawing) return; ev.preventDefault(); const p = pos(ev); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke(); lastX = p.x; lastY = p.y; hasInk = true; };
    const end = function () { drawing = false; };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return {
      clear: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; },
      isEmpty: function () { return !hasInk; },
      toDataURL: function () { return canvas.toDataURL('image/png'); },
    };
  }

  // v2.44.132 — Salt-okunur önizleme (recipes.js openPreview deseni). Liste
  // tıklaması artık buraya gelir; Edit yalnız bu ekrandan açık bir tıklamayla
  // açılır. BEO/Proposal/Share/Delete/Shopping-list/Deduct-stock hepsi `existing`
  // (kaydedilmiş veri) üzerinde çalışır — hiçbiri draft-düzenleme durumuna bağlı değil.
  function openPreview(eid) {
    const t = PCD.i18n.t;
    const existing = PCD.store.getFromTable('events', eid);
    if (!existing) { PCD.toast.error(t('toast_event_not_found') || 'Event not found'); return; }
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });

    const body = PCD.el('div');
    // Uzaktan e-imza linki durumu — tek imza mekanizması burada yönetilir
    // (bkz PLAN Faz 1b: editördeki eski in-app canvas kaldırıldı).
    let signLinkState = null;

    function signLinkAreaHtml() {
      if (!signLinkState || signLinkState.loading) {
        return '<div class="text-muted text-sm">' + PCD.escapeHtml(t('loading') || 'Loading…') + '</div>';
      }
      if (!signLinkState.url) {
        return '<div class="text-muted text-sm" style="margin-bottom:8px;">' + PCD.escapeHtml(t('event_signing_link_hint') || 'Send a link so the client can view and sign the proposal remotely — or open it yourself on a tablet for in-person signing.') + '</div>' +
          '<button type="button" class="btn btn-outline btn-sm" id="pvSignLinkSendBtn">🔗 ' + PCD.escapeHtml(t('event_send_signing_link') || 'Send signing link') + '</button>';
      }
      const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
      const signedDateStr = signLinkState.signedAt ? new Date(signLinkState.signedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      // v2.44.139 — İmza durumu, event lifecycle status'undan (draft/confirmed/done)
      // BAĞIMSIZ, ayrı bir rozet — ikisi asla karıştırılmaz (bir event aynı anda
      // "Confirmed" hem de "Signed" olabilir).
      const statusBit = signLinkState.signed
        ? '<span class="chip" style="background:#dcfce7;color:#15803d;font-weight:700;">✓ ' + PCD.escapeHtml(t('event_signing_link_signed') || 'Signed') + (signLinkState.signedBy ? ' · ' + PCD.escapeHtml(signLinkState.signedBy) : '') + (signedDateStr ? ' · ' + PCD.escapeHtml(signedDateStr) : '') + '</span>'
        : (signLinkState.paused
            ? '<span class="chip" style="background:#fef3c7;color:#b45309;font-weight:700;">⏸ ' + PCD.escapeHtml(t('event_signing_link_paused') || 'Paused') + '</span>'
            : '<span class="chip" style="background:#fef3c7;color:#b45309;font-weight:700;">✉ ' + PCD.escapeHtml(t('event_signing_link_pending') || 'Awaiting signature') + '</span>');
      return '<div class="text-muted text-sm" style="margin-bottom:8px;word-break:break-all;">' + PCD.escapeHtml(signLinkState.url) + '</div>' +
        '<div style="margin-bottom:8px;">' + statusBit + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-outline btn-sm" id="pvSignLinkCopyBtn">' + PCD.escapeHtml(t('event_signing_link_copy') || 'Copy link') + '</button>' +
          (!signLinkState.signed ? '<button type="button" class="btn btn-ghost btn-sm" id="pvSignLinkRevokeBtn" style="color:var(--danger);">' + PCD.escapeHtml(t('event_signing_link_revoke') || 'Revoke link') + '</button>' : '') +
        '</div>';
    }

    function refreshSignLinkState() {
      if (!PCD.cloud || !PCD.cloud.ready) { signLinkState = { url: null }; return; }
      const supabase = window._supabaseClient;
      const user = PCD.store.get('user');
      if (!supabase || !user || !user.id) { signLinkState = { url: null }; return; }
      signLinkState = { loading: true };
      render();
      supabase.from('public_shares')
        .select('id, paused, signed_at, signed_by')
        .eq('owner_id', user.id).eq('kind', 'event').eq('source_id', existing.id).eq('share_mode', 'sign')
        .maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) { signLinkState = { url: null }; }
          else {
            signLinkState = {
              url: location.origin + location.pathname + '?share=' + res.data.id,
              paused: !!res.data.paused,
              signed: !!res.data.signed_at,
              signedBy: res.data.signed_by || '',
              signedAt: res.data.signed_at || '',
            };
          }
          render();
        }).catch(function () { signLinkState = { url: null }; render(); });
    }

    function render() {
      const stats = computeStats(existing, ingMap, recipeMap);
      const fns = eventFunctions(existing);
      const guestsLabel = (t('ev_print_guests') || 'Guests').toLowerCase();
      const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
      const fmtD = function (d) { return d ? new Date(d).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

      let fnHtml = '';
      fns.forEach(function (fn, fi) {
        const when = [fmtD(fn.date), [fn.time, fn.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ');
        const guestsBit = Number(fn.guestCount) ? (fn.guestCount + ' ' + guestsLabel + (Number(fn.guaranteedCount) ? ' (' + PCD.escapeHtml(t('event_guaranteed_short') || 'guar.') + ' ' + fn.guaranteedCount + ')' : '')) : '';
        const sub = [when, fn.room, guestsBit].filter(Boolean).join('  ·  ');
        const title = (fn.name || '').trim() || ((t('event_function') || 'Function') + ' ' + (fi + 1));
        let dishes = '';
        (fn.menu || []).forEach(function (item) {
          let nm = '';
          if (item.recipeId) { const r = recipeMap[item.recipeId]; if (r) nm = r.name; }
          else if (item.ingredientId) { const ing = ingMap[item.ingredientId]; if (ing) nm = ing.name; }
          if (nm) dishes += '<li>' + PCD.escapeHtml(nm) + '</li>';
        });
        const alg = fnMenuAllergens(fn, ingMap, recipeMap);
        const diet = fn.dietary || {};
        const dietParts = DIET_TYPES.filter(function (d) { return Number(diet[d.key]) > 0; }).map(function (d) { return diet[d.key] + ' ' + PCD.escapeHtml(t(d.labelKey) || d.key); });
        if (fn.dietaryNote) dietParts.push(PCD.escapeHtml(fn.dietaryNote));
        fnHtml += '<div style="margin:10px 0;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);">' +
          '<div style="font-weight:700;">' + PCD.escapeHtml(title) + '</div>' +
          (sub ? '<div class="text-muted text-sm" style="margin-top:2px;">' + PCD.escapeHtml(sub) + '</div>' : '') +
          (dishes ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:14px;">' + dishes + '</ul>' : '') +
          (alg.length ? '<div class="text-muted text-sm" style="margin-top:4px;">' + PCD.escapeHtml(t('ev_menu_contains') || 'Contains') + ': ' + alg.map(function (k) { return PCD.escapeHtml(allergenLabel(k)); }).join('  ') + '</div>' : '') +
          (dietParts.length ? '<div class="text-muted text-sm" style="margin-top:2px;">' + PCD.escapeHtml(t('diet_section') || 'Dietary') + ': ' + dietParts.join(' · ') + '</div>' : '') +
        '</div>';
      });

      body.innerHTML = `
        <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:800;font-size:18px;">${PCD.escapeHtml(existing.name || t('untitled'))}</div>
            ${(existing.client || existing.contactName) ? '<div class="text-muted text-sm">' + [existing.client, existing.contactName, existing.contactPhone, existing.clientEmail].filter(Boolean).map(function (x) { return PCD.escapeHtml(x); }).join(' · ') + '</div>' : ''}
          </div>
          <span class="chip" style="background:${statusColor(existing.status || 'draft')}20;color:${statusColor(existing.status || 'draft')};font-weight:700;">${PCD.escapeHtml(t('event_status_' + (existing.status || 'draft')))}</span>
        </div>

        <div class="section-title mt-3 mb-2">${PCD.escapeHtml(t('event_functions') || 'Functions')}</div>
        ${fnHtml}

        <div class="grid grid-2 mb-3 mt-3" style="gap:8px;">
          <div class="stat" style="padding:10px;"><div class="stat-label">${t('event_total_cost')}</div><div class="stat-value" style="font-size:18px;">${PCD.fmtMoney(stats.totalCost)}</div></div>
          ${stats.totalRevenue > 0 ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + t('event_total_revenue') + '</div><div class="stat-value" style="font-size:18px;">' + PCD.fmtMoney(stats.totalRevenue) + '</div></div>' : ''}
          ${stats.profit !== null ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + t('event_profit') + '</div><div class="stat-value" style="font-size:18px;color:' + (stats.profit >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + PCD.fmtMoney(stats.profit) + '</div></div>' : ''}
          ${(stats.totalRevenue > 0 && Math.abs(stats.balanceDue) > 0.005) ? '<div class="stat" style="padding:10px;"><div class="stat-label">' + (stats.balanceDue < 0 ? (t('event_overpaid') || 'Overpaid') : (t('event_balance_due') || 'Balance due')) + '</div><div class="stat-value" style="font-size:18px;color:#b45309;">' + PCD.fmtMoney(Math.abs(stats.balanceDue)) + '</div></div>' : ''}
        </div>

        ${(existing.staffing && existing.staffing.length) ? '<div class="section-title mb-2">' + PCD.escapeHtml(t('event_staffing') || 'Staffing & labor') + '</div><div class="text-muted text-sm" style="margin-bottom:12px;">' + existing.staffing.map(function (s) { return PCD.escapeHtml(s.role || '—') + ' × ' + (s.count || 0); }).join(' · ') + '</div>' : ''}
        ${(existing.charges && existing.charges.length) ? '<div class="section-title mb-2">' + PCD.escapeHtml(t('event_charges') || 'Charges & extras') + '</div><div class="text-muted text-sm" style="margin-bottom:12px;">' + existing.charges.map(function (c) { return PCD.escapeHtml(c.label || '—') + ' ' + PCD.fmtMoney(c.price || 0); }).join(' · ') + '</div>' : ''}
        ${(existing.payments && existing.payments.length) ? '<div class="section-title mb-2">' + PCD.escapeHtml(L('event_payments', 'Payment schedule')) + '</div><div class="text-muted text-sm" style="margin-bottom:12px;">' + existing.payments.map(function (p) { return PCD.escapeHtml(p.label || '—') + ' ' + PCD.fmtMoney(p.amount || 0) + (p.paid ? ' ✓' : ''); }).join(' · ') + '</div>' : ''}
        ${(existing.timeline && existing.timeline.length) ? '<div class="section-title mb-2">' + PCD.escapeHtml(L('event_timeline', 'Run-of-show')) + '</div><div class="text-muted text-sm" style="margin-bottom:12px;">' + existing.timeline.map(function (x) { return PCD.escapeHtml(x.time || '') + ' ' + PCD.escapeHtml(x.label || ''); }).join(' · ') + '</div>' : ''}
        ${(existing.tasks && existing.tasks.length) ? '<div class="section-title mb-2">' + PCD.escapeHtml(L('event_tasks', 'Tasks')) + '</div><div class="text-muted text-sm" style="margin-bottom:12px;">' + existing.tasks.filter(function (x) { return x.done; }).length + '/' + existing.tasks.length + ' ' + PCD.escapeHtml(t('event_done') || 'done') + '</div>' : ''}
        ${existing.cancellationPolicy ? '<div class="section-title mb-2">' + PCD.escapeHtml(t('event_cancellation_policy') || 'Cancellation policy') + '</div><div class="text-muted text-sm" style="margin-bottom:12px;white-space:pre-wrap;">' + PCD.escapeHtml(existing.cancellationPolicy) + '</div>' : ''}
        ${existing.notes ? '<div class="section-title mb-2">🔒 ' + PCD.escapeHtml(L('event_notes_internal', 'Kitchen notes (internal — never shown to client)')) + '</div><div class="text-muted text-sm" style="margin-bottom:12px;white-space:pre-wrap;">' + PCD.escapeHtml(existing.notes) + '</div>' : ''}
        ${existing.clientNotes ? '<div class="section-title mb-2">🤝 ' + PCD.escapeHtml(L('event_notes_client', 'Client-facing terms (shown on the signed Proposal)')) + '</div><div class="text-muted text-sm" style="margin-bottom:12px;white-space:pre-wrap;">' + PCD.escapeHtml(existing.clientNotes) + '</div>' : ''}

        <div style="margin-top:8px;padding:12px 14px;background:var(--surface-2);border-radius:var(--r-md);border:1px solid var(--border);">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;">🔗 ${PCD.escapeHtml(t('event_send_proposal') || 'Send Proposal / Signing')}</div>
          <div id="pvSignLinkArea">${signLinkAreaHtml()}</div>
        </div>
      `;

      wireSignLink();
    }

    function wireSignLink() {
      const sendBtn = body.querySelector('#pvSignLinkSendBtn');
      // v2.44.139 — "Send signing link" artık yalnız link üretmiyor, gerçekten
      // Client email'e gönderiyor (send-proposal-email edge fn). Göndermeden
      // önce şefe hangi adrese gittiğini gösteren bir onay popup'ı çıkar.
      if (sendBtn) sendBtn.addEventListener('click', function () {
        if (!PCD.share || !PCD.share.createOrGetShareUrl) return;
        if (PCD.gate && !PCD.gate.requireShare()) return;
        const clientEmail = (existing.clientEmail || '').trim();
        if (!clientEmail) {
          PCD.toast.error(t('event_signing_link_no_email') || 'Add a client email in Edit first');
          return;
        }
        PCD.modal.confirm({
          icon: '✉', iconKind: 'info',
          title: t('event_send_proposal_confirm_title') || 'Send proposal?',
          text: (t('event_send_proposal_confirm_text') || 'This will email the signing link to:') + '\n' + clientEmail,
          okText: t('event_send_signing_link') || 'Send signing link',
        }).then(function (ok) {
          if (!ok) return;
          signLinkState = { loading: true };
          render();
          PCD.share.createOrGetShareUrl('event', existing.id, 'sign').then(function (url) {
            const shareId = (url.split('share=')[1] || '').split('&')[0];
            const supabase = window._supabaseClient;
            return supabase.functions.invoke('send-proposal-email', { body: { share_id: shareId } }).then(function (res) {
              if (res.error || !res.data || !res.data.sent) {
                // v2.44.140 — supabase-js non-2xx yanıtlarda res.data'yı null
                // bırakabilir; gerçek hata mesajı res.error.context (ham Response)
                // içinde kalır — okunabilirse onu göster, jenerik mesaja düşme.
                const rawResp = res.error && res.error.context;
                const readBody = (rawResp && typeof rawResp.json === 'function') ? rawResp.json().catch(function () { return null; }) : Promise.resolve(null);
                return readBody.then(function (body) {
                  const msg = (res.data && res.data.error) || (body && body.error) || (res.error && res.error.message) || '';
                  PCD.toast.error(msg || t('event_signing_link_send_error') || 'Could not send email');
                  PCD.err && PCD.err('send-proposal-email failed', res.error, body);
                });
              }
              PCD.toast.success((t('event_signing_link_sent') || 'Sent to') + ' ' + clientEmail);
            }).then(function () {
              refreshSignLinkState();
            });
          }).catch(function (e) {
            signLinkState = { url: null };
            render();
            PCD.toast.error((e && e.message) || (t('event_signing_link_error') || 'Could not create signing link'));
          });
        });
      });
      const copyBtn = body.querySelector('#pvSignLinkCopyBtn');
      if (copyBtn) copyBtn.addEventListener('click', function () {
        if (signLinkState && signLinkState.url && navigator.clipboard) {
          navigator.clipboard.writeText(signLinkState.url).then(function () { PCD.toast.success(t('toast_copied') || 'Copied'); });
        }
      });
      const revokeBtn = body.querySelector('#pvSignLinkRevokeBtn');
      if (revokeBtn) revokeBtn.addEventListener('click', function () {
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: t('event_signing_link_revoke') || 'Revoke link', text: t('confirm_delete_desc') || '', okText: t('event_signing_link_revoke') || 'Revoke'
        }).then(function (ok) {
          if (!ok) return;
          PCD.share.deleteShareBySource('event', existing.id).then(function () { signLinkState = { url: null }; render(); });
        });
      });
    }

    render();
    refreshSignLinkState();

    // ---- Footer: Delete | Shopping list | Deduct stock | BEO | Proposal | Share | Duplicate | Edit ----
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    const deleteBtn = PCD.el('button', { type: 'button', class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    const shopBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline' });
    shopBtn.innerHTML = '🛒 ' + PCD.escapeHtml(t('event_shopping_list') || 'Shopping list');
    let applyInvBtn = null;
    if ((existing.functions || []).some(function (f) { return f.menu && f.menu.length; })) {
      applyInvBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline' });
    }
    function _renderDeductBtnState() {
      if (!applyInvBtn) return;
      if (existing._stockDeductedAt) {
        applyInvBtn.disabled = true;
        applyInvBtn.innerHTML = PCD.icon('check', 14) + ' ' + PCD.escapeHtml(t('inv_already_deducted') || 'Stock deducted');
        applyInvBtn.style.color = '#15803d'; applyInvBtn.style.borderColor = '#bbf7d0'; applyInvBtn.style.background = '#f0fdf4';
      } else {
        applyInvBtn.disabled = false;
        applyInvBtn.innerHTML = '📦 ' + PCD.escapeHtml(t('event_apply_inventory') || 'Deduct stock');
        applyInvBtn.style.color = ''; applyInvBtn.style.borderColor = ''; applyInvBtn.style.background = '';
      }
    }
    if (applyInvBtn) _renderDeductBtnState();
    const printBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: t('event_beo') || 'BEO sheet' });
    printBtn.innerHTML = PCD.icon('print', 16);
    const proposalBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: L('event_proposal', 'Client proposal') });
    proposalBtn.innerHTML = '📄 ' + PCD.escapeHtml(L('event_proposal_short', 'Proposal'));
    const shareBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: t('btn_share') });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const dupBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', title: t('event_duplicate') || 'Duplicate' });
    dupBtn.innerHTML = PCD.icon('copy', 16);
    const editBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('edit'), style: { flex: '1', minWidth: '90px' } });

    footer.appendChild(deleteBtn);
    footer.appendChild(shopBtn);
    if (applyInvBtn) footer.appendChild(applyInvBtn);
    footer.appendChild(printBtn);
    footer.appendChild(proposalBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(dupBtn);
    footer.appendChild(editBtn);

    const m = PCD.modal.open({ title: existing.name || t('untitled'), body: body, footer: footer, size: 'lg', closable: true });

    deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        if (PCD.share && PCD.share.deleteShareBySource) { PCD.share.deleteShareBySource('event', existing.id).catch(function () {}); }
        PCD.store.deleteFromTable('events', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'events') render_list(v);
        }, 250);
      });
    });

    shopBtn.addEventListener('click', function () { openShoppingList(existing); });

    if (applyInvBtn) applyInvBtn.addEventListener('click', function () {
      if (existing._stockDeductedAt) return;
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      const dd = PCD.tools.events.computeEventDeductions(existing, ingMap, recipeMap);
      const ids = Object.keys(dd.deductions);
      if (!ids.length) { PCD.toast.info(t('event_apply_inv_done').replace('{n}', 0)); return; }
      const inv = PCD.tools.inventory;
      const confirmFn = (inv && inv.confirmStockChange) ? inv.confirmStockChange : null;
      const proceed = function () {
        const report = (inv && inv.applyStockDeductions) ? inv.applyStockDeductions(dd.deductions) : [];
        const deducted = report.filter(function (r) { return r.tracked; }).length;
        const lowNow = report.filter(function (r) { return r.tracked && (r.status === 'low' || r.status === 'critical' || r.status === 'out'); }).length;
        existing._stockDeductedAt = new Date().toISOString();
        PCD.store.upsertInTable('events', existing, 'ev');
        _renderDeductBtnState();
        PCD.toast.success((t('event_apply_inv_done') || '{n} item(s) deducted from stock').replace('{n}', deducted) + (lowNow ? ' · ' + lowNow + ' ⚠' : ''));
      };
      if (!confirmFn) { proceed(); return; }
      confirmFn({
        title: t('event_apply_inventory') || 'Deduct stock',
        verb: t('event_apply_inventory') || 'Deduct stock',
        kind: 'deduct',
        note: dd.skipped.length ? ('⚠ ' + dd.skipped.length + ': ' + dd.skipped.slice(0, 5).join(', ')) : null,
        items: ids.map(function (iid) { const ing = ingMap[iid]; return { name: ing ? ing.name : iid, amount: dd.deductions[iid], unit: ing ? ing.unit : '' }; }),
      }).then(function (ok) { if (ok) proceed(); });
    });

    printBtn.addEventListener('click', function () {
      PCD.costReportPreview({
        title: (existing.name || t('untitled')) + ' · ' + (t('event_beo') || 'BEO sheet'),
        buildHtml: function (detailed) { return eventPrintHtml(existing, detailed); },
        onPrint: function (detailed) { printEvent(existing, detailed); },
      });
    });
    proposalBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireExport('events')) return;
      PCD.print(eventProposalHtml(existing), (existing.name || 'Event') + ' — ' + (t('event_proposal') || 'Proposal'));
    });
    shareBtn.addEventListener('click', function () { shareEvent(existing); });
    dupBtn.addEventListener('click', function () {
      const copy = PCD.clone(existing); delete copy.id;
      copy.name = (existing.name || t('untitled')) + ' ' + (t('event_copy_suffix') || '(copy)');
      copy.status = 'draft';
      delete copy._stockDeductedAt;
      const saved = PCD.store.upsertInTable('events', copy, 'ev');
      PCD.toast.success(t('event_duplicated') || 'Duplicated');
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'events') render_list(v);
        setTimeout(function () { openPreview(saved.id); }, 200);
      }, 150);
    });
    editBtn.addEventListener('click', function () {
      m.close();
      setTimeout(function () { openEditor(existing.id); }, 280);
    });
  }

  function openEditor(eid) {
    const t = PCD.i18n.t;
    const existing = eid ? PCD.store.getFromTable('events', eid) : null;
    if (!existing && PCD.gate) {
      if (!PCD.gate.requireAuth()) return;
      if (!PCD.gate.canCreate('events', (PCD.store.listTable('events') || []).length)) { PCD.gate.showUpgradeModal({ feature: 'events', message: t('gate_create_limit') }); return; }
    }
    const data = existing ? PCD.clone(existing) : {
      name: '', status: 'draft', notes: '',
      client: '', contactName: '', contactPhone: '',
      pricePerHead: null, budget: null, functions: [],
    };
    // v2.44.86 — Faz 1: editör HEP functions[] ile çalışır. Eski düz etkinlik açılışta tek
    // fonksiyona göç eder (date/time/guestCount/venue/menu → functions[0]); kaydedince
    // functions[] yazılır + liste/sıralama için temsilî düz alanlar aynalanır.
    if (!data.functions || !data.functions.length) {
      data.functions = [{
        id: PCD.uid('fn'), name: '', date: data.date || '', time: data.time || '', endTime: '',
        room: data.venue || '', guestCount: Number(data.guestCount) || 50, menu: data.menu || [], notes: ''
      }];
    }
    // v2.44.91 — Pro alanları + eski tek-depozito → ödeme planına göç.
    if (!data.charges) data.charges = [];
    if (!data.timeline) data.timeline = [];
    if (!data.tasks) data.tasks = [];
    if (!data.payments) data.payments = [];
    if (data.deposit && !data.payments.length) {
      data.payments.push({ label: t('event_deposit') || 'Deposit', due: '', amount: data.deposit, paid: true });
    }

    const body = PCD.el('div');

    function render() {
      const ingMap = {}, recipeMap = {};
      PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      const stats = computeStats(data, ingMap, recipeMap);

      const attendees = eventGuests(data);
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('event_name')} *</label>
          <input type="text" class="input" id="eName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('event_name_ph')}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${PCD.escapeHtml(t('event_client') || 'Client / company')}</label>
            <input type="text" class="input" id="eClient" value="${PCD.escapeHtml(data.client || '')}" placeholder="${PCD.escapeHtml(t('event_client_ph') || 'e.g. Acme Corp')}">
          </div>
          <div class="field">
            <label class="field-label">${t('event_status')}</label>
            <select class="select" id="eStatus">
              ${STATUSES.map(function (s) { return '<option value="' + s + '"' + (data.status === s ? ' selected' : '') + '>' + t('event_status_' + s) + '</option>'; }).join('')}
            </select>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${PCD.escapeHtml(t('event_contact_name') || 'Contact person')}</label>
            <input type="text" class="input" id="eContact" value="${PCD.escapeHtml(data.contactName || '')}" placeholder="${PCD.escapeHtml(t('event_contact_ph') || 'e.g. John')}">
          </div>
          <div class="field">
            <label class="field-label">${PCD.escapeHtml(t('event_contact_phone') || 'Contact phone')}</label>
            <input type="tel" class="input" id="ePhone" value="${PCD.escapeHtml(data.contactPhone || '')}" placeholder="+61 ...">
          </div>
        </div>

        <div class="field">
          <label class="field-label">${PCD.escapeHtml(L('event_client_email', 'Client email'))}</label>
          <div class="text-muted text-sm" style="font-size:12px;margin-bottom:4px;">${PCD.escapeHtml(L('event_client_email_hint', 'Used to send the client an automatic copy of the signed proposal once they sign.'))}</div>
          <input type="email" class="input" id="eClientEmail" value="${PCD.escapeHtml(data.clientEmail || '')}" placeholder="client@example.com">
        </div>

        <div class="section" style="margin:8px 0 14px;">
          <div class="section-header">
            <div class="section-title">${PCD.escapeHtml(t('event_functions') || 'Functions')} (${data.functions.length})</div>
            <button class="btn btn-outline btn-sm" id="addFnBtn">+ ${PCD.escapeHtml(L('event_add_function', 'Add function'))}</button>
          </div>
          <div class="text-muted text-sm" style="margin:-2px 0 10px;">${PCD.escapeHtml(t('event_functions_hint') || 'One event can have several functions in a day (reception · dinner · supper) — each with its own time, guests and menu.')}</div>
          <div id="fnList" class="flex flex-col gap-3"></div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${t('event_price_per_head')}</label>
            <input type="number" class="input" id="ePrice" value="${data.pricePerHead || ''}" step="0.01" min="0">
          </div>
          <div class="field">
            <label class="field-label">${t('event_customer_budget')}</label>
            <input type="number" class="input" id="eBudget" value="${data.budget || ''}" step="0.01" min="0" placeholder="${PCD.escapeHtml(t('event_customer_budget_placeholder'))}">
            <div class="field-hint">${t('event_customer_budget_hint')}</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">${PCD.escapeHtml(t('event_service_charge') || 'Service charge %')}</label>
          <input type="number" class="input" id="eSvc" value="${data.serviceChargePct || ''}" step="0.5" min="0" max="100" placeholder="0" style="max-width:160px;">
        </div>

        <details id="staffWrap" ${(data.staffing && data.staffing.length) ? 'open' : ''} style="margin:0 0 14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-700);user-select:none;list-style:none;">🧑‍🍳 ${PCD.escapeHtml(L('event_staffing', 'Staffing & labor'))}${stats.laborCost > 0 ? ' · ' + PCD.fmtMoney(stats.laborCost) : ''}</summary>
          <div class="text-muted text-sm" style="margin:6px 0 8px;">${PCD.escapeHtml(t('event_staffing_hint') || 'Crew × hours × rate → true profit includes labor, not just food.')}</div>
          <div id="staffList"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addStaffBtn" style="margin-top:8px;">+ ${PCD.escapeHtml(L('event_add_role', 'Add role'))}</button>
        </details>

        <details id="chargesWrap" ${(data.charges && data.charges.length) ? 'open' : ''} style="margin:0 0 14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-700);user-select:none;list-style:none;">💰 ${PCD.escapeHtml(L('event_charges', 'Charges & extras'))}${stats.chargesRevenue > 0 ? ' · ' + PCD.fmtMoney(stats.chargesRevenue) : ''}</summary>
          <div class="text-muted text-sm" style="margin:6px 0 8px;">${PCD.escapeHtml(t('event_charges_hint') || 'Beverage, rentals, AV, other — your cost + what the client pays.')}</div>
          <div id="chargesList"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addChargeBtn" style="margin-top:8px;">+ ${PCD.escapeHtml(L('event_add_charge', 'Add charge'))}</button>
        </details>

        <details id="payWrap" ${(data.payments && data.payments.length) ? 'open' : ''} style="margin:0 0 14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-700);user-select:none;list-style:none;">🧾 ${PCD.escapeHtml(L('event_payments', 'Payment schedule'))}${stats.paidToDate > 0 ? ' · ' + PCD.fmtMoney(stats.paidToDate) + ' ' + PCD.escapeHtml(t('event_paid') || 'paid') : ''}</summary>
          <div class="text-muted text-sm" style="margin:6px 0 8px;">${PCD.escapeHtml(t('event_payments_hint') || 'Deposit + installments with due dates. Tick when paid → balance updates.')}</div>
          <div id="payList"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addPayBtn" style="margin-top:8px;">+ ${PCD.escapeHtml(L('event_add_payment', 'Add payment'))}</button>
        </details>

        <details id="tlWrap" ${(data.timeline && data.timeline.length) ? 'open' : ''} style="margin:0 0 14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-700);user-select:none;list-style:none;">🕐 ${PCD.escapeHtml(L('event_timeline', 'Run-of-show'))}${(data.timeline && data.timeline.length) ? ' · ' + data.timeline.length : ''}</summary>
          <div class="text-muted text-sm" style="margin:6px 0 8px;">${PCD.escapeHtml(t('event_timeline_hint') || 'Chronological schedule: load-in → service → breakdown.')}</div>
          <div id="tlList"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addTlBtn" style="margin-top:8px;">+ ${PCD.escapeHtml(L('event_add_timeline', 'Add step'))}</button>
        </details>

        <details id="taskWrap" ${(data.tasks && data.tasks.length) ? 'open' : ''} style="margin:0 0 14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-700);user-select:none;list-style:none;">✅ ${PCD.escapeHtml(L('event_tasks', 'Tasks & checklist'))}${(data.tasks && data.tasks.length) ? ' · ' + (data.tasks.filter(function (x) { return x.done; }).length) + '/' + data.tasks.length : ''}</summary>
          <div class="text-muted text-sm" style="margin:6px 0 8px;">${PCD.escapeHtml(t('event_tasks_hint') || 'Countdown checklist: tasting, final count, order rentals…')}</div>
          <div id="taskList"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addTaskBtn" style="margin-top:8px;">+ ${PCD.escapeHtml(L('event_add_task', 'Add task'))}</button>
        </details>

        <div class="stat mb-3" style="background:var(--brand-50);border-color:var(--brand-300);">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
            <div>
              <div class="stat-label">${t('event_total_cost')}</div>
              <div style="font-size:18px;font-weight:800;">${PCD.fmtMoney(stats.totalCost)}</div>
            </div>
            ${(attendees > 0) ? '<div><div class="stat-label">' + (t('event_cost_per_head') || 'Food cost / guest') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.totalCost / attendees) + '</div></div>' : ''}
            ${stats.laborCost > 0 ? '<div><div class="stat-label">' + (t('event_labor_cost') || 'Labor') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.laborCost) + '</div></div>' : ''}
            ${stats.chargesCost > 0 ? '<div><div class="stat-label">' + (t('event_charges_cost') || 'Extras cost') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.chargesCost) + '</div></div>' : ''}
            ${(stats.laborCost > 0 || stats.chargesCost > 0) ? '<div><div class="stat-label">' + (t('event_grand_total') || 'Total cost') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.grandTotal) + '</div></div>' : ''}
            ${data.budget > 0 ? (function () {
              const remaining = (data.budget || 0) - stats.grandTotal;
              const usedPct = data.budget > 0 ? (stats.grandTotal / data.budget) * 100 : 0;
              const color = usedPct > 90 ? 'var(--danger)' : usedPct > 70 ? '#d97706' : 'var(--success)';
              return '<div style="text-align:end;">' +
                '<div class="stat-label">' + t('event_customer_budget') + '</div>' +
                '<div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(data.budget) + '</div>' +
              '</div>' +
              '<div style="text-align:end;">' +
                '<div class="stat-label">' + t('event_profit_vs_budget') + '</div>' +
                '<div style="font-size:18px;font-weight:800;color:' + color + ';">' + PCD.fmtMoney(remaining) + ' (' + (100 - usedPct).toFixed(0) + '%)</div>' +
              '</div>';
            })() : ''}
            ${stats.totalRevenue > 0 ? '<div style="text-align:end;"><div class="stat-label">' + t('event_total_revenue') + '</div><div style="font-size:18px;font-weight:800;">' + PCD.fmtMoney(stats.totalRevenue) + '</div></div>' : ''}
            ${stats.profit !== null ? '<div style="text-align:end;"><div class="stat-label">' + t('event_profit') + '</div><div style="font-size:18px;font-weight:800;color:' + (stats.profit >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + PCD.fmtMoney(stats.profit) + (stats.margin !== null ? ' (' + PCD.fmtPercent(stats.margin, 0) + ')' : '') + '</div></div>' : ''}
          </div>
        </div>

        ${(stats.subtotal > 0 && (stats.svcPct > 0 || stats.paidToDate > 0 || stats.chargesRevenue > 0 || stats.billed !== stats.attendees)) ? '<div class="text-muted text-sm" style="margin:0 0 14px;line-height:1.9;padding:8px 12px;background:var(--surface-2);border-radius:8px;">' +
          '<strong>' + PCD.escapeHtml(t('event_billed_guests') || 'Billed guests') + ':</strong> ' + stats.billed +
          ' · ' + PCD.escapeHtml(t('event_food_revenue') || 'Food') + ' ' + PCD.fmtMoney(stats.foodRevenue) +
          (stats.chargesRevenue > 0 ? ' · ' + PCD.escapeHtml(t('event_charges') || 'Extras') + ' +' + PCD.fmtMoney(stats.chargesRevenue) : '') +
          (stats.serviceCharge > 0 ? ' · ' + PCD.escapeHtml(t('event_service_label') || 'Service charge') + ' (' + stats.svcPct + '%) +' + PCD.fmtMoney(stats.serviceCharge) : '') +
          ' · <strong>' + PCD.escapeHtml(t('event_total_revenue') || 'Total') + ' ' + PCD.fmtMoney(stats.totalRevenue) + '</strong>' +
          (stats.paidToDate > 0 ? ' · ' + PCD.escapeHtml(t('event_paid') || 'Paid') + ' −' + PCD.fmtMoney(stats.paidToDate) + ' · <strong>' + (stats.balanceDue < 0 ? PCD.escapeHtml(t('event_overpaid') || 'Overpaid') + ' ' + PCD.fmtMoney(Math.abs(stats.balanceDue)) : PCD.escapeHtml(t('event_balance_due') || 'Balance due') + ' ' + PCD.fmtMoney(stats.balanceDue)) + '</strong>' : '') +
        '</div>' : ''}

        <div class="field">
          <label class="field-label">${PCD.escapeHtml(t('event_cancellation_policy') || 'Cancellation policy')}</label>
          <div class="field-hint">${PCD.escapeHtml(t('event_cancellation_policy_hint') || 'e.g. Full refund 90+ days out, 50% 30–89 days, non-refundable under 30 days.')}</div>
          <textarea class="textarea" id="eCancelPolicy" rows="2">${PCD.escapeHtml(data.cancellationPolicy || '')}</textarea>
        </div>

        <div class="field">
          <label class="field-label">🔒 ${PCD.escapeHtml(L('event_notes_internal', 'Kitchen notes (internal — never shown to client)'))}</label>
          <div class="field-hint">${PCD.escapeHtml(L('event_notes_internal_hint', 'For your team only. Appears on the BEO and your own Preview — never on the client Proposal or signing page.'))}</div>
          <textarea class="textarea" id="eNotes" rows="2">${PCD.escapeHtml(data.notes || '')}</textarea>
        </div>

        <div class="field">
          <label class="field-label">🤝 ${PCD.escapeHtml(L('event_notes_client', 'Client-facing terms (shown on the signed Proposal)'))}</label>
          <div class="field-hint">${PCD.escapeHtml(L('event_notes_client_hint', 'The client will see and sign this. Only put terms/info meant for them here.'))}</div>
          <textarea class="textarea" id="eClientNotes" rows="2">${PCD.escapeHtml(data.clientNotes || '')}</textarea>
        </div>
      `;

      // v2.44.86 — Fonksiyon kartları: her fonksiyon kendi tarih/saat/salon/kişi/menü ile.
      const fnListEl = PCD.$('#fnList', body);
      data.functions.forEach(function (fn, fi) {
        const fGuests = Number(fn.guestCount) || 0;
        let fnCost = 0;
        (fn.menu || []).forEach(function (item) {
          fnCost += itemFoodCost(item, fGuests, ingMap, recipeMap);
        });
        const canRemove = data.functions.length > 1;
        const fnAlg = fnMenuAllergens(fn, ingMap, recipeMap);
        const fnDiet = fn.dietary || {};
        const dietTotal = DIET_TYPES.reduce(function (s, d) { return s + (Number(fnDiet[d.key]) || 0); }, 0);
        const card = PCD.el('div', { class: 'card', style: { padding: '14px', border: '2px solid var(--brand-300)', borderRadius: '12px', background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } });
        card.innerHTML =
          '<div class="flex items-center gap-2" style="margin:-2px 0 10px;padding-bottom:9px;border-bottom:1px solid var(--brand-200);">' +
            '<span style="display:inline-block;background:var(--brand-600);color:#fff;font-weight:800;font-size:12px;padding:2px 9px;border-radius:6px;white-space:nowrap;">#' + (fi + 1) + '</span>' +
            '<input type="text" class="input fn-name" data-fn="' + fi + '" value="' + PCD.escapeHtml(fn.name || '') + '" placeholder="' + PCD.escapeHtml((t('event_function') || 'Function') + ' ' + (fi + 1)) + '" style="font-weight:700;flex:1;min-width:0;">' +
            (canRemove ? '<button type="button" class="icon-btn fn-rm" data-fn="' + fi + '" title="' + PCD.escapeHtml(t('delete') || 'Remove') + '">' + PCD.icon('x', 16) + '</button>' : '') +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label class="field-label">' + t('event_date') + '</label><input type="date" class="input fn-date" data-fn="' + fi + '" value="' + (fn.date || '') + '"></div>' +
            '<div class="field"><label class="field-label">' + t('event_time') + '</label><input type="time" class="input fn-time" data-fn="' + fi + '" value="' + (fn.time || '') + '"></div>' +
            '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('event_end_time') || 'End') + '</label><input type="time" class="input fn-end" data-fn="' + fi + '" value="' + (fn.endTime || '') + '"></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('event_room') || 'Room / area') + '</label><input type="text" class="input fn-room" data-fn="' + fi + '" value="' + PCD.escapeHtml(fn.room || '') + '" placeholder="' + PCD.escapeHtml(t('event_room_ph') || 'e.g. Ballroom A') + '"></div>' +
            '<div class="field"><label class="field-label">' + t('event_guests') + '</label><input type="number" class="input fn-guests" data-fn="' + fi + '" value="' + (fn.guestCount || '') + '" min="0"></div>' +
            '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('event_guaranteed') || 'Guaranteed') + '</label><input type="number" class="input fn-guar" data-fn="' + fi + '" value="' + (fn.guaranteedCount || '') + '" min="0" placeholder="—"></div>' +
          '</div>' +
          '<div class="flex items-center justify-between" style="margin:6px 0 6px;">' +
            '<div style="font-weight:700;font-size:13px;">' + t('event_menu') + ' (' + (fn.menu || []).length + ')</div>' +
            '<button type="button" class="btn btn-outline btn-sm fn-add-menu" data-fn="' + fi + '">+ ' + L('event_add_item', 'Add item') + '</button>' +
          '</div>' +
          '<div class="fn-menu flex flex-col gap-2"></div>' +
          '<div class="text-muted text-sm" style="text-align:end;margin-top:6px;">' + t('event_total_cost') + ': <strong>' + PCD.fmtMoney(fnCost) + '</strong></div>' +
          (fnAlg.length ? '<div style="font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.5;"><span style="font-weight:700;color:var(--brand-700);">' + PCD.escapeHtml(t('ev_menu_contains') || 'Menu contains') + ':</span> ' + fnAlg.map(function (k) { return PCD.escapeHtml(allergenLabel(k)); }).join('  ') + '</div>' : '') +
          '<details class="fn-diet-wrap" style="margin-top:8px;"' + ((dietTotal || fn.dietaryNote) ? ' open' : '') + '>' +
            '<summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--brand-700);user-select:none;list-style:none;">🍽 ' + PCD.escapeHtml(t('diet_section') || 'Dietary requirements') + (dietTotal ? ' · ' + dietTotal : '') + '</summary>' +
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px;">' +
              DIET_TYPES.map(function (d) { return '<label style="display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--text-2);text-align:center;line-height:1.2;">' + PCD.escapeHtml(t(d.labelKey) || d.key) + '<input type="number" class="input fn-diet" data-fn="' + fi + '" data-diet="' + d.key + '" value="' + (fnDiet[d.key] || '') + '" min="0" placeholder="0" style="padding:4px 4px;min-height:30px;font-size:12px;text-align:center;"></label>'; }).join('') +
            '</div>' +
            '<input type="text" class="input fn-diet-note" data-fn="' + fi + '" value="' + PCD.escapeHtml(fn.dietaryNote || '') + '" placeholder="' + PCD.escapeHtml(t('diet_note_ph') || 'Other (e.g. 2 shellfish allergy, 1 halal)') + '" style="margin-top:6px;font-size:12px;">' +
          '</details>';
        const menuEl = card.querySelector('.fn-menu');
        (fn.menu || []).forEach(function (item, mi) {
          if (item.ingredientId) {
            const ing = ingMap[item.ingredientId]; if (!ing) return;
            const u = item.unit || ing.unit || '';
            const totAmt = fGuests * (Number(item.amountPerGuest) || 0);
            const icost = itemFoodCost(item, fGuests, ingMap, recipeMap);
            const irow = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '8px' } });
            const ithumb = PCD.el('div', { class: 'list-item-thumb', style: { width: '40px', height: '40px' } });
            ithumb.textContent = '🧂';
            const ibody = PCD.el('div', { class: 'list-item-body' });
            ibody.innerHTML =
              '<div class="list-item-title" style="font-size:14px;">' + PCD.escapeHtml(ing.name) + '</div>' +
              '<div class="list-item-meta" style="font-size:12px;">' +
                '<input type="number" class="input fn-amt" data-fn="' + fi + '" data-mi="' + mi + '" value="' + (item.amountPerGuest || '') + '" step="0.1" min="0" style="width:64px;padding:4px 8px;min-height:26px;font-size:12px;">' +
                '<span class="text-muted">' + PCD.escapeHtml(u) + ' / ' + PCD.escapeHtml(t('event_guest_one') || 'guest') + '</span>' +
                '<span>·</span><span style="font-weight:600;">' + PCD.fmtNumber(totAmt) + ' ' + PCD.escapeHtml(u) + '</span>' +
                '<span>·</span><span style="font-weight:600;color:var(--brand-700);">' + PCD.fmtMoney(icost) + '</span>' +
              '</div>';
            const irm = PCD.el('button', { class: 'icon-btn fn-rm-menu', 'data-fn': fi, 'data-mi': mi });
            irm.innerHTML = PCD.icon('x', 16);
            irow.appendChild(ithumb); irow.appendChild(ibody); irow.appendChild(irm);
            menuEl.appendChild(irow);
            return;
          }
          const r = recipeMap[item.recipeId];
          if (!r) return;
          const portionsTotal = fGuests * (Number(item.portionsPerGuest) || 1);
          const cost = PCD.recipes.computeFoodCost(r, ingMap) * (portionsTotal / (r.servings || 1));
          const row = PCD.el('div', { class: 'list-item', style: { minHeight: 'auto', padding: '8px' } });
          const thumb = PCD.el('div', { class: 'list-item-thumb', style: { width: '40px', height: '40px' } });
          if (r.photo) {
            const img = PCD.el('img');
            img.src = r.photo; img.loading = 'lazy'; img.alt = '';
            img.style.width = '100%'; img.style.height = '100%';
            img.style.objectFit = 'cover'; img.style.borderRadius = 'inherit'; img.style.display = 'block';
            thumb.appendChild(img);
          }
          else thumb.textContent = '🍽️';
          const bodyDiv = PCD.el('div', { class: 'list-item-body' });
          bodyDiv.innerHTML =
            '<div class="list-item-title" style="font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
            '<div class="list-item-meta" style="font-size:12px;">' +
              '<input type="number" class="input fn-pph" data-fn="' + fi + '" data-mi="' + mi + '" value="' + (item.portionsPerGuest || 1) + '" step="0.1" min="0" style="width:58px;padding:4px 8px;min-height:26px;font-size:12px;">' +
              '<span class="text-muted">/ ' + PCD.escapeHtml(t('event_guest_one') || 'guest') + '</span>' +
              '<span>·</span><span style="font-weight:600;">' + PCD.fmtNumber(portionsTotal) + '</span>' +
              '<span>·</span><span style="font-weight:600;color:var(--brand-700);">' + PCD.fmtMoney(cost) + '</span>' +
            '</div>';
          const rm = PCD.el('button', { class: 'icon-btn fn-rm-menu', 'data-fn': fi, 'data-mi': mi });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(thumb); row.appendChild(bodyDiv); row.appendChild(rm);
          menuEl.appendChild(row);
        });
        fnListEl.appendChild(card);
      });

      // v2.44.90 — Staffing satırları: rol × kişi × saat × ücret = işçilik.
      const staffListEl = PCD.$('#staffList', body);
      if (staffListEl) {
        (data.staffing || []).forEach(function (st, si) {
          const lineCost = (Number(st.count) || 0) * (Number(st.hours) || 0) * (Number(st.rate) || 0);
          const row = PCD.el('div', { class: 'flex items-center gap-2', style: { marginBottom: '8px', flexWrap: 'wrap' } });
          row.innerHTML =
            '<input type="text" class="input st-role" data-st="' + si + '" value="' + PCD.escapeHtml(st.role || '') + '" placeholder="' + PCD.escapeHtml(t('event_role_ph') || 'Role (e.g. Waiter)') + '" style="flex:1 1 140px;min-width:120px;">' +
            '<input type="number" class="input st-count" data-st="' + si + '" value="' + (st.count || '') + '" min="0" placeholder="#" title="' + PCD.escapeHtml(t('event_st_count') || 'Count') + '" style="width:66px;text-align:center;">' +
            '<span class="text-muted">×</span>' +
            '<input type="number" class="input st-hours" data-st="' + si + '" value="' + (st.hours || '') + '" min="0" step="0.5" placeholder="h" title="' + PCD.escapeHtml(t('event_st_hours') || 'Hours') + '" style="width:66px;text-align:center;">' +
            '<span class="text-muted">×</span>' +
            '<input type="number" class="input st-rate" data-st="' + si + '" value="' + (st.rate || '') + '" min="0" step="0.01" placeholder="' + PCD.escapeHtml(t('event_st_rate') || 'Rate') + '" title="' + PCD.escapeHtml(t('event_st_rate') || 'Rate/h') + '" style="width:84px;text-align:center;">' +
            '<span style="font-weight:700;color:var(--brand-700);white-space:nowrap;margin-left:auto;">' + PCD.fmtMoney(lineCost) + '</span>';
          const rm = PCD.el('button', { class: 'icon-btn st-rm', 'data-st': si });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          staffListEl.appendChild(row);
        });
      }

      // v2.44.91 — Charges & extras (içecek/kiralama/diğer): maliyet + müşteri fiyatı
      const chargesListEl = PCD.$('#chargesList', body);
      if (chargesListEl) {
        (data.charges || []).forEach(function (c, ci) {
          const row = PCD.el('div', { class: 'flex items-center gap-2', style: { marginBottom: '8px', flexWrap: 'wrap' } });
          row.innerHTML =
            '<input type="text" class="input ch-label" data-ch="' + ci + '" value="' + PCD.escapeHtml(c.label || '') + '" placeholder="' + PCD.escapeHtml(t('event_charge_ph') || 'e.g. Open bar package') + '" style="flex:1 1 150px;min-width:130px;">' +
            '<input type="number" class="input ch-cost" data-ch="' + ci + '" value="' + (c.cost != null ? c.cost : '') + '" min="0" step="0.01" placeholder="' + PCD.escapeHtml(t('event_charge_cost') || 'Cost') + '" title="' + PCD.escapeHtml(t('event_charge_cost') || 'Your cost') + '" style="width:92px;text-align:right;">' +
            '<input type="number" class="input ch-price" data-ch="' + ci + '" value="' + (c.price != null ? c.price : '') + '" min="0" step="0.01" placeholder="' + PCD.escapeHtml(t('event_charge_price') || 'Price') + '" title="' + PCD.escapeHtml(t('event_charge_price') || 'Client price') + '" style="width:92px;text-align:right;">';
          const rm = PCD.el('button', { class: 'icon-btn ch-rm', 'data-ch': ci });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          chargesListEl.appendChild(row);
        });
      }

      // v2.44.91 — Payment schedule: etiket + vade + tutar + ödendi
      const payListEl = PCD.$('#payList', body);
      if (payListEl) {
        (data.payments || []).forEach(function (p, pi) {
          const row = PCD.el('div', { class: 'flex items-center gap-2', style: { marginBottom: '6px', flexWrap: 'wrap' } });
          row.innerHTML =
            '<input type="text" class="input pay-label" data-pay="' + pi + '" value="' + PCD.escapeHtml(p.label || '') + '" placeholder="' + PCD.escapeHtml(t('event_pay_label') || 'e.g. Deposit') + '" style="flex:2;min-width:90px;">' +
            '<input type="date" class="input pay-due" data-pay="' + pi + '" value="' + (p.due || '') + '" title="' + PCD.escapeHtml(t('event_pay_due') || 'Due date') + '" style="width:148px;">' +
            '<input type="number" class="input pay-amount" data-pay="' + pi + '" value="' + (p.amount != null ? p.amount : '') + '" min="0" step="0.01" placeholder="' + PCD.escapeHtml(t('event_pay_amount') || 'Amount') + '" style="width:90px;">' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;cursor:pointer;"><input type="checkbox" class="pay-paid" data-pay="' + pi + '"' + (p.paid ? ' checked' : '') + '> ' + PCD.escapeHtml(t('event_paid') || 'Paid') + '</label>';
          const rm = PCD.el('button', { class: 'icon-btn pay-rm', 'data-pay': pi });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          payListEl.appendChild(row);
        });
      }

      // v2.44.91 — Run-of-show: saat + adım
      const tlListEl = PCD.$('#tlList', body);
      if (tlListEl) {
        (data.timeline || []).forEach(function (tl, ti) {
          const row = PCD.el('div', { class: 'flex items-center gap-2', style: { marginBottom: '6px' } });
          row.innerHTML =
            '<input type="time" class="input tl-time" data-tl="' + ti + '" value="' + (tl.time || '') + '" style="width:108px;">' +
            '<input type="text" class="input tl-label" data-tl="' + ti + '" value="' + PCD.escapeHtml(tl.label || '') + '" placeholder="' + PCD.escapeHtml(t('event_tl_ph') || 'e.g. Doors open / Dinner service') + '" style="flex:2;min-width:0;">';
          const rm = PCD.el('button', { class: 'icon-btn tl-rm', 'data-tl': ti });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          tlListEl.appendChild(row);
        });
      }

      // v2.44.91 — Tasks & checklist: tamamlandı + görev + vade
      const taskListEl = PCD.$('#taskList', body);
      if (taskListEl) {
        (data.tasks || []).forEach(function (tk, ki) {
          const row = PCD.el('div', { class: 'flex items-center gap-2', style: { marginBottom: '6px' } });
          row.innerHTML =
            '<input type="checkbox" class="task-done" data-task="' + ki + '"' + (tk.done ? ' checked' : '') + ' style="width:18px;height:18px;flex-shrink:0;cursor:pointer;">' +
            '<input type="text" class="input task-label" data-task="' + ki + '" value="' + PCD.escapeHtml(tk.label || '') + '" placeholder="' + PCD.escapeHtml(t('event_task_ph') || 'e.g. Confirm final guest count') + '" style="flex:2;min-width:0;' + (tk.done ? 'text-decoration:line-through;opacity:0.6;' : '') + '">' +
            '<input type="date" class="input task-due" data-task="' + ki + '" value="' + (tk.due || '') + '" style="width:140px;">';
          const rm = PCD.el('button', { class: 'icon-btn task-rm', 'data-task': ki });
          rm.innerHTML = PCD.icon('x', 16);
          row.appendChild(rm);
          taskListEl.appendChild(row);
        });
      }

      // v2.44.132 — İmza/imza-linki bu editörden kaldırıldı; artık yalnız
      // openPreview()'da yönetiliyor (tek imza mekanizması — bkz. PLAN Faz 1b).

      wire();
    }

    function wire() {
      const $ = function (id) { return PCD.$('#' + id, body); };
      $('eName').addEventListener('input', function () { data.name = this.value; });
      $('eClient').addEventListener('input', function () { data.client = this.value; });
      $('eContact').addEventListener('input', function () { data.contactName = this.value; });
      $('ePhone').addEventListener('input', function () { data.contactPhone = this.value; });
      $('eClientEmail').addEventListener('input', function () { data.clientEmail = this.value; });
      $('eStatus').addEventListener('change', function () { data.status = this.value; });
      $('eCancelPolicy').addEventListener('input', function () { data.cancellationPolicy = this.value; });
      $('eNotes').addEventListener('input', function () { data.notes = this.value; });
      $('eClientNotes').addEventListener('input', function () { data.clientNotes = this.value; });
      $('ePrice').addEventListener('input', PCD.debounce(function () { data.pricePerHead = parseFloat(this.value) || null; render(); }, 400));
      $('eBudget').addEventListener('input', PCD.debounce(function () { data.budget = parseFloat(this.value) || null; render(); }, 400));
      $('eSvc').addEventListener('input', PCD.debounce(function () { data.serviceChargePct = Math.min(100, parseFloat(this.value) || 0) || null; render(); }, 400));

      const addStaffBtn = $('addStaffBtn');
      if (addStaffBtn) addStaffBtn.addEventListener('click', function () {
        if (!data.staffing) data.staffing = [];
        data.staffing.push({ role: '', count: 1, hours: 6, rate: 25 });
        render();
      });
      const stOf = function (el) { return (data.staffing || [])[parseInt(el.getAttribute('data-st'), 10)]; };
      PCD.on(body, 'input', '.st-role', function () { const s = stOf(this); if (s) s.role = this.value; });
      PCD.on(body, 'input', '.st-count', PCD.debounce(function () { const s = stOf(this); if (s) { s.count = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'input', '.st-hours', PCD.debounce(function () { const s = stOf(this); if (s) { s.hours = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'input', '.st-rate', PCD.debounce(function () { const s = stOf(this); if (s) { s.rate = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'click', '.st-rm', function () { const i = parseInt(this.getAttribute('data-st'), 10); if (data.staffing) { data.staffing.splice(i, 1); render(); } });

      // Charges & extras
      const addChargeBtn = $('addChargeBtn');
      if (addChargeBtn) addChargeBtn.addEventListener('click', function () { if (!data.charges) data.charges = []; data.charges.push({ label: '', cost: null, price: null }); render(); });
      const chOf = function (el) { return (data.charges || [])[parseInt(el.getAttribute('data-ch'), 10)]; };
      PCD.on(body, 'input', '.ch-label', function () { const c = chOf(this); if (c) c.label = this.value; });
      PCD.on(body, 'input', '.ch-cost', PCD.debounce(function () { const c = chOf(this); if (c) { c.cost = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'input', '.ch-price', PCD.debounce(function () { const c = chOf(this); if (c) { c.price = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'click', '.ch-rm', function () { const i = parseInt(this.getAttribute('data-ch'), 10); if (data.charges) { data.charges.splice(i, 1); render(); } });

      // Payment schedule
      const addPayBtn = $('addPayBtn');
      if (addPayBtn) addPayBtn.addEventListener('click', function () { if (!data.payments) data.payments = []; data.payments.push({ label: '', due: '', amount: null, paid: false }); render(); });
      const payOf = function (el) { return (data.payments || [])[parseInt(el.getAttribute('data-pay'), 10)]; };
      PCD.on(body, 'input', '.pay-label', function () { const p = payOf(this); if (p) p.label = this.value; });
      PCD.on(body, 'input', '.pay-due', function () { const p = payOf(this); if (p) p.due = this.value; });
      PCD.on(body, 'input', '.pay-amount', PCD.debounce(function () { const p = payOf(this); if (p) { p.amount = parseFloat(this.value) || 0; render(); } }, 400));
      PCD.on(body, 'change', '.pay-paid', function () { const p = payOf(this); if (p) { p.paid = this.checked; render(); } });
      PCD.on(body, 'click', '.pay-rm', function () { const i = parseInt(this.getAttribute('data-pay'), 10); if (data.payments) { data.payments.splice(i, 1); render(); } });

      // Run-of-show
      const addTlBtn = $('addTlBtn');
      if (addTlBtn) addTlBtn.addEventListener('click', function () { if (!data.timeline) data.timeline = []; data.timeline.push({ time: '', label: '' }); render(); });
      const tlOf = function (el) { return (data.timeline || [])[parseInt(el.getAttribute('data-tl'), 10)]; };
      PCD.on(body, 'input', '.tl-time', function () { const x = tlOf(this); if (x) x.time = this.value; });
      PCD.on(body, 'input', '.tl-label', function () { const x = tlOf(this); if (x) x.label = this.value; });
      PCD.on(body, 'click', '.tl-rm', function () { const i = parseInt(this.getAttribute('data-tl'), 10); if (data.timeline) { data.timeline.splice(i, 1); render(); } });

      // Tasks & checklist
      const addTaskBtn = $('addTaskBtn');
      if (addTaskBtn) addTaskBtn.addEventListener('click', function () { if (!data.tasks) data.tasks = []; data.tasks.push({ label: '', due: '', done: false }); render(); });
      const taskOf = function (el) { return (data.tasks || [])[parseInt(el.getAttribute('data-task'), 10)]; };
      PCD.on(body, 'input', '.task-label', function () { const x = taskOf(this); if (x) x.label = this.value; });
      PCD.on(body, 'input', '.task-due', function () { const x = taskOf(this); if (x) x.due = this.value; });
      PCD.on(body, 'change', '.task-done', function () { const x = taskOf(this); if (x) { x.done = this.checked; render(); } });
      PCD.on(body, 'click', '.task-rm', function () { const i = parseInt(this.getAttribute('data-task'), 10); if (data.tasks) { data.tasks.splice(i, 1); render(); } });

      $('addFnBtn').addEventListener('click', function () {
        const last = data.functions[data.functions.length - 1] || {};
        data.functions.push({ id: PCD.uid('fn'), name: '', date: last.date || '', time: '', endTime: '', room: last.room || '', guestCount: Number(last.guestCount) || 50, menu: [], notes: '' });
        render();
      });

      // Per-function alanlar (delegasyon; data-fn = fonksiyon index'i)
      const fnOf = function (el) { return data.functions[parseInt(el.getAttribute('data-fn'), 10)]; };
      PCD.on(body, 'input', '.fn-name', function () { const f = fnOf(this); if (f) f.name = this.value; });
      PCD.on(body, 'input', '.fn-date', function () { const f = fnOf(this); if (f) f.date = this.value; });
      PCD.on(body, 'input', '.fn-time', function () { const f = fnOf(this); if (f) f.time = this.value; });
      PCD.on(body, 'input', '.fn-end', function () { const f = fnOf(this); if (f) f.endTime = this.value; });
      PCD.on(body, 'input', '.fn-room', function () { const f = fnOf(this); if (f) f.room = this.value; });
      PCD.on(body, 'input', '.fn-guests', PCD.debounce(function () { const f = fnOf(this); if (f) { f.guestCount = parseInt(this.value, 10) || 0; render(); } }, 400));
      PCD.on(body, 'input', '.fn-guar', PCD.debounce(function () { const f = fnOf(this); if (f) { f.guaranteedCount = parseInt(this.value, 10) || 0; render(); } }, 400));
      // Diyet sayıları + not: render YOK (details açık + odak korunur; maliyeti etkilemez).
      PCD.on(body, 'input', '.fn-diet', function () { const f = fnOf(this); if (f) { if (!f.dietary) f.dietary = {}; f.dietary[this.getAttribute('data-diet')] = parseInt(this.value, 10) || 0; } });
      PCD.on(body, 'input', '.fn-diet-note', function () { const f = fnOf(this); if (f) f.dietaryNote = this.value; });
      PCD.on(body, 'input', '.fn-pph', PCD.debounce(function () {
        const f = fnOf(this); const mi = parseInt(this.getAttribute('data-mi'), 10);
        if (f && f.menu && f.menu[mi]) { f.menu[mi].portionsPerGuest = parseFloat(this.value) || 0; render(); }
      }, 400));
      PCD.on(body, 'input', '.fn-amt', PCD.debounce(function () {
        const f = fnOf(this); const mi = parseInt(this.getAttribute('data-mi'), 10);
        if (f && f.menu && f.menu[mi]) { f.menu[mi].amountPerGuest = parseFloat(this.value) || 0; render(); }
      }, 400));
      PCD.on(body, 'click', '.fn-rm-menu', function () {
        const f = fnOf(this); const mi = parseInt(this.getAttribute('data-mi'), 10);
        if (f && f.menu) { f.menu.splice(mi, 1); render(); }
      });
      PCD.on(body, 'click', '.fn-rm', function () {
        const i = parseInt(this.getAttribute('data-fn'), 10);
        if (data.functions.length > 1) { data.functions.splice(i, 1); render(); }
      });
      PCD.on(body, 'click', '.fn-add-menu', function () {
        const f = fnOf(this); if (!f) return;
        const allRecipes = PCD.store.listRecipes();
        const allIngredients = PCD.store.listIngredients();
        const idType = {};   // id -> 'recipe' | 'ingredient'
        const items = [];
        allRecipes.filter(function (r) { return !r.isSubRecipe; }).forEach(function (r) {
          idType[r.id] = 'recipe';
          items.push({ id: r.id, name: r.name, tab: 'dishes', meta: t(r.category || 'cat_main') + ' · ' + (r.servings || 1) + 'p', thumb: r.photo || '' });
        });
        allRecipes.filter(function (r) { return r.isSubRecipe; }).forEach(function (r) {
          idType[r.id] = 'recipe';
          items.push({ id: r.id, name: r.name, tab: 'subs', meta: (r.yieldAmount ? r.yieldAmount + ' ' + (r.yieldUnit || '') : ''), thumb: r.photo || '' });
        });
        allIngredients.forEach(function (ing) {
          idType[ing.id] = 'ingredient';
          items.push({ id: ing.id, name: ing.name, tab: 'ingredients', meta: (ing.pricePerUnit ? PCD.fmtMoney(ing.pricePerUnit) + '/' + (ing.unit || '') : (ing.unit || '')), icon: '🧂' });
        });
        if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet')); return; }
        const selectedIds = (f.menu || []).map(function (m) { return m.recipeId || m.ingredientId; });
        PCD.picker.open({
          title: L('event_add_item', 'Add item'),
          items: items, multi: true, selected: selectedIds,
          tabs: [
            { key: 'dishes', label: t('event_tab_dish') },
            { key: 'subs', label: t('event_tab_sub') },
            { key: 'ingredients', label: t('event_tab_ingredient') },
          ],
        }).then(function (selIds) {
          if (!selIds) return;
          const ingById = {};
          allIngredients.forEach(function (i) { ingById[i.id] = i; });
          const existingMap = {};
          (f.menu || []).forEach(function (m) { existingMap[m.recipeId || m.ingredientId] = m; });
          f.menu = selIds.map(function (id) {
            if (existingMap[id]) return existingMap[id];
            if (idType[id] === 'ingredient') {
              const ing = ingById[id];
              const u = (ing && ing.unit) || 'g';
              return { ingredientId: id, amountPerGuest: ingredientDefaultPerGuest(u), unit: u };
            }
            return { recipeId: id, portionsPerGuest: 1 };
          });
          render();
        });
      });

    }

    render();

    // v2.44.132 — Editör artık salt veri düzenleme; Delete/BEO/Proposal/Share/
    // Shopping-list/Deduct-stock openPreview()'a taşındı (bkz PLAN Faz 1a/1b).
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || t('untitled')) : t('new_event'),
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    // v2.44.86 — liste/sıralama + geriye-uyum için temsilî düz alanları aynala.
    function syncFlatMirrorFields() {
      const fns = data.functions || [];
      const dated = fns.map(function (f) { return f.date; }).filter(Boolean).sort();
      data.date = dated[0] || (fns[0] && fns[0].date) || '';
      data.time = (fns[0] && fns[0].time) || '';
      data.guestCount = eventGuests(data);
      data.venue = (fns[0] && fns[0].room) || '';
      data.menu = (fns[0] && fns[0].menu) || [];
    }
    saveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      if (!data.name || !data.name.trim()) { PCD.toast.error(t('event_name') + ' ' + t('required')); return; }
      if (existing) data.id = existing.id;
      syncFlatMirrorFields();
      const saved = PCD.store.upsertInTable('events', data, 'ev');
      PCD.toast.success(t('event_saved'));
      m.close();
      // v2.44.132 — Kaydettikten sonra listeye değil Preview'a dönülür (bkz PLAN Faz 1a).
      setTimeout(function () { openPreview(saved.id); }, 280);
    });
  }

  function render_list(view) { render(view); }

  function buildEventText(event) {
    const t = PCD.i18n.t;
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    const stats = computeStats(event, ingMap, recipeMap);
    const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    const fmtD = function (d) { return d ? new Date(d).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''; };
    const guestWord = (t('event_guests') || 'guests').toLowerCase();

    const lines = [];
    lines.push(event.name || 'Event');
    if (event.status) lines.push((t('event_status') || 'Status') + ': ' + (t('event_status_' + event.status) || event.status));
    if (event.client) lines.push('🏢 ' + event.client);
    if (event.contactName) lines.push('👤 ' + event.contactName + (event.contactPhone ? ' · ' + event.contactPhone : ''));
    if (event.pricePerHead) lines.push('💵 ' + PCD.fmtMoney(event.pricePerHead) + ' / ' + (t('event_guest_one') || 'guest'));
    lines.push('');
    eventFunctions(event).forEach(function (fn, fi) {
      const title = (fn.name || '').trim() || ((t('event_function') || 'Function') + ' ' + (fi + 1));
      lines.push('▸ ' + title);
      const when = [fmtD(fn.date), [fn.time, fn.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ');
      if (when) lines.push('  📅 ' + when);
      if (Number(fn.guestCount)) lines.push('  👥 ' + fn.guestCount + ' ' + guestWord + (Number(fn.guaranteedCount) ? ' (' + (t('event_guaranteed_short') || 'guar.') + ' ' + fn.guaranteedCount + ')' : ''));
      if (fn.room) lines.push('  📍 ' + fn.room);
      (fn.menu || []).forEach(function (item) {
        if (item.ingredientId) {
          const ing = ingMap[item.ingredientId]; if (!ing) return;
          const u = item.unit || ing.unit || '';
          const totalAmt = (Number(fn.guestCount) || 0) * (Number(item.amountPerGuest) || 0);
          lines.push('  • ' + ing.name + ' — ' + PCD.fmtNumber(totalAmt) + ' ' + u + ' (' + (item.amountPerGuest || 0) + ' ' + u + '/' + (t('event_guest_one') || 'guest') + ')');
          return;
        }
        const r = recipeMap[item.recipeId];
        if (!r) return;
        const portions = (Number(fn.guestCount) || 0) * (item.portionsPerGuest || 1);
        lines.push('  • ' + r.name + ' — ' + portions + ' (' + (item.portionsPerGuest || 1) + '/' + (t('event_guest_one') || 'guest') + ')');
      });
      const alg = fnMenuAllergens(fn, ingMap, recipeMap);
      if (alg.length) lines.push('  ⚠ ' + alg.map(function (k) { return allergenLabel(k); }).join('  '));
      const diet = fn.dietary || {};
      const dparts = DIET_TYPES.filter(function (d) { return Number(diet[d.key]) > 0; }).map(function (d) { return diet[d.key] + ' ' + (t(d.labelKey) || d.key); });
      if (fn.dietaryNote) dparts.push(fn.dietaryNote);
      if (dparts.length) lines.push('  🍽 ' + dparts.join(' · '));
      lines.push('');
    });
    // v2.44.133 — Müşteri-güvenli varsayılan: maliyet/işçilik/kâr YOK (bu metin
    // doğrudan WhatsApp/Email ile müşteriye gidiyor). Yalnız proposal'ın gösterdiği
    // aynı rakamlar (bkz eventProposalHtml): toplam fiyat + ödeme planı + bakiye.
    if (stats.totalRevenue > 0) {
      lines.push('— ' + (t('event_pricing') || 'Pricing') + ' —');
      if (stats.foodRevenue > 0) lines.push((t('event_food_revenue') || 'Catering') + ': ' + PCD.fmtMoney(stats.foodRevenue));
      (event.charges || []).forEach(function (c) {
        if (!((c.label || '').trim() || Number(c.price))) return;
        lines.push((c.label || '—') + ': ' + PCD.fmtMoney(Number(c.price) || 0));
      });
      if (stats.serviceCharge > 0) lines.push((t('event_service_label') || 'Service charge') + ' (' + stats.svcPct + '%): +' + PCD.fmtMoney(stats.serviceCharge));
      lines.push((t('ev_print_total_revenue') || 'Total') + ': ' + PCD.fmtMoney(stats.totalRevenue));
      if (stats.paidToDate > 0) {
        lines.push((t('event_paid') || 'Paid') + ': −' + PCD.fmtMoney(stats.paidToDate));
        lines.push(stats.balanceDue < 0 ? (t('event_overpaid') || 'Overpaid') + ': ' + PCD.fmtMoney(Math.abs(stats.balanceDue)) : (t('event_balance_due') || 'Balance due') + ': ' + PCD.fmtMoney(stats.balanceDue));
      }
    }
    // v2.44.137 — YALNIZ clientNotes: bu metin doğrudan müşteriye gidiyor (WhatsApp/Email),
    // iç mutfak notu (event.notes) buraya asla girmemeli.
    if (event.clientNotes) {
      lines.push('');
      lines.push((t('ev_print_notes') || 'Notes') + ': ' + event.clientNotes);
    }
    return lines.join('\n');
  }

  function printEvent(event, detailed) { if (PCD.gate && !PCD.gate.requireExport('events')) return; PCD.print(eventPrintHtml(event, detailed), event.name || (PCD.i18n.t('ev_print_default_title') || 'Event')); }
  function eventPrintHtml(event, detailed) {
    const t = PCD.i18n.t;
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    const stats = computeStats(event, ingMap, recipeMap);
    const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    const fmtD = function (d) { return d ? new Date(d).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
    const guestsLabel = (t('ev_print_guests') || 'Guests').toLowerCase();

    // Bir fonksiyonun menü satırlarını o fonksiyonun kişi sayısına ölçekle.
    function menuRowsFor(menu, fGuests) {
      let out = '';
      (menu || []).forEach(function (item) {
        if (item.ingredientId) {
          const ing = ingMap[item.ingredientId]; if (!ing) return;
          const u = item.unit || ing.unit || '';
          const totalAmt = (Number(fGuests) || 0) * (Number(item.amountPerGuest) || 0);
          out += '<tr>' +
            '<td>' + PCD.escapeHtml(ing.name) + '</td>' +
            '<td style="text-align:center;">' + (item.amountPerGuest || 0) + ' ' + PCD.escapeHtml(u) + '/' + PCD.escapeHtml(t('event_guest_one') || 'guest') + '</td>' +
            '<td style="text-align:right;">' + PCD.fmtNumber(totalAmt) + ' ' + PCD.escapeHtml(u) + '</td>' +
            '<td style="text-align:right;font-weight:600;">' + PCD.fmtMoney(itemFoodCost(item, fGuests, ingMap, recipeMap)) + '</td>' +
            '</tr>';
          return;
        }
        const r = recipeMap[item.recipeId];
        if (!r) return;
        const portions = (Number(fGuests) || 0) * (item.portionsPerGuest || 1);
        const scale = portions / (r.servings || 1);
        const fc = PCD.recipes.computeFoodCost(r, ingMap, recipeMap) * scale;
        out += '<tr>' +
          '<td>' + PCD.escapeHtml(r.name) + '</td>' +
          '<td style="text-align:center;">' + (item.portionsPerGuest || 1) + '/' + PCD.escapeHtml(t('event_guest_one') || 'guest') + '</td>' +
          '<td style="text-align:right;">' + portions + '</td>' +
          '<td style="text-align:right;font-weight:600;">' + PCD.fmtMoney(fc) + '</td>' +
          '</tr>';
        // v2.43.18 — detailed sub-recipe breakdown per dish, scaled to function portions.
        if (detailed) {
          PCD.recipes.costBreakdownRows(r, ingMap, recipeMap, true).forEach(function (row) {
            if (row.isSubHeader) {
              out += '<tr style="font-size:9pt;color:#777;"><td style="padding-left:26px;border-bottom:1px dashed #f0f0f0;">↳ ' + PCD.escapeHtml(row.name) + '</td><td></td><td></td><td style="text-align:right;border-bottom:1px dashed #f0f0f0;">' + PCD.fmtMoney(row.lineCost * scale) + '</td></tr>';
              return;
            }
            const q = (row.qtyInStock != null ? row.qtyInStock : row.amount) * scale;
            out += '<tr style="font-size:9pt;color:#777;"><td style="padding-left:' + (row.indent ? '42px' : '26px') + ';">' + (row.indent ? '└ ' : '') + PCD.escapeHtml(row.name) + '</td><td></td><td style="text-align:right;">' + PCD.fmtNumber(q) + ' ' + PCD.escapeHtml(row.stockUnit || row.qtyUnit || '') + '</td><td style="text-align:right;">' + PCD.fmtMoney(row.lineCost * scale) + '</td></tr>';
          });
        }
      });
      return out;
    }
    function menuTable(rowsHtml) {
      if (!rowsHtml) return '';
      return '<table class="ev-table"><thead><tr>' +
        '<th>' + PCD.escapeHtml(t('ev_print_recipe') || 'Recipe') + '</th>' +
        '<th style="text-align:center;">' + PCD.escapeHtml(t('ev_print_per_guest') || 'Per guest') + '</th>' +
        '<th style="text-align:right;">' + PCD.escapeHtml(t('ev_print_total_portions') || 'Total portions') + '</th>' +
        '<th style="text-align:right;">' + PCD.escapeHtml(t('cr_cost') || 'Cost') + '</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';
    }
    // v2.44.87 — fonksiyon ek satırları: menü alerjenleri (oto) + diyet sayıları (manuel).
    function fnExtrasPrint(fn) {
      let out = '';
      const alg = fnMenuAllergens(fn, ingMap, recipeMap);
      if (alg.length) out += '<div class="ev-fn-tag"><span class="ev-fn-lbl">' + PCD.escapeHtml(t('ev_menu_contains') || 'Menu contains') + ':</span> ' + alg.map(function (k) { return PCD.escapeHtml(allergenLabel(k)); }).join('  ') + '</div>';
      const diet = fn.dietary || {};
      const parts = DIET_TYPES.filter(function (d) { return Number(diet[d.key]) > 0; }).map(function (d) { return diet[d.key] + ' ' + PCD.escapeHtml(t(d.labelKey) || d.key); });
      if (fn.dietaryNote) parts.push(PCD.escapeHtml(fn.dietaryNote));
      if (parts.length) out += '<div class="ev-fn-tag"><span class="ev-fn-lbl">' + PCD.escapeHtml(t('diet_section') || 'Dietary') + ':</span> ' + parts.join(' · ') + '</div>';
      return out;
    }

    const fns = eventFunctions(event);
    // Tek isimsiz fonksiyon = eski düzen (meta grid + tek tablo); çok/isimli = BEO blokları.
    const multi = fns.length > 1 || (fns[0] && (fns[0].name || '').trim());
    let bodyHtml = '';
    if (!multi) {
      const fn = fns[0] || {};
      bodyHtml =
        '<div class="ev-meta">' +
          (fn.date ? '<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('ev_print_date') || 'Date') + '</div><div class="ev-meta-value">' + PCD.escapeHtml(fmtD(fn.date)) + (fn.time ? ' · ' + PCD.escapeHtml(fn.time) : '') + '</div></div></div>' : '') +
          (fn.guestCount ? '<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('ev_print_guests') || 'Guests') + '</div><div class="ev-meta-value">' + fn.guestCount + '</div></div></div>' : '') +
          (fn.room ? '<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('ev_print_venue') || 'Venue') + '</div><div class="ev-meta-value">' + PCD.escapeHtml(fn.room) + '</div></div></div>' : '') +
          (event.contactName ? '<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('event_contact_name') || 'Contact') + '</div><div class="ev-meta-value">' + PCD.escapeHtml(event.contactName) + (event.contactPhone ? ' · ' + PCD.escapeHtml(event.contactPhone) : '') + '</div></div></div>' : '') +
          (event.pricePerHead ? '<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('ev_print_price_person') || 'Price/person') + '</div><div class="ev-meta-value">' + PCD.fmtMoney(event.pricePerHead) + '</div></div></div>' : '') +
        '</div>';
      const rows = menuRowsFor(fn.menu, fn.guestCount);
      if (rows) bodyHtml += '<div class="ev-section-title">' + PCD.escapeHtml(t('ev_print_menu') || 'Menu') + '</div>' + menuTable(rows);
      bodyHtml += fnExtrasPrint(fn);
    } else {
      const headBits = [];
      if (event.client) headBits.push('<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('event_client') || 'Client') + '</div><div class="ev-meta-value">' + PCD.escapeHtml(event.client) + '</div></div></div>');
      if (event.contactName) headBits.push('<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('event_contact_name') || 'Contact') + '</div><div class="ev-meta-value">' + PCD.escapeHtml(event.contactName) + (event.contactPhone ? ' · ' + PCD.escapeHtml(event.contactPhone) : '') + '</div></div></div>');
      if (event.pricePerHead) headBits.push('<div class="ev-meta-item"><div><div class="ev-meta-label">' + PCD.escapeHtml(t('ev_print_price_person') || 'Price/person') + '</div><div class="ev-meta-value">' + PCD.fmtMoney(event.pricePerHead) + '</div></div></div>');
      if (headBits.length) bodyHtml += '<div class="ev-meta">' + headBits.join('') + '</div>';
      fns.forEach(function (fn, fi) {
        const when = [fmtD(fn.date), [fn.time, fn.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ');
        const guestsBit = Number(fn.guestCount) ? (fn.guestCount + ' ' + guestsLabel + (Number(fn.guaranteedCount) ? ' (' + PCD.escapeHtml(t('event_guaranteed_short') || 'guar.') + ' ' + fn.guaranteedCount + ')' : '')) : '';
        const sub = [when, fn.room, guestsBit].filter(Boolean).join('  ·  ');
        const title = (fn.name || '').trim() || ((t('event_function') || 'Function') + ' ' + (fi + 1));
        const rows = menuRowsFor(fn.menu, fn.guestCount);
        bodyHtml +=
          '<div class="ev-fn-block">' +
            '<div class="ev-fn-head"><span class="ev-fn-n">#' + (fi + 1) + '</span>' + PCD.escapeHtml(title) + '</div>' +
            (sub ? '<div class="ev-fn-sub">' + PCD.escapeHtml(sub) + '</div>' : '') +
            (rows ? menuTable(rows) : '<div class="ev-fn-empty">—</div>') +
            fnExtrasPrint(fn) +
          '</div>';
      });
    }

    let staffingHtml = '';
    if (event.staffing && event.staffing.length) {
      const stRows = event.staffing.filter(function (l) { return (l.role || '').trim() || Number(l.count) || Number(l.rate); }).map(function (l) {
        const lc = (Number(l.count) || 0) * (Number(l.hours) || 0) * (Number(l.rate) || 0);
        return '<tr><td>' + PCD.escapeHtml(l.role || '—') + '</td><td style="text-align:center;">' + (l.count || 0) + ' × ' + (l.hours || 0) + 'h × ' + PCD.fmtMoney(l.rate || 0) + '</td><td style="text-align:right;font-weight:600;">' + PCD.fmtMoney(lc) + '</td></tr>';
      }).join('');
      if (stRows) staffingHtml =
        '<div class="ev-section-title">' + PCD.escapeHtml(L('event_staffing', 'Staffing & labor')) + '</div>' +
        '<table class="ev-table"><thead><tr><th>' + PCD.escapeHtml(t('event_role') || 'Role') + '</th><th style="text-align:center;">' + PCD.escapeHtml(t('event_staffing_calc') || 'Crew × hours × rate') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('cr_cost') || 'Cost') + '</th></tr></thead><tbody>' + stRows + '</tbody></table>';
    }

    // v2.44.91 — Run-of-show + Charges bölümleri (BEO)
    let timelineHtml = '';
    if (event.timeline && event.timeline.length) {
      const tlRows = event.timeline.slice().filter(function (x) { return (x.label || '').trim() || x.time; })
        .sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); })
        .map(function (x) { return '<tr><td style="width:90px;font-weight:700;white-space:nowrap;color:#16433a;">' + PCD.escapeHtml(x.time || '') + '</td><td>' + PCD.escapeHtml(x.label || '') + '</td></tr>'; }).join('');
      if (tlRows) timelineHtml = '<div class="ev-section-title">' + PCD.escapeHtml(L('event_timeline', 'Run-of-show')) + '</div><table class="ev-table"><tbody>' + tlRows + '</tbody></table>';
    }
    let chargesHtml = '';
    if (event.charges && event.charges.length) {
      const cRows = event.charges.filter(function (c) { return (c.label || '').trim() || Number(c.cost) || Number(c.price); })
        .map(function (c) { return '<tr><td>' + PCD.escapeHtml(c.label || '—') + '</td><td style="text-align:right;font-weight:600;">' + PCD.fmtMoney(Number(c.price) || 0) + '</td></tr>'; }).join('');
      if (cRows) chargesHtml = '<div class="ev-section-title">' + PCD.escapeHtml(L('event_charges', 'Charges & extras')) + '</div><table class="ev-table"><thead><tr><th>' + PCD.escapeHtml(t('event_charge_item') || 'Item') + '</th><th style="text-align:right;">' + PCD.escapeHtml(t('event_charge_price') || 'Price') + '</th></tr></thead><tbody>' + cRows + '</tbody></table>';
    }

    const html =
      '<style>' +
        '@page { size: A4; margin: 0; }' +
        'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; max-width: 800px; margin: 0 auto; padding: 10mm; font-variant-numeric: tabular-nums; }' +
        '.ev-header { border-bottom: 3px solid #16433a; padding-bottom: 14px; margin-bottom: 20px; }' +
        '.ev-header h1 { margin: 0 0 6px; font-family: "Fraunces","Georgia",serif; font-size: 24pt; font-weight: 600; letter-spacing: -0.01em; color: #16433a; }' +
        '.ev-status { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }' +
        '.ev-status.confirmed { background: #dcfce7; color: #166534; }' +
        '.ev-status.draft { background: #f1f5f9; color: #475569; }' +
        '.ev-status.tentative { background: #fef9c3; color: #854d0e; }' +
        '.ev-status.done { background: #dbeafe; color: #1e40af; }' +
        '.ev-status.cancelled { background: #fee2e2; color: #991b1b; }' +
        '.ev-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; margin-bottom: 20px; }' +
        '.ev-meta-item { display: flex; gap: 8px; align-items: center; }' +
        '.ev-meta-label { font-size: 9pt; text-transform: uppercase; color: #888; letter-spacing: 0.04em; font-weight: 700; }' +
        '.ev-meta-value { font-size: 12pt; color: #1c1917; font-weight: 500; }' +
        '.ev-section-title { font-family: "Fraunces","Georgia",serif; font-size: 13pt; font-weight: 600; color: #16433a; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e7e5e4; }' +
        '.ev-table { width: 100%; border-collapse: collapse; font-size: 11pt; }' +
        '.ev-table th { text-align: left; padding: 8px 10px; background: #eaf6f0; font-size: 9pt; text-transform: uppercase; color: #16433a; letter-spacing: 0.04em; }' +
        '.ev-table td { padding: 8px 10px; border-bottom: 1px solid #eee; }' +
        '.ev-fn-block { margin: 18px 0; page-break-inside: avoid; }' +
        '.ev-fn-head { font-family: "Fraunces","Georgia",serif; font-size: 14pt; font-weight: 600; color: #16433a; margin-bottom: 2px; }' +
        '.ev-fn-n { display: inline-block; background: #16433a; color: #fff; font-family: "Inter",sans-serif; font-size: 9pt; font-weight: 700; padding: 1px 7px; border-radius: 5px; margin-right: 8px; vertical-align: middle; }' +
        '.ev-fn-sub { font-size: 10pt; color: #666; margin-bottom: 8px; }' +
        '.ev-fn-empty { font-size: 10pt; color: #999; padding: 2px 0 6px; }' +
        '.ev-fn-tag { font-size: 10pt; color: #444; margin: 5px 0; line-height: 1.5; }' +
        '.ev-fn-lbl { font-weight: 700; color: #16433a; }' +
        '.ev-summary { background: #edf6f0; border: 1px solid #cbe8d8; border-radius: 8px; padding: 14px 18px; margin-top: 16px; }' +
        '.ev-summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12pt; }' +
        '.ev-summary-row.total { font-weight: 700; font-size: 14pt; border-top: 2px solid #16433a; margin-top: 6px; padding-top: 8px; color: #16433a; }' +
        '.ev-notes { background: #f8f8f8; padding: 14px; border-radius: 8px; margin-top: 16px; font-size: 11pt; line-height: 1.6; white-space: pre-wrap; }' +
        '.ev-notes-label { font-size: 9pt; text-transform: uppercase; color: #888; letter-spacing: 0.04em; font-weight: 700; margin-bottom: 6px; }' +
      '</style>' +
      '<div class="ev-header">' +
        '<h1>' + PCD.escapeHtml(event.name || (t('ev_print_default_title') || 'Event')) + '</h1>' +
        '<span class="ev-status ' + (event.status || 'draft') + '">' + PCD.escapeHtml(t('ev_status_' + (event.status || 'draft')) || event.status || 'draft') + '</span>' +
      '</div>' +
      bodyHtml +
      timelineHtml +
      chargesHtml +
      staffingHtml +
      '<div class="ev-summary">' +
        '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('ev_print_total_food_cost') || 'Total food cost') + '</span><span>' + PCD.fmtMoney(stats.totalCost) + '</span></div>' +
        (stats.laborCost > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_labor_cost') || 'Labor cost') + '</span><span>' + PCD.fmtMoney(stats.laborCost) + '</span></div>' : '') +
        (stats.chargesCost > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_charges_cost') || 'Extras cost') + '</span><span>' + PCD.fmtMoney(stats.chargesCost) + '</span></div>' : '') +
        ((stats.laborCost > 0 || stats.chargesCost > 0) ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_grand_total') || 'Total cost') + '</span><span>' + PCD.fmtMoney(stats.grandTotal) + '</span></div>' : '') +
        (event.budget > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('ev_print_customer_budget') || 'Customer budget') + '</span><span>' + PCD.fmtMoney(event.budget) + '</span></div>' : '') +
        ((stats.totalRevenue > 0 && (stats.chargesRevenue > 0 || stats.serviceCharge > 0)) ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_food_revenue') || 'Food') + ' (' + stats.billed + ')</span><span>' + PCD.fmtMoney(stats.foodRevenue) + '</span></div>' : '') +
        (stats.chargesRevenue > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(L('event_charges', 'Charges & extras')) + '</span><span>+' + PCD.fmtMoney(stats.chargesRevenue) + '</span></div>' : '') +
        (stats.serviceCharge > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_service_label') || 'Service charge') + ' (' + stats.svcPct + '%)</span><span>+' + PCD.fmtMoney(stats.serviceCharge) + '</span></div>' : '') +
        (stats.totalRevenue > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('ev_print_total_revenue') || 'Total revenue') + '</span><span>' + PCD.fmtMoney(stats.totalRevenue) + '</span></div>' : '') +
        (stats.paidToDate > 0 ? '<div class="ev-summary-row"><span>' + PCD.escapeHtml(t('event_paid') || 'Paid') + '</span><span>−' + PCD.fmtMoney(stats.paidToDate) + '</span></div>' : '') +
        (stats.paidToDate > 0 ? '<div class="ev-summary-row"><span>' + (stats.balanceDue < 0 ? PCD.escapeHtml(t('event_overpaid') || 'Overpaid') : PCD.escapeHtml(t('event_balance_due') || 'Balance due')) + '</span><span>' + PCD.fmtMoney(Math.abs(stats.balanceDue)) + '</span></div>' : '') +
        (stats.profit !== null ? '<div class="ev-summary-row total"><span>' + PCD.escapeHtml(t('ev_print_profit') || 'Profit') + (stats.margin !== null ? ' (' + PCD.fmtPercent(stats.margin, 0) + ')' : '') + '</span><span>' + PCD.fmtMoney(stats.profit) + '</span></div>' : '') +
      '</div>' +
      (event.notes ?
        '<div class="ev-notes"><div class="ev-notes-label">' + PCD.escapeHtml(t('ev_print_notes') || 'Notes') + '</div>' + PCD.escapeHtml(event.notes) + '</div>'
      : '');

    return html;
  }

  // v2.44.91 — Müşteri teklifi (client-facing). İç maliyet/kâr GÖSTERMEZ; sadece
  // müşteri fiyatları + ödeme planı + şartlar + imza. Pro araçların "proposal" karşılığı.
  function eventProposalHtml(event) {
    const t = PCD.i18n.t;
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    const stats = computeStats(event, ingMap, recipeMap);
    const locale = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    const fmtD = function (d) { return d ? new Date(d).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
    const guestsLabel = (t('ev_print_guests') || 'Guests').toLowerCase();

    let fnHtml = '';
    eventFunctions(event).forEach(function (fn, fi) {
      const when = [fmtD(fn.date), [fn.time, fn.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ');
      const guestsBit = Number(fn.guestCount) ? (fn.guestCount + ' ' + guestsLabel + (Number(fn.guaranteedCount) ? ' (' + PCD.escapeHtml(t('event_guaranteed_short') || 'guar.') + ' ' + fn.guaranteedCount + ')' : '')) : '';
      const sub = [when, fn.room, guestsBit].filter(Boolean).join('  ·  ');
      const title = (fn.name || '').trim() || ((t('event_function') || 'Function') + ' ' + (fi + 1));
      let dishes = '';
      (fn.menu || []).forEach(function (item) {
        let nm = '';
        if (item.recipeId) { const r = recipeMap[item.recipeId]; if (r) nm = r.name; }
        else if (item.ingredientId) { const ing = ingMap[item.ingredientId]; if (ing) nm = ing.name; }
        if (nm) dishes += '<li>' + PCD.escapeHtml(nm) + '</li>';
      });
      const alg = fnMenuAllergens(fn, ingMap, recipeMap);
      const diet = fn.dietary || {};
      const dietParts = DIET_TYPES.filter(function (d) { return Number(diet[d.key]) > 0; }).map(function (d) { return diet[d.key] + ' ' + PCD.escapeHtml(t(d.labelKey) || d.key); });
      if (fn.dietaryNote) dietParts.push(PCD.escapeHtml(fn.dietaryNote));
      fnHtml += '<div class="pr-fn"><div class="pr-fn-h">' + PCD.escapeHtml(title) + '</div>' +
        (sub ? '<div class="pr-fn-sub">' + PCD.escapeHtml(sub) + '</div>' : '') +
        (dishes ? '<ul class="pr-menu">' + dishes + '</ul>' : '') +
        (alg.length ? '<div class="pr-alg">' + PCD.escapeHtml(t('ev_menu_contains') || 'Menu contains') + ': ' + alg.map(function (k) { return PCD.escapeHtml(allergenLabel(k)); }).join('  ') + '</div>' : '') +
        (dietParts.length ? '<div class="pr-alg">' + PCD.escapeHtml(t('diet_section') || 'Dietary') + ': ' + dietParts.join(' · ') + '</div>' : '') +
        '</div>';
    });

    let tlHtml = '';
    if (event.timeline && event.timeline.length) {
      const tlRows = event.timeline.slice().filter(function (x) { return (x.label || '').trim() || x.time; })
        .sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); })
        .map(function (x) { return '<tr><td style="width:90px;font-weight:700;white-space:nowrap;color:#16433a;">' + PCD.escapeHtml(x.time || '') + '</td><td>' + PCD.escapeHtml(x.label || '') + '</td></tr>'; }).join('');
      if (tlRows) tlHtml = '<div class="pr-h2">' + PCD.escapeHtml(L('event_timeline', 'Run-of-show')) + '</div><table class="pr-tbl"><tbody>' + tlRows + '</tbody></table>';
    }

    let priceRows = '';
    if (stats.foodRevenue > 0) priceRows += '<tr><td>' + PCD.escapeHtml(t('event_food_revenue') || 'Catering') + ' (' + stats.billed + ' × ' + PCD.fmtMoney(event.pricePerHead || 0) + ')</td><td class="r">' + PCD.fmtMoney(stats.foodRevenue) + '</td></tr>';
    (event.charges || []).forEach(function (c) {
      if (!((c.label || '').trim() || Number(c.price))) return;
      priceRows += '<tr><td>' + PCD.escapeHtml(c.label || '—') + '</td><td class="r">' + PCD.fmtMoney(Number(c.price) || 0) + '</td></tr>';
    });
    if (stats.serviceCharge > 0) priceRows += '<tr><td>' + PCD.escapeHtml(t('event_service_label') || 'Service charge') + ' (' + stats.svcPct + '%)</td><td class="r">' + PCD.fmtMoney(stats.serviceCharge) + '</td></tr>';

    let payHtml = '';
    if (event.payments && event.payments.length) {
      const pr = event.payments.filter(function (p) { return (p.label || '').trim() || Number(p.amount); }).map(function (p) {
        return '<tr><td>' + PCD.escapeHtml(p.label || '—') + '</td><td>' + PCD.escapeHtml(p.due ? fmtD(p.due) : '—') + '</td><td class="r">' + PCD.fmtMoney(Number(p.amount) || 0) + '</td><td class="r">' + (p.paid ? '✓ ' + PCD.escapeHtml(t('event_paid') || 'Paid') : '—') + '</td></tr>';
      }).join('');
      if (pr) payHtml = '<div class="pr-h2">' + PCD.escapeHtml(L('event_payments', 'Payment schedule')) + '</div><table class="pr-tbl"><thead><tr><th>' + PCD.escapeHtml(t('event_pay_label') || 'Payment') + '</th><th>' + PCD.escapeHtml(t('event_pay_due') || 'Due') + '</th><th class="r">' + PCD.escapeHtml(t('event_pay_amount') || 'Amount') + '</th><th class="r">' + PCD.escapeHtml(t('event_paid') || 'Paid') + '</th></tr></thead><tbody>' + pr + '</tbody></table>';
    }

    const html =
      '<style>' +
        '@page { size: A4; margin: 0; }' +
        'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; max-width: 800px; margin: 0 auto; padding: 10mm; font-variant-numeric: tabular-nums; }' +
        '.pr-head { border-bottom: 3px solid #16433a; padding-bottom: 14px; margin-bottom: 18px; }' +
        '.pr-badge { display: inline-block; background: #16433a; color: #fff; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 5px; margin-bottom: 8px; }' +
        '.pr-head h1 { margin: 0 0 4px; font-family: "Fraunces","Georgia",serif; font-size: 24pt; font-weight: 600; color: #16433a; }' +
        '.pr-client { font-size: 11pt; color: #555; }' +
        '.pr-fn { margin: 12px 0; page-break-inside: avoid; }' +
        '.pr-fn-h { font-family: "Fraunces","Georgia",serif; font-size: 13pt; font-weight: 600; color: #16433a; }' +
        '.pr-fn-sub { font-size: 10pt; color: #666; margin-bottom: 4px; }' +
        '.pr-menu { margin: 4px 0 4px 0; padding-left: 20px; font-size: 11pt; line-height: 1.6; }' +
        '.pr-alg { font-size: 9.5pt; color: #777; margin-top: 2px; }' +
        '.pr-h2 { font-family: "Fraunces","Georgia",serif; font-size: 13pt; font-weight: 600; color: #16433a; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e7e5e4; }' +
        '.pr-tbl { width: 100%; border-collapse: collapse; font-size: 11pt; }' +
        '.pr-tbl th { text-align: left; padding: 7px 10px; background: #eaf6f0; font-size: 9pt; text-transform: uppercase; color: #16433a; letter-spacing: 0.04em; }' +
        '.pr-tbl td { padding: 7px 10px; border-bottom: 1px solid #eee; }' +
        '.pr-tbl .r { text-align: right; }' +
        '.pr-tbl .pr-total td { font-weight: 700; font-size: 12.5pt; color: #16433a; border-top: 2px solid #16433a; border-bottom: none; }' +
        '.pr-terms { background: #f8f8f8; padding: 12px 14px; border-radius: 8px; font-size: 10.5pt; line-height: 1.6; white-space: pre-wrap; }' +
        '.pr-sign { display: flex; gap: 40px; margin-top: 40px; }' +
        '.pr-sig { flex: 1; font-size: 10pt; color: #555; }' +
        '.pr-sig-line { border-top: 1px solid #1c1917; margin-bottom: 6px; height: 36px; }' +
      '</style>' +
      '<div class="pr-head">' +
        '<div class="pr-badge">' + PCD.escapeHtml(t('event_proposal') || 'Event Proposal') + '</div>' +
        '<h1>' + PCD.escapeHtml(event.name || (t('ev_print_default_title') || 'Event')) + '</h1>' +
        (event.client || event.contactName ? '<div class="pr-client">' + [event.client, event.contactName, event.contactPhone].filter(Boolean).map(function (x) { return PCD.escapeHtml(x); }).join(' · ') + '</div>' : '') +
      '</div>' +
      fnHtml +
      tlHtml +
      (priceRows ?
        '<div class="pr-h2">' + PCD.escapeHtml(t('event_pricing') || 'Pricing') + '</div>' +
        '<table class="pr-tbl"><tbody>' + priceRows +
          '<tr class="pr-total"><td>' + PCD.escapeHtml(t('ev_print_total_revenue') || 'Total') + '</td><td class="r">' + PCD.fmtMoney(stats.totalRevenue) + '</td></tr>' +
          (stats.paidToDate > 0 ? '<tr><td>' + PCD.escapeHtml(t('event_paid') || 'Paid') + '</td><td class="r">−' + PCD.fmtMoney(stats.paidToDate) + '</td></tr><tr class="pr-total"><td>' + (stats.balanceDue < 0 ? PCD.escapeHtml(t('event_overpaid') || 'Overpaid') : PCD.escapeHtml(t('event_balance_due') || 'Balance due')) + '</td><td class="r">' + PCD.fmtMoney(Math.abs(stats.balanceDue)) + '</td></tr>' : '') +
        '</tbody></table>'
      : '') +
      payHtml +
      (event.cancellationPolicy ? '<div class="pr-h2">' + PCD.escapeHtml(t('event_cancellation_policy') || 'Cancellation policy') + '</div><div class="pr-terms">' + PCD.escapeHtml(event.cancellationPolicy) + '</div>' : '') +
      // v2.44.137 — YALNIZ clientNotes (şefin ayrıca işaretlediği müşteriye-yönelik metin).
      // event.notes ARTIK BURADA KULLANILMAZ — o iç/mutfak notu, müşteriye asla gitmemeli
      // (bkz operatör bildirimi: tek "Notes" alanı iç talimatı müşteriye sızdırıyordu).
      (event.clientNotes ? '<div class="pr-h2">' + PCD.escapeHtml(t('event_terms') || 'Terms & notes') + '</div><div class="pr-terms">' + PCD.escapeHtml(event.clientNotes) + '</div>' : '') +
      '<div class="pr-sign">' +
        '<div class="pr-sig">' +
          ((event.signature && event.signature.dataUrl)
            ? '<img src="' + event.signature.dataUrl + '" style="max-height:54px;display:block;margin-bottom:2px;"><div class="pr-sig-line" style="margin-bottom:6px;"></div>' + PCD.escapeHtml((event.signature.signedBy || '') + (event.signature.signedAt ? ' · ' + fmtD(event.signature.signedAt) : ''))
            : '<div class="pr-sig-line"></div>' + PCD.escapeHtml(t('event_sign_client') || 'Client signature & date')) +
        '</div>' +
        '<div class="pr-sig"><div class="pr-sig-line"></div>' + PCD.escapeHtml(t('event_sign_provider') || 'Caterer signature & date') + '</div>' +
      '</div>';
    return html;
  }

  // v2.44.130 — Uzaktan e-imza linki için snapshot. eventProposalHtml() zaten
  // maliyet/kâr sızdırmayacak şekilde tasarlı (bkz yukarıdaki yorum) — aynı HTML
  // doğrudan payload'a gömülür (menu_studio'nun payload.studioHtml deseniyle aynı
  // mantık: şefin cihazında bir kez üretilir, public sayfa yeniden hesaplamaz).
  function snapshotEvent(id) {
    const event = PCD.store.getFromTable('events', id);
    if (!event) return null;
    return {
      kind: 'event',
      name: event.name || '',
      html: eventProposalHtml(event),
      signature: event.signature || null,
      sharedAt: new Date().toISOString(),
    };
  }

  // v2.44.130 — Uzaktan imza public sayfası. share.js'in renderSharePage'i bunu
  // 'event' kind'i için çağırır (kitchencard'ın renderFromSnapshot'u gibi, ama
  // interaktif olduğu için container'ı doğrudan alır ve kendi DOM wiring'ini yapar).
  // shareId = public_shares.id (imza submit edge function'a bununla gider).
  // alreadySignedAt = share.signed_at (RPC ile server-side işaretlenmiş imza durumu).
  function renderSignatureView(container, p, shareId, alreadySignedAt) {
    const t = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t : function (k, fb) { return fb || k; };
    const signable = !(p.signature && p.signature.dataUrl) && !alreadySignedAt;

    // v2.44.146 — imzalı durum artık görsel + isim + tarih + yazdır butonu
    // gösterir (dataUrl payload'da yoksa — bu migration'dan ÖNCE imzalanmış
    // eski share'lerde — düz metne düşer, hata vermez).
    function signedBlockHtml(sig) {
      const fmtD = function (d) { return d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
      const dataUrl = sig && sig.dataUrl;
      const meta = sig ? PCD.escapeHtml((sig.signedBy || '') + (sig.signedAt ? ' · ' + fmtD(sig.signedAt) : '')) : '';
      return '<div style="border:1px solid #cbe8d8;background:#eaf6f0;border-radius:10px;padding:16px;color:#16433a;">' +
        '<div style="font-weight:700;margin-bottom:' + (dataUrl ? '10px' : '0') + ';">✓ ' + PCD.escapeHtml(t('event_sign_already') || 'This proposal has already been signed.') + '</div>' +
        (dataUrl ? '<img src="' + dataUrl + '" alt="Signature" style="max-height:70px;display:block;margin-bottom:4px;background:#fff;border-radius:4px;">' : '') +
        (meta ? '<div style="font-size:13px;font-weight:600;">' + meta + '</div>' : '') +
        '<button type="button" class="btn btn-outline" id="evSigPrint" style="margin-top:12px;">' + PCD.icon('print', 16) + ' ' + PCD.escapeHtml(t('btn_print_save_pdf') || 'Print / Save as PDF') + '</button>' +
      '</div>';
    }

    // v2.44.146 — bu ekran PCD.print() üzerinden değil (misafir gate'ine takılmasın
    // diye) doğrudan window.print() ile basılıyor; genel print.css'teki
    // `body{padding:0 !important}` kuralı bu yüzden telafi edilmeli — aynı 10mm
    // değeri eventProposalHtml'in kendi body padding'iyle tutarlı.
    container.innerHTML = '<style>@media print { body { padding: 10mm !important; } }</style>' + p.html +
      '<div id="evSignBox" style="max-width:800px;margin:0 auto;padding:0 10mm 20mm;">' +
      (signable
        ? '<div style="border:1px solid var(--border,#e7e5e4);border-radius:10px;padding:16px;">' +
            '<div style="font-weight:700;font-size:14px;color:#16433a;margin-bottom:10px;">' + PCD.escapeHtml(t('event_sign_heading') || 'Sign to approve this proposal') + '</div>' +
            '<div class="field"><label class="field-label">' + PCD.escapeHtml(t('event_signed_by') || 'Signed by') + '</label>' +
            '<input type="text" class="input" id="evSigName" placeholder="' + PCD.escapeHtml(t('event_contact_name') || 'Name') + '"></div>' +
            '<div class="field-label" style="margin-top:10px;">' + PCD.escapeHtml(t('event_sign_here') || 'Sign below') + '</div>' +
            '<canvas id="evSigCanvas" width="520" height="200" style="width:100%;height:200px;border:2px dashed #ccc;border-radius:10px;background:#fff;touch-action:none;cursor:crosshair;display:block;"></canvas>' +
            '<div style="display:flex;gap:8px;margin-top:10px;">' +
              '<button type="button" class="btn btn-outline" id="evSigClear">' + PCD.escapeHtml(t('event_sign_clear') || 'Clear') + '</button>' +
              '<div style="flex:1;"></div>' +
              '<button type="button" class="btn btn-primary" id="evSigSubmit">' + PCD.escapeHtml(t('event_sign_submit') || 'Sign & Submit') + '</button>' +
            '</div>' +
          '</div>'
        : signedBlockHtml(p.signature)) +
      '</div>';

    function wirePrintBtn() {
      const printBtn = document.getElementById('evSigPrint');
      if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    }
    if (!signable) { wirePrintBtn(); return; }

    const canvas = PCD.$ ? PCD.$('#evSigCanvas', container) : container.querySelector('#evSigCanvas');
    const pad = wireSignatureCanvas(canvas);
    const clearBtn = container.querySelector('#evSigClear');
    const submitBtn = container.querySelector('#evSigSubmit');
    const nameInput = container.querySelector('#evSigName');
    clearBtn.addEventListener('click', function () { pad.clear(); });
    submitBtn.addEventListener('click', function () {
      if (pad.isEmpty()) { if (PCD.toast) PCD.toast.warning(t('event_sign_empty') || 'Please sign first.'); return; }
      const supabase = window._supabaseClient;
      if (!supabase) return;
      submitBtn.disabled = true;
      const dataUrl = pad.toDataURL();
      const signedBy = (nameInput.value || '').trim();
      supabase.functions.invoke('submit-event-signature', {
        body: { share_id: shareId, signature_data_url: dataUrl, signed_by: signedBy },
      }).then(function (res) {
        if (res && res.data && res.data.signed) {
          document.getElementById('evSignBox').innerHTML =
            signedBlockHtml({ dataUrl: dataUrl, signedBy: signedBy, signedAt: new Date().toISOString() });
          wirePrintBtn();
        } else {
          submitBtn.disabled = false;
          if (PCD.toast) PCD.toast.error(t('event_sign_error') || 'Could not submit signature. Please try again.');
        }
      }).catch(function () {
        submitBtn.disabled = false;
        if (PCD.toast) PCD.toast.error(t('event_sign_error') || 'Could not submit signature. Please try again.');
      });
    });
  }

  function shareEvent(event) {
    const text = buildEventText(event);
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">Message (editable)</label>' +
      '<textarea class="textarea" id="evShareText" rows="14" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px;margin-top:14px;">' +
        '<button class="btn btn-outline" id="evShWa" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#25D366;">' + PCD.icon('message-circle', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">WhatsApp</div></button>' +
        '<button class="btn btn-outline" id="evShEmail" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:#EA4335;">' + PCD.icon('mail', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">Email</div></button>' +
        '<button class="btn btn-outline" id="evShCopy" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--brand-600);">' + PCD.icon('copy', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">Copy</div></button>' +
        '<button class="btn btn-outline" id="evShPdf" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--brand-700);">' + PCD.icon('print', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">PDF</div></button>' +
        '<button class="btn btn-outline" id="evShMore" style="flex-direction:column;height:auto;padding:14px 6px;gap:6px;">' +
          '<div style="color:var(--text-2);">' + PCD.icon('share', 24) + '</div>' +
          '<div style="font-weight:600;font-size:12px;">More...</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_share_named', { name: (event.name || 'Event') }), body: body, footer: footer, size: 'md', closable: true });
    function getMsg() { return PCD.$('#evShareText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#evShWa', body).addEventListener('click', function () {
      window.open('https://wa.me/?text=' + encodeURIComponent(getMsg()), '_blank');
      m.close();
    });
    PCD.$('#evShEmail', body).addEventListener('click', function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(event.name || 'Event') + '&body=' + encodeURIComponent(getMsg());
      m.close();
    });
    PCD.$('#evShCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(getMsg()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
      }
    });
    PCD.$('#evShPdf', body).addEventListener('click', function () {
      // v2.44.35 — "PDF olarak gönder": biçimli event sayfasını yazdırma ekranında
      // aç → "PDF kaydet" (mobilde oradan PDF'i paylaşabilir). Bağımlılık yok.
      m.close();
      printEvent(event);
    });
    PCD.$('#evShMore', body).addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: event.name || 'Event', text: getMsg() }).then(function () { m.close(); }).catch(function () {});
      } else {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(getMsg()).then(function () { PCD.toast.success(PCD.i18n.t('toast_copied')); m.close(); });
        }
      }
    });
  }

  // v2.37 — Etkinlik alışveriş listesi: menü tariflerini konuk sayısına ölçekle,
  // flattenIngredients ile gerçek malzemelere indir.
  // v2.44 — DİREKT malzemeler tedarikçiye göre grupla; her SUB-RECIPE'nin
  // malzemeleri kendi grubunda (yarı saydam başlık + belirgin ayraç) → karışmaz.
  function buildEventShopping(event, ingMap, recipeMap) {
    const t = PCD.i18n.t;
    // v2.44.114 — TÜM malzemeler (direkt + alt-tarif içindekiler dahil) tek seviyede
    // toplanıp YALNIZ TEDARİKÇİYE göre gruplanır → her tedarikçinin tam siparişi tek
    // grupta, hepsi sipariş edilebilir. (Eski sürümde alt-tarif malzemeleri ayrı grupta
    // kalıp sipariş edilemiyordu — caterer için "işlevsiz" hissinin asıl nedeni.)
    const bucket = {};
    function addRow(ing, unit, amt) {
      if (!ing || !(amt > 0)) return;
      const u = unit || ing.unit || '';
      const key = ing.id + '|' + u;
      if (!bucket[key]) bucket[key] = { ing: ing, unit: u, amount: 0 };
      bucket[key].amount += amt;
    }
    eventFunctions(event).forEach(function (fn) {
      const guests = Number(fn.guestCount) || 0;
      (fn.menu || []).forEach(function (item) {
        if (item.ingredientId) {
          const ing = ingMap[item.ingredientId]; if (!ing) return;
          addRow(ing, item.unit || ing.unit || '', guests * (Number(item.amountPerGuest) || 0));
          return;
        }
        const r = recipeMap[item.recipeId]; if (!r) return;
        const portions = guests * (Number(item.portionsPerGuest) || 1);
        const scale = portions / (Number(r.servings) || 1);
        if (!(scale > 0)) return;
        PCD.recipes.flattenIngredients(r, ingMap, recipeMap, { scale: scale }).forEach(function (f) {
          addRow(f.ingredient, f.unit || '', Number(f.amount) || 0);
        });
      });
    });
    return groupRowsBySupplier(Object.keys(bucket).map(function (k) { return bucket[k]; }), t('event_shop_other') || 'Other');
  }

  // v2.44.114 — Satırları tedarikçiye göre grupla (tedarikçisiz grup en sona; o gruba
  // sipariş gönderilmez — supplier:'' ). rows: [{ing, unit, amount}].
  function groupRowsBySupplier(rows, otherLabel) {
    const supGroups = {};
    rows.forEach(function (row) {
      const sup = (row.ing.supplier || '').trim() || otherLabel;
      (supGroups[sup] = supGroups[sup] || []).push(row);
    });
    function byName(a, b) { return (a.ing.name || '').localeCompare(b.ing.name || ''); }
    return Object.keys(supGroups).sort(function (a, b) {
      if (a === otherLabel) return 1; if (b === otherLabel) return -1; return a.localeCompare(b);
    }).map(function (sup) {
      return { label: sup, supplier: (sup === otherLabel ? '' : sup), rows: supGroups[sup].sort(byName) };
    });
  }

  // v2.44.114 — Ortak tedarikçi-grubu render: açılır-kapanır (details) + kalem sayısı +
  // tedarikçiye "Gönder" / "Sipariş verildi ✓" (interactive). forPrint = düz, damgasız.
  // shoppingOrderGroupsHtml(groups, { forPrint, interactive, ordered, sendClass })
  function shoppingOrderGroupsHtml(groups, opts) {
    const t = PCD.i18n.t;
    const L = function (k, fb) { try { const v = t(k); return (v == null || v === k) ? fb : v; } catch (e) { return fb; } };
    opts = opts || {};
    const forPrint = !!opts.forPrint;
    const interactive = !!opts.interactive && !forPrint;
    const ordered = opts.ordered || {};
    const sendClass = opts.sendClass || 'shop-send';
    const fmtAmt = function (n) { return (Math.round(n * 100) / 100).toString(); };
    const titleColor = forPrint ? '#16433a' : 'var(--brand-700)';
    const lineColor = forPrint ? '#e7e5e4' : 'var(--border)';
    return groups.map(function (g) {
      const count = g.rows.length;
      const rowsHtml = g.rows.map(function (r) {
        const nm = r.ing ? (r.ing.name || '') : (r.name || '');
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px;">' +
          '<span>' + PCD.escapeHtml(nm) + (r.custom ? ' <span style="color:#999;font-size:11px;">(' + PCD.escapeHtml(L('buffet_order_manual_tag', 'manual')) + ')</span>' : '') + '</span>' +
          '<span style="font-weight:600;white-space:nowrap;">' + fmtAmt(r.amount) + ' ' + PCD.escapeHtml(r.unit) + '</span>' +
        '</div>';
      }).join('');
      // PRINT: düz başlık + satırlar (tüm gruplar açık, damgasız).
      if (forPrint) {
        return '<div style="margin-bottom:12px;">' +
          '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:' + titleColor + ';border-bottom:1px solid ' + lineColor + ';padding-bottom:4px;margin-bottom:6px;">' + PCD.escapeHtml(g.label) + ' (' + count + ')</div>' +
          rowsHtml + '</div>';
      }
      const ts = (interactive && g.supplier) ? ordered[g.supplier] : null;
      let ctrl = '';
      if (interactive && g.supplier) {
        ctrl = ts
          ? '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
              '<span style="font-size:11px;font-weight:800;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:3px 9px;">' + PCD.icon('check', 12) + ' ' + PCD.escapeHtml(L('shop_ordered', 'Ordered')) + ' · ' + PCD.escapeHtml(PCD.fmtRelTime(ts)) + '</span>' +
              '<button type="button" class="btn btn-ghost btn-sm ' + sendClass + '" data-sup="' + PCD.escapeHtml(g.supplier) + '" style="color:var(--text-3);">' + PCD.escapeHtml(L('inv_order_again', 'Order again')) + '</button>' +
            '</div>'
          : '<button type="button" class="btn btn-primary btn-sm ' + sendClass + '" data-sup="' + PCD.escapeHtml(g.supplier) + '" style="margin-top:8px;">' + PCD.icon('send', 13) + ' ' + PCD.escapeHtml(L('inv_order_send_to', 'Send to {name}').replace('{name}', g.supplier)) + '</button>';
      }
      const countChip = '<span style="font-size:11px;font-weight:700;color:var(--text-3);background:var(--surface-2);border-radius:999px;padding:1px 8px;margin-inline-start:8px;">' + count + '</span>';
      const okDot = ts ? ' <span style="color:#15803d;font-weight:900;margin-inline-start:6px;">✓</span>' : '';
      return '<details open class="card" style="padding:0;margin-bottom:8px;overflow:hidden;border-color:' + lineColor + ';">' +
        '<summary style="cursor:pointer;list-style:none;padding:9px 12px;display:flex;align-items:center;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:' + titleColor + ';background:var(--surface-2);">' +
          '<span style="flex:1;min-width:0;">' + PCD.escapeHtml(g.label) + countChip + okDot + '</span>' +
          '<span style="color:var(--text-3);font-weight:400;">▾</span>' +
        '</summary>' +
        '<div style="padding:8px 12px;">' + rowsHtml + ctrl + '</div>' +
      '</details>';
    }).join('');
  }

  function shoppingListHtml(groups, forPrint, opts) {
    const t = PCD.i18n.t;
    if (!groups.length) return '<div class="text-muted" style="padding:16px;text-align:center;">' + PCD.escapeHtml(t('event_shop_empty') || 'Add menu items with recipes to generate a shopping list.') + '</div>';
    opts = opts || {};
    return shoppingOrderGroupsHtml(groups, { forPrint: forPrint, interactive: opts.interactive, ordered: opts.ordered, sendClass: 'shop-send' });
  }

  function openShoppingList(event) {
    const t = PCD.i18n.t;
    const L = function (k, fb) { try { const v = t(k); return (v == null || v === k) ? fb : v; } catch (e) { return fb; } };
    const ingMap = {}, recipeMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
    const groups = buildEventShopping(event, ingMap, recipeMap);
    // v2.44.104 — tedarikçiye göre sipariş gönderme + kalıcı "sipariş verildi" rozeti.
    // Rozet bu event kaydında saklanır (_supplierOrders) → tekrar açınca o tedarikçi
    // "✓ Ordered" görünür; aynı yerden iki kez sipariş önlenir (deduct-stock guard gibi).
    if (!event._supplierOrders) event._supplierOrders = {};
    const body = PCD.el('div');
    function paint() {
      body.querySelector('#evShopBody').innerHTML = shoppingListHtml(groups, false, { interactive: true, ordered: event._supplierOrders });
    }
    body.innerHTML = '<div class="text-muted text-sm" style="margin-bottom:10px;">' + PCD.escapeHtml(eventGuests(event) + ' ' + (t('event_guests') || 'guests')) + '</div>' +
      '<div id="evShopBody">' + shoppingListHtml(groups, false, { interactive: true, ordered: event._supplierOrders }) + '</div>';
    function persistOrdered(sup) {
      const e = PCD.store.getFromTable('events', event.id) || event;
      e._supplierOrders = Object.assign({}, e._supplierOrders || {}, {}); e._supplierOrders[sup] = new Date().toISOString();
      PCD.store.upsertInTable('events', e, 'e');
      event._supplierOrders = e._supplierOrders;
    }
    body.addEventListener('click', function (ev) {
      const sb = ev.target.closest && ev.target.closest('.shop-send');
      if (!sb) return;
      const sup = sb.getAttribute('data-sup');
      const g = groups.filter(function (x) { return x.supplier === sup; })[0];
      if (!g) return;
      const items = g.rows.filter(function (r) { return r.ing && r.ing.id; }).map(function (r) {
        return { ingId: r.ing.id, qty: Math.round(r.amount * 100) / 100, unit: r.unit || r.ing.unit || '' };
      });
      if (!items.length) { PCD.toast.warning(t('toast_no_items_selected') || 'No items'); return; }
      const fire = function () {
        PCD.tools.suppliers.startOrder(sup, items, function () {
          persistOrdered(sup);
          try { if (PCD.tools.inventory && PCD.tools.inventory.markOrdered) PCD.tools.inventory.markOrdered(items.map(function (i) { return i.ingId; })); } catch (e) {}
          paint();
        });
      };
      if (PCD.tools.suppliers && PCD.tools.suppliers.startOrder) { fire(); return; }
      if (PCD.router && PCD.router.loadLazyTool) {
        PCD.router.loadLazyTool('suppliers').then(function () { if (PCD.tools.suppliers && PCD.tools.suppliers.startOrder) fire(); }).catch(function () { PCD.toast.error(L('toast_error', 'Something went wrong')); });
      }
    });
    const printBtn = PCD.el('button', { class: 'btn btn-outline', text: (t('print') || 'Print') });
    printBtn.innerHTML = PCD.icon('print', 14) + ' ' + PCD.escapeHtml(t('print') || 'Print');
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: (t('btn_close') || 'Close'), style: { marginInlineStart: 'auto' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(printBtn); footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: '🛒 ' + (t('event_shopping_list') || 'Shopping list'), body: body, footer: footer, size: 'md', closable: true });
    printBtn.addEventListener('click', function () {
      const html = '<style>@page{size:A4;margin:0;}body{font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917;max-width:760px;margin:0 auto;padding:16mm;font-variant-numeric:tabular-nums;}h1{font-family:"Fraunces","Georgia",serif;font-size:20pt;font-weight:600;letter-spacing:-0.01em;color:#16433a;margin:0 0 4px;}.sub{color:#666;font-size:11pt;margin-bottom:16px;}</style>' +
        '<h1>' + PCD.escapeHtml(event.name || (t('event_shopping_list') || 'Shopping list')) + '</h1>' +
        '<div class="sub">' + PCD.escapeHtml((t('event_shopping_list') || 'Shopping list') + ' · ' + eventGuests(event) + ' ' + (t('event_guests') || 'guests')) + '</div>' +
        shoppingListHtml(groups, true);
      PCD.print(html, (event.name || 'Event') + ' — ' + (t('event_shopping_list') || 'Shopping list'));
    });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.events = { render: render, openEditor: openEditor, openPreview: openPreview, computeEventDeductions: computeEventDeductions, snapshot: snapshotEvent, renderSignatureView: renderSignatureView };
})();
