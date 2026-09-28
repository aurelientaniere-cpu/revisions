// Hors-ligne : on essaie le réseau (pour avoir les nouvelles leçons), sinon on sert la copie en cache.
const CACHE = 'revisions-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.json', 'icons/icon.svg', 'icons/icon-180.png',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/speech.js', 'js/srs.js', 'js/lessons.js',
  'js/activities.js', 'js/rewards.js', 'js/parent.js',
  'lessons/index.json', 'lessons/histoire-moyen-age.json', 'lessons/assets/chateau.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(e.request),
        new Promise((_, reject) => setTimeout(() => reject(new Error('lent')), 4000)),
      ]);
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    } catch {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw new Error('hors ligne');
    }
  })());
});
