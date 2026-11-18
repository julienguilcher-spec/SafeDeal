# Diagnosis: "I arrived at a demonstration and could give zero orders"

Worktree `/tmp/claude-0/hunt/ordres-directs` (HEAD 6f3f12e, game v20 plus the order-card fixes). No source file was modified.
Raw robot output (every table, every radio log): `runs.md` in this folder. The probe that produced it is kept as
`sonde-arrivee.test.ts.txt` (it was `tests/unit/zz-sonde-arrivee.test.ts`, now deleted).

## 1. What was played

A headless robot (`createTestContext`, real Paris map, modules env…command+missions+patrols+objectives). It plays the
way the player does:

* it launches the session from the home-screen draft (`buildSessionConfig(sanitizeDraft(...))`, the same as the
  "Mode libre" screen) or from a mission sheet (`pickMission`, the same as "Missions spéciales");
* service day: it walks to the vehicle named by the « Embarquez : … » objective and gets in, as a passenger or as the
  driver (it then drives the vehicle down the street path to `journee.destination` at 9 m/s);
* "arrival" is when the service day says `sur_place` (the unloading has started), or, in a second variant, when the
  column stops (`convoy stage = stationnement`): that is the moment the player sees the demonstration through the
  window and gets out;
* from arrival, every 10 s it tries the next order on this list, through the same code as the UI:
  field block « Suivez-moi à pied » / « Suivez-moi en véhicules » (`core.callFollow`), every wheel sector (same squad,
  aim point and geometry as `OrderWheelScreen.issue`: 3 Avancer, 4 Ligne, 5 Interpeller on the nearest protester,
  6 Pousser, 8.1 to 8.8 of the « Plus… » ring), the adjoint's first executable proposal (`police.command.accept`),
  and on the command map each intention with the card's own proposal (`intentCandidates()[0]`, `buildCard`,
  default line, `defaultWho(proposeWho())`, `sendCardLine`).
* for each attempt: accepted or refused (with the text), delay to the first agent of the addressed unit moving
  more than 2 m, the unit state 5 s and 10 s later (order type, how many agents are seated in a vehicle, how many
  are moving, convoy stage), and the service-day / convoy / AI-command stage. Single-order runs observe 5, 20, 60 s.

| # | mode | poste | place, seed | arrival |
|---|---|---|---|---|
| R1 | service day (free mode default) | commandant (terrain) passenger | République, 7 | sur_place at t=987 s |
| R2 | same, out at the column stop | commandant passenger | République, 7 | stationnement at t=436 s |
| R3 | service day | chef de groupe passenger | République, 7 | t=554 s |
| R4 | service day | chef de section (capitaine) passenger | Bastille, 5 | t=612 s |
| R5 | free mode, « Déjà sur place » | commandant | Concorde, 21 | t=3 s |
| R6 | service day | BRAV-M brigadier-chef pilote | République, 7 | never (see P8) |
| R7 | service day | commandant DRIVER of the VL | Concorde, 21 | t=823 s |
| S1-S4 | single orders observed 60 s | commandant | Concorde 21 / République 7 | |
| M1 | mission cdt-01-prise-de-commandement | commandant passenger | République, 7 | t=610 s |
| M2 | mission cg-01-six-dont-moi | chef de groupe passenger | Bd Richard-Lenoir, 7 | t=868 s |
| M3 | mission bravm-01-en-selle | BRAV-M gardien | 7 | t=1 s |
| R8 | free mode sur place | chef de groupe | Bastille, 5 | t=3 s |
| R9 | free mode sur place | BRAV-M brigadier-chef | Concorde, 21 | t=3 s |

Command to replay one run (copy the probe back first):
`SONDE_MODE=journee SONDE_ROLE=chef_groupe SONDE_PLACE=republique SONDE_SEAT=passenger SONDE_SEED=7 npx vitest run tests/unit/zz-sonde-arrivee.test.ts`
(`SONDE_MODE` journee | surplace | mission, `SONDE_AT=stationnement`, `SONDE_SINGLE=carte:envoyer`, `SONDE_MISSION=<id>`).

## 2. The short answer

The player is right, and it is not one bug. Orders are almost never *refused* (only « Charger » / « Gaz » without the
force authorisation, « Pousser » without a Centaure, and the card's own proposal in three cases). The problem is that
orders are **accepted, acknowledged on the radio, and then nothing happens on the ground**. Four mechanisms do this,
and they stack exactly in the minute after arrival:

1. **A unit sitting in its vans ignores every order except « Suivez-moi à pied »** (P1). The radio still says
   « REÇU, tortue, boucliers hauts » and even « Tortue formée » / « Bond effectué, ligne réalignée » / « Barrage en
   place » while 81 of 87 agents are still seated.
2. **A map order to the player's own group or section makes it board and wait for the player, forever** (P2): the
   convoy waits for him to get in (up to 5 min), and every later order is accepted while the group stays aboard; the
   convoy even pulls back to the vans the agents that « Suivez-moi à pied » got out.
3. **Arrival is not one moment but up to ten minutes**: the column stops, then « stationnement » lasts 20 s to 551 s
   with everybody seated (P3); when it ends the convoy orders « débarquer » to the whole company and overwrites
   whatever the player had ordered (P4); the adjoint is silent until the unloading is over, which is 120 s if the
   player gave an order meanwhile (P5).
4. **The AI company commander keeps ordering the player's own section** when the player is chef de section (P6).

The normal case, when nothing of the above is in the way (free mode « Déjà sur place », units on foot), works: the
first agent moves 0.5 to 2.5 s after the order, for every channel.

## 3. Results, condensed

Accepted = `ok`. "Seated" = agents of the addressed unit in a vehicle 10 s later. Full tables in `runs.md`.

### R5 commandant, free mode sur place, Concorde (the healthy case, then P1)

| t | attempt | accepted | first move | 10 s later |
|---|---|---|---|---|
| 0 | Suivez-moi à pied | yes | 1.5 s | MISTRAL suivre, 54 moving |
| 10 | Envoyer (card: MISTRAL 3 « part à pied ~2 min ») | yes | 2.0 s | avancer, 16 moving |
| 30 | Adjoint (« … QUATRE-ZÉRO débouchés … mise en place du dispositif ») | yes | (plan) | |
| 40 | Disperser (MISTRAL 3) | yes | 1.5 s | refoulement, 15 moving |
| 50 | **Suivez-moi en véhicules** | yes | 1.0 s | embarquer, boarding |
| 60-100 | Ligne, Bloquer, Interpeller, Encercler | yes | 0.5-1 s | company 22→82/87 seated |
| 110-170 | Tenir, Bond, Repli, Cesser, Libre, Tortue | **yes** | 0.5-2.5 s (a driver) | **84/87 seated, 0-4 moving** |
| 180/190 | Charger / Gaz | **no** « Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. » | | |
| 200 | Pousser | **no** « Aucun Centaure disponible sous vos ordres. » | | |
| 210 | Suivez-moi à pied | yes | 0.5 s | 15/87 seated, 72 moving |

Radio during 110-170 while 84/87 were seated: « CENTRAL ICI MISTRAL. Bond effectué, ligne réalignée. PARLEZ. »,
« ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ. ».

### R3 chef de groupe, service day, République (P2)

| t | attempt | accepted | first move | 10 s later |
|---|---|---|---|---|
| 0 | Suivez-moi à pied | yes | 0.5 s | suivre, 1/6 seated |
| 10 | Envoyer (card: own group « part en véhicules (~1 min) ») | yes | 1.0 s | embarquer, **convoy route + awaitingPlayer** |
| 20-50 | Avancer, Disperser, Suivez-moi véhicules | yes | 1 s | 1→5/6 seated, convoy still waiting |
| 60-170 | Ligne, Bloquer, Interpeller (wheel and card), Encercler, Tenir, Bond, Repli, Cesser, Libre, Tortue | **yes, all** | **>10 s** | **5-6/6 seated, 0 moving, convoy waiting** |
| 210 | Suivez-moi à pied | yes | 0.5 s | debarquer, still 5/6 seated |

The same in M2 (mission cg-01 played as chef de groupe): from t=40 to t=200 every order accepted, 6/6 seated, 0
moving, and « Suivez-moi à pied » at t=210 leaves 6/6 seated. R4 (chef de section): « Bloquer » at t=70 boards the
section, and from t=80 to t=200 the section is 18/18 seated, 0 moving, through Interpeller, Encercler, Tenir, Bond,
Repli, Cesser, Libre, Tortue; radio: « MISTRAL 1 CHARLIE, on n'attend plus que vous : embarquez ! ».

### R1 / R2 / R7 / M1 commandant, service day

| | R1 passenger République | R2 out at the stop | R7 driver Concorde | M1 cdt-01 |
|---|---|---|---|---|
| player boards | t=40 | t=40 | t=40 | t=20 |
| column leaves | t=128 (88 s after he boarded) | t=128 | t=47 | t=45 |
| column stops (stationnement) | t=436 | t=436 | t=433 | t=590 |
| sur_place / unloading starts | **t=987 (551 s seated after the stop)** | (still parking at +210 s) | **t=823 (390 s)** | t=610 (20 s) |
| unloading over (convoy en_place) | +120 s | | +120 s | +120 s |
| first adjoint proposal | +130 s after sur_place | none in 210 s | +130 s | +130 s |
| « Suivez-moi à pied » | moves 0.5 s | moves 0.5 s, **overwritten at the end by « débarquer »** | 0.5 s | 0.5 s |
| map orders to a section | always « part en véhicules (~1 min) », still driving at +60 s (S4) | same | same | same |

All rotation orders were accepted in these runs (except Charger/Gaz/Pousser). After « Suivez-moi en véhicules » the
company stays seated through Ligne…Tortue exactly as in R5 (M1: 44/44 seated from t=110 to t=200, radio « CENTRAL ICI
MISTRAL. Barrage en place, face nord-ouest, UN à pied. PARLEZ. »).

### Single orders, 60 s

| run | order | first move | +5 s | +20 s | +60 s |
|---|---|---|---|---|---|
| S1 Concorde sur place | Envoyer → MISTRAL 4 on foot | 1.5 s | avancer, 13 moving | 16 moving | 16 moving (still walking, ~2 min announced) |
| S2 Concorde | Interpeller → FAUCON 1 on foot « sans fait constaté, personne n’est interpellé » | 2.0 s | colonne | colonne | colonne |
| S3 Concorde | Bloquer → MISTRAL 3 + 4 | 1.5 s | couper_circulation | moving | in place (0 moving) |
| S4 service day République | Envoyer → MISTRAL 2 « en véhicules (~1 min) » | 2.0 s | 19/19 aboard, embarquer | convoy route | **still driving at +60 s** |

## 4. Problems, with evidence and root cause

### P1 (bloquant) A unit that is aboard ignores every order except « Suivez-moi à pied »; the radio says it obeyed

* Evidence: R5 t=110-170, R1 t=60-200, M1 t=110-200, R6/R9 (BRAV-M on its motorbikes), R8 (chef de groupe): order
  accepted, « Ordre donné : MISTRAL se protège (tortue) », acknowledgement on the radio, then 84/87 (R5), 44/44 (M1),
  6/6 (R8), 5/5 (R9) agents stay seated with 0 moving for as long as we watched (up to 150 s). Reports like « Bond
  effectué, ligne réalignée », « Tortue formée », « Barrage en place … UN à pied » are spoken by units in their vans.
* How the player gets there: one press of F→2 « Suivez-moi en véhicules » (one of the four lines of the field block),
  or a column that has not finished unloading, or any map order that boarded the unit (P2), or the BRAV-M chief
  whose men are on their bikes.
* Root cause: `src/sim/police/tree.ts`, `refreshFormable()`: an agent is `present` only if
  `p.vehicleId === 0`, so seated agents are not `able` and every formation order (`maneuver.ts startOrder`: ligne,
  tenir, bond, tortue, couper_circulation…) is run with the agents already on foot (often only the drivers' escort or
  nobody). Nothing makes them get out: `src/ui/command/core.ts CommandCore.issue()` sends the order as is when the
  point is closer than `MOTOR_DISTANCE` (250 m), and only `callWithMe` (« Suivez-moi à pied ») calls
  `follow.onFoot`, which dismounts. The completion reports come from the maneuver layer, which counts the agents it
  has (0 or 1) as "the unit".
* Fix: in `CommandCore.issue()`, for any foot order (everything except embarquer / avec_moi / colonne /
  faire_mouvement), if members of the unit (or its children) are aboard, chain « débarquer » then the order, with
  the existing `afterConvoy`-style hand-over (or `follow.onFoot`-like dismount then `ctx.squads.issue`). Better and
  more general: in `src/sim/police/maneuver.ts startOrder`, when a foot order arrives and agents of the unit are
  seated in its own vehicles, start a dismount step first (the same `startDisembark`) and run the order when it is
  done. Also: no « … en place » / « Bond effectué » report when fewer than half the agents took part.

### P2 (bloquant) A map order to the player's own group or section: it boards and waits for the player, every later order does nothing

* Evidence: R3, R4, M2 (chef de groupe / chef de section, service day and mission). « Y aller » or « Barrer la rue »
  on the card proposed the player's own unit « part en véhicules (~1 min) ». The unit boards, convoy stage
  `route` with `awaitingPlayer` true, the radio repeats « MISTRAL 1 CHARLIE, on n'attend plus que vous : embarquez ! »
  and the player — on foot, who just *sent* that unit somewhere — has no idea he must get in. All following orders
  (wheel, card, Tenir, Tortue…) are accepted and the group stays 6/6 (18/18) seated for the whole two minutes; even
  « Suivez-moi à pied » leaves it seated (R3/M2: 5-6/6 still aboard after 10 s).
* Root causes:
  1. `src/ui/command/core.ts CommandCore.issue()` → `motorize()` → `police.command.arrive(..., boardFirst: true)`
     for the player's own unit; `src/sim/police/command/convoy.ts ConvoyControl.awaitPlayer()` then holds the
     departure up to `PLAYER_WAIT` = 300 s because the player is a member (`core.members` includes him).
  2. There is no way to cancel a convoy: no new order from `CommandCore.issue()` (it only clears `afterConvoy`) nor
     `ctx.squads.issue` stops `ConvoyControl` (no `cancel` method; `system.ts` 'order:issued' only informs the
     adjoint). The convoy keeps the unit "boarding", and `ConvoyControl.boardStragglers()` sets `agent.boardId`
     directly, which sends agents back to the vans even under another order (that is why « Suivez-moi à pied »
     fails). After 300 s the convoy leaves for the stale destination.
  3. The card's travel estimate uses the unit position; `CommandCore.farFor()` uses the leader, who is the player
     (chef de section R4 t=10: the card said « part en véhicules » and the section walked).
* Fix: (a) never motorize a unit that contains the player unless he is aboard one of its vehicles: give the order on
  foot (or, if really far, say so on the card: « vous montez avec eux ? » with Entrée = yes) — `CommandCore.issue`
  and `intents.ts`/`bestUnit.ts travel()` must use the same rule; (b) add `ConvoyControl.cancel(squadId)` (stop
  autopilots, clear `boardId`, drop the convoy, stage `annule`) and call it from `CommandCore.issue()` for every
  squad that receives a new player order, and from `follow.onFoot / column`; (c) `awaitPlayer` should not apply to a
  convoy started by a player order unless the player said « en véhicules avec moi ».

### P3 (majeur) The column stops and the player sits for up to nine minutes before anything can happen

* Evidence: stationnement (column stopped near the demonstration, everybody seated) to `sur_place`: R1 551 s, R7
  390 s, R4 251 s, M2 149 s, M1 20 s, R3 20 s. At the station: the player boards at t=40 and the column leaves at
  t=128 (`BOARD_MAX` 120 s after the 9 s dispatch) even though everybody is aboard.
* Root cause: `src/sim/police/command/convoy.ts thinkPark()`: while any vehicle is still "joining" (driving alone to
  the line), the parking waits up to `PARK_WAIT_JOINING` = 720 s (`PARK_WAIT` 300 s otherwise); the 20 s deadlock
  rule never fires because the straggler keeps `stallAt` fresh. `thinkBoard()` waits `BOARD_MAX` (120 s) unless
  the « embarquer » order reports done; the reported "done" comes late (stragglers, the cellular van).
* Fix: unload each vehicle as soon as it is stopped within ~60 m of the destination line (per-vehicle disembark),
  never hold the whole company for the last vehicle; cap the parking at 60 s when the player is aboard. At the
  station, leave as soon as every agent is aboard (or 20 s after the player boarded).

### P4 (bloquant when it happens) The end of the parking overwrites the player's orders with « débarquer »

* Evidence: R2, the player got out when the column stopped and gave orders. At t=210 he pressed « Suivez-moi à
  pied »; 5 s later the company order was `debarquer` and the radio said « ICI MISTRAL. REÇU, je débarque et je me
  mets en place. TERMINÉ. » right after « Me suivre à pied : en formation derrière moi. ».
* Root cause: `convoy.ts beginDisembark()` calls `core.issue(squadId, {type: 'debarquer'})` on the company when the
  parking ends, whatever the squad's current order (player-issued or not). `journee.ts arrived()` then ejects the
  player-passenger.
* Fix: in `beginDisembark()`, skip squads (and children) whose current order was issued by the player after the
  convoy started (`order.issuedBy === player && order.issuedAt > c.status.t0`); better, P2's `cancel` on any player
  order.

### P5 (majeur) No adjoint proposal during the first two minutes; any player order makes it worse

* Evidence: every service-day run: 0 proposals at the « adjoint » attempt (t=30) and until ~130 s after `sur_place`;
  sur place (R5) the first proposal exists at t=3 s. For the chef de groupe / section and BRAV-M postes there is never
  any proposal (the company is in « ia » mode: `Command.act()` executes instead of proposing).
* Root cause: `src/sim/police/command/command.ts thinkDeploy()` returns early while `convoy.arriving()` (route,
  stationnement, débarquement). The débarquement stage ends only when the « débarquer » order reports done
  (`convoy.ts update()` case 'debarquement'); if the player replaced it with any order, it never reports and the
  stage ends after the 120 s fallback.
* Fix: end the débarquement stage when no agent of the company is seated any more (or when the player gave an order),
  not on the order's completion event; let the adjoint propose « mise en place du dispositif » as soon as the column
  stops. For postes that do not command the company, show the AI commander's order instead (see facts).

### P6 (majeur) Chef de section: the AI company commander orders the player's own groups

* Evidence: R4, radio « MISTRAL 1 BRAVO: ICI MISTRAL UN BRAVO. REÇU, ligne de barrage, rue Saint-Gilles, face est. » and
  « MISTRAL: MISTRAL 1 CHARLIE, portez votre groupe Boulevard Beaumarchais. » while the player commands MISTRAL 1;
  MISTRAL 1's children show `proteger` orders the player never gave.
* Root cause: `command.ts buildElements()` excludes from the AI's elements only a group whose `leaderId` is the player
  (chef de groupe) and pinned units (`core.pinned`, missions); a section led by the player is still an element, and
  its groups are split as free elements.
* Fix: in `buildElements()`, skip any section or group whose leader is the player, or which is under a squad led by
  the player (`core.isUnder`), exactly as for the chef de groupe.

### P7 (majeur) The card's own proposal is sometimes an order that cannot work

* « Encercler » for a chef de groupe or a BRAV-M chief (R8, R9): « [Encercler (nasse) · personne] Choisissez d’abord
  l’unité (U). » — the default proposal has no unit, so Entrée does nothing. Cause: `bestUnit.ts proposeWho()` finds
  no candidate for a nasse with a single unit in scope; the intent is still offered (`intents.ts intentCandidates`).
  Fix: hide or grey « Encercler » when fewer than two units can be ordered, with the reason.
* « Interpeller » with no offence seen (M1, M2, R8): the card says « … ne peut interpeller personne et refusera
  l’ordre » and Entrée still sends it (S2: BRAV-M walks to the crowd and does nothing). Fix: the default line should
  be « Aller constater » (observe and arrest on the first offence) or the line should be locked with that text.
* Wheel sector 5 « Interpeller » addresses the commandant's whole company (87 people, `wheelSquad` = scope's own
  squad); sectors 3-8 for a commandant move the entire company including the water cannon crew. Fix: the wheel of a
  commandant should address « l’unité la plus proche » or the selected unit, not the company root.
* « Bloquer une rue » default target at Concorde is « la terrasse de l'Orangerie » (a garden terrace) — minor.

### P8 (majeur) BRAV-M as the player

* BRAV-M chef (brigadier-chef) in the service day (R6): the BRAV-M leaves only behind the player on his motorbike
  (`journee.ts dispatch()`: `solo`, the unit waits for its leader); a player who waits for the column gets nothing,
  forever (no arrival after 1500 s). The objective says « En selle, en tête de la BRAV-M : Rue du Temple » but nothing
  says that the others wait for him.
* The player's BRAV-M unit (`BRAV-M 1`, 5 men) is a plain unit, not a `bravm.ts` special unit: the card says « avance
  en formation … boucliers levés », « part en véhicules (~3 min) » and then walks; on its bikes it ignores every
  order (P1).
* Gardien BRAV-M (M3, mission bravm-01) is read-only: only F→1 / F→2. « Suivez-moi à pied » after « Suivez-moi en
  véhicules » left 5/5 on the bikes after 10 s.
* The commandant ordering the FAUCON BRAV-M group (other robot in this folder, `sonde2-bravm-*.log`, not mine but
  consistent): « Avancer » 50 m makes it mount, report « en colonne vers le point », and stop « Arrêtés à 50 mètres
  du point, accès bloqué » without having moved: `bravm.ts claim()/begin()` always rides for 'avancer', even 50 m.
  Fix: 'avancer' under `RIDE_BEYOND` (60 m) on foot.

### P9 (mineur) Texts that lose a non-expert

* The scope label of a chef de section is « Chef de groupe — MISTRAL 1 » (`scope.ts`, `roleLabel('chef_groupe')`).
* A chef de section or BRAV-M chief speaks to himself: « MISTRAL 1 ICI MISTRAL 1. Bond offensif… »
  (`core.ts issue()`: `from = callsign()` = his own unit, which is also the addressee).
* Refusal « la force autorisée n’est que : mains nues » does not say who can authorise or which key (the commandant
  can, with L).
* The order acknowledgement often comes before the order on the radio queue (other robot: accusé at 3.6 s, order
  phrase at 6.3 s).

## 5. Facts a designer needs

* In free mode, the default departure is **a service day from a station** (`scenario.ts sanitizeDraft`, `journee:
  true`, `depart: 'auto'`). « Déjà sur place » is the only start where the units are on foot at the demonstration.
* Normal case timings (service day, commandant passenger, République): boarding objective at t=1, player in at
  t=40, column leaves t=128, column stops t=436 (308 s of road), unloading starts t=987, unloading over t≈1107,
  first adjoint proposal t≈1117. **The first order really executed on site comes ~11 minutes after the column
  stopped near the demonstration**, unless the player happens to use « Suivez-moi à pied », which works in 0.5 s at
  any stage.
* The company parks 85-125 m from the rally point (`placement.ts CROWD_RINGS`), along a street; once unloaded,
  sections are often more than 250 m from the crowd (`MOTOR_DISTANCE`), so every map order from there re-boards the
  section, drives ~1 min, unloads and then acts: Envoyer was still driving 60 s after the order (S4).
* Who can order what (`scope.ts`): commandant / commissaire = everything (26 units with the patrol cars); chef de
  groupe = his group only (1 unit); chef de section (capitaine) = his section and its groups (4 units); BRAV-M
  brigadier-chef = his own 5-man unit (not the FAUCON group); every other poste, including BRAV-M gardien and patrol
  crews, = read-only (only F→1, F→2, F→7).
* The field « ORDRES » block (four lines) has exactly one line that always makes something visible happen
  (« Suivez-moi à pied »). « Suivez-moi en véhicules » given on foot boards the whole unit and parks it, waiting —
  and then P1 makes every other order fail. This is the most likely path to "les CRS me suivent mais n'ont pas
  d'ordre".
* Charge and gas are refused until the force is authorised: by default `authorizedForce` = 1 (« mains nues ») and
  `sommation` = 0. A commandant can authorise (L); a chef de groupe cannot.
* Cellular vans (`fourgon_cellulaire`) at the arrival: Rue du Temple seed 7, with a driver, 58-225 m away (it came with
  the column); Concorde seed 21 service day and cdt-01, without a driver, left at the station 2 km away; free mode
  sur place: present 63-74 m away, no driver. bravm-01: none. So whether the player has a van for his arrested
  people is random by station and mission (`setup.ts cellToRear`: « sans équipage : il reste au stationnement quand
  la compagnie part »).
* The AI company commander only proposes (adjoint mode) when the player is the company leader (commandant). For chef
  de groupe / section / BRAV-M the company is in « ia » mode and the AI gives orders directly, never proposals: the
  « L’ADJOINT PROPOSE » block never appears for those postes.

## 6. Not played

* Patrol mode sent to a demonstration: the patrol crew is read-only by design (`scope.ts`: « patrouille » → lecture);
  not run.
* Browser / touch (844x390) and the real key handling of the wheel (F, digits, Entrée): the robot calls the same
  functions as the screens, not the DOM. The tactical map opened while seated was checked only through
  `cardEnvFromCore` (scope stays « tout », 26 units listed): no read-only-by-mistake was seen.
* The commissariat feature being merged (units engaged from a station, « Rentrer au commissariat ») is not in this
  worktree.
* Commissaire, Centaure / canon à eau chief, chef de section in a mission, the second service-day intervention.
* Detainee hand-over and escort (not part of this diagnosis; see the other robots in this folder).
