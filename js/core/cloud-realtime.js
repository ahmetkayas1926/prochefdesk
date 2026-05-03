/* ================================================================
   ProChefDesk — cloud-realtime.js (v2.6.81 — workspace_tombstones eklendi: cross-device cascade wipe)

   Multi-device sync, Faz 3: Supabase Realtime channel.

   Bir cihaz değişiklik yaptığında (recipes, ingredients, vs. tablolarına
   yazma), diğer aynı kullanıcı oturumları açık olan cihazlar 1-2 saniye
   içinde otomatik güncellenir. Sayfa yenileme gerekmez.

   ÇALIŞMA ŞEKLİ:
   1. Login sonrası bu modül 19 tabloya subscribe olur.
   2. Postgres replication slot'tan gelen INSERT/UPDATE/DELETE event'leri
      bu kanaldan akar.
   3. Her event'te ilgili record store'a uygulanır (apply hook).
   4. Store değişikliği UI'a yayılır (mevcut emit sistemi).

   LOOP ÖNLEMI:
   - Cihaz A bir record yazıyor → cloud-pertable upsert → tablo güncellenir
   - Realtime aynı event'i Cihaz A'ya da gönderir
   - Bu modül "bu update'in updated_at'ı zaten store'umdaki ile aynı veya
     daha eski mi?" check'i yapar → ise atla. Sadece newer wins.

   PERFORMANS:
   - WebSocket tek bir bağlantı (Supabase 19 tablo için tek channel)
   - Her event ~1KB payload (sadece değişen record)
   - Idle bağlantı maliyeti yok (Supabase Free tier limit'leri)

   SUBSCRIBE EDİLMEYEN:
   - cost_history: tablo şeması v2.6.71'de açıldı ama bugüne dek hiçbir yere
     yazılmıyor — costHistory verisi user_prefs.data.costHistory içinde
     yaşıyor. Tabloyu Realtime'a almak şu an cargo-cult olur. Eğer ileride
     costHistory bu tabloya taşınırsa (user_prefs blob'undan ayrılırsa),
     o zaman binding eklenir.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;
  let channel = null;
  let subscribed = false;

  // v2.6.70 — After applying a Realtime change, refresh the current view
  // so the UI reflects the new data. We debounce this so multiple events
  // arriving in quick succession trigger only one re-render.
  let _refreshTimer = null;
  function scheduleViewRefresh() {
    if (_refreshTimer) return;
    _refreshTimer = setTimeout(function () {
      _refreshTimer = null;
      try {
        if (PCD.router && PCD.router.currentView) {
          const cur = PCD.router.currentView();
          if (cur && PCD.router.go) {
            // Re-render same view without history push
            PCD.router._renderView(cur, PCD.router.params(), { skipHistory: true });
          }
        }
      } catch (e) { /* ignore */ }
    }, 300);
  }

  // Realtime'dan gelen event'i store'a uygula. Eski version (updated_at
  // daha eski) ise atla — bizim local versiyon daha yeni.
  function applyChange(table, eventType, newRow, oldRow) {
    if (!PCD.store) return;
    try {
      switch (table) {
        case 'recipes': return applyToWsTable('recipes', eventType, newRow, oldRow);
        case 'ingredients': return applyToWsTable('ingredients', eventType, newRow, oldRow);
        case 'menus': return applyToWsTable('menus', eventType, newRow, oldRow);
        case 'events': return applyToWsTable('events', eventType, newRow, oldRow);
        case 'suppliers': return applyToWsTable('suppliers', eventType, newRow, oldRow);
        case 'canvases': return applyToWsTable('canvases', eventType, newRow, oldRow);
        case 'shopping_lists': return applyToWsTable('shoppingLists', eventType, newRow, oldRow);
        case 'checklist_templates': return applyToWsTable('checklistTemplates', eventType, newRow, oldRow);
        case 'workspaces': return applyToWorkspaces(eventType, newRow, oldRow);
        case 'inventory': return applyToInventory(eventType, newRow, oldRow);
        case 'user_prefs': return applyToUserPrefs(eventType, newRow, oldRow);
        // v2.6.77 — Array tablolar (Faz 4 Adım 5: Realtime kapsam genişletme)
        case 'waste': return applyToArrayWsTable('waste', eventType, newRow, oldRow);
        // v2.6.80 — checklist_sessions (array, soft-delete pattern v2.6.80)
        case 'checklist_sessions': return applyToArrayWsTable('checklistSessions', eventType, newRow, oldRow);
        // v2.6.80 — HACCP & stock map tabloları (workspace-scoped, soft-delete via store API)
        case 'haccp_logs': return applyToWsTable('haccpLogs', eventType, newRow, oldRow);
        case 'haccp_units': return applyToWsTable('haccpUnits', eventType, newRow, oldRow);
        case 'haccp_readings': return applyToWsTable('haccpReadings', eventType, newRow, oldRow);
        case 'haccp_cook_cool': return applyToWsTable('haccpCookCool', eventType, newRow, oldRow);
        case 'stock_count_history': return applyToWsTable('stockCountHistory', eventType, newRow, oldRow);
        // v2.6.81 — workspace silindi → diğer cihazlarda lokal cascade wipe
        case 'workspace_tombstones': return applyToTombstones(eventType, newRow, oldRow);
      }
    } catch (e) {
      PCD.warn && PCD.warn('cloud-realtime apply error', table, e);
    }
  }

  // Generic workspace-scoped record apply
  function applyToWsTable(stateKey, eventType, newRow, oldRow) {
    const row = newRow || oldRow;
    if (!row) return;
    const wsId = row.workspace_id;
    const id = row.id;
    if (!wsId || !id) return;
    const all = PCD.clone(PCD.store.get(stateKey) || {});
    if (!all[wsId]) all[wsId] = {};

    if (eventType === 'DELETE') {
      // Hard DELETE in DB. Remove from state too.
      if (all[wsId][id]) {
        delete all[wsId][id];
        PCD.store.set(stateKey, all);
        scheduleViewRefresh();
      }
      return;
    }

    // INSERT or UPDATE
    const incoming = newRow.data || {};
    const localExisting = all[wsId][id];

    // Last-write-wins by updatedAt. If local is newer, ignore incoming.
    if (localExisting && localExisting.updatedAt && incoming.updatedAt) {
      if (localExisting.updatedAt > incoming.updatedAt) return;
      if (localExisting.updatedAt === incoming.updatedAt) return; // no-op
    }

    // Apply (incoming includes _deletedAt if soft-deleted)
    all[wsId][id] = incoming;
    PCD.store.set(stateKey, all);
    scheduleViewRefresh();
  }

  function applyToWorkspaces(eventType, newRow, oldRow) {
    const row = newRow || oldRow;
    if (!row) return;
    const id = row.id;
    if (!id) return;
    const all = PCD.clone(PCD.store.get('workspaces') || {});

    if (eventType === 'DELETE') {
      if (all[id]) {
        delete all[id];
        PCD.store.set('workspaces', all);
        scheduleViewRefresh();
      }
      return;
    }

    const incoming = newRow.data || {};
    const local = all[id];
    if (local && local.updatedAt && incoming.updatedAt) {
      if (local.updatedAt >= incoming.updatedAt) return;
    }
    all[id] = incoming;
    PCD.store.set('workspaces', all);
    scheduleViewRefresh();
  }

  // v2.6.81 — workspace_tombstones özel hook. Şema diğerlerinden farklı:
  //   workspace_id text PK, user_id uuid, deleted_at timestamptz, created_at
  //   (id, data, updated_at YOK)
  //
  // Cihaz A bir workspace siler → store.deleteWorkspace lokali wipe eder
  // ve workspace_tombstones tablosuna upsert atar. Bu event Cihaz B'ye düşer.
  // B'nin yapması gerekenler:
  //   1) _deletedWorkspaces[wsId] = deleted_at  (gelecek pull merge'lerde diriltmeyi engellemek için)
  //   2) state.workspaces[wsId] var ise sil
  //   3) 16 ws-bound tablodaki [wsId] alanını sil (cascade wipe)
  //   4) activeWorkspaceId tombstone'lanan ws ise kalan bir ws'e geç
  //   5) Görünüm refresh
  //
  // DELETE event'i bu tabloda nadir (tombstone bir kez yazılıp kalır), ama
  // REPLICA IDENTITY DEFAULT yüzünden payload'da sadece workspace_id (PK)
  // gelir. Tombstone'un kendisinin silinmesi durumunda lokali de temizleriz.
  const WS_BOUND_TABLES = [
    'recipes','ingredients','menus','events','suppliers','canvases',
    'shoppingLists','checklistTemplates','inventory',
    'waste','checklistSessions','stockCountHistory',
    'haccpLogs','haccpUnits','haccpReadings','haccpCookCool'
  ];
  function applyToTombstones(eventType, newRow, oldRow) {
    const row = newRow || oldRow;
    if (!row) return;
    const wsId = row.workspace_id;
    if (!wsId) return;

    const tombs = PCD.clone(PCD.store.get('_deletedWorkspaces') || {});

    if (eventType === 'DELETE') {
      // Tombstone kaydının kendisi silindi (manual cleanup). Lokali de düş.
      if (tombs[wsId]) {
        delete tombs[wsId];
        PCD.store.set('_deletedWorkspaces', tombs);
      }
      return;
    }

    // INSERT / UPDATE — yeni tombstone geldi
    const deletedAt = newRow.deleted_at;
    if (!deletedAt) return;
    // Loop önleme: lokalde aynı veya daha yeni tombstone var ise atla
    if (tombs[wsId] && tombs[wsId] >= deletedAt) return;

    tombs[wsId] = deletedAt;
    PCD.store.set('_deletedWorkspaces', tombs);

    // Cascade wipe: workspaces map'inden ve ws-bound 16 tablodan ilgili wsId'yi düş.
    // store.set burada cloudPerTable'a queueUpsert ETMEZ (set sadece emit + persist),
    // dolayısıyla feedback loop yok.
    const wsMap = PCD.clone(PCD.store.get('workspaces') || {});
    let wsExisted = false;
    if (wsMap[wsId]) {
      delete wsMap[wsId];
      wsExisted = true;
      PCD.store.set('workspaces', wsMap);
    }

    WS_BOUND_TABLES.forEach(function (tbl) {
      const cur = PCD.store.get(tbl);
      if (cur && typeof cur === 'object' && cur[wsId] !== undefined) {
        const next = Object.assign({}, cur);
        delete next[wsId];
        PCD.store.set(tbl, next);
      }
    });

    // Active workspace tombstone'landı ise kalan ilk ws'e geç. Cihaz B'nin
    // user_prefs'i güncel kalsın diye direct set kullanıyoruz (cloud'a yansımayacak;
    // user_prefs Realtime'dan zaten güncellenmiş olabilir, ama olmamış ihtimaline
    // karşı lokali tutarlı tutuyoruz).
    const active = PCD.store.get('activeWorkspaceId');
    if (active === wsId) {
      const remainingIds = Object.keys(wsMap);
      if (remainingIds.length > 0) {
        PCD.store.set('activeWorkspaceId', remainingIds[0]);
      }
    }

    if (wsExisted || active === wsId) scheduleViewRefresh();
  }

  function applyToInventory(eventType, newRow, oldRow) {
    const row = newRow || oldRow;
    if (!row) return;
    const wsId = row.workspace_id;
    const ingId = row.ingredient_id;
    if (!wsId || !ingId) return;
    const all = PCD.clone(PCD.store.get('inventory') || {});
    if (!all[wsId]) all[wsId] = {};

    if (eventType === 'DELETE') {
      if (all[wsId][ingId]) {
        delete all[wsId][ingId];
        PCD.store.set('inventory', all);
        scheduleViewRefresh();
      }
      return;
    }

    all[wsId][ingId] = newRow.data;
    PCD.store.set('inventory', all);
    scheduleViewRefresh();
  }

  function applyToUserPrefs(eventType, newRow, oldRow) {
    if (eventType === 'DELETE') return;
    const data = (newRow && newRow.data) || {};
    if (newRow.active_workspace_id !== undefined) {
      // Don't overwrite if same — avoids feedback
      const cur = PCD.store.get('activeWorkspaceId');
      if (cur !== newRow.active_workspace_id) {
        PCD.store.set('activeWorkspaceId', newRow.active_workspace_id);
      }
    }
    if (data.prefs) PCD.store.set('prefs', data.prefs);
    if (data.plan) PCD.store.set('plan', data.plan);
  }

  // v2.6.77 — Array-shaped workspace-scoped table apply (waste, checklist_sessions)
  // State'te { wsId: [items] } şeklinde, her item'in id'si var. SQL tarafında
  // her item ayrı satır. Realtime event geldiğinde id ile array'de bul, varsa
  // güncelle; yoksa ekle. DELETE'te id ile çıkar.
  //
  // v2.6.78 — DELETE event'i Postgres REPLICA IDENTITY DEFAULT olduğu için
  // sadece PK (id) içeriyor; workspace_id payload'da YOK. Bu nedenle DELETE
  // case'inde id ile TÜM ws array'lerini tarıyoruz. INSERT/UPDATE event'lerinde
  // newRow tüm sütunları içerdiği için workspace_id mevcut.
  function applyToArrayWsTable(stateKey, eventType, newRow, oldRow) {
    const all = PCD.clone(PCD.store.get(stateKey) || {});

    if (eventType === 'DELETE') {
      // workspace_id null olabilir → id ile tüm ws'lerde ara
      const id = (oldRow && oldRow.id) || (newRow && newRow.id);
      if (!id) return;
      const wsKeys = Object.keys(all);
      let changed = false;
      for (let i = 0; i < wsKeys.length; i++) {
        const arr = all[wsKeys[i]];
        if (!Array.isArray(arr)) continue;
        const idx = arr.findIndex(function (it) { return it && it.id === id; });
        if (idx !== -1) {
          arr.splice(idx, 1);
          changed = true;
        }
      }
      if (changed) {
        PCD.store.set(stateKey, all);
        scheduleViewRefresh();
      }
      return;
    }

    // INSERT or UPDATE — newRow tam kayıt, workspace_id mevcut
    const row = newRow;
    if (!row) return;
    const wsId = row.workspace_id;
    const id = row.id;
    if (!wsId || !id) return;

    if (!all[wsId]) all[wsId] = [];
    const idx = all[wsId].findIndex(function (it) { return it && it.id === id; });
    const incoming = row.data || {};

    if (idx !== -1) {
      // Last-write-wins by updatedAt (loop önleme: kendi attığım event geri gelirse atla)
      const localExisting = all[wsId][idx];
      if (localExisting && localExisting.updatedAt && incoming.updatedAt) {
        if (localExisting.updatedAt >= incoming.updatedAt) return;
      }
      all[wsId][idx] = incoming;
    } else {
      all[wsId].push(incoming);
    }

    PCD.store.set(stateKey, all);
    scheduleViewRefresh();
  }

  // Subscribe to all 19 tables for the current user
  function subscribe() {
    if (subscribed) return;
    if (!PCD.cloud || !PCD.cloud.ready) return;
    const supabase = PCD.cloud.getClient();
    const user = PCD.store && PCD.store.get('user');
    if (!user || !user.id) return;

    const TABLES = [
      'workspaces', 'recipes', 'ingredients', 'menus', 'events',
      'suppliers', 'canvases', 'shopping_lists', 'checklist_templates',
      'inventory', 'user_prefs',
      // v2.6.77 — Faz 4 Adım 5: Realtime kapsam genişletme
      'waste',
      // v2.6.80 — Faz 4 Adım 5 devam: tüm tool tabloları Realtime'da
      'checklist_sessions',
      'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
      'stock_count_history',
      // v2.6.81 — workspace_tombstones (cross-device cascade wipe trigger)
      'workspace_tombstones',
    ];

    channel = supabase.channel('pcd-user-' + user.id);

    TABLES.forEach(function (table) {
      const filter = (table === 'user_prefs')
        ? 'user_id=eq.' + user.id
        : 'user_id=eq.' + user.id;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: table, filter: filter },
        function (payload) {
          applyChange(table, payload.eventType, payload.new, payload.old);
        }
      );
    });

    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        PCD.log && PCD.log('cloud-realtime: subscribed to all tables');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        PCD.warn && PCD.warn('cloud-realtime: subscribe failed', status);
        subscribed = false;
        // Retry in 10s
        setTimeout(subscribe, 10000);
      }
    });
  }

  function unsubscribe() {
    if (!channel) return;
    try {
      const supabase = PCD.cloud.getClient();
      supabase.removeChannel(channel);
    } catch (e) { /* ignore */ }
    channel = null;
    subscribed = false;
  }

  // Auto-init: subscribe when user signs in, unsubscribe on sign out.
  // We listen to PCD.store user changes.
  function init() {
    if (!PCD.store || !PCD.store.on) return;
    PCD.store.on('user', function (user) {
      if (user && user.id) {
        // Defer slightly so cloud.js has time to be ready
        setTimeout(subscribe, 1000);
      } else {
        unsubscribe();
      }
    });
    // Also handle case where user is already signed in at boot
    setTimeout(function () {
      const u = PCD.store.get('user');
      if (u && u.id) subscribe();
    }, 2000);
  }

  PCD.cloudRealtime = {
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    isSubscribed: function () { return subscribed; },
  };

  // Init on load (once PCD.store is ready)
  if (PCD.store && PCD.store.on) {
    init();
  } else {
    // store.js not loaded yet — wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 100);
    });
  }
})();
