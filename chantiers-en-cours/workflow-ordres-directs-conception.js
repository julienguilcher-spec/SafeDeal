export const meta = {
  name: 'ordres-directs-conception',
  description: 'Retour du joueur (ordres impossibles en arrivant, BRAV-M immobile, interpellés sans fourgon) : diagnostic par des robots joueurs, puis conception des ordres directs sur le terrain — trois propositions, synthèse notée, critique joueur',
  phases: [
    { title: 'Diagnostic', detail: 'rejouer la partie du joueur : arrivée sur la manifestation, ordres du terrain, BRAV-M, interpellés' },
    { title: 'Propositions', detail: 'trois concepteurs indépendants, trois angles' },
    { title: 'Synthèse', detail: 'note les propositions, compose le cahier des charges et ses paquets' },
    { title: 'Critique joueur', detail: 'attaque le cahier des charges comme le joueur (sans souris, téléphone) et le corrige' },
  ],
}
const { worktree, outDir, mergedTree, designCommande, restes } = args
const MODEL = args.model || 'opus'
const proj = `${worktree}/crs-simulation`

const PLAYER = `THE PLAYER'S OWN WORDS, just after playing the current version (French, verbatim — this is the brief):
« En fait, c'est toujours le bordel, là. Je suis arrivé sur une manifestation, c'était n'importe quoi. Je pouvais donner zéro ordre, ils ne suivaient pas. La BRAV-M, j'arrivais pas à leur donner d'ordre aussi, ils bougeaient pas. Donc bon, c'est encore un peu flou. Pour l'escorte aussi, c'est encore un peu flou, tu vois. En fait, j'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire pour les mettre. Donc il faut toujours qu'il y ait quelques wagons pour pouvoir mettre les interpellés qui les emmènent au commissariat. Mais surtout, là, c'était pas du tout assez réactif, on comprenait rien. Les CRS, ils me suivent, mais en fait, ils n'ont pas d'ordre. Enfin, il faut vraiment que tu simplifies ce process où, en fait, je peux donner directement des ordres et ils y vont direct, quoi. Parce que là, c'était incompréhensible. »
Earlier requests that still hold: « tout le monde doit me suivre, c'est obligatoire » ; « les unités exécutent mes ordres, directement » ; « il y a beaucoup trop de boutons… rends ça beaucoup plus stratégique et beaucoup plus intuitif » ; « il faut que je voie l'ordre du commandant quand je suis CRS » ; « zéro bug » ; « je veux que tu sois autonome et que tu règles tout ».
He plays on a MacBook Air WITHOUT a mouse (keyboard + trackpad: precise pointing and repeated clicking are painful) and on a phone (touch, 844x390 landscape). He is not a police expert: jargon loses him. We do not know which poste and mode he was playing: assume a commanding poste (commandant, chef de section, chef de groupe, BRAV-M chief) arriving at a demonstration — in the service day (column from the station), in free mode, in a special mission, and in patrol mode.`

const CONTEXT = `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite). All UI text and code comments are in French.

WORKSPACE: the git worktree ${worktree} (project in ${proj}; node_modules is a symlink: never touch it). Its HEAD is the game as the player has it (version 20) plus a few fixes to the order card. This is a DIAGNOSIS / DESIGN job: do NOT modify any source file of the project, do not commit, no git stash, never touch /home/user/SafeDeal. You MAY add scratch probe tests under ${proj}/tests/unit/zz-sonde-*.test.ts to run robots (delete them when done) and write documents, scripts and screenshots ONLY under ${outDir}. Machine: 4 cores shared by several agents — never run the whole test suite; one browser at a time; wait in loops shorter than 9 minutes.

HOW TO PLAY HEADLESS: unit tests use \`createTestContext\` from '@/core/testing' (real Paris map, deterministic). Robots that play like a player exist: tests/unit/playtest.*.test.ts (playtest.commandant-terrain / -compagnie / -interpeller go through the same code as the order card; playtest.colonne-joueur boards and drives; playtest.ordres-clairs follows the « Ma mission » card; playtest.modes*, playtest.missions-*). Browser scenarios: tests/e2e/*.mjs (Playwright, each starts its own dev server; software WebGL ≈ 0.4 s per frame; helpers in tests/e2e/lib.mjs; window.__CRS and window.__cmd expose the context).

WHAT EXISTS TODAY (entry points, not a full list):
- Command map (Tab), redesigned last night: six intentions (Envoyer E, Bloquer une rue B, Encercler N, Disperser D, Interpeller I, Secours S, Plus… O), one order card, « Donner l'ordre » (Entrée). Code: src/ui/command/{intents,sendLine,bestUnit,preview,tacticalScreen,tacticalState,tacticalKeys,core,scope,orders}.ts. Spec: ${designCommande}.
- On the field (HUD): the « ORDRES » block src/ui/command/quickActions.ts with only four lines (« Suivez-moi à pied » F→1, « Suivez-moi en véhicules » F→2, « Secours ici » F→7, « Carte de commandement » Tab), the order wheel src/ui/command/{orderWheel,wheel,wheelKeys}.ts (key F), the adjoint's proposals (P / Shift+P), the « Ma mission » card src/ui/hud/mission.ts and src/gameplay/session/{mission,executant}.ts, the patrol call card src/ui/patrol/dispatch.ts (Y), touch overlay src/input/touch/**, bindings src/input/bindings.ts.
- Following the player: src/gameplay/session/follow.ts (« avec moi » on foot, column in vehicles), src/sim/police/command/convoy.ts (columns, awaitingPlayer / awaitingDriver), src/gameplay/session/journee.ts (service day stages).
- Police units and orders: src/sim/police/** (mcore.ts orders, brain.ts, ops*.ts, ops-arrest.ts, special.ts, command/bravm.ts, radio.ts ack phrases, units.ts), src/core/contracts.ts (SquadOrder).
- Arrests and detainees: src/sim/police/ops-arrest.ts, src/gameplay/law/** (handover.ts, canArrest), the player's own arrest action (search for menottes / interpeller in src/sim/roles and src/gameplay), the cellular van vehicle kind (search « cellulaire » in src/sim/vehicles/defs.ts, src/gameplay/session/setup.ts, src/sim/police/units.ts).
- A feature being merged right now (NOT in your worktree; readable in ${mergedTree}): designed police stations with their parked vehicles (including cellular vans, e.g. « CELLULAIRE 75-01 »), units the commandant can engage from a station, « Rentrer au commissariat » where a unit hands over its detainees (src/gameplay/commissariats/**, src/gameplay/law/handover.ts).
- Known leftovers already listed (do not rediscover, but use them): ${restes}. One of them is BLOCKING and is being fixed by another agent right now: « Toute la compagnie » ordered in vehicles at the Concorde — the water cannon at the head of the file stays 'bloque mur' and the whole column waits behind it forever.`

const DIAG_SCHEMA = {
  type: 'object',
  properties: {
    reportPath: { type: 'string' },
    blockers: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string' }, repro: { type: 'string' }, cause: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, fixIdea: { type: 'string' } }, required: ['title', 'severity', 'repro', 'cause', 'fixIdea'] } },
    facts: { type: 'array', items: { type: 'string' } },
    notPlayed: { type: 'array', items: { type: 'string' } },
  },
  required: ['reportPath', 'blockers', 'facts', 'notPlayed'],
}

phase('Diagnostic')
const DIAGS = [
  { key: 'arrivee', title: 'Arriving at a demonstration and being unable to give any order', prompt: `REPLAY THE PLAYER'S GAME: « Je suis arrivé sur une manifestation… je pouvais donner zéro ordre, ils ne suivaient pas ».
For each commanding poste (commandant d'unité, chef de section, chef de groupe; read src/ui/command/scope.ts for who may order what) and each way of arriving — (a) service day: the column leaves the station, the player rides as a passenger, then again as the DRIVER of a column vehicle, arrival, unloading; (b) free mode at Concorde, Bastille, République: the session starts with the units in their vans or deployed; (c) a special mission from the home screen; (d) patrol mode sent to a demonstration — write robots that play exactly like the player and, from the moment he ARRIVES until two minutes later, try EVERY way of giving an order, every 10 seconds: the four lines of the field « ORDRES » block, every sector of the order wheel, the adjoint's proposal (accept), and on the command map each of the six intentions with the card's own proposal. For every attempt record: accepted or refused (and the exact text shown / said), the delay between the order and the first agent MOVING, what each unit is doing 5 s, 20 s and 60 s later, and the service-day / convoy stage at that moment (embarquement, route, sur place, débarquement, awaitingPlayer, awaitingDriver, afterConvoy queues…).
Find every situation where the player can give NO order or where the order is accepted but nothing moves (units still seated in the vans, convoy not « arrived », scope read-only by mistake, the map opened while seated, the unit list empty, « Sans ordre » with the follow order silently dropped, a column that never unloads…). For each one give the root cause in the code (file, function, condition) and the fix you recommend. Also measure the NORMAL case: how long between arrival and the first order really being carried out, and say which waits a player would find incomprehensible.` },
  { key: 'terrain', title: 'Orders from the field, units that follow « sans ordre », BRAV-M that does not move, reactivity', prompt: `THE PLAYER: « Les CRS, ils me suivent, mais en fait, ils n'ont pas d'ordre », « La BRAV-M, j'arrivais pas à leur donner d'ordre, ils bougeaient pas », « c'était pas du tout assez réactif, on comprenait rien », « je peux donner directement des ordres et ils y vont direct ».
1. INVENTORY of what a player on foot (and seated in a vehicle) can order WITHOUT opening the command map, per poste (commandant, chef de section, chef de groupe, BRAV-M chief / pilot, patrol chef de bord, plain CRS): keys, wheel sectors, touch buttons, what each does exactly, to which units, and what the units do once they have arrived « avec moi » (their state, formation, facing, what the HUD says: « sans ordre »?). Say precisely what a player who wants « allez là », « tenez cette rue », « repoussez-les », « chargez », « interpellez celui-là », « revenez » has to do today, in number of key presses / taps and seconds — from the field and through the map.
2. BRAV-M: play a commandant (free mode and service day) who has a BRAV-M in his dispositif, and a player who IS the BRAV-M chief: order them from the field and from the map (Envoyer, Interpeller, Suivez-moi à pied / en véhicules). When do they refuse, stay still, or answer NÉGATIF? Why is the BRAV-M not part of « Toute la compagnie » (parentId 0)? Root causes in the code.
3. REACTIVITY: instrument the path order → radio acknowledgement → first agent moving → unit in place, for the common orders on foot within 100 m and in vehicles: list EVERY deliberate delay in the code (radio queue waits, acknowledgement timers, boarding thresholds such as MOTOR_AUTO / WALK_LIMIT, « afterConvoy », formation regrouping, think intervals of the brains) with file and constant, and say which ones make the game feel unresponsive. Also list what feedback the player gets (HUD chip, radio subtitle, world marker) and when.
4. « Escorte »: find every meaning the game gives to that word (escort of an armoured vehicle on foot, escort of a detainee, escort of a convoy…) and what the player sees about it; say which one is unclear and why.` },
  { key: 'interpelles', title: 'Arrested people: where to put them, cellular vans, transfer to the station', prompt: `THE PLAYER: « j'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire pour les mettre. Donc il faut toujours qu'il y ait quelques wagons pour pouvoir mettre les interpellés qui les emmènent au commissariat. » and « pour l'escorte aussi, c'est encore un peu flou ».
1. Play a police player who ARRESTS someone himself (every poste that can: read the role / equipment code for handcuffs): what happens step by step after the arrest — is the detainee attached to the player, does he have to escort him, where to, what does the HUD / the « Ma mission » card / the radio tell him, what happens if he walks away, how does it end? Do the same for an arrest made by an AI unit on the player's order (ops-arrest.ts): who takes the detainee, where, how long, what the commandant sees.
2. CELLULAR VANS: in every mode and scenario (free mode at each place and crowd size, each special mission, the service day, patrol mode, the hot spots), is there a cellular van in the dispositif? How many, where is it parked, who drives it, does it show on the map and in the world (label, marker)? What happens when it is full? Does it ever drive detainees away? Read src/gameplay/session/setup.ts, src/sim/police/units.ts, logistics.ts, special.ts, src/gameplay/law/handover.ts and, in the tree being merged (${mergedTree}), src/gameplay/commissariats/** (station stock with cellular vans, « Rentrer au commissariat », handover of detainees at the station).
3. Say exactly what is missing for the player's request: cellular vans ALWAYS present (how many for which crowd), a clear place to bring a detainee (world marker + distance on the HUD, or a one-key « remettre aux collègues » so that a pair escorts him to the van), the van leaving for the nearest station when full or on order, the detainees counted at the station and in the debrief, a replacement van arriving. Give the root causes of the present gaps (file, function) and the simplest robust way to build each missing piece on the existing code (name the functions to extend).` },
]
const diags = (await parallel(DIAGS.map(d => () => agent(`${CONTEXT}

${PLAYER}

YOUR JOB — DIAGNOSIS « ${d.title} ».
${d.prompt}

Write your full report in French-free plain English (quotes of game text stay in French) to ${outDir}/diag-${d.key}.md: what you played (commands, seeds), tables of results, each problem with evidence and root cause, and the facts a designer needs. Delete your scratch probe tests when done (\`git status --short\` in ${worktree} must show nothing but the node_modules symlink).
Return: reportPath, blockers (each defect that stops the player or makes an order do nothing: title, severity bloquant / majeur / mineur, repro, cause with file and function, files, fixIdea), facts (short statements a designer must know), notPlayed (what you could not play).`, { label: `diag:${d.key}`, phase: 'Diagnostic', schema: DIAG_SCHEMA, model: MODEL })))).map((r, i) => r ? { key: DIAGS[i].key, ...r } : { key: DIAGS[i].key, reportPath: `${outDir}/diag-${DIAGS[i].key}.md`, blockers: [], facts: ['(this diagnosis agent was cut off: read its report file if it exists)'], notPlayed: ['everything'] })
const diagSummary = JSON.stringify(diags.map(d => ({ key: d.key, reportPath: d.reportPath, blockers: d.blockers.map(b => ({ title: b.title, severity: b.severity, cause: b.cause })), facts: d.facts })))

const GOALS = `WHAT THE DESIGN MUST DELIVER (the player's words turned into goals):
G1. DIRECT ORDERS ON THE FIELD: without opening the command map, the player designates and orders, and the units GO AT ONCE. A handful of orders in plain French (go there, hold / block here, push them back, arrest that one, come back to me, help here…), each one press or one tap; the natural order for what he is looking at must need no menu.
G2. The units « avec moi » always HAVE an order the player can read (what they are doing, for whom) and are ready: when he stops they take a sensible posture; when he orders, they react within about a second (acknowledgement) and move within about two.
G3. Every unit under his command can be ordered the same way — the BRAV-M included — and a refused order always says why in one short sentence and what to do instead.
G4. ARRESTED PEOPLE: there are ALWAYS cellular vans with the dispositif (scaled with the crowd); the player always knows where to bring a detainee (marker and distance) or hands him over with one key to colleagues who escort him; the van takes the detainees to the station (the stations feature is being merged) and a van is always available; the word « escorte » is clear wherever it appears.
G5. Arriving at a demonstration never leaves the player unable to order: whatever the convoy / service-day stage, an order is accepted and carried out, or the HUD says in one line what the units are finishing and when they will be ready.
G6. LESS, not more: no new wall of buttons, no jargon; keyboard + trackpad without a mouse, and touch on a phone (targets ≥ 44 px, nothing under the thumbs' controls); the command map stays for the big picture, and its six intentions and the field orders use the SAME words.
G7. Nothing lost: every existing order stays reachable; the simulation's order types are reused (SquadOrder in src/core/contracts.ts), not reinvented.`

const PROP_SCHEMA = { type: 'object', properties: { path: { type: 'string' }, pitch: { type: 'string' }, keyIdeas: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } } }, required: ['path', 'pitch', 'keyIdeas', 'risks'] }
const ANGLES = [
  { key: 'viser', title: '« Je vise, j\'ordonne »', brief: 'The crosshair is the designator: one key (and one touch button) gives the natural order for what the player is looking at — ground: go there; a street mouth: block it; a crowd: push it back; an offender: arrest him; a wounded person: rescue; his own vehicles: board. A short hold shows at most four alternatives. A marker appears in the world where the order goes and the unit answers at once.' },
  { key: 'groupe', title: '« Mes hommes »', brief: 'The units with the player form his manoeuvre group, always shown in one compact line (who, how many, what they are doing). A fixed, tiny set of numbered verbs in the same order everywhere (field, wheel, map), learnt in a minute, each executed instantly by the group; selecting another unit (BRAV-M, a section, the cellular van) is one key that cycles « à qui je parle ». The emphasis is on state clarity: nobody is ever « sans ordre ».' },
  { key: 'reactif', title: '« Zéro attente, téléphone d\'abord »', brief: 'Start from the phone (thumbs, 844x390) and from the latency budget: design the order pipeline so that acknowledgement comes within 1 s and movement within 2 s, remove or shorten every deliberate wait found by the diagnosis, decide what happens to an order given while the units are in their vans or in a column (it is taken and queued with a visible countdown, never refused silently), and make the feedback impossible to miss (spoken acknowledgement, marker, unit chip). Then derive the laptop keys from the same model.' },
]
phase('Propositions')
const props = (await parallel(ANGLES.map(a => () => agent(`${CONTEXT}

${PLAYER}

THE DIAGNOSIS IS DONE. Three agents replayed the player's game; READ their full reports first: ${diags.map(d => d.reportPath).join(', ')}. Their short findings: ${diagSummary}

${GOALS}

YOUR JOB — DESIGN PROPOSAL, angle ${a.title}. ${a.brief}
You are one of three designers working independently on different angles; a judge will compose the final design from the best of each. Stay faithful to your angle but cover ALL goals G1–G7 (a complete proposal: field orders, the state of the units with the player, BRAV-M, detainees and cellular vans, arrival, feedback, keyboard / trackpad / phone, coexistence with the command map and with the patrol call card).
Ground every choice in the code as it is (name the modules and functions to extend, the SquadOrder types reused, the bindings free in src/input/bindings.ts — check them — and the HUD zones free on the phone: read src/ui/hud/layout.ts and src/input/touch/**). Be concrete: exact French labels, exact keys and touch targets with sizes and positions, what the player sees second by second in three walk-throughs: (1) he arrives by column at a demonstration and wants his section to block a street he is looking at, (2) he sees a rioter throw a projectile and wants him arrested and taken away, (3) he wants the BRAV-M to go to a crossroads 400 m away. Count presses / taps and seconds for each and compare with today (the diagnosis has today's numbers). List what you REMOVE or merge so that the screen carries less than today. List the risks.
Write the proposal to ${outDir}/proposition-${a.key}.md. Return: path, pitch (three sentences), keyIdeas, risks.`, { label: `proposition:${a.key}`, phase: 'Propositions', schema: PROP_SCHEMA, model: MODEL })))).filter(Boolean)

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    designPath: { type: 'string' },
    summaryFr: { type: 'string' },
    blockersFirst: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, fix: { type: 'string' } }, required: ['title', 'fix'] } },
    packages: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, title: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, files: { type: 'array', items: { type: 'string' } } }, required: ['key', 'title', 'dependsOn'] } },
    acceptance: { type: 'string' },
    relatedTests: { type: 'string' },
    e2e: { type: 'string' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['designPath', 'summaryFr', 'blockersFirst', 'packages', 'acceptance', 'relatedTests', 'e2e', 'openQuestions'],
}
phase('Synthèse')
const synth = await agent(`${CONTEXT}

${PLAYER}

${GOALS}

YOUR JOB — JUDGE AND COMPOSE THE FINAL DESIGN. Read the three diagnosis reports (${diags.map(d => d.reportPath).join(', ')}) and the design proposals (${props.map(p => p.path).join(', ') || 'none was produced: design it yourself from the diagnosis'}). Score each proposal against G1–G7 (a small table with reasons), then write ONE specification that takes the best of each and that a team can build without asking questions. Verify every claim the proposals make about the code before relying on it (bindings really free, functions really there, HUD zones really free on the phone).
The specification (${outDir}/design-ordres-directs.md) must contain:
 1. The interaction model in one page, in the player's terms, with the exact French labels, keys, touch targets (size, position) and what was removed or merged.
 2. The order pipeline and its latency budget (acknowledgement ≤ 1 s, first movement ≤ 2 s on foot), listing each wait in the code to remove or shorten (file, constant, new value) and what happens to an order given during a column / unloading / in the vans (taken, queued, shown).
 3. The state line of the units with the player (never « sans ordre »), and the default posture when he stops.
 4. BRAV-M and special units: how they are ordered, what each refuses and the one-sentence reason shown.
 5. Detainees and cellular vans: how many vans for which crowd, where they park, the marker / distance, the one-key handover and the escort by colleagues, the trip to the station (using the stations feature when present, a simple off-map fallback when not), the replacement van, the counts in the HUD, on the map and in the debrief; every meaning of « escorte » made explicit.
 6. Arrival at a demonstration: the guarantees (G5) and the fixes of the blocking defects found by the diagnosis.
 7. Walk-throughs (the three of the proposals) with presses / taps and seconds, laptop and phone, compared with today.
 8. WORK PACKAGES for parallel builders: each with a key (P1, P2…), a title, the files it owns (no two packages own the same file; shared files get one owner and the others describe the hook they need), dependsOn, the unit tests and browser scenarios to write, and its done-criteria. Keep packages small enough for one agent (a few hours). Start with a package of pure order logic that the others build on.
 9. ACCEPTANCE: the list of things the player must be able to do, phrased as he would (« j'arrive, je regarde une rue, j'appuie, ma section la barre »), each testable by a robot.
 10. Blockers to fix FIRST, independently of the design (from the diagnosis), with files and the fix.
Return: designPath, summaryFr (what will change for the player, in French, short), blockersFirst, packages (key, title, dependsOn, files), acceptance, relatedTests (existing test files the builders must keep green, as a space-separated list of paths / prefixes), e2e (existing and new browser scenarios), openQuestions (decisions you took where the player's intent was ambiguous — state the choice made).`, { label: 'synthèse:ordres-directs', phase: 'Synthèse', schema: FINAL_SCHEMA, model: MODEL })

phase('Critique joueur')
const critic = await agent(`${CONTEXT}

${PLAYER}

${GOALS}

YOUR JOB — ATTACK THE DESIGN AS THE PLAYER, THEN FIX THE DOCUMENT. The specification is ${synth ? synth.designPath : outDir + '/design-ordres-directs.md'} (diagnosis reports: ${diags.map(d => d.reportPath).join(', ')}).
Read it as the player would live it, on a MacBook without a mouse and on a phone held in two hands: go through each walk-through and each acceptance item and look for (a) anything that still needs the command map or a menu for a simple field order, (b) more than one press / tap for the natural order, (c) any moment where the units stand with no readable order, or where an order is accepted and nothing visibly happens within two seconds, (d) any refusal without a reason, (e) a key that clashes with an existing binding (check src/input/bindings.ts and the reserved keys of the command map and of the patrol card) or a touch target under a thumb control or smaller than 44 px (check src/ui/hud/layout.ts and src/input/touch/**), (f) jargon, (g) the detainee flow: a player who has just handcuffed someone and does not know the game — does he know within three seconds what to do, and is a van really always there, (h) the BRAV-M case, (i) packages that own the same file, a missing dependency, or a done-criterion no robot can check, (j) anything the diagnosis found that the design forgot.
Then CORRECT the specification file in place (keep its structure; add a short section « Corrections de la critique » at the end listing what you changed and why). Do not weaken a goal to make the design easier.
Return the FINAL values, after your corrections: designPath, summaryFr, blockersFirst, packages, acceptance, relatedTests, e2e, openQuestions.`, { label: 'critique:ordres-directs', phase: 'Critique joueur', schema: FINAL_SCHEMA, model: MODEL })

return { diags, proposals: props, design: critic || synth }
