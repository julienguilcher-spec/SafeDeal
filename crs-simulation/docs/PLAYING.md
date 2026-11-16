# Jouer à CRS Simulation France — mode d'emploi (assemblage 2)

Le jeu jouable : la page d'accueil, le chargement du vrai Paris, un personnage incarné dans sa compagnie, des unités
qui manœuvrent sur ordre (commandant IA, ou vous si vous commandez), une manifestation qui se rassemble, la circulation
autour, le mobilier urbain et les vitrines, les objets, le gaz lacrymogène, les incidents annoncés à la radio, le HUD,
les cartes, la pause et les paramètres. Le cadre de mission (objectifs, fin automatique) n'existe pas encore — voir la fin.

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
| Marcher / trottiner (bascule) | touche à gauche de X (« W » en AZERTY, « Z » en QWERTY) — on marche par défaut | inclinaison du stick | inclinaison du joystick |
| Sprinter | Maj gauche (tenir) | clic du stick gauche | pousser le joystick à fond |
| S'accroupir / sauter, enjamber | C / Espace | B / A | boutons |
| Action principale (lancer, tirer, frapper) | clic gauche — maintenir pour doser un lancer, relâcher pour lancer | gâchette droite | bouton « Action » |
| Action secondaire (lever le bouclier, épauler) | clic droit | gâchette gauche | bouton « Viser » |
| Choisir un objet | 1 à 9, molette | LB / RB | barre d'objets |
| Interagir (monter, menotter, porter…) | E | X | bouton contextuel |
| Vue à la première / troisième personne | V | clic du stick droit | bouton |
| Masque à gaz / visière | G / H | croix bas / gauche | boutons |
| Radio / roue d'ordres | T / F | croix haut / droite | boutons |
| Plan de Paris / carte tactique | M / Tab | Select (un appui : plan ; deux : carte tactique ; trois : retour au jeu) — ou menu de pause | boutons |
| Zoom | + / − | — | — |
| Pause | Échap ou P | Start | bouton |
| Avance rapide ×4 (bascule) | . (point) | — | bouton |

En véhicule : avancer / reculer = accélérer / freiner, gauche / droite = volant, Espace = frein à main,
R = sirène, B = gyrophares, N = klaxon, V = vue intérieure / extérieure, E = descendre.

## Paramètres d'URL utiles

| Paramètre | Effet |
|---|---|
| `?autostart=paris` | lance une session sans passer par la page d'accueil (place de la Concorde par défaut) |
| `?autostart=test` ou `&map=test` | quartier d'essai au lieu de Paris |
| `&place=Place de la République` | lieu de départ (nom connu de la carte) ; ou `&x=…&z=…` |
| `&role=crs&rank=gardien&poste=lanceur` | rôle, grade, poste du joueur (`&variante=samu`, `radical`… pour les rôles civils) |
| `&camera=tps` ou `fps` | vue de départ imposée (défaut : première personne, troisième si des collègues bouchent la vue) |
| `&time=21.5&weather=pluie` | heure (0 à 24) et météo (clair, nuageux, couvert, pluie, averse, brouillard, orage) |
| `&quality=bas` | qualité graphique : bas, moyen, haut, ultra (enregistrée comme réglage) |
| `&passants=0` | nombre de passants autour du lieu (10 par défaut) |
| `&seed=42` | graine : même graine, même mise en place |
| `&nomenu=1` | pas de page d'accueil (tests) |
| `&debug=1` | journalisation bavarde |

Exemple : `http://localhost:5173/?autostart=paris&role=commandant&place=Place de la Bastille&time=18&quality=moyen`.
Console du navigateur : `__CRS.summary()`, `__CRS.step(secondes)`, `__CRS.teleport(x, z)`.

## Ce qui est jouable aujourd'hui

Vérifié dans le navigateur (`tests/e2e/game.mjs` et scripts `tests/e2e/verif-*.mjs`, captures regardées) ou, quand
c'est précisé, dans les tests d'intégration sans rendu (`tests/unit/integration.*.test.ts`).

- **Page d'accueil** (souris, clavier, doigt, manette) : rôle, grade, poste, lieu sur le plan, affluence, tension,
  **moyens engagés**, lancement ; paramètres. Un seul chef : le **commandant** porte l'écharpe et prononce les sommations.
- **Chargement** du vrai Paris autour du lieu choisi, avec une barre de progression réelle (dispositif, monuments, ville).
- **Moyens engagés** : ce que règle la page d'accueil est réellement en jeu — compagnie de 1 à 8 sections, un fourgon
  par groupe dans la limite demandée, véhicule de commandement, engin lanceur d'eau, Centaure, BRAV-M, équipe drone
  (vérifié : 4 sections · 12 fourgons · canon à eau · BRAV-M · drone = 100 agents et 22 véhicules place de la Concorde).
  Le joueur CRS, chef de groupe, chef de section ou commandant tient son poste dans cette compagnie.
- **Dispositif à l'écart** : les forces de l'ordre sont placées à une centaine de mètres du rassemblement, hors du
  parcours, face au lieu ; leurs véhicules sont garés derrière elles, nez vers la sortie (les dix lieux de l'accueil
  sont vérifiés sans rendu).
- **Unités qui manœuvrent** : le commandant IA déploie la compagnie (barrages, protection de sites, réserve), les
  unités rendent compte à la radio ; le joueur chef de groupe donne ses ordres par la roue (F) ou la carte tactique et
  ses équipiers les exécutent (vérifié sans rendu : « avancer » de 20 m). Dans une compagnie menée par l'IA, le chef
  de section envoie d'abord le groupe à son poste — suivez-le ; votre ordre prime ensuite le sien : le groupe se
  reforme sur vous puis rejoint le point (35 s si vous y marchez ; il vous attend et avance au ralenti si vous restez
  sur place). Un simple équipier reçoit les ordres : la touche F le lui dit.
- **Départ** : dans une compagnie, le joueur d'un rang intérieur est posé au bout du premier rang, la vue et le
  passage dégagés ; il peut prendre le volant d'un véhicule de son unité (le conducteur IA lui cède la place).
- **Se déplacer** : au clavier on MARCHE (≈ 1,25 m/s, le souffle se refait) ; la touche d'allure bascule vers la petite
  foulée (≈ 2,8 m/s) ; Maj tenu = sprint (≈ 4,4 m/s, qui épuise). On bute sur les grilles, le mobilier et les troncs
  d'arbres. **Vues** à la première et à la troisième personne (V). **Avance rapide** ×4 (touche « . »).
- **Mobilier urbain, vitrines, barricades** dessinés (candélabres, bancs, abribus, terrasses, devantures avec leur enseigne).
- **Monuments visibles de loin** : la tour Eiffel se voit du Trocadéro et de la Concorde en qualité basse.
- **Manifestation** : la foule arrive par vagues (bouches de métro), se rassemble sur le lieu, puis suit son
  déroulé (phase et tension affichées au HUD, parcours sur la mini-carte) ; les groupes radicaux sont pilotés par leur
  module (signes avant-coureurs, bloc, casse) — vus dans les tests du module, pas encore regardés dans le navigateur.
- **Incidents** (feu, blessé, automobiliste bloqué…) détectés, annoncés à la radio, délégués par le commandant IA ;
  pompiers et SAMU sur appel ; médecins de rue. Vu dans le navigateur : un « automobiliste bloqué » annoncé et traité.
- **Objets** : barre d'objets, mise en main (1 à 9), lancer dosé au clic maintenu. La grenade lacrymogène part, ses
  palets diffusent un nuage de gaz visible, l'emploi de la force est jugé — sans sommation préalable, le jeu relève la
  faute. Un collègue renversé en voiture est une faute relevée.
- **HUD** : heure et météo, boussole et secteur, état légal, unité et ordre en cours, santé et souffle, barre
  d'objets, mini-carte ; disposition compacte dans une petite fenêtre. **Plan de Paris**, **carte tactique** (unités,
  ordres, incidents, rues fermées), **pause** (avec accès à la carte tactique), **paramètres**, « Recommencer », compte
  rendu, retour à l'accueil.
- **Téléphone** (844×390, paysage) : commandes tactiles, joystick virtuel, barre d'objets, pause au doigt.
  En portrait, le jeu demande de tourner l'appareil et se met en pause.

Branché mais non vérifié à l'œil ou à l'oreille ici : le son (aucune sortie audio sur la machine d'essai), la capture
réelle de la souris (refusée dans les tests : Chromium headless s'emballe sous capture), une vraie manette, la toux
et le voile d'écran sous le gaz, la conduite vue à l'écran, les rôles autres que CRS vus en 3D, les affrontements.

## Ce qui ne l'est pas encore

- **Pas d'objectifs ni de fin de mission automatique** : le cadre de mission n'existe pas encore (terminer par la
  pause : « Terminer et voir le compte rendu »). Missions du catalogue, carrière, médias, campagne, école : non branchés.
- **À-coups** : un monument détaillé est construit en une seule image quand on arrive près de lui (jusqu'à plus d'une
  seconde sur une machine lente) ; la construction des tuiles de la ville dépasse parfois son budget (20 ms).
- **Détails de rendu** : roues et mobilier dessinés 8 cm sous le niveau des trottoirs ; image peu définie sur
  téléphone en qualité basse (échelle de rendu 70 %) ; un million de triangles par image avec la compagnie complète.
- **Poste du commandant** : le choix « terrain / salle de commandement » n'est pas sur la page d'accueil.
- La manifestation n'a été regardée à l'écran que dans sa phase de rassemblement : cortège, affrontements et
  dispersion tournent dans les tests sans rendu.
