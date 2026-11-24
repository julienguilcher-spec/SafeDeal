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

### Après les premiers essais du joueur
- **Véhicule qui bloque** : un autobus arrêté devant un véhicule de police dont le deux-tons sonne ne bougeait jamais ; une colonne avec le joueur à bord restait derrière un véhicule civil arrêté. Les deux sont corrigés (voir « Nouveautés » pour les moyens de dégager).
- **Drone** : l'image était floue sur un écran Retina (calculée à ×1,5 puis étirée) ; le drone tournait à côté de la foule et montrait surtout des toits ; la nacelle visait le vide entre deux groupes ; un drone abattu n'était jamais relevé.
- **Unités qui n'obéissent pas** : une section qui suit le joueur restait 45 à 75 m derrière (allure bridée) ; des agents envoyés derrière les barrières d'une rue fermée ne les franchissaient pas ; une unité annonçait « en place » alors que personne n'était à son poste.
- **Sortie filtrée d'une nasse** : les auteurs de jets retenus à la porte n'étaient presque jamais interpellés.
- **Clavier** : une touche tapée dans la roue d'ordres agissait encore dans le jeu après sa fermeture (un chiffre changeait l'objet en main) ; la carte tactique ne répondait pas aux flèches.
- **Téléphone** : textes radio trop gros et empilés ; le menu de pause débordait de l'écran en paysage ; les raccourcis recouvraient la mini-carte.

- **Rue tenue par une unité** : on passait entre les agents et le long des murs ; « Avancer » sur une rue finissait en colonne ; « Encercler » laissait ouverts les côtés sans rue (esplanade) ; une interpellation ou un secours sortait des agents du premier rang et ouvrait des trous de 2 à 3 m dans la ligne.
- **Circulation** : des voitures restaient dans une rue fermée et roulaient vers le barrage ; la circulation continuait d'apparaître à l'intérieur d'un périmètre fermé.
- **Évacuation filtrée** : une interpellation faite dans la file d'attente, avant le contrôle, n'était pas comptée.

### Trouvés par la vérification complète dans le navigateur (dernière passe)
- **Vue qui ne suit plus le pavé tactile** : après plusieurs écrans ouverts et refermés coup sur coup (carte, roue d'ordres, pause), le navigateur refusait un instant la capture du pointeur ; le jeu prenait ce refus pour définitif, affichait « La souris ne peut pas être capturée ici » et ne tournait plus la vue qu'en glissant, bouton tenu. Le refus passager est maintenant attendu (deux secondes), sans message, et la capture revient seule.
- Ce même message pouvait s'afficher à tort au premier clic alors que la capture réussissait.
- **Carte tactique, tracé** : appuyer, hésiter une demi-seconde puis glisser ne traçait rien (ligne de barrage, zone) ; le tracé part maintenant quel que soit le temps d'appui.
- **Carte tactique, lisibilité** : les flèches d'issues ouvertes couvraient la carte autour de chaque foule (26 flèches et autant d'étiquettes « passage piéton » place de la Concorde) — elles n'apparaissent plus qu'autour de la foule visée ou d'un encerclement commencé, avec une étiquette par rue ; sur une carte étroite, la consigne d'un ordre devenait une colonne d'un mot par ligne ; la légende des touches passait sous les messages radio.
- **Petite fenêtre et téléphone** : le bouton « Carte tactique » recouvrait le bas de la mini-carte ; sur téléphone, le volet des unités refermé de la carte tactique restait atteignable au clavier.

## Nouveautés

- **Rue barrée** : une unité envoyée sur une rue la barre d'un mur à l'autre ; plus personne ne passe, dans aucun sens (sauf police, secours et joueur). Option « Passants : bloqués / laissés passer » (touche B sur la carte tactique). Unité trop petite : compte rendu « largeur insuffisante » et renfort proposé.
- **Nasse automatique** : détectée quand toutes les issues autour d'une foule sont tenues (« Nasse fermée, environ N personnes ») ; carte tactique avec barrages, issues ouvertes, bandeau, aide « Fermer la nasse », issue filtrée (F).
- **Rue fermée vidée** : les voitures civiles restées au-delà de la barrière sont retirées (hors de la vue du joueur, ou après un demi-tour).

- **Dégager un véhicule** : deux-tons, « Faire circuler ce véhicule » à pied, ordre « Dégager l'obstacle (Centaure) » (proposé par l'adjoint, ou demandé par radio).
- **Ordres « Me suivre à pied » et « Me suivre en colonne (véhicules) »**, à la place de « Avec moi » ; la formation à pied « Colonne » s'appelle « En file (à pied) ».
- **Drone** : fenêtre en trois tailles (Maj + O), zoom optique (Alt + O), drone placé au-dessus de la foule.
- **Ordres au clavier** : roue d'ordres aux chiffres ou aux flèches, carte tactique au curseur clavier.

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

## Versions 13 à 21 de l'artefact (17 et 18 novembre)

Le jeu est livré sous forme d'artefact jouable dans le navigateur (ordinateur et téléphone). L'application Mac n'est
plus reconstruite pour l'instant, à la demande du joueur.

### Nouveautés
- **Accueil en quatre modes** : Patrouille (équipage BAC ou Police secours en voiture, appels de CENTRAL, manifestations
  qui se déclarent au hasard), Carrière, Missions spéciales par poste, Mode libre (nom de la manifestation, lieu,
  colonnes, part de hasard).
- **Carte de commandement refaite** (version 18) : six intentions avec leur touche — Envoyer (E), Bloquer une rue (B),
  Encercler (N), Disperser (D), Interpeller (I), Secours (S) — et « Plus… » (O) ; une seule fiche d'ordre de six lignes
  au plus, qui propose l'action et l'unité, dessine l'ordre sur la carte et dit ce qui va se passer ; « Donner
  l'ordre » avec Entrée, autre unité (U), toute la compagnie (T), annulation dans les 5 s (X). Sur le terrain, bloc
  « ORDRES » en quatre lignes ; l'exécutant voit « ORDRE DU COMMANDANT ».
- **Carte lisible** (version 19) : unités au même endroit regroupées sous une étiquette, étiquettes qui ne se recouvrent
  plus ; la radio et l'unité disent le lieu écrit sur la fiche ; « Mes unités » dit quand une colonne attend le joueur.

### Bugs corrigés
- **Tout le monde me suit** : véhicules garés en bloc qui ne sortaient pas (Bastille, République, commissariats du 1er
  et du 8e), suiveurs arrêtés par des manifestants ou par des barrières, motos de la BRAV-M sans pilote ou qui ne
  suivaient pas, fourgon d'escorte enfermé, tête de colonne qui faisait demi-tour contre ses propres fourgons, blessé
  allongé jamais contourné. Le test strict (42 cas : chaque poste, trois lieux) passe en entier.
- **Colonne et mission du joueur** : la colonne attend le joueur quand il est au volant ; une mission ne commence qu'à
  l'arrivée ; l'atelier de l'élève se gagne en suivant la carte « Ma mission » ; le délai de départ affiché est vrai.
- **Commandant en mission** (version 21, après un essai du joueur) : mission perdue dès l'arrivée à cause des blessés
  du trajet ; ordre donné à l'arrivée écrasé par le « débarquez » de la colonne ; mission lancée avec la compagnie
  600 m derrière ; BRAV-M qui annonçait « en position » sans bouger ; colonne figée derrière son canon à eau à la
  Concorde ; réseau radio saturé par CENTRAL, comptes rendus perdus.
- **Fiche d'ordre fidèle au terrain** (trois tours d'un robot commandant) : BRAV-M à l'interpellation (groupe et non
  binôme, à pied ou à moto comme annoncé), nasse incomplète annoncée, interpellation sans fait constaté ou auteur en
  fuite dits avant et pendant, équipage de patrouille à qui on ne propose plus ligne, charge ou gaz.
- Téléphone : sous-titres radio qui recouvraient les boutons ; CRS bloqués devant des barrières Vauban ; missions
  lancées depuis l'accueil au mauvais poste ; nasse et évacuation ; textes divers.

## Version 22 (18 novembre) : commissariats

- **Commissariats dessinés dans Paris** : sept sites, cour et véhicules garés en colonnes ; le commandant engage et
  renvoie leurs unités depuis la carte de commandement ; les unités rentrent se garer elles-mêmes.
- Sirène deux-tons corrigée.

## Version 23 (24 novembre) : ordres directs, fourgons cellulaires

Après un essai du joueur en commandant, en mission : « je pouvais donner zéro ordre, ils ne suivaient pas, la BRAV-M
ne bougeait pas, j'interpelle des gens mais je ne sais pas où les mettre ».

### Nouveautés
- **Ordres directs sur le terrain** : regarder une rue, une personne, la foule ou un carrefour ; la ligne « Entrée … »
  dit l'ordre prêt et l'unité qui le recevra ; **Entrée** le donne. **Maj+Entrée** : l'autre ordre possible. **A** :
  « Avec moi », toutes les unités suivent. **U** : une autre unité. **⌫** : annuler et rendre les ordres précédents.
  **F** puis un chiffre : la roue des ordres. Sur téléphone : la pastille « Ordre prêt » (toucher = donner), « ⟳ À
  qui », appui long = la roue, toucher le décor pour désigner.
- **Accusé de réception en moins d'une seconde**, puis une ligne d'état par unité (« reçu », « descend des fourgons —
  prêt dans 3 s », « en route — 120 m », « rue barrée ✓ », ou le refus en une phrase avec la sortie : « U : une autre
  unité »). Une unité sous les ordres du joueur n'est plus jamais « sans ordre ».
- **Unités assises dans les fourgons** : elles descendent puis exécutent ; un ordre donné pendant que la colonne roule
  ou se gare est exécuté à l'arrêt.
- **BRAV-M dans la compagnie** : elle suit le véhicule du joueur en selle, obéit aux ordres directs, revient « avec
  vous » après une interpellation. Nouveau poste « Chef de la BRAV-M ».
- **Interpellés** : au moins deux **fourgons cellulaires** avec équipage accompagnent la compagnie ; après la
  palpation, la ligne d'aide dit où emmener l'interpellé (« E : le confier à MISTRAL 2 ALFA (10 m) », ou « Faire venir
  le fourgon cellulaire 1 ») ; le fourgon plein part au commissariat (deux-tons s'il est retenu), un second prend la
  relève ; le compte rendu de fin donne les mêmes chiffres que le terrain.
- **Grande compagnie** : la mission attend que la queue de colonne soit arrivée (120 s au plus) ; une colonne à moins
  de 300 m du point qui n'a plus qu'un long détour s'arrête, débarque et finit à pied, en le disant à la radio.

### Bugs corrigés
- Commandant en mission, arrivée en colonne : l'ordre de barrer une rue était accusé puis deux groupes sur trois
  restaient collés contre leurs fourgons garés pare-chocs contre pare-chocs.
- « Suivez-moi » suivi 19 s plus tard d'un ancien ordre redonné tout seul à une section.
- Abribus ou long mobilier au bord du trottoir pris pour un barrage : la tête de colonne faisait demi-tour entre les
  façades et restait à 390 m du lieu pendant que la compagnie arrivait sans le commandant.
- Second Centaure qui perdait le premier au départ ; moto de la BRAV-M qui faisait le tour du pâté de maisons à
  l'entrée d'un sens unique ; BRAV-M du joueur garée derrière la file de la compagnie.
- Monter en véhicule en escortant un interpellé ; nasse à sortie filtrée (fourgon arrêté à 160 m de la porte) ;
  binôme de la BRAV-M qui suivait un fuyard sans jamais l'interpeller ; fourgon cellulaire appelé déclaré « coincé »
  au bout de 12 s alors qu'il sortait de sa file.
- Textes : « barré / barrée » selon la voie ; « en selle », « remontent sur les motos » pour la BRAV-M ; distance de
  l'unité (et non du joueur) sur la ligne d'ordre.

### Mesures
- Suite de tests : 4 198 verts, 0 rouge (117 joués sur demande).
- Robot « commandant en mission, arrivée en passager », quinze missions : 10 sans défaut (version 22 : 4).

## Limites connues

- **Version 23, ordres directs** (relevés par le robot de recette, non corrigés) :
  - la **BRAV-M appelée vers le joueur** (« Y aller » vers moi, « Suivez-moi ») reste parfois à 100–160 m (missions 4
    et 8) ; le **chef de la BRAV-M** qui envoie son unité à plus de 300 m est accusé mais les motos ne partent qu'au
    bout de 30 s et n'arrivent pas (itinéraire moto de 900 m pour 320 m à vol d'oiseau à la Concorde) ; son « Avec
    moi » passe 5 s par « débarquer » ;
  - **journée de service** (République) : à la première intervention, la section désignée peut être à plus de 200 m
    et annoncer « la foule barre la route » ; ⌫ ne rend pas toujours le barrage ; le fourgon cellulaire peut être à
    plus de 250 m de l'interpellation ;
  - **fourgon cellulaire** : à bord en 87 s dans la première mission, 125 s dans la quatrième (objectif 120 s) quand
    le rendez-vous tombe sur une rue voisine à sens unique ; un fourgon envoyé au commissariat peut rester un moment
    derrière un fourgon de la compagnie en travers ;
  - missions « Minuit sur le parvis » (colonne arrêtée court, étalée sur 400 m de quai) et « Une heure du matin »
    (section envoyée sur le quai bas qui revient au trot) : « Suivez-moi » ne ramène pas la moitié des groupes en une
    minute ; des agents restent coincés entre leurs propres fourgons garés ;
  - une moto de police derrière des voitures en file peut y rester plusieurs minutes ; les véhicules à l'arrêt
    roulent seuls dans la pente de la Concorde ;
  - affichage : à 1280×800 la ligne d'ordre est coupée par un nom de lieu très long ; sur téléphone un bandeau
    d'alerte peut recouvrir le bouton « Oui » de l'adjoint ;
  - les postes chef de section, chef de groupe et le mode patrouille n'ont pas été rejoués de bout en bout par le
    robot de recette (leurs tests unitaires sont verts).
- **Colonnes** : sur le banc de mesure (6 bases × 10 lieux), il reste des trajets où la colonne n'arrive pas complète dans le délai, surtout vers Châtelet (colonne retenue par la foule à 150–250 m du point). Le filet de sécurité replace alors les véhicules, hors de la vue du joueur.
- Une colonne qui doit faire demi-tour dans une rue étroite peut encore se gêner elle-même.
- Concorde : le point de départ de certains véhicules est en dehors du réseau de rues.
- La demande de ravitaillement en cours n'est pas sauvegardée d'une partie à l'autre.
- Groupes radicaux : quand le cortège s'est détourné devant un barrage, un de leurs points de fuite peut se trouver de l'autre côté de ce barrage.
- Barrage : l'unité ne gare pas ses véhicules en travers pour compléter une ligne trop courte ; la relève d'un barrage par une autre unité rouvre la rue (la ligne tient, mais la rue n'est plus fermée à la circulation et l'option « passants » est perdue).
- Barrage avec passants admis : deux passants qui se croisent dans le même intervalle peuvent se gêner.
- Certains tests de trajet donnent un résultat différent selon la charge de la machine (chargement de la carte) ; à rendre déterministe.
- Les couloirs de bus ne sont pas traités à part ; la forme de Paris (tunnels, largeurs de voies) reste à reprendre.
- Vérification : deux scénarios de la première génération (manette et téléphone, `verif-tpm-manette`, `verif-tpm-tel`) relèvent encore des écarts qui tiennent à leurs attentes d'origine (poste choisi autrement, départ de la base, volets refermés) ; leurs versions suivantes (`…-manette2`, `…-tel2`, `verif-fin-tel`) passent.
- Tenir la touche d'avance fait courir jusqu'à l'essoufflement (voulu) : le souffle tombe en une vingtaine de secondes, puis l'allure redescend d'elle-même à la petite foulée, puis au pas.

## Propositions d'améliorations

Voir `docs/propositions-ameliorations.md` : quatorze propositions classées (réalisme, confort de jeu, contenu), plus
trois notées en cours de route. Les trois à faire en premier : carte tactique entièrement au clavier, jouer sans
souris (visée, lancer, bouclier), équipe de liaison au contact du cortège.
