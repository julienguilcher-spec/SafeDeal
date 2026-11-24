// Carte de commandement du vrai jeu, commandant, au pointeur (trackpad : clics seuls, aucun glisser) : une section choisie
// dans « Mes unités », « L'envoyer ailleurs… », un clic sur la carte, « Tenir une ligne ici » : la section reçoit l'ordre
// « ligne » (ou embarque d'abord pour s'y rendre en véhicules), donné par le joueur, et la fiche affiche « ✓ ORDRE DONNÉ ».
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
import { clickCardLine, clickSel, frames, freeMapSpot, tactical, verbFirst } from './verif-fin-lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=100', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(20));
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique'));
  await new Promise((r) => setTimeout(r, 5000));
  const scope = await page.evaluate(() => window.__CRS.ctx.service('ui.command')?.scope?.() ?? null);
  console.log('étendue', JSON.stringify(scope && { level: scope.level, label: scope.label, n: scope.squadIds?.size }));
  // « Mes unités » : une rangée par section (les groupes sont repliés dessous)
  const n = await page.locator('[data-id^="follow-u-"]').count();
  console.log('rangées de « Mes unités »', n);
  await shot(page, 'verif-ordres-1');
  // première section : clic sur sa rangée → sa fiche (Qui imposé)
  const sids = await page.evaluate(() => [...document.querySelectorAll('[data-id^="follow-u-"]')].map((e) => Number(e.dataset.id.replace('follow-u-', ''))));
  const sid = await page.evaluate((list) => list.find((id) => window.__CRS.ctx.squads.get(id)?.kind === 'section') ?? list[0] ?? 0, sids);
  if (!(await clickSel(page, `[data-id="follow-u-${sid}"]`))) throw new Error('rangée de la section introuvable');
  await new Promise((r) => setTimeout(r, 800));
  const unitCard = await tactical(page);
  console.log('fiche de l’unité', JSON.stringify(unitCard && { kind: unitCard.kind, lines: unitCard.lines }));
  if (!unitCard || unitCard.kind !== 'unite') ok = false;
  // ligne 1 « L'envoyer ailleurs… » : la fiche devient « OÙ L'ENVOYER ? »
  if (!(await clickCardLine(page, /^L.envoyer ailleurs/))) throw new Error('« L’envoyer ailleurs… » absente');
  await frames(page, 3);
  // un clic sur la carte, loin de toute unité (sinon c'est la fiche de l'unité touchée) : la fiche du lieu, Qui toujours la section
  const box = await page.locator('[data-id="tac-map"]').boundingBox();
  const spot = await freeMapSpot(page);
  console.log('clic sur la carte', JSON.stringify(spot));
  await page.mouse.click(spot ? spot.x : box.x + box.width * 0.5, spot ? spot.y : box.y + box.height * 0.5);
  await new Promise((r) => setTimeout(r, 1000));
  const place = await tactical(page);
  console.log('fiche du lieu', JSON.stringify(place && { visee: place.visee, kind: place.kind, lines: place.lines, who: place.who }));
  const before = await page.evaluate((id) => window.__CRS.ctx.squads.get(id).order.issuedAt, sid);
  let clicked = await clickCardLine(page, /^(Tenir une ligne ici|Contenir\s*: ligne face à la foule)$/);
  if (!clicked) {
    // le lieu n'a pas de ligne « Tenir une ligne » (une unité, un incident) : « Plus… › Tous les ordres › ligne »
    if (await verbFirst(page, 'ligne')) clicked = (await clickSel(page, '[data-id="card-send"]')) ? 'ligne (Tous les ordres)' : '';
  }
  console.log('ligne cliquée', JSON.stringify(clicked));
  // S4 : « ✓ ORDRE DONNÉ » dans la fiche pendant 2 s (aucun message de réussite par-dessus la carte)
  const shown = await page.evaluate(() => (document.querySelector('[data-id="card"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160));
  await new Promise((r) => setTimeout(r, 1500));
  const res = await page.evaluate(([id, t0]) => {
    const ctx = window.__CRS.ctx;
    const sq = ctx.squads.get(id);
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    return {
      squad: sq && sq.name, order: sq && sq.order.type, by: sq && sq.order.issuedBy === ctx.player.state.personId, fresh: sq && sq.order.issuedAt !== t0,
      sent: t && t.state.lastSent ? t.state.lastSent.text : '',
    };
  }, [sid, before]);
  console.log('résultat', JSON.stringify(res), '| fiche :', JSON.stringify(shown));
  // L'ordre est pris : soit l'unité est déjà en « ligne », soit — point éloigné, unité qui a ses fourgons — elle
  // embarque d'abord pour s'y rendre en véhicules et se mettra en ligne à l'arrivée ; dans les deux cas le joueur en a
  // la confirmation dans la fiche (« ✓ ORDRE DONNÉ »), sans message de réussite par-dessus la carte.
  if (!clicked || !res.squad || !res.by || !res.fresh || !(res.order === 'ligne' || res.order === 'embarquer' || res.order === 'faire_mouvement')) ok = false;
  if (!/ORDRE DONNÉ/.test(shown) || res.sent === '') ok = false;
  await shot(page, 'verif-ordres-2');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'ordres-carte' });
