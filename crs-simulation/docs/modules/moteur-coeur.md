# Compte rendu — moteur:cœur

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le cœur du moteur est écrit, exécuté et testé : les quatre critères passent (177 tests unitaires « core » verts, aucune erreur tsc dans mes fichiers, e2e boot OK, vite build réussi). `contracts.ts` n'a pas été touché. La classe Game trie les systèmes par `order`, appelle tous les provide() puis attend les init() un à un, découpe le temps simulé en pas égaux ≤ 0,05 s en tenant compte de `clock.timeScale`, n'appelle update() qu'en phase « playing » et frame() à chaque image hors headless. Une exception dans un système est journalisée avec son identifiant ; après 5 erreurs consécutives le système est désactivé jusqu'à la session suivante, et le temps passé par système est mesuré. La session suit la séquence demandée (loading, remise à zéro horloge / identifiants / RNG avec `config.seed`, reset() des systèmes, point de départ, setFocus, whenLoaded(x, z, 250), `session:started`, playing) ; elle porte mode, rôle, grade, mission et durée, ce qui suffit au mode libre (commandant d'emblée compris). Les magasins sont fonctionnels : personnes (tous les champs de Person, apparence déterministe, vitesses 1,4 / 3,2 / 5,5, index spatial, événements), unités, projectiles, véhicules (sièges, table de définitions extensible) et décor / vitrines (requêtes, resolveCircle et raycast sur boîtes orientées). Chaque service de GameContext a une implémentation neutre ; les textes de sommation, l'autorité habilitée, les galons et les teintes d'uniforme sont repris des dossiers de recherche 01 et 02. Sauvegarde (clé versionnée, repli mémoire, export/import, jamais d'exception) et réglages (qualité initiale selon l'appareil, validation, `settings:changed`) sont en place. `index.html` et `src/main.ts` sont livrés avec un tableau MODULES vide et commenté, la lecture des paramètres d'URL, le démarrage automatique et un panneau de diagnostic « Moteur prêt — N systèmes » dont les boutons pilotent réellement la session ; j'ai regardé les captures bureau et téléphone. Écart avec ARCHITECTURE §6 : le monde de `createTestContext()` est le plan neutre, pas le quartier d'essai, car le cœur ne peut pas importer `src/world`.

## API publique et mode d'emploi

Imports par fichier : `@/core/<fichier>`. Tout est en exports nommés ; rien dans le cœur ne touche au DOM ni à Three.

## `@/core/math` (aucune allocation ; résultats composés écrits dans un `out` fourni)
- Constantes : `TAU, HALF_PI, DEG2RAD, RAD2DEG, EPSILON`.
- Scalaires : `clamp(v,min,max)`, `clamp01`, `lerp(a,b,t)`, `invLerp(a,b,v)`, `remap(v,inMin,inMax,outMin,outMax)` (borné), `smoothstep(e0,e1,x)`, `smootherstep`, `approach(cur,target,maxDelta)`.
- Amortissement indépendant du pas : `damp(cur,target,lambda,dt)`, `dampFactor(lambda,dt)`, `dampAngle(cur,target,lambda,dt)`.
- Angles : `wrapAngle(a)` → ]−π, π], `angleDiff(from,to)` (signé, plus court chemin), `turnToward(cur,target,maxStep)`, `lerpAngle(a,b,t)`.
- Cap (BRIEF) : `headingOf(dx,dz) = atan2(dx,dz)`, `headingTo(ax,az,bx,bz)`, `forwardX(h) = sin h`, `forwardZ(h) = cos h`, `rightX(h) = −cos h`, `rightZ(h) = sin h` (cap 0 = sud, droite = ouest), `compassBearing(h)` (0 = nord), `cardinalFr(h)`.
- Repères : `localToWorldX/Z(lx,lz,h)` et `worldToLocalX/Z(dx,dz,h)` suivent `object.rotation.y = h` (+z avant, **+x = gauche du modèle**) ; `vehicleToWorldX/Z(right,fwd,h)` pour le repère SeatDef (x droite, z avant).
- Vecteurs : `len, lenSq, dist, distSq, dist3, dot2, cross2`, `normalize2(v: Vec2): number`, `clampLength2(v,max)`.
- Segments : `segmentParam(px,pz,ax,az,bx,bz)` → t ∈ [0,1], `distSqPointSegment(...)`, `closestPointOnSegment(..., out: Vec2): t`.
- Polygones plats `[x0,z0,…]` : `pointInPolygon(px,pz,poly,count?,offset?)`, `polygonArea(poly,count?,offset?)`.
- Polylignes plates : `polylineLength(points,count?)`, `pointOnPolyline(points,s,out): cap`, `projectOnPolyline(px,pz,points,out): abscisse`.
- Collisions (ré-exportées de `math-collide`) : `circleVsCircle(px,pz,r,cx,cz,cr,out: Vec2): boolean`, `distSqPointObb(px,pz,cx,cz,halfX,halfZ,heading)`, `circleVsObb(px,pz,r,cx,cz,halfX,halfZ,heading,out: Vec2): boolean` (out = vecteur à AJOUTER au centre du disque), `segmentSegment(ax,az,bx,bz,cx,cz,dx,dz,out?: SegmentHit{t,u,x,z})` (parallèles → false), `segmentVsCircle(...,out: SegmentCast{t,nx,nz})`, `segmentVsObb(ax,az,bx,bz,cx,cz,halfX,halfZ,heading,out: SegmentCast)`.

## `@/core/arrays`
`truncate(arr,n)`, `put(arr,n,item): n+1`, `swapRemoveAt(arr,i)`, `swapRemove(arr,item)`. Dans une boucle chaude, écrire par index puis `truncate(out,n)` ; éviter `out.length = 0` suivi de `push` (35 passages du ramasse-miettes contre 0 sur la même charge mesurée).

## `@/core/rng`
- `createRng(seed): SeededRng` — Rng du contrat + `seed` + `reseed(seed)`.
- `fork(label)` ne dépend que de la graine d'origine et du label : il ne consomme pas le parent, et **même label → même flux**. Utiliser un label par usage (`ctx.rng.fork('foule')`, `ctx.rng.fork(person.id)`).
- `ctx.rng` est re-semé avec `config.seed` au début de `session.start`, avant les reset() : créer ses forks dans reset() ou sur `session:started`, pas dans init().
- `pick([])` lève RangeError ; `int(min,max)` avec max ≤ min → min.
- `hashString(str)`, `mix32(n)`, `hash2(a,b)`, `normalizeSeed(seed)`, `gaussian(rng,mean=0,sd=1)`, `shuffle(rng,arr)`, `weightedIndex(rng,weights)` (−1 si vide), `randomInDisc(rng,radius,out)`.

## `@/core/events`
`createEventBus({ rethrow? }): EventBusEx` — contrat + `listenerCount(name)`, `clear()`, `errorCount`. Un gestionnaire ajouté pendant une émission n'est appelé qu'à la suivante. `onAny/emitAny` partagent les canaux des événements du contrat. Événements libres émis par le cœur : `'session:phase'` `{ phase, previous }` (type `SessionPhaseEvent`) et `'core:system_disabled'` `{ id, stage }`.

## `@/core/spatial`
`new SpatialHash<T extends {x,z}>(cellSize = 4, expectedItems = 256)` :
- `insert(item): slot`, `insertAt(item,x,z)`, `remove(slot)`, `removeItem(item)` (O(n)), `update(slot)`, `updateAll()`, `rebuild(items, skip?)`, `clear()`, `size`.
- `query(x,z,r,out,filter?): n` (out tronqué à n), `count(x,z,r,filter?)`, `nearest(x,z,r,filter?): T|null`, `queryBox(minX,minZ,maxX,maxZ,out,filter?)`.
- Indexation à la position au moment de l'insert/update/rebuild ; le test de distance utilise la position courante. Requêtes ré-entrantes dans un filtre autorisées.

## `@/core/stores`
- `createPeopleStore(ctx)` ; constantes `PERSON_RADIUS = 0.28`, `PERSON_SPEED_WALK/RUN/SPRINT`, `PEOPLE_CELL_SIZE = 3` ; `defaultFactionOf(kind)`.
  - spawn() ne consomme pas `ctx.rng` ; `PersonInit.squadId` rattache via `ctx.squads.addMember`.
  - Les personnes `dormant` sortent de l'index au rebuildIndex() suivant.
  - Pendant `person:removed`, `people.get(id)` renvoie encore la personne (déjà hors de `list` et de l'index). `clear()` émet `person:removed` pour chacune.
- `createSquadStore(ctx)`, `rankLevel(rank)`. Une unité avec membres a toujours un chef (premier membre ; succession au plus gradé). `issue()` complète x/z/heading depuis le chef, `maxForce` depuis `ctx.law.roe.authorizedForce`, `issuedAt = clock.now`, `issuedBy = 0` par défaut ; pas de cascade vers les subordonnées.
- `createProjectileStore(ctx)` : `fuse` vaut Infinity par défaut.
- `createVehicleStore(ctx): VehicleStore` = VehicleApi + `registerDef(def)` / `registerDefs(defs)`. `genericVehicleDef(kind)`, `plateFor(seed)`. Type sans définition → gabarit berline non enregistré. `enter()` ne tient pas compte de `locked`. `queryRadius` retient les véhicules dont l'emprise touche le disque. Engins `flying` ignorés par resolveCircle/raycast.
- `createPropStore(ctx): PropStore` = PropApi + `addShop(init: ShopInit)`, `removeShop(id)`, `rebuildIndex()`, `update(dt)`. `PROP_DEFAULTS`, `propDefaults(kind)`. raycast ne teste que les objets `blocksMove || blocksSight`.
- Magasins d'origine même après remplacement : `getCore(ctx).stores.{people,projectiles,vehicles,props,squads}`.

## `@/core/null-services`
`createNeutralServices(ctx, debug)` et une fabrique par service (`createNullWorld`, `createNullEnv`, `createNullHealth`, `createNullActions`, `createNullInteractions`, `createNullLaw`, etc.). Utilitaires : `makeRayHit()`, `clearRayHit(out,bx,bz)`, `NOMINAL_BOUNDS`, `injuryForHealth(h)`, `isAuthority(person)`.
- Monde neutre : `bounds` = emprise du BRIEF, `placeByName` → null, `node()/edge()` → sentinelle d'id −1.
- Droit neutre : `lawfulForce` 1 puis 3 après la dernière sommation ; `canArrest` exige une gravité ≥ 2.
- Santé neutre : ignore armures et zones ; personne ne meurt.
- Interface neutre : `modal` toujours false.

## `@/core/save`, `@/core/settings`
- `createSave({ key?, storage? }): SaveStore` (+ `persistent`, `sections()`), `SAVE_KEY`, `SAVE_VERSION`, `detectStorage()`. Les valeurs lues et écrites sont des copies.
- `createSettings({ save, events, device? }): SettingsStore` (+ `defaults`, `device`), `defaultSettings(hints)`, `pickInitialQuality(hints)`, `qualityPreset(level)`, `applyQualityPreset(settings, level)`, `readDeviceHints()`, `DESKTOP_HINTS`, `sanitizeSetting`. `settings.values` est un objet stable muté en place ; `settings:changed` n'est émis que si la valeur change.

## `@/core/context`, `@/core/session`, `@/core/launch`
- `createContext({ headless?, seed?, debug?, strict?, storage?, device? }): GameContext` ; `getCore(ctx): CoreInternals`.
- `defaultSessionConfig(partial?)` (mode 'test', role 'crs', rank 'gardien', 14 h, clair, seed 1) ; `sessionDurationSeconds(preset)` → 600 / 1500 / 2700 / Infinity ; `START_LOAD_RADIUS = 250`.
- Point de départ : `config.x/z` s'ils sont fournis, sinon `placeByName(place)`, sinon (0,0) ou le centre de l'emprise. Après start(), `ctx.session.config.x/z` sont toujours renseignés (copie de la config).
- start() applique `timeOfDay` et `weather` à `ctx.env` et vide les magasins et journaux par les méthodes du contrat AVANT les reset() des systèmes.
- `session:started` est émis en phase 'loading', puis la phase passe à 'playing'.
- `parseLaunchParams(search): LaunchParams`, `launchSessionConfig(launch)`. main.ts publie `ctx.service<LaunchParams>('launch')` : autostart, place, x, z, quality, seed, nomenu, debug, role, rank, time, weather, crowd, tension, volatility, mission, duration, raw.

## `@/core/game`
`new Game(options: GameOptions = ContextOptions & { maxFrameDt? = 0.1, maxStepsPerFrame? = 40 })`.
- `addModule(factory): this`, `addSystem(system): this` (avant boot, sinon erreur).
- `boot(): Promise<void>` — idempotent ; tout est terminé au retour de l'appel si aucun init() n'est asynchrone.
- `run()`, `stop()`, `dispose()`.
- `step(dt): pas` — manuel, sans frame(), sans borne de durée ; `frame(dtRéel): pas` — image complète, bornée à `maxStepsPerFrame`.
- `ctx`, `session`, `booted`, `systems`, `systemCount`, `perf: SystemPerf[]`, `stats: GameStats`.
- Constantes : `MAX_STEP = 0.05`, `MAX_CONSECUTIVE_ERRORS = 5`, `MAX_TIME_SCALE = 64`.
- Mesures pour l'interface : `ctx.service<PerfApi>('perf')` → `{ systems, stats }`.
- Horloge : pendant update(dt), `clock.now` est l'instant de FIN du pas, `clock.tick` vaut 1 au premier pas, `clock.dt` est le pas courant.
- Le moteur appelle `ctx.people.rebuildIndex()` au début de chaque pas.
- Un système interne `core:neutral` (order 500) fait vivre les interactions neutres et les objets poussés.

## `@/core/testing`
`createTestContext({ seed? = 1, modules?, systems?, strict? = true, debug? }): { game, ctx, ready, step(seconds, dt = 1/30), start(partial?): Promise<SessionConfig> }`.
- Headless, sauvegarde en mémoire, appareil « bureau », **monde = plan neutre**.
- Mode strict par défaut : une exception dans un système OU dans un gestionnaire d'événement fait échouer le test.
- `start()` attend le boot et démarre en (0,0) sauf `x/z/place` fournis.
- Exemple : `const t = createTestContext({ modules: [createSystems] }); await t.start({ crowdSize: 50 }); t.step(5);`

## `@/core/debug`
`installDebugApi(game, target = globalThis): DebugApi` → `window.__CRS = { ready, error, game, ctx, start(partial?), step(seconds), teleport(x,z), summary() }`. `ready` passe à true après le boot ET, avec `?autostart=`, après le démarrage de la session.

## Page
`#game` (canevas) et `#ui` (`pointer-events: none`, ses enfants directs `auto`) ; variables CSS `--safe-top/right/bottom/left`. Le panneau de diagnostic n'apparaît que si `ctx.view` est nul après le boot.

## Mesures

Node 22 (vitest, tests/unit/core.perf.test.ts) :
- Grille spatiale : reconstruction 500 éléments ≈ 6–7 µs ; 2 000 éléments ≈ 0,03 ms.
- 2 000 requêtes de voisinage (r = 1,5 m) parmi 2 000 éléments : ≈ 0,26 ms, soit ≈ 0,13 µs par requête.
- 2 000 requêtes de perception (r = 10 m) : ≈ 2,5 ms.
- Ramasse-miettes pendant 800 000 requêtes + 100 reconstructions : 0 passage en coordonnées entières, 1 en coordonnées flottantes ; 35 pour le témoin « length = 0 puis push » (stable sur 5 exécutions).
- Création de 2 000 personnes : ≈ 9–13 ms (≈ 5–6 µs par personne).
- people.rebuildIndex() pour 2 000 personnes : ≈ 0,026 ms.
- 2 000 × queryRadius(2 m) + 2 000 × nearest(police, 15 m) : ≈ 7,8 ms.
- Un pas de simulation avec 30 systèmes vides + index de 500 personnes : ≈ 0,011 ms.
- Une minute simulée (1 800 pas, 500 personnes) : ≈ 19 ms, soit ≈ 3 000 fois le temps réel.
- 1 000 émissions d'événement vers 8 abonnés : ≈ 0,04 ms.
- 10 000 × (disque contre boîte orientée + segment contre boîte orientée) : ≈ 1,3–1,6 ms.

Chromium headless (tests/e2e/boot.mjs) :
- Création de 500 personnes : 3,7–5,4 ms.
- Un pas de simulation à vide avec 500 personnes : 14–20 µs.
- 500 requêtes de voisinage en foule dense : 0,2–0,35 ms.
- Boucle à 60 images/s ; avance rapide ×8 : 4,13 s simulées en 0,5 s réelle.

Construction : 70,99 Ko de JavaScript (26,77 Ko gzip), build en ~120 ms.

## Non fait / fragile

- createTestContext() n'utilise pas le quartier d'essai annoncé par ARCHITECTURE §6 : le monde est le plan neutre. Pour le quartier d'essai, passer le module du monde dans `modules`.
- Les requêtes spatiales n'allouent rien côté moteur (0 passage du ramasse-miettes en coordonnées entières), mais V8 emballe les arguments flottants des appels non inlinés : 1 passage mesuré pour 800 000 requêtes en coordonnées flottantes. Je ne vois pas comment l'éviter avec une API à arguments numériques.
- Les magasins de véhicules et du décor se limitent à des règles de données : pas de physique de conduite, pas de tir réel de tourelle (décompte + événement), pas d'incendie ; `enter()` ignore `locked`.
- Services neutres volontairement minimaux : la santé ignore armures et zones et ne tue personne ; le droit juge tout « licite » et ne détecte pas `underAttack` ; l'environnement n'avance pas l'heure ; `startVerb` échoue si la meilleure cible du gestionnaire n'est pas celle demandée.
- `?quality=` est enregistré dans la sauvegarde comme un réglage ordinaire, pas comme une surcharge temporaire.
- Le chemin « un module de rendu fournit ctx.view, le panneau disparaît » n'a pas été exécuté (aucun module de rendu branché).
- Sans stockage utilisable, le pied du panneau annonce bien « en mémoire » mais ce cas n'a été vérifié qu'en test unitaire avec un stockage factice, pas dans une vraie iframe restreinte.
- Aucune politique de sécurité de contenu (CSP) dans index.html ; l'absence d'appel externe est vérifiée par le test e2e, pas imposée par le navigateur.
- Le temps réel par image est borné à 0,1 s : sous WebGL logiciel à quelques images/s, le jeu tourne au ralenti ; les tests e2e de gameplay doivent avancer avec `__CRS.step(secondes)`.
- L'ordre `autostart=paris` suppose que le module du monde choisit la carte d'après `config.mode` ('test' ou autre), et le lieu par défaut « place de la Concorde » peut ne pas être connu de `placeByName` (repli sur l'origine avec un avertissement).
- Aucun commit effectué : ce n'était pas demandé.

## Demandes d'évolution du contrat

- SeatDef / TurretDef : « x droite, y haut, z avant » est un repère indirect. Avec `object.rotation.y = cap` et un modèle regardant +z, l'axe +x local Three est la GAUCHE du véhicule. Préciser dans le contrat : monde = position + droite·x + avant·z avec droite = (−cos h, sin h), et le rendu place un siège à x local Three = −seat.x. Mon magasin applique cette lecture (`vehicleToWorldX/Z`).
- InteractionHandler.find(actor) ne reçoit pas de cible, donc InteractionApi.startVerb(actor, verb, targetId) ne peut aboutir que si la meilleure cible du gestionnaire est celle demandée. Proposition : `find(actor: Person, targetId?: EntityId)`.
- PropApi ne permet pas de créer une vitrine. Ajouter `addShop(init)` / `removeShop(id)`, ou écrire que le module du mobilier peuple `shops` depuis `world.shopsInTile` sur `world:tile_loaded`. Mon magasin de base expose `addShop/removeShop` hors contrat.
- GameEvents n'a aucun événement de changement de phase (rien pour 'loading', 'menu', 'debrief'). J'émets l'événement libre `'session:phase' { phase, previous }` ; proposition : l'ajouter à GameEvents.
- Clock : préciser la convention. J'ai retenu : pendant update(dt), `now` = instant de fin du pas ; `tick` = 1 au premier pas d'une session ; `dt` = 0 avant le premier pas.
- Rng.fork(label) : préciser la sémantique. J'ai retenu : dérivé de la graine d'origine et du label seulement (ne consomme pas le parent ; même label → même flux), et `ctx.rng` re-semé avec `config.seed` avant les reset() des systèmes.
- PeopleStore : préciser si les requêtes spatiales renvoient les personnes `dormant` (je les exclus dès le rebuildIndex suivant), si `clear()` émet `person:removed` (oui chez moi) et si `get(id)` reste valide pendant `person:removed` (oui chez moi).
- PropApi.raycast et VehicleApi.raycast : préciser quels obstacles comptent, ou ajouter un paramètre `mode: 'move' | 'sight'`. Pour les objets, je teste `blocksMove || blocksSight` et laisse `RayHit.height` au tireur.
- VehicleApi.queryRadius et PropApi.queryRadius : préciser le critère. J'ai retenu « l'emprise orientée touche le disque », plus utile qu'un test sur le centre pour un bus de 12 m.
- SessionConfig : préciser la priorité entre `x/z` et `place` (coordonnées d'abord chez moi) et indiquer que `session.config.x/z` sont renseignés après start().
- SquadApi.issue : préciser les valeurs par défaut des champs omis (chez moi : point et cap du chef, `maxForce = law.roe.authorizedForce`, `issuedBy = 0`) et l'absence de cascade vers les unités subordonnées.
- Aucun événement de création ou de retrait pour les objets du décor, ni de retrait pour les projectiles : un rendu doit relire les listes. Proposition : `'prop:spawned'`, `'prop:removed'`, `'projectile:removed'`.
- HealthApi.setDown(target, down) n'a pas de `sourceId` : `person:down` porte alors sourceId = 0.
- PersonLook.rankBars (un nombre) ne distingue pas chevrons, barrettes et feuilles de chêne (dossier 01 §4.6) : le rendu devrait partir de `Person.rank`. Valeurs retenues : stagiaire 1, gardien 2, brigadier 1, brigadier-chef 1, major 2, capitaine 3, commandant 4, commissaire 0.
- ForceLevel (0..5) n'a pas de correspondance officielle avec les moyens. Le service neutre suppose 1 = présence/contact avant sommations et 3 après la dernière ; à fixer dans le contrat pour que droit, objets et IA s'accordent.
- GameContext n'expose ni drapeau `debug` ni mesures. Je publie `ctx.service('perf')` (PerfApi) et `ctx.service('launch')` (LaunchParams) ; à officialiser si l'interface doit s'en servir.
- ARCHITECTURE §6 annonce un monde « quartier d'essai » dans createTestContext(), ce que le cœur ne peut pas fournir sans importer src/world. Corriger le texte, ou confier à l'intégrateur une aide de test qui branche le module du monde.

## Vérifications exécutées

- npx vitest run tests/unit/core → 11 fichiers, 177 tests, tous verts (RNG, bus, grille spatiale, magasins, ordre provide/init/update/frame, session complète en headless, avance rapide, isolation des erreurs, sauvegarde, réglages, services neutres, lancement, API de débogage)
- npx vitest run (tout le dépôt) → 14 fichiers, 246 tests verts, lancé avant les dernières retouches du cœur : mes changements ne cassent pas les tests des autres modules
- npx tsc --noEmit → 0 erreur dans src/core, src/main.ts et tests/unit/core.* ; 2 erreurs restantes, toutes deux dans src/world/view/buildings/rings.ts (autre contributeur)
- npx vite build → réussi en ~120 ms : dist/index.html 3,49 Ko, dist/assets/index-*.js 70,99 Ko (26,77 Ko gzip)
- node tests/e2e/boot.mjs → [boot] OK en ~3,5 s : __CRS.ready, phase menu, lang fr, #game et #ui présents, pas de défilement, touch-action et user-select à none, aucun appel réseau externe, zéro erreur console
- Même test : les quatre boutons du panneau pilotent la session (démarrer, pause, reprendre, avance rapide ×8 = 4,13 s simulées en 0,5 s réelle, terminer)
- Même test : session par __CRS.start, __CRS.step(2) = 60 pas, teleport, pause sans aucun pas, boucle requestAnimationFrame à 60 images/s
- Même test : ?autostart=test&nomenu=1&quality=bas&seed=7 en émulation téléphone 390×844 → phase playing, qualité bas, panneau dans la largeur et défilable jusqu'en bas
- Captures regardées avec Read : boot.png, boot-session.png, boot-mobile.png, boot-mobile-bas.png (panneau lisible sur bureau et téléphone ; liseré tricolore corrigé après la première capture)
- node tests/e2e/run-all.mjs → smoke, boot, audio OK ; monuments en échec (test d'un autre contributeur : « monument inconnu : arc_triomphe ») ; résumé et code de sortie 1 corrects
- node tests/e2e/run-all.mjs smoke --timeout=1 → échec signalé, code de sortie 1, aucun processus Chromium orphelin ; filtre sans correspondance → code 1 ; option inconnue → message d'usage
- Script hors dépôt : dist/ servi statiquement sous /sous/chemin/jeu/ avec ?autostart=test → phase playing, 0 erreur (chemins relatifs valides)
- Script hors dépôt : détection de l'appareil dans Chromium → bureau 4 cœurs = moyen, téléphone tactile = bas, tablette tactile = moyen
- Dossiers de recherche revérifiés en fin de travail (01 à 04 présents) : textes des sommations, autorité habilitée, RIO à 7 chiffres, galons, teintes d'uniforme et emprise en coordonnées jeu alignés sur 01, 02 et 04
- git status sur src/core/contracts.ts → aucune modification

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/core/math.ts
- /home/user/SafeDeal/crs-simulation/src/core/math-collide.ts
- /home/user/SafeDeal/crs-simulation/src/core/arrays.ts
- /home/user/SafeDeal/crs-simulation/src/core/rng.ts
- /home/user/SafeDeal/crs-simulation/src/core/events.ts
- /home/user/SafeDeal/crs-simulation/src/core/spatial.ts
- /home/user/SafeDeal/crs-simulation/src/core/stores.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-people.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-squads.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-projectiles.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-vehicles.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-props.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-services.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-world.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-sim.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-items.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-law.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-presentation.ts
- /home/user/SafeDeal/crs-simulation/src/core/save.ts
- /home/user/SafeDeal/crs-simulation/src/core/settings.ts
- /home/user/SafeDeal/crs-simulation/src/core/clock.ts
- /home/user/SafeDeal/crs-simulation/src/core/session.ts
- /home/user/SafeDeal/crs-simulation/src/core/context.ts
- /home/user/SafeDeal/crs-simulation/src/core/game.ts
- /home/user/SafeDeal/crs-simulation/src/core/testing.ts
- /home/user/SafeDeal/crs-simulation/src/core/debug.ts
- /home/user/SafeDeal/crs-simulation/src/core/launch.ts
- /home/user/SafeDeal/crs-simulation/src/main.ts
- /home/user/SafeDeal/crs-simulation/index.html
- /home/user/SafeDeal/crs-simulation/tests/unit/core.math.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.rng.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.events.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.spatial.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.stores.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.stores-geometrie.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.services.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.save.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.game.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.session.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/boot.mjs
- /home/user/SafeDeal/crs-simulation/tests/e2e/run-all.mjs
