# JARVIS — Console Écosystème

Console 3D de pilotage des trois écosystèmes d'agents (Studio Shopify, KCL, Rédacteur) autour du cœur JARVIS.
Moteur three.js r182 (WebGPU, repli WebGL 2 automatique), matériaux TSL, HUD HTML sans cadre, commande vocale, délégation des tâches, connexion optionnelle à Claude.

Deux façons de l'utiliser :

| | Projet (terminal) | Fichier unique (sans terminal) |
|---|---|---|
| Où | ce dossier (`npm install`, `npm run dev`, `npm run build`) | `standalone/index.html` |
| Dépendances | installées en local, bundle hors ligne | three.js et le SDK Anthropic chargés depuis jsdelivr / esm.sh |
| Mise en ligne | `npm run build` puis déposer le dossier `dist/` | déposer le fichier tel quel (Netlify Drop, Vercel, GitHub Pages) |

## Démarrer depuis le terminal

```bash
npm install
```

```bash
npm run dev
```

Ouvre l'adresse affichée (http://localhost:5173). Pour produire la version à héberger :

```bash
npm run build
```

Le dossier `dist/` contient tout (HTML, CSS, JS, three.js inclus) : il se dépose tel quel sur Netlify, Vercel, GitHub Pages ou n'importe quel hébergement statique. `npm run preview` le sert en local pour vérifier. `npm run build:standalone` régénère `standalone/index.html` à partir des mêmes sources ; `npm run build:all` fait les deux.

Node 18 ou plus récent. Navigateurs : Chrome/Edge 113+ et Safari 26 (WebGPU) ; Firefox et Safari 17–18 passent automatiquement en WebGL 2.

## Navigation

- Glisser : orbiter. Molette : avancer/reculer en profondeur (inertie et flou de vitesse).
- Clic sur un agent de loin : vol vers sa constellation ; de près : vol vers l'agent et panneau « Détail de l'agent ».
- Clic sur le cœur : retour à la vue d'ensemble et ouverture de la commande « Parle à Jarvis » (Entrée envoie, Échap ferme, bouton micro = dictée en français, lecture à voix haute des réponses).
- Raccourcis clavier (jamais affichés) : `1` Studio, `2` KCL, `3` Rédacteur, `0` ou `Échap` vue d'ensemble, `J` parler à Jarvis.
- Barre à trois points en haut à gauche : agents actifs, liste déroulante (clic = vol vers l'agent), bascule « Tous les agents ».

Le micro exige une page servie en HTTPS ou en localhost (exigence des navigateurs), et Chrome/Edge pour la reconnaissance vocale.

## Parler à Jarvis et déléguer

Sans aucune configuration, Jarvis répond par règles : état de la mission, coûts, validations en attente, agents bloqués, et il **délègue** les tâches formulées en français :

- « Demande au Design de refaire la maquette mobile » → le CEO du Studio délègue à Design (lien tracé, fusées, journal, état « en cours »).
- « Lance la révision du chapitre 7 » → l'écosystème est deviné (KCL), le CEO-KCL délègue à Révision.
- « Le Constructeur doit intégrer la section héros » → même mécanique.
- « Vue d'ensemble », « montre-moi KCL », le nom d'un agent → la caméra vole.

Avec une clé API Anthropic (panneau **JARVIS**, en bas de la colonne), les réponses et les décisions de délégation sont produites par Claude (Opus 5.5 par défaut, Sonnet 5.5 ou Haiku 5.5 au choix) à partir du prompt général, des prompts de chaque agent et de l'état complet de la console. La clé reste dans le navigateur (localStorage) ; ne l'utilise pas sur une page publique partagée. En cas d'échec réseau ou de clé invalide, Jarvis repasse en mode local et le signale dans le flux.

## Prompts des agents et des CEO

- Chaque agent a un **prompt général** (rôle, consignes) ; les CEO ont un **prompt de délégation** (comment ils découpent et répartissent les objectifs de Jarvis).
- Édition : panneau « Détail de l'agent » (clic sur un agent) → zone « Prompt » → Enregistrer. Le prompt général de Jarvis se règle dans le panneau « JARVIS », qui propose aussi « Prompts par défaut ».
- Les prompts sont conservés dans le navigateur et exposés par l'API : `getPrompts()`, `setPrompt(id, texte)`, `setPrompts({...})`, `resetPrompts()`.

## Piloter la scène depuis une page externe

```js
const j = window.jarvisConsole;
j.data.agents;                                   // [{ id, name, role, eco, state, task, actions, cost, load, progress, prompt }]
j.updateAgent('design', { state: 'working', task: 'Maquette v4', load: 0.8, progress: 0.3 });
j.updateAgent('design', { handoverTo: 'constructeur' }); // trace le lien Design → Constructeur et y envoie des fusées
j.updateAgent('admin', { state: 'waiting' });            // anneau ambré, fusées en pause, entrée « Validation requise »
j.delegate('qa', 'Tester la page produit');     // Jarvis → CEO → QA, avec réponse parlée
j.ask('Demande à la Veille un point concurrence'); // même chose que taper dans la commande (renvoie une Promise)
j.updateCosts(18.2);                             // ou j.updateCosts({ total, cap, budget, spent })
j.updateMission({ project: '…', progress: 0.55, step: 'Contenus', elapsed: 9000, remaining: 7200, agent: 'constructeur' });
j.appendLog('qa', 'Tests responsive terminés');
j.speak('Les tests sont terminés.');            // affiché sous le cœur et lu à voix haute
j.onCommand = (texte) => 'réponse';             // optionnel : court-circuite Jarvis (chaîne ou Promise)
j.setLLM({ apiKey: 'sk-ant-…', model: 'claude-opus-5-5' }); j.getLLM();
j.focusAgent('veille'); j.focusEcosystem('kcl'); j.overview(); j.openCommand();
j.setSimulation(false);                          // coupe la démo (coupée automatiquement au premier updateAgent externe)
j.setQuality(2); j.getFPS(); j.backend; j.quality;
```

États : `idle`, `working`, `waiting`. Identifiants d'agents : `ceo, design, constructeur, qa, admin, veille, business, publicite, commandes, ceo-kcl, veilleur-keats, planning, readings, controle-qualite, essais-coach, revision, videos, exos-maths-stats, redacteur`.

Identifiants d'éléments du HUD : `mission-project`, `mission-progress`, `mission-gauge`, `mission-elapsed`, `mission-remaining`, `mission-agent`, `mission-step`, `pipeline-list`, `agent-name`, `agent-role`, `agent-eco`, `agent-state`, `agent-task`, `agent-actions`, `agent-cost`, `agent-prompt`, `agent-prompt-save`, `costs-total`, `costs-cap`, `costs-budget`, `costs-gauge`, `costs-agents`, `usage-input`, `usage-output`, `usage-sessions`, `usage-tools`, `preview-status`, `preview-url`, `preview-updated`, `delivery-date`, `delivery-status`, `delivery-items`, `validation-list`, `live-list`, `alerts-list`, `memory-list`, `jarvis-prompt`, `llm-model`, `llm-key`, `llm-connect`, `llm-status`, `agents-count`, `agents-list`, `command-input`, `mic`, `answer`, `fps`, `status-text`.

## Si l'ouverture bloque

La console affiche un voile « Initialisation » puis « Compilation des shaders » (quelques secondes la première fois : plusieurs centaines de shaders sont compilés). Si quelque chose échoue, un écran noir avec le message d'erreur propose **Réessayer** et **Mode compatibilité** (WebGL 2, mémorisé pour l'onglet). Les protections intégrées :

- délai maximal d'initialisation du moteur (15 s) puis passage automatique en WebGL 2 ;
- perte du périphérique graphique (GPU occupé, onglet 3D en arrière-plan) → rechargement en WebGL 2 ;
- erreur de chargement d'un module (réseau, CDN pour la version fichier unique) → message explicite au lieu d'un écran noir ;
- échelle de qualité automatique sous 55 ips (réflexions écran, volumétrie, profondeur de champ, puis ratio de pixels), cadence affichée en haut à droite.

Options d'URL : `?backend=webgl` force WebGL 2 ; `?quality=0…3` fixe le palier ; `?sim=0` désactive la démo.

## Ce que le moteur fait et ne fait pas

Fait : réflexion planaire du sol avec flou croissant, réflexions écran (SSR, palier 3), environnement studio HDR procédural, bloom à seuil sur les seules émissions, rayons lumineux depuis le cœur, profondeur de champ à bokeh pondéré, aberration chromatique, grain, vignette, flare retenu sur le cœur, flou de vitesse, verre avec transmission/IOR/dispersion, clearcoat, iridescence, anisotropie, micro-rayures procédurales, poussière, étoiles sur trois couches.

Approximé : la volumétrie est un effet radial en espace écran ; les caustiques sont une nappe procédurale animée ; les réflexions entre objets viennent du SSR et de l'environnement, pas d'un ray-tracing.

Sans objet : Draco/Meshopt/KTX2 (géométrie entièrement procédurale, aucun fichier chargé).

## Structure

```
index.html              page (HUD) + point d'entrée Vite
src/main.js             séquence d'arrivée, boucle, animation du cœur et des agents
src/engine.js           rendu, environnement, matériaux, helpers de géométrie, démarrage robuste
src/core.js             sol miroir et cœur JARVIS
src/agents.js           les dix-neuf instruments
src/links.js            liens, fusées, éclats, pools, poussière, étoiles
src/camera.js           caméra, sélection, post-traitement, échelle de qualité
src/hud.js              HUD, légendes, commande, panneaux
src/sim.js              démo, transferts, trafic, API publique
src/brain.js            prompts, délégation locale, connexion Claude
src/data.js             données et utilitaires
scripts/build-standalone.mjs   génère standalone/index.html
```
