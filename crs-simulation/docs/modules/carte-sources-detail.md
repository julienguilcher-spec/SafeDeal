# Compte rendu — carte:sources-détail

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Les sept couches de détail sont téléchargées, normalisées et contrôlées dans tools/map/raw/normalized/ : trees, furniture, shops, signals, metro, landmarks (GeoJSON) et terrain.json. La chaîne tient en huit scripts Node sans dépendance (fetch-b-1 à fetch-b-8, plus fetch-b-all.mjs et lib-b.mjs) ; elle se relance depuis le cache disque en 10 à 13 s et le contrôle final passe avec 0 échec et 1 avertissement (aucun téléphone public). Sources retenues : OpenStreetMap (le même extrait que le lot A), six jeux de la Ville de Paris, la BDCOM 2023 de l'Apur pour les commerces, trois jeux d'Île-de-France Mobilités pour le métro, et l'IGN pour le relief (RGE ALTI) et l'emprise des deux ponts (BD TOPO). Le relief est réel, pas plat : grille de 283 × 151 points au pas de 25 m, Concorde à 32,8 m, Étoile à 58,6 m, Seine vers 26,5 m. Les 40 monuments demandés ont leur emprise réelle, une hauteur (sauf le Pont Neuf) et la liste des bâtiments du lot A à retirer du rendu ; saint_sulpice et gare_saint_lazare sont bien dans l'emprise. Quand une source ne répond pas, chaque script se replie sur une autre source et le contrôle refuse la couche ; ces replis ont été exercés en simulant les pannes. Trois points demandent une décision ou une vérification côté construction : les lampadaires sont partiels (OpenStreetMap seul, aucun jeu ouvert d'éclairage public trouvé), 19 hauteurs de monuments sont des valeurs saisies de mémoire, et trois monuments en plusieurs morceaux donnent plusieurs polygones de même clé. docs/map-sources-b.md décrit les sources retenues et écartées, les licences et attributions exactes, la correspondance des champs, les nombres d'objets et les limites. Je n'ai modifié aucun fichier du lot A, rien écrit dans public/data/paris/ et rien commité.

## Chiffres

trees : 38 109 arbres, 6,0 Mo (Ville de Paris 33 934, OSM 4 175 ; hauteur connue pour 90,3 %). furniture : 18 204 objets, 3,1 Mo (lamp 9 318, bench 3 723, bin 1 346, bollard 1 062, bus_shelter 487, statue 472, fountain 401, velib 302, advert_panel 298, flagpole 253, newsstand 181, toilet 174, morris_column 124, wallace_fountain 34, kiosk 29, phone 0 ; OSM 17 357, Ville de Paris 847). shops : 31 018 locaux, 7,0 Mo (BDCOM 30 535, OSM 483 ; dont 3 433 vacants ; 33 familles). signals : 15 922 objets, 3,1 Mo (6 701 supports de feux de la Ville, 1 361 nœuds de feux OSM, 7 860 passages piétons dont 3 127 avec feux). metro : 532 objets, 0,13 Mo (90 stations, 442 bouches : 434 OSM et 8 Île-de-France Mobilités). landmarks : 43 polygones pour 40 monuments, 0,2 Mo, 130 sourceIds. terrain : 283 × 151 = 42 733 altitudes au pas de 25 m, 246 Ko, de 22,23 à 91,88 m. Sources retenues : OpenStreetMap (ODbL), Ville de Paris (6 jeux, ODbL), Apur BDCOM 2023 (ODbL), Île-de-France Mobilités (3 jeux, Licence Ouverte 2.0), IGN RGE ALTI et BD TOPO (Licence Ouverte 2.0). Une chaîne complète avec --force émet 65 requêtes pour environ 78 Mo de cache, dont 48 Mo d'extrait OSM. Code : 2 127 lignes dans 10 fichiers.

## Problèmes et limites

- Lampadaires partiels : 9 318, tous d'OpenStreetMap, de 212 par km² à l'ouest à environ 600 par km² au centre et à l'est. Aucun jeu ouvert d'éclairage public trouvé (absent du catalogue de la Ville, 0 ressource sur data.gouv.fr, rien sur data.iledefrance.fr). La construction devra compléter.
- Potelets très partiels (1 062) et aucun téléphone public (0 dans OpenStreetMap). Les jeux « plan de voirie - mobiliers urbains » de la Ville sont des fragments de dessin sans classe ; les potelets y seraient reconstructibles en téléchargeant plusieurs centaines de Mo de géométrie : non fait.
- Écart au contrat sur landmarks : trois monuments en plusieurs morceaux donnent plusieurs polygones de même clé, distingués par `part` (fontaines_concorde nord et sud, palais_chaillot 1 et 2, pont_neuf 1 et 2). La clé n'est donc pas unique.
- Hauteurs de monuments : 19 sont des valeurs encyclopédiques saisies de mémoire (heightSource « reference »), à vérifier avant modélisation ; hotel_matignon est une estimation (15 m) ; pont_neuf n'a pas de hauteur. Les autres viennent d'OpenStreetMap ou de la BD TOPO.
- Conciergerie : emprise dérivée (bande de 50 m le long du quai de l'Horloge découpée dans le contour du Palais de Justice), car ni OpenStreetMap ni la BD TOPO ne la séparent ; le bâtiment générique reste commun aux deux monuments.
- Commerces : le champ `name` contient les noms d'enseignes bruts, à retirer à la construction comme prévu ; `category` et `group` sont sans marque. Pour les noms d'arrêts de bus, de stations de vélos et de sorties de métro, le filtre d'enseignes est une liste explicite, pas une garantie.
- Commerces : relevé BDCOM de 2023, un point à l'adresse du local ; 608 positions portent plusieurs locaux (2 833 locaux, jusqu'à 151 au même point pour une galerie marchande), à répartir le long des façades.
- Houppier des arbres : estimé à partir de la circonférence du tronc ou de la hauteur, jamais mesuré ; 3 688 arbres sans hauteur.
- Cap du mobilier : 79 valeurs relevées, 13 002 calculées vers l'axe de la chaussée la plus proche (hypothèse), 5 123 objets sans cap.
- Relief : échantillons ponctuels non lissés ; 631 paires de nœuds voisins diffèrent de plus de 4 m (tranchées ferroviaires, quais bas, talus). La Concorde est à 32,8 m, pas « vers 35 m ». Les tabliers de ponts ne sont pas dans le modèle.
- Kiosques de presse : le jeu de la Ville date de janvier 2020.
- Non refait : après l'ajout final des replis, la chaîne complète n'a pas été relancée avec --force contre les serveurs ; elle a été vérifiée depuis le cache et par pannes simulées. Seul l'extrait OSM a été retéléchargé.
- Taille : mes couches normalisées font environ 19,8 Mo en GeoJSON verbeux et celles du lot A environ 41 Mo ; la construction devra quantifier fortement pour tenir le budget de 30 Mo.
- Git : lib-b.mjs et fetch-b-1-osm.mjs apparaissent déjà suivis (commités par quelqu'un d'autre pendant la session) et sont maintenant modifiés ; les autres fichiers sont non suivis. Je n'ai rien commité.
- Exploration : une soixantaine de requêtes hors scripts (catalogues, sondages de jeux), à une par seconde, dont 17 inutiles au début à cause d'un paramètre `select` invalide de ma part.

## Vérifications exécutées

- Chaîne complète depuis le cache : `node tools/map/fetch-b-all.mjs` se termine avec le code 0 en 10 à 13 s ; le contrôle affiche « CONTRÔLE RÉUSSI : 0 échec(s), 1 avertissement(s) ».
- Reproductibilité : deux exécutions successives de `node tools/map/fetch-b-all.mjs` donnent des md5 identiques pour les sept fichiers de sortie.
- Téléchargements réels : chaque script a tourné une première fois sur cache vide contre les serveurs (opendata.paris.fr 12 requêtes, carto2.apur.org 34, data.geopf.fr 12, data.iledefrance-mobilites.fr 6) ; la BDCOM annonce 31 263 locaux et en livre 31 263.
- Extrait OSM : `node tools/map/fetch-b-1-osm.mjs --force` a retéléchargé le fichier de download.openstreetmap.fr ; son md5 (854a5c983ac30b9ce94234c0e3233bf5) est identique à celui du lot A.
- Contrôle `node tools/map/fetch-b-8-check.mjs` : schéma de chaque couche, 0 objet hors emprise, 0 doublon exact, 0 quasi-doublon, aucune tuile de 512 m vide pour trees, furniture, shops et signals.
- Monuments : les 40 clés sont présentes, les 43 polygones sont fermés et valides, et les 130 sourceIds existent tous dans buildings.geojson du lot A.
- Relief : dix altitudes de référence dans les fourchettes attendues (Concorde 32,8 m, Étoile 58,6 m, Trocadéro 60,5 m, République 36,9 m, Bastille 38,5 m, Seine 26,4 à 26,8 m) ; aucune valeur manquante ; la grille couvre l'emprise + 300 m.
- Couverture commerciale mesurée par le contrôle : Champs-Élysées 253 locaux, rue de Rivoli 408, Grands Boulevards 808, boulevard Saint-Germain 453, Marais 3 373, Châtelet-Les Halles 1 793, Saint-Germain-des-Prés 1 722.
- Replis en cas de panne : `CRS_MAP_FAIL_HOSTS=opendata.paris.fr,data.geopf.fr,carto2.apur.org,data.iledefrance-mobilites.fr CRS_MAP_NORM=<dossier temporaire> node tools/map/fetch-b-all.mjs` produit toutes les couches en mode dégradé (relief plat à 33 m avec flat: true, commerces OSM seuls, Pont Neuf par tampon OSM à moins de 7 m de l'emprise IGN) et le contrôle les refuse avec le code 1 ; les vraies sorties sont restées intactes (md5 inchangés).
- Contrôle visuel : plan d'ensemble (`fetch-b-8-check.mjs --preview`, rendu en PNG avec Chrome sans affichage) et deux agrandissements (Concorde-Madeleine, île de la Cité) superposés aux bâtiments et aux rues du lot A : monuments alignés sur les bâtiments, commerces le long des façades, feux aux carrefours, arbres en alignement.
- Bogue trouvé par le contrôle et corrigé : 13 caps de mobilier valaient 360 au lieu de 0.
- Syntaxe : `node --check` passe sur lib-b.mjs et sur les neuf scripts fetch-b-*.
- Fichiers du lot A : dates de modification antérieures à mon travail (fetch-a-*, lib-a.mjs et leurs cinq couches) ; je ne les ai que lus.
- Overpass et Geofabrik réessayés une fois chacun avec curl : connexion coupée (code 000 en 3 s).

## Fichiers

- /home/user/SafeDeal/crs-simulation/tools/map/lib-b.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-1-osm.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-2-trees.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-3-landmarks.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-4-furniture.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-5-shops.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-6-signals-metro.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-7-terrain.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-8-check.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-b-all.mjs
- /home/user/SafeDeal/crs-simulation/docs/map-sources-b.md
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/trees.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/furniture.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/shops.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/signals.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/metro.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/landmarks.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/terrain.json
- /home/user/SafeDeal/crs-simulation/tools/map/raw/b/check-b.json
- /home/user/SafeDeal/crs-simulation/tools/map/raw/b/preview-b.svg
