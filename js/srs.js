// Répétition espacée : chaque notion a un niveau 0 → 4.
// Réussi du premier coup : niveau +1 et la notion revient plus tard (1, 3, 7, 16 jours).
// Réussi avec un indice : même niveau, revient demain.
// Raté : niveau −1, revient tout de suite.
// Chaque exercice garde aussi son historique (state.items) pour ne pas reposer
// toujours les mêmes questions d'une séance à l'autre.

import { state, save } from './store.js';
import { shuffle } from './util.js';

const DAY = 864e5;
const INTERVALS = [0, 1, 3, 7, 16];
const NEW_PER_SESSION = 3;
const TEMPERATURE = 0.5; // tirage pondéré : plus c'est bas, plus le meilleur score l'emporte

const dayNum = () => Math.floor(Date.now() / DAY);

// Séance en cours : sert à dater l'historique et à choisir un autre exercice après un raté.
let current = null;

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

export function grade(lesson, nids, result, itemId) {
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
  if (itemId) {
    const it = (state.items[itemId] ||= { d: 0, s: 0, n: 0, ok: 0 });
    it.d = dayNum();
    if (current && current.lesson.id === lesson.id) it.s = current.run;
    it.n++;
    if (result === 'ok') it.ok++;
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

// Numéro de la nouvelle séance de cette leçon ; oublie l'historique des exercices disparus.
function nextRun(lesson) {
  const prefix = `${lesson.id}#`;
  const ids = new Set(lesson.items.map((it) => it.id));
  let last = 0;
  for (const k of Object.keys(state.items)) {
    if (!k.startsWith(prefix)) continue;
    if (!ids.has(k)) delete state.items[k];
    else last = Math.max(last, state.items[k].s);
  }
  return last + 1;
}

// Nouveautés : une notion tirée parmi les 3 premières non vues (on suit à peu près
// l'ordre de la fiche), complétée au hasard, de préférence par des mots du même groupe.
// Leçon `ordered` (maths : chaque astuce s'appuie sur la précédente) : toujours dans l'ordre,
// et `newPerSession` nouveautés au plus.
function pickFresh(unseen, lesson) {
  if (!unseen.length) return [];
  if (lesson.ordered) return unseen.slice(0, lesson.newPerSession || NEW_PER_SESSION);
  const anchor = unseen[Math.floor(Math.random() * Math.min(3, unseen.length))];
  const same = (x) => (anchor.group && x.group === anchor.group ? 1 : 0);
  const rest = shuffle(unseen.filter((x) => x !== anchor)).sort((a, b) => same(b) - same(a));
  return [anchor, ...rest].slice(0, NEW_PER_SESSION);
}

// Construit une séance : suite d'étapes { kind: 'decouverte', notion } ou { kind: 'item', item }.
export function buildSession(lesson, n) {
  const now = Date.now();
  const st = (x) => ns(lesson, x.id);
  const seen = lesson.notions.filter((x) => st(x).seen);
  const due = seen.filter((x) => st(x).due <= now)
    .sort((a, b) => st(a).level - st(b).level || st(a).due - st(b).due);
  const fresh = pickFresh(lesson.notions.filter((x) => !st(x).seen), lesson);
  let review = [...due];
  if (review.length + fresh.length < n) {
    const rest = seen.filter((x) => !due.includes(x))
      .sort((a, b) => st(a).level - st(b).level || st(a).due - st(b).due);
    review = review.concat(rest.slice(0, n - review.length - fresh.length));
  }

  current = {
    lesson, run: nextRun(lesson), day: dayNum(),
    known: new Set([...seen, ...fresh].map((x) => x.id)),
    isNew: new Set(fresh.map((x) => x.id)),
    used: new Set(),
    typeCount: {},
  };
  const take = (notion) => {
    const item = pickItem(lesson, notion);
    return item ? { kind: 'item', item } : null;
  };

  const reviewQ = review.map(take).filter(Boolean);
  // Deux questions par mot nouveau si la séance est courte (début de leçon) ;
  // jusqu'à `perNew` (maths : un calcul s'automatise en le refaisant) pour remplir la séance.
  const room = fresh.length ? Math.ceil((n - reviewQ.length) / fresh.length) : 0;
  const perNew = Math.max(1, Math.min(lesson.perNew || 2, reviewQ.length + fresh.length < n ? room : 1));
  const freshQ = [];
  for (let r = 0; r < perNew; r++) for (const x of fresh) { const q = take(x); if (q) freshQ.push(q); }
  // Maths (`perNew`) : séance trop courte ? d'autres calculs sur les notions déjà vues.
  for (let r = 1; r < (lesson.perNew || 1); r++) {
    for (const x of review) {
      if (reviewQ.length + freshQ.length >= n) break;
      const q = take(x);
      if (q) reviewQ.push(q);
    }
  }

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

// Exercices utilisables dans la séance en cours.
function usable(lesson, match) {
  const { known, isNew, used } = current;
  return lesson.items.filter((it) =>
    match(it) && !used.has(it.id) && it.notions.every((id) => known.has(id)) &&
    // « Que veut dire… ? », « Relie » et les vrai/faux sur la définition la redonnent : pas le jour de la découverte.
    !(it.review && it.notions.some((id) => isNew.has(id))));
}

// Score (plus bas = mieux) : difficulté proche de la cible, jeux variés dans la séance,
// et surtout pas un exercice posé lors des dernières séances.
function score(it, target) {
  const { run, day, typeCount } = current;
  let s = Math.abs((it.diff ?? 1) - target) + 0.8 * (typeCount[it.layout || it.type] || 0);
  const h = state.items[it.id];
  if (h && h.n) {
    const ago = run - h.s;
    if (ago <= 1) s += 4;                          // posé à la séance précédente
    else if (ago <= 2 || day - h.d < 2) s += 2.5;  // il y a deux séances, ou hier
    s += 0.3 * Math.min(h.ok, 4) + 0.1 * Math.min(h.n, 5); // déjà bien su, déjà souvent vu
  }
  return s;
}

// Tirage pondéré : le meilleur score a le plus de chances, sans gagner à tous les coups.
function draw(candidates, target) {
  if (!candidates.length) return null;
  const scored = candidates.map((it) => ({ it, s: score(it, target) }));
  const best = Math.min(...scored.map((x) => x.s));
  const w = scored.map((x) => Math.exp(-(x.s - best) / TEMPERATURE));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) if ((r -= w[i]) <= 0) return scored[i].it;
  return scored[scored.length - 1].it;
}

function use(item) {
  current.used.add(item.id);
  const t = item.layout || item.type;
  current.typeCount[t] = (current.typeCount[t] || 0) + 1;
  return item;
}

function pickItem(lesson, notion) {
  const target = Math.min(3, ns(lesson, notion.id).level + 2);
  const item = draw(usable(lesson, (it) => it.notions.includes(notion.id)), target);
  return item && use(item);
}

// Après un raté : un AUTRE exercice sur la même notion pour la fin de séance (sinon le même).
export function retryItem(lesson, item) {
  if (!current || current.lesson.id !== lesson.id) return item;
  const level = Math.min(...item.notions.map((id) => ns(lesson, id).level));
  const other = draw(usable(lesson, (it) => it.id !== item.id && it.notions.some((id) => item.notions.includes(id))),
    Math.min(3, level + 2));
  return other ? use(other) : item;
}
