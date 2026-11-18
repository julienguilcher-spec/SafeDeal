// Carte de commandement : un ordre donné à un groupe montre l'itinéraire réel, la distance et le temps estimé ; les
// étiquettes de la carte et les rangées de « Mes unités » disent l'ordre en mots simples (« TIENT », « EN LIGNE »,
// « Tient une ligne… »), jamais un type brut en capitales (« COUPER_CIRCULATION ») ni « INITIATIVE ».
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=60', { width: 1280, height: 720 });
let ok = true;
const fail = (msg, detail = '') => {
  ok = false;
  console.error('  ✗ ' + msg + (detail ? ' — ' + detail : ''));
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(15));
  const info = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const g = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe');
    // un groupe vers la terrasse du Jeu de Paume (détour par les escaliers), un autre vers la rue Royale ; un troisième barre une rue
    ctx.squads.issue(g[0].id, { type: 'tenir', x: 140, z: 5, heading: 0, width: 12, issuedBy: me.id });
    ctx.squads.issue(g[1].id, { type: 'ligne', x: 126, z: -230, heading: 3.1, width: 14, issuedBy: me.id });
    if (g[2]) ctx.squads.issue(g[2].id, { type: 'couper_circulation', x: 60, z: -120, heading: 0, width: 14, issuedBy: me.id });
    return g.slice(0, 3).map((s) => ({ id: s.id, parent: s.parentId, name: s.name }));
  });
  await page.evaluate(() => window.__CRS.step(4));
  // textes dessinés sur la carte (étiquettes des ordres) : relevés au passage de fillText
  await page.evaluate(() => {
    window.__drawn = new Set();
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
      if (typeof text === 'string' && window.__drawn.size < 5000) window.__drawn.add(text);
      return orig.call(this, text, ...rest);
    };
  });
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique', { x: 60, z: -40, mpp: 0.9 }));
  await new Promise((r) => setTimeout(r, 4000));
  const routes = await page.evaluate(() => [...(window.__CRS.ctx.service('ui.maps')?.scene?.routes?.entries?.() ?? [])].map(([k, r]) => `${k}: ${Math.round(r.length)} m`));
  console.log('groupes', info.map((g) => g.name).join(', '), '| itinéraires', JSON.stringify(routes));
  if (routes.length === 0) fail('aucun itinéraire tracé pour les groupes en route');
  // « Mes unités » : les sections des groupes dépliées, leurs rangées lues
  const rows = await page.evaluate((groups) => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const panel = t && t.followPanel;
    if (!panel) return null;
    for (const g of groups) if (g.parent) panel.fold(true, 'u:' + g.parent);
    panel.refresh(true);
    return {
      rows: panel.unitRows.map((r) => ({ squad: r.squadId, name: r.name, doing: r.doing, status: r.status })),
      text: (document.querySelector('[data-id="tac-units"]')?.innerText || '').replace(/\s+/g, ' '),
    };
  }, info);
  if (!rows) fail('« Mes unités » absent de la carte');
  else {
    for (const g of info) {
      const r = rows.rows.find((q) => q.squad === g.id);
      console.log(`  rangée ${g.name} :`, JSON.stringify(r));
      if (!r || r.doing === '' || /Sans ordre/.test(r.doing)) fail(`« Mes unités » : la rangée de ${g.name} dit ce qu’elle fait`, JSON.stringify(r));
    }
    const raw = rows.text.match(/\b[A-Z]{3,}_[A-Z_]+\b|INITIATIVE/);
    if (raw) fail('« Mes unités » : aucun type brut ni « INITIATIVE »', raw[0]);
  }
  await new Promise((r) => setTimeout(r, 1500));
  const drawn = await page.evaluate(() => [...window.__drawn]);
  const rawTags = drawn.filter((s) => /\b[A-Z]{3,}_[A-Z_]+\b/.test(s) || /\bINITIATIVE\b/.test(s));
  const plainTags = drawn.filter((s) => /\b(TIENT|EN LIGNE|BARRE)\b/.test(s));
  console.log('étiquettes des ordres sur la carte', JSON.stringify(plainTags.slice(0, 8)));
  if (rawTags.length > 0) fail('carte : jamais un type brut en capitales', rawTags.slice(0, 4).join(' | '));
  if (plainTags.length === 0) fail('carte : les ordres sont étiquetés en mots simples (TIENT, EN LIGNE, BARRE)', drawn.slice(0, 30).join(' | '));
  await shot(page, 'suivi-ordres');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'suivi-ordres' });
