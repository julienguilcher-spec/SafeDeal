# Compte rendu — ia:radicaux

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Groupes radicaux (black bloc, émeutiers, pilleurs) écrits, branchés dans la foule et vérifiés par essais sur le quartier d'essai avec les modules réels. Les 8 essais crowd-radical passent, les 33 essais crowd.* restent verts, ainsi que les 67 essais des modules qui consomment la foule (police-command, integration.foule, people.crowd, roles.archetypes.crowd, audio.crowdmix). `npx tsc --noEmit` : 0 erreur sur tout le projet.

Ce qui existe :
- **Groupes d'affinité** de 5 à 15 (ctx.squads 'affinite') avec meneur élu, cohésion, moral, plan ; un groupe tombé sous 3 valides se dissout et ses membres rejoignent un autre groupe.
- **Chaleur** = produit de la tension et de la volatilité (×1,25 la nuit) ; elle vaut exactement 0 à volatilité 0, donc rien de violent ne peut se produire. Paliers : signes 0,12, bloc 0,25, affrontement 0,4, émeute 0,6 puis 0,8.
- **Signes avant-coureurs** publiés par 'crowd.signals' : regroupement en tête, visages couverts, signal de ralliement, changement de tenue (ctx.archetypes / roles.archetypes), parapluies et banderole, dépavage, collecte, mobilier déplacé. Chacun porte type, lieu, heure et groupe.
- **Bloc** : phases dormant → signes → formation → action → repli → sauvage ou fondu. Formation compacte derrière la banderole, cortège tenu derrière le bloc, horloge commune des salves.
- **Projectiles** : tous viennent d'un objet présent (tas de pavés, chaussée pavée, verre des terrasses et conteneurs, poubelles, pavés retombés). Mortiers et engins incendiaires sont limités à la dotation du sac. Quand la rue est vide, le groupe va chercher ailleurs ou fait autre chose.
- **Actions**, toutes via ctx.actions / ctx.interactions avec solveAim : salves, tir tendu de mortier, engins incendiaires, charge sur agent isolé ou à terre, libération d'un interpellé, renvoi des grenades (raquette, ramassage, coup de pied), barricade en travers puis incendie, feux de poubelles et de véhicules, voiture renversée, casse ciblée par priorité, tags, rideaux forcés.
- **Pillage** par les opportunistes et pilleurs après bris de vitrine, avec contagion et multiplicateur de nuit.
- **Décision tactique** par utilité pour chaque groupe (rapport de force local, cible, axe, ligne qui recule ou fatiguée) et réflexes de rupture (gaz, charge, pertes, moral).
- **Repli** : recul groupé, dispersion en équipes par des rues adjacentes hors parcours puis regroupement, ou nouveau changement de tenue et fusion dans la foule ; les infractions restent sur la personne.

Dernières modifications de cette passe :
- Un « front » limité à deux groupes face à une ligne ; les suivants cassent, barricadent ou incendient pendant ce temps. Cela a rendu l'émeute plus variée (2 véhicules incendiés, vitrines, rideau forcé).
- Les issues de dispersion sont toujours cherchées hors parcours d'abord, avec un second passage sans cette règle si le quartier n'en offre pas.
- Horloge de mesure injectable (`profClock`) pour mesurer en temps processeur sur une machine chargée.
- bloc.ts et tasks.ts découpés (groupthink.ts, gestures.ts) pour respecter la limite d'environ 600 lignes.
- Instrumentation de débogage et essais temporaires supprimés.

Rien n'a été commité (non demandé).

## API publique et mode d'emploi

BRANCHEMENT
Rien à faire à la racine : `createSystems()` de '@/sim/crowd' renvoie maintenant trois systèmes : 'sim:crowd.control' (CONTROL), 'sim:crowd.radical' (SystemOrder.CONTROL + 1), 'sim:crowd.director' (RULES). `createCrowdSystems()` renvoie `{ systems, core, radical }`. Le système enregistre un BehaviorController (priorité 10) pour les profils 'radical', 'opportuniste' et 'pilleur' via `core.register`. Le cœur de la foule n'appelle jamais un contrôleur pour la personne du joueur, et le moteur de gestes s'arrête aussi sur `p.isPlayer`. Types publics à importer en `import type` depuis '@/sim/crowd' (ou '@/sim/crowd/radical/api').

SERVICES FOURNIS
- 'crowd.signals' (constante CROWD_SIGNALS) : `SignalsApi { readonly list: readonly CrowdSignal[]; readonly activeCount: number; near(x, z, radius, out: CrowdSignal[]): number }`.
  `CrowdSignal { id; type: 'regroupement' | 'visages_couverts' | 'signal_ralliement' | 'changement_tenue' | 'parapluies' | 'depavage' | 'collecte' | 'mobilier_deplace'; label (français, affichable); x; z; t; until (Infinity tant qu'il dure); groupId; squadId; count; active }`. Les signes terminés restent dans `list`.
- 'crowd.radical' (constante CROWD_RADICAL) : `RadicalApi { readonly active; readonly heat (0..1); readonly phase: 'dormant' | 'signes' | 'formation' | 'action' | 'repli' | 'sauvage' | 'fondu'; readonly actAt; readonly groups: readonly RadicalGroupView[]; readonly stats: Readonly<RadicalStats>; groupOf(personId): RadicalGroupView | null; scheduleAction(at: number): void; orderRetreat(): void }`.
  `RadicalGroupView { id; squadId; name; leaderId; size; strength; followers; morale; cohesion; plan: 'suivre' | 'rallier' | 'preparer' | 'salve' | 'assaut' | 'liberer' | 'barricade' | 'casse' | 'incendie' | 'renverser' | 'ravitailler' | 'recul' | 'dispersion' | 'regroupement' | 'fusion'; x; z; heading; ammo; inBlack; ratio }`.
  `RadicalStats { volleys; thrown; mortars; molotovs; returned; windowsAttacked; looted; barricades; barricadesLit; vehiclesLit; vehiclesFlipped; rescuesTried; rescuesDone; retreats; scatters; melts; collected; firstSignAt; firstViolenceAt }`.

ÉVÉNEMENTS ÉMIS (libres, à écouter par ctx.events.onAny)
- 'crowd:signal' : `{ signal: CrowdSignal; stage: 'debut' | 'fin' }`
- 'crowd:bloc' : `{ phase; previous; x; z; strength }`
- 'crowd:radical' : `{ fact: 'salve' | 'mortier' | 'engin_incendiaire' | 'assaut' | 'liberation_tentee' | 'liberation_reussie' | 'grenade_renvoyee' | 'barricade_commencee' | 'barricade_incendiee' | 'vitrine_attaquee' | 'rideau_force' | 'tag' | 'vehicule_incendie' | 'vehicule_renverse' | 'pillage' | 'repli' | 'dispersion' | 'regroupement' | 'fusion' | 'ravitaillement'; groupId; x; z; count; targetId }`

ÉVÉNEMENTS ÉCOUTÉS
'session:started', 'person:spawned', 'person:arrested', 'law:escape', 'projectile:spawned', 'projectile:returned', 'person:hurt', 'person:down', 'explosion', 'shop:window', 'shop:shutter', 'shop:looted', 'props:shutter_forced', 'prop:damaged', 'barricade:built', 'fire:started', 'vehicles:flipped'.

SERVICES CONSOMMÉS (tous facultatifs, types seuls importés)
'items' (returnProjectile, shieldRaised), 'props.ext' (propView, shopView), 'vehicles.ext' (ignite, isFlipped, spec), 'roles.archetypes' (setBlocAttire, inBlocAttire, familyOf). Plus le contexte : people, props, vehicles, projectiles, squads, actions, interactions, law, director, hazards, world, archetypes, clock, rng (dérivés 'radicaux:decisions' et 'radicaux:gestes' créés sur 'session:started').

INTERACTIONS ENREGISTRÉES PAR CE MODULE (ctx.interactions.register)
- 'ramasser' sur poubelle (2 bouteilles) et conteneur (6 bouteilles), stock tenu par session.
- 'incendier' sur un véhicule en stationnement désigné par un groupe (10 s, appelle vehicles.ext.ignite et relève 'incendie').

CLÉS LUES DANS session.config
- `tension`, `volatility`, heure (nuit) et durée.
- `extra['radical.none']` (boolean) : aucun pilotage des radicaux.
- `extra['radical.actAt']` (number, s de session) : instant du premier passage à l'acte au lieu du calcul.
- `extra['radical.lead']` (number, défaut 1) : multiplicateur de l'avance des signes.

INFRACTIONS ET TENSION
- Ce module ne relève lui-même que 'dissimulation_visage' (visage couvert) et 'incendie' (véhicule, par son propre verbe). Jets, violences sur agent, dégradations, pillage, tag, barricade et feux de mobilier sont relevés par items et props : pas de doublon.
- La tension monte par les événements que le cœur de la foule écoute déjà (law:offense, explosion, fire:started, shop:window, barricade:built, person:hurt). Ce module n'appelle `director.addTension` que pour ce qui n'émet rien : 'signal_bloc', 'agent_pris_a_partie', 'tentative_de_liberation'.

RÉGLAGES (src/sim/crowd/radical/tuning.ts)
- Chaleur : HEAT_GATE 0,12, HEAT_T0, HEAT_TV, HEAT_V, HEAT_BIAS, NIGHT_VOLATILITY 1,25 ; paliers TIER_*.
- Groupes : GROUP_MIN 5, GROUP_MAX 15, GROUP_FLOOR 3, MORALE_BREAK, LOSS_BREAK, COHESION_RADIUS.
- Calendrier des signes : LEAD_GATHER 150, LEAD_MASKS 115, LEAD_SIGNAL 75, LEAD_CHANGE 60, LEAD_UMBRELLAS 35, LEAD_RUSHED 90, TIME_K_MIN/MAX.
- Action : ACTION_MIN 30, ACTION_MAX 90 ; THROW_DIST 15, THROW_RANGE 20, SAFE_DIST 42, VOLLEY_PAUSE_*, FRONT_GROUPS 2, FRONT_CROWDED 0,2, MORTAR_MIN/MAX, MOLOTOV_RANGE.
- Rupture : RETREAT_DIST 16, CHARGE_CLOSING, GAS_BREAK, WATER_KEEP, ARMOUR_KEEP.
- Barricade, casse, pillage : BARRICADE_*, BREAK_RADIUS, tables SHOP_WEIGHT / PROP_WEIGHT / LOOT_WEIGHT, LOOT_NIGHT 1,7.
- Dispersion : SCATTER_TEAM 4, RALLY_MIN/MAX, OFF_ROUTE 35.

POINTS D'EXTENSION
- Missions : `RadicalApi.scheduleAction(at)` et `orderRetreat()`.
- Mesure : `RadicalSystem.profiling`, `.cost` (ms cumulées) et `.profClock` (horloge remplaçable).
- Essais : `src/sim/crowd/radical/testkit.ts` (createRadicalTest, avenueConfig, policeLine, raiseShields, chantier, ammoOf).
- Nouveau plan de groupe : une entrée dans PLAN (model.ts), son utilité dans choosePlan (tactics.ts), sa machine d'étapes dans runPlan (plans.ts), la tâche des membres dans memberTask (tasks.ts).

## Mesures

Essais : crowd-radical 8/8 ; crowd.* 33/33 ; modules dépendants 67/67 ; tsc 0 erreur.
Coût du système des radicaux (update + réflexions des contrôleurs), 158 radicaux, 18 groupes, jusqu'à 262 personnes pilotées, 4000 pas, temps processeur : moyenne 0,74 ms/pas, médiane 0,64, 9e décile 1,35, meilleure seconde 0,15, pire seconde 3,0 (charge machine ~11) ; moyenne 1,02, médiane 0,99, 9e décile 1,70, pire seconde 2,9 (charge ~18). Coût de la mesure elle-même : 0,04 ms/pas, non retranché. Jeu entier à 520 manifestants et 24 agents : 2,9 ms/pas en temps d'horloge (charge ~11).
Avance des signes sur la première violence : 74 s (mission courte).
Émeute : 33 mortiers tirés sur 42, 3 engins incendiaires sur 5, 76 projectiles, 10 salves, 2 véhicules incendiés, 1 barricade incendiée.
Taille : 21 fichiers source, environ 6500 lignes ; 7 fichiers d'essai.

## Non fait / fragile

- Aucune exécution dans le navigateur : tout est vérifié en essais unitaires sous Node, sur le quartier d'essai. Le rendu des parapluies, de la banderole et du changement de tenue, et le comportement sur le plan réel de Paris ne sont pas vérifiés.
- Performance : la moyenne est sous l'objectif, mais la pire seconde atteint environ 3 ms par pas (prise en main de tout le bloc, formation). La mesure est en temps processeur du processus (ramasse-miettes et compilation compris) parce que le temps d'horloge était inexploitable sur cette machine chargée.
- Voiture renversée : le plan existe (verbe via vehicles.ext, équipe de 6), mais aucun renversement ne s'est produit dans les exécutions finales (vehiclesFlipped = 0). Non vérifié.
- Engin incendiaire sur véhicule de police : la visée est codée, mais dans l'essai d'émeute les 3 engins sont tombés au pied de la ligne et le fourgon est resté intact. Non vérifié.
- Réactions à l'engin lanceur d'eau et au blindé (rupture à distance) : codées dans mustWithdraw, jamais essayées (aucun de ces véhicules dans les essais).
- Nuit : volatilité ×1,25 et pillage ×1,7 codés, non essayés.
- Observés dans les exécutions mais sans assertion dédiée : tag (1 infraction), rideau forcé (1 fait), charge sur agent isolé (4 faits 'assaut'), répartition raquette / ramassage / coup de pied dans les renvois de grenades.
- Pillage : vérifié dans l'essai de casse seulement ; 0 pillage dans l'essai d'émeute malgré 4 vitrines attaquées.
- Salves : 3 à 5 lanceurs par groupe et par vague, pas tout le groupe (porteurs de banderole et de parapluies, membres sans projectile).
- Écritures hors de person.cmd, faites faute d'action au contrat : champs de `look` pour capuche et masque, `p.upper = 'kick' | 'pickup'` pour l'animation, amortissement de `p.fear` des membres engagés tant que le moral du groupe tient, `brain.leaveAt = Infinity` pour qu'ils ne quittent pas la manifestation en plein plan.
- Deux interactions enregistrées par ce module relèvent plutôt d'autres modules : 'ramasser' sur poubelles et conteneurs (bouteilles) et 'incendier' sur véhicule en stationnement.
- Repli sans les services facultatifs ('roles.archetypes', 'items', 'props.ext', 'vehicles.ext' absents) : les chemins existent, aucun n'est essayé.
- Les radicaux peuvent être victimes de leurs propres feux ou tirs : un radical mort dans l'essai d'émeute, cause non recherchée.
- Un groupe peut compter moins de 5 membres quand il y a moins de 5 radicaux ou après des pertes (plancher 3 avant dissolution).
- L'axe d'approche d'une ligne est choisi parmi 5 directions autour de l'axe courant ; pas de contournement par un autre pâté de maisons.
- plans.ts fait 607 lignes, juste au-dessus de la limite indicative de 600.
- docs/INTEGRATION-NOTES.md n'est pas mis à jour (fichier hors de mon périmètre) ; rien n'est commité.
- tests/unit/crowd-radical.zzexplore.test.ts, essai temporaire de ma main qui se trouvait suivi par git, est supprimé de l'arbre de travail : la suppression reste à commiter.
- src/sim/crowd/testkit.ts : le coût par pas relevé par les essais de la foule additionne maintenant les trois systèmes, radicaux compris.

## Demandes d'évolution du contrat

- ArchetypeApi : une action pour couvrir et découvrir le visage (capuche, masque) et un changement de tenue minuté, afin de ne plus écrire `look` directement.
- ActionsApi ou InteractVerb : un geste « coup de pied » sur un objet au sol (grenade, palet) avec son animation, au lieu d'écrire `person.upper`.
- GameEvents : typer 'crowd:signal', 'crowd:bloc' et 'crowd:radical' (aujourd'hui événements libres écoutés par onAny).
- extensions.ts : clés de service 'crowd.signals' et 'crowd.radical' déclarées avec leurs types.
- Module véhicules : prendre en charge le verbe 'incendier' sur un véhicule en stationnement (aujourd'hui enregistré par ce module, qui appelle vehicles.ext.ignite).
- Module décor : prendre en charge 'ramasser' des bouteilles dans les poubelles et conteneurs, avec un stock visible dans props.ext.
- CrowdCoreApi : une façon officielle de retenir la tête du cortège derrière le bloc (aujourd'hui core.formation.halt) et de suspendre le départ d'une personne engagée (aujourd'hui brain.leaveAt).
- Émotions de la foule : un point d'entrée « courage de groupe » pour amortir la peur d'un membre, au lieu d'écrire `person.fear`.

## Vérifications exécutées

- npx vitest run tests/unit/crowd-radical : 7 fichiers, 8 essais verts (dernière exécution complète après le découpage des fichiers ; l'essai de performance relancé seul ensuite, vert).
- npx vitest run tests/unit/crowd. + police-command + integration.foule + people.crowd + roles.archetypes.crowd + audio.crowdmix : 19 fichiers, 100 essais verts avec le système des radicaux branché (exécuté après toutes les modifications de code).
- npx tsc --noEmit : 0 erreur sur tout le projet ; mes fichiers passent aussi avec --noUnusedLocals --noUnusedParameters.
- Pureté vérifiée par grep sur src/sim/crowd/radical : aucun Math.random, Date.now, three, DOM, TODO, globalThis ni 'as any' ; un seul performance.now (horloge de mesure par défaut) ; imports des autres modules en `import type` uniquement.
- Volatilité 0 (tension 0,45, 22 radicaux en 2 groupes, ligne d'agents sur le parcours, manifestation jouée jusqu'à la phase 'terminee') : chaleur max 0, bloc resté 'dormant', 0 signe, 0 projectile, 0 infraction, personne masqué, aucune vitrine touchée, agents à 100 de santé.
- Signes avant la violence (graine 5, 220 personnes, volatilité 0,9, 34 radicaux en 4 groupes) : regroupement à 72 s, visages couverts 76 s, signal 82 s, parapluies 83 s, changement de tenue 86 s, collecte et dépavage 104 s, mobilier 120 s ; première violence à 147 s, soit 74 s d'avance mesurée (essai : au moins 45 s, signes dans l'ordre, chacun rattaché à un groupe et à une unité).
- Bloc formé en tête : au passage à l'acte, barycentre du bloc à l'abscisse 133 m pour une tête de cortège à 133 m, dispersion moyenne 13 m, 100 % masqués ou en noir ; groupes de 5 à 15 avec meneur, déclarés 'affinite' dans ctx.squads.
- Salves sur une ligne placée en travers : 4 salves, 13 projectiles lancés au relevé, tous créés par des manifestants ; 68 projectiles pris dans la rue en 41 gestes de prise ; aucun lanceur n'a lancé plus qu'il n'a ramassé ; 16 points de chute, tous sur la ligne ou à ses pieds, 4 sur un agent ou son bouclier.
- Repli quand le rapport de force s'inverse (gaz sur le bloc, renforts, ligne qui avance) : 6 replis de groupe, au plus 2 jets dans les 6 s suivantes.
- Fusion dans la foule après ordre de repli : phase 'fondu', 0 radical sur 34 encore en noir ou masqué, 34 auteurs sur 34 gardent leurs infractions, personne dans un mur.
- Vitrine attaquée puis pillée : vitrines fêlées puis brisées par des radicaux (mode, hôtel, banque), 22 pillages commis par des opportunistes vus porteurs de 'butin'.
- Barricade : 15 objets déplacés, barricade construite à 210 s en travers de la rue, incendiée à 234 s.
- Grenade renvoyée : 18 palets lacrymogènes suivis, 19 renvois par 11 personnes, 11 palets déplacés dont 10 partis vers la ligne.
- Libération d'un interpellé : plan 'liberer' adopté, essaim de 14 radicaux à moins de 3,5 m de l'escorte, 11 coups et poussées, interpellé libéré (custody 'free') ; compteurs 2 tentatives, 1 réussite.
- Émeute (tension 0,8, volatilité 1) : chaleur max 1,00 ; phases signes@72 → formation@82 → action@127 → repli@305 → sauvage@400 ; mortiers 42 en dotation, 33 tirés, 9 restants ; engins incendiaires 5, 3 lancés, 2 restants (décompte exact vérifié par l'essai) ; 10 salves, 76 projectiles ; 2 véhicules en stationnement incendiés ; dispersion en 3 équipes par groupe vers 3 issues à plus de 30 m du parcours et plus de 45 m des forces, puis regroupement et phase sauvage.
- Déterminisme : deux exécutions de 200 s avec la même graine donnent le même journal de faits horodatés (12 faits), les mêmes compteurs, le même barycentre des radicaux et le même nombre de projectiles ; une autre graine donne un résultat différent.
- Coût par pas avec 158 radicaux en 18 groupes (jusqu'à 262 personnes pilotées avec les suiveurs, 145 gestes simultanés), mesuré sur 4000 pas de la formation au repli, en temps processeur : moyenne 0,74 ms par pas, médiane 0,64, 9e décile 1,35 (charge machine environ 11) ; 1,02 / 0,99 / 1,70 lors d'une exécution à charge environ 18. L'essai exige moyenne et médiane sous 2 ms.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/kernel.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/model.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/bloc.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/groupthink.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/tactics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/plans.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/tasks.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/gestures.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/acts.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/assess.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/march.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/signals.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/supply.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/targets.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/attire.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/followers.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/radical/testkit.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/crowd/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.calme.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.bloc.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.casse.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.reflexes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.emeute.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.determinisme.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/crowd-radical.perf.test.ts
