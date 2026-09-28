# Format d'une leçon

Une leçon = un fichier JSON dans `lessons/`, déclaré dans `lessons/index.json`, puis construit par `python3 tools/build.py` vers `lessons/build/` (c'est ce fichier que l'app lit).
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
`{ "id", "term", "nom", "def", "indice", "emoji", "group"?, "zone"?, "noAuto"? }`
- `term` : le mot seul (« donjon ») ; `nom` : avec l'article (« le donjon ») ; `def` : définition courte, sans majuscule ni point final.
- `indice` (obligatoire si `group`) : une situation concrète qui fait deviner le mot **sans recopier la définition** (« Quand l'ennemi approche, les gardes le remontent avec des chaînes. »).
- `group` : les notions d'un même groupe servent de distracteurs entre elles. Pour chaque notion groupée, `build.py` génère : « De quoi parle-t-on ? {indice} », « Que veut dire… ? » et « Relie » (par 3, seulement lors d'une séance suivante), et, si `zone`, « Touche … sur le schéma ».
- `noAuto: true` : pas d'exercice généré (dates, idées) — écrire des `items`.
- Ne jamais changer l'`id` d'une notion existante.

## Items écrits à la main
Tous ont `type`, `diff` (2 normal → 3 difficile ; une notion neuve démarre à 2), `notions` (ids concernés), `review: true` si l'exercice redonne la définition (jamais le jour de la découverte).
- `qcm` : `q`, `choices` (**la bonne réponse en premier**, au moins 4 choix plausibles ; l'app en tire 4 et mélange), `hint` (aide sans donner la réponse, jamais « commence par… »), `explain`. Variante « phrase à terminer » : `sentence` au lieu de `q`.
- Viser des questions qui font réfléchir : l'intrus (« Lequel n'est PAS… »), les « pourquoi », les situations (« Un paysan veut cuire son pain : que doit-il faire ? »).
- Tout texte est enregistré en audio : phrases courtes, pas de nombre ni de prénom variable dans les messages.
- `vf` : `q` (affirmation), `answer` (true/false), `explain`.
- `placer` + `layout` :
  - `tri` : `targets` = paniers `{id,label,emoji,color}`, `tokens` = `{text,target}` ; `sample` = nombre d'étiquettes tirées.
  - `frise` : `targets` = `{id,date}` dans l'ordre chronologique.
  - `phrase` : `targets` = cases `{id:"1"}`…, `tokens` = morceaux de phrase dans l'ordre.

## Cartes
`{ "id", "name", "emoji", "color", "notions": [...] | "all", "level"?, "legend"?, "desc" }` — débloquée quand toutes ses notions atteignent `level` (2 par défaut). Prévoir ~8 à 10 cartes + 1 légendaire (`"notions": "all", "level": 3, "legend": true`). Emoji uniquement (pas d'image protégée).
