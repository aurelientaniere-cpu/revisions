// Les activités. Chacune affiche une question et appelle finish('ok' | 'partial' | 'fail').
// Règles : tout est lu à voix haute, on touche au lieu d'écrire ou de glisser,
// une erreur n'est jamais punie : indice d'abord, puis la réponse est montrée.

import { h, shuffle, pick, cap } from './util.js';
import { say, sayAll, stop } from './speech.js';
import { state } from './store.js';

const BRAVO = ['Bravo !', 'Super !', 'Génial !', 'Exactement !', 'Tu as trouvé !', 'Très bien !'];
const RETRY = ['Presque ! Essaie encore.', 'Pas tout à fait. Réessaie !', 'Bien essayé ! Encore une fois.'];

// Zone commune : consigne lue + zone de réponse + bandeau de retour.
function frame(root, text, extraSpeech) {
  const speakBtn = h('button', { class: 'icon speak', 'aria-label': 'Écouter', onclick: () => say(text) }, '🔊');
  const prompt = h('div', { class: 'prompt' }, h('div', { class: 'text' }, text), speakBtn);
  const body = h('div', { class: 'col', style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
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

function finisher(fb, done) {
  return (result, msg) => {
    const kind = result === 'fail' ? 'show' : 'ok';
    feedback(fb, kind, msg, () => done(result));
    say(msg);
  };
}

export function renderStep(item, ctx) {
  const fn = { qcm, vf, schema, placer }[item.type];
  fn(item, ctx);
}

/* ---------- QCM ---------- */
function qcm(item, { root, level, done }) {
  const text = item.sentence ? `Termine la phrase : ${item.sentence}…` : item.q;
  const { body, fb } = frame(root, text);
  const finish = finisher(fb, done);
  let choices = item.choices.map((t, i) => ({ t, ok: i === 0 }));
  if (level <= 1 && choices.length > 3) choices = [choices[0], ...shuffle(choices.slice(1)).slice(0, 2)];
  choices = shuffle(choices);
  let errors = 0, over = false;

  const buttons = choices.map((c) => {
    const btn = h('button', { class: 'choice' },
      h('span', { class: 'label' }, c.t),
      h('span', { class: 'ear', onclick: (e) => { e.stopPropagation(); say(c.t); } }, '🔊'));
    btn.addEventListener('click', () => answer(c, btn));
    return btn;
  });
  body.append(h('div', { class: 'choices' }, buttons));

  function answer(c, btn) {
    if (over || btn.disabled) return;
    stop();
    buttons.forEach((b) => b.classList.remove('reading'));
    const full = item.sentence ? `${item.sentence} ${c.t}` : c.t;
    if (c.ok) {
      over = true;
      btn.classList.add('good');
      finish(errors ? 'partial' : 'ok', `${pick(BRAVO)} ${item.sentence ? full + '.' : ''} ${item.explain || ''}`.trim());
      return;
    }
    errors++;
    btn.disabled = true;
    btn.classList.add('dim');
    if (errors === 1 && choices.length > 2) {
      const msg = `${pick(RETRY)} ${item.hint || ''}`.trim();
      feedback(fb, 'try', msg);
      say(msg);
    } else {
      over = true;
      const good = choices.findIndex((x) => x.ok);
      buttons[good].classList.add('reveal');
      finish('fail', `La bonne réponse est : ${choices[good].t}. ${item.explain || ''}`.trim());
    }
  }

  const texts = [text, ...(state.settings.readChoices ? choices.map((c) => c.t) : [])];
  sayAll(texts, (i) => buttons.forEach((b, j) => b.classList.toggle('reading', i > 0 && j === i - 1)));
}

/* ---------- Vrai / Faux ---------- */
function vf(item, { root, done }) {
  const text = item.q;
  const { body, fb } = frame(root, `Vrai ou faux ? ${text}`);
  const finish = finisher(fb, done);
  let over = false;
  const make = (val, label) => {
    const b = h('button', { onclick: () => {
      if (over) return;
      over = true;
      if (val === item.answer) {
        b.classList.add('good');
        finish('ok', `${pick(BRAVO)} C'est ${item.answer ? 'vrai' : 'faux'}. ${item.explain || ''}`);
      } else {
        b.classList.add('dim');
        (val ? f : t).classList.add('reveal');
        finish('fail', `Eh non, c'est ${item.answer ? 'vrai' : 'faux'}. ${item.explain || ''}`);
      }
    } }, label);
    return b;
  };
  const t = make(true, '👍 Vrai');
  const f = make(false, '👎 Faux');
  body.append(h('div', { class: 'vf' }, t, f));
  say(`Vrai ou faux ? ${text}`);
}

/* ---------- Schéma à toucher ---------- */
const svgCache = {};
export async function loadSvg(url) {
  if (!svgCache[url]) svgCache[url] = await fetch(url).then((r) => r.text());
  return svgCache[url];
}

export async function schemaView(lesson, highlight) {
  const wrap = h('div', { class: 'schema-wrap', html: await loadSvg(lesson.schema.asset) });
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
  wrap.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zone]');
    if (!z || over) return;
    const name = z.dataset.zone;
    if (name === item.target) {
      over = true;
      zones(name).forEach((el) => el.classList.add('hl'));
      wrap.classList.add('focus');
      finish(errors ? 'partial' : 'ok', `${pick(BRAVO)} ${item.explain}`);
      return;
    }
    errors++;
    const that = lesson.zoneNames[name];
    zones(name).forEach((el) => { el.classList.remove('flash'); void el.getBBox(); el.classList.add('flash'); });
    if (errors < 2) {
      const msg = `Ça, c'est ${that}. ${pick(RETRY)}`;
      feedback(fb, 'try', msg);
      say(msg);
    } else {
      over = true;
      zones(item.target).forEach((el) => el.classList.add('hl'));
      wrap.classList.add('focus');
      finish('fail', `Ça, c'est ${that}. Regarde, ${lesson.zoneNames[item.target]} est ici. ${item.explain}`);
    }
  });
  say(item.q);
}

/* ---------- Placer : trier, frise, relier, phrase ----------
   On touche une étiquette (elle est lue), puis l'endroit où elle va. */
function placer(item, { root, done }) {
  const { body, fb } = frame(root, item.q);
  const finish = finisher(fb, done);
  let tokens = item.tokens;
  if (item.sample && tokens.length > item.sample) {
    const byTarget = {};
    shuffle(tokens).forEach((t) => (byTarget[t.target] ||= []).push(t));
    const lists = Object.values(byTarget);
    const out = [];
    for (let i = 0; out.length < item.sample; i++) {
      const l = lists[i % lists.length];
      if (l.length) out.push(l.shift());
      if (lists.every((x) => !x.length)) break;
    }
    tokens = out;
  }
  tokens = shuffle(tokens).map((t) => ({ ...t, misses: 0 }));
  const layout = item.layout || 'tri';
  let selected = null, errors = 0, left = tokens.length;

  const tokenBox = h('div', { class: 'tokens' });
  const tokenEls = tokens.map((t) => {
    const b = h('button', { class: 'token', onclick: () => select(t, b) }, t.text);
    t.el = b;
    return b;
  });
  tokenBox.append(...tokenEls);

  const targetEls = {};
  const targets = layout === 'relie' ? shuffle(item.targets) : item.targets;
  const cols = layout === 'relie' || layout === 'phrase' ? '' : targets.length === 2 ? 'cols-2' : 'cols-3';
  const targetBox = h('div', { class: `targets ${cols} ${layout}${layout === 'phrase' ? ' phrase-line' : ''}` });
  targets.forEach((tg, i) => {
    const placed = h('div', { class: 'placed' });
    const style = tg.color ? { background: tg.color + '22', borderColor: tg.color } : {};
    const el = h('button', { class: 'target', style, onclick: () => drop(tg, el) },
      tg.date ? h('span', { class: 'date' }, tg.date) : null,
      layout === 'phrase' ? h('span', { class: 'num' }, `${i + 1}`) : null,
      tg.label ? h('span', { class: 'tname' }, tg.emoji || '', tg.label) : null,
      placed);
    el.placed = placed;
    targetEls[tg.id] = el;
    targetBox.append(el);
  });

  if (layout === 'frise') body.append(h('div', { class: 'frise' }, targetBox), tokenBox);
  else if (layout === 'phrase') body.append(targetBox, tokenBox);
  else body.append(tokenBox, targetBox);

  function select(t, b) {
    if (t.done) return;
    tokenEls.forEach((x) => x.classList.remove('selected'));
    Object.values(targetEls).forEach((x) => x.classList.remove('hintglow'));
    selected = t;
    b.classList.add('selected');
    fb.replaceChildren();
    say(t.text);
    if (t.misses >= 2) targetEls[t.target].classList.add('hintglow');
  }

  function drop(tg, el) {
    if (!selected) { say(tg.label || tg.date || ''); return; }
    const t = selected;
    if (t.target === tg.id) {
      t.done = true;
      selected = null;
      t.el.remove();
      el.classList.remove('hintglow');
      el.placed.append(h('span', {}, t.text));
      if (layout !== 'tri') el.classList.add('good');
      left--;
      if (!left) {
        const result = errors === 0 ? 'ok' : errors <= 2 ? 'partial' : 'fail';
        const end = layout === 'phrase'
          ? `${pick(BRAVO)} ${item.targets.map((x) => item.tokens.find((k) => k.target === x.id).text).join(' ')}`
          : `${pick(BRAVO)} ${item.explain || 'Tout est bien rangé.'}`;
        finish(result, end);
      } else {
        fb.replaceChildren();
        say(pick(['Oui !', 'Bien !', 'Parfait !']));
      }
      return;
    }
    errors++;
    t.misses++;
    const msg = t.misses >= 2 ? 'Regarde, la bonne place brille en orange.' : 'Pas ici. Essaie un autre endroit.';
    if (t.misses >= 2) targetEls[t.target].classList.add('hintglow');
    feedback(fb, 'try', msg);
    say(msg);
  }

  say(item.q);
}
