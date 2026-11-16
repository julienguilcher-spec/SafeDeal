# Compte rendu — carte:vérification

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

J'ai vérifié la carte de Paris avec deux outils neufs qui ne partagent aucun code avec la construction, corrigé dix défauts dans les scripts, reconstruit, redessiné et regardé de nouveau les images. On reconnaît Paris sans légende : la Seine, ses deux îles et ses ponts, les douze avenues de l'Étoile (toutes nommées), l'axe Étoile–Concorde–Louvre, les Invalides, le Champ-de-Mars, le Trocadéro, la République, la Bastille ; les 98 tuiles sont remplies et aucune limite de tuile ne se voit. Le défaut le plus visible était 4,1 km de murs de quai tracés en surface au-dessus du canal Saint-Martin couvert (boulevard Richard-Lenoir, à travers la place de la Bastille) ; les plus nombreux étaient 1 980 objets de mobilier, 176 arbres et 52 supports de feux dans l'emprise d'un bâtiment, et 64 bouches de métro dans un immeuble ou une gare. Corrigés aussi : 22 boucles dans le graphe, 59 chaussées en cul-de-sac à l'entrée d'un souterrain retiré (désormais nœuds `boundary`), des passerelles larges de 2,5 m (pont des Arts : 10,8 m maintenant), un trou de surface qui débordait de son contour, 21 arbres plantés dans le fleuve. Sur la carte finale, `verify-map.mjs` passe 70 contrôles : 68 réussis, 2 « à surveiller », 0 en échec ; sur la dernière carte enregistrée dans git avant correction, il en met 9 en échec. Aucune enseigne ne subsiste dans les 3 183 chaînes publiées après une relecture complète (39 noms de lieux, 5 de bâtiments et 4 de voies retirés), et l'attribution des cinq sources est dans le manifeste. `npx vitest run tests/unit/mapdata` passe (3 fichiers, 94 tests, dont 9 nouveaux). Le principal défaut restant : la largeur d'une arête est la largeur roulable, 77 % en médiane de la chaussée réelle, et la rue de Rivoli fait 3 m dans le graphe pour 13,4 m de chaussée. Le chargement dans le jeu en marche n'a toujours pas été essayé, et je n'ai rien commité.

## Chiffres

Carte finale : 104 fichiers, 9 510 231 octets (9,07 Mo ; 3,52 Mo en gzip) ; 98 tuiles de 13 193 à 161 428 octets, médiane 83 873. Bâtiments 30 564 (inchangés ; 5 noms retirés) ; surfaces 30 250 ; barrières 3 946, soit 135,1 km dont 36,2 km de murs de quai (avant : 3 965 et 41,0 km) ; arbres 37 961 (avant 38 109) ; mobilier 24 054 (avant 24 183), dont 15 204 candélabres ; supports de feux 6 696 (avant 6 701) ; bouches de métro 442 (63 déplacées) ; commerces 26 476 (inchangés) ; graphe 17 264 nœuds et 20 082 arêtes (avant 17 242 et 20 060), 357 nœuds de limite dont 59 bouches de souterrain (avant 297) ; lieux 2 984 (avant 3 023) ; monuments 43. Corrections : 4 755 m de murs de quai retirés sur 25 lignes ; 3 275 objets de mobilier reportés devant une façade (dont 3 136 candélabres), 57 retirés d'un bâtiment, 21 retirés du fleuve ; arbres : 50 déplacés, 127 retirés d'un bâtiment, 21 retirés du fleuve ; feux : 161 déplacés, 5 retirés ; 22 boucles coupées ; 9 trous de surface retirés ; 14 passerelles mesurées dans les surfaces, 1 par table. Mesures : médiane des hauteurs 21,8 m, 95 % sous 28,6 m ; 1 383 emprises sur 31 194 (4,43 %) sans hauteur dans la source ; 99,18 % des 14 360 arêtes carrossables dans la plus grande composante ; 97,21 % des nœuds carrossables mutuellement atteignables en respectant les sens uniques (96,58 % avant) ; 0 arête en double, 0 superposée, 0 boucle ; 65 090 anneaux sans défaut ; 0 vitrine tournée vers l'intérieur sur 26 476 ; Champs-Élysées 71,1 m entre façades pour 70 m officiels ; 16 grands axes sur 16 à 15 % près de leur largeur officielle ; Étoile 25,55 m au-dessus de la Concorde ; niveau de la Seine -6,1 m ; 17 tabliers de pont sur 17 à 25 % près de leur largeur connue ; 1,01 % de l'emprise sans surface ni bâtiment. Décodage de la tuile la plus dense (t_2_2, 757 bâtiments, 745 commerces) : JSON.parse 0,8 ms + decodeTile 0,45 ms ; les 98 tuiles en 62 ms machine au repos, 186 ms machine chargée. Images : 10 PNG, 11 Mo. Code ajouté : render-check.mjs 796 lignes, verify-map.mjs 1 344 lignes, mapdata.verify.test.ts 241 lignes, map-verification.md 342 lignes. Sources inchangées : OpenStreetMap (ODbL 1.0), IGN BD TOPO et RGE ALTI (Licence Ouverte 2.0), Ville de Paris (ODbL), Apur BDCOM 2023 (ODbL 1.0), Île-de-France Mobilités (Licence Ouverte 2.0) ; Wikidata (CC0) pour le seul contrôle des positions.

## Problèmes et limites

- Non vérifié : le chargement de la carte dans le jeu en marche (navigateur, WebGL, téléphone), un rendu 3D, une mesure de performance sur téléphone. La comparaison avec le vrai Paris est faite à l'œil et par 20 positions de monuments, pas image contre image.
- Largeur des voies, non corrigée : `width` est la largeur roulable, 77 % en médiane de la chaussée de bordure à bordure (641 arêtes sous 60 %). Cas extrême : rue de Rivoli, 3 m dans le graphe pour 13,4 m de chaussée, axe décentré de 4 à 5 m ; 205 axes sont décentrés de plus de 3 m. Je n'y ai pas touché parce que le marquage au sol du moteur divise `width` par le nombre de voies. Pour barrer une rue de façade à façade, lancer un rayon vers les bâtiments plutôt que se fier à width + 2 × sidewalk.
- Décision à confirmer : j'ai élargi le sens de `boundary` (bord de carte OU bouche d'un souterrain retiré, 59 nœuds à l'intérieur de l'emprise). Aucun module ne lisait ce champ ; le commentaire de mapdata.ts est mis à jour, mais docs/map-format.md (§ 5.3) ne l'est pas : ce fichier n'est pas à moi.
- docs/map-build.md n'est plus à jour (compteurs d'arbres, de mobilier, de feux, de barrières, de lieux, de nœuds de limite ; règles ajoutées) : ce fichier n'est pas à moi. Les nouveaux chiffres sont dans docs/map-verification.md § 1 et § 5.
- Places de la Concorde et de la Bastille dans leur état récent d'OpenStreetMap (moitié piétonne) : fidèle à la source, mais l'anneau de circulation de la Concorde n'existe plus côté est.
- 1,01 % de l'emprise (20,1 ha) n'a ni surface ni bâtiment : berges basses de la Seine (le format a une nature « quay », la source n'en fournit pas), un quartier de rues du Gros-Caillou, faisceaux ferroviaires, pourtour de la Bourse. Le moteur y met du trottoir.
- Sens uniques : 350 nœuds carrossables sur 12 525 (2,8 %) restent hors de la partie du réseau où l'on peut aller et revenir (poches desservies par une rue piétonne, rampes de parking). 140 arêtes carrossables passent sous un bâtiment sur 2 143 m, sans marque dans le format.
- Passerelle Debilly : aucune surface ne la dessine, son tablier vient de l'arête (8 m, valeur saisie de mémoire) et l'un de ses bouts est à 3,4 m seulement au-dessus de l'eau. Tabliers tirés des arêtes plus étroits que les vrais pour quatre ponts à chaussées séparées (sans effet tant que le moteur prend les surfaces).
- Restes mineurs : 3 bouches de métro dans l'emprise de la gare de l'Est ; 76 arbres et 280 objets de mobilier à plus de 1,2 m à l'intérieur d'une chaussée ; 13 vitrines face à un autre bâtiment à 2 m ; 7 bâtiments superposés.
- Retirés faute de pouvoir les poser : la statue du Zouave du pont de l'Alma et 20 autres objets relevés dans le fleuve ; les 21 arbres des jardins flottants du port du Gros-Caillou (ces îles existent en surfaces « garden » mais restent sous l'eau, que la construction place au-dessus de tout).
- La clé technique `hotel_crillon` subsiste dans landmarks.json et dans les tuiles (le nom affiché est neutre). Elle est lue par src/world/monuments/keys.ts, qui n'est pas à moi : à renommer des deux côtés à la fois.
- Noms retirés par jugement, à confirmer : musées privés (Grévin, Banksy, du Chocolat, du Vin, de la Magie), Maison Gainsbourg, fondation Azzedine Alaïa, théâtre Daunou, Crédit Municipal, Bpifrance, six écoles et instituts privés, quatre galeries marchandes des Champs-Élysées. Les écoles privées sous contrat et les cliniques gardent leur nom.
- L'origine du monde est à 19 m de l'obélisque (le BRIEF dit « obélisque »), et la constante de longitude du BRIEF raccourcit les distances est-ouest de 0,086 %, soit 5,5 m sur toute l'emprise. Non corrigible sans changer le BRIEF.
- Les largeurs officielles de voies, les largeurs de ponts et les altitudes NGF qui servent de référence dans verify-map.mjs viennent de ma mémoire, pas d'un fichier téléchargé. Une première requête à l'API de www.wikidata.org a été refusée (429) ; je suis passé par query.wikidata.org.
- Les chiffres « avant » des feux (52) et des murs de quai (4,1 km) sont mesurés sur la dernière carte enregistrée dans git, pas sur la carte exacte livrée par la construction, que j'ai écrasée en reconstruisant.
- Git : je n'ai fait aucun commit. Le processus tiers « Save in-progress build files » a enregistré mes fichiers au fil de l'eau ; docs/map-verification.md était encore non suivi à la dernière vérification.

## Vérifications exécutées

- `node tools/map/build.mjs` (depuis /home/user/SafeDeal/crs-simulation) : code de sortie 0 ; 104 fichiers, 9,07 Mo, 0 élément écarté par l'encodeur, 1 avertissement du contrôle, connexité 99,18 %.
- Déterminisme : deux `node tools/map/build.mjs` de suite, puis `md5sum *.json tiles/*.json | md5sum` dans public/data/paris : même somme les deux fois (cdd9af6d…).
- `node tools/map/verify-map.mjs` sur la carte finale : code de sortie 0 ; 70 contrôles, 68 réussis, 2 à surveiller, 0 en échec.
- `CRS_MAP_OUT=<dernière carte de git HEAD, extraite par git archive> node tools/map/verify-map.mjs` : code de sortie 1 ; 9 contrôles en échec (trou de surface, boucles, arbres, mobilier, feux, métro, murs de quai, deux contrôles d'enseignes). Le script détecte donc bien les défauts corrigés.
- `node tools/map/render-check.mjs` : 10 images écrites dans docs/img (11 Mo en tout, PNG en 256 couleurs) ; deux exécutions donnent les mêmes tailles. Les dix images ont été regardées avec l'outil Read avant correction puis après, avec des recadrages à pleine résolution sur l'Étoile, le canal, la Bastille, le Pont Neuf, les vitrines de la République et le pont de la Concorde.
- Recoupement des deux décodeurs (celui de render-check, écrit d'après docs/map-format.md, et celui du jeu) : même somme des coordonnées, 3 302 208 631 pour les bâtiments et 416 984 114 pour les arêtes.
- `npx vitest run tests/unit/mapdata` sur la carte finale : 3 fichiers, 94 tests réussis (62 du format, 23 sur les vraies données, 9 nouveaux dans mapdata.verify.test.ts).
- `CRS_PARIS_DATA=<carte de git HEAD> npx vitest run tests/unit/mapdata.verify` : 8 tests sur 9 échouent ; le neuvième (position des monuments) passait déjà. Les nouveaux tests ne passent donc pas à vide.
- `npx vitest run` (suite entière), première exécution, sur la carte corrigée avant les deux derniers réglages (largeur des passerelles) : 99 fichiers, 1 369 tests réussis.
- `npx vitest run` (suite entière), seconde exécution, sur la carte finale, machine très chargée (charge moyenne 33) : 116 fichiers, 112 réussis, 4 en échec, aucun dans mes fichiers (core.adverse, vehicles.autopilot, un délai de 30 s dépassé dans world-buildings.paris, un seuil de 250 ms dépassé dans world-buildings.triangulate). `npx vitest run tests/unit/world-buildings.paris` relancé seul : 2 tests réussis en 28 s.
- `npx tsc --noEmit` : aucune erreur dans mes fichiers ; à la dernière exécution, une erreur dans src/sim/roles/archetypes/civil.ts, qui n'est pas à moi.
- Chemins d'échec : `CRS_MAP_OUT=/nonexistent node tools/map/verify-map.mjs` et `… render-check.mjs` : code de sortie 1 avec le message « données de carte absentes » ; `CRS_MAP_NORM=/nonexistent CRS_MAP_OUT=<dossier vide> node tools/map/build.mjs` : code de sortie 1, aucun fichier écrit ; `node tools/map/build.mjs --dry-run` : code de sortie 0, carte inchangée.
- Positions de référence : une requête à query.wikidata.org (37 monuments, propriété P625, licence CC0) ; 20 d'entre elles sont recopiées dans verify-map.mjs. Résultat : 20 monuments sur 20 à leur place (16 références tombent dans l'emprise publiée, les autres à moins de 40 m), décalage moyen de 1 m vers l'est et 0,9 m vers le nord.
- Enseignes : liste de 324 marques écrite pour ce contrôle, comparaison aux 20 314 noms de commerces du relevé, puis lecture complète des noms de monuments, d'institutions, de bâtiments, de surfaces, de stations et des voies au nom atypique. Résultat final : 0 occurrence fautive ; 15 toponymes homonymes d'une marque et 18 noms repris par un commerce voisin, relus et admis.
- Attribution : manifest.json porte six mentions avec licence (OpenStreetMap, IGN, Ville de Paris, Apur, Île-de-France Mobilités, base dérivée) ; LICENCE.txt est présent et cite l'ODbL.
- Moteur : j'ai lu src/world/view/raster.ts, decks.ts, markings.ts et src/world/query/roads.ts pour vérifier que les choix de la carte lui conviennent : il prend pour tablier les surfaces dures au-dessus de l'eau, relie en ligne droite le relief des deux bouts d'un pont, met du trottoir là où aucune surface n'est fournie, et ne lit pas encore le champ `boundary`.

## Fichiers

- /home/user/SafeDeal/crs-simulation/tools/map/render-check.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/verify-map.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-names.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-points.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-roads.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/build-surfaces.mjs
- /home/user/SafeDeal/crs-simulation/tools/map/README.md
- /home/user/SafeDeal/crs-simulation/tests/unit/mapdata.verify.test.ts
- /home/user/SafeDeal/crs-simulation/src/world/mapdata.ts
- /home/user/SafeDeal/crs-simulation/docs/map-verification.md
- /home/user/SafeDeal/crs-simulation/docs/img/map-overview.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-relief.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-holes.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-etoile.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-concorde.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-cite.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-republique.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-bastille.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-trocadero.png
- /home/user/SafeDeal/crs-simulation/docs/img/map-tour-eiffel.png
- /home/user/SafeDeal/crs-simulation/public/data/paris/manifest.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/roadgraph.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/places.json
- /home/user/SafeDeal/crs-simulation/public/data/paris/tiles/ (98 tuiles reconstruites)
- /home/user/SafeDeal/crs-simulation/tools/map/raw/build/verify.json (rapport des contrôles, ignoré par git)
- /home/user/SafeDeal/crs-simulation/tools/map/raw/build/verify-names.txt (toutes les chaînes publiées, ignoré par git)
- /home/user/SafeDeal/crs-simulation/tools/map/raw/verify/wikidata-sparql.json (positions de référence, ignoré par git)
