# Compte rendu — véhicules:modèles-3d

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module « rendu des véhicules » livré et exécuté : 28 fichiers sous src/render/vehicles (environ 8 200 lignes avec le banc d'essai et les tests), aucun fichier d'un autre module modifié, contracts.ts et extensions.ts intacts, aucune dépendance installée, aucun commit de ma part.

État final vérifié à l'instant : `npx tsc --noEmit` sort sans erreur, les 68 tests unitaires du module sont verts, la suite e2e par défaut se termine par « [vehicles] OK ».

Ce qui existe, exigence par exigence :
1. **Système VIEW** : `createSystems` dans `src/render/vehicles/index.ts` crée `VehiclesRenderSystem` (id `render.vehicles`, ordre `SystemOrder.VIEW`). Il lit `ctx.vehicles.list` à chaque image : position, cap, tangage, roulis, roues qui tournent et braquent, tourelles, dégâts, portes, couleur, plaque.
2. **Modèles** : les 21 VehicleKind ont un modèle procédural construit à la longueur et à la largeur exactes du VehicleDef, avec livrées et textes sur canvas (POLICE, GENDARMERIE, SAPEURS-POMPIERS, SAMU, AMBULANCE, TAXI, girouette de bus, banderole du camion sono). Aucune marque réelle.
3. **Feux** : trois rythmes de gyrophares (rampe à double éclat alterné, gyrophare tournant, stroboscope), phares, feux arrière, stop, recul et clignotants émissifs, halo au sol et faisceaux la nuit, éclats bleus sur les façades via le service optionnel `render.lights`.
4. **Performance** : une géométrie fusionnée et un InstancedMesh par (modèle, LOD), un seul matériau partagé, couleur par instance, LOD proche/loin avec hystérésis. 150 véhicules civils tiennent en 11 appels de dessin et environ 30 000 triangles.
5. **Vues embarquées** : `vehicle_int` avec montants, capot, volant qui tourne, tableau de bord fonctionnel sur canvas et grille de pare-brise vue de l'intérieur sur les véhicules de police ; `turret` avec réticule et écran de visée, pour le lance-grenades et pour le canon à eau.
6. **Banc d'essai et captures** : `harness/vehicles.html` et `tests/e2e/vehicles.mjs` ; 79 captures dans tests/e2e/out, regardées et corrigées en plusieurs passes.
7. **Tests unitaires** de la logique pure : repères, rythme des gyrophares, LOD, tableau de bord, modèles.

Le module fonctionne avec ou sans les services optionnels (`render.lights`, `vehicles.ext`) et avec ou sans `ctx.view` (aucun rendu créé en mode sans affichage).

Les réserves sont détaillées dans « notDone ». Les trois principales : le module n'est pas branché dans `src/main.ts` (travail de l'intégrateur), rien n'a tourné sur un vrai GPU ni sur téléphone, et la hauteur de certains modèles dépasse `def.height` à cause des équipements de toit.

## API publique et mode d'emploi

**Branchement**
`import { createSystems } from '@/render/vehicles/index'` (ModuleFactory). Il retourne un seul GameSystem, id `render.vehicles`, `order = SystemOrder.VIEW`. Le rendu est créé paresseusement dès que `ctx.view` existe ; sans vue, le système ne fait rien. Les modèles proche et loin sont préconstruits pour tous les `ctx.vehicles.defs`. Le module n'est pas encore ajouté dans `src/main.ts`.

**Service fourni** : `ctx.service<VehiclesRenderApi>('vehiclesRender')` (constante `VEHICLES_RENDER_KEY`), publié dans `provide()`.
- `stats` : `{ near, far, hidden, drawCalls, triangles, fx, cpuMs, cpuMsAvg, models }`
- `setDoor(vehicleId, door, open)` : force une porte.
- `pulseDoor(vehicleId, door, seconds?)` : ouvre puis referme.
- `seatEye(v, seat, out): boolean` : position monde des yeux d'un siège (siège + 0,68 m, bornée à hauteur − 0,14 m).
- `turretMuzzle(v, turret, outPos, outDir): boolean` : bouche et direction monde d'une tourelle.
- `ownFire: boolean` : le module dessine ses propres flammes et fumées ; à passer à false si un module d'effets s'en charge.
- `invalidate()` : reconstruit tout (changement de defs ou de qualité).
- Indices de porte : 0 avant gauche, 1 avant droite, 2 arrière, 3 latérale droite.

**Services optionnels consommés** (en `import type`, le module marche sans eux)
- `'render.lights'` (`RenderLightsApi` de `@/render/base/api`) : `pulse(x, y, z, couleur, intensité, rayon)` à chaque image pour les gyrophares (18 cd) et les véhicules en feu (150 cd), au plus 24 par image et à moins de 130 m ; `spot()` pour les phares du véhicule du joueur (150 cd, portée 60 m).
- `'vehicles.ext'` (`VehiclesExtApi` de `@/sim/vehicles/api`) : `doorOpen(v, seat)` et `turretOfSeat(v, seat)`. Sans lui, les portes s'ouvrent brièvement sur les événements d'entrée et de sortie, et la n-ième place de tireur sert la n-ième tourelle.

**Événements écoutés** : `vehicle:removed`, `vehicle:entered`, `vehicle:exited`. Aucun événement émis.

**Conventions appliquées** (identiques à celles du rig de caméra de base)
- Repère véhicule : x à droite, y en haut, z vers l'avant ; avant monde = (sin cap, cos cap), droite = (−cos cap, sin cap).
- Tangage positif = nez levé ; roulis positif = penché à droite ; `steerAngle` positif = à droite.
- `turretYaw` positif = à droite, `turretPitch` positif = vers le haut ; le (x, y, z) d'un TurretDef est l'axe du tourillon.

**Champs de `Vehicle` lus** : `x, y, z, heading, pitch, roll, speed, steerAngle, rpm, gear, engineOn, lights, beacons, siren, indicators, braking, turrets[], damage, burning, color, plate, dormant, seats`.

**Autres exports**
- `REFERENCE_DEFS`, `referenceDef(kind)`, `CIVIL_COLORS` : 21 fiches de véhicules recopiées sur la simulation, pour bancs d'essai et tests.
- Types `VehiclesRenderApi`, `VehiclesRenderStats` ; classe `VehiclesRenderer`.
- Réglages par qualité dans `VEHICLE_QUALITY` de `lod.ts` (bas / moyen / haut / ultra).

**Banc d'essai** : `harness/vehicles.html?view=…`
- `alignement` (`page=1..5`, `cam=trois-quarts|face|profil|dessus`, `nuit=1`, `etat=`, `loin=1`)
- `fiche`, `etats`, `interieur`, `tourelle`, `parc` (150 véhicules)
- `jeu` : contrôle d'intégration avec les vrais modules rendu de base et simulation des véhicules (`cam=int|ext|tourelle`)
- `mesure=N` : mesure CPU sur N images.

**Suite e2e** : `node tests/e2e/vehicles.mjs [filtre | fiche- | tout | libre "<requête>"]`. Elle échoue si le module dépasse 60 appels de dessin, affiche moins de 60 véhicules dans le parc, ou si la médiane CPU dépasse 2 ms.

## Mesures

Mesures prises dans Chromium sans écran (rendu logiciel SwiftShader) sur une machine chargée. Les temps CPU sont ceux de la fonction `frame` du module seul, sans le rendu.

**Parc de 150 véhicules civils**
| Cas | Appels de dessin | Triangles | CPU médiane | CPU moyenne | p95 | max |
|---|---|---|---|---|---|---|
| Qualité haute, jour | 11 | 30 008 | 0,100 ms | 0,117 ms | 0,300 ms | 1,700 ms |
| Qualité haute, nuit (670 quads d'effets) | 11 | 30 916 | 0,100 ms | 0,168 ms | 0,4 ms | 2,7 ms |
| Qualité basse | 9 | 22 366 | 0,1 ms | 0,078 ms | non relevé | non relevé |

- Croissance du tas sur 600 images : 0 octet par image (mesure grossière).
- Capture rendue du parc : 11 appels pour le module (14 pour toute la scène), 29 208 triangles, 3 véhicules proches, 142 lointains, 5 hors champ ; médiane CPU 0,40 ms avec le rendu en cours.
- Vue de jeu intégrée : 6 à 7 appels pour le module, 0,1 à 0,5 ms par image.
- Pire cas théorique : 21 types × 2 LOD + 1 couche d'effets + 2 pour le cockpit + 1 pour la tourelle = 46 appels (hors passe d'ombre des véhicules proches), sous le plafond de 60.

**Mesures hors navigateur (Node)**
- Construction des 42 modèles (21 × 2 LOD) : 63,5 ms, 37 882 triangles, 5,46 Mo de tampons.
- Calculs purs par image pour 150 véhicules (matrices, LOD, roues, feux, compactage) : 19,7 µs.

**Triangles par modèle (détaillé / lointain)**
Plafonds demandés : 6 000 en détaillé, 12 000 pour le Centaure et le canon à eau, 300 en lointain. Tous sont respectés.
| Modèle | Détaillé | Lointain |
|---|---|---|
| fourgon_crs | 1 720 | 208 |
| car_crs | 1 396 | 188 |
| vl_commandement | 1 634 | 208 |
| voiture_police | 1 516 | 200 |
| fourgon_cellulaire | 1 722 | 208 |
| centaure | 2 714 | 294 |
| canon_eau | 3 354 | 298 |
| moto_bravm | 1 658 | 188 |
| camion_pompiers | 2 070 | 260 |
| ambulance | 1 614 | 230 |
| voiture | 1 406 | 176 |
| citadine | 1 342 | 170 |
| suv | 1 414 | 170 |
| taxi | 1 434 | 188 |
| utilitaire | 1 362 | 174 |
| camion | 1 530 | 182 |
| bus | 1 302 | 162 |
| scooter | 1 252 | 152 |
| camion_sono | 1 690 | 268 |
| drone | 482 | 230 |
| helicoptere | 864 | 252 |

**Textures** : un atlas 2048×1024 (1024 de large en qualité basse) et une texture de plaques 1024×256.

## Non fait / fragile

- Le module n'est pas branché dans `src/main.ts` (fichier de l'intégrateur) : l'intégration n'a été contrôlée que par le banc `view=jeu`.
- Aucun essai sur un vrai GPU ni sur téléphone : toutes les mesures viennent de Chromium sans écran en rendu logiciel, sur une machine chargée. Les temps GPU réels sont inconnus.
- Les intensités des feux, des halos et des éclats ont été réglées dans le banc d'essai ; elles seront à reprendre sous l'exposition du rendu de base.
- La hauteur de plusieurs modèles dépasse `def.height` là où il y a des équipements de toit (antennes, rampe lumineuse, lance du camion de pompiers dont le tourillon est à 2,95 m pour une hauteur déclarée de 2,9 m). Le rotor de l'hélicoptère dépasse aussi la largeur et la longueur déclarées. Seules la longueur et la largeur de caisse sont exactes.
- Vitrages opaques : les occupants ne sont visibles que sur les deux-roues.
- La passe d'ombre utilise la pose de repos : pas d'animation des pièces dans l'ombre, et les découpes (grilles) y sont pleines.
- Seules les deux premières tourelles d'un véhicule sont animées ; le déploiement télescopique du mât caméra (`TurretStatus.mast`) n'est pas rendu.
- Les clignotants n'ont pas de halo ; le rotor présente un effet stroboscopique à certaines vitesses.
- Les dégâts sont une déformation douce de la caisse, des vitres brisées, de la suie et une carbonisation : aucune pièce ne se détache.
- Les plaques ne sont lisibles qu'au LOD proche (64 emplacements recyclés) ; les roues du LOD lointain sont des hexagones.
- Quand une réserve d'instances grandit, les anciens tampons GPU ne sont libérés qu'à la destruction du rendu.
- Les flammes et fumées du module peuvent faire doublon avec un futur module d'effets : prévoir `ownFire = false` dans ce cas.
- L'origine du drone diffère de quelques centimètres du décalage de caméra utilisé par la simulation.
- Le jeu e2e par défaut ne capture que 3 fiches sur 21 ; les 21 ne sortent qu'avec le filtre `fiche-` ou `tout`.
- La mesure d'allocation repose sur `performance.memory`, qui est grossière : « zéro allocation » est établi par la lecture du code et par une croissance du tas nulle sur 600 images, pas par un profileur.

## Demandes d'évolution du contrat

- L'état des portes n'existe pas dans `Vehicle` : je le lis par le service optionnel `vehicles.ext` (`doorOpen`) ou, à défaut, je le déduis des événements d'entrée et de sortie. Un champ ou une méthode au contrat serait plus sûr.
- Écrire dans le contrat les conventions de signe de `pitch`, `roll`, `steerAngle`, `turretYaw` et `turretPitch`, et préciser que le (x, y, z) d'un TurretDef est l'axe du tourillon. Aujourd'hui je m'aligne sur le rig de caméra de base, qui les note lui-même comme une hypothèse.
- Préciser l'unité de `Vehicle.rpm` (je suppose des tours par minute, zone rouge à 6 000).
- Ajouter les clés `render.lights` et `vehicles.ext` à `EXT` dans extensions.ts, ainsi que `vehiclesRender` pour ce module.
- Partager une constante pour la hauteur des yeux assis (0,68 m au-dessus du siège) entre la caméra de base et le cockpit : elle est aujourd'hui dupliquée dans `cameraMath.ts` et dans mon `frame.ts`.
- L'état du mât (`TurretStatus.mast`) n'est pas au contrat : je ne peux pas le rendre sans dépendre d'un autre module.
- Préciser ce que vaut `Vehicle.y` pour les engins volants (altitude du centre, du patin, ou du point caméra).

## Vérifications exécutées

- `npx tsc --noEmit` relancé en fin de tâche : aucune erreur sur tout le dépôt. Le banc d'essai `harness/vehicles.ts` a été vérifié à part avec un tsconfig temporaire : 0 erreur.
- `npx vitest run tests/unit/vehicles-render` relancé en fin de tâche : 4 fichiers, 68 tests verts (repères et matrices, rythme des gyrophares et clignotants, LOD et hystérésis, logique du tableau de bord, 21 modèles dans leurs budgets, dimensions exactes, roues au sol, aucune face inversée, système complet sur un contexte factice).
- Suite unitaire entière du dépôt : 189 fichiers, 2 504 tests passés, 5 marqués todo (aucun dans mes fichiers).
- `node tests/e2e/vehicles.mjs` (jeu par défaut, Chromium sans écran, rendu logiciel SwiftShader) : « [vehicles] OK », aucune erreur de page ; `node tests/e2e/vehicles.mjs profil` : OK.
- Captures regardées et corrigées : alignements pages 1 à 5 en trois-quarts, page 2 de face, pages 2 et 4 de profil, nuit pages 1 à 3, LOD lointain page 2, états de dégâts (voiture, fourgon), intérieurs (fourgon de jour, de nuit et tableau de bord, voiture de police, Centaure, moto), écrans de tourelle (Centaure, canon à eau), parc de 150 véhicules de jour et de nuit.
- Les 21 fiches ont toutes été regardées une fois, mais avant l'adaptation aux fiches réelles de la simulation ; après cette adaptation, seules celles du Centaure, du canon à eau et du camion de pompiers ont été refaites et revues.
- Intégration réelle contrôlée par le banc `view=jeu`, qui charge les vrais modules `@/render/base` et `@/sim/vehicles` : vue intérieure, vue tourelle et vue extérieure de nuit rendues sans erreur, 6 à 7 appels de dessin pour le module.
- Un test temporaire (supprimé ensuite) a confronté les modèles, les positions d'yeux et `REFERENCE_DEFS` aux fiches réelles de `createVehicleDefs()` de la simulation : cohérents.
- Aucun marqueur « TODO » ni « FIXME » dans mes fichiers (recherche faite en fin de tâche).
- Mesures de performance relevées (détail dans « metrics ») : 11 appels de dessin et environ 30 000 triangles pour 150 véhicules, médiane CPU 0,1 ms par image, croissance du tas nulle sur 600 images.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/render/vehicles/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/api.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/renderer.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/frame.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/beacons.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/lod.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/dashlogic.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/dashboard.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/cockpit.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/turretview.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/geo.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/kit.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/kit-equip.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/palette.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/atlas-layout.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/atlas.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/material.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/pool.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/fx.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/refdefs.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/types.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/cars.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/vans.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/coach.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/trucks.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/special.ts
- /home/user/SafeDeal/crs-simulation/src/render/vehicles/models/light.ts
- /home/user/SafeDeal/crs-simulation/harness/vehicles.html
- /home/user/SafeDeal/crs-simulation/harness/vehicles.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/vehicles.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles-render.frame.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles-render.lights.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles-render.models.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles-render.system.test.ts
