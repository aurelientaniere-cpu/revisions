// Chargement des leçons construites par tools/build.py (lessons/build/<id>.json).

export async function loadLessons() {
  const index = await fetch('lessons/index.json').then((r) => r.json());
  let images = new Set();
  try { images = new Set((await fetch('lessons/img/manifest.json').then((r) => r.json())).images); } catch { /* pas d'images */ }
  const lessons = await Promise.all(index.lessons.map((f) => fetch(`lessons/build/${f}`).then((r) => r.json())));
  return lessons.map((L) => {
    L.notionById = Object.fromEntries(L.notions.map((n) => [n.id, n]));
    L.img = (key) => (key && images.has(`${L.id}/${key}.jpg`) ? `lessons/img/${L.id}/${key}.jpg` : null);
    L.zoneNames = Object.fromEntries(L.notions.filter((n) => n.zone).map((n) => [n.zone, n.nom || n.term]));
    return L;
  });
}
