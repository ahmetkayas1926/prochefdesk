/* ================================================================
   ProChefDesk — cloud-pertable.js (v2.6.67)

   Per-table sync layer (Multi-device sync, Faz 2).

   STRATEGY: Çift yazma fazı (write-to-both)
   ----------------------------------------
   Bu modül mevcut cloud.js'i DEĞİŞTİRMİYOR. Paralel olarak çalışıyor:
   - Her store mutation sonrası: store değişen kaydı yeni tablolara da
     gönderiyor (recipes, ingredients, ...)
   - Pull: ilk önce yeni tablolardan dene (per-record updatedAt merge),
     başarısız veya yetersizse cloud.js'in eski tek-blob pull'u devreye
     giriyor (fallback)

   AVANTAJI: Eğer per-table sync'te bir bug çıkarsa, tek-blob sync hala
   güncel veriye sahip — kullanıcı veri kaybetmiyor. Faz 4'te eski sistem
   kapatılacak.

   STORE INTEGRATION:
   - store.js'de upsertRecipe, deleteRecipe, vs. fonksiyonları sonunda
     PCD.cloudPerTable.queueUpsert(...) veya queueDelete(...) çağırıyor
   - Bu modül batch debounce ile cloud'a gönderiyor (her keystroke
     için ayrı upsert atmak yerine)
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  // Tablo adları → state path'leri eşleştirme
  // Her tabloda "data" jsonb kolonu var, içerik state'ten geliyor.
  // workspace_id mevcut storenamespace'inden alınıyor.
  const WORKSPACE_TABLES = {
    recipes:              { stateKey: 'recipes',              wsScoped: true },
    ingredients:          { stateKey: 'ingredients',          wsScoped: true },
    menus:                { stateKey: 'menus',                wsScoped: true },
    events:               { stateKey: 'events',               wsScoped: true },
    suppliers:            { stateKey: 'suppliers',            wsScoped: true },
    canvases:             { stateKey: 'canvases',             wsScoped: true },
    shopping_lists:       { stateKey: 'shoppingLists',        wsScoped: true },
    checklist_templates:  { stateKey: 'checklistTemplates',   wsScoped: true },
    // v2.6.72 — Faz 4 Adım 2: Eksik tablolar (mapping ile generic API'den geçenler)
    stock_count_history:  { stateKey: 'stockCountHistory',    wsScoped: true },
    haccp_logs:           { stateKey: 'haccpLogs',            wsScoped: true },
    haccp_units:          { stateKey: 'haccpUnits',           wsScoped: true },
    haccp_readings:       { stateKey: 'haccpReadings',        wsScoped: true },
    haccp_cook_cool:      { stateKey: 'haccpCookCool',        wsScoped: true },
    // Array tablolar (ayrı queueArraySync API'si ile yazılır)
    waste:                { stateKey: 'waste',                wsScoped: true, isArray: true },
    checklist_sessions:   { stateKey: 'checklistSessions',    wsScoped: true, isArray: true },
  };

  // Pending changes queue. Her item: { table, op, id, wsId?, data?, updated_at? }
  // Debounced flush — same record updated multiple times = single upsert.
  const queue = [];
  const queueIndex = {};  // dedupe key → queue index
  let flushTimer = null;
  const FLUSH_DELAY_MS = 600;

  // ============ v2.6.95 — QUEUE PERSISTENCE ============
  // Sorun: queue JS hafızasında. Offline yazımda (Wi-Fi kesik mutfakta) sekme
  // kapanırsa cloud'a hiç gitmemiş yazımlar uçuyordu. Çözüm: her queue
  // mutation'ı IDB'ye persist et; boot'ta yükle; online olunca flush et.
  // Idempotent — flushNow upsert'leri onConflict kullanıyor, duplicate güvenli.
  const QUEUE_IDB_KEY = 'pertable_queue';
  const QUEUE_PERSIST_DELAY_MS = 250;
  let _queuePersistTimer = null;

  function _persistQueueNow() {
    _queuePersistTimer = null;
    if (!PCD.idb || !PCD.idb.put) return;
    // Snapshot al — queue arada mutate olabilir
    const snapshot = queue.slice();
    PCD.idb.put('state', QUEUE_IDB_KEY, snapshot).catch(function (e) {
      PCD.warn && PCD.warn('queue persist failed:', e && e.message);
    });
  }

  function _persistQueueDebounced() {
    if (_queuePersistTimer) clearTimeout(_queuePersistTimer);
    _queuePersistTimer = setTimeout(_persistQueueNow, QUEUE_PERSIST_DELAY_MS);
  }

  function _clearPersistedQueue() {
    if (!PCD.idb || !PCD.idb.delete) return;
    if (_queuePersistTimer) { clearTimeout(_queuePersistTimer); _queuePersistTimer = null; }
    PCD.idb.delete('state', QUEUE_IDB_KEY).catch(function () {});
  }

  function _loadPersistedQueue() {
    if (!PCD.idb || !PCD.idb.get) return Promise.resolve();
    return PCD.idb.get('state', QUEUE_IDB_KEY).then(function (saved) {
      if (!saved || !Array.isArray(saved) || saved.length === 0) return;
      // Persisted item'ları queue'ya ekle. Eğer aynı dedupeKey için canlı
      // queue'da daha yeni item varsa, persisted'i atla (race koruması).
      let added = 0;
      saved.forEach(function (item) {
        if (!item || !item.table || !item.id) return;
        const dedupeKey = item.table + ':' + item.id + (item.wsId ? ':' + item.wsId : '');
        if (queueIndex[dedupeKey] !== undefined) return;
        queueIndex[dedupeKey] = queue.length;
        queue.push(item);
        added++;
      });
      if (added > 0) {
        PCD.log && PCD.log('cloud-pertable: loaded ' + added + ' persisted queue items');
        // Online + ready ise flush'ı tetikle. Değilse online listener veya bir
        // sonraki user mutation tetikleyecek.
        if (isReady() && navigator.onLine) {
          scheduleFlush();
        }
      }
    }).catch(function (e) {
      PCD.warn && PCD.warn('queue load failed:', e && e.message);
    });
  }

  function isReady() {
    if (!PCD.cloud || !PCD.cloud.ready) return false;
    const user = PCD.store && PCD.store.get('user');
    return !!(user && user.id);
  }

  function queueUpsert(table, id, wsId, data) {
    if (!WORKSPACE_TABLES[table] && table !== 'workspaces' && table !== 'inventory' && table !== 'user_prefs' && table !== 'workspace_tombstones') {
      PCD.warn && PCD.warn('cloud-pertable: unknown table', table);
      return;
    }
    const dedupeKey = table + ':' + id + (wsId ? ':' + wsId : '');
    const item = {
      table: table,
      op: 'upsert',
      id: id,
      wsId: wsId || null,
      data: data,
      updated_at: new Date().toISOString(),
    };
    if (queueIndex[dedupeKey] !== undefined) {
      // Replace existing pending upsert with newer data
      queue[queueIndex[dedupeKey]] = item;
    } else {
      queueIndex[dedupeKey] = queue.length;
      queue.push(item);
    }
    scheduleFlush();
    _persistQueueDebounced();
  }

  function queueDelete(table, id, wsId) {
    const dedupeKey = table + ':' + id + (wsId ? ':' + wsId : '');
    const item = {
      table: table,
      op: 'delete',
      id: id,
      wsId: wsId || null,
    };
    if (queueIndex[dedupeKey] !== undefined) {
      queue[queueIndex[dedupeKey]] = item;
    } else {
      queueIndex[dedupeKey] = queue.length;
      queue.push(item);
    }
    scheduleFlush();
    _persistQueueDebounced();
  }

  // v2.6.72 — Array tablolar için (waste, checklist_sessions).
  // Bu tablolar state'te { wsId: [array] } şeklinde tutulur, generic
  // upsertInTable API'sinden geçmezler. writeWaste/writeSessions her
  // çağrıldığında array tamamı verilir; eski ve yeni array'i karşılaştırıp
  // sadece değişen kayıtları cloud'a göndeririz.
  //
  // Strateji: yeni array'deki tüm ID'leri queueUpsert et (cloud-pertable'ın
  // dedupe queue'su zaten aynı ID'yi gelse 2. kez yazmaz). Eski array'de
  // olup yenisinde olmayan ID'ler queueDelete edilir.
  //
  // Args:
  //   table   — SQL tablo adı (waste, checklist_sessions)
  //   wsId    — workspace ID
  //   oldArr  — önceki array (null ise hepsi insert)
  //   newArr  — yeni array
  function queueArraySync(table, wsId, oldArr, newArr) {
    if (!WORKSPACE_TABLES[table] || !WORKSPACE_TABLES[table].isArray) {
      PCD.warn && PCD.warn('cloud-pertable queueArraySync: not array table', table);
      return;
    }
    const oldMap = {};
    (oldArr || []).forEach(function (it) { if (it && it.id) oldMap[it.id] = it; });
    const newMap = {};
    (newArr || []).forEach(function (it) { if (it && it.id) newMap[it.id] = it; });

    // Upsert: yeni array'in tamamı (queue dedupe zaten halleder)
    Object.keys(newMap).forEach(function (id) {
      queueUpsert(table, id, wsId, newMap[id]);
    });
    // Delete: eski'de olup yeni'de olmayan ID'ler
    Object.keys(oldMap).forEach(function (id) {
      if (!newMap[id]) queueDelete(table, id, wsId);
    });
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushNow, FLUSH_DELAY_MS);
  }

  function flushNow() {
    flushTimer = null;
    if (!isReady()) return Promise.resolve();
    if (!queue.length) return Promise.resolve();
    if (!navigator.onLine) {
      // Will retry when online listener fires (cloud.js handles it)
      return Promise.resolve();
    }
    // v2.6.85 — Pull devam ediyorsa push'u ertele.
    if (PCD.cloud && PCD.cloud.isPullInProgress && PCD.cloud.isPullInProgress()) {
      flushTimer = setTimeout(flushNow, 200);
      return Promise.resolve();
    }
    const batch = queue.splice(0, queue.length);
    // Reset index
    Object.keys(queueIndex).forEach(function (k) { delete queueIndex[k]; });

    const supabase = PCD.cloud.getClient();
    const user = PCD.store.get('user');

    // Group by table+op for batch upsert/delete
    const byOp = {};
    batch.forEach(function (it) {
      const k = it.table + ':' + it.op;
      if (!byOp[k]) byOp[k] = [];
      byOp[k].push(it);
    });

    // v2.6.93 — forEach yerine map → Promise.all. flushNow artık tüm batch
    // işlemleri tamamlanana kadar await edilebilir. Restore akışı bunu kullanır.
    const ops = Object.keys(byOp).map(function (k) {
      const items = byOp[k];
      const table = items[0].table;
      const op = items[0].op;

      if (op === 'upsert') {
        const rows = items.map(function (it) {
          const row = {
            id: it.id,
            user_id: user.id,
            data: it.data,
          };
          if (table === 'workspaces') {
            // v2.6.84 — Workspaces tablosunda 'data' jsonb kolonu YOK,
            // sadece flat kolonlar var (v2.6.66 şeması). Bu yüzden default
            // olarak eklenen row.data alanını kaldır.
            delete row.data;
            row.name = (it.data && it.data.name) || '';
            row.concept = (it.data && it.data.concept) || null;
            row.role = (it.data && it.data.role) || null;
            row.city = (it.data && it.data.city) || null;
            row.color = (it.data && it.data.color) || null;
            row.period_start = (it.data && it.data.periodStart) || null;
            row.period_end = (it.data && it.data.periodEnd) || null;
            row.archived = !!(it.data && it.data.archived);
            row.is_active = false;  // active flag user_prefs.active_workspace_id'de
            row.deleted_at = (it.data && it.data._deletedAt) || null;
          } else if (table === 'inventory') {
            row.workspace_id = it.wsId;
            row.ingredient_id = it.data && it.data.ingredient_id;
          } else if (table === 'user_prefs') {
            // user_prefs primary key user_id, id sütunu yok
            return {
              user_id: user.id,
              data: it.data,
              active_workspace_id: it.data && it.data.activeWorkspaceId,
            };
          } else if (table === 'workspace_tombstones') {
            return {
              workspace_id: it.id,
              user_id: user.id,
              deleted_at: (it.data && it.data.deletedAt) || new Date().toISOString(),
            };
          } else {
            row.workspace_id = it.wsId;
            row.deleted_at = (it.data && it.data._deletedAt) || null;
          }
          return row;
        });

        const conflictKey = (table === 'user_prefs') ? 'user_id'
                          : (table === 'workspace_tombstones') ? 'workspace_id'
                          : 'id';
        return supabase.from(table).upsert(rows, { onConflict: conflictKey })
          .then(function (res) {
            if (res.error) PCD.warn && PCD.warn('cloud-pertable upsert ' + table, res.error.message || res.error);
          })
          .catch(function (e) { PCD.warn && PCD.warn('cloud-pertable exception ' + table, e); });
      } else if (op === 'delete') {
        const ids = items.map(function (it) { return it.id; });
        return supabase.from(table).delete().in('id', ids).eq('user_id', user.id)
          .then(function (res) {
            if (res.error) PCD.warn && PCD.warn('cloud-pertable delete ' + table, res.error.message || res.error);
          })
          .catch(function (e) { PCD.warn && PCD.warn('cloud-pertable delete exception ' + table, e); });
      }
      return Promise.resolve();
    });

    return Promise.all(ops).then(function () {
      // v2.6.95 — Flush başarılı tamamlandı; queue mevcut durumunu IDB'ye
      // yansıt. Splice batch'i çıkardı; bu sırada başka queueUpsert/Delete
      // gelmiş olabilir (yeni item'lar queue'da, eski'ler değil). Persist
      // güncel halini diske yazar.
      _persistQueueNow();
    });
  }

  // ============ PULL ============
  // Pulls ALL user data from new per-table tables.
  // Returns Promise<{ workspaces, recipes, ingredients, ..., user_prefs }>
  //
  // v2.6.74 — Faz 4 Adım 4: tüm tablolardan veri çekiyoruz (waste,
  // checklist_sessions, stock_count_history, haccp×4, workspace_tombstones
  // dahil). Soft-deleted kayıtlar (deleted_at IS NOT NULL veya
  // data._deletedAt set) DAHİL ediliyor — cloud.js:pull() merge mantığı
  // bunlara ihtiyaç duyuyor (newest-wins karşılaştırma için).
  //
  // Tablo bazında paralel fetch, sonra workspace-id'ye göre namespace
  // edilmiş state objesi döner (eski format ile uyumlu).
  function pullAll() {
    if (!isReady()) return Promise.resolve(null);
    const supabase = PCD.cloud.getClient();
    const user = PCD.store.get('user');

    const fetches = [
      supabase.from('workspaces').select('*').eq('user_id', user.id),
      supabase.from('recipes').select('*').eq('user_id', user.id),
      supabase.from('ingredients').select('*').eq('user_id', user.id),
      supabase.from('menus').select('*').eq('user_id', user.id),
      supabase.from('events').select('*').eq('user_id', user.id),
      supabase.from('suppliers').select('*').eq('user_id', user.id),
      supabase.from('canvases').select('*').eq('user_id', user.id),
      supabase.from('shopping_lists').select('*').eq('user_id', user.id),
      supabase.from('checklist_templates').select('*').eq('user_id', user.id),
      supabase.from('inventory').select('*').eq('user_id', user.id),
      supabase.from('user_prefs').select('*').eq('user_id', user.id).maybeSingle(),
      // v2.6.74 — yeni tablolar
      supabase.from('waste').select('*').eq('user_id', user.id),
      supabase.from('checklist_sessions').select('*').eq('user_id', user.id),
      supabase.from('stock_count_history').select('*').eq('user_id', user.id),
      supabase.from('haccp_logs').select('*').eq('user_id', user.id),
      supabase.from('haccp_units').select('*').eq('user_id', user.id),
      supabase.from('haccp_readings').select('*').eq('user_id', user.id),
      supabase.from('haccp_cook_cool').select('*').eq('user_id', user.id),
      supabase.from('workspace_tombstones').select('*').eq('user_id', user.id),
    ];

    return Promise.all(fetches).then(function (results) {
      const errors = results.filter(function (r) { return r.error; });
      if (errors.length > 0) {
        PCD.warn && PCD.warn('cloud-pertable pull errors:', errors.map(function (r) { return r.error.message; }));
        return null;
      }
      const [wsRes, recipesRes, ingsRes, menusRes, evRes, suppRes,
             canvRes, shopRes, chkRes, invRes, prefsRes,
             wasteRes, chkSessRes, stockHistRes,
             haccpLogsRes, haccpUnitsRes, haccpReadingsRes, haccpCookCoolRes,
             tombsRes] = results;

      // Build state in the format store.js expects:
      // workspaces: { wsId: ws }
      // recipes: { wsId: { recipeId: recipe } }
      // user_prefs: { ... } flat

      const state = {};

      // Workspaces flat → { wsId: { id, name, ... } }
      // v2.6.74 — soft-deleted ws'leri DAHİL ediyoruz (_deletedAt mark'lı).
      // cloud.js:pull() merge mantığı bunlara ihtiyaç duyar.
      state.workspaces = {};
      (wsRes.data || []).forEach(function (w) {
        const wsData = w.data || {
          id: w.id,
          name: w.name,
          concept: w.concept,
          role: w.role,
          city: w.city,
          color: w.color,
          periodStart: w.period_start,
          periodEnd: w.period_end,
          archived: w.archived,
        };
        // Server'da deleted_at varsa state'te _deletedAt olarak işaretle
        if (w.deleted_at && !wsData._deletedAt) {
          wsData._deletedAt = w.deleted_at;
        }
        state.workspaces[w.id] = wsData;
      });

      // user_prefs
      state.activeWorkspaceId = (prefsRes.data && prefsRes.data.active_workspace_id) || null;
      const prefsData = (prefsRes.data && prefsRes.data.data) || {};
      state.prefs = prefsData.prefs || {};
      state.plan = prefsData.plan || 'free';
      state.onboarding = prefsData.onboarding || {};
      state.costHistory = prefsData.costHistory || [];

      // Workspace-scoped tables → { wsId: { id: row.data, ... } }
      // v2.6.74 — soft-deleted satırları DAHİL et, _deletedAt ile mark.
      function packByWs(rows) {
        const out = {};
        (rows || []).forEach(function (r) {
          const recordData = r.data || {};
          // server-side deleted_at varsa data._deletedAt'e yansıt
          if (r.deleted_at && !recordData._deletedAt) {
            recordData._deletedAt = r.deleted_at;
          }
          if (!out[r.workspace_id]) out[r.workspace_id] = {};
          out[r.workspace_id][r.id] = recordData;
        });
        return out;
      }

      state.recipes = packByWs(recipesRes.data);
      state.ingredients = packByWs(ingsRes.data);
      state.menus = packByWs(menusRes.data);
      state.events = packByWs(evRes.data);
      state.suppliers = packByWs(suppRes.data);
      state.canvases = packByWs(canvRes.data);
      state.shoppingLists = packByWs(shopRes.data);
      state.checklistTemplates = packByWs(chkRes.data);
      // v2.6.74 — yeni map-yapılı tablolar
      state.stockCountHistory = packByWs(stockHistRes.data);
      state.haccpLogs = packByWs(haccpLogsRes.data);
      state.haccpUnits = packByWs(haccpUnitsRes.data);
      state.haccpReadings = packByWs(haccpReadingsRes.data);
      state.haccpCookCool = packByWs(haccpCookCoolRes.data);

      // Inventory: { wsId: { ingredientId: row.data } }
      state.inventory = {};
      (invRes.data || []).forEach(function (r) {
        if (!state.inventory[r.workspace_id]) state.inventory[r.workspace_id] = {};
        state.inventory[r.workspace_id][r.ingredient_id] = r.data;
      });

      // v2.6.74 — Array tablolar (waste, checklist_sessions): { wsId: [items] }
      function packArrayByWs(rows) {
        const tmp = {};  // wsId → { id: item }
        (rows || []).forEach(function (r) {
          const recordData = r.data || {};
          if (r.deleted_at && !recordData._deletedAt) {
            recordData._deletedAt = r.deleted_at;
          }
          if (!tmp[r.workspace_id]) tmp[r.workspace_id] = {};
          tmp[r.workspace_id][r.id] = recordData;
        });
        // Map → array (her ws için item array'i)
        const out = {};
        Object.keys(tmp).forEach(function (wsId) {
          out[wsId] = Object.values(tmp[wsId]);
        });
        return out;
      }
      state.waste = packArrayByWs(wasteRes.data);
      state.checklistSessions = packArrayByWs(chkSessRes.data);

      // v2.6.74 — Workspace tombstones: { wsId: deletedAt }
      state._deletedWorkspaces = {};
      (tombsRes.data || []).forEach(function (t) {
        state._deletedWorkspaces[t.workspace_id] = t.deleted_at;
      });

      return state;
    }).catch(function (e) {
      PCD.warn && PCD.warn('cloud-pertable pull exception', e);
      return null;
    });
  }

  // ============ PUBLIC API ============

  // v2.6.93 — Backup restore'u "tam geri yükleme" garantisi için cloud'daki
  // tüm user verisini RLS user_id eşleşmesi ile DELETE eder. Restore akışı:
  // wipeAllUserData → store.replaceAll → store.flushSync → queueFullState →
  // flushNow → reload. Bu fonksiyon yalnızca DB tablolarını temizler; foto
  // orphan'ları Storage'da kalır (mevcut yedek geri yüklendiğinde foto URL'leri
  // tekrar referanslanır, sorun yok). Tablo bazında DELETE atomic değil; bir
  // tablo başarısız olursa diğerleri yine silinir, kullanıcıya hata döner.
  function wipeAllUserData() {
    if (!isReady()) return Promise.resolve(false);
    const supabase = PCD.cloud.getClient();
    const user = PCD.store.get('user');
    if (!user || !user.id) return Promise.resolve(false);

    // Pending queue ve flush timer'ı sıfırla — yarışı engelle.
    Object.keys(queueIndex).forEach(function (k) { delete queueIndex[k]; });
    queue.length = 0;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    // v2.6.95 — IDB'deki persisted queue'yu da temizle ki reload sonrası
    // boot _loadPersistedQueue yapay item'ları geri yüklemesin.
    _clearPersistedQueue();

    const tables = [
      'recipes', 'ingredients', 'menus', 'events', 'suppliers',
      'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
      'waste', 'checklist_sessions', 'stock_count_history',
      'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
      'workspace_tombstones', 'workspaces', 'user_prefs',
    ];

    return Promise.all(tables.map(function (t) {
      return supabase.from(t).delete().eq('user_id', user.id)
        .then(function (res) {
          if (res.error) {
            PCD.warn && PCD.warn('wipeAllUserData ' + t, res.error.message || res.error);
            return { table: t, ok: false };
          }
          return { table: t, ok: true };
        })
        .catch(function (e) {
          PCD.warn && PCD.warn('wipeAllUserData exception ' + t, e);
          return { table: t, ok: false };
        });
    })).then(function (results) {
      const failed = results.filter(function (r) { return !r.ok; });
      if (failed.length > 0) {
        PCD.warn && PCD.warn('wipeAllUserData partial failures:',
          failed.map(function (f) { return f.table; }).join(','));
        return false;
      }
      return true;
    });
  }

  // v2.6.93 — Restore sonrası mevcut state'in tamamını cloud queue'ya doldurur.
  // Wipe yapılmış cloud'a yeni veriyi push etmek için kullanılır. Mevcut
  // queueUpsert/queueArraySync API'lerini kullanır — flushNow row builder'ları
  // burada da geçerli, çift kod yok.
  function queueFullState() {
    if (!isReady()) return;
    const state = PCD.store && PCD.store._read ? PCD.store._read('') : null;
    if (!state) {
      PCD.warn && PCD.warn('queueFullState: no state');
      return;
    }

    // 1. Workspaces (top-level)
    const ws = state.workspaces || {};
    Object.keys(ws).forEach(function (wsId) {
      if (ws[wsId]) queueUpsert('workspaces', wsId, null, ws[wsId]);
    });

    // 2. Workspace-scoped key/value tablolar
    // [stateKey, sqlTable]
    const wsKeys = [
      ['recipes',             'recipes'],
      ['ingredients',         'ingredients'],
      ['menus',               'menus'],
      ['events',              'events'],
      ['suppliers',           'suppliers'],
      ['canvases',            'canvases'],
      ['shoppingLists',       'shopping_lists'],
      ['checklistTemplates',  'checklist_templates'],
      ['stockCountHistory',   'stock_count_history'],
      ['haccpLogs',           'haccp_logs'],
      ['haccpUnits',          'haccp_units'],
      ['haccpReadings',       'haccp_readings'],
      ['haccpCookCool',       'haccp_cook_cool'],
    ];
    wsKeys.forEach(function (pair) {
      const stateKey = pair[0];
      const table = pair[1];
      const data = state[stateKey] || {};
      Object.keys(data).forEach(function (wsId) {
        const records = data[wsId] || {};
        Object.keys(records).forEach(function (id) {
          const rec = records[id];
          if (rec) queueUpsert(table, id, wsId, rec);
        });
      });
    });

    // 3. Inventory: { wsId: { ingId: { ingredient_id, ... } } }
    const inv = state.inventory || {};
    Object.keys(inv).forEach(function (wsId) {
      const items = inv[wsId] || {};
      Object.keys(items).forEach(function (ingId) {
        if (items[ingId]) queueUpsert('inventory', ingId, wsId, items[ingId]);
      });
    });

    // 4. Array tabloları: waste, checklistSessions
    const waste = state.waste || {};
    Object.keys(waste).forEach(function (wsId) {
      const arr = waste[wsId];
      if (Array.isArray(arr) && arr.length > 0) {
        queueArraySync('waste', wsId, [], arr);
      }
    });
    const sessions = state.checklistSessions || {};
    Object.keys(sessions).forEach(function (wsId) {
      const arr = sessions[wsId];
      if (Array.isArray(arr) && arr.length > 0) {
        queueArraySync('checklist_sessions', wsId, [], arr);
      }
    });

    // 5. user_prefs (single row, PK user_id)
    // Pull mantığı (cloud-pertable.js içinde) user_prefs.data jsonb'sinden
    // şu üst-anahtarları arıyor: prefs, plan, onboarding, costHistory.
    // setActiveWorkspaceId aynı yapıyı yazıyor, queueFullState de aynısını
    // yazmalı.
    queueUpsert('user_prefs', 'user_prefs', null, {
      activeWorkspaceId: state.activeWorkspaceId || null,
      prefs:        state.prefs        || {},
      plan:         state.plan         || 'free',
      onboarding:   state.onboarding   || {},
      costHistory:  state.costHistory  || [],
    });
  }

  PCD.cloudPerTable = {
    queueUpsert: queueUpsert,
    queueDelete: queueDelete,
    queueArraySync: queueArraySync,  // v2.6.72 — array tablolar için
    flushNow: flushNow,
    pullAll: pullAll,
    // v2.6.93 — restore akışı için
    wipeAllUserData: wipeAllUserData,
    queueFullState: queueFullState,
    // Re-flush queued items when back online
    onOnline: function () {
      if (queue.length) scheduleFlush();
    },
  };

  // Wire online listener to retry pending writes
  window.addEventListener('online', function () {
    if (PCD.cloudPerTable.onOnline) PCD.cloudPerTable.onOnline();
  });

  // v2.6.95 — Boot init: IDB'de bekleyen kuyruk varsa yükle. Async,
  // beklemiyoruz — yüklenince scheduleFlush kendi başına tetiklenir.
  // Diğer modüller (cloud, store) henüz hazır olmayabilir; flush isReady()
  // koşulunu kontrol ediyor, ready olunca tetiklenecek.
  _loadPersistedQueue();
})();
