# Compte rendu — carte:construction

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

La carte finale de Paris est construite et écrite dans public/data/paris/ : 104 fichiers, 9,08 Mo (limites : 110 fichiers, 30 Mo), soit 98 tuiles, le graphe routier, les lieux, les monuments, le relief, le manifeste et un fichier de licence. Le script tools/map/build.mjs (12 fichiers build*.mjs, sans dépendance npm ni accès réseau, 7 s environ) lit les 12 couches normalisées, encode avec src/world/mapdata.ts et s'arrête en erreur si le format, la connexité, la règle « aucune enseigne » ou le budget ne sont pas respectés ; deux exécutions de suite donnent des fichiers identiques. validateMapData ne trouve aucune erreur sur la carte relue ; il reste un seul avertissement, sur les allées de jardin qui ne sont pas reliées aux rues (255 composantes en comptant les voies piétonnes). 99,18 % des arêtes carrossables sont dans la plus grande composante connexe (seuil demandé : 97 %) ; 283 voies souterraines (9,3 km) sont exclues et listées, les 112 arêtes de pont sont gardées. Les Champs-Élysées ont une emprise médiane de 68 m (63 m en moyenne sur toute l'avenue) pour 70 m officiels. Le test tests/unit/mapdata.real.test.ts (23 tests) relit tout avec le décodeur du jeu et vérifie Concorde, Étoile, République et l'eau sous le Pont Neuf ; « npx vitest run tests/unit/mapdata » passe (85 tests). src/world/mapdata.ts n'a pas été modifié. Trois choix sont à connaître du moteur : l'eau est placée au-dessus de toutes les surfaces (ce n'est pas MAP_SURFACE_LAYER_ORDER), le relief ne descend pas dans le lit du fleuve (plan d'eau à -6,1 m sous le sol voisin), et les trois monuments en plusieurs morceaux donnent deux entrées à clés distinctes. Le chargement dans le jeu en marche (navigateur, téléphone) n'a pas été essayé. Je n'ai rien commité.

## Chiffres

Sortie : 104 fichiers, 9 517 800 octets (9,08 Mo ; 3,3 Mo en gzip). Tuiles : 98, 8 202 952 octets, de 13 à 158 ko, médiane 82 ko. roadgraph.json 1 030 178 octets ; places.json 138 491 ; terrain.json 112 784 ; landmarks.json 24 924 ; manifest.json 7 288. Bâtiments : 30 564 sur 31 194 (629 de moins de 8 m² retirés, 526 cours comblées ; 358 144 sommets ; 22 208 haussmann, 7 380 faubourg, 642 monumental, 334 modern ; 121 portent une clé de monument ; 1 124 hauteurs déduites). Surfaces : 30 252 morceaux pour 26 109 polygones (sidewalk 15 805, road 6 645, courtyard 2 388, pedestrian 1 159, median 1 101, garden 1 080, grass 1 062, plaza 292, park 262, water 191 ; 3 700 polygones coupés par tuile, 0 repli). Barrières : 3 965 morceaux, 139,9 km. Arbres : 38 109. Mobilier : 24 183 (candélabres 15 297 dont 5 979 ajoutés, bancs 3 723, poubelles 1 346, potelets 1 062). Supports de feux : 6 701 (6 554 rattachés à un nœud). Bouches de métro : 442. Commerces : 26 476 (autre 11 426, cafe_restaurant 4 620, mode 2 692, alimentation 1 800, restauration_rapide 1 719, agence 938, hotel 896, bijouterie 737, banque 450, luxe 289, supermarche 287, pharmacie 282, telephonie 173, tabac_presse 167). Graphe : 17 242 nœuds, 20 060 arêtes, 589,7 km (residential 7 472, footway 4 428, service 2 307, primary 1 626, tertiary 1 501, secondary 1 447, pedestrian 1 279) ; 3 686 nœuds à feux, 6 961 passages piétons, 297 nœuds de limite ; 11 004 sens uniques, 112 ponts ; 283 voies souterraines exclues (9 297 m) ; composante principale 99,18 % des 14 353 arêtes carrossables. Lieux : 3 023 (1 580 voies, 359 monuments, 339 institutions, 279 places, 230 jardins, 90 stations, 68 quartiers, 45 quais, 33 ponts ; 108 majeurs). Monuments : 43 entrées pour 40 monuments. Relief : 283 × 151 nœuds au pas de 25 m, y = 0 à l'origine, de -3,95 à +35,85 m dans l'emprise, niveau de la Seine -6,1 m. Sources retenues (mentions dans le manifeste) : OpenStreetMap (ODbL 1.0), IGN BD TOPO et RGE ALTI (Licence Ouverte 2.0), Ville de Paris (ODbL), Apur BDCOM 2023 (ODbL 1.0), Île-de-France Mobilités (Licence Ouverte 2.0) ; base dérivée publiée sous ODbL 1.0. Code : 12 fichiers build*.mjs, 3 390 lignes environ, le plus long 573 lignes.

## Problèmes et limites

- Non vérifié : le chargement de la carte dans le jeu en marche (navigateur) et sur téléphone. Seuls le décodeur, les contrôles du format et les tests unitaires ont tourné dessus, sous Node.
- Ordre des surfaces : j'ai gardé l'ordre du lot A en plaçant toute l'eau au-dessus, et non MAP_SURFACE_LAYER_ORDER. Les chaussées et trottoirs du plan de voirie franchissent la Seine sur les ponts ; le fleuve les masque, et le tablier doit venir de l'arête de pont. Avec MAP_SURFACE_LAYER_ORDER, une avenue qui traverse un parc serait cachée.
- Relief : le lit du fleuve et des canaux est comblé depuis les berges, comme dans le quartier d'essai. Le plan d'eau (-6,1 m) est donc sous le sol voisin : le moteur doit ouvrir le sol le long des polygones d'eau. Les trois paliers de la Seine ne sont pas des marches : la berge basse est un creux doux de 4 m au plus (pas de 25 m, deux passes de lissage). Pente maximale dans l'emprise : 18,2 %.
- Monuments en plusieurs morceaux : deux entrées à clés distinctes (fontaines_concorde + fontaine_des_mers, palais_chaillot + palais_chaillot_passy, pont_neuf + pont_neuf_petit_bras). Seul fontaine_des_mers a déjà un alias dans src/world/monuments/keys.ts ; les deux autres clés secondaires n'en ont pas (fichier qui n'est pas à moi).
- Décision à confirmer : le monument de clé hotel_crillon est publié sous le nom « Hôtel de la place de la Concorde (palais de Gabriel, aile ouest) », parce que son nom d'origine est aussi l'enseigne d'un palace. La clé est inchangée.
- Candélabres : 5 979 sur 15 297 (39 %) sont synthétiques, ajoutés le long des trottoirs là où la source n'en relève pas. Aucune bouche d'incendie ni téléphone public (absents des sources). Les fontaines sont classées « autre », faute de nature dédiée dans le format.
- Commerces : 26 476 publiés sur 31 018 locaux. Non publiés : 3 433 locaux vacants ou en travaux, 209 situés dans un bâtiment de monument, 248 sans façade à moins de 15 m, 652 sans place sur la façade (galeries marchandes). La largeur de vitrine vient de la classe de surface, pas d'une mesure ; la catégorie « luxe » repose en partie sur une liste de dix rues.
- Estimations : cap des feux, des bouches de métro et du mobilier sans cap relevé ; 14 caps de monuments saisis de mémoire ; hauteur des murs de quai ; niveau d'eau des canaux et bassins ; trottoirs (1 518 arêtes au plafond de 25 m) ; style et toit des bâtiments (tout immeuble ordinaire de 15 à 30 m est haussmannien à mansarde, sans date de construction).
- Largeur de chaussée : 5 895 arêtes ont été ramenées à une largeur cohérente avec leur nombre de voies, parce que la BD TOPO donne la largeur du tronçon entier à chacune des chaussées parallèles d'OpenStreetMap. Le dessin exact reste dans les surfaces « road ».
- Graphe : les pistes cyclables (2 034 arêtes) n'y sont pas, le format n'ayant pas de classe pour elles. Les 580 passages sous immeuble n'ont pas de marque. Près des bords et des tunnels retirés, environ 10 % des nœuds carrossables ne sont pas à la fois atteignables et quittables en respectant les sens uniques.
- Règle « aucune enseigne » : le filtre ne connaît que les enseignes du relevé commercial et une liste de marques relevées à la main. Des établissements privés classés « institution » par le lot A (écoles privées, instituts) gardent leur nom. 61 toponymes publics ont un commerce homonyme (stations Bastille, Concorde…) et sont conservés.
- 99 noms de voies du lot A ne sont pas publiés comme lieux, faute d'arête de ce nom dans le graphe (tunnels, pistes cyclables, accès de parkings, variantes d'orthographe).
- Hauteurs de monuments : 19 valeurs du lot B saisies de mémoire, non vérifiées ici. Le Pont Neuf, sans hauteur dans la source, reçoit celle de son tablier au-dessus de l'eau (6,5 m et 5,1 m).
- Git : un processus tiers commite périodiquement (« Save in-progress build files »), si bien qu'une partie de mes fichiers est déjà suivie. Je n'ai fait aucun commit ; au dernier état, 9 fichiers build*.mjs et 21 fichiers de public/data/paris sont modifiés, et docs/map-build.md, tools/map/README.md, build-clip.mjs et build-names.mjs sont non suivis.

## Vérifications exécutées

- `node tools/map/build.mjs` (depuis /home/user/SafeDeal/crs-simulation) : code de sortie 0 ; affiche 104 fichiers, 9,08 Mo, 0 élément écarté par l'encodeur, 1 avertissement du contrôle, connexité 99,18 %.
- Contrôles intégrés à build.mjs, exécutés à chaque construction sur les fichiers relus depuis leur texte JSON : validateRawTile sur les 98 tuiles (0 erreur), validateMapData (0 erreur, 1 avertissement : 255 composantes connexes en comptant les allées piétonnes), contrôle des enseignes (0 nom fautif sur 3 226 chaînes publiées), budget.
- `npx vitest run tests/unit/mapdata` : 2 fichiers, 85 tests passés (62 du format + 23 sur les vraies données : manifeste, attribution, budget, validateRawTile et validateTile sur chaque tuile, ré-encodage identique de chaque tuile et du graphe, commerces sur leur façade, repères Concorde, Étoile, République, Pont Neuf).
- `CRS_PARIS_DATA=/nonexistent npx vitest run tests/unit/mapdata.real` : échoue avec le message « données de carte absentes… lancer node tools/map/build.mjs » (le test ne passe pas à vide).
- `npx vitest run` (suite entière, dernière exécution) : 57 fichiers, 854 tests passés, dont les tests des autres modules qui lisent mes tuiles (tests/unit/world-buildings.paris.test.ts : génération des immeubles des 98 tuiles dans son budget de triangles ; tests/unit/world-query.paris.test.ts).
- `npx tsc --noEmit` : aucune erreur dans mes fichiers ; 5 erreurs dans des fichiers d'autres contributeurs (src/gameplay/law/kernel.ts, src/sim/people/health-status.ts, src/sim/people/interactions.ts).
- Déterminisme : deux `node tools/map/build.mjs` de suite, puis `md5sum *.json tiles/*.json | md5sum` dans public/data/paris : sommes identiques. Même somme pour une construction vers un autre dossier (`CRS_MAP_OUT=<dossier temporaire>`).
- Chemin d'échec : `CRS_MAP_NORM=/nonexistent CRS_MAP_OUT=<dossier> node tools/map/build.mjs` : code de sortie 1, message « couche normalisée absente », aucun fichier écrit dans le dossier de sortie.
- `node tools/map/build.mjs --dry-run` : code de sortie 0, « Contrôle réussi », fichiers de public/data/paris inchangés (même somme md5).
- Budget mesuré sur disque : `find public/data/paris -type f | wc -l` = 104 ; `du -sb public/data/paris` = 9 517 800 octets.
- Découpage par tuile, par script d'essai hors dépôt sur la sortie décodée : aucun sommet de surface ou de barrière ne déborde de sa tuile ; les 509 trous sont dans leur contour ; aucun anneau ne se recoupe ; les surfaces cumulées par nature égalent celles du lot A à moins de 0,1 % près.
- Graphe, par script d'essai hors dépôt : en respectant les sens uniques depuis la Concorde, 98,85 % des arêtes carrossables hors desserte situées à plus de 300 m du bord sont atteignables et quittables ; 90,45 % des nœuds carrossables sur toute la carte.
- Recoupement des emprises de rues (chaussée + 2 trottoirs, valeur médiane) avec les largeurs officielles citées dans docs/research/04 : Grande-Armée 68 m (70), Haussmann 33 m (30 à 33,5), Sébastopol 30 m (30), Beaumarchais 36 m (35), Temple 37 m (36,5), Saint-Germain 29 m (30).
- Contrôle visuel : rendus PNG de la sortie décodée (outil Python jetable, hors dépôt), regardés : emprise entière (par type et par style de bâtiment), Concorde, Étoile, Champs-Élysées, République, Pont Neuf, pont Alexandre III, Louvre et Palais-Royal, Marais, Les Halles, un quartier de l'ouest.
- Recherche de marques dans les fichiers publiés par grep sur une trentaine de noms connus : il en est sorti des accès de parkings et un dépose-minute portant un nom de grand magasin, retirés depuis ; le grep ne trouve plus que des noms de rues.
- Lecture mesurée sous Node 22 sur cette machine : 98 tuiles en 42 ms de JSON.parse et 16 ms de decodeTile ; graphe 5 ms + 20 ms ; 3,3 Mo une fois compressé par gzip.

## Fichiers

- /home/user/SafeDeal/crs-simulation/tools/map/build.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-lib.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-clip.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-names.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-terrain.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-landmarks.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-buildings.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-roads.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-surfaces.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-points.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-shops.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-places.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/README.md
- /home/user/SafeDeal/crs-simulation/docs/map-build.md
- /home/user/SafeDeal/crs-simulation/tests/unit/mapdata.real.test.ts
- /home/user/SafeDeal/crs-simulation/public/data/paris/manifest.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/roadgraph.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/places.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/landmarks.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/terrain.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/LICENCE.txt
- /home/user/SafeDeal/crs-simulation/public/data/paris/tiles/ (98 fichiers t_{tx}_{tz}.json, tx de -6 à 7, tz de -3 à 3)
- /home/user/SafeDeal/crs-simulation/tools/map/raw/build/report.json (rapport de construction, ignoré par git)
