/* ================================================================
   ProChefDesk — cloud.js
   Supabase sync layer. Pulls per-table state on sign-in, merges with
   local edits using updatedAt timestamps. Writes go through
   cloud-pertable.js. Works offline — changes queue and sync when
   back online.

   v2.6.99 — Eski user_data blob mimari kaldırıldı (v2.6.87'den beri
   yazma/okuma kapalıydı, bu sürümde son referans temizlendi).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  let supabase = null;
  let syncing = false;
  let pendingSync = false;
  // v2.6.85 — Pull-in-progress flag.
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

    // v2.6.87 — Faz 4 son adım: BLOB YAZIMI KAPATILDI.
    // Eski user_data tablosuna yazım artık yok. Tüm mutation'lar
    // cloud-pertable üzerinden ilgili tablolara gider. Per-table sistemin
    // güvenilirliği v2.6.84-86 ile doğrulandı (workspaces, demo cleanup,
    // ghost prevention). Bu fonksiyon backward-compat için bırakıldı —
    // store.persist hâlâ çağırıyor; no-op döner.
    queueSync: function () {
      // No-op. Blob yazımı v2.6.87'de kapatıldı.
      // Per-table writes cloud-pertable.queueUpsert üzerinden gider.
    },

    // v2.6.85 — cloud-pertable.flushNow için public getter.
    isPullInProgress: function () { return pullInProgress; },

    // v2.6.87 — Faz 4 son adım: BLOB YAZIMI KAPATILDI.
    // pushNow ve _doSync no-op'a çevrildi. Önceden reload öncesi flush
    // emniyet için kullanılıyordu; artık per-table cloud-pertable.flushNow
    // tarafından sağlanıyor. Backward-compat için promise döndürüyor.
    pushNow: function () {
      // Per-table flushNow varsa onu tetikle (tüm pending writes gönderilsin).
      if (PCD.cloudPerTable && PCD.cloudPerTable.flushNow) {
        try { PCD.cloudPerTable.flushNow(); } catch (e) {}
      }
      return Promise.resolve(true);
    },

    _doSync: function () {
      // No-op. Blob yazımı v2.6.87'de kapatıldı.
    },

    // Pull from cloud (on sign-in)
    pull: function () {
      return new Promise(function (resolve, reject) {
        if (!cloud.ready) return resolve(null);
        const user = PCD.store.get('user');
        if (!user || !user.id) return resolve(null);

        // v2.6.85 — Pull-in-progress flag + ertelenmiş push tetikleyici.
        pullInProgress = true;
        function _done() {
          pullInProgress = false;
          if (pendingSync) {
            pendingSync = false;
            // queueSync v2.6.87'de no-op olduğu için _doSync çağırmaya gerek yok.
            // Ertelenmiş per-table push'lar zaten cloud-pertable kuyruğunda.
          }
          if (PCD.cloudPerTable && PCD.cloudPerTable.flushNow) {
            setTimeout(function () { PCD.cloudPerTable.flushNow(); }, 100);
          }
        }

        // v2.6.99 — Pull akışı: per-table tek kaynak. Eski user_data blob
        // mantığı (v2.6.74 mergePullSources) v2.6.87'den beri ölüydü;
        // bu sürümde tamamen kaldırıldı.
        const perTablePromise = (PCD.cloudPerTable && PCD.cloudPerTable.pullAll)
          ? PCD.cloudPerTable.pullAll().catch(function (e) {
              PCD.warn && PCD.warn('per-table pull failed:', e && e.message);
              return null;
            })
          : Promise.resolve(null);

        perTablePromise
          .then(function (perTableState) {
            const remote = perTableState;

            if (!remote) {
              // Per-table boş — yeni hesap. Lokal varsa per-table'a yazılması
              // store API çağrıları (upsertWorkspace, vs.) ile gerçekleşir.
              _done();
              resolve(null);
              return;
            }
            PCD.log('pulled state from cloud (per-table)');
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
                  lastSyncAt: new Date().toISOString()
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
