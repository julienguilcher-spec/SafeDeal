# Compte rendu — monuments:ponts

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Lot « ponts » livré, exécuté et regardé sur captures : pont Alexandre III, Pont Neuf (grand et petit bras, statue d'Henri IV), palais de Chaillot (deux ailes en miroir) avec la fontaine de Varsovie, alias de la fontaine des Mers, plus les cinq chantiers du système (alias de carte, silhouettes d'horizon, service 'world.monuments', portes Saint-Denis et Saint-Martin en repères supplémentaires, corrections du kit). Tous les modèles passent par le VRAI système sur la VRAIE carte dans un banc d'essai dédié (harness/monuments-ponts.html : landmarks.json, relief, graphe routier, tuiles ; tabliers génériques, plans d'eau et relief reconstitués), et tiennent largement les budgets (au plus 40 556 triangles et 10 appels ; silhouettes 64 à 336 triangles).

Points de conception importants :
- Les ponts sont dessinés dans le repère de leur TABLIER réel (axe de l'arête du graphe, demi-largeur chaussée + trottoirs, abscisse des murs de quai, biais des rives relevés dans la carte) et suivent l'altitude et la pente du tablier lues dans le monde ; les parements sont 6 cm en avant du bandeau dessiné par la ville et les parapets enveloppent le parapet générique (aucune face coplanaire). Rien de ce qui est sous la chaussée n'est déclaré comme obstacle (la simulation est plane).
- MonumentSite reçoit désormais du système site.groundAt(x, z) (sol relatif à l'origine, tabliers compris) et site.waterY : indispensable aux ponts, à Chaillot (parvis 3,7 m au-dessus de l'ancre, jardins en pente) et à la fontaine. J'ai dû pour cela toucher types.ts et keys.ts, qui ne figuraient pas dans la liste explicite des fichiers du système (ajouts facultatifs, rétrocompatibles).
- La fontaine de Varsovie est un repère SUPPLÉMENTAIRE à part (clé fontaine_varsovie, non demandée telle quelle) plutôt qu'un morceau de palais_chaillot : elle a ainsi sa propre altitude et son propre niveau de détail.
- Silhouettes d'horizon : matériau insensible au brouillard de scène (qui efface tout au-delà de la distance d'affichage) avec voile atmosphérique propre ; au-delà de 82 % de camera.far elles sont rapprochées sur la ligne de visée et réduites d'autant.

Honnêteté : aucune recherche web n'a été faite (dossier 04 et connaissances) ; les cotes secondaires sont estimées. Rien n'a été branché ni exécuté dans le vrai jeu (main.ts). Le scénario « système » de tests/e2e/monuments.mjs échoue, pour une raison antérieure à mon lot (il attend 8 repères alors que le banc aligne les 45 définitions du registre) ; je ne l'ai pas modifié. Plusieurs doublons avec le contenu générique de la carte subsistent et demandent une intervention hors de mon périmètre (voir kitIssues).

## Non fait / fragile

- Aucune recherche web : dimensions tirées du dossier 04 et de mes connaissances ; cotes secondaires estimées (hauteurs des volumes de Chaillot, détail des pylônes, piédestal d'Henri IV, niveaux des portes)
- Rien n'est branché ni exécuté dans le vrai jeu (main.ts, vrai WorldQuery, vrai module de la ville) : seulement mon banc d'essai, qui reconstitue un monde minimal à partir des vraies données
- tests/e2e/monuments.mjs se termine en ÉCHEC sur son scénario « système » (3 conditions) : il attend 8 repères alors que harness/monuments.ts aligne toutes les définitions du registre (45 aujourd'hui). L'échec existait avant mon lot (38 définitions) ; fichiers hors de mon périmètre, non modifiés
- L'ancien banc harness/monuments.html?key=pont_… construit sans site et sur un sol plat : le dessous des ponts y est caché sous le sol. Utiliser harness/monuments-ponts.html?key=…
- Doublons non résolus avec le contenu générique de la carte : parapet et bandeau de pierre de la ville sur les ponts à clé de monument, bâtiments génériques des deux portes, du piédestal d'Henri IV et des socles des groupes dorés, mobilier « statue » aux emplacements de mes statues, volumes lointains de world/view/horizon.ts
- Les obstacles des trois repères supplémentaires ne sont pas connus de world/query (il ne lit que landmarks.json) : les portes restent des blocs pleins pour la simulation
- Chaillot : pas de terrasses, d'escaliers ni de balustrades entre parvis et jardins ; façades peintes ; fontaine de Varsovie : niveau de l'eau en constante, rendu dépendant du creusement du terrain par la ville
- Pont Alexandre III : flèche de l'arche limitée à ≈ 3 m par la hauteur du tablier de la carte ; groupes sculptés stylisés
- Captures en qualité 'haut' seulement (les tests unitaires construisent bas, haut et ultra) ; Panthéon et tour Montparnasse non regardés en gros plan ; aucune mesure d'images par seconde sur vrai GPU
- Dans mon banc, les faces rasantes des parapets montrent des bandes diagonales (acné d'ombre du banc, pas du modèle) et le relief maillé à 4 m déborde par endroits dans les bassins

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/world/monuments, tests/unit/monuments.ponts.test.ts ; second passage avec un tsconfig privé (noUnusedLocals, noUnusedParameters) incluant harness/monuments-ponts.ts : 0 erreur dans mes fichiers
- npx vitest run tests/unit/monuments : 8 fichiers, 427 tests réussis, dont les 100 de tests/unit/monuments.ponts.test.ts et les tests d'origine du système, du registre, des obstacles et des deux autres lots (aucune régression)
- Tests du lot : chaque définition se construit sur l'emprise réelle de landmarks.json en bas/haut/ultra (≤ 60 000 triangles, ≤ 12 appels, sommets finis), silhouette ≤ 400 triangles, construction sans emprise et sur relief en pente ; obstacles simples, antihoraires, dans le rayon ; tabliers des trois ponts libres d'une rive à l'autre et bordés par les parapets ; aucun obstacle sous la chaussée ; passage sous l'arche et les deux portes piétonnes de Saint-Denis, sous les trois arches de Saint-Martin (baseY > 2,5 m) ; parvis de Chaillot libre entre les deux ailes, pavillons et socles des statues pleins ; bassins de la fontaine infranchissables
- Tests d'ajustement : repère du tablier identique à la carte ; pente et altitude relues dans groundAt (relief aberrant rejeté) ; le modèle suit une emprise déplacée et tournée ; il couvre la Seine d'un quai à l'autre et plonge sous l'eau ; sept arches + cinq arches, demi-lunes seulement au droit des piles ; Henri IV sur le terre-plein (sommet 8 à 11,5 m) ; les deux ailes de Chaillot tiennent sur leur emprise et la couvrent, trois volumes dont la somme des aires égale celle de l'emprise ; fontaine à moins de 1,5 m de l'axe du palais
- Tests du système : alias de carte (fontaine_des_mers → même définition, mêmes obstacles ; registerAlias, chaînes, boucles refusées) ; repères supplémentaires fusionnés seulement dans une emprise finie qui les contient et sans doublon ; services 'monuments' et 'world.monuments' { has, covers, horizonKeys } ; site.groundAt transmis (le Pont Neuf suit un monde en pente) ; silhouettes d'horizon : 4 sur une carte de Paris, 0 dans un quartier d'essai ou sans emprise, bonne direction, rapprochement et réduction au-delà de 82 % de camera.far avec hauteur apparente conservée, voile croissant avec la distance et le brouillard, matériaux insensibles au brouillard de scène
- node tests/e2e/monuments-ponts.mjs : « [monuments-ponts] OK », 9 clés + horizon, aucune erreur de page ; rapport tests/e2e/out/monuments-ponts-report.json ; par monument : trois quarts, élévation, arrière, piéton, vues propres, nuit, silhouette (qualité 'haut')
- Captures regardées avec l'outil Read : pont Alexandre III (trois quarts, berge, pylône, piéton, nuit) ; Pont Neuf (trois quarts, berge, demi-lune, corniche, Henri IV, silhouette) ; petit bras (trois quarts) ; Chaillot (ensemble, trois quarts, parvis ×2, statues côté Passy, élévation Passy) ; fontaine de Varsovie (canons) ; portes Saint-Denis (trois quarts, face, côté) et Saint-Martin (trois quarts, face) ; horizon (Sacré-Cœur de près, la Défense depuis la Concorde)
- Corrections faites après lecture des captures : entablement des pylônes creux vu d'en dessous ; silhouette du Pont Neuf dont le dessus plein cachait la chaussée ; bandeau d'imposte barrant les arches de la porte Saint-Martin ; frise et inscription de la porte Saint-Denis agrandies ; pylône de Chaillot affiné ; cavalier d'Henri IV grandi ; socles des groupes dorés rehaussés ; silhouette du Sacré-Cœur ramenée sous 400 triangles
- Régression : node tests/e2e/monuments.mjs relancé après mes changements du kit et du système — les sept monuments d'origine sont OK avec exactement les mêmes triangles et appels qu'avant (colonne Vendôme 1 922/5, colonne de Juillet 5 962/8, République 5 494/4…), vitrines du kit et du palais inchangées (17 986 et 4 292 triangles) ; capture de l'Arc de triomphe regardée, intacte

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/pont_alexandre_iii.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/pont_alexandre_iii.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/pont_neuf.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/pont_neuf.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/pont_neuf_petit_bras.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/pont_neuf_petit_bras.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_chaillot.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_chaillot.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_chaillot_passy.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_chaillot_passy.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/fontaine_varsovie.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/fontaine_varsovie.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/fontaine_des_mers.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/fontaine_des_mers.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/porte_saint_denis.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/porte_saint_denis.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/porte_saint_martin.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/porte_saint_martin.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/x-ponts-plan.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/x-ponts-chaillot.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-ponts-pierre.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-ponts-decor.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-ponts-chaillot.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-ponts-portes.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/extra.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/horizon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/system.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/registry.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/colliders.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/keys.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/types.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/api.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/index.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/far.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/shapes.ts
- /home/user/SafeDeal/crs-simulation/harness/monuments-ponts.html
- /home/user/SafeDeal/crs-simulation/harness/monuments-ponts.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/monuments-ponts.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.ponts.test.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/out/monuments-ponts-report.json
