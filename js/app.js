import { h, cap, pick } from './util.js';
import { state, save } from './store.js';
import { say, sayAll, stop, unlock, loadAudio } from './speech.js';
import { P, loadPhrases } from './phrases.js';
import { loadLessons, loadCompanions } from './lessons.js';
import { buildSession, grade, markSeen, ns, lessonProgress, dueCount, bestLesson, retryItem } from './srs.js';
import { renderStep, schemaView, spellView, musicButton } from './activities.js';
import { starsForSession, addStars, recordDay, checkCards, setCompanions, current, stageName, companionArt, graduate, adultName, speciesOf, companionsView } from './rewards.js';
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
  return state.companion.name || (current().stage < 2 ? 'Mon œuf' : 'Mon compagnon');
}

/* ---------- Accueil ---------- */
function home() {
  applySettings();
  const stars = state.companion.stars;
  const cur = current();
  const { next, stage } = cur;
  const pct = next ? Math.round(((cur.rel - cur.prevAt) / (next.at - cur.prevAt)) * 100) : 100;
  const nextName = stage === 1 ? 'l’éclosion' : next && stageName(cur.sp, stage + 1); // l'espèce reste une surprise
  const newEgg = state.companion.isNew;
  if (newEgg) { delete state.companion.isNew; save(); }

  const gear = h('button', { class: 'parent-gear', 'aria-label': 'Espace parent' }, '⚙️');
  let timer;
  const startPress = () => { timer = setTimeout(() => parentGate(lessons, home), 1500); };
  const endPress = () => clearTimeout(timer);
  gear.addEventListener('pointerdown', startPress);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => gear.addEventListener(e, endPress));

  const best = bestLesson(lessons);
  const tiles = lessons.map((L) => {
    const due = dueCount(L);
    return h('div', { class: 'panel lesson-tile', style: `--c: ${L.color}` },
      h('div', { class: 'row' },
        h('span', { class: 'emoji' }, L.emoji),
        h('div', {},
          h('div', { class: 'subject' }, L.subject),
          h('h3', {}, L.title))),
      h('div', { class: 'meter' }, h('span', { style: { width: `${Math.round(lessonProgress(L) * 100)}%` } })),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => start(L) }, due ? '▶ Réviser' : '▶ S’entraîner'),
        h('button', { onclick: () => listen(L) }, '🎧 Écouter')));
  });

  screen(
    gear,
    h('div', { class: 'home-top' },
      h('div', { class: 'companion', onclick: () => say([stageName(cur.sp, stage), P.companionMore]), html: companionArt(cur.sp.id, stage) }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        newEgg ? h('div', { class: 'panel new-egg' }, '🥚 Un nouvel œuf est arrivé !') : null,
        h('div', { class: 'row' },
          h('span', { class: 'companion-name' }, companionName()),
          stage < 2 && !state.companion.name ? null
            : state.companion.name ? h('button', { class: 'icon ghost', 'aria-label': 'Changer le nom', onclick: rename }, '✏️')
              : h('button', { class: 'primary', onclick: rename }, '✏️ Choisis son nom')),
        h('div', { class: 'stars' }, h('b', {}, '★ '), `${stars} étoiles`),
        next ? h('div', {}, h('div', { class: 'meter' }, h('span', { style: { width: `${pct}%` } })),
          h('div', { class: 'muted' }, `Encore ${next.at - cur.rel} étoiles pour : ${nextName}`))
          : h('div', {}, '👑 Termine une séance : il rejoindra ta collection !'),
        h('div', { class: 'row' },
          best ? h('button', { class: 'primary big', onclick: () => start(best) }, '▶ C’est parti !') : null,
          h('button', { class: 'big', onclick: album }, '🃏 Mon album')))),
    h('h2', {}, 'Mes leçons'),
    h('div', { class: 'lessons' }, tiles),
  );
  if (newEgg) say(P.newEgg);
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
      L.img(n.id) ? h('img', { class: 'discover-img', src: L.img(n.id), alt: '' }) : h('div', { class: 'big-emoji' }, n.emoji || '📘'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        tag,
        n.spell ? spellView(n.spell) : h('div', { class: 'term' }, cap(n.term)),
        h('div', { class: 'def' }, cap(n.def) + '.'),
        n.tip ? h('div', { class: 'tip' }, `💡 ${n.tip}`) : null));
    const text = `${cap(n.nom || n.term)} : ${n.def}.`;
    screen(bar(), card,
      n.audio ? musicButton(n.audio) : null,
      n.zone && L.schema ? await schemaView(L, n.zone) : null,
      h('div', { class: 'row' },
        h('button', { class: 'icon', onclick: () => say([text, n.tip]) }, '🔊'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary big', onclick: () => { markSeen(L, n.id); next(); } }, 'J’ai compris 👍')));
    say([P.newWord, text, n.tip]);
  }

  function show(item) {
    const root = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });
    screen(bar(), root);
    const level = Math.min(...item.notions.map((id) => ns(L, id).level));
    renderStep(item, {
      root, lesson: L, level,
      done: (result) => {
        grade(L, item.notions, result, item.id);
        if (result === 'fail' && !requeued.has(item.id)) {
          // La notion reviendra à la fin de la séance (autre question si possible), sans compter une case de plus.
          const again = retryItem(L, item);
          requeued.add(item.id).add(again.id);
          steps.push({ kind: 'item', item: again, retry: true });
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
    // Compagnon au dernier stade : il rejoint la collection, un nouvel œuf arrive.
    const adult = graduate();
    const cur = current();
    const hatched = grew && !adult && cur.stage === 2;
    const lines = [P.endStars];
    if (adult) lines.push(P.endAdult, P.adultJoins);
    else if (grew) lines.push(hatched ? P.endHatched : P.endGrew, stageName(cur.sp, cur.stage));
    if (hatched && !state.companion.name) lines.push(P.chooseName);
    if (cards.length) lines.push(cards.length > 1 ? P.endCards : P.endCard, ...cards.map((c) => c.name));
    lines.push(P.endPause);
    screen(
      h('div', { class: 'center' },
        h('h1', {}, pick(['Séance terminée !', 'Mission accomplie !', 'Bien joué !'])),
        h('div', { class: 'stars' }, h('b', {}, '★ '), `+${earned} étoiles`),
        h('div', { class: 'companion', style: { width: '220px' }, html: adult ? companionArt(adult.species, 4) : companionArt(cur.sp.id, cur.stage) }),
        adult ? [h('h2', {}, `🎉 ${adultName(adult)} est devenu${speciesOf(adult.species).fem ? 'e' : ''} adulte !`),
          h('p', {}, `${speciesOf(adult.species).fem ? 'Elle' : 'Il'} rejoint ta collection. Un nouvel œuf t’attend !`),
          h('button', { onclick: companionsPage }, '🐉 Mes compagnons')]
          : hatched ? [h('h2', {}, `🐣 Ton œuf a éclos : ${stageName(cur.sp, cur.stage)} !`),
            state.companion.name ? null : h('button', { class: 'primary', onclick: rename }, '✏️ Choisis son nom')]
            : grew ? h('h2', {}, `${companionName()} a grandi !`) : null,
        cards.length ? h('div', { class: 'new-cards' }, cards.map((c) => cardEl(c, true, L))) : null,
        h('p', { class: 'muted' }, '🌿 Fais une petite pause : bois un verre d’eau, étire-toi.'),
        h('button', { class: 'primary big', onclick: home }, '🏠 Retour')));
    say(lines);
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
    ...paras,
    L.music ? h('div', { class: 'row' }, L.music.map((m) => musicButton(m.file, m.label))) : null,
    L.credits ? h('p', { class: 'muted credits' }, L.credits) : null);
  play(0);
}

/* ---------- Album de cartes ---------- */
function cardArt(c, L) {
  const url = L && L.img(c.image);
  return url ? h('img', { class: 'art-img', src: url, alt: '' }) : h('div', { class: 'art' }, c.emoji);
}

function cardEl(c, owned, L) {
  return h('div', { class: `pcard ${owned ? '' : 'locked'} ${c.legend ? 'legend' : ''}`, style: { background: c.color } },
    owned ? cardArt(c, L) : h('div', { class: 'art' }, '❓'),
    h('div', {}, owned ? c.name : '???'));
}

function album() {
  const all = lessons.flatMap((L) => (L.cards || []).map((c) => ({ ...c, L })));
  const owned = all.filter((c) => state.cards.includes(c.id)).length;
  screen(
    h('div', { class: 'row' }, backBtn(), h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: companionsPage }, '🐉 Mes compagnons')),
    h('h1', {}, `🃏 Mon album — ${owned} / ${all.length}`),
    ...lessons.map((L) => [
      h('h2', {}, `${L.emoji} ${L.title}`),
      h('div', { class: 'album' }, (L.cards || []).map((c) => {
        const has = state.cards.includes(c.id);
        const el = cardEl(c, has, L);
        el.addEventListener('click', () => {
          if (has) return zoom(c, L);
          say(c.notions === 'all' ? P.cardLockedAll : [P.cardLocked, ...c.notions.map((id) => cap(L.notionById[id].term))]);
        });
        return el;
      })),
    ]).flat());
  say(P.album);
}

/* ---------- Mes compagnons ---------- */
function companionsPage() {
  screen(h('div', { class: 'row' }, backBtn(), backBtn('🃏 Mon album', album)), companionsView());
  say(P.companions);
}

function zoom(c, L) {
  const ov = h('div', { class: 'overlay', onclick: () => { stop(); ov.remove(); } },
    h('div', { class: 'center' },
      h('div', { class: `pcard big ${c.legend ? 'legend' : ''}`, style: { background: c.color } },
        cardArt(c, L), h('div', {}, c.name)),
      h('div', { class: 'panel' }, c.desc)));
  document.body.append(ov);
  say([c.name, c.desc]);
}

/* ---------- Démarrage ---------- */
async function boot() {
  applySettings();
  try {
    await Promise.all([loadPhrases(), loadAudio()]);
    lessons = await loadLessons();
    setCompanions(await loadCompanions().catch(() => ({ id: 'companions', species: [], img: () => null })));
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
