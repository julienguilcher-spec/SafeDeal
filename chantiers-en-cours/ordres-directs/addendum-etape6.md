# COORDINATOR'S UPDATE — stage 6 (P16: the acceptance run, last package before release) — read first; it overrides everything below

**State of this worktree, 24 November (nothing committed; `git status` shows it all):** every package P1–P15 and
P17–P23 is written. `npx tsc --noEmit -p .` is clean. The whole unit suite was run by the coordinator after P22 and
P23: **4138 green, 0 red, 117 skipped (4255 tests, 500 files), finished at 01:44 UTC.** This is the first fully green run of the worktree: keep it green.
Reports of the last packages (read their `openIssues` before you start: coordinates, seeds, what was tried and
withdrawn): `/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-etape5-24nov.json`
(P22, P23), `…/scratchpad/rapports-etape4-23nov.json` (P20, P21), `…/scratchpad/rapports-reprise-23nov.json`
(P11, P18, P19), `…/scratchpad/rapports-paquets-ordres-directs.json` (P1–P15, P17).

**Why this package exists.** No one has yet played the feature end to end the way the player does. His words, after
playing COMMANDANT in a SPECIAL MISSION: « Je suis arrivé sur une manifestation, c'était n'importe quoi. Je pouvais
donner zéro ordre, ils ne suivaient pas. La BRAV-M, j'arrivais pas à leur donner d'ordre, ils bougeaient pas. […]
J'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire. […] Il faut
que je puisse donner directement des ordres et ils y vont direct. » The release is judged on exactly that.

## PACKAGE P16 — Recette : le joueur, de bout en bout (this IS its section-8 entry)
- **Files (owned):** NEW `tests/unit/playtest.ordre-direct*.test.ts` (one file per scenario below, plus a shared
  `playtest.ordre-direct.lib.ts`; several small files run better than one long one), NEW
  `tests/e2e/ordre-direct-recette.mjs`. Source files belong to the earlier packages — see « When a scenario fails ».
- **The robot plays like the player:** it gives every order through the field engine `command.direct` with the same
  aim fields the keyboard gives (look at `tests/unit/ui-command.direct-runtime.test.ts`,
  `tests/unit/bravm.ordres-joueur.test.ts`, `tests/unit/integration.commissariats-ordres-directs.test.ts` and the
  mission robot `tests/unit/playtest.commandant-mission.lib.ts` for how to drive a session, a column and the aim).
  It never calls `squad.order` or a command service directly. It measures, in simulated seconds: the acknowledgement
  on the radio, the first agent moving, the order really held by the unit (`squad.order.type`), the result in the
  world (line across the street, person in custody, detainee aboard a cellular van, van gone to the station), the
  ticket/status texts the player reads, and that no unit under his orders ever shows « SANS ORDRE », « MONTE »,
  « DESCEND » or « EN FILE ».
- **Scenarios, in this priority order (finish one before starting the next; the first three are the release gate):**
  1. **Commandant, special mission, arriving at the demonstration** (the player's exact case): mission `cdt-01`
     (and one more commandant mission of your choice with a different place), arrival as passenger of the column
     (the default of the mission robot), then on foot at the rally point: (a) §7.1 — he looks at a street mouth,
     Entrée: the nearest free section bars it (ack ≤ 1 s, first move ≤ 2 s, in place ≤ 45 s; if agents are still
     seated they get off first and it is said); (b) acceptance 2 — the same order given WHILE the column is still
     rolling / unloading: never 0 agent moving 10 s later; (c) A: every unit follows him within 1 s, BRAV-M
     included (acceptance 6), then ⌫ puts the previous orders back (acceptance 19); (d) §7.3 — U to the BRAV-M,
     Entrée on a crossroads 300–400 m away: it arrives, or finishes on foot, and says which (acceptance 8, 9);
     (e) §7.2 — a rioter is designated, one press: arrested ≤ 60 s, aboard a cellular van ≤ 120 s, the unit comes
     back « avec vous » (acceptance 7); at least two cellular vans exist with the company, one with a free seat
     within 150 m of the handover point; (f) he arrests someone himself: the help line says where to take him in
     < 0.5 s, 4 presses at most free him (acceptance 11); (g) the van leaves for the station when full or on
     order, a second one takes over (acceptance 12); (h) the end report numbers equal the registers (acceptance 13).
  2. **Commandant, service day** République seed 7: the same (a)–(e) at the first intervention, plus every convoy
     stage of §2.5 (order given at the base, on the road, at the stop, while unloading).
  3. **Chef de la BRAV-M** (mission `bravm-01` and Concorde seed 21 free mode): every verb the BRAV-M accepts
     (acceptance 9), he is never left without his unit or a moto waiting for him.
  4. Chef de section (`cg-01` or a section mission; acceptance 14: no AI order to his units for 300 s) and chef de
     groupe, Concorde seed 21 free mode « Déjà sur place »: §7.1, §7.4, §7.5.
  5. Patrol mode, chef de bord: « Interpeller » and « Avec moi » in one press, the cellular van asked for
     automatically (acceptance 22).
  6. Refusals: every refusal met in 1–5 is a sentence of the §4.3 table or has the form « X ne peut pas : … U : une
     autre unité. »; an unknown wording fails the test (acceptance 10). After the sommations, Maj+Entrée on the
     crowd gives « refoulement » (acceptance 23).
- **Browser (after scenario 3, one browser at a time):** `tests/e2e/ordre-direct-recette.mjs` plays §7.1–7.3 for the
  commandant with the KEYBOARD ONLY at 1280×800 and by touch at 844×390 (look at `tests/e2e/ordre-direct-clavier.mjs`
  and `ordre-direct-tel.mjs`, which already drive the keys and the pill — reuse their helpers). Assertions through
  the DOM and `window.__CRS`; take a screenshot at each step and LOOK at them (Read the PNG): overlapping elements,
  clipped text, an order line that says something other than what is happening. Then run the three existing
  scenarios `ordre-direct-clavier.mjs`, `ordre-direct-tel.mjs`, `interpelles-cellulaire.mjs` once each: they were
  green before P18–P23 and nobody has re-run them since.
- **Also measure once and report, without trying to fix (numbers only):** the mission robots
  `PLAYTEST_ARRIVAL=passager npx vitest run tests/unit/playtest.commandant-mission-01.test.ts` … `-15` (they have
  not been run since the robot driver was rewritten; run them in groups of three files), and
  `PLAYTEST_COLONNE=1 npx vitest run tests/unit/playtest.colonne-garantie` (it was 11/21 at stage 3).
- **When a scenario fails:** first make sure the robot is right (the player really can do this, with these keys,
  at this moment). Then find the root cause in the source. If the fix is small and local (about 30 lines, one or
  two files), make it, add or extend a unit test for it, and re-run the guard batch of the files you touched — the
  column and arrest tests are chaotic, any change of timing flips other cases: `playtest.colonnes-roles` must stay
  42/42 in both modes (default, and `PLAYTEST_STRICT=1 PLAYTEST_LIGHT=1`), plus for columns/BRAV-M the P23 batch
  and for arrests/vans the P22 batch (both written in the stage-5 update just below); withdraw a change that turns
  a green case red. If the fix is larger, do NOT attempt it: keep the scenario's assertion as `it.fails(…)` with a
  one-line French comment naming the defect, and describe it precisely in openIssues (what the player sees, seed,
  place, seconds, the function you suspect). Never weaken an assertion to get green, and never leave a red test.
- **Machine and budget:** 4 cores, you are alone on the machine this time; `--maxWorkers=2`, small groups, never
  the whole suite. The account budget is tight: priority order, root causes, nothing speculative, an honest
  report. Leave no probe file (`tests/unit/zz-*`).
- **Done:** scenarios 1–3 written and green (or their precise `it.fails` list), the browser recette run at both
  sizes with the screenshots looked at, scenarios 4–6 as far as the budget allows (say where you stopped), tsc
  clean, and in the report one line per acceptance item of §9 (1–23): asserted green by which test, or not
  asserted, or failing and why.

---

