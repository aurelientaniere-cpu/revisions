# Format d'une leçon

Une leçon = un fichier JSON dans `lessons/`, déclaré dans `lessons/index.json`, puis construit par `python3 tools/build.py` vers `lessons/build/` (c'est ce fichier que l'app lit).
Modèle complet : `histoire-moyen-age.json`.

## Champs de la leçon
| Champ | Rôle |
|---|---|
| `id` | identifiant unique, jamais modifié ensuite (la progression y est rattachée) |
| `category` | matière de l'accueil : `histoire`, `geographie`, `orthographe`, `sciences` ou `anglais` (liste `CATEGORIES` dans `js/app.js`) |
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
- `group` : les notions d'un même groupe servent de distracteurs entre elles. Pour chaque notion groupée, `build.py` génère : « De quoi parle-t-on ? {indice} », « Que veut dire… ? », deux vrai/faux « « mot » veut dire : … » (sa définition, puis celle d'un autre mot du groupe) et « Relie » (par 3) — ces trois-là seulement lors d'une séance suivante —, et, si `zone`, « Touche … sur le schéma ».
- Intrus (optionnel) : champ de leçon `"groups": { "<groupe>": { "label": "une partie du château fort", "hint": "…", "outsiders": [ids de notions hors du groupe] } }` → pour chaque mot du groupe, « Lequel n'est PAS {label} ? » (un intrus + 3 mots du groupe). Seulement si le groupe forme une vraie catégorie.
- `noAuto: true` : pas d'exercice généré (dates, idées) — écrire des `items`.
- Ne jamais changer l'`id` d'une notion existante.

## Items écrits à la main
Tous ont `type`, `diff` (2 normal → 3 difficile ; une notion neuve démarre à 2), `notions` (ids concernés), `review: true` si l'exercice redonne la définition (jamais le jour de la découverte). `id` optionnel : sinon `build.py` calcule une empreinte du contenu (type + question + réponses), qui sert à l'app pour ne pas reposer les mêmes questions d'une séance à l'autre ; corriger le texte d'un exercice le fait donc repartir de zéro.
- `qcm` : `q`, `choices` (**la bonne réponse en premier**, au moins 4 choix plausibles ; l'app en tire 4 et mélange), `hint` (aide sans donner la réponse, jamais « commence par… »), `explain`. Variante « phrase à terminer » : `sentence` au lieu de `q`.
- Viser des questions qui font réfléchir : l'intrus (« Lequel n'est PAS… »), les « pourquoi », les situations (« Un paysan veut cuire son pain : que doit-il faire ? »).
- Tout texte est enregistré en audio : phrases courtes, pas de nombre ni de prénom variable dans les messages.
- `vf` : `q` (affirmation), `answer` (true/false), `explain`.
- `placer` + `layout` :
  - `tri` : `targets` = paniers `{id,label,emoji,color}`, `tokens` = `{text,target}` ; `sample` = nombre d'étiquettes tirées.
  - `frise` : `targets` = `{id,date}` dans l'ordre chronologique.
  - `relie` : `targets` = définitions (ou effets, repas…) `{id,label}`, `tokens` = mots `{text,target}` (un mot par cible, 3 à 4 paires). Les mots s'affichent à gauche, les définitions à droite (mélangées) ; on trace un trait du doigt de l'un à l'autre (dans les deux sens ; la paire est faite dès que le trait touche la bonne carte), ou on touche le mot puis la définition. `explain` optionnel (sinon « Chaque mot est relié à sa définition. »). Généré automatiquement par `build.py` pour les notions groupées.
  - `ordre` (remettre dans l'ordre : jours, mois…) : `targets` = cases dans l'ordre `{id, label?}` (jusqu'à 12, en grille ; `label` = étiquette sous le numéro, avec 🔊, ex. le jour en français), `tokens` = `{text, target, fixed?}` (`fixed: true` = déjà posée, pour donner un repère). On glisse chaque étiquette dans sa case, ou on la touche puis on touche la case ; à la fin la suite est lue d'un trait. `explain` optionnel. Modèle : `anglais-jours-mois.json`.
  - `phrase` : `targets` = cases `{id:"1"}`…, `tokens` = morceaux de phrase dans l'ordre (2 à 4 morceaux courts, qui tiennent sur 2 lignes dans une case). On glisse chaque morceau dans sa case numérotée, ou on touche le morceau puis la case ; à la fin la phrase entière est affichée et lue.

## Orthographe (leçons de dictée)
- Notion : `spell` = le mot avec ses lettres pièges entre crochets (`"en[s]e[m]ble"`), surlignées sur la carte « Nouveau mot » ; `tip` = astuce courte lue après la définition.
- `qcm` + `spell: true` : choix d'orthographes (bonne en premier). Pas de 🔊 sur les choix et les fautes ne sont jamais enregistrées (une faute se lit comme le bon mot).
- `trous` (dictée à trous) : `text` = une phrase par élément, chaque trou `[bon|faux|faux]` (bon en premier) ; `q` optionnel. On touche le trou puis la bonne orthographe ; seules les phrases correctes sont lues.
- `ecrire` (**seule activité où l'on tape**, réservée aux mots à apprendre) : `word`, `say` (phrase d'exemple), `mode` = `copie` (mot affiché), `memo` (regarder, cacher, écrire) ou `dictee` (entendu seulement). Lettres justes en vert, erreurs en orange ; deux erreurs → on recopie le mot. Prévoir copie (diff 1.5), memo (2), dictée (3).

## Langues étrangères
- Champ de leçon `english` : la liste des mots anglais (« Monday », « day »…). `tools/voice.py` les fait dire par la voix anglaise de `tools/voice.json` (`english`), même au milieu d'une phrase française (« Que veut dire « Thursday » ? »). Respecter la casse écrite dans la liste.

## Musique
- Extraits dans `lessons/music/<nom>.m4a` (enregistrements libres de droits, crédits dans `lessons/music/CREDITS.md`, ajoutés à `SHELL` dans `sw.js`). Couper 30 à 50 s : `ffmpeg -ss 0 -t 40 -i src.ogg -af "afade=t=out:st=36:d=4,loudnorm=I=-18" -ac 1 -c:a aac -b:a 64k nom.m4a`.
- `audio: "<nom>"` sur un item (bouton 🎻 au-dessus des choix, jamais lancé tout seul) ou sur une notion (carte « Nouveau mot »).
- Champs de leçon `music` (`[{file, label}]`, boutons sur l'écran « 🎧 Écouter ») et `credits` (affiché en bas de cet écran).

## Cartes
`{ "id", "name", "emoji", "color", "notions": [...] | "all", "level"?, "legend"?, "desc" }` — débloquée quand toutes ses notions atteignent `level` (2 par défaut). Prévoir ~8 à 10 cartes + 1 légendaire (`"notions": "all", "level": 3, "legend": true`). Emoji uniquement (pas d'image protégée).
