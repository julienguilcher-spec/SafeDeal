# Compte rendu — rendu:effets

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module « effets visuels » écrit, exécuté et vérifié à l'image : src/render/fx (17 fichiers, ≈ 4 300 lignes, aucun > 570 lignes), banc d'essai harness/fx.html + fx.ts, test de bout en bout tests/e2e/fx.mjs (26 captures + mesure de coût), 5 fichiers de tests unitaires (47 tests verts). `npx tsc --noEmit` : 0 erreur dans tout le dépôt ; contracts.ts et extensions.ts non touchés ; aucun autre module importé (les services facultatifs sont décrits par leur forme minimale dans api.ts).

Ce qui est fait (les 9 exigences) :
1. Un GameSystem `render.fx`, ordre VIEW + 5, exporté par createSystems ; inerte sans ctx.view (headless).
2. Nuages de gaz et de fumée tirés de 'hazards.field' (collectActiveCells s'il existe, sinon forEachActiveCell avec un rappel conservé ; aucune allocation) : cellules regroupées par distance (2 / 4 / 8 / 16 / 32 m) avec régulation automatique quand le nuage dépasse le budget, opacité selon Beer-Lambert (indépendante du niveau de détail), bouffées à lobes éclairées (normale apparente, soleil, ciel, feux, gyrophares, lueur de l'éclairage public la nuit), écoulement et étirement dans le sens du vent, fondu au sol, nappes couchées en vue plongeante ; couleur de la fumée transportée par le champ (fumigènes colorés).
3. Feu : nappes au sol, objets, barricades, véhicules, vitrines, personnes ; flammes procédurales animées, panache dont la teinte dépend du matériau (plastique noir, bois gris, deux-roues très noir), braises, lueur au sol, lumière vacillante via 'render.lights' si présent, rougeoiement des carcasses après extinction, feu de batterie (jet clair, gerbes d'étincelles blanches, éclairs par à-coups).
4. Les 19 FxId, plus 'explosion' (secousse ctx.view.shake selon type et distance, onde au sol, éclair) et 'projectile:impact' ; sang uniquement si settings.violence = 'realiste' (vérifié dans la recette elle-même).
5. Jet d'eau : arc balistique reconstitué depuis l'événement 'jet_eau' (vitesse calculée pour retomber à la portée annoncée), âme + gaine d'écume + gouttes + embruns, éclaboussures, flaques qui grandissent puis sèchent.
6. Projectiles : UN maillage instancié pour toutes les formes (sélection de forme dans le vertex shader), grossis avec la distance, traînées, flamme de l'engin incendiaire, tête et étincelles du mortier, fusée rouge qui monte puis reste suspendue en éclairant, palet et fumigène qui fument.
7. Décalques persistants sol et façades (brûlure, bitume noirci, verre, flaque, peinture, tag, débris, éclat, suie) en anneau plafonné avec pâlissement des plus anciens et fusion des voisins.
8. Budget : 3 appels de dessin au plus (mesuré : 1 à 3), tri par profondeur d'une seule couche prémultipliée (une fumée devant une flamme la masque).
9. Banc d'essai à 9 scènes dont « reel », contrôle d'intégration avec les VRAIS modules sim/hazards et sim/items chargés à la demande : le champ réel, ses feux, les grenades, le mortier et l'engin incendiaire réels s'affichent sans erreur.

J'ai regardé toutes les captures et itéré (gaz d'abord invisible puis trop « coton », flammes blanches corrigées en orangé, jet trop grêle épaissi, boule de feu conique remplacée, lueur au sol à bord net adoucie). Le rendu final est crédible ; les limites sont listées dans notDone.

## API publique et mode d'emploi

BRANCHEMENT
`import { createSystems } from '@/render/fx'` puis `game.addModule(createSystems)` APRÈS le rendu de base (il faut ctx.view). Un seul système, id `render.fx`, ordre SystemOrder.VIEW + 5 (après la caméra du rendu de base, avant son 'render.present'). Il ajoute à view.world un groupe « fx » de trois maillages : `fx-decalques` (renderOrder 8), `fx-projectiles` (opaque), `fx-particules` (renderOrder 30). reset() vide particules, décalques, traînées et rend ses lumières. Un changement de view.quality reconstruit les couches (les décalques sont alors perdus).

SERVICE PUBLIÉ : ctx.service<FxRenderApi>('render.fx') (types dans src/render/fx/api.ts)
- stats : sprites, particles, puffs, cells, lodBias, flames, fires, decals, decalQuads, projectiles, jets, drawCalls (≤ 3), triangles, cpuMs / cpuMsAvg / cpuMsMax, events, eventsDropped, particlesDropped, spritesDropped, lights.
- budget (FxBudget) et quality.
- emit(id: FxId, x, y, z, { size, dirX, dirY, dirZ, color, seconds }) : même sémantique que l'événement 'fx', sans passer par le bus.
- clear().
- vehicleFire (défaut true) : ce module dessine flammes et fumée des véhicules et met 'vehiclesRender'.ownFire à false ; le remettre à false rend la main au rendu des véhicules.
- hiddenPersonId : personne dont les flammes ne sont pas dessinées (par défaut, celle du joueur en caméra 'fps').

CE QUE LE MODULE LIT (jamais d'écriture dans la simulation)
ctx.view (camera, world, scene, quality, drawDistance, renderer.capabilities, shake), ctx.projectiles.list, ctx.props.list / shops / shopsNear, ctx.vehicles.list (burning, state, beacons, def), ctx.people.list (burning, posture, vehicleId), ctx.world.heightAt / raycast / buildingHeightAt, ctx.env.state (soleil, daylight, vent, rain, streetLights), ctx.player.state, ctx.settings.values.violence, ctx.session.phase, ctx.clock.timeScale. Seule écriture hors de lui : 'vehiclesRender'.ownFire.

SERVICES FACULTATIFS (formes minimales déclarées localement ; absents = effet omis)
- 'hazards.field' : collectActiveCells / forEachActiveCell, fires, driftX / driftZ, cellSize, revision. Sans lui : pas de nuage ni de nappe de feu, le reste fonctionne.
- 'render.lights' : point() pour les foyers (au plus budget.sceneLights lumières persistantes, réattribuées avec un fondu), flash() pour les éclairs. Sans lui : lueurs au sol et éclairage des fumées seulement.
- 'render.base' : sun et hemisphere pour accorder l'éclairage des particules ; sinon recherche d'une DirectionalLight et d'une HemisphereLight dans view.scene ; sinon estimation d'après env.daylight.
- 'vehiclesRender' : ownFire ; s'il est présent, pas de lumière de scène en double pour les véhicules en feu.
- 'props.ext' : propView(prop).battery (un vélo sans batterie brûle comme un deux-roues).

ÉVÉNEMENTS ÉCOUTÉS : 'fx', 'explosion', 'projectile:impact' (file de 512, jouée une fois par image). Aucun événement émis.
Lecture des champs de 'fx' : gaz / fumee / poudre → gerbe ronde de rayon size, ou cône de portée size si une direction est donnée ; feu → embrasement bref (les feux durables viennent de burning et de fires) ; etincelles (size, color) ; explosion (size = rayon) ; flash (size, color, seconds) ; eclats_verre, debris, poussiere, impact (size) ; jet_eau (x, y, z = buse, dir, size = portée HORIZONTALE, seconds = validité) ; eclaboussure (size) ; traceur (dir, size = longueur, seconds) ; feu_artifice : seconds < 3 → bouquet de rayon ≈ size, seconds ≥ 3 → étoile suspendue qui éclaire (fusée rouge) ; peinture / tag (color ; sur la façade voisine si y > sol + 0,35 m, sinon au sol) ; sang (dir) seulement en violence 'realiste' ; trace_brulure (size).
'explosion' : secousse = shakeFor(kind, radius, distance) (véhicule 0,95 jusqu'à 70 m, gm2l 0,75 / 50 m, désencerclement 0,6 / 38 m, mortier 0,3 / 26 m, molotov 0,14, ouverture d'une lacrymogène 0,07, fusée 0), onde, éclair, bitume noirci. Les visuels principaux viennent de l'événement fx 'explosion' émis par les modules de simulation.
Couleur d'un mortier ou d'un fumigène : lue dans Projectile.data.color si c'est un nombre (lecture défensive), sinon jaune / rouge.

BUDGETS (src/render/fx/budget.ts) — quads max / particules / bouffées / flammes / décalques / projectiles / lumières du shader / multiplicateur d'émission
bas 900 / 420 / 300 / 56 / 96 / 160 / 4 / 0,32 (atlas 64 px, cellules de 4 m, une couche) ; moyen 2 600 / 1 300 / 900 / 150 / 200 / 300 / 6 / 0,62 ; haut 5 200 / 2 600 / 1 800 / 280 / 320 / 450 / 8 / 1 ; ultra 9 000 / 4 500 / 3 200 / 400 / 480 / 600 / 8 / 1,4.

CONVERSION CONCENTRATION → OPACITÉ (density.ts) : 1 − exp(−σ·(c − 0,015)·L), σ gaz = 0,85, σ fumée = 0,9 par mètre, une bouffée plafonnée à 0,66 ; hauteur du nuage 2 à 5 m.

BANC D'ESSAI : /harness/fx.html?scene=gaz|feu|salve|mortier|jet|barricade|divers|dessus|reel &nuit=1 &qualite=bas|moyen|haut|ultra &t=secondes &vent=x,z &cam=x,y,z,cx,cy,cz &fige=1 &aide=0. API window.__fx : advance(s), draw(), info(), measure(), series(), camera(), emit().
TEST : `node tests/e2e/fx.mjs [filtre]` (captures dans tests/e2e/out/fx-*.png ; échoue si le module dépasse 14 appels de dessin, perd un événement, ou si le 99e centile du coût pendant la salve dépasse 8 ms).

## Mesures

Mesures prises dans Chromium headless (WebGL logiciel), machine à 4 cœurs très chargée (charge moyenne 13 à 22).

APPELS DE DESSIN DU MODULE (différence de renderer.info avec et sans le groupe « fx ») : gaz 2, feu 2, salve 2, mortier 1, jet 2, barricade 3, vue de dessus avec un feu 3, intégration réelle 3. Maximum possible : 3 (budget demandé : 14).

TRIANGLES ET QUADS (qualité « haut » sauf mention)
- rue remplie de gaz, 30 palets : 782 à 1 113 quads, 8 284 à 8 946 triangles (dont 6 840 pour les 30 palets : la géométrie réunie des projectiles fait 228 triangles par instance, presque tous dégénérés par la sélection de forme)
- même scène en « bas », fenêtre de téléphone 844 × 390 : 80 quads, 6 880 triangles
- poubelles, conteneur, voiture et boutique en feu : 553 quads, 1 120 triangles, 19 flammes, 232 particules
- barricade embrasée de nuit : 425 quads, 1 528 triangles
- salve de 30 grenades (180 palets) : 994 à 1 195 quads, ≈ 42 700 triangles dont ≈ 41 000 dégénérés (projectiles) ; en « bas » 139 quads
- champ réel (sim/hazards) : 476 cellules → 398 bouffées, 1 252 quads

COÛT CPU de frame() (performance.now autour du module seul)
- scènes de gaz et de feu : médiane 0,1 ms ; moyenne 0,13 à 0,28 ms ; 95e centile 0,2 à 0,7 ms
- SALVE DE 30 GRENADES, minimum image par image de 3 exécutions de la même scène déterministe (421 images, de t = 0 à 14 s), deux séries : « haut » moyenne 0,16 / 0,19 ms, médiane 0,1, p95 0,4, p99 0,9 / 1,0, maximum 2,7 / 3,0 ms, aucune image au-dessus de 4 ms ; « bas » moyenne 0,08 / 0,10 ms, p95 0,3, p99 0,5 / 0,9, maximum 4,1 / 4,8 ms (une seule image au-dessus de 4 ms, la première : compilation à la volée)
- maxima BRUTS d'une exécution isolée : 4 à 106 ms selon les scènes et les exécutions, jamais à la même image d'une exécution à l'autre (jet : 14,1 ms à l'image 150 puis 22,3 ms à l'image 174 ; un 190 ms observé une fois, non reproduit). Je les attribue à la charge de la machine et au ramasse-miettes de la page, sans pouvoir le prouver autrement que par le minimum de trois exécutions.
- avant correction, la salve montait à 2 166 particules (fumée des palets) et 1,8 ms en moyenne brute ; l'émission des palets est maintenant partagée (≈ 0,12 par palet quand il y en a 180), d'où ≈ 1 000 quads.

NON MESURÉ : le coût GPU (recouvrement des grandes bouffées), les images par seconde, un vrai téléphone, le temps de construction des atlas au démarrage.

TESTS : 47 tests unitaires sur 5 fichiers (≈ 4,6 s). E2E complet : ≈ 4 minutes, 26 captures.
VOLUME : 17 fichiers source (≈ 4 300 lignes, le plus long 568), banc d'essai 899 lignes, 752 lignes de tests unitaires.

## Non fait / fragile

- Non branché dans src/main.ts (réservé à l'intégrateur) : le module n'a jamais tourné dans le jeu assemblé
- Jamais exécuté avec le VRAI rendu de base : le banc d'essai crée son renderer et une réserve de lumières factice de même forme. Les chemins 'render.lights' réel et 'render.base' (sun / hemisphere) ne sont donc pas exécutés ; seul le repli par recherche des lumières dans la scène l'est
- Jamais exécuté avec le vrai rendu des véhicules ('vehiclesRender'.ownFire est mis à false par mon module : à confirmer par l'intégrateur), ni avec le vrai module du décor ('props.ext', barricades réelles), ni avec le vrai jet du canon à eau : le banc émet à la main les mêmes événements que src/sim/vehicles
- Pas de particules « douces » par profondeur : les bouffées se fondent au sol, mais coupent net les façades, les véhicules et les personnages qu'elles traversent
- Le tri se fait sur le centre des quads : deux grandes bouffées voisines peuvent s'inverser quand la caméra tourne ; des sauts de niveau de détail sont possibles aux seuils de 45, 110 et 220 m et quand la surcharge change
- Le shader des particules et des décalques ignore la matrice du groupe view.world : il suppose ce groupe non transformé (c'est le cas dans src/render/base aujourd'hui)
- Les fumées ne connaissent que 4 à 8 lumières (feux, éclairs, fusée, gyrophares) : les candélabres ne les éclairent pas un à un, une lueur chaude uniforme les remplace quand env.streetLights est vrai. Le rythme des éclats de gyrophare vus dans la fumée est le mien, pas celui du rendu des véhicules
- Jet d'eau : l'arc est déduit de la buse, de la direction et de la portée horizontale ; les trois modes (droit, diffus, pluie) ne sont pas distingués faute d'information dans l'événement, et un jet arrêté en montée par un mur prend une vitesse nominale. Le jet reste plus grêle qu'une vraie lance de canon à eau
- Les éclats, gouttes et étincelles ne rebondissent que sur le sol (heightAt), pas sur les murs ni les objets
- Décalques muraux : vérifiés avec une vitrine du magasin du cœur et un monde factice du banc d'essai, PAS avec le vrai module du monde ; un décalque est un quad plat qui peut dépasser d'une arête ou d'une bordure de trottoir ; ils sont perdus au changement de qualité et à chaque session
- Flammes en quads dressés : correctes de face, simples taches en vue plongeante. Les volutes hautes des panaches gardent un aspect un peu « chou-fleur »
- Rougeoiement des carcasses : seulement pour un feu que le module a vu brûler (une carcasse déjà calcinée au début d'une session ne rougeoie pas) ; quasi invisible de jour
- La balle de l'arme de service n'a pas de corps : elle n'existe que par l'effet 'traceur'. Balle de défense, plots et traceur sont codés mais n'apparaissent dans aucune capture regardée (le traceur de la scène « divers » était déjà éteint à l'instant capturé)
- Les corps des projectiles sont grossis jusqu'à × 5 avec la distance pour rester lisibles : ce n'est pas leur taille réelle
- Qualité « bas » : vérifiée seulement dans Chromium headless à la taille d'un téléphone ; aucun essai sur un vrai téléphone, coût GPU non mesuré
- La pluie n'agit pas sur les particules (seulement sur la durée des flaques) ; la fumée ne dépose pas de suie hors des devantures de boutiques en feu
- Mesures de temps prises sur une machine saturée : les maxima bruts (jusqu'à 106 ms) ne sont pas reproductibles et je ne peux les écarter que par le minimum de trois exécutions
- harness/fx.ts fait 899 lignes (un seul fichier m'était attribué pour le banc d'essai)
- Aucun commit effectué : ce n'était pas demandé

## Demandes d'évolution du contrat

- Projectile : ajouter un champ color?: number (étoile du mortier, fumigène, peinture). Aujourd'hui la couleur est rangée dans Projectile.data, opaque par contrat ; je la lis de façon défensive (data.color si c'est un nombre)
- Événement fx 'jet_eau' : préciser dans le contrat que size est la portée HORIZONTALE jusqu'à l'impact et seconds la durée de validité, et ajouter le mode du jet (droit, diffus, pluie) et si possible le point d'impact — le rendu doit sinon les deviner
- Événement fx 'feu' : préciser sa sémantique. Je le traite comme un embrasement BREF (les feux durables viennent de burning et de fires) ; sim/people l'émet en continu pour une personne en feu et sim/props à l'allumage, ce qui convient à cette lecture
- 'explosion' et fx 'explosion' sont émis ensemble par sim/items et sim/vehicles : écrire qui dessine quoi. Répartition retenue : fx = visuels (boule de feu, poussière, éclats), 'explosion' = secousse de caméra, onde au sol, éclair, bitume noirci
- Faire entrer dans contracts.ts (ou extensions.ts) le type du service 'hazards.field' et celui de 'render.lights' : je les redéclare par leur forme minimale pour n'importer aucun module
- ViewApi : exposer la lumière du soleil et du ciel (couleur × intensité), ou officialiser 'render.base' / 'render.uniforms', pour que les particules s'accordent à la scène sans chercher les lumières dans la scène
- Vehicle : exposer la phase des éclats de gyrophare (ou un événement) pour que les fumées bleuissent au même instant que les optiques
- Prop : drapeau battery (aujourd'hui seulement dans 'props.ext'.propView) pour distinguer un feu de batterie
- 'vehiclesRender'.ownFire : désigner dans la documentation d'intégration qui dessine les véhicules en feu ; mon module le met à false au démarrage (réglable par FxRenderApi.vehicleFire)
- ViewApi.world : écrire que ce groupe n'est jamais transformé (origine flottante exclue), ou fournir sa matrice ; mes shaders en dépendent

## Vérifications exécutées

- npx tsc --noEmit (dépôt entier) : 0 erreur ; même vérification avec --noUnusedLocals --noUnusedParameters sur src/render/fx et harness/fx.ts (tsconfig temporaire, le banc d'essai n'étant pas dans l'include du projet) : 0 erreur
- npx vitest run tests/unit/fx. : 5 fichiers, 47 tests verts (réserve de particules : capacité, compaction, recyclage par priorité, intégration, pause ; tri de transparence stable ; plafonds par qualité et régulation de la surcharge sans oscillation ; conversion concentration → opacité avec la propriété de Beer-Lambert ; secousse de caméra ; file des décalques : plafond, rang, pâlissement, durée de vie, fusion ; file d'événements ; atlas déterministe à bords nuls ; vitesse du jet ; lecture défensive de la couleur d'un projectile)
- Test unitaire : le module branché en headless reste inerte sous 6 000 événements, frame() / reset() / dispose() appelés sans vue ne lèvent rien, et il ne consomme jamais ctx.rng (même tirage avec et sans le module)
- node tests/e2e/fx.mjs (suite complète, deux fois) : [fx] OK, code 0, aucune erreur de page ni console.error, 0 événement perdu, 1 à 3 appels de dessin par scène
- Captures regardées avec Read et corrigées par itérations : fx-gaz-jour, fx-gaz-rue, fx-gaz-travers (rue remplie de gaz, vent latéral), fx-gaz-nuit (nuage bleui par le gyrophare puis teinté par l'éclairage public), fx-gaz-dessus, fx-gaz-bas-telephone, fx-feu-jour et fx-feu-nuit (poubelles, conteneur, voiture, boutique), fx-salve et fx-salve-palets, fx-mortier-bouquets, fx-mortier-fusee, fx-jet et fx-jet-eteint, fx-braises-nuit (carcasse qui rougeoie), fx-barricade-nuit et fx-barricade-jour (batterie de trottinette, engin incendiaire en vol), fx-divers et fx-divers-apres (explosion, onde, personne en feu, tags et peinture sur la façade, flaque, débris, sang, bouquet), fx-reel et fx-reel-nuage
- Scène « reel » : vrais modules src/sim/hazards et src/sim/items chargés par import dynamique dans le banc d'essai — 5 grenades de 56 mm réelles, fumigène, engin incendiaire, mortier, pavé, assourdissante, ctx.hazards.ignite ; le vrai service 'hazards.field' donne 476 cellules et 398 bouffées, 2 foyers, 5 décalques, 2 secousses de caméra, sans erreur
- Mesure du coût pendant la salve par minimum de trois exécutions (voir metrics) ; relance de la scène « jet » deux fois pour constater que les pics isolés ne tombent pas aux mêmes images
- Chemin de repli forEachActiveCell : écrit mais NON exécuté (le champ factice et le champ réel exposent tous deux collectActiveCells)
- git status : seuls mes fichiers (src/render/fx, harness/fx.*, tests/e2e/fx.mjs, tests/unit/fx.*) sont créés ou modifiés par moi ; contracts.ts et extensions.ts intacts

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/render/fx/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/api.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/system.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/core.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/budget.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/density.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/pool.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/particles.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/decalQueue.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/decalAtlas.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/decalLayer.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/atlas.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/spriteShader.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/spriteLayer.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/cloud.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/fire.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/water.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/projectiles.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/effects.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/events.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/lights.ts
- /home/user/SafeDeal/crs-simulation/src/render/fx/mathx.ts
- /home/user/SafeDeal/crs-simulation/harness/fx.html
- /home/user/SafeDeal/crs-simulation/harness/fx.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/fx.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/fx.pool.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/fx.budget.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/fx.density.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/fx.decals.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/fx.system.test.ts
