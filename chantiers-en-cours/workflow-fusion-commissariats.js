export const meta = {
  name: 'fusion-commissariats',
  description: 'Fusionne le chantier des commissariats avec la version actuelle : résolution des conflits, vérification croisée (simulation et interface en parallèle), bouclage avec suite complète et correctif final',
  phases: [
    { title: 'Résolution', detail: 'conflits textuels, compilation, tests ciblés' },
    { title: 'Vérification croisée', detail: 'simulation (robots joueurs) et interface (navigateur) en parallèle' },
    { title: 'Bouclage', detail: 'suite complète, correctif final' },
  ],
}
const { worktree, patchPath, planPath, designPath, reportsPath, integReportPath, restesPath, model } = args
const MODEL = model || 'opus'
const proj = `${worktree}/crs-simulation`
const PATCH_CMD = `cd ${worktree} && git add -A -- crs-simulation/src crs-simulation/tests/unit crs-simulation/harness && git add -u -- crs-simulation && (git add -A -- crs-simulation/tests/e2e/*.mjs 2>/dev/null || true) && git diff --cached --binary HEAD > ${patchPath}`

const COMMON = `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite). The player is French, plays on a MacBook Air WITHOUT a mouse (keyboard + trackpad) and on a phone (touch, 844x390 landscape), and demands ZERO bugs and realism. All UI text and code comments are in French: keep that language and the style of the surrounding code.

YOUR WORKSPACE: the git worktree ${worktree} (project in ${proj}; node_modules there is a symlink: never touch it). Work ONLY inside this worktree. NEVER modify anything under /home/user/SafeDeal and never run git commands there. Do NOT commit, push, checkout another revision, or use git stash. The merge is STAGED / in the working tree, uncommitted: that is expected. Another agent (a « joueur critique ») is still playing the commissariats feature in /tmp/claude-0/hunt/commissariats: you may READ files there, never write.

SITUATION. The base commit of this worktree is the CURRENT game (version 20). The feature « commissariats » was developed separately, starting from a much older commit, and has just been applied here by a three-way patch (77 files; most are new modules under src/world/commissariats, src/gameplay/commissariats, src/render/commissariats and src/ui/command/{commissariatsLink,commissariatsModel,panelCommissariats}.ts).
 - What the feature is (the player asked for it): designed police stations in Paris — real building dressed (portal, POLICE lantern, flag, sign), painted bays with the station's vehicles parked in columns, every vehicle type; several stations; the commandant sees them on the command map (key C, station symbols with a badge), opens a station card and SENDS units from a station to a point (« Engager »), and sends them back (« Rentrer au commissariat »); a police player may take a parked station vehicle; in a service day (journée) the base is a dressed station. Plan: ${planPath}. Reports of its packages: ${reportsPath}. Report of its integration (in its own worktree, all green there): ${integReportPath}.
 - What the CURRENT game has that the feature never saw: (1) a home screen with four modes and a PATROL mode (src/gameplay/patrols/{calls,mode,model}.ts, src/gameplay/session/equipage.ts, src/ui/patrol/**, src/ui/screens/home-*.ts, vehicle voiture_bac) — the feature ALSO changed src/gameplay/patrols/{system,api,index}.ts: this is the biggest semantic risk; (2) four lots of fixes to police columns: parked blocks leaving their bays, departure from the stations of the 1er and the 8e (src/gameplay/session/journee.ts lineUp, convoy.ts), followers in a crowd, a column that WAITS for a player sitting at the wheel (ConvoyStatus.awaitingDriver), missions that start on arrival, autopilot fixes (src/sim/vehicles/autopilot*.ts), parkSpot / parkAround in src/sim/police/units.ts and src/gameplay/session/{setup,placement}.ts; (3) the command-map redesign as integrated on main (the feature has an older copy of it: only its OWN additions were applied here), then « carte-lisible » (src/ui/maps/labelLayout.ts: units at the same place grouped under one label, labels never overlap; SquadOrder.place: the radio names the place shown on the card; panelFollow shows a waiting column) and « commandant-carte » (bestUnit.ts / preview.ts / bravm.ts: BRAV-M on foot or on its motos as the card says). Redesign spec: ${designPath}.
 - Known leftovers of the current game, for information only: ${restesPath}.

THE PATCH. Write it EARLY and again after each batch of fixes, so that it always reflects the tree (the machine can restart without warning and cut you off):
   ${PATCH_CMD}
   (no commit; screenshots under tests/e2e/out must not be in the patch).
Tests: unit tests are headless (vitest, \`npx vitest run tests/unit/<name>\`), deterministic; the full suite takes 15–40 minutes: do NOT run it unless told. Browser scenarios are Playwright scripts under tests/e2e (each starts its own dev server on a free port; software WebGL is slow, about 0.4 s per frame; ONE browser at a time; pass --trace off). Long commands: run them with a timeout and wait in loops shorter than 9 minutes.`

const RES_SCHEMA = {
  type: 'object',
  properties: {
    conflicts: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' }, resolution: { type: 'string' } }, required: ['file', 'what', 'resolution'] } },
    semanticRisks: { type: 'array', items: { type: 'string' } },
    tscClean: { type: 'boolean' },
    unitTests: { type: 'string' },
    patchFiles: { type: 'integer' },
    notes: { type: 'string' },
  },
  required: ['conflicts', 'semanticRisks', 'tscClean', 'unitTests', 'patchFiles', 'notes'],
}
const VER_SCHEMA = {
  type: 'object',
  properties: {
    problems: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fixed: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } } }, required: ['title', 'evidence', 'fixed'] } },
    checked: { type: 'string' },
    tscClean: { type: 'boolean' },
    remaining: { type: 'array', items: { type: 'string' } },
    summaryFr: { type: 'string' },
  },
  required: ['problems', 'checked', 'tscClean', 'remaining', 'summaryFr'],
}
const END_SCHEMA = {
  type: 'object',
  properties: {
    tscClean: { type: 'boolean' },
    fullSuite: { type: 'string' },
    failuresFixed: { type: 'array', items: { type: 'string' } },
    patchPath: { type: 'string' },
    patchFiles: { type: 'integer' },
    remaining: { type: 'array', items: { type: 'string' } },
    summaryFr: { type: 'string' },
  },
  required: ['tscClean', 'fullSuite', 'failuresFixed', 'patchPath', 'patchFiles', 'remaining', 'summaryFr'],
}

phase('Résolution')
const res = await agent(`${COMMON}

YOUR JOB — STAGE 1 of 3: make the merged tree compile and its own tests pass.
1. \`git status --short | grep -E '^(UU|AA|DU|UD)'\` lists the files left with conflict markers (five: src/gameplay/patrols/index.ts, src/gameplay/patrols/system.ts, src/sim/police/command/convoy.ts, src/sim/police/units.ts, src/ui/command/core.ts). For each one, read BOTH sides and the history of each side before choosing (\`git log -p -5 -- <file>\` shows why the current game changed it; the feature's version is in /tmp/claude-0/hunt/commissariats/crs-simulation/<file>, and the plan / package reports explain why). Keep BOTH intents: the current game's behaviour must not regress and the feature must still work. Never resolve by taking one side wholesale. After resolving, \`git add\` the file.
2. Then look for conflicts git could NOT see: files the patch applied « cleanly » but whose neighbours changed in the current game — compare the feature's expectations with the current code for: src/gameplay/patrols/** (the feature's system.ts versus the current calls.ts / mode.ts / model.ts: who spawns patrols, who owns a patrol car, station patrols versus the player's patrol crew), src/sim/police/units.ts parkSpot / parkAround / UnitPlacement.parking (station bays versus parked blocks), src/gameplay/session/{journee,follow,setup,placement}.ts, src/sim/police/command/{convoy,api}.ts (awaitingDriver, held vehicles), src/ui/command/{core,orders,panelFollow,tacticalScreen,tacticalParts,bestUnit,intents,cardTypes,tacticalPreview,style,index}.ts (the feature's additions on top of the current redesign: check every call site still matches the current signatures), src/ui/maps/{overlay,scene,symbols,units}.ts versus the new labelLayout.ts (station symbols and badges must go through the label layout or be declared as obstacles so that nothing overlaps), src/main.ts (module order).
3. \`npx tsc --noEmit -p .\` clean.
4. Run, in small groups, the unit tests of the feature (tests/unit/commissariats*, integration.commissariats*, anything the package reports name) and the tests of the touched neighbours: tests/unit/patrol*, playtest.modes*, ui.patrol*, session.*, police-command.*, convoy.*, police.convoi*, ui-command.*, maps.*, integration.journee*, integration.session, playtest.colonne-joueur, vehicles.autopilot*. Fix source bugs. Update a test only when one side intentionally changed what the other's test checks (say so in your report).
5. Write the patch (command above) as soon as tsc is clean, and again at the end.
Return: conflicts (file, what clashed, how you resolved it), semanticRisks (every place where you suspect the two sides do not work together and that the next stage must play — be specific: file, function, scenario), tscClean, unitTests (commands and pass/fail counts), patchFiles (number of files in the patch), notes.`, { label: 'résolution:commissariats', phase: 'Résolution', schema: RES_SCHEMA, model: MODEL })

const risks = res ? JSON.stringify({ conflicts: res.conflicts, semanticRisks: res.semanticRisks, notes: res.notes }) : '(stage 1 returned nothing: start by checking `git status` for conflict markers and `npx tsc --noEmit -p .`)'

phase('Vérification croisée')
const simPrompt = `${COMMON}

YOUR JOB — STAGE 2 of 3, SIMULATION SIDE (a second agent checks the INTERFACE side in the same worktree at the same time).
OWNERSHIP: you own src/sim/**, src/gameplay/**, src/world/**, src/core/** and the unit tests about them. The other agent owns src/ui/**, src/render/**, src/input/** and tests/e2e/**. Do not edit the other agent's files: if you find a defect there, describe it in \`remaining\` with the exact file and fix you propose. If \`npx tsc --noEmit -p .\` reports an error in a file you do not own, the other agent is probably in the middle of an edit: wait a minute and retry.
Stage 1 resolved the conflicts and reported: ${risks}

Play the merged game with headless robots (model: the existing tests/unit/playtest.*.test.ts and integration.*.test.ts; \`createTestContext\` from '@/core/testing' loads the real Paris map) and prove that the feature and the current game work TOGETHER:
 a. PATROL mode (current game) with stations present: a BAC / Police secours crew starts its shift — where is its car, is it one of the station's parked vehicles or a separate one, do the 32 parked station vehicles disturb the crew's car, the calls, « Suivez-moi en véhicules », the return to the car; do station patrols (the feature's patrols/system.ts) and the player's patrol crew coexist (no double spawn, no stolen car, calls still reach the player).
 b. Service day (journée) from each base station: the column leaves the dressed station (bays, yard) and reaches the demonstration — run playtest.colonne-ia, playtest.colonne-ia-graines, integration.journee*, session.depart-base, playtest.colonne-joueur, and the strict roles test (PLAYTEST_STRICT=1 PLAYTEST_LIGHT=1 npx vitest run tests/unit/playtest.colonnes-roles.test.ts must stay 42/42). Known leftover of the current game that the feature may have solved or made worse: at the station of the 8e the rear-guard car was parked crosswise at the yard exit, at the 1er a van was parked nose into a tight corner — check both with the stations' explicit bays.
 c. Free mode and special missions (home screen modes) at Concorde, Bastille, République and at the hot spots: station vehicles never take part in a session column unless the commandant engages them; « tout le monde me suit » still holds; a player who takes a parked station vehicle can drive it; held vehicles are ignored by traffic clearing, escorts, handover, crowd detours.
 d. Engaging a station unit as commandant (same code path as the station card's « Engager ») while a session column is moving, during a nasse, and when the player sits at the wheel of a column vehicle (awaitingDriver); « Rentrer au commissariat » brings the unit back to its bays and the bays are free again.
 e. Determinism and state: two sessions in a row (session:ended then session:setup) leave no station unit, held flag or reserved bay behind; no Math.random / Date.now in the merged code paths.
Every mismatch is a bug: prove it with a failing test, fix the cause in your files, re-run. Write the patch after each batch. Finish with tsc clean (for your files).
Return: problems (title, evidence, fixed, files), checked (what you ran, with counts), tscClean, remaining (not fixed / not checked / defects in the other agent's files), summaryFr.`
const uiPrompt = `${COMMON}

YOUR JOB — STAGE 2 of 3, INTERFACE SIDE (a second agent checks the SIMULATION side in the same worktree at the same time).
OWNERSHIP: you own src/ui/**, src/render/**, src/input/**, tests/e2e/** and the unit tests about them. The other agent owns src/sim/**, src/gameplay/**, src/world/**, src/core/**. Do not edit the other agent's files: if you find a defect there, describe it in \`remaining\` with the exact file and fix you propose. If \`npx tsc --noEmit -p .\` reports an error in a file you do not own, the other agent is probably in the middle of an edit: wait a minute and retry.
Stage 1 resolved the conflicts and reported: ${risks}

Play the merged game in the browser like the player (Playwright; models: tests/e2e/verif-commissariats.mjs, commissariats.mjs, verif-commande-clavier.mjs, verif-commande-tel.mjs, verif-carte-lisible.mjs, verif-patrouille.mjs, verif-accueil-modes.mjs) on a laptop (1280x800, keyboard and trackpad) and on the phone (844x390 touch), and OPEN the screenshots (Read the PNG files) to judge them with your eyes:
 a. The command map with stations: the station symbols and their badges together with the current label layout (src/ui/maps/labelLayout.ts) — no label over another, units at the same place still grouped, the station name readable; key C / tap on a symbol opens the station card; the card follows the redesign (one card, at most six lines, a sentence « Ce qui va se passer », « Donner l'ordre » with Entrée, U / T / X), nothing was added to the first level (the player asked for FEWER buttons); engage a unit from a station to a street and watch it leave on the map; « Rentrer au commissariat »; the unit list « MES UNITÉS » and the follow-up show the station units correctly (and « attend votre départ » still appears for a column waiting for the commandant).
 b. The radio and the card name the same place for an order given to a station unit (SquadOrder.place), and station orders are worded like the others.
 c. The 3D dressing of the stations by day and by night (portal, lantern, flag, sign, painted bays, vehicles in columns) seen from the street on foot and from a vehicle; cost per frame on the phone within the budget the scenario prints; no z-fighting, nothing floating, no vehicle inside a wall.
 d. PATROL mode in the browser with stations present: the call card, the « ORDRES » block, the map opened by the crew (read-only banner naming the call) — unchanged and not disturbed by station symbols or the C key.
 e. Home screen: the four modes still start; a service day starts from a dressed station and the « Ma mission » card is coherent.
 f. Run the existing scenarios of every feature and fix what the merge broke (in the source when it is a real defect, in the scenario when its expectation is obsolete — say which): verif-commissariats.mjs (all parts), commissariats.mjs, command.mjs (also prints the interface cost per frame: must stay under 1 ms on average), verif-commande-clavier / -pointeur / -tel / -liaison, verif-carte-lisible, verif-hud-ordres, verif-ordres-carte, verif-suivi-ordres, verif-accueil-modes, verif-modes-clavier, verif-modes-libre, verif-patrouille, verif-journee, verif-ma-mission, verif-ordres-clairs, game.mjs, ui.mjs, input.mjs. Also run the unit tests tests/unit/ui-command.*, ui.*, maps.*, ui-maps*, input.*.
Write the patch after each batch. Finish with tsc clean (for your files).
Return: problems (title, evidence, fixed, files), checked (scenarios run with counts, what you saw in the screenshots), tscClean, remaining (not fixed / not checked / defects in the other agent's files), summaryFr.`
const [sim, ui] = await parallel([
  () => agent(simPrompt, { label: 'vérif:simulation', phase: 'Vérification croisée', schema: VER_SCHEMA, model: MODEL }),
  () => agent(uiPrompt, { label: 'vérif:interface', phase: 'Vérification croisée', schema: VER_SCHEMA, model: MODEL }),
])
const leftovers = JSON.stringify({ simulation: sim ? { problems: sim.problems, remaining: sim.remaining } : 'no report (agent cut off): redo a quick check of the simulation side', interface: ui ? { problems: ui.problems, remaining: ui.remaining } : 'no report (agent cut off): redo a quick check of the interface side' })

phase('Bouclage')
const end = await agent(`${COMMON}

YOUR JOB — STAGE 3 of 3: close the merge. You own every file now (the two stage-2 agents have finished).
Stage 2 reported: ${leftovers}
1. Fix every item of « remaining » that names a defect in a file its finder did not own, when the fix is clear and local; leave design questions alone and list them.
2. \`npx tsc --noEmit -p .\` clean.
3. Run the WHOLE unit suite once: \`timeout 3400 npx vitest run > /tmp/claude-0/fusion-commissariats-full.log 2>&1; echo EXIT $? >> /tmp/claude-0/fusion-commissariats-full.log\` (15–40 minutes; wait in loops shorter than 9 minutes). For each failure: re-run the file alone (a test that only fails under load on a wall-clock limit is not a regression: say so), otherwise find the cause and fix it, then re-run the affected files. A test of the current game must not be weakened to make the feature pass.
4. Rewrite the patch (command above) and count its files.
Return: tscClean, fullSuite (files / tests passed and failed, and what each failure was), failuresFixed, patchPath, patchFiles, remaining (honest list of what is still wrong or unchecked), summaryFr (short French summary for the player: what the merged game now does, what was fixed during the merge, what is left).`, { label: 'bouclage:commissariats', phase: 'Bouclage', schema: END_SCHEMA, model: MODEL })

return { resolution: res, simulation: sim, interface: ui, bouclage: end }
