// CRS Simulation — application de bureau (Electron).
// Le jeu (copie de dist/ dans ./game) est servi par un protocole interne « app:// » : modules JavaScript, tuiles de la
// carte et données se chargent comme sur le web, sans serveur ni réseau. Plein écran : Ctrl+Cmd+F (menu Présentation).
//
// Sauvegarde (carrière, historique des parties, scénarios, paramètres) : le jeu l'écrit dans le localStorage de
// l'origine « app://jeu », rangé par Electron dans la session par défaut, qui est persistante (dossier de
// l'utilisateur : ~/Library/Application Support/CRS Simulation sur Mac). Ce stockage est vidé sur le disque à la
// fermeture (flushStorageData). En plus, le préchargement (preload.js) donne au jeu une copie de secours : chaque
// écriture est recopiée dans « sauvegarde.json » du même dossier (écriture atomique ; l'état du lancement précédent
// est gardé dans « sauvegarde.precedente.json »), et au démarrage le jeu retient la plus récente des deux copies.
// Ne pas changer la partition de la fenêtre : un autre emplacement de stockage ferait « oublier » les sauvegardes
// déjà faites par les versions précédentes.
'use strict';
const { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// dossier de l'utilisateur imposé (vérifications automatiques : profil jetable)
if (process.env.CRS_USER_DATA) app.setPath('userData', path.resolve(process.env.CRS_USER_DATA));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const GAME_DIR = path.join(__dirname, 'game');

function serveGame(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(GAME_DIR, rel));
  // jamais en dehors du dossier du jeu
  if (!file.startsWith(GAME_DIR + path.sep)) return new Response('Interdit', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

// ───────────────────────────── copie de secours de la sauvegarde ─────────────────────────────

/** Taille maximale acceptée pour la copie (octets de texte) : bien au-delà d'une sauvegarde réelle. */
const BACKUP_MAX = 32 * 1024 * 1024;
/** Regroupement des écritures rapprochées (ms) : seule la dernière version est écrite. */
const BACKUP_DELAY = 250;
let backupPending = null;
let backupTimer = null;
let backupRotated = false;

function backupFile() {
  return path.join(app.getPath('userData'), 'sauvegarde.json');
}

/** Écrit tout de suite la copie en attente (fichier temporaire puis renommage : jamais de fichier à moitié écrit). */
function flushBackup() {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  if (backupPending === null) return;
  const json = backupPending;
  backupPending = null;
  const file = backupFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!backupRotated) {
      // première écriture de ce lancement : l'état laissé par le lancement précédent est mis de côté
      backupRotated = true;
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(path.dirname(file), 'sauvegarde.precedente.json'));
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[sauvegarde] écriture de la copie de secours impossible', err);
  }
}

/** Seule la page du jeu (app://jeu) parle à la copie de secours. */
function fromGame(event) {
  const url = event.senderFrame ? event.senderFrame.url : '';
  return typeof url === 'string' && url.startsWith('app://jeu/');
}

ipcMain.on('crs:sauvegarde-ecrire', (event, json) => {
  if (!fromGame(event) || typeof json !== 'string' || json.length > BACKUP_MAX) return;
  backupPending = json;
  if (!backupTimer) backupTimer = setTimeout(flushBackup, BACKUP_DELAY);
});

ipcMain.on('crs:sauvegarde-lire', (event) => {
  if (!fromGame(event)) {
    event.returnValue = null;
    return;
  }
  if (backupPending !== null) {
    event.returnValue = backupPending; // rechargement de la page juste après une écriture
    return;
  }
  try {
    event.returnValue = fs.readFileSync(backupFile(), 'utf8');
  } catch {
    event.returnValue = null;
  }
});

/** Avant de quitter : copie de secours écrite, stockage du navigateur vidé sur le disque. */
function flushAll() {
  flushBackup();
  try {
    return session.defaultSession.flushStorageData();
  } catch {
    return undefined;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b1220',
    title: 'CRS Simulation',
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  // vérification automatique (CRS_SMOKE=1) : partie lancée d'office, capture, compte rendu dans la console, puis sortie
  const smoke = process.env.CRS_SMOKE === '1';
  // vérification de la sauvegarde (CRS_SMOKE_SAVE=ecrire | lire | lire-sans-stockage) : voir runSmokeSave
  const smokeSave = process.env.CRS_SMOKE_SAVE || '';
  win.loadURL(smoke ? 'app://jeu/index.html?autostart=paris&quality=bas&nomenu=1' : smokeSave ? 'app://jeu/index.html?quality=bas' : 'app://jeu/index.html');
  if (smoke) runSmoke(win);
  else if (smokeSave) runSmokeSave(win, smokeSave);
  win.on('close', () => flushBackup());
  // liens externes éventuels : dans le navigateur, pas dans la fenêtre du jeu
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

function runSmoke(win) {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  const t0 = Date.now();
  const poll = async () => {
    let ready = false;
    try { ready = await win.webContents.executeJavaScript('!!(window.__CRS && window.__CRS.ready)'); } catch { ready = false; }
    if (!ready && Date.now() - t0 < 240000) return setTimeout(poll, 2000);
    const info = ready ? await win.webContents.executeJavaScript('JSON.stringify(window.__CRS.summary ? window.__CRS.summary() : {})') : '{}';
    await new Promise((r) => setTimeout(r, 3000));
    const img = await win.webContents.capturePage();
    require('node:fs').writeFileSync(process.env.CRS_SMOKE_SHOT || 'smoke.png', img.toPNG());
    console.log(`[smoke] ready=${ready} en ${Math.round((Date.now() - t0) / 1000)} s ; erreurs=${errors.length} ${errors.slice(0, 3).join(' | ')} ; ${info.slice(0, 300)}`);
    await flushAll();
    app.exit(ready && errors.length === 0 ? 0 : 1);
  };
  win.webContents.once('did-finish-load', () => setTimeout(poll, 2000));
}

/**
 * Vérification de la persistance (profil jetable conseillé : CRS_USER_DATA=/tmp/profil) :
 *   ecrire              écrit une valeur d'essai, joue une courte partie (enregistrée dans l'historique), puis
 *                       quitte normalement (app.quit) ;
 *   lire                relance : la valeur et la partie doivent être là ;
 *   lire-sans-stockage  vide d'abord le localStorage du profil : tout doit revenir de la copie de secours.
 * Compte rendu « [smoke-save] … » dans la console ; code de sortie 0 si tout est retrouvé.
 */
function runSmokeSave(win, step) {
  const t0 = Date.now();
  // messages de la sauvegarde du jeu (copie de secours rétablie, stockage indisponible…)
  win.webContents.on('console-message', (_e, _level, message) => {
    if (typeof message === 'string' && message.startsWith('[save]')) console.log('[smoke-save] page : ' + message);
  });
  const poll = async () => {
    let ready = false;
    try { ready = await win.webContents.executeJavaScript('!!(window.__CRS && window.__CRS.ready)'); } catch { ready = false; }
    if (!ready && Date.now() - t0 < 240000) return setTimeout(poll, 1000);
    let report = { ready };
    try {
      if (step === 'ecrire') {
        report = JSON.parse(await win.webContents.executeJavaScript(`(async () => {
          const c = window.__CRS.ctx;
          c.save.write('essai-persistance', { valeur: 'conservee', le: Date.now() });
          await window.__CRS.start({ mode: 'libre', seed: 7 });
          window.__CRS.step(30);
          c.session.end(false);
          const h = c.service('history');
          return JSON.stringify({ ready: true, desktop: !!window.crsDesktop, persistent: c.save.persistent, parties: h ? h.entries.length : -1 });
        })()`));
      } else {
        report = JSON.parse(await win.webContents.executeJavaScript(`(() => {
          const c = window.__CRS.ctx;
          const h = c.service('history');
          const v = c.save.read('essai-persistance', null);
          return JSON.stringify({ ready: true, desktop: !!window.crsDesktop, valeur: v ? v.valeur : null, parties: h ? h.entries.length : -1, cumul: h ? h.totals.sessions : -1, localStorage: !!localStorage.getItem('crs-simulation-france.save.v1') });
        })()`));
      }
    } catch (err) {
      report.erreur = String(err);
    }
    // laisse partir la copie de secours, puis écrit tout sur le disque
    await new Promise((r) => setTimeout(r, BACKUP_DELAY * 2));
    await flushAll();
    let fichier = 0;
    try { fichier = fs.statSync(backupFile()).size; } catch { fichier = 0; }
    report.fichier = fichier;
    report.etape = step;
    const ok = step === 'ecrire' ? report.parties >= 1 && fichier > 0 : report.valeur === 'conservee' && report.parties >= 1;
    console.log(`[smoke-save] ${ok ? 'OK' : 'ÉCHEC'} ${JSON.stringify(report)} (dossier ${app.getPath('userData')})`);
    if (step === 'ecrire' && ok) app.quit(); // sortie normale : c'est elle qui doit tout conserver
    else app.exit(ok ? 0 : 1);
  };
  win.webContents.once('did-finish-load', () => setTimeout(poll, 1000));
}

app.on('before-quit', () => {
  flushAll();
});

app.whenReady().then(async () => {
  protocol.handle('app', serveGame);
  if (process.env.CRS_SMOKE_SAVE === 'lire-sans-stockage') {
    // simulation d'un stockage du navigateur perdu : seule la copie de secours peut tout rétablir
    await session.defaultSession.clearStorageData({ storages: ['localstorage'] });
  }
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Présentation', submenu: [{ role: 'togglefullscreen', label: 'Plein écran' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'reload', label: 'Recharger' }] },
    { role: 'windowMenu', label: 'Fenêtre' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
