export const meta = {
  name: 'commissariats-dans-ordres-directs',
  description: 'Reporte les commissariats (version 22) dans l\'arbre de travail des ordres directs : résolution des dix conflits, un seul mécanisme par besoin, tests des deux chantiers, puis contre-vérification indépendante par des robots',
  phases: [
    { title: 'Résolution', detail: 'dix fichiers en conflit, compilation, tests ciblés des deux chantiers' },
    { title: 'Contre-vérification', detail: 'relecture indépendante, robots joueurs, tests rouges connus' },
  ],
}
const { worktree, reports, plan, mergeJournal1, mergeJournal2, runs } = args
const MODEL = args.model || 'opus'
const proj = `${worktree}/crs-simulation`
const COMMON = `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite). The player is French, plays on a MacBook Air WITHOUT a mouse and on a phone, and demands ZERO bugs. All UI text and code comments are in French: keep that language and the style of the surrounding code.

YOUR WORKSPACE: the git worktree ${worktree} (project in ${proj}; node_modules there is a symlink: never touch it). Work ONLY inside this worktree. NEVER modify anything under /home/user/SafeDeal and never run git commands there. Do NOT commit, push, checkout another revision, or use git stash. Everything is uncommitted (staged or not): that is expected.

SHARED WORKTREE: two other agents are working here right now on packages of the same feature — P9 (keyboard and order wheel: src/input/{bindings,buttons,labels}.ts, src/ui/core/kit.ts, src/ui/command/{orderWheel,wheelKeys}.ts, src/ui/command/direct/designate.ts) and P12 (the player's detainee: src/gameplay/law/**). Do not edit their files (law/handover.ts had a conflict: the coordinator already resolved it); re-read a file immediately before you edit it; never revert or reformat what you did not write.

SITUATION. This worktree holds the feature « ordres directs » under construction — the player's request after playing as commandant in « Missions spéciales »: « je pouvais donner zéro ordre, ils ne suivaient pas, la BRAV-M ne bougeait pas… les CRS me suivent mais n'ont pas d'ordre… je peux donner directement des ordres et ils y vont direct ». Its plan is ${plan} (the coordinator's updates at the top, then the specification; section 8 lists the packages). Packages DONE so far, with their reports in ${reports} (READ the reports of P2, P3, P4, P5, P6, P8 — summaries, deviations, openIssues): P1 order logic, P2 seated units get out then execute + « en garde », P3 player orders win / one mechanism \`takeOver(squadId, order?)\` between a player order and a column / arrival in seconds / \`carrying\` / \`holding\` / stage \`annule\`, P4 BRAV-M rewritten (distance rule, internalOrder / keepsOwnOrder hooks, chief poste), P5 setup (everyone follows, BRAV-M parent, crewed cellular vans, \`session.remise\`), P6 follow / service day (« Avec moi » persistent, far units by van, BRAV-M chief), P7 radio, P8 field-order engine (\`command.direct\`), P13 unit arrests (\`police.arrests\`).
Meanwhile the PUBLISHED game (version 22) received the feature « commissariats » — designed police stations in Paris with parked vehicles, units the commandant engages from the command map (key C) and sends back (« Rentrer au commissariat »). It was merged and verified twice against the game without « ordres directs »; the reports of those merges are the journals ${mergeJournal1} and ${mergeJournal2} (one JSON line per agent with a "result": read « résolution », « vérif:* », « bouclage », « contre-vérif »). The coordinator has just applied that merge here by a three-way apply. TEN files are left with conflict markers: src/gameplay/session/follow.ts, src/gameplay/session/journee.ts, src/sim/police/command/api.ts, src/sim/police/command/bravm.ts, src/sim/police/command/convoy.ts, src/sim/police/command/system.ts, src/sim/police/units.ts, src/ui/command/core.ts, src/ui/command/index.ts, tests/unit/playtest.commandant-mission-colonne.test.ts.

WHAT BOTH SIDES DID ABOUT THE SAME NEEDS (these must end as ONE mechanism each, not two):
 - « an order on foot given when the column arrives »: P2 (maneuver.ts: seated agents get out first, one per vehicle every 0.35 s, drivers stay) + P3 (takeOver releases the unit from the column) versus the commissariats merge (its own takeOver set in convoy.ts, then « the agents get out to carry the order out, the drivers stay at the wheel », and beginDisembark skipping taken squads). Keep P2/P3's mechanism as the one in force; keep from the other side only what P2/P3 do not cover, and prove with the tests of both that the behaviour holds (tests/unit/police.ordre-a-bord, police.convoi-ordre-joueur, integration.commissariats-commandant (b, b2), playtest.commandant-mission-colonne).
 - « a unit leaves a column it is part of »: P3's release inside takeOver versus the merge's fix for « Rentrer au commissariat » given to a group during the company's column (its vehicle leaves the column and drives home, test integration.commissariats-commandant (c2)).
 - « BRAV-M whose motos make no progress »: P4's rules (stall → dismount and walk, never « accès bloqué » on a player order, pilots bring the motos) versus the merge's thinkRide rule (« Itinéraire barré… pied à terre ») and its isReturningHome guard (a BRAV-M sent home near its bays must remount and ride home, test commissariats.bravm-retour-proche).
 - parking / crews in units.ts: P5 (createBravm parentId, \`cellular\` option, crewed vans, motos never on a lawn) versus the merge (placeVehicle with reserved station bays and a length, createEquipage seating limited to station crews).
 - service day in journee.ts / follow.ts: P6 (thinkRejoin → suivre, « Avec moi » persistent, BRAV-M attached, chief's waiting moto, \`annule\`) versus the merge (engageOthers skips station units, isHeldVehicle guards on free seats and BRAV-M fleets, base bays kept free).
 - the interface core (src/ui/command/core.ts, index.ts): P1/P4/P8 (drivesTo, CREW_ORDERS, asPlayer, the \`command.direct\` service, takeOver before an order) versus the merge (engageFromCommissariat, canOrder / atPost filter, station UI installed when the service exists, BRAV-M « faire_mouvement » as a column).
Tests: headless vitest (\`npx vitest run tests/unit/<name>\`), real Paris map, deterministic. NEVER run the whole suite (the machine is shared). Wait in loops shorter than 9 minutes.`

const RES_SCHEMA = {
  type: 'object',
  properties: {
    conflicts: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' }, resolution: { type: 'string' } }, required: ['file', 'what', 'resolution'] } },
    oneMechanism: { type: 'array', items: { type: 'object', properties: { need: { type: 'string' }, kept: { type: 'string' }, removed: { type: 'string' } }, required: ['need', 'kept'] } },
    tscClean: { type: 'boolean' },
    unitTests: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['conflicts', 'oneMechanism', 'tscClean', 'unitTests', 'risks'],
}
const VER_SCHEMA = {
  type: 'object',
  properties: {
    problems: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fixed: { type: 'boolean' } }, required: ['title', 'evidence', 'fixed'] } },
    redTests: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } }, required: ['test', 'status'] } },
    checked: { type: 'string' },
    tscClean: { type: 'boolean' },
    remaining: { type: 'array', items: { type: 'string' } },
    summaryFr: { type: 'string' },
  },
  required: ['problems', 'redTests', 'checked', 'tscClean', 'remaining', 'summaryFr'],
}

phase('Résolution')
const res = await agent(`${COMMON}

YOUR JOB — STAGE 1 of 2.
0. FIRST, within your first minutes, make the tree PARSE again for the two agents working beside you: go through the ten files and remove the conflict markers with a provisional but syntactically valid choice (when in doubt keep « ours », the ordres-directs side, and note the place), run \`npx tsc --noEmit -p .\` to see what is left. Then do the real work below.
1. Resolve each conflict for real: read BOTH sides and why each exists (ours: the package reports and \`git diff HEAD -- <file>\`; theirs: the merge journals and the published game's version of the file, readable at /home/user/SafeDeal/crs-simulation/<file> — read only). Keep BOTH intents; for each need listed above end with ONE mechanism and say which one you kept and what you removed. \`git add\` each resolved file.
2. Conflicts git could not see: every place where the commissariats code (src/gameplay/commissariats/**, src/world/commissariats/**, src/gameplay/patrols/**, src/ui/command/{commissariatsLink,commissariatsModel,panelCommissariats}.ts, src/sim/traffic/parking.ts) meets what the packages changed — orders given to a station unit must carry \`byPlayer\` and go through the same \`takeOver\` rule; a station unit engaged by the commandant gets out and executes an order on foot like any other; the crewed cellular vans of P5 and the three station cellular vans must not be confused (\`session.remise\`, \`police.arrests\` of P13 use every cellular van of the dispositif — a held station van is not one); « tout le monde me suit » at setup must not give \`suivre\` to units resting at a station; the field-order engine (\`command.direct\`, src/ui/command/direct/**) and its « À qui » cycle (who.ts) must treat station units as the plan's §1.4 says (reinforcements last); the C key of the map and the new field keys do not clash.
3. \`npx tsc --noEmit -p .\` clean (errors located in files P9 / P12 are editing are theirs: report them, do not fix them by guessing).
4. Run in small groups and fix what your merge broke: tests/unit/commissariats*, integration.commissariats*, playtest.commissariats, patrols.*, patrol.*, traffic.commissariats, ui-command.commissariats, ui-maps.commissariats, render-commissariats.*, police.parking-slots, AND police.ordre-a-bord, police.suivre-en-garde, police.convoi-ordre-joueur, police-command.*, convoy.*, police.convoi*, bravm.*, session.*, integration.fin-de-colonne, integration.avec-moi, integration.suivre*, integration.journee*, integration.colonne-places-joueur, playtest.commandant-mission-colonne, playtest.commandant-terrain, playtest.bravm-passager, ui-command.direct-*, ui-command.portee, playtest.colonne-joueur. A test whose premise one side changed on purpose is adapted (say so); a test of either side is never weakened to make the other pass.
Return: conflicts (file, what clashed, how resolved), oneMechanism (need, kept, removed), tscClean, unitTests (commands with pass/fail counts), risks (what the second agent must play first).`, { label: 'résolution:commissariats→ordres-directs', phase: 'Résolution', schema: RES_SCHEMA, model: MODEL })

phase('Contre-vérification')
const ver = await agent(`${COMMON}

YOUR JOB — STAGE 2 of 2: an INDEPENDENT check. Another agent has just resolved the ten conflicts and reported: ${res ? JSON.stringify(res) : '(no report: check `git status` for conflict markers and `npx tsc --noEmit -p .` first)'}
Do not trust the report.
1. Read the resolved regions (convoy.ts, bravm.ts, units.ts, follow.ts, journee.ts, command/api.ts, command/system.ts, ui/command/core.ts, ui/command/index.ts) against both sides and look for a lost intent, a duplicated mechanism, or a combination that cannot work.
2. Play with headless robots (reuse tests/unit/playtest.commandant-mission.lib.ts — it has a PLAYTEST_STATIONS=1 option —, playtest.commissariats.test.ts, integration.commissariats-commandant.test.ts, police.convoi-ordre-joueur.test.ts, integration.fin-de-colonne.test.ts): (a) the player's own game with stations present: \`PLAYTEST_ARRIVAL=passager\` on playtest.commandant-mission-01 and -04, with and without PLAYTEST_STATIONS=1 (earlier logs in ${runs}: nothing may be worse than their « after » runs); (b) a commandant engages a station unit, gives it an order on foot as it arrives: the agents get out and carry it out, the order is kept; (c) « Rentrer au commissariat » to a group during the company's column; (d) a service day from the stations of the 1er and of the 8e: « tout le monde me suit » holds, the cellular vans of the company leave with the column, station vehicles stay parked; (e) at the start of a session nobody resting at a station follows the player; an arrest by a unit uses a crewed van of the dispositif, never a held station van; (f) two sessions in a row leave no station state and no direct-order state behind.
3. Known red tests of this worktree — re-run each and report its status; fix those that the merge or stale expectations explain, leave to the next packages those marked so: tests/unit/ui-command.direct-logique (3 cases: rules c and e, the U cycle — expectations to update after P5 put the BRAV-M and the crewed vans in the company), ui-command.qui (wide street, 2 sections), ui-command.panneaux (« Engins (2) ») — update these three to the new setup, checking that the NEW values are right for the player; playtest.commandant-compagnie-depart (Concorde seeds 21 and 7: lead vehicles stuck behind standing people — left to package P17, do not fix); session.cellulaires « journée de service » (company vans stuck in park/manoeuvre — left to P17); playtest.colonnes-roles strict (\`PLAYTEST_STRICT=1 PLAYTEST_LIGHT=1\`; 4 driver cases were red before this merge — report the count, left to P17).
4. Every mismatch in 1–2 is a bug: prove it with a failing test, fix the cause, re-run. \`npx tsc --noEmit -p .\` clean.
Return: problems (title, evidence, fixed), redTests (test, status after your pass, note), checked (what you ran with counts), tscClean, remaining (honest list), summaryFr (short French summary for the player).`, { label: 'contre-vérif:commissariats→ordres-directs', phase: 'Contre-vérification', schema: VER_SCHEMA, model: MODEL })

return { resolution: res, verification: ver }
