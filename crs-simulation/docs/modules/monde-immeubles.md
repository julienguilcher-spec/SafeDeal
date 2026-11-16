# Compte rendu — monde:immeubles

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Les immeubles de Paris sont générés, texturés et vérifiés sur les VRAIES données (public/data/paris, arrivées en cours de travail : 98 tuiles, 30 564 bâtiments), en plus du quartier d'essai. Aucune tuile ne plante ni ne dépasse les budgets ; 83 tests unitaires et le test de bout en bout passent.

Ce qui est fait :
- **Géométrie (logique pure, sans Three.js, testable sous Node)** : nettoyage des anneaux, triangulation à trous (réécriture d'earcut sur tableaux typés), décalage de contour avec distance par côté, simplification, trame des travées et des niveaux.
- **Façades** : un pan de mur = quelques bandes (rez-de-chaussée prolongé de 2 m sous le sol, puis une bande par série d'étages). Le nombre de travées et de niveaux est entier, donc aucune fenêtre n'est coupée. La trame enjambe les petits pans des façades courbes et des rotondes d'angle.
- **Mitoyenneté** : chaque mur est classé libre, mitoyen (pignon aveugle) ou caché par un voisin au moins aussi haut (non dessiné).
- **Styles** : haussmannien (3 variantes : refends, porte cochère, étage noble, balcons filants au 2e et au dernier étage, corniche à modillons), faubourg (enduit, persiennes), moderne (trame béton/verre, mur-rideau), monumental (pilastres, baies cintrées, attique à balustres), cours, pignons, béton.
- **Atlas** : 52 couches peintes sur canvas dans une seule texture tableau, répétée nativement ; alpha = masque des vitrages.
- **Relief en volume** (qualité moyenne et plus) : balcons filants avec garde-corps ajourés, corniches, souches de cheminées avec mitrons ; lucarnes en volume en qualité haute (peintes sinon).
- **Toits** : mansarde (recul côté rue et côté cour, pignon droit côté mitoyen), toit plat à acrotère, deux pans, dôme, auvents. Si le décalage échoue : demi-recul, puis contour non décalé (toit plat).
- **Nuit** : fenêtres allumées par hachage stable (travée, niveau, graine), proportion selon l'heure par un uniforme partagé ; coût par image nul côté JavaScript.
- **Version lointaine** : prismes simplifiés, murs cachés supprimés, fenêtres et couverture peintes par le shader, 1 appel de dessin.
- **Banc d'essai et test e2e** : captures regardées de jour, au crépuscule et de nuit, à hauteur d'homme et en vue aérienne, sur Paris réel (tuile de l'Opéra) et sur le quartier d'essai. Le rendu évoque bien une rue parisienne.

Deux réserves :
- La première construction d'une tuile dense, à froid, a pris de 126 à 181 ms selon la charge de la machine ; à chaud la médiane est d'environ 34 ms.
- La normal map facultative de la qualité haute n'est pas faite.

Je n'ai fait aucun commit ; un autre processus enregistre automatiquement les fichiers en cours.

## API publique et mode d'emploi

MODULE : `src/world/view/buildings/index.ts`. Il n'importe que `three`, `src/world/mapdata.ts` et des types de `contracts.ts`.

INTERFACE IMPOSÉE (respectée telle quelle)
```ts
export interface BuildingViewOptions { quality: QualityLevel; heightAt(x: number, z: number): number; skipLandmark(key: string): boolean; seed: number }
export interface TileBuildingsView { object: THREE.Object3D; update(env: EnvState, camX: number, camY: number, camZ: number): void; dispose(): void; triangles: number; drawCalls: number }
export function buildTileBuildings(tile: Tile, opts: BuildingViewOptions): TileBuildingsView
export function buildTileBuildingsFar(tile: Tile, opts: BuildingViewOptions): TileBuildingsView
export function disposeSharedBuildingResources(): void
```

COMPORTEMENT À CONNAÎTRE
- `object` est un `THREE.Group` posé à l'origine de la tuile (tx·512, 0, tz·512), sommets relatifs. Il est en coordonnées monde : l'ajouter tel quel au groupe du monde.
- Version détaillée : maillage `facades` (opaque, castShadow et receiveShadow) et, hors qualité basse, maillage `garde-corps` (test alpha, double face). Soit 1 appel de dessin en « bas », 2 sinon.
- Version lointaine : 1 maillage, 1 appel de dessin, sans ombre portée.
- `update(env, camX, camY, camZ)` lit `env.timeOfDay`, `env.daylight`, `env.clouds` et met à jour deux uniformes partagés. Sans effet si rien n'a changé ; on peut l'appeler à chaque image. Il masque aussi les garde-corps au-delà d'environ 260 m de la tuile. `camY` n'est pas utilisé.
- `dispose()` libère les géométries de la tuile et détache l'objet de son parent. Les ressources partagées restent.
- `disposeSharedBuildingResources()` libère atlas, matériaux et tampons de génération. À appeler après avoir libéré les tuiles (changement de qualité, fin de partie) ; tout est recréé à la demande.
- `skipLandmark(clé)` n'est appelée que pour les bâtiments dont `landmarkKey` n'est pas vide.
- `heightAt` : le pied du bâtiment est le minimum sur les sommets de l'emprise ; les murs descendent 2 m plus bas. Si `heightAt` renvoie NaN ou infini : repli sur `building.baseY`, puis 0.
- `seed` fait varier teintes, variantes de façade, matériaux de toit et fenêtres allumées, pas la géométrie. Le même bâtiment a le même aspect en détaillé et en lointain.
- Les maillages ne répondent pas à `Raycaster` (`raycast` neutralisé) et leurs tableaux sont libérés après l'envoi à la carte graphique : visées et collisions passent par `WorldQuery`.

EXPORTS SUPPLÉMENTAIRES (facultatifs)
- `prepareSharedBuildingResources(quality)` : peint l'atlas à l'avance (écran de chargement) ; retourne `{ paintMs, bytes }`. Sinon l'atlas est peint à la première tuile.
- `buildingFacadeLayout(building, heightAt)` : retourne `{ baseY, groundFloorHeight, upperFloors, floorHeight, wallHeight, roofHeight }` ou null. C'est exactement la trame des maillages ; prévu pour le module des vitrines (le rez-de-chaussée fait de 2,8 à 6,5 m selon le style et le bâtiment).
- `lastBuildingBuildStats()` : `{ buildings, vertices, triangles, gpuBytes, step }` de la dernière tuile construite.
- `buildingLightingState()` : `{ litFraction, intensity, night }`.

QUALITÉS
| Qualité | Cellule d'atlas | Matériau | Géométrie |
|---|---|---|---|
| bas | 128 px | Lambert | balcons et lucarnes peints, pas de corniche ni de cheminée, 1 appel de dessin |
| moyen | 256 px | Standard | balcons en volume, corniches, cheminées, acrotères ; lucarnes peintes |
| haut | 256 px | Standard + grain de près | comme moyen, plus lucarnes en volume, abouts de dalles et retours de garde-corps |
| ultra | 512 px | comme haut | géométrie identique à haut |

Si une tuile dépassait 250 000 triangles, le détail serait réduit par paliers (lucarnes, puis corniches, puis balcons). Aucune tuile de Paris n'en a besoin.

COÛTS MESURÉS (machine de développement chargée, Chromium headless, WebGL logiciel)
| Tuile | Qualité | Triangles | Construction à chaud (médiane) | 1re construction à froid |
|---|---|---|---|---|
| 4,0 (la plus dense, 754 bâtiments) | haut | 182 807 | 33,5 ms | 133 ms |
| 4,0 | moyen | 142 029 | 31 ms | 88 ms |
| 4,0 | bas | 53 453 | 19 ms | 101 ms |
| 4,0 | lointain | 8 836 | ≈ 5 ms | — |
| 1,-1 (Opéra, 403 bâtiments) | haut | 123 395 | — | — |
| 1,-1 | moyen | 91 467 | — | — |
| 1,-1 | bas | 34 859 | — | — |

- Mémoire carte graphique, tuile de l'Opéra : 8,3 Mo en haut (249 664 sommets), 6,0 Mo en moyen, 2,3 Mo en bas.
- Tout Paris, 98 tuiles (génération pure sous Node) : maximum 182 807 triangles en haut (moyenne 88 899), 142 029 en moyen, 58 403 en bas, 9 999 en lointain (moyenne 4 826).
- Atlas : 52 couches. 256 px : 140 à 205 ms, 13 Mo. 128 px : 63 à 89 ms, 3,3 Mo. 512 px : 383 à 431 ms, 52 Mo (compter un tiers de plus sur la carte graphique pour les mipmaps).
- Par image : aucun calcul JavaScript hors `update()`.

BANC D'ESSAI
- Page : `/harness/buildings.html?quality=haut&view=street|facade|close|roofs|aerial|far|top&hour=15`.
- Autres paramètres : `tile=tx,tz`, `src=paris|test|<dossier>`, `neighbors=far|detail|none`, `shadows=0`, `atlas=1` (planche de contact des couches).
- API de test : `window.__setView`, `__setTime`, `__setCamera`, `__find`, `__bench`, `__dispose`, `__stats`.
- Test e2e : `node tests/e2e/buildings.mjs [qualités] [paramètres d'URL] [préfixe]`, captures dans `tests/e2e/out/buildings-*.png`. Par défaut il utilise Paris réel, tuile de l'Opéra.

LIMITES
- Mitoyenneté calculée dans la tuile seulement : un mur accolé à un bâtiment d'une tuile voisine reçoit des fenêtres (le plus souvent masquées par ce voisin).
- Une cour n'est reconnue que si elle est un trou du polygone ; une cour formée par plusieurs bâtiments reçoit des façades « sur rue ».
- Terrasson de mansarde plat ; toit à deux pans à faîtage unique dans l'axe du plus long côté (ni croupes ni noues).
- Fenêtres identiques par type de cellule (8 familles, plus teinte par immeuble).
- Version lointaine : dessus plats, cours de moins de 220 m² ignorées, changement détaillé/lointain visible (à gérer par le chargeur).
- Garde-corps en test alpha : léger scintillement possible à mi-distance.
- Intensités nocturnes réglées avec ACES, exposition 0,95, dans le banc d'essai.
- Perte de contexte WebGL non gérée.
- En qualité autre que basse, Three.js garde sa propre texture DFG après libération (ce n'est pas la nôtre).

## Mesures

Machine chargée pendant les mesures (charge moyenne 11 à 15, autres agents en parallèle) ; Chromium headless, WebGL logiciel.

TOUT PARIS — `public/data/paris`, 98 tuiles, 30 564 bâtiments, relief réel (génération pure, Node/vitest)
| Qualité | Triangles max | Triangles moyens | Génération moyenne | Génération max |
|---|---|---|---|---|
| haut | 182 807 (tuile 4,0, 754 bâtiments) | 88 899 | 13,1 ms | 70 ms |
| moyen | 142 029 | 68 739 | 11,2 ms | 33 ms |
| bas | 58 403 | 28 058 | 10,7 ms | 76 ms |
| lointain | 9 999 | 4 826 | — | 48 ms |
- Budgets : 250 000 en détaillé, 15 000 en lointain. Aucune tuile au détail réduit ; palier de simplification lointain 0 partout.
- Faces à l'envers : 6 sur 7 685 436 en qualité haute.

TUILE LA PLUS DENSE (4,0, 754 bâtiments) — navigateur, `buildTileBuildings` complet (génération + géométries)
| Qualité | Triangles | 1re fois (à froid) | 15 essais : médiane (min – max) |
|---|---|---|---|
| haut | 182 807 | 133 ms | 33,5 ms (29,3 – 70,7) |
| moyen | 142 029 | 88 ms | 31,3 ms (24,2 – 57,2) |
| bas | 53 453 | 101 ms | 19,2 ms (15,0 – 38,1) |
| lointain | 8 836 | — | ≈ 5 ms |
- Sur d'autres passes à forte charge, la première construction en qualité haute a varié de 126 à 181 ms.
- Profil sous Node (jeu de mise au point de 763 bâtiments, même îlot) : préparation 5,2 ms dont 4,5 ms de classement des murs ; génération haut 24 ms, moyen 22 ms, bas 14,5 ms, lointain 4 à 5 ms ; copies vers les géométries 6 à 7 ms.

TUILE DE L'OPÉRA (1,-1, 403 bâtiments) — navigateur
| Qualité | Triangles | Sommets | Mémoire GPU | Appels de dessin | Médiane à chaud |
|---|---|---|---|---|---|
| haut | 123 395 | 249 664 | 8,3 Mo | 2 | 31 à 52 ms selon la charge |
| moyen | 91 467 | 180 036 | 6,0 Mo | 2 | 24 ms |
| bas | 34 859 | 66 879 | 2,3 Mo | 1 | 13 à 15 ms |
- Voisines en lointain : maximum 6 195 triangles, 1 appel de dessin chacune.
- Scène entière du banc d'essai en haut : 9 appels de dessin (1 tuile détaillée, 8 lointaines, sol), 290 732 triangles ombres comprises.

ATLAS (52 couches)
| Cellule | Qualités | Peinture | Taille (hors mipmaps) |
|---|---|---|---|
| 128 px | bas | 63 à 89 ms | 3,3 Mo |
| 256 px | moyen, haut | 140 à 205 ms | 13,0 Mo |
| 512 px | ultra | 383 à 431 ms | 52,0 Mo |

QUARTIER D'ESSAI (tuile 0,-1, 334 bâtiments) : haut 53 736 triangles, moyen 30 364, bas 9 658, lointain 2 478.

LIBÉRATION : 11 géométries et 5 textures avant, 1 géométrie (le sol du banc) et 3 textures après (2 de la carte d'ombres du banc, 1 table DFG de Three.js). En qualité basse : retour exact au niveau de référence.

TESTS : 83 tests unitaires réussis (6 fichiers) ; test e2e OK en haut, moyen et bas sur Paris réel.

## Non fait / fragile

- Normal map facultative en qualité haute : non faite. Le relief vient des ombres peintes et de la géométrie (balcons, corniches, lucarnes, cheminées).
- Première construction à froid d'une tuile dense : 126 à 181 ms mesurés selon la charge de la machine, donc parfois au-dessus de 150 ms. À chaud la médiane est de 30 à 54 ms. Des pointes isolées à 150-220 ms sont apparues dans les séries d'essais quand la machine était très chargée (autres agents en parallèle) ; je n'ai pas pu mesurer sur machine au calme.
- Aucune mesure sur une vraie carte graphique ni sur téléphone : WebGL logiciel seulement, donc pas d'images par seconde.
- Pas d'intégration avec le chargeur de tuiles ni avec le rendu du jeu (ils n'existaient pas encore) : lumières, ombres en cascade, brouillard et tone mapping réels non essayés ; le banc d'essai a son propre éclairage.
- Mitoyenneté entre tuiles voisines non traitée : l'interface ne reçoit qu'une tuile.
- Cours formées par plusieurs bâtiments non reconnues ; les surfaces « courtyard » et les arêtes de rue de la tuile ne sont pas exploitées.
- Toits : terrasson plat, pas de croupes ni de noues, lucarnes en volume omises près des plis d'une façade courbe.
- Pas de fondu entre version lointaine et version détaillée : c'est au chargeur de gérer l'échange.
- Perte de contexte WebGL non gérée (tableaux libérés après envoi à la carte graphique).
- `roofs.ts` fait 516 lignes après découpage, `walls.ts` 542 : sous la limite indicative de 600.
- Les captures de mise au point (`tests/e2e/out/dbg-*`, `real-*`, `corner-*`, `p5-*`, `p6-*`, `v3-*`) sont restées dans `tests/e2e/out/`, dossier ignoré par git.

## Demandes d'évolution du contrat

- Aucune modification de `contracts.ts`, `mapdata.ts` ni `testDistrict.ts` n'est nécessaire.
- Suggestion non bloquante pour l'auteur du chargeur : ajouter à `BuildingViewOptions` un champ facultatif `neighbors?: readonly Tile[]` (les 8 tuiles voisines si elles sont chargées). Il permettrait de traiter les murs mitoyens à cheval sur deux tuiles, aujourd'hui dessinés comme des façades à fenêtres.
- Information pour le module des vitrines : la hauteur du rez-de-chaussée varie par bâtiment (2,8 à 6,5 m selon le style). Utiliser `buildingFacadeLayout(building, heightAt)` de `src/world/view/buildings/index.ts`, qui donne le pied et la hauteur exacts.
- Information pour le rendu de base : les fenêtres éclairées sont de l'émissif (0,2 le jour, environ 1,7 la nuit, en linéaire) réglé sous ACES à exposition 0,95. Si le jeu choisit un autre tone mapping ou une autre exposition, l'intensité est à ajuster dans `updateBuildingUniforms` de `materials.ts`.

## Vérifications exécutées

- Types : `npx tsc --noEmit` ne signale aucune erreur dans `src/world/view/buildings/` ni dans `tests/unit/world-buildings.*` ; `harness/buildings.ts` vérifié avec un tsconfig temporaire (le projet n'inclut pas `harness/`).
- Tests unitaires : `npx vitest run tests/unit/world-buildings` donne 6 fichiers, 83 tests réussis (anneaux, triangulation, trame, génération, éclairage, vraies tuiles de Paris).
- Triangulation : aires exactes sur polygones convexes, concaves et à trous, et sur 150 formes étoilées aléatoires avec cours ; aucun plantage ni boucle sur 400 nuages de points aléatoires, nœud papillon, trou hors emprise ou plus grand que l'emprise, NaN et infini ; 500 sommets en moins de 250 ms.
- Trame : pour chaque style et chaque longueur de 0 à 120 m (pas de 5 cm), n·largeur + 2·trumeau = longueur, largeurs dans les bornes, n croissant ; pour les hauteurs de 2 à 70 m, rez-de-chaussée + n·étage = hauteur du mur, dans les bornes.
- Toitures, chiffrées sur le maillage : aire du terrasson de mansarde (recul 0,42 × hauteur du comble, nul côté mitoyen), demi-recul puis repli à plat sur emprise étroite, toit plat avec et sans acrotère, deux pans (faîtage sur la médiane, projection = emprise), dôme et son repli, cour non recouverte.
- Sens des faces : aucun triangle contraire à sa normale sur le quartier d'essai et sur les polygones dégénérés ; 6 sur 7 685 436 sur tout Paris en qualité haute.
- Vraies données `public/data/paris` (98 tuiles, 30 564 bâtiments, relief réel) : toutes les tuiles générées en bas, moyen et haut sans erreur, budgets tenus (maximum 182 807 triangles en détaillé, 9 999 en lointain), aucune tuile au détail réduit.
- Bout en bout : `node tests/e2e/buildings.mjs haut,moyen,bas` sur Paris réel (tuile 1,-1) se termine en OK, sans erreur de page ni de shader ; 2 appels de dessin en haut et moyen, 1 en bas, 1 en lointain.
- Libération : après `dispose()` et `disposeSharedBuildingResources()`, géométries et textures reviennent au niveau du banc d'essai seul (plus la texture DFG propre à Three.js hors qualité basse).
- Captures regardées (outil Read) sur Paris réel et sur le quartier d'essai, à 15 h, 19 h 30, 20 h 20 et 22 h : rue, façade de face, pied d'immeuble, toits, vue aérienne, limite détaillé/lointain, vue de dessus, plus des vues ciblées (dôme du kiosque, mairie à cour, rue de faubourg, immeuble moderne, rotonde d'angle).
- Défauts trouvés sur les captures ou par les tests, puis corrigés : bruit de texture trop marqué, toits lointains teintés par la couleur des murs, lueur nocturne excessive des tuiles lointaines, rotondes d'angle aveugles, balcons qui se croisaient dans les angles rentrants, tuiles trop fréquentes et trop orange.
- Temps mesurés dans le navigateur sur la tuile la plus dense (4,0, 754 bâtiments) et la tuile de l'Opéra ; chiffres dans le champ « metrics ».
- Présence de `public/data/paris` revérifiée en fin de travail : manifeste, relief et 98 tuiles présents ; le banc d'essai et le test e2e les utilisent par défaut.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/generate.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/prepare.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/walls.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/roofs.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/roofDetails.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/rings.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/triangulate.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/layout.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/layers.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/meshdata.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/atlas.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/paint.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/paintHaussmann.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/paintStyles.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/paintRoofs.ts
- /home/user/SafeDeal/crs-simulation/src/world/view/buildings/materials.ts
- /home/user/SafeDeal/crs-simulation/harness/buildings.html
- /home/user/SafeDeal/crs-simulation/harness/buildings.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/buildings.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.rings.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.triangulate.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.layout.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.generate.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.materials.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/world-buildings.paris.test.ts
