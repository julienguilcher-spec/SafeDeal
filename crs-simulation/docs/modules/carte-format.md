# Compte rendu — carte:format

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le format de carte est écrit dans src/world/mapdata.ts : module sans aucun import, en syntaxe effaçable, qui porte la projection, les types bruts et décodés, les encodeurs et décodeurs (tuile, graphe routier, relief, lieux, monuments, manifeste), sampleTerrain bilinéaire et les contrôles validate*. Les trois vérifications obligatoires passent : 62 tests vitest, tsc sans erreur, import direct par Node 22 (90 exports). Sur disque, tout est en JSON à colonnes d'entiers : décimètres relatifs à l'origine de la tuile, anneaux et polylignes en deltas, énumérations par indice, colonnes à leur défaut omises, table de chaînes par fichier. La version vaut 1 ; un décodeur ignore les couches et colonnes inconnues et lit un code d'énumération inconnu comme la valeur d'indice 0. Les catégories de commerce, classes de voie, natures de lieu et noms de mobilier reprennent les valeurs de src/core/contracts.ts. src/world/testDistrict.ts génère, de façon déterministe par graine, un quartier fictif de 1 024 m × 1 024 m sur 4 tuiles dans ce même format, avec tous les éléments demandés ; validateMapData n'y trouve ni erreur ni avertissement. J'ai rendu ce quartier en image et l'ai regardé (vue d'ensemble et 5 zooms) : cela a révélé des supports de feux manquants aux carrefours de l'avenue, corrigés depuis. Le format n'a été essayé sur aucune donnée réelle de Paris : aucun script de tools/map n'importe encore mapdata.ts. Je n'ai rien écrit dans public/data/paris et rien commité.

## Chiffres

mapdata.ts : 3 023 lignes, 90 exports à l'exécution (56 fonctions, 34 constantes). Format version 1 ; Paris = 98 tuiles + 5 fichiers globaux = 103 fichiers (limite 110). Énumérations : 20 types de bâtiment, 4 toits, 4 styles, 17 types de surface, 6 de barrière, 30 de mobilier, 14 catégories de commerce, 8 classes de voie, 6 revêtements, 9 natures de lieu. Quartier d'essai (graine 1) : 4 tuiles, 1 262 bâtiments, 155 surfaces, 14 barrières, 509 arbres, 648 objets de mobilier, 51 supports de feux, 3 bouches de métro, 168 commerces dont 120 sur l'avenue ; graphe de 95 nœuds et 131 arêtes, 20 carrefours à feux ; 23 lieux ; 1 monument ; relief 67 × 67 au pas de 16 m, de -6,5 à +7,4 m ; niveau de l'eau -7,3 m. Tailles JSON : tuiles de 22,9 à 27,0 ko, roadgraph 5,7 ko, terrain 9,6 ko, places 0,9 ko, landmarks 0,2 ko, manifest 0,9 ko ; total 119 ko. Sources retenues : aucune, le quartier d'essai est entièrement fictif et aucune donnée tierce n'a été téléchargée par cette mission.

## Problèmes et limites

- Non vérifié sur données réelles : aucun script de tools/map n'importe encore mapdata.ts, et public/data/paris n'existe pas de mon fait. Le budget de 30 Mo n'est qu'estimé à partir de la tuile synthétique dense.
- Aucune mesure sur téléphone : la rapidité du décodage n'est établie que sous Node sur la machine de développement.
- testDistrict.ts n'est pas importable par Node seul : il importe './mapdata' sans extension, car tsconfig.json n'active pas allowImportingTsExtensions (avec l'extension .ts, tsc signale TS5097). Vite et vitest le résolvent. Pour l'ouvrir à Node, l'intégrateur doit ajouter cette option à tsconfig.json puis écrire './mapdata.ts' ; je n'ai vérifié l'option que dans un dossier d'essai hors dépôt.
- Taille des fichiers : mapdata.ts fait 3 023 lignes, testDistrict.ts 1 078 et le test 1 429, au-delà des 600 lignes conseillées par docs/ARCHITECTURE.md. La consigne « module autonome, aucun import » et la liste fermée de mes fichiers empêchent de découper.
- Règles du format que le pipeline doit respecter, sinon validateTile ou validateMapData renvoient des erreurs : un bâtiment va dans la tuile qui contient le centre de sa boîte englobante et n'est jamais découpé ; un commerce est à 1,5 m au plus de la façade de son bâtiment ; les identifiants de bâtiments et de commerces sont uniques sur toute la carte ; roadEdges vient de computeTileEdgeRefs ; l'ordre du tableau surfaces est l'ordre de superposition.
- Écarts avec src/core/contracts.ts, à convertir dans src/world/query : MapSurfaceKind (type de polygone) n'est pas le SurfaceKind des contrats ; RoadEdge porte surface: 'sett' au lieu d'un booléen sett ; l'identifiant d'une arête ou d'un nœud est son indice ; Shop a un id stable alors que MapShopInfo attend un index dans la tuile.
- Les clés de monuments conseillées (SUGGESTED_LANDMARK_KEYS, ex. arc_de_triomphe) ne sont pas coordonnées avec src/world/monuments. Une clé hors convention ne donne qu'un avertissement, mais un bâtiment ou un pont dont la clé manque dans landmarks.json est une erreur.
- Le monument du quartier d'essai porte la clé fictive 'monument_essai', sans modèle fait main. Comme le rendu générique ignore un bâtiment à landmarkKey, le moteur doit prévoir un repli (extruder l'emprise sur la hauteur), sinon rien ne s'affiche au centre de la place.
- Conventions laissées au moteur et non vérifiées côté rendu : le tablier d'un pont se construit à partir de l'arête (aucune surface au-dessus de l'eau dans le quartier d'essai) ; l'eau s'affiche au niveau porté par la surface, le relief n'étant pas contractuel dessous ; un mur de quai suit sa crête.
- Le découpage fourni (clipRingToRect, Sutherland–Hodgman) n'est pas un vrai découpage de polygones : un anneau concave ou un trou qui franchit une limite de tuile laisse des côtés confondus sur le bord. Le format le tolère ; le triangulateur du moteur devra le supporter.
- encodeTile écarte ce qu'il ne peut pas représenter (anneau dégénéré après arrondi au décimètre, point hors de sa tuile) et ne le signale que si l'appelant fournit le tableau dropped.
- Hors format pour l'instant : intérieurs, numéros de rue, restrictions de tourne-à-gauche, essence des arbres. L'ajout de colonnes reste possible sans changer de version.

## Vérifications exécutées

- npx vitest run tests/unit/mapdata.test.ts (depuis /home/user/SafeDeal/crs-simulation) : 1 fichier, 62 tests passés. Ils couvrent la projection (Arc de Triomphe à x ≈ -1920 m, z ≈ -907 m, 98 tuiles pour l'emprise), l'aller-retour encode/decode et son idempotence, 60 tuiles aléatoires jusqu'aux bords de l'emprise, validateRawTile et validateTile (10 et 14 cas d'erreur détectés), le graphe routier, sampleTerrain, les lieux, monuments et manifeste, et le quartier d'essai.
- npx tsc --noEmit : code de sortie 0, aucune erreur dans mes fichiers ni ailleurs lors de la dernière exécution.
- npx tsc --noEmit --erasableSyntaxOnly : aucune erreur dans mapdata.ts ni testDistrict.ts (pas d'enum, de namespace ni de propriété de paramètre).
- node -e "import('./src/world/mapdata.ts').then(m=>console.log(Object.keys(m).length))" : affiche 90, sans avertissement.
- Quartier d'essai, par les tests : validateRawTile et validateTile sans erreur ni avertissement sur les 4 tuiles ; validateMapData sans erreur ni avertissement ; réencodage identique au fichier ; même graine = même JSON ; graphe en une seule composante connexe ; tout carrefour intérieur atteignable et quittable en respectant les sens uniques.
- Contenu du quartier d'essai, par les tests : avenue de 40 m entre façades à deux chaussées et terre-plein, rues de 10, 12 et 14 m, place ronde à sens giratoire avec monument, fleuve, pont et murs de quai, jardin clos par une boucle fermée de grilles et portails, arbres d'alignement tous les 9,5 m, commerces posés sur la façade de leur bâtiment, feux à chaque croisement de l'avenue, relief nul à l'origine et pentes inférieures à 4 %.
- Contrôle visuel : rendu PNG du quartier décodé par un script Python jetable (hors dépôt), vue d'ensemble et 5 zooms regardés (place, carrefour de l'avenue avant et après correction, square, pont, mairie).
- Mesures sous Node 22 sur cette machine : les 4 tuiles du quartier d'essai (102 ko) se lisent en 0,4 ms de JSON.parse et 0,35 ms de decodeTile ; une tuile synthétique dense (1 500 bâtiments de 10 sommets, 750 arbres, 750 objets) pèse 169 ko, soit 9,6 octets par sommet de bâtiment, et se lit en 0,9 ms + 0,26 ms.
- npx vitest run (suite entière) : mon fichier passe ; 1 échec dans tests/unit/people-render.pose.test.ts, qui n'est pas à moi.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/mapdata.ts
- /home/user/SafeDeal/crs-simulation/src/world/testDistrict.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/mapdata.test.ts
- /home/user/SafeDeal/crs-simulation/docs/map-format.md
