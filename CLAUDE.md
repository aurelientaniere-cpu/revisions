# Mes Révisions — app de révision CM1 (iPad)

Web app de révision pour le CM1, conçue pour être accessible aux enfants dys et TDAH, installée sur l'écran d'accueil d'un iPad. HTML/CSS/JS sans compilation, hors-ligne via `sw.js`, publiée sur GitHub Pages (dépôt public : rien de personnel dans les fichiers suivis). La progression reste dans le `localStorage` de l'iPad. Contexte privé : `CLAUDE.local.md` (non suivi par git).

En ligne : https://aurelientaniere-cpu.github.io/revisions/ (dépôt `aurelientaniere-cpu/revisions`, branche `main`, Pages déployé à chaque push, ~1 min).

## Ajouter une leçon (demande habituelle : « voici la photo de la fiche »)
1. Lire la fiche, écrire `lessons/<matiere>-<sujet>.json` selon `lessons/FORMAT.md` (modèle : `histoire-moyen-age.json`) ; l'ajouter à `lessons/index.json` et `lessons/build/<fichier>` à la liste `SHELL` de `sw.js`, puis incrémenter `CACHE`.
2. `python3 tools/build.py` (exercices + liste des phrases), puis `~/.revisions-cm1/venv/bin/python tools/voice.py` (enregistre les phrases manquantes avec la voix de `tools/voice.json`), puis les illustrations (`tools/images.py`, Draw Things ouvert avec son API locale).
3. Leçon d'orthographe (mots à apprendre + dictée) : voir « Orthographe » dans `lessons/FORMAT.md` (modèle : `francais-accords.json`).
   Leçon de maths : voir « Maths » dans `lessons/FORMAT.md` (recettes `maths` → `tools/maths.py`, modèles `maths-faire-10.json`, `maths-table-addition.json`).
4. Tester en local (`python3 -m http.server 8765 --bind 127.0.0.1`, jamais sans `--bind` : sinon tout le Wi-Fi voit le dossier, `CLAUDE.local.md` compris ; arrêter le serveur à la fin) : séance complète, console sans « segment sans audio » ; puis `git commit` + `git push` : l'iPad se met à jour tout seul.

## Outillage (hors du dépôt, dans `~/.revisions-cm1/`)
- `venv/` : Python 3.12 (Homebrew) + Piper, installé **uniquement** depuis `tools/requirements.txt` (`--require-hashes --only-binary=:all:`). Ne jamais ajouter de paquet sans figer version + empreinte vérifiée sur PyPI et passage dans OSV.
- Voix : `tools/voice.json` → `"engine": "apple"` = voix du Mac « Audrey (Enhanced) » (commande `say`, débit `rate`), à installer dans Réglages Système → Accessibilité → voix système → Gérer les voix ; `"engine": "piper"` = ancienne voix Piper. Changer de voix réenregistre tous les clips (signature dans `audio/spoken.json`), puis incrémenter `CACHE`. Mots anglais (champ `english` d'une leçon) : voix `english` (« Daniel », anglais britannique), collée aux morceaux français dans le même clip.
- `voices/` : voix Piper `.onnx` vérifiées par `tools/voices.sha256` (dépôt rhasspy/piper-voices, révision figée). Format ONNX : pas d'exécution de code.
- Images : app Draw Things (Mac App Store, sandboxée), serveur API en local seulement (127.0.0.1), à éteindre après usage.
- Hook `.githooks/pre-commit` (activé par `git config core.hooksPath .githooks`) : bloque secrets, fichiers > 5 Mo et fichiers de modèles.

## Règles pédagogiques (à respecter dans tout contenu)
- Seule la consigne est lue automatiquement ; chaque réponse ou étiquette a son bouton 🔊. Phrases courtes, pas d'abréviation que la voix lirait mal (les siècles en chiffres romains sont gérés par `toSpeech` dans `js/speech.js`).
- Rien à taper au clavier (seule exception : l'activité `ecrire` pour les mots d'orthographe à apprendre, demandée par le parent) : on touche, ou on glisse du doigt pour relier/placer (`relie`, `phrase`, via `js/drag.js`), avec toujours l'alternative toucher-toucher (toucher l'élément, puis la cible).
- Une idée par question ; 4 choix ; jamais une question qui recopie la définition juste vue (`indice`, intrus, pourquoi, situations).
- Erreur bienveillante : un indice (`hint`) qui aide sans donner la réponse ; `explain` court.
- Pas d'italique, pas de texte justifié, pas d'image copiée de la fiche : dessins SVG originaux ou emoji.
- Maths (dyscalculie) : représentation visuelle = le boulier (2 × 10 boules par paquets de 5, choisi par le parent), nombres colorés comme leurs boules ; des astuces de calcul (faire 10, doubles, +9 = +10 − 1, échange) plutôt que du par-cœur ; du concret vers l'abstrait ; jamais de chrono.

## Architecture
- `js/srs.js` : niveaux de maîtrise 0→4 par notion, construction de la séance (3 nouveautés max, jeux variés ; leçon `ordered` : notions dans l'ordre, `newPerSession`, `perNew`).
- `tools/build.py` : génération des exercices de vocabulaire et de la liste des phrases ; `js/lessons.js` charge `lessons/build/`.
- `js/speech.js` + `audio/` : phrases pré-enregistrées (nom = empreinte FNV-1a du texte), repli sur la voix de l'iPad ; `phrases.json` = phrases fixes de l'app.
- Prononciation : pour Apple, lexique `mots_apple` de `tools/prononciation.json` (vide par défaut). Pour Piper : `tools/prononciation.json` (mot → graphie lue, ex. « pause » → « pôse » ; liaisons fautives bloquées : « remparts | où », jamais devant « et/ou ») appliqué par `tools/voice.py` ; `voice.py --audit` signale les cas douteux (‑ent lus « an », liaisons, ‑ose, mots lus en anglais, nombres) à chaque nouvelle leçon ; `audio/spoken.json` garde le texte prononcé et un clip modifié est réenregistré (puis incrémenter `CACHE`, les clips étant en cache par nom).
- `js/activities.js` : qcm, vf, schema, placer (tri / frise / relie / phrase / ordre), trous (dictée à trous), ecrire (taper un mot), extraits de musique (`lessons/music/`). `js/maths.js` : calcul (nombre caché, arbre), boulier (à manipuler), amis10 (fiche « entoure les deux nombres qui font 10 »), table (ligne ou grille à compléter) ; boulier fixe affiché tant que la notion est au niveau ≤ 1. `js/drag.js` : glisser du doigt en Pointer Events (dépôt sur la cible la plus proche, marge large), utilisé par relie (trait tracé dans un calque SVG) et phrase (bloc fantôme vers les cases numérotées).
- `js/rewards.js` : compagnon en 5 stades (étoiles depuis l'arrivée de l'œuf : `companion.start`), cartes à collectionner. Au dernier stade, fin de séance → il rejoint `state.companions` (écran « Mes compagnons », depuis l'album) et un nouvel œuf d'une espèce pas encore obtenue arrive (surprise jusqu'à l'éclosion). Espèces, noms des stades et prompts : `lessons/companions.json`.
- Illustrations : `tools/images.py` (Draw Things, style `tools/style.txt` = aquarelle/crayon, validé). Prompts et graines dans le champ `images` de la leçon ; clé = id de notion (illustration « Nouveau mot » + vignette), `schema-<nom>` pour un schéma, `image` sur chaque carte (`companions/<clé>` pour une image d'un compagnon). Compagnons : « leçon » `companions` (`images.py try companions licorne2 …`), clés `<espèce>0`…`<espèce>4`, images dans `lessons/img/companions/`. Toujours vérifier les images (fausses signatures, objet mal représenté) et refaire avec une autre graine. Zones du schéma : polygones dans `lessons/assets/chateau.svg`, vérifier avec `?zones=1`.
- Accueil (`js/app.js`) : compagnon, puis une ligne de 2 ou 3 leçons avec une évaluation dans les 14 jours (sinon « À réviser »), puis les matières (`CATEGORIES`, champ `category` de la leçon) ; toucher une matière ouvre ses leçons.
- `js/parent.js` : espace parent (appui long sur ⚙️ en haut à droite + une multiplication) ; dates d'évaluation par leçon (`state.evals`, sur l'appareil seulement).
