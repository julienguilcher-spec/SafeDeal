# Carte de Paris — construction des données finales du jeu

> Ce document décrit `tools/map/build.mjs` : comment les couches normalisées (lots A et B) deviennent les fichiers de
> `public/data/paris/` que le jeu charge. Sources et licences : `docs/map-sources-a.md`, `docs/map-sources-b.md`.
> Format des fichiers : `docs/map-format.md` (code : `src/world/mapdata.ts`).
> État au 16 novembre 2026. Tous les chiffres sortent du rapport de construction `tools/map/raw/build/report.json`.

## 1. En bref

```
node tools/map/build.mjs            # construit public/data/paris/ (8 s environ) et écrit le rapport
node tools/map/build.mjs --dry-run  # construit et contrôle sans rien écrire dans public/
npx vitest run tests/unit/mapdata   # relit tout avec le décodeur du jeu et vérifie les repères
```

- Entrée : les 12 couches de `tools/map/raw/normalized/` (dossier ignoré par git ; `node tools/map/fetch-a-all.mjs` puis
  `node tools/map/fetch-b-all.mjs` les reconstruisent). Aucun accès au réseau pendant la construction, aucune dépendance npm.
- Sortie : **104 fichiers, 9,08 Mo** (limites : 110 fichiers, 30 Mo) — 98 tuiles (7,82 Mo), `roadgraph.json` (0,98 Mo),
  `places.json` (135 ko), `terrain.json` (110 ko), `landmarks.json` (24 ko), `manifest.json` (7 ko), `LICENCE.txt`.
  Compressé par gzip (ce que sert un hébergeur statique) : 3,3 Mo pour les tuiles, le graphe et le relief.
  Dans ce document, 1 ko = 1 024 octets et 1 Mo = 1 048 576 octets.
- La construction est **déterministe** : deux exécutions de suite donnent des fichiers identiques octet pour octet (vérifié
  par somme md5 de tous les JSON). `generatedAt` vaut la date des couches d'entrée, pas l'heure de la construction.
- La construction **échoue** (code de sortie 1, rien n'est écrit dans `public/`) si le format est violé (`validateRawTile`, `validateMapData`),
  si moins de 97 % des arêtes carrossables sont dans la plus grande composante, si un nom publié est une enseigne, ou si
  le budget est dépassé.

| Contenu | Nombre |
|---|---|
| Bâtiments | 30 564 (dont 121 portent la clé d'un monument, 483 sont nommés) |
| Surfaces au sol (morceaux par tuile) | 30 252, pour 26 109 polygones |
| Barrières (morceaux par tuile) | 3 965, soit 139,9 km |
| Arbres | 38 109 |
| Mobilier urbain | 24 183 (dont 5 979 candélabres ajoutés, voir § 4.6) |
| Supports de feux | 6 701 |
| Bouches de métro | 442 |
| Commerces | 26 476 |
| Graphe routier | 17 242 nœuds, 20 060 arêtes, 589,7 km |
| Lieux nommés | 3 023 |
| Monuments | 43 entrées pour 40 monuments |
| Relief | 283 × 151 = 42 733 altitudes au pas de 25 m |

## 2. Chaîne de construction

| Fichier | Rôle |
|---|---|
| `build.mjs` | enchaîne les étapes, encode avec `mapdata.ts`, contrôle, écrit les fichiers et le rapport |
| `build-lib.mjs` | lecture des couches, projection, simplification (Douglas–Peucker), mesures, index spatiaux |
| `build-clip.mjs` | découpage des polygones et des lignes par tuile, réparation des contours qui se recoupent |
| `build-names.mjs` | règle « aucune enseigne » : filtres des noms de bâtiments, de lieux, de voies et de surfaces |
| `build-terrain.mjs` | relief lissé, niveau du fleuve |
| `build-landmarks.mjs` | monuments : clés uniques, ancrage, cap de la façade |
| `build-buildings.mjs` | bâtiments |
| `build-roads.mjs` | graphe routier |
| `build-surfaces.mjs` | surfaces au sol et barrières |
| `build-points.mjs` | arbres, mobilier, feux, bouches de métro |
| `build-shops.mjs` | commerces |
| `build-places.mjs` | lieux nommés |

Ordre des étapes : surfaces (lecture) → relief → monuments → bâtiments → graphe routier → surfaces par tuile → barrières →
arbres → mobilier → feux → métro → commerces → rangement des bâtiments → lieux → encodage → contrôle → écriture.
Les commerces passent avant le rangement des bâtiments parce qu'ils décident du type `generic` ou `residential` (§ 4.2).

Tout est projeté avec la projection du BRIEF (`x = (lon − 2,321236) × 73 305`, `z = −(lat − 48,865633) × 111 214`) et rangé
dans les **98 tuiles** de 512 m qui recouvrent l'emprise (tx de −6 à 7, tz de −3 à 3). Les données de la marge de 60 m
conservée par les lots A et B autour de l'emprise sont gardées : elles tombent toutes dans ces 98 tuiles.

## 3. Tailles

| Fichier | Octets |
|---|---|
| `manifest.json` | 7 288 |
| `roadgraph.json` | 1 030 178 |
| `places.json` | 138 491 |
| `landmarks.json` | 24 924 |
| `terrain.json` | 112 784 |
| `tiles/` (98 fichiers) | 8 202 952 — de 13 ko (bord ouest) à 158 ko (tuile 2 ; 2 : Odéon, la Monnaie, Saint-André-des-Arts), médiane 82 ko |
| `LICENCE.txt` | 1 183 |
| **Total** | **9 517 800 (9,08 Mo)** |

Lecture sous Node 22 sur la machine de développement, après échauffement : les 98 tuiles en 42 ms de `JSON.parse` et 16 ms
de `decodeTile` (0,6 ms par tuile en moyenne ; la plus lente 4,3 ms) ; le graphe en 5 ms + 20 ms ; le relief en 3 ms.
Aucune mesure n'a été faite sur téléphone.

Le budget est tenu avec une marge de 21 Mo : aucune simplification supplémentaire n'a été nécessaire.

## 4. Choix, couche par couche

### 4.1 Relief (`terrain.json`)

- Source : grille RGE ALTI du lot B, 283 × 151 nœuds au pas de 25 m, de x = −2 975 à 4 075 et de z = −1 700 à 2 050
  (l'emprise et 300 m autour).
- **Le lit du fleuve et des canaux est retiré du relief.** Convention du format (§ 7 de `map-format.md`) : sous l'eau,
  l'altitude n'est pas contractuelle ; le plan d'eau est affiché au niveau que porte la surface `water`, et les murs de quai
  portent la dénivelée. Les 1 641 nœuds d'eau (ceux du polygone de la Seine et des canaux, plus 81 nœuds voisins au niveau
  de l'eau, trouvés de proche en proche) sont donc remplacés par une interpolation des berges (relaxation de Laplace).
  Le sol est continu d'une rive à l'autre ; les berges basses, elles, restent en creux.
- **Lissage** : deux passes d'un filtre binomial 3 × 3 (écart-type d'environ 25 m). Écart moyen au modèle brut sur la terre
  ferme : 0,27 m ; écart maximal : 6,1 m (tranchées ferroviaires, talus).
- **Origine** : l'altitude lissée à l'origine du monde (32,70 m NGF) est retranchée partout : `y = 0` exactement au nœud
  (0 ; 0). Altitudes écrites au pas de 5 cm (`scale` = 0,05).
- Dans l'emprise : de −3,95 m (berges basses) à +35,85 m (nord-est) ; pente maximale entre deux nœuds voisins 18,2 % ;
  400 paires de nœuds sur 66 948 dépassent 8 %.
- `waterLevel` = **−6,1 m** : médiane des altitudes brutes des nœuds du fleuve (26,55 m NGF) moins l'origine.

| Repère | y (m) | Altitude brute (m NGF) |
|---|---|---|
| Concorde (obélisque) | 0,00 | 32,84 |
| Étoile (Arc de Triomphe) | 25,55 | 58,58 |
| Trocadéro (parvis) | 26,49 | 60,35 |
| République | 4,06 | 36,97 |
| Bastille | 4,96 | 37,73 |
| Opéra | 2,97 | 35,87 |
| Champ-de-Mars | 2,51 | 35,28 |
| Hôtel de Ville (parvis) | 1,81 | 34,78 |

### 4.2 Bâtiments

31 194 emprises en entrée, **30 564 en sortie**.

- **Simplification à 0,3 m** (Douglas–Peucker) qui respecte les murs mitoyens : un sommet partagé où le voisinage change
  (début ou fin d'un mur commun à deux bâtiments) est conservé, et la chaîne entre deux tels sommets est simplifiée de la
  même façon des deux côtés. 441 090 sommets avant, 358 144 après. Si la simplification fait se recouper un anneau une
  fois arrondi au décimètre, elle est relâchée pour cet anneau (0,1 m, puis 0,03 m) : 19 cas. 19 emprises de la BD TOPO
  portaient une « épine » (aller-retour sans surface) : elle est retirée.
- **Éclats** : 629 bâtiments de moins de 8 m² retirés ; 526 cours intérieures de moins de 5 m² comblées ; 1 bâtiment hors
  des tuiles.
- **Hauteur.** La BD TOPO donne la hauteur à la gouttière ; le format veut la hauteur totale. `h` = gouttière + hauteur
  du toit, calculée avec la règle du rendu (`roofHeightFor` de `src/world/view/buildings/layout.ts`) : 2,2 à 3,3 m pour
  une mansarde, jusqu'à 4 m pour un toit à deux pans, rien pour un toit plat. Les hauteurs prises dans OpenStreetMap sont
  déjà totales.
- **Hauteur manquante** (1 124 bâtiments) : moins de 30 m² → 3,5 m ; de 30 à 80 m² → le minimum de 6,5 m et de la
  médiane des voisins (939 bâtiments pour ces deux règles d'annexe) ; au-delà → médiane des gouttières des bâtiments de
  plus de 40 m² à moins de 25 m, ou 15 m s'il y en a moins de trois (185 bâtiments).
- **Toit et style**, par heuristique sur la hauteur de gouttière G, la surface A et le type :

| Cas | Style | Toit |
|---|---|---|
| industriel, ou G > 30 m | `modern` | `flat` |
| édifice public, religieux, culturel, monument ou gare, A ≥ 200 m² et G ≥ 8 m | `monumental` | `gabled` (culte, gare), `mansard` si G ≥ 12 m, sinon `flat` |
| G < 4,5 m | `faubourg` | `flat` |
| 4,5 ≤ G < 9 m | `faubourg` | `gabled` si A ≥ 40 m², sinon `flat` |
| 9 ≤ G < 15 m | `faubourg` | `gabled` |
| **15 ≤ G ≤ 30 m (tissu ancien)** | **`haussmann`** | **`mansard`** |

  La forme de toit relevée dans OpenStreetMap (550 bâtiments de la source) l'emporte ; un toit plat relevé sur un immeuble de 15 à 30 m
  le classe `modern`. Résultat : 22 208 `haussmann`, 7 380 `faubourg`, 642 `monumental`, 334 `modern` ; 22 533 mansardes,
  5 688 toits à deux pans, 2 330 toits plats, 13 dômes.
- **Niveaux** : ceux de la source quand ils donnent 2,4 à 4,6 m par niveau (18 581 bâtiments), sinon estimés d'après la
  gouttière et la trame du style (11 983).
- **Base** : altitude minimale du relief sur les sommets de l'emprise (la règle qu'applique le rendu).
- **Type** : `residential` → `generic` si le bâtiment porte au moins un commerce (12 413), sinon `residential` (9 283) ;
  `commercial` → `retail` ; `public` → `government`, `police`, `fire_station` ou `culture` d'après le nom de l'institution
  (ministère, ambassade, mairie, tribunal… ; commissariat, préfecture de police… ; pompiers, centre de secours ; musée,
  théâtre, bibliothèque…), sinon `public` ; `other` (usage inconnu, 3 366 bâtiments) → `generic`. Autres types repris tels quels.
  Décompte publié : generic 15 779, residential 9 283, office 2 173, hotel 895, school 681, public 642, retail 567, religious 214,
  hospital 91, monument 86, government 63, station 34, industrial 25, culture 19, police 7, fire_station 5.
- **Identifiant** : numéro du `cleabs` BD TOPO × 4 (toujours multiple de 4) ; `osmStableId` pour les bâtiments venus
  d'OpenStreetMap seul (404 dans la source ; jamais multiple de 4) : les deux familles ne peuvent pas se confondre.
- **Monuments** : un bâtiment cité dans les `sourceIds` d'un monument porte sa clé (`landmarkKey`) : 121 bâtiments.
- **Tuile** : celle du centre de la boîte englobante ; un bâtiment n'est jamais découpé.

### 4.3 Graphe routier (`roadgraph.json`)

18 354 arêtes en entrée ; **17 242 nœuds et 20 060 arêtes** en sortie.

- **Exclus** : 2 034 pistes cyclables (le format n'a pas de classe pour elles) et **283 voies souterraines, 9 297 m**
  (liste au § 7) : 242 tunnels, 34 passages couverts en sous-sol (`covered` et couche négative), 7 cheminements de niveau
  −2 ou plus bas. Les voies à ciel ouvert en contrebas (berges de la Seine, couche −1 sans tunnel) sont gardées.
  **Les 112 arêtes de pont sont conservées** (`bridge`).
- **Feux et passages piétons** : chaque nœud de feux (1 361) et chaque passage piéton (7 860, dont 3 127 à feux) de la
  couche `signals` coupe l'arête qui le porte et devient un nœud : 1 206 étaient déjà une extrémité, 7 029 un sommet
  intérieur, 71 ont été rattachés à la chaussée la plus proche (moins de 3 m) ; 915 n'ont pas d'arête (ils sont sur une
  piste cyclable ou une voie souterraine exclue). 7 070 coupes.
- **Fusion des nœuds proches** : une arête de moins de 2,5 m est contractée (ses deux nœuds n'en font qu'un, placé sur le
  plus connecté), tant que le groupe ne dépasse pas 5 m : 1 404 fusions. **Fusion d'arêtes** de mêmes attributs de part et
  d'autre d'un nœud de degré 2 sans feu ni passage : 831.
- 810 bouts de cheminements piétons isolés de moins de 25 m (amorces de passages intérieurs, perrons) retirés : 5,0 km.
- **Largeur de chaussée** : la source (13 592 arêtes), sinon voies × 3,2 m (38), sinon valeur par classe (723 : primaire
  12 m, secondaire 9, tertiaire 7, résidentielle 5, zone de rencontre 4, desserte 3,5, rue piétonne 5, allée 2,5).
  Deux garde-fous : la largeur reste entre 2,6 m par voie et 3,5 m par voie + 4,5 m (deux files de stationnement ; + 1 m
  seulement pour un couloir de bus) — 5 895 arêtes ramenées dans cet intervalle, parce que la BD TOPO donne la largeur du
  tronçon entier à chacune des chaussées parallèles d'OpenStreetMap ; et une chaussée plus large que l'espace entre les
  façades est rétrécie (105 arêtes).
- **Trottoirs estimés** : de part et d'autre de l'axe, un rayon est lancé tous les 12 m vers les façades (50 m au plus).
  Trottoir = (distance entre façades − chaussée) / 2 quand les deux côtés se ressemblent, sinon distance à la façade la
  plus proche − demi-chaussée ; plafond 25 m (8 921 arêtes). Si ce résultat dépasse 12 m et que les polygones de
  trottoir du plan de voirie montrent un trottoir nettement plus étroit (avenue bordée de jardins), c'est la largeur
  mesurée dans ces polygones qui est retenue (738). Sans façade : mesure dans les polygones (1 344), sinon valeur par
  classe (995). Ponts : mesure dans les polygones de trottoir, qui franchissent le fleuve avec le tablier (55).
  Rues piétonnes, allées et voies de desserte : 0.
- **Champs-Élysées** : chaussée 18 à 24 m, emprise (chaussée + 2 trottoirs) de 68 m en valeur médiane, 63 m en moyenne
  pondérée sur toute l'avenue (le bas longe des jardins), pour 70 m officiels de façade à façade. Autres recoupements avec
  les largeurs officielles : avenue de la Grande-Armée 68 m (70), boulevard Haussmann 33 m (30 à 33,5), boulevard de
  Sébastopol 30 m (30), boulevard Beaumarchais 36 m (35), boulevard du Temple 37 m (36,5), boulevard Saint-Germain 29 m (30).
- **Classes** : `living` → `residential` (20 km/h), `steps` → `footway`. Voies : sens unique → toutes dans le sens a → b ;
  double sens → moitié-moitié. Vitesse : celle de la source, sinon 30 km/h (6 km/h pour une voie piétonne).
  Revêtement : `sett` (pavés) pour 2 600 arêtes.
- **Noms** : celui de la source. Une voie de desserte ou un cheminement dont le nom ne commence pas par un terme de voie
  (« Accès Parking … », « Dépose minute … ») perd son nom : 69 libellés.
- **Limites de carte** : 297 nœuds de degré 1 situés dans la marge extérieure portent `boundary`.
- **Ponts modélisés** : les arêtes de pont dont le milieu tombe dans l'emprise du pont Alexandre III ou du Pont Neuf
  portent la clé du monument (7 arêtes).

| Classe | Arêtes | km |
|---|---|---|
| `residential` | 7 472 | 222,4 |
| `footway` | 4 428 | 113,3 |
| `service` | 2 307 | 77,8 |
| `primary` | 1 626 | 49,7 |
| `pedestrian` | 1 279 | 44,9 |
| `tertiary` | 1 501 | 42,9 |
| `secondary` | 1 447 | 38,7 |

Nœuds : 3 686 à feux, 6 961 passages piétons. Arêtes à sens unique : 11 004.

**Connexité.** Sur les 14 353 arêtes carrossables (431,7 km), **99,18 %** sont dans la plus grande composante connexe
(99,14 % de la longueur) ; seuil exigé : 97 %. Les 43 autres composantes sont des voies privées ou de desserte : la plus
grande (30 arêtes, 741 m) est le réseau intérieur du cimetière de Passy.
En respectant les sens uniques, depuis la Concorde : 98,85 % des arêtes carrossables hors desserte situées à plus de 300 m
du bord de la carte sont à la fois atteignables et quittables ; les exceptions sont les voies sur berge et trémies coupées
de leurs tunnels (voie Georges-Pompidou, avenue de New-York) et des rues enclavées dans des zones piétonnes. Près des bords,
une rue à sens unique qui sort de la carte ne permet pas d'y revenir : c'est le rôle des nœuds `boundary`.
En comptant les allées piétonnes, le graphe a 255 composantes : les allées des jardins ne sont pas reliées aux rues, parce
que les trottoirs filaires d'OpenStreetMap ne sont pas dans le graphe (les trottoirs sont des surfaces).

### 4.4 Surfaces au sol

25 990 objets en entrée, 26 109 polygones, **30 252 morceaux** après découpage par tuile.

| Nature du format | Origine (lot A) | Morceaux | Surface (m²) |
|---|---|---|---|
| `courtyard` | îlots privés, cours | 2 388 | 12 299 037 |
| `road` | chaussées du plan de voirie | 6 645 | 3 317 786 |
| `sidewalk` | trottoirs | 15 805 | 2 899 169 |
| `median` | terre-pleins, îlots directionnels | 1 101 | 206 509 |
| `park` | parcs | 262 | 1 158 193 |
| `water` | Seine, canal, bassins, fontaines | 191 | 1 024 291 |
| `pedestrian` | surfaces piétonnes, aires mixtes | 1 159 | 841 438 |
| `plaza` | places | 292 | 575 715 |
| `grass` | pelouses | 1 062 | 560 623 |
| `garden` | jardins, massifs, bosquets | 1 080 | 535 209 |
| `sports` | terrains de sport | 76 | 56 762 |
| `parking` | parkings de surface | 171 | 43 680 |
| `construction` | chantiers | 16 | 38 869 |
| `cemetery` | cimetières | 4 | 30 901 |

Les surfaces cumulées par nature sont celles du lot A à moins de 0,1 % près : la simplification et le découpage ne perdent
rien.

- **Simplification** : 0,15 m pour chaussées, trottoirs et terre-pleins ; 0,25 m pour places et surfaces piétonnes ; 0,3 à
  0,4 m pour le reste. 477 669 sommets avant, 278 958 après.
- **Découpage propre par tuile.** `build-clip.mjs` coupe chaque polygone (contour et trous ensemble) par les droites de la
  grille : chaque morceau est un polygone simple avec ses propres trous, sans côtés confondus le long du bord. 22 409
  polygones tiennent dans une tuile ; 3 700 ont été coupés ; le repli Sutherland–Hodgman de `mapdata.ts` n'a servi pour
  aucun. Vérifié sur la sortie : aucun sommet ne déborde de sa tuile, les 509 trous sont dans leur contour.
- **Contours invalides** : 15 épines retirées ; 4 contours de la source qui se recoupent et 3 morceaux où un trou frôlait
  le contour (à quelques centimètres, donc confondus au décimètre) sont défaits en anneaux simples (`simpleRings`).
  Il ne reste aucun anneau qui se recoupe dans la sortie.
- **Ordre de superposition** (ordre du tableau `surfaces`, du dessous vers le dessus) : celui du lot A, à une différence
  près. 0 : îlots (`courtyard`) ; 1 : contours de places entières ; 2 : parcs, jardins, cimetières ; 3 : chantiers, cours ;
  4 : places, surfaces piétonnes ; 5 : chaussées ; 6 : trottoirs et terre-pleins ; 7 : parkings ; 8 : pelouses, massifs,
  terrains de sport ; **9 : toute l'eau**. À rang égal, les grandes surfaces d'abord. **Ce n'est pas
  `MAP_SURFACE_LAYER_ORDER`** (indicatif), qui mettrait les chaussées sous les parcs : une avenue qui traverse un parc
  serait cachée.
- **L'eau est au-dessus de tout** : les chaussées et trottoirs du plan de voirie franchissent la Seine sur les ponts, or le
  format ne veut aucune surface au-dessus de l'eau (le tablier d'un pont vient de son arête). Le fleuve masque ces morceaux.
- **Niveau de l'eau** (`level`) : Seine −6,1 m. Canal, bassin, fontaine : le point le plus bas du sol autour, moins 1,5 m
  (canal) ou 0,2 m (bassin) ; pour un canal, l'altitude brute en son centre si elle est plus basse. Bassin de l'Arsenal
  −3,3 m ; fontaine de Varsovie +4,6 m. Ce sont des estimations.
- **Noms** conservés pour l'eau, les parcs, les jardins publics, les cimetières, les places et les surfaces piétonnes ;
  jamais pour les chantiers, cours, parkings et terrains de sport (on y trouve des noms de programmes immobiliers).

### 4.5 Barrières

3 631 lignes en entrée, simplifiées à 0,2 m, découpées par tuile (`clipPolylineToRect`) : **3 965 morceaux**.

| Nature | Morceaux | km | Hauteur quand la source ne la donne pas |
|---|---|---|---|
| `wall` | 1 331 | 38,3 | 2,4 m (soutènement 2,0 ; enceinte 6,0 ; séparateur en béton 0,8) |
| `fence` (grille, clôture) | 1 268 | 38,4 | 1,8 m |
| `quay_wall` | 356 | 41,0 | calculée : voir ci-dessous |
| `railing` (garde-corps) | 692 | 12,8 | 1,1 m |
| `hedge` | 318 | 9,4 | 1,2 m |

La source donne la hauteur de 241 lignes. **Mur de quai** : dénivelée médiane du modèle de terrain brut à 15 m de part et
d'autre du mur, majorée de 30 % (le pas de 25 m écrase les marches), bornée de 1,5 à 11 m ; médiane 5,6 m sur 243 lignes.
C'est une estimation.

### 4.6 Arbres, mobilier, feux, métro

- **Arbres** : 38 109. Hauteur de la source, bornée de 2 à 45 m ; absente pour 3 688 arbres, alors déduite du houppier
  estimé par le lot B, sinon 10 m. Rayon de couronne = demi-houppier, borné de 0,8 à 8 m.
- **Mobilier** : 18 204 objets en entrée, **24 183 en sortie**.

| Nature du format | Origine | Nombre |
|---|---|---|
| `candelabre` | `lamp` : 9 318 relevés + **5 979 ajoutés** | 15 297 |
| `banc` | `bench` | 3 723 |
| `poubelle` | `bin` | 1 346 |
| `potelet` | `bollard` | 1 062 |
| `abribus` | `bus_shelter` | 487 |
| `statue` | `statue` | 472 |
| `autre` | `fountain` (fontaines à boire hors Wallace, fontaines ornementales) | 401 |
| `station_velo` | `velib` | 302 |
| `panneau_pub` | `advert_panel` | 298 |
| `mat_drapeau` | `flagpole` | 253 |
| `kiosque` | `newsstand` (181) et `kiosk` (29) | 210 |
| `sanisette` | `toilet` | 174 |
| `colonne_morris` | `morris_column` | 124 |
| `fontaine_wallace` | `wallace_fountain` | 34 |

  **Cap** : 13 081 viennent de la couche normalisée (79 relevés ; 13 002 déjà calculés par le lot B vers la chaussée la plus
  proche), azimut converti par `h = π − azimut` ; les 4 977 objets sans cap sont tournés vers l'axe de la voie la plus
  proche (rue d'abord, allée à défaut, 40 m au plus) ; 146 objets sans voie proche gardent 0.
  **Candélabres ajoutés** : la source (OpenStreetMap seul) en relève de 212 à 603 par km² selon les quartiers. Le long de
  chaque voie carrossable hors desserte et hors pont, un candélabre est ajouté tous les 28 m environ, en quinconce, à
  0,6 m derrière la bordure réelle (premier point du polygone de trottoir en s'éloignant de l'axe), s'il n'y en a aucun à
  moins de 20 m et que le point n'est pas dans un bâtiment. Ces 5 979 objets sont **synthétiques**.
- **Feux** : les 6 701 supports de la Ville. Chacun désigne le nœud à feux le plus proche à moins de 45 m (6 554 ; les 147
  autres ont `node = −1`). Cap de la face lumineuse : le long de la chaussée la plus proche (30 m au plus), à contresens
  de la circulation si elle est à sens unique, dos au carrefour sinon ; 10 supports sans chaussée proche gardent 0.
  C'est une estimation : la source n'oriente pas les supports.
- **Métro** : 442 bouches, avec le nom de la station et ses lignes séparées par « ; » (`1;8;12`, `RER A`). Cap de sortie
  estimé : le long de la rue la plus proche, en s'éloignant de la station ; 4 bouches sans rue proche gardent 0.

### 4.7 Commerces

31 018 locaux en entrée, **26 476 en sortie**.

- 3 433 locaux vacants ou en travaux ne sont pas publiés (ce ne sont pas des commerces).
- 209 locaux situés dans un bâtiment remplacé par un monument ne sont pas publiés non plus, et aucune façade de monument
  ne reçoit de vitrine : ces édifices sont modélisés à la main (galerie marchande sous le Louvre, boutiques de la gare
  Saint-Lazare, arcades du Palais-Royal).
- **Rattachement** : le point du local (posé par la source 1 m derrière la façade, valeur médiane) est rattaché au côté
  d'anneau extérieur le plus proche à moins de 15 m. Chaque côté est classé : **mitoyen** (un autre bâtiment à 0,6 m
  devant : jamais retenu), **sur cour** (à 2,5 m devant, on est dans un îlot privé ou un bâtiment) ou **sur rue**. Une
  façade sur cour ne l'emporte que si elle est plus proche de 3 m ; le bâtiment voisin, de 1,5 m. 248 locaux sans
  façade à moins de 15 m sont écartés ; 613 commerces sont sur une façade sur cour.
- **Répartition** : sur un même côté, les vitrines sont rangées dans l'ordre de leur position, sans chevauchement, à
  0,3 m des extrémités et 0,25 m les unes des autres. Capacité d'un côté : une vitrine par 2,45 m. Les locaux en trop
  (galeries marchandes : jusqu'à 151 locaux au même point) cherchent un autre côté libre du même bâtiment (331 déplacés) ;
  sinon ils sont écartés (652), les locaux de galerie d'abord.
- **Largeur de vitrine** : 3,8 à 7,2 m pour un local de moins de 300 m², 9 à 13 m jusqu'à 1 000 m², 16 à 26 m au-delà
  (variation stable tirée de l'identifiant) ; au moins 8 m pour un supermarché, 6 m pour une banque ; réduite quand le côté
  est plein, jamais sous 2,2 m (5 984 vitrines réduites). Médiane 5,2 m.
- **Position et cap** : milieu de la vitrine sur le côté de façade ; cap = normale sortante (`outwardHeading`). Vérifié
  sur la sortie : tous les commerces sont à moins de 0,3 m du contour de leur bâtiment.
- **Catégorie de jeu**, d'après la famille et le libellé d'activité de la source, jamais d'après l'enseigne :

| Catégorie | Nombre | Règle |
|---|---|---|
| `autre` | 11 426 | beauté, maison, services, bureaux en boutique, commerce de gros, santé, culture et loisirs… |
| `cafe_restaurant` | 4 620 | restaurants, brasseries, cafés, bars, salons de thé |
| `mode` | 2 692 | prêt-à-porter, chaussures, maroquinerie, grands magasins |
| `alimentation` | 1 800 | commerces de bouche, boulangeries, alimentation générale |
| `restauration_rapide` | 1 719 | restauration rapide |
| `agence` | 938 | agences immobilières, assurances, voyages, intérim, bureaux de poste |
| `hotel` | 896 | hôtels |
| `bijouterie` | 737 | bijouterie, horlogerie, joaillerie |
| `banque` | 450 | banques, bureaux de change, achat d'or |
| `luxe` | 289 | « Haute couture - Créateurs », et mode, chaussures, maroquinerie ou parfumerie donnant sur une voie du luxe |
| `supermarche` | 287 | supermarchés et supérettes |
| `pharmacie` | 282 | pharmacies, parapharmacies |
| `telephonie` | 173 | téléphonie |
| `tabac_presse` | 167 | tabacs, cafés-tabacs, marchands de journaux |

  Voies du luxe (des noms de rues, pas d'enseignes) : avenue Montaigne, rue du Faubourg Saint-Honoré, place Vendôme, rue
  de la Paix, avenue George V, rue François 1er, rue Cambon, rue Royale, rue de Castiglione, et la rue Saint-Honoré à
  l'ouest du Palais-Royal.
- **Identifiant** : hachage (30 bits) de la position, de l'activité et de l'enseigne ; seul le hachage est écrit.
- 14 661 bâtiments portent au moins un commerce.

### 4.8 Lieux nommés (`places.json`)

3 278 toponymes en entrée, **3 023 en sortie** : 1 580 voies, 45 quais, 33 ponts, 279 places, 230 jardins, 68 quartiers,
359 monuments, 339 institutions, 90 stations.

- **Voies, quais, ponts** : un lieu par nom (140 doublons fusionnés : les Champs-Élysées ne font qu'un lieu). Son point est
  pris sur les arêtes du graphe qui portent ce nom, au plus près de leur barycentre ; son rayon couvre leur étendue.
  99 noms sans arête dans le graphe ne sont pas publiés (tunnels, pistes cyclables, accès de parkings, variantes
  d'orthographe portées par une seule piste cyclable).
- **Places, jardins** : rayon tiré de la surface nommée correspondante quand elle existe. Quartiers : 350 ou 700 m.
- **Stations** : les 90 stations du référentiel d'Île-de-France Mobilités, avec leurs lignes dans `ref` (`3;5;8;9;11`).
- **Importance** : rang 1 du lot A → 2, rang 2 → 1, rang 3 → 0 ; 108 lieux majeurs reçoivent 3 d'après une liste tenue dans
  `build-places.mjs` (grandes places, avenues, ponts, monuments, institutions) ; station à 5 lignes ou plus → 3.

### 4.9 Monuments (`landmarks.json`)

43 entrées. Clés : celles du lot B, qui sont aussi les clés canoniques de `src/world/monuments` (`arc_triomphe`,
`palais_bourbon`), et non celles de `SUGGESTED_LANDMARK_KEYS` (`arc_de_triomphe`, `assemblee_nationale`).

- **Clé unique par entrée.** Les trois monuments en plusieurs morceaux donnent chacun deux entrées :

| Monument | Première entrée | Seconde entrée |
|---|---|---|
| Fontaines de la Concorde | `fontaines_concorde` : fontaine des Fleuves (nord) | `fontaine_des_mers` : fontaine des Mers (sud) |
| Palais de Chaillot | `palais_chaillot` : aile de Paris (est) | `palais_chaillot_passy` : aile de Passy (ouest) |
| Pont Neuf | `pont_neuf` : grand bras | `pont_neuf_petit_bras` : petit bras |

  `fontaine_des_mers` est un alias que `src/world/monuments/keys.ts` ramène déjà à `fontaines_concorde` : les deux
  fontaines utilisent le même modèle. `palais_chaillot_passy` et `pont_neuf_petit_bras` n'ont pas d'alias.
- **Emprise** : contour extérieur simplifié à 0,3 m. **Ancrage** : centre du rectangle englobant d'aire minimale.
  **Altitude** : relief à l'ancrage.
- **Cap** : azimut approximatif de la façade principale, pris dans `docs/research/04-paris-lieux-monuments.md` (§ 3.0)
  pour 29 entrées (les deux fontaines, rondes, reprennent l'axe de la place), **estimé de mémoire pour 14** (colonnes
  Vendôme et de Juillet, tour Saint-Jacques, Bourse de commerce, Élysée, Saint-Eustache, Saint-Sulpice, les deux bras du
  Pont Neuf, Institut, Orsay, Saint-Lazare, Préfecture, Matignon) ; puis calé sur le côté du rectangle englobant le plus
  proche, si l'emprise est massive (elle remplit 60 % de son rectangle) et qu'un côté est à moins de 25° (28 entrées
  calées). Le rapport (`landmarks`) donne l'azimut de départ et l'azimut retenu de chaque monument.
- **Hauteur** : celle du lot B. Le Pont Neuf n'en avait pas : hauteur du sol au-dessus de l'eau + 1,1 m de parapet
  (6,5 m et 5,1 m).
- **Nom neutre** : l'aile ouest des palais de Gabriel porte dans la source le nom du palace qui l'occupe. Elle est publiée
  sous le nom « Hôtel de la place de la Concorde (palais de Gabriel, aile ouest) » ; sa clé reste `hotel_crillon`.

### 4.10 Manifeste, attribution, licence

`manifest.json` porte l'emprise, l'origine, la projection, les 98 tuiles avec leur taille, `waterLevel` et six mentions :

| Source | Licence | Mention |
|---|---|---|
| OpenStreetMap | ODbL 1.0 | © les contributeurs d'OpenStreetMap |
| IGN | Licence Ouverte 2.0 (Etalab) | IGN — RGE ALTI® et BD TOPO®, données extraites en novembre 2026 |
| Ville de Paris | ODbL | Ville de Paris — Paris Data (opendata.paris.fr), licence ODbL |
| Apur | ODbL 1.0 | Apur — BDCOM 2023, licence ODbL |
| Île-de-France Mobilités | Licence Ouverte 2.0 (Etalab) | Île-de-France Mobilités — référentiels des arrêts et des gares, Licence Ouverte 2.0 |
| Carte du jeu (base dérivée) | ODbL 1.0 | Données de carte du jeu : base dérivée des sources ci-dessus, mise à disposition sous licence ODbL 1.0 |

`attributionText(manifest)` donne ces six lignes pour l'écran des crédits. `LICENCE.txt`, dans le même dossier, place la
base dérivée sous ODbL 1.0 (partage à l'identique exigé par OpenStreetMap, la Ville de Paris et l'Apur).

### 4.11 Règle « aucune enseigne »

- Le format n'a aucune colonne pour le nom d'un commerce : seuls l'identifiant, la position, le cap, la largeur, la
  catégorie et le bâtiment sont écrits.
- Un nom de bâtiment, de monument ou d'institution identique à celui d'un commerce de la source (20 705 noms) est écarté,
  sauf s'il commence par un terme d'édifice public (église, musée, ministère…) ou figure dans une courte liste d'homonymes
  relus (une statue de Jeanne d'Arc n'est pas le café du même nom). Écartés : 1 nom de bâtiment et 12 toponymes.
- Une liste de marques déposées repérées à la lecture (maisons de couture et de parfum, grands magasins, cabaret,
  transporteurs) est retirée de tous les noms : bâtiments, lieux, voies, surfaces.
- **Second contrôle sur les fichiers encodés** (`brandAudit` dans `build.mjs`) : aucune des 3 226 chaînes publiées ne
  contient une de ces marques ; aucun nom de bâtiment (282 noms distincts), de monument ou d'institution n'est un nom de
  commerce ; aucune couche de commerces ne porte de colonne inattendue. 61 toponymes publics ont un commerce homonyme
  (stations « Bastille », « Concorde », « Odéon »…) : ils sont comptés, pas retirés.
- Limite : ce filtre ne connaît que les enseignes du relevé commercial et la liste de marques. Des établissements privés
  classés « institution » par le lot A (écoles privées, instituts) gardent leur nom.

## 5. Contrôles exécutés

Par `build.mjs`, à chaque construction (échec = code de sortie 1) :

1. `validateRawTile` sur les 98 tuiles encodées : 0 erreur.
2. `validateMapData` sur la carte relue depuis le texte JSON et décodée : **0 erreur, 1 avertissement** (« le graphe
   comporte 255 composantes connexes », voir § 4.3). 0 élément écarté par l'encodeur.
3. Connexité des voies carrossables : 99,18 %.
4. Contrôle des enseignes : 0 nom fautif.
5. Budget : 104 fichiers, 9,08 Mo.

Par `tests/unit/mapdata.real.test.ts` (23 tests, `npx vitest run tests/unit/mapdata` : 85 tests passent avec ceux du format) :
manifeste, attribution et budget ; `validateRawTile` et `validateTile` sur chaque tuile ; ré-encodage de chaque tuile et du
graphe identique au fichier ; aucune tuile intérieure vide ; ordres de grandeur ; chaque feu désigne un nœud à feux proche ;
chaque commerce est sur la façade de son bâtiment ; aucune voie souterraine, 20 ponts nommés au moins ; composante
principale ≥ 97 % ; Champs-Élysées entre 60 et 76 m d'emprise ; relief nul à l'origine, Étoile, Trocadéro et République aux
bonnes altitudes ; lieux sans doublon ; monuments ; puis quatre repères : **Concorde** (obélisque à moins de 25 m de
l'origine, fontaines à 64 m au nord et au sud, chaussées pavées, rue Royale, rue de Rivoli, pont, palais de Gabriel,
bouches de métro), **Étoile** (Arc, anneau à sens unique, les douze avenues, immeubles), **République** (statue, sept
voies, plus de 150 immeubles et de 100 commerces dans un rayon de 350 m, bouches de métro) et **Pont Neuf** (surface
`water` « La Seine » au niveau du fleuve sous chacun des deux bras, arête de pont portant la clé du monument, aucun bâtiment).

Autres vérifications faites une fois, à la main :

- Les tests des autres modules qui lisent la carte passent sur ces tuiles (`npx vitest run tests/unit/world` : 14 fichiers,
  148 tests), dont la génération des immeubles de toutes les tuiles dans son budget de triangles.
- Rendus PNG de la sortie décodée (outil jetable, hors dépôt), regardés : emprise entière, Concorde, Étoile, Champs-Élysées,
  République, Pont Neuf, pont Alexandre III, Louvre et Palais-Royal, Marais, Les Halles, un quartier de l'ouest.
- Déterminisme : deux constructions de suite, sommes md5 identiques.

## 6. Chiffres par tuile

Colonnes : indices de tuile (tx ; tz), taille du fichier en ko, bâtiments, surfaces, barrières, arbres, objets de mobilier,
supports de feux, bouches de métro, commerces, arêtes du graphe référencées. La tuile (0 ; 0) a son coin nord-ouest à
l'obélisque de la Concorde ; tx croît vers l'est, tz vers le sud.

| tx ; tz | ko | Bât. | Surf. | Barr. | Arbres | Mob. | Feux | Métro | Comm. | Arêtes |
|---|---|---|---|---|---|---|---|---|---|---|
| -6 ; -3 | 23 | 99 | 76 | 1 | 75 | 44 | 17 | 5 | 51 | 61 |
| -5 ; -3 | 81 | 373 | 256 | 1 | 234 | 107 | 39 | 2 | 293 | 187 |
| -4 ; -3 | 88 | 395 | 264 | 23 | 383 | 139 | 98 | 7 | 312 | 223 |
| -3 ; -3 | 61 | 281 | 210 | 37 | 241 | 136 | 41 | 0 | 122 | 229 |
| -2 ; -3 | 62 | 254 | 292 | 53 | 259 | 184 | 52 | 0 | 86 | 169 |
| -1 ; -3 | 76 | 301 | 290 | 13 | 288 | 222 | 87 | 0 | 218 | 215 |
| 0 ; -3 | 61 | 261 | 205 | 12 | 51 | 160 | 99 | 31 | 275 | 168 |
| 1 ; -3 | 62 | 267 | 194 | 20 | 107 | 141 | 45 | 8 | 221 | 144 |
| 2 ; -3 | 100 | 372 | 400 | 12 | 143 | 172 | 135 | 6 | 492 | 234 |
| 3 ; -3 | 97 | 405 | 336 | 6 | 118 | 204 | 88 | 2 | 501 | 196 |
| 4 ; -3 | 90 | 349 | 285 | 50 | 361 | 150 | 93 | 2 | 382 | 241 |
| 5 ; -3 | 67 | 179 | 236 | 110 | 423 | 283 | 71 | 28 | 174 | 306 |
| 6 ; -3 | 76 | 226 | 320 | 152 | 507 | 339 | 40 | 0 | 118 | 265 |
| 7 ; -3 | 35 | 115 | 116 | 39 | 298 | 148 | 45 | 1 | 88 | 130 |
| -6 ; -2 | 28 | 76 | 144 | 11 | 175 | 52 | 42 | 0 | 30 | 77 |
| -5 ; -2 | 82 | 305 | 291 | 46 | 508 | 160 | 47 | 2 | 177 | 188 |
| -4 ; -2 | 90 | 245 | 387 | 51 | 674 | 707 | 150 | 8 | 118 | 339 |
| -3 ; -2 | 85 | 328 | 291 | 18 | 341 | 290 | 84 | 3 | 303 | 263 |
| -2 ; -2 | 90 | 434 | 250 | 9 | 100 | 148 | 67 | 3 | 409 | 169 |
| -1 ; -2 | 91 | 451 | 315 | 9 | 165 | 163 | 68 | 5 | 331 | 204 |
| 0 ; -2 | 108 | 428 | 461 | 6 | 265 | 258 | 156 | 13 | 536 | 272 |
| 1 ; -2 | 81 | 252 | 332 | 22 | 162 | 201 | 133 | 26 | 355 | 276 |
| 2 ; -2 | 97 | 345 | 451 | 10 | 193 | 197 | 158 | 8 | 417 | 289 |
| 3 ; -2 | 101 | 461 | 347 | 15 | 163 | 175 | 91 | 12 | 556 | 200 |
| 4 ; -2 | 103 | 480 | 234 | 11 | 196 | 144 | 46 | 3 | 597 | 171 |
| 5 ; -2 | 120 | 450 | 415 | 73 | 356 | 211 | 98 | 4 | 613 | 293 |
| 6 ; -2 | 82 | 314 | 300 | 101 | 343 | 229 | 59 | 0 | 258 | 272 |
| 7 ; -2 | 53 | 212 | 206 | 45 | 119 | 94 | 34 | 1 | 276 | 109 |
| -6 ; -1 | 30 | 121 | 75 | 8 | 203 | 68 | 24 | 2 | 103 | 61 |
| -5 ; -1 | 88 | 474 | 278 | 24 | 181 | 150 | 56 | 1 | 193 | 207 |
| -4 ; -1 | 88 | 403 | 333 | 11 | 326 | 195 | 70 | 0 | 173 | 251 |
| -3 ; -1 | 84 | 349 | 327 | 24 | 277 | 164 | 50 | 3 | 268 | 255 |
| -2 ; -1 | 102 | 178 | 383 | 72 | 1187 | 525 | 79 | 6 | 90 | 366 |
| -1 ; -1 | 85 | 117 | 254 | 42 | 1570 | 377 | 42 | 0 | 58 | 236 |
| 0 ; -1 | 82 | 295 | 277 | 33 | 265 | 223 | 104 | 9 | 345 | 230 |
| 1 ; -1 | 102 | 403 | 405 | 22 | 105 | 274 | 136 | 2 | 510 | 314 |
| 2 ; -1 | 116 | 511 | 562 | 21 | 116 | 237 | 71 | 3 | 501 | 338 |
| 3 ; -1 | 142 | 760 | 503 | 3 | 83 | 182 | 51 | 2 | 704 | 262 |
| 4 ; -1 | 155 | 731 | 611 | 41 | 312 | 273 | 147 | 16 | 745 | 387 |
| 5 ; -1 | 123 | 567 | 333 | 44 | 395 | 206 | 91 | 5 | 656 | 200 |
| 6 ; -1 | 99 | 363 | 360 | 39 | 529 | 276 | 131 | 10 | 405 | 235 |
| 7 ; -1 | 57 | 221 | 217 | 21 | 227 | 101 | 62 | 4 | 245 | 110 |
| -6 ; 0 | 31 | 100 | 105 | 19 | 421 | 57 | 8 | 0 | 39 | 127 |
| -5 ; 0 | 88 | 219 | 298 | 90 | 1095 | 336 | 84 | 6 | 128 | 443 |
| -4 ; 0 | 56 | 121 | 269 | 56 | 681 | 247 | 56 | 3 | 31 | 354 |
| -3 ; 0 | 69 | 151 | 309 | 58 | 839 | 241 | 106 | 8 | 42 | 341 |
| -2 ; 0 | 67 | 82 | 387 | 61 | 896 | 243 | 120 | 2 | 17 | 279 |
| -1 ; 0 | 61 | 53 | 295 | 59 | 887 | 359 | 65 | 5 | 10 | 258 |
| 0 ; 0 | 47 | 25 | 119 | 72 | 1206 | 477 | 20 | 1 | 9 | 239 |
| 1 ; 0 | 91 | 231 | 346 | 179 | 459 | 394 | 84 | 6 | 265 | 385 |
| 2 ; 0 | 102 | 336 | 438 | 26 | 347 | 418 | 88 | 9 | 339 | 334 |
| 3 ; 0 | 156 | 563 | 642 | 31 | 663 | 631 | 38 | 17 | 624 | 339 |
| 4 ; 0 | 157 | 754 | 493 | 45 | 361 | 309 | 115 | 6 | 769 | 378 |
| 5 ; 0 | 147 | 704 | 505 | 64 | 310 | 323 | 63 | 2 | 658 | 314 |
| 6 ; 0 | 137 | 588 | 521 | 20 | 385 | 324 | 126 | 8 | 673 | 288 |
| 7 ; 0 | 58 | 213 | 228 | 9 | 320 | 94 | 75 | 1 | 258 | 126 |
| -6 ; 1 | 36 | 151 | 150 | 10 | 70 | 52 | 22 | 2 | 65 | 95 |
| -5 ; 1 | 56 | 89 | 234 | 55 | 858 | 194 | 57 | 3 | 14 | 307 |
| -4 ; 1 | 71 | 173 | 243 | 41 | 1058 | 338 | 37 | 0 | 66 | 324 |
| -3 ; 1 | 113 | 656 | 207 | 12 | 388 | 98 | 75 | 0 | 478 | 280 |
| -2 ; 1 | 91 | 384 | 264 | 31 | 1106 | 192 | 63 | 2 | 204 | 167 |
| -1 ; 1 | 74 | 296 | 272 | 73 | 390 | 335 | 47 | 3 | 90 | 169 |
| 0 ; 1 | 79 | 335 | 276 | 83 | 141 | 294 | 96 | 10 | 192 | 244 |
| 1 ; 1 | 82 | 310 | 289 | 102 | 180 | 300 | 119 | 0 | 262 | 237 |
| 2 ; 1 | 70 | 114 | 302 | 73 | 278 | 494 | 41 | 3 | 93 | 224 |
| 3 ; 1 | 116 | 364 | 616 | 43 | 516 | 466 | 115 | 14 | 389 | 363 |
| 4 ; 1 | 141 | 528 | 557 | 77 | 332 | 613 | 84 | 10 | 589 | 327 |
| 5 ; 1 | 134 | 566 | 501 | 100 | 290 | 483 | 40 | 0 | 518 | 366 |
| 6 ; 1 | 118 | 551 | 469 | 51 | 271 | 379 | 48 | 2 | 492 | 277 |
| 7 ; 1 | 48 | 136 | 255 | 21 | 366 | 115 | 26 | 3 | 136 | 127 |
| -6 ; 2 | 13 | 11 | 96 | 15 | 193 | 30 | 14 | 0 | 2 | 70 |
| -5 ; 2 | 56 | 178 | 265 | 41 | 380 | 154 | 54 | 8 | 67 | 188 |
| -4 ; 2 | 89 | 230 | 374 | 35 | 1309 | 353 | 43 | 0 | 106 | 314 |
| -3 ; 2 | 74 | 286 | 182 | 37 | 943 | 238 | 56 | 3 | 160 | 274 |
| -2 ; 2 | 73 | 245 | 268 | 34 | 837 | 139 | 48 | 0 | 110 | 224 |
| -1 ; 2 | 62 | 283 | 230 | 63 | 255 | 191 | 53 | 0 | 59 | 237 |
| 0 ; 2 | 97 | 441 | 300 | 38 | 205 | 271 | 86 | 2 | 325 | 202 |
| 1 ; 2 | 133 | 611 | 398 | 38 | 194 | 390 | 98 | 2 | 606 | 240 |
| 2 ; 2 | 158 | 757 | 551 | 33 | 205 | 402 | 49 | 6 | 745 | 344 |
| 3 ; 2 | 115 | 343 | 483 | 100 | 413 | 513 | 86 | 14 | 292 | 367 |
| 4 ; 2 | 99 | 291 | 508 | 106 | 597 | 490 | 69 | 0 | 173 | 308 |
| 5 ; 2 | 141 | 538 | 687 | 84 | 459 | 556 | 114 | 6 | 465 | 474 |
| 6 ; 2 | 132 | 536 | 448 | 53 | 633 | 618 | 146 | 8 | 497 | 365 |
| 7 ; 2 | 50 | 233 | 127 | 5 | 73 | 123 | 26 | 2 | 304 | 135 |
| -6 ; 3 | 14 | 10 | 89 | 2 | 146 | 31 | 8 | 0 | 11 | 91 |
| -5 ; 3 | 54 | 238 | 227 | 8 | 198 | 90 | 61 | 2 | 146 | 165 |
| -4 ; 3 | 63 | 258 | 323 | 3 | 271 | 102 | 16 | 1 | 206 | 155 |
| -3 ; 3 | 33 | 75 | 130 | 20 | 338 | 218 | 16 | 0 | 31 | 149 |
| -2 ; 3 | 48 | 151 | 159 | 16 | 523 | 115 | 85 | 0 | 56 | 171 |
| -1 ; 3 | 43 | 213 | 160 | 41 | 185 | 105 | 26 | 1 | 65 | 107 |
| 0 ; 3 | 46 | 172 | 191 | 30 | 145 | 185 | 51 | 4 | 141 | 141 |
| 1 ; 3 | 65 | 322 | 209 | 16 | 140 | 202 | 43 | 3 | 214 | 180 |
| 2 ; 3 | 62 | 277 | 270 | 23 | 43 | 210 | 26 | 1 | 286 | 162 |
| 3 ; 3 | 87 | 304 | 450 | 61 | 250 | 327 | 62 | 7 | 310 | 240 |
| 4 ; 3 | 61 | 260 | 261 | 57 | 268 | 205 | 61 | 0 | 178 | 201 |
| 5 ; 3 | 50 | 167 | 209 | 52 | 348 | 211 | 54 | 3 | 47 | 157 |
| 6 ; 3 | 37 | 111 | 203 | 24 | 364 | 160 | 31 | 0 | 68 | 142 |
| 7 ; 3 | 17 | 79 | 42 | 8 | 56 | 39 | 4 | 0 | 51 | 51 |

Totaux : 8 202 952 octets, 30 564 bâtiments, 30 252 surfaces, 3 965 barrières, 38 109 arbres, 24 183 objets, 6 701 feux,
442 bouches, 26 476 commerces, 22 908 références d'arêtes. Minimum, médiane et maximum par tuile : bâtiments 10 / 291 / 760 ;
surfaces 42 / 290 / 687 ; arbres 43 / 310 / 1 570 ; mobilier 30 / 210 / 707 ; commerces 2 / 221 / 769 ; arêtes 51 / 236 / 474.
Les tuiles des colonnes −6 et 7 et des lignes −3 et 3 ne sont que partiellement dans l'emprise (bandes de 100 à 350 m).

## 7. Voies souterraines exclues du graphe

283 arêtes, 9 297 m. Voies nommées (les autres, sans nom : 187 cheminements piétons pour 2 782 m — couloirs et passages
souterrains —, 21 voies de desserte pour 645 m, 14 escaliers, 1 voie primaire de 154 m, 1 résidentielle, 1 piétonne) :

| Nom | Classe source | Arêtes | Longueur (m) |
|---|---|---|---|
| Souterrain Grande Boucle (Voie BCL) | residential | 8 | 889 |
| Tunnel des Tuileries | service | 1 | 859 |
| Voie Georges-Pompidou | primary | 5 | 654 |
| Souterrain Sortie Hôtel de Ville (Voie S2) | residential | 2 | 528 |
| Avenue de New York | primary | 2 | 281 |
| Rue Paul et Jean Lerolle | service | 2 | 264 |
| Parking Saint-Lazare | service | 2 | 244 |
| Promenade René Capitant | footway | 2 | 226 |
| Aire Livraison Nord | residential | 2 | 204 |
| Passage du Souvenir | footway | 3 | 188 |
| Avenue du Général Lemonnier | secondary | 2 | 170 |
| Voie de Desserte PC Voiries | service | 1 | 156 |
| Parc Rives de Seine - Georges Pompidou | service | 5 | 114 |
| Passage des Jacobins | pedestrian | 2 | 92 |
| Accès Turbigo (Voie A1) | residential | 2 | 84 |
| Sortie Turbigo (Voie S1) | residential | 1 | 83 |
| Entrée Rue des Halles (Voie A2) | residential | 2 | 81 |
| Quai Jacques Chirac | primary | 1 | 80 |
| Quai Jacques Chirac | footway | 1 | 80 |
| Souterrain de la Petite Boucle (Voie Z) | residential | 1 | 60 |
| Cité de Crussol | service | 1 | 43 |
| Accès Parking Saint-Germain l'Auxerrois | service | 1 | 41 |
| Passage Caumartin | footway | 2 | 32 |
| Rue Bruno Coquatrix | pedestrian | 1 | 19 |
| Place Marguerite de Navarre | residential | 1 | 19 |
| Passage Capucine | footway | 1 | 18 |
| Cour des Fermes | footway | 1 | 11 |
| Passage de la Ferme Saint-Lazare | footway | 1 | 10 |
| Rue Bailleul | service | 1 | 5 |
| Cité Berryer | pedestrian | 1 | 2 |

La liste complète, arête par arête, est dans `report.json` (`roads.underground`). Seule la partie souterraine d'une voie
est retirée : la voie Georges-Pompidou et l'avenue de New-York gardent leurs tronçons à ciel ouvert.

## 8. Ce que le moteur doit savoir

- **Ordre des surfaces** : l'ordre du tableau est l'ordre de superposition, et l'eau vient en dernier (§ 4.4). Un pont n'a
  pas de surface : son tablier se construit à partir de son arête (largeur = chaussée + 2 trottoirs) entre les altitudes
  du sol à ses deux extrémités.
- **Eau** : le relief ne descend pas dans le lit du fleuve. Le plan d'eau s'affiche à `level` (−6,1 m pour la Seine), sous
  le sol voisin ; il faut donc ouvrir le sol le long des polygones `water` et fermer la dénivelée par un mur. Les
  barrières `quay_wall` ne suivent pas partout le bord de l'eau (ce sont les murs de soutènement relevés par les sources).
- **Monuments** : un bâtiment qui porte `landmarkKey` doit rester rendu de façon générique tant qu'aucun modèle n'existe
  pour sa clé (c'est ce que fait `skipLandmark`). Deux entrées par monument pour les trois cas du § 4.9.
- **Commerces** : `buildingId` peut désigner un bâtiment d'une tuile voisine.
- **Graphe** : `width` est une largeur nominale par tronçon ; le dessin exact de la chaussée est dans les surfaces `road`.
  Les allées de jardin forment des îlots non reliés aux rues.

## 9. Limites connues

1. **Relief** : pas de 25 m, lissé. Les trois paliers de la Seine (eau, berge basse, quai haut) ne sont pas rendus par des
   marches : la berge basse est un creux doux de 4 m au plus. Les tranchées ferroviaires de Saint-Lazare sont adoucies.
2. **Niveaux d'eau des canaux et bassins, hauteur des murs de quai** : estimés (§ 4.4, § 4.5).
3. **Style et toit des bâtiments** : heuristique. Tout immeuble ordinaire de 15 à 30 m est haussmannien à mansarde, y
   compris ceux du Marais ou du Quartier latin qui sont plus anciens, et les immeubles modernes de cette hauteur dont
   OpenStreetMap n'a pas relevé le toit plat. Aucune date de construction n'est utilisée.
4. **Largeurs** : la chaussée d'une arête est celle de la source, par tronçon, avec des valeurs de classe (3, 4, 5, 7, 9,
   12 m…) ; 5 895 ont été ramenées à leurs voies. Le trottoir est une estimation ; 1 518 arêtes (18 km) atteignent le
   plafond de 25 m, surtout de courtes arêtes de carrefour sur les grandes places.
5. **Candélabres** : 39 % sont synthétiques. Potelets très partiels (1 062), aucun téléphone public, aucune bouche
   d'incendie : les sources n'en ont pas.
6. **Fontaines** : classées `autre`, faute de nature dédiée dans le format.
7. **Caps estimés** : feux, bouches de métro, mobilier sans cap relevé ; 14 caps de monuments saisis de mémoire.
8. **Commerces** : relevé de 2023 ; 1 109 locaux écartés (209 dans un monument, 248 sans façade proche, 652 sans place sur
   la façade) ; la largeur
   de vitrine vient de la classe de surface, pas d'une mesure ; la catégorie `luxe` repose en partie sur une liste de rues.
9. **Hauteurs des monuments** : 19 valeurs du lot B saisies de mémoire (`heightSource: reference`), non vérifiées ici.
10. **Passages sous immeuble** : les 580 arêtes couvertes au niveau du sol sont dans le graphe sans marque particulière
    (le format n'a pas de drapeau pour elles).
11. **Pistes cyclables** : absentes du graphe ; restrictions de tourne-à-gauche, sens de circulation des bus : absents.
12. **Bords de carte** : en respectant les sens uniques, environ 10 % des nœuds carrossables ne sont pas à la fois
    atteignables et quittables depuis la Concorde, presque tous à moins de 300 m du bord ou sur une voie coupée de son tunnel.
13. **Non vérifié** : le chargement de ces fichiers dans le jeu en marche (navigateur) et sur téléphone ; seuls le
    décodeur, les contrôles du format et les tests unitaires des modules `world` ont tourné dessus, sous Node.
