# CRS SIMULATION FRANCE — Brief de projet (référence commune)

> Ce fichier est la source de vérité pour toute personne (ou agent) qui travaille sur le jeu.
> Il résume la demande du joueur-commanditaire et les décisions prises. Lis-le en entier avant de coder.

## 1. Ce que veut le commanditaire

Un jeu de simulation **ultra réaliste** de maintien de l'ordre à la française, en monde ouvert dans **Paris**,
meilleur que les jeux « CRS simulation » existants. En priorité : **les manifestations**.

- **Tous les rôles sont jouables** (et tous existent aussi en PNJ) :
  CRS (du gardien de base au commandant de compagnie), autorité civile / commissaire (écharpe tricolore, mégaphone,
  c'est elle qui fait les **sommations**), BRAV-M (binôme à moto), gendarme mobile (équipage du **Centaure**),
  opérateur du canon à eau, **télépilote de drone**, **médecin** (street medic / secours), **journaliste**, **manifestant**.
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
