var CACHE = 'moneytrack-v4';
var CORE = [
  './',
  './index.html',
  './custom.css',
  './manifest-ru.json',
  './manifest-en.json',   
  './js/moneytrack-i18n.js',
  './js/utils.js',
  './js/validation-service.js',
  './js/storage-service.js',
  './js/notification-service.js',
  './js/undo-redo-service.js',
  './js/chart-service.js',
  './js/finance-app.js',
  './js/bootstrap.js'
];

// Внешние ресурсы
var EXTERNAL = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', function (e) {
  console.log('[SW] Install', CACHE);
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      console.log('[SW] Caching core assets');
      return cache.addAll(CORE).catch(function (err) {
        console.error('[SW] Cache addAll error:', err);
      });
    }).then(function () {
      return caches.open(CACHE + '-external').then(function (extCache) {
        return Promise.allSettled(
          EXTERNAL.map(function (url) {
            return fetch(url, { mode: 'no-cors' })
              .then(function (response) {
                if (response.ok || response.type === 'opaque') {
                  return extCache.put(url, response);
                }
              })
              .catch(function (err) {
                console.warn('[SW] Failed to cache external:', url, err);
              });
          })
        );
      });
    }).then(function () {
      console.log('[SW] Install complete, skipping waiting');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  console.log('[SW] Activate', CACHE);
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key.startsWith('moneytrack-') && key !== CACHE && key !== CACHE + '-external';
        }).map(function (key) {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(function () {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  
  if (e.request.method !== 'GET') return;
  
  // API запросы (курсы валют) - Network First
  if (url.hostname.includes('exchangerate-api.com')) {
    e.respondWith(
      fetch(e.request)
        .then(function (response) {
          return response;
        })
        .catch(function () {
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // Локальные ресурсы: Cache First, затем Network
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        if (cached) {
          return cached;
        }
        
        return fetch(e.request).then(function (response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(function () {
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw new Error('Network unavailable');
        });
      })
    );
    return;
  }
  
  // Внешние CDN: Stale-While-Revalidate
  if (EXTERNAL.some(function (ext) { return url.href.startsWith(ext); })) {
    e.respondWith(
      caches.open(CACHE + '-external').then(function (cache) {
        return cache.match(e.request).then(function (cached) {
          var fetchPromise = fetch(e.request)
            .then(function (response) {
              if (response && response.ok) {
                cache.put(e.request, response.clone());
              }
              return response;
            })
            .catch(function () {});
          
          return cached || fetchPromise;
        });
      })
    );
    return;
  }
  
  e.respondWith(fetch(e.request));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});