# Mes Révisions — app de révision CM1 (iPad)

Web app de révision pour le CM1, conçue pour être accessible aux enfants dys et TDAH, installée sur l'écran d'accueil d'un iPad. HTML/CSS/JS sans compilation, hors-ligne via `sw.js`, publiée sur GitHub Pages (dépôt public : rien de personnel dans les fichiers suivis). La progression reste dans le `localStorage` de l'iPad. Contexte privé : `CLAUDE.local.md` (non suivi par git).

En ligne : https://aurelientaniere-cpu.github.io/revisions/ (dépôt `aurelientaniere-cpu/revisions`, branche `main`, Pages déployé à chaque push, ~1 min).

## Ajouter une leçon (demande habituelle : « voici la photo de la fiche »)
1. Lire la fiche, écrire `lessons/<matiere>-<sujet>.json` selon `lessons/FORMAT.md` (modèle : `histoire-moyen-age.json`) ; l'ajouter à `lessons/index.json` et `lessons/build/<fichier>` à la liste `SHELL` de `sw.js`, puis incrémenter `CACHE`.
2. `python3 tools/build.py` (exercices + liste des phrases), puis `~/.revisions-cm1/venv/bin/python tools/voice.py` (enregistre les phrases manquantes avec Piper), puis les illustrations (`tools/images.py`, Draw Things ouvert avec son API locale).
3. Tester en local (`python3 -m http.server 8765 --bind 127.0.0.1`, jamais sans `--bind` : sinon tout le Wi-Fi voit le dossier, `CLAUDE.local.md` compris ; arrêter le serveur à la fin) : séance complète, console sans « segment sans audio » ; puis `git commit` + `git push` : l'iPad se met à jour tout seul.

## Outillage (hors du dépôt, dans `~/.revisions-cm1/`)
- `venv/` : Python 3.12 (Homebrew) + Piper, installé **uniquement** depuis `tools/requirements.txt` (`--require-hashes --only-binary=:all:`). Ne jamais ajouter de paquet sans figer version + empreinte vérifiée sur PyPI et passage dans OSV.
- `voices/` : voix `.onnx` vérifiées par `tools/voices.sha256` (dépôt rhasspy/piper-voices, révision figée). Format ONNX : pas d'exécution de code.
- Images : app Draw Things (Mac App Store, sandboxée), serveur API en local seulement (127.0.0.1), à éteindre après usage.
- Hook `.githooks/pre-commit` (activé par `git config core.hooksPath .githooks`) : bloque secrets, fichiers > 5 Mo et fichiers de modèles.

## Règles pédagogiques (à respecter dans tout contenu)
- Seule la consigne est lue automatiquement ; chaque réponse ou étiquette a son bouton 🔊. Phrases courtes, pas d'abréviation que la voix lirait mal (les siècles en chiffres romains sont gérés par `toSpeech` dans `js/speech.js`).
- Rien à taper au clavier, pas de glisser-déposer : on touche.
- Une idée par question ; 4 choix ; jamais une question qui recopie la définition juste vue (`indice`, intrus, pourquoi, situations).
- Erreur bienveillante : un indice (`hint`) qui aide sans donner la réponse ; `explain` court.
- Pas d'italique, pas de texte justifié, pas d'image copiée de la fiche : dessins SVG originaux ou emoji.
- Maths (dyscalculie) : préférer des représentations visuelles (quantités, droite graduée) — nouveau type d'activité à ajouter dans `js/activities.js` si besoin.

## Architecture
- `js/srs.js` : niveaux de maîtrise 0→4 par notion, construction de la séance (3 nouveautés max, jeux variés).
- `tools/build.py` : génération des exercices de vocabulaire et de la liste des phrases ; `js/lessons.js` charge `lessons/build/`.
- `js/speech.js` + `audio/` : phrases pré-enregistrées (nom = empreinte FNV-1a du texte), repli sur la voix de l'iPad ; `phrases.json` = phrases fixes de l'app.
- Prononciation Piper : `tools/prononciation.json` (mot → graphie lue, ex. « pause » → « pôse » ; liaisons fautives bloquées : « remparts | où », jamais devant « et/ou ») appliqué par `tools/voice.py` ; `voice.py --audit` signale les cas douteux (‑ent lus « an », liaisons, ‑ose, mots lus en anglais, nombres) à chaque nouvelle leçon ; `audio/spoken.json` garde le texte prononcé et un clip modifié est réenregistré (puis incrémenter `CACHE`, les clips étant en cache par nom).
- `js/activities.js` : qcm, vf, schema, placer (tri / frise / relie / phrase).
- `js/rewards.js` : dragon en 5 stades (étoiles), cartes à collectionner.
- Illustrations : `tools/images.py` (Draw Things, style `tools/style.txt` = aquarelle/crayon, validé). Prompts et graines dans le champ `images` de la leçon ; clé = id de notion (illustration « Nouveau mot » + vignette), `schema-<nom>` pour un schéma, `dragon0`…`dragon4` pour le compagnon, `image` sur chaque carte. Toujours vérifier les images (fausses signatures, objet mal représenté) et refaire avec une autre graine. Zones du schéma : polygones dans `lessons/assets/chateau.svg`, vérifier avec `?zones=1`.
- `js/parent.js` : espace parent (appui long sur ⚙️ en haut à droite + une multiplication).
