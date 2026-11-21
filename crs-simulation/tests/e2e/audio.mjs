// Test de bout en bout du moteur sonore.
//   1. Chaque SoundId est rendu dans un OfflineAudioContext puis contrôlé : échantillons finis,
//      non silencieux, pas d'écrêtage, durée cohérente avec celle annoncée par la recette.
//   2. Les notes des sirènes deux-tons sont mesurées (435 Hz + la note propre à chaque service).
//   3. Des planches de spectrogrammes sont écrites dans tests/e2e/out/audio-*.png.
// Usage : node tests/e2e/audio.mjs [--only id1,id2] [--no-boards]
import { startServer, openPage, waitFor, finish, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const noBoards = args.includes('--no-boards');

const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'harness/audio.html', { width: 1280, height: 800 });
await waitFor(page, 'window.__ready === true');

const info = await page.evaluate(() => ({ ids: window.__audioTest.ids, contract: window.__audioTest.contractIds, defs: window.__audioTest.defs }));
const ids = only ?? info.ids;
const failures = [];
const rows = [];
const fail = (id, msg) => failures.push(`${id} : ${msg}`);

function check(rep, sustainedLoop) {
  const { id } = rep;
  if (rep.nonFinite > 0) fail(id, `${rep.nonFinite} échantillon(s) non fini(s)`);
  if (rep.peak > 0.985) fail(id, `écrêtage : crête ${rep.peak.toFixed(3)}`);
  if (rep.peak < 0.08) fail(id, `quasi silencieux : crête ${rep.peak.toFixed(4)}`);
  if (rep.rms < 0.004) fail(id, `quasi silencieux : valeur efficace ${rep.rms.toFixed(5)}`);
  if (Math.abs(rep.dc) > 0.02) fail(id, `composante continue ${rep.dc.toFixed(4)}`);
  if (sustainedLoop) {
    // une boucle entretenue doit tenir toute la fenêtre
    const segs = rep.segments;
    const min = Math.min(...segs.slice(1));
    const max = Math.max(...segs);
    if (!(min > 0.15 * max)) fail(id, `boucle non entretenue : tranches ${segs.map((v) => v.toFixed(3)).join(' ')}`);
  } else {
    const end = rep.lead + rep.declared;
    if (rep.firstAudible < 0 || rep.firstAudible > rep.lead + 0.15) fail(id, `attaque tardive : premier son à ${rep.firstAudible.toFixed(3)} s`);
    if (rep.lastAudible > end + 0.06) fail(id, `le son dépasse sa durée annoncée : ${rep.lastAudible.toFixed(2)} s > ${end.toFixed(2)} s`);
    if (rep.lastAudible < rep.lead + 0.3 * rep.declared) fail(id, `durée annoncée (${rep.declared.toFixed(2)} s) très supérieure au son réel (fin à ${rep.lastAudible.toFixed(2)} s)`);
  }
}

console.log(`Rendu hors ligne de ${ids.length} sons…`);
for (const id of ids) {
  const def = info.defs.find((d) => d.id === id);
  // lecture ponctuelle (fenêtre de 1 à 3,5 s ; les sons hors contrat plus longs ont une fenêtre adaptée)
  const rep = await page.evaluate(([i]) => window.__audioTest.render(i, { maxSeconds: 7 }), [id]);
  check(rep, false);
  let loopNote = '';
  if (def && def.sustained) {
    const lrep = await page.evaluate(([i]) => window.__audioTest.render(i, { loop: true, seconds: 3 }), [id]);
    check(lrep, true);
    loopNote = ` | boucle : eff. ${lrep.rms.toFixed(3)}`;
  }
  // stabilité : deux autres graines ne doivent pas écrêter
  for (const seed of [7, 4242]) {
    const r2 = await page.evaluate(([i, s]) => window.__audioTest.render(i, { seed: s, maxSeconds: 7 }), [id, seed]);
    if (r2.nonFinite > 0 || r2.peak > 0.985) fail(id, `graine ${seed} : crête ${r2.peak.toFixed(3)}, non finis ${r2.nonFinite}`);
  }
  rows.push(rep);
  console.log(
    `  ${id.padEnd(20)} durée ${String(rep.declared.toFixed(2)).padStart(5)} s | fin ${rep.lastAudible.toFixed(2).padStart(5)} s | crête ${rep.peak.toFixed(3)} | eff. ${rep.rms.toFixed(4)}${loopNote}`,
  );
}

// ── tous les SoundId du contrat doivent avoir été rendus ──
if (!only) {
  for (const id of info.contract) if (!rows.find((r) => r.id === id)) fail(id, 'SoundId du contrat sans recette');
}

// ── notes des sirènes deux-tons ──
const sirens = { sirene_police: [435, 580, 55], sirene_pompiers: [435, 488, 27.5], sirene_samu: [435, 651, 55], sirene_gendarmerie: [435, 732, 55] };
for (const [id, [low, high, cpm]] of Object.entries(sirens)) {
  if (only && !only.includes(id)) continue;
  const half = 60 / cpm / 2;
  // milieu de la première note (aiguë) puis de la seconde (grave)
  const f1 = await page.evaluate(([i, a, b]) => window.__audioTest.tone(i, a, b, 380, 800, { loop: true, seconds: 3 }), [id, 0.02 + half * 0.25, 0.02 + half * 0.75]);
  const f2 = await page.evaluate(([i, a, b]) => window.__audioTest.tone(i, a, b, 380, 800, { loop: true, seconds: 3 }), [id, 0.02 + half * 1.25, 0.02 + half * 1.75]);
  const okHigh = Math.abs(f1 - high) < 8;
  const okLow = Math.abs(f2 - low) < 8;
  console.log(`  ${id} : notes mesurées ${f1.toFixed(1)} Hz puis ${f2.toFixed(1)} Hz (attendu ${high} puis ${low})`);
  if (!okHigh || !okLow) fail(id, `notes ${f1.toFixed(1)} / ${f2.toFixed(1)} Hz au lieu de ${high} / ${low} Hz`);
}

// ── planches de spectrogrammes ──
const files = [];
if (!noBoards) {
  const save = (name, dataUrl) => {
    const file = path.join(OUT, name);
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    files.push(file);
  };
  const groups = [...new Set(info.defs.map((d) => d.group))];
  let n = 0;
  for (const group of groups) {
    const gids = info.defs.filter((d) => d.group === group && ids.includes(d.id)).map((d) => d.id);
    for (let i = 0; i < gids.length; i += 8) {
      const part = gids.slice(i, i + 8);
      const url = await page.evaluate(([p, t]) => window.__audioTest.board(p, { title: t, cols: 4, cellW: 400, cellH: 300, render: { maxSeconds: 7 } }), [part, `Spectrogrammes — ${group}`]);
      save(`audio-${String(++n).padStart(2, '0')}-${group.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-')}.png`, url);
    }
  }
  // prosodie : les slogans et la voix de mégaphone suivent le texte fourni
  {
    const texts = [
      'Tous ensemble, tous ensemble, ouais !',
      'Résistance ! Résistance !',
      'Première sommation : on va faire usage de la force. Quittez immédiatement les lieux.',
      'Dispersez-vous.',
    ];
    const url = await page.evaluate(([t]) => window.__audioTest.board(['foule_slogans', 'foule_slogans', 'megaphone', 'megaphone'], {
      title: 'Prosodie — le rythme suit le texte (une attaque par syllabe, silence aux ponctuations)', cols: 2, cellW: 800, cellH: 300,
      renders: t.map((text) => ({ text, maxSeconds: 9 })), notes: t.map((text) => '« ' + text + ' »'),
      spectro: { fMax: 8000 },
    }), [texts]);
    save('audio-prosodie.png', url);
  }
  // zoom sur les sirènes : axe linéaire 300–1 600 Hz, repères aux fréquences réglementaires
  const sids = Object.keys(sirens).filter((i) => ids.includes(i));
  if (sids.length) {
    const url = await page.evaluate(([p]) => window.__audioTest.board(p, {
      title: 'Sirènes deux-tons — zoom 300–1 600 Hz (repères : 435, 488, 580, 651, 732 Hz)', cols: 2, cellW: 800, cellH: 330,
      render: { loop: true, seconds: 3 },
      spectro: { log: false, fMin: 300, fMax: 1600, fftSize: 4096, hop: 256, guides: [435, 488, 580, 651, 732], dbMin: -70, dbMax: -10 },
    }), [sids]);
    save('audio-sirenes-zoom.png', url);
  }
}

// ─────────────────────────── spatialisation : moteur complet rendu hors ligne ───────────────────────────
if (!only) {
  console.log('\nSpatialisation (moteur complet sur OfflineAudioContext) :');
  const sfail = (msg) => failures.push('spatialisation : ' + msg);
  const pb = await page.evaluate(() => window.__audioTest.passBy());
  const p = pb.report;
  writeFileSync(path.join(OUT, 'audio-scene-passage.png'), Buffer.from(pb.image.split(',')[1], 'base64'));
  files.push(path.join(OUT, 'audio-scene-passage.png'));
  console.log(`  passage de sirène — début : G ${p.startL.toFixed(4)} / D ${p.startR.toFixed(4)} ; milieu : G ${p.midL.toFixed(4)} / D ${p.midR.toFixed(4)} ; fin : G ${p.endL.toFixed(4)} / D ${p.endR.toFixed(4)} ; crête ${p.peak.toFixed(3)}`);
  console.log(`  note grave : ${p.lowApproach.toFixed(1)} Hz à l'approche, ${p.lowRecede.toFixed(1)} Hz à l'éloignement (435 Hz à l'arrêt)`);
  // le véhicule arrive de l'ouest : à droite d'un auditeur tourné vers le sud, puis passe à gauche
  if (!(p.startR > p.startL * 1.5)) sfail(`au début la sirène devrait être à droite (G ${p.startL}, D ${p.startR})`);
  if (!(p.endL > p.endR * 1.5)) sfail(`à la fin la sirène devrait être à gauche (G ${p.endL}, D ${p.endR})`);
  if (!(p.midL + p.midR > 3 * (p.startL + p.startR))) sfail('la sirène devrait être nettement plus forte en passant devant');
  if (!(Math.abs(p.midL - p.midR) < 0.5 * Math.max(p.midL, p.midR))) sfail('au passage la sirène devrait être à peu près centrée');
  // Doppler : 435 × 343/(343−20·cos) à l'approche, 435 × 343/(343+20·cos) à l'éloignement
  if (!(p.lowApproach > 445 && p.lowApproach < 470)) sfail(`Doppler à l'approche : ${p.lowApproach} Hz (attendu ≈ 455–462)`);
  if (!(p.lowRecede > 400 && p.lowRecede < 425)) sfail(`Doppler à l'éloignement : ${p.lowRecede} Hz (attendu ≈ 410–415)`);
  if (p.peak > 0.99) sfail(`écrêtage en sortie du limiteur (${p.peak})`);

  const oc = await page.evaluate(() => window.__audioTest.occlusion());
  console.log(`  occlusion — niveau : ${oc.openRms.toFixed(4)} → ${oc.hiddenRms.toFixed(4)} derrière le mur → ${oc.reopenedRms.toFixed(4)} ; part d'aigus (> 2 kHz) : ${(oc.openHigh * 100).toFixed(1)} % → ${(oc.hiddenHigh * 100).toFixed(1)} %`);
  if (!(oc.hiddenRms < oc.openRms * 0.75)) sfail('une source masquée devrait être atténuée');
  if (!(oc.hiddenHigh < oc.openHigh * 0.4)) sfail('une source masquée devrait perdre ses aigus (passe-bas)');
  if (!(Math.abs(oc.reopenedRms - oc.openRms) < 0.25 * oc.openRms)) sfail('le son devrait revenir quand le mur disparaît');

  const di = await page.evaluate(() => window.__audioTest.distance());
  console.log(`  détonation à 5 / 20 / 80 / 320 m — niveaux : ${di.levels.map((v) => v.toFixed(4)).join(' / ')} ; arrivée du son : ${di.onsets.map((v) => v.toFixed(3) + ' s').join(' / ')}`);
  for (let i = 1; i < di.levels.length; i++) if (!(di.levels[i] < di.levels[i - 1])) sfail(`le niveau devrait décroître avec la distance (${di.levels})`);
  // retard de propagation : 320 m ≈ 0,93 s ; 80 m ≈ 0,23 s
  if (!(Math.abs(di.onsets[3] - di.onsets[0] - (320 - 5) / 343) < 0.06)) sfail(`retard de propagation à 320 m : ${di.onsets[3]} s`);
  if (!(Math.abs(di.onsets[2] - di.onsets[0] - (80 - 5) / 343) < 0.04)) sfail(`retard de propagation à 80 m : ${di.onsets[2]} s`);
}

if (!only) {
  const stp = await page.evaluate(() => window.__audioTest.stress());
  console.log(`  salve de ${stp.voices} détonations simultanées à bout portant — crête en sortie : ${stp.peak.toFixed(3)}, niveau efficace : ${stp.rms.toFixed(3)}`);
  if (stp.voices < 25) failures.push(`spatialisation : la salve n'a démarré que ${stp.voices} voix`);
  if (!(stp.peak <= 0.999)) failures.push(`spatialisation : écrêtage en sortie sous la salve (crête ${stp.peak})`);
}

// ─────────────────────────── temps réel : le banc d'essai interactif ───────────────────────────
const rt = [];
const rtFail = (msg) => { failures.push('temps réel : ' + msg); };
const H = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = () => H(() => window.__audioHarness.debug.stats());
const voices = () => H(() => window.__audioHarness.debug.voices());
const setInput = (id, value) => H(([i, v]) => {
  const e = document.getElementById(i);
  if (e.type === 'checkbox') { e.checked = !!v; e.dispatchEvent(new Event('change')); }
  else { e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); }
}, [id, value]);
/** Niveau efficace maximal observé en sortie pendant `ms` millisecondes. */
const peakLevel = async (ms) => {
  let m = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { m = Math.max(m, await H(() => window.__audioHarness.level())); await sleep(40); }
  return m;
};

if (!only) {
  // 1. avant tout geste : aucun contexte audio, les sons ponctuels sont perdus sans erreur
  const before = await stats();
  if (before.state !== 'verrouillé') rtFail(`contexte créé avant le premier geste (état « ${before.state} »)`);
  await H(() => window.__audioHarness.fake.ctx.audio.play('ui_clic'));

  // 2. premier geste (clic sur un bouton) : le contexte démarre
  await page.click('button[data-sound="ui_valide"]');
  await page.waitForFunction(() => window.__audioHarness.debug.stats().state === 'running', null, { timeout: 15000 }).catch(() => {});
  const after = await stats();
  rt.push(`contexte après le premier clic : ${after.state}, ${after.sampleRate} Hz`);
  if (after.state !== 'running') rtFail(`le contexte ne tourne pas après un geste (état « ${after.state} »)`);

  // 3. un son ponctuel produit du signal en sortie du limiteur
  await page.click('button[data-sound="detonation"]');
  const lvl = await peakLevel(700);
  rt.push(`niveau en sortie pendant une détonation : ${lvl.toFixed(3)}`);
  if (!(lvl > 0.02)) rtFail(`pas de signal en sortie pendant une détonation (niveau ${lvl})`);
  if (lvl > 1) rtFail(`sortie au-delà de la pleine échelle (${lvl})`);

  // 4. foule vivante : cortège calme → slogans ; colère → huées ; peur → panique
  await setInput('crowd-count', 120);
  await setInput('crowd-phase', 'cortege');
  await sleep(4500);
  let mix = await H(() => ({ ...window.__audioHarness.debug.crowdMix() }));
  let vs = await voices();
  rt.push(`cortège de 120 : slogans ${mix.chant.toFixed(2)}, murmure ${mix.murmur.toFixed(2)}, tambours ${mix.drums.toFixed(2)} | ${vs.filter((v) => /foule|batucada/.test(v)).join(' ; ')}`);
  if (!(mix.chant > 0.5 && mix.chant > mix.boo)) rtFail(`cortège : les slogans ne dominent pas (${JSON.stringify(mix)})`);
  if (!vs.some((v) => v.includes('foule_calme'))) rtFail('cortège : le lit « foule_calme » ne tourne pas');
  // slogans spontanés : on en attend au moins un dans les 6 secondes
  const chantSeen = await page.waitForFunction(() => window.__audioHarness.debug.voices().some((v) => v.includes('foule_slogans')), null, { timeout: 6000 }).then(() => true, () => false);
  if (!chantSeen) rtFail('cortège : aucun slogan spontané en 6 s');
  // l'événement crowd:chant, lui, est suivi d'effet immédiatement (après la fin du slogan en cours)
  await page.waitForFunction(() => !window.__audioHarness.debug.voices().some((v) => v.includes('foule_slogans')), null, { timeout: 8000 }).catch(() => {});
  await page.click('#chant');
  await sleep(150);
  vs = await voices();
  if (!vs.some((v) => v.includes('foule_slogans'))) rtFail("l'événement crowd:chant ne déclenche pas de slogan");

  await setInput('crowd-phase', 'affrontement');
  await setInput('crowd-anger', 0.9);
  await sleep(3500);
  mix = await H(() => ({ ...window.__audioHarness.debug.crowdMix() }));
  vs = await voices();
  rt.push(`affrontement, colère 0,9 : huées ${mix.boo.toFixed(2)}, slogans ${mix.chant.toFixed(2)}, sifflets ${mix.whistle.toFixed(2)}`);
  if (!(mix.boo > mix.chant && mix.boo > mix.murmur)) rtFail(`affrontement : les huées ne dominent pas (${JSON.stringify(mix)})`);
  if (!vs.some((v) => v.includes('foule_huees'))) rtFail('affrontement : le lit « foule_huees » ne tourne pas');

  await setInput('crowd-fear', 0.9);
  await sleep(3000);
  mix = await H(() => ({ ...window.__audioHarness.debug.crowdMix() }));
  vs = await voices();
  rt.push(`peur 0,9 : panique ${mix.panic.toFixed(2)}, slogans ${mix.chant.toFixed(2)}`);
  if (!(mix.panic > 0.5 && mix.panic > mix.chant)) rtFail(`peur : la panique ne domine pas (${JSON.stringify(mix)})`);
  if (!vs.some((v) => v.includes('foule_panique'))) rtFail('peur : le lit « foule_panique » ne tourne pas');
  files.push(path.join(OUT, 'audio-banc-foule.png'));
  await page.screenshot({ path: files[files.length - 1] });
  // coût JavaScript de frame() avec 120 manifestants autour de l'auditeur (WebGL logiciel : on mesure le temps, pas les images/s)
  const cost = await H(() => window.__audioTest.frameCost(600));
  rt.push(`coût de frame() avec une foule de 120 : ${cost.mean.toFixed(3)} ms en moyenne, ${cost.max.toFixed(2)} ms au pire`);
  if (cost.mean > 1.5) rtFail(`frame() trop coûteux : ${cost.mean.toFixed(2)} ms en moyenne`);
  const tex = await H(() => window.__audioTest.textureTimings());
  rt.push('calcul des textures (ms, une seule fois par page) : ' + Object.entries(tex).map(([k, v]) => `${k} ${v}`).join(', '));
  await setInput('crowd-count', 0);

  // 5. sirène attachée à un véhicule, moteur piloté, pluie, pas
  await page.click('button[data-siren="Police"]');
  await page.click('#motor');
  await setInput('rpm', 0.6);
  await setInput('rain', 0.8);
  await setInput('walk', true);
  await sleep(1500);
  vs = await voices();
  rt.push('boucles : ' + vs.filter((v) => v.includes('boucle')).join(' ; '));
  for (const want of ['sirene_police', 'moteur', 'pluie', 'ville']) {
    if (!vs.some((v) => v.includes(want) && v.includes('boucle'))) rtFail(`la boucle « ${want} » ne tourne pas`);
  }
  const played0 = (await stats()).played;
  await sleep(1500);
  const played1 = (await stats()).played;
  rt.push(`pas du joueur : ${played1 - played0} sons déclenchés en 1,5 s de marche`);
  if (played1 - played0 < 2) rtFail('aucun bruit de pas pendant la marche');
  await setInput('walk', false);

  // 6. réserve de voix : 240 sons variés d'un coup ne dépassent jamais la capacité, les plus proches restent
  await H(() => {
    const a = window.__audioHarness.fake.ctx.audio;
    const kinds = ['petard', 'impact_sol', 'tole', 'verre_brise', 'cri', 'sifflet', 'tambour', 'coup_baton', 'impact_bouclier', 'menottes', 'collision', 'rideau_fer'];
    for (let i = 0; i < 240; i++) {
      const d = 2 + (i % 20) * 1.2;
      a.play(kinds[i % kinds.length], { x: Math.sin(i * 2.4) * d, z: Math.cos(i * 2.4) * d, pitch: 0.8 + (i % 7) * 0.06 });
    }
  });
  const st = await stats();
  rt.push(`240 sons d'un coup : ${st.real} voix réelles (capacité ${st.capacity}), ${st.dropped} sons écartés au total`);
  if (st.real > st.capacity) rtFail(`réserve dépassée : ${st.real} voix réelles pour ${st.capacity}`);
  if (st.real < st.capacity - 2) rtFail(`réserve sous-employée sous la salve : ${st.real} voix réelles pour ${st.capacity}`);
  vs = await voices();
  if (!vs.some((v) => v.includes('sirene_police') && v.startsWith('●'))) rtFail('la sirène (priorité haute) a été évincée par des sons ordinaires');
  const loud = await peakLevel(600);
  if (loud > 1) rtFail(`saturation en sortie malgré le limiteur (${loud})`);
  rt.push(`niveau maximal en sortie sous la salve : ${loud.toFixed(3)}`);
  await sleep(2600);

  // 7. voix : message radio et sommation (habillage ; la parole dépend des voix du navigateur)
  await page.click('#radio');
  await sleep(400);
  const sp1 = await H(() => window.__audioHarness.debug.speech());
  vs = await voices();
  rt.push(`radio : synthèse ${sp1.supported ? 'présente' : 'absente'}, ${sp1.frenchVoices} voix française(s) ; ${vs.filter((v) => /radio/.test(v)).join(' ; ')}`);
  if (!sp1.speaking) rtFail("le message radio n'est pas pris en charge par la file de voix");
  if (!vs.some((v) => /radio_(bip|souffle)/.test(v))) rtFail("pas d'habillage radio (bip ou souffle)");
  await page.click('#sommation');
  await sleep(3500);
  vs = await voices();
  rt.push('sommation : ' + (vs.filter((v) => /megaphone/.test(v)).join(' ; ') || '(aucune voix de mégaphone)'));
  if (!vs.some((v) => /megaphone/.test(v))) rtFail('la sommation ne produit aucun son de mégaphone');

  // 8. page masquée : le contexte est suspendu, puis reprend
  const setHidden = (hidden) => H((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await sleep(500);
  const hiddenState = (await stats()).state;
  await setHidden(false);
  await sleep(500);
  const shownState = (await stats()).state;
  rt.push(`page masquée : ${hiddenState} ; page visible : ${shownState}`);
  if (hiddenState !== 'suspended') rtFail(`contexte non suspendu quand la page est masquée (« ${hiddenState} »)`);
  if (shownState !== 'running') rtFail(`contexte non repris quand la page redevient visible (« ${shownState} »)`);

  // 9. volumes : couper le volume général éteint la sortie
  await page.click('button[data-loop="sirene_pompiers"]');
  await sleep(500);
  const on = await peakLevel(400);
  await H(() => window.__audioHarness.fake.ctx.settings.set('volumeMaster', 0));
  await sleep(500);
  const off = await peakLevel(400);
  await H(() => window.__audioHarness.fake.ctx.settings.set('volumeMaster', 0.8));
  rt.push(`volume général : niveau ${on.toFixed(3)} → ${off.toFixed(4)} une fois coupé`);
  if (!(on > 0.01 && off < on * 0.05)) rtFail(`le volume général n'agit pas (${on} → ${off})`);

  files.push(path.join(OUT, 'audio-banc.png'));
  await page.screenshot({ path: files[files.length - 1], fullPage: true });
  console.log('\nTemps réel :');
  for (const l of rt) console.log('  ' + l);
}

writeFileSync(path.join(OUT, 'audio-report.json'), JSON.stringify({ rows, failures, realtime: rt }, null, 2));
for (const f of files) console.log('planche :', f);
if (failures.length) {
  console.error(`\n${failures.length} contrôle(s) en échec :`);
  for (const f of failures) console.error('  ✗ ' + f);
} else {
  console.log(`\nTous les contrôles passent (${rows.length} sons rendus hors ligne${only ? '' : ' + banc temps réel'}).`);
}
await finish({ browser, server, errors, ok: failures.length === 0, label: 'audio' });
