// Répétition espacée : chaque notion a un niveau 0 → 4.
// Réussi du premier coup : niveau +1 et la notion revient plus tard (1, 3, 7, 16 jours).
// Réussi avec un indice : même niveau, revient demain.
// Raté : niveau −1, revient tout de suite.

import { state, save } from './store.js';

const DAY = 864e5;
const INTERVALS = [0, 1, 3, 7, 16];
const NEW_PER_SESSION = 3;

export function ns(lesson, nid) {
  const k = `${lesson.id}/${nid}`;
  return (state.notions[k] ||= { level: 0, seen: false, due: 0, ok: 0, ko: 0 });
}

export function markSeen(lesson, nid) {
  const s = ns(lesson, nid);
  s.seen = true;
  s.due = Date.now();
  save();
}

export function grade(lesson, nids, result) {
  const now = Date.now();
  for (const nid of nids) {
    const s = ns(lesson, nid);
    s.seen = true;
    if (result === 'ok') {
      s.level = Math.min(4, s.level + 1);
      s.due = now + INTERVALS[s.level] * DAY;
      s.ok++;
    } else if (result === 'partial') {
      s.due = now + (s.level ? DAY : 0);
      s.ok++;
    } else {
      s.level = Math.max(0, s.level - 1);
      s.due = now;
      s.ko++;
    }
  }
  save();
}

export function lessonProgress(lesson) {
  const total = lesson.notions.length * 4;
  const sum = lesson.notions.reduce((a, n) => a + ns(lesson, n.id).level, 0);
  return total ? sum / total : 0;
}

export function dueCount(lesson) {
  const now = Date.now();
  return lesson.notions.filter((n) => {
    const s = ns(lesson, n.id);
    return !s.seen || s.due <= now;
  }).length;
}

// Choisit la leçon qui a le plus besoin d'être révisée.
export function bestLesson(lessons) {
  return [...lessons].sort((a, b) => dueCount(b) - dueCount(a) || lessonProgress(a) - lessonProgress(b))[0];
}

// Construit une séance : suite d'étapes { kind: 'decouverte', notion } ou { kind: 'item', item }.
export function buildSession(lesson, n) {
  const now = Date.now();
  const st = (x) => ns(lesson, x.id);
  const seen = lesson.notions.filter((x) => st(x).seen);
  const due = seen.filter((x) => st(x).due <= now)
    .sort((a, b) => st(a).level - st(b).level || st(a).due - st(b).due);
  const fresh = lesson.notions.filter((x) => !st(x).seen).slice(0, NEW_PER_SESSION);
  let review = [...due];
  if (review.length + fresh.length < n) {
    const rest = seen.filter((x) => !due.includes(x))
      .sort((a, b) => st(a).level - st(b).level || st(a).due - st(b).due);
    review = review.concat(rest.slice(0, n - review.length - fresh.length));
  }

  const known = new Set([...seen, ...fresh].map((x) => x.id));
  const isNew = new Set(fresh.map((x) => x.id));
  const used = new Set();
  const typeCount = {};
  const take = (notion) => {
    const item = pickItem(lesson, notion, known, isNew, used, typeCount);
    if (!item) return null;
    used.add(item.id);
    const t = item.layout || item.type;
    typeCount[t] = (typeCount[t] || 0) + 1;
    return { kind: 'item', item };
  };

  const reviewQ = review.map(take).filter(Boolean);
  // Deux questions par mot nouveau si la séance est courte (début de leçon).
  const perNew = reviewQ.length + fresh.length < n ? 2 : 1;
  const freshQ = [];
  for (let r = 0; r < perNew; r++) for (const x of fresh) { const q = take(x); if (q) freshQ.push(q); }

  // Les mots nouveaux sont découverts d'abord ; leurs questions arrivent au moins
  // deux questions plus tard, jamais juste après la carte.
  const questions = [];
  const lead = reviewQ.splice(0, 2);
  questions.push(...lead);
  while (reviewQ.length || freshQ.length) {
    if (freshQ.length) questions.push(freshQ.shift());
    if (reviewQ.length) questions.push(reviewQ.shift());
  }
  return [...fresh.map((notion) => ({ kind: 'decouverte', notion })), ...questions.slice(0, n)];
}

function pickItem(lesson, notion, known, isNew, used, typeCount) {
  const level = ns(lesson, notion.id).level;
  const target = Math.min(3, level + 2);
  const candidates = lesson.items.filter((it) =>
    it.notions.includes(notion.id) && !used.has(it.id) && it.notions.every((id) => known.has(id)) &&
    // « Que veut dire… ? » et « Relie » redonnent la définition : pas le jour de la découverte.
    !(it.review && it.notions.some((id) => isNew.has(id))));
  if (!candidates.length) return null;
  return candidates
    // On varie les jeux : chaque jeu déjà proposé dans la séance est pénalisé.
    .map((it) => ({ it, score: Math.abs((it.diff ?? 1) - target) + Math.random() * 0.8 + 0.8 * (typeCount[it.layout || it.type] || 0) }))
    .sort((a, b) => a.score - b.score)[0].it;
}
