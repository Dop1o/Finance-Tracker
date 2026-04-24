/**
 * @file Сборка приложения (dependency injection), единственная точка запуска.
 */
(function (G) {
  'use strict';

  var MT = G.MoneyTrack;

  /**
   * Создаёт сервисы и запускает FinanceApp.
   * @returns {void}
   */
  function boot() {
    try {
      var doc = G.document;
      var validation = new MT.ValidationService();
      var storage = new MT.StorageService();
      var notify = new MT.NotificationService(doc);
      var undoRedo = new MT.UndoRedoService({
        maxSteps: 20,
        storageKey: 'moneytrack-undo-redo'
      });
      undoRedo.restore();
      var charts = new MT.ChartService();
      var app = new MT.FinanceApp({
        document: doc,
        validation: validation,
        storage: storage,
        notify: notify,
        undoRedo: undoRedo,
        charts: charts
      });
      G.MoneyTrack.__app = app;
      app.init();
    } catch (e) {
      console.error(e);
    }
  }

  if (G.document.readyState === 'loading') {
    G.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
