// Chargement des leçons et génération automatique des exercices de vocabulaire.

import { shuffle, cap } from './util.js';

export async function loadLessons() {
  const index = await fetch('lessons/index.json').then((r) => r.json());
  const lessons = await Promise.all(index.lessons.map((f) => fetch(`lessons/${f}`).then((r) => r.json())));
  return lessons.map(prepare);
}

function prepare(L) {
  L.notionById = Object.fromEntries(L.notions.map((n) => [n.id, n]));
  const items = [...(L.items || [])];

  const groups = {};
  for (const n of L.notions) if (n.group && !n.noAuto) (groups[n.group] ||= []).push(n);

  for (const [group, list] of Object.entries(groups)) {
    for (const n of list) {
      const others = list.filter((o) => o !== n);
      // « Que veut dire X ? » (choisir la définition)
      items.push({
        type: 'qcm', diff: 1, notions: [n.id],
        q: `Que veut dire « ${n.term} » ?`,
        choices: [cap(n.def), ...shuffle(others).slice(0, 3).map((o) => cap(o.def))],
        explain: `${cap(n.nom || n.term)} : ${n.def}.`,
      });
      // « Comment s'appelle… ? » (choisir le mot)
      items.push({
        type: 'qcm', diff: 2, notions: [n.id],
        q: `Comment s'appelle : ${n.def} ?`,
        choices: [cap(n.term), ...shuffle(others).slice(0, 3).map((o) => cap(o.term))],
        explain: `C'est ${n.nom || n.term}.`,
      });
      // « Touche le donjon » sur le schéma
      if (n.zone && L.schema) {
        items.push({
          type: 'schema', diff: 2, notions: [n.id], target: n.zone,
          q: `Touche ${n.nom || n.term} sur le château.`,
          explain: `${cap(n.nom || n.term)} : ${n.def}.`,
        });
      }
    }
    // « Relie chaque mot à sa définition », par paquets de 3
    for (let i = 0; i + 2 < list.length; i += 3) {
      const trio = list.slice(i, i + 3);
      items.push({
        type: 'placer', layout: 'relie', diff: 1, notions: trio.map((n) => n.id),
        q: 'Relie chaque mot à sa définition.',
        targets: trio.map((n) => ({ id: n.id, label: cap(n.def) })),
        tokens: trio.map((n) => ({ text: cap(n.term), target: n.id })),
      });
    }
  }

  L.items = items.map((it, i) => ({ ...it, id: `${L.id}#${i}` }));
  L.zoneNames = Object.fromEntries(L.notions.filter((n) => n.zone).map((n) => [n.zone, n.nom || n.term]));
  return L;
}
