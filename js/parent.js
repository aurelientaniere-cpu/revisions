// Espace parent : caché derrière un appui long sur ⚙️ puis une multiplication.

import { h } from './util.js';
import { state, save, exportCode, importCode, resetAll } from './store.js';
import { say, stop } from './speech.js';
import { P } from './phrases.js';
import { ns, lessonProgress } from './srs.js';

export function parentGate(lessons, back) {
  const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { type: 'number', inputmode: 'numeric', style: { font: 'inherit', fontSize: '28px', width: '140px', padding: '8px' } });
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('h2', {}, 'Espace parent'),
      h('p', {}, `Combien font ${a} × ${b} ?`),
      input,
      h('div', { class: 'row' },
        h('button', { onclick: () => ov.remove() }, 'Annuler'),
        h('button', { class: 'primary', onclick: () => {
          ov.remove();
          if (Number(input.value) === a * b) parent(lessons, back);
        } }, 'Entrer'))));
  document.body.append(ov);
  input.focus();
}

function minutes(s) {
  return s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

function parent(lessons, back) {
  stop();
  const app = document.getElementById('app');
  const set = (k, v) => { state.settings[k] = v; save(); };

  const rate = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: state.settings.rate,
    onchange: (e) => { set('rate', Number(e.target.value)); say(P.rateTest); } });

  const fontSel = h('select', { onchange: (e) => { set('font', e.target.value); document.body.classList.toggle('font-lexend', e.target.value === 'lexend'); document.body.classList.toggle('font-system', e.target.value === 'system'); } },
    [['andika', 'Andika (conçue pour apprendre à lire)'], ['lexend', 'Lexend (très aérée)'], ['system', 'Police de l’iPad']]
      .map(([v, l]) => h('option', { value: v, selected: state.settings.font === v }, l)));

  const lenSel = h('select', { onchange: (e) => set('sessionLen', Number(e.target.value)) },
    [4, 6, 8, 10].map((n) => h('option', { value: n, selected: state.settings.sessionLen === n }, `${n} questions (~${Math.round(n * 0.8)} min)`)));

  const code = h('textarea', { readonly: true }, exportCode());
  const importBox = h('textarea', { placeholder: 'Coller ici un code de sauvegarde' });

  const lessonBlocks = lessons.map((L) => {
    const rows = [...L.notions]
      .map((n) => ({ n, s: ns(L, n.id) }))
      .sort((x, y) => (x.s.seen === y.s.seen ? x.s.level - y.s.level || y.s.ko - x.s.ko : x.s.seen ? -1 : 1));
    // Date d'évaluation : la leçon remonte en haut de l'accueil dans les 14 jours qui précèdent.
    const date = h('input', { type: 'date', value: state.evals[L.id] || '', onchange: (e) => {
      if (e.target.value) state.evals[L.id] = e.target.value; else delete state.evals[L.id];
      save();
    } });
    return h('div', { class: 'panel' },
      h('h3', {}, `${L.emoji} ${L.title} — ${Math.round(lessonProgress(L) * 100)} %`),
      h('div', { class: 'row', style: { margin: '10px 0' } },
        h('label', {}, '📅 Évaluation le', date),
        h('button', { onclick: () => { date.value = ''; delete state.evals[L.id]; save(); } }, 'Effacer')),
      h('table', {},
        h('tr', {}, h('th', {}, 'Notion'), h('th', {}, 'Maîtrise'), h('th', {}, 'Réussites'), h('th', {}, 'Erreurs')),
        rows.map(({ n, s }) => h('tr', {},
          h('td', {}, n.term),
          h('td', {}, s.seen ? h('span', { class: 'lvl' }, h('span', { style: { width: `${s.level * 25}%` } })) : h('span', { class: 'muted' }, 'pas encore vue')),
          h('td', {}, s.ok), h('td', {}, s.ko)))));
  });

  app.replaceChildren(h('div', { class: 'parent', style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
    h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: back }, '🏠 Retour'), h('h1', {}, 'Espace parent')),
    h('div', { class: 'panel' },
      h('p', {}, `Séances : ${state.stats.sessions} · Jours de révision : ${state.stats.days} · Temps total : ${minutes(state.stats.seconds)} · Étoiles : ${state.companion.stars}`)),
    h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('h3', {}, 'Réglages'),
      h('label', {}, 'Police', fontSel),
      h('label', {}, 'Vitesse de la voix', rate),
      h('label', {}, 'Durée d’une séance', lenSel),
      h('p', { class: 'muted' }, 'Voix : enregistrée à l’avance sur le Mac (Audrey, et Daniel pour l’anglais). Illustrations : générées localement avec FLUX.1 [schnell]. Une leçon avec une date d’évaluation remonte en haut de l’accueil dans les 14 jours qui précèdent.')),
    ...lessonBlocks,
    h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('h3', {}, 'Sauvegarde'),
      h('p', { class: 'muted' }, 'La progression est gardée sur cet iPad. Copiez ce code pour la mettre à l’abri (Notes, e-mail…).'),
      code,
      h('div', { class: 'row' },
        h('button', { onclick: async () => { try { await navigator.clipboard.writeText(code.value); alert('Code copié.'); } catch { code.select(); } } }, '📋 Copier le code')),
      importBox,
      h('div', { class: 'row' },
        h('button', { onclick: () => {
          try { importCode(importBox.value); alert('Progression restaurée.'); back(); } catch { alert('Code invalide.'); }
        } }, '⬆️ Restaurer'),
        h('span', { class: 'spacer' }),
        h('button', { onclick: () => { if (confirm('Tout effacer (progression, étoiles, cartes) ?')) { resetAll(); back(); } } }, '🗑 Tout remettre à zéro'))),
  ));
  window.scrollTo(0, 0);
}
