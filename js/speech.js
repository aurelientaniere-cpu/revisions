// Lecture à voix haute (voix française de l'iPad).

import { state } from './store.js';

const synth = window.speechSynthesis;
let run = 0; // chaque nouvelle lecture annule la précédente

export function frenchVoices() {
  if (!synth) return [];
  return synth.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('fr'));
}

function voice() {
  const vs = frenchVoices();
  if (!vs.length) return null;
  const chosen = vs.find((v) => v.name === state.settings.voiceName);
  if (chosen) return chosen;
  const score = (v) =>
    (/premium|enhanced|amélior/i.test(v.name) ? 4 : 0) +
    (/amélie|audrey|aurélie|marie|thomas/i.test(v.name) ? 2 : 0) +
    (v.lang === 'fr-FR' ? 1 : 0);
  return [...vs].sort((a, b) => score(b) - score(a))[0];
}

const ORD = ['', 'premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième',
  'neuvième', 'dixième', 'onzième', 'douzième', 'treizième', 'quatorzième', 'quinzième', 'seizième',
  'dix-septième', 'dix-huitième', 'dix-neuvième', 'vingtième', 'vingt et unième'];

function roman(s) {
  const val = { I: 1, V: 5, X: 10 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = val[s[i]], b = val[s[i + 1]] || 0;
    n += a < b ? -a : a;
  }
  return n;
}

// Rend le texte prononçable : « XIe » -> « onzième », pas d'emoji, pas de « … ».
export function toSpeech(text) {
  return String(text)
    .replace(/\b([IVX]+)(e|er|ème)\b/g, (m, r) => ORD[roman(r)] || m)
    .replace(/\s*[–—]\s*(?=[a-zé])/g, ' au ')
    .replace(/\b[Aa]ux (\S+ième au \S+ième)/g, 'du $1')
    .replace(/(ième au \S+ième) siècles/g, '$1 siècle')
    .replace(/(ième au \S+ième) s\./g, '$1 siècle')
    .replace(/…|\.\.\./g, ', ')
    .replace(/[«»]/g, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .trim();
}

export function stop() {
  run++;
  if (synth) synth.cancel();
}

// Lit un texte ; la promesse se résout à la fin (ou tout de suite si interrompue).
export function say(text) {
  stop();
  return speakRaw(text, run);
}

function speakRaw(text, id) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve(false);
    const u = new SpeechSynthesisUtterance(toSpeech(text));
    u.lang = 'fr-FR';
    const v = voice();
    if (v) u.voice = v;
    u.rate = state.settings.rate;
    let done = false;
    const end = () => { if (!done) { done = true; resolve(id === run); } };
    u.onend = end;
    u.onerror = end;
    // iOS perd parfois une lecture lancée juste après cancel()
    setTimeout(() => { if (id === run) synth.speak(u); else end(); }, 80);
  });
}

// Lit plusieurs textes à la suite ; onEach(i) est appelé avant chaque morceau.
export async function sayAll(texts, onEach = () => {}) {
  stop();
  const id = run;
  for (let i = 0; i < texts.length; i++) {
    if (id !== run) break;
    onEach(i);
    const ok = await speakRaw(texts[i], id);
    if (!ok) break;
  }
  if (id === run) onEach(-1);
}

// Déblocage audio : iOS exige une première lecture pendant un geste de l'utilisateur.
export function unlock() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

if (synth) synth.onvoiceschanged = () => {};
