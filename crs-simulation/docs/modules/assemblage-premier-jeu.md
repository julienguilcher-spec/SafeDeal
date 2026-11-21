# Compte rendu — assemblage:premier-jeu

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Premier jeu jouable assemblé et exécuté dans le navigateur. Depuis la page d'accueil on règle son scénario (CRS, poste, place de la Concorde, affluence), on lance, le vrai Paris se charge avec une barre de progression réelle, et l'on se retrouve à hauteur d'homme avec son groupe de six CRS face à l'obélisque, une manifestation qui se rassemble et la circulation autour. Marche, course, vues à la première et à la troisième personne, grenade lacrymogène (projectile, nuage de gaz dessiné, faute relevée par le droit), HUD, mini-carte, plan de Paris, carte tactique, pause, paramètres, « Recommencer », compte rendu et retour à l'accueil fonctionnent ; le parcours abrégé passe aussi en émulation téléphone 844×390 avec les commandes tactiles.

Résultat des essais sur l'état final :
- `tests/e2e/game.mjs --only=bureau` : 54 vérifications, 0 échec, zéro erreur console.
- Partie téléphone : 7 vérifications, 0 échec, zéro erreur console. Elle a tourné dans l'exécution complète précédente, sur le même code de jeu.
- Cette exécution complète (53 vérifications) a eu 1 échec : la page a été tuée faute de mémoire pendant ma mesure de performance. J'ai corrigé la mesure (attente du processeur graphique entre deux images) puis relancé la partie ordinateur seule ; je n'ai pas refait d'exécution complète d'un seul tenant.
- Jeu construit (`dist/`) servi sous un sous-chemin : OK. `boot.mjs` : OK. Parcours de `ui.mjs` : 56 vérifications OK.
- Tests unitaires `core`, `ui`, `people` et intégration : 49 fichiers, 562 tests verts.

Au-delà de la liste « terminés », j'ai branché quatre modules de la liste « en cours » qui remplissaient les trois conditions au moment du branchement : `render/vehicles`, `sim/crowd`, `sim/traffic`, `render/fx`. Restent dehors l'IA de police et le rendu du mobilier, d'où deux manques visibles : les collègues ne bougent pas, et le mobilier urbain est simulé mais invisible. La Tour Eiffel au loin n'est pas réglée.

## Mesures

Conditions : Chromium headless, WebGL logiciel (SwiftShader), machine partagée à charge 12 à 20 sur 4 cœurs ; qualité « bas », fenêtre 960×540 (tampon de rendu 672×378), place de la Concorde, CRS avec foule de 100 attendus et circulation.
- Chargement : page d'accueil prête en 3 à 4,5 s ; du clic sur « Lancer » au jeu, 9 à 21 s selon la charge, dont monuments proches 1,4 à 2,1 s (4 ou 5 monuments) et construction de la ville 2,7 à 7,9 s.
- Image en jeu (troisième personne) : 89 à 90 appels de dessin, 687 000 à 712 000 triangles. Ville 630 000 (dont immeubles 46 000), monuments 42 000, véhicules 3 000, une cinquantaine de personnages en 9 appels ; 104 géométries, 53 textures.
- JavaScript par image (16 images, un pas de simulation chacune) : médiane 5,4 à 5,9 ms, minimum 2,0 ms ; simulation 0,6 ms, présentation 4,6 à 4,8 ms.
- Par système (médiane) : render.present (renderer.render) 3,4 à 3,6 ms ; render.people 0,1 à 0,2 ms ; sim:vehicles 0,1 à 0,2 ms ; people.locomotion 0,1 ms ; render.fx 0,1 ms ; audio 0,1 ms.
- Aucun système ne dépasse 4 ms par image en médiane. Pointes isolées de 13 à 32 ms (render.people, render.present) quand la machine préempte.
- Simulation sans rendu (Node) : 1,08 ms de processeur par pas avec 240 personnes et 76 véhicules. Dans le navigateur sans foule : 0,2 à 0,4 ms par pas.
- Mémoire JavaScript : 141 à 150 Mo. « Recommencer » : 104 → 91 géométries, 53 → 53 textures.
- Jeu construit : 3,23 Mo de JavaScript avant compression, 9,3 Mo de données de carte ; construction en 1,8 à 2,8 s.
- Cadence réelle : 0,4 à 0,55 s par image à charge 10 environ, 3 à 18 s quand la machine est saturée. Ces chiffres sont ceux du tramage logiciel, sans rapport avec un vrai processeur graphique.

## Vérifications exécutées

- tests/e2e/game.mjs --only=bureau, état final : 54 vérifications, 0 échec, zéro erreur console. Accueil sans tuile Commissaire ; scénario CRS lanceur, Concorde, affluence 200 réglée au clavier ; chargement ; manifestation en rassemblement (32 manifestants sur place, 100 attendus, 90 stations de métro) ; vues FPS et TPS ; capture de la souris ; regard aux flèches ; course de plus de 60 m (146 à 161 m selon les exécutions) ; arrêt contre la grille de l'obélisque (axe visé à 0,0 m du centre, distance minimale 7,7 m) ; touche V ; grenade en main, charge, projectile, gaz au point de chute, nuage dessiné par render/fx ; journal de la force ; plan (M), carte tactique (Tab), pause (P), paramètres, reprise ; mesures ; « Recommencer » sans fuite ; compte rendu ; retour à l'accueil.
- tests/e2e/game.mjs partie téléphone 844×390 tactile : 7 vérifications, 0 échec, zéro erreur console (commandes tactiles visibles : 15 boutons, 9 cases d'objets ; joystick virtuel : 33 à 36 m en 8 s ; pause et reprise au doigt). Exécutée avec les modules finaux, dans l'exécution complète précédant la correction de la mesure.
- tests/e2e/game-dist.mjs : vite build réussi, dist/ servi sous /sous/chemin/jeu/ ; page d'accueil, carte de Paris chargée, session lancée par l'URL place de la Concorde, 36 fichiers servis, aucune requête hors du sous-chemin, aucun appel externe, zéro erreur.
- tests/e2e/boot.mjs sur le jeu assemblé (jeu de modules final) : OK, y compris le portrait 390×844 (« Tournez votre appareil ») et la sauvegarde corrompue.
- tests/e2e/ui.mjs --only=parcours --size=1280x720 : 56 vérifications, 0 échec après alignement sur le commandant unique.
- tests/unit/integration.session.test.ts (8 tests, vrais modules, vraie carte) : mise en place à la Concorde (face à l'obélisque à 44 m, groupe de 6, boucliers au premier rang, fourgon derrière, aucune fausse foule, personne dans un mur) ; 16 combinaisons rôle/poste ; commandant unique (écharpe, mégaphone, sommation acceptée, compagnie et section de 16) ; vent, circulation et métro appliqués une seule fois ; service police.units factice ; marche, exposition au gaz, invite « Conduire — Fourgon de CRS », montée et conduite (32,7 m en 6 s) ; tourelle du Centaure ; les 10 lieux de la page d'accueil ; redémarrage déterministe.
- tests/unit/integration.foule.test.ts : foule et circulation réelles place de la Concorde, 3 minutes simulées en mode strict sans erreur (72 puis 200 manifestants sur 240, 72 voitures, 31 piétons civils, phase rassemblement) ; la grenade du joueur fait monter la tension de 0,13 à 0,18.
- npx vitest run tests/unit/core tests/unit/ui tests/unit/people tests/unit/integration : 49 fichiers, 562 tests verts. Les deux tests d'intégration existants (headless, archetypes) sont restés verts.
- Suites des modules de la liste « en cours » avant branchement : crowd et traffic 19 fichiers, 69 tests verts ; fx 5 fichiers verts ; vehicles-render 4 fichiers, 68 tests verts.
- npx tsc --noEmit : aucune erreur dans les modules branchés. En fin d'assemblage, 1 erreur restante dans tests/unit/rescue.zzprobe.test.ts, fichier d'un module non branché en cours d'écriture.
