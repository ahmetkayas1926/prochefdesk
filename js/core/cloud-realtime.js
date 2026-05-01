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
      }
      return;
    }

    all[wsId][ingId] = newRow.data;
    PCD.store.set('inventory', all);
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

  // Subscribe to all 11 tables for the current user
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
