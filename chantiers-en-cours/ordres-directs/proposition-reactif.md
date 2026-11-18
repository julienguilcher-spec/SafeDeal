# Design proposal: « Zéro attente, téléphone d'abord »

Angle: start from the thumbs on an 844×390 phone and from a latency budget (spoken acknowledgement ≤ 1 s, first agent
moving ≤ 2 s). Every order becomes a visible **ticket** that is never refused silently: it runs now, or it is queued
with a countdown that says what the unit is finishing. The laptop keys come from the same model: **one contextual
order, one key**.

Grounded on worktree `/tmp/claude-0/hunt/ordres-directs/crs-simulation` (HEAD 6f3f12e) and on the three diagnoses
in this folder (`diag-arrivee.md`, `diag-terrain.md`, `diag-interpelles.md`). The numbers marked "today" come from
them. No source file was modified.

---

## 0. The whole thing in one picture

```
 LOOK at something (crosshair, or a tap on the world on the phone)
        │
        ▼
 ┌───────────────────────────────────────────┐
 │  ORDRE PRÊT   « Bloquer la rue »          │   ← the natural order for what is designated (§3)
 │               → MISTRAL 2 · 60 m      [⟳] │   ← who will do it (§3.3); ⟳ / U = next unit
 └───────────────────────────────────────────┘
        │  ONE tap / ONE key (A on AZERTY)
        ▼
 t=0.0  bip + vibration, marker on the ground, chip turns « REÇU »
 t≤1.0  voice: « MISTRAL 2, reçu, je barre la rue de Rivoli. »
 t≤2.0  first agent moving — or the ticket says « descend des fourgons — prêt dans 5 s »
        ▼
 TICKET (top strip): « MISTRAL 2 · Bloquer rue de Rivoli · en route 40 m »  →  « en place ✓ »
```

Three things are new: the **ORDRE PRÊT pill** (replaces the round « Ordres » button and the HUD « ORDRES » block),
the **ticket** (one state machine per player order, shown in one line), and the **wait removals** in the
simulation that make the ticket's promise true. Everything else is reused: the six intentions of the command map,
`SquadOrder` types, `bestUnit.proposeWho`, the wheel (`RadialMenu`), `objectives.upsert` for markers,
`police.command.arrive` for convoys, `Custody`/`Handover` for detainees, the commissariats feature for transfers.

---

## 1. Latency budget

Target, per player order, from the press/tap:

| Step | Today (measured) | Target | How (§ where) |
|---|---|---|---|
| Visible "taken" | toast 2.5 s, chip unchanged | **0.0 s**: bip, haptic 15 ms, ground marker, chip « REÇU » | ticket created synchronously in `CommandCore.issue()` (§2) |
| Player's order phrase heard | 0.7–9 s (queue behind CENTRAL) | **not spoken**: subtitle at 0.0 s, full text kept in the radio journal | §6.2 |
| Unit's « REÇU » heard | 0.0–3.6 s for CRS, **17 s** BRAV-M, often *before* the order | **≤ 1.0 s**, always after the subtitle | §6.2 pre-emption lane |
| First agent moving (units on foot) | 0.5–2.5 s | ≤ 1.5 s (unchanged mechanism) | — |
| First agent moving (units seated in vans) | **never** (P1) | ≤ 2.0 s (first door opens) | §4.1 auto-dismount |
| First agent moving (unit inside a player-held convoy) | **never** (P2, 300 s wait) | ≤ 2.0 s | §4.2 convoy cancel |
| Column stopped → first order carried out | **~11 min** (R1: stop t=436, unloading t=987, adjoint t≈1117) | **≤ 10 s** | §4.3 per-vehicle unloading |
| Ligne/barrage « en place » for 30–40 m | 56–70 s | ≤ 30 s | §4.4 formation timeouts for player orders |
| BRAV-M short move (50 m) | never arrives, « accès bloqué » at 77 s | on foot, ≤ 40 s | §7 |
| Map order to a section 250–450 m away | re-board, ~1 min drive, unload, then act (S4 still driving at +60 s) | trots there (≈ 2.5 m/s) unless already seated | §4.5 |

Rule that makes the table enforceable: **every deliberate wait the player can be blocked by must be visible in
the ticket with a countdown, and must be ≤ 10 s, except driving time.** Anything longer is a bug for the watchdog
(§2.4).

---

## 2. The order pipeline: tickets

### 2.1 What a ticket is

New module `src/ui/command/tickets.ts` (UI side, no DOM; read by the HUD, the map and the tests), fed by
`CommandCore.issue()` and by the simulation events already emitted (`order:issued`, `police:order_refused`,
convoy stages via `CommandCore.onConvoyStage`, `police:arrest`).

```ts
interface OrderTicket {
  id: number;
  squadId: number;
  order: SquadOrder;          // the player's order, exactly what went to ctx.squads.issue (or will)
  verb: string;               // label of the order in field words (§3.1): « Bloquer la rue »
  place: string;              // SquadOrder.place (already carried)
  state: 'recu' | 'attente' | 'route' | 'action' | 'en_place' | 'bloque' | 'refuse' | 'remplace';
  why: string;                // « descend des fourgons », « finit de se garer », « remonte sur les motos »…
  eta: number;                // seconds, for the countdown; −1 = unknown
  t0: number; tAck: number; tMove: number;
  progress: { dist: number; at: number };  // watchdog
}
```

One live ticket per squad (a new order on the same squad sets the old one to `remplace`). The HUD shows the
two most recent live tickets (§6.3); the map's order lines (`overlay-units.ts`) read `ticket.verb` instead of the
squad's raw order, so internal orders (« MONTE », « DESCEND », « EN FILE ») never hide the player's order again
(diag-terrain §2 cause 4).

### 2.2 States and exact French texts

| State | When | Ticket line (exact) |
|---|---|---|
| `recu` | 0–1 s after issue | « MISTRAL 2 · Bloquer la rue · reçu » |
| `attente` | agents seated, convoy parking, BRAV-M mounting… | « MISTRAL 2 · Bloquer la rue · descend des fourgons — prêt dans 5 s » |
| `route` | ≥ 20 % of agents moving towards the point | « MISTRAL 2 · Bloquer rue de Rivoli · en route — 40 m » / « en fourgons — 1 min 10 » |
| `action` | interpeller, repousser: engaged | « BRAV-M · Interpeller · poursuite — 12 m » |
| `en_place` | maneuver done (§4.4 threshold) | « MISTRAL 2 · rue de Rivoli barrée ✓ » (stays 6 s, then the chip carries it) |
| `bloque` | watchdog (§2.4) | « MISTRAL 2 · bloqué : la foule barre la route — ils finissent à pied » |
| `refuse` | `check()` or sim refusal | « Refusé : il faut d'abord les 3 sommations. → Plus… › Sommations » |

`why` and `eta` come from one function `readiness(squad)` in `tickets.ts`:
* seated agents of the squad and of its children (`vehicleId !== 0`) → « descend des fourgons », eta = seated per
  vehicle × `EXIT_INTERVAL` (tuning.ts) + 1 s;
* convoy stage (`police.command` convoy of that squad) `route` → « en fourgons », eta = remaining route / 9 m/s;
  `stationnement` → « finit de se garer », eta = min(remaining park wait, 10);
* BRAV-M stage `remontee` → « remonte sur les motos », eta = 6 s;
* otherwise distance / walking or trot speed.

### 2.3 Never refused silently, never accepted and dropped

* **Queued, not refused**: an order to a squad that is in its vans, in a column, parking, or unloading is accepted
  and carried out as soon as the unit can (§4.1, §4.2, §4.3), with `attente` + countdown. This is G5.
* **Refused**: only for what cannot become true by waiting: no unit under command, read-only poste, force not
  authorised, no Centaure, no offence for Interpeller. Each refusal is one sentence + the way out (§6.4), shown in
  the ticket strip for 6 s and spoken « NÉGATIF » by the unit.
* **No fake completion**: the maneuver layer must stop reporting « Barrage en place » / « Tortue formée » / « Bond
  effectué » when fewer than half of the squad's able agents took part (diag-arrivee P1, last line). In
  `maneuver.ts`, the completion report checks `taken / able ≥ 0.5`, counting seated agents as able.

### 2.4 Watchdog

In `tickets.ts update()` (every 0.5 s): if the ticket is `route` and the squad centroid (or lead vehicle) got less
than 5 m closer in 15 s, the ticket becomes `bloque` with the reason read from the autopilot
(`'obstacle'` → « la route est barrée », `'personne'` → « un piéton bloque le fourgon de tête ») and **an automatic
fallback is applied once**: a convoy within 400 m of its point disembarks where it is and the order is reissued on
foot (`ConvoyControl.cancel` + `ctx.squads.issue`). This turns the known stalls (T8 Bastille, the Concorde water
cannon leftover) into a 15 s delay with a message instead of an endless wait. It does not replace the real fix of
`convoy.thinkRoute` (being done by another agent); it is the safety net.

---

## 3. What order, to whom: the ORDRE PRÊT pill

### 3.1 The field vocabulary = the map's six intentions

Same words on the phone pill, in the wheel, on the laptop card and on the command map (G6):

| Field order (pill, wheel) | Map intention (key) | SquadOrder reused | Notes |
|---|---|---|---|
| « Suivez-moi » | (map: « Plus… › Suivez-moi ») | `suivre` via `follow.onFoot`, or `avec_moi` via `follow.column` when the player is in a vehicle | smart, replaces F→1 and F→2 |
| « Y aller » | « Envoyer » E — card line « Y aller » | `avancer` (≤ 60 m from a crowd) or `colonne` | |
| « Bloquer la rue » | « Bloquer une rue » B | `couper_circulation` (`filtrer` with passers-by option in the map) | |
| « Tenir ici » | (card line of B / D) | `ligne`, heading = camera yaw | replaces wheel 4 « Tenir une ligne ici » and 8.5 « Tenir » |
| « Repousser » | « Disperser » D, **renamed « Repousser »** (key D kept) | `refoulement` | missing from the wheel today |
| « Interpeller » | « Interpeller » I | `interpeller` + `targetId` | locked when no offence (§3.2) |
| « Secours ici » | « Secours » S | `requestRescueAtPlayer` | |
| « Plus… » | « Plus… » O | ring below | |

« Plus… » ring (wheel inner ring, `MORE_RING` in `orderWheel.ts`), nine sectors, digit = sector:
1 « Se replier » (`repli`), 2 « Bond en avant » (`bond_offensif`), 3 « Charger » (`charge`), 4 « Gaz »
(`disperser_gaz`), 5 « Tortue » (`tortue`), 6 **« Sommations »** (new on the field: runs `core.legalChain` step
by step, the same as L in the map), 7 « Pousser un véhicule » (`degager_obstacle`), 8 « En véhicules avec moi »
(`avec_moi` explicitly, for the rare case on foot), 9 « Arrêter » (`cesser`; long-press 9 / Maj+9 = « Laisser agir
seuls », `libre`). « Encercler » stays in the map only (it needs two units and a picture); its sector in the map is
greyed with « il faut au moins deux unités » when `proposeWho` finds no pair (diag-arrivee P7).

### 3.2 The natural order: one function, deterministic

`src/ui/command/naturalOrder.ts`, `naturalOrder(env, aim): { verb, type, x, z, heading, targetId, place, lock }`,
evaluated every 0.25 s on the designated thing (crosshair aim, or the last tap, §5.3):

1. Person designated **with a witnessed offence** (`ctx.law` record / `canArrest`) → « Interpeller ce casseur ».
2. Injured person or a fire → « Secours ici ».
3. Point within 30 m of a crowd (`env.crowds`), and the addressed unit already within 60 m of it → « Repousser » ;
   unit farther → « Tenir ici » (a line facing the crowd: heading from point to crowd centre).
4. Point on a road edge (`world.nearestRoad(x,z,…,12)`), no crowd within 30 m → « Bloquer la rue » (place = road
   name: « Bloquer rue de Rivoli »).
5. Other point at more than 6 m → « Y aller ».
6. Nothing designated (sky, < 6 m), or the player has just moved more than 30 m away from his units → « Suivez-moi ».

Person without offence designated → « Interpeller » is **not** proposed; the pill falls back to rule 3–5 for the
point under him, and the wheel's Interpeller sector shows « aucun délit vu : ils surveillent » and sends
`avancer` at 10 m from him with the order to arrest on the first offence (the card's « Aller constater » line,
diag-arrivee P7).

**Aim assist for trackpad and thumbs** (the player cannot point precisely): the designation snaps to the nearest
person with a witnessed offence inside an 8° cone and 60 m (`player-aim.ts` already keeps the three best
candidates with a distance tolerance; add an "offender bonus" to their score only for `naturalOrder`, not for
weapons).

**Long reach for orders**: `AIM_GROUND_RANGE` is 80 m (sim/people/tuning.ts), too short for « the crossroads
400 m away ». `naturalOrder` uses its own ray: when the ground hit is beyond 80 m or the ray is near the horizon,
take the farthest point of the visible street under the crosshair (walk `world.nearestRoad` along the view
direction in 20 m steps up to 500 m while `world.lineOfSight` holds) and snap it to the nearest named crossroads.
The pill then says « Y aller — carrefour Rivoli × Sébastopol, 400 m ».

### 3.3 To whom: « À qui »

* Default addressee = `bestUnit.proposeWho()` for the natural verb, restricted to units **under command and not
  already busy with a ticket given less than 20 s ago** (no stealing the unit you just sent). Preferences: BRAV-M
  for Interpeller (if any), the nearest CRS group/section for Bloquer / Tenir / Repousser, the Centaure for Pousser.
* For a commandant the default is **never the company root** (diag-terrain: 69 agents in one block, 60 s for
  40 m). The cycle (⟳ / U) goes: proposed unit → other sections and groups by distance → BRAV-M → Centaure / canon
  → « Toute la compagnie ». The choice is sticky for 20 s (so « Y aller » then « Tenir ici » go to the same unit),
  then returns to automatic.
* The same selection is shared with the command map: opening Tab preselects that unit as « Qui » on the card
  (`tacticalState` selection), and a unit selected on the map is the field addressee when the map is closed.
* Chef de groupe: only his group, no cycle (⟳ hidden). Chef de section: his section, then each of his groups.
  BRAV-M chief: « Toute la BRAV-M », then binômes. Read-only postes: no pill, the « Suivez-moi » pill only (§9).

---

## 4. Removing the deliberate waits (simulation)

Each item names the module, the function and the new behaviour. Values are the proposal; the robots (§12)
check them.

### 4.1 Units seated in their vans obey (P1 — the main « ils ne bougent pas »)

* `sim/police/maneuver.ts startOrder()`: when a **foot** order (every type except `embarquer`, `avec_moi`,
  `colonne` in a convoy, `faire_mouvement`, `suivre` with the player aboard) reaches a squad whose agents are seated
  in its own vehicles, run `startDisembark()` first for those agents and start the maneuver with the agents
  already out; seated agents join as they get out (they are counted `able` by `mcore.ts refreshFormable()` from the
  moment they step out). No separate « débarquer » order is visible: the ticket says « descend des fourgons — prêt
  dans N s ».
* `tuning.ts EXIT_INTERVAL` 0.6 s per agent → per-vehicle parallel exits, 0.35 s per agent per door: a 9-seat van
  is empty in ≈ 3.5 s.

### 4.2 Convoys started by an order can always be cancelled (P2, P4)

* `sim/police/command/convoy.ts`: add `ConvoyControl.cancel(squadId)`: stop the autopilots of the convoy's
  vehicles, clear every `agent.boardId` set by `boardStragglers()`, drop the convoy, emit stage `annule`.
* `ui/command/core.ts CommandCore.issue()`: call `cancel` for every squad that receives a new player order (and
  for its children), before issuing; same from `follow.onFoot` and `follow.column`.
* `awaitPlayer()` / `PLAYER_WAIT` (300 s) applies **only** to a convoy created by « Suivez-moi en véhicules » or the
  service-day departure. A map/field order to a unit that contains the player never boards the unit unless the
  player is himself aboard one of its vehicles: `CommandCore.farFor()` and `intents.ts etaFor()` share one rule
  `motorizes(squad, x, z)` (diag-arrivee P2 fix (a)).
* `beginDisembark()`: skip squads whose current order was issued by the player after the convoy started
  (`order.issuedBy === playerId && order.issuedAt > status.t0`).

### 4.3 Arrival: the column stops, units are out within seconds (P3, P5, terrain blocker 1)

* `convoy.ts thinkPark()`: **per-vehicle unloading**: a vehicle stopped for 2 s within 60 m of its line unloads at
  once (`startDisembark` for its seats), whatever the others are doing. `PARK_WAIT_JOINING` 720 s → 30 s,
  `PARK_WAIT` 300 s → 30 s; a straggler still joining after that unloads where it is.
* `thinkBoard()` (station departure): leave when every agent is aboard, or `BOARD_MAX` 120 s → 25 s after the
  player boarded.
* `convoy.ts update()` case `debarquement`: ends when **no agent of the company is seated** (except drivers), not on
  the « débarquer » order's completion event.
* `sim/police/command/command.ts thinkDeploy()`: no early return while `convoy.arriving()`; the adjoint proposes
  « Mise en place du dispositif » as soon as the column stops (P key, unchanged).
* `gameplay/session/follow.ts FollowLeaderSystem.endConvoy()`: after `debarquer`, every escort group gets a
  **posture** (§5.1): `suivre` on the player if he is on foot within 60 m, else `ligne` at its van facing the
  nearest crowd. Never left at `debarquer` (« DESCEND » forever).

### 4.4 Formation timeouts for player orders

* `tuning.ts FORM_TIMEOUT` 25 s → 8 s and `REALIGN_TIME` 2.5 s → 1.5 s **for orders whose `issuedBy` is the player**
  (keep the AI's values). « en place » is reported when 70 % of able agents are within 3 m of their slots.
* `system.ts PLAYER_RUSH_MIN` 35 m → 15 m: beyond 15 m, player orders are run at a trot.

### 4.5 When to drive

* `MOTOR_DISTANCE` (core.ts and intents.ts) 250 m → **450 m for units on foot** (trot; 400 m ≈ 2.7 min — slower
  than driving on a free road, but immediate and never stuck behind the crowd), and **150 m for units already
  seated** (they just drive; no boarding cost). The card and the ticket show the same choice and ETA (one
  function).

### 4.6 Start of session: everybody follows (« tout le monde doit me suivre, c'est obligatoire »)

* `gameplay/session/setup.ts` lines 218–224: issue the initial `suivre` to **every** squad under the player's
  command, commandant and commissaire included, and for a section to its groups (the `s.members.length > 1` test
  skips sections today). Engines (Centaure, canon) follow in their vehicle.
* `command.ts buildElements()`: skip every section or group led by the player or under a squad led by the player
  (`core.isUnder`), so the AI company commander stops ordering a chef de section's groups (P6).

### 4.7 Radio

* See §6.2 (pre-emption lane). Also: CENTRAL's « URGENT. Automobiliste bloqué… » is said at most twice per incident
  (`repeatWindow` for that key: 90 s → once, then only in the journal).

---

## 5. Phone first (844×390, scale 1)

### 5.1 The screen, on foot

Current on-foot layout (`src/input/touch/layouts.ts`): stick centre (104, bottom 96) r 62; Radio round 54 at
left 18 / bottom 196; Ordres round 54 at left 82 / bottom 196; Interagir pill 132×46 right 24 / bottom 198; Action
88 right 24 / bottom 30; Viser 66, Saut 58, Accroupi 58 on the right; system chips top right; item bar bottom
centre (x 186 → right 196, bottom 8, h 52); left zone under the minimap holds the « Suivez-moi » and « Secours
ici » pills; top centre: compass, unit chip, banners.

Changes (positions in px at scale 1, origin as in `ControlSpec`):

| Control | Spec | Rect on 844×390 (x0–x1, y0–y1) | Replaces |
|---|---|---|---|
| **ORDRE PRÊT pill** | `key:'orders'`, `button:'orders'` (tap), `shape:'pill'`, `side:'left', x:82, anchor:'bottom', y:196, w:196, h:54`, `contextual:true` | 82–278, 140–194 | the round « Ordres » button (same row as today: no new collision with the minimap or the stick) |
| └ verb segment | 144×54, two lines: verb 15 px bold, addressee 11.5 px | 82–226 | |
| └ **⟳ segment** (« À qui ») | 52×54, separately tappable, icon + « U » hint hidden on touch | 226–278 | new, inside the pill |
| Radio | unchanged | 18–72, 140–194 | |
| Ticket strip | HUD zone `top`, under the compass, max 2 lines × 20 px, width ≤ 380, non-interactive (pointer-events none) | ≈ 232–612, 52–96 | the 2.5 s « Ordre donné » toasts |
| « Suivez-moi » / « Secours ici » pills under the minimap | **removed** on touch: « Suivez-moi » is the pill's natural order when nothing is designated, both are in the fan | — | 2 pills |

Nothing is added under the thumbs: the right cluster is untouched, the pill takes the place of a button that is
already there, and the ticket strip is read-only at the top. Touch targets: verb segment 144×54, ⟳ 52×54 (both
≥ 44 px; at the minimum scale 0.82 they are 118×44 and 43×44 → the ⟳ segment gets `w: 54` so it stays 44 px).

In a vehicle (`VEHICULE` layout) the same pill sits at the same place (the Ordres round button is in `commsRow`,
shared by the three layouts), so a passenger commandant can order from the column: the order is queued with
« en fourgons » or the unit dismounts (§4).

### 5.2 Gestures on the pill

* **Tap** the verb segment → gives the natural order to the shown unit. Haptic 15 ms, the pill flashes green
  « Envoyé » for 0.6 s, then shows the next natural order. A second tap within 0.6 s is ignored (no double order).
* **Tap ⟳** → next unit (same list as U, §3.3); the addressee line changes; 1.5 s without a tap = chosen.
* **Long-press** (≥ 350 ms) or **swipe up** on the verb segment → the fan: today's `RadialMenu` wheel, opened with
  the same eight sectors as §3.1, already centred on screen (existing `OrderWheelScreen`), with the natural order
  highlighted. Lift the finger on a sector = give it (same as holding F on the laptop). Tap outside = cancel
  (existing).
* Locked natural order (Interpeller without offence never appears; Charger without sommations can appear only
  from the fan): the pill shows the lock in grey « Charger 🔒 sommations 0/3 » and a tap opens the « Sommations »
  sector instead of sending.

### 5.3 Designating on a phone: crosshair, or a tap on the world

* Default: the crosshair (screen centre) is the designator, as today; the look drag already moves it.
* **Tap on the world** (look zone `data-ct="look"`, finger down < 220 ms and moved < 12 px): designates the point
  or person under the finger (screen-space raycast, same scoring as `player-aim.ts` around the finger). A ground
  ring with « ici » appears for 4 s; the pill updates. In `src/input/touch/overlay.ts onUp`, a `K_LOOK` finger
  released under those thresholds emits `designate(x, y)` to the HUD instead of nothing. A look drag is never
  turned into a tap (threshold), and a tap never moves the camera.
* The designation expires after 4 s or when the player moves 10 m; then the crosshair is the designator again.

So on a phone, the usual order is **one tap** (look at it, tap the pill) and an order on something away from the
crosshair is **two taps** (tap it, tap the pill).

---

## 6. Feedback that cannot be missed

### 6.1 Three channels for every order, all at t ≤ 1 s

1. **Ground marker** (t=0): `objectives.upsert` (service `ui.objectives`, already drawn by `ui/hud/markers.ts`)
   with kind `ordre`, a coloured ring at the point (a line segment for Bloquer/Tenir, oriented by heading) and a
   label « MISTRAL 2 — Bloquer ». It stays until `en_place`, turns into « ✓ » for 3 s, then disappears. Off-screen:
   the existing edge arrow of markers. Max 3 order markers at once (the oldest fades).
2. **Unit chip** (t=0): `ui/command/hud.ts unitChipText` reads the ticket: « MISTRAL 2 · REÇU » → « MISTRAL 2 ·
   BLOQUE · 40 m » → « MISTRAL 2 · RUE BARRÉE ✓ ». It shows the **addressed** unit for 6 s after an order, then the
   player's own unit again.
3. **Voice** (t ≤ 1 s): the unit's acknowledgement, short: « MISTRAL 2, reçu, je barre la rue de Rivoli. »

### 6.2 Radio: the order is shown, the acknowledgement is spoken first

* The player's own phrase (`orderPhrase`) is **not spoken** any more for field and map orders: it appears at t=0
  as the radio subtitle (« MISTRAL ICI MISTRAL 2… » removed, see below) and goes to the radio journal. The player
  already knows what he ordered; hearing it 0.7–9 s later only delays the acknowledgement and causes the
  inversion (diag-terrain §3).
* The acknowledgement is submitted by the ticket (not by `maneuver.ts` / `SpecialUnit.say` / `kernel.say`, which
  stop acking player orders) on channel `commandement` with a new flag `ack: true`. `gameplay/radio/queue.ts`:
  an `ack` message from a player ticket **pre-empts** a playing message of priority 0–1 on its channel (the
  interrupted one is cut with the « crrk » sound and re-queued once) and goes before everything pending. Spoken
  length ≤ 1.8 s (≤ 9 words). Start ≤ 1.0 s after the order, including the 0.35–0.75 s `ackAt` delay which is moved
  to 0.3 s for player tickets.
* Completion report (« Rue de Rivoli barrée ») goes to the **player's** callsign, not to CENTRAL
  (`radio.ts superior()` returns the issuer when `order.issuedBy` is the player).
* Callsign fix: when the player speaks to his own squad, `from` is his function (« ICI CHEF DE SECTION ») instead of
  his squad name (diag-terrain problem 9, « MISTRAL ICI MISTRAL »).
* Acknowledgement words: the distance said is measured from the unit's leader, rounded like the order (no
  « QUATRE-CINQ mètres » for 40 m); « Avancer » ends in « sur le point », never « Barrage en place ».

### 6.3 The ticket strip

Top centre on the phone (under the compass, above the banners of the adjoint/obstacle: they move down 44 px when
the strip shows), and at the top of the left card on the laptop (§8.2). Two lines max, newest on top, each line
« UNIT · verb · state — countdown ». Colour: white normal, amber `attente`, red `bloque`/`refuse`, green ✓.
Tickets older than 6 s in `route`/`en_place` collapse into the chip. Refusals stay 6 s.

### 6.4 Refusals: one sentence and the way out (exact texts)

| Case | Text |
|---|---|
| Force not authorised (Charger, Gaz) | « Refusé : la charge demande les 3 sommations et votre autorisation. → Plus… › Sommations (F puis 8 puis 6) » (chef de groupe: « …demandez-la au commandant : Radio ») |
| No Centaure | « Aucun Centaure avec vous. → Carte (Tab) › Plus… › Commissariats pour en engager un. » |
| Interpeller, no offence | not proposed by the pill; the wheel sector reads « Aucun délit vu — ils surveillent » and sends the watch order |
| Encercler, one unit | map only, greyed « Il faut au moins deux unités. » |
| Read-only poste | « Vous ne commandez pas : votre chef donne les ordres. Son ordre : <ticket of the AI chief> » |
| No unit | « Personne sous vos ordres ici. » |

---

## 7. BRAV-M (G3)

1. **Inside the company**: `sim/police/api.ts BravmOptions` gets `parentId`; `gameplay/session/setup.ts` line 539
   passes the company id; `units.ts createBravm` uses it. Then « Suivez-moi », the U cycle, « Toute la compagnie »,
   the follow column and the map's « Qui » include it (`bestUnit.whoEnvFromCore`, `follow.ts wholeCompanies`).
   The AI company commander gets it as an element too (risk §13).
2. **Short moves on foot**: `bravm.ts BravmUnit.begin()` for `avancer` / `colonne` / `repli`: distance test first.
   On foot and d < 150 m → walk/run directly (no `backToMotos`). Mounted and d < 60 m → dismount on the spot and
   walk. Mounted and d ≥ 150 m → ride. On foot and d ≥ 150 m → remount if motos within `MOUNT_REACH` 40 m, else walk.
3. **Riding into a crowd**: `thinkRide()` keeps `bravmSlow` near pedestrians, but the blocked thresholds become
   `bloque > 5 s`, `attente > 8 s` (from 12 s / 40 s) and the result is **not** « accès bloqué »: the unit
   dismounts where it is and walks the rest (`arrived()` → foot leg). The ticket says « motos arrêtées par la foule
   — finissent à pied, 60 m ».
4. **Interpeller**: within 120 m, run (not walk) with the binôme nearest the target; `WATCH_TIME` 25 s → 8 s when the
   offence is already witnessed (the player designated an offender); re-target every 1 s on a moving target.
   Beyond 120 m and mounted: ride to 30 m, then sprint.
5. **No order overwrite**: `backToMotos()` and `approach()` stop writing internal orders to `squad.order`; they
   keep their stage in `BravmUnit` and the ticket reads it (« remonte sur les motos — 6 s »).
6. **Acknowledgement**: by the ticket (§6.2), ≤ 1 s instead of 17 s.
7. **BRAV-M as the player**: add a poste « Chef de la BRAV-M » (`ui/screens/catalog.ts` bravm postes
   `['chef_bravm','passager_moto','pilote_moto']`; `gameplay/session/roster.ts` case `'bravm'`: the player is the
   brigadier-chef of the `BravmUnit` (FAUCON), passenger of binôme 1, scope `unite` over the whole BRAV-M). The
   service-day `journee.ts dispatch()` stops waiting for him: if he is not on his moto 20 s after the column
   leaves, the BRAV-M leaves and the « Ma mission » card says « La BRAV-M part sans vous : montez sur une moto
   (E) ». Passenger and pilot postes stay read-only but see the chief's order (§9).

---

## 8. Arrested people and cellular vans (G4)

### 8.1 Vans always there, scaled, crewed, named

* `RequestedMeans` / `recommendedMeans` (`ui/screens/scenario.ts`) gets `cellulaires`: 1 below 300 demonstrators,
  then `ceil(crowd / 400)`, capped at 4; at least 1 with a BRAV-M, in every special mission with arrests, and in
  patrol mode one at the nearest commissariat is available on request (CENTRAL call card, §9).
* Spawned **crewed** (`createEquipage('fourgon_cellulaire', { parentId: company })`, CrewKind exists in
  `sim/police/api.ts`) instead of the crewless one of `createCompany`, so they leave the station with the column
  (`setup.ts cellToRear` no longer leaves one behind) and `fleetOf(top)` sees them.
* Callsigns « CELLULAIRE 1 », « CELLULAIRE 2 » (station vans keep « CELLULAIRE 75-01 »). On the maps:
  « CELLULAIRE 1 — 3/8 » (detainees only, drivers not counted).
* Placement: a **point de remise** 60–90 m behind the police line on the side away from the crowd, chosen with
  `supportSpot` / `roadSpot`; the van moves there after unloading of the column, and moves again (autopilot, no
  siren) when the line moves more than 80 m.

### 8.2 The player always knows where to bring a detainee, or hands him over with one key

Player chain today: E×4 (Interpeller, Menotter, Palpation, Escorter) then the 5th E sits the detainee down
(diag-interpelles P2). New chain, `gameplay/law/interactions.ts createArrestHandlers`:

* Step 4 renamed **« Emmener au fourgon »** (was « Escorter X »).
* While the player walks a detainee, the top prompt (E) is:
  1. within 12 m of a cellular van with a free seat: « Mettre dans le CELLULAIRE 1 » (3 s) (`handoverVehicleRange`
     12 m for `fourgon_cellulaire` only; other vehicles keep 5 m and score far below the van:
     `Handover.find` bonus −4 → −400);
  2. otherwise, an AI pair of his unit within 25 m: **« Confier à MISTRAL 2 ALFA »** (1 s) — the pair takes the
     detainee and runs the existing `ops-arrest.ts` stage 4 (`findHandover` → walk → `remettre`), entered with
     `target.custody === 'cuffed'`; the player is free immediately;
  3. otherwise: « Faire asseoir » (unchanged, now only third).
* While walking a detainee, the **« Ma mission » card** (`gameplay/session/executant.ts`, new source `custody`
  ranked above `regroup`, read from `Custody.escortedBy(player)`) says « Emmenez-le au CELLULAIRE 1 — 140 m » with
  an objective marker on the van (`objectives.upsert`, kind `remise`), and the commandant (who has no mission card
  today) gets the same line in his ticket strip. On the phone, the Interagir pill shows « Confier » / « Mettre dans
  le fourgon » exactly as on the laptop.
* Getting into a vehicle while walking a detainee: he is handed to the nearest pair automatically and the strip
  says so (diag-interpelles P10).

### 8.3 Arrests by units

* The van **comes to the arrest**: `ops-arrest.ts finishArrest()` and stage 4: if the nearest cellular van is more
  than 80 m from the detainee, it is ordered to drive to a point 20 m behind the line nearest the arrest (single
  vehicle `police.command.arrive`), and the pair walks to wherever the van is when they meet. Pair out of the line:
  ≈ 40 s instead of 2.5 min (diag-interpelles §3).
* `findHandover()` considers every cellular van of the dispositif (not only `fleetOf(top)`), with the 400 m limit
  measured to the van; « demande un véhicule pour la remise » is answered by sending one (P7).
* BRAV-M `ensureHandover` (invisible pavement point) is replaced by the same rule: the nearest van comes; until it
  arrives the binôme keeps the detainee seated by the motos, with a marker « interpellé en attente du fourgon ».

### 8.4 The van takes them to the station, and is replaced

New `src/gameplay/law/transfer.ts` (`TransferSystem`, a GameSystem, after the commissariats merge):

* A van departs when full (8), or 6 min after its first detainee if no new one came for 2 min, or on the order
  « Transférer au commissariat » (map card of the van, and the van's own card on the field through the U cycle
  when it is designated).
* Before it leaves, a replacement is engaged: another van of the dispositif moves to the point de remise, or the
  nearest commissariat's stock van is engaged (`CommissariatsSystem` `engage()` with the `cellulaire` stock
  entry) and drives to the point. There is always one van at the point de remise or announced with an ETA.
* It drives without siren to `nearestCommissariat`, and on arrival reuses the detainee loop of
  `CommissariatsSystem.arrive` (exit + remove) through a new `Custody.deliver(targetId, stationName)` that closes the
  record as « déposé au commissariat du 3e »; it emits `commissariat:returned` (debrief listens) and comes back
  empty. Fix `engage.ts unitVehicles()` to include `extraVehicles` (diag-interpelles P12).
* Radio and strip: « CELLULAIRE 1 part au commissariat du 3e avec 8 interpellés. CELLULAIRE 2 prend la remise,
  90 m. » Debrief: « Interpellés : 9 — 8 déposés au commissariat du 3e, 1 dans le CELLULAIRE 2 ».
* Wording at the van: « … à bord du CELLULAIRE 1, en attente de transfert » (no « présentation à l'OPJ » until the
  station).

### 8.5 « Escorte » is clear everywhere

| Meaning | New word |
|---|---|
| Player walking a detainee | « Emmener au fourgon » / « Confier à … » |
| AI pair walking a detainee | radio « Un interpellé conduit au CELLULAIRE 1 » (no « point de regroupement ») |
| Foot group around an armoured vehicle (`attachEscort`, `proteger`) | « reste autour du canon à eau » (radio and chip « AUTOUR DU CANON ») |
| Order `escorter` (map « Plus… ») | « Accompagner une unité » (tag « ACCOMPAGNE ») |
| Units riding with the player | « avec vous » (chip « AVEC VOUS — EN FOURGONS ») |
| Missions (délégation, pompiers, métro) | unchanged, they are mission texts |

---

## 9. The units « avec moi » always have a readable order (G2)

* **Posture when the player stops** (`follow.ts FollowLeaderSystem`): units in `suivre` on the player, when he has
  been still for 3 s, take `ligne` 6–10 m behind him and to his sides (each section on its own side, not one
  block), heading = his camera yaw, or facing the nearest crowd within 80 m. When he moves 8 m, back to `suivre`.
  Chip: « MISTRAL 1 · AVEC VOUS — EN GARDE » / « AVEC VOUS — SUIT ». These posture orders are not tickets (no voice,
  no marker) and they never overwrite a ticket younger than its completion.
* **Followers as separate units**: a commandant's « Suivez-moi » gives `suivre` to each section with a lateral offset
  (left / right / behind), so the next order to one section does not stop the others.
* **Read-only postes (CRS, BRAV-M gardien, crew)**: the pill shows « Suivez-moi » only when their own unit is not
  under a chief's live ticket; above the chip a line « Ordre du chef : tenir la rue de Rivoli, face est » read from
  the chief's ticket or AI order (the earlier request « il faut que je voie l'ordre du commandant quand je suis
  CRS »). The « Ma mission » card is unchanged.
* **Patrol mode**: the crew is read-only; the CENTRAL call card (Y / Maj+Y, `ui/patrol/dispatch.ts`) stays the
  only command surface; its « Renforts » list gets « Fourgon cellulaire ». The ticket strip shows reinforcement
  ETAs. No pill (except « Suivez-moi » for the crew).

---

## 10. Laptop keys (keyboard + trackpad, no mouse)

Checked against `src/input/bindings.ts DEFAULT_KBM` and `RESERVED_KBM`: bound physical codes are W A S D, arrows,
PageUp/Down, Mouse0/2, E, ShiftLeft, C, Space, Z, Digit1–9, T, F, M, Tab, V, G, H, R, B, N, Period, Escape, L, X,
Equal/Minus, Enter, Backspace; reserved: O (drone), P (adjoint), Y (CENTRAL). **Free in the field: KeyQ, KeyU,
KeyI, KeyJ, KeyK, Digit0, Backquote.** (KeyU is already « unité suivante » inside the map, `tacticalKeys.ts`.)

| Key (physical code → AZERTY label) | Action | New binding action |
|---|---|---|
| **KeyQ → « A »** (left hand, beside Z/Q/S/D) | give the ORDRE PRÊT natural order | `order_now` |
| **KeyU → « U »** / Maj+U | next / previous addressee (same as the map) | `order_unit` |
| F tap | open the wheel (sectors §3.1, natural order highlighted; digit = sector; Entrée = highlighted) | `orders` (unchanged) |
| F hold + trackpad move, release | wheel by direction (unchanged) | |
| F then 8 then 6 | Sommations step | |
| E | interact; detainee: « Confier à … » / « Mettre dans le CELLULAIRE 1 » | unchanged |
| P / Maj+P | adjoint's proposal | unchanged |
| Tab | command map, with the field addressee preselected | unchanged |
| Y | CENTRAL call card (patrol) | unchanged |

Designation on the laptop is the crosshair only (trackpad look or arrows); the aim assist and the long reach of
§3.2 do the precision work. No click is needed: Mouse0 stays « Action ». Labels come from `src/input/labels.ts`
(layout inferred), so the HUD writes « A » on AZERTY and « Q » on QWERTY.

### 10.1 The laptop left card (replaces the « ORDRES » block)

Today: a 262 px block with a title and four lines (Suivez-moi à pied, en véhicules, Secours ici, Carte), plus the
adjoint and obstacle extras. New `quickActions.ts` block, same zone, same width, **three lines**:

```
 ORDRE PRÊT                                  A
 Bloquer rue de Rivoli → MISTRAL 2 · 60 m
 U : autre unité · F : tous les ordres · Tab : carte
```

Under it, unchanged: the adjoint proposal (P / Maj+P) and the obstacle line. The ticket strip uses the same top
centre position as on the phone on compact windows (< 1100 px), and the top of this card on wide ones. The block is
clickable (a trackpad click on the line = A) for those who prefer.

---

## 11. Coexistence with the command map

* The map keeps the big picture and every order (G7). Its six intentions carry the field words (« Repousser »
  replaces « Disperser » as the label; the key stays D). Its « Envoyer » card lines read « Y aller » as today.
* A map order creates the same ticket (marker, chip, ack ≤ 1 s, countdown) — `sendCardLine` goes through
  `CommandCore.issue()` already.
* The map card's ETA and mode (« à pied (~2 min) », « en véhicules ») use the same `motorizes()` rule as the field
  (§4.2, §4.5), so the card no longer promises « en véhicules » to a unit that walks.
* Addressee shared both ways (§3.3). Encercler and the legal chain stay map-first; the field gets « Sommations ».

---

## 12. Three walk-throughs (commandant unless said; seconds from the event)

### 12.1 Arrives by column, wants his section to block the street he is looking at

**Today** (R1/R2/R7, diag-arrivee): the column stops at t=0 (t=436 in R1); everybody stays seated for 20–551 s
(stationnement), then « débarquer » for 120 s; the player who gets out and orders: field F→4 moves the whole company
(69 agents) as a block, in place 56–70 s later **if** it is unloaded; a map order (Tab, find the street, B, Entrée,
Tab: 5 keys + navigation) to a section 250 m+ away re-boards it, drives ~1 min, unloads, then acts; before the
unloading, every order is acknowledged and nothing moves (P1). Chef de groupe/section: his own unit boards and waits
for him up to 300 s (P2). **First real execution: 2 to 11 minutes. Keys: 2 (F 4) for the wrong unit, or 5+ with
navigation.**

**Proposed** (phone; laptop in brackets):

| t (s) | What happens | What he sees |
|---|---|---|
| 0 | column stops 85–125 m from the rally point | strip « MISTRAL · arrivée — descente des fourgons » |
| 2 | each van stopped within 60 m of its line starts unloading (§4.3) | doors open, agents out |
| 3 | he taps « Sortir » [E] | |
| 4–6 | looks down the street (thumb drag) [trackpad / ←→] | pill: « Bloquer rue de Rivoli → MISTRAL 2 · 60 m » |
| 6.0 | **taps the pill** [A] | bip, vibration, ground line « MISTRAL 2 — Bloquer », chip « MISTRAL 2 · REÇU » |
| 6.8 | voice « MISTRAL 2, reçu, je barre la rue de Rivoli. » | subtitle shows his order at 6.0 |
| 6–9 | if MISTRAL 2 still has agents seated: they get out first (§4.1) | strip « MISTRAL 2 · Bloquer · descend des fourgons — prêt dans 3 s » |
| 7.5 | first agent moving | |
| 9–35 | trot 60 m at ≈ 2.5 m/s (§4.4) | « en route — 40 m … 10 m » |
| ≈ 43 | 70 % in slots (FORM_TIMEOUT 8 s) | « rue de Rivoli barrée ✓ », voice « MISTRAL 2, rue de Rivoli barrée. » |

**2 presses/taps** (Sortir + order; + 1 per ⟳ if he wants another section), acknowledgement 0.8 s after the order,
movement 1.5 s after, in place ≈ 37 s after the order and ≈ 45 s after the column stopped — instead of 2–11 min.
Chef de section/groupe: identical; his own unit is never boarded by his order (§4.2).

### 12.2 A rioter throws a projectile: arrest him and take him away

**Today**: either he does it himself — 4 × E (≈ 10 s), then nothing says where to go; the van is 110–220 m away,
unmarked, crewless or left at the station 2 km away; the 5th E sits the detainee down; « Remettre » appears only
within 5 m; the van never leaves (diag-interpelles §2) — or F→5 with a precise crosshair, which goes to the whole
company; an AI pair catches him at ≈ 68 s and walks 212 m to the van, back in line at ≈ 217 s; BRAV-M by map takes
17 s to acknowledge, walks, often loses the target (T5: not arrested in 180 s). Nothing goes to a station.

**Proposed**, order to a unit:

| t (s) | What happens | What he sees |
|---|---|---|
| 0 | projectile thrown 35 m away, offence witnessed | |
| 0.5–1.5 | he swings the view near the thrower; aim assist snaps to him (§3.2) | pill: « Interpeller ce casseur → BRAV-M · 35 m » (red outline on the target) |
| 1.5 | **tap** [A] | marker on the target « BRAV-M — Interpeller » that follows him |
| 2.3 | voice « BRAV-M, reçu, interpellation. » | chip « BRAV-M · REÇU » |
| 3 | nearest binôme sprints on foot (no remount, §7.2–7.4) | strip « BRAV-M · Interpeller · poursuite — 30 m » |
| ≈ 15–25 | caught, cuffed | « BRAV-M · interpellé ✓ — vers CELLULAIRE 1 (70 m) » |
| ≈ 25 | CELLULAIRE 1, at its point de remise 70 m away, is within 80 m: the pair walks; farther, the van drives to them (§8.3) | |
| ≈ 55 | « Mis dans le CELLULAIRE 1 (4/8) » | radio « Un interpellé à bord du CELLULAIRE 1, en attente de transfert. » |
| later | van full or 6 min: « CELLULAIRE 1 part au commissariat du 3e avec 8 interpellés. CELLULAIRE 2 prend la remise, 90 m. » | marker moves to CELLULAIRE 2 |

**1 tap/press**, acknowledgement 0.8 s, pursuit starts ≤ 2 s, binôme back in line ≈ 1 min.

If he arrests himself: E ×4 (unchanged, ≈ 10 s), then **E « Confier à MISTRAL 2 ALFA »** (pair within 25 m, 1 s)
→ he is free: **5 presses, ≈ 11 s**. With nobody near: the card says « Emmenez-le au CELLULAIRE 1 — 70 m » with a
marker, and E « Mettre dans le CELLULAIRE 1 » works from 12 m: 5 presses + ≈ 50 s walk, never a wrong « Faire
asseoir ».

### 12.3 Send the BRAV-M to a crossroads 400 m away

**Today**: impossible from the field (the BRAV-M is outside the company, the wheel addresses the company). Map: Tab,
navigate to the crossroads, E, U until BRAV-M, Entrée, Tab ≈ 6 keys + navigation; acknowledgement 17 s; on foot it
walks back to the motos; mounted it crawls at 5.5 m/s near pedestrians and stops with « accès bloqué » after 40–80 s,
often without arriving (T4, J1).

**Proposed, from the field, crossroads visible down the boulevard**:

| t (s) | What happens | What he sees |
|---|---|---|
| 0–2 | looks down the boulevard; long reach snaps to the crossroads (§3.2) | pill « Y aller — carrefour Rivoli × Sébastopol, 400 m → MISTRAL 3 » |
| 2.5 | **tap ⟳** [U] (once or twice; BRAV-M is in the cycle) | « → BRAV-M · 400 m » |
| 3.5 | **tap** [A] | marker at the crossroads « BRAV-M — Y aller » (edge arrow if off-screen) |
| 4.3 | voice « BRAV-M, reçu, en selle vers Rivoli Sébastopol. » | |
| 4–10 | motos within 40 m: remount (6 s); ≥ 150 m → ride (§7.2) | strip « BRAV-M · remonte sur les motos — 5 s » |
| 10–50 | ride at 11 m/s on a free road; near pedestrians slow, blocked > 8 s → dismount and walk the rest (§7.3) | « en selle — 1 min 00 … 20 s » |
| ≈ 50 | arrived | « BRAV-M · au carrefour Rivoli × Sébastopol ✓ » |

**3 taps/presses** (look, ⟳, order), acknowledgement 0.8 s, wheels rolling ≈ 6 s after (remount), there ≈ 50 s.
Crossroads not visible: Tab (the map opens with BRAV-M preselected because U chose it, or U in the map), tap the
crossroads [arrows], E, Entrée = **4 taps/keys**, same ticket afterwards.

### 12.4 Count summary

| Wish | Today: presses | Today: first real movement | Proposed: presses | Proposed: ack / movement / done |
|---|---|---|---|---|
| Block a street after the column stops | 2 (wrong unit) – 5+ with navigation | 2–11 min | **2** | 0.8 s / 1.5 s / ≈ 37 s |
| Arrest a thrower (by a unit) | 2 + precise aim (whole company) or map 4+ | 2 s, done 68–217 s, never to a station | **1** | 0.8 s / ≤ 2 s / ≈ 20 s caught, ≈ 55 s in the van |
| Arrest himself and get rid of him | 4 + unguided 225 m walk, risk of sitting him down | — | **5** (Confier) | free at ≈ 11 s |
| BRAV-M to a crossroads 400 m away | field impossible; map ≈ 6 + navigation | ack 17 s, often never arrives | **3** (field) / **4** (map) | 0.8 s / ≈ 6 s / ≈ 50 s |

---

## 13. What is removed or merged (the screen carries less)

| Removed / merged | Replaced by |
|---|---|
| Laptop « ORDRES » block (title + 4 lines: Suivez-moi à pied, Suivez-moi en véhicules, Secours ici, Carte) | 3-line « ORDRE PRÊT » card (§10.1) |
| Phone round « Ordres » button | ORDRE PRÊT pill at the same place |
| Phone « Suivez-moi » and « Secours ici » pills under the minimap | pill's natural order + fan |
| Wheel 1 « Suivez-moi à pied » + 2 « Suivez-moi en véhicules » | one smart « Suivez-moi » (en véhicules moved to Plus… 8) |
| Wheel 4 « Tenir une ligne ici » + Plus 5 « Tenir » | « Tenir ici » |
| Wheel 6 « Pousser un véhicule » | Plus… 7 (the obstacle line still offers the Centaure when blocked) |
| Plus 6 « Arrêter » + 7 « Laisser agir seuls » | Plus 9 « Arrêter » (long-press / Maj = laisser agir) |
| « Ordre donné : … » toasts (2.5 s) | ticket strip + chip + marker |
| The player's own order spoken on the radio | subtitle + journal (the acknowledgement is spoken) |
| CENTRAL « URGENT. Automobiliste bloqué » every 10 s | twice, then journal |
| Internal chip tags « MONTE », « DESCEND », « EN FILE » for player orders | the ticket's state |
| « Disperser » label | « Repousser » (same key D) |
| Player verb « Escorter X » and « point de regroupement » | « Emmener au fourgon », « Confier à … », « CELLULAIRE 1 » |

Added: one pill segment (⟳) inside an existing control, one read-only strip, ground markers, one wheel sector
(Sommations, inside « Plus… »), one prompt (« Confier à … »). Net: fewer controls on both devices.

---

## 14. Build order and robots

Lots, each provable headless before the next (scratch robots in `tests/unit/zz-sonde-*.test.ts`, then real
playtests):

1. **Simulation waits** (§4.1–4.6, §7.1–7.5): extend `playtest.commandant-terrain` / `-compagnie` with the
   arrival runs R1–R9 of diag-arrivee; assert « first agent moving ≤ 2 s after any order at any convoy stage » and
   « column stop → first order executed ≤ 10 s ». BRAV-M: T4/T5/J1 → arrives, arrests.
2. **Tickets + radio** (§2, §6.2): unit test of `tickets.ts` states from the events; queue test: ack ≤ 1 s with
   CENTRAL saturation; never before the subtitle.
3. **Natural order + addressee** (§3): table-driven test of `naturalOrder` on the real map (Concorde seed 21:
   offender, street, crowd, nothing, 400 m boulevard).
4. **HUD / touch** (§5, §10): e2e `tests/e2e/*.mjs` at 844×390: pill rect, ⟳ ≥ 44 px at scale 0.82, no overlap with
   `controlRect` of every control (`layouts.ts controlRect` already exists for that), tap-vs-drag thresholds.
5. **Detainees** (§8): `zz-sonde-interpelle`-style robot: player arrest → Confier → in van; unit arrest → van comes;
   full van → station (merge tree) → replacement present at all times.

---

## 15. Risks

1. **Accidental orders**: one tap / one key sends an order. Mitigations: the pill shows verb + unit before the tap;
   0.6 s guard against double taps; on AZERTY KeyQ ('A') sits two keys left of E, so A and E can be confused under
   stress — the pill flash and the voice make a wrong order visible at once; « Arrêter » is in the fan.
   Still, a player who mashes A will re-order units.
2. **Muscle memory**: F→2 changes meaning (was « Suivez-moi en véhicules », becomes « Y aller »); F→4 / F→6 move.
   Existing tests and the « F puis 1 » hints must be rewritten; the old F→2 users will send units instead of
   boarding them.
3. **Tap on the world vs look drag** on the phone: a short look flick may be read as a tap (designation). The 220 ms
   / 12 px thresholds need tuning on a real phone; a stray designation only changes the pill, it never sends.
4. **Shorter waits, messier ground**: per-vehicle unloading and 30 s park caps leave vans and groups spread along
   the street; trotting 450 m tires agents and strings sections out; parallel door exits may collide.
5. **Radio pre-emption** cuts AI messages; important reports (priority 2) are not cut, but some priority 1 reports
   will be lost to the journal.
6. **Not speaking the player's order** may feel less "radio" to some players; the subtitle must be prominent.
7. **BRAV-M inside the company** changes the AI commander's elements and the adjoint's plans (it may now task the
   BRAV-M); BRAV-M on foot more often is more exposed to the crowd.
8. **More cellular vans** add traffic and parking demand near the crowd; the van that comes to the arrest can get
   stuck in the crowd (same convoy family as the known blocker); the transfer depends on the commissariats merge
   and on `unitVehicles` being fixed.
9. **Watchdog fallback** (disembark and walk) may fire on a convoy that was only slow, and walking 400 m can take
   longer than waiting; needs the 15 s / 5 m thresholds tuned and a single fallback per ticket.
10. **Posture « en garde »** issues orders when the player stops: churn if he stop-starts; it must never overwrite a
    live ticket, and must not be counted as player orders by the AI's `order:issued` listeners.
11. **Long-reach designation** can snap to the wrong crossroads on curved streets; the pill names it, so the player
    can see it, but the name must be right.
12. **Scope of changes**: tickets touch `CommandCore.issue`, the radio queue, `maneuver.ts`, `convoy.ts`, `bravm.ts`,
    `follow.ts`, `setup.ts` — many shared files with the commissariats merge and the convoy fix in progress; the
    lots must land after both, or conflicts will be heavy.
13. **Deterministic tests** that assert today's timings (BOARD_MAX, PLAYER_WAIT, FORM_TIMEOUT, the wheel sector
    numbers, « ORDRES » block lines) will break and must be updated in the same lots.
