import { h, cap, pick } from './util.js';
import { state, save } from './store.js';
import { say, sayAll, stop, unlock } from './speech.js';
import { loadLessons } from './lessons.js';
import { buildSession, grade, markSeen, ns, lessonProgress, dueCount, bestLesson } from './srs.js';
import { renderStep, schemaView } from './activities.js';
import { companionSVG, stageOf, nextStage, STAGES, starsForSession, addStars, recordDay, checkCards } from './rewards.js';
import { parentGate } from './parent.js';

const app = document.getElementById('app');
let lessons = [];
let unlocked = false;

function applySettings() {
  document.body.classList.toggle('font-lexend', state.settings.font === 'lexend');
  document.body.classList.toggle('font-system', state.settings.font === 'system');
}

function screen(...kids) {
  stop();
  app.replaceChildren(...kids.flat().filter(Boolean));
  window.scrollTo(0, 0);
}

function backBtn(label = '🏠 Accueil', to = home) {
  return h('button', { class: 'ghost', onclick: to }, label);
}

function companionName() {
  return state.companion.name || 'Mon compagnon';
}

/* ---------- Accueil ---------- */
function home() {
  applySettings();
  const stars = state.companion.stars;
  const next = nextStage(stars);
  const prev = STAGES[stageOf(stars)].at;
  const pct = next ? Math.round(((stars - prev) / (next.at - prev)) * 100) : 100;

  const gear = h('button', { class: 'parent-gear', 'aria-label': 'Espace parent' }, '⚙️');
  let timer;
  const startPress = () => { timer = setTimeout(() => parentGate(lessons, home), 1500); };
  const endPress = () => clearTimeout(timer);
  gear.addEventListener('pointerdown', startPress);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => gear.addEventListener(e, endPress));

  const best = bestLesson(lessons);
  const tiles = lessons.map((L) => {
    const due = dueCount(L);
    return h('div', { class: 'panel lesson-tile', style: { borderColor: L.color } },
      h('div', { class: 'row' },
        h('span', { class: 'emoji' }, L.emoji),
        h('div', {},
          h('div', { class: 'subject', style: { color: L.color } }, L.subject),
          h('h3', {}, L.title))),
      h('div', { class: 'meter' }, h('span', { style: { width: `${Math.round(lessonProgress(L) * 100)}%`, background: L.color } })),
      h('div', { class: 'row' },
        h('button', { class: 'primary', style: { background: L.color, borderColor: L.color }, onclick: () => start(L) }, due ? '▶ Réviser' : '▶ S’entraîner'),
        h('button', { onclick: () => listen(L) }, '🎧 Écouter')));
  });

  screen(
    gear,
    h('div', { class: 'home-top' },
      h('div', { class: 'companion', onclick: () => say(`${companionName()}. ${STAGES[stageOf(stars)].name}. Tu as ${stars} étoiles.`), html: companionSVG(stars) }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { class: 'row' },
          h('span', { class: 'companion-name' }, companionName()),
          h('button', { class: 'icon ghost', 'aria-label': 'Changer le nom', onclick: rename }, '✏️')),
        h('div', { class: 'stars' }, h('b', {}, '★ '), `${stars} étoiles`),
        next ? h('div', {}, h('div', { class: 'meter' }, h('span', { style: { width: `${pct}%` } })),
          h('div', { class: 'muted' }, `Encore ${next.at - stars} étoiles pour : ${next.name}`)) : h('div', {}, '👑 Ton dragon est au maximum !'),
        h('div', { class: 'row' },
          best ? h('button', { class: 'primary big', onclick: () => start(best) }, '▶ C’est parti !') : null,
          h('button', { class: 'big', onclick: album }, '🃏 Mon album')))),
    h('h2', {}, 'Mes leçons'),
    h('div', { class: 'lessons' }, tiles),
  );
}

function rename() {
  const name = prompt('Comment s’appelle ton compagnon ?', state.companion.name || '');
  if (name != null) {
    state.companion.name = name.trim().slice(0, 20);
    save();
    home();
  }
}

/* ---------- Séance ---------- */
function start(L) {
  if (!unlocked) { unlock(); unlocked = true; }
  const steps = buildSession(L, state.settings.sessionLen);
  const t0 = Date.now();
  const results = [];
  const requeued = new Set();
  const total = steps.filter((s) => s.kind === 'item').length;
  let i = 0;

  const next = () => {
    if (i >= steps.length) return finish();
    const step = steps[i++];
    if (step.kind === 'decouverte') return discover(step.notion);
    show(step.item);
  };

  const bar = () => {
    const done = results.length;
    return h('div', { class: 'session-bar' },
      h('button', { class: 'icon ghost', 'aria-label': 'Arrêter', onclick: () => { if (confirm('Arrêter la séance ?')) home(); } }, '✖'),
      h('div', { class: 'dots' }, Array.from({ length: total }, (_, k) =>
        h('span', { class: k < done ? 'done' : k === done ? 'now' : '' }))));
  };

  async function discover(n) {
    const tag = h('div', { class: 'discover-tag' }, '✨ Nouveau mot');
    const card = h('div', { class: 'panel discover' },
      h('div', { class: 'big-emoji' }, n.emoji || '📘'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        tag,
        h('div', { class: 'term' }, cap(n.term)),
        h('div', { class: 'def' }, cap(n.def) + '.')));
    const text = `${cap(n.nom || n.term)} : ${n.def}.`;
    screen(bar(), card,
      n.zone && L.schema ? await schemaView(L, n.zone) : null,
      h('div', { class: 'row' },
        h('button', { class: 'icon', onclick: () => say(text) }, '🔊'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary big', onclick: () => { markSeen(L, n.id); next(); } }, 'J’ai compris 👍')));
    say(`Nouveau mot. ${text}`);
  }

  function show(item) {
    const root = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });
    screen(bar(), root);
    const level = Math.min(...item.notions.map((id) => ns(L, id).level));
    renderStep(item, {
      root, lesson: L, level,
      done: (result) => {
        grade(L, item.notions, result);
        if (result === 'fail' && !requeued.has(item.id)) {
          // La question reviendra à la fin de la séance, sans compter une case de plus.
          requeued.add(item.id);
          steps.push({ kind: 'item', item, retry: true });
        } else {
          results.push(result);
        }
        next();
      },
    });
  }

  function finish() {
    state.stats.seconds += Math.round((Date.now() - t0) / 1000);
    const first = recordDay();
    const earned = starsForSession(results, first);
    const grew = addStars(earned);
    const cards = checkCards(L);
    const stars = state.companion.stars;
    const lines = [`Bravo ! Tu as gagné ${earned} étoiles.`];
    if (grew) lines.push(`Waouh ! ${companionName()} a grandi : ${STAGES[stageOf(stars)].name} !`);
    if (cards.length) lines.push(cards.length > 1 ? `Tu débloques ${cards.length} nouvelles cartes !` : `Tu débloques une nouvelle carte : ${cards[0].name} !`);
    lines.push('Tu peux faire une pause.');
    screen(
      h('div', { class: 'center' },
        h('h1', {}, pick(['Séance terminée !', 'Mission accomplie !', 'Bien joué !'])),
        h('div', { class: 'stars' }, h('b', {}, '★ '), `+${earned} étoiles`),
        h('div', { class: 'companion', style: { width: '220px' }, html: companionSVG(stars) }),
        grew ? h('h2', {}, `${companionName()} a grandi !`) : null,
        cards.length ? h('div', { class: 'new-cards' }, cards.map((c) => cardEl(c, true))) : null,
        h('p', { class: 'muted' }, '🌿 Fais une petite pause : bois un verre d’eau, étire-toi.'),
        h('button', { class: 'primary big', onclick: home }, '🏠 Retour')));
    sayAll(lines);
  }

  next();
}

/* ---------- Écouter la leçon ---------- */
function listen(L) {
  if (!unlocked) { unlock(); unlocked = true; }
  const paras = L.summary.map((t) => h('div', { class: 'para panel', onclick: () => play(L.summary.indexOf(t)) }, t));
  const play = (from = 0) => sayAll(L.summary.slice(from), (i) =>
    paras.forEach((p, j) => p.classList.toggle('reading', i >= 0 && j === i + from)));
  screen(
    h('div', { class: 'row' }, backBtn(), h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: () => play(0) }, '▶ Tout écouter'),
      h('button', { onclick: stop }, '⏸ Pause')),
    h('h1', {}, `${L.emoji} ${L.title}`),
    h('p', { class: 'muted' }, 'Touche un paragraphe pour l’écouter.'),
    ...paras);
  play(0);
}

/* ---------- Album de cartes ---------- */
function cardEl(c, owned) {
  return h('div', { class: `pcard ${owned ? '' : 'locked'} ${c.legend ? 'legend' : ''}`, style: { background: c.color } },
    h('div', { class: 'art' }, owned ? c.emoji : '❓'),
    h('div', {}, owned ? c.name : '???'));
}

function album() {
  const all = lessons.flatMap((L) => (L.cards || []).map((c) => ({ ...c, L })));
  const owned = all.filter((c) => state.cards.includes(c.id)).length;
  screen(
    h('div', { class: 'row' }, backBtn()),
    h('h1', {}, `🃏 Mon album — ${owned} / ${all.length}`),
    ...lessons.map((L) => [
      h('h2', {}, `${L.emoji} ${L.title}`),
      h('div', { class: 'album' }, (L.cards || []).map((c) => {
        const has = state.cards.includes(c.id);
        const el = cardEl(c, has);
        el.addEventListener('click', () => {
          if (has) return zoom(c);
          const names = (c.notions === 'all' ? ['toute la leçon'] : c.notions.map((id) => L.notionById[id].term)).join(', ');
          say(`Carte à gagner. Pour la débloquer, révise : ${names}.`);
        });
        return el;
      })),
    ]).flat());
  say(`Tu as ${owned} cartes sur ${all.length}.`);
}

function zoom(c) {
  const ov = h('div', { class: 'overlay', onclick: () => { stop(); ov.remove(); } },
    h('div', { class: 'center' },
      h('div', { class: `pcard big ${c.legend ? 'legend' : ''}`, style: { background: c.color } },
        h('div', { class: 'art' }, c.emoji), h('div', {}, c.name)),
      h('div', { class: 'panel' }, c.desc)));
  document.body.append(ov);
  say(`${c.name}. ${c.desc}`);
}

/* ---------- Démarrage ---------- */
async function boot() {
  applySettings();
  try {
    lessons = await loadLessons();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'panel' }, 'Impossible de charger les leçons. Vérifie la connexion puis relance l’app.'));
    return;
  }
  home();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
boot();
