const CACHE_NAME = 'finance-cache-v11';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Заставляет сразу применять обновления
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim()); // Захватывает контроль над страницей
});

self.addEventListener('fetch', (e) => {
  // Для HTML-файлов всегда идем в интернет (Network First), чтобы видеть свежий код
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    // Картинки и скрипты берем из кэша (Cache First)
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  }
});
