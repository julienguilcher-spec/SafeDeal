# COORDINATOR'S UPDATE — stage 7 (P24, P25: what the end-to-end run found) — read first; it overrides everything below

**State of this worktree, 24 November 04:15 UTC (nothing committed; `git status` shows it all):** every package
P1–P23 is written and P16 (the end-to-end acceptance run) has played the feature like the player. `npx tsc --noEmit
-p .` is clean. Whole unit suite after P16: **4190 green, 0 red, 117 skipped (4307 tests), finished at 04:12 UTC** — the 12 `it.fails` steps count as green. Keep it green.
P16's report — READ IT FIRST, its `openIssues` give places, seeds, seconds and suspected functions for every defect
below: `/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-etape6-24nov.json`.
Earlier reports: `…/scratchpad/rapports-etape5-24nov.json` (P22, P23), `…/scratchpad/rapports-etape4-23nov.json`
(P20, P21), `…/scratchpad/rapports-reprise-23nov.json` (P11, P18, P19).

**What P16 established.** The player's own case — commandant, special mission `cdt-01`, arriving as a passenger of
the column, then a direct order — was broken and is now fixed and asserted (`tests/unit/playtest.ordre-direct-cdt01*`).
But 12 scenario steps are kept as `it.fails` in `tests/unit/playtest.ordre-direct-*.test.ts`, and the mission robots
show that with a LARGE company the new tree is not yet better than the published game. The player's words remain the
measure: « Je pouvais donner zéro ordre, ils ne suivaient pas. La BRAV-M, j'arrivais pas à leur donner d'ordre, ils
bougeaient pas. […] Tout le monde doit me suivre, c'est obligatoire. » **Nothing is released while a mission is
worse than in the published game.**

**Comparison run by the coordinator at 03:50 UTC** (`PLAYTEST_ARRIVAL=passager npx vitest run
tests/unit/playtest.commandant-mission-NN.test.ts`, published game = `/home/user/SafeDeal/crs-simulation`, read only,
never run git or write there; full logs with the state of every unit at +5 / +20 / +60 s:
`…/scratchpad/missions/main.log` (published) and `…/scratchpad/missions/impl.log` (this worktree)):

| mission | published game | this worktree |
|---|---|---|
| cdt-02 (12 groups) | at arrival all aboard within 60 m, column `stationnement`; « Suivez-moi » 8/12 around in 60 s | **9/12 groups more than 300 m away**, column `en_place`, groups `debarquer` with 1/7 aboard at 190–400 m; 2/12 around |
| cdt-05 (12 groups) | 0/12 far; 3/12 around | 2/12 far; 5/12 around; at +20 s MISTRAL 4's groups switch from `suivre` to `couper_circulation` |
| cdt-06 (12 groups) | green | green, but 3/12 far at arrival |
| cdt-14 (12 groups) | 0/12 far; 3/12 around | **5/12 far** (267–417 m); 3/12 around |
| cdt-04 (6 groups + BRAV-M) | BRAV-M « vers moi » does not come (56 → 40 m) | same (102 → 108 m) |
| cdt-08 (6 groups + BRAV-M) | BRAV-M « Suivez-moi » does not come (80 → 109 m); 6/6 around | BRAV-M does not come twice (179 → 161 m, 164 → 159 m), it arrives 275 m away in `colonne`; **2/6 around** |

So in this worktree the day says « sur place » and the mission starts while most of a large column is still strung
out or has dismounted hundreds of metres back; and « Suivez-moi » / A then cannot bring them within a minute.

**Rules (unchanged from stage 5).** The column and arrest tests are chaotic: any change of timing flips other cases.
Before your first edit run your guard batch and note what is green; after each fix re-run it and withdraw a change
that turns a green case red (unless you also fix that case); `playtest.colonnes-roles` must stay 42/42 in both modes
(default, and `PLAYTEST_STRICT=1 PLAYTEST_LIGHT=1`). An expectation changes only when the specification deliberately
changed the behaviour (quote the sentence); a margin is widened only with measured before/after. When a step kept as
`it.fails` in `playtest.ordre-direct-*.test.ts` becomes green, turn it into a plain `it` (an `it.fails` that passes
is a red test) — never delete or weaken it. Two agents work at the same time (P24 and P25), each owning the files of
its package; for a change in the other's files: small and local, do it and log it in
`…/scratchpad/ordres-directs/coordination-etape7.md` (create it; read it before each test batch); larger, write the
request there. 4 cores for two agents: `--maxWorkers=2`, small groups, never the whole suite. No probe file left
(`tests/unit/zz-*`). **The account budget is tight: priority order, root causes, nothing speculative, an honest
report; stop and report rather than loop on a case.**

## PACKAGE P24 — Grande compagnie : la colonne arrive groupée, « Avec moi » ramène tout le monde (this IS its section-8 entry)
- **Files (owned):** `src/sim/police/command/convoy.ts`, `src/gameplay/session/{journee,follow,engins,setup}.ts`,
  `src/sim/vehicles/**`, `src/sim/police/steer.ts`, the mission arrival code (where the mission decides it has
  started), `tests/unit/playtest.commandant-mission.lib.ts` and the `playtest.commandant-mission-NN` files,
  `tests/unit/playtest.colonne-garantie*`, `tests/unit/playtest.ordre-direct-journee.test.ts`.
- **Goals, in priority order:**
  1. **No mission worse than the published game at arrival.** cdt-02, cdt-14, cdt-05, cdt-06 as passenger: when the
     day says « sur place » / the mission starts, no group is more than 300 m from the commandant (the published
     game: 0/12 or 1/12), and nobody has been made to dismount far back. Find why this tree lets the day arrive
     while the tail is still on the road or has unloaded where it stood (suspects named by earlier reports:
     `convoy.ts` stagger / `TANGLE_WAIT` break-up / `carryOn`, `follow.ts walkIn`, `engins.ts advanceLate`,
     `journee.ts` arrival condition, the P16 change in `ui/command/core.ts` « on foot when the convoy is at
     stationnement / debarquement »). The fix may be: the day waits for the tail (with a spoken reason and a cap),
     or the late vehicles drive up and park behind the head — not teleporting in sight of the player.
  2. **« Suivez-moi à pied » / A with a large company:** at least half of the groups around the commandant (the
     robot's own criterion) 60 s after the order in cdt-02, cdt-05, cdt-14, cdt-08 — the published game reaches
     8/12 in cdt-02 and 6/6 in cdt-08. Check what the robot counts before deciding the game is wrong (in
     `impl.log`, cdt-05 at +60 s lists most groups within 50 m yet counts 5/12). Find who gives
     `couper_circulation` to MISTRAL 4 twenty seconds after the player's « Suivez-moi » (an AI or mission order
     overriding a player order is forbidden by plan §3: the player's orders have priority).
  3. **Service day, République seed 7** (`playtest.ordre-direct-journee.test.ts`, 6 `it.fails`; P16's DEFECT
     « service day » points 1, 2 and 4): a section ordered at the base then recalled with A boards with the column;
     the section ordered on the road bars its street; after A at the first intervention every unit holds `suivre`.
  4. Then all fifteen mission robots as passenger (`PLAYTEST_ARRIVAL=passager`, groups of three files): report the
     table published / worktree for those that are red; and `PLAYTEST_COLONNE=1 npx vitest run
     tests/unit/playtest.colonne-garantie --maxWorkers=1` (14/22 now): numbers only.
- **Guard batch:** `tests/unit/playtest.colonnes-roles` (both modes) and `tests/unit/vehicles. tests/unit/bravm.
  tests/unit/integration.suivre tests/unit/integration.journee tests/unit/playtest.colonne-ia
  tests/unit/playtest.colonne-joueur tests/unit/playtest.colonne-barrages tests/unit/police.convoi
  tests/unit/police-command.convoi tests/unit/playtest.commandant-compagnie-depart tests/unit/integration.avec-moi
  tests/unit/police.interpelles-fourgon tests/unit/integration.engins tests/unit/session.tous-me-suivent
  tests/unit/playtest.commandant-mission-colonne tests/unit/session.cellulaires tests/unit/playtest.commissariats
  tests/unit/session.depart-base tests/unit/playtest.ordre-direct` (add the files your edits touch).
- **Done:** goals 1 and 2 measured green on the six missions of the table (or, for each one that is not, the
  numbers next to the published game's and why), goal 3 as far as reached, guard batch with no new red, tsc clean.

## PACKAGE P25 — Le fourgon cellulaire vient à l'interpellé ; la BRAV-M vient quand on l'appelle (this IS its section-8 entry)
- **Files (owned):** `src/sim/police/command/bravm.ts`, `src/sim/police/{ops-arrest,arrest-service}.ts`,
  `src/gameplay/transfer/**`, `src/gameplay/session/remise.ts`, `src/ui/command/direct/**`, `src/ui/command/who.ts`
  (and the other order-logic files of `src/ui/command`), `src/ui/hud/fieldHud.ts`, the tests
  `tests/unit/playtest.ordre-direct-{cdt01,cdt01-colonne,cdt04,chef-bravm}.test.ts` and the lib
  `playtest.ordre-direct.lib.ts`, `tests/e2e/ordre-direct-recette.mjs`.
- **Goals, in priority order:**
  1. **The called cellular van comes** (P16's first DEFECT; `it.fails` in cdt01 (e) and cdt04 (e); acceptance 7:
     aboard ≤ 120 s, measured 144 s and 125 s). cdt-01 seed 7: arrest at (3136, −256), the vans 138 m away behind the
     company vans parked bumper to bumper; CELLULAIRE 1 drives 13 m and stops; the pair walks the detainee 130 m.
     The player said: « j'interpelle des gens, mais je sais même pas où les mettre ». Either the van really reaches
     the handover (it pulls out of the file — see how `transfer/system.ts pushThrough` and the convoy urgency work,
     and P22's note that `convoy.ts arrive()` without `boardFirst` never drives with `urgence: true`), or the
     handover point is set where the vans are and announced (« au CELLULAIRE 1, 130 m derrière la colonne ») and
     the pair is released at the van; in both cases the status line tells the truth. Also the fragile case: the
     van ordered to the station that stays behind a company van across the lane.
  2. **The BRAV-M comes when called** (missions cdt-04 and cdt-08 in the table above: « vers moi » / « Suivez-moi »
     and it stays 100–160 m away in `colonne`; the player said « la BRAV-M, ils bougeaient pas »), and the
     **BRAV-M chief's far « Envoyer »** (Concorde seed 21, 330 m: acknowledged, then nothing leaves, the ticket says
     « descend des motos — prêt dans … »; `it.fails` in chef-bravm, acceptance 8), his **A** (`debarquer` for 5 s,
     no « REÇU »; acceptance 6 and 9), near « Envoyer » in 40 s (45 s measured).
  3. **Acknowledgement of « Interpeller » by the BRAV-M within 1 s** through the reply lane (it only speaks when
     its approach starts; 2.7–13.7 s; `it.fails` in cdt04), and the three different outcomes of the commandant's
     BRAV-M arrest in cdt-04 (arrested / « hors d'atteinte » / « groupe compact » after 196 s): one stable outcome,
     said within 20 s.
  4. **The « Entrée » line tells the truth about who:** the automatic addressee is the nearest FREE unit to the
     POINT, and the distance shown is the one the unit will cover, not the player's (`who.ts defaultAddressee`; in
     the service day « MISTRAL 2 · 25 m » was 130 m away, and a section over a kilometre away was offered as
     « MISTRAL 4 · 16 m »). Service-day points 3 and 5 of P16's DEFECT are yours.
  5. Texts: « montent dans les fourgons » for a BRAV-M chief on his moto (must speak of motos); `returning` never
     set so « BRAV-M · revient avec vous » is never shown; the « Entrée » line and the detached-unit line clipped at
     1280×800 by a long place name (shorten the place, never cut the state); at 844×390 the alert toast covers the
     adjoint banner's « Oui » button and the state chip is cut.
  6. `tests/e2e/ordre-direct-recette.mjs`: make §7.2 reliable at both sizes (designate the offender through the
     same means the player has: tap on him on the phone; with the keyboard, turn until the line names him — if the
     software renderer turns in steps too large for the 4° cone, say whether the cone or the script is at fault and
     fix the right one), then register it in `tests/e2e/run-all.mjs`. One browser at a time; LOOK at the
     screenshots.
- **Guard batch:** `tests/unit/law. tests/unit/police.interpelles tests/unit/transfer. tests/unit/session.cellulaires
  tests/unit/integration.nasse tests/unit/ui-command. tests/unit/hud. tests/unit/playtest.commandant-interpeller
  tests/unit/bravm. tests/unit/playtest.commissariats tests/unit/police.nasse
  tests/unit/playtest.commandant-nasse-ouverte tests/unit/integration.commissariats tests/unit/playtest.ordre-direct
  tests/unit/integration.colonnes-bravm tests/unit/session.bravm-concorde` and `playtest.colonnes-roles` (both
  modes) after any change in bravm.ts (add the files your edits touch).
- **Done:** goals 1–3 green as plain `it` (or, for each that is not, the measured numbers and why), 4–6 as far as
  reached (say where you stopped), guard batch with no new red, tsc clean.

---

