# Notes d'intégration (tenues par l'intégrateur)

Points à reprendre lors de l'assemblage, parce qu'ils ont été décidés après le lancement de certains modules.

## Décisions du commanditaire arrivées en cours de route
- **Commandant unique** (BRIEF §1) : `commandant` = chef d'unité + autorité habilitée. À aligner :
  - `gameplay/law` : `sommation()` doit accepter le poste `commandant_unite` (et toute personne avec `look.sash`), pas
    seulement `commissaire` / `autorite_civile` ; `authorize()` immédiat, sans délai.
  - `sim/roles/archetypes` : le commandant reçoit écharpe, mégaphone, fusée de sommation.
  - `ui` (page d'accueil) : ne proposer qu'un rôle « Commandant » (le rôle `commissaire` est un alias masqué).
  - `ui/command` : pas de demande d'autorisation ; bouton « Sommation suivante » disponible pour le commandant.
- **Formations impeccables**, **métro source d'affluence**, **couper la circulation**, **barricades et feux réalistes**
  (batteries de vélos et trottinettes), **incidents à déléguer**, **appeler les secours**, **pompier jouable** : vérifier
  que les modules lancés avant ces ajouts (décor, dangers, matériel, personnes) les couvrent ; sinon passe complémentaire.
- **Dix améliorations retenues** (BRIEF) : préparation, prévention, liaison, signes avant-coureurs, densité, fatigue et
  logistique, compte rendu et relecture, missions miroirs, campagne sur plusieurs jours, école.

## Technique
- Rendu des immeubles : mur aveugle à texture étirée vu sur `buildings-haut-street-15.png` (pignon) — à corriger.
- `lanceur_cougar` : identifiant interne conservé, mais le nom affiché doit être générique (« Lanceur de grenades 56 mm ») :
  « Cougar » est un nom de modèle commercial.
- Écharpe tricolore : son sens de port n'est fixé par aucun texte ; convention du jeu = description du commanditaire.
- Monuments : `prewarm()` à appeler pendant l'écran de chargement ; `camera.far` et brouillard doivent laisser voir la
  silhouette de la Tour Eiffel à plusieurs kilomètres.
- Le cœur borne le temps réel par image à 0,1 s : les tests e2e de gameplay avancent avec `__CRS.step(secondes)`.

## Consommation : option 1 retenue par le commanditaire
- Les étapes **simples et vérifiables** (catalogue de missions rédigé, tables de données, textes de radio, écrans simples,
  documentation) tournent sur un **modèle plus léger**.
- Le **modèle haut de gamme** reste obligatoire pour : IA de foule, IA des unités, physique, rendu et tout ce qui se juge
  à l'œil (monuments, écrans soignés), assemblage, revues.
- Toute livraison du modèle léger est **relue par le modèle haut de gamme** ; si elle ne passe pas, l'étape est refaite
  sur le modèle haut de gamme.
- Ne s'applique qu'aux chantiers lancés après cette décision.

## Carte (rapport de vérification du 16/11)
- `RoadEdge.width` est la largeur ROULABLE (médiane 77 % de la chaussée réelle ; rue de Rivoli : 3 m pour 13,4 m ;
  205 axes décentrés de plus de 3 m). Pour barrer une rue de façade à façade ou placer une ligne, lancer des rayons vers
  les bâtiments (`world.raycast`) plutôt que se fier à `width + 2 × sidewalk`. À corriger dans le pipeline si le trafic ou
  les formations en souffrent.
- Places de la Concorde et de la Bastille dans leur état récent (moitié piétonne).
- 59 nœuds `boundary` à l'intérieur de l'emprise = bouches de souterrains retirés (culs-de-sac pour le trafic).
- Clé `hotel_crillon` : nom technique à renommer des deux côtés (carte et monuments) si on veut l'éviter.
- Un bâtiment à `landmarkKey` sans définition de monument doit être extrudé normalement (repli).

## Poste du commandant (décision du 16/11, après le lancement de l'interface et de l'IA)
- `ui/command` : la carte tactique doit avoir DEUX niveaux d'information selon que le joueur-commandant est au véhicule de
  commandement (≤ 8 m ou à bord : tout) ou à pied (rapports radio seulement : unités approximatives, pas de drone, foule
  estimée). Publier/consommer un service `command.post` { atVehicle: boolean, vehicleId, lost: boolean }.
- `sim/police/command` : créer et placer le véhicule de commandement (`vl_commandement`), le protéger (une escorte), le
  déplacer sur ordre ; s'il est détruit → poste perdu (carte dégradée en permanence).
- Sommations : vérifier la portée de mégaphone (le commandant doit être à ≤ ~60 m de la foule visée).
- Moral : bonus aux unités proches du commandant à pied.
- Mode « salle de commandement » : `GameMode` ou `config.extra.poste = 'salle'` ; pas de personnage incarné, caméra drone /
  carte ; sommations déléguées à un officier IA sur ordre. À proposer sur la page d'accueil.

## Circulation (précision du 16/11, après le lancement du module de trafic)
- Manifestation DÉCLARÉE : le module `sim/traffic` ferme d'office le lieu de rassemblement et tout le couloir du parcours
  (`ctx.director.route` + marge ~60 m) dès `session:started`, n'y fait apparaître ni rouler aucun véhicule civil, et y
  retire le stationnement.
- Situations IMPRÉVUES (groupe hors parcours, rassemblement non déclaré, blocage, émeute de nuit, soir de match) : rien
  n'est fermé d'avance ; arrêt et demi-tour à ≥ 40 m de toute foule dense, jamais d'entrée dans une foule ; rarement un
  véhicule coincé → incident `automobiliste_bloque`. Le type de mission (`MissionType`) et
  `config.extra` (circulation ouverte ou coupée au départ) décident du cas.
- Les fermetures du joueur servent au périmètre (rues adjacentes, accès, itinéraires de secours).
- Véhicules en stationnement conservés dans les rues adjacentes.

## Interface (relevé sur captures du 16/11)
- Carte tactique (`command-socle-tactique-1280x720.png`) : les NOMS DE LIEUX sont dessinés en lettres géantes par-dessus
  la carte (taille exprimée en mètres au lieu de pixels, ou mauvais facteur d'échelle). À corriger dans le dessin de
  carte 2D (`src/ui/maps` — repli — et/ou service `world.map2d`) : taille de police bornée en pixels, filtrage par
  importance selon le zoom, pas de recouvrement.
- Page d'accueil : retirer la tuile « Commissaire » (commandant unique) ; ajouter le choix du poste du commandant
  (terrain + véhicule de commandement, ou salle de commandement).
- `main.ts` : le panneau de diagnostic (affiché quand `ctx.view` est nul) recouvrirait la page d'accueil — le retirer dès
  que le module d'interface est branché.
- L'interface applique elle-même vent, coupure de circulation et fermeture de stations au démarrage (rayon 350 m) : à
  déplacer vers le cadre de mission quand il existera, pour éviter un double traitement.

## Événements multiples (décision du 16/11)
- Carte (plan et carte tactique) : afficher tous les événements en cours dans la ville (service à définir, ex.
  `events.city` { list: { id, kind, x, z, size, phase, tension } }).
- Déplacement : conduite uniquement (pas de téléportation, pas de déplacement rapide). Ordres à distance depuis le poste
  de commandement.
- Étape 1 : manifestation principale + événements secondaires (directeur / missions). Étape 2 : plusieurs manifestations
  avec simulation à deux niveaux (foule lointaine agrégée, matérialisée à l'approche) — demande une évolution du module
  de foule (plusieurs directeurs / zones).

## Priorité budgétaire (16/11) : d'abord la manifestation jouable
Le commanditaire dispose d'une recharge et de 40 € de crédit. Ordre de marche :
1. **Essentiel** — terminer : sol/Seine, ciel/météo/caméra, IA de la foule, IA des unités, incidents, rendu du mobilier et
   des effets ; puis ASSEMBLER (main.ts, mise en place d'une session libre : unités, foule, joueur CRS ou commandant,
   HUD, carte tactique, compte rendu minimal) et corriger jusqu'à ce que ce soit jouable sur PC, manette et téléphone.
2. **Ensuite** — moteur de missions complet, pancartes lisibles, poste de commandement, signes avant-coureurs dans le HUD.
3. **Plus tard, selon le budget** — carrière, rôles journaliste / médecin / drone / pompier jouables, médias, campagne,
   école, événements multiples, optimisation téléphone poussée.
Ne lancer aucun chantier du point 3 avant que le point 1 soit jouable.

## Véhicules (rapport du 16/11)
- **Signe de `turretYaw`** : le contrat fixe désormais « positif = vers la droite du véhicule, cap monde = heading −
  turretYaw ; site positif = canon levé » (convention du module des véhicules et de leur rendu).
  `src/sim/people/player-vehicle.ts` applique l'INVERSE : à corriger (le joueur tireur viserait du mauvais côté).
- `vehicle:siren` est émis à la fois par le contrôleur du joueur et par le module des véhicules : ne garder qu'un émetteur
  (le module des véhicules ; le contrôleur écrit seulement `Vehicle.siren`).
- `vehicle:turret_fired` est réémis toutes les 0,5 s pendant un jet continu (canon à eau) : l'audio et les effets doivent
  le traiter comme un maintien, pas comme un nouveau tir.
- `interactions.startVerb` du cœur neutre ne transmet pas `targetId` à `find()` ; le vrai module des personnes le fait.
- `findPath` ne sait pas exclure une rue fermée : le pilote automatique gère lui-même les fermetures (EXT.traffic).
- Services : 'vehicles.autopilot' (driveTo, follow, convoy, park, parkRow, stop, status) et 'vehicles.ext'.

## Assemblage 1 (16/11) — premier jeu jouable

Mode d'emploi du jeu : `docs/PLAYING.md`. Tests : `tests/e2e/game.mjs` (vrai jeu, ordinateur et téléphone),
`tests/e2e/game-dist.mjs` (jeu construit servi sous un sous-chemin), `tests/unit/integration.session.test.ts`.

### Modules branchés (`src/main.ts`, tableau MODULES)
`input`, `env`, `world/query`, `sim/roles` (archétypes), `sim/people`, `sim/vehicles`, `sim/traffic`, `sim/crowd`,
`sim/items`, `sim/props`, `sim/hazards`, `gameplay/law`, `gameplay/radio`, `gameplay/session` (nouveau), puis la
présentation : `render/base` (en premier : à ordre égal les systèmes s'exécutent dans l'ordre d'ajout), `world/view`,
l'adaptateur `main.map2d`, `world/monuments`, `render/people`, `render/vehicles`, `render/fx`, `ui` (qui agrège
`ui/maps` et `ui/command`), `audio`.

Quatre modules de la liste « en cours » ont été branchés parce qu'ils remplissaient les trois conditions au moment du
branchement (compilation sans erreur, tests verts, aucun fichier modifié depuis plus de 10 minutes) :
- `render/vehicles` : 68 tests verts, inchangé depuis plus de 20 min (95 min à la fin de l'assemblage) ;
- `sim/crowd` : compte rendu livré (`docs/modules/ia-foule.md`), inchangé depuis 72 min ; `sim/traffic` : compte rendu
  livré (`docs/modules/vehicules-circulation.md`), inchangé depuis 50 min ; 69 tests verts pour les deux ;
- `render/fx` : 5 fichiers de tests verts, inchangé depuis 39 min.
La foule et la circulation se mettent en place seules sur `session:started` d'après `ctx.session.config` ; la mise en
place de session ne pose alors plus ses passants figés (la circulation fournit les piétons civils).

### Laissés de côté (encore modifiés pendant l'assemblage — à brancher à l'assemblage 2)
- `sim/police` : fichiers modifiés jusqu'à la dernière minute. Conséquence : les collègues du joueur ne bougent pas, les
  ordres ne sont exécutés par personne, le service `police.units` est absent.
- `render/props` : en cours d'écriture. Conséquence : mobilier, vitrines et barricades sont SIMULÉS mais INVISIBLES
  (on bute sur des poubelles et des barrières que l'on ne voit pas).
- `gameplay/incidents`, `sim/roles/rescue`, `sim/roles/medics` : apparus pendant l'assemblage, modifiés dans les dix
  dernières minutes. `gameplay/missions/catalog` : données seules (pas de système), en cours de relecture.
- `sim/crowd/radical/` (contrôleurs des groupes radicaux) : sous-dossier apparu à 04 h 58, en cours d'écriture ; il
  n'est pas importé par `sim/crowd/index.ts`, dont les fichiers n'ont pas bougé. Radicaux, pilleurs et opportunistes
  se conduisent donc pour l'instant en « militants agités » (comportement par défaut du module de foule).
Les lignes d'import correspondantes sont prêtes, en commentaire, dans `src/main.ts`.

### Ajouts compatibles au cœur
- `src/core/session.ts` : `SessionController.addPreparation(fn)` (+ type `SessionPreparation`, constante
  `SESSION_PREPARATION_TIMEOUT_MS`). Tâches asynchrones attendues APRÈS `session:started` et AVANT la phase « playing » :
  la phase reste « loading » (écran de chargement) pendant que la présentation construit la ville. Sans préparation
  enregistrée (tests headless), le déroulement de `start()` est inchangé. Une préparation en erreur ou muette plus de
  90 s n'empêche pas de jouer. Accès : `getCore(ctx).session.addPreparation(...)`.
- `contracts.ts` et `extensions.ts` : aucun changement.

### Nouveau module `src/gameplay/session/` (cadre de mission provisoire)
- `setup.ts` — système `session.setup`, ordre `SystemOrder.RULES − 100`, simulation pure. Sur `session:started` :
  emplacement de départ (`placement.ts` : à 30–65 m du repère le plus proche du lieu, face à lui, sol dégagé, sinon
  sur place dans l'axe de la rue ; repli `world.randomFreePoint`), distribution selon le rôle (`roster.ts`, compositions
  de `roles.spawn.policeUnit`), véhicules stationnés derrière le front, unités `ctx.squads` avec chefs et hiérarchie
  (groupe ; section + groupes A et B ; compagnie + section pour le commandant), `ctx.player.possess`, caméra (première
  personne par défaut, `extra.camera = 'tps'`), 10 passants immobiles (`extra.passants`), puis vent / circulation
  coupée / métro fermé du scénario. AUCUN manifestant n'est créé (sauf le joueur s'il en est un).
  Service `session.setup` (`SessionSetupApi` : résumé, identifiants créés) ; événements libres `ui:loading` et
  `session:setup`. Si le service `police.units` est présent (rôles CRS et chef de groupe), c'est lui qui construit
  l'unité (`createGroup` / `createSection`, disposition « ligne ») — chemin testé avec un service factice seulement.
- `loading.ts` — `installLoadingGate(ctx)`, appelé par `main.ts` : préparation de fin de chargement (monuments proches
  par `MonumentsApi.prewarm`, un par image ; ville par `WorldViewApi.flush` jusqu'à file vide, 60 s au plus ; trois
  images de compilation). Mesures dans le service `session.loading`.
- À remplacer par le vrai cadre de mission : reprendre alors l'application du vent / circulation / métro.

### Défauts d'assemblage corrigés
1. **Fond de carte, conventions divergentes** (`world.map2d`) : pour `world/view`, `rotation` est le cap placé en haut
   (nord en haut = π) et les options sont `{ names, landmarks, complete }` ; `ui/maps`, `ui/command` et le mini-plan de
   l'accueil appellent avec 0 = nord en haut et `{ labels, detail, pixelRatio }`, et attendent un champ `revision`.
   Sans correction : carte tête en bas, `labels: false` ignoré (noms sur la mini-carte), cache jamais rafraîchi.
   Corrigé par l'adaptateur `main.map2d` de `src/main.ts` (service d'origine conservé sous `world.map2d.native`).
   Les noms de lieux ne sont plus géants : le service de la ville borne déjà la police (9–13 px), filtre par importance
   et évite les recouvrements ; l'adaptateur dessine en pixels CSS (contexte mis à l'échelle de la densité d'écran).
   Le repli `src/ui/maps/basemap.ts` (noms géants relevés le 16/11) ne sert plus dès que `world/view` est branché ;
   il n'a pas été retouché.
2. **Tourelle en miroir** : `sim/people/player-vehicle.ts` écrivait `turretYaw` positif vers la gauche, alors que
   `sim/vehicles` et `render/vehicles` le lisent positif vers la droite (cap monde = heading − turretYaw). Signe aligné
   dans le contrôleur du joueur ; test `people.player` mis à jour ; vérifié avec les vrais modules (tir du Centaure
   aligné sur le regard, `integration.session`).
3. **Commandant unique** : tuile « Commissaire » retirée de la page d'accueil (`ui/screens/home-panes-a.ts`) ; un
   brouillon qui porte le rôle `commissaire` (scénario enregistré, « Surprends-moi ») devient le commandant
   (`unifyCommander` dans `ui/screens/home.ts`). Le rôle reste valide dans le contrat et par l'URL (même personnage).
   `tests/e2e/ui.mjs` (parcours) aligné. Le choix du poste du commandant (terrain / salle) reste à faire.
4. **Double traitement du scénario** : `ui/core/system.ts` n'applique plus vent / circulation / métro quand le service
   `session.setup` existe (la mise en place le fait sur `session:started`).
5. **Panneau de diagnostic** retiré de `src/main.ts` (il aurait recouvert la page d'accueil). Sans WebGL, une
   notification l'explique.
6. **Prewarm des monuments** : fait pendant l'écran de chargement (voir `loading.ts`).

### Vérifié en jeu (captures regardées)
Page d'accueil, chargement avec progression réelle, vues à la première et à la troisième personne place de la
Concorde (pavés, obélisque et sa grille, fontaine, hôtels de Gabriel, arbres, ciel, groupe de six CRS, HUD, mini-carte),
manifestation en phase de rassemblement (manifestants visibles, parcours tracé sur la mini-carte), marche et course,
collision avec la grille de l'obélisque, grenade lacrymogène en main puis lancée (projectile, nuage de gaz dessiné,
faute relevée par le droit : emploi sans sommation), plan de Paris orienté nord en haut, carte tactique avec l'unité,
pause, paramètres, recommencer, compte rendu, commandes tactiles sur téléphone. Zéro erreur console.

### Mesures (16/11, Chromium headless, WebGL logiciel SwiftShader, machine partagée à charge 12–20 sur 4 cœurs)
Qualité « bas », fenêtre 960×540 (tampon de rendu 672×378), place de la Concorde, CRS + foule de 100 attendus.
- Démarrage jusqu'à la page d'accueil : 3 à 4,5 s. Chargement d'une session (clic sur « Lancer » → jeu) : 9 à 21 s
  selon la charge, dont monuments proches 1,4 à 2,1 s (4 ou 5 monuments) et construction de la ville 2,7 à 7,9 s.
- Image en jeu (troisième personne, groupe, obélisque, foule) : 89 à 90 appels de dessin, 687 000 à 712 000 triangles —
  ville 630 000 (dont immeubles 46 000 : le sol découpé et les arbres font l'essentiel), monuments 42 000,
  véhicules 3 000, une cinquantaine de personnages en 9 appels.
- JavaScript par image (16 images, un pas de simulation chacune) : médiane 5,4 à 5,9 ms, minimum 2,0 ms ; simulation
  0,6 ms, présentation 4,6 à 4,8 ms dont `renderer.render` 3,4 à 3,6 ms. **Aucun système ne dépasse 4 ms par image en
  médiane** (`render.present` : 3,4 à 3,6 ms ; pointes isolées de 13 à 30 ms quand la machine préempte).
- Pas de simulation sans rendu (Node) : 1,08 ms de processeur par pas avec 240 personnes et 76 véhicules (foule et
  circulation branchées) ; 0,2 à 0,4 ms par pas dans le navigateur sans foule.
- Mémoire JavaScript : 141 à 150 Mo. Jeu construit : 3,23 Mo de JavaScript (avant compression), 9,3 Mo de données de carte.
- « Recommencer » : pas de fuite (104 → 91 géométries, 53 → 53 textures, mêmes effectifs de police).
- Cadence réelle : 0,4 à 0,55 s par image avec le tramage logiciel à charge ≈ 10, plusieurs secondes quand la machine
  est saturée — sans rapport avec un vrai processeur graphique, non disponible ici.

### Défauts connus après l'assemblage 1
- **Tour Eiffel / monuments lointains invisibles** : `render/base` règle le brouillard sur la distance d'affichage
  (FogExp2, 92 % à `drawDistance` : 300 m en bas, 500 en moyen, 900 en haut, 1 500 en ultra). `camera.far` vaut 8 000 m,
  mais les silhouettes de `world/monuments` (matériau `farMaterial`, sensible au brouillard) sont effacées au-delà
  d'environ 1,5 × la distance d'affichage ; depuis la Concorde la Tour est à 2 125 m. Piste : donner aux silhouettes
  de la carte le voile propre que le module des monuments vient d'écrire pour ses repères d'horizon
  (`horizonMaterial`, insensible au brouillard de scène) — fichiers en cours de modification, non touchés ici —
  ou plafonner le brouillard de scène par temps clair dans `render/base` (uniforme partagé à ajouter aux matériaux).
- **Trottoirs** : le sol dessiné est 8 cm au-dessus de `world.heightAt` (13 cm sur les pelouses) ; personnages et
  véhicules ne lisent pas `world.view.liftAt` : pieds et roues s'y enfoncent d'autant. `liftAt` fabrique une chaîne par
  appel : prévoir une variante sans allocation avant de l'appeler pour chaque personnage.
- **HUD en petite fenêtre (960 px de large)** : la jauge de santé passe sous la barre d'objets à neuf cases, et la
  boussole touche le panneau de situation. Correct à 1 280 px et sur téléphone.
- **Charge de triangles en qualité basse** : environ 650 000 triangles par image place de la Concorde (ville et arbres
  surtout) ; trop pour un téléphone modeste — à réduire dans `world/view` (rayon détaillé, arbres) à l'optimisation.
- **Hors navigateur**, la carte de Paris n'est lue qu'au premier démarrage hors mode test : `placeByName` ne connaît pas
  encore le lieu quand le cœur calcule le point de départ (repli sur l'origine, avec un avertissement). Dans le
  navigateur la carte est lue pendant `init()`, le lieu est trouvé. Les tests headless passent `x`/`z`.
- **Souris capturée sous Chromium headless** : chaque événement de bouton synthétique rapporte la position du pointeur
  comme un déplacement (le regard saute). SURTOUT : sous capture de la souris, Chromium headless s'emballe (images
  rares, mémoire du moteur de page qui passe de 100 Mo à plus de 1 Go en 30 s) — constaté par la recette sur une page
  VIDE, sans le jeu (`tests/e2e/verif-diag-lock-vide.mjs`, `verif-tpm-ptrlock.mjs`). C'est la cause des « images très
  lentes après le premier clic » et des pages tuées à plusieurs Go : ni le déverrouillage du son ni l'absence de
  `gl.finish()` (explications données à l'assemblage 1 : fausses). Depuis l'assemblage 2, `tests/e2e/game.mjs` ouvre la
  page avec `pointerLock: false` (`tests/e2e/lib.mjs`) : la capture est refusée, le jeu passe en mode de repli. La
  capture réelle reste à vérifier sur un vrai navigateur.
- Mur aveugle à texture étirée (`buildings-haut-street-15.png`) : pas retrouvé place de la Concorde ; non recherché
  ailleurs.
- Indicatif radio « AUTORITÉ » du droit contre « MISTRAL 0 » de la radio, sous-titres radio possibles en double
  (`ui` et `gameplay/radio` appellent tous deux `ui.subtitle`) : non traités, à voir avec l'IA des unités.

### Recette de l'assemblage 1 : corrigé / restant (assemblage 2, 16/11)

Deux testeurs indépendants ont relevé 35 défauts sur le premier jeu assemblé (scripts `tests/e2e/verif-*.mjs`).
Cette passe les a repris ; les tests qui auraient attrapé chaque défaut sont cités.

**Modules branchés en plus** (`src/main.ts`) — tous inchangés depuis plus de deux heures, compilation propre, tests
verts (49 fichiers, 199 tests, avec la foule) au moment du branchement :
`sim/police` (IA des unités ET commandement : `police.ai`, `police.command`), `render/props` (mobilier, vitrines,
barricades), `gameplay/incidents`, `sim/roles/rescue`, `sim/roles/medics`. `sim/crowd` embarque désormais son troisième
système `sim:crowd.radical` (groupes radicaux) : il est dans le jeu depuis que `sim/crowd/index.ts` l'importe.
Aucun fichier de ces modules « en cours » n'a été modifié.
Ordre : la police après la foule ; `render/props` après le rendu de base ; nouvel adaptateur `main.monuments.air`.

**Corrigé (majeurs)**
- *Collègues immobiles* : l'IA de police est branchée. Un ordre du chef de groupe est exécuté (« avancer » de 20 m :
  les cinq équipiers avancent de 18 m — `integration.forces`), le commandant IA déploie la compagnie (34 à 45 agents
  sur 84 ont manœuvré en 100 s dans le navigateur, 36 messages radio, un incident « automobiliste bloqué » traité).
  DANS une compagnie menée par l'IA, le chef de section envoie d'abord le groupe du joueur à son poste (jusqu'à
  290 m place de la Concorde) sans attendre son chef ; l'ordre du joueur prime ensuite le sien (il n'est pas
  remplacé), le groupe revient là où l'ordre a été donné, s'y met en colonne puis rejoint le point : 31 s si l'ordre
  est donné à 16 s de jeu, 49 s à 45 s, 87 s à 100 s (mesures sans rendu ; second test de `integration.forces`,
  partie B de `tests/e2e/assemblage2.mjs`). Si le joueur reste sur place, la colonne l'attend et avance au ralenti
  (20 m en 80 s) — comportement du module de police, non modifié.
- *« Moyens engagés » sans effet* : `gameplay/session` lit `extra.moyens`. Avec le service `police.units`, la mise en
  place crée la COMPAGNIE (1 à 8 sections : quatre dans la compagnie, les suivantes rattachées en renfort), ses fourgons
  (un par groupe, dans la limite demandée : les fourgons en trop et leurs conducteurs sont retirés), l'engin lanceur
  d'eau, le Centaure, les groupes BRAV-M (six motos) et l'équipe drone ; le joueur CRS, chef de groupe, chef de
  section ou commandant y tient son poste. Sans la clé (URL) : une section si une manifestation se tient, sinon le
  seul groupe du joueur. `SessionSetupSummary.means` dit ce qui est réellement en jeu. Rôles spécialisés et civils :
  la compagnie est créée aussi, commandée par l'IA ; l'équipe du joueur se range sur son flanc.
- *Dispositif posé dans le rassemblement* : `placement.chooseStandOffCrowd` — à 85–125 m du lieu, hors du couloir du
  parcours (≥ 40 m), sans manifestant à moins de 30 m, face au lieu, avec de la place derrière pour les véhicules.
  Les dix lieux de l'accueil sont vérifiés. Le camion sono n'est plus proposé aux forces (`sim/vehicles` : véhicule
  de faction « protest » réservé aux manifestants).
- *Fourgon nez vers le groupe* : véhicules de l'unité garés nez vers la sortie (demi-tour sur place après création :
  `faceExit`) ; un collègue renversé par un véhicule de police est relevé par le droit (« interdit », gravité 4).
- *Course qui vide le souffle* : au clavier la touche d'avance fait MARCHER ; nouveau bouton `jog` (touche physique
  KeyZ) qui bascule marche ↔ petite foulée, annoncé par une notification ; Maj tenu = sprint.
- *Mobilier invisible* : `render/props` branché (6 245 objets et 2 402 devantures place de la Concorde en 10 appels
  de dessin, 44 000 triangles en qualité basse).
- *Brume en qualité basse* : service `render.clearAir` du rendu de base (`src/render/base/clearAir.ts`) — les
  maillages confiés reçoivent le voile d'une atmosphère réelle (5 km par temps clair, même loi météo que la scène) au
  lieu du brouillard de distance d'affichage ; l'adaptateur `main.monuments.air` lui confie le groupe des monuments.
  La tour Eiffel se voit du Trocadéro (751 m) et de la Concorde ; le reste de la ville garde le brouillard qui cache
  la limite d'affichage.
- *Carte tactique à la manette* : un second appui sur le bouton du plan (Select) passe à la carte tactique, un
  troisième revient au jeu ; entrée « Carte tactique » dans le menu de pause ; l'aide n'affiche plus une touche de
  clavier (`keyLabelOf` : « Select ×2 »).
- *Gels en déplacement* : fond de carte 2D redessiné une fois les tuiles stabilisées et par tranches
  (`Map2dApi.incomplete`, adaptateur `main.map2d`) au lieu de tout reconstruire à chaque tuile. Traversée de 180 m à
  54 km/h rejouée (`verif-tpm-perf --parts=B`) : 2 images sur 360 au-dessus de 33 ms (107 et 38 ms) contre 15
  (pire 451 ms) ; le pic de 448 ms du système `props` n'a pas été revu (pire : 15 ms sous Node en roulant).
- *Code branché changé pendant la recette* : voir « Modules branchés en plus ».

**Corrigé (mineurs)** : troncs d'arbres solides (`world/query` : `BucketBuilder.addTrunk`, sauf dans l'emprise
roulable d'une voie) ; « Repousser » plus proposé sur un collègue ; avance rapide branchée (`session.timewarp`, ×4,
bascule) ; touche et bouton « Ordres » d'un équipier : notification « Vous recevez les ordres », bouton tactile
masqué ; HUD compact sous 1 100 px de large, barre d'objets réduite, panneaux du bas relevés sous 760 px ;
notifications bornées en hauteur (au plus au tiers de l'écran), en lignes (4, 3 sous 600 px, 2 sous 420 px), une
seule sous 600 px, masquées derrière un écran bloquant ouvert après elles ; sous-titres masqués en pause ; pieds posés
sur le sol dessiné (`render/people` lit `world.view.liftAt`, rendu sans allocation) ; mur aveugle en pleine rue
(`world/view/buildings` : un voisin qui couvre moins de 60 % de la hauteur ne rend plus le mur mitoyen) ; bouclier
levé et arme longue au port en vue subjective (`render/people/fp.ts`) ; départ dégagé : le joueur d'un rang intérieur
d'une formation de l'IA est posé au bout du premier rang, couloir de 8 m libre devant lui (`setup.stepOutOfRanks` —
au premier essai sur téléphone il n'avançait que de 1,4 m en 8 s, enfermé derrière les boucliers ; 30 m ensuite), vue
à la troisième personne seulement si un collègue reste dans l'axe ; le joueur peut prendre le volant d'un véhicule de
son unité tenu par un conducteur IA, qui lui cède la place (`sim/vehicles/seats.ts` : `yields`, `makeRoom`) ;
« risque de débordement modéré » ; lieu inconnu dans l'URL : libellés composés
acceptés (« Champs-Élysées – Étoile ») et notification sinon ; capture de la souris demandée seulement au
clavier-souris ; pause automatique en portrait ; avertissement à l'accueil sans stockage local ; `game.mjs` : capture
refusée, touches de menu tenues deux images.

**Ajouts compatibles au contrat** : `Button` gagne `'jog'` (`contracts.ts`). `extensions.ts` inchangé.
Services nouveaux (clés libres) : `render.clearAir` (`RenderClearAirApi`), `session.timewarp` (`TimeWarpApi`) ;
`SessionSetupSummary` gagne `means` et `offCrowd` ; la source de carte 2D de `world/view` gagne le drapeau `incomplete`.

**Vérifications rejouées en fin de passe** (16/11, Chromium headless, WebGL logiciel) : `npx tsc --noEmit` propre ;
`npx vitest run` : 236 fichiers, 2 836 tests verts ; `npx vite build` propre ; `tests/e2e/game.mjs` : bureau 68
vérifications, téléphone 7, zéro échec, zéro erreur console ; nouveau `tests/e2e/assemblage2.mjs` (manette et carte
tactique, ordre du chef de groupe, fourgon pris au conducteur IA et conduit, vue subjective lanceur / bouclier, pieds
sur le trottoir, nuit place de la République, HUD à 640×360 / 700×900 / 960×540, pause en portrait) : 32
vérifications, zéro échec (dans le navigateur, le groupe parti à 25–36 m du point ordonné y est en ligne 90 s après
l'ordre) ; `boot.mjs`, `game-dist.mjs`, `ui.mjs --only=parcours` (56 vérifications) verts. `boot.mjs` a été adapté :
un téléphone lancé en portrait trouve désormais la session EN PAUSE (c'était « playing »).

**Restant**
- *Monuments* : un monument détaillé est toujours construit en UNE image (jusqu'à 1,6 s mesuré par la recette en
  arrivant par téléportation) et libéré dès qu'on s'en éloigne — le module `world/monuments` est sur la liste « en
  cours », non modifié. À faire dans le module : construire à l'approche (≈ 450 m d'avance) et garder en réserve.
- *Stationnement* (`sim/police/units.ts`, non modifié) : `spawnVehicle` réessaie toujours le même emplacement ; si le
  premier est pris, TOUS les véhicules suivants de l'unité manquent. Contourné par le choix de l'emplacement
  (`parkingRoom` compte les places libres consécutives) ; à corriger dans le module (curseur qui avance).
- *Rendu de `render/vehicles` et `render/props`* : ne lisent pas `liftAt` (roues et mobilier 8 cm sous le trottoir
  dessiné). Feux tricolores dessinés non synchronisés avec la circulation.
- *Chef de groupe laissé sur place* : dans une compagnie menée par l'IA, le groupe du joueur part à son poste dès
  l'ordre du chef de section, sans attendre son chef ; rien à l'écran ne dit encore au joueur de le suivre (le
  service `police.slot` donne pourtant sa place : à afficher au HUD).
- *Sous-titres radio* : deux bandeaux au milieu de l'image dans une petite fenêtre et sur téléphone (ils couvrent le
  bord de la mini-carte à 844×390 et le compteur du véhicule à 960×540).
- *PNJ et arbres* : les troncs arrêtent tout le monde ; un scénario émergent des radicaux a changé de déroulé (graine
  du test `crowd-radical.casse` passée de 9 à 18, statistiques dans le test).
- *Textures jamais libérées* en changeant de quartier (cache borné : 57 → 137) ; *rendu flou sur téléphone* en
  qualité basse (échelle 70 %) ; *voiture qui heurte un piéton* (vu une fois) ; *menus lus une fois par image*
  (frappes perdues sous 1 image/s) : non traités.
- Toujours ouverts depuis l'assemblage 1 : cadre de mission (objectifs, fin automatique), choix du poste du
  commandant (terrain / salle), indicatif « AUTORITÉ » contre « MISTRAL », sous-titres radio en double, charge de
  triangles en qualité basse (1 million avec la compagnie), son et vrai processeur graphique non vérifiés.

## Radio et missions (relectures du 16/11)
- **Sous-titres en double** : l'interface (`src/ui/core/system.ts`) sous-titre `radio:message` ET le module radio appelle
  `ctx.ui.subtitle`. Ne garder qu'un des deux (proposition : le module radio ; retirer l'abonnement côté interface).
- **Phraséologie en double** : `sim/police/radio.ts`, `ui/command/phrases.ts` et `gameplay/law` composent encore leurs
  propres messages ; les faire converger vers le service `radio.phrases`. Indicatif du commandant = « MISTRAL » (pas
  « MISTRAL 0 », pas « AUTORITÉ »). Comptes rendus d'unité vers la salle : canal « commandement ».
- Pompiers : indicatif « SAPEUR 1 » dans le module radio, « SANTÉ 1 » dans le catalogue et la bible — choisir.
- Un message urgent ne coupe pas un message d'ambiance en cours (attente ≤ 16 s).
- **Catalogue de missions** (129 missions, 619 phases) : le cadre de mission à écrire doit (1) prévoir une issue quand
  l'objectif qui clôt une phase n'est jamais atteint ; (2) savoir constater « tenu N secondes » et « N personnes
  dégagées » pour le type `proteger_les_siens` ; (3) faire respecter la durée de 3 minutes des ateliers de l'école ;
  (4) dire lequel des deux effectifs il affiche (effectif narratif du briefing ou `crowd.size` simulé).
- Lacunes de contenu : aucune mission au poste « lbd » ; chapitre 4 de la carrière à 2 missions ; pas de rôle « chef de
  section » dans le contrat (cg-11, cg-12 utilisent `chef_groupe`).
- **Bilan de l'option 1 (modèle léger)** : les deux livrables avaient un compte rendu inexact et ont demandé une
  relecture lourde (radio : corrigée ; missions : déroulé refait sur le modèle haut de gamme). À réserver désormais aux
  tâches purement mécaniques.

## Mémoire (constat du 16/11, pendant l'assemblage)
- Un Chromium de test faisant tourner le vrai jeu a été tué par le noyau à ~6 Go de mémoire (un autre tournait à 3,5 Go).
  **Cause établie par la recette : la capture de la souris sous Chromium headless, pas le jeu** (voir « Souris
  capturée » plus haut) ; sans capture, le jeu tient entre 370 et 600 Mo de rendu et 58 à 68 Mo de tas JavaScript sur
  7 minutes. Reste utile de toute façon : mesurer
  `renderer.info.memory` (textures, géométries) et le tas JS en jeu, par qualité ; suspects : textures de sol par tuile,
  atlas des immeubles, nombre de tuiles détaillées chargées, cibles de rendu des ombres. Objectif : ≤ 1 Go en qualité
  « bas » (téléphone), ≤ 2,5 Go en « haut ».
- Ne pas lancer plusieurs tests e2e du vrai jeu en parallèle sur cette machine (limite commune de 15 Go).
- **Durée de `tests/e2e/game.mjs`** : 15 à 25 minutes sur la machine d'essai chargée (une image coûte de 0,4 à plusieurs
  secondes en WebGL logiciel) — au-delà du délai par défaut de `run-all.mjs` (900 s) : le lancer seul, ou avec
  `--timeout=2700`, ou en deux fois (`--only=bureau`, `--only=telephone`). (La page tuée pendant les mesures de
  l'assemblage 1 venait de la capture de la souris, pas de l'absence de `gl.finish()`.)
- **Réglages de scénario** : la foule lit elle-même `options.metro`, la circulation `options.circulation` ; la mise en
  place de session les applique aussi par les services (appels sans effet double : stations déjà fermées ignorées,
  `closeArea` idempotent d'après le module de circulation). À ne garder qu'à un endroit quand le cadre de mission existera.
- **Erreurs de types hors périmètre** en fin d'assemblage : seulement dans des tests de modules non branchés, en cours
  d'écriture (`tests/unit/rescue.*`, par moments `tests/unit/incidents.*`).


## Pré-assemblage headless du 16/11 (tests/unit/pre-assemblage.manif.test.ts)
- Les 15 modules de simulation tournent ENSEMBLE sous Node (monde d'essai, 212 manifestants, compagnie de 83 CRS commandée
  par l'IA, incidents, secours, circulation) : 10 minutes simulées, aucune erreur, aucun système désactivé, 1,9 ms par pas.
- **Équilibrage à revoir** : avec tension 0,35 et propension à dégénérer 0,8, la manifestation est restée calme (7 radicaux
  sur 212, tension retombée à 0,14, aucune violence, phases depart → cortege → dispersion → apres_manif sans « tension »
  ni « affrontement »). La « chaleur » des radicaux = tension × volatilité (0,28) n'atteint pas le seuil d'affrontement
  (0,4). Attendu par le commanditaire : une propension élevée doit faire dégénérer la majorité des parties (le directeur
  doit faire MONTER la tension selon la volatilité, et la part de radicaux doit suivre `radicalShare` / la composition).
- `game.perf` ne remonte pas de temps moyen par système en headless (0,00 partout) : à vérifier.

## Équilibrage de la violence (16/11, après-midi) — CORRIGÉ
- Le directeur de foule applique une **pression de la propension à dégénérer** : après le départ du cortège, la tension de
  fond monte vers `tension0 + 0,6 × volatilité × montée(300 s) − apaisement` (`src/sim/crowd/tuning.ts`, PRESSURE_*).
  Les baisses de tension (bonne gestion) s'accumulent en « apaisement » et retranchent à la cible. `extra['crowd.noPressure']`
  la désactive (missions scriptées, essais).
- Le module des archétypes impose un plancher de radicaux (12 % × vol^1,5) et de suiveurs (8 % × vol), pris aux pacifiques.
- L'état « tension » ne masque plus l'annonce de dispersion (seul « affrontement » le fait).
- Mesuré (`tests/unit/pre-assemblage.manif.test.ts`, quartier d'essai, 200 manifestants, compagnie IA) : volatilité 0,8 →
  tension 1, 14 radicaux, 12 salves, grenades renvoyées, 6 véhicules et une barricade incendiés, 3 sommations par le
  commandant IA ; volatilité 0,05 → tension 0,08, aucune violence.
- Reste : aucune vitrine attaquée ni pillage dans ce scénario (commerces du quartier d'essai hors parcours) — à vérifier
  sur Paris.

## Chef de groupe joué dans une compagnie IA (16/11) — CORRIGÉ
- Une unité dont le joueur est le chef (et dont l'échelon supérieur n'est pas aussi commandé par lui) manœuvre seule :
  `playerDetached()` dans `src/sim/police/tree.ts` ; elle n'est plus absorbée par l'ordre de sa section, et le commandant
  IA ne lui attribue plus de poste (`command.ts`, buildElements). À la mise en place, elle reçoit l'ordre « suivre » le
  joueur (`gameplay/session/setup.ts`).
- Mesuré (`integration.forces.test.ts`) : après 60 s de déploiement de la compagnie, équipiers à 1-2 m du joueur ; ordre
  « avancer » de 25 m exécuté en moins de 30 s (équipiers à moins de 3,1 m du point).

## Gel près des monuments (16/11) — ATTÉNUÉ
- Le modèle détaillé est construit d'avance, caché, dès 1,7 × la distance de détail (la silhouette reste affichée), et
  n'est libéré qu'au-delà de 2,4 × (`src/world/monuments/system.ts`, PREBUILD / RELEASE). L'à-coup de construction a lieu
  loin du monument et une seule fois par passage ; il n'est pas supprimé (construction synchrone). Non mesuré dans le
  navigateur après correction.

## Cadre de mission (16/11) — LIVRÉ
- `src/gameplay/missions/` : service 'missions' (catalogue pour l'accueil, mission en cours, compte rendu `result`),
  branché dans `src/main.ts` ; `?autostart=paris&mission=<id>` lance une mission depuis l'URL.
- `config.ts` : fiche → SessionConfig (lieu et parcours résolus sur la carte, familles ramenées à celles du module de
  foule, cause, moyens engagés, vent).
- `objectives.ts` : chaque ObjectiveKind est mesuré sur l'état du jeu ; « à préserver » jugés à la fin ; les 163 objectifs
  « personnalise » ne sont pas mesurables et sont jugés sur l'issue de la mission (le compte rendu le dit).
- `system.ts` : phases (bandeau + radio), déclencheurs temps / phase de foule / tension / objectif avec levée au bout de
  300 s, échecs (hors combat, bavure, blessés, interpellé, site envahi, victime non secourue, temps), fin, note A-E.
- Vérifié : `tests/unit/missions.engine.test.ts` (crs-01 joué 12 min sur Paris : 5 phases, compte rendu, écran
  `debrief`) ; `tests/e2e/mission.mjs` dans le navigateur (bandeau, objectifs au HUD, zéro erreur console).
- Limites : « ligne enfoncée » et conditions d'échec personnalisées non mesurées ; « publier » compté comme une prise de
  vue (pas de module médias) ; aléas imposés par les phases (`events`) ignorés ; pas encore de carrière (déblocages).

## Allègement téléphone (qualité « bas », 16/11) — EN PARTIE
- Mesure (`tests/e2e/perf-bas.mjs`, place de la Concorde, coin de 4 tuiles détaillées, foule de 150) :
  650 000 → 495 000 triangles ; temps JS par image ≈ 9 → 6 ms ; 75 appels de dessin.
- Changements : houppier 20 faces et tronc 4 pans en « bas » ; le houppier « allégé » des tuiles très arborées n'est
  plus plus fin que le normal (il valait 80 faces même en « bas » : principal poste, 390 000 → 100 000) ; zone détaillée
  110 m ; grille de surfaces 2 m ; mobilier détaillé jusqu'à 40 / 110 m.
- Reste le sol en facettes (~200 000 sur 4 tuiles : trottoirs découpés selon le réseau de 8 m) et les façades. Pistes :
  facettes de 16 m en « bas » (TIN_CELL est global : à rendre dépendant de la qualité), découpe simplifiée des trottoirs.
  Jamais mesuré sur un vrai téléphone.

## Poste du commandant (16/11) — LIVRÉ
- Page d'accueil : variantes du rôle Commandant « Sur le terrain » / « Salle de commandement » (`extra.variante`).
- Terrain : `commanderOffPost()` (`src/ui/maps/visibility.ts`) — à pied loin du véhicule de commandement (ou poste
  perdu), la carte ne montre la foule et les dangers qu'à 220 m (comptes rendus) ; au véhicule, tout. Libellé de
  l'étendue de commandement à jour. Les sommations exigent déjà la portée du mégaphone (module du droit).
- Salle : le commandant est installé dans le véhicule de commandement, vue tactique conservée (`sim/people/player.ts`) ;
  l'officier IA le plus gradé reçoit l'écharpe, le mégaphone et la fusée ; le bouton « Sommation suivante » le fait
  sommer sur ordre (`police.command.requestSommation`, qui ne s'interrompt plus sur une foule présente).
- Vérifié : `tests/unit/integration.poste.test.ts`. Non vu dans le navigateur.
