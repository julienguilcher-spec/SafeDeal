# Compte rendu — carte:sources-structure

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Les cinq couches structurelles (buildings, roads, areas, barriers, places) sont téléchargées, normalisées et contrôlées par une chaîne relançable sans dépendance npm (Node 22 + curl, cache disque, 1 requête/s par hôte, abandon d'un hôte après 3 échecs). Bâtiments : géométrie, hauteur et niveaux de la BD TOPO de l'IGN, nature/nom/forme de toit par jointure spatiale avec OpenStreetMap. Rues : graphe OpenStreetMap coupé à chaque carrefour (extrémités aux coordonnées identiques), largeur de chaussée et nombre de voies appariés depuis la BD TOPO. Surfaces : Seine, canal Saint-Martin, bassin de l'Arsenal, parcs, jardins, places depuis OpenStreetMap ; polygones réels de chaussée, trottoir, terre-plein et îlot depuis le plan de voirie de la Ville de Paris. Barrières : murs, grilles, haies et murs de quai d'OpenStreetMap, complétés par la BD TOPO, interrompus aux portails connus. Toponymes : rues, quais, ponts en lignes ; places, jardins, quartiers, monuments, stations, institutions en points, avec un filtre qui écarte tout nom porté par un commerce. Tous les contrôles bloquants passent : schéma, 91 cases de 500 m toutes pourvues de bâtiments et de rues, 12 avenues à l'Étoile, Seine d'un seul tenant. La Seine entre par le bord ouest et sort par le bord sud (longitude 2.356 à 2.361) : elle n'atteint pas le bord est, qui est plus au nord que le fleuve. J'ai ajouté des champs hors contrat, facultatifs : `sub`, `z` (ordre de peinture) et `source` sur les surfaces, `covered` sur les rues, `rank` sur les toponymes. Rien n'a été commité.

## Chiffres

Couches normalisées : buildings 31 194 (17,3 Mo ; hauteur BD TOPO 28 993, déduite des niveaux 784, OSM 34, absente 1 383 ; 404 bâtiments venus d'OSM seul) ; roads 18 354 arêtes issues de 11 987 chemins OSM (6,3 Mo ; 6 663 arêtes carrossables dont 6 602 avec largeur ; 142 arêtes de pont, 245 de tunnel) ; areas 25 990 (15,3 Mo ; îlots 1 619, chaussées 5 645, trottoirs 15 118, eau 152, parcs 162, jardins et pelouses 1 890, places 226, surfaces piétonnes 940) ; barriers 3 631 lignes (0,9 Mo ; murs 1 256, clôtures 1 180, grilles 660, haies 292, murs de quai 243) ; places 3 278 (1,0 Mo ; rues 1 799, places 284, jardins 230, monuments 365, institutions 358, stations 94, quartiers 68, quais 45, ponts 35). Sources retenues : OpenStreetMap, extrait Paris d'OpenStreetMap France du 15/11/2026 (47,9 Mo, ODbL 1.0) avec miroir de secours BBBike ; IGN BD TOPO par WFS de la Géoplateforme (Licence Ouverte 2.0 : 31 901 bâtiments, 9 023 tronçons, 456 constructions linéaires) ; Ville de Paris, 10 jeux (ODbL : chaussées 5 670, trottoirs 14 174, îlots privés 1 626, terre-pleins 415, îlots directionnels 644, aires mixtes 285, espaces verts 489, plus 3 jeux de contrôle). Écartées : serveurs Overpass et Geofabrik (injoignables), API OSM (limite de 50 000 nœuds), volumes bâtis de la Ville (92 836 volumes sans hauteur en mètres), murs de la Ville (115 863 fragments). Cache brut : 157 Mo, 33 requêtes pour tout retélécharger.

## Problèmes et limites

- Licence : les données d'OpenStreetMap et de la Ville de Paris sont sous ODbL (partage à l'identique des bases dérivées). Les fichiers de carte publiés dans public/data/paris/ devront porter une mention ODbL, en plus des trois attributions dans les crédits du jeu (textes exacts dans docs/map-sources-a.md, section 2).
- La Seine ne traverse pas l'emprise jusqu'au bord est : elle sort par le bord sud vers le pont de Sully, parce que la limite sud (48.8500) coupe le fleuve. Ce n'est pas un trou de données.
- 1 383 bâtiments (4,4 %, surtout de petites annexes de cour) n'ont ni hauteur ni niveaux : `height` vaut null, à la construction de décider. La hauteur BD TOPO est mesurée à la gouttière, toit non compris.
- 3 822 bâtiments ont la nature `other` (usage inconnu dans la BD TOPO comme dans OSM, médiane 40 m²).
- Les trottoirs filaires (13 786 chemins OSM) et les passages piétons (6 704) sont volontairement absents de roads : les trottoirs sont des polygones dans areas, les passages piétons relèvent de la couche signals de l'autre lot.
- `tunnel` n'est vrai que pour les voies souterraines à couche négative (245 arêtes) ; les passages sous immeuble portent le champ hors contrat `covered` (738 arêtes).
- 61 arêtes carrossables n'ont pas de largeur (grandes places : Concorde, Opéra, Trocadéro) ; `maxspeed` n'est rempli que là où OSM le donne.
- Barrières : couverture limitée à ce qu'OSM et la BD TOPO ont relevé ; hauteur connue pour 241 lignes sur 3 631. Le jeu « murs » de la Ville (115 863 fragments non classés) a été écarté.
- Les surfaces se recouvrent (îlot sous les bâtiments, parc sous ses allées) : la construction doit respecter l'ordre `z` ; le fichier est déjà trié dans cet ordre. Les emprises ferroviaires n'ont pas de surface dédiée.
- Le polygone de la Seine dépasse la marge de 60 m à l'ouest (jusqu'à la longitude 2.2795) pour garder l'île aux Cygnes entière comme trou.
- Dans l'extrait du département 75, la relation OSM de la Seine est tronquée hors de Paris : le script la referme par un segment situé hors de l'emprise et affiche un avertissement.
- Le téléchargement du fichier OSM principal par le script lui-même n'a pas été exécuté : le fichier a été récupéré une première fois par curl à la même adresse (md5 vérifié), puis servi par le cache. L'option `--force` n'a pas été rejouée en entier, pour ne pas retélécharger 157 Mo.
- 61 jardins repris de la Ville de Paris gardent des noms sans accents (source en capitales).
- Tour Eiffel, Arc de Triomphe, Louvre et autres monuments figurent comme bâtiments ordinaires de nature `monument` : la construction devra les remplacer par les modèles de l'autre lot.
- Les couches normalisées sont dans tools/map/raw/ (ignoré par git) : seuls les scripts et la documentation sont versionnables. Aucun commit n'a été fait.

## Vérifications exécutées

- `node tools/map/fetch-a-all.mjs` lancé depuis la racine du projet : code de sortie 0, les 8 étapes s'enchaînent (environ 13 s avec le cache) et le contrôle final affiche « tous les contrôles bloquants passent ».
- `node tools/map/fetch-a-8-check.mjs` rejoué après la dernière modification (filtre des écoles privées dans places) : schéma conforme sur les 5 couches (clés, valeurs énumérées, types, anneaux fermés, identifiants uniques, coordonnées dans l'emprise + marge de 60 m).
- Quadrillage de 500 m (même script) : 13 x 7 = 91 cases, chacune contient des bâtiments et des rues (minimum 18 bâtiments et 23 arêtes) ; aucune case n'a dû être excusée par la Seine ou un jardin.
- Place de l'Étoile (même script) : l'anneau « Place Charles de Gaulle » (12 arêtes) reçoit les 12 avenues attendues, une arête chacune.
- Seine (même script) : un seul polygone à 3 trous (île aux Cygnes, Cité, Saint-Louis), 100 % des cellules d'eau d'une trame de 10 m reliées ; entrée par le bord ouest (lat 48.8527 à 48.8552), sortie par le bord sud (lon 2.3560 à 2.3611) ; 6 points de contrôle corrects ; bassin de l'Arsenal et canal Saint-Martin présents (11 polygones).
- Graphe des rues (même script) : 9 695 arêtes hors chemins piétons, escaliers et pistes cyclables, 482,5 km, la composante principale porte 99,35 % de la longueur.
- Toponymes (même script) : 20/20 grandes rues, 24/24 ponts de la Seine, 10/10 stations ; seuls manquent la place de la Nation, le jardin du Luxembourg et le Panthéon, qui sont hors de l'emprise.
- Enseignes (même script) : aucun bâtiment ordinaire ni aucune institution ne porte un des 18 242 noms de commerces de l'extrait OSM.
- Téléchargements réellement exécutés par les scripts : `node fetch-a-2-ign.mjs` (12 requêtes WFS, nombres reçus égaux aux nombres annoncés : 31 901 bâtiments, 9 023 tronçons) et `node fetch-a-3-paris.mjs` (10 jeux, 20 requêtes).
- Miroir de secours OSM : `node fetch-a-1-osm.mjs --mirror=bbbike --out=...` (243,5 Mo téléchargés, 18,2 M de nœuds lus), puis étapes 4 à 8 rejouées sur cet extrait : mêmes comptes et contrôles réussis ; extrait principal restauré ensuite.
- Chemin d'échec du téléchargement : script d'essai sur une URL inexistante : 3 tentatives espacées de 2 s puis 8 s, puis `HostDownError`, et l'hôte est bien refusé à l'appel suivant.
- Recoupements par script d'essai (hors dépôt) : Seine OSM 0,867 km² contre 0,866 km² pour la BD TOPO dans l'emprise ; 93,2 % des 1 828 noms officiels du filaire de voies de la Ville retrouvés dans les couches.
- Validité des polygones par script d'essai (hors dépôt) : 17 anneaux auto-sécants sur 62 159 (1 bâtiment, 16 surfaces du plan de voirie), aucun trou hors de son polygone.
- Rendus PNG regardés (outil Python/PIL jetable, hors dépôt) : emprise entière, Opéra, Étoile, Concorde-Tuileries, île de la Cité, canal Saint-Martin-République : tracés conformes au plan réel.
- `node --check` sur les 10 scripts : aucune erreur ; aucun import inutilisé, aucun TODO.

## Fichiers

- /home/user/SafeDeal/crs-simulation/tools/map/lib-a.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-1-osm.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-2-ign.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-3-paris.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-4-buildings.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-5-roads.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-6-areas.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-7-places.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-8-check.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/fetch-a-all.mjs
- /home/user/SafeDeal/crs-simulation/docs/map-sources-a.md
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/buildings.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/roads.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/areas.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/barriers.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/normalized/places.geojson
- /home/user/SafeDeal/crs-simulation/tools/map/raw/check-a.json
