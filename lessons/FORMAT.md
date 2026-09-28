# Format d'une leçon

Une leçon = un fichier JSON dans `lessons/`, déclaré dans `lessons/index.json`.
Modèle complet : `histoire-moyen-age.json`.

## Champs de la leçon
| Champ | Rôle |
|---|---|
| `id` | identifiant unique, jamais modifié ensuite (la progression y est rattachée) |
| `subject`, `title`, `emoji`, `color` | affichage de la tuile |
| `summary` | paragraphes courts lus dans « 🎧 Écouter » (reprendre le résumé à mémoriser de la fiche) |
| `schema.asset` | optionnel : SVG dont les éléments touchables portent `data-zone="…"` et `class="zone"` |
| `notions` | les notions à maîtriser (ordre = ordre d'apparition) |
| `cards` | cartes à collectionner |
| `items` | exercices écrits à la main |

## Notions
`{ "id", "term", "nom", "def", "emoji", "group"?, "zone"?, "noAuto"? }`
- `term` : le mot seul (« donjon ») ; `nom` : avec l'article (« le donjon ») ; `def` : définition courte, sans majuscule ni point final.
- `group` : les notions d'un même groupe servent de distracteurs entre elles. Pour chaque notion groupée, l'app génère seule : « Que veut dire… ? », « Comment s'appelle… ? », « Relie » (par 3) et, si `zone`, « Touche … sur le schéma ».
- `noAuto: true` : pas d'exercice généré (dates, idées) — écrire des `items`.
- Ne jamais changer l'`id` d'une notion existante.

## Items écrits à la main
Tous ont `type`, `diff` (1 facile → 3 difficile), `notions` (ids concernés).
- `qcm` : `q`, `choices` (**la bonne réponse en premier**, l'app mélange), `hint` (indice après la 1re erreur), `explain`. Variante « phrase à terminer » : `sentence` au lieu de `q`.
- `vf` : `q` (affirmation), `answer` (true/false), `explain`.
- `placer` + `layout` :
  - `tri` : `targets` = paniers `{id,label,emoji,color}`, `tokens` = `{text,target}` ; `sample` = nombre d'étiquettes tirées.
  - `frise` : `targets` = `{id,date}` dans l'ordre chronologique.
  - `phrase` : `targets` = cases `{id:"1"}`…, `tokens` = morceaux de phrase dans l'ordre.

## Cartes
`{ "id", "name", "emoji", "color", "notions": [...] | "all", "level"?, "legend"?, "desc" }` — débloquée quand toutes ses notions atteignent `level` (2 par défaut). Prévoir ~8 à 10 cartes + 1 légendaire (`"notions": "all", "level": 3, "legend": true`). Emoji uniquement (pas d'image protégée).
