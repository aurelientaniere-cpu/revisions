// Hors-ligne : on essaie le réseau (pour avoir les nouvelles leçons), sinon on sert la copie en cache.
// À l'installation, on met aussi en cache tous les enregistrements audio listés dans audio/manifest.json.
const CACHE = 'revisions-v4';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.json', 'phrases.json', 'icons/icon.svg', 'icons/icon-180.png',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/speech.js', 'js/srs.js', 'js/lessons.js', 'js/phrases.js',
  'js/activities.js', 'js/rewards.js', 'js/parent.js',
  'lessons/index.json', 'lessons/build/histoire-moyen-age.json', 'lessons/assets/chateau.svg',
  'lessons/build/sciences-alimentation.json', 'lessons/assets/monde.svg',
  'lessons/build/sciences-lune.json', 'lessons/assets/lune.svg',
];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  // Les sons et images : tolérant (un fichier manquant ne bloque pas l'installation).
  for (const [list, dir, ext] of [['audio/manifest.json', 'audio/', '.m4a'], ['lessons/img/manifest.json', 'lessons/img/', '']]) {
    try {
      const m = await fetch(list).then((r) => r.json());
      await cache.put(list, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));
      const files = (m.clips || m.images || []).map((k) => dir + k + ext);
      for (let i = 0; i < files.length; i += 20) {
        await Promise.all(files.slice(i, i + 20).map((f) => cache.add(f).catch(() => {})));
      }
    } catch { /* pas encore de fichier */ }
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Sons et images ne changent jamais (leur nom est une empreinte) : le cache d'abord.
  const immutable = /\/audio\/[0-9a-f]{8}\.m4a$|\/lessons\/img\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (immutable) {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
    }
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
