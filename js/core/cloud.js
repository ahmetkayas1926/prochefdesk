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
  // v2.6.85 — Pull-in-progress flag. Sign-in akışında lokalde bootstrap
  // edilen ghost "My Kitchen" workspace'i, cloud pull tamamlanmadan
  // queueSync/flushNow tarafından push ediliyor ve cloud workspaces
  // tablosunda kalıcı duplikat yaratıyordu. Pull başlarken bu flag açılır,
  // queueSync/flushNow flag açıkken push'u erteler ve pull bittiğinde
  // pendingSync varsa güncel (ghost'tan arındırılmış) state ile flush'lar.
  let pullInProgress = false;
  let onlineListenerAdded = false;

  // v2.6.58 — Per-record merge helpers. The previous pull() did a
  // shallow Object.assign({}, current, remote) which meant remote's
  // `recipes` blob entirely replaced current's `recipes` blob. If the
  // user had unsynced local edits (made offline, or while sync was in
  // flight), those edits were silently lost on the next pull.
  //
  // The fix: for each user-edited record, compare updatedAt timestamps
  // between local and remote, keep whichever is newer. Soft-deletions
  // (_deletedAt) are treated as a normal update — if local deletion is
  // newer than remote update, the deletion wins.

  function _recordTs(rec) {
    if (!rec || typeof rec !== 'object') return '';
    return rec._deletedAt || rec.updatedAt || rec.createdAt || '';
  }

  function mergeRecordsByUpdatedAt(local, remote) {
    // Both inputs: { id: record }. Returns merged map.
    local = local || {};
    remote = remote || {};
    const out = {};
    const ids = new Set();
    Object.keys(local).forEach(function (id) { ids.add(id); });
    Object.keys(remote).forEach(function (id) { ids.add(id); });
    ids.forEach(function (id) {
      const l = local[id];
      const r = remote[id];
      if (!l) { out[id] = r; return; }
      if (!r) { out[id] = l; return; }
      // Both exist — keep newer
      out[id] = (_recordTs(l) > _recordTs(r)) ? l : r;
    });
    return out;
  }

  function mergeWsScopedTable(local, remote) {
    // Both inputs: { wsId: { id: record } }
    local = local || {};
    remote = remote || {};
    const out = {};
    const wsIds = new Set();
    Object.keys(local).forEach(function (id) { wsIds.add(id); });
    Object.keys(remote).forEach(function (id) { wsIds.add(id); });
    wsIds.forEach(function (wsId) {
      out[wsId] = mergeRecordsByUpdatedAt(local[wsId], remote[wsId]);
    });
    return out;
  }

  function mergeArrayByIdAndTs(local, remote) {
    // Used for waste log, costHistory, checklistSessions arrays under wsId.
    // If items have an `id` field, union by id with newest timestamp.
    // Otherwise fall back to the longer array (assumes append-only).
    local = local || [];
    remote = remote || [];
    if (!local.length) return remote.slice();
    if (!remote.length) return local.slice();
    const sample = local[0] || remote[0];
    if (sample && sample.id) {
      const map = {};
      local.forEach(function (x) { if (x && x.id) map[x.id] = x; });
      remote.forEach(function (x) {
        if (!x || !x.id) return;
        const existing = map[x.id];
        if (!existing) { map[x.id] = x; return; }
        const lt = _recordTs(existing) || existing.at || '';
        const rt = _recordTs(x) || x.at || '';
        if (rt > lt) map[x.id] = x;
      });
      return Object.values(map);
    }
    // No id field — pick longer (assumes append-only logs)
    return local.length >= remote.length ? local.slice() : remote.slice();
  }

  function mergeWsScopedArrayTable(local, remote) {
    // For tables with shape: { wsId: [...records...] }
    local = local || {};
    remote = remote || {};
    const out = {};
    const wsIds = new Set();
    Object.keys(local).forEach(function (id) { wsIds.add(id); });
    Object.keys(remote).forEach(function (id) { wsIds.add(id); });
    wsIds.forEach(function (wsId) {
      out[wsId] = mergeArrayByIdAndTs(local[wsId], remote[wsId]);
    });
    return out;
  }

  // v2.6.74 — Faz 4 Adım 4: ÇİFT KAYNAK MERGE
  // Eski user_data blob'undan (blobRemote) ve yeni per-table sistemden
  // (perTableState) gelen state'leri record bazında merge eder.
  // newest-wins kuralı: aynı record her iki kaynakta da varsa updatedAt
  // (veya _deletedAt) timestamp'i karşılaştırılır.
  //
  // Hangi kaynak boş olursa olsun, çalışmaya devam eder:
  //   - Sadece blob: mevcut davranış (per-table henüz yok)
  //   - Sadece per-table: yeni kullanıcı (blob hiç yazılmadı)
  //   - İkisi de boş: null döner, çağıran tarafta cloud.queueSync tetiklenir
  //   - İkisi de var: record bazında merge
  function mergePullSources(blobRemote, perTableState) {
    if (!blobRemote && !perTableState) return null;
    if (!perTableState) return blobRemote;
    if (!blobRemote) return perTableState;

    // Top-level workspace map (newest-wins per ws)
    const mergedWorkspaces = {};
    const allWsIds = new Set();
    if (blobRemote.workspaces) Object.keys(blobRemote.workspaces).forEach(function (id) { allWsIds.add(id); });
    if (perTableState.workspaces) Object.keys(perTableState.workspaces).forEach(function (id) { allWsIds.add(id); });
    allWsIds.forEach(function (wsId) {
      const b = blobRemote.workspaces && blobRemote.workspaces[wsId];
      const p = perTableState.workspaces && perTableState.workspaces[wsId];
      if (!b) { mergedWorkspaces[wsId] = p; return; }
      if (!p) { mergedWorkspaces[wsId] = b; return; }
      mergedWorkspaces[wsId] = (_recordTs(b) > _recordTs(p)) ? b : p;
    });

    // Workspace tombstones — union (her iki kaynaktaki tüm tombstone ID'leri),
    // çakışma varsa daha eski (önce silinen) olanı tut.
    const mergedTombstones = {};
    const allTombIds = new Set();
    if (blobRemote._deletedWorkspaces) Object.keys(blobRemote._deletedWorkspaces).forEach(function (id) { allTombIds.add(id); });
    if (perTableState._deletedWorkspaces) Object.keys(perTableState._deletedWorkspaces).forEach(function (id) { allTombIds.add(id); });
    allTombIds.forEach(function (id) {
      const b = blobRemote._deletedWorkspaces && blobRemote._deletedWorkspaces[id];
      const p = perTableState._deletedWorkspaces && perTableState._deletedWorkspaces[id];
      mergedTombstones[id] = b || p;
    });

    // Workspace-scoped map tables (recipes, ingredients, vs.)
    const WS_MAP_TABLES = [
      'recipes', 'ingredients', 'menus', 'events', 'suppliers',
      'canvases', 'shoppingLists', 'checklistTemplates',
      'stockCountHistory', 'haccpLogs', 'haccpUnits',
      'haccpReadings', 'haccpCookCool'
    ];
    const merged = Object.assign({}, blobRemote, perTableState);
    WS_MAP_TABLES.forEach(function (tbl) {
      merged[tbl] = mergeWsScopedTable(blobRemote[tbl], perTableState[tbl]);
    });

    // Workspace-scoped array tables (waste, checklistSessions)
    const WS_ARRAY_TABLES = ['waste', 'checklistSessions'];
    WS_ARRAY_TABLES.forEach(function (tbl) {
      merged[tbl] = mergeWsScopedArrayTable(blobRemote[tbl], perTableState[tbl]);
    });

    // Inventory: { wsId: { ingredientId: row } } — per-table birincil
    // (counts genellikle son yazılan kazanır, timestamp yok bu kayıtlarda).
    if (perTableState.inventory && Object.keys(perTableState.inventory).length > 0) {
      // Per-table merge: ws içinde ingredient ID'leri union
      const invMerged = {};
      const invWsIds = new Set();
      Object.keys(blobRemote.inventory || {}).forEach(function (id) { invWsIds.add(id); });
      Object.keys(perTableState.inventory || {}).forEach(function (id) { invWsIds.add(id); });
      invWsIds.forEach(function (wsId) {
        invMerged[wsId] = Object.assign({},
          (blobRemote.inventory && blobRemote.inventory[wsId]) || {},
          (perTableState.inventory && perTableState.inventory[wsId]) || {}
        );
      });
      merged.inventory = invMerged;
    } else {
      merged.inventory = blobRemote.inventory || {};
    }

    // costHistory — top-level array, newest by id timestamp
    merged.costHistory = mergeArrayByIdAndTs(blobRemote.costHistory, perTableState.costHistory);

    // Top-level metadata — per-table'dan gelirse al, yoksa blob
    merged.workspaces = mergedWorkspaces;
    merged._deletedWorkspaces = mergedTombstones;
    // activeWorkspaceId — per-table kazanır (user_prefs daha güncel tutar)
    merged.activeWorkspaceId = perTableState.activeWorkspaceId || blobRemote.activeWorkspaceId;
    // user_prefs içerikleri — per-table'dan gelmişse onu al
    if (perTableState.prefs && Object.keys(perTableState.prefs).length > 0) {
      merged.prefs = perTableState.prefs;
    }
    if (perTableState.plan) merged.plan = perTableState.plan;
    if (perTableState.onboarding && Object.keys(perTableState.onboarding).length > 0) {
      merged.onboarding = perTableState.onboarding;
    }

    return merged;
  }

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
      // v2.6.85 — Pull devam ederken push erteleme. Bu olmadan ghost
      // workspace pull'dan önce cloud'a yazılıyor.
      if (pullInProgress) { pendingSync = true; return; }
      if (syncing) { pendingSync = true; return; }
      cloud._doSync();
    },

    // v2.6.85 — cloud-pertable.flushNow ve diğer pull-aware kodlar için
    // public getter. Bu olmadan flushNow pull sırasında push edebiliyor.
    isPullInProgress: function () { return pullInProgress; },

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

        // v2.6.85 — Ghost workspace duplicate fix. Pull başlarken flag açılır,
        // queueSync ve cloudPerTable.flushNow flag açıkken push'u erteler.
        // Pull bitince (success/null/error) _done() flag'i kapatır ve
        // ertelenmiş push'ları tetikler.
        pullInProgress = true;
        function _done() {
          pullInProgress = false;
          // Flag kapanır kapanmaz, pull boyunca biriken pending push'ları
          // tetikle. Artık state ghost'tan arındırılmış (pull merge ghost
          // filter'ı isEmptyGhostWs'i çalıştırdı), bu yüzden bu push'lar
          // güvenle gider.
          if (pendingSync) {
            pendingSync = false;
            setTimeout(function () { cloud._doSync(); }, 100);
          }
          if (PCD.cloudPerTable && PCD.cloudPerTable.flushNow) {
            setTimeout(function () { PCD.cloudPerTable.flushNow(); }, 100);
          }
        }

        // v2.6.74 — Faz 4 Adım 4: ÇİFT KAYNAK PULL
        // İki yerden de paralel olarak çek:
        //   1. Eski user_data blob (tek satır jsonb)
        //   2. Yeni per-table tablolar (cloudPerTable.pullAll)
        //
        // İki kaynağı record bazında merge et — newest-wins.
        //   - Bir tabloda kayıt sadece blob'da: blob'tan gelir
        //   - Sadece per-table'da: per-table'dan gelir
        //   - İkisinde de var: timestamp karşılaştırılır, yeni olan kazanır
        //
        // Bu yaklaşım veri kaybını imkansız kılar: hangi cihaz hangi
        // sisteme yazmış olursa olsun, en yeni hali kazanır.
        //
        // Per-table pull başarısız olursa (RLS/network sorunu) sadece
        // blob ile devam ediyoruz (eski davranış). Tersi de geçerli.

        const blobPromise = supabase.from('user_data').select('*')
          .eq('user_id', user.id).eq('key', 'state').maybeSingle();

        const perTablePromise = (PCD.cloudPerTable && PCD.cloudPerTable.pullAll)
          ? PCD.cloudPerTable.pullAll().catch(function (e) {
              PCD.warn && PCD.warn('per-table pull failed, falling back to blob only:', e && e.message);
              return null;
            })
          : Promise.resolve(null);

        Promise.all([blobPromise, perTablePromise])
          .then(function (results) {
            const res = results[0];
            const perTableState = results[1];
            if (res.error) { PCD.err('pull error', res.error); _done(); return reject(res.error); }

            // Kaynak verilerini hazırla
            const blobRemote = (res.data && res.data.value) || null;
            const remote = mergePullSources(blobRemote, perTableState);

            if (!remote) {
              // İki kaynak da boş — yeni hesap, lokal'i yukarı push
              _done();
              resolve(null);
              cloud.queueSync();
              return;
            }
            PCD.log('pulled state from cloud (blob:', !!blobRemote, ', per-table:', !!perTableState, ')');
            const current = PCD.store.get();

            // Tombstones — workspaces deleted locally that should NOT be resurrected from cloud
            const tombstones = current._deletedWorkspaces || {};

              // BUG FIX (v2.6.8 / hardened in v2.6.9): On every login the
              // bootstrap code creates an empty "My Kitchen" workspace
              // BEFORE cloud pull. Without filtering, that ghost workspace
              // accumulates one duplicate per login.
              //
              // Drop a workspace (whether local-only OR already synced to
              // remote) if ALL of these are true:
              //   - it's named "My Kitchen" (default — chef hasn't renamed)
              //   - it has no concept/role/city
              //   - it's not archived
              //   - it has no content in any workspace-bound table
              //   - it's NOT the only remaining workspace (we never delete
              //     the user's last workspace this way)
              //   - at least one OTHER non-ghost workspace exists
              //
              // This catches both freshly-bootstrapped ghosts and historical
              // ones that already got synced to remote.
              function isEmptyGhostWs(ws, sourceState) {
                if (!ws) return false;
                if (ws.name !== 'My Kitchen') return false;
                if (ws.concept || ws.role || ws.city) return false;
                if (ws.archived) return false;
                const wsTables = ['recipes','ingredients','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','stockCountHistory','haccpLogs','haccpUnits','haccpReadings','haccpCookCool'];
                for (let i = 0; i < wsTables.length; i++) {
                  const t = sourceState && sourceState[wsTables[i]];
                  if (t && t[ws.id] && Object.keys(t[ws.id]).length > 0) return false;
                }
                return true;
              }

              // Special handling for workspaces: union by id (don't drop local-only ws)
              // BUT respect tombstones: deleted ws stays deleted even if cloud still has it
              const mergedWorkspaces = {};
              const allIds = new Set();
              if (remote.workspaces) Object.keys(remote.workspaces).forEach(function (id) { allIds.add(id); });
              if (current.workspaces) Object.keys(current.workspaces).forEach(function (id) { allIds.add(id); });

              // First pass: build merge result the normal way.
              allIds.forEach(function (wsId) {
                if (tombstones[wsId]) return;
                const localWs = current.workspaces && current.workspaces[wsId];
                const remoteWs = remote.workspaces && remote.workspaces[wsId];
                if (localWs && remoteWs) {
                  const localUpd = localWs.updatedAt || '';
                  const remoteUpd = remoteWs.updatedAt || '';
                  mergedWorkspaces[wsId] = (localUpd > remoteUpd) ? localWs : remoteWs;
                } else if (localWs) {
                  mergedWorkspaces[wsId] = localWs;
                } else if (remoteWs) {
                  mergedWorkspaces[wsId] = remoteWs;
                }
              });

              // Second pass: identify ghost workspaces.
              // A ghost is detected against whichever side has its content
              // (local for local-only, remote for remote-only, or either for both).
              const allWsIds = Object.keys(mergedWorkspaces);
              const ghostIds = [];
              allWsIds.forEach(function (wsId) {
                const ws = mergedWorkspaces[wsId];
                const isLocal = current.workspaces && current.workspaces[wsId];
                const isRemote = remote.workspaces && remote.workspaces[wsId];
                const localGhost = isLocal && isEmptyGhostWs(ws, current);
                const remoteGhost = isRemote && isEmptyGhostWs(ws, remote);
                // Only flag as ghost if it has no content in EITHER side.
                if ((isLocal && !localGhost) || (isRemote && !remoteGhost)) return;
                if (isLocal || isRemote) ghostIds.push(wsId);
              });

              // Never delete ALL workspaces — keep at least one alive.
              // If after filtering nothing would be left, keep the most recent ghost.
              const nonGhostCount = allWsIds.length - ghostIds.length;
              if (nonGhostCount === 0 && ghostIds.length > 0) {
                // Pick newest ghost to keep.
                let keepId = ghostIds[0];
                let keepTs = '';
                ghostIds.forEach(function (id) {
                  const ts = (mergedWorkspaces[id].createdAt || '');
                  if (ts > keepTs) { keepTs = ts; keepId = id; }
                });
                ghostIds.splice(ghostIds.indexOf(keepId), 1);
              }

              // Remove the ghosts.
              if (ghostIds.length > 0) {
                PCD.log('cloud merge: dropping ' + ghostIds.length + ' ghost workspace(s)', ghostIds);
                ghostIds.forEach(function (id) { delete mergedWorkspaces[id]; });
              }

              // Merge tombstones too (union)
              const mergedTombstones = Object.assign({}, remote._deletedWorkspaces || {}, current._deletedWorkspaces || {});

              // v2.6.58 — Per-record merge for user-edited tables.
              // Previously remote ENTIRELY replaced local for these tables,
              // losing any unsynced local edits. Now we merge by updatedAt
              // per record, so newest write wins.
              //
              // Tables in this list have `updatedAt` on every record:
              const HIGH_EDIT_WS_TABLES = [
                'recipes', 'ingredients', 'menus', 'events', 'suppliers',
                'canvases', 'shoppingLists', 'checklistTemplates',
                'stockCountHistory'
              ];
              // Tables that are arrays under wsId (append-only logs):
              const ARRAY_WS_TABLES = ['waste', 'checklistSessions'];
              // Tables without per-record timestamps — keep remote-wins for
              // these (existing behavior). Inventory levels change via
              // counts not edits, so cloud is generally authoritative.
              const REMOTE_WINS_TABLES = [
                'inventory', 'pendingStockCount',
                'haccpLogs', 'haccpUnits', 'haccpReadings', 'haccpCookCool'
              ];

              const mergedTables = {};
              HIGH_EDIT_WS_TABLES.forEach(function (tbl) {
                mergedTables[tbl] = mergeWsScopedTable(current[tbl], remote[tbl]);
              });
              ARRAY_WS_TABLES.forEach(function (tbl) {
                mergedTables[tbl] = mergeWsScopedArrayTable(current[tbl], remote[tbl]);
              });
              REMOTE_WINS_TABLES.forEach(function (tbl) {
                mergedTables[tbl] = (remote[tbl] !== undefined) ? remote[tbl] : current[tbl];
              });
              // Top-level cost history (not workspace-scoped)
              mergedTables.costHistory = mergeArrayByIdAndTs(current.costHistory, remote.costHistory);

              // Merge strategy: per-table merge for user data, then overlay
              // workspace metadata, user, _meta, etc.
              const merged = Object.assign({}, current, remote, mergedTables, {
                workspaces: mergedWorkspaces,
                _deletedWorkspaces: mergedTombstones,
                // Keep activeWorkspaceId from local if it points to a workspace we have
                activeWorkspaceId: (current.activeWorkspaceId && mergedWorkspaces[current.activeWorkspaceId])
                  ? current.activeWorkspaceId
                  : ((remote.activeWorkspaceId && mergedWorkspaces[remote.activeWorkspaceId])
                      ? remote.activeWorkspaceId
                      : (Object.keys(mergedWorkspaces)[0] || null)),
                user: current.user,
                _meta: Object.assign({}, current._meta, {
                  lastSyncAt: (res.data && res.data.updated_at) || new Date().toISOString()
                })
              });

              // Also clean up workspace-bound tables for tombstoned workspaces
              ['recipes','ingredients','menus','events','suppliers','inventory','waste','checklistTemplates','checklistSessions','canvases','shoppingLists','pendingStockCount','stockCountHistory','haccpLogs','haccpUnits','haccpReadings','haccpCookCool'].forEach(function (tbl) {
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
              _done();
              resolve(merged);
          })
          .catch(function (e) { PCD.err('pull exception', e); _done(); reject(e); });
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
