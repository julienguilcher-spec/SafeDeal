# Compte rendu — simu:gaz-feu

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module des dangers diffus écrit, exécuté et testé : `npx vitest run tests/unit/hazards` passe (6 fichiers, 53 tests) et `npx tsc --noEmit` ne signale rien dans mes fichiers (3 erreurs ailleurs dans le projet).

**Ce qui est en place**
- **Champ de gaz et de fumée** : grille creuse en blocs de 16 × 16 cellules de 2 m, alloués à la demande, libérés après 2 s sous le seuil, puis réutilisés depuis une réserve. Plafond de 768 blocs.
- **Transport** : advection par le vent × 0,8 avec rafales et sautes lentes dérivées de `ctx.rng`, diffusion, dilution accélérée par le vent et la pluie. Le champ avance à 10 Hz en trois tâches décalées (fumée, entretien, gaz) ; par grand vent, des sous-pas sont répartis sur les pas du moteur.
- **Bâti** : cellules infranchissables lues une fois par cellule via `ctx.world.buildingHeightAt > 0`, cache invalidé sur `world:tile_loaded`, `world:tile_unloaded` et `world:source`.
- **Rues-canyons** : chaque cellule libre reçoit un axe de rue (8 axes, portée 32 m). Le vent d'enfilade passe à 75 % dans une rue étroite ; le vent de travers est coupé sous 20 m de large et passe librement à 66 m. Contre une façade, 70 % du gaz s'envole au lieu de s'entasser.
- **Fumée** : champ séparé, couleur transportée et mélangée (incendie `0x141414`, fumigène de la couleur demandée).
- **Feux** : nappes avec embrasement, combustion, extinction progressive, fusion des `ignite` voisins, pluie, fumée noire, `fireAt`.
- **`douse`** : abat les feux (reprise si l'arrosage est insuffisant), rabat gaz et fumée, dégage de la vapeur, mouille les personnes, émet `hazards:douse`.
- **`visibility`**, **`clear`**, **`reset`** et le service de lecture `hazards.field`.

**Comportement mesuré** (avec les valeurs actuelles du module des objets : 0,25 par seconde et par palet, rayon 2,5 m)
- Grenade à six palets par air calme : 796 m² au-dessus de 0,1 après 30 s (le dossier donne ≈ 800 m²), 0,48 au contact d'un palet. Sous 0,05 à +71 s, sous 0,02 à +111 s.
- Pluie : 35,5 s au lieu de 71 s.
- Vent de 18 km/h : pic 0,12, sous 0,05 à +7 s, sous 0,02 à +25,5 s. Cela reste sous le seuil de toux du module des personnes (0,35) : le gaz devient inopérant par vent soutenu.
- Dérive : 48,0 m en 20 s par vent de 3 m/s, soit exactement vent × 0,8.
- Retour de gaz : une bouffée lâchée 40 m au vent passe sur la ligne entre 10,5 et 13,5 s (attendu 12,5 s).
- Rue de 10 m, vent de travers de 4 m/s : barycentre à 0,2 m du palet 30 s après l'émission, maximum 0,138 contre 0,010 en terrain dégagé.
- Rue de 10 m sans vent : durée × 1,7 et concentration × 1,8 à +30 s.
- Canalisation : 2,4 m/s dans une rue prise en enfilade par 4 m/s, y compris dans une rue à 45°.
- Feu : 32 à 40,5 s à pleine intensité sur six graines ; flaque de 1,25 m éteinte en 2,5 s d'extincteur.

**Alignement avec les modules voisins** (constaté en lisant leur code, sans les importer)
- Le module des objets émet déjà à 0,25 par seconde par palet et arrose à 1 par seconde pour l'extincteur : mes unités coïncident.
- Le module des véhicules écoute déjà `hazards:douse` avec la même charge utile.
- `src/ui/maps` lit déjà `hazards.field` avec la même signature.
- Trois ajustements en conséquence : pas d'effet `feu` à l'allumage (les objets l'émettent déjà), `douse` mouille les personnes sans toucher à `burning`, et le dépôt est linéaire jusqu'à la concentration 1.

## API publique et mode d'emploi

**Branchement**
- `import { createSystems } from '@/sim/hazards'` ; variante avec réglages : `createHazardSystems(partialTuning)`.
- Un seul système, id `sim:hazards`, ordre `SystemOrder.HAZARDS`.
- `provide()` pose `ctx.hazards` et `ctx.provide('hazards.field', vue)`.

**`ctx.hazards` (HazardApi complet)**
- `emitGas(x, z, amount, radius)` : `amount` est la concentration ajoutée au centre, profil `(1 − d²/r²)²`, masse déposée = `amount × π r² / 3` quelle que soit la position dans la grille. Rayon borné entre 2 et 30 m. Rien n'est déposé dans le bâti. Dépôt linéaire jusqu'à la concentration 1, plafond stocké 2,5.
  - Palet : 0,25 par seconde, rayon 2,5 m, pendant 30 s.
  - Nuage instantané type GM2L : `emitGas(x, z, 1.2, 5)` donne 1,0 au centre, 0,38 à 5 s, 0,14 à 15 s.
- `emitSmoke(x, z, amount, radius, color = 0x2b2b2b)` : mêmes conventions ; la couleur se transporte et se mélange. Fumigène à 0,5 par seconde : 0,92 au point après 60 s.
- `gasAt` / `smokeAt` : 0..1, interpolés, 0 dans le bâti. Repères : 0,05 perceptible, 0,1 bord du nuage, 0,5 à 0,7 près d'un palet par air calme.
- `ignite(x, z, radius, intensity, sourceId)` : durée 18 à 36 s selon l'intensité, ± 12 %, allongée au-delà de 1,5 m de rayon. Un `ignite` au même endroit ré-alimente la nappe ; 96 nappes au plus.
- `fireAt` : 0..1, plein jusqu'à 0,6 × rayon, nul à 1,1 × rayon.
- `douse(x, z, radius, amount)` : 1 unité = 1 s de jet d'extincteur. Une flaque de 1,25 m à pleine intensité demande 2,5 unités, le besoin croît comme la surface. Le feu reprend 1 s après un arrosage incomplet.
- `visibility(a, b)` : `exp(−∫)` avec 0,55 par mètre par unité de fumée et 0,14 par mètre par unité de gaz au-dessus de 0,12. Le bâti n'est pas pris en compte (utiliser `world.lineOfSight`).
- `clear()` : vide gaz, fumée et feux, garde le cache du bâti.

**Service `hazards.field`** (type `HazardFieldView`, `import type` depuis `@/sim/hazards/api`)
- `cellSize` (2), `blockSize` (32), `revision` (stable quand rien ne change).
- `forEachActiveCell(cb(x, z, gaz, fumée, couleur), minDensity = 0.01, cx?, cz?, radius?)` : retourne le nombre de cellules ; valeurs non bornées à 1.
- `collectActiveCells(out: Float32Array, min?, cx?, cz?, radius?)` : même parcours sans rappel, 5 nombres par cellule (`CELL_RECORD`). À préférer dans une boucle d'image.
- `fires` : tableau stable de `{ id, x, z, radius, intensity, age, sourceId }`.
- `driftX`, `driftZ`, `driftAt(x, z, out)` : dérive générale et dérive locale canalisée, utiles pour faire dériver des particules.
- `totalGas()`, `totalSmoke()`, `stats` (blocs, blocs de fumée, réserve, cache de bâti, sous-pas, feux, masses).

**Événements émis**
- `fire:started` et `fire:out` avec `targetKind: 'ground'`, `targetId: 0`.
- `fx` : `trace_brulure` à l'allumage, `etincelles` pendant la combustion (5 par seconde au plus).
- Événement libre `hazards:douse` `{ x, z, radius, amount }` à chaque `douse` ; l'objet est réutilisé, ne pas le conserver.
- Aucun `sfx`.

**Événements écoutés**
- `world:tile_loaded`, `world:tile_unloaded`, et l'événement libre `world:source`.

**État d'autres entités modifié**
- `Person.wet` dans `douse` : + 0,4 par unité au centre du jet. Rien d'autre.

**Constantes exportées**
- `HAZARD_FIELD_SERVICE`, `HAZARD_DOUSE_EVENT`, `CELL_RECORD`, `HAZARD_CELL_SIZE`, `HAZARD_FIELD_DT` (0,1 s), `SMOKE_FIRE_COLOR`, `DEFAULT_TUNING`, `HAZARDS_SYSTEM_ID`.
- Type `HazardTuning` : `driftFactor` 0,8 ; `diffusion` 0,7 ; `gasDecay` 1/60 ; `smokeDecay` 1/40 ; `windDecay` 0,3 ; `rainDecay` 2 ; `openMin` 20 ; `openMax` 66 ; `canyonAlong` 0,75 ; `liftOff` 0,7 ; `gust` 0,2 ; `veer` 0,2 ; `meander` 0,12 ; `fireHeat` 2,5 ; `fireSmokeRate` 0,35 ; `maxFires` 96.

**À savoir pour les autres modules**
- Seuls les immeubles du monde arrêtent le gaz : ni le mobilier, ni les véhicules, ni les grilles.
- Le module n'applique aucun effet aux personnes (exposition, brûlures) : c'est au module des personnes de lire `gasAt` et `fireAt`.
- `src/sim/hazards/testkit.ts` fournit `startHazards`, `fakeWorld`, `fieldStats` et `fieldChecksum` pour les tests.

## Mesures

Tests : 53 verts sur 6 fichiers.

| Scénario (pas de 1/30 s, appels emitGas compris) | Moyenne | p95 | Blocs |
|---|---|---|---|
| 60 émetteurs, air calme (paquet de production) | 0,065 ms | 0,12–0,18 ms | 46 |
| 60 émetteurs, vent 3 m/s (paquet de production) | 0,08–0,13 ms | 0,19–0,28 ms | 77 |
| 60 émetteurs, vent 9 m/s, 3 sous-pas (paquet de production) | 0,30–0,46 ms | 0,39–0,89 ms | 94 |
| 60 émetteurs sous vitest, terrain dégagé | 0,06–0,11 ms | 0,15–0,24 ms | 40–65 |
| 60 palets dans le quartier d'essai réel | 0,20–0,36 ms | 0,6–0,97 ms | 156 |

- Pas de champ nominal dans le quartier réel : ≈ 0,6 ms (entretien 0,18 + gaz 0,42 pour 152 blocs), une fois toutes les 0,1 s ; les autres pas coûtent ≈ 0,02 ms.
- Lectures : 31–41 ns par gasAt / smokeAt / fireAt ; visibility ≈ 0,55 µs.
- Ramasse-miettes : 0 à 1 passage par minute en régime établi.
- Machine de mesure très chargée (charge moyenne 10–14) : les maxima isolés par pas ne sont pas reproductibles.

## Non fait / fragile

- Pas de dimension verticale : le champ est une couche au ras du sol. La hauteur du nuage (3 à 5 m) est laissée au rendu, et l'envol par-dessus les toits est une simple perte.
- L'écoulement dans les rues est une heuristique (axe le plus dégagé parmi 8, portée 32 m), pas un calcul d'aérodynamique : pas de tourbillon de rue, pas de contournement actif d'un immeuble isolé.
- Un obstacle de moins de 2 m d'épaisseur peut échapper à la lecture du bâti (un échantillon au centre de chaque cellule de 2 m).
- Seuls les immeubles du monde arrêtent le gaz : barricades, véhicules et mobilier ne le bloquent pas.
- Par vent d'environ 15 km/h et plus, avec le débit actuel des palets (0,25 par seconde), la concentration plafonne à 0,12 : sous le seuil de toux du module des personnes. Si le gaz doit rester gênant par vent soutenu, il faut monter `paletGasRate` vers 0,5 ou baisser les seuils côté personnes.
- Aucun effet sur les personnes hormis `Person.wet` dans `douse` : exposition au gaz et brûlures relèvent du module des personnes.
- Les nappes de feu ne se propagent pas d'elles-mêmes au mobilier, aux véhicules ou aux vitrines ; `ignite` sur une cellule bâtie est accepté (le feu existe mais n'émet pas de fumée).
- Aucun `sfx` émis ; côté `fx`, seulement `trace_brulure` et `etincelles`. Le rendu des nuages et des flammes doit lire `hazards.field`.
- Non vérifié dans le navigateur ni avec un moteur de particules : aucun module de rendu des effets n'existe encore. La compatibilité avec `src/ui/maps/scene.ts` est constatée à la lecture de sa signature, pas exécutée.
- Non vérifié sur les données réelles de Paris : seulement le quartier d'essai, par le vrai module du monde.
- `forEachActiveCell` : le module n'alloue rien, mais V8 alloue les nombres passés à un rappel qu'il n'intègre pas (23 passages du ramasse-miettes pour 900 parcours de 27 000 cellules, mesuré). D'où `collectActiveCells`.
- Premier usage à froid : environ 20 ms répartis sur la première seconde (compilation à la volée, 3,9 ms au pire pas). S'y ajoute, hors de mon module, 26 ms au premier `buildingHeightAt` d'une tuile dans le module du monde.
- Mesures de coût prises sur une machine partagée très chargée (charge moyenne de 10 à 14) : les maxima par pas (4 à 50 ms selon les exécutions) tombent indifféremment dans l'émission, l'entretien, le gaz ou hors du module ; je les attribue à l'ordonnanceur et au ramasse-miettes du processus.
- Au-delà de 768 blocs (environ 0,79 km² de nuage), le champ cesse de s'étendre ; les refus sont comptés dans la grille mais pas exposés dans `stats`.
- Une tuile déchargée sous un nuage : le monde y répond 0, donc le gaz y circule sans bâti jusqu'au rechargement.
- Le nom de l'événement `world:source` est recopié en dur pour ne pas importer le module du monde.
- Aucun fichier dans `docs/modules/` : hors de mes fichiers.

## Demandes d'évolution du contrat

- Aucune évolution bloquante de contracts.ts : HazardApi est implémenté tel quel.
- Préciser dans les commentaires de HazardApi les unités devenues communes aux modules des objets et des véhicules : `emitGas` / `emitSmoke` amount = concentration ajoutée au centre (masse = amount × π r² / 3) ; `douse` amount = 1 par seconde de jet d'extincteur ; `ignite` = durée déduite de l'intensité (18 à 36 s), un nouvel appel au même endroit ré-alimente.
- Inscrire `hazards:douse` { x, z, radius, amount } dans GameEvents : c'est aujourd'hui un événement libre, émis par ce module et déjà écouté par le module des véhicules.
- Décider où vit le type du service `hazards.field` : `src/ui/maps/scene.ts` en a recopié la forme ; il peut l'importer en `import type` depuis `@/sim/hazards/api`, ou le type peut monter dans contracts.ts.
- Facultatif : un paramètre de durée optionnel sur `ignite`, pour les modules qui veulent un feu de sol plus long sans le ré-alimenter.
- Facultatif : inscrire `world:source` dans GameEvents, pour ne plus recopier son nom.

## Vérifications exécutées

- `npx vitest run tests/unit/hazards` : 6 fichiers, 53 tests verts, relancés plus de dix fois ; les assertions de coût portent sur la meilleure fenêtre de 100 pas pour ne pas dépendre de la charge de la machine
- `npx tsc --noEmit` : aucune erreur dans `src/sim/hazards` ni dans `tests/unit/hazards.*` (3 erreurs ailleurs dans le projet)
- Conservation de la masse, dilution coupée : plus de 99,5 % après 30 s par air calme ; 98,7 % après 15 s de dérive à 2,5 m/s ; la masse ne croît jamais
- Dépôt : masse égale à `amount × π r² / 3` à 1e-3 près pour six positions dans la grille, y compris à cheval sur quatre blocs
- Dérive : barycentre à vent × 0,8 × t pour trois directions sans turbulence ; à moins de 20 % avec rafales ; 3 sous-pas à 14 m/s avec vitesse respectée à 3 % ; dérive plafonnée à 16 m/s en tempête
- Retour de gaz : pic sur la ligne entre 10,5 et 13,5 s pour une bouffée à 40 m au vent par 4 m/s ; rien au vent des palets
- Six palets au débit du module des objets : 796 m² au-dessus de 0,1 après 30 s ; sous 0,05 à +71 s et sous 0,02 à +111 s ; pluie 35,5 s ; vent de 18 km/h 25,5 s sous 0,02
- Blocage par un immeuble (monde factice) : 0 dans l'immeuble et derrière lui, accumulation au pied de la façade au vent, aucune cellule active dans le bâti, contournement d'un mur par diffusion seule sans perte de masse
- Rue étroite (monde factice) : stagnation sous vent de travers, confinement sans vent (durée × 1,7, concentration × 1,8), canalisation en enfilade à 2,4 m/s, canalisation dans une rue à 45°
- Vrai module du monde (quartier d'essai, `tests/unit/hazards.monde.test.ts`) : aucune cellule de gaz dans le bâti réel, rien dans les cours d'îlot, stagnation dans la rue de 12 m sous vent de travers, canalisation en enfilade ; cartes du nuage imprimées et relues pour trois scénarios (carrefour, avenue de 40 m, place ronde)
- Feu : durées de 32 à 40,5 s sur six graines, extinction progressive, fusion et ré-alimentation, fumée noire sous le vent, plafond du nombre de nappes, pluie qui divise la durée par plus de 2
- Eau : flaque éteinte en 2,5 s d'extincteur sans reprise, reprise après arrosage insuffisant, vapeur claire, gaz et fumée rabattus de plus de moitié au centre, personnes mouillées, événement `hazards:douse`
- Visibilité : 1 dans l'air pur, moins de 0,1 à travers un écran de fumée, symétrique, gaz léger sans effet, gaz dense entre 0,1 et 0,6, moins de 0,45 à travers un nuage de grenade
- Service de lecture : `forEachActiveCell` et `collectActiveCells` identiques et cohérents avec `gasAt` et `totalGas`, filtre par rayon, révision stable au repos, couleur transportée et mélangée
- Grille creuse : blocs libérés puis réutilisés, table de hachage éprouvée par 4 000 insertions et retraits aléatoires, plafond de 768 blocs, cache du bâti invalidé par tuile et par `world:source`
- `clear()`, `reset()` et déterminisme : même graine donne la même empreinte du champ, autre graine une turbulence différente, une session relancée rejoue à l'identique
- Robustesse : 4 minutes dans un quartier dense avec vent tournant jusqu'à 25 m/s, pluie, feux, eau et dépôts massifs, sans valeur négative, non finie ou au-dessus des plafonds, et sans gaz dans le bâti ; le quartier se vide ensuite entièrement
- Coût, 60 émetteurs (appels `emitGas` compris), pas de 1/30 s : 0,06 à 0,11 ms par pas en moyenne sous vitest et dans un paquet de production exécuté sous Node ; p95 de 0,12 à 0,28 ms ; objectif de 1,5 ms tenu
- Coût dans le quartier d'essai réel (60 palets dispersés sur 500 × 500 m, 156 blocs) : 0,20 à 0,36 ms par pas en moyenne, p95 de 0,6 à 0,97 ms ; pas de champ nominal ≈ 0,6 ms
- Coût des lectures : 31 à 41 ns par `gasAt`, `smokeAt` ou `fireAt` (1 500 personnes × 3 lectures ≈ 0,15 ms) ; `visibility` ≈ 0,55 µs par appel
- Allocations : 0 à 1 passage du ramasse-miettes par minute de jeu en régime établi (60 émetteurs, fumigène, `collectActiveCells`)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/hazards/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/config.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/grid.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/statics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/wind.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/solver.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/transport.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/sampling.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/fires.ts
- /home/user/SafeDeal/crs-simulation/src/sim/hazards/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.gaz.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.rues.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.feu.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.champ.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.monde.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/hazards.perf.test.ts
