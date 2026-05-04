/* ================================================================
   ProChefDesk — idb-wrapper.js (v2.6.89)

   Minimal Promise wrapper over native IndexedDB.

   AMAÇ:
   localStorage 5 MB sınırını kaldırmak için Faz 4 Adım 4: state'i
   IndexedDB'ye taşımak. Bu modül sadece API katmanı — store.js
   write-through pattern ile hem localStorage'a hem IDB'ye yazar.
   Okuma 4b'de IDB'ye geçecek; 4c'de LS yazma kapatılacak.

   KAPSAM:
   Tek DB ('prochefdesk'), tek object store ('state'). Key bazlı
   get/put/delete/clear. Native API callback-based; bu wrapper
   her operasyonu Promise döndürür.

   HATA TOLERANSI:
   - IDB tarayıcıda yoksa (gizli mod, eski tarayıcı) reject eder.
   - store.js write-through hatayı sessizce yakalar — LS write zaten
     yapıldığı için veri kaybı yok.

   BİLİNEN BİLGİLER:
   - Safari iOS gizli mod: IDB partially supported, throw atabilir.
   - Quota: tarayıcı başına ~50% disk, ProChefDesk için bol bol yeterli.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;
  const DB_NAME = 'prochefdesk';
  const DB_VERSION = 1;
  const STORE_DEFAULT = 'state';

  // Lazy DB connection — ilk erişimde açılır, sonra cache'lenir.
  // Reject olursa her çağrı baştan dener (failed connection retry).
  let _dbPromise = null;

  function _getDB() {
    if (_dbPromise) return _dbPromise;
    if (!window.indexedDB) {
      return Promise.reject(new Error('IndexedDB not supported'));
    }
    _dbPromise = new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_DEFAULT)) {
          db.createObjectStore(STORE_DEFAULT);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        _dbPromise = null;  // sonraki çağrı yeniden denesin
        reject(req.error || new Error('IDB open error'));
      };
      req.onblocked = function () {
        _dbPromise = null;
        reject(new Error('IDB blocked by another connection'));
      };
    });
    return _dbPromise;
  }

  function get(storeName, key) {
    return _getDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx;
        try { tx = db.transaction(storeName, 'readonly'); }
        catch (e) { reject(e); return; }
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function put(storeName, key, value) {
    return _getDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx;
        try { tx = db.transaction(storeName, 'readwrite'); }
        catch (e) { reject(e); return; }
        const req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function del(storeName, key) {
    return _getDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx;
        try { tx = db.transaction(storeName, 'readwrite'); }
        catch (e) { reject(e); return; }
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clear(storeName) {
    return _getDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx;
        try { tx = db.transaction(storeName, 'readwrite'); }
        catch (e) { reject(e); return; }
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  PCD.idb = {
    get: get,
    put: put,
    delete: del,
    clear: clear,
    // Test/debug: bağlantıyı zorla yeniden aç
    _reset: function () { _dbPromise = null; },
  };
})();
