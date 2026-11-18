# Diagnosis: arrested people, cellular vans, transfer to the station

Worktree: `/tmp/claude-0/hunt/ordres-directs/crs-simulation` (HEAD 6f3f12e). No source file modified. Reading only for the tree being merged (`/tmp/claude-0/hunt/merge-commissariats/crs-simulation`).

The player's complaint: « j'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire… il faut toujours qu'il y ait quelques wagons pour pouvoir mettre les interpellés qui les emmènent au commissariat » and « pour l'escorte aussi, c'est encore un peu flou ».

Short answer: there is a cellular van in most demonstration set-ups, but **only one, whatever the crowd size**. It has no crew when the company is set up « sur place ». It sits 170–220 m from the centre of the crowd. **Nothing on screen points to it**, and the remise prompt appears only within 5 m of a vehicle. **The van never takes anyone to a station**: detainees stay in it until the session ends. The « Ma mission » card ignores the detainee. The debrief counts a detainee as « remis à l'officier de police judiciaire » as soon as he sits in any police vehicle, a BRAV-M motorbike stop or a CRS fourgon included.

---

## 1. What I played (headless robots, deterministic)

Scratch probes (since deleted): `tests/unit/zz-sonde-cellulaire.test.ts`, `zz-sonde-interpelle.test.ts`, `zz-sonde-journee.test.ts`. Real Paris map, `createTestContext`, home-page configs built with `buildSessionConfig(sanitizeDraft(...))` and `recommendedMeans` (the same path as the home screen), missions through `missionConfig`, patrol through `vacationSessionConfig`.

| Probe | Seeds | What it does |
|---|---|---|
| Census, free mode | 5 | 3 places (République, Concorde, Hôtel de Ville) × 3 crowd sizes (150, 600, 3000) × start mode (default « colonne depuis la caserne », « sur place »), commandant; plus CRS / chef de groupe / BRAV-M / patrouille at République 600. Counts police vehicles, cellular vans, crew, free seats, distance to the player and to the crowd. |
| Census, special missions | 7 | All 85 police missions of `MISSIONS` (école, CRS, chef de groupe, commandant, semaine, BRAV-M, Centaure, canon à eau, drone). |
| Census, patrol mode | 9 | BAC and Police secours shifts. |
| Player arrests himself | 5 / 9 | CRS (binôme d'interpellation), commandant, chef de groupe, BRAV-M, BAC patrol. The robot stands next to a person with a witnessed offence and presses « Interagir » (E) on the top prompt (`ctx.interactions.options` / `start`, the same as `src/sim/people/player.ts` `interact`). It reads the prompts, the « Ma mission » card, notifications and radio. It walks 40 m, goes to the nearest van, presses « Remettre », then waits 180 s. |
| AI unit arrests on the commandant's order | 21 (Concorde, BRAV-M), 5 (République, no BRAV-M) | Same code as the order card: `intentCandidates('interpeller')` → `buildCard` → `proposeWho` → `sendCardLine`. Tracks `police:arrest` stages, the custody state, the vehicle used and the radio. |
| Service day (journée) | 5 | Commandant and CRS, République 600, default start from the station: where the cellular van is through the trip and at arrival. |

---

## 2. Player arrests someone himself

### Who can

Every police poste on foot can arrest. `Custody.canAct` (`src/gameplay/law/custody.ts`) requires `faction === 'police'`, being on foot and able-bodied. Every police kit carries `menottes ×6` (`src/sim/roles/archetypes/police.ts`, `src/sim/police/roster.ts`). This covers the CRS (every poste), chef de groupe, chef de section, commandant, BRAV-M on foot, BAC and Police secours, and the Centaure, water-cannon and drone crews once dismounted.

### Step by step (identical for all five postes tested)

| Step | Prompt shown (key E) | Duration | State |
|---|---|---|---|
| 1 | « Interpeller Christian Lopez » | 1.3–1.8 s | `held` (on the ground) |
| 2 | « Menotter Christian Lopez » | 4 s | `cuffed` |
| 3 | « Palpation de sécurité » | 3 s | `cuffed` |
| 4 | « Escorter Christian Lopez » | 1.2 s | `escorted`: the person walks in front of the player (`custody-step.ts`) |
| 5 | while escorting, the top prompt becomes « Faire asseoir … » (priority 20), then « Relâcher … » | | |

So the player presses E four times, and **the fifth E makes him sit the detainee down on the spot**, because that is the top prompt. « Remettre » (priority 90) exists only when `Handover.find` (`src/gameplay/law/handover.ts`) finds a police vehicle with a free passenger seat **within 5 m** (`handoverVehicleRange: 5`, `src/gameplay/law/config.ts`), or a handover point within 6 m.

What the player is told while escorting:

| Poste | « Ma mission » card while escorting | Nearest cellular van | Nearest police vehicle with a free seat |
|---|---|---|---|
| CRS interpellation (sur place) | « Rejoignez votre groupe — Vous êtes à 120 m de votre chef » | 189 m | VL 159 m |
| Commandant (sur place) | no card | 190 m | fourgon CRS 158 m |
| Chef de groupe (default start from the station, arrest at the demo) | « Embarquez dans le fourgon de CRS MISTRAL 1 ALFA » | 1759 m | 1618 m |
| BRAV-M (sur place) | « Réserve d'intervention — Rue du Faubourg du Temple » | 47 m | fourgon CRS 44 m |
| BAC patrol | no card | none | own car 36 m |

Notifications are the only feedback: « Interpellation fondée : … », « Palpation de sécurité : aucun objet dangereux », and finally « Interpellé remis. Procédure solide… ». **No text, marker, arrow or distance tells the player where to take the person.** The radio says nothing until the remise.

- **Walking away:** the detainee follows (escorted, snaps back at 4 m). If the player gets into a vehicle, the cuffed detainee is left sitting where he was (`custodyUpdate`, branch `escorted`). The procedure stays « en cours » for the rest of the session, with nobody guarding him and nothing telling the player. An uncuffed detainee escapes (`Custody.escape`).
- **Wrong van:** 12 m from the cellular van, the remise prompt offered was « Remettre … (Fourgon de CRS) », because the CRS fourgon parked next to it was nearer. `find` keeps the nearest vehicle and gives the cellular van only a 2 m bonus (`- 4` on the squared distance). The player puts the detainee in a troop seat without knowing.
- **At the van (≤ 5 m):** « Remettre Christian Lopez (Fourgon cellulaire) », 3 s → `in_vehicle`. The radio says « UN interpellé pour …, remis à 14 h 35, à bord du véhicule pour présentation à l'officier de police judiciaire ». Notification: « Interpellé remis. Procédure solide ».
- **How it ends:** 180 s later, every time, the detainee is still `in_vehicle` and the van has moved 0 m. Nothing ever drives him away. The arrest record is closed with status `remis` / `vehicule` at the moment he sat down (`Custody.handOver` → `close`). The debrief counts it as a remise to the officer of judicial police (`Records.stats`, `handedOver`).
- **Trip length:** the player walked 225 m with the detainee (CRS, commandant) at walking pace, about 2.5 min with no guidance. After the default start from the station, the trip was 1.8 km: the van had stayed at the station, see §3.

## 3. AI unit arrests on the player's order (`src/sim/police/ops-arrest.ts`)

| Order | Who | Timeline | Where the detainee went |
|---|---|---|---|
| République, seed 5, no BRAV-M | Groupe MISTRAL 1 ALFA | sortie 0 s, saisie 68 s, escorte 75 s, **remise 217 s** | the company's cellular van, 212 m away: a pair of officers walked it for 142 s |
| Concorde, seed 21, BRAV-M | BRAV-M FAUCON 1 | sortie 118 s, « Auteur en fuite, interpellation abandonnée » at 193 s | (no arrest: the target ran) |

Code path (`findHandover`): it looks only at the vehicles of the unit's top-level tree (`fleetOf(top)`) that have a passenger seat free, within 400 m. The cellular van gets a 60 m bonus. Otherwise it uses a `law.handover` point within 500 m. Failing both, `count = 0`: the detainee is « gardé derrière la ligne », sat down, and the unit radios « …demande un véhicule pour la remise ». Nobody ever answers that request: there is no system that sends a vehicle.

What the commandant sees: the acknowledgement (« REÇU, interpellation de l'objectif désigné »), then at best the law module's « UN interpellé … remis … à bord du véhicule » line. With a saturated network it can arrive late (known leftover). On the maps the van is drawn as a plain « Fourgon cellulaire » vehicle (`src/ui/maps/units.ts`, « véhicules de service qui ne sont le véhicule d'aucune unité »). Its occupant count mixes its two drivers with the detainees. There is no detainee counter, no « van full » state and no order to give it.

BRAV-M: `BravmUnit.ensureHandover` (`src/sim/police/command/bravm.ts`) adds an invisible handover point next to the motorbikes when no company vehicle is within 300 m. Detainees handed there sit on the pavement (`handed_over`, `Custody.parked`) and stay there after the BRAV-M rides off. The radio says « remis au point de regroupement ». This point is not drawn anywhere, so the player cannot find it.

## 4. Cellular vans in every mode

Source of the only van: `createCompany` (`src/sim/police/units.ts`) spawns **one** `fourgon_cellulaire` per company when `vehicles !== false`, with no crew. It is added to the company's `extraVehicles` and parked at the back of the block (`parkCellAtRear`, then `cellToRear` in `src/gameplay/session/setup.ts`). No other place in the worktree creates one.

| Mode / scenario | Cellular vans | Where / crew |
|---|---|---|
| Free mode, commandant, 150 / 600 / 3000 demonstrators (911 simulated), République, Concorde, Hôtel de Ville | **1 in every case** (12 to 42 fourgons CRS alongside) | « sur place »: no crew, 38–82 m from the player, **112–218 m from the crowd centre**. Default « colonne depuis la caserne »: at the station, 1.8–2.2 km away, then follows the column (below) |
| Free mode, CRS / chef de groupe / BRAV-M / patrouille at a demo | 1 | same company van |
| Service day (journée, the default of free mode) | 1 | At departure an agent of the company takes the wheel (2 agents aboard). It drives in the column and stops **171 m (commandant) / 216 m (CRS) from the place**, 2 agents still aboard. 8 seats left |
| Special missions with a company: école-02/03, all crs-*, all cg-*, all cdt-*, all semaine-*, bravm-04, centaure-04/05/06/07/09, all canon-02..09, drone-02/03/05/06/07/09 | 1 | no crew, 2–120 m from the player, 24–2767 m from the crowd |
| Special missions **without any**: bravm-01, -02, -03 (« flagrant délit »!), -05, -06, -07, -08, -09; centaure-01, -02, -03, -08; drone-01, -04, -08; école-01, -04; canon-01 | **0** | BRAV-M detainees go to the invisible motorbike point (§3) |
| Patrol mode (BAC, Police secours) | **0** | the detainee goes in the back seat of the patrol car (2 seats free) and stays there |
| Extra demonstrations (`src/gameplay/session/manifestations.ts`) | 1 per extra company | same uncrewed van |
| Stations (merge tree, `src/world/commissariats/data.ts`) | 3 in station stock: « CELLULAIRE 75-04 » (Cité), « 75-01 » (1er), « 75-03 » (3e) | parked, crewed when engaged (`engage.ts` → `createEquipage('fourgon_cellulaire')`) |

Capacity: `defs.ts` says « 2 agents + 8 retenus ». `Handover.find` uses any `passenger` seat, so it takes 9 when uncrewed and 8 when an agent rides in front. When it is full, `find` simply picks another police vehicle within 5 m. `findHandover` picks any company fourgon with a passenger seat, and **detainees then take troop seats** in CRS fourgons, the VL and patrol cars. **The van never leaves, and no replacement is ever sent.**

World and map: the 3D model has grilles and slits (`render/vehicles/models/vans.ts`), but there is no world label, marker or plate text. The HUD shows nothing. On the maps it is a generic vehicle labelled « Fourgon cellulaire ».

## 5. The tree being merged (commissariats)

- `CommissariatsSystem.arrive` (`src/gameplay/commissariats/system.ts`): when a unit recalled with « Rentrer au commissariat » reaches its station, every `in_vehicle` person in its vehicles is removed from the game (`vehicles.exit` + `people.remove`). The radio says « Arrivés au …, N interpellés remis à l'officier de police judiciaire ». The event `commissariat:returned { detainees }` is emitted, **but nothing listens to it**: there is no debrief or history count.
- `unitVehicles()` (`engage.ts`) walks `squad.vehicleId` down the tree and **ignores `extraVehicles`**. The company's cellular van is found only because its two agents sit in it (the loop « véhicules où sont assis ses agents »). An uncrewed one (« sur place ») is never found, and its detainees are never transferred.
- To empty the van, the commandant has to recall the whole unit that owns it (the company), which takes it off the demonstration. There is no « transfer only » order for the van.
- A station van engaged by the commandant is a top-level `equipage` unit (`createEquipage` without `parentId`). So **AI arrests never use it**: `findHandover` searches only the arresting unit's own tree. The player can use it (any police vehicle within 5 m).
- `Handover.find` now skips vehicles still parked in a station (`isHeldVehicle`): correct.

## 6. Problems, evidence, root causes

| # | Problem | Severity | Evidence | Root cause |
|---|---|---|---|---|
| P1 | No guidance once the player escorts someone: no target, no distance, no marker; the « Ma mission » card keeps its old order (« Rejoignez votre groupe », « Embarquez… ») | **bloquant** for the player's request | §2 table | `MissionBrief` / `src/gameplay/session/executant.ts` and `mission.ts` never read `Custody` (`escortedBy`). `Handover.find` is a 5 m proximity query only; nothing computes a destination at range. No HUD hook |
| P2 | Pressing E while escorting makes the player sit the detainee down on the spot (« Faire asseoir », the top prompt). A player who keeps pressing E « to go on » abandons him | majeur | §2 step 5 | `interactions.ts` `escorter.find` returns « Faire asseoir » whenever the player is escorting; « Remettre » only exists within 5 m |
| P3 | The cellular van never leaves. Detainees stay in it until the end; full means other vehicles' troop seats get used; there is no replacement | **bloquant** (« qui les emmènent au commissariat ») | 180 s waits: moved 0 m; no code path drives an `in_vehicle` detainee anywhere in the worktree | No system owns the transfer. `createCompany` makes the van crewless; `ops-arrest` and `handover` stop at « in the vehicle » |
| P4 | Exactly one van for 150 or 3000 demonstrators; none in 8 of 9 BRAV-M missions, 4 Centaure, 3 drone, 2 école and 1 canon mission, and none in patrol mode | majeur | §4 census | `createCompany` spawns a single van. BRAV-M, equipage-only and patrol set-ups never call it. `recommendedMeans` (`src/ui/screens/scenario.ts`) has no cellular van entry |
| P5 | « Remis à l'officier de police judiciaire » is recorded when the detainee sits in any police vehicle (CRS fourgon, VL, BAC car) or on the BRAV-M pavement point. The debrief counts no station arrival | majeur (debrief truth) | radio and notification at remise; `Records.stats.handedOver` | `Custody.handOver` → `close(h, 'remis', …)` immediately; nobody listens to `commissariat:returned` |
| P6 | The BRAV-M handover point is invisible, and detainees left there sit alone forever after the BRAV-M leaves | majeur | `bravm.ts` `ensureHandover`; `Custody.parked` | the `law.handover` points are not drawn by `src/ui/maps/*` or the 3D renderer; nobody collects the parked detainees |
| P7 | An AI unit with no vehicle within 400 m leaves the detainee seated « derrière la ligne » and radios « demande un véhicule pour la remise ». Nothing answers; the record stays « en cours » | majeur | `ops-arrest.ts` `finishArrest(handed=false)` | no dispatcher for a van request |
| P8 | AI escort takes a pair out of the line for about 2.5 min (212 m walk). It ignores the station vans engaged by the commandant | mineur | §3 République: remise at 217 s | `findHandover` → `fleetOf(top)`, where the 400 m limit is measured from the agent |
| P9 | The player may put the detainee in a CRS fourgon next to the van (nearest wins). The detainee then takes a troop seat, and an agent may have to walk at the next boarding (`convoy.boardStragglers`) | mineur | 12 m prompt: « Remettre … (Fourgon de CRS) » | `Handover.find` scores by distance with only a 2 m bonus for the van |
| P10 | A player who boards a vehicle while escorting leaves the cuffed detainee seated, unguarded, « procédure en cours » for ever, with no message | mineur | `custody-step.ts`, branch `escorted` when the escort has `vehicleId ≠ 0` | no notice and no auto-handover |
| P11 | The word « escorte » means two things: the player's « Escorter X » (walking a detainee) and the command order « Escorter une autre unité… » / formation « ESCORTE » (`orders.ts`, `intents.ts`) | mineur (« l'escorte, c'est flou ») | texts | naming |
| P12 | Merge tree: the uncrewed company van is missed by `unitVehicles` (ignores `extraVehicles`), so its detainees are never transferred on « Rentrer » | majeur once the merge lands | code read | `engage.ts` `unitVehicles` |

## 7. What is missing for the request, and the simplest robust build on the existing code

1. **Vans always present, scaled to the crowd.**
   - Add `cellulaires` to `RequestedMeans` / `recommendedMeans`. Proposal: 1 below 300 demonstrators, then `ceil(crowd / 400)`, capped at 4; at least 1 whenever there is a BRAV-M or the mode is a patrol near a demo.
   - Spawn them crewed with `createEquipage('fourgon_cellulaire', { parentId: company })` (the CrewKind already exists in `src/sim/police/api.ts`) instead of the crewless one in `createCompany`. Parent them to the company so `fleetOf` sees them.
   - For BRAV-M-only missions and the « sur place » set-up, spawn one in `SessionSetup.buildCompany` / the BRAV-M branch of `setup.ts` (`special(...)`) at a « point de remise » 60–100 m behind the line. Reuse `supportSpot` / `roadSpot`.
   - Give it a stable callsign (« CELLULAIRE 1 »), as in the merge tree's `data.ts`.
2. **A clear place to bring a detainee.**
   - (a) Add `nearestDrop(actor)` next to `Handover.find` (`src/gameplay/law/handover.ts`). It is the same loop without the 5 m limit, cellular vans first, and also returns full or empty.
   - (b) While `custody.escortedBy(player)` is set, make the « Ma mission » card show « Amenez l'interpellé au fourgon cellulaire — 140 m » with an objective point: add a `custody` source in `src/gameplay/session/executant.ts`, ranked above `regroup`. Add a world marker on the van; the objectives API already draws points. On the maps, label the van and its count « CELLULAIRE 1 — 3/8 ».
   - (c) Give « Remettre » priority over « Faire asseoir » up to about 15 m from a van. Raise `handoverVehicleRange` for `fourgon_cellulaire` only, or make the 5 m test use the van's length.
   - (d) Add a one-key « Confier aux collègues » option in `interactions.ts`, shown while escorting, priority above « Faire asseoir ». It hands the detainee to the nearest free AI pair. The pair then runs the existing `ops-arrest` stage 4 (`findHandover` → walk → `startVerb('remettre')`): `createArrest` already accepts an existing target. Add an entry that starts at stage 3 with `target.custody === 'cuffed'`. This frees the player at once, which matches « je peux donner directement des ordres ».
3. **The van leaves for the nearest station when full or on order, and a replacement arrives.** Build a small `TransferSystem` (gameplay; or a `CellulaireUnit` in `src/sim/police/command/`, like `CentaureUnit`). It:
   - watches each van's free passenger seats and departs at 0 free, or at ≥ 1 detainee after N minutes, or on the order « Transférer au commissariat » added to the van's card in `intents.ts`;
   - drives with the existing autopilot / `convoy` single-vehicle route to `nearestCommissariat` (`src/world/commissariats`, merge tree), with no siren;
   - on arrival, reuses `CommissariatsSystem.arrive`'s detainee loop (exit + remove), emits `commissariat:returned` and comes back (or a stock van from the station is engaged in its place: `engage()` with a `cellulaire` stock entry).
   - Until it is back, `findHandover` and `Handover.find` fall back to the next van. Also fix `unitVehicles` to include `extraVehicles` (P12).
4. **Counted at the station and in the debrief.**
   - Split the record status: at the vehicle `rec.to = 'vehicule'` with status `remis_vehicule` (custody `in_vehicle`); at the station, a new `deposed` / `rec.to = 'commissariat'`, set by the transfer system through a `Custody` method `deliver(targetId, stationName)`.
   - `Records.stats` gets `atStation`. The debrief tile reads « Interpellés : 5 — 3 déposés au commissariat du 3e, 2 en attente dans le cellulaire ». Have the debrief listen to `commissariat:returned`.
   - Radio wording at the vehicle: « à bord du fourgon cellulaire, en attente de transfert » instead of « pour présentation à l'officier de police judiciaire ».
5. **AI arrests.** Answer `finishArrest(handed=false)`'s request by sending the nearest van to the guarded detainee: a `transfer` system order « venir chercher », reusing `approachPoint`. Let `findHandover` consider every cellular van of the dispositif (not only `fleetOf(top)`), with the 400 m limit measured to the van's parking spot. Draw the BRAV-M handover point and let the van collect parked people (P6).
6. **Wording.** Rename the player's verb to « Emmener X au fourgon » / « Conduire X au fourgon cellulaire » and keep « Escorter » for the unit order (P11).

## 8. Facts a designer needs

- Arrest chain for the player: 4 presses of E (Interpeller → Menotter → Palpation → Escorter), about 10 s. The remise is a 5th press within 5 m of a vehicle (3 s).
- « Remettre » exists only within 5 m of a police vehicle with a free passenger seat, or 6 m of a `law.handover` point. Any police vehicle except motorbikes and drones qualifies.
- One crewless cellular van per company (9 usable seats); in a service day an agent drives it (8 seats left). It is parked 110–220 m from the crowd centre.
- No cellular van in patrol mode, nor in 18 of the 85 police missions (most BRAV-M missions).
- Nothing in the worktree ever moves a detainee after the remise. In the merge tree only « Rentrer au commissariat » of the owning unit does, and only for the vehicles `unitVehicles` finds.
- Debrief « remis à l'OPJ » = sat in a vehicle or at a point; there is no station count. `commissariat:returned` is unused.
- AI arrest: about 70 s to catch and about 150 s to walk 200 m to the van; the pair is out of the line meanwhile. It uses vehicles of the arresting unit's own tree within 400 m.
- The BRAV-M motorbike handover point is invisible, and detainees left there stay on the pavement.
- The « Ma mission » card has no custody step; executant sources today are regroup, journée, ordre and others.

## 9. Not played

- Browser (3D world, HUD prompt rendering, phone touch overlay) was not played; I read the code instead. No e2e run.
- Merge tree not executed (read only): station return with detainees, station vans engaged.
- Hot spots (crowd foyers) were not set up separately; police there come from the same `createCompany` path.
- The van-full path (9 + detainees) is from code reading, not reached in play.
- Multiple-demonstration sessions (extra companies) are from code reading.
