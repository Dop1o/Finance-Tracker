/**
 * @file Валидация и санитизация пользовательского ввода + escapeHtml.
 */
(function (G) {
  'use strict';

  var BAD_NAME = /[<>&'"\\/;`]/;

  /**
   * @class
   */
  function ValidationService() {}

  /**
   * Экранирует строку для безопасного вывода в HTML-контексте.
   * @param {string|null|undefined} str
   * @returns {string}
   */
  ValidationService.prototype.escapeHtml = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Удаляет запрещённые символы из названия.
   * @param {string} name
   * @returns {string}
   */
  ValidationService.prototype.sanitizeName = function (name) {
    if (name == null) return '';
    return String(name).replace(BAD_NAME, '');
  };

  /**
   * Проверяет название транзакции.
   * @param {string} name
   * @param {{validationNameShort:string,validationNameLong:string,validationNameChars:string}} m
   * @returns {{ok:boolean,message?:string}}
   */
  ValidationService.prototype.validateName = function (name, m) {
    var t = (name || '').trim();
    if (t.length < 2) return { ok: false, message: m.validationNameShort };
    if (t.length > 100) return { ok: false, message: m.validationNameLong };
    if (BAD_NAME.test(t)) return { ok: false, message: m.validationNameChars };
    return { ok: true };
  };

  /**
   * Проверяет сумму (положительное число в диапазоне).
   * @param {unknown} raw
   * @param {{validationAmountEmpty:string,validationAmountPositive:string,validationAmountMin:string,validationAmountMax:string}} m
   * @returns {{ok:boolean,value?:number,message?:string}}
   */
  ValidationService.prototype.validateAmount = function (raw, m) {
    if (raw === '' || raw == null) return { ok: false, message: m.validationAmountEmpty };
    var n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
    if (Number.isNaN(n) || n <= 0) return { ok: false, message: m.validationAmountPositive };
    if (n < 0.01) return { ok: false, message: m.validationAmountMin };
    if (n > 99999999.99) return { ok: false, message: m.validationAmountMax };
    return { ok: true, value: Math.round(n * 100) / 100 };
  };

  /**
   * Ограничивает ввод суммы: только цифры и один разделитель.
   * @param {string} s
   * @returns {string}
   */
  ValidationService.prototype.filterAmountInput = function (s) {
    var t = String(s || '').replace(/[^\d.,]/g, '');
    var dot = t.replace(/,/g, '.');
    var parts = dot.split('.');
    if (parts.length > 2) dot = parts[0] + '.' + parts.slice(1).join('');
    return dot;
  };

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.ValidationService = ValidationService;
})(typeof window !== 'undefined' ? window : globalThis);
