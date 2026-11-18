# RESTART NOTE (18 November, 06:30 — read before everything else)

The machine restarted a second time (it restarts about every six hours): the agents were cut off, but the worktree is intact. State of the redesign:
- ALL nine packages C1, C1B, C2, C3, C3B, C4, C5, C6 and C7 are FINISHED; their reports (summary, files, deviations, open issues) are in /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-paquets-commande.json — read it first;
- the INTEGRATION is finished too (its report is in the same file under the key « intégration:commande »); a playtester had just started when the machine restarted: if you are the playtester, you start from the integrated worktree;
- the main repository has moved on since your base (2365d2b): a new home screen with four modes and a patrol mode (a call card on the field HUD with key Y, files under src/ui/patrol/, a section « Appel en cours » in src/ui/command/radioScreen.ts, quick actions for a patrol crew in src/ui/command/core.ts / quickActions.ts), a liaison call in the simulation, many fixes to columns. They are NOT in your tree; your patch will be three-way merged with them by the coordinator. Keep your edits in files you do not own minimal and local; leave a clearly documented card line slot « Négocier un parcours (liaison) » on the crowd card and keep « Rendre compte » (compte rendu de situation) available to an executant on the radio screen.

# COORDINATOR ADDENDUM (takes precedence over the rest of this document)

1. This document is the approved design. Sections 1–7 are the specification, section 8 the work packages (authoritative for who owns which file), section 9 the acceptance list, section 10 the coordination notes, section 11 the corrections already applied in the text by the player's advocate. Read ALL of it before your package.
2. The screenshots of the interface as it is today are under /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/commande/shots/ and the capture script /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/commande/capture.mjs can be reused for before / after pictures. Write scratch files under /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/commande/, never in the project tree unless they are deliverables of your package.
3. Other teams are working right now in other worktrees; their patches will be three-way merged with yours, so in files you do not own make only minimal, localised edits:
   - « bugs »: small edits in src/ui/command/quickActions.ts (wording and feedback of « Secours » for a civilian: a phone call to 18 / 15, not a police radio procedure) and in src/ui/command/wheel.ts (an action for the commandant to ask the liaison officer to negotiate a route — an objective « Obtenir un parcours négocié par la liaison » had no means of action). Keep both possible in the redesign: a civilian keeps a clear « Secours » ; if a liaison call exists in this tree (look for setLiaison in src/sim/crowd/core-api.ts and its callers) expose it as a plain line of the crowd card (« Négocier un parcours (liaison) »), otherwise add nothing for it.
   - « modes » (new home screen, patrol mode): reserves the key Y for a call card on the field HUD, adds a section to src/ui/command/radioScreen.ts and entries in src/input/bindings.ts. Do not use Y; do not restructure radioScreen.ts beyond what this design needs.
   - « commissariats »: will apply your final patch to their worktree and then build section 7's part about the police stations (dispatching a station's unit, sending it back) on top of your cards. The way a new card and new card lines are registered must therefore be simple and documented in the code (a short header comment in the file that owns the card registry).
4. The simulation, the order types and their effects do not change (this is stated in the document): if a package seems to need a change under src/sim/** or src/gameplay/**, it is a misunderstanding — re-read the design, and report it in openIssues if the need is real.
5. The player's words, to keep in mind for every label and every screen: « il y a beaucoup trop de boutons, c'est pas assez intuitif… je dois cliquer sur tout… rends ça beaucoup plus stratégique et beaucoup plus intuitif ». He plays on a MacBook Air WITHOUT a mouse (keyboard + trackpad) and on a phone.

# DESIGN — « Carte de commandement » and field orders (redesign of the command interface)

Status: final specification for the developers (jury and lead designer), **then reviewed and corrected by the
player's advocate** (every change is listed in §11 « Critique et corrections »; where an older sentence and §11 seem to
disagree, the body text is the corrected one). Worktree `/tmp/claude-0/hunt/commande`
(project `crs-simulation`, HEAD 2365d2b). Sources: `inventory.md`, the three proposals `proposal-trackpad.md` (base),
`proposal-intention.md`, `proposal-contexte.md`, `plan-commissariats.md` (addendum, §3, P5), and the code
(`src/ui/command/**`, `src/ui/maps/mapCanvas.ts`, `gestures.ts`, `overlay-units.ts`, `src/ui/hud/mission.ts`,
`src/sim/police/command/{api,obstacle,command,react,dispositif,sustain}.ts`, `src/gameplay/law/index.ts`,
`src/gameplay/session/mission-api.ts`, `src/input/bindings.ts`).

The jury's scores and the list of what was taken from each proposal are in **Annex A** (end of document).

Writing rules: everything between « » is the exact French text to put on screen. The rest is for developers.
Order types (`OrderType`), their gestures' effects, `core.issue/check/authorize/callFollow`, `nasse.ts`,
`obstacleOrder.ts`, the law module and every file under `src/sim/**` and `src/gameplay/**` are **unchanged**.

---------------------------------------------------------------------------------------------------------------------

## 1. Mental model and principles

**Mental model (two sentences — shown once at the first opening and at the top of the help, key H):**

> « Dites ce que vous voulez faire (les six boutons du bas) ou montrez un endroit sur la carte : le jeu propose la
> bonne action et la bonne unité, et vous la dessine sur la carte. Entrée ou « Donner l'ordre » l'envoie, Échap revient
> en arrière. »

Vocabulary rule for the screen: the word « Envoyer » is reserved for the intention « Envoyer » (and lines such as
« Envoyer les pompiers », « Envoyer TV 75-19 »); the confirmation button is always « Donner l'ordre ». The two
« Annuler » are also separated: closing a card without sending is « ‹ Retour » (Échap); cancelling a sent order is
« Annuler l'ordre » (X).

**Principles (each one is checked by a test or an acceptance line):**

1. **Quoi et où d'abord, qui est proposé.** The commander chooses an *intention* (Envoyer, Bloquer une rue,
   Encercler, Disperser, Interpeller, Secours) or points at a *repère* (a street, a crowd, an incident, a unit, a
   police station, himself). The game proposes the unit and says it on a « Qui » line that is always visible; one
   key (U) or one click changes it.
2. **One card at a time, at most six lines.** Whatever is pointed opens **one card** (« la fiche ») with at most six
   numbered lines + « Autres ordres ici… ». The best line is already highlighted. No tabs, no wall of buttons:
   at rest the first level is **8 choices** (6 intentions + « Plus… » + the legal chip).
3. **See it before it happens.** The highlighted line is drawn on the map (who goes, route, mode, time, effect) and
   written in one sentence « Ce qui va se passer : … ». Keyboard: Entrée sends. Trackpad: hover previews, click
   sends. Touch: a tap previews, « Donner l'ordre » (or a second tap on the same line) sends; a single tap never sends.
4. **The game handles the how.** On foot or in vehicles (already automatic beyond 250 m in `core.ts`
   `MOTOR_AUTO`/`motorize`, now *said* in the preview), the formation, the line geometry (`autoLine`), how many
   sections for a wide street, which unit holds which street of a kettle, and the legal steps (done in order after
   one explicit confirmation).
5. **Same words everywhere.** One plain name per order (`plain`), one plain tag (`tag`) on the map, the unit chip,
   the « Mes unités » rows, and the CRS's « Ordre du commandant » card. No raw type (`COUPER_CIRCULATION`), no bare
   force numbers, no radio code on buttons.
6. **No precision, no drag, no hidden gesture.** Pointer snap 40 px (48 px touch) to the nearest repère with a big
   name label; card rows 52 px (40 px phone); two-finger scroll pans, pinch zooms; right-click, long-press and drag
   remain expert aliases, never required.
7. **Keyboard alone, five ideas.** Letters = intentions and panels; arrows = où (they *jump* between repères);
   ↑↓ or digits = quoi (inside a card); U = qui; Entrée = go; Échap = back. Letters are physical keys that are at the
   same place on AZERTY and QWERTY.
8. **The legal frame is always visible and never a trap.** A chip « ⚖ Sommations 0/3 · Force : mains nues » sits in
   the top bar (force levels are always words, §7.1); a forceful line says what is missing (🔒) and offers to do the steps in order after one confirmation;
   the manual path stays.
9. **Nothing is lost.** Every one of the 26 verbs (+ `retour_poste` from P5) and every other control stays
   reachable: in a card, in « Autres ordres ici… », in « Plus… › Tous les ordres », or by key. A unit test walks
   `ORDER_VERBS` and fails if one is unreachable.

---------------------------------------------------------------------------------------------------------------------

## 2. The command map, state by state

Screen id unchanged: `carte_tactique` (Tab, HUD button, touch chip). Title: « CARTE DE COMMANDEMENT ».
Counting rule: « controls » = clickable/focusable things visible in that state (read-outs not counted). Today: **60**
buttons with nothing selected at 1280×800 (inventory §0), and 7 taps for one order on the phone.

### 2.0 Vocabulary and building blocks

- **Repère**: a thing the commander can act on. Kinds: `rue` (exit streets of every crowd from
  `scene.crowdExits`, plus the named street under the visée from `hoverRoad`), `foule` (crowds, foyers, head of the
  march), `nasse` (a closed kettle), `incident`, `unite` (one of my units), `cible` (a unit or vehicle that is not
  mine, or a rescue vehicle), `vous` (the player's marker), `point` (anything else), `metro`, `fermeture` (road
  closure), `commissariat` (P5), `proposition` (the adjoint's proposal, at `(p.x, p.z)`), `bloqueur` (the vehicle
  that blocks the player's column, `police.obstacle.blocked()`).
- **Visée**: the yellow reticle (today's keyboard cursor element of `MapCanvas`) sitting on one repère, with the
  repère's name in a large label (« ◎ RUE DE RIVOLI »). Plain arrows make it *jump*; Maj+arrows move it freely.
- **Intention**: one of six bottom buttons. It filters the repères the arrows cycle through, chooses the first
  repère, and the default line of the card.
- **Fiche** (card): the right-column (phone: right sheet) panel with header, ≤ 6 numbered lines + « 0 Autres ordres
  ici… », the « Qui » block, the sentence « Ce qui va se passer », and « Donner l'ordre ⏎ » / « ‹ Retour Échap ».
- **À traiter**: at most 3 rows of what is waiting (untreated incidents by `sortIncidents`, the adjoint's proposal,
  a closed kettle, a legal chain waiting). Espace walks through them.
- **Mes unités**: one row per section (groups fold under it), « Patrouilles (n) », « Engins (n) », each row saying
  what the unit does, where, how long — this is also the follow-up board.

Layout at **1280×800**: top bar 44 px; right column 340 px (full height under the top bar); map 940 px wide; bottom
intention bar 64 px **under the map only**; map widgets bottom-right above the bar; wind rose + scale bottom-left
above the bar; radio subtitles move to the **top-left of the map** (2 lines max, 50 % of the map width), so they
never cover widgets; refusal toasts bottom-left of the map, above the bar, at most 2 (never over the top bar).
The radio subtitles start to the right of « Rechercher un lieu » (never under it). The drone feed window, when open
over this screen, is anchored to the **top-right corner of the map** (today `src/ui/drone/index.ts` puts it at the
map's top-left + 58 px, which would cover the search button and the subtitles). At a window height below 760 px
(MacBook Air with the browser's bars: about 1440×790), card lines show their explanation only for the highlighted line,
so the card never scrolls.

Layout at **844×390** (landscape phone, `cm-coarse`): top bar 36 px; full-width map; bottom intention bar 52 px
(7 flexible buttons ≥ 96 px inside the safe area, §5.3); a right sheet of 380 px opens for a card, « Suivi »,
« Plus… », « Cadre légal » — **one sheet at a time**; while a sheet is open the bottom bar is hidden and the map
(464 px) re-centres the visée in what is left.

**Keyboard focus model (the riskiest point of the rewrite — read before coding C3).** Today three things react to
the arrows and to Entrée on this screen: the screen's own `keydown` listener, the UI focus manager
(`src/ui/core/focus.ts`, which polls `ui_up/down/left/right/accept` every frame and moves the focus between buttons
or clicks the focused one) and `MapCanvas.updatePad` (which moves the free cursor with the arrows and turns
`ui_accept` into a tap at the cursor while the canvas has the focus). In the new screen:
- the **map canvas keeps the focus** in every state (it already cancels `ui:nav`); card rows, intention buttons and
  panel rows are buttons with `tabindex="-1"` (still clickable, never focused by the focus manager);
- the screen root listens to `ui:nav` and always calls `preventDefault()`, and maps the event's `dir` to the same
  command as the arrow keys (this is also how the gamepad D-pad reaches the visée jumps);
- `MapCanvas` in `keyCursor: 'shiftOnly'` (C2) moves the cursor only with Shift held and **ignores keyboard
  `ui_accept`** (gamepad A keeps working through the screen's handler); Entrée is handled once, by the screen's
  `keydown` listener;
- a text field (« Rechercher un lieu », « Chercher un ordre ») takes letters and digits while it has the focus;
  Entrée there validates and gives the focus back to the canvas, Échap empties it then gives the focus back;
- the screen's `keydown` listener is registered in the **capture phase** and stops nothing except the keys it uses;
  the drone listener (`src/ui/drone/index.ts`, key O, also active over `carte_tactique`) must ignore O while
  `ctx.ui.current === 'carte_tactique'` — otherwise O opens « Plus… » **and** toggles the drone feed. On this screen the
  drone feed is reached by the top-bar button « Vue drone » (`data-id="tac-drone"`, kept) and « Plus… › Vue drone ».
  P / Maj+P (adjoint's proposal, `quickActions.ts`) keep working over the map as today.
- After any send, Entrée is ignored for 0.6 s (a double press or key repeat never sends two orders).

### 2.1 S0 — at rest (map just opened). Visée on the first « À traiter » item, else the main crowd, else on « VOUS »

1280×800:
```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CARTE DE COMMANDEMENT  Cortège en marche · Tension ▮▮▮▯▯ · Foule ~300 · 15 h 30                                  │
│                         [⚖ Sommations 0/3 · Force : mains nues  L]              [⏱ Ralentir  V] [✕ Fermer  Tab] │
├──────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────┤
│ [🔍 Rechercher un lieu  R]   (radio subtitles here, 2 lines max)          │ À TRAITER                    Espace │
│                                                                          │ 🔥 Véhicule en feu · rue Royale      │
│                                                                          │    personne n'y va · depuis 40 s     │
│        ╭───────────────────────────────╮                                 │ 💬 L'adjoint propose : tenir les 40  │
│        │ ◎ TÊTE DE CORTÈGE · ~300 pers. │  ← visée + label               │    rues autour du parcours   P / ⇧P  │
│        │ Entrée : que faire ici ?       │                                 │ MES UNITÉS                        U │
│        ╰───────────────────────────────╯                                 │ ▸ Section MISTRAL 1 19/19 Sans ordre │
│        (place names at normal size; no crowd-exit starburst)             │ ▸ Section MISTRAL 2 19/19 Sans ordre │
│                                                                          │ ▸ Section MISTRAL 3 18/19 Sans ordre │
│  ↖ vent SO 7 km/h · ━━ 200 m                          [+] [−] [◎ Moi G]  │ ▸ Patrouilles (2)   en patrouille    │
├──────────────────────────────────────────────────────────────────────────┤ ▸ Fourgon cellulaire Sans ordre      │
│[➜ Envoyer E][⛔ Bloquer une rue B][◯ Encercler (nasse) N][⇶ Disperser D][✋ Interpeller I][✚ Secours S][⋯ Plus… O]│
│ une unité   barrage, passants,    tenir chaque rue       repousser, gaz,  arrêter un      pompiers,   tous les   │
│ quelque part voitures             autour                 charge           casseur         SAMU        ordres…    │
└──────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────┘
```
Exact first-level labels (button / key / second line):

| Button | Key | Second line |
|---|---|---|
| « Envoyer » | E | « une unité quelque part » |
| « Bloquer une rue » | B | « barrage, passants, voitures » |
| « Encercler (nasse) » | N | « tenir chaque rue autour » |
| « Disperser » | D | « repousser, gaz, charge » |
| « Interpeller » | I | « arrêter un casseur » |
| « Secours » | S | « pompiers, SAMU » |
| « Plus… » | O | « tous les ordres, journal… » |

Second lines are ≤ 30 characters, at most 2 lines at 11 px, never cut with « … ». Below 1200 px of width they are
hidden and become the button's tooltip. The button's tooltip always holds the full sentence: « Envoyer une unité
quelque part (à pied ou en véhicules, le jeu choisit) », « Bloquer une rue : barrage complet, barrage qui laisse passer
les passants, ou barrières contre les voitures », « Encercler une foule : chaque rue autour d'elle est tenue par une
unité (une nasse) », « Disperser une foule : la repousser, le gaz ou la charge, avec les sommations exigées par la
loi », « Faire arrêter un casseur ou un pilleur », « Envoyer les pompiers ou le SAMU », « Tous les ordres, les
incidents, la circulation, les commissariats, le journal radio, l'affichage de la carte, l'aide ».
| « ⚖ Sommations 0/3 · Force : mains nues » (top bar) | L | tooltip « Les sommations : 3 avertissements au mégaphone, obligatoires avant d'employer la force contre un attroupement. Cliquez pour voir ce que la loi permet. » |

Controls S0: top 3 (+ « Vue drone » when a drone is engaged) + map 4 (« Rechercher un lieu », « + », « − »,
« ◎ Moi ») + bottom 7 = **14 fixed**, + ≤ 3 « À traiter » rows + one row per section / group of units (5 at
Concorde) = **22** (today 60). **First-level choices: 8.** A commandant on foot sees under the title « vue
partielle : vous êtes à pied » (replaces the scope phrase).

844×390:
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [✕] Cortège · 15 h 30      [⚖ Sommations 0/3]             [☰ Suivi ●2]  [⏱]      │ 36
├──────────────────────────────────────────────────────────────────────────────────┤
│ [🔍]                                       ╭─────────────────────╮                │
│                 (full-width map)           │ ◎ TÊTE DE CORTÈGE   │                │
│                                            │ Touchez : que faire │          [◎]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│[➜ Envoyer][⛔ Bloquer][◯ Encercler][⇶ Disperser][✋ Interpeller][✚ Secours][⋯ Plus]│ 52
└──────────────────────────────────────────────────────────────────────────────────┘
```
Zoom by pinch (no +/− on phone). « ☰ Suivi » opens the right sheet « À traiter » + « Mes unités » (badge = number
of « À traiter » items). Controls: ✕, legal chip, Suivi, Ralentir, Rechercher, Moi + 7 = **13**. First level: 8.

### 2.2 S1 — a card is open (an intention was chosen, or a repère was clicked / Entrée on the visée)

The intention and the place are on the same screen: moving the visée (←/→, click elsewhere, Maj+arrows) re-targets
the card and its preview live. Example: B pressed (visée jumps to the nearest exit street of the main crowd that
nobody holds; Qui = the nearest free section).

1280×800:
```
├──────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────┤
│                                                          │ ⛔ BLOQUER UNE RUE                       ‹ 1 / 7 ›     │
│   Section MISTRAL 2 ┄┄┄┄┄┄┄┄┄┄➤ ███ (red bar across the   │ Rue de Rivoli · à 120 m de la foule · personne ne la  │
│   à pied · 180 m · ~2 min       street, façade to façade) │ tient                                                 │
│                                                          │ ▶1 ⛔ Barrer la rue                                    │
│   ◎ RUE DE RIVOLI   ← visée                              │       Personne ne passe, dans les deux sens.          │
│                                                          │  2 🚶 Barrer la rue, passants admis                    │
│   (the other exit streets of this crowd: short grey      │       Les manifestants ne passent pas, les passants   │
│    ticks at their mouths; held ones: green ticks)        │       oui.                                            │
│                                                          │  3 🚪 Barrage filtrant                                 │
│                                                          │       Une porte : les gens sortent un par un.         │
│                                                          │  4 🚧 Fermer aux voitures (barrières)                  │
│                                                          │       Barrières seules ; les piétons passent.         │
│                                                          │  5 ═  Tenir une ligne ici                              │
│                                                          │       Ligne en travers de la rue, face à la foule.    │
│                                                          │  6 ➜  Y aller                                          │
│                                                          │  0 ⋯  Autres ordres ici…                               │
│                                                          │ ───────────────────────────────────────────────────── │
│                                                          │ Qui : Section MISTRAL 2 — 19 agents, sans ordre       │
│                                                          │       à pied · 180 m · ~2 min (la plus proche libre)  │
│                                                          │ [Autre unité  U]   [Toute la compagnie  T]            │
│                                                          │ Ce qui va se passer : la section MISTRAL 2 part à pied│
│                                                          │ et barre la rue de Rivoli d'une façade à l'autre.     │
│                                                          │ Personne ne passe.                                    │
│                                                          │ [ Donner l'ordre  ⏎ ]          [ ‹ Retour  Échap ]    │
│                                                          │ ↑↓ autre action · ←→ autre rue · U autre unité        │
└──────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────┘
```
(the bottom intention bar is hidden while a card is open; the card title carries the intention)

- « ‹ 1 / 7 › » = this is the 1st of 7 candidate places for the intention (←/→ or a click on ‹ › go to the
  previous/next one). When several repères are stacked under a click (a crowd standing on a street), the header shows
  them as small tabs (« Rue Royale | Foule ») and ←/→ visits them first.
- Lines show their explanation on PC. A coercive line (allowed, but before the last sommation) shows « ⚖ » on its
  right; a line the law does not allow yet shows « 🔒 » and its missing steps (« sommations 0/3 + autoriser le gaz »).
- The hint line (« ↑↓ autre action · ←→ autre rue · U autre unité ») is shown only when the last input was the
  keyboard. There is no footer: « ‹ Retour » brings back « À traiter » and « Mes unités ».
- « Toute la compagnie » is named after what T really selects for this player: « Toute la compagnie » (commandant,
  commissaire), « Toute la section » (chef de section), « Tout le groupe » (chef de groupe).
- The intention's default line is **always one of the six visible lines** (if it would only be in « Autres », it
  replaces line 6), so pressing a letter then Entrée never sends something that is not on screen.
- Controls S1: card 7 lines + ‹ › + « Autre unité » + « Toute la compagnie » + « Donner l'ordre » + « ‹ Retour » =
  **13**, + top 3 + map 4 = **20**. Choices offered: **6 + Autres**.

844×390 (right sheet 380 px, map 464 px; rows 40 px; only the highlighted row shows its explanation):
```
┌────────────────────────────────────────────┬─────────────────────────────────────┐
│ [✕] 15 h 30   [⚖ Sommations 0/3]      [⏱]  │ ⛔ RUE DE RIVOLI           ‹ ›  [✕] │ 30
├────────────────────────────────────────────┤ ▶ ⛔ Barrer la rue                    │
│                                            │   Personne ne passe, deux sens.     │
│   map 464 px, auto-panned on the street;   │   🚶 Barrer la rue, passants admis  │ 40 each
│   preview: red bar + arrow « 2 min »       │   🚪 Barrage filtrant                │
│                                            │   🚧 Fermer aux voitures             │
│                                            │   ═  Tenir une ligne ici             │
│                                            │   ➜  Y aller                         │
│                                            │   ⋯  Autres ordres ici…              │
│                                            │ Qui : MISTRAL 2 · 2 min [▸] [Donner l'ordre]│ 44
└────────────────────────────────────────────┴─────────────────────────────────────┘
```
Controls: 7 lines + ‹ › + ✕ + Qui (opens the list) + Donner l'ordre = **11**, + top 3. Height check: 30 + 7 × 40 +
18 (explanation of the highlighted row) + 44 = 372 px ≤ 390 px. A tap on a line highlights and
previews it; a second tap on the same line or « Donner l'ordre » sends.

### 2.3 The cards (what each repère proposes)

At most 6 lines + « 0 ⋯ Autres ordres ici… ». Line 1 is the default unless the intention says otherwise (bold).
Lines not allowed to this player (scope) are not shown; allowed but legally locked lines show « 🔒 ».
« Autres ordres ici… » opens the complete list of verbs that make sense for that repère (each with its explanation),
as a list in the same card (↑↓, digits, Échap back).

| Repère | Header | Lines 1–6 | « Autres ordres ici… » |
|---|---|---|---|
| **rue** | « RUE DE RIVOLI » · « à 120 m de la foule » · who holds it | **1 « Barrer la rue »** · 2 « Barrer la rue, passants admis » · 3 « Barrage filtrant » · 4 « Fermer aux voitures (barrières) » *(only `canTraffic`)* · 5 « Tenir une ligne ici » · 6 « Y aller » | « Tracer la ligne moi-même » · « Avancer en formation jusqu'ici » · « Y aller en véhicules » · « Se replier ici » · « Pousser un véhicule qui bloque (blindé Centaure) » · « Fermer le quartier aux voitures » · « Rouvrir à la circulation » *(if closed)* |
| **foule** | « TÊTE DE CORTÈGE · ~300 personnes · tension montante » + « Sommations : 0 sur 3 — gaz et charge pas encore permis » | **1 « Encercler (nasse) »** — « Chaque rue autour de la foule est tenue par une unité. » · 2 « Contenir : ligne face à la foule » · 3 « Repousser la foule » ⚖ · 4 « Disperser au gaz lacrymogène » 🔒 · 5 « Charger » 🔒 · 6 « Faire les sommations » *(while < 3 and `canSommation`; else « Bond en avant (20 à 40 m) » ⚖)* | « Bond en avant (20 à 40 m) » · « Encercler en cercle serré » · « Interpeller dans la foule » · « Avancer en formation jusqu'ici » · « Se protéger (tortue) » · « Faire la sommation suivante seulement » |
| **nasse** (closed kettle) | « NASSE FERMÉE — place de la République · ~120 personnes » | **1 « Ouvrir une sortie filtrée »** — « La plus large sortie s'ouvre : les gens sortent un par un. » · 2 « Repousser la foule » · 3 « Disperser au gaz lacrymogène » · 4 « Interpeller dans la foule » | same as foule |
| **incident** | kind (`INCIDENT_KIND_LABELS`), place, « personne n'y va » / « confié à NEPTUNE 1 », advice (`MEANS_ADVICE`) | one line per means in `MEANS_FOR` order, as a sentence with the ETA: « Envoyer les pompiers » · « Envoyer le canon à eau NEPTUNE 1 (2 min) » · « Envoyer MISTRAL 3 (la plus proche, 1 min) » · « Interpeller avec la BRAV-M (1 min) » · « Dégager avec le Centaure » · « Envoyer le SAMU »; then « Retirer l'affectation » *(if assigned)* / « Annuler la demande de secours » *(if a call exists)* | « Confier à une autre unité… » (opens the Qui list) · « Protéger les secours » · « Centrer la carte » |
| **unite** (mine) | « Section MISTRAL 1 — 19/19 agents · moral bon · munitions 41 » + « Ce qu'elle fait : Barre la rue Royale · en place depuis 3 min » + « ⚠ Moins de 60 % d'agents valides : relève conseillée. » *(if so)* | **1 « L'envoyer ailleurs… »** (fixes Qui, then OÙ) · 2 « Tenir sa position » · 3 « Arrêter l'action en cours » · 4 « Laisser agir seule » · 5 « Monter dans les véhicules » / « Descendre des véhicules » · 6 « Rentrer au commissariat » *(unit with a home station, P5)* else « Se protéger (tortue) » | « Se protéger (tortue) » · « Se replier… » · « Avancer en formation… » · « Protéger une autre unité… » · « Escorter une autre unité… » · « Suivre une autre unité… » · « Rentrer au commissariat » *(own company → its base)* · « Centrer la carte » |
| **cible** (not mine, or rescue vehicle) | name, what it does, « pas sous vos ordres » | **1 « La protéger »** · 2 « L'escorter » · 3 « La suivre » (Qui proposed among mine) | — |
| **vous** | « VOUS — Commandant Carlier » | **1 « Suivez-moi à pied »** — « Toute la compagnie descend et vous suit à pied. » · 2 « Suivez-moi en véhicules » — « Toute la compagnie remonte et suit votre véhicule. » · 3 « Centrer sur moi » | — |
| **point** | « Ici : près de la rue Saint-Honoré » · distance from Qui | **1 « Y aller »** — « À pied ; en véhicules au-delà de 250 m. » · 2 « Avancer en formation jusqu'ici » · 3 « Tenir une ligne ici » · 4 « Se replier ici » · 5 « Pompiers ici » · 6 « SAMU ici » | « Y aller en véhicules » · « Tracer la ligne moi-même » · « Bond en avant jusqu'ici » · « Charger jusqu'ici » · « Disperser au gaz ici » · « Encercler en cercle serré ici » · « Interpeller ici » · « Pousser un véhicule qui bloque (blindé Centaure) » · « Fermer le quartier aux voitures (100 m) » |
| **bloqueur** | « UN VÉHICULE BLOQUE VOTRE COLONNE — rue X » | **1 « Envoyer le blindé Centaure le pousser »** | — |
| **metro** | « STATION CONCORDE — ouverte · 2 arrivées/min » | 1 « Fermer la station » / « Rouvrir la station » · 2 « Filtrer la sortie » / « Lever le filtrage » (held by Qui) | — |
| **fermeture** | « RUE DE RIVOLI — fermée aux voitures · tenue par MISTRAL 3 » / « barrières seules » | 1 « Rouvrir à la circulation » | « Tout rouvrir » |
| **proposition** | plain title (§6.3) + « L'adjoint propose » | **1 « Accepter »** (P) · 2 « Plus tard » (Maj+P) | — |
| **commissariat** | see §7.3 | see §7.3 | see §7.3 |

Rules the card builder applies (pure, `intents.ts`):
- « Y aller » = `colonne` (walk in file; auto-vehicles beyond 250 m), **except** within 60 m of a crowd = `avancer`
  (formation). « Y aller en véhicules » = `faire_mouvement`. « Avancer en formation jusqu'ici » = `avancer`.
- « Tenir une ligne ici » = `ligne` with automatic geometry (`autoLine.ts`); « Contenir : ligne face à la foule »
  = the same, placed between the Qui unit and the crowd. « Tracer la ligne moi-même » = `ligne` with two designated
  ends (two clicks or Entrée, move, Entrée; no drag).
- « Encercler (nasse) » = today's helper `proposeNasse` → `acceptNasse`; « Encercler en cercle serré » = verb
  `encercler` at the default radius (tap = today's 18 m).
- « Barrer la rue, passants admis » = `couper_circulation` with targetId −2 (today's B option); line 1 = targetId 0.
- « Fermer aux voitures (barrières) » = `FieldActions.closeRoad`; its Qui line reads « Personne : barrières seules »
  (U adds a unit to hold it, as today's selected unit does).
- Unit and vehicle names that are jargon are explained once in the line's explanation (the explanation is the second
  line under the label): « la BRAV-M : policiers à moto, rapides pour interpeller », « le Centaure : blindé qui pousse
  les véhicules et les barricades », « le canon à eau NEPTUNE 1 : camion qui arrose la foule ». No line label uses an
  unexplained abbreviation (« LBD », « VL », « TV » alone): a station car is « TV 75-19 — voiture de police secours ».
- « Tenir » (`tenir`, immediate: the unit holds where it stands) is offered only on the unit card (« Tenir sa
  position »), never on a point, where it would not do what its label says.

Intentions (first repère and default line):

| Intention (key) | Repères ←/→ cycle through (ranked) | First repère | Default line |
|---|---|---|---|
| Envoyer (E) | À traiter items, crowds, then my units' current targets; Maj+arrows for any point | the selected unit's target, else the main crowd | « Y aller » (point / rue), « L'envoyer ailleurs… » (my unit) |
| Bloquer une rue (B) | exit streets of every crowd: unheld first (ahead of the march first), then held ones; if no crowd, the named street under the visée | nearest unheld exit of the main crowd | « Barrer la rue » |
| Encercler (nasse) (N) | crowds by size × tension | crowd nearest to the visée | « Encercler (nasse) » / « Ouvrir une sortie filtrée » |
| Disperser (D) | crowds by size × tension | biggest/most tense crowd | « Repousser la foule » (the least forceful allowed line) |
| Interpeller (I) | « Suspect à interpeller » / « Pillage en cours » incidents, then crowds | most urgent suspect | « Interpeller avec la BRAV-M » (else nearest group) |
| Secours (S) | fire and injury incidents, then a free point | most urgent fire / injury | first rescue means of `MEANS_FOR`; on a point « Pompiers ici » |

**Sticky intention** (only « Bloquer une rue », « Secours » and « Interpeller », the intentions one repeats): after
a send, the intention stays active and the visée jumps to the next candidate (next unheld street for B, next fire or
injured for S, next suspect for I); the card header then reads « Rue suivante (2 / 7) — Entrée : la bloquer aussi ·
Échap : terminer ». Blocking four streets = B, Entrée, Entrée, Entrée, Entrée (each Entrée at least 0.6 s after the
previous send). « Envoyer », « Encercler » and « Disperser » are not sticky: after the send the column returns to S0.
Échap ends the intention (back to S0).

### 2.4 S2 — choosing who (optional)

Default = the game's choice (§7.2.1), always on the « Qui » line with strength, activity, mode and time.
- **U** / « Autre unité »: next candidate (Maj+U previous); the preview and the sentence follow.
- **T** / « Toute la compagnie » (« Toute la section », « Tout le groupe » by scope): Qui = the player's whole command
  (the company node for the commandant; his section / group node otherwise); T again = back to the proposal.
- **Maj+Entrée** or a click on the Qui name: the list (modal, over the card):

1280×800 (inside the right column) and 844×390 (replaces the sheet content, « ‹ Retour »):
```
│ QUI ENVOYER ?                          les plus adaptées d'abord │
│ ▶ 1 ☐ Section MISTRAL 2   sans ordre · 180 m · 2 min   ✓ proposée │
│   2 ☐ Section MISTRAL 1   sans ordre · 260 m · 3 min             │
│   3 ☐ Groupe MISTRAL 3 ALFA  tient une ligne · 90 m (la quittera) │
│   4 ☐ BRAV-M NEPTUNE 1    sans ordre · 400 m · 1 min              │
│   5 ☐ Toute la compagnie MISTRAL · 56 agents                      │
│   6 ☐ Renfort : TV 75-19 (commissariat du 9e) · prête · 4 min     │
│   ⋯ Voir toutes mes unités…                                       │
│ [ Valider  Entrée ]          Espace : cocher plusieurs            │
```
Arrows move in the list, Espace ticks several, Entrée validates; trackpad/touch: click a row = choose and close,
tick boxes = several then « Valider ». Controls: ≤ 7 rows + Valider = **8**. Clicking one of my units on the map
while a card is open re-targets the card to that unit (its own card); Maj+click adds it to Qui.

### 2.5 S3 — legal confirmation (only for ⚖ / 🔒 lines; see §7.1)

```
│ ☁ DISPERSER AU GAZ — Tête de cortège                             │
│ Il faut d'abord, dans l'ordre :                                   │
│  ① les 3 sommations, par vous au mégaphone  (~1 min 30)           │
│  ② autoriser le gaz lacrymogène et le canon à eau                 │
│  ③ puis la section MISTRAL 2 lance le gaz ici                     │
│     (vent de sud-ouest : le nuage ira vers la rue Royale)         │
│ [ Faire les étapes dans l'ordre  ⏎ ]          [ ‹ Retour  Échap ]  │
```
For a ⚖ line (allowed before the last sommation): « L'ordre part avant la dernière sommation : vous en répondrez. »
+ [« Donner l'ordre quand même ⏎ »] [« Faire d'abord les sommations »] [« ‹ Retour Échap »]. Controls: **2–3**.
Phone: same text in the sheet, buttons 48 px.

**S3 checks before offering the chain (never a chain that fails at step ①).** S3 calls
`law.advisor.sommationRefusal(player)` (pure, no side effect) when it opens:
- empty → step ① reads « les 3 sommations, par vous au mégaphone »;
- not empty and the company has an officer who can do it (`police.command.requestSommation` exists and a company is
  engaged, as today's « salle » path) → step ① reads « les 3 sommations, par l'officier de la compagnie sur place »
  and the chain uses `requestSommation`;
- otherwise → no « Faire les étapes » button; S3 shows the reason in one plain line with what to do, e.g.
  « Vous devez porter l'écharpe tricolore pour faire les sommations. » or « Seul le commissaire ou l'officier ceint
  peut faire les sommations. », and only « ‹ Retour ».
Same check for authorisation: without `canAuthorize`, step ② reads « demander l'autorisation du gaz (radio) » and the
chain stops after it with the row « En attente de l'autorisation du gaz ». A chef de groupe sees « Au-dessus de votre
plafond — [Demander plus de force] » (§7.1).

### 2.6 S4 — sent

For 2 s the card header shows, in green:
```
│ ✓ ORDRE DONNÉ — Section MISTRAL 2 → Barrer la rue de Rivoli       │
│ à pied · arrivée ~2 min · suivez-la dans « Mes unités »            │
│ [Annuler l'ordre  X]          B : rue suivante · Échap : terminer   │
```
« Annuler l'ordre » (5 s, key X) issues `cesser` to the same squads (an ordinary order, nothing is undone in the
simulation); it is shown only for unit orders. The radio phrase and the map tag appear at the same moment. No
success toast. Sticky intention → the visée moves to the next candidate; otherwise the column returns to S0 and the
new row in « Mes unités » flashes yellow for 3 s.

### 2.7 S5 — following the orders (« Mes unités », right column at rest; phone « Suivi » sheet)

```
│ MES UNITÉS                                                     U │
│ ▾ Section MISTRAL 2  19/19  Barre la rue de Rivoli                │
│     en route à pied · 120 m · ~1 min  ▓▓▓▓▓▓░░░                    │
│ ▸ Section MISTRAL 1  19/19  Encercle la tête de cortège           │
│     5 rues tenues sur 7                                           │
│ ▸ Section MISTRAL 3  15/19 ⚠ relève conseillée · Sans ordre        │
│ ▸ TV 75-19           Rentre au commissariat du 9e · ~2 min         │
│ ▸ Dispersion au gaz  sommation 2 sur 3 dans 25 s      [Annuler]    │
```
Row status vocabulary (from the order, `core.onConvoyStage` and the « Ordres en cours » track data): « embarque
(5/7 à bord) », « en route en véhicules · ~N min », « en route à pied · ~N min », « en place », « en place depuis
N min », « bloquée : chemin coupé » (orange), « Sans ordre ». Click a row = the unit's card (and the map flies to
it); → / ← unfold / fold groups. Count = the rows (already in S0).

### 2.8 « Plus… » (O) and « Cadre légal » (L) — second level

« Plus… » (right column / phone sheet; ↑↓, digits, Entrée, Échap):
```
│ PLUS…                                                             │
│ 1 ☰ Tous les ordres          les 27 ordres, expliqués, par famille │
│ 2 ⚠ Tous les incidents et secours                                  │
│ 3 🚧 Circulation et métro                                           │
│ 4 🏛 Commissariats                                         C        │
│ 5 📻 Journal radio                                         J        │
│ 6 ☷ Affichage de la carte    couches et légende                    │
│ 7 ◉ Vue drone                (only when a drone is engaged)        │
│ 8 ? Aide clavier                                           H        │
```
- « Tous les ordres »: today's verb grid as a single-column filterable list (a search field « Chercher un ordre » at
  the top: typing filters), groups « Se placer », « Se déplacer », « Face à la foule », « Intervenir », « Fin
  d'action », each verb with its `plain` label and `explain`; buttons keep `data-id="verb-<type>"`. Choosing a verb =
  verb-first flow: the card opens at the visée with that single line highlighted and Qui proposed; Entrée sends
  (line verbs ask two ends; immediate verbs send at once to Qui).
- « Tous les incidents et secours »: today's `panelIncidents` list (manifestations, calls with ✕ « Annuler la
  demande », incidents with means, « Localiser », « Retirer l'affectation »), unchanged inside.
- « Circulation et métro »: today's `panelTraffic` content, plus « Fermer un quartier aux voitures : 100 m / 200 m /
  400 m » (three lines, no drag) and « Tout rouvrir ».
- « Commissariats »: the P5 list (`panelCommissariats`), §7.3.
- « Journal radio »: today's `radioLog`.
- « Affichage de la carte »: today's 9 layer toggles + « Commissariats » (P5) + the legend in plain words.
Menu entries keep `data-id="tab-incidents"`, `tab-circulation`, `tab-journal` for the existing e2e scripts.
Controls: ≤ 8 + Fermer.

« Cadre légal » (L or a click on the chip) — wireframe and rules in §7.1. Controls: ≤ 6.

### 2.9 S6 — read-only map (executant: CRS, gardien, BRAV-M rider…; scope `lecture`)

1280×800:
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CARTE — CRS, lecture seule     ⚖ Sommations 0/3 · Force : mains nues       [✕ Fermer  Tab]    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ORDRE DU COMMANDANT : Tenir la ligne — Avenue de la République · 235 m ↗                      │
│ Donné il y a 1 min à votre groupe MISTRAL 1 ALFA. Suivez : Brigadier-chef Camara (5 m).        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│   map framed on « me + my destination »; my group's route drawn thick in yellow; the          │
│   destination pulses with the label « ICI — Avenue de la République »; my group and my chief   │
│   highlighted; other units dimmed to 50 %; no crowd-exit arrows, no order previews.            │
│                                                                    [+] [−] [◎ Moi G]          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
No intention bar, no card actions, the chip is a read-out. A click on a repère shows a one-line info tooltip only.
C still opens the stations read-only (§7.3). Controls: Fermer, +, −, Moi = **4** (phone: ✕ and ◎, pinch zoom = 2).
Phone 844×390: the banner is two lines (« Ordre : Tenir la ligne · Av. de la République · 235 m ↗ » / « Suivez
Camara · 5 m »), the map below it.

The **chef de groupe** (scope `unite`) gets the full commander design limited to his units: the chip reads « ⚖
Force : mains nues (fixée par le commandant) », the « Cadre légal » panel offers « Mes ordres jusqu'à : … » and
« Demander plus de force »; metro lines and station dispatch are not shown.

---------------------------------------------------------------------------------------------------------------------

## 3. Mapping today → tomorrow (nothing is lost)

### 3.1 The 26 verbs (+ `retour_poste`). Type, force, coercive flag, simulation effect: unchanged

New UI fields on each verb in `orders.ts` (C1): `plain` (card line), `tag` (map / unit chip / rows, upper-case,
≤ 20 characters, no abbreviation), `explain` (one line), `doing` (row text, « barre la rue »). `short` stays for
compatibility and is no longer displayed.

| type | Today (button) | Tomorrow `plain` | `tag` | `explain` | Where it lives |
|---|---|---|---|---|---|
| tenir | Tenir | « Tenir sa position » | TIENT | « Reste sur place, face à la menace. » | unit card 2; wheel Plus |
| ligne | Ligne | « Tenir une ligne ici » / « Contenir : ligne face à la foule » / « Tracer la ligne moi-même » | EN LIGNE | « Ligne en travers, boucliers levés ; le jeu l'oriente et la dimensionne. » | street 5, crowd 2, point 3 (auto geometry); trace in Autres; wheel 4; right-drag (expert) |
| colonne | En file | « Y aller » | VA À PIED | « Rejoint le point à pied, en file ; en véhicules au-delà de 250 m. » | point 1, street 6 (default of E) |
| couper_circulation | Barrer | « Barrer la rue » | BARRE | « Personne ne passe, dans les deux sens. » | street 1 (default of B); nasse helper |
| couper_circulation, targetId −2 | « Passants : laissés passer » (B toggle) | « Barrer la rue, passants admis » | BARRE (PASSANTS) | « Les manifestants ne passent pas, les passants oui. » | street 2 (explicit line, no hidden toggle) |
| filtrer | Filtrer | « Barrage filtrant » / « Ouvrir une sortie filtrée » | FILTRE | « Une porte : les gens sortent un par un. » | street 3; kettle 1 (`openFilteredExit`) |
| tortue | Tortue | « Se protéger (tortue) » | TORTUE | « Boucliers devant et au-dessus contre les jets ; aucun tir possible. » | unit 6 (no station) / Autres; crowd Autres; wheel Plus |
| avancer | Avancer / En avant | « Avancer en formation jusqu'ici » (and « Y aller » near a crowd) | AVANCE | « Avance en ligne, prête au contact. » | point 2; Autres; wheel 3; right-click (expert) |
| bond_offensif | Bond | « Bond en avant (20 à 40 m) » | BOND | « Avance vite puis s'arrête net, sans chercher le contact. » | crowd 6/Autres (D); wheel Plus |
| charge | Charge | « Charger » | CHARGE | « Course jusqu'au point, arrêt au sifflet (bâton). » | crowd 5 (D); wheel Plus |
| refoulement | Refouler | « Repousser la foule » | REPOUSSE | « Par bonds de 50 m, en lui laissant une sortie devant elle. » | crowd 3 (default of D) |
| suivre_pied | À pied | « Suivez-moi à pied » | ME SUIT À PIED | « Toute votre unité descend et vous suit à pied. » | field ORDRES block, wheel 1; « VOUS » card 1; Tous les ordres |
| avec_moi | En colonne | « Suivez-moi en véhicules » | ME SUIT EN VÉHICULE | « Toute votre unité remonte et suit votre véhicule. » | field block, wheel 2; « VOUS » card 2; Tous les ordres |
| faire_mouvement | Véhicules | « Y aller en véhicules » | VA EN VÉHICULE | « Embarque, deux-tons, débarque sur place. » | street/point Autres; default for a station dispatch (P5) |
| repli | Repli | « Se replier ici » | SE REPLIE | « Recule jusqu'au point, face à la foule. » | point 4; unit Autres; wheel Plus |
| encercler | Nasse | « Encercler en cercle serré » | ENCERCLE | « Cercle autour de la foule, sortie laissée à l'opposé de vos unités. » | crowd/point Autres (tap = default radius; drag = expert) |
| (nasse helper) | « Fermer la nasse » (N) + Valider | « Encercler (nasse) » | each unit: BARRE | « Chaque rue autour de la foule est tenue par une unité. » | crowd 1 (default of N) |
| disperser_gaz | Gaz | « Disperser au gaz lacrymogène » | GAZ | « Vérifiez le vent : sa flèche est dessinée sur l'aperçu. » | crowd 4 (D); wheel Plus |
| interpeller | Interpeller | « Interpeller avec la BRAV-M » / « Interpeller dans la foule » / « Interpeller ici » | INTERPELLE | « Arrête l'auteur de faits constatés. » | incident lines (I); crowd/point Autres; wheel 5 |
| degager_barricade | Dégager | « Dégager avec le Centaure » / « Dégager avec MISTRAL 2 » | DÉGAGE | « Une unité ou le Centaure dégage la rue. » | barricade incident card |
| degager_obstacle | Obstacle | « Pousser un véhicule qui bloque (blindé Centaure) » / « Envoyer le blindé Centaure le pousser » | POUSSE UN VÉHICULE | « Le blindé Centaure pousse le véhicule hors de la chaussée. » | bloqueur card 1; incidents « Automobiliste bloqué »/« Secours bloqués »; street/point Autres; wheel 6; HUD line « Un véhicule vous bloque » |
| proteger | Protéger | « La protéger » / « Protéger une autre unité… » / « Protéger les secours » | PROTÈGE | « Se place pour la couvrir. » | cible card 1; unit Autres; incident Autres |
| escorter | Escorter | « L'escorter » / « Escorter une autre unité… » | ESCORTE | « L'accompagne pendant son trajet. » | cible card 2; unit Autres |
| suivre | Suivre | « La suivre » / « Suivre une autre unité… » | SUIT | « Marche derrière elle. » | cible card 3; unit Autres |
| embarquer | Embarquer | « Monter dans les véhicules » | MONTE | « L'unité remonte dans ses véhicules. » | unit 5 (on foot) |
| debarquer | Débarquer | « Descendre des véhicules » | DESCEND | « À 50 m au moins de la foule. » | unit 5 (aboard) |
| cesser | Cesser | « Arrêter l'action en cours » | ARRÊTE | « L'unité s'arrête et attend. » | unit 3; « Annuler l'ordre » (S4); wheel Plus |
| libre | Libre / INITIATIVE | « Laisser agir seule » | SANS ORDRE | « Plus d'ordre : l'unité réagit d'elle-même. » | unit 4; wheel Plus; chip « INITIATIVE »/« LIBRE » → « SANS ORDRE » |
| retour_poste (P5) | — | « Rentrer au commissariat » | RENTRE | « Retour sans deux-tons ; au repos puis de nouveau prête. » | unit 6 (station unit); unit Autres (own company → base) |

`ORDER_TAGS` in `src/ui/maps/overlay-units.ts` (the maps layer does not import `ui/command`) gets exactly the `tag`
column for every type, and its fallback becomes `''` — never `String(type).toUpperCase()` again (fixes
« COUPER_CIRCULATION »).

### 3.2 Every other control of the inventory

| Today | Tomorrow | How |
|---|---|---|
| « CARTE TACTIQUE » + scope label | « CARTE DE COMMANDEMENT »; « vue partielle : vous êtes à pied » only when partial; « CARTE — CRS, lecture seule » | top bar |
| Phase, Tension, Foule, clock | kept (Foule hidden on phone) | read-outs |
| « Vue drone » | kept, top bar when engaged; also « Plus… › Vue drone » | field key O unchanged |
| « Temps ralenti » | « ⏱ Ralentir » / « ⏱ Temps normal » | V |
| « Fermer » | kept | Tab; Échap at S0 |
| hand tool, « Cadre de sélection » | removed from screen | pan = drag / two-finger scroll; box = Maj+drag (mouse, optional) adds to Qui |
| units drawer icon (phone) | merged | « ☰ Suivi » sheet |
| « Couches de la carte » + 9 toggles + legend | second level | « Plus… › Affichage de la carte » |
| zoom +/−, recentre, wind rose, scale | kept, moved above the bottom bar, never under subtitles | = − ; « ◎ Moi » G |
| 3-line key legend | removed | key letters printed on buttons; one hint line in the card; help H |
| « Tout » | merged | « Toute la compagnie » (T) in Qui — the company node itself (fixes « 1 = compagnie » confusion) |
| « Sélection multiple » | merged | ticks in the Qui list (Espace); Maj+click on units |
| unit rows (tree), click, double-click, hover | kept, folded | « Mes unités »; click = unit card; double-click unit on map = its section (kept); hover highlights |
| unit details card, « Centrer la carte », « Tout désélectionner » | merged | unit card header; « Centrer la carte » in Autres; deselect = Échap |
| tabs Ordres / Incidents / Circulation / Journal | removed | cards + « Plus… » entries (data-ids kept) |
| CADRE LÉGAL block, « Sommation suivante », force 0–4, « Plafond de mes ordres », « Demander l'autorisation » | chip + « Cadre légal » panel + in-card legal steps | L; §7.1 |
| 26 verb buttons | cards, Autres, « Tous les ordres » | §3.1 |
| « Passants : bloqués / laissés passer » [B] | two explicit lines of the street card | B is now « Bloquer une rue » |
| NASSE block (Fermer la nasse, Valider, Annuler, « Issues : 2 tenues sur 22 ») | crowd card line 1, its preview (each unit → its street), header « 22 rues partent de cette place : 2 sont tenues » | N, Entrée; P / Maj+P still accept / refuse a pending proposal |
| « SECOURS » Pompiers → / SAMU →; Incidents « Appeler les pompiers / le SAMU » | merged | S intention; incident cards; point card 5/6 |
| incident rows, urgency chips, means buttons, « Localiser », « Retirer l'affectation », ✕ calls | kept | « À traiter » (top 3), incident cards, « Plus… › Tous les incidents et secours » (full panel unchanged) |
| drag an incident onto a unit | kept (expert) | « Confier à une autre unité… » does it without drag |
| Manifestations list | merged | crowds are repères; full list in « Tous les incidents » |
| Circulation « Fermer une rue » (+ « Terminer ») | merged | street line 4; sticky B closes several streets, no « Terminer » |
| « Fermer un périmètre » (drag radius) | merged | point Autres « Fermer le quartier aux voitures (100 m) »; « Circulation et métro » 100/200/400 m |
| « Tout rouvrir », closure « Rouvrir » | kept | closure card; « Circulation et métro » |
| metro rows (Fermer/Rouvrir, Filtrer/Lever) | contextual + second level | metro card; « Circulation et métro » |
| hint banner `ct-hint` | removed | the card (title, explanation, sentence, Donner l'ordre, Retour) |
| kettle banner « Ouvrir une issue filtrée » [F] | merged | « À traiter » item « Nasse fermée — ouvrir une sortie filtrée ? » + kettle card line 1; F opens that card |
| metro / closure popovers (`tacticalPop.ts`) | merged | metro / closure cards |
| quick wheel « ORDRE RAPIDE » (11 sectors + Passants) | removed | every sector is a card line (Avancer → point 2, Bond/Charge → crowd, Nasse → crowd 1, Cesser/Tenir → unit, Ligne → street/point, Me suivre ×2 → « VOUS », Barrer ×2 → street 1/2); long-press = tap |
| toasts « … — ordre transmis » | replaced | S4 in the card; refusals stay as toasts (bottom-left, max 2) |
| foyer tap toast | merged | crowd card header |
| gestures (13) | simplified | tap/click = card or send a line; Maj-tap = add to Qui; double-tap unit = section; long-press = tap; drag = pan; Maj-drag = box; right-click = « Avancer en formation jusqu'ici » for Qui (expert); right-drag = line (expert); incident drag kept; pinch / Ctrl+wheel = zoom; **two-finger scroll = pan** (new) |
| keys 1–9 / Maj+1–9 (sections) | changed | digits pick card lines; units via U, T, the Qui list, Mes unités (`keyboardSections` stays exported for `nasseCandidates`) |
| U / Maj+U | kept, extended | card open: next / previous Qui candidate; at rest: jump to my next unit (most recent order first) and open its card |
| E (quick wheel) | changed | « Envoyer » |
| L (order palette) | changed | « Cadre légal » (the list is « Plus… › Tous les ordres », O then 1) |
| N, F, B, P, Maj+P, Échap/⌫, = −, Tab | kept / re-meant | N Encercler, F sortie filtrée (opens the kettle card), B Bloquer, P/Maj+P unchanged, Échap back, = − zoom, Tab close |
| field chips, wheel, proposal card, mission card, radio | §6 | radio screen unchanged (« modes » team) |

---------------------------------------------------------------------------------------------------------------------

## 4. Reference tasks — sequences and action counts

Counting as in the inventory: 1 key = 1, 1 click/tap = 1, opening the map = 1, a pinch = 1, typing a place name =
« + typing ». « +n » = extra ←/→ jumps when the game's first place is not the wanted one (one jump per press; never fine
aiming); « +c » = free aiming with Maj+arrows (only needed for a place that is not a repère). The second half of T3 and
T5's chain assume the map is still open (+1 if it was closed). Commandant at Concorde. Today's counts are the
inventory's (§4). Counts re-walked by the player's advocate; corrected cells are marked « (corr.) ».

| Task | Keyboard tomorrow | K | Trackpad tomorrow | P | Phone tomorrow | T | Today K / P / T |
|---|---|---|---|---|---|---|---|
| **T1** block a street with a section, choose passers-by | Tab · B (visée on the best unheld exit street, Qui = nearest free section) · [→ ×n other street] · 2 (« passants admis ») · Entrée. Passers-by blocked: Tab · B · Entrée | **4** (+n); 3 | open · click the street · click « Barrer la rue, passants admis » (or « Barrer la rue ») | **3** | Carte · tap street · tap line 2 · « Donner l'ordre » (or tap line 2 again) | **4** | 8+c (+U×n) / 5 / 7 |
| **T2** whole company in vehicles to a distant point | Tab · R · type « bastille » · Entrée (visée there, point card, line 1 « Y aller » says « en véhicules · 2,3 km · ~6 min ») · T (Toute la compagnie) · Entrée | **5** + typing | open · pinch out · click the place (it snaps to a street or square; « Y aller » is line 6 of a street card, line 1 of a point card) · click « Toute la compagnie » · click « Y aller » | **5** | Carte · pinch · tap the place · tap « Qui ▸ » · tap « Toute la compagnie » (the list closes) · « Donner l'ordre » | **6** (corr.: the phone has no T button) | ≈17+c / 4 + zoom / — |
| **T3** encircle a crowd, then open a filtered exit | Tab · N · Entrée — later: Espace (« Nasse fermée — ouvrir une sortie filtrée ? ») or F · Entrée | **3 + 2** | open · click crowd · click « Encercler (nasse) » — later: click the « À traiter » row (or the kettle) · click « Ouvrir une sortie filtrée » | **3 + 2** | Carte · tap crowd · « Donner l'ordre » — later: tap the kettle · « Donner l'ordre » | **3 + 2** | 4+c (+F) / 4–5 incl. drag or scroll / — |
| **T4** have a rioter arrested | Tab · I (visée on the most urgent suspect, line « Interpeller avec la BRAV-M ») · Entrée | **3** | open · click the suspect icon · click « Interpeller avec la BRAV-M (1 min) » | **3** | Carte · tap the suspect · « Donner l'ordre » | **3** | ≈19+c / 4 / — |
| **T5** disperse: sommations, then gas | Tab · D · 4 (« Disperser au gaz lacrymogène » 🔒) · Entrée (S3 lists ① 3 sommations ② autoriser le gaz ③ gaz ici) · Entrée | **5** | open · click crowd · click « Disperser au gaz lacrymogène » · click « Faire les étapes dans l'ordre » | **4** | Carte · tap crowd · tap line 4 · « Donner l'ordre » · « Faire les étapes dans l'ordre » | **5** | ≈32+c / 7–8 / — |
| (T5 by hand, map open) | L · 1 (« Faire les sommations », the 3 in a row) · 5 (« Autoriser : gaz lacrymogène… ») · Échap · D · 4 · Entrée | **7** (corr.: line 1 already chains the 3) | chip · « Faire les sommations » · « Autoriser : gaz… » · ‹ Retour · crowd · line 4 | **6** | | | |
| **T6** everyone follows me, on foot / in vehicles | field: F then 1 (« Suivez-moi à pied ») / F then 2 (« Suivez-moi en véhicules ») | **2** | field: click « Suivez-moi à pied » / « Suivez-moi en véhicules » (ORDRES block) | **1** | the chip shows the order that fits (« Suivez-moi à pied » on foot, « Suivez-moi en véhicules » when driving or aboard); the other one: « Ordres » · sector 2 | **1** (2) | 2 / 1 / 1 |
| **T7** send firefighters to a fire | Tab · S (visée on the fire, « Envoyer les pompiers ») · Entrée (or Tab · Espace · Entrée when it is the top « À traiter ») | **3** | open · click the fire · click « Envoyer les pompiers ». Field, at my position: « Secours ici » · « Pompiers ici » (2) | **3** | Carte · tap fire · « Donner l'ordre » | **3** | ≈18+c / 2–3 / — |
| **T8** close a street to traffic | Tab · B · [→ ×n, or Maj+arrows +c for a street far from any crowd] · 4 · Entrée (B stays active: next street = → · 4 · Entrée) | **4** (+n or +c) | open · click the street · click « Fermer aux voitures (barrières) » | **3** | Carte · tap street · tap line 4 · « Donner l'ordre » | **4** | ≈10+c / 4 / — |
| **T9** dispatch a police-station unit to a point, then send it back | Tab · C (visée on the nearest station with ready units, its card open; line 1 = best ready unit) · Entrée (« Envoyer TV 75-19 »: Qui fixed, card « OÙ L'ENVOYER ? ») · [→ ×n or R + typing + Entrée] · Entrée (sends, engages). **Back**: Tab · U (it comes first: most recent order) · 6 (« Rentrer au commissariat ») · Entrée | **4** (+n) / **4** | open · [pinch if the station is off-screen] · click the station · click « Envoyer TV 75-19 — prête » · click the destination · click « Y aller ». **Back**: open · click the unit (map or « Mes unités ») · click « Rentrer au commissariat » | **5** (+1) / **3** | Carte · tap station · tap « Envoyer TV 75-19 » · tap destination · « Donner l'ordre ». Back: Carte · « ☰ Suivi » · tap its row · tap line 6 · « Donner l'ordre » (tapping a moving car on the map also works) | **5** / **5** (corr.) | impossible today |
| **T10** as a plain CRS: what did the chief order, where are we going | nothing to press: the HUD card's first lines are « ORDRE DU COMMANDANT » / « Tenir la ligne » / « Avenue de la République · 235 m ↗ »; Tab shows the map framed on me and the destination with the route | **0** | 0 | **0** | 0 (2 untruncated lines) | **0** | 0, but buried / truncated |

---------------------------------------------------------------------------------------------------------------------

## 5. Keyboard, trackpad and touch

### 5.1 Keyboard map of the command map (complete)

Letters are read from `KeyboardEvent.code` (physical keys, as today), and only letters that sit at the same place on
AZERTY and QWERTY are used (A, Q, Z, W, M are avoided). Digits use `Digit0–9` and `Numpad0–9` (AZERTY: no Shift
needed). The screen is registered `modal: true` (`src/ui/command/index.ts`), so the game bindings (T radio, V camera,
D/S move, G/H mask/visor, C crouch, R siren/reload, X megaphone, E interact, B/N beacons/horn, L flashlight, Espace
jump/handbrake) are already masked while it is open; the only keys read **outside** the binding table by window
listeners are O (drone feed, `src/ui/drone/index.ts`) and P / Maj+P (adjoint, `quickActions.ts`): O is fixed as
described in §2.0 (keyboard focus model), P keeps its global meaning. The e2e scenario of C6 checks that none of these
keys triggers a field action or the drone feed while the map is open. `src/input/bindings.ts` is not touched; Y stays
free (« modes » team) and no new key is read on the field HUD (the ORDRES block works through the wheel, F then a
digit), so `RESERVED_KBM` does not change.

| Key | At rest (S0) | Card open (S1) | Lists (Qui, Plus…, Autres, Cadre légal) | Mnemonic |
|---|---|---|---|---|
| ← ↑ → ↓ | visée jumps to the nearest repère in that direction (100° cone, score = distance × (1 + 2·angle)); at the edge the map scrolls one step | ↑↓: highlighted line (preview follows); ←→: previous / next candidate place (stacked repères first) | ↑↓ move | « flèches = où » |
| Maj + arrows | free visée (today's cursor, unchanged speed); the point card follows | same, the card re-targets live | — | « Maj = précis » |
| Entrée | open the card of the visée | send the highlighted line (⚖/🔒 → S3); ignored for 0.6 s after a send | validate | « Entrée = go » |
| 1–6, 0 | — | highlight a line (+ preview); 0 = « Autres ordres ici… » | pick a row | the numbers on the lines |
| Échap / ⌫ | close the map | S3/list → card → end the intention → S0 | close the list | « Échap = retour » |
| E B N D I S | intention (Envoyer, Bloquer une rue, Encercler, Disperser, Interpeller, Secours) | switch intention, same visée | — | first letters |
| U / Maj+U | jump to my next / previous unit (most recent order first) and open its card | next / previous Qui candidate | — | **U**nité |
| T | — | Qui = « Toute la compagnie » (again: back to proposal) | — | **T**out le monde |
| Maj+Entrée | — | open the Qui list | — | |
| Espace / Maj+Espace | next / previous « À traiter » item (visée + card with the best line) | same | tick (Qui list) | « ce qui m'attend » |
| L | « Cadre légal » | same | | **L**oi |
| C | visée to the nearest station with ready units (C again: next station) | same | | **C**ommissariat |
| O | « Plus… » (the drone listener ignores O on this screen) | same | | **O**rdres, **O**ptions |
| R | « Rechercher un lieu » (`searchPlaces` of `src/ui/maps/search.ts`; Entrée puts the visée there and opens the point card) | same | | **R**echercher |
| G | visée on « VOUS » + its card | same | | « **G**PS : où suis-je » |
| J | « Plus… › Journal radio » | | | **J**ournal |
| V | Ralentir / Temps normal | | | **V**itesse |
| H | help overlay (model + this table in 10 lines) | | | « **H**ein ? » |
| X | « Annuler l'ordre » during the 5 s after a send | | | ✕ |
| F | opens the closed kettle's card with « Ouvrir une sortie filtrée » highlighted | | | **F**iltrer |
| P / Maj+P | accept / postpone the adjoint's proposal or a pending nasse (global, unchanged) | | | **P**roposition |
| = / − | zoom | | | |
| Tab | close the map | | | |

Help overlay text (H), exact: « Flèches : d'un endroit à l'autre (Maj : précis) · Entrée : que faire ici / envoyer ·
E B N D I S : envoyer, bloquer, encercler, disperser, interpeller, secours · 1 à 6 ou ↑↓ : choisir · U : autre unité ·
T : toute la compagnie · Espace : à traiter · L : loi et force · C : commissariats · O : plus · R : rechercher un lieu ·
G : moi · Échap : revenir · Tab : fermer ».

Gamepad (kept working): left stick = free visée, D-pad = arrow jumps, A = Entrée, B = Échap, X = U, Y = « Plus… »,
LB/RB = previous / next « À traiter », triggers = zoom.

### 5.2 Trackpad (MacBook Air without a mouse)

- **One click per decision, nothing precise.** Repères snap within 40 px of the pointer (priority: my unit >
  incident > commissariat > metro / closure > crowd > VOUS > street (named `RoadSample` within 8 m) > point); the
  snapped repère gets a halo and its name next to the pointer (« Rue Royale », « Foule — 300 personnes »). Click =
  open its card (or re-target the open card). Clicking the map never sends an order.
- **Hover = preview, click = send.** Hovering a card line highlights it and draws its preview; leaving the card
  returns to the keyboard/default highlight; clicking the line sends it (⚖/🔒 lines open S3). Card rows 52 px, full
  column width; « Donner l'ordre », « Autre unité », « Toute la compagnie » 44 px high.
- **No drag required.** Two-finger scroll pans (`wheel` without `ctrlKey`); pinch zooms (`wheel` with `ctrlKey`, how
  macOS browsers report it); a notched mouse wheel (`deltaMode === 1`, or `deltaX === 0` and |deltaY| ≥ 50 in whole
  numbers) still zooms. « + », « − », « ◎ Moi » and « Rechercher un lieu » cover long trips.
- Line ends, nasse, perimeter: clicks only. Right-click, long-press and drag are expert aliases.

### 5.3 Touch (phone 844×390 landscape)

- Tap a repère (48 px snap) → right sheet with its card, default line highlighted and previewed. Tap a line →
  highlight + preview (a single tap never sends). « Donner l'ordre » or a second tap on the highlighted line → send.
- Drag = pan, pinch = zoom; long-press = tap. One sheet at a time; the bottom bar hides while a sheet is open; the
  map auto-pans the target into the visible part.
- Rows 40 px in cards (48 px in lists and HUD); bottom bar: 7 buttons in a flex row inside the safe area (`env(safe-area-inset-left/right)`: about 750 px usable on a notched phone), each ≥ 96 × 52 px, icon + one word at 13 px; « Donner l'ordre » ≥ 120 × 44 px.

---------------------------------------------------------------------------------------------------------------------

## 6. Field HUD, order wheel, and what an executant sees

### 6.1 Commander HUD (commandant, commissaire, chef de section, chef de groupe) — laptop

The loose chips « Secours », « À pied », « En colonne » and the « Carte tactique » button become **one titled
block** under the minimap (`quickActions.ts`, zone 'left'; ids `quick-map`, `quick-rescue`, `quick-pompiers`,
`quick-samu`, `quick-follow-foot`, `quick-follow-column`, `quick-drone` are kept):
```
┌ ORDRES ─────────────────────────────── F ┐
│ ⇡  Suivez-moi à pied           F puis 1 │   title: « Toute la compagnie descend et vous suit à pied »
│ 🚐 Suivez-moi en véhicules      F puis 2 │   title: « Toute la compagnie remonte et suit votre véhicule »
│ ✚  Secours ici                 F puis 7 │   → unfolds [🔥 Pompiers ici] [✚ SAMU ici] (at MY position)
│ ▦  Carte de commandement           Tab │
│ ◉  Vue drone                         O │   (only when a drone is engaged)
└──────────────────────────────────────────┘
  contextual, only while police.obstacle.blocked() ≠ null:
  ⛔ Un véhicule vous bloque (rue X) : [Envoyer le blindé Centaure  F puis 6]  → issue degager_obstacle at (block.x, block.z)
```
- For a chef de groupe the titles read « Votre groupe vous suit à pied / … votre véhicule »; for a commandant
  `followUnit()` is still the company (unchanged `core.callFollow`).
- **Adjoint's proposal** (card below the block): « L'ADJOINT PROPOSE » + plain title from `proposalTitle(p)`
  (§6.3) + [« Accepter  P »] [« Plus tard  Maj+P »]. The radio sentence (« QUATRE-ZÉRO débouchés… ») stays in the
  radio subtitles only. A pending nasse proposal keeps its card « FERMER LA NASSE — À VALIDER ».
- Key hints are written « F puis 1 », never « F 1 » or « F1 » (on a Mac, F1 is a function key).
- Laptop count: 4 rows (+ drone, + blocked line, + proposal). Rows are 34 px high. Order in the left zone, top to
  bottom: minimap, ORDRES block, blocked-vehicle line, adjoint's proposal, then the « modes » team's call card
  (`patrol-dispatch`, same zone 'left'). At a window height below 760 px the proposal card shrinks to one line
  (« 💬 L'adjoint propose : … [Accepter P] ») so the whole column fits without covering the radio subtitles.

### 6.2 Phone field HUD (844×390)

The block leaves the minimap: two compact chips **under** the minimap (never over it). The first one always shows
the full name of the order it gives, chosen by how the player moves: on foot → « ⇡ Suivez-moi à pied »
(`suivre_pied`); driving or aboard → « 🚐 Suivez-moi en véhicules » (`avec_moi`) — never a bare « Suivez-moi ». The
second is « ✚ Secours ici ». The other follow mode is wheel sector 2 (round « Ordres » button). Moving the chips under
the minimap changes the left-zone rectangle used by `src/ui/hud/layout.ts` (`leftZoneCenter`, `subtitlePlacement`):
C5 updates `tests/unit/ui.hud-zone-gauche.test.ts` accordingly (subtitles never over the chips). The adjoint's proposal becomes a
one-line banner at the top centre « L'adjoint propose : … [Oui] [Plus tard] »; the blocked-vehicle line becomes the
same kind of banner « Un véhicule vous bloque : [Centaure] ». The 14-control touch overlay is otherwise unchanged.

### 6.3 Plain titles of the adjoint's proposals (`adjointPlays.ts`, pure, keyed on `Proposal.key` prefixes)

`dispositif` → « Tenir les N rues qui donnent sur le parcours » · `leve:` → « Lever le barrage de X : le cortège est
passé » · `regroupe:` → « Ramener X en réserve au poste de commandement » · `halte` → « Arrêter l'emploi de la
force : le calme est revenu » · `riposte` → « Riposter au gaz à main : vos unités sont attaquées » · `appui:` →
« Envoyer X aider Y » · `canon` → « Faire tirer le canon à eau » · `centaure` → « Engager le Centaure » · `bond:` →
« Bond en avant de X » · `retour:` → « Remettre X à sa place » · `bravm:` → « Faire interpeller par la BRAV-M » ·
`sommation:` → « Faire les sommations (attroupement) » · `approche:` → « Rapprocher la réserve » · `releve:` →
« Relever X par Y » · `ravit:` → « Ravitailler X en grenades aux fourgons » · `logistique` → « Demander un
ravitaillement à la logistique » · `metro:rouvre` → « Rouvrir la station X » · `dispersion` → « Passer les barrages en
filtrage pour laisser sortir la foule ». Unit and place names come from the proposal's radio text where the prefix
table cannot know them (regex on the text, else the generic sentence). Unknown key → the radio text with « QUATRE-ZÉRO »
→ « 40 », « PARLEZ » / « TERMINÉ » / call signs dropped.

### 6.4 The order wheel (F) — 8 sectors, the follow-me orders first, same numbers for every role

Commander (`scope ≠ lecture`), clockwise from the top, keys 1–8 (`wheelKeys.ts`):

| # | Label | Sub | Action |
|---|---|---|---|
| 1 | « Suivez-moi à pied » | « toute mon unité » | suivre_pied |
| 2 | « Suivez-moi en véhicules » | « toute mon unité » | avec_moi |
| 3 | « Avancer jusqu'ici » | « au point visé » | avancer |
| 4 | « Tenir une ligne ici » | « face à moi » | ligne |
| 5 | « Interpeller » | « la personne visée » (greyed « visez quelqu'un ») | interpeller |
| 6 | « Pousser un véhicule » | « le blindé Centaure, au point visé » | degager_obstacle |
| 7 | « Secours ici » | → inner ring « Pompiers ici » / « SAMU ici » | same call as the HUD button |
| 8 | « Plus… » | → inner ring « Se replier », « Bond en avant », « Charger », « Disperser au gaz », « Tenir sa position », « Arrêter l'action », « Laisser agir seuls », « Se protéger (tortue) » (+ the « bugs » team's liaison action) | repli, bond_offensif, charge, disperser_gaz, tenir, cesser, libre, tortue |

Executant (`lecture`): sectors 1, 2 and 7 only, **with the same numbers** (F 1 / F 2 / F 7 mean the same for
everyone). Centre: « À : MISTRAL (toute la compagnie) » + « point visé · 80 m ». A locked sector says why in one
line (« il faut les sommations et l'autorisation du gaz »). Inner rings reuse `RadialMenu` from `wheel.ts`, which is
**not edited** (the « bugs » team edits it).

### 6.5 What an executant sees (plain CRS, BRAV-M rider, chef de groupe receiving an order)

« Ma mission » card (`src/ui/hud/mission.ts`) reordered, order first:
```
┌ ORDRE DU COMMANDANT ───────────────────────────── NOUVEL ORDRE ┐
│ Tenir la ligne                                                  │  16 px bold (command.text)
│ Avenue de la République · 235 m ↗                                │  place + distance + arrow
│ Vous : restez à votre place dans la ligne, bouclier levé.        │  instruction
│ ⏱ Départ : 5 / 7 à bord — on part dès que tout le monde est monté │  (when relevant)
│ Suivez : Brigadier-chef Camara · 5 m                             │
│ ▸ Détails (chaîne de commandement, radio)                        │  folded; click or H
└─────────────────────────────────────────────────────────────────┘
```
The title names the issuer's role from `MissionCommand.by` (« Commandant Carlier » → « ORDRE DU COMMANDANT »;
« Capitaine … » → « ORDRE DU CAPITAINE »; unknown → « ORDRE DE MISTRAL »). Phone: exactly two lines, the verb never
cut, the street shortened first (`Av.`, `Bd`): « Tenir la ligne · Av. de la République · 235 m ↗ » / « Suivez
Camara · 5 m ». The unit chip at the top reads « MISTRAL 1 ALFA · EN LIGNE » (`tag`) instead of « LIGNE » /
« INITIATIVE ». Tab opens the read-only map of §2.9 (framed on me and my destination). For executants with a
blocked vehicle, the HUD line reads « Un véhicule vous bloque : [Demander le Centaure] » (`police.obstacle.radioRequest`).

---------------------------------------------------------------------------------------------------------------------

## 7. Legal frame, feedback and visual fixes, commissariats

### 7.1 The legal frame made simple

**Chip (always, top bar):** « ⚖ Sommations 0/3 · Force : mains nues » (phone: « ⚖ Sommations 0/3 », the force is in the panel). Grey: nothing pending; orange « ⚖ Sommations
1/3 · Force : gaz ⚠ » when the authorised force is above what the law allows now; green « ⚖ Sommations faites ·
Force : gaz »; during a legal chain « ⚖ Sommation 2/3 dans 8 s ». The field situation panel uses the same words
(« FORCE licite 1 · autorisée 1 » → « Force : mains nues »).

**Words for force levels (never bare numbers):** 0 « aucune force » · 1 « mains nues » (panel: « mains nues et
boucliers : pousser, saisir un bras ») · 2 « bâton et gazeuse » · 3 « gaz lacrymogène et canon à eau » · 4 « grenades
et lanceurs de balles (LBD) ». « licite » →
« La loi permet », « autorisée » → « Vous autorisez ».

**Panel « Cadre légal » (L, modal in the right column / phone sheet):**
```
│ CADRE LÉGAL                                                        │
│ La loi permet maintenant : mains nues. Vous autorisez : mains nues.│
│ ▶1 📢 Faire les sommations   les 3 avertissements, ~1 min 30        │
│  2 📢 Faire la sommation suivante seulement : l'annonce            │
│  3 ✋ Autoriser : mains nues seulement                      ✓       │
│  4 🦯 Autoriser : bâton et gazeuse                                  │
│  5 ☁ Autoriser : gaz lacrymogène et canon à eau                    │
│  6 💥 Autoriser : grenades et lanceurs de balles (LBD)              │
│ Avant toute force au-delà des mains nues, la loi demande les 3      │
│ sommations, sauf si vos unités sont attaquées (riposte permise).    │
```
- Lines 1–2 only when `canSommation`; in the « salle de commandement » variant they read « Faire faire les sommations
  par l'officier sur place » (existing `requestSommation`). Without authority: « Réservé au commissaire ou à
  l'officier ceint ».
- Chef de groupe: lines 3–6 read « Mes ordres jusqu'à : … » (today's ceiling) and line 7 « Demander plus de force
  (radio) ».

**Legal steps inside the cards.** A card line whose verb is coercive or above the authorised force computes, with
`core.check(verb)` (unchanged) and the law advisor: missing sommations (`roe.sommation < 3` and no `riposteAt` near
the target), missing authorisation (`verb.force > authorised`). It shows 🔒 + « sommations 0/3 + autoriser le gaz ».
Sending it opens S3 (§2.5). « Faire les étapes dans l'ordre » starts the **legal chain** (`legalChain.ts`, ticked by
`CommandSystem.update(dt)` so it runs with the map closed): `law.sommation(player)` (or `requestSommation`) each time
`law.advisor.sommationWait()` is 0 → `core.authorize(level)` if needed → wait `forceWait()` = 0 → `core.issue(...)`
once. Each step is spoken on the radio as today and shown in « Mes unités » as « Dispersion au gaz — sommation 2 sur 3
dans 25 s [Annuler] » and in the chip. If a step is refused (`sommationRefusal`: too far, no sash…), the chain stops and
the row says why in one line (« Approchez-vous à portée de mégaphone, ou faites-les faire par l'officier : L »). A chef
de groupe whose ceiling is too low sees « Au-dessus de votre plafond — [Demander plus de force] » and no « Faire les
étapes ». The law module, the levels and the refusals are unchanged: only the clicking is automated, after the
player confirmed the listed steps. The manual path (L) remains.

### 7.2 Feedback and preview; visual fixes of the map

#### 7.2.1 Who is proposed (`bestUnit.ts`, pure)

`proposeWho(line, where, units, env) → WhoCandidate[]` (ranked):
1. If the player already chose units (Qui list, U, T, Maj+click, a unit card), they are used as they are.
2. Candidates: `core.canCommand`, ≥ 60 % valid agents, not « au poste / en alerte » (P5 `exclude` callback), not
   holding a barrage (`holdingSquads`) unless nothing else is free. Ranked by: free first (no order, `libre`, or
   `tenir` far from any crowd), then ETA (straight distance ÷ 1.4 m/s on foot; ÷ 11 m/s beyond 250 m with
   vehicles), then fitness:
   - barrer / filtrer / ligne / tenir / repli / colonne / avancer: the nearest free **section** (never the company
     node unless T; groups only if no section is free). For a street wider than the section's front (valid agents ×
     `FRONT_PER_AGENT`), the next free section is added (max 2) and the sentence says « 30 m : 2 sections ».
   - interpeller: BRAV-M (`meansOfSymbol === 'bravm'`), else the nearest group.
   - degager_obstacle: the nearest free Centaure (as `obstacleOrder.ts`); degager_barricade: Centaure, else a group.
   - disperser_gaz: the nearest section carrying grenades (collective ammunition > 0).
   - nasse: `nasseCandidates` + `buildNasseProposal` (Qui reads « 5 unités choisies par le jeu »).
   - incidents: `MEANS_FOR` order → matching unit by symbol, then « Pompiers » / « SAMU » services.
   - a station dispatch: the station's ready units by ETA (P5 `buildRows`).
3. Station units are **never** a default. When no own unit fits, the Qui line reads « Aucune unité libre — renfort
   possible : TV 75-19 (commissariat du 9e, ~4 min) : U ».

#### 7.2.2 Preview before confirming (`tacticalPreview.ts`, reusing today's renderers)

Drawn for the highlighted line at the visée (keyboard), the hovered line (trackpad) or the tapped line (touch):
street verbs → the red / red-green street bar « Rue de Rivoli — personne ne passe, dans les deux sens »; point verbs →
arrows from each Qui unit with « à pied · 2 min » or « en véhicules · 6 min » and the vehicle route beyond 250 m;
auto line → the computed line, its width and facing arrow; nasse → each unit → its street (« 1A → rue X »);
`encercler` → circle + exit arrow; gas → cloud disc + **wind arrow**; rescue → « POMPIERS ICI » / « SAMU ICI » +
route; station dispatch → route from the station « deux-tons · 4 min »; legal chain → numbered steps ①②③ next to
the crowd. Qui units: yellow ring + « QUI » tag; other units dimmed to 60 %. Plus the sentence « Ce qui va se
passer : … » built from `plain`, Qui, place name, mode and ETA, and the verb's `rule` (orange) under it (« Une issue
doit rester ouverte et annoncée. »).

#### 7.2.3 After the order

« Mes unités » rows (§2.7) with progress bar (distance done / total from the track data) and ETA; « ✓ en place »
flash and a soft sound (existing `ui_*`). Map track labels use `tag` (« 2 · BARRE · 120 m · ~1 min »); units with
the same order and destination share one label (« 1A 1B 1C · BARRENT · ~2 min »); remaining overlaps are solved by
a greedy vertical offset (0, −16, +16, −32 px), and arrived units' labels are hidden first. Unit chip and mission card
use the same words.

#### 7.2.4 Visual fixes (inventory §5)

1. Giant overlapping place names at first open (`basecache.ts` / `basemap-labels.ts`): labels are drawn in screen
   pixels at the current zoom; the cached base layer is not shown before its first full redraw at the right scale.
2. 60 buttons / scrolling palette → §2 (≤ 22 at rest).
3. 3-line key legend → removed (letters on buttons, one hint line in the card, H).
4. Toast stacking over the top bar → success toasts removed (S4 in the card); refusals bottom-left, max 2.
5. Radio subtitles over the widgets → subtitles top-left of the map; widgets above the bottom bar.
6. Raw « COUPER_CIRCULATION » → `tag` everywhere, fallback ''.
7. Crowd-exit starburst → only for the crowd under the visée or in the open card, as short ticks at the street
   mouths (grey unheld, green held); never on the executant's map.
8. Overlapping track labels → 7.2.3.
9. Truncations (« Ordre en cours : Avancer — en co… », metro rows, phone mission card) → card header on 2 lines,
   phone mission card rules (§6.5).
10. « 1 » selecting the whole company → digits no longer select units; T is explicit.
11. Quick wheel hiding the point → removed.
12–13. Phone drawers / chips over the minimap → one sheet at a time; HUD chips under the minimap.
15. Read-only map noise → §2.9.

### 7.3 Commissariats — how dispatch and send-back fit (for the « commissariats » team, PACKAGE P5)

The station is **a source of units (Qui)**, reached like any repère. Nothing is added to the first level; no
« Commissariats » tab; no « Engager… » button wall.

**On the map.** P4's station symbols become repères of kind `commissariat` (snap 40 px / 48 px touch). The green
badge = units ready. Layer toggle « Commissariats » in « Plus… › Affichage de la carte ».

**Station card** (click / tap the symbol, or C):
```
│ 🏛 COMMISSARIAT DU 9e — rue Chauchat                                 │
│ 2,1 km · ≈ 4 min deux-tons · 3 prêtes                                │
│ ▶1 🚓 Envoyer TV 75-19 — Police secours, 3 gardiens · prête          │
│  2 🚗 Envoyer BAC 75-9 — voiture banalisée, 3 policiers · prête       │
│  3 🏍 Envoyer FAUCON 9 — BRAV-M (policiers à moto), 6 motos · en alerte │
│  4 ☰ Toutes les unités du poste…                                     │
│  0 ⋯ Autres ordres ici… (« Mettre une unité en alerte… », « Centrer la carte ») │
```
Lines 1–5: units « Au poste — prête » first, then « En alerte », sorted by ETA (P5 `buildRows`); the line « Toutes
les unités du poste… » comes **right after** the last unit line (numbers never skip: 3 units → it is line 4). It opens
« Plus… › Commissariats » on this station (the P5 list with states « Au poste — prête », « En alerte (équipage à
bord) », « Engagée — <secteur> », « Retour », « Au repos 1:20 », « Indisponible »; patrol cars of the area under
« En patrouille »).

**Dispatch (state « OÙ L'ENVOYER ? »).** Choosing « Envoyer TV 75-19 » fixes Qui = TV 75-19 (« depuis le
commissariat du 9e ») and turns the card into « OÙ L'ENVOYER ? »: the visée jumps to the first suggested place
(top « À traiter », then crowds); ←/→ cycle suggested places; Maj+arrows / R / a click choose any place. The card of
the place under the visée is shown live **with Qui fixed**, its default line taken from P5's default verb by kind:
patrol car → « Y aller » as `avancer`; BRAV-M → « Y aller » as `colonne`; other station vehicles → « Y aller en
véhicules » (`faire_mouvement`). Any other line of that card works too (« Interpeller avec TV 75-19 », « Barrer la
rue »…). **The unit is engaged only when the order is sent**: `core.engageFromCommissariat(entryId)` then, in the
same tick, the line's issue on the returned squad (P5 already tests same-tick issue after `invalidateScope()`).
Échap before sending engages nothing (no half-engaged unit). Phone: after « Envoyer TV 75-19 » the sheet shrinks to a
header « Touchez la destination — TV 75-19 [✕] »; a tap opens the place card in the sheet; « Donner l'ordre ».

**Place first.** In any card the Qui list has a section « Renforts des commissariats » (« TV 75-19 · commissariat du
9e · prête · 4 min »), and U reaches them after my own units. Choosing one and sending engages it the same way.

**Send back.** « Rentrer au commissariat » (`retour_poste`, group « Fin d'action ») is line 6 of the unit card of
any unit that came from a station, and in « Autres ordres » for my own company's units (→ their journée base, as P5
says). Also in « Tous les ordres ». Rows: « TV 75-19 · Rentre au commissariat du 9e · ~2 min », then the station
card shows « Au repos 1:20 », then « Au poste — prête ». Map tag « RENTRE ».

**Keys.** C = visée to the nearest station with ready units, its card opens (C again = next station by distance to
the visée); then digits/↑↓ + Entrée as any card. C works **before** the read-only early return: read-only roles see
the station card without « Envoyer » lines and the note « Seul le commandant engage les moyens des commissariats »;
a mission with `extra.renforts = false` shows « Moyens fixés par l'ordre d'opération ».

**Exclusions.** « Au poste » and « En alerte » units are excluded from U's cycle of my units, T, `bestUnit` defaults,
`nasseCandidates`, and `keyboardSections` (P5's composed `canCommand && !atPost` callback; signatures unchanged).

**Hooks this redesign provides for P5 (built in C1 / C1B / C3 / C4, unused until P5 lands):**
- `intents.ts`: `registerRepereProvider(kind: 'commissariat', provider: (env) => Repere[])` and
  `registerCardBuilder('commissariat', (r, env) => Card)`; a line action `{ kind: 'engage', entryId, defaultVerb }`.
- `sendLine.ts`: for a line whose Qui is a station entry (`who.fromStation = entryId`), calls
  `core.engageFromCommissariat?.(entryId)` first (optional method on `CommandCore`; absent → line hidden), then issues.
- `bestUnit.ts`: `env.exclude?(squadId)` and `env.stationCandidates?()` for the Qui list section.
- `panelMore.ts`: `registerMoreSection({ id: 'commissariats', label: 'Commissariats', key: 'KeyC', mount })` — P5's
  `panelCommissariats` DOM mounts there instead of a tab; `TacticalTab` keeps a `'commissariats'` alias for its tests.
- `tacticalKeys.ts`: C is reserved for « Commissariats » (toast « Aucun commissariat sur cette carte » until P5).

**What P5 changes compared with its plan:** no `TABS` entry, no « Postes » drawer tab (phone uses the sheet), no
« Engager… » button flow and no `ct-hint` banner (the « OÙ L'ENVOYER ? » card replaces them), no R key in the station
pane (« Rentrer au commissariat » is a card line). `commissariatsModel.ts` (rows, texts, states) is reused as is and
feeds the card builder and the « Plus… › Commissariats » list.

---------------------------------------------------------------------------------------------------------------------

## 8. Work packages

Order (eight packages, each about half a day for one agent):
1. **C1** first (~2 h): the contract (every type of §8.0 in one file), the order words, the cards, the repères, the
   adjoint's titles. It is the only package on the critical path, so it is kept small.
2. Then **C1B, C2, C3, C3B, C4, C5 in parallel** (disjoint files), all coding against §8.0. C1B (who / preview /
   sending / legal chain) is needed only at run time by C3 and C3B; they import its functions by the signatures of §8.0
   and their own unit tests use the card data structures, not C1B's results.
3. **C6** last: wires the packages together (including every cross-package CSS import and callback), creates and runs
   the two new browser scenarios of the command map, and updates every existing test the redesign breaks.

No package imports from a sibling package that runs in parallel except the types of `cardTypes.ts` (C1): cross-package
wiring (CSS bundles, panel mounting, callbacks) is C6's job. Each package runs only the tests it names (never the
whole suite; one browser at a time). No package touches `src/sim/**`, `src/gameplay/**`, `src/input/bindings.ts`,
`src/ui/command/radioScreen.ts` (« modes ») or `src/ui/command/wheel.ts` (« bugs »). `src/ui/command/quickActions.ts`
(« bugs » edits « Secours ») and `src/ui/hud/mission.ts` (the executant's order card may also be touched by the
« colonne et ordres clairs » work) are edited surgically, function by function, keeping every existing export.

### 8.0 Interface contract (frozen by C1; every other package codes against it)

All the types below live in **`src/ui/command/cardTypes.ts`** (C1), so that every package compiles as soon as C1 is
merged; the function signatures are those of the file named in each comment.

```ts
// src/ui/command/intents.ts (C1)
export type RepereKind = 'rue'|'foule'|'nasse'|'incident'|'unite'|'cible'|'vous'|'point'|'metro'|'fermeture'
  |'commissariat'|'proposition'|'bloqueur';
export interface Repere { kind: RepereKind; key: string; x: number; z: number; name: string;
  roadEdge?: number; crowdKey?: string; incidentId?: number; squadId?: number; stationId?: string;
  closureId?: number; proposalId?: number; entryId?: number }
export type IntentId = 'envoyer'|'bloquer'|'encercler'|'disperser'|'interpeller'|'secours';
export type LineAction =
  | { kind: 'verb'; type: OrderType; geom: 'point'|'street'|'autoLine'|'trace'|'immediate'|'target'|'circle'; targetId?: number }
  | { kind: 'nasse' } | { kind: 'filteredExit' } | { kind: 'closeRoad' } | { kind: 'closeArea'; radius: number }
  | { kind: 'rescue'; service: 'pompiers'|'samu'; incidentId: number } | { kind: 'means'; incidentId: number; means: string }
  | { kind: 'unassign'; incidentId: number } | { kind: 'cancelCall'; callId: number }
  | { kind: 'metro'; stationId: number; op: 'close'|'open'|'filter'|'unfilter' } | { kind: 'reopen'; closureId: number } | { kind: 'reopenAll' }
  | { kind: 'follow'; column: boolean } | { kind: 'centre' } | { kind: 'proposal'; accept: boolean }
  | { kind: 'sommation'; all: boolean } | { kind: 'engage'; entryId: number; defaultVerb: OrderType }
  | { kind: 'sendElsewhere' } | { kind: 'pickTarget'; type: 'proteger'|'escorter'|'suivre' } | { kind: 'others' } | { kind: 'stationList'; stationId: string };
export interface CardLine { label: string; explain: string; icon: string; action: LineAction;
  coercive: boolean; lock: null | { sommations: number; force: ForceLevel; text: string }; needsWho: boolean; rule: string }
export interface Card { repere: Repere; title: string; sub: string; notes: string[]; lines: CardLine[] /* ≤ 6 */;
  others: CardLine[]; defaultLine: number; stack: Repere[] }
export interface CardEnv { /* narrow, testable: scope level, canTraffic, canSommation, canAuthorize, sommations,
  lawful, authorised, crowds, incidents(+MEANS_FOR), units, kettles, closures, metro, proposals, player, farFor(x,z,squad) */ }
export function buildCard(r: Repere, env: CardEnv, intent: IntentId | null): Card;
export function intentCandidates(intent: IntentId, env: CardEnv, from: { x: number; z: number }): Repere[];
export const INTENTS: readonly { id: IntentId; code: string; key: string; label: string; sub: string; icon: string }[];
// src/ui/command/reperes.ts (C1)
export function collectReperes(env: CardEnv): Repere[];
export function pickAt(list: readonly Repere[], sx: number, sy: number, radiusPx: number, toScreen: (x: number, z: number, out: {x: number; y: number}) => void): Repere[]; // priority-sorted stack
export function nextInDirection(from: {sx: number; sy: number}, dir: 'left'|'right'|'up'|'down', list: readonly Repere[], toScreen: …): Repere | null;
// src/ui/command/bestUnit.ts (C1B)
export interface WhoCandidate { squadIds: number[]; label: string; mode: 'pied'|'vehicules'; eta: number; distance: number; busy: string; fromStation?: number }
export function proposeWho(line: CardLine, where: { x: number; z: number }, env: WhoEnv): WhoCandidate[];
// src/ui/command/preview.ts (C1B, pure geometry for the renderer)
export type CardPreview = { kind: 'street'|'arrows'|'line'|'nasse'|'circle'|'gas'|'rescue'|'route'|'none'; … };
export function previewOf(line: CardLine, who: WhoCandidate | null, where: Repere, env: CardEnv): CardPreview;
export function sentenceOf(line: CardLine, who: WhoCandidate | null, where: Repere): { what: string; rule: string };
// src/ui/command/sendLine.ts (C1B) — calls only APIs that exist today (TacticalMap public issue* / closeRoad /
// closeArea / callRescue / assignToUnit, nasse.ts, core.issue/authorize, law, metro service)
export function sendCardLine(env: SendEnv, line: CardLine, who: WhoCandidate | null, where: Repere): { ok: boolean; text: string; squads: number[] };
// src/ui/command/legalChain.ts (C1B)
export class LegalChain { start(plan: LegalPlan): void; tick(now: number): void; cancel(): void; status(): LegalStatus | null }
// src/ui/command/adjointPlays.ts (C1)
export function proposalTitle(p: { key: string; text: string }): string;
// C2 → C3: TacticalMap gains
//   onRepereTap?: (stack: Repere[], sx: number, sy: number, touch: boolean) => void
//   onRepereHover?: (stack: Repere[], sx: number, sy: number) => void
//   traceEnds: null | { ax: number; az: number }   (two-click line)
//   drawCard(preview: CardPreview | null, visee: Repere | null)    (tacticalPreview)
// C2 → C3: MapCanvas gains  keyCursor: 'free' | 'shiftOnly'  and  setCursor(sx: number, sy: number): void
// C4 → C6 (mounted in C3's column / sheets): panels expose  { root: HTMLElement; refresh(force: boolean): void; dispose(): void }
// C3B → C6 (mounted in C3's column / sheet):  class CardPanel { root; show(card: Card, who: WhoCandidate | null, line: number,
//   sentence: { what: string; rule: string }, compact: boolean); showWho(list: WhoCandidate[]); showConfirm(steps); showSent(text, undo: boolean);
//   onLineHover/onLineTap/onSend/onBack/onWhoNext/onWhoAll/onWhoPick/onConfirm/onUndo callbacks }
// C3 holds the state machine and calls CardPanel and the C4 panels only through these interfaces.
```

### PACKAGE C1 — Contract, order words, cards, repères, adjoint titles
- dependsOn: []
- files: src/ui/command/cardTypes.ts (new), src/ui/command/orders.ts, src/ui/command/intents.ts (new),
  src/ui/command/reperes.ts (new), src/ui/command/adjointPlays.ts (new), tests/unit/ui-command.fiches.test.ts (new),
  tests/unit/ui-command.reperes.test.ts (new), tests/unit/ui-command.adjoint.test.ts (new)

#### Changes
- `cardTypes.ts`: every type of §8.0 (`RepereKind`, `Repere`, `IntentId`, `LineAction`, `CardLine`, `Card`, `CardEnv`,
  `WhoCandidate`, `WhoEnv`, `CardPreview`, `SendEnv`, `LegalPlan`, `LegalStatus`), no logic.
- `orders.ts`: add `plain`, `tag`, `explain`, `doing` to every `ORDER_VERBS` entry with the exact texts of §3.1;
  rename `ORDER_GROUP_LABELS` to « Se placer », « Se déplacer », « Face à la foule », « Intervenir », « Fin
  d'action » (keys unchanged); `orderLabel()` returns `tag`-based plain text for the unit chip; `type`, `gesture`,
  `force`, `coercive`, `rule`, `short` unchanged. The `retour_poste` verb is **not** added (P5 adds it); export
  `EXTRA_PLAIN: Record<string, {plain, tag, explain, doing}>` holding the `retour_poste` texts so the card builder and
  the tags work as soon as P5's verb exists. Add `FORCE_WORDS` (§7.1: « aucune force », « mains nues », « bâton et
  gazeuse », « gaz lacrymogène et canon à eau », « grenades et lanceurs de balles (LBD) ») and `forceWord(level)`.
- `intents.ts`: `INTENTS` (§2.1 table: id, `KeyE/KeyB/KeyN/KeyD/KeyI/KeyS`, letter, label, second line, tooltip,
  icon, `sticky` true for bloquer / secours / interpeller); `buildCard` implementing every row of §2.3 and its rules
  (Y aller = colonne / avancer within 60 m of a crowd; street line 2 = targetId −2; the intention's default line always
  among the six lines; scope filtering: `lecture` → no lines; `unite` → no metro/station lines; `canTraffic` for line 4;
  legal `lock` from `force` / `coercive` / sommations / riposte; station card numbering of §7.3); `intentCandidates`
  with the rankings of the intentions table; `allOrdersGrouped()` for « Plus… › Tous les ordres »; the
  provider/builder registries for P5 (§7.3).
- `reperes.ts`: `collectReperes` from scene data (crowds, `crowdExits`, incidents, units, metro, closures, player,
  proposals, `police.obstacle.blocked()`), `pickAt` (priority order of §5.2), `nextInDirection` (100° cone,
  score = distance × (1 + 2·angle in rad)).
- `adjointPlays.ts`: `proposalTitle` table of §6.3 + fallback.

#### Tests
- `ui-command.fiches.test.ts`: every RepereKind → ≤ 6 lines + Autres, default line as in §2.3; for each intention and
  each repère kind, the default line is one of the six lines; street line 1 targetId 0 and line 2 targetId −2
  (`couper_circulation`); line 4 hidden without `canTraffic`; `lecture` → no lines; locked lines carry `lock` with
  sommations/force; no point line uses `tenir`; station card lines are numbered without gaps; **coverage**: every
  `ORDER_VERBS` type appears in at least one card line or Autres of some repère kind and in `allOrdersGrouped()`;
  `INTENTS` = 6 with codes in the AZERTY-safe set; every `plain`/`explain` non-empty, every `tag` ≤ 20 chars, no `_`;
  no label contains « LBD », « VL » or « TV » without its explanation; every intention's second line ≤ 30 characters;
  `forceWord` never returns a digit.
- `ui-command.reperes.test.ts`: `nextInDirection` picks the right neighbour and returns null in an empty cone; `pickAt`
  priority (unit over crowd over street); B candidates: unheld exits before held ones, ahead of the march first.
- `ui-command.adjoint.test.ts`: grep every `cmd.act('<key>'` / `act('<prefix>:'` in `src/sim/police/command/*.ts`
  and assert `proposalTitle` has a non-fallback title for each prefix; fallback strips « QUATRE-ZÉRO », « PARLEZ ».

### PACKAGE C1B — Who, automatic line, preview, sending a card line, legal chain
- dependsOn: [C1]
- files: src/ui/command/bestUnit.ts (new), src/ui/command/autoLine.ts (new), src/ui/command/preview.ts (new),
  src/ui/command/sendLine.ts (new), src/ui/command/legalChain.ts (new), src/ui/command/core.ts,
  src/ui/command/index.ts, tests/unit/ui-command.qui.test.ts (new), tests/unit/ui-command.ligne-auto.test.ts (new),
  tests/unit/ui-command.envoi-fiche.test.ts (new), tests/unit/ui-command.chaine-legale.test.ts (new)

#### Changes
- `bestUnit.ts`: `proposeWho` with the rules of §7.2.1 (`isFreeUnit`, `holdingSquads`, `nasseCandidates`,
  `buildNasseProposal`, `farFor`-like ETA); the T candidate = the player's whole command (company / section / group
  node, label by scope, §2.4).
- `autoLine.ts`: on a street: across it (`RoadSample.heading` ± 90°, width = road width), facing the nearest crowd;
  on a point: perpendicular to the direction of the nearest crowd, width = min(agents × `FRONT_PER_AGENT` × 1.1, 40 m);
  left flank rule as today's `issueLine`.
- `preview.ts`: `previewOf`, `sentenceOf` (« Ce qui va se passer : … » + the verb's `rule`).
- `sendLine.ts`: `sendCardLine` = set `state.setSelection(who.squadIds)`, then dispatch by `line.action`: `verb/point`
  → `tmap.issuePoint`; `street` → `issuePoint` snapped to the road with targetId; `autoLine`/`trace` → `tmap.issueLine`;
  `circle` → `tmap.issueArea` (default radius); `immediate` → `tmap.issueImmediate`; `target` → `core.issue(type,
  squads, geoms, targetId)`; `nasse` → `proposeNasse` + `acceptNasse`; `filteredExit` → `openFilteredExit`;
  `closeRoad/closeArea/rescue/means/unassign/cancelCall/metro/reopen/reopenAll` → today's `FieldActions` /
  `TacticalMap` / `PanelIncidents.delegate` logic / metro service (the same calls today's buttons make); `follow` →
  `core.callFollow`; `proposal` → `police.command.accept/dismiss`; `sommation` → `legalChain` (sommations only);
  `engage` / `fromStation` → `core.engageFromCommissariat?.(entryId)` then the line. Locked lines are not sent here
  (the card opens S3, which calls `legalChain.start`). `SendEnv` takes the `TacticalMap` through a narrow interface
  (the `issue*`, `closeRoad`, `closeArea`, `callRescue`, `assignToUnit` methods that exist today), so C1B does not
  depend on C2.
- `legalChain.ts`: pure sequencer with injected deps (`sommation()`, `requestSommation()`, `sommationWait()`,
  `sommationsDone()`, `sommationRefusal()`, `authorize(level)`, `forceWait()`, `issue()`); states, countdown text,
  `cancel()`; `legalSteps(verb, lawState, scope, refusal)` lists the steps of S3 with the pre-checks of §2.5 (who
  makes the sommations, or why nobody can).
- `core.ts`: add `readonly legalChain = new LegalChain(deps bound to this core)`; declare the optional
  `engageFromCommissariat?(entryId: number): { ok: boolean; squadId: number; reason: string }` in the class type
  (no body; P5 implements it). `issue`, `check`, `authorize`, `callFollow` unchanged.
- `index.ts`: `CommandSystem.update(dt)` → `this.core?.legalChain.tick(ctx.time)` (runs with the map closed).

#### Tests
- `ui-command.qui.test.ts` (Concorde, modules of `ui-command.after-convoy.test.ts`): barrer → a section, never the
  company node; wide street → 2 sections; interpeller → BRAV-M; obstacle → Centaure; gas → a section with grenades;
  holding units ranked last; a selection is used as is; T → the company (commandant) / the group (chef de groupe);
  units marked « au poste » by `exclude` never proposed.
- `ui-command.ligne-auto.test.ts`: across the street, facing the crowd, width rules, left-flank order.
- `ui-command.envoi-fiche.test.ts` (headless Concorde): street line 2 → `couper_circulation` targetId −2 to the
  proposed section; point « Y aller » 2 km away → convoy started (motorize); nasse line → each exit street gets a unit;
  kettle line 1 → `filtrer` on the widest exit; « Annuler l'ordre » path = `cesser` on the same squads.
- `ui-command.chaine-legale.test.ts` (fake clock + fake law): 3 sommations spaced by `sommationWait`, then
  `authorize(3)`, then exactly one `issue`; refusal stops with the reason text; `cancel()` stops; « salle » variant and
  « player refused but an officer is available » both use `requestSommation`; no authority and no officer → `legalSteps`
  returns no chain and the reason; chef de groupe → steps end with « Demander plus de force », no authorise.

### PACKAGE C2 — Map: gestures, keyboard visée, trackpad pan, preview drawing, tags and labels
- dependsOn: [C1]
- files: src/ui/maps/mapCanvas.ts, src/ui/maps/gestures.ts, src/ui/maps/cursor.ts, src/ui/maps/overlay-units.ts,
  src/ui/maps/basecache.ts, src/ui/maps/basemap-labels.ts, src/ui/command/tacticalMap.ts,
  src/ui/command/tacticalPreview.ts, tests/unit/ui-command.carte-gestes.test.ts (new),
  tests/unit/maps.etiquettes-ordres.test.ts (new)

#### Changes
- `mapCanvas.ts`: `keyCursor: 'free' | 'shiftOnly'` (default `'free'`, so the plan screen M is unchanged): in
  `'shiftOnly'` the arrows move the cursor only while Shift is held (normal speed), plain arrows are left to the
  screen, and keyboard `ui_accept` is ignored by `updatePad` (no tap at the cursor; the gamepad's A is also left to
  the screen); `setCursor(sx, sy)` shows and moves the cursor element (pans the view when outside); wheel handler: pass
  `ctrlKey`, `deltaX`, `deltaMode` to `gestures.wheel`.
- `gestures.ts`: `wheel(x, y, dx, dy, ctrl, mode)`: pure `wheelIntent()` → `'zoom'` when `ctrl`, or notched mouse
  (`mode === 1`, or `dx === 0 && |dy| ≥ 50 && Number.isInteger(dy)`), else `'pan'` (`onPan(dx, dy)`).
- `cursor.ts`: helper for the Shift-only axes (pure, testable).
- `overlay-units.ts`: `ORDER_TAGS` = the `tag` column of §3.1 for every type incl. `couper_circulation`, `filtrer`,
  `faire_mouvement`, `degager_obstacle`, `suivre_pied`, `avec_moi`, `retour_poste`; fallback `''`; track labels
  merged for units with the same order + destination (« 1A 1B 1C · BARRENT · ~2 min »); greedy de-overlap (0, −16,
  +16, −32 px; arrived units hidden first); crowd-exit arrows drawn only for `focusCrowd` as short ticks (grey / green)
  and never when the scope is `lecture`; executant framing support (route of my group thick yellow, destination ring
  « ICI — <lieu> », others dimmed 50 %).
- `basecache.ts` / `basemap-labels.ts`: fix the giant place names at first open (labels in screen pixels at the
  current scale; do not blit the cached base before its first full redraw).
- `tacticalMap.ts`: pick through `reperes.pickAt` with 40 px (48 px touch); idle tap → `onRepereTap(stack, …)`
  (no more select-or-issue in idle; Maj-tap on my unit = add to Qui via `state.select(key, true)`); hover →
  `onRepereHover` + `hoverRoad` as today; two-click line (`traceEnds`); long-press = tap; right-click = « Avancer en
  formation » for the selection (kept); right-drag line, Maj-drag box, incident drag, double-tap section kept; the
  existing `issue*`, `closeRoad`, `closeArea`, `callRescue`, `assignToUnit` stay public and unchanged.
- `tacticalPreview.ts`: `drawCard(preview, visee)` drawing each `CardPreview.kind` with today's renderers
  (`drawBarrageLine`, arrows, nasse lines, circle, rescue marker) + ETA text on arrows, wind arrow and cloud for gas,
  station route, legal step numbers; the visée label (« ◎ RUE DE RIVOLI » + « Entrée : que faire ici ? »); Qui rings
  and « QUI » tags; dims non-Qui units. The old mode-driven previews stay for the expert paths (trace, box).

#### Tests
- `ui-command.carte-gestes.test.ts`: `wheelIntent` (trackpad two-finger → pan; pinch ctrl → zoom; mouse notch →
  zoom); Shift-only axes (plain arrows → 0, Shift+arrow → movement); in `'shiftOnly'`, a keyboard Entrée produces no
  gesture; `ORDER_TAGS` = `verbOf(type).tag` for every verb
  (imports orders in the test only), fallback '' (never an upper-case raw type).
- `maps.etiquettes-ordres.test.ts`: label merge and de-overlap function: no two drawn label boxes intersect for
  the « 3 units, same order » and « 2 lines side by side » cases of the inventory screenshots.
- `tests/unit/ui-command.clavier.test.ts` « curseur aux flèches » block must still pass unchanged (default `'free'`).

### PACKAGE C3 — The command-map screen: layout, states, keys, intention bar, phone sheets
- dependsOn: [C1]
- files: src/ui/command/tacticalScreen.ts, src/ui/command/tacticalState.ts, src/ui/command/tacticalKeys.ts,
  src/ui/command/tacticalPop.ts (deleted; its content becomes cards), src/ui/command/style.ts, src/ui/command/api.ts,
  src/ui/drone/index.ts (two surgical lines only), tests/unit/ui-command.carte-clavier.test.ts (new)

#### Changes
- `tacticalState.ts`: add `visee: Repere | null`, `intent: IntentId | null`, `card: { repere; line: number;
  othersOpen: boolean } | null`, `who: WhoCandidate | null`, `whoAuto: boolean`, `sheet: 'none'|'card'|'qui'|'confirm'|
  'suivi'|'more'|'legal'|'help'`, `candidates: Repere[]`, `candIndex`, `lastSent: { squads; text; until } | null`,
  `lastInput: 'keys'|'pointer'|'touch'`; `tab` kept internally (and `TacticalTab` alias incl. 'commissariats') for
  `panelMore`; `passersby` removed from use (kept in MEMORY for compatibility). Every change through `touch()` as today.
- `tacticalKeys.ts`: replace the legend by `HELP_LINES` (§5.1 exact text); pure `mapKey(code, shift, ctx) →
  Command` table (intents, U, T, Espace, L, C, O, R, G, J, V, H, X, F, digits, arrows, Entrée, Maj+Entrée, Échap);
  pure `back(state) → state` chain (list → S3 → Autres → card → intention → S0 → close); `keyboardSections`,
  `commandableUnits`, `cycleUnitKey` kept (U at rest uses `cycleUnitKey` ordered by most recent order).
- `tacticalScreen.ts`: the state machine and the layout of §2 (top bar with legal chip `data-id="tac-legal"`,
  Ralentir, Fermer `tac-close`, drone `tac-drone`; map with Rechercher, +, −, Moi; bottom intention bar with
  `data-id="intent-<id>"`; right column with three mount points — `follow` (C4 « À traiter » + « Mes unités »),
  `card` (C3B), `sheet` (C4 « Plus… » / « Cadre légal ») — filled by C6); the keyboard focus model of §2.0
  (canvas keeps the focus, root cancels `ui:nav` and maps its `dir`, capture-phase `keydown`, 0.6 s Entrée guard);
  `map.keyCursor = 'shiftOnly'`; keydown → `mapKey`; plain arrows → `nextInDirection` (S0) or line / candidate cycling
  (S1) and `map.setCursor`; card refresh on visée / line / who change (throttled 10 Hz) using `buildCard`,
  `proposeWho`, `previewOf`, `sentenceOf`, and `tmap.drawCard`; send via `sendCardLine`; S3 → `core.legalChain.start`;
  sticky intention for B / S / I only; legal chip text from law (`forceWord`) + chain status; executant read-only
  layout (§2.9: banner from `session.mission` brief, framing on me + destination, only Fermer / + / − / Moi);
  compact (< 980×520) = phone sheets, one at a time; bottom bar hidden while a sheet is open; radio subtitles anchor
  top-left of the map, right of « Rechercher un lieu »; refusal toasts bottom-left, max 2; C reserved for
  « Commissariats »; `window.__cmd` hooks and the screen id `carte_tactique` kept; removes the quick wheel
  (`RadialMenu` no longer used here), hint banner, kettle banner, key legend, tabs. Until C6 wires them, the mount
  points stay empty and the calls to C1B / C2 / C3B go through the interfaces of §8.0 (compile-time only).
- `src/ui/drone/index.ts`: the O key listener returns when `ctx.ui.current === 'carte_tactique'`; the feed window's
  position over the command map becomes the map's top-right corner (§2.0). Nothing else in this file.
- `style.ts`: top bar chip, intention bar (64 px, two-line buttons; phone 52 px flexible one-word buttons inside the
  safe area), sheets (380 px phone), executant banner. It does **not** import C3B's or C4's CSS (C6 does).
- `api.ts`: `TacticalTab` alias kept; types for the new state exported for P5.

#### Tests
- `ui-command.carte-clavier.test.ts`: `mapKey` maps every key of §5.1 (incl. Numpad and AZERTY digits via code);
  letters only from the AZERTY-safe set (no A, Q, Z, W, M) and none of them is Y; `back()` order as a pure function of
  the state; sticky intention advances the candidate index after a send only for B / S / I; Entrée within 0.6 s of a
  send is ignored; read-only scope → no intention keys except C, G, H, = −, Tab.
- Must still pass: `tests/unit/ui-command.clavier.test.ts` « choix des unités » block, `tests/unit/ui.system.test.ts`.

### PACKAGE C3B — The card: lines, « Qui », legal confirmation, « ordre donné »
- dependsOn: [C1]
- files: src/ui/command/panelCard.ts (new), src/ui/command/styleCard.ts (new),
  tests/unit/ui-command.fiche-dom.test.ts (new)

#### Changes
- `panelCard.ts`: class `CardPanel` of §8.0, pure DOM, no access to the core: header (title, sub-line, « ‹ n / m › »,
  stack tabs, « Rue suivante (2 / 7) » when sticky), numbered lines with explanation (all lines when the window is
  ≥ 760 px high and not compact; otherwise only the highlighted one), ⚖ / 🔒 marks and the missing steps, « 0 ⋯ Autres
  ordres ici… » list mode, Qui block (name, strength, activity, « à pied · 180 m · ~2 min », buttons « Autre unité U »
  and the T button labelled by scope), sentence « Ce qui va se passer : … » + rule in orange, « Donner l'ordre ⏎ » /
  « ‹ Retour Échap », hint line only when `lastInput === 'keys'`; the Qui list of §2.4; S3 (§2.5, including the
  refusal variant without « Faire les étapes »); S4 « ✓ ORDRE DONNÉ » + « Annuler l'ordre X » (5 s). Pointer: hover =
  `onLineHover`, click = `onSend(line)`; touch (`pointerType === 'touch'`): first tap = `onLineTap` (highlight), second
  tap on the highlighted line or « Donner l'ordre » = send. All buttons `tabindex="-1"`. data-ids `card-line-<n>`,
  `card-send`, `card-back`, `card-who`, `card-who-next`, `card-who-all`, `card-confirm`, `card-undo`, `who-row-<n>`.
- `styleCard.ts`: `CARD_CSS` — rows 52 px (40 px compact), 44 px buttons (48 px coarse), visible highlight (not only
  colour: « ▶ » marker), S3 / S4 colours.

#### Tests
- `ui-command.fiche-dom.test.ts` (jsdom or the existing DOM-less helpers): a street card renders 6 lines + Autres, the
  default line highlighted; a touch tap only highlights, a second tap sends, a mouse click sends; the T button reads
  « Toute la compagnie » / « Tout le groupe » by scope; the S3 refusal variant has no « Faire les étapes » button;
  compact mode shows only the highlighted explanation; no visible label contains « Envoyer » as the confirm button.

### PACKAGE C4 — Side panels: « À traiter », « Mes unités », « Plus… », « Cadre légal »
- dependsOn: [C1]
- files: src/ui/command/panelFollow.ts (new), src/ui/command/panelMore.ts (new), src/ui/command/panelLegal.ts (new),
  src/ui/command/stylePanels.ts (new), src/ui/command/panelUnits.ts, src/ui/command/panelIncidents.ts,
  src/ui/command/panelOrders.ts, src/ui/command/panelTraffic.ts, src/ui/command/radioLog.ts,
  tests/unit/ui-command.panneaux.test.ts (new)

#### Changes
- `panelFollow.ts`: « À TRAITER » (≤ 3 rows: `sortIncidents` untreated first, the adjoint's proposal with
  `proposalTitle`, closed kettles « Nasse fermée — ouvrir une sortie filtrée ? », a waiting legal chain) and
  « MES UNITÉS » (sections with groups folded, « Patrouilles (n) », « Engins (n) », row = name, valid/total, `doing` +
  place, status vocabulary of §2.7, progress bar, ETA, « ⚠ relève conseillée », « bloquée : chemin coupé »); row
  click → callback `onPickRepere(repere)`; pure row/status builders exported (`followRows`, `todoItems`).
- `panelMore.ts`: the « Plus… » menu of §2.8 (entries with `data-id="tab-incidents"`, `tab-circulation`,
  `tab-journal`, `more-ordres`, `more-affichage`, `more-drone`, `more-aide`) and `registerMoreSection` for P5; hosts
  « Tous les ordres » (from `panelOrders.ts`), « Tous les incidents et secours » (`panelIncidents.ts`, unchanged
  inside), « Circulation et métro » (`panelTraffic.ts` + « Fermer un quartier aux voitures : 100 m / 200 m / 400 m »),
  « Journal radio » (`radioLog.ts`).
- `panelOrders.ts`: becomes « Tous les ordres »: single column, search field « Chercher un ordre », renamed groups,
  `plain` + `explain` per verb, `data-id="verb-<type>"` kept; choosing a verb calls `onVerbFirst(verb)` (C3 opens the
  card with that line); the legal, nasse and secours blocks are removed from here (legal → `panelLegal.ts`; nasse and
  secours → cards).
- `panelLegal.ts`: « Cadre légal » panel of §7.1 (same calls as today's `panelOrders` sommation / authorize /
  request code, moved into exported helpers `doSommation(core)`, `authorizeLevel(core, level)`,
  `requestForce(core)`); chef de groupe and « salle » variants; « Faire les sommations » → `core.legalChain`.
- `panelUnits.ts`, `panelIncidents.ts`, `panelTraffic.ts`, `radioLog.ts`: turned into content providers (export
  their row builders / mount functions); behaviour of their buttons unchanged.
- `stylePanels.ts`: CSS of these panels (≥ 44 px rows, 48 px on coarse pointers), exported as `PANELS_CSS` (imported
  by C6). Panel rows and menu entries are buttons with `tabindex="-1"` (keyboard model of §2.0); « Plus… » entries are
  numbered 1–8 and the screen maps the digits to them.
- `panelLegal.ts` « Faire les sommations » (the 3 in a row) calls an injected `onChain` callback that C6 binds to
  `core.legalChain` (C1B), so C4 does not import C1B; the single sommation and the force lines use the helpers above.

#### Tests
- `ui-command.panneaux.test.ts`: `followRows` texts (« Barre la rue de Rivoli », « en route à pied · ~1 min »,
  « embarque (5/7 à bord) », « ⚠ relève conseillée »); groups folded at Concorde (≤ 6 rows for the commandant);
  `todoItems` order (vital incident > proposal > kettle) and max 3; « Plus… » entries per scope (read-only: no
  « Tous les ordres »; chef de groupe: no metro); legal panel lines per role (commandant / chef de groupe / salle /
  no authority); « Tous les ordres » lists 26 verbs (27 with `retour_poste`) with non-empty explanations.

### PACKAGE C5 — Field HUD, order wheel, executant's order card
- dependsOn: [C1]
- files: src/ui/command/quickActions.ts, src/ui/command/orderWheel.ts, src/ui/command/wheelKeys.ts,
  src/ui/command/hud.ts, src/ui/hud/mission.ts, src/ui/hud/layout.ts (only if the phone chips need a new rectangle),
  tests/unit/ui.hud-zone-gauche.test.ts, tests/unit/ui-command.clavier.test.ts,
  tests/unit/ui-command.suivre-libelles.test.ts, tests/unit/ui-command.suivre-tous-roles.test.ts,
  tests/unit/hud.ordre-du-chef.test.ts (new), tests/e2e/verif-hud-ordres.mjs (new)

#### Changes
- `quickActions.ts` (surgical: the « bugs » team edits « Secours » for civilians here — keep `toggleRescue`, `call`,
  and all `quick-*` ids): the titled « ORDRES » block of §6.1 (labels « Suivez-moi à pied », « Suivez-moi en
  véhicules », « Secours ici » → « Pompiers ici » / « SAMU ici », « Carte de commandement », keys printed), role
  titles; the contextual line « Un véhicule vous bloque (rue X) : Envoyer le Centaure » from
  `police.obstacle.blocked()` → `core.issue('degager_obstacle', …)` (executant: « Demander le Centaure » →
  `radioRequest`); proposal card uses `proposalTitle`; phone: smart « Suivez-moi » chip + « Secours ici » chip under
  the minimap, proposal / blocked banners top centre; export `requestRescueAtPlayer(core, kind)` (the existing
  `call()` delegates to it) for the wheel.
- `orderWheel.ts`: `WHEEL` = the 8 sectors of §6.4 with inner rings for 7 and 8 (built with `RadialMenu` from
  `wheel.ts`, not edited); `FOLLOW_WHEEL` = sectors 1, 2, 7 with the same numbers; centre text « À : … »; locked
  sector one-line reason.
- `wheelKeys.ts`: keys 1–8 (Digit/Numpad), legend unchanged in spirit; inner ring keys 1–n.
- `hud.ts`: unit chip « MISTRAL 1 ALFA · EN LIGNE » from `tag`; « SANS ORDRE » instead of « INITIATIVE ».
- `mission.ts`: order-first layout of §6.5, issuer role title from `MissionCommand.by`, details folded, phone two lines
  (verb never truncated; street shortened first). Surgical: keep `commandLine`, `chiefText`, `arrowAngle`,
  `MISSION_CARD_ID`, `NEW_ORDER_SECONDS` exported with their current behaviour (tests `session.mission-card` and
  `playtest.ordres-clairs` import them); add a new pure `orderHeadline(brief, compact)` for the new first lines.
- Key hints in the ORDRES block are rendered « F puis 1 » (never « F 1 »); the phone smart chip shows the full label
  of the order it will give (§6.2).

#### Tests
- `ui-command.clavier.test.ts`: wheel = 8 sectors, keys 1–8, every sector reachable by arrows; executant wheel = 3
  sectors keyed 1, 2, 7; the « choix des unités » block (`keyboardSections`, `cycleUnitKey`) and the cursor block
  unchanged.
- `ui-command.suivre-libelles.test.ts`: labels « Suivez-moi à pied » / « Suivez-moi en véhicules » in HUD, wheel,
  « VOUS » card; titles per role.
- `ui-command.suivre-tous-roles.test.ts`: every police role with a unit gets F 1 / F 2 with the same meaning.
- `hud.ordre-du-chef.test.ts`: pure text builder: title from `by` (« ORDRE DU COMMANDANT »), first line = order,
  second = place + distance; phone two-line version never cuts the verb (cases from the inventory screenshots).
- Must still pass: `session.mission-card.test.ts`, `playtest.ordres-clairs.test.ts`; `ui.hud-zone-gauche.test.ts`
  updated only for the new chip rectangle (subtitles never over the chips).
- `tests/e2e/verif-hud-ordres.mjs` (new): laptop commandant: ORDRES block visible with 4 rows, F 1 / F 2 issue
  `suivre_pied` / `avec_moi` to the company, F 7 → rescue at my position; phone: chips not overlapping the minimap's
  rectangle, smart « Suivez-moi » = 1 tap; CRS: mission card first lines (« ORDRE DU … », order, place).

### PACKAGE C6 — Integration, the new command-map scenarios, the broken unit tests
- dependsOn: [C1, C1B, C2, C3, C3B, C4, C5]
- files: all files of C1–C5 for integration fixes (those packages are finished); tests/e2e/verif-commande-clavier.mjs
  (new), tests/e2e/verif-commande-tel.mjs (new), tests/unit/ui-command.barrage-passants.test.ts,
  tests/unit/ui-command.barrages-nasse.test.ts, tests/unit/ui-command.ordres.test.ts,
  tests/unit/ui-command.portee.test.ts, tests/unit/ui-command.incidents.test.ts,
  tests/unit/ui-command.tactique-cadrage.test.ts

#### Changes
- Wire the packages: C2 ↔ C3 (`onRepereTap`, `onRepereHover`, `drawCard`, `keyCursor`, `setCursor`); C3B's
  `CardPanel` into C3's `card` mount point and its callbacks to the state machine; C4's panels into the `follow` and
  `sheet` mount points (and `onChain` → `core.legalChain`, `onVerbFirst`, `onPickRepere`); C1B's `sendCardLine`,
  `proposeWho`, `previewOf`; C5's `requestRescueAtPlayer`; `style.ts` imports `CARD_CSS` and `PANELS_CSS`.
  `npx tsc --noEmit -p .` clean; fix contract mismatches.
- Write and run the two new scenarios:
  - `verif-commande-clavier.mjs` (laptop 1280×800, keyboard only, commandant at Concorde): T1, T3, T4, T5 (legal
    chain, fast-forwarded), T7, T8 with keys only; asserts the key counts of §4 (≤), the order types issued
    (`window.__cmd`), that no game binding (T, V, D, S, G, H, C, R, X, E, B, N, L, Espace) and not the drone feed (O)
    reacts while the map is open, that a double Entrée after a send issues one order, ≤ 22 visible buttons in S0, no
    element overlapping the top bar, the drone feed (when opened by « Vue drone ») not covering « Rechercher un lieu »;
    screenshots `commande-S0/S1/S2/S3/S4-1280x800.png` and S1 at 1280×720 without a scrolling card.
  - `verif-commande-tel.mjs` (844×390, taps only — no key press, which would hide the touch overlay): T1, T2, T3, T4 by
    taps with the counts of §4; a single tap on a line never sends; only one sheet open at a time; the bottom bar has
    7 buttons ≥ 96 × 52 px inside the safe area; screenshots S0/S1/S3.
- Walk the 10 reference tasks once more in the browser at 1280×800 with a pointer (trackpad-like: clicks only, no
  drag, two-finger scroll simulated by `wheel` events without Ctrl); fix what does not match §4.
- Leave the patch for the « commissariats » team's PACKAGE PX to the coordinator (do not create its marker file).

#### Tests
- Unit, update: `ui-command.barrage-passants.test.ts` and `ui-command.barrages-nasse.test.ts` (`QUICK_VERBS`
  gone: the street card has lines 1 and 2 with targetId 0 / −2; crowd card line 1 = nasse proposal; ≤ 6 lines);
  `ui-command.ordres.test.ts` (every verb has `plain`, `tag`, `explain`; types/forces unchanged; group labels renamed);
  `ui-command.portee.test.ts` (read-only scope: no card lines, read-only layout; chef de groupe: his units only);
  `ui-command.incidents.test.ts` (incident card lines = `MEANS_FOR` order; « Retirer l'affectation » when assigned);
  `ui-command.tactique-cadrage.test.ts` (executant framing on me + destination). Must pass unchanged:
  `ui-command.after-convoy.test.ts`, `ui-command.barrage-passants-convoi.test.ts`, `integration.mission-card-passants`,
  `police.rue-barree-passants`, `ui.system.test.ts`, all C1–C5 tests (C1, C1B, C2, C3, C3B, C4, C5).
- Browser: the two new scenarios above, then `verif-hud-ordres.mjs` (C5) once on the integrated build.

### PACKAGE C7 — Every existing browser scenario the redesign breaks
- dependsOn: [C6]
- files: tests/e2e/command.mjs, tests/e2e/verif-ordres-carte.mjs, tests/e2e/verif-suivi-ordres.mjs,
  tests/e2e/verif-roles-interface.mjs, tests/e2e/verif-actions-rapides.mjs, tests/e2e/verif-propositions.mjs,
  tests/e2e/verif-ma-mission.mjs, tests/e2e/verif-secours-carte.mjs, tests/e2e/verif-fin-ordres.mjs,
  tests/e2e/verif-fin-chef.mjs, tests/e2e/verif-fin-pc.mjs, tests/e2e/verif-fin-tel.mjs, tests/e2e/verif-fin-divers.mjs,
  tests/e2e/verif-tpm-tactique-tel.mjs, tests/e2e/verif-tpm-tel.mjs, tests/e2e/verif-tpm-tel2.mjs,
  tests/e2e/verif-tpm-manette2.mjs, tests/e2e/game.mjs, tests/e2e/ui.mjs, tests/e2e/assemblage2.mjs,
  tests/e2e/verif-divers.mjs, tests/e2e/verif-drone-video.mjs, tests/e2e/verif-partie.mjs (only if it breaks); small
  fixes in the C1–C5 files when a scenario reveals a real defect (reported in the package result)

#### Changes
Update each scenario only where it pins the old UI, never weakening what it checks about the simulation:
`verb-*` buttons are now in « Plus… › Tous les ordres » (press O then 1, or click `more-ordres`); `tab-*` ids are
« Plus… » entries; `tac-all`, `tac-multi`, `tac-tool-box`, `tac-sommation`, `tac-force-*`, `tac-call-*`,
`tac-close-road`, `ct-hint`, `ct-kettle`, the quick wheel → card / intent / legal ids (`intent-*`, `card-*`,
`tac-legal`, `who-row-*`); keys 1–9 no longer select sections (use U / T / the Qui list); « À pied » / « En colonne »
→ « Suivez-moi à pied » / « Suivez-moi en véhicules » (ids unchanged); wheel F·0 / F·= → F·1 / F·2 and 8 sectors;
proposal texts → plain titles; « INITIATIVE » → « SANS ORDRE ». `tac-drone` and `tac-close` keep their ids.

#### Tests
Run once each (one browser at a time, each script starts its own dev server): `command.mjs` (new screenshots of
S0–S6 at 1280×720 and 844×390; ≤ 22 buttons in S0; orders through cards); `verif-ordres-carte.mjs` (orders via
intentions/cards, issued types unchanged); `verif-suivi-ordres.mjs` (plain tags, never an upper-case raw type,
« Mes unités » rows); `verif-roles-interface.mjs` (per role on laptop and phone: commandant / chef de groupe / CRS
layouts, control counts, ORDRES block, wheel sizes 8 / 3, CRS mission card first line); `verif-actions-rapides.mjs`,
`verif-propositions.mjs` (plain titles, P / Maj+P), `verif-ma-mission.mjs` (order first, phone 2 lines),
`verif-secours-carte.mjs` (S intention and incident card), `verif-fin-ordres.mjs`, `verif-fin-chef.mjs`,
`verif-fin-pc.mjs`, `verif-fin-tel.mjs`, `verif-fin-divers.mjs` (F for a plain gardien still says « Vous recevez les
ordres »), `verif-tpm-tactique-tel.mjs`, `verif-tpm-tel.mjs`, `verif-tpm-tel2.mjs`, `verif-tpm-manette2.mjs` (gamepad
mapping of §5.1), `game.mjs`, `ui.mjs`, `assemblage2.mjs`, `verif-divers.mjs`, `verif-drone-video.mjs` (drone button in
the top bar, feed window over the command map at its top-right corner).

---------------------------------------------------------------------------------------------------------------------

## 9. Acceptance (what the player can do)

- I open the « Carte de commandement » (Tab) and see at most about twenty controls: six big buttons that say what I
  want (« Envoyer », « Bloquer une rue », « Encercler (nasse) », « Disperser », « Interpeller », « Secours »),
  « Plus… », and a legal reminder in words, « ⚖ Sommations 0/3 · Force : mains nues ».
- I press B (or click a street): a card proposes « Barrer la rue », « Barrer la rue, passants admis », « Barrage
  filtrant », « Fermer aux voitures (barrières) »…, the game has already chosen the nearest free section and tells me
  « à pied · 2 min », and the map shows the barrage before I confirm with « Donner l'ordre » (or Entrée).
- I block a street with a section, passers-by allowed, in 3 clicks on the trackpad, 4 keys, or 4 taps on the phone.
- I send the whole company in vehicles to a far place by searching its name (R), pressing T, and Entrée; the card says
  « en véhicules · 2,3 km · ~6 min ». On the trackpad it takes 5 clicks, on the phone 6 taps.
- I encircle a crowd with N then Entrée, see which unit holds which street before sending, and later open a filtered
  exit with Espace (or F) then Entrée.
- I have a rioter arrested with I then Entrée (the BRAV-M, policiers à moto, is proposed), or by clicking the suspect
  then « Interpeller avec la BRAV-M ».
- I choose « Disperser au gaz lacrymogène »: the game lists what the law requires (3 sommations, authorise gas, then
  gas, with the wind) and who will make the sommations; I confirm once, I follow « sommation 2 sur 3 dans 25 s » and I
  can cancel it. If the sommations are impossible (no sash, no officer), it tells me why before I confirm.
- In the field, « Suivez-moi à pied » and « Suivez-moi en véhicules » are two labelled buttons (or F then 1 / F then 2,
  written « F puis 1 » on screen); everyone follows me; on the phone one button shows the order that fits how I move
  (« Suivez-moi à pied » or « Suivez-moi en véhicules »), the other is in « Ordres ».
- In the field, « Secours ici » calls firefighters or the SAMU to where I stand; when a car blocks my column I see
  « Un véhicule vous bloque : Envoyer le blindé Centaure ».
- On the map, S then Entrée sends the firefighters to the most urgent fire; S stays active for the next fire.
- I close a street to traffic in 3 clicks, and B stays active so the next street needs only →, 4, Entrée.
- I click a police station, « Envoyer TV 75-19 — prête », click a destination, « Y aller »: the car leaves with
  two-tones; later I click it (or its row in « Mes unités ») and « Rentrer au commissariat ». Échap before sending
  engages nothing.
- After any order I see who is doing what, where and how long in « Mes unités » (« Barre la rue de Rivoli · en route
  à pied · ~1 min »), with the same words on the map — never « COUPER_CIRCULATION ».
- If the game picks a unit I do not want, U shows the next one and T my whole command (« Toute la compagnie »);
  « Annuler l'ordre » (X) works for 5 seconds after sending; pressing Entrée twice by mistake sends only one order.
- Everything works with the keyboard alone (letters at the same place on my AZERTY Mac; O opens « Plus… » without
  touching the drone), with the trackpad without any drag, right-click or long press (two fingers move the map, pinch
  zooms), and by touch on the phone, where a single tap never sends an order.
- Every former order is still there: « Plus… › Tous les ordres » lists them all, explained, and each also appears in
  the card of the place where it applies. No button uses an unexplained abbreviation or a force number.
- As a plain CRS I read on my screen « ORDRE DU COMMANDANT — Tenir la ligne — Avenue de la République · 235 m ↗ »
  without opening anything; Tab shows the map centred on me and where we go, with the route.
- Place names on the map are at normal size from the first opening; radio subtitles, messages and the drone window
  never hide the buttons; the card never needs scrolling on my MacBook Air.

---------------------------------------------------------------------------------------------------------------------

## 10. Decisions taken for the player, and coordination notes

The player asked to be left out of design details (« je veux que tu sois autonome et que tu règles tout »). The
former open questions are therefore decided here; playtest feedback can still change them later.

Decisions (no question left for the player):
1. « Y aller » walks in file (`colonne`), in formation (`avancer`) within 60 m of a crowd, and in vehicles beyond
   250 m; the preview and the sentence always say which (« à pied, en formation », « en véhicules »). Formation
   everywhere would slow every long walk for nothing.
2. The legal chain runs the 3 sommations, the authorisation and the order after **one** confirmation, because S3
   lists every step, says who makes the sommations, refuses up front when they are impossible, and the chain can be
   cancelled at any time from « Mes unités » or the chip. The manual path (L) stays for those who want it.
3. On the phone the first chip always shows the full name of the order it gives (« Suivez-moi à pied » or
   « Suivez-moi en véhicules », chosen by how the player moves); the other one costs 2 taps through « Ordres ». Two
   chips would cover the joystick area of the touch overlay.
4. « Modifier » an adjoint proposal is not offered (proposals carry no unit list); « Accepter » / « Plus tard » stay.

Tuning done by C6 during its browser walk (not decisions): the arrow jumps between repères in dense places (22 exits
around a square; fallback Maj+arrows) and the « 2 sections for a wide street » threshold on the Concorde avenues.

Coordination notes for the coordinator (not for the player):
- `MissionCommand.text` (« Tenir la ligne ») is written in `src/gameplay/session` (« modes » team's files): the
  executant card shows the existing text until that team aligns it with the `plain` words.
- A key press on a touch device hides the touch overlay (inventory defect 20, `src/input`, outside this redesign).
- The patch for the « commissariats » team's PACKAGE PX (`commande.patch` + marker `commande.ready` in
  `scratchpad/patches2/`) is produced by the coordinator after C7, not by a package.

---------------------------------------------------------------------------------------------------------------------

## Annex A — Jury: scores and reasons

Scale 1–10. Totals out of 70.

| Criterion | « Trackpad et clavier d'abord » | « Intention stratégique » | « Contexte et phrase guidée » |
|---|---|---|---|
| Clarity for a newcomer | 7 — six intentions + one card with the best line already chosen; but four keyboard ideas to learn and ↓ moves the visée instead of the card line | **8** — eight manœuvre cards with a line of explanation are the most readable first level; but « Comment » options cycled by O are invisible and the rail always takes 232 px | 7 — the QUI ▸ QUOI ▸ OÙ sentence teaches the model; but at rest nothing says what can be done, the player must guess to point |
| Number of actions (T1–T10) | **9** — keyboard 3–5 keys per task with no cursor travel; pointer 3 | 6 — pointer 3–5, but the keyboard often needs the free cursor (T2, T8 « 6 + c ») | 6 — pointer 3 for most tasks, keyboard always « + c » (T5 7 + c) |
| Strategic feel | 7 — intentions + game picks who and how; card lines still close to tactical verbs | **9** — named for what they achieve, adjoint plays, plan sheet | 6 — point-and-pick, closer to an operator's tool |
| Keyboard alone and trackpad | **9** — jumping visée, address search, two-finger pan, no drag; but reads `e.key` and uses Q/A | 6 — Espace pins (≤ 3) then free cursor; a click on the map sends (risky on a trackpad) | 6 — excellent trackpad (magnetic pick, two-finger pan), weak keyboard (slow free cursor) |
| Phone | 7 — 7-button bar, one sheet, tap then « Envoyer » | 6 — 8 icons + ⋯ at 98 px with 13 px labels, banner + chips + pins | 7 — side sheet, tap twice, rail |
| Nothing lost | **9** — complete mapping + Autres + « Tous les ordres » + coverage test | 8 — « Tous les ordres » keeps the old panels; coverage test | **9** — Liste + coverage test |
| Feasibility, regression risk | 6 — big `tacticalScreen.ts` rewrite, new repère jumps, auto line, legal chain; did not see that `MapCanvas.updatePad` polls the arrows | 5 — « Canaliser » is new logic, automatic filtered exit changes outcomes, two confirmation rules, proposal→plan mapping | 6 — similar size; sentence bar + draft state; popover placement; pick ambiguity |
| **Total** | **54** | **48** | **47** |

**Base: « Trackpad et clavier d'abord ».** Grafted:
- from « Intention »: plain adjoint titles keyed on `Proposal.key` (§6.3); AZERTY-safe physical keys (`e.code`, no
  A/Q/Z/W/M); the row status vocabulary; the complete `ORDER_TAGS` with a '' fallback; « Annuler l'ordre » for 5 s;
  the smart phone « Suivez-moi »; « ORDRE DU COMMANDANT » named by the issuer's role; « Plus… » entries keeping the
  old data-ids; station units never chosen by default.
- from « Contexte »: the « VOUS » card (follow-me from the map); ↑↓ inside the card and ←→ for other places /
  stacked repères (fixes the base's « ↓ moves the visée » weakness); « Faire les sommations » as a crowd line;
  incident lines as sentences with ETA; the blocked-vehicle card and HUD line from `police.obstacle.blocked()` (no new
  detection); the titled « ORDRES » HUD block; the « ORDRE REÇU » banner on the read-only map; magnetic name label
  next to the pointer; « Tous les ordres » groups renamed.
Rejected (and why): « Canaliser » as a first-level manœuvre (new logic; the adjoint's « Tenir les N rues qui donnent
sur le parcours » and sticky B cover it); automatic filtered exit (changes outcomes); « a click on the map sends »
(trackpad mis-clicks); the permanent sentence bar (duplicates the card's sentence, costs map height); the base's
default « whole company beyond 1 km » (surprising — T is explicit); reading letters from `e.key` with Q and A.

---------------------------------------------------------------------------------------------------------------------

## 11. Critique et corrections (player's advocate review)

The design was walked again from the player's seat (MacBook Air, trackpad, no mouse; then a phone in landscape) and
checked against the code. What was changed in this document, and why:

1. **« Envoyer » meant two things** — the intention (send a unit somewhere) and the confirm button. A newcomer who
   chose « Envoyer » then saw « Envoyer ⏎ » could not tell which step he was at. The confirm button is now « Donner
   l'ordre » everywhere (card, phone sheet, counts, acceptance); « ✓ ENVOYÉ » became « ✓ ORDRE DONNÉ ».
2. **Two « Annuler »** (close the card / cancel a sent order) → the card's is now « ‹ Retour ».
3. **Jargon left on screen**: « Force : contact » (meaningless to a newcomer) → « Force : mains nues »; « LBD » →
   « lanceurs de balles (LBD) »; « Centaure » → « blindé Centaure »; « BRAV-M » explained (« policiers à moto »); the
   phone chip « ⚖ 0/3 · contact » was cryptic → « ⚖ Sommations 0/3 »; the chip's tooltip now explains what the
   sommations are; « arrêter un auteur de faits » → « arrêter un casseur ». Intention second lines shortened to ≤ 30
   characters (they did not fit in 134 px buttons) with full sentences in tooltips. HUD key hints « F 1 » read as the
   Mac function key F1 → « F puis 1 ». The phone's bare « Suivez-moi » chip did not say what it would do → it shows
   the full name of the order.
4. **Key conflict found in the code**: O (« Plus… ») is also read by the drone's window listener, which is active over
   `carte_tactique` (`src/ui/drone/index.ts`): one press would open « Plus… » and toggle the drone feed. Fixed in C3
   (two surgical lines); the drone window was also moved off the search button and subtitles.
5. **Keyboard focus model missing** (riskiest feasibility point): the UI focus manager (`src/ui/core/focus.ts`) moves
   the focus between buttons on arrows and clicks the focused one on Entrée, and `MapCanvas.updatePad` turns Entrée into
   a tap at the cursor. Without rules, one Entrée could send twice and arrows would jump between buttons instead of
   places. §2.0 now specifies who handles what (canvas keeps the focus, `ui:nav` cancelled and mapped, buttons
   `tabindex=-1`, `'shiftOnly'` ignores keyboard Entrée, capture-phase listener) and C2 / C3 / C6 test it.
6. **Accidental double orders**: sticky intention + Entrée could send a second unit on a key repeat. Entrée is ignored
   0.6 s after a send, and stickiness is limited to the repeated jobs (B, S, I); « Envoyer », « Encercler »,
   « Disperser » return to rest.
7. **Default line not visible**: an intention's default line could live in « Autres » (I on a crowd →
   « Interpeller dans la foule »), so a letter + Entrée would send an order not on screen. Rule added: the default line
   is always among the six lines (tested).
8. **Misleading line**: « Tenir ici » on a point used `tenir`, an immediate verb that holds where the unit already is.
   Removed from points; `tenir` stays on the unit card (« Tenir sa position »).
9. **Legal chain could fail at step ①** (no sash, player not the authority): S3 now pre-checks
   `sommationRefusal`, switches to the company officer (`requestSommation`) when possible, and otherwise explains what
   to do instead of offering « Faire les étapes ». Force-level words added to C1 (`forceWord`).
10. **Counts corrected**: T2 on the phone is 6 taps, not 5 (no T button on the phone: « Qui ▸ » + row); T9's send-back
    on the phone goes through « ☰ Suivi » (5) because tapping a moving car is precise aiming; T5 by hand is 7 keys /
    6 clicks (line 1 of « Cadre légal » chains the 3 sommations); T3 split « 3 + 2 »; T8 notes the free-aim case for
    a street far from any crowd; T9 trackpad notes the pinch when the station is off-screen.
11. **Card too tall / noisy**: removed the folded footer (Retour does the job) and the keyboard hint line for pointer
    users; below 760 px of height only the highlighted line shows its explanation (MacBook Air browser window ≈
    1440×790); phone sheet height checked (372 ≤ 390 px). Controls in S1: 20 (was 21).
12. **Phone bottom bar did not fit**: 7 × 118 px = 826 px exceeds the ≈ 750 px left by the notch's safe areas → flexible
    buttons ≥ 96 px inside the safe area.
13. **« Toute la compagnie » was wrong for a chef de groupe** → the T button is named after the player's whole command
    (« Toute la section », « Tout le groupe »).
14. **Station card numbering skipped numbers** (1, 2, 3, 6) → the list line follows the last unit line.
15. **Field HUD on the laptop**: added the order of the left zone with the « modes » team's call card and a compact
    proposal below 760 px; the phone chips' move updates `ui.hud-zone-gauche.test.ts` (C5).
16. **Packages too big or overlapping**: C1 (on the critical path) split into C1 (contract in `cardTypes.ts`, words,
    cards, repères, adjoint titles) and C1B (who, auto line, preview, sending, legal chain); C3 split into C3 (screen
    shell, state machine, keys) and C3B (the card DOM); parallel packages no longer import each other (C3 used to
    import C4's CSS and to host browser scenarios that cannot pass before integration); C6 now does all wiring and the
    two new command-map scenarios; the old C6's twenty existing browser scripts moved to a new C7.
    `verif-fin-divers.mjs` (F for a plain gardien) and `verif-partie.mjs` were missing from the list;
    `session.mission-card` / `playtest.ordres-clairs` import `mission.ts` exports that C5 must keep.
17. **Open questions removed**: the player asked us to decide; §10 now records the decisions and moves the
    coordination items (modes team text, touch overlay defect, PX patch) to notes for the coordinator.

