// Test de bout en bout du rendu de base : ouvre le banc d'essai, parcourt les ambiances (heure × météo),
// les modes de caméra, les effets d'écran et les préréglages de qualité, capture chaque vue dans
// tests/e2e/out/render-*.png et vérifie quelques invariants (mode appliqué, ombres, brouillard, budgets).
//
//   node tests/e2e/render.mjs            tout
//   node tests/e2e/render.mjs ambiances  seulement un groupe (ambiances | cameras | effets | qualite)
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const only = process.argv[2] ?? '';
const server = await startServer();
const t0 = Date.now();
const { browser, page, errors } = await openPage(server.url + 'harness/render.html?q=haut&hud=0');
await waitFor(page, 'window.__ready === true');
const failures = [];
const check = (cond, message) => { if (!cond) failures.push(message); };

/** Applique un réglage, laisse le rendu se stabiliser, capture, retourne les mesures. */
async function view(name, setup, frames = 4) {
  await page.evaluate(async ([s, n]) => {
    window.__render.apply(s);
    await window.__render.settle(n);
  }, [setup, frames]);
  const file = await shot(page, 'render-' + name);
  const stats = await page.evaluate(() => {
    const s = window.__render.stats();
    return {
      mode: s.mode, drawCalls: s.drawCalls, triangles: s.triangles, prepareMs: s.prepareMs, renderMs: s.renderMs,
      width: s.width, height: s.height, shadows: s.shadows, visibility: s.visibility, exposure: s.exposure,
      drawDistance: s.drawDistance, quality: s.quality, cam: s.cam, fov: s.fov, tpsDistance: s.tpsDistance,
      daylight: s.env.daylight, streetLights: s.env.streetLights, rain: s.env.rain, wetness: s.wetness, night: s.night,
      lightsLit: s.lightsLit, lightsWanted: s.lightsWanted, rainStreaks: s.rainStreaks, pointBudget: s.pointBudget,
      sunElev: (s.sky.sunElevation * 180) / Math.PI, moonElev: (s.sky.moonElevation * 180) / Math.PI,
      fog: s.fog, programs: s.programs,
    };
  });
  console.log(`  ${name.padEnd(22)} ${String(stats.drawCalls).padStart(3)} appels  prép. ${stats.prepareMs.toFixed(2)} ms  `
    + `soleil ${stats.sunElev.toFixed(1)}°  jour ${stats.daylight.toFixed(2)}  expo ${stats.exposure.toFixed(2)}  `
    + `visibilité ${Math.round(stats.visibility)} m  pluie ${stats.rainStreaks}  lumières ${stats.lightsLit}/${stats.lightsWanted}`);
  return { file, stats };
}

// Point de vue des ambiances : au milieu de la chaussée, à hauteur d'homme, regard vers le haut de la rue
// (vers le couchant), assez de ciel pour le juger.
const STREET = { cam: 'free', pos: [3.2, 1.9, 46], yaw: -3, pitch: 9, zoom: 1, feu: false, gyro: false, fx: { gas: 0, wet: 0, pain: 0, visor: 0, flash: 0 } };
const reset = { ...STREET, meteo: 'clair', t: 14 };

if (!only || only === 'ambiances') {
  console.log('Ambiances :');
  const noon = await view('01-midi-clair', { ...STREET, t: 13.8, meteo: 'clair' });
  check(noon.stats.shadows === true, 'les ombres devraient être actives en qualité haute');
  check(noon.stats.daylight > 0.95, 'plein jour attendu à midi');
  check(noon.stats.streetLights === false, 'éclairage public éteint à midi');
  check(noon.stats.rainStreaks === 0, 'pas de pluie par temps clair');
  await view('02-midi-clair-sud', { ...STREET, t: 13.8, meteo: 'clair', yaw: 178, pos: [-3, 1.9, -50], pitch: 14 });
  await view('03-nuageux', { ...STREET, t: 15.5, meteo: 'nuageux' });
  await view('04-fin-apres-midi-doree', { ...STREET, t: 19.9, meteo: 'clair' });
  const sunset = await view('05-coucher-de-soleil', { ...STREET, t: 20.8, meteo: 'nuageux', pitch: 7 });
  check(sunset.stats.sunElev > 0 && sunset.stats.sunElev < 5, 'soleil rasant attendu au coucher');
  await view('06-coucher-clair', { ...STREET, t: 20.95, meteo: 'clair', pitch: 6 });
  const dusk = await view('07-crepuscule', { ...STREET, t: 21.55, meteo: 'clair', pitch: 8, feu: true });
  check(dusk.stats.streetLights === true, 'éclairage public allumé au crépuscule');
  const night = await view('08-nuit', { ...STREET, t: 23.5, meteo: 'clair', feu: true, gyro: true, pitch: 8 });
  check(night.stats.daylight === 0, 'nuit : lumière du jour nulle');
  check(night.stats.exposure > 1.3, 'nuit : exposition relevée');
  check(night.stats.lightsLit > 0, 'nuit : des lumières dynamiques allumées');
  check(night.stats.lightsLit <= night.stats.pointBudget + 3, 'le budget de lumières est respecté');
  await view('09-nuit-lune', { ...STREET, t: 0.6, meteo: 'clair', yaw: 176, pos: [-3, 1.9, -60], pitch: 12, feu: false, gyro: false });
  await view('10-nuit-couverte', { ...STREET, t: 23.5, meteo: 'couvert', feu: true, gyro: true });
  await view('11-couvert', { ...STREET, t: 15, meteo: 'couvert' });
  const rain = await view('12-pluie', { ...STREET, t: 16, meteo: 'pluie' });
  check(rain.stats.rainStreaks > 500, 'des traits de pluie attendus');
  check(rain.stats.wetness > 0.9, 'sol mouillé sous la pluie');
  await view('13-averse', { ...STREET, t: 17, meteo: 'averse' });
  const fog = await view('14-brouillard', { ...STREET, t: 9, meteo: 'brouillard' });
  check(fog.stats.visibility < 120, 'visibilité réduite dans le brouillard');
  check(fog.stats.drawDistance < 150, 'distance d’affichage réduite dans le brouillard');
  check(fog.stats.visibility < noon.stats.visibility / 3, 'le brouillard réduit nettement la visibilité');
  await view('15-orage', { ...STREET, t: 18, meteo: 'orage' });
  await view('16-orage-eclair', { ...STREET, t: 18, meteo: 'orage', eclair: 1 }, 1);
  await view('17-orage-nuit', { ...STREET, t: 22.5, meteo: 'orage', feu: true, gyro: true });
  await view('18-aube', { ...STREET, t: 6.45, meteo: 'nuageux', yaw: 178, pos: [-3, 1.9, -50], pitch: 9 });
}

if (!only || only === 'cameras') {
  console.log('Caméras :');
  const base = { t: 16.5, meteo: 'nuageux', zoom: 1, yaw: 0, pitch: 0, joueur: [2.5, 26], feu: true, gyro: true, marche: false, fx: { gas: 0, wet: 0, pain: 0, visor: 0, flash: 0 } };
  for (const [name, setup] of [
    ['20-cam-fps', { cam: 'fps', pitch: -2 }],
    ['21-cam-tps', { cam: 'tps', pitch: -6 }],
    ['22-cam-tps-mur', { cam: 'tps', joueur: [11.6, 30], yaw: -80, pitch: -4 }],
    ['23-cam-vehicle-ext', { cam: 'vehicle_ext' }],
    ['24-cam-vehicle-int', { cam: 'vehicle_int', pitch: -3 }],
    ['25-cam-turret', { cam: 'turret', pitch: -8, yaw: 8 }],
    ['26-cam-drone', { cam: 'drone', pitch: -20 }],
    ['27-cam-tactical', { cam: 'tactical', zoom: 1.6 }],
    ['28-cam-tactical-large', { cam: 'tactical', zoom: 0.5 }],
    ['29-cam-viewfinder', { cam: 'viewfinder', zoom: 4, yaw: 1, pitch: -1.5 }],
    ['30-cam-free', { cam: 'free', pos: [-11, 14, 60], yaw: 12, pitch: -14 }],
  ]) {
    const r = await view(name, { ...base, ...setup }, 6);
    const wanted = setup.cam;
    check(r.stats.mode === wanted, `${name} : mode ${r.stats.mode} au lieu de ${wanted}`);
  }
  const tps = await page.evaluate(() => window.__render.stats());
  check(tps.mode === 'free', 'dernier mode : free');
  // collision de la caméra d'épaule : dos au mur, le recul est réduit et la caméra reste hors de l'immeuble
  const wall = await view('31-cam-tps-dos-au-mur', { ...base, cam: 'tps', joueur: [12.3, 30], yaw: -90, pitch: -3 }, 6);
  check(wall.stats.tpsDistance < 1.5, `dos au mur : recul ${wall.stats.tpsDistance.toFixed(2)} m, attendu < 1,5 m`);
  const open = await view('32-cam-tps-degage', { ...base, cam: 'tps', joueur: [0, 30], yaw: 0, pitch: -3 }, 30);
  check(open.stats.tpsDistance > 3, `terrain dégagé : recul ${open.stats.tpsDistance.toFixed(2)} m, attendu > 3 m`);
}

if (!only || only === 'effets') {
  console.log('Effets d’écran :');
  const base = { cam: 'fps', t: 16.5, meteo: 'nuageux', joueur: [2.5, 26], yaw: 0, pitch: -2, zoom: 1, feu: true, gyro: false };
  const none = { gas: 0, wet: 0, pain: 0, visor: 0, flash: 0 };
  await view('40-fx-gaz', { ...base, fx: { ...none, gas: 0.75 } }, 40);
  await view('41-fx-flash', { ...base, fx: { ...none, flash: 0.85 } }, 3);
  await view('42-fx-gouttes', { ...base, meteo: 'pluie', fx: { ...none, wet: 0.8 } }, 20);
  await view('43-fx-douleur', { ...base, fx: { ...none, pain: 0.8 } }, 3);
  await view('44-fx-visiere', { ...base, fx: { ...none, visor: 1 } }, 30);
  await view('45-fx-visiere-pluie', { ...base, meteo: 'pluie', fx: { ...none, visor: 1, wet: 0.6 } }, 20);
  await view('46-secousse', { ...base, fx: none, secousse: 1 }, 3);
}

if (!only || only === 'qualite') {
  console.log('Préréglages de qualité :');
  const base = { ...reset, t: 17.5, meteo: 'nuageux', feu: true, gyro: true };
  const results = {};
  for (const q of ['bas', 'moyen', 'haut', 'ultra']) {
    const r = await view('50-qualite-' + q, { ...base, quality: q }, 8);
    results[q] = r.stats;
    check(r.stats.quality === q, `qualité ${q} non appliquée`);
  }
  check(results.bas.shadows === false, 'pas d’ombre portée en qualité basse');
  check(results.moyen.shadows === true, 'ombres en qualité moyenne');
  check(results.bas.drawCalls < results.haut.drawCalls, 'moins d’appels de dessin en qualité basse (pas de passe d’ombre)');
  check(results.bas.pointBudget < results.ultra.pointBudget, 'budget de lumières croissant avec la qualité');
  const lowRain = await view('51-qualite-bas-pluie', { ...base, quality: 'bas', meteo: 'averse' }, 6);
  const highRain = await view('52-qualite-ultra-pluie', { ...base, quality: 'ultra', meteo: 'averse' }, 6);
  check(lowRain.stats.rainStreaks < highRain.stats.rainStreaks / 4, 'bien moins de traits de pluie en qualité basse');
  await page.evaluate(() => window.__render.apply({ quality: 'haut' }));
}

console.log(`durée : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const f of failures) console.error('  ÉCHEC : ' + f);
await finish({ browser, server, errors, ok: failures.length === 0, label: 'render' });
