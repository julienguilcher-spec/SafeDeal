# 06 — Rôles jouables : le quotidien réel de chaque rôle et sa boucle de jeu

> Dossier de recherche pour **CRS Simulation France**. Rédigé le 15 novembre 2026 à partir de sources consultées ce jour.
> Public visé : développeurs gameplay / IA / interface / missions. Il complète les dossiers **01** (doctrine et droit), **02** (matériel, tenues, véhicules),
> **03** (dynamique de la manifestation) et **04** (lieux) : les valeurs déjà établies là-bas sont rappelées par un renvoi « D01 §3.2 », jamais recopiées en entier.
> Les passages entre guillemets « … » suivis de **[V]** sont des **textes exacts** lus dans un document officiel ; ceux marqués **[JEU]** sont des propositions de conception.
> Conformément au BRIEF §4 : mouvements, syndicats et médias **fictifs** en jeu, **aucune personne réelle**, **aucune marque** (les noms de matériels cités ici servent à la traçabilité),
> comportements violents décrits **au niveau du gameplay** uniquement.

## Légende de fiabilité

| Marque | Signification |
|---|---|
| **[V]** | **Vérifié** : lu pendant cette recherche dans un document officiel (arrêté préfectoral, compte rendu de commission d'enquête parlementaire, rapport du Sénat, rapport d'une autorité indépendante, fiche de la CNIL, réponse ministérielle). Pour les auditions, il s'agit de **propos tenus devant la commission** : exacts comme citation, à prendre comme témoignage. |
| **[S]** | **Source secondaire** : presse, Wikipédia, communiqué associatif, extrait affiché par le moteur de recherche d'une page qui n'a pas pu être ouverte. Plausible, à recouper. |
| **[I]** | **Incertain / non trouvé** : aucune source fiable. Ne pas présenter comme réel. |
| **[JEU]** | **Valeur proposée pour le jeu** : choix de conception cohérent avec ce qui est vérifié. |

Les renvois `[Rn]` pointent vers la section **Sources**. « D01 », « D02 », « D03 », « D04 » renvoient aux autres dossiers du répertoire.

### Correspondance avec `src/core/contracts.ts` (lecture seule, rien n'est modifié)

| Rôle de ce dossier | `PlayableRole` | `PersonKind` | `PolicePoste` / `ProtestProfile` | Caméra conseillée (`CameraMode`) |
|---|---|---|---|---|
| CRS, postes d'exécution (§2) | `crs` | `crs` | `bouclier`, `lanceur`, `lbd`, `extincteur`, `interpellation`, `conducteur` | `fps` / `tps` ; `vehicle_int` pour le conducteur |
| Chef de groupe, chef de section (§3) | `chef_groupe` | `crs` | `chef_groupe`, `chef_section` | `tps` + roue d'ordres |
| Commandant de compagnie (§4) | `commandant` | `crs` | `commandant_unite` | `tps` ↔ `tactical` |
| Autorité civile (§5) | `commissaire` | `commissaire` | `autorite_civile` | `tps` ↔ `tactical` |
| BRAV-M (§6) | `bravm` | `bravm` | `pilote_moto`, `passager_moto` | `vehicle_ext` puis `fps` à pied |
| Équipage du Centaure (§7) | `gendarme_centaure` | `gendarme` | `conducteur`, `operateur` (+ sièges `driver` / `gunner` / `passenger`) | `vehicle_int`, `turret` |
| Engin lanceur d'eau (§8) | `operateur_canon_eau` | `crs` | `conducteur`, `operateur` | `turret`, `vehicle_int` |
| Télépilote (§9) | `telepilote` | `telepilote` | `telepilote` | `drone` |
| Street medic (§10.1) | `street_medic` | `street_medic` | — | `fps` / `tps` |
| Secours officiels (§10.2) | `secouriste` | `pompier`, `samu` | — | `fps` / `tps`, `vehicle_int` |
| Journaliste (§11) | `journaliste` | `journaliste` | — | `tps` ↔ `viewfinder` |
| Manifestant (§12) | `manifestant` | `manifestant` | `pacifique`, `famille`, `militant`, `service_ordre`, `meneur`, `opportuniste`, `radical` | `fps` / `tps` |
| Observateur, commerçant (§13) | **absent** (PNJ aujourd'hui) | `observateur`, `commercant` | — | `tps` ↔ `viewfinder` |

Écarts constatés entre ce dossier et le contrat, **à signaler au responsable du contrat** (non modifié ici) : pas de poste « superviseur » ni « secouriste d'unité » dans `PolicePoste` ; pas de poste « chef d'engin » (le Centaure et l'engin lanceur d'eau ont trois sièges fonctionnels) ; pas de `PlayableRole` pour le chef de section, l'observateur et le commerçant.

---

## 0. L'essentiel en vingt constats (à coder en premier)

1. **Chaque rôle a un métier, pas seulement une arme** : le porteur de bouclier tient un intervalle, le lanceur attend un ordre, le commissaire parle, le télépilote regarde, le secouriste trie, le journaliste cadre. La boucle de jeu doit récompenser le geste de métier. [JEU]
2. Les CRS sont formés collectivement : « trois périodes de recyclage par an et seize journées d'entraînement, pour une valeur cible de vingt-cinq jours de formation par an », après une formation de base de trois semaines. [V][R7]
3. Un tireur n'agit jamais seul : LBD et lanceur de grenades fonctionnent **en binôme avec un superviseur** qui désigne l'objectif et surveille l'environnement (D01 §3.2 et §3.3). [V]
4. « Un lancé sans manœuvre, c'est un caprice » : une grenade sert à accompagner un repli, une progression ou une mise à distance. [S][R21]
5. La fin d'une charge est signalée **au sifflet** ; continuer après le sifflet est une faute relevée par la presse. [S][R21]
6. L'autorité civile décide, le commandant manœuvre (D01 §4.5). Le directeur de l'ordre public parisien dit de ses commissaires qui partent en chargeant « que ce n'est pas leur place, car ils doivent avoir une vue d'ensemble afin d'organiser les manœuvres ». [S][R20]
7. À Paris, la direction de l'ordre public dispose de « trente commissaires de police, experts en maintien de l'ordre », d'un état-major de 230 personnes et de compagnies d'intervention de « 200 policiers et 20 officiers », soit « 120 personnels opérationnels sur le terrain ». [V][R7]
8. BRAV-M : « les effectifs qui assurent le maintien de l'ordre ne sont pas les conducteurs, mais les passagers, qui mettent pied à terre avant de former des groupes et d'intervenir ». [V][R10]
9. Le Centaure a **trois opérateurs** (pilote, chef d'engin, opérateur radio-tireur) et sept passagers ; son lance-grenades compte **30 coups** ; sa lame percute et pousse un obstacle de 3,5 t jusqu'à 30 km/h (D02 §4.3). [V] / [S][R16]
10. L'engin lanceur d'eau est un **moyen d'appui** employé après les sommations ; les modèles récents se commandent au manche depuis la cabine ; il sert aussi à **éteindre** (D02 §4.2). [V] / [S][R40]
11. Un drone ne vole que sous **arrêté préfectoral** : pour une manifestation parisienne de 2024, « 2 caméras embarquées sur des aéronefs télé-pilotés », un périmètre annexé, une plage « de 7h00 à 20h00 ». [V][R1]
12. Le drone ne capte **pas le son**, ne fait **pas de reconnaissance faciale**, ne filme **pas l'intérieur des domiciles** ; images conservées **7 jours** au plus. [V][R4]
13. Le secours officiel n'entre en zone dangereuse que **sous protection policière** : « L'objectif est d'extraire rapidement les blessés, tout en protégeant l'équipe. » [S][R23]
14. Tri des victimes : **urgence absolue** (extrême urgence, U1), **urgence relative** (U2, U3) ; repérage secouriste par couleurs vert / jaune / rouge / noir. [S][R27]
15. Les street medics agissent « en dehors de tout cadre légal », par équipes de deux ou trois, et passent la main aux secours dès que cela dépasse le premier secours. [S][R24][R25]
16. Le journaliste n'a **aucun signe distinctif obligatoire** ; la carte de presse n'est « pas obligatoire pour pratiquer le métier » ; il est menacé par les deux camps (douze agressions recensées en dix jours à l'automne 2026 : six par des manifestants ou des tiers, six par les forces de l'ordre). [V][R6] ; [S][R32][R29]
17. Le service d'ordre syndical protège le **carré de tête** et ses militants ; il ne « fait pas la police » ; il ne dépasse plus « 150 à 200 personnes ». [V][R8][R7]
18. Risque judiciaire réel du manifestant : sur 785 gardes à vue parisiennes en une semaine de mars 2023, **80 % de classements sans suite « secs »**, 9,5 % de déférés, des mesures « avoisinant les 24 heures ». [V][R11]
19. L'observateur travaille en équipe, chasuble sur le dos, horodate tout et publie une note ; il est régulièrement tenu à l'écart ou contrôlé. [S][R34][R35]
20. Le commerçant subit sans manifester : chiffre d'affaires « nul tous les samedis » pendant six semaines sur une grande avenue, boutique servant de refuge, alertes par SMS arrivées « trop tard ». [V][R9]

---

## 1. Socle commun à tous les rôles

### 1.1 Boucle universelle [JEU]

| Temps | Contenu | Durée (mission de 25 min) |
|---|---|---|
| 1. Briefing | Carte, mission, cadre légal en vigueur, moyens, météo et vent, chaîne hiérarchique ou rédaction / collectif | 20 à 40 s (passable) |
| 2. Mise en place | Rejoindre son poste, s'équiper, tester la radio ou le matériel | 30 à 60 s |
| 3. Veille | Observer, renseigner, attendre ; c'est la majorité du temps réel (D03 §1.6) | variable |
| 4. Décision | Un événement appelle un choix de métier (tenir, demander, cadrer, trier, partir…) | 2 à 10 s |
| 5. Action | Geste technique court, soumis à une règle | 3 à 60 s |
| 6. Compte rendu | Radio, fiche, envoi d'images, transmission de bilan | 5 à 20 s |
| 7. Bilan | Écran de fin : quatre jauges (§1.3), chronologie, vidéos publiées, suites (IGPN, parquet, rédaction) | — |

### 1.2 Ce que fait chaque rôle selon la phase (`CrowdPhase`)

| Rôle | `rassemblement` / `depart` | `cortege` | `tension` | `affrontement` | `dispersion` / `apres_manif` |
|---|---|---|---|---|---|
| CRS (exécution) | En réserve dans une rue parallèle, casque à la ceinture | Suit à distance, relèves | Casque, visière, alignement | Tient, riposte sur ordre, interpelle | Refoule, sécurise, rend compte |
| Chef de groupe / section | Vérifie matériel et consignes | Place les binômes | Désigne les superviseurs | Commande le feu et le pas | Compte ses agents, bilan munitions |
| Commandant | Reconnaît le terrain avec le commissaire | Suit le cortège sur la carte | Rapproche les sections | Choisit la manœuvre | Rétablit la circulation |
| Commissaire | Contact avec les organisateurs | Liaison, renseignement | Constate le trouble | Annonce, sommations, autorisations | Lève le dispositif, bilan |
| BRAV-M | En attente moteur coupé | Jalonne les rues latérales | Se rapproche du précortège | Débarque, interpelle, remonte | Poursuit les groupes mobiles |
| Centaure | En retrait, hors de vue | Hors de vue | Avance en second rideau | Salve, lame, abri mobile | Dégage les barricades |
| Engin lanceur d'eau | En retrait | En retrait | Avance derrière la ligne | Jet après sommations, extinction | Extinction, repli, ravitaillement |
| Télépilote | Décollage, vérification du périmètre | Comptage, précortège | Signes avant-coureurs (D03 §3.2) | Guidage, désignation | Suivi des groupes dispersés |
| Street medic | Repère les issues, se répartit | Petits soins, eau | S'équipe (casque, lunettes) | Rince, comprime, abrite | Suit les blessés, quitte la zone |
| Secours officiels | Point de regroupement monté | Malaises, chutes | Pré-alerte | Extraction sous protection, feux | Bilan, évacuations |
| Journaliste | Plans larges, entretiens | Cortège, slogans | Se rapproche de la tête | Entre les deux lignes | Images de fin, envoi |
| Manifestant | Retrouve son groupe | Marche, chante, porte | Reste ou s'écarte | Fuit, s'assoit, filme, aide — ou affronte | Rentre, ou reste à ses risques |
| Observateur | Se présente, repère les unités | Note | Se place en biais | Horodate tirs et sommations | Rédige |
| Commerçant | Décide : ouvrir, protéger, fermer | Vend ou surveille | Rentre la terrasse | Baisse le rideau, abrite | Constate, photographie, déclare |

### 1.3 Barème commun [JEU]

Quatre jauges de 0 à 100, communes à tous les rôles, pondérées différemment :

| Jauge | Mesure | Poids forces de l'ordre | Poids secours | Poids presse / observateur | Poids manifestant |
|---|---|---|---|---|---|
| **Mission** | Objectifs du rôle atteints | 35 % | 45 % | 50 % | 40 % |
| **Règle** | Conformité au droit et à la déontologie du rôle | 30 % | 20 % | 20 % | 20 % |
| **Intégrité** | Santé du joueur, de son équipe, des tiers | 20 % | 30 % | 15 % | 30 % |
| **Image** | Ce que les caméras ont vu (D03 §7) | 15 % | 5 % | 15 % | 10 % |

Note finale : A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E < 40. En mode Carrière, une note E avec une faute de la jauge Règle ouvre une procédure (D01 §7). Un « échec dur » (mission interrompue) n'existe que dans cinq cas : joueur hors de combat, faute pénale grave filmée, abandon de poste (plus de 90 s hors de sa zone sans ordre), destruction du véhicule ou de l'appareil confié, arrestation du joueur civil.

### 1.4 Paramètres communs [JEU]

| Paramètre | Valeur | Remarque |
|---|---|---|
| Marche / trot / course sans charge | 1,4 / 2,6 / 5,0 m/s | piéton libre réel : 1,34 m/s (D03 §1.4) |
| Agent en tenue de maintien de l'ordre | 1,3 / 2,3 / 4,0 m/s | 3,2 m/s en course bouclier levé |
| Souffle (course) | 25 s de course pleine, récupération 2 s par seconde d'arrêt | −30 % dans le gaz sans masque |
| Portée de la voix | 15 m calme, 6 m dans le vacarme | mégaphone : D01 §1.5 |
| Radio | appui pour parler ; 1 seul locuteur par canal ; message type en 4 à 8 s | canaux et mots conventionnels : D01 §5 |
| Lancer à la main (tout objet de 0,2 à 0,6 kg) | 5 à 30 m | cohérent avec D02 §3.2 |
| Portage d'un blessé | à deux : 1,2 m/s ; seul (traîner) : 0,6 m/s | D03 §6.5 |
| Durée d'une « séquence » de droit | une rue ou une place ; à refaire après 150 m ou un changement de rue | D01 §1.6 |

### 1.5 Interface commune

Boussole avec nord et vent (flèche + vitesse), mini-carte du quartier (512 m de côté, la tuile courante), horloge de mission et phase courante, jauge de tension **locale** (couleur seulement, pas de chiffre pour les civils), état de santé et de souffle, indicateur « vous êtes filmé » (icône d'objectif quand une caméra PNJ a une ligne de vue à moins de 40 m), journal radio ou fil de messages défilant, rappel du cadre légal du moment (une ligne).

> **Ce que le jeu doit reproduire — Socle commun**
> - La même manifestation doit pouvoir être rejouée dans chaque rôle : la simulation est unique, seuls changent les verbes disponibles, la caméra et le barème.
> - L'attente fait partie du métier : la veille doit proposer de vraies micro-tâches (observer, compter, renseigner, vérifier son matériel), pas un écran vide.
> - Toute action coercitive ou intrusive se compare à l'état de droit du moment (D01 §1.8) ; le bilan explique chaque point perdu par une phrase.
> - Les caméras des autres (journalistes, téléphones, drone, caméras-piétons) sont un système de jeu à part entière, visible dans l'interface.

---

## 2. CRS : les postes d'exécution

### 2.1 Faits de cadre

| Sujet | Constat | Fiab. |
|---|---|---|
| Volume | « Le maintien de l'ordre, cœur de métier des CRS, est assuré par soixante unités du service général, soit environ 8 200 fonctionnaires » | [V][R7] |
| Formation | Base de trois semaines pour tout nouvel affecté, officiers compris ; puis « trois périodes de recyclage par an et seize journées d'entraînement », cible de 25 jours par an ; habilitations et « validation de l'emploi à l'armement » pendant ces périodes | [V][R7] |
| Menace décrite par la direction | « Les jets d'engins incendiaires et de projectiles dangereux deviennent un procédé courant » | [V][R7] |
| Blessés | CRS blessés en manifestation : « 353 en 2018, 413 en 2019 » | [V][R7] |
| Organisation | Compagnie d'environ 130 agents, 4 sections, 3 groupes (A, B, C ; C = commandement de la section), marquage dorsal « 1A », « 2C » (D01 §4.1) | [S][R37] |
| Effectif réellement aligné | Une compagnie alignerait parfois 45 à 50 agents au lieu des 80 à 90 attendus (témoignage) ; un autre témoignage parle de « sections de 35 personnes » : ordre de grandeur instable d'une source à l'autre | [S][R21][R22] |
| Relèves | Difficiles à organiser : une unité épuisée par les jets ne peut pas toujours être remplacée avant un nouveau contact | [S][R21] |
| Binôme tireur / superviseur | Obligatoire pour le LBD et pour le lanceur de grenades (D01 §3.2, §3.3) | [V] |
| Sens d'une grenade | « Un lancé sans manœuvre, c'est un caprice » (un CRS) | [S][R21] |
| Fin de charge | Arrêt au sifflet ; des agents ayant « continué à charger après l'arrêt du sifflet » ont été signalés | [S][R21] |
| Secouriste d'unité | Secouristes opérationnels formés en interne (diplômes de premiers secours en équipe de niveaux 1 et 2), sac dédié, capables d'une extraction en attendant les secours | [S][R37] |
| Pompiers | La brigade de sapeurs-pompiers intervient « avec des dispositifs autonomes ou intégrés dans nos unités ou celles des CRS et gendarmes » | [V][R7] |
| Vidéo | « la vidéo est devenue indispensable » pour présenter des éléments à la justice et « montrer le contexte dans lequel les policiers sont intervenus » | [V][R7] |
| Trace d'un tir | Tout agent ayant utilisé une arme renseigne une fiche de suivi de l'usage des armes | [S][R20] ; principe [V] D01 §3.9 |
| Vie en déplacement | Cantonnement collectif : « On mange et on dort quasiment en autarcie pendant un mois » ; indemnité journalière d'absence temporaire d'environ 43 € | [S][R22][R37] |
| État d'esprit | « la priorité d'un commandant est de ramener ses hommes » ; regret du « contact permanent » : « Ce qui fonctionnait, c'était la mise à distance. » | [S][R21] |
| Répartition des postes dans un groupe (nombre de boucliers, de lanceurs, de LBD, d'extincteurs) | **non trouvé** | [I] |
| Poids total de l'équipement, nombre de grenades emportées par un lanceur | **non trouvé** (D02 §10.1) | [I] |

Répartition proposée pour une section de 18 [JEU], compatible avec D01 §4.1 :

| Groupe | Effectif | Postes |
|---|---|---|
| A (7) | 1 chef de groupe (superviseur), 4 boucliers, 1 lanceur de grenades, 1 porte-extincteur |
| B (7) | 1 chef de groupe (superviseur), 3 boucliers, 1 LBD, 2 interpellateurs (binôme) |
| C (4) | 1 chef de section, 1 adjoint radio, 1 secouriste-vidéo, 1 lanceur de grenades de réserve |
| Véhicules | 2 conducteurs restés aux fourgons (non comptés dans les 18), moteur prêt, à 80–200 m en arrière |

### 2.2 Journée type, compressée pour une mission de 25 min [JEU]

| Minute | Réel (ordre de grandeur) | En jeu |
|---|---|---|
| 0:00 | Briefing au cantonnement, perception du matériel, trajet en colonne | Écran de briefing, puis réveil dans le fourgon |
| 0:40 | Stationnement dans une rue parallèle, longue attente casque à la ceinture | Vérifier son matériel (3 contrôles), écouter la radio |
| 3:00 | Mise en place à pied, à distance du cortège | Rejoindre le point marqué, s'aligner |
| 4:00–14:00 | Surveillance, relèves, repas sur le pouce | Veille : observer, signaler, changer de carrefour |
| selon la tension | Casque, visière, boucliers ; sommations par l'autorité civile | Séquence d'action (§2.5) |
| 15:00–21:00 | Dispersion, refoulement, interpellations | Idem, par bonds |
| 21:00–25:00 | Retour au calme, comptage, compte rendu, retour aux véhicules | Bilan munitions, fiche, écran de fin |

### 2.3 Fiches de poste

| Poste | Mission réelle | Porte (voir D02 §1–§3) | Gestes de métier | Risques propres | Réussite |
|---|---|---|---|---|---|
| **Porteur de bouclier** | Former la ligne, encaisser les projectiles, protéger ceux qui sont derrière | Bouclier rectangulaire transparent 1,00 × 0,57 m, ≈ 4 kg ; bâton ; gazeuse ; menottes | S'aligner coude à coude ; bouclier **bas** (jambes) ou **haut** (tête) ; avancer au pas ; ouvrir et refermer une « porte » de 1,5 m pour les interpellateurs ; frapper seulement pour se dégager | Pavés aux jambes et à la tête, feu sur le bouclier, isolement si la ligne flotte, fatigue du bras | Ligne jamais percée ; aucun coup hors cadre ; aucun blessé derrière lui |
| **Lanceur de grenades** | Mettre à distance par le gaz, **en appui d'une manœuvre** | Lanceur de 56 mm, musette ([JEU] 12 grenades : 8 lacrymogènes, 4 à main) | Lire le vent ; choisir la portée (50 / 100 / 200 m, D02 §3.2) ; **tir en cloche uniquement** ; annoncer « Grenade ! » ; compter ses munitions | Tir tendu (faute grave), palet renvoyé, gaz qui revient sur la ligne, tir sur un cortège pacifique | Foule violente reculée de la distance demandée ; zéro tir tendu ; zéro gaz sur des tiers protégés |
| **Superviseur** (souvent le chef de groupe) | « évaluer la situation d'ensemble », « s'assurer de la compréhension des ordres par le tireur », « désigner l'objectif » (D01 §3.2) | Radio, caméra-piéton ventrale | Désigner (« Objectif : … »), autoriser, interdire, filmer | Responsable avec le tireur d'un tir illégitime | 100 % des tirs désignés et filmés |
| **Porteur de LBD** | Neutraliser à distance **un individu** auteur de violences, jamais disperser | LBD 40 mono-coup, 2,05 kg ; [JEU] 6 munitions | Attendre la désignation ; viser torse ou membres ; 10 à 50 m (optimum 30 m) ; un coup, rechargement 5 s ; rendre compte ; faire vérifier l'état de la personne touchée | Tir à la tête, tir à moins de 10 m, tir sur un tiers, tir en dispersion (D01 §3.2) | Auteur atteint puis interpellé ; aucun impact interdit |
| **Porte-extincteur** | Éteindre tout feu sur un collègue, un bouclier, le sol devant la ligne | Extincteur portatif ([JEU] 6 kg : 15 s de jet, portée 4 m) ; pas de bouclier | Se tenir au second rang, regarder **en l'air** ; intervenir en moins de 3 s ; éteindre une poubelle sur ordre ; recharger au fourgon | Exposé sans bouclier, appareil vide au mauvais moment | Aucun agent brûlé plus de 3 s ; feux au contact éteints |
| **Binôme d'interpellation** | Saisir un auteur identifié et le ramener derrière la ligne | Petit bouclier ou mains libres, menottes, gants, pas d'arme longue | Sortir par la « porte », saisir à deux (un bras chacun), amener au sol **sans coup**, menotter, palper, rentrer en moins de 20 s ; remettre à l'officier de police judiciaire avec la fiche | Encerclement hors de la ligne, tentative de « désarrestation », procédure nulle si le fait n'est pas établi | Auteur remis avec fait daté et vidéo ; aucun coup après maîtrise |
| **Conducteur** | Amener, garder et replier les véhicules ; évacuer un blessé | Fourgon (D02 §4.1), radio de bord, extincteur de bord | Stationner en épi inversé, cap vers la sortie ; rester au volant ; avancer à l'allure du pas derrière la section ; ne jamais couper la retraite | Véhicule encerclé, incendié ; accident avec un piéton | Véhicules intacts et disponibles en moins de 60 s |
| **Secouriste-vidéo** (groupe C) | Premiers gestes sur agent ou tiers blessé ; filmer les sommations et les actions | Sac de secours, caméra | Garrot, compression, position latérale ; plan large pendant les sommations | Hors de la protection des boucliers pendant le soin | Tout blessé pris en charge en moins de 60 s |

### 2.4 Ce qu'il voit et entend

- **Vue** : à travers la visière puis le bouclier, tous deux rayés et embués par le gaz : contraste réduit, halo autour des flammes. [JEU] flou léger permanent visière baissée, champ de vision −15 %, −30 % avec masque à gaz (D03 §6.3).
- **Son** : slogans et huées en nappe ; chocs sourds des projectiles sur le polycarbonate ; « tac » sec du lanceur puis sifflement ; détonations de mortiers ; ordres brefs criés par le chef de groupe, doublés à la radio ; **sifflet** de fin de charge ; sommations au mégaphone, souvent peu audibles depuis la ligne (D01 §1.5).
- **Information** : le CRS de base ne voit **pas** la carte d'ensemble ; il connaît son chef, ses voisins, la consigne du moment.

### 2.5 Procédures pas à pas [JEU, calées sur D01]

| Procédure | Étapes | Durée |
|---|---|---|
| Tenir la ligne | Alignement (écart toléré 0,3 m) → visière → bouclier bas → parade haute à chaque alerte « Projectile ! » | continu ; parade réussie si levée moins de 0,6 s avant l'impact |
| Avancer par bond | Ordre « En avant, vingt mètres » → pas cadencé 1,2 m/s → arrêt net → réalignement | 17 s pour 20 m |
| Charger | Ordre « Chargez ! » (état `FORCE_AUTORISEE` ou riposte directe) → course 4 m/s sur 30 à 60 m → **sifflet** → arrêt en 1 s → repli au pas | 8 à 15 s + repli |
| Grenade à main | Ordre → dégoupiller → lancer en cloche 10 à 30 m → annoncer | 3 s |
| Tir au lanceur | Ordre du superviseur (portée, zone) → vérifier le vent et l'angle (≥ 30°) → tir → « Parti » → rechargement | 2 s + 4 s de rechargement |
| Tir de LBD | Désignation → épauler → cible fixe ou lente, torse ou membres, 10 à 50 m → tir → compte rendu radio → fiche en fin de mission | 2 à 4 s |
| Feu sur un agent | « Feu ! » → jet de 1 à 2 s sur la personne → reculer l'agent de deux rangs → secouriste | moins de 5 s |
| Interpellation | Désignation avec signalement → porte → saisie → sol → menottes → palpation → retour → remise + fiche (D01 §6.3) | 20 s dehors, 60 s en tout |
| Ouverture d'un couloir de secours | « Couloir ! » → deux agents pivotent, passage de 3,5 m → refermer | 6 s |

### 2.6 Boucle de jeu, score, échecs

| Poste | Boucle de 30 à 90 s | Points (jauge Mission) | Fautes (jauge Règle) | Échec dur |
|---|---|---|---|---|
| Bouclier | Tenir → parer → avancer ou reculer sur ordre → ouvrir la porte | +1 par 10 s d'alignement sous jets ; +3 par parade au profit d'un voisin | Coup de bâton sur personne non menaçante −15 ; sortie de ligne sans ordre −5 | Ligne percée à son poste et agent isolé hors de combat |
| Lanceur | Attendre l'ordre → régler → tirer → observer l'effet → compter | +5 si la zone visée se vide ; +3 si le vent a été pris en compte | Tir tendu −40 ; tir sans ordre −15 ; gaz sur terrasse, famille, poste de soins −20 | Blessé grave par tir tendu |
| LBD | Suivre la désignation → tirer une fois → rendre compte | +8 si l'auteur est atteint puis interpellé | Tête −60 ; moins de 10 m −25 ; tiers −40 ; hors cadre −30 | Blessé grave à la tête |
| Extincteur | Scruter → courir → éteindre → se replacer | +10 par agent éteint en moins de 3 s ; +4 par feu au sol éteint | Appareil vide sans avoir demandé la recharge −5 | Agent brûlé plus de 8 s |
| Interpellation | Repérer → attendre la fenêtre → sortir → ramener → remettre | +10 par remise avec fait et vidéo ; +5 si aucune force au-delà de la saisie | Coup après maîtrise −40 ; personne sans fait rattaché −25 ; journaliste, secouriste, observateur −35 | Binôme capturé hors de la ligne |
| Conducteur | Placer → surveiller → suivre → évacuer | +5 par repli sans dégât ; +10 par blessé évacué | Piéton heurté −50 ; retraite bloquée −10 | Véhicule détruit |

### 2.7 Cinq missions pour le CRS de base

| Mission | Lieu | Poste imposé | Objectif | Échec |
|---|---|---|---|---|
| « Le barrage du pont » | Pont de la Concorde, côté rive droite | Bouclier | Interdire le pont pendant 6 min sans céder un mètre, sans un seul coup hors cadre | Ligne percée ; coup sur un pacifique |
| « Vent tournant » | Boulevard Beaumarchais | Lanceur | Appuyer trois bonds de la section par trois tirs en cloche pendant que le vent tourne | Tir tendu ; gaz sur le cortège déclaré |
| « Un seul coup » | Place de la République | LBD | Sur désignation, arrêter l'auteur de jets répétés qui blesse la ligne ; l'interpellation doit suivre | Impact interdit ; tir non désigné |
| « Second rang » | Avenue de l'Opéra | Extincteur | Tenir 5 min sous jets enflammés : aucun collègue brûlé, deux poubelles éteintes avant propagation à une façade | Agent brûlé ; façade en feu |
| « Vingt secondes » | Rue de Rivoli, arcades | Interpellation | Sortir trois fois, ramener trois auteurs filmés par le drone, remettre trois fiches justes | Deux procédures nulles ; binôme isolé |

### 2.8 Interface du CRS

Viseur sobre ; **indicateur d'alignement** (deux chevrons qui verdissent quand on est dans l'axe de ses voisins) ; **ordre courant** en toutes lettres (« TENIR », « EN AVANT 20 m », « HALTE ») avec l'icône du sifflet ; **état de droit** (pastille : gris = cortège, orange = annonce faite, rouge = force autorisée, rouge cerclé = armes autorisées, éclair = riposte directe) ; alerte directionnelle de projectile (arc en haut de l'écran) ; pour les tireurs : cadre « DÉSIGNÉ » autour de l'objectif, télémètre (vert entre 10 et 50 m pour le LBD), indicateur d'angle de tir (rouge sous 30°), flèche de vent, compteur de munitions ; pour l'extincteur : jauge de charge ; pour l'interpellateur : chronomètre hors de la ligne et rappel du fait reproché ; pour le conducteur : distance à la section et itinéraire de repli.

> **Ce que le jeu doit reproduire — CRS, postes d'exécution**
> - Six postes aux sensations différentes, choisis au briefing : encaisser (bouclier), doser (lanceur), s'abstenir puis tirer une fois (LBD), veiller (extincteur), sortir et rentrer (interpellation), protéger la retraite (conducteur).
> - Aucun tir sans ordre ni désignation, sauf riposte directe : le superviseur PNJ parle au joueur, et inversement quand le joueur est chef.
> - Le sifflet arrête la charge ; dépasser le sifflet de plus de 2 s est une faute, même sans contact.
> - Le CRS de base n'a pas la vue d'ensemble : pas de carte tactique, seulement l'ordre courant et ses voisins.
> - La fatigue et les blessures de l'unité imposent des relèves ; une section à moins de 60 % de ses agents valides doit être relevée par le commandement.
> - Le bilan de fin compte les munitions par type et relie chaque tir à un ordre, une désignation et une vidéo.

---
