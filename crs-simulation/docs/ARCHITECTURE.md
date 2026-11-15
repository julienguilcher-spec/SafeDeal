# Architecture technique

À lire après `docs/BRIEF.md`. Le fichier `src/core/contracts.ts` fait foi pour tous les types et services.

## 1. Principe : simulation ↔ présentation

```
 entrées ──► contrôleurs (joueur, IA) ──► simulation (monde, personnes, véhicules, objets, dangers, règles)
                                              │  état partagé (GameContext) + événements (EventBus)
                                              ▼
                                   présentation (rendu Three.js, interface DOM, audio)
```

- **Simulation** : `src/core`, `src/env`, `src/sim/**`, `src/gameplay/**`, `src/world/query/**`, `src/world/mapdata.ts`.
  Aucun accès au DOM ni import d'exécution de Three.js. Tourne sous Node (vitest) avec `ctx.headless === true`
  et `ctx.view === null`. Aléatoire uniquement via `ctx.rng` (jamais `Math.random`), temps via `ctx.clock`.
- **Présentation** : `src/input`, `src/render/**`, `src/world/view/**`, `src/world/monuments/**`, `src/ui`, `src/audio`.
  Lit l'état de la simulation, n'en modifie que ce que le contrat prévoit (ex. `PlayerState.camYaw`).
- La simulation demande des effets par événements `fx` / `sfx` : elle ne connaît ni le rendu ni l'audio.
- **Même pion pour le joueur et les IA** : un contrôleur écrit `person.cmd` (déplacement, visée) et appelle
  `ctx.actions` / `ctx.interactions` ; les systèmes communs (locomotion, objets, santé) font le reste. Incarner un
  autre rôle = posséder une autre `Person`.

## 2. Cycle de vie

1. `Game` crée le `GameContext` avec des **services neutres** pour tout (aucun effet, valeurs par défaut).
2. Les modules sont ajoutés : chacun exporte depuis son `index.ts` un `createSystems: ModuleFactory`.
3. Systèmes triés par `order` (voir `SystemOrder`) ; appel de tous les `provide(ctx)` (un module remplace le service
   neutre par le sien : `ctx.hazards = this.api`), puis de tous les `init(ctx)` (asynchrones attendus).
4. Menu. `ctx.session.start(config)` : `reset()` de tous les systèmes → chargement du monde autour du point de départ
   (`world.setFocus`, `world.whenLoaded`) → événement `session:started` (les modules de mission peuplent la scène) → jeu.
5. Boucle : si `session.phase === 'playing'`, `update(dt)` de chaque système (dt réel × `clock.timeScale`, découpé en
   pas ≤ 0,05 s) ; puis `frame(dtRéel)` de chaque système à chaque image (jamais en headless).

## 3. Modules et propriété des dossiers

| Dossier | Rôle | DOM / Three |
|---|---|---|
| `src/core/` | contrats, `Game`, contexte, bus d'événements, magasins d'entités, RNG, maths, index spatial, réglages, sauvegarde, services neutres, aides de test | non |
| `src/input/` | clavier/souris (pointer lock), manette, tactile (sticks et boutons virtuels) → `InputState` | DOM |
| `src/env/` | heure, météo, vent (`EnvApi`) | non |
| `src/render/base/` | renderer, préréglages de qualité, ciel, soleil/lune, ombres, brouillard, pluie, caméra (FPS/TPS/véhicule/drone/tactique), effets d'écran (`ViewApi`) | Three |
| `src/render/people/` | personnages instanciés et animés, équipements portés, vue à la première personne | Three |
| `src/render/fx/` | particules (gaz, fumée, feu, eau, étincelles), décals | Three |
| `src/render/vehicles/` | modèles 3D des véhicules, gyrophares, phares | Three |
| `src/render/props/` | mobilier urbain, vitrines, barricades | Three |
| `src/world/mapdata.ts`, `testDistrict.ts` | format de carte, quartier d'essai | non |
| `src/world/query/` | chargement des tuiles, relief, collisions, surfaces, graphe routier, itinéraires, lieux (`WorldQuery`) | non |
| `src/world/view/` | maillages de la ville : sol, chaussées, immeubles, toits, arbres, eau, grilles, lointain | Three |
| `src/world/monuments/` | monuments modélisés procéduralement | Three |
| `src/sim/people/` | locomotion, collisions, endurance, santé et états, interactions, contrôleur du joueur (`HealthApi`, `InteractionApi`, `PlayerApi`) | non |
| `src/sim/items/` | définitions des objets, usage, projectiles et balistique (`ActionApi`, `ProjectileApi`) | non |
| `src/sim/hazards/` | gaz, fumée, feu, eau (`HazardApi`) | non |
| `src/sim/props/` | mobilier dynamique, vitrines, pillage, barricades (`PropApi`) | non |
| `src/sim/vehicles/` | physique des véhicules, montée/descente, tourelles (`VehicleApi`) | non |
| `src/sim/traffic/` | circulation, feux, piétons civils | non |
| `src/sim/crowd/` | manifestants, groupes, directeur de tension (`DirectorApi`) | non |
| `src/sim/police/` | IA des forces de l'ordre, unités, formations, ordres (`SquadApi`) | non |
| `src/sim/roles/` | archétypes (tenues, dotations), IA des médecins, journalistes, secours, drone (`ArchetypeApi`) | non |
| `src/gameplay/law/` | sommations, emploi de la force, infractions, interpellations (`LawApi`) | non |
| `src/gameplay/radio/` | messages radio et phraséologie (`RadioApi`) | non |
| `src/gameplay/missions/` | cadre de mission, objectifs, catalogue | non |
| `src/gameplay/career/` | carrière, grades, évaluations, sanctions, mode libre | non |
| `src/gameplay/media/` | journalistes, vidéos, image publique | non |
| `src/ui/` | HUD, menus, cartes, commandes tactiles (`UiApi`) | DOM |
| `src/audio/` | synthèse sonore WebAudio, ambiances, voix (`AudioApi`) | DOM |
| `src/main.ts`, `index.html` | racine de composition (réservée à l'intégrateur) | DOM |

Règles d'import :
- Un module importe `@/core/*` (contrats + utilitaires) et ses propres fichiers. **Jamais** l'implémentation d'un autre module.
- Exception : `import type` depuis le fichier `api.ts` d'un autre module, pour un service étendu obtenu par
  `ctx.service<T>('nom')` (missions, carrière, médias…).
- `src/world/query` et `src/world/view` peuvent importer `src/world/mapdata.ts`.

## 4. Conventions de code

- TypeScript strict. Pas d'`enum`, pas d'export par défaut, exports nommés. Fichiers ≤ ~600 lignes : découper.
- Identifiants en anglais, vocabulaire métier en français quand il est plus juste (`sommation`, `lbd`, `bouclier`).
  Commentaires et **tous les textes affichés en français**.
- Boucles chaudes : zéro allocation (réutiliser tableaux et objets temporaires), pas de closures créées par image,
  `for` indexés. Requêtes spatiales via `ctx.people.queryRadius` etc. avec un tableau `out` réutilisé.
- IA : penser par tranches (réflexion à 4-10 Hz étalée sur plusieurs images, déplacement à chaque pas).
- Rendu : `InstancedMesh` et géométries fusionnées ; un nombre d'appels de dessin borné ; textures générées sur canvas
  et partagées ; niveaux de détail selon `ctx.view.quality` et la distance.
- Hauteur : tout objet posé au sol prend `y = ctx.world.heightAt(x, z)`.
- Collisions d'un disque : enchaîner `world.resolveCircle`, `props.resolveCircle`, `vehicles.resolveCircle`.
- Un système ne doit jamais planter si un autre module est absent (service neutre) : tester les retours.
- Erreurs : `console.error` avec le préfixe `[module]`, jamais d'exception non rattrapée dans `update`/`frame`.

## 5. Commandes par défaut (référence pour les entrées et l'interface)

| Action | Clavier/souris (touches physiques, donc ZQSD sur AZERTY) | Manette | Tactile |
|---|---|---|---|
| Se déplacer | `KeyW/A/S/D` | stick gauche | joystick virtuel gauche |
| Regarder / viser | souris | stick droit | glisser à droite de l'écran |
| Action principale (lancer, tirer, frapper) | clic gauche | gâchette droite | bouton « Action » |
| Action secondaire (lever le bouclier, épauler) | clic droit | gâchette gauche | bouton « Viser » |
| Interagir | `KeyE` | X / carré | bouton contextuel |
| Courir / sprinter | `ShiftLeft` | clic stick gauche | pousser le joystick à fond |
| S'accroupir | `KeyC` | B / rond | bouton |
| Sauter / enjamber | `Space` | A / croix | bouton |
| Objet suivant / précédent | molette, `Digit1…9` | LB / RB | barre d'objets |
| Radio | `KeyT` | croix haut | bouton |
| Ordres | `KeyF` (roue d'ordres) | croix droite | bouton |
| Carte / carte tactique | `KeyM` / `Tab` | Select | boutons |
| Caméra FPS/TPS | `KeyV` | clic stick droit | bouton |
| Masque à gaz / visière | `KeyG` / `KeyH` | croix bas / gauche | boutons |
| Sirène / gyrophares / klaxon | `KeyR` / `KeyB` / `KeyN` | — | boutons en véhicule |
| Frein à main | `Space` (en véhicule) | A | bouton |
| Avance rapide | `Period` | — | bouton |
| Pause | `Escape` / `KeyP` | Start | bouton |

En véhicule : déplacement avant/arrière = accélérer/reculer, gauche/droite = volant ; gâchettes analogiques à la manette.

## 6. Tests et outillage

- **Unitaires** : `tests/unit/<module>.<sujet>.test.ts` (vitest, environnement Node). Utiliser `createTestContext()` de
  `@/core/testing` (contexte headless, services neutres, monde = quartier d'essai) puis brancher les systèmes du module.
  Lancer seulement ses tests : `npx vitest run tests/unit/<module>`.
- **Bout en bout** : `tests/e2e/<nom>.mjs` avec `tests/e2e/lib.mjs` (démarre le serveur, ouvre Chromium headless — WebGL
  logiciel, lent : délais généreux, qualité basse — attend `window.__CRS.ready`, captures dans `tests/e2e/out/`).
  `require('playwright')` fonctionne depuis n'importe quel dossier ; `chromium.launch()` sans option ; ne rien réinstaller.
  **Regarder ses captures** (outil Read) avant de conclure qu'un rendu est correct.
- **API de débogage** `window.__CRS` : `{ ready, game, ctx, start(config), step(seconds), teleport(x, z), summary() }`.
  Paramètres d'URL : `?autostart=test|paris`, `&place=…`, `&quality=bas`, `&seed=…`, `&nomenu=1`.
- Vérification des types : `npx tsc --noEmit`. Ne corriger que les erreurs de ses propres fichiers.
- Ne jamais lancer `npm install` à la racine du jeu sans nécessité (les dépendances sont déjà là : three, vite, vitest, typescript).

## 7. Direction artistique

Rendu **semi-réaliste soigné**, cohérent, lisible : proportions humaines justes, palette sourde (pierre de Paris, zinc,
asphalte), uniformes fidèles, lumière physique (soleil bas, ciel, brouillard atmosphérique), nuit éclairée par les
candélabres, les gyrophares et les incendies. Le réalisme vient surtout du **comportement** et des **procédures**.
Référence documentaire : `docs/research/00-bible-realisme.md` (quand il existe) et les dossiers `docs/research/0x-*.md`.

## 8. Bancs d'essai visuels (harness)

Chaque module de présentation peut se développer et se vérifier seul, sans attendre le reste du jeu :
- `harness/<module>.html` + `harness/<module>.ts` : page autonome servie par Vite (`/harness/<module>.html`) qui
  instancie le module avec des données factices. Modèle : `harness/smoke.html` / `harness/smoke.ts`.
- `tests/e2e/<module>.mjs` : ouvre le banc d'essai, attend un indicateur (`window.__ready`), prend des captures dans
  `tests/e2e/out/`, puis `finish(...)`. Modèle : `tests/e2e/smoke.mjs` (validé : rendu correct en ~2 s).
- Chaîne validée : Vite 8, Three.js r187, TypeScript 7 (strict ; `baseUrl` n'existe plus), vitest 5, Chromium headless
  avec WebGL 2 logiciel (SwiftShader : correct mais lent — quelques images par seconde sur une scène lourde ; mesurer le
  coût CPU en JavaScript avec `performance.now()` et le nombre d'appels de dessin avec `renderer.info`, pas les images/s).
- Les bancs d'essai ne font pas partie du jeu livré (seul `index.html` est construit).
