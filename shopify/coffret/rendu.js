/* Rendu local du composeur : node rendu.js <dossier> <port> <prefixe-de-sortie>
 * Sert <dossier> en HTTP sur <port>, ouvre harnais.html dans Chromium sans écran
 * et écrit <prefixe>-vide.png, -plein.png, -dessus.png, -bas.png, -gauche.png,
 * -droite.png, -mobile.png. Affiche les erreurs JavaScript de la page. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [dossier, port, prefixe] = process.argv.slice(2);
if (!dossier || !port || !prefixe) { console.error('usage: node rendu.js <dossier> <port> <prefixe>'); process.exit(2); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const f = path.join(dossier, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
});
serveur.listen(+port, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + port + '/harnais.html';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-proxy-server'] });
  const erreurs = [];
  async function page(largeur) {
    const ctx = await b.newContext({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => erreurs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) erreurs.push(m.text()); });
    return p;
  }
  async function vue(p, url, nom, attente) {
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(attente || 3500);
    await p.locator('.mb-coffret__scene').screenshot({ path: prefixe + '-' + nom + '.png' });
  }
  async function glisser(p, dx, dy) {
    const bb = await p.locator('.mb-coffret__scene').boundingBox();
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + dx, cy + dy, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(1200);
  }
  try {
    const p = await page(1280);
    await vue(p, base, 'vide');
    await vue(p, base + '?ajoute=P-500,B-V250,B-A100', 'plein');
    await vue(p, base + '?ajoute=P-500,B-V250,B-A100&vue=dessus', 'dessus');
    await p.goto(base + '?ajoute=P-500,B-V250,B-A100', { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(3000);
    await glisser(p, 120, -70); await p.locator('.mb-coffret__scene').screenshot({ path: prefixe + '-bas.png' });
    await glisser(p, -380, 30); await p.locator('.mb-coffret__scene').screenshot({ path: prefixe + '-gauche.png' });
    await glisser(p, 620, -20); await p.locator('.mb-coffret__scene').screenshot({ path: prefixe + '-droite.png' });
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) await glisser(p, i % 2 ? 60 : -60, 0);
    const parImage = (Date.now() - t0) / 6;
    const m = await page(500);
    await vue(m, base + '?ajoute=P-500,B-V250', 'mobile', 4000);
    console.log(JSON.stringify({ erreurs: erreurs, msParInteraction: Math.round(parImage) }));
  } catch (e) { console.error(e); process.exitCode = 1; }
  await b.close(); serveur.close();
});
