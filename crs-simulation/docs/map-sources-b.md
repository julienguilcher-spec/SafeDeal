# Carte de Paris — sources des couches de détail (lot B)

Couches concernées : `trees`, `furniture`, `shops`, `signals`, `metro`, `landmarks` (GeoJSON, WGS84, une `FeatureCollection`
par fichier, un objet par ligne) et `terrain.json`, dans `tools/map/raw/normalized/`.
Les couches structurelles (`buildings`, `roads`, `areas`, `barriers`, `places`) relèvent du lot A : voir `docs/map-sources-a.md`.

Emprise : longitude 2.2850 → 2.3725, latitude 48.8500 → 48.8780. Les objets ponctuels sont gardés dans l'emprise élargie d'une
**marge de 60 m** (même convention que le lot A) ; le relief couvre l'emprise élargie de **300 m**.

État au 15 novembre 2026. Tous les chiffres ci-dessous sortent des scripts (`node tools/map/fetch-b-all.mjs`).

## 1. Relancer la chaîne

```
node tools/map/fetch-b-all.mjs            # cache disque (raw/b/) : ≈ 10 s, aucune requête
node tools/map/fetch-b-all.mjs --force    # retélécharge tout : 65 requêtes, ≈ 78 Mo en cache (dont 48 Mo d'extrait OSM)
node tools/map/fetch-b-8-check.mjs --preview   # contrôle + plan d'ensemble raw/b/preview-b.svg
```

| Script | Rôle | Sortie |
|---|---|---|
| `lib-b.mjs` | emprise et projection, téléchargement poli avec cache, lecteur OSM PBF, géométrie, index en grille, GeoJSON, état des scripts | — |
| `fetch-b-1-osm.mjs` | extrait OpenStreetMap → objets utiles au lot B | `raw/b/osm-extract-b.json` |
| `fetch-b-2-trees.mjs` | couche `trees` | `raw/normalized/trees.geojson` |
| `fetch-b-3-landmarks.mjs` | couche `landmarks` (lit `buildings` du lot A) | `raw/normalized/landmarks.geojson` |
| `fetch-b-4-furniture.mjs` | couche `furniture` (lit `landmarks`, et `buildings` + `roads` du lot A) | `raw/normalized/furniture.geojson` |
| `fetch-b-5-shops.mjs` | couche `shops` | `raw/normalized/shops.geojson` |
| `fetch-b-6-signals-metro.mjs` | couches `signals` et `metro` | `raw/normalized/signals.geojson`, `metro.geojson` |
| `fetch-b-7-terrain.mjs` | relief | `raw/normalized/terrain.json` |
| `fetch-b-8-check.mjs` | contrôles (code de sortie 1 en cas d'échec) | `raw/b/check-b.json` |
| `fetch-b-all.mjs` | enchaîne les huit scripts dans l'ordre des dépendances | — |

Aucune dépendance npm : Node 22 et `curl` (qui traverse le proxy tel quel). Les scripts du lot B n'importent rien du lot A ;
ils **lisent** seulement, s'ils existent, `raw/osm/paris.osm.pbf` (pour ne pas télécharger deux fois le même fichier),
`raw/normalized/buildings.geojson` et `raw/normalized/roads.geojson`.

Politesse : agent utilisateur `crs-sim-mapbuilder/0.1`, 1 requête par seconde et par hôte, cache disque de chaque réponse
(`raw/b/<source>/…`), reprises après 2 s puis 8 s, hôte abandonné après 3 échecs consécutifs.

**Replis.** Quand un hôte est abandonné, le script concerné change de source au lieu d'échouer, écrit la couche avec ce qu'il a
et note le repli dans `raw/b/status/<script>.json` ; le contrôle **refuse** alors la couche (« produit en mode dégradé »).

| Source en panne | Repli |
|---|---|
| Ville de Paris | arbres, mobilier, feux : OpenStreetMap seul (plus de supports de feux, stations de vélos tirées d'OSM) |
| Apur (BDCOM) | commerces OpenStreetMap seuls |
| Île-de-France Mobilités | stations tirées des nœuds `railway=station` d'OSM, lignes inconnues |
| IGN (WFS) | Pont Neuf : tampon de 20,5 m autour de l'axe des chaussées OSM ; pont Alexandre III : surface OSM `man_made=bridge` |
| IGN (altimétrie) | **relief plat à 33 m**, `flat: true` dans `terrain.json` |
| `download.openstreetmap.fr` | miroir `download.bbbike.org` |

Ces replis ont été exercés sans réseau avec deux variables d'environnement prévues pour cela :
`CRS_MAP_FAIL_HOSTS=hôte1,hôte2` (hôtes déclarés en panne) et `CRS_MAP_NORM=/un/dossier` (sorties redirigées, pour ne pas
écraser les vraies couches).

## 2. Sources retenues

### 2.1 OpenStreetMap

- Fichier : `https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf` — le même que le lot A
  (47,9 Mo, md5 `854a5c983ac30b9ce94234c0e3233bf5`, retéléchargé une fois par le lot B : fichier identique octet pour octet).
  Miroir de secours : `https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf`.
- Licence : **Open Database License (ODbL) 1.0**. Attribution exacte : **« © les contributeurs d'OpenStreetMap »**, avec lien
  vers `https://www.openstreetmap.org/copyright`.
- Extrait du lot B (emprise + 60 m) : 107 820 nœuds étiquetés utiles, 30 647 chemins, 4 749 relations (42 Mo en cache).
- Utilisé pour : lampadaires, bancs, corbeilles, abribus, colonnes Morris, panneaux, mâts, potelets, fontaines ornementales,
  statues ; arbres hors gestion municipale ; passages piétons et nœuds de feux ; bouches de métro ; contour des monuments ;
  commerces là où la BDCOM n'a rien.

### 2.2 Ville de Paris — open data (`opendata.paris.fr`, API Explore v2.1)

Export : `…/api/explore/v2.1/catalog/datasets/<identifiant>/exports/json` avec `where=in_bbox(<champ point>, …)` et `select=…`.
12 requêtes (métadonnées + export pour chaque jeu). Tous sous **Open Database License (ODbL)**.

| Identifiant du jeu | Titre | Producteur | Mis à jour | Enregistrements reçus | Usage |
|---|---|---|---|---|---|
| `les-arbres` | Arbres | Direction des Espaces Verts et de l'Environnement | 2026-11-13 | 34 029 | `trees` |
| `signalisation-tricolore` | Signalisation lumineuse tricolore | Direction de la Voirie et des Déplacements | 2026-11-01 | 37 603 foyers (domaine « Signalisation Tricolore ») | `signals` : supports de feux |
| `fontaines-a-boire` | Fontaines à boire | Eau de Paris | 2026-11-09 | 213 | `furniture` : `wallace_fountain`, `fountain` |
| `sanisettesparis` | Toilettes publiques | Ville de Paris | 2026-11-15 | 153 | `furniture` : `toilet` |
| `velib-emplacement-des-stations` | Vélib' - Localisation et caractéristique des stations | Autolib Velib Métropole | 2026-11-15 | 302 | `furniture` : `velib` |
| `kiosques-de-presse` | Kiosques de presse | Direction de l'Attractivité et de l'Emploi | **2020-01-29** | 180 | `furniture` : `newsstand` |

- Attribution exacte (identique à celle du lot A) : **« Ville de Paris — Paris Data (opendata.paris.fr), licence ODbL »**.

### 2.3 Apur — BDCOM 2023

- Jeu : « BDCOM 2023 » du portail `opendata.apur.org` (identifiant d'élément `0984a17f57b148db95491085f2cc1533`), servi par
  `https://carto2.apur.org/apur/rest/services/BDCOM/bdcom2023/MapServer`, **couche 1 « Local »** : tous les locaux en
  rez-de-chaussée (commerces, locaux vacants, bureaux et ateliers en boutique, commerce de gros, médical, spectacles).
  Requêtes `query` avec enveloppe en EPSG:4326, pages de 1 000 triées par `OBJECTID` : 34 requêtes (description de couche,
  compte, 32 pages), 31 263 locaux annoncés et reçus.
- Licence : **ODbL 1.0** (métadonnée `license: ODbL-1.0`, résumé : `https://www.apur.org/open_data/resume_licence_ODbl.pdf`).
- Attribution exacte : **« Apur — BDCOM 2023, licence ODbL »** (la métadonnée `source` du jeu indique « Atelier Parisien d'Urbanisme »).

### 2.4 Île-de-France Mobilités (`data.iledefrance-mobilites.fr`, API Explore v2.1)

6 requêtes. Tous sous **Licence Ouverte v2.0 (Etalab)**.

| Identifiant du jeu | Titre | Mis à jour | Reçus (emprise + 400 m) | Usage |
|---|---|---|---|---|
| `emplacement-des-gares-idf` | Gares et stations du réseau ferré d'Île-de-France (par ligne) | 2026-10-21 | 186 couples station-ligne (116 stations, dont 90 dans l'emprise) | `metro` : stations, lignes |
| `acces` | Référentiel des arrêts : Accès | 2026-11-15 | 436 accès | rattachement des bouches à leur station, complément |
| `relations-acces` | Référentiel des arrêts : Relations accès | 2026-11-15 | 2 573 (jeu entier) | lien accès → zone d'arrêt → station |

- Attribution exacte : **« Île-de-France Mobilités — référentiels des arrêts et des gares, Licence Ouverte 2.0 »**.

### 2.5 IGN

- **RGE ALTI®** par le service d'altimétrie de la Géoplateforme :
  `POST https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`, ressource `ign_rge_alti_wld`
  (« RGE Alti - France entière »), paquets de 4 245 points (15 lignes de grille), 11 requêtes pour 42 733 points.
- **BD TOPO®** `BDTOPO_V3:construction_surfacique` par le WFS `https://data.geopf.fr/wfs/ows` : 1 requête, 26 objets, dont les
  emprises « Pont Neuf » (2) et « Pont Alexandre III » (1).
- Licence : **Licence Ouverte / Open Licence 2.0 (Etalab)**.
- Attribution exacte : **« IGN — RGE ALTI® et BD TOPO®, données extraites en novembre 2026 »**.

### 2.6 Conséquence des licences pour le jeu

Mêmes règles que pour le lot A : les fichiers de carte publiés sont une **base dérivée sous ODbL** (OpenStreetMap, Ville de Paris
et Apur imposent le partage à l'identique) ; la Licence Ouverte 2.0 (IGN, Île-de-France Mobilités) est compatible.
Crédits à afficher en plus de ceux du lot A : **Apur — BDCOM 2023** et **Île-de-France Mobilités**.

## 3. Sources écartées

Les nombres d'objets cités pour les jeux écartés de la Ville ont été mesurés pendant l'exploration, sur l'emprise élargie de 300 m.

| Source | Raison |
|---|---|
| `overpass-api.de`, `download.geofabrik.de` | réessayés une fois le 15 novembre 2026 : connexion coupée (code 000 en 3 s) ; inutiles, l'extrait PBF suffit |
| Ville de Paris `plan-de-voirie-mobiliers-urbains-jardinieres-bancs-corbeilles-de-rue` | 55 642 fragments de lignes de DAO dans l'emprise, tous de classe « ENVIRONNEMENT » : banc, corbeille et jardinière ne sont pas distingués |
| Ville de Paris `plan-de-voirie-mobiliers-urbains-bornes-barrieres-potelets` | 418 000 fragments (« BORNE » 283 693, « BARRIERE » 134 412) sans attribut. Les potelets y sont des cercles fermés de 0,25 m, 0,63 m ou 1,00 m de périmètre : ils seraient reconstructibles, mais seulement en téléchargeant toute la géométrie (plusieurs centaines de Mo). **Non fait.** |
| Ville de Paris `plan-de-voirie-mobiliers-urbains-abris-voyageurs-points-darrets-bus`, `…-kiosques-toilettes-publiques-panneaux-publicita` | 12 543 et 27 180 fragments de DAO sans classe exploitable |
| Ville de Paris `plan-de-voirie-acces-pietons-metro-et-parkings` | 596 polygones dans l'emprise, mais accès de métro et de parkings confondus |
| Éclairage public de la Ville de Paris | **introuvable** : absent des 484 jeux du catalogue (`eclairage-public` → 404), 0 ressource sur data.gouv.fr (« Éclairage public de Paris - Données géographiques »), rien sur `data.iledefrance.fr`. Les lampadaires viennent donc d'OpenStreetMap seul |
| Ville de Paris `signalisation-tricolore`, domaine « Signalisation Complémentaire » | bornes, musoirs et potelets lumineux (2 378 objets) : hors contrat |
| Ville de Paris `terrasses-autorisations` | 10 406 autorisations dans l'emprise (longueur et largeur des terrasses) : non utilisé, pourrait servir plus tard à poser les terrasses de café |
| Ville de Paris `commerces-eau-de-paris`, `commerces-semaest`, `horodateurs-mobiliers`, `bornes-dappel-taxi`, `panneaux_d_affichage_associatifs` | listes thématiques partielles ou natures hors contrat |
| Apur BDCOM 2020 et 2017 | versions plus anciennes du même recensement |
| Apur BDCOM 2023, couche 0 | ne contient que les commerces actifs (23 683 dans l'emprise) ; la couche 1 ajoute 3 484 locaux vacants et les autres locaux |
| OSM `amenity=bicycle_rental` | doublon du jeu Vélib' (sert seulement de repli) |
| OSM `emergency=phone` | bornes d'appel ferroviaires, pas du mobilier de rue |
| IGN LiDAR HD (`ign_lidar_hd_mnt_*`) | non essayé : le RGE ALTI suffit pour un pas de 25 m |
| Outils MCP data.gouv.fr | utilisés seulement pour chercher un jeu d'éclairage public (sans succès) |

## 4. Correspondance des champs

Propriétés du contrat en gras ; les autres sont des compléments que la construction peut ignorer.

### 4.1 `trees.geojson` — 38 109 arbres (6,0 Mo)

| Champ | Origine |
|---|---|
| **`height`** | Paris `hauteurenm` ; OSM `height`. Gardé entre 1 et 45 m, sinon `null` (les 0 de la source sont des « non mesuré ») |
| **`crown`** | **estimation** : aucune source ne mesure le houppier. 1,5 + 0,045 × circonférence du tronc (cm), borné à 2–14 m ; à défaut 1 + 0,45 × hauteur, borné à 2–12 m ; arrondi à 0,5 m. OSM `diameter_crown` s'il existe (aucun dans l'emprise) |
| `genus` | Paris `genre` ; OSM `genus` |
| `source` | `paris` (33 934) ou `osm` (4 175) |

Dédoublonnage : deux enregistrements municipaux à moins de 1 m (94 retirés) ; un arbre OSM à moins de 3 m d'un arbre municipal
est le même arbre (26 594 retirés sur 30 769). Les arbres OSM gardés sont ceux des jardins de l'État et des domaines privés :
1 267 aux Tuileries, 279 au Palais-Royal, 164 sur l'esplanade des Invalides.
Hauteur connue : 34 421 (90,3 %) — médiane 10 m, 5 % sous 4 m, 5 % au-dessus de 20 m, maximum 35 m. Houppier estimé : 34 453.
Genres : Platanus 11 587, Aesculus 6 541, Tilia 3 705, Styphnolobium 1 717, Acer 1 227 ; inconnu 3 202.

### 4.2 `furniture.geojson` — 18 204 objets (3,1 Mo)

| Champ | Origine |
|---|---|
| **`kind`** | voir le tableau ci-dessous |
| **`heading`** | azimut en degrés, 0 = nord, 90 = est, sens horaire, vers lequel l'objet fait face ; `null` si inconnu. Cap du jeu : `h = π − heading × π / 180` |
| `headingSrc` | `osm` (étiquette `direction`, 79 objets) ou `road` (13 002 objets : orientation **calculée** vers l'axe de la chaussée la plus proche à moins de 35 m, d'après `roads.geojson`) |
| `sub`, `name`, `model`, `capacity`, `radius` | précisions selon la nature |
| `landmark` | clé du monument dont l'emprise contient l'objet (65 objets, dont 14 lampadaires sur chacun des deux ponts) : à la construction de voir s'il fait double emploi avec le modèle |
| `source` | `paris` (847) ou `osm` (17 357) |

| `kind` | Nombre | Source et règle |
|---|---|---|
| `lamp` | 9 318 | OSM `highway=street_lamp` ; `sub` = `mast` (8 908) ou `wall` (410) |
| `bench` | 3 723 | OSM `amenity=bench` (nœuds et chemins) |
| `bin` | 1 346 | OSM `amenity=waste_basket` |
| `bollard` | 1 062 | OSM `barrier=bollard` ; `sub` = fixed / removable / rising |
| `bus_shelter` | 487 | OSM `amenity=shelter` + `shelter_type=public_transport`, puis `highway=bus_stop` + `shelter=yes` s'il n'y a pas déjà un abri à moins de 12 m ; `name` = nom de l'arrêt |
| `statue` | 472 | OSM `tourism=artwork` (statue, sculpture, bust), `historic=memorial` (statue, bust, sculpture, war_memorial, stele, obelisk), `historic=monument` ; emprise de moins de 400 m² |
| `fountain` | 401 | `sub: drinking` : Paris `fontaines-a-boire` hors Wallace (184, avec `model`) + OSM `amenity=drinking_water` sans fontaine municipale à moins de 15 m (50) ; `sub: ornamental` : OSM `amenity=fountain` (167, avec `name` et `radius`) |
| `velib` | 302 | Paris `velib-emplacement-des-stations` ; `name`, `capacity` |
| `advert_panel` | 298 | OSM `advertising=poster_box / billboard / board / screen`, hors panneaux portés par un abribus, un kiosque, une vitrine ou un mur |
| `flagpole` | 253 | OSM `man_made=flagpole` ; `sub` = `ground` (228) ou `building` (25 : mât dans l'emprise d'un bâtiment) |
| `newsstand` | 181 | Paris `kiosques-de-presse` (179) + kiosques de presse OSM sans kiosque municipal à moins de 15 m (2) |
| `toilet` | 174 | Paris `sanisettesparis` (153 ; `sub` = sanisette 115, wc 27, urinoir 6, lavatory 5) + OSM `amenity=toilets` accessibles, hors bâtiment, à plus de 25 m d'une toilette municipale (21) |
| `morris_column` | 124 | OSM `advertising=column` |
| `wallace_fountain` | 34 | Paris `fontaines-a-boire`, `type_objet = FONTNE_WALLACE` (29) + OSM `fountain=wallace` à plus de 15 m (5) |
| `kiosk` | 29 | OSM `shop=kiosk` / `building=kiosk` hors presse (25) et `leisure=bandstand` (4) |
| `phone` | **0** | OSM `amenity=telephone` : aucun dans l'emprise |

Écartés : 246 objets OSM situés dans un bâtiment de la couche `buildings` (mobilier d'intérieur), 68 statues et fontaines situées
dans l'emprise d'un monument modélisé à la main, 469 objets OSM doublant un objet municipal, 27 doublons, objets souterrains ou en étage
(`level`, `indoor`, `layer < 0`).
Noms : les parenthèses sont retirées et une liste explicite d'enseignes (`BRAND_RE` dans `lib-b.mjs`) met le nom à `null`.

### 4.3 `shops.geojson` — 31 018 locaux (7,0 Mo)

| Champ | Origine |
|---|---|
| **`category`** | BDCOM : libellé du code d'activité `codact` (219 libellés distincts, ex. « Prêt-à-porter Femme », « Local vacant ») ; OSM : `clé=valeur` (ex. `amenity=restaurant`). Les trois libellés BDCOM qui citaient une enseigne en exemple ont été réécrits (codes `CA201`, `SA513`, `CI108`) |
| **`name`** | BDCOM `ens`, OSM `name` — **nom brut de l'enseigne, à retirer avant publication** ; `null` pour 4 737 locaux (« *** NON RENSEIGNE *** », locaux vacants) |
| `group` | famille normalisée commune aux deux sources (33 valeurs, liste `GROUPS` de `fetch-b-5-shops.mjs`) |
| `situation` | BDCOM `sit` : `street` (24 358), `corner` (3 972), `mall` (1 511 : concentration commerciale), `courtyard` (694) ; OSM : `mall` si étage ou sous-sol, sinon `null` |
| `size` | BDCOM `surf` : `s` moins de 300 m² (28 834), `m` 300 à 1 000 m² (1 083), `l` plus de 1 000 m² (618) |
| `source` | `bdcom` (30 535) ou `osm` (483) |

BDCOM : 31 263 locaux reçus, 553 hors de l'emprise + 60 m, 175 kiosques (type `K`) laissés à la couche `furniture`.
OSM en complément seulement : sur 21 757 commerces OSM, 21 080 ont un local BDCOM à moins de 30 m et 194 portent le nom d'un
local BDCOM situé à moins de 150 m ; restent 483 objets (gares, jardins, musées, galeries souterraines).

Familles : restaurant 3 970 · vacant 3 433 · fashion 3 124 · office 2 138 · service 1 860 · fast_food 1 829 ·
culture_leisure 1 587 · beauty 1 527 · food 1 264 · home 1 218 · health_beauty 937 · hotel 901 · cafe 876 · jewelry 809 ·
agency 721 · other 720 · wholesale 628 · bank 469 · medical 438 · grocery 408 · bakery 401 · books_press 379 ·
electronics 282 · pharmacy 251 · auto 184 · florist 158 · diy 121 · theatre 104 · supermarket 78 · nightclub 75 ·
tobacco 72 · cinema 37 · department_store 19.

Couverture des axes demandés (locaux à moins de 40 à 60 m de l'axe) :

| Axe ou quartier | Locaux | Densité |
|---|---|---|
| Champs-Élysées (Étoile → Concorde, 1 906 m) | 253 | 13,3 / 100 m |
| Rue de Rivoli (Concorde → Saint-Paul, 3 064 m) | 408 | 13,3 / 100 m |
| Grands Boulevards (Madeleine → République, 2 831 m) | 808 | 28,5 / 100 m |
| Boulevard Saint-Germain (Assemblée → Maubert, 2 471 m) | 453 | 18,3 / 100 m |
| Marais | 3 373 | — |
| Châtelet – Les Halles | 1 793 | — |
| Saint-Germain-des-Prés | 1 722 | — |

### 4.4 `signals.geojson` — 15 922 objets (3,1 Mo)

| `kind` | `sub` | Nombre | Origine |
|---|---|---|---|
| **`traffic_signals`** | `pole` | 6 701 | Paris `signalisation-tricolore` : un point par **support** (`cod_ouvrag`), sur le trottoir. `vehicle` = nombre de phares, `repeater` = répétiteurs, `ped` = caissons piétons, `support` = standard 3 658 / style 1 307 / lamp_post 301 / temporary 54 / facade 11 / `null` 1 370, `ref` = code de l'ouvrage |
| **`traffic_signals`** | `junction` | 1 361 | OSM `highway=traffic_signals` : nœud sur l'**axe de la chaussée**, là où la circulation s'arrête ; `dir` = `traffic_signals:direction` |
| **`crossing`** | — | 7 860 | OSM `highway=crossing`, sur l'axe de la chaussée ; `signals` (3 127 avec feux), `marked`, `island` |

Les deux sortes de `traffic_signals` ne se doublent pas : `pole` sert au rendu (mâts), `junction` à la logique de circulation.

### 4.5 `metro.geojson` — 532 objets (0,13 Mo)

| `kind` | Nombre | Champs |
|---|---|---|
| **`station`** | 90 | **`name`**, **`lines`**, `modes`, `ref` (zone de correspondance), `source: idfm`. Une station par zone de correspondance : « Châtelet » et « Châtelet-Les Halles » restent distinctes. Position = moyenne des points des lignes |
| **`entrance`** | 442 | **`name`** = station, **`lines`** = lignes de la station, `sub` (metro 350 / rer 49 / train 43), `exit` = libellé de la sortie, `ref` = numéro de sortie, `matched`, `source` |

`lines` : métro `"1"`, `"7bis"` ; RER `"RER A"` ; Transilien `"TRAIN J"` ; `"TER"`. Ex. Saint-Lazare : `["3","12","13","14","TER","TRAIN J","TRAIN L"]`.
Bouches : 434 nœuds OSM (`railway=subway_entrance`, et `train_station_entrance` au niveau de la rue ; 28 entrées de gare en
étage ou en sous-sol écartées) + 8 accès du référentiel sans bouche OSM à moins de 25 m. Rattachement à la station : par l'accès
du référentiel le plus proche à moins de 25 m (410 bouches), sinon par la station la plus proche à moins de 350 m (24).

### 4.6 `landmarks.geojson` — 43 polygones pour 40 monuments (0,2 Mo)

| Champ | Contenu |
|---|---|
| **`key`**, **`name`** | clé stable en minuscules, nom d'usage |
| **`height`** | hauteur hors tout (m) ; provenance dans `heightSource` |
| **`sourceIds`** | identifiants de `buildings.geojson` (lot A) dont au moins la moitié de la surface tombe dans l'emprise : **bâtiments génériques à retirer du rendu** (130 identifiants, tous vérifiés présents) |
| `heightSource` | `reference` = valeur encyclopédique arrondie, saisie à la main (**à vérifier**) ; `osm` = étiquette `height` ; `osm:part` = plus haut `building:part` dans l'emprise ; `bdtopo` = plus haute gouttière ; `estimate` = estimation grossière |
| `eaveHeight`, `osmHeight` | plus haute gouttière BD TOPO des bâtiments recouverts ; hauteur OSM |
| `part`, `parts` | **un monument en plusieurs morceaux donne plusieurs objets de même `key`** (le contrat impose des Polygon) : `fontaines_concorde` (`nord` = fontaine des Fleuves, `sud` = fontaine des Mers), `palais_chaillot` (1, 2), `pont_neuf` (1, 2) |
| `footprint` | `osm`, `ign` (ponts) ou `derived` (Conciergerie) |
| `osm`, `ign`, `wikidata` | objet source |
| `area`, `center` | surface nette (m²), centre `[lon, lat]` |
| `partOf`, `note` | `conciergerie` → `palais_justice` |

Les trous des polygones sont les cours intérieures. L'aire ci-dessous est celle du contour extérieur.

| Clé | Morceaux | Aire (m²) | Hauteur (provenance) | Gouttière BD TOPO | Emprise | Bâtiments à retirer | Part couverte |
|---|---|---|---|---|---|---|---|
| `arc_triomphe` | 1 | 1 389 | 50 (reference) | 46,2 | OSM `w226413508` | 1 | 69 % |
| `tour_eiffel` | 1 | 9 754 | 330 (reference) | 286,4 | OSM `w5013364` | 4 | 94 % |
| `obelisque_concorde` | 1 | 16 | 33,4 (bdtopo) | 33,4 | OSM `w72937686` | 1 | 98 % |
| `fontaines_concorde` | 2 | 363 | 9 (reference) | — | OSM `w72937684`, `w72937685` | 2 | 17 % |
| `louvre` | 1 | 71 079 | 44,3 (bdtopo) | 44,3 | OSM `r3262297` | 18 | 100 % |
| `pyramide_louvre` | 1 | 1 349 | 21,6 (reference) | 2,1 | OSM `w375076234` | 1 | 99 % |
| `arc_carrousel` | 1 | 148 | 19 (reference) | 17 | OSM `w227483542` | 2 | 91 % |
| `notre_dame` | 1 | 6 880 | 96 (reference) | 66 | OSM `w201611261` | 7 | 95 % |
| `sainte_chapelle` | 1 | 553 | 75 (reference) | 23,4 | OSM `r3344870` | 1 | 92 % |
| `conciergerie` | 1 | 6 715 | 47 (osm:part) | 23,4 | dérivée de `r536982` | 3 | 4 % |
| `opera_garnier` | 1 | 10 139 | 56 (reference) | 44,9 | OSM `w54667456` | 4 | 100 % |
| `invalides` | 1 | 49 949 | 107 (reference) | 25 | OSM `r1463538` | 4 | 100 % |
| `grand_palais` | 1 | 27 193 | 45 (reference) | 42,5 | OSM `w56185523` | 2 | 100 % |
| `petit_palais` | 1 | 8 704 | 21,3 (bdtopo) | 21,3 | OSM `r2778854` | 1 | 98 % |
| `pont_alexandre_iii` | 1 | 6 574 | 17 (reference) | 17 | IGN `CONSSURF0000000000148141` | 3 | 2 % |
| `madeleine` | 1 | 5 560 | 30 (reference) | 29,6 | OSM `w54180046` | 1 | 81 % |
| `palais_bourbon` | 1 | 17 051 | 27,4 (osm:part) | 25,5 | OSM `r1019368` | 7 | 88 % |
| `hotel_de_ville` | 1 | 11 726 | 40 (osm) | 25,2 | OSM `r284089` | 1 | 100 % |
| `colonne_vendome` | 1 | 41 | 44,3 (reference) | 44,3 | OSM `w227762241` | 1 | 100 % |
| `colonne_juillet` | 1 | 255 | 50,5 (reference) | 46,3 | OSM `w227757683` | 1 | 100 % |
| `opera_bastille` | 1 | 18 872 | 48 (reference) | 43,9 | OSM `w78149064` | 8 | 96 % |
| `statue_republique` | 1 | 152 | 25 (reference) | 5,6 | OSM `w227150549` | 1 | 89 % |
| `palais_chaillot` | 2 | 14 954 | 30 (osm) | 26,9 | OSM `r6826569` | 4 | 99 % |
| `ecole_militaire` | 1 | 24 587 | 24 (osm:part) | 20,3 | OSM `r1083195` | 4 | 100 % |
| `centre_pompidou` | 1 | 10 314 | 42 (reference) | 48,1 | OSM `w55503397` | 1 | 99 % |
| `tour_saint_jacques` | 1 | 151 | 54 (reference) | 52 | OSM `w20326709` | 1 | 90 % |
| `palais_royal` | 1 | 14 337 | 30 (osm) | 18,2 | OSM `r3300400` | 3 | 99 % |
| `bourse_commerce` | 1 | 3 525 | 36,3 (osm:part) | 28,7 | OSM `w19856722` | 2 | 100 % |
| `palais_elysee` | 1 | 8 106 | 12 (osm) | 12 | OSM `r1060803` | 1 | 95 % |
| `hotel_marine` | 1 | 5 635 | 22,8 (bdtopo) | 22,8 | OSM `r1060822` | 1 | 95 % |
| `hotel_crillon` | 1 | 2 746 | 23,3 (bdtopo) | 23,3 | OSM `r1060804` | 1 | 98 % |
| `saint_eustache` | 1 | 4 207 | 50 (osm:part) | 38,2 | OSM `w53762963` | 4 | 96 % |
| `saint_sulpice` | 1 | 6 082 | 73 (reference) | 40,2 | OSM `w16077204` | 5 | 100 % |
| `pont_neuf` | 2 | 4 810 | — | — | IGN `CONSSURF0000000233470892`, `…895` | 0 | — |
| `institut_de_france` | 1 | 6 254 | 30,5 (bdtopo) | 30,5 | OSM `r967665` | 2 | 95 % |
| `musee_orsay` | 1 | 13 605 | 32 (reference) | 24,4 | OSM `w63178753` | 2 | 100 % |
| `gare_saint_lazare` | 1 | 45 931 | 35,4 (bdtopo) | 35,4 | OSM `w727994377` | 11 | 97 % |
| `prefecture_police` | 1 | 10 438 | 40 (osm:part) | 22,9 | OSM `r537263` | 1 | 100 % |
| `palais_justice` | 1 | 35 983 | 47 (osm:part) | 23,4 | OSM `r536982` | 6 | 96 % |
| `hotel_matignon` | 1 | 3 747 | 15 (estimate) | — | OSM `r1076880` | 1 | 99 % |

Les contours OSM sont retrouvés par leur identifiant Wikidata puis par leur identifiant OSM, sauf `opera_bastille` et
`ecole_militaire` (bâtiments sans nom ni Wikidata dans OSM : identifiant seul, avec repli sur « le plus grand bâtiment du site »).
`saint_sulpice` et `gare_saint_lazare` sont bien dans l'emprise.

### 4.7 `terrain.json` — 283 × 151 = 42 733 altitudes (246 Ko)

```
{ lon0, lat0,            // PREMIER échantillon (index 0) = coin NORD-OUEST de la grille : 2.2806521, 48.8809188
  cellM: 25,             // pas en mètres dans la projection du jeu ; cellDegLon, cellDegLat fournis aussi
  nx: 283, nz: 151,
  x0: -2975, z0: -1700,  // position du premier échantillon dans le repère du jeu
  originLon, originLat,  // origine du monde (obélisque), à ne pas confondre avec lon0 / lat0
  heights: [...] }       // heights[iz * nx + ix] ; ix croît vers l'est, iz vers le sud ; mètres NGF-IGN69
```

Grille calée sur les multiples de 25 m du repère local, de x = −2 975 à 4 075 et de z = −1 700 à 2 050.
`heightAt(x, z)` = interpolation bilinéaire entre les quatre nœuds voisins (formule dans `fetch-b-7-terrain.mjs`).
Altitudes de 22,23 m à 91,88 m ; aucune valeur manquante. Autres champs : `unit`, `marginM`, `flat`, `source`, `license`, `min`, `max`.

| Lieu | Altitude |
|---|---|
| Concorde (obélisque) | 32,8 m |
| Étoile (Arc de Triomphe) | 58,6 m |
| Trocadéro (parvis) | 60,5 m |
| République | 36,9 m |
| Bastille | 38,5 m |
| Opéra | 35,5 m |
| Champ-de-Mars | 35,0 m |
| Seine (ponts de la Concorde, Neuf, d'Iéna) | 26,5 m · 26,8 m · 26,4 m |

## 5. Contrôles (`fetch-b-8-check.mjs`)

Résultat du 15 novembre 2026 : **0 échec, 1 avertissement** (aucun téléphone public).

- Chaque couche ponctuelle : présence, schéma (natures du contrat, types, bornes), géométrie, objets hors emprise (0),
  doublons exacts (0), quasi-doublons de même nature (0), nombre minimal d'objets.
- Couverture par tuile de 512 m (98 tuiles) : aucune tuile vide pour `trees`, `furniture`, `shops`, `signals`.
- `shops` : seuils sur les quatre axes et les trois quartiers ci-dessus ; aucune catégorie ne cite d'enseigne.
- `metro` : au moins 70 stations, huit grandes stations présentes, aucune bouche sans station ni sans ligne.
- `landmarks` : les 40 clés, polygones fermés et orientés, tous les `sourceIds` présents dans `buildings.geojson`.
- `terrain` : dimensions, couverture de l'emprise + 300 m, dix altitudes de référence, fleuve plus bas que les places.
- États des scripts : toute couche produite en mode dégradé fait échouer le contrôle.
- Deux exécutions successives donnent des fichiers identiques (md5).

## 6. Limites connues

1. **Lampadaires partiels.** 9 318 lampadaires, tous d'OpenStreetMap, inégalement relevés : par quart de l'emprise d'ouest en
   est, 212, 446, 603 et 588 par km². 5 tuiles sur 98 n'en ont aucun (quatre sont la mince bande du bord ouest, une est au nord).
   La construction devra compléter le long des trottoirs, surtout à l'ouest.
2. **Potelets très partiels** (1 062) ; **aucun téléphone public** ; bancs et corbeilles limités à ce qu'OSM connaît.
3. **Kiosques de presse** : jeu municipal de janvier 2020.
4. **Cap du mobilier** : 79 valeurs relevées, 13 002 calculées vers la chaussée la plus proche (une hypothèse, pas une mesure),
   5 123 objets sans cap : natures sans orientation (corbeilles 1 346, potelets 1 062, statues 472, fontaines 435, stations de
   vélos 302, mâts 253) et objets à plus de 35 m d'une chaussée (923 bancs, 315 lampadaires, 15 autres).
5. **Houppier des arbres** : estimé, jamais mesuré. 3 688 arbres sans hauteur.
6. **Commerces** : relevé BDCOM de 2023 ; point posé à l'adresse du local, pas à sa porte ; 608 positions portent plusieurs
   locaux (2 833 locaux, jusqu'à 151 au même point pour une galerie marchande) : à répartir le long des façades.
   `name` est brut et doit être retiré ; `category` et `group` sont sans marque.
7. **Noms d'arrêts et de sorties** : le filtre d'enseignes est une liste explicite, pas une garantie. À repasser au filtre
   général avant publication.
8. **Feux** : les supports n'ont pas d'orientation ; 1 370 sans type de support.
9. **Métro** : la position d'une station est une moyenne ; Château-Landon (en limite nord) n'a aucune bouche dans l'emprise.
10. **Monuments** : les hauteurs `reference` sont des valeurs encyclopédiques saisies de mémoire, à vérifier avant de modéliser ;
    `hotel_matignon` est une estimation ; `pont_neuf` n'a pas de hauteur. L'emprise de la **Conciergerie est dérivée** (bande de
    50 m le long du quai de l'Horloge, de la tour Bonbec à la tour de l'Horloge) : ni OSM ni la BD TOPO ne la séparent du Palais
    de Justice, dont le bâtiment générique reste donc commun aux deux. `gare_saint_lazare` comprend la halle des voies.
    Les ponts ne sont pas des bâtiments : leurs `sourceIds` ne désignent que les pylônes (Alexandre III) ou sont vides (Pont Neuf) ;
    les chaussées correspondantes sont dans `roads.geojson` (`bridge: true`).
11. **Relief** : échantillons ponctuels du terrain nu, non lissés. 631 paires de nœuds voisins diffèrent de plus de 4 m
    (tranchées ferroviaires de Saint-Lazare et du RER C, quais bas, talus du Trocadéro). La Seine est à sa cote de surface
    (≈ 26,5 m) ; les tabliers des ponts ne sont pas dans le modèle. Un lissage est à prévoir pour le sol jouable.
