# Bilan de livraison — CRS Simulation France

Ce document liste ce qui a été corrigé et ajouté depuis la version précédente de l'application Mac, ce qui reste
imparfait, et où trouver les propositions d'améliorations.

## Bugs corrigés

### Décor
- Lampadaires, potelets, abribus et stations de vélos posés **sur la chaussée** : replacés au bord de la voie.
- **Murs des quais de Seine** en travers ou au milieu de la route (voie Georges-Pompidou, ports) : ramenés au bord de la chaussée, ouverts là où une voie les traverse.
- Grilles, garde-corps et murets qui coupaient une rue : ouverts dans l'emprise de la rue. Arbres plantés dans la rue : décalés au bord.

### Colonnes et véhicules
- La compagnie pouvait commencer **sans ses fourgons** quand elle était postée dos à un bâtiment (caserne de la Cité) : le stationnement cherche maintenant plus loin, puis sur la chaussée la plus proche.
- **Trocadéro** : pour contourner la foule, l'itinéraire sortait de la carte ; la tête de colonne butait contre le bord, faisait demi-tour et deux fourgons restaient nez à nez. Plus aucun itinéraire, à pied ou en véhicule, ne sort de la carte.
- Sortie de caserne : départ dans le bon sens (tour du pâté de maisons plutôt qu'un demi-tour impossible), mise en file sur des places réellement libres, véhicules sans conducteur rangés hors de la file.
- Journée BRAV-M : personne ne quittait la base ; les motards partent maintenant de leur commissariat derrière leur chef, les retardataires rejoignent seuls.
- Le camion sono s'arrêtait sans cesse dans le cortège ; un agent coincé derrière une grille n'embarquait jamais ; l'escorte à pied d'un blindé ne suivait pas la colonne.
- Voitures civiles qui **apparaissaient sous les yeux** du joueur au bout d'une avenue ; conducteur d'une voiture retirée qui restait planté sur la chaussée.

### Objectifs et ordres
- Arrivé à **0 m** d'un objectif, il ne se validait pas tout de suite (contrôle toutes les 4 s seulement, et jamais pour le télépilote posé sur le point) : l'arrivée est mesurée à chaque instant, sur la même distance que celle affichée.
- Après « en place », il n'y avait plus d'objectif : il y a maintenant toujours un objectif en cours (« En place — stand-by, en attente des ordres », avec quoi faire en attendant), puis un nouvel ordre quand la foule bouge.
- Le « gros de la foule » était la moyenne de tous les manifestants : avec deux cortèges éloignés, l'ordre tombait dans un quartier vide.
- Un point d'ordre pouvait tomber dans un bâtiment ou dans l'eau : il est ramené au sol libre le plus proche.
- Pilote de Centaure ou de canon à eau : aucune zone de tir n'était désignée. Le commandement désigne maintenant la zone (distance, côté, rayon) ; hors cadre légal la carte dit « Tir non autorisé : attendez les sommations ».

### Ravitaillement
- Le joueur ne pouvait pas se ravitailler du tout (voir « Nouveautés »).
- Les agents allaient se ravitailler à un fourgon **en feu** ou qui roulait ; un extincteur plein sortait d'une réserve presque vide.
- La soute du Centaure ne pouvait jamais être réapprovisionnée ; le plein du canon à eau ne se lançait pas pour un engin conduit par le joueur.
- Le joueur n'est pas alerté pour un équipement qu'il n'a jamais perçu (un télépilote n'a pas d'aérosol à « épuiser »).

### Commandes et interface
- Flèches ↑ / ↓ pour avancer et reculer, ← / → pour diriger le véhicule au volant ; touches O (drone) et P (adjoint) réservées.
- Petite foulée choisie : l'allure reste au trot ; la pause n'est plus sur P (Échap seulement).
- Repères du drone visibles à travers les toits : éteints par défaut, et seulement sur les personnes réellement visibles.

### Divers (prouvés chacun par un test)
- État qui fuyait d'une partie à la suivante ; garde à vue du joueur civil ; chef hors de combat ; patrouille dont l'équipage est hors service ; télépilote joueur ; annonces « à toutes les unités » ; secours appelés accrochés au bon incident.

## Nouveautés

- **Départ de la base** (caserne ou commissariat choisi selon le lieu), trajet en colonne, la mission commence à l'arrivée ; on peut monter dans n'importe quel véhicule.
- **BRAV-M à moto** ; le commandant BRAV-M conduit, ses motards suivent, la compagnie part de son côté et tout le monde se retrouve sur place.
- Ordre **« Avec moi »** : les unités désignées rejoignent la colonne du commandant.
- **Plusieurs manifestations à la fois** (jusqu'à 4), cortèges qui se détournent devant les rues fermées et convergent, **nasse** puis évacuation filtrée.
- **Patrouilles de police** dans Paris (comptes rendus radio), toutes les unités sur la carte tactique.
- **Retour vidéo du drone** (touche O), touche **P** pour accepter la proposition de l'adjoint.
- Carte **« Ma mission »** : un ordre clair à la fois, le chef à suivre ; radio propre à chaque métier.
- Pompiers et SAMU : l'IA conduit, le joueur est passager.
- Circulation : les voitures se rangent devant les deux tons, piétons, cyclistes.
- **Ravitaillement du joueur** : touche d'interaction à l'arrière du fourgon ; réserve vide → « Demande de ravitaillement » par radio, la logistique complète les fourgons et la soute du Centaure quelques minutes plus tard ; indications à l'écran avec repère ; plein du canon à eau à la bouche d'incendie.
- Allures : avance tenue = petite foulée puis course ; CRS au pas, au trot ou en courant selon l'urgence.

## Limites connues

- **Colonnes** : sur le banc de mesure (6 bases × 10 lieux), il reste des trajets où la colonne n'arrive pas complète dans le délai, surtout vers Châtelet (colonne retenue par la foule à 150–250 m du point). Le filet de sécurité replace alors les véhicules, hors de la vue du joueur.
- Une colonne qui doit faire demi-tour dans une rue étroite peut encore se gêner elle-même.
- Concorde : le point de départ de certains véhicules est en dehors du réseau de rues.
- La demande de ravitaillement en cours n'est pas sauvegardée d'une partie à l'autre.
- Groupes radicaux : quand le cortège s'est détourné devant un barrage, un de leurs points de fuite peut se trouver de l'autre côté de ce barrage.
- Les couloirs de bus ne sont pas traités à part ; la forme de Paris (tunnels, largeurs de voies) reste à reprendre.

## Propositions d'améliorations

Voir `docs/propositions-ameliorations.md` : quatorze propositions classées (réalisme, confort de jeu, contenu), plus
trois notées en cours de route. Les trois à faire en premier : carte tactique entièrement au clavier, jouer sans
souris (visée, lancer, bouclier), équipe de liaison au contact du cortège.
