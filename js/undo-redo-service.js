/**
 * @file История undo/redo для снимков состояния транзакций.
 */
(function (G) {
  'use strict';

  /**
   * @param {{maxSteps?: number, storageKey?: string}} opts
   * @class
   */
  function UndoRedoService(opts) {
    this._max = (opts && opts.maxSteps) || 20;
    this._storageKey = (opts && opts.storageKey) || '';
    this._u = [];
    this._r = [];
  }

  /**
   * Глубокая сериализация списка транзакций.
   * @param {Array<object>} transactions
   * @returns {string}
   */
  UndoRedoService.prototype._serialize = function (transactions) {
    return JSON.stringify(
      transactions.map(function (t) {
        var u = t.amountUsd != null ? t.amountUsd : t.amount;
        return {
          id: t.id,
          name: t.name,
          amount: t.amount,
          amountUsd: u,
          category: t.category,
          type: t.type,
          date: t.date instanceof Date ? t.date.toISOString() : t.date
        };
      })
    );
  };

  /**
   * @param {string} json
   * @returns {Array<object>}
   */
  UndoRedoService.prototype._parse = function (json) {
    var a = JSON.parse(json);
    return a.map(function (t) {
      var usd = t.amountUsd != null ? t.amountUsd : t.amount;
      return Object.assign({}, t, {
        amountUsd: usd,
        date: new Date(t.date)
      });
    });
  };

  /**
   * @returns {void}
   */
  UndoRedoService.prototype._persist = function () {
    if (!this._storageKey || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(
        this._storageKey,
        JSON.stringify({ u: this._u, r: this._r })
      );
    } catch (e) {}
  };

  /**
   * @returns {void}
   */
  UndoRedoService.prototype.restore = function () {
    if (!this._storageKey || typeof sessionStorage === 'undefined') return;
    try {
      var raw = sessionStorage.getItem(this._storageKey);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.u && Array.isArray(o.u)) {
        this._u = o.u.slice(-this._max);
      }
      if (o.r && Array.isArray(o.r)) {
        this._r = o.r.slice(-this._max);
      }
    } catch (e) {}
  };

  /**
   * Сохраняет снимок перед мутацией.
   * @param {Array<object>} transactions
   */
  UndoRedoService.prototype.pushSnapshot = function (transactions) {
    this._u.push(this._serialize(transactions));
    if (this._u.length > this._max) this._u.shift();
    this._r = [];
    this._persist();
  };

  /**
   * @param {Array<object>} current
   * @returns {Array<object>|null}
   */
  UndoRedoService.prototype.undo = function (current) {
    if (!this._u.length) return null;
    this._r.push(this._serialize(current));
    var prev = this._u.pop();
    this._persist();
    return this._parse(prev);
  };

  /**
   * @param {Array<object>} current
   * @returns {Array<object>|null}
   */
  UndoRedoService.prototype.redo = function (current) {
    if (!this._r.length) return null;
    this._u.push(this._serialize(current));
    var nxt = this._r.pop();
    this._persist();
    return this._parse(nxt);
  };

  /**
   * @returns {boolean}
   */
  UndoRedoService.prototype.canUndo = function () {
    return this._u.length > 0;
  };

  /**
   * @returns {boolean}
   */
  UndoRedoService.prototype.canRedo = function () {
    return this._r.length > 0;
  };

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.UndoRedoService = UndoRedoService;
})(typeof window !== 'undefined' ? window : globalThis);
