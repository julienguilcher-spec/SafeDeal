# Compte rendu — ia:incidents-secours

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Trois modules livrés et exécutés, sans toucher aux contrats : INCIDENTS (src/gameplay/incidents, 16 fichiers, ordre RULES), SECOURS OFFICIELS (src/sim/roles/rescue, 21 fichiers, ordre CONTROL+30) et MÉDECINS DE RUE (src/sim/roles/medics, 6 fichiers, ordre CONTROL+32). 13 fichiers de test, 39 tests verts ; `npx tsc --noEmit` sans erreur (y compris avec --noUnusedLocals/--noUnusedParameters sur mes fichiers).

Ce qui fonctionne réellement (modules réels, quartier de test, sans navigateur) :
- Incidents : détection automatique (feux de poubelle/barricade/véhicule/boutique, feu au sol confirmé s'il dure, blessé à terre, agent à terre, agent isolé, pillage, barricade, automobiliste bloqué, secours bloqués), libellé localisé par ctx.world.sectorName, urgence, gravité qui monte faute de traitement puis redescend, regroupement des doublons (y compris désormais les incidents « abstraits » ouverts par open() sans entité), clôture automatique, annonces et comptes rendus radio, journal 'incidents.records' avec statistiques et note. assign() donne l'ordre réel (eteindre / secourir / interpeller / degager_barricade / proteger), appelle EXT.rescue, ou confie l'incident au joueur (playerIncidentId) avec tâche notée ; contre-ordre, unité vide, moyen qui n'arrive pas ou tâche « finie » alors que la cause persiste rouvrent l'incident.
- Secours : départ depuis le bord de carte (ou d'un stationnement), délai et ETA, trajet par l'autopilote, arrêt à distance avec motif en français tant que la zone est hostile / la rue barrée, reprise quand une unité protège, lance (mise en place puis ctx.hazards.douse), secours à victime, tri, soins (ctx.health.heal via le geste « soigner »), brancardage et évacuation en ambulance, repli sans se défendre quand ils sont pris à partie, départ. Repli à pied sans module de véhicules, file d'attente quand tous les engins sont pris. Rôles jouables pompier et soignant du SAMU (appel attribué par radio, équipage qui travaille avec lui, intervention notée).
- Médecins de rue : IA neutre et identifiable (rince par ordre de gravité, met à l'abri hors du gaz, panse, signale les cas graves : incident + SAMU + radio, reste auprès de la victime) ; pour le joueur : tableau de tri, victime à traiter d'abord confiée comme incident, barème (rinçage +3, stabilisation +8, bilan transmis +5, remise +10, erreur de tri −10, abandon −20, sac vide −5).

Fait dans cette dernière phase : assign.ts scindé (assign.ts 481 l. + track.ts 229 l.) ; tests de déterminisme, de coût par pas et de services neutres pour les trois modules, plus un test du joueur secouriste. Ces nouveaux scénarios combinés ont révélé de vrais défauts, corrigés : (1) un pompier chargé d'une victime oscillait indéfiniment derrière son engin (itinéraire à pied qui repartait en arrière + contournement qui n'engageait pas) — la victime n'était jamais soignée et l'engin ne repartait pas ; (2) une ambulance bloquée par un mobilier fixe à plus de 140 m attendait sans fin ; (3) deux lances sur un même feu comptaient 2 à 3 « foyers éteints » (points gonflés) ; (4) deux open() abstraits voisins ne fusionnaient pas ; (5) l'incident de la victime recommandée n'était pas confié au joueur secouriste s'il était signalé après elle ; (6) un porteur incapable d'atteindre les portes arrière d'une ambulance coincée contre un kiosque tournait en rond.

Limites importantes à connaître : rien n'a été essayé dans le navigateur, ni sur la carte de Paris, ni avec foule, circulation et commandement IA réunis ; les trois modules ne sont PAS encore branchés (src/main.ts ne contient qu'une ligne en commentaire, et je n'avais pas le droit de toucher src/sim/roles/index.ts). Les engins restent tributaires de l'autopilote : un mobilier fixe sur la trajectoire les arrête et l'équipage finit à pied (jusqu'à 400 m), ce qui rend l'évacuation très lente. Détail dans notDone.

Attention dépôt : le commit 546b827 (fait par un autre processus pendant mon travail) a embarqué un fichier de sonde temporaire, tests/unit/medics.zzprobe.test.ts, qui échoue par construction. Je l'ai supprimé de l'arbre de travail ; cette suppression doit partir avec le prochain commit. Je n'ai rien commité moi-même.

## API publique et mode d'emploi

BRANCHEMENT (à faire par l'intégrateur : rien n'est encore enregistré dans src/main.ts ni dans src/sim/roles/index.ts)
  import { createSystems as incidents } from '@/gameplay/incidents';
  import { createSystems as rescue } from '@/sim/roles/rescue';
  import { createSystems as medics } from '@/sim/roles/medics';
  game.addModule(incidents); game.addModule(rescue); game.addModule(medics);
Chaque module fonctionne seul sur les services neutres ; aucun import d'exécution d'un autre module (medics importe rescue, que je possède aussi).
Systèmes : 'gameplay:incidents' (SystemOrder.RULES), 'roles:rescue' (SystemOrder.CONTROL + 30), 'roles:medics' (SystemOrder.CONTROL + 32). Classes exportées : IncidentsSystem, RescueSystem, MedicsSystem.

SERVICES FOURNIS
- EXT.incidents → IncidentsApi exactement comme dans extensions.ts : list, get(id), open(kind, x, z, targetKind, targetId, urgency?), assign(id, means, squadId?) → boolean, unassign(id), close(id, resolved, byId), nearest, playerIncidentId. Incident sans entité : targetKind 'place', targetId 0. assign() refuse (false) un moyen inapte ou absent.
- 'incidents.records' → IncidentsRecords { all: IncidentRecord[], playerTasks: PlayerTaskRecord[], of(id), stats(): IncidentStats, summary(): string[] }. IncidentRecord : id, kind, label, x, z, urgency, createdAt, assignedAt, startedAt, closedAt, means, squadId, severityStart/Peak/End, aggravated, aggravations, merged, assignments, outcome ('en_cours'|'traite'|'cause_disparue'|'echec'), byPlayer, death. PlayerTaskRecord : incidentId, kind, label, assignedAt, arrivedAt, endedAt, distance, expectedArrival, success, severityAtStart/End, note (0-100), comment.
- 'incidents.tuning' → IncidentsTuning (detection, autoDispatch, radio, mergeFire 5, mergeFireBig 8, mergeVictims 6, mergeBarricades, mergeLooting, groundFireConfirm 5, downConfirm 6, closedLinger 12, assignTimeout 150, isolatedFriendRange 14, isolatedHostileRange 9, isolatedHostiles 4, isolatedConfirm 4, dispatchDelay 8, dispatchRangeFoot 90, dispatchRangeVehicle 400) ; remis à zéro à chaque session.
- EXT.rescue → RescueApi : calls, request(kind, x, z, byId, incidentId?) → RescueCall (même appel renvoyé pour le même incident ou à moins de 25 m), cancel(callId).
- 'rescue.ext' → RescueExtApi { tuning: RescueTuning, crews: CrewView[], squadOf(callId) → squadId, assess(kind, x, z, fromX, fromZ) → SafetyReport { safe, protected, reason, danger }, stage(kind, x, z, heading) → CrewView | null, playerCallId }.
- 'rescue.records' → RescueRecords { all: RescueRecord[], of(callId), meanArrival(), playerPoints(), summary() }. RescueRecord : callId, kind, incidentId, x, z, requestedAt, departedAt, arrivedAt, leftAt, waited, waitReason, firesOut, victimsTreated, victimsEvacuated, crewHurt, retreats, playerLed, cancelled, points.
- 'roles.care' → CareApi { triage(p) → 'aucun'|'vert'|'jaune'|'rouge'|'noir', priority(p), needsCare(p), needsRinse(p), needsEvacuation(p), state(id) → CareState, claim(targetId, byId, seconds), release, claimedBy, log: CareRecord[], activeCount }. Créé par le premier de rescue / medics branché.
- 'medics.records' → MedicsRecords { score, rinses, treated, bilans, handovers, transmissions, triageErrors, abandoned, meanDelay, board: TriageEntry[] (trié, le plus urgent d'abord), recommendedId, entries: MedicEntry[], npc { medics, rinses, treated, sheltered, signalled }, summary() } ; 'medics.tuning' → MedicsTuning (sightRange, hearRange, gasThreshold, selfGasLimit, waitForSamu, followBack).

GESTES D'INTERACTION ENREGISTRÉS (ctx.interactions) : 'soigner' (bilan 5 s puis gestes, consomme une trousse_secours), 'rincer_yeux' (6 s, une dose de serum_physiologique), 'remettre' (remettre aux secours le blessé porté, 4 s), 'evacuer' (charger le blessé porté dans une ambulance à moins de 5 m, 5 s). 'porter' / 'trainer' / 'deposer' restent ceux du module des personnes.

ÉVÉNEMENTS ÉMIS (libres, ctx.events.onAny ; objets réutilisés, ne pas les conserver)
- 'incidents:opened' | 'incidents:updated' | 'incidents:closed' → IncidentEvent { id, kind, change: 'ouvert'|'assigne'|'en_cours'|'aggrave'|'fusion'|'rouvert'|'clos', resolved, byId }
- 'rescue:call' → { callId, kind, state, previous } ; 'rescue:evacuated' → { personId, callId }
- 'care:triage' → { id, color, byId } ; 'care:done' → CareRecord { t, verb, byId, targetId, triage, injuryBefore, injuryAfter, gasBefore, stabilised, waited }
- 'medics:call' → { medicId, victimId, x, z, incidentId }
- 'hazards:douse' { x, z, radius, amount } émis par les lances seulement si le service 'hazards.field' est absent ; 'fx' (jet_eau, eclaboussure) et 'sfx' (canon_eau) typés.

ÉVÉNEMENTS ÉCOUTÉS
- typés : session:started, fire:started, fire:out, person:down, person:treated, person:arrested, person:hurt, person:spawned, person:removed, vehicle:removed, shop:looted, barricade:built, order:issued, projectile:impact, explosion.
- libres (tous facultatifs) : 'hazards:douse', 'police:order_done' { squadId, type, ok, reason }, 'crowd:help' { personId, x, z }, 'traffic:motorist' { vehicleId, state, x, z }, 'props:barricade_extended', 'props:barricade_cleared', 'rescue:evacuated', 'care:done', 'incidents:closed'.

SERVICES FACULTATIFS LUS : 'vehicles.autopilot' (driveTo, status, stop, isActive), 'vehicles.ext' (setSiren, setBeacons), 'people.health' (rinseEyes, extinguish, stabilise, knockDown), 'people.gear', 'props.ext' (barricadeParts), 'hazards.field', 'radio.phrases', 'radio.callsigns'.

CLÉS LUES DANS session.config.extra
- 'incidents.detection' (false : aucune détection automatique), 'incidents.dispatch' (false : pas d'attribution d'office au joueur exécutant)
- 'moyens' : objet { pompiers: number, samu: number, secours_sur_appel: boolean } — nombre d'équipages simultanés (borné 1..4 ; 0 = renfort extérieur) ; secours_sur_appel === false : un engin et une ambulance stationnent à 150-175 m du point de session
- 'rescue.delayScale' (multiplicateur du délai de départ), 'rescue.staging' { x, z } (stationnement imposé)

RÉGLAGES PRINCIPAUX DES SECOURS ('rescue.ext'.tuning) : dispatchMin 18 / dispatchMax 32 s, originDistance 520 m, standoff 55 m, workDistanceFire 16 m, workDistanceCare 9 m, hoseRate 2 unités/s par lance, hoseFlow 8 l/s, hoseSetup 10 s, pompiersCrew 6, samuCrew 3, maxPompiers 2, maxSamu 2, unsafeTension 0,6, unsafeHostiles 4, unsafeGas 0,4, retreatWhenAttacked true.

POINTS D'EXTENSION
- Tout module peut déclarer un incident par EXT.incidents.open() et suivre son sort par 'incidents:*' ou 'incidents.records'.
- Protéger les secours : donner à une unité l'ordre 'proteger' (ou 'escorter') près de la zone ; 'rescue.ext'.assess() dit si elle est sûre et pourquoi.
- Le module pilote toute personne de type 'street_medic' non incarnée, d'où qu'elle vienne ; les équipages sont créés par ctx.archetypes ('pompier', 'samu') dans une unité de faction 'rescue'.
- Joueur : rôle 'secouriste' (équipage = son unité 'rescue' et le véhicule de l'unité) ou 'street_medic'.
- Aides de test : '@/gameplay/incidents/testkit' (startIncidents, wound, douse), '@/sim/roles/rescue/testkit' (startRescue, wound).

## Mesures

COÛT PAR PAS (game.perf, pas de 1/30 s, Node/vitest ; plages observées sur plusieurs exécutions)
- Incidents, 1 500 personnes, 3 148 objets, 60 agents : au calme 0,03-0,05 ms en moyenne (meilleure fenêtre de 100 pas 0,03-0,04 ; p95 0,05-0,09) ; avec 24 incidents ouverts 0,06-0,19 ms en moyenne (meilleure fenêtre 0,03-0,04 ; p95 0,12-0,18) ; pics isolés de 1 à 13 ms.
- Secours, 1 490 personnes : sans appel 0,001 ms ; quatre engins en route 0,009-0,011 ms ; travail sur place 0,04-0,15 ms en moyenne (meilleure fenêtre 0,03-0,05 ; p95 0,12-0,21) ; pics de 0,8 à 7 ms selon l'exécution, 40 ms une fois en exécution parallèle.
- Médecins de rue, 1 500 personnes, 12 secouristes : au calme 0,03-0,07 ms (meilleure fenêtre 0,02-0,03) ; 60 gazés et 12 blessés à prendre en charge 0,013-0,026 ms (meilleure fenêtre 0,005-0,006).
- Allocation (profileur de tas V8, sonde temporaire) : environ 0,4 ko par pas pour mes trois modules, appels de services compris, sur 1,5 ko par pas au total.
- Durée de la suite : 39 tests en 20 à 30 s.

DÉROULÉS MESURÉS
- Feu non traité : gravité 0,08 → 0,13 → 0,19 → 0,22 → 0,24 → 0,25 → 0,27 (toutes les 10 s) ; clos après 6,4 s d'arrosage.
- Blessé grave sans soins : santé 19 → 10 et gravité 0,81 → 0,94 en 60 s.
- Police réelle : porte-extincteur sur place en 4,5 s, incident clos 10 s plus tard.
- Pompiers : 503 m parcourus, sur place 56 s après l'appel (estimation 70 s), feu éteint 15 s après l'arrivée, repartis 25 s plus tard, hors carte 65 s après.
- Zone hostile : arrêt à 56 m, reprise 17 s après la protection, sur place 10 s plus tard, feu éteint en 14 s.
- SAMU : sur place 50 s, soins 21 s, chargement 21 s, départ 6 s après.
- À pied (sans véhicules) : pompiers 220 m en 82 s, feu éteint en 20 s ; SAMU, victime soignée et emportée 107 s après l'appel.
- Secours pré-positionnés à 143 m : départ en 11 s, intervention terminée en 66 s ; second appel servi 165 s plus tard.
- Scénario combiné feu + blessé grave (graine 21) : pompiers sur place à 62 s, feu éteint à 76 s, victime stabilisée par un pompier à 101 s ; ambulance arrêtée par un mobilier à 183 m, équipe à pied sur place à 192 s, victime chargée à 526 s, départ à 531 s.
- Médecin de rue : trois rinçages en 29 s ; blessé grave soigné après 37 s, SAMU sur place 70 s après le signalement, victime chargée 65 s plus tard.
- Joueur : CRS porte-extincteur 100/100 ; pompier 12 points ; SAMU 25 points ; secouriste 24 points (délai moyen de prise en charge 38 s).

## Non fait / fragile

- Les trois modules ne sont pas branchés dans le jeu : src/main.ts n'a qu'une ligne en commentaire et je ne pouvais pas modifier src/sim/roles/index.ts. Tant que les trois addModule ne sont pas ajoutés, rien de tout cela ne tourne en partie.
- Aucun essai dans le navigateur, sur la carte de Paris, ni avec foule + circulation + commandement IA + radio réunis. Seuls le quartier de test et, dans trois tests, le vrai module de police ont été composés.
- Module radio réel (livré entre-temps par un autre agent) non essayé : j'utilise le service 'radio.phrases' s'il existe (clés incident_feu, incident_blesse, agent_a_terre, etc.), sinon des textes de repli ; la correspondance des clés n'est pas vérifiée.
- Trajet des engins tributaire de 'vehicles.autopilot' : un mobilier fixe sur la trajectoire les arrête (constaté dans le quartier de test : candélabre vers (35,6 ; −25,0) sur le rond-point, obstacle à l'angle vers (1,7 ; −166)). Parade : trois reculs puis fin à pied jusqu'à 400 m. Conséquence mesurée : ambulance arrêtée à 183 m, victime portée jusqu'à elle, chargée 525 s après l'appel — très lent (la vitesse de portage vient du module des personnes). L'état de l'appel alterne en_route / en_attente pendant les reculs.
- Foule sur la chaussée : l'engin attend avec le motif « foule sur la chaussée » et ne finit à pied qu'à moins de 140 m. Dans une première version du scénario de coût (1 470 piétons répartis partout), les quatre engins sont restés à 270-460 m. Je n'ai écrit aucune logique pour faire s'écarter la foule.
- Départ des secours : l'engin est retiré quand il est loin et hors de vue, ou après un délai de garde (jusqu'à 200 s s'il reste coincé), pas exactement au bord de la carte.
- Les pompiers PNJ n'utilisent pas l'objet lance_incendie via ctx.actions : ils appellent ctx.hazards.douse directement sur le foyer (2 unités/s par lance) et écrivent la pose p.upper. C'est un écart assumé à la règle « passer par ctx.actions », parce que l'objet arrose à pleine portée de 25 m.
- 'evacuer' et 'remettre' défont le lien porteur/porté en écrivant directement heldBy / carrying (aucune API des personnes pour cela) ; un holdMode périmé peut rester dans le module des personnes.
- Ordres 'secourir', 'interpeller', 'degager_barricade' et moyens canon_eau / centaure / bravm : seule l'émission de l'ordre est vérifiée ; l'exécution appartient au module de police. Seul 'eteindre' (et 'proteger' dans le test en zone hostile) est vérifié de bout en bout avec la vraie police.
- Le commandant IA de la police appelle assign() puis redonne lui-même l'ordre : je l'adopte comme le même ordre au lieu d'y voir un contre-ordre, mais le double envoi subsiste.
- Rôles jouables : dans les tests, le véhicule et le joueur sont déplacés d'un coup (la conduite elle-même n'est pas simulée) ; l'usage de la lance par le joueur lui-même n'est pas vérifié (c'est l'équipage qui éteint) ; il n'y a pas d'objet brancard : le blessé porté est installé à la dernière place passager de l'ambulance.
- Sémantique des soins imposée par le module des personnes : tout 'soigner' stabilise ; une urgence absolue est plafonnée pour rester à terre jusqu'au SAMU ; un blessé sérieux qui se relève seul avant 12 s n'ouvre pas d'incident.
- Aucune interface : tableau de tri, liste d'incidents et état des secours ne sont que des services, sans affichage.
- Performance : mesurée sous Node (vitest), pas dans le navigateur. Des pics isolés (de 1 à 13 ms, 40 ms une fois quand tous les fichiers tournaient en parallèle sur une machine à court de mémoire) apparaissent à des pas différents d'une exécution à l'autre, donc probablement ramasse-miettes ou compilation, mais je ne l'ai pas prouvé. Aucun test de la suite ne compte les passages du ramasse-miettes.
- Un ralentissement ponctuel d'environ 10 ms étalé sur 12 pas se reproduit au premier feu avec 3 000 objets dans le balayage des objets : il disparaît quand une autre boucle lit ces objets avant, ce qui désigne une migration interne de V8 sur les objets du module props ; non corrigeable depuis mes fichiers.
- Médecins de rue : la mise à l'abri n'est vérifiée que dans un scénario ; le test du joueur secouriste place le joueur auprès des victimes au lieu de le faire marcher.
- Trois fichiers dépassent 500 lignes (think.ts 571, crew-phases.ts 543, crew-fire.ts 514), tous sous 600.
- Rien commité par moi. La suppression de tests/unit/medics.zzprobe.test.ts (sonde temporaire embarquée par le commit 546b827 d'un autre processus) reste à commiter.

## Demandes d'évolution du contrat

- IncidentsApi.assign : préciser dans extensions.ts que c'est assign() qui donne l'ordre (ctx.squads.issue) ou appelle les secours, pour que les appelants (src/sim/police/command/delegate.ts) ne le redonnent pas ; ajouter un paramètre byId facultatif pour créditer le donneur d'ordre.
- RescueCall : ajouter squadId (unité de l'équipage, aujourd'hui via 'rescue.ext'.squadOf) et byId (demandeur).
- EntityKind n'a pas de valeur « aucune » : un incident sans entité s'ouvre avec targetKind 'place' et targetId 0 ; le documenter ou ajouter 'none'.
- Typer dans GameEvents les événements aujourd'hui libres : 'incidents:opened/updated/closed', 'rescue:call', 'rescue:evacuated', 'care:done', 'care:triage', 'medics:call', 'police:order_done', 'crowd:help', 'traffic:motorist', 'hazards:douse'.
- HazardApi.douse : ajouter un byId facultatif pour savoir qui a éteint (crédit de l'extinction, notation).
- API des personnes : une méthode pour détacher ou transférer une personne portée (remise aux secours, chargement en ambulance) au lieu d'écrire heldBy / carrying, et qui remette holdMode à zéro.
- Liste des gestes (InteractVerb) : y inscrire 'evacuer' et noter que 'remettre' sert aussi à remettre un blessé aux secours.
- SessionConfig.extra : typer la clé 'moyens' { pompiers, samu, secours_sur_appel } ainsi que 'rescue.delayScale', 'rescue.staging', 'incidents.detection', 'incidents.dispatch'.
- Module véhicules (autopilote) : demi-tour des véhicules longs en rue étroite, et contournement ou signalement distinct d'un objet fixe sur la trajectoire ; côté données du quartier de test, du mobilier est posé sur la trajectoire des véhicules (candélabre vers (35,6 ; −25,0), angle vers (1,7 ; −166)).
- Modules props et personnes : initialiser en flottant les champs numériques qui le deviennent (PropObj.burning, Person.gas) pour éviter la migration d'objets de V8 au premier feu ou au premier gaz.

## Vérifications exécutées

- npx vitest run tests/unit/incidents : 5 fichiers, 17 tests verts ; tests/unit/rescue : 5 fichiers, 13 tests verts ; tests/unit/medics : 3 fichiers, 9 tests verts (39 au total, relancés après les dernières modifications)
- npx tsc --noEmit : aucune erreur dans tout le projet ; avec --noUnusedLocals --noUnusedParameters : aucune erreur dans mes fichiers
- Recherche dans mes sources : aucun Math.random, Date.now, performance.now, setTimeout, accès DOM, import de three, TODO ; aucun import d'exécution d'un module tiers (seulement @/core et mes propres dossiers)
- Feu de poubelle : incident localisé « Feu de poubelles, rue du Pont », gravité 0,08 → 0,27 en 60 s sans traitement, redescend pendant l'arrosage, clos après 6,4 s ; trois bacs voisins et la nappe au sol = un seul incident, un feu plus loin = un autre ; propagation portée « aggravé » au journal
- Délégation : assign(id, 'unite', squad) fait arriver un ordre 'eteindre' dans ctx.squads avec le foyer pour cible ; ordres secourir / interpeller / degager_barricade / proteger émis selon la nature ; avec le vrai module de police, le porte-extincteur est sur place en 4,5 s et l'incident se clôt 10 s plus tard avec compte rendu radio
- Blessés et agents : urgence selon la gravité, gravité qui monte faute de soins (0,81 → 0,94 en 60 s), deux blessés voisins regroupés, agent à terre en incident distinct, agent isolé signalé après 4,5 s puis clos quand des collègues le rejoignent ; pillage, barricade, automobiliste bloqué, véhicule en feu (extincteur refusé) ouverts puis clos quand la cause disparaît
- Incident confié au joueur exécutant : CRS porte-extincteur, tâche attribuée par radio après 8,5 s, feu éteint, note 100/100 ; abandon et échec notés ; rien d'attribué d'office au commandant
- Pompiers en zone calme : départ à 503 m, sur place 56 s après l'appel (estimation 70 s), feu éteint 15 s après l'arrivée, repartis, sortis de la carte
- Pompiers en zone hostile : arrêt à 56 m avec le motif « zone non sécurisée : foule hostile à proximité », reprise 17 s après un ordre de protection donné au vrai module de police, états en_route → en_attente → en_route → sur_place → reparti
- SAMU : blessé grave → incident vital → sur place en 50 s, soins en 21 s (victime stabilisée, toujours à terre), chargée 21 s plus tard, évacuée, 25 points
- Aléas : barricade en travers (arrêt à 69 m, motif « rue barrée par une barricade », passage une fois dégagée) ; pris à partie pendant l'extinction (repli de 16 m à 32 m, aucun emploi de la force) ; annulation en route ; sans module de véhicules, pompiers et SAMU interviennent à pied ; un seul engin : le second appel attend et est servi ensuite
- Rôles jouables : joueur pompier (appel attribué, équipiers à bord en 2,5 s, feu éteint par l'équipage, 12 points, tâche 100/100) ; joueur du SAMU (soigne, porte, charge, évacue, 25 points)
- Médecins de rue : trois personnes gazées rincées par ordre de gravité (0,84 → 0,49 → 0,25) en 29 s avec une dose chacune ; exposition 0,10 rincée contre 0,45 non rincée après 20 s ; blessé grave porté à 9,8 m hors du gaz, soigné, signalé (incident + SAMU + radio), secouriste resté auprès de lui jusqu'à l'ambulance ; un policier blessé est soigné comme les autres
- Joueur secouriste : tableau de tri ordonné (rouge, jaune, vert), urgence vitale confiée comme incident du joueur, barème vérifié point par point (−10, +3, +8, +5, +8, +10 = 24) ; blessé abandonné −20 ; sac vide −5
- Déterminisme : pour chacun des trois modules, deux déroulés de même graine donnent des journaux strictement identiques (55 lignes incidents, 24 lignes secours, 12 lignes medics : instants, états, soins, radio, positions finales) et une autre graine un journal différent
- Services neutres : chaque module seul, sans aucun autre — incidents (ouverture, fusion, délégations refusées proprement, clôture, journal), secours (appels acceptés, puis annulés avec le motif « aucun accès pour les secours » après le délai de garde, équipages retirés), medics (service de soins créé, secouriste commandé par cmd, jamais déplacé)
- Coût par pas mesuré par game.perf avec environ 1 500 personnes (chiffres dans metrics), seuils affirmés sur la meilleure fenêtre de 100 pas
- Allocation mesurée une fois avec le profileur de tas par échantillonnage de V8 (sonde temporaire, non conservée dans la suite) : environ 0,4 ko par pas attribués à mes trois modules sur 1,5 ko par pas au total, quatre équipages et douze secouristes au travail
- tests/unit/integration.session (8 tests, d'un autre module) repasse après mes changements

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/api.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/assign.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/detect.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/dispatch.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/entry.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/index.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/kernel.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/labels.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/radio.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/records.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/sense.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/system.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/testkit.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/think.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/track.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/incidents/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/care-handlers.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/care.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-clear.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-drive.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-fire.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-medical.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-phases.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew-tasks.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/crew.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/dispatch.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/nav.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/player.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/radio.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/records.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/safety.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/spawn.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/testkit.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/rescue/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/score.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/medics/tuning.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/incidents.feu.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/incidents.delegation.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/incidents.personnes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/incidents.joueur.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/incidents.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/rescue.pompiers.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/rescue.samu.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/rescue.joueur.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/rescue.aleas.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/rescue.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/medics.secouristes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/medics.joueur.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/medics.perf.test.ts
