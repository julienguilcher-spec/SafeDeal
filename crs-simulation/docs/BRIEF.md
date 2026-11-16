# CRS SIMULATION FRANCE — Brief de projet (référence commune)

> Ce fichier est la source de vérité pour toute personne (ou agent) qui travaille sur le jeu.
> Il résume la demande du joueur-commanditaire et les décisions prises. Lis-le en entier avant de coder.

## 1. Ce que veut le commanditaire

Un jeu de simulation **ultra réaliste** de maintien de l'ordre à la française, en monde ouvert dans **Paris**,
meilleur que les jeux « CRS simulation » existants. En priorité : **les manifestations**.

- **Tous les rôles sont jouables** (et tous existent aussi en PNJ) :
  CRS (du gardien de base au chef de groupe), **commandant** (voir ci-dessous), BRAV-M (binôme à moto), gendarme
  mobile (équipage du **Centaure**), opérateur du canon à eau, **télépilote de drone**, **médecin** (street medic),
  **pompier** / secouriste, **journaliste**, **manifestant**.
- **Un seul chef : le commandant a tous les pouvoirs** (décision explicite du commanditaire). Le commandant d'unité et
  l'autorité civile (commissaire) ne font **qu'une seule personne**, « un peu préfet de police » : il porte l'**écharpe
  tricolore**, tient le **mégaphone**, prononce lui-même les **sommations**, décide de l'emploi de la force et commande
  toute la compagnie et les moyens spéciaux. **Ses ordres s'appliquent immédiatement** : aucune demande d'autorisation,
  aucun délai hiérarchique, aucun second personnage à convaincre. Il reste responsable de ses décisions (le compte rendu
  et l'évaluation jugent ses choix). Techniquement : le rôle jouable `commandant` cumule le poste de commandement et la
  qualité d'autorité habilitée (`look.sash = true`, mégaphone et fusée de sommation en dotation) ; le rôle `commissaire`
  du contrat est un simple alias du même rôle et n'est pas proposé séparément dans l'interface. Quand le joueur incarne
  un autre rôle, le commandant IA est lui aussi ce personnage unique.
- **Modes** : Carrière (on progresse de grade en grade) ; **Mode libre** (on choisit son rôle, son grade — y compris
  commandant directement — et sa mission) ; Monde ouvert (patrouille libre) ; Éditeur de scénario (lieu, effectif,
  tension, météo, heure).
- **Énormément de missions**, inventées, variées, pour chaque rôle.
- **Manifestants très réalistes** : cortège, slogans, banderoles, puis selon la tension : jets de pavés, cocktails
  Molotov, mortiers d'artifice, barricades, feux de poubelles et de véhicules, vitrines brisées, pillages, renvoi des
  grenades lacrymogènes… On peut les **interpeller**. La manifestation **peut dégénérer d'un côté ou de l'autre** selon
  le comportement de chacun (un usage aveugle de la force radicalise la foule pacifique). La mission dure tant que la
  manifestation n'est pas terminée (durée standard ≈ 25 min, réglable : 10 / 25 / 45 min / temps réel).
- **Des manifestants détaillés, qui ont une raison d'être là** (demande explicite du commanditaire) :
  - chaque manifestation a une **cause** identifiable (pouvoir d'achat, retraites, climat, logement, hôpital, éducation,
    monde agricole, prix des carburants, libertés publiques…) qui se lit dans les **pancartes**, **banderoles**, slogans
    scandés, tracts, couleurs et accessoires ; les pancartes portent de vrais textes lisibles, variés, écrits à la main ;
  - des **familles visuelles** bien reconnaissables : **gilets jaunes** (gilet de haute visibilité jaune, souvent annoté au
    dos), cortège syndical (chasubles, drapeaux, ballons, camion sono), étudiants et lycéens, militants climat, personnels
    soignants en blouse, agriculteurs, retraités, familles avec enfants, et le **black bloc** ;
  - le **black bloc** est une vraie composante de jeu : groupe compact tout en noir (capuche, masque, lunettes, gants, sac
    à dos), banderole renforcée en tête, parapluies déployés pour masquer, qui se forme en tête de cortège, se change, agit
    de façon **coordonnée** puis se disperse et se fond dans la foule ;
  - la violence peut être **très élevée** : assauts organisés contre les lignes de CRS (pavés, bouteilles, mortiers
    d'artifice tirés à tir tendu, cocktails Molotov, charges sur un agent isolé ou un véhicule), CRS blessés ou mis à terre
    qu'il faut dégager, **boutiques attaquées** (vitrines brisées au marteau, rideaux de fer forcés, pillage, incendie),
    banques et panneaux publicitaires ciblés, véhicules retournés et incendiés, barricades enflammées. L'intensité se règle
    (tension et propension à dégénérer) et dépend aussi de ce que fait le joueur.
- **Des formations impeccables** (demande explicite du commanditaire) : les unités manœuvrent **en ordre**, comme en vrai.
  Lignes de barrage rectilignes, boucliers jointifs, intervalles réguliers ; colonnes par deux ou par trois qui se
  déplacent au pas ; deuxième rang (lanceurs, LBD, chef de groupe) derrière les boucliers ; tortue ; bond offensif puis
  réalignement ; relève d'une ligne par une autre ; débarquement des fourgons et mise en place ordonnée. Les BRAV-M
  roulent en colonne de binômes puis mettent pied à terre ensemble ; les gendarmes mobiles avancent derrière le
  Centaure ; les véhicules stationnent alignés. Une unité ne redevient désordonnée que sous une vraie pression (charge
  subie, panique, pertes) et se reforme dès que possible.
- **Le métro comme source d'affluence** (demande explicite du commanditaire) : on ne joue pas dans le métro, mais les
  **bouches de métro** de la carte sont des points d'arrivée — les manifestants en sortent par vagues, surtout au
  rassemblement, puis par renforts quand la mobilisation grossit — et des points de départ à la dispersion ou pour fuir.
  L'affluence dépend de la taille de la manifestation et de l'heure. Comme en vrai, le commandement peut demander la
  **fermeture de stations** (ce qui tarit l'arrivée par cet endroit et déplace le flux vers les stations voisines), et des
  unités peuvent filtrer ou contrôler une sortie.
- **Couper la circulation** (demande explicite du commanditaire) : le joueur gradé (et l'IA du commandement) peut
  **fermer une rue, un carrefour, un pont ou tout un périmètre** à la circulation, depuis la carte tactique ou sur place :
  barrières et véhicules de police en travers, agents postés qui font faire demi-tour, déviation. Le trafic réagit pour de
  vrai : les voitures ralentissent, sont déviées par un autre itinéraire, font demi-tour, klaxonnent, des bouchons se
  forment en amont ; bus et taxis compris. Une rue non coupée où arrive un cortège met des automobilistes en danger
  (véhicules bloqués, pris à partie, incendiés) : couper à temps fait partie du travail. On peut rouvrir.
- **Barricades et feux de rue réalistes** (demande explicite du commanditaire) : les émeutiers construisent des barrages
  avec ce qu'ils trouvent — poubelles et conteneurs renversés puis enflammés, barrières de chantier, palettes, mobilier de
  terrasse, **vélos et trottinettes en libre-service**, scooters — et y mettent le feu. Chaque matériau brûle à sa façon :
  plastique des poubelles qui fond avec une fumée noire épaisse, **batteries des vélos et trottinettes électriques** qui
  s'embrasent violemment, crépitent, projettent des étincelles et peuvent se rallumer, pneus et deux-roues à fumée très
  noire. Restent ensuite des carcasses calcinées, du bitume noirci et des débris. Les barricades gênent réellement la
  progression des unités et des véhicules ; on les éteint (extincteur, canon à eau, pompiers) et on les dégage (à la
  main, à la lame du Centaure).
- **Page d'accueil où l'on choisit tout** (demande explicite du commanditaire) : à l'arrivée dans le jeu, un écran
  d'accueil soigné, entièrement en français, utilisable à la souris, à la manette et au doigt, d'où l'on règle **chaque
  détail** avant de jouer, avec un aperçu et un bouton « Lancer » :
  - **rôle** (CRS, chef de groupe, commandant, commissaire, BRAV-M, équipage du Centaure, opérateur du canon à eau,
    télépilote de drone, médecin, journaliste, manifestant) et, pour les forces de l'ordre, **grade** et **poste** ;
  - **mode** (carrière, mode libre, monde ouvert) et **mission** (catalogue filtrable par rôle et par type) ;
  - **lieu** (places et parcours réels, choisis sur la carte de Paris) ;
  - **heure** et **météo** (clair, couvert, pluie, averse, brouillard, orage) ; vent ;
  - **affluence** (nombre de manifestants), **cause** de la manifestation et composition de la foule (familles, gilets
    jaunes, cortège syndical, part de black bloc…) ;
  - **tension de départ** et **propension à dégénérer** ; **durée** (10 / 25 / 45 min / temps réel) ;
  - **moyens engagés** : nombre de sections, véhicules, Centaure, canon à eau, BRAV-M, drone, secours ;
  - options de règles (sanctions actives ou non), niveau de violence affiché, circulation ouverte ou coupée au départ,
    stations de métro ouvertes ou fermées ;
  - un bouton « Surprends-moi » qui tire un scénario au hasard, et la possibilité d'**enregistrer ses scénarios**.
  Le même écran donne accès à la carrière, à la personnalisation, au garage, aux paramètres (graphismes, commandes, son)
  et aux crédits (dont l'attribution des données cartographiques).
- **Incidents à traiter : déléguer ou faire soi-même** (demande explicite du commanditaire) : pendant une mission, le jeu
  fait naître des **incidents** concrets — feu de poubelle, de barricade, de véhicule ou de boutique ; blessé à aller
  chercher ; agent isolé ou à terre ; pillage en cours ; barricade à dégager ; automobiliste bloqué ; secours empêchés
  d'avancer. Chaque incident est une **tâche** localisée, visible sur la carte et annoncée à la radio, avec une urgence.
  - Si le joueur **commande** (commissaire, commandant, chef de groupe), il **délègue** : il désigne l'unité ou le moyen
    qui s'en charge (un porte-extincteur, un groupe pour extraire un blessé, les pompiers sous escorte, le canon à eau, le
    Centaure pour ouvrir une barricade, une BRAV-M pour un pillage). L'unité y va réellement, exécute, rend compte ; un
    incident non traité s'aggrave (le feu se propage, le blessé s'affaiblit) et pèse sur l'évaluation.
  - Si le joueur **exécute** (pompier, médecin, CRS porte-extincteur, équipage du Centaure ou du canon à eau), c'est lui
    qui **reçoit** la tâche par radio et va la faire : il se rend sur place, éteint le feu à la lance ou à l'extincteur,
    relève et évacue le blessé, pousse la barricade à la lame, arrose depuis la tourelle.
  - Le **pompier** est donc un rôle jouable à part entière (sapeur-pompier de Paris : fourgon, lance, extinction,
    secours à victime), dépendant de la protection des forces de l'ordre pour travailler.
  - Réalisme des moyens (confirmé par le commanditaire) : c'est le **canon à eau** qui éteint, pas le Centaure ; les
    pompiers éteignent aussi ; le Centaure dégage et pousse (lame) et lance des grenades ; un extincteur suffit pour un
    petit feu, pas pour un véhicule embrasé.
  - **Ordre « éteindre le feu »** : depuis la carte tactique, la roue d'ordres ou la radio, le joueur désigne un feu et
    choisit le moyen selon la situation — un porte-extincteur proche, le canon à eau, ou **appeler les pompiers**.
  - **Appeler les secours** : pompiers et SAMU ne sont pas sur place d'emblée ; on les demande par radio. Ils arrivent
    par la rue après un délai réaliste, s'arrêtent à distance si la zone n'est pas sûre, et n'interviennent que si un
    itinéraire dégagé et une protection leur sont fournis. Le bon choix **dépend** : feu important ou blessé grave →
    secours ; petit feu, urgence ou zone trop hostile → moyens propres de l'unité.
- **Améliorations retenues par le commanditaire** :
  1. **Phase de préparation** avant la mission : note de renseignement (effectif attendu, part de radicaux, points
     chauds, météo, parcours déclaré), puis mise en place du dispositif sur la carte avant l'arrivée de la foule.
  2. **Mesures préventives** : retrait du mobilier urbain du parcours (poubelles, barrières, conteneurs), contrôles et
     fouilles en amont, périmètre interdit. Tout projectile vient d'un objet réellement présent dans la rue : moins de
     mobilier, moins de munitions pour les casseurs.
  3. **Dialogue avec les organisateurs** : une équipe de liaison parle au service d'ordre du cortège (arrêt, changement
     de parcours, isolement des violents) — voie de désescalade sans force.
  4. **Signes avant-coureurs** à repérer à pied ou au drone : personnes qui se changent, se regroupent, dépavent,
     déploient des parapluies ; les repérer à temps permet d'agir avant le passage à l'acte et rend les phases calmes utiles.
  5. **Densité et mouvements de foule** : alerte de compression (≥ 4 personnes/m²), issues à garder ouvertes ; une nasse
     mal faite ou une charge dans une rue étroite peut provoquer une bousculade grave.
  6. **Fatigue et logistique des unités** : une section qui tient la ligne s'épuise et doit être relevée ; les grenades
     s'épuisent et se réapprovisionnent aux fourgons.
  7. **Compte rendu ligne à ligne et relecture sur carte** : en fin de mission, heure, lieu, acte, règle appliquée, points
     gagnés ou perdus ; puis relecture de toute la manifestation vue du dessus (trajets des unités, tirs, tension).
  8. **Missions miroirs** : la même manifestation rejouée dans un autre rôle (commandant, puis journaliste ou manifestant).
  9. **Campagne sur plusieurs jours** (« semaine de mobilisation ») : fatigue, blessés, image publique et colère de la rue
     se reportent d'un acte au suivant.
  10. **École de formation** : quatre ateliers de trois minutes (tenir la ligne, porter le bouclier, écouter et prononcer
      les sommations, premiers secours).
  Écartée : la chaîne d'autorisation entre commandant et commissaire (remplacée par le commandant unique ci-dessus).
- **Tout le matériel** : bouclier, tonfa / bâton de défense, gazeuse, grenades lacrymogènes à main et au lanceur
  (Cougar), grenades de désencerclement, LBD 40, extincteur, menottes, radio, mégaphone, arme de service
  (légitime défense uniquement). **Véhicules conduisibles** : fourgon CRS, car de transport, véhicule de commandement,
  voiture de police, Centaure (lance des salves de grenades), canon à eau, moto BRAV-M, véhicules civils.
- **Esthétique fidèle** : tenues, casques, boucliers, livrées des véhicules, insignes de grade, écharpe tricolore.
- **Règles réalistes** : sommations obligatoires, riposte graduée, ordres de la hiérarchie ; une bavure entraîne
  enquête IGPN, blâme, rétrogradation, révocation. Journalistes et téléphones filment : image publique.
- Blessures réalistes (réglage « sobre » disponible dans les options).
- Interface **entièrement en français**.
- **Carte tactique de commandement** (demande explicite du commanditaire) : une carte que l'on ouvre à tout moment, où
  l'on voit ses unités (sections, groupes, binômes, véhicules, Centaure, canon à eau, BRAV-M) et la foule, et d'où l'on
  **déploie** et **commande** : sélectionner une ou plusieurs unités, les placer à un endroit précis, tracer une ligne de
  barrage, ordonner une **nasse** (encerclement), un **repli**, un bond offensif, une charge, un refoulement, tenir la
  position, disperser au gaz, interpeller une cible, protéger les secours, embarquer/débarquer ; fixer le niveau de force
  autorisé. Les ordres sont réellement exécutés par l'IA des unités, avec compte rendu radio. L'étendue du commandement
  dépend du grade (chef de groupe : son groupe ; commandant : toute la compagnie ; simple CRS : il reçoit les ordres et
  voit la carte en lecture seule). Utilisable à la souris, à la manette et au doigt.

## 2. Décisions techniques (non négociables)

| Sujet | Décision |
|---|---|
| Moteur | **Jeu web 3D** : TypeScript strict + Three.js (r187) + Vite. Aucun moteur externe. |
| Appareils | PC clavier/souris (pointer lock), **manette** (Gamepad API), **téléphone/tablette tactile**. |
| Hébergement | Site 100 % statique, chemins **relatifs** (`base: './'`). Doit fonctionner dans une iframe. |
| Interdits | **Pas de WebAssembly, pas de Web Worker obligatoire, pas de `eval`**, pas d'appel réseau hors des fichiers du jeu, pas de CDN. Tout est dans le dépôt. |
| Assets | **100 % procéduraux** : géométries, textures (canvas), sons (WebAudio) générés par le code. Aucun fichier binaire d'asset importé (hors données de carte générées). |
| Physique | Maison, en TypeScript : monde quasi 2D (plan x/z) + relief doux via `heightAt`. |
| Sauvegarde | `localStorage`, schéma versionné, export/import JSON. |
| Multijoueur | Solo. |
| Tests | `vitest` (logique de simulation, sans rendu) + scripts Playwright/Chromium headless (WebGL logiciel). |

## 3. Monde : le cœur de Paris, vrai plan des rues

- Emprise (WGS84) : longitude **2.2850 → 2.3725**, latitude **48.8500 → 48.8780** (≈ 6,4 km × 3,1 km ≈ 20 km²).
  De l'Étoile et du Trocadéro à l'ouest jusqu'à République et Bastille à l'est ; Tour Eiffel, Invalides, Concorde,
  Champs-Élysées, Louvre, Opéra, Notre-Dame, Hôtel de Ville inclus.
- **Origine du monde** : obélisque de la Concorde, lat0 = 48.865633, lon0 = 2.321236.
- **Repère** : mètres. `x` = est, `z` = sud (donc le nord est `-z`), `y` = haut. Three.js, Y-up.
  Projection locale : `x = (lon - lon0) * 73305`, `z = -(lat - lat0) * 111214`.
- **Cap (heading)** en radians : vecteur avant = `(sin h, cos h)` dans le plan `(x, z)`. `h = 0` regarde vers `+z` (sud).
  Un modèle 3D « regarde » vers `+z` ; on pose `object.rotation.y = h`.
- **Tuiles** carrées de **512 m**, indices `tx = floor(x / 512)`, `tz = floor(z / 512)` (≈ 98 tuiles). Chargement par secteurs.
- Sources ouvertes (OpenStreetMap, open data de la Ville de Paris, IGN). Attribution obligatoire dans le jeu.
- **Monuments** modélisés à la main (procéduralement) : Arc de Triomphe, Tour Eiffel, obélisque et fontaines de la
  Concorde, Louvre et pyramide, Notre-Dame, Opéra Garnier, Invalides, Grand Palais, Petit Palais, Madeleine,
  Assemblée nationale, Hôtel de Ville, colonne Vendôme, colonne de Juillet, statue de la République, Palais de Chaillot,
  pont Alexandre III, etc.

## 4. Règles de contenu

- Jeu vidéo de simulation : **neutralité politique**. Les causes et les revendications sont des thèmes réalistes (voir
  plus haut) présentés sans parti pris ; le mouvement des gilets jaunes est représenté par sa tenue et son ambiance.
  **Aucune personne réelle, aucun parti ni syndicat réel nommé** ; aucun slogan visant une personne réelle ; les
  organisations affichées (syndicats, collectifs, associations) portent des noms fictifs.
- **Aucune marque commerciale réelle** (enseignes, constructeurs de véhicules, fabricants) : noms fictifs. Les noms de
  rues, places, monuments et institutions publiques réels sont conservés. « POLICE », « CRS », « GENDARMERIE »,
  « PRESSE », « SAMU », « SAPEURS-POMPIERS » sont utilisés tels quels.
- Les comportements violents sont décrits **au niveau du gameplay** (ce que les gens font), jamais comme mode d'emploi :
  aucune recette de fabrication d'engin incendiaire, explosif ou arme.
- Pas de gore gratuit. Réglage « sobre » qui masque le sang.

## 5. Règles de qualité (pour tout contributeur)

1. **Jamais de fonction vide, de faux système ni de « TODO » à la place du code.** Si une partie n'est pas faite,
   dis-le explicitement dans ton rapport.
2. **Ne déclare rien terminé sans l'avoir exécuté** (test unitaire, script headless, capture d'écran regardée).
3. **Propriété des fichiers** : tu ne modifies que les fichiers/dossiers qui te sont attribués. Si un fichier d'un autre
   module doit changer, signale-le dans ton rapport au lieu de le modifier.
4. Les modules ne s'importent pas entre eux : ils dépendent **uniquement** de `src/core/contracts.ts` (interfaces)
   et des utilitaires de `src/core/`. Le câblage se fait dans la racine de composition.
5. Code TypeScript strict, commenté en français là où c'est utile, textes d'interface en français.
6. Performance : viser 60 images/s sur PC moyen avec 300+ personnages, et 30 images/s sur téléphone récent en qualité basse.
   Pas d'allocation dans les boucles chaudes, instancing systématique.
7. Vérification des types : `npx tsc --noEmit` peut afficher des erreurs venant de fichiers d'autres contributeurs en
   cours d'écriture — ne corrige que les erreurs situées dans **tes** fichiers.
