// 앱 껍데기를 캐시해서 오프라인(헬스장 지하 등)에서도 열리게 한다.
// 파일을 고쳤으면 CACHE 버전을 올린다 — 안 올리면 폰이 옛날 파일을 계속 본다.
const CACHE = 'gym-log-v1';
const SHELL = [
  '.', 'index.html', 'app.css', 'app.js',
  'manifest.webmanifest', 'data/exercises.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
  );
});
