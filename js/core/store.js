/* ================================================================
   ProChefDesk — store.js
   Central state store with localStorage persistence + pub/sub.
   All modules read/write through PCD.store.
   ================================================================ */

(function () {
  'use strict';

  const PCD = window.PCD;
  const LS_PREFIX = 'pcd_';
  const LS_KEY_STATE = LS_PREFIX + 'state';

  // v2.6.92 — Faz 4 Adım 4c: IDB-only writes + LS cleanup.
  // _idbWriteOnly: true ise persist/flushSync/trimAndPersist artık LS'ye yazmaz.
  // _migrationDone: tek seferlik LS cleanup'ı tekrar tetiklemeyi engeller.
  // Boot'ta load() içinde state.prefs.idbWriteOnly === true ise her ikisi de
  // true'ya set edilir. Aksi halde ilk başarılı IDB persist'inden sonra
  // migration tamamlanır.
  let _idbWriteOnly = false;
  let _migrationDone = false;

  // Default state shape — everything we persist
  const defaultState = {
    // user / plan
    user: null,                 // { id, email, name } when signed in; null = guest
    plan: 'free',              // 'free' | 'pro' | 'team'

    // preferences
    prefs: {
      currency: 'USD',
      locale: 'en',
      theme: 'light',          // 'light' | 'dark'
      haptic: true,
    },

    // onboarding flags
    onboarding: {
      mainTourDone: false,
      toolsSeen: {},           // { 'recipes': true, ... } per-tool tooltips
      demoSeeded: false,       // whether we've seeded the 3 demo recipes
    },

    // ---------- WORKSPACES (v2.2) ----------
    // Each workspace = a chef's job/concept (e.g. "La Bella · Italian a la carte · 2024-2025")
    // Holds its own recipes/menus/events/suppliers/inventory/waste/checklists/shoppingLists.
    // Ingredients library is shared across workspaces (an ingredient is an ingredient).
    workspaces: {},            // { wsId: { id, name, concept, role, city, periodStart, periodEnd, archived, color, icon, createdAt } }
    activeWorkspaceId: null,   // current workspace; null on first run -> auto-created
    _deletedWorkspaces: {},    // tombstones — { wsId: deletedAt } so cloud merge won't resurrect deleted ws

    // ---------- LIBRARY (workspace-agnostic) ----------
    ingredients: {},   // { id: { id, name, unit, pricePerUnit, supplier, category, priceHistory:[], yieldPercent } }
    costHistory: [],   // global price change log

    // ---------- WORKSPACE-BOUND ----------
    // Each table now has shape: { wsId: { id: {...}, ... } }
    recipes: {},
    menus: {},
    events: {},
    suppliers: {},
    inventory: {},     // { wsId: { ingredientId: { stock, parLevel, lastOrderDate } } }
    waste: {},         // { wsId: [...] }
    checklistTemplates: {},
    checklistSessions: {}, // { wsId: [...] }
    canvases: {},      // kitchen cards
    shoppingLists: {},
    stockCountHistory: {},  // { wsId: { snapshotId: { countedAt, countedBy, counts, itemCount } } }
    pendingStockCount: {}, // { wsId: {...} | null }

    // sync meta (not the data itself)
    _meta: {
      lastSyncAt: null,
      pendingChanges: 0,
      schemaVersion: 3,        // v2.6.62: schema migration runner introduced (v3 ensures updatedAt on all records)
    },
  };

  // ---------- SCHEMA MIGRATIONS (v2.6.62) ----------
  // Runs once per schema-version-jump on load. Each migration takes the
  // state object and returns the upgraded version. Migrations are
  // applied in order: v(fromV+1), v(fromV+2), ... v(CURRENT_SCHEMA_VERSION).
  // After all migrations run, _meta.schemaVersion is updated to current.
  //
  // To add a new migration:
  //   1. Bump CURRENT_SCHEMA_VERSION below
  //   2. Add a `migrations[N]` function that takes state and returns it
  //   3. Migrations should be IDEMPOTENT (running twice is safe)
  //   4. Don't break old data — migrations are one-way; downgrades aren't supported
  const CURRENT_SCHEMA_VERSION = 3;

  const migrations = {
    // v2 → v3 (added in v2.6.62):
    // Ensure every record in user-edited tables has an `updatedAt` field.
    // Without this, the v2.6.58 last-write-wins sync logic can't compare
    // timestamps and old records get overwritten unfairly. Idempotent —
    // records that already have updatedAt are left alone.
    3: function (state) {
      const TABLES = ['recipes','ingredients','menus','events','suppliers',
                      'canvases','shoppingLists','checklistTemplates','stockCountHistory'];
      TABLES.forEach(function (tbl) {
        const t = state[tbl];
        if (!t || typeof t !== 'object') return;
        Object.keys(t).forEach(function (wsId) {
          const wsScope = t[wsId];
          if (!wsScope || typeof wsScope !== 'object') return;
          // Walk records inside the wsId scope
          Object.keys(wsScope).forEach(function (recId) {
            const rec = wsScope[recId];
            if (!rec || typeof rec !== 'object') return;
            if (!rec.updatedAt) {
              // Use createdAt if available, else epoch (so it always loses to
              // records that DO have a real updatedAt — safer than 'now')
              rec.updatedAt = rec.createdAt || '1970-01-01T00:00:00.000Z';
            }
          });
        });
      });
      return state;
    },
  };

  function runMigrations(s) {
    if (!s || typeof s !== 'object') return s;
    const fromV = (s._meta && s._meta.schemaVersion) || 1;
    if (fromV >= CURRENT_SCHEMA_VERSION) return s;
    for (let v = fromV + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const fn = migrations[v];
      if (fn) {
        try {
          s = fn(s) || s;
          PCD.log && PCD.log('[migration] applied schema v' + v);
        } catch (e) {
          PCD.err && PCD.err('[migration] v' + v + ' failed', e);
          // Stop on error — don't bump schemaVersion past failed migration
          return s;
        }
      }
    }
    s._meta = s._meta || {};
    s._meta.schemaVersion = CURRENT_SCHEMA_VERSION;
    return s;
  }

  // ---------- WORKSPACE HELPERS ----------
  function currentWsId() {
    ensureActiveWorkspace();
    return state.activeWorkspaceId;
  }

  // Make sure there's at least one workspace and an active one selected.
  // Also: if data is in legacy (top-level) format, migrate it into a default workspace.
  function ensureActiveWorkspace() {
    // If schema is already v2 with workspaces, just verify active id
    if (state.workspaces && Object.keys(state.workspaces).length > 0) {
      if (!state.activeWorkspaceId || !state.workspaces[state.activeWorkspaceId]) {
        const first = Object.values(state.workspaces).filter(function (w) { return !w.archived; })[0]
                   || Object.values(state.workspaces)[0];
        state.activeWorkspaceId = first ? first.id : null;
      }
      return;
    }
    // Bootstrap: create default workspace
    const defaultWs = {
      id: PCD.uid('ws'),
      name: 'My Kitchen',
      concept: '',
      role: '',
      city: '',
      periodStart: null,
      periodEnd: null,
      archived: false,
      color: 'green',
      icon: 'chef-hat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.workspaces = { [defaultWs.id]: defaultWs };
    state.activeWorkspaceId = defaultWs.id;

    // Legacy migration — if any of the workspace-bound tables hold flat data
    // (i.e. ids at top level, not nested by wsId), move it under the new ws.
    // 'ingredients' was added to this list in v2.6.30 (per-workspace pricing).
    const wsBoundTables = ['recipes','ingredients','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','stockCountHistory','haccpLogs','haccpUnits','haccpReadings','haccpCookCool'];
    wsBoundTables.forEach(function (tbl) {
      const t = state[tbl];
      if (!t) return;
      // Heuristic: legacy shape has values that look like records (have id/name/etc)
      // OR is an array (waste was an array).
      if (Array.isArray(t)) {
        state[tbl] = { [defaultWs.id]: t.slice() };
        return;
      }
      const keys = Object.keys(t);
      if (keys.length === 0) {
        state[tbl] = {};
        return;
      }
      // If first value is itself an object containing 'id' or 'name' field → legacy flat
      const sample = t[keys[0]];
      const looksLikeRecord = sample && typeof sample === 'object' && (sample.id || sample.name || sample.text);
      const looksLikeWsScoped = sample && typeof sample === 'object' && !sample.id && !sample.name; // already wsId -> {recordId: rec}
      if (looksLikeRecord && !looksLikeWsScoped) {
        state[tbl] = { [defaultWs.id]: t };
      }
    });

    // pendingStockCount was a single object — move into workspace map
    if (state.pendingStockCount && typeof state.pendingStockCount === 'object' && !Array.isArray(state.pendingStockCount)) {
      const psc = state.pendingStockCount;
      // If has 'counts' key it's a single-record (legacy)
      if (psc.counts || psc.countedBy || psc.status) {
        state.pendingStockCount = { [defaultWs.id]: psc };
      } else if (Object.keys(psc).length === 0) {
        state.pendingStockCount = {};
      }
    }
  }

  // ---------- EVENT EMITTER ----------
  const listeners = {};
  function emit(key, value, prev) {
    const arr = listeners[key] || [];
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](value, prev); } catch (e) { PCD.err('listener', e); }
    }
    // wildcard "*" listeners
    const wild = listeners['*'] || [];
    for (let i = 0; i < wild.length; i++) {
      try { wild[i](key, value, prev); } catch (e) { PCD.err('wild listener', e); }
    }
  }

  function subscribe(key, fn) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(fn);
    return function unsubscribe() {
      listeners[key] = listeners[key].filter(function (l) { return l !== fn; });
    };
  }

  // ---------- STATE ----------
  let state = PCD.clone(defaultState);

  // v2.6.92 — Migration tamamlama helper'ı. Tek seferlik:
  // - state.prefs.idbWriteOnly = true (kalıcı flag)
  // - localStorage.removeItem(LS_KEY_STATE) (eski veri temizle)
  // - module-level _idbWriteOnly + _migrationDone set
  // Sonraki tüm persist/flushSync/trimAndPersist çağrıları LS'yi atlayacak.
  function _completeMigration() {
    if (_migrationDone) return;
    _migrationDone = true;
    try { localStorage.removeItem(LS_KEY_STATE); } catch (e) {}
    if (!state.prefs) state.prefs = {};
    state.prefs.idbWriteOnly = true;
    _idbWriteOnly = true;
    console.log('[store] migrated to IDB-only writes, LS cleared');
  }

  // v2.6.91 — Faz 4 Adım 4b: Okuma IDB-first.
  function _loadFromLs() {
    try {
      const raw = localStorage.getItem(LS_KEY_STATE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[store] LS load failed:', e && e.message);
      return null;
    }
  }
  function _loadFromIdb() {
    if (!PCD.idb || !PCD.idb.get) {
      return Promise.resolve(null);
    }
    return PCD.idb.get('state', 'main').then(function (data) {
      return data || null;
    }).catch(function (e) {
      console.warn('[store] IDB load failed:', e && e.message);
      return null;
    });
  }

  function load() {
    console.log('[store] load: start');
    return _loadFromIdb().then(function (idbState) {
      let parsed = idbState;
      let source = 'idb';
      if (!parsed) {
        parsed = _loadFromLs();
        source = 'ls';
      }
      console.log('[store] load: source=' + (parsed ? source : 'empty'));
      try {
        if (parsed) {
          state = deepMerge(PCD.clone(defaultState), parsed);
        }
      } catch (e) {
        console.warn('[store] deepMerge failed:', e && e.message);
        state = PCD.clone(defaultState);
      }
      // v2.6.92 — Migration flag boot zamanında oku. Set edilmişse
      // _idbWriteOnly aktif edilir; LS'de kalan veri varsa temizlenir.
      if (state.prefs && state.prefs.idbWriteOnly === true) {
        _idbWriteOnly = true;
        _migrationDone = true;
        try { localStorage.removeItem(LS_KEY_STATE); } catch (e) {}
        console.log('[store] LS write disabled (idbWriteOnly=true)');
      }
      // v2.6.62 — Run schema migrations BEFORE other normalization.
      state = runMigrations(state);
      // v2.6.35 — Lowercase ingredient units (CSV import normalization).
      if (state.ingredients && typeof state.ingredients === 'object') {
        Object.keys(state.ingredients).forEach(function (wsId) {
          const wsIngs = state.ingredients[wsId];
          if (!wsIngs || typeof wsIngs !== 'object') return;
          Object.keys(wsIngs).forEach(function (ingId) {
            const ing = wsIngs[ingId];
            if (ing && typeof ing.unit === 'string') {
              const lc = ing.unit.toLowerCase();
              if (lc !== ing.unit && (lc === 'l' || lc === 'kg' || lc === 'ml' || lc === 'g' || lc === 'pcs')) {
                ing.unit = lc;
              }
            }
          });
        });
      }
      console.log('[store] load: done');
    });
  }

  function deepMerge(target, source) {
    if (source === null || source === undefined) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(source).forEach(function (k) {
      const sv = source[k], tv = target ? target[k] : undefined;
      if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
        out[k] = deepMerge(tv, sv);
      } else {
        out[k] = sv;
      }
    });
    return out;
  }

  // v2.6.42 — Quota-exceeded modal flag. Without this, every subsequent
  // debounced persist() call after the first quota error would re-open
  // the modal, spamming the user.
  let _quotaModalOpen = false;

  // Trim helper — keep separate from persist() so the user-facing modal
  // can call it explicitly. Returns true if the trimmed state could be
  // persisted, false if storage is still full afterwards.
  function trimAndPersist() {
    const stateCopy = PCD.clone(state);
    if (stateCopy.ingredients) {
      // Walk both legacy flat shape and workspace-scoped shape.
      Object.keys(stateCopy.ingredients).forEach(function (k) {
        const v = stateCopy.ingredients[k];
        if (v && v.priceHistory && v.priceHistory.length > 5) {
          v.priceHistory = v.priceHistory.slice(-5);
        } else if (v && typeof v === 'object') {
          Object.keys(v).forEach(function (id) {
            const ing = v[id];
            if (ing && ing.priceHistory && ing.priceHistory.length > 5) {
              ing.priceHistory = ing.priceHistory.slice(-5);
            }
          });
        }
      });
    }
    if (Array.isArray(stateCopy.waste) && stateCopy.waste.length > 500) {
      stateCopy.waste = stateCopy.waste.slice(-500);
    }
    if (Array.isArray(stateCopy.costHistory) && stateCopy.costHistory.length > 500) {
      stateCopy.costHistory = stateCopy.costHistory.slice(-500);
    }
    if (Array.isArray(stateCopy.checklistSessions) && stateCopy.checklistSessions.length > 100) {
      stateCopy.checklistSessions = stateCopy.checklistSessions.slice(-100);
    }
    try {
      // v2.6.92 — IDB-only modunda LS'ye yazma. Geçiş öncesi her ikisine.
      if (!_idbWriteOnly) {
        localStorage.setItem(LS_KEY_STATE, JSON.stringify(stateCopy));
      }
      state = stateCopy;
      // v2.6.89 — IDB write-through (fire-and-forget).
      if (PCD.idb && PCD.idb.put) {
        PCD.idb.put('state', 'main', state).then(function () {
          if (!_migrationDone) _completeMigration();
        }).catch(function () {});
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Download a JSON backup of the entire current in-memory state. Used
  // when storage is full so the user can rescue their data before any
  // trimming happens.
  function downloadBackup() {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: (window.PCD_CONFIG && window.PCD_CONFIG.APP_VERSION) || '',
        reason: 'storage-full',
        data: state,
      };
      const json = JSON.stringify(payload, null, 2);
      const filename = 'prochefdesk-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      if (PCD.download) {
        PCD.download(json, filename, 'application/json');
      } else {
        // Defensive fallback (PCD.download should exist; defined in utils.js)
        const a = document.createElement('a');
        a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        a.download = filename;
        a.click();
      }
      return true;
    } catch (e) {
      PCD.err && PCD.err('downloadBackup failed', e);
      return false;
    }
  }

  // Show the quota modal. Three explicit choices, no silent data loss.
  function showQuotaModal() {
    if (!PCD.modal || !PCD.modal.open) {
      // No modal subsystem yet (very early boot) — fall back to toast.
      PCD.toast && PCD.toast.error(PCD.i18n.t('toast_storage_full_minimal'));
      return;
    }
    _quotaModalOpen = true;

    const t = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t : function (k, fb) { return fb || k; };

    const bodyHtml =
      '<div style="font-size:14px;line-height:1.6;color:var(--text-2);">' +
        '<p style="margin:0 0 12px;">' +
          t('quota_full_msg',
            'Your browser storage is full. The change you just made could not be saved to disk.') +
        '</p>' +
        '<p style="margin:0 0 12px;">' +
          t('quota_full_advice',
            'Download a backup first (recommended), then choose whether to free up space by trimming old history.') +
        '</p>' +
        '<div style="background:var(--surface-2);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--text-3);margin-top:14px;">' +
          t('quota_full_what_trimmed',
            'Trimming keeps the last 5 price changes per ingredient, last 500 waste/cost entries, and last 100 checklist sessions. Your recipes, menus, ingredients, and current data are NOT touched.') +
        '</div>' +
      '</div>';

    const downloadBtn = PCD.el('button', { class: 'btn btn-primary' });
    downloadBtn.innerHTML = '📥 ' + t('quota_btn_download', 'Download backup');

    const trimBtn = PCD.el('button', { class: 'btn btn-outline' });
    trimBtn.innerHTML = '🗑 ' + t('quota_btn_trim', 'Trim old history');

    const laterBtn = PCD.el('button', { class: 'btn btn-ghost' });
    laterBtn.textContent = t('quota_btn_later', 'Not now');

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(laterBtn);
    footer.appendChild(trimBtn);
    footer.appendChild(downloadBtn);

    const m = PCD.modal.open({
      title: '⚠️ ' + t('quota_full_title', 'Storage is full'),
      body: bodyHtml,
      footer: footer,
      size: 'md',
      closable: true,
      onClose: function () { _quotaModalOpen = false; },
    });

    downloadBtn.addEventListener('click', function () {
      const ok = downloadBackup();
      if (ok) {
        PCD.toast && PCD.toast.success(t('quota_downloaded', '✓ Backup downloaded'));
      } else {
        PCD.toast && PCD.toast.error(t('quota_download_failed', 'Backup download failed'));
      }
      // Don't auto-close — user might also want to trim now.
    });

    trimBtn.addEventListener('click', function () {
      // Confirm before destructive trim.
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'warning',
        title: t('quota_trim_confirm_title', 'Trim old history?'),
        text: t('quota_trim_confirm_text',
          'Old price history, waste/cost log entries, and checklist sessions will be removed. This cannot be undone. Recipes and ingredients are not affected.'),
        okText: t('quota_trim_confirm_ok', 'Yes, trim'),
        cancelText: t('cancel', 'Cancel'),
      }).then(function (ok) {
        if (!ok) return;
        const success = trimAndPersist();
        if (success) {
          PCD.toast && PCD.toast.success(t('quota_trimmed', '✓ Old history trimmed'));
          m.close();
        } else {
          PCD.toast && PCD.toast.error(t('quota_still_full',
            'Storage is still full after trimming. Please download backup and contact support.'));
        }
      });
    });

    laterBtn.addEventListener('click', function () { m.close(); });
  }

  // v2.6.43 — Helper: synchronous write of current state to localStorage,
  // bypassing the debounce. Used in workspace mutations and clearUserData
  // where we need the change persisted before a navigation/reload happens.
  // Centralizes 6 copy-pasted try/catch blocks across the file.
  function flushSync() {
    // v2.6.92 — IDB-only modunda LS atla.
    if (!_idbWriteOnly) {
      try {
        localStorage.setItem(LS_KEY_STATE, JSON.stringify(state));
      } catch (e) {
        PCD.err && PCD.err('flushSync fail', e);
        return Promise.resolve(false);
      }
    }
    // v2.6.89 — IDB write-through. v2.6.92 — Migration tetikle.
    // v2.6.93 — IDB put Promise'ini döndür → restore akışı await edebilir.
    // Eski sync caller'lar (set/upsert sonrası flushSync) Promise'i discard eder
    // çünkü dönüş değerini truthy boolean olarak değerlendiriyorlardı; Promise
    // truthy olduğundan davranış değişmedi.
    if (PCD.idb && PCD.idb.put) {
      return PCD.idb.put('state', 'main', state).then(function () {
        if (!_migrationDone) _completeMigration();
        return true;
      }).catch(function (e) {
        console.warn('[store] flushSync IDB write failed:', e && e.message);
        return false;
      });
    }
    return Promise.resolve(true);
  }

  // v2.6.69 — State-key (camelCase) → SQL table name (snake_case) eşleştirme.
  // Per-table sync hook'ları için kullanılıyor.
  // v2.6.72 — Faz 4 Adım 2: HACCP ve stockCountHistory mapping'leri eklendi.
  // (waste ve checklistSessions array yapıdadır, generic upsertInTable
  //  kullanmazlar — onlar için cloud-pertable.js'de queueArraySync API'si var.)
  function _stateKeyToSqlTable(stateKey) {
    const map = {
      'recipes': 'recipes',
      'ingredients': 'ingredients',
      'menus': 'menus',
      'events': 'events',
      'suppliers': 'suppliers',
      'canvases': 'canvases',
      'shoppingLists': 'shopping_lists',
      'checklistTemplates': 'checklist_templates',
      // v2.6.72 — yeni eşleştirmeler
      'stockCountHistory': 'stock_count_history',
      'haccpLogs': 'haccp_logs',
      'haccpUnits': 'haccp_units',
      'haccpReadings': 'haccp_readings',
      'haccpCookCool': 'haccp_cook_cool',
    };
    return map[stateKey] || null;
  }

  // v2.6.44 — Photo orphan check: walks ALL recipes (across every
  // workspace, including soft-deleted) and returns true if any recipe
  // OTHER than the excluded one still references this photo URL.
  // Used by upsertRecipe and purge paths to decide whether deleting
  // the blob from Supabase Storage is safe. Without this check,
  // duplicating a recipe (which copies the photo URL) would lead to
  // accidentally deleting the photo of the still-existing copy.
  function isPhotoStillUsed(photoUrl, excludeRecipeId) {
    if (!photoUrl) return false;
    // dataURL photos are never "in storage" so they have no shared blob
    if (typeof photoUrl === 'string' && photoUrl.indexOf('data:') === 0) return false;
    const all = state.recipes || {};
    const wsIds = Object.keys(all);
    for (let i = 0; i < wsIds.length; i++) {
      const wsRecipes = all[wsIds[i]] || {};
      const rids = Object.keys(wsRecipes);
      for (let j = 0; j < rids.length; j++) {
        const r = wsRecipes[rids[j]];
        if (!r) continue;
        if (excludeRecipeId && r.id === excludeRecipeId) continue;
        if (r.photo === photoUrl) return true;
      }
    }
    return false;
  }

  // ---------- PERSIST (debounced) ----------
  const persist = PCD.debounce(function () {
    let serialized;
    try {
      serialized = JSON.stringify(state);
    } catch (e) {
      PCD.err('Failed to serialize state:', e);
      return;
    }
    // v2.6.92 — IDB-only modunda LS yazma. Geçiş öncesi her ikisine.
    if (!_idbWriteOnly) {
      try {
        localStorage.setItem(LS_KEY_STATE, serialized);
      } catch (e) {
        PCD.err('Failed to persist state:', e);
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
          if (!_quotaModalOpen) {
            showQuotaModal();
          }
        }
      }
    }
    // v2.6.89 — IDB write-through. v2.6.92 — Migration tetikle.
    if (PCD.idb && PCD.idb.put) {
      PCD.idb.put('state', 'main', state).then(function () {
        if (!_migrationDone) _completeMigration();
      }).catch(function (e) {
        console.warn('[store] idb persist failed:', e && e.message);
      });
    }
    if (PCD.cloud && PCD.cloud.queueSync) PCD.cloud.queueSync();
  }, 400);

  // ---------- PATH HELPERS ----------
  function getByPath(path) {
    if (!path) return state;
    const parts = path.split('.');
    let obj = state;
    for (let i = 0; i < parts.length; i++) {
      if (obj === null || obj === undefined) return undefined;
      obj = obj[parts[i]];
    }
    return obj;
  }

  function setByPath(path, value) {
    const parts = path.split('.');
    let obj = state;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (typeof obj[k] !== 'object' || obj[k] === null) obj[k] = {};
      obj = obj[k];
    }
    const last = parts[parts.length - 1];
    const prev = obj[last];
    obj[last] = value;
    return prev;
  }

  // ---------- PUBLIC API ----------
  const store = {
    init: function () {
      return load().then(function () {
        console.log('[store] init: done');
      }).catch(function (e) {
        console.error('[store] init: failed:', e);
      });
    },

    // get('path.to.value') or get() for all state
    get: function (path) {
      return PCD.clone(getByPath(path));
    },
    // unsafe direct read (no clone) — use carefully
    _read: function (path) {
      return getByPath(path);
    },

    set: function (path, value) {
      const prev = setByPath(path, value);
      emit(path, value, prev);
      persist();
      return value;
    },

    // Update nested object by merging
    update: function (path, patch) {
      const cur = getByPath(path) || {};
      const next = Object.assign({}, cur, patch);
      return store.set(path, next);
    },

    // ---- Recipe helpers ----
    // ============ WORKSPACES API ============
    // Returns the active workspace id; if none, lazily creates a default one
    // and migrates legacy top-level data into it (one-time migration on load).
    getActiveWorkspaceId: function () {
      ensureActiveWorkspace();
      return state.activeWorkspaceId;
    },
    getActiveWorkspace: function () {
      ensureActiveWorkspace();
      return PCD.clone(state.workspaces[state.activeWorkspaceId]) || null;
    },
    setActiveWorkspaceId: function (wsId) {
      if (!state.workspaces[wsId]) return false;
      state.activeWorkspaceId = wsId;
      emit('activeWorkspaceId', wsId, null);
      // Immediate localStorage write (bypass debounce) so a reload right after won't lose this
      flushSync();
      persist();
      // v2.6.67 — Per-table sync (user_prefs holds activeWorkspaceId)
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('user_prefs', null, null, {
        activeWorkspaceId: wsId,
        prefs: state.prefs,
        plan: state.plan,
        onboarding: state.onboarding,
        costHistory: state.costHistory,
      });
      return true;
    },
    listWorkspaces: function (includeArchived) {
      ensureActiveWorkspace();
      const list = Object.values(PCD.clone(state.workspaces));
      return includeArchived ? list : list.filter(function (w) { return !w.archived; });
    },
    getWorkspace: function (wsId) {
      return PCD.clone(state.workspaces[wsId]) || null;
    },
    upsertWorkspace: function (ws) {
      if (!ws.id) ws.id = PCD.uid('ws');
      const now = new Date().toISOString();
      ws.updatedAt = now;
      if (!ws.createdAt) ws.createdAt = now;
      const next = Object.assign({}, state.workspaces);
      next[ws.id] = ws;
      state.workspaces = next;
      emit('workspaces', next, null);
      flushSync();
      persist();
      // v2.6.67 — Per-table sync
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('workspaces', ws.id, null, ws);
      return ws;
    },
    archiveWorkspace: function (wsId, archived) {
      const w = state.workspaces[wsId];
      if (!w) return false;
      const next = Object.assign({}, state.workspaces);
      next[wsId] = Object.assign({}, w, { archived: !!archived, updatedAt: new Date().toISOString() });
      state.workspaces = next;
      // If we just archived the active one, switch to another
      if (archived && state.activeWorkspaceId === wsId) {
        const alive = Object.values(state.workspaces).filter(function (x) { return !x.archived && x.id !== wsId; });
        state.activeWorkspaceId = alive[0] ? alive[0].id : null;
        ensureActiveWorkspace();
      }
      emit('workspaces', next, null);
      flushSync();
      persist();
      // v2.6.67 — Per-table sync
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('workspaces', wsId, null, next[wsId]);
      return true;
    },
    deleteWorkspace: function (wsId) {
      if (!state.workspaces[wsId]) return false;
      // Refuse if it's the only one
      const remaining = Object.keys(state.workspaces).filter(function (id) { return id !== wsId; });
      if (remaining.length === 0) return false;
      // v2.6.54 — Collect ALL photo URLs from this workspace's recipes
      // BEFORE wiping the data. After the wipe completes, delete each
      // orphaned blob from Storage (using isPhotoStillUsed to avoid
      // deleting URLs shared with other workspaces' duplicates).
      const _photosToDelete = [];
      const wsRecipes = (state.recipes && state.recipes[wsId]) || {};
      Object.keys(wsRecipes).forEach(function (rid) {
        const r = wsRecipes[rid];
        if (r && r.photo) _photosToDelete.push({ url: r.photo, recipeId: r.id });
      });
      const next = Object.assign({}, state.workspaces);
      delete next[wsId];
      state.workspaces = next;
      // Wipe workspace-bound data
      ['recipes','ingredients','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','pendingStockCount','stockCountHistory','haccpLogs','haccpUnits','haccpReadings','haccpCookCool'].forEach(function (tbl) {
        if (state[tbl] && state[tbl][wsId] !== undefined) {
          const t = Object.assign({}, state[tbl]);
          delete t[wsId];
          state[tbl] = t;
        }
      });
      if (state.activeWorkspaceId === wsId) {
        state.activeWorkspaceId = remaining[0];
      }
      // Mark as deleted in tombstones so cloud merge won't resurrect
      if (!state._deletedWorkspaces) state._deletedWorkspaces = {};
      state._deletedWorkspaces = Object.assign({}, state._deletedWorkspaces);
      const tombstoneAt = new Date().toISOString();
      state._deletedWorkspaces[wsId] = tombstoneAt;
      // v2.6.72 — Tombstone'u workspace_tombstones tablosuna da gönder.
      // Diğer cihazlar pull yapınca bu kaydı görüp silinen workspace'i
      // diriltmemiş olur.
      if (PCD.cloudPerTable) {
        PCD.cloudPerTable.queueUpsert('workspace_tombstones', wsId, null, { deletedAt: tombstoneAt });
      }
      emit('workspaces', next, null);
      flushSync();
      persist();
      // v2.6.54 — After state is wiped, clean up orphaned photo blobs.
      // isPhotoStillUsed walks the freshly-mutated state, so duplicated
      // recipes in OTHER workspaces still using the same URL are protected.
      // Best-effort, async, non-blocking — deletion failures are silent.
      if (_photosToDelete.length && PCD.photoStorage && PCD.photoStorage.deleteByUrl) {
        _photosToDelete.forEach(function (p) {
          if (!isPhotoStillUsed(p.url, p.recipeId)) {
            PCD.photoStorage.deleteByUrl(p.url);
          }
        });
      }
      return true;
    },

    // Copy a single recipe / menu / etc from one workspace into another
    copyToWorkspace: function (table, itemId, fromWsId, toWsId) {
      if (!state[table] || !state[table][fromWsId]) return null;
      const orig = state[table][fromWsId][itemId];
      if (!orig) return null;
      const copy = PCD.clone(orig);
      copy.id = PCD.uid(table.slice(0, 1));
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      // tag with origin
      copy._copiedFrom = { wsId: fromWsId, originalId: itemId };
      const next = Object.assign({}, state[table]);
      next[toWsId] = Object.assign({}, next[toWsId] || {});
      next[toWsId][copy.id] = copy;
      state[table] = next;
      emit(table, next, null);
      persist();
      return copy;
    },

    // ---- Recipe (workspace-scoped) ----
    upsertRecipe: function (recipe) {
      const wsId = currentWsId();
      if (!recipe.id) recipe.id = PCD.uid('r');
      const now = new Date().toISOString();
      recipe.updatedAt = now;
      if (!recipe.createdAt) recipe.createdAt = now;
      // v2.6.44 — Capture the previous photo URL BEFORE mutation so we
      // can clean up the old Storage blob if the user replaced the photo.
      // The check below runs after the upsert so the new state is what
      // isPhotoStillUsed sees.
      const _prevRecipe = (state.recipes[wsId] && state.recipes[wsId][recipe.id]) || null;
      const _prevPhoto = _prevRecipe && _prevRecipe.photo;
      const recipes = Object.assign({}, state.recipes);
      recipes[wsId] = Object.assign({}, recipes[wsId] || {});
      recipes[wsId][recipe.id] = recipe;
      state.recipes = recipes;
      emit('recipes', recipes[wsId], null);
      emit('recipes.' + recipe.id, recipe, null);
      persist();
      // v2.6.44 — Orphan blob cleanup. Best-effort, non-blocking. Skipped
      // when: (1) photo unchanged, (2) old photo is a dataURL or foreign
      // URL, (3) another recipe still references the URL (e.g. copied
      // recipe). Failures are silent to avoid blocking the save.
      if (_prevPhoto && _prevPhoto !== recipe.photo &&
          PCD.photoStorage && PCD.photoStorage.deleteByUrl) {
        if (!isPhotoStillUsed(_prevPhoto, recipe.id)) {
          PCD.photoStorage.deleteByUrl(_prevPhoto);
        }
      }
      // v2.6.67 — Per-table sync (paralel olarak yeni tablolara yaz)
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('recipes', recipe.id, wsId, recipe);
      return recipe;
    },
    // v2.6.65 — Low-level recipe upsert that BYPASSES photo cleanup,
    // version snapshots, and updatedAt bumps. Used by housekeeping
    // migrations (dataURL → Storage URL) where we don't want a state
    // change notification storm and don't want the photo cleanup logic
    // to misinterpret the URL change as a "photo replaced" event.
    //
    // Caller passes (wsId, recipe). The recipe must already have an id.
    upsertRecipeRaw: function (wsId, recipe) {
      if (!wsId || !recipe || !recipe.id) return null;
      const recipes = Object.assign({}, state.recipes);
      recipes[wsId] = Object.assign({}, recipes[wsId] || {});
      recipes[wsId][recipe.id] = recipe;
      state.recipes = recipes;
      // Persist without emitting recipes event — we don't want the live
      // recipe list to flicker and re-render N times during migration.
      persist();
      return recipe;
    },
    deleteRecipe: function (id) {
      const wsId = currentWsId();
      if (!state.recipes[wsId] || !state.recipes[wsId][id]) return false;
      const recipes = Object.assign({}, state.recipes);
      recipes[wsId] = Object.assign({}, recipes[wsId]);
      // Soft delete: set _deletedAt instead of removing
      recipes[wsId][id] = Object.assign({}, recipes[wsId][id], { _deletedAt: new Date().toISOString() });
      state.recipes = recipes;
      emit('recipes', recipes[wsId], null);
      persist();
      // v2.6.67 — Per-table sync (soft delete = upsert with deleted_at)
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('recipes', id, wsId, recipes[wsId][id]);
      return true;
    },
    deleteRecipes: function (ids) {
      const wsId = currentWsId();
      if (!ids || !ids.length || !state.recipes[wsId]) return 0;
      const recipes = Object.assign({}, state.recipes);
      recipes[wsId] = Object.assign({}, recipes[wsId]);
      const now = new Date().toISOString();
      let n = 0;
      ids.forEach(function (id) {
        if (recipes[wsId][id] && !recipes[wsId][id]._deletedAt) {
          recipes[wsId][id] = Object.assign({}, recipes[wsId][id], { _deletedAt: now });
          n++;
        }
      });
      state.recipes = recipes;
      emit('recipes', recipes[wsId], null);
      persist();
      return n;
    },
    getRecipe: function (id) {
      const wsId = currentWsId();
      const r = state.recipes[wsId] ? state.recipes[wsId][id] : null;
      if (!r || r._deletedAt) return null;
      return PCD.clone(r);
    },
    listRecipes: function () {
      const wsId = currentWsId();
      if (!state.recipes[wsId]) return [];
      return Object.values(PCD.clone(state.recipes[wsId])).filter(function (r) { return !r._deletedAt; });
    },

    // Returns array of recipe names that reference the given ingredient ID.
    // Used by ingredients.js before deletion (v2.6.36): if an ingredient
    // is used in any recipe, deletion is blocked to prevent broken
    // "(removed)" lines and silent data corruption.
    findRecipesUsingIngredient: function (ingId) {
      const wsId = currentWsId();
      if (!state.recipes[wsId]) return [];
      const recipes = state.recipes[wsId];
      const out = [];
      Object.keys(recipes).forEach(function (rid) {
        const r = recipes[rid];
        if (!r || r._deletedAt) return;
        if (!r.ingredients || !r.ingredients.length) return;
        const used = r.ingredients.some(function (ri) { return ri.ingredientId === ingId; });
        if (used) out.push(r.name || '(untitled)');
      });
      return out;
    },

    // v2.6.55 — Detect recipes with "(removed ingredient)" or
    // "(removed sub-recipe)" lines. These are leftover from the pre-v2.6.36
    // era when ingredient deletion silently broke recipes. Returns:
    //   [{ recipe, brokenLines: [{ idx, kind: 'ingredient'|'subrecipe', refId }] }]
    // Used by dashboard self-healing card and the cleanup modal.
    findBrokenRecipes: function () {
      const wsId = currentWsId();
      if (!state.recipes[wsId]) return [];
      const recipes = state.recipes[wsId];
      // Build maps of valid (non-deleted) ingredients and recipes for quick lookup
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      const validIngIds = new Set();
      Object.keys(wsIngs).forEach(function (id) {
        const ing = wsIngs[id];
        if (ing && !ing._deletedAt) validIngIds.add(id);
      });
      const validRecipeIds = new Set();
      Object.keys(recipes).forEach(function (id) {
        const r = recipes[id];
        if (r && !r._deletedAt) validRecipeIds.add(id);
      });
      const out = [];
      Object.keys(recipes).forEach(function (rid) {
        const r = recipes[rid];
        if (!r || r._deletedAt) return;
        if (!r.ingredients || !r.ingredients.length) return;
        const brokenLines = [];
        r.ingredients.forEach(function (ri, idx) {
          if (ri.recipeId) {
            // Sub-recipe reference — broken if target recipe is missing/deleted
            // Or if it points to itself (cycle)
            if (!validRecipeIds.has(ri.recipeId) || ri.recipeId === r.id) {
              brokenLines.push({ idx: idx, kind: 'subrecipe', refId: ri.recipeId });
            }
          } else if (ri.ingredientId) {
            // Ingredient reference — broken if target ingredient is missing/deleted
            if (!validIngIds.has(ri.ingredientId)) {
              brokenLines.push({ idx: idx, kind: 'ingredient', refId: ri.ingredientId });
            }
          }
          // else: malformed line (no id at all) — also broken
          else {
            brokenLines.push({ idx: idx, kind: 'malformed', refId: null });
          }
        });
        if (brokenLines.length > 0) {
          out.push({ recipe: PCD.clone(r), brokenLines: brokenLines });
        }
      });
      return out;
    },

    // v2.6.55 — Remove all broken ingredient/sub-recipe lines from the
    // given recipe. Returns the count of removed lines, or 0 if recipe
    // not found / no broken lines. Triggers normal upsert flow so cloud
    // sync + persist behave normally.
    cleanRecipeBrokenLines: function (recipeId) {
      const wsId = currentWsId();
      if (!state.recipes[wsId] || !state.recipes[wsId][recipeId]) return 0;
      const r = state.recipes[wsId][recipeId];
      if (r._deletedAt || !r.ingredients || !r.ingredients.length) return 0;
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      const validIngIds = new Set();
      Object.keys(wsIngs).forEach(function (id) {
        if (wsIngs[id] && !wsIngs[id]._deletedAt) validIngIds.add(id);
      });
      const validRecipeIds = new Set();
      Object.keys(state.recipes[wsId]).forEach(function (id) {
        const rr = state.recipes[wsId][id];
        if (rr && !rr._deletedAt) validRecipeIds.add(id);
      });
      const before = r.ingredients.length;
      const cleaned = r.ingredients.filter(function (ri) {
        if (ri.recipeId) {
          return validRecipeIds.has(ri.recipeId) && ri.recipeId !== r.id;
        } else if (ri.ingredientId) {
          return validIngIds.has(ri.ingredientId);
        } else {
          return false; // malformed line, drop
        }
      });
      const removed = before - cleaned.length;
      if (removed === 0) return 0;
      // Use upsertRecipe to trigger normal save flow (versioning, cloud sync, etc.)
      const updated = Object.assign({}, PCD.clone(r), { ingredients: cleaned });
      this.upsertRecipe(updated);
      return removed;
    },

    // v2.6.55 — Bulk version: clean all broken recipes in one go.
    // Returns total lines removed across all recipes.
    cleanAllBrokenRecipes: function () {
      const broken = this.findBrokenRecipes();
      let totalRemoved = 0;
      const self = this;
      broken.forEach(function (b) {
        totalRemoved += self.cleanRecipeBrokenLines(b.recipe.id);
      });
      return { recipes: broken.length, lines: totalRemoved };
    },

    // ---- Ingredient helpers (workspace-scoped from v2.6.30) ----
    // Previously ingredients were shared across all workspaces (one master
    // list). Real-world chefs run kitchens in different countries with
    // different prices and even different products available — so each
    // workspace now keeps its own ingredient list.
    //
    // Migration: legacy flat ingredients (state.ingredients = { id: {...} })
    // get moved into the active workspace on first load (handled in the
    // wsBoundTables migration block above).
    upsertIngredient: function (ing) {
      const wsId = currentWsId();
      if (!ing.id) ing.id = PCD.uid('i');
      const now = new Date().toISOString();
      ing.updatedAt = now;
      if (!ing.createdAt) ing.createdAt = now;
      if (!state.ingredients) state.ingredients = {};
      if (!state.ingredients[wsId]) state.ingredients[wsId] = {};
      const ingredients = Object.assign({}, state.ingredients);
      const wsIngs = Object.assign({}, ingredients[wsId] || {});
      const existing = wsIngs[ing.id];
      if (existing && existing.pricePerUnit !== ing.pricePerUnit) {
        ing.priceHistory = (existing.priceHistory || []).concat({ at: now, price: ing.pricePerUnit });
      }
      wsIngs[ing.id] = ing;
      ingredients[wsId] = wsIngs;
      state.ingredients = ingredients;
      emit('ingredients', wsIngs, null);
      persist();
      // v2.6.67 — Per-table sync
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('ingredients', ing.id, wsId, ing);
      return ing;
    },
    deleteIngredient: function (id) {
      const wsId = currentWsId();
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      if (!wsIngs[id]) return false;
      const ingredients = Object.assign({}, state.ingredients);
      const newWsIngs = Object.assign({}, wsIngs);
      newWsIngs[id] = Object.assign({}, newWsIngs[id], { _deletedAt: new Date().toISOString() });
      ingredients[wsId] = newWsIngs;
      state.ingredients = ingredients;
      emit('ingredients', newWsIngs, null);
      persist();
      // v2.6.67 — Per-table sync
      if (PCD.cloudPerTable) PCD.cloudPerTable.queueUpsert('ingredients', id, wsId, newWsIngs[id]);
      return true;
    },
    deleteIngredients: function (ids) {
      if (!ids || !ids.length) return 0;
      const wsId = currentWsId();
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      const ingredients = Object.assign({}, state.ingredients);
      const newWsIngs = Object.assign({}, wsIngs);
      const now = new Date().toISOString();
      let n = 0;
      ids.forEach(function (id) {
        if (newWsIngs[id] && !newWsIngs[id]._deletedAt) {
          newWsIngs[id] = Object.assign({}, newWsIngs[id], { _deletedAt: now });
          n++;
        }
      });
      ingredients[wsId] = newWsIngs;
      state.ingredients = ingredients;
      emit('ingredients', newWsIngs, null);
      persist();
      return n;
    },
    getIngredient: function (id) {
      const wsId = currentWsId();
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      const i = wsIngs[id];
      if (!i || i._deletedAt) return null;
      return PCD.clone(i);
    },
    listIngredients: function () {
      const wsId = currentWsId();
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      return Object.values(PCD.clone(wsIngs)).filter(function (i) { return !i._deletedAt; });
    },

    // ---- Generic table helpers (workspace-scoped: menus/events/suppliers/canvases/shoppingLists/etc) ----
    upsertInTable: function (table, item, idPrefix) {
      const wsId = currentWsId();
      if (!state[table] || typeof state[table] !== 'object') state[table] = {};
      if (!state[table][wsId]) state[table][wsId] = {};
      if (!item.id) item.id = PCD.uid(idPrefix || table.slice(0, 1));
      const now = new Date().toISOString();
      item.updatedAt = now;
      if (!item.createdAt) item.createdAt = now;
      const root = Object.assign({}, state[table]);
      root[wsId] = Object.assign({}, root[wsId] || {});
      root[wsId][item.id] = item;
      state[table] = root;
      emit(table, root[wsId], null);
      persist();
      // v2.6.69 — Per-table sync hook for generic tables
      // Maps state-key (camelCase) → SQL table name (snake_case)
      if (PCD.cloudPerTable) {
        const sqlTable = _stateKeyToSqlTable(table);
        if (sqlTable) PCD.cloudPerTable.queueUpsert(sqlTable, item.id, wsId, item);
      }
      return item;
    },
    deleteFromTable: function (table, id) {
      const wsId = currentWsId();
      if (!state[table] || !state[table][wsId] || !state[table][wsId][id]) return false;
      const root = Object.assign({}, state[table]);
      root[wsId] = Object.assign({}, root[wsId]);
      // Soft delete
      root[wsId][id] = Object.assign({}, root[wsId][id], { _deletedAt: new Date().toISOString() });
      state[table] = root;
      emit(table, root[wsId], null);
      persist();
      // v2.6.69 — Per-table sync hook
      if (PCD.cloudPerTable) {
        const sqlTable = _stateKeyToSqlTable(table);
        if (sqlTable) PCD.cloudPerTable.queueUpsert(sqlTable, id, wsId, root[wsId][id]);
      }
      return true;
    },
    getFromTable: function (table, id) {
      const wsId = currentWsId();
      if (!state[table] || !state[table][wsId]) return null;
      const item = state[table][wsId][id];
      if (!item || item._deletedAt) return null;
      return PCD.clone(item);
    },
    listTable: function (table) {
      const wsId = currentWsId();
      if (!state[table] || !state[table][wsId]) return [];
      return Object.values(PCD.clone(state[table][wsId])).filter(function (it) { return !it._deletedAt; });
    },

    // ============ TRASH API ============
    // List all soft-deleted items across tables.
    // Returns: [{ table, id, item, label, deletedAt }]
    listTrash: function () {
      const wsId = currentWsId();
      const out = [];
      // Recipes
      const recipes = state.recipes[wsId] || {};
      Object.values(recipes).forEach(function (r) {
        if (r._deletedAt) out.push({ table: 'recipes', id: r.id, item: r, label: r.name || 'Recipe', deletedAt: r._deletedAt });
      });
      // Ingredients (workspace-scoped from v2.6.30)
      const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
      Object.values(wsIngs).forEach(function (i) {
        if (i._deletedAt) out.push({ table: 'ingredients', id: i.id, item: i, label: i.name || 'Ingredient', deletedAt: i._deletedAt });
      });
      // Generic ws-bound tables
      ['menus','events','suppliers','canvases','shoppingLists','checklistTemplates'].forEach(function (table) {
        const data = (state[table] && state[table][wsId]) || {};
        Object.values(data).forEach(function (it) {
          if (it._deletedAt) out.push({ table: table, id: it.id, item: it, label: it.name || it.title || 'Item', deletedAt: it._deletedAt });
        });
      });
      return out.sort(function (a, b) { return (b.deletedAt || '').localeCompare(a.deletedAt || ''); });
    },

    restoreFromTrash: function (table, id) {
      const wsId = currentWsId();
      if (table === 'recipes') {
        if (!state.recipes[wsId] || !state.recipes[wsId][id]) return false;
        const recipes = Object.assign({}, state.recipes);
        recipes[wsId] = Object.assign({}, recipes[wsId]);
        const r = Object.assign({}, recipes[wsId][id]);
        delete r._deletedAt;
        recipes[wsId][id] = r;
        state.recipes = recipes;
        emit('recipes', recipes[wsId], null);
        persist();
        return true;
      }
      if (table === 'ingredients') {
        const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
        if (!wsIngs[id]) return false;
        const ings = Object.assign({}, state.ingredients);
        const newWsIngs = Object.assign({}, wsIngs);
        const i = Object.assign({}, newWsIngs[id]);
        delete i._deletedAt;
        newWsIngs[id] = i;
        ings[wsId] = newWsIngs;
        state.ingredients = ings;
        emit('ingredients', newWsIngs, null);
        persist();
        return true;
      }
      if (state[table] && state[table][wsId] && state[table][wsId][id]) {
        const root = Object.assign({}, state[table]);
        root[wsId] = Object.assign({}, root[wsId]);
        const it = Object.assign({}, root[wsId][id]);
        delete it._deletedAt;
        root[wsId][id] = it;
        state[table] = root;
        emit(table, root[wsId], null);
        persist();
        return true;
      }
      return false;
    },

    purgeFromTrash: function (table, id) {
      const wsId = currentWsId();
      if (table === 'recipes') {
        if (!state.recipes[wsId] || !state.recipes[wsId][id]) return false;
        // v2.6.44 — Capture photo URL before deletion so we can clean up
        // the orphaned Storage blob if no other recipe references it.
        const _purgePhoto = state.recipes[wsId][id].photo;
        const recipes = Object.assign({}, state.recipes);
        recipes[wsId] = Object.assign({}, recipes[wsId]);
        delete recipes[wsId][id];
        state.recipes = recipes;
        emit('recipes', recipes[wsId], null);
        persist();
        if (_purgePhoto && PCD.photoStorage && PCD.photoStorage.deleteByUrl) {
          if (!isPhotoStillUsed(_purgePhoto, id)) {
            PCD.photoStorage.deleteByUrl(_purgePhoto);
          }
        }
        return true;
      }
      if (table === 'ingredients') {
        const wsIngs = (state.ingredients && state.ingredients[wsId]) || {};
        if (!wsIngs[id]) return false;
        const ings = Object.assign({}, state.ingredients);
        const newWsIngs = Object.assign({}, wsIngs);
        delete newWsIngs[id];
        ings[wsId] = newWsIngs;
        state.ingredients = ings;
        emit('ingredients', newWsIngs, null);
        persist();
        return true;
      }
      if (state[table] && state[table][wsId] && state[table][wsId][id]) {
        const root = Object.assign({}, state[table]);
        root[wsId] = Object.assign({}, root[wsId]);
        delete root[wsId][id];
        state[table] = root;
        emit(table, root[wsId], null);
        persist();
        return true;
      }
      return false;
    },

    // Auto-purge items soft-deleted more than `daysOld` days ago.
    autoPurgeOldTrash: function (daysOld) {
      daysOld = daysOld || 30;
      const cutoff = Date.now() - daysOld * 86400000;
      let purged = 0;
      const wsId = currentWsId();
      // v2.6.44 — Collect photo URLs from purged recipes for orphan
      // blob cleanup after the state mutation completes.
      const purgedRecipePhotos = [];
      const tables = ['recipes','menus','events','suppliers','canvases','shoppingLists','checklistTemplates'];
      tables.forEach(function (table) {
        const data = (state[table] && state[table][wsId]) || {};
        const next = Object.assign({}, data);
        let changed = false;
        Object.keys(next).forEach(function (id) {
          const it = next[id];
          if (it._deletedAt && new Date(it._deletedAt).getTime() < cutoff) {
            if (table === 'recipes' && it.photo) {
              purgedRecipePhotos.push({ url: it.photo, recipeId: it.id });
            }
            delete next[id];
            changed = true;
            purged++;
          }
        });
        if (changed) {
          const root = Object.assign({}, state[table]);
          root[wsId] = next;
          state[table] = root;
        }
      });
      // Ingredients (shared, no wsId scope)
      const ings = Object.assign({}, state.ingredients);
      let ingsChanged = false;
      Object.keys(ings).forEach(function (id) {
        if (ings[id]._deletedAt && new Date(ings[id]._deletedAt).getTime() < cutoff) {
          delete ings[id];
          ingsChanged = true;
          purged++;
        }
      });
      if (ingsChanged) state.ingredients = ings;
      if (purged > 0) persist();
      // v2.6.44 — After state has been updated, attempt to clean up
      // orphaned photo blobs. isPhotoStillUsed walks the freshly-mutated
      // state, so if a duplicate recipe still references the URL we skip
      // deletion. Best-effort, async, non-blocking.
      if (purgedRecipePhotos.length && PCD.photoStorage && PCD.photoStorage.deleteByUrl) {
        purgedRecipePhotos.forEach(function (p) {
          if (!isPhotoStillUsed(p.url, p.recipeId)) {
            PCD.photoStorage.deleteByUrl(p.url);
          }
        });
      }
      return purged;
    },

    // ---- Pub/sub ----
    on: subscribe,

    // ---- Full state management ----
    replaceAll: function (newState) {
      state = deepMerge(PCD.clone(defaultState), newState);
      // v2.6.62 — Apply migrations to data pulled from cloud or imported
      // from backup. The cloud blob might still be at an older schema if
      // another device wrote it before being upgraded.
      state = runMigrations(state);

      // v2.6.93 — activeWorkspaceId validation. Backup'taki id state.workspaces'te
      // yoksa veya silinmişse ilk geçerli (silinmemiş) workspace'e ata. Aksi
      // halde tools wsId üzerinden filtre yapar, hiçbir şey görünmez.
      try {
        const ws = state.workspaces || {};
        const activeId = state.activeWorkspaceId;
        const isValid = activeId && ws[activeId] && !ws[activeId]._deletedAt;
        if (!isValid) {
          const firstValid = Object.keys(ws).find(function (id) {
            return ws[id] && !ws[id]._deletedAt;
          });
          state.activeWorkspaceId = firstValid || null;
        }
      } catch (e) {
        PCD.err && PCD.err('replaceAll: activeWorkspaceId validation failed', e);
      }

      emit('*:replaced', state);
      // v2.6.93 — workspaces ve activeWorkspaceId emit'leri eklendi; restore
      // sonrası workspace switcher ve aktif tool yeniden render olsun.
      ['recipes','ingredients','menus','events','suppliers','inventory','waste','prefs','onboarding','user','plan','workspaces','activeWorkspaceId'].forEach(function (k) {
        emit(k, state[k]);
      });
      // v2.6.93 — flushSync ile IDB yazımının tamamlandığını garanti et,
      // Promise'ini döndür ki restore akışı await edebilsin. Eski caller'lar
      // (cloud.js pull merge) Promise'i discard ediyor, davranış aynı.
      return flushSync();
    },

    // Reset everything (e.g. on sign-out)
    reset: function () {
      state = PCD.clone(defaultState);
      localStorage.removeItem(LS_KEY_STATE);
      // v2.6.89 — IDB'yi de temizle (fire-and-forget).
      if (PCD.idb && PCD.idb.delete) {
        PCD.idb.delete('state', 'main').catch(function () {});
      }
      // v2.6.92 — Sign-out sonrası flag'leri sıfırla. Yeni hesabın ilk
      // persist'i normal akışta migration'ı yeniden tetikleyebilir.
      _idbWriteOnly = false;
      _migrationDone = false;
      emit('*:reset', state);
      ['recipes','ingredients','menus','events','suppliers','inventory','waste','prefs','onboarding','user','plan'].forEach(function (k) {
        emit(k, state[k]);
      });
    },

    // Wipe all user-specific data on logout, but keep UI preferences
    // (theme, locale, etc.) so the next user / next session starts fresh
    // but in the chef's chosen language and theme.
    //
    // BUG FIX (v2.6.23): Without this, logging out left workspaces,
    // recipes, menus, etc. in localStorage. Anyone using the same
    // browser would see the previous user's data.
    clearUserData: function () {
      // Save the prefs we want to keep
      const savedPrefs = {};
      const prefKeys = ['prefs.theme', 'prefs.locale', 'prefs.currency', 'prefs.haccpTempUnit', 'prefs.haccpCurrentLogId'];
      prefKeys.forEach(function (k) {
        const v = state.prefs && state.prefs[k.replace('prefs.', '')];
        if (v !== undefined) savedPrefs[k] = v;
      });
      // Reset everything
      state = PCD.clone(defaultState);
      // Restore prefs
      Object.keys(savedPrefs).forEach(function (k) {
        const subKey = k.replace('prefs.', '');
        state.prefs = state.prefs || {};
        state.prefs[subKey] = savedPrefs[k];
      });
      // Persist immediately
      flushSync();
      emit('*:reset', state);
      ['recipes','ingredients','menus','events','suppliers','inventory','waste','onboarding','user','plan','workspaces','activeWorkspaceId'].forEach(function (k) {
        emit(k, state[k]);
      });
    },

    // Force save immediately (e.g. before navigation)
    flush: function () {
      flushSync();
    },

    // Mark tool as "seen" for tutorials
    markToolSeen: function (toolKey) {
      if (state.onboarding.toolsSeen[toolKey]) return;
      state.onboarding.toolsSeen = Object.assign({}, state.onboarding.toolsSeen, (function(){ const o = {}; o[toolKey] = true; return o; })());
      emit('onboarding.toolsSeen', state.onboarding.toolsSeen);
      persist();
    },
    isToolSeen: function (toolKey) {
      return !!state.onboarding.toolsSeen[toolKey];
    },
  };

  PCD.store = store;

})();
