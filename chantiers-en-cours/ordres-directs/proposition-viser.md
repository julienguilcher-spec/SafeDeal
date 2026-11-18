# Design proposal: « Je vise, j'ordonne »

Angle: the crosshair designates. **One key (F) or one tap (« Ordonner ») gives the natural order for what the player is
looking at**, to a unit that is shown before he presses. Holding the key shows at most four alternatives. A marker
appears where the order goes, and the unit answers in under a second.

Worktree read: `/tmp/claude-0/hunt/ordres-directs/crs-simulation` (HEAD 6f3f12e). Stations feature read in
`/tmp/claude-0/hunt/merge-commissariats/crs-simulation`. Diagnosis used: `diag-arrivee.md`, `diag-terrain.md`,
`diag-interpelles.md` (same folder) and `findings/restes-a-faire.md`. No project file was modified.

---

## 0. Pitch

Today the player must open a wheel or the map, pick a sector, and hope. The order then goes to the whole company, or
to a unit that is still seated, and nothing moves. With this design he looks at a street and a small line under the
crosshair says « **F  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m** ». One press, and MISTRAL 1 answers
« REÇU » above its heads within a second and starts running within two. If it is still getting out of the vans, it
does that first and then goes, and the line says so. The same press works for a crowd (repousser), a rioter
(interpeller), a wounded person (secourir) and his own vans (embarquez). The BRAV-M obeys it like everyone else.

---

## 1. The designator: one line under the crosshair

### 1.1 What it shows

A new HUD part, `createOrderTag` (new file `src/ui/command/directTag.ts`). It sits in the HUD zone `bottom`, directly
above the existing interaction pill `hud-prompt` (`src/ui/hud/items.ts` `createPrompt`), and copies its look: key cap
on the left, label on the right. The two lines read together as one grammar:

```
 [E]  Menotter Christian Lopez           <- existing interaction (what *I* do)
 [F]  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m      <- new: what *my unit* does
```

Format: `[F] <verb in plain French> <object> · <addressee> · <distance>`. The text is at most 52 characters; the
object is shortened first (« rue St-Gilles »).

- **When it is shown:** when the player has a commanding scope (`scope.level` is `tout` or `unite`), is on foot or is
  a passenger, and no screen is open. It is refreshed at 8 Hz (the same rate as `src/ui/hud/markers.ts`).
- **Learning line:** a second, smaller line, « U : autre unité · maintenir F : autres ordres ». It is shown for the
  first 5 orders of a session, then only when the player hesitates (the tag has been visible for more than 6 s with
  no press).
- **The designated thing is outlined in the world:** a ground ring at the point, a chevron above a person, or a
  rectangle on a street mouth. It is drawn by `markers.ts` with a new source `designation`, which takes 1 of the
  `MAX_MARKERS` = 6 slots. The player sees what F will hit **before** he presses. This fixes the trackpad problem:
  he does not need pixel precision, because he can see what is selected.
- **Read-only postes** (CRS, BRAV-M gardien, patrol crew) see no F tag. Their « Ma mission » card
  (`src/gameplay/session/executant.ts`) already shows the chief's order (« il faut que je voie l'ordre du
  commandant »). Their F keeps today's reduced wheel. See §9.

### 1.2 How the designation is resolved (trackpad-tolerant)

New pure module `src/ui/command/direct.ts`. Its entry point is
`designate(env: DirectEnv): Designation | null`, with:

```ts
interface Designation {
  kind: 'sol' | 'rue' | 'foule' | 'auteur' | 'blesse' | 'feu' | 'obstacle' | 'barricade'
      | 'vehicule_unite' | 'cellulaire' | 'policier';
  x: number; z: number; heading: number;          // the geometry of the order (OrderGeom)
  targetId: number;                               // a person, vehicle or squad
  name: string;                                   // « rue Saint-Gilles », « le lanceur (veste rouge) »
  natural: DirectOrder;                           // what F does
  alternatives: DirectOrder[];                    // at most 2, plus « Avec moi » and « Plus… », see §2.2
}
interface DirectOrder { type: OrderType | 'transferer' | 'pompiers' | 'samu'; label: string;
                        squadId: number; locked: string /* '' or a one-sentence reason */ }
```

**Inputs.** It reads `PlayerState.aimX`, `aimZ` and `aimedPersonId`, which `src/sim/people/player-aim.ts` computes
every 0.1 s. For designation only, it widens the person cone and the range:

- **Person:** it looks for people within a 4° cone around the camera ray (`AIM_TOLERANCE` is 0.02 rad ≈ 1.1° for
  weapons; that value is left alone). Priority order: a person with an offence seen (`law.canArrest(p)`), a wounded
  or downed person, a demonstrator who is part of a crowd. The nearest to the ray wins.
- **Far ground:** when the ground hit is beyond `AIM_GROUND_RANGE` (80 m) or the camera is level (pitch between -3°
  and +2°), it casts `ctx.world.raycast` up to 450 m. The point is snapped to the nearest road (`world.nearestRoad`,
  25 m), and to the nearest crossroads (an edge end) within 25 m. The name comes from the road. This is what makes
  « la BRAV-M au carrefour, 400 m » possible from the field (§11.3).
- **Street mouth (`rue`):** the snapped road point is within 30 m of an intersection, and a crowd is within 250 m.
  The geometry is the same as the map's « Bloquer une rue » card: reuse the `couper_circulation` line builder in
  `src/ui/command/intents.ts` (`verbLine(env, 'couper_circulation', …)`), so the barrage covers the full width.
- **Other targets:** the vehicle under the ray (`ctx.vehicles.raycast`), a fire (the incidents service), or a
  barricade (the props raycast, `degager_barricade`).

**Stickiness.** Once something is designated, it stays designated until the ray has been more than 8° away for
0.3 s. This avoids flicker while the player pans with the trackpad or the arrow keys.

---

## 2. Keys and touch

### 2.1 Bindings (checked against `src/input/bindings.ts` `DEFAULT_KBM` and `RESERVED_KBM`)

In the on-foot context the following physical codes are taken: W A S D, the arrows, PageUp/PageDown, E, Shift, C,
Space, Z, 1–9, T, F, M, Tab, V, G, H, R, B, N, L, X, = and -, the period, Escape. O, P and Y are reserved.
**KeyQ, KeyU, KeyK, KeyJ and KeyI are free on foot.** (U, J and I are used only inside the command map, by
`src/ui/command/tacticalKeys.ts`, which is a separate context.)

| Action (new id in `src/input/buttons.ts`) | Key (physical code) | AZERTY Mac label | What it does |
|---|---|---|---|
| `orders` (existing) | F (KeyF) | F | **tap (< 0.3 s)**: give the natural order shown on the tag; **hold**: the four-sector ring (§2.2) |
| `with_me` (new) | KeyQ | **A** (« A comme Avec moi ») | « Avec moi »: the addressee, or every unit when nothing is selected, comes back to the player and follows him, on foot or in vehicles depending on how he is moving. It merges today's F→1 and F→2. |
| `next_unit` (new) | KeyU | U | the next addressee (Shift+U: the previous one). It is the same key as in the command map (`tacticalKeys.ts` `case 'KeyU'`). |
| `undo_order` (new) | Backspace (field context only) | ⌫ | « Annuler l'ordre » for 4 s after a direct order: the unit's previous `SquadOrder` is reissued. |
| gamepad `orders` (B15) | tap / hold | | same as F; the stick chooses in the ring |
| gamepad `next_unit` | B15 double-tap | | cycles the addressee |

QWERTY players see « Q : Avec moi ». The tag always prints the label from `input/labels.ts`, so nobody needs to
learn the physical code.

### 2.2 The ring (hold F, or long-press « Ordonner »)

The ring is a reduced `RadialMenu` (`src/ui/command/wheel.ts`, unchanged), driven by `orderWheel.ts`. It has **four
sectors**, always in the same places and with the same numbers:

| Position | Key | Content |
|---|---|---|
| top | 1 | **Avec moi** (so « F puis 1 » keeps its meaning, now with F held) |
| right | 2 | first contextual alternative (§3) |
| bottom | 3 | second contextual alternative (§3) |
| left | 4 | **Plus…**: opens today's full eight-sector wheel unchanged (`WHEEL`, `MORE_RING`, `RESCUE_RING`), so nothing is lost (G7) |

- **Choosing:** move the trackpad and release F (`relativeMove` already exists), or press a digit while F is held,
  or use the arrows and then Entrée (`wheelKeys.ts` `wheelKeyAction`).
- **Releasing F with nothing highlighted** after a hold gives the natural order (the hub shows it: « F relâché :
  Bloquer la rue »). Releasing on the hub cancels.

### 2.3 Phone, 844×390 landscape (`src/input/touch/layouts.ts`)

The on-foot layout today:

- left: the stick (cx 104, cy 96, radius 62), Radio and Ordres (round, 54 px, x 18 and 82, bottom 196);
- right: Action (88 px), Accroupi, Viser, Saut, and the « Interagir » pill (x 24, bottom 198, 132×46);
- two rows of system chips at the top right.

Changes:

| Control | Today | Proposed |
|---|---|---|
| `orders` | round 54 px « Ordres », x 82, bottom 196 | **contextual pill « Ordonner »**: `shape: 'pill'`, `contextual: true`, x 82, bottom 196, **w 150, h 54**. Its label is the natural verb (« Bloquer la rue », « Interpeller »), fed by a new `input.touch.setOrderLabel(text)`, the twin of `setInteractLabel`. **Tap** = the natural order; **press 0.35 s** = the ring at the centre of the screen, with 96 px sectors, then slide and lift. It ends at 232 px from the left edge, well clear of the right thumb's controls. |
| `radio` | round 54, x 18 | unchanged |
| addressee | — | a chip « À : MISTRAL 1 ▸ » in the `bottom` zone at the centre (≥ 44 px high, the existing `@media (pointer:coarse)` minimum), just above the item bar. **Tap** = the next unit. It sits between the thumbs, with nothing underneath. |
| « Suivez-moi » pill under the mini-map (`quickActions.ts`, touch) | smart « Suivez-moi » | renamed **« Avec moi »**, same behaviour |
| « Secours ici » pill | kept | kept |

The interaction pill (E) and the Ordonner pill are on opposite thumbs. The right thumb aims (look-drag), the left
thumb orders. Aiming does not need precision either, because of the 4° cone and the outline (§1.2).

---

## 3. What F does: natural order and alternatives

All of these are existing `SquadOrder` types (`src/core/contracts.ts` `OrderType`). The only new action is
`transferer` (cellular van to the station, §8), which is not a squad formation order; it goes to the new transfer
service. Labels use the **same words as the map's intentions** (§10).

| Designated (`kind`) | F: natural order (type) | Ring 2 | Ring 3 |
|---|---|---|---|
| ground, no crowd within 60 m (`sol`) | **Y aller** (`colonne`, on foot; `avancer` when a crowd is within 60 m: the same rule as `intents.ts` line 191) | Tenir une ligne ici (`ligne`, facing away from the player) | Bloquer la rue (`couper_circulation`), when a road is under the point |
| street mouth (`rue`) | **Bloquer la rue X** (`couper_circulation`, full width) | Bloquer, passants admis (`couper_circulation`, `targetId = BARRAGE_LET_PASSERSBY`) | Y aller |
| crowd or demonstrator with no offence (`foule`) | **Repousser** (`refoulement`, heading from the unit to the point; force 1, allowed at « mains nues »; the existing warning before the last sommation stays) | Tenir une ligne face à eux (`ligne`, heading towards the crowd) | **Encercler** (`encercler`) when ≥ 2 units are in scope; otherwise **Faire les sommations** (the existing `legalChain.ts`) when `canSommation` and `sommation < 3` |
| person with an offence seen (`auteur`) | **Interpeller** (`interpeller`, `targetId`) | Repousser son groupe (`refoulement`) | Le suivre (`suivre`, `targetId`) |
| wounded or downed person (`blesse`) | **Secourir** (`secourir` to the nearest group, plus a SAMU request through `requestRescueAtPlayer`) | Pompiers ici | SAMU ici |
| fire (`feu`) | **Éteindre** (`eteindre`: the water cannon if one is in scope, otherwise a pompiers request) | Pompiers ici | Y aller |
| civilian vehicle blocking (`obstacle`) | **Pousser le véhicule** (`degager_obstacle`, Centaure: `issueObstacle`) | Y aller | Bloquer la rue |
| barricade | **Dégager la barricade** (`degager_barricade`) | Tenir une ligne ici | Y aller |
| own unit's vehicle (`vehicule_unite`) | **Embarquez avec moi** (`avec_moi`) | Descendez (`debarquer`) | — |
| cellular van (`cellulaire`) | **Partir au commissariat** (`transferer`, §8) | Venir ici (`avancer` for the van crew) | — |
| an agent of a unit under command (`policier`) | **« MISTRAL 2, avec moi »** (`suivre_pied` for *that* unit). That unit also becomes the addressee: aiming at it is the fastest way to pick it. | Tenir sa position (`tenir`) | Laisser agir seuls (`libre`) |

Locked entries are shown greyed, with the reason (§7), and are never sent. Charger, Gaz, Bond, Tortue and Se replier
remain one step further, under « Plus… », and keep their current lock (`orderWheel.ts` `lockedReason`).

---

## 4. Who obeys: the addressee

### 4.1 Default addressee (new `directAddressee(env, order)` in `direct.ts`, built on `bestUnit.ts` `proposeWho`)

The order **never goes to the company root** any more; this removes P7 and the 69-agent block of `diag-terrain`
§3. The default depends on the poste:

| Poste | Default addressee |
|---|---|
| chef de groupe | his group |
| chef de section | **his section** (ALFA, BRAVO and CHARLIE move together, each on its own front: `couper_circulation` already splits a section across the road) |
| BRAV-M chief | the BRAV-M unit (`BravmUnit`, §6) |
| commandant | the best unit for the order (below) |

For a commandant, the best unit is chosen per order:

- **Interpeller:** the BRAV-M if it is free and within 500 m; otherwise the nearest free group.
- **Bloquer la rue / Tenir une ligne / Repousser:** the nearest section that is free or merely « avec vous », in
  that order.
- **Encercler:** two or more sections, as the map's `proposeWho` does for a nasse.
- **Secourir:** the nearest group.
- **Pousser:** the Centaure. **Éteindre:** the water cannon.
- **Avec moi:** everyone.

### 4.2 Choosing another unit

- **U** cycles through: the default, then the special units (BRAV-M, Centaure, water cannon), then each section by
  distance, then « Toute la compagnie ». **Shift+U** goes back. Phone: tap the « À : » chip.
- **Aim at an agent of a unit, then F:** that unit comes « avec moi » and becomes the addressee (§3, last row).
- **The choice is sticky** for 20 s after the last order, or until the player presses U again. This way the
  automatic choice never fights his own. The tag always shows who will obey.

---

## 5. Feedback: within a second, in the world, not in a toast

### 5.1 At the press (t = 0)

1. **A world marker** is placed at the order point by a new `markers.ts` source, `ordres`, with up to 3 live
   markers. It takes the unit's colour and reads « MISTRAL 1 — Bloquer ». For an arrest, it is a red chevron that
   follows the target.
2. **The unit chip** in the HUD (`src/ui/command/hud.ts`) switches at once to the **player's** order:
   « MISTRAL 1 · BLOQUE LA RUE ». It never shows an internal order again: `backToMotos`, `approach`, convoy
   `embarquer` / `debarquer` and the dismount step (§5.3) all map to the order they serve, with a suffix. Examples:
   « MISTRAL 1 · BLOQUE LA RUE — descend des fourgons », « FAUCON 1 · VA AU CARREFOUR — en selle ». Code: `tagOf`
   reads a new `squad.orderAim` (the player's order) when it exists, instead of `squad.order`.
3. **No toast** on success: the 2.5 s « Ordre donné : … » in `orderWheel.ts` `issue` is removed. A toast appears
   only for a refusal (§7).

### 5.2 Acknowledgement (t ≈ 0.4 to 0.8 s)

- **Visual:** at `ackAt` (`maneuver.ts` `startOrder`, 0.35–0.75 s), the marker label turns into « REÇU » for 1.5 s,
  and a small « REÇU » bubble appears above the unit leader (a world-anchored label, the same projector as
  `markers.ts`). **This is independent of the radio audio queue.** It is the « within a second » of G2, even when
  the radio is busy.
- **Radio:** the unit's reply becomes a reply chained to the player's message. In `gameplay/radio/queue.ts`, add
  `replyTo: messageId`. A chained message goes on the **same** channel (`commandement`), immediately after its
  parent, in the player's fast lane. This removes the « REÇU before the order » inversion and the 17 s BRAV-M
  acknowledgement (`SpecialUnit.say` also gets the chaining).
- **Shorter phrases:** the player's phrase is cut to the order and the place (« MISTRAL 1, barrez la rue
  Saint-Gilles »). The `callsign()` self-address (« MISTRAL ICI MISTRAL ») is fixed: the player's indicatif is
  « AUTORITÉ » for a commandant and the section's chief indicatif otherwise. The completion report goes to the
  player, not to CENTRAL: `radio.ts` `superior()` stops at the player.

### 5.3 Movement (t ≈ 1 to 2 s), on foot, at the trot

- Direct orders up to **400 m go on foot at the trot** (`PLAYER_RUSH_MIN` logic in `system.ts`), and are not
  re-boarded. The implicit convoy (`CommandCore.issue` with `MOTOR_DISTANCE` 250 m) remains for the map and for
  points beyond 400 m. **Exception:** a unit that is still seated and whose point is more than 150 m away drives
  there with its own vans and gets out at the point. Re-boarding a unit on foot for 300 m costs more than running.
- **Dismount first (fixes P1):** in `src/sim/police/maneuver.ts` `startOrder`, when a foot order reaches a unit
  that has seated agents, a dismount step runs first (the same `startDisembark` the convoy uses), and then the
  order. In `tree.ts` `refreshFormable`, seated agents count as « coming », not as absent. Reports such as
  « Barrage en place » are spoken only when at least half the agents took part.
- **A new player order cancels any convoy (fixes P2 and P4):** add `ConvoyControl.cancel(squadId)` (stop the
  autopilots, clear `boardId`, stage `annule`). `CommandCore.issue` calls it for every squad it addresses.
  `beginDisembark` skips squads whose order was issued by the player after the convoy started.
- **A single unit, not a block:** because the addressee is a section or a group (§4), the 25 s `FORM_TIMEOUT` and
  the 8 s column forming of a 69-agent block disappear from the common case.

### 5.4 Done (t ≈ 20 to 60 s)

The marker turns into « ✓ en place » for 5 s and then fades. The chip reads « MISTRAL 1 · TIENT LA RUE ».

---

## 6. Units « avec moi » always have a readable order (G2)

« Tout le monde doit me suivre »: every unit under the player's command that has no other order is **avec moi**,
from the start and after every convoy.

- **Initial order** (`src/gameplay/session/setup.ts` lines 218–224): `suivre` on the player is issued to every
  squad in scope, including the commandant's whole tree, the chef de section's section (drop the
  `members.length > 1` test, which skipped sections) and the BRAV-M. The exceptions are pinned mission units and
  engine escorts.
- **After a column (fixes the blocker « DESCEND forever »):** `src/gameplay/session/follow.ts` `endConvoy()` issues
  `debarquer`, then puts `suivre` on the player in `afterConvoy`. The mechanism already exists: `core.ts` line 388
  does it for `avec_moi`.
- **Garde posture when he stops:** inside the `suivre` order (sim side, `maneuver.ts` / `mcore.ts`), when the leader
  being followed has not moved more than 2 m in 3 s, the unit forms a line 10–15 m from him. It faces the nearest
  crowd within 80 m, otherwise it faces where he is looking. When he moves more than 8 m, the unit goes back to the
  column. **The order stays `suivre`** (no new order type), and the chip reads « AVEC VOUS · EN GARDE face à la
  foule » or « AVEC VOUS · VOUS SUIT ».
- **The BRAV-M avec moi** follows mounted, 40–60 m behind, and gets off its motos when the player stops near a
  crowd (§6.2 rule below).
- **When a direct order is done** (for example the barrage is in place), the unit keeps that order. It never falls
  back to « SANS ORDRE ». « A : Avec moi » brings it back.

### 6.1 BRAV-M (G3)

1. **Inside the company** (fixes the blocker): add `parentId?: number` to `BravmOptions` (`src/sim/police/api.ts`
   line 159), pass `parentId` in `units.ts` `createBravm` (line 573), and set it in `setup.ts` line 539 as is done for
   the water cannon and the Centaure. From then on it is in `scope.squadIds`, in the U cycle, in « Avec moi », and in
   `bestUnit` « Toute la compagnie ».
2. **Distance rule** (`src/sim/police/command/bravm.ts` `BravmUnit.begin`, cases `avancer`, `colonne` and `repli`):
   - point below `RIDE_BEYOND` (60 m): **on foot**, with no walk back to the motos;
   - motos more than 40 m away (`MOUNT_REACH`) and point below 250 m: on foot as well;
   - otherwise: mounted.
3. **No stand-off for a player order:** for an order with `issuedBy === player`, the unit « arrives » when the lead
   moto is within 30 m, or when it has been blocked for 8 s. It then gets off and walks the rest, instead of
   `attente > 40 s` or `rideMax 240 s` followed by « accès bloqué ». The 20 m push-back of the stopping point
   (`ride()`) applies only to AI orders.
4. **Interpeller:** mounted when the target is more than 60 m away (today the unit walks up to 250 m). Shorter watch
   (`WATCH_TIME` 25 s → 8 s once the target is designated by the player).
5. **The chip and the map show the player's order** (§5.1), not « MONTE » or « EN FILE ».
6. **BRAV-M chief poste:** `catalog.ts` gets a `chef_bravm` poste (brigadier-chef). `roster.ts` (case `'bravm'`)
   then puts the player as the leader of the `BravmUnit`, and `scope.ts` gives him `unite` over FAUCON. The column
   no longer waits silently for him (`journee.ts` `dispatch`, `solo`): the BRAV-M leaves with the column, and the
   objective says « La BRAV-M part avec vous : en selle ». The gardien and pilote postes stay read-only.

---

## 7. Refusals: one sentence, and what to do instead (G3)

Every refusal is a toast (warn, 5 s) **and** the greyed tag line. Exact texts:

| Case | Text |
|---|---|
| force not authorised | « Charger demande les sommations et le bâton. Maintenez F → Sommations, puis L pour autoriser. » (commandant) / « Charger demande l'autorisation du commandant. Demandez-la à la radio (T). » (others) |
| only one unit for Encercler | « Encercler demande deux unités : vous n'en avez qu'une. Bloquez plutôt la rue. » |
| Interpeller with no offence | not offered. The tag reads « Repousser ». On a person with no offence the ring offers « Le suivre » (`suivre`, with an arrest on the first offence through the existing BRAV-M watch). |
| no Centaure | « Pas de blindé Centaure sous vos ordres. Bloquez la rue en attendant. » |
| every unit busy | the tag still names the nearest unit, with « (quitte la rue X) ». The order is never silently dropped. |
| point too far or not visible | « Trop loin pour viser (520 m) : Tab, la carte s'ouvre sur ce point. » The map opens with the same addressee and verb preselected (`tacticalScreen` gets `openAt(x, z, squadId, intent)`). |
| unit still getting out | not a refusal. The tag reads « MISTRAL 1 descend des fourgons (4/6) : votre ordre partira dès qu'ils sont à pied. » |
| read-only poste | « Votre chef donne les ordres. A : votre binôme avec vous. » |

---

## 8. Arrested people and cellular vans (G4)

### 8.1 Vans always there, scaled to the crowd

- Add `cellulaires` to `RequestedMeans` and `recommendedMeans` (`src/ui/screens/scenario.ts`): **max(1, ceil(crowd /
  400)), capped at 4**. At least 1 whenever there is a BRAV-M, in every special mission with police, and per patrol
  sector near a demonstration.
- Each van is **crewed**: `createEquipage('fourgon_cellulaire', { parentId: company })`, a CrewKind that already
  exists. It is named « CELLULAIRE 1 … n » (as the stations' « CELLULAIRE 75-01 » are), and parked at a **point de
  remise** 60–100 m behind the line, on the side away from the crowd (reuse `supportSpot` / `roadSpot`). It replaces
  the single crewless van made by `createCompany`. In a service day the vans leave with the column (crew aboard;
  `cellToRear` no longer leaves them at the station).
- **BRAV-M missions:** the van takes the place of the invisible motorbike point (`bravm.ts` `ensureHandover`).
- **On screen:** one world label on each van, « CELLULAIRE 1 · 3/8 ». It is shown within 150 m, or always while the
  player is escorting or has an arrest in progress. On the maps the van gets the same label. No new button.

### 8.2 The player arrests someone himself

- **E four times, as today:** Interpeller, Menotter, Palpation, then « **Emmener X** », the renamed « Escorter X ».
- **Then the fifth E is never « Faire asseoir » any more** (`interactions.ts`). The top prompt becomes:
  - « **Confier X à MISTRAL 1 ALFA** » (E, 1 s) when any free agent of a unit under the player's command, or of his
    own group, is within 60 m. The binôme walks to the player (5–15 s) and takes the detainee. The player is free.
    The binôme then runs the existing `ops-arrest` stage 4 (`findHandover`, walk, `remettre`), through a new entry
    point that starts at stage 3 with `target.custody === 'cuffed'`.
  - otherwise « Remettre X (CELLULAIRE 1) », within **12 m** of a cellular van (`handoverVehicleRange` is per kind:
    12 for `fourgon_cellulaire`, 5 for the others). `Handover.find` ranks cellular vans first, whatever the distance
    to the other vehicles.
  - « Faire asseoir » moves to holding E (0.6 s).
- **While he escorts** with nobody to hand over to, the « Ma mission » card gets a `custody` source, ranked first in
  `executant.ts`: « **Emmenez l'interpellé au CELLULAIRE 1 — 140 m** ». The existing objective marker is drawn on
  the van. The commandant, who has no card, gets the same line in the F tag zone.
- If he boards a vehicle while escorting, the detainee is put in the same vehicle (an automatic remise) instead of
  being left seated on the pavement.

### 8.3 AI arrests (ordered with F on an offender)

- `ops-arrest.ts` `findHandover` uses **every cellular van of the dispositif** (not only `fleetOf(top)`), within
  400 m of the van's parking point. When none is reachable, the nearest van **comes**: a `transferer`-family order
  « venir chercher », which answers the unanswered « demande un véhicule pour la remise » (P7).
- The world chevron of the order follows the detainee to the van. The van label goes « 3/8 » → « 4/8 ». The radio
  says « UN interpellé à bord du CELLULAIRE 1, en attente de transfert au commissariat » (instead of « pour
  présentation à l'officier de police judiciaire »).

### 8.4 The van takes them to the station; another is always there

- A new `src/gameplay/law/transfer.ts`, `TransferSystem`, built on the stations feature once it is merged.
- **When a van leaves:** when it is full, or holds 3 or more detainees for 5 minutes, or on the player's order (aim
  at the van, F « Partir au commissariat »).
- **Where it goes:** the van drives without its siren to `nearestCommissariat` (`src/world/commissariats`, merge
  tree). It uses the single-vehicle autopilot route.
- **At the station:** it reuses the detainee loop of `CommissariatsSystem.arrive` (exit and remove), emits
  `commissariat:returned`, and calls `Custody.deliver(targetId, station)`, which sets a new record status
  `depose_commissariat`. Then it comes back.
- **Replacement:** at the same moment, the station's stock van (`engage()` with a `cellulaire` stock entry) is
  engaged towards the point de remise, so there is **always one van on site**. Engaged station vans are parented to
  the company, so AI arrests see them.
- **Merge-tree fix:** `engage.ts` `unitVehicles` must include `extraVehicles` (P12).
- **Debrief** (`Records.stats`): « Interpellés : 5 — 3 déposés au commissariat du 3e, 2 en attente dans le
  CELLULAIRE 1 ».

### 8.5 One meaning per word: « escorte »

| Thing | Word used everywhere (UI, radio, card) |
|---|---|
| player walking a detainee | **Emmener** (« Emmener X », « Emmenez l'interpellé au CELLULAIRE 1 ») |
| giving him to colleagues | **Confier** |
| putting him in the van | **Remettre** |
| order `escorter` (map « Plus… ») | **Accompagner une unité** (tag « ACCOMPAGNE ») |
| foot guard of an engine | « **Protège le Centaure** » (radio: « je protège le Centaure », instead of « l'élément désigné ») |
| missions (escorte de la délégation, des pompiers, vers le métro) | unchanged (mission vocabulary) |

---

## 9. Arriving at a demonstration (G5)

The rule: **whatever the stage, F is accepted and carried out, or the tag says in one line what is being finished
and when it will be ready.**

| Stage (convoy / journée) | What the player sees | What F does |
|---|---|---|
| route (seated) | tag « En route — arrivée dans 1 min 20 » | the order is kept: it is carried out at the stop (queued in `afterConvoy`, cleared by a new F) |
| column stopped (stationnement) | « Les fourgons se garent — on descend dans 10 s » | same |
| unloading | « MISTRAL 1 descend (4/6) : votre ordre partira dès qu'ils sont à pied » | dismount-first chain (§5.3), so it is carried out the moment the agents are out |
| on foot | normal tag | immediate |

The convoy fixes this relies on, all from `diag-arrivee`:

- **Per-vehicle unloading:** each vehicle unloads as soon as it is stopped within 60 m of its parking slot
  (`convoy.ts` `thinkPark`). The company is never held for a straggler (`PARK_WAIT_JOINING` 720 s goes). Parking is
  capped at 60 s when the player is aboard.
- **Departure:** the column leaves the station as soon as everyone is aboard, or 20 s after the player boarded
  (`BOARD_MAX` 120 s goes).
- **`beginDisembark` never overwrites a player order** (P4). `ConvoyControl.cancel` exists (P2). `awaitPlayer` applies
  only when the player himself ordered « Avec moi » in vehicles.
- **The débarquement stage ends** when no agent of the company is seated, instead of waiting for the `debarquer`
  order to report done (P5). The adjoint may then propose « Mise en place du dispositif » as soon as the column
  stops.
- **Chef de section:** `command.ts` `buildElements()` skips any squad led by the player or under a squad he leads
  (P6).

---

## 10. Coexistence

- **Command map (Tab):** it stays the place for the big picture. **Shared vocabulary**: the map's intentions and the
  F tag use the same words:

  | Map intention (key unchanged) | Field |
  |---|---|
  | **Y aller** (E), renamed from « Envoyer » to match the card's own first line « Y aller » | Y aller |
  | **Bloquer une rue** (B) | Bloquer la rue X |
  | **Encercler** (N) | Encercler |
  | **Repousser** (D), renamed from « Disperser »; sub-line « repousser, gaz, charge » | Repousser |
  | **Interpeller** (I) | Interpeller |
  | **Secours** (S) | Secourir / Pompiers ici / SAMU ici |
  | **Plus…** (O) | Plus… |

  - The map opens on the designated point with the tag's addressee preselected (`openAt`). The card's « Qui » line
    and U are the same notion as the field's U.
  - P7 fixes are applied to the card: Encercler is hidden with fewer than two units, and Interpeller with no offence
    defaults to « Le suivre ».
- **Adjoint (P / Shift+P):** unchanged. Its proposal stays in the left zone (desktop) or the top banner (phone). It
  proposes from the column stop (§9).
- **Patrol call card (Y, `src/ui/patrol/dispatch.ts`):** unchanged. Patrol crews are read-only, so they have no F
  tag. Their detainee goes in the back of their car, and the car's « Ma mission » card then says « Conduisez
  l'interpellé au commissariat du 3e — 1,2 km », with the station as the objective. On arrival, the same
  `TransferSystem` delivery runs.
- **Read-only postes** (CRS, BRAV-M gardien, engine crews): F keeps the reduced wheel (1 Avec moi to his binôme, 2,
  7). A is « Avec moi ». « Ma mission » shows the chief's order.
- **Drone and vehicle driver:** no F tag while driving. F keeps the wheel (orders addressed as today). A is « Avec
  moi » in vehicles.

---

## 11. Walk-throughs (second by second, presses counted, compared with today)

### 11.1 He arrives by column and wants his section to block the street he is looking at

Poste: chef de section (capitaine), service day, Bastille. For a commandant the only difference is that the
addressee is « MISTRAL 1 (la plus proche) ».

| t | Proposed |
|---|---|
| 0 | The column stops 90 m from the place. Tag: « Les fourgons se garent — on descend dans 10 s ». |
| 0–12 | The vans stop one by one; each unloads at once (per-vehicle unloading). The player is ejected as passenger at the stop, or presses E « Descendre » (**1 press**). |
| 12 | On foot, he turns towards rue Saint-Gilles with the arrows or the trackpad (about 2 s). The street mouth is outlined. Tag: « **F  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m** ». |
| 14 | **F** (**press 2**). A marker appears at the mouth; the chip reads « MISTRAL 1 · BLOQUE LA RUE — descend des fourgons (5/6) ». |
| 14.6 | « REÇU » above ALFA's and BRAVO's chiefs. Radio: « MISTRAL 1, barrez la rue Saint-Gilles. » then, right after, « REÇU, barrage rue Saint-Gilles. » |
| 15–16 | The last agents get out (dismount-first); the first agents start trotting. |
| ~45 | At the mouth (90 m at about 3 m/s). |
| ~60–70 | Line formed across the full width; the marker reads « ✓ en place ». |

Totals: **2 presses (1 of them the exit), about 1 min 10 from the column stop to the street blocked.**

Today (diag-arrivee R1/R4, diag-terrain J1/T8):

- The column stops at t=436 and unloading starts at t=987 (up to 551 s seated). During that time F→4 is accepted
  and nothing moves (P1).
- The map card « Bloquer » to his own section boards it and waits for him for up to 300 s (P2, R4). The minimum is
  Tab, B, Entrée, Tab (4 presses plus navigation) once on foot.
- **Today: 4–6 presses, and between 2 and 11 minutes, often never.**

### 11.2 He sees a rioter throw a projectile and wants him arrested and taken away

Poste: commandant, free mode, Concorde.

| t | Proposed |
|---|---|
| 0 | The bottle is thrown. `law` records the offence, and the thrower becomes `auteur` (red chevron). The player pans roughly towards him; the 4° cone picks him up among the demonstrators. Tag: « **F  Interpeller le lanceur (veste rouge) · BRAV-M FAUCON 1 · 70 m** ». |
| 1 | **F** (**press 1**). The red chevron locks onto him; the chip reads « FAUCON 1 · INTERPELLE — en selle ». |
| 1.5 | « REÇU » above the BRAV-M chief; the chained radio acknowledgement follows the order phrase. |
| 2–15 | A mounted binôme rides 70 m (more than 60 m, so mounted), gets off within 30 m and grabs him. |
| ~20–40 | Caught (today the AI catch takes about 68 s on foot). Toast: « Interpellé — conduit au CELLULAIRE 1 (110 m) ». |
| ~60–80 | Handed over at the van, which is crewed and parked 60–100 m behind the line. The label goes « CELLULAIRE 1 · 1/8 ». |
| later | When it reaches 6/8, or 3 detainees for 5 min, or when the player aims at it and presses F « Partir au commissariat », it leaves for the 1st arrondissement station and a stock van comes in its place. The debrief counts « déposé au commissariat du 1er ». |

Totals: **1 press, about 1 min to the van.** If the player arrests the man himself: **E ×4, then E « Confier à
MISTRAL 2 ALFA » = 5 presses, about 12 s, no walk.**

Today:

- F, 5 needs the person exactly under the 1.1° crosshair, and goes to the whole 87-agent company.
- The BRAV-M can be reached only through the map: Tab, I, U, Entrée, Tab. The acknowledgement comes after 17 s; the
  unit walks 120 m and does not catch him in 180 s (T5).
- Done by himself: 4 E, then a 225 m walk with no guidance (about 2.5 min), and the 5th E sits the detainee down.
- The van never leaves.
- **Today: 2–5 presses plus precise pointing; minutes; nobody goes to a station.**

### 11.3 He wants the BRAV-M to go to a crossroads 400 m away

Poste: commandant, on foot, boulevard view.

| t | Proposed |
|---|---|
| 0 | He looks down the boulevard (level pitch). The far designation (450 m raycast, snapped to the crossroads) outlines « carrefour bd Beaumarchais / rue du Pas-de-la-Mule · 400 m ». The tag proposes « Y aller · MISTRAL 2 ». |
| 1 | **U** (**press 1**): « Y aller · **BRAV-M FAUCON 1** · 400 m ». The BRAV-M is the first special unit in the cycle. Alternative: aim at a BRAV-M moto first, then the target. |
| 2 | **F** (**press 2**). A marker appears at the crossroads; the chip reads « FAUCON 1 · VA AU CARREFOUR — en selle ». |
| 2.5 | « REÇU » above the BRAV-M; the chained radio follows. |
| 3–10 | Mounted: off at once. On foot within 40 m of the motos: about 6 s to get on (`MOUNT_REACH`). |
| ~45–60 | 400 m at 5.5–11 m/s; it arrives when within 30 m, or when blocked for 8 s (then it gets off and walks). The marker reads « ✓ en place ». |

Totals: **2 presses, under 1 minute.** If the crossroads is not visible (a bend): « Trop loin pour viser : Tab ».
The map opens on that heading with FAUCON 1 preselected: Tab, arrows to the point, Entrée = **3 presses plus
pointing**.

Today:

- It is impossible from the field (the BRAV-M is outside the company, diag-terrain §2).
- Map: Tab, move to the place (arrows or R and a search), E, U until FAUCON, Entrée, Tab: at least 6 presses plus
  navigation.
- The acknowledgement comes after 17 s. Then « Arrêtés à 50 mètres du point, accès bloqué » after 77 s for a 50 m
  point (T4), or still riding after 70 s (J1).
- **Today: 6+ presses, and it often never arrives.**

| Wish | Today (presses / result) | Proposed (presses / time) |
|---|---|---|
| block the street on arrival | 4–6, 2–11 min or never | **2**, ~1 min 10 |
| arrest a thrower and take him away | 2–5 plus precise pointing, minutes, never to a station | **1**, ~1 min to the van, then the station |
| BRAV-M to a crossroads 400 m away | 6+, often « accès bloqué » | **2**, < 1 min |

---

## 12. What is removed or merged (less on screen than today)

| Today | Proposed |
|---|---|
| desktop block « ORDRES »: header plus 4 lines (Suivez-moi à pied F→1, Suivez-moi en véhicules F→2, Secours ici F→7, Carte de commandement Tab) | **one contextual line under the crosshair (the F tag)**, plus a single « Secours ici » line kept in the left zone (an explicit earlier request). The other three lines go: A replaces both « Suivez-moi », the Tab hint moves into the tag only when a point is too far. |
| two follow orders (« à pied », « en véhicules ») | **one: « Avec moi »** (A). It picks foot or column from how the player moves, as the phone pill already does. |
| F = eight-sector wheel for every order | **F tap = the order**; F hold = 4 sectors; the 8-sector wheel lives behind « Plus… » |
| toast « Ordre donné : … » (2.5 s) | removed; replaced by the world marker and « REÇU » |
| chip with internal orders (« MONTE », « DESCEND », « EN FILE », « SANS ORDRE ») | the player's order plus a short progress suffix |
| phone round « Ordres » button | the same place becomes the contextual « Ordonner » pill (same count) |
| map tiles « Envoyer » / « Disperser » | renamed « Y aller » / « Repousser » (same keys) |
| « escorte » with five meanings | Emmener, Confier, Remettre, Accompagner, Protège (§8.5) |
| invisible « point de regroupement » and BRAV-M pavement point | the labelled CELLULAIRE van at the point de remise |

Net: desktop HUD goes from 5 command lines to 2 (tag + Secours). The phone keeps the same number of controls.
Keys: 2 new (A, U), both already meaningful in the map or mnemonic, plus ⌫ for undo.

---

## 13. Implementation plan (lots, modules, tests)

**Lot 0 — the base without which nothing direct can work** (these are the diagnosis fixes; most touch files shared
with the stations merge, so they come after it):

- `maneuver.ts` `startOrder` dismount-first; `tree.ts` `refreshFormable`;
- `convoy.ts` `cancel`, `beginDisembark` guard, per-vehicle unload, `BOARD_MAX`, `PARK_WAIT_JOINING`;
- `follow.ts` `endConvoy` followed by `suivre`;
- `setup.ts` initial `suivre` for sections and the commandant's tree;
- BRAV-M `parentId` (`api.ts`, `units.ts`, `setup.ts`);
- `command.ts` `buildElements` (P6), `thinkDeploy` at the stop (P5);
- the known blocking leftover (water cannon at the head, `thinkRoute` detaches only i ≥ 1), handled by the other
  agent.

**Lot 1 — designator and F:**

- new `src/ui/command/direct.ts` (`designate`, `directAddressee`, `issueDirect`, the last one built on
  `CommandCore.issue`);
- new `src/ui/command/directTag.ts`;
- `markers.ts` sources `designation` and `ordres`;
- `orderWheel.ts`: tap/hold split (`TAP_SECONDS` 0.24 s already exists), 4-sector ring, `WHEEL` behind « Plus… »;
- `buttons.ts` / `bindings.ts`: `with_me` KeyQ, `next_unit` KeyU, `undo_order` Backspace (field context);
- `quickActions.ts`: block reduced;
- `hud.ts` chip from `orderAim`;
- `player-aim.ts` unchanged (the designation cone lives in `direct.ts`).

**Lot 2 — acknowledgement and radio:** `queue.ts` `replyTo`; `kernel.say` and `SpecialUnit.say` chained;
`core.ts` `callsign`; `radio.ts` `superior`; the « REÇU » world bubble.

**Lot 3 — « avec moi » garde posture:** halt formation inside `suivre` (sim).

**Lot 4 — BRAV-M behaviour and chief poste:** `bravm.ts` `begin`, ride arrival and watch; `catalog.ts`; `roster.ts`;
`scope.ts`; `journee.ts` `dispatch`.

**Lot 5 — detainees:**

- `scenario.ts` `recommendedMeans` cellulaires; `units.ts` / `setup.ts` crewed vans and point de remise;
- `handover.ts` range per kind and van priority; `interactions.ts` Confier / Emmener / Faire asseoir on hold;
- `ops-arrest.ts` stage-3 entry and `findHandover` over every van; `executant.ts` `custody` source;
- new `gameplay/law/transfer.ts`; `engage.ts` `unitVehicles`; `Records.stats`; texts.

**Lot 6 — phone:** `layouts.ts` « Ordonner » pill; `overlay.ts` long press and `setOrderLabel`; addressee chip.

Tests (one robot at a time, never the whole suite):

- **New robot `tests/unit/playtest.ordre-direct.test.ts`.** It runs the three walk-throughs headless through
  `designate()` and `issueDirect()`, with the same aim fields as the player, and checks:
  - acknowledgement < 1 s and first move < 2 s;
  - chip text, marker state, arrival time;
  - for the arrival case, every convoy stage.
- **New e2e `tests/e2e/ordre-direct.mjs`:** 1280×800 keyboard only (F, U, A) and 844×390 touch (« Ordonner » tap and
  long press, the « À : » chip, no overlap with `primary` / `interact` / `radio`). Screenshots in the scratchpad.
- Extend `playtest.commandant-terrain` and `playtest.interpeller` to the new paths.

---

## 14. Risks

1. **Muscle memory:** « F puis 1 » becomes « maintenir F, 1 » (or A). A player who taps F out of habit gives the
   natural order. Mitigations: ⌫ undo for 4 s; the tag shows exactly what F will do; the « Plus… » wheel keeps every
   old number.
2. **A wrong natural order:** a crowd behind a street mouth, or a wounded person standing in a crowd, can make the
   resolver pick the wrong verb. The priority order must be tuned on the real map. The outline and the tag make the
   choice visible before the press, and the ring holds the other two. It needs a robot that sweeps aims over the
   five demonstration places and logs `kind`.
3. **Far designation** (450 m raycast every 0.1 s) costs CPU on the 4-core machine and on phones. Cast it only when
   the pitch is level and the near ray found nothing, at 4 Hz. Snapping to a crossroads can pick the wrong side of a
   square; show the name, and offer Tab when unsure.
4. **The automatic addressee** can pull a section out of a barrage the player wanted kept. Mitigations: never take
   a unit that holds a player-issued `couper_circulation`, `ligne` or `encercler` unless it is the only one; say
   « (quitte la rue X) » in the tag; the 20 s sticky choice.
5. **Garde posture inside `suivre`** touches the sim maneuver code that every follow path uses (column, convoy
   escorts, engine escorts). Regression risk for `follow.ts`'s 1300 lines; it needs its own robots.
6. **BRAV-M inside the company** changes `fleetOf`, `follow.ts` « wholeCompanies », company tallies and the debrief.
   BRAV-M motos in « Avec moi » columns could be pulled into vehicle convoys meant for vans. Exclude motos from the
   van column and let them shadow.
7. **Dismount-first and convoy cancel** change the convoy state machine, which has the known blocking leftover and
   is being edited by another agent and by the stations merge. They must land after both, in one lot, with the
   arrival robots re-run (R1–R9, M1–M3).
8. **More vans** (up to 4 crewed) add 8 agents and 4 vehicles to parking and columns, on a map where parking jams
   are already a leftover (Préfecture, 9e). Stagger their arrival, and park them at the point de remise, not in the
   column block.
9. **The transfer depends on the stations merge** (`nearestCommissariat`, stock vans, `CommissariatsSystem.arrive`).
   Until it lands, the van can only « leave » off-map. Ship the van and the guidance first; the transfer second.
10. **Phone:** a 150 px pill at bottom 196 on the left can meet the floating stick when the thumb lands high, and the
    centre chip can meet the item bar in `drone` and `vehicule` layouts. Check with the e2e at 844×390 and the
    0.82 scale; hide the chip in vehicle layouts.
11. **Radio chaining** (`replyTo`) changes the queue's fairness: a burst of orders could starve CENTRAL. Cap chained
    replies at one per order, and drop CENTRAL's repeated « URGENT. Automobiliste bloqué » (a known leftover).
12. **Wording renames** (Envoyer → Y aller, Disperser → Repousser, Escorter → Emmener / Accompagner) touch tests and
    the spec `design-commande.md`. Grep the e2e and unit expectations before renaming.
