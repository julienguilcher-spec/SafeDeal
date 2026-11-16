# Compte rendu — monuments:palais

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Lot « palais » : les 18 monuments ont chacun leur définition, leurs obstacles et leur silhouette ; tous tiennent le budget (au plus 66 730 triangles et 12 appels pour le Louvre, 38 888 pour le Palais-Royal, moins de 28 000 pour les autres ; silhouettes de 16 à 279 triangles). Les 18 clés figurent dans landmarks.json : aucune emprise par défaut inventée.

Ce qui a été exécuté : `npx tsc --noEmit` sans erreur dans mes fichiers ; `npx vitest run tests/unit/monuments` 327 tests réussis (7 fichiers, dont mes deux fichiers : 127 tests) ; `tests/e2e/monuments-palais.mjs` a produit 150 captures et un rapport, les 18 monuments « OK ». La machine était très chargée (charge ≈ 36) : les captures ont été faites en plusieurs exécutions partielles, pas en un seul passage. J'ai regardé environ 60 des 150 captures, pas toutes.

Trois choix à connaître :
- **Repère tiré de l'emprise.** landmarks.json a changé pendant le travail (cap du Louvre passé de 244,4° à 249,0°). Les pièces posées à la main sont donc placées dans un repère calculé à partir de l'emprise elle-même, recalé sur une emprise de référence embarquée dans chaque fichier collide/. Un test vérifie que les obstacles monde ne bougent pas quand on change l'ancrage et le cap.
- **Un fichier hors de ma liste.** Le test de pureté interdit à collide/ d'importer le kit ; la géométrie plane partagée (repère, découpe de polygones, passages) est donc dans `src/world/monuments/x-palais-plan.ts`, à la racine du module.
- **Deux modèles débordent volontairement de leur emprise.** L'hôtel de Crillon porte toute la façade de Gabriel (94 m) plaquée devant les immeubles voisins ; l'Élysée porte la clôture de son jardin jusqu'à la grille du Coq.

Le module n'est toujours pas branché dans le vrai jeu : rien n'a été vu en jeu, seulement dans le banc d'essai (emprise de référence) et dans les tests unitaires (emprises réelles).

## Non fait / fragile

- Module non branché dans le vrai jeu : aucun de ces monuments n'a été vu en jeu avec le vrai monde. Le banc d'essai passe une emprise vide (donc l'emprise de référence embarquée) ; les emprises réelles ne sont exercées que par les tests unitaires, sans rendu.
- Environ 90 des 150 captures n'ont pas été regardées une à une : la plupart des vues de nuit et des silhouettes, la façade place Dauphine du palais de Justice, la vue piéton de plusieurs édifices.
- tests/e2e/monuments.mjs (existant, non modifiable) n'a pas été relancé. Son scénario « système » suppose exactement 8 repères connus : il échouera probablement maintenant que d'autres définitions sont enregistrées.
- Arc du Carrousel : arches des petits côtés non traversantes (renfoncement figuré).
- Louvre : galeries basses de la cour Napoléon à pleine hauteur, pas de statuaire, cours de l'aile Denon sans traitement propre, passages mineurs (guichet piéton au sud des guichets de Rohan) absents.
- Escaliers et perrons (palais Bourbon, portail du Dôme, École militaire, palais de Justice) : obstacles pleins, on ne les gravit pas. Cours fermées traitées en plein (Hôtel de Ville, Institut, École militaire, palais de Justice hors Sainte-Chapelle).
- Hôtels de Gabriel : toits plats derrière la balustrade ; côté Crillon, la colonnade est plaquée, sans loggia réelle.
- Gare Saint-Lazare : immeubles latéraux, hôtel Terminus et passerelle non modélisés ; Matignon : parc non modélisé ; Institut : passages sous les pavillons absents ; Orsay : baies peintes, pas les sept arcades exactes.
- Façades peintes par travées (style du kit) : plates de très près ; la Conciergerie n'a pas de vraie façade médiévale. Statuaire en mannequins stylisés.
- Qualités 'moyen' et 'ultra' identiques à 'haut' ; seule 'bas' allège (cannelures, statues, moulures). Aucune mesure sur vrai GPU ni sur téléphone.
- Cotes secondaires estimées, non sourcées : niveaux d'étage, hauteurs de combles, taille des pavillons, disposition des colonnes du Palais-Royal, nombre de colonnes de certains portiques.
- Aucune documentation de module mise à jour (non demandé).

## Vérifications exécutées

- npx tsc --noEmit : aucune erreur dans mes fichiers (x-palais-plan.ts, kit/x-palais-*.ts, mes 18 defs/ et 18 collide/, tests/unit/monuments.palais*.ts)
- npx vitest run tests/unit/monuments : 7 fichiers, 327 tests réussis, dont monuments.palais.test.ts et monuments.palais.plan.test.ts (127 tests à eux deux) ; le test de pureté existant (aucun import de three ni du kit depuis collide/) passe toujours
- Tests unitaires sur l'emprise RÉELLE de landmarks.json, pour chacun des 18 : construction en 'bas' et 'haut' dans le budget (≤ 60 000 triangles, ≤ 120 000 pour le Louvre, ≤ 12 appels), aucune coordonnée invalide, modèle qui couvre l'emprise sans en déborder au-delà du débord annoncé, hauteur réelle à la tolérance près, rayon englobant suffisant, silhouette ≤ 400 triangles
- Obstacles, sans emprise et avec l'emprise réelle : anneaux simples, antihoraires, hauteurs cohérentes, au moins un plein au sol ; obstacles monde inchangés quand on déplace l'ancrage de 15 m et le cap de 7°
- Passages praticables testés : les 9 guichets et passages du Louvre (sous voûte, piles pleines, cour Carrée libre), portail nord et cour d'honneur des Invalides, trois baies de l'arc du Carrousel, galerie à arcades de l'hôtel de la Marine, porche et cour de la préfecture, trois passages, colonnades et colonnes du Palais-Royal
- Sites clos testés : portail, emprise, murs du jardin et grille du Coq de l'Élysée ; portail de Matignon ; emmarchement du palais Bourbon ; grille de la cour du Mai ; zone de la Conciergerie et cour de la Sainte-Chapelle laissées libres par le palais de Justice
- node tests/e2e/monuments-palais.mjs : 150 captures tests/e2e/out/palais-<clé>-*.png (trois quarts, face, arrière en plongée, piéton, vues rapprochées, nuit, silhouette) et rapport monuments-palais-report.json, 18 monuments « OK », aucune erreur de page. Fait en plusieurs exécutions partielles ; une exécution à trois processus en parallèle a échoué sur des délais de capture, d'où un script rendu plus tolérant (reprises, rapport écrit après chaque monument)
- Captures regardées avec Read, environ 60 sur 150 : au moins une vue d'ensemble et une vue rapprochée ou à hauteur de piéton par monument ; nuit pour le Louvre, les Invalides, la Marine et la pyramide ; silhouette pour le Louvre et les Invalides
- Corrections faites après lecture des captures : corps de la Marine réduit à un morceau par la découpe (découpe réécrite en suivi de contours) ; toits absents puis recouvrant les cours des Invalides (comble borné sommet par sommet) ; passages du Louvre bouchés côté cour (épaisseurs d'ailes mesurées puis corrigées) ; bandeau traversant les baies de l'arc du Carrousel ; cour de l'École militaire recouverte ; drapeaux de Saint-Lazare noyés dans le comble ; pyramide trop terne la nuit
- Triangles et appels de dessin lus dans renderer.info par le banc d'essai (qualité 'haut', WebGL logiciel) : voir chaque monument ; construction entre 0,25 et 4 s, mesurée sur une machine très chargée

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/world/monuments/x-palais-plan.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-palais-corps.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-palais-pieces.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/kit/x-palais-gabriel.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/louvre.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/pyramide_louvre.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/arc_carrousel.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/invalides.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/hotel_de_ville.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_bourbon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_elysee.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/hotel_marine.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/hotel_crillon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_royal.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/ecole_militaire.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/institut_de_france.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/palais_justice.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/conciergerie.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/prefecture_police.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/hotel_matignon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/musee_orsay.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/defs/gare_saint_lazare.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/louvre.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/pyramide_louvre.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/arc_carrousel.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/invalides.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/hotel_de_ville.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_bourbon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_elysee.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/hotel_marine.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/hotel_crillon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_royal.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/ecole_militaire.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/institut_de_france.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/palais_justice.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/conciergerie.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/prefecture_police.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/hotel_matignon.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/musee_orsay.ts
- /home/user/SafeDeal/crs-simulation/src/world/monuments/collide/gare_saint_lazare.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.palais.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/monuments.palais.plan.test.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/monuments-palais.mjs
- /home/user/SafeDeal/crs-simulation/tests/e2e/out/monuments-palais-report.json
