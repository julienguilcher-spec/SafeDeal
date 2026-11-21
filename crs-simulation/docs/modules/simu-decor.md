# Compte rendu — simu:décor

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module « décor dynamique » écrit, exécuté et testé dans /home/user/SafeDeal/crs-simulation/src/sim/props/ (21 fichiers, ~6 200 lignes, tous ≤ 600 lignes) avec 10 fichiers de tests (76 tests verts, lancés trois fois de suite). `npx tsc --noEmit` : aucune erreur dans mes fichiers (restent 2-3 erreurs d'autres modules : src/render/vehicles, src/sim/crowd/metro.ts). Aucune dépendance installée, contracts.ts et src/core non modifiés, aucun import d'un autre module dans le code (seulement dans le test d'intégration, par import dynamique gardé).

Ce qui est fait (les 8 points de la mission) :
1. PEUPLEMENT — à world:tile_loaded : vitrines de shopsInTile → boutiques (enseigne FICTIVE composée par catégorie, stock, charges de butin, attrait luxe 0,95 / bijouterie 0,92 / téléphonie 0,88 / banque 0,80 en tête, verre courant ou feuilleté, rideau, sang-froid du commerçant, rideau baissé la nuit selon les horaires, panneaux de bois 'boarded' si la session est annoncée tendue) ; mobilier de furnitureInTile → objets (36 gabarits réalistes, y compris les 12 types propres à la carte : horodateur, caméra, colonne à verre…). Mobilier d'ambiance vérifié emplacement par emplacement (sol piéton, libre, sans chevauchement) : vélos aux stations/arceaux, chaises autour des tables, terrasses devant les cafés, corbeilles, bacs sortis, trottinettes, vélos, palettes devant l'alimentaire, petits chantiers (grilles, palette, cônes, tas de 60 pavés). Générateur propre à chaque tuile (déterministe), peuplement étalé en cours de partie (80 éléments/pas), d'un coup hors partie ; tuiles déjà chargées rattrapées à init et à session:started. Déchargement : tout est retiré, et ce qui avait changé (cassé, déplacé, brûlé, pillé, enlevé) est mémorisé puis retrouvé au rechargement. Sommeil par cellules de 64 m autour du joueur (260 m), de la caméra, des personnes et véhicules éveillés.
2. DÉGÂTS — matrice matériau × type de coup, intact → endommagé → cassé, vitrages qui éclatent panneau par panneau (abribus 4 panneaux = 7 coups de marteau, panneau pub, kiosque, DAB, horodateur, caméra hors de portée d'un coup à la main), débris, souffle des explosions (mortier, GM2L, désencerclement ; épave de véhicule : vitrines seulement), renversement avec changement de gabarit, glissade avec frottement, chocs contre murs et entre objets.
3. VITRINES — intacte → taguée → fissurée → brisée (3 coups de marteau ou 1 pavé en verre courant, 5 à 7 coups / 2 pavés en feuilleté), rideau baissé progressivement par le commerçant selon tensionAt (24 s à tension 0,40 ; 9 s à 0,95), rideau forcé à la longue (35 coups de marteau), pillage (loot() seulement vitrine brisée et rideau levé ou forcé, 1 charge par passage jusqu'à stock 0, occupants tenus par le geste « piller », plafonné par la largeur), incendie de boutique (engin lancé dans une vitrine ouverte, ou feu de rue contre la devanture : vitre qui cède en ~90 s puis embrasement ; fumée, flammes en façade, stock détruit, extincteur seulement pour un départ de feu, canon à eau ≈ 27 s).
4. FEU DES OBJETS — prise au contact de fireAt (corbeille 6,5 s, palette 15 s), par dégât 'burn', étincelles de mortier ou voisin en feu ; combustion selon le combustible (poubelle ≈ 4 min, conteneur ≈ 8 min), fumée par emitSmoke, chaleur par une nappe entretenue avec hazards.ignite, propagation (conteneur à 0,8 m : 62 s), batteries (extincteur insuffisant, reprises de feu 14/40), état brûlé, extinction par l'événement 'hazards:douse' ou, à défaut, quand fireAt retombe ; fonctionne aussi avec les dangers neutres.
5. DÉPLACEMENT — push(), renverser, porter/tirer (carriedBy), poser, lame des engins (canPush) quand aucun module de véhicules n'est branché.
6. BARRICADES — détection par regroupement d'objets DÉPLACÉS (volume ≥ 4, ≥ 3 objets, ≥ 2,5 m, en travers de la rue s'il y en a une), composite orienté sur l'axe principal qui barre passage et vue, extension, feu avec le combustible de ses éléments, démontage élément par élément (6 s), enfoncement par la lame (3,1 s à 1,5 m/s) en épaves dont 2 à 4 continuent de brûler ; barricade créée d'office par spawn('barricade') dotée d'une vraie composition.
7. COLLISIONS / RAYONS — index propre (chaque boîte inscrite dans toutes les cellules de 4 m qu'elle recouvre), resolveCircle et raycast exacts sur boîtes orientées (modes move / sight, parcours des cellules dans l'ordre avec arrêt anticipé), queryRadius, shopsNear ; résultats recoupés avec une recherche exhaustive et avec le magasin du cœur.
8. INFRACTIONS / TENSION — degradation, tag, pillage, incendie, barricade déclarés pour toute personne hors forces de l'ordre et secours ; tension selon la table F.4 de la bible (vitrine +0,03, pillage +0,06 plafonné à une fois/20 s/boutique, feu +0,04, boutique +0,10, barricade +0,06, feu éteint −0,04).
10 gestes d'interaction fournis : renverser, pousser, porter, deposer, depaver, ramasser, piller, degager, eteindre, incendier.

## API publique et mode d'emploi

BRANCHEMENT (à faire par l'intégrateur, je n'ai pas touché main.ts) : `import { createSystems } from '@/sim/props'; game.addModule(createSystems)`. Un seul système, id 'props', order = SystemOrder.ACTIONS + 20. provide() remplace ctx.props et publie le service étendu ; init() s'abonne aux événements et enregistre les gestes dans ctx.interactions ; reset() vide tout et remet les réglages par défaut.

SERVICES
- ctx.props : PropApi complet du contrat (list, shops, addShop, removeShop, get, shop, spawn, remove, clear, queryRadius, shopsNear, damage, damageShop, loot, push, tag, resolveCircle, raycast avec mode 'move' | 'sight'). Les objets rendus sont des Prop/Shop du contrat. Un Prop/Shop qui ne vient pas de ce module est ignoré sans erreur. spawn('barricade', …) crée une vraie barricade de 5 m (9 éléments).
- ctx.service<PropsExtApi>('props.ext') (constante PROPS_EXT_SERVICE, types dans src/sim/props/api.ts, `import type` autorisé) : tuning / resetTuning, stats, def(kind) → PropDef, propView(prop) (panneaux vitrés restants, chaleur, batterie, réserve à ramasser, dernier auteur du déplacement), shopView(shop) (rideau présent / forcé / position visée / résistance, verre restant, feuilleté, planches, tags, calcinée, occupants max, charges de butin restantes), barricadeParts(id) (éléments en repère local, pour le rendu), ignite / extinguish, igniteShop / extinguishShop, topple, carry / drop, lootable, setShutter(shop, closed, instant), mapKind, shopName, flushTiles, populateTile.

ÉVÉNEMENTS ÉMIS (contrat) : prop:spawned (émis une fois l'objet complet), prop:removed (get(id) répond encore pendant l'événement), prop:damaged (états damaged / broken / burning / burnt), prop:moved (au plus un par 0,25 s et par objet), shop:window (tagged / cracked / broken / intact après arrachage des planches), shop:looted, shop:shutter (closed true quand il arrive en bas, false quand il se relève ou est forcé), barricade:built (à la création seulement), fire:started / fire:out avec targetKind 'prop' ou 'shop' (fire:out aussi quand un objet en feu est retiré), fx ('eclats_verre', 'feu', 'etincelles', 'trace_brulure', 'debris', 'poussiere', 'poudre', 'impact'), sfx ('verre_brise', 'tole', 'rideau_fer', 'petard', 'impact_sol', 'extincteur').
ÉVÉNEMENTS LIBRES ÉMIS (ctx.events.onAny) : 'props:barricade_extended' et 'props:barricade_cleared' { id, x, z, parts, byId }, 'props:glass' { id, panesLeft, byId }, 'props:shutter_forced' { id, byId }. Objets réutilisés : ne pas les conserver.
ÉVÉNEMENTS ÉCOUTÉS : world:tile_loaded, world:tile_unloaded, session:started, explosion (kinds mortier, gm2l, desencerclement, vehicule), prop:moved (ré-indexation d'un objet déplacé à la main par un autre module), et l'événement libre 'hazards:douse' { x, z, radius, amount } du module des dangers.

GESTES ENREGISTRÉS (InteractionHandler ; find(actor, targetId?) respecte la cible désignée) : renverser (objet mobile debout, 0,4 à 2 s), pousser (immédiat, délai 0,7 s), porter (label « Porter » ou « Tirer », pose carriedBy / person.carrying), deposer, depaver (targetKind 'place' et targetId 0 sur chaussée 'sett' : 7 s, 4 s avec une 'barre', donne 2 'pave' et laisse un tas de 8 ; sur 'pile_paves' ou 'debris' : 1,5 s pour 2), ramasser ('bouteille' d'une colonne à verre ou d'une table, 'barre' d'un échafaudage ou d'une grille), piller (targetKind 'shop', 20 à 35 s, donne 1 'butin'), degager (barricade : un élément par 6 s ; épave/débris : enlevés ; objet renversé : redressé), eteindre (objet 'extincteur' en main, 1 unité/s, 18 s de charge prise sur ItemStack.state), incendier (verbe hors liste du contrat). piller, depaver et incendier ne sont proposés qu'aux personnes hors police et secours.

RÉGLAGES (PropsTuning) : ambientDensity (0 = carte seule, 1, 2), dormancy, wakeRadius (260 m), shopkeepers, damageScale, fireSpread, blade ('auto' | 'on' | 'off'), populateBudget (80), consequences (infractions et tension). Remis par défaut à chaque session ; une mission peut les fixer AVANT le peuplement par SessionConfig.extra.props (clé SESSION_EXTRA_KEY), ex. { extra: { props: { ambientDensity: 0.3 } } } pour un retrait préventif du mobilier.

CE QUE LES AUTRES MODULES DOIVENT SAVOIR
- Rendu : lire prop.dormant, state, burning, toppled, halfX/halfZ/height (ils CHANGENT au renversement et à la combustion), shop.window / shutter / burning ; composition d'une barricade par barricadeParts(id). Les gabarits font foi dans ce module (ext.def(kind)), pas PROP_DEFAULTS du cœur (valeurs de combustible différentes). Aucun événement n'existe pour la création/suppression d'une vitrine : parcourir ctx.props.shops.
- IA de foule : cibles par shop.appeal et PropDef.targetAppeal ; barricade = déplacer des objets (porter/deposer, pousser, renverser) jusqu'à ce qu'ils se touchent à moins de 1 m en travers de la rue — seuls les objets déplacés par quelqu'un comptent ; feu = startVerb(p, 'incendier', id), ext.ignite, ou un engin incendiaire (dégât 'burn').
- Dangers : je rappelle hazards.ignite toutes les 3 s au pied de chaque foyer (un par 2,5 m de barricade) et emitSmoke chaque seconde ; j'éteins par 'hazards:douse' (besoins : corbeille 5 unités, conteneur 8, bois 10, batterie 24 avec reprise 1,2/s, kiosque 40, barricade 6 + 2,5 par élément, boutique 6 à 60).
- Véhicules : avec un module de véhicules branché (ctx.vehicles ≠ magasin du cœur) je ne gère PAS la lame (réglage 'auto') ; ses écritures directes de prop.x/z/toppled sont rattrapées (au dégât, à prop:moved, ou sous 1 s) ; une barricade dont hp tombe à 0 par 'crush', 'vehicle' ou 'blast' est retirée et remplacée par des épaves.
- Matériel : calibré sur ses valeurs (marteau 12 sur vitrine / 18 sur objet, pavé ≈ 34 / 14). Il émet lui aussi fx 'eclats_verre' et l'infraction 'degradation' quand une vitrine change d'état : doublon de gerbe de verre possible (le droit réel fusionne déjà les infractions à moins de 2 s) — à retirer de son côté de préférence.

## Mesures

Scénario : 3 000 objets, 600 vitrines, 400 personnes, pas de 1/30 s (tests/unit/props.perf.test.ts). Machine partagée, charge ≈ 45 sur 4 cœurs.
- Coût par pas au calme : médiane 9 à 14 µs, 90e centile 19 à 41 µs, temps processeur 17 à 18 µs (objectif < 1 000 µs). 1 226 objets éveillés sur 3 000.
- Coût par pas en émeute (41 feux d'objets, 8 boutiques en feu, 41 objets en mouvement, 3 poussées par pas, tension 0,8) : médiane 64 à 86 µs, temps processeur 111 à 164 µs. Le 90e centile au mur (≈ 0,5 ms) et la moyenne brute (0,9 à 2,8 ms) sont dominés par les pauses de la machine, pas par le code — je ne peux pas le prouver mieux que par le temps processeur.
- Appels à ctx.hazards par pas en émeute : fireAt 71, emitSmoke 4,5, ignite 1,5 (coût à la charge du module des dangers, mesuré ici avec des dangers neutres).
- Requêtes (meilleure de 7 passes de 20 000 appels) : resolveCircle 0,07 à 0,08 µs (magasin du cœur : 0,23 à 1,5 µs), soit ≈ 0,11 ms pour 1 500 piétons par pas ; raycast 20 m 0,9 à 6 µs (cœur 1,6 à 7,4) ; raycast 60 m 0,6 à 3,6 µs (cœur 13 à 29) ; queryRadius 3 m 0,2 à 0,4 µs (cœur 0,5 à 3) ; shopsNear 3 m 0,17 à 0,29 µs.
- Peuplement d'une tuile de 650 objets + 170 vitrines (monde factice) : 1 070 objets créés en 5 à 92 ms selon la charge ; déchargement 1,4 à 31 ms.
- Réalisme mesuré : vitrine courante 3 coups de marteau (2,1 s avec le vrai module du matériel) ; abribus 7 coups ; rideau forcé en 35 coups ; fermeture du rideau 24,3 s / 9,4 s ; corbeille prise en 6,5 s au contact d'une nappe, palette 15 s ; propagation à 0,8 m en 62 s ; poubelle 237 s, conteneur ≈ 485 s de combustion ; conteneur éteint à l'extincteur en 6,2 s ; boutique embrasée éteinte au canon à eau en 27,3 s ; feu de boutique de 6 m : 750 s ; barricade de 5 conteneurs dégagée par un agent seul en 24 s, enfoncée par la lame en 3,1 s.

## Non fait / fragile

- Non vérifié sur les tuiles réelles de Paris (seulement le quartier d'essai et un monde factice), ni dans le navigateur, ni avec un rendu : src/render/props n'existe pas encore et le module n'est pas branché dans main.ts (rôle de l'intégrateur)
- Non vérifié avec le vrai directeur de foule (src/sim/crowd en cours d'écriture) : tensionAt / addTension testés avec un directeur factice
- Chemin « lame » du vrai module des véhicules non testé (son index.ts n'existe pas encore) : seule ma propre gestion de la lame, active quand ctx.vehicles est le magasin du cœur, est testée ; la compatibilité avec ses écritures directes est testée par simulation de ces écritures
- Mesures de performance prises sur une machine partagée très chargée (charge ≈ 45 pour 4 cœurs) : les moyennes brutes au mur sont polluées par des pauses de plusieurs ms ; je rapporte médiane et temps processeur, et les assertions du test portent sur ces deux valeurs
- Aucune fiche docs/modules/*.md écrite (hors de mes fichiers) : la documentation est dans les en-têtes de src/sim/props/api.ts et index.ts
- Un objet projeté ne blesse ni ne bouscule les personnes (elles butent dessus par resolveCircle, c'est tout)
- Les objets qui glissent sont approchés par une capsule (un ou deux disques) contre les murs et les autres objets, pas par un test boîte contre boîte ; une barricade est UNE boîte orientée (un tas en L est englobé) ; l'écart entre boîtes en coin est légèrement surestimé
- Renversement = changement de gabarit au sol, sans physique verticale ; un candélabre ou un panneau « cassé » garde son emprise
- Le commerçant est abstrait (aucun PNJ 'commercant' créé ni animé) ; un pilleur « dans la boutique » reste en réalité devant la façade pendant la durée du geste
- Le feu de boutique ne gagne que les boutiques mitoyennes (lentement) et le mobilier devant, pas les étages ni l'immeuble
- Pas de verre brisé ramassable ni de débris de vitrine ; la batterie d'un vélo est tirée au sort (40 %), toujours présente sur une trottinette
- Les objets créés en cours de partie (débris, éléments de barricade démontée) n'appartiennent à aucune tuile : ils restent en mémoire, endormis, quand on s'éloigne ; la mémoire des tuiles ne survit pas à la session
- Doublon possible de l'effet 'eclats_verre' quand le module du matériel émet aussi le sien pour une vitrine
- Le temps de peuplement d'une tuile avec le vrai monde n'a été observé qu'au chargement du quartier d'essai, pas mesuré isolément en cours de partie

## Demandes d'évolution du contrat

- GameEvents : ajouter 'shop:spawned' / 'shop:removed' { id } — aujourd'hui rien ne signale la création ou le retrait d'une vitrine, le rendu doit parcourir ctx.props.shops
- GameEvents : faire entrer dans le contrat 'barricade:extended' et 'barricade:cleared' { id, x, z, parts, byId } (émis aujourd'hui comme événements libres 'props:barricade_extended' / 'props:barricade_cleared'), ainsi que 'hazards:douse' { x, z, radius, amount, byId } déjà émis en libre par le module des dangers et écouté par les véhicules et le décor
- HazardApi.douse : ajouter un paramètre byId (auteur de l'arrosage) pour créditer l'extinction ; à défaut je crédite l'agent ou le secouriste le plus proche
- PropApi : y faire entrer ignite(prop, byId), extinguish(prop, byId), carry(prop, person), drop(person), topple(prop, dirX, dirZ, byId) et setShutter(shop, closed), aujourd'hui dans le service étendu 'props.ext'
- ShopInit : ajouter window?: WindowState pour qu'une mission puisse créer une vitrine déjà protégée ('boarded') ou déjà brisée
- InteractVerb : ajouter 'incendier' (fourni aujourd'hui comme chaîne ouverte)
- PropKind : ajouter les types de la carte que je garde tels quels — 'boite_aux_lettres', 'arceau_velo', 'panneau', 'statue', 'mat_drapeau', 'bouche_incendie', 'horodateur', 'armoire_technique', 'colonne_verre', 'horloge', 'camera', 'autre' — pour que le rendu les connaisse
- Shop : exposer forced (rideau forcé) et burnt (boutique calcinée) dans le contrat ; ils ne sont lisibles aujourd'hui que par shopView()

## Vérifications exécutées

- npx vitest run tests/unit/props : 10 fichiers, 76 tests verts, exécutés trois fois de suite (≈ 35 s par passe sur la machine chargée)
- npx tsc --noEmit : aucune erreur dans src/sim/props ni tests/unit/props.* ; contrôle supplémentaire --noUnusedLocals --noUnusedParameters propre sur mes fichiers
- Aucun Math.random, DOM, import de three, TODO ni import d'un autre module dans src/sim/props (vérifié par grep) ; git status : seuls src/sim/props/* et tests/unit/props.* sont à moi
- Collisions : disque repoussé exactement hors d'une boîte tournée à 45° (face la plus proche, centre à l'intérieur, coin de l'AABB libre) ; raycast : point d'entrée, normale, hauteur, modes move/sight, rayon de 600 m dans les deux sens ; 300 rayons sur 400 objets identiques à une recherche exhaustive ; mêmes nombres de contacts que le magasin du cœur sur 20 000 requêtes
- Cycle de vie d'une vitrine : tag → fissurée → brisée en 3 coups de marteau, événements, fx/sfx, infractions [tag, degradation, degradation], tension [0,01 ; 0,01 ; 0,03] ; verre feuilleté 5 à 7 coups ; pillage 30 charges jusqu'à stock 0 ; rideau qui protège puis forcé au 35e coup ; fermeture 24,3 s à tension 0,40 contre 9,4 s à 0,95 ; boutiques fermées la nuit ; panneaux de bois en session tendue
- Feu : poubelle incendiée → conteneur à 0,8 m pris à 62 s → poubelle calcinée à 237 s, conteneur à 547 s ; extinction par 'hazards:douse' (6,2 s à l'extincteur), par retombée de fireAt sans événement (4,3 s), et combustion complète avec les dangers neutres ; batterie : extincteur insuffisant, canon à eau 7,7 s, 14 reprises sur 40 ; kiosque insensible à l'extincteur
- Barricade formée à partir de 5 conteneurs POUSSÉS (boîte de 7,7 m en travers, passage et vue barrés partout, infractions des deux pousseurs, tension +0,06) ; à partir d'objets portés ; non formée pour une terrasse en place, un tas trop petit ou des objets rangés le long de la rue ; extension, embrasement par un bac en feu, démontage par le geste « dégager », enfoncement par la lame en 3,1 s
- Dépavage sur surface 'sett' (7 s, 2 pavés, tas de 8, infraction, épuisement d'un carré après 3 dépavages, 4 s avec une barre), ramasser, renverser, pousser, porter/poser, piller avec compteur d'occupants et abandon, éteindre avec extincteur (4,0 s, charge entamée, crédité à l'agent), incendier
- Peuplement depuis une tuile factice (29 objets de carte + 16 boutiques → 66 objets), déterminisme par graine, densité 0 et 2, chantiers, étalement en cours de partie identique au peuplement d'un coup, tuiles déjà chargées au démarrage, mémoire au déchargement/rechargement, mise en sommeil et réveil
- Intégration avec les modules réels déjà écrits : dangers (nappe et fumée réelles, extinction par le vrai douse() en 3,9 s, corbeille prise au contact d'une vraie nappe en 7,5 s), matériel + personnes + droit (vitrine brisée au vrai marteau en 3 coups et 2,1 s, pillage et renversement par le vrai registre d'interactions, piéton arrêté par un kiosque via la vraie locomotion), monde (quartier d'essai : 648 objets et 168 vitrines de carte → 771 objets et 168 boutiques, objets d'ambiance tous sur sol piéton)
- Même graine → même suite d'événements et même état final sur une émeute scénarisée ; clear(), références périmées, objets étrangers, NaN/Infinity : sans effet et sans exception

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/props/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/defs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/shop-defs.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/grid.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/shared.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/mod.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/store.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/motion.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/damage.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/fire.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/shops.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/barricades.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/barricade-geom.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/tiles.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/sweep.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/handlers.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/handlers-shops.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/handlers-kit.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/props/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.collisions.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.degats.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.vitrines.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.feu.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.barricades.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.gestes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.peuplement.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.determinisme.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/props.integration.test.ts
