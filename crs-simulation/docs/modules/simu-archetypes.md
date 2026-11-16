# Compte rendu — simu:archétypes

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module des ARCHÉTYPES écrit, exécuté et testé (8 fichiers de tests, 103 tests verts ; « npx tsc --noEmit » sans erreur dans mes fichiers — la seule erreur restante du dépôt est dans src/sim/crowd/metro.ts, qui n'est pas à moi).

Ce que fait le module (simulation pure, aucun DOM ni Three.js, aléatoire dérivé de ctx.rng, aucun import d'un autre module) :
- ctx.archetypes.spawn(kind, x, z, opts) pour les 17 PersonKind, piloté par des tables : police.ts (6 corps, 14 postes, 8 grades), tiers.ts (pompier, SAMU, street medic, journaliste, observateur), protest.ts (10 familles visuelles × 8 profils), civil.ts. Chaque personne reçoit apparence complète (teintes de la bible §D et du dossier 02), dotation par poste ou profil (quantités du tableau B : lanceur 8 + 4 lacrymogènes à main + 2 assourdissantes, LBD 6, extincteur 15 s, aérosol 7, menottes 1 + 5 liens, 4 fusées rouges…), protections, vitesses de base selon l'âge et la condition physique, nom fictif adapté à la génération, matricule RIO à 7 chiffres unique.
- Commandant unique du BRIEF : poste commandant_unite = écharpe + mégaphone + 4 fusées + 4 barrettes, ni bouclier ni lanceur ; le commissaire (tenue de service ou costume) est l'autre forme de la même autorité. L'écharpe n'est jamais posée ailleurs.
- ctx.archetypes.equip(p, poste | profil | null) : ne refait que la tenue et la dotation, jamais le corps ; dotation exactement celle du nouveau rôle (surplus rendu, munitions recomplétées), objets ramassés (pavé, bouteille, butin) gardés par un profil violent, visière baissée et masque porté conservés quand la tenue le permet. Un suiveur qui se radicalise enfile capuche et masque ; dans la famille du bloc il passe au noir.
- 12 causes neutres (pouvoir d'achat, retraites, climat, logement, hôpital, éducation, monde agricole, carburants, libertés publiques, culture, services publics, énergie) : 36 organisations fictives, 336 textes de pancartes (28 par cause, 34 caractères au plus), 120 slogans appel/réponse, 36 banderoles de tête + 6 banderoles du bloc sans signature, couleurs, composition type (familles et profils).
- Aide au peuplement : crowd() (ajustement proportionnel famille × profil puis arrondi au plus fort reste ; ordre du cortège ; banderole de tête ; un bloc par organisation syndicale), bystanders() (journalistes, observateurs, street medics pour 1 000), policeUnit() (17 types d'unités).

Choix à connaître :
- Les effectifs suivent la BIBLE (groupe 6, section 16, compagnie 70, escadron 72), qui tranche contre le « 7 / 18 / 78 » du dossier 01.
- Les CRS portent « POLICE » dans le dos (bible §D, vérifié), pas « CRS » comme le défaut du magasin des personnes.
- Les vitesses écrites sont des vitesses de BASE : le poids de l'équipement est appliqué par la locomotion à partir des protections et de l'inventaire ; je ne le compte pas une seconde fois.
- Pour les tenues officielles je n'écris pas les couleurs de casque, de bandes et de gants dans extras : le rendu applique ses propres teintes réglementaires.
- crowd() place par défaut 25 % d'enfants parmi les « famille » de la famille « familles » (taille < 1,50 m, personne protégée pour le droit) ; { children: 0 } les retire.
- Un commit automatique (« Save in-progress build files ») a déjà embarqué une version intermédiaire de mes fichiers ; je n'ai rien commité moi-même.

## API publique et mode d'emploi

BRANCHEMENT : import { createSystems } from '@/sim/roles' ; game.addModule(createSystems). Un seul système, id « roles.archetypes », order = SystemOrder.CONTROL - 50, sans update() ni frame(). Types publics : src/sim/roles/archetypes/api.ts (ré-exportés par '@/sim/roles').

SERVICES FOURNIS (clés ctx.provide)
1. ctx.archetypes (remplace le service neutre) — ArchetypeApi du contrat.
   - spawn(kind, x, z, opts) : opts.poste / rank / profile / name / heading / squadId / seed / faction respectés ; opts.look impose des champs d'apparence ; opts.inventory remplace la dotation. Sans opts.poste : crs et gendarme → bouclier, bravm → passager_moto, commissaire → autorite_civile, telepilote → telepilote, policier_civil → aucun. Sans opts.profile ni famille pour un manifestant : tirés selon la cause et la composition du jour.
   - equip(p, poste | profil | null).
2. 'roles.archetypes' (ArchetypeExtApi = ArchetypeApi + ) : spawnEx(kind, x, z, { family, cause, variant, carry, child, bloc, unmarked, company, section, group, org, signText, …PersonInit }) ; setBlocAttire(p, on) (changement de tenue du radical, sans toucher au profil ni à l'inventaire) ; inBlocAttire(p) ; setFamily(p, famille) ; traits(id) → { seed, sex, age, fitness, family, cause } ; familyOf(p) ; causeOf(p) ; groupCode(p) → « 2B » ; loadKg(p) ; kindLabel / posteLabel / profileLabel / rankLabel / familyLabel ; kitOf(kind, rôle) ; session { cause, company } ; setSession({ cause?, company? }).
3. 'roles.causes' (CausesApi) : list (CauseInfo : id, label, summary, orgs, signs, chants [{ call, response }], banners, colors, mix { families, profiles }, index, signBase, signCount, bannerBase, bannerCount, orgBase, orgCount) ; get(id | index) ; signCount ; signText(index global) ; signLines(index) (3 lignes équilibrées au plus) ; pick(cause, rng) → index global ; bannerCount ; bannerText(index) ; pickBanner(cause, rng) ; pickChant(cause, rng) ; orgCount ; org(index) ; causeOfSign(index) ; heldText(p) → texte de la banderole ou de la pancarte portée, sinon null. Identifiants de causes : pouvoir_achat, retraites, climat, logement, hopital, education, agriculture, carburants, libertes, culture, services_publics, energie (les 9 premiers sont ceux de la page d'accueil ; forme { id, label } lisible par readCauses de l'interface).
4. 'roles.spawn' (SpawnHelperApi) : crowd(cause, effectif, composition?, rng?) → CrowdSlot[] { kind, profile, family, carry?, child?, org?, variant? } dans l'ordre du cortège — composition = parts par famille de la page d'accueil (SessionConfig.extra.composition) OU { families?, profiles?, scenario?, volatility?, children?, banners? } ; bystanders(effectif, scenario?, rng?) ; policeUnit(type, { section?, drivers?, authority? }) → UnitSlot[] { kind, poste, rank, section, group, label, variant?, leads } ; unitTypes ; spawnSlot(slot, x, z, opts?) ; spawnUnitSlot(slot, x, z, opts?).
   Types d'unités : groupe_appui (6), groupe_intervention (6), groupe_commandement (4), section (16), demi_compagnie (32), compagnie (70), peloton_gm (16), escadron (72), bravm_groupe (12), bravm_unite (36), equipage_centaure (3), equipage_canon_eau (3), equipe_drone (2), equipe_liaison (2), autorite (1), pompiers (6), samu (3).
   Scénarios : marche_calme, journee_tendue, samedi_sans_organisateur, soir_spontane, soir_de_match (table du dossier 03 §2.3).

CONSTANTES EXPORTÉES : FAMILY_IDS = ['divers', 'gilets_jaunes', 'syndical', 'etudiants', 'climat', 'soignants', 'agriculteurs', 'retraites', 'familles', 'black_bloc'] (l'index est la valeur de look.extras.family ; les 9 dernières sont les CrowdFamily de l'interface, « divers » = sans étiquette) ; PROFILE_IDS ; VARIANT (radio, secouriste, video, liaison, chef_engin, tenue, civil, photographe, reporter_images, direct, porte_lance, secours_victime, chef_agres, medecin, infirmier, ambulancier, cafe, boutique, alimentation) ; CARRY (auto, rien, pancarte, drapeau, banderole, parapluie, megaphone) ; RANK_STYLE ; ROLES_ARCHETYPES, ROLES_CAUSES, ROLES_SPAWN, ROLES_EQUIPPED_EVENT.

CLÉS DE Person.look.extras (toutes numériques, documentées en tête de api.ts)
- cause, family, signText (index global ; TOUS les manifestants en ont un), bannerText (porteurs de banderole ; le même pour tous les porteurs d'une cause pendant une session), org (organisation fictive : couleur de la chasuble), company (CRS : numéro fictif 70 à 79 tiré de la graine, ou SessionConfig.extra.compagnie), section, group (1 = A, 2 = B, 3 = C), variant, backNote (gilet jaune annoté au dos), bloc (1 = tenue noire portée), child, unmarked (journaliste sans signe PRESSE), sex, age, rankStyle, rankColor, radios, cdt, camera_pieton.
- Clés du rendu renseignées : helmetColor, bandColor, packColor, coverColor, gloves, jacket, sleeves, shorts, skirt, beard, scarf, goggles, hoodDown.
- Clés lues en entrée dans opts.look.extras : les mêmes, plus carry.
- Tout ré-équipement REMPLACE l'objet extras (le rendu détecte le changement par référence) et conserve lampe, brassard_tricolore, company, section, group.

ÉVÉNEMENTS
- Émis : 'roles:equipped' (emitAny) { id, spawned } après chaque spawn et chaque ré-habillage ; person:spawned par le magasin (la personne a alors déjà son apparence et sa dotation ; vitesses, protections, matricule et objet en main sont posés juste après).
- Écouté : person:removed (oubli de l'identité).
- Je n'émets PAS person:radicalized et je ne l'écoute pas : le module de foule doit appeler equip(p, nouveauProfil) au moment où la personne se change, et setBlocAttire(p, true/false) pour le changement de tenue du bloc.

CE QUE LES AUTRES MODULES DOIVENT SAVOIR
- SessionConfig.extra lu dans reset() : cause (chaîne), composition (parts par famille), compagnie (numéro, clé de mon invention).
- Pont facultatif : si ctx.service('peopleRender') expose setHeldText(id, texte), je lui transmets le texte de la pancarte ou de la banderole de chaque manifestant à chaque habillage (testé avec un service factice).
- Poste « operateur » : sans variante = opérateur d'engin en tenue allégée ; avec variante radio / secouriste / video / liaison = membre du groupe de commandement en tenue complète.
- BRAV-M : le chef de groupe et le porteur de LBD sont des 'bravm' avec poste chef_groupe / lbd (la tenue suit le corps, la dotation le poste).
- Les violents n'ont ni pavé ni bouteille en dotation (ils ramassent sur place) ; outils du radical tirés par la graine : parapluie 20 %, marteau 8 %, barre 4,5 %, bombe de peinture 15 %, fumigène 10 %, mortier 6,7 %, engin incendiaire 3,5 %, raquette 8 %, masque à gaz 15 %.
- gasProtection de base : 0 pour les forces de l'ordre (masque en dotation, à mettre), 0,3 foulard, 0,5 foulard + lunettes.
- escadron : le capitaine n'est PAS commandant_unite par défaut (un seul porteur d'écharpe par dispositif) ; { authority: true } pour l'inverse.

## Mesures

Coût par pas de simulation : 0 ms — le système n'a ni update() ni frame() (mesuré à 0,0000 ms sur 120 pas avec 1 500 personnes, via game.perf).

Machine de test partagée et très chargée (charge moyenne ≈ 36) : les temps varient d'un facteur 4 à 10 d'une exécution à l'autre ; je donne le meilleur relevé et la fourchette.
- Création (spawnSlot + spawnUnitSlot, 1 500 manifestants + une compagnie de 70) : 12 à 45 µs par personne au mieux selon l'exécution, soit 19 à 71 ms pour la scène entière ; médiane sous charge 65 à 190 µs. Référence : ctx.people.spawn seul, 1,4 à 1,7 µs.
- Première passe à froid (compilation à la volée comprise) : 50 à 265 µs par personne, soit 0,08 à 0,4 s pour 1 570 personnes. Coût unique, à payer pendant l'écran de chargement.
- Profil CPU d'une création de manifestant : magasin des personnes 14 %, ramasse-miettes 10 %, re-semis des générateurs 7 %, tirages gaussiens 6 %, identité 5 %, tirage de la famille 5 %.
- crowd(cause, 1 500) : 0,3 à 2 ms.
- equip : 18 à 137 µs par changement de poste, 5 à 36 µs par changement de tenue (même bruit).
- Allocations : aucune boucle chaude. Par création : la Person et son look (magasin), un objet extras, les piles d'inventaire recopiées par le magasin, une identité, le nom. Générateurs, brouillon, look et PersonInit de travail sont réutilisés.

Volumes : 26 fichiers source (environ 5 300 lignes, aucun au-dessus de 540), 8 fichiers de tests, 103 tests ; 12 causes, 336 pancartes, 120 slogans, 42 banderoles, 36 organisations fictives, 231 noms de famille, 310 prénoms.
Diversité mesurée : 100 manifestants → 100 apparences distinctes. Écart maximal sur la part d'un profil dans crowd() : 2,33 % de l'effectif (1,4 personne sur 60).

## Non fait / fragile

- Non branché dans src/main.ts (racine de composition réservée à l'intégrateur) : game.addModule(createSystems) depuis '@/sim/roles'.
- Aucune vérification VISUELLE : je n'ai lancé ni banc d'essai ni capture. La compatibilité avec le rendu n'est vérifiée que par sa logique pure (resolveLook).
- Clés d'extras que le rendu ne dessine pas encore : backNote (gilet annoté), company / section / group (« CRS 74 », « 2B »), rankStyle / rankColor (chevrons, barrettes, feuilles de chêne), cdt, radios, camera_pieton. Le rendu ne lit pas non plus look.extras.signText de lui-même : seul le pont setHeldText alimente les pancartes.
- Pancartes sur une seule ligne dans l'atlas du rendu (cellule 256 × 64) : les textes de plus d'une quinzaine de caractères y sont condensés. signLines() fournit la coupe en 3 lignes, mais le rendu ne s'en sert pas.
- Endurance : Person n'a aucun champ pour elle. Elle n'existe que comme traits(id).fitness et dans les vitesses de course et de sprint de base ; la consommation de souffle reste celle du module des personnes.
- Petit bouclier rond de l'interpellateur : pas d'ItemId, donc interpellateurs mains libres. Superviseur, radio, secouriste d'unité, chef d'engin : pas de PolicePoste, rendus par 'operateur' + variante ou par le chef de groupe.
- Grades de gendarmerie : absents du contrat, les gendarmes portent des PoliceRank équivalents avec galons or.
- Compagnie d'intervention parisienne (casque à bande bleue) : pas de PersonKind, non fournie.
- equip() ne connaît pas l'état privé du module des personnes (supplément de protection de la visière, protection d'avant le masque) : il conserve l'écart constaté sur armorHead et ne touche pas à gasProtection tant que le masque est porté. Testé seulement en simulant cet état à la main, pas avec le vrai module.
- Vêtements indépendants de la météo et de la saison (choix : même graine → même personne).
- Numéros de compagnie 70 à 79 supposés inutilisés par des compagnies réelles : non vérifié.
- Familles × profils incohérents acceptés tels quels si l'appelant les demande explicitement (par exemple « famille » dans le bloc) ; crowd() n'en produit jamais.
- Je n'ai lancé que mes tests et la vérification des types, pas la suite complète du dépôt.
- D'autres systèmes de src/sim/roles (IA des médecins, journalistes, secours, drone) devront être ajoutés au tableau de createSystems dans src/sim/roles/index.ts, qui m'appartient.

## Demandes d'évolution du contrat

- Person : ajouter un champ d'endurance (staminaMax ou endurance 0,5–1,3) pour que la condition physique d'un archétype agisse sur le souffle et pas seulement sur les vitesses.
- ItemId : ajouter 'bouclier_rond' (petit bouclier de l'interpellateur, bible §B).
- PolicePoste : ajouter 'superviseur', 'radio', 'secouriste', 'chef_engin' (écart déjà signalé par la bible §J.3) ; aujourd'hui rendus par 'operateur' + look.extras.variant.
- PersonLook.height : le commentaire dit 1.50 – 1.98 alors que le module de droit traite height < 1.50 comme un enfant ; documenter que les enfants descendent à environ 1,12 m.
- PersonLook.backText : ajouter 'SAPEURS-POMPIERS' aux valeurs listées (je l'utilise ; l'atlas du rendu la prépare déjà).
- HeadgearId : ajouter un casque léger neutre (observateur) ; faute de mieux l'observateur porte une casquette bleue.
- PersonLook.extras : inscrire dans le contrat les clés partagées signText, bannerText, cause, family, org, company, section, group, bloc, child, rankStyle, backNote (documentées dans src/sim/roles/archetypes/api.ts).
- SessionConfig.extra : officialiser la clé 'compagnie' (numéro de la compagnie de CRS engagée), à côté de 'cause' et 'composition' déjà écrites par la page d'accueil.
- Rendu des personnages (hors contrat) : lire look.extras.signText / bannerText par 'roles.causes' et dessiner les pancartes sur plusieurs lignes ; dessiner backNote, le code de groupe et le numéro de compagnie.
- Magasin des personnes (src/core/store-people.ts) : son défaut backText 'CRS' pour le type crs contredit la bible §D (« POLICE » dans le dos, écusson « CRS » à part) ; à aligner si l'on veut la même chose sans le module des archétypes.

## Vérifications exécutées

- npx vitest run tests/unit/roles.archetypes : 8 fichiers, 103 tests verts (dernière exécution complète après la dernière modification)
- npx tsc --noEmit : aucune erreur dans src/sim/roles/** ni dans tests/unit/roles.archetypes.* (vérifié aussi avec --noUnusedLocals --noUnusedParameters) ; la seule erreur du dépôt est src/sim/crowd/metro.ts (module d'un autre)
- Chaque PersonKind (17) : personne complète — nom bien formé, faction, couleurs entières 0..0xFFFFFF, vitesses croissantes, protections dans [0, 1], objets tous dans la liste du contrat, pas de pile en double, écharpe seulement pour le commissaire
- Chaque poste de CRS (14) : objets obligatoires et interdits, objet en main, grade par défaut, quantités du tableau B ; 6 corps × 15 postes : écharpe si et seulement si autorité, grade ↔ galons (table écrite indépendamment dans le test), 360 matricules tous différents
- Chaque profil × chaque famille (80 combinaisons × 6) : profil, famille, cause, texte de pancarte dans la plage de la cause, aucun matériel de police, aucun pavé / bouteille / butin en dotation, mégaphone du meneur, brassard du service d'ordre
- Black bloc sur 200 radicaux : tout en noir, capuche / cagoule / casque, visage masqué, sac à dos, lunettes et gants > 70 %, parapluie entre 10 et 32 %
- equip : changement de poste (ordre des emplacements, surplus rendu, réapprovisionnement), prise et abandon du commandement (écharpe), visière et masque conservés, radicalisation, tenue du bloc mise puis retirée avec retour EXACT à la tenue de ville, dotation indépendante de la tenue, adoption d'une personne créée par ctx.people.spawn
- Déterminisme : même graine + mêmes options → même personne dans deux parties distinctes, même avec des créations intercalées ; sans graine la graine de session fixe la suite ; rejouer la session redonne les mêmes personnes
- Diversité : 100 manifestants → 100 apparences distinctes (signature hors taille et carrure), 100 noms, 28 textes de pancarte ; 70 CRS : au moins 4 teints, 12 âges, 65 noms sous le même uniforme
- Causes : 12 causes, au moins 25 pancartes chacune (6 à 34 caractères, en capitales, sans doublon), exactement 10 slogans appel/réponse, banderoles ≤ 52 caractères, parts de familles et de profils sommant à 1
- Neutralité : plus de 600 textes passés à une liste de contrôle (syndicats, partis, associations, personnalités, sigles réels) ; aucun nom de famille de personnalité publique dans la table des noms ; la liste de contrôle elle-même est testée
- Tests par mutation faits à la main puis annulés : écharpe donnée au chef de section → 3 tests rouges ; « CGT » et « MACRON » glissés dans une pancarte → 2 tests rouges
- Foule : pour les 12 causes et 60 / 300 / 1 500 personnes, familles respectées à moins d'une personne, profils à 1 % de l'effectif près (écart maximal mesuré : 1,4 personne sur 60), aucune combinaison interdite ; composition de la page d'accueil acceptée ; ordre du cortège ; service d'ordre plafonné à 200
- Unités : section 16 = A (chef, 3 boucliers, lanceur, extincteur) + B (chef, 2 boucliers, LBD, 2 interpellateurs) + C (chef de section, radio, secouriste-vidéo, lanceur de réserve) ; compagnie 70 avec un seul porteur d'écharpe une fois créée
- Avec le VRAI module du matériel (src/sim/items) : tous les objets de toutes les dotations ont une définition, quantités ≤ maxCount, même dotation et même apparence qu'avec le service neutre, equip correct
- Avec le VRAI module du droit : ctx.law.sommation() refuse l'équipier et le chef de section, accepte le commandant et le commissaire créés par le module, refuse un commissaire sans écharpe
- Avec les VRAIS modules personnes + matériel : 150 manifestants et une section vivent 3 s simulées sans erreur ; le porteur de bouclier court moins vite que sa vitesse de base
- Avec la logique d'apparence du rendu (resolveLook, pure) : toutes les tenues passent sans erreur, pièces attendues présentes (casque à bandes, gilet, galons, écharpe, chasuble, bandes réfléchissantes, capuche, masque, lunettes, croix, blouse) et marquages demandés (POLICE, GENDARMERIE, PRESSE, SAMU, SAPEURS-POMPIERS, OBSERVATEUR)
- Aucun import hors '@/core/*' et fichiers du module ; ni Math.random, ni Date.now, ni DOM, ni Three.js (vérifié par grep)

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/roles/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/system.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/core.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/spawn.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/equip.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/services.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/model.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/palette.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/names.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/police.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/tiers.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/protest.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/civil.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/causes.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/causes-data-a.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/causes-data-b.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/causes-data-c.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/causes-data-d.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/mix.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/crowd.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/units.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/inventory.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/load.ts
- /home/user/SafeDeal/crs-simulation/src/sim/roles/archetypes/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.police.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.people.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.equip.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.determinism.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.causes.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.crowd.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.perf.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/roles.archetypes.integration.test.ts
