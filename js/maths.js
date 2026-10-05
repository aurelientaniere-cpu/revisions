// Activités de calcul (leçons de maths, exercices générés par tools/maths.py).
// Pensé pour la dyscalculie : le boulier montre les quantités (deux lignes de 10, par paquets de 5),
// chaque nombre d'un calcul a la couleur de ses boules, on touche la réponse parmi 4 (jamais de clavier),
// pas de chrono. Le boulier est affiché tant que la notion est fragile (niveau 0 ou 1), puis seulement
// en indice après une erreur : du concret vers l'abstrait.

import { h, shuffle, pick } from './util.js';
import { say } from './speech.js';
import { P } from './phrases.js';
import { frame, finisher, hint, feedback, ear } from './activities.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/* ---------- Écriture d'un calcul ---------- */
// expr : ["8|a", "+", "5|b", "=", "?"] ; « |a » donne la couleur des boules du premier nombre, « ? » est la case à trouver.
export function exprView(expr, cls = 'calc') {
  return h('div', { class: cls }, expr.map((t) => {
    if (t === '?') return h('span', { class: 'hole' }, '?');
    if (t === '+' || t === '=' || t === '−') return h('span', { class: 'op' }, t);
    const [n, c] = t.split('|');
    return h('span', { class: `n${c ? ` c${c}` : ''}` }, n);
  }));
}

// Arbre de la fiche : 10 en haut, relié aux trois nombres du bas.
function treeView(item) {
  const terms = item.expr.filter((t) => t !== '+' && t !== '=').slice(0, -1);
  const lines = svg('svg', { class: 'tree-lines', viewBox: '0 0 520 60', preserveAspectRatio: 'none' });
  for (const x of [73, 260, 447]) lines.append(svg('line', { x1: 260, y1: 0, x2: x, y2: 60 }));
  const row = h('div', { class: 'tree-row' });
  terms.forEach((t, i) => {
    if (i) row.append(h('span', { class: 'op' }, '+'));
    row.append(h('div', { class: 'tree-box' }, exprView([t], 'calc inline')));
  });
  return h('div', { class: 'tree' }, h('div', { class: 'tree-top' }, item.tree.top), lines, row);
}

/* ---------- Boulier ---------- */
// Deux tiges de 10 boules ; les boules comptées sont poussées à gauche, les autres attendent à droite.
// Un petit espace après la 5e boule : on voit 5 sans compter.
const R = 21, STEP = 46, GAP5 = 14, SLIDE = 74, LEFT = 34, ROW = 60, TOP = 14;
const WIDTH = LEFT * 2 + 9 * STEP + GAP5 + SLIDE;
const COLORS = { a: '#4f8fd0', b: '#e8875b', c: '#4f9e78', a2: '#9cc3ea', off: '#efe8da' };
const beadX = (i, counted) => LEFT + i * STEP + (i >= 5 ? GAP5 : 0) + (counted ? 0 : SLIDE);
const rowY = (r) => TOP + r * ROW + ROW / 2;

function frameSvg(rows) {
  const s = svg('svg', { class: 'boulier', viewBox: `0 0 ${WIDTH} ${TOP * 2 + rows * ROW}`, role: 'img', 'aria-label': 'Boulier' });
  s.append(svg('rect', { class: 'b-frame', x: 4, y: 4, width: WIDTH - 8, height: TOP * 2 + rows * ROW - 8, rx: 18 }));
  for (let r = 0; r < rows; r++) s.append(svg('line', { class: 'b-rod', x1: 8, x2: WIDTH - 8, y1: rowY(r), y2: rowY(r) }));
  return s;
}

function bead(s) {
  const c = svg('circle', { class: 'bead', r: R, cx: 0, cy: 0 });
  s.append(c);
  return c;
}
const place = (c, x, y, color) => {
  c.style.transform = `translate(${x}px, ${y}px)`;
  c.style.fill = color;
};

// Boulier fixe : parts = [8, 5] → 8 boules bleues, puis 5 orange (la première ligne se remplit d'abord).
export function boulierView(parts) {
  const total = parts.reduce((a, b) => a + b, 0);
  const rows = total > 10 ? 2 : 1;
  const s = frameSvg(rows);
  const colorOf = (g) => {
    let k = g;
    for (let p = 0; p < parts.length; p++) { if (k < parts[p]) return COLORS['abc'[p]]; k -= parts[p]; }
    return COLORS.off;
  };
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 10; i++) {
      const g = r * 10 + i;
      const counted = g < total;
      place(bead(s), beadX(i, counted), rowY(r), colorOf(g));
    }
  }
  return h('div', { class: 'boulier-wrap' }, s);
}

// Boulier à manipuler : toucher une boule de droite la pousse à gauche (avec celles d'avant),
// toucher une boule de gauche la renvoie à droite (avec celles d'après). On peut viser large :
// c'est la boule la plus proche du doigt, sur la tige la plus proche, qui bouge.
function boulierInput() {
  const s = frameSvg(2);
  const counts = [0, 0];
  const beads = [0, 1].map(() => Array.from({ length: 10 }, () => bead(s)));
  const paint = () => beads.forEach((row, r) => row.forEach((c, i) =>
    place(c, beadX(i, i < counts[r]), rowY(r), i < counts[r] ? (i < 5 ? COLORS.a : COLORS.a2) : COLORS.off)));
  s.addEventListener('click', (e) => {
    const pt = s.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(s.getScreenCTM().inverse());
    const r = p.y < TOP + ROW ? 0 : 1;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 10; i++) {
      const d = Math.abs(beadX(i, i < counts[r]) - p.x);
      if (d < bd) { bd = d; best = i; }
    }
    counts[r] = best < counts[r] ? best : best + 1;
    paint();
  });
  paint();
  return {
    el: h('div', { class: 'boulier-wrap input' }, s),
    total: () => counts[0] + counts[1],
    set: (n) => { counts[0] = Math.min(10, n); counts[1] = Math.max(0, n - 10); paint(); },
  };
}

/* ---------- Choisir un nombre ---------- */
function numChoices(list, onPick) {
  return h('div', { class: 'num-choices' }, shuffle(list).map((t) => {
    const btn = h('button', { class: 'choice num' }, t);
    btn.addEventListener('click', () => onPick(t, btn));
    return h('div', { class: 'choice-row' }, btn, ear(t, 'icon ear-btn'));
  }));
}

/* ---------- Calcul : trouver le nombre caché ---------- */
export function calcul(item, { root, level, done }) {
  const { body, fb } = frame(root, item.say);
  const finish = finisher(fb, done);
  const eq = item.tree ? treeView(item) : exprView(item.expr);
  const hole = eq.querySelector('.hole');
  const visual = h('div', { class: 'boulier-slot' });
  const showBeads = () => { if (item.beads && !visual.firstChild) visual.append(boulierView(item.beads)); };
  if (level <= 1) showBeads();
  let errors = 0, over = false;
  const buttons = [];
  const grid = numChoices(item.choices, (t, btn) => {
    if (over || btn.disabled) return;
    if (t === item.answer) {
      over = true;
      btn.classList.add('good');
      fillHole(hole, t, 'good');
      finish(errors ? 'partial' : 'ok', [pick(P.bravo), item.explain]);
      return;
    }
    errors++;
    btn.disabled = true;
    btn.classList.add('dim');
    showBeads();
    if (errors === 1) { hint(fb, [pick(P.retry), item.hint]); return; }
    over = true;
    buttons.find((b) => b.textContent === item.answer)?.classList.add('reveal');
    fillHole(hole, item.answer, 'reveal');
    finish('fail', [P.reveal, item.answer, item.explain]);
  });
  buttons.push(...grid.querySelectorAll('button.num'));
  body.append(eq, visual, grid);
  say(item.say);
}

function fillHole(hole, t, cls) {
  hole.textContent = t;
  hole.classList.add(cls);
}

/* ---------- Boulier : montrer un nombre ---------- */
export function boulier(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
  const input = boulierInput();
  let errors = 0, over = false;
  const ok = h('button', { class: 'primary big', onclick: check }, '✓ C’est fait');
  body.append(
    item.parts ? exprView([String(item.parts[0]), '+', String(item.parts[1])]) : h('div', { class: 'calc' }, h('span', { class: 'n' }, item.target)),
    input.el,
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), ok));

  function check() {
    if (over) return;
    const n = input.total();
    if (n === item.target) {
      over = true;
      ok.remove();
      finish(errors ? 'partial' : 'ok', [pick(P.bravo), item.explain]);
      return;
    }
    errors++;
    if (errors < 2) {
      hint(fb, [n > item.target ? P.boulierTooMany : P.boulierTooFew, item.target > 10 ? P.boulierRow : null]);
      return;
    }
    over = true;
    ok.remove();
    input.set(item.target);
    finish('fail', [P.boulierShow, item.explain]);
  }
  say(item.q);
}

// Nouvelle consigne au milieu d'un exercice : texte affiché et bouton 🔊.
function setPrompt(root, text) {
  root.querySelector('.prompt .text').textContent = text;
  const old = root.querySelector('.prompt .speak');
  old.replaceWith(h('button', { class: 'icon speak', 'aria-label': 'Écouter', onclick: () => say(text) }, '🔊'));
}

/* ---------- Les amis de 10 dans un long calcul (fiche) ---------- */
// 1) toucher les deux nombres qui font 10 ; 2) 10 + (ce qui reste) ; 3) le résultat.
export function amis10(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  let errors = 0, picked = null, pairMisses = 0, step = 1;
  const terms = item.terms.map((n, i) => ({ n, i }));
  const line = h('div', { class: 'calc amis' });
  terms.forEach((t, k) => {
    if (k) line.append(h('span', { class: 'op' }, '+'));
    t.el = h('button', { class: 'amis-num', onclick: () => tap(t) }, String(t.n));
    line.append(t.el);
  });
  const second = exprView(['10|a', '+', '?', '=', '?']);
  second.style.display = 'none';
  const [restHole, totalHole] = second.querySelectorAll('.hole');
  const pickBox = h('div');
  body.append(line, second, pickBox);

  function tap(t) {
    if (step !== 1 || t.el.classList.contains('paired')) return;
    fb.replaceChildren();
    if (!picked) { picked = t; t.el.classList.add('selected'); return; }
    if (picked === t) { t.el.classList.remove('selected'); picked = null; return; }
    const a = picked;
    a.el.classList.remove('selected');
    picked = null;
    if (a.n + t.n === 10) return found(a, t);
    errors++;
    pairMisses++;
    if (pairMisses < 2) { hint(fb, [P.amisNot10]); return; }
    // Deuxième erreur : on montre les deux amis de 10.
    const [x, y] = friends();
    found(x, y);
  }

  function friends() {
    for (const x of terms) for (const y of terms) if (x.i < y.i && x.n + y.n === 10) return [x, y];
    return [];
  }

  function found(a, b) {
    step = 2;
    a.el.classList.add('paired');
    b.el.classList.add('paired');
    terms.filter((t) => t !== a && t !== b).forEach((t) => t.el.classList.add('rest'));
    second.style.display = '';
    setPrompt(root, P.amisRest);
    say([`${a.n} plus ${b.n} égale 10.`, P.amisRest]);
    ask(restHole, item.rest, item.restChoices, () => {
      setPrompt(root, item.say);
      say([item.restSay, item.say].filter(Boolean));
      ask(totalHole, item.total, item.totalChoices, end);
    });
  }

  function ask(hl, answer, list, then) {
    hl.classList.add('active');
    let misses = 0;
    pickBox.replaceChildren(numChoices(list, (t, btn) => {
      if (btn.disabled || hl.classList.contains('good') || hl.classList.contains('reveal')) return;
      if (t === answer) {
        hl.classList.remove('active');
        fillHole(hl, t, 'good');
        fb.replaceChildren();
        then();
        return;
      }
      errors++;
      misses++;
      btn.disabled = true;
      btn.classList.add('dim');
      if (misses < 2) { hint(fb, [pick(P.retry)]); return; }
      hl.classList.remove('active');
      fillHole(hl, answer, 'reveal');
      fb.replaceChildren();
      then();
    }));
  }

  function end() {
    pickBox.remove();
    const result = errors === 0 ? 'ok' : errors <= 2 ? 'partial' : 'fail';
    finisher(fb, done)(result, result === 'fail' ? [item.explain, P.placerFail] : [pick(P.bravo), item.explain]);
  }

  say(item.q);
}

/* ---------- Table d'addition à compléter ---------- */
// « ligne » : n + 1 … n + 9 ; « grille » : toute la table 1 à 9. On touche une case vide (la suivante
// est choisie toute seule), puis le bon nombre parmi 4. La ligne et la colonne de la case sont surlignées.
export function table(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const key = (a, b) => `${a}+${b}`;
  const holes = item.holes.map((x) => ({ ...x, misses: 0, done: false }));
  const byKey = Object.fromEntries(holes.map((x) => [key(x.a, x.b), x]));
  const cells = {};
  let active = null, errors = 0, revealed = 0;

  const cellEl = (a, b) => {
    const hl = byKey[key(a, b)];
    if (!hl) return h('div', { class: 'tcell' }, String(a + b));
    hl.el = h('button', { class: 'tcell hole', onclick: () => open(hl) }, '?');
    return hl.el;
  };

  let board;
  if (item.layout === 'ligne') {
    board = h('div', { class: 'tline' }, Array.from({ length: 9 }, (_, k) =>
      h('div', { class: 'tline-cell' }, h('div', { class: 'tline-op' }, `${item.row} + ${k + 1}`), cellEl(item.row, k + 1))));
  } else {
    board = h('div', { class: 'tgrid' });
    board.append(h('div', { class: 'thead corner' }, '+'));
    for (let b = 1; b <= 9; b++) board.append(cells[`c${b}`] = h('div', { class: 'thead' }, String(b)));
    for (let a = 1; a <= 9; a++) {
      board.append(cells[`r${a}`] = h('div', { class: 'thead' }, String(a)));
      for (let b = 1; b <= 9; b++) {
        const el = cellEl(a, b);
        el.dataset.a = a;
        el.dataset.b = b;
        board.append(el);
      }
    }
  }
  const pickBox = h('div', { class: 'tpick' });
  body.append(h('div', { class: `tboard ${item.layout}` }, board, pickBox));

  function cross(hl) {
    if (item.layout !== 'grille') return;
    board.querySelectorAll('.cross').forEach((el) => el.classList.remove('cross'));
    if (!hl) return;
    board.querySelectorAll('.tcell').forEach((el) => {
      if (+el.dataset.a === hl.a || +el.dataset.b === hl.b) el.classList.add('cross');
    });
    cells[`r${hl.a}`].classList.add('cross');
    cells[`c${hl.b}`].classList.add('cross');
  }

  function open(hl) {
    if (hl.done) return;
    if (active) active.el.classList.remove('selected');
    active = hl;
    hl.el.classList.add('selected');
    cross(hl);
    fb.replaceChildren();
    pickBox.replaceChildren(
      h('div', { class: 'tpick-op' }, exprView([`${hl.a}|a`, '+', `${hl.b}|b`, '=', '?'])),
      numChoices(hl.choices, (t, btn) => answer(hl, t, btn)));
  }

  function answer(hl, t, btn) {
    if (hl.done || btn.disabled) return;
    if (t === hl.answer) { fill(hl, 'good'); return next(hl.say); }
    errors++;
    hl.misses++;
    btn.disabled = true;
    btn.classList.add('dim');
    if (hl.misses === 1) { hint(fb, [pick(P.retry), hl.hint]); return; }
    revealed++;
    fill(hl, 'reveal');
    next(hl.say);
  }

  function fill(hl, cls) {
    hl.done = true;
    hl.el.textContent = hl.answer;
    hl.el.classList.remove('selected');
    hl.el.classList.add(cls);
    fb.replaceChildren();
    active = null;
  }

  // filled : le calcul qu'on vient de compléter, lu à voix haute.
  function next(filled) {
    const hl = holes.find((x) => !x.done);
    if (hl) { open(hl); if (filled) say(filled); return; }
    cross(null);
    pickBox.remove();
    const result = revealed > Math.floor(holes.length / 4) ? 'fail' : errors ? 'partial' : 'ok';
    const msg = result === 'fail' ? P.placerFail : pick(P.bravo);
    feedback(fb, result === 'fail' ? 'show' : 'ok', `${msg} ${P.tableDone}`, () => done(result));
    say([filled, msg, P.tableDone]);
  }

  open(holes[0]);
  say(item.q);
}
