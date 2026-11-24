# Compte rendu — entrées

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le module des entrées est écrit, exécuté et vérifié : un GameSystem d'ordre INPUT (src/input) publie ctx.input et cinq services, et unifie clavier/souris, manette et tactile. Les fronts pressed/released, ainsi que lookX/lookY/wheel, passent par deux vues indépendantes (une pour les pas de simulation, une pour les images) : chaque appui est vu exactement une fois par les systèmes qui lisent dans update() et une fois par ceux qui lisent dans frame(), que l'image compte 0, 1 ou plusieurs pas. Clavier/souris : touches physiques (KeyboardEvent.code), table par défaut conforme au tableau d'ARCHITECTURE.md, capture de la souris au clic sur #game hors écran modal, rendue en pause et à l'ouverture d'un modal, repli « glisser pour regarder » si la capture est refusée, molette, perte de focus, neutralisation du défilement et des raccourcis gênants pendant le jeu. Manette : zones mortes radiales, courbes de réponse, gâchettes analogiques (throttle/brake), sensibilité et inversion lues dans ctx.settings, vibration, branchement et débranchement à chaud, stick gauche utilisable dans les menus. Tactile : surcouche DOM insérée dans #ui avec les dispositions pied, véhicule, drone, menu et cachée ; chaque doigt est suivi par son identifiant ; joystick flottant (à fond = courir), zone de regard, pédales analogiques, barre d'objets, zones sûres, message de rotation en portrait. Le périphérique actif bascule sur le dernier utilisé ; labelFor() donne le libellé courant (« E », « X » ou « □ », « Interagir ») ; la réaffectation clavier et manette est persistée dans la section « bindings » de ctx.save, avec réinitialisation. Trois écarts par rapport à la demande, à valider : (1) j'ai ajouté des affectations manette là où le tableau indique « — » (Y = recharger / sirène, B = gyrophares, clic stick gauche = klaxon en véhicule), parce que le dossier de recherche 05 demande qu'aucune action ne soit réservée à un support ; (2) le module fabrique un appui bref sur « pause » quand la capture de la souris est perdue sans que le jeu l'ait demandé, quand la fenêtre perd le focus ou quand la manette active est débranchée ; (3) en véhicule (ctx.player.vehicle() non nul), moveX et moveY restent indépendants dans [-1, 1] au lieu d'être bornés à une norme de 1, pour que braquer à fond ne réduise pas l'accélérateur. Le module n'a pas été essayé dans le vrai jeu en navigateur (main.ts appartient à l'intégrateur) ni sur de vrais appareils ; il a seulement été branché une fois dans le moteur réel en mode headless, avec succès.

## API publique et mode d'emploi

BRANCHEMENT
Dans src/main.ts : `import { createSystems as input } from '@/input';` puis l'ajouter à MODULES. Un seul système, id 'input', order SystemOrder.INPUT. provide() pose ctx.input et les services ; init() écoute le DOM (rien en headless). Zone de jeu = #game (à défaut ctx.view.renderer.domElement, puis body) ; la surcouche tactile est insérée en PREMIER enfant de #ui (à défaut body).
Types à importer avec `import type … from '@/input'` (ou '@/input/api').

FRONTS (comportement exact)
- pressed(b) / released(b) sont vrais pendant exactement UN pas pour qui lit dans update(), et pendant exactement UNE image pour qui lit dans frame(). Les deux vues sont indépendantes : la vue « simulation » est verrouillée au début de chaque update() du module, la vue « image » au début de son frame().
- Plusieurs pas dans une image : seul le premier voit le front. Images sans pas (phase « playing ») : le front attend le pas suivant.
- pressed et released ne sont jamais vrais ensemble. Un appui bref (enfoncé puis relâché entre deux lectures) donne un pas avec pressed et down vrais, puis un pas avec released vrai. Limite : au plus une transition par pas, donc des appuis plus rapprochés que 2 pas sont fusionnés.
- Hors phase « playing » (pause, menus), ou après 0,5 s sans pas : la vue « simulation » est recalée sans front. Ce qui est pressé dans un menu n'arrive pas au jeu à la reprise ; une touche encore tenue reste down, sans pressed. reset() (nouvelle session) fait de même.
- Une action traitée à la fois dans update() et dans frame() par deux systèmes sera vue deux fois : choisir l'un ou l'autre.

AXES
- lookX / lookY : radians, sensibilité et inversion Y déjà appliquées. lookX > 0 = regard à droite, lookY > 0 = regard vers le haut. Avec le repère du jeu : `camYaw -= lookX; camPitch += lookY`. Même règle que les fronts : tout le mouvement accumulé est rendu au premier pas de l'image puis 0 ; la vue « image » reçoit le même total une fois. Lire dans update() OU dans frame(), pas les deux pour la même caméra.
- wheel : crans, > 0 = vers le bas, même règle. La molette donne aussi un appui bref sur item_next / item_prev.
- moveX / moveY : à pied, norme ≤ 1 (diagonale ZQSD normalisée). En véhicule (ctx.player.vehicle() ≠ null), chaque axe est indépendant dans [-1, 1].
- throttle / brake : gâchettes RT / LT (0..1) à la manette ; au clavier, 1 si avancer / reculer est tenu ; en tactile, pédales analogiques (0,3 en bas de la pédale, 1 en haut), recopiées dans moveY = throttle − brake.
- Une même touche alimente plusieurs boutons selon le contexte ; le consommateur lit celui de son contexte : Espace → jump + handbrake ; KeyR → reload + siren ; KeyL → flashlight + headlights ; Échap → pause + ui_back ; flèches → regard + ui_* ; manette A → jump + handbrake + ui_accept ; B → crouch + beacons + ui_back ; RT → primary + throttle ; LT → secondary + brake.
- device : 'kbm' | 'gamepad' | 'touch', dernier périphérique utilisé intentionnellement, avec 0,25 s minimum entre deux bascules. pointerLocked : souris capturée.
- rumble(force, secondes) : manette active, ou navigator.vibrate en tactile ; rien si Settings.vibration est faux.

SERVICES (ctx.service<T>(clé))
- 'input.touch' → InputTouchApi : setLayout('pied' | 'vehicule' | 'drone' | 'menu' | 'cache' | 'auto'), setInteractLabel(texte | null), setItemBar(éléments | null, indexActif), setButtonVisible(bouton, bool), setToggle(bouton, bool), setForced(true | false | null) ; lecture : mode, layout, visible.
  - 'auto' (valeur initiale) : drone si cameraMode === 'drone' ou véhicule volant, véhicule si à bord, pied sinon ; 'menu' hors phase « playing ».
  - ctx.ui.modal masque toujours les commandes de jeu.
  - setInteractLabel(null) : libellé de ctx.player.state.prompt s'il existe, sinon bouton discret « Interagir ».
  - setItemBar(null) : remplissage automatique d'après l'inventaire de la personne incarnée (ItemDef.icon et name). Les éléments sont des chaînes ou { icon, label?, count? }. Toucher la case n = appui bref sur slot(n+1).
  - « Viser » est à bascule par défaut, « Accroupi » momentané (réglable par setToggle).
- 'input.labels' → InputLabelsApi : labelFor(bouton, périphérique?), labelsFor, moveLabel (« ZQSD », « Stick gauche », « Joystick »), lookLabel, actionName (nom français), codeLabel, padStyle ('lettres' | 'formes' | 'lettres_inversees'), padName, keyboardLayout, version (à comparer pour ne rafraîchir l'affichage qu'au besoin). La disposition du clavier est supposée d'après la langue, puis corrigée par Keyboard.getLayoutMap et par les frappes.
- 'input.bindings' → InputBindingsApi : actions, get(périphérique, action), set(périphérique, action, 0 | 1, code | null) (retourne les actions du même contexte à qui le code a été retiré), conflicts, reset(périphérique?), resetAction, isDefault, capture(périphérique, done) (prochaine touche ou prochain bouton ; Échap annule), version. Codes : KeyboardEvent.code, 'Mouse0'…'Mouse4', 'WheelUp' / 'WheelDown' ; 'B0'…'B16' à la manette. Actions = Button + move_forward / back / left / right + look_left / right / up / down. Seuls les écarts aux valeurs par défaut sont enregistrés.
- 'input.script' → InputScriptApi : press, release, tap, setMove, setTriggers, look, wheel, clear. Entrées simulées pour les tests et le didacticiel ; fonctionne en headless.
- 'input.pointer' → InputPointerApi : locked, fallback, request() (à appeler depuis un clic ou une touche, par exemple « Reprendre »), release().

À SAVOIR POUR L'INTERFACE
- Le clic qui capture la souris ne déclenche aucune action.
- « pause » peut être fabriqué par le module (capture perdue, perte de focus, manette active débranchée), uniquement si phase === 'playing' et sans modal, au plus une fois par seconde.
- Tant que ui.modal est vrai, le clavier garde son comportement natif (Tab, Entrée) ; les boutons ui_* restent lisibles dans frame().
- Les zones tactiles (plein écran, z-index 0) sont sous les éléments positionnés ajoutés après elles dans #ui ; les boutons tactiles ont z-index 1. Un calque de HUD plein écran doit rester en pointer-events: none.
- Emplacements occupés par la surcouche (pixels sur 844×390, multipliés par une échelle de 0,82 à 1,45) : rangée système en haut à droite (≈ 290 × 110), Radio / Ordres à gauche au-dessus du joystick, barre d'objets en bas au centre, groupe d'actions en bas à droite.
- Hors session « playing » (bancs d'essai), la disposition auto vaut 'menu' : appeler setLayout('pied').

BANC D'ESSAI
/harness/input.html, paramètres ?layout=…&force=1&clean=1&items=0&prompt=… ; API de test window.__inputTest. Contexte factice réutilisable : src/input/dev/fakeContext.ts.

## Mesures

Coût CPU du module, mesuré avec performance.now() dans le banc d'essai (boucle serrée de 20 000 appels, Chromium headless) :
- ordinateur : update() 0,27 à 0,47 µs, frame() 1,2 à 2,0 µs, lecture d'un bouton (down/pressed) 21 à 31 ns ;
- émulation mobile, surcouche tactile affichée : update() 0,47 à 1,4 µs, frame() 1,6 à 4,9 µs.
Test unitaire de performance (Node 22, manette active, 0 à 2 pas par image, 42 lectures de boutons par pas, appuis et regard simulés) : 4,3 µs par image complète, lectures du test comprises.
Allocations : 16 octets par image, soit le seul nombre flottant rendu par l'horloge (performance.now()). Aucun objet, tableau, fermeture ni chaîne créé dans update()/frame(). Le test unitaire échoue au-delà de 40 octets par image.
Hors boucle chaude : chaînes de style CSS pendant qu'un doigt déplace le joystick (une écriture DOM par image au plus), tableau rendu par navigator.getGamepads() quand une manette est connue (sinon une recherche par seconde), reconstruction de la barre d'objets seulement quand l'inventaire change (relu 5 fois par seconde).
DOM de la surcouche : 53 éléments de commande créés une fois ; aucun backdrop-filter.

## Non fait / fragile

- Aucun essai sur de vrais appareils (iOS Safari, Android, vraie manette, vrai clavier AZERTY) : tout repose sur Chromium headless, l'émulation tactile et une manette simulée.
- Sous capture de la souris, Chromium headless annule les déplacements injectés (+dx puis −dx) : le regard à la souris capturée est testé avec des événements mousemove fabriqués dans la page. Le chemin « glisser pour regarder », lui, est testé avec de vrais événements.
- Le module n'a pas été essayé dans le vrai jeu en navigateur : main.ts est réservé à l'intégrateur et MODULES y est encore vide. Seul l'essai headless dans le moteur réel a été fait.
- Écart au tableau d'ARCHITECTURE.md, à valider : affectations manette ajoutées là où il indique « — » (Y = recharger à pied / sirène en véhicule, B = gyrophares en véhicule, clic stick gauche = klaxon en véhicule). Pour les retirer : trois lignes dans DEFAULT_GAMEPAD de src/input/bindings.ts. Restent sans bouton de manette par défaut : avance rapide, lampe, phares, mégaphone, zoom, carte tactique (réaffectables).
- Manettes hors mapping standard (Gamepad.mapping vide, fréquent sous Firefox/Linux) : lues avec les mêmes indices, sans table de correspondance ; boutons et axes peuvent être décalés.
- Sticks de manette non réaffectables ni inversables (pas de mode gaucher) ; seuls les boutons le sont. Les boutons tactiles ne sont pas déplaçables par le joueur.
- Sur le plus petit téléphone (667×375, échelle 0,82), les pastilles de la rangée système font environ 38 px de haut, sous la recommandation de 44 px.
- « Accroupi » est momentané en tactile : si le contrôleur du joueur traite crouch comme un maintien, appeler setToggle('crouch', true).
- Pas de verrouillage d'orientation (screen.orientation.lock) ni de plein écran : seul le message « Tournez votre appareil » impose le paysage.
- La mise en pause automatique à la perte de focus est un choix du module ; si l'interface traite « pause » comme une bascule sans vérifier son état, elle doit en tenir compte.
- Zones sûres (env(safe-area-inset-*)) prises en compte en CSS et dans le placement du joystick, mais non vérifiées sur un écran à encoche réel (elles valent 0 en émulation).

## Demandes d'évolution du contrat

- InputState.moveX/moveY : préciser dans le commentaire la norme attendue. Implémenté : norme ≤ 1 à pied ; axes indépendants dans [-1, 1] quand ctx.player.vehicle() ≠ null (volant et accélérateur).
- InputState.lookX/lookY : préciser le signe. Implémenté : lookX > 0 = regard à droite (donc camYaw -= lookX avec le repère du jeu), lookY > 0 = regard vers le haut. Préciser aussi que la valeur est rendue une fois par pas dans update() et une fois par image dans frame().
- InputState.throttle/brake : remplacer « sinon 0/1 dérivés des boutons » par la règle implémentée : clavier = avancer / reculer tenus ; tactile = pédales analogiques ; manette = gâchettes RT / LT.
- InputState.wheel : préciser l'unité et le signe (crans, > 0 = vers le bas).
- ARCHITECTURE.md §5 : remplacer « — » par les affectations manette ajoutées si elles sont validées (Sirène = Y, Gyrophares = B, Klaxon = clic stick gauche, en véhicule), et ajouter les actions absentes du tableau : Recharger (KeyR / Y), Lampe et Phares (KeyL), Mégaphone (KeyX), Zoom (Equal / Minus), menus (Entrée, Échap ou Retour arrière, flèches ; A, B, croix à la manette).
- Button : il manque « Désigner » (dossier de recherche 06, ligne 264) si cette action doit avoir sa propre touche ; aujourd'hui aucun bouton du contrat ne lui correspond.
- Facultatif : déclarer dans contracts.ts les clés de services 'input.touch', 'input.labels', 'input.bindings', 'input.script', 'input.pointer' (types dans src/input/api.ts) pour que l'interface n'ait pas à importer depuis le module.

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans tout le projet au moment du contrôle, donc aucune dans src/input ni tests/unit/input.*
- tsc --noEmit avec un tsconfig temporaire incluant harness/input.ts (hors du tsconfig du projet) : 0 erreur
- npx vitest run tests/unit/input : 8 fichiers, 86 tests réussis (zones mortes et courbes, fronts et entrelacements pas/images, fusion des périphériques, table par défaut comparée au tableau d'ARCHITECTURE.md, réaffectation et persistance, libellés AZERTY/QWERTY/manette, système complet en headless avec manette injectée, dispositions tactiles sans chevauchement sur 6 tailles d'écran, performance)
- node tests/e2e/input.mjs (Chromium headless, environ 4 min) : 270 vérifications réussies, 0 échec, aucune erreur de page ni console.error
- Bout en bout, clavier : touches physiques, diagonale normalisée, 20 touches du tableau, Tab sans déplacement du focus, champ de saisie non intercepté ; appui bref et appui maintenu vus 1/1 par les pas et 1/1 par les images aux cadences [1], [3], [0,0,1] et [2,0,0,0] pas par image ; perte de focus : touches relâchées et une seule demande de pause
- Bout en bout, souris : capture accordée par Chromium headless ; le clic de capture ne déclenche pas primary ; clics gauche et droit simultanés ; molette ; modal et pause rendent la souris ; capture perdue = une pause. Repli « glisser pour regarder » vérifié avec requestPointerLock rejeté (100 px = 0,22 rad, sensibilité ×2, inversion Y, flèches du clavier)
- Bout en bout, manette (navigator.getGamepads remplacé dans la page) : dérive ignorée, stick, gâchette à mi-course = 0,5 analogique, 13 boutons, stick droit environ 3,3 rad/s, libellés, vibration reçue (dual-rumble, 200 ms), capture d'un bouton, débranchement (relâchement, repli clavier, une pause), rebranchement sans événement
- Bout en bout, réaffectation : capture de KeyK, section « bindings » enregistrée, relue après rechargement de la page, réinitialisation ; clavier supposé AZERTY avec un navigateur en fr-FR, puis corrigé en QWERTY à la première frappe
- Bout en bout, tactile (émulation mobile, doigts envoyés par Input.dispatchTouchEvent) : trois doigts simultanés (joystick à fond = course, regard, Action), relâchements indépendants, joystick flottant, « Viser » à bascule, 12 boutons, libellé contextuel automatique et imposé, barre d'objets, véhicule (pédales analogiques, volant, 7 boutons), drone (6 boutons), modal, portrait, bascule clavier ↔ doigt, les événements de souris fabriqués après un toucher ne changent pas le périphérique
- Contrôle dans le DOM réel, pour pied / véhicule / drone en 844×390, 1180×820 et 667×375 : aucun chevauchement, rien hors écran, aucun texte qui déborde de son bouton
- Captures regardées avec Read : input-touch-pied-844x390, input-touch-pied-contexte-844x390, input-touch-vehicule-844x390, input-touch-drone-844x390, input-touch-pied-1180x820, input-touch-vehicule-1180x820, input-touch-drone-1180x820, input-touch-pied-667x375, input-touch-portrait-390x844 (dans tests/e2e/out/). Corrigé après examen : textes des pastilles trop larges, compteur d'objet qui chevauchait le nom, pommeau du volant qui dépassait de la piste, commandes visibles sous le message portrait
- Vérification ponctuelle (fichier de test temporaire, supprimé ensuite) : module branché dans le vrai moteur par createTestContext en headless — front vu une fois sur 1 s de simulation, lookX rendu une fois, réaffectation persistée par le vrai ctx.save
- docs/research relu avant de finir : 00 à 06 présents ; seul 05 (ligne « Trois supports ») concerne les entrées

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/input/index.ts
- /home/user/SafeDeal/crs-simulation/src/input/api.ts
- /home/user/SafeDeal/crs-simulation/src/input/system.ts
- /home/user/SafeDeal/crs-simulation/src/input/core.ts
- /home/user/SafeDeal/crs-simulation/src/input/edges.ts
- /home/user/SafeDeal/crs-simulation/src/input/axes.ts
- /home/user/SafeDeal/crs-simulation/src/input/merge.ts
- /home/user/SafeDeal/crs-simulation/src/input/buttons.ts
- /home/user/SafeDeal/crs-simulation/src/input/bindings.ts
- /home/user/SafeDeal/crs-simulation/src/input/labels.ts
- /home/user/SafeDeal/crs-simulation/src/input/kbm.ts
- /home/user/SafeDeal/crs-simulation/src/input/gamepad.ts
- /home/user/SafeDeal/crs-simulation/src/input/script.ts
- /home/user/SafeDeal/crs-simulation/src/input/touch/controller.ts
- /home/user/SafeDeal/crs-simulation/src/input/touch/overlay.ts
- /home/user/SafeDeal/crs-simulation/src/input/touch/layouts.ts
- /home/user/SafeDeal/crs-simulation/src/input/touch/style.ts
- /home/user/SafeDeal/crs-simulation/src/input/dev/fakeContext.ts
- /home/user/SafeDeal/crs-simulation/harness/input.html
- /home/user/SafeDeal/crs-simulation/harness/input.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/input.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/input.axes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.edges.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.merge.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.bindings.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.labels.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.system.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.touch-layout.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/input.perf.test.ts
