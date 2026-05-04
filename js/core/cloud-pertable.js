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
    if (!isReady()) return;
    if (!queue.length) return;
    if (!navigator.onLine) {
      // Will retry when online listener fires (cloud.js handles it)
      return;
    }
    // v2.6.85 — Pull devam ediyorsa push'u ertele.
    if (PCD.cloud && PCD.cloud.isPullInProgress && PCD.cloud.isPullInProgress()) {
      flushTimer = setTimeout(flushNow, 200);
      return;
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

    Object.keys(byOp).forEach(function (k) {
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
            // workspace_tombstones: PK doğrudan workspace_id, id ve data
            // jsonb yok — minimal kayıt (ws silindi mi?). Yapı v2.6.71 SQL'inde:
            //   workspace_id text PK, user_id uuid, deleted_at timestamptz, created_at
            return {
              workspace_id: it.id,  // queueUpsert'ten gelen "id" parametresi aslında wsId
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
        supabase.from(table).upsert(rows, { onConflict: conflictKey })
          .then(function (res) {
            if (res.error) PCD.warn && PCD.warn('cloud-pertable upsert ' + table, res.error.message || res.error);
          })
          .catch(function (e) { PCD.warn && PCD.warn('cloud-pertable exception ' + table, e); });
      } else if (op === 'delete') {
        const ids = items.map(function (it) { return it.id; });
        supabase.from(table).delete().in('id', ids).eq('user_id', user.id)
          .then(function (res) {
            if (res.error) PCD.warn && PCD.warn('cloud-pertable delete ' + table, res.error.message || res.error);
          })
          .catch(function (e) { PCD.warn && PCD.warn('cloud-pertable delete exception ' + table, e); });
      }
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
  PCD.cloudPerTable = {
    queueUpsert: queueUpsert,
    queueDelete: queueDelete,
    queueArraySync: queueArraySync,  // v2.6.72 — array tablolar için
    flushNow: flushNow,
    pullAll: pullAll,
    // Re-flush queued items when back online
    onOnline: function () {
      if (queue.length) scheduleFlush();
    },
  };

  // Wire online listener to retry pending writes
  window.addEventListener('online', function () {
    if (PCD.cloudPerTable.onOnline) PCD.cloudPerTable.onOnline();
  });
})();
