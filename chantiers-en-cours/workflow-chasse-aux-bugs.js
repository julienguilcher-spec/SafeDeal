export const meta = {
  name: 'chasse-aux-bugs',
  description: 'Chasse aux bugs par module : trouver, prouver par un test, corriger en worktree isolé, puis contre-vérification indépendante et production du correctif',
  whenToUse: 'Relecture approfondie de modules avec correctifs prouvés et patchs prêts à intégrer',
  phases: [
    { title: 'Chasse', detail: 'un agent par module : trouve, prouve par un test, corrige dans son worktree' },
    { title: 'Contre-vérification', detail: 'un relecteur indépendant tente de réfuter chaque bug et chaque correctif, puis produit le patch' },
  ],
}

const { dims, huntRoot, patchDir } = args

const FORBIDDEN = args.forbidden !== undefined ? args.forbidden : [
  'src/sim/vehicles/**', 'src/sim/police/command/convoy.ts', 'src/sim/police/command/bravm.ts',
  'src/gameplay/session/{engins,journee,journee-data,setup,placement,index,roster}.ts',
  'src/sim/crowd/**', 'src/ui/screens/{scenario,home-panes-b,catalog}.ts', 'src/ui/maps/**', 'src/ui/command/tactical*.ts',
].join(' ; ')

function preamble(d) {
  const wt = `${huntRoot}/${d.key}`
  return `PROJECT: "CRS Simulation France" — a realistic 3D riot-police simulation on a real map of central Paris (TypeScript, Three.js, Vite; desktop app for Mac via Electron). The user is French, plays on a Mac laptop WITHOUT a mouse (keyboard + trackpad), and demands ZERO bugs and realism.

YOUR WORKSPACE: an isolated git worktree at ${wt} (committed HEAD). The project lives in ${wt}/crs-simulation (node_modules there is a symlink: never delete or modify it). Work ONLY inside this worktree. NEVER modify anything under /home/user/SafeDeal (the main tree — other agents are editing it) and never run git commands there. Do NOT commit, push, checkout another revision, or use git stash (the stash is shared between worktrees). Leave your changes uncommitted in the worktree.

MACHINE: only 4 CPU cores shared by several agents. NEVER run the whole test suite. Run only targeted test files: \`cd ${wt}/crs-simulation && npx vitest run tests/unit/<file>.test.ts\` (add --silent=false to see console.log output). \`npx tsc --noEmit -p .\` takes ~2 minutes: run it once near the end. Avoid Playwright/Chromium unless indispensable (then one browser at a time, generous timeouts; helpers in tests/e2e/lib.mjs; window.__CRS.step / teleport / ctx in the page). Timing measurements are noisy on this loaded machine.

ARCHITECTURE (orientation only — read the code): GameSystem modules created by createSystems factories (src/main.ts lists and orders them), update order by SystemOrder; services via ctx.provide / ctx.service; events via ctx.events (on/emit/onAny/emitAny); contracts in src/core/contracts.ts and src/core/extensions.ts; persistence via ctx.save sections; headless integration tests build a context with createTestContext from '@/core/testing' plus a list of module factories (patterns in tests/unit/integration.*.test.ts: await t.start(config), t.step(seconds), ctx.player.person(), ctx.squads, ctx.vehicles, ctx.people, ctx.radio.log…). UI text and code comments are in French — keep that language and style in everything you write into the code.

${FORBIDDEN ? 'FILES OWNED BY OTHER RUNNING AGENTS — you may READ them but must NOT modify them: ' + FORBIDDEN + '. ' : ''}${d.readonly ? 'Read-only for you (owned by another agent working right now): ' + d.readonly + '. If a fix belongs in a read-only file, do not make it: report it in \`deferred\` with a precise analysis and a suggested fix.' : 'You may modify any source file your task needs (other agents work in their own worktrees).'}

WHAT THE USER ASKED FOR (behaviour that must hold):
- Police roles start at a base (caserne / commissariat) and travel in a vehicle column driven by the AI to the demonstration; the player rides as passenger in any vehicle of the column, or drives; a mission only starts on arrival. BRAV-M ride motorbikes for any far move; any unit moving more than ~250 m uses its vehicles. Armoured vehicles (Centaure, canon à eau) always have a foot escort and never stay blocked by a crowd.
- Units obey the player's orders and go straight to the point. "Avec moi" makes the selected units join the commander's column. The adjoint's proposals are accepted with key P (Shift+P = later); pause is Escape only.
- Holding "forward" for more than ~1.2 s makes the player jog then run; the jog toggle keeps a trot; Shift sprints. AI police move at brisk walk / trot / run depending on urgency.
- Executants (a plain CRS…) get a "Ma mission" card: ONE clear order, the chief to follow, radio filtered to their unit. Non-police roles hear only their own trade's radio (firefighters/SAMU: the rescue network, callsigns "PARIS" / "SAMU 75"; civilians: no official radio) and always have a precise task + place + GPS; firefighters and SAMU ride their engine driven by the AI; street medics walk.
- Police patrol cars (Police secours, BAC) patrol Paris and report by radio; ALL police units are visible and commandable on the tactical map; secondary hotspots (foyers) appear across Paris.
- Rescue (pompiers / SAMU) can be called from HUD buttons and from the tactical map (to a point, or straight to an incident).
- A drone video feed window on the left (key O), realistic (no detection through roofs).
- Realistic traffic: cars pull over for sirens, pedestrians wait or cross, cyclists.
- History and career persist across launches, also in the Mac Electron app.`
}

const HUNT_SCHEMA = {
  type: 'object',
  properties: {
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          files: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
          test: { type: 'string' },
          fixed: { type: 'boolean' },
          fixSummary: { type: 'string' },
        },
        required: ['id', 'title', 'severity', 'files', 'evidence', 'fixed'],
      },
    },
    deferred: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          file: { type: 'string' },
          analysis: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['title', 'file', 'analysis'],
      },
    },
    testsRun: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['bugs', 'deferred', 'testsRun'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          real: { type: 'boolean' },
          fixCorrect: { type: 'boolean' },
          kept: { type: 'boolean' },
          comment: { type: 'string' },
        },
        required: ['id', 'real', 'kept', 'comment'],
      },
    },
    patchPath: { type: 'string' },
    patchFiles: { type: 'array', items: { type: 'string' } },
    tscClean: { type: 'boolean' },
    testsRun: { type: 'string' },
    summaryFr: { type: 'string' },
  },
  required: ['verdicts', 'patchPath', 'patchFiles', 'tscClean', 'testsRun', 'summaryFr'],
}

function huntPrompt(d) {
  return `${preamble(d)}

YOUR MODULE: ${d.title}
SCOPE (files): ${d.scope}
FOCUS: ${d.focus}
RELATED TESTS: ${d.tests}
${d.must ? '\nREQUIRED CHANGE (not optional): ' + d.must + '\n' : ''}
NOTE: this worktree may already contain UNCOMMITTED changes from a previous hunter on this same module who was interrupted before finishing (check \`git status --short\` and \`git diff HEAD\` first). Treat them as an unreviewed draft: keep and finish what is correct and proven by a failing-then-passing test, discard the rest (\`git diff HEAD -- <file> | git apply -R\`, or delete new files).

METHOD
1. Read the scope files completely and carefully, and their callers where needed. Use \`git log --oneline -15 -- <file>\` and \`git log -p -3 -- <file>\` to see what changed recently: recent changes were made quickly by several agents and are the most likely place for bugs.
2. Hunt for REAL bugs: wrong behaviour the player would see; crashes / exceptions (null, undefined, NaN); deadlocks and stuck states; state leaking between sessions (maps / sets / listeners not cleared in reset() or dispose()); logic contradicting the user's requirements above; wrong or inconsistent French UI text or key hints; unit and sign errors; off-by-one; races between systems (update order); features that silently do nothing in the real game although tests pass (service-name mismatch, system not registered in src/main.ts, DOM-only code never exercised headlessly). NOT bugs: style, naming, hypothetical refactors, unmeasured micro-optimisations.
3. PROVE each suspected bug: write a headless vitest test (tests/unit/<area>.<name>.test.ts) that fails because of the bug — for pure text / key-hint issues, cite the exact lines instead. If you cannot make it fail, it is not a bug: drop it and say so in notes.
4. FIX each proven bug that lies in editable files: minimal, surgical change (other patches will be merged with yours), French comments consistent with the surrounding code; the new test passes; run the related existing test files to check nothing else broke. For bugs in read-only files, keep your failing test OUT of the tree and describe it in \`deferred\`.
5. Run \`npx tsc --noEmit -p .\` once at the end and fix any type error you introduced.
Depth over breadth: two real, proven, fixed bugs are worth more than ten guesses. If the module is clean, say so honestly — an empty bug list is a valid result.

Return: bugs (id = short slug; evidence = how the failing test or the cited lines prove it; test = path of the test file; fixed; fixSummary), deferred, testsRun (commands and pass/fail counts), notes.`
}

function reviewPrompt(d, hunt) {
  const wt = `${huntRoot}/${d.key}`
  return `${preamble(d)}

YOU ARE AN INDEPENDENT, SKEPTICAL REVIEWER. Another agent hunted bugs in the module "${d.title}" and left its changes UNCOMMITTED in the worktree ${wt}. Its report${hunt && hunt.reportFile ? ' is in the file ' + hunt.reportFile + ' (JSON: bugs, deferred, testsRun, notes) — read it first.' : ':\n' + JSON.stringify(hunt, null, 1)}

Your job: try to REFUTE each claimed bug and each fix, then produce the final patch containing only what survives. Default to "not real" when the evidence does not hold.
For each bug with fixed=true:
 a. Read the diff (\`cd ${wt} && git status --short && git diff HEAD\`) and the surrounding code. Is the described behaviour really a bug with respect to the code's intent and the user's requirements? Could it be intended behaviour documented by a comment or an existing test?
 b. Check that the test proves it: save the SOURCE part of that fix (\`git diff HEAD -- <source files of this fix> > /tmp/rev-${d.key}-<id>.patch\`), revert it (\`git apply -R /tmp/rev-${d.key}-<id>.patch\`), run the new test — it must FAIL; re-apply (\`git apply /tmp/rev-${d.key}-<id>.patch\`) and run again — it must PASS. Never use git stash / checkout / commit.
 c. Look for regressions and side effects: other callers, other roles (police / civilians), headless vs browser, session restart, performance with big crowds. Run the related existing tests (${d.tests}) and any test file covering the touched files (\`grep -rl\` in tests/unit).
 d. Check that no read-only file was modified (${FORBIDDEN}${d.readonly ? ' ; ' + d.readonly : ''}). If one was, revert that file's changes (\`git diff HEAD -- <file> | git apply -R\`) and mark the bug kept=false with the reason.
If the bug is real but the fix is wrong or incomplete, correct the fix yourself (minimal) and re-run the tests. If the bug is not real, revert its changes (source and test).
${d.must ? 'The hunter was also REQUIRED to make this change — check it is done correctly and completely, fix it if needed: ' + d.must + '\n' : ''}Finally: run \`npx tsc --noEmit -p .\` (must be clean; fix what the changes broke), then write the final patch:
  cd ${wt} && git add -A -- crs-simulation/src crs-simulation/tests/unit && git add -u -- crs-simulation && (git add -A -- crs-simulation/tests/e2e/*.mjs 2>/dev/null || true) && git diff --cached HEAD > ${patchDir}/${d.key}.patch
(write the file even if empty; do not commit; verify with \`git apply --check -R ${patchDir}/${d.key}.patch\` that it matches the worktree). 
Return: one verdict per reported bug (real, fixCorrect, kept, comment), patchPath, patchFiles (files in the patch), tscClean, testsRun, and summaryFr — a short French summary for the user of the bugs actually fixed (plain language, what the player would have seen).`
}

// lots : `batch` modules à la fois, chacun chassé PUIS relu avant de passer au lot suivant (sans cela, toutes les
// relectures attendent derrière toutes les chasses) ; un module déjà chassé lors d'un lancement précédent
// (huntReportPath) passe directement en relecture
const BATCH = args.batch || dims.length
const results = []
for (let b = 0; b < dims.length; b += BATCH) {
  const part = await pipeline(
    dims.slice(b, b + BATCH),
    (d) => d.huntReportPath
      ? { reportFile: d.huntReportPath }
      : agent(huntPrompt(d), { label: `chasse:${d.key}`, phase: 'Chasse', schema: HUNT_SCHEMA, ...(args.huntModel ? { model: args.huntModel } : {}) }),
    (hunt, d) => {
      if (!hunt) return null
      return agent(reviewPrompt(d, hunt), { label: `contre-vérif:${d.key}`, phase: 'Contre-vérification', schema: REVIEW_SCHEMA, ...(args.reviewModel ? { model: args.reviewModel } : {}) })
        .then((review) => ({ key: d.key, hunt, review }))
    },
  )
  results.push(...part)
}

const done = results.filter(Boolean)
log(`${done.length}/${dims.length} modules traités`)
return done.map((r) => ({
  key: r.key,
  bugs: (r.hunt.bugs || []).map((b) => ({ id: b.id, title: b.title, severity: b.severity, fixed: b.fixed })),
  deferred: r.hunt.deferred || [],
  notes: r.hunt.notes || (r.hunt.reportFile ? 'rapport de chasse : ' + r.hunt.reportFile : ''),
  review: r.review,
}))
