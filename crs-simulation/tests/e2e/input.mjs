// Test de bout en bout du module des entrées (banc d'essai harness/input.html).
//   1. Clavier : touches physiques, diagonales, doubles emplois, fronts vus exactement une fois
//      (par les pas de simulation ET par les images, pour plusieurs cadences), perte de focus.
//   2. Souris : capture (pointer lock) si le navigateur headless l'accorde, molette, boutons,
//      écran modal ; puis repli « glisser pour regarder » avec une capture refusée.
//   3. Manette : navigator.getGamepads remplacé dans la page — zones mortes, gâchettes analogiques,
//      boutons, regard, vibration, débranchement et rebranchement à chaud, libellés.
//   4. Réaffectation : capture d'une touche, persistance après rechargement, réinitialisation.
//   5. Tactile (émulation mobile, doigts simulés par le protocole de débogage) : joystick, regard et
//      bouton tenus en même temps, bascule « Viser », libellé contextuel, barre d'objets, dispositions
//      véhicule et drone, écran modal, portrait, bascule de périphérique.
//   6. Captures de la surcouche en 844×390 et 1180×820 dans tests/e2e/out/input-*.png.
// Usage : node tests/e2e/input.mjs
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const server = await startServer();
const failures = [];
let passed = 0;
const info = [];
const check = (cond, msg) => {
  if (cond) passed++;
  else failures.push(msg);
};
const near = (a, b, eps, msg) => check(typeof a === 'number' && Math.abs(a - b) <= eps, `${msg} (obtenu ${a}, attendu ${b} ± ${eps})`);
const snap = (page) => page.evaluate(() => window.__inputTest.snapshot());
const frames = async (page, n = 4) => {
  const f0 = await page.evaluate(() => window.__inputTest.frames);
  await page.waitForFunction((t) => window.__inputTest.frames >= t, f0 + n, { timeout: 30000, polling: 16 });
};
const resetCounts = (page) => page.evaluate(() => window.__inputTest.resetCounts());
const count = (s, kind, b) => s.counts[kind][b] ?? 0;
const once = (s, b, msg) => check(
  count(s, 'simPressed', b) === 1 && count(s, 'simReleased', b) === 1 && count(s, 'framePressed', b) === 1 && count(s, 'frameReleased', b) === 1,
  `${msg} : « ${b} » vu sim ${count(s, 'simPressed', b)}/${count(s, 'simReleased', b)}, image ${count(s, 'framePressed', b)}/${count(s, 'frameReleased', b)} (attendu 1/1 et 1/1)`,
);
const allErrors = [];

// ══════════════════════════════════ 1. CLAVIER ══════════════════════════════════
const desk = await openPage(server.url + 'harness/input.html');
const page = desk.page;
allErrors.push(desk.errors);
await waitFor(page, 'window.__ready === true');
await frames(page, 6);
let s = await snap(page);
check(s.device === 'kbm', `périphérique initial sur ordinateur : ${s.device}`);
check(s.visible === false, 'surcouche tactile masquée sur ordinateur');
check(s.down.length === 0 && s.moveX === 0 && s.moveY === 0, 'état initial neutre');
await shot(page, 'input-banc-ordinateur');

await page.keyboard.down('KeyW');
await frames(page);
s = await snap(page);
near(s.moveY, 1, 1e-9, 'KeyW (Z sur AZERTY) : avancer');
near(s.moveX, 0, 1e-9, 'KeyW : pas de latéral');
near(s.throttle, 1, 1e-9, 'KeyW : accélérateur dérivé');
await page.keyboard.down('KeyD');
await frames(page);
s = await snap(page);
near(s.moveX, Math.SQRT1_2, 1e-6, 'KeyW + KeyD : diagonale normalisée (x)');
near(s.moveY, Math.SQRT1_2, 1e-6, 'KeyW + KeyD : diagonale normalisée (y)');
await page.keyboard.up('KeyW');
await frames(page);
s = await snap(page);
near(s.moveX, 1, 1e-9, 'KeyD : droite');
near(s.moveY, 0, 1e-9, 'KeyD seul : plus d\'avance');
await page.keyboard.up('KeyD');
await page.keyboard.down('KeyS');
await page.keyboard.down('KeyA');
await frames(page);
s = await snap(page);
check(s.moveX < -0.7 && s.moveY < -0.7, `KeyS + KeyA : arrière gauche (${s.moveX}, ${s.moveY})`);
near(s.brake, 1, 1e-9, 'KeyS : frein dérivé');
await page.keyboard.up('KeyS');
await page.keyboard.up('KeyA');
await frames(page);
s = await snap(page);
check(s.moveX === 0 && s.moveY === 0 && s.throttle === 0 && s.brake === 0, 'tout relâché : axes à zéro');
// le déplacement a bien été appliqué par le « contrôleur » du banc
check(Math.hypot(s.x, s.z) > 0.05, 'le personnage d\'essai s\'est déplacé');

// La souris a pu être capturée par la reprise au clavier : on la rend pour la suite du clavier.
await page.evaluate(() => window.__inputTest.pointer.release());
await frames(page, 3);

// Doubles emplois par contexte et touches du tableau
const combos = [
  ['Space', ['jump', 'handbrake']], ['KeyR', ['reload', 'siren']], ['KeyE', ['interact']], ['ShiftLeft', ['sprint']],
  ['KeyC', ['crouch']], ['Digit3', ['slot3']], ['KeyT', ['radio']], ['KeyF', ['orders']], ['KeyM', ['map']],
  ['Tab', ['tactical']], ['KeyV', ['camera']], ['KeyG', ['mask']], ['KeyH', ['visor']], ['KeyB', ['beacons']],
  ['KeyN', ['horn']], ['Period', ['fast_forward']], ['Enter', ['ui_accept']],
  ['ArrowUp', ['ui_up']], ['KeyL', ['flashlight', 'headlights']],
];
for (const [key, buttons] of combos) {
  await page.keyboard.down(key);
  await frames(page, 3);
  s = await snap(page);
  for (const b of buttons) check(s.down.includes(b), `${key} enfoncée → ${b} (enfoncés : ${s.down.join(', ')})`);
  await page.keyboard.up(key);
  await frames(page, 3);
  s = await snap(page);
  for (const b of buttons) check(!s.down.includes(b), `${key} relâchée → ${b} relâché`);
  await page.evaluate(() => window.__inputTest.pointer.release());
}
check(await page.evaluate(() => document.activeElement === document.body), 'Tab ne déplace pas le focus pendant le jeu');
await page.keyboard.down('Escape');
await frames(page, 3);
s = await snap(page);
check(s.down.includes('pause') && s.down.includes('ui_back'), `Échap → pause + ui_back (${s.down.join(', ')})`);
await page.keyboard.up('Escape');
await frames(page, 3);

// Fronts : exactement une fois, quelle que soit la cadence des pas de simulation
for (const pattern of [[1], [3], [0, 0, 1], [2, 0, 0, 0]]) {
  await page.evaluate((p) => window.__inputTest.setSteps(p), pattern);
  await frames(page, 6);
  await resetCounts(page);
  await page.keyboard.press('KeyE');            // enfoncée et relâchée d'un trait (souvent dans la même image)
  await frames(page, 14);
  s = await snap(page);
  once(s, 'interact', `appui bref, ${JSON.stringify(pattern)} pas par image`);
  await resetCounts(page);
  await page.keyboard.down('ShiftLeft');
  await frames(page, 9);
  s = await snap(page);
  check(s.down.includes('sprint'), `appui maintenu visible (${JSON.stringify(pattern)})`);
  await page.keyboard.up('ShiftLeft');
  await frames(page, 14);
  s = await snap(page);
  once(s, 'sprint', `appui maintenu, ${JSON.stringify(pattern)} pas par image`);
  await page.evaluate(() => window.__inputTest.pointer.release());
}
await page.evaluate(() => window.__inputTest.setSteps([1]));

// Champ de saisie : taper n'actionne pas le jeu
await page.evaluate(() => {
  const i = document.createElement('input');
  i.id = 'saisie';
  i.style.cssText = 'position:absolute;right:8px;top:8px;z-index:99';
  document.body.appendChild(i);
  i.focus();
});
await page.keyboard.down('KeyW');
await frames(page, 3);
s = await snap(page);
check(s.moveY === 0, 'frappe dans un champ de saisie : aucune commande de jeu');
check(await page.evaluate(() => document.getElementById('saisie').value === 'w'), 'le champ de saisie reçoit bien le caractère');
await page.keyboard.up('KeyW');
await page.evaluate(() => document.getElementById('saisie').remove());

// Perte de focus : tout est relâché, la pause est demandée une fois
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await frames(page, 3);
await page.evaluate(() => window.__inputTest.pointer.release());
await frames(page, 3);
await resetCounts(page);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await frames(page, 6);
s = await snap(page);
check(s.moveY === 0 && !s.down.includes('sprint'), `perte de focus : touches relâchées (moveY ${s.moveY}, ${s.down.join(', ')})`);
check(count(s, 'simPressed', 'pause') === 1 && count(s, 'framePressed', 'pause') === 1, `perte de focus : une demande de pause (sim ${count(s, 'simPressed', 'pause')}, image ${count(s, 'framePressed', 'pause')})`);
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await frames(page, 3);

// ══════════════════════════════════ 2. SOURIS ══════════════════════════════════
await page.evaluate(() => {
  window.__inputTest.showPanel(false);
  window.__inputTest.pointer.release();
});
await page.waitForTimeout(1100);                 // au-delà du délai entre deux pauses automatiques
await frames(page, 3);
await resetCounts(page);
await page.mouse.move(700, 300);
await page.mouse.click(700, 300);
await frames(page, 8);
s = await snap(page);
const lockWorks = s.pointerLocked === true;
info.push(`capture de la souris dans Chromium headless : ${lockWorks ? 'accordée' : 'refusée (repli testé à la place)'}`);
if (lockWorks) {
  check(count(s, 'simPressed', 'primary') === 0, 'le clic qui capture la souris ne déclenche pas l\'action principale');
  // (l'événement d'erreur de la demande « mouvement brut » refusée arrive après l'accord de la demande simple)
  check(!s.notices.some((n) => n.includes('ne peut pas être capturée')) && s.fallback === false, 'capture accordée : aucun message « la souris ne peut pas être capturée »');
  await resetCounts(page);
  // Sous capture, les déplacements injectés par le protocole de débogage s'annulent deux à deux
  // (le navigateur headless recentre le curseur : +dx puis -dx). On envoie donc à la page des
  // événements « mousemove » portant movementX / movementY, comme le fait un vrai pointeur capturé.
  const yawBefore = (await snap(page)).yaw;
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: 10, movementY: i < 4 ? -5 : 0, bubbles: true }));
  });
  await frames(page, 6);
  s = await snap(page);
  near(s.sums.simLookX, 60 * 0.0022, 1e-6, 'souris capturée : 60 px vers la droite (vue simulation)');
  near(s.sums.frameLookX, 60 * 0.0022, 1e-6, 'souris capturée : 60 px vers la droite (vue image)');
  near(s.sums.simLookY, 20 * 0.0022, 1e-6, 'souris capturée : 20 px vers le haut = lever le regard');
  near(s.yaw - yawBefore, -60 * 0.0022, 1e-6, 'le cap du personnage d\'essai a tourné d\'autant (droite = cap décroissant)');
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await frames(page);
  s = await snap(page);
  check(s.down.includes('primary') && s.down.includes('secondary'), `clic gauche + clic droit tenus ensemble (${s.down.join(', ')})`);
  await page.mouse.up({ button: 'right' });
  await frames(page);
  s = await snap(page);
  check(s.down.includes('primary') && !s.down.includes('secondary'), 'clic droit relâché, gauche toujours tenu');
  await page.mouse.up();
  await frames(page);
  // molette
  await resetCounts(page);
  await page.mouse.wheel(0, 100);
  await frames(page, 8);
  s = await snap(page);
  once(s, 'item_next', 'molette vers le bas');
  near(s.sums.simWheel, 1, 1e-6, 'molette : un cran (vue simulation)');
  near(s.sums.frameWheel, 1, 1e-6, 'molette : un cran (vue image)');
  await resetCounts(page);
  await page.mouse.wheel(0, -100);
  await frames(page, 8);
  s = await snap(page);
  once(s, 'item_prev', 'molette vers le haut');
  // écran modal : la souris est rendue, sans demande de pause
  await resetCounts(page);
  await page.evaluate(() => window.__inputTest.setModal(true));
  await frames(page, 8);
  s = await snap(page);
  check(s.pointerLocked === false, 'écran modal : souris rendue');
  check(count(s, 'framePressed', 'pause') === 0, 'écran modal : pas de pause fabriquée');
  await page.mouse.click(700, 300);
  await frames(page, 6);
  s = await snap(page);
  check(s.pointerLocked === false, 'écran modal : un clic ne recapture pas la souris');
  await page.evaluate(() => window.__inputTest.setModal(false));
  await frames(page, 3);
  // pause de la session : la souris est rendue aussi
  await page.mouse.click(700, 300);
  await frames(page, 8);
  s = await snap(page);
  check(s.pointerLocked === true, 'après fermeture du modal : le clic recapture la souris');
  await page.evaluate(() => window.__inputTest.ctx.session.pause(true));
  await frames(page, 8);
  s = await snap(page);
  check(s.pointerLocked === false, 'pause : souris rendue');
  await page.evaluate(() => window.__inputTest.ctx.session.pause(false));
  await frames(page, 3);
  // (le navigateur refuse les captures trop rapprochées — voir plus bas : on laisse passer son délai)
  await page.waitForTimeout(2100);
  // capture perdue sans que le jeu l'ait demandé (Échap du navigateur) : pause demandée une fois
  await page.mouse.click(700, 300);
  await frames(page, 8);
  await page.waitForTimeout(1100);
  s = await snap(page);
  check(s.pointerLocked === true, 'après la pause : le clic recapture la souris');
  await resetCounts(page);
  await page.evaluate(() => document.exitPointerLock());
  await frames(page, 10);
  s = await snap(page);
  check(s.pointerLocked === false, 'capture rendue par le navigateur');
  check(count(s, 'simPressed', 'pause') === 1 && count(s, 'framePressed', 'pause') === 1, `capture perdue : une demande de pause (sim ${count(s, 'simPressed', 'pause')}, image ${count(s, 'framePressed', 'pause')})`);
  // Captures trop rapprochées (carte, roue d'ordres, pause ouvertes et refermées coup sur coup) : Chromium refuse un
  // instant (« Too many pointer lock requests in a short window of time »). Ce n'est pas une capture impossible :
  // aucun message, la vue reste pilotable, et la capture revient seule quand le délai du navigateur est passé.
  await page.evaluate(() => window.__inputTest.ctx.session.pause(false));
  await page.waitForTimeout(2100);
  const told = (q) => q.notices.filter((n) => n.includes('ne peut pas être capturée')).length;
  const toldBefore = told(await snap(page));
  let throttled = false;
  let granted = 0;
  for (let i = 0; i < 9 && !throttled; i++) {
    await page.mouse.click(700, 300);
    await frames(page, 3);
    s = await snap(page);
    if (s.pointerLocked) {
      granted++;
      await page.evaluate(() => window.__inputTest.pointer.release());
      await frames(page, 3);
    } else {
      throttled = true;
    }
  }
  info.push(`captures en rafale : ${granted} accordée(s), puis ${throttled ? 'refus passager du navigateur' : 'aucun refus (limite non atteinte)'}`);
  if (throttled) {
    check(s.fallback === true, 'refus passager : la vue reste pilotable en attendant (glisser, flèches)');
    check(told(s) === toldBefore, `refus passager : pas de message « la souris ne peut pas être capturée » (${toldBefore} avant, ${told(s)} après)`);
    await page.waitForTimeout(2500);
    await frames(page, 6);
    s = await snap(page);
    check(s.pointerLocked === true && s.fallback === false, `refus passager : la capture revient seule, sans clic (capturée ${s.pointerLocked}, repli ${s.fallback})`);
  }
} else {
  check(s.fallback === true, 'capture refusée : repli « glisser pour regarder » actif');
}

// ══════════════════════════════════ 3. MANETTE ══════════════════════════════════
await page.evaluate(() => window.__inputTest.pointer.release());
await page.waitForTimeout(1100);
await page.evaluate(() => {
  const pad = {
    id: 'Manette d\'essai (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: {
      playEffect(type, p) {
        window.__rumbles.push({ type, ...p });
        return Promise.resolve('complete');
      },
    },
  };
  window.__rumbles = [];
  window.__pad = pad;
  window.__pads = [pad, null, null, null];
  window.__press = (i, v = 1) => {
    pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v };
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pads, configurable: true });
  window.dispatchEvent(new Event('gamepadconnected'));
});
await frames(page, 6);
s = await snap(page);
check(s.notices.includes('Manette connectée.'), 'branchement à chaud annoncé');
check(s.device === 'kbm', 'manette branchée mais pas encore utilisée : le clavier reste actif');
check(s.padStyle === 'lettres' && s.padName.length > 0, `manette reconnue (${s.padName}, ${s.padStyle})`);
await page.evaluate(() => {
  window.__pad.axes[0] = 0.1;                    // dérive : sous la zone morte
  window.__pad.axes[1] = -0.08;
});
await frames(page);
s = await snap(page);
check(s.moveX === 0 && s.moveY === 0 && s.device === 'kbm', `dérive du stick ignorée (${s.moveX}, ${s.moveY}, ${s.device})`);
await page.evaluate(() => {
  window.__pad.axes[0] = 0;
  window.__pad.axes[1] = -1;
});
await frames(page);
s = await snap(page);
near(s.moveY, 1, 1e-6, 'stick gauche vers le haut : avancer');
check(s.device === 'gamepad', `périphérique actif après usage de la manette : ${s.device}`);
await page.evaluate(() => {
  window.__pad.axes[0] = 0.55;                   // mi-course à droite
  window.__pad.axes[1] = 0;
});
await frames(page);
s = await snap(page);
check(s.moveX > 0.35 && s.moveX < 0.6, `stick à mi-course : réponse progressive (${s.moveX})`);
await page.evaluate(() => {
  window.__pad.axes[0] = 0;
  window.__press(7, 0.5);
  window.__press(6, 1);
});
await frames(page);
s = await snap(page);
near(s.throttle, (0.5 - 0.06) / 0.88, 1e-3, 'gâchette droite à mi-course : accélérateur analogique');
near(s.brake, 1, 1e-9, 'gâchette gauche à fond : frein');
check(s.down.includes('primary') && s.down.includes('secondary'), 'gâchettes = action principale et secondaire');
await page.evaluate(() => {
  window.__press(7, 0);
  window.__press(6, 0);
});
const padButtons = [[0, ['jump', 'handbrake', 'ui_accept']], [1, ['crouch', 'ui_back']], [2, ['interact']], [4, ['item_prev']], [5, ['item_next']],
  [8, ['map']], [9, ['pause']], [10, ['sprint']], [11, ['camera']], [12, ['radio']], [13, ['mask']], [14, ['visor']], [15, ['orders']]];
for (const [index, buttons] of padButtons) {
  await page.evaluate((i) => window.__press(i), index);
  await frames(page, 3);
  s = await snap(page);
  for (const b of buttons) check(s.down.includes(b), `manette B${index} → ${b} (${s.down.join(', ')})`);
  await page.evaluate((i) => window.__press(i, 0), index);
  await frames(page, 3);
}
await page.evaluate(() => window.__inputTest.setSteps([3]));
await frames(page, 4);
await resetCounts(page);
await page.evaluate(() => window.__press(2));
await frames(page, 6);
await page.evaluate(() => window.__press(2, 0));
await frames(page, 8);
s = await snap(page);
once(s, 'interact', 'bouton de manette, 3 pas par image');
await page.evaluate(() => window.__inputTest.setSteps([1]));
// stick droit : rotation proportionnelle au temps
await frames(page, 3);
await resetCounts(page);
const tLook = Date.now();
await page.evaluate(() => {
  window.__pad.axes[2] = 1;
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  window.__pad.axes[2] = 0;
});
const heldSeconds = (Date.now() - tLook) / 1000;
await frames(page, 4);
s = await snap(page);
check(s.sums.simLookX > 3.3 * 0.4 && s.sums.simLookX < 3.3 * (heldSeconds + 0.15), `stick droit à fond ~${heldSeconds.toFixed(2)} s : ${s.sums.simLookX.toFixed(2)} rad (3,3 rad/s attendus)`);
near(s.sums.frameLookX, s.sums.simLookX, 0.12, 'stick droit : même rotation vue par les pas et par les images');
// libellés et vibration
const padLabels = await page.evaluate(() => {
  const l = window.__inputTest.labels;
  return [l.labelFor('interact'), l.labelFor('primary'), l.labelFor('jump'), l.moveLabel(), l.labelFor('interact', 'kbm'), l.labelFor('interact', 'touch')];
});
check(padLabels.join('|') === 'X|RT|A|Stick gauche|E|Interagir', `libellés manette / clavier / tactile : ${padLabels.join('|')}`);
await page.evaluate(() => window.__inputTest.input.rumble(0.7, 0.2));
const rumbles = await page.evaluate(() => window.__rumbles);
check(rumbles.length === 1 && rumbles[0].type === 'dual-rumble' && rumbles[0].duration === 200 && Math.abs(rumbles[0].weakMagnitude - 0.7) < 1e-9, `vibration envoyée à la manette (${JSON.stringify(rumbles)})`);
// réaffectation d'un bouton de manette par capture
await page.evaluate(() => {
  window.__cap = 'rien';
  window.__inputTest.bindings.capture('gamepad', (c) => {
    window.__cap = c;
  });
  window.__press(3);
});
await frames(page, 4);
check(await page.evaluate(() => window.__cap) === 'B3', 'capture d\'un bouton de manette pour la réaffectation');
await page.evaluate(() => window.__press(3, 0));
await frames(page, 3);
// débranchement à chaud
await page.evaluate(() => window.__press(2));
await frames(page, 3);
await resetCounts(page);
await page.evaluate(() => {
  window.__pads = [null, null, null, null];
  window.dispatchEvent(new Event('gamepaddisconnected'));
});
await frames(page, 8);
s = await snap(page);
check(!s.down.includes('interact'), 'manette débranchée : boutons relâchés');
check(s.device === 'kbm', `manette débranchée : repli sur ${s.device}`);
check(s.notices.includes('Manette débranchée.'), 'débranchement annoncé');
check(count(s, 'framePressed', 'pause') === 1, `manette active débranchée : pause demandée une fois (${count(s, 'framePressed', 'pause')})`);
// rebranchement SANS événement : retrouvée par la recherche périodique
await page.evaluate(() => {
  window.__press(2, 0);
  window.__pads = [window.__pad, null, null, null];
});
await page.waitForTimeout(1300);
await page.evaluate(() => window.__press(0));
await frames(page, 4);
s = await snap(page);
check(s.down.includes('jump') && s.device === 'gamepad', `rebranchement à chaud : ${s.down.join(', ')} / ${s.device}`);
await page.evaluate(() => {
  window.__press(0, 0);
  window.__pads = [null, null, null, null];
});
await page.waitForTimeout(1200);
await frames(page, 3);

// ══════════════════════════════════ 4. RÉAFFECTATION DU CLAVIER ══════════════════════════════════
await page.evaluate(() => {
  window.__cap = 'rien';
  window.__inputTest.bindings.capture('kbm', (c) => {
    window.__cap = c;
  });
});
await resetCounts(page);
await page.keyboard.press('KeyK');
await frames(page, 6);
check(await page.evaluate(() => window.__cap) === 'KeyK', 'capture d\'une touche pour la réaffectation');
const lost = await page.evaluate(() => window.__inputTest.bindings.set('kbm', 'interact', 0, 'KeyK'));
check(Array.isArray(lost) && lost.length === 0, 'réaffectation acceptée');
await resetCounts(page);
await page.keyboard.press('KeyK');
await frames(page, 8);
s = await snap(page);
once(s, 'interact', 'nouvelle touche K');
await resetCounts(page);
await page.keyboard.press('KeyE');
await frames(page, 8);
s = await snap(page);
check(count(s, 'simPressed', 'interact') === 0, 'l\'ancienne touche E n\'agit plus');
check(JSON.stringify(s.saved) === JSON.stringify({ v: 1, kbm: { interact: ['KeyK'] }, gamepad: {} }), `section « bindings » enregistrée : ${JSON.stringify(s.saved)}`);
check(await page.evaluate(() => window.__inputTest.labels.labelFor('interact', 'kbm')) === 'K', 'le libellé suit la réaffectation');

// rechargement : affectation relue ; langue française et pas de carte de clavier → AZERTY supposé
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr'] });
  Object.defineProperty(navigator, 'keyboard', { get: () => undefined });
  // capture de la souris refusée, comme dans une iframe sans permission
  Element.prototype.requestPointerLock = function () {
    return Promise.reject(new DOMException('refusé pour le test', 'SecurityError'));
  };
});
await page.reload({ waitUntil: 'load' });
await waitFor(page, 'window.__ready === true');
await frames(page, 6);
s = await snap(page);
check(s.keyboardLayout === 'azerty', `navigateur en français : clavier supposé ${s.keyboardLayout}`);
const frLabels = await page.evaluate(() => {
  const l = window.__inputTest.labels;
  return [l.moveLabel(), l.labelFor('interact'), l.codeLabel('kbm', 'KeyQ'), l.labelFor('pause'), l.labelFor('sprint')];
});
check(frLabels.join('|') === 'ZQSD|K|A|Échap|Maj', `libellés AZERTY : ${frLabels.join('|')}`);
await resetCounts(page);
await page.keyboard.press('KeyK');
await frames(page, 8);
s = await snap(page);
once(s, 'interact', 'affectation relue après rechargement');
await page.evaluate(() => window.__inputTest.bindings.reset());
await resetCounts(page);
await page.keyboard.press('KeyE');
await frames(page, 8);
s = await snap(page);
once(s, 'interact', 'réinitialisation : E de nouveau');
check(s.saved === null, 'réinitialisation : section « bindings » effacée');
// le clavier du test est en fait QWERTY : la frappe de la touche physique KeyW l'apprend au module
await page.keyboard.press('KeyW');
await frames(page, 3);
s = await snap(page);
check(s.keyboardLayout === 'qwerty', `disposition apprise à la frappe : ${s.keyboardLayout}`);
check(await page.evaluate(() => window.__inputTest.labels.moveLabel()) === 'WASD', 'libellé de déplacement corrigé après apprentissage');

// ── repli « glisser pour regarder » (capture refusée) ──
await page.evaluate(() => window.__inputTest.showPanel(false));
await page.mouse.move(700, 300);
await page.mouse.click(700, 300);
await frames(page, 8);
s = await snap(page);
check(s.pointerLocked === false && s.fallback === true, `capture refusée → repli (capturée ${s.pointerLocked}, repli ${s.fallback})`);
check(s.notices.some((n) => n.includes('ne peut pas être capturée')), 'le joueur est prévenu du repli');
await resetCounts(page);
await page.mouse.move(640, 320);
await page.mouse.down();
await frames(page);
s = await snap(page);
check(s.down.includes('primary'), 'repli : le bouton gauche agit');
await page.mouse.move(740, 280, { steps: 8 });
await frames(page, 6);
s = await snap(page);
near(s.sums.simLookX, 100 * 0.0022, 0.004, 'repli : glisser de 100 px à droite');
near(s.sums.simLookY, 40 * 0.0022, 0.004, 'repli : glisser de 40 px vers le haut = lever le regard');
near(s.sums.frameLookX, s.sums.simLookX, 1e-9, 'repli : même rotation pour les pas et pour les images');
await page.mouse.up();
await frames(page);
s = await snap(page);
check(!s.down.includes('primary'), 'repli : bouton relâché');
await resetCounts(page);
await page.mouse.move(600, 340, { steps: 6 });
await frames(page, 6);
s = await snap(page);
check(s.sums.simLookX === 0 && s.sums.simLookY === 0, 'repli : sans bouton tenu, la souris ne fait pas tourner la vue');
// sensibilité et inversion
await page.evaluate(() => {
  window.__inputTest.controls.settings.mouseSensitivity = 2;
  window.__inputTest.controls.settings.invertY = true;
});
await page.mouse.down({ button: 'right' });
await frames(page);
s = await snap(page);
check(s.down.includes('secondary'), 'repli : le bouton droit agit (et pas de menu contextuel)');
await page.mouse.move(650, 320, { steps: 5 });
await frames(page, 6);
s = await snap(page);
near(s.sums.simLookX, 50 * 0.0022 * 2, 0.004, 'sensibilité ×2');
near(s.sums.simLookY, -20 * 0.0022 * 2, 0.004, 'inversion de l\'axe vertical');
await page.mouse.up({ button: 'right' });
await page.evaluate(() => {
  window.__inputTest.controls.settings.mouseSensitivity = 1;
  window.__inputTest.controls.settings.invertY = false;
});
// flèches du clavier : regarder sans souris
await resetCounts(page);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(300);
await page.keyboard.up('ArrowRight');
await frames(page, 4);
s = await snap(page);
check(s.sums.simLookX > 0.3 && s.sums.simLookX < 1.2, `flèche droite ~0,3 s : ${s.sums.simLookX.toFixed(2)} rad`);

// coût du module
const bench = await page.evaluate(() => window.__inputTest.bench(20000));
info.push(`coût CPU (ordinateur, boucle serrée) : update ${bench.updateUs.toFixed(2)} µs, frame ${bench.frameUs.toFixed(2)} µs, lecture d'un bouton ${bench.readNs.toFixed(1)} ns`);
check(bench.updateUs < 60 && bench.frameUs < 60, `coût par appel raisonnable (update ${bench.updateUs.toFixed(1)} µs, frame ${bench.frameUs.toFixed(1)} µs)`);
await desk.browser.close();

// ══════════════════════════════════ 5. TACTILE ══════════════════════════════════
const mob = await openPage(server.url + 'harness/input.html?clean=1', { width: 844, height: 390, mobile: true, deviceScaleFactor: 2 });
const mp = mob.page;
allErrors.push(mob.errors);
await waitFor(mp, 'window.__ready === true');
await frames(mp, 8);
const cdp = await mp.context().newCDPSession(mp);
const fingers = new Map();
const points = () => [...fingers].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id, radiusX: 9, radiusY: 9, force: 1 }));
const fingerDown = async (id, x, y) => {
  fingers.set(id, { x, y });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points() });
};
const fingerMove = async (id, x, y, steps = 5) => {
  const from = fingers.get(id);
  for (let i = 1; i <= steps; i++) {
    fingers.set(id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points() });
  }
};
// Avec ce Chromium, touchEnd relâche les points qu'on lui LISTE (et tous si la liste est vide).
const fingerUp = async (id) => {
  const p = fingers.get(id);
  fingers.delete(id);
  const released = fingers.size > 0 && p ? [{ x: Math.round(p.x), y: Math.round(p.y), id, radiusX: 9, radiusY: 9, force: 1 }] : [];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: released });
};
const tap = async (x, y, id = 9) => {
  await fingerDown(id, x, y);
  await fingerUp(id);
};
const centerOf = async (key) => {
  const r = await mp.evaluate((k) => window.__inputTest.rect(k), key);
  if (!r) {
    failures.push(`commande tactile « ${key} » introuvable dans la disposition courante`);
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, top: r.y, left: r.x };
};
/** Vérifie dans le DOM réel que rien ne se chevauche ni ne dépasse de l'écran. */
const layoutProblems = (label) => mp.evaluate((name) => {
  const out = [];
  const els = [...document.querySelectorAll('.crs-touch .ct-c, .crs-touch .ct-item, .crs-touch .ct-stick')]
    .filter((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0);
  const rects = els.map((e) => ({ r: e.getBoundingClientRect(), n: e.className.replace(/\s+/g, '.') }));
  const W = innerWidth;
  const H = innerHeight;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    if (a.r.left < -0.5 || a.r.top < -0.5 || a.r.right > W + 0.5 || a.r.bottom > H + 0.5) out.push(`${name} : ${a.n} sort de l'écran`);
    if (!a.n.includes('ct-stick') && Math.min(a.r.width, a.r.height) < 34) out.push(`${name} : ${a.n} trop petit (${a.r.width.toFixed(0)}×${a.r.height.toFixed(0)})`);
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) out.push(`${name} : ${a.n} chevauche ${b.n}`);
    }
    // le texte ne doit pas déborder de son bouton
    const t = els[i].querySelector('.ct-t');
    if (t && !els[i].classList.contains('ct-pill')) {
      const tr = t.getBoundingClientRect();
      if (tr.left < a.r.left - 0.5 || tr.right > a.r.right + 0.5) out.push(`${name} : le texte « ${t.textContent} » déborde de ${a.n}`);
    }
  }
  return { count: rects.length, problems: out };
}, label);
const checkLayout = async (label, minCount) => {
  const r = await layoutProblems(label);
  check(r.count >= minCount, `${label} : ${r.count} commandes visibles (au moins ${minCount} attendues)`);
  for (const p of r.problems) failures.push(p);
  if (r.problems.length === 0) passed++;
};

s = await snap(mp);
check(s.device === 'touch', `périphérique initial sur téléphone : ${s.device}`);
check(s.visible === true && s.layout === 'pied', `surcouche visible, disposition ${s.layout}`);
await checkLayout('pied 844×390', 20);
info.push('capture : ' + await shot(mp, 'input-touch-pied-844x390'));

// ── joystick, regard et bouton tenus en même temps (trois doigts) ──
const home = await mp.evaluate(() => window.__inputTest.stickHome());
await resetCounts(mp);
await fingerDown(1, home.x, home.y);
await fingerMove(1, home.x, home.y - home.radius * 0.5);
await frames(mp);
s = await snap(mp);
check(s.moveY > 0.3 && s.moveY < 0.6 && Math.abs(s.moveX) < 0.02, `joystick à mi-course : marche (${s.moveX.toFixed(2)}, ${s.moveY.toFixed(2)})`);
check(!s.down.includes('sprint'), 'joystick à mi-course : pas de course');
await fingerMove(1, home.x, home.y - home.radius * 1.25);
await frames(mp);
s = await snap(mp);
near(s.moveY, 1, 1e-6, 'joystick poussé à fond');
check(s.down.includes('sprint'), 'joystick poussé à fond : course');
await fingerDown(2, 520, 170);                    // deuxième doigt : zone de regard
await fingerMove(2, 620, 130, 8);
await frames(mp);
s = await snap(mp);
near(s.sums.simLookX, 100 * 0.0046, 0.01, 'glisser de 100 px à droite dans la zone de regard');
near(s.sums.simLookY, 40 * 0.0046 * 0.72, 0.01, 'glisser de 40 px vers le haut = lever le regard');
near(s.moveY, 1, 1e-6, 'le joystick tient pendant qu\'on regarde');
const action = await centerOf('primary');
await fingerDown(3, action.x, action.y);          // troisième doigt : Action
await frames(mp);
s = await snap(mp);
check(s.down.includes('primary') && s.down.includes('sprint') && s.moveY === 1, `trois doigts : courir, regarder, agir (${s.down.join(', ')})`);
const lookBefore = s.sums.simLookX;
await fingerMove(3, action.x - 60, action.y, 6);  // glisser depuis « Action » : viser en tirant
await frames(mp);
s = await snap(mp);
check(s.sums.simLookX < lookBefore - 0.15 && s.down.includes('primary'), `glisser depuis « Action » fait tourner la vue (${(s.sums.simLookX - lookBefore).toFixed(3)} rad)`);
await fingerUp(2);
await frames(mp);
s = await snap(mp);
check(s.moveY === 1 && s.down.includes('primary'), 'lever le doigt du regard ne lâche ni le joystick ni le bouton');
await fingerUp(1);
await frames(mp);
s = await snap(mp);
check(s.moveY === 0 && !s.down.includes('sprint') && s.down.includes('primary'), 'lever le doigt du joystick : arrêt, « Action » toujours tenu');
await fingerUp(3);
await frames(mp, 6);
s = await snap(mp);
check(!s.down.includes('primary'), '« Action » relâché');
once(s, 'primary', 'bouton tactile « Action »');
once(s, 'sprint', 'course au joystick');

// ── joystick flottant : il se centre sous le doigt ──
await fingerDown(1, 250, 250);
await frames(mp);
s = await snap(mp);
check(s.moveX === 0 && s.moveY === 0, 'joystick flottant : poser le doigt ailleurs dans la zone ne déplace pas');
await fingerMove(1, 250 + home.radius * 1.3, 250);
await frames(mp);
s = await snap(mp);
near(s.moveX, 1, 1e-6, 'joystick flottant : à droite toute');
await fingerUp(1);

// ── « Viser » à bascule ──
const aim = await centerOf('secondary');
await tap(aim.x, aim.y);
await frames(mp);
s = await snap(mp);
check(s.down.includes('secondary'), '« Viser » : un appui enfonce');
await tap(aim.x, aim.y);
await frames(mp);
s = await snap(mp);
check(!s.down.includes('secondary'), '« Viser » : l\'appui suivant relâche');

// ── boutons momentanés ──
for (const [key, button] of [['jump', 'jump'], ['crouch', 'crouch'], ['radio', 'radio'], ['orders', 'orders'], ['pause', 'pause'], ['map', 'map'],
  ['tactical', 'tactical'], ['camera', 'camera'], ['forward', 'fast_forward'], ['mask', 'mask'], ['visor', 'visor'], ['lamp', 'flashlight']]) {
  const c = await centerOf(key);
  await resetCounts(mp);
  await fingerDown(5, c.x, c.y);
  await frames(mp, 3);
  s = await snap(mp);
  check(s.down.includes(button), `bouton tactile ${key} → ${button}`);
  await fingerUp(5);
  await frames(mp, 5);
  s = await snap(mp);
  once(s, button, `bouton tactile ${key}`);
}

// ── bouton contextuel « Interagir » ──
const interactText = () => mp.evaluate(() => {
  const el = document.querySelector('.crs-touch .ct-k-interact');
  return { text: el.querySelector('.ct-t').textContent, ctx: el.classList.contains('is-ctx'), dim: el.classList.contains('is-dim') };
});
let it = await interactText();
check(it.text === 'Interagir' && it.dim && !it.ctx, `sans invite : « ${it.text} » discret`);
await mp.evaluate(() => {
  window.__inputTest.controls.prompt = 'Menotter';
});
await frames(mp);
it = await interactText();
check(it.text === 'Menotter' && it.ctx && !it.dim, `invite du joueur reprise automatiquement : « ${it.text} »`);
await mp.evaluate(() => window.__inputTest.touch.setInteractLabel('Monter dans le fourgon'));
await frames(mp);
it = await interactText();
check(it.text === 'Monter dans le fourgon', `libellé imposé par l'interface : « ${it.text} »`);
await checkLayout('pied avec long libellé contextuel', 20);
info.push('capture : ' + await shot(mp, 'input-touch-pied-contexte-844x390'));
const inter = await centerOf('interact');
await resetCounts(mp);
await tap(inter.x, inter.y);
await frames(mp, 6);
s = await snap(mp);
once(s, 'interact', 'bouton contextuel');
await mp.evaluate(() => {
  window.__inputTest.touch.setInteractLabel(null);
  window.__inputTest.controls.prompt = null;
});

// ── barre d'objets ──
const items = await mp.evaluate(() => [...document.querySelectorAll('.crs-touch .ct-item')].map((e) => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, active: e.classList.contains('is-active') };
}));
check(items.length === 9 && items[0].active, `barre d'objets remplie d'après l'inventaire (${items.length} cases)`);
await resetCounts(mp);
await tap(items[2].x, items[2].y);
await frames(mp, 6);
s = await snap(mp);
once(s, 'slot3', 'toucher la 3e case');
await mp.evaluate(() => {
  window.__inputTest.controls.active = 2;
});
await mp.waitForTimeout(350);
check(await mp.evaluate(() => document.querySelectorAll('.crs-touch .ct-item')[2].classList.contains('is-active')), 'la case de l\'objet en main est mise en avant');
await mp.evaluate(() => window.__inputTest.touch.setItemBar(['🛡', { icon: '◍', label: 'Grenade', count: 3 }], 1));
await frames(mp);
check(await mp.evaluate(() => document.querySelectorAll('.crs-touch .ct-item').length === 2 && document.querySelectorAll('.crs-touch .ct-item')[1].classList.contains('is-active')), 'setItemBar : liste imposée par l\'interface');
await mp.evaluate(() => window.__inputTest.touch.setItemBar(null));
await mp.waitForTimeout(350);
check(await mp.evaluate(() => document.querySelectorAll('.crs-touch .ct-item').length === 9), 'setItemBar(null) : retour au remplissage automatique');

// ── masquer un bouton ──
await mp.evaluate(() => window.__inputTest.touch.setButtonVisible('visor', false));
check(await mp.evaluate(() => window.__inputTest.rect('visor')) === null, 'setButtonVisible(false) masque le bouton');
await mp.evaluate(() => window.__inputTest.touch.setButtonVisible('visor', true));

// ── disposition véhicule ──
await mp.evaluate(() => {
  window.__inputTest.controls.inVehicle = true;
});
await frames(mp, 5);
s = await snap(mp);
check(s.layout === 'vehicule', `à bord : disposition ${s.layout}`);
await checkLayout('véhicule 844×390', 15);
const gas = await centerOf('gas');
await fingerDown(1, gas.x, gas.top + gas.h * 0.15);          // haut de la pédale : pleins gaz
await frames(mp);
s = await snap(mp);
near(s.throttle, 1, 1e-6, 'pédale d\'accélérateur en haut');
near(s.moveY, 1, 1e-6, 'accélérateur recopié sur moveY');
check(!s.down.includes('primary'), 'la pédale n\'appuie pas sur « action principale »');
await fingerMove(1, gas.x, gas.top + gas.h * 0.97);          // bas de la pédale : roulage au pas
await frames(mp);
s = await snap(mp);
check(s.throttle > 0.28 && s.throttle < 0.42, `pédale d'accélérateur en bas : filet de gaz (${s.throttle.toFixed(2)})`);
const vHome = await mp.evaluate(() => window.__inputTest.stickHome());
await fingerDown(2, vHome.x, vHome.y);                        // volant en même temps
await fingerMove(2, vHome.x + vHome.radius * 1.1, vHome.y - 40);
await frames(mp);
s = await snap(mp);
near(s.moveX, 1, 1e-6, 'volant à droite toute');
check(s.throttle > 0.28 && s.throttle < 0.42, 'le volant n\'affecte pas l\'accélérateur (axe vertical ignoré)');
info.push('capture : ' + await shot(mp, 'input-touch-vehicule-844x390'));
await fingerUp(1);
await fingerUp(2);
const brake = await centerOf('brake');
await fingerDown(1, brake.x, brake.top + brake.h * 0.2);
await frames(mp);
s = await snap(mp);
check(s.brake === 1 && s.moveY === -1 && s.throttle === 0, `pédale de frein (${s.brake}, moveY ${s.moveY})`);
await fingerUp(1);
const pressVehicleButton = async (key, button, label) => {
  const c = await centerOf(key);
  await resetCounts(mp);
  await fingerDown(5, c.x, c.y);
  await frames(mp, 3);
  s = await snap(mp);
  check(s.down.includes(button), `${label} : bouton ${key} → ${button}`);
  await fingerUp(5);
  await frames(mp, 5);
  s = await snap(mp);
  once(s, button, `${label} : bouton ${key}`);
};
for (const [key, button] of [['siren', 'siren'], ['beacons', 'beacons'], ['horn', 'horn'], ['handbrake', 'handbrake'], ['exit', 'interact'], ['headlights', 'headlights']]) {
  await pressVehicleButton(key, button, 'véhicule');
}
// le bouton « Action » (tir) n'existe qu'à une place armée : absent au volant d'un véhicule sans arme…
check(await mp.evaluate(() => window.__inputTest.rect('fire')) === null, 'véhicule sans arme : pas de bouton « Action » (il ne ferait rien)');
// … présent au volant d'un engin armé (canon à eau, Centaure) : on remonte à bord d'un engin à tourelle
await mp.evaluate(() => { window.__inputTest.controls.inVehicle = false; });
await frames(mp, 5);
await mp.evaluate(() => {
  const t = window.__inputTest;
  t.controls.inVehicle = true;
  t.ctx.player.vehicle().def.turrets = [{ kind: 'canon_eau' }];
});
await frames(mp, 5);
await pressVehicleButton('fire', 'primary', 'engin armé');
await mp.evaluate(() => { window.__inputTest.controls.inVehicle = false; });
await frames(mp, 5);
await mp.evaluate(() => {
  const t = window.__inputTest;
  t.controls.inVehicle = true;
  delete t.ctx.player.vehicle().def.turrets;
});
await frames(mp, 5);
check(await mp.evaluate(() => window.__inputTest.labels.labelFor('interact')) === 'Sortir', 'libellé tactile de « Interagir » en véhicule : Sortir');

// ── disposition drone ──
await mp.evaluate(() => {
  window.__inputTest.controls.inVehicle = false;
  window.__inputTest.controls.cameraMode = 'drone';
});
await frames(mp, 5);
s = await snap(mp);
check(s.layout === 'drone', `caméra drone : disposition ${s.layout}`);
await checkLayout('drone 844×390', 13);
info.push('capture : ' + await shot(mp, 'input-touch-drone-844x390'));
for (const [key, button] of [['up', 'jump'], ['down', 'crouch'], ['zoomin', 'zoom_in'], ['zoomout', 'zoom_out'], ['primary', 'primary'], ['quit', 'interact']]) {
  const c = await centerOf(key);
  await fingerDown(5, c.x, c.y);
  await frames(mp, 3);
  s = await snap(mp);
  check(s.down.includes(button), `drone : bouton ${key} → ${button}`);
  await fingerUp(5);
  await frames(mp, 3);
}
await mp.evaluate(() => {
  window.__inputTest.controls.cameraMode = 'tps';
});
await frames(mp, 4);

// ── écran modal : commandes de jeu masquées, l'interface reçoit les doigts ──
await fingerDown(1, home.x, home.y);
await fingerMove(1, home.x, home.y - home.radius * 1.2);
await frames(mp);
await mp.evaluate(() => window.__inputTest.setModal(true));
await frames(mp, 5);
s = await snap(mp);
check(s.layout === 'menu' && s.moveY === 0 && !s.down.includes('sprint'), `écran modal : disposition ${s.layout}, joystick relâché d'office`);
check((await layoutProblems('menu')).count === 0, 'écran modal : plus aucune commande de jeu affichée');
await fingerUp(1);
await mp.touchscreen.tap(422, 232);               // bouton « Fermer » du modal d'essai
await frames(mp, 6);
s = await snap(mp);
check(s.layout === 'pied', `toucher « Fermer » referme le modal (disposition ${s.layout})`);
check(s.device === 'touch', 'les événements de souris fabriqués après un toucher ne basculent pas sur « clavier/souris »');

// ── dispositions imposées ──
await mp.evaluate(() => window.__inputTest.touch.setLayout('cache'));
await frames(mp);
s = await snap(mp);
check(s.visible === false, 'disposition « cache » : surcouche masquée');
await mp.evaluate(() => window.__inputTest.touch.setLayout('auto'));
await frames(mp);

// ── bascule de périphérique ──
await mp.waitForTimeout(350);
await mp.keyboard.down('KeyW');
await frames(mp, 4);
s = await snap(mp);
check(s.device === 'kbm' && s.visible === false, `clavier branché sur la tablette : ${s.device}, surcouche ${s.visible ? 'visible' : 'masquée'}`);
await mp.keyboard.up('KeyW');
await mp.waitForTimeout(350);
await tap(520, 170);
await frames(mp, 4);
s = await snap(mp);
check(s.device === 'touch' && s.visible === true, `retour au doigt : ${s.device}, surcouche ${s.visible ? 'visible' : 'masquée'}`);

// ── portrait : message « tournez votre appareil » ──
await mp.setViewportSize({ width: 390, height: 844 });
await frames(mp, 6);
check(await mp.evaluate(() => {
  const root = document.querySelector('.crs-touch');
  const msg = root.querySelector('.ct-rotate');
  return root.classList.contains('is-portrait') && getComputedStyle(msg).display === 'flex' && msg.textContent.includes('Tournez votre appareil');
}), 'portrait : message de rotation affiché');
await fingerDown(1, 100, 700);
await fingerMove(1, 100, 600);
await frames(mp);
s = await snap(mp);
check(s.moveY === 0 && s.down.length === 0, 'portrait : les commandes sont neutralisées');
await fingerUp(1);
info.push('capture : ' + await shot(mp, 'input-touch-portrait-390x844'));

// ── tablette 1180×820 ──
await mp.setViewportSize({ width: 1180, height: 820 });
await frames(mp, 6);
check(await mp.evaluate(() => !document.querySelector('.crs-touch').classList.contains('is-portrait')), 'retour en paysage : message retiré');
await mp.evaluate(() => {
  window.__inputTest.controls.prompt = 'Menotter';
});
await frames(mp, 4);
await checkLayout('pied 1180×820', 20);
info.push('capture : ' + await shot(mp, 'input-touch-pied-1180x820'));
const tHome = await mp.evaluate(() => window.__inputTest.stickHome());
await fingerDown(1, tHome.x, tHome.y);
await fingerMove(1, tHome.x + tHome.radius * 0.8, tHome.y - tHome.radius * 0.8);
await frames(mp);
s = await snap(mp);
check(s.moveX > 0.6 && s.moveY > 0.6 && s.down.includes('sprint'), `tablette : joystick en diagonale à fond (${s.moveX.toFixed(2)}, ${s.moveY.toFixed(2)})`);
await fingerUp(1);
await mp.evaluate(() => {
  window.__inputTest.controls.prompt = null;
  window.__inputTest.controls.inVehicle = true;
});
await frames(mp, 5);
await checkLayout('véhicule 1180×820', 15);
info.push('capture : ' + await shot(mp, 'input-touch-vehicule-1180x820'));
await mp.evaluate(() => {
  window.__inputTest.controls.inVehicle = false;
  window.__inputTest.controls.cameraMode = 'drone';
});
await frames(mp, 5);
await checkLayout('drone 1180×820', 13);
info.push('capture : ' + await shot(mp, 'input-touch-drone-1180x820'));

// petit téléphone 667×375
await mp.evaluate(() => {
  window.__inputTest.controls.cameraMode = 'tps';
});
await mp.setViewportSize({ width: 667, height: 375 });
await frames(mp, 6);
await checkLayout('pied 667×375', 20);
info.push('capture : ' + await shot(mp, 'input-touch-pied-667x375'));

const mobBench = await mp.evaluate(() => window.__inputTest.bench(20000));
info.push(`coût CPU (émulation mobile, boucle serrée) : update ${mobBench.updateUs.toFixed(2)} µs, frame ${mobBench.frameUs.toFixed(2)} µs`);

for (const line of info) console.log('  ' + line);
console.log(`[input] ${passed} vérifications réussies, ${failures.length} échec(s)`);
for (const f of failures) console.error('  ✗ ' + f);
await finish({ browser: mob.browser, server, errors: allErrors.flat(), ok: failures.length === 0, label: 'input' });
