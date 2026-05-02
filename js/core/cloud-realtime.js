/* ================================================================
   ProChefDesk — cloud-realtime.js (v2.6.68)

   Multi-device sync, Faz 3: Supabase Realtime channel.

   Bir cihaz değişiklik yaptığında (recipes, ingredients, vs. tablolarına
   yazma), diğer aynı kullanıcı oturumları açık olan cihazlar 1-2 saniye
   içinde otomatik güncellenir. Sayfa yenileme gerekmez.

   ÇALIŞMA ŞEKLİ:
   1. Login sonrası bu modül 11 tabloya subscribe olur.
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
   - WebSocket tek bir bağlantı (Supabase 11 tablo için tek channel)
   - Her event ~1KB payload (sadece değişen record)
   - Idle bağlantı maliyeti yok (Supabase Free tier limit'leri)
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
    // v2.6.78 — Debug log: Realtime'dan gelen TÜM event'ler. Console'da
    // window._dbgRT = true yapılınca açılır. Production'da default kapalı.
    if (window._dbgRT) {
      try {
        const id = (newRow && newRow.id) || (oldRow && oldRow.id) || '?';
        console.log('[RT]', table, eventType, id);
      } catch (e) { /* ignore */ }
    }
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
        // v2.6.75 — Faz 4 tamamlama: yeni tablolar
        case 'stock_count_history': return applyToWsTable('stockCountHistory', eventType, newRow, oldRow);
        case 'haccp_logs': return applyToWsTable('haccpLogs', eventType, newRow, oldRow);
        case 'haccp_units': return applyToWsTable('haccpUnits', eventType, newRow, oldRow);
        case 'haccp_readings': return applyToWsTable('haccpReadings', eventType, newRow, oldRow);
        case 'haccp_cook_cool': return applyToWsTable('haccpCookCool', eventType, newRow, oldRow);
        case 'waste': return applyToWsArrayTable('waste', eventType, newRow, oldRow);
        case 'checklist_sessions': return applyToWsArrayTable('checklistSessions', eventType, newRow, oldRow);
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

    // v2.6.76 — Soft-deleted UPDATE event geldiyse (data._deletedAt set
    // veya server'da deleted_at IS NOT NULL), state'ten FİİLEN sil.
    // Yoksa kayıt _deletedAt mark'ıyla state'te kalıyor, listTable
    // filtresine bel bağlanıyor, ama bazı view'larda direkt object key
    // erişiminde gözüküyor. Açık silme her zaman daha güvenli.
    if (incoming._deletedAt || newRow.deleted_at) {
      if (all[wsId][id]) {
        delete all[wsId][id];
        PCD.store.set(stateKey, all);
        scheduleViewRefresh();
      }
      return;
    }

    // Apply (normal upsert)
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

    // v2.6.76 — Soft-deleted workspace: state'ten fiilen sil ve bağlı
    // tüm ws-scoped tabloları temizle. applyToTombstones zaten benzeri
    // yapıyor ama workspace UPDATE event'i tombstone INSERT event'inden
    // önce gelirse (sıralama garantisi yok), bu da aynı temizliği yapsın.
    if (incoming._deletedAt || newRow.deleted_at) {
      if (all[id]) {
        delete all[id];
        PCD.store.set('workspaces', all);
        // Bağlı tabloları temizle
        const WS_TABLES = [
          'recipes','ingredients','menus','events','suppliers','inventory',
          'waste','checklistTemplates','checklistSessions','canvases',
          'shoppingLists','stockCountHistory','haccpLogs','haccpUnits',
          'haccpReadings','haccpCookCool',
        ];
        WS_TABLES.forEach(function (tbl) {
          const t = PCD.store.get(tbl);
          if (t && t[id]) {
            const next = PCD.clone(t);
            delete next[id];
            PCD.store.set(tbl, next);
          }
        });
        // Aktif ws bu silinen ise, başka bir ws'ye geç
        const activeId = PCD.store.get('activeWorkspaceId');
        if (activeId === id) {
          const remainingIds = Object.keys(PCD.store.get('workspaces') || {});
          if (remainingIds.length > 0) {
            PCD.store.set('activeWorkspaceId', remainingIds[0]);
          }
        }
        scheduleViewRefresh();
      }
      return;
    }

    const local = all[id];
    if (local && local.updatedAt && incoming.updatedAt) {
      if (local.updatedAt >= incoming.updatedAt) return;
    }
    all[id] = incoming;
    PCD.store.set('workspaces', all);
    scheduleViewRefresh();
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

  // v2.6.75 — Array yapılı ws-scoped tablolar (waste, checklist_sessions).
  // State şekli: { wsId: [array of items] }. Her satırın id'si var.
  // INSERT/UPDATE: array içinde id'ye göre upsert. DELETE: id'yi çıkar.
  function applyToWsArrayTable(stateKey, eventType, newRow, oldRow) {
    const row = newRow || oldRow;
    if (!row) return;
    const wsId = row.workspace_id;
    const id = row.id;
    if (!wsId || !id) return;
    const all = PCD.clone(PCD.store.get(stateKey) || {});
    const arr = (all[wsId] || []).slice();

    if (eventType === 'DELETE') {
      const filtered = arr.filter(function (it) { return it && it.id !== id; });
      if (filtered.length !== arr.length) {
        all[wsId] = filtered;
        PCD.store.set(stateKey, all);
        scheduleViewRefresh();
      }
      return;
    }

    // INSERT/UPDATE
    const incoming = newRow.data || {};
    const idx = arr.findIndex(function (it) { return it && it.id === id; });

    // v2.6.76 — Soft-deleted UPDATE event'i fiilen sil
    if (incoming._deletedAt || newRow.deleted_at) {
      if (idx >= 0) {
        arr.splice(idx, 1);
        all[wsId] = arr;
        PCD.store.set(stateKey, all);
        scheduleViewRefresh();
      }
      return;
    }

    if (idx >= 0) {
      const localExisting = arr[idx];
      // Last-write-wins by updatedAt
      if (localExisting && localExisting.updatedAt && incoming.updatedAt) {
        if (localExisting.updatedAt > incoming.updatedAt) return;
        if (localExisting.updatedAt === incoming.updatedAt) return;
      }
      arr[idx] = incoming;
    } else {
      arr.push(incoming);
    }
    all[wsId] = arr;
    PCD.store.set(stateKey, all);
    scheduleViewRefresh();
  }

  // v2.6.75 — Workspace tombstones: silinen workspace'lerin Realtime'ı.
  // PK doğrudan workspace_id, data jsonb yok. State: _deletedWorkspaces map.
  // INSERT geldiğinde: o ws'yi state'ten de sil (başka cihaz silmiş demektir).
  // DELETE: hiç olmamalı (tombstone hiç silinmiyor) ama defansif.
  function applyToTombstones(eventType, newRow, oldRow) {
    if (eventType === 'DELETE') return;  // tombstone hiç silinmemeli
    const row = newRow;
    if (!row || !row.workspace_id) return;
    const wsId = row.workspace_id;
    const tombs = PCD.clone(PCD.store.get('_deletedWorkspaces') || {});
    if (tombs[wsId]) return;  // zaten biliyoruz, tekrar uygulama
    tombs[wsId] = row.deleted_at || new Date().toISOString();
    PCD.store.set('_deletedWorkspaces', tombs);

    // Workspace'i ve ona bağlı tüm verileri lokal state'ten sil.
    // Bu cihaz workspace silindiğini öğrenince diğer ws verilerine
    // bakmaya devam etmeli, silinen ws diriltilmemeli.
    const wss = PCD.clone(PCD.store.get('workspaces') || {});
    if (wss[wsId]) {
      delete wss[wsId];
      PCD.store.set('workspaces', wss);
    }
    const WS_TABLES = [
      'recipes','ingredients','menus','events','suppliers','inventory',
      'waste','checklistTemplates','checklistSessions','canvases',
      'shoppingLists','stockCountHistory','haccpLogs','haccpUnits',
      'haccpReadings','haccpCookCool',
    ];
    WS_TABLES.forEach(function (tbl) {
      const t = PCD.store.get(tbl);
      if (t && t[wsId]) {
        const next = PCD.clone(t);
        delete next[wsId];
        PCD.store.set(tbl, next);
      }
    });

    // Aktif ws bu silinen ise, başka bir ws'ye geç
    const activeId = PCD.store.get('activeWorkspaceId');
    if (activeId === wsId) {
      const remaining = Object.keys(PCD.store.get('workspaces') || {});
      if (remaining.length > 0) {
        PCD.store.set('activeWorkspaceId', remaining[0]);
      }
    }
    scheduleViewRefresh();
  }

  // Subscribe to all tables for the current user
  // v2.6.79 — Kritik fix: subscribed flag race condition'ı.
  // Önceden: if (subscribed) return; → sonradan gelen subscribe çağrıları
  // hiç bindings eklemeden return ediyordu (boot'ta iki tetikleyici yarışı,
  // veya manuel unsubscribe-subscribe sonrası). Sonuç: channel 'joined'
  // gözüküyor ama bindings boş, hiç event gelmiyor.
  //
  // Yeni: her çağrıda önce mevcut channel'ı temizle, sonra yenisini kur.
  // Idempotent ve yarışa dirençli.
  function subscribe() {
    if (!PCD.cloud || !PCD.cloud.ready) return;
    const supabase = PCD.cloud.getClient();
    const user = PCD.store && PCD.store.get('user');
    if (!user || !user.id) return;

    // ÖNCEDEN VAR OLAN CHANNEL'I HER ŞARTTA TEMİZLE
    if (channel) {
      try { supabase.removeChannel(channel); } catch (e) { /* ignore */ }
      channel = null;
    }
    subscribed = false;

    const TABLES = [
      'workspaces', 'recipes', 'ingredients', 'menus', 'events',
      'suppliers', 'canvases', 'shopping_lists', 'checklist_templates',
      'inventory', 'user_prefs',
      // v2.6.75 — Faz 4 tamamlama: yeni tablolar
      'waste', 'checklist_sessions', 'stock_count_history',
      'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool',
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
        PCD.log && PCD.log('cloud-realtime: subscribed to all tables (' + TABLES.length + ')');
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

    // v2.6.76 — Reconnect strategy: WebSocket düşmeleri (mobilde özellikle
    // PWA ekranı kapatıp açınca, ağ değişiminde, vb.) yaygın. Channel
    // subscribe başarılı olduktan sonra düşerse retry mekanizması yok.
    // İki ek tetikleyici ekliyoruz:
    //   1. window.online event — ağ geri gelince yeniden bağlan
    //   2. document.visibilitychange — sekme/PWA tekrar görünür olunca
    //      bağlantıyı doğrula, gerekirse yeniden bağlan
    function reconnectIfNeeded(reason) {
      const u = PCD.store && PCD.store.get('user');
      if (!u || !u.id) return;  // login yoksa hiçbir şey yapma
      if (subscribed && channel) {
        // Channel görünüşte canlı, ama emin olmak için unsubscribe + subscribe
        // ağ değişimi sonrası "zombi" olmuş olabilir. Re-subscribe ucuz.
        PCD.log && PCD.log('cloud-realtime: forcing reconnect (' + reason + ')');
        try { unsubscribe(); } catch (e) { /* ignore */ }
        setTimeout(subscribe, 500);
      } else if (!subscribed) {
        PCD.log && PCD.log('cloud-realtime: subscribing (' + reason + ')');
        subscribe();
      }
    }
    window.addEventListener('online', function () {
      reconnectIfNeeded('online');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        // Sayfa tekrar görünür oldu — son aktiflikten 30 sn'den fazla
        // geçtiyse reconnect (uzun arka plan = WebSocket muhtemelen
        // ölmüş). Eşik düşük tutuyoruz çünkü reconnect zararsız.
        reconnectIfNeeded('visibility');
      }
    });

    // v2.6.78 — Periyodik watchdog. Her 30 sn'de bir Realtime channel'ın
    // gerçek state'ini kontrol et (subscribed flag yalan söyleyebilir).
    // Channel state 'joined' değilse zorla yeniden bağlan.
    //
    // Sebep: Supabase JS bazen WebSocket sessizce düştüğünde subscribed
    // flag'i true bırakır. Channel.state daha güvenilir bir gösterge.
    // 30 sn aralık dengeli: çok sık gereksiz, çok seyrek event kaybı.
    setInterval(function () {
      const u = PCD.store && PCD.store.get('user');
      if (!u || !u.id) return;
      if (!PCD.cloud || !PCD.cloud.ready) return;
      try {
        const sb = PCD.cloud.getClient();
        const channels = sb.getChannels ? sb.getChannels() : [];
        if (channels.length === 0) {
          PCD.log && PCD.log('cloud-realtime watchdog: no channels, subscribing');
          subscribe();
          return;
        }
        // Bizim channel her zaman ilki (tek channel kullanıyoruz)
        const state = channels[0] && channels[0].state;
        if (state !== 'joined') {
          PCD.log && PCD.log('cloud-realtime watchdog: state=' + state + ', forcing reconnect');
          reconnectIfNeeded('watchdog');
        }
      } catch (e) {
        PCD.warn && PCD.warn('cloud-realtime watchdog error', e && e.message);
      }
    }, 30000);
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
