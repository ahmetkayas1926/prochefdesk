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

    // data tables (each keyed by id)
    recipes: {},       // { id: { id, name, category, photo, servings, ingredients:[{ingredientId,amount,unit}], steps, ... } }
    ingredients: {},   // { id: { id, name, unit, pricePerUnit, supplier, category, priceHistory:[] } }
    menus: {},
    events: {},
    suppliers: {},
    inventory: {},     // { ingredientId: { stock, parLevel, lastOrderDate } }
    waste: [],         // array of waste entries
    checklistTemplates: {},
    checklistSessions: [],
    canvases: {},      // kitchen cards
    shoppingLists: {}, // phase 2 shopping lists
    team: [],
    costHistory: [],   // price change log
    pendingStockCount: null, // { countedAt, countedBy, counts: {iid:num}, status } - awaits approval

    // sync meta (not the data itself)
    _meta: {
      lastSyncAt: null,
      pendingChanges: 0,
    },
  };

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
    try {
      localStorage.setItem(LS_KEY_STATE, JSON.stringify(state));
    } catch (e) {
      PCD.err('Failed to persist state:', e);
      // storage full? try again after clearing meta
      if (e && e.name === 'QuotaExceededError') {
        PCD.toast && PCD.toast.error('Storage quota exceeded');
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
    upsertRecipe: function (recipe) {
      if (!recipe.id) recipe.id = PCD.uid('r');
      const now = new Date().toISOString();
      recipe.updatedAt = now;
      if (!recipe.createdAt) recipe.createdAt = now;
      const recipes = Object.assign({}, state.recipes);
      recipes[recipe.id] = recipe;
      state.recipes = recipes;
      emit('recipes', recipes, null);
      emit('recipes.' + recipe.id, recipe, null);
      persist();
      return recipe;
    },
    deleteRecipe: function (id) {
      if (!state.recipes[id]) return false;
      const recipes = Object.assign({}, state.recipes);
      delete recipes[id];
      state.recipes = recipes;
      emit('recipes', recipes, null);
      persist();
      return true;
    },
    deleteRecipes: function (ids) {
      if (!ids || !ids.length) return 0;
      const recipes = Object.assign({}, state.recipes);
      let n = 0;
      ids.forEach(function (id) {
        if (recipes[id]) { delete recipes[id]; n++; }
      });
      state.recipes = recipes;
      emit('recipes', recipes, null);
      persist();
      return n;
    },
    getRecipe: function (id) { return PCD.clone(state.recipes[id]); },
    listRecipes: function () { return Object.values(PCD.clone(state.recipes)); },

    // ---- Ingredient helpers ----
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

    // ---- Generic table helpers (phase 2+): menus, canvases, shoppingLists ----
    upsertInTable: function (table, item, idPrefix) {
      if (!state[table] || typeof state[table] !== 'object') state[table] = {};
      if (!item.id) item.id = PCD.uid(idPrefix || table.slice(0, 1));
      const now = new Date().toISOString();
      item.updatedAt = now;
      if (!item.createdAt) item.createdAt = now;
      const next = Object.assign({}, state[table]);
      next[item.id] = item;
      state[table] = next;
      emit(table, next, null);
      persist();
      return item;
    },
    deleteFromTable: function (table, id) {
      if (!state[table] || !state[table][id]) return false;
      const next = Object.assign({}, state[table]);
      delete next[id];
      state[table] = next;
      emit(table, next, null);
      persist();
      return true;
    },
    getFromTable: function (table, id) {
      return state[table] ? PCD.clone(state[table][id]) : null;
    },
    listTable: function (table) {
      return state[table] ? Object.values(PCD.clone(state[table])) : [];
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
