// Outillage commun des tests de bout en bout (Chromium headless, WebGL logiciel).
// Usage : import { startServer, openPage, shot, waitFor, finish } from './lib.mjs'
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'tests/e2e/out');
mkdirSync(OUT, { recursive: true });

/** Démarre un serveur Vite de développement sur un port libre (plusieurs tests peuvent tourner en parallèle). */
export async function startServer() {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    clearScreen: false,
    server: { host: '127.0.0.1', strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  const addr = server.httpServer.address();
  const url = `http://127.0.0.1:${addr.port}/`;
  return { url, close: () => server.close() };
}

/**
 * Ouvre une page. Retourne { browser, page, errors } ; `errors` accumule erreurs de page et console.error.
 * Options : width, height, deviceScaleFactor (1 par défaut ; 2 pour une capture destinée à être montrée), mobile (émulation tactile),
 * pointerLock (true par défaut ; false : la capture de la souris est REFUSÉE, comme dans une iframe sans permission — le jeu passe
 * alors dans son mode de repli : le clic agit, glisser ou les flèches regardent). Sous Chromium headless, une souris capturée
 * emballe le navigateur (images rares, mémoire qui enfle jusqu'à plusieurs Go — constaté par la recette sur une page VIDE, sans le
 * jeu : tests/e2e/verif-diag-lock-vide.mjs) : les parcours longs du vrai jeu passent donc pointerLock: false.
 */
export async function openPage(url, opts = {}) {
  const { width = 1280, height = 720, deviceScaleFactor = 1, mobile = false, pointerLock = true } = opts;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    hasTouch: mobile,
    isMobile: mobile,
  });
  const page = await context.newPage();
  if (!pointerLock) {
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {
        return Promise.reject(new DOMException('capture refusée (essai de bout en bout)', 'NotAllowedError'));
      };
    });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack ? e.stack : String(e))));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { browser, page, errors };
}

/** Attend qu'une expression (chaîne évaluée dans la page) devienne vraie. Le WebGL logiciel est lent : délai large. */
export async function waitFor(page, expression, timeout = 180000) {
  await page.waitForFunction(expression, null, { timeout, polling: 250 });
}

/**
 * Page d'accueil en quatre modes : ouvre l'éditeur du Mode libre (tuile « Mode libre » du hub) et attend « Lancer ».
 * Sans effet si l'éditeur est déjà monté. Le clic est programmatique : il vaut pour la souris, le doigt et le clavier
 * (les scénarios qui testent la tuile elle-même la touchent ou la valident à la manette).
 */
export async function ouvrirEditeur(page, timeout = 120000) {
  await page.waitForFunction(() => !!document.querySelector('[data-id="accueil-libre"], [data-id="lancer"]'), null, { timeout, polling: 250 });
  await page.evaluate(() => {
    if (document.querySelector('[data-id="lancer"]')) return;
    document.querySelector('[data-id="accueil-libre"]').click();
  });
  await page.waitForSelector('[data-id="lancer"]', { timeout });
}

/** Capture d'écran dans tests/e2e/out/<name>.png ; retourne le chemin absolu. */
export async function shot(page, name) {
  const file = path.join(OUT, name.endsWith('.png') ? name : name + '.png');
  await page.screenshot({ path: file });
  return file;
}

/** Ferme tout et termine le processus avec le bon code. */
export async function finish({ browser, server, errors = [], ok = true, label = 'test' }) {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  if (errors.length) {
    console.error(`[${label}] ${errors.length} erreur(s) dans la page :`);
    for (const e of errors.slice(0, 20)) console.error('  - ' + e);
  }
  const success = ok && errors.length === 0;
  console.log(`[${label}] ${success ? 'OK' : 'ÉCHEC'}`);
  process.exit(success ? 0 : 1);
}
