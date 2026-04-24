/**
 * @file Ленивая загрузка Chart.js 3, обновление без пересоздания.
 */
(function (G) {
  'use strict';

  var CJS = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';

  /** Фиксированный цвет сегмента по ключу категории (не по индексу в списке). */
  var MT_CAT_COLOR = {
    food: '#22c55e',
    transport: '#3b82f6',
    entertainment: '#f59e0b',
    health: '#f87171',
    work: '#a855f7',
    other: '#64748b'
  };

  /**
   * @class
   */
  function ChartService() {
    this._app = null;
    this._p = null;
    this.balanceChart = null;
    this.ieChart = null;
    this.catChart = null;
    this._kb = '';
    this._kie = '';
    this._kc = '';
    this._resizeWired = false;
  }

  /**
   * @param {*} app FinanceApp
   */
  ChartService.prototype.setApp = function (app) {
    this._app = app;
  };

  /**
   * @param {string} src
   * @returns {Promise<void>}
   */
  ChartService.prototype._script = function (src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-mt="' + src + '"]')) {
        res();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-mt', src);
      s.onload = function () {
        res();
      };
      s.onerror = function () {
        rej(new Error('load ' + src));
      };
      document.head.appendChild(s);
    });
  };

  /**
   * @returns {Promise<void>}
   */
  ChartService.prototype.loadLib = function () {
    var self = this;
    if (this._p) return this._p;
    this._p = this._script(CJS).then(function () {
      if (self._resizeWired || typeof window === 'undefined') return;
      self._resizeWired = true;
      var t = null;
      window.addEventListener(
        'resize',
        function () {
          clearTimeout(t);
          t = setTimeout(function () {
            try {
              if (self.balanceChart) self.balanceChart.resize();
              if (self.ieChart) self.ieChart.resize();
              if (self.catChart) self.catChart.resize();
            } catch (e) {}
          }, 100);
        },
        { passive: true }
      );
    });
    return this._p;
  };

  /**
   * @param {HTMLElement} el
   * @param {function(): void} fn
   */
  ChartService.prototype.whenVisible = function (el, fn) {
    if (!el || !('IntersectionObserver' in window)) {
      fn();
      return;
    }
    var o = new IntersectionObserver(
      function (ents) {
        ents.forEach(function (e) {
          if (e.isIntersecting) {
            o.disconnect();
            fn();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.02 }
    );
    o.observe(el);
  };

  /**
   * @returns {object}
   */
  ChartService.prototype._colors = function () {
    return this._app.getChartColors();
  };

  /**
   * @returns {void}
   */
  ChartService.prototype.refreshBalance = function () {
    var app = this._app;
    var Chart = typeof window !== 'undefined' ? window.Chart : G.Chart;
    if (!Chart || !app) return;
    var c = document.getElementById('balanceChart');
    if (!c) return;
    var key = app.fingerprintBalanceChart();
    if (this.balanceChart && key === this._kb) return;
    this._kb = key;
    var days = [];
    var data = [];
    var now = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(
        String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0')
      );
      var end = new Date(d);
      end.setHours(23, 59, 59, 999);
      var txs = app.transactions.filter(function (t) {
        return new Date(t.date) <= end;
      });
      var inc = txs
        .filter(function (t) {
          return t.type === 'income';
        })
        .reduce(function (s, t) {
          var u = t.amountUsd != null ? t.amountUsd : t.amount;
          return s + u;
        }, 0);
      var exp = txs
        .filter(function (t) {
          return t.type === 'expense';
        })
        .reduce(function (s, t) {
          var u = t.amountUsd != null ? t.amountUsd : t.amount;
          return s + u;
        }, 0);
      data.push(app.toDisplay(inc - exp));
    }
    var col = this._colors();
    if (!this.balanceChart) {
      this.balanceChart = new Chart(c.getContext('2d'), {
        type: 'line',
        data: {
          labels: days,
          datasets: [
            {
              label: app.t('chartBalanceLabel'),
              data: data,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16,185,129,0.12)',
              fill: true,
              tension: 0.35,
              borderWidth: 2
            }
          ]
        },
        options: this._lineOpts(col)
      });
    } else {
      this.balanceChart.data.labels = days;
      this.balanceChart.data.datasets[0].data = data;
      this.balanceChart.data.datasets[0].label = app.t('chartBalanceLabel');
      this._applyLineTheme(this.balanceChart, col);
      this.balanceChart.update('none');
    }
  };

  /**
   * @returns {void}
   */
  ChartService.prototype.refreshIncomeExpense = function () {
    var app = this._app;
    var Chart = typeof window !== 'undefined' ? window.Chart : G.Chart;
    if (!Chart || !app) return;
    var c = document.getElementById('incomeExpenseChart');
    if (!c) return;
    var pack = app.packIncomeExpense();
    if (this.ieChart && pack.key === this._kie) return;
    this._kie = pack.key;
    var col = this._colors();
    var maxVal = 0;
    for (var i = 0; i < pack.inc.length; i++) maxVal = Math.max(maxVal, +pack.inc[i] || 0);
    for (var j = 0; j < pack.exp.length; j++) maxVal = Math.max(maxVal, +pack.exp[j] || 0);
    if (typeof Chart.getChart === 'function') {
      var orphan = Chart.getChart(c);
      if (orphan) {
        try {
          orphan.destroy();
        } catch (e) {}
        if (this.ieChart === orphan) this.ieChart = null;
      }
    }
    if (!this.ieChart) {
      this.ieChart = new Chart(c.getContext('2d'), {
        type: 'bar',
        data: {
          labels: pack.labels,
          datasets: [
            {
              label: app.t('statsIncome'),
              data: pack.inc,
              backgroundColor: 'rgba(16,185,129,0.55)',
              borderColor: '#10B981',
              borderWidth: 2
            },
            {
              label: app.t('statsExpense'),
              data: pack.exp,
              backgroundColor: 'rgba(239,68,68,0.55)',
              borderColor: '#EF4444',
              borderWidth: 2
            }
          ]
        },
        options: this._barOpts(col)
      });
    } else {
      this.ieChart.data.labels = pack.labels;
      this.ieChart.data.datasets[0].data = pack.inc;
      this.ieChart.data.datasets[1].data = pack.exp;
      this.ieChart.data.datasets[0].label = app.t('statsIncome');
      this.ieChart.data.datasets[1].label = app.t('statsExpense');
      this._applyBarTheme(this.ieChart, col);
      this.ieChart.update('none');
    }
    this._tuneBarYAxis(this.ieChart, maxVal);
    this._renderIeLegend(app);
  };

  /**
   * Делает шкалу Y более информативной при маленьких числах.
   * @param {import('chart.js').Chart} ch
   * @param {number} maxVal
   */
  ChartService.prototype._tuneBarYAxis = function (ch, maxVal) {
    if (!ch || !ch.options || !ch.options.scales || !ch.options.scales.y) return;
    var y = ch.options.scales.y;
    if (!y.ticks) y.ticks = {};
    y.ticks.maxTicksLimit = maxVal > 0 && maxVal < 50 ? 10 : maxVal < 200 ? 9 : 7;
    y.grace = '8%';
    y.suggestedMax = maxVal > 0 ? maxVal * 1.12 : undefined;
    try {
      ch.update('none');
    } catch (e) {}
  };

  /**
   * Кастомная легенда под графиком (не влияет на лэйаут).
   * @param {*} app
   */
  ChartService.prototype._renderIeLegend = function (app) {
    var el = document.getElementById('incomeExpenseLegend');
    if (!el) return;
    var pack = window.MoneyTrackI18N && window.MoneyTrackI18N[app.lang];
    var inc = app.t('statsIncome');
    var exp = app.t('statsExpense');
    if (pack) {
      if (pack.statsIncome) inc = pack.statsIncome;
      if (pack.statsExpense) exp = pack.statsExpense;
    }
    el.innerHTML =
      '<span class="mt-leg-item"><span class="mt-leg-dot" style="background:#10B981"></span>' +
      String(inc) +
      '</span>' +
      '<span class="mt-leg-item"><span class="mt-leg-dot" style="background:#EF4444"></span>' +
      String(exp) +
      '</span>';
  };

  /**
   * @returns {void}
   */
  ChartService.prototype.refreshCategory = function () {
    var app = this._app;
    var Chart = typeof window !== 'undefined' ? window.Chart : G.Chart;
    if (!Chart || !app) return;
    var c = document.getElementById('categoryChart');
    if (!c) return;
    var pack = app.packCategoryDoughnut();
    if (this.catChart && pack.key === this._kc) return;
    this._kc = pack.key;
    var col = this._colors();
    var catKeys = pack.categoryKeys || [];
    var colors = catKeys.map(function (key) {
      return MT_CAT_COLOR[key] || '#94a3b8';
    });
    if (!this.catChart) {
      this.catChart = new Chart(c.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: pack.labels,
          datasets: [
            {
              data: pack.data,
              backgroundColor: colors,
              borderColor: col.isDark ? '#1e293b' : '#fff',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: { legend: { labels: { color: col.muted } } }
        }
      });
    } else {
      this.catChart.data.labels = pack.labels.slice();
      this.catChart.data.datasets[0].data = pack.data.slice();
      this.catChart.data.datasets[0].backgroundColor = colors;
      this.catChart.data.datasets[0].borderColor = col.isDark ? '#1e293b' : '#fff';
      this.catChart.options.plugins.legend.labels.color = col.muted;
      this.catChart.update('none');
    }
  };

  /**
   * Тема без пересоздания canvas.
   */
  ChartService.prototype.applyTheme = function () {
    var col = this._colors();
    if (this.balanceChart) {
      this._applyLineTheme(this.balanceChart, col);
      this.balanceChart.update('none');
    }
    if (this.ieChart) {
      this._applyBarTheme(this.ieChart, col);
      this.ieChart.update('none');
    }
    if (this.catChart) {
      this.catChart.options.plugins.legend.labels.color = col.muted;
      this.catChart.update('none');
    }
  };

  /**
   * Сброс ключей при смене языка.
   */
  ChartService.prototype.invalidate = function () {
    this._kb = this._kie = this._kc = '';
  };

  /**
   * @param {object} col
   * @returns {object}
   */
  ChartService.prototype._lineOpts = function (col) {
    var app = this._app;
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: col.tooltipBg,
          titleColor: col.text,
          bodyColor: col.muted
        }
      },
      scales: {
        x: { ticks: { color: col.muted }, grid: { color: col.grid } },
        y: {
          ticks: {
            color: col.muted,
            maxTicksLimit: 8,
            callback: function (v) {
              return app.formatMoney(v);
            }
          },
          grid: { color: col.grid }
        }
      }
    };
  };

  /**
   * @param {import('chart.js').Chart} ch
   * @param {object} col
   */
  ChartService.prototype._applyLineTheme = function (ch, col) {
    ch.options.plugins.tooltip.backgroundColor = col.tooltipBg;
    ch.options.plugins.tooltip.titleColor = col.text;
    ch.options.plugins.tooltip.bodyColor = col.muted;
    ch.options.scales.x.ticks.color = col.muted;
    ch.options.scales.y.ticks.color = col.muted;
    if (!ch.options.scales.y.ticks.maxTicksLimit) ch.options.scales.y.ticks.maxTicksLimit = 8;
    ch.options.scales.x.grid.color = col.grid;
    ch.options.scales.y.grid.color = col.grid;
  };

  /**
   * @param {object} col
   * @returns {object}
   */
  ChartService.prototype._barOpts = function (col) {
    var app = this._app;
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 26, left: 10, right: 10, top: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: col.tooltipBg,
          titleColor: col.text,
          bodyColor: col.muted
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: { color: col.muted, maxRotation: 45, minRotation: 0 },
          grid: { color: col.grid, drawBorder: false }
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grace: '5%',
          ticks: {
            color: col.muted,
            maxTicksLimit: 7,
            padding: 6,
            callback: function (v) {
              return typeof app.formatMoneyAxis === 'function' ? app.formatMoneyAxis(v) : app.formatMoney(v);
            }
          },
          grid: { color: col.grid, drawBorder: false }
        }
      }
    };
  };

  /**
   * @param {import('chart.js').Chart} ch
   * @param {object} col
   */
  ChartService.prototype._applyBarTheme = function (ch, col) {
    if (ch.options.plugins && ch.options.plugins.legend) ch.options.plugins.legend.display = false;
    ch.options.plugins.tooltip.backgroundColor = col.tooltipBg;
    ch.options.plugins.tooltip.titleColor = col.text;
    ch.options.plugins.tooltip.bodyColor = col.muted;
    ch.options.scales.x.ticks.color = col.muted;
    ch.options.scales.y.ticks.color = col.muted;
    if (!ch.options.scales.y.ticks.maxTicksLimit) ch.options.scales.y.ticks.maxTicksLimit = 7;
    ch.options.scales.x.grid.color = col.grid;
    ch.options.scales.y.grid.color = col.grid;
    if (!ch.options.layout) ch.options.layout = {};
    ch.options.layout.padding = Object.assign({}, ch.options.layout.padding || {}, {
      bottom: 26,
      left: 10,
      right: 10,
      top: 6
    });
  };

  G.MoneyTrack = G.MoneyTrack || {};
  G.MoneyTrack.ChartService = ChartService;
})(typeof window !== 'undefined' ? window : globalThis);
