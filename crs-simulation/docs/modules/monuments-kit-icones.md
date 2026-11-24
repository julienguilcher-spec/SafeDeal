# Compte rendu — monuments:kit+icônes

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le kit de modélisation des monuments, le système d'affichage et les sept premiers monuments sont livrés, exécutés et vérifiés sur captures (jour, nuit, piéton, silhouette). Le kit (src/world/monuments/kit/) fournit une trentaine de matériaux partagés à textures sur canvas (pierre de taille et bossages en plusieurs teintes, calcaire patiné, marbres, granit, zinc, plomb, ardoise, bronzes, dorure, fonte, treillis et grilles à découpe alpha, eau, jets, caissons, bas-reliefs, hiéroglyphes, inscriptions ; le verre est une teinte unie) et les pièces demandées : colonnes des trois ordres, pilastre, arcs et arcades à voûte à caissons, archivolte, fronton, entablement/corniche/bandeau extrudés le long d'une polyligne avec onglets, balustrade, grille, dôme nervuré à lanternon, flèche, escalier, emmarchements, socles, bassin/vasque/jets, statuaire articulée (personnages, cheval, quadrige, lion, aigle, coq, groupe en haut-relief), panneau de bas-relief. Un Builder fusionne tout par matériau (un appel de dessin par matériau). buildPalaceFromFootprint / addPalace habille une emprise quelconque (sens indifférent, cours intérieures) : façade peinte par travées entières, plinthe, bandeau et corniche extrudés, balustrade, comble à la Mansart à lucarnes, pavillons d'angle ; quatre emprises d'essai avec quatre styles font 4 292 triangles et 8 appels au total. Le système (GameSystem, order WORLD_VIEW, ne dépend que de ctx) pose chaque repère à heightAt avec son cap, affiche le modèle détaillé près de la caméra et la silhouette au loin avec hystérésis, construit au plus un modèle détaillé par passe, libère les géométries hors de portée, et gère l'illumination nocturne (émission chaude ombrée « projecteurs ») ainsi que le scintillement de la Tour pendant les cinq premières minutes de chaque heure la nuit, y compris sur la silhouette. Les sept monuments respectent les dimensions réelles principales, relues sur Wikipédia (Arc 49,54 × 44,82 × 22,21 m avec arches traversantes ; Tour 330 m, écart intérieur 74,24 m, planchers à 57,63 / 115,73 / 276,13 m ; obélisque 33,37 m ; Vendôme 44,3 m ; Juillet 50,3 m ; République 25 m) ; les niveaux intermédiaires et le bassin des fontaines (≈ 17 m) sont mes estimations. Tous sont très en dessous des budgets : au plus 25 050 triangles et 8 appels pour la Tour, 15 880 et 8 pour l'Arc, silhouettes de 26 à 316 triangles. Les obstacles (collide/, données pures) laissent passer sous l'Arc et sous la Tour, et un test vérifie l'absence d'import de three par transitivité. Le module n'a pas été branché dans le vrai jeu (main.ts, landmarks.json réels) : seulement dans le banc d'essai avec un contexte factice.

## API publique et mode d'emploi

CÂBLAGE (intégrateur)
- `import { createSystems } from '@/world/monuments'` → un GameSystem `id: 'monuments'`, `order: SystemOrder.WORLD_VIEW`. Il lit ctx.world.landmarks / heightAt, ctx.view (world, camX/camZ, quality, drawDistance), ctx.env.state (daylight, timeOfDay) et l'événement 'settings:changed' (clé 'quality' → reconstruction). Sans effet en headless.
- Service `ctx.service<MonumentsApi>('monuments')` (types dans src/world/monuments/api.ts) : `has(clé)`, `keys()`, `collidersOf(landmark)`, `stats()`, `prewarm(clés?)`. `prewarm` est à appeler pendant l'écran de chargement : la première construction génère les textures (175 à 450 ms mesurés sous WebGL logiciel).
- Distances : détaillé si distance au bord < base(qualité : 160 / 230 / 310 / 420 m) + 2,5 × hauteur ; silhouette jusqu'à max(1,5 × drawDistance, 800 m) + 25 × hauteur (≈ 9 km pour la Tour : camera.far et le brouillard doivent le permettre) ; hystérésis × 1,14.
- world/view devrait ne pas extruder le bâti générique d'un repère pour lequel `has(clé)` est vrai.

SIMULATION (sans Three.js)
- `import { getColliders, getWorldColliders, siteOfLandmark, listColliderKeys } from '@/world/monuments/colliders'`. `getWorldColliders(landmark)` rend `{ ring: number[] (monde, antihoraire vu de dessus), height, baseY }[]` ; `baseY > 2,5` (constante PASS_UNDER_Y de types.ts) = on passe dessous. Sans fichier collide/<clé>.ts, l'emprise du repère sert d'obstacle plein.
- Convention des anneaux (shape2d.ts, identique à mapdata) : tableau plat [x0, z0, …], non refermé, antihoraire vu de dessus ⇔ aire signée > 0, normale sortante du côté a→b = (−dz, dx). Aides : rectRing, ngonRing, ensureCCW, insetRing, cleanRing, transformRing, worldRingToLocal, isSimpleRing, pointInRing.

CLÉS : arc_triomphe, tour_eiffel, obelisque_concorde, fontaines_concorde (une fontaine par repère : la carte doit fournir DEUX repères de cette clé), colonne_vendome, colonne_juillet, statue_republique. Alias dans keys.ts (dont arc_de_triomphe → arc_triomphe) ; `canonicalKey()`.

COMMENT AJOUTER UN MONUMENT (aucun registre à modifier ; rappel en tête de src/world/monuments/index.ts)
1. `src/world/monuments/defs/<clé>.ts` exporte `def: MonumentDef` = `{ key (= nom du fichier = LandmarkInfo.key), name, radius, height, build(site, quality), buildFar(site), animate?(objet, image, lointain) }`. Repère local : origine au centre au sol, y vers le haut, façade vers +z, mètres. `site.footprint` = emprise réelle en coordonnées locales (peut être vide).
2. Tout construire avec `const b = new Builder()` (import depuis '../kit') : `b.add('pierre_blonde', box(w, h, d))`, `b.with(pose(x, y, z, cap), () => column(b, { order: 'corinthien', height: 9, diameter: 0.9, mat: 'pierre_lisse' }))`, puis `return b.build('<clé>')`. Un matériau = un appel de dessin : viser ≤ 12 matériaux et ≤ 60 000 triangles. Les primitives sont posées sur y = 0 et leurs UV sont en mètres (c'est la texture qui fixe l'échelle).
3. Pièces : primitives (box, frustum, cyl, lathe, prism, sweep, loft, beam, tube, sphere, quadFit) ; classique (entablature, band, plinth, pediment, pedestal, pedestalRound, steppedBase, steppedBaseRound, stairs, balustrade, ironFence, reliefPanel, alongPath, column, pilaster, archBlock, arcade, archivolt, dome, lantern, spire) ; fontaines (basin, vasque, jetArc, jetVertical, waterfall) ; statuaire (figure / figureGeo, horse, quadriga, lionGeo, birdGeo, sculptedGroup) ; sparklePoints / updateSparkle.
4. Palais sur emprise : `addPalace(b, site.footprint, PALACE_STYLES.renaissance, { holes })` (styles classique, renaissance, sobre, neoclassique ; copier un style avec un `id` unique pour l'ajuster), puis ajouter dôme, portique, fronton. `buildPalaceFromFootprint(emprise, style)` rend directement un groupe.
5. Matériaux : clés du type `KitMat` (kit/materials.ts). Matériau propre : `defineMaterial('ma_cle', () => litMaterial('ma_cle', { …, night: 0.9 }, texture))` ; `night` = gain d'illumination nocturne, `glow` = émission permanente.
6. `buildFar` : ≤ 400 triangles, `farMaterial(couleur)`, terminer par `finishFar(b, clé)`. `quality` = 'bas' | 'moyen' | 'haut' | 'ultra' : alléger segments et statuaire en 'bas'.
7. `src/world/monuments/collide/<clé>.ts` exporte `colliders(site): MonumentCollider[]` (rectRing / ngonRing de '../shape2d', height, baseY). Aucun import de three ni du kit : un test le vérifie.
8. Vérifier dans `/harness/monuments.html?key=<clé>` (options &quality=, &night=1, &far=1, &angle=0..3 ; vitrines ?demo=kit | palais | systeme), puis ajouter la clé à KEYS dans tests/e2e/monuments.mjs et dans tests/unit/monuments.registre.test.ts (avec ses dimensions réelles) et monuments.colliders.test.ts.

## Mesures

Qualité 'haut', triangles lus dans renderer.info (Chromium headless, WebGL logiciel), monument seul, sol et ombres exclus. « Appels » = maillages produits par le Builder / appels comptés par renderer.info.
- arc_triomphe : 15 880 triangles ; 8 / 8 appels ; silhouette 144 triangles, 2 appels ; 10 232 triangles en 'bas' ; première construction 452 ms ; 47,92 × 49,54 × 27,65 m (corniche et groupes sculptés compris)
- tour_eiffel : 25 050 triangles (budget 150 000) ; 8 / 7 appels le jour (le 8e est le nuage du scintillement, masqué hors début d'heure) ; silhouette 316 triangles, 2 appels dont le scintillement ; 15 690 en 'bas', 19 290 en 'moyen' ; 215 ms ; 126,1 × 330 × 126,1 m
- obelisque_concorde : 158 triangles ; 6 / 6 appels ; silhouette 26 triangles, 2 appels ; 406 ms ; hauteur 33,37 m
- fontaines_concorde : 9 724 triangles ; 5 / 6 appels (three dessine le matériau des jets, transparent et double face, en deux passes : renderer.info compte 10 152 triangles) ; silhouette 132 triangles, 3 appels ; 7 240 en 'bas' ; 261 ms ; 17,05 m de diamètre, 9,65 m gerbe comprise
- colonne_vendome : 1 922 triangles ; 5 / 5 appels ; silhouette 65 triangles, 1 appel ; 194 ms ; hauteur 44,29 m
- colonne_juillet : 5 962 triangles ; 8 / 8 appels ; silhouette 171 triangles, 4 appels ; 175 ms ; hauteur 50,29 m
- statue_republique : 5 494 triangles ; 4 / 4 appels ; silhouette 145 triangles, 2 appels ; 310 ms ; hauteur 25,16 m
- vitrine du palais (4 emprises, 4 styles) : 4 292 triangles, 8 appels. Vitrine du kit (toutes les pièces et le nuancier) : 17 986 triangles, 33 appels.
- Système, 8 repères, qualité 'moyen' : devant l'Arc 16 458 triangles et 17 appels (1 détaillé + 4 silhouettes) ; vue d'ensemble à 900 m 1 131 triangles et 19 appels (8 silhouettes).
- Géométrie seule sous Node, sans textures : de 1 ms (obélisque) à 84 ms (Arc) par modèle ; le reste du temps de première construction est la génération des textures.
- Code : 40 fichiers dans src/world/monuments, 47 avec le banc d'essai et les tests, environ 6 900 lignes, aucun fichier au-delà de 452 lignes.

## Non fait / fragile

- Module non branché dans le vrai jeu : jamais exécuté avec main.ts, le vrai WorldQuery ni les vrais landmarks.json. Seul le banc d'essai (contexte factice, relief sinusoïdal) l'a fait tourner.
- Les obstacles ne sont pas consommés par world/query : getColliders / getWorldColliders sont fournis et testés, le câblage dans resolveCircle / raycast reste à faire par le module concerné.
- Performance mesurée uniquement sous Chromium headless à WebGL logiciel : aucune mesure d'images par seconde sur vrai GPU ni sur téléphone. La première construction d'un monument prend 175 à 450 ms, surtout pour générer les textures ; prewarm() existe pour l'écran de chargement mais n'est appelé par personne.
- Statuaire stylisée : mannequins articulés à facettes. Les quatre groupes de l'Arc sont des compositions génériques tirées au hasard par graine, pas des répliques ; les Renommées, la frise et les bas-reliefs sont suggérés par texture.
- Cotes secondaires estimées, non sourcées : niveaux de l'entablement et de l'attique de l'Arc, profil intérieur des piliers de la Tour au-dessus du sol, diamètre du bassin des fontaines (≈ 17 m), hauteurs des piédestaux, diamètres des fûts de la colonne de Juillet.
- Fontaines de la Concorde : une seule variante (pas de distinction Mers / Fleuves) ; colonnes rostrales et candélabres de la place absents.
- Arc de triomphe : les cent bornes à chaînes autour du monument et les aménagements de la terrasse ne sont pas modélisés.
- Tour Eiffel : ni ascenseurs, ni escaliers, ni détail des pavillons ; pas de faisceau du phare (seulement un feu au sommet). Le treillis fin est fait de plans à découpe alpha qui s'empâtent avec la distance. La qualité 'ultra' est identique à 'haut'.
- Passage silhouette ↔ modèle détaillé sans fondu : le changement se voit, autour de 430 m pour l'Arc en qualité haute.
- L'illumination nocturne est une émission des matériaux : aucune source de lumière réelle, donc aucun éclairement du sol ni des alentours.
- buildPalaceFromFootprint : façade peinte, plate de très près (relief par bump seulement) ; pavillons posés uniquement aux angles saillants proches de l'équerre dont les deux côtés font au moins 1,8 fois la taille du pavillon ; toit simplement borné par la largeur du corps de logis, sans squelette droit pour les emprises très découpées ; non essayé sur une vraie emprise de la carte.
- Le matériau 'verre' est une teinte unie, sans texture sur canvas.
- Pas de capture en qualité 'ultra' ni 'moyen' par monument (seulement 'haut', plus 'bas' pour l'Arc et la Tour) ; aucun essai tactile ou mobile.

## Demandes d'évolution du contrat

- Clé de l'Arc de triomphe : mapdata.ts (SUGGESTED_LANDMARK_KEYS) dit 'arc_de_triomphe', la mission dit 'arc_triomphe'. Le module accepte les deux par alias (keys.ts), mais il faudrait trancher pour tous les modules qui comparent des clés.
- LandmarkInfo.footprint ne porte qu'un anneau : impossible de décrire une cour intérieure (Cour Carrée du Louvre, Invalides, Hôtel de Ville). Ajouter par exemple `footprintHoles?: ArrayLike<number>[]`. addPalace accepte déjà `holes`.
- LandmarkInfo n'a ni variante ni indice : les deux fontaines de la Concorde doivent être deux repères de même clé et rien ne permet de distinguer Mers et Fleuves. Un champ `variant?: string` ou `index?: number` suffirait.
- WorldQuery et RayHit ne connaissent pas les obstacles en surplomb : resolveCircle / isFree / raycast n'ont pas de notion de baseY, et RayHit.height seul ne dit pas qu'un projectile ou un drone passe sous une voûte. Il faudrait préciser dans le contrat que world/query intègre getWorldColliders() en ignorant au sol les obstacles dont baseY > 2,5 m, et ajouter `baseY` à RayHit.
- ViewApi ne garantit aucune distance pour les repères lointains : la silhouette de la Tour est conservée jusqu'à environ 9 km, ce qui suppose un camera.far et un brouillard compatibles côté render/base. Un champ `landmarkDistance` (ou la garantie camera.far ≥ 10 km) lèverait l'ambiguïté.
- Aucun point d'entrée contractuel de préchauffage pendant le chargement (par exemple GameSystem.preload ou un événement 'session:loading') : prewarm() n'est exposé que par le service étendu 'monuments'.

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/world/monuments et tests/unit/monuments.*
- npx tsc --noEmit -p <tsconfig privé incluant harness/monuments.ts, le module et ses tests> --noUnusedLocals --noUnusedParameters : 0 erreur. Un premier tsconfig placé dans le scratchpad partagé avait été écrasé par un autre agent ; la vérification finale utilise un dossier privé.
- npx vitest run tests/unit/monuments : 4 fichiers, 94 tests réussis (registre et alias ; budgets en bas/haut/ultra ; dimensions réelles ; silhouettes ≤ 400 triangles ; obstacles valides et antihoraires ; passage sous l'Arc par la grande arche et les arches latérales ; passage libre de 70 à 76 m entre deux piliers de la Tour ; aucun import de three depuis collide/ par transitivité ; primitives, extrusion, triangulation, palais ; système complet avec contexte factice sans WebGL : niveaux de détail, hystérésis, libération, pose et cap, nuit, scintillement, changement de qualité, reset/dispose, prewarm)
- node tests/e2e/monuments.mjs : « [monuments] OK » (dernier passage 5 min 42 s) ; 48 captures tests/e2e/out/monument-*.png et rapport tests/e2e/out/monuments-report.json ; aucune erreur de page ni console.error
- Scénario système du e2e (8 repères dont deux fontaines) : 1 détaillé + 4 silhouettes devant l'Arc ; 2 fontaines détaillées ; nuit à 22 h 01 → night 0,99 et sparkle 1 ; à 22 h 30 → sparkle 0,04 ; à 900 m → 0 détaillé, 8 silhouettes, 1 131 triangles ; en enfilade → 4 silhouettes ; qualité basse → 16 458 puis 10 810 triangles ; remise à zéro puis repeuplement
- Captures regardées une à une avec l'outil Read pour chaque monument (trois quarts, face, piéton, nuit, silhouette), plus des vues sous la Tour, au pied d'un pilier, sous la voûte de l'Arc, les vitrines du kit et du palais, et le système de jour et de nuit. Corrections faites après lecture : scintillement invisible (points noyés dans les poutres), lucarnes cisaillées sur les versants, inscriptions de l'Arc tournées vers le mur, Renommées remplacées par des bas-reliefs d'écoinçon, couronnement de l'Arc affiné, Marianne ramenée à 9,5 m rameau compris, tritons qui dépassaient sous le sol, nappes d'eau trop opaques.
- Dimensions réelles relues sur fr.wikipedia.org (Arc de triomphe de l'Étoile, Tour Eiffel, Obélisque de Louxor, Colonne Vendôme, Colonne de Juillet, Monument à la République) ; la page des fontaines de la Concorde ne donne aucune cote
- Construction de production (vite build avec harness/monuments.html en entrée, sortie dans le scratchpad) : réussie, un fichier de 666 ko three.js compris, sans WebAssembly, Worker ni eval

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/monuments/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/types.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/api.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/system.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/registry.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/colliders.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/keys.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/shape2d.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/demos.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/geo.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/shapes.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/builder.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/canvas.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/textures.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/materials.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/classical.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/column.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/arch.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/dome.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/fountain.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/sculpture.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/facade.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/palace.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/far.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/sparkle.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/arc_triomphe.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/tour_eiffel.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/obelisque_concorde.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/fontaines_concorde.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/colonne_vendome.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/colonne_juillet.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/statue_republique.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/arc_triomphe.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/tour_eiffel.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/obelisque_concorde.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/fontaines_concorde.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/colonne_vendome.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/colonne_juillet.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/statue_republique.ts
- /home/user/SafeDeal/crs-simulation/harness/monuments.html
- /home/user/SafeDeal/crs-simulation/harness/monuments.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/monuments.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.registre.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.colliders.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.kit.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.systeme.test.ts
