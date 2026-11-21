# Compte rendu — véhicules:physique

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le module de simulation des véhicules est écrit, exécuté et testé : 22 fichiers dans src/sim/vehicles (7 480 lignes), 12 fichiers de tests (126 tests, tous verts), aucune erreur tsc dans mes fichiers (y compris avec --noUnusedLocals --noUnusedParameters). contracts.ts et extensions.ts n'ont pas été touchés.

Le système (ordre SystemOrder.VEHICLES) publie ctx.vehicles en s'appuyant sur le magasin du cœur (registerDefs), plus deux services : 'vehicles.autopilot' et 'vehicles.ext'. Les neuf points de la mission sont faits :
1. Définitions des 21 VehicleKind (gabarits et masses du tableau C de la bible, sièges avec rôle et point de sortie, tourelles), complétées par des caractéristiques hors contrat (moteur, tenue de route, incendie, jets, lanceur, vol).
2. Conduite : modèle bicyclette dynamique à sous-pas de 1/120 s, adhérence latérale saturée (sous-virage), frein à main qui bloque l'arrière (survirage), puissance massique et boîte automatique (rpm réels, gear), freinage réparti selon la charge, frein moteur, marche arrière, transfert de charge, pente par heightAt, adhérence par surfaceAt et wetness, moto qui penche. Même trajectoire à 1/20, 1/30, 1/60 et 1/120 s (écart < 3 %).
3. Collisions : décor (file de disques + coins, correction de corps rigide, glissement, dégâts), objets (renversés, projetés, brisés ; la lame dégage une barricade en 2,3 s), véhicules (boîtes orientées, impulsion, lame qui repousse une épave jusqu'à 12 t), personnes (foule repoussée sous 2 m/s, choc au-delà avec ctx.health.hurt 'vehicle' ou 'crush', ctx.law.reportForce 'vehicule' si le conducteur est policier).
4. Dégâts et feu : états ok/endommagé/épave, embrasement par brûlure, feu au sol (fireAt) ou véhicule voisin, fumée, chaleur, pneus, explosion, carcasse calcinée qui reste un obstacle, extinction à l'eau, évacuation, retournement par un groupe (verbe 'renverser').
5. Monter/descendre/conduire : enter/exit, quatre gestionnaires d'interaction, choix du siège, portes, moteur, verrou, règles d'accès, occupants recalés à chaque pas.
6. Tourelles : salve de 1 à 30 grenades de 56 mm en cloche sur le point désigné (charges 50/100/200 m, éventail, rechargement à l'arrêt), canon à eau à jet continu (cuve partagée, trois modes, recul, extinction, objets renversés), lance des pompiers, caméra sur mât.
7. Vol : drone (déploiement par 'drone:toggle', commandes, plafond/plancher, évitement du bâti, batterie, retour automatique, chute) et hélicoptère en orbite.
8. Pilote automatique : driveTo, follow, convoy, park, parkRow (bataille, épi, file), stop, status, avec tenue de voie, virages, obstacles, fermetures de rues, demi-tour en plusieurs temps et priorité à droite.
9. Sirènes, gyrophares, phares automatiques, clignotants, klaxon.

Le module a aussi été éprouvé avec trois vrais modules voisins : le monde (quartier d'essai : 966 m d'itinéraire sans toucher un mur), les objets (grenade simulée par eux : chute prévue à 0,43 m du point désigné) et, une fois à la main, les personnes (recul du jet et choc piéton appliqués par leur santé).

Point d'attention principal : la convention de signe de turretYaw diverge entre modules (voir contractRequests). La machine de test était très chargée (charge moyenne ≈ 30 sur 4 cœurs) : les coûts sont donnés en temps processeur.

## API publique et mode d'emploi

BRANCHEMENT
import { createSystems as vehicles } from '@/sim/vehicles'; game.addModule(vehicles);
Un seul système, id 'sim:vehicles', ordre SystemOrder.VEHICLES (300). Dans provide() : enregistre les 21 définitions dans getCore(ctx).stores.vehicles, pose ctx.vehicles, publie les deux services. Dans init() : enregistre les gestionnaires d'interaction. Types publics : '@/sim/vehicles/api' (à importer en `import type`).

SERVICES
- ctx.vehicles (VehicleApi complet) : list, defs, def, get, spawn, remove, clear, queryRadius, resolveCircle, raycast délégués au magasin du cœur ; enter, exit, damage, fireTurret sont ceux du module. enter() n'applique AUCUNE règle d'accès (scripts et interpellation doivent pouvoir asseoir n'importe qui) ; les règles sont dans les gestionnaires d'interaction.
- ctx.service<AutopilotApi>('vehicles.autopilot') :
  driveTo(v, x, z, { speed?, urgence?, stopBefore?, pushThrough? }) → boolean
  follow(v, leaderId, distance = 6) — meneur = véhicule OU personne ; distance = intervalle entre mon pare-chocs et lui
  convoy(list, x, z, { gap = 6, speed?, urgence? }) — le premier conduit, les autres suivent et s'arrêtent alignés
  park(v, x, z, heading) ; parkRow(list, x, z, heading, 'bataille' | 'epi' | 'file', spacing?) — chacun son tour
  stop(v) ; isActive(v) ; status(v) → { mode, state, reason, remaining, targetSpeed, blockedFor, leaderId, urgence } (objet stable)
  state : 'repos' | 'en_route' | 'manoeuvre' | 'attente' | 'bloque' | 'arrive' | 'echec' ; reason : '' | 'personne' | 'vehicule' | 'obstacle' | 'fermeture' | 'mur' | 'sans_itineraire' | 'hors_service' | 'meneur_perdu'.
  Le pilote conduit même sans occupant, met le contact, rend le véhicule frein à main serré. Il rend la main dès que le JOUEUR s'assoit au volant. Il n'utilise pas Vehicle.brain. Destination posée sur l'axe d'une rue = arrêt sur sa voie de droite ; destination hors axe = arrêt exact au point.
- ctx.service<VehiclesExtApi>('vehicles.ext') :
  tuning { fireTimeScale, explosionChance, crashDamage, flipPeople, flipSeconds, dispersion } ; spec(kind) ; dynamics(v) { lateralSpeed, slipAngle, accelLong, accelLat, grip, skid, asleep }
  accès : canBoard, canDrive, chooseSeat, driverOf, turretOfSeat, seatOfTurret, doorOpen(v, seat) 0..1, setLocked, setEngine
  tourelles : aimTurret(v, t, yaw, pitch), aimTurretAt(v, t, x, y, z) → atteignable ?, clearTurretTarget, setSalvo(v, t, n), setJetMode(v, t, 'droit' | 'diffus' | 'pluie'), turretStatus, predictImpact(v, t, out), reloadTurret, refill, setMast
  feux : setSiren, cycleSiren, setBeacons, setHeadlights(true | false | 'auto'), setIndicator, horn(v, secondes)
  feu et dégâts : ignite, extinguish(v, quantité, byId), explode, flip, isFlipped, flipProgress
  vol : deployDrone(pilote), recallDrone, droneOf(personId), flightStatus, takeOff, flyTo, orbit, land

INTERACTIONS ENREGISTRÉES : 'monter' (porte la plus proche pour le joueur ; poste conducteur / operateur / passager_moto pour les PNJ), 'conduire' (prioritaire devant la portière conducteur ; à bord = prendre le volant à l'arrêt), 'descendre' (sous 1,5 m/s), 'renverser' (voiture légère vide, proposé spontanément aux seuls manifestants ; 6 personnes × 8 s par défaut). Le module du mobilier enregistre aussi 'renverser' : deux gestionnaires pour un même verbe coexistent.

ÉVÉNEMENTS DU CONTRAT ÉMIS : vehicle:collision (otherKind 'world' | 'prop' | 'vehicle' | 'person'), vehicle:state, vehicle:siren, vehicle:turret_fired, vehicle:entered, vehicle:exited, fire:started / fire:out (targetKind 'vehicle'), explosion (kind 'vehicule'), prop:moved, fx ('jet_eau', 'eclaboussure', 'explosion', 'etincelles', 'fumee'), sfx ('canon_eau', 'lanceur_tir', 'klaxon', 'explosion_vehicule', 'petard', 'tole', 'drone').
ÉVÉNEMENTS LIBRES ÉCOUTÉS : 'drone:toggle' { personId } ; 'hazards:douse' { x, z, radius, amount } (éteint les véhicules touchés).
ÉVÉNEMENTS LIBRES ÉMIS : 'vehicles:drone' { vehicleId, personId, state }, 'vehicles:flipped' { id, x, z, byId }, 'vehicles:cleared' { vehicleId, propId, x, z }, 'vehicles:service' { id, turret, type, state }, 'vehicles:lights' { id, beacons, headlights, indicator }, 'vehicles:autopilot' { id, state, reason }.

CONVENTIONS À CONNAÎTRE
- Qui conduit : un véhicule terrestre n'obéit à Vehicle.cmd que s'il a un occupant au siège conducteur, OU le pilote automatique, OU si un autre module pose Vehicle.brain (non nul) pour signaler qu'il pilote par cmd. Sinon il reste frein serré et s'endort.
- Vehicle.y = sol sous le véhicule (engin volant : altitude de l'appareil). speed signée. yawRate = d(heading)/dt, positif = virage à gauche. steerAngle positif = roues à droite. pitch positif = nez levé. roll positif = penche à droite (une moto penche dans le virage). rpm = tr/min réels. gear : −1, 0 (moteur coupé ou personne aux commandes), 1…n.
- turretYaw POSITIF = vers la DROITE : cap monde = heading − turretYaw (aligné sur src/render/vehicles). turretPitch positif = canon levé. Écriture directe bornée par TurretDef et limitée en vitesse de pointage.
- fireTurret : lance-grenades = salve de setSalvo() coups, un toutes les 0,3 s ; canon à eau = détente tenue, l'appel doit être répété à chaque pas (le jet s'arrête 0,25 s après le dernier appel). vehicle:turret_fired est réémis toutes les 0,5 s pendant un jet (tient la boucle sonore du module audio).
- turretAmmo des deux canons de l'engin lanceur d'eau = la même cuve (valeurs égales, ne pas additionner).
- Tourelle ↔ siège : la n-ième place 'gunner' sert la n-ième tourelle ; la caméra du mât du Centaure revient au chef d'engin (siège 1).
- Occupant : Person.y = Vehicle.y + SeatDef.y − 0,42 (SEAT_FEET_DROP) ; posture 'seated' ; upper 'drive' ou 'ride' (réaffirmé seulement quand upper vaut 'none').
- DamageInfo.knockback en m/s ; au-dessus de 4,2 (jet droit à moins de 15 m) c'est le seuil de chute du module des personnes.
- Santé neutre : si ctx.health est le service neutre du cœur, le module applique lui-même recul (déplacement) et mouillage ; sinon il laisse faire le module de santé.
- Extinction : 1 unité d'agent = 1 s d'extincteur ; 65 unités éteignent un véhicule embrasé ; le canon à eau en dépose 3 par seconde, la lance des pompiers 2,5.
- Balistique : g = 9,81 ; la traînée des grenades est lue auprès du service 'items' (projectileSpec(kind).drag) s'il est branché, 0 sinon.
- Aides de test réutilisables dans '@/sim/vehicles/testkit' : createFakeWorld (murs, surfaces, relief, petit graphe routier avec findPath), createFakeHazards, createFakeTraffic, createRecordingProps, createVehicleBench.

## Mesures

COÛT PAR PAS (temps processeur, Node 22, pas de 1/30 s, moteur + module ; charge de référence 10 millions de sin·cos ≈ 190 à 210 ms sur cette machine) — objectif < 1,5 ms :
- 150 véhicules en ville (40 sous pilote automatique dont 39 roulent, 110 garés endormis, 120 piétons) : 0,22 ms
- 150 véhicules dans le vrai module du monde (30 pilotés, 120 garés), monde compris : 0,25 à 0,29 ms
- pire cas, 150 véhicules tous en mouvement au milieu de 200 personnes : 0,32 à 0,38 ms
- 150 véhicules garés : 14 à 18 µs
- ramasse-miettes pendant 60 s simulées (60 véhicules roulants, 60 piétons) : 0 ou 1 passage selon l'exécution

CONDUITE (bitume sec) — 0 → 50 km/h / arrêt depuis 50 km/h :
fourgon CRS 7,3 s / 12,1 m ; car de transport 15,8 s / 14,6 m ; véhicule de commandement 7,6 s / 12,1 m ; voiture de police 4,6 s / 10,2 m ; fourgon cellulaire 8,0 s / 12,3 m ; Centaure 11,7 s / 14,6 m ; engin lanceur d'eau 18,3 s / 15,9 m ; moto BRAV-M 3,0 s / 9,6 m ; fourgon-pompe 10,9 s / 13,6 m ; ambulance 6,6 s / 11,8 m ; berline 5,1 s / 10,3 m ; citadine 5,6 s / 10,3 m ; SUV 5,1 s / 10,6 m ; taxi 5,3 s / 10,6 m ; utilitaire 6,6 s / 11,4 m ; camion 14,5 s / 14,6 m ; autobus 14,1 s / 14,4 m ; scooter 4,7 s / 11,8 m ; camion sono 11,6 s / 13,5 m.
Berline : 10,3 m sur bitume sec, 11,5 m sur pavés secs, 20,3 m sur pavés mouillés.

AUTRES RELEVÉS : barricade dégagée à la lame en 2,3 s ; citadine retournée par 6 personnes en 6,5 s ; voiture embrasée éteinte au canon à eau en 26 s ; feu au sol éteint en 3,5 s ; convoi de 4 fourgons : intervalles 6,23 / 6,20 / 6,12 m pour 6 demandés, écart latéral 0,01 m ; stationnement en bataille : 0,11 m et 0,5° en 37 s ; rang de 3 fourgons garé en 98 s ; suivi d'un piéton : 6,02 à 6,23 m pour 6 demandés ; drone : toit franchi avec 5,2 m de marge ; hélicoptère : rayon 300 à 303 m ; grenade avec le vrai module des objets : 0,42 m d'écart.

VOLUME : 22 fichiers source (7 480 lignes, le plus gros 623), 12 fichiers de tests (3 852 lignes, 126 tests).

## Non fait / fragile

- CONVENTION turretYaw en conflit : le rendu (src/render/vehicles) et mon module prennent « positif = vers la droite », le contrôleur du joueur (src/sim/people/player-vehicle.ts) écrit « positif = vers la gauche » : en l'état, la tourelle d'un joueur tireur partirait en miroir. À trancher par l'intégrateur (une ligne à inverser d'un côté ou de l'autre)
- Non branché dans src/main.ts (réservé à l'intégrateur) ; aucun essai dans le navigateur ni e2e : module de simulation pure, vérifié uniquement sous Node
- Pilote automatique : pas de feux tricolores ; priorité limitée à une règle de priorité à droite entre deux véhicules pilotés. Dans un essai de 40 véhicules à destinations aléatoires sur un quadrillage 5 × 5, la circulation finit en embouteillage : la régulation fine reste au module de trafic
- Pilote automatique : pas de recalcul d'itinéraire autour d'une rue fermée ou d'un obstacle ; il s'arrête et signale 'bloque' (motif 'fermeture' ou 'obstacle'), à l'appelant de redonner une destination. Les fermetures sont repérées par proximité géométrique (6 m) faute d'identifiants d'arêtes dans findPath
- Stationnement : en rang serré dans une rue étroite, après 3 reprises l'arrivée est acceptée même de travers ; le rang n'a été testé que sur terrain dégagé, la place isolée dans une rue. Virages d'un autocar ou du Centaure dans des rues étroites non testés sous pilote automatique
- Conduite : pas de patinage ni de blocage de roues modélisés au-delà du cercle d'adhérence, pas de suspension, pas de tonneau (un camion tient 0,7 g en virage), pas de bordures de trottoir ; les deux-roues utilisent le même modèle avec une simple inclinaison visuelle et ne tombent jamais
- Collisions avec le décor par disques : un coin de carrosserie peut mordre un mur de 15 à 20 cm ; la séparation entre deux véhicules est une translation (la rotation ne vient que des impulsions)
- Incendie : durées réalistes (15 à 25 min de feu), donc une carcasse 'burnt' apparaît rarement dans une mission de 25 min sans monter tuning.fireTimeScale ; probabilités d'explosion arbitraires ; l'extinction par l'événement 'hazards:douse' n'a été testée qu'avec un événement émulé d'après src/sim/hazards/api.ts, pas avec le vrai module des dangers
- Tourelles : diffuseurs de lacrymogène du Centaure non faits ; pas de mode 'impulsions' ni de mode mousse distinct pour le canon ; le tir en roulant n'est pas compensé ; la compensation du vent pour les grenades existe mais n'est pas testée ; la caméra du mât se limite à l'orientation et à la hauteur
- Vol : pas de périmètre d'arrêté ni de limite à deux appareils ; l'évitement du bâti sonde deux points devant le drone (une structure très fine peut échapper) ; l'hélicoptère n'a pas de séquence de décollage (il apparaît en orbite)
- Autobus : conducteur + 28 places assises au lieu de 1 + 80 (voyageurs debout non modélisés)
- L'évacuation d'une épave ou d'un véhicule en feu fait aussi descendre le joueur ; une personne en garde à vue ne peut pas descendre d'elle-même (au module de droit d'appeler exit)
- Le recul du jet et le choc piéton avec le vrai module des personnes ont été constatés une fois à la main, sans test conservé
- Mesures : faites en temps processeur (process.cpuUsage) parce que la machine était saturée ; les temps réels observés étaient 5 à 8 fois plus élevés et inexploitables. Sur les 5 fichiers en échec de la suite complète, seuls deux ont été identifiés dans la sortie tronquée (aucun n'est vehicles.*, vérifié par l'exécution séparée de mes 12 fichiers)
- Aucun commit effectué : ce n'était pas demandé

## Demandes d'évolution du contrat

- Vehicle.turretYaw / turretPitch : fixer le signe dans le contrat. Proposition (celle du rendu et de ce module) : gisement positif = vers la DROITE du véhicule, cap monde = heading − turretYaw ; site positif = canon levé. src/sim/people/player-vehicle.ts applique aujourd'hui l'inverse
- Vehicle : préciser les conventions retenues ici — rpm en tr/min réels ; gear −1 / 0 / 1…n ; yawRate = d(heading)/dt (positif = à gauche) ; steerAngle positif = à droite ; pitch positif = nez levé ; roll positif = penche à droite ; y = sol sous le véhicule (altitude de l'appareil pour un engin volant)
- Vehicle.brain / VehicleCommand : écrire qui a le droit de piloter par cmd. Règle appliquée : cmd n'est obéi que s'il y a un occupant au siège conducteur, le pilote automatique, ou brain non nul (module qui pilote sans conducteur)
- VehicleApi : les tourelles n'ont dans le contrat ni visée d'un point, ni taille de salve, ni mode de jet, ni rechargement / ravitaillement, ni fin de tir. Tout cela est dans 'vehicles.ext' ; proposition : promouvoir au contrat aimTurretAt, setSalvo, turretStatus, et ajouter un événement de fin de jet (aujourd'hui vehicle:turret_fired est réémis toutes les 0,5 s)
- TurretDef.capacity pour deux canons sur une même cuve : préciser que les deux compteurs turretAmmo désignent la même réserve (ou ajouter une réserve au niveau du véhicule)
- DamageInfo.knockback : préciser l'unité (m/s, comme le module des personnes et ce module l'entendent) et le rôle de dirX / dirZ
- PropApi : pas de moyen de renverser un objet ni de déplacer ou neutraliser un objet non mobile. Ce module écrit directement prop.toppled, déplace prop.x / z sous la lame et pose blocksMove = false quand une barricade est dégagée. Proposition : PropApi.topple(prop, byId) et PropApi.clear(prop, byId), ou l'inscrire comme usage admis
- HazardApi.douse et l'événement libre 'hazards:douse' ne portent pas l'auteur : fire:out d'un véhicule éteint par ce biais a byId = 0. Proposition : ajouter byId
- TrafficControlApi / WorldQuery.findPath : l'itinéraire ne donne pas les arêtes empruntées et ne sait pas éviter une rue fermée. Proposition : une option de findPath pour exclure des arêtes, ou isClosedAt(x, z)
- InteractionApi neutre du cœur : startVerb appelle encore find(actor) sans transmettre targetId alors que le contrat prévoit find(actor, targetId?) ; mes gestionnaires acceptent la cible, mais startVerb n'aboutit que si la meilleure cible spontanée est la bonne
- SeatDef / Person.y : préciser que SeatDef.y est la hauteur de l'assise et où se trouvent les pieds d'un occupant (ici Vehicle.y + SeatDef.y − 0,42)
- GameEvents : pas d'événement pour gyrophares, phares et clignotants (j'émets l'événement libre 'vehicles:lights'), ni pour le pilote automatique, le drone ou un véhicule retourné ; à officialiser si l'interface ou les missions s'en servent
- VehicleDef ne décrit ni moteur, ni tenue de route, ni jets, ni lanceur, ni vol : ces données sont dans VehicleSpec (ext.spec(kind)). À laisser hors contrat ou à y ajouter un champ libre
- Vehicle:siren est émis à la fois par le contrôleur du joueur et par ce module quand l'état change ; je synchronise pour éviter le doublon, mais il faudrait désigner un seul émetteur dans le contrat (proposition : ce module, les contrôleurs se contentant d'écrire Vehicle.siren)

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/sim/vehicles et tests/unit/vehicles.* (aussi avec --noUnusedLocals --noUnusedParameters) ; les erreurs restantes du dépôt sont dans src/sim/roles/archetypes (autre contributeur)
- npx vitest run tests/unit/vehicles. : 12 fichiers, 126 tests, tous verts (dernière exécution après les dernières retouches)
- Définitions : 21 types, gabarits du tableau C (Centaure 7,5 × 2,94 × 3,82 m, 14,5 t, 10 places, 30 tubes ; engin lanceur d'eau 9,67 m, 29 t, 2 canons, 10 000 l), sièges dans la caisse, conducteur à gauche, sorties à l'extérieur, chaque tourelle armée servie depuis un siège
- 0 → 50 km/h et arrêt depuis 50 km/h dans des fourchettes plausibles pour les 19 types terrestres (chiffres dans metrics) ; vitesse maximale et marche arrière respectées
- Rayon de braquage à basse vitesse conforme à l'empattement et au braquage pour les 19 types ; sous-virage à 70 km/h volant à fond (accélération latérale plafonnée à l'adhérence, rayon réel > 1,8 × rayon des roues, pas de tête-à-queue)
- Frein à main : dérive > 30° contre moins de 17° sans ; pavés mouillés : adhérence < 0,45, freinage 20,3 m contre 10,3 m sur bitume sec
- Pente de 8 % (assiette, altitude, montée plus lente, tenue au frein, véhicule garé immobile) ; boîte : 6 rapports montés sans pompage, régime entre ralenti et régime maxi
- Stabilité : même manœuvre de 14 s à 1/20, 1/30, 1/60 et 1/120 s (écart de position < 3 %) ; commandes aléatoires brutales et NaN sur 5 types pendant 60 s au pas maximal sans divergence
- Mur (monde factice) : arrêt sans pénétration à 50 km/h, véhicule endommagé, conducteur secoué, épave à 90 km/h, glissement le long d'un mur abordé de biais, blindé presque intact, aucun passage à travers un mur de 0,3 m à 130 km/h au pas de 0,05 s
- Piéton heurté à 30 km/h : une seule blessure de type 'vehicle' avec recul, événement vehicle:collision, aucune déclaration pour un civil ; conducteur CRS : une entrée 'vehicule' au journal de la force ; foule repoussée au pas sans blessé ; personne à terre : 'crush'
- Lame (service de décor factice qui consigne push et damage) : barricade dégagée en 2,3 s, repoussée de 4,1 m, événement 'vehicles:cleared', Centaure intact ; une voiture ordinaire est arrêtée par la même barricade ; épave de voiture repoussée, autocar de 18 t non déplacé
- Incendie : Molotov (dégât 'burn'), feu au sol après délai, propagation à 1,4 m mais pas à 10 m, fumée et ignite appelés, explosion avec personnes soufflées et voisin touché, jamais d'explosion à probabilité nulle, carcasse 'burnt' qui repousse un disque, extinction (15 unités pour un début de feu, 26 s de canon pour un véhicule embrasé), évacuation des occupants valides
- Retournement : 6 manifestants couchent une citadine en 6,5 s (infraction 'degradation' pour chacun) ; 2 n'y arrivent pas ; fourgon, blindé et voiture occupée refusés
- Sièges : positions des 6 occupants d'un fourgon égales au siège à 1e-6 près en virage, sortie côté porte, sortie de l'autre côté quand un mur, un véhicule ou un conteneur bouche la porte, moteur coupé à la descente du conducteur sauf gyrophares, règles police / secours / verrou / épave ouverte, menotté sans option
- Salve du Centaure : coup unique à moins de 0,6 m du point désigné (formule balistique indépendante dans le test), salve de 6 à 0,3 s d'intervalle centrée à moins de 3 m avec 8,9 m d'éventail, salve de 30 sur plus de 40 m de large, charges 50 / 100 / 200 m, refus au-delà de 200 m et en deçà de la portée minimale, rechargement de 120 s à l'arrêt seulement, une seule recharge
- Canon à eau : 15 / 12 / 8 l/s selon le mode, cuve partagée, personnes repoussées (recul 2 à 3 m/s, 4,5 à moins de 15 m) et mouillées, voisin hors du jet intact, mur qui arrête le jet, feu au sol éteint en 3,5 s avec un service de dangers factice, poubelle renversée, ravitaillement 90 s interrompu en roulant, déclaration 'canon_eau' du tireur policier, aucune déclaration pour l'extinction ni pour la lance des pompiers
- Drone : déploiement par 'drone:toggle', stationnaire sans dérive (< 5 cm en 10 s), commandes, plafond 120 m, plancher 2 m, immeuble de 45 m franchi 5,2 m au-dessus du toit, immeuble de 200 m non franchi et non pénétré, retour automatique à 15 % de batterie puis disparition, vent fort (consommation × 1,5), rappel auprès du télépilote, chute et blessure ; player.control.setRemoteVehicle et caméra 'drone' pour le joueur ; hélicoptère : orbite 300 à 303 m de rayon à 400 m
- Pilote automatique sur graphe factice : 510 m en 69 s sur sa voie de droite avec virage à 12 km/h et un seul appel à findPath, arrêt à 2,57 m d'un piéton puis klaxon et reprise, piéton qui traverse, véhicule arrêté, barricade ('bloque'), Centaure qui pousse, rue fermée respectée puis franchie en urgence sirène allumée, demi-tour d'un fourgon dans une rue de 9 m sans quitter la chaussée, carrefour à deux véhicules sans accrochage
- Formations : convoi de 4 fourgons arrivé avec intervalles 6,23 / 6,20 / 6,12 m, écart latéral 0,01 m, écart de cap 0,4° ; stationnement en bataille à 0,11 m et 0,5° ; rang de 3 fourgons (cap ± 1,4°, nez alignés à 1 cm) ; épi et file
- Vrai module du monde (quartier d'essai) : 4 voitures lancées contre des façades jamais dans le bâti ; itinéraire de 966 m parcouru en 117 s, 0 contact avec le décor, jamais hors chaussée
- Vrai module des objets (import dynamique, test sans objet s'il est absent) : grenade de 56 mm simulée par lui avec sa traînée, ouverte en l'air, chute prévue à 0,42 et 0,43 m du point désigné
- Vrai module des personnes, essai manuel non conservé : santé non neutre détectée, cible repoussée de 6,8 m en 3 s de jet, piéton heurté mis à terre et projeté sur le côté, occupants tenus sur leur siège malgré la locomotion
- Suite complète du dépôt (npx vitest run, lancée avant les dernières retouches) : 132 fichiers verts sur 137, 1 954 tests verts sur 1 958 ; les échecs lus dans la sortie sont hors de mon module (people.crowd : seuil de temps réel, world-buildings.paris : délai dépassé)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/runtime.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/defs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/specs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/physics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/geometry.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/collide.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/damage.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/seats.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/ballistics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/turret-aim.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/turrets.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/jet.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/flight.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/autopilot.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/autopilot-drive.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/autopilot-state.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/autopilot-sense.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/lights.ts
- /home/user/SafeDeal/crs-simulation/src/sim/vehicles/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.defs.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.physics.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.collision.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.fire.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.seats.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.turrets.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.flight.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.autopilot.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.lights.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.world.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/vehicles.items.test.ts
