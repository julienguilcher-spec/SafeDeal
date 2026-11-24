// CRS Simulation — préchargement de la fenêtre du jeu (application de bureau).
// Expose à la page une seule chose : la copie de secours de la sauvegarde, rangée par le processus principal dans
// « sauvegarde.json » du dossier de l'utilisateur (voir main.js). La page reste isolée (contextIsolation, sandbox) :
// ni Node ni ipcRenderer ne lui sont donnés, seulement ces deux fonctions, qui n'acceptent que du texte.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crsDesktop', {
  /** Contenu de la copie de secours (texte JSON) ou null. Synchrone : lu une fois, au démarrage du jeu. */
  loadBackup() {
    try {
      const v = ipcRenderer.sendSync('crs:sauvegarde-lire');
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  },
  /** Remplace la copie de secours (écrite sur le disque par le processus principal, sans bloquer la page). */
  saveBackup(json) {
    if (typeof json !== 'string') return;
    ipcRenderer.send('crs:sauvegarde-ecrire', json);
  },
});
