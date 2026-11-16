# Compte rendu — moteur:revue

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Revue contradictoire faite : j'ai d'abord écrit 67 tests adverses, puis je les ai exécutés un à un sur une copie du code d'origine (commit 65e2cb7) : 35 échouaient ou bloquaient. Trois défauts étaient bloquants : `Game.step(Infinity)` ne rendait jamais la main, une insertion depuis le filtre d'une requête spatiale partait en boucle sans fin, et un retrait depuis ce filtre tronquait la requête (4 éléments examinés sur 29) ou plantait dans `people.queryRadius`. Le code d'origine n'avait pas suivi le contrat amendé : `projectile:removed`, `prop:spawned` et `prop:removed` n'étaient jamais émis, le mode de `raycast` était ignoré, `setDown` perdait la source et `startVerb` ne transmettait pas la cible. Une seule entité en NaN (véhicule ou objet) envoyait en NaN toute personne passant par `resolveCircle` et bouchait tous les lancers de rayon ; les fonctions de collision et les magasins écartent maintenant les valeurs invalides. Côté session : un `session:started` pouvait rester sans `session:ended`, les configurations invalides arrivaient telles quelles aux modules, et des entités recréées par un abonné pendant la remise à zéro survivaient en fantômes ; tout cela est corrigé, et identifiants et générateur aléatoire ne repartent qu'une fois les magasins vides. Une sauvegarde au JSON tronqué coupait la persistance à chaque lancement ; elle est désormais mise de côté et le jeu continue de sauvegarder, ce que j'ai vérifié dans un vrai localStorage. Pour le mode libre demandé : le commandant (poste `commandant_unite`) porte l'écharpe et prononce les sommations dans le droit neutre, le grade par défaut suit le rôle, et `?autostart=paris&mode=libre&role=commandant&mission=…` lance directement la session. Les retraits en masse sont passés de quadratiques à linéaires et `nearest` est environ 6 fois plus rapide en foule dense. État final : 245 tests « core » verts (15 fichiers, trois passes de suite), 0 erreur tsc, e2e boot OK, build OK ; `contracts.ts` et `extensions.ts` n'ont pas été touchés par moi. Hors périmètre demandé, j'ai ajouté le paramètre d'URL `mode`, une ligne de résumé de session dans le panneau de diagnostic, un avertissement quand un `init()` ne répond pas, et j'ai rendu les seuils de performance des tests insensibles à la charge de la machine.

## API publique et mode d'emploi

# 1. Défauts trouvés et corrigés

Chacun est couvert par un test adverse qui échouait sur le code d'origine, sauf mention contraire.

**Blocages et plantages**
- `Game.step(Infinity)` bouclait sans fin ; `frame(Infinity)` simulait 40 pas. Même défaut dans `__CRS.step` et `createTestContext().step`. Une durée non finie ne simule plus rien.
- `SpatialHash`, insertion depuis le filtre d'une requête : boucle sans fin dès que la table grandissait.
- `SpatialHash`, retrait depuis un filtre : requête tronquée, ou `TypeError` via `people.queryRadius`.
- Bus : un événement réémis sans fin depuis son gestionnaire débordait la pile (2 460 appels). Coupé à 48 niveaux avec un message clair.
- `step()` / `frame()` appelés depuis un `update()` avançaient l'horloge au milieu d'un pas. Refusés, signalés une fois.

**Écarts avec le contrat amendé**
- `projectile:removed`, `prop:spawned`, `prop:removed` n'étaient jamais émis.
- `PropApi.raycast(mode)` ignorait le mode : une poubelle bouchait la vue. `VehicleApi.raycast` n'avait pas le paramètre.
- `HealthApi.setDown(…, sourceId)` : la source était perdue (`person:down` avec `sourceId` 0).
- `startVerb` n'appelait pas `find(actor, targetId)`.
- Une interaction pouvait avancer deux fois dans le même pas quand un gestionnaire remaniait la liste (vu à la lecture, corrigé ; le test passe aussi sur ce point).
- Commandant unique du BRIEF : le droit neutre refusait les sommations du poste `commandant_unite`, qui n'avait pas d'écharpe.

**Session**
- Un `session:started` restait sans `session:ended` si un abonné terminait ou relançait la session.
- Configurations invalides transmises telles quelles (affluence NaN, tension 7, météo inconnue).
- En mode strict, une erreur pendant le vidage des magasins était avalée.
- Identifiants remis à 1 avant le vidage : des entités recréées par un abonné survivaient (20 fantômes mesurés).
- Générateur re-semé avant le vidage : un abonné qui tirait au sort décalait la session suivante (vu à la lecture, corrigé, assertion ajoutée).
- Vent et échelle d'horloge de l'environnement neutre survivaient au redémarrage.
- `defaultSessionConfig` : un champ `undefined` effaçait la valeur par défaut ; tout rôle recevait le grade « gardien ».
- `createTestContext().start({ place })` ignorait le lieu.

**Valeurs invalides**
- Un véhicule ou un objet en NaN envoyait en NaN toute personne passant par `resolveCircle`, arrêtait tous les rayons à t = 0 et sortait de toutes les requêtes.
- Les grandes requêtes de `SpatialHash` renvoyaient les éléments en NaN.
- `segmentVsCircle` répondait « touché » avec NaN ; normale NaN pour un rayon nul.
- `props.push` : direction NaN → vitesse NaN ; poussées cumulées sans limite (50 000 m/s après 1 000 poussées).
- `people.spawn` acceptait une position NaN ; un `look` partiel avec `undefined` effaçait l'apparence.
- Décor : la portée de recherche était figée à la création ; une barricade agrandie n'était plus trouvée.

**Bus, sauvegarde, lancement**
- Même fonction abonnée deux fois : le mauvais abonnement était retiré.
- Un désabonnement antérieur à `clear()` retirait un abonnement plus récent.
- Sauvegarde au JSON tronqué : persistance coupée à chaque lancement, valeur jamais remplacée.
- Une écriture refusée coupait la persistance jusqu'au rechargement.
- URL : un paramètre mal encodé faisait perdre tous les suivants ; aucun paramètre `mode`.

**Performance et mémoire**
- `people.remove` et `SpatialHash.removeItem` : recherche linéaire par retrait.
- `people.clear()` d'une grosse unité : coût quadratique.
- `nearest` balayait tout le disque.
- Le droit neutre et le magasin du décor gardaient des références d'entités retirées (corrigé, sans test dédié).

# 2. API publique à jour (changements seulement)

## `@/core/events`
- `MAX_EMIT_DEPTH = 48` : au-delà, l'émission est abandonnée (`console.error` ; exception en mode strict).
- Chaque `on()` est un abonnement distinct ; son désabonnement ne retire que lui.

## `@/core/spatial`
- Depuis un filtre : un élément retiré n'est plus présenté ; un élément inséré ou déplacé (`update`) n'est pris en compte qu'à la fin de la requête ; après `rebuild()` ou `clear()`, la requête s'arrête (résultat partiel).
- `nearest` cherche par anneaux, avec une demi-cellule de marge pour les éléments qui ont bougé depuis l'indexation. À distance égale, le choix peut différer de l'ancien.
- Centre ou rayon NaN → aucun résultat. Positions NaN ou infinies jamais renvoyées.
- `removeItem` cherche d'abord dans la cellule courante et ses voisines.

## `@/core/math`
- `circleVsCircle`, `circleVsObb`, `segmentVsCircle`, `segmentVsObb` répondent `false` sur toute valeur non finie et n'écrivent jamais de NaN.
- `distSqPointObb` renvoie `Infinity` dans ce cas.

## `@/core/stores`
- Personnes : position ou cap non fini → `console.error` et 0.
- Personnes : `look.sash = true` par défaut pour les postes `commandant_unite` et `autorite_civile` (police).
- Personnes : `clear()` émet `person:removed` de la dernière à la première ; une personne créée pendant le vidage reste valide.
- Projectiles, véhicules, objets : `*:removed` émis par `remove` et par `clear`. Pendant l'événement, `get(id)` renvoie encore l'entité, déjà sortie de `list`.
- Véhicules : `raycast(…, mode?)` accepté, même résultat dans les deux modes. `enter()` refuse un véhicule en cours de retrait.
- Décor : `prop:spawned` à la création.
- Décor : `raycast` : `'move'` = `blocksMove`, `'sight'` = `blocksSight`, sans mode = l'un ou l'autre.
- Décor : emprise et position relues une fois par pas, ou tout de suite par `rebuildIndex()`.
- Décor : `PROP_MAX_SPEED = 12` m/s.
- Décor : `ShopInit` vient de `contracts.ts`, toujours ré-exporté.

## Services neutres (`@/core/null-services`)
- `isAuthority(p)` : police ET (type `commissaire`, poste `commandant_unite`, poste `autorite_civile` ou `look.sash`).
- Droit : `authorize` borne à 0..5 et ignore NaN ; gravité d'infraction bornée à 1..5.
- Environnement : vent et échelle d'horloge remis à zéro à chaque session.

## `@/core/session`
- Nouveaux exports : `defaultRankForRole(role)`, `sanitizeSessionConfig(cfg)`.
- Grades par défaut : commandant → commandant ; chef_groupe → brigadier_chef ; crs, bravm, gendarme_centaure → gardien ; télépilote, opérateur du canon à eau → brigadier ; rôles hors police → `null`.
- `start()` copie puis assainit la configuration : affluence entière ≥ 0, tension et propension dans [0, 1], heure dans [0, 24[, météo et durée valides, graine finie. Un avertissement liste les champs corrigés.
- Ordre de `start()` : horloge et services neutres → vidage (unités d'abord) → identifiants à 1 → re-semis → `reset()` des systèmes → chargement → `session:started` → `playing`.
- À tout `session:started` correspond un `session:ended`.
- `session:phase` est émis comme événement typé ; `onAny` fonctionne toujours.
- `end()` ne vide pas les magasins.

## `@/core/game`
- `INIT_WATCHDOG_MS = 10000` : avertissement nommant le système dont l'`init()` ne répond pas.
- `getCore(ctx).strict` existe (déjà lu par `sim/items`).

## `@/core/save`
- `SAVE_UNREADABLE_SUFFIX = '.illisible'` : copie brute d'une sauvegarde illisible.
- `persistent` = stockage présent ET dernière écriture réussie ; chaque écriture réessaie.

## `@/core/launch`
- `LaunchParams.mode: GameMode | null` (`&mode=libre`).
- Sans `&rank=`, le grade est celui du rôle.

## `@/core/testing`, `@/core/debug`
- `start({ place })` respecte le lieu.
- `teleport` ignore des coordonnées non finies.

## Page
- Le panneau de diagnostic affiche une ligne « Mode · rôle · grade · mission · affluence · tension · durée · graine ».

## Mesures

Machine partagée, charge de 20 à 44 sur 4 cœurs pendant toutes les mesures.

**Retraits en masse (temps processeur, avant → après)**

| Opération | Code d'origine | Après correction |
|---|---|---|
| `SpatialHash.removeItem`, 30 000 un à un | 729 ms | 4,5 à 9 ms |
| `people.remove`, 30 000 un à un | 756 ms | 36 à 50 ms |
| `people.remove`, 5 000 un à un | 35 ms | 4 à 9 ms |
| `people.clear()`, unité de 15 000 membres | 3 038 ms | 4 à 5,5 ms |
| `people.clear()`, unité de 5 000 membres | 162 ms | 2 à 5,5 ms |

**Requêtes spatiales, 1 500 points à 1,9 pers./m² (meilleure de 100 à 300 répétitions)**

| Opération | Code d'origine | Après correction |
|---|---|---|
| 1 500 × `nearest(15 m, filtre)` | 13,7 à 16,0 ms | 2,2 à 2,5 ms |
| 1 500 × `query(1 m)` | 0,61 à 0,68 ms | 0,65 à 0,73 ms |
| 1 500 × `count(2,5 m)` | 1,93 à 2,18 ms | 1,97 à 2,59 ms |
| 1 500 × `query(2 m, filtre)` | 1,46 à 1,78 ms | 1,76 à 1,94 ms |
| `rebuild` | 0,015 ms | 0,016 ms |

**core.perf.test.ts (deuxième décile par appel, après correction)**
- Reconstruction de la grille : 500 éléments 4,3 à 4,7 µs ; 2 000 éléments 0,021 ms.
- 2 000 requêtes de voisinage (1,5 m) parmi 2 000 : 0,24 à 0,25 ms.
- 2 000 requêtes de perception (10 m) : 2,5 à 2,6 ms.
- 2 000 × `queryRadius(2 m)` + 2 000 × `nearest(police, 15 m)` : 3,1 ms (7,7 ms en moyenne à l'origine).
- Un pas avec 30 systèmes vides et l'index de 500 personnes : 10 µs.
- 1 000 émissions vers 8 abonnés : 0,027 ms.
- 10 000 × (disque + segment contre boîte orientée) : 1,39 à 1,44 ms, garde-fous compris (1,41 à l'origine).
- Ramasse-miettes pendant 800 000 requêtes : 0 passage en coordonnées entières, 1 à 2 en flottantes (inchangé).
- Création de 2 000 personnes : 15 à 32 ms de temps processeur.
- Une minute simulée (1 800 pas, 500 personnes, systèmes vides) : 18 à 30 ms de temps processeur.

**5 000 personnes (temps mural, passages les moins chargés)**
- Création : 58 à 75 ms.
- `rebuildIndex` : 0,09 à 0,3 ms.
- 5 000 × `queryRadius(1,5 m)`, 9,1 voisins en moyenne : 13 à 26 ms.
- 5 000 × `nearest(police, 15 m)` : 28 à 41 ms (102 ms à l'origine).

**Endurance et module des personnes**
- 60 s simulées, 500 personnes avec mon module de foule de test : 644 à 775 ms, soit 0,36 à 0,43 ms par pas ; jusqu'à 7,7 s sous une charge de 35.
- Pas du module des personnes (1 500 en marche, meilleure de 80 séries) : 1,24 à 1,78 ms sur le nouveau cœur, 1,18 à 1,56 ms sur l'ancien.

**Chromium (tests/e2e/boot.mjs)**
- Création de 500 personnes : 3,6 à 6,2 ms.
- Un pas avec 500 personnes : 26 à 73 µs (304 µs lors d'un pic de charge).
- 500 requêtes de voisinage : 0,42 à 0,97 ms.
- Boucle à 60 images/s ; avance rapide ×8 : 4,0 à 4,4 s simulées en 0,5 s réelle.

**Construction** : 81,32 Ko de JavaScript (30,42 Ko gzip), contre 70,99 Ko avant ; build en 0,3 à 1,8 s.

## Non fait / fragile

- Les mesures ont été prises sur une machine très chargée (charge de 20 à 44 sur 4 cœurs, autres développeurs en parallèle) : les temps muraux varient d'un facteur 2 à 10 d'un passage à l'autre. Seuls les temps processeur et les meilleures répétitions sont fiables.
- Le test people.crowd « coût d'un pas pour 1 500 personnes < 3 ms » (module des personnes, pas à moi) échoue par moments : 2,26 ms dans un passage isolé, 3,19 ms dans un autre. Ma comparaison sur ancien et nouveau cœur ne montre pas d'effet significatif, mais je n'ai pas pu le confirmer sur une machine au calme.
- Requêtes spatiales ordinaires environ 5 à 10 % plus lentes que l'original dans mon banc (garde-fous par requête), à la limite du bruit ; nearest est environ 6 fois plus rapide.
- Le 68e test adverse (insérer ou déplacer depuis un filtre) a été écrit après les corrections et n'a pas été lancé sur le code d'origine.
- end() ne vide pas les magasins : les entités d'une session terminée restent en mémoire et dans les listes jusqu'au démarrage suivant, y compris au menu. Choix conservé, à trancher.
- Les identifiants repartent de 1 à chaque session, comme le permet le contrat : un module qui garde un identifiant d'une session à l'autre désignera une autre entité.
- Dans le navigateur, le pas de simulation dépend de la cadence d'affichage : deux machines ne rejouent pas exactement la même partie. Seuls les tests, à pas fixe, sont reproductibles.
- Le temps réel par image reste borné à 0,1 s : en dessous de 10 images/s, le jeu ralentit.
- En mode strict seulement : si un abonné de session:started lève une exception, start() rejette et revient au menu sans émettre session:ended.
- Un world.whenLoaded() qui ne se résout jamais laisse la session en « loading » jusqu'à end() ; le délai de garde ne couvre que les init().
- Une entité corrompue (NaN) après sa création est ignorée par les requêtes et les collisions, mais ni réparée ni signalée ; seul people.spawn valide ses entrées.
- Interactions neutres : start() annule l'interaction en cours même si le begin() de la nouvelle échoue ; une exception dans un gestionnaire est journalisée mais pas propagée, même en mode strict.
- Magasins du décor et des véhicules toujours limités aux données : enter() ignore `locked`, fireTurret n'a pas d'intervalle, damageShop ne cumule pas les petits coups, tout véhicule non volant bouche la vue.
- Le journal de l'emploi de la force et les infractions par personne grossissent sans borne pendant une session.
- `?quality=` est toujours enregistré dans la sauvegarde comme un réglage ordinaire.
- Je n'ai relancé que boot.mjs parmi les tests de bout en bout ; le cas « un module de rendu fournit ctx.view » n'a toujours pas été exécuté.
- docs/modules/moteur-coeur.md, généré depuis le compte rendu précédent, ne décrit pas les comportements ajoutés ici ; je ne l'ai pas modifié.
- Aucun commit de ma part. Des enregistrements automatiques du dépôt ont brièvement inclus deux fichiers de banc temporaires (core.zz-*.test.ts), supprimés depuis.

## Demandes d'évolution du contrat

- Événements `*:removed` (person, projectile, prop, vehicle) : écrire que `get(id)` renvoie encore l'entité pendant l'événement (déjà sortie de `list`) et que `clear()` l'émet pour chaque entité. Les quatre magasins du cœur font maintenant ainsi.
- SessionApi.end() : dire si les magasins sont vidés au retour au menu. Aujourd'hui non, les entités persistent jusqu'au start() suivant ; à trancher pour l'écran d'accueil et le compte rendu.
- SessionConfig : écrire que start() assainit la configuration (crowdSize entier ≥ 0, tension et volatility dans [0, 1], timeOfDay dans [0, 24[, weather et duration valides, seed fini) et que `rank` absent vaut le grade du rôle (`defaultRankForRole` dans @/core/session).
- EntityId : préciser « la numérotation repart de 1 à chaque session ; un module ne conserve aucun identifiant d'une session à l'autre et les oublie dans reset() ».
- Garantir dans GameEvents qu'à tout `session:started` correspond un `session:ended`, y compris si la session est interrompue avant la phase « playing ».
- PropApi : ajouter `rebuildIndex(): void` et écrire quand un changement direct de `x`, `z`, `halfX` ou `halfZ` est pris en compte (au pas de simulation suivant, ou tout de suite après rebuildIndex()). Le magasin du cœur l'expose déjà hors contrat.
- VehicleApi.raycast(mode) : dire si un véhicule bas (scooter, moto) bouche la vue en mode 'sight'. Aujourd'hui tout véhicule non volant bouche passage et vue, et RayHit.height est fourni.
- LawApi : écrire que `authorize(level)` est borné à 0..5 et `recordOffense(severity)` à 1..5, et que l'autorité habilitée inclut le poste `commandant_unite` (commandant unique du BRIEF). L'aide partagée est `isAuthority` de @/core/null-services, déjà utilisée par ui/command et sim/items.
- InteractionApi.start() : dire si un `begin()` refusé annule l'interaction en cours. Aujourd'hui elle est annulée avant la tentative.
- GameSystem.update, « pas variable borné » : dans le navigateur, le pas dépend de la cadence d'affichage, donc la partie n'est pas reproductible d'une machine à l'autre. Si la relecture sur carte ou les missions miroirs doivent rejouer à l'identique, décider d'un pas fixe avec accumulateur.
- EventBus : écrire que la même fonction abonnée deux fois donne deux abonnements indépendants, et qu'un même événement ne peut être réémis depuis ses propres gestionnaires sur plus de 48 niveaux.
- GameContext : officialiser le drapeau strict/debug et les services `perf` (PerfApi) et `launch` (LaunchParams, qui porte maintenant `mode`). Le module sim/items lit déjà `getCore(ctx).strict`.

## Vérifications exécutées

- Preuve avant correction : chaque test adverse lancé seul (délai 45 s) sur une copie du cœur d'origine (git archive 65e2cb7) → 67 tests, 33 réussis, 34 en échec dont 1 boucle sans fin ; un 35e échec après renforcement du test de retrait depuis un filtre (« expected 4 to be greater than 20 »)
- npx vitest run tests/unit/core → 15 fichiers, 245 tests verts ; trois passes consécutives identiques sous une charge de 32 à 38 sur 4 cœurs
- npx tsc --noEmit → 0 erreur dans tout le dépôt au dernier passage, donc 0 dans src/core, src/main.ts et tests/unit/core.*
- node tests/e2e/boot.mjs → [boot] OK en ~10 s : boutons du panneau, session par __CRS, step(Infinity / NaN / négatif) = 0 pas, prop:removed et projectile:removed reçus dans le navigateur, téléphone 390×844
- Même test, URL ?autostart=test&mode=libre&role=commandant&mission=essai_libre&crowd=300&tension=0.4 → phase playing, mode libre, rôle et grade commandant, mission, affluence et tension dans session.config
- Même test, vrai localStorage contenant un JSON tronqué puis rechargement → menu atteint, persistent = true, réglage fov = 85 écrit puis relu au lancement suivant, copie brute sous la clé « .illisible »
- Captures regardées avec Read après mes changements : boot.png, boot-session.png, boot-mobile.png (ligne de session lisible sur bureau et téléphone, carte sans débordement)
- npx vite build → réussi : dist/index.html 3,49 Ko, dist/assets/index-*.js 81,32 Ko (30,42 Ko gzip)
- Script hors dépôt : dist/ servi sous /sous/chemin/jeu/ avec ?autostart=test&mode=libre&role=commandant → phase playing, 0 erreur console, 0 réponse 4xx
- Test adverse : 60 s simulées (1 800 pas) avec 500 personnes en mode strict, 876 106 requêtes de voisinage, 321 retraits et apparitions, collisions contre 40 objets et 6 véhicules → aucune erreur, aucun avertissement, 500 personnes saines à la fin
- Test adverse : chaque membre de chaque service de GameContext, énuméré d'après contracts.ts, est présent ; les méthodes neutres sont appelées sans exception
- Test adverse : import de chaque fichier de src/core avec des pièges sur window, document, navigator, localStorage… → aucun accès ; un moteur de test complet ne touche que requestAnimationFrame, dans run()
- Comparaison ancien / nouveau SpatialHash (meilleure de 300 répétitions) et pas du module des personnes sur ancien et nouveau cœur (meilleure de 80 séries) → chiffres dans « metrics », pas de régression significative
- npx vitest run (tout le dépôt, dernier passage) → 131 fichiers, 1 904 tests verts, 3 échecs, tous hors du cœur : world-buildings.paris, props.vitrines, people.crowd (seuil de 3 ms)
- git log sur src/core/contracts.ts → modifié à 01:49 par l'intégrateur (+2 lignes, OrderType), pas par moi ; extensions.ts inchangé ; dossiers de recherche 00 à 06 présents en fin de travail

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/core/events.ts
- /home/user/SafeDeal/crs-simulation/src/core/spatial.ts
- /home/user/SafeDeal/crs-simulation/src/core/math-collide.ts
- /home/user/SafeDeal/crs-simulation/src/core/game.ts
- /home/user/SafeDeal/crs-simulation/src/core/session.ts
- /home/user/SafeDeal/crs-simulation/src/core/context.ts
- /home/user/SafeDeal/crs-simulation/src/core/save.ts
- /home/user/SafeDeal/crs-simulation/src/core/launch.ts
- /home/user/SafeDeal/crs-simulation/src/core/testing.ts
- /home/user/SafeDeal/crs-simulation/src/core/debug.ts
- /home/user/SafeDeal/crs-simulation/src/core/stores.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-people.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-squads.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-projectiles.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-vehicles.ts
- /home/user/SafeDeal/crs-simulation/src/core/store-props.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-services.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-sim.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-items.ts
- /home/user/SafeDeal/crs-simulation/src/core/null-law.ts
- /home/user/SafeDeal/crs-simulation/src/main.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.adverse.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.adverse-systeme.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.adverse-stores.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.adverse-session.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/core.game.test.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/boot.mjs
