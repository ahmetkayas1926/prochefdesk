/* ================================================================
   ProChefDesk — cloud-migrate-v4.js (v2.6.73)

   Multi-device sync, Faz 4 Adım 3: Tek seferlik blob → per-table
   migration script.

   AMAÇ:
   v2.6.71'de oluşturulan ve v2.6.72'de çift yazma desteği eklenen
   yeni tablolara, MEVCUT user_data blob'undaki tüm veriyi tek
   seferlik kopyalamak. Migration sonrasında:
   - Yeni veriler her iki yere yazılmaya devam ediyor (v2.6.72 hala aktif)
   - Eski veriler artık yeni tablolarda da var
   - v2.6.74 pull priority'i değiştirebilir

   STRATEJİ:
   1. Login sonrası cloud.pull() biter (state lokalde hazır)
   2. Migration flag'ini kontrol et (user_prefs.data.migrationFazV4Done)
   3. Flag yoksa veya false ise → migrate başla
   4. Tüm tablolardaki kayıtları cloudPerTable.queueUpsert ile gönder
      (cloud-pertable.js'in queue/dedupe/debounce mantığı kullanılır)
   5. flushNow ile hemen göndermeyi tetikle
   6. Tamamlanınca flag'i true yap, user_prefs'i upsert et

   IDEMPOTENT:
   - Aynı kullanıcı tekrar login olduğunda flag kontrolü ile
     migration atlanır.
   - Flag cloud'da (multi-device safe). Tarayıcı cache'i temizlense
     bile pull sonrası flag gelir.
   - Tüm yazımlar UPSERT — aynı veri 2. kez yazılsa zarar vermez,
     sadece gereksiz trafik.

   HATA TOLERANSI:
   - Tek tek kayıt başarısız olabilir (cloud-pertable PCD.warn loglar).
   - Migration bütünüyle başarısız olursa flag yazılmaz, sonraki
     login'de tekrar dener.
   - Şef hiçbir şey görmez (toast YOK, modal YOK) — sessiz arka plan.

   PERFORMANS:
   - 70 ingredient + 50 recipe + ~20 workspace-bound kayıt = ~150 upsert.
   - cloud-pertable batch upsert kullanıyor (tablo başına tek HTTP istek).
   - Toplam: ~10-15 HTTP isteği, < 5 saniye. PWA arka planda yapar.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  const MIGRATION_FLAG = 'migrationFazV4Done';
  const FLAG_VERSION = 1;  // flag versiyonu, gelecekte yeniden migrate gerekirse artırılır

  // Eski state-key → SQL tablo eşlemesi. Her birinde data { wsId: { id: item } }
  // şeklinde (HACCP×4, stockCountHistory dahil).
  const WS_SCOPED_TABLES = [
    { stateKey: 'recipes',             sqlTable: 'recipes' },
    { stateKey: 'ingredients',         sqlTable: 'ingredients' },
    { stateKey: 'menus',               sqlTable: 'menus' },
    { stateKey: 'events',              sqlTable: 'events' },
    { stateKey: 'suppliers',           sqlTable: 'suppliers' },
    { stateKey: 'canvases',            sqlTable: 'canvases' },
    { stateKey: 'shoppingLists',       sqlTable: 'shopping_lists' },
    { stateKey: 'checklistTemplates',  sqlTable: 'checklist_templates' },
    { stateKey: 'stockCountHistory',   sqlTable: 'stock_count_history' },
    { stateKey: 'haccpLogs',           sqlTable: 'haccp_logs' },
    { stateKey: 'haccpUnits',          sqlTable: 'haccp_units' },
    { stateKey: 'haccpReadings',       sqlTable: 'haccp_readings' },
    { stateKey: 'haccpCookCool',       sqlTable: 'haccp_cook_cool' },
  ];

  // Array tablolar — { wsId: [array] }, queueArraySync ile yazılır
  const ARRAY_TABLES = [
    { stateKey: 'waste',              sqlTable: 'waste' },
    { stateKey: 'checklistSessions',  sqlTable: 'checklist_sessions' },
  ];

  // Migration durumu
  let migrationInProgress = false;

  function isReady() {
    if (!PCD.cloud || !PCD.cloud.ready) return false;
    if (!PCD.cloudPerTable) return false;
    const user = PCD.store && PCD.store.get('user');
    return !!(user && user.id);
  }

  // user_prefs cloud'undan flag oku.
  // Lokal state.prefs'te de tutuyoruz (pull sonrası prefsData.prefs olarak gelir).
  function getMigrationFlag() {
    const prefs = PCD.store.get('prefs') || {};
    return prefs[MIGRATION_FLAG] === FLAG_VERSION;
  }

  function setMigrationFlag() {
    // Lokal state'i güncelle
    const prefs = Object.assign({}, PCD.store.get('prefs') || {});
    prefs[MIGRATION_FLAG] = FLAG_VERSION;
    PCD.store.set('prefs', prefs);
    // Cloud user_prefs upsert et (migration tamamlandı işareti)
    if (PCD.cloudPerTable) {
      PCD.cloudPerTable.queueUpsert('user_prefs', null, null, {
        activeWorkspaceId: PCD.store.get('activeWorkspaceId'),
        prefs: prefs,
        plan: PCD.store.get('plan'),
        onboarding: PCD.store.get('onboarding'),
        costHistory: PCD.store.get('costHistory'),
      });
    }
  }

  // Tek bir workspace-scoped tabloyu migrate et.
  // state[stateKey] = { wsId: { id: item } } yapısında olmalı.
  function migrateWsScopedTable(stateKey, sqlTable) {
    const data = PCD.store.get(stateKey) || {};
    let count = 0;
    Object.keys(data).forEach(function (wsId) {
      const items = data[wsId];
      if (!items || typeof items !== 'object') return;
      Object.keys(items).forEach(function (id) {
        const item = items[id];
        if (!item) return;
        // Soft-deleted kayıtları da yaz — _deletedAt sayesinde server'da
        // silinmiş gibi görünür ve sonraki pull'da filtrelenir.
        PCD.cloudPerTable.queueUpsert(sqlTable, id, wsId, item);
        count++;
      });
    });
    return count;
  }

  // Workspace tablosu özel: { wsId: ws } → her ws için upsert (wsId NULL,
  // çünkü workspaces tablosu kendisi top-level).
  function migrateWorkspaces() {
    const wss = PCD.store.get('workspaces') || {};
    let count = 0;
    Object.keys(wss).forEach(function (wsId) {
      const ws = wss[wsId];
      if (!ws) return;
      PCD.cloudPerTable.queueUpsert('workspaces', wsId, null, ws);
      count++;
    });
    return count;
  }

  // Workspace tombstones: _deletedWorkspaces = { wsId: deletedAt }
  function migrateWorkspaceTombstones() {
    const tombs = PCD.store.get('_deletedWorkspaces') || {};
    let count = 0;
    Object.keys(tombs).forEach(function (wsId) {
      const deletedAt = tombs[wsId];
      PCD.cloudPerTable.queueUpsert('workspace_tombstones', wsId, null, {
        deletedAt: deletedAt || new Date().toISOString(),
      });
      count++;
    });
    return count;
  }

  // Inventory: { wsId: { ingredientId: { stock, parLevel, ... } } }
  // SQL tablosunda PK 'id' (text) ve workspace_id, ingredient_id kolonları var.
  // ID olarak workspace_id + ":" + ingredient_id kullanıyoruz (deterministik,
  // tekrar çalıştırmada aynı satırı update eder).
  function migrateInventory() {
    const inv = PCD.store.get('inventory') || {};
    let count = 0;
    Object.keys(inv).forEach(function (wsId) {
      const wsInv = inv[wsId];
      if (!wsInv || typeof wsInv !== 'object') return;
      Object.keys(wsInv).forEach(function (ingredientId) {
        const item = wsInv[ingredientId];
        if (!item) return;
        // Deterministik ID — aynı (ws, ingredient) çiftine bir daha yazılırsa
        // upsert tetiklenir, yeni satır yaratılmaz.
        const id = wsId + ':' + ingredientId;
        // data jsonb içine ingredient_id'i de yaz — flushNow inventory branch
        // bu alanı row.ingredient_id'e koyuyor.
        const dataWithIngId = Object.assign({}, item, { ingredient_id: ingredientId });
        PCD.cloudPerTable.queueUpsert('inventory', id, wsId, dataWithIngId);
        count++;
      });
    });
    return count;
  }

  // Array tabloları (waste, checklistSessions): { wsId: [items] }
  // queueArraySync API'si oldArr=null verdiğimde tüm yeni array'i upsert eder.
  function migrateArrayTable(stateKey, sqlTable) {
    const data = PCD.store.get(stateKey) || {};
    if (Array.isArray(data)) {
      // Legacy: flat array (workspace-bound öncesi). Şu an workspace varsayımı
      // olmadan migrate edemeyiz, atlayalım. (writeWaste/writeSessions zaten
      // bunu workspace altına migrate ediyor ilk kullanımda.)
      return 0;
    }
    let count = 0;
    Object.keys(data).forEach(function (wsId) {
      const arr = data[wsId];
      if (!Array.isArray(arr) || arr.length === 0) return;
      // queueArraySync(table, wsId, oldArr, newArr) — oldArr boş, hepsi insert
      PCD.cloudPerTable.queueArraySync(sqlTable, wsId, [], arr);
      count += arr.length;
    });
    return count;
  }

  // Ana migration fonksiyonu. Login sonrası cloud.pull() biter bitmez çağrılır.
  function runMigration() {
    if (migrationInProgress) {
      PCD.log && PCD.log('cloud-migrate-v4: already running, skipping');
      return Promise.resolve({ skipped: 'in_progress' });
    }
    if (!isReady()) {
      PCD.log && PCD.log('cloud-migrate-v4: not ready (no user / cloud)');
      return Promise.resolve({ skipped: 'not_ready' });
    }
    if (getMigrationFlag()) {
      PCD.log && PCD.log('cloud-migrate-v4: already migrated, skipping');
      return Promise.resolve({ skipped: 'already_done' });
    }

    migrationInProgress = true;
    PCD.log && PCD.log('cloud-migrate-v4: starting migration...');
    const t0 = Date.now();
    const stats = { workspaces: 0, tombstones: 0, inventory: 0, tables: {} };

    try {
      // 1. Workspaces (önce, çünkü diğer tablolar bunlara FK bağlı değil ama
      //    pull sırasında ws bilinmesi gerekir)
      stats.workspaces = migrateWorkspaces();
      // 2. Workspace tombstones
      stats.tombstones = migrateWorkspaceTombstones();
      // 3. Workspace-scoped tablolar (13 tane)
      WS_SCOPED_TABLES.forEach(function (m) {
        stats.tables[m.stateKey] = migrateWsScopedTable(m.stateKey, m.sqlTable);
      });
      // 4. Inventory (özel: composite ID)
      stats.inventory = migrateInventory();
      // 5. Array tablolar (waste, checklistSessions)
      ARRAY_TABLES.forEach(function (m) {
        stats.tables[m.stateKey] = migrateArrayTable(m.stateKey, m.sqlTable);
      });

      const total = stats.workspaces + stats.tombstones + stats.inventory
        + Object.values(stats.tables).reduce(function (a, b) { return a + b; }, 0);
      PCD.log && PCD.log('cloud-migrate-v4: queued', total, 'records', stats);

      // Queue'yu hemen flush et — debounce'u beklemeden
      return new Promise(function (resolve) {
        // Queue içeriği boş olabilir (kullanıcı yeni hesap, hiç veri yok).
        // O durumda da flag'i yazmamız lazım ki bir daha denenmesin.
        PCD.cloudPerTable.flushNow();
        // Flush asenkron — biraz bekle, sonra flag'i yaz
        setTimeout(function () {
          setMigrationFlag();
          PCD.cloudPerTable.flushNow();  // flag yazımını da göndertmek için
          migrationInProgress = false;
          const ms = Date.now() - t0;
          PCD.log && PCD.log('cloud-migrate-v4: complete in', ms, 'ms, total', total, 'records');
          resolve({ ok: true, total: total, ms: ms, stats: stats });
        }, 1500);
      });
    } catch (e) {
      migrationInProgress = false;
      PCD.warn && PCD.warn('cloud-migrate-v4: exception', e && e.message);
      // Flag'i yazma — sonraki login'de tekrar dener
      return Promise.reject(e);
    }
  }

  // ============ PUBLIC API ============
  PCD.cloudMigrateV4 = {
    runMigration: runMigration,
    getMigrationFlag: getMigrationFlag,
    // Geliştirici ve test için: flag'i sıfırla, migration tekrar çalışsın.
    // Konsoldan: PCD.cloudMigrateV4.resetFlag() → reload → tekrar migrate.
    resetFlag: function () {
      const prefs = Object.assign({}, PCD.store.get('prefs') || {});
      delete prefs[MIGRATION_FLAG];
      PCD.store.set('prefs', prefs);
      if (PCD.cloudPerTable) {
        PCD.cloudPerTable.queueUpsert('user_prefs', null, null, {
          activeWorkspaceId: PCD.store.get('activeWorkspaceId'),
          prefs: prefs,
          plan: PCD.store.get('plan'),
          onboarding: PCD.store.get('onboarding'),
          costHistory: PCD.store.get('costHistory'),
        });
      }
      PCD.log && PCD.log('cloud-migrate-v4: flag reset');
    },
  };
})();
