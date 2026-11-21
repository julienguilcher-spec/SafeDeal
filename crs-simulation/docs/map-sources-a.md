# Carte de Paris — sources des couches structurelles (lot A)

Couches concernées : `buildings`, `roads`, `areas`, `barriers`, `places`
(fichiers `tools/map/raw/normalized/*.geojson`, WGS84, une `FeatureCollection` par fichier, un objet par ligne).
Les autres couches (arbres, mobilier, commerces, relief, monuments) relèvent du lot B.

Emprise : longitude 2.2850 → 2.3725, latitude 48.8500 → 48.8780. Les objets sont conservés dès qu'ils touchent
l'emprise élargie d'une **marge de 60 m** ; les lignes et les surfaces y sont découpées, les bâtiments sont gardés entiers.

État au 15 novembre 2026. Tous les chiffres ci-dessous sortent des scripts (`node tools/map/fetch-a-all.mjs`).

## 1. Relancer la chaîne

```
node tools/map/fetch-a-all.mjs            # téléchargements (cache disque) + normalisation + contrôle, ~20 s avec le cache
node tools/map/fetch-a-all.mjs --force    # retélécharge tout (≈ 157 Mo, 33 requêtes)
```

| Script | Rôle | Sortie |
|---|---|---|
| `lib-a.mjs` | emprise et projection, téléchargement poli avec cache, lecteur OSM PBF, géométrie, écriture GeoJSON, filtre anti-enseignes | — |
| `fetch-a-1-osm.mjs` | extrait OpenStreetMap → objets de l'emprise | `raw/osm/paris.osm.pbf`, `raw/osm/extract-a.json` |
| `fetch-a-2-ign.mjs` | BD TOPO® par WFS (pages de 5 000) | `raw/ign/<couche>/page-NNN.json` |
| `fetch-a-3-paris.mjs` | open data de la Ville (exports GeoJSON filtrés) | `raw/paris/<jeu>.geojson`, `raw/paris/index.json` |
| `fetch-a-4-buildings.mjs` | couche `buildings` | `raw/normalized/buildings.geojson` |
| `fetch-a-5-roads.mjs` | couche `roads` | `raw/normalized/roads.geojson` |
| `fetch-a-6-areas.mjs` | couches `areas` et `barriers` | `raw/normalized/areas.geojson`, `barriers.geojson` |
| `fetch-a-7-places.mjs` | couche `places` (lit `roads` et `areas`) | `raw/normalized/places.geojson` |
| `fetch-a-8-check.mjs` | contrôles (code de sortie 1 en cas d'échec) | `raw/check-a.json` |

Aucune dépendance npm : Node 22 et `curl` (qui traverse le proxy tel quel). Politesse : agent utilisateur
`crs-sim-mapbuilder/0.1`, 1 requête par seconde et par hôte, cache disque de chaque réponse, reprises après 2 s puis 8 s,
hôte abandonné après 3 échecs consécutifs (`HostDownError`) — pour OpenStreetMap le script bascule alors sur le second miroir.

## 2. Sources retenues

### 2.1 OpenStreetMap

- Fichier : `https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf`
  (extrait quotidien du département 75 par OpenStreetMap France ; 47,9 Mo ; données du 2026-11-15T01:20:30Z ;
  md5 `854a5c983ac30b9ce94234c0e3233bf5`). 1 requête.
- Miroir de secours (essayé et validé de bout en bout, résultats équivalents) :
  `https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf` (243,5 Mo, données du 2026-11-14).
- Licence : **Open Database License (ODbL) 1.0**.
- Attribution exacte : **« © les contributeurs d'OpenStreetMap »**, avec lien vers `https://www.openstreetmap.org/copyright`.
- Contenu de l'emprise (+ marge) : 146 803 nœuds étiquetés, 86 773 chemins, 5 089 relations.
- Utilisé pour : toute la couche `roads` ; l'eau, les parcs, jardins, pelouses, places, surfaces piétonnes, parkings,
  cimetières, terrains de sport, chantiers de `areas` ; les murs, grilles et haies de `barriers` ; toute la couche `places` ;
  la nature, le nom et la forme de toit des bâtiments.

### 2.2 IGN — BD TOPO® (version 3)

- Service : WFS de la Géoplateforme, `https://data.geopf.fr/wfs/ows` (WFS 2.0.0, sortie `application/json`, EPSG:4326,
  `SORTBY=cleabs`, pages de 5 000). 12 requêtes.
- Couches et nombres d'objets reçus (emprise + marge) :

| Couche WFS | Objets | Usage |
|---|---|---|
| `BDTOPO_V3:batiment` | 31 901 | géométrie, hauteur, niveaux, usage des bâtiments |
| `BDTOPO_V3:troncon_de_route` | 9 023 | largeur de chaussée et nombre de voies (appariés aux arêtes OSM) |
| `BDTOPO_V3:construction_lineaire` | 456 | quais et murs de soutènement absents d'OSM (`barriers`) |
| `BDTOPO_V3:surface_hydrographique` | 51 | contrôle seulement : la Seine IGN fait 0,866 km² dans l'emprise, la Seine OSM 0,867 km² |
| `BDTOPO_V3:construction_surfacique` | 26 | téléchargée, non utilisée (ponts : les arêtes OSM `bridge` suffisent) |

- Licence : **Licence Ouverte / Open Licence 2.0 (Etalab)** (identifiant `lov2` sur data.gouv.fr, jeu « BD TOPO® »).
- Attribution exacte : **« IGN — BD TOPO®, données extraites en novembre 2026 »**.

### 2.3 Ville de Paris — open data (`opendata.paris.fr`, API Explore v2.1)

Export : `…/api/explore/v2.1/catalog/datasets/<identifiant>/exports/geojson` avec `where=intersects(<champ géométrique>, geom'POLYGON(…)')`.
20 requêtes (métadonnées + export pour chaque jeu). Tous ces jeux sont sous **Open Database License (ODbL)**.

| Identifiant du jeu | Titre | Producteur | Mis à jour | Objets | Usage |
|---|---|---|---|---|---|
| `plan-de-voirie-chaussees` | Plan de voirie - Chaussées | Direction de la Voirie et des Déplacements | 2026-11-10 | 5 670 | `areas` : `roadway` |
| `plan-de-voirie-trottoirs-emprises` | Plan de voirie - Trottoirs - emprises | idem | 2026-11-10 | 14 174 | `areas` : `sidewalk` |
| `plan-de-voirie-terre-pleins` | Plan de voirie - Terre-pleins | idem | 2026-11-10 | 415 | `areas` : `sidewalk` (`sub: median`) |
| `plan-de-voirie-ilots-directionnels` | Plan de voirie - Ilots directionnels | idem | 2026-11-10 | 644 | `areas` : `sidewalk` (`sub: traffic_island`) |
| `plan-de-voirie-aires-mixtes-vehicules-et-pietons` | Plan de voirie - Aires mixtes véhicules et piétons | idem | 2026-11-10 | 285 | `areas` : `pedestrian` (`sub: shared`) |
| `plan-de-voirie-emprises-ilots-prives` | Plan de voirie - Emprises îlots privés | idem | 2026-11-10 | 1 626 | `areas` : `courtyard` (`sub: block`) |
| `espaces_verts` | Espaces verts et assimilés | Direction des Espaces Verts et de l'Environnement | 2026-11-15 | 489 | `areas` : jardins absents d'OSM (61 ajoutés) |
| `plan-de-voirie-voies-deau` | Plan de voirie - Voies d'eau | Direction de la Voirie et des Déplacements | 2026-11-10 | 26 | contrôle seulement |
| `plan-de-voirie-emprises-espaces-verts` | Plan de voirie - Emprises espaces verts | idem | 2026-11-10 | 193 | téléchargé, non utilisé (doublon) |
| `voie` | Filaire de voies | Direction de l'Urbanisme | 2026-11-09 | 1 908 | contrôle seulement : 93,2 % des 1 828 noms officiels de l'emprise sont dans nos couches |

- Attribution exacte : **« Ville de Paris — Paris Data (opendata.paris.fr), licence ODbL »**.

### 2.4 Conséquence des licences pour le jeu

- Écran des crédits : les trois attributions ci-dessus, telles quelles.
- L'ODbL (OpenStreetMap, Ville de Paris) impose le **partage à l'identique des bases dérivées** : les fichiers de carte
  publiés dans `public/data/paris/` sont une base dérivée et doivent être proposés sous ODbL (une mention dans ce dossier
  et dans les crédits suffit). Le jeu lui-même (rendu, code) est une « œuvre produite » : seule l'attribution est exigée.
- La Licence Ouverte 2.0 est compatible avec une redistribution sous ODbL (paternité conservée).

## 3. Sources écartées

| Source | Raison |
|---|---|
| `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee` | connexion coupée ou sans réponse (25 s) depuis cette machine |
| `overpass.openstreetmap.fr` | HTTP 403 |
| `download.geofabrik.de` | connexion coupée |
| `api.openstreetmap.org/api/0.6/map` | limite de 50 000 nœuds par requête : il aurait fallu des dizaines d'appels ; un seul fichier d'extrait fait mieux |
| Ville de Paris `volumesbatisparis` (Volumes bâtis) | 92 836 volumes dans l'emprise (trois fois plus fragmenté que la BD TOPO), pas de hauteur en mètres (seulement un nombre d'étages `h_et_max`) |
| Ville de Paris `plan-de-voirie-murs` | 115 863 fragments de lignes de DAO, une seule classe « MUR-CLOTURE », inexploitable sans reconstruction |
| Ville de Paris `plan-de-voirie-trottoirs` (filaire) | 162 995 fragments de bordures ; les polygones de `plan-de-voirie-trottoirs-emprises` les remplacent |
| Ville de Paris `plan-de-voirie-voies-en-escalier`, `plan-de-voirie-emprises-ferroviaires` | pas de nature correspondante dans le contrat (les escaliers viennent d'OSM, classe `steps`) |
| Géométrie des bâtiments OSM | même origine cadastrale que la BD TOPO, mais sans hauteur (208 bâtiments sur 22 449) ; OSM ne sert qu'aux attributs |
| Outils MCP data.gouv.fr | utilisés seulement pour confirmer la licence de la BD TOPO® |

## 4. Correspondance des champs

### 4.1 `buildings.geojson` — 31 194 bâtiments (17,3 Mo)

Géométrie : polygone BD TOPO (anneaux nettoyés, orientés à la norme GeoJSON, trous = cours intérieures), non découpé.

| Champ | Origine |
|---|---|
| `id` | `cleabs` BD TOPO (ex. `BATIMENT0000000245198909`) ; `osm:w<id>` / `osm:r<id>` pour un bâtiment venu d'OSM |
| `height` | BD TOPO `hauteur` si ≥ 1,5 m (hauteur **à la gouttière**, toit non compris) ; sinon OSM `height` ; sinon niveaux × 3,2 ; sinon `null` |
| `levels` | BD TOPO `nombre_d_etages` ; sinon OSM `building:levels` (si les deux emprises décrivent le même volume) ; sinon `null` |
| `kind` | 1. bâtiment OSM (`building`, `amenity`, `tourism`, `office`, `historic`, `shop`, `railway`) ; 2. enceinte OSM contenant le bâtiment (école, hôpital, ministère, culte, musée…) ou point d'intérêt institutionnel dans le bâtiment ; 3. BD TOPO `nature` / `usage_1` / `usage_2` ; 4. `other` |
| `name` | OSM `name`, **uniquement** pour les monuments, lieux de culte, gares, hôpitaux, établissements d'enseignement et institutions publiques ; jamais pour un commerce, un hôtel, une entreprise |
| `roofShape` | OSM `roof:shape` (ou `null`) |
| `source` | `ign` (11 860), `ign+osm` (18 930 : au moins un attribut pris dans OSM), `osm` (404 bâtiments absents de la BD TOPO) |

Jointure : le point intérieur du bâtiment IGN doit tomber dans un bâtiment OSM (29 949 appariés, dont 23 710 « serrés » :
surfaces comparables, seuls ceux-là héritent de `levels`, `height`, `roofShape` d'OSM).
Écartés : 1 092 polygones IGN de moins de 5 m², 971 bâtiments OSM déjà couverts par la BD TOPO, 74 édicules OSM relevant
du mobilier (abribus, kiosques, sanisettes), les `building=roof`, bateaux et volumes souterrains.

Natures : residential 21 790 · other 3 822 · office 2 192 · hotel 895 · public 748 · school 688 · commercial 596 ·
religious 215 · monument 97 · hospital 91 · station 34 · industrial 26.
Hauteur : BD TOPO 28 993 · OSM 34 · déduite des niveaux 784 · **absente 1 383 (4,4 %)** ; niveaux absents 5 923.
Nommés : 490.

### 4.2 `roads.geojson` — 18 354 arêtes (6,3 Mo), issues de 11 987 chemins OSM

Chaque objet est une **arête du graphe** : les chemins OSM sont coupés à chaque nœud partagé avec une autre voie retenue ;
deux arêtes qui se touchent ont exactement les mêmes coordonnées d'extrémité (7 décimales).

| Champ | Origine |
|---|---|
| `id` | `w<id OSM>` (chemin entier) ou `w<id OSM>_<n>` (morceau) |
| `name` | OSM `name` |
| `class` | OSM `highway` : `primary(_link)`→primary, `secondary(_link)`→secondary, `tertiary(_link)`→tertiary, `residential`/`unclassified`/`road`→residential, `living_street`→living, `pedestrian`→pedestrian, `service`/`busway`→service, `footway`/`path`→footway, `steps`→steps, `cycleway`→cycleway (aucune `motorway` ni `trunk` dans l'emprise) |
| `width` | OSM `width` (895 arêtes) ; sinon BD TOPO `largeur_de_chaussee` du tronçon apparié (8 423) ; sinon `null` |
| `lanes` | OSM `lanes` ; sinon BD TOPO `nombre_de_voies` du tronçon apparié |
| `oneway` | OSM `oneway=yes/1/true/-1` (géométrie retournée pour `-1`), `junction=roundabout` ; toujours `false` pour footway/steps |
| `bridge` | OSM `bridge` présent et ≠ `no` |
| `tunnel` | OSM `tunnel` présent **et** `layer` < 0 (vrai souterrain) |
| `surface` | OSM `surface` ramené à `asphalt` / `sett` (pavés) / `paved` (dalles, béton, bois, métal) / `gravel` (stabilisé, terre) / `null` |
| `maxspeed` | OSM `maxspeed` (nombre, `FR:zone30`→30, `FR:urban`→50), sinon `zone:maxspeed` / `source:maxspeed`, sinon `null` |
| `layer` | OSM `layer` ; à défaut 1 pour un pont, 0 sinon |
| `source` | `osm`, ou `osm+ign` quand largeur ou voies viennent de la BD TOPO |
| `covered` *(hors contrat, présent seulement si vrai)* | passage au niveau du sol sous un immeuble ou une dalle (`tunnel=building_passage`, `covered=yes`, ou `tunnel=yes` sans couche négative) : 738 arêtes |

Appariement BD TOPO : points échantillonnés le long de l'arête ; tronçon IGN le plus proche à moins de 9 m, de direction
voisine (30°), de même situation (souterrain ou non) ; il faut qu'au moins la moitié des points soient appariés.

Écartés (comptes en chemins OSM) : trottoirs filaires `footway=sidewalk` 13 786 et passages piétons `footway=crossing` 6 704
(les trottoirs réels sont des polygones de `areas`, les passages piétons relèvent de la couche `signals` du lot B),
îlots `footway=traffic_island` 508, cheminements intérieurs ou souterrains de stations et galeries 2 095, surfaces
`area=yes` 2 096 (→ `areas`), couloirs, ascenseurs, quais, parkings souterrains.

Classes (arêtes / km) : residential 3 316 / 195,6 · primary 1 071 / 50,9 · secondary 865 / 38,9 · tertiary 874 / 43,0 ·
living 537 / 28,8 · pedestrian 1 116 / 45,1 · service 1 916 / 80,2 · footway 5 259 / 115,8 · cycleway 2 034 / 72,0 ·
steps 1 366 / 6,8.
Voies carrossables (primary à living) : 6 663 arêtes, largeur connue 6 602, nommées 6 615, à sens unique 5 271.
Ponts : 142 arêtes. Tunnels : 245 arêtes.

### 4.3 `areas.geojson` — 25 990 surfaces (15,3 Mo)

Champs du contrat : `kind`, `name`. Champs supplémentaires : `sub` (détail), `z` (ordre de peinture), `source` (`osm` / `paris`).
**Le fichier est trié par `z` croissant** (du dessous vers le dessus), puis par surface décroissante.

| `kind` | `sub` | `z` | Origine | Objets |
|---|---|---|---|---|
| `courtyard` | `block` | 0 | Ville : îlots privés (sol des pâtés de maisons, visible dans les cours ; les bâtiments se posent dessus) | 1 619 |
| `water` | `river` | 1 | OSM `natural=water` + `water=river` : la Seine, un seul polygone à 3 trous (île aux Cygnes, île de la Cité, île Saint-Louis) | 1 |
| `water` | `canal` | 1 | OSM `water=canal/lock` : canal Saint-Martin à ciel ouvert, écluses, bassin de l'Arsenal (les voûtes souterraines sont exclues) | 11 |
| `plaza` | `outline` | 1 | OSM `place=square` (contour de la place entière, chaussées comprises) | 24 |
| `park` | — | 2 | OSM `leisure=park` (159) ; Ville `espaces_verts` catégorie Parc (3) | 162 |
| `garden` | —, `private` | 2 | OSM `leisure=garden` (341) ; Ville `espaces_verts` Jardin, Square, Promenade… (48) | 389 |
| `cemetery` | — | 2 | OSM `landuse=cemetery`, `amenity=grave_yard` ; Ville | 2 |
| `construction` | — | 3 | OSM `landuse=construction/brownfield` | 13 |
| `courtyard` | `court` | 3 | OSM `man_made=courtyard` | 5 |
| `plaza` | — | 4 | OSM surface piétonne (`highway=pedestrian` + `area=yes`) nommée Place, Parvis, Esplanade, Cour… ou `place=square` | 202 |
| `pedestrian` | — | 4 | OSM autres surfaces `highway=pedestrian/footway` + `area=yes` (hors trottoirs) | 657 |
| `pedestrian` | `shared` | 4 | Ville : aires mixtes véhicules et piétons | 283 |
| `roadway` | — | 5 | Ville : chaussées | 5 645 |
| `sidewalk` | —, `median`, `traffic_island` | 6 | Ville : trottoirs (14 084), terre-pleins (394), îlots directionnels (640) | 15 118 |
| `parking` | — | 7 | OSM `amenity=parking` de surface | 153 |
| `garden` | `grass`, `flowerbed`, `scrub`, `wood` | 8 | OSM `landuse=grass/flowerbed/forest…`, `natural=scrub/wood…` ; Ville (pelouses) | 1 501 |
| `sports` | sport pratiqué | 8 | OSM `leisure=pitch/track` | 65 |
| `water` | `basin`, `fountain` | 9 | OSM bassins, pièces d'eau, vasques de fontaines | 140 |

Surfaces cumulées : îlots 12,30 km² · chaussées 3,31 km² · trottoirs 3,11 km² · parcs 1,16 km² · jardins et pelouses 1,10 km² ·
eau 1,02 km² · surfaces piétonnes 0,85 km² · places 0,58 km².
Les polygones de la Ville (DAO, arcs très densifiés) sont simplifiés à 5 cm. Un trou n'est jamais coupé par le découpage :
le polygone de la Seine déborde donc de la marge à l'ouest (jusqu'à 2.2795) pour garder l'île aux Cygnes entière.
Dans l'extrait « département 75 », la relation de la Seine est tronquée hors de Paris : sa chaîne ouverte est refermée par
un segment droit situé hors de l'emprise (jamais visible ; avertissement affiché par le script).

### 4.4 `barriers.geojson` — 3 631 lignes (0,9 Mo)

Champs du contrat : `kind`, `height`. Champs supplémentaires : `sub` (si utile : `retaining`, `city_wall`, `jersey`), `source` (`osm` / `ign`).

| `kind` | Origine | Lignes | Longueur |
|---|---|---|---|
| `wall` | OSM `barrier=wall/city_wall/jersey_barrier`, `retaining_wall` loin de l'eau ; BD TOPO « Mur », « Mur de soutènement » | 1 256 | 38,4 km |
| `fence` | OSM `barrier=fence` | 1 180 | 38,4 km |
| `railing` | OSM `barrier=fence` avec `fence_type=railing/bars/metal`, `guard_rail`, `handrail` | 660 | 12,8 km |
| `hedge` | OSM `barrier=hedge` | 292 | 9,4 km |
| `quay_wall` | OSM `barrier=retaining_wall` longeant la Seine ou le canal (au moins la moitié de la ligne à moins de 45 m du bord de l'eau) ; BD TOPO « Quai » | 243 | 41,0 km |

`height` : OSM `height` quand il existe (241 lignes), sinon `null`.
Les lignes OSM sont **interrompues de 3 m à chaque portail connu** (829 nœuds `barrier=gate`, `entrance=*`…).
BD TOPO : 104 lignes ajoutées, 195 écartées comme doublons d'une barrière OSM (plus de la moitié de la ligne à moins de 6 m).

### 4.5 `places.geojson` — 3 278 toponymes (1,0 Mo)

Champs du contrat : `kind`, `name`. Champs supplémentaires : `rank` (1 majeur, 2 moyen, 3 mineur), `source`.

| `kind` | Géométrie | Origine | Objets |
|---|---|---|---|
| `street` | LineString | plus longue chaîne d'arêtes de même nom (une par tronçon continu ; chaussées jumelles dédoublonnées) | 1 799 |
| `quay` | LineString | idem, noms commençant par « Quai » ou « Port » | 45 |
| `bridge` | LineString | idem, « Pont », « Passerelle », « Viaduc », « Petit-Pont » | 35 |
| `square` | Point | OSM `place=square`, surfaces `plaza` nommées, voies nommées « Place / Rond-Point / Carrefour / Parvis / Esplanade » | 284 |
| `garden` | Point | parcs, jardins et cimetières nommés de `areas` | 230 |
| `district` | Point | OSM `place=suburb/quarter/neighbourhood`, limites administratives de niveau 9 (arrondissements) et 10 (quartiers) | 68 |
| `monument` | Point | OSM `historic=monument/castle/palace/church…`, lieux de culte, `tourism=attraction/museum` et hôtels particuliers dotés d'une fiche Wikidata, mémoriaux notables | 365 |
| `station` | Point | OSM `railway=station/halt`, `public_transport=station` (métro, RER, train), dédoublonnées par nom | 94 |
| `institution` | Point | OSM mairies, tribunaux, commissariats, casernes de pompiers, ambassades, hôpitaux, bibliothèques, `office=government/diplomatic`, enseignement supérieur public ou notoire (les écoles privées à nom commercial sont écartées) | 358 |

Rang des voies : 1 = `primary`, 2 = `secondary`/`tertiary`, 3 = le reste. Rang des places : surface ≥ 12 000 m² ou axe `primary` = 1.

### 4.6 Règle « aucune enseigne »

`lib-a.mjs` établit la liste des noms portés par au moins un commerce de l'extrait OSM (`shop`, `brand`, restauration,
banque, hôtel, `office` d'entreprise… : 18 242 noms). Un bâtiment, un monument non historique ou une institution qui
porte un de ces noms, ou qui est lui-même un commerce, perd son nom (bâtiments) ou est écarté (toponymes).
Les noms de voies, places, jardins, stations, édifices historiques et lieux de culte sont toujours conservés.

## 5. Contrôles exécutés (`fetch-a-8-check.mjs`, tous réussis)

1. Schéma : géométries, clés obligatoires, valeurs énumérées, types, anneaux fermés, identifiants uniques, coordonnées
   dans l'emprise + marge — 0 erreur sur les 5 couches.
2. Quadrillage de 500 m (13 × 7 = 91 cases) : **chaque case contient des bâtiments et des rues** (minimum 18 bâtiments et
   23 arêtes de rue hors cheminements piétons) ; aucune case n'a eu besoin d'être excusée par la Seine ou un jardin.
3. Place de l'Étoile : l'anneau « Place Charles de Gaulle » (12 arêtes) reçoit bien **les 12 avenues** — Champs-Élysées,
   Marceau, Iéna, Kléber, Victor Hugo, Foch, Grande Armée, Carnot, Mac-Mahon, Wagram, Hoche, Friedland.
4. Seine : un seul polygone, 100 % des cellules d'eau (trame de 10 m) d'un seul tenant ; elle entre par le bord ouest
   (latitude 48.8527 à 48.8552) et **sort par le bord sud** (longitude 2.3560 à 2.3611, à hauteur du pont de Sully) :
   elle ne rejoint pas le bord est, qui reste plus au nord que le fleuve. Six points de contrôle (milieu du fleuve, îles)
   corrects. Canal Saint-Martin et bassin de l'Arsenal présents (11 polygones).
5. Graphe des rues (hors chemins piétons, escaliers et pistes cyclables) : 9 695 arêtes, 7 501 nœuds, 482,5 km ; la composante principale
   porte 99,35 % de la longueur (les 39 autres sont des voies de service isolées ou coupées par le bord).
6. Toponymes : 20/20 grandes rues, 24/24 ponts de la Seine, 10/10 gares et stations, toutes les grandes places, jardins et
   monuments attendus (hors Jardin du Luxembourg, Panthéon et place de la Nation, situés hors de l'emprise).
7. Enseignes : aucun bâtiment ordinaire ni aucune institution ne porte un nom de commerce.

Contrôles complémentaires faits à la main (non rejoués par le script) : rendus PNG des cinq couches sur toute l'emprise et
sur l'Étoile, la Concorde et l'île de la Cité (regardés) ; validité des polygones (17 anneaux auto-sécants sur 62 159 :
1 bâtiment, 16 surfaces du plan de voirie ; aucun trou hors de son polygone) ; chaîne rejouée sur l'extrait du miroir BBBike.

## 6. Limites connues

- **Hauteurs** : `height` est la hauteur à la gouttière de la BD TOPO ; ajouter le toit (2 à 5 m pour un immeuble
  haussmannien). 1 383 bâtiments (4,4 %, surtout de petites annexes) n'ont pas de hauteur : à la construction de décider.
  `levels` vient des fichiers fonciers et ne concorde pas toujours avec `height` : `height` prime.
- **Nature des bâtiments** : 3 822 `other` sont des bâtiments sans usage connu ni dans la BD TOPO ni dans OSM
  (médiane 40 m² : annexes de cour). `office` désigne les bâtiments d'activité sans logement (bureaux, mais aussi
  équipements non identifiés).
- **Tour Eiffel, Arc de Triomphe, Louvre…** figurent comme bâtiments ordinaires (`monument`) : la construction doit les
  remplacer par les modèles du lot B (`landmarks.geojson`).
- **Trottoirs filaires et passages piétons absents de `roads`** (voir 4.2) : la navigation des piétons doit s'appuyer sur
  les polygones `sidewalk`.
- **Largeur** : `width` est une largeur de chaussée par tronçon (valeurs BD TOPO arrondies : 3, 4, 5, 7, 9, 12 m…) ; pour
  le dessin exact, préférer les polygones `roadway`. 61 arêtes carrossables sans largeur (grandes places : Concorde, Opéra,
  Trocadéro), 9 036 arêtes sans largeur en comptant chemins piétons, escaliers et pistes cyclables.
- **Vitesse** : `maxspeed` n'est rempli que là où OSM le donne (Paris est limité à 30 km/h sauf exceptions).
- **Tunnels** : seules les voies souterraines étiquetées avec une couche négative sont `tunnel` ; les passages sous
  immeuble sont `covered`. Les polygones `roadway` de la Ville ne distinguent pas les trémies.
- **Barrières** : couverture inégale (ce qu'OSM a relevé). Les grilles d'un square absentes d'OSM ne sont pas inventées.
  Hauteur connue pour 241 lignes seulement. Les murs de quai sont les murs de soutènement des berges ; le bord de l'eau
  lui-même est le contour du polygone `water`.
- **Surfaces** : les couches se recouvrent (parc sous ses allées, îlot sous ses bâtiments) : respecter l'ordre `z`.
  Les emprises ferroviaires (Saint-Lazare, gare de l'Est) n'ont pas de surface dédiée. Les polygones de la Ville et ceux
  d'OSM ne sont pas recalés entre eux (écarts de l'ordre du mètre au bord de l'eau).
- **Noms des jardins venus de la Ville** (61) : la source est en capitales sans accents ; ils sont remis en casse de
  titre mais restent sans accents (« Square Andre Lefevre »).
- **Places** : les chaînes de rues s'arrêtent là où le nom change (les Champs-Élysées donnent deux lignes, de part et
  d'autre du Rond-Point). 6,8 % des noms officiels du filaire de la Ville manquent : voies souterraines des Halles
  (« Voie B/10 »), ports de la Seine, variantes d'orthographe.
- **Fraîcheur** : instantané du 15 novembre 2026 ; la BD TOPO est servie dans son édition courante sans numéro de version
  dans la réponse WFS.
