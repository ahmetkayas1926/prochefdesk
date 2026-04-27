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
    // (i.e. ids at top level, not nested by wsId), move it under the new ws
    const wsBoundTables = ['recipes','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','stockCountHistory'];
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
        // Storage full — attempt graceful recovery by pruning old price history
        const stateCopy = PCD.clone(state);
        if (stateCopy.ingredients) {
          Object.keys(stateCopy.ingredients).forEach(function (k) {
            const ing = stateCopy.ingredients[k];
            if (ing.priceHistory && ing.priceHistory.length > 5) {
              ing.priceHistory = ing.priceHistory.slice(-5);
            }
          });
        }
        // Trim waste log, cost history to last 500 entries
        if (stateCopy.waste && stateCopy.waste.length > 500) stateCopy.waste = stateCopy.waste.slice(-500);
        if (stateCopy.costHistory && stateCopy.costHistory.length > 500) stateCopy.costHistory = stateCopy.costHistory.slice(-500);
        if (stateCopy.checklistSessions && stateCopy.checklistSessions.length > 100) stateCopy.checklistSessions = stateCopy.checklistSessions.slice(-100);
        try {
          localStorage.setItem(LS_KEY_STATE, JSON.stringify(stateCopy));
          state = stateCopy;
          PCD.toast && PCD.toast.warning('Storage almost full — old history trimmed');
        } catch (e2) {
          PCD.toast && PCD.toast.error('Storage full. Please export backup and reset.');
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
      try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
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
      try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
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
      try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
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
      ['recipes','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','pendingStockCount','stockCountHistory'].forEach(function (tbl) {
        if (state[tbl] && state[tbl][wsId] !== undefined) {
          const t = Object.assign({}, state[tbl]);
          delete t[wsId];
          state[tbl] = t;
        }
      });
      if (state.activeWorkspaceId === wsId) {
        state.activeWorkspaceId = remaining[0];
      }
      emit('workspaces', next, null);
      try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {}
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
      delete recipes[wsId][id];
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
      let n = 0;
      ids.forEach(function (id) {
        if (recipes[wsId][id]) { delete recipes[wsId][id]; n++; }
      });
      state.recipes = recipes;
      emit('recipes', recipes[wsId], null);
      persist();
      return n;
    },
    getRecipe: function (id) {
      const wsId = currentWsId();
      return state.recipes[wsId] ? PCD.clone(state.recipes[wsId][id]) : null;
    },
    listRecipes: function () {
      const wsId = currentWsId();
      return state.recipes[wsId] ? Object.values(PCD.clone(state.recipes[wsId])) : [];
    },

    // ---- Ingredient helpers (LIBRARY — shared across workspaces) ----
    upsertIngredient: function (ing) {
      if (!ing.id) ing.id = PCD.uid('i');
      const now = new Date().toISOString();
      ing.updatedAt = now;
      if (!ing.createdAt) ing.createdAt = now;
      const ingredients = Object.assign({}, state.ingredients);
      // track price change
      const existing = ingredients[ing.id];
      if (existing && existing.pricePerUnit !== ing.pricePerUnit) {
        ing.priceHistory = (existing.priceHistory || []).concat({ at: now, price: ing.pricePerUnit });
      }
      ingredients[ing.id] = ing;
      state.ingredients = ingredients;
      emit('ingredients', ingredients, null);
      persist();
      return ing;
    },
    deleteIngredient: function (id) {
      if (!state.ingredients[id]) return false;
      const ingredients = Object.assign({}, state.ingredients);
      delete ingredients[id];
      state.ingredients = ingredients;
      emit('ingredients', ingredients, null);
      persist();
      return true;
    },
    deleteIngredients: function (ids) {
      if (!ids || !ids.length) return 0;
      const ings = Object.assign({}, state.ingredients);
      let n = 0;
      ids.forEach(function (id) { if (ings[id]) { delete ings[id]; n++; } });
      state.ingredients = ings;
      emit('ingredients', ings, null);
      persist();
      return n;
    },
    getIngredient: function (id) { return PCD.clone(state.ingredients[id]); },
    listIngredients: function () { return Object.values(PCD.clone(state.ingredients)); },

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
      delete root[wsId][id];
      state[table] = root;
      emit(table, root[wsId], null);
      persist();
      return true;
    },
    getFromTable: function (table, id) {
      const wsId = currentWsId();
      if (!state[table] || !state[table][wsId]) return null;
      return PCD.clone(state[table][wsId][id]);
    },
    listTable: function (table) {
      const wsId = currentWsId();
      if (!state[table] || !state[table][wsId]) return [];
      return Object.values(PCD.clone(state[table][wsId]));
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

    // Force save immediately (e.g. before navigation)
    flush: function () {
      try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); }
      catch (e) { PCD.err('flush fail', e); }
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
