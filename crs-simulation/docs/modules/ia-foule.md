# Compte rendu — ia:foule

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module FOULE écrit, exécuté et vérifié : /home/user/SafeDeal/crs-simulation/src/sim/crowd/ (29 fichiers, ≈ 8 700 lignes, sous-dossier radical/ non touché, laissé au développeur suivant) + 11 fichiers d'essais tests/unit/crowd.*.test.ts (33 essais, tous verts au dernier passage complet ; « npx tsc --noEmit » : 0 erreur sur tout le projet, 0 déclaration inutilisée dans mes fichiers).

Ce qui existe réellement (simulation pure : aucun DOM, aucun import Three.js, hasard uniquement par des branches de ctx.rng créées à 'session:started', temps par ctx.clock ; l'IA n'écrit que person.cmd et passe par ctx.actions / ctx.interactions ; jamais la personne du joueur) :
1. MISE EN PLACE à 'session:started' : effectif = crowdSize × settings.crowdScale, tension, volatilité, durée, clés extra ; PARCOURS déclaré (table de 8 parcours parisiens réels si le lieu de départ est à ≤ 260 m du premier arrêt, sinon trajet par findPath vers un lieu à 1–1,5 km, repli en ligne droite), publié dans ctx.director.route ; couloir de marche mesuré (largeur de chaussée + lancers de rayon, jamais dans un mur).
2. MÉTRO (EXT.metro, forme exacte du contrat) : découverte des stations, arrivées par vagues de 20–60 toutes les 20–40 s, renforts tardifs, setOpen (report de 70 % du flux vers les voisines avec délai, message radio, issues fermées), setFiltered (débit × 0,55), dispersion par les bouches ouvertes (person:fled, stats.dispersed).
3. COMPOSITION : via 'roles.spawn' / 'roles.causes' s'ils existent, sinon composition par défaut (9 causes fictives, 5 types de journée) et ctx.archetypes.spawn ; groupes d'affinité (familles avec enfants, amis, sections, noyaux) déclarés dans ctx.squads ('affinite', 'cortege').
4. CORTÈGE organisé : pré-cortège, carré de tête (porteurs de banderole côte à côte, service d'ordre), blocs par famille avec service d'ordre sur les flancs, camion sono (suivi par 'vehicles.autopilot' si présent), queue ; marche par emplacements sur une chaîne de blocs de 5 m (effet d'accordéon, arrêts, tampon derrière les forces, arrêt devant un barrage, étirement dans les rues étroites) ; director.headProgress.
5. COMPORTEMENT individuel (machine à états à réflexion échelonnée 0,3 / 0,55 / 1,1 s) : arriver, se rassembler, écouter, marcher, scander (crowd:chant), brandir, applaudir, filmer, s'asseoir, garder ses distances d'une ligne, sommations (départs par profil), gaz (se couvrir, sortir du nuage en s'écartant du point de chute, ne pas y retourner), charges (fuite 30–60 m puis regroupement), canon à eau, détonations, feux, blessé proche (cercle, appel aux secours), interpellation, nasse, fatigue, badauds.
6. ÉMOTIONS (ESIM) : table de stimuli justifié / non justifié, légitimité et cohésion par tronçon de 50 m, contagion par cellules de 5 m, panique de fuite, radicalisation réversible pacifique → militant → opportuniste → radical (person:radicalized + ctx.archetypes.equip), service d'ordre qui calme.
7. DIRECTEUR (ctx.director) : phases mises à l'échelle de la durée, tension globale et carte par cellules de 25 m, addTension (pondéré par la volatilité), 36 aléas tirés par la graine, crowd:phase / crowd:tension, fin (< 5 % présents ou temps écoulé), CrowdStats.
8. DENSITÉ : cellules de 2,5 m, alerte ≥ 4 p/m², danger ≥ 5 (écrasement via ctx.health.hurt), recherche d'issue.
9. EXTENSION : registre de contrôleurs de comportement par profil, service 'crowd.core' ; sans contrôleur, radical / pilleur / opportuniste se conduisent en militants agités.

Dernières corrections de cette fin de session : fuite du gaz radiale (tous s'écartent du même point au lieu de se croiser), attente hors du nuage avant de regagner sa place, recul de 10–25 m une fois sorti, peur à la première bouffée même sans tir vu (GAS_SCARE) ; fichier d'exploration temporaire tests/unit/crowd.explore.test.ts supprimé ; behavior.ts ramené à 557 lignes (flânerie et badauds déplacés dans manners.ts).

Je n'ai rien validé dans git (non demandé) et n'ai modifié ni src/core/contracts.ts ni src/core/extensions.ts. Les autres fichiers modifiés que montre « git status » (police, circulation, monuments, src/core/session.ts…) ne sont pas de mon fait.

## API publique et mode d'emploi

BRANCHEMENT (racine de composition)
  import { createSystems as crowd } from '@/sim/crowd';   game.addModule(crowd);
  Variante essais : createCrowdSystems() → { systems, core } ; trousse d'essai '@/sim/crowd/testkit' : createCrowdTest({ seed, modules, systems }) → TestContext + core, protesters(), run(secondes), costPerStep(), bestCost(fenêtre) ; demoConfig(partiel).
  Deux systèmes sur un même cœur : 'sim:crowd.control' (SystemOrder.CONTROL = 200 : arrivées, cortège, réflexion et conduite) et 'sim:crowd.director' (SystemOrder.RULES = 800 : émotions, densité, phases, tension, aléas, statistiques). La manifestation se met en place à 'session:started' d'après ctx.session.config ; rien ne tourne si extra['crowd.none'] est vrai.

SERVICES FOURNIS
  1. ctx.director — DirectorApi du contrat, forme exacte : phase, tension, tensionAt(x,z), addTension(amount,x,z,reason), stats (CrowdStats), route [x0,z0,x1,z1,…], headProgress (m).
  2. ctx.service<MetroApi>(EXT.metro) — forme exacte d'extensions.ts : stations, get(id), nearest(x,z,radius), setOpen(id,open,byId), setFiltered(id,filtered,squadId).
  3. ctx.service<CrowdCoreApi>('crowd.core') (constante CROWD_CORE) — types dans src/sim/crowd/api.ts :
     lecture : active, members, groups, basePhase, cause, volatility, timeScale, formation (FormationView : headS, tailS, headSpeed, halted, haltReason, sections, blockCount, blockS(), blockSpeed(), blockOf(p), slotPosition(p,out), halt(s,motif), holdBlock(bloc,s), sonoVehicleId), metro, exits, aleas ;
     brain(p) → CrowdBrain | null ; group(id) ;
     registerController(profil | 'badaud' | '*', controller) → fonction de retrait ;
     tensionAt, legitimacyAt, cohesionAt, addLegitimacy, addCohesion, stir(x,z,rayon,peur,colère) → nombre touché, markViolence(x,z), recentViolence(x,z,rayon?) ;
     nearestPolice(x,z,rayon,out: PoliceSight) → boolean, coverAt(x,z,rayon), densityAt(x,z), routePoint(s,out: RoutePoint) ;
     goTo(p,x,z,vitesse?,course?), leave(p,issue?), release(p) ;
     spawn(profil,x,z,opts?: SpawnOptions) → Person | null, setProfile(p,to), createGroup(kind,members) ;
     triggerAlea(id) → boolean, setLiaison(actif), announceDispersal().
  Exports utiles de '@/sim/crowd' : tout api.ts, CROWD_STATE / CROWD_ACT / CROWD_FLAG, STATE_NAMES, brainOf, isCrowdBrain, CrowdCore, ROUTES, ALEA_CATALOGUE.

POINT D'EXTENSION (groupes radicaux, pilleurs, opportunistes — développeur suivant, dossier radical/)
  interface BehaviorController { id; priority?; think(p, brain, core, dt): boolean; steer?(p, brain, core, dt): void; release?(p, brain): void }
  think() est appelé à chaque réflexion de la personne, après la mise à jour des émotions et après exclusion du joueur, des personnes à terre, interpellées ou à bord. Retourner true = prendre ou garder la main (état S.CUSTOM, le cœur ne décide plus rien pour elle) ; false = comportement par défaut. Sans steer(), le cœur conduit vers (brain.tx, brain.tz) à brain.speed en suivant brain.path : il suffit d'appeler core.goTo() dans think(). brain.data est libre pour le contrôleur. Sans contrôleur, radical / pilleur / opportuniste se conduisent en militants agités (les pilleurs n'arrivent qu'à la dispersion).

ÉVÉNEMENTS ÉMIS
  Contrat : crowd:phase, crowd:tension, crowd:chant, person:fled, person:radicalized, sfx, fx.
  Libres (ctx.events.onAny) : 'crowd:alea' AleaEvent {id,label,gravity,stage:'debut'|'fin',x,z} ; 'crowd:density' DensityEvent {level:'alerte'|'danger'|'fin',density,x,z,people} ; 'crowd:metro' MetroEvent {type:'vague'|'fermeture'|'ouverture'|'filtrage'|'report',stationId,name,count,toStationId} ; 'crowd:announce' AnnounceEvent {kind,text,x,z} ; 'crowd:help' HelpEvent {personId,byId,x,z} ; 'crowd:kettle' KettleEvent {enclosed,x,z,people}.

ÉVÉNEMENTS ÉCOUTÉS
  session:started, session:ended, person:spawned, person:removed, world:tile_loaded, world:tile_unloaded, 'world:source' (libre), law:sommation, law:force, law:offense, person:arrested, 'law:enclosed' (libre), order:issued (charge, bond_offensif, refoulement, encercler), projectile:spawned, explosion, fire:started, fire:out, shop:window, shop:looted, barricade:built, person:hurt, person:down, person:treated.

SERVICES FACULTATIFS CONSOMMÉS (absents = repli neutre)
  'roles.spawn' { crowd(cause, count, composition?, rng?) → emplacements ; spawnSlot(slot, x, z, opts?) → Person } ; 'roles.causes' { list?, get(id) } ; 'vehicles.autopilot' { follow(v, leaderId, distance?), stop(v), isActive?(v), driveTo(v, x, z, {speed}) } ; 'world.data' { loadedKeys(), tile(tx,tz) } pour les bouches de métro ; 'people.locomotion' { pressureOf(p) } ; 'people.health' { knockDown(p, s, sourceId), psychDecay } ; EXT.incidents.

CLÉS LUES DANS session.config (crowdSize, tension, volatility, duration, lieu de départ) ET session.config.extra (toutes facultatives)
  cause (string) ; composition (objet : part par famille) ; derapage ('foule' | 'les_deux' : radicaux et suiveurs × 1,5) ; 'options.metro' ('ferme') ; 'crowd.scenario' ('marche_calme' | 'journee_tendue' | 'samedi_sans_organisateur' | 'soir_spontane' | 'soir_de_match') ; 'crowd.route' (number[] [x0,z0,…] ou string[] de lieux) ; 'crowd.routeId' (identifiant de la table routes-data.ts) ; 'crowd.destination' (string | {x,z}) ; 'crowd.static' (boolean) ; 'crowd.closedStations' ((string|number)[]) ; 'crowd.aleas' (string[]) ; 'crowd.noAleas' (true) ; 'crowd.present' (part déjà sur place, défaut 0,3) ; 'crowd.sono' (boolean) ; 'crowd.bystanders' (number) ; 'crowd.none' (boolean). settings.crowdScale multiplie l'effectif.

PARAMÈTRES DE RÉGLAGE (tous dans src/sim/crowd/tuning.ts)
  Déroulé : PHASE_SHARE, REAL_PHASES, OVERTIME, OVERTIME_MAX, END_SHARE. Tension : TENSION_ON/OFF 0,3/0,24, CLASH_ON/OFF 0,5/0,42, TENSION_CELL 25, TENSION_DECAY. Légitimité : LEGIT_CELL 50, LEGIT_START, LEGIT_RECOVERY, COHESION_DECAY. Cortège : MARCH_SPEED 0,92 m/s, BLOCK_LEN 5, BLOCK_TAU 1,6, BLOCK_JAM 0,7, DENSITY_CARRE/BLOC/…, BUFFER_CALM 14 / BUFFER_TENSE 45, HALT_*, BARRAGE_STOP 12, CORRIDOR_*. Métro : PRESENT_AT_START 0,3, METRO_SHARE 0,65, REINFORCE_SHARE 0,15, WAVE_*, EXIT_RATE 2 / EXIT_RATE_FILTERED 0,55, CLOSURE_SHARE 0,7, CLOSURE_DELAY_*, LEAVE_METRO_SHARE 0,5. Réflexion : THINK_NEAR/MID/FAR, LOD_*, PATH_BUDGET 3. Profils : table PROFILE (backOff, quit, keep, fearK, angerK, leave [annonce, 1re, dernière sommation], goFrom, goTo, flee, pace, tire). Gaz : GAS_FEEL 0,1, GAS_AIR 0,06, GAS_CLEAR 0,03, GAS_SCARE 0,16. Émotions : FEAR_HALF*, ANGER_HALF, CONTAGION_*, RADICAL_EVERY 10, RAD_PACIFIQUE / RAD_MILITANT / RAD_OPPORTUNISTE, SO_CALM_*. Densité : DENSITY_CELL 2,5, DENSITY_ALERT 4, DENSITY_DANGER 5, DENSITY_PRESSURE_K 0,6, CRUSH_PER_PERSON. Aléas : ALEA_BASE 2, ALEA_SPAN 4. Badauds : BYSTANDER_*.

MÉMOIRE DE FOULE : person.brain de kind 'crowd' (brainOf(p)) : state (S.ARRIVE … S.CUSTOM, noms dans STATE_NAMES), slot, group, flags (F.BYSTANDER, BANNER, GUIDE, CHILD, LATE, LEAVING, UNCOUNTED, PINNED, RESTING…), tx/tz/speed/run, path, docility, courage, fatigue, exit, controller, data.

## Mesures

Coût par pas à 1 000 manifestants (dt 0,05 s, meilleure fenêtre de 30 pas consécutifs, machine chargée) : rassemblement 786 pers. 0,26 ms (médiane 1,16) ; cortège 904 pers. 0,35 ms (médiane 1,32) ; cortège 965 pers. 0,43 ms (médiane 0,97) ; cortège 1 016 pers. 0,39 ms (médianes 0,73 et 0,82) ; dispersion 1 016 pers. 0,40 ms (médiane 1,08). Objectif < 3 ms tenu, y compris en médiane ; aucune dérive sur 360 s simulées. Non mesuré à 1 500.
Déroulé standard à 300 : 0,099 ms par pas (meilleure fenêtre), 0,242 ms en médiane ; 1 420 s simulées en 57 s réelles.
Suite complète : 33 essais en 79 s.
Taille : 29 fichiers source, ≈ 8 700 lignes, le plus gros à 596 lignes (core.ts) ; 11 fichiers d'essais, ≈ 1 600 lignes.

## Non fait / fragile

- Chemin 'roles.spawn' / 'roles.causes' écrit mais jamais exécuté contre le vrai module des rôles (il n'était pas branchable au moment des essais) : seule la composition par défaut est vérifiée
- Tiers (journalistes, observateurs, secouristes de rue) non créés par ce module : ils relèvent du module des rôles
- Pas de délestage ni de changement d'itinéraire devant un barrage : le cortège s'arrête, attend, puis les organisateurs annoncent 'parcours_coupe' et dispersent
- Avec la durée standard (25 min) la phase de marche dure 11 min : la tête couvre environ 540 à 600 m ; sur un parcours plus long la dispersion est annoncée là où se trouve la tête, l'arrivée à destination n'est atteinte que sur parcours court ou durée longue
- Sans le service 'vehicles.autopilot', le camion sono reste garé à sa place de départ
- La densité « équivalente » est un calibrage de jeu : la locomotion du module des personnes ne comprime jamais au-delà d'environ 3 p/m², j'y ajoute la part de gens qui poussent (× 0,6) pour atteindre les seuils 4 et 5
- Blessures par écrasement : le code existe (ctx.health.hurt) mais l'essai de compression en relève 0 ; ce chemin n'est donc pas observé en essai
- Réactions codées mais sans assertion dédiée : nasse (état STRANDED), canon à eau, attroupement autour d'une interpellation, cercle autour d'un blessé et appel aux secours, évitement du feu
- 7 aléas sur 36 non exercés en essai faute de conditions réunies : station_saturee, slogans_hostiles, drone_repere, vent_tournant, vehicule_bloque, provocation, scission
- S'asseoir : la posture 'sit' est écrite directement sur la personne (pas d'action de contrat pour cela) ; c'est le seul écart à la règle « tout passe par cmd / actions »
- La dispersion de 1 000 personnes dépasse les durées de phase d'une mission courte : le directeur accorde jusqu'à 3 prolongations avant de clore
- Le module du droit ajoute sa propre tension lors d'une faute : possible double compte avec la table ESIM, non calibré conjointement
- Sans affichage, la session ne sait pas résoudre un nom de lieu parisien avant le chargement des données de Paris : l'essai parisien passe les coordonnées x/z
- Aucune exécution dans un navigateur ni essai de bout en bout : les poses du haut du corps (poing levé, applaudir, filmer, tousser, se couvrir) ne sont pas vérifiées à l'écran
- Performance mesurée sur une machine chargée (charge moyenne 10 à 30 sur 4 cœurs), d'où la mesure par meilleure fenêtre de 30 pas ; non mesurée à 1 500 personnes ni avec le jeu complet composé (police, circulation, rendu)
- Le fichier temporaire tests/unit/crowd.explore.test.ts avait été validé dans git par ailleurs ; je l'ai supprimé de l'arbre de travail, la suppression reste à valider. Je n'ai fait aucune validation git

## Demandes d'évolution du contrat

- IncidentKind : ajouter 'compression' (ou 'mouvement_de_foule') pour les alertes de densité, aujourd'hui signalées par l'événement libre 'crowd:density'
- ActionsApi : une action « s'asseoir / se relever » (aujourd'hui la posture 'sit' est écrite directement)
- Typer dans le contrat les événements libres crowd:alea, crowd:density, crowd:metro, crowd:announce, crowd:help, crowd:kettle (formes dans src/sim/crowd/api.ts)
- DirectorApi : exposer la phase de base (sans les états superposés tension / affrontement) et le journal des motifs de tension, aujourd'hui accessibles seulement par 'crowd.core'
- MetroStation : un compteur des départs par station pour le rapport de fin (présent dans mon implémentation, absent du type du contrat)
- Session : résoudre le lieu de départ après le chargement de la carte (sans affichage, un nom de lieu parisien retombe au centre du monde)
- Typer 'law:enclosed' et 'world:source', que j'écoute en événements libres

## Vérifications exécutées

- npx vitest run tests/unit/crowd : 11 fichiers, 33 essais, tous verts au dernier passage complet (79 s), exécuté après les toutes dernières modifications du code
- npx tsc --noEmit : 0 erreur sur l'ensemble du projet ; avec --noUnusedLocals --noUnusedParameters : 0 signalement dans src/sim/crowd et tests/unit/crowd
- Pureté contrôlée par recherche dans mes fichiers : aucun Math.random, Date.now, import de three, document. ou window., aucun TODO ; imports hors module limités à @/core (contracts, extensions, null-services, testing) et à des import type. performance.now n'est utilisé que pour la mesure (index.ts quand core.profiling est vrai, testkit.ts), jamais dans la logique
- Déroulé standard à 300 manifestants : toutes les phases traversées (rassemblement 0 s, départ 180 s, cortège 240 s, dispersion 900 s, après-manif 1 140 s, terminée 1 316 s), fin de session à 1 420 s, densité maximale 3,05 p/m²
- La tête de cortège progresse (542 m sur un parcours de 965 m) et personne n'est relevé dans un bâtiment (ctx.world.isFree vérifié pour chaque personne)
- Métro : profil d'affluence par vagues ; station principale fermée à 30 s → sorties 116 → 25 à la principale et 38 → 92 à la voisine, report annoncé de 70 personnes ; filtrage : 53 sorties contre 109 sans filtrage
- Sommations, parts parties après annonce → première → dernière : famille 60 / 100 / 100 %, pacifique 29 / 72 / 100 %, militant 5 / 27 / 86 %, service d'ordre 5 / 26 / 74 %, opportuniste 5 / 12 / 40 %, radical 0 / 0 / 0 %
- Gaz (vraies grenades du module du matériel, vrai champ de gaz) : 72 exposés au pic, 93 visages couverts, 0 personne sur 299 dans le nuage après 48 s alors qu'il existe encore (0,32 au centre), fuite sans se jeter sous le vent, personne dans un mur
- ESIM, force illégitime contre témoin : colère 0,35 contre 0,01, tension 0,69 contre 0,02, légitimité 0,00 contre 0,70, 14 radicalisations contre 0
- Compression dans une rue étroite barrée : densité au repos 0,64, pic 5,38 p/m², 80 personnes à ≥ 4 p/m², alerte émise à 4,2
- Déterminisme : deux exécutions de même graine produisent 55 événements identiques ; deux graines différentes tirent des aléas différents
- Aléas : catalogue de 36, dont 29 déroulés dans une même session d'essai
- Paris réel (module du monde chargé) : parcours République → Bastille de 1 835 m reconnu dans la table, stations République (12 bouches), Jacques Bonsergent, Temple découvertes
- Camion sono avec le vrai module des véhicules : avance de 134 m en 215 s de marche à 0,98 m/s en suivant son guide
- Coût par pas à 1 000 manifestants mesuré et sans dérive sur 360 s simulées (voir metrics)
- git status : dans src/core, seul session.ts apparaît modifié et ce n'est pas de mon fait ; contracts.ts et extensions.ts intacts ; aucun fichier hors de src/sim/crowd et tests/unit/crowd.* touché par moi

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/crowd/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/grid.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/core.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/core-api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/events.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/routes-data.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/route.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/population.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/formation.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/formation-build.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/metro.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/nav.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/sense.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/sono.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/emotions.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/acts.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/steer.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/behavior.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/reactions.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/manners.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/density.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/director.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/aleas.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/aleas-calm.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/aleas-data.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.deroule.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.cortege.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.metro.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.sommations.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.gaz.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.esim.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.densite.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.determinisme.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.directeur.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd.robustesse.test.ts
