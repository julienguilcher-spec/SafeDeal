export const meta = {
  name: 'refusion-commissariats',
  description: 'Reporte la fusion des commissariats sur la version à jour (trois lots de corrections en plus) : résolution des trois conflits de colonnes, tests ciblés, puis contre-vérification indépendante',
  phases: [
    { title: 'Résolution', detail: 'trois fichiers en conflit, compilation, tests ciblés, vitrines collées aux portails' },
    { title: 'Contre-vérification', detail: 'relecture indépendante des résolutions, robots joueurs, correctif final' },
  ],
}
const { worktree, patchPath, firstMergeJournal, restes, runs } = args
const MODEL = args.model || 'opus'
const proj = `${worktree}/crs-simulation`
const PATCH_CMD = `cd ${worktree} && git add -A -- crs-simulation/src crs-simulation/tests/unit crs-simulation/harness && git add -u -- crs-simulation && (git add -A -- crs-simulation/tests/e2e/*.mjs 2>/dev/null || true) && git diff --cached --binary HEAD > ${patchPath}`
const COMMON = `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite). The player is French, plays on a MacBook Air WITHOUT a mouse and on a phone, and demands ZERO bugs. All UI text and code comments are in French: keep that language and the style of the surrounding code.

YOUR WORKSPACE: the git worktree ${worktree} (project in ${proj}; node_modules there is a symlink: never touch it). Work ONLY inside this worktree. NEVER modify anything under /home/user/SafeDeal and never run git commands there. Do NOT commit, push, checkout another revision, or use git stash. The merge is STAGED / in the working tree, uncommitted: that is expected.

SITUATION. The feature « commissariats » (designed police stations in Paris with their vehicles parked in columns; the commandant engages station units from the command map with key C and sends them back with « Rentrer au commissariat ») was merged and verified against an EARLIER state of the game: three agents resolved conflicts, checked the simulation and the interface, and ran the full suite. Their reports are in the journal ${firstMergeJournal} (one JSON line per agent with a "result": read the lines of « résolution », « vérif:simulation », « vérif:interface » and « bouclage », especially their "conflicts", "problems" and "remaining"). Since then the game received three lots of fixes, which are the BASE COMMIT of this worktree (\`git log -1\`; \`git show --stat HEAD\` lists their files):
 - « commandant-mission » — the player's own game (he played commandant in « Missions spéciales » and said: « je pouvais donner zéro ordre, ils ne suivaient pas, la BRAV-M ne bougeait pas »): an order given on arrival is no longer replaced by the column's end-of-trip « débarquez » (ConvoyControl.takeOver, disembarkRest, changes in arrive() / reset() / beginDisembark() in src/sim/police/command/convoy.ts, command/system.ts, command/api.ts, src/ui/command/core.ts), the mission waits for the column (columnIn in src/gameplay/missions/system.ts), injuries and deaths of the trip no longer fail the mission, the BRAV-M moves when called (bravm.ts), « Suivez-moi » reaches the BRAV-M (sendLine.ts). Robot tests: tests/unit/playtest.commandant-mission-colonne.test.ts and playtest.commandant-mission-NN.test.ts (these skip unless PLAYTEST_ARRIVAL=passager|volant|devant is set). Run logs: ${runs}.
 - « colonne-tete-bloquee » — lineUp no longer lines the file up through a quay wall (convoy.ts), a point that cannot be reached by vehicle is said on the radio (noRoute / footTo / reportNoRoute in convoy.ts), CENTRAL no longer floods the radio (src/gameplay/incidents/radio.ts, src/gameplay/radio/queue.ts), siren (src/gameplay/session/engins.ts).
 - « commandant-carte-3 » — order card texts for patrol crews, nasse, « Autre unité » (src/ui/command/{intents,preview,bestUnit,tacticalScreen}.ts).
The commissariats merge patch (81 files) has just been re-applied here by a three-way apply. THREE files are left with conflict markers: src/sim/police/command/api.ts, src/sim/police/command/convoy.ts, src/sim/police/command/system.ts.

THE PATCH. Write it as soon as the tree compiles, and again after each batch of fixes (the machine can restart without warning):
   ${PATCH_CMD}
Tests: headless vitest (\`npx vitest run tests/unit/<name>\`), deterministic, real Paris map. NEVER run the whole suite (the machine is shared by eight agents). Wait in loops shorter than 9 minutes.`

const RES_SCHEMA = {
  type: 'object',
  properties: {
    conflicts: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' }, resolution: { type: 'string' } }, required: ['file', 'what', 'resolution'] } },
    otherFixes: { type: 'array', items: { type: 'string' } },
    tscClean: { type: 'boolean' },
    unitTests: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    patchFiles: { type: 'integer' },
  },
  required: ['conflicts', 'otherFixes', 'tscClean', 'unitTests', 'risks', 'patchFiles'],
}
const VER_SCHEMA = {
  type: 'object',
  properties: {
    problems: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fixed: { type: 'boolean' } }, required: ['title', 'evidence', 'fixed'] } },
    checked: { type: 'string' },
    tscClean: { type: 'boolean' },
    patchPath: { type: 'string' },
    patchFiles: { type: 'integer' },
    remaining: { type: 'array', items: { type: 'string' } },
    summaryFr: { type: 'string' },
  },
  required: ['problems', 'checked', 'tscClean', 'patchPath', 'patchFiles', 'remaining', 'summaryFr'],
}

phase('Résolution')
const res = await agent(`${COMMON}

YOUR JOB — STAGE 1 of 2.
1. Resolve the three conflicted files. For each conflict read BOTH sides and why each exists (the current game's side: \`git log -p -3 -- <file>\` is not available for uncommitted lots, so read \`git show HEAD -- <file>\`; the feature's side: the first merge's reports). Keep BOTH intents — in particular: the player's order given on arrival must still win over the column's « débarquez » (takeOver / disembarkRest), a column whose vehicle the player drives still waits for him (awaitingDriver), lineUp still avoids a file through a wall, an unreachable point is still said on the radio; AND station units still drive without sirens on a non-urgent return (driveOne with urgence:false, also in finishAlone and in every new driveTo the three lots added to convoy.ts), held station vehicles are still ignored, a station crew still leaves at once, a vehicle left driverless by the player is re-manned, a station unit stopped far from its bays is relaunched. Never take one side wholesale. \`git add\` each resolved file.
2. Look for the conflicts git could not see: every NEW call the three lots added in convoy.ts / command/system.ts / command/api.ts / src/ui/command/core.ts / src/gameplay/missions/system.ts (takeOver, disembarkRest, columnIn, reportNoRoute, the lineUp probe vehicle) — does it treat station units and held vehicles correctly (a station unit engaged by the commandant then given an order on arrival; columnIn must not wait for station vehicles that are not part of the mission's column; the lineUp probe must not use a held station vehicle or a reserved bay; the no-route report for a station unit)?
3. \`npx tsc --noEmit -p .\` clean, then write the patch.
4. Run in small groups and fix what is red (a source bug → fix the source; a test whose premise one side changed on purpose → adapt it and say so): tests/unit/commissariats*, integration.commissariats*, playtest.commissariats, patrols.*, patrol.*, traffic.commissariats, ui-command.commissariats, ui-maps.commissariats, police.parking-slots, police-command.*, convoy.*, police.convoi*, integration.journee*, session.*, integration.session, playtest.colonne-joueur, playtest.colonne-ia, playtest.commandant-mission-colonne, playtest.commandant-compagnie*, playtest.commandant-terrain, vehicles.autopilot*, vehicles.colonne-*, and \`PLAYTEST_ARRIVAL=passager npx vitest run tests/unit/playtest.commandant-mission-01.test.ts tests/unit/playtest.commandant-mission-04.test.ts\`.
5. One leftover of the first merge to fix here, WITHOUT changing the simulation (an earlier attempt removed the shops in src/sim/props/tiles.ts and broke six deterministic tests by shifting random draws and entity ids — do NOT do that): on the real map a shop front from the map data stands on the station facade right next to the POLICE portal at the 9e (a « banque » 3.5 m from the door, the RF plate on its window), at the caserne des Célestins (an « agence » 0.9 m from the door) and at the 3e (two shops 3.7 m and 5.0 m from the door). Hide them at RENDER time only (the shop entity stays in the simulation, same ids and draws): in the renderer of shop fronts, skip the dressing of a shop whose window span overlaps the dressed width of a station door (data in src/world/commissariats/), so that the facade shows the station's own dressing. Prove it with a unit test on the pure overlap function and the three real cases.
Return: conflicts (file, what clashed, how resolved), otherFixes, tscClean, unitTests (commands with pass/fail counts), risks (what the second agent must play first), patchFiles.`, { label: 'résolution:commissariats-2', phase: 'Résolution', schema: RES_SCHEMA, model: MODEL })

phase('Contre-vérification')
const ver = await agent(`${COMMON}

YOUR JOB — STAGE 2 of 2: an INDEPENDENT check. Another agent has just resolved the three conflicts and reported: ${res ? JSON.stringify(res) : '(no report: check `git status` for conflict markers and `npx tsc --noEmit -p .` first)'}
Do not trust the report. 
1. Read the resolved regions of src/sim/police/command/{convoy,system,api}.ts against both sides (\`git show HEAD -- <file>\` for the current game; the first merge's reports for the feature) and look for an intent that was lost or a combination that cannot work.
2. Play it with headless robots (reuse tests/unit/playtest.commandant-mission.lib.ts, playtest.commissariats.test.ts, integration.commissariats.test.ts, playtest.colonne-joueur.test.ts): (a) the player's exact game with stations present — \`PLAYTEST_ARRIVAL=passager\` and \`PLAYTEST_ARRIVAL=volant\` on tests/unit/playtest.commandant-mission-01.test.ts and -04 (compare with the logs in ${runs}: nothing may be worse than « after »); (b) a commandant who engages a station unit (same code path as the station card), gives it an order when it arrives, and the order is kept (not replaced by « débarquez »); (c) « Rentrer au commissariat » while a mission column is still on the road; (d) a service day starting from the stations of the 1er and of the 8e: the column leaves without pushing or waiting behind parked station vehicles, and reaches the place; (e) two sessions in a row leave no station state behind.
3. Every mismatch is a bug: prove it with a failing test, fix the cause, re-run. \`npx tsc --noEmit -p .\` clean. Rewrite the patch (command above), count its files, and check \`git apply --check -R ${patchPath}\`.
Return: problems (title, evidence, fixed), checked (what you ran with counts), tscClean, patchPath, patchFiles, remaining (honest list of what is still wrong or unchecked; known leftovers of the first merge are listed in ${restes} and need not be repeated), summaryFr (short French summary for the player).`, { label: 'contre-vérif:commissariats-2', phase: 'Contre-vérification', schema: VER_SCHEMA, model: MODEL })

return { resolution: res, verification: ver }
