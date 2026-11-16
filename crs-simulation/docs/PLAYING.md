# Jouer à CRS Simulation France — mode d'emploi (assemblage 1)

Premier jeu jouable : la page d'accueil, le chargement du vrai Paris, un personnage incarné à hauteur d'homme
avec son unité, ses objets, le HUD, les cartes, la pause et les paramètres. Les foules, l'IA des unités, la
circulation, le mobilier visible et les effets (gaz, feu) arrivent avec les modules suivants — voir la fin.

## Lancer le jeu

Depuis `crs-simulation/` (les dépendances sont déjà installées) :

| But | Commande | Adresse |
|---|---|---|
| Développement | `npm run dev` | http://localhost:5173/ |
| Version construite | `npm run build` puis `npm run preview` | http://localhost:4173/ |
| Hébergement statique | `npm run build`, puis servir le dossier `dist/` tel quel | chemins relatifs : n'importe quel sous-dossier convient |

Un navigateur récent avec WebGL 2 suffit (ordinateur, tablette, téléphone en paysage). La partie se règle sur la
page d'accueil : rôle, grade et poste, lieu, heure et météo, puis **Lancer**. Pour lancer une grenade lacrymogène,
choisir le poste « Lanceur de grenades » (ou « Chef de groupe ») : le porte-bouclier n'en a pas.

## Commandes

Touches physiques (sur un clavier AZERTY, « W A S D » se lisent Z Q S D). Tout se réaffecte dans
Paramètres → Commandes.

| Action | Clavier / souris | Manette | Tactile |
|---|---|---|---|
| Se déplacer | Z Q S D | stick gauche | joystick virtuel à gauche |
| Regarder, viser | souris (cliquer dans la vue pour la capturer) ou flèches | stick droit | glisser à droite de l'écran |
| Courir | Maj gauche | clic du stick gauche | pousser le joystick à fond |
| S'accroupir / sauter, enjamber | C / Espace | B / A | boutons |
| Action principale (lancer, tirer, frapper) | clic gauche — maintenir pour doser un lancer, relâcher pour lancer | gâchette droite | bouton « Action » |
| Action secondaire (lever le bouclier, épauler) | clic droit | gâchette gauche | bouton « Viser » |
| Choisir un objet | 1 à 9, molette | LB / RB | barre d'objets |
| Interagir (monter, menotter, porter…) | E | X | bouton contextuel |
| Vue à la première / troisième personne | V | clic du stick droit | bouton |
| Masque à gaz / visière | G / H | croix bas / gauche | boutons |
| Radio / roue d'ordres | T / F | croix haut / droite | boutons |
| Plan de Paris / carte tactique | M / Tab | Select / bouton du HUD | boutons |
| Zoom | + / − | — | — |
| Pause | Échap ou P | Start | bouton |
| Avance rapide | . (point) | — | bouton |

En véhicule : avancer / reculer = accélérer / freiner, gauche / droite = volant, Espace = frein à main,
R = sirène, B = gyrophares, N = klaxon, V = vue intérieure / extérieure, E = descendre.

## Paramètres d'URL utiles

| Paramètre | Effet |
|---|---|
| `?autostart=paris` | lance une session sans passer par la page d'accueil (place de la Concorde par défaut) |
| `?autostart=test` ou `&map=test` | quartier d'essai au lieu de Paris |
| `&place=Place de la République` | lieu de départ (nom connu de la carte) ; ou `&x=…&z=…` |
| `&role=crs&rank=gardien&poste=lanceur` | rôle, grade, poste du joueur (`&variante=samu`, `radical`… pour les rôles civils) |
| `&camera=tps` | départ en vue à la troisième personne (défaut : première personne) |
| `&time=21.5&weather=pluie` | heure (0 à 24) et météo (clair, nuageux, couvert, pluie, averse, brouillard, orage) |
| `&quality=bas` | qualité graphique : bas, moyen, haut, ultra (enregistrée comme réglage) |
| `&passants=0` | nombre de passants autour du lieu (10 par défaut) |
| `&seed=42` | graine : même graine, même mise en place |
| `&nomenu=1` | pas de page d'accueil (tests) |
| `&debug=1` | journalisation bavarde |

Exemple : `http://localhost:5173/?autostart=paris&role=commandant&place=Place de la Bastille&time=18&quality=moyen`.
Console du navigateur : `__CRS.summary()`, `__CRS.step(secondes)`, `__CRS.teleport(x, z)`.

## Ce qui est jouable aujourd'hui

- **Page d'accueil** complète (souris, clavier, manette, doigt) : rôle, grade, poste, mode, lieu sur le plan, heure,
  météo, vent, scénarios enregistrés, « Surprends-moi », paramètres (graphismes, commandes, son, sauvegarde), crédits.
  Un seul chef : la tuile « Commissaire » a disparu, le **commandant** porte l'écharpe et prononce les sommations.
- **Chargement** du vrai Paris autour du lieu choisi (barre de progression réelle : dispositif, monuments, ville).
- **En jeu, tous les rôles** donnent un personnage en tenue avec sa dotation, placé face au lieu : CRS (six postes),
  chef de groupe ou de section, commandant (une section et son véhicule de commandement), BRAV-M, équipages du
  Centaure et du canon à eau, télépilote, street medic, pompier ou SAMU, journaliste, manifestant.
  Les collègues de l'unité sont en ligne (boucliers devant), les véhicules stationnés derrière, quelques passants autour.
- **Se déplacer** : marche, course, accroupi, saut ; collisions avec les immeubles, les grilles, les monuments, le
  mobilier, les véhicules ; endurance. **Vues** à la première et à la troisième personne.
- **Objets** : bouclier, bâton, gazeuse, grenades à main, lanceur de 56 mm, LBD, extincteur, menottes, mégaphone…
  Lancer dosé au clic maintenu ; la grenade lacrymogène roule, s'ouvre et diffuse un gaz qui dérive avec le vent et
  fait tousser ; l'emploi de la force est jugé et consigné (sommations, niveau licite et autorisé affichés au HUD).
- **Véhicules** : monter (E près d'une portière), conduire le fourgon, le véhicule de commandement, le Centaure, le
  canon à eau, les motos ; sirène, gyrophares, tourelles.
- **HUD** : heure et météo, boussole et secteur, état légal, unité, santé et souffle, barre d'objets, mini-carte,
  invites d'interaction, sous-titres radio. **Plan de Paris** (M) avec recherche et repère GPS, **carte tactique**
  (Tab), **pause**, **paramètres**, compte rendu de fin de session.
- **Son** : ambiance de la ville selon l'heure et la météo, pas selon le sol, objets, radio, voix de synthèse.

## Ce qui ne l'est pas encore

- **Pas de manifestation** : le module de foule n'est pas encore branché. Aucun manifestant n'est créé (pas de
  fausse foule) ; les réglages d'affluence, de cause, de tension et de durée de la page d'accueil sont enregistrés
  dans le scénario mais sans effet. Il n'y a ni objectifs ni fin de mission automatique (terminer par la pause).
- **Les collègues ne bougent pas** : l'IA des unités n'est pas branchée ; ordres, roue d'ordres et carte tactique
  s'ouvrent, mais aucune unité n'exécute. Les passants sont immobiles eux aussi.
- **Pas de circulation**, pas de fermeture de rues ni de stations de métro (services absents).
- **Mobilier urbain, vitrines, barricades : simulés mais invisibles** (rendu du décor en cours d'écriture) — on bute
  donc parfois sur une poubelle ou un potelet que l'on ne voit pas.
- **Gaz, fumée, feu, projectiles : simulés mais invisibles** (rendu des effets en cours d'écriture). La grenade part,
  le nuage existe (toux, voile d'écran, carte tactique), mais on ne voit ni le projectile ni la fumée.
- **Tour Eiffel et monuments lointains** : masqués par la brume au-delà de la distance d'affichage (300 m en qualité
  basse, 1 500 m en ultra).
- Carrière, missions du catalogue, incidents, secours sur appel, médias, campagne, école : modules non branchés.
