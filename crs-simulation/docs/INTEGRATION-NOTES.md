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
`input`, `env`, `world/query`, `sim/roles` (archétypes), `sim/people`, `sim/vehicles`, `sim/items`, `sim/props`,
`sim/hazards`, `gameplay/law`, `gameplay/radio`, `gameplay/session` (nouveau), puis la présentation : `render/base`
(en premier : à ordre égal les systèmes s'exécutent dans l'ordre d'ajout), `world/view`, l'adaptateur `main.map2d`,
`world/monuments`, `render/people`, `render/vehicles`, `ui` (qui agrège `ui/maps` et `ui/command`), `audio`.
`render/vehicles` figurait parmi les modules « en cours » : il compilait, ses 68 tests passaient et aucun de ses
fichiers n'avait changé depuis plus de 20 minutes au moment du branchement.

### Laissés de côté (encore modifiés pendant l'assemblage — à brancher à l'assemblage 2)
- `sim/crowd`, `sim/police`, `sim/traffic` : fichiers modifiés dans les dernières minutes (et, à 03 h 53, `tsc` signalait
  `src/sim/police/command/command.ts` : module './adjoint' introuvable). Conséquences : pas de foule, collègues immobiles,
  pas de circulation ; les services `crowd.metro`, `traffic.control`, `police.units` sont absents.
- `render/props`, `render/fx` : en cours d'écriture. Conséquences : mobilier, vitrines, barricades, projectiles, gaz,
  fumée et feu sont SIMULÉS mais INVISIBLES (on bute sur des poubelles que l'on ne voit pas).
- `gameplay/missions/catalog` : données seules (pas de système), en cours de relecture. `gameplay/incidents`,
  `sim/roles/rescue`, `sim/roles/medics` : dossiers absents à ce jour.
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
marche et course, collision avec la grille de l'obélisque, grenade lacrymogène en main puis lancée (projectile, gaz,
faute relevée par le droit : emploi sans sommation), plan de Paris orienté nord en haut, carte tactique avec l'unité,
pause, paramètres, commandes tactiles sur téléphone. Zéro erreur console.

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
  comme un déplacement (le regard saute). Artefact d'outillage : `tests/e2e/game.mjs` clique en (2, 2).
- **Premier clic** : le déverrouillage du son (premier geste) coûte quelques secondes d'images très lentes sous WebGL
  logiciel et machine chargée ; non mesurable sur du vrai matériel ici.
- Mur aveugle à texture étirée (`buildings-haut-street-15.png`) : pas retrouvé place de la Concorde ; non recherché
  ailleurs.
- Indicatif radio « AUTORITÉ » du droit contre « MISTRAL 0 » de la radio, sous-titres radio possibles en double
  (`ui` et `gameplay/radio` appellent tous deux `ui.subtitle`) : non traités, à voir avec l'IA des unités.

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
