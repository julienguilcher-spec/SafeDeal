# Compte rendu — rendu:mobilier-vitrines

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le rendu du mobilier urbain, des vitrines et des barricades est écrit, exécuté et vérifié à l'image : 26 fichiers dans src/render/props/ (≈ 7 270 lignes), un banc d'essai, un test de bout en bout (32 captures + contrôle d'intégration + 4 mesures, terminé « OK » sur le code final) et 5 fichiers de tests unitaires (55 tests verts). `npx tsc --noEmit` : aucune erreur dans mes fichiers (contrôle --noUnusedLocals propre aussi) ; contracts.ts et extensions.ts non touchés ; aucun import d'un autre module (les services facultatifs sont décrits par des interfaces locales dans api.ts).

Principe retenu (pour tenir « des milliers d'objets, ≤ 70 appels, rien par image ») : la rue est découpée en morceaux de 128 m ; chaque morceau est UN maillage fusionné (un appel de dessin) contenant ses objets et ses devantures au niveau de détail voulu par la distance et la qualité. Quand un objet change (événement ou relecture par tranches des listes), seule sa plage de sommets est réécrite et renvoyée à la carte graphique. Trois lots globaux d'un appel chacun s'y ajoutent : objets en mouvement (poussés, portés), verre et décalcomanies fondues (vitres d'abribus, sac des corbeilles, suie des façades), halos et taches de lumière instanciés. Un seul matériau opaque : couleurs par sommet, atlas canvas unique, attribut d'effet par sommet (lanternes, intérieurs éclairés la nuit, écrans, cycle des feux tricolores calculé par le shader, lueur d'incendie vacillante, clignotant, faux reflets de vitrine).

Les 8 exigences :
1. GameSystem unique (id 'render.props', ordre VIEW) exporté par createSystems ; suit prop:spawned / removed / damaged / moved, shop:window / shutter / looted, fire:started / fire:out, barricade:built et les événements libres de la simulation ; relit en plus les listes par tranches (vitrines sans événement, changements sans événement comme les tags). Les gestionnaires d'événements ne font que noter un identifiant : tout le travail attend frame().
2. Modèles procéduraux à l'échelle pour les 39 PropKind du contrat (38 modèles + la barricade, qui est un assemblage), types de la carte et type inconnu compris ; 3 niveaux de détail chacun, variantes de couleur (couvercles des bacs, vélo mécanique / électrique, 3 trottinettes, 4 panneaux…).
3. États : intact, endommagé, cassé (mobilier fixe plié ou déversé, vitrages éclatés panneau par panneau avec dents de verre et éclats au sol), renversé (couché selon la boîte de collision que la simulation lui donne), en feu (lueur sur l'objet, halo, tache au sol, vraie lumière si disponible — pas de flammes, c'est le module d'effets), calciné (plastique fondu en flaque, cadres vrillés sans pneus ni selle, bois effondré, suie), tagué, porté (soulevé, ou basculé sur ses roues).
4. Barricades : tas construit à partir de la composition réelle (barricadeParts de 'props.ext') — bacs couchés, barrières dressées de biais, palettes calées, vélos et mobilier de terrasse jetés par-dessus, gravats ; versions en feu et calcinée ; composition synthétique déterministe quand la simulation n'en fournit pas.
5. Devantures à la position, au cap et à la largeur de chaque Shop : encadrement, baies et porte, vitrine à reflets avec étalage peint par catégorie (14 étalages), bandeau portant le nom d'enseigne fictif (mise en page sur une ou deux lignes, cellules d'atlas attribuées à la demande, 72 simultanées), store banne, croix de pharmacie clignotante, carotte de tabac, enseigne d'hôtel ; états intacte, taguée, fissurée, brisée, panneaux de bois, rideau baissé progressivement (61 positions, suivi image par image quand il bouge), forcé, pillée, en feu, calcinée ; vitrine et enseigne éclairées la nuit, lumière qui déborde sur le trottoir.
6. Nuit : lanternes émissives, halos à taille apparente minimale (visibles au loin), taches de lumière au sol qui épousent la pente — le tout à coût fixe (1 appel) ; vraies lumières pour les candélabres et les feux les plus proches via 'render.lights' s'il existe ; feux tricolores et répétiteurs piétons en cycle de 60 s, axes perpendiculaires en opposition.
7. Budget tenu (voir mesures) ; aucune mise à jour par image hors relecture d'une tranche des listes.
8. Banc d'essai harness/props.html (planche, devantures, rue, barricade, masse, atlas, jeu intégré) et tests/e2e/props.mjs ; tests unitaires.

Écart assumé avec la consigne « non dormants » : par défaut un objet ou une vitrine endormi reste dessiné, mais seulement en version lointaine (sinon mobilier, devantures et lanternes disparaîtraient d'un coup à 260 m, limite d'éveil de la simulation). `dormantMode = 'masque'` rétablit la lecture stricte de la consigne en une ligne.

Trois défauts réels trouvés par mes propres vérifications et corrigés : les taches de lumière au sol étaient invisibles (faces éliminées) — vu sur une capture de nuit sans vraies lumières ; une clé de données comme « __proto__ » faisait planter la recherche de modèle — trouvé par test unitaire ; le plastique fondu d'une barricade calcinée se dressait à la verticale — vu sur capture.

## API publique et mode d'emploi

BRANCHEMENT (à faire par l'intégrateur, main.ts non touché) : `import { createSystems } from '@/render/props'; game.addModule(createSystems)` — de préférence APRÈS le rendu de base (même ordre VIEW : ses uniformes de l'image sont alors à jour). Un seul système, id 'render.props', order = SystemOrder.VIEW, sans update(). Sans ctx.view (headless) il ne fait rien ; si ctx.view arrive plus tard, le moteur est créé à la première frame().

SERVICE PUBLIÉ : ctx.service<PropsRenderApi>('propsRender') (constante PROPS_RENDER_KEY, types dans src/render/props/api.ts)
- stats : props, shops, chunks, builtChunks, dynamic, halos, lights, drawCalls, shadowCalls, triangles (comptés au dessin, image précédente), cpuMs / cpuMsAvg / cpuMsMax, rebuilds, rewrites, rebuildMs, models, signs, atlasUploads.
- dormantMode : 'lointain' (défaut : endormis dessinés en version lointaine) | 'masque'.
- invalidate() : reconstruit tout ; resetPeak().

CE QUE LE MODULE LIT (jamais écrit) : ctx.props.list (kind, x, y, z, heading, halfX, halfZ, height, state, toppled, tags, carriedBy, movable, dormant), ctx.props.shops (name, category, x, y, z, heading, width, window, shutter, stock, burning, dormant), ctx.env.state (streetLights, isNight, daylight), ctx.world.heightAt (pente des taches de lumière), ctx.view (scène, caméra, world, quality, drawDistance, renderer).

SERVICES FACULTATIFS (formes locales dans api.ts, compatibles avec les vrais) :
- 'props.ext' : propView(prop).panesLeft, shopView(shop).{hasShutter, forced, boards, tags, burnt}, barricadeParts(id). Sans lui : vitrages déduits de l'état, boutique calcinée déduite (a brûlé + stock nul), rideau jamais « forcé », barricade synthétique.
- 'render.lights' : point() — jusqu'à 2 / 4 / 6 / 8 candélabres (80 cd, portée 26 m) et 1 / 2 / 3 / 4 feux (22 à 70 cd, vacillants ; ×0,05 en plein jour) selon la qualité, rendus à dispose().
- 'render.uniforms' : uNight, uStreetLights, uSkyColor ; sinon lissage maison d'après ctx.env.

ÉVÉNEMENTS ÉCOUTÉS : prop:spawned, prop:removed, prop:damaged, prop:moved, barricade:built, shop:window, shop:shutter, shop:looted, fire:started, fire:out, settings:changed ; libres : 'props:glass', 'props:shutter_forced', 'props:barricade_extended', 'props:barricade_cleared'. Aucun événement émis.

CONVENTIONS À CONNAÎTRE
- Modèle : origine au sol au centre de l'emprise, +z = avant (cap), halfX sur l'axe x local ; candélabre : crosse vers +z (chaussée), lanterne piétonne vers -z ; feu tricolore : feux vers +z, répétiteur piéton vers +x.
- Renversement : déduit de la boîte de collision (la demi-dimension égale à hauteur/2 donne l'axe de chute) ; le sens est tiré de l'identifiant.
- Devanture : repère x le long de la façade, z = normale sortante ; hauteur fixe 3,36 m (soubassement, vitrine jusqu'à 2,60 m, bandeau 0,60 m, corniche) ; saillie 2 à 16 cm, store banne jusqu'à 1,45 m, débris sur le trottoir jusqu'à 1,9 m ; rien derrière z = 0.
- Aspect stable : habillage d'une boutique et variante de couleur d'un objet sont tirés de la POSITION, pas de l'identifiant (inchangés quand une tuile est rechargée).
- Niveaux par morceau (distance au carré de 128 m) — bas : jamais de détaillé, moyen < 50 m, lointain < 140, limite 300 ; moyen : 20 / 95 / 220 / 450 ; haut : 38 / 150 / 320 / 600 ; ultra : 60 / 210 / 430 / 700 ; borné par ctx.view.drawDistance ; hystérésis 12 %. Petits objets masqués au-delà du niveau moyen, moyens au-delà du lointain. Ombres portées : morceaux détaillés seulement (ultra : + moyens), aucune en « bas ».
- Qualité « bas » : matériau Lambert, découpe franche, atlas 1024 ; sinon Standard, découpe hachée (alphaHash), atlas 2048.

BANC D'ESSAI : /harness/props.html?view=planche&page=1..6[&moitie=1|2][&rang=n&col=n] | devantures&page=1..3 | rue[&cam=haut|emeute|carrefour|droite] | barricade[&cam=avant|feu|apres] | masse&n=3000[&cam=sol][&mesure=300] | atlas | jeu[&boutique=n] ; options &nuit=1, &qualite=bas|moyen|haut|ultra, &lumieres=0 (sans 'render.lights'), &ext=0 (sans 'props.ext'), &pas=0.033.
TEST : `node tests/e2e/props.mjs [filtre | tout]` ; une vue à la demande : `node tests/e2e/props.mjs libre "view=rue&nuit=1" nom`. Captures dans tests/e2e/out/props-*.png. Unitaires : `npx vitest run tests/unit/props-render`.

Exports utiles de index.ts : createSystems, PropsRenderer, MODEL_KEYS, modelFor(kind), kindInfo(kind), clés de service.

## Mesures

Chromium headless, WebGL logiciel, machine partagée (charge 14 à 22 sur 4 cœurs). Coût CPU mesuré SANS rendu, par lots de 20 images (l'horloge du navigateur est arrondie à 0,1 ms) ; appels et triangles comptés au dessin.

Vue d'ensemble de 3 000 objets + 420 devantures, 36 morceaux, ≈ 2 270 halos :
- haut, vue aérienne : 25 appels de dessin, 0 en passe d'ombre, 87 286 triangles ; repos : médiane 0,040 ms/image, moyenne 0,113 ms ; rafale de 6 changements par image (3 états, 2 déplacements, 1 rideau) : moyenne 0,83 ms, max 4,0 ms ; caméra en mouvement (18 puis 108 km/h) : moyenne 0,14 ms, p95 0,7 ms, max 4,9 ms.
- haut, de nuit : 25 appels, 91 176 triangles ; repos médiane 0,040 ms ; rafale moyenne 2,2 ms avec une pointe isolée à 27,6 ms (non reproduite sur les autres passes : bruit de la machine ou première construction de variantes, je ne peux pas trancher).
- haut, au sol : 20 appels + 4 en passe d'ombre, 158 457 triangles ; repos médiane 0,040 ms ; caméra en mouvement max 6,1 ms.
- bas : 11 appels, 0 ombre, 21 689 triangles ; repos médiane 0,040 ms, moyenne 0,128 ms ; rafale 0,80 ms ; caméra en mouvement moyenne 0,12 ms, max 3,9 ms.
Budget demandé ≤ 70 appels : maximum observé 30 (26 + 4) sur toutes les vues.

Autres scènes : rue d'essai (174 objets, 46 devantures) : 7 à 9 appels + 4 à 7 en ombre, ≈ 36 000 triangles ; en « bas » : 8 appels, 13 947 triangles. Jeu intégré (vrai rendu de base, vraie simulation, quartier d'essai, nuit) : 778 objets et 168 vitrines suivis, 17 appels + 4 en ombre, 37 840 triangles, 3 vraies lumières.

Coûts ponctuels : première image (tout construire) 185 à 260 ms pour les 3 000 objets, 75 à 125 ms pour la rue ; reconstruction d'un morceau très dense (83 objets + 12 devantures, 5 fois la densité réelle de Paris) au niveau moyen : 4,7 ms ; morceaux lointains : 0,1 à 0,2 ms. Modèles intacts préparés en arrière-plan (≤ 0,8 ms par image pendant ≈ 2 s). Budget de reconstruction : 3,5 ms par image, au moins un morceau.

Géométrie (test unitaire) : moyenne par objet < 700 triangles en détaillé, < 300 en moyen, < 80 en lointain ; devanture lointaine ≤ 24 sommets. Atlas : une texture 2048² (1024² en bas), 72 cellules d'enseigne de 512 × 64.

Non mesuré : coût GPU réel, temps d'envoi de l'atlas quand une enseigne est peinte, comportement sur un vrai téléphone.

## Non fait / fragile

- Module non branché dans main.ts (rôle de l'intégrateur) et jamais vu AVEC les immeubles : l'alignement des devantures sur les vraies façades n'est pas vérifié. La devanture a une hauteur fixe de 3,36 m alors que le rez-de-chaussée des immeubles fait 2,8 à 6,5 m : au-dessus du bandeau, c'est la façade de l'immeuble qui se voit
- Écart avec la consigne « non dormants » : par défaut les objets et vitrines endormis restent dessinés en version lointaine (dormantMode = 'masque' pour la lecture stricte)
- Feux tricolores : cycle par défaut calculé par le shader, NON synchronisé avec la simulation de la circulation (aucun état de feu n'est exposé par objet)
- Flammes et fumée non dessinées (module d'effets) : un objet en feu n'a ici que sa lueur ; l'intensité des feux de nuit a été réglée à l'œil dans le banc d'essai, où elle sature encore le sol autour d'une barricade — à recaler avec le vrai rendu de base et le module d'effets
- Découpe hachée (qualités moyenne et plus) : grillages, filets, graffitis et dents de verre vus de loin deviennent une trame de points visible ; le sol noirci sous une barricade a le même grain
- Reflets des vitrines : faux environnement calculé (ciel, façades, éclats de lampes), pas de vrai reflet de la rue
- Aspect mouillé sous la pluie non appliqué au mobilier (applyWetness du rendu de base non utilisé)
- Renversement : le SENS de la chute n'est pas connu (seul l'axe se déduit de la boîte), il est tiré de l'identifiant ; un objet fixe « cassé » est plié sur place, toujours vers le même côté
- Objet porté : simplement soulevé de 0,62 m devant le porteur (ou basculé sur ses roues), sans accord avec les mains du personnage
- Enseignes : 72 noms lisibles à la fois ; au-delà, et au niveau lointain, le bandeau porte un faux texte. Peindre une nouvelle enseigne renvoie tout l'atlas à la carte graphique (coût non mesuré)
- Un seul modèle de candélabre (mât à crosse de 9 m) et un seul modèle par type ; kiosque, sanisette et statue sont des approximations ; la borne de la station de vélos (2 m) dépasse volontairement la boîte de collision (1,2 m)
- Fichiers au-delà des ~600 lignes demandées : renderer.ts 718, geo.ts 653 ; harness/props.ts 728
- Mesures prises sur une machine très chargée en WebGL logiciel : coût CPU fiable, coût GPU et tenue sur téléphone non mesurés ; une pointe isolée de 27,6 ms pendant une rafale de changements de nuit reste inexpliquée
- Avec plusieurs cascades d'ombre dans le rendu de base, chaque morceau proche coûte un appel par cascade : j'ai limité la projection aux morceaux détaillés, mais le total d'appels en jeu dépend d'un réglage que je ne lis pas
- Aucun commit effectué (un autre processus enregistre les fichiers automatiquement)

## Demandes d'évolution du contrat

- GameEvents : ajouter 'shop:spawned' / 'shop:removed' { id } — sans eux le rendu relit ctx.props.shops par tranches pour découvrir les vitrines
- Shop : faire entrer dans le contrat forced (rideau forcé), burnt (boutique calcinée), tags et hasShutter, aujourd'hui lisibles seulement par shopView() de 'props.ext'
- Prop : exposer panesLeft (vitrages intacts) dans le contrat, et officialiser 'props:glass' { id, panesLeft, byId }
- BarricadePart (src/sim/props/api.ts) : ajouter toppled et le sens de la chute ; de même exposer sur Prop la direction de renversement — le rendu ne peut déduire que l'axe, pas le sens
- Feux tricolores : exposer l'état courant d'un feu (rouge / orange / vert, piétons) par objet 'feu_tricolore' ou par nœud du graphe, pour que l'affichage suive la simulation de la circulation
- Shop ou MapShopInfo : ajouter la hauteur du rez-de-chaussée de l'immeuble (groundFloorHeight, de buildingFacadeLayout) pour dimensionner la devanture
- Prop.dormant et Shop.dormant : préciser dans le contrat si un objet endormi doit être masqué ou peut rester dessiné en version simplifiée
- ViewApi ou 'render.base' : exposer la distance d'ombre et le nombre de cascades, pour borner les appels de dessin de la passe d'ombre
- Prop et Shop : un champ de graine visuelle stable (variante de couleur, habillage) indépendant de l'identifiant — je la tire aujourd'hui de la position

## Vérifications exécutées

- npx vitest run tests/unit/props-render : 5 fichiers, 55 tests verts (dernière passe sur le code final)
- npx tsc --noEmit : aucune erreur dans src/render/props ni tests/unit/props-render.* (6 erreurs restantes, toutes dans tests/unit/incidents.perf.test.ts, d'un autre contributeur) ; banc d'essai vérifié avec un tsconfig temporaire, --noUnusedLocals et --noUnusedParameters propres
- node tests/e2e/props.mjs sur le code final : 32 captures + contrôle d'intégration + 4 mesures, « [props] OK », zéro erreur de page ou de console, aucun nouvel essai nécessaire
- Captures REGARDÉES avec Read et corrigées par itérations : planches 1 à 6 (tous les types dans tous leurs états avec la silhouette de 1,80 m), gros plan de la corbeille (cerclage, sac transparent, déchets), devantures pages 1 à 3 de jour et 1 à 2 de nuit, rue (trottoir, vue haute, scène d'émeute, carrefour de nuit, nuit sans vraies lumières, qualité basse), barricade (ensemble, avant, en feu de nuit, calcinée), vue de 3 000 objets (jour, nuit, sol), atlas, jeu intégré de jour et de nuit
- Tests unitaires — correspondance : les 39 PropKind du contrat ont chacun leur modèle ; type inconnu et clés pièges (__proto__, constructor) → modèle générique ; alias de carte ; gabarits identiques au magasin du cœur ET à la simulation du décor (dimensions, renversement, port, nombre de vitrages) ; tout ce qui brûle dans la simulation a une façon de brûler dans le rendu
- Tests unitaires — niveau de détail : seuils par qualité, monotonie avec la distance et avec la qualité, hystérésis, caméra haute, borne de drawDistance, NaN, objets endormis, découpage en morceaux
- Tests unitaires — enseignes : une ligne au plus grand corps, deux lignes équilibrées, réduction avant coupure, troncature par « … » signalée, aucune ligne hors cellule pour 16 noms réalistes en capitales et minuscules ; habillage déterministe et lisible (écart de luminance) pour 15 catégories ; régions d'atlas sans chevauchement ; attribution des cellules (partage, cache, reprise de la plus ancienne, saturation)
- Tests unitaires — modèles : chaque type aux 3 niveaux et dans les 5 états sans défaut de maillage (indices, normales unitaires, textures dans l'atlas) ; modèles à l'échelle de leur boîte de collision ; chaque niveau plus léger que le précédent ; bac fondu affaissé et étalé ; vélo calciné sans pneus, vrillé, noir ; vitres d'abribus qui éclatent une à une ; lanterne éteinte quand cassé ; objet couché dans la boîte que lui donne la simulation ; rideau de fer qui descend progressivement ; lumières des devantures
- Test unitaire — système en headless : service publié, statistiques vides, événements et nouvelle session sans exception, la simulation n'est pas modifiée
- Contrôle d'intégration (harness view=jeu) avec les VRAIS modules render/base, world/query et sim/props sur le quartier d'essai : 778 objets et 168 vitrines suivis sans erreur, noms d'enseigne de la simulation affichés, rideaux baissés la nuit, halos allumés par les uniformes du rendu de base, 3 vraies lumières obtenues de 'render.lights'
- Vérifié sans 'render.lights' (&lumieres=0) : halos et taches au sol seuls éclairent la rue ; grep : aucun Math.random, TODO, ni import hors '@/core/*' et three dans src/render/props
- git diff sur src/core/contracts.ts et src/core/extensions.ts : aucune modification

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/render/props/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/api.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/renderer.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/chunkstore.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/records.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/assemble.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/slotmesh.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/lighting.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/halos.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/material.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/mapping.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/placement.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/meshbuf.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/geo.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/models.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/models-a.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/models-b.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/models-c.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/palette.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/shopfront.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/signtext.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/atlas.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/atlas-layout.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/atlas-paint.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/atlas-paint-posters.ts
- /home/user/SafeDeal/crs-simulation/src/render/props/atlas-paint-shops.ts
- /home/user/SafeDeal/crs-simulation/harness/props.html
- /home/user/SafeDeal/crs-simulation/harness/props.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/props.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/props-render.mapping.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props-render.lod.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props-render.enseignes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props-render.modeles.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props-render.systeme.test.ts
