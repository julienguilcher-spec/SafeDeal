# Findings — what is left on the road for police columns

## [mineur] Follower stuck against a façade corner on its leader's trail (Bastille 3739/1593) and the vehicle start leg through the Concorde balustrade (pathfind)
- reported by: colonne-sortie
- file(s): crs-simulation/src/world/query/pathfind.ts / crs-simulation/src/sim/vehicles/autopilot.ts

### Analysis
Not reproduced and not worked on in the time available. Both need playtest.colonne-barrages (PLAYTEST_ALL=1), and the second finding sits in pathfind.ts, which is outside my scope.

### Suggested fix
As described in colonne-sortie-2.md: a follower stopped by a wall rejoins the trail further on through findPath; snap the start of a vehicle route to an edge reached by a clear straight line.

## [majeur] wA02 non reproduit côté piétons : colonne du commissariat du 1er (cas KNOWN '1|1|chef_groupe') bloquée par des véhicules
- reported by: missions-divers
- file(s): crs-simulation/src/sim/vehicles/** (autopilote de colonne) / src/sim/traffic/car-watch.ts

### Analysis
Le cas de playtest.colonne-ia relancé (graine 4, base 1 → Concorde, chef_groupe) échoue encore : 2 fourgon_crs restent à leur place. Le diagnostic, de t = 57 à 95 s, ne trouve aucun piéton devant eux. Les deux sont en follow/attente, vitesse 0. Devant l'un, un fourgon_cellulaire oscille à 7 m. Devant l'autre, une voiture civile voiture#13618 est à 7,4 m en MODE_GO à vitesse 0. Il s'agit d'une attente mutuelle entre véhicules (colonne, voiture qui s'est rangée), pas d'un piéton en S_WAIT. Pendant le départ, un piéton en S_WAIT attendait bien devant un fourgon arrêté, mais seulement environ 12 s, et la situation s'est débloquée seule.

### Suggested fix
Côté autopilote ou circulation : une voiture civile arrêtée devant un véhicule à deux-tons à l'arrêt depuis plus de quelques secondes doit dégager (MODE_CLEAR), et la colonne ne doit pas attendre un véhicule de queue qui oscille. Le patch ped-react proposé dans le constat n'est pas justifié.

## [majeur] BRAV-M: a moto of the AI's other BRAV-M unit stays 370 m from the point; the lead stops 130 m short facing a wall
- reported by: coordinator (seen after merging the lots)
- file(s): crs-simulation/src/sim/police/command/bravm.ts, crs-simulation/src/sim/vehicles/autopilot*.ts

### Analysis
(1) tests/unit/playtest.bravm-passager.test.ts, case « journée : commissariat du 9e arrondissement (rue Chauchat) → Place de la Bastille (graine 5) » is RED at this HEAD: the player's three motos arrive (about 150 m from the point, player seated behind his pilot), but one moto of the OTHER BRAV-M unit of the service day (#7214) ends 370 m from the destination (threshold 250 m) and is never relaunched: « toutes les motos : 8/9 sur place #7214@370m ». In bravm.ts arrived() the stragglers are sent to the lead with ap.driveTo once; nothing relaunches a straggler whose autopilot then stops.
(2) tests/unit/bravm.retour-machines.test.ts (mode libre, République, 3 motos, order « colonne » to a road point about 700 m east): the column ends with the lead « drive/bloque/mur » with 130 m of route left (the three motos stop 129–139 m from the point) and reports « En position ». The test passes, but the column is not at the point: find what the wall is (last leg of the vehicle route through an obstacle? a street the motos cannot enter?) and make the column reach its point.

### Suggested fix
Relaunch stragglers until they are with the lead (bounded), and fix the cause of the « mur » stop near the destination.

## [majeur] Service day, chef de groupe, commissariat du 7e (rue Fabert) → Place de la Bastille: the player gets off 223 m from the point
- reported by: coordinator (RED at this HEAD)
- file(s): crs-simulation/src/sim/police/command/convoy.ts, crs-simulation/src/sim/vehicles/autopilot*.ts

### Analysis
tests/unit/playtest.colonne-ia.test.ts, case « chef_groupe : commissariat du 7e arrondissement (rue Fabert) → Place de la Bastille » fails at this HEAD: « arrivée : sur_place après 1195 s (limite 1537) ; joueur à 223 m du point », expected less than 120 m. It passed in the worktree of the agent who fixed the road-closed-by-a-fixed-obstacle case, before the other lots were merged (crowd parting for police vehicles, closures opening for police, departure order on the real route). Find where the player's van stops and why the convoy considers itself arrived (parking spot far from the point? the van stopped by an obstacle and the convoy disembarking where it is?).

### Suggested fix
The column must park within about 100 m of the point or, when the place is blocked, say so and get as close as possible.
