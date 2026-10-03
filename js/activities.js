// Les activités. Chacune affiche une question et appelle finish('ok' | 'partial' | 'fail').
// Règles : seule la consigne est lue automatiquement ; chaque réponse ou étiquette a son 🔊.
// On touche au lieu d'écrire ; pour relier et placer, on peut aussi glisser du doigt
// (toujours avec l'alternative « toucher, puis toucher la cible »). Une erreur n'est jamais punie : indice d'abord,
// puis la réponse est montrée.

import { h, shuffle, pick } from './util.js';
import { say, stop, playMusic, musicPlayer } from './speech.js';
import { P, fill } from './phrases.js';
import { draggable, nearest, flash } from './drag.js';

const MAX_CHOICES = 4;

function ear(text, cls = 'ear') {
  return h('button', {
    class: cls, 'aria-label': 'Écouter',
    onclick: (e) => { e.stopPropagation(); say(text); },
  }, '🔊');
}

// Bouton ▶️ d'un extrait de musique (lessons/music/<nom>.m4a) : jamais lancé tout seul.
export function musicButton(name, label = 'Écouter la musique') {
  const btn = h('button', { class: 'music-btn' });
  const playing = () => musicPlayer.src && !musicPlayer.paused && btn.dataset.on === '1';
  const paint = () => { btn.textContent = playing() ? '⏸ Arrêter la musique' : `🎻 ${label}`; };
  btn.addEventListener('click', async () => {
    if (playing()) { stop(); return; }
    document.querySelectorAll('.music-btn').forEach((b) => { b.dataset.on = ''; });
    btn.dataset.on = '1';
    await playMusic(name);
    paint();
  });
  for (const e of ['play', 'pause', 'ended']) musicPlayer.addEventListener(e, paint);
  paint();
  return btn;
}

// Mot avec ses lettres pièges entre crochets (« en[s]e[m]ble ») : pièges surlignés.
export function spellView(spell, cls = 'spell-word') {
  return h('div', { class: cls }, String(spell).split(/(\[[^\]]*\])/).filter(Boolean).map((p) =>
    p.startsWith('[') ? h('span', { class: 'trap' }, p.slice(1, -1)) : p));
}

// Zone commune : consigne lue + zone de réponse + bandeau de retour.
function frame(root, text, thumb, music) {
  const speech = text;
  const prompt = h('div', { class: 'prompt' },
    thumb ? h('img', { class: 'thumb', src: thumb, alt: '' }) : null,
    h('div', { class: 'text' }, text),
    h('button', { class: 'icon speak', 'aria-label': 'Écouter', onclick: () => say(speech) }, '🔊'));
  const body = h('div', { class: 'col' });
  const fb = h('div');
  root.append(...[prompt, music && musicButton(music), body, fb].filter(Boolean));
  return { body, fb };
}

function feedback(fb, kind, msg, next) {
  fb.replaceChildren(h('div', { class: `feedback ${kind}` },
    h('span', {}, kind === 'ok' ? '⭐' : kind === 'try' ? '💡' : '👉'),
    h('span', { class: 'msg' }, msg),
    next ? h('button', { class: 'primary', onclick: () => { stop(); next(); } }, 'Suivant ➜') : null));
}

// segments : liste de phrases enregistrées, affichées bout à bout.
function finisher(fb, done) {
  return (result, segments) => {
    const segs = segments.filter(Boolean);
    feedback(fb, result === 'fail' ? 'show' : 'ok', segs.join(' '), () => done(result));
    say(segs);
  };
}

function hint(fb, segments) {
  const segs = segments.filter(Boolean);
  feedback(fb, 'try', segs.join(' '));
  say(segs);
}

export function renderStep(item, ctx) {
  ({ qcm, vf, schema, placer, trous, ecrire })[item.type](item, ctx);
}

/* ---------- QCM ---------- */
// Petite illustration à côté de la question, si elle ne porte que sur une notion.
const thumbOf = (item, lesson) => (item.notions.length === 1 ? lesson.img(item.notions[0]) : null);

function qcm(item, { root, lesson, done }) {
  const text = item.sentence ? `${P.completePrefix} ${item.sentence}…` : item.q;
  const { body, fb } = frame(root, text, item.audio ? null : thumbOf(item, lesson), item.audio);
  const finish = finisher(fb, done);
  const choices = shuffle([
    { t: item.choices[0], ok: true },
    ...shuffle(item.choices.slice(1)).slice(0, MAX_CHOICES - 1).map((t) => ({ t, ok: false })),
  ]);
  const full = item.sentence ? `${item.sentence} ${item.choices[0]}.` : null;
  let errors = 0, over = false;

  const rows = choices.map((c) => {
    // Orthographe (`spell`) : pas de 🔊, une faute se lirait comme le bon mot.
    const btn = h('button', { class: item.spell ? 'choice spell' : 'choice' }, c.t);
    btn.addEventListener('click', () => answer(c, btn));
    c.btn = btn;
    return item.spell ? btn : h('div', { class: 'choice-row' }, btn, ear(c.t, 'icon ear-btn'));
  });
  body.append(h('div', { class: item.spell ? 'choices spell-grid' : 'choices' }, rows));

  function answer(c, btn) {
    if (over || btn.disabled) return;
    if (c.ok) {
      over = true;
      btn.classList.add('good');
      finish(errors ? 'partial' : 'ok', [pick(P.bravo), full, item.explain]);
      return;
    }
    errors++;
    btn.disabled = true;
    btn.classList.add('dim');
    if (errors === 1 && choices.length > 2) {
      hint(fb, [pick(P.retry), item.hint]);
    } else {
      over = true;
      const good = choices.find((x) => x.ok);
      good.btn.classList.add('reveal');
      finish('fail', [P.reveal, good.t, full, item.explain]);
    }
  }

  say(text);
}

/* ---------- Vrai / Faux ---------- */
function vf(item, { root, lesson, done }) {
  const text = `${P.vfPrefix} ${item.q}`;
  const { body, fb } = frame(root, text, thumbOf(item, lesson));
  const finish = finisher(fb, done);
  let over = false;
  const key = String(item.answer);
  const make = (val, label) => {
    const b = h('button', { onclick: () => {
      if (over) return;
      over = true;
      if (val === item.answer) {
        b.classList.add('good');
        finish('ok', [pick(P.bravo), P.vfOk[key], item.explain]);
      } else {
        b.classList.add('dim');
        (val ? f : t).classList.add('reveal');
        finish('fail', [P.vfKo[key], item.explain]);
      }
    } }, label);
    return b;
  };
  const t = make(true, '👍 Vrai');
  const f = make(false, '👎 Faux');
  body.append(h('div', { class: 'vf' }, t, f));
  say(text);
}

/* ---------- Schéma à toucher ---------- */
const svgCache = {};
async function loadSvg(url) {
  if (!svgCache[url]) svgCache[url] = await fetch(url).then((r) => r.text());
  return svgCache[url];
}

export async function schemaView(lesson, highlight) {
  const wrap = h('div', { class: 'schema-wrap', html: await loadSvg(lesson.schema.asset) });
  if (new URLSearchParams(location.search).has('zones')) wrap.classList.add('show-zones');
  if (highlight) {
    wrap.classList.add('focus');
    wrap.querySelectorAll(`[data-zone="${highlight}"]`).forEach((z) => z.classList.add('hl'));
  }
  return wrap;
}

async function schema(item, { root, lesson, done }) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
  const wrap = await schemaView(lesson);
  body.append(wrap);
  let errors = 0, over = false;
  const zones = (name) => wrap.querySelectorAll(`[data-zone="${name}"]`);
  const target = lesson.zoneNames[item.target];
  wrap.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zone]');
    if (!z || over) return;
    const name = z.dataset.zone;
    if (name === item.target) {
      over = true;
      zones(name).forEach((el) => el.classList.add('hl'));
      wrap.classList.add('focus');
      finish(errors ? 'partial' : 'ok', [pick(P.bravo), item.explain]);
      return;
    }
    errors++;
    const that = fill(P.zoneThis, lesson.zoneNames[name]);
    zones(name).forEach((el) => { el.classList.remove('flash'); void el.getBBox(); el.classList.add('flash'); });
    if (errors < 2) {
      hint(fb, [that, pick(P.retry)]);
    } else {
      over = true;
      zones(item.target).forEach((el) => el.classList.add('hl'));
      wrap.classList.add('focus');
      finish('fail', [that, fill(P.zoneHere, target), item.explain]);
    }
  });
  say(item.q);
}

/* ---------- Placer : trier, frise, relier, phrase ---------- */
// Tire `sample` étiquettes en alternant les cibles, puis mélange.
function sampleTokens(item) {
  let tokens = item.tokens;
  if (item.sample && tokens.length > item.sample) {
    const byTarget = {};
    shuffle(tokens).forEach((t) => (byTarget[t.target] ||= []).push(t));
    const lists = Object.values(byTarget);
    const out = [];
    for (let i = 0; out.length < item.sample && lists.some((l) => l.length); i++) {
      const l = lists[i % lists.length];
      if (l.length) out.push(l.shift());
    }
    tokens = out;
  }
  return shuffle(tokens).map((t) => ({ ...t, misses: 0 }));
}

const resultOf = (errors) => (errors === 0 ? 'ok' : errors <= 2 ? 'partial' : 'fail');
// Pas de « Bravo » après un échec.
const endSegments = (result, end) => (result === 'fail' ? [end, P.placerFail] : [pick(P.bravo), end]);

function placer(item, ctx) {
  const layout = item.layout || 'tri';
  if (layout === 'relie') return relie(item, ctx);
  if (layout === 'phrase') return phrase(item, ctx);
  triFrise(item, ctx, layout);
}

/* Tri et frise : on touche une étiquette pour la choisir (son 🔊 la lit), puis l'endroit où elle va. */
function triFrise(item, { root, done }, layout) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
  const tokens = sampleTokens(item);
  let selected = null, errors = 0, left = tokens.length;

  const tokenBox = h('div', { class: 'tokens' });
  for (const t of tokens) {
    const b = h('button', { class: 'token', onclick: () => select(t) }, t.text);
    t.btn = b;
    t.wrap = h('span', { class: 'token-wrap' }, b, ear(t.text));
    tokenBox.append(t.wrap);
  }

  const targetEls = {};
  const targets = item.targets;
  const cols = targets.length === 2 || (targets.length === 4 && layout === 'tri') ? 'cols-2' : 'cols-3';
  const targetBox = h('div', { class: `targets ${cols} ${layout}` });
  targets.forEach((tg) => {
    const placed = h('div', { class: 'placed' });
    const style = tg.color ? { background: tg.color + '22', borderColor: tg.color } : {};
    const el = h('div', { class: 'target', role: 'button', style, onclick: () => drop(tg, el) },
      tg.date ? h('span', { class: 'date' }, tg.date) : null,
      tg.label ? h('span', { class: 'tname' }, tg.emoji || '', h('span', { class: 'tlabel' }, tg.label), ear(tg.label)) : null,
      placed);
    el.placed = placed;
    targetEls[tg.id] = el;
    targetBox.append(el);
  });

  if (layout === 'frise') body.append(h('div', { class: 'frise' }, targetBox), tokenBox);
  else body.append(tokenBox, targetBox);

  function select(t) {
    if (t.done) return;
    tokens.forEach((x) => x.btn.classList.remove('selected'));
    Object.values(targetEls).forEach((x) => x.classList.remove('hintglow'));
    selected = t;
    t.btn.classList.add('selected');
    fb.replaceChildren();
    if (t.misses >= 2) targetEls[t.target].classList.add('hintglow');
  }

  function drop(tg, el) {
    if (!selected) return;
    const t = selected;
    if (t.target === tg.id) {
      t.done = true;
      selected = null;
      t.wrap.remove();
      el.classList.remove('hintglow');
      el.placed.append(h('span', {}, t.text));
      if (layout !== 'tri') el.classList.add('good');
      fb.replaceChildren();
      if (--left) { say(pick(P.okSmall)); return; }
      const result = resultOf(errors);
      finish(result, endSegments(result, item.explain || P.placerDone));
      return;
    }
    errors++;
    t.misses++;
    if (t.misses >= 2) targetEls[t.target].classList.add('hintglow');
    hint(fb, [t.misses >= 2 ? P.placerGlow : P.placerHere]);
  }

  say(item.q);
}

/* ---------- Relier : mots à gauche, définitions à droite ----------
   On trace un trait du doigt depuis un mot jusqu'à sa définition,
   ou on touche le mot puis la définition. Rien ne bouge à l'écran. */
const PAIR_COLORS = ['#1f8fbf', '#d6457a', '#2f9e6a', '#9a6b2f', '#138a8a', '#b0413e']; // ni violet (sélection) ni orange (erreur)
const WRONG = '#e89a1c';
const SVGNS = 'http://www.w3.org/2000/svg';

function relie(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
  const words = sampleTokens(item);
  const defs = shuffle(item.targets.filter((tg) => words.some((w) => w.target === tg.id))).map((tg) => ({ ...tg }));
  let selected = null, errors = 0, left = words.length, finished = false, colorIdx = 0, temp = null;
  const pairs = [];

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.classList.add('relie-lines');
  svg.setAttribute('aria-hidden', 'true');
  const board = h('div', { class: 'relie-board' }, svg);
  for (let i = 0; i < Math.max(words.length, defs.length); i++) {
    board.append(words[i] ? wordRow(words[i]) : h('div'), defs[i] ? defRow(defs[i]) : h('div'));
  }
  body.append(board);

  function wordRow(w) {
    w.dot = h('span', { class: 'dot' });
    w.el = h('button', { class: 'relie-card relie-word' }, h('span', { class: 'relie-text' }, w.text), w.dot);
    draggable(w.el, {
      can: () => !w.done && !finished,
      tap: () => select(w),
      start: () => startDrag(w),
      move: (x, y) => dragMove(w, x, y),
      end: (x, y) => dragEnd(w, x, y),
      cancel: clearTemp,
    });
    return h('div', { class: 'relie-row words' }, ear(w.text), w.el);
  }

  function defRow(d) {
    d.dot = h('span', { class: 'dot' });
    d.el = h('div', { class: 'relie-card relie-def', role: 'button', onclick: () => tapDef(d) },
      d.dot, h('span', { class: 'relie-text' }, d.label));
    return h('div', { class: 'relie-row defs' }, d.el, ear(d.label));
  }

  // Coordonnées dans le repère du plateau (le calque SVG le recouvre exactement).
  const pt = (el) => {
    const b = board.getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top];
  };
  const setLine = (l, [x1, y1], [x2, y2]) => {
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  };
  const line = (a, b, color, cls) => {
    const l = document.createElementNS(SVGNS, 'line');
    l.style.stroke = color;
    if (cls) l.classList.add(cls);
    setLine(l, a, b);
    svg.append(l);
    return l;
  };

  // Les traits suivent la mise en page (rotation de l'iPad, police chargée…).
  const redraw = () => pairs.forEach((p) => setLine(p.line, pt(p.w.dot), pt(p.d.dot)));
  const ro = new ResizeObserver(() => { if (!board.isConnected) return ro.disconnect(); redraw(); });
  ro.observe(board);
  const onResize = () => { if (!board.isConnected) return window.removeEventListener('resize', onResize); redraw(); };
  window.addEventListener('resize', onResize);

  const openDefs = () => defs.filter((d) => !d.done);

  function mark(w) {
    words.forEach((x) => x.el.classList.remove('selected'));
    defs.forEach((d) => d.el.classList.remove('hintglow'));
    selected = w;
    if (!w) return;
    w.el.classList.add('selected');
    if (w.misses >= 2) defs.find((d) => d.id === w.target).el.classList.add('hintglow');
  }

  function select(w) {
    if (w.done || finished) return;
    fb.replaceChildren();
    mark(selected === w ? null : w);
  }

  function tapDef(d) {
    if (d.done || finished) return;
    if (!selected) { hint(fb, [P.pickWord]); return; }
    tryPair(selected, d);
  }

  function startDrag(w) {
    fb.replaceChildren();
    mark(w);
    temp = line(pt(w.dot), pt(w.dot), 'var(--primary)', 'temp');
  }

  function dragMove(w, x, y) {
    if (!temp) return;
    const b = board.getBoundingClientRect();
    setLine(temp, pt(w.dot), [x - b.left, y - b.top]);
    const t = nearest(openDefs().map((d) => d.el), x, y);
    defs.forEach((d) => d.el.classList.toggle('over', d.el === t));
  }

  function clearTemp() {
    if (temp) temp.remove();
    temp = null;
    defs.forEach((d) => d.el.classList.remove('over'));
  }

  function dragEnd(w, x, y) {
    const t = nearest(openDefs().map((d) => d.el), x, y);
    clearTemp();
    if (!t) { mark(null); return; }
    tryPair(w, defs.find((d) => d.el === t));
  }

  function tryPair(w, d) {
    if (w.target === d.id) {
      const color = PAIR_COLORS[colorIdx++ % PAIR_COLORS.length];
      w.done = d.done = true;
      mark(null);
      for (const el of [w.el, d.el]) {
        el.classList.add('paired');
        el.style.borderColor = color;
        el.style.background = color + '26';
        el.style.setProperty('--pair', color);
      }
      w.el.setAttribute('aria-disabled', 'true');
      pairs.push({ w, d, line: line(pt(w.dot), pt(d.dot), color, 'pair') });
      fb.replaceChildren();
      if (--left) { say(pick(P.okSmall)); return; }
      finished = true;
      const result = resultOf(errors);
      finish(result, endSegments(result, item.explain || P.relieDone));
      return;
    }
    errors++;
    w.misses++;
    const l = line(pt(w.dot), pt(d.dot), WRONG, 'wrong');
    setTimeout(() => l.remove(), 900);
    flash(d.el, 'miss');
    mark(w); // le mot reste choisi : on peut toucher une autre définition
    hint(fb, [w.misses >= 2 ? P.placerGlow : P.placerHere]);
  }

  say(item.q);
}

/* ---------- Phrase : on glisse chaque morceau dans la case 1, 2, 3… ----------
   Ou on touche le morceau, puis la case. */
function phrase(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const blocks = sampleTokens(item);
  const slots = item.targets.map((tg, i) => ({ ...tg, n: i + 1 }));
  let selected = null, errors = 0, left = blocks.length, finished = false;
  let ghost = null, g0 = null;

  const slotRow = h('div', { class: `phrase-slots n${slots.length}` });
  for (const s of slots) {
    s.text = h('span', { class: 'slot-text' });
    s.el = h('div', { class: 'slot', role: 'button', onclick: () => tapSlot(s) },
      h('span', { class: 'num' }, String(s.n)), s.text);
    slotRow.append(s.el);
  }

  const pool = h('div', { class: 'phrase-pool' });
  for (const b of blocks) {
    b.el = h('button', { class: 'token block' }, b.text);
    b.cell = h('div', { class: 'pool-cell' }, b.el, ear(b.text));
    draggable(b.el, {
      can: () => !b.done && !finished,
      tap: () => select(b),
      start: (x, y) => lift(b, x, y),
      move: (x, y) => moveGhost(x, y),
      end: (x, y) => dropGhost(b, x, y),
      cancel: () => { sendBack(b); mark(null); },
    });
    pool.append(b.cell);
  }
  body.append(slotRow, pool);

  const openSlots = () => slots.filter((s) => !s.done);

  function mark(b) {
    blocks.forEach((x) => x.el.classList.remove('selected'));
    slots.forEach((s) => s.el.classList.remove('hintglow'));
    selected = b;
    if (!b) return;
    b.el.classList.add('selected');
    if (b.misses >= 2) slots.find((s) => s.id === b.target).el.classList.add('hintglow');
  }

  function select(b) {
    if (b.done || finished) return;
    fb.replaceChildren();
    mark(selected === b ? null : b);
  }

  function tapSlot(s) {
    if (s.done || finished) return;
    if (!selected) { hint(fb, [P.pickBlock]); return; }
    place(selected, s);
  }

  // Bloc fantôme qui suit le doigt ; le vrai bloc reste à sa place, estompé.
  function lift(b, x, y) {
    fb.replaceChildren();
    mark(b);
    const r = b.el.getBoundingClientRect();
    ghost = h('div', { class: 'drag-ghost' }, b.text);
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, minHeight: `${r.height}px` });
    document.body.append(ghost);
    g0 = { r, x, y };
    b.el.classList.add('lifted');
  }

  // Centre du fantôme : c'est lui qu'on dépose, pas le bout du doigt.
  const ghostCenter = (x, y) => [g0.r.left + g0.r.width / 2 + (x - g0.x), g0.r.top + g0.r.height / 2 + (y - g0.y)];

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.transform = `translate(${x - g0.x}px, ${y - g0.y}px) scale(1.05)`;
    const t = nearest(openSlots().map((s) => s.el), ...ghostCenter(x, y));
    slots.forEach((s) => s.el.classList.toggle('over', s.el === t));
  }

  function dropGhost(b, x, y) {
    slots.forEach((s) => s.el.classList.remove('over'));
    const t = ghost ? nearest(openSlots().map((s) => s.el), ...ghostCenter(x, y)) : null;
    if (!t) { sendBack(b); mark(null); return; }
    place(b, slots.find((s) => s.el === t));
  }

  // Retour animé du fantôme à la place du bloc.
  function sendBack(b) {
    slots.forEach((s) => s.el.classList.remove('over'));
    const g = ghost;
    ghost = null;
    if (!g) { b.el.classList.remove('lifted'); return; }
    g.classList.add('back');
    g.style.transform = 'translate(0, 0)';
    setTimeout(() => { g.remove(); b.el.classList.remove('lifted'); }, 320);
  }

  function place(b, s) {
    if (b.target === s.id) {
      if (ghost) { ghost.remove(); ghost = null; }
      b.done = s.done = true;
      mark(null);
      b.el.classList.remove('lifted');
      b.cell.classList.add('used'); // la place reste vide mais garde sa taille
      s.text.textContent = b.text;
      s.el.classList.add('good', 'filled');
      fb.replaceChildren();
      if (--left) { say(pick(P.okSmall)); return; }
      finished = true;
      // La phrase entière, d'un seul tenant, puis lue.
      const full = item.targets.map((x) => item.tokens.find((k) => k.target === x.id).text).join(' ');
      slotRow.replaceWith(h('div', { class: 'phrase-full' }, h('span', { class: 'phrase-text' }, full), ear(full)));
      pool.remove();
      // La phrase est déjà affichée au-dessus : le bandeau ne garde que le mot d'encouragement.
      const result = resultOf(errors);
      const segs = endSegments(result, full);
      feedback(fb, result === 'fail' ? 'show' : 'ok', segs.filter((s) => s !== full).join(' '), () => done(result));
      say(segs);
      return;
    }
    errors++;
    b.misses++;
    sendBack(b);
    flash(s.el, 'miss');
    mark(b);
    hint(fb, [b.misses >= 2 ? P.placerGlow : P.placerHere]);
  }

  say(item.q);
}

/* ---------- Dictée à trous ---------- */
// Chaque phrase de `text` a des trous « [bon|faux|faux] » (le bon en premier). On touche un trou,
// puis la bonne orthographe. Les choix n'ont pas de 🔊 : une faute se lirait comme le bon mot.
const BLANK = /\[([^\]]+)\]/g;
export const trousSentence = (line) => line.replace(BLANK, (m, opts) => opts.split('|')[0]);

function trous(item, { root, done }) {
  const text = item.q || P.trousPrompt;
  const { body, fb } = frame(root, text);
  const sentences = item.text.map(trousSentence);
  const blanks = [];
  let active = null, errors = 0, revealed = 0;

  const lines = item.text.map((line, i) => {
    const row = h('div', { class: 'trous-line' });
    const words = h('div', { class: 'trous-text' });
    for (const part of line.split(/(\[[^\]]+\])/).filter(Boolean)) {
      if (!part.startsWith('[')) { words.append(part); continue; }
      const opts = part.slice(1, -1).split('|');
      const b = { good: opts[0], opts, misses: 0, done: false, row };
      b.el = h('button', { class: 'blank', onclick: () => open(b) }, '?');
      blanks.push(b);
      words.append(b.el);
    }
    row.append(words, ear(sentences[i]));
    return row;
  });
  const picker = h('div', { class: 'trous-picker' });
  body.append(h('div', { class: 'trous' }, lines));

  function open(b) {
    if (b.done) return;
    if (active) active.el.classList.remove('selected');
    active = b;
    b.el.classList.add('selected');
    fb.replaceChildren();
    picker.replaceChildren(...shuffle(b.opts).map((o) => {
      const btn = h('button', { class: 'choice spell' }, o);
      btn.addEventListener('click', () => answer(b, o, btn));
      return btn;
    }));
    b.row.after(picker);
  }

  function answer(b, o, btn) {
    if (b.done || btn.disabled) return;
    if (o === b.good) { fill(b, 'good'); say(pick(P.okSmall)); return next(); }
    errors++;
    b.misses++;
    btn.disabled = true;
    btn.classList.add('dim');
    if (b.misses === 1 && b.opts.length > 2) { hint(fb, [pick(P.retry)]); return; }
    revealed++;
    fill(b, 'reveal');
    next();
  }

  function fill(b, cls) {
    b.done = true;
    b.el.textContent = b.good;
    b.el.classList.remove('selected');
    b.el.classList.add(cls);
    picker.remove();
    active = null;
  }

  function next() {
    const b = blanks.find((x) => !x.done);
    if (b) { open(b); return; }
    // Texte long : un trou révélé sur quatre est toléré (réussite partielle).
    const result = revealed > Math.floor(blanks.length / 4) ? 'fail' : errors ? 'partial' : 'ok';
    const msg = result === 'fail' ? P.placerFail : pick(P.bravo);
    feedback(fb, result === 'fail' ? 'show' : 'ok', msg, () => done(result));
    say([msg, ...sentences]);
  }

  say(text);
  open(blanks[0]);
}

/* ---------- Écrire un mot au clavier ---------- */
// Seule activité où l'on tape : réservée aux mots d'orthographe à apprendre.
// mode « copie » : le mot est affiché ; « memo » : on le regarde, on le cache, on l'écrit ;
// « dictee » : on l'entend seulement. Deux erreurs : le mot est montré et on le recopie.
const noAccent = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const tidy = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/’/g, "'");

// Alignement lettre à lettre (distance d'édition) : lettres justes en vert, le reste en orange,
// une lettre manquante = une case orange vide. La bonne lettre n'est jamais montrée.
function diffView(typed, good) {
  const a = [...typed], b = [...good];
  const d = a.map(() => []);
  d.push([]);
  for (let i = 0; i <= a.length; i++) {
    for (let j = 0; j <= b.length; j++) {
      d[i][j] = !i ? j : !j ? i : Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const out = [];
  let i = a.length, j = b.length;
  while (i || j) {
    if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      out.unshift({ c: a[i - 1], k: a[i - 1] === b[j - 1] ? 'ok' : 'bad' }); i--; j--;
    } else if (i && d[i][j] === d[i - 1][j] + 1) {
      out.unshift({ c: a[i - 1], k: 'bad' }); i--;
    } else {
      out.unshift({ c: '', k: 'gap' }); j--;
    }
  }
  return h('div', { class: 'diff-word' }, out.map((o) => h('span', { class: o.k }, o.c || ' ')));
}

function ecrire(item, { root, lesson, done }) {
  const notion = lesson.notionById[item.notions[0]] || {};
  const word = item.word;
  const mode = item.mode || 'dictee';
  const shown = mode === 'dictee' ? P.writeHear : mode === 'memo' ? P.writeMemo : P.writeCopy;
  let speech = mode === 'dictee' ? [P.writeWord, word, item.say] : [shown, word];
  const label = h('div', { class: 'text' }, shown);
  let errors = 0, copying = false, over = false;

  const prompt = h('div', { class: 'prompt' },
    mode === 'dictee' && lesson.img(notion.id) ? h('img', { class: 'thumb', src: lesson.img(notion.id), alt: '' }) : null,
    label,
    h('button', { class: 'icon speak', 'aria-label': 'Écouter', onclick: () => say(copying ? [P.writeCopyNow, word] : speech) }, '🔊'));
  const model = h('div', { class: 'write-model' });
  const input = h('input', {
    class: 'write-input', type: 'text', lang: 'fr', autocomplete: 'off', autocorrect: 'off',
    autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Écris le mot',
  });
  const ok = h('button', { class: 'primary big', onclick: () => check() }, 'Valider ✔');
  const inputRow = h('div', { class: 'write-row' }, input, ok);
  const diff = h('div', { class: 'write-diff' });
  const fb = h('div');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  root.append(prompt, model, inputRow, diff, fb);
  const fin = finisher(fb, done);

  const showModel = () => model.replaceChildren(spellView(notion.spell || word));
  if (mode !== 'dictee') showModel();
  if (mode === 'memo') {
    inputRow.hidden = true;
    model.append(h('button', { class: 'big', onclick: () => {
      model.replaceChildren(h('div', { class: 'spell-word hidden-word' }, '🙈'));
      inputRow.hidden = false;
      input.focus();
      label.textContent = P.writeNow;
      speech = [P.writeNow];
      say(P.writeNow);
    } }, '🙈 Je l’ai dans la tête'));
  } else {
    input.focus();
  }

  function check() {
    if (over) return;
    const v = tidy(input.value);
    if (!v) { hint(fb, [P.writeEmpty]); input.focus(); return; }
    if (v === word) {
      over = true;
      input.classList.add('good');
      input.readOnly = true;
      input.blur();
      diff.replaceChildren();
      model.replaceChildren(spellView(notion.spell || word));
      fin(copying ? 'fail' : errors ? 'partial' : 'ok', copying ? [P.writeCopyOk, item.say] : [pick(P.bravo), item.say]);
      return;
    }
    errors++;
    diff.replaceChildren(diffView(v, word));
    if (copying || errors === 1) {
      const why = v.toLowerCase() === word.toLowerCase() ? P.writeCapital
        : noAccent(v) === noAccent(word) ? P.writeAccent : P.writeAlmost;
      hint(fb, [why, copying || why !== P.writeAlmost ? null : notion.tip]);
      input.focus();
      return;
    }
    // Deuxième erreur : on montre le mot, avec ses pièges, et on le recopie.
    copying = true;
    showModel();
    input.value = '';
    hint(fb, [P.writeCopyNow, word]);
    input.focus();
  }

  say(speech);
}
