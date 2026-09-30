// Chargement des leçons construites par tools/build.py (lessons/build/<id>.json).

let imagesP;
function images() {
  imagesP ||= fetch('lessons/img/manifest.json').then((r) => r.json()).then((m) => new Set(m.images)).catch(() => new Set());
  return imagesP;
}

// Une clé « dossier/nom » vise une image d'un autre dossier (ex. companions/dragon-violet4).
const resolver = (set, dir) => (key) => {
  if (!key) return null;
  const f = key.includes('/') ? `${key}.jpg` : `${dir}/${key}.jpg`;
  return set.has(f) ? `lessons/img/${f}` : null;
};

export async function loadLessons() {
  const index = await fetch('lessons/index.json').then((r) => r.json());
  const set = await images();
  const lessons = await Promise.all(index.lessons.map((f) => fetch(`lessons/build/${f}`).then((r) => r.json())));
  return lessons.map((L) => {
    L.notionById = Object.fromEntries(L.notions.map((n) => [n.id, n]));
    L.img = resolver(set, L.id);
    L.zoneNames = Object.fromEntries(L.notions.filter((n) => n.zone).map((n) => [n.zone, n.nom || n.term]));
    return L;
  });
}

// Les compagnons (espèces, noms des stades, illustrations) : lessons/companions.json.
export async function loadCompanions() {
  const data = await fetch('lessons/companions.json').then((r) => r.json());
  data.img = resolver(await images(), data.id);
  return data;
}
