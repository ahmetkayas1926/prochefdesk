/* ================================================================
   ProChefDesk — cloud.js
   Supabase sync layer. Pushes state changes to cloud, pulls on sign-in.
   Works offline: changes queue and sync when back online.

   DATA MODEL (in Supabase):
     user_data (
       user_id uuid,
       key text,          -- e.g. 'state'
       value jsonb,       -- full state blob or per-table
       updated_at timestamptz
       unique(user_id, key)
     )
   We use a single key 'state' that holds the full blob for simplicity.
   For heavy datasets, we can split later.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  let supabase = null;
  let syncing = false;
  let pendingSync = false;
  let onlineListenerAdded = false;

  const cloud = {
    ready: false,

    init: function () {
      if (!window.PCD_CONFIG.isBackendConfigured()) {
        PCD.log('Backend not configured — offline-only mode.');
        return;
      }
      if (!window.supabase || !window.supabase.createClient) {
        PCD.warn('Supabase JS not loaded.');
        return;
      }
      try {
        supabase = window.supabase.createClient(
          window.PCD_CONFIG.SUPABASE_URL,
          window.PCD_CONFIG.SUPABASE_ANON,
          { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
        );
        cloud.supabase = supabase;
        window._supabaseClient = supabase;  // expose for share.js
        cloud.ready = true;
        PCD.log('Supabase ready.');

        // Online/offline listener
        if (!onlineListenerAdded) {
          window.addEventListener('online', function () {
            PCD.$('#offlineBanner').classList.add('hidden');
            if (pendingSync) cloud.queueSync();
          });
          window.addEventListener('offline', function () {
            PCD.$('#offlineBanner').classList.remove('hidden');
          });
          if (!navigator.onLine) {
            PCD.$('#offlineBanner').classList.remove('hidden');
          }
          onlineListenerAdded = true;
        }
      } catch (e) {
        PCD.err('Supabase init failed', e);
      }
    },

    getClient: function () { return supabase; },

    // Called by store.js after every change (debounced)
    queueSync: function () {
      if (!cloud.ready) return;
      const user = PCD.store.get('user');
      if (!user || !user.id) return;
      if (!navigator.onLine) { pendingSync = true; return; }
      if (syncing) { pendingSync = true; return; }
      cloud._doSync();
    },

    // Force-push current state to cloud, return promise that resolves when done.
    // Use this before reload() to guarantee cloud has latest data.
    pushNow: function () {
      return new Promise(function (resolve) {
        if (!cloud.ready) return resolve(false);
        const user = PCD.store.get('user');
        if (!user || !user.id) return resolve(false);
        if (!navigator.onLine) return resolve(false);

        const state = PCD.store.get();
        const payload = {
          plan: state.plan,
          prefs: state.prefs,
          onboarding: state.onboarding,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          ingredients: state.ingredients,
          costHistory: state.costHistory,
          recipes: state.recipes,
          menus: state.menus,
          events: state.events,
          suppliers: state.suppliers,
          inventory: state.inventory,
          waste: state.waste,
          checklistTemplates: state.checklistTemplates,
          checklistSessions: state.checklistSessions,
          canvases: state.canvases,
          shoppingLists: state.shoppingLists,
          pendingStockCount: state.pendingStockCount,
          stockCountHistory: state.stockCountHistory,
          _deletedWorkspaces: state._deletedWorkspaces,
        };

        supabase.from('user_data').upsert({
          user_id: user.id,
          key: 'state',
          value: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,key' }).then(function (res) {
          if (res.error) {
            PCD.err('pushNow error', res.error);
            resolve(false);
          } else {
            PCD.log('pushNow OK');
            resolve(true);
          }
        }).catch(function (e) {
          PCD.err('pushNow exception', e);
          resolve(false);
        });
      });
    },

    _doSync: function () {
      if (!cloud.ready) return;
      const user = PCD.store.get('user');
      if (!user || !user.id) return;
      syncing = true;
      pendingSync = false;

      // Build a slimmed payload — exclude _meta
      const state = PCD.store.get();
      const payload = {
        plan: state.plan,
        prefs: state.prefs,
        onboarding: state.onboarding,
        // Workspaces (v2.2)
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        // Library (shared)
        ingredients: state.ingredients,
        costHistory: state.costHistory,
        // Workspace-bound (now namespaced by wsId inside)
        recipes: state.recipes,
        menus: state.menus,
        events: state.events,
        suppliers: state.suppliers,
        inventory: state.inventory,
        waste: state.waste,
        checklistTemplates: state.checklistTemplates,
        checklistSessions: state.checklistSessions,
        canvases: state.canvases,
        shoppingLists: state.shoppingLists,
        pendingStockCount: state.pendingStockCount,
        stockCountHistory: state.stockCountHistory,
          _deletedWorkspaces: state._deletedWorkspaces,
      };

      supabase.from('user_data').upsert({
        user_id: user.id,
        key: 'state',
        value: payload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,key' }).then(function (res) {
        syncing = false;
        if (res.error) {
          PCD.err('sync error', res.error);
          PCD.store.update('_meta', { pendingChanges: (PCD.store.get('_meta.pendingChanges') || 0) + 1 });
        } else {
          PCD.store.update('_meta', { lastSyncAt: new Date().toISOString(), pendingChanges: 0 });
          PCD.log('synced OK');
        }
        if (pendingSync) setTimeout(cloud._doSync, 500);
      }).catch(function (e) {
        syncing = false;
        PCD.err('sync exception', e);
      });
    },

    // Pull from cloud (on sign-in)
    pull: function () {
      return new Promise(function (resolve, reject) {
        if (!cloud.ready) return resolve(null);
        const user = PCD.store.get('user');
        if (!user || !user.id) return resolve(null);
        supabase.from('user_data').select('*')
          .eq('user_id', user.id).eq('key', 'state').maybeSingle()
          .then(function (res) {
            if (res.error) { PCD.err('pull error', res.error); return reject(res.error); }
            if (res.data && res.data.value) {
              PCD.log('pulled state from cloud');
              const remote = res.data.value;
              const current = PCD.store.get();

              // Tombstones — workspaces deleted locally that should NOT be resurrected from cloud
              const tombstones = current._deletedWorkspaces || {};

              // Special handling for workspaces: union by id (don't drop local-only ws)
              // BUT respect tombstones: deleted ws stays deleted even if cloud still has it
              const mergedWorkspaces = {};
              const allIds = new Set();
              if (remote.workspaces) Object.keys(remote.workspaces).forEach(function (id) { allIds.add(id); });
              if (current.workspaces) Object.keys(current.workspaces).forEach(function (id) { allIds.add(id); });

              allIds.forEach(function (wsId) {
                // Skip if this ws was deleted locally (tombstoned)
                if (tombstones[wsId]) return;

                const localWs = current.workspaces && current.workspaces[wsId];
                const remoteWs = remote.workspaces && remote.workspaces[wsId];
                if (localWs && remoteWs) {
                  // Both have it — newer updatedAt wins
                  const localUpd = localWs.updatedAt || '';
                  const remoteUpd = remoteWs.updatedAt || '';
                  mergedWorkspaces[wsId] = (localUpd > remoteUpd) ? localWs : remoteWs;
                } else if (localWs) {
                  mergedWorkspaces[wsId] = localWs;
                } else if (remoteWs) {
                  mergedWorkspaces[wsId] = remoteWs;
                }
              });

              // Merge tombstones too (union)
              const mergedTombstones = Object.assign({}, remote._deletedWorkspaces || {}, current._deletedWorkspaces || {});

              // Merge strategy: cloud data overwrites recipe/ingredient/etc. but keep user/_meta/workspaces local-aware
              const merged = Object.assign({}, current, remote, {
                workspaces: mergedWorkspaces,
                _deletedWorkspaces: mergedTombstones,
                // Keep activeWorkspaceId from local if it points to a workspace we have
                activeWorkspaceId: (current.activeWorkspaceId && mergedWorkspaces[current.activeWorkspaceId])
                  ? current.activeWorkspaceId
                  : ((remote.activeWorkspaceId && mergedWorkspaces[remote.activeWorkspaceId])
                      ? remote.activeWorkspaceId
                      : (Object.keys(mergedWorkspaces)[0] || null)),
                user: current.user,
                _meta: Object.assign({}, current._meta, { lastSyncAt: res.data.updated_at })
              });

              // Also clean up workspace-bound tables for tombstoned workspaces
              ['recipes','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','pendingStockCount','stockCountHistory','haccpUnits','haccpReadings'].forEach(function (tbl) {
                if (merged[tbl]) {
                  Object.keys(tombstones).forEach(function (deadWsId) {
                    if (merged[tbl][deadWsId]) {
                      const t = Object.assign({}, merged[tbl]);
                      delete t[deadWsId];
                      merged[tbl] = t;
                    }
                  });
                }
              });

              PCD.store.replaceAll(merged);
              resolve(merged);
            } else {
              // No cloud data yet — push local up
              resolve(null);
              cloud.queueSync();
            }
          })
          .catch(function (e) { PCD.err('pull exception', e); reject(e); });
      });
    },

    // Get plan from subscriptions table
    fetchPlan: function () {
      if (!cloud.ready) return Promise.resolve('free');
      const user = PCD.store.get('user');
      if (!user || !user.id) return Promise.resolve('free');
      return supabase.from('subscriptions').select('plan,status')
        .eq('user_id', user.id).maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) return 'free';
          return (res.data.status === 'active') ? (res.data.plan || 'free') : 'free';
        }).catch(function () { return 'free'; });
    },
  };

  PCD.cloud = cloud;
})();
