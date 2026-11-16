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
