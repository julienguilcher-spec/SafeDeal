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
