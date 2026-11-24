// Lisibilité de la carte de commandement (passe F1–F2) — scénario navigateur, un seul navigateur à la fois.
// Commandant à la place de la Concorde, mêmes états que les captures de la refonte :
//   ordinateur 1280 × 800 (clavier) : S0 carte ouverte ; nasse envoyée (N, Entrée) ; S1 fiche « Bloquer une rue » (B) ;
//   S2 « Qui envoyer ? » (Maj + Entrée) ; puis Échap, Entrée : l'ordre part et la radio dit le nom de la rue de la fiche ;
//   téléphone 844 × 390 (doigt) : S0 ; nasse (toucher la foule, « Donner l'ordre ») ; S1 fiche d'une rue touchée.
// À chaque état : aucun texte de la planche des étiquettes n'en recouvre un autre ; la bulle du repère visé est écrite.
// Captures lisible-*.png dans tests/e2e/out (à regarder).
// Usage : node tests/e2e/verif-carte-lisible.mjs [ordi|tel]
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, fingers } from './verif-tpm-lib.mjs';

const which = process.argv[2] ?? 'tous';
const tag = 'verif-carte-lisible';
const C = makeChecker(tag);
const server = await startServer();
const q = new URLSearchParams({
  autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
  quality: 'bas', seed: '7', time: '12', weather: 'clair',
});

/** Textes posés à la dernière image de la carte, et paires qui se recouvrent. */
async function labels(page) {
  return page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const b = t && t.map && t.map.overlay.labels;
    if (!b) return null;
    const last = b.last.map((l) => ({ ...l }));
    const bad = [];
    for (let i = 0; i < last.length; i++) {
      for (let j = i + 1; j < last.length; j++) {
        const a = last[i], c = last[j];
        if (a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5) bad.push(`${a.text} / ${c.text}`);
      }
    }
    return { texts: last.map((l) => l.text), bad };
  });
}
async function checkLabels(page, state) {
  await frames(page, 3);
  const l = await labels(page);
  C.check(!!l, `${state} : planche des étiquettes présente`);
  if (!l) return;
  C.check(l.bad.length === 0, `${state} : aucun texte n’en recouvre un autre (${l.texts.length} textes)`, l.bad.join(' | '));
  C.note(`${state} : ${l.texts.join(' ‖ ')}`);
}

async function laptop() {
  const { browser, page, errors } = await openPage(`${server.url}?${q}`, { width: 1280, height: 800, pointerLock: false });
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
    await step(page, 3);
    const press = async (code, shift = false) => {
      if (shift) await page.keyboard.down('Shift');
      await page.keyboard.down(code);
      await frames(page, 2);
      await page.keyboard.up(code);
      if (shift) await page.keyboard.up('Shift');
      await frames(page, 3);
    };
    await press('Tab');
    await page.waitForTimeout(500);
    await frames(page, 4);
    C.check(await page.evaluate(() => window.__CRS.ctx.ui.current === 'carte_tactique'), 'ordinateur : Tab ouvre la carte');
    await checkLabels(page, 'ordinateur S0');
    await snap(page, 'lisible-S0-1280x800');
    // nasse (comme la capture S1 de la refonte : les unités barrent les rues de la place)
    await press('KeyN');
    await step(page, 0.3);
    await page.waitForTimeout(700);
    await press('Enter');
    await step(page, 3);
    await page.evaluate(() => {
      const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
      for (let i = 0; i < 6 && (t.state.card || t.state.sheet !== 'none' || t.state.intent); i++) if (!t.back()) break;
    });
    await frames(page, 3);
    await press('KeyB');
    await step(page, 0.3);
    await checkLabels(page, 'ordinateur S1');
    await snap(page, 'lisible-S1-1280x800');
    await press('Enter', true);
    await checkLabels(page, 'ordinateur S2');
    await snap(page, 'lisible-S2-1280x800');
    await page.keyboard.press('Escape');
    await frames(page, 3);
    // l'ordre part : la radio dit la rue de la fiche
    const name = await page.evaluate(() => {
      const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
      return t.state.card ? t.state.card.repere.name.split(' — ')[0].trim() : '';
    });
    const n0 = await page.evaluate(() => window.__CRS.ctx.radio.log.length);
    await page.waitForTimeout(700);
    await press('Enter');
    let said = [];
    for (let i = 0; i < 20; i++) {
      await step(page, 1);
      said = await page.evaluate((n) => window.__CRS.ctx.radio.log.slice(n).map((m) => m.text), n0);
      if (said.some((s) => /Barrez la rue|Embarquez/.test(s))) break;
    }
    const order = said.find((s) => /Barrez la rue|Embarquez/.test(s)) ?? '';
    C.check(name !== '' && order.includes(name), `la radio dit le nom de la fiche (« ${name} »)`, order);
    await checkLabels(page, 'ordinateur après l’ordre');
    await snap(page, 'lisible-S1b-1280x800');
  } catch (e) {
    C.check(false, 'ordinateur : scénario interrompu', e && e.stack ? e.stack : String(e));
  } finally {
    C.check(errors.length === 0, 'ordinateur : aucune erreur dans la page', errors.slice(0, 5).join(' | '));
    await browser.close().catch(() => {});
  }
}

async function phone() {
  const { browser, page, errors } = await openPage(`${server.url}?${q}`, { width: 844, height: 390, mobile: true, pointerLock: false });
  const F = await fingers(page);
  const rectOf = (sel) => page.evaluate((s) => {
    const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  const tapSel = async (sel) => {
    const r = await rectOf(sel);
    if (!r) throw new Error('introuvable : ' + sel);
    await F.tap(r.x, r.y);
    await frames(page, 4);
    await page.waitForTimeout(150);
  };
  const screenOf = (x, z) => page.evaluate(([wx, wz]) => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const p = t.map.view.worldToScreen(wx, wz, { x: 0, y: 0 });
    const r = t.map.canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [x, z]);
  const centre = (x, z) => page.evaluate(([wx, wz]) => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    t.map.jumpTo(wx, wz, Math.min(t.map.view.mpp, 1.2));
  }, [x, z]);
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
    await step(page, 3);
    await tapSel('.crs-touch .ct-l-pied.ct-k-tactical');
    await page.waitForTimeout(500);
    await frames(page, 4);
    const ok = await rectOf('[data-id="tac-model-ok"]');
    if (ok) { await F.tap(ok.x, ok.y); await frames(page, 3); }
    await checkLabels(page, 'téléphone S0');
    await snap(page, 'lisible-tel-S0-844x390');
    const crowd = await page.evaluate(() => {
      const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
      const c = t.cardEnv().crowds.slice().sort((a, b) => b.people - a.people)[0];
      return c ? { x: c.x, z: c.z } : null;
    });
    await centre(crowd.x, crowd.z);
    await frames(page, 3);
    let p = await screenOf(crowd.x, crowd.z);
    await F.tap(p.x, p.y);
    await frames(page, 4);
    await tapSel('[data-id="card-send"]');
    await step(page, 3);
    await page.evaluate(() => {
      const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
      for (let i = 0; i < 6 && (t.state.card || t.state.sheet !== 'none' || t.state.intent); i++) if (!t.back()) break;
    });
    const street = await page.evaluate(() => {
      const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
      const c = t.cardEnv().crowds.slice().sort((a, b) => b.people - a.people)[0];
      const e = c && c.exits.find((x) => x.edgeId >= 0 && x.street.trim() !== '' && !x.held);
      return e ? { x: e.x, z: e.z } : null;
    });
    await centre(street.x, street.z);
    await frames(page, 3);
    p = await screenOf(street.x, street.z);
    await F.tap(p.x, p.y);
    await frames(page, 4);
    await checkLabels(page, 'téléphone S1');
    await snap(page, 'lisible-tel-S1-844x390');
  } catch (e) {
    C.check(false, 'téléphone : scénario interrompu', e && e.stack ? e.stack : String(e));
  } finally {
    C.check(errors.length === 0, 'téléphone : aucune erreur dans la page', errors.slice(0, 5).join(' | '));
    await browser.close().catch(() => {});
  }
}

try {
  if (which !== 'tel') await laptop();
  if (which !== 'ordi') await phone();
} finally {
  C.done();
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
