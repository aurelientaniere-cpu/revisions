# Mes Révisions — app de révision CM1 (iPad)

Web app de révision pour le CM1, conçue pour être accessible aux enfants dys et TDAH, installée sur l'écran d'accueil d'un iPad. HTML/CSS/JS sans compilation, hors-ligne via `sw.js`, publiée sur GitHub Pages (dépôt public : rien de personnel dans les fichiers suivis). La progression reste dans le `localStorage` de l'iPad. Contexte privé : `CLAUDE.local.md` (non suivi par git).

En ligne : https://aurelientaniere-cpu.github.io/revisions/ (dépôt `aurelientaniere-cpu/revisions`, branche `main`, Pages déployé à chaque push, ~1 min).

## Ajouter une leçon (demande habituelle : « voici la photo de la fiche »)
1. Lire la fiche, écrire `lessons/<matiere>-<sujet>.json` selon `lessons/FORMAT.md` (modèle : `histoire-moyen-age.json`).
2. L'ajouter à `lessons/index.json` et à la liste `SHELL` de `sw.js`, puis incrémenter `CACHE` dans `sw.js`.
3. Tester en local (`python3 -m http.server 8765`), faire une séance complète, puis `git commit` + `git push` : l'iPad se met à jour tout seul.

## Règles pédagogiques (à respecter dans tout contenu)
- Tout est lu à voix haute : phrases courtes, pas d'abréviation que la voix lirait mal (les siècles en chiffres romains sont gérés par `toSpeech` dans `js/speech.js`).
- Rien à taper au clavier, pas de glisser-déposer : on touche.
- Une idée par question ; 3 choix au début, 4 ensuite ; définitions courtes, vocabulaire de la fiche.
- Erreur bienveillante : un indice (`hint`) qui aide sans donner la réponse ; `explain` court.
- Pas d'italique, pas de texte justifié, pas d'image copiée de la fiche : dessins SVG originaux ou emoji.
- Maths (dyscalculie) : préférer des représentations visuelles (quantités, droite graduée) — nouveau type d'activité à ajouter dans `js/activities.js` si besoin.

## Architecture
- `js/srs.js` : niveaux de maîtrise 0→4 par notion, construction de la séance (3 nouveautés max, jeux variés).
- `js/lessons.js` : chargement et génération automatique des exercices de vocabulaire.
- `js/activities.js` : qcm, vf, schema, placer (tri / frise / relie / phrase).
- `js/rewards.js` : dragon en 5 stades (étoiles), cartes à collectionner.
- `js/parent.js` : espace parent (appui long sur ⚙️ en haut à droite + une multiplication).
