// Sonde de développement (temporaire) : ouvre le banc, exécute un script facultatif, prend une capture.
// node tests/e2e/command-probe.mjs "<query>" <nom> <largeur> <hauteur> <mobile|x> <attente ms> "<code JS async>" <dpr>
import { startServer, openPage, shot, waitFor, finish } from './lib.mjs';
const args = process.argv.slice(2);
const query = args[0] ?? '';
const name = args[1] ?? 'command-probe';
const width = Number(args[2] ?? 1280), height = Number(args[3] ?? 720);
const mobile = args[4] === 'mobile';
const code = args[6] ?? '';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'harness/command.html?' + query, { width, height, mobile, deviceScaleFactor: Number(args[7] ?? (mobile ? 2 : 1)) });
let ok = true;
try {
  await waitFor(page, 'window.__ready === true || !!window.__error', 60000);
  const err = await page.evaluate(() => window.__error);
  if (err) { console.error(err); ok = false; }
  await page.waitForTimeout(1500);
  if (code) {
    const res = await page.evaluate(`(async () => { const b = window.__cmd; const t = b.tactical(); ${code} })()`);
    if (res !== undefined) console.log('résultat :', JSON.stringify(res));
  }
  await page.waitForTimeout(Number(args[5] ?? 1500));
  await shot(page, name);
  console.log(JSON.stringify(await page.evaluate(() => ({ perf: window.__cmd?.perf(), stack: window.__cmd?.ui.stack(), units: window.__cmd?.maps.scene.units.length, notices: window.__cmd?.ui.notices.slice(-4) }))));
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'probe' });
