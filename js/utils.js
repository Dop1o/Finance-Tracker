/**
 * @file Общие утилиты: debounce, отпечаток транзакций, даты.
 */
(function (G) {
  'use strict';

  /**
   * @param {function(...*):void} fn
   * @param {number} ms
   * @returns {function(...*):void}
   */
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var a = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(ctx, a);
      }, ms);
    };
  }

  /**
   * @param {Array<{id:number,amount:number,type:string,category:string,date:Date|string}>} list
   * @returns {string}
   */
  function txFingerprint(list) {
    if (!list || !list.length) return 'e';
    return list
      .map(function (x) {
        var d = x.date instanceof Date ? x.date.getTime() : new Date(x.date).getTime();
        var u = x.amountUsd != null ? x.amountUsd : x.amount;
        return [x.id, u, x.type, x.category, d].join(':');
      })
      .join('|');
  }

  /**
   * @param {Date} d
   * @returns {string}
   */
  function toYmd(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  /**
   * @param {string} s
   * @returns {Date}
   */
  function parseYmd(s) {
    if (!s) return new Date();
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0);
  }

  /**
   * Убирает UTF-8 BOM в начале файла.
   * @param {string} s
   * @returns {string}
   */
  function stripBom(s) {
    if (s == null || s === '') return '';
    if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
    return s;
  }

  /**
   * Улучшенный парсинг строки CSV с поддержкой русских кавычек и разных разделителей
   * @param {string} line
   * @param {string} separator
   * @returns {string[]}
   */
  function parseCsvLine (line, separator) {
    var result = [];
    var current = '';
    var inQuotes = false;
    var quoteChar = null;
    
    // Нормализуем разделитель если он не передан
    if (!separator) {
      // Автоопределение
      var commas = (line.match(/,/g) || []).length;
      var semicolons = (line.match(/;/g) || []).length;
      separator = semicolons > commas ? ';' : ',';
    }
    
    for (var i = 0; i < line.length; i++) {
      var char = line[i];
      var nextChar = line[i + 1];
      
      // Проверяем разные типы кавычек
      if ((char === '"' || char === "'" || char === '"' || char === '"' || 
          char === '„' || char === '“' || char === '”') && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        if (nextChar === quoteChar) {
          // Экранированная кавычка
          current += quoteChar;
          i++; // Пропускаем следующую
        } else {
          inQuotes = false;
          quoteChar = null;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Добавляем последнее поле
    result.push(current);
    
    // Убираем обрамляющие кавычки и пробелы
    result = result.map(function(cell) {
      cell = cell.trim();
      // Убираем обрамляющие кавычки любого типа
      if (cell.length >= 2) {
        var first = cell[0];
        var last = cell[cell.length - 1];
        if ((first === '"' && last === '"') ||
            (first === "'" && last === "'") ||
            (first === '"' && last === '"') ||
            (first === '„' && last === '“')) {
          cell = cell.slice(1, -1);
        }
      }
      // Заменяем двойные кавычки на одинарные
      cell = cell.replace(/""/g, '"').replace(/''/g, "'");
      return cell;
    });
    
    return result;
  }

  /**
   * Нормализация ячейки CSV с поддержкой русского языка
   * @param {string} cell
   * @returns {string}
   */
  function normalizeCsvCell(cell) {
    if (cell == null || cell === undefined) return '';
    
    var str = String(cell).trim();
    
    // Убираем BOM и другие невидимые символы
    str = str.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Убираем кавычки разных типов по краям
    if (str.length >= 2) {
      var first = str[0];
      var last = str[str.length - 1];
      
      // Проверяем разные виды кавычек
      if ((first === '"' && last === '"') ||
          (first === "'" && last === "'") ||
          (first === '"' && last === '"') ||
          (first === '„' && last === '“') ||
          (first === '«' && last === '»')) {
        str = str.slice(1, -1).trim();
      }
    }
    
    // Заменяем экранированные кавычки
    str = str.replace(/""/g, '"').replace(/''/g, "'");
    
    return str;
  }

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.Util = {
    debounce: debounce,
    txFingerprint: txFingerprint,
    toYmd: toYmd,
    parseYmd: parseYmd,
    stripBom: stripBom,
    parseCsvLine: parseCsvLine,
    normalizeCsvCell: normalizeCsvCell
  };
})(typeof window !== 'undefined' ? window : globalThis);
