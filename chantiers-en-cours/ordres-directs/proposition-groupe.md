# Proposal « Mes hommes »: one group, seven numbered verbs, one key for the obvious order

Angle: the units with the player form his **manoeuvre group**, always summed up in one compact line (who, how many,
what they are doing, for whom). A fixed set of **seven numbered verbs**, in the same order on the field, in the wheel
and on the command map. **Entrée** gives the obvious order for what he is looking at, with no menu. **U** cycles
« à qui je parle ». Nobody is ever « SANS ORDRE ».

Grounded in worktree `/tmp/claude-0/hunt/ordres-directs/crs-simulation` (HEAD 6f3f12e) and the three diagnoses in this
folder (`diag-arrivee.md`, `diag-terrain.md`, `diag-interpelles.md`). Nothing in the project was modified. No probe was
added.

---

## 0. The idea in 30 seconds

```
 ┌───────────────────────────────────────────────────────────────┐
 │ MES HOMMES · 3 sections + BRAV-M · 74            Tab : carte  │  ← who, how many
 │ AVEC MOI · en ligne face à la foule, 8 m derrière vous        │  ← what they do, for whom
 │ ⏎ Bloquer : rue Saint-Gilles (60 m)          U : à qui ?      │  ← the obvious order, and to whom
 └───────────────────────────────────────────────────────────────┘
   F, then:  1 Avec moi · 2 Envoyer · 3 Bloquer · 4 Disperser · 5 Interpeller · 6 Secours · 7 Plus…
```

* **Entrée**: does what line 3 says, right now. That is one press for the natural order.
* **F then a digit**: the seven verbs. The digits are the same in the wheel, on the map bar and on the phone fan.
* **U / Maj+U**: cycles who receives the next order: « Mes hommes » → BRAV-M → MISTRAL 1 → MISTRAL 2 → … → engins →
  CELLULAIRE 1 → back to « Mes hommes ». Aim at a policeman and press U: his unit is chosen directly.
* Every order answers **in the line within 0.3 s** (« REÇU »). The first agent moves within 2 s. If the unit cannot
  move yet, the line says why and when (« descendent des cars, 12/19 — prêts dans ~15 s »).

The command map stays for the big picture. It uses the same verbs, the same digits, U and Entrée. The field orders
**are** the map's order card without the map: same `buildCard` → `proposeWho` → `sendCardLine` pipeline, with the
point the player is looking at as the place.

---

## 1. Why this angle answers the brief

| Player's words | What « Mes hommes » changes |
|---|---|
| « Je pouvais donner zéro ordre, ils ne suivaient pas » | Orders are never accepted and then ignored. Seated units get out on their own (§6.1), convoys can be cancelled (§6.2), and the line always shows the real state. |
| « La BRAV-M, j'arrivais pas à leur donner d'ordre, ils bougeaient pas » | The BRAV-M joins the company tree, so it is inside « Mes hommes » and second in the U cycle. Short trips are done on foot, and the motos stop waiting 40–80 s (§5). |
| « j'interpelle des gens, mais je sais même pas où les mettre … il faut toujours qu'il y ait quelques wagons » | Cellular vans are always present, scaled with the crowd, and named (« CELLULAIRE 1 · 3/8 »). They are units in the U cycle with a world marker. While the player is escorting someone, Entrée hands the detainee to a binôme. A full van leaves for the station and another one comes (§7). |
| « Les CRS, ils me suivent, mais en fait, ils n'ont pas d'ordre » | « Avec moi » becomes a real order with postures: in a column while he walks, in a line facing the threat when he stops. The chip never reads « DESCEND » or « SANS ORDRE » (§4). |
| « je peux donner directement des ordres et ils y vont direct » | Entrée, or F plus a digit. No map, no card, no confirmation. Ack in 0.3 s, movement in ≤ 2 s (§3, §8). |
| « beaucoup trop de boutons » | The four-line ORDRES block, the 8-sector wheel and two phone pills become one 3-line block, a 7-sector wheel and one smart pill (§10). |

---

## 2. The group and « à qui je parle »

### 2.1 « Mes hommes » = the units whose order is « avec moi »

* **Definition.** Every squad under the player's command (`CommandCore.canCommand`) whose current *player* order is
  `suivre` on the player (contract `SquadOrder.type = 'suivre'`, `targetId = player`). It is computed by a new pure
  function `manoeuvreGroup(core)` in `src/ui/command/group.ts` (new, about 120 lines), refreshed every 0.25 s like
  `UnitHud` (`hud.ts`, `PERIOD`).
* **At start everyone is in it: « tout le monde doit me suivre, c'est obligatoire ».**
  * `gameplay/session/setup.ts` lines 218–224 issue the initial `suivre` only to squads the player leads that have more
    than one direct member. That rule changes to *every top-level squad under the player's scope*: the commandant gets
    the whole company, the chef de section gets his section (its groups get it through the section), the BRAV-M chief
    gets his BRAV-M.
  * Exceptions are the units that are pinned (`core.pinned`, missions) and the armoured-vehicle escorts
    (`attachEscort`). They keep their task and appear as « détachés ».
* **A unit sent elsewhere leaves the group**, because its order is no longer `suivre`. It appears in the « Détachés »
  line (§4.3). Verb 1 « Avec moi » given to it brings it back.
* **Who it applies to.** The commandant (whole company + BRAV-M + engins + cellulaires), the chef de section (his
  section), the chef de groupe (his group), the BRAV-M chief (his BRAV-M; new poste, §5.3), and the patrol chef de bord
  (his crew, verbs 1 and 6 only). Read-only postes (CRS, gardien BRAV-M, engine crews) have no block. They keep the
  « Ma mission » card (`ui/hud/mission.ts`) with the commandant's order, as asked (« il faut que je voie l'ordre du
  commandant quand je suis CRS »).

### 2.2 How an order to « Mes hommes » is shared out

A field order to the whole group must **not** move 69 agents as one block. Today the wheel addresses
`scope.ownSquadId` (`orderWheel.ts` line 333), and `system.ts handleOrder` runs `eachDescendant + startOrder`: 40 m
takes about 60 s. The new rule, in `group.ts dispatchToGroup(verb, where)`:

| Verb to « Mes hommes » | Who actually goes | The others |
|---|---|---|
| 2 Envoyer | each section of the group gets its own `avancer` with its own geometry (one point each, staggered 8 m along the street, from `autoLineFor(where, env, units)` in `preview.ts`) | — |
| 3 Bloquer | the card's own choice, `defaultWho(proposeWho(line, where, env))`, **restricted to the group**: the nearest free section, or two if the street is wider than one section's front (`autoLine`, `AUTO_LINE_MAX` 40 m) | stay « avec moi » |
| 4 Disperser | the sections nearest the crowd (the card's choice) | stay « avec moi » as a second line |
| 5 Interpeller | one binôme from the nearest group (or the BRAV-M if it is in the group and the target is > 40 m away) | stay |
| 6 Secours | not a unit order: pompiers / SAMU at the point (`requestRescueAtPlayer`) | — |
| 1 Avec moi | the whole group, re-formed behind the player | — |

The line says who was picked: « ⏎ Bloquer : rue Saint-Gilles — MISTRAL 1 y va ». U lets the player choose someone
else before pressing.

### 2.3 « À qui je parle » (U)

* **Cycle order** (fixed, so it can be learnt): « Mes hommes » → the **BRAV-M** (the unit most often detached) → the
  sections by number → the Centaure, the water cannon, the drone → the cellular vans → back to « Mes hommes ».
  Units outside the scope are skipped. A chef de groupe has a 1-entry cycle, so U does nothing and the hint is hidden.
* **Aim + U**: when `PlayerState.aimedPersonId` is a policeman under command, or the crosshair is within 6 m of a
  police vehicle, U selects that unit directly. This is one press, with no trackpad precision needed beyond « near it ».
* **One-shot.** The selection is for the next order. After the order it returns to « Mes hommes ». After 10 s without
  an order it also returns, and line 3 shows a shrinking bar. This avoids a forgotten selection that sends the wrong
  unit later.
* **Shared with the map.** U already cycles units on the map (`tacticalKeys.ts`, `case 'KeyU'`). A unit selected on
  the map is the field's « à qui je parle » when the map closes, and the other way round.
* Line 1 shows the selection: « À : BRAV-M FAUCON 1 · 12 · sur les motos ».

---

## 3. The seven verbs and the obvious order

### 3.1 The fixed list (same words as the map's intentions)

| # | Label (exact) | Sub-label | SquadOrder reused | Field geometry |
|---|---|---|---|---|
| 1 | **Avec moi** | « me suivent, à pied ou en véhicules » | `suivre` (on foot) / `avec_moi` → `follow.column` (in vehicles) | the player |
| 2 | **Envoyer** | « au point visé » | `avancer` (≤ 60 m from a crowd) or `colonne` (`NEAR_CROWD`, as the card does) | aim point |
| 3 | **Bloquer** | « la rue visée » | `couper_circulation` across the street (`streetAt` + `autoLineFor`), or `ligne` facing the crowd when one is within 30 m | aim point → street |
| 4 | **Disperser** | « repousser la foule visée » | `refoulement`; through the legal chain when the law is not there yet (§3.3) | aimed crowd |
| 5 | **Interpeller** | « la personne visée » | `interpeller` (`targetId`) | aim-assisted target (§3.4) |
| 6 | **Secours** | « pompiers, SAMU » | rescue request (`requestRescueAtPlayer`), ring 1 Pompiers / 2 SAMU | aim point, or the player |
| 7 | **Plus…** | « tenir, repli, tortue, charge, gaz… » | ring: 1 Encercler (`encercler`), 2 Tenir sur place (`tenir`), 3 Se replier (`repli`), 4 Se protéger (`tortue`), 5 Charger (`charge`), 6 Gaz (`disperser_gaz`), 7 Arrêter l'action (`cesser`), 8 Pousser un véhicule (`degager_obstacle`), 9 Laisser agir seuls (`libre`), 0 Bond en avant (`bond_offensif`) | as today |

No new order type is introduced. Everything in today's wheel (`WHEEL`, `MORE_RING`, `RESCUE_RING` in `orderWheel.ts`)
is still reachable (G7):

* « Suivez-moi à pied » and « Suivez-moi en véhicules » become verb 1. The mode follows how the player moves: on foot,
  everyone gets out and walks; at the wheel or aboard, everyone boards and follows. The other mode stays in the
  wheel's centre as a small toggle, and Maj+1 forces it.
* « Avancer jusqu'ici » becomes verb 2, « Tenir une ligne ici » becomes verb 3, and « Pousser un véhicule » moves to
  Plus… 8.

### 3.2 Entrée: the obvious order

`group.ts obviousOrder(core, aim)` is computed every 0.25 s and printed on line 3. **Entrée** (new button `order_go`,
§9) executes it. The **first matching rule wins**:

| # | Situation | Line 3 | Verb |
|---|---|---|---|
| a | The player is escorting a detainee (`Custody.escortedBy(player)`) | « ⏎ Confier l'interpellé à un binôme » | hand-over (§7.3) |
| b | « À qui » is a cellular van | « ⏎ CELLULAIRE 1 : venir chercher l'interpellé » / « ⏎ CELLULAIRE 1 : partir au commissariat (5/8) » | §7.4 |
| c | A person with a witnessed offence (`canArrest`) within 4° of the crosshair and 120 m | « ⏎ Interpeller : le lanceur de projectile (35 m) » | 5 |
| d | An injured person or a fire within 10 m of the aim point | « ⏎ Secours ici : blessé au sol » | 6 |
| e | A crowd (≥ 8 people within 15 m of the aim point), point ≤ 80 m | « ⏎ Bloquer ici, face à la foule » | 3 (`ligne`) |
| f | A street at the aim point, ≤ 80 m | « ⏎ Bloquer : rue Saint-Gilles (60 m) » | 3 |
| g | A street at the aim point, > 80 m | « ⏎ Envoyer : boulevard Beaumarchais (350 m) » | 2 |
| h | « À qui » is detached and nothing is aimed | « ⏎ MISTRAL 2 : revenir avec moi » | 1 |
| i | Nothing (sky, wall) | « ⏎ Avec moi » (greyed if they are already with him) | 1 |

Disperser is **never** the obvious order. It is coercive and must stay a deliberate choice (F then 4).

### 3.3 Locked verbs say why, in one sentence, with the fix on the same key

* The grey sectors of `orderWheel.ts` (`lockedReason`) keep their logic, with new text. A second press on the same
  key starts the fix through the existing legal chain (`legalChain.ts LegalChain`, `issuePlan` in `sendLine.ts`). The
  chain already runs with the map closed (`CommandSystem.update`).
* **Disperser**, sommations 0/3: « Disperser : il faut d'abord les 3 sommations. Encore 4 : je les fais faire
  (≈ 1 min 30), MISTRAL 1 se met en ligne en attendant. » The second press issues `ligne` facing the crowd at once,
  then runs `legalPlan` → `refoulement` when 3/3.
* **Charger / Gaz**:
  * commandant: « Charger : pas encore autorisé. Encore 5 : sommations puis autorisation (L sur la carte) »;
  * chef de groupe or section: « Charger : seul le commandant l'autorise. T : le lui demander à la radio. »
* **Encercler** with fewer than two units in scope: « Encercler : il faut au moins deux unités. » The sector is grey,
  and the card does not offer it as its own proposal (diag-arrivee P7).
* **Interpeller** with no offence: « Interpeller : personne n'a rien commis ici. Visez celui qui casse ou lance. »
  Entrée never offers it in that case (rule c).
* **Pousser un véhicule**: « Pas de Centaure avec vous. »
* Each refusal shows for 4 s **in line 3**, not as a separate toast.

### 3.4 Aim assist, for a trackpad and for a thumb

* **Person.** Rule (c) takes the best offender inside a 4° cone, not just `aimedPersonId`. He gets a red ground ring
  and a label above his head (« Lanceur de projectile ») as soon as he is the candidate. Nobody has to put the
  crosshair on a moving head.
* **Street.** Rules (e)–(g) draw the line that will be held as a stripe on the ground (`autoLineFor` geometry). It uses
  the objectives' point marker (the objectives API already draws points), with the street name on line 3.
* **Arrows only.** With no trackpad at all, ← → turn the view and Pg↑ / Pg↓ raise or lower it (`bindings.ts`). That is
  enough because the target snaps.

---

## 4. State clarity: nobody is ever « sans ordre »

### 4.1 « Avec moi » has postures (G2)

`gameplay/session/follow.ts FollowLeaderSystem` drives the formation **without overwriting `squad.order`**. The order
stays `suivre`, and the posture is a field of the follow state:

| Player | Posture | Line 2 |
|---|---|---|
| walks | file behind him (today's behaviour) | « AVEC MOI · en file derrière vous » |
| stops ≥ 3 s, crowd within 120 m | `ligne` 8 m behind him, facing the crowd's centre; the BRAV-M on its motos 30 m behind | « AVEC MOI · en ligne face à la foule » |
| stops ≥ 3 s, no crowd | `tenir`, grouped around him | « AVEC MOI · regroupés autour de vous » |
| gets into a vehicle | everyone boards their own vans (`follow.column`) | « AVEC MOI · montent dans les cars (14/19) » |
| drives | column behind him | « AVEC MOI · en colonne derrière vous » |
| gets out at the end of a drive | **`endConvoy()` no longer stops at `debarquer`**: it chains `debarquer` then `suivre` with the stopped posture | « AVEC MOI · descendent (12/19) — prêts dans ~15 s » |

The last row fixes diag-terrain blocker 1, where the company stayed « DESCEND » forever.

### 4.2 The chip shows the player's order, never an internal one

* The BRAV-M (`bravm.ts backToMotos`, `approach`) and the convoy overwrite `squad.order` with internal orders:
  `embarquer`, `colonne`, `debarquer`. The HUD then reads « MONTE », « EN FILE », « DESCEND ».
* New in `CommandCore`: `playerOrder(squadId)` keeps the last `SquadOrder` the player issued (set in `issue()` and
  `callWithMe()`), and `phaseOf(squadId)` reads the internal stage (convoy stage, BRAV-M stage, `en_place`).
* `unitChipText` (`hud.ts`) and the block show « BRAV-M · ENVOYÉE · remonte sur les motos » instead of « MONTE ».

### 4.3 The block, line by line (desktop, left zone under the mini-map, 262 px wide like today's)

```
Line 1  MES HOMMES · 3 sections + BRAV-M · 74                 Tab : carte
Line 2  AVEC MOI · en ligne face à la foule
Line 3  ⏎ Bloquer : rue Saint-Gilles — MISTRAL 1 y va           U : à qui ?
Line 4  Détachés : MISTRAL 2 barre rue de la Roquette · BRAV-M en route, 40 s      (only if any; 2 max, « +1 »)
Line 5  L'ADJOINT PROPOSE … Accepter P / Plus tard Maj+P                          (commandant only, when present)
```

* After an order, line 2 becomes the ack for 4 s: « REÇU — MISTRAL 1 : je barre rue Saint-Gilles, 60 m, ~40 s »,
  with a countdown that turns into « en place ».
* The ack text is drawn **as soon as `issue()` returns `ok`** (≤ 0.3 s), whatever the radio queue does (§8).
* A unit that cannot obey yet says so in the same place:
  * « MISTRAL 1 · descend des cars (6/19) — y va dès qu'ils sont descendus, ~15 s »;
  * « BRAV-M · remonte sur les motos — part dans ~6 s ».
* With an executant mission (chef de groupe in a mission), the « Ma mission » card keeps its place (top right) and the
  block keeps its own. They do not merge.

---

## 5. BRAV-M: an ordinary member of the group (G3)

### 5.1 In the tree

* `units.createBravm` gains `parentId` (`BravmOptions` in `sim/police/api.ts` line 159). `setup.ts` line 539 passes the
  company, as it already does for the water cannon, Centaure and drone.
* As a result `whoEnvFromCore`, `callFollow`, `follow.ts wholeCompanies` and the group all include it. « Avec moi »:
  the motos follow the player's vehicle, or the operators walk behind him if he is on foot and the motos are within
  `MOUNT_REACH` (40 m). Otherwise the BRAV-M rides to 30 m behind him.

### 5.2 Movement that arrives

All changes are in `sim/police/command/bravm.ts`:

* `begin()` for `avancer`, `colonne` and `repli`: **on foot when the point is under 150 m** and the unit is dismounted.
  No walk back to the motos. Mounted beyond `RIDE_BEYOND` (60 m) only if already mounted.
* `ride()` / `thinkRide()`:
  * arrival when the lead moto is within 40 m of the point, or after 10 s with `bloque` or `attente`. Today the wait is
    `bloque > 12 s`, `attente > 40 s` or `rideMax` 240 s;
  * the stop point is named in the report: « Arrêtés à 60 m du carrefour, foule devant » instead of « accès bloqué »;
  * the position is shown on the block line and on the ground marker.
* `interpeller`:
  * beyond 40 m the binôme rides to 15 m of the target (`RIDE_STANDOFF`) instead of walking up to `WALK_LIMIT` 250 m;
  * when no binôme is free, the refusal says so in one line (§3.3 style) and names the busy binômes.
* `SpecialUnit.say` acknowledges on the player's channel, linked to the order message (§8).

### 5.3 A BRAV-M chief poste

* `ui/screens/catalog.ts`: add the poste `chef_bravm` (label « Chef de la BRAV-M »).
* `gameplay/session/roster.ts`, case `'bravm'`: the player is leader of the `BravmUnit` (FAUCON 1), and scope
  `unite` covers it. His « Mes hommes » is the BRAV-M (6 motos, 12 men).
* `journee.ts dispatch()`: the BRAV-M leaves 20 s after its leader is in the saddle, or at once if he is already
  riding. Until then the block says « La BRAV-M vous attend : montez sur votre moto (E) ». Today it waits silently
  forever (diag-arrivee P8).
* `passager_moto` and `pilote_moto` stay as executants, with the « Ma mission » card showing the BRAV-M chief's order.

---

## 6. Arrival at a demonstration: an order is always carried out, or the line says when (G5)

These are fixes in the simulation. They come straight from the diagnoses, and the design depends on them.

1. **Seated units get out by themselves** (diag-arrivee P1). In `sim/police/maneuver.ts startOrder`, a foot order
   (anything but `embarquer`, `avec_moi`, `colonne`, `debarquer`) to a unit whose agents sit in its own vehicles starts
   with the existing `startDisembark` step and runs the order when it is done.
   * Completion reports (« Barrage en place », « Tortue formée ») are said only when at least half the unit took part.
2. **A player order cancels the convoy** (diag-arrivee P2):
   * new `ConvoyControl.cancel(squadId)` in `convoy.ts`: stop the autopilots, clear `boardId`, stage `annule`;
   * it is called from `CommandCore.issue()` for every squad that receives a new player order, and from
     `follow.onFoot` and `follow.column`;
   * `awaitPlayer` applies only after verb 1 in vehicles;
   * `motorize()` never boards a unit that contains the player unless he is aboard.
3. **The end of parking does not overwrite the player** (diag-arrivee P4). In `beginDisembark()`, skip squads whose
   `playerOrder` was issued after `c.status.t0`.
4. **Unload per vehicle** (diag-arrivee P3). In `thinkPark()`, each vehicle stopped within 60 m of its place unloads
   at once. The company never waits for the last one: cap 60 s when the player is aboard (`PARK_WAIT_JOINING` 720 s
   today). At the station, leave when everyone is aboard, or 20 s after the player boarded.
5. **The adjoint proposes as soon as the column stops** (diag-arrivee P5). `command.ts thinkDeploy()` stops returning
   while `convoy.arriving()`. The débarquement stage ends when nobody is seated any more, not on the `debarquer`
   order's completion.
6. **Chef de section: the AI stops ordering his groups** (diag-arrivee P6). `command.ts buildElements()` skips any
   squad led by the player or under one (`core.isUnder`).
7. **Far field orders.** `MOTOR_DISTANCE` stays 250 m. For a field order to units on foot, the line says it before
   Entrée: « ⏎ Envoyer : place de la Bastille (420 m) — MISTRAL 2 en véhicules, ~1 min ». The known stuck-lead-vehicle
   bug (`convoy.thinkRoute` detaches only i ≥ 1) is being fixed elsewhere; the line must show « bloqué : … » when a
   stage does not progress for 20 s.

**What the line shows during each stage** (no stage leaves the player without an answer):

| Stage | Line 2 | Effect of an order given now |
|---|---|---|
| route | « AVEC MOI · en colonne — arrivée ~2 min » | accepted; run at arrival (`afterConvoy`), line: « noté : à l'arrivée » |
| stationnement / per-vehicle unloading | « AVEC MOI · descendent (12/19) — prêts dans ~15 s » | accepted; agents already out start at once, the others as they get out |
| en place | « AVEC MOI · en ligne face à la foule » | immediate |

---

## 7. Arrested people and cellular vans (G4)

### 7.1 Always vans, scaled with the crowd, named

* `ui/screens/scenario.ts recommendedMeans` and `RequestedMeans` gain `cellulaires`: 1 below 300 demonstrators, then
  `ceil(crowd / 400)`, capped at 4.
* There is at least 1 whenever there is a BRAV-M, in all BRAV-M / Centaure / drone / école / canon missions (18 of 85
  have none today), and in « sur place ».
* They are spawned **crewed** with `createEquipage('fourgon_cellulaire', { parentId: company })` (the CrewKind already
  exists in `sim/police/api.ts`) instead of the crewless one in `units.ts createCompany`. They are parented to the
  company so `fleetOf` and the group see them.
* Callsigns are « CELLULAIRE 1 », « CELLULAIRE 2 » (as in the merge tree's « CELLULAIRE 75-01 »).
* **Patrol mode**: no van with the car. When the crew has a detainee and no van is within 300 m, the patrol call card
  (`ui/patrol/dispatch.ts`, key Y) gets the line « Y : demander un fourgon cellulaire ». CENTRAL engages one from the
  nearest station (merge feature, `engage()`).
* **Placement**: 60–100 m behind the line, by `supportSpot` / `roadSpot`. Today vans sit 110–220 m from the crowd
  centre, or at the station 2 km away.

### 7.2 Always visible

* **World**: a marker over each van: « CELLULAIRE 1 · 3/8 ». Full: « COMPLET — part au commissariat ».
* **Maps**: the same label. The count is detainees only; today agents and detainees are mixed.
* **Block line 4** (commandant): « Interpellés : 5 — CELLULAIRE 1 : 3/8 · 2 au commissariat du 3e ».

### 7.3 The player's own arrest: four presses, then one key

* The chain is unchanged: E ×4 (Interpeller, Menotter, Palpation, Emmener).
* The verb « Escorter X » is renamed **« Emmener X »** (`gameplay/law/interactions.ts`).
* While he is escorting, line 3 reads: « ⏎ Confier l'interpellé à un binôme · ou l'emmener : CELLULAIRE 1, 140 m ↗ ».
  The ground marker and an arrow point at the van. `nearestDrop(actor)` in `handover.ts` is the same loop as
  `Handover.find` without the 5 m limit, vans first.
* **Entrée = « Confier »**: the nearest free AI pair takes the detainee and runs the existing `ops-arrest.ts` stage 4
  (`findHandover` → walk → `remettre`). This needs a new entry that starts at stage 3 when `target.custody ===
  'cuffed'`. The player is free in about 2 s.
* **E at the van**:
  * « Remettre … (Cellulaire 1) » appears from **15 m** for a `fourgon_cellulaire` (raise `handoverVehicleRange` for
    that kind only);
  * it gets priority over « Faire asseoir » and over a closer CRS fourgon. Today the score bonus is only 2 m.
* « Faire asseoir » drops below « Confier » and « Remettre ». Today it is the top prompt, and a 5th E abandons the
  detainee (diag-interpelles P2).
* If the player gets into a vehicle while escorting, the detainee is handed to the nearest pair automatically, with
  the line « Interpellé confié à MISTRAL 1 ALFA ».

### 7.4 The van takes them to the station; another one comes

A new small unit, `CellulaireUnit`, in `sim/police/command/` (a `SpecialUnit`, like `CentaureUnit`):

* **Departure**: it leaves when full, or 10 min after its first detainee, or on the player's order (U to
  « CELLULAIRE 1 », then Entrée « partir au commissariat », or Plus… 1 for that unit).
* **Trip**: it drives without two-tones to `nearestCommissariat` (merge tree, `src/world/commissariats`). On arrival
  it reuses `CommissariatsSystem.arrive`'s detainee loop and emits `commissariat:returned`.
* **Return**: it comes back to its spot. Meanwhile a station van is engaged (`engage()` on a cellulaire stock entry),
  so at least one van is always on site. The line says: « CELLULAIRE 1 part au commissariat du 3e · CELLULAIRE 2 prend
  le relais (2 min) ».
* **Fixes it depends on**: `findHandover` and `Handover.find` consider every cellular van of the dispositif, not only
  `fleetOf(top)`; `unitVehicles` includes `extraVehicles` (diag-interpelles P12).
* **The van's own verbs when it is « à qui »**:
  * 1 Avec moi: it comes to 20 m behind the player;
  * 2 Envoyer: it goes there;
  * 7 Plus…: 1 Partir au commissariat.
  * The others are grey with « C'est un fourgon cellulaire : il transporte les interpellés. »
* **Debrief**: « remis au cellulaire » and « déposés au commissariat » are counted separately (`Records.stats`
  `atStation`, listening to `commissariat:returned`).
* **Radio at the hand-over**: « à bord du CELLULAIRE 1, en attente de transfert » replaces « pour présentation à
  l'officier de police judiciaire ».
* **AI requests**: an AI unit's « demande un véhicule pour la remise » is answered by sending the nearest van
  (`approachPoint`).

### 7.5 « Escorte » means one thing

| Today | Becomes |
|---|---|
| player verb « Escorter X » (walking a detainee) | « Emmener X » |
| radio « Escorte de deux agents » | « deux agents l'emmènent au CELLULAIRE 1 » |
| armoured-vehicle foot escort (`proteger`, « je protège l'élément désigné ») | « Protéger l'engin » (word kept on the radio) |
| order `escorter` in the map's Plus… (« Escorter une autre unité ») | « Accompagner une unité » |
| units riding with the player's column | « Avec moi » |
| mission names (« Escorter la délégation ») | unchanged: that is the mission's real word |

---

## 8. Reactivity budget and the radio

| Moment | Budget | How |
|---|---|---|
| Ack on screen | ≤ 0.3 s | block line 2 drawn from `issue()`'s `IssueResult` |
| Player's phrase on the radio | ≤ 1.5 s | already fast-laned (`fromPlayer`) |
| Unit's « REÇU » on the radio | right after the player's phrase, never before | `gameplay/radio/queue.ts`: the ack carries `after: <order message id>` and goes on the same channel as the order |
| First agent moves | ≤ 2 s | already true on foot; true seated after §6.1 |
| Unit in place, ≤ 60 m | ~30–45 s | per-section dispatch (§2.2) instead of the 69-agent block |

Other radio changes:

* CENTRAL's repeated « URGENT. Automobiliste bloqué » is capped at once per 60 s (known leftover).
* « MISTRAL ICI MISTRAL » goes away: the player's callsign is « MISTRAL AUTORITÉ » for a commandant and the section
  name for a chef de section, never the addressee's (`core.ts callsign()`).
* Completion reports go to the player, not to CENTRAL (`radio.ts superior()` stops at the player's squad).
* The ack's distance is the order's distance (`ackBody` measures from the point, not from the unit centre).

---

## 9. Keys, touch targets, positions

### 9.1 Keyboard (MacBook Air, no mouse) — checked against `src/input/bindings.ts`

| Key (physical `code`) | Action | Status today |
|---|---|---|
| **Enter / NumpadEnter** | `order_go`: the obvious order (line 3) | free in game: `ui_accept` is context `menu`, and `contextsOverlap('menu', 'commun')` is false |
| **KeyU** | `order_who`: next « à qui » (Maj+U: previous) | free in game (used only by `tacticalKeys.ts` inside the map, with the same meaning) |
| **KeyF** then **1–7** | the seven verbs; in Plus… 1–9, 0 | unchanged mechanism (`wheelKeys.ts`); digits stay item slots outside the wheel |
| Maj+1 (inside the wheel) | « Avec moi » in the other mode (vehicles / on foot) | new, in the wheel only |
| Tab | command map | unchanged |
| P / Maj+P | adjoint | unchanged (`RESERVED_KBM`) |
| Y | patrol calls | unchanged |

* Both new actions are added to `BUTTON_TABLE` (`input/buttons.ts`) with context `commun`, to `DEFAULT_KBM`, and to
  the remapping screen's `NAMES`: « Donner l'ordre évident », « À qui je parle ».
* On a Mac the right hand already rests on the arrows (look) and Entrée is right next to them. U is reached by the
  same hand, F and the digits by the left hand. There is no chord and no function key.
* Gamepad: `order_go` on B16 where the browser gives it. Otherwise it is reachable through the wheel. The gamepad is
  not a target device.

### 9.2 Phone (844 × 390 landscape, scale 1, from `input/touch/layouts.ts`)

| Element | Position | Size | Replaces |
|---|---|---|---|
| **« Mes hommes » bar** (lines 1+2 merged: « MES HOMMES ▸ AVEC MOI · en ligne ») | top centre, in the HUD slot `'top'` of `UnitHud`, between the mini-map (112 px disc, left) and the system chips (5 × 55 px from `right: 12`, i.e. 287 px): x ∈ [190, 557] | 44 px high, ≤ 360 px wide | the unit chip |
| tap on the bar | `order_who` (next « à qui ») | — | — |
| long press on the bar (0.4 s) | sheet of units, 48 px rows, one tap picks | full height, 300 px wide, from the left | — |
| **Obvious-order pill** (« Bloquer rue Saint-Gilles ») | left zone under the mini-map, where today's « Suivez-moi » pill sits (`leftZoneCenter` keeps it off the bottom controls) | 46 px high, 120–220 px wide, label truncated on the street name first | « Suivez-moi » pill and « Secours ici » pill (2 → 1) |
| « Ordres » round button | unchanged: left 82, bottom 196 | 54 × 54 | opens the 7-verb wheel |
| wheel sectors | RadialMenu as today | ≥ 56 px each (7 sectors instead of 8 makes them wider) | — |

* Nothing is added under the thumbs: the joystick (104, 96, r 62), Action (88 px, right 24 / bottom 30), Interagir
  (bottom 198) and the item bar (bottom 8) do not move.
* The adjoint proposal and « véhicule qui bloque » stay top-centre banners (`quickBanner`), stacked under the bar.
* With a mission card on top centre (an executant who also commands in a mission), the card shrinks to its one-line
  headline and the bar goes under it. The total height is ≤ 84 px.
* Touch count for an obvious order: 1 tap. For any verb: 2 taps (Ordres, sector). For another unit: +1 tap on the bar.

---

## 10. What is removed or merged (the screen carries less)

| Today | After |
|---|---|
| « ORDRES » block, 4 lines + key column (`quickActions.ts`: Suivez-moi à pied, Suivez-moi en véhicules, Secours ici, Carte de commandement) | « Mes hommes » block: 3 lines (state, obvious order, to whom); « Tab : carte » is a key hint in line 1 |
| Wheel, 8 sectors (two Suivez-moi; Avancer; Ligne; Interpeller; Pousser; Secours; Plus…) | 7 sectors: Avec moi, Envoyer, Bloquer, Disperser, Interpeller, Secours, Plus…; « Pousser » moves to Plus… 8 (the conditional « Un véhicule vous bloque » line stays) |
| « Disperser / repousser » missing from the field (only Bond, F 8 2) | verb 4 |
| Phone: « Suivez-moi » pill + « Secours ici » pill + unit chip | 1 smart pill + the bar (which is the chip) |
| Toast « Ordre donné : … » (2.5 s) + radio + chip | ack in line 2; no toast |
| Map intention bar: 6 letters + Plus… (E B N D I S O) | same buttons, numbered 1–7 in the field order: 1 Avec moi (new: `callFollow` for the selected unit), 2 Envoyer, 3 Bloquer, 4 Disperser, 5 Interpeller, 6 Secours, 7 Plus…; Encercler moves to the top of Plus… and its letter N still works; digits at rest pick the intention (`mapKey`: today a digit at rest is `{ kind: 'digit' }`) |
| Five meanings of « escorte » | one, plus mission names (§7.5) |
| Chip texts « MONTE », « DESCEND », « EN FILE », « SANS ORDRE » | player's order + phase |

Net: about 5 fewer visible controls on the desktop HUD, 2 fewer on the phone, 1 fewer wheel sector and 1 fewer map
button. One new key (Entrée) and one reused key (U, the same meaning as on the map).

---

## 11. Three walk-throughs, second by second

### W1. He arrives by column and wants his section to block the street he is looking at

Chef de section (capitaine), service day, Bastille. For a commandant add 1 press of U, or accept the card's pick.

**Today** (diag-arrivee R4, P1–P5; diag-terrain T3):

* the column stops, and the stationnement holds everyone seated **20–551 s**;
* the field route is F, 4: « Tenir une ligne ici » for the whole section as a block, en place at 56–60 s *if* it is
  unloaded; seated agents ignore it (P1);
* the map route is Tab, navigate, B, Entrée, Tab: ≥ 5 keys plus navigation, and in R4 it **boarded the section, which
  stayed 18/18 seated through every later order**.

Measured: up to ~11 min from the stop to the first order really carried out, or never.

**New:**

| t (s) | Player | Screen |
|---|---|---|
| 0 | column stops | « AVEC MOI · descendent (3/19) — prêts dans ~15 s » |
| 1 | E: gets out (1) | — |
| 2–4 | turns the view to the street (arrows / trackpad) | ground stripe across rue Saint-Gilles; line 3 « ⏎ Bloquer : rue Saint-Gilles (60 m) — MISTRAL 1 ALFA et BRAVO y vont » |
| 4 | **Entrée** (2) | +0.3 s: « REÇU — je barre rue Saint-Gilles, ~40 s ». Agents already out move at +1–2 s; the ones still seated get out first (§6.1) |
| ~20 | — | unloading finished (per-vehicle, §6.4) |
| ~45 | — | « MISTRAL 1 ALFA, BRAVO · barrent rue Saint-Gilles · en place »; CHARLIE stays « avec moi », in line behind him |

**2 presses** (1 if already on foot), ~45 s to in place. Today: 5+ keys plus navigation, 1–11 min, sometimes never.

### W2. A rioter throws a projectile; he wants him arrested and taken away

Commandant on foot, units « avec moi ».

**Today** (diag-terrain §1, diag-interpelles §2–3):

* put the crosshair exactly on the moving person (painful on a trackpad), then F, 5. The order goes to the whole
  company (87 people), which picks a binôme;
* AI path: caught at ~68 s, walked 212 m to the only van, handed over at **217 s**. The pair is out of the line for
  2.5 min. The van then never leaves;
* doing it himself: E ×4, then **no guidance**, and the 5th E sits the detainee down.

**New:**

| t (s) | Player | Screen |
|---|---|---|
| 0 | sees the throw (`canArrest` true) | red ring and « Lanceur de projectile » over him; line 3 « ⏎ Interpeller : le lanceur de projectile (35 m) » (the crosshair need only be within 4°) |
| 1 | **Entrée** (1) | +0.3 s « REÇU — binôme ALFA 2 y va »; moves at +1–2 s |
| ~20–60 | — | « ALFA 2 · interpellé · l'emmène au CELLULAIRE 1 (70 m) » (the van is 60–100 m behind the line, §7.1) |
| ~90–110 | — | « remis · CELLULAIRE 1 : 4/8 »; ALFA 2 back « avec moi » |
| later | — | at 8/8: « CELLULAIRE 1 part au commissariat du 3e · CELLULAIRE 2 prend le relais » |

**1 press**, about 1.5–2 min to the van, then automatic transfer.

Doing it himself: E ×4, then **Entrée** « Confier l'interpellé à un binôme » = **5 presses**, and he is free 2 s after.
Or he walks to the marked van and presses E from 15 m (6 presses).

### W3. He wants the BRAV-M to go to a crossroads 400 m away

Commandant.

**Today** (diag-terrain §2, T4/J1):

* map only: Tab, move the cursor to the crossroads (R plus a search, or arrows), E, U to FAUCON 1, Entrée, Tab,
  about 7–9 keys;
* on the ground the BRAV-M acks at **17 s**, walks back to its motos and rides at 5.5 m/s near pedestrians. It
  stopped « accès bloqué » at 77 s on a **50 m** trip and never arrived in J1.

**New**, case A, he can see the crossroads down the boulevard:

| t (s) | Player | Screen |
|---|---|---|
| 0 | **U** (1): « À : BRAV-M FAUCON 1 · 12 · à pied près des motos » | — |
| 1 | looks down the boulevard | line 3 « ⏎ Envoyer : carrefour Voltaire (400 m) — sur les motos, ~50 s » |
| 2 | **Entrée** (2) | +0.3 s « REÇU — FAUCON 1 en route »; mounts (≤ 40 m to the motos) ~6 s, rides |
| ~55 | — | « FAUCON 1 · au carrefour Voltaire », or « arrêtés à 60 m du carrefour, foule devant » (10 s rule, §5.2) |

**2 presses.**

Case B, the crossroads is out of sight (the usual case in Paris streets):

* U, then F, 2 « Envoyer ». Nothing is aimed beyond 400 m, so line 3 says « Tab : choisir le lieu sur la carte ».
* Tab opens the map with FAUCON 1 selected and Envoyer active. The arrows jump between landmarks (`nextInDirection`),
  or R plus a search.
* Entrée. **The map closes by itself** after an order sent from a map opened by the field (`tacticalState.ts`).
* About **6–8 presses**, and it arrives in ~1 min.

**Summary**

| | Today: presses | Today: result | New: presses | New: result |
|---|---|---|---|---|
| W1 block the street on arrival | 5+ and navigation, or F 4 (2) | 1–11 min, or never | 1–2 | ~45 s in place |
| W2 arrest and take away (order) | 2 with precise aiming | ~3.5 min to the van; the van never leaves | 1 | ~1.5–2 min; automatic transfer |
| W2 arrest himself | 4, then lost | detainee sat down by the 5th E | 5 | free in 2 s |
| W3 BRAV-M 400 m (visible / not visible) | 7–9 (map only) | does not arrive | 2 / 6–8 | arrives in ~1 min |

---

## 12. Coexistence

* **Command map (Tab)**:
  * same verbs and numbers, U, and Entrée « Donner l'ordre »;
  * the map's selection is the field's « à qui » and the other way round;
  * the order card stays the place for « Autres ordres ici… », the legal chain (L), stations (C) and the journal (J);
  * opened from the field to pick a place, it closes after the order.
* **Adjoint proposals (P / Maj+P)**: unchanged, shown as block line 5. They also appear in service-day arrival from the
  column stop (§6.5).
* **Patrol call card (Y)** stays in the `'left'` zone above the block.
  * The patrol chef de bord's block is one line: « MON ÉQUIPAGE · 2 · avec moi ».
  * Verbs 1 and 6, plus the detainee hand-over (Entrée « Confier » to his partner), and Y « demander un fourgon
    cellulaire ».
* **Executants** (CRS, gardien BRAV-M, crews): no block. They keep the « Ma mission » card and the read-only wheel. The
  numbers move: F 1 Avec moi (the old 1 and 2 merged), F 6 Secours (was 7). Their mission card names the order of the
  commandant or the chef.

---

## 13. Build plan (by module, in order)

1. **Simulation, which must come first** (without it nothing in the HUD is true):
   * `maneuver.ts` auto-dismount and honest reports;
   * `convoy.ts cancel()`, `beginDisembark` skip, per-vehicle unload, `awaitPlayer` rule;
   * `command.ts thinkDeploy` / `buildElements`;
   * `follow.ts endConvoy` → `suivre` with postures;
   * `setup.ts` initial `suivre` for everyone and BRAV-M `parentId`;
   * `bravm.ts` distance rules and arrival.
2. `CommandCore.playerOrder` / `phaseOf`, `callsign()` fix, and radio queue `after:` linking.
3. `src/ui/command/group.ts`: `manoeuvreGroup`, `dispatchToGroup`, `obviousOrder`, `whoCycle`. Each is a pure
   function over `CardEnv` (`cardEnvFromCore`), tested like `bestUnit.ts`.
4. `orderWheel.ts` (`WHEEL` 7 sectors, `MORE_RING` 10 entries) and `quickActions.ts` (replaced by the block, same
   widget id and slot, so the touch layout logic `leftZoneCenter` / `subtitlePlacement` still applies).
5. `input/buttons.ts` and `bindings.ts`: `order_go`, `order_who`. Touch: bar tap / long-press, smart pill.
6. Detainees: `handover.ts nearestDrop`, `interactions.ts` priorities and wording, the `ops-arrest` stage-3 entry,
   `recommendedMeans.cellulaires`, crewed vans, `CellulaireUnit` (after the stations merge), debrief counts.
7. Map: digits at rest and numbered bar, Encercler into Plus…, U shared, close-after-send when opened from the field.
8. Robots:
   * new `tests/unit/playtest.mes-hommes.test.ts`, which plays W1–W3 on the real map and asserts presses and timings
     (ack ≤ 0.3 s, first move ≤ 2 s, in place ≤ 60 s, BRAV-M arrives, detainee at the station);
   * extend `playtest.commandant-terrain` / `-interpeller` to every service-day stage;
   * one e2e at 844×390 checking the bar and pill rectangles against `controlRect` of every control.

---

## 14. Risks

1. **The obvious order guesses wrong.** Bloquer vs Envoyer at the 80 m threshold, or the crowd rule taking a street
   the player wanted blocked. Mitigations:
   * line 3 always says what Entrée will do, before he presses;
   * X (map undo, `undoOrder`) also works from the field for 10 s;
   * Disperser and force are never the obvious order.
   Still to be tested with the player.
2. **Muscle memory.** F 2 (Suivez-moi en véhicules) and F 7 (Secours) change meaning. CRS players lose « F puis 7 ».
   Mitigation: one-time tip in the block, and the wheel prints labels.
3. **Postures fight the player.** The auto line « face à la foule » when he stops could block his own path or face the
   wrong crowd in multi-demonstration sessions. It needs the 3 s delay, a 120 m radius and the nearest-crowd rule, and
   Plus… 9 « Laisser agir seuls » as the escape.
4. **Per-section dispatch changes the AI load.** Splitting the company's block order into 3–5 orders is more pathing
   and more radio acks. The acks must be grouped: one « REÇU » for the group, not five.
5. **Everything depends on the simulation fixes in §6 and §5.2.** If auto-dismount or convoy cancel are partial, the
   block will *say* « prêts dans ~15 s » and lie, which is worse than today. The block's timers must be fed by real
   counts (seated agents, convoy stage), never by constants.
6. **The BRAV-M inside the company changes behaviour elsewhere.** « Toute la compagnie » map orders, the company AI
   (`buildElements`), `follow.ts wholeCompanies` and mission scripts that assumed a top-level BRAV-M. Missions
   bravm-01…09 must be replayed.
7. **The cellular van system depends on the stations merge** (`engage`, `nearestCommissariat`, `unitVehicles`). Until
   then the van can leave but no replacement can be engaged; the minimum is to keep the van on site and say « en
   attente de transfert ».
8. **Phone top centre is crowded.** Bar + adjoint banner + blocked-vehicle banner + mission headline + compass. It
   needs a strict stacking order and an e2e rectangle test at 844×390 and at the 0.82 scale.
9. **Entrée in game** could fire when a DOM text field has focus (search on the map, remapping screen). `order_go`
   must be ignored while any screen other than the game view is open: the `commun` context alone is not enough.
10. **One-shot « à qui » with a 10 s timeout** might surprise a player who selected the BRAV-M, looked around for 12 s
    and sends the whole group. The shrinking bar shows it, but it is to be checked in a playtest; an alternative is
    to keep the selection until the next order.
11. **Map change.** Moving Encercler into Plus… on the map touches a recently redesigned screen and its spec
    (`design-commande.md`). The judge may prefer to keep the map bar as is and only print the digits.
