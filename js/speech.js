// Lecture à voix haute.
// Chaque phrase est pré-enregistrée (audio/<empreinte>.m4a, voir tools/voice.py).
// Si un enregistrement manque, on se rabat sur la voix de l'iPad.

import { state } from './store.js';

const synth = window.speechSynthesis;
const audio = new Audio();
audio.preload = 'auto';
let clips = new Set();
let run = 0;          // chaque nouvelle lecture annule la précédente
let pending = null;   // termine la lecture en cours quand on l'interrompt

export async function loadAudio() {
  try {
    const m = await fetch('audio/manifest.json').then((r) => r.json());
    clips = new Set(m.clips);
  } catch { /* pas encore d'enregistrements : voix de l'iPad */ }
}

// Empreinte FNV-1a 32 bits du texte (même calcul que tools/voice.py).
export function clipKey(text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(text).trim())) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const clipUrl = (text) => `audio/${clipKey(text)}.m4a`;
export const hasClip = (text) => clips.has(clipKey(text));

export function stop() {
  run++;
  audio.pause();
  if (synth) synth.cancel();
  if (pending) { pending(false); pending = null; }
}

// Lit un ou plusieurs segments à la suite. Résout true si tout a été lu.
export async function say(segments) {
  stop();
  return sayFrom(segments, run);
}

async function sayFrom(segments, id) {
  const list = (Array.isArray(segments) ? segments : [segments]).filter((s) => s && String(s).trim());
  for (const s of list) {
    if (id !== run) return false;
    if (!(await playOne(s, id))) return false;
  }
  return id === run;
}

// Lit une liste de paragraphes ; onEach(i) est appelé avant chacun, puis onEach(-1) à la fin.
export async function sayAll(texts, onEach = () => {}) {
  stop();
  const id = run;
  for (let i = 0; i < texts.length; i++) {
    if (id !== run) return;
    onEach(i);
    if (!(await playOne(texts[i], id))) return;
  }
  if (id === run) onEach(-1);
}

function playOne(text, id) {
  if (hasClip(text)) return playClip(clipUrl(text), id);
  console.warn('[voix] segment sans audio :', text);
  return speakSynth(text, id);
}

// Le son est lu depuis un blob : iOS lit mal l'audio servi en morceaux par le service worker hors ligne.
const blobs = new Map();
async function blobUrl(src) {
  if (!blobs.has(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(src);
    blobs.set(src, URL.createObjectURL(await r.blob()));
    if (blobs.size > 60) {
      const [k, v] = blobs.entries().next().value;
      URL.revokeObjectURL(v);
      blobs.delete(k);
    }
  }
  return blobs.get(src);
}

async function playClip(src, id) {
  let url;
  try { url = await blobUrl(src); } catch { return id === run; }
  if (id !== run) return false;
  return new Promise((resolve) => {
    const end = (ok) => { pending = null; audio.onended = audio.onerror = null; resolve(ok && id === run); };
    pending = end;
    audio.onended = () => end(true);
    audio.onerror = () => end(true);
    audio.muted = false;
    audio.src = url;
    audio.playbackRate = state.settings.rate;
    audio.preservesPitch = true;
    const p = audio.play();
    if (p) p.catch(() => end(false));
  });
}

/* ---------- Repli : voix de l'iPad ---------- */
function frenchVoice() {
  const vs = synth ? synth.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('fr')) : [];
  const score = (v) => (/premium|enhanced|amélior/i.test(v.name) ? 4 : 0) + (v.lang === 'fr-FR' ? 1 : 0);
  return [...vs].sort((a, b) => score(b) - score(a))[0] || null;
}

function speakSynth(text, id) {
  return new Promise((resolve) => {
    if (!synth) return resolve(true);
    const u = new SpeechSynthesisUtterance(toSpeech(text));
    u.lang = 'fr-FR';
    const v = frenchVoice();
    if (v) u.voice = v;
    u.rate = state.settings.rate;
    const end = (ok) => { pending = null; resolve(ok && id === run); };
    pending = end;
    u.onend = () => end(true);
    u.onerror = () => end(true);
    setTimeout(() => { if (id === run) synth.speak(u); }, 80);
  });
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
// Même règle que tools/voice.py, qui l'applique avant l'enregistrement.
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

// Déblocage audio : iOS exige un premier son pendant un geste de l'utilisateur.
export function unlock() {
  if (synth) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }
  const first = clips.values().next().value;
  if (first) {
    audio.muted = true;
    audio.src = `audio/${first}.m4a`;
    const p = audio.play();
    const src = audio.src;
    // Si une vraie lecture a démarré entre-temps, on ne l'interrompt pas.
    const unmute = () => { if (audio.muted && audio.src === src) audio.pause(); audio.muted = false; };
    if (p) p.then(unmute, unmute); else unmute();
  }
}
