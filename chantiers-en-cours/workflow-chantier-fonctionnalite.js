export const meta = {
  name: 'chantier-fonctionnalite',
  description: 'Réalise une fonctionnalité planifiée : paquets de travail lancés selon leurs dépendances dans un worktree partagé, puis intégration, puis joueur-critique indépendant qui produit le correctif',
  whenToUse: 'Implémenter une fonctionnalité dont le plan détaillé (paquets, fichiers, tests) existe déjà dans un fichier',
  phases: [
    { title: 'Paquets', detail: 'un agent par paquet du plan, dès que ses dépendances sont terminées' },
    { title: 'Intégration', detail: 'compile, fait passer tous les tests, complète ce qui manque au plan, vérifie dans le navigateur' },
    { title: 'Joueur critique', detail: 'un agent indépendant joue la fonctionnalité comme le joueur, corrige, puis écrit le correctif' },
  ],
}

const { feature, planPath, worktree, patchPath, packages, relatedTests, e2e, acceptance } = args
const MODEL = args.model || 'opus'
// paquets commencés par un agent interrompu lors d'un lancement précédent : leur premier agent reprend le brouillon
const PARTIAL = args.partial || []
const proj = `${worktree}/crs-simulation`

const PRE = `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite). The player is French, plays on a MacBook Air WITHOUT a mouse (keyboard + trackpad) and on a phone (touch, 844x390 landscape), and demands realism and ZERO bugs. All UI text and all code comments are in French: keep that language and the style of the surrounding code.

YOUR WORKSPACE: the git worktree ${worktree} (project in ${proj}; node_modules there is a symlink: never delete or modify it). Work ONLY inside this worktree. NEVER modify anything under /home/user/SafeDeal and never run git commands there. Do NOT commit, push, checkout another revision, or use git stash (the stash is shared between worktrees). Leave your changes uncommitted.

SHARED WORKTREE: another agent may be working in this same worktree at the same time on another work package of the same feature. Edit only the files listed for your package and the new files you create. If a file of another package must change for your work, make the smallest possible edit and re-read the file immediately before editing it. Never revert, reformat or "clean up" changes you did not make: \`git status\` and \`git diff\` show the other agent's work in progress — leave it alone.

MACHINE: 4 CPU cores shared by about six agents. NEVER run the whole test suite. Run targeted test files only: \`cd ${proj} && npx vitest run tests/unit/<file>.test.ts\` (add --silent=false to see console.log). \`npx tsc --noEmit -p .\` takes about 2 minutes: run it once near the end (errors located in files of packages still in progress are not yours: report them, do not "fix" them by guessing). Browser scenarios (Playwright, pre-installed; see tests/e2e/lib.mjs and tests/e2e/run-all.mjs — each script starts its own dev server on a free port): one browser at a time, generous timeouts (software WebGL, about 0.4 s per frame); in the page, window.__CRS exposes step / teleport / ctx.

ARCHITECTURE (orientation — read the code): GameSystem modules created by createSystems factories (src/main.ts lists and orders them), update order by SystemOrder; services via ctx.provide / ctx.service / ctx.require; events via ctx.events; contracts in src/core/contracts.ts and src/core/extensions.ts; persistence via ctx.save sections; headless tests build a context with createTestContext from '@/core/testing' plus a list of module factories (see tests/unit/integration.*.test.ts and tests/unit/playtest.*.test.ts: await t.start(config), t.step(seconds), ctx.player.person(), ctx.squads, ctx.vehicles, ctx.people, ctx.radio.log). Headless tests load the real Paris map synchronously: buildings and streets are those of the game.

THE PLAN: read ${planPath} COMPLETELY before anything else — the coordinator's addendum (it overrides the rest), the understanding, the player experience, the decisions, the data model, the risks and the work packages. The plan was written against a slightly older commit: where it disagrees with the code (a name, a file, a signature), follow the code and the plan's intent, and report the deviation.

QUALITY BAR: no placeholder, no TODO left behind, no feature that silently does nothing in the real game (check the service names, the registration in src/main.ts, the update order); every screen usable with the keyboard alone and by touch; French text correct and consistent; deterministic (use the session RNG forks, never Math.random or Date.now in the simulation).`

const PKG_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsRun: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' } },
    openIssues: { type: 'array', items: { type: 'string' } },
    complete: { type: 'boolean' },
  },
  required: ['summary', 'filesChanged', 'testsRun', 'deviations', 'openIssues', 'complete'],
}

const INTEG_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    planItemsChecked: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['item', 'ok'] } },
    fixes: { type: 'array', items: { type: 'string' } },
    tscClean: { type: 'boolean' },
    testsRun: { type: 'string' },
    browserChecks: { type: 'string' },
    openIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'planItemsChecked', 'fixes', 'tscClean', 'testsRun', 'browserChecks', 'openIssues'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    bugs: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] }, evidence: { type: 'string' }, fixed: { type: 'boolean' } }, required: ['title', 'severity', 'evidence', 'fixed'] } },
    acceptance: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['item', 'ok'] } },
    patchPath: { type: 'string' },
    patchFiles: { type: 'array', items: { type: 'string' } },
    tscClean: { type: 'boolean' },
    testsRun: { type: 'string' },
    remaining: { type: 'array', items: { type: 'string' } },
    summaryFr: { type: 'string' },
  },
  required: ['bugs', 'acceptance', 'patchPath', 'patchFiles', 'tscClean', 'testsRun', 'remaining', 'summaryFr'],
}

function pkgPrompt(p, deps, retry) {
  return `${PRE}

YOUR TASK: implement WORK PACKAGE ${p.key} — « ${p.title} » of the feature « ${feature} », exactly as specified in section 8 of the plan (its "Changes" AND its "Tests"), honouring the decisions and avoiding the listed risks.
${retry ? '\nNOTE: a previous agent started this package and was interrupted. The worktree may contain its partial work for this package: inspect it (git status --short, git diff HEAD -- <your files>), keep and finish what is correct, redo the rest.\n' : ''}
Packages your work depends on are finished; their reports:
${JSON.stringify(deps, null, 1)}

METHOD
1. Read the plan file completely, then the files of your package and their callers. Check what the finished packages really put in the tree (their code is the truth, not their report).
2. Implement the package. Write the tests the plan lists for it (headless vitest in tests/unit; browser scenarios in tests/e2e only where the plan asks) and make them pass. Tests must check real behaviour (a real session, real map), not mocks of the thing under test.
3. Run the existing test files that cover the files you touched (\`grep -rl\` in tests/unit) and fix what you broke. If an existing test fails because the plan intentionally changes the behaviour, update the test and say so in deviations.
4. Run \`npx tsc --noEmit -p .\` once at the end; fix the errors in your files.
Depth and correctness over speed: a package that is half done is worse than a clear report of what is missing — set complete=false and list precisely what remains in openIssues.

Return: summary (what now exists, in plain words), filesChanged, testsRun (commands with pass/fail counts), deviations (each difference from the plan and why), openIssues (anything the integrator must know or finish), complete.`
}

function integPrompt(reports) {
  return `${PRE}

YOU ARE THE INTEGRATOR of the feature « ${feature} ». All work packages have been implemented by other agents in this worktree (uncommitted). Their reports:
${JSON.stringify(reports, null, 1)}

Your job is to turn this into ONE coherent, complete, working feature.
1. \`cd ${worktree} && git status --short\` and read the whole diff (\`git diff HEAD\`, plus the new files). Look for: pieces that do not fit together (names, service ids, event names, data-id attributes, types), duplicated helpers, a system not registered in src/main.ts, state not reset between sessions, anything a package left incomplete (see openIssues and complete=false).
2. \`npx tsc --noEmit -p .\` must be clean.
3. Tests: run every new test file of the feature and the related existing tests (${relatedTests}) plus any test covering a touched file. Run them in small groups, never the whole suite. Fix source bugs; update an existing test only when the plan intentionally changes the behaviour it checks.
4. Completeness: go through the plan's "Player experience" section and its decisions ITEM BY ITEM and check each one in the code and, where possible, in a test. Implement what is missing. Record each item in planItemsChecked.
5. Real game check in the browser (${e2e}): run the scenarios (write them if the packages did not), at laptop size 1280x800 driven with the KEYBOARD ONLY and at phone size 844x390 with touch. Open the screenshots (Read the PNG files) and look at them critically: overlapping elements, clipped or untranslated text, unreadable contrast, buttons that do nothing. Fix what you find. Also update the existing e2e scripts that this feature breaks (for example scripts that drove the old home screen).
6. Final \`npx tsc --noEmit -p .\`.

Return: summary, planItemsChecked, fixes (what you corrected or completed), tscClean, testsRun, browserChecks (which scenarios, what you saw), openIssues (what an independent tester should look at first).`
}

function criticPrompt(integ) {
  return `${PRE}

YOU ARE AN INDEPENDENT, DEMANDING PLAYTESTER AND REVIEWER of the feature « ${feature} ». You did not write this code. It was implemented by several agents and then integrated; the integrator's report:
${JSON.stringify(integ, null, 1)}

Assume there are still bugs and find them BEFORE the player does. The player's own words about this project: « encore énormément de bugs… teste le jeu… je veux que tu sois autonome et que tu règles tout ».

WHAT THE PLAYER MUST BE ABLE TO DO (acceptance — check every line yourself, do not trust the reports):
${acceptance}

METHOD
1. Read the plan file, then the diff (\`cd ${worktree} && git status --short && git diff HEAD\` and the new files).
2. Play it. Headless: write robot playtests (tests/unit/playtest.${feature}.test.ts) that go through each path the way the player would, with several seeds and places, and measure outcomes (does it start, where am I, what do I see on the cards and the radio, does every announced thing really exist in the world, does it end, is the state clean on a second session in the same process). Browser: run the scenarios at 1280x800 with the keyboard only and at 844x390 with touch; take screenshots at each step and LOOK at them (Read the PNG files).
3. Try to break it: unusual choices, going back and forth between screens, launching twice, pausing, the smallest and largest settings, a role the feature was not designed for, a second session after the first.
4. For each real bug: prove it (failing test, or screenshot plus exact lines), fix it minimally, make the test pass, re-run the related tests (${relatedTests}).
5. \`npx tsc --noEmit -p .\` must be clean at the end.
6. Write the final patch of the whole feature:
   cd ${worktree} && git add -A -- crs-simulation/src crs-simulation/tests/unit crs-simulation/harness && git add -u -- crs-simulation && (git add -A -- crs-simulation/tests/e2e/*.mjs 2>/dev/null || true) && git diff --cached HEAD > ${patchPath}
   (do not commit; check with \`git apply --check -R ${patchPath}\` that the patch matches the worktree; screenshots under tests/e2e/out must not be in the patch).
${args.readyMarker ? '7. As the VERY LAST action, once the patch is final: touch ' + args.readyMarker + ' (another team waits for this marker to apply your patch).\n' : ''}
Return: bugs (each with severity, evidence, fixed), acceptance (one entry per acceptance line: ok or not, with a note), patchPath, patchFiles, tscClean, testsRun, remaining (what is still wrong or unverified — be honest), and summaryFr: a short French summary for the player, in plain language, of what he can now do and how (keys, buttons).`
}

const byKey = {}
for (const p of packages) byKey[p.key] = p
const started = {}
function run(p) {
  if (!started[p.key]) {
    started[p.key] = (async () => {
      const depKeys = p.dependsOn || []
      const depReports = await Promise.all(depKeys.map((k) => run(byKey[k])))
      const deps = depKeys.map((k, i) => ({ key: k, title: byKey[k].title, report: depReports[i] }))
      let r = await agent(pkgPrompt(p, deps, PARTIAL.includes(p.key)), { label: `paquet:${feature}:${p.key}`, phase: 'Paquets', schema: PKG_SCHEMA, model: MODEL })
      if (!r) {
        log(`${feature} ${p.key} : agent interrompu, nouvelle tentative`)
        r = await agent(pkgPrompt(p, deps, true), { label: `paquet:${feature}:${p.key}:reprise`, phase: 'Paquets', schema: PKG_SCHEMA, model: MODEL })
      }
      log(`${feature} ${p.key} terminé${r && r.complete === false ? ' (incomplet)' : ''}`)
      return r
    })()
  }
  return started[p.key]
}

phase('Paquets')
const reports = await Promise.all(packages.map((p) => run(p).then((r) => ({ key: p.key, title: p.title, report: r }))))

phase('Intégration')
// intégration déjà faite lors d'un lancement précédent (coupé par un redémarrage) : on passe directement au joueur critique
let integ = args.integrationReportFile
  ? { note: 'The integration was finished in an earlier run. The integrator\'s full report is in the JSON file ' + args.integrationReportFile + ' under the key « intégration:' + feature + ' » — read it first.' }
  : await agent(integPrompt(reports), { label: `intégration:${feature}`, phase: 'Intégration', schema: INTEG_SCHEMA, model: MODEL })
if (!integ) integ = await agent(integPrompt(reports), { label: `intégration:${feature}:reprise`, phase: 'Intégration', schema: INTEG_SCHEMA, model: MODEL })

phase('Joueur critique')
let critic = await agent(criticPrompt(integ), { label: `joueur-critique:${feature}`, phase: 'Joueur critique', schema: CRITIC_SCHEMA, model: MODEL })
if (!critic) critic = await agent(criticPrompt(integ), { label: `joueur-critique:${feature}:reprise`, phase: 'Joueur critique', schema: CRITIC_SCHEMA, model: MODEL })

return {
  feature,
  packages: reports.map((r) => ({ key: r.key, title: r.title, complete: r.report ? r.report.complete : false, deviations: r.report ? r.report.deviations : [], openIssues: r.report ? r.report.openIssues : ['agent interrompu'] })),
  integration: integ,
  critic,
}