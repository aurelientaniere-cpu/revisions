// Progression et réglages, stockés sur l'iPad (localStorage).

const KEY = 'revisions-cm1-v1';

const DEFAULTS = () => ({
  settings: { font: 'andika', rate: 1, sessionLen: 6 },
  companion: { name: '', stars: 0 },
  notions: {},          // "lecon/notion" -> { level, seen, due, ok, ko }
  items: {},            // "lecon#empreinte" -> { d: jour, s: n° de séance de la leçon, n: posé, ok: réussi }
  cards: [],            // ids des cartes débloquées
  stats: { sessions: 0, seconds: 0, lastDay: '', days: 0 },
});

function load() {
  const base = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(base, JSON.parse(raw));
  } catch { /* stockage indisponible : on part de zéro */ }
  return base;
}

function merge(base, data) {
  for (const k of Object.keys(data || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = { ...base[k], ...data[k] };
    else base[k] = data[k];
  }
  return base;
}

export const state = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function exportCode() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importCode(code) {
  const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  replace(merge(DEFAULTS(), data));
}

export function resetAll() {
  replace(DEFAULTS());
}

function replace(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save();
}
