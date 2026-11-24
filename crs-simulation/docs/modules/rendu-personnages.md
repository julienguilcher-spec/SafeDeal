# Compte rendu — rendu:personnages

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le module de rendu des personnages est écrit, branché comme dans le jeu sur un banc d'essai, et vérifié par 32 tests unitaires et 72 captures que j'ai regardées ; le coût GPU n'a pu être mesuré que sur WebGL logiciel. Il tient dans /home/user/SafeDeal/crs-simulation/src/render/people/ (28 fichiers, environ 6 070 lignes) et expose un GameSystem « render.people » d'ordre VIEW qui lit ctx.people.list à chaque image. Chaque personne est un humanoïde à 17 os rigides arrondis (tête = 1/7,5 de la taille), avec taille et carrure variables, 7 coiffures et 3 niveaux de détail (6 197, 2 621 et 243 sommets). Le vertex shader est greffé sur MeshStandardMaterial par onBeforeCompile : il lit l'os du sommet dans une texture de poses, puis la palette et le masque de pièces dans une texture d'apparence ; éclairage, brouillard et ombres (directionnelles et ponctuelles) sont conservés. L'animation est procédurale : marche, course, sprint, marche arrière, pas de côté, accroupi et piétinement en pivotant, avec une phase qui avance selon la distance réellement parcourue pour que le pied d'appui ne glisse pas. S'y ajoutent les 7 postures, les 36 animations UpperAnim (plus 4 internes : titubement, feu, porté, traîné), des fondus à chaque changement, et la priorité des états (menotté, feu, étourdi, toux si gaz > 0,5 sans masque, boiterie). Les 17 tenues et 13 couvre-chefs sont couverts par 52 pièces (casque à bandes jaunes, visière relevable transparente, bavolet, protections, gilet, écharpe tricolore, brassard, galons, masque à gaz, sac à dos), et les textes dorsaux, de casque, de bouclier, de pancarte et de banderole viennent d'un atlas canvas. Le registre registerHeldModel contient 39 modèles et 4 alias, regroupés en familles pour un appel de dessin par famille. En caméra « fps », le corps du joueur n'est plus dessiné (il ne projette que son ombre) et ses bras avec l'objet tenu sont résolus en espace caméra, donc sans décalage d'image. Les ombres sont réelles au niveau proche (et moyen en « haut » et « ultra »), avec une ombre de contact elliptique dans tous les cas. J'ai relu docs/research/02-materiel-tenues-vehicules.md et corrigé en conséquence : bouclier 1,00 × 0,57 m, franges d'écharpe argent, écusson rouge CRS, casque de gendarme entièrement bleu, LBD de 0,59 m.

## API publique et mode d'emploi

BRANCHEMENT
- Dans src/main.ts : `import { createSystems as renderPeople } from '@/render/people'` puis l'ajouter à MODULES. Un seul système, id « render.people », order = SystemOrder.VIEW. Le moteur de rendu est créé à init(), ou à la première frame() où ctx.view existe ; rien n'est fait en headless.
- Lectures du contexte : ctx.view (renderer, camera, world, quality, drawDistance), ctx.people.list et .get, ctx.actions.def, ctx.vehicles.get, ctx.player.state (cameraMode, personId, zoom), ctx.settings.values.shadows, ctx.clock.now, ctx.session.phase, événement 'person:removed'. Seule écriture : des maillages ajoutés à view.world.
- L'animation suit ctx.clock.now : elle est figée en pause et accélérée en avance rapide.

SERVICE ÉTENDU
`ctx.service<PeopleRenderApi>('peopleRender')`, types à importer avec `import type` depuis '@/render/people/api' :
- registerHeldModel(key, factory, options?), aliasHeldModel(alias, key), heldModelKeys()
- setHeldText(personId, text | null) : slogan de la pancarte ou de la banderole d'une personne (une centaine de textes distincts au plus)
- invalidate(personId?) : force la relecture du look
- bonePosition(personId, 'head' | 'chest' | 'handR' | 'handL', out) : position monde, utile pour le départ d'un jet de gazeuse ou la bouche d'un lanceur
- stats : near, mid, far, items, posed, cpuMs, cpuMsAvg, drawCalls
registerHeldModel, aliasHeldModel et heldModelKeys sont aussi exportés par '@/render/people' (registre global).

REGISTRE DES MODÈLES TENUS
- Clé = ctx.actions.def(id)?.heldModel, à défaut l'identifiant de l'objet. Clé inconnue : mains vides.
- factory(g: HeldBuilder) dessine avec fixed(hex, rugosité ou opacité), variant(), text(kind), box, cyl, ellipsoid, quad, push/pop/translate/rotX/rotY/rotZ/scale.
- Repère de la main droite : origine au poignet, doigts vers −Y, pouce vers +Z, paume vers +X, centre de prise (0,012 ; −0,085 ; 0). Un manche s'étend le long de Z ; un canon pointe vers −Y, le dessus de l'arme vers +Z. Unités en mètres, sans mise à l'échelle du porteur.
- Options : bone ('handR' par défaut, 'handL', 'chest', 'head'), hold, big (visible de loin), transparent, colors (une couleur par porteur), text ('slogan' ou 'unit'), twoHanded.
- Styles hold : none, small, stick, shield, long, pistol, pole, banner, loot, camera, camera_tv, phone, megaphone, extinguisher, bag, remote, spray. Ils fixent le maintien quand upper vaut 'none' : bouclier porté (levé si alt), arme longue en travers (épaulée si alt), pancarte dressée, banderole à deux mains, butin dans les bras, caméra sur l'épaule.

CLÉS RECONNUES
bouclier, baton, tonfa, gazeuse, grenade (alias grenade_lacrymo, grenade_gm2l), grenade_desencerclement, lanceur_cougar, lbd40, pistolet, megaphone, radio, extincteur, lampe, menottes, telecommande_drone, masque_gaz, fusee_sommation, lance_incendie, pave, bouteille, molotov, mortier, fumigene, pancarte, banderole, drapeau, parapluie, bombe_peinture, marteau, barre, raquette, telephone, butin (alias sac_butin), trousse_secours, serum_physiologique, brancard, appareil_photo, camera_tv (alias camera), micro.

CHAMPS LUS
- Person : x, y, z, heading, posture, upper, upperT, aimYaw, aimPitch, alt, inventory[active].id, gas, gasProtection, stun, burning, wet, injury, custody, vehicleId, seat, carrying, heldBy, dormant, look. vx et vz ne servent qu'à la première image : la foulée suit le déplacement réel.
- PersonLook : height, build, skin, hair, hairStyle (0 rasé, 1 court, 2 mi-long, 3 long, 4 queue de cheval, 5 chignon, 6 volumineux, 7 ou plus chauve), top, bottom, shoes, outfit, headgear, visorDown, gasMask, faceCover, backText, sash, armband, vest, rankBars, backpack, extras.
- Les tenues crs_mo, crs_service, gendarme_mo, bravm, pompier et samu imposent leurs couleurs : top, bottom et shoes y sont ignorés.
- extras (facultatif) : helmetColor, bandColor, packColor, coverColor, gloves (couleurs) ; jacket (0, 1 blouson, 2 manteau), sleeves (0 = manches courtes), shorts, skirt, beard, scarf, goggles, hoodDown.

CONVENTIONS
- Temps d'animation (upperT) : throw, l'objet quitte la main vers 0,42 s ; strike, impact vers 0,28 s ; kick, impact vers 0,26 s ; pickup, prise vers 0,35 s.
- La toux se déclenche si gas × (1 − 0,9 × gasProtection) > 0,5.
- custody ≠ 'free' met les mains dans le dos, sauf posture prone ou down.
- vehicleId ≠ 0 : la personne est dessinée assise sur SeatDef (x à droite, y = hauteur d'assise, z vers l'avant) avec le cap et l'assiette du véhicule, mains au volant pour le siège conducteur, à califourchon si le type contient « moto » ou vaut « scooter ».
- heldBy avec porteur en 'carry_person' : dessinée sur son épaule. Porteur en 'drag' : allongée, tête vers lui.
- Caméra : 'fps' donne les bras à la première personne ; 'vehicle_int', 'turret' et 'viewfinder' masquent le corps du joueur.

LIMITES
- Mains en moufle ou en poing, sans doigts.
- Vêtements rigides : pas de tissu ni de vent ; manteau et jupe sont raccourcis hors station debout.
- Objets toujours en main droite, sauf le bouclier (main gauche) et la banderole, le butin et la caméra d'épaule (thorax).
- Au niveau lointain, seuls les objets « big » sont dessinés et aucune pièce portée : le dessus de tête, le bas du visage et le buste prennent la couleur dominante.
- 255 modèles tenus et 127 textes d'atlas au plus.

## Mesures

CONDITIONS
Chromium headless sur une VM Xeon 2,1 GHz à 4 cœurs, charge moyenne de 5 à 11 pendant les mesures (autres travaux en parallèle). Étalon : 5 ns par racine carrée contre environ 1 ns sur un PC de bureau, soit une machine à peu près 5 fois plus lente.

CPU DU MODULE (frame() seul, 600 images simulées à 60 Hz sans rendu ; deux séries)
| Scène | Poses recalculées par image | Médiane | Moyenne | p95 | Max |
| 1 500 personnes, qualité haut, caméra haute (322 moyennes, 1 178 lointaines, 437 objets) | 454 | 0,40 à 0,60 ms | 0,80 à 1,27 ms | 2,6 à 4,5 ms | 5,0 à 15,1 ms |
| 1 500 personnes, caméra au sol (16 proches, 405 moyennes, 1 071 lointaines) | 484 | 0,70 ms | 0,98 à 1,13 ms | 2,9 à 4,0 ms | 5,6 à 5,9 ms |
| 300 personnes, qualité bas | 58 | 0,10 ms | 0,21 ms | 0,8 à 0,9 ms | 2,0 à 4,3 ms |
- L'objectif de 4 ms est tenu en médiane et en moyenne ; les p95 et max reflètent surtout la préemption de la VM.
- Avant l'étalement des recalculs, une image posant les 1 500 personnes d'un coup a coûté 3,6 ms (une seule mesure).
- Sous vitest, 6,6 à 8,8 µs de temps processeur par pose complète ; ce chiffre est gonflé par l'indirection des imports de vitest et ne vaut que comme garde-fou.

APPELS DE DESSIN
- Scène entière du banc d'essai (sol, personnages, objets, passe d'ombre) : 15 vue de haut, 17 vue du sol, 8 pour 300 personnes en qualité basse.
- Module seul : 9 au plus hors ombres (3 niveaux de détail, 1 ombre de contact, 4 familles d'objets opaques, 1 transparente), plus 6 au plus en passe d'ombre.

GÉOMÉTRIE
- Par personnage : 6 197 sommets / 9 048 triangles (proche), 2 621 / 3 916 (moyen), 243 / 390 (lointain).
- Foule de 1 500 en qualité haut : 3,5 millions de triangles soumis par image, ombres comprises. Les pièces non portées sont rejetées en tête de vertex shader, après une ou deux lectures de texture.
- Texture de poses : 36 texels RGBA32F par personne, renvoyée en entier chaque image (1,2 Mo pour 2 048 emplacements ; texSubImage2D ≈ 0,4 ms au profil).

NON MESURÉ
Le temps GPU sur du matériel réel. Seul le rendu logiciel SwiftShader était disponible, à environ 2 s par image pour la foule ; les objectifs de 60 images/s sur PC et de 300 personnages sur téléphone ne sont donc pas démontrés côté GPU.

## Non fait / fragile

- Performance GPU non mesurée sur du matériel réel : seul SwiftShader était disponible. Les 3,5 millions de triangles par image en qualité haut (ombres du niveau moyen comprises) sont à valider sur un GPU intégré ; si c'est trop, passer castLevels de 2 à 1 pour « haut » dans quality.ts.
- Signes de Vehicle.pitch et Vehicle.roll supposés (pitch > 0 = nez levé, roll > 0 = penché à droite), et SeatDef.y pris comme hauteur d'assise. Vérifié seulement avec des véhicules factices du banc d'essai, pas avec le vrai module véhicules.
- Sémantique de Person.gas supposée : j'applique gasProtection avant le seuil de toux. Si la simulation l'applique déjà, la toux se déclenchera un peu plus tard pour les personnes protégées.
- Jamais lancé dans le vrai jeu : render/base, sim/people et sim/items n'étaient pas disponibles. Le module tourne dans un faux contexte qui reproduit le cycle createSystems → provide → init → frame.
- Vue à la première personne : bras et objet seulement, pas de jambes ni de buste quand on regarde vers le bas. La visière baissée du joueur n'est pas dessinée (laissée à ViewApi.setScreenEffect). La compression de profondeur anti-traversée des murs est désactivée si le renderer utilise logarithmicDepthBuffer ou reversedDepthBuffer. Le mégaphone occupe une grande partie du bas de l'écran.
- Vêtements et accessoires rigides : le manteau et la jupe peuvent traverser les cuisses en grande foulée ; la banderole et le drapeau ne flottent pas ; chaque porteur de banderole a son propre panneau de 1,84 m, il n'y a pas de banderole continue tenue à plusieurs.
- Mains sans doigts, visage figé, pas de sang ni de marque de blessure. La flamme du cocktail Molotov n'est qu'une forme colorée non émissive.
- Brancard : simple modèle tenu d'une main, le portage à deux n'est pas géré. Personne portée : une seule pose, sur l'épaule droite. La planche de détail « drag » du banc d'essai superpose les victimes (défaut de mise en page du banc, pas du module).
- Transparence du bouclier et des visières sans tri par instance (depthWrite désactivé) : l'ordre de mélange entre boucliers superposés est approximatif.
- Un changement à l'intérieur de look.extras n'est pas détecté : il faut remplacer l'objet extras ou appeler invalidate(id).
- Les galons sont de simples barres sur une plaque de poitrine, la couleur n'est pas distinguée (or pour la gendarmerie). Le code de groupe (« 1C ») et le RIO cités par la recherche ne sont pas affichés.
- La suite e2e complète dure 20 à 25 minutes sur cette machine ; elle accepte un filtre (node tests/e2e/people.mjs tenues, poses, detail-, foule, fps ou mesure).

## Demandes d'évolution du contrat

- PersonLook : ajouter des champs typés pour ce que je lis aujourd'hui dans extras — helmetColor, bandColor, gloves, packColor, coverColor, jacket (0/1/2), shortSleeves, shorts, skirt, beard, scarf, goggles — ou documenter ces clés d'extras dans contracts.ts.
- Person.gas : préciser si la valeur est avant ou après application de gasProtection. Le rendu suppose « avant » et applique gas × (1 − 0,9 × gasProtection) pour décider de la toux.
- Vehicle.pitch et Vehicle.roll : documenter la convention de signe. SeatDef.y : préciser s'il s'agit de la hauteur de l'assise (hypothèse du rendu) ou d'un autre repère. Préciser aussi qui écrit x, z et posture des occupants ; le rendu les recalcule lui-même à partir du siège.
- ItemDef : ajouter l'instant d'effet de l'animation d'usage (par exemple useTime en secondes), pour que simulation et rendu s'accordent sur le lâcher du projectile (0,42 s pour throw) et l'impact (0,28 s pour strike, 0,26 s pour kick).
- ItemDef.heldModel : lister dans le contrat les clés de modèles connues (voir publicApi), ou préciser que la clé par défaut est l'identifiant de l'objet.
- Texte porté par les pancartes et banderoles : aucun champ du contrat ne le transporte. Je l'expose par le service 'peopleRender'.setHeldText(personId, texte) ; un champ dédié (par exemple Person.signText ou ItemStack.label) serait plus propre.
- PlayerState : préciser quels modes de caméra doivent masquer le corps du joueur. Le rendu masque en 'fps' (bras visibles), 'vehicle_int', 'turret' et 'viewfinder'.
- Person.carrying / heldBy : documenter que upper = 'carry_person' ou 'drag' chez le porteur détermine la façon de dessiner la personne tenue, ou ajouter un champ explicite de mode de portage.
- PersonLook.rankBars : un simple nombre ne permet pas de distinguer chevrons, barrettes et couleur (argent police, or gendarmerie) ; un champ rankStyle serait utile.
- ViewApi : préciser que view.world est un groupe à transformation identité (le rendu des personnages le suppose pour son origine locale de précision), et l'ordre relatif entre la mise à jour de la caméra et les systèmes d'ordre VIEW.

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/render/people, tests/unit/people-render.* ; harness/people.ts vérifié avec un tsconfig temporaire (0 erreur). Les erreurs restantes sont dans des fichiers d'autres contributeurs.
- npx vitest run tests/unit/people-render : 7 fichiers, 32 tests réussis. Couvrent : proportions au repos, aucun NaN sur environ 60 000 combinaisons posture × animation × vitesse, longueur des os constante, IK des bras au millimètre, symétrie gauche/droite de la marche, cadence × foulée = vitesse, pied d'appui immobile (moins de 1,5 mm de glissement par image), continuité lors des changements d'animation (moins de 0,22 m par image) et de posture (moins de 0,12 m), téléportation ignorée, piétinement en pivotant, priorité des états, apparence (masques, palette, signature), registre, géométries, bras à la première personne, placement en véhicule et porté/traîné, branchement headless.
- node tests/e2e/people.mjs (suite complète de l'instant, Chromium headless, SwiftShader) : code de sortie 0, aucune erreur de page ni de compilation de shader, 71 captures. Ajoutés ensuite et lancés séparément avec succès : la capture de nuit (tenues-nuit) et la vue de détail avec setHeldText. Après les derniers changements de code (setHeldText, atlas à 32 lignes), seuls tenues-face-1, fps-baton-none et foule-300 ont été relancés (OK) ; la suite complète n'a pas été rejouée dans son état final.
- Captures regardées dans /home/user/SafeDeal/crs-simulation/tests/e2e/out/people-*.png : tenues de face et de dos (CRS à bandes jaunes, gendarme à casque bleu, BRAV-M à casque de moto, policier en civil à brassard orange, écharpe tricolore, pompier, SAMU, black bloc, gilet fluo, chasuble syndicale, street medic, presse, observateur, civils) ; POLICE, CRS, GENDARMERIE, PRESSE, UNION, SAPEURS-POMPIERS lisibles dans le dos.
- Captures regardées : 17 planches de détail couvrant les 7 postures et toutes les animations sous trois angles (lancer et coup de bâton à trois instants), marche de profil (9 allures), niveaux moyen et lointain vus de près, occupants d'un fourgon et d'une moto avec repères d'os de l'API, nuit avec lampe ponctuelle et ombres.
- Captures regardées : foule de 1 500 vue de haut et du sol, 300 personnes en qualité basse au format téléphone, et 18 vues à la première personne (bâton, frappe, bouclier porté et levé, LBD, Cougar, grenade et lancer, gazeuse, mégaphone, pistolet, téléphone, mains en l'air, radio, extincteur).
- Itérations faites après examen des captures : albédo plancher (les tenues étaient noires sans modelé), bavolet, mains, jambières, ourlets de chasuble et de blouson, chemise du costume, orientation des pancartes, trajectoire du coup de bâton, position du thorax virtuel à la première personne.
- Profil CPU de la page foule par le protocole DevTools : les fonctions du module totalisent environ 1,3 ms par image sur cette machine ; le profil a révélé un getParameter coûteux dans le banc d'essai (corrigé) et l'absence d'étalement des recalculs de pose (corrigé).

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/render/people/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/api.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/renderer.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/meshes.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/shader.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/quality.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/placement.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/animator.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/pose.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/poseparams.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/gait.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/upper.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/solve.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/fp.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/skeleton.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/mathx.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/geo.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/body.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/wear_head.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/wear_body.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/parts.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/look.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/atlas.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/held.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/held_police.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/held_protest.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/held_misc.ts
- /home/user/SafeDeal/crs-simulation/src/render/people/models.ts
- /home/user/SafeDeal/crs-simulation/harness/people.html
- /home/user/SafeDeal/crs-simulation/harness/people.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/people.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.pose.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.animator.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.look.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.fp.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.placement.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.system.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people-render.perf.test.ts
