# Compte rendu — interface:cartes-commandement

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Les CARTES (src/ui/maps) et le COMMANDEMENT (src/ui/command) sont écrits, branchés dans le vrai socle de l'interface et vérifiés : 231 vérifications e2e réussies (0 erreur de page), 78 tests unitaires, « npx tsc --noEmit » sans erreur dans mes fichiers (aussi avec noUnusedLocals). contracts.ts et extensions.ts n'ont pas été touchés.

CE QUI EXISTE
- Fond de carte commun : utilise le service 'world.map2d' s'il existe, sinon un repli lisible dessiné d'après ctx.world (rues par classe avec niveaux de détail, ponts, lieux, noms de rues et de places, occupation du sol par tuiles tirées de surfaceAt). Le fond est mis en cache hors écran et n'est redessiné que quand la vue sort de sa marge ; les couches dynamiques sont rafraîchies à 5–10 Hz (unités 5 Hz, foule et gaz 2 Hz).
- Couches : unités avec symboles normalisés (regroupement dynamique section/groupe selon le zoom), densité de foule colorée par la tension, gaz et feux ('hazards.field'), incidents, rues fermées, stations de métro, parcours déclaré et tête de cortège, vent, objectifs, itinéraire GPS.
- Mini-carte du HUD (orientée par le regard, zoom à pied / en véhicule / rapide, itinéraire par findPath, clic = plan) ; écran 'carte' : déplacement, zoom molette / pincement / gâchettes, recherche de lieu sans accents, repère GPS (clic droit, appui long, bouton X).
- Écran 'carte_tactique' non bloquant, option « Temps ralenti » (×0,25, rétabli à la fermeture) : arbre des unités avec effectifs et état, sélection simple / multiple / au cadre / par la liste, ordres au geste (point ; segment → barrage en ligne avec centre, cap et largeur ; cercle → nasse avec issue obligatoire), palette des 20 verbes en français, envoi par ctx.squads.issue, tracé affiché jusqu'à l'exécution, compte rendu radio en phraséologie. Cadre légal, « Sommation suivante », force autorisée 0–4 (ctx.law.authorize) ou demande d'autorisation, refus motivé des ordres au-dessus de la force licite. Fermeture d'une rue ou d'un périmètre, stations de métro (fermer, rouvrir, filtrer), incidents triés avec délégation par glisser-déposer ou menu, appel des secours avec suivi d'arrivée, journal radio.
- Étendue du commandement selon le rôle et le grade : commissaire / commandant = tout ; chef de section ou de groupe = son unité ; autres policiers = lecture seule ; manifestant et journaliste ne voient jamais les positions de police (matrice de visibilité par rôle).
- Roue d'ordres rapide 'roue_ordres' (10 secteurs, maintien-relâchement ou appui bref, vise aimX/aimZ ou la personne visée), panneau 'radio' (filtre par canal, messages rapides, demande de secours), éléments de HUD « mon unité » et « incident confié » (distance et direction).
- Trois supports : souris/clavier ; manette (curseur au stick, gâchettes pour le zoom, A = pointeur, X = menu radial, LB/RB = zones, B = retour) ; tactile (panneaux en tiroirs sur téléphone, cibles ≥ 44 px, zones sûres, mini-carte qui s'écarte des boutons tactiles Radio/Ordres).

RÉSERVES PRINCIPALES (détail dans notDone)
- Le service 'world.map2d' réel n'existait pas pendant le travail : seul mon repli a été exercé.
- Les ordres n'ont été vus exécutés que par la fausse IA du banc d'essai (déplacement en ligne droite) ; l'intégration avec la vraie IA de police n'a pas été testée.
- Aucun essai sur appareil réel : manette et tactile sont simulés (navigator.getGamepads surchargé, événements tactiles CDP).
- Deux erreurs tsc subsistent dans le dépôt, hors de mes fichiers (src/sim/traffic/cars.ts : modules './car-think' et './parking' introuvables, travail en cours d'un autre module).

## API publique et mode d'emploi

BRANCHEMENT
- Rien à faire si la racine de composition ajoute déjà le module d'interface : src/ui/index.ts agrège « ./maps/index.ts » et « ./command/index.ts » par import.meta.glob (game.addModule(ui) suffit).
- Branchement direct possible : import { createSystems as maps } from '@/ui/maps'; import { createSystems as command } from '@/ui/command'; game.addModule(maps); game.addModule(command); — APRÈS le socle de l'interface (qui fournit EXT.uiKit). Systèmes : 'ui:maps' et 'ui:command', ordre SystemOrder.UI + 10. Sans EXT.uiKit ou en mode headless, aucun écran ni élément de HUD n'est enregistré, sans erreur.

SERVICES FOURNIS
- 'ui.maps' → MapsApi (src/ui/maps/api.ts) : waypoint, setWaypoint(x, z, label?), clearWaypoint(), target (repère du joueur, sinon objectif suivi, sinon incident confié), route [x0, z0, x1, z1…], distance (m, −1 sans cible).
- 'world.map2d' → Map2dService, SEULEMENT si aucun module ne l'a déjà fourni et hors headless : draw(g, centerX, centerZ, metersPerPixel, rotation, options?) + revision?. C'est le repli dessiné d'après ctx.world ; il expose aussi render(canvas, { x, z, radius }) pour le mini-plan de la page d'accueil.
- 'ui.command' → CommandApi (src/ui/command/api.ts) : scope() → CommandScope { level: 'tout' | 'unite' | 'lecture', squadIds, ownSquadId, canAuthorize, canSommation, canTraffic, canMetro, canDelegate, label } ; issued (50 derniers ordres donnés par l'interface : squadId, type, x, z, heading, width, targetId, maxForce, t) ; orderForce (plafond de force appliqué aux ordres).

SERVICES CONSOMMÉS (tous facultatifs sauf le contrat de base ; absent = élément masqué, jamais d'erreur)
- Contrat : ctx.world (edges, places, surfaceAt, findPath), ctx.squads (list, get, issue), ctx.law (roe, authorize, sommation), ctx.agents, ctx.vehicles, ctx.player, ctx.input, ctx.clock (timeScale), ctx.radio, ctx.events ('player:possessed', 'session:started', radio).
- EXT.uiKit 'ui.kit' (registerScreen, addHudWidget, keyLabel), EXT.objectives 'ui.objectives', EXT.incidents (liste, assignation, playerIncidentId), EXT.traffic 'traffic.control' (closeRoad, closeArea, reopen, closures), EXT.metro 'crowd.metro' (stations, setOpen, setFiltered), EXT.rescue 'rescue.dispatch' (appels, suivi d'arrivée).
- Clés libres : 'world.map2d' (fond de carte du monde s'il existe), 'hazards.field' (champ de gaz et feux).

ÉCRANS ENREGISTRÉS
- 'carte' { modal, pauses: true, hidesHud: true } — ctx.ui.open('carte', { x?, z?, mpp?, search? }) ; touche « map ».
- 'carte_tactique' { modal, pauses: false, hidesHud: true } — ctx.ui.open('carte_tactique', { x?, z?, mpp?, incidentId?, squadId?, tab?: 'ordres' | 'incidents' | 'circulation' | 'journal' }) ; touche « tactical ».
- 'roue_ordres' et 'radio' { modal, pauses: false, hidesHud: false } — touches « orders » et « radio » (table HOTKEY_SCREENS du socle) ; ces deux écrans se referment eux-mêmes.

ÉLÉMENTS DE HUD
- 'maps.minimap' (zone 'top-left'), 'command.unit' et 'command.incident' (zone 'top').

AJOUTER UN ÉCRAN OU UN ÉLÉMENT DE HUD DEPUIS UN AUTRE MODULE
- Passer par le socle, pas par mes modules : const kit = ctx.service<UiKit>(EXT.uiKit); kit.registerScreen(id, { modal, pauses, hidesHud }, (host, data) => instance) où instance = { update(dt, input), back(), dispose() } ; kit.addHudWidget(id, zone, widget). Poser data-autofocus sur l'élément à focaliser à l'ouverture ; le socle envoie 'ui:nav', 'ui:back' et 'ui:tab' sur l'hôte de l'écran.
- Pour faire suivre un point par le GPS et la mini-carte : ctx.service<MapsApi>('ui.maps')?.setWaypoint(x, z, 'libellé'), ou suivre un objectif via EXT.objectives, ou confier un incident (IncidentsApi.playerIncidentId).
- Pour ouvrir la carte tactique sur un fait : ctx.ui.open('carte_tactique', { incidentId }) ou { squadId, tab: 'ordres' }.
- Un module du monde qui publie 'world.map2d' AVANT l'init de 'ui:maps' remplace automatiquement le repli sur toutes les cartes.

BANC D'ESSAI
- harness/command.html — paramètres : role, map=paris|test|none, place, open, absent=incidents,traffic,metro,rescue,hazards, crowd, vehicle=1, touch=1, freeze=1, ai=0, seed, kit=core (vrai socle). Expose window.__cmd { game, ctx, ui, scenario, maps, mapsSystem, command, tactical(), plan(), script, perf() } et window.__ready.

## Non fait / fragile

- Service 'world.map2d' réel jamais exercé : il n'existait pas pendant le travail. Seul mon repli a tourné, et seulement avec rotation = 0 (la mini-carte tourne par transformation CSS). Si le monde publie une signature différente, il faudra un adaptateur.
- Exécution des ordres vue uniquement avec la fausse IA du banc (déplacement en ligne droite, cascade compagnie → sections → groupes). L'intégration avec la vraie IA de police (src/sim/police, en cours chez un autre module) n'a pas été testée.
- « Ordre affiché jusqu'à son exécution » repose sur une heuristique de distance à la cible (rayon d'arrivée) : le contrat n'a ni événement de fin d'ordre ni statut sur SquadOrder.
- Aucun essai sur appareil réel : manette simulée en surchargeant navigator.getGamepads, tactile simulé par CDP. Pas de test sur vrai téléphone, vraie tablette ni vraie manette.
- Fond de carte de repli : l'occupation du sol est un raster tiré de surfaceAt (1 m, ou 2 m en tactile et qualité basse), donc flou à fort zoom ; pas d'emprises vectorielles de bâtiments faute de données dans le contrat.
- La carte tactique est nord en haut uniquement (pas de rotation). Les manifestants ne sont pas dessinés un par un : densité seulement.
- Force : un seul niveau autorisé global (ctx.law) plus un plafond personnel appliqué aux ordres ; pas de force par unité.
- Choix à confirmer : le plan de Paris ('carte') met la simulation en pause ; la carte tactique, la roue et la radio ne la mettent pas.
- Liaisons manette par défaut du module d'entrées : B12 sert à la fois à « radio » et « ui_up », B15 à « orders » et « ui_right », et il n'y a pas de liaison manette pour « tactical ». La carte tactique s'ouvre donc à la manette par le bouton du HUD, pas par une touche dédiée.
- Fichiers au-delà d'environ 600 lines : src/ui/command/dev/fakeScenario.ts (660, code de banc d'essai) et tests/e2e/command.mjs (1297). tacticalMap.ts (579) et tacticalScreen.ts (573) ont été découpés.
- Les durées du test e2e sont sensibles à la charge de la machine (attentes par condition, mais environ 5 minutes pour la suite entière).
- Sommations : le cœur (isAuthority) accepte le commandant d'unité ; j'ai suivi le cœur, alors que la bible de réalisme (E.4) réserve la sommation à l'autorité civile habilitée. À trancher.
- Rien n'a été commité (non demandé). Le fichier temporaire tests/e2e/command-probe.mjs, que j'avais créé puis qui s'était retrouvé suivi par git, est supprimé dans l'arbre de travail.

## Demandes d'évolution du contrat

- extensions.ts : formaliser 'world.map2d' — draw(g, centerX, centerZ, metersPerPixel, rotation, options?) avec revision?, et/ou render(canvas, { x, z, radius }) — pour que le monde et l'interface partagent une seule signature (aujourd'hui décrite dans src/ui/maps/api.ts et src/ui/core/api.ts).
- extensions.ts : formaliser 'hazards.field' (lecture du champ de gaz et de la liste des feux pour la carte) ; je le lis aujourd'hui par une forme tolérée.
- contracts.ts : ajouter 'roue_ordres' et 'radio' à ScreenId (ils sont déjà dans HOTKEY_SCREENS du socle).
- contracts.ts : un événement de fin d'ordre (par exemple 'squad:order_done' { squadId, type, success }) ou un statut sur SquadOrder, pour afficher l'exécution réelle au lieu d'une heuristique de distance.
- contracts.ts : plafond de force par unité (SquadOrder.maxForce existe ; il manque un niveau autorisé par unité côté LawApi) si l'on veut autoriser le gaz à une section seulement.
- contracts.ts : PlaceInfo.importance (ou rang) pour hiérarchiser les noms de lieux et les résultats de recherche.
- Clarifier qui peut prononcer les sommations : le cœur accepte poste === 'commandant_unite', la bible de réalisme (E.4) parle de l'autorité civile habilitée.
- Module d'entrées : lever les doublons manette B12 (radio / ui_up) et B15 (orders / ui_right) et ajouter une liaison manette pour « tactical ».
- extensions.ts : MetroStation.arrived et inflow en entiers (ou préciser l'unité) ; je les arrondis à l'affichage.

## Vérifications exécutées

- npx tsc --noEmit : aucune erreur dans src/ui/maps, src/ui/command, harness/command.ts ni dans mes tests ; contrôle supplémentaire avec noUnusedLocals : aucune erreur dans mes fichiers. Les 2 erreurs restantes du dépôt sont dans src/sim/traffic/cars.ts (pas à moi).
- npx vitest run tests/unit/ui-command tests/unit/ui-maps : 78 tests réussis dans 7 fichiers (conversion écran↔monde et zoom, ligne tracée → ordre avec centre/cap/largeur, découpage d'une ligne entre unités, nasse, agrégation de densité, recherche de lieu, gestes, filtrage par grade et par rôle, tri des incidents, phraséologie radio).
- node tests/e2e/command.mjs : 231 vérifications réussies, 0 échec, 0 erreur de page, relancé en entier après le dernier changement (sections bureau, rôles, plan, manette, tactile, dégradé, socle).
- Scénario automatisé : un trait tracé sur la carte tactique produit dans ctx.squads un ordre de type ligne dont x, z, heading et width correspondent au segment ; point → avancer, cercle → nasse (largeur = diamètre, cap = issue), cible → interpeller ; vérifié à la souris, au doigt (CDP) et à la manette simulée.
- Étendue du commandement vérifiée par rôle : commandant et commissaire commandent tout ; le chef de groupe ne peut ordonner qu'à son groupe ; le CRS de base est en lecture seule ; manifestant et journaliste n'ont aucune unité de police sur la carte ni dans la liste.
- Force et cadre légal : ctx.law.authorize appelé par les boutons 0–4, ordre refusé avec message quand le verbe dépasse la force autorisée, bouton « Sommation suivante » présent pour l'autorité et absent pour le chef de groupe.
- Circulation, métro, incidents, secours : fermeture d'une rue et d'un périmètre, réouverture, fermeture et filtrage d'une station, délégation d'un incident par menu et par glisser-déposer, appel des secours avec suivi — vérifiés contre les faux services étendus du banc.
- Services absents (absent=incidents,traffic,metro,rescue,hazards) et monde neutre (map=none) : les éléments correspondants sont masqués, aucun message d'erreur, aucune exception.
- Intégration dans le VRAI socle (kit=core, import de '@/ui') : écrans et éléments de HUD enregistrés, touches Tab / M / T / F, Échap, sémantique de pause (plan = pause, carte tactique = temps réel), zones de focus à la manette, absence de recouvrement avec les commandes tactiles sur 844×390.
- Captures produites aux trois tailles (1280×720, 844×390, 1180×820) dans tests/e2e/out/command-*.png et REGARDÉES : carte tactique (ordres, incidents, circulation, métro, nasse, tracé de ligne, radial, tiroirs du téléphone), plan et recherche, HUD, roue d'ordres, radio, captures avec le vrai socle. Défauts vus et corrigés en cours de route (symboles superposés, libellé de mini-carte sous les boutons tactiles, tiroir du téléphone translucide).
- Performance mesurée par le banc : mini-carte = 30 images de rotation → 29 écritures de transformation et 6 dessins du canevas ; carte tactique = 0,27 ms d'interface par image en moyenne, 2 dessins complets du fond pour 42 dessins de la carte ; plan = dessin complet du fond 30 ms au plus (3 dessins) puis simple recopie. Mesures faites en rendu logiciel sur une machine chargée.
- Typographie française contrôlée dans les libellés (accents, espaces insécables avant « : ; ? ! » et dans les unités, guillemets français, apostrophes typographiques) ; aucun TODO ni fonction vide dans mes fichiers.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/ui/maps/index.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/api.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/transform.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/visibility.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/density.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/units.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/scene.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/surfaces.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/basemap.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/basemap-labels.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/basecache.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/symbols.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/overlay.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/overlay-units.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/gps.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/search.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/gestures.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/icons.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/runtime.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/style.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/mapCanvas.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/minimap.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/widgets.ts
- /home/user/SafeDeal/crs-simulation/src/ui/maps/planScreen.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/index.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/api.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/scope.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/orders.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/phrases.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/incidents.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/core.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/wheel.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/style.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalState.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalMap.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalActions.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalPreview.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalPop.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/tacticalScreen.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/panelUnits.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/panelOrders.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/panelIncidents.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/panelTraffic.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/radioLog.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/orderWheel.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/radioScreen.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/hud.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/dev/localKit.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/dev/fakeServices.ts
- /home/user/SafeDeal/crs-simulation/src/ui/command/dev/fakeScenario.ts
- /home/user/SafeDeal/crs-simulation/harness/command.html
- /home/user/SafeDeal/crs-simulation/harness/command.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/command.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-maps.transform.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-maps.density.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-maps.search.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-maps.gestes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-command.ordres.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-command.incidents.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui-command.portee.test.ts
