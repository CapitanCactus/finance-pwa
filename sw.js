const CACHE_NAME = 'finance-cache-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Установка: кэшируем оболочку приложения (App Shell)
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Заставляет сразу применять обновления
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Активация: очищает старые кэши
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim()); // Захватывает контроль над страницей
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch: стратегия Network First для HTML, Cache First для всего остального
self.addEventListener('fetch', (e) => {
  // Для HTML-файлов всегда идем в сеть (Network First), чтобы видеть свежий код
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Для статики (CSS, JS, картинки) сначала проверяем кэш (Cache First)
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
