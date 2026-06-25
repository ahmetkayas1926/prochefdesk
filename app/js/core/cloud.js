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
    // v2.7.2 — Blob okuma v2.6.87'den itibaren kapalı (blobPromise sabit
    // olarak {data:null} dönüyor), blobRemote daima null. Buraya ulaşılmaz
    // ama imza geriye dönük uyum için korunuyor.
    return perTableState;
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

        // v2.6.87 — Faz 4 son adım: BLOB OKUMA KAPATILDI.
        // Eski user_data tablosundan okuma artık yok. Per-table sistem
        // tüm verinin tek kaynağı. mergePullSources null blob ile çağrıldı
        // mı per-table'ı tek başına döndürüyor (zaten desteklenen path).
        const blobPromise = Promise.resolve({ data: null, error: null });

        const perTablePromise = (PCD.cloudPerTable && PCD.cloudPerTable.pullAll)
          ? PCD.cloudPerTable.pullAll().catch(function (e) {
              PCD.warn && PCD.warn('per-table pull failed:', e && e.message);
              return null;
            })
          : Promise.resolve(null);

        Promise.all([blobPromise, perTablePromise])
          .then(function (results) {
            const res = results[0];
            const perTableState = results[1];
            if (res.error) { PCD.err('pull error', res.error); _done(); return reject(res.error); }

            // Kaynak verilerini hazırla (blob artık null)
            const blobRemote = (res.data && res.data.value) || null;
            const remote = mergePullSources(blobRemote, perTableState);

            if (!remote) {
              // Per-table boş — yeni hesap. Lokal varsa per-table'a yazılması
              // store API çağrıları (upsertWorkspace, vs.) ile gerçekleşir.
              _done();
              resolve(null);
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
                const wsTables = ['recipes','ingredients','menus','events','suppliers','inventory','waste','salesLog','checklistTemplates','checklistSessions','canvases','shoppingLists','stockCountHistory','haccpLogs','haccpUnits','haccpReadings','haccpCookCool','haccpReceiving','haccpHolding','buffets','misePlans','team','whiteboards','rosters','prepSheets'];
                for (let i = 0; i < wsTables.length; i++) {
                  const t = sourceState && sourceState[wsTables[i]];
                  if (t && t[ws.id] && Object.keys(t[ws.id]).length > 0) return false;
                }
                return true;
              }

              // Special handling for workspaces: union by id (don't drop local-only ws).
              // v2.7.4 — Tombstone filter kaldırıldı. Silinmiş workspace'ler artık
              // state.workspaces'ta _deletedAt flag'iyle yaşıyor. listWorkspaces
              // (store.js v2.6.99) flag'i filter ediyor → switcher'da görünmüyor.
              // listDeletedWorkspaces (v2.7.3) flag'i kullanarak Trash UI'ya gösteriyor.
              // Ghost workspace bug'ı isEmptyGhostWs() ikinci pass'ı ile çözülüyor (aşağıda).
              const mergedWorkspaces = {};
              const allIds = new Set();
              if (remote.workspaces) Object.keys(remote.workspaces).forEach(function (id) { allIds.add(id); });
              if (current.workspaces) Object.keys(current.workspaces).forEach(function (id) { allIds.add(id); });

              // First pass: build merge result the normal way.
              allIds.forEach(function (wsId) {
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
                'stockCountHistory',
                // v2.15.3 — Roster: user-edited, per-record updatedAt merge
                'rosters',
                // v2.16 — Prep Sheet: user-edited, per-record updatedAt merge
                'prepSheets'
              ];
              // Tables that are arrays under wsId (append-only logs):
              // v2.19 — BUG FIX: whiteboards/buffets/misePlans/team de array-tablo;
              // pull edilmeye başlandı (cloud-pertable) → merge'e de eklendi ki
              // local∪remote birleşsin (tombstone + en-yeni-kazanır), ezme olmasın.
              const ARRAY_WS_TABLES = ['waste', 'checklistSessions', 'whiteboards', 'buffets', 'misePlans', 'team', 'salesLog'];
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

              // v2.7.4 — Önceden burada tombstoned ws'lerin children'ı state'ten
              // siliniyordu. Artık bırakılıyor: ws-bound table'ların satırları zaten
              // DB cascade trigger ile _deletedAt flag'lendi (cloud-pertable pull bunları
              // state'e _deletedAt ile getiriyor); store.list*/get* fonksiyonları flag'i
              // filter ediyor → kullanıcıya görünmüyor. Trash UI children sayısını
              // göstermek için bu veriye ihtiyaç duyacak.

              // v2.8.3 — BUG FIX: Onboarding seed cloud push.
              // Bootstrap (store.ensureActiveWorkspace) "My Kitchen" workspace'ini
              // direkt state mutation ile yaratıyor — store.upsertWorkspace API'sini
              // kullanmadığı için cloud-pertable.queueUpsert tetiklenmiyor. Sonuç:
              // yeni signup'taki kullanıcının "My Kitchen" workspace'i lokal IDB'de
              // kalıyor, cloud'a hiç push olmuyor → mobil cihazda görünmüyor.
              // Recipes/ingredients gibi child kayıtlar normal store API'siyle push
              // ediliyor ama parent workspace'siz orphan oluyor.
              //
              // Fix: Pull tamamlandığında, mergedWorkspaces içinde olup remote'ta
              // bulunmayan (yani lokal-only kalan) workspace'leri queueUpsert et.
              // Idempotent — workspace zaten cloud'da varsa onConflict ile güvenli.
              if (PCD.cloudPerTable && PCD.cloudPerTable.queueUpsert) {
                const remoteWsIds = (remote.workspaces) ? remote.workspaces : {};
                Object.keys(mergedWorkspaces).forEach(function (wsId) {
                  if (!remoteWsIds[wsId]) {
                    PCD.log && PCD.log('cloud pull: pushing local-only workspace to cloud:', wsId, mergedWorkspaces[wsId].name);
                    PCD.cloudPerTable.queueUpsert('workspaces', wsId, null, mergedWorkspaces[wsId]);
                  }
                });

                // v2.8.33 — DRIFT DETECTION: same logic extended to ALL
                // per-workspace tables. Any local record that the cloud
                // pull didn't return is treated as local-only and queued
                // for upload. Self-healing: catches the v2.8.32 restore
                // bug, transient push failures, network drops mid-save,
                // any state where local and cloud diverged. Silent —
                // user never has to think about sync.
                const wsTables = [
                  ['recipes',            'recipes'],
                  ['ingredients',        'ingredients'],
                  ['menus',              'menus'],
                  ['events',             'events'],
                  ['suppliers',          'suppliers'],
                  ['canvases',           'canvases'],
                  ['shoppingLists',      'shopping_lists'],
                  ['checklistTemplates', 'checklist_templates'],
                  ['stockCountHistory',  'stock_count_history'],
                  ['haccpLogs',          'haccp_logs'],
                  ['haccpUnits',         'haccp_units'],
                  ['haccpReadings',      'haccp_readings'],
                  ['haccpCookCool',      'haccp_cook_cool'],
                  // v2.8.44 — HACCP Receiving + Holding drift detection
                  ['haccpReceiving',     'haccp_receiving'],
                  ['haccpHolding',       'haccp_holding'],
                  // v2.15.3 — Roster drift detection
                  ['rosters',            'rosters'],
                  // v2.16 — Prep Sheet drift detection
                  ['prepSheets',         'prep_sheets'],
                ];
                let driftedCount = 0;
                wsTables.forEach(function (pair) {
                  const stateKey = pair[0];
                  const table = pair[1];
                  const localData = merged[stateKey] || {};
                  const remoteData = remote[stateKey] || {};
                  Object.keys(localData).forEach(function (wsId) {
                    const localItems = localData[wsId] || {};
                    const remoteItems = remoteData[wsId] || {};
                    Object.keys(localItems).forEach(function (id) {
                      if (localItems[id] && !remoteItems[id]) {
                        PCD.cloudPerTable.queueUpsert(table, id, wsId, localItems[id]);
                        driftedCount++;
                      }
                    });
                  });
                });
                // Inventory (different structure: { wsId: { ingId: row } })
                const localInv = merged.inventory || {};
                const remoteInv = remote.inventory || {};
                Object.keys(localInv).forEach(function (wsId) {
                  const localItems = localInv[wsId] || {};
                  const remoteItems = remoteInv[wsId] || {};
                  Object.keys(localItems).forEach(function (ingId) {
                    if (localItems[ingId] && !remoteItems[ingId]) {
                      PCD.cloudPerTable.queueUpsert('inventory', ingId, wsId, localItems[ingId]);
                      driftedCount++;
                    }
                  });
                });
                if (driftedCount > 0) {
                  PCD.log && PCD.log('cloud pull: drift detected, queued', driftedCount, 'local-only item(s) for cloud sync');
                }
              }

              PCD.store.replaceAll(merged);
              _done();
              resolve(merged);
          })
          .catch(function (e) { PCD.err('pull exception', e); _done(); reject(e); });
      });
    },

    // v2.17 — Plan, user_prefs'in AYRI kolonlarından okunur (otoriter kaynak).
    // Yazma yalnızca server tarafında: Stripe webhook (service_role) veya
    // operatör (manuel pro). Frontend bu kolonları YAZAMAZ (kolon yetkisi yok),
    // sadece okuyabilir → değer güvenilir.
    //   - plan_source='manual' → kalıcı pro (status/expiry'den bağımsız).
    //   - plan_status='active' → pro.
    //   - canceled ama plan_expires_at gelecekte → ödenen dönem sonuna kadar pro.
    //   - aksi halde free.
    fetchPlan: function () {
      if (!cloud.ready) return Promise.resolve('free');
      const user = PCD.store.get('user');
      if (!user || !user.id) return Promise.resolve('free');
      return supabase.from('user_prefs')
        .select('plan,plan_source,plan_status,plan_expires_at')
        .eq('user_id', user.id).maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) return 'free';
          const p = res.data.plan || 'free';
          if (p === 'free') return 'free';
          if (res.data.plan_source === 'manual') return p;        // kalıcı manuel pro
          if (res.data.plan_status === 'active') return p;
          const exp = res.data.plan_expires_at ? new Date(res.data.plan_expires_at).getTime() : 0;
          if (exp && exp > Date.now()) return p;                   // iptal sonrası ödenen dönem
          return 'free';
        }).catch(function () { return 'free'; });
    },
  };

  PCD.cloud = cloud;
})();
