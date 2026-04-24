/**
 * @file FinanceApp — оркестратор UI, данных, i18n, целей, импорта.
 */
(function (G) {
  'use strict';

  var MT = G.MoneyTrack;
  var Util = MT.Util;

  var CAT = {
    food: { ru: 'Еда', en: 'Food', icon: '🍔' },
    transport: { ru: 'Транспорт', en: 'Transport', icon: '🚗' },
    entertainment: { ru: 'Развлечения', en: 'Entertainment', icon: '🎬' },
    health: { ru: 'Здоровье', en: 'Health', icon: '💊' },
    work: { ru: 'Работа', en: 'Work', icon: '💼' },
    other: { ru: 'Другое', en: 'Other', icon: '📦' }
  };

  var MSG = {
    ru: {
      validationNameShort: 'Название: минимум 2 символа',
      validationNameLong: 'Название: максимум 100 символов',
      validationNameChars: 'Недопустимые символы в названии',
      validationAmountEmpty: 'Введите сумму',
      validationAmountPositive: 'Сумма должна быть больше 0',
      validationAmountMin: 'Минимум 0.01',
      validationAmountMax: 'Слишком большая сумма',
      chartBalanceLabel: 'Баланс',
      statsIncome: 'Доходы',
      statsExpense: 'Расходы',
      confirmDelete: 'Удалить транзакцию?',
      ratesFail: 'Курс валют недоступен, используются запасные значения',
      importOk: 'Импорт выполнен',
      importErr: 'Ошибка импорта',
      importNothing: 'Не удалось импортировать строки — проверьте формат и сопоставление колонок',
      exportOk: 'Файл сохранён',
      goalAdded: 'Цель добавлена',
      saved: 'Сохранено',
      smartNone: 'Добавьте расходы с категорией «Еда» для анализа выходных.',
      undoNone: 'Нечего отменять',
      redoNone: 'Нечего вернуть',
      importJsonOk: 'JSON импортирован',
      importJsonErr: 'Не удалось прочитать JSON',
      importJsonNothing: 'Нет подходящих записей в файле',
      achToast: 'Награда: {name}'
    },
    en: {
      validationNameShort: 'Name: at least 2 characters',
      validationNameLong: 'Name: max 100 characters',
      validationNameChars: 'Invalid characters in name',
      validationAmountEmpty: 'Enter amount',
      validationAmountPositive: 'Amount must be positive',
      validationAmountMin: 'Minimum 0.01',
      validationAmountMax: 'Amount too large',
      chartBalanceLabel: 'Balance',
      statsIncome: 'Income',
      statsExpense: 'Expenses',
      confirmDelete: 'Delete transaction?',
      ratesFail: 'Rates unavailable, using fallback',
      importOk: 'Import complete',
      importErr: 'Import failed',
      importNothing: 'No rows imported — check column mapping and file format',
      exportOk: 'File saved',
      goalAdded: 'Goal added',
      saved: 'Saved',
      smartNone: 'Add food expenses to analyze weekends.',
      undoNone: 'Nothing to undo',
      redoNone: 'Nothing to redo',
      importJsonOk: 'JSON imported',
      importJsonErr: 'Could not read JSON',
      importJsonNothing: 'No valid entries in file',
      achToast: 'Unlocked: {name}'
    }
  };

  /**
   * @param {{
   *   document: Document,
   *   validation: MT.ValidationService,
   *   storage: MT.StorageService,
   *   notify: MT.NotificationService,
   *   undoRedo: MT.UndoRedoService,
   *   charts: MT.ChartService
   * }} deps
   * @class
   */
  function FinanceApp(deps) {
    this._d = deps.document;
    this._v = deps.validation;
    this._s = deps.storage;
    this._n = deps.notify;
    this._u = deps.undoRedo;
    this._c = deps.charts;
    this.transactions = [];
    this.goals = [];
    this.lang = 'ru';
    this.theme = 'dark';
    this.currency = 'USD';
    this.rates = { USD: 1, EUR: 0.92, RUB: 90 };
    this.statsPeriod = 'week';
    this.chartPeriod = 'week';
    this.catPeriod = 'month';
    this.catFlowType = 'expense';
    this._balMemo = { k: '', v: null };
    this._search = '';
    this._importRows = null;
    this._importMap = null;
    this._editId = null;
    this._mobileTab = 'home';
    this._confirmCb = null;
    this._confirmVariant = 'default';
    this._achUnlockedIds = [];
    this._scrollLockY = 0;
    this._scrollLocked = false;
  }

  /**
   * @param {string} k
   * @returns {string}
   */
  FinanceApp.prototype.t = function (k) {
    var m = MSG[this.lang] || MSG.ru;
    return m[k] || k;
  };

  /**
   * @returns {object}
   */
  FinanceApp.prototype.msg = function () {
    return MSG[this.lang] || MSG.ru;
  };

  /**
   * @param {number} amountUsd
   * @returns {number}
   */
  FinanceApp.prototype.toDisplay = function (amountUsd) {
    var r = this.rates[this.currency] || 1;
    return amountUsd * r;
  };

  /**
   * @param {number} displayAmount
   * @returns {number}
   */
  FinanceApp.prototype.toUsd = function (displayAmount) {
    var r = this.rates[this.currency] || 1;
    return displayAmount / r;
  };

  /**
   * @param {number} v display value
   * @returns {string}
   */
  FinanceApp.prototype.formatMoney = function (v) {
    var loc = this.lang === 'ru' ? 'ru-RU' : 'en-US';
    try {
      return new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: this.currency,
        maximumFractionDigits: 2
      }).format(v);
    } catch (e) {
      return v.toFixed(2) + ' ' + this.currency;
    }
  };

  /**
   * Компактные подписи оси графика (коротко, но с валютой).
   * @param {number} v
   * @returns {string}
   */
  FinanceApp.prototype.formatMoneyAxis = function (v) {
    if (v == null || isNaN(v)) return '';
    var loc = this.lang === 'ru' ? 'ru-RU' : 'en-US';
    try {
      return new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: this.currency,
        notation: 'compact',
        maximumFractionDigits: 2
      }).format(v);
    } catch (e) {
      return this.formatMoney(v);
    }
  };

  /**
   * @returns {object}
   */
  FinanceApp.prototype.getChartColors = function () {
    var dark = this.theme === 'dark';
    return {
      isDark: dark,
      text: dark ? '#f1f5f9' : '#0f172a',
      muted: dark ? '#94a3b8' : '#64748b',
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      tooltipBg: dark ? '#1e293b' : '#ffffff'
    };
  };

  /**
   * @returns {string}
   */
  FinanceApp.prototype.fingerprintBalanceChart = function () {
    return Util.txFingerprint(this.transactions) + '|b';
  };

  /**
   * @returns {{key:string,labels:string[],inc:number[],exp:number[]}}
   */
  FinanceApp.prototype.packIncomeExpense = function () {
    var now = new Date();
    var labels = [];
    var inc = [];
    var exp = [];
    var p = this.chartPeriod;
    var self = this;
    if (p === 'week') {
      for (var i = 6; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(
          String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0')
        );
        var r = self._sumDay(d);
        inc.push(self.toDisplay(r.i));
        exp.push(self.toDisplay(r.e));
      }
    } else if (p === 'month') {
      var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (var j = 0; j < dim; j++) {
        var dd = new Date(now.getFullYear(), now.getMonth(), j + 1);
        labels.push(
          String(j + 1).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0')
        );
        var r2 = self._sumDay(dd);
        inc.push(self.toDisplay(r2.i));
        exp.push(self.toDisplay(r2.e));
      }
    } else {
      var mk = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ];
      for (var mo = 0; mo < 12; mo++) {
        labels.push(mk[mo]);
        var ms = new Date(now.getFullYear(), mo, 1);
        var me = new Date(now.getFullYear(), mo + 1, 0, 23, 59, 59, 999);
        var r3 = self._sumRange(ms, me);
        inc.push(self.toDisplay(r3.i));
        exp.push(self.toDisplay(r3.e));
      }
    }
    return { key: Util.txFingerprint(this.transactions) + '|ie|' + p + '|' + this.currency, labels: labels, inc: inc, exp: exp };
  };

  /**
   * @param {Date} d
   * @returns {{i:number,e:number}} USD
   */
  FinanceApp.prototype._sumDay = function (d) {
    var a = new Date(d);
    a.setHours(0, 0, 0, 0);
    var b = new Date(d);
    b.setHours(23, 59, 59, 999);
    return this._sumRange(a, b);
  };

  /**
   * @param {Date} a
   * @param {Date} b
   * @returns {{i:number,e:number}}
   */
  FinanceApp.prototype._sumRange = function (a, b) {
    var i = 0;
    var e = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt >= a && dt <= b) {
        if (t.type === 'income') i += t.amountUsd != null ? t.amountUsd : t.amount;
        else e += t.amountUsd != null ? t.amountUsd : t.amount;
      }
    });
    return { i: i, e: e };
  };

  /**
   * @returns {{key:string,labels:string[],data:number[]}}
   */
  FinanceApp.prototype.packCategoryDoughnut = function () {
    var self = this;
    var now = new Date();
    var todayYmd = Util.toYmd(now);
    var list = this.transactions.filter(function (t) {
      if (t.type !== self.catFlowType) return false;
      var dt = new Date(t.date);
      var ty = Util.toYmd(dt);
      if (self.catPeriod === 'day') {
        return ty === todayYmd;
      }
      if (self.catPeriod === 'week') {
        var ws = new Date(now);
        var dow = ws.getDay() || 7;
        ws.setDate(ws.getDate() - (dow - 1));
        ws.setHours(0, 0, 0, 0);
        return dt >= ws && dt <= now;
      }
      if (self.catPeriod === 'month') {
        return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      }
      return dt.getFullYear() === now.getFullYear();
    });
    var map = {};
    list.forEach(function (t) {
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      var cat = t.category || 'other';
      map[cat] = (map[cat] || 0) + u;
    });
    var catOrder = ['food', 'transport', 'entertainment', 'health', 'work', 'other'];
    var labels = [];
    var data = [];
    catOrder.forEach(function (k) {
      var sum = map[k] || 0;
      if (sum <= 0) return;
      labels.push(CAT[k] ? CAT[k][self.lang === 'ru' ? 'ru' : 'en'] : k);
      data.push(self.toDisplay(sum));
    });
    var keys = [];
    Object.keys(map).forEach(function (k) {
      if (catOrder.indexOf(k) !== -1) return;
      var sum = map[k];
      if (sum <= 0) return;
      keys.push(k);
      labels.push(k);
      data.push(self.toDisplay(sum));
    });
    return {
      key:
        Util.txFingerprint(this.transactions) +
        '|cat|' +
        this.catPeriod +
        '|' +
        this.currency +
        '|' +
        this.catFlowType,
      labels: labels,
      data: data,
      categoryKeys: catOrder
        .filter(function (k) {
          return (map[k] || 0) > 0;
        })
        .concat(keys)
    };
  };

  /**
   * Баланс за текущий месяц (мемоизация).
   * @returns {{totalUsd:number,incomeUsd:number,expenseUsd:number}}
   */
  FinanceApp.prototype.computeBalance = function () {
    var k = Util.txFingerprint(this.transactions) + '|' + this.currency;
    if (this._balMemo.k === k) return this._balMemo.v;
    var now = new Date();
    var inc = 0;
    var exp = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt.getMonth() !== now.getMonth() || dt.getFullYear() !== now.getFullYear()) return;
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') inc += u;
      else exp += u;
    });
    var v = { totalUsd: inc - exp, incomeUsd: inc, expenseUsd: exp };
    this._balMemo = { k: k, v: v };
    return v;
  };

  /**
   * «Сэкономлено» за выбранный период подробной статистики (USD).
   * @returns {number}
   */
  FinanceApp.prototype.savedForStatsPeriodUsd = function () {
    var r = this._periodRange(this.statsPeriod);
    var inc = 0;
    var exp = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt < r.a || dt > r.b) return;
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') inc += u;
      else exp += u;
    });
    var net = inc - exp;
    return net > 0 ? net : 0;
  };

  /**
   * @param {string} period
   * @returns {{a:Date,b:Date}}
   */
  FinanceApp.prototype._periodRange = function (period) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var a;
    var b = new Date(today);
    b.setHours(23, 59, 59, 999);
    if (period === 'day') {
      a = new Date(today);
      a.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      var dow = today.getDay() || 7;
      a = new Date(today);
      a.setDate(today.getDate() - (dow - 1));
      a.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      a = new Date(today.getFullYear(), today.getMonth(), 1);
      a.setHours(0, 0, 0, 0);
    } else {
      a = new Date(today.getFullYear(), 0, 1);
      a.setHours(0, 0, 0, 0);
    }
    return { a: a, b: b };
  };

  /**
   * Знаменатель для «среднего за день»: неделя — 7 дней; месяц — число дней в календарном месяце;
   * год — 365/366. Иначе среднее завышено в начале периода.
   * @param {string} period
   * @returns {number}
   */
  FinanceApp.prototype._statAvgDenominator = function (period) {
    var now = new Date();
    if (period === 'day') return 1;
    if (period === 'week') return 7;
    if (period === 'month') {
      return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }
    if (period === 'year') {
      var y = now.getFullYear();
      var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      return leap ? 366 : 365;
    }
    return 1;
  };

  /**
   * @returns {Promise<void>}
   */
  FinanceApp.prototype.init = function () {
    var self = this;
    this._c.setApp(this);
    return this._s
      .init()
      .then(function () {
        return self._s.loadTransactions();
      })
      .then(function (rows) {
        self.transactions = rows;
        self._normalizeUsd();
        self.lang = self._s.getJson('lang', 'ru');
        self.theme = self._s.getJson('theme', 'dark');
        self.currency = self._s.getJson('currency', 'USD');
        self.catFlowType = self._s.getJson('catFlow', 'expense');
        if (self.catFlowType !== 'income' && self.catFlowType !== 'expense') self.catFlowType = 'expense';
        self.goals = self._s.getJson('goals', []);
        self._achUnlockedIds = self._s.getJson('achUnlockedIds', []);
        if (!Array.isArray(self._achUnlockedIds)) self._achUnlockedIds = [];
        self._applyTheme();
        self._applyI18n();
        self._fillCurrencySelects();
        self._bind();
        self._recordVisitDay();
        self._fetchRates()
          .then(function () {
            self._balMemo = { k: '', v: null };
            self.render();
          })
          .catch(function () {});
        self._wireCharts();
        var td = self._d.getElementById('transactionDate');
        if (td) td.value = Util.toYmd(new Date());
        self.render();
        self._initWelcomeBanner();
        self._registerSw();
        self._hideSkeleton();
      })
      .catch(function (e) {
        console.error(e);
        self._n.toast(String(e.message || e), 'err');
        self._hideSkeleton();
      });
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._normalizeUsd = function () {
    var self = this;
    this.transactions.forEach(function (t) {
      if (t.amountUsd == null) t.amountUsd = t.amount;
    });
  };

  /**
   * Загрузка курсов валют с fallback-значениями и повторными попытками
   * @returns {Promise<void>}
   */
  FinanceApp.prototype._fetchRates = function () {
    var self = this;
    
    // Fallback курсы (если API недоступен)
    var DEFAULT_RATES = {
      USD: 1,
      EUR: 0.92,
      RUB: 90.50
    };
    
    // URL API (открытый, без ключа)
    var API_URL = 'https://open.er-api.com/v6/latest/USD';
    
    return fetch(API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // Таймаут 5 секунд
      signal: AbortSignal.timeout(5000)
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (data && data.rates) {
          // Сохраняем курсы
          self.rates.USD = 1;
          if (data.rates.EUR) self.rates.EUR = data.rates.EUR;
          if (data.rates.RUB) self.rates.RUB = data.rates.RUB;
          
          // Сохраняем в localStorage для офлайн-доступа
          try {
            localStorage.setItem('moneytrack_cached_rates', JSON.stringify({
              rates: self.rates,
              timestamp: Date.now()
            }));
          } catch (e) {}
          
          console.log('[Rates] Updated:', self.rates);
        } else {
          throw new Error('Invalid response');
        }
      })
      .catch(function (err) {
        console.warn('[Rates] Failed to fetch, using fallback:', err.message);
        
        // Пытаемся использовать кэшированные курсы из localStorage
        try {
          var cached = localStorage.getItem('moneytrack_cached_rates');
          if (cached) {
            var parsed = JSON.parse(cached);
            // Проверяем, что кэш не старше 24 часов
            if (parsed.timestamp && (Date.now() - parsed.timestamp) < 24 * 60 * 60 * 1000) {
              self.rates = parsed.rates;
              console.log('[Rates] Using cached rates from', new Date(parsed.timestamp).toLocaleTimeString());
              return;
            }
          }
        } catch (e) {}
        
        // Используем fallback курсы
        self.rates = DEFAULT_RATES;
        
        // Показываем предупреждение (только если не в офлайн-режиме)
        if (navigator.onLine !== false) {
          self._n.toast(self.t('ratesFail'), 'err');
        }
      });
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._registerSw = function () {
    if (!('serviceWorker' in navigator)) return;
    if (typeof location !== 'undefined' && location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._hideSkeleton = function () {
    var sk = this._d.getElementById('app-skeleton');
    var main = this._d.getElementById('mainApp');
    if (sk) sk.classList.add('mt-hidden');
    if (main) {
      main.classList.remove('opacity-0', 'pointer-events-none');
      main.classList.add('opacity-100');
    }
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._applyTheme = function () {
    var html = this._d.documentElement;
    html.setAttribute('data-theme', this.theme);
    html.style.colorScheme = this.theme === 'dark' ? 'dark' : 'light';
    var ic = this._d.getElementById('themeIcon');
    if (ic) ic.className = this.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    this._c.applyTheme();
  };

  /**
   * Применяет локализацию ко всем элементам интерфейса
   * @returns {void}
   */
  FinanceApp.prototype._applyI18n = function () {
      var L = this.lang;
      var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[L];
      
      // Устанавливаем язык документа
      this._d.documentElement.lang = L;
      
      // Обновляем заголовок страницы
      this._d.title = (pack && pack.appTitle) || 'MoneyTrack';
      
      // Обновляем мета-теги для SEO
      var metaDescription = this._d.querySelector('meta[name="description"]');
      var metaKeywords = this._d.querySelector('meta[name="keywords"]');
      
      if (metaDescription && pack && pack.metaDescription) {
          metaDescription.setAttribute('content', pack.metaDescription);
      }
      
      if (metaKeywords && pack && pack.metaKeywords) {
          metaKeywords.setAttribute('content', pack.metaKeywords);
      }
      
      // Обновляем все элементы с data-i18n (текстовое содержимое)
      this._d.querySelectorAll('[data-i18n]').forEach(function (el) {
          var k = el.getAttribute('data-i18n');
          if (pack && pack[k]) {
              el.textContent = pack[k];
          }
      });
      
      // Обновляем все элементы с data-i18n-placeholder (плейсхолдеры)
      this._d.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
          var k = el.getAttribute('data-i18n-placeholder');
          if (pack && pack[k]) {
              el.setAttribute('placeholder', pack[k]);
          }
      });
      
      // Обновляем все option с data-i18n (опции в селектах)
      this._d.querySelectorAll('option[data-i18n]').forEach(function (el) {
          var k = el.getAttribute('data-i18n');
          if (pack && pack[k]) {
              el.textContent = pack[k];
          }
      });
      
      // Обновляем текст кнопки языка
      var lt = this._d.getElementById('languageText');
      if (lt) {
          lt.textContent = L.toUpperCase();
      }
      
      // Обновляем aria-label кнопки "Наверх"
      var st = this._d.getElementById('scrollTopFab');
      if (st && pack && pack.scrollTopAria) {
          st.setAttribute('aria-label', pack.scrollTopAria);
      }
      
      // Обновляем заголовок модалки подтверждения (если она не открыта)
      var cmt = this._d.getElementById('confirmModalTitle');
      var cmod = this._d.getElementById('confirmModal');
      if (cmt && pack && pack.confirmTitle && (!cmod || !cmod.classList.contains('on'))) {
          cmt.textContent = pack.confirmTitle;
      }
      
      // Обновляем кнопку OK в модалке подтверждения (если она не открыта)
      var okb = this._d.getElementById('confirmOkBtn');
      if (okb && pack && pack.confirmOk && (!cmod || !cmod.classList.contains('on'))) {
          okb.classList.remove('mt-btn-danger');
          okb.classList.add('mt-btn-primary');
          okb.textContent = pack.confirmOk;
      }
      
      // Обновляем сообщения об ошибках валидации на текущем языке
      this._refreshFormErrorsFromLang();
  };

  /**
   * Сообщения об ошибках валидации на текущем языке.
   * @returns {void}
   */
  FinanceApp.prototype._refreshFormErrorsFromLang = function () {
    var d = this._d;
    var m = this.msg();
    var name = d.getElementById('transactionName');
    var am = d.getElementById('transactionAmount');
    var en = d.getElementById('errName');
    var ea = d.getElementById('errAmount');
    if (name && en && en.textContent) {
      var dn = this._v.validateName(name.value, m);
      en.textContent = dn.ok ? '' : dn.message;
    }
    if (am && ea && ea.textContent) {
      var da = this._v.validateAmount(am.value, m);
      ea.textContent = da.ok ? '' : da.message;
    }
    var editName = d.getElementById('editName');
    var editAm = d.getElementById('editAmount');
    var een = d.getElementById('editErrName');
    var eea = d.getElementById('editErrAmount');
    if (editName && een && een.textContent) {
      var dn2 = this._v.validateName(editName.value, m);
      een.textContent = dn2.ok ? '' : dn2.message;
    }
    if (editAm && eea && eea.textContent) {
      var da2 = this._v.validateAmount(editAm.value, m);
      eea.textContent = da2.ok ? '' : da2.message;
    }
    var goalT = d.getElementById('goalTitle');
    var goalV = d.getElementById('goalTarget');
    var errGt = d.getElementById('errGoalTitle');
    var errGv = d.getElementById('errGoalTarget');
    if (goalT && errGt && errGt.textContent) {
      var dg = this._v.validateName((goalT.value || '').trim(), m);
      errGt.textContent = dg.ok ? '' : dg.message;
    }
    if (goalV && errGv && errGv.textContent) {
      var dga = this._v.validateAmount(goalV.value, m);
      errGv.textContent = dga.ok ? '' : dga.message;
    }
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._fillCurrencySelects = function () {
    var opts = ['USD', 'EUR', 'RUB'];
    var self = this;
    ['currencySelect', 'currencySelectMobile'].forEach(function (id) {
      var sel = self._d.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '';
      opts.forEach(function (c) {
        var o = self._d.createElement('option');
        o.value = c;
        o.textContent = c;
        sel.appendChild(o);
      });
      sel.value = self.currency;
    });
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._wireCharts = function () {
    var self = this;
    this._c.loadLib().then(function () {
      self._c.whenVisible(self._d.getElementById('chartObserveBalance'), function () {
        self._c.refreshBalance();
      });
      self._c.whenVisible(self._d.getElementById('chartObserveIE'), function () {
        self._c.refreshIncomeExpense();
      });
      self._c.whenVisible(self._d.getElementById('chartObserveCat'), function () {
        self._c.refreshCategory();
      });
    }).catch(function (e) {
      self._n.toast(String(e.message || e), 'err');
    });
  };

  /**
   * @returns {void}
   */
  /**
 * @returns {void}
 */
  FinanceApp.prototype._bind = function() {
    var self = this;
    var d = this._d;

    // Форма добавления транзакции
    d.getElementById('transactionForm').addEventListener('submit', function(e) {
      e.preventDefault();
      self._onAddTx();
    });

    // Фильтрация ввода суммы
    var amt = d.getElementById('transactionAmount');
    if (amt) {
      amt.addEventListener('input', function() {
        amt.value = self._v.filterAmountInput(amt.value);
      });
    }
    
    var editAmt = d.getElementById('editAmount');
    if (editAmt) {
      editAmt.addEventListener('input', function() {
        editAmt.value = self._v.filterAmountInput(editAmt.value);
      });
    }

    // Переключение темы
    d.getElementById('themeToggle').addEventListener('click', function() {
      var root = d.documentElement;
      root.classList.add('mt-no-theme-transition');
      self.theme = self.theme === 'dark' ? 'light' : 'dark';
      self._s.setJson('theme', self.theme);
      self._applyTheme();
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          root.classList.remove('mt-no-theme-transition');
        });
      });
    });

    // Переключение языка
    d.getElementById('languageToggle').addEventListener('click', function() {
      self._n.clearAll();
      self.lang = self.lang === 'ru' ? 'en' : 'ru';
      self._s.setJson('lang', self.lang);
      self._applyI18n();
      self._c.invalidate();
      self.render();
    });

    // Выбор валюты
    ['currencySelect', 'currencySelectMobile'].forEach(function(id) {
      var s = d.getElementById(id);
      if (!s) return;
      s.addEventListener('change', function() {
        self._changeCurrency(s.value);
        if (typeof s.blur === 'function') s.blur();
      });
    });

    // Вкладки статистики
    d.querySelectorAll('.stat-tab').forEach(function(b) {
      b.addEventListener('click', function() {
        d.querySelectorAll('.stat-tab').forEach(function(x) {
          x.classList.remove('on');
        });
        b.classList.add('on');
        self.statsPeriod = b.getAttribute('data-period');
        self._renderStatsOnly();
      });
    });

    // Периоды для графика доходов/расходов
    d.querySelectorAll('button[data-chart-period]').forEach(function(b) {
      b.addEventListener('click', function() {
        d.querySelectorAll('button[data-chart-period]').forEach(function(x) {
          x.classList.remove('on');
        });
        b.classList.add('on');
        self.chartPeriod = b.getAttribute('data-chart-period');
        self._c.invalidate();
        self._c.refreshIncomeExpense();
      });
    });

    // Период для графика категорий
    var cps = d.getElementById('categoryPeriodSelect');
    if (cps) {
      cps.addEventListener('change', function() {
        self.catPeriod = cps.value;
        self._c.invalidate();
        self._c.refreshCategory();
      });
    }

    // Переключение доходы/расходы в категориях
    d.querySelectorAll('.cat-flow-tab').forEach(function(b) {
      b.addEventListener('click', function() {
        d.querySelectorAll('.cat-flow-tab').forEach(function(x) {
          x.classList.remove('on');
        });
        b.classList.add('on');
        self.catFlowType = b.getAttribute('data-cat-flow') || 'expense';
        if (self.catFlowType !== 'income' && self.catFlowType !== 'expense') self.catFlowType = 'expense';
        self._s.setJson('catFlow', self.catFlowType);
        self._c.invalidate();
        self._renderCategoryStats();
        self._c.refreshCategory();
      });
    });

    // Клик по логотипу
    var brandBtn = d.getElementById('mtBrandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', function() {
        var el = d.getElementById('section-form') || d.getElementById('mainApp');
        if (el && el.scrollIntoView) {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (e2) {
            el.scrollIntoView(true);
          }
        }
      });
    }

    // Закрытие приветственного баннера
    var welcomeDismiss = d.getElementById('welcomeDismissBtn');
    var welcomeBanner = d.getElementById('welcomeBanner');
    if (welcomeDismiss && welcomeBanner) {
      function dismissWelcome() {
        welcomeBanner.classList.add('hidden', 'mt-welcome--dismissed');
        welcomeBanner.setAttribute('aria-hidden', 'true');
        try {
          self._s.setJson('welcomeDismissed', true);
        } catch (e) {}
      }
      welcomeDismiss.addEventListener('click', function(e) {
        e.preventDefault();
        dismissWelcome();
      });
      welcomeDismiss.addEventListener('touchend', function(e) {
        e.preventDefault();
        dismissWelcome();
      }, { passive: false });
    }

    // Модалка "Все транзакции"
    d.getElementById('showAllBtn').addEventListener('click', function() {
      d.getElementById('allTransactionsModal').classList.add('on');
      self._renderAllModal();
      self._syncModalState();
    });
    
    d.getElementById('closeModal').addEventListener('click', function() {
      d.getElementById('allTransactionsModal').classList.remove('on');
      self._syncModalState();
    });
    
    d.getElementById('allTransactionsModal').addEventListener('click', function(e) {
      if (e.target.id === 'allTransactionsModal') {
        d.getElementById('allTransactionsModal').classList.remove('on');
        self._syncModalState();
      }
    });

    var listEl = d.getElementById('allTransactionsList');
    if (listEl) {
      listEl.addEventListener('scroll', function() {
        self._onAllModalScroll();
      }, { passive: true });
    }

    // Undo/Redo
    d.getElementById('undoBtn').addEventListener('click', function() {
      self._undo();
    });
    
    d.getElementById('redoBtn').addEventListener('click', function() {
      self._redo();
    });

    // Горячие клавиши
    d.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        self._undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        self._redo();
      }
    });

    // Модалка редактирования
    d.getElementById('closeEditModal').addEventListener('click', function() {
      d.getElementById('editModal').classList.remove('on');
      self._syncModalState();
    });
    
    d.getElementById('editModal').addEventListener('click', function(e) {
      if (e.target && e.target.id === 'editModal') {
        d.getElementById('editModal').classList.remove('on');
        self._syncModalState();
      }
    });
    
    d.getElementById('saveEditBtn').addEventListener('click', function() {
      self._saveEdit();
    });
    
    d.getElementById('deleteEditBtn').addEventListener('click', function() {
      self._confirm(
        self.t('confirmDelete'),
        function() {
          self._deleteById(self._editId);
          d.getElementById('editModal').classList.remove('on');
          self._syncModalState();
        },
        { variant: 'danger' }
      );
    });

    // Форма целей
    d.getElementById('goalForm').addEventListener('submit', function(e) {
      e.preventDefault();
      self._addGoal();
    });
    
    var goalTitleEl = d.getElementById('goalTitle');
    var goalTargetEl = d.getElementById('goalTarget');
    if (goalTitleEl) {
      goalTitleEl.addEventListener('input', function() {
        var er = d.getElementById('errGoalTitle');
        if (er) er.textContent = '';
      });
    }
    if (goalTargetEl) {
      goalTargetEl.addEventListener('input', function() {
        goalTargetEl.value = self._v.filterAmountInput(goalTargetEl.value);
        var er = d.getElementById('errGoalTarget');
        if (er) er.textContent = '';
      });
    }

    // ========== ЭКСПОРТ ==========
    // Экспорт в Excel
    d.getElementById('exportXlsxBtn').addEventListener('click', function() {
      self._s.setJson('hasExported', true);
      self._exportExcel();
    });
    
    // Экспорт в JSON
    d.getElementById('exportJsonBtn').addEventListener('click', function() {
      self._s.setJson('hasExported', true);
      self._exportJson();
    });

    // ========== ИМПОРТ EXCEL ==========
    var importXlsxBtn = d.getElementById('importXlsxBtn');
    var importXlsxFile = d.getElementById('importXlsxFile');
    
    if (importXlsxBtn && importXlsxFile) {
      importXlsxBtn.addEventListener('click', function() {
        importXlsxFile.click();
      });
      
      importXlsxFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) self._readXlsxFile(file);
        e.target.value = '';
      });
    }

    // ========== ИМПОРТ JSON ==========
    var importJsonBtn = d.getElementById('importJsonBtn');
    var importJsonFile = d.getElementById('importJsonFile');
    
    if (importJsonBtn && importJsonFile) {
      importJsonBtn.addEventListener('click', function() {
        importJsonFile.click();
      });
      
      importJsonFile.addEventListener('change', function(e) {
        var f2 = e.target.files && e.target.files[0];
        if (f2) self._readJsonFile(f2);
        e.target.value = '';
      });
    }

    // Модалка импорта
    d.getElementById('closeImportModal').addEventListener('click', function() {
      d.getElementById('importModal').classList.remove('on');
      self._syncModalState();
    });
    
    d.getElementById('confirmImportBtn').addEventListener('click', function() {
      self._runImport();
    });

    // Модалка подтверждения
    d.getElementById('closeConfirmModal').addEventListener('click', function() {
      self._closeConfirm();
    });
    
    d.getElementById('confirmCancelBtn').addEventListener('click', function() {
      self._closeConfirm();
    });
    
    d.getElementById('confirmOkBtn').addEventListener('click', function() {
      if (self._confirmCb) self._confirmCb();
      self._closeConfirm();
    });

    // Нижняя навигация (мобильная)
    d.querySelectorAll('.bottom-nav-mt button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._setMobileTab(btn.getAttribute('data-nav'));
      });
    });

    // Поиск по транзакциям
    function wireSearch(el) {
      if (!el) return;
      el.addEventListener('input', Util.debounce(function() {
        self._search = el.value.trim().toLowerCase();
        var o = d.getElementById('transactionSearch');
        var od = d.getElementById('transactionSearchDesktop');
        if (o && od && el === o) od.value = el.value;
        if (o && od && el === od) o.value = el.value;
        self._renderTxList();
      }, 300));
    }
    
    wireSearch(d.getElementById('transactionSearch'));
    wireSearch(d.getElementById('transactionSearchDesktop'));

    // Кнопка "Наверх"
    var scrollFab = d.getElementById('scrollTopFab');
    if (scrollFab) {
      scrollFab.addEventListener('click', function() {
        var root = d.documentElement;
        var y = window.scrollY || root.scrollTop;
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } catch (e) {
          root.scrollTop = 0;
          d.body.scrollTop = 0;
        }
        if (y === 0) {
          root.scrollTop = 0;
          d.body.scrollTop = 0;
        }
      });
      
      var onScrollFab = function() {
        self._updateScrollTopFab();
      };
      
      window.addEventListener('scroll', onScrollFab, { passive: true });
      window.addEventListener('resize', onScrollFab, { passive: true });
      onScrollFab();
    }
  };

  /**
   * Кнопка «наверх»: видна у нижней границы страницы.
   * @returns {void}
   */
  FinanceApp.prototype._updateScrollTopFab = function () {
    var btn = this._d.getElementById('scrollTopFab');
    if (!btn) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) {
      btn.hidden = true;
      btn.setAttribute('aria-hidden', 'true');
      return;
    }
    var root = this._d.documentElement;
    var body = this._d.body;
    var sh = Math.max(body.scrollHeight, root.scrollHeight);
    var vh = window.innerHeight;
    var y = window.scrollY || root.scrollTop;
    var distFromBottom = sh - (y + vh);
    var nearBottom = distFromBottom < 200;
    var canScroll = sh > vh + 48;
    var modalOpen = this._d.querySelector('.modal-mt.on');
    var show = canScroll && nearBottom && !modalOpen;
    btn.hidden = !show;
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
  };

  /**
   * @param {string} tab
   * @returns {void}
   */
  FinanceApp.prototype._setMobileTab = function (tab) {
    this._mobileTab = tab;
    var d = this._d;
    d.querySelectorAll('.bottom-nav-mt button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-nav') === tab);
    });
    d.querySelectorAll('.mt-tab-panel').forEach(function (p) {
      var t = p.getAttribute('data-tab');
      p.classList.toggle('active', t === tab);
    });
    this._syncModalState();
    if (tab === 'stats') this._refreshChartsAfterLayout();
  };

  /**
   * Графики на скрытых панелях могут инициализироваться с нулевой высотой.
   * @returns {void}
   */
  FinanceApp.prototype._refreshChartsAfterLayout = function () {
    var self = this;
    if (!this._c || typeof this._c.loadLib !== 'function') return;
    this._c.loadLib().then(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try {
            self._c.refreshBalance();
            self._c.refreshIncomeExpense();
            self._c.refreshCategory();
            if (self._c.balanceChart) self._c.balanceChart.resize();
            if (self._c.ieChart) self._c.ieChart.resize();
            if (self._c.catChart) self._c.catChart.resize();
          } catch (e) {}
        });
      });
    }).catch(function () {});
  };

  /**
   * @returns {boolean}
   */
  FinanceApp.prototype._anyModalOpen = function () {
    return !!this._d.querySelector('.modal-mt.on');
  };

  /**
   * Блокируем скролл страницы и клики по нижней навигации под модалкой.
   * @returns {void}
   */
  FinanceApp.prototype._lockBodyScroll = function () {
    if (this._scrollLocked) return;
    var d = this._d;
    var root = d.documentElement;
    var body = d.body;
    body.classList.add('mt-modal-open');
    root.classList.add('mt-modal-open');
    this._scrollLocked = true;
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._unlockBodyScroll = function () {
    if (!this._scrollLocked) return;
    var d = this._d;
    var root = d.documentElement;
    var body = d.body;
    body.classList.remove('mt-modal-open');
    root.classList.remove('mt-modal-open');
    this._scrollLocked = false;
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._syncModalState = function () {
    if (this._anyModalOpen()) this._lockBodyScroll();
    else this._unlockBodyScroll();
    this._updateScrollTopFab();
  };

  /**
   * @param {string} cur
   * @returns {void}
   */
  FinanceApp.prototype._changeCurrency = function (cur) {
    this.currency = cur;
    this._s.setJson('currency', cur);
    this._fillCurrencySelects();
    this._balMemo = { k: '', v: null };
    this._c.invalidate();
    this.render();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._onAddTx = function () {
    var d = this._d;
    var m = this.msg();
    var name = d.getElementById('transactionName').value;
    var am = d.getElementById('transactionAmount').value;
    var dn = this._v.validateName(name, m);
    var da = this._v.validateAmount(am, m);
    d.getElementById('errName').textContent = dn.ok ? '' : dn.message;
    d.getElementById('errAmount').textContent = da.ok ? '' : da.message;
    if (!dn.ok || !da.ok) return;

    var clean = this._v.sanitizeName(name.trim());
    var usd = this.toUsd(da.value);
    var tx = {
      id: Date.now(),
      name: clean,
      amount: da.value,
      amountUsd: usd,
      category: d.getElementById('transactionCategory').value,
      type: d.querySelector('input[name="transactionType"]:checked').value,
      date: Util.parseYmd(d.getElementById('transactionDate').value)
    };

    this._u.pushSnapshot(this.transactions);
    this.transactions.unshift(tx);
    this._persistTx();
    this.render();

    var btn = d.getElementById('submitTransactionBtn');
    if (btn) {
      btn.classList.add('ring-4', 'ring-emerald-400');
      setTimeout(function () {
        btn.classList.remove('ring-4', 'ring-emerald-400');
      }, 450);
    }
    d.getElementById('transactionName').value = '';
    d.getElementById('transactionAmount').value = '';
    this._n.toast(this.t('saved'), 'ok', 2200);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._undo = function () {
    var n = this._u.undo(this.transactions);
    if (!n) {
      this._n.toast(this.t('undoNone'), 'info');
      return;
    }
    this.transactions = n;
    this._persistTx();
    this.render();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._redo = function () {
    var n = this._u.redo(this.transactions);
    if (!n) {
      this._n.toast(this.t('redoNone'), 'info');
      return;
    }
    this.transactions = n;
    this._persistTx();
    this.render();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._persistTx = function () {
    var self = this;
    this._s.saveTransactions(this.transactions).catch(function (e) {
      self._n.toast(String(e.message || e), 'err');
    });
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._persistGoals = function () {
    this._s.setJson('goals', this.goals);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype.render = function () {
    this._renderDate();
    this._renderBalance();
    this._renderTxList();
    this._renderRecent();
    this._renderCategoryStats();
    this._renderStatsOnly();
    this._renderGoals();
    this._renderSmart();
    this._setDailyTip();
    this._syncCatFlowTabs();
    this._renderAchievements();
    this._checkNewAchievementsToast();
    this._renderProfileEngagementStats();
    this._c.refreshBalance();
    this._c.refreshIncomeExpense();
    this._c.refreshCategory();
    this._updateScrollTopFab();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderDate = function () {
    var el = this._d.getElementById('currentDate');
    if (!el) return;
    var opt = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    el.textContent = new Date().toLocaleDateString(this.lang === 'ru' ? 'ru-RU' : 'en-US', opt);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderBalance = function () {
    var b = this.computeBalance();
    var d = this._d;
    var tb = d.getElementById('totalBalance');
    if (tb) {
      tb.textContent = this.formatMoney(this.toDisplay(b.totalUsd));
      tb.classList.toggle('text-emerald-500', b.totalUsd >= 0);
      tb.classList.toggle('text-red-400', b.totalUsd < 0);
    }
    d.getElementById('totalIncome').textContent = this.formatMoney(this.toDisplay(b.incomeUsd));
    d.getElementById('totalExpense').textContent = this.formatMoney(this.toDisplay(b.expenseUsd));
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderStatsOnly = function () {
    var r = this._periodRange(this.statsPeriod);
    var inc = 0;
    var exp = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt < r.a || dt > r.b) return;
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') inc += u;
      else exp += u;
    });
    var bal = inc - exp;
    var saved = bal > 0 ? bal : 0;
    var d = this._d;
    d.getElementById('statIncome').textContent = this.formatMoney(this.toDisplay(inc));
    d.getElementById('statExpense').textContent = this.formatMoney(this.toDisplay(exp));
    d.getElementById('statSaved').textContent = this.formatMoney(this.toDisplay(saved));
    d.getElementById('statSpent').textContent = this.formatMoney(this.toDisplay(exp));
    d.getElementById('statBalance').textContent = this.formatMoney(this.toDisplay(bal));
    var denom = this._statAvgDenominator(this.statsPeriod);
    d.getElementById('statAvgIncome').textContent = this.formatMoney(this.toDisplay(inc / denom));
    d.getElementById('statAvgExpense').textContent = this.formatMoney(this.toDisplay(exp / denom));
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    var per = this.statsPeriod;
    if (pack) {
      var li = d.getElementById('avgIncomeLabel');
      var le = d.getElementById('avgExpenseLabel');
      if (li) {
        li.textContent =
          per === 'day'
            ? pack.statsAvgInDay || pack.statsAvgIn
            : per === 'week'
              ? pack.statsAvgInWeek || pack.statsAvgIn
              : per === 'month'
                ? pack.statsAvgInMonth || pack.statsAvgIn
                : pack.statsAvgInYear || pack.statsAvgIn;
      }
      if (le) {
        le.textContent =
          per === 'day'
            ? pack.statsAvgExDay || pack.statsAvgEx
            : per === 'week'
              ? pack.statsAvgExWeek || pack.statsAvgEx
              : per === 'month'
                ? pack.statsAvgExMonth || pack.statsAvgEx
                : pack.statsAvgExYear || pack.statsAvgEx;
      }
    }
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderCategoryStats = function () {
    var self = this;
    var pack = self.packCategoryDoughnut();
    var i18 = window.MoneyTrackI18N && window.MoneyTrackI18N[self.lang];
    var h = self._d.getElementById('categoryStatsHeading');
    var hm = self._d.getElementById('categoryStatsHeadingMobile');
    if (i18) {
      var ttl =
        self.catFlowType === 'income'
          ? i18.categoryStatsTitleIncome || i18.categoryStatsTitle
          : i18.categoryStatsTitle;
      if (h) h.textContent = ttl;
      if (hm) hm.textContent = ttl;
    }
    var emptyText =
      (window.MoneyTrackI18N && window.MoneyTrackI18N[self.lang] && window.MoneyTrackI18N[self.lang].categoryStatsEmpty) ||
      '—';
    ['categoryStats', 'categoryStatsMobile'].forEach(function (id) {
      var box = self._d.getElementById(id);
      if (!box) return;
      box.textContent = '';
      if (!pack.data.length) {
        var p = self._d.createElement('p');
        p.className = 'text-sm text-[var(--mt-muted)]';
        p.textContent = emptyText;
        box.appendChild(p);
        return;
      }
      var frag = self._d.createDocumentFragment();
      for (var i = 0; i < pack.labels.length; i++) {
        var row = self._d.createElement('div');
        row.className = 'flex justify-between text-sm py-1 border-b border-slate-600/10';
        var a = self._d.createElement('span');
        a.textContent = pack.labels[i];
        var b = self._d.createElement('span');
        b.textContent = self.formatMoney(pack.data[i]);
        row.appendChild(a);
        row.appendChild(b);
        frag.appendChild(row);
      }
      box.appendChild(frag);
    });
  };

  /**
   * @returns {Array<object>}
   */
  FinanceApp.prototype._filteredTx = function () {
    var q = this._search;
    if (!q) return this.transactions;
    return this.transactions.filter(function (t) {
      return String(t.name).toLowerCase().indexOf(q) !== -1;
    });
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderTxList = function () {
    var host = this._d.getElementById('transactionsList');
    if (!host) return;
    host.textContent = '';
    host.classList.remove('tx-list--empty');
    var list = this._filteredTx().slice(0, 5);
    if (!list.length) {
      host.classList.add('tx-list--empty');
      var wrap = this._d.createElement('div');
      wrap.className =
        'tx-empty-state flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-600/25 bg-[var(--mt-surface-2)]/40 px-4 py-10 min-h-[12rem] md:min-h-[14rem] text-center';
      var ic = this._d.createElement('div');
      ic.className = 'text-3xl text-[var(--mt-muted)] opacity-60';
      ic.setAttribute('aria-hidden', 'true');
      var icFa = this._d.createElement('i');
      icFa.className = 'fas fa-receipt';
      ic.appendChild(icFa);
      var e = this._d.createElement('p');
      e.className = 'text-sm text-[var(--mt-muted)] leading-relaxed max-w-xs';
      e.textContent =
        (window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang] && window.MoneyTrackI18N[this.lang].txEmpty) ||
        '—';
      wrap.appendChild(ic);
      wrap.appendChild(e);
      var hintText =
        window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang] && window.MoneyTrackI18N[this.lang].txEmptyHint;
      if (hintText) {
        var hint = this._d.createElement('p');
        hint.className = 'text-xs text-[var(--mt-muted)] opacity-80 max-w-xs';
        hint.textContent = hintText;
        wrap.appendChild(hint);
      }
      host.appendChild(wrap);
      return;
    }
    var frag = this._d.createDocumentFragment();
    list.forEach(function (t) {
      frag.appendChild(this._txRow(t, true));
    }, this);
    host.appendChild(frag);
  };

  /**
   * @param {object} t
   * @param {boolean} delBtn
   * @param {{recentLayout?: boolean}|undefined} opts
   * @returns {HTMLElement}
   */
  FinanceApp.prototype._txRow = function (t, delBtn, opts) {
    var self = this;
    var recent = opts && opts.recentLayout;
    var fromModal = opts && opts.fromAllModal;
    var row = this._d.createElement('div');
    row.classList.add('tx-row');
    row.className = fromModal
      ? 'tx-row--modal flex gap-2 items-stretch rounded-xl bg-[var(--mt-surface-2)] p-3 cursor-pointer border-l-4 ' +
        (t.type === 'income' ? 'border-emerald-500' : 'border-red-500')
      : (recent ? 'flex flex-col gap-2 ' : 'flex items-center justify-between gap-2 ') +
        'rounded-xl bg-[var(--mt-surface-2)] p-3 cursor-pointer border-l-4 ' +
        (t.type === 'income' ? 'border-emerald-500' : 'border-red-500');
    row.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.js-del')) return;
      self._openEdit(t);
    });

    var ic = this._d.createElement('span');
    ic.className = 'shrink-0 text-lg leading-none';
    ic.textContent = CAT[t.category] ? CAT[t.category].icon : '📦';
    var nm = this._d.createElement('div');
    nm.className = 'tx-name font-medium truncate min-w-0 flex-1';
    nm.textContent = t.name;
    var meta = this._d.createElement('div');
    meta.className = 'tx-meta text-xs text-[var(--mt-muted)] whitespace-normal break-words';
    meta.textContent =
      (CAT[t.category] ? CAT[t.category][self.lang === 'ru' ? 'ru' : 'en'] : '') +
      ' · ' +
      self._fmtDate(t.date);

    var u = t.amountUsd != null ? t.amountUsd : t.amount;
    var amt = this._d.createElement('span');
    amt.className =
      (recent ? 'text-sm sm:text-base text-right self-end max-w-full break-all tabular-nums ' : 'font-semibold shrink-0 ') +
      (t.type === 'income' ? 'text-emerald-400' : 'text-red-400');
    amt.textContent = (t.type === 'income' ? '+' : '−') + self.formatMoney(self.toDisplay(u));

    if (recent) {
      var head = this._d.createElement('div');
      head.className = 'flex items-start gap-2 w-full min-w-0';
      head.appendChild(ic);
      head.appendChild(nm);
      row.appendChild(head);
      row.appendChild(meta);
      row.appendChild(amt);
    } else if (fromModal) {
      nm.className = 'font-medium text-sm break-words min-w-0 leading-snug';
      meta.className = 'text-xs text-[var(--mt-muted)] break-words mt-0.5 leading-normal';
      amt.className =
        'text-sm font-semibold tabular-nums text-left ' +
        (t.type === 'income' ? 'text-emerald-400' : 'text-red-400');
      var mainCol = this._d.createElement('div');
      mainCol.className = 'min-w-0 flex-1 flex flex-col gap-2';
      var topRow = this._d.createElement('div');
      topRow.className = 'flex gap-2 items-start';
      var textCol = this._d.createElement('div');
      textCol.className = 'min-w-0 flex-1';
      textCol.appendChild(nm);
      textCol.appendChild(meta);
      topRow.appendChild(ic);
      topRow.appendChild(textCol);
      mainCol.appendChild(topRow);
      mainCol.appendChild(amt);
      var delCol = this._d.createElement('div');
      delCol.className = 'js-del-col shrink-0 flex items-center justify-center self-stretch';
      if (delBtn) {
        var delM = this._d.createElement('button');
        delM.type = 'button';
        delM.className =
          'js-del mt-del-btn mt-btn-icon text-red-400/90 hover:text-red-500 hover:bg-red-500/15 p-2 rounded-lg';
        delM.setAttribute('aria-label', 'delete');
        var delMIc = self._d.createElement('i');
        delMIc.className = 'fas fa-trash';
        delMIc.setAttribute('aria-hidden', 'true');
        delM.appendChild(delMIc);
        delM.addEventListener('click', function (e) {
          e.stopPropagation();
          self._confirm(
            self.t('confirmDelete'),
            function () {
              row.classList.add('tx-fade-out');
              setTimeout(function () {
                self._deleteById(t.id);
              }, 320);
            },
            { variant: 'danger' }
          );
        });
        delCol.appendChild(delM);
      }
      row.appendChild(mainCol);
      row.appendChild(delCol);
      return row;
    } else {
      nm.className = 'font-medium truncate';
      var left = this._d.createElement('div');
      left.className = 'flex items-center gap-2 min-w-0 flex-1';
      var mid = this._d.createElement('div');
      mid.className = 'min-w-0 flex-1';
      mid.appendChild(nm);
      mid.appendChild(meta);
      left.appendChild(ic);
      left.appendChild(mid);

      var right = this._d.createElement('div');
      right.className = 'flex items-center gap-2 shrink-0';
      amt.className = 'font-semibold ' + (t.type === 'income' ? 'text-emerald-400' : 'text-red-400');
      right.appendChild(amt);
      if (delBtn) {
        var del = this._d.createElement('button');
        del.type = 'button';
        del.className = 'js-del mt-del-btn mt-btn-icon text-red-400/90 hover:text-red-500 hover:bg-red-500/15 p-2 rounded-lg';
        del.setAttribute('aria-label', 'delete');
        var delIc = self._d.createElement('i');
        delIc.className = 'fas fa-trash';
        delIc.setAttribute('aria-hidden', 'true');
        del.appendChild(delIc);
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          self._confirm(
            self.t('confirmDelete'),
            function () {
              row.classList.add('tx-fade-out');
              setTimeout(function () {
                self._deleteById(t.id);
              }, 320);
            },
            { variant: 'danger' }
          );
        });
        right.appendChild(del);
      }
      row.appendChild(left);
      row.appendChild(right);
      return row;
    }

    if (delBtn) {
      var del2 = this._d.createElement('button');
      del2.type = 'button';
      del2.className =
        'js-del mt-del-btn self-end mt-btn-icon text-red-400/90 hover:text-red-500 hover:bg-red-500/15 p-2 rounded-lg';
      del2.setAttribute('aria-label', 'delete');
      var delIc2 = self._d.createElement('i');
      delIc2.className = 'fas fa-trash';
      delIc2.setAttribute('aria-hidden', 'true');
      del2.appendChild(delIc2);
      del2.addEventListener('click', function (e) {
        e.stopPropagation();
        self._confirm(
          self.t('confirmDelete'),
          function () {
            row.classList.add('tx-fade-out');
            setTimeout(function () {
              self._deleteById(t.id);
            }, 320);
          },
          { variant: 'danger' }
        );
      });
      row.appendChild(del2);
    }
    return row;
  };

  /**
   * @param {Date|string} dt
   * @returns {string}
   */
  FinanceApp.prototype._fmtDate = function (dt) {
    var d;
    if (dt instanceof Date) {
      d = dt;
    } else if (typeof dt === 'string') {
      // Пробуем разные форматы
      d = new Date(dt);
      if (isNaN(d.getTime())) {
        // Если не получилось, пробуем парсить YYYY-MM-DD
        var parts = dt.split(/[.\-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
          } else {
            d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
          }
        }
      }
    } else {
      d = new Date(dt);
    }
    
    // Если дата невалидна, возвращаем текущую
    if (isNaN(d.getTime())) {
      d = new Date();
    }
    
    return (
      String(d.getDate()).padStart(2, '0') +
      '.' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '.' +
      d.getFullYear()
    );
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderRecent = function () {
    var host = this._d.getElementById('recentTransactions');
    if (!host) return;
    host.textContent = '';
    var frag = this._d.createDocumentFragment();
    this.transactions.slice(0, 3).forEach(function (t) {
      frag.appendChild(this._txRow(t, false, { recentLayout: true }));
    }, this);
    if (!frag.childNodes.length) {
      var p = this._d.createElement('p');
      p.className = 'text-sm text-[var(--mt-muted)]';
      p.textContent =
        (window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang] && window.MoneyTrackI18N[this.lang].recentEmpty) ||
        '—';
      host.appendChild(p);
    } else host.appendChild(frag);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderAllModal = function () {
    this._allScrollTop = 0;
    this._renderAllVirtual();
  };

  /** @type {number} */
  FinanceApp.prototype._allScrollTop = 0;

  /**
   * @returns {void}
   */
  FinanceApp.prototype._onAllModalScroll = function () {
    var host = this._d.getElementById('allTransactionsList');
    if (!host) return;
    this._allScrollTop = host.scrollTop;
    var sorted = this._sortedAll();
    if (sorted.length > 100) this._renderAllVirtual();
  };

  /**
   * @returns {Array<object>}
   */
  FinanceApp.prototype._sortedAll = function () {
    return this.transactions.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  };

  /**
   * Виртуальная прокрутка при >100 записей.
   * @returns {void}
   */
  FinanceApp.prototype._renderAllVirtual = function () {
    var host = this._d.getElementById('allTransactionsList');
    if (!host) return;
    var sorted = this._sortedAll();
    host.textContent = '';
    if (!sorted.length) {
      var p = this._d.createElement('p');
      p.className = 'text-sm text-[var(--mt-muted)] text-center py-8';
      p.textContent =
        (window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang] && window.MoneyTrackI18N[this.lang].modalNoTx) ||
        '—';
      host.appendChild(p);
      return;
    }
    var ROW = 76;
    var self = this;
    if (sorted.length <= 100) {
      var frag = this._d.createDocumentFragment();
      sorted.forEach(function (t) {
        frag.appendChild(self._txRow(t, true, { fromAllModal: true }));
      });
      host.appendChild(frag);
      return;
    }
    host.style.position = 'relative';
    host.style.maxHeight = '55vh';
    host.style.overflow = 'auto';
    var totalH = sorted.length * ROW;
    var top = this._allScrollTop || 0;
    var start = Math.floor(top / ROW);
    var vis = Math.ceil(host.clientHeight / ROW) + 4;
    var end = Math.min(sorted.length, start + vis);
    var padTop = start * ROW;
    var padBot = totalH - end * ROW;
    var before = this._d.createElement('div');
    before.style.height = padTop + 'px';
    var after = this._d.createElement('div');
    after.style.height = Math.max(0, padBot) + 'px';
    var mid = this._d.createDocumentFragment();
    for (var i = start; i < end; i++) {
      mid.appendChild(this._txRow(sorted[i], true, { fromAllModal: true }));
    }
    host.appendChild(before);
    host.appendChild(mid);
    host.appendChild(after);
    host.scrollTop = top;
  };

  /**
   * @param {object} t
   * @returns {void}
   */
  FinanceApp.prototype._openEdit = function (t) {
    this._editId = t.id;
    var d = this._d;
    d.getElementById('editId').value = String(t.id);
    d.getElementById('editName').value = t.name;
    var u = t.amountUsd != null ? t.amountUsd : t.amount;
    d.getElementById('editAmount').value = String(this.toDisplay(u).toFixed(2));
    d.getElementById('editDate').value = Util.toYmd(new Date(t.date));
    var sel = d.getElementById('editCategory');
    sel.textContent = '';
    Object.keys(CAT).forEach(function (k) {
      var o = d.createElement('option');
      o.value = k;
      o.textContent = CAT[k][this.lang === 'ru' ? 'ru' : 'en'];
      sel.appendChild(o);
    }, this);
    sel.value = t.category;
    d.querySelector('input[name="editType"][value="' + t.type + '"]').checked = true;
    d.getElementById('editErrName').textContent = '';
    d.getElementById('editErrAmount').textContent = '';
    d.getElementById('editModal').classList.add('on');
    this._syncModalState();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._saveEdit = function () {
    var d = this._d;
    var m = this.msg();
    var id = +d.getElementById('editId').value;
    var name = d.getElementById('editName').value;
    var am = d.getElementById('editAmount').value;
    var dn = this._v.validateName(name, m);
    var da = this._v.validateAmount(am, m);
    d.getElementById('editErrName').textContent = dn.ok ? '' : dn.message;
    d.getElementById('editErrAmount').textContent = da.ok ? '' : da.message;
    if (!dn.ok || !da.ok) return;
    var self = this;
    var t = this.transactions.find(function (x) {
      return x.id === id;
    });
    if (!t) return;
    this._u.pushSnapshot(this.transactions);
    t.name = this._v.sanitizeName(name.trim());
    t.amount = da.value;
    t.amountUsd = this.toUsd(da.value);
    t.category = d.getElementById('editCategory').value;
    t.type = d.querySelector('input[name="editType"]:checked').value;
    t.date = Util.parseYmd(d.getElementById('editDate').value);
    this._persistTx();
    d.getElementById('editModal').classList.remove('on');
    this._syncModalState();
    this.render();
    var modal = d.getElementById('allTransactionsModal');
    if (modal && modal.classList.contains('on')) this._renderAllModal();
    this._n.toast(this.t('saved'), 'ok', 2000);
  };

  /**
   * @param {number} id
   * @returns {void}
   */
  FinanceApp.prototype._deleteById = function (id) {
    this._u.pushSnapshot(this.transactions);
    this.transactions = this.transactions.filter(function (t) {
      return t.id !== id;
    });
    this._persistTx();
    this.render();
    var modal = this._d.getElementById('allTransactionsModal');
    if (modal && modal.classList.contains('on')) this._renderAllModal();
  };

  /**
   * @param {string} msg
   * @param {function():void} cb
   * @param {{variant?: string}|undefined} opts
   * @returns {void}
   */
  FinanceApp.prototype._confirm = function (msg, cb, opts) {
    opts = opts || {};
    this._confirmCb = cb;
    this._confirmVariant = opts.variant === 'danger' ? 'danger' : 'default';
    var d = this._d;
    d.getElementById('confirmMessage').textContent = msg;
    var panel = d.getElementById('confirmModalPanel');
    var okBtn = d.getElementById('confirmOkBtn');
    var titleEl = d.getElementById('confirmModalTitle');
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    if (panel) panel.classList.toggle('confirm-modal--danger', this._confirmVariant === 'danger');
    if (okBtn) {
      okBtn.classList.remove('mt-btn-primary', 'mt-btn-danger');
      if (this._confirmVariant === 'danger') {
        okBtn.className =
          'flex-1 min-h-[44px] rounded-lg bg-red-600 hover:bg-red-500 text-white py-2 shadow-sm mt-btn-danger';
        okBtn.textContent = (pack && pack.confirmDeleteAction) || 'OK';
      } else {
        okBtn.classList.add('mt-btn-primary');
        okBtn.textContent = (pack && pack.confirmOk) || 'OK';
      }
    }
    if (titleEl && pack) {
      titleEl.textContent =
        this._confirmVariant === 'danger'
          ? pack.confirmDeleteTitle || pack.confirmTitle
          : pack.confirmTitle;
    }
    d.getElementById('confirmModal').classList.add('on');
    this._syncModalState();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._closeConfirm = function () {
    this._confirmCb = null;
    this._confirmVariant = 'default';
    var d = this._d;
    var panel = d.getElementById('confirmModalPanel');
    var okBtn = d.getElementById('confirmOkBtn');
    var titleEl = d.getElementById('confirmModalTitle');
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    if (panel) panel.classList.remove('confirm-modal--danger');
    if (okBtn) {
      okBtn.classList.remove('mt-btn-danger');
      okBtn.classList.add('mt-btn-primary');
      if (pack && pack.confirmOk) okBtn.textContent = pack.confirmOk;
    }
    if (titleEl && pack && pack.confirmTitle) titleEl.textContent = pack.confirmTitle;
    d.getElementById('confirmModal').classList.remove('on');
    this._syncModalState();
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._addGoal = function () {
    var d = this._d;
    var m = this.msg();
    var title = (d.getElementById('goalTitle').value || '').trim();
    var raw = d.getElementById('goalTarget').value;
    var dn = this._v.validateName(title, m);
    var da = this._v.validateAmount(raw, m);
    var en = d.getElementById('errGoalTitle');
    var ea = d.getElementById('errGoalTarget');
    if (en) en.textContent = dn.ok ? '' : dn.message;
    if (ea) ea.textContent = da.ok ? '' : da.message;
    if (!dn.ok || !da.ok) return;
    this.goals.push({
      id: Date.now(),
      title: this._v.sanitizeName(title),
      targetUsd: this.toUsd(da.value)
    });
    d.getElementById('goalTitle').value = '';
    d.getElementById('goalTarget').value = '';
    if (en) en.textContent = '';
    if (ea) ea.textContent = '';
    this._persistGoals();
    this._renderGoals();
    this._n.toast(this.t('goalAdded'), 'ok');
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderGoals = function () {
      var host = this._d.getElementById('goalsList');
      if (!host) return;
      host.textContent = '';
      
      var saved = this.savedForStatsPeriodUsd();
      var self = this;
      var frag = this._d.createDocumentFragment();
      
      this.goals.forEach(function (g) {
          var pct = Math.min(100, (saved / g.targetUsd) * 100);
          var days = saved > 0 && pct < 100
              ? Math.ceil((g.targetUsd - saved) / (saved / 30))
              : null;
          
          var card = self._d.createElement('div');
          card.className = 'rounded-xl border border-slate-600/20 p-3 space-y-2 relative group';
          
          // Заголовок с кнопкой удаления
          var header = self._d.createElement('div');
          header.className = 'flex items-start justify-between gap-2';
          
          var titleEl = self._d.createElement('h3');
          titleEl.className = 'font-medium text-sm flex-1 min-w-0 break-words';
          titleEl.textContent = g.title;
          
          // Кнопка удаления
          var delBtn = self._d.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'mt-btn-icon shrink-0 text-[var(--mt-muted)] hover:text-red-400 p-1.5 rounded-lg transition-colors';
          delBtn.setAttribute('aria-label', self.lang === 'ru' ? 'Удалить цель' : 'Delete goal');
          
          var delIcon = self._d.createElement('i');
          delIcon.className = 'fas fa-trash text-sm';
          delIcon.setAttribute('aria-hidden', 'true');
          delBtn.appendChild(delIcon);
          
          delBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              self._deleteGoal(g.id);
          });
          
          header.appendChild(titleEl);
          header.appendChild(delBtn);
          
          // Прогресс-бар
          var bar = self._d.createElement('div');
          bar.className = 'h-2 rounded-full bg-[var(--mt-surface-2)] overflow-hidden';
          
          var fill = self._d.createElement('div');
          fill.className = 'h-full bg-emerald-500 transition-all duration-500';
          fill.style.width = pct.toFixed(1) + '%';
          bar.appendChild(fill);
          
          // Информация о прогрессе
          var sub = self._d.createElement('p');
          sub.className = 'text-xs text-[var(--mt-muted)]';
          sub.textContent = self.formatMoney(self.toDisplay(saved)) +
              ' / ' +
              self.formatMoney(self.toDisplay(g.targetUsd)) +
              (days != null && days > 0 && days < 5000
                  ? (self.lang === 'ru' ? ' · ~' + days + ' дн.' : ' · ~' + days + ' d')
                  : '');
          
          card.appendChild(header);
          card.appendChild(bar);
          card.appendChild(sub);
          frag.appendChild(card);
      });
      
      host.appendChild(frag);
  };

  /**
   * Удаляет цель по ID с подтверждением
   * @param {number} id
   * @returns {void}
   */
  FinanceApp.prototype._deleteGoal = function (id) {
      var self = this;
      var goal = this.goals.find(g => g.id === id);
      if (!goal) return;
      
      var confirmMsg = this.lang === 'ru' 
          ? 'Удалить цель "' + goal.title + '"?'
          : 'Delete goal "' + goal.title + '"?';
      
      this._confirm(
          confirmMsg,
          function () {
              // Сохраняем снимок для undo
              var snapshot = JSON.parse(JSON.stringify(self.goals));
              
              // Удаляем
              self.goals = self.goals.filter(g => g.id !== id);
              
              // Сохраняем в историю (если есть сервис undo для целей)
              if (self._goalsHistory) {
                  self._goalsHistory.push(snapshot);
              }
              
              self._persistGoals();
              self._renderGoals();
              
              var msg = self.lang === 'ru' ? 'Цель удалена' : 'Goal deleted';
              self._n.toast(msg, 'info', 2000);
          },
          { variant: 'danger' }
      );
  };

  /**
   * @returns {void}
   */
  // Умные советы
  FinanceApp.prototype._renderSmart = function() {
    var el = this._d.getElementById('smartTips');
    if (!el) return;
    
    var insights = [];
    var self = this;
    
    // Анализ по категориям
    var catSpending = {};
    var catCount = {};
    this.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      var cat = t.category || 'other';
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      catSpending[cat] = (catSpending[cat] || 0) + amount;
      catCount[cat] = (catCount[cat] || 0) + 1;
    });
    
    // 1. Самая затратная категория
    var maxCat = null;
    var maxAmount = 0;
    Object.keys(catSpending).forEach(function(cat) {
      if (catSpending[cat] > maxAmount) {
        maxAmount = catSpending[cat];
        maxCat = cat;
      }
    });
    
    if (maxCat) {
      var catNames = {
        food: { ru: 'еду', en: 'food' },
        transport: { ru: 'транспорт', en: 'transport' },
        entertainment: { ru: 'развлечения', en: 'entertainment' },
        health: { ru: 'здоровье', en: 'health' },
        work: { ru: 'работу', en: 'work' },
        other: { ru: 'прочее', en: 'other' }
      };
      var catName = catNames[maxCat] ? catNames[maxCat][this.lang] : maxCat;
      
      if (this.lang === 'ru') {
        insights.push('Больше всего вы тратите на ' + catName + ' — ' + 
                    this.formatMoney(this.toDisplay(maxAmount)) + 
                    '. Попробуйте установить лимит на эту категорию.');
      } else {
        insights.push('Your biggest expense category is ' + catName + ' — ' + 
                    this.formatMoney(this.toDisplay(maxAmount)) + 
                    '. Try setting a budget limit for it.');
      }
    }
    
    // 2. Анализ частоты транзакций
    var txCount = this.transactions.length;
    if (txCount > 0) {
      var dates = this.transactions.map(function(t) { 
        return new Date(t.date).getTime(); 
      }).sort();
      var daysSpan = (dates[dates.length - 1] - dates[0]) / 86400000;
      var avgPerDay = txCount / Math.max(1, daysSpan);
      
      if (avgPerDay > 3 && this.lang === 'ru') {
        insights.push('Вы совершаете в среднем ' + avgPerDay.toFixed(1) + 
                    ' транзакций в день. Возможно, стоит объединять мелкие покупки?');
      } else if (avgPerDay > 3) {
        insights.push('You average ' + avgPerDay.toFixed(1) + 
                    ' transactions per day. Consider consolidating small purchases.');
      }
    }
    
    // 3. Выходные vs будни (улучшенная версия)
    var weekdaySpend = { count: 0, total: 0 };
    var weekendSpend = { count: 0, total: 0 };
    
    this.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      var dt = new Date(t.date);
      var day = dt.getDay();
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      
      if (day === 0 || day === 6) {
        weekendSpend.count++;
        weekendSpend.total += amount;
      } else {
        weekdaySpend.count++;
        weekdaySpend.total += amount;
      }
    });
    
    if (weekdaySpend.count > 0 && weekendSpend.count > 0) {
      var weekdayAvg = weekdaySpend.total / weekdaySpend.count;
      var weekendAvg = weekendSpend.total / weekendSpend.count;
      var diff = ((weekendAvg - weekdayAvg) / weekdayAvg) * 100;
      
      if (Math.abs(diff) > 20) {
        if (diff > 0 && this.lang === 'ru') {
          insights.push('В выходные вы тратите на ' + Math.round(diff) + 
                      '% больше за одну транзакцию. Планируйте развлечения заранее!');
        } else if (diff > 0) {
          insights.push('You spend ' + Math.round(diff) + 
                      '% more per transaction on weekends. Plan entertainment ahead!');
        } else if (this.lang === 'ru') {
          insights.push('В выходные вы тратите на ' + Math.round(-diff) + 
                      '% меньше. Отличная экономия!');
        } else {
          insights.push('You spend ' + Math.round(-diff) + 
                      '% less on weekends. Great saving habit!');
        }
      }
    }
    
    // 4. Соотношение доходов и расходов
    var totalIncome = 0;
    var totalExpense = 0;
    this.transactions.forEach(function(t) {
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') totalIncome += amount;
      else totalExpense += amount;
    });
    
    if (totalIncome > 0) {
      var savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
      if (savingsRate < 0 && this.lang === 'ru') {
        insights.push('Ваши расходы превышают доходы. Составьте бюджет и сократите необязательные траты.');
      } else if (savingsRate < 0) {
        insights.push('Your expenses exceed income. Create a budget and cut non-essential spending.');
      } else if (savingsRate < 10 && this.lang === 'ru') {
        insights.push('Вы откладываете ' + savingsRate.toFixed(1) + 
                    '% дохода. Попробуйте увеличить до 10-20% для финансовой подушки.');
      } else if (savingsRate < 10) {
        insights.push('You save ' + savingsRate.toFixed(1) + 
                    '% of income. Try increasing to 10-20% for emergency fund.');
      } else if (this.lang === 'ru') {
        insights.push('Отлично! Вы откладываете ' + savingsRate.toFixed(1) + 
                    '% дохода. Продолжайте в том же духе!');
      } else {
        insights.push('Great! You save ' + savingsRate.toFixed(1) + 
                    '% of income. Keep it up!');
      }
    }
    
    // 5. Самая частая транзакция
    var txFrequency = {};
    this.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      var key = t.name.toLowerCase();
      txFrequency[key] = (txFrequency[key] || 0) + 1;
    });
    
    var mostFrequent = null;
    var maxFreq = 0;
    Object.keys(txFrequency).forEach(function(key) {
      if (txFrequency[key] > maxFreq) {
        maxFreq = txFrequency[key];
        mostFrequent = key;
      }
    });
    
    if (maxFreq >= 5) {
      if (this.lang === 'ru') {
        insights.push('"' + mostFrequent + '" — ваша самая частая трата (' + maxFreq + 
                    ' раз). Можно ли оптимизировать эти расходы?');
      } else {
        insights.push('"' + mostFrequent + '" is your most frequent expense (' + maxFreq + 
                    ' times). Can you optimize these costs?');
      }
    }
    
    // 6. Динамика по месяцам
    var monthlySpending = {};
    this.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      var dt = new Date(t.date);
      var monthKey = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + amount;
    });
    
    var months = Object.keys(monthlySpending).sort();
    if (months.length >= 2) {
      var lastMonth = months[months.length - 1];
      var prevMonth = months[months.length - 2];
      var change = ((monthlySpending[lastMonth] - monthlySpending[prevMonth]) / monthlySpending[prevMonth]) * 100;
      
      if (Math.abs(change) > 30) {
        if (change > 0 && this.lang === 'ru') {
          insights.push('В этом месяце расходы выросли на ' + Math.round(change) + 
                      '% по сравнению с прошлым. Проверьте крупные покупки.');
        } else if (change > 0) {
          insights.push('This month spending increased by ' + Math.round(change) + 
                      '% vs last month. Check for large purchases.');
        } else if (this.lang === 'ru') {
          insights.push('Отлично! Расходы снизились на ' + Math.round(-change) + 
                      '% по сравнению с прошлым месяцем.');
        } else {
          insights.push('Great! Spending decreased by ' + Math.round(-change) + 
                      '% compared to last month.');
        }
      }
    }
    
    // 7. Время суток для трат
    var timeSpending = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    this.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      var dt = new Date(t.date);
      var hour = dt.getHours();
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      
      if (hour >= 5 && hour < 12) timeSpending.morning += amount;
      else if (hour >= 12 && hour < 17) timeSpending.afternoon += amount;
      else if (hour >= 17 && hour < 22) timeSpending.evening += amount;
      else timeSpending.night += amount;
    });
    
    var maxTime = null;
    var maxTimeAmount = 0;
    Object.keys(timeSpending).forEach(function(time) {
      if (timeSpending[time] > maxTimeAmount) {
        maxTimeAmount = timeSpending[time];
        maxTime = time;
      }
    });
    
    var timeNames = {
      morning: { ru: 'утром', en: 'in the morning' },
      afternoon: { ru: 'днём', en: 'in the afternoon' },
      evening: { ru: 'вечером', en: 'in the evening' },
      night: { ru: 'ночью', en: 'at night' }
    };
    
    if (maxTime && maxTimeAmount > 0) {
      if (this.lang === 'ru') {
        insights.push('Больше всего денег вы тратите ' + timeNames[maxTime].ru + 
                    '. Возможно, это время импульсивных покупок?');
      } else {
        insights.push('You spend the most money ' + timeNames[maxTime].en + 
                    '. Could this be impulse buying time?');
      }
    }
    
    // Выбираем 2-3 случайных инсайта для разнообразия
    if (insights.length === 0) {
      el.textContent = this.lang === 'ru' 
        ? 'Добавьте больше транзакций, чтобы получить персонализированные советы.'
        : 'Add more transactions to get personalized insights.';
      return;
    }
    
    // Перемешиваем и выбираем до 3 инсайтов
    for (var i = insights.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = insights[i];
      insights[i] = insights[j];
      insights[j] = temp;
    }
    
    var selectedInsights = insights.slice(0, Math.min(3, insights.length));
    el.textContent = selectedInsights.join(' ');
  };

  /**
   * @returns {void}
   */
  // Совет дня
  FinanceApp.prototype._setDailyTip = function() {
    var tips = {
      ru: [
        // Базовые принципы
        "Откладывайте 10% от каждого дохода — это правило 'заплати сначала себе'.",
        "Ведите учёт всех трат, даже мелких. Кофе по 200₽ в день = 6000₽ в месяц.",
        "Правило 50/30/20: 50% на необходимое, 30% на желания, 20% на сбережения.",
        "Создайте финансовую подушку на 3-6 месяцев расходов.",
        "Перед покупкой спросите: 'Это желание или потребность?'",
        "Используйте правило 24 часов для крупных покупок.",
        "Автоматизируйте сбережения — настройте автоперевод в день зарплаты.",
        "Раз в месяц проводите ревизию подписок и отключайте ненужные.",
        "Планируйте меню на неделю — это сокращает спонтанные траты на еду.",
        "Сравнивайте цены перед покупкой, но не тратьте на это часы.",
        
        // Инвестиции и доход
        "Диверсифицируйте источники дохода — не кладите все яйца в одну корзину.",
        "Инвестируйте регулярно, даже небольшие суммы. Время работает на вас.",
        "Изучите сложный процент — это восьмое чудо света по словам Эйнштейна.",
        "Повышайте свою квалификацию — это лучшая инвестиция с доходностью 1000%.",
        "Не храните все сбережения наличными — инфляция съедает 5-10% в год.",
        "Создайте пассивный доход: дивиденды, аренда, авторские отчисления.",
        "Налоговые вычеты — это ваши деньги. Не забывайте их оформлять.",
        "Кэшбэк и бонусные программы — используйте с умом, не покупайте лишнего.",
        
        // Психология денег
        "Не сравнивайте свой финансовый путь с другими — у каждого свой старт.",
        "Визуализируйте финансовые цели — это повышает мотивацию копить.",
        "Отмечайте маленькие победы: закрытый кредит, накопленная сумма.",
        "Деньги — это инструмент свободы, а не самоцель.",
        "Финансовая грамотность — навык, который окупается всю жизнь.",
        "Не пытайтесь 'отыграться' после неудачных трат — начните с чистого листа.",
        
        // Кредиты и долги
        "Сначала закройте долги с высоким процентом (метод лавины).",
        "Кредитная карта — инструмент, а не дополнительные деньги.",
        "Рефинансируйте кредиты, если нашли ставку ниже на 2% и более.",
        "Не берите кредит на то, что дешевеет (техника, машины, отпуск).",
        "Ипотека — исключение из правил, но первый взнос должен быть 20%+.",
        
        // Семейный бюджет
        "Обсуждайте финансы с партнером открыто и без обвинений.",
        "Выделите каждому 'карманные деньги', которые можно тратить без отчета.",
        "Научите детей финансовой грамотности с раннего возраста.",
        "Семейный бюджет — это командная работа, а не соревнование.",
        "Планируйте крупные траты вместе заранее.",
        
        // Лайфхаки
        "Покупайте сезонные продукты — они дешевле и вкуснее.",
        "Готовьте кофе дома — экономия до 5000₽ в месяц.",
        "Используйте общественный транспорт или велосипед вместо такси.",
        "Продавайте ненужные вещи на барахолках — и место освободите, и денег получите.",
        "Пользуйтесь библиотеками вместо покупки книг.",
        "Перед походом в магазин составляйте список и придерживайтесь его.",
        "Не ходите в магазин голодным — купите лишнего.",
        "Используйте кэшбэк-сервисы, но не ради кэшбэка.",
        "Покупайте качественные вещи, которые служат дольше.",
        "Ремонтируйте, а не выбрасывайте — это экономит деньги и природу.",
        
        // Продвинутые стратегии
        "Ведите учет не только расходов, но и времени — это тоже ресурс.",
        "Рассчитайте свой 'час жизни' и сравнивайте с ценой покупок.",
        "Используйте метод 'конвертов' для контроля категорий расходов.",
        "Ставьте конкретные финансовые цели с дедлайном.",
        "Раз в квартал пересматривайте свои финансовые цели.",
        "Создайте отдельный счет для налогов и обязательных платежей.",
        "Не экономьте на здоровье — лечение дороже профилактики.",
        "Инвестируйте в энергоэффективность дома — окупается годами.",
        "Покупайте страховку только от катастрофических рисков.",
        "Учитесь говорить 'нет' импульсивным тратам и навязанным покупкам."
      ],
      en: [
        "Save 10% of every income — pay yourself first.",
        "Track all expenses, even small ones. A daily $5 coffee is $150/month.",
        "Follow the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
        "Build an emergency fund covering 3-6 months of expenses.",
        "Ask yourself before buying: 'Is this a want or a need?'",
        "Use the 24-hour rule for purchases over $100.",
        "Automate your savings — set up automatic transfers on payday.",
        "Review subscriptions monthly and cancel unused ones.",
        "Plan weekly meals — it reduces impulse food spending.",
        "Compound interest is the eighth wonder of the world.",
        "Diversify your income streams — don't put all eggs in one basket.",
        "Invest regularly, even small amounts. Time is on your side.",
        "Compare prices but don't spend hours to save pennies.",
        "Your skills are the best investment — endless ROI.",
        "Don't keep all savings in cash — inflation eats 2-3% yearly.",
        "Cashback is great, but don't buy things just for points.",
        "Pay off high-interest debt first (avalanche method).",
        "Credit cards are tools, not extra money.",
        "Don't compare your financial journey to others.",
        "Visualize your financial goals — it boosts motivation.",
        "Celebrate small wins: paid-off loan, reached savings milestone.",
        "Money is a tool for freedom, not the goal itself.",
        "Financial literacy pays dividends for life.",
        "Discuss finances with your partner openly and without blame.",
        "Give each partner 'fun money' with no questions asked.",
        "Teach kids financial literacy from an early age.",
        "Buy seasonal produce — cheaper and tastier.",
        "Make coffee at home — save hundreds per year.",
        "Use public transport or bike instead of taxis.",
        "Sell unused items — declutter and earn money.",
        "Use libraries instead of buying every book.",
        "Make a shopping list and stick to it.",
        "Never shop hungry — you'll buy more.",
        "Buy quality items that last longer.",
        "Repair instead of replacing — saves money and the planet.",
        "Calculate your 'hourly life rate' and compare to purchases.",
        "Use the envelope method for category budgeting.",
        "Set specific financial goals with deadlines.",
        "Review financial goals quarterly.",
        "Don't skimp on health — prevention is cheaper than cure.",
        "Learn to say 'no' to impulse buys and upsells."
      ]
    };
    
    var arr = tips[this.lang] || tips.ru;
    var today = new Date();
    var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    
    // Используем день года для выбора совета
    var index = dayOfYear % arr.length;
    var el = this._d.getElementById('tipContent');
    if (el) el.textContent = arr[index];
  };

  /**
   * Экспорт в Excel (XLSX)
   */
  FinanceApp.prototype._exportExcel = function() {
    var self = this;
    
    if (typeof XLSX === 'undefined') {
      this._n.toast(
        this.lang === 'ru' ? 'Библиотека Excel не загружена' : 'Excel library not loaded',
        'info'
      );
      return;
    }
    
    var data = [];
    
    // Заголовки
    var headers = this.lang === 'ru' 
      ? ['Дата', 'Тип', 'Категория', 'Название', 'Сумма (' + this.currency + ')']
      : ['Date', 'Type', 'Category', 'Name', 'Amount (' + this.currency + ')'];
    data.push(headers);
    
    // Сортируем транзакции
    var sorted = this.transactions.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    
    sorted.forEach(function(t) {
      var d = new Date(t.date);
      if (isNaN(d.getTime())) {
        if (typeof t.date === 'string') {
          var parts = t.date.split(/[.\-/T]/);
          if (parts.length >= 3) {
            d = new Date(+parts[0], (+parts[1] - 1) || 0, +parts[2] || 1);
          }
        }
        if (isNaN(d.getTime())) {
          d = new Date();
        }
      }
      
      var date = self.lang === 'ru'
        ? String(d.getDate()).padStart(2, '0') + '.' + 
          String(d.getMonth() + 1).padStart(2, '0') + '.' + 
          d.getFullYear()
        : d.getFullYear() + '-' + 
          String(d.getMonth() + 1).padStart(2, '0') + '-' + 
          String(d.getDate()).padStart(2, '0');
      
      var type = t.type === 'income' 
        ? (self.lang === 'ru' ? 'Доход' : 'Income')
        : (self.lang === 'ru' ? 'Расход' : 'Expense');
      
      var catNames = {
        food: self.lang === 'ru' ? 'Еда' : 'Food',
        transport: self.lang === 'ru' ? 'Транспорт' : 'Transport',
        entertainment: self.lang === 'ru' ? 'Развлечения' : 'Entertainment',
        health: self.lang === 'ru' ? 'Здоровье' : 'Health',
        work: self.lang === 'ru' ? 'Работа' : 'Work',
        other: self.lang === 'ru' ? 'Другое' : 'Other'
      };
      
      data.push([
        date,
        type,
        catNames[t.category] || t.category,
        t.name || '',
        self.toDisplay(t.amountUsd != null ? t.amountUsd : t.amount)
      ]);
    });
    
    // Итоги
    var totalIncome = 0, totalExpense = 0;
    this.transactions.forEach(function(t) {
      var amount = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') totalIncome += amount;
      else totalExpense += amount;
    });
    
    data.push([]);
    data.push([
      self.lang === 'ru' ? 'ИТОГО ДОХОДЫ' : 'TOTAL INCOME',
      '', '', '', self.toDisplay(totalIncome)
    ]);
    data.push([
      self.lang === 'ru' ? 'ИТОГО РАСХОДЫ' : 'TOTAL EXPENSES',
      '', '', '', self.toDisplay(totalExpense)
    ]);
    data.push([
      self.lang === 'ru' ? 'БАЛАНС' : 'BALANCE',
      '', '', '', self.toDisplay(totalIncome - totalExpense)
    ]);
    
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 30 },
      { wch: 15 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, self.lang === 'ru' ? 'Транзакции' : 'Transactions');
    
    var today = new Date();
    var filename = 'MoneyTrack_' + 
      today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0') + '.xlsx';
    
    XLSX.writeFile(wb, filename);
    this._s.setJson('hasExported', true);
    this._n.toast(this.t('exportOk'), 'ok');
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._exportJson = function () {
    var self = this;
    var payload = {
      moneyTrackExport: 1,
      exportedAt: new Date().toISOString(),
      app: 'MoneyTrack',
      currencyDisplay: this.currency,
      note:
        'amountUsd — суммы в USD (внутренний учёт). amount — отображаемая сумма в currencyDisplay. Импорт: поддерживается массив или поле transactions.',
      transactions: this.transactions.map(function (t) {
        var d = t.date;
        var iso;
        if (d && typeof d.toISOString === 'function') iso = d.toISOString();
        else {
          var dt = new Date(d);
          iso = isNaN(dt.getTime()) ? Util.toYmd(new Date()) : dt.toISOString();
        }
        return {
          id: t.id,
          name: t.name,
          type: t.type,
          category: t.category,
          amountUsd: t.amountUsd != null ? t.amountUsd : t.amount,
          amount: t.amount,
          date: iso
        };
      })
    };
    this._download('moneytrack.json', JSON.stringify(payload, null, 2), 'application/json');
    this._n.toast(this.t('exportOk'), 'ok');
  };

  /**
   * @param {string} name
   * @param {string} body
   * @param {string} mime
   * @returns {void}
   */
  FinanceApp.prototype._download = function (name, body, mime) {
    var blob = new Blob([body], { type: mime });
    var a = this._d.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /**
   * Разбор суммы при импорте (без лимита 99M как в форме).
   * @param {*} raw
   * @returns {number|null}
   */
  FinanceApp.prototype._parseImportAmount = function (raw) {
    if (raw === '' || raw == null) return null;
    var s = String(raw)
      .replace(/\s/g, '')
      .replace(/\u00a0/g, '')
      .replace(/[^\d.,\-]/g, '') // Удаляем все кроме цифр, точки, запятой и минуса
      .replace(',', '.');
    
    // Обработка отрицательных чисел
    var isNegative = s.indexOf('-') !== -1;
    s = s.replace(/-/g, '');
    
    var n = parseFloat(s);
    if (isNaN(n) || n <= 0) return null;
    if (n > 1e12) return null; // Разумный лимит
    
    return Math.round(n * 100) / 100;
  };

  /**
   * Чтение XLSX/XLS файла
   * @param {File} file
   */
  FinanceApp.prototype._readXlsxFile = function(file) {
    var self = this;
    
    // Проверяем наличие библиотеки XLSX
    if (typeof XLSX === 'undefined') {
      this._n.toast(
        this.lang === 'ru' ? 'Ошибка загрузки библиотеки Excel' : 'Excel library not loaded',
        'err'
      );
      return;
    }
    
    var reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });
        
        // Берем первый лист
        var firstSheetName = workbook.SheetNames[0];
        var firstSheet = workbook.Sheets[firstSheetName];
        var rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (!rows.length) {
          throw new Error('empty');
        }
        
        // Первая строка - заголовки
        var headers = rows[0].map(function(h) {
          return String(h || '').toLowerCase().trim();
        });
        
        // Фильтруем строки с данными (пропускаем итоги)
        self._importRows = [];
        
        for (var i = 1; i < rows.length; i++) {
          var row = rows[i];
          
          // Пропускаем пустые строки
          if (!row || row.length === 0) continue;
          
          // Проверяем первый столбец на наличие слов "итого", "total", "баланс", "balance"
          var firstCell = String(row[0] || '').toLowerCase();
          if (firstCell.indexOf('итого') !== -1 || 
              firstCell.indexOf('total') !== -1 || 
              firstCell.indexOf('баланс') !== -1 || 
              firstCell.indexOf('balance') !== -1) {
            continue;
          }
          
          // Создаем объект строки
          var obj = {};
          var hasData = false;
          
          headers.forEach(function(h, idx) {
            var value = row[idx];
            if (value !== null && value !== undefined) {
              obj[h] = String(value).trim();
              if (obj[h]) hasData = true;
            } else {
              obj[h] = '';
            }
          });
          
          if (hasData) {
            self._importRows.push(obj);
          }
        }
        
        if (self._importRows.length === 0) {
          self._n.toast(
            self.lang === 'ru' ? 'Нет данных для импорта' : 'No data to import',
            'err'
          );
          return;
        }
        
        // Показываем модалку с маппингом колонок
        self._buildImportMapSmart(headers);
        
      } catch (err) {
        console.error('XLSX import error:', err);
        self._n.toast(self.t('importErr'), 'err');
      }
    };
    
    reader.onerror = function() {
      self._n.toast(
        self.lang === 'ru' ? 'Ошибка чтения файла' : 'File read error',
        'err'
      );
    };
    
    reader.readAsArrayBuffer(file);
  };

  // Новый метод для умного маппинга колонок
  FinanceApp.prototype._buildImportMapSmart = function(headers) {
    var d = this._d;
    var body = d.getElementById('importMapBody');
    body.textContent = '';
    
    // Словари для поиска колонок (русские и английские варианты)
    var fieldPatterns = {
      date: ['date', 'дата', 'день', 'day'],
      amount: ['amount', 'сумма', 'цена', 'price', 'стоимость', 'cost', 'amountusd'],
      name: ['name', 'название', 'описание', 'title', 'description', 'текст', 'text'],
      type: ['type', 'тип'],
      category: ['category', 'категория', 'categor']
    };
    
    // Автоматически находим соответствия
    var map = { date: '', amount: '', name: '', type: '', category: '' };
    
    headers.forEach(function(h) {
      var lowerH = h.toLowerCase();
      
      Object.keys(fieldPatterns).forEach(function(field) {
        if (map[field]) return; // уже нашли
        
        var patterns = fieldPatterns[field];
        for (var i = 0; i < patterns.length; i++) {
          if (lowerH.indexOf(patterns[i]) !== -1) {
            map[field] = h;
            break;
          }
        }
      });
    });
    
    // Если не нашли name, пробуем первый текстовый столбец
    if (!map.name && headers.length > 0) {
      map.name = headers[0];
    }
    
    this._importMap = map;
    
    // Создаем интерфейс выбора колонок
    var frag = d.createDocumentFragment();
    var self = this;
    
    var fieldNames = {
      date: this.lang === 'ru' ? 'Дата' : 'Date',
      amount: this.lang === 'ru' ? 'Сумма' : 'Amount',
      name: this.lang === 'ru' ? 'Название' : 'Name',
      type: this.lang === 'ru' ? 'Тип' : 'Type',
      category: this.lang === 'ru' ? 'Категория' : 'Category'
    };
    
    ['date', 'amount', 'name', 'type', 'category'].forEach(function(field) {
      var wrap = d.createElement('div');
      wrap.className = 'mb-3';
      
      var lab = d.createElement('label');
      lab.className = 'text-sm text-[var(--mt-muted)] block mb-1';
      lab.textContent = fieldNames[field] + (field === 'amount' || field === 'date' ? ' *' : '');
      
      var sel = d.createElement('select');
      sel.className = 'w-full min-h-[44px] rounded-lg bg-[var(--mt-surface-2)] border border-slate-600/30 px-3 py-2';
      sel.dataset.field = field;
      
      // Пустая опция
      var o0 = d.createElement('option');
      o0.value = '';
      o0.textContent = '— ' + (self.lang === 'ru' ? 'не выбрано' : 'not selected') + ' —';
      sel.appendChild(o0);
      
      // Колонки из файла
      headers.forEach(function(h) {
        var o = d.createElement('option');
        o.value = h;
        o.textContent = h;
        if (map[field] === h) o.selected = true;
        sel.appendChild(o);
      });
      
      // Если не нашли автоматически, но есть подходящая по имени
      if (!map[field] && field === 'name' && headers.length > 0) {
        sel.value = headers[0];
      }
      
      wrap.appendChild(lab);
      wrap.appendChild(sel);
      frag.appendChild(wrap);
    });
    
    // Добавляем подсказку
    var hint = d.createElement('p');
    hint.className = 'text-xs text-[var(--mt-muted)] mt-2';
    hint.textContent = this.lang === 'ru' 
      ? 'Столбцы "Дата" и "Сумма" обязательны. Тип (доход/расход) определится автоматически по словам.'
      : 'Date and Amount columns are required. Type (income/expense) will be auto-detected.';
    frag.appendChild(hint);
    
    body.appendChild(frag);
    d.getElementById('importModal').classList.add('on');
    this._syncModalState();
  };

  // Улучшенный метод импорта с автоопределением типа
  FinanceApp.prototype._runImport = function() {
    var self = this;
    try {
      var d = this._d;
      var fields = {};
      d.querySelectorAll('#importMapBody select').forEach(function(s) {
        fields[s.dataset.field] = s.value;
      });
      
      // Проверяем обязательные поля
      if (!fields.amount) {
        this._n.toast(
          this.lang === 'ru' ? 'Выберите столбец с суммой' : 'Select amount column', 
          'err'
        );
        return;
      }
      
      if (!this._importRows || !this._importRows.length) {
        this._n.toast(this.t('importNothing'), 'err');
        return;
      }
      
      var m = this.msg();
      var toAdd = [];
      var baseId = Date.now();
      var skipped = 0;
      
      // Словари для определения типа
      var incomeKeywords = {
        ru: ['доход', 'приход', 'зарплата', 'получено', 'income', 'in', '+', 'поступление'],
        en: ['income', 'in', 'revenue', 'earned', '+', 'deposit']
      };
      var expenseKeywords = {
        ru: ['расход', 'трата', 'потрачено', 'expense', 'out', '-', 'списание', 'покупка'],
        en: ['expense', 'out', 'spent', 'cost', '-', 'withdrawal', 'purchase']
      };
      
      self._importRows.forEach(function(row, idx) {
        // Парсим дату
        var dateStr = fields.date ? String(row[fields.date] || '') : '';
        var parsedDate;
        
        if (!dateStr) {
          parsedDate = new Date();
        } else {
          // Пробуем разные форматы дат
          var dateParts = dateStr.split(/[.\-/]/);
          if (dateParts.length === 3) {
            // ДД.ММ.ГГГГ или ГГГГ-ММ-ДД
            if (dateParts[0].length === 4) {
              parsedDate = new Date(+dateParts[0], +dateParts[1] - 1, +dateParts[2]);
            } else {
              parsedDate = new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]);
            }
          } else {
            parsedDate = new Date(dateStr);
          }
        }
        
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date();
        }
        
        // Парсим название
        var nameRaw = fields.name ? String(row[fields.name] || '') : '';
        var name = nameRaw.trim();
        
        // Если название пустое, генерируем
        if (!name) {
          name = (self.lang === 'ru' ? 'Импорт' : 'Import') + ' ' + (idx + 1);
        }
        
        var dn = self._v.validateName(name, m);
        if (!dn.ok) {
          skipped++;
          return;
        }
        
        // Парсим сумму
        var rawAmt = row[fields.amount];
        if (rawAmt === '' || rawAmt == null) {
          skipped++;
          return;
        }
        
        // Очищаем сумму (убираем валюты, пробелы)
        var cleanAmt = String(rawAmt)
          .replace(/[^\d.,\-]/g, '')
          .replace(',', '.');
        
        var da = self._v.validateAmount(cleanAmt, m);
        if (!da.ok) {
          skipped++;
          return;
        }
        
        var amount = Math.abs(da.value);
        
        // Определяем тип транзакции
        var type = 'expense'; // по умолчанию
        
        // 1. Пробуем определить по колонке type
        if (fields.type) {
          var typeStr = String(row[fields.type] || '').toLowerCase();
          var keywords = self.lang === 'ru' ? incomeKeywords.ru : incomeKeywords.en;
          
          var isIncome = keywords.some(function(kw) {
            return typeStr.indexOf(kw) !== -1;
          });
          
          if (isIncome) {
            type = 'income';
          } else {
            var expKeywords = self.lang === 'ru' ? expenseKeywords.ru : expenseKeywords.en;
            var isExpense = expKeywords.some(function(kw) {
              return typeStr.indexOf(kw) !== -1;
            });
            if (isExpense) type = 'expense';
          }
        }
        
        // 2. Если не определили по type, смотрим на знак суммы
        if (!fields.type && String(rawAmt).indexOf('-') !== -1) {
          type = 'expense';
        } else if (!fields.type && String(rawAmt).indexOf('+') !== -1) {
          type = 'income';
        }
        
        // 3. Пробуем определить по названию категории
        var category = 'other';
        if (fields.category) {
          var catStr = String(row[fields.category] || '').toLowerCase();
          
          var catMap = {
            food: ['еда', 'food', 'продукты', 'кафе', 'ресторан', 'groceries', 'restaurant'],
            transport: ['транспорт', 'transport', 'такси', 'метро', 'бензин', 'taxi', 'fuel', 'gas'],
            entertainment: ['развлечения', 'entertainment', 'кино', 'театр', 'movie', 'fun'],
            health: ['здоровье', 'health', 'аптека', 'врач', 'pharmacy', 'doctor', 'medical'],
            work: ['работа', 'work', 'зарплата', 'salary', 'офис', 'office'],
            other: ['другое', 'other', 'прочее', 'misc']
          };
          
          Object.keys(catMap).forEach(function(cat) {
            var found = catMap[cat].some(function(kw) {
              return catStr.indexOf(kw) !== -1;
            });
            if (found) category = cat;
          });
        }
        
        // Создаем транзакцию
        var usd = self.toUsd(amount);
        
        toAdd.push({
          id: baseId + idx,
          name: self._v.sanitizeName(name),
          amount: amount,
          amountUsd: usd,
          category: category,
          type: type,
          date: parsedDate
        });
      });
      
      if (!toAdd.length) {
        var msg = self.lang === 'ru' 
          ? 'Не удалось импортировать строки. Проверьте формат данных.'
          : 'Could not import rows. Check data format.';
        self._n.toast(msg, 'err');
        return;
      }
      
      // Показываем предупреждение о пропущенных строках
      if (skipped > 0) {
        var warnMsg = self.lang === 'ru'
          ? 'Пропущено строк: ' + skipped
          : 'Skipped rows: ' + skipped;
        self._n.toast(warnMsg, 'info', 3000);
      }
      
      // Добавляем транзакции
      self._u.pushSnapshot(self.transactions);
      toAdd.forEach(function(tx) {
        self.transactions.unshift(tx);
      });
      
      this._persistTx();
      self._s.setJson('hasImported', true);
      
      d.getElementById('importModal').classList.remove('on');
      this._syncModalState();
      this.render();
      
      var okMsg = self.lang === 'ru'
        ? 'Импортировано: ' + toAdd.length
        : 'Imported: ' + toAdd.length;
      this._n.toast(okMsg, 'ok');
      
    } catch (e) {
      this._n.toast(this.t('importErr'), 'err');
    }
  };

  /**
   * @param {string[]} headers
   * @returns {void}
   */
  FinanceApp.prototype._buildImportMap = function (headers) {
    var d = this._d;
    var body = d.getElementById('importMapBody');
    body.textContent = '';
    var map = { date: '', amount: '', name: '', type: '', category: '' };
    headers.forEach(function (h) {
      if (h.indexOf('date') !== -1) map.date = h;
      if (h.indexOf('amount') !== -1) map.amount = h;
      if (h.indexOf('name') !== -1 || h.indexOf('title') !== -1) map.name = h;
      if (h.indexOf('type') !== -1) map.type = h;
      if (h.indexOf('categor') !== -1) map.category = h;
    });
    this._importMap = map;
    var frag = d.createDocumentFragment();
    var self = this;
    ['date', 'amount', 'name', 'type', 'category'].forEach(function (field) {
      var wrap = d.createElement('div');
      var lab = d.createElement('label');
      lab.className = 'text-sm text-[var(--mt-muted)] block mb-1';
      lab.textContent = field;
      var sel = d.createElement('select');
      sel.className = 'w-full rounded-lg bg-[var(--mt-surface-2)] border border-slate-600/30 px-2 py-2';
      sel.dataset.field = field;
      var o0 = d.createElement('option');
      o0.value = '';
      o0.textContent = '—';
      sel.appendChild(o0);
      headers.forEach(function (h) {
        var o = d.createElement('option');
        o.value = h;
        o.textContent = h;
        if (map[field] === h) o.selected = true;
        sel.appendChild(o);
      });
      wrap.appendChild(lab);
      wrap.appendChild(sel);
      frag.appendChild(wrap);
    });
    body.appendChild(frag);
    d.getElementById('importModal').classList.add('on');
    this._syncModalState();
  };


  /**
   * @returns {void}
   */
  FinanceApp.prototype._syncCatFlowTabs = function () {
    var self = this;
    this._d.querySelectorAll('.cat-flow-tab').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-cat-flow') === self.catFlowType);
    });
  };

  /**
   * Чистый баланс за текущую календарную неделю (пн–сегодня).
   * @returns {number} USD
   */
  FinanceApp.prototype._weekNetUsd = function () {
    var r = this._periodRange('week');
    var inc = 0;
    var exp = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt < r.a || dt > r.b) return;
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') inc += u;
      else exp += u;
    });
    return inc - exp;
  };

  /**
   * @returns {Array<{id:string,icon:string,label:string,desc:string,ok:boolean}>}
   */
  FinanceApp.prototype._achievementDefs = function () {
    var n = this.transactions.length;
    var g = this.goals.length;
    var bal = this.computeBalance();
    var netOk = bal.totalUsd > 0;
    var visits = this._visitDaysLast7Count();
    var cStreak = this._consecutiveVisitStreak();
    var hasExp = this._s.getJson('hasExported', false);
    var hasImp = this._s.getJson('hasImported', false);
    var catsUsed = {};
    this.transactions.forEach(function (t) {
      catsUsed[t.category || 'other'] = true;
    });
    var allCat = true;
    Object.keys(CAT).forEach(function (k) {
      if (!catsUsed[k]) allCat = false;
    });
    var txDays = this._uniqueTransactionDays();
    var weekNet = this._weekNetUsd();
    var unlocked = Array.isArray(this._achUnlockedIds) ? this._achUnlockedIds : [];
    return [
      { id: 'first', icon: 'fa-seedling', label: 'achFirstTx', desc: 'achFirstTxDesc', ok: n >= 1 || unlocked.indexOf('first') !== -1 },
      { id: 'ten', icon: 'fa-list-ol', label: 'achTenTx', desc: 'achTenTxDesc', ok: n >= 10 || unlocked.indexOf('ten') !== -1 },
      { id: 'fifty', icon: 'fa-coins', label: 'achFiftyTx', desc: 'achFiftyTxDesc', ok: n >= 50 || unlocked.indexOf('fifty') !== -1 },
      { id: 'hundred', icon: 'fa-award', label: 'achHundredTx', desc: 'achHundredTxDesc', ok: n >= 100 || unlocked.indexOf('hundred') !== -1 },
      { id: 'goal', icon: 'fa-bullseye', label: 'achGoal', desc: 'achGoalDesc', ok: g >= 1 || unlocked.indexOf('goal') !== -1 },
      { id: 'goals3', icon: 'fa-flag', label: 'achGoalsThree', desc: 'achGoalsThreeDesc', ok: g >= 3 || unlocked.indexOf('goals3') !== -1 },
      { id: 'saver', icon: 'fa-piggy-bank', label: 'achSaver', desc: 'achSaverDesc', ok: netOk || unlocked.indexOf('saver') !== -1 },
      { id: 'weekplus', icon: 'fa-calendar-week', label: 'achWeekPlus', desc: 'achWeekPlusDesc', ok: weekNet > 0 || unlocked.indexOf('weekplus') !== -1 },
      { id: 'streak3', icon: 'fa-fire', label: 'achStreak', desc: 'achStreakDesc', ok: visits >= 3 || unlocked.indexOf('streak3') !== -1 },
      { id: 'streak7', icon: 'fa-calendar-check', label: 'achStreak7', desc: 'achStreak7Desc', ok: cStreak >= 7 || unlocked.indexOf('streak7') !== -1 },
      { id: 'txdays', icon: 'fa-calendar-days', label: 'achTxDays', desc: 'achTxDaysDesc', ok: txDays >= 14 || unlocked.indexOf('txdays') !== -1 },
      { id: 'allcat', icon: 'fa-sitemap', label: 'achAllCat', desc: 'achAllCatDesc', ok: allCat || unlocked.indexOf('allcat') !== -1 },
      { id: 'export', icon: 'fa-download', label: 'achExport', desc: 'achExportDesc', ok: hasExp || unlocked.indexOf('export') !== -1 },
      { id: 'import', icon: 'fa-upload', label: 'achImport', desc: 'achImportDesc', ok: hasImp || unlocked.indexOf('import') !== -1 }
    ];
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderAchievements = function () {
    var host = this._d.getElementById('achievementsGrid');
    if (!host) return;
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    if (!pack) return;
    var defs = this._achievementDefs();
    var self = this;
    host.textContent = '';
    var frag = this._d.createDocumentFragment();
    defs.forEach(function (d) {
      var card = self._d.createElement('button');
      card.type = 'button';
      card.className =
        'mt-ach-badge text-left' + (d.ok ? '' : ' mt-ach-badge--locked');
      card.setAttribute('data-ach-id', d.id);
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        card.setAttribute('title', pack[d.desc] || '');
      }
      card.setAttribute('aria-label', (pack[d.label] || '') + '. ' + (pack[d.desc] || ''));
      var ic = self._d.createElement('div');
      ic.className = 'text-2xl ' + (d.ok ? 'text-emerald-400' : 'opacity-40 grayscale');
      var icn = self._d.createElement('i');
      icn.className = 'fas ' + d.icon;
      icn.setAttribute('aria-hidden', 'true');
      ic.appendChild(icn);
      var lb = self._d.createElement('div');
      lb.className = 'text-xs font-medium text-[var(--mt-text)] leading-snug';
      lb.textContent = pack[d.label] || '';
      var hint = self._d.createElement('p');
      hint.className = 'mt-ach-hint hidden text-[11px] leading-snug text-[var(--mt-muted)]';
      hint.textContent = pack[d.desc] || '';
      card.appendChild(ic);
      card.appendChild(lb);
      card.appendChild(hint);
      card.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var on = card.classList.toggle('mt-ach-badge--open');
        hint.classList.toggle('hidden', !on);
      });
      frag.appendChild(card);
    });
    host.appendChild(frag);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._checkNewAchievementsToast = function () {
    var self = this;
    var defs = this._achievementDefs();
    var unlocked = defs.filter(function (d) {
      return d.ok;
    });
    var ids = unlocked.map(function (d) {
      return d.id;
    });
    this._achUnlockedIds = ids.slice();
    this._s.setJson('achUnlockedIds', this._achUnlockedIds);
    if (!this._s.getJson('achToastSeeded', false)) {
      this._s.setJson('achNotifiedIds', ids);
      this._s.setJson('achToastSeeded', true);
      return;
    }
    var prev = this._s.getJson('achNotifiedIds', []);
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    var toastTpl = (pack && pack.achUnlockedToast) || self.t('achToast');
    unlocked.forEach(function (d) {
      if (prev.indexOf(d.id) !== -1) return;
      var name = pack && pack[d.label] ? pack[d.label] : d.id;
      self._n.toast(toastTpl.replace(/\{name\}/g, name), 'ok', 4200);
      prev.push(d.id);
    });
    this._s.setJson('achNotifiedIds', prev);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._renderProfileEngagementStats = function () {
    var self = this;
    var el = this._d.getElementById('profileEngagementStats');
    if (!el) return;
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[this.lang];
    if (!pack) return;
    var streak = this._consecutiveVisitStreak();
    var txDays = this._uniqueTransactionDays();
    var n = this.transactions.length;
    var netWeek = this._weekNetUsd();
    var totInc = 0;
    var totExp = 0;
    this.transactions.forEach(function (t) {
      var u = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') totInc += u;
      else totExp += u;
    });
    var totNet = totInc - totExp;
    var r30 = this._periodRange('month');
    var inc30 = 0;
    var exp30 = 0;
    this.transactions.forEach(function (t) {
      var dt = new Date(t.date);
      if (dt < r30.a || dt > r30.b) return;
      var u2 = t.amountUsd != null ? t.amountUsd : t.amount;
      if (t.type === 'income') inc30 += u2;
      else exp30 += u2;
    });
    var net30 = inc30 - exp30;
    el.innerHTML = '';
    var hero = this._d.createElement('div');
    hero.className =
      'mb-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-[var(--mt-surface)] to-[var(--mt-surface)] p-3';
    var h1 = this._d.createElement('div');
    h1.className = 'text-xs uppercase tracking-wide text-[var(--mt-muted)]';
    h1.textContent = (pack.profileImpactTitle || (this.lang === 'ru' ? 'Ваш прогресс' : 'Your progress'));
    var h2 = this._d.createElement('div');
    h2.className = 'mt-1 text-sm text-[var(--mt-text)] leading-relaxed';
    h2.textContent =
      (this.lang === 'ru'
        ? 'За текущий месяц чистый результат: '
        : 'This month net result: ') +
      self.formatMoney(self.toDisplay(net30));
    hero.appendChild(h1);
    hero.appendChild(h2);
    el.appendChild(hero);
    var grid = this._d.createElement('div');
    grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
    function cell(label, val) {
      var wrap = self._d.createElement('div');
      wrap.className =
        'rounded-xl border border-slate-600/15 bg-gradient-to-br from-[var(--mt-surface-2)]/70 via-[var(--mt-surface)] to-[var(--mt-surface)] p-3 shadow-sm';
      var la = self._d.createElement('div');
      la.className = 'text-[11px] uppercase tracking-wide text-[var(--mt-muted)]';
      la.textContent = label;
      var va = self._d.createElement('div');
      va.className = 'mt-1 text-base font-semibold tabular-nums text-emerald-400';
      va.textContent = val;
      wrap.appendChild(la);
      wrap.appendChild(va);
      return wrap;
    }
    grid.appendChild(cell(pack.statStreakDays, String(streak)));
    grid.appendChild(cell(pack.statTxDays, String(txDays)));
    grid.appendChild(cell(pack.statTotalTx, String(n)));
    var wk = self._d.createElement('div');
    wk.className =
      'rounded-xl border border-slate-600/15 bg-gradient-to-br from-[var(--mt-surface-2)]/70 via-[var(--mt-surface)] to-[var(--mt-surface)] p-3 shadow-sm';
    var wkl = self._d.createElement('div');
    wkl.className = 'text-[11px] uppercase tracking-wide text-[var(--mt-muted)]';
    wkl.textContent = pack.statWeekNet;
    var wkv = self._d.createElement('div');
    wkv.className =
      'mt-1 text-base font-semibold tabular-nums ' +
      (netWeek >= 0 ? 'text-emerald-400' : 'text-red-400');
    wkv.textContent = self.formatMoney(self.toDisplay(netWeek));
    wk.appendChild(wkl);
    wk.appendChild(wkv);
    grid.appendChild(wk);
    grid.appendChild(cell((this.lang === 'ru' ? 'Доходов всего' : 'Total income'), self.formatMoney(self.toDisplay(totInc))));
    grid.appendChild(cell((this.lang === 'ru' ? 'Расходов всего' : 'Total expenses'), self.formatMoney(self.toDisplay(totExp))));
    var netWrap = self._d.createElement('div');
    netWrap.className =
      'rounded-xl border border-slate-600/15 bg-gradient-to-br from-[var(--mt-surface-2)]/70 via-[var(--mt-surface)] to-[var(--mt-surface)] p-3 shadow-sm';
    var netLa = self._d.createElement('div');
    netLa.className = 'text-[11px] uppercase tracking-wide text-[var(--mt-muted)]';
    netLa.textContent = this.lang === 'ru' ? 'Итог' : 'Net';
    var netVa = self._d.createElement('div');
    netVa.className =
      'mt-1 text-base font-semibold tabular-nums ' +
      (totNet >= 0 ? 'text-emerald-400' : 'text-red-400');
    netVa.textContent = self.formatMoney(self.toDisplay(totNet));
    netWrap.appendChild(netLa);
    netWrap.appendChild(netVa);
    grid.appendChild(netWrap);
    el.appendChild(grid);
  };

  /**
   * Подряд дней с отметкой визита (с сегодня назад).
   * @returns {number}
   */
  FinanceApp.prototype._consecutiveVisitStreak = function () {
    var arr = this._s.getJson('visitDays', []);
    var set = {};
    arr.forEach(function (d) {
      set[String(d)] = true;
    });
    var streak = 0;
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = 0; i < 400; i++) {
      var ymd = Util.toYmd(d);
      if (set[ymd]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  };

  /**
   * Сколько разных календарных дней есть хотя бы одна транзакция.
   * @returns {number}
   */
  FinanceApp.prototype._uniqueTransactionDays = function () {
    var set = {};
    this.transactions.forEach(function (t) {
      set[Util.toYmd(new Date(t.date))] = true;
    });
    return Object.keys(set).length;
  };

  /**
   * Уникальные дни открытия приложения за последние 7 календарных дней.
   * @returns {number}
   */
  FinanceApp.prototype._visitDaysLast7Count = function () {
    var arr = this._s.getJson('visitDays', []);
    var cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 6);
    var set = {};
    arr.forEach(function (d) {
      var dt = new Date(String(d) + 'T12:00:00');
      if (!isNaN(dt.getTime()) && dt >= cutoff) set[String(d)] = true;
    });
    return Object.keys(set).length;
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._recordVisitDay = function () {
    var arr = this._s.getJson('visitDays', []);
    var t = Util.toYmd(new Date());
    if (arr.indexOf(t) === -1) arr.push(t);
    arr.sort();
    while (arr.length > 90) arr.shift();
    this._s.setJson('visitDays', arr);
  };

  /**
   * @returns {void}
   */
  FinanceApp.prototype._initWelcomeBanner = function () {
    var wb = this._d.getElementById('welcomeBanner');
    if (!wb) return;
    if (this._s.getJson('welcomeDismissed', false)) {
      wb.classList.add('hidden', 'mt-welcome--dismissed');
      wb.setAttribute('aria-hidden', 'true');
    } else {
      wb.classList.remove('hidden', 'mt-welcome--dismissed');
      wb.setAttribute('aria-hidden', 'false');
    }
  };

  /**
   * Разбор суммы при импорте (без лимита 99M как в форме).
   * @param {*} raw
   * @returns {number|null}
   */
  FinanceApp.prototype._parseImportAmount = function (raw) {
    if (raw === '' || raw == null) return null;
    var s = String(raw).replace(/\s/g, '').replace(/\u00a0/g, '').replace(',', '.');
    var n = typeof raw === 'number' ? raw : parseFloat(s);
    if (Number.isNaN(n) || n <= 0) return null;
    if (n > 1e18) return null;
    return Math.round(n * 100) / 100;
  };

  FinanceApp.prototype._readJsonFile = function (file) {
    var self = this;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(Util.stripBom(String(reader.result || '')));
        var arr = Array.isArray(parsed)
          ? parsed
          : parsed && Array.isArray(parsed.transactions)
            ? parsed.transactions
            : null;
        if (!Array.isArray(arr)) throw new Error('bad');
        var m = self.msg();
        var toAdd = [];
        var baseId = Date.now();
        arr.forEach(function (row, idx) {
          if (!row || typeof row !== 'object') return;
          var name = String(row.name != null ? row.name : '').trim() || 'Import';
          var dn = self._v.validateName(name, m);
          if (!dn.ok) return;
          var type = String(row.type || 'expense').toLowerCase();
          if (type !== 'income' && type !== 'expense') type = 'expense';
          var cat = String(row.category || 'other').toLowerCase();
          if (!CAT[cat]) cat = 'other';
          var usd;
          var displayAmt;
          if (row.amountUsd != null && !isNaN(Number(row.amountUsd))) {
            usd = self._parseImportAmount(row.amountUsd);
            if (usd == null) return;
            displayAmt = self.toDisplay(usd);
          } else {
            var rawAmt = row.amount;
            if (rawAmt === '' || rawAmt == null) return;
            var da = self._parseImportAmount(rawAmt);
            if (da == null) return;
            displayAmt = da;
            usd = self.toUsd(da);
          }
          var dv = row.date;
          var parsedDate;
          if (dv == null || dv === '') {
            parsedDate = Util.parseYmd(Util.toYmd(new Date()));
          } else if (typeof dv === 'string' && dv.indexOf('T') !== -1) {
            parsedDate = new Date(dv);
          } else if (typeof dv === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dv)) {
            parsedDate = Util.parseYmd(dv.slice(0, 10));
          } else if (typeof dv === 'string') {
            parsedDate = Util.parseYmd(dv);
          } else {
            parsedDate = new Date(dv);
          }
          if (isNaN(parsedDate.getTime())) parsedDate = Util.parseYmd(Util.toYmd(new Date()));
          toAdd.push({
            id: baseId + idx,
            name: self._v.sanitizeName(name.trim()),
            amount: displayAmt,
            amountUsd: usd,
            category: cat,
            type: type,
            date: parsedDate
          });
        });
        if (!toAdd.length) {
          self._n.toast(self.t('importJsonNothing'), 'err');
          return;
        }
        self._u.pushSnapshot(self.transactions);
        toAdd.forEach(function (tx) {
          self.transactions.unshift(tx);
        });
        self._persistTx();
        self._s.setJson('hasImported', true);
        self.render();
        self._n.toast(self.t('importJsonOk'), 'ok');
      } catch (e) {
        self._n.toast(self.t('importJsonErr'), 'err');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  MT.FinanceApp = FinanceApp;
})(typeof window !== 'undefined' ? window : globalThis);
