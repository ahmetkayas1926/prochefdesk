/* ================================================================
   ProChefDesk — prep.js  (v2.16 — Prep Sheet / Hazırlık Listesi)

   Servis hazırlık listesi: her DISH (yemek) altında COMPONENT'ler
   (alt tarifler + malzemeler) + yanında BOŞ kutu (şef el yazısıyla
   "x / 1x / boil" yazar). Yazdırılıp lamine edilir.

   - Yemek ekle → recipe picker (gruplu: Menü Öğeleri / Alt Tarifler)
   - Seçilen yemeğin component'leri OTOMATİK dolar (recipe.ingredients
     top-level satırlardan: sub-recipe adı + ingredient adı). Sonra
     kullanıcı silip ekleyebilir (karma model).
   - Manuel yemek de eklenebilir (recipe'siz).
   - Çok sütunlu A4 yazdırma (Excel "Dinner CheckList" düzeni).
   - Kaydet + Kayıtlılar (library) — whiteboard/kitchen cards modeli.

   Storage: 'prepSheets' MAP tablo (ws-scoped). Otomatik kayıt
   (upsertInTable her değişiklikte) + bulut senkron. "Kaydet" butonu
   isim + onay verir; "Kayıtlılar" library listesini açar.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const TABLE = 'prepSheets';
  const PREF_ACTIVE = 'prefs.prepActiveId';
  // v2.22 — Sürükle-sırala durumu (yemek vs bileşen ayrı; guard ile çakışma yok)
  let _dragDishId = null, _dragComp = null;
  // v2.24 — CSS px / mm @96dpi (açık sayfalama motoru için)
  const MM = 3.7795;
  // v2.28 — Dar sayfa iç kenar boşluğu. @page margin:0 ile birlikte: Chrome
  // başlık/altbilgi damgaları (tarih/başlık/about:blank/sayfa no) çıkmaz +
  // yüzey verimli kullanılır. Önizleme ve baskı bu PAD'i ortak kullanır → tutarlı.
  const PAD_MM = 3;

  // v2.29 — Kanvas sürükle-sırala: Whiteboard mantığı (işaretçi-takipli + üst/alt
  // göstergesi). HTML5 native drag yerine pointer events → akıcı, net sınırlar.
  let _pdrag = null, _pdragBound = false;
  function _pPoint(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function _clearDragOver() {
    const host = document.getElementById('prepPreview');
    if (host) host.querySelectorAll('.ps-dragover-top, .ps-dragover-bottom').forEach(function (c) { c.classList.remove('ps-dragover-top', 'ps-dragover-bottom'); });
  }
  function startCanvasDrag(e, gripEl, view, sheet) {
    const card = gripEl.closest('[data-card-dish]'); if (!card) return;
    const pt = _pPoint(e);
    _pdrag = { view: view, sheet: sheet, dragId: card.getAttribute('data-card-dish'), startX: pt.x, startY: pt.y, moved: false, target: null, pos: null };
    document.body.style.userSelect = 'none';
  }
  function moveCanvasDrag(e) {
    if (!_pdrag) return;
    const pt = _pPoint(e);
    if (!_pdrag.moved && Math.hypot(pt.x - _pdrag.startX, pt.y - _pdrag.startY) < 6) return;
    _pdrag.moved = true;
    if (e.cancelable) e.preventDefault();
    const host = document.getElementById('prepPreview'); if (!host) return;
    const cards = host.querySelectorAll('[data-card-dish]');
    _clearDragOver();
    _pdrag.target = null;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (c.getAttribute('data-card-dish') === _pdrag.dragId) continue;
      const r = c.getBoundingClientRect();
      if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) {
        const pos = pt.y < (r.top + r.height / 2) ? 'top' : 'bottom';
        c.classList.add(pos === 'top' ? 'ps-dragover-top' : 'ps-dragover-bottom');
        _pdrag.target = c.getAttribute('data-card-dish'); _pdrag.pos = pos;
        break;
      }
    }
  }
  function endCanvasDrag() {
    if (!_pdrag) return;
    const d = _pdrag; _pdrag = null;
    document.body.style.userSelect = '';
    _clearDragOver();
    if (!d.moved || !d.target || d.target === d.dragId) return;
    const arr = d.sheet.dishes || [];
    const from = arr.findIndex(function (x) { return x.id === d.dragId; });
    if (from < 0) return;
    const item = arr.splice(from, 1)[0];
    const to = arr.findIndex(function (x) { return x.id === d.target; });
    if (to < 0) { arr.splice(from, 0, item); return; }
    arr.splice(d.pos === 'bottom' ? to + 1 : to, 0, item);
    persist(d.sheet); render(d.view);
  }

  // i18n helper — key yoksa fallback string döner (interpolation yok).
  function t(k, fb) {
    const s = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t(k) : null;
    return (s && s !== k) ? s : (fb || k);
  }
  function esc(s) { return PCD.escapeHtml(s == null ? '' : String(s)); }
  function uid(p) { return PCD.uid(p || 'x'); }

  // ============ STORAGE ============
  function listSheets() {
    return (PCD.store.listTable(TABLE) || []).slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }
  function getActiveId() {
    const sheets = listSheets();
    if (!sheets.length) return null;
    const stored = PCD.store.get(PREF_ACTIVE);
    if (stored && sheets.some(function (s) { return s.id === stored; })) return stored;
    return sheets[0].id;
  }
  function setActiveId(id) { PCD.store.set(PREF_ACTIVE, id); }

  function defaultSheet() {
    return { name: t('prep_untitled', 'Untitled'), dishes: [], columns: 3, orientation: 'portrait', accent: '#1f3b30', fontSize: 'm', bold: false, border: 'medium', spacing: 'medium' };
  }
  // Aktif sheet'i döndür; hiç yoksa bir tane oluştur.
  function ensureActive() {
    let id = getActiveId();
    if (id) {
      const s = PCD.store.getFromTable(TABLE, id);
      if (s) return s;
    }
    const created = PCD.store.upsertInTable(TABLE, defaultSheet(), 'ps');
    setActiveId(created.id);
    return created;
  }
  // Aktif sheet'i kaydet (otomatik — her değişiklikte çağrılır).
  function persist(sheet) {
    return PCD.store.upsertInTable(TABLE, sheet, 'ps');
  }

  // ============ RECIPE → COMPONENTS ============
  // recipe.ingredients top-level satırları → component isimleri
  // (sub-recipe satırı → alt tarif adı; ingredient satırı → malzeme adı;
  //  separator atlanır). flatten YAPILMAZ — Excel'deki gibi üst seviye.
  function recipeComponents(recipeId) {
    const r = PCD.store.getRecipe ? PCD.store.getRecipe(recipeId) : null;
    if (!r) return [];
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    const recipeMap = {};
    PCD.store.listRecipes().forEach(function (rr) { recipeMap[rr.id] = rr; });
    const out = [];
    (r.ingredients || []).forEach(function (ri) {
      if (!ri || ri.separator) return;
      let name = '';
      if (ri.recipeId) {
        const sub = recipeMap[ri.recipeId];
        name = sub ? sub.name : '';
      } else if (ri.ingredientId) {
        const ing = ingMap[ri.ingredientId];
        name = ing ? ing.name : '';
      }
      if (name) out.push({ id: uid('c'), text: name });
    });
    return out;
  }

  // ============ MAIN RENDER ============
  function render(view) {
    const sheet = ensureActive();
    // v2.22 — Sürükle-sırala için stabil id (eski sheet'lerde eksikse doldur)
    (sheet.dishes || []).forEach(function (d) { if (!d.id) d.id = uid('d'); });
    const count = listSheets().length;

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">📋 ' + esc(t('prep_title', 'Prep Sheet')) + '</div>' +
          '<div class="page-subtitle">' + esc(t('prep_subtitle', 'Dish prep checklist — components per dish with a blank box to mark quantities')) + '</div>' +
        '</div>' +
        '<div class="page-header-actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
          '<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;background:var(--brand-50);border:1px solid var(--brand-200,#bbf7d0);border-radius:6px;font-size:11px;font-weight:700;color:var(--brand-700);letter-spacing:0.03em;text-transform:uppercase;">' + PCD.icon('check', 12) + '<span>' + esc(t('prep_autosaved', 'Auto-saved')) + '</span></span>' +
          '<button class="btn btn-outline btn-sm" id="prepPrintBtn">' + PCD.icon('print', 14) + ' <span>' + esc(t('print', 'Print')) + '</span></button>' +
        '</div>' +
      '</div>' +

      // v2.26 — Kanvas-merkezli: sol uzun liste kaldırıldı; kanvas tek çalışma alanı.
      '<style>.ps-wrap .btn-secondary.active{background:var(--brand-600)!important;color:#fff!important;border-color:var(--brand-600)!important;}' +
        '.ps-cv-dish{position:relative;cursor:pointer;}' +
        '.ps-cv-dish:hover{outline:2px solid rgba(22,163,74,.9);outline-offset:1px;border-radius:5px;}' +
        '.ps-cv-tools{position:absolute;top:3px;right:3px;display:flex;gap:3px;z-index:6;}' +
        '.ps-cv-tools .ps-cv-b{width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #bcbcbc;border-radius:5px;box-shadow:0 1px 3px rgba(0,0,0,.28);color:#333;padding:0;}' +
        '.ps-cv-tools .ps-cv-grip{cursor:grab;}.ps-cv-tools .ps-cv-grip:active{cursor:grabbing;}' +
      '</style>' +
      '<div class="ps-wrap">' +
        // ---- Aksiyon bar: kayıt/library + isim + yemek ekle ----
        '<div class="card mb-3" style="padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-primary btn-sm" id="prepSaveBtn">' + PCD.icon('check', 14) + ' <span>' + esc(t('prep_save_btn', 'Save')) + '</span></button>' +
          '<button class="btn btn-outline btn-sm" id="prepSavedListBtn">' + PCD.icon('book-open', 14) + ' <span>' + esc(t('prep_saved_list_btn', 'Saved')) + ' (' + count + ')</span></button>' +
          '<button class="btn btn-outline btn-sm" id="prepNewBtn">' + PCD.icon('plus', 14) + ' <span>' + esc(t('prep_new_btn', 'New')) + '</span></button>' +
          '<input id="prepName" type="text" class="input" maxlength="80" placeholder="' + esc(t('prep_name_ph', 'e.g. 2026 Dinner Prep')) + '" value="' + esc(sheet.name || '') + '" style="flex:1;min-width:150px;">' +
          '<button class="btn btn-primary btn-sm" id="prepAddDishBtn">' + PCD.icon('plus', 14) + ' <span>' + esc(t('prep_add_dish', 'Add dish')) + '</span></button>' +
          '<button class="btn btn-outline btn-sm" id="prepAddManualBtn">' + PCD.icon('plus', 14) + ' <span>' + esc(t('prep_add_manual', 'Manual dish')) + '</span></button>' +
        '</div>' +
        // ---- Stil toolbar ----
        '<div class="card mb-3" style="padding:12px 14px;">' +
          '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('prep_columns_label', 'Print columns')) + '</div>' +
              '<div class="flex gap-1" id="prepColsBtns">' +
                [1, 2, 3, 4].map(function (n) {
                  return '<button type="button" class="btn btn-secondary btn-sm' + ((sheet.columns || 3) === n ? ' active' : '') + '" data-cols="' + n + '" style="min-width:34px;">' + n + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('kc_orientation', 'Orientation')) + '</div>' +
              '<div class="flex gap-1">' +
                '<button type="button" class="btn btn-secondary btn-sm' + (sheet.orientation !== 'landscape' ? ' active' : '') + '" data-orient="portrait">' + esc(t('kc_portrait', 'Portrait')) + '</button>' +
                '<button type="button" class="btn btn-secondary btn-sm' + (sheet.orientation === 'landscape' ? ' active' : '') + '" data-orient="landscape">' + esc(t('kc_landscape', 'Landscape')) + '</button>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('kc2_accent', 'Accent color')) + '</div>' +
              '<div style="display:flex;gap:6px;align-items:center;">' +
                '<input type="color" id="prepAccent" value="' + (sheet.accent || '#1f3b30') + '" style="width:40px;height:30px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;">' +
                ['#1f3b30', '#16a34a', '#1e3a5f', '#7c2d12', '#b91c1c', '#5b21b6'].map(function (c) {
                  return '<button type="button" data-accent="' + c + '" title="' + c + '" style="width:22px;height:22px;border-radius:50%;border:2px solid ' + ((sheet.accent || '#1f3b30') === c ? 'var(--text-1,#000)' : 'transparent') + ';background:' + c + ';cursor:pointer;padding:0;"></button>';
                }).join('') +
              '</div>' +
            '</div>' +
            // v2.24 — Yazı boyutu (xs–xxl) + Çerçeve kalınlığı + Bold
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('prep_fontsize_label', 'Text size')) + '</div>' +
              '<div class="flex gap-1">' +
                ['xs', 's', 'm', 'l', 'xl', 'xxl'].map(function (sz) {
                  return '<button type="button" class="btn btn-secondary btn-sm' + ((sheet.fontSize || 'm') === sz ? ' active' : '') + '" data-fontsize="' + sz + '" style="min-width:30px;text-transform:uppercase;">' + sz + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('prep_border_label', 'Border')) + '</div>' +
              '<div class="flex gap-1">' +
                [['medium', t('prep_border_medium', 'Medium')], ['bold', t('prep_border_bold', 'Bold')], ['xbold', t('prep_border_xbold', 'Extra')]].map(function (b) {
                  return '<button type="button" class="btn btn-secondary btn-sm' + ((sheet.border || 'medium') === b[0] ? ' active' : '') + '" data-border="' + b[0] + '">' + esc(b[1]) + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">' + esc(t('prep_spacing_label', 'Spacing')) + '</div>' +
              '<div class="flex gap-1">' +
                [['tight', t('prep_spacing_tight', 'Tight')], ['medium', t('prep_spacing_medium', 'Medium')], ['wide', t('prep_spacing_wide', 'Wide')]].map(function (s) {
                  return '<button type="button" class="btn btn-secondary btn-sm' + ((sheet.spacing || 'medium') === s[0] ? ' active' : '') + '" data-spacing="' + s[0] + '">' + esc(s[1]) + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="text-muted text-sm mb-1">&nbsp;</div>' +
              '<button type="button" class="btn btn-secondary btn-sm' + (sheet.bold ? ' active' : '') + '" data-bold="1" style="font-weight:800;">' + esc(t('prep_bold', 'Bold')) + '</button>' +
            '</div>' +
            '<div style="margin-inline-start:auto;">' +
              '<button type="button" class="btn btn-outline btn-sm" id="prepPresetsBtn">' + PCD.icon('grid', 14) + ' <span>' + esc(t('kc2_presets', 'Presets')) + '</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // ---- Kanvas (tek çalışma alanı) ----
        '<div class="card" style="padding:10px;background:var(--surface-2);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);">' + esc(t('prep_canvas_label', 'Canvas')) + '</span>' +
            '<span class="text-muted" style="font-size:11px;">' + esc(t('prep_canvas_hint', 'Click a card to edit · drag the handle to reorder')) + '</span>' +
          '</div>' +
          '<div id="prepPreview" style="background:var(--surface);border-radius:6px;overflow:auto;max-height:calc(100vh - 240px);"></div>' +
        '</div>' +
      '</div>';

    wire(view, sheet);
    updatePreview(view, sheet);
  }

  // ============ CANLI ÖNİZLEME ============
  function updatePreview(view, sheet) {
    const host = view.querySelector('#prepPreview');
    if (!host) return;
    const land = sheet.orientation === 'landscape';
    const pageWpx = (land ? 297 : 210) * MM;
    const pageData = paginate(sheet);
    if (!pageData.pages.length) {
      host.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:200px;color:#999;font-size:13px;text-align:center;padding:30px;">' + esc(t('prep_preview_empty', 'Add a dish to see the printable sheet')) + '</div>';
      return;
    }
    host.innerHTML = '<div id="prepPvOuter" style="position:relative;"><div class="prep-pv-stack" style="transform-origin:top left;position:absolute;top:0;left:0;width:' + pageWpx + 'px;">' + renderPages(sheet, pageData, 'screen') + '</div></div>';
    const stack = host.querySelector('.prep-pv-stack');
    const outer = host.querySelector('#prepPvOuter');
    function fit() {
      const w = host.clientWidth; if (!w) { requestAnimationFrame(fit); return; }
      const k = Math.min(1, (w - 4) / pageWpx);
      stack.style.transform = 'scale(' + k + ')';
      outer.style.width = Math.round(pageWpx * k) + 'px';
      outer.style.height = Math.round((stack.scrollHeight || pageWpx) * k) + 'px';
    }
    // Çoklu deneme: sync (anında, flash yok) + rAF + setTimeout fallback (render
    // sonrası clientWidth henüz 0 ise garantili uygulama; whiteboard self-retry mantığı).
    fit();
    requestAnimationFrame(fit);
    setTimeout(fit, 80);
    if (typeof ResizeObserver !== 'undefined') {
      if (updatePreview._ro) updatePreview._ro.disconnect();
      let _lw = -1;
      updatePreview._ro = new ResizeObserver(function () { const w = host.clientWidth; if (!w || w === _lw) return; _lw = w; fit(); });
      updatePreview._ro.observe(host.parentElement || host);
    }
  }

  function buildGuide() {
    return '<div class="card mb-3" id="prepGuide" style="padding:12px 14px;background:var(--surface-2);font-size:12px;line-height:1.5;color:var(--text-2);display:flex;gap:10px;align-items:flex-start;">' +
      '<span style="font-size:16px;">💡</span>' +
      '<div style="flex:1;">' + esc(t('prep_guide', 'Add a dish to auto-fill its components from the recipe, then delete or add lines as needed. Print produces a laminate-friendly checklist with a blank box next to each component.')) + '</div>' +
      '<button type="button" class="icon-btn" id="prepGuideClose" title="' + esc(t('close', 'Close')) + '" style="flex-shrink:0;">' + PCD.icon('x', 14) + '</button>' +
    '</div>';
  }

  // ============ DISH EDITOR (modal — kanvas kartına tıkla) ============
  // v2.26 — Sol uzun liste yerine: karta tıkla → bu modal. İsim + istasyon +
  // bileşenler (ekle/sil/sürükle-sırala) → Kaydet.
  let _mDragComp = null; // modal içi bileşen sürükle durumu
  function openDishEditor(view, sheet, dishId, isNew) {
    const dish = (sheet.dishes || []).find(function (d) { return d.id === dishId; });
    if (!dish) return;
    const work = PCD.clone(dish);
    if (!Array.isArray(work.components)) work.components = [];
    const body = PCD.el('div');

    function compRow(c, i) {
      return '<div class="flex items-center gap-2" data-mc-row="' + i + '" style="margin-bottom:5px;">' +
        '<span draggable="true" data-mc-drag="' + i + '" title="' + esc(t('prep_drag', 'Drag to reorder')) + '" style="cursor:grab;color:var(--text-3);font-size:14px;flex-shrink:0;user-select:none;line-height:1;">⠿</span>' +
        '<input type="text" class="input" data-mc="' + i + '" value="' + esc(c.text || '') + '" placeholder="' + esc(t('prep_component_ph', 'Component')) + '" style="flex:1;min-width:0;padding:5px 9px;min-height:32px;font-size:13px;">' +
        '<button type="button" class="icon-btn" data-mc-del="' + i + '" title="' + esc(t('delete', 'Delete')) + '" style="flex-shrink:0;">' + PCD.icon('trash', 14) + '</button>' +
      '</div>';
    }
    function syncFromDom() {
      const nm = PCD.$('#deName', body); if (nm) work.name = nm.value;
      const st = PCD.$('#deStation', body); if (st) work.station = st.value;
      body.querySelectorAll('[data-mc]').forEach(function (inp) {
        const i = parseInt(inp.getAttribute('data-mc'), 10);
        if (work.components[i]) work.components[i].text = inp.value;
      });
    }
    function paint() {
      body.innerHTML =
        '<div class="field" style="margin-bottom:12px;"><label class="field-label">' + esc(t('prep_dish_ph', 'Dish name')) + '</label>' +
          '<input type="text" id="deName" class="input" value="' + esc(work.name || '') + '" placeholder="' + esc(t('prep_dish_ph', 'Dish name')) + '" style="width:100%;font-weight:600;"></div>' +
        '<div class="field" style="margin-bottom:12px;"><label class="field-label">' + esc(t('prep_station_label', 'Station (optional)')) + '</label>' +
          '<input type="text" id="deStation" class="input" value="' + esc(work.station || '') + '" placeholder="' + esc(t('prep_station_ph', 'Station (optional) — e.g. Grill')) + '" style="width:100%;"></div>' +
        '<div class="field"><label class="field-label">' + esc(t('prep_components_label', 'Components')) + '</label>' +
          '<div id="deComps">' + work.components.map(compRow).join('') + '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="deAddComp" style="margin-top:4px;">' + PCD.icon('plus', 13) + ' <span>' + esc(t('prep_add_component', 'Add component')) + '</span></button>' +
        '</div>';
    }
    paint();

    PCD.on(body, 'input', '[data-mc]', function () { const i = parseInt(this.getAttribute('data-mc'), 10); if (work.components[i]) work.components[i].text = this.value; });
    PCD.on(body, 'click', '[data-mc-del]', function () { syncFromDom(); const i = parseInt(this.getAttribute('data-mc-del'), 10); work.components.splice(i, 1); paint(); });
    body.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('#deAddComp'))) return;
      syncFromDom(); work.components.push({ id: uid('c'), text: '' }); paint();
      setTimeout(function () { const ins = body.querySelectorAll('[data-mc]'); if (ins.length) ins[ins.length - 1].focus(); }, 30);
    });
    PCD.on(body, 'dragstart', '[data-mc-drag]', function (e) { _mDragComp = parseInt(this.getAttribute('data-mc-drag'), 10); try { e.dataTransfer.effectAllowed = 'move'; } catch (err) {} });
    PCD.on(body, 'dragover', '[data-mc-row]', function (e) { if (_mDragComp != null) e.preventDefault(); });
    PCD.on(body, 'drop', '[data-mc-row]', function (e) {
      if (_mDragComp == null) return; e.preventDefault();
      syncFromDom();
      const to = parseInt(this.getAttribute('data-mc-row'), 10); const from = _mDragComp; _mDragComp = null;
      if (from === to) return;
      const it = work.components.splice(from, 1)[0];
      work.components.splice(from < to ? to - 1 : to, 0, it);
      paint();
    });

    const delBtn = PCD.el('button', { type: 'button', class: 'btn btn-outline', text: t('prep_delete_dish', 'Delete dish'), style: { color: 'var(--danger)', borderColor: 'var(--danger)', marginInlineEnd: 'auto' } });
    const cancelBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel', 'Cancel') });
    const saveBtn = PCD.el('button', { type: 'button', class: 'btn btn-primary', text: t('save', 'Save') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', alignItems: 'center' } });
    footer.appendChild(delBtn); footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    const m = PCD.modal.open({ title: isNew ? t('prep_new_dish', 'New dish') : t('prep_edit_dish', 'Edit dish'), body: body, footer: footer, size: 'sm', closable: true });

    function removeDish() { const idx = (sheet.dishes || []).findIndex(function (d) { return d.id === dishId; }); if (idx >= 0) { sheet.dishes.splice(idx, 1); persist(sheet); render(view); } }
    cancelBtn.addEventListener('click', function () { if (isNew) removeDish(); m.close(); });
    delBtn.addEventListener('click', function () { removeDish(); m.close(); });
    saveBtn.addEventListener('click', function () {
      syncFromDom();
      work.name = (work.name || '').trim();
      work.station = (work.station || '').trim();
      work.components = work.components.filter(function (c) { return (c.text || '').trim(); });
      const idx = (sheet.dishes || []).findIndex(function (d) { return d.id === dishId; });
      if (idx >= 0) sheet.dishes[idx] = work;
      persist(sheet); render(view); m.close();
    });
  }

  // ============ EVENTS ============
  function wire(view, sheet) {
    // Guide close
    const gc = view.querySelector('#prepGuideClose');
    if (gc) gc.addEventListener('click', function () {
      const g = view.querySelector('#prepGuide');
      if (g) g.style.display = 'none';
    });

    // Name
    const nameEl = view.querySelector('#prepName');
    if (nameEl) nameEl.addEventListener('input', PCD.debounce(function () {
      sheet.name = this.value;
      persist(sheet);
      updatePreview(view, sheet);
    }, 350));

    // Columns
    PCD.on(view, 'click', '[data-cols]', function () {
      sheet.columns = parseInt(this.getAttribute('data-cols'), 10) || 3;
      persist(sheet);
      render(view);
    });

    // v2.22 — Orientation
    PCD.on(view, 'click', '[data-orient]', function () {
      sheet.orientation = this.getAttribute('data-orient');
      persist(sheet);
      render(view);
    });
    // v2.22 — Accent color (picker + swatches)
    const accInp = view.querySelector('#prepAccent');
    if (accInp) accInp.addEventListener('input', function () { sheet.accent = this.value; persist(sheet); updatePreview(view, sheet); });
    PCD.on(view, 'click', '[data-accent]', function () { sheet.accent = this.getAttribute('data-accent'); persist(sheet); render(view); });
    // v2.24 — Yazı boyutu / çerçeve kalınlığı / Bold
    PCD.on(view, 'click', '[data-fontsize]', function () { sheet.fontSize = this.getAttribute('data-fontsize'); persist(sheet); render(view); });
    PCD.on(view, 'click', '[data-border]', function () { sheet.border = this.getAttribute('data-border'); persist(sheet); render(view); });
    PCD.on(view, 'click', '[data-bold]', function () { sheet.bold = !sheet.bold; persist(sheet); render(view); });
    // v2.25 — Boşluk (kart arası yatay + dikey)
    PCD.on(view, 'click', '[data-spacing]', function () { sheet.spacing = this.getAttribute('data-spacing'); persist(sheet); render(view); });
    // v2.29 — Karta tıkla → düzenle (grip hariç). Sürükle: pointer-tabanlı (Whiteboard mantığı).
    PCD.on(view, 'click', '[data-card-dish]', function (e) {
      if (e.target.closest('[data-drag-dish]')) return; // grip = sadece sürükle
      openDishEditor(view, sheet, this.getAttribute('data-card-dish'));
    });
    PCD.on(view, 'mousedown', '[data-drag-dish]', function (e) { e.preventDefault(); startCanvasDrag(e, this, view, sheet); });
    PCD.on(view, 'touchstart', '[data-drag-dish]', function (e) { startCanvasDrag(e, this, view, sheet); });
    if (!_pdragBound) {
      _pdragBound = true;
      document.addEventListener('mousemove', moveCanvasDrag);
      document.addEventListener('touchmove', moveCanvasDrag, { passive: false });
      document.addEventListener('mouseup', endCanvasDrag);
      document.addEventListener('touchend', endCanvasDrag);
    }
    // v2.22 — Presets
    const presetsBtn = view.querySelector('#prepPresetsBtn');
    if (presetsBtn) presetsBtn.addEventListener('click', function () { openPresets(view, sheet); });

    // v2.22 — Sürükle-sırala (yemek + bileşen; ayrı drag-state + guard)
    PCD.on(view, 'dragstart', '[data-dish-drag]', function (e) { _dragDishId = this.getAttribute('data-dish-drag'); _dragComp = null; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'dish'); } catch (err) {} });
    PCD.on(view, 'dragstart', '[data-comp-drag]', function (e) { const p = this.getAttribute('data-comp-drag').split(':'); _dragComp = { di: parseInt(p[0], 10), ci: parseInt(p[1], 10) }; _dragDishId = null; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'comp'); } catch (err) {} });
    PCD.on(view, 'dragover', '[data-dish-card]', function (e) { e.preventDefault(); });
    PCD.on(view, 'dragover', '[data-comp-row]', function (e) { e.preventDefault(); });
    PCD.on(view, 'drop', '[data-comp-row]', function (e) {
      if (!_dragComp) return;
      e.preventDefault();
      const p = this.getAttribute('data-comp-row').split(':');
      const toDi = parseInt(p[0], 10), toCi = parseInt(p[1], 10);
      const dc = _dragComp; _dragComp = null;
      if (dc.di !== toDi) return; // yalnız aynı yemek içinde sıralama
      const comps = sheet.dishes[toDi] && sheet.dishes[toDi].components;
      if (!comps || dc.ci === toCi) return;
      const item = comps.splice(dc.ci, 1)[0];
      comps.splice(dc.ci < toCi ? toCi - 1 : toCi, 0, item);
      persist(sheet); render(view);
    });
    PCD.on(view, 'drop', '[data-dish-card]', function (e) {
      if (!_dragDishId) return;
      e.preventDefault();
      const dropId = this.getAttribute('data-dish-card');
      const dragId = _dragDishId; _dragDishId = null;
      if (dragId === dropId) return;
      const arr = sheet.dishes;
      const fromIdx = arr.findIndex(function (d) { return d.id === dragId; });
      const toIdx = arr.findIndex(function (d) { return d.id === dropId; });
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const item = arr.splice(fromIdx, 1)[0];
      arr.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, item);
      persist(sheet); render(view);
    });

    // Save (isimli + onay)
    const saveBtn = view.querySelector('#prepSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      const nm = (view.querySelector('#prepName').value || '').trim();
      if (!nm) {
        PCD.toast.error(t('prep_name_required', 'Give your prep sheet a name first'));
        view.querySelector('#prepName').focus();
        return;
      }
      sheet.name = nm;
      sheet.savedAt = new Date().toISOString();
      persist(sheet);
      PCD.toast.success(t('prep_saved_ok', 'Prep sheet saved'));
    });

    // Saved list (library)
    const listBtn = view.querySelector('#prepSavedListBtn');
    if (listBtn) listBtn.addEventListener('click', function () {
      openPicker(function (picked) {
        setActiveId(picked.id);
        render(view);
      });
    });

    // New
    const newBtn = view.querySelector('#prepNewBtn');
    if (newBtn) newBtn.addEventListener('click', function () {
      const created = PCD.store.upsertInTable(TABLE, defaultSheet(), 'ps');
      setActiveId(created.id);
      render(view);
      PCD.toast.success(t('prep_new_created', 'New prep sheet created'));
    });

    // Add dish (recipe picker)
    const addDish = view.querySelector('#prepAddDishBtn');
    if (addDish) addDish.addEventListener('click', function () { openDishPicker(view, sheet); });

    // Add manual dish → boş kart ekle + düzenle modalını aç
    const addManual = view.querySelector('#prepAddManualBtn');
    if (addManual) addManual.addEventListener('click', function () {
      const nd = { id: uid('d'), recipeId: null, name: '', components: [{ id: uid('c'), text: '' }] };
      sheet.dishes = (sheet.dishes || []).concat([nd]);
      persist(sheet);
      render(view);
      openDishEditor(view, sheet, nd.id, true);
    });

    // Print
    const printBtn = view.querySelector('#prepPrintBtn');
    if (printBtn) printBtn.addEventListener('click', function () { printSheet(sheet); });

    // Dish name
    PCD.on(view, 'input', '[data-dish]', PCD.debounce(function () {
      const di = parseInt(this.getAttribute('data-dish'), 10);
      if (sheet.dishes[di]) { sheet.dishes[di].name = this.value; persist(sheet); updatePreview(view, sheet); }
    }, 350));

    // v2.22 — Dish station (istasyon)
    PCD.on(view, 'input', '[data-station]', PCD.debounce(function () {
      const di = parseInt(this.getAttribute('data-station'), 10);
      if (sheet.dishes[di]) { sheet.dishes[di].station = this.value; persist(sheet); updatePreview(view, sheet); }
    }, 350));

    // Dish delete
    PCD.on(view, 'click', '[data-dish-del]', function () {
      const di = parseInt(this.getAttribute('data-dish-del'), 10);
      sheet.dishes.splice(di, 1);
      persist(sheet);
      render(view);
    });

    // Component text
    PCD.on(view, 'input', '[data-comp]', PCD.debounce(function () {
      const p = this.getAttribute('data-comp').split(':');
      const di = parseInt(p[0], 10), ci = parseInt(p[1], 10);
      if (sheet.dishes[di] && sheet.dishes[di].components[ci]) {
        sheet.dishes[di].components[ci].text = this.value;
        persist(sheet);
        updatePreview(view, sheet);
      }
    }, 350));

    // Component delete
    PCD.on(view, 'click', '[data-comp-del]', function () {
      const p = this.getAttribute('data-comp-del').split(':');
      const di = parseInt(p[0], 10), ci = parseInt(p[1], 10);
      if (sheet.dishes[di]) {
        sheet.dishes[di].components.splice(ci, 1);
        persist(sheet);
        render(view);
      }
    });

    // Component add
    PCD.on(view, 'click', '[data-comp-add]', function () {
      const di = parseInt(this.getAttribute('data-comp-add'), 10);
      if (sheet.dishes[di]) {
        sheet.dishes[di].components = (sheet.dishes[di].components || []).concat([{ id: uid('c'), text: '' }]);
        persist(sheet);
        render(view);
        setTimeout(function () {
          const inputs = view.querySelectorAll('[data-comp="' + di + ':' + (sheet.dishes[di].components.length - 1) + '"]');
          if (inputs.length) inputs[0].focus();
        }, 50);
      }
    });
  }

  // ============ PRESETS (düzen/stil) ============
  function openPresets(view, sheet) {
    const presets = [
      { id: 'standard', label: 'Standard',          s: { columns: 3, orientation: 'portrait',  accent: '#1f3b30' } },
      { id: 'compact',  label: 'Compact · 4-col',   s: { columns: 4, orientation: 'portrait',  accent: '#1f3b30' } },
      { id: 'large',    label: 'Large · 2-col',     s: { columns: 2, orientation: 'portrait',  accent: '#16a34a' } },
      { id: 'wide',     label: 'Wide · landscape',  s: { columns: 4, orientation: 'landscape', accent: '#1e3a5f' } },
    ];
    const body = PCD.el('div');
    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' + presets.map(function (p) {
      const meta = p.s.columns + ' ' + t('kc_columns', 'columns').toLowerCase() + ' · ' + (p.s.orientation === 'landscape' ? t('kc_landscape', 'landscape') : t('kc_portrait', 'portrait'));
      return '<button type="button" class="btn btn-outline" data-preset="' + p.id + '" style="justify-content:flex-start;text-align:left;padding:10px 12px;"><span><b>' + esc(p.label) + '</b><span style="display:block;color:var(--text-3);font-size:11px;margin-top:2px;">' + esc(meta) + '</span></span></button>';
    }).join('') + '</div>';
    const m = PCD.modal.open({ title: t('kc2_presets', 'Presets'), body: body, size: 'sm', closable: true });
    body.querySelectorAll('[data-preset]').forEach(function (el) {
      el.addEventListener('click', function () {
        const p = presets.find(function (x) { return x.id === el.getAttribute('data-preset'); });
        if (p) { sheet.columns = p.s.columns; sheet.orientation = p.s.orientation; sheet.accent = p.s.accent; persist(sheet); render(view); }
        m.close();
      });
    });
  }

  // ============ DISH PICKER (recipe seç → otomatik component) ============
  function openDishPicker(view, sheet) {
    const allRecipes = PCD.store.listRecipes();
    const menuItems = allRecipes.filter(function (r) { return !r.isSubRecipe; });
    const subRecipes = allRecipes.filter(function (r) { return r.isSubRecipe; });
    const g1 = t('menu_group_dishes', 'Menu Items');
    const g2 = t('menu_group_subrecipes', 'Sub-recipes & Preparations');
    const items = menuItems.map(function (r) {
      return { id: r.id, name: r.name, group: g1, meta: t(r.category || 'cat_main', '') + (r.servings ? ' · ' + r.servings + 'p' : ''), thumb: r.photo || '' };
    }).concat(subRecipes.map(function (r) {
      return { id: r.id, name: r.name, group: g2, meta: (r.yieldAmount ? r.yieldAmount + ' ' + (r.yieldUnit || '') : ''), thumb: r.photo || '' };
    }));
    if (items.length === 0) { PCD.toast.warning(t('no_recipes_yet', 'No recipes yet')); return; }
    PCD.picker.open({
      title: t('prep_add_dish', 'Add dish'),
      items: items, multi: true, selected: [],
    }).then(function (selIds) {
      if (!selIds || !selIds.length) return;
      const recMap = {};
      allRecipes.forEach(function (r) { recMap[r.id] = r; });
      selIds.forEach(function (id) {
        const r = recMap[id];
        if (!r) return;
        sheet.dishes = (sheet.dishes || []).concat([{
          id: uid('d'),
          recipeId: id,
          name: r.name,
          components: recipeComponents(id),
        }]);
      });
      persist(sheet);
      render(view);
      PCD.toast.success(t('prep_dishes_added', 'Dishes added'));
    });
  }

  // ============ LIBRARY PICKER ============
  function openPicker(onPick) {
    const body = PCD.el('div');
    function paint() {
      const list = listSheets();
      if (list.length === 0) {
        body.innerHTML =
          '<div style="padding:32px 20px;text-align:center;color:var(--text-3);">' +
            '<div style="font-size:32px;margin-bottom:8px;opacity:0.6;">📋</div>' +
            '<div style="font-size:14px;font-weight:600;color:var(--text-2);">' + esc(t('prep_no_saved', 'No saved prep sheets yet')) + '</div>' +
          '</div>';
        return;
      }
      const activeId = getActiveId();
      body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        list.map(function (s) {
          const dishCount = (s.dishes || []).length;
          const isActive = s.id === activeId;
          const acc = s.accent || '#1f3b30';
          const names = (s.dishes || []).slice(0, 8).map(function (d) { return (d.name || '').trim(); }).filter(Boolean).join(' · ');
          return '<div class="card" data-pick="' + esc(s.id) + '" style="cursor:pointer;overflow:hidden;padding:0;' + (isActive ? 'box-shadow:0 0 0 2px var(--brand-500);' : '') + '">' +
            '<div style="height:80px;background:#fff;border-bottom:1px solid var(--border);padding:8px;overflow:hidden;">' +
              '<span style="font-size:9px;font-weight:800;color:#fff;background:' + acc + ';padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.03em;">' + esc((s.name || t('prep_untitled', 'Untitled')).slice(0, 26)) + '</span>' +
              '<div style="margin-top:6px;font-size:8px;color:#555;line-height:1.5;word-break:break-word;">' + esc(names) + '</div>' +
            '</div>' +
            '<div style="padding:7px 9px;display:flex;align-items:center;gap:4px;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(s.name || t('prep_untitled', 'Untitled')) + (isActive ? ' <span style="font-size:9px;color:var(--brand-600);">(' + esc(t('prep_current', 'current')) + ')</span>' : '') + '</div>' +
                '<div class="text-muted" style="font-size:11px;">' + dishCount + ' ' + esc(t('prep_dishes_word', 'dishes')) + ' · ' + (PCD.fmtRelTime ? PCD.fmtRelTime(s.updatedAt) : '') + '</div>' +
              '</div>' +
              '<button type="button" class="icon-btn" data-dup-ps="' + esc(s.id) + '" title="' + esc(t('kc2_duplicate', 'Duplicate')) + '">' + PCD.icon('copy', 16) + '</button>' +
              '<button type="button" class="icon-btn" data-del="' + esc(s.id) + '" title="' + esc(t('delete', 'Delete')) + '">' + PCD.icon('trash', 16) + '</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }
    paint();
    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: t('btn_close', 'Close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: t('prep_picker_title', 'Saved prep sheets'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.on(body, 'click', '[data-pick]', function (e) {
      if (e.target.closest('[data-del]') || e.target.closest('[data-dup-ps]')) return;
      const id = this.getAttribute('data-pick');
      m.close();
      setTimeout(function () { onPick({ id: id }); }, 180);
    });
    // v2.22 — Prep sheet kopyala (library galerisi)
    PCD.on(body, 'click', '[data-dup-ps]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-dup-ps');
      const src = PCD.store.getFromTable(TABLE, id);
      if (!src) return;
      const copy = PCD.clone(src); delete copy.id; delete copy.updatedAt;
      copy.name = (src.name || t('prep_untitled', 'Untitled')) + ' ' + t('ms_copy_suffix', '(copy)');
      PCD.store.upsertInTable(TABLE, copy, 'ps');
      if (PCD.toast) PCD.toast.success(t('ms_copied', 'Copied'));
      paint();
    });
    PCD.on(body, 'click', '[data-del]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-del');
      const target = PCD.store.getFromTable(TABLE, id);
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('prep_delete_title', 'Delete this prep sheet?'),
        text: '"' + (target && target.name ? target.name : 'Prep sheet') + '" — ' + t('prep_delete_msg', 'This will be permanently deleted.'),
        okText: t('delete', 'Delete'),
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable(TABLE, id);
        // Silinen aktifse, kalan ilkine geç
        if (getActiveId() === id || PCD.store.get(PREF_ACTIVE) === id) {
          const remaining = listSheets();
          setActiveId(remaining.length ? remaining[0].id : null);
        }
        PCD.toast.success(t('prep_deleted', 'Prep sheet deleted'));
        paint();
        // Aktif liste arkada güncellensin
        const v = PCD.$('#view');
        if (v && PCD.router && PCD.router.currentView && PCD.router.currentView() === 'prep') render(v);
      });
    });
  }

  // ============ RENDER MOTORU (v2.24 — açık sayfalama: önizleme = baskı) ============
  // İçerik gerçek A4 sayfalara bölünür; her atom (başlık / istasyon / yemek)
  // ölçülür ve sütun-sütun MUTLAK konumla yerleştirilir. updatePreview ('screen')
  // ve printSheet ('print') AYNI sayfa+konum verisini kullanır → birebir aynı,
  // sayfa sınırları net (dikey + yatay). Eski tek-uzun-sütun (column-count) motoru
  // baskıda @page ile farklı sayfalanıyordu (operatör bug raporu) — bu motor o
  // uyumsuzluğu kökten kaldırır.
  const FS_SCALE = { xs: 0.82, s: 0.91, m: 1, l: 1.13, xl: 1.28, xxl: 1.45 };
  const BORDER_W = { medium: 1, bold: 2, xbold: 3 };
  function psFont(sheet) { return FS_SCALE[sheet.fontSize] || 1; }

  function sheetCss(sheet) {
    const f = psFont(sheet);
    const accent = sheet.accent || '#1f3b30';
    const bw = BORDER_W[sheet.border] || 1;
    const iw = Math.max(1, bw - 1);
    const cw = sheet.bold ? '700' : '400';
    return '.ps-title{font-size:' + (18 * f).toFixed(1) + 'px;font-weight:800;margin:0 0 3px;}' +
      '.ps-sub{font-size:' + (11 * f).toFixed(1) + 'px;color:#666;margin:0;}' +
      '.ps-station{font-weight:800;font-size:' + (11 * f).toFixed(1) + 'px;text-transform:uppercase;letter-spacing:0.08em;color:' + accent + ';border-bottom:2px solid ' + accent + ';padding:1px 0 3px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.ps-dish{border:' + bw + 'px solid #333;border-radius:4px;overflow:hidden;margin:0;}' +
      '.ps-dish-head{background:' + accent + ';color:#fff;font-weight:800;font-size:' + (12 * f).toFixed(1) + 'px;text-transform:uppercase;letter-spacing:0.03em;padding:5px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.ps-row{display:flex;border-top:' + iw + 'px solid #ccc;font-size:' + (12 * f).toFixed(1) + 'px;}' +
      '.ps-comp{flex:1;padding:4px 8px;border-right:' + iw + 'px solid #ccc;line-height:1.3;font-weight:' + cw + ';}' +
      '.ps-prep{width:30%;min-width:60px;min-height:' + (22 * f).toFixed(1) + 'px;}';
  }

  function dishHtmlOf(d) {
    let rows = '';
    (d.components || []).forEach(function (c) {
      if (!(c.text || '').trim()) return;
      rows += '<div class="ps-row"><div class="ps-comp">' + esc(c.text) + '</div><div class="ps-prep"></div></div>';
    });
    if (!rows) rows = '<div class="ps-row"><div class="ps-comp">&nbsp;</div><div class="ps-prep"></div></div>';
    return '<div class="ps-dish"><div class="ps-dish-head">' + esc(d.name || '') + '</div>' + rows + '</div>';
  }
  function titleHtmlOf(sheet) {
    return '<div class="ps-title">' + esc(sheet.name || t('prep_title', 'Prep Sheet')) + '</div>' +
      '<div class="ps-sub">' + esc(t('prep_print_sub', 'Components per dish · mark quantities in the blank box')) + '</div>';
  }

  // Sıralı atom listesi (istasyon gruplaması korunur — '' grubu = istasyonsuzlar)
  function layoutAtoms(sheet) {
    const dishes = (sheet.dishes || []).filter(function (d) {
      return (d.name || '').trim() || (d.components || []).some(function (c) { return (c.text || '').trim(); });
    });
    const groups = []; const gIdx = {};
    dishes.forEach(function (d) {
      const st = (d.station || '').trim();
      if (!(st in gIdx)) { gIdx[st] = groups.length; groups.push({ station: st, dishes: [] }); }
      groups[gIdx[st]].dishes.push(d);
    });
    const atoms = [];
    groups.forEach(function (g) {
      if (g.station) atoms.push({ kind: 'station', html: '<div class="ps-station">' + esc(g.station) + '</div>' });
      g.dishes.forEach(function (d) { atoms.push({ kind: 'dish', id: d.id, html: dishHtmlOf(d) }); });
    });
    return { atoms: atoms, count: dishes.length };
  }

  // Atom yüksekliklerini gerçek CSS ile ölç (yemek = colW, istasyon/başlık = tam genişlik)
  function measureLayout(sheet, atoms, colWpx, contentWpx) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;';
    let html = '<style>' + sheetCss(sheet) + '</style><div id="mTitle" style="width:' + contentWpx + 'px;">' + titleHtmlOf(sheet) + '</div>';
    atoms.forEach(function (a, i) {
      html += '<div class="mAtom" data-i="' + i + '" style="width:' + (a.kind === 'station' ? contentWpx : colWpx) + 'px;">' + a.html + '</div>';
    });
    host.innerHTML = html;
    document.body.appendChild(host);
    const titleH = host.querySelector('#mTitle').offsetHeight + 8;
    host.querySelectorAll('.mAtom').forEach(function (el) {
      atoms[parseInt(el.getAttribute('data-i'), 10)].h = el.offsetHeight;
    });
    document.body.removeChild(host);
    return titleH;
  }

  // Sayfalara böl: sütun-sütun doldur; istasyon başlığı tam-genişlik yeni bant açar.
  function paginate(sheet) {
    const land = sheet.orientation === 'landscape';
    const N = Math.max(1, Math.min(4, sheet.columns || 3));
    // v2.25 — Kart arası boşluk (yatay = col, dikey = dish); önizleme + baskı ortak
    const SPACING = { tight: { col: 1.5, dish: 1 }, medium: { col: 4, dish: 3 }, wide: { col: 9, dish: 8 } };
    const sp = SPACING[sheet.spacing] || SPACING.medium;
    const gapPx = sp.col * MM, dishGapPx = sp.dish * MM, stationGapPx = 4 * MM;
    const contentWpx = ((land ? 297 : 210) - 2 * PAD_MM) * MM;
    const contentHpx = ((land ? 210 : 297) - 2 * PAD_MM) * MM - 4; // ufak güvenlik payı
    const colWpx = (contentWpx - (N - 1) * gapPx) / N;

    const built = layoutAtoms(sheet);
    if (!built.count) return { pages: [], colWpx: colWpx, contentWpx: contentWpx };
    const titleH = measureLayout(sheet, built.atoms, colWpx, contentWpx);

    const pages = [];
    let cur, colH, ci, bandTop;
    function colX(i) { return Math.round(i * (colWpx + gapPx)); }
    function newPage(startY) { cur = { items: [], usedH: 0 }; pages.push(cur); colH = []; for (let i = 0; i < N; i++) colH.push(0); ci = 0; bandTop = startY || 0; }
    newPage(titleH);
    cur.items.push({ x: 0, y: 0, w: Math.round(contentWpx), h: titleH, html: titleHtmlOf(sheet) });

    built.atoms.forEach(function (a) {
      if (a.kind === 'station') {
        let bottom = bandTop + Math.max.apply(null, colH);
        if (bottom + a.h > contentHpx) { newPage(0); bottom = 0; }
        cur.items.push({ x: 0, y: Math.round(bottom), w: Math.round(contentWpx), h: a.h, html: a.html });
        bandTop = bottom + a.h + stationGapPx;
        for (let i = 0; i < N; i++) colH[i] = 0; ci = 0;
      } else {
        let cap = contentHpx - bandTop;
        if (colH[ci] > 0 && colH[ci] + a.h > cap) {
          ci++;
          if (ci >= N) { newPage(0); cap = contentHpx; }
        }
        cur.items.push({ x: colX(ci), y: Math.round(bandTop + colH[ci]), w: Math.round(colWpx), h: a.h, html: a.html, id: a.id, kind: 'dish' });
        colH[ci] += a.h + dishGapPx;
      }
    });
    pages.forEach(function (pg) {
      let mx = 0; pg.items.forEach(function (it) { mx = Math.max(mx, it.y + (it.h || 0)); }); pg.usedH = mx;
    });
    return { pages: pages, colWpx: colWpx, contentWpx: contentWpx };
  }

  // Sayfa kutularını üret. mode='screen' → tam A4 kutu (gölge + sayfa no);
  // mode='print' → içerik-yükseklikli kutu + break-after:page (PCD.print @page).
  function renderPages(sheet, pageData, mode) {
    const land = sheet.orientation === 'landscape';
    const pageWmm = land ? 297 : 210, pageHmm = land ? 210 : 297;
    const contentWmm = pageWmm - 2 * PAD_MM, contentHmm = pageHmm - 2 * PAD_MM;
    const pages = pageData.pages;
    let out = '<style>' + sheetCss(sheet);
    // v2.28 — @page margin:0 → Chrome başlık/altbilgi damgaları çıkmaz + tam yüzey.
    // Dar kenar boşluğu sayfa kutusunun kendi PAD padding'i ile sağlanır.
    if (mode === 'print') out += '@page{size:A4 ' + (land ? 'landscape' : 'portrait') + ';margin:0;}html,body{margin:0;padding:0;}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}';
    else out += '.ps-dragover-top{box-shadow:0 -3px 0 0 #16a34a !important;} .ps-dragover-bottom{box-shadow:0 3px 0 0 #16a34a !important;}';
    out += '</style>';
    pages.forEach(function (pg, pi) {
      let inner = '';
      pg.items.forEach(function (it) {
        if (mode === 'screen' && it.kind === 'dish' && it.id) {
          const tools = '<div class="ps-cv-tools">' +
            '<span class="ps-cv-b ps-cv-grip" data-drag-dish="' + it.id + '" title="' + esc(t('prep_drag', 'Drag to reorder')) + '" style="font-size:13px;line-height:1;">⠿</span>' +
            '<span class="ps-cv-b" title="' + esc(t('prep_edit_dish', 'Edit dish')) + '">' + PCD.icon('edit', 13) + '</span>' +
          '</div>';
          inner += '<div class="ps-cv-dish" data-card-dish="' + it.id + '" style="position:absolute;left:' + it.x + 'px;top:' + it.y + 'px;width:' + it.w + 'px;">' + tools + it.html + '</div>';
        } else {
          inner += '<div style="position:absolute;left:' + it.x + 'px;top:' + it.y + 'px;width:' + it.w + 'px;">' + it.html + '</div>';
        }
      });
      if (mode === 'screen') {
        out += '<div class="ps-page" style="position:relative;box-sizing:border-box;width:' + pageWmm + 'mm;height:' + pageHmm + 'mm;padding:' + PAD_MM + 'mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.20);margin:0 auto 16px;overflow:hidden;color:#111;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">' +
          '<div style="position:relative;width:100%;height:100%;">' + inner + '</div>' +
          '<div style="position:absolute;bottom:3mm;right:6mm;font-size:8px;color:#c4c4c4;letter-spacing:0.06em;">' + (pi + 1) + ' / ' + pages.length + '</div>' +
          '</div>';
      } else {
        // v2.28 — Baskı sayfası: tam-genişlik A4 + dar PAD padding + içerik-yükseklik
        // sarmalayıcı (footer son sayfaya sığar). İçerik alanı = ekrandakiyle aynı (contentW).
        const usedMm = Math.min(contentHmm, Math.ceil(pg.usedH / MM) + 1);
        out += '<div style="position:relative;box-sizing:border-box;width:' + pageWmm + 'mm;padding:' + PAD_MM + 'mm;color:#111;' + (pi < pages.length - 1 ? 'break-after:page;page-break-after:always;' : '') + '">' +
          '<div style="position:relative;width:100%;height:' + usedMm + 'mm;">' + inner + '</div>' +
        '</div>';
      }
    });
    return out;
  }

  function printSheet(sheet) {
    const pageData = paginate(sheet);
    if (!pageData.pages.length) { PCD.toast.warning(t('prep_nothing_to_print', 'Add at least one dish first')); return; }
    PCD.print(renderPages(sheet, pageData, 'print'), sheet.name || t('prep_title', 'Prep Sheet'));
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.prep = { render: render };
})();
