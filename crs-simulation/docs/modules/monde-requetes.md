# Compte rendu — monde:requêtes

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le monde côté simulation est écrit, branché et vérifié, y compris sur la vraie carte de Paris arrivée en cours de route dans public/data/paris : 70 tests unitaires passent (dont 8 sur les vraies données) et le banc d'essai 2D donne 12 captures, toutes regardées.

**Ce qui est livré** (src/world/query, 19 fichiers, aucun import d'exécution de Three.js ni de DOM)
- Les trois sources de données (fetch, mémoire, fichiers sous Node avec node:fs chargé dynamiquement), le choix Paris / quartier d'essai selon le mode de session, et le repli avec avertissement `ctx.ui.notify` si le manifeste est introuvable.
- Le magasin de tuiles (700 m / 1 100 m, hystérésis, événements, `whenLoaded`) et le service `world.data`.
- Toutes les méthodes de `WorldQuery`, publiées dans `ctx.world` par un système d'ordre `SystemOrder.INPUT - 50`.

**Trois choix faits au contact des vraies données, au-delà de la demande**
- **Le graphe fait foi pour le passage.** Là où une voie traverse un bâtiment (porche, galerie, entrée de parking) ou une barrière, une ouverture est pratiquée, avec ses murs latéraux. Sans cela, un itinéraire mènerait dans un mur.
- **L'emprise réelle des ponts.** Les chaussées et trottoirs de la carte qui recouvrent l'eau servent de tablier : le pont de la Concorde est praticable sur ses 35 m, parapets au bord réel. Sans emprise fournie, la largeur de l'arête sert de repli.
- **Les obstacles des monuments.** `src/world/monuments/colliders.ts` existe maintenant et est utilisé : on passe entre les piliers de l'Arc de Triomphe. Un monument sans fichier d'obstacles garde l'emprise précise de ses bâtiments (cours du Louvre, du Palais de Justice), plutôt que son contour plein.

**Limites à connaître**
- Le dernier saut d'un itinéraire, de la rue au point demandé, est une ligne droite : il peut traverser une grille si la destination est dans un enclos sans allée.
- `resolveCircle` ne reçoit qu'une position : une barrière mince peut être franchie au-delà d'environ 8 m/s par pas de 0,05 s. J'ai ajouté `sweepCircle` (hors contrat) pour les appelants rapides.
- Dans un recoin plus étroit que le disque, il peut ressortir de l'autre côté d'une grille : 12 cas sur 320 000 pas dans Paris, dont 2 de plus de 1,3 m. Aucun pas ne finit dans un obstacle.
- Monde quasi 2D : une berge basse qui passe sous un pont prend l'altitude du tablier.

Les temps ont été mesurés sur une machine partagée et chargée ; rien n'a été mesuré sur téléphone.

## API publique et mode d'emploi

BRANCHEMENT
- Racine de composition : `import { createSystems as worldQuery } from '@/world/query';` puis l'ajouter à MODULES dans src/main.ts (pas encore fait : fichier de l'intégrateur).
- Avec options : `game.addModule(() => createWorldQuerySystems({ source, parisSource, baseUrl, fsDir, testSeed, loadRadius, unloadRadius, colliders }))`.
- Sans moteur (bancs d'essai, tests) : `const w = createWorldQuery(options); await w.boot(); w.setFocus(x, z); await w.whenLoaded(x, z, r);`
- Un seul système, id 'world:query', order = SystemOrder.INPUT - 50. Dans provide() : `ctx.world = monde`, `ctx.provide('world.data', …)`, `ctx.provide('world.query', monde)`.
- En mode headless, le quartier d'essai est installé de façon synchrone dès provide() : ctx.world est utilisable juste après createTestContext({ modules: [createSystems] }), sans rien attendre.

SERVICE 'world.data' — `import type { WorldData } from '@/world/query/api'` ; types de src/world/mapdata.ts
```ts
interface WorldData {
  readonly manifest: Manifest;
  readonly roadGraph: RoadGraph;          // décodé, avec tunnel, surface, landmarkKey
  readonly places: readonly Place[];      // avec importance et ref
  readonly landmarks: readonly Landmark[];
  readonly terrain: Terrain;
  tile(tx: number, tz: number): Tile | null;   // tuile décodée si chargée, sinon null ; lecture seule
  loadedKeys(): readonly string[];             // clés tileKey « tx_tz » ; tableau interne, ne pas le garder
}
```
- L'objet est stable, mais ses champs sont des accesseurs qui suivent le jeu de données courant : toujours les relire.
- Événements du contrat : 'world:tile_loaded' et 'world:tile_unloaded' { tx, tz }.
- Événement libre (emitAny) : 'world:source' { name: 'paris' | 'test-district', fallback: boolean } quand la carte change ; toutes les tuiles ont été déchargées juste avant.

SERVICE 'world.query' — `WorldQueryExt` = le même objet que ctx.world, plus :
- `sweepCircle(fromX, fromZ, pos, radius)` : déplacement par sous-pas, aucune traversée quelle que soit la vitesse ;
- `isSolidAt(x, z)`, `surfaceCodeAt(x, z)` (indice dans SURFACE_CODES), `whenReady()`, `forEachObstacle(…)`, `stats()`.

CHOIX DE LA SOURCE
- `options.source` : 'auto' (défaut), 'test', 'paris'.
- En 'auto' : session en mode 'test' → quartier d'essai ; tout autre mode → Paris.
- `&map=test` dans l'URL (lu dans le service 'launch', champ raw.map) → quartier d'essai quel que soit le mode.
- `?autostart=test` → Paris n'est pas préchargé au démarrage.
- Navigateur : Paris est lu par fetch dans './data/paris/' (option baseUrl) pendant init().
- Node / headless : Paris est lu dans '<dossier courant>/public/data/paris' (option fsDir), seulement à la première session hors mode test ; whenLoaded attend ce chargement.
- Manifeste introuvable ou invalide : quartier d'essai, `ctx.ui.notify(…, 'warn')` à chaque début de session concerné, `stats().fallback === true`. Pas de nouvelle tentative avant rechargement de la page.

CHARGEMENT
- `setFocus(x, z)` charge les tuiles à moins de 700 m et décharge au-delà de 1 100 m (distance du point au rectangle de la tuile).
- Sans setFocus explicite depuis 1 s, le monde suit `ctx.player.person()` toutes les 0,25 s.
- `isLoaded` vaut true hors de la carte (rien à charger). Tuile non chargée : surfaceAt = 'void', aucun obstacle.
- Une tuile illisible passe en échec sans bloquer whenLoaded ; 3 tentatives au plus.

RELIEF ET SURFACES
- `heightAt` : relief bilinéaire. Sur un pont, à moins de (largeur/2 + trottoir) de l'axe (1,5 m au minimum) : interpolation linéaire selon l'abscisse curviligne entre l'altitude du relief aux deux nœuds de l'arête. Pour un pont en plusieurs arêtes, les nœuds intermédiaires sont interpolés selon les longueurs. Raccord de 1,5 m sur les côtés. Sur l'emprise réelle d'un pont (surface dure recouvrant l'eau) : même altitude, amenée sur 8 m depuis chaque bout. **Le rendu doit reprendre cette formule pour que les personnages posent le pied sur le tablier.**
- `surfaceAt` : grille de 1 m par tuile, rasterisée à la première requête. Ordre : surfaces de la carte, voies piétonnes, chaussées, ponts, bâtiments, porches. Ce qui n'est rien d'autre est 'sidewalk'.
- Si la tuile fournit des polygones de chaussée, ils font foi ; l'arête ne comble que les zones sans information et apporte les pavés ('sett').
- Correspondance : pedestrian, courtyard, parking → 'plaza' ; median → 'sidewalk' ; garden, grass, cemetery → 'park' ; construction, sports, rail → 'gravel'. 'interior' n'est jamais produit.

COLLISIONS
- Murs de bâtiments, de monuments et berges à une face ; barrières à deux faces avec demi-épaisseur (mur 0,2 m ; haie 0,4 ; grille 0,15 ; garde-corps 0,12). Les portails 'gate' ne sont pas des obstacles.
- L'eau est un obstacle plein hors des ponts. Un centre de disque qui se retrouve dans un bâtiment ou dans l'eau est ramené sur la face libre la plus proche.
- `resolveCircle` ramène aussi le centre dans l'emprise de la carte.
- `raycast` touche tout obstacle au déplacement : kind 'building' (bâtiments, monuments) ou 'barrier' (barrières, berges, parapets). height = hauteur du bâtiment ou de la barrière ; mur de quai 1 m au plus ; berge 0 ; parapet généré 1. id vaut toujours 0.
- `lineOfSight` n'est arrêtée que par les bâtiments, les monuments, et les murs ou haies d'au moins 1,7 m. Grilles, garde-corps, murs de quai, berges et parapets laissent voir.

RUES ET ITINÉRAIRES
- `nearestRoad` : 120 m par défaut.
- `findPath` : accroche à 250 m au plus. La polyligne est [départ, accroche, sommets des voies, accroche, arrivée]. Le tableau `out` est réécrit en place : le réutiliser évite toute réallocation.
- 'vehicle' : coût en temps, sens uniques respectés, voies piétonnes exclues. 'foot' : coût en longueur. Souterrains exclus dans les deux modes.
- Une extrémité accrochée hors du réseau principal (allée isolée, sens unique sans issue au bord de la carte) est raccrochée à celui-ci.
- `randomFreePoint` : 'sidewalk' = trottoir ou place ; 'road' = chaussée d'une voie carrossable, pont compris ; 'any' = tout sol praticable. Le point est toujours relié en ligne droite à l'axe d'une voie : jamais dans une cour fermée.

LIEUX
- `placeByName` : sans accents ni casse ; ordre nom exact, mots entiers, sous-chaîne, débuts de mots ; puis importance, puis nature (une place avant une station). Quelques noms d'usage : « étoile », « place de l'Étoile » → Place Charles de Gaulle ; « les Champs » → Avenue des Champs-Élysées.
- `sectorName` : le pont où l'on est, sinon la place ou le jardin, sinon la voie nommée (une galerie ou une allée ne l'emporte pas sur l'avenue qu'elle longe), sinon « secteur <lieu proche> », sinon le quartier. Mot générique en minuscule : « place de la Concorde ».

MONUMENTS
- `getColliders(clé, site)` de src/world/monuments/colliders.ts est chargé par import.meta.glob facultatif. La clé est passée telle qu'elle est dans la carte ; les obstacles sont attendus en repère local.
- Obstacles propres : ils remplacent l'emprise des bâtiments marqués et sont permanents (indépendants des tuiles). Ceux dont le dessous est à plus de 2,5 m sont ignorés.
- Monument sans obstacles propres : ses bâtiments gardent leur emprise ; s'il n'a aucun bâtiment (statue, colonne), son contour sert d'obstacle. Un pont dont l'arête porte une clé de monument n'est jamais un obstacle.

AIDES DE TEST — src/world/query/testkit.ts : `seededRandom`, `pathLength`, `miniMapRaw()` (mini-carte avec porche, souterrain, mur coupé, bassin, deux ponts, statue) et ses repères `MINI_MAP`.

PERFORMANCES — voir le champ metrics. Les requêtes n'allouent ni objet, ni tableau, ni fermeture.

## Mesures

Mesures sous Node 22, machine partagée et chargée (charge moyenne 5 à 15) : valeurs à chaud sauf mention, à prendre comme ordres de grandeur.

| Mesure | Quartier d'essai (4 tuiles, 5 100 segments) | Paris (12 tuiles, 43 500 segments) |
|---|---|---|
| 100 000 resolveCircle | 33 à 46 ms (0,33 à 0,46 µs l'unité) | 24 à 69 ms |
| 1 000 raycast de 20 à 200 m | 0,6 à 1,0 ms | 0,9 à 1,4 ms |
| 1 000 lineOfSight | 0,4 à 0,5 ms | non mesuré |
| 200 findPath | 0,7 ms à chaud (3,5 µs l'unité), 14 à 23 ms à froid | 60 à 130 ms à chaud à travers toute la carte (0,3 à 0,65 ms l'unité, 120 à 140 points), 300 à 950 ms à froid |
| 100 000 heightAt | 13 à 44 ms | non mesuré |
| 100 000 surfaceAt | 13 à 37 ms | non mesuré |
| 10 000 nearestRoad | 7 à 20 ms | non mesuré |
| 10 000 isFree | 6 à 10 ms | non mesuré |

Chargement de Paris
- Fichiers de base (17 242 nœuds, 20 060 arêtes, 3 023 lieux, 43 monuments) lus, décodés et indexés : 250 à 450 ms à froid, environ 100 ms à chaud.
- 36 tuiles centrales (153 000 segments, 12 350 polygones) : 557 ms à froid, 300 ms à chaud. Par tuile : décodage 0,3 à 1,1 ms, obstacles 6,5 à 12,4 ms.
- Grille de surfaces à la demande : 9,5 à 12,5 ms par tuile.
- Itinéraire Étoile → Concorde : 1,2 ms.

Mémoire estimée : environ 33 octets par segment (5 Mo pour 36 tuiles), 0,8 Mo par grille de surfaces rasterisée.

Dans Chromium headless (banc d'essai, tracé compris) : 0,3 à 1,9 µs par resolveCircle, 150 à 560 ms par vue complète.

## Non fait / fragile

- Dernier saut d'un itinéraire en ligne droite : de l'accroche sur la rue au point demandé, rien ne garantit le passage (destination dans un square clos sans allée dans le graphe)
- resolveCircle seul ne peut pas empêcher la traversée d'une barrière mince à très grande vitesse (au-delà d'environ 8 m/s par pas de 0,05 s pour un disque de 0,3 m) ; sweepCircle le fait mais n'est pas dans le contrat
- Recoins plus étroits que le disque (grille posée contre un mur) : il peut ressortir de l'autre côté. Vraies données : 12 déplacements de plus de 0,77 m sur 320 000 pas, dont 2 de plus de 1,3 m ; sur 2,4 millions de pas avant le dernier changement, 58 dont 2 de plus de 1,3 m (5,6 m au pire)
- Monde quasi 2D : une berge basse ou une voie qui passe sous un pont prend l'altitude du tablier sur sa largeur ; aucun parapet n'est généré au-dessus de la terre ferme
- Un bâtiment sans cour dans les données mais traversé par une voie de service reçoit un couloir creusé le long de cette voie (visible à la préfecture de police) : cohérent avec le graphe, pas avec la réalité
- Carte de Paris introuvable : pas de nouvelle tentative de chargement avant rechargement de la page
- Aucune mesure sur téléphone ni dans un vrai navigateur de bureau ; seulement Node et Chromium headless, sur une machine partagée et chargée (charge moyenne 5 à 15) : les temps varient du simple au triple
- src/main.ts n'est pas modifié : le module n'est pas encore dans MODULES (fichier de l'intégrateur)
- Les vraies données ont été régénérées pendant mon travail (18 761 nœuds puis 17 242) ; les tests passent sur les deux versions, mais quelques-uns ont des seuils liés aux données (largeur de la Seine en x = 80, longueur Étoile → Concorde, noms de lieux)
- Un fichier tests/unit/input.zz-scratch.test.ts traîne dans le dépôt : il n'est pas de moi, je n'y ai pas touché

## Demandes d'évolution du contrat

- RoadEdgeInfo : ajouter `tunnel: boolean` (une arête souterraine n'est pas praticable en surface et rien ne le dit dans le contrat), et si possible `landmarkKey` et le revêtement complet ; en attendant, ces champs sont dans ctx.service<WorldData>('world.data').roadGraph
- WorldQuery : ajouter un déplacement balayé `sweepCircle(fromX, fromZ, pos, radius): boolean` — resolveCircle ne connaît pas la position précédente et ne peut pas garantir l'absence de traversée d'une barrière mince ; disponible aujourd'hui par ctx.service<WorldQueryExt>('world.query')
- WorldQuery : ajouter `isSolidAt(x, z): boolean` (dans un bâtiment ou dans l'eau ?) et une variante sans chaîne de surfaceAt ; disponibles par 'world.query'
- GameEvents : ajouter 'world:source' { name: string; fallback: boolean } — aujourd'hui émis en événement libre (emitAny) ; le rendu de la ville en a besoin pour reconstruire monuments et lointain quand la carte change
- PlaceInfo : ajouter `importance` (0 à 3) pour les cartes et le choix des lieux de mission ; présent dans world.data.places
- MapShopInfo : ajouter l'identifiant stable `id` et `buildingId` du commerce (seul `index` dans la tuile est transmis)
- RayHit.id vaut toujours 0 pour le décor statique : s'il faut identifier le bâtiment touché (dégradations, tags), prévoir un champ dédié, les identifiants de bâtiments de la carte n'étant pas des EntityId
- Format de carte (docs/map-format.md, pas contracts.ts) : préciser que les polygones de chaussée et de trottoir qui recouvrent l'eau sont les tabliers des ponts — c'est ainsi que je les lis ; un drapeau `covered` sur les arêtes passant sous un immeuble éviterait de le déduire par géométrie
- docs/ARCHITECTURE.md : documenter la formule d'altitude des tabliers (voir publicApi) pour que src/world/view pose ses maillages à la même hauteur que heightAt

## Vérifications exécutées

- npx tsc --noEmit (avec en plus --noUnusedLocals --noUnusedParameters) : aucune erreur dans src/world/query ni dans tests/unit/world-query.* ; harness/world-query.ts contrôlé à part avec un tsconfig temporaire (hors du tsconfig du projet) : aucune erreur
- npx vitest run tests/unit/world-query : 8 fichiers, 70 tests, tous passent (collision 12, surfaces 7, roads 8, places 6, tiles 10, passages 15, bench 4, paris 8)
- Quartier d'essai : on n'entre pas dans un immeuble, on glisse le long d'un mur, on contourne un coin sans à-coup, coin rentrant, pas de traversée (saut de 6 m dans un immeuble, balayage de 42 m, sprint à 9 m/s contre une grille)
- Quartier d'essai : on ne tombe pas dans le fleuve, on le traverse par le pont entre ses garde-corps, on ne franchit la grille du square qu'au portail, continuité aux limites de tuiles
- Quartier d'essai : raycast (façade, grille, mur de quai, hauteurs, normale), lineOfSight (îlot, monument, grille, haie basse, fleuve), 23 surfaces attendues, hauteur du bâti, accord grille / obstacles pleins sur plus de 15 000 points
- Quartier d'essai : heightAt égal au relief bilinéaire et continu sur 7 lignes ; nearestRoad comparé à une recherche exhaustive sur 300 points ; itinéraires piéton et véhicule (sens uniques, rue piétonne contournée, giratoire, pont), 200 itinéraires au hasard tous valides ; randomFreePoint sur 5 lieux
- Magasin de tuiles : chargement, hystérésis, déchargement, événements, whenLoaded loin du centre d'intérêt, tuile illisible ; les trois sources ; choix de la source (mode test, autre mode, option, &map=test) ; repli avec ctx.ui.notify ; ordre du système et services publiés
- Mini-carte : porche sous un immeuble, souterrain qui ne perce pas, mur ouvert par une rue, allée à travers un bassin, mur de quai ouvert sous un pont, parapets générés, emprise réelle d'un pont plus large que son arête, tablier qui ne suit pas le lit de la rivière
- Monuments : piliers injectés (passage entre eux et sous un linteau), cap du monument, repli sur l'emprise, statue sans bâtiment, pont modélisé jamais plein
- Vraies données (public/data/paris, 98 tuiles) : place de la Concorde praticable (940 points libres sur 961) ; la Seine est de l'eau sur 123 m en x = 80, infranchissable hors des ponts ; itinéraire à pied Étoile → Concorde de 2 376 m (2 098 m à vol d'oiseau)
- Vraies données : 800 marcheurs, 320 000 pas dans dix quartiers, 0 dans un obstacle ; Arc de Triomphe avec les piliers du modèle (504 m² pleins pour 1 389 m² d'emprise) ; noms de lieux et de secteurs usuels
- node tests/e2e/world-query.mjs : OK, 12 captures dans tests/e2e/out/world-query-*.png, toutes regardées avec Read (quartier d'essai : ensemble, place, square, pont, détail ; Paris : Étoile, Concorde, île de la Cité, détail Concorde, pont de la Concorde ; module branché dans le vrai moteur sur les deux cartes) ; 0 pas de marcheur dans un obstacle sur toutes les vues
- Les captures ont fait trouver et corriger trois défauts : berge qui barrait la moitié d'un pont posé sur une limite de tuile, marcheurs poussés dans un mur par des façades en dents de scie, poche sans mur au bout d'une voie qui s'arrête dans un bâtiment
- Allocations : comptage des passages du ramasse-miettes sur 1 000 000 d'appels par type de requête — 0 pour surfaceAt, buildingHeightAt, isLoaded et findPath ; 1 à 13 pour les autres, dus aux nombres flottants que V8 met en boîte au passage d'arguments
- Présence des vraies données revérifiée en fin de travail : public/data/paris/manifest.json présent, les tests Paris tournent dessus

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/query/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/api.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/world.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/base.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/data-view.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/sources.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/source-fs.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/tiles.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/collision.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/obstacles.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/bucket-index.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/monuments.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/raster.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/surfaces.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/roads.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/pathfind.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/spawn.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/places.ts
- /home/user/SafeDeal/crs-simulation/src/world/query/testkit.ts
- /home/user/SafeDeal/crs-simulation/harness/world-query.html
- /home/user/SafeDeal/crs-simulation/harness/world-query.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/world-query.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.collision.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.surfaces.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.roads.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.places.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.tiles.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.passages.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.bench.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-query.paris.test.ts
