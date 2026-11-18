# COORDINATOR'S UPDATE — stage 1b (15 h 30) — read first; it overrides everything below

**State of this worktree now:**
- **P1 is DONE** (pure order logic in `src/ui/command/direct/`, contracts). Its full report is in
  `/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-paquets-ordres-directs.json`
  (read its « deviations » and « openIssues »: several concern your package).
- Two reviewed fix lots are **applied here** (staged): « colonne-tete-bloquee » (`src/sim/police/command/convoy.ts`
  lineUp / no-route report, `src/gameplay/radio/queue.ts` ageing of priority, `src/gameplay/incidents/radio.ts` CENTRAL no
  longer repeats the same kind of incident, `src/gameplay/session/engins.ts` siren) and « commandant-carte-3 »
  (`src/ui/command/{intents,preview,bestUnit,tacticalScreen}.ts`: patrol crews, nasse, « Autre unité »). Build on them.
- A third lot, « commandant-mission » (the player's exact game: the fifteen commandant missions), is being reviewed and
  will be applied here by the coordinator BEFORE packages P3, P4 and P6 start. It touches
  `src/gameplay/missions/{system,objectives}.ts`, `src/sim/police/command/{api,bravm,convoy,system}.ts`,
  `src/ui/command/{core,sendLine}.ts`.
- **This run: P2, P7 and P5 only**, in parallel. Next run: P3, P4, P6.

**Known red test, do not « fix » it by weakening it:** `tests/unit/playtest.commandant-compagnie-depart.test.ts` expects
the company (which contains the commandant ON FOOT) to leave in vehicles; since P1 (rule B2) such a unit goes on foot.
The guarantee it protects — after an order in vehicles EVERY vehicle of the company leaves and arrives — must stay
tested: P3 will adapt the robot (the commandant aboard his car, or the order given to units that do not contain him).

**What the three diagnosis robots and the mission robot proved, that your packages must end (evidence in the
`diag-*.md` files and in `/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/runs/`):**
- seated units accept every order and do nothing while the radio says « effectué » (P2);
- « REÇU » is heard before the order, BRAV-M acknowledgements come 17 s late, a refused order is not said (P7);
- nobody follows the commandant at the start, the BRAV-M is outside the company, the cellular van has no crew or stays
  at the station (P5).

---

# COORDINATOR'S ADDENDUM — read first; it overrides the rest of this document

**Date: 18 November. Staged delivery.** The player is waiting with a command loop he calls « incompréhensible »
(« je pouvais donner zéro ordre, ils ne suivaient pas… la BRAV-M ne bougeait pas… les CRS me suivent mais n'ont pas
d'ordre »). He was playing **commandant, in « Missions spéciales »**. The work is delivered in stages:

- **Stage 1a (now): package P1 alone**, in this worktree, on the current game.
- **Stage 1b (right after P1): P2, P7, P5, P3, P4, P6** — the simulation side: the blockers of §10. It makes what
  exists today (the « ORDRES » block, the wheel, the command map) work at once. Published as soon as it is green.
- **Stage 2: P8, P9, P10, P11 (new field interface), P13, P12, P14, P15 (detainees), P16 (acceptance).**

**What the coordinator does between stages, in this same worktree (do not be surprised by it):**
- He applies two reviewed fix lots written by other agents in parallel with this design. Read `git status` / `git diff`
  before you edit a file they touch, keep their fixes, build on them:
  - « colonne-tete-bloquee »: a column no longer waits forever behind a lead blocked against a wall (B12); the
    saturated command radio net (CENTRAL repeating « URGENT. Automobiliste bloqué… »); a point that cannot be reached by
    vehicle is said on the radio; siren. Files: `src/sim/police/command/convoy.ts`, `src/gameplay/session/journee.ts`,
    `src/sim/vehicles/autopilot*.ts`, `src/gameplay/incidents/**`, `src/gameplay/radio/**`, `src/gameplay/session/engins.ts`.
  - « commandant-mission »: a robot replays the fifteen commandant missions (passenger, driver, on foot) and fixes what
    stops the commandant from commanding on arrival. Files (so far): `src/gameplay/missions/system.ts`,
    `src/gameplay/session/{journee,follow,setup}.ts`, `src/sim/police/command/**`, `src/ui/command/{core,scope,bestUnit}.ts`,
    new `tests/unit/playtest.commandant-mission-*.test.ts` — **keep those robot tests green: they are the player's
    exact game.**
- He applies the « stations » (commissariats) merge when it closes (§8's note « start after the stations merge »
  is handled by him: if `src/gameplay/commissariats/` is not in your worktree, the stations are not there yet — build
  on the current game and use the off-map fallback of §5 where a station is needed).

**Rules that override the document where they differ:**
1. Section 8's ownership rule stands. Where the document says a package « starts after the stations merge », start
   anyway, and keep your hunks in `convoy.ts`, `setup.ts`, `core.ts`, `handover.ts`, `units.ts`, `journee.ts`,
   `src/gameplay/patrols/**` small and local (never reformat or reorder): they will meet a three-way merge.
2. The diagnosis reports are the evidence — read the one(s) for your package:
   `/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/ordres-directs/diag-arrivee.md`,
   `diag-terrain.md`, `diag-interpelles.md` (same folder). The three design proposals are there too
   (`proposition-*.md`), for background only: this document is the specification.
3. A fix is not done until a robot that plays like the player proves it (the acceptance sentences of §9). No
   « accepted but nothing moves »: that is THE defect the player met.
4. Fewer things on screen, plain French, no new wall of buttons. The command map's words are the words of the field.
5. Never run the whole test suite (the machine is shared by eight agents): run the listed tests and the prefixes you
   touch, in small groups.

---

# Ordres directs — final specification (« J'ordonne, ils y vont »)

Judge's synthesis of `diag-arrivee.md`, `diag-terrain.md`, `diag-interpelles.md` and the three proposals
(`proposition-viser.md` = **V**, `proposition-groupe.md` = **G**, `proposition-reactif.md` = **R**), checked against the
code of `/tmp/claude-0/hunt/ordres-directs/crs-simulation` (HEAD 6f3f12e) and of the stations tree
`/tmp/claude-0/hunt/merge-commissariats/crs-simulation`. No project file was modified to write it.

All UI strings below are exact. Code paths are relative to `crs-simulation/`.

---

## 0. Scores and what was kept

Score 0–3 per goal (3 = fully met, with a mechanism that the code supports).

| | G1 direct | G2 readable, ready | G3 every unit, refusals | G4 detainees | G5 arrival | G6 less, same words, devices | G7 nothing lost | Total |
|---|---|---|---|---|---|---|---|---|
| **V** « Je vise, j'ordonne » | 3 — one press on what he looks at, outline before pressing, 4° cone, far ray to 450 m | 2 — chip shows the player's order; « en garde » posture inside `suivre`; no group summary | 3 — BRAV-M `parentId`, per-case refusal texts, map handoff when too far | 3 — crewed vans, Confier, transfer, replacement, word table | 2 — stage table, relies on diagnosis fixes, no watchdog | 2 — changes the meaning of **F** (tap = order, hold = ring): every « F puis N » habit, hint and test breaks; KeyQ for « Avec moi » is good | 3 — old wheel intact behind « Plus… » | **18** |
| **G** « Mes hommes » | 2 — **Entrée** = obvious order (same key as the map's « Donner l'ordre »); field reuses the card pipeline; no far designation | 3 — group summary, postures without overwriting `squad.order`, `playerOrder`/`phaseOf` | 3 — BRAV-M in the U cycle, the van is a unit with its own verbs | 3 — same as V plus van in U cycle | 2 — good stage table, no watchdog | 2 — 5-line block, top-centre bar on a phone already crowded, moves Encercler on a map redesigned last night | 3 | **18** |
| **R** « Zéro attente » | 3 — one pill / one key, tap-on-world on the phone, long reach | 3 — tickets with reason and countdown, never « sans ordre » | 3 — tickets carry refusals, BRAV-M thresholds concrete | 3 — the van comes to the arrest | 3 — latency budget with constants, queued orders, watchdog fallback | 2 — KeyQ for *the* main order sits next to the move keys (mash risk); the player's phrase becomes silent (good for latency) | 2 — Encercler and « Laisser agir seuls » pushed to map / long-press | **19** |

Claims checked in the code (✓ true, ✗ false or incomplete — the spec uses the corrected fact):

- ✓ `KeyQ`, `KeyU`, `KeyK`, `KeyJ`, `KeyI` have no in-game binding (`src/input/bindings.ts DEFAULT_KBM`); `KeyU`, `KeyI`,
  `KeyJ` are used only inside the map (`tacticalKeys.ts`). `KeyQ` is the key labelled **A** on the player's AZERTY Mac.
- ✓ `Enter` / `Backspace` are bound only to `ui_accept` / `ui_back`, context `menu`; `ui_back` acts only when a screen is
  open (`ui/core/system.ts:253`). ✗ (G) « Enter is free in game » needs a guard: the order wheel reads `ui_accept`
  (`orderWheel.ts:559`) and `FocusNav` accepts on `ui_accept` when a container is active — the new action must be ignored
  while any screen is open or a text field has focus.
- ✓ The wheel addresses `scope.ownSquadId` (`orderWheel.ts:333`), i.e. the whole company for a commandant.
- ✓ `setup.ts:218-224`: initial `suivre` skips commandant/commissaire and squads with `members.length <= 1` (sections).
- ✓ `BravmOptions` (`sim/police/api.ts:159`) has no `parentId`; `setup.ts:539` creates the BRAV-M without parent while
  the water cannon / Centaure / drone get `parentId`.
- ✓ `refreshFormable` is in `sim/police/tree.ts:188` (✗ R says `mcore.ts`): `present` requires `p.vehicleId === 0`.
- ✓ `handleOrder` (`sim/police/system.ts:328`) copies a root order onto **every descendant** (except a squad led by the
  player). **New fact that the proposals missed:** the convoy's `debarquer`/`embarquer` are issued with
  `issuedBy: squad.leaderId` (`convoy.ts:407, 992, 1016`), which *is the player* for a commandant, and the AI command
  issues as the player in adjoint mode (`command.ts issuer()`). So « skip orders whose `issuedBy` is the player » (the
  P4 fix of the diagnosis, V, G, R) **cannot work**. This spec adds an explicit marker `SquadOrder.byPlayer` (§2.1).
- ✓ Convoy constants (`convoy.ts:79-97`): `BOARD_MAX 120`, `STRAGGLERS_MAX 45`, `PLAYER_WAIT 300`, `PARK_WAIT 300`,
  `PARK_WAIT_JOINING 720`, `CIVIL_CLEAR 20`; `thinkPark` already has a 20 s deadlock rule and drops a straggler stopped
  > 60 s — the 390–551 s waits come from a straggler that keeps moving.
- ✓ `MOTOR_DISTANCE = 250` exists **twice** (`ui/command/core.ts:26`, `ui/command/intents.ts:103`, used by
  `bestUnit.travel`).
- ✓ `tuning.ts`: `FORM_TIMEOUT 25`, `REALIGN_TIME 2.5`, `EXIT_INTERVAL 0.6`; `system.ts PLAYER_RUSH_MIN 35`;
  `maneuver.ts:62,91` `ackAt = now + 0.35 + (id·0.173 mod 0.4)`.
- ✓ `bravm.ts`: `RIDE_BEYOND 60`, `WALK_LIMIT 250`, `MOUNT_REACH 40`, `WATCH_TIME 25`, `rideMax ≥ 240`, blocked when
  `bloque > 12 s` or `attente > 40 s` (line 541); `begin()` defers `backToMotos()` for `avancer`/`colonne`/`repli`
  whenever not mounted, with no distance test (lines 283–308).
- ✓ `handoverVehicleRange 5` (`law/config.ts:67`); the cellular van bonus is −4 on a *squared* distance (`handover.ts`).
- ✓ `CrewKind` already contains `'fourgon_cellulaire'`; `createCompany` spawns one crewless van (`units.ts:495`).
- ✓ `markers.ts MAX_MARKERS 6`, objectives take at most 4. ✗ (R) using `objectives.upsert` for order markers would put
  them in the objectives list: a separate marker source is used instead (§1.5).
- ✓ Radio queue `maxWait [8, 90, 150]`, `gap 0.5`, player fast lane `fromPlayer` (`gameplay/radio/index.ts:77`).
  `RadioMessage` (`core/contracts.ts:1005`) has no reply/silent field: a contract change is needed (P1).
- ✓ Stations tree: stock entries `<site>:cellulaire<n>` kind `cellulaire`, callsign `CELLULAIRE 75-<n>`
  (`world/commissariats/data.ts:196`); `CommissariatsApi.engage(entryId)`, `recall(squadId)`; `CommissariatsSystem.arrive`
  removes every `in_vehicle` detainee of the unit's vehicles and emits `commissariat:returned {squadId, detainees}`;
  the stations tree **rewrites `ui/command/core.ts`** (adds `recallSquads` / `driveHome`, `retour_poste`): every package
  that owns `core.ts` lands after the merge.
- ✓ Phone layout (`input/touch/layouts.ts`): Radio round 54 at left 18 / bottom 196, Ordres round 54 at left 82 /
  bottom 196 (shared by the three layouts through `commsRow`), Interagir pill 132×46 right 24 / bottom 198, stick
  centre (104, bottom 96) r 62, `MOVE_ZONE` = left 40 % below the top 30 %, item bar left 186 → right 196, bottom 8,
  h 52. A pill from left 82 to left 262 at bottom 196–250 stays inside the left 40 % (338 px) and leaves 196 px of
  stick zone below it; nothing on the right moves.

**Kept from each.** From **V**: the designation outline before pressing, the 4° person cone, the far ray, « Avec moi »
on **A** (KeyQ), aiming at a policeman picks his unit, ⌫ undo, the word table for « escorte », remise range per vehicle
kind. From **G**: **Entrée** as the one key of the obvious order (same key and same words as the map card), field
orders built **through the map's own card pipeline** (`buildCard` → `proposeWho` → `sendCardLine`), verbs in the same
order and words as the map's intentions, postures of « avec moi » without overwriting the order, never Disperser as
the obvious order, second press on a locked verb starts the legal chain. From **R**: the latency budget and its
constants, the **ticket** (one state per player order with reason and countdown, queued instead of dropped), the
watchdog fallback, the silent player phrase with a pre-empting acknowledgement, the phone pill with a « À qui »
segment, the van that comes to the arrest. **Rejected:** V's F tap/hold split (breaks « F puis N » everywhere), KeyQ as
the main order (R), moving Encercler on the map bar (G), one-shot 10 s selection (G), FORM_TIMEOUT 8 s (R, 10 s kept),
not keeping « Secours ici » visible (earlier explicit request, task #10).

---

## 1. Interaction model (one page, the player's terms)

**What changes for him:** he looks at something; a line tells him what **Entrée** will do and who will do it; he
presses Entrée; the unit answers « REÇU » on screen at once and on the radio within a second, and moves within two.
**A** calls everyone back. **U** changes who obeys. **F** keeps the full list, with the map's words.

### 1.1 Laptop (keyboard + trackpad, no mouse)

| Key (physical `code` → label on AZERTY) | Name in the remap screen | What it does |
|---|---|---|
| **Entrée** (`Enter`, `NumpadEnter`) | « Donner l'ordre prêt » | gives the **ordre prêt** (§1.3) to the unit shown. Ignored while any screen is open (wheel, map, pause) or a text field has focus, ignored on key repeat (`e.repeat`), and ignored for 0.6 s after any screen closed (the map's own Entrée « Donner l'ordre » closes the map: the same keypress or its repeat must never give a second order on the field). |
| **Maj+Entrée** | « L'autre ordre » | gives the **second line** (§1.3, « autre ») when one is shown — e.g. « Disperser la foule » when a crowd is designated. Same guards as Entrée. Read directly with the Shift modifier, like P / Maj+P (no new binding row). |
| **A** (`KeyQ`) | « Avec moi » | every unit under command (or the unit selected with U, if one is selected) comes back and follows him: on foot if he is on foot, in their vehicles behind his vehicle if he is driving or aboard. Replaces « Suivez-moi à pied » and « Suivez-moi en véhicules ». KeyQ sits next to the move keys (KeyW / KeyA = Z / Q on AZERTY): A is ignored on key repeat, and like every field order it can be undone with ⌫ for 5 s (the line shows « ⌫ annuler » after it). |
| **U** / **Maj+U** (`KeyU`) | « À qui » | next / previous addressee (§1.4). Same key, same cycle function and same meaning as on the map. |
| **⌫** (`Backspace`, field only) | « Annuler l'ordre » | for 5 s after a field order (A included): the units get back their previous player order (or « Avec moi » if there was none). Ignored on key repeat and for 0.6 s after a screen closed (⌫ also closes the map / the wheel). |
| **F** then a digit | « Ordres » (unchanged id `orders`) | the order wheel (§1.2). Tap F, then the digit, or arrows + Entrée, or hold F and move the trackpad (unchanged mechanics, `wheelKeys.ts`). |
| Tab | unchanged | command map; opens with the field's addressee preselected. |
| P / Maj+P | unchanged | adjoint's proposal. |
| E | unchanged | interact; with a detainee: « Confier … » / « Remettre … » (§5). |

Labels on screen always come from `src/input/labels.ts` (« A » on AZERTY, « Q » on QWERTY).

### 1.2 The wheel (F): seven sectors, same words as the map, every old number keeps its meaning or a harmless one

Rule (critique): an old habit « F puis N » must never land on a coercive order. Today 4 = « Tenir une ligne »,
2 = « Suivez-moi en véhicules », and in « Plus… » 3 = Charger, 4 = Gaz: those numbers keep their meaning.

| # | Label | Sub-label | Order sent (`SquadOrder.type`, unchanged types) | Was |
|---|---|---|---|---|
| 1 | **Avec moi** | « reviennent et vous suivent » | `suivre` (via `follow.onFoot`) or `avec_moi` (via `follow.column`) by how he moves. **Digit 2 is an alias of 1** (not drawn: the old « F puis 2 » habit still brings everyone with him) | 1 « Suivez-moi à pied » + 2 « Suivez-moi en véhicules » |
| 3 | **Envoyer** | « y aller, au point visé » | card line « Y aller » of the intention Envoyer: `colonne`, or `avancer` within 60 m of a crowd (`intents.ts` rule) | 3 « Avancer jusqu'ici » (same number) |
| 4 | **Bloquer une rue** | « la rue visée, toute sa largeur » | card line of Bloquer: `couper_circulation` with `autoLineFor`; `ligne` facing the crowd if a crowd is within 30 m | 4 « Tenir une ligne ici » (same number) |
| 5 | **Interpeller** | « la personne visée » | `interpeller` + `targetId`; with no offence seen: card line « Aller constater » | 5 (same number) |
| 6 | **Disperser** | « repousser la foule visée » | `refoulement` through the card (legal chain when sommations < 3: the first press only explains, §4.3) | 6 « Pousser un véhicule » (moved to « Plus… » 9) |
| 7 | **Secours ici** | « pompiers, SAMU » | ring 1 « Pompiers ici », 2 « SAMU ici » (unchanged `RESCUE_RING`) | 7 (same number) |
| 8 | **Plus…** | « tenir, repli, charge, gaz… » | inner ring below | 8 (same number) |

« Plus… » ring (`MORE_RING`): the **existing numbers are kept** — 1 « Se replier » (`repli`), 2 « Bond en avant »
(`bond_offensif`), 3 « Charger » (`charge`), 4 « Disperser au gaz » (`disperser_gaz`), 5 « Tenir sa position »
(`tenir`), 6 « Arrêter l'action » (`cesser`), 7 « Laisser agir seuls » (`libre`), 8 « Se protéger (tortue) »
(`tortue`) — and **9 « Pousser un véhicule »** (`degager_obstacle`, the Centaure) is added. « Encercler (nasse) » stays
a map intention (N) — it needs two units and a picture; it is in the map's « Plus… » too. Read-only postes keep
`FOLLOW_WHEEL` with sectors 1 and 7 (digit 2 = alias of 1, as before).

The wheel addresses the **same addressee as the ordre prêt** (§1.4), never the company root (`orderWheel.ts:333`
goes). Locked sectors stay grey with their one-sentence reason (§4.3); pressing a locked Disperser / Charger / Gaz
digit a second time within 3 s starts the fix (« Faire les sommations », the existing `LegalChain` through
`issuePlan`).

### 1.3 The « ordre prêt » (natural order) — what Entrée does

`naturalOrder()` (P1, pure) is evaluated every 0.25 s on the **designation** (§1.5). First matching rule wins:

| # | Situation | Line shown (exact) | Order |
|---|---|---|---|
| a | the player holds a detainee (`custody.escortedBy(player)`, or he just finished the palpation) | « Entrée  Confier l'interpellé à MISTRAL 2 ALFA » / within 12 m of a van: « Entrée  Remettre l'interpellé au fourgon cellulaire 1 » / nobody free within 60 m and the van ≤ 100 m: « Entrée  Emmenez-le au fourgon cellulaire 1 · 70 m » (marker on the van) / van > 100 m: « Entrée  Faire venir le fourgon cellulaire 1 ici · 300 m » | hand-over (§5.3); the last form sends the van to him (`police.command.arrive(van, his position)`), line « Fourgon cellulaire 1 vient vous chercher — 40 s » |
| b | addressee (U) is a cellular van | « Entrée  CELLULAIRE 1 : partir au commissariat (5/8) » / empty: « Entrée  CELLULAIRE 1 : venir ici » | transfer (§5.5) / `colonne` for the van |
| c | a person with a witnessed offence (`law.canArrest`) within 4° of the crosshair and 120 m | « Entrée  Interpeller le lanceur de projectile · BRAV-M · 35 m » | `interpeller` |
| d | a wounded / downed person or a fire within 10 m of the aim point | « Entrée  Secours ici : blessé au sol » | rescue request (`requestRescueAtPlayer` at the point) + `secourir` to the nearest group |
| e | the crosshair itself (`aimedPersonId`, **no cone**) is on an agent of a unit under command that is **not** already « avec vous », within 60 m | « Entrée  MISTRAL 2 : avec moi » | `suivre` for that unit; that unit also becomes the addressee. (With the 4° cone, a barrage standing between him and the street he aims at would be recalled instead of the street being blocked.) |
| f | ≥ 8 demonstrators within 15 m of the aim point, point ≤ 120 m | « Entrée  Bloquer ici, face à la foule · MISTRAL 1 · 40 m » | `ligne`, heading from the point to the crowd centre |
| g | a road under the aim point (`world.nearestRoad` 25 m), point ≤ 150 m | « Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m » | card line of Bloquer (full width) |
| h | any other ground point ≥ 6 m away (up to 400 m with the far ray) | « Entrée  Envoyer : carrefour Voltaire · FAUCON 1 · 400 m » | card line « Y aller » |
| i | nothing (sky, wall < 6 m) | greyed « Visez une rue, une personne ou la foule — A : tout le monde avec vous » | **no order** (an Entrée pressed while looking at a wall must never recall every barrage; A does that on purpose) |

Disperser, Charger and Gaz are **never** the ordre prêt (coercive: deliberate choice). The deliberate choice still
costs **one** press (G1): when the designation is a crowd (rule f, or ≥ 8 demonstrators within 15 m of a rule g/h
point), a **second line « autre »** is shown under the ordre prêt: « Maj+Entrée  Disperser la foule · MISTRAL 1 »
(locked: « Maj+Entrée  Disperser : sommations d'abord », and the press starts them, §4.3). For a street (g) the second
line is « Maj+Entrée  Envoyer : rue Saint-Gilles » (go there without blocking); otherwise none. Phone: long-press on
the pill opens the wheel with the « autre » sector highlighted; releasing on it gives it (one gesture).

**Stability (critique):** the ordre prêt line changes at most every 0.5 s (hysteresis on top of the designation
stickiness), and Entrée executes **exactly the line displayed at keydown** (the runtime keeps the last displayed
`NaturalOrder`; it is never recomputed at the press). A line that changed less than 0.3 s before the press is shown
with a 0.3 s flash so the player sees what he ordered. The line is the same text on the laptop block, the phone pill
(short form, §1.6) and in tests.

### 1.4 « À qui » (addressee)

Default addressee (P1 `defaultAddressee(order, env)`, built on `bestUnit.proposeWho` restricted to the scope and to
units **not** given a player order less than 20 s ago):

| Poste | Default |
|---|---|
| chef de groupe | his group (no cycle; U and ⟳ hidden) |
| chef de section | his section; for Interpeller the nearest group of the section |
| Chef de la BRAV-M (new poste, §4) | the BRAV-M |
| commandant / commissaire | per order: Interpeller → the BRAV-M if free and ≤ 500 m, else the nearest free group; Bloquer / Envoyer / face à la foule → the nearest section that is free or « avec vous »; Secours → nearest group; Pousser → Centaure; « Avec moi » → everyone. **Never the company root.** |

« Free » (critique, was undefined): a unit is free when its current player order is `suivre` on the player (« avec
vous »), or `libre`, or a finished Envoyer / Interpeller / Secours. A unit holding a barrage, a line, an arrest in
progress or a route is **never** the automatic choice. When no unit of the right kind is free, the automatic choice
is the one whose order is the oldest and the line says what it leaves: « Entrée  Bloquer la rue X · MISTRAL 1 (quitte
la rue Saint-Gilles) · 90 m ». Patrol crew (chef de bord in patrol mode): his two colleagues, for Avec moi,
Interpeller, Secours and the detainee orders only (§4.3 refusal for the rest).

U cycle (fixed order, learnable, **one function** `who.cycle` used by the field and by the map's U in
`tacticalKeys.ts`): automatic choice → BRAV-M → sections by distance → Centaure, canon à eau, drone → cellular vans →
« Toute la compagnie » → back. **A manual choice applies to the next order only**, then the addressee returns to
automatic; the first U press after that order goes straight back to the last manual unit (so « the BRAV-M again » is
U, Entrée). Reason: with a 20 s persistence, the second Entrée aimed at a street sent the BRAV-M that was busy
arresting someone. The line always names the addressee. The selection is shared with the map's « Qui »
(`tacticalState` selection): opening Tab preselects it, closing the map keeps the map's choice for the next order.

### 1.5 Designation and feedback in the world

- **Designation** (P9 `designate.ts`): crosshair (`PlayerState.aimX/aimZ/aimedPersonId`) plus a 4° person cone for
  orders only (offender > wounded > policeman > demonstrator; nearest to the ray), sticky until the ray is > 8° away
  for 0.3 s. Far ray when the ground hit is beyond `AIM_GROUND_RANGE` (80 m) or the pitch is between −3° and +2°: 2D
  `world.raycast` along the view yaw up to 400 m, back off 5 m from the wall hit, snap to `world.nearestRoad` (25 m),
  at 4 Hz only. Place name from the road / `world.sectorName`.
- **Distance without pitch (critique — keyboard only, no mouse):** with arrows only the camera stays level, so the
  ground hit is always the 80 m cap and the far ray would always designate something 80–400 m away, never the
  street 30 m in front of him. Along the view ray the designation therefore **snaps to candidates, nearest first**:
  the crowd front (first point within 6 m of the ray with ≥ 8 demonstrators around it), each side-street mouth and
  crossroads (`world.nearestRoad` changes of road id along the ray), the end of the ray. Level view → the nearest
  candidate ≥ 15 m. Raising the view (trackpad, or PageUp / PageDown = fn + ↑ / ↓ on a MacBook) steps to the next /
  previous candidate (one candidate per 2° of pitch); the line names the place, so he never has to point precisely.
  The pitch window of the far ray becomes « pitch above −3° and a candidate beyond 80 m was stepped to ».
- **Outline before pressing:** a marker (new source `designation` in `ui/hud/markers.ts`, 1 slot) at the designated
  point, or a chevron above the designated person (`personId`), labelled with the verb (« Bloquer »).
- **At the press:** a marker of source `ordres` (up to 3 live, oldest fades) « MISTRAL 1 — Bloquer », following a
  person for Interpeller; « ✓ » for 3 s at `en_place`, then removed. No more « Ordre donné : … » toast on success
  (`orderWheel.ts:511`); toasts only for refusals.
- **Phone:** tapping the world (look zone, finger down < 220 ms, moved < 12 px) designates under the finger for 4 s
  (R §5.3); a look drag is never a tap.

### 1.6 Screen layout

**Laptop**, HUD zone `left` under the mini-map, 262 px wide (replaces the block « ORDRES », same widget id/slot):

```
AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule          ← state line (§3)
Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m             ← ordre prêt (§1.3)
Maj+Entrée  Disperser la foule · MISTRAL 1                          ← « autre » line, only when one exists (§1.3)
A avec moi · U autre unité · F tous les ordres · Tab carte          ← key line (shown for the first 5 orders, then only after 6 s without an order; « ⌫ annuler » replaces it for 5 s after an order)
Secours ici                                         F puis 7       ← kept (clickable, earlier request)
MISTRAL 2 · barre rue de la Roquette ✓ · BRAV-M · en route 40 s    ← detached units, 2 max, « +1 »
L'ADJOINT PROPOSE …  Accepter P · Plus tard Maj+P                  ← unchanged, commandant only
```

**Phone 844×390**, on foot / in a vehicle / drone (`commsRow`):

| Control | Spec (`ControlSpec`) | Rect on 844×390 (x, y from top-left) | Replaces |
|---|---|---|---|
| **Ordre prêt** pill, verb segment | `key:'orders'`, button `order_go` on tap, `shape:'pill'`, `contextual:true`, `side:'left', x:82, anchor:'bottom', y:196, w:128, h:54`; two lines: verb 15 px bold, addressee 11.5 px; label fed by new `input.touch.setOrderLabel(text, who)` | x 82–210, y 140–194 | the round « Ordres » button |
| **⟳ « À qui »** segment | `key:'order_who'`, button `order_who`, `x:212, w:54, h:54` (44 px at scale 0.82); **always « À qui »** (it never turns into « Annuler »: a player who taps ⟳ right after an order to choose the next unit must not undo the first) | x 212–266, y 140–194 | new, beside the pill |
| **« ↶ Annuler »** | for 5 s after an order, the state chip (top centre) becomes tappable, min 44 px high, text « ↶ Annuler — MISTRAL 1 · Bloquer » (button `order_undo`) | unchanged slot | new |
| long-press (≥ 350 ms) or swipe up on the verb segment | opens the wheel (`OrderWheelScreen`, unchanged) with the « autre » sector highlighted; releasing on a sector gives it | — | — |
| Radio | unchanged | x 18–72, y 140–194 | — |
| « Avec moi » pill under the mini-map | the existing smart « Suivez-moi » pill renamed, same place (`leftZoneCenter`); **min-height raised from 30 px to 44 px** (`quickActions.ts` touch CSS `.cq .cm-btn{min-height:30px}` today) | unchanged place | « Suivez-moi » |
| « Secours ici » pill | unchanged place, **min-height 44 px** (same rule) | unchanged | — |
| Adjoint banner buttons (« Accepter », « Plus tard ») on touch | min 44 × 44 px | unchanged | — |
| State line | the existing unit chip (top centre, `UnitHud`, slot `top`), text = state line (§3), max 1 line ≤ 360 px; a detached unit's ticket replaces it for 6 s after an order | unchanged slot | chip text |

**Pill text, short form (critique):** 128 px at 15 px bold holds ≈ 14 characters (≈ 12 at scale 0.82). Line 1 is the
verb only, from a fixed list in `words.ts`: « Bloquer la rue », « Face à la foule », « Envoyer », « Interpeller »,
« Avec moi », « Secours ici », « Confier », « Remettre », « Emmener », « Faire venir », « Partir » ; line 2 is
« MISTRAL 1 · 90 m » (11.5 px, ellipsis on the name, never on the distance). Unit test: every short form fits 128 px
at scale 1 and 105 px at 0.82 (measured with the same font metrics table as the HUD tests).

**Accidental taps (critique):** the pill + ⟳ now cover x 82–266 just above the stick, inside `MOVE_ZONE`, where the
left thumb lands to start walking. A tap gives an order only if the touch **started** on the pill, lasted < 600 ms
and moved < 12 px; a touch that moves ≥ 12 px is handed to the joystick (it becomes a stick touch, no order). A second
tap within 0.6 s is ignored. Every pill order can be undone for 5 s (« ↶ Annuler »).

All targets ≥ 44 px at every scale, HUD pills included; nothing is added on the right half; the pill + ⟳ stay left of
x 266 (stick zone is x < 338). The HUD left zone (« Avec moi », « Secours ici », adjoint banner) is placed by
`leftZoneCenter` and is DOM, not a `ControlSpec`: the e2e test checks its real rects against the pill, ⟳, Radio and
the stick base at 844×390 on foot, in a vehicle and in the drone layout (no overlap). The adjoint banner and the
blocking-vehicle banner keep their top-centre place under the chip.

### 1.7 Removed or merged

| Today | After |
|---|---|
| block « ORDRES » with title + 4 lines | 3 lines + « Secours ici » (title gone, two « Suivez-moi » lines merged into the key **A**) |
| wheel 8 sectors, two « Suivez-moi » | 7 sectors (1, 3–8; digit 2 = alias of 1); 1 « Avec moi »; Disperser on 6; Pousser in « Plus… » 9; every other number unchanged |
| phone pills 30 px high | 44 px |
| field orders to the whole company only | orders to the right unit, U to change |
| toast « Ordre donné » 2.5 s | marker + « REÇU » in the state line |
| chip « SANS ORDRE », « MONTE », « DESCEND », « EN FILE » | player's order + phase (§3) |
| player's own order spoken (0.7–9 s late, acknowledgement often before it) | written at once in the subtitles and the journal, acknowledgement spoken first (§2.4) |
| phone round « Ordres » | « Ordre prêt » pill (+ ⟳) at the same place |
| « escorte » with five meanings | Emmener / Confier / Remettre / Accompagner / Protéger (§5.8) |

---

## 2. Order pipeline and latency budget

### 2.1 One pipeline for field and map

```
designation ─▶ naturalOrder()/wheel sector ─▶ Repere at the point ─▶ buildCard(repere, env, intent)
            ─▶ line = card line of that intent ─▶ who = defaultAddressee() or U choice
            ─▶ sendCardLine(env, line, who, repere) ─▶ CommandCore.issue(type, squads, geoms, targetId)
            ─▶ ticket created (synchronous) ─▶ ctx.squads.issue(id, order with byPlayer: true)
```

- Field orders **are** map orders without the map (G): the same card line, the same place name, the same « Qui »
  logic, the same legal checks. `issueDirect(nat, who)` in `ui/command/direct/runtime.ts` builds the `Repere` from the
  designation (`kind` place / person / street) and calls the existing functions.
- **`SquadOrder.byPlayer?: boolean`** (new optional contract field, P1): set to `true` by `CommandCore.issue`,
  `callWithMe`, `onConvoyStage` (replayed order), and the adjoint proposal accepted with P. Every order copy must keep
  it (`maneuver.ts:60`, `mcore.ts:24`, `special.ts:60`, `system.ts` `copyOrder`). Convoy-internal and AI orders never set
  it. This is the only reliable way to tell « the player said so » (§0).
- **Player orders win over non-player orders on descendants** (`system.ts handleOrder`, P3): in the `eachDescendant`
  loop, skip a descendant `d` when `!o.byPlayer && d.squad.order.byPlayer` (same treatment as `playerDetached`). A
  company `debarquer` from the convoy, an AI company order, or a convoy `embarquer` therefore never overwrite a
  section the player ordered. A player order to the company (A « Avec moi », « Toute la compagnie ») still overrides.
- **A player order releases its squads from any convoy** (P3 `ConvoyControl.release(squadId)`, exposed as
  `police.command.release(squadId): boolean`): remove the squad's and its descendants' vehicles from the convoy, stop
  their autopilots, clear `agent.boardId` set by `boardStragglers` for those agents, drop the convoy if empty (stage
  `annule`). `CommandCore.issue` calls it for every addressed squad **before** `ctx.squads.issue`; `follow.onFoot` /
  `follow.column` call it too.
- **Seated units dismount first** (P2, `maneuver.ts startOrder`): for any foot order (every type except `embarquer`,
  `debarquer`, `avec_moi`, `faire_mouvement`, `colonne` issued by a convoy, `suivre` when the followed person is
  aboard), agents of the unit seated in **their own unit's** vehicles (drivers of a vehicle that the order will not
  move excepted) start `startDisembark` for themselves; the maneuver starts with the agents already out; seated agents
  join their slot as they get out (`tree.ts refreshFormable`: a seated agent of a dismounting unit is `formable`,
  not `able`). No visible « débarquer » order.
- **When to drive** (P1 `motorizes(unit, x, z)`, used by `core.ts farFor()`, `intents.ts etaFor()`,
  `bestUnit.travel()` — one rule, so the card and the field never disagree):
  - the unit contains the player and he is not aboard one of its vehicles → **never** (fixes P2 of the diagnosis);
  - ≥ half of its agents seated in its vehicles and d > 150 m → drive (implicit convoy as today);
  - on foot and d > 450 m and it has vehicles → drive;
  - otherwise on foot (trot beyond 15 m).

### 2.2 Latency budget (from the press, units on foot unless said)

| Step | Today (measured) | Target | Mechanism |
|---|---|---|---|
| visible « taken » | toast 2.5 s, chip unchanged | **0.0 s**: marker, state line « REÇU », bip `radio_bip` | ticket created inside `CommandCore.issue` |
| player's phrase | spoken 0.7–9 s later | written at 0.0 s (subtitle + journal), not spoken | `RadioMessage.silent` |
| unit's « REÇU » heard | 0.0–3.6 s, BRAV-M 17 s, often before the order | **≤ 1.0 s** | reply lane (§2.4), `ackAt` 0.3 s for `byPlayer` |
| first agent moving, on foot | 0.5–2.5 s | ≤ 1.5 s | unchanged |
| first agent moving, unit seated in its vans | never | **≤ 2.0 s** | dismount-first, `EXIT_INTERVAL` |
| first agent moving, unit in a convoy waiting for the player | never (300 s) | ≤ 2.0 s | `release` + dismount-first |
| column stop → first order carried out | ~11 min | **≤ 10 s** | per-vehicle unloading |
| line / barrage « en place », 30–40 m | 56–70 s | ≤ 30 s | player timeouts |
| BRAV-M 50 m | never (« accès bloqué » at 77 s) | ≤ 40 s on foot | BRAV-M rules (§4) |

Rule for the robots: every wait that can block a player order is shown in its ticket with a countdown and is ≤ 10 s,
driving time excepted; anything else is a bug.

### 2.3 Waits to remove or shorten (file, constant, new value)

| File | Constant / mechanism | Today | New |
|---|---|---|---|
| `sim/police/maneuver.ts:62,91` | `ackAt` | now + 0.35…0.75 | now + 0.3 when `order.byPlayer` (AI unchanged) |
| `sim/police/tuning.ts` | `FORM_TIMEOUT` | 25 s | 10 s for `byPlayer` orders (new `FORM_TIMEOUT_PLAYER = 10`) |
| `sim/police/tuning.ts` | `REALIGN_TIME` | 2.5 s | 1.5 s for `byPlayer` (`REALIGN_TIME_PLAYER = 1.5`) |
| `sim/police/tuning.ts` | `EXIT_INTERVAL` | 0.6 s per agent | 0.35 s per agent, each vehicle in parallel |
| `sim/police/maneuver.ts` | « en place » threshold | all slots | 70 % of able agents within 3 m of their slot for `byPlayer` |
| `sim/police/system.ts:59` | `PLAYER_RUSH_MIN` | 35 m | 15 m |
| `ui/command/core.ts:26`, `ui/command/intents.ts:103` | `MOTOR_DISTANCE` | 250 m (two copies) | removed; `motorizes()` (150 m seated / 450 m on foot) |
| `sim/police/command/convoy.ts:79` | `BOARD_MAX` | 120 s | 25 s after the player boarded, or as soon as every agent is aboard |
| `convoy.ts:81` | `PLAYER_WAIT` | 300 s for any convoy containing the player | only for convoys started by « Avec moi » in vehicles or the service-day departure; still 300 s there, with the reminder |
| `convoy.ts:87-88` | `PARK_WAIT` / `PARK_WAIT_JOINING` | 300 / 720 s | 30 / 30 s; **per-vehicle unloading**: a vehicle stopped 2 s within 60 m of its line unloads at once; a straggler still joining after 30 s unloads where it is |
| `convoy.ts update()` case `debarquement` | ends on the `debarquer` order's completion (120 s fallback) | ends when no non-driver agent of the company is seated |
| `convoy.ts:407, 992, 1016` | convoy orders `issuedBy: squad.leaderId` | `issuedBy: 0` and no `byPlayer` (they are not the player's orders) |
| `convoy.ts beginDisembark()` | `debarquer` to the company root | `debarquer` to each convoy squad not released (descendants with a `byPlayer` order are skipped by §2.1 anyway) |
| `sim/police/command/command.ts thinkDeploy()` | returns while `convoy.arriving()` | proposes « Mise en place du dispositif » as soon as stage `stationnement` starts |
| `sim/police/command/bravm.ts` | blocked thresholds `bloque > 12 s`, `attente > 40 s`, `rideMax ≥ 240 s` | for `byPlayer`: arrived when lead moto ≤ 30 m, or `bloque > 5 s` / `attente > 8 s` → dismount and walk the rest |
| `bravm.ts:33` | `WATCH_TIME` | 25 s | 8 s when the target has a witnessed offence |
| `gameplay/radio/queue.ts` | reply lane | none | §2.4 |
| `gameplay/incidents/radio.ts:151-178` | CENTRAL « URGENT. Automobiliste bloqué » every ~10 s | at most twice per incident, then journal only |
| `gameplay/session/follow.ts` | `MOTOR_READY_MAX 60` | 60 s kept, but the state line shows « montent dans les fourgons (14/19) » |
| `ui/command/tacticalState.ts` | Entrée guarded 0.6 s after a send | kept; the field `order_go` has the same 0.6 s guard and the phone pill ignores a second tap within 0.6 s |

### 2.4 Radio

- `RadioMessage.silent?: boolean` (P1): shown in the subtitles and the journal at once, not queued, no voice, does
  not occupy the channel. `CommandCore` sends the player's order phrases with `silent: true` (map and field). The
  phrase is shortened: « MISTRAL 1, barrez la rue Saint-Gilles. »
- `RadioMessage.reply?: boolean` (P1): an acknowledgement to a player order. `queue.ts`: a `reply` message goes on
  channel `commandement`, before everything pending, and **pre-empts** a playing message of priority 0–1 (cut with the
  existing static sound, re-queued once). Spoken ≤ 9 words.
- `sim/police/kernel.ts say()` (single place): when the speaking unit's current order is `byPlayer` and was issued
  < 5 s ago and the text is the acknowledgement (`acknowledge(...)` / `negative(...)`), send it with `reply: true` on
  `commandement`. `SpecialUnit.say` (BRAV-M, engines) goes through the same rule (it uses `kernel` / `core.say`; P7
  adds the rule to `sim/police/command/core.ts say()` too — owned by P3, hook described in P3).
- Callsign fix (`ui/command/core.ts callsign()`): when the player speaks to his own unit, `from` is his function
  (« AUTORITÉ » for commandant/commissaire, « CHEF MISTRAL 1 » for a chef de section/groupe), never the addressee's name.
- Completion reports of a `byPlayer` order go to the player's callsign (`sim/police/radio.ts superior()` stops at the
  player), « Avancer » ends « sur le point », the distance said is the order's.
- Reports « Barrage en place », « Tortue formée », « Bond effectué » only when ≥ 50 % of the unit's agents took part
  (P2).

### 2.5 An order given while the units are in a column, unloading, or aboard

| Stage of the addressed unit | What happens | State line / ticket (exact form) |
|---|---|---|
| boarding / departure at the station | released from the convoy (if the order is not « Avec moi »), dismount-first, executes on foot (or `motorizes()` drives it alone) | « MISTRAL 2 · Bloquer · descend des fourgons — prêt dans 4 s » |
| `route`, order point ≤ 150 m from the unit's lead vehicle | released, its vehicles stop, dismount-first, on foot | same |
| `route`, point farther | **queued**: kept in `afterConvoy`, executed at the stop; a new order replaces it | « MISTRAL 2 · Bloquer rue X · à l'arrivée — 1 min 20 » |
| `stationnement` / `debarquement` | released, dismount-first; agents already out move at once | « MISTRAL 2 · Bloquer · descend des fourgons (6/19) — prêt dans 5 s » |
| unit in an implicit convoy started by a player order | a new player order replaces the convoy (release) | |
| BRAV-M mounting / riding | executes (§4) | « FAUCON 1 · Envoyer · remonte sur les motos — 6 s » |
| the player himself is a passenger | orders to other units: as above. Order to his own unit (which contains him): the unit dismounts, he stays seated | « MISTRAL 1 descend — vous êtes à bord : E pour descendre » |

Watchdog (P8, every 0.5 s): a ticket in `route` whose squad centroid or lead vehicle got < 5 m closer in 15 s becomes
`bloque` with the autopilot reason (`obstacle` → « la route est barrée », `personne` → « un piéton bloque le fourgon de
tête »); once per ticket, if within 400 m of the point, the squad is released, dismounts where it is, and the order is
reissued on foot. Line: « MISTRAL 2 · bloqué : la route est barrée — ils finissent à pied ».

---

## 3. State line and default posture

### 3.1 Ticket states (P1 `tickets.ts`, pure reducer from snapshots; P8 runtime)

| State | When | Text (exact) |
|---|---|---|
| `recu` | 0–1 s after issue | « MISTRAL 2 · Bloquer rue de Rivoli · reçu » |
| `attente` | seated agents, convoy, BRAV-M mounting | « MISTRAL 2 · Bloquer · descend des fourgons — prêt dans 5 s » |
| `route` | ≥ 20 % of agents moving towards the point | « MISTRAL 2 · Bloquer rue de Rivoli · en route — 40 m » / « en fourgons — 1 min 10 » |
| `action` | interpellation, refoulement engaged | « BRAV-M · Interpeller · poursuite — 12 m » |
| `en_place` | maneuver done (§2.3 threshold) | « MISTRAL 2 · rue de Rivoli barrée ✓ » (6 s, then the unit's line) |
| `bloque` | watchdog | « MISTRAL 2 · bloqué : la foule barre la route — ils finissent à pied » |
| `refuse` | check or sim refusal | the one-sentence reason (§4.3), 6 s |
| `remplace` | new order to that squad | (removed) |

`reason` and `eta` come from `readiness(snapshot)`: seated agents (`vehicleId !== 0`) → « descend des fourgons »,
eta = max per vehicle of seated × 0.35 + 1 s; convoy `route` → « en fourgons », remaining route / 9 m/s;
`stationnement` → « se garent », min(remaining wait, 10 s); BRAV-M stage `remontee` → « remonte sur les motos », 6 s;
else distance / speed. The HUD, the map order labels (`ui/maps/overlay-units.ts` reads `ticket.verb`, P15) and the tests read the
same ticket.

### 3.2 The unit line (never « sans ordre »)

Format « WHO · WHAT · for whom/where ». For units under the player's command:

| Unit's player order | Line |
|---|---|
| `suivre` on the player, he walks | « AVEC VOUS · vous suivent » |
| `suivre`, he stopped ≥ 3 s, crowd ≤ 120 m | « AVEC VOUS · en ligne face à la foule » |
| `suivre`, he stopped, no crowd | « AVEC VOUS · en garde autour de vous » |
| `avec_moi` boarding / driving | « AVEC VOUS · montent dans les fourgons (14/19) » / « AVEC VOUS · en colonne derrière vous » |
| any other player order | the ticket, then the order tag: « MISTRAL 2 · barre rue de Rivoli » |
| `libre` chosen by the player | « MISTRAL 2 · agissent seuls » |
| finished Interpeller (detainee handed over) / Secours | the unit goes back to its previous player order, or « Avec moi » if there was none: « BRAV-M · revient avec vous » (never left standing at the van or by the wounded) |
| finished Envoyer | stays at the point: « FAUCON 1 · au carrefour Voltaire · attend vos ordres » (a free unit, §1.4) |

The group summary for the commandant / chef de section: « AVEC VOUS · 3 sections + BRAV-M · en ligne face à la
foule »; units not « avec vous » are listed on the « détachés » line. `hud.ts unitChipText` reads the player order
(`CommandCore.playerOrder(squadId)`) plus the phase (`CommandCore.phaseOf(squadId)`: convoy stage, BRAV-M stage,
seated count), never `squad.order` when it is an internal `embarquer` / `debarquer` / `colonne`. `NO_ORDER_TAG`
« SANS ORDRE » is kept only for units the player does not command.

### 3.3 « Tout le monde me suit, c'est obligatoire »

- At the start of every session, every squad in the player's scope that is not pinned by a mission and is not an
  engine foot escort gets `suivre` on the player, **commandant and commissaire included**, sections included (drop the
  `members.length > 1` test), BRAV-M included (once inside the company). `setup.ts:218-224`.
- After a vehicle column ends (`follow.ts endConvoy()`): `debarquer`, then `suivre` (posture « en garde ») through
  `afterConvoy`; never left at `debarquer`.
- « Avec moi » (A) is persistent: while units are `suivre` on the player, when he gets into a vehicle they board their
  own vans and follow (`follow.column`); when he gets out, they dismount and follow on foot. No separate « en
  véhicules » order is needed.
- A finished player order keeps its tag (« tient la rue »); A brings the unit back.

### 3.4 Default posture when he stops (P2, inside `suivre`, the order stays `suivre`)

In `maneuver.ts` / `mcore.ts`, for a unit whose order is `suivre` on the player (on foot):

- the player has moved < 2 m in 3 s → the unit forms a line 8–12 m behind him (each section on its own side:
  left / right / behind, by section index), heading towards the nearest crowd centre within 120 m, else his camera
  heading; the BRAV-M stops 30 m behind, dismounts if a crowd is within 120 m;
- the player moves > 8 m → back to the column;
- these posture changes are not orders: no radio, no ticket, no `order:issued` event, and they never touch a unit
  whose order is not `suivre`.

---

## 4. BRAV-M and special units

### 4.1 BRAV-M

1. **Inside the company:** `BravmOptions.parentId?: number` (`sim/police/api.ts`), used by `units.ts createBravm`;
   `setup.ts:539` passes the company id. It is then in the scope, « Avec moi », the U cycle and « Toute la
   compagnie ». Its motos are excluded from the van column: in « Avec moi » in vehicles they ride 30–60 m behind.
2. **Distance rule** (`bravm.ts begin()`, `avancer` / `colonne` / `repli`): on foot and d < 150 m → walk/run, no
   `backToMotos`; mounted and d < 60 m → dismount on the spot and walk; mounted and d ≥ 60 m → ride; on foot and
   d ≥ 150 m → remount if the motos are within `MOUNT_REACH` (40 m), else walk.
3. **Arrival** (§2.3): for `byPlayer`, arrived at ≤ 30 m or blocked 5 s / waiting 8 s → dismount, walk the rest; no
   « accès bloqué » for a player order. The 20 m push-back of the stop point applies to AI orders only.
4. **Interpeller:** target ≤ 120 m → the nearest binôme runs; > 120 m and mounted → ride to 30 m, then run;
   `WATCH_TIME` 8 s on a witnessed offender; re-target every 1 s.
5. **The player's order stays visible:** `backToMotos()` / `approach()` stop writing internal orders into
   `squad.order` (they keep their stage in `BravmUnit`; `this.internal(...)` writes to the unit's maneuver only);
   `special.ts copy()` keeps `place` and `byPlayer` (known leftover fixed).
6. **Poste « Chef de la BRAV-M »** (`ui/screens/catalog.ts` bravm postes `['chef_bravm', 'passager_moto',
   'pilote_moto']`, rank `brigadier_chef`): `roster.ts` case `'bravm'` makes the player the leader of the BRAV-M created
   by setup (the `BravmUnit`, `setLeader` on its root) instead of the plain group « BRAV-M 1 »; `scope.ts` gives him
   `unite` over it, label « Chef de la BRAV-M — FAUCON 1 ». `journee.ts dispatch()`: the BRAV-M leaves **with him**
   as soon as he is on a moto; the « Ma mission » card says « Montez sur votre moto (E) — la BRAV-M part avec vous »
   with the marker on his moto and its distance. If he is not aboard 20 s after the column left, the BRAV-M goes, but
   **his moto and its pilot stay and wait for him** (marker kept, card « Votre moto vous attend — 12 m »), so he is
   never left alone at the station with nobody to command; Entrée orders to the BRAV-M work all along (§2.5).
   `passager_moto` / `pilote_moto` stay read-only and see the chief's order.
7. `scope.ts` label fix: a chef de section reads « Chef de section — MISTRAL 1 » (not « Chef de groupe »).

### 4.2 What each special unit accepts

Capabilities table (P1 `caps.ts`, pure; used to grey wheel sectors, skip units in the default addressee and write the
refusal):

| Unit | Accepts | Refuses with (exact sentence) |
|---|---|---|
| BRAV-M | all verbs | Bloquer: « La BRAV-M ne tient pas de barrage : envoyez une section. » (it is offered only if nothing else is in scope; then it is allowed) |
| Centaure | Avec moi, Envoyer, Pousser un véhicule, Tenir sa position | Interpeller: « Le Centaure n'interpelle pas : envoyez la BRAV-M ou un groupe. » Disperser: « Le Centaure ne disperse pas : prenez le canon à eau. » |
| Canon à eau | Avec moi, Envoyer, Disperser (`refoulement`), Tenir sa position, Arrêter | Interpeller: « Le canon à eau n'interpelle pas : envoyez la BRAV-M ou un groupe. » Bloquer: « Le canon à eau ne barre pas une rue seul : envoyez une section. » |
| Drone | Avec moi, Envoyer (survol) | others: « Le drone observe seulement : il survole le point. » |
| Cellular van | Avec moi (vient derrière vous), Envoyer (va là), « Partir au commissariat » | others: « C'est un fourgon cellulaire : il transporte les interpellés. » |
| CRS section / group | all | — |

### 4.3 Refusals — one sentence and the way out (toast warn 5 s + the ordre prêt line greyed)

| Case | Text |
|---|---|
| force not authorised, commandant | « Charger : il faut d'abord les 3 sommations (avertissements à la foule) et votre accord. Appuyez encore : je les fais faire et vous donnez votre accord. » (the second press runs the `LegalChain` **and** raises `authorizedForce` for the commandant, who is the authority — no trip to the map's L) |
| force not authorised, others | « Charger demande l'accord du commandant. Demandez-le à la radio (T). » |
| Disperser before the 3 sommations | « Disperser : il faut d'abord les 3 sommations (avertissements à la foule). Appuyez encore : MISTRAL 1 se met en ligne et je les fais faire. » |
| Encercler with < 2 units | « Encercler demande deux unités : vous n'en avez qu'une. Bloquez plutôt la rue. » |
| Interpeller with no offence (wheel) | not refused: card line « Aller constater » (the unit goes 10 m from him, arrests at the first offence); text « Personne n'a rien commis ici : ils surveillent. » |
| no Centaure | « Pas de blindé Centaure avec vous. Bloquez la rue en attendant. » |
| no binôme free (BRAV-M) | « Toute la BRAV-M est déjà sur des interpellations (2 en cours). Envoyez une section. » |
| point too far / not visible | « Trop loin pour viser : Tab, la carte s'ouvre sur ce point. » (the map opens with the same addressee and intent; after « Donner l'ordre » it closes itself) |
| read-only poste | « Votre chef donne les ordres. A : votre binôme avec vous. » |
| patrol crew, verb other than Avec moi / Interpeller / Secours / detainee | « Vous êtes deux : pour barrer ou disperser, demandez des renforts à CENTRAL (Y). » |
| nobody under command | « Personne sous vos ordres ici. » |
| nothing designated (rule i) | « Visez une rue, une personne ou la foule — A : tout le monde avec vous. » (not a toast: the greyed line) |
| **any other refusal** coming from the simulation (`police:order_refused`, `startTask` reason, BRAV-M `onPoliceDone`) | « MISTRAL 2 ne peut pas : <reason in plain words>. U : une autre unité. » — `caps.ts` maps every known reason code to plain words; an unknown code is a test failure, not a silent text |

Every refusal is shown in the state line **and** spoken as « NÉGATIF » with the same sentence (reply lane §2.4); the
order is never acknowledged first and refused later without the line saying so.

---

## 5. Detainees and cellular vans

### 5.1 How many, where, crewed

- `RequestedMeans.cellulaires` and `recommendedMeans` (`ui/screens/scenario.ts`): **max(2, ceil(declared crowd /
  400)), capped at 4** whenever a company is engaged (150 → 2, 600 → 2, 1 500 → 4, 3 000 → 4) — with a single van,
  « always a van » cannot hold while it drives to the station. At least 1 whenever there is a BRAV-M, in every
  special mission with police (including the 18 that have none today: bravm-01…09 except -04, centaure-01/02/03/08,
  drone-01/04/08, école-01/04, canon-01), per extra demonstration (`manifestations.ts`), and in « Déjà sur place ».
- Spawned **crewed**: `createEquipage('fourgon_cellulaire', { parentId: company })`; `createCompany` gets
  `cellular: false` so it no longer makes the crewless van. Callsigns « CELLULAIRE 1 … 4 » (station vans keep
  « CELLULAIRE 75-01 »). Service day: they leave with the column (crew aboard), `cellToRear` no longer leaves one at
  the station.
- **Point de remise**: 60–100 m behind the police line, on the side away from the crowd (`supportSpot` with the
  `rearLane`, fallback `roadSpot`), computed after the unloading; the vans move there (autopilot, no siren) and again
  when the line moves > 80 m.
- Patrol mode: no van with the car; the detainee goes in the car (§5.7). When the crew holds a detainee, the car is
  > 150 m away and no van is within 300 m, a van is requested **automatically** (station stock van; fallback §5.5) and
  the line says « Fourgon cellulaire demandé — 2 min ; ou ramenez-le à la voiture (150 m) ». The CENTRAL card (Y)
  also shows it (no menu needed).
- Wording for a non-expert: the first time a van is shown in a session its label reads « Fourgon cellulaire 1 —
  pour les interpellés »; afterwards « Fourgon cellulaire 1 · 3/8 ». The HUD and the card always say « fourgon
  cellulaire », never « CELLULAIRE » alone (the radio callsign stays « CELLULAIRE 1 »).

### 5.2 Always visible

- World label (marker source `cellulaire` in the marks service, P10) on each van: « CELLULAIRE 1 · 3/8 » (detainees
  only, crew not counted); « COMPLET — part au commissariat »; shown within 150 m, or always while the player walks a
  detainee or has an arrest in progress.
- Maps (`ui/maps/units.ts`): the same label.
- HUD: commandant / chef de section state block line « Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat »
  (shown once there is one arrest); executants: « Ma mission » card (§5.3).

### 5.3 The player arrests someone himself

E three times as today (Interpeller, Menotter, Palpation). **The 4th prompt is already the best way out** (critique:
the old 4th « Emmener » then 5th « Confier » made him walk off before learning he could hand over): the 4th E is the
first applicable of the list below, and « Emmener Christian Lopez » (`interactions.ts` verb `escorter` label) is only
the fallback when none applies. **Within 0.5 s of the palpation** a centre-screen line under the E prompt says what
to do, in plain words: « Interpellé. E : le confier à MISTRAL 2 ALFA (15 m) » / « … E : l'emmener au fourgon
cellulaire 1 (70 m, flèche) » / « … E : faire venir le fourgon cellulaire 1 (300 m) ». The van marker and its
distance appear at the same moment. While he walks the detainee, the top E prompt is, in order:

1. within **12 m** of a cellular van with a free seat: « Remettre Christian Lopez (CELLULAIRE 1) » (3 s).
   `handoverVehicleRange` per kind: `fourgon_cellulaire` 12 m, others 5 m; `Handover.find` ranks any cellular van in
   range before any other vehicle;
2. a free agent pair of a unit under his command or of his own group within 60 m: **« Confier Christian Lopez à
   MISTRAL 2 ALFA »** (1 s): the pair walks to him (5–15 s) and takes the detainee; the player is free at once (the
   detainee stands cuffed, held, until the pair arrives). The pair runs `ops-arrest` stage « escorte » (new entry
   `startEscort`, §5.4);
3. otherwise « Remettre … (Fourgon de CRS) » within 5 m of another police vehicle;
4. no pair, no vehicle within 5 m, nearest van > 100 m: « Faire venir le fourgon cellulaire 1 » (the van drives to him,
   `police.command.arrive(van, {x,z}, {disembark:false, urgence:false})`; he keeps the detainee; line « Fourgon
   cellulaire 1 vient vous chercher — 40 s »);
5. « Faire asseoir Christian Lopez » only after these (today it is first and abandons the detainee on the 5th E).

Entrée shows and does the same as the top prompt (rule a, §1.3). The « Ma mission » card gets a `custody` source
ranked first (`executant.ts`): « Emmenez l'interpellé au CELLULAIRE 1 — 140 m » with the objective marker on the van
(`nearestDrop(actor)` in `handover.ts`: the same loop without the 5 m limit, vans first, full or empty). The commandant
(no card) gets the same text as his ordre prêt line. Getting into a vehicle while walking a detainee: the detainee is
confided to the nearest pair automatically (or put in that vehicle if it is a van), message « Interpellé confié à
MISTRAL 2 ALFA ».

### 5.4 Arrests by units and the colleagues' escort

- `sim/police/ops-arrest.ts`:
  - `findHandover` considers **every cellular van of the dispositif** (`police.units` list, kind
    `fourgon_cellulaire`, faction police, free passenger seat), with the 400 m limit measured from the van, vans first
    (60 m bonus kept); then other vehicles of the unit's tree; then `law.handover` points.
  - When the nearest van is > 80 m from the detainee: the van is sent to a point 20 m behind the line nearest the
    arrest (`police.command.arrive(vanSquadId, {disembark:false, urgence:false})`); the pair walks towards wherever the
    van is; this also answers « demande un véhicule pour la remise » (no more unanswered request).
  - New `startEscort(k, owner, target)`: creates an arrest op at stage « escorte » for a target already `cuffed`
    (the player's « Confier »); exposed by a new service `police.arrests` (`sim/police/arrest-service.ts`):
    `takeOver(targetId: number, byPlayer: number): { ok: boolean; reason: string; squadName: string }`.
  - BRAV-M `ensureHandover` (invisible pavement point) is replaced by the same rule: the van comes; meanwhile the
    binôme keeps the detainee seated by the motos with a marker « Interpellé en attente du fourgon ».
  - **Nobody is left alone (diag-interpelles P6, forgotten):** every detainee in `Custody.parked` (BRAV-M point, a
    pair called away, a player who got into a vehicle) is collected: the nearest van with a free seat drives to him
    and the nearest free pair puts him in. A parked detainee is never older than 120 s in any robot.
- The radio: « Un interpellé conduit au CELLULAIRE 1 » (not « point de regroupement »); at the van « UN interpellé à bord
  du CELLULAIRE 1, en attente de transfert » (not « pour présentation à l'officier de police judiciaire »).

### 5.5 The trip to the station and the replacement van

New `src/gameplay/transfer/` (`TransferSystem`, a GameSystem, module `transfer`):

- **Departure** of a van: 8 detainees (full); or ≥ 1 detainee, 6 min since the first and 2 min without a new one; or
  the player's order (U to the van, Entrée « Partir au commissariat », or the van's card on the map).
  **A van never leaves the site empty of vans** (critique — « un fourgon toujours disponible »): an automatic
  departure waits until another van with ≥ 2 free seats is on site or the replacement is < 60 s away (it waits at
  most 3 min, then goes; the line says « Fourgon cellulaire 1 complet — part dès que le 2 arrive (40 s) »). A player
  order to leave is obeyed at once, with the line « Plus de fourgon sur place pendant 2 min ».
- **With the stations feature** (`ctx.service('police.commissariats')` present, `enabled`): `api.recall(vanSquadId)`
  gives the destination; drive with `police.command.arrive(vanSquadId, { x, z, heading, layout:'file',
  boardFirst:false, disembark:false, urgence:false })`. Before departure the system stores the detainee ids aboard;
  on `commissariat:returned` for that squad it calls `Records.markDelivered(ids, stationName)`. Fix in the stations
  tree: `engage.ts unitVehicles()` includes `extraVehicles` (diag-interpelles P12).
- **Without the stations feature** (or `recall` returns null): the van drives to a road point ≥ 600 m from the crowd
  along its arrival route; when it is there (or after 120 s), the detainees are removed (`vehicles.exit` +
  `people.remove`), recorded « transférés au commissariat », and the van drives back to the point de remise.
- **Replacement, always one van on site:** when a van departs and no other on-site van has ≥ 2 free seats, at the
  same moment: another van of the dispositif moves to the point de remise; else, with stations, the nearest station
  with a free `cellulaire` stock entry is engaged (`api.engage(entryId)`) and sent to the point de remise (parented to
  the company so AI arrests use it); else (fallback) a crewed van is created with `createEquipage('fourgon_cellulaire',
  { parentId: company })` on a road ≥ 400 m away on the company's approach and drives in. Radio and line:
  « CELLULAIRE 1 part au commissariat du 3e avec 8 interpellés. CELLULAIRE 2 prend la remise dans 2 min. »
- A van that came back is available again at the point de remise.

### 5.6 Counts

- Records (`gameplay/law/records.ts`): statuses split: at the vehicle `remis_vehicule` (custody `in_vehicle`); at the
  station `depose` (`markDelivered`). `Records.stats` adds `inVan`, `atStation`.
- Debrief (`ui/screens/debrief.ts`): « Interpellés : 9 — 8 déposés au commissariat du 3e, 1 dans le CELLULAIRE 2 »;
  « remis à l'officier de police judiciaire » is said only for `depose`.
- Map and HUD as §5.2.

### 5.7 Patrol mode

The detainee goes in the back of the car as today; the car's « Ma mission » card then says « Conduisez l'interpellé
au commissariat du 3e — 1,2 km » with the station as objective; on arrival the same delivery (`markDelivered`).

### 5.8 One meaning per word (« escorte »)

| Thing | Word everywhere (UI, radio, card) |
|---|---|
| the player walks a detainee | « Emmener » (« Emmener X », « Emmenez l'interpellé au CELLULAIRE 1 ») |
| giving him to colleagues | « Confier » |
| putting him in a vehicle | « Remettre » |
| colleagues walking a detainee | radio « Un interpellé conduit au CELLULAIRE 1 » |
| order `escorter` (map « Plus… ») | « Accompagner une unité » (tag « ACCOMPAGNE ») |
| foot group around an engine (`attachEscort`, `proteger`) | « Protège le Centaure » / « Protège le canon à eau » (radio « je protège le canon à eau » instead of « l'élément désigné »; chip « PROTÈGE LE CANON ») |
| units riding with the player | « avec vous » |
| missions (« Escorter la délégation », « Escorte incendie », « Escorte vers le métro ») | unchanged (mission vocabulary) |

---

## 6. Arrival at a demonstration (G5)

**Guarantee:** at every stage (station boarding, `route`, `stationnement`, `debarquement`, on foot), Entrée / F / A are
accepted and either carried out within 2 s of first movement, or the ticket says in one line what the unit is
finishing and when (§2.5). No player order is ever acknowledged and then silently dropped; no report claims an action
done by fewer than half the unit.

Fixes this rests on (all from the diagnosis, specified in §2–§4):

| Defect | Fix | Package |
|---|---|---|
| P1 seated units ignore orders, radio claims success | dismount-first, honest reports | P2 |
| P2 map order to the player's own unit boards it and waits for him forever | `motorizes()` never boards a unit containing the player unless he is aboard; `release`; `PLAYER_WAIT` only for « Avec moi » in vehicles / service-day departure | P1, P3, P8 |
| P3 the column sits up to 9 min | per-vehicle unloading, park caps 30 s, `BOARD_MAX` 25 s | P3 |
| P4 end of parking overwrites the player's orders | `byPlayer` + handleOrder rule + per-squad `debarquer` | P1, P3 |
| P5 adjoint silent for 2 min | `thinkDeploy` at the stop; `debarquement` ends when nobody is seated | P3 |
| P6 AI commander orders the chef de section's groups | `buildElements()` skips any squad led by the player or under one (`core.isUnder`) | P3 |
| P7 card proposes orders that cannot work | Encercler hidden with < 2 units; Interpeller without offence → « Aller constater »; wheel to the addressee, not the root | P1, P9 |
| P8 BRAV-M chief waits forever / BRAV-M stalls | §4.1 | P4, P5 |
| terrain 1: « DESCEND » forever after a column | `endConvoy` → `suivre` | P6 |
| terrain 2: BRAV-M not orderable from the field | `parentId`, U cycle | P5, P8, P9 |
| terrain 3/4: chef de section's section and commandant's company don't follow at start | initial `suivre` for all | P5 |
| known leftover: water cannon at the head stays « bloqué mur » (Concorde 21) | being fixed by another agent (`convoy.thinkRoute` detaches only i ≥ 1); the watchdog is the safety net | other agent, then P3 rebases |

---

## 7. Walk-throughs (presses / taps, seconds), laptop and phone, compared with today

### 7.1 He arrives by column and wants his section to block the street he is looking at
Chef de section, service day, Bastille (commandant: same, addressee « MISTRAL 1 (la plus proche) »).

| t (s) | Laptop | Phone | Screen |
|---|---|---|---|
| 0 | column stops 85–125 m from the rally point | same | line « AVEC VOUS · descendent des fourgons (3/19) — prêts dans ~8 s » |
| 2 | vans stopped within 60 m start unloading | | |
| 3 | **E** « Descendre » (1) | **tap** « Sortir » (1) | |
| 4–6 | ← → / trackpad towards rue Saint-Gilles | thumb drag | marker on the street mouth « Bloquer »; line « Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m » / pill « Bloquer la rue · MISTRAL 1 » |
| 6.0 | **Entrée** (2) | **tap** the pill (2) | marker « MISTRAL 1 — Bloquer », line « MISTRAL 1 · Bloquer rue Saint-Gilles · reçu » |
| 6.3–6.9 | | | voice « MISTRAL 1, reçu, je barre la rue Saint-Gilles. » |
| 6–9 | | | if agents still seated: « descend des fourgons — prêt dans 3 s » |
| ≤ 8 | | | first agents trotting |
| ≈ 40 | | | line formed across the full width (70 %, 10 s timeout) |
| ≈ 45 | | | « MISTRAL 1 · rue Saint-Gilles barrée ✓ » |

**New: 2 presses / 2 taps, ack 0.3–0.9 s, movement ≤ 2 s, in place ≈ 40 s after the order.** Today: column seated 20–551
s, then F 4 moves the whole unit as a block if it is unloaded (56–70 s), or the map card boards the section which stays
18/18 seated (R4): 4–6 presses + navigation, 2–11 min, often never.

### 7.2 A rioter throws a projectile: arrest him and take him away
Commandant, free mode, Concorde.

| t (s) | Laptop | Phone | Screen |
|---|---|---|---|
| 0 | throw, offence witnessed | | red chevron « Lanceur de projectile » over him as soon as he is within 4° |
| 0.5–1.5 | turn roughly towards him | drag roughly, or **tap him** | line « Entrée  Interpeller le lanceur de projectile · BRAV-M · 35 m » |
| 1.5 | **Entrée** (1) | **tap** pill (1, or 2 with the tap on him) | marker follows him « BRAV-M — Interpeller » |
| 2.3 | | | voice « BRAV-M, reçu, interpellation. » |
| 3 | | | « BRAV-M · Interpeller · poursuite — 30 m » |
| 15–25 | | | caught: « BRAV-M · interpellé ✓ — vers CELLULAIRE 1 (70 m) » |
| ≈ 55 | | | « CELLULAIRE 1 · 4/8 »; radio « UN interpellé à bord du CELLULAIRE 1, en attente de transfert. » |
| later | | | « CELLULAIRE 1 part au commissariat du 1er avec 8 interpellés. CELLULAIRE 2 prend la remise dans 2 min. » |

**New: 1 press / 1–2 taps, ack 0.8 s, caught ≈ 20 s, in the van ≈ 1 min, then the station.** Himself: E ×3 (≈ 8 s),
the line « Interpellé. E : le confier à MISTRAL 2 ALFA (15 m) » appears at once, then the 4th **E « Confier … »** =
4 presses, free at ≈ 9 s (no pair near: 4th E « Faire venir le fourgon cellulaire 1 », the van comes to him). Today: F 5 with the person exactly under the
1.1° crosshair, addressed to 87 agents; BRAV-M only through the map (Tab, I, U, Entrée, Tab) with an ack at 17 s and no
arrest in 180 s; doing it himself: 225 m unguided, the 5th E sits the detainee down; the van never leaves.

### 7.3 He wants the BRAV-M to go to a crossroads 400 m away
Commandant on foot.

| t (s) | Laptop | Phone | Screen |
|---|---|---|---|
| 0–2 | looks down the boulevard (level pitch) | same | far ray snaps to « carrefour Voltaire »: line « Entrée  Envoyer : carrefour Voltaire · MISTRAL 3 · 400 m » |
| 2.5 | **U** (1) — the BRAV-M is first in the cycle | **tap ⟳** (1) | « Entrée  Envoyer : carrefour Voltaire · BRAV-M · 400 m » |
| 3.5 | **Entrée** (2) | **tap** pill (2) | marker at the crossroads « BRAV-M — Envoyer » (edge arrow if off-screen) |
| 4.3 | | | voice « BRAV-M, reçu, en selle vers le carrefour Voltaire. » |
| 4–10 | | | « FAUCON 1 · Envoyer · remonte sur les motos — 6 s » |
| 10–50 | | | « en selle — 40 s »; crowd ahead blocks 5 s → they dismount and walk |
| ≈ 50 | | | « FAUCON 1 · au carrefour Voltaire ✓ » |

**New: 2 presses / 2 taps, ack 0.8 s, wheels rolling ≈ 6 s, there ≈ 50 s.** Not visible: « Trop loin pour viser : Tab,
la carte s'ouvre sur ce point » → Tab (BRAV-M preselected, Envoyer active), arrows to the crossroads, Entrée (map closes
itself) = 4 presses + pointing. Today: field impossible; map ≈ 6 keys + navigation, ack 17 s, « accès bloqué »
(T4/J1), never arrives.

| Wish | Today | New laptop | New phone |
|---|---|---|---|
| block the street after the column stops | 4–6 presses + navigation, 2–11 min or never | 2 presses, ≈ 45 s | 2 taps, ≈ 45 s |
| arrest a thrower (unit) | 2 + precise aim or map 4+, minutes, never to a station | 1 press, ≈ 1 min to the van | 1–2 taps |
| arrest himself and get rid of him | 4 + unguided walk, risk of sitting him down | 4 presses, free at 9 s | 4 taps |
| BRAV-M to a crossroads 400 m | map 6+, never arrives | 2 presses, ≈ 50 s | 2 taps |
| push the crowd back (sommations done) | map only | Maj+Entrée (1) | long-press pill, release (1 gesture) |
| call everyone back | F, 1 (2) | A (1) | « Avec moi » pill (1) |

### 7.4 Keyboard only, level camera, the street just in front (critique)
Chef de section on foot, arrows only, never touches pitch. He turns (←) towards the side street 30 m ahead: the
designation snaps to the nearest candidate (§1.5) « rue Saint-Gilles · 30 m », not the 80 m cap nor 400 m. Entrée (1).
If he wanted the crossroads beyond: fn + ↑ once steps to « carrefour Voltaire · 400 m ». Robot: `ui-command.designation`
asserts that a level aim along five boulevards picks the nearest street mouth within 15–60 m.

### 7.5 The detachment he does not want to lose (critique)
Commandant: MISTRAL 1 holds rue Saint-Gilles, MISTRAL 2 is « avec vous ». He looks past MISTRAL 1's line at the
crowd and presses Entrée: rule e does not fire (no cone for policemen), rule f gives « Bloquer ici, face à la foule ·
MISTRAL 2 » (MISTRAL 1 is not free, §1.4). He looks at the sky and presses Entrée by mistake: nothing happens, the line
says « Visez une rue, une personne ou la foule ». He brushes A while strafing: everyone comes back, the line shows
« ⌫ annuler »; ⌫ (1) puts MISTRAL 1 back on its street.

---

## 8. Work packages

Ownership rule: a file belongs to exactly one package. When another package needs a change in it, the owner makes it
(the « hook » column says what). Packages that own `ui/command/core.ts`, `sim/police/command/convoy.ts`,
`gameplay/law/handover.ts`, `gameplay/session/setup.ts` or `gameplay/patrols/*` start **after** the stations merge and
the water-cannon fix land (both touch them). Each package: one agent, a few hours; never run the whole suite — run the
listed tests and the `relatedTests` prefixes it touches.

### P1 — Logique d'ordre pure et contrats (first; everything builds on it)
- **Files (owned):** `src/core/contracts.ts` (only: `Button` += `'order_go' | 'order_who' | 'order_undo' | 'with_me'`;
  `SquadOrder.byPlayer?: boolean`; `RadioMessage.silent?: boolean`, `RadioMessage.reply?: boolean`); NEW
  `src/ui/command/direct/{index.ts, words.ts, natural.ts, who.ts, caps.ts, travel.ts, tickets.ts, state.ts}`;
  `src/ui/command/intents.ts`, `src/ui/command/bestUnit.ts`.
- **Content:** `words.ts` (the 7 sectors with their kept numbers, the « Plus… » ring, the pill short forms, every
  exact string of §1–§5, shared with the map
  intentions); `natural.ts naturalOrder(env, designation)` (§1.3, deterministic); `who.ts defaultAddressee`,
  `cycle(env, current, step)` (§1.4); `caps.ts accepts(unitKind, verb)` + refusal sentences (§4.2–4.3);
  `travel.ts motorizes(unit, x, z, playerAboard)` (§2.1), and `intents.ts etaFor` / `bestUnit.travel` use it
  (`MOTOR_DISTANCE` removed from intents.ts); `tickets.ts` pure reducer (`next(ticket, snapshot, now)`, §3.1) and
  `readiness()`; `state.ts unitLine(snapshot)` (§3.2). Card fixes P7: `intentCandidates` hides « Encercler » with < 2
  units in scope; `interpeller` with no offence defaults to « Aller constater ».
- **dependsOn:** none.
- **Tests:** NEW `tests/unit/ui-command.direct-logique.test.ts` (table-driven: each rule of §1.3 on the real map —
  Concorde seed 21 offender, street, crowd, nothing, 400 m boulevard; each poste's default addressee; U cycle order;
  `motorizes` cases incl. the player's own unit); NEW `tests/unit/ui-command.direct-tickets.test.ts` (every state and
  exact text from synthetic snapshots). Keep `ui-command.*`, `input.bindings` green (new Buttons must not collide).
- **Done:** pure (no DOM, no ctx writes); strings exactly as in this spec; `tsc` clean; the two new tests and
  `tests/unit/ui-command.` prefix green.

### P2 — Simulation : à bord ils descendent puis exécutent ; rapports honnêtes ; posture « en garde »
- **Files:** `src/sim/police/maneuver.ts`, `src/sim/police/tree.ts`, `src/sim/police/mcore.ts`,
  `src/sim/police/tuning.ts`, `src/sim/police/brain.ts`, `src/sim/police/formation.ts` (only if the halt line needs it).
- **Content:** dismount-first (§2.1) including `refreshFormable` for dismounting agents; `byPlayer` copied in
  `copyOrder`/`mcore` copies; `ackAt` 0.3 s, `FORM_TIMEOUT_PLAYER` 10, `REALIGN_TIME_PLAYER` 1.5, `EXIT_INTERVAL` 0.35
  per vehicle in parallel, 70 % « en place » for `byPlayer`; reports only at ≥ 50 % participation; « en garde »
  posture inside `suivre` (§3.4).
- **dependsOn:** P1 (contract field only).
- **Tests:** NEW `tests/unit/police.ordre-a-bord.test.ts` (unit 84/87 seated → `ligne`, `tenir`, `tortue`,
  `couper_circulation`: first agent out ≤ 2 s, all out ≤ 8 s, maneuver done; no « Tortue formée » with 1 agent);
  NEW `tests/unit/police.suivre-en-garde.test.ts` (player stops 3 s near a crowd → line facing the crowd within 10 s,
  order still `suivre`, no radio; moves 10 m → column). Keep `police.`, `integration.suivre`, `integration.avec-moi`,
  `playtest.commandant-terrain` green.
- **Done:** R5 sequence of diag-arrivee (« Suivez-moi en véhicules » then Ligne…Tortue) moves agents; tests green.

### P3 — Simulation : ordres du joueur prioritaires, convoi libérable, arrivée en secondes
- **Files:** `src/sim/police/system.ts`, `src/sim/police/command/convoy.ts`, `src/sim/police/command/command.ts`,
  `src/sim/police/command/system.ts`, `src/sim/police/command/api.ts`, `src/sim/police/command/core.ts`.
- **Content:** handleOrder rule (§2.1); `PLAYER_RUSH_MIN` 15; `ConvoyControl.release(squadId)` + service method
  `police.command.release`; convoy orders `issuedBy: 0`; per-squad `debarquer`; per-vehicle unloading, `PARK_WAIT*` 30,
  `BOARD_MAX` rule, `PLAYER_WAIT` restricted, `debarquement` end on seated count; `thinkDeploy` at the stop;
  `buildElements` skip (P6). Hook for others: in `command/core.ts say()` apply the reply rule of §2.4 (same rule as
  P7's `kernel.say`, P7 supplies the helper `replyFlag(order, now)` in `sim/police/radio.ts`). (Correction: the
  `police.arrests` registration is no longer a conditional import here — a module that does not exist yet cannot be
  imported; P13 lands after P3 and adds its one registration line in `PoliceSystem.init` itself, the only sequential
  exception to the ownership rule.)
- **dependsOn:** P1, P7 (`replyFlag`); after the water-cannon fix of the other agent and the stations merge.
- **Tests:** NEW `tests/unit/police.convoi-ordre-joueur.test.ts` (R3/R4/M2 of diag-arrivee: chef de groupe orders his
  own group while on foot → no boarding, no wait; order during `stationnement` → executed, never overwritten by
  `debarquer`; column stop → first order executed ≤ 10 s; commandant service day R1: stop → all agents out ≤ 40 s;
  adjoint proposal ≤ 5 s after the stop); extend `police-command.convoi`. Keep `police.convoi-`, `police-command.`,
  `convoy.`, `integration.colonnes`, `integration.journee`, `playtest.colonne-` green.
- **Done:** robots R1–R9, M1–M3 of `sonde-arrivee.test.ts.txt` re-run: no order accepted with 0 agents moving 10 s
  later; times in §2.2.

### P4 — BRAV-M qui obéit et poste « Chef de la BRAV-M »
- **Files:** `src/sim/police/command/bravm.ts`, `src/sim/police/command/special.ts`, `src/ui/screens/catalog.ts`,
  `src/gameplay/session/roster.ts`, `src/ui/command/scope.ts`.
- **Content:** §4.1 points 2–7 (distance rule, arrival for `byPlayer`, interpeller, no internal order in
  `squad.order`, `copy()` keeps `place`/`byPlayer`, chief poste, label fix « Chef de section — … »); patrol chef de
  bord: scope level `equipage` over his two colleagues (Avec moi, Interpeller, Secours, detainee orders; §1.4, §4.3)
  instead of plain read-only. The waiting moto of §4.1.6 is in `journee.ts` (P6); its card text is a P15 hook.
- **dependsOn:** P1, P5 (`parentId`).
- **Tests:** NEW `tests/unit/bravm.ordres-joueur.test.ts` (T4 50 m on foot ≤ 40 s; J1 mounted 30 m → dismount and walk;
  400 m ride arrives or dismounts when blocked; T5 interpeller 125 m → arrested ≤ 60 s; `squad.order.type` stays the
  player's order); extend `playtest.bravm-passager` with `chef_bravm`. Keep `bravm.`, `session.bravm-concorde`,
  `integration.colonnes-bravm`, `integration.journee.bravm`, `playtest.missions-police` (bravm missions) green.
- **Done:** tests green; the chief's service day leaves within 20 s of the column.

### P5 — Mise en place : tout le monde me suit, BRAV-M dans la compagnie, fourgons cellulaires
- **Files:** `src/gameplay/session/setup.ts`, `src/gameplay/session/placement.ts`, `src/sim/police/units.ts`,
  `src/sim/police/api.ts`, `src/ui/screens/scenario.ts`, `src/gameplay/session/manifestations.ts`, mission means where
  vans are missing (`src/gameplay/missions/catalog/**` only the means entries).
- **Content:** §3.3 initial `suivre`; `BravmOptions.parentId`, `createBravm` uses it, `setup.ts:539` passes it;
  `cellulaires` means and crewed vans (§5.1), `createCompany({ cellular:false })`, point de remise and its update hook
  (`setup` exposes `session.remise` service: `{ point(): {x,z,heading} | null }` read by P13/P14).
- **dependsOn:** P1.
- **Tests:** NEW `tests/unit/session.cellulaires.test.ts` (census of diag-interpelles: 150/600/3000 → 2/2/4 crewed vans with a company (1 in BRAV-M-only missions)
  60–100 m behind the line; every mission with police has ≥ 1); NEW `tests/unit/session.tous-me-suivent.test.ts`
  (commandant, chef de section, chef de groupe, chef BRAV-M: every squad in scope `suivre` at t = 3 s; BRAV-M parent =
  company). Keep `session.`, `integration.moyens`, `integration.session`, `playtest.modes`, `playtest.missions-`,
  `playtest.apparition-roles` green.
- **Done:** tests green; no chip reads « SANS ORDRE » for a unit in scope at start.

### P6 — Suivre et colonnes du joueur, journée de service
- **Files:** `src/gameplay/session/follow.ts`, `src/gameplay/session/journee.ts`.
- **Content:** `endConvoy` → `debarquer` then `suivre` (§3.3); persistent « Avec moi » (board when he boards, dismount
  when he gets out); call `police.command.release` in `onFoot`/`column`; BRAV-M motos outside the van column;
  journée: vans leave with the column, the BRAV-M leaves with its chief or after 20 s leaving his moto and pilot to
  wait for him (§4.1.6), stage info exposed for the state line (`session.journee` already exposes stage; add
  `readyIn()` seconds).
- **dependsOn:** P2, P3, P5 (BRAV-M `parentId`, crewed vans in the column).
- **Tests:** extend `tests/unit/integration.suivre-colonne.test.ts` and `integration.avec-moi`; NEW
  `tests/unit/integration.fin-de-colonne.test.ts` (J1: after the stop every squad is `suivre` within 15 s, chip
  « AVEC VOUS »). Keep `integration.suivre`, `playtest.colonne-joueur`, `integration.journee` green.
- **Done:** J1 of diag-terrain: no squad left at `debarquer` 20 s after the stop.

### P7 — Radio : accusé ≤ 1 s, jamais avant l'ordre
- **Files:** `src/gameplay/radio/queue.ts`, `src/gameplay/radio/index.ts`, `src/sim/police/kernel.ts`,
  `src/sim/police/radio.ts`, `src/gameplay/incidents/radio.ts`, `src/gameplay/radio/phrases/c-manoeuvres-incidents.ts`.
- **Content:** `silent` and `reply` handling (§2.4); `kernel.say` reply rule and the helper `replyFlag` for P3;
  `superior()` stops at the player; ack distance = order distance; « sur le point » for avancer; CENTRAL repeat cap;
  escort wording (§5.4, §5.8 radio lines).
- **dependsOn:** P1.
- **Tests:** extend `tests/unit/radio.queue.test.ts` (reply pre-empts priority 1, never before the subtitle, ≤ 1 s with
  CENTRAL saturating); `radio.joueur-prioritaire` updated for `silent`. Keep `radio.`, `police.compte-rendu-destinataire`
  green.
- **Done:** in `playtest.commandant-terrain`, every player order's ack is spoken ≤ 1.0 s after the press.

### P8 — Émission des ordres et tickets (noyau du terrain)
- **Files:** `src/ui/command/core.ts`, `src/ui/command/sendLine.ts`, NEW `src/ui/command/direct/runtime.ts`,
  `src/ui/command/index.ts`.
- **Content:** `byPlayer: true` on every player order (incl. `onConvoyStage` and accepted proposals); `release` call;
  silent player phrases; `callsign()` fix; `playerOrder(squadId)`, `phaseOf(squadId)`, previous-order history for ⌫;
  `issueDirect(natural, who)` through `buildCard`/`sendCardLine`; service `command.direct` (designation in, ordre prêt
  out, current addressee, tickets list, `give()`, `cycle(step)`, `undo()`), ticket runtime and watchdog (§2.5); uses
  P1's `motorizes` in `farFor`; « Trop loin » → `tacticalScreen.openAt` (hook owned by P10).
  The runtime keeps the **displayed** `NaturalOrder` and gives exactly that one (§1.3 stability); `give('autre')` for
  Maj+Entrée; one-shot manual addressee (§1.4). Detainee and van orders (rules a, b) call services owned elsewhere,
  looked up at call time (`ctx.service('law.custody')`, `police.arrests` (P13), `transfer` (P14)); when a service is
  missing the rule is not offered (never a silent no-op).
- **dependsOn:** P1 (P3's `release`, P7's flags, P12/P13/P14 services are used when present, service lookups).
- **Tests:** NEW `tests/unit/ui-command.direct-runtime.test.ts` (real map, stubbed sim responses where P2/P3 are not
  landed: ticket created synchronously on `give()`, displayed order = given order, one-shot addressee, ⌫ restores the
  previous order, the 0.6 s guard, watchdog transitions). Keep `ui-command.`, `playtest.commandant-`,
  `playtest.commande`, `playtest.ordres-clairs` green.
- **Done:** the runtime test green; the end-to-end robot is P16 (it needs P2, P3, P7 to pass, so it cannot be P8's
  own done-criterion).

### P9 — Clavier et roue : Entrée, A, U, ⌫, désignation
- **Files:** `src/input/bindings.ts`, `src/input/buttons.ts`, `src/input/labels.ts`, `src/ui/core/kit.ts`,
  `src/ui/command/orderWheel.ts`, `src/ui/command/wheelKeys.ts`, NEW `src/ui/command/direct/designate.ts`, NEW
  `src/ui/command/direct/fieldKeys.ts`.
- **Content:** bindings `order_go: ['Enter','NumpadEnter']`, `with_me: ['KeyQ']`, `order_who: ['KeyU']`,
  `order_undo: ['Backspace']`, context `commun`, names of §1.1, ignored while a screen is open or a text field is
  focused, on key repeat, and for 0.6 s after a screen closed; Maj+Entrée read with the Shift modifier; wheel of §1.2
  (numbers kept, digit 2 alias, Disperser 6, « Plus… » 1–8 unchanged + 9) addressed to `command.direct` addressee;
  second press on locked sector; remove the success toast; `designate.ts` (§1.5: cone for non-police only,
  stickiness, candidates along the ray nearest first, far ray at 4 Hz).
- **dependsOn:** P1, P8.
- **Tests:** extend `tests/unit/input.bindings.test.ts` (no conflict with `DEFAULT_KBM`, `RESERVED_KBM` O/P/Y, the
  map keys of `tacticalKeys.ts`; Enter still `ui_accept` in menus); NEW `tests/unit/ui-command.designation.test.ts`
  (sweeps aims over the five demonstration places and logs/asserts `kind`; level aim picks the nearest street mouth
  15–60 m; one pitch step reaches the next candidate; far ray snaps on Bd Beaumarchais; a policeman in the cone never
  becomes the designation); NEW `tests/unit/ui-command.wheel-numeros.test.ts` (every old « F puis N » / « F puis 8
  puis N » maps to the same order type or to Avec moi, never to charge / gaz / refoulement unless it already did). E2E NEW `tests/e2e/ordre-direct-clavier.mjs` (1280×800, keyboard only:
  Entrée, A, U, ⌫, F 1…7; screenshots in the scratchpad). Keep `input.`, `ui-command.clavier`, e2e
  `verif-commande-clavier.mjs`, `verif-hud-ordres.mjs` (updated) green.
- **Done:** a keyboard-only player performs §7.1–7.3 in the browser.

### P10 — HUD : bloc d'ordres, ligne d'état, repères, carte partagée
- **Files:** `src/ui/command/quickActions.ts`, `src/ui/command/hud.ts`, `src/ui/hud/markers.ts`,
  `src/ui/command/tacticalState.ts`, `src/ui/command/tacticalScreen.ts`, `src/ui/command/tacticalKeys.ts`.
- **Content:** laptop block of §1.6 (with the « autre » line and « ⌫ annuler »); state line (§3.2) in the chip, which
  is tappable « ↶ Annuler » for 5 s on touch; touch CSS: every HUD pill and banner button min 44 px (today 30 px);
  marker sources `designation`, `ordres`, and a marks service `hud.marks` (`set(id, {x,z,personId,label,kind})`,
  `remove(id)`) used by P15 for van labels; shared « Qui » selection with the map, and the map's U uses
  `who.cycle` (P1); `openAt(x, z, squadId, intent)` and close-after-send when opened from the field.
- **dependsOn:** P1, P8, P9.
- **Tests:** extend `tests/unit/ui.hud-zone-gauche.test.ts`, `hud.ordre-du-chef`; E2E update
  `tests/e2e/verif-hud-ordres.mjs` (new block), `verif-actions-rapides.mjs`. Keep `ui.`, `maps.etiquettes-ordres`
  green.
- **Done:** no « SANS ORDRE » / « MONTE » / « DESCEND » for a unit under command in any robot; screenshots.

### P11 — Téléphone
- **Files:** `src/input/touch/layouts.ts`, `src/input/touch/overlay.ts`, `src/input/touch/controller.ts`,
  `src/input/touch/style.ts`, `src/ui/hud/layout.ts`.
- **Content:** §1.6 phone table (pill + ⟳ in `commsRow`, the overlay itself reads `command.direct` every 0.25 s and
  calls `setOrderLabel` with the short form — nobody else feeds it; long-press / swipe-up to the wheel with the
  « autre » sector highlighted; 0.6 s double-tap guard; accidental-tap rule (started on the pill, < 600 ms, < 12 px,
  else handed to the joystick); ⟳ always « À qui »; tap-on-world designation thresholds 220 ms / 12 px),
  « Suivez-moi » pill renamed « Avec moi ».
- **dependsOn:** P9, P10.
- **Tests:** extend `tests/unit/input.touch-layout.test.ts` (rects at scale 1 and 0.82, ≥ 44 px, no overlap with any
  `controlRect`, inside the left 40 %; every short form fits); E2E NEW `tests/e2e/ordre-direct-tel.mjs` (844×390 touch:
  tap pill, ⟳, long press, tap on world; a drag that starts on the pill moves the player and gives no order; no
  overlap between the pill / ⟳ and the real DOM rects of the HUD left zone, `primary`/`interact`/`radio`/item bar, on
  foot, in a vehicle and in the drone layout; every tappable HUD element ≥ 44 px). Keep `verif-commande-tel.mjs`,
  `verif-tpm-tel.mjs`, `verif-fin-tel.mjs` green.
- **Done:** §7.1–7.3 by touch in the browser.

### P12 — Interpellé du joueur : Emmener, Confier, Remettre ; statuts
- **Files:** `src/gameplay/law/handover.ts`, `interactions.ts`, `config.ts`, `custody.ts`, `custody-step.ts`,
  `records.ts`, `texts.ts`, `api.ts`, `index.ts`.
- **Content:** §5.3 (4th E = best way out, the centre-screen line within 0.5 s, prompt order and labels, « Faire venir
  le fourgon », per-kind range, van priority, `nearestDrop`, board-while-escorting), « Confier » calls
  `police.arrests.takeOver` (P13); records statuses and `markDelivered`, `stats.inVan/atStation`.
- **dependsOn:** P1, P13 (`takeOver`); after the stations merge (it modifies `handover.ts`).
- **Tests:** extend `tests/unit/law.arrest.test.ts` (4th E is « Confier » with a pair within 60 m, « Remettre » within
  12 m of a van, « Faire venir » beyond 100 m, never « Faire asseoir » when any of these applies; « Remettre
  (CELLULAIRE 1) » at 12 m even with a CRS fourgon at 4 m; the guidance line exists ≤ 0.5 s after the palpation);
  `law.records`. Keep `law.`, `playtest.commandant-interpeller` green.
- **Done:** the sonde-interpelle robot (5 postes) is free of the detainee in ≤ 4 presses.

### P13 — Interpellations des unités, collègues qui emmènent, le fourgon vient
- **Files:** `src/sim/police/ops-arrest.ts`, NEW `src/sim/police/arrest-service.ts`.
- **Content:** §5.4 (`findHandover` over every van, the van comes, `startEscort`, service `police.arrests`, BRAV-M point
  replaced, every `Custody.parked` detainee collected); the one registration line in `PoliceSystem.init`
  (`sim/police/system.ts`, sequential exception: P13 lands after P3).
- **dependsOn:** P3, P5 (crewed vans, `session.remise`).
- **Tests:** NEW `tests/unit/police.interpelles-fourgon.test.ts` (République seed 5: pair back in line ≤ 60 s;
  no-vehicle case: the van comes; « Confier »: pair takes the detainee ≤ 15 s; BRAV-M arrest: no parked detainee
  older than 120 s). Keep `police.barrage-interpellation*`, `police.taches` green.
- **Done:** no « demande un véhicule » left unanswered and no parked detainee older than 120 s in 300 s of the robot.

### P14 — Transfert au commissariat et fourgon de relève
- **Files:** NEW `src/gameplay/transfer/{index.ts, system.ts, texts.ts}`, `src/main.ts` (one line in `MODULES`),
  `src/gameplay/commissariats/engage.ts` (stations tree, `unitVehicles` includes `extraVehicles`).
- **Content:** §5.5 with stations and fallback; « never leaves the site empty of vans » departure rule; replacement
  rule; patrol automatic van request (§5.1); radio lines.
- **dependsOn:** P5, P12, the stations merge.
- **Tests:** NEW `tests/unit/transfer.cellulaire.test.ts` (with the stations module: full van leaves, detainees removed
  at the station, `markDelivered`, a van is on site at every second; without it: fallback). Keep
  `ui-maps.commissariats` (merge tree) green.
- **Done:** in a 30-min robot with 20 arrests, there is always a van at the point de remise and the debrief counts match.

### P15 — Interpellés à l'écran : Ma mission, étiquettes, cartes, compte rendu
- **Files:** `src/gameplay/session/executant.ts`, `src/ui/hud/mission.ts`, `src/ui/maps/units.ts`,
  `src/ui/maps/overlay-units.ts`, `src/ui/screens/debrief.ts`.
- **Content:** `custody` source (§5.3), van labels via `hud.marks` and on the maps (§5.2, first-time label « — pour
  les interpellés »), debrief lines (§5.6), patrol card text (§5.7), BRAV-M chief cards (§4.1.6: « Montez sur votre
  moto (E) — la BRAV-M part avec vous », « Votre moto vous attend — 12 m »), map order labels read `ticket.verb` from
  `command.direct` (§3.1).
- **dependsOn:** P4, P6, P10, P12, P14.
- **Tests:** extend `tests/unit/session.mission-card.test.ts` (custody first, chief cards); E2E NEW
  `tests/e2e/interpelles-cellulaire.mjs` (arrest, line « Interpellé. E : … » ≤ 0.5 s after the palpation, card
  « Emmenez l'interpellé au fourgon cellulaire 1 — … m », marker on the van, remise, label 1/8; asserted from the DOM
  and `window.__CRS`, screenshots only as a record). Keep `missions.executant-poste`, e2e `verif-ma-mission.mjs`,
  `verif-patrouille.mjs` green.
- **Done:** the e2e assertions green at 1280×800 and 844×390 (screenshots kept in the scratchpad as a record, not as
  the criterion).

### P16 — Recette : le joueur, de bout en bout (new, critique)
- **Files (owned):** NEW `tests/unit/playtest.ordre-direct.test.ts`, NEW `tests/e2e/ordre-direct-recette.mjs`; no
  source file (a failure goes back to the owning package).
- **Content:** robot playing §7.1–7.5 headless through `command.direct` (same aim fields as the player) on République
  seed 7 (service day), Concorde seed 21 (free mode, « Déjà sur place »), one special mission per family (cdt-01,
  cg-01, bravm-01) and patrol mode, for commandant, chef de section, chef de groupe, chef de la BRAV-M and patrol chef
  de bord: presses counted, ack ≤ 1 s, first move ≤ 2 s, ticket texts, in-place times, never « sans ordre »; every
  convoy stage of §2.5; every refusal text in the §4.3 table; the detainee flow of §5.3 with a van always on site.
  E2E: §7.1–7.3 keyboard only at 1280×800 and by touch at 844×390.
- **dependsOn:** P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15.
- **Done:** every acceptance item of §9 asserted green by this robot or the e2e.

Dependency graph: P1 → {P2, P5, P7, P8}; P7 → P3; P5 → {P4, P13}; P3 → P13 → P12; P2+P3+P5 → P6; P8 → P9 → P10 →
P11; P12+P5+merge → P14; P4+P6+P10+P12+P14 → P15; everything → P16. Parallel from the start: P1; then P2, P5, P7, P8
together; P3 right after P7.

---

## 9. Acceptance (the player's words; each one is a robot assertion)

1. « J'arrive en colonne, je descends, je regarde une rue, j'appuie sur Entrée : ma section la barre. » — ack ≤ 1 s,
   first agent moving ≤ 2 s, barrage « en place » ≤ 45 s, at every service-day stage (P8 robot, P3 robot).
2. « Je donne un ordre pendant qu'ils sont encore dans les fourgons : ils descendent et y vont. » — no order with
   0 agents moving 10 s later, at any convoy stage.
3. « Je ne suis jamais bloqué à l'arrivée : soit ils y vont, soit l'écran me dit ce qu'ils finissent et dans combien de
   temps. » — every ticket in `attente` has a reason and an ETA ≤ 10 s (driving excepted).
4. « Quand j'arrête de marcher, mes hommes se mettent en ligne face à la foule. » — within 10 s, order still `suivre`.
5. « Mes unités ont toujours un ordre que je peux lire. » — no unit under command reads « SANS ORDRE », « MONTE »,
   « DESCEND » or « EN FILE » at any sampled second.
6. « J'appuie sur A : tout le monde revient avec moi. » — every squad in scope `suivre` ≤ 1 s, BRAV-M included.
7. « Je vise un casseur, j'appuie une fois : la BRAV-M l'interpelle et il finit dans le fourgon. » — arrested ≤ 60 s,
   in a cellular van ≤ 120 s; then the BRAV-M line reads « revient avec vous » (or its previous order) ≤ 10 s later.
8. « J'envoie la BRAV-M à un carrefour à 400 m en deux touches et elle y arrive. » — arrives (≤ 30 m) or reports
   « finissent à pied » and is on foot at the point ≤ 90 s.
9. « La BRAV-M m'obéit comme les autres, et le chef de la BRAV-M peut la commander. » — for the commandant and for the
   chef de la BRAV-M, each verb `caps.ts` accepts for the BRAV-M (Avec moi, Envoyer, Interpeller, Disperser, Tenir,
   Repli): ack ≤ 1 s, `squad.order.type` equals the ordered type at every sample until done, first agent or moto
   moving ≤ 2 s on foot / ≤ 6 s when it must remount; on a service day the chief is never left without his unit or a
   waiting moto.
10. « Quand un ordre est impossible, on me dit pourquoi en une phrase et quoi faire. » — every refusal text produced in
    the robots is in the §4.3 table or has the « X ne peut pas : … U : une autre unité. » form with a mapped reason;
    an unmapped reason code fails the test.
11. « J'interpelle quelqu'un moi-même : je le confie à un collègue en une touche, ou on me montre le fourgon et sa
    distance. » — ≤ 4 presses; the line saying what to do is on screen ≤ 0.5 s after the palpation; the 4th E is never
    « Faire asseoir » when a pair, a van or « Faire venir » applies.
12. « Il y a toujours un fourgon cellulaire là, et quand il est plein il part au commissariat et un autre vient. » —
    at every second of a 30-min robot with 20 arrests, ≥ 1 van with ≥ 1 free seat within 150 m of the point de remise,
    except after an explicit player order to leave; no parked detainee older than 120 s.
13. « À la fin, je vois combien sont au commissariat et combien dans le fourgon. » — debrief counts = records.
14. « Le chef de section : l'IA ne donne plus d'ordres à mes groupes. » — no `order:issued` from the AI command to a
    squad under the player in 300 s.
15. « Au téléphone, je fais tout ça avec les pouces, sans rien sous les doigts qui gêne. » — e2e 844×390: targets
    ≥ 44 px, no overlap, §7.1–7.3 by taps.
16. « Sur mon Mac sans souris, je fais tout au clavier. » — e2e keyboard-only §7.1–7.3.
17. « Sur la carte et sur le terrain, ce sont les mêmes mots. » — every field verb label equals a map intention label
    or card line label (P1 unit test).
18. « Je n'ai pas perdu d'ordre. » — every `OrderType` reachable today through the wheel or map is still reachable
    (P1 test comparing `WHEEL`/`MORE_RING`/`allOrdersGrouped()` before and after), and every old « F puis N » gives
    the same order or Avec moi, never a coercive one it did not give before (P9 test).
19. « Une fausse manip ne casse pas mon dispositif. » — Entrée on the sky / a wall gives no order; Entrée or ⌫ that
    closes the map or the wheel gives no field order or undo (key repeat included); a policeman of a detached unit in
    the 4° cone never turns the ordre prêt into « avec moi »; the automatic addressee never takes a unit holding a
    barrage while another unit is free; A then ⌫ within 5 s restores every previous order.
20. « Sans souris, la caméra droite, je désigne la rue juste devant moi. » — level aim picks the nearest street mouth /
    crowd front within 15–60 m on the five demonstration places; one pitch step reaches the next candidate.
21. « Au téléphone, je ne donne pas d'ordre en voulant marcher. » — a touch that starts on the pill and moves ≥ 12 px
    moves the player and gives no order; every tappable control and HUD pill ≥ 44 px at scale 0.82.
22. « En patrouille, mon équipier m'obéit. » — patrol chef de bord: Interpeller to the partner in 1 press, Avec moi in
    1 press, and a detainee in the car or a van requested automatically.
23. « Repousser la foule, c'est une touche quand c'est permis. » — after the 3 sommations, Maj+Entrée on a crowd gives
    `refoulement` to the named unit; before them, the same press runs the sommations (commandant) or says who
    decides.

---

## 10. Blockers to fix first (independent of the new interface)

| # | Blocker | Files | Fix | Package |
|---|---|---|---|---|
| B1 | Seated units ignore every order; radio claims success | `sim/police/maneuver.ts`, `sim/police/tree.ts` | dismount-first in `startOrder`; dismounting agents `formable`; reports only at ≥ 50 % | P2 |
| B2 | Order to the player's own group/section boards it and waits for him (300 s), all later orders do nothing | `ui/command/core.ts` (`farFor`/`motorize`), `sim/police/command/convoy.ts` | never motorize a unit containing the player unless he is aboard; `ConvoyControl.release` called by `CommandCore.issue`; `PLAYER_WAIT` only for « Avec moi » in vehicles / service-day departure | P3 + P8 (P1 rule) |
| B3 | End of parking / AI orders overwrite the player's orders (`issuedBy` is the player for convoy and adjoint orders) | `core/contracts.ts`, `sim/police/system.ts`, `convoy.ts` | `SquadOrder.byPlayer`; handleOrder keeps a descendant's `byPlayer` order against a non-player root order; convoy orders `issuedBy: 0`; per-squad `debarquer` | P1, P3 |
| B4 | After a vehicle column, units stay « DESCEND » forever | `gameplay/session/follow.ts endConvoy()` | chain `suivre` after `debarquer` | P6 |
| B5 | BRAV-M outside the company, walks back to its motos for 30 m, « accès bloqué » | `sim/police/api.ts`, `sim/police/units.ts`, `gameplay/session/setup.ts:539`, `sim/police/command/bravm.ts` | `parentId`; distance rule; `byPlayer` arrival thresholds | P5, P4 |
| B6 | Column parks for up to 9 min; departure 120 s after everyone is aboard | `convoy.ts thinkPark/thinkBoard/update` | per-vehicle unloading, 30 s caps, `BOARD_MAX` rule, `debarquement` ends on seated count | P3 |
| B7 | Adjoint silent for 2 min after arrival | `sim/police/command/command.ts thinkDeploy()` | propose at `stationnement` | P3 |
| B8 | AI company commander orders a chef de section's groups | `command.ts buildElements()` | skip squads led by the player or under one | P3 |
| B9 | Nobody follows the commandant / the chef de section's section at start | `gameplay/session/setup.ts:218-224` | initial `suivre` for every squad in scope | P5 |
| B10 | The 5th E sits the detainee down; no van crewed; van never leaves | `gameplay/law/interactions.ts`, `units.ts`, `setup.ts` | prompt order of §5.3; crewed vans; transfer | P12, P5, P14 |
| B11 | Stations tree: `unitVehicles` ignores `extraVehicles` (uncrewed van's detainees never transferred) | `gameplay/commissariats/engage.ts` (stations tree) | include `extraVehicles` | P14 (or the merge agent) |
| B12 | Water cannon at the head stays « bloqué mur », whole column waits (Concorde 21) | `convoy.ts thinkRoute` | being fixed by another agent; P3 rebases on it; the P8 watchdog is the safety net | other agent |
| B13 | Detainees parked (BRAV-M pavement point, player boarding while escorting) sit alone forever (diag-interpelles P6, P10) | `sim/police/ops-arrest.ts`, `gameplay/law/custody-step.ts` | collect every `Custody.parked` detainee with the nearest van and pair | P13, P12 |
| B14 | Phone pills « Suivez-moi » / « Secours ici » are 30 px high (below 44 px) | `ui/command/quickActions.ts` touch CSS | min-height 44 px for every tappable HUD element | P10 |
| B15 | « Suivez-moi en véhicules » given on foot boards the unit and parks it, then nothing else works (diag-arrivee §5, the likeliest « ils me suivent mais n'ont pas d'ordre ») | `follow.ts column()`, `maneuver.ts` | « Avec moi » adapts to how the player moves (no column while he is on foot), dismount-first for every later order | P6, P2 |

---

## 11. Decisions taken where the intent was ambiguous

- **Entrée** is the one key of the ordre prêt (same key as the map's « Donner l'ordre »); **A** (KeyQ) is « Avec moi »;
  F keeps opening the wheel on a tap (no tap/hold split) to keep « F puis N » habits.
- The wheel keeps every number that existed (1 Avec moi with 2 as a hidden alias, 3 Envoyer, 4 Bloquer, 5
  Interpeller, 7 Secours, 8 Plus… with its 1–8 unchanged); Disperser takes 6 (Pousser moves to « Plus… » 9).
- Map labels are **not** renamed (« Envoyer », « Disperser » stay); the field uses the map's words. « Repousser » is the
  sub-label only.
- The player's own order phrase is no longer spoken (written at once); the unit's acknowledgement is spoken first. If
  the player misses the « radio feel », the phrase can come back after the acknowledgement as a later option.
- « Secours ici » stays visible on laptop and phone (earlier explicit request), so the phone keeps two pills under the
  mini-map (« Avec moi », « Secours ici ») and the round « Ordres » becomes the ordre prêt pill.
- Encercler is not in the field wheel (map only, N): it needs two units and the picture of the exits.
- A manual « À qui » applies to the next order only; the next U goes straight back to it (corrected by the critique:
  the 20 s persistence sent a busy unit).
- Van count: max(2, ceil(crowd/400)) capped at 4 with a company (1 for BRAV-M- or engine-only missions); a van leaves
  when full (8), or after 6 min with 2 min without a new detainee, or on order — never leaving the site without a van
  unless the player orders it.
- Without the stations feature, the transfer is a simple off-map trip (600 m away, detainees removed and counted).
- Field orders use the trot beyond 15 m and drive only beyond 450 m on foot (150 m when seated).
- Patrol crews: the chef de bord commands his two colleagues for Avec moi, Interpeller, Secours and the detainee
  (corrected by the critique — « Votre chef donne les ordres » was false for him: he has no chief on the spot);
  reinforcements still go through the CENTRAL card (Y), which also shows the automatic van request.

---

## 12. Corrections de la critique

Critique jouée « comme le joueur » (MacBook sans souris, téléphone 844×390 tenu à deux mains), vérifiée dans le code
(`src/input/bindings.ts`, `src/input/touch/layouts.ts`, `src/ui/hud/layout.ts`, `src/ui/hud/hud.ts`,
`src/ui/command/{quickActions,orderWheel,tacticalKeys,scope}.ts`, `src/sim/people/player-aim.ts`). Aucun objectif n'a
été affaibli ; plusieurs ont été durcis.

| # | Défaut trouvé (catégorie de la grille) | Correction | Où |
|---|---|---|---|
| C1 | (e) Entrée ferme la carte (« Donner l'ordre ») et ⌫ ferme la carte / la roue : le même appui ou sa répétition donnait un 2e ordre ou une annulation sur le terrain | Entrée, Maj+Entrée, A, ⌫ ignorés en répétition et 0,6 s après la fermeture d'un écran | §1.1, P9, accept. 19 |
| C2 | (e)(g) A (KeyQ) est collé à Z / Q (KeyW / KeyA, déplacement) : un effleurement rappelle tous les barrages | A ignoré en répétition et annulable par ⌫ pendant 5 s, ligne « ⌫ annuler » | §1.1, §7.5, accept. 19 |
| C3 | (c) Règle i : Entrée en regardant le ciel ou un mur rappelait tout le monde (« Avec moi ») | règle i ne donne aucun ordre, ligne grise qui dit quoi viser | §1.3, §4.3, accept. 19 |
| C4 | (c) Règle e avec le cône de 4° : un barrage entre le joueur et la rue visée était rappelé au lieu que la rue soit barrée | règle e seulement sous le réticule exact, jamais pour une unité déjà « avec vous » | §1.3, §7.5, P9 |
| C5 | (c) La ligne change toutes les 0,25 s : le joueur pouvait donner un autre ordre que celui lu | hystérésis 0,5 s, Entrée exécute exactement la ligne affichée, flash si elle vient de changer | §1.3, P8 |
| C6 | (a)(b) Clavier seul, caméra horizontale : le point visé est toujours à 80 m puis le rayon lointain va jusqu'à 400 m — impossible de désigner la rue juste devant | désignation par candidats le long du rayon, du plus proche au plus loin ; le tangage (trackpad, fn+↑/↓) passe au suivant | §1.5, §7.4, P9, accept. 20 |
| C7 | (b) G1 « chaque ordre en un appui » : Disperser demandait F puis 6 (et la carte pour les sommations) | ligne « autre » : Maj+Entrée (téléphone : appui long, relâcher) ; le 2e appui du commandant fait les sommations **et** donne l'accord de force (plus de détour par L sur la carte) | §1.3, §1.6, §4.3, accept. 23 |
| C8 | (e) Roue renumérotée : « F puis 4 » (tenir une ligne) devenait Disperser, « F 8 3 » (Charger) devenait Bond, « F 8 4 » (Gaz) devenait Charger | tous les anciens numéros gardés ; 2 = alias de 1 ; Disperser en 6 ; « Plus… » 1–8 inchangé + 9 Pousser ; test dédié | §1.2, §1.7, §11, P9, accept. 18 |
| C9 | (c) « À qui » manuel gardé 20 s : la 2e Entrée envoyait la BRAV-M occupée à interpeller ; « libre » n'était pas défini, l'automatique pouvait retirer une section de son barrage | manuel valable pour un seul ordre, U suivant y revient ; « libre » défini ; sinon la ligne dit ce que l'unité quitte | §1.4, §11, accept. 19 |
| C10 | (e) Téléphone : « ⟳ » devenait « ↶ Annuler » pendant 5 s — choisir l'unité suivante annulait l'ordre précédent | ⟳ toujours « À qui » ; annuler = toucher la pastille d'état (≥ 44 px) | §1.6, P10, P11 |
| C11 | (e) Téléphone : pastilles « Suivez-moi » / « Secours ici » à 30 px (`quickActions.ts` `.cm-btn{min-height:30px}`), sous les 44 px | 44 px pour tout élément touchable du HUD ; bloqueur B14 | §1.6, §10, P10 |
| C12 | (e) Téléphone : la pastille s'étend de x 82 à 266 juste au-dessus du joystick, dans `MOVE_ZONE` : le pouce qui pose le joystick donnait un ordre | toucher valide seulement s'il commence sur la pastille, < 600 ms, < 12 px ; sinon rendu au joystick ; test e2e | §1.6, P11, accept. 21 |
| C13 | (e) Texte de la pastille trop long pour 128 px (« Interpeller le lanceur de projectile ») ; zone gauche du HUD (DOM, `leftZoneCenter`) non vérifiée contre la nouvelle pastille | formes courtes fixées et testées ; e2e sur les rectangles réels du HUD, à pied / véhicule / drone | §1.6, P11 |
| C14 | (g) Interpellé : le 4e E était « Emmener », le joueur partait à pied avant d'apprendre qu'il pouvait confier ; sans collègue à 60 m, l'ordre prêt ne faisait que montrer un fourgon à 300 m | 4e E = la meilleure issue ; ligne « Interpellé. E : … » ≤ 0,5 s après la palpation ; « Faire venir le fourgon cellulaire » au-delà de 100 m ; 4 appuis au lieu de 5 | §1.3 a, §5.3, §7.2, P12, accept. 11 |
| C15 | (g) « Toujours un fourgon » : avec 1 fourgon pour 150 manifestants, aucun fourgon sur place pendant son trajet au commissariat ; l'acceptation tolérait « un annoncé avec ETA » | au moins 2 fourgons avec une compagnie ; un fourgon ne part pas tant qu'un autre ne peut pas prendre la remise (sauf ordre du joueur) ; acceptation stricte | §5.1, §5.5, §11, P5, P14, accept. 12 |
| C16 | (j) Oublié du diagnostic (interpellés P6/P10) : interpellés « parqués » laissés seuls à jamais | ramassage de tout `Custody.parked` ≤ 120 s ; bloqueur B13 | §5.4, §10, P13 |
| C17 | (f) Jargon : « CELLULAIRE 1 » seul (le joueur dit « wagon pénitentiaire »), « binômes », « sommations » sans explication, « autorisation » | « fourgon cellulaire 1 — pour les interpellés » la 1re fois, « fourgon cellulaire » partout à l'écran ; « Toute la BRAV-M est déjà sur des interpellations » ; « sommations (avertissements à la foule) » ; « accord » | §4.3, §5.1, §5.3 |
| C18 | (d) Refus de la simulation (`police:order_refused`, BRAV-M `onPoliceDone`) hors du tableau : texte libre possible | forme unique « X ne peut pas : … U : une autre unité. », codes traduits dans `caps.ts`, code inconnu = test rouge ; refus aussi dit à la radio | §4.3, accept. 10 |
| C19 | (h) Chef de la BRAV-M : la BRAV-M partait sans lui après 20 s et le laissait seul à la caserne | elle part avec lui ; après 20 s sa moto et son pilote l'attendent ; cartes « Ma mission » (P15) | §4.1.6, P6, P15, accept. 9 |
| C20 | (h)(i) Acceptation 9 (BRAV-M) sans critère mesurable | critère par verbe : accusé ≤ 1 s, ordre lisible, mouvement ≤ 2 s / 6 s | §9 |
| C21 | (c) Après une interpellation ou un secours, l'unité restait au fourgon sans ordre lisible | elle reprend son ordre précédent ou « Avec moi », ligne « revient avec vous » | §3.2, accept. 7 |
| C22 | (g)(j) Mode patrouille : « Votre chef donne les ordres » est faux pour le chef de bord ; le fourgon s'obtenait par un menu (carte Y) | portée `equipage` (Avec moi, Interpeller, Secours, interpellé) ; demande de fourgon automatique | §1.4, §4.3, §5.1, §11, P4, P14, accept. 22 |
| C23 | (i) P3 importait sous condition un module de P13 pas encore écrit ; P3 utilisait `replyFlag` de P7 sans en dépendre ; P12 appelait `takeOver` de P13 sans en dépendre ; P6 avait besoin du `parentId` de P5 ; P15 portait les textes de P4/P6 sans en dépendre ; `tacticalKeys.ts` (U de la carte) n'avait pas de propriétaire ; personne n'alimentait `setOrderLabel` | dépendances ajoutées (P3←P7, P12←P13, P13←P3, P6←P5, P15←P4,P6) ; P13 ajoute sa ligne d'enregistrement après P3 ; `tacticalKeys.ts` à P10 ; la surcouche lit `command.direct` elle-même ; graphe refait | §8 |
| C24 | (i) Critères « faits » invérifiables par un robot : P8 exigeait un robot qui a besoin de P2/P3/P7 ; P15 « captures d'écran » | P8 = test du moteur avec simulation simulée ; nouveau P16 « Recette » qui porte le robot de bout en bout et l'e2e ; P15 = assertions DOM / `__CRS` | §8 |
| C25 | (j) Diagnostic (arrivée §5) : « Suivez-moi en véhicules » donné à pied gare l'unité et bloque tout — cause la plus probable de « ils me suivent mais n'ont pas d'ordre » — absent des bloqueurs | bloqueur B15 (Avec moi qui s'adapte + descendre d'abord) | §10 |
