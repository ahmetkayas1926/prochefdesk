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
      schemaVersion: 2,        // bumped to 2 with workspace migration
    },
  };

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

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY_STATE);
      if (raw) {
        const parsed = JSON.parse(raw);
        // deep merge defaults + parsed so new fields in newer versions still exist
        state = deepMerge(PCD.clone(defaultState), parsed);
      }
    } catch (e) {
      PCD.warn('Failed to load state:', e);
      state = PCD.clone(defaultState);
    }
    // Normalize ingredient unit case (v2.6.35). Some CSV imports stored
    // 'L', 'KG', 'ML' in uppercase. The convertUnit utility is now
    // case-insensitive (also v2.6.35) but to keep the edit-modal dropdown
    // showing the right unit and to make data consistent, lowercase them.
    if (state.ingredients && typeof state.ingredients === 'object') {
      Object.keys(state.ingredients).forEach(function (wsId) {
        const wsIngs = state.ingredients[wsId];
        if (!wsIngs || typeof wsIngs !== 'object') return;
        Object.keys(wsIngs).forEach(function (ingId) {
          const ing = wsIngs[ingId];
          if (ing && typeof ing.unit === 'string') {
            const lc = ing.unit.toLowerCase();
            // Only normalize if it maps to a known canonical unit
            if (lc !== ing.unit && (lc === 'l' || lc === 'kg' || lc === 'ml' || lc === 'g' || lc === 'pcs')) {
              ing.unit = lc;
            }
          }
        });
      });
    }
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
      localStorage.setItem(LS_KEY_STATE, JSON.stringify(stateCopy));
      state = stateCopy;
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
      PCD.toast && PCD.toast.error('Storage full. Open Account → Backup to download your data.');
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
    try {
      localStorage.setItem(LS_KEY_STATE, JSON.stringify(state));
      return true;
    } catch (e) {
      PCD.err && PCD.err('flushSync fail', e);
      return false;
    }
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
    try {
      localStorage.setItem(LS_KEY_STATE, serialized);
    } catch (e) {
      PCD.err('Failed to persist state:', e);
      if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
        // v2.6.42 — Storage full. Show explicit modal to user instead of
        // silently trimming priceHistory/waste/cost behind their back.
        // The modal lets them download a backup first, then decide whether
        // to trim. See trimAndPersist() and showQuotaModal() above.
        if (!_quotaModalOpen) {
          showQuotaModal();
        }
      }
    }
    // tell cloud module to sync
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
      load();
      PCD.log('store initialized');
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
      return true;
    },
    deleteWorkspace: function (wsId) {
      if (!state.workspaces[wsId]) return false;
      // Refuse if it's the only one
      const remaining = Object.keys(state.workspaces).filter(function (id) { return id !== wsId; });
      if (remaining.length === 0) return false;
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
      state._deletedWorkspaces[wsId] = new Date().toISOString();
      emit('workspaces', next, null);
      flushSync();
      persist();
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
      const recipes = Object.assign({}, state.recipes);
      recipes[wsId] = Object.assign({}, recipes[wsId] || {});
      recipes[wsId][recipe.id] = recipe;
      state.recipes = recipes;
      emit('recipes', recipes[wsId], null);
      emit('recipes.' + recipe.id, recipe, null);
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
        const recipes = Object.assign({}, state.recipes);
        recipes[wsId] = Object.assign({}, recipes[wsId]);
        delete recipes[wsId][id];
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
      const tables = ['recipes','menus','events','suppliers','canvases','shoppingLists','checklistTemplates'];
      tables.forEach(function (table) {
        const data = (state[table] && state[table][wsId]) || {};
        const next = Object.assign({}, data);
        let changed = false;
        Object.keys(next).forEach(function (id) {
          const it = next[id];
          if (it._deletedAt && new Date(it._deletedAt).getTime() < cutoff) {
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
      return purged;
    },

    // ---- Pub/sub ----
    on: subscribe,

    // ---- Full state management ----
    replaceAll: function (newState) {
      state = deepMerge(PCD.clone(defaultState), newState);
      emit('*:replaced', state);
      // Trigger a broad refresh
      ['recipes','ingredients','menus','events','suppliers','inventory','waste','prefs','onboarding','user','plan'].forEach(function (k) {
        emit(k, state[k]);
      });
      persist();
    },

    // Reset everything (e.g. on sign-out)
    reset: function () {
      state = PCD.clone(defaultState);
      localStorage.removeItem(LS_KEY_STATE);
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
