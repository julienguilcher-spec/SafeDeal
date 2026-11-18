# Findings — vehicles parked in a block at the start (bases and mode-libre places)

All found by the agents of the previous lots (their fixes are now in your tree: road closures open for police vehicles, crowd parts, departure order computed on the real route, a van goes round motionless colleagues, convoy waits for a straggling van, engine crews keep their seats, BRAV-M passenger). What is left is the LAYOUT of the parked block and the way out of it.

## [bloquant] Player's column at the Bastille: vans stay trapped in the parked block (0/6 follow in PLAYTEST_STRICT=1 PLAYTEST_LIGHT=1) — blocking finding 'attente circulaire et demi-tour sans fin'
- reported by: colonne-sortie
- file(s): crs-simulation/src/gameplay/session/setup.ts (faceExit) and crs-simulation/src/sim/police/units.ts (parkSpot)

### Analysis
Reproduced at HEAD and with my changes, identically: all 14 Bastille cases fail in strict mode (the default, non-strict mode passes 42/42). Detailed trace for 'bastille crs/lbd'. The parkSpot layout (2 files 3.6 m apart, rows every 7.6 m behind the group) combined with faceExit (every vehicle turned 180°) puts the player's van in the middle of the block with other vans in front of its bonnet. The robot driver spends about 75 s backing and forth before it gets out. Meanwhile the vans next to its trail are 'held' by holdBehind (leader beside or behind within 42/90 m). The vans then end up nose to nose: #62 (follows the player) is stopped 0.5 m from #48, which follows #62 and is stopped 0.2 m from it, with a vehicle behind each of them, so neither can back up. unjam then swaps the two every 5 to 12 s; each follow() call resets blockedFor and the loop never ends. I tried two things without success and reverted both: a 'yield to the leader' rule (the follower backs off 4 m), which fails because the rear is blocked; and a single abreast row in parkSpot, which made it worse (the player drives 7 to 11 m). In the case 'bastille crs/bouclier', the first blocker is a stationary demonstrator in front of the VL (the fix where demonstrators step aside is in another worktree). That leaves #46 'held' indefinitely, because its leader is stopped 60 m behind it.

### Suggested fix
Change the vehicle headings in setup.ts faceExit (read-only for me) so each file faces its real exit: compare the direction of findPath from both ends of the file. Then place the player's vehicle at the head of that file. In units.ts parkSpot, leave one lane of at least 1.5 van lengths in the exit direction of each file, and make hasWayOut (or a sibling) treat parked vehicles as obstacles. Once the block can be left in order, follow.ts exitOrder will work. Proof: PLAYTEST_LIGHT=1 PLAYTEST_STRICT=1 PLAYTEST_ONLY=bastille npx vitest run tests/unit/playtest.colonnes-roles.test.ts (3 to 8 s per case).

## [bloquant] wA04 République: the AI driver of the player's VL (player as passenger) cannot get out of the block; the test is still skipped
- reported by: colonne-sortie
- file(s): crs-simulation/src/sim/police/units.ts (parkSpot) / crs-simulation/src/gameplay/session/setup.ts (faceExit)

### Analysis
Measured with seed 42. The VL is parked on the pavement at (3069.3,-157.8), heading -0.79, and faces a building 4.5 m ahead (raycast). It has 2 vans on each side, 3.6 m from centre to centre. The road edge (3069,-159)→(3138,8) that its route follows passes 0.27 m from van #9 and right through van #25. Both vans follow the VL and wait for it. While the VL turns, the corridor going round #9 is blocked by #25. On the left the shift needed (7.95 m) exceeds maxShift. Backing up is stopped by a 'mur' reading 0.55 m behind. So the VL can only leave once #9 and #25 have left. Three autopilot attempts failed and were reverted, and one of them made the 7e → Bastille case much worse (4159 m): the lead going round its own motionless follower, with the kerb allowed; a straight reverse sized to clear the neighbouring van; and the parking redesign. The it.skip in integration.colonne-places-joueur.test.ts is therefore restored, with its original comment.

### Suggested fix
Root cause is the same as above: the block is laid out so that the vans parked on the VL's route have to leave first. Either the parking layout leaves the VL a clear lane (VL at the exit end), or follow.ts tendRide/unjam lets the column vans that block the lead (lead in drive, obsId = a stationary follower, more than JAM_WAIT) leave first along the lead's planned route (plannedPath), then rejoin the chain behind it.

## [majeur] wA07 / wB00 part 2: parkSpot leaves no exit lane, and parkClear checks only 3.6 m from the centre whatever the vehicle length
- reported by: colonne-sortie
- file(s): crs-simulation/src/sim/police/units.ts

### Analysis
A static check (my test, removed from the tree because it still fails) found fourgon_crs #25 at République (seeds 41 and 42) with its rear bumper less than 1 m from a fixed obstacle (isFree is false 0.5 m behind it). parkClear uses isFree(x±2.4·f, 1.2) for every vehicle: there is no margin for a 6.5 m VL (half-length 3.25) and only 0.7 m for a van. A local change to the layout (single abreast row) made things worse, so it was reverted.

### Suggested fix
Pass the vehicle kind or length to parkSpot and parkClear. Require free space at least 1.5 m beyond each bumper, plus a lane in the exit direction. Then re-run the matrix in tests/unit/playtest.apparition-roles.test.ts with APPARITION_CONDUITE=strict, and playtest.colonnes-roles in strict mode.

## [majeur] wA07 (mode libre): after faceExit, the player's van in the first row has the rest of the block in front of its bonnet
- reported by: depart-base
- file(s): crs-simulation/src/sim/police/units.ts (parkSpot) / crs-simulation/src/gameplay/session/setup.ts (faceExit)

### Analysis
I proved it in a scratch matrix: 21 out of 21 libre cases (Concorde/République/Bastille × crs postes, chef_groupe, commandant, commissaire) have a police vehicle directly ahead of the player's vehicle, less than one length + 4 m away in its lane. parkSpot fills rows backwards from the stand until space runs out, and faceExit turns every vehicle 180° to face 'the exit'. The far end of the block, however, is usually where space ran out, often a wall, so the real way out is back towards the group. I tried swapping the player's van with the head of its file (setup.ownVehicleOut). It made things worse: in playtest.colonnes-roles 'concorde crs/conducteur' the player drove 20 m instead of 522 m. For the commandant's VL it also left two staff officers on foot in integration.colonne-places-joueur. I reverted it, so this finding is NOT fixed. hasWayOut does not see this: it only checks the world (walls), not parked vehicles.

### Suggested fix
Choose the vehicles' heading from the real exit, not from 'away from the group'. For each file, pick the end from which a road route to the destination leaves without crossing the block, for example by comparing the direction of findPath from the file's ends, and turn the file to face that end. Then place the player's vehicle at that end. Also give hasWayOut (or a sibling) an option to treat parked vehicles as obstacles, so the static matrices can detect this.

## [bloquant] Commissariat du 8e (and any base where the crowd changes the route): the journée lineUp parks the column facing away from the route it will actually drive, and puts the rear vehicle crosswise on the link leg to the road
- reported by: depart-base (its fix was REJECTED by the reviewer: it did not unblock the departure from the 8e and made the column arrive without the player more often from the caserne de la Cité — seeds 1–9 Cité → République: 8/9 at HEAD vs 6/9 with the fix)
- file(s): crs-simulation/src/gameplay/session/journee.ts

### Evidence
Reproduced at HEAD with crs, 8e → Concorde, seed 7. Headings were VL 3.07, vans 3.07/3.06/1.50 and cellulaire -2.43, the same values the tester reported. lineUp called a plain findPath with no options, and that route goes south. The autopilot that drives the column passes `avoid` (crowd zones), contraflow and minWidth, and its route goes north. I computed both routes from the same point and they really do go in opposite directions. As a result the VL made a U-turn through its own file and stayed pressed against a van at thr=1. The rear van was laid on the first path leg, which is the link from the centroid of the courtyard block to the road, so it sat at heading 1.50 across a file at 3.07. The new test 'commissariat du 8e → Concorde' fails at HEAD with ["fourgon_crs#9639 cap 3.06 / fourgon_crs#9647 cap 1.50", "vl_commandement tourné à l'opposé de l'itinéraire de la colonne"] and passes after the fix.

### What the hunter tried
journee.lineUp now plans the file with the autopilot's own options (`{heading:0, uturn:0, avoid: crowdZones(ctx), contraflow:3, minWidth:3.6}`). crowdZones copies the convoy's rule: at least six protesters in a 40 m cell gives a 30 m zone. When the block is parked off the road (start point not on 'road'/'bridge'), the file starts past the link leg, at s = max(6, s0+1). Important: the 8e column still does not leave the base until the deferred convoy.ts fix below is also applied. I simulated that fix with a findPath wrapper in a scratch test, and with it the 8e column leaves in order: VL first, all four vehicles moving at 13 m/s.
