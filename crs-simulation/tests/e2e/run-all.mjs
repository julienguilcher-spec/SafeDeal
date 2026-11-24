// Lance tous les tests de bout en bout (tests/e2e/*.mjs) l'un après l'autre et résume.
//
//   node tests/e2e/run-all.mjs                 tous les tests
//   node tests/e2e/run-all.mjs boot audio      seulement ceux dont le nom contient « boot » ou « audio »
//   node tests/e2e/run-all.mjs --bail          s'arrête au premier échec
//   node tests/e2e/run-all.mjs --timeout=600   délai maximal par test, en secondes (défaut : 900)
//   node tests/e2e/run-all.mjs --list          affiche la liste sans rien lancer
//
// Chaque test est un processus Node séparé (il démarre son propre serveur et son navigateur) ;
// un test réussit si son code de sortie est 0. Le code de sortie de ce script est 0 si tout réussit.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../..');
/** Fichiers qui ne sont pas des tests. */
const NOT_TESTS = new Set(['lib.mjs', 'run-all.mjs', 'verif-lib.mjs', 'verif-tpm-lib.mjs']);
/** Tests lancés en premier : ils valident l'outillage puis le moteur, dont tous les autres dépendent. */
const FIRST = ['smoke', 'boot'];

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const filters = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());
const bail = flags.includes('--bail');
const listOnly = flags.includes('--list');
const timeoutFlag = flags.find((f) => f.startsWith('--timeout='));
const timeoutSeconds = timeoutFlag ? Number(timeoutFlag.slice('--timeout='.length)) : 900;
const unknown = flags.filter((f) => f !== '--bail' && f !== '--list' && !f.startsWith('--timeout='));
if (unknown.length || !(timeoutSeconds > 0)) {
  console.error('[e2e] option inconnue ou invalide :', [...unknown, ...(timeoutSeconds > 0 ? [] : [timeoutFlag])].join(' '));
  console.error('       usage : node tests/e2e/run-all.mjs [filtres…] [--bail] [--timeout=secondes] [--list]');
  process.exit(2);
}

function rank(name) {
  const i = FIRST.indexOf(name);
  return i < 0 ? FIRST.length : i;
}

const tests = readdirSync(DIR)
  .filter((f) => f.endsWith('.mjs') && !NOT_TESTS.has(f))
  .map((f) => f.slice(0, -'.mjs'.length))
  .filter((name) => filters.length === 0 || filters.some((f) => name.toLowerCase().includes(f)))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));

if (tests.length === 0) {
  console.error('[e2e] aucun test' + (filters.length ? ` ne correspond à : ${filters.join(', ')}` : ' dans tests/e2e/'));
  process.exit(1);
}
if (listOnly) {
  for (const name of tests) console.log(name);
  process.exit(0);
}

/** Lance un test ; résout avec son résultat, sans jamais rejeter. */
function runOne(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(DIR, name + '.mjs')], { cwd: ROOT, stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSeconds * 1000);
    const done = (code, detail) => {
      clearTimeout(timer);
      resolve({ name, ok: code === 0 && !timedOut, ms: Date.now() - started, detail: timedOut ? `délai de ${timeoutSeconds} s dépassé` : detail });
    };
    child.on('error', (err) => done(1, 'lancement impossible : ' + err.message));
    child.on('exit', (code, signal) => done(code ?? 1, code === 0 ? '' : signal ? `interrompu (${signal})` : `code de sortie ${code}`));
  });
}

const seconds = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
const results = [];
const t0 = Date.now();
console.log(`[e2e] ${tests.length} test${tests.length > 1 ? 's' : ''} : ${tests.join(', ')}`);
for (const name of tests) {
  console.log(`\n[e2e] ── ${name} ${'─'.repeat(Math.max(4, 60 - name.length))}`);
  const result = await runOne(name);
  results.push(result);
  if (!result.ok && bail) break;
}

const failed = results.filter((r) => !r.ok);
const skipped = tests.length - results.length;
const width = Math.max(...tests.map((n) => n.length));
console.log(`\n[e2e] ══ résumé ${'═'.repeat(52)}`);
for (const r of results) {
  console.log(`  ${r.ok ? 'OK   ' : 'ÉCHEC'}  ${r.name.padEnd(width)}  ${seconds(r.ms).padStart(8)}${r.detail ? '  — ' + r.detail : ''}`);
}
for (const name of tests.slice(results.length)) console.log(`  —      ${name.padEnd(width)}  non lancé (--bail)`);
console.log(
  `[e2e] ${results.length - failed.length}/${tests.length} réussi${results.length - failed.length > 1 ? 's' : ''}` +
    (failed.length ? `, ${failed.length} en échec (${failed.map((r) => r.name).join(', ')})` : '') +
    (skipped ? `, ${skipped} non lancé${skipped > 1 ? 's' : ''}` : '') +
    ` — ${seconds(Date.now() - t0)} — captures : tests/e2e/out/`,
);
process.exit(failed.length === 0 && skipped === 0 ? 0 : 1);
