# Compte rendu — ia:commandement

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Commandement automatique, unités spéciales et convoi écrits dans src/sim/police/command/ (20 fichiers, environ 7 300 lignes) et branchés sur le module de police. Les 25 tests du préfixe police-command passent, les 39 tests police.* restent verts, et `npx tsc --noEmit` ne signale aucune erreur dans mes fichiers.

« Option 1 » (modèle haut de gamme pour l'IA des unités) n'appelait aucun changement de code de ma part.

Ce qui existe et tourne dans les tests :
- **Commandant IA** : dispositif initial (barrages aux débouchés latéraux, garde des sites sensibles, réserve mobile), accompagnement du cortège, fermetures de rues, fermeture de station de métro, délégation des incidents, relèves et ravitaillement, dispersion, rembarquement et message « Fin de mission, retour à la base ». L'aptitude est réglable.
- **Procédure** : il se porte au contact, prononce les sommations au mégaphone par `ctx.actions`, puis autorise la force par `ctx.law.authorize`. Hors riposte, aucun ordre de force ne part avant.
- **Adjoint du joueur-commandant** : il ne donne aucun ordre ; il propose par radio (« Chef, groupe hostile en formation rue X, je propose un bond offensif »), à cadence réglable, et exécute ce que le joueur accepte.
- **BRAV-M** : colonne, pied à terre simultané, approche à pied, interpellation sur fait constaté uniquement, retour et remontée.
- **Centaure** : progression au pas avec les gendarmes derrière la caisse, salve de tourelle sous contrôle légal, barricade poussée à la lame après vérification et annonce.
- **Canon à eau** : placement derrière la ligne, extinction, jet sur la foule seulement si autorisé, gestion de la cuve et repli pour le plein.
- **Drone** : télépilote IA au-dessus du point chaud ou d'un groupe désigné, observations versées au tableau de situation du commandant.
- **Convoi** : arrivée en colonne, stationnement aligné, débarquement en ligne, rembarquement et départ.

Dans le scénario de quinze minutes avec le vrai module de foule : sommations à 327, 342 et 357 s, premiers gaz à 371 s, 4 emplois de la force tous licites, feu délégué à 105 s et éteint à 159 s, 9 fermetures de rues, fin de mission à 975 s avec 83 agents sur 83 à bord.

Trois limites à connaître avant d'intégrer :
- **Couverture partielle du parcours** : une seule compagnie n'a tenu que 4 des 12 emplacements prévus dans ce scénario. Les 3 débouchés de la place de départ n'ont jamais été tenus.
- **Doublures de test** : incidents, fermetures de rues et directeur sont des doublures dans mes tests. Les modules réels src/gameplay/incidents et src/sim/roles/rescue, apparus pendant mon travail, n'ont pas été composés avec le commandement.
- **Module de police modifié** : sept fichiers touchés pour le branchement, dont `createSystems()` de src/sim/police/index.ts qui renvoie maintenant aussi le système de commandement.

Je n'ai fait aucun commit. Des commits automatiques « Save in-progress build files » ont déjà embarqué l'essentiel ; restent non commités bravm.ts, command.ts, react.ts et deux fichiers de test.

## API publique et mode d'emploi

BRANCHEMENT
- Rien à ajouter si la composition utilise déjà `createSystems()` de `/home/user/SafeDeal/crs-simulation/src/sim/police/index.ts` : il renvoie maintenant `[new PoliceSystem(), new CommandSystem()]`.
- `src/sim/police/command/index.ts` exporte aussi un `createSystems()` (commandement seul) et `CommandSystem`. Ne pas enregistrer les deux.
- Système : id `'police.command'`, ordre `SystemOrder.CONTROL + 5` (juste après l'IA des unités).
- Types publics à importer en `import type` depuis `src/sim/police/command/api.ts`.
- Prise en charge automatique (`tuning.autoAssume`) : toute compagnie créée reçoit un commandement. Mode `'ia'` si son chef n'est pas le joueur, `'adjoint'` si c'est lui. L'IA ne pilote jamais `person.isPlayer`.
- Les unités spéciales créées par `'police.units'` (createBravm, createEquipage 'centaure' / 'canon_eau') sont reconnues et rattachées automatiquement.

SERVICES FOURNIS
1. `ctx.service<CommandApi>('police.command')` :
   - `tuning: CommandTuning`
   - `assume(companySquadId, options?: { mode?: 'ia'|'adjoint'; aptitude?: number; base?: {x, z} }): boolean`
   - `release(companySquadId): void`
   - `stateOf(companySquadId): CommandState | null`
   - `commands: readonly CommandState[]`
   - `attach(companySquadId, unitSquadId): void`
   - `escort(centaureSquadId, footSquadId): void`
   - `endMission(companySquadId): void`
   - `requestSommation(companySquadId, x, z): boolean`
   - `hotspots: readonly HotSpot[]`, `observations: readonly Observation[]`, `decisions: readonly CommandDecision[]`
   - `proposals: readonly Proposal[]`, `accept(proposalId): boolean`, `dismiss(proposalId): void`
   - `createDroneTeam(options?: { x?, z?, heading?, callsign?, parentId?, deploy? }): UnitHandle`
   - `special(squadId): SpecialStatus | null`, `specials: readonly SpecialStatus[]`
   - `arrive(squadId, dest: ConvoyDestination): boolean` avec `ConvoyDestination = { x, z, heading, layout?: 'bataille'|'epi'|'file', lineX?, lineZ?, lineHeading?, disembark? }`
   - `depart(squadId, exit?: {x, z}): boolean`
   - `convoyOf(squadId): ConvoyStatus | null`
2. `ctx.service<CommandPost>('command.post')` : `{ atVehicle: boolean; vehicleId: EntityId; lost: boolean; commanderId: EntityId }`.
3. `'police.internal'` : noyau du module de police, privé, réservé à command/.

Formes principales :
- `CommandState { squadId, mode, phase: 'arrivee'|'mise_en_place'|'conduite'|'fin'|'termine', commanderId, aptitude, reserveId, posts: Post[], deployedAt, sommations: 'aucune'|'approche'|'en_cours'|'force_autorisee'|'armes_autorisees'|'halte', authorized: ForceLevel, missionEnded, closuresAsked, stationsClosed, delegated, resolved }`
- `Post { kind: 'barrage'|'site'|'reserve', x, z, heading, width, s, name, importance, state: 'prevu'|'ordonne'|'tenu'|'barrieres'|'leve', squadId, closureId, pedestrian }`
- `HotSpot { id, x, z, heat, kind: 'violences'|'casse'|'feu'|'barricade'|'groupe_hostile'|'compression', weights, firstAt, lastAt, seen, knownAt, againstPolice }`
- `Proposal { id, key, text, x, z, t, saidAt, priority, executable }`
- `SpecialStatus { squadId, kind: 'bravm'|'centaure'|'canon_eau'|'drone', stage, vehicleId, order, supply, targetId, x, z }`
- `ConvoyStatus { squadId, stage: 'route'|'stationnement'|'debarquement'|'en_place'|'rembarquement'|'depart'|'parti'|'echec', vehicles, parked, alignError, headingError, t0 }`

ÉVÉNEMENTS LIBRES ÉMIS (`ctx.events.onAny`)
- `'command:state'` `{ squadId, phase, previous }`
- `'command:decision'` `CommandDecision { t, squadId, key, text, unitId, order, x, z }`
- `'command:proposal'` `Proposal` (au moment où l'adjoint la dit à la radio)
- `'command:deployed'` `{ squadId, posts, held, t }`
- `'command:mission_end'` `{ squadId, t }`
- `'command:observation'` `Observation { t, kind, x, z, count, hostile, vehicleId }`
- `'command:special'` `{ squadId, kind, stage, ok, reason }`
- `'command:convoy'` `{ squadId, stage }`
- Les unités spéciales émettent aussi les événements du module de police : `'police:order_done'`, `'police:order_refused'`, et l'événement d'emploi de la force (`FORCE_USED_EVENT`, `{ squadId, means, x, z, byId }`) pour la salve du Centaure et le jet du canon.

ÉVÉNEMENTS ÉCOUTÉS
- Typés : `'session:started'`, `'order:issued'` (un ordre du joueur suspend l'initiative de l'IA sur l'unité), `'projectile:spawned'`, `'person:hurt'`, `'person:down'`, `'shop:window'`, `'shop:looted'`, `'fire:started'`, `'barricade:built'`.
- Libres : `'police:in_place'`, `'police:order_done'`, `'crowd:density'`, `'crowd:signal'` (`CrowdSignal { kind, x, z, count?, strength?, t?, id? }`), `'crowd:alea'`, `'crowd:metro'`, `'vehicles:cleared'`.

SERVICES CONSOMMÉS (tous facultatifs, chacun testé pour null)
- `ctx.director`, `'police.status'`, `'police.formation'`, `'police.units'`
- `'vehicles.autopilot'`, `'vehicles.ext'`
- `'law.advisor'`, `'law.config'`, `'law.handover'`
- `EXT.incidents`, `EXT.traffic`, `EXT.metro`, `EXT.rescue`
- `'crowd.core'` (lu pour `basePhase`, car la phase du directeur est masquée par 'tension')
- `'crowd.signals'` (forme supposée `{ list?: CrowdSignal[]; active?: CrowdSignal[] }`)

CLÉS LUES DANS `session.config.extra` (toutes facultatives)
- `commandement` : `'ia'` | `'joueur'` (adjoint) | `'aucun'`. Force le mode.
- `commandement.aptitude` : nombre 0..1, défaut 0,75.
- `commandement.adjoint` : secondes entre deux propositions, 0 = muet, défaut 20.
- `poste` : `'salle'`. Salle de commandement : l'officier IA prononce les sommations sur `requestSommation`.
- `law.attroupement` (clé du module law) : booléen, lu pour savoir si l'attroupement est déjà qualifié.

RÉGLAGES (`api.tuning`, modifiables à chaud)
- Commandement : `autoAssume` true, `aptitude` 0.75, `adjointInterval` 20 s, `thinkInterval` 1 s, `horizon` 320 m, `liftBehind` 60 m, `reactHeat` 0.9, `megaphoneRange` 45 m.
- BRAV-M : `bravmStandoff` 60 m, `bravmSpeed` 11 m/s, `bravmSlow` 5.5 m/s.
- Centaure : `centaurePace` 1.67 m/s, `centaurePush` 1.8 m/s.
- Canon : `canonBehind` 12 m, `canonLow` 0.12, `canonMinStraight` 15 m.
- Drone : `droneAltitude` 60 m, `droneOrbit` 25 m.
- Convoi : `convoyGap` 6 m, `convoySpeed` 8.3 m/s.

CONVENTIONS DES ORDRES AUX UNITÉS SPÉCIALES (`ctx.squads.issue` sur l'unité)
- BRAV-M : `avancer`/`colonne` (x, z) ; `interpeller` (targetId ou x, z) déroule toute l'interception ; `debarquer` ; `embarquer` ; `repli`/`cesser`.
- Centaure : `avancer`/`refoulement` (x, z) ; `disperser_gaz` (x, z, `width` = nombre de coups, 0 = dosage automatique) ; `degager_barricade` (targetId ou x, z).
- Canon à eau : `proteger`/`suivre` (targetId = unité ou personne, placement derrière la ligne) ; `eteindre` ; `refoulement` (refus motivé si non autorisé) ; `ravitailler`.
- Drone : `avancer` (x, z) ; `suivre` (targetId) ; `libre` ; `repli`/`cesser`.

POINTS D'EXTENSION
- `Kernel.orderHook` (src/sim/police/kernel.ts) : une unité spéciale revendique un ordre avant le traitement standard.
- Classe abstraite `SpecialUnit` et `SpecialRegistry` (special.ts) pour ajouter un type d'unité.
- `Command.act(key, priority, x, z, advice, exec)` : toute décision passe par là. En mode IA elle s'exécute, en mode adjoint elle devient une proposition acceptable par `accept(id)`.
- Toutes les phrases radio sont dans texts.ts.
- testkit.ts fournit `startCommand`, `createTestDirector`, `createTestServices` (doublures incidents et circulation) pour d'autres tests.

## Mesures

Coût du système 'police.command' par pas (dt 1/30 s) :
- 1 590 personnes, compagnie, Centaure, canon, BRAV-M, drone, 5 points chauds, test lancé seul : moyenne 0,025 à 0,028 ms ; p95 0,13 ms ; max 2,4 à 4,3 ms sur 1 800 pas.
- Même test lancé en parallèle des autres fichiers : moyenne 0,08 à 0,17 ms ; max 24 à 191 ms.
- Manifestation de 15 min (environ 400 personnes, 19 510 pas, 975 s simulées en 82 s réelles tout compris) : moyenne 0,051 ms ; p95 0,071 ms ; max 87 ms.
- Planification du dispositif : un pas de 6 à 8 ms, une seule fois vers t = 0,3 s.

Scénario de 15 min :
- Dispositif en place à 132 s ; barrages utiles tenus 125 s avant la tête du cortège.
- Sommations à 327, 342, 357 s ; gaz à 371 s ; 4 emplois de la force, 0 illicite.
- Feu délégué en 5 s, éteint en 59 s.
- 9 fermetures de rues ; 325 observations du drone.
- Fin de mission à 975 s, 83 sur 83 à bord.

Unités spéciales :
- BRAV-M : interception complète en 226 s.
- Centaure : salve de 6 grenades à 2,8 m du centre visé (130 m) ; barricade dégagée en 27,5 s.
- Canon : feu éteint en 6 s avec 42 l.
- Convoi : 8 véhicules garés à 0,00 m et 0,0° d'écart, stationnement en 139 s, rembarquement 45 sur 45.

Tests : 25 police-command et 39 police.*, tous verts. Volume : 20 fichiers source (7 300 lignes) et 4 fichiers de test (1 315 lignes).

## Non fait / fragile

- Couverture du parcours partielle : dans le scénario de 15 min, 4 emplacements tenus sur 12 prévus. Les 3 débouchés de la place de départ n'ont jamais été tenus (jugés inatteignables à temps, la compagnie partant du quai) ; les 5 derniers n'ont pas été nécessaires, le cortège n'ayant pas dépassé environ 350 m.
- Le dispositif est déclaré en place à 132 s alors que le cortège part à 96 s : chaque barrage tenu l'est avant le passage de la tête, mais pas avant le départ.
- Incidents, fermetures de rues et directeur : testés avec des doublures de testkit.ts. Les modules réels src/gameplay/incidents et src/sim/roles/rescue n'ont pas été composés avec le commandement ; seule la conformité aux types de src/core/extensions.ts est assurée.
- Voie pompiers / SAMU (EXT.rescue) : codée, jamais exécutée dans un test.
- Service 'crowd.signals' : n'existe pas. Forme supposée, lecture codée, non testée avec un fournisseur réel ; l'événement 'crowd:signal' est écouté mais rien ne l'émet aujourd'hui.
- Fermeture de station de métro : observée dans les journaux du scénario avec le métro du module de foule, sans assertion de test.
- Relèves et ravitaillement décidés par le commandant : codés, non exercés par un test.
- Riposte de l'IA sous attaque réelle : vérifiée seulement à travers les propositions de l'adjoint, pas par un test où l'IA riposte elle-même.
- BRAV-M : colonne en file simple (intervalles 2,4 à 14,8 m), pas en binômes de front.
- Canon à eau, refoulement : seul le mode « pluie » a été atteint en test ; les modes diffusé et jet droit sont codés, non observés.
- Canon à eau, plein : il ne roule vers la bouche d'incendie que si elle est à plus de 45 m ; le pilote automatique échoue au demi-tour d'un engin de 9,7 m dans une rue de 14 m, auquel cas le plein se fait sur place après 25 s de blocage.
- Centaure, barricade : la poussée est conduite à la main dans step() (plein gaz, recul et nouvel élan) parce que le pushThrough du pilote automatique calait.
- Service 'command.post' : publié, non testé ; pas d'escorte ni de déplacement du véhicule de commandement.
- Délais longs : la ligne d'appui de la réserve met environ 225 s à arriver dans le scénario ; le stationnement est séquentiel (8 véhicules en 139 s) ; la fin de mission tombe à 16 min 15 s simulées.
- Lignes minces sur les avenues de 40 m ; les unités rejoignent les emplacements éloignés en ligne (individuellement), pas en colonne.
- Pics de coût non élucidés à coup sûr : un pas de planification du dispositif coûte 6 à 8 ms une fois, vers t = 0,3 s (reproductible, hors de la fenêtre mesurée du test de coût). Les autres pics (4 ms, rarement 50 à 400 ms) changent de place d'un passage à l'autre, ce qui désigne la machine partagée ou le ramasse-miettes, sans preuve.
- Zéro allocation en boucle chaude : non mesuré par un profileur. Les tableaux de travail sont réutilisés, mais les décisions, observations et phrases radio allouent à la cadence de réflexion (1 à 4 Hz).
- canon.ts (712 lignes) et react.ts (673 lignes) dépassent les 600 lignes.
- Module de police modifié pour le branchement : Kernel.orderHook, service privé 'police.internal', Unit.trotUntil, vitesse de trot au départ de colonne, plancher de cohésion à 0,55 au trot, createSystems qui inclut CommandSystem.
- Rien n'a été lancé dans un navigateur ; la suite de tests complète du dépôt n'a pas été lancée (seulement police-command et police.*).
- Aucun commit de ma part ; bravm.ts, command.ts, react.ts et deux fichiers de test police-command ont des modifications non commitées.

## Demandes d'évolution du contrat

- src/core/extensions.ts : ajouter les clés EXT pour 'police.command' (CommandApi) et 'command.post' (CommandPost), aujourd'hui de simples chaînes exportées par src/sim/police/command/api.ts.
- src/core/extensions.ts : définir le service 'crowd.signals' et l'événement 'crowd:signal' (signes avant-coureurs). Le commandement suppose { list?: CrowdSignal[]; active?: CrowdSignal[] } avec CrowdSignal { kind, x, z, count?, strength?, t?, id? }.
- src/core/contracts.ts, DirectorApi : exposer la phase de base du cortège sans la surcouche 'tension'. Je la lis aujourd'hui dans 'crowd.core'.basePhase.
- src/core/contracts.ts, table des événements typés : y inscrire 'command:state', 'command:decision', 'command:proposal', 'command:deployed', 'command:mission_end', 'command:observation', 'command:special', 'command:convoy', ainsi que 'police:order_done' avec un identifiant d'ordre (pour distinguer un sous-ordre interne de l'ordre final).
- src/core/contracts.ts, PropsApi : une requête spatiale incluant les objets statiques dormants (bouches d'incendie). Je parcours aujourd'hui ctx.props.list en entier pour trouver le point d'eau.

## Vérifications exécutées

- `npx vitest run tests/unit/police-command` : 4 fichiers, 25 tests verts (dernier passage après la dernière modification, 87 s).
- `npx vitest run tests/unit/police-command tests/unit/police.` : 13 fichiers, 64 tests verts. Les 39 tests police.* restent verts après mes modifications du module de police.
- `npx tsc --noEmit` : 0 erreur dans src/sim/police/ et tests/unit/police* (y compris avec --noUnusedLocals --noUnusedParameters). Le dépôt entier compte 6 erreurs, toutes dans tests/unit/incidents.perf.test.ts et tests/unit/incidents.zzprobe.test.ts, qui ne sont pas à moi.
- Contraintes, vérifiées par grep sur command/ : aucun import de Three.js, aucun DOM, aucun Math.random ni Date.now, aucun TODO. Les imports d'exécution se limitent à @/core et aux fichiers internes du module de police. Seule exception au temps par ctx.clock : performance.now() sert uniquement à mesurer le coût par pas.
- Manifestation de 15 min (quartier de test, modules réels world, people, items, hazards, law, props, vehicles, crowd ; 300 manifestants, 12 casseurs scriptés) : dispositif déclaré en place à 132 s ; barrages de la rue du Marché tenus à 127 et 131 s, tête du cortège à leur hauteur à 256 s.
- Même scénario, procédure : sommations 1, 2, 3 à 327, 342, 357 s, autorisation à 357 et 367 s, premiers gaz à 371 s, aucune attaque contre les forces ; 4 emplois de la force (lacrymogène), 0 non licite.
- Même scénario, incident de feu : conteneur allumé à 100 s, confié à MISTRAL 3 ALFA à 105 s, éteint à 159 s, incident clos et résolu.
- Même scénario, circulation et fin : 9 fermetures de rues demandées dont 8 par le commandant ; fin de mission prononcée à 975 s, 83 agents sur 83 à bord.
- BRAV-M : pied à terre des 6 opérateurs dans le même pas, motos arrêtées à 55 m de l'objectif, jamais à moins de 50 m d'un casseur, interpellé remis (handed_over), remontée en selle, 226 s au total. Sans fait constaté : aucune interpellation, journal de la force vide.
- Centaure, progression : 70,9 m à 5,6 km/h au plus, 16 gendarmes sur 16 derrière la caisse, écart latéral maximal 1,8 m.
- Centaure, salve : refusée hors cadre légal avec motif, puis 6 grenades centrées à 2,8 m de la zone désignée à 130 m, 1 emploi licite au journal.
- Centaure, barricade : vérification, annonce, poussée à la lame ; obstacle déplacé de 5,3 m et ne bloquant plus, passant voisin intact.
- Canon à eau : en place 12,4 m derrière la ligne ; feu éteint en 6 s à 22 m avec 42 l ; cuve basse, repli, plein à 10 000 l et compte rendu radio ; jet sur la foule refusé hors cadre, puis 18 personnes sur 18 repoussées de 18 m en moyenne, 1 emploi licite.
- Drone : orbite à 25 m du point à 60 m de hauteur ; suit un groupe déplacé de 97 m (écart horizontal maximal 36 m) ; 33 observations ; le point chaud devient « vu » pour le commandement.
- Convoi : 8 véhicules en colonne, stationnement avec 0,00 m d'écart à l'axe et 0,0° d'écart de cap, 38 débarqués en ligne 18,3 m devant le véhicule de tête ; rembarquement 45 sur 45, véhicule de tête reparti de 422 m.
- Dispositif (test dédié) : 8 barrages aux débouchés latéraux, face au parcours, plus la mairie gardée. Aptitude 0,15 : 3 éléments, 3 emplacements tenus, 3 fermetures. Aptitude 0,9 : 6 éléments, 4 tenus au moment du déploiement, 5 fermetures.
- Adjoint : 0 ordre donné par l'IA, y compris unité prise à partie ; propositions dites à la cadence réglée ; une proposition acceptée est exécutée.
- Salle de commandement : sur requestSommation, l'officier IA prononce la sommation 1 à 28 m de la zone, sans donner d'ordre.
- Services absents : le commandement seul, sans aucun autre module, ne fait rien et ne plante pas ; sans monde, véhicules, foule ni incidents, la compagnie se met en réserve puis prononce la fin de mission sur demande.
- Déterminisme : même graine, mêmes décisions (10), mêmes messages radio (26) et mêmes positions ; autre graine, déroulement différent. Vérifié sur un scénario court, pas sur les 15 minutes complètes.
- Coût par pas avec 1 590 personnes, compagnie, Centaure, canon, BRAV-M, drone et 5 points chauds : moyenne 0,025 à 0,028 ms, p95 0,13 ms, max 2,4 à 4,3 ms quand le test tourne seul.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/police/command/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/core.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/picture.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/plan.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/command.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/dispositif.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/react.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/delegate.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/sustain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/adjoint.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/texts.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/special.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/bravm.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/centaure.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/canon.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/drone.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/convoy.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/command/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police-command.manifestation.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police-command.unites-speciales.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police-command.convoi.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/police-command.commandement.test.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/kernel.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/brain.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/maneuver.ts
- /home/user/SafeDeal/crs-simulation/src/sim/police/mcore.ts
