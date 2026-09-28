// Phrases fixes de l'app (partagées avec tools/build.py pour l'enregistrement audio).

export const P = {};

export async function loadPhrases() {
  Object.assign(P, await fetch('phrases.json').then((r) => r.json()));
}

export const fill = (tpl, x) => tpl.replace('{x}', x);
