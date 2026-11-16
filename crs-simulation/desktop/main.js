// CRS Simulation — application de bureau (Electron).
// Le jeu (copie de dist/ dans ./game) est servi par un protocole interne « app:// » : modules JavaScript, tuiles de la
// carte et données se chargent comme sur le web, sans serveur ni réseau. Plein écran : Ctrl+Cmd+F (menu Présentation).
'use strict';
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b1220',
    title: 'CRS Simulation',
    fullscreenable: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  // vérification automatique (CRS_SMOKE=1) : partie lancée d'office, capture, compte rendu dans la console, puis sortie
  const smoke = process.env.CRS_SMOKE === '1';
  win.loadURL(smoke ? 'app://jeu/index.html?autostart=paris&quality=bas&nomenu=1' : 'app://jeu/index.html');
  if (smoke) runSmoke(win);
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
    app.exit(ready && errors.length === 0 ? 0 : 1);
  };
  win.webContents.once('did-finish-load', () => setTimeout(poll, 2000));
}

app.whenReady().then(() => {
  protocol.handle('app', serveGame);
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
