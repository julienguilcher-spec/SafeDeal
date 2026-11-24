# Compte rendu — ia:unités

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module FORCES DE L'ORDRE écrit, exécuté et testé : 27 fichiers dans src/sim/police (≈ 8 900 lignes, aucun dans command/), 9 fichiers de tests (39 tests, tous verts), tsc sans erreur.

Ce qui existe et tourne réellement (quartier d'essai, vrais modules monde/personnes/matériel/dangers/droit/véhicules) :
- Construction des unités ('police.units') : compagnie de CRS (commandement de 6 + 4 sections de 16 en groupes A/B/C, commandant unique à écharpe, indicatifs, arborescence parent/enfant, 14 véhicules), section, groupe, BRAV-M, peloton de gendarmes mobiles, équipages d'engins. Utilise 'roles.spawn' s'il est branché, sinon une composition et des dotations de repli.
- Moteur de formations : ligne (boucliers ≈ 1 m, second rang à 2 m, chefs derrière, largeur mesurée par lancers de rayon aux façades), colonne par 2/3 le long d'un itinéraire, tortue, écran de protection, encerclement, affectation des emplacements sans croisement (sections jamais entremêlées), progression d'un bloc à vitesse commune, réalignement automatique, « laisser passer » (les rangs s'ouvrent pour un agent qui regagne sa place), mesure de l'erreur d'alignement.
- Exécution de tous les OrderType avec comptes rendus radio à la réception et à l'exécution (phraséologie §E), y compris refus motivé.
- Comportement individuel : bouclier levé sous les jets, tortue réflexe sous mortiers, évitement des nappes de feu, extinction d'un collègue en feu, évacuation d'un collègue à terre, masque selon le vent, fatigue et demande de relève, moral (présence du commandant).
- Force graduée bornée par min(order.maxForce, roe.lawfulForce), avis préalable de 'law.advisor' avant tout emploi, riposte proportionnée sous attaque, LBD seulement sur violent identifié à portée et sous les épaules, désencerclement seulement en encerclement réel, arme de service jamais.
- Chaîne d'interpellation maîtriser → menotter → escorter → remettre, couverte par deux boucliers, puis retour à l'emplacement.
- Logistique ('police.status') : munitions par agent, réserve des fourgons, ravitaillement.
- Place du joueur ('police.slot') : emplacement réservé et publié, jamais piloté ; ordres du joueur-chef par ctx.squads.issue.

Dernier correctif de cette passe : deux sections de même barycentre latéral s'entremêlaient dans la ligne de compagnie (clé de tri) ; corrigé et couvert par un test. Ajout du « laisser passer » : un agent projeté derrière un second rang dense restait bloqué ; la ligne se reforme maintenant en 3,3 s. Les consignes de déplacement passent par les champs de l'agent (allocations du système divisées par 5 à l'arrêt).

Limites honnêtes : voir notDone (pas de rétrécissement dynamique d'une ligne en marche, repli sans échelons, filtrage sans contrôle d'identité, BRAV-M sans manœuvre montée, encerclement d'une avenue de 40 m tenu par des lignes espacées et non jointives, allocations non nulles, rien n'a été lancé dans un navigateur).

## API publique et mode d'emploi

BRANCHEMENT
import { createSystems as police } from '@/sim/police' ; ModuleFactory qui retourne [PoliceSystem] (id 'police.ai', order SystemOrder.CONTROL). Aucun autre module n'est importé à l'exécution (seulement des import type de leurs api.ts) ; tous les services étendus sont lus par le contexte et le module fonctionne s'ils sont absents (testé sans aucun module, puis avec le seul module des personnes). Types et constantes : /home/user/SafeDeal/crs-simulation/src/sim/police/api.ts (l'en-tête documente le point d'extension et les conventions de champs par ordre).

SERVICES FOURNIS (ctx.provide)
- 'police.units' : PoliceUnitsApi { createCompany(options?), createSection(options?), createGroup(options?), createBravm(binomes, options?), createPeloton(options?), createEquipage(kind, options?) → UnitHandle { squad, sections, groups, people, vehicles, leader } ; encircle(squadIds, x, z, radius, openExitHeading?, maxForce?) ; rootOf(squadId) → number ; members(squadId, out: Person[]) → number ; reserveOf(vehicleId) → VehicleReserve | null ; refillReserve(vehicleId) }. Options de placement : x, z, heading, vehicles, layout, seed.
- 'police.status' : { of(squadId) → UnitStatus | null } avec squadId, name, total, valid, injured, down, detached, embarked, ammo, reserve (AmmoCount : lacrymoMain, lacrymoLanceur, gm2l, lbd, desencerclement, extincteur, gazeuse, menottes), fatigue, morale, stamina, order, phase ('repos' | 'mise_en_place' | 'en_place' | 'mouvement' | 'action' | 'termine' | 'refuse' | 'embarque'), formation, alignError, needsRelief, underAttack, forceCap, x, z, heading, arrests, rootId. Valeur mise en cache 0,25 s.
- 'police.slot' : { slotOf(personId) → { x, z, heading } | null ; distanceToSlot(personId) → number }. Vaut pour le joueur équipier : son emplacement est réservé, il n'est jamais piloté.
- 'police.formation' : { of(squadId, block?) → FormationInfo | null { formation, x, z, heading, width, spacing, front: EntityId[], slotErrorMax, slotErrorRms, slotErrorAll, lineError, moving, blocks } ; exits(squadId) → ExitInfo[] { x, z, bearing, width, held, agents, name } }.
- 'police.tuning' : PoliceTuning modifiable en cours de session.

ÉVÉNEMENTS ÉMIS (événements libres, ctx.events)
'police:order_done' { squadId, type, ok, reason } ; 'police:order_refused' { squadId, type, reason } ; 'police:in_place' { squadId, x, z } ; 'police:relief_requested' { squadId, fatigue, valid, total } ; 'police:encircled' { squadId, exits, held, open } ; 'police:arrest' { squadId, targetId, byId, stage } ; 'police:officer_down' { squadId, personId, x, z } ; 'police:force_used' { squadId, means, x, z, byId }. Comptes rendus radio par ctx.radio.say.

ÉVÉNEMENTS ÉCOUTÉS
'order:issued', 'person:hurt', 'person:down', 'projectile:spawned', 'fire:started', 'session:started' (création des tirages ctx.rng).

SERVICES LUS S'ILS EXISTENT
'people.locomotion', 'people.gear', 'people.health', 'law.advisor', 'law.handover', 'roles.spawn', 'vehicles.autopilot', 'traffic.control', 'crowd.metro', EXT.incidents, EXT.rescue, EXT.traffic, EXT.metro. Stores du cœur : ctx.squads, ctx.people, ctx.vehicles, ctx.props, ctx.world, ctx.actions, ctx.interactions, ctx.law, ctx.radio, ctx.clock, ctx.rng.

CLÉS LUES DANS session.config.extra : aucune.

CONVENTIONS DES ORDRES (ctx.squads.issue(squadId, { type, x, z, heading, width, targetId, maxForce, issuedBy }))
- Un ordre de formation donné à une unité vaut pour toute sa descendance, qui manœuvre d'un bloc ; un ordre donné ensuite à une unité subordonnée l'en détache.
- Les ordres de tâche (interpeller, eteindre, secourir, ravitailler, degager_barricade, disperser_gaz) ne changent pas la formation : seuls les spécialistes sortent du rang, puis reprennent leur place.
- ligne : x, z = milieu, heading = face, width = front (0 : largeur réelle de la rue). colonne : width ≥ 1,6 = par trois, sinon par deux. bond_offensif borné à 15–25 m, charge à 30–60 m, refoulement par tronçons de 50 m.
- encercler : width = DIAMÈTRE de la zone, heading = direction de l'issue laissée ouverte, targetId = ENCIRCLE_CLOSE_ALL (−1) pour tout fermer ; plusieurs unités recevant le même ordre se partagent les issues.
- releve : targetId = membre ou numéro de l'unité à relever. suivre : targetId 0 = celui qui a donné l'ordre (issuedBy).

RÉGLAGES (PoliceTuning)
shieldSpacing, secondRank, pace, trot, charge, tortue, repli, autoArrest, autoArrestRange, autoRiposte, autoRescue, fatigueTime, reliefAt, reactionMin, reactionMax. Constantes internes dans /home/user/SafeDeal/crs-simulation/src/sim/police/tuning.ts.

POINT D'EXTENSION POUR command/
- Donner des ordres : ctx.squads.issue (ou police.units.encircle pour plusieurs unités).
- Lire l'état : 'police.status'.of, 'police.formation'.of et .exits, 'police.units'.rootOf et .members, plus les événements ci-dessus.
- Piloter un équipage : createEquipage(kind) assoit l'équipage et renvoie l'unité (Squad.vehicleId) ; les ordres avancer, colonne, repli, suivre, tenir, cesser conduisent l'engin par 'vehicles.autopilot'. Tourelles, jets et salves restent à piloter par le module des véhicules.
- Le plafond de force est min(order.maxForce, ctx.law.roe.lawfulForce) : le commandement doit prononcer les sommations (module droit) avant un ordre de gaz, sinon l'ordre est refusé avec compte rendu.

## Mesures

Coût du système de police par pas (156 agents, 456 personnes, test police.perf, objectif < 2 ms). Dernière exécution : lignes tenues moyenne 0,043 ms (meilleure fenêtre de 100 pas 0,026 ms, p95 0,073 ms, max 4,08 ms) ; en marche moyenne 0,129 ms (meilleure fenêtre 0,047 ms, p95 0,130 ms, max 8,26 ms) ; sous les projectiles moyenne 0,108 ms (meilleure fenêtre 0,049 ms, p95 0,127 ms, max 10,59 ms). Une exécution antérieure de la même session, avant le passage des consignes par les champs de l'agent, donnait des moyennes de 0,353 ms en marche et 0,422 ms sous les projectiles, tirées vers le haut par des pics de 36 et 24 ms : les pics varient d'une exécution à l'autre.

Allocations attribuées aux fonctions de police (profileur d'échantillonnage, objets collectés inclus) : à l'arrêt 5,39 Mo puis 1,00 Mo sur 20 s après correction (environ 1,7 Ko par pas) ; en marche 11,2 Mo sur 10 s (environ 37 Ko par pas) ; sous les projectiles 18,1 Mo sur 20 s (environ 30 Ko par pas).

Formations : section en ligne écart 0,002 m à l'arrêt ; progression de 40 m pire écart 0,037 m ; compagnie en ligne écart 0,007 m, reformée en 3,3 s après bousculade ; colonne pire écart 0,25 m ; repli pire écart 0,264 m. Encerclement en place en 71 s. Suite de tests : 39 tests en 22 à 25 s.

## Non fait / fragile

- Encerclement : dans une avenue de 40 m, l'issue est tenue par une ligne espacée (vides jusqu'à 2,3 m), pas par des boucliers jointifs ; 70 agents à pied ne suffisent pas pour 108 m d'issues
- Pas de rétrécissement dynamique d'une ligne en marche quand la rue se resserre : la largeur est fixée à l'ordre, il faut redonner un ordre ligne
- Repli : recul d'un bloc face à la foule, sans échelons qui se couvrent tour à tour
- Filtrer : barrage avec porte, sans contrôle d'identité ni tri des personnes
- BRAV-M : unité créée avec ses motos et ses binômes, mais aucune manœuvre montée ; les fourgons d'une unité ne suivent pas la troupe (seuls les équipages créés par createEquipage conduisent, via 'vehicles.autopilot')
- Décision tactique (choix des manœuvres, prononcé des sommations par un commandant IA) : laissée au dossier command/ du développeur suivant
- Embarquement d'une section : 18 agents à bord sur 19, il manque une place (fourgon de 6 places face à un groupe plus son conducteur)
- Chemin 'roles.spawn' (module des archétypes) non exercé par mes tests : seule la composition de repli est vérifiée
- Rien n'a été lancé dans un navigateur ni dans le jeu complet : vérification uniquement par tests dans le quartier d'essai
- Suite de tests complète du dépôt non lancée : seulement tests/unit/police
- Allocations non nulles : environ 1,7 Ko par pas à l'arrêt et 30 à 37 Ko par pas en marche ou sous les projectiles, attribués aux fonctions de police par le profileur d'échantillonnage. Ce sont des nombres mis en boîte par le moteur, pas des tableaux ni des objets créés dans les boucles ; cause exacte non établie (hypothèse : accès polymorphes aux champs de Person, même phénomène visible dans le module des personnes)
- Pics isolés de 4 à 36 ms sur un pas, non reproductibles au même pas entre deux exécutions identiques : probablement ramasse-miettes, compilation à la volée ou charge de la machine partagée, non prouvé. Seul pic reproductible : environ 1,9 ms au pas où trois unités construisent leur formation
- maneuver.ts fait 619 lignes, un peu au-dessus de la limite indicative de 600
- system.ts appelle performance.now() (protégé par typeof) pour la seule mesure lastStepMs ; cela n'influe pas sur la simulation, mais c'est une horloge hors ctx.clock
- Interpellations, blessures et secours dépendent des modules droit et personnes : sans eux ces tâches se terminent en échec avec compte rendu, ce cas n'est pas testé en détail

## Demandes d'évolution du contrat

- SquadOrder : champ explicite pour l'issue laissée ouverte d'un encerclement (aujourd'hui convention heading + targetId = −1 pour tout fermer) et préciser que width est un diamètre
- SquadOrder 'releve' : lever l'ambiguïté de targetId (numéro d'unité ou identifiant d'entité)
- Typer les événements de police ('police:order_done', 'police:order_refused', 'police:in_place', 'police:relief_requested', 'police:encircled', 'police:arrest', 'police:officer_down', 'police:force_used') dans le contrat des événements au lieu d'événements libres
- Préciser dans le contrat qu'un ordre donné à une unité s'applique à sa descendance (aujourd'hui recopié par le module de police)
- Module des personnes : un blessé 'serious' se relève seul alors que la bible le dit à évacuer ; seul 'critical' reste à terre
- Véhicules : capacité du fourgon (6 places) inférieure à un groupe plus son conducteur
- RoeState par unité plutôt que global, pour qu'un plafond de force puisse différer d'un secteur à l'autre

## Vérifications exécutées

- npx vitest run tests/unit/police : 9 fichiers, 39 tests, tous verts (dernière exécution complète après le dernier changement de code ; seule une ligne de commentaire de api.ts a été modifiée ensuite)
- npx tsc --noEmit : 0 erreur dans tout le dépôt au moment du contrôle ; aucun avertissement dans mes fichiers avec --noUnusedLocals --noUnusedParameters
- Section en ligne dans une rue : en place en 15 s, front 13,10 m de façade à façade, 11 agents au premier rang à 1,19 m, écart à la droite 0,002 m (objectif ≤ 0,5 m)
- Progression de 40 m d'un bloc : 34,0 s au pas, pire écart en marche 0,037 m (objectif ≤ 1 m), 0,000 m à l'arrivée, écart de vitesse dans le rang 0,00 m/s, tout le premier rang en mouvement moins de 1,5 s après l'ordre
- Compagnie en ligne dans l'avenue : front 39,1 m, 33 agents à 1,18 m, écart 0,007 m, quatre sections contiguës jamais entremêlées ; ligne resserrée à 26 m avec ordre latéral conservé ; après bousculade de cinq agents, ligne reformée en 3,3 s (écart final 0,006 m)
- Colonne par deux à travers deux carrefours : arrivée en 248 s, pire écart aux emplacements 0,25 m, plus grand vide entre voisins 1,26 m
- Bond offensif : 22,1 m en 13,8 s à 2,35 m/s, arrêt net, réalignement à 0,000 m. Charge : 40,1 m à 4,01 m/s, un coup de sifflet, retour à 0,01 m du départ
- Repli face à la foule : 25,0 m en 28,2 s, pire écart 0,264 m, rotation du corps 0 degré. Tortue : 5/5 boucliers levés, 16/16 accroupis
- Encerclement de la place ronde : 4 issues trouvées (avenue 40,0 m deux fois, rue du Pont 14,0 m deux fois), toutes tenues (26/9/26/9 agents), en place en 71 s ; variante à trois unités avec l'issue est laissée ouverte
- Scénario calme de 5 minutes face à des pacifiques : 0 ligne au journal de la force, 0 projectile tiré, 0 interpellation, alignement 0,006 m
- Scénario d'attaque : boucliers levés 0,20 s après le premier jet, avertissement, 4 grenades lacrymogènes à main toutes jugées licites, interpellation menée jusqu'à la remise au véhicule en 60 s
- LBD : 4 tirs, tous licites, sur le lanceur de pavés identifié, zones d'impact 0,44 à 0,46 (sous les épaules), aucun tir sur un pacifique. Désencerclement : une grenade, seulement en encerclement réel, licite
- Vent de face : 16 masques mis avant le premier impact, gaz déposé en amont du groupe violent. Mortiers : 16/16 accroupis. Engin incendiaire : personne à moins de 3,06 m du foyer, feu éteint d'initiative en 3,8 s
- Collègue à terre : pris en charge en 2,5 s, déposé 4,7 m derrière la ligne en 16,5 s, couvert par deux boucliers. Ordre secourir exécuté. Ordre eteindre : feu éteint en 6,0 s (témoin sans ordre : brûle encore à 22 s). Collègue en feu éteint en 2,2 s
- Ravitaillement : 7 → 12 grenades à main, réserve du fourgon 36 → 31. Relève en 55 s. Débarquement : tous dehors en 3,0 s, en ligne en 30,5 s. Refoulement, protéger, suivre, escorter, couper, filtrer (porte de 2,82 m), dégager une barricade : exécutés
- disperser_gaz refusé sans cadre légal avec compte rendu, puis exécuté (6 grenades licites) après les sommations
- Fatigue 0 → 0,95 avec une demande de relève par radio (fatigueTime abaissé à 60 s pour le test)
- Déterminisme : même graine, même déroulement (positions, radio, journal de la force) ; autre graine, déroulement différent
- Place du joueur : emplacement réservé et publié, joueur jamais piloté, ordre du joueur-chef exécuté
- Fonctionnement sans aucun autre module (ordres acceptés, emplacements calculés) et avec le seul module des personnes (ligne de 30 m, écart 0,003 m)
- Équipage de Centaure conduit à destination par le vrai pilote automatique des véhicules
- Coût par pas mesuré avec 156 agents et 456 personnes, très en dessous de l'objectif de 2 ms (voir metrics)
- Hygiène vérifiée par recherche : aucun Math.random ni Date.now, aucun import d'exécution d'un autre module, src/core non modifié, dossier command/ non créé, fichier de débogage supprimé

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/police/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/kernel.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/units.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/roster.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/tree.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/formation.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/place.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/steer.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/mcore.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/maneuver.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/encircle.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/special.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/radio.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/force.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/weapons.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/reflex.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/logistics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/ops.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/ops-core.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/ops-arrest.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/ops-rescue.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/ops-supply.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.formations.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.manoeuvres.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.encerclement.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.force.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.riposte.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.taches.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.ordres.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.unites.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police.perf.test.ts
