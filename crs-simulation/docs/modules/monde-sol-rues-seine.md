# Compte rendu — monde:sol-rues-seine

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

La ville en 3D hors immeubles est écrite, branchée dans le vrai moteur (banc d'essai) et vérifiée sur la vraie carte de Paris : 68 tests unitaires passent, le test de bout en bout passe (captures regardées), `npx tsc --noEmit` ne signale aucune erreur.

**Ce que montrent les captures** (tests/e2e/out/world-*.png)
- Champs-Élysées pavés avec l'Arc au bout, Concorde (fontaines, obélisque, Palais Bourbon au loin), rue de Rivoli, rue des Rosiers, quai des Tuileries avec la Seine et le pont de la Concorde à arches, Étoile vue du ciel, nuit, pluie : on reconnaît Paris.
- Aucun trou dans le sol ni immeuble flottant sur ces vues ; trottoirs et chaussée bien distincts.

**Comment c'est fait**
- **Sol aplati** : les polygones de la carte se recouvrent sur 10 à 50 % de la surface. Chaque tuile est d'abord réduite à une grille « surface du dessus », et une seule nappe la dessine : deux surfaces ne sont jamais superposées.
- **Relief vrai pour ce qui est surélevé** : trottoirs, terre-pleins et pelouses sont en géométrie, découpés selon les facettes du sol, avec relevé, bordure de granit et caniveau.
- **Ponts** : tablier à la formule d'altitude de la simulation, parapets, dessous, piles à avant-becs et arches.
- **Le reste** : marquages, plaques d'égout, grilles d'arbres, sol mouillé et flaques, eau animée, arbres instanciés, barrières, halos, lointain, carte 2D.

**À savoir avant d'intégrer**
- **Trottoirs 8 cm au-dessus de `heightAt`** (pelouses 13 cm). Sans compensation, pieds et objets s'y enfoncent d'autant. Le service `world.view` publie `liftAt(x, z)` pour corriger ; la chaussée, elle, est exacte.
- **Tuiles lointaines relues par `fetch`** au-delà du rayon de la simulation (700 à 1 100 m), en contournant sa source de données. Sans cela, rien ne serait dessiné jusqu'à `drawDistance`.
- **Coût mesuré hors appels graphiques seulement** : 16 à 56 ms par tuile détaillée selon la qualité, plus longue étape 2,5 ms. En conditions réelles ici (WebGL logiciel, machine très chargée), des étapes de 60 à 570 ms ont été observées ; je ne peux pas certifier les 8 ms par image sur une vraie carte graphique.
- **Étape des immeubles indivisible** (module voisin) : je l'isole dans sa propre image, mais elle dépasse le budget à elle seule.
- **Module pas encore dans `src/main.ts`**, et `src/render/base` n'existe pas : vérifié dans le banc d'essai uniquement.

## API publique et mode d'emploi

BRANCHEMENT
- Racine de composition : `import { createSystems as worldView } from '@/world/view';` puis l'ajouter à MODULES dans src/main.ts (pas encore fait : fichier de l'intégrateur).
- Avec options : `game.addModule(() => createWorldViewSystems({ baseUrl, farTiles, buildings, horizon, seed }))`.
- Un seul système, id 'world:view', order = SystemOrder.WORLD_VIEW. Il ajoute un groupe « ville » à `ctx.view.world`.
- Sans rendu (`ctx.view === null`, tests headless) : il ne fait rien, mais publie quand même ses deux services.

CE QU'IL LIT
- `ctx.view` : renderer, world, quality, drawDistance, camX/camY/camZ.
- `ctx.env.state` : wetness, rain, daylight, clouds, vent, streetLights, timeOfDay.
- Service 'world.data' du module src/world/query (manifest, roadGraph, terrain, places, landmarks, `tile(tx, tz)`).
- Événements 'world:tile_loaded', 'world:source' (libre), 'settings:changed'.
- Service facultatif de forme `{ has(clé) }` sous 'world.monuments' OU 'monuments' (c'est cette seconde clé que publie aujourd'hui src/world/monuments). S'il répond vrai : les bâtiments de cette clé ne sont pas extrudés, et l'ouvrage (piles, arches) d'un pont de cette clé n'est pas construit ; son tablier reste dessiné.
- Il n'appelle pas `ctx.world` : relief et tabliers sont recalculés à partir de 'world.data'.

SERVICE 'world.map2d' — `import type { Map2dApi, Map2dOptions } from '@/world/view/api'`
```ts
draw(ctx2d, centreX, centreZ, mètresParPixel, rotation = MAP_NORTH_UP, options?)
worldToScreen(x, z, cx, cz, mpp, rotation, width, height, out)   // poser ses marqueurs
screenToWorld(sx, sy, cx, cz, mpp, rotation, width, height, out) // clic sur la carte
invalidate()
```
- `rotation` = le CAP placé en haut de l'écran. `MAP_NORTH_UP` (π, exporté par '@/world/view') pour nord en haut ; `person.heading` ou `camYaw` pour une carte qui tourne avec le joueur.
- Options : `width`, `height` (défaut : taille du canvas), `background` (couleur CSS ou null), `theme` ('jour' | 'nuit'), `buildings`, `names`, `landmarks`, `complete`.
- `complete: true` construit tous les tracés manquants dans l'appel (écran fixe, capture). Sinon 3 tuiles au plus par appel.
- Le dessin se fait dans le rectangle (0, 0, width, height) du repère courant du contexte : l'appelant garde la main sur la densité d'écran et le découpage.
- Contenu : rues du graphe sur toute la carte, surfaces et bâtiments des tuiles connues, monuments, noms des axes le long des voies, monuments et lieux nommés, sans chevauchement.
- Tracés en cache par tuile (Path2D), 64 tuiles au plus. Les tuiles lues pour la vue lointaine y sont versées : le fleuve et les jardins apparaissent au-delà du rayon de la simulation.

SERVICE 'world.view' — `import type { WorldViewApi } from '@/world/view/api'`
- `liftAt(x, z)` : surélévation (m) du sol DESSINÉ par rapport à `ctx.world.heightAt`. 0,08 sur trottoir et terre-plein, 0,10 sur parking et terrain de sport, 0,13 sur pelouse et massif, 0 sur chaussée, place, allée, cour. Ne répond que dans les tuiles détaillées (0 ailleurs). Constante `CURB_HEIGHT` exportée.
- `stats()` : tuiles détaillées et lointaines, file, triangles et appels de dessin (ville et immeubles séparés), mémoire, temps de construction, plus longue étape et son nom.
- `pending()`, `flush(maxMs?)` (construit tout de suite ce qui est en file : écran de chargement, captures), `whenIdle()`.
- `benchTile(tx, tz, essais)` : mesure de la construction d'une tuile, hors scène et sans immeubles.

NIVEAUX DE DÉTAIL
- Détaillé si la caméra est à moins de `detailRadius` du rectangle de la tuile, lointain jusqu'à `ctx.view.drawDistance`, rien au-delà.
- Hystérésis : le détail est gardé jusqu'à 1,18 × rayon + 24 m ; le lointain jusqu'à 1,08 × distance + 64 m.
- File triée par distance ; la version lointaine d'une tuile passe avant sa version détaillée et lui sert de remplaçant pendant la construction.
- Détail impossible tant que la simulation n'a pas chargé la tuile : la version lointaine en tient lieu.
- Au-delà du rayon de la simulation, les tuiles sont lues par `fetch(baseUrl + fichier)` (défaut './data/paris/', seulement si la carte est « paris »), 3 lectures à la fois. Option `farTiles` : fournir sa fonction, ou null pour désactiver.

QUALITÉ (`CITY_QUALITY`, src/world/view/quality.ts)
| | bas | moyen | haut | ultra |
|---|---|---|---|---|
| Grille de surfaces (cellule) | 512 (1 m) | 1 024 (0,5 m) | 2 048 (0,25 m) | 2 048 |
| Atlas du sol (16 couches) | 256 px | 512 px | 512 px | 512 px |
| Matériaux | Lambert | standard | standard + seconde lecture anti-répétition | idem |
| Rayon détaillé | 170 m | 260 m | 340 m | 460 m |
| Fondu vers la couleur lointaine | 60–120 m | 90–170 m | 120–230 m | 150–300 m |
| Triangles par houppier | 80 | 160 | 260 | 500 |
| Vent, ombres des arbres, halos, caniveaux, grilles d'arbres | non | sans vent | oui | oui |
| Budget de construction par image | 3 ms | 5 ms | 6 ms | 8 ms |

APPELS DE DESSIN
- Tuile détaillée, hors immeubles : 7 au plus — sol, volumes (murs, haies, parapets, piles), eau, panneaux découpés, troncs, houppiers, halos (la nuit).
- Tuile lointaine : 2 (sol, houppiers simplifiés), plus 1 pour les immeubles.
- Lointain : 3 (socle, silhouette de toits, repères : Montmartre, tour Montparnasse, la Défense).

BANC D'ESSAI
- `/harness/world.html?place=champs|chaussee|concorde|rivoli|marais|quai|pont|berge|etoile|ciel|tuileries&heure=&meteo=&quality=&dist=&map=test&carte=1&shot=1`.
- Caméra libre : ZQSD, A/E pour monter et descendre, glisser pour regarder.
- API de test : `__goto(vue, { heure, meteo })`, `__stats()`, `__roundTrip()`, `__map(…)`, `__bench(n)`, `__look`, `__stand`.
- Test : `node tests/e2e/world.mjs [qualité] [vues|tout] [paramètres d'URL]`. Sans argument : qualité moyenne, 9 vues, carte, mesures, aller-retour mémoire — 7 à 8 minutes sur cette machine chargée.

LIMITES
- Reflets du mouillé et de l'eau : couleur du ciel seulement, pas de reflet des façades.
- Halos : taches additives au sol, aux candélabres de la carte ; ils n'éclairent pas les murs.
- Les marquages sont rapprochés de l'œil de 0,009 % de leur distance (2,7 cm à 300 m). Suppose un plan proche de la caméra d'au moins 0,1 à 0,2 m.
- La silhouette de toits est retirée au-dessus de 140 m de hauteur de caméra.
- Peinture des textures partagées au démarrage : 1,2 à 1,7 s mesurés ici.

## Mesures

Mesures dans Chromium headless (WebGL logiciel), machine partagée à charge moyenne 14 à 27 : ordres de grandeur.

**Construction d'une tuile détaillée, hors immeubles et hors appels graphiques** (`benchTile`, chaque étape créditée de sa meilleure durée sur 5 essais ; tuiles de la Concorde, des Champs-Élysées et du Marais)

| Qualité | Durée totale | Étapes | Plus longue étape | Étapes > 4 ms | Triangles | Appels | Mémoire GPU de la tuile |
|---|---|---|---|---|---|---|---|
| bas | 16–18 ms | 91–129 | 1,3–2,3 ms | 0 | 75–82 k | 5–6 | 2,6–2,9 Mo |
| moyen | 18–28 ms | 207–270 | 1,7–2,0 ms | 0 | 102–117 k | 6–7 | 3,7–3,9 Mo |
| haut | 28–56 ms | 914–1 197 | 2,0–2,5 ms | 0 | 194–235 k (houppiers à 500 triangles, réduits depuis à 260 ; non remesuré) | 6–7 | 6,4–6,9 Mo |

- En conditions réelles (envois à la carte graphique compris, machine chargée) : plus longue étape observée de 60 à 570 ms selon les exécutions.
- Immeubles (module voisin, étape indivisible) : 111 à 938 ms au pire.
- Textures partagées peintes au démarrage : 1,2 à 1,7 s ; 30,4 Mo sur la carte graphique en moyen et en haut.

**Vue typique à hauteur d'homme, qualité moyenne, distance d'affichage 1 000 m** (4 tuiles détaillées, 15 à 19 lointaines)
- Ville hors immeubles : 57 à 74 appels de dessin, 0,65 à 1,0 million de triangles.
- Immeubles : 23 à 28 appels, 0,2 à 0,47 million de triangles.
- Image rendue (après élimination hors champ, ombres comprises) : 49 à 92 appels, 0,96 à 1,44 million de triangles.

**Qualité haute, distance 1 300 m** (4 à 6 détaillées, 21 à 28 lointaines)
- Ville : 75 à 101 appels, 0,9 à 1,26 million de triangles après réduction des houppiers (3 vues remesurées ; 1,07 à 1,53 million avant).
- Image : 68 à 110 appels, 1,57 à 1,96 million de triangles sur ces 3 vues.

**Mémoire après aller-retour de 3 763 m** (sans les monuments)
- Moyen : géométries 40 → 30 → 40, textures 24 → 21 → 24.
- Haut : géométries 52 → 30 → 52, textures 30 → 21 → 30.

**Carte 2D** (1 280 × 720)
- Premier dessin, tracés à construire : 93 à 275 ms.
- Carte tactique à 5 m par pixel : 29 à 58 ms.
- Vue rapprochée à 0,5 m par pixel : 3 à 4 ms.

**Sous Node, à chaud**
- Grille de surfaces : environ 7 ms en 512, 22 à 28 ms en 1 024, 85 à 125 ms en 2 048.
- Maillages du sol : 20 à 90 ms par tuile.

**Écart du sol en facettes de 8 m avec le relief bilinéaire** (calculé d'après la torsion du relief, pas mesuré point par point) : 2,4 mm en moyenne ; moins de 1,3 cm sur 98,5 % des mailles ; 4,7 cm au pire.

## Non fait / fragile

- Trottoirs dessinés 8 cm au-dessus de heightAt (pelouses 13 cm) : sans compensation par liftAt, pieds, roues, objets et décalcomanies s'y enfoncent ; aucun autre module ne l'utilise encore
- Budget de 8 ms par image non certifié en conditions réelles : hors appels graphiques, la plus longue étape est de 2,5 ms (meilleure de 5 mesures), mais avec WebGL logiciel et une machine à charge 14 à 27, des étapes de 60 à 570 ms ont été observées
- L'étape des immeubles (buildTileBuildings, module voisin) est indivisible : 111 à 938 ms observés au pire ici, 30 à 130 ms selon son auteur ; isolée dans sa propre image, atlas des façades peint au démarrage
- Aucune mesure d'images par seconde, ni sur une vraie carte graphique, ni sur téléphone ; le coût des envois à la carte graphique n'est pas mesurable ici
- Triangles élevés à cause des arbres et du sol découpé : 0,65 à 1,0 million hors immeubles en qualité moyenne, environ 1,1 million en haute ; pas de niveau de détail par arbre à l'intérieur d'une tuile détaillée
- Qualité haute : le coût de construction par tuile a été mesuré avant la réduction des houppiers de 500 à 260 triangles et pas remesuré ; seul le total de la vue des Champs l'a été (1 514 k → 1 139 k triangles)
- Module non branché dans src/main.ts, et src/render/base n'existe pas : vérifié uniquement dans harness/world.html, avec le vrai Game, src/world/query et src/world/monuments
- Non testés dans le navigateur : changement de qualité en cours de partie, changement de carte ('world:source'), échec de lecture d'une tuile lointaine, qualité ultra, balancement des arbres (captures fixes)
- Tuiles lointaines lues par fetch en contournant la source du module query (ses options parisSource et fsDir sont ignorées) ; repli propre si la lecture échoue : seules les tuiles chargées par la simulation sont dessinées
- Couloirs de bus inventés (aucune donnée) : sur les axes primary ou secondary à 3 voies et plus par sens ; pas de flèches directionnelles ni de pistes cyclables
- Plaques d'égout et rapiéçages placés par le shader, pas d'après des données ; une seule essence d'arbre, une seule saison
- Quais à deux niveaux non modelés : le relief au pas de 25 m écrase les berges basses ; le mur descend du sol jusqu'à l'eau au bord du plan d'eau, et la barrière quay_wall donne le parapet
- Sous un pont, le sol dessiné reste au niveau du terrain alors que heightAt de la simulation y rend l'altitude du tablier : un personnage passant dessous serait dessiné sur le pont
- Arches génériques pour tous les ponts, Pont Neuf et pont Alexandre III compris, tant que les monuments ne les modélisent pas
- Rue de Rivoli : pas de trottoir côté arcades (l'emprise du bâtiment couvre la galerie dans les données)
- Houppiers assez schématiques (volumes bosselés à silhouette découpée) : lisibles, pas réalistes de près
- Défaut vu dans le module des immeubles, non corrigé (pas mon fichier) : dans le quartier d'essai, un balcon filant traverse la place ronde en l'air (tests/e2e/out/world-essai-0.png)
- La carte de Paris a été régénérée par une autre équipe pendant mes essais (deux exécutions ont échoué sur des tuiles momentanément absentes) ; les seuils des deux tests sur données réelles dépendent des données

## Demandes d'évolution du contrat

- WorldQuery.heightAt devrait inclure la hauteur de bordure (+0,08 m sur trottoirs et terre-pleins, +0,10 parkings, +0,13 pelouses) ; à défaut, docs/ARCHITECTURE.md §4 devrait demander aux modules de rendu (personnages, véhicules, mobilier, effets) d'ajouter ctx.service<WorldViewApi>('world.view').liftAt(x, z)
- WorldData (src/world/query/api.ts) : ajouter une lecture de tuile sans collisions, par exemple peekTile(tx, tz): Promise<Tile | null>, pour la vue lointaine au-delà du rayon de chargement ; aujourd'hui src/world/view relit les fichiers par fetch (option baseUrl)
- GameEvents : ajouter 'world:source' { name, fallback } (déjà demandé par le module query) ; je l'écoute en événement libre pour tout reconstruire quand la carte change
- Clé du service des monuments : la consigne dit 'world.monuments', src/world/monuments publie 'monuments' ; je lis les deux, il faudrait en fixer une
- src/world/view/buildings : proposer une construction par étapes (générateur), ou garantir un temps borné ; buildTileBuildings prend 30 à 130 ms d'un seul tenant
- src/world/view/buildings : dans le quartier d'essai, un balcon filant relie deux façades à travers la place ronde (capture tests/e2e/out/world-essai-0.png)
- src/world/query : sous un pont, heightAt rend l'altitude du tablier pour la berge ou la voie qui passe dessous ; le rendu, lui, dessine le sol au niveau du terrain
- ViewApi (src/render/base) : garder un plan proche d'au moins 0,2 m ; exposer la couleur du ciel et de l'horizon éviterait que chaque module la recalcule depuis EnvState pour ses reflets
- Format de carte : rien sur les couloirs de bus, les flèches, les pistes cyclables, le revêtement des trottoirs, l'essence des arbres — ce que je dessine pour les couloirs de bus est une supposition
- docs/ARCHITECTURE.md §6 : signaler que les temps mesurés autour d'appels WebGL en Chromium headless ne sont pas fiables (envois synchrones vers un rendu logiciel occupé)

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans tout le projet ; avec --noUnusedLocals --noUnusedParameters, rien dans src/world/view ni tests/unit/world-view.* ; harness/world.ts contrôlé à part (tsconfig temporaire hors du projet)
- npx vitest run tests/unit/world-view : 7 fichiers, 68 tests, tous passent (dont 2 sur les vraies données de Paris)
- Tests unitaires demandés : ordre de la file, hystérésis détaillé/lointain, exécution par tranches (budget, attente de l'image suivante), bandes de bordure (onglets, jointives, aire, filtre côté chaussée, trous), passages piétons (bandes de 0,5 m, symétrie, emprise réelle), lignes d'arrêt sur les seules voies qui arrivent, lignes de voies, couloir de bus, absence de doublon entre tuiles voisines
- Géométrie pure : triangulation à trous avec aire conservée (60 polygones au hasard), découpe selon les facettes avec aire conservée, règles de la grille de surfaces, tablier rectiligne entre ses deux bouts
- Quartier d'essai : nappe complète hors de l'eau, trottoirs à 8 cm du sol en facettes à 2 mm près, marquages au niveau de la chaussée, pont posé sur une limite de tuile construit une seule fois (4 travées, 3 piles, parapets des deux moitiés)
- Vraies données (tuiles 0_0, -4_-2, -1_0) : l'aire maillée des trottoirs et tabliers égale celle des polygones à 0,2 % près ; pont de la Concorde reconnu comme tablier, plus de 4 m au-dessus de l'eau, avec au moins 3 travées et 2 piles
- Module branché sans rendu (createTestContext avec src/world/query) : services publiés, aucun plantage sur session, événements du monde, dispose
- node tests/e2e/world.mjs (défaut, qualité moyenne, Paris) : OK — 9 vues, 3 cartes, mesures, aller-retour mémoire, aucune erreur de console
- node tests/e2e/world.mjs haut tout "dist=1300" : OK, 11 vues ; qualité basse (matériaux Lambert) : 4 vues OK ; quartier d'essai (map=test) : 3 vues OK
- Captures regardées avec Read : Champs-Élysées vers l'Arc (haut, moyen, bas), Concorde, Rivoli, rue des Rosiers, quai des Tuileries avec le pont, sur le pont de la Concorde, Étoile et Concorde vues du ciel, nuit, pluie (Rivoli et Concorde), halos seuls de nuit, gros plans (pavés, bordure, caniveau, grille d'arbre, passage piéton), Tuileries, horizon (Montmartre, silhouette), Bastille, quartier d'essai, carte 2D de jour et carte tactique de nuit
- Défauts trouvés sur les captures et corrigés : immeubles décalés d'une tuile (origine comptée deux fois), socle noir (normales nulles), flaques couvrant toute la chaussée, arbres lointains blancs, bande d'enrobé le long des bordures des voies pavées, noms qui se chevauchaient sur la carte, moitié de pont manquante sur une limite de tuile
- Mémoire de la carte graphique après un aller-retour de 3 763 m (sans les monuments) : géométries 40 → 30 → 40 et textures 24 → 21 → 24 en qualité moyenne ; 52 → 30 → 52 et 30 → 21 → 30 en haute
- Appels de dessin d'une tuile détaillée hors immeubles : 5 à 7 mesurés, le test échoue au-delà de 8
- Présence des vraies données revérifiée en fin de travail : public/data/paris/manifest.json et 98 tuiles ; le dernier test a tourné dessus (carte « paris »)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/view/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/api.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/system.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/tiles.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/lod.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/quality.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/classes.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/raster.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/earcut.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/tin.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/meshbuf.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/site.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/ground.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/borders.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/markings.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/decks.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/bridges.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/barriers.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/edgeindex.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/trees.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/paint.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/paint-extras.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/materials.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/shared.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/horizon.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/map2d.ts
- /home/user/SafeDeal/crs-simulation/harness/world.html
- /home/user/SafeDeal/crs-simulation/harness/world.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/world.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.lod.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.borders.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.markings.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.geometry.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.ground.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.map2d.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-view.system.test.ts
