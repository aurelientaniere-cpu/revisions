// Les activités. Chacune affiche une question et appelle finish('ok' | 'partial' | 'fail').
// Règles : seule la consigne est lue automatiquement ; chaque réponse ou étiquette a son 🔊.
// On touche au lieu d'écrire ou de glisser. Une erreur n'est jamais punie : indice d'abord,
// puis la réponse est montrée.

import { h, shuffle, pick } from './util.js';
import { say, stop } from './speech.js';
import { P, fill } from './phrases.js';

const MAX_CHOICES = 4;

function ear(text, cls = 'ear') {
  return h('button', {
    class: cls, 'aria-label': 'Écouter',
    onclick: (e) => { e.stopPropagation(); say(text); },
  }, '🔊');
}

// Zone commune : consigne lue + zone de réponse + bandeau de retour.
function frame(root, text, thumb) {
  const speech = text;
  const prompt = h('div', { class: 'prompt' },
    thumb ? h('img', { class: 'thumb', src: thumb, alt: '' }) : null,
    h('div', { class: 'text' }, text),
    h('button', { class: 'icon speak', 'aria-label': 'Écouter', onclick: () => say(speech) }, '🔊'));
  const body = h('div', { class: 'col' });
  const fb = h('div');
  root.append(prompt, body, fb);
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
  ({ qcm, vf, schema, placer })[item.type](item, ctx);
}

/* ---------- QCM ---------- */
// Petite illustration à côté de la question, si elle ne porte que sur une notion.
const thumbOf = (item, lesson) => (item.notions.length === 1 ? lesson.img(item.notions[0]) : null);

function qcm(item, { root, lesson, done }) {
  const text = item.sentence ? `${P.completePrefix} ${item.sentence}…` : item.q;
  const { body, fb } = frame(root, text, thumbOf(item, lesson));
  const finish = finisher(fb, done);
  const choices = shuffle([
    { t: item.choices[0], ok: true },
    ...shuffle(item.choices.slice(1)).slice(0, MAX_CHOICES - 1).map((t) => ({ t, ok: false })),
  ]);
  const full = item.sentence ? `${item.sentence} ${item.choices[0]}.` : null;
  let errors = 0, over = false;

  const rows = choices.map((c) => {
    const btn = h('button', { class: 'choice' }, c.t);
    btn.addEventListener('click', () => answer(c, btn));
    c.btn = btn;
    return h('div', { class: 'choice-row' }, btn, ear(c.t, 'icon ear-btn'));
  });
  body.append(h('div', { class: 'choices' }, rows));

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

/* ---------- Placer : trier, frise, relier, phrase ----------
   On touche une étiquette pour la choisir (son 🔊 la lit), puis l'endroit où elle va. */
function placer(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
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
  tokens = shuffle(tokens).map((t) => ({ ...t, misses: 0 }));
  const layout = item.layout || 'tri';
  let selected = null, errors = 0, left = tokens.length;

  const tokenBox = h('div', { class: 'tokens' });
  for (const t of tokens) {
    const b = h('button', { class: 'token', onclick: () => select(t) }, t.text);
    t.btn = b;
    t.wrap = h('span', { class: 'token-wrap' }, b, ear(t.text));
    tokenBox.append(t.wrap);
  }

  const targetEls = {};
  const targets = layout === 'relie' ? shuffle(item.targets) : item.targets;
  const cols = layout === 'relie' || layout === 'phrase' ? '' : targets.length === 2 ? 'cols-2' : 'cols-3';
  const targetBox = h('div', { class: `targets ${cols} ${layout}${layout === 'phrase' ? ' phrase-line' : ''}` });
  targets.forEach((tg, i) => {
    const placed = h('div', { class: 'placed' });
    const style = tg.color ? { background: tg.color + '22', borderColor: tg.color } : {};
    const el = h('div', { class: 'target', role: 'button', style, onclick: () => drop(tg, el) },
      tg.date ? h('span', { class: 'date' }, tg.date) : null,
      layout === 'phrase' ? h('span', { class: 'num' }, `${i + 1}`) : null,
      tg.label ? h('span', { class: 'tname' }, tg.emoji || '', h('span', { class: 'tlabel' }, tg.label), ear(tg.label)) : null,
      placed);
    el.placed = placed;
    targetEls[tg.id] = el;
    targetBox.append(el);
  });

  if (layout === 'frise') body.append(h('div', { class: 'frise' }, targetBox), tokenBox);
  else if (layout === 'phrase') body.append(targetBox, tokenBox);
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
      const result = errors === 0 ? 'ok' : errors <= 2 ? 'partial' : 'fail';
      const end = layout === 'phrase'
        ? item.targets.map((x) => item.tokens.find((k) => k.target === x.id).text).join(' ')
        : item.explain || P.placerDone;
      finish(result, [pick(P.bravo), end]);
      return;
    }
    errors++;
    t.misses++;
    if (t.misses >= 2) targetEls[t.target].classList.add('hintglow');
    hint(fb, [t.misses >= 2 ? P.placerGlow : P.placerHere]);
  }

  say(item.q);
}
