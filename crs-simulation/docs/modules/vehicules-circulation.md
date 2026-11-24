# Compte rendu — véhicules:circulation

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module CIRCULATION écrit, exécuté et testé (src/sim/traffic, 20 fichiers, 6 474 lignes avec le banc d'essai ; 8 fichiers de tests, 36 tests verts). Ordre SystemOrder.CONTROL + 20, id 'sim:traffic'.

Principe retenu après lecture du module des véhicules : le PILOTE AUTOMATIQUE conduit (ctx.service('vehicles.autopilot'), jamais importé), mon module RÉGULE. « Rouler » = driveTo(destination), « tenir » = driveTo(point d'arrêt, {stopBefore}), « se ranger » = driveTo(point hors axe), se garer = autopilot.park. Mon itinéraire est la même polyligne que celle du pilote (world.findPath appelé avec les mêmes arguments juste avant driveTo), sur laquelle je pose des points de contrôle (lignes de feu, carrefours, entrées de rue fermée).

Ce qui est fait :
1) Trafic civil autour du joueur : voitures, taxis, utilitaires, bus, scooters avec conducteur ('conducteur'), apparition à distance hors champ, disparition hors de vue, densité selon l'heure (ctx.env), la météo, le type de voie et settings.crowdScale. Feux tricolores : cycle par carrefour, fonction pure de l'horloge de session (deux phases + orange + rouge intégral, carrefours voisins regroupés, feux de passage piéton en section courante). Priorités aux carrefours sans feux par réservation (compatibilité des mouvements, premier arrivé premier servi). Distances de sécurité (capteur du pilote). Stationnement : véhicules garés déterministes le long des rues, et automobilistes qui se garent puis partent à pied.
2) Réactions : arrêt devant foule/obstacle/barrage, klaxons, demi-tour ou déviation, bouchon qui remonte (événement 'traffic:jam'), cession du passage aux sirènes (se ranger, feu forcé au vert, carrefour réservé), automobiliste pris dans l'émeute (peur, fuite ou abandon du véhicule), incident 'automobiliste_bloque' via EXT.incidents s'il existe.
3) Fermetures : EXT.traffic publié avec TrafficControlApi exactement (closures, isClosed, closeRoad, closeArea, open, openAll, countNear). Barrières Vauban posées progressivement en travers (ctx.props.spawn), barrage tenu par une unité (squadId, ordre couper_circulation), les civils n'entrent plus, les engagés sortent par une barrière ouverte, itinéraires recalculés, véhicules prioritaires laissés passer, compte rendu radio.
4) Piétons civils (passants, touristes, commerçants) : marche sur la ligne de trottoir, contournement des angles, traversées avec attente au feu et contrôle des véhicules, terrasses, vitrines ; réactions (s'écarter d'un cortège, regarder, filmer, fuir gaz et détonations, refuge en bouche de métro ou rue latérale) ; densité selon heure, météo, quartier ; effacement quand la manifestation occupe la rue ; person.cmd écrit avec réflexion étalée.
5) Remise à zéro par session ; options de départ lues dans ctx.session.config.extra.

Limites à connaître (détail dans notDone) : il reste des contacts à basse vitesse entre véhicules en trafic dense ou sur d'autres graines (0 à 2 par dix minutes ; 1 dans le scénario de performance à 117 véhicules, 1 dans le quartier d'essai du vrai module du monde) et jusqu'à 5 contacts avec le décor sur la vraie carte de Paris ; sans module de véhicules il n'y a pas de trafic roulant ; le module n'est pas branché dans src/main.ts (fichier qui ne m'appartient pas, la ligne d'import y est en commentaire) ; aucun essai en navigateur. Aucun commit n'a été fait. contracts.ts et extensions.ts n'ont pas été touchés.

## API publique et mode d'emploi

BRANCHEMENT
  import { createSystems as simTraffic } from '@/sim/traffic';   // rend [TrafficSystem]
  Système id 'sim:traffic' (TRAFFIC_SYSTEM_ID), ordre SystemOrder.CONTROL + 20. À enregistrer après le module des véhicules (il doit avoir publié 'vehicles.autopilot' avant mon init ; sinon pas de trafic roulant, le reste fonctionne). Dans src/main.ts la ligne d'import existe en commentaire : c'est à l'assembleur de l'activer.
  Types publics : src/sim/traffic/api.ts (à importer en « import type »).

SERVICES PUBLIÉS
  ctx.service<TrafficControlApi>(EXT.traffic)  — interface de extensions.ts implémentée telle quelle :
    closures (tableau vivant de RoadClosure), isClosed(edgeId), closeRoad(x, z, byId, squadId?) -> RoadClosure | null, closeArea(x, z, radius, byId) -> RoadClosure[], open(id), openAll(), countNear(x, z, radius) -> {moving, stopped}.
    ATTENTION : countNear rend un objet RÉUTILISÉ (zéro allocation) ; le copier si on veut le garder.
    closeRoad ferme tout le tronçon entre deux carrefours (toutes les arêtes de la chaîne répondent true à isClosed) ; le point de barrage est ramené à au moins max(9 m, rayon du carrefour + 7 m) d'un carrefour. Les barrières sont posées progressivement (tuning.barrierDelay 5 s puis barrierTime 30 s ; 4 barrières pour 10 m de chaussée). La rue est interdite aux civils dès l'appel.
    Avec squadId : l'unité reçoit l'ordre 'couper_circulation' au point de barrage (à confirmer côté module police).
    Radio : via le service 'radio.phrases' s'il existe (clés rue_fermee, rue_rouverte, perimetre_ferme), sinon ctx.radio.say.
  ctx.service<TrafficApi>('traffic')  (TRAFFIC_SERVICE) :
    tuning (TrafficTuning modifiable à chaud : ambient, densités/plafonds véhicules, garés, piétons, rayons d'apparition/disparition, signals, greenMain 26, greenCross 18, amber 3, allRed 2, barrierDelay, barrierTime, patience 18, parkShare 0.18, panic, incidents, radio), stats (TrafficStats, compteurs en place),
    signal(nodeId, heading) -> 'vert'|'orange'|'rouge'|'aucun', signalAhead(x, z, heading, range?), pedestrianGreen(nodeId, streetHeading) — pour le rendu des feux et les autres IA,
    spawnVehicle(kind, x, z, heading, destX, destZ), spawnParked(...), spawnPedestrian(kind, x, z) — pour missions et tests,
    motorist(v) -> MotoristStatus | null ({mode 'route'|'arret'|'range'|'stationne'|'fuite', cause BlockCause, blockedFor, fear, incidentId}), isTraffic(v), isParked(v), isPedestrian(p), clearAmbient().

SERVICES CONSOMMÉS (tous facultatifs, repli neutre) : 'vehicles.autopilot' et le service d'extension des véhicules, ctx.world (node, edge, nearestRoad, findPath, surfaces), 'world.data' (drapeau tunnel), EXT.incidents (open/close 'automobiliste_bloque'), EXT.metro (bouches ouvertes pour le refuge), 'radio.phrases', ctx.props, ctx.hazards (gaz), ctx.crowd, ctx.env, ctx.settings.crowdScale, ctx.radio.
Événements écoutés : session:started, explosion, projectile:impact, fire:started, person:down, person:removed, vehicle:removed, vehicle:state (sirènes), sfx (détonations).

ÉVÉNEMENTS ÉMIS (libres, ctx.events.onAny — ils ne sont pas dans GameEvents) :
  'traffic:closed' / 'traffic:barred' / 'traffic:opened'  ClosureEvent {id, edgeId, x, z, heading, squadId, byId}
  'traffic:gate'      GateEvent {id, open, vehicleId}
  'traffic:motorist'  MotoristEvent {vehicleId, personId, state 'bloque'|'libere'|'fuite'|'abandon'|'demi_tour'|'gare', x, z}
  'traffic:jam'       JamEvent {x, z, vehicles, state 'forme'|'resorbe'} (au moins 4 véhicules immobilisés ; un seul bouchon suivi à la fois)
  Événements typés émis : 'person:fled', 'prop:moved' (barrière ouverte/refermée).

CLÉS LUES DANS SessionConfig.extra (toutes facultatives) :
  options.circulation 'coupee' : périmètre de 350 m fermé dès le départ, barrières déjà en place (l'interface appelle aussi closeArea : sans effet double) ;
  traffic.none (boolean), traffic.vehicles / traffic.parked / traffic.pedestrians (multiplicateurs, 0 = aucun), traffic.closed ({x, z}[]), traffic.closedArea ({x, z, radius}), traffic.signals (false = feux éteints).

CONVENTIONS À CONNAÎTRE
  - Vehicle.brain porte la fiche opaque d'un véhicule de la circulation tant qu'un automobiliste le conduit ; un véhicule garé a brain === null, moteur coupé, verrouillé, et n'appartient plus au module dès qu'on y touche (déplacé, endommagé, incendié, occupé). Person.brain porte la fiche d'un piéton civil.
  - Un véhicule tenu à l'arrêt reste « en prise » avec le pilote (autopilot.follow sur son propre conducteur) pour que la règle de priorité du pilote le voie comme véhicule en attente et non comme obstacle fixe.
  - Les destinations et points d'arrêt sont décalés de 0,2 m hors de l'axe (findPath fusionne les points à moins de 0,05 m, ce qui faisait perdre l'arrivée dans la voie).
  - Lignes d'arrêt à 7 m du bord du carrefour, 16 m du centre sur les rues étroites à double sens (< 10,5 m), à cause du déport du pilote en virage.
  - Une barrière ouverte pour un véhicule engagé ou prioritaire est déplacée sur le trottoir avec blocksMove = false, puis remise.
  - Véhicules prioritaires (police, secours, sirène) : jamais arrêtés par une fermeture ; feu forcé au vert et carrefour réservé 90 m devant eux.

BANC D'ESSAI (src/sim/traffic/testkit.ts, réutilisable par les autres modules) : createRoadWorld(nodes, edges, boxes), createTown({cols, rows, spacing, stub, width, sidewalk, signals, buildings}), createGasHazards(base), createTrafficBench({world, modules, seed, session, setup, ambient}), runUntil.

## Mesures

Coût par pas (117 véhicules, 200 piétons, pas de 1/30 s, temps processeur, machine très chargée : référence 10 M sin·cos = 1 391 à 1 459 ms) : module de circulation 0,208 à 0,359 ms (objectif < 2 ms), pire pas 8 à 10 ms, tous modules 0,96 à 1,29 ms ; 1 438 calculs d'itinéraire ; tas -1,0 à +7,7 Mo sur 40 s simulées. Paris (17 264 nœuds, 20 082 arêtes) : 0,27 à 0,41 ms par pas pour 29 véhicules, 34 piétons, 60 garés. 5 min d'ambiance : 0 accrochage, 0 piéton heurté, 0 feu grillé, distance minimale 2,89 m, 78 % du temps en mouvement, 0,26 à 0,28 ms par pas tous modules. Feu rouge : arrêt à 0,56 m avant la ligne, intervalle 2,01 m. Déviation 102 s contre 53 s en direct. Bouchon : 9 arrêtés, résorbé 12 s après réouverture. Gaz : évacuation en 9,1 s. Piétons sur chaussée hors traversée : 0,00 % (factice), 0,1 à 1,3 % (quartier d'essai), 3,4 à 4,3 % (Paris). Taille : 20 fichiers source, 6 474 lignes ; 8 fichiers de tests, 2 232 lignes ; 36 tests.

## Non fait / fragile

- Collisions non éliminées partout : 0 dans le test de 5 minutes (graine 1), mais 1 accrochage dans le scénario de performance à 117 véhicules, 1 dans le quartier d'essai du vrai monde, 0 à 2 sur Paris selon l'exécution, et 0 à 2 contacts à basse vitesse (0,6 à 3 m/s) par dix minutes sur d'autres graines en essais exploratoires. Les tests de vrai monde tolèrent ces contacts (seuils), ils ne prouvent pas l'absence de collision
- Vraie carte de Paris : 0 à 5 contacts de véhicules avec le décor selon l'exécution, et 3,4 à 4,3 % du temps piéton sur la chaussée hors traversée (0,1 à 1,3 % dans le quartier d'essai, 0 % dans le monde factice) : trottoirs réels irréguliers
- Avenues de 16 m avec stationnement, essais exploratoires de 10 minutes : 2 à 3 contacts et des blocages de 311 à 479 s avant le nettoyage des véhicules coincés (retirés hors champ après 70/150 s, 180/300 s devant un obstacle ou un mur)
- Pire pas du module mesuré à 8 à 10 ms (pics isolés lors des recalculs d'itinéraires) alors que la moyenne est sous 0,4 ms ; non lissé
- Zéro allocation en boucle chaude : visé par construction (tampons réutilisés, tableaux typés) mais pas isolé rigoureusement ; seule mesure, le tas sur 40 s simulées varie de -1,0 à +7,7 Mo tous modules confondus. Les calculs d'itinéraire (world.findPath) allouent côté monde
- Machine très chargée pendant les mesures (charge de référence 10 M de sin·cos : environ 1 400 ms au lieu d'environ 200 ms) : les temps sont en temps processeur et probablement pessimistes, mais non revérifiés sur machine au repos
- Sans le module des véhicules (pilote automatique absent) : aucun trafic roulant ; stationnement, piétons et fermetures fonctionnent
- Non branché dans src/main.ts (fichier hors de mon périmètre, import présent en commentaire) ; aucun essai en navigateur, aucun rendu des feux (le service signal() existe mais personne ne colore les props 'feu_tricolore')
- Non testé avec les vrais modules police, foule, dangers, props, incidents, radio, métro, missions : seulement leurs implémentations neutres ou des faux de test. L'exécution de l'ordre 'couper_circulation' par une unité n'est pas vérifiée
- Les bus n'ont ni lignes ni arrêts (ils circulent comme les autres) ; pas de voies de bus, pas de dépassement entre civils, pas de changement de file
- Terrasses, vitrines et commerçants : codés et exercés dans les tests d'ambiance mais sans assertion dédiée
- Priorité aux carrefours sans feux : premier arrivé premier servi (pas de priorité à droite au sens strict), ce qui coupe les pelotons ; lignes d'arrêt reculées à 16 m du centre sur les rues étroites à double sens
- Un seul bouchon suivi à la fois pour l'événement 'traffic:jam' (barycentre global)
- closures.ts (601 lignes) et graph.ts (628 lignes) dépassent légèrement le repère de 600 lignes
- Aucun commit fait (non demandé). Le fichier temporaire tests/unit/traffic.explore.test.ts, enregistré par un commit automatique antérieur, est supprimé dans l'arbre de travail

## Demandes d'évolution du contrat

- RoadEdgeInfo : exposer les drapeaux tunnel et pont (aujourd'hui lus par le service 'world.data', absent du contrat)
- WorldApi.findPath : option pour exclure des arêtes (rues fermées) et retour des identifiants de nœuds/arêtes ; faute de quoi je fais mon propre plus court chemin et je passe par un point intermédiaire
- Pilote automatique (module véhicules) : une vraie commande « tenir à ce point » ; conserver l'arrivée dans la voie quand la destination est sur l'axe (findPath fusionne les points à moins de 0,05 m) ; règle de priorité qui tienne compte des véhicules arrêtés inactifs ; décalage de voie doublé sur le premier segment quand on replanifie depuis la voie ; demi-tour déclenché à l'intérieur d'un carrefour ; déport de 2 à 4 m en virage
- Capteur du pilote : les props sont vus comme des disques de rayon 1,25 m (une barrière ouverte bloque encore) et la détection de rue fermée est non directionnelle à 6 m du trajet
- PropApi : méthode pour déplacer/ouvrir un prop (pose et blocksMove) ; aujourd'hui j'écris prop.x/z/heading/blocksMove et j'émets 'prop:moved'
- GameEvents : ajouter les événements typés traffic:closed, traffic:barred, traffic:opened, traffic:gate, traffic:motorist, traffic:jam (émis en événements libres)
- TrafficControlApi.countNear : documenter que l'objet rendu est réutilisé, ou ajouter un paramètre de sortie
- Clé EXT pour le service 'traffic' (TrafficApi) afin que le rendu colore les feux tricolores via signal(nodeId, heading)
- PersonCommand : intention de posture (s'asseoir en terrasse) ; aujourd'hui Person.posture est écrit directement
- Fermeture de départ 'coupee' : l'interface appelle closeArea à la première image et mon module le fait aussi depuis extra.options.circulation (sans effet double) ; désigner un seul responsable
- Ordre d'escouade 'couper_circulation' : confirmer avec le module police le format attendu quand closeRoad reçoit un squadId

## Vérifications exécutées

- npx vitest run tests/unit/traffic. : 8 fichiers, 36 tests verts, relancé trois fois de suite après le dernier changement (18,7 s à 39,9 s selon la charge de la machine)
- npx tsc --noEmit : aucune erreur dans src/sim/traffic ni tests/unit/traffic.* (y compris avec --noUnusedLocals --noUnusedParameters, et --noUncheckedIndexedAccess pour src/sim/traffic). Les 2 erreurs restantes du projet sont dans src/gameplay/incidents (kernel.ts, think.ts), pas chez moi
- contracts.ts et extensions.ts non modifiés (git diff vide) ; aucun import d'un autre module hors « import type » depuis son api.ts ; aucun Math.random, console, TODO dans src/sim/traffic ; aucune dépendance installée
- Feu rouge (3 véhicules, avec le vrai module des véhicules) : rouge vu 25 s, pare-chocs le plus avancé à 0,56 m avant la ligne, intervalle minimal à l'arrêt 2,01 m, carrefour franchi 8,8 s après le vert
- Carrefour sans feux : deux véhicules présentés ensemble passent l'un après l'autre (20,8 s)
- 5 minutes simulées d'ambiance (ville factice 9 carrefours, feux, graine 1, modules véhicules + personnes) : 23 véhicules, 32 piétons, 149 apparitions, 94 disparitions, 0 accrochage, 0 piéton heurté, 0 feu rouge grillé, distance minimale entre véhicules 2,89 m, plus long arrêt 65 s, en mouvement 78 % du temps
- Fermeture : closeRoad / isClosed / open / openAll / closures, barrières posées en travers, radio, événements ; barrage tenu par une unité (ordre reçu) ; closeArea ferme chaque rue qui franchit le périmètre ; options de départ de session
- Déviation : l'automobiliste contourne la rue fermée et arrive (102 s par le détour, barrage jamais approché à moins de 60 m ; 53 s une fois rouvert)
- Bouchon : 9 véhicules arrêtés derrière un barrage sans issue, 3 incidents ouverts, événements ['forme', 'resorbe'] ; 12 s après la réouverture 9 en mouvement, 0 à l'arrêt
- Barrage : véhicule déjà engagé sorti en 10,1 s par la barrière ouverte, fourgon prioritaire passé sans descendre sous 5,5 m/s, barrière refermée ensuite
- Obstacle en travers : arrêt, 22 coups de klaxon, 3 demi-tours par un autre itinéraire
- Foule hostile : incident, peur, véhicule abandonné environ 1 s après l'arrêt, conducteur à 20 m huit secondes plus tard
- Sirène sur feu rouge : feu forcé au vert, carrefour franchi sans descendre sous 8,1 m/s, véhicule d'en face rangé à 2,8 m de l'axe ; sur avenue de 16 m, l'automobiliste rattrapé se range à 6,7 m de l'axe et se fait doubler
- Piétons (monde factice avec surfaces) : 64 présents, 0,00 % du temps sur la chaussée hors traversée, 3,7 % en traversée, 3,0 % en attente, 1,16 m/s, 4 traversées au carrefour à feux dont 0 au rouge
- Densité piétonne : 32 à 13 h par temps clair, 3 quand 150 manifestants occupent la rue ; effet de l'heure, de la météo et de crowdScale vérifié
- Gaz (dangers factices) : 9 piétons dans le nuage, zone évacuée en 9,1 s, pointe à 5,5 m/s ; détonation : 11 s'éloignent, 3 se réfugient dans une bouche de métro ouverte ; cortège : 7 badauds dont 2 filment, 12 s'en vont quand la tension monte
- Stationnement : 60 véhicules garés déterministes, voisins à 5,60 m au plus près, hors carrefours ; un automobiliste se gare en 17 s à 6,8 m de l'axe et part à pied
- Sans module de véhicules : pas de trafic roulant, aucun plantage ; remise à zéro entre deux sessions vérifiée
- Performances (117 véhicules, 200 piétons, pas de 1/30 s, 40 s simulées, temps processeur) : module de circulation 0,21 à 0,36 ms par pas selon l'exécution (objectif < 2 ms tenu), tous modules 0,96 à 1,29 ms
- Vrai module du monde, quartier d'essai (95 nœuds, 131 arêtes, 20 feux), 3 minutes : jusqu'à 66 véhicules, 32 piétons, 60 garés, 0 piéton heurté, closeArea(120 m) -> 6 fermetures, aucune exception
- Vraie carte de Paris, place de l'Opéra à 17 h (17 264 nœuds, 20 082 arêtes), 2 minutes : 29 véhicules, 34 piétons, 60 garés, 0 piéton heurté, closeArea(150 m) -> 16 fermetures, module 0,27 à 0,41 ms par pas (test ignoré si les données de Paris sont absentes)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/traffic/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/shared.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/graph.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/signals.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/closures.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/route.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/car-brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/cars.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/car-routing.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/car-think.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/car-watch.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/parking.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/ped-brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/peds.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/ped-nav.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/ped-react.ts
- /home/user/SafeDeal/crs-simulation/src/sim/traffic/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.graph.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.vehicles.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.closures.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.emergency.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.pedestrians.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.world.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/traffic.paris.test.ts
