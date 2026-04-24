/**
 * @file Тосты (без alert и модалок валидации).
 */
(function (G) {
  'use strict';

  /**
   * @param {Document} doc
   * @class
   */
  function NotificationService(doc) {
    this._doc = doc;
    this._root = null;
  }

  /**
   * @returns {HTMLElement}
   */
  NotificationService.prototype._rootEl = function () {
    if (this._root && this._doc.body.contains(this._root)) return this._root;
    this._root = this._doc.getElementById('toast-root');
    if (!this._root) {
      this._root = this._doc.createElement('div');
      this._root.id = 'toast-root';
      this._doc.body.appendChild(this._root);
    }
    return this._root;
  };

  /**
   * @param {string} text Безопасный текст (textContent)
   * @param {'info'|'ok'|'err'} kind
   * @param {number} [ms]
   */
  NotificationService.prototype.toast = function (text, kind, ms) {
    var el = this._doc.createElement('div');
    el.className = 'toast-mt';
    if (kind === 'err') el.classList.add('err');
    if (kind === 'ok') el.classList.add('ok');
    el.textContent = text;
    this._rootEl().appendChild(el);
    var t = ms != null ? ms : 4200;
    setTimeout(function () {
      el.remove();
    }, t);
  };

  /**
   * Удаляет все тосты (например при смене языка).
   * @returns {void}
   */
  NotificationService.prototype.clearAll = function () {
    var r = this._rootEl();
    while (r.firstChild) r.removeChild(r.firstChild);
  };

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.NotificationService = NotificationService;
})(typeof window !== 'undefined' ? window : globalThis);
