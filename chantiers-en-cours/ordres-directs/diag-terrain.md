# Diagnosis: orders from the field, units that follow « sans ordre », a BRAV-M that does not move, reactivity

Worktree: /tmp/claude-0/hunt/ordres-directs (HEAD 6f3f12e, version 20 plus the order-card fixes). Nothing in the project was modified.
Probe sources (deleted from the project, kept for replay): `scratchpad/ordres-directs/sondes-terrain/zz-sonde-{terrain,bravm,journee}.test.ts`.
Raw logs: `scratchpad/ordres-directs/sonde*.log`.
To replay one, copy it back into `crs-simulation/tests/unit/` and run it, for example
`SONDE_SCEN=bravm-avancer npx vitest run tests/unit/zz-sonde-bravm.test.ts`.

## What I played

All runs use `createTestContext` with the full simulation and UI-command modules, and give orders through the same code paths as the field: `CommandCore.callFollow` (wheel sectors 1 and 2, the « ORDRES » block, the phone's « Suivez-moi » pill) and `CommandCore.issue(type, [wheelSquad], [geom])`, exactly as `OrderWheelScreen.issue` does for sectors 3 to 8. Means: 3 sections, 9 vans, 1 Centaure, 1 water cannon, 1 BRAV-M, unless noted.

| Run | Mode / place / seed | Poste | What was done |
|---|---|---|---|
| T1 | free, Concorde, 21 | commandant (terrain) | F→1, walk 40 m, F→3 at 40 m, F→4, F→8→3 (charge), F→8→1 (repli), F→5 on an offender, BRAV-M Avancer and Interpeller (map path), F→2 |
| T2 | free, Concorde, 21 | commandant | fresh start: F→3 at 40 m, measured until « en place » |
| T3 | free, Concorde, 21 | commandant | fresh start: F→4 line at 30 m |
| T4 | free, Concorde, 21 | commandant | fresh start: BRAV-M « Avancer » 50 m |
| T5 | free, Concorde, 21 | commandant | fresh start: BRAV-M « Interpeller » an offender 125 m away |
| T6 | free, Concorde, 21 | BRAV-M, brigadier-chef, asked for poste chef_groupe | F→1 and a 60 m walk, F→3, F→2 |
| T7 | free, Concorde, 21 | chef de groupe; chef de section (major); CRS; BRAV-M passager; BRAV-M pilote | inventory: scope, wheel, the unit's order after 20 to 120 s |
| T8 | free, Bastille, 5 | commandant | « Tenir une ligne » for section MISTRAL 1 at 394 m (implicit move in vehicles) |
| J1 | service day, République, 5 (2 sections, BRAV-M from its station) | commandant | rides as passenger in a van, arrives, waits 90 s, F→1 and a 50 m walk, F→3, BRAV-M « Avancer » 30 m |

## 1. Inventory: what a player can order without the map

### Keys, sectors and buttons (all postes)

- **F** opens the order wheel. Hold F and point, or tap F and then press a digit, or use the arrows and Entrée. Echap / ⌫ goes back. Code: `orderWheel.ts`, `wheelKeys.ts`.
- **Wheel for a poste that commands** (scope `tout` or `unite`), clockwise:
  - 1 « Suivez-moi à pied »
  - 2 « Suivez-moi en véhicules »
  - 3 « Avancer jusqu'ici » (aimed point)
  - 4 « Tenir une ligne ici » (aimed point, facing the camera)
  - 5 « Interpeller » (the aimed person; greyed « visez quelqu'un » otherwise)
  - 6 « Pousser un véhicule » (Centaure)
  - 7 « Secours ici » → Pompiers / SAMU
  - 8 « Plus… », with an inner ring: 1 Se replier 30 m, 2 Bond, 3 Charger, 4 Gaz, 5 Tenir, 6 Arrêter, 7 Laisser agir seuls, 8 Tortue
- **Wheel for a read-only poste** (CRS, BRAV-M gardien, patrol, engine crews): only 1, 2 and 7.
- **The orders always go to one single squad:** `scope.ownSquadId`, or the player's own squad when read-only (`OrderWheelScreen` constructor, line 333). Nothing in the wheel picks a sub-unit.
- **Without an aimed point** the target is 20 m in front of the camera. **Without an aimed person** Interpeller is disabled.
- **« ORDRES » block** in the HUD (`quickActions.ts`): « Suivez-moi à pied » (F puis 1), « Suivez-moi en véhicules » (F puis 2), « Secours ici » (F puis 7), « Carte de commandement » (Tab).
  - Conditional extras: « Vue drone » (O); « Un véhicule vous bloque → Envoyer le blindé Centaure »; « L'ADJOINT PROPOSE … Accepter (P) / Plus tard (Maj+P) ».
- **Phone:** a round « Ordres » button (it opens the same wheel), one smart « Suivez-moi » pill (on foot or in vehicles, depending on how the player is moving) and « Secours ici ».
- **Feedback for a wheel order:** a toast « Ordre donné : X avance jusqu'au point. » for 2.5 s, the player's radio phrase, the unit's acknowledgement, and the unit chip « NAME · TAG » (`hud.ts`, refreshed every 0.25 s).
  - No world marker is placed for a wheel order. Only the map draws order lines.
  - The commandant has no « Ma mission » card: in J1, `session.mission.active` was false.

### Who receives the orders, per poste (T7, T1, T6)

| Poste | Scope | Wheel addresses | State of that unit at the start |
|---|---|---|---|
| Commandant | `tout` | **the whole company MISTRAL**: 69 agents, of whom 15 are drivers who stay aboard; also the water-cannon and Centaure crews, which have parentId = company | `libre`: chip « MISTRAL · SANS ORDRE ». **Nobody follows him on foot**: `setup.ts` lines 218-224 skip the commandant. |
| Chef de section (`chef_groupe` + `chef_section`) | `unite` | section MISTRAL 1 (label « Chef de groupe — MISTRAL 1 ») | **section `libre`, groups ALFA and BRAVO do not follow**. Only his command group CHARLIE gets `suivre`: setup issues `suivre` only to squads he leads that have more than one direct member, and a section has 0 direct members. |
| Chef de groupe | `unite` | his group | `suivre` on him (« ME SUIT À PIED ») |
| CRS | `lecture` | his group (1, 2, 7 only) | the AI chief's order, for example `ligne` |
| BRAV-M passager (the default poste) | `lecture` | **his binôme « BRAV-M 1-3 »**, that is his own pilot | `libre`. The group « BRAV-M 1 » (AI chief) and FAUCON 1 stay `libre/repos` for 120 s and more: nobody ever orders them. |
| BRAV-M passager, rank brigadier-chef | `unite` | still the binôme BRAV-M 1-3 (2 people) | `libre` |
| BRAV-M pilote | `lecture` | group « BRAV-M 1 », which the player leads (LEADER_ROLES) | `suivre`. It is a plain group with motos, **not** a `BravmUnit` (it has no binômes). |
| Patrol chef de bord | `lecture` (`scope.ts`, forced) | his crew (1, 2, 7). Reinforcements go through the CENTRAL call card (Y). | crew aboard |

**There is no « BRAV-M chief » poste.** The menu offers only `passager_moto` and `pilote_moto` (`catalog.ts` line 73), and `roster.ts` (case `'bravm'`) always puts the player as the operator of the third binôme under an AI chief. A player who « is » the BRAV-M commands at most his own pilot.

### What units do once « avec moi »

- **On foot (`suivre` on the player):**
  - They walk behind him in a column: status `suivre/mouvement/colonne`, chip « ME SUIT À PIED ».
  - In T1, after a 40 m walk followed by 15 s of waiting, the company's median distance to him was 31 to 40 m. The Centaure was at 79 m. The BRAV-M did not move at all (it is not in the company).
  - They never face anything and never form a line unless given F→4.
- **In vehicles:** when the commandant drives or rides in the column (J1), the whole company rides behind him.
  - When he gets out, `follow.ts` `endConvoy()` issues `debarquer` to every accompanying group, beside its van.
  - Nothing comes after that. In J1 every squad was still `debarquer` 20 s and then 110 s after the stop, with phase `en_place`, and the chip read « MISTRAL · DESCEND ».
  - The AI of the company (`police.command`, mode `adjoint`, phase `arrivee`) never deploys anything for a player commandant.
  - **This is exactly « ils me suivent mais ils n'ont pas d'ordre ».**

### How many key presses for each wish (keyboard, with times measured in T1–T3)

| Player wish | From the field (today) | Through the map (Tab) |
|---|---|---|
| « allez là » (≤100 m) | Aim with the trackpad, then F, 3 (2 keys). **The whole company** goes, at 1.2–1.9 m/s in a column: in T2, 50 s to cover 40 m and 60–70 s to « en_place ». | Tab, arrows to reach the place (or R and a search), E, check « Qui », Entrée, Tab: 5 keys at least plus navigation. Seconds of reading. Picks a precise unit. |
| « tenez cette rue » | F, 4: a line « face à moi » at the aimed point (camera heading). In T3 the agents were there in 20 s, « en_place » and the radio report came at 56–60 s. | Tab, place, B, Entrée, Tab |
| « repoussez-les » | **No sector.** Refoulement is not in the wheel. Bond = F, 8, 2: it starts, with the warning « avant la dernière sommation ». | Tab, D (Disperser)… With force at « mains nues », the card offers the legal chain (L). |
| « chargez » | F, 8, 3: **refused** at start. Free mode and service day both start at `authorizedForce = 1` (mains nues); toast « Refusé : « Charger » demande : bâton et gazeuse ». The sector is grey and shows « il faut les sommations et l'autorisation du bâton ». | Tab, L to authorise, sommations, then the order (several steps) |
| « interpellez celui-là » | Put the crosshair on the person (precise trackpad pointing), then F, 5. The order goes to the **whole company**, which picks a binôme: in T1 the target was held well inside the 90 s window. | Tab, I, (U to choose the BRAV-M), Entrée |
| « revenez » | F, 1 (Suivez-moi à pied). This is the only « come back » order. F, 8, 1 is « Se replier 30 m », relative to the camera. | Tab, G, E… |
| any of these for **the BRAV-M** or **one section** | **Impossible from the field.** The commandant's wheel addresses only the company; the BRAV-M chief does not exist as a poste. | map only |

## 2. BRAV-M

### Results

| Case | What happened |
|---|---|
| T4: commandant, the map path (`core.issue('avancer', [FAUCON 1])`), BRAV-M on foot 23 m from him, point 50 m away | Acknowledgement « REÇU, en colonne vers le point » **17.1 s** after the order. The operators walked back to the motos (« remontee »); all 12 were aboard at 17 s. Stage `route`: the motos rolled for about 2 s in total. At 77 s: « Arrêtés à 50 mètres du point, accès bloqué, SIX motos », then `repos`. **It never reached a point 50 m away. All along `squad.order` read `embarquer`**, so the map and the chip said « MONTE ». |
| T5: commandant, « Interpeller » an offender 125 m away, BRAV-M on foot | Acknowledgement at 17.1 s. They went on foot (120 m is below WALK_LIMIT = 250) in stage `approche` for **120 s**, and their distance to the target went 127 → 58 → 94 m (the target moved). Then `interpellation` from 130 s. **Not arrested after 180 s.** The order shown was `colonne`, not « Interpeller ». |
| T1: the same « Interpeller » just after a stalled « Avancer » | « Interpellation abandonnée : aucun binôme d'interpellation disponible. Je regagne les machines » and then « Binôme hors de combat ». |
| J1: service day, BRAV-M arrived mounted 74 m away, commandant orders « Avancer » to a point 30 m from himself | The BRAV-M had stayed in `colonne/embarque` since its arrival. After the order: stage `route` for 70 s, lead moto still 46 m from the point; `repos` at 80 s. **It never arrived.** |
| T7: BRAV-M passager (the player's own default) | Group BRAV-M 1 and FAUCON 1: `libre/repos` for 120 s, never moving. |

### Root causes

1. **The BRAV-M is outside the company.** `setup.ts` line 539 calls `units.createBravm(6, {…})` without a parent, and `BravmOptions` (`sim/police/api.ts` line 159) has no `parentId` at all. In `units.ts` `createBravm`, the group is created with parent 0. The water cannon, the Centaure and the drone do get `parentId = company`.
   - So `whoEnvFromCore` (`bestUnit.ts`): T « Toute la compagnie » = `[sc.ownSquadId]`, which leaves the BRAV-M out.
   - So the wheel (always `ownSquadId`) and `callFollow` leave it out too.
   - `follow.ts` « wholeCompanies » takes in only the company's tree (« pour la BRAV-M, les motos de son unité »).
   - Result: the BRAV-M neither follows nor receives « Suivez-moi », and the only way to order it is the map.
2. **Every movement order to a BRAV-M on foot starts by walking back to the motos.** In `bravm.ts` `BravmUnit.begin()`, cases `avancer`, `colonne` and `repli`: `if (mounted) ride() else defer(backToMotos)`. No distance test is made: 30 m on foot becomes a walk back, a remount, a convoy and a stand-off.
3. **The motos will not ride into a crowd, and give up only after a long wait.** `thinkRide()` drops to 5.5 m/s (`tuning.bravmSlow`) as soon as there is a pedestrian within 30 m ahead, and `ride()` moves the stopping point back by 20 m increments until fewer than 8 demonstrators remain within 22 m.
   - For a short trip (d < RIDE_FAR = 200) the unit waits for `bloque > 12 s`, or `attente > 40 s`, or `rideMax ≥ 240 s` before it « arrives ».
   - That is 40–80 s of motos standing still at a demonstration, followed by « accès bloqué ».
4. **The internal order hides the player's order.** `backToMotos()` and `approach()` issue internal `colonne` / `embarquer` orders to the squad (`this.internal(...)`), so `squad.order.type` (read by the HUD chip, the map labels and `panelFollow.unitActivity`) shows « MONTE » / « EN FILE » instead of the order given.
5. **Its acknowledgements are late.** `SpecialUnit.say()` goes out on channel `unite`, which is busy with other units' acknowledgements and routine reports; the acknowledgement came at 17 s in T4 and T5.
6. **Interpellation on foot is slow and fragile.**
   - An arrest within WALK_LIMIT (250 m) always goes on foot, at a walking pace, with the 12 m watch distance (WATCH_DISTANCE) and a 25 s watch (WATCH_TIME).
   - Once the binômes are mounted or scattered, « aucun binôme d'interpellation disponible » ends it.
7. **NÉGATIF / refusals.** `claim()` never refuses. Refusals come from `onPoliceDone` (« Interpellation abandonnée… je regagne les machines », bravm.ts lines 773 and 908) and from `system.ts` `handleOrder` (`startTask` reason → `negative(...)`, emitting `police:order_refused`).
   - A binôme given « Interpeller » directly refuses on the spot. That is why the card picks the group.
   - No refusal is shown for « accès bloqué »: it is a normal report to `superior()`, which is the commandant's company callsign.

## 3. Reactivity

### Measured timelines (on foot, ≤100 m)

| Order (T1–T3, fresh starts) | Player's radio phrase | Unit's « REÇU » | 20 % of agents moving | Physically there | « en_place » / report |
|---|---|---|---|---|---|
| F→1 Suivez-moi à pied (company) | 6.3 s | **3.6 s, before the order** | 1.0 s | — (follows 31–40 m behind) | — |
| F→3 Avancer 40 m (company) | 0.7–6.3 s | 0.5–3.6 s (« QUATRE-CINQ mètres » when the order said 40) | 1.3 s | 50–60 s | 60–70 s; « CENTRAL ICI MISTRAL. Barrage en place » at 66.8 s |
| F→4 Ligne at 30 m (company) | 6.3 s | **3.6 s, before the order** | ~1 s | 20 s | 56–60 s; « Barrage en place » sent to CENTRAL |
| F→5 Interpeller at 36 m (company) | 6.6 s | 0.0 s | 1.8 s | — | target `held` inside the window |
| BRAV-M Avancer 50 m (map) | 6.3 s | 17.1 s | 0.8 s (walking back to the motos) | never | « accès bloqué » at 77 s |
| BRAV-M Interpeller 125 m (map) | 6.3 s | 17.1 s | ~1 s | 170 s | not arrested in 180 s |
| Section « ligne » at 394 m, in vehicles (T8, Bastille seed 5) | « Embarquez… » 6.2 s | « REÇU, j'embarque » 17.6 s | all 19 aboard in 6 s; departure 21.9 s | **never**: lead van 162 m from the point, autopilot `bloque/obstacle`; second van stuck at the start `attente/personne` | stage `route` for more than 6 min, no message |

### Every deliberate delay on the path order → unit in place

| Where | Constant / mechanism | Value | Effect on feel |
|---|---|---|---|
| `gameplay/radio/queue.ts` `DEFAULT_QUEUE_CONFIG` | one message per channel at a time, `gap` 0.5 s, each message occupies the channel for its estimated spoken duration; `maxWait` [8, 90, 150] s | — | **Large.** CENTRAL repeats « URGENT. Automobiliste bloqué… » every ~10 s on `commandement` (known leftover). The player's phrase gets the fast lane (`fromPlayer`) but still waits for the current message to finish: 0.7–9 s. |
| two channels | the player's order goes on `commandement` (`core.ts` `issue` / `callWithMe`); the unit's acknowledgement goes on `unite` (`kernel.say`, `SpecialUnit.say`) | — | **Large for clarity.** The two queues are independent, so the « REÇU » regularly comes **before** the order it answers (T1, T2, T3). |
| `maneuver.ts` `startOrder` | `ackAt = now + 0.35 + (id·0.173 mod 0.4)` | 0.35–0.75 s | small |
| `sim/police/tuning.ts` | THINK_AGENT 0.25 s (0.5 s beyond FAR_DISTANCE 90 m), THINK_UNIT 0.4 s, REPATH_INTERVAL 2 s, REALIGN_TIME 2.5 s, FORM_TIMEOUT 25 s, EXIT_INTERVAL 0.6 s | — | the 25 s formation timeout and the realignment explain most of the 20 → 56 s gap between « there » and « en_place » |
| `system.ts` | PLAYER_RUSH_MIN 35 m: beyond it, the player's placing orders are run at a trot | — | below 35 m everyone walks at SPEED_MARCH 1.9 m/s |
| a company order is a block order | `handleOrder` makes every descendant follow the root formation (`eachDescendant`, `startOrder`); the 69 agents first form a column (mise_en_place → mouvement after 8.3 s in T1) | — | **Large.** « Avancer 40 m » takes a minute, because the commandant can only move the whole company from the field. |
| `ui/command/core.ts` | MOTOR_DISTANCE 250 m: beyond it, MOTOR_AUTO orders (colonne, avancer, tenir, ligne, proteger, encercler, couper_circulation, filtrer, repli) go through `motorize()` → `police.command.arrive` with `boardFirst`, `stagger`, `disembark`; the order is replayed at `en_place` through `afterConvoy` | — | boarding + convoy + parking + replay; in T8 it never got there |
| `police/command/convoy.ts` | BOARD_MAX 120 s, STRAGGLERS_MAX 45 s, PLAYER_WAIT 300 s (the column waits for the player who is part of it), PLAYER_REMIND 30 s, STUCK_LEAVE 25 s, PARK_WAIT 300 s / 720 s, CIVIL_CLEAR 20 s; staggered departure (`staggerIdx`) | — | PLAYER_WAIT: « Toute la compagnie » with the commandant on foot waits for him for up to 5 min (the card says so: `waitsForYou`) |
| `gameplay/session/follow.ts` | MOTOR_READY_MAX 60 s, DISMOUNT_MAX 45 s, BOARD_TIMEOUT 40 s, JOIN_PERIOD 3 s, ORPHAN_DELAY 6 s, DEPART_MOVE 20 m, FIRST_ENGAGE 42 m, JAM_WAIT 5 s, SWAP_COOLDOWN 12 s | — | « Suivez-moi en véhicules » is reported « prête » only when everyone is seated (up to 60 s) |
| `police/command/bravm.ts` | RIDE_BEYOND 60 m, WALK_LIMIT 250 m, MOUNT_REACH 40 m, `tuning.bravmStandoff` 60 m, RIDE_STANDOFF 15 m, bravmSpeed 11 / bravmSlow 5.5 m/s, RIDE_FAR 200 m, RELAUNCH_GAP 20 s, RELAUNCH_MAX 12, REGROUP_SPREAD 120 m / REGROUP_DONE 45 m / REGROUP_MAX 40 s, WATCH_DISTANCE 12 m, WATCH_TIME 25 s, rideMax max(240, d·1.6/8 + 60) s, blocked thresholds `bloque > 12 s` / `attente > 40 s` | — | **Large.** See §2. |
| `ui/command/quickActions.ts` | PERIOD 0.5 s (HUD refresh), BLOCK_SHOW_AFTER 4 s, RESCUE_COOLDOWN 8 s | — | small |
| `ui/command/core.ts` | SCOPE_PERIOD 0.5 s | — | small |
| `ui/command/tacticalState.ts` | Entrée guarded for 0.6 s after a send | — | small |

**The delays that make the game feel unresponsive:**

- the radio queue and the « REÇU » arriving before or long after the order;
- block movement of the whole company for every field order;
- the BRAV-M's walk back to the motos and its stand-off waits;
- the implicit move in vehicles above 250 m, with its boarding, its stagger and the known stuck-lead-vehicle problem.

The brains' think intervals (0.25–0.5 s) are not the problem: agents start moving within 1–2 s in every case.

### Feedback the player gets, and when

| What | When / how |
|---|---|
| Toast « Ordre donné : X … » | 2.5 s, immediately |
| Player's phrase as a radio subtitle | 0.7–9 s later |
| Unit acknowledgement | 0.5–17 s |
| Unit chip « NAME · TAG » | refreshed every 0.25 s; shows `squad.order`, so it reads « MONTE », « DESCEND » or « EN FILE » whenever an internal order replaces the player's |
| Completion report (« Barrage en place ») | addressed to **CENTRAL**: `superior()` walks up from the issuer's squad, which is the company itself |
| Unit's position in the world | no world marker for the order's point or for « en place » |

The radio also says « MISTRAL ICI MISTRAL » (and « BRAV-M 1-3 ICI BRAV-M 1-3 »): `callsign()` returns the player's own squad name, and that is the unit he is talking to.

## 4. « Escorte »: every meaning

| Meaning | Where | What the player sees |
|---|---|---|
| a. Foot escort of an armoured vehicle (a CRS group stays around the Centaure or the water cannon) | `setup.ts` `attachEscort`; `police.command.escort()`; order `proteger` | Radio « REÇU, je protège l'élément désigné » and « Dispositif de protection en place ». These arrive 3–18 s into every session and after « Suivez-moi », with no link to anything the player did. In code and docs it is « escorte de l'engin »; on the radio it is « protège ». |
| b. Order `escorter` (« Escorter une autre unité… », tag ESCORTE, « L'accompagne pendant son trajet ») | `orders.ts`; the executant card in `executant.ts`: « Escorte — Restez à pied autour de l'engin, à sa vitesse » / « Escorter l'engin » | only in the map's « Plus… » |
| c. Escort of a detainee to the « point de regroupement » | `ops-arrest.ts` `findHandover` (cellular van or the unit's van within 400 m, otherwise a point from `law.handover`, otherwise kept behind the line); radio phrases in `c-manoeuvres-incidents.ts` | Radio « Un interpellé est conduit au point de regroupement… Escorte de deux agents ». **This point is never shown**: there is no marker and no map label, and a free session has no cellular van (`fourgon_cellulaire` is absent from the means). The player who arrests someone himself is told « Remise impossible : plus de place à bord ou point de regroupement trop éloigné » (`interactions.ts` line 325) or « escortez la personne sans entrave » (line 200). |
| d. Units that accompany the player's vehicle column | `follow.ts` (`escorts`, `gatherEscorts`) | Nothing is named. The groups just ride along and then « DESCEND ». |
| e. Missions: « Escorter la délégation », « Escorte incendie » (bravm-05, escorting firefighters), « Escortez les secours », « Escorte vers le métro » (crowd evacuation, `escorte-metro`) | mission catalogue, `incidents` | the mission text |

**Unclear:** (c) first.

- The game says « escorté au point de regroupement », but the player can see neither the point nor a van, and in free mode there is no cellular van. That matches « je sais même pas où les mettre ».
- (a) is the second source of confusion: the same groups are called « escorte » in the code but say « je protège l'élément désigné ». Their acknowledgements pollute the radio right after the player's orders, and they do not obey « Suivez-moi » the same way (they follow the engine).

## Problems, with evidence

1. **(Blocking) After a vehicle column stops, the commandant's units sit in « DESCEND » forever.**
   - Evidence: J1 shows every squad still `debarquer/en_place` 110 s after the stop, the chip « MISTRAL · DESCEND », and the IA `mode adjoint, phase arrivee`.
   - Cause: `follow.ts` `endConvoy()` issues `debarquer` and gives no follow-up order. `police.command` in `adjoint` mode does not deploy for a player commandant.
2. **(Blocking) The BRAV-M cannot be ordered from the field, does not follow, and stalls on short trips.** See §2, causes 1 to 4.
3. **(Major) A chef de section's section does not follow him at the start.** `setup.ts` lines 218–224 (`s.members.length > 1`). The chip reads « MISTRAL 1 · SANS ORDRE ».
4. **(Major) The commandant on foot has nobody following him in free mode until he presses F→1.** `setup.ts` excludes `commandant` / `commissaire` from the initial `suivre`. This contradicts « tout le monde doit me suivre ».
5. **(Major) A field order can only move the whole company as one block.** The wheel addresses `ownSquadId` (`orderWheel.ts` line 333); it takes about 60 s to move 40 m (T2). There is no field way to send « a section » or « the BRAV-M ».
6. **(Major) Radio order inversion and saturation.** Separate channels for the order (`commandement`) and the acknowledgement (`unite`), plus the CENTRAL spam: « REÇU » arrives before the order, and the BRAV-M acknowledgement comes at 17 s.
7. **(Major) The implicit move in vehicles above 250 m can stall with no message.** T8: Bastille seed 5, section MISTRAL 1, « ligne » at 394 m on « passage Louis-Philippe ».
   - The lead van stays `bloque/obstacle` for more than 50 s; the second van stays `attente/personne` (a standing person, known leftover).
   - The stage stays `route` for more than 6 min.
   - This is the same family as the known blocker (`convoy.thinkRoute` detaches only vehicles i ≥ 1) and gives a second reproduction.
8. **(Major) « Charger » / « Gaz » are refused on the wheel at the start.** `authorizedForce = 1`. Their sectors are grey, and the key to unlock them is in the map (L), not on the field.
9. **(Minor) Wording:**
   - « MISTRAL ICI MISTRAL »;
   - the completion is sent to CENTRAL;
   - an « Avancer » order is reported as « Barrage en place »;
   - the acknowledgement's distance differs from the order's (« QUATRE-CINQ » for 40 m);
   - a chef de section is labelled « Chef de groupe — MISTRAL 1 ».
10. **(Minor) The BRAV-M player's own wheel addresses « votre binôme »** (his own pilot). There is no BRAV-M chief poste.

## Facts a designer needs

- A field order (wheel) always targets one squad. For the commandant, that squad is the entire company: 69 agents moving as one block formation.
- The BRAV-M (`FAUCON n`) is a top-level unit, outside the company. « Toute la compagnie », the wheel, « Suivez-moi » and the column all ignore it. The water cannon, the Centaure and the drone are inside the company.
- Free mode starts every unit `libre` (« SANS ORDRE »). Only the chef de groupe, the BRAV-M pilot and the engine crews get an initial `suivre`.
- After riding in a column, groups get `debarquer` and nothing more. Nobody re-tasks them for a player commandant.
- Force starts at « mains nues », so charge and gas are locked until sommations plus authorisation (map, L).
- Agents begin moving within 1–2 s of any order. The perceived latency comes from the radio and from block formation:
  - forming a column: about 8 s;
  - alignment and FORM_TIMEOUT: up to 25–40 s;
  - the BRAV-M's remount and stand-off: 40–80 s.
- Acknowledgements and orders travel on two independent radio channels.
- There is no world marker for a wheel order, and the commandant has no « Ma mission » card. His only field feedback is a 2.5 s toast, the radio and the unit chip, and the chip shows internal orders (« MONTE », « DESCEND », « EN FILE »).
- The detainee « point de regroupement » is invisible, and free sessions have no cellular van.

## Not played

- the browser (e2e) and the phone at 844x390: the touch layout was checked only in code (`input/touch/layouts.ts`, `quickActions.ts`);
- the player driving the column himself (only riding as a passenger, J1);
- special missions (catalogue);
- patrol mode in a run: its scope was read in code only;
- the BRAV-M on a service day with the player as BRAV-M;
- the merge-commissariats branch.

Note: an unrelated probe, `crs-simulation/tests/unit/zz-sonde-arrivee.test.ts`, belonging to another agent, is present in this worktree. It is not mine and I left it untouched.
