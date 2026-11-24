# Compte rendu — simu:matériel

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module « matériel » écrit, exécuté et testé dans src/sim/items (20 fichiers, ≈ 5 400 lignes) avec 8 fichiers de tests (70 tests, tous verts). Il publie ctx.actions (ActionApi complet), ctx.projectiles (ProjectileApi complet, adossé à getCore(ctx).stores.projectiles) et un service étendu « items ».

Ce qui est fait :
- TABLE : les 40 ItemId du contrat ont un ItemDef (noms français sans marque — le lanceur s'affiche « Lanceur de grenades 56 mm » —, masses, cadences, portées, dotations de la bible §B et du dossier 02, niveau de force tiré de FORCE_LEVEL_OF, habilitations « lanceur », « lbd », « gazeuse », « extincteur », « desencerclement », « telepilote ») et un ItemSpec (famille d'usage, consommation, lancer, mêlée, jet). Les 16 ProjectileKind ont un gabarit physique (masse, traînée, rebond, roulement, retard, dégâts par joule).
- USAGE (use / setAlt / canUse, même chemin joueur et IA) : refus « forbidden » si custody ≠ free, tenu ou dormant ; « posture » à terre / assis en véhicule (sauf radio, mégaphone, téléphone, prise de vue, lampe, masque, télécommande) ; « blocked » étourdi, en feu, mains prises ; « cooldown » ; « empty ». Mêlée en deux temps (impact 0,28 s après le geste, arc devant soi, personne puis vitrine puis objet, parade au bouclier, jamais un collègue sauf cible explicite), coup de bouclier, gazeuse (cône 4 m / 30°, exposition directe + nuage, 7 jets), extincteur et lance (ctx.hazards.douse, extinction des personnes en feu, palets noyés par la lance), bombe de peinture (ctx.props.tag après 4 s), lancers à puissance 0..1, lanceur de 56 mm en cloche (50/100/200 m par le mode secondaire, jamais sous 30°), LBD (viseur réglé à 25 m), pistolet, mortier, fusée rouge, mégaphone (sommation / crowd:chant / appel public), menottes-trousse-sérum-brancard-micro (startVerb), prise de vue, lampe, masque (8 s), pancartes, parapluie, télécommande (drone:toggle), butin, raquette.
- solveAim : résolution numérique exacte (même intégrateur que le vol réel, fausse position amortie) — angle préféré + puissance pour les lancers, tir tendu, tir en cloche avec choix du dispositif de propulsion pour les IA, grenade roulée à retard ; corrige le vent et le déplacement du tireur.
- PROJECTILES : gravité, traînée quadratique relative au vent, intégration d'ordre 2, rebonds (amortis selon la violence du choc), roulement, immobilisation ; premier obstacle sur le segment parcouru : décor (ctx.world.raycast + hauteur, toits par buildingHeightAt), objets, véhicules, vitrines, personnes (cylindre à la hauteur de la posture → zone), sol. Comportements : grenade lacrymogène à main (retard 2,2 s) et de 56 mm (s'ouvre en l'air 0,3 s avant le point de chute prévu) → 6 palets émetteurs 30 s, ramassables et renvoyables ; assourdissante-lacrymogène (sidération 10 m + nuage) ; désencerclement (1,5 s, détonation 7 m, 18 plots rasants) ; LBD ; balle ; pavé ; bouteille (éclats) ; engin incendiaire (ctx.hazards.ignite, personnes, véhicules et mobilier enflammés) ; mortier ; fumigène ; fusée rouge ; œuf de peinture ; débris.
- DROIT : ctx.law.reportForce pour tout moyen de force employé par un policier ou gendarme (au point de chute prévu pour les grenades, avec la personne visée pour le tir tendu), ctx.law.recordOffense pour les autres (jet_projectile, violence_agent, violence, incendie, degradation, tag, port_arme). item:used à chaque usage.
- Interactions enregistrées : « renvoyer » (palet, grenade, fumigène au sol) et « ramasser » (pavé retombé).

En cours de route, le cœur a changé sous mes pieds (le magasin de projectiles émet désormais lui-même projectile:removed ; isAuthority inclut le commandant unique) : le module a été réaligné et re-testé. Un vrai bogue a été trouvé et corrigé grâce au test sur le vrai monde (un projectile arrivant sur une façade était « posé » sur le toit).

## API publique et mode d'emploi

BRANCHEMENT : import { createSystems } from '@/sim/items' ; un seul système, id « items », order = SystemOrder.ACTIONS (500). provide() remplace ctx.actions et ctx.projectiles et publie ctx.provide('items', ItemsApi). init() enregistre deux gestionnaires d'interaction. reset() vide tout (délais, jets, coups armés, modes de lanceur, masques, lampes, projectiles) et remet les réglages à leurs valeurs de référence.

EXPORTS de index.ts : createSystems ; ITEMS_SERVICE = 'items' ; DRONE_TOGGLE_EVENT = 'drone:toggle' ; ITEM_TOGGLE_EVENT = 'items:toggle' ; LAUNCHER_RANGE_EVENT = 'items:launcher_range' ; types ItemsApi, ItemsTuning, ItemSpec, LaunchSpec, MeleeSpec, SpraySpec, ProjectileSpec, LauncherRange (les autres modules n'importent que `import type` depuis '@/sim/items/api').

ctx.actions (ActionApi) — à savoir :
- give(p, id) SANS quantité donne la dotation normale (lanceur 8, LBD 6, pistolet 15, gazeuse 7, extincteur 15, menottes 6, mortier 6, appareil photo 24, bombe 12, trousse 10, sérum 20 ; 1 pour les objets à l'unité) ; une pile par type, bornée à ItemDef.maxCount. Réapprovisionner = give().
- Objets « à l'unité » (grenades, pavé, bouteille, molotov, fumigène, fusée, butin) : la pile quitte l'inventaire à zéro et la main devient vide (active = −1). Objets « à charge » : restent en main, vides (« empty »).
- select() impose un temps de mise en main (0,2 à 1,5 s) : un use() dans le même pas renvoie « cooldown ».
- Site de visée positif vers le haut. Angle de départ réel = clamp(aimPitch + loft) : lancer à la main +8/+10°, lanceur de 56 mm +30° (jamais moins), fusée ≈ 80°, LBD et pistolet réglés à 25 m. solveAim retourne le site de VISÉE à mettre dans aimPitch et la puissance à passer à use({ power }).
- solveAim sur une IA choisit aussi le dispositif de propulsion du lanceur (effet de bord voulu) ; sur le joueur (isPlayer) il ne le change jamais. Il ignore les obstacles. Objet sans projectile : visée géométrique, vrai si le point est à portée (rangeMax).
- use() retourne projectileId immédiatement pour lancers et tirs ; la mêlée frappe 0,2 à 0,3 s plus tard ; gazeuse / extincteur / lance : un usage = un jet (1 s, 1 s, 0,5 s), rappeler use() pour enchaîner.
- setAlt : bouclier levé, bâton en parade, arme épaulée (dispersion × 0,6), parapluie ouvert, pancarte brandie ; sur le lanceur de 56 mm chaque front montant change la portée 50 → 100 → 200.
- grenade_gm2l : tirée par le lanceur si la personne porte un lanceur_cougar (rechargement partagé de 8 s), sinon lancée à la main.
- Le module écrit Person.upper / upperT pendant ses animations (throw commence à 0,30 s) puis rend la pose de repos (idleAnim, ou altAnim si alt).

ctx.projectiles (ProjectileApi) : spawn() par n'importe quel module donne le comportement complet du type (retard, émission ; une grenade_lacrymo_56 calcule seule son ouverture en l'air ; un gm2l lancé à plus de 25 m/s est traité comme tiré au lanceur ; type inconnu = débris). Projectile.data appartient au module. Borne : 900 projectiles. projectile:removed est émis par le magasin du cœur.

SERVICE « items » (ItemsApi) : tuning { dispersion, playerDispersion 0,5, returnSuccess 0,6, paletGasRate 0,25/s, paletGasRadius 2,5 m, damageScale } ; spec(id) ; projectileSpec(kind) ; useItem(p, id) (lampe, masque, radio, télécommande sans lâcher l'objet en main) ; launcherRange / setLauncherRange ; shieldRaised ; umbrellaOpen ; lampOn ; maskOn ; concealedAt(x, z) (parapluie ouvert à moins de 1,2 m) ; returnProjectile(p, id, power) ; predictImpact(p, power, out) ; sampleTrajectory(p, power, out, maxPoints).

ÉVÉNEMENTS ÉMIS : item:used (chaque usage ; pour la prise de vue x, z = sujet ou point visé) ; projectile:impact (chocs de plus de ≈ 1,2 m/s ; hitKind 'person' aussi quand un bouclier arrête ; une vitrine = 'building' avec hitId = id de la vitrine) ; projectile:returned ; explosion (kind, radius : lacrymogène 1, gm2l 10, désencerclement 7, mortier 3, molotov 1,25, fusée 0) ; fire:out (personne éteinte) ; crowd:chant ; fx (gaz, fumee, feu, etincelles, explosion, flash, eclats_verre, poussiere, jet_eau, eclaboussure, traceur, feu_artifice, peinture, poudre, tag, impact) ; sfx (grenade_lancer, lanceur_tir, lbd_tir, tir_arme, mortier_tir, spray, extincteur, canon_eau, coup_baton, impact_bouclier, impact_sol, megaphone, radio_bip, menottes, declencheur_photo, ui_clic) — le son des impacts et explosions est laissé au câblage audio. Libres : 'drone:toggle' { personId }, 'items:toggle' { personId, item, on }, 'items:launcher_range' { personId, range }.
ÉVÉNEMENTS ÉCOUTÉS : person:removed, person:down (baisse le mode secondaire).

SERVICES APPELÉS : health.hurt (dégâts BRUTS + zone, stun, knockback, item, means si l'auteur est policier : les protections restent au module de santé), health.isIncapacitated, hazards.emitGas / emitSmoke / ignite / douse (1 unité = 1 s d'extincteur ; lance 1,6/s), props.damage / damageShop / tag / push / raycast / queryRadius / shopsNear, vehicles.raycast / queryRadius / damage, world.raycast / heightAt / buildingHeightAt / surfaceAt / lineOfSight, law.reportForce / recordOffense / sommation, radio.say, interactions.register / startVerb, player.state, env.state.
INTERACTIONS ENREGISTRÉES : « renvoyer » (0,7 s, priorité 70) et « ramasser » (pavé, 0,8 s, priorité 40) ; les verbes menotter, soigner, rincer_yeux, interviewer doivent être fournis par d'autres modules, sinon l'objet répond « blocked ».

ÉCRITURES DIRECTES sur des champs du contrat : Person.gas (jet de gazeuse, détonation gm2l, palet saisi), Person.burning (molotov ; extinction), Person.wet, Person.stamina (lancer 3-4, coup 4-6, bouclier qui encaisse), Person.gasProtection et look.gasMask (masque), look.extras.lampe, Person.alt / upper / upperT, Vehicle.burning (molotov : 0,3, blindé 0,05), ItemStack.state (usure du bouclier, parapluie, banderole ; pression ; pile de lampe).

RÈGLES DE PROTECTION (alignées sur sim/people) : bouclier levé = face ± 70°, zone 0,12 à 0,92 debout, zone ≥ 0,3 en parade haute (aimPitch > 0,2), tout le corps accroupi ; n'arrête pas les balles. Parapluie ouvert : petits projectiles sur le haut du corps. Banderole : jets et LBD sur le buste.

## Mesures

Coût de update() du système « items » par pas de 1/30 s, mesuré sous Node sur une machine partagée (chiffres variables d'une exécution à l'autre) :
- 200 projectiles en vol + ≈ 600 palets et fumigènes émetteurs au sol, 300 personnes, monde neutre : médiane 0,07 à 0,11 ms ; moyenne 0,13 à 0,45 ms ; 99e centile 1,6 à 8,7 ms ; pire pas 7 à 71 ms selon la charge de la machine. Objectif < 1 ms : tenu en médiane et en moyenne.
- Même scène dans le vrai monde (quartier d'essai, collisions réelles) : médiane 0,12 à 0,16 ms, moyenne 0,25 à 0,35 ms.
- 200 projectiles en vol libre + 200 palets émetteurs au repos : médiane 0,017 à 0,032 ms ; 0 ou 1 passage du ramasse-miettes sur 600 pas.
- solveAim par appel : grenade à main 15 à 31 µs ; LBD 9 à 14 µs ; lanceur 56 à 150 m avec choix du dispositif 30 à 48 µs ; idem par vent de 5 m/s 79 à 89 µs (une mesure aberrante à 308 µs sous charge). Avant optimisation : 102 µs, 42 µs, 736 µs, 2 535 µs.
- canUse : 0,4 à 0,6 µs.
- Précision de solveAim sans dispersion : 1 à 7 cm de 8 à 200 m ; 16 cm par vent de 6,7 m/s.
- Dispersion réelle d'un pavé à 20 m : écart moyen 1,71 m, pire 4,16 m ; à 12 m 1,03 m, 4,97 m pour un lanceur épuisé et gazé.
- Lanceur 56 mm : vitesses initiales étalonnées ≈ 24 / 37 / 58 m/s pour 50 / 100 / 200 m ; vol de 2,8 / 4,1 / 6,3 s à ≈ 33-34°.
- Volume : 20 fichiers source (≈ 5 400 lignes, le plus long 592), 8 fichiers de tests (≈ 2 800 lignes, 70 tests).

## Non fait / fragile

- Rien n'a été exécuté dans un navigateur ni avec le rendu : la manière dont render/fx interprète les demandes 'fx' (taille, direction, durée) n'est pas vérifiée ; la suite de tests complète du projet n'a pas été lancée, seulement tests/unit/items.*
- L'intégration avec people, hazards, vehicles et law n'a été vérifiée qu'une fois à la main (modules en cours d'écriture) ; seul le test avec le vrai monde est conservé, et il s'ignore si ce module ne se charge plus
- solveAim ignore les obstacles : une IA doit vérifier elle-même que la trajectoire est dégagée
- Les prévisions supposent un sol plat à hauteur des pieds du tireur (retard des grenades tirées au lanceur, predictImpact, grenade roulée) : une assourdissante-lacrymogène tombée sur un toit y attend environ 2 s avant de détoner
- Le sol est traité comme horizontal pour les rebonds et le roulement (pas d'accélération dans une pente)
- La hauteur du bâti du monde est rastérisée à 1 m : un projectile peut rebondir jusqu'à environ 0,5 m avant une façade, ou se poser au bord d'un toit légèrement hors de l'emprise
- Les habilitations ne sont que des données dans ItemDef : use() ne les contrôle pas (Person ne porte pas cette information)
- Pas de rechargement distinct du délai entre usages : LBD et lanceur se rechargent pendant leur délai, le pistolet tire ses 15 cartouches sans changement de chargeur ; le bouton « reload » n'a pas d'action
- La grenade assourdissante-lacrymogène peut être lancée à la main quand son porteur n'a pas de lanceur, alors que la doctrine depuis 2021 l'interdit : à arbitrer
- L'emploi de la force est déclaré avec le moyen 'lacrymo' pour la main comme pour le lanceur ; le module de droit doit regarder item:used (émis juste avant) pour les distinguer
- Véhicules : pas d'état de pare-brise (dégâts + effet d'éclats seulement) ; l'incendie d'un véhicule ou d'une personne est amorcé en écrivant burning directement, la suite appartient aux modules véhicules, dangers et santé
- Les projectiles qui roulent ne touchent pas les personnes, ne se heurtent pas entre eux et ne touchent pas les engins volants ; un projectile inerte qui traverse une vitrine brisée disparaît
- « ramasser » ne concerne que les pavés ; la grenade de désencerclement ne se renvoie pas ; le taux d'échec du renvoi ne s'applique qu'aux PNJ
- Lampe : un drapeau (look.extras.lampe) et un événement, aucune lumière ; masque : protection et apparence seulement (champ de vision et voix relèvent d'autres modules) ; radio : prise de parole sans contenu ; textes du mégaphone hors sommations génériques
- Aucun objet ne lance l'œuf de peinture (pas d'ItemId) : il n'existe que par ctx.projectiles.spawn
- ItemDef.icon contient des sigles de 2 à 4 lettres (BCL, LBD, LG56…), pas des pictogrammes dessinés
- Valeurs de jeu estimées et non sourcées : dégâts, dispersion, coefficients de traînée, rebonds, débit de gaz par palet (0,25/s sur 2,5 m, réglable) — à équilibrer en jeu
- Pics de 7 à 70 ms sur des pas isolés pendant les mesures, non reproductibles aux mêmes pas : certains coïncident avec des passages du ramasse-miettes du banc de mesure, les autres ne sont pas expliqués (machine partagée) ; seule cause établie : 24 détonations dans le même pas ≈ 400 appels à health.hurt ≈ 5 ms

## Demandes d'évolution du contrat

- ForceMeans : distinguer la grenade lacrymogène lancée à la main de celle tirée au lanceur (la matrice de licéité de la bible §A.4 les traite différemment), par exemple 'lacrymo_lanceur', ou ajouter un paramètre item?: ItemId à LawApi.reportForce et à ForceReport
- API d'allumage au lieu d'écritures directes dans burning : VehicleApi.ignite(v, intensity, sourceId), PropApi.ignite(prop, sourceId) et un point d'entrée équivalent pour une personne
- ProjectileApi : ajouter le renvoi d'un projectile (returnProjectile / relaunch), aujourd'hui seulement dans le service étendu 'items'
- ActionApi : faire entrer dans le contrat l'usage d'un objet d'inventaire sans le prendre en main (useItem : masque, lampe, radio) et la portée du lanceur de 56 mm (launcherRange / setLauncherRange), aujourd'hui dans le service étendu
- ItemStack : champ variant?: number (couleur du fumigène ou de la peinture, type de munition) — la couleur du fumigène est pour l'instant déduite du profil du lanceur
- Person : drapeau de lampe allumée (aujourd'hui look.extras.lampe) et liste d'habilitations, pour que use() puisse refuser un objet sans habilitation
- ItemId : un objet pour lancer 'oeuf_peinture', seul ProjectileKind du contrat sans objet
- GameEvents : typer 'drone:toggle' { personId } et le changement d'état lampe / masque ('items:toggle'), aujourd'hui événements libres
- Préciser dans le contrat l'unité de HazardApi.emitGas(amount) : concentration ajoutée au centre, ou masse

## Vérifications exécutées

- npx vitest run tests/unit/items : 8 fichiers, 70 tests verts (dernière exécution après la dernière modification)
- npx tsc --noEmit : 0 erreur dans src/sim/items et tests/unit/items.* (les erreurs restantes sont dans des fichiers d'autres contributeurs) ; aussi passé avec --noUnusedLocals --noUnusedParameters
- Table : 40 ItemDef + 40 ItemSpec, forceLevel = FORCE_LEVEL_OF, pictogrammes uniques, aucun nom contenant « cougar », 16 types de projectiles décrits
- Inventaire, délais et munitions : give / remove / has / select / selectById, index de l'objet en main après retrait, temps de mise en main, LBD vidé puis réapprovisionné, dernière grenade retirée de l'inventaire
- Interdictions : menotté / tenu / dormant = forbidden (les 5 états de custody), à terre = posture, étourdi ou en feu = blocked, véhicule : radio oui, bâton non
- solveAim puis tir sans dispersion, écart au premier contact avec le sol : grenade à main 20 m = 0,03 m ; pavé 8 et 22 m = 0,06 et 0,07 m ; lanceur 56 à 50 / 100 / 200 m = 0,03 / 0,02 / 0,04 m (aussi 75 et 140 m en trajectoire haute) ; identique à 20, 30 et 60 Hz ; vent de 6,7 m/s : 0,16 m (32,8 m sans correction) ; désencerclement roulée à 15 m : détonation sur le point visé
- Aide à la visée : predictImpact à moins de 0,3 m du tir réel ; sampleTrajectory cohérent
- Cycle lacrymogène complet avec service de dangers factice : retard, 6 palets, dispersion 2 à 16 m, 30 s d'émission (total = 6 × 30 × débit), extinction, retrait ; renvoi par l'interaction « renvoyer » (projectile:returned, nouveau propriétaire, le gaz suit le palet), échec d'un PNJ, service étendu, raquette
- Lanceur 56 mm : ouverture en l'air à 3,4 m (50 m) et 5,2 m (100 m), centre des palets à ≈ 2 m de la cible, palets à 7-13 m du centre ; grenade créée par un autre module via ctx.projectiles.spawn : même comportement
- Pavé contre bouclier : arrêté de face (santé intacte, bouclier usé, endurance entamée), tête touchée au-dessus du bouclier sauf parade haute, touché de dos et bouclier baissé ; dégâts croissants avec la vitesse ; vitrine fissurée puis brisée ; véhicule endommagé
- LBD à 10 / 30 / 50 m : 31,4 / 22,5 / 15,2 points au torse, tête × 2,6, visée à 25 m = ligne de visée à 2 cm près, plus d'un mètre de contre-visée à 50 m, 20 tirs sur 20 au but à 30 m avec la dispersion réelle, reportForce « lbd » avec la cible
- Engin incendiaire : ignite(rayon 1,25, intensité 1), personnes enflammées selon la distance, véhicule en feu, protection partielle du bouclier, infractions jet_projectile + incendie + violence_agent
- Désencerclement : rien avant 1,5 s, 14 personnes étourdies dans les 7 m et aucune au-delà, 18 plots, 9 au but sur une couronne à 3 m, tous sous la tête
- Assourdissante-lacrymogène, mortier (contact, éclatement à 30-60 m, imprécision), bouteille, fumigène rouge / noir, fusée rouge à 60-90 m, œuf de peinture, débris, type inconnu
- Murs et toits factices : rebond sur un mur de 3 m, grenade en cloche par-dessus, grenade posée sur un toit, façade heurtée
- VRAI monde (src/world/query, quartier d'essai) : pavé contre une façade réelle, grenade sur un toit de 25 m, aucun projectile au repos à l'intérieur du bâti
- Usage : marteau et vitrine (décor factice), bâton, parade et coup de bouclier, coup annulé si l'auteur tombe, gazeuse, extincteur, lance, bombe de peinture, mégaphone (commissaire, commandant unique, CRS, meneur, manifestant), radio, menottes / trousse / sérum, prise de vue, lampe, masque, parapluie, pancartes et banderole contre LBD, télécommande, butin, reset entre deux sessions
- Déterminisme : scène scriptée de 60 s (689 événements) identique à graine égale, différente avec une autre graine
- Garde-fous : borne de 900 projectiles ; une exception d'un service extérieur retire seulement le projectile fautif
- Vérification ponctuelle, NON conservée en test : module branché avec les vrais sim/people, sim/hazards, sim/vehicles et gameplay/law dans leur état de 01 h 12 — gaz réel, LBD, pavé arrêté par le bouclier, feu réel, verdicts « sans_sommation » et « interdit », infractions enregistrées

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/items/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/defs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/specs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/projectile-defs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/ballistics.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/aim.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/shared.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/inventory.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/actions.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/use-launch.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/use-melee.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/use-spray.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/use-misc.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/interact.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/projectiles.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/projectile-collide.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/projectile-effects.ts
- /home/user/SafeDeal/crs-simulation/src/sim/items/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.inventory.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.aim.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.lacrymo.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.projectiles.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.usage.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.determinism.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/items.world.test.ts
