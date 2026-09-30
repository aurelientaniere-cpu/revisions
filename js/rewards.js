// Récompenses : le compagnon qui grandit et les cartes à collectionner.

import { state, save } from './store.js';
import { ns } from './srs.js';
import { today, h } from './util.js';
import { say } from './speech.js';
import { P } from './phrases.js';

// Paliers d'étoiles, comptées depuis l'arrivée de l'œuf (state.companion.start).
// Les noms des stades propres à chaque espèce sont dans lessons/companions.json.
export const STAGES = [
  { at: 0, name: 'Un œuf mystérieux' },
  { at: 15, name: 'Ça bouge dans l’œuf !' },
  { at: 50, name: 'Bébé dragon' },
  { at: 120, name: 'Jeune dragon' },
  { at: 250, name: 'Dragon royal' },
];
const LAST = STAGES.length - 1;

export function stageOf(stars) {
  let s = 0;
  STAGES.forEach((st, i) => { if (stars >= st.at) s = i; });
  return s;
}

// Étoiles : l'effort compte autant que la réussite.
export function starsForSession(results, firstToday) {
  let n = 0;
  for (const r of results) n += r === 'ok' ? 2 : 1;
  n += 3; // séance terminée
  if (firstToday) n += 2;
  return n;
}

export function addStars(n) {
  const before = current().stage;
  state.companion.stars += n;
  save();
  return current().stage > before;
}

export function recordDay() {
  const d = today();
  const first = state.stats.lastDay !== d;
  if (first) { state.stats.lastDay = d; state.stats.days++; }
  state.stats.sessions++;
  save();
  return first;
}

// Une carte se débloque quand toutes ses notions sont au niveau 2 ou plus.
export function checkCards(lesson) {
  const fresh = [];
  for (const c of lesson.cards || []) {
    if (state.cards.includes(c.id)) continue;
    const need = c.notions === 'all' ? lesson.notions.map((n) => n.id) : c.notions;
    const min = c.level ?? 2;
    if (need.every((id) => ns(lesson, id).level >= min)) {
      state.cards.push(c.id);
      fresh.push(c);
    }
  }
  if (fresh.length) save();
  return fresh;
}

/* ---------- Les espèces de compagnons (lessons/companions.json) ---------- */
let C = { id: 'companions', species: [], img: () => null };

export function setCompanions(data) { C = data; }

export function speciesOf(id) {
  return C.species.find((s) => s.id === id) || C.species[0]
    || { id: 'dragon-violet', name: 'Dragon violet', emoji: '🐉', color: '#7c6cf0', stages: STAGES.map((s) => s.name) };
}

export const stageName = (sp, stage) => (sp.stages && sp.stages[stage]) || STAGES[stage].name;

// Le compagnon actuel : espèce, étoiles gagnées depuis l'arrivée de l'œuf, stade.
export function current() {
  const c = state.companion;
  const sp = speciesOf(c.species);
  const rel = Math.max(0, c.stars - (c.start || 0));
  const stage = stageOf(rel);
  return { c, sp, rel, stage, prevAt: STAGES[stage].at, next: STAGES[stage + 1] || null };
}

// Dernier stade atteint : le compagnon rejoint la collection et un nouvel œuf arrive
// (espèce pas encore obtenue, tirée au hasard ; toutes obtenues : n'importe laquelle).
// Le total d'étoiles ne change pas : le nouvel œuf compte à partir d'ici.
export function graduate() {
  const cur = current();
  if (cur.next || !C.species.length) return null;
  const adult = { species: cur.sp.id, name: cur.c.name || '' };
  state.companions.push(adult);
  const owned = new Set(state.companions.map((a) => a.species));
  let pool = C.species.filter((s) => !owned.has(s.id));
  if (!pool.length) pool = C.species;
  const sp = pool[Math.floor(Math.random() * pool.length)];
  Object.assign(state.companion, { species: sp.id, name: '', start: state.companion.stars, isNew: true });
  save();
  return adult;
}

export const adultName = (a) => a.name || stageName(speciesOf(a.species), LAST);

/* ---------- Le compagnon (dessin original, secours sans illustration) ---------- */
const BODY = '#7c6cf0', BELLY = '#fbe7b0', WING = '#a99cff', DARK = '#2b2a33';

function eyes(y = 76) {
  return `
  <circle cx="84" cy="${y}" r="12" fill="#fff"/><circle cx="116" cy="${y}" r="12" fill="#fff"/>
  <circle cx="86" cy="${y + 2}" r="7" fill="${DARK}"/><circle cx="118" cy="${y + 2}" r="7" fill="${DARK}"/>
  <circle cx="89" cy="${y - 1}" r="2.5" fill="#fff"/><circle cx="121" cy="${y - 1}" r="2.5" fill="#fff"/>`;
}

function dragon(stage) {
  const wings = stage >= 3 ? `
    <path d="M62 118 C20 90 18 60 40 58 C44 78 56 88 70 96 Z" fill="${WING}" stroke="${DARK}" stroke-width="3"/>
    <path d="M138 118 C180 90 182 60 160 58 C156 78 144 88 130 96 Z" fill="${WING}" stroke="${DARK}" stroke-width="3"/>` : '';
  const tail = stage >= 3 ? `<path d="M140 150 C175 160 182 135 172 120 L186 116 L176 132 C190 150 170 175 138 162 Z" fill="${BODY}" stroke="${DARK}" stroke-width="3"/>` : '';
  const horns = stage >= 3 ? `
    <path d="M78 50 L72 26 L92 44 Z" fill="${BELLY}" stroke="${DARK}" stroke-width="3"/>
    <path d="M122 50 L128 26 L108 44 Z" fill="${BELLY}" stroke="${DARK}" stroke-width="3"/>` :
    `<circle cx="80" cy="46" r="7" fill="${BELLY}" stroke="${DARK}" stroke-width="3"/><circle cx="120" cy="46" r="7" fill="${BELLY}" stroke="${DARK}" stroke-width="3"/>`;
  const crown = stage >= 4 ? `
    <path d="M78 34 L84 12 L94 26 L100 6 L106 26 L116 12 L122 34 Z" fill="#f5b700" stroke="${DARK}" stroke-width="3"/>
    <circle cx="100" cy="24" r="3" fill="#e84a5f"/>
    <text x="160" y="40" font-size="22">✨</text><text x="22" y="150" font-size="18">✨</text>` : '';
  const scale = stage === 2 ? 'translate(20 30) scale(.8)' : '';
  return `<g transform="${scale}">
    ${wings}${tail}
    <ellipse cx="80" cy="170" rx="16" ry="10" fill="${BODY}" stroke="${DARK}" stroke-width="3"/>
    <ellipse cx="120" cy="170" rx="16" ry="10" fill="${BODY}" stroke="${DARK}" stroke-width="3"/>
    <ellipse cx="100" cy="130" rx="46" ry="42" fill="${BODY}" stroke="${DARK}" stroke-width="3"/>
    <ellipse cx="100" cy="138" rx="28" ry="28" fill="${BELLY}"/>
    ${horns}
    <circle cx="100" cy="78" r="38" fill="${BODY}" stroke="${DARK}" stroke-width="3"/>
    ${crown}
    ${eyes()}
    <ellipse cx="72" cy="94" rx="7" ry="4" fill="#ff9fb2"/><ellipse cx="128" cy="94" rx="7" ry="4" fill="#ff9fb2"/>
    <path d="M90 96 Q100 106 110 96" fill="none" stroke="${DARK}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function egg(cracked, spots = WING) {
  return `
    <ellipse cx="100" cy="112" rx="58" ry="74" fill="${BELLY}" stroke="${DARK}" stroke-width="3"/>
    <circle cx="78" cy="90" r="10" fill="${spots}"/><circle cx="124" cy="120" r="14" fill="${spots}"/>
    <circle cx="88" cy="150" r="8" fill="${spots}"/><circle cx="118" cy="70" r="7" fill="${spots}"/>
    ${cracked ? `<path d="M44 108 L62 96 L74 112 L90 94 L104 112 L118 96 L132 112 L156 100" fill="none" stroke="${DARK}" stroke-width="3" stroke-linejoin="round"/>
    ${eyes(80).replace(/r="12"/g, 'r="9"')}` : ''}`;
}

// Illustration du compagnon (peinte), sinon le dessin de secours :
// œuf vectoriel, dragon vectoriel pour le dragon violet, emoji de l'espèce pour les autres.
export function companionArt(speciesId, stage) {
  const sp = speciesOf(speciesId);
  const url = C.img(`${sp.id}${stage}`);
  if (url) return `<img src="${url}" alt="${stageName(sp, stage)}">`;
  return companionSVG(sp, stage);
}

function companionSVG(sp, stage) {
  const violet = sp.id === 'dragon-violet';
  const sparkles = '<text x="160" y="40" font-size="22">✨</text><text x="22" y="150" font-size="18">✨</text>';
  const inner = stage < 2 ? egg(stage === 1, violet ? WING : sp.color)
    : violet ? dragon(stage)
      : `<text x="100" y="${[0, 0, 140, 150, 160][stage]}" font-size="${[0, 0, 80, 110, 130][stage]}" text-anchor="middle">${sp.emoji}</text>${stage === LAST ? sparkles : ''}`;
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${stageName(sp, stage)}">
    <ellipse cx="100" cy="186" rx="60" ry="8" fill="rgba(0,0,0,.08)"/>${inner}</svg>`;
}

/* ---------- Mes compagnons : la collection ---------- */
export function companionsView() {
  const cur = current();
  const hidden = cur.stage < 2; // l'espèce reste une surprise jusqu'à l'éclosion
  const card = (spId, stage, title, sub, color, onclick, big) => h('div', { class: `pcard comp-card ${big ? 'big-comp' : ''}`, style: { background: color }, onclick },
    h('div', { class: 'comp-art', html: companionArt(spId, stage) }),
    h('div', {}, title),
    sub ? h('div', { class: 'comp-sub' }, sub) : null);
  const owned = new Set(state.companions.map((a) => a.species));
  const locked = C.species.filter((s) => !owned.has(s.id) && s.id !== cur.sp.id);
  const nowName = cur.c.name || (hidden ? 'Mon œuf' : stageName(cur.sp, cur.stage));
  return [
    h('h1', {}, '🐉 Mes compagnons'),
    h('h2', {}, 'En ce moment'),
    h('div', { class: 'album comp-album' },
      card(cur.sp.id, cur.stage, nowName, hidden ? stageName(cur.sp, cur.stage) : cur.sp.name,
        hidden ? '#b9a98a' : cur.sp.color,
        () => say(hidden ? [stageName(cur.sp, cur.stage), P.companionMore] : [nowName, cur.sp.name, P.companionMore]))),
    h('h2', {}, `Tout grands : ${state.companions.length}`),
    state.companions.length ? null : h('p', { class: 'muted' }, 'Quand ton compagnon aura fini de grandir, il viendra vivre ici.'),
    h('div', { class: 'album comp-album' },
      state.companions.map((a) => {
        const sp = speciesOf(a.species);
        return card(sp.id, LAST, adultName(a), sp.name, sp.color, () => say([adultName(a), sp.name]), true);
      }),
      locked.map(() => h('div', { class: 'pcard locked comp-card', onclick: () => say(P.companionLocked) },
        h('div', { class: 'art' }, '❓'), h('div', {}, '???')))),
  ];
}
