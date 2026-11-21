# Format de données de la carte

> Référence du format lu par le jeu et écrit par les outils de `tools/map/`.
> Code : `src/world/mapdata.ts` (types, encodage, décodage, contrôles) et `src/world/testDistrict.ts`
> (quartier d'essai dans le même format). Tests : `tests/unit/mapdata.test.ts`.

## 1. En bref

- La carte est un dossier de fichiers **JSON** : `public/data/paris/` pour Paris.
- Sur disque (types **bruts**, `Raw…`) : colonnes de nombres **entiers**, coordonnées en **décimètres**
  relatives à l'origine de la tuile, anneaux et polylignes codés en **deltas**, énumérations codées par
  leur **indice**. Compact, et décodé par `JSON.parse` puis une passe de boucles simples : ni
  WebAssembly, ni Worker.
- En mémoire (types **décodés**) : mètres monde, radians, chaînes, `Float32Array` pour les géométries.
- `mapdata.ts` n'importe rien et n'utilise que de la syntaxe TypeScript effaçable : Node 22 l'importe
  directement (`import('./src/world/mapdata.ts')`), Vite aussi.
- On ne fabrique jamais un fichier à la main : on construit des objets décodés, puis `encodeTile`,
  `encodeRoadGraph`, `encodeTerrain`, `encodePlaces`, `encodeLandmarks` les écrivent, et `validate…`
  les contrôle.

## 2. Arborescence et budget

```
public/data/paris/
  manifest.json            emprise, origine, taille de tuile, liste des tuiles, attribution, version
  roadgraph.json           graphe routier GLOBAL (nœuds et arêtes)
  places.json              lieux nommés (GPS, radio, missions)
  landmarks.json           monuments modélisés à la main
  terrain.json             relief (grille d'altitudes)
  tiles/t_{tx}_{tz}.json   une tuile de 512 m : bâtiments, surfaces, barrières, points, commerces
```

Les noms sont dans `MAP_FILES` ; `tilePath(tx, tz)` donne `tiles/t_-3_2.json`.
L'emprise de Paris couvre 14 × 7 = **98 tuiles**, soit 98 + 5 = **103 fichiers** (limite : 110).
Limite de taille : 30 Mo au total, soit environ 290 ko par fichier en moyenne.

## 3. Repère, unités, tuiles

| Sujet | Convention |
|---|---|
| Repère | mètres ; `x` = est, `z` = sud (le nord est `-z`), `y` = haut |
| Origine | obélisque de la Concorde : `ORIGIN_LAT = 48.865633`, `ORIGIN_LON = 2.321236` |
| Projection | `x = (lon - lon0) * 73305`, `z = -(lat - lat0) * 111214` — `lonLatToWorld`, `worldToLonLat` |
| Emprise | `PARIS_BBOX` : longitude 2.2850 à 2.3725, latitude 48.8500 à 48.8780, soit x de -2656 à 3758 m et z de -1375 à 1739 m |
| Altitude | `y = 0` au sol de la Concorde ; toutes les altitudes sont relatives à ce point |
| Cap | radians ; vecteur avant = `(sin h, cos h)` dans `(x, z)` ; `h = 0` regarde le sud — `headingOf(dx, dz)` |
| Tuile | carré de 512 m ; `tx = floor(x / 512)`, `tz = floor(z / 512)` — `tileIndexOf`, `tileBounds`, `tileKey` |
| Longueurs sur disque | entiers en décimètres (`UNITS_PER_METER = 10`) |
| Angles sur disque | entiers en dixièmes de degré, 0 à 3599 (`ANGLE_UNITS = 3600`) |
| Vitesses | km/h entiers sur disque, m/s une fois décodées |

**Sens des anneaux.** « Vu de dessus » veut dire : carte au nord en haut, est à droite. Un anneau
extérieur tourne dans le sens **antihoraire**, un trou dans le sens **horaire**. `ringSignedArea` est
positive pour un anneau antihoraire. Conséquence utile : pour tout côté `A → B` d'un anneau bien
orienté, la matière est à gauche et la normale **sortante** est `(-dz, dx)` ; `outwardHeading(ax, az,
bx, bz)` en donne le cap. Les anneaux ne sont pas refermés (le dernier sommet ne répète pas le premier).

## 4. Principes d'encodage

1. **Colonnes.** Une couche est un objet `{ n, colonne1, colonne2, … }`. `n` est le nombre d'éléments ;
   une colonne dense a `n` valeurs.
2. **Colonne facultative.** Si elle est absente, tous les éléments valent le défaut indiqué.
   L'encodeur omet de lui-même toute colonne entièrement à sa valeur par défaut, et toute couche vide.
3. **Colonne creuse.** Paires `[indice d'élément, valeur, indice, valeur, …]`, indices strictement
   croissants. Sert aux attributs rares (nom, clé de monument, altitude imposée).
4. **Points.** `xz = [x0, z0, x1, z1, …]`, chaque coordonnée dans `[0, 5119]` : position dans la tuile.
5. **Anneaux et polylignes.** `len` donne le nombre de sommets de chaque anneau ; dans `xz`, le premier
   sommet d'un anneau est relatif à l'origine de la tuile, chaque sommet suivant est le **delta** par
   rapport au précédent. Pour les polygones, `rings` donne le nombre d'anneaux de chaque élément
   (1 extérieur + ses trous) ; absent, il vaut 1 partout.
6. **Chaînes.** Chaque fichier a sa table `str` ; `str[0]` vaut toujours `''`. Une colonne de chaînes
   contient des indices dans cette table.
7. **Énumérations.** Codées par l'indice dans la liste constante (`BUILDING_KINDS`, etc.).

Exemple réel (sortie de `encodeTile`) : un immeuble haussmannien à cour intérieure, l'emprise d'un
monument, un trottoir, deux arbres, un candélabre et un café, dans la tuile (-4, -2).

```json
{"v":1,"tx":-4,"tz":-2,
 "str":["","arc_de_triomphe","Arc de Triomphe"],
 "buildings":{"n":2,"id":[4938271562,904],"h":[215,495],
   "len":[4,4,4],
   "xz":[1000,2200,300,0,0,-200,-300,0, 1100,2050,100,0,0,100,-100,0, 1052,1281,450,0,0,-222,-450,0],
   "kind":[0,16],"roof":[1,0],"style":[0,2],"base":[234,243],"lv":[6,1],
   "rings":[2,1],"lm":[1,1],"name":[1,2]},
 "roads":[812,815,1290],
 "surfaces":{"n":1,"kind":[2],"len":[4],"xz":[960,2240,380,0,0,-280,-380,0]},
 "trees":{"n":2,"xz":[980,2220,1075,2220],"h":[140,125],"r":[40,35]},
 "furniture":{"n":1,"xz":[1027,2232],"kind":[2]},
 "shops":{"n":1,"id":[31],"xz":[1150,2200],"w":[65],"cat":[7],"b":[4938271562]}}
```

Lecture : le premier bâtiment a 2 anneaux de 4 sommets. Son anneau extérieur part de (100,0 m ;
220,0 m) dans la tuile, va 30 m à l'est, 20 m au nord, 30 m à l'ouest. Il mesure 21,5 m, sa base est à
23,4 m, il a 6 niveaux, un toit `mansard` (indice 1) et le style `haussmann` (indice 0). Le second
porte la clé de monument `str[1]` et le nom `str[2]`. Le café (`cat` 7 = `cafe_restaurant`) est posé sur
la façade sud du premier bâtiment ; son cap absent vaut 0 : la vitrine regarde le sud.

## 5. Fichiers

### 5.1 `manifest.json` — type `Manifest`

Lisible tel quel. `createManifest` le fabrique, `parseManifest` le contrôle à la lecture (il lève une
erreur si le format, la version, la projection ou la taille de tuile ne sont pas ceux du code).

| Champ | Contenu |
|---|---|
| `format` | `"crs-paris-map"` |
| `version` | version du format (`FORMAT_VERSION`, aujourd'hui 1) |
| `name` | `"paris"` ou `"test-district"` |
| `generatedAt` | date ISO 8601 de génération (`""` pour un jeu de données déterministe) |
| `bbox` | `{ west, south, east, north }` en degrés WGS84 |
| `origin`, `projection` | `{ lat, lon }` et `{ mPerDegLon, mPerDegLat }` |
| `tileSize` | 512 |
| `bounds` | `{ minX, minZ, maxX, maxZ }` en mètres monde |
| `waterLevel` | niveau de l'eau du fleuve (m) |
| `files` | `{ roadGraph, places, landmarks, terrain }` : chemins relatifs |
| `tiles` | `[{ tx, tz, file, bytes? }]` : les tuiles présentes |
| `attribution` | `[{ source, license, text, url? }]` : au moins une entrée ; `attributionText(manifest)` donne le texte à afficher |

### 5.2 `tiles/t_{tx}_{tz}.json` — brut `RawTile`, décodé `Tile`

En-tête : `v` (version), `tx`, `tz`, `str` (table de chaînes, absente si vide).

**`buildings`** → `Tile.buildings: Building[]`

| Colonne | Défaut | Contenu |
|---|---|---|
| `id` | requis | identifiant stable, entier > 0, unique sur toute la carte |
| `h` | requis | hauteur totale au-dessus de la base, toit compris (dm) |
| `len`, `xz` | requis | anneaux (voir § 4) |
| `rings` | 1 | nombre d'anneaux : 1 extérieur + trous |
| `kind` | 0 | indice dans `BUILDING_KINDS` |
| `roof` | 0 | indice dans `ROOF_SHAPES` : `flat`, `mansard`, `gabled`, `dome` |
| `style` | 0 | indice dans `BUILDING_STYLES` : `haussmann`, `modern`, `monumental`, `faubourg` |
| `base` | 0 | altitude du pied du bâtiment (dm) |
| `lv` | 0 | niveaux, rez-de-chaussée compris, combles exclus ; 0 = inconnu, estimé au décodage (`estimateLevels`) |
| `lm` | creuse | clé du monument qui remplace ce bâtiment (`landmarkKey`) |
| `name` | creuse | nom propre (jamais une enseigne) |

**`roads`** → `Tile.roadEdges: number[]` : indices, strictement croissants, des arêtes du graphe global
qui traversent la tuile (voir `computeTileEdgeRefs`).

**`surfaces`** → `Tile.surfaces: Surface[]`, dans l'ordre de superposition (du dessous vers le dessus)

| Colonne | Défaut | Contenu |
|---|---|---|
| `kind` | requis | indice dans `MAP_SURFACE_KINDS` |
| `len`, `xz`, `rings` | | anneaux, comme les bâtiments |
| `name` | creuse | nom propre |
| `y` | creuse | altitude imposée (dm), par exemple le niveau de l'eau ; sinon la surface épouse le relief |

**`barriers`** → `Tile.barriers: Barrier[]` : `len`, `xz` (polylignes), `kind` (défaut 0, indice dans
`BARRIER_KINDS` : `wall`, `fence` (grille), `hedge`, `quay_wall`, `railing`, `gate`), `h` (hauteur en dm,
défaut 20).

**`trees`** → `Tile.trees: TreeSet` (colonnes `x`, `z`, `height`, `crownRadius` en `Float32Array`,
prêtes pour l'instancing) : `xz`, `h` (hauteur en dm, défaut 100), `r` (rayon de couronne en dm, défaut 30).

**`furniture`** → `Tile.furniture: FurnitureItem[]` : `xz`, `kind` (défaut 0, indice dans
`FURNITURE_KINDS`), `a` (cap, défaut 0).

**`signals`** → `Tile.signals: TrafficSignal[]` : supports de feux. `xz`, `a` (cap de la face lumineuse),
`node` (indice du nœud du graphe commandé, défaut -1).

**`metro`** → `Tile.metroEntrances: MetroEntrance[]` : `xz`, `a` (cap de sortie), `name` (indice `str`
du nom de station), `lines` (indice `str` des lignes, séparées par « ; »).

**`shops`** → `Tile.shops: Shop[]`

| Colonne | Défaut | Contenu |
|---|---|---|
| `id` | requis | identifiant stable, entier > 0, unique sur toute la carte |
| `xz` | requis | milieu de la vitrine, **sur la façade** |
| `a` | 0 | cap de la normale sortante de la façade |
| `w` | 40 | largeur de vitrine (dm) |
| `cat` | 0 | indice dans `SHOP_CATEGORIES` |
| `b` | 0 | identifiant du bâtiment porteur (0 = inconnu) ; il peut être dans une tuile voisine |

### 5.3 `roadgraph.json` — brut `RawRoadGraph`, décodé `RoadGraph`

Coordonnées en décimètres relatifs à l'**origine du monde**. Table `str` : noms de voies, clés de monuments.

`nodes` : `n`, `xz`, `flags` (défaut 0 ; bits `NODE_SIGNAL` = 1 feu tricolore, `NODE_CROSSING` = 2 passage
piéton, `NODE_BOUNDARY` = 4 limite de carte).

`edges` :

| Colonne | Défaut | Contenu |
|---|---|---|
| `a`, `b` | requis | nœud de départ, nœud d'arrivée |
| `w` | requis | largeur de chaussée, hors trottoirs (dm) |
| `len`, `xz` | 0 | points **intermédiaires** de la polyligne, en deltas depuis le nœud `a` ; les extrémités sont les nœuds |
| `lf`, `lb` | 1, 1 | voies dans le sens `a → b`, puis `b → a` |
| `cls` | 0 | indice dans `ROAD_CLASSES` |
| `flags` | 0 | bits `EDGE_ONEWAY` = 1, `EDGE_BRIDGE` = 2, `EDGE_TUNNEL` = 4, `EDGE_PEDESTRIAN` = 8 |
| `surf` | 0 | indice dans `ROAD_SURFACES` ; `sett` = pavés |
| `speed` | 30 | vitesse limite (km/h) |
| `sw` | 0 | largeur estimée de chaque trottoir (dm) |
| `name` | 0 | indice `str` du nom de la voie |
| `lm` | creuse | clé du monument qui remplace l'ouvrage (un pont modélisé à la main) |

Au décodage, deux champs **dérivés** sont calculés : `RoadNode.edges` (arêtes incidentes) et
`RoadEdge.length`. Ils ne sont pas demandés à l'encodage (`RoadGraphInput`).

### 5.4 `places.json` — brut `RawPlaces`, décodé `Place[]`

`n`, `name` (chaînes), `xz` (décimètres, origine du monde), `kind` (défaut 0, indice dans `PLACE_KINDS`),
`r` (rayon d'emprise en mètres entiers, défaut 0), `imp` (importance 0 à 3, défaut 1), `ref` (référence
libre, défaut `''` : lignes d'une station, arrondissement…).

Un lieu de nature `street`, `bridge` ou `quay` porte le même nom que les arêtes du graphe
correspondantes : `edgesByName(graph)` retrouve sa géométrie.

### 5.5 `landmarks.json` — brut `RawLandmarks`, décodé `Landmark[]`

`n`, `key`, `name`, `xz` (point d'ancrage), `h` (hauteur en dm), `len` + `fxz` (emprises au sol, en
deltas), `a` (cap de la façade principale, défaut 0), `y` (altitude du sol en dm, défaut 0).

La clé relie trois choses : l'entrée de `landmarks.json`, les bâtiments (`Building.landmarkKey`) et les
ponts (`RoadEdge.landmarkKey`) que le modèle remplace, et le modèle 3D du moteur. Convention de clé :
minuscules ASCII, chiffres, `_`. Clés conseillées : `SUGGESTED_LANDMARK_KEYS`.

### 5.6 `terrain.json` — brut `RawTerrain`, décodé `Terrain`

`x0`, `z0` (position du premier nœud, m), `step` (pas, m), `nx`, `nz`, `scale` (mètres par unité, 0.1
par défaut), `h` : `nx·nz` entiers ligne par ligne (indice `iz·nx + ix`), codés en deltas successifs
(le premier est absolu).

`sampleTerrain(terrain, x, z)` interpole bilinéairement entre les 4 nœuds voisins, sans allocation ;
hors de la grille, le point est ramené sur le bord.

## 6. Énumérations

| Liste | Valeurs, dans l'ordre des codes |
|---|---|
| `BUILDING_KINDS` | `generic`, `residential`, `office`, `retail`, `hotel`, `public`, `government`, `school`, `hospital`, `religious`, `culture`, `station`, `police`, `fire_station`, `industrial`, `parking`, `monument`, `kiosk`, `roof`, `construction` |
| `ROOF_SHAPES` | `flat`, `mansard`, `gabled`, `dome` |
| `BUILDING_STYLES` | `haussmann`, `modern`, `monumental`, `faubourg` |
| `MAP_SURFACE_KINDS` | `plaza`, `road`, `sidewalk`, `pedestrian`, `median`, `parking`, `construction`, `courtyard`, `park`, `garden`, `grass`, `gravel`, `quay`, `sports`, `cemetery`, `rail`, `water` |
| `BARRIER_KINDS` | `wall`, `fence`, `hedge`, `quay_wall`, `railing`, `gate` |
| `FURNITURE_KINDS` | `autre`, `banc`, `candelabre`, `poubelle`, `potelet`, `abribus`, `kiosque`, `colonne_morris`, `fontaine_wallace`, `sanisette`, `panneau_pub`, `station_velo`, `jardiniere`, `conteneur`, `barriere_vauban`, `barriere_chantier`, `table_terrasse`, `distributeur`, `echafaudage`, `boite_aux_lettres`, `arceau_velo`, `panneau`, `statue`, `mat_drapeau`, `bouche_incendie`, `horodateur`, `armoire_technique`, `colonne_verre`, `horloge`, `camera` |
| `SHOP_CATEGORIES` | `autre`, `banque`, `luxe`, `mode`, `bijouterie`, `alimentation`, `supermarche`, `cafe_restaurant`, `restauration_rapide`, `pharmacie`, `tabac_presse`, `telephonie`, `agence`, `hotel` |
| `ROAD_CLASSES` | `residential`, `motorway`, `primary`, `secondary`, `tertiary`, `service`, `pedestrian`, `footway` |
| `ROAD_SURFACES` | `asphalt`, `sett`, `paving`, `concrete`, `gravel`, `wood` |
| `PLACE_KINDS` | `square`, `street`, `bridge`, `quay`, `garden`, `district`, `monument`, `station`, `institution` |

`SHOP_CATEGORIES`, `ROAD_CLASSES` et `PLACE_KINDS` reprennent les valeurs de `ShopCategory`, `RoadClass`
et `PlaceKind` de `src/core/contracts.ts`. `FURNITURE_KINDS` reprend les noms de `PropKind` quand
l'objet existe des deux côtés. `MapSurfaceKind` (type de polygone de la carte) n'est **pas**
`SurfaceKind` des contrats (nature du sol sous un point) : la conversion est à la charge du moteur.

`MAP_SURFACE_LAYER_ORDER` donne l'ordre de superposition conseillé des surfaces, du dessous vers le
dessus : `road`, `rail`, `sidewalk`, `median`, `pedestrian`, `plaza`, `quay`, `courtyard`, `parking`,
`construction`, `cemetery`, `sports`, `park`, `garden`, `gravel`, `grass`, `water`.

## 7. Invariants

Les fonctions `validate…` retournent `{ ok, errors, warnings }`. Une **erreur** est une violation du
format ; un **avertissement** signale une donnée douteuse mais utilisable.

### Tuile (`validateRawTile` sur le fichier, `validateTile` sur la tuile décodée)

1. Tous les nombres du fichier sont des entiers ; les longueurs de colonnes sont cohérentes avec `n`,
   `rings` et `len`.
2. Anneau : au moins 3 sommets distincts, aire non nulle, extérieur antihoraire, trous horaires,
   anneau non refermé. L'encodeur impose le sens et retire les sommets répétés. Un anneau qui se
   recoupe franchement donne un avertissement.
3. Un **bâtiment n'est jamais découpé**. Il appartient à la tuile qui contient le centre de sa boîte
   englobante ; ses sommets peuvent déborder de la tuile, de `MAX_OVERHANG` = 512 m au plus.
4. Un **point** (arbre, mobilier, feu, entrée de métro, commerce) appartient à la tuile qui le
   contient : ses coordonnées sont dans `[0, 5119]`.
5. Une **surface** ou une **barrière** est soit découpée aux limites de tuile (`clipRingToRect`,
   `clipPolylineToRect`), soit rattachée entière à une seule tuile ; jamais dupliquée. Débord maximal :
   512 m (erreur au-delà) ; au-delà de 64 m, le découpage est conseillé (avertissement). Les grandes
   surfaces (fleuve, jardins) doivent être découpées.
6. L'ordre du tableau `surfaces` est l'ordre de superposition : une surface recouvre celles qui la
   précèdent. Le recouvrement est permis (un jardin sur un trottoir d'îlot).
7. Hauteur de bâtiment dans ]0, 500] m ; niveaux ≥ 1 une fois décodés ; identifiants de bâtiments et
   de commerces entiers > 0, uniques sur toute la carte.
8. Un commerce est à 1,5 m au plus de la façade de son bâtiment (`SHOP_FACADE_TOLERANCE`), et son cap
   suit la normale sortante de cette façade (avertissement au-delà de 45°).
9. `roads` contient exactement les arêtes dont l'emprise (demi-chaussée + trottoir) touche la tuile.
10. Aucune enseigne commerciale : les commerces n'ont pas de nom, seulement une catégorie.

### Graphe routier (`validateRoadGraph`)

11. Les extrémités de chaque polyligne coïncident avec les nœuds `a` et `b`, à 11 cm près.
12. Sens unique : la circulation va de `a` vers `b` et `lanesBackward = 0`. Une voie ouverte aux
    véhicules a au moins une voie ; une voie `pedestrianOnly` peut en avoir zéro.
13. Largeur de chaussée dans ]0, 100] m, trottoir dans [0, 40] m, vitesse dans [0, 37] m/s.
14. Un passage piéton ou un feu est un **nœud** : le chemin est coupé à cet endroit.
15. Nœuds isolés et graphe en plusieurs composantes : avertissements (`roadGraphComponents`).

### Relief, lieux, monuments, carte entière

16. Relief : au moins 2 × 2 nœuds, altitudes finies, `y ≈ 0` à l'origine (avertissement au-delà de 0,5 m).
17. Lieux : nom non vide, importance de 0 à 3. Monuments : clé unique, emprise antihoraire, hauteur > 0.
18. `validateMapData` contrôle en plus les références croisées : tuiles annoncées par le manifeste,
    arêtes et nœuds référencés par les tuiles, bâtiment de chaque commerce (même dans une autre tuile),
    clés de monuments des bâtiments et des arêtes, unicité des identifiants sur toute la carte,
    couverture de l'emprise par le relief.

### Conventions de rendu à connaître

- **Eau.** Une surface `water` porte son niveau (`level`). Sous l'eau, l'altitude du relief n'est pas
  contractuelle : le moteur affiche le plan d'eau au niveau donné.
- **Quai.** Une barrière `quay_wall` suit la crête du mur ; `height` est la hauteur du mur, de son pied
  à sa crête.
- **Pont.** Une arête `bridge` porte son tablier : il relie l'altitude du sol aux deux extrémités sans
  suivre le relief, et sa largeur est celle de la chaussée plus les trottoirs. Aucune surface n'est
  attendue au-dessus de l'eau.
- **Souterrain.** Une arête `tunnel` n'est pas praticable en surface.
- **Monument.** Le rendu générique ignore un bâtiment dont `landmarkKey` est renseigné ; l'emprise sert
  aux collisions. Si le moteur n'a pas de modèle pour une clé, il peut extruder l'emprise du monument
  sur sa hauteur.

## 8. Version et extensibilité

`FORMAT_VERSION` (champ `v` de chaque fichier, `version` du manifeste) n'augmente que pour un
changement **incompatible**. Un décodeur refuse toute autre version que la sienne.

Sont compatibles, donc sans changement de version :

- une nouvelle couche dans une tuile, une nouvelle colonne dans une couche (un décodeur ancien les ignore) ;
- une colonne absente (elle prend son défaut) ;
- une valeur ajoutée **en fin** d'une énumération : un décodeur ancien lit un code inconnu comme la
  valeur d'indice 0 (`generic`, `flat`, `haussmann`, `plaza`, `wall`, `autre`, `residential`,
  `asphalt`, `square`), et `validateRawTile` le signale par un avertissement.

Il ne faut jamais réordonner ni retirer une valeur d'une énumération, ni changer le sens ou le défaut
d'une colonne existante.

## 9. Côté outils : produire la carte

```js
// Node 22 : NODE_USE_ENV_PROXY=1 node tools/map/build.mjs
import {
  createEmptyTile, createManifest, encodeTile, encodeRoadGraph, encodeTerrain, encodePlaces,
  encodeLandmarks, decodeMapData, validateMapData, mapDataFiles, computeTileEdgeRefs, lonLatToWorld,
  tileIndexOf, tileKey, clipRingToRect, tileBounds, treeSetFromList, osmStableId,
} from '../../src/world/mapdata.ts';
```

1. Projeter avec `lonLatToWorld`, ranger chaque élément dans sa tuile (`tileIndexOf` ; pour un
   bâtiment, le centre de sa boîte englobante).
2. Remplir des tuiles décodées (`createEmptyTile`). Les anneaux peuvent être de simples tableaux de
   nombres (`TileInput`) ; leur sens et leur fermeture sont normalisés par l'encodeur.
3. Découper les surfaces et les barrières par tuile (`clipRingToRect`, `clipPolylineToRect`), trier
   les surfaces selon `MAP_SURFACE_LAYER_ORDER`.
4. Construire le graphe global, puis `computeTileEdgeRefs(graph)` donne `roadEdges` pour chaque tuile.
5. Encoder. `encodeTile(tile, dropped)` écarte ce qui n'est pas représentable (anneau dégénéré après
   arrondi au décimètre, point hors de sa tuile) et l'écrit dans `dropped` : à relire.
6. Contrôler : `validateMapData(decodeMapData(raw))` doit retourner `ok: true`.
7. Écrire : `mapDataFiles(raw)` donne les chemins et les contenus ; `JSON.stringify` sans indentation.

Identifiants stables : `osmStableId('way', id)` pour une donnée OpenStreetMap ; sinon tout entier > 0
stable d'une génération à l'autre.

## 10. Côté moteur : lire la carte

```ts
const manifest = parseManifest(await (await fetch(base + MAP_FILES.manifest)).json());
const graph = decodeRoadGraph(await (await fetch(base + manifest.files.roadGraph)).json());
const terrain = decodeTerrain(await (await fetch(base + manifest.files.terrain)).json());
const places = decodePlaces(await (await fetch(base + manifest.files.places)).json());
const landmarks = decodeLandmarks(await (await fetch(base + manifest.files.landmarks)).json());
// puis, à la demande, autour du joueur :
const tile = decodeTile(await (await fetch(base + tilePath(tx, tz))).json());
const y = sampleTerrain(terrain, x, z);
```

Comme un bâtiment peut déborder de sa tuile, les collisions et le rendu près d'une limite doivent
consulter les tuiles voisines. Les anneaux d'une tuile décodée sont des vues sur un tampon commun par
couche : les lire, ne pas les redimensionner.

Mesure sur la machine de développement (Node 22), pour les 4 tuiles du quartier d'essai réunies
(1 262 bâtiments, 102 ko de JSON) : `JSON.parse` 0,4 ms et `decodeTile` 0,35 ms. Aucune mesure n'a été
faite sur téléphone ni sur une vraie tuile de Paris.

## 11. Quartier d'essai

`generateTestDistrict({ seed?, relief? })` retourne un `RawMapData` : exactement les fichiers d'une
carte (`mapDataFiles` en donne la liste), pour un quartier fictif de 1 024 m × 1 024 m centré sur
l'origine, réparti sur les tuiles (-1, -1), (0, -1), (-1, 0) et (0, 0). Même graine, mêmes fichiers.
`TEST_DISTRICT` expose ses dimensions et ses noms.

Contenu : une avenue est-ouest de 40 m entre façades (deux chaussées à sens unique de 10,5 m, un
terre-plein planté de 4 m, deux trottoirs de 7,5 m) ; une place ronde à sens giratoire dont le centre
porte un monument fictif (`monument_essai`) ; des rues de 10, 12 et 14 m, dont des sens uniques, une rue
pavée et une rue piétonne ; 56 îlots, dont 51 bordés d'immeubles (1 262 bâtiments, cours intérieures) ;
un fleuve de 120 m, ses quais, leurs murs et un pont ; un square clos de grilles avec bassin ; un parc
avec kiosque sous dôme ; une mairie à cour intérieure ; un parc de stationnement muré ; un chantier ;
509 arbres ; 648 objets de mobilier ; 168 commerces ; 51 supports de feux pour 20 carrefours à feux ;
3 bouches de métro ; 23 lieux nommés ; un relief de -6,5 à +7,4 m, nul à l'origine. L'ensemble pèse
119 ko.

Il sert aux tests et de carte de secours si les vraies données ne se chargent pas. `testDistrict.ts`
importe `./mapdata` sans extension : Vite et vitest le résolvent, mais Node seul ne peut pas importer
ce fichier directement (voir § 12).

## 12. Limites connues

- `mapdata.ts` est importable par Node tel quel ; `testDistrict.ts` ne l'est pas, parce que son import
  de `./mapdata` n'a pas d'extension et que `tsconfig.json` n'active pas `allowImportingTsExtensions`.
- Le découpage `clipRingToRect` (Sutherland–Hodgman) peut laisser des côtés confondus le long du bord
  pour un anneau concave ; un trou qui franchit une limite de tuile vient toucher le bord de l'anneau
  extérieur découpé. Le format le tolère ; le triangulateur du moteur doit le supporter.
- Le format ne décrit ni les intérieurs, ni les numéros de rue, ni les restrictions de tourne-à-gauche,
  ni l'essence des arbres. Ces ajouts sont possibles sans changer de version (§ 8).
