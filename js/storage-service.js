/**
 * @file localStorage (настройки, цели) + IndexedDB (транзакции).
 */
(function (G) {
  'use strict';

  var LEGACY_TX = 'financeTracker_transactions';
  var LS = 'moneytrack_';
  var DBN = 'MoneyTrackDB';
  var VER = 1;
  var ST = 'kv';

  /**
   * @class
   */
  function StorageService() {
    this._db = null;
  }

  /**
   * Открывает IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  StorageService.prototype._open = function () {
    var self = this;
    if (this._db) return Promise.resolve(this._db);
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, VER);
      r.onerror = function () {
        rej(r.error);
      };
      r.onsuccess = function () {
        self._db = r.result;
        res(self._db);
      };
      r.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(ST)) db.createObjectStore(ST, { keyPath: 'key' });
      };
    });
  };

  /**
   * @returns {Promise<void>}
   */
  StorageService.prototype.init = function () {
    return this._open().then(function () {});
  };

  /**
   * @param {string} key
   * @param {*} def
   * @returns {*}
   */
  StorageService.prototype.getJson = function (key, def) {
    try {
      var r = localStorage.getItem(LS + key);
      if (r == null) return def;
      return JSON.parse(r);
    } catch (e) {
      return def;
    }
  };

  /**
   * @param {string} key
   * @param {*} val
   */
  StorageService.prototype.setJson = function (key, val) {
    localStorage.setItem(LS + key, JSON.stringify(val));
  };

  /**
   * @param {string} key
   * @returns {Promise<*>}
   */
  StorageService.prototype._idbGet = function (key) {
    return this._open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(ST, 'readonly');
        var q = tx.objectStore(ST).get(key);
        q.onerror = function () {
          rej(q.error);
        };
        q.onsuccess = function () {
          res(q.result ? q.result.value : null);
        };
      });
    });
  };

  /**
   * @param {string} key
   * @param {*} val
   * @returns {Promise<void>}
   */
  StorageService.prototype._idbSet = function (key, val) {
    return this._open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(ST, 'readwrite');
        tx.objectStore(ST).put({ key: key, value: val });
        tx.oncomplete = function () {
          res();
        };
        tx.onerror = function () {
          rej(tx.error);
        };
      });
    });
  };

  /**
   * @returns {Promise<Array<object>>}
   */
  StorageService.prototype.loadTransactions = function () {
    var self = this;
    return this._idbGet('transactions').then(function (rows) {
      if (rows && Array.isArray(rows)) {
        return rows.map(function (t) {
          return Object.assign({}, t, { date: new Date(t.date) });
        });
      }
      try {
        var leg = localStorage.getItem(LEGACY_TX);
        if (leg) {
          var p = JSON.parse(leg);
          if (Array.isArray(p)) {
            var m = p.map(function (t) {
              return Object.assign({}, t, { date: new Date(t.date) });
            });
            return self.saveTransactions(m).then(function () {
              try {
                localStorage.removeItem(LEGACY_TX);
              } catch (e2) {}
              return m;
            });
          }
        }
      } catch (e) {}
      return [];
    });
  };

  /**
   * @param {Array<object>} list
   * @returns {Promise<void>}
   */
  StorageService.prototype.saveTransactions = function (list) {
    var s = list.map(function (t) {
      return {
        id: t.id,
        name: t.name,
        amount: t.amount,
        amountUsd: t.amountUsd != null ? t.amountUsd : t.amount,
        category: t.category,
        type: t.type,
        date: t.date instanceof Date ? t.date.toISOString() : t.date
      };
    });
    return this._idbSet('transactions', s);
  };

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.StorageService = StorageService;
})(typeof window !== 'undefined' ? window : globalThis);
