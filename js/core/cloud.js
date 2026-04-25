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
        recipes: state.recipes,
        ingredients: state.ingredients,
        menus: state.menus,
        events: state.events,
        suppliers: state.suppliers,
        inventory: state.inventory,
        waste: state.waste,
        checklistTemplates: state.checklistTemplates,
        checklistSessions: state.checklistSessions,
        canvases: state.canvases,
        shoppingLists: state.shoppingLists,
        costHistory: state.costHistory,
        pendingStockCount: state.pendingStockCount,
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
              // merge cloud data into local. Cloud wins for base tables.
              const remote = res.data.value;
              const current = PCD.store.get();
              // Merge strategy: cloud data overwrites recipe/ingredient/etc. but keep user/_meta local
              const merged = Object.assign({}, current, remote, {
                user: current.user,
                _meta: Object.assign({}, current._meta, { lastSyncAt: res.data.updated_at })
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
