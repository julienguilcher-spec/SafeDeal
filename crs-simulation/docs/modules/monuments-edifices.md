# Compte rendu — monuments:edifices

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Lot « édifices » livré : les 12 monuments demandés ont chacun leur définition (defs/<clé>.ts), leurs obstacles (collide/<clé>.ts), leur silhouette lointaine, et ont été capturés (72 captures : 3 angles de jour, piéton, nuit, silhouette) puis regardés un à un. Tous sont présents dans landmarks.json (aucune emprise par défaut inventée). Tous tiennent dans les budgets : au plus 43 441 triangles (Grand Palais) et 11 appels de dessin (Opéra Garnier) ; Notre-Dame 21 692 triangles pour un budget de 120 000 ; silhouettes de 92 à 330 triangles.

Kit ajouté (fichiers nouveaux, rien de modifié dans l'existant) : kit/x-gothique.ts (arc brisé `lancet`, `roseWindow`, `pinnacle`, `buttress`, `flyingButtress`, `turret`, `gableWall`, flèche ajourée `openworkSpire`, et deux assembleurs `gothicNave` / `gothicApse` : vaisseau à niveaux étagés, culées, arcs-boutants à une ou deux volées, chevet rayonnant) ; kit/x-gothique-peint.ts (atlas de travées gothiques peintes sur canvas — baies à lancettes et oculus, galerie des Rois, fond de portail — en UN matériau par église, vitraux éclairés la nuit ; claire-voie à découpe alpha ; grande rose) ; kit/x-edifices.ts (toits, plaques extrudées, berceaux, nervures de dôme correctement orientées, verrières, couverture métallique éclairée, recalage sur l'emprise).

Ajustement au plan de Paris : chaque modèle est dessiné sur son emprise réelle (figée dans collide/<clé>.ts) et recalé par une pose rigide sommet pour sommet sur l'emprise fournie par la carte. Ce recalage a été ajouté parce que landmarks.json a été régénéré pendant mon travail (cap de l'Opéra Bastille passé de 196,4° à 220°) : le modèle suit désormais un changement d'ancrage ou de cap. Un test place les 12 monuments avec le vrai MonumentSystem et les vrais repères et vérifie qu'ils tombent sur leur emprise MONDE. Mesuré : les murs restent à moins de 3 m environ de l'emprise (4,4 m aux culées sud-est du chevet de Notre-Dame), hors perrons, escaliers, parvis et piazza ajoutés volontairement devant.

Limites à connaître : décor sculpté et remplages suggérés par texture (plats de très près), statuaire en mannequins stylisés, intérieurs non modélisés, verre opaque ; plusieurs cotes secondaires sont mes estimations ; rien n'a été essayé dans le vrai jeu (main.ts), seulement le banc d'essai (qui construit sans emprise) et les tests ; performance mesurée uniquement sous WebGL logiciel. Un fichier a été créé hors de kit/ (src/world/monuments/x-edifices-align.ts, données pures) car le test de pureté interdit à collide/ d'importer le kit et shape2d.ts est en lecture seule.

## Non fait / fragile

- Aucun essai dans le vrai jeu (main.ts, vrai WorldQuery, sol et rues réels) : seulement le banc d'essai et les tests ; l'accord visuel avec les rues voisines n'a donc pas été regardé
- Le banc d'essai construit les monuments SANS emprise : la tenue sur l'emprise réelle est vérifiée numériquement par les tests, pas par une capture superposée au plan
- Performance mesurée uniquement sous Chromium headless à WebGL logiciel, sur une machine très chargée (première construction de 260 ms à 1,9 s, textures comprises) : aucune mesure sur vrai GPU ni sur téléphone
- tests/e2e/out/monuments-edifices-report.json date de la passe complète qui précède les quatre recaptures ciblées : il indique encore 21 620 triangles pour Notre-Dame (21 692 au final), 10 132 pour la tour Saint-Jacques (10 252), 32,37 m pour la Madeleine (31,46) et 65,92 m pour l'Opéra (64,1)
- Qualités 'moyen' et 'ultra' identiques à 'haut' ; la qualité 'bas' allège cannelures, segments et statuaire, vérifiée seulement par test (pas de capture ni de comptage par monument)
- Décor sculpté, tympans, rois, niches et remplages suggérés par texture ; statuaire en mannequins articulés ; aucun intérieur ; vitrages opaques
- Obstacles : les édifices sont pleins sur toute leur emprise ; perrons, soubassements et escaliers ne se gravissent pas ; seuls trois passages sont praticables (tour Saint-Jacques, portique de Saint-Sulpice, coursives du Centre Pompidou). Sous le portique de Saint-Sulpice le perron de 0,5 m sera traversé visuellement par les personnages
- Cotes secondaires estimées, non sourcées : niveaux intermédiaires des façades, hauteur des dômes du Petit Palais et de la Bourse, sommet de la lyre de l'Opéra, tambours et combles, position de la colonne Médicis, forme du jardin du Petit Palais
- Recherche web très limitée (deux pages Wikipédia consultées, peu exploitables) : les cotes viennent surtout de docs/research/04-paris-lieux-monuments.md et de l'emprise de la carte
- Notre-Dame et le Centre Pompidou sont modélisés sans chantier (pas d'échafaudages ni de palissades « état 2026 »)
- Si la carte fournit un jour un contour différent (autre nombre de sommets), le recalage rigide ne s'applique plus : repli sur un ajustement par bornes, qui suppose le cap inchangé

## Vérifications exécutées

- npx vitest run tests/unit/monuments : 7 fichiers, 327 tests réussis (dont tests/unit/monuments.edifices.test.ts : 106 tests) après les dernières modifications de code
- monuments.edifices.test.ts vérifie, pour chacun des 12 monuments et sur l'emprise réelle décodée de public/data/paris/landmarks.json : construction en qualité basse et haute sans sommet invalide, budget de triangles (60 000 ; 120 000 pour Notre-Dame) et ≤ 12 appels de dessin, tenue sur l'emprise et couverture de celle-ci, hauteur réelle, rayon englobant, silhouette ≤ 400 triangles et ≤ 4 appels, obstacles simples et antihoraires avec et sans emprise, obstacles en coordonnées monde
- Test d'intégration : les 12 monuments placés par le vrai MonumentSystem (contexte factice sans WebGL, vrais repères avec ancrage et cap) tombent sur leur emprise MONDE, boîte calculée sommet par sommet
- Test de recalage : chaque modèle et ses obstacles suivent une emprise tournée de 23,6° et décalée (cas réel de l'Opéra Bastille dont le cap a changé dans la carte)
- Passages praticables testés : quatre arcades de la tour Saint-Jacques (passage de 5 à 8 m entre piles, voûte au-dessus de 5,5 m), portique de Saint-Sulpice dans les sept entrecolonnements et en long entre les deux rangs, coursives du Centre Pompidou dans les 13 travées ; et fermeture complète de l'emprise pour les 9 édifices pleins (échantillonnage de points intérieurs)
- npx tsc --noEmit : 0 erreur dans src/world/monuments et tests/unit/monuments.* (les 3 erreurs restantes sont dans src/sim/props/mod.ts, hors de mon lot) ; avec --noUnusedLocals --noUnusedParameters : 0 erreur dans mes fichiers
- node tests/e2e/monuments-edifices.mjs (les 12 monuments, qualité haute) : « [monuments-edifices] OK », aucune erreur de page ni console.error, tous dans les budgets d'après renderer.info ; puis recaptures ciblées de notre_dame, tour_saint_jacques, madeleine et opera_garnier après les dernières corrections : OK
- 72 captures tests/e2e/out/monument-<clé>-{jour-trois-quarts, jour-face, jour-arriere, jour-pieton, nuit, silhouette}.png, toutes correspondant au code final ; regardées avec l'outil Read, plus des vues rapprochées (portails et flanc nord de Notre-Dame, chevet, façade de l'Opéra, pied de la tour Saint-Jacques, façade est du Centre Pompidou, Opéra Bastille depuis la place)
- Corrections faites après lecture des captures : baies du chevet étirées, culées trop massives, pierre trop striée, nervures de dôme sombres (défaut du kit contourné), 13 appels de dessin à l'Opéra ramenés à 11, entrée du Grand Palais masquée par les murs de l'emprise puis refaite d'après le plan réel, bec de l'escalier de l'Opéra Bastille extrudé en bloc, scintillement de coplanarité à Saint-Eustache, contreforts sans face latérale et pinacles flottants à la tour Saint-Jacques, verrières en damier trop contrasté la nuit, toiture et flèche de Notre-Dame noires la nuit
- Mesure d'écart à l'emprise réelle (sommets entre 1,5 et 12 m de haut, distance au contour) : après correction du chevet de Saint-Eustache (7,5 m → 2,8 m) et de la sacristie de Notre-Dame (6,9 m → supprimé), les murs sont à moins de 3 m environ, sauf les culées sud-est du chevet de Notre-Dame (4,4 m)
- node tests/e2e/monuments.mjs systeme (script existant, non modifié) exécuté : le système tourne avec 38 repères sans erreur de page, mais le scénario échoue sur ses compteurs codés en dur (voir défauts du kit)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-gothique.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-gothique-peint.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-edifices.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/x-edifices-align.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/notre_dame.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/sainte_chapelle.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/madeleine.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/opera_garnier.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/saint_eustache.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/saint_sulpice.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/tour_saint_jacques.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/bourse_commerce.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/centre_pompidou.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/opera_bastille.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/grand_palais.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/petit_palais.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/notre_dame.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/sainte_chapelle.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/madeleine.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/opera_garnier.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/saint_eustache.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/saint_sulpice.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/tour_saint_jacques.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/bourse_commerce.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/centre_pompidou.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/opera_bastille.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/grand_palais.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/petit_palais.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.edifices.test.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/monuments-edifices.mjs
- /home/user/SafeDeal/crs-simulation/tests/e2e/out/monuments-edifices-report.json
