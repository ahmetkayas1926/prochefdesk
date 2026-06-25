/* ================================================================
   ProChefDesk — checklist.js (v2.12 — REBUILD)

   TWO list kinds only:
   - control : tick-and-confirm checklist
               (closing & safety / opening / cleaning / line check)
   - prep    : mise en place — DISH -> COMPONENTS -> tick + quick note
               (e.g. "1x", "2x", "broccoli steam")

   HACCP-style templates were removed on purpose: temperature / receiving /
   cooling logs live in the HACCP Hub. Having them here too was duplicate work.

   Prep lists can be AUTO-FILLED from the chef's menu/recipes (a dish brings
   its component rows in) AND edited / extended by hand.

   Cloud sync schema is preserved untouched:
   - checklistTemplates  -> checklist_templates  (normal per-table upsert)
   - checklistSessions   -> checklist_sessions   (array table, queueArraySync)
   Soft-delete tombstone pattern kept (waste.js / recipes pattern).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // i18n helper: returns fallback when a key is missing (t() returns the key
  // or empty for unknown keys depending on bundle). New strings ship with an
  // English fallback so the tool works before TR/keys are wired.
  function L(key, fallback) {
    const v = PCD.i18n.t(key);
    return (!v || v === key) ? fallback : v;
  }
  const esc = function (s) { return PCD.escapeHtml(s == null ? '' : String(s)); };
  const uid = function (p) { return PCD.uid(p); };

  // ---------- SESSION STORAGE (array table, soft-delete, cloud-synced) ----------
  function readSessionsAll() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const all = PCD.store._read('checklistSessions') || {};
    if (Array.isArray(all)) return all;            // legacy flat array
    return all[wsId] || [];
  }
  function readSessions() {
    return readSessionsAll().filter(function (s) { return !s._deletedAt; });
  }
  function writeSessions(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('checklistSessions') || {};
    const next = Array.isArray(root) ? {} : Object.assign({}, root);
    const oldArr = Array.isArray(root) ? root : (root[wsId] || []);
    next[wsId] = arr;
    PCD.store.set('checklistSessions', next);
    if (PCD.cloudPerTable) {
      // Tombstones stay in the array so queueArraySync emits an UPSERT
      // (deleted_at set) rather than a hard DELETE.
      PCD.cloudPerTable.queueArraySync('checklist_sessions', wsId, oldArr, arr);
    }
  }

  // ---------- CATEGORIES (optional colour accent for control items) ----------
  const CATS = [
    { id: 'safety',   labelKey: 'chk_cat_safety',   color: '#16a34a' },
    { id: 'cooking',  labelKey: 'chk_cat_cooking',  color: '#ef4444' },
    { id: 'prep',     labelKey: 'chk_cat_prep',     color: '#f59e0b' },
    { id: 'service',  labelKey: 'chk_cat_service',  color: '#3b82f6' },
    { id: 'cleaning', labelKey: 'chk_cat_cleaning', color: '#8b5cf6' },
  ];
  const CAT_FALLBACK = { safety: 'Safety', cooking: 'Cooking', prep: 'Prep', service: 'Service', cleaning: 'Cleaning' };
  function catOf(id) { return CATS.find(function (c) { return c.id === id; }) || null; }
  function catLabel(c) { return c ? L(c.labelKey, CAT_FALLBACK[c.id] || c.id) : ''; }

  // ---------- DEFAULT TEMPLATES (seeded once for empty workspaces) ----------
  // Built at call time so the chef's current language is used. Realistic,
  // minimal: 4 control lists + 1 prep starter mirroring a MENA kitchen.
  function getDefaults() {
    const lang = (PCD.i18n && PCD.i18n.currentLocale) || 'en';
    if (lang === 'tr') {
      return [
        { kind: 'control', name: 'Kapanış ve Güvenlik', icon: 'check-square', items: [
          { text: 'Fritözler kapalı ve soğumaya alındı', cat: 'safety' },
          { text: 'Izgara / chargrill kapalı', cat: 'safety' },
          { text: 'Fırınlar ve salamander kapalı', cat: 'safety' },
          { text: 'Ocak / indüksiyon kapalı', cat: 'safety' },
          { text: 'Bain-marie boşaltıldı ve kapatıldı', cat: 'safety' },
          { text: 'Ana gaz vanası kapalı', cat: 'safety' },
          { text: 'Sıcak yemekler soğutulup kaldırıldı', cat: 'cooking' },
          { text: 'Buzdolapları / dondurucular düzgün kapandı', cat: 'cleaning' },
          { text: 'Çöpler boşaltıldı', cat: 'cleaning' },
          { text: 'Zemin paspaslandı', cat: 'cleaning' },
          { text: 'Arka kapı kilitli, alarm kuruldu', cat: 'safety' },
        ]},
        { kind: 'control', name: 'Açılış', icon: 'clock', items: [
          { text: 'Buzdolapları / dondurucular çalışıyor (sıcaklık görsel ok)', cat: 'safety' },
          { text: 'Fırın / ekipman açıldı', cat: 'cooking' },
          { text: 'İstasyonlarda mise en place hazır', cat: 'prep' },
          { text: 'Sanitizer kovaları dolduruldu', cat: 'cleaning' },
          { text: 'Özel menü ve 86 listesi okundu', cat: 'service' },
          { text: 'Teslimatlar kontrol edildi ve kaldırıldı', cat: 'prep' },
        ]},
        { kind: 'control', name: 'Vardiya Sonu Temizlik', icon: 'recycle', items: [
          { text: 'Tezgahlar boşaltıldı ve sanitize edildi', cat: 'cleaning' },
          { text: 'Tahtalar ve bıçaklar yıkandı', cat: 'cleaning' },
          { text: 'Ekipman silindi', cat: 'cleaning' },
          { text: 'Zemin süpürüldü ve paspaslandı', cat: 'cleaning' },
          { text: 'Çöpler boşaltıldı ve poşetlendi', cat: 'cleaning' },
          { text: 'Bezler çamaşıra gönderildi', cat: 'cleaning' },
        ]},
        { kind: 'control', name: 'Servis Öncesi Line Check', icon: 'check-square', items: [
          { text: 'Tüm istasyonlar kuruldu', cat: 'prep' },
          { text: 'Soslar ve dressing\'ler dolduruldu', cat: 'prep' },
          { text: 'Garnitürler hazırlandı', cat: 'prep' },
          { text: 'Proteinler porsiyonlandı', cat: 'prep' },
          { text: 'Prob termometre çalışıyor', cat: 'safety' },
          { text: 'Pass / sıcak lambalar açık', cat: 'service' },
        ]},
        { kind: 'prep', name: 'Günlük Prep', icon: 'chef-hat', dishes: [
          { text: 'Hummus', comps: ['Hummus', 'Kızarmış Nohut', 'Zeytinyağı'] },
          { text: 'Izgara Tavuk', comps: ['Tavuk Marinasyonu', 'Otlu Labneh', 'İnci Kuskus'] },
        ]},
      ];
    }
    // EN (default for non-TR locales)
    return [
      { kind: 'control', name: 'Closing & Safety', icon: 'check-square', items: [
        { text: 'Fryers turned off & cooling', cat: 'safety' },
        { text: 'Grill / chargrill off', cat: 'safety' },
        { text: 'Ovens & salamander off', cat: 'safety' },
        { text: 'Hot plates / induction off', cat: 'safety' },
        { text: 'Bain-marie emptied & off', cat: 'safety' },
        { text: 'Gas main valve closed', cat: 'safety' },
        { text: 'Hot food cooled & stored', cat: 'cooking' },
        { text: 'Fridges / freezers closed properly', cat: 'cleaning' },
        { text: 'Bins emptied', cat: 'cleaning' },
        { text: 'Floors mopped', cat: 'cleaning' },
        { text: 'Back door locked & alarm set', cat: 'safety' },
      ]},
      { kind: 'control', name: 'Opening', icon: 'clock', items: [
        { text: 'Fridges & freezers running (temp visually ok)', cat: 'safety' },
        { text: 'Ovens / equipment switched on', cat: 'cooking' },
        { text: 'Mise en place ready at stations', cat: 'prep' },
        { text: 'Sanitiser buckets filled', cat: 'cleaning' },
        { text: 'Specials & 86 list read', cat: 'service' },
        { text: 'Deliveries checked & stored', cat: 'prep' },
      ]},
      { kind: 'control', name: 'End of Shift Cleaning', icon: 'recycle', items: [
        { text: 'Benches cleared & sanitised', cat: 'cleaning' },
        { text: 'Boards & knives washed', cat: 'cleaning' },
        { text: 'Equipment wiped down', cat: 'cleaning' },
        { text: 'Floor swept & mopped', cat: 'cleaning' },
        { text: 'Bins emptied & relined', cat: 'cleaning' },
        { text: 'Cloths to laundry', cat: 'cleaning' },
      ]},
      { kind: 'control', name: 'Pre-Service Line Check', icon: 'check-square', items: [
        { text: 'All stations set up', cat: 'prep' },
        { text: 'Sauces & dressings topped up', cat: 'prep' },
        { text: 'Garnishes prepped & ready', cat: 'prep' },
        { text: 'Proteins portioned', cat: 'prep' },
        { text: 'Probe thermometer working', cat: 'safety' },
        { text: 'Pass / hot lamps on', cat: 'service' },
      ]},
      { kind: 'prep', name: 'Daily Prep', icon: 'chef-hat', dishes: [
        { text: 'Hummus', comps: ['Hummus', 'Fried Chickpea', 'Olive oil'] },
        { text: 'Grilled Chicken', comps: ['Chicken Marination', 'Herbed Labneh', 'Pearl Cous Cous'] },
      ]},
    ];
  }

  // ---------- TEMPLATE DATA HELPERS ----------
  function normalizeTemplate(tpl) {
    // Defensive: ensure the shape matches the kind so render never crashes
    // on legacy / partial rows.
    if (!tpl) return tpl;
    if (tpl.kind !== 'prep') {
      tpl.kind = 'control';
      if (!Array.isArray(tpl.items)) tpl.items = [];
    } else {
      if (!Array.isArray(tpl.dishes)) tpl.dishes = [];
      tpl.dishes.forEach(function (d) { if (!Array.isArray(d.comps)) d.comps = []; });
    }
    return tpl;
  }

  function listTemplates() {
    let tpls = PCD.store.listTable('checklistTemplates');
    if (!tpls || tpls.length === 0) {
      getDefaults().forEach(function (def, idx) {
        const tpl = { name: def.name, icon: def.icon, kind: def.kind, sortIndex: idx, isDefault: true };
        if (def.kind === 'prep') {
          tpl.dishes = (def.dishes || []).map(function (d) {
            return { id: uid('dish'), text: d.text, comps: (d.comps || []).map(function (c) { return { id: uid('comp'), text: c }; }) };
          });
        } else {
          tpl.items = (def.items || []).map(function (it) { return { id: uid('it'), text: it.text, cat: it.cat || '' }; });
        }
        PCD.store.upsertInTable('checklistTemplates', tpl, 'tpl');
      });
      tpls = PCD.store.listTable('checklistTemplates');
    }
    tpls.forEach(normalizeTemplate);
    return tpls.slice().sort(function (a, b) {
      const ai = (typeof a.sortIndex === 'number') ? a.sortIndex : 999999;
      const bi = (typeof b.sortIndex === 'number') ? b.sortIndex : 999999;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  function moveTemplate(tid, dir) {
    const ordered = listTemplates();
    const i = ordered.findIndex(function (t) { return t.id === tid; });
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    ordered.forEach(function (t, idx) { t.sortIndex = idx; });
    const tmp = ordered[i].sortIndex;
    ordered[i].sortIndex = ordered[j].sortIndex;
    ordered[j].sortIndex = tmp;
    ordered.forEach(function (t) { PCD.store.upsertInTable('checklistTemplates', t, 'tpl'); });
  }

  function templateCount(tpl) {
    if (tpl.kind === 'prep') return (tpl.dishes || []).length;
    return (tpl.items || []).length;
  }

  // ---------- RECIPE / MENU SOURCES (for prep auto-fill) ----------
  function buildMaps() {
    const recs = PCD.store.listTable('recipes') || [];
    const ings = PCD.store.listTable('ingredients') || [];
    const recipeMap = {}; recs.forEach(function (r) { recipeMap[r.id] = r; });
    const ingMap = {}; ings.forEach(function (i) { ingMap[i.id] = i; });
    return { recipeMap: recipeMap, ingMap: ingMap, recipes: recs };
  }

  // One level deep: a dish's ingredient rows resolved to display names.
  // Mirrors the photo (Barramundi -> Carrot Puree, Dukkah, Freekeh, ...).
  function componentsOfRecipe(recipe, maps) {
    const out = [];
    (recipe.ingredients || []).forEach(function (ri) {
      if (!ri || ri.separator) return;
      const r = PCD.recipes.resolveRow(ri, maps.ingMap, maps.recipeMap);
      if (!r || !r.name) return;
      out.push({ id: uid('comp'), text: r.name, recipeId: ri.recipeId || undefined, ingredientId: ri.ingredientId || undefined });
    });
    return out;
  }

  function dishGroupFromRecipe(recipe, maps) {
    return { id: uid('dish'), text: recipe.name || '', recipeId: recipe.id, comps: componentsOfRecipe(recipe, maps) };
  }

  // Menu dishes = recipes that are NOT preps.
  function listDishRecipes(maps) {
    return (maps.recipes || []).filter(function (r) { return r && !PCD.recipes.isPrep(r); })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  }
  function listMenus() { return PCD.store.listTable('menus') || []; }
  function menuDishRecipes(menu, maps) {
    const out = [];
    const seen = {};
    (menu.sections || []).forEach(function (s) {
      (s.items || []).forEach(function (it) {
        if (it && it.recipeId && maps.recipeMap[it.recipeId] && !seen[it.recipeId]) {
          seen[it.recipeId] = 1;
          out.push(maps.recipeMap[it.recipeId]);
        }
      });
    });
    return out;
  }

  // ---------- SESSION HELPERS ----------
  function listActiveSessions() {
    return readSessions().filter(function (s) { return !s.completedAt; })
      .slice().sort(function (a, b) { return (b.startedAt || '').localeCompare(a.startedAt || ''); });
  }
  function listCompletedSessions(templateId) {
    return readSessions().filter(function (s) {
      if (!s.completedAt) return false;
      if (templateId && s.templateId !== templateId) return false;
      return true;
    }).slice().sort(function (a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); });
  }
  function getSession(sid) { return readSessions().find(function (s) { return s.id === sid; }); }
  function updateSession(sid, mutator) {
    const all = readSessionsAll();
    const idx = all.findIndex(function (s) { return s && s.id === sid && !s._deletedAt; });
    if (idx < 0) return;
    mutator(all[idx]);
    writeSessions(all);
  }
  function deleteSessionById(sid) {
    const all = readSessionsAll().slice();
    const idx = all.findIndex(function (s) { return s && s.id === sid; });
    if (idx === -1) return;
    all[idx] = Object.assign({}, all[idx], { _deletedAt: new Date().toISOString() });
    writeSessions(all);
  }
  function activeSessionForTemplate(tid) {
    return listActiveSessions().find(function (s) { return s.templateId === tid; });
  }

  function sessionProgress(s) {
    if (s.kind === 'prep') {
      let total = 0, done = 0;
      (s.dishes || []).forEach(function (d) {
        (d.comps || []).forEach(function (c) { total++; if (c.done) done++; });
      });
      return { total: total, done: done, pct: total ? Math.round(done / total * 100) : 0 };
    }
    const total = (s.items || []).length;
    const done = (s.items || []).filter(function (i) { return i.done; }).length;
    return { total: total, done: done, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function startOrResumeSession(tid) {
    const existing = activeSessionForTemplate(tid);
    if (existing) { openSession(existing.id); return; }
    const tpl = PCD.store.getFromTable('checklistTemplates', tid);
    if (!tpl) return;
    normalizeTemplate(tpl);
    const user = PCD.store.get('user') || {};
    const s = {
      id: uid('s'),
      templateId: tpl.id,
      templateName: tpl.name,
      kind: tpl.kind,
      icon: tpl.icon || (tpl.kind === 'prep' ? 'chef-hat' : 'check-square'),
      startedAt: new Date().toISOString(),
      completedAt: null,
      completedBy: user.name || user.email || null,
      printOpts: tpl.printOpts ? PCD.clone(tpl.printOpts) : null,
    };
    if (tpl.kind === 'prep') {
      s.dishes = (tpl.dishes || []).map(function (d) {
        return { id: d.id || uid('dish'), text: d.text, comps: (d.comps || []).map(function (c) {
          return { id: c.id || uid('comp'), text: c.text, done: false, doneAt: null, note: '' };
        }) };
      });
    } else {
      s.items = (tpl.items || []).map(function (it) {
        return { id: it.id || uid('it'), text: it.text, cat: it.cat || '', done: false, doneAt: null, comment: '' };
      });
    }
    const all = readSessionsAll();
    all.push(s);
    writeSessions(all);
    openSession(s.id);
  }

  // ---------- TEMPLATE PREVIEW (read-only) ----------
  // Tapping a template opens a preview, NOT a session. The chef can look,
  // then explicitly hit "Start session". Prevents accidental sessions.
  function openPreview(tid) {
    const tpl = PCD.store.getFromTable('checklistTemplates', tid);
    if (!tpl) return;
    normalizeTemplate(tpl);
    const body = PCD.el('div');
    let html = '<div style="margin-bottom:14px;padding:12px 14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border-radius:var(--r-md);">' +
      '<div style="font-size:11px;font-weight:700;color:var(--brand-700);text-transform:uppercase;letter-spacing:0.06em;">' + esc(tpl.kind === 'prep' ? L('chk_kind_prep', 'Prep') : L('chk_kind_control', 'Control')) + '</div>' +
      '<div style="font-weight:800;font-size:19px;letter-spacing:-0.01em;">' + esc(tpl.name) + '</div>' +
      '<div class="text-muted text-sm mt-1">' + templateCount(tpl) + ' ' + esc(tpl.kind === 'prep' ? L('chk_dishes', 'dishes') : L('chk_items', 'items')) + '</div>' +
    '</div>';
    if (tpl.kind === 'prep') {
      (tpl.dishes || []).forEach(function (d) {
        html += '<div style="margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1.5px solid var(--border);margin-bottom:4px;"><span style="color:var(--brand-700);">' + PCD.icon('chef-hat', 15) + '</span><span style="font-weight:700;font-size:14px;">' + esc(d.text || L('chk_untitled_dish', 'Untitled dish')) + '</span></div>';
        (d.comps || []).forEach(function (c) { html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:13px;"><span style="width:14px;height:14px;border:1.5px solid var(--border-strong);border-radius:3px;flex-shrink:0;"></span><span style="min-width:0;">' + esc(c.text) + '</span></div>'; });
        html += '</div>';
      });
    } else {
      (tpl.items || []).forEach(function (it) {
        const cat = catOf(it.cat);
        const chip = cat ? '<span style="font-size:10px;padding:1px 7px;border-radius:999px;background:' + cat.color + '22;color:' + cat.color + ';font-weight:700;text-transform:uppercase;flex-shrink:0;">' + esc(catLabel(cat)) + '</span>' : '';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-bottom:1px solid var(--border);font-size:14px;"><span style="width:16px;height:16px;border:1.5px solid var(--border-strong);border-radius:3px;flex-shrink:0;"></span><span style="flex:1;min-width:0;">' + esc(it.text) + '</span>' + chip + '</div>';
      });
    }
    body.innerHTML = html;
    const startBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    startBtn.innerHTML = PCD.icon('check', 16) + ' <span>' + esc(L('chk_start_session', 'Start session')) + '</span>';
    const editBtn = PCD.el('button', { class: 'btn btn-outline', title: L('act_edit', 'Edit') }); editBtn.innerHTML = PCD.icon('edit', 16);
    const printBtn = PCD.el('button', { class: 'btn btn-outline', title: L('chk_print_blank', 'Print blank') }); printBtn.innerHTML = PCD.icon('print', 16);
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn); footer.appendChild(printBtn); footer.appendChild(editBtn); footer.appendChild(startBtn);
    const m = PCD.modal.open({ title: tpl.name, body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { printChecklist(tpl, null); });
    editBtn.addEventListener('click', function () { m.close(); setTimeout(function () { openEditor(tid); }, 200); });
    startBtn.addEventListener('click', function () { m.close(); setTimeout(function () { startOrResumeSession(tid); }, 200); });
  }

  // ---------- INLINE GUIDE (dismissible) ----------
  function guideDismissed() { try { return localStorage.getItem('pcd_chk_guide') === '1'; } catch (e) { return false; } }
  function dismissGuide() { try { localStorage.setItem('pcd_chk_guide', '1'); } catch (e) {} }

  // ============ MAIN VIEW ============
  let currentKind = 'control';

  function render(view) {
    const templates = listTemplates();
    const active = listActiveSessions();
    const showGuide = !guideDismissed();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">' + esc(L('checklist_title', 'Checklists')) + '</div>' +
          '<div class="page-subtitle">' + esc(L('checklist_subtitle', 'Control lists to tick & confirm, and prep lists from your menu')) + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-primary btn-sm" id="chkNewBtn">' + PCD.icon('plus', 16) + ' ' + esc(L('chk_new', 'New list')) + '</button>' +
        '</div>' +
      '</div>' +

      PCD.subNav('lists', 'checklist') +

      (showGuide ?
        '<div class="card" id="chkGuide" style="padding:12px 14px;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-200);">' +
          '<div style="display:flex;gap:10px;align-items:flex-start;">' +
            '<div style="color:var(--brand-700);flex-shrink:0;margin-top:1px;">' + PCD.icon('book-open', 18) + '</div>' +
            '<div style="flex:1;min-width:0;font-size:13px;line-height:1.6;color:var(--text-2);">' +
              '<strong style="color:var(--text-1);">' + esc(L('chk_guide_title', 'Two kinds of list')) + '</strong><br>' +
              '<strong>' + esc(L('chk_kind_control', 'Control')) + '</strong> — ' + esc(L('chk_guide_control', 'tick-and-confirm: closing & safety, opening, cleaning, line check.')) + '<br>' +
              '<strong>' + esc(L('chk_kind_prep', 'Prep')) + '</strong> — ' + esc(L('chk_guide_prep', 'dish → components with a quick note (1x, 2x...). Build it from your menu or by hand.')) +
            '</div>' +
            '<button class="icon-btn" id="chkGuideX" title="' + esc(L('dismiss', 'Dismiss')) + '" style="flex-shrink:0;">' + PCD.icon('x', 16) + '</button>' +
          '</div>' +
        '</div>' : '') +

      '<div class="segment" id="chkSeg" style="display:inline-flex;gap:4px;background:var(--surface-2);border-radius:var(--r-md);padding:4px;margin-bottom:14px;">' +
        '<button class="btn btn-sm ' + (currentKind === 'control' ? 'btn-primary' : 'btn-ghost') + '" data-kind="control">' + PCD.icon('check-square', 15) + ' ' + esc(L('chk_kind_control', 'Control')) + '</button>' +
        '<button class="btn btn-sm ' + (currentKind === 'prep' ? 'btn-primary' : 'btn-ghost') + '" data-kind="prep">' + PCD.icon('chef-hat', 15) + ' ' + esc(L('chk_kind_prep', 'Prep')) + '</button>' +
      '</div>' +

      (active.length ?
        '<div class="section mb-4">' +
          '<div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">' + esc(L('checklist_in_progress', 'In progress')) + '</div>' +
          '<div id="chkActive" class="flex flex-col gap-2"></div>' +
        '</div>' : '') +

      '<div class="section">' +
        '<div id="chkList" class="flex flex-col gap-2"></div>' +
      '</div>';

    // Guide
    const gx = PCD.$('#chkGuideX', view);
    if (gx) gx.addEventListener('click', function () { dismissGuide(); render(view); });

    // Segment
    PCD.on(view, 'click', '[data-kind]', function () {
      currentKind = this.getAttribute('data-kind');
      render(view);
    });

    // New
    PCD.$('#chkNewBtn', view).addEventListener('click', function () { openEditor(null, currentKind); });

    // Active sessions (both kinds)
    const actEl = PCD.$('#chkActive', view);
    if (actEl) {
      active.forEach(function (s) {
        const p = sessionProgress(s);
        const row = PCD.el('div', { class: 'card', style: { padding: '12px' } });
        row.innerHTML =
          '<div class="flex items-center gap-3">' +
            '<div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);flex-shrink:0;">' + PCD.icon(s.icon || (s.kind === 'prep' ? 'chef-hat' : 'check-square'), 20) + '</div>' +
            '<div style="flex:1;min-width:0;cursor:pointer;" data-resume-sid="' + s.id + '">' +
              '<div style="font-weight:600;font-size:15px;">' + esc(s.templateName || 'List') + '</div>' +
              '<div class="text-muted text-sm">' + p.done + '/' + p.total + ' · ' + esc(PCD.fmtRelTime(s.startedAt)) + '</div>' +
              '<div class="progress mt-1" style="height:4px;"><div class="progress-bar" style="width:' + p.pct + '%;background:var(--brand-600);"></div></div>' +
            '</div>' +
            '<div style="font-weight:700;color:var(--brand-700);flex-shrink:0;">' + p.pct + '%</div>' +
            '<button type="button" class="btn btn-primary btn-sm" data-complete-sid="' + s.id + '" title="' + esc(L('checklist_complete', 'Complete')) + '" style="flex-shrink:0;">' + PCD.icon('check', 14) + '</button>' +
            '<button type="button" class="icon-btn" data-discard-sid="' + s.id + '" title="' + esc(L('chk_discard', 'Discard')) + '" style="flex-shrink:0;">' + PCD.icon('x', 16) + '</button>' +
          '</div>';
        actEl.appendChild(row);
      });
      PCD.on(actEl, 'click', '[data-resume-sid]', function () { openSession(this.getAttribute('data-resume-sid')); });
      PCD.on(actEl, 'click', '[data-complete-sid]', function (e) {
        e.stopPropagation();
        const sid = this.getAttribute('data-complete-sid');
        const user = PCD.store.get('user') || {};
        updateSession(sid, function (x) { x.completedAt = new Date().toISOString(); x.completedBy = x.completedBy || user.name || user.email || ''; });
        PCD.toast.success(L('toast_checklist_completed', 'List completed'));
        render(view);
      });
      PCD.on(actEl, 'click', '[data-discard-sid]', function (e) {
        e.stopPropagation();
        const sid = this.getAttribute('data-discard-sid');
        const s2 = getSession(sid);
        const p2 = s2 ? sessionProgress(s2) : { done: 0 };
        function go() { deleteSessionById(sid); render(view); }
        if (p2.done === 0) { go(); return; }
        PCD.modal.confirm({ icon: '🗑', iconKind: 'danger', danger: true, title: L('chk_discard_confirm_t', 'Discard this session?'), text: L('chk_discard_confirm_m', 'Progress on this session will be lost. The template stays.'), okText: L('chk_discard', 'Discard') }).then(function (ok) { if (ok) go(); });
      });
    }

    // Templates of the active kind
    const listEl = PCD.$('#chkList', view);
    const ofKind = templates.filter(function (t) { return (t.kind || 'control') === currentKind; });

    if (!ofKind.length) {
      listEl.innerHTML =
        '<div class="text-muted" style="padding:42px 20px;text-align:center;line-height:1.6;border:1.5px dashed var(--border);border-radius:var(--r-md);">' +
          '<div style="color:var(--text-3);margin-bottom:10px;">' + PCD.icon(currentKind === 'prep' ? 'chef-hat' : 'check-square', 34) + '</div>' +
          '<div style="font-weight:600;color:var(--text-1);margin-bottom:4px;">' + esc(currentKind === 'prep' ? L('chk_empty_prep_t', 'No prep lists yet') : L('chk_empty_control_t', 'No control lists yet')) + '</div>' +
          '<div style="font-size:13px;margin-bottom:14px;">' + esc(currentKind === 'prep' ? L('chk_empty_prep_m', 'Create a prep list and pull dishes straight from your menu.') : L('chk_empty_control_m', 'Create a closing, opening or cleaning checklist.')) + '</div>' +
          '<button class="btn btn-primary btn-sm" id="chkEmptyNew">' + PCD.icon('plus', 15) + ' ' + esc(L('chk_new', 'New list')) + '</button>' +
        '</div>';
      const en = PCD.$('#chkEmptyNew', listEl);
      if (en) en.addEventListener('click', function () { openEditor(null, currentKind); });
      return;
    }

    ofKind.forEach(function (tpl, idx) {
      const isFirst = idx === 0;
      const isLast = idx === ofKind.length - 1;
      const countLabel = tpl.kind === 'prep'
        ? templateCount(tpl) + ' ' + esc(L('chk_dishes', 'dishes'))
        : templateCount(tpl) + ' ' + esc(L('chk_items', 'items'));
      const row = PCD.el('div', { class: 'card card-hover', 'data-tid': tpl.id, style: { padding: '12px' } });
      row.innerHTML =
        '<div class="flex items-center gap-3">' +
          '<div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">' + PCD.icon(tpl.icon || (tpl.kind === 'prep' ? 'chef-hat' : 'check-square'), 20) + '</div>' +
          '<div style="flex:1;min-width:0;cursor:pointer;" data-preview="' + tpl.id + '">' +
            '<div style="font-weight:700;font-size:15px;">' + esc(tpl.name) + '</div>' +
            '<div class="text-muted text-sm">' + countLabel + '</div>' +
          '</div>' +
          '<button type="button" class="drag-handle icon-btn" title="' + esc(L('reorder', 'Drag to reorder')) + '" style="cursor:grab;touch-action:none;color:var(--text-3);flex-shrink:0;"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></button>' +
          '<button type="button" class="icon-btn" data-menu="' + tpl.id + '" title="' + esc(L('more_actions', 'More')) + '">' + PCD.icon('more-vertical', 18) + '</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-preview="' + tpl.id + '">' + esc(L('chk_open', 'Open')) + '</button>' +
        '</div>';
      listEl.appendChild(row);
    });

    if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
      PCD.dragdrop.makeSortable(listEl, { handle: '.drag-handle', onEnd: function (o, n) {
        if (o === n) return;
        const moved = ofKind.splice(o, 1)[0];
        ofKind.splice(n, 0, moved);
        ofKind.forEach(function (t, i) { t.sortIndex = i; PCD.store.upsertInTable('checklistTemplates', t, 'tpl'); });
        render(view);
      } });
    }
    PCD.on(listEl, 'click', '[data-preview]', function (e) { e.stopPropagation(); openPreview(this.getAttribute('data-preview')); });
    PCD.on(listEl, 'click', '[data-menu]', function (e) {
      e.stopPropagation();
      const tid = this.getAttribute('data-menu');
      const tpl = PCD.store.getFromTable('checklistTemplates', tid);
      if (!tpl) return;
      normalizeTemplate(tpl);
      const completed = listCompletedSessions(tid).length;
      PCD.actionSheet({
        title: tpl.name,
        actions: [
          { icon: 'edit', label: L('act_edit', 'Edit'), onClick: function () { openEditor(tid); } },
          { icon: 'print', label: L('chk_print_blank', 'Print blank'), onClick: function () { printChecklist(tpl, null); } },
          { icon: 'clock', label: L('checklist_history', 'History') + (completed ? ' (' + completed + ')' : ''), onClick: function () { openHistory(tid); } },
          { icon: 'copy', label: L('act_duplicate', 'Duplicate'), onClick: function () {
            const copy = PCD.clone(tpl);
            delete copy.id; delete copy.createdAt; delete copy.updatedAt;
            copy.name = copy.name + ' (' + L('copy', 'Copy') + ')';
            copy.isDefault = false;
            copy.sortIndex = listTemplates().length;
            PCD.store.upsertInTable('checklistTemplates', copy, 'tpl');
            PCD.toast.success(L('act_duplicate', 'Duplicate') + ' ✓');
            render(view);
          }},
          { icon: 'trash', label: L('act_delete', 'Delete'), danger: true, onClick: function () {
            PCD.modal.confirm({
              icon: '🗑', iconKind: 'danger', danger: true,
              title: L('checklist_delete_confirm_title', 'Delete this list?'),
              text: L('checklist_delete_confirm_msg', 'This removes the template. In-progress sessions keep working.'),
              okText: L('act_delete', 'Delete'),
            }).then(function (ok) {
              if (!ok) return;
              PCD.store.deleteFromTable('checklistTemplates', tid);
              PCD.toast.success(L('checklist_deleted', 'List deleted'));
              render(view);
            });
          }},
        ]
      });
    });
  }

  function refreshMain() {
    const v = PCD.$('#view');
    if (v && PCD.router.currentView() === 'checklist') render(v);
  }

  // ============ SESSION RUN VIEW ============
  function openSession(sid) {
    const first = getSession(sid);
    if (!first) return;
    const body = PCD.el('div');

    // Delegated handlers wired ONCE (body element persists across re-renders).
    PCD.on(body, 'click', '[data-toggle]', function () {
      const id = this.getAttribute('data-toggle');
      updateSession(sid, function (s) {
        eachItem(s, function (it) {
          if (it.id === id) { it.done = !it.done; it.doneAt = it.done ? new Date().toISOString() : null; }
        });
      });
      PCD.haptic && PCD.haptic('light');
      paint();
    });
    PCD.on(body, 'input', '[data-note]', function () {
      const id = this.getAttribute('data-note');
      const val = this.value;
      updateSession(sid, function (s) { eachItem(s, function (it) { if (it.id === id) it.note = val; }); });
    });
    PCD.on(body, 'input', '[data-comment]', function () {
      const id = this.getAttribute('data-comment');
      const val = this.value;
      updateSession(sid, function (s) { eachItem(s, function (it) { if (it.id === id) it.comment = val; }); });
    });
    PCD.on(body, 'click', '[data-cmtoggle]', function () {
      const id = this.getAttribute('data-cmtoggle');
      const w = body.querySelector('[data-cmwrap="' + id + '"]');
      if (w) { w.style.display = w.style.display === 'none' ? 'block' : 'none'; if (w.style.display === 'block') { const i = w.querySelector('input'); if (i) i.focus(); } }
    });

    function eachItem(s, fn) {
      if (s.kind === 'prep') (s.dishes || []).forEach(function (d) { (d.comps || []).forEach(fn); });
      else (s.items || []).forEach(fn);
    }

    function paint() {
      const s = getSession(sid);
      if (!s) return;
      const p = sessionProgress(s);
      let html =
        '<div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<div style="font-weight:700;">' + p.done + ' / ' + p.total + '</div>' +
            '<div style="font-weight:700;color:var(--brand-700);font-size:18px;">' + p.pct + '%</div>' +
          '</div>' +
          '<div class="progress" style="height:6px;"><div class="progress-bar" style="width:' + p.pct + '%;background:var(--brand-600);transition:width 0.3s;"></div></div>' +
        '</div>';

      if (s.kind === 'prep') {
        (s.dishes || []).forEach(function (d) {
          const dq = (d.comps || []).filter(function (c) { return c.done; }).length;
          html += '<div style="margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;gap:8px;padding:6px 2px;border-bottom:1.5px solid var(--border);margin-bottom:6px;">' +
              '<span style="color:var(--brand-700);">' + PCD.icon('chef-hat', 16) + '</span>' +
              '<span style="font-weight:700;font-size:14px;flex:1;min-width:0;">' + esc(d.text || L('chk_untitled_dish', 'Untitled dish')) + '</span>' +
              '<span class="text-muted text-sm">' + dq + '/' + (d.comps || []).length + '</span>' +
            '</div>';
          (d.comps || []).forEach(function (c) { html += compRowHtml(c); });
          html += '</div>';
        });
      } else {
        html += '<div class="flex flex-col gap-2">';
        (s.items || []).forEach(function (it) { html += controlRowHtml(it); });
        html += '</div>';
      }
      body.innerHTML = html;
    }

    function compRowHtml(c) {
      const done = !!c.done;
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ' + (done ? 'var(--brand-300)' : 'var(--border)') + ';border-radius:var(--r-sm);background:' + (done ? 'var(--brand-50)' : 'var(--surface)') + ';margin-bottom:6px;">' +
          '<div data-toggle="' + c.id + '" style="width:22px;height:22px;border:2px solid ' + (done ? 'var(--brand-600)' : 'var(--border-strong)') + ';border-radius:5px;display:flex;align-items:center;justify-content:center;background:' + (done ? 'var(--brand-600)' : 'transparent') + ';color:#fff;flex-shrink:0;cursor:pointer;">' + (done ? PCD.icon('check', 14) : '') + '</div>' +
          '<div style="flex:1;min-width:0;font-size:14px;font-weight:500;' + (done ? 'color:var(--text-3);' : '') + '">' + esc(c.text) + '</div>' +
          '<input type="text" class="input" data-note="' + c.id + '" value="' + esc(c.note || '') + '" placeholder="' + esc(L('chk_note_ph', '1x, 2x, steam...')) + '" style="width:120px;flex-shrink:0;font-size:13px;padding:6px 8px;text-align:center;">' +
        '</div>';
    }

    function controlRowHtml(it) {
      const done = !!it.done;
      const cat = catOf(it.cat);
      const stripe = cat ? cat.color : 'transparent';
      const hasC = it.comment && it.comment.length;
      return '<div style="border:1px solid ' + (done ? 'var(--brand-300)' : 'var(--border)') + ';border-left:4px solid ' + stripe + ';border-radius:var(--r-sm);background:' + (done ? 'var(--brand-50)' : 'var(--surface)') + ';padding:10px 12px;">' +
          '<div data-toggle="' + it.id + '" style="display:flex;align-items:center;gap:10px;cursor:pointer;">' +
            '<div style="width:22px;height:22px;border:2px solid ' + (done ? 'var(--brand-600)' : 'var(--border-strong)') + ';border-radius:5px;display:flex;align-items:center;justify-content:center;background:' + (done ? 'var(--brand-600)' : 'transparent') + ';color:#fff;flex-shrink:0;">' + (done ? PCD.icon('check', 14) : '') + '</div>' +
            '<div style="flex:1;min-width:0;font-weight:500;font-size:14px;' + (done ? 'text-decoration:line-through;color:var(--text-3);' : '') + '">' + esc(it.text) + '</div>' +
            (cat ? '<span style="font-size:10px;padding:2px 7px;border-radius:999px;background:' + cat.color + '22;color:' + cat.color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;flex-shrink:0;">' + esc(catLabel(cat)) + '</span>' : '') +
          '</div>' +
          '<button data-cmtoggle="' + it.id + '" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;margin-top:4px;color:var(--text-3);">' + (hasC ? '✏️ ' + esc(L('chk_comment', 'Note')) : '+ ' + esc(L('chk_add_comment', 'Add note'))) + '</button>' +
          '<div data-cmwrap="' + it.id + '" style="display:' + (hasC ? 'block' : 'none') + ';margin-top:4px;">' +
            '<input type="text" class="input" data-comment="' + it.id + '" value="' + esc(it.comment || '') + '" placeholder="' + esc(L('chk_notes_ph', 'Notes...')) + '" style="font-size:13px;padding:6px 10px;">' +
          '</div>' +
        '</div>';
    }

    paint();

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close') });
    const printBtn = PCD.el('button', { class: 'btn btn-outline', title: L('print_pdf', 'Print / PDF') });
    printBtn.innerHTML = PCD.icon('print', 16);
    const shareBtn = PCD.el('button', { class: 'btn btn-outline', title: L('btn_share', 'Share') });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const doneBtn = PCD.el('button', { class: 'btn btn-primary', text: L('checklist_complete', 'Complete'), style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn); footer.appendChild(printBtn); footer.appendChild(shareBtn); footer.appendChild(doneBtn);

    const tpl = PCD.store.getFromTable('checklistTemplates', first.templateId);
    const m = PCD.modal.open({
      title: (first.templateName || 'List') + ' · ' + PCD.fmtDate(first.startedAt, { month: 'short', day: 'numeric' }),
      body: body, footer: footer, size: 'md', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); refreshMain(); });
    printBtn.addEventListener('click', function () { printChecklist(tpl, getSession(sid)); });
    shareBtn.addEventListener('click', function () { shareSession(getSession(sid)); });
    doneBtn.addEventListener('click', function () {
      const s = getSession(sid);
      const p = sessionProgress(s);
      const remaining = p.total - p.done;
      function finalize() {
        const user = PCD.store.get('user') || {};
        updateSession(sid, function (x) { x.completedAt = new Date().toISOString(); x.completedBy = x.completedBy || user.name || user.email || ''; });
        PCD.toast.success(L('toast_checklist_completed', 'List completed'));
        m.close(); refreshMain();
      }
      if (remaining > 0) {
        PCD.modal.confirm({
          title: L('chk_complete_unfinished_t', 'Complete with ' + remaining + ' unfinished?'),
          text: L('chk_complete_unfinished_m', 'You can still complete and keep a record.'),
          okText: L('checklist_complete', 'Complete'),
        }).then(function (ok) { if (ok) finalize(); });
      } else finalize();
    });
  }

  // ============ HISTORY ============
  function openHistory(templateId) {
    const tpl = PCD.store.getFromTable('checklistTemplates', templateId);
    if (!tpl) { PCD.toast.error(L('toast_template_not_found', 'Template not found')); return; }
    let showAll = false;
    const body = PCD.el('div');

    function paint() {
      const all = listCompletedSessions(templateId);
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const visible = showAll ? all : all.filter(function (s) { return new Date(s.completedAt).getTime() >= cutoff; });
      const hidden = all.length - visible.length;

      if (!all.length) {
        body.innerHTML =
          '<div class="text-muted" style="padding:42px 20px;text-align:center;line-height:1.6;">' +
            '<div style="font-size:34px;margin-bottom:8px;">📜</div>' +
            '<div style="font-weight:600;color:var(--text-1);margin-bottom:4px;">' + esc(L('checklist_history_empty_title', 'No completed sessions yet')) + '</div>' +
            '<div style="font-size:13px;">' + esc(L('checklist_history_empty_msg', 'Completed lists appear here for your records.')) + '</div>' +
          '</div>';
        return;
      }
      let html = '';
      visible.forEach(function (s) {
        const p = sessionProgress(s);
        const d = new Date(s.completedAt);
        const dateStr = d.toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = d.toLocaleTimeString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { hour: '2-digit', minute: '2-digit' });
        html += '<div class="card card-hover" data-hsid="' + s.id + '" style="padding:12px 14px;margin-bottom:8px;cursor:pointer;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:34px;height:34px;border-radius:8px;background:#16a34a15;color:#16a34a;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">✓</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;font-size:14px;">' + esc(dateStr) + ' · ' + esc(timeStr) + '</div>' +
              '<div class="text-muted" style="font-size:12px;margin-top:2px;">' + esc(s.completedBy || L('checklist_history_unknown_chef', 'Unknown')) + ' · ' + p.done + '/' + p.total + ' (' + p.pct + '%)</div>' +
            '</div>' +
            '<div style="color:var(--text-3);">›</div>' +
          '</div>' +
        '</div>';
      });
      if (!showAll && hidden > 0) html += '<button id="histAll" class="btn btn-secondary" style="width:100%;margin-top:8px;">' + esc(L('checklist_history_show_older', 'Show older') + ' (' + hidden + ')') + '</button>';
      body.innerHTML = html;
      body.querySelectorAll('[data-hsid]').forEach(function (el) {
        el.addEventListener('click', function () { const s = getSession(this.getAttribute('data-hsid')); if (s) openHistoryDetail(s, tpl); });
      });
      const ha = PCD.$('#histAll', body);
      if (ha) ha.addEventListener('click', function () { showAll = true; paint(); });
    }
    paint();

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: '📜 ' + L('checklist_history', 'History') + ' · ' + tpl.name, body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  function openHistoryDetail(session, tpl) {
    const p = sessionProgress(session);
    const body = PCD.el('div');
    let itemsHtml = '';
    if (session.kind === 'prep') {
      (session.dishes || []).forEach(function (d) {
        itemsHtml += '<div style="font-weight:700;font-size:13px;padding:8px 10px 4px;">' + esc(d.text) + '</div>';
        (d.comps || []).forEach(function (c) {
          itemsHtml += '<div style="display:flex;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border);font-size:13px;">' +
            '<div style="flex:1;min-width:0;">' + (c.done ? '<span style="color:#16a34a;">✓</span> ' : '<span style="color:var(--text-3);">○</span> ') + esc(c.text) + '</div>' +
            '<div style="flex-shrink:0;color:var(--text-2);">' + esc(c.note || '') + '</div>' +
          '</div>';
        });
      });
    } else {
      (session.items || []).forEach(function (it) {
        itemsHtml += '<div style="display:flex;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border);font-size:13px;">' +
          '<div style="flex:1;min-width:0;">' + (it.done ? '<span style="color:#16a34a;">✓</span> ' : '<span style="color:var(--text-3);">○</span> ') + esc(it.text) + (it.comment ? ' <span class="text-muted" style="font-style:italic;">— ' + esc(it.comment) + '</span>' : '') + '</div>' +
        '</div>';
      });
    }
    const completed = new Date(session.completedAt);
    body.innerHTML =
      '<div style="background:var(--surface-2);padding:12px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;line-height:1.7;">' +
        '<div><strong>' + esc(L('checklist_history_completed_at', 'Completed')) + ':</strong> ' + esc(completed.toLocaleString()) + '</div>' +
        '<div><strong>' + esc(L('checklist_history_by', 'By')) + ':</strong> ' + esc(session.completedBy || L('checklist_history_unknown_chef', 'Unknown')) + '</div>' +
        '<div><strong>' + esc(L('checklist_history_result', 'Result')) + ':</strong> ' + p.done + '/' + p.total + ' (' + p.pct + '%)</div>' +
      '</div>' +
      '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">' + itemsHtml + '</div>';

    const printBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    printBtn.innerHTML = PCD.icon('print', 16) + ' <span>' + esc(L('print', 'Print / PDF')) + '</span>';
    const delBtn = PCD.el('button', { class: 'btn btn-outline', title: L('act_delete', 'Delete') });
    delBtn.innerHTML = PCD.icon('trash', 16);
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn); footer.appendChild(delBtn); footer.appendChild(printBtn);
    const m = PCD.modal.open({ title: tpl.name + ' — ' + completed.toLocaleDateString(), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });
    printBtn.addEventListener('click', function () { printChecklist(tpl, session); });
    delBtn.addEventListener('click', function () {
      PCD.modal.confirm({ icon: '🗑', iconKind: 'danger', danger: true, title: L('checklist_history_delete_title', 'Delete this record?'), text: L('checklist_history_delete_msg', 'This permanently removes the session record.'), okText: L('act_delete', 'Delete') })
        .then(function (ok) { if (!ok) return; deleteSessionById(session.id); PCD.toast.success(L('checklist_history_deleted', 'Record deleted')); m.close(); setTimeout(function () { openHistory(tpl.id); }, 150); });
    });
  }

  // ============ PRINT OPTIONS ============
  // Per-template print customisation (v2.12.3): orientation, columns, font
  // scale, weight, density. Lets a chef squeeze 18-20 dishes onto one A4, or
  // blow up a short list for easy reading across the line.
  function normalizePrintOpts(o, isPrep) {
    o = o || {};
    const cols = parseInt(o.columns, 10);
    return {
      orientation: o.orientation === 'landscape' ? 'landscape' : 'portrait',
      columns: (cols >= 1 && cols <= 3) ? cols : (isPrep ? 2 : 1),
      fontScale: (typeof o.fontScale === 'number' && o.fontScale >= 0.8 && o.fontScale <= 1.4) ? o.fontScale : 1,
      bold: !!o.bold,
      density: (o.density === 'compact' || o.density === 'relaxed') ? o.density : 'normal',
    };
  }
  function densFactor(d) { return d === 'compact' ? 0.7 : d === 'relaxed' ? 1.4 : 1; }
  // Rough estimate of how many items (control) / component rows (prep) fit on
  // one page with the given options — drives the live capacity hint in the editor.
  function printCapacity(kind, opts) {
    const o = normalizePrintOpts(opts, kind === 'prep');
    const availPt = (o.orientation === 'landscape' ? 500 : 752) - 100; // minus header/meta/signoff
    const dens = densFactor(o.density);
    const baseRow = kind === 'prep' ? 8.5 : 9.5;
    const rowH = baseRow * o.fontScale * 1.5 + 7 * dens;
    return Math.max(1, Math.floor(availPt / rowH) * o.columns);
  }

  // ============ PRINT (control + prep, blank or filled) ============
  // Blank prints leave Date BLANK — the chef writes it by hand (operator rule).
  // v2.23 — Baskı HTML'i (PCD.print + canlı önizleme iframe ortak)
  function buildChecklistHtml(tpl, session) {
    const isPrep = (session ? session.kind : tpl.kind) === 'prep';
    const name = (tpl && tpl.name) || (session && session.templateName) || L('chk_print_default', 'Checklist');
    const filled = !!session;
    const o = normalizePrintOpts((tpl && tpl.printOpts) || (session && session.printOpts) || {}, isPrep);
    const fs = o.fontScale;
    const dens = densFactor(o.density);
    const wt = o.bold ? 800 : 600;
    const margin = o.orientation === 'landscape' ? '8mm' : '10mm';
    function pt(v) { return (v * fs).toFixed(1) + 'pt'; }
    function pad(v) { return (v * dens).toFixed(1) + 'px'; }

    const styleCommon =
      '@page { size: A4 ' + o.orientation + '; margin: 0; }' +
      'body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; margin: 0; padding: ' + margin + '; font-variant-numeric: tabular-nums; }' +
      '.h-row { border-bottom: 2px solid #16433a; padding-bottom: 4px; margin-bottom: 6px; }' +
      '.h-row h1 { margin: 0; font-family: "Fraunces","Georgia",serif; font-weight: 600; font-size: ' + pt(15) + '; color: #16433a; }' +
      '.h-row .sub { color: #666; font-size: ' + pt(9) + '; }' +
      '.h-meta { display: flex; gap: 14px; margin: 6px 0 10px; padding: 6px 10px; background: #f7f7f7; border-radius: 4px; }' +
      '.h-meta-item { display: flex; align-items: baseline; gap: 6px; flex: 1; }' +
      '.h-meta-item .lbl { color: #888; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; font-size: ' + pt(7) + '; flex-shrink: 0; }' +
      '.h-meta-item .val { font-size: ' + pt(9.5) + '; font-weight: 600; border-bottom: 1px solid #ccc; flex: 1; padding-bottom: 1px; min-height: 12px; }' +
      '.h-signoff { margin-top: 10px; padding-top: 6px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; gap: 20px; font-size: ' + pt(8) + '; color: #555; }' +
      '.h-signoff .sig { flex: 1; display: flex; align-items: baseline; gap: 6px; }' +
      '.h-signoff .sig-l { text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; flex-shrink: 0; }' +
      '.h-signoff .sig-line { flex: 1; border-bottom: 1px solid #888; min-height: 14px; padding-bottom: 1px; font-size: ' + pt(9) + '; }';

    const dateVal = filled ? esc(new Date(session.completedAt || session.startedAt).toLocaleDateString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { year: 'numeric', month: 'long', day: 'numeric' })) : '&nbsp;';
    const byVal = filled ? esc(session.completedBy || '') : '&nbsp;';

    let html = '<style>' + styleCommon;

    if (!isPrep) {
      html += 'table { width:100%; border-collapse: collapse; font-size: ' + pt(9.5) + '; }' +
        'thead th { background:#eaf6f0; padding:' + pad(4) + ' ' + pad(6) + '; text-align:left; font-size:' + pt(7) + '; text-transform:uppercase; letter-spacing:0.03em; color:#16433a; }' +
        'td { padding:' + pad(4) + ' ' + pad(6) + '; border-bottom:1px solid #e7e5e4; vertical-align:top; }' +
        'tr { page-break-inside: avoid; }' +
        '.ctrl-cols { display:grid; grid-template-columns: repeat(' + o.columns + ', 1fr); gap: 5mm; align-items:start; }' +
        '</style>';
      const items = filled ? (session.items || []) : (tpl.items || []);
      function rowHtml(it, i) {
        const cat = catOf(it.cat);
        const stripe = cat ? cat.color : 'transparent';
        let val;
        if (filled) val = it.done ? '<span style="color:#16a34a;font-weight:700;">✓</span>' : '<span style="color:#999;">—</span>';
        else val = '<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #999;border-radius:2px;"></span>';
        const comment = (filled && it.comment) ? '<div style="font-size:' + pt(8) + ';color:#666;font-style:italic;margin-top:2px;">📝 ' + esc(it.comment) + '</div>' : '';
        return '<tr>' +
          '<td style="border-left:4px solid ' + stripe + ';width:16px;font-weight:700;color:#999;font-size:' + pt(8) + ';">' + (i + 1) + '</td>' +
          '<td><span style="font-weight:' + wt + ';font-size:' + pt(9.5) + ';">' + esc(it.text) + '</span>' + (cat ? ' <span style="font-size:' + pt(7) + ';color:' + cat.color + ';font-weight:700;text-transform:uppercase;margin-inline-start:4px;">' + esc(catLabel(cat)) + '</span>' : '') + comment + '</td>' +
          '<td style="text-align:center;width:30px;">' + val + '</td>' +
          '<td style="width:38px;text-align:center;font-size:' + pt(8) + ';color:#999;">' + (filled ? (it.doneAt ? new Date(it.doneAt).toLocaleTimeString((PCD.i18n && PCD.i18n.currentLocale) || 'en', { hour: '2-digit', minute: '2-digit' }) : '') : '__:__') + '</td>' +
        '</tr>';
      }
      let main;
      if (o.columns > 1) {
        const per = Math.ceil(items.length / o.columns);
        let parts = '';
        for (let c = 0; c < o.columns; c++) {
          const sub = items.slice(c * per, (c + 1) * per);
          if (!sub.length) continue;
          let rows = '';
          sub.forEach(function (it, k) { rows += rowHtml(it, c * per + k); });
          parts += '<table><tbody>' + rows + '</tbody></table>';
        }
        main = '<div class="ctrl-cols">' + parts + '</div>';
      } else {
        let rows = '';
        items.forEach(function (it, i) { rows += rowHtml(it, i); });
        main = '<table><thead><tr><th style="width:16px;">#</th><th>' + esc(L('chk_print_item', 'Item')) + '</th><th style="text-align:center;width:30px;">' + esc(L('chk_print_done', 'Done')) + '</th><th style="width:38px;text-align:center;">' + esc(L('chk_print_time', 'Time')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
      html += '<div class="h-row"><h1>' + esc(name) + '</h1><div class="sub">' + esc(L('chk_kind_control', 'Control')) + ' · ' + items.length + ' ' + esc(L('chk_items', 'items')) + '</div></div>' +
        metaHtml() + main + signoffHtml();
    } else {
      // PREP — DISH / COMPONENT / PREP, multi-column cards (matches the photo intent)
      html += '.legend { font-size:' + pt(7.5) + '; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; font-weight:700; }' +
        '.cols { column-count: ' + o.columns + '; column-gap: 6mm; }' +
        '.dish { break-inside: avoid; border:1px solid #d8d8d8; border-radius:4px; margin-bottom:6px; overflow:hidden; }' +
        '.dish-h { background:#eaf5ee; color:#15633e; font-weight:800; font-size:' + pt(9) + '; padding:' + pad(4) + ' ' + pad(7) + '; border-bottom:1px solid #d8d8d8; }' +
        '.dish table { width:100%; border-collapse:collapse; }' +
        '.dish td { padding:' + pad(3) + ' ' + pad(7) + '; border-bottom:1px solid #eee; font-size:' + pt(8.5) + '; vertical-align:middle; }' +
        '.dish td.comp { color:#222; font-weight:' + (o.bold ? 700 : 400) + '; }' +
        '.dish td.prep { width:60px; text-align:center; }' +
        '.box { display:inline-block;width:12px;height:12px;border:1.5px solid #999;border-radius:2px; }' +
        '</style>';
      const dishes = filled ? (session.dishes || []) : (tpl.dishes || []);
      let blocks = '';
      dishes.forEach(function (d) {
        let r = '';
        (d.comps || []).forEach(function (c) {
          let prep;
          if (filled) prep = (c.done ? '<span style="color:#16a34a;font-weight:700;">✓</span> ' : '') + esc(c.note || '');
          else prep = '<span class="box"></span>';
          r += '<tr><td class="comp">' + esc(c.text) + '</td><td class="prep">' + (prep || '&nbsp;') + '</td></tr>';
        });
        if (!r) r = '<tr><td class="comp" style="color:#bbb;">—</td><td class="prep">&nbsp;</td></tr>';
        blocks += '<div class="dish"><div class="dish-h">' + esc(d.text || '') + '</div><table>' + r + '</table></div>';
      });
      html += '<div class="h-row"><h1>' + esc(name) + '</h1><div class="sub">' + esc(L('chk_kind_prep', 'Prep')) + ' · ' + dishes.length + ' ' + esc(L('chk_dishes', 'dishes')) + '</div></div>' +
        metaHtml() +
        '<div class="legend">' + esc(L('chk_col_dish', 'Dish')) + ' · ' + esc(L('chk_col_component', 'Component')) + ' · ' + esc(L('chk_col_prep', 'Prep')) + '</div>' +
        '<div class="cols">' + blocks + '</div>' +
        signoffHtml();
    }

    function metaHtml() {
      return '<div class="h-meta">' +
        '<div class="h-meta-item"><span class="lbl">' + esc(L('chk_print_date', 'Date')) + '</span><span class="val">' + dateVal + '</span></div>' +
        '<div class="h-meta-item"><span class="lbl">' + esc(L('chk_print_shift', 'Shift')) + '</span><span class="val">&nbsp;</span></div>' +
        '<div class="h-meta-item"><span class="lbl">' + esc(L('chk_print_by', 'By')) + '</span><span class="val">' + byVal + '</span></div>' +
      '</div>';
    }
    function signoffHtml() {
      return '<div class="h-signoff">' +
        '<div class="sig"><span class="sig-l">' + esc(L('chk_print_performed', 'Performed by')) + '</span><span class="sig-line">' + (filled ? esc(session.completedBy || '') : '&nbsp;') + '</span></div>' +
        '<div class="sig"><span class="sig-l">' + esc(L('chk_print_verified', 'Verified by')) + '</span><span class="sig-line">&nbsp;</span></div>' +
      '</div>';
    }

    return html;
  }

  function printChecklist(tpl, session) {
    const name = (tpl && tpl.name) || (session && session.templateName) || L('chk_print_default', 'Checklist');
    PCD.print(buildChecklistHtml(tpl, session), name + (session ? ' — ' + PCD.fmtDate(session.completedAt || session.startedAt, { month: 'short', day: 'numeric' }) : ' — ' + L('chk_blank', 'blank')));
  }

  // ============ SHARE (light: PDF + text) ============
  function buildShareText(s) {
    const lines = [s.templateName || 'Checklist', new Date(s.startedAt).toLocaleDateString(), ''];
    if (s.kind === 'prep') {
      (s.dishes || []).forEach(function (d) {
        lines.push('— ' + (d.text || ''));
        (d.comps || []).forEach(function (c) { lines.push('  ' + (c.done ? '☑' : '☐') + ' ' + c.text + (c.note ? '  → ' + c.note : '')); });
      });
    } else {
      (s.items || []).forEach(function (it) { lines.push((it.done ? '☑' : '☐') + ' ' + it.text + (it.comment ? '  📝 ' + it.comment : '')); });
    }
    return lines.join('\n');
  }
  function shareSession(s) {
    if (!s) return;
    const tpl = PCD.store.getFromTable('checklistTemplates', s.templateId);
    const title = s.templateName || 'Checklist';
    const text = buildShareText(s);
    const body = PCD.el('div');
    body.innerHTML =
      '<div style="padding:14px;background:var(--brand-50);border-radius:var(--r-md);margin-bottom:14px;">' +
        '<div style="font-weight:700;color:var(--brand-700);margin-bottom:6px;">📄 ' + esc(L('chk_share_pdf_title', 'Recommended: PDF')) + '</div>' +
        '<div class="text-muted text-sm" style="margin-bottom:10px;">' + esc(L('chk_share_pdf_msg', 'Save as PDF for proper records, then share the file.')) + '</div>' +
        '<button class="btn btn-primary" id="shPdf" style="width:100%;">' + PCD.icon('print', 16) + ' <span>' + esc(L('chk_share_save_pdf', 'Save as PDF')) + '</span></button>' +
      '</div>' +
      '<div class="field"><label class="field-label">' + esc(L('chk_share_text', 'Or share as text')) + '</label>' +
      '<textarea class="textarea" id="shTxt" rows="6" style="font-family:var(--font-mono);font-size:13px;">' + esc(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">' +
        '<button class="btn btn-outline btn-sm" id="shWa" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;"><div style="color:#25D366;">' + PCD.icon('message-circle', 18) + '</div><div style="font-weight:600;font-size:11px;">WhatsApp</div></button>' +
        '<button class="btn btn-outline btn-sm" id="shMail" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;"><div style="color:#EA4335;">' + PCD.icon('mail', 18) + '</div><div style="font-weight:600;font-size:11px;">Email</div></button>' +
        '<button class="btn btn-outline btn-sm" id="shCopy" style="flex-direction:column;height:auto;padding:10px 4px;gap:4px;"><div style="color:var(--brand-600);">' + PCD.icon('copy', 18) + '</div><div style="font-weight:600;font-size:11px;">' + esc(L('copy', 'Copy')) + '</div></button>' +
      '</div>';
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: L('btn_share', 'Share') + ' · ' + title, body: body, footer: footer, size: 'md', closable: true });
    function getText() { return PCD.$('#shTxt', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#shPdf', body).addEventListener('click', function () { m.close(); setTimeout(function () { printChecklist(tpl, s); }, 250); });
    PCD.$('#shWa', body).addEventListener('click', function () { window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank'); m.close(); });
    PCD.$('#shMail', body).addEventListener('click', function () { window.location.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(getText()); m.close(); });
    PCD.$('#shCopy', body).addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(getText()).then(function () { PCD.toast.success(L('toast_copied', 'Copied')); m.close(); }); });
  }

  // ============ TEMPLATE EDITOR ============
  function openEditor(tid, kindHint) {
    const existing = tid ? PCD.store.getFromTable('checklistTemplates', tid) : null;
    if (!existing && PCD.gate) {
      if (!PCD.gate.requireAuth()) return;
      if (!PCD.gate.canCreate('checklists', (PCD.store.listTable('checklistTemplates') || []).length)) { PCD.gate.showUpgradeModal({ feature: 'checklists', message: PCD.i18n.t('gate_create_limit') }); return; }
    }
    if (existing) normalizeTemplate(existing);
    const data = existing ? PCD.clone(existing) : {
      name: '', kind: (kindHint === 'prep' ? 'prep' : 'control'),
      icon: (kindHint === 'prep' ? 'chef-hat' : 'check-square'),
      items: [], dishes: [],
    };
    if (data.kind !== 'prep') { if (!Array.isArray(data.items)) data.items = []; if (!data.items.length) data.items.push({ id: uid('it'), text: '', cat: '' }); }
    else { if (!Array.isArray(data.dishes)) data.dishes = []; }
    if (!data.printOpts || typeof data.printOpts !== 'object') data.printOpts = {};

    const body = PCD.el('div');

    function render2() {
      let html =
        '<div class="field"><label class="field-label">' + esc(L('chk_name', 'List name')) + ' *</label>' +
        '<input type="text" class="input" id="tplName" value="' + esc(data.name || '') + '" placeholder="' + esc(data.kind === 'prep' ? L('chk_name_ph_prep', 'e.g. Daily Prep') : L('chk_name_ph_control', 'e.g. Closing & Safety')) + '"></div>';

      // Kind toggle (only when creating, or when no content yet)
      const lockKind = !!existing;
      html += '<div class="field"><label class="field-label">' + esc(L('chk_kind', 'Kind')) + '</label>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="btn btn-sm ' + (data.kind === 'control' ? 'btn-primary' : 'btn-outline') + '" data-setkind="control" ' + (lockKind ? 'disabled style="flex:1;opacity:' + (data.kind === 'control' ? '1' : '0.4') + ';"' : 'style="flex:1;"') + '>' + PCD.icon('check-square', 14) + ' ' + esc(L('chk_kind_control', 'Control')) + '</button>' +
          '<button type="button" class="btn btn-sm ' + (data.kind === 'prep' ? 'btn-primary' : 'btn-outline') + '" data-setkind="prep" ' + (lockKind ? 'disabled style="flex:1;opacity:' + (data.kind === 'prep' ? '1' : '0.4') + ';"' : 'style="flex:1;"') + '>' + PCD.icon('chef-hat', 14) + ' ' + esc(L('chk_kind_prep', 'Prep')) + '</button>' +
        '</div>' +
        (lockKind ? '' : '<div class="text-muted text-sm mt-1" style="font-size:12px;">' + esc(L('chk_kind_hint', 'Control = tick-and-confirm. Prep = dishes with components.')) + '</div>') +
      '</div>';

      if (data.kind === 'prep') {
        html += '<div class="field"><label class="field-label">' + esc(L('chk_dishes', 'dishes')) + '</label>' +
          '<div id="dishList" class="flex flex-col gap-2"></div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;">' +
            '<button class="btn btn-outline btn-sm" id="addFromMenu" style="flex:1;">' + PCD.icon('book-open', 14) + ' ' + esc(L('chk_add_from_menu', 'Add from menu')) + '</button>' +
            '<button class="btn btn-ghost btn-sm" id="addDish" style="flex:1;">' + PCD.icon('plus', 14) + ' ' + esc(L('chk_add_dish', 'Add dish')) + '</button>' +
          '</div>' +
        '</div>';
      } else {
        html += '<div class="field"><label class="field-label">' + esc(L('chk_items', 'items')) + '</label>' +
          '<div id="itemList" class="flex flex-col gap-2"></div>' +
          '<button class="btn btn-ghost btn-sm mt-2" id="addItem">' + PCD.icon('plus', 14) + ' ' + esc(L('chk_add_item', 'Add item')) + '</button>' +
        '</div>';
      }

      html += printLayoutHtml();

      body.innerHTML = html;

      // kind toggle
      if (!lockKind) {
        body.querySelectorAll('[data-setkind]').forEach(function (b) {
          b.addEventListener('click', function () {
            const k = this.getAttribute('data-setkind');
            if (k === data.kind) return;
            data.kind = k;
            data.icon = (k === 'prep') ? 'chef-hat' : 'check-square';
            if (k === 'control' && !data.items.length) data.items.push({ id: uid('it'), text: '', cat: '' });
            render2();
          });
        });
      }

      PCD.$('#tplName', body).addEventListener('input', function () { data.name = this.value; });

      if (data.kind === 'prep') renderDishes();
      else renderItems();
      wirePrintLayout();
      refreshPreview();
    }

    // ---- Print layout panel (orientation / columns / font / density / bold) ----
    function printLayoutHtml() {
      const o = normalizePrintOpts(data.printOpts, data.kind === 'prep');
      function seg(name, val, cur, label) {
        return '<button type="button" class="btn btn-sm ' + (String(cur) === String(val) ? 'btn-primary' : 'btn-outline') + '" data-pl="' + name + ':' + val + '" style="flex:1;padding:6px 4px;">' + esc(label) + '</button>';
      }
      function lbl(s) { return '<div class="text-muted" style="font-size:11px;margin:6px 0 3px;">' + esc(s) + '</div>'; }
      return '<div class="field" style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;">' +
        '<label class="field-label">' + PCD.icon('print', 14) + ' ' + esc(L('chk_print_layout', 'Print layout')) + '</label>' +
        lbl(L('chk_pl_orient', 'Orientation')) +
        '<div style="display:flex;gap:6px;">' + seg('orientation', 'portrait', o.orientation, L('chk_pl_portrait', 'Portrait')) + seg('orientation', 'landscape', o.orientation, L('chk_pl_landscape', 'Landscape')) + '</div>' +
        lbl(L('chk_pl_columns', 'Columns')) +
        '<div style="display:flex;gap:6px;">' + seg('columns', '1', o.columns, '1') + seg('columns', '2', o.columns, '2') + seg('columns', '3', o.columns, '3') + '</div>' +
        lbl(L('chk_pl_font', 'Text size')) +
        '<div style="display:flex;gap:6px;">' + seg('fontScale', '0.85', o.fontScale, 'S') + seg('fontScale', '1', o.fontScale, 'M') + seg('fontScale', '1.15', o.fontScale, 'L') + seg('fontScale', '1.3', o.fontScale, 'XL') + '</div>' +
        lbl(L('chk_pl_density', 'Spacing')) +
        '<div style="display:flex;gap:6px;">' + seg('density', 'compact', o.density, L('chk_pl_compact', 'Compact')) + seg('density', 'normal', o.density, L('chk_pl_normal', 'Normal')) + seg('density', 'relaxed', o.density, L('chk_pl_relaxed', 'Relaxed')) + '</div>' +
        '<div style="margin-top:8px;"><button type="button" class="btn btn-sm ' + (o.bold ? 'btn-primary' : 'btn-outline') + '" data-pl="bold:toggle" style="width:100%;">' + esc(L('chk_pl_bold', 'Bold text')) + (o.bold ? ' ✓' : '') + '</button></div>' +
        '<div id="plCapacity" style="font-size:12px;padding:8px 10px;border-radius:6px;margin-top:10px;line-height:1.4;"></div>' +
        '<div class="text-muted" style="font-size:11px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:0.04em;">' + esc(L('chk_live_preview', 'Live preview')) + '</div>' +
        '<div id="chkPreview" style="max-height:380px;overflow:auto;border-radius:6px;background:var(--surface-2);padding:6px;"></div>' +
        '<button type="button" class="btn btn-outline btn-sm" id="plPreview" style="width:100%;margin-top:8px;">' + PCD.icon('print', 14) + ' ' + esc(L('chk_print_blank', 'Print blank')) + '</button>' +
      '</div>';
    }
    function wirePrintLayout() {
      body.querySelectorAll('[data-pl]').forEach(function (b) {
        b.addEventListener('click', function () {
          const parts = this.getAttribute('data-pl').split(':');
          const key = parts[0], val = parts[1];
          data.printOpts = data.printOpts || {};
          if (key === 'bold') data.printOpts.bold = !data.printOpts.bold;
          else if (key === 'columns') data.printOpts.columns = parseInt(val, 10);
          else if (key === 'fontScale') data.printOpts.fontScale = parseFloat(val);
          else data.printOpts[key] = val;
          render2();
        });
      });
      const pv = PCD.$('#plPreview', body);
      if (pv) pv.addEventListener('click', function () {
        const ni = PCD.$('#tplName', body); if (ni) data.name = ni.value;
        if (!data.name.trim()) data.name = L('chk_print_default', 'Checklist');
        printChecklist(data, null);
      });
      updateCapacity();
    }
    function updateCapacity() {
      const el = PCD.$('#plCapacity', body);
      if (!el) return;
      const cap = printCapacity(data.kind, data.printOpts);
      let count;
      if (data.kind === 'prep') { count = 0; (data.dishes || []).forEach(function (d) { count += (d.comps || []).filter(function (c) { return c.text && c.text.trim(); }).length; }); }
      else count = (data.items || []).filter(function (it) { return it.text && it.text.trim(); }).length;
      const unit = data.kind === 'prep' ? L('chk_components', 'components') : L('chk_items', 'items');
      const pages = Math.max(1, Math.ceil(count / cap));
      if (pages <= 1) {
        el.style.background = 'var(--brand-50)'; el.style.color = 'var(--brand-700)';
        el.innerHTML = '✓ ' + esc(L('chk_fits_one', 'Fits one page')) + ' · ' + esc(L('chk_approx', '≈')) + cap + ' ' + esc(unit) + '/' + esc(L('chk_page', 'page'));
      } else {
        el.style.background = '#fef3c7'; el.style.color = '#92400e';
        el.innerHTML = '⚠ ' + esc(L('chk_spills', '≈{n} pages').replace('{n}', pages)) + ' · ' + count + ' ' + esc(unit) + ' / ≈' + cap + ' ' + esc(L('chk_per_page', 'per page'));
      }
    }

    // v2.23 — Canlı A4 baskı önizlemesi (baskı motorunu iframe içinde izole render)
    function refreshPreview() {
      const box = PCD.$('#chkPreview', body);
      if (!box) return;
      const o = normalizePrintOpts(data.printOpts, data.kind === 'prep');
      const land = o.orientation === 'landscape';
      const MM = 3.7795;
      const pageW = (land ? 297 : 210) * MM, pageH = (land ? 210 : 297) * MM;
      let frame = box.querySelector('iframe');
      let outer = box.querySelector('.chk-pv-outer');
      if (!frame) {
        box.innerHTML = '<div class="chk-pv-outer" style="position:relative;overflow:hidden;margin:0 auto;border:1px solid var(--border);border-radius:4px;background:#fff;"><iframe class="chk-pv-frame" style="border:0;transform-origin:top left;background:#fff;"></iframe></div>';
        frame = box.querySelector('iframe'); outer = box.querySelector('.chk-pv-outer');
      }
      frame.style.width = pageW + 'px'; frame.style.height = pageH + 'px';
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;">' + buildChecklistHtml(data, null) + '</body></html>';
      (function fit() {
        const w = box.clientWidth; if (!w) { requestAnimationFrame(fit); return; }
        const k = Math.min(1, (w - 14) / pageW);
        frame.style.transform = 'scale(' + k + ')';
        outer.style.width = Math.round(pageW * k) + 'px';
        outer.style.height = Math.round(pageH * k) + 'px';
      })();
    }

    function renderItems() {
      const wrap = PCD.$('#itemList', body);
      wrap.innerHTML = '';
      data.items.forEach(function (it, idx) {
        const r = PCD.el('div', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' } });
        r.innerHTML =
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<button type="button" class="drag-handle" title="' + esc(L('reorder', 'Reorder')) + '" style="cursor:grab;background:transparent;border:0;padding:4px 2px;color:var(--text-3);touch-action:none;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></button>' +
            '<span style="color:var(--text-3);font-size:12px;width:22px;text-align:right;font-weight:700;">' + (idx + 1) + '</span>' +
            '<input type="text" class="input" data-it="' + it.id + '" value="' + esc(it.text || '') + '" placeholder="' + esc(L('chk_item_ph', 'Task description')) + '" style="flex:1;">' +
            '<select class="select" data-ic="' + it.id + '" style="width:120px;font-size:12px;flex-shrink:0;"><option value="">' + esc(L('chk_no_cat', '—')) + '</option>' +
              CATS.map(function (c) { return '<option value="' + c.id + '"' + (it.cat === c.id ? ' selected' : '') + '>' + esc(catLabel(c)) + '</option>'; }).join('') +
            '</select>' +
            '<button class="icon-btn" data-idel="' + it.id + '">' + PCD.icon('x', 16) + '</button>' +
          '</div>';
        wrap.appendChild(r);
      });
      wrap.querySelectorAll('[data-it]').forEach(function (inp) { inp.addEventListener('input', function () { const it = data.items.find(function (x) { return x.id === inp.getAttribute('data-it'); }); if (it) it.text = inp.value; }); });
      wrap.querySelectorAll('[data-ic]').forEach(function (sel) { sel.addEventListener('change', function () { const it = data.items.find(function (x) { return x.id === sel.getAttribute('data-ic'); }); if (it) it.cat = sel.value; }); });
      wrap.querySelectorAll('[data-idel]').forEach(function (b) { b.addEventListener('click', function () { data.items = data.items.filter(function (x) { return x.id !== b.getAttribute('data-idel'); }); renderItems(); }); });
      if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
        if (renderItems._s && renderItems._s.destroy) renderItems._s.destroy();
        renderItems._s = PCD.dragdrop.makeSortable(wrap, { handle: '.drag-handle', onEnd: function (o, n) { if (o === n) return; const m = data.items.splice(o, 1)[0]; data.items.splice(n, 0, m); renderItems(); } });
      }
      const add = PCD.$('#addItem', body);
      if (add) add.onclick = function () { data.items.push({ id: uid('it'), text: '', cat: '' }); renderItems(); setTimeout(function () { const all = wrap.querySelectorAll('[data-it]'); if (all.length) all[all.length - 1].focus(); }, 20); };
    }

    function renderDishes() {
      const wrap = PCD.$('#dishList', body);
      wrap.innerHTML = '';
      if (!data.dishes.length) {
        wrap.innerHTML = '<div class="text-muted text-sm" style="padding:18px;text-align:center;border:1.5px dashed var(--border);border-radius:var(--r-sm);">' + esc(L('chk_prep_empty', 'No dishes yet — add from your menu or by hand.')) + '</div>';
      }
      data.dishes.forEach(function (d) {
        const card = PCD.el('div', { style: { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', padding: '10px' } });
        let comps = '';
        (d.comps || []).forEach(function (c) {
          comps += '<div style="display:flex;gap:6px;align-items:center;margin-top:5px;">' +
            '<span style="color:var(--text-3);">•</span>' +
            '<input type="text" class="input" data-cc="' + c.id + '" value="' + esc(c.text || '') + '" placeholder="' + esc(L('chk_component_ph', 'Component')) + '" style="flex:1;font-size:13px;">' +
            '<button class="icon-btn" data-cdel="' + c.id + '">' + PCD.icon('x', 14) + '</button>' +
          '</div>';
        });
        card.innerHTML =
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<button type="button" class="drag-handle" title="' + esc(L('reorder', 'Reorder')) + '" style="cursor:grab;background:transparent;border:0;padding:4px 2px;color:var(--text-3);touch-action:none;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></button>' +
            '<span style="color:var(--brand-700);flex-shrink:0;">' + PCD.icon('chef-hat', 15) + '</span>' +
            '<input type="text" class="input" data-dd="' + d.id + '" value="' + esc(d.text || '') + '" placeholder="' + esc(L('chk_dish_ph', 'Dish name')) + '" style="flex:1;font-weight:600;">' +
            '<button class="icon-btn" data-ddel="' + d.id + '" title="' + esc(L('act_delete', 'Delete')) + '">' + PCD.icon('trash', 15) + '</button>' +
          '</div>' +
          '<div style="padding-left:24px;">' + comps + '</div>' +
          '<button class="btn btn-ghost btn-sm" data-caddto="' + d.id + '" style="margin-top:6px;margin-left:24px;font-size:12px;">' + PCD.icon('plus', 13) + ' ' + esc(L('chk_add_component', 'Add component')) + '</button>';
        wrap.appendChild(card);
      });
      wrap.querySelectorAll('[data-dd]').forEach(function (inp) { inp.addEventListener('input', function () { const d = data.dishes.find(function (x) { return x.id === inp.getAttribute('data-dd'); }); if (d) d.text = inp.value; }); });
      wrap.querySelectorAll('[data-cc]').forEach(function (inp) { inp.addEventListener('input', function () { const c = findComp(inp.getAttribute('data-cc')); if (c) c.text = inp.value; }); });
      wrap.querySelectorAll('[data-ddel]').forEach(function (b) { b.addEventListener('click', function () { data.dishes = data.dishes.filter(function (x) { return x.id !== b.getAttribute('data-ddel'); }); renderDishes(); }); });
      wrap.querySelectorAll('[data-cdel]').forEach(function (b) { b.addEventListener('click', function () { const id = b.getAttribute('data-cdel'); data.dishes.forEach(function (d) { d.comps = (d.comps || []).filter(function (c) { return c.id !== id; }); }); renderDishes(); }); });
      wrap.querySelectorAll('[data-caddto]').forEach(function (b) { b.addEventListener('click', function () { const d = data.dishes.find(function (x) { return x.id === b.getAttribute('data-caddto'); }); if (d) { d.comps = d.comps || []; d.comps.push({ id: uid('comp'), text: '' }); renderDishes(); } }); });
      if (PCD.dragdrop && PCD.dragdrop.makeSortable) {
        if (renderDishes._s && renderDishes._s.destroy) renderDishes._s.destroy();
        renderDishes._s = PCD.dragdrop.makeSortable(wrap, { handle: '.drag-handle', onEnd: function (o, n) { if (o === n) return; const m = data.dishes.splice(o, 1)[0]; data.dishes.splice(n, 0, m); renderDishes(); } });
      }
      const addM = PCD.$('#addFromMenu', body);
      if (addM) addM.onclick = function () { openMenuPicker(function (recipes) {
        const maps = buildMaps();
        recipes.forEach(function (r) { data.dishes.push(dishGroupFromRecipe(r, maps)); });
        renderDishes();
      }); };
      const addD = PCD.$('#addDish', body);
      if (addD) addD.onclick = function () { data.dishes.push({ id: uid('dish'), text: '', comps: [{ id: uid('comp'), text: '' }] }); renderDishes(); };
    }
    function findComp(id) { let f = null; data.dishes.forEach(function (d) { (d.comps || []).forEach(function (c) { if (c.id === id) f = c; }); }); return f; }

    // Metin düzenlemeleri canlı önizlemeyi güncellesin (body render2 boyunca sabit kalır)
    body.addEventListener('input', PCD.debounce(function () { refreshPreview(); }, 400));
    render2();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: L('save', 'Save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('cancel', 'Cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    const m = PCD.modal.open({ title: existing ? (existing.name || L('chk_edit', 'Edit list')) : L('chk_new', 'New list'), body: body, footer: footer, size: 'md', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      const ni = PCD.$('#tplName', body); if (ni) data.name = ni.value;
      // v2.12.4 — Read every field straight from the DOM at save time. Relying
      // only on 'input' events left the data model stale in some cases
      // (autofill / IME / paste / quick edits) → "add at least one item" even
      // though rows were clearly filled on screen. This re-sync makes save
      // match exactly what the chef sees.
      body.querySelectorAll('[data-it]').forEach(function (inp) { const it = (data.items || []).find(function (x) { return x.id === inp.getAttribute('data-it'); }); if (it) it.text = inp.value; });
      body.querySelectorAll('[data-ic]').forEach(function (sel) { const it = (data.items || []).find(function (x) { return x.id === sel.getAttribute('data-ic'); }); if (it) it.cat = sel.value; });
      body.querySelectorAll('[data-dd]').forEach(function (inp) { const d = (data.dishes || []).find(function (x) { return x.id === inp.getAttribute('data-dd'); }); if (d) d.text = inp.value; });
      body.querySelectorAll('[data-cc]').forEach(function (inp) { const id = inp.getAttribute('data-cc'); (data.dishes || []).forEach(function (d) { (d.comps || []).forEach(function (c) { if (c.id === id) c.text = inp.value; }); }); });
      data.name = (data.name || '').trim();
      if (!data.name) { PCD.toast.error(L('toast_name_required', 'Name is required')); return; }
      if (data.kind === 'prep') {
        data.dishes = (data.dishes || []).map(function (d) { d.text = (d.text || '').trim(); d.comps = (d.comps || []).filter(function (c) { return c.text && c.text.trim(); }); return d; }).filter(function (d) { return d.text || (d.comps && d.comps.length); });
        if (!data.dishes.length) { PCD.toast.error(L('chk_need_dish', 'Add at least one dish')); return; }
        delete data.items;
      } else {
        data.items = (data.items || []).filter(function (it) { return it.text && it.text.trim(); });
        if (!data.items.length) { PCD.toast.error(L('toast_add_at_least_one_item', 'Add at least one item')); return; }
        delete data.dishes;
      }
      if (existing) data.id = existing.id;
      else data.sortIndex = listTemplates().length;
      PCD.store.upsertInTable('checklistTemplates', data, 'tpl');
      PCD.toast.success(L('saved', 'Saved'));
      m.close(); refreshMain();
    });
  }

  // ============ MENU PICKER (prep auto-fill) ============
  function openMenuPicker(onPick) {
    const maps = buildMaps();
    const menus = listMenus();
    const dishes = listDishRecipes(maps);
    const selected = {};
    const body = PCD.el('div');

    if (!dishes.length && !menus.length) {
      body.innerHTML = '<div class="text-muted" style="padding:30px 16px;text-align:center;line-height:1.6;">' +
        '<div style="font-size:30px;margin-bottom:8px;">🍽️</div>' +
        '<div style="font-weight:600;color:var(--text-1);margin-bottom:4px;">' + esc(L('chk_picker_empty_t', 'No recipes yet')) + '</div>' +
        '<div style="font-size:13px;">' + esc(L('chk_picker_empty_m', 'Add recipes or a menu first, then pull dishes in here.')) + '</div></div>';
      const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close'), style: { width: '100%' } });
      const footer = PCD.el('div', { style: { width: '100%' } }); footer.appendChild(closeBtn);
      const m0 = PCD.modal.open({ title: L('chk_add_from_menu', 'Add from menu'), body: body, footer: footer, size: 'md', closable: true });
      closeBtn.addEventListener('click', function () { m0.close(); });
      return;
    }

    function paint(filter) {
      const q = (filter || '').toLowerCase();
      let html = '';
      if (menus.length) {
        html += '<div class="text-muted text-sm" style="margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;font-size:11px;">' + esc(L('chk_picker_whole_menu', 'Import a whole menu')) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">';
        menus.forEach(function (mn) {
          const n = menuDishRecipes(mn, maps).length;
          html += '<button class="btn btn-outline btn-sm" data-menu="' + mn.id + '">' + PCD.icon('book-open', 13) + ' ' + esc(mn.name || L('menu', 'Menu')) + ' <span class="text-muted">(' + n + ')</span></button>';
        });
        html += '</div>';
      }
      html += '<div class="field" style="margin-bottom:8px;"><input type="text" class="input" id="dishSearch" value="' + esc(filter || '') + '" placeholder="' + esc(L('chk_picker_search', 'Search dishes...')) + '"></div>';
      const list = dishes.filter(function (r) { return !q || (r.name || '').toLowerCase().indexOf(q) >= 0; });
      html += '<div style="max-height:46vh;overflow:auto;">';
      if (!list.length) html += '<div class="text-muted text-sm" style="padding:18px;text-align:center;">' + esc(L('chk_picker_none', 'No matching dishes')) + '</div>';
      list.forEach(function (r) {
        const on = !!selected[r.id];
        const nc = componentsOfRecipe(r, maps).length;
        html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border);cursor:pointer;">' +
          '<input type="checkbox" data-pick="' + r.id + '"' + (on ? ' checked' : '') + ' style="width:18px;height:18px;flex-shrink:0;">' +
          '<span style="flex:1;min-width:0;font-size:14px;font-weight:500;">' + esc(r.name || '') + '</span>' +
          '<span class="text-muted text-sm">' + nc + ' ' + esc(L('chk_components', 'components')) + '</span>' +
        '</label>';
      });
      html += '</div>';
      body.innerHTML = html;

      const ds = PCD.$('#dishSearch', body);
      if (ds) ds.addEventListener('input', function () { paint(this.value); setTimeout(function () { const e = PCD.$('#dishSearch', body); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }, 0); });
      body.querySelectorAll('[data-pick]').forEach(function (cb) { cb.addEventListener('change', function () { selected[this.getAttribute('data-pick')] = this.checked; updateCount(); }); });
      body.querySelectorAll('[data-menu]').forEach(function (b) { b.addEventListener('click', function () {
        const mn = menus.find(function (x) { return x.id === b.getAttribute('data-menu'); });
        if (!mn) return;
        const recs = menuDishRecipes(mn, maps);
        if (!recs.length) { PCD.toast.info(L('chk_menu_no_dishes', 'This menu has no recipe dishes')); return; }
        onPick(recs); mAll.close();
      }); });
    }

    function selectedRecipes() { return dishes.filter(function (r) { return selected[r.id]; }); }
    function updateCount() { const n = selectedRecipes().length; importBtn.textContent = n ? (L('chk_import_n', 'Import') + ' (' + n + ')') : L('import', 'Import'); importBtn.disabled = !n; }

    paint('');
    const importBtn = PCD.el('button', { class: 'btn btn-primary', text: L('import', 'Import'), style: { flex: '1' } });
    importBtn.disabled = true;
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: L('close', 'Close') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn); footer.appendChild(importBtn);
    const mAll = PCD.modal.open({ title: L('chk_add_from_menu', 'Add from menu'), body: body, footer: footer, size: 'md', closable: true });
    closeBtn.addEventListener('click', function () { mAll.close(); });
    importBtn.addEventListener('click', function () { const recs = selectedRecipes(); if (!recs.length) return; onPick(recs); mAll.close(); });
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.checklist = { render: render, openEditor: openEditor };
})();
