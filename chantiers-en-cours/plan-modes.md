# NOTE DE REPRISE (18 novembre, 0 h 20 — à lire avant tout le reste)

La machine a redémarré : les agents ont été coupés, mais le worktree est intact. État du chantier « modes » :
- les huit paquets P0 à P7 sont TERMINÉS ; leurs comptes rendus (résumé, fichiers, écarts au plan, points ouverts) sont dans /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-paquets-modes.json — à lire en premier ;
- un premier intégrateur a travaillé environ 1 h 45 avant la coupure : ses corrections sont dans le worktree (non committées), et les journaux incomplets de ses scénarios navigateur sont dans /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/e2e4/ (clavier.log, roles.log, finpc.log). Reprenez l'intégration à partir de l'état du worktree : ne refaites pas ce qui est fait, vérifiez-le.
- le code de base du dépôt principal a avancé depuis (corrections de colonnes, BRAV-M, nasse, missions) : votre correctif sera fusionné à trois voies ; restez chirurgical dans les fichiers existants.

# ADDENDUM DU COORDINATEUR (prioritaire sur le reste du plan)

1. Le type de véhicule de la BAC s'appelle `voiture_bac` partout (et non « voiture_banalisee »), libellé « Voiture banalisée (BAC) ». C'est le paquet P3 de CE plan qui le crée, en suivant la spécification ci-dessous (reprise du plan « commissariats », dont l'équipe ne le crée PAS et s'appuie sur votre définition) :
   - fichiers : src/sim/vehicles/defs.ts, src/sim/vehicles/specs.ts, src/render/vehicles/refdefs.ts, src/render/vehicles/models/index.ts, src/render/vehicles/models/cars.ts, src/render/vehicles/beacons.ts, tests/unit/vehicles.bac.test.ts
   - changements : - defs.ts: def('voiture_bac', 'Voiture banalisée (BAC)', 'police', 0x2e3238, saloon about 4.70 × 1.83 × 1.47 m, mass 1 450, seats as voiture_police, siren and beacons on); add it to the police kinds list.
- specs.ts: TABLE.voiture_bac.
- refdefs.ts: the same dimensions.
- cars.ts: CAR_STYLES.voiture_bac with police false (no livery or light bar), tinted rear windows, a magnetic roof dome shown only when the beacons are on.
- models/index.ts: builder entry.
- beacons.ts: beaconPatternFor('voiture_bac') gives the dome plus grille flashers.
- Audio is driven by the siren state; nothing to change there.
   - tests : vehicles.bac.test.ts:
- the definition exists: police faction, siren, beacons, 5 seats, driver on the left;
- spawn, enter and siren toggle work;
- the specs table has the kind;
- refdefs and sim defs agree (pattern of the existing consistency tests);
- the render model builds in Node within the car triangle budget;
- any existing test that iterates every vehicle definition is updated here.
2. L'équipe « commissariats » travaille en parallèle dans un autre worktree sur : src/world/commissariats/**, src/gameplay/commissariats/**, src/render/commissariats/**, src/sim/police/{api,units,roster,system}.ts, src/sim/police/command/{api,convoy}.ts, src/gameplay/patrols/{api,system}.ts (ajout de deploy/sendHome), src/ui/maps/**, src/ui/command/** (onglet « Commissariats »). Dans ces fichiers, faites des modifications minimales et localisées (elles seront fusionnées à trois voies).
3. Une équipe « bugs » corrige en parallèle : placement/départ des rôles, colonnes de véhicules, nasse, missions. Mêmes précautions : modifications chirurgicales dans les fichiers existants.
4. Demande du joueur à respecter à la lettre (texte original) : « l'interface générale avec les missions, c'est pas très clair. Un mode patrouille : des manifestations random se déclarent ; je suis peut-être dans une voiture de la BAC, un policier en civil, et on se balade dans Paris. Ensuite le mode carrière. Après, le mode missions spéciales sur chaque poste. Et le mode libre : je peux choisir qui je veux être, avec le nom de la manifestation, le lieu, les colonnes, les degrés aléatoires où les manifestants pop. » Le joueur joue sur MacBook Air SANS souris (clavier + trackpad) et sur téléphone : tout doit être utilisable au clavier seul et au doigt.

5. Défaut relevé par les testeurs, à corriger dans le paquet P5 (vous modifiez déjà src/ui/screens/catalog.ts et scenario.ts) : Missions whose role card says 'opérateur' or 'chef de groupe' (Centaure, canon à eau) are always played as 'conducteur' — Analyse : The role catalogue lists postes: ['conducteur'] only for gendarme_centaure (line ~70) and operateur_canon_eau (line ~75). sanitizeDraft (scenario.ts:136) therefore replaces the mission's poste with defaultPoste. Matrix played the way the home screen launches a mission (buildSessionConfig(draftFromConfig(...))): 'poste conducteur au lieu de operateur' for canon-01, 02, 03, 04, 05, 07, 08 and 09 and centaure-04 and 06; 'au lieu de chef_groupe' for centaure-08. Example: canon-01's briefing says « Vous êtes opérateur : le conducteur reste à son poste », yet the player is at the wheel. — Correction suggérée : In src/ui/screens/catalog.ts: gendarme_centaure → postes: ['conducteur', 'operateur', 'chef_groupe'], defaultPoste 'conducteur'; operateur_canon_eau → postes: ['conducteur', 'operateur'], defaultPoste 'conducteur'. Then check that session/setup.ts (pickPlayer) seats the player at the matching place: operator = gunner seat (canon seat 1, Centaure seat 2); chef d'engin = passenger seat 1. The canon AI is now ready for a player in the operator seat (bug canon-ia-tire-au-nom-du-joueur).
6. Le code de base (commit eeaec87) contient déjà : la carte « Ma mission » (ordre du chef, destination, état du départ), les ordres « Me suivre en colonne » / « Me suivre à pied » pour tous les rôles de police, les colonnes pilotées par l'IA. Ne les cassez pas ; le mode Patrouille doit les réutiliser.

# PLAN — modes

## 1. Understanding (what the player asked for)
Le joueur ouvre le jeu et trouve quatre grandes entrées, chacune expliquée en une ligne. Elles remplacent l'éditeur à neuf onglets, où le choix « Mode libre / Carrière / Monde ouvert » est aujourd'hui caché au fond d'un onglet.

1) PATROUILLE. Le joueur choisit son équipage :
- BAC, par défaut : trois policiers en civil dans une voiture banalisée, avec gyrophare aimanté et deux-tons ;
- Police secours : policiers en tenue dans une voiture sérigraphiée.
Il règle aussi sa place (conducteur ou chef de bord), son grade, son point de départ (le secteur BAC ou le commissariat de l'équipage), l'heure, la météo, la durée de la vacation et le rythme (calme, normal, agité). Il part garé au bord du trottoir, ses collègues à bord, et roule dans Paris.
Au fil de la vacation, des événements se déclarent à des endroits et à des moments tirés au hasard par le générateur aléatoire de la session : rassemblement non déclaré, groupe de casseurs, blocage de carrefour, manifestation sauvage qui se met en marche, feu de poubelle ou de voiture. Ce sont de vrais foyers, de vraies foules et de vrais feux de la simulation existante, jamais des appels « vides ».
CENTRAL appelle à la radio et une carte d'appel s'affiche (« Prendre l'appel », « Décliner »). Si le joueur accepte, le GPS le guide, il intervient avec les mécaniques existantes ou demande des moyens : une autre patrouille, une compagnie de CRS, les pompiers, le SAMU. Un appel qu'il ne prend pas est confié à une patrouille de l'IA. À la fin, CENTRAL le rappelle au service, puis un compte rendu de vacation s'affiche.

2) CARRIÈRE : la progression existante, de grade en grade. « Jouer la mission » mène à une fiche de briefing claire, puis à « Lancer ».

3) MISSIONS SPÉCIALES : le catalogue existant, rangé par poste. Chaque mission a une fiche (accroche, ce qu'on attend de vous, lieu, heure, météo, durée, difficulté, rôle tenu) avec « Lancer la mission » et « Ajuster les réglages ».

4) MODE LIBRE : l'éditeur actuel, sans le choix de mode. On y règle :
- qui l'on est (tous les rôles, y compris le nouvel équipage de patrouille) ;
- la manifestation : nom libre, organisateurs, cause, affluence, composition ;
- le lieu, ou un lieu tiré au hasard ;
- le point de départ des colonnes, avec un aperçu des colonnes engagées (la sienne en surbrillance) ;
- l'heure, la météo, la tension et la durée ;
- un curseur « Imprévu » à quatre crans, de « Comme annoncé » à « Imprévisible ». C'est la réponse à « les degrés aléatoires où les manifestants pop ».

Le commissariat dessiné avec ses colonnes et tous ses véhicules, et l'envoi des unités par le commandant d'un commissariat à l'autre, relèvent de la tâche 54, déjà ouverte. Ce plan ne fait que leur préparer le terrain : coordonnées réelles des commissariats, choix du point de départ des colonnes.

## 2. Current state of the code
CONTRÔLÉ DANS LE CODE (commit b196589)

ACCUEIL
- home.ts (createHome) : un seul écran 'menu_principal'. Il a des onglets SECTIONS (role, mode, lieu, meteo, foule, tension, moyens, options, scenarios), un panneau et un résumé (« Lancer », « Surprends-moi », « Continuer »).
- Données d'ouverture {section, mode, missionId}. career.ts appelle ui.open('menu_principal', {section: 'mode', mode: 'carriere', missionId}).
- back() ramène seulement le focus sur l'onglet. À la manette, Start focalise « Lancer ».
- La barre du haut affiche nav-carriere, nav-historique, et nav-missions si un écran 'missions' existe. tests/e2e/ui.mjs (lignes 543 à 573) vérifie ces entrées et la navigation au clavier vers tab-mode.
- Le choix du mode est dans home-panes-a.ts buildMode : cartes data-id mode-<id> tirées de MODES (catalog.ts). Les missions y portent les data-id mission-<id> et mission-libre. pickMission est exporté.
- ScreenId 'missions' existe dans contracts.ts, mais aucun écran ne l'enregistre (seul le banc harness/ui.ts en crée un faux).

BUG RÉEL DU « MONDE OUVERT » VIA L'ACCUEIL
- buildSessionConfig (scenario.ts) écrit crowdSize = d.crowdSize et n'écrit pas crowd.none. CrowdCore.start ne renonce que si size ≤ 0 ou si crowd.none vaut true.
- Une partie « Monde ouvert » lancée depuis l'accueil fait donc apparaître une manifestation de 600 personnes, alors que le résumé et buildFoule annoncent « aucune manifestation déclarée ».
- En revanche, 40 scénarios e2e démarrent par ?autostart=paris. launch.ts leur donne mode 'monde_ouvert', CRS, place de la Concorde et une foule : cette sémantique de 'monde_ouvert' au niveau de la session NE DOIT PAS changer. env/system.ts lit aussi mode === 'monde_ouvert' (machine.dynamic).

PATROUILLES IA (src/gameplay/patrols)
- PatrolsSystem, service 'police.patrols' (list, isPatrol, statusOf, send, resume), événement 'patrol:report'.
- count() vaut 0 hors rôle de police ou en mission ; sinon 5 voitures, ou la valeur de extra.patrouilles.
- sites.ts :
  - TV_SITES : 7 commissariats, indicatifs TV 75-01 … 75-09 ;
  - BAC_SITES : 4 secteurs BAC (75N gare Saint-Lazare, 75E République, 75S Odéon, 75O Trocadéro). Ce sont des PLACES, pas des commissariats.
- Toutes les voitures IA sont des 'voiture_police', y compris celles de la BAC (équipage 'policier_civil').

SERVICE ET BASES (journee-data.ts)
- SERVICE_BASES : caserne de la Cité et commissariats des 1er, 9e, 3e, 8e et 7e.
- BRAVM_BASES, basePreload, serviceBaseFor, baseOf.
- isJournee = extra.journee === true && isPoliceRole(role). Ajouter un rôle à POLICE_ROLES l'y fait donc entrer automatiquement.

FOULE (src/sim/crowd)
- CrowdCore.start est inactif si la taille vaut 0. spawnExtra et spawnForeign renvoient null si !active. Il y a environ 98 lectures de .active dans le module.
- FoyersSystem.plan n'est armé qu'au démarrage, et seulement si core.active. FoyersSystem.count vaut 0 si size < 250 et que extra.foyers est absent. pickPlace s'appuie sur rallyX/rallyZ et sur la distance au parcours du cortège.
- ManifsSystem ne lit les manifestations qu'à 'session:started'. MANIF_PLACES (manifs.ts) et PARIS_PLACES (foyers.ts) existent.
- FoyersApi et ManifsApi n'ont aucune méthode de déclaration à la volée.
- Consommateurs du cœur de foule hors du module : sim/police/command/core.ts, ui/command/panelIncidents.ts, gameplay/session/engins.ts.

SESSION
- setup.ts onStarted : castFor, puis buildWithPoliceUnits, sinon buildCast. Ensuite possess et cameraOf. LEADER_ROLES reçoit un ordre 'suivre'.
- Le joueur assis dans un véhicule conduit par l'IA existe déjà (secouriste).
- session/manifestations.ts n'engage une compagnie IA par manifestation supplémentaire qu'à 'session:setup' : une manifestation qui naîtrait en cours de partie n'aurait personne en face.
- orders.ts ne donne d'ordres qu'aux rôles de sa table ROLE_KIND ; un rôle absent n'en reçoit aucun.
- gameplay/incidents/dispatch.ts (PlayerDesk) confie déjà d'office des incidents aux rôles exécutants, la BRAV-M comprise (pillages, suspects, agent isolé). C'est une seconde source d'« appels » qui entrerait en conflit avec un répartiteur de patrouille.

INCIDENTS
- IncidentKind : feu_*, blesse, agent_*, pillage, barricade, automobiliste_bloque, secours_bloques, suspect.
- IncidentsApi.open crée un incident même sans sujet réel (targetId 0) : un « suspect » ou un « automobiliste » ouvert ainsi n'a personne ni rien derrière.
- Les feux passent par ctx.hazards.ignite (journee.ts), et la détection des incidents les ouvre.

RÔLES
- PlayableRole a 12 valeurs. Record exhaustifs : ui/command/scope.ts ROLE_LABELS et ui/maps/visibility.ts VIEWS. Listes dupliquées : roster.ts POLICE_ROLES, ui/hud/model.ts, ui/screens/tips.ts, core/session.ts defaultRankForRole, core/launch.ts, gameplay/radio/callsigns.ts, session/mission.ts (libellés).
- career/api.ts ROLES_BY_RANK alimente les rôles déverrouillés stockés dans la sauvegarde de carrière (unlocked) et home-panes-a (rankOpeningRole).

VÉHICULES
- 'voiture_police' est décrite dans sim/vehicles/defs.ts (VEHICLE_KINDS), specs.ts, render/vehicles/refdefs.ts, models/index.ts et cars.ts (CAR_STYLES, police: true). Il n'existe pas de voiture banalisée.

TOUCHES
- bindings.ts RESERVED_KBM recense les touches lues directement par l'interface (O pour le drone, P pour les propositions de l'adjoint). Toute nouvelle touche lue par l'interface doit y être ajoutée, sinon un joueur qui la réaffecte provoque une double action.
- KeyY n'est liée à rien. labels.ts sait l'afficher en QWERTZ.
- Les propositions de l'adjoint (quickActions, P) ne se commandent pas à la manette. L'écran 'radio' (radioScreen.ts) est accessible à la manette par le bouton radio.

TESTS
- vitest sous Node, sans DOM (325 fichiers).
- Les scénarios e2e qui pilotent l'éditeur de l'accueil sont : ui.mjs, game.mjs, game-dist.mjs, verif-accueil, verif-partie, verif-partie2, verif-surprise, verif-fin-pc, verif-fin-tel, verif-tpm-manette, verif-tpm-manette2, verif-tpm-robuste, verif-tpm-tel, verif-tpm-tel2, verif-tpm-tactique-tel, command.mjs (à revérifier par grep sur 'menu_principal', 'tab-' et 'lancer').
- Le banc harness/ui.ts enregistre de faux écrans.

## 3. Player experience (acceptance)

### 3.1
MACBOOK — ACCUEIL (hub).
- Écran 'menu_principal', vue « hub ». En haut, la marque et la barre actuelle, nav-carriere et nav-historique compris (attendus par ui.mjs).
- Au centre, quatre grandes tuiles avec icône, titre et une ligne :
  - PATROUILLE : « En BAC ou en Police secours dans Paris : la radio vous envoie sur ce qui se déclare. » ;
  - CARRIÈRE : « Gardien de la paix — chapitre 2 », ou « De gardien stagiaire à commandant » sans carrière ;
  - MISSIONS SPÉCIALES : « <n> missions rangées par poste : CRS, BRAV-M, canon à eau, journaliste… », où n est calculé depuis le catalogue et jamais écrit en dur ;
  - MODE LIBRE : « Vous réglez tout : rôle, manifestation, lieu, colonnes, imprévu. ».
- Sous les tuiles : « Continuer — <dernière partie> » quand une partie existe.
- Clavier : flèches ou Tab d'une tuile à l'autre, Entrée pour ouvrir, focus initial sur la première tuile. Manette : croix pour choisir, A pour ouvrir, et Start ouvre la tuile focalisée (au lieu de focaliser « Lancer », qui n'existe pas dans cette vue).
- data-id : accueil-patrouille, accueil-carriere, accueil-missions, accueil-libre, continuer.

### 3.2
MACBOOK — PATROUILLE. Une colonne défilante, avec en tête « ← Accueil » (data-id accueil-retour ; Échap fait de même).
(1) Équipage : deux cartes, BAC (en civil, voiture banalisée) et Police secours (en tenue, voiture sérigraphiée) ; data-id crew-bac et crew-police_secours.
(2) Votre place : segmenté Conducteur / Chef de bord, et grade Gardien de la paix / Brigadier-chef / Major.
(3) Départ :
  - BAC : secteurs BAC 75N gare Saint-Lazare, 75E République, 75S Odéon, 75O Trocadéro ;
  - Police secours : commissariats des 1er, 3e, 4e, 6e, 7e, 8e et 9e ;
  - « Au hasard » ;
  - data-id patrouille-depart-<id>, avec mini-plan.
(4) Ambiance : rythme Calme / Normal / Agité (une phrase chacun), heure, météo, durée de la vacation (10 min, 25 min, 45 min, temps réel).
« Prendre la vacation » est collé en bas (data-id patrouille-lancer). Après le chargement, le joueur est au volant, voiture garée au bord du trottoir. CENTRAL : « BAC 75N, prise de service, secteur gare Saint-Lazare. »

### 3.3
MACBOOK — EN VACATION.
- Le joueur conduit. En chef de bord, son collègue de l'IA conduit au pas dans le secteur.
- Au bout de 1 à 3 minutes selon le rythme, un appel tombe : message radio de CENTRAL et carte d'appel (data-id hud-appel). Exemple : « RASSEMBLEMENT NON DÉCLARÉ — Place de l'Opéra · ~120 pers. · 1,4 km », avec « Prendre l'appel (Y) » et « Décliner (Maj + Y) ».
- Appel pris : objectif GPS. En chef de bord, le conducteur de l'IA passe en urgence (deux-tons, gyrophare) ; au volant, le joueur les allume lui-même.
- Sur place (moins de 60 m) : « Sur place. Évaluez et rendez compte. » La carte propose « Renforts » (Patrouille, Compagnie de CRS pour un rassemblement ou une manifestation sauvage, Pompiers, SAMU) et « Fin d'intervention ».
- L'appel se clôt de lui-même quand le foyer se disperse, que la manifestation se termine ou que le feu est éteint. Un appel ignoré 90 s, ou décliné : « Reçu, TV 75-09 prend. »
- Fin de vacation : « BAC 75N, fin de vacation, regagnez le service. » On rejoint le point de départ, ou le compte rendu s'ouvre seul au bout de 3 minutes : durée, appels reçus, pris, réglés, confiés, interpellations, blessés.
- À la manette : l'écran radio (bouton radio) montre l'appel en cours avec les mêmes boutons.

### 3.4
MACBOOK — CARRIÈRE. La tuile ouvre l'écran 'carriere' existant. « Jouer la mission » ouvre l'accueil sur la fiche de briefing de la mission, en mode carrière, avec :
- « Lancer la mission » (data-id briefing-lancer) ;
- « Ajuster les réglages » (data-id briefing-ajuster) : l'éditeur, onglet Mission, mode carrière ;
- « ← Retour ».
Une mission verrouillée affiche sa raison, et « Lancer » est désactivé.

### 3.5
MACBOOK — MISSIONS SPÉCIALES.
- À gauche, les postes avec le nombre de missions (data-id poste-<id>).
- Au centre, les missions du poste : titre, difficulté en étoiles, lieu, heure (data-id spec-<missionId>, pour ne pas doubler les data-id mission-<id> de l'éditeur).
- À droite, la fiche :
  - accroche ;
  - « Ce qu'on attend de vous » : objectifs principaux, puis secondaires en gris ;
  - lieu, heure, météo, durée, difficulté, rôle et grade tenus ;
  - « Lancer la mission » et « Ajuster les réglages ».
- Flèches haut et bas dans la liste, Entrée pour choisir, Échap pour revenir.

### 3.6
MACBOOK — MODE LIBRE.
- C'est l'éditeur actuel, avec les mêmes data-id. La vue est montée seule : une seule vue de l'accueil est dans le DOM à la fois.
- Onglet « Mission (facultative) », data-id tab-mode conservé : plus de cartes de mode, seulement « Scénario libre » et les missions.
- Onglet « Manifestation » :
  - « Nom de la manifestation » (manif-nom, avec une proposition automatique) ;
  - « Organisateurs » (org-<id>) ;
  - affluence, cause, composition, manifestations simultanées ;
  - curseur « Imprévu » à 4 crans (imprevu), avec sa phrase d'aide ;
  - case « Lieu tiré au hasard » (lieu-hasard).
- Onglet « Moyens engagés » : les mêmes compteurs, plus « Point de départ des colonnes » (colonne-depart-<id> : Automatique, Caserne de la Cité, 1er, 9e, 3e, 8e, 7e, Déjà sur place) et l'aperçu des colonnes, la vôtre en gras.
- La tuile du rôle Patrouille est masquée en mode carrière.

### 3.7
TÉLÉPHONE 844 × 390, PAYSAGE.
- Hub :
  - en-tête de 44 px au plus, barre réduite aux icônes ;
  - tuiles en grille 2 × 2 d'au plus 128 px de haut, pour que en-tête + 2 rangées + écarts + « Continuer » tiennent dans 390 px sans défiler ;
  - marges env(safe-area-inset-*) pour l'encoche ;
  - cibles ≥ 40 px.
- Patrouille : une colonne défilante, puces ≥ 40 px, « Prendre la vacation » collé en bas.
- Missions spéciales : postes en bandeau horizontal en haut, liste au-dessous ; la fiche s'ouvre en plein panneau avec « ← Missions » et « Lancer » collé en bas.
- En jeu, la carte d'appel est compacte (titre, lieu, distance, deux boutons de 40 px). Elle est placée sans recouvrir la mini-carte ni les actions rapides, et se replie au bout de 20 s en une pastille « Appel en cours ».

## 4. Decisions

- D1: {
 "question": "Faut-il un nouveau GameMode pour la patrouille ?",
 "choice": "Non. 'monde_ouvert' reste l'identifiant interne ; l'interface l'appelle « Patrouille ». La présence de extra.vacation fait de la session une vraie vacation. La migration des anciennes configs se fait SEULEMENT dans l'interface (Continuer, scénarios enregistrés, Rejouer de l'historique, buildSessionConfig), jamais dans launch.ts ni dans le module de session.",
 "why": "40 scénarios e2e démarrent par ?autostart=paris : mode monde_ouvert, CRS, avec une foule. Leur sémantique ne doit pas changer."
}
- D2: {
 "question": "Comment rendre la BAC jouable ?",
 "choice": "Un nouveau PlayableRole 'patrouille', avec deux variantes : 'bac' (policier_civil, voiture_bac) et 'police_secours' (archétype des voitures TV de l'IA, voiture_police). Grades : gardien, brigadier_chef, major. Postes réutilisés : 'conducteur' et 'interpellation', ce dernier affiché « Chef de bord ». Le rôle n'entre PAS dans la carrière : pas d'ajout à ROLES_BY_RANK, tuile masquée en mode carrière.",
 "why": "Ajouter le rôle à ROLES_BY_RANK modifierait les rôles déverrouillés des carrières sauvegardées et ouvrirait un rôle sans aucune mission de carrière."
}
- D3: {
 "question": "Quels équipages proposer en Patrouille ?",
 "choice": "Deux : BAC (par défaut) et Police secours. La BRAV-M en patrouille est reportée.",
 "why": "En BRAV-M, PlayerDesk (incidents/dispatch.ts) et orders.ts attribuent déjà d'office des tâches. Deux répartiteurs en parallèle produiraient des ordres contradictoires, et les motos demanderaient une branche de mise en place de plus. L'utilisateur a demandé la BAC ; la BRAV-M reste jouable en Mode libre et en Missions spéciales."
}
- D4: {
 "question": "Où démarre la patrouille ?",
 "choice": "Au point du site choisi, garée au bord de la chaussée la plus proche, dans le sens de circulation. BAC : BAC_SITES (secteurs, libellés « secteur gare Saint-Lazare »). Police secours : TV_SITES (commissariats). Aucune journée de service, aucune compagnie.",
 "why": "Ce sont des coordonnées réelles déjà relevées. Les commissariats dessinés relèvent de la tâche 54. On ne présente pas un secteur BAC comme un commissariat."
}
- D5: {
 "question": "Le rôle 'patrouille' et la journée de service ?",
 "choice": "isJournee renvoie false pour le rôle 'patrouille', et buildSessionConfig écrit journee false pour ce rôle.",
 "why": "Sinon, ajouter 'patrouille' à POLICE_ROLES lancerait en Mode libre un trajet en colonne depuis la caserne pour une voiture seule."
}
- D6: {
 "question": "Place du joueur et voiture conduite par l'IA ?",
 "choice": "Conducteur par défaut. En chef de bord, c'est PatrolModeSystem qui fait rouler la voiture du joueur (autopilot.driveTo vers des points de rue à 300–900 m du départ entre deux appels, en urgence vers l'appel accepté). Il s'arrête dès que le joueur occupe le siège conducteur ou descend. PatrolsSystem n'adopte pas la voiture du joueur.",
 "why": "C'est plus simple et sans couplage : la voiture du joueur n'entre jamais dans PatrolsApi.list, donc aucun risque qu'un renfort ou un commandant l'envoie ailleurs."
}
- D7: {
 "question": "Comment la foule existe-t-elle sans manifestation principale ?",
 "choice": "Un mode « veille » du cœur de foule (extra['crowd.veille'] = true) : cœur actif, plan vide, directeur figé en phase 'aucune', aléas du cortège coupés. Il fait l'objet d'un paquet à part (P1), testé seul pendant 600 s, avant toute déclaration.",
 "why": "Il réutilise les vrais foyers et cortèges. Les quelque 98 lectures de core.active sont le plus gros risque du plan : on les isole."
}
- D8: {
 "question": "Quelles natures d'appel ?",
 "choice": "Cinq natures, toutes adossées à une simulation réelle : rassemblement, casseurs et blocage (FoyersApi.declare) ; manifestation sauvage (ManifsApi.declare) ; feu de poubelle ou de voiture (ctx.hazards.ignite sur un conteneur ou une voiture garée, comme journee.ts ; la détection ouvre l'incident). Pas d'appel 'suspect' ni 'automobiliste'.",
 "why": "IncidentsApi.open sans sujet réel crée un appel « vide » : rien à interpeller, rien à débloquer. C'est un bug assuré pour un joueur qui veut zéro bug."
}
- D9: {
 "question": "Qui tire les événements au hasard ?",
 "choice": "Vacation : PatrolModeSystem (src/gameplay/patrols/mode.ts), sur un planificateur pur (calls.ts) qui reçoit ctx.rng.fork('patrouille:appels'). Mode libre (curseur Imprévu) : ManifsSystem lit lui-même extra.imprevus et programme les manifestations sauvages avec son propre fork, comme FoyersSystem programme les foyers. Aucun Math.random ni Date.",
 "why": "Chaque module de foule reste maître de son propre aléa. PatrolModeSystem ne s'active qu'en vacation : deux chemins séparés, testables séparément."
}
- D10: {
 "question": "Quel rythme d'appels ?",
 "choice": "Calme : premier appel à 120–180 s, puis toutes les 300–480 s, 1 à la fois, ni casseurs ni manifestation sauvage avant 900 s. Normal : premier à 60–120 s, puis 180–360 s, 2 à la fois. Agité : premier à 30–60 s, puis 90–200 s, 3 à la fois. Poids (feu / rassemblement / blocage / casseurs / sauvage) : calme 50/35/15/0/0, normal 30/30/15/10/15, agité 20/20/10/25/25. Une seule manifestation sauvage à la fois. Lieux à 500–2 000 m du joueur et à plus de 300 m d'un appel en cours. Effectifs × densité de foule.",
 "why": "C'est vivant sans saturer un téléphone. Le libellé « Agité » remplace « Nuit agitée », car l'heure se règle à part."
}
- D11: {
 "question": "Appels non traités ?",
 "choice": "Décliné, ou 90 s sans réponse : CENTRAL le confie à la patrouille de l'IA libre la plus proche (PatrolsApi.send). Pas de pénalité ; le compte rendu compte.",
 "why": "C'est le fonctionnement réel d'une salle de commandement, et l'esprit libre du mode."
}
- D12: {
 "question": "Quels renforts ?",
 "choice": "Patrouille : la voiture de l'IA la plus proche. Compagnie de CRS : seulement pour un rassemblement ou une manifestation sauvage, une seule à la fois, créée 120–240 s plus tard à serviceBaseFor du point, puis command.assume et command.arrive (assign au cortège pour une manifestation sauvage) ; il faut tester qu'elle tient le point. Pompiers et SAMU : RescueApi.request.",
 "why": "Une compagnie contre un groupe de casseurs mobiles, en mode veille, n'a pas de dispositif évident : on limite le cas pour ne pas créer de comportements absurdes."
}
- D13: {
 "question": "Manifestations sauvages du Mode libre : qui leur fait face ?",
 "choice": "session/manifestations.ts engage aussi une compagnie IA sur une manifestation déclarée en cours de partie ('crowd:manif' début), quand les moyens le permettent et que manifestations.compagnies ne vaut pas false. Délai d'engagement : 180–300 s.",
 "why": "Aujourd'hui, l'engagement n'a lieu qu'à 'session:setup'. Sans ce changement, une manifestation sauvage du cran « Imprévisible » défilerait sans aucune force en face."
}
- D14: {
 "question": "Fin de vacation ?",
 "choice": "À sessionDurationSeconds(duration) : radio, objectif « Regagnez le service » vers le point de départ, puis session.end(true) à moins de 40 m ou au bout de 180 s. En temps réel, pas de fin automatique.",
 "why": "Une partie libre a une fin et un bilan ; l'historique enregistre 'terminee'."
}
- D15: {
 "question": "Structure de l'accueil ?",
 "choice": "Un seul écran 'menu_principal' avec des vues internes exclusives (hub, patrouille, missions, briefing, libre) : une seule est montée à la fois. Pas d'écran 'missions' séparé. Les scénarios qui pilotent l'éditeur appellent ouvrirEditeur(page). nav-carriere reste dans la barre.",
 "why": "ui.current reste 'menu_principal', donc les waitFor tiennent. Une vue montée seule évite les data-id en double, que Playwright refuse en mode strict."
}
- D16: {
 "question": "Curseur « Imprévu » du Mode libre",
 "choice": "Cran 0 « Comme annoncé » : foyers 0. Cran 1 « Quelques débordements » : aucune clé (comportement actuel, par défaut). Cran 2 « Agité » : foyers max(2, auto), foyers.delai 240, imprevus {sauvages: 1}. Cran 3 « Imprévisible » : foyers 5, foyers.delai 150, foyers.ecart 120, imprevus {sauvages: 2, premier: 300}. Plus la case « Lieu tiré au hasard » : tirage dans DEFAULT_PLACES avec createRng(seed), au moment de construire la config.",
 "why": "S'appuie sur les clés existantes. Une clé absente donne le comportement actuel, donc les sauvegardes sont inchangées."
}
- D17: {
 "question": "Que veut dire « les colonnes » dans le Mode libre ?",
 "choice": "Un point de départ des colonnes (Automatique = comportement actuel ; Caserne de la Cité ; l'un des 5 commissariats de SERVICE_BASES, écrit dans extra.preload limité à cette base ; Déjà sur place = journee false) et un aperçu textuel des colonnes déduites des moyens, la colonne du joueur marquée.",
 "why": "Répond à « les colonnes » sans nouveau système de convoi. Les colonnes visibles au commissariat relèvent de la tâche 54."
}
- D18: {
 "question": "Nom et organisateurs de la manifestation ?",
 "choice": "extra['manif.nom'] (60 caractères au plus, proposé d'après la cause et les organisateurs) et extra['manif.organisateurs'] ('intersyndicale' | 'collectif' | 'coordination_etudiante' | 'aucun'). « Aucun » ajoute crowd.sono = false et, si le scénario n'est pas réglé, crowd.scenario = 'samedi_sans_organisateur'. Le nom est repris par le briefing radio de la journée et par le résumé.",
 "why": "C'est demandé explicitement. Libellés génériques, aucun syndicat réel nommé."
}
- D19: {
 "question": "Voiture de la BAC ?",
 "choice": "Nouveau VehicleKind 'voiture_bac' : gabarit de 'voiture', gris foncé, sans livrée, siren et beacons, gyrophare aimanté et feux à éclats dans la calandre, en géométrie procédurale. Les voitures BAC de l'IA l'utilisent aussi.",
 "why": "Réaliste et presque gratuit, sans nouvel asset."
}
- D20: {
 "question": "Anciennes configs 'monde_ouvert' ?",
 "choice": "migrateLegacyPatrol(config), appliqué seulement dans l'interface : rôle → 'patrouille' variante bac (Police secours si l'ancien rôle était civil… non : toujours BAC), lieu → site le plus proche, heure, météo et durée gardées, crowdSize 0, ajout de vacation et crowd.veille.",
 "why": "Ces configs produisaient une manifestation fantôme ; elles deviennent la patrouille annoncée."
}
- D21: {
 "question": "Touches de la carte d'appel ?",
 "choice": "Y : prendre l'appel ; Maj + Y : décliner. KeyY est ajoutée à RESERVED_KBM (bindings.ts), libellée par labels.ts, sans effet quand un champ a le focus ou qu'un écran modal est ouvert. À la manette, l'écran radio montre l'appel en cours avec ses boutons, par un point d'extension étroit dans radioScreen.ts.",
 "why": "KeyY est libre aujourd'hui. Une touche lue par l'interface doit être réservée, sinon une réaffectation agit deux fois. Aucun chemin manette n'existe pour une carte du HUD."
}
- D22: {
 "question": "Paramètre d'essai pour les scénarios navigateur ?",
 "choice": "launch.ts accepte &premier=<s> (nombre) ; la vue Patrouille le recopie dans VacationConfig.premier.",
 "why": "Modifier __CRS.ctx après le lancement arrive trop tard : le planificateur lit premier à 'session:started'."
}

## 5. Data model
CONTRATS (src/core/contracts.ts)
- PlayableRole ajoute 'patrouille'.
- GameMode, SessionConfig, PolicePoste et les sauvegardes de carrière sont inchangés.

MODÈLE PARTAGÉ PUR (src/gameplay/patrols/model.ts, sans DOM ni service)
- Constantes : VACATION_KEY 'vacation', IMPREVUS_KEY 'imprevus', VEILLE_KEY 'crowd.veille', PATROL_MODE_SERVICE 'patrol.mode', PATROL_MODE_SYSTEM_ID 'gameplay.patrol-mode', PATROL_CALL_EVENT 'patrol:call'.
- Types de base :
  - type PatrolCrew = 'bac' | 'police_secours'
  - type PatrolSeat = 'conducteur' | 'chef_bord'
  - type PatrolRythme = 'calme' | 'normal' | 'agite'
- interface VacationConfig :
  - crew: PatrolCrew
  - seat: PatrolSeat
  - rank: PoliceRank
  - depart: { id; name; x; z; callsign }
  - rythme: PatrolRythme
  - types: { feux; rassemblements; blocages; casseurs; manifs: boolean }
  - premier?: number
  - ecart?: number
- interface PatrolSetup : { crew, seat, rank, departId: string | 'hasard', rythme, timeOfDay, weather, windDir, windSpeed, duration, seed, premier? }.
- CREWS : { id, label, desc, variante, vehicle, seats, ranks, departs() }. BAC → BAC_SITES ; Police secours → TV_SITES.
- Fonctions :
  - defaultPatrolSetup
  - sanitizePatrolSetup
  - resolveDepart (« hasard » tiré par createRng(seed))
  - vacationSessionConfig(setup): SessionConfig
  - patrolSetupFromConfig(cfg): PatrolSetup | null
  - readVacation(cfg): VacationConfig | null
  - migrateLegacyPatrol(cfg): SessionConfig
  - readImprevus(cfg)
- vacationSessionConfig produit :
  - mode 'monde_ouvert', missionId '', role 'patrouille', rank ;
  - place = depart.name, x et z = départ, crowdSize 0 ;
  - tension et volatility selon le rythme : 0.15/0.3, 0.3/0.5, 0.45/0.75 ;
  - duration, seed ;
  - extra = { scenario: 1, poste ('conducteur' | 'interpellation'), variante, vacation, 'crowd.veille': true, journee: false, patrouilles: 4, foyers: 0, vent, options: {…, journee: false} }.
- interface ImprevusConfig : { sauvages: 0..3; premier?: number; ecart?: number }.

Types d'exécution :
- type CallKind = 'rassemblement' | 'casseurs' | 'blocage' | 'manif_sauvage' | 'feu'
- type CallState = 'annonce' | 'acceptee' | 'sur_place' | 'confiee' | 'declinee' | 'terminee'
- interface DispatchCall :
  - id, kind, label, place, x, z, people
  - priority: 1 | 2 | 3
  - t, state
  - assignedTo: string
  - backup: ('patrouille' | 'compagnie' | 'pompiers' | 'samu')[]
  - foyerId, manifId, fireId (index de feu ou 0), incidentId (incident de feu détecté, ou 0)
- interface VacationSummary : { duration, calls, accepted, resolved, delegated, declined, arrests, injured, backups }.
- interface PatrolModeApi :
  - readonly active, callsign, calls, current, ending
  - accept(id), decline(id), close(id), requestBackup(id, kind)
  - summary()
- Événement 'patrol:call' : { call, state }.

CLÉS EXTRA NOUVELLES (toutes facultatives ; absentes = comportement actuel)
- vacation
- imprevus (lu par ManifsSystem)
- crowd.veille
- manif.nom
- manif.organisateurs
- depart : 'auto' | 'sur_place' | identifiant de base. Il est traduit en extra.preload [{ candidates: [base], minDist: 0, maxDist: 1e6, as: 'base' }], ou en journee false pour 'sur_place'.

PARAMÈTRE D'URL
- launch.ts accepte premier (nombre, raw) pour les essais.

INTERFACE
- ScenarioExtra (src/ui/core/api.ts) : 'manif.nom'?, 'manif.organisateurs'?, imprevus?, depart?.
- ScenarioDraft : + manifNom '', organisateurs 'intersyndicale', imprevu 1, lieuHasard false, depart 'auto'.

FOULE (src/sim/crowd/api.ts)
- CrowdCoreApi.veille: boolean.
- FoyersApi.declare(spec: { kind; x?; z?; name?; size?; life?; near?: { x; z; min; max } }): FoyerView | null.
- ManifsApi.declare(spec: Partial<ManifSpec> & { sauvage?: boolean; near?: {x; z; min; max} }): ManifView | null.
- ManifView.sauvage: boolean.
- Budget : 4 000 moins les personnes de la foule présentes, 1 500 par manifestation au plus.

SESSION
- Service facultatif 'session.equipage' : { squadId; vehicleId; callsign } | null.

VÉHICULE
- 'voiture_bac' ajoutée à VEHICLE_KINDS et au rendu ; CarStyle.unmarked?: boolean.

TOUCHES
- RESERVED_KBM ajoute KeyY « appels de CENTRAL ».

SAUVEGARDE
- Aucune nouvelle section. Le dernier lancement d'une patrouille est un SessionConfig portant extra.vacation.
- L'historique peut contenir role 'patrouille'.
- La carrière n'est pas touchée : pas d'ajout à ROLES_BY_RANK.

## 6. Risks

- R1: DÉSACCORD — BRAV-M en patrouille retirée. Le plan d'origine proposait trois équipages. Or en BRAV-M, PlayerDesk (gameplay/incidents/dispatch.ts) confie déjà d'office pillages et suspects, et orders.ts donne des ordres de réserve. Avec le répartiteur de patrouille, cela ferait deux sources d'ordres contradictoires, plus une branche de mise en place à motos. La BRAV-M reste jouable en Mode libre et en Missions spéciales ; à rouvrir plus tard en coupant PlayerDesk et orders en vacation.
- R2: DÉSACCORD — appels 'suspect' et 'automobiliste' retirés. IncidentsApi.open sans sujet réel crée un incident vide : personne à interpeller, aucune voiture à débloquer, appel impossible à régler. Seules restent les natures adossées à la simulation : foyers, manifestation sauvage, feux par ctx.hazards.ignite.
- R3: DÉSACCORD — le rôle 'patrouille' n'entre pas dans ROLES_BY_RANK. Le plan d'origine l'ouvrait dès 'gardien'. Mais la liste des rôles déverrouillés est stockée dans la sauvegarde de carrière (unlocked) : on la modifierait pour des joueurs existants, avec un rôle qui n'a aucune mission de carrière. Sa tuile est masquée en mode carrière.
- R4: DÉSACCORD — journée de service. Ajouter 'patrouille' à POLICE_ROLES le fait entrer dans isJournee, donc dans un trajet en colonne depuis la caserne en Mode libre. Le plan d'origine ne le voyait pas. Il est corrigé dans P0 (isJournee) et P5 (journee false).
- R5: DÉSACCORD — imprévus du Mode libre déplacés dans ManifsSystem. Le plan d'origine les confiait à PatrolModeSystem. En plus, session/manifestations.ts n'engage une compagnie qu'à 'session:setup' : une manifestation sauvage née en cours de partie défilerait sans personne en face. P4 ajoute l'engagement différé.
- R6: DÉSACCORD — voiture du joueur en chef de bord. Le plan d'origine l'inscrivait dans PatrolsSystem (adoptPlayerCar, drapeau d'exclusion), ce qui la couple à la liste, aux ordres et aux comptes rendus. Elle est désormais conduite par PatrolModeSystem via l'autopilote, hors de PatrolsApi.
- R7: DÉSACCORD — dépendances. L'ancien P3 se testait « avec de faux services avant la fusion ». Le vrai risque est dans l'intégration avec la foule et l'équipage : P4 dépend maintenant de P2 et P3. L'ancien P1 (gros, plus de 9 fichiers, environ 98 gardes) est coupé en deux : veille seule (P1), puis déclarations (P2). Ordre de fusion : P0 et P1 en parallèle ; puis P2, P3, P5 ; puis P4 ; puis P6 ; puis P7 ; enfin la suite complète et run-all.mjs.
- R8: DÉSACCORD — touches. Y n'était pas réservée. Toute touche lue par l'interface doit figurer dans RESERVED_KBM (bindings.ts), sinon une réaffectation agit deux fois. La carte d'appel n'avait aucun chemin manette : il est ajouté dans l'écran radio. Ce point touche radioScreen.ts, que les agents d'interface en cours modifient peut-être : rebaser avant de commencer.
- R9: DÉSACCORD — data-id et vues. Les vues de l'accueil sont exclusives. La liste des Missions spéciales utilise spec-<id> et non mission-<id>, déjà utilisé par l'éditeur. Les boutons de la fiche sont briefing-*. Les départs sont patrouille-depart-* et colonne-depart-*. Sans cela, Playwright en mode strict échoue sur des doublons.
- R10: DÉSACCORD — barre du haut. Le plan d'origine la réduisait à Historique / Paramètres / Plein écran / Crédits, ce qui retirait nav-carriere, attendu par ui.mjs. Elle est conservée.
- R11: TÉLÉPHONE, HAUTEUR DU HUB. Avec des tuiles de 140 px, en-tête + 2 rangées + écarts + « Continuer » dépassent 390 px. Il faut des tuiles de 128 px au plus, un en-tête de 44 px et les marges safe-area. verif-accueil-modes vérifie l'absence de défilement.
- R12: MODE VEILLE DE LA FOULE (P1). C'est le point le plus délicat. Il est isolé dans son propre paquet, activé seulement par une clé explicite et testé 600 s. Les consommateurs hors du module (commandement de police, engins, panneau des incidents) sont aussi à vérifier.
- R13: COMPAGNIE EN RENFORT. Le commandement IA conçoit son dispositif autour d'un cortège. Contre un foyer en veille, son comportement n'est pas prouvé : le renfort est limité au rassemblement et à la manifestation sauvage, avec un test qui exige la tenue du point.
- R14: SCÉNARIOS NAVIGATEUR. 40 scénarios démarrent par ?autostart=paris : la migration ne s'applique jamais en dehors de l'interface. La liste des scénarios qui pilotent l'éditeur doit être reprise par grep : game-dist.mjs et harness/ui.ts manquaient à l'ancienne liste.
- R15: PERFORMANCES. Une seule manifestation sauvage à la fois (700 × densité au plus), 3 appels au plus, 4 voitures IA, pas de cortège principal. P7 mesure les images par seconde au téléphone.
- R16: AGENTS DE CORRECTION EN COURS. Les zones partagées sont setup.ts, journee.ts, les interfaces de rôle et radioScreen.ts. Chaque paquet rebase sur la branche corrigée et décrit ses changements par fonction ; P3 ajoute une branche en tête de onStarted sans remanier buildCast.
- R17: COMPATIBILITÉ. Les identifiants GameMode ne changent pas, aucune section de sauvegarde n'est ajoutée, toutes les clés nouvelles sont facultatives. P5 prouve qu'un brouillon par défaut produit la même config qu'aujourd'hui. Les anciennes configs 'monde_ouvert' de l'interface deviennent des patrouilles BAC : changement voulu, puisqu'elles produisaient une manifestation fantôme.

## 7. Out of scope

- Les commissariats dessinés en 3D (cour, véhicules alignés en colonnes, tous les véhicules) et la répartition des unités entre commissariats par le commandant : c'est la tâche 54. La patrouille part des coordonnées réelles déjà connues.
- La BRAV-M et les autres unités en mode Patrouille : il faut d'abord neutraliser PlayerDesk et orders.ts pendant une vacation.
- Les appels 'suspect', 'automobiliste bloqué', les cambriolages et les courses-poursuites : il faudrait un vrai sujet simulé derrière chaque appel.
- Un rôle d'officier de salle ou de commandant qui répartit lui-même les appels (tâche 54).
- Une tenue distincte pour Police secours : on garde l'archétype des voitures TV de l'IA.
- Les missions de carrière en patrouille ; l'entrée du rôle Patrouille dans la carrière.
- De nouvelles missions au catalogue ; seule leur présentation change.
- Les voix enregistrées de CENTRAL : texte radio seulement.
- Un éditeur de parcours de manifestation dessiné à la main.
- Le remaniement des écrans Paramètres, Historique et Crédits, hormis le libellé « Patrouille ».

## 8. Work packages

### PACKAGE P0 — Contrats : rôle « patrouille », modèle de vacation partagé, paramètre d'essai
- dependsOn: []
- size: moyen
- files:
  - src/core/contracts.ts
  - src/core/session.ts
  - src/core/launch.ts
  - src/gameplay/patrols/model.ts (nouveau)
  - src/gameplay/session/roster.ts
  - src/gameplay/session/journee-data.ts
  - src/ui/hud/model.ts
  - src/ui/command/scope.ts
  - src/ui/maps/visibility.ts
  - src/ui/screens/tips.ts
  - tests/unit/patrol.model.test.ts (nouveau)

#### Changes
1) contracts.ts : 'patrouille' dans PlayableRole, avec sa docstring.
2) session.ts : defaultRankForRole('patrouille') renvoie 'gardien'.
3) launch.ts :
   - 'patrouille' parmi les rôles acceptés ;
   - nouveau paramètre premier (nombre), exposé dans LaunchParams ;
   - le défaut 'monde_ouvert' de ?autostart=paris est inchangé.
4) roster.ts :
   - 'patrouille' ajouté à POLICE_ROLES ;
   - castFor, cas 'patrouille' : groupe 'equipage' nommé d'après extra.vacation.depart.callsign (sinon 'BAC 75' ou 'TV 75') ;
   - trois créneaux : chef de bord ('interpellation', brigadier_chef), conducteur (gardien), équipier ('interpellation', gardien) ;
   - corps 'policier_civil' pour la BAC, sinon celui des voitures TV de l'IA ;
   - joueur : le conducteur si le poste vaut 'conducteur', sinon le chef de bord ;
   - véhicule 'voiture_bac' (BAC) ou 'voiture_police'.
5) journee-data.ts : isJournee renvoie false pour le rôle 'patrouille'.
6) Ajouter 'patrouille' aux listes et Record des rôles : hud/model.ts ; scope.ts (ROLE_LABELS « Équipage de patrouille » et POLICE_ROLES) ; visibility.ts VIEWS ; tips.ts. Ne PAS toucher career/api.ts ni executant.ts.
7) model.ts : tout le modèle partagé du dataModel. Il n'importe que sites.ts, journee-data.ts, core/rng et core/session.

#### Tests
patrol.model.test.ts :
- vacationSessionConfig donne mode 'monde_ouvert', crowdSize 0, crowd.veille true et journee false, et readVacation le relit ;
- l'aller-retour patrolSetupFromConfig(vacationSessionConfig(s)) restitue s, départ 'hasard' compris (déterministe pour une même graine) ;
- migrateLegacyPatrol : une ancienne config Opéra devient une vacation au site le plus proche ; une config 'libre' et une config issue de launchSessionConfig({autostart: 'paris'}) passée hors interface sont rendues telles quelles ;
- castFor patrouille BAC conducteur : 3 créneaux 'policier_civil', véhicule 'voiture_bac', joueur conducteur ;
- isJournee({role: 'patrouille', extra: {journee: true}}) === false ;
- defaultRankForRole('patrouille') === 'gardien' ;
- la visibilité de carte du rôle est celle de la police.
Puis tsc --noEmit et toute la suite vitest.

### PACKAGE P1 — Foule : mode veille du cœur (sans aucune déclaration)
- dependsOn: []
- size: gros
- files:
  - src/sim/crowd/core.ts
  - src/sim/crowd/core-api.ts
  - src/sim/crowd/director.ts
  - src/sim/crowd/aleas.ts
  - src/sim/crowd/events.ts
  - src/sim/crowd/emotions.ts
  - src/sim/crowd/evacuation.ts
  - src/sim/crowd/index.ts
  - tests/unit/crowd.veille.test.ts (nouveau)

#### Changes
1) CrowdCore.start : si extra['crowd.veille'] === true et crowd.none n'est pas true :
   - veille = true, size = 0, plan vide ;
   - route statique à 2 points au point config.x/z, corridor construit dessus ;
   - formation vide, pas de sono ;
   - active = true, director.beginVeille().
   Sans veille, une taille ≤ 0 garde le comportement actuel. Exposer veille dans core-api.ts.
2) director.beginVeille : phase et base 'aucune', aucune transition ni fin, stats à 0, tension globale = max des tensions locales, pression de volatilité coupée.
3) Revue de chaque lecture de core.active dans le module (environ 98) : toute fonction qui suppose un cortège (headS, route, sono, ordre de départ, aléas, évacuation) sort tôt quand core.veille.
4) aleas.ts : aucun aléa de cortège en veille.
5) Vérifier les consommateurs hors du module (sim/police/command/core.ts, gameplay/session/engins.ts, ui/command/panelIncidents.ts) avec un cœur en veille : ils ne doivent rien viser au point de rassemblement vide. Une garde n'est ajoutée qu'aux fichiers du module ; un problème trouvé ailleurs est signalé à P3 ou P4.

#### Tests
crowd.veille.test.ts (createTestContext avec world, roles, people, vehicles, crowd, police, law, radio) :
- session {mode: 'monde_ouvert', crowdSize: 0, extra: {'crowd.veille': true}} : 600 s sans exception, phase 'aucune', aucune personne de faction protest, session toujours 'playing', commandement de police sans aucune compagnie ;
- spawnForeign fonctionne en veille ;
- sans la clé veille, une session crowdSize 0 reste inactive ;
- crowd.foyers, integration.manifestations-multiples, pre-assemblage.manif et integration.patrouilles passent sans modification.

### PACKAGE P2 — Foule : déclarations à la volée (foyers, manifestations sauvages) et imprévus du Mode libre
- dependsOn: ['P1']
- size: moyen
- files:
  - src/sim/crowd/foyers.ts
  - src/sim/crowd/manifs.ts
  - src/sim/crowd/api.ts
  - src/sim/crowd/index.ts
  - tests/unit/crowd.declare.test.ts (nouveau)

#### Changes
1) FoyersApi.declare(spec) :
   - construit le foyer comme plan() (composition, family, life), avec at = now, et le démarre aussitôt par begin() ;
   - pickPlace limité par spec.near (anneau min–max) quand il est donné ;
   - en veille, le critère de distance au parcours est ignoré (le parcours est dégénéré) ;
   - les foyers ne se terminent pas sur base 'terminee' en veille ;
   - rng : fork('foule:foyers:declare') ;
   - renvoie null si aucun lieu n'est trouvé.
2) ManifsApi.declare(spec) :
   - réutilise pickStart, pickDestination et create avec fork('foule:manifestations:declare:' + n) ;
   - manifestation sauvage : sans service d'ordre ni sono, radicaux × 2, libellé « Manifestation sauvage — <lieu> », rassemblement de 60 à 120 s, destination à 800–1 800 m, view.sauvage = true, annonce CENTRAL « cortège non déclaré » ;
   - budget 4 000 moins les présents, 1 500 au plus ; renvoie null au-delà ;
   - fonctionne en veille comme dans une session normale.
3) ManifsSystem lit extra.imprevus : il programme `sauvages` manifestations sauvages (première à imprevus.premier, sinon entre 600 et 900 s ; écart 300–600 s) avec fork('foule:imprevus'), près du cortège principal (anneau de 600 à 1 800 m).
4) api.ts : documenter declare, imprevus et ManifView.sauvage ; index.ts réexporte les types.

#### Tests
crowd.declare.test.ts :
- en veille, declare({kind: 'rassemblement', near}) émet 'crowd:foyer' début, des manifestants apparaissent à moins de 150 m, puis 'fin' au bout de la durée de vie ;
- en veille, ManifsApi.declare({sauvage: true, crowdSize: 300}) passe de rassemblement à cortège en moins de 200 s, sans personne au profil service_ordre ;
- même graine, mêmes positions ;
- session normale de 800 personnes avec imprevus {sauvages: 1, premier: 60} : une ManifView sauvage avant 90 s ;
- sans imprevus ni appel à declare, le nombre de personnes et de manifestations est identique à aujourd'hui pour une même graine ;
- les tests de foule existants passent.

### PACKAGE P3 — Équipage jouable sur le terrain et voiture banalisée
- dependsOn: ['P0']
- size: moyen
- files:
  - src/gameplay/session/equipage.ts (nouveau)
  - src/gameplay/session/setup.ts
  - src/gameplay/session/index.ts
  - src/gameplay/session/journee.ts
  - src/gameplay/session/mission.ts
  - src/gameplay/radio/callsigns.ts
  - src/sim/vehicles/defs.ts
  - src/sim/vehicles/specs.ts
  - src/render/vehicles/refdefs.ts
  - src/render/vehicles/models/index.ts
  - src/render/vehicles/models/cars.ts
  - tests/unit/session.equipage.test.ts (nouveau)

#### Changes
1) 'voiture_bac' :
   - defs.ts : gabarit, sièges et performances de 'voiture', faction police, couleur 0x2b2f36, {siren: true, beacons: true}, ajoutée à VEHICLE_KINDS ;
   - specs.ts et refdefs.ts : mêmes entrées que 'voiture' ;
   - models/index.ts : style voiture + unmarked ;
   - cars.ts : aucune livrée ni rampe ; plot bleu sur le toit côté conducteur et feux à éclats de calandre, sur le canal de gyrophares existant.
2) equipage.ts buildPatrolCrew(ctx, config, cast, summary, rand), appelée par setup.onStarted quand config.role === 'patrouille', avant buildWithPoliceUnits :
   - point = vacation.depart, sinon un point à l'écart du rassemblement (chooseStandOffCrowd), puis roadSpot dans le sens de circulation ;
   - véhicule (repli sur 'voiture' faction police si la définition manque) ;
   - groupe 'equipage' avec squad.vehicleId ; personnes dans l'ordre du cast ; conducteur au volant, les autres passagers ; le joueur est chef du groupe ;
   - aucun ordre 'suivre' à bord ;
   - summary rempli ;
   - publication de 'session.equipage'.
   En Mode libre avec des moyens > 0, la compagnie habituelle est aussi construite par buildWithPoliceUnits, sans le joueur.
3) cameraOf donne la caméra véhicule quand player.vehicleId ≠ 0.
4) journee.ts : le briefing de prise de service cite manif.nom et les organisateurs quand ils existent.
5) mission.ts : libellé « Équipage de patrouille ». Vérifier par grep "case 'telepilote'" chaque switch de rôle de src/gameplay et src/sim (orders.ts ROLE_KIND donne null : rien à faire) ; ajouter une garde explicite là où 'patrouille' tomberait dans un cas CRS par défaut.
6) callsigns.ts : l'indicatif du joueur 'patrouille' est celui de son groupe.

#### Tests
session.equipage.test.ts :
- vacation BAC conducteur BAC 75N : joueur 'policier_civil' au volant d'une 'voiture_bac' à moins de 120 m du site ; deux collègues à bord ; groupe 'BAC 75N' dont il est chef ; aucune compagnie ;
- siège chef de bord : joueur passager, conducteur de l'IA au volant ;
- Police secours : voiture_police ;
- le def de 'voiture_bac' a la sirène, faction police ; vehicles.defs passe ;
- Mode libre, rôle patrouille, 300 manifestants, moyens par défaut : compagnie présente, équipage hors du couloir de la foule, aucune journée de service ;
- integration.patrouilles et toute la suite passent.

### PACKAGE P4 — Mode patrouille : répartiteur d'appels, radio, renforts, fin de vacation ; compagnie sur les manifestations nées en cours de partie
- dependsOn: ['P0', 'P2', 'P3']
- size: gros
- files:
  - src/gameplay/patrols/calls.ts (nouveau)
  - src/gameplay/patrols/mode.ts (nouveau)
  - src/gameplay/patrols/index.ts
  - src/gameplay/patrols/api.ts
  - src/gameplay/patrols/system.ts
  - src/gameplay/session/manifestations.ts
  - tests/unit/patrol.calls.test.ts (nouveau)
  - tests/unit/patrol.mode.test.ts (nouveau)

#### Changes
1) calls.ts (pur) :
   - RYTHMES, nextCallAt, pickKind (respecte types et le délai de 900 s en calme), pickSpot, callSize ;
   - places réelles : MANIF_PLACES et PARIS_PLACES recopiées ou importées en lecture seule, plus des points de rue fournis par l'appelant ; anneau de 500 à 2 000 m, à plus de 300 m des appels en cours ;
   - callText : phrases radio françaises (annonce, acceptée, confiée, sur place, fin d'intervention, fin de vacation).
2) mode.ts PatrolModeSystem (ordre : après PatrolsSystem) :
   - activation : actif seulement si readVacation(config) existe ;
   - rng : ctx.rng.fork('patrouille:appels') ;
   - déclenchement :
     - foyers → FoyersApi.declare ;
     - manifestation sauvage → ManifsApi.declare({sauvage: true}) ;
     - feu → ctx.hazards.ignite sur un conteneur ou une voiture garée près du point, comme journee.ts ; l'incident détecté est lié par proximité ;
     - en cas d'échec (null), au plus deux autres tirages ;
   - annonce : radio CENTRAL sur le canal commandement, 'patrol:call', état 'annonce' ;
   - accept : objectif EXT.objectives avec point ; en chef de bord, autopilot.driveTo(urgence), setSiren et setBeacons ; à moins de 60 m, 'sur_place' ;
   - patrouille entre deux appels (chef de bord) : driveTo vers des points de rue à 300–900 m du départ. L'IA lâche le volant si le joueur occupe le siège conducteur ou descend.
   - decline, ou 90 s sans réponse : PatrolsApi.send de la voiture libre la plus proche → 'confiee' ;
   - fin d'appel : 'crowd:foyer' fin, 'crowd:manif' terminée, ou feu éteint → 'terminee' ; close() force la fin ;
   - requestBackup :
     - 'patrouille' → PatrolsApi.send ;
     - 'compagnie' (rassemblement ou manifestation sauvage, une seule à la fois) → après 120–240 s : createCompany à serviceBaseFor, command.assume, command.arrive (assign au cortège pour une manifestation sauvage) ;
     - 'pompiers' et 'samu' → RescueApi.request ;
   - compteurs : interpellations faites par l'équipage, blessés ;
   - fin de vacation : à sessionDurationSeconds (sauf temps réel) ; session.end(true) à moins de 40 m du départ ou au bout de 180 s ;
   - reset() remet tout à zéro.
3) system.ts :
   - les voitures BAC de l'IA prennent 'voiture_bac' si ctx.vehicles.def la connaît ;
   - en vacation, le site du joueur est exclu (même indicatif, ou à moins de 300 m).
4) manifestations.ts : sur 'crowd:manif' début d'une manifestation déclarée en cours de partie (hors vacation), engager une compagnie IA après 180–300 s, avec les mêmes règles que les manifestations supplémentaires (manifestations.compagnies false → rien).
5) index.ts : [new PatrolsSystem(), new PatrolModeSystem()]. api.ts réexporte les types.

#### Tests
patrol.calls.test.ts (pur) :
- même graine, même suite d'appels ;
- en calme, ni casseurs ni manifestation sauvage avant 900 s ;
- distances respectées ;
- phrases sans « undefined ».

patrol.mode.test.ts (simulation complète) :
- vacation BAC agitée, premier = 5 : appel annoncé avant 10 s ;
- accept() publie un objectif ; en chef de bord, la voiture dépasse 2 m/s en moins de 10 s ;
- sans réponse : 'confiee' au bout de 90 s, et une voiture de l'IA 'en_route' ;
- requestBackup('compagnie') sur un rassemblement : compagnie présente avant 240 s et à moins de 150 m du point avant 600 s ;
- durée 'courte' : session.end au plus tard à 780 s, avec summary.calls ≥ 1 ;
- session 'libre' : système inactif ;
- session libre avec imprevus {sauvages: 1, premier: 60} et des moyens : une compagnie IA est engagée sur la manifestation sauvage ;
- integration.patrouilles et integration.manifestations-multiples passent.

### PACKAGE P5 — Mode libre complet : nom et organisateurs, curseur « Imprévu », lieu au hasard, départ et aperçu des colonnes, rôle Patrouille
- dependsOn: ['P0']
- size: moyen
- files:
  - src/ui/screens/scenario.ts
  - src/ui/screens/catalog.ts
  - src/ui/screens/home-panes-a.ts
  - src/ui/screens/home-panes-b.ts
  - src/ui/core/api.ts
  - tests/unit/ui.scenario.test.ts
  - tests/unit/ui.libre.test.ts (nouveau)

#### Changes
1) catalog.ts :
   - MODES : mêmes identifiants ; libellé « Patrouille » pour monde_ouvert ;
   - ROLES : entrée 'patrouille' (variantes bac et police_secours, grades, postes conducteur et interpellation, posteLabels {interpellation: 'Chef de bord'}) ;
   - ORGANISATEURS, IMPREVU_LEVELS (libellés et phrases d'aide), COLUMN_DEPARTS.
2) scenario.ts :
   - champs du brouillon et bornes ; suggestManifName ;
   - buildSessionConfig :
     - manif.nom et manif.organisateurs (« aucun » → crowd.sono false, plus le scénario par défaut) ;
     - curseur Imprévu ;
     - lieuHasard tiré par createRng(seed) ;
     - départ des colonnes → preload ou journee false ;
     - rôle 'patrouille' → journee false ;
     - mode 'monde_ouvert' → migrateLegacyPatrol ;
   - draftFromConfig relit tout ;
   - summarize ;
   - columnsPreview(d) ;
   - surpriseDraft tire un imprévu de 1 à 3.
3) home-panes-a.ts :
   - buildMode sans les cartes de mode (pickMission inchangé) ;
   - buildRole : libellés de poste par rôle ; tuile role-patrouille masquée en mode carrière.
4) home-panes-b.ts :
   - buildFoule : manif-nom, org-<id>, curseur imprevu, case lieu-hasard ; retirer les branches et les mentions « monde ouvert » ;
   - buildMoyens : colonne-depart-<id> et columnsPreview ;
   - buildOptions : la case journée est synchronisée avec le départ 'sur_place'.
5) ui/core/api.ts : champs facultatifs de ScenarioExtra.

#### Tests
ui.scenario.test.ts mis à jour (résumé et monde_ouvert via la migration).

ui.libre.test.ts :
- aller-retour draftFromConfig(buildSessionConfig(d)) pour les nouveaux champs ;
- un brouillon par défaut produit EXACTEMENT la config d'aujourd'hui (copie figée en fixture) ;
- imprévu 0 → foyers 0 ; imprévu 3 → imprevus.sauvages 2 ;
- organisateurs 'aucun' → sono false ;
- lieuHasard : même graine, même lieu, toujours dans DEFAULT_PLACES ;
- départ 'sur_place' → journee false ; départ d'une base → preload à une seule base ;
- rôle patrouille → journee false ;
- columnsPreview : une seule colonne 'mine' ;
- une config enregistrée par la version actuelle (fixture) se relit sans perte.

### PACKAGE P6 — Accueil en quatre modes : hub, vue Patrouille, Missions spéciales par poste, fiche de briefing
- dependsOn: ['P0', 'P3', 'P5']
- size: gros
- files:
  - src/ui/screens/home.ts
  - src/ui/screens/home-hub.ts (nouveau)
  - src/ui/screens/home-patrol.ts (nouveau)
  - src/ui/screens/home-missions.ts (nouveau)
  - src/ui/screens/career.ts
  - src/ui/screens/history.ts
  - src/ui/core/icons.ts
  - src/ui/core/css/screens.ts
  - harness/ui.ts
  - tests/unit/ui.home-hub.test.ts (nouveau)
  - tests/e2e/lib.mjs
  - tests/e2e/verif-lib.mjs
  - tests/e2e/*.mjs qui pilotent l'éditeur (voir currentState, liste à confirmer par grep)
  - tests/e2e/verif-accueil-modes.mjs (nouveau)

#### Changes
1) home.ts :
   - routeur de vues EXCLUSIVES ('hub' | 'patrouille' | 'missions' | 'briefing' | 'libre') : une seule vue montée, l'éditeur construit à la demande ;
   - données d'ouverture { view?, section?, mode?, missionId? } : une section sans vue ouvre 'libre' ;
   - back() revient au hub depuis une sous-vue ;
   - « Continuer » sur le hub ;
   - launch applique migrateLegacyPatrol ;
   - Start à la manette : tuile focalisée sur le hub, « Lancer » dans l'éditeur ;
   - nav-carriere et nav-historique conservés dans la barre.
2) home-hub.ts :
   - quatre tuiles ; la tuile carrière ouvre 'carriere' (ou l'éditeur en mode carrière) ;
   - grille 4 colonnes, 2 × 2 sous 900 px de large ou 500 px de haut ;
   - tuiles de 128 px au plus en paysage bas ;
   - safe-area ; focus initial ; flèches.
3) home-patrol.ts : PatrolSetup initialisé depuis store.last() quand c'est une vacation ; premier recopié depuis le paramètre d'URL ; sections Équipage, Place, Départ, Ambiance ; patrouille-lancer → store.setLast puis session.start(vacationSessionConfig).
4) home-missions.ts :
   - fonctions pures missionsByPoste (par MissionDef.role ; chapitre 0 → École ; commissaire → Commandant) et briefingOf ;
   - vue rail poste-<id>, liste spec-<id>, fiche ;
   - briefing-lancer : pickMission puis launch ; briefing-ajuster : vue libre, section mode ;
   - en carrière, une mission verrouillée désactive Lancer.
5) career.ts : « Jouer la mission » ouvre {view: 'briefing', mode: 'carriere', missionId}.
6) history.ts : libellé « Patrouille » ; « Rejouer » passe par la migration.
7) icons.ts : mode_patrouille, mode_carriere, mode_missions, mode_libre, role_patrouille.
8) css/screens.ts : hub, vue, patrouille, missions ; cibles ≥ 40 px ; aucun débordement à 844 × 390.
9) e2e :
   - assistant ouvrirEditeur(page) dans lib.mjs et verif-lib.mjs, appelé par chaque scénario qui pilote l'éditeur ;
   - scénarios manette : ouvrir la tuile au pad ;
   - ui.mjs : le test de navigation au clavier part du hub ;
   - harness/ui.ts adapté ;
   - nouveau verif-accueil-modes.mjs, en 1280 × 720 puis 844 × 390 tactile : 4 tuiles sans défilement ni débordement ; chaque vue s'ouvre et revient ; plus de 100 missions sur au moins 10 postes ; patrouille-lancer quitte 'menu_principal' avec extra.vacation.

#### Tests
ui.home-hub.test.ts (pur) :
- missionsByPoste couvre chaque mission une seule fois ;
- briefingOf : au moins un objectif principal par mission ;
- normalisation des données d'ouverture.
Navigateur : run-all.mjs complet, PC et téléphone.

### PACKAGE P7 — En jeu : carte d'appel (HUD), touche Y réservée, appel dans l'écran radio, compte rendu de vacation
- dependsOn: ['P4', 'P6']
- size: moyen
- files:
  - src/ui/patrol/index.ts (nouveau)
  - src/ui/patrol/dispatch.ts (nouveau)
  - src/ui/patrol/format.ts (nouveau)
  - src/ui/index.ts
  - src/input/bindings.ts
  - src/ui/command/radioScreen.ts
  - src/ui/screens/debrief.ts
  - tests/unit/ui.patrol-dispatch.test.ts (nouveau)
  - tests/e2e/verif-patrouille.mjs (nouveau)

#### Changes
1) ui/index.ts : ajouter './patrol/index.ts' au glob des sous-modules.
2) patrol/index.ts : widget HUD 'patrol-dispatch' (addHudWidget, zone gauche), actif seulement quand PatrolModeApi.active.
3) dispatch.ts :
   - carte hud-appel ; boutons appel-prendre et appel-decliner, puis appel-renforts (renfort-*) et appel-fin ;
   - touches Y et Maj + Y (sans effet quand un champ a le focus ou qu'un écran modal est ouvert ; libellé par labels.ts) ;
   - pastille hud-appel-pastille au bout de 20 s ;
   - au téléphone, version compacte sans chevauchement de la mini-carte ni des actions rapides ;
   - rafraîchissement toutes les 0,5 s ;
   - ne pas modifier quickActions.ts.
4) bindings.ts : KeyY dans RESERVED_KBM.
5) radioScreen.ts : une section « Appel en cours » (Prendre, Décliner, Renforts, Fin), rendue seulement si le service 'patrol.mode' est actif. C'est le chemin manette ; insertion minimale, à rebaser sur les correctifs d'interface en cours.
6) format.ts (pur) : callTitle, callLine, stateLabel, summaryLines.
7) debrief.ts : en vacation, titre « Fin de vacation — <indicatif> » et lignes du bilan avant les sections existantes ; « Rejouer » relance la même config.

#### Tests
ui.patrol-dispatch.test.ts :
- callTitle couvre toutes les CallKind ;
- callLine : mètres sous 1 km, kilomètres avec virgule, « ~ » devant les effectifs ;
- summaryLines : 7 lignes, sans NaN, pour un résumé nul comme pour un plein ;
- isValidCode('kbm', 'KeyY') === false.

verif-patrouille.mjs :
- PC : hub → patrouille → crew-bac → rythme agité, lancé avec ?premier=5 → le joueur est dans une 'voiture_bac', hud-appel visible en moins de 30 s, Y passe l'appel à 'acceptee' et publie un objectif, 0 erreur console ;
- téléphone 844 × 390 : même parcours au doigt, pas de chevauchement avec la mini-carte, boutons ≥ 40 px, images par seconde mesurées.
