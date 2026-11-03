# JARVIS — Console Écosystème (3D, un seul fichier)

Console 3D de pilotage des trois écosystèmes d'agents (Studio Shopify, KCL, Rédacteur) autour du cœur JARVIS.
Tout tient dans **`index.html`** : aucun build, aucune dépendance locale. three.js (r182, WebGPU + repli WebGL 2) et la police Jost sont chargés depuis des CDN.

## Mettre en ligne sans terminal

- **Netlify Drop** : ouvrir https://app.netlify.com/drop et glisser le dossier `jarvis-console` (ou juste `index.html`) dans la page.
- **Vercel** : « Add New Project » → importer le dépôt, dossier racine `jarvis-console`, framework « Other », déployer.
- **GitHub Pages** : Settings → Pages → source « Deploy from a branch », dossier `/jarvis-console` (ou déplacer `index.html` à la racine).
- **En local** : double-cliquer sur `index.html` fonctionne dans Chrome/Edge (les modules sont chargés depuis le CDN).

Navigateurs : Chrome/Edge 113+ (WebGPU), Safari 26 (WebGPU) ; Firefox et Safari 17–18 passent automatiquement en WebGL 2.

## Navigation

- Glisser : orbiter. Molette : avancer/reculer en profondeur (inertie et flou de vitesse).
- Clic sur un agent de loin : vol vers sa constellation. Clic sur un agent de près : vol vers l'agent et panneau « Détail de l'agent ».
- Clic sur le cœur : retour à la vue d'ensemble et ouverture de la commande « Parle à Jarvis » (Entrée envoie, Échap ferme, bouton micro = dictée).
- Raccourcis clavier (jamais affichés) : `1` Studio, `2` KCL, `3` Rédacteur, `0` ou `Échap` vue d'ensemble, `J` parler à Jarvis.
- Barre à trois points en haut à gauche : nombre d'agents actifs, liste déroulante (clic sur un agent = vol vers lui), bascule « Tous les agents ».

## Piloter la scène depuis une page externe

L'objet `window.jarvisConsole` est disponible dès que la page est chargée :

```js
const j = window.jarvisConsole;
j.data.agents;                                   // [{ id, name, role, eco, state, task, actions, cost, load, progress }]
j.updateAgent('design', { state: 'working', task: 'Maquette v4', load: 0.8, progress: 0.3 });
j.updateAgent('design', { handoverTo: 'constructeur' }); // trace le lien Design → Constructeur et y envoie des fusées
j.updateAgent('admin', { state: 'waiting' });            // anneau ambré, fusées en pause, entrée « Validation requise »
j.updateCosts(18.2);                             // ou j.updateCosts({ total, cap, budget, spent })
j.updateMission({ project: '…', progress: 0.55, step: 'Contenus', elapsed: 9000, remaining: 7200, agent: 'constructeur' });
j.appendLog('qa', 'Tests responsive terminés');
j.speak('Les tests sont terminés.');            // affiché sous le cœur et lu à voix haute
j.onCommand = (texte) => 'réponse';             // optionnel : réponse (ou Promise) aux phrases tapées/dictées
j.focusAgent('veille'); j.focusEcosystem('kcl'); j.overview();
j.setSimulation(false);                          // coupe la démo (coupée automatiquement au premier updateAgent externe)
j.setQuality(2); j.getFPS(); j.backend; j.quality;
```

États possibles : `idle`, `working`, `waiting`. Les identifiants d'agents : `ceo, design, constructeur, qa, admin, veille, business, publicite, commandes, ceo-kcl, veilleur-keats, planning, readings, controle-qualite, essais-coach, revision, videos, exos-maths-stats, redacteur`.

Identifiants d'éléments du HUD : `mission-project`, `mission-progress`, `mission-gauge`, `mission-elapsed`, `mission-remaining`, `mission-agent`, `mission-step`, `pipeline-list`, `agent-name`, `agent-role`, `agent-eco`, `agent-state`, `agent-task`, `agent-actions`, `agent-cost`, `costs-total`, `costs-cap`, `costs-budget`, `costs-gauge`, `costs-agents`, `usage-input`, `usage-output`, `usage-sessions`, `usage-tools`, `preview-status`, `preview-url`, `preview-updated`, `delivery-date`, `delivery-status`, `delivery-items`, `validation-list`, `live-list`, `alerts-list`, `memory-list`, `agents-count`, `agents-list`, `command-input`, `mic`, `answer`, `fps`, `status-text`.

## Options d'URL

- `?backend=webgl` force le repli WebGL 2.
- `?quality=0…3` fixe le palier de qualité (3 = réflexions écran + volumétrie + profondeur de champ).
- `?sim=0` désactive la démo animée.

## Ce que le moteur fait et ne fait pas

Fait : réflexion planaire du sol (flou croissant avec la distance), réflexions écran (SSR, palier 3), environnement studio HDR procédural, bloom à seuil sur les seules émissions, rayons lumineux depuis le cœur (radial, écran), profondeur de champ à bokeh pondéré, aberration chromatique, grain, vignette, flare retenu sur le cœur, flou de vitesse, verre avec transmission/IOR/dispersion, clearcoat, iridescence, anisotropie, micro-rayures procédurales, poussière, champ d'étoiles à trois couches.

Approximé : la volumétrie est un effet radial en espace écran (pas de ray-marching de brouillard), les caustiques sont une nappe procédurale animée sous chaque objet (pas de tracé physique), les réflexions entre objets viennent du SSR et de l'environnement (pas de ray-tracing).

Sans objet : Draco/Meshopt/KTX2 — toute la géométrie est procédurale, aucun fichier n'est chargé.

Échelle de qualité automatique : si la cadence mesurée reste sous 55 ips, la console retire successivement les réflexions écran, la volumétrie, la profondeur de champ, puis abaisse le ratio de pixels à 1,5. La cadence est affichée en haut à droite.
