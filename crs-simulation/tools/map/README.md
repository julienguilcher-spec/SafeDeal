# tools/map — fabrication de la carte de Paris

Scripts Node 22, sans dépendance npm. Ils transforment des données ouvertes (OpenStreetMap, IGN, Ville de Paris, Apur,
Île-de-France Mobilités) en fichiers de carte du jeu, dans `public/data/paris/`.

```
node tools/map/fetch-a-all.mjs     # 1. couches structurelles : bâtiments, voies, surfaces, barrières, toponymes
node tools/map/fetch-b-all.mjs     # 2. couches de détail : arbres, mobilier, commerces, feux, métro, monuments, relief
node tools/map/build.mjs           # 3. données finales du jeu + rapport
node tools/map/verify-map.mjs      # 4. contrôles chiffrés indépendants de la construction (70 contrôles)
node tools/map/render-check.mjs    # 5. rendus de contrôle en 2D dans docs/img/ (à REGARDER)
npx vitest run tests/unit/mapdata  # 6. relecture par le décodeur du jeu, repères, non-régression des défauts corrigés
```

Les étapes 1 et 2 téléchargent (cache disque dans `raw/`, ignoré par git ; ajouter `--force` pour tout retélécharger) et
écrivent les couches normalisées dans `raw/normalized/`. L'étape 3 ne touche pas au réseau et prend 8 secondes environ.
Les téléchargements passent par `curl`, qui traverse le proxy tel quel.

## Les trois familles de scripts

| Scripts | Rôle | Documentation |
|---|---|---|
| `fetch-a-*.mjs`, `lib-a.mjs` | téléchargement et normalisation des couches `buildings`, `roads`, `areas`, `barriers`, `places` | `docs/map-sources-a.md` |
| `fetch-b-*.mjs`, `lib-b.mjs` | téléchargement et normalisation des couches `trees`, `furniture`, `shops`, `signals`, `metro`, `landmarks`, `terrain` | `docs/map-sources-b.md` |
| `build*.mjs` | construction des fichiers du jeu à partir des couches normalisées | `docs/map-build.md` |
| `verify-map.mjs`, `render-check.mjs` | vérification de la carte publiée : mesures et images | `docs/map-verification.md` |

Le format des fichiers produits est décrit dans `docs/map-format.md` ; son code (`src/world/mapdata.ts`) est importé tel
quel par `build.mjs`, qui s'en sert pour encoder et pour contrôler.

## Construction (`build.mjs`)

```
node tools/map/build.mjs            # écrit public/data/paris/ et tools/map/raw/build/report.json
node tools/map/build.mjs --dry-run  # construit et contrôle, n'écrit que le rapport
node tools/map/build.mjs --trace    # affiche la pile d'appels en cas d'échec
```

| Fichier | Contenu |
|---|---|
| `build.mjs` | enchaînement des étapes, encodage, contrôles, écriture, rapport |
| `build-lib.mjs` | lecture des couches, projection, simplification, index spatiaux |
| `build-clip.mjs` | découpage par tuile, réparation des contours invalides |
| `build-names.mjs` | règle « aucune enseigne » |
| `build-terrain.mjs` | relief lissé, niveau du fleuve |
| `build-landmarks.mjs` | monuments |
| `build-buildings.mjs` | bâtiments |
| `build-roads.mjs` | graphe routier |
| `build-surfaces.mjs` | surfaces au sol, barrières |
| `build-points.mjs` | arbres, mobilier, feux, bouches de métro |
| `build-shops.mjs` | commerces |
| `build-places.mjs` | lieux nommés |

Variables d'environnement : `CRS_MAP_NORM` (dossier des couches normalisées, défaut `raw/normalized`) et `CRS_MAP_OUT`
(dossier de sortie, défaut `public/data/paris`) permettent un essai sans écraser la carte du jeu.

La construction s'arrête avec le code de sortie 1, sans rien écrire dans le dossier de sortie, si :

- une couche normalisée manque, ou le relief est le relief plat de repli du lot B ;
- le format est violé (`validateRawTile`, `validateMapData` de `mapdata.ts`) ;
- la plus grande composante connexe porte moins de 97 % des arêtes carrossables ;
- un nom publié est une enseigne commerciale ou contient une marque déposée connue ;
- la sortie dépasse 110 fichiers ou 30 Mo.

Elle est déterministe : mêmes couches en entrée, mêmes fichiers en sortie, octet pour octet.

## Vérification (`verify-map.mjs`, `render-check.mjs`)

Deux scripts qui ne partagent aucun code avec `build*.mjs` et ne lisent que les fichiers PUBLIÉS (plus, s'ils sont là,
`raw/normalized/buildings.geojson` et `shops.geojson` pour deux recoupements). Aucun accès au réseau.

```
node tools/map/verify-map.mjs            # 70 contrôles ; code de sortie 1 si l'un d'eux est en échec
node tools/map/verify-map.mjs --quiet    # n'affiche que le bilan
node tools/map/render-check.mjs          # vue d'ensemble, relief, carte des trous et 7 gros plans dans docs/img/
node tools/map/render-check.mjs --only etoile,concorde
node tools/map/render-check.mjs --out /tmp/vues --box halles:1700,300,2300,800:2   # fenêtre libre, en mètres monde
```

- `verify-map.mjs` relit la carte avec le décodeur du jeu puis refait ses propres mesures : positions de 20 monuments
  (coordonnées Wikidata recopiées dans le script), hauteurs, polygones, connexité et sens uniques du graphe, arêtes en
  double, boucles, largeurs de voies et de ponts, orientation des vitrines, objets dans un bâtiment ou dans l'eau, murs de
  quai, relief, budget, temps de décodage, enseignes, attribution. Rapport : `raw/build/verify.json` ; toutes les chaînes
  publiées, pour relecture humaine : `raw/build/verify-names.txt`.
- `render-check.mjs` décode la carte avec son PROPRE décodeur (écrit d'après `docs/map-format.md`) et la dessine dans un
  canvas de Chromium piloté par Playwright (`require('playwright')` doit fonctionner ; rien n'est installé par le script).
  Les deux décodeurs sont recoupés par une empreinte des coordonnées, affichée par les deux scripts.
- `CRS_MAP_OUT` désigne la carte à vérifier (défaut `public/data/paris`), comme pour `build.mjs`.

Ce que la construction garantit depuis la vérification (défauts trouvés puis corrigés dans `build*.mjs`, détail dans
`docs/map-verification.md`) : pas de mur de quai au-dessus du canal couvert ; pas de boucle dans le graphe ; un nœud
`boundary` là où une chaussée s'arrêtait à l'entrée d'un souterrain retiré ; aucun arbre, objet de mobilier ou feu dans
l'emprise d'un bâtiment ni dans le fleuve ; bouches de métro reportées devant la façade ; trous de surface dans leur
contour ; passerelles à leur vraie largeur ; liste de noms écartés à la relecture (`REMOVED_NAMES` de `build-names.mjs`).

## Sortie

```
public/data/paris/
  manifest.json      emprise, tuiles, niveau de l'eau, attribution des sources
  roadgraph.json     graphe routier
  places.json        lieux nommés
  landmarks.json     monuments modélisés à la main
  terrain.json       relief
  tiles/t_{tx}_{tz}.json   98 tuiles de 512 m
  LICENCE.txt        licence ODbL de la base dérivée, mentions des sources
```

État au 16 novembre 2026, après vérification : 104 fichiers, 9,07 Mo. Les chiffres par couche et par tuile, les choix et les limites sont dans
`docs/map-build.md` ; le détail d'une construction est dans `raw/build/report.json` (voies souterraines exclues une à une,
cap retenu pour chaque monument, noms écartés, avertissements du contrôle).

## Licences

Les fichiers de `public/data/paris/` sont une base dérivée d'OpenStreetMap, de la Ville de Paris et de l'Apur (ODbL), de
l'IGN et d'Île-de-France Mobilités (Licence Ouverte 2.0). Ils sont publiés sous ODbL 1.0 ; les mentions exactes sont dans
`manifest.json` (`attribution`) et doivent figurer dans les crédits du jeu. Les noms d'enseignes des sources ne sont pas
publiés.
