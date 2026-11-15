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
15. Les street medics agissent « en dehors de tout cadre légal », à deux ou trois, et passent la main aux secours dès que cela dépasse le premier secours. [S][R24][R25]
16. Le journaliste n'a **aucun signe distinctif obligatoire** ; la carte de presse n'est « pas obligatoire pour pratiquer le métier » ; il est menacé par les deux camps (douze agressions recensées en dix jours à l'automne 2026 : six par des manifestants ou des tiers, six par les forces de l'ordre). [V][R6] ; [S][R32][R29]
17. Le service d'ordre syndical protège le **carré de tête** et ses militants ; ses responsables disent que ce n'est pas à eux de « faire la police » ; il ne dépasse plus « 150 à 200 personnes ». [V][R8][R7]
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
| Fin de charge | Arrêt au sifflet ; la presse a relevé le cas d'agents ayant continué à charger après le sifflet | [S][R21] |
| Secouriste d'unité | Secouristes opérationnels formés en interne (diplômes de premiers secours en équipe de niveaux 1 et 2), sac dédié, capables d'une extraction en attendant les secours | [S][R37] |
| Pompiers | La brigade de sapeurs-pompiers intervient « avec des dispositifs autonomes ou intégrés dans nos unités ou celles des CRS et gendarmes » | [V][R7] |
| Vidéo | « la vidéo est devenue indispensable » pour présenter des éléments à la justice et « montrer le contexte dans lequel les policiers sont intervenus » | [V][R7] |
| Trace d'un tir | Tout agent ayant utilisé une arme renseigne une fiche de suivi de l'usage des armes | [S][R20] ; principe [V] D01 §3.9 |
| Vie en déplacement | Cantonnement collectif : « On mange et on dort quasiment en autarcie pendant un mois » ; indemnité journalière d'absence temporaire d'environ 43 € | [S][R22][R37] |
| État d'esprit | Pour un CRS, la priorité d'un commandant est de ramener ses hommes ; un policier regrette le contact permanent : « Ce qui fonctionnait, c'était la mise à distance. » | [S][R21] |
| Répartition des postes dans un groupe (nombre de boucliers, de lanceurs, de LBD, d'extincteurs) | **non trouvé** | [I] |
| Poids total de l'équipement, nombre de grenades emportées par un lanceur | **non trouvé** (D02 §10.1) | [I] |

Répartition proposée pour une section de 18 [JEU], compatible avec D01 §4.1 :

| Groupe | Effectif | Postes |
|---|---|---|
| A | 7 | 1 chef de groupe (superviseur), 4 boucliers, 1 lanceur de grenades, 1 porte-extincteur |
| B | 7 | 1 chef de groupe (superviseur), 3 boucliers, 1 LBD, 2 interpellateurs (binôme, petit bouclier) |
| C | 4 | 1 chef de section, 1 adjoint radio, 1 secouriste-vidéo, 1 lanceur de grenades de réserve |
| Véhicules | 2 | conducteurs restés aux fourgons (non comptés dans les 18), moteur prêt, à 80–200 m en arrière |

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
## 3. CRS : chef de groupe et chef de section
### 3.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Place | Le groupe C est le groupe de commandement de la section ; une section est commandée par un officier ou, plus souvent, un major ; les groupes A et B par des gradés | [S][R37] |
| Superviser les tirs | Le chef désigne les superviseurs ou l'est lui-même : il évalue la situation d'ensemble, s'assure que l'ordre est compris, désigne l'objectif, alerte sur le vent (D01 §3.2, §3.3) | [V] |
| Arrêter avant la faute | Un gradé raconte avoir dû se substituer à un subordonné qui perdait son sang-froid pendant une interpellation ; il insiste sur la formation des gradés pour interrompre une action avant qu'elle dérape | [S][R21] |
| Encadrement | La maîtrise de la violence repose « sur l'encadrement – son existence, sa formation, sa présence et sa force » | [V][R7] |
| Qualité de la procédure | Dans les commissariats visités en mars 2023, des fiches d'interpellation étaient « très succinctement renseignées » : « seules les cases correspondant aux différentes infractions reprochées sont cochées sans aucune précision sur les circonstances » ; 80 % de classements ont suivi | [V][R11] |
| Remède proposé | Fiches de mise à disposition standardisées, procès-verbaux dématérialisés, officiers de police judiciaire « de l'avant » ou cars d'officiers de police judiciaire près du dispositif | [V][R6] |
| Tracer | Le chef note l'heure de chaque ordre reçu et de chaque tir ; compte les munitions en fin de séquence (D01 §3.9) | [V] |
| Commandements à la voix exacts, gestes de commandement | **non trouvé** (propositions D01 §5.5) | [I] |

### 3.2 Ce qu'il fait, voit, risque
| | Chef de groupe (6 agents) | Chef de section (17 agents, 3 groupes) |
|---|---|---|
| Position | 2 m derrière ses boucliers, au centre | 5 à 8 m derrière la ligne, avec la radio |
| Voit | Sa ligne de dos, la foule par-dessus les casques | Toute la largeur de la rue ; carte de section |
| Entend | Radio de section, ses agents | Radio de compagnie + radio de section |
| Décide | Parade, porte, désignation d'objectif, arrêt d'un agent | Répartition des groupes, bond, demande de feu, relève interne |
| Rend compte à | Chef de section | Commandant de compagnie |
| Risques | Tir illégitime d'un subordonné, agent isolé | Section débordée par un flanc, munitions épuisées, procédure nulle |
| Réussite | Zéro tir non désigné, zéro agent isolé | Mission de section remplie, bilan exact, fiches complètes |

### 3.3 Boucle de jeu [JEU]
Roue d'ordres (un cran = un ordre, appliqué au groupe ou à la section) : « En ligne », « Boucliers hauts », « En avant n mètres », « Halte », « Reculez n mètres », « Porte ! », « Interpellez l'objectif », « Lanceur : portée, zone », « LBD : objectif », « Halte au feu », « Couloir ! », « Relève interne » (échange des groupes A et B), « Compte rendu ». Chaque ordre coûte 1 à 2 s de voix ; les agents PNJ obéissent avec un délai de 0,5 à 1,5 s selon leur fatigue et leur stress.

| Élément | Règle |
|---|---|
| Désignation | Viser un PNJ ayant un fait constaté de moins de 10 s (ou marqué par le drone) + touche « Désigner » : un cadre apparaît chez le tireur PNJ ; sans fait, l'ordre est refusé par le tireur une fois, exécuté s'il est répété (faute du chef) |
| Bouton « Stop ! » | Interrompt l'action d'un agent dont la jauge de stress dépasse 80 % ; fenêtre de 2 s ; réussi : faute évitée, +6 |
| Fiche | En fin d'interpellation, choisir la qualification (table D01 §6.4), l'heure, le lieu, le fait, la preuve (vidéo du secouriste-vidéo, drone, caméra-piéton) ; 4 champs justes sur 4 : procédure solide |
| Score | +2 par ordre exécuté dans le cadre ; +10 par séquence sans faute ; −10 par agent laissé isolé plus de 15 s ; −20 par tir de subordonné sans désignation ; −15 par fiche incomplète |
| Échec dur | Plus de la moitié du groupe ou de la section hors de combat ; faute pénale grave d'un subordonné que le chef pouvait arrêter |

### 3.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Angle mort » | Carrefour rue de Rivoli / rue du Louvre | Chef de groupe : tenir un angle de rue pendant qu'un groupe mobile tourne autour par les arcades ; aucun agent isolé | Agent capturé ou isolé 15 s |
| « Six désignations » | Place de la Bastille | Désigner six objectifs réels parmi une foule mêlée ; refuser trois demandes de tir injustifiées de la radio | Tir sur un tiers |
| « Sang-froid » | Boulevard Saint-Germain | Deux agents à bout après 12 min de jets : les arrêter à temps, obtenir la relève | Coup après maîtrise par un subordonné |
| « Fiches justes » | Châtelet | Chef de section : cinq interpellations, cinq fiches complètes remises au car des officiers de police judiciaire en moins de 8 min | Trois procédures classées |
| « Le flanc » | Boulevard de Sébastopol | Chef de section : un cortège sauvage arrive par la rue latérale pendant un refoulement ; réarticuler les trois groupes sans rompre | Section coupée en deux |

### 3.5 Interface
Vue de dos de ses agents avec **étiquette de poste et de stress** au-dessus de chacun (vert / orange / rouge) ; roue d'ordres ; file des tirs en attente de désignation ; journal horodaté des ordres reçus et donnés ; compteur de munitions du groupe ; mini-carte de section (les trois groupes, les véhicules, le point de remise des interpellés) ; chronomètre de garde à vue pour chaque interpellé non encore remis.

> **Ce que le jeu doit reproduire — Chefs de groupe et de section**
> - Le chef ne tire presque pas : il **regarde ses agents**, désigne, autorise, arrête.
> - Les PNJ ont un stress visible ; le chef qui ne relève pas ou ne freine pas à temps hérite de leurs fautes.
> - Une interpellation ne vaut que par sa fiche : fait, heure, lieu, preuve. Le jeu doit montrer au bilan ce que le parquet en fait.
> - Les ordres passent par la voix et la radio, avec des délais ; un ordre crié dans le vacarme à plus de 6 m n'est pas entendu.

---
## 4. CRS : commandant de compagnie
### 4.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Partage des rôles | L'autorité civile fixe la mission, le cadre et autorise la force ; le commandant choisit la manœuvre, l'articulation, le rythme, et riposte d'initiative aux violences contre son unité (D01 §4.5) | [V] |
| Interlocuteurs | Autorité civile à ses côtés ; salle de commandement « où chaque entité a ses représentants » | [V][R7] |
| Échelle parisienne | « soixante-cinq unités de forces mobiles » engagées pour un 1er mai ; « tout le monde n'est pas capable de gérer trente ou quarante unités de forces mobiles » en salle | [V][R7] |
| Formations mixtes | « groupes d'appui projetés », « constitués de deux compagnies de CRS et d'une de nos sections d'intervention civile » | [V][R7] |
| Déconcentration | Depuis fin 2018, les forces « peuvent réagir plus vite, sans remonter systématiquement à la salle de commandement, à condition de rester dans le cadre défini par l'autorité » | [V][R10] |
| Doctrine récente | « Désormais, la rapidité d'intervention prime. » ; mais la mobilité « ne va toutefois pas sans limites et peut s'avérer coûteuse » | [V][R6] |
| Dilemme central | « choisir entre interpeller un individu qui vient de commettre une exaction et maintenir le dispositif de maintien de l'ordre » | [V][R7] |
| Devoir envers la troupe | Ramener ses hommes est décrit comme la priorité d'un commandant ; des unités sont parfois placées en positions exposées | [S][R21] |
| Manœuvres nommées | Barrage, charge, bond offensif, lancer de grenades lacrymogènes à main (usage de la force seule) ; « vague de refoulement » ; « barrages de canalisation ou d'interdiction » (D01 §4.7) | [S][R38] ; [V] D01 |
| Géométrie, distances et vitesses réglementaires des manœuvres | **non trouvé** dans une source ouverte | [I] |

### 4.2 Les manœuvres, valeurs de jeu [JEU]
Front tenu : un bouclier occupe 0,7 m au coude à coude, 1,0 m en ligne lâche. Avec la section du §2.1 (9 boucliers, interpellateurs compris) : 6,3 m serrés, 9 m lâches. Une compagnie de quatre sections barre **25 m serrés ou 36 m lâches** ; au-delà (avenue des Champs-Élysées, 70 m : D04 §1.3), il faut des véhicules en travers, des barrières ou une seconde unité.

| Manœuvre | Ordre radio type | Géométrie et valeurs | État de droit requis (D01 §1.8) | Effet attendu (D03 §4.2) | Risque |
|---|---|---|---|---|---|
| **Barrage d'interdiction** | « MISTRAL 1 et 2 : barrage ferme, axe pont, face nord. » | 1 rang de boucliers, second rang à 3 m (tireurs, extincteur, chefs), véhicules en travers à 30 m derrière | aucun (posture statique) | La foule s'arrête à 10–20 m, proteste ; pression si le cortège pousse derrière | Compression de la foule si aucune déviation n'est ouverte |
| **Barrage filtrant** | « Barrage filtrant, une porte, contrôle visuel. » | Idem, porte de 1,5 m, 4 personnes par 10 s | aucun | Laisse sortir, calme | Lent : 24 personnes par minute |
| **Canalisation** | « MISTRAL 3 et 4 : canalisez, rues latérales fermées, parcours libre. » | Demi-groupes aux débouchés latéraux, à 10 m en retrait de l'axe, jamais en travers du parcours | aucun | Cortège guidé, invisible pour les pacifiques | Sections dispersées, lentes à regrouper (60–90 s) |
| **Bond offensif** | « MISTRAL 2 : bond offensif, trente mètres, en avant ! » | Ligne au trot (2,3 m/s) sur 20 à 40 m, arrêt, réalignement en 5 s ; pas de recherche du contact | `FORCE_AUTORISEE` ou riposte directe | Recul de la foule de 30–50 m, reprise d'un carrefour | Ligne distendue ; boucliers lents distancés |
| **Charge** | « MISTRAL 2 : chargez jusqu'à la rue X, sifflet à mon ordre. » | Course 4 m/s sur 30 à 60 m, bâton, sifflet, repli au pas sur la ligne de départ | `FORCE_AUTORISEE` ou riposte directe | Dispersion brutale, fuite par les rues latérales ; forte hausse de tension si des pacifiques sont pris | Agents isolés, coups filmés, chute de personnes |
| **Vague de refoulement** | « Compagnie : refoulement, axe boulevard, limite place Y, par bonds de cinquante. » | Ligne au pas (1,2 m/s), tronçons de 50 m, arrêt de 10 s, lacrymogènes à main en appui ; **issue libre devant la foule** | `FORCE_AUTORISEE` | Évacuation progressive de l'axe | Foule coincée si l'issue est fermée par une autre unité |
| **Encerclement** | « Bouclage îlot Z, sortie contrôlée rue W. » | Toutes les issues tenues sauf une sortie contrôlée de 2 m au moins ; annonce toutes les 60 s ; 20 min au plus | violences graves et imminentes (D01 §2.6) | Fixe un groupe violent ; angoisse et colère des pacifiques pris dedans | Faute si aucune sortie ou durée excessive |
| **Interpellation ciblée** | « MISTRAL 4 BRAVO : objectif désigné par ICARE, sortie flanc gauche. » | Binômes de la section d'intervention, 20 s hors de la ligne, appui d'un groupe | fait constaté | Retire un meneur violent ; bien acceptée si le fait était visible | Désarrestation, procédure nulle |
| **Repli** | « Rompez le contact, repli par échelons sur la ligne des véhicules. » | Un groupe couvre (lacrymogènes à main) pendant que l'autre recule de 30 m ; véhicules cap vers la sortie | toujours permis | La foule avance, tension locale en baisse si la distance est rétablie | Véhicules abandonnés, blessé oublié |
| **Relève** | « MISTRAL 3 relève MISTRAL 1 sur place, passage de ligne. » | Section fraîche à 10 m derrière, passage en 15 s, section relevée aux véhicules, récupération 120 s | aucun | Ligne à nouveau solide | Flottement de 15 s exploitable par la foule |
| **Délestage** | « Ouvrez la rue V au cortège. » | Lever un barrage latéral pour dévier le flux bloqué | aucun | Chute rapide de la densité (D03 §1.4) | Le cortège change de parcours |
| **Couloir de secours** | « Couloir pour SANTÉ 1, axe véhicules. » | Passage de 3,5 m tenu 30 à 90 s | aucun | Blessé évacué, image positive | Brèche dans la ligne |

### 4.3 Boucle de jeu, score, échecs [JEU]
1. **Lire** : carte tactique (positions des sections, cortège en densité, vent, retours du télépilote). 2. **Proposer** à l'autorité civile (PNJ ou joueur) : « Je propose un refoulement jusqu'à… ». 3. **Recevoir** l'autorisation ou le refus (délai 5 à 20 s ; 20 à 60 s si l'option « commandement centralisé » est active, D01 §4.4). 4. **Ordonner** : choisir une manœuvre, une ou plusieurs sections, un axe et une limite sur la carte. 5. **Suivre** l'exécution, réarticuler. 6. **Rendre compte** et relever.

| Jauge | Gains | Pertes |
|---|---|---|
| Mission | Axe tenu ou libéré dans le délai ; site protégé intact | Site envahi ; cortège déclaré empêché d'avancer sans motif |
| Règle | Chaque emploi de la force couvert par une autorisation horodatée ou par une riposte directe justifiée | Manœuvre de force avant la dernière sommation −30 ; encerclement sans sortie −40 ; force poursuivie après dispersion −20 |
| Intégrité | Moins de 5 % d'agents blessés ; relèves faites avant 60 % | Section laissée sans relève sous jets plus de 5 min −10 ; blessé non évacué −15 |
| Image | Sommations filmées, couloir de secours ouvert, pacifiques épargnés | Gaz sur le cortège déclaré −20 ; charge sur des personnes assises −30 |

Échec dur : compagnie rompue (deux sections hors de combat), site sensible perdu, ou désobéissance à un ordre exprès de l'autorité civile.

### 4.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Tenir la Concorde » | Place de la Concorde | Interdire les accès au pont et à la rue Royale avec quatre sections et des véhicules, pendant que le cortège contourne par les quais | Franchissement du pont |
| « La nébuleuse » | Boulevard du Temple → place de la République | Séparer un précortège violent de 300 personnes du cortège déclaré de 8 000 sans gazer ce dernier | Gaz ou charge sur le cortège déclaré |
| « Vingt minutes, pas plus » | Rue du Faubourg Saint-Honoré | Encercler un groupe de 60 casseurs avec sortie contrôlée, faire interpeller sur faits, lever le bouclage à temps | Pas de sortie ; plus de 20 min |
| « Ramener tout le monde » | Avenue de l'Opéra, nuit | Deux sections épuisées, une barricade en feu devant, un cortège sauvage derrière : replier sans laisser ni agent ni véhicule | Agent ou véhicule abandonné |
| « Commandant d'un jour » (mode libre) | Au choix | Démarrer directement au grade de commandant avec une compagnie complète sur un scénario de l'éditeur | Note inférieure à D |

### 4.5 Interface
Bascule instantanée `tps` ↔ **carte tactique** : sections en pions orientés (code « 1A »), effectif valide et munitions par pion, cortège en carte de densité, zones de gaz et vent, flammes, véhicules, issues ouvertes ou fermées, calque du drone (si un télépilote est en vol), limite autorisée par l'autorité civile en trait rouge ; panneau « Cadre en vigueur » avec l'heure de la dernière autorisation ; file radio (salle, autorité, sections) ; bouton « Proposer à l'autorité » ; alerte « relève conseillée » ; journal horodaté exportable au bilan.

> **Ce que le jeu doit reproduire — Commandant de compagnie**
> - Le commandant **propose**, l'autorité civile **dispose** : sans autorisation, seules les postures statiques, le repli et la riposte directe sont disponibles.
> - Douze manœuvres paramétrées (axe, limite, sections), exécutées par l'IA de section avec leurs délais et leurs défauts.
> - Le dilemme « interpeller ou tenir » est permanent : chaque binôme sorti affaiblit la ligne 20 à 60 s.
> - Une compagnie ne barre que 25 à 36 m : la largeur réelle des voies (D04) impose véhicules, barrières et coordination avec d'autres unités.
> - Le mode libre permet de démarrer directement commandant ; le mode Carrière ne l'ouvre qu'au grade correspondant.

---
## 5. Autorité civile : le commissaire
### 5.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Fonction | Seule l'autorité civile présente constate l'attroupement, fait les sommations, décide de l'emploi de la force et de l'usage des armes ; le commandant exécute (D01 §1.3, §4.5) | [V] |
| Insigne | Écharpe tricolore ou brassard tricolore, portés pendant l'exercice de la fonction (D01 §1.4) ; bleu `#0055A4`, blanc `#FFFFFF`, rouge `#EF4135`, glands argent `#C0C0C0` | [V] ; teintes [JEU] |
| Outil | Haut-parleur ; fusée rouge si le haut-parleur est impossible ou inopérant (D01 §1.5) | [V] |
| Effectif parisien | « trente commissaires de police, experts en maintien de l'ordre » à la direction de l'ordre public ; un commissaire très engagé dit participer à plus de deux cents dispositifs par an | [V][R7] ; [S][R20] |
| Sa place | Le directeur de l'ordre public : « Je dis à mes commissaires qui partent en chargeant que ce n'est pas leur place, car ils doivent avoir une vue d'ensemble afin d'organiser les manœuvres. C'est uniquement de cette façon qu'il est possible d'éviter des dérapages. » | [S][R20] |
| Avec quelle unité | Une commissaire est « engagée en tant qu'autorité civile avec une unité des forces mobiles » ; un autre commissaire a « sous son autorité la BRAV-M » | [V][R19] |
| Il est exposé | Lors d'un rassemblement non déclaré de juillet 2023 place de la République : « un autre individu a invectivé et violemment frappé une commissaire de police, engagée en tant qu'autorité civile » | [V][R19] |
| Interpellation différée | Dans le même épisode, l'ordre d'interpeller a été donné mais exécuté « qu'une fois la manifestation dispersée, afin de ne pas provoquer de mouvement de foule » | [V][R19] |
| Sommations mal entendues | Le schéma national veut des sommations « beaucoup plus visibles – et lisibles » ; « L'utilisation de panneaux lumineux et l'envoi de SMS sont des solutions envisagées » ; le Sénat cite en 2026 « panneaux à messages variables, hyperspike, camions avec haut-parleurs » (l'hyperspike « est un haut-parleur à haute puissance » ; en jeu : « haut-parleur de forte puissance ») | [V][R10][R6] |
| Liaison avec les organisateurs | Brigades d'information de la voie publique : « 140 personnels en civil » assurant « la liaison constante avec les organisateurs » ; équipes de liaison et d'information jugées « atout » par des préfets ; côté syndicats : « pendant la manifestation, nous n'avons plus de contact » | [V][R7][R6][R8] |
| Lien avec la salle | Salle de commandement de la direction de l'ordre public, qui reçoit seule (avec le télépilote) les images de drone ; décision de plus en plus déconcentrée vers le terrain | [V][R3][R10] |
| Volet judiciaire | 2 444 interpellés traités en 2019 à Paris ; le Sénat veut des officiers de police judiciaire « de l'avant » et un magistrat en salle de commandement | [V][R7][R6] |
| Responsabilité personnelle | L'autorité civile répond de ses décisions, et de ses propres gestes : un commissaire a été mis en cause pour des coups et pour un lancer de grenade, et pour n'avoir pas rempli la fiche de suivi de l'usage des armes | [S][R20] |
| Indicatifs radio réels, emplacement de la salle | **non trouvé** (D01 §4.4, §5.4) | [I] |

Paroles exactes (article R. 211-11 du code de la sécurité intérieure, D01 §1.2) [V] :
1. « Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux »
2. « Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux »
3. « Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux » (répétée mot pour mot avant l'usage des armes)

### 5.2 Ce qu'il fait, voit, risque
| Aspect | Description |
|---|---|
| Position | À 10–30 m derrière la ligne, à côté du commandant ; jamais en tête de charge |
| Équipement | Tenue de service ou civile, casque léger possible, écharpe, mégaphone, deux radios (salle et unité), pas de bouclier, arme de service |
| Voit | La foule par-dessus la ligne ; la carte ; les messages de la salle ; les comptes rendus du télépilote relayés par la salle |
| Entend | Deux réseaux radio à la fois, le commandant, les organisateurs par l'équipe de liaison |
| Gestes | Constater (voir des infractions de ses yeux ou par compte rendu), mettre l'écharpe, annoncer, sommer, autoriser en fixant **moyens et limite**, suspendre, lever, rendre compte |
| Risques | Sommations inaudibles (procédures fragiles), autorisation trop large, foule sans issue, agression, mise en cause personnelle |
| Réussite | Trouble traité avec le moins de force possible ; chaque emploi couvert ; cortège déclaré arrivé à destination ; zéro blessé grave |

### 5.3 Boucle de jeu, score, échecs [JEU]
| Étape | Action du joueur | Règle |
|---|---|---|
| 1. Constater | Viser la zone, valider « Je constate » | Possible si au moins 3 infractions distinctes en 60 s dans la zone, vues directement à moins de 80 m ou rapportées par un agent ou le drone |
| 2. Qualifier | Choisir : « Cortège pacifique », « Trouble localisé : interpellations ciblées », « Attroupement » | Qualifier d'attroupement un cortège calme : −30 Règle |
| 3. S'identifier | Mettre l'écharpe (1,5 s) | Sommations sans écharpe : nulles |
| 4. Annoncer et sommer | Trois boutons successifs ; texte affiché et prononcé | Intervalles minimaux D01 §1.6 (30 s / 30 s / 20 s en mission de 25 min) ; **couverture sonore** affichée : cône de 60 m intelligible, 120 m audible ; fusée rouge en complément |
| 5. Vérifier l'issue | Regarder la carte : au moins une issue libre de 6 m | Issue fermée : la foule ne peut pas partir, tension +, −25 Règle |
| 6. Autoriser | Choisir les moyens (refoulement, lacrymogènes à main, engin lanceur d'eau ; puis après réitération : lanceurs, grenades assourdissantes, désencerclement) et tracer la **limite** sur la carte | L'autorisation est horodatée ; le LBD n'apparaît jamais dans cette liste (D01 §3.2) |
| 7. Suspendre, lever | « Halte à l'emploi de la force » dès que le trouble cesse | Force poursuivie 20 s après dispersion : −20 |
| 8. Rendre compte | Message à la salle, bilan | Bilan faux ou absent : −10 |

Points : +15 par séquence close sans blessé grave ; +10 si 80 % des pacifiques ont quitté la zone avant la force ; +10 si le cortège déclaré arrive à destination ; +5 par refus motivé d'une demande de force injustifiée ; −40 pour un emploi de la force sans sommation hors riposte directe ; −15 si moins de 50 % de la foule visée était dans la couverture sonore. Échec dur : mort ou mutilation imputable à une autorisation hors cadre ; l'autorité civile hors de combat sans suppléant (toute dispersion devient impossible).

### 5.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Obéissance à la loi » | Place de la République | Constater, annoncer, sommer dans les formes ; 80 % de la place vidée avant tout emploi de la force | Force avant la dernière sommation |
| « Non » | Boulevard Voltaire | Le commandant PNJ demande trois fois l'emploi de la force sur un cortège pacifique sous tension : refuser, faire dialoguer l'équipe de liaison, laisser passer | Autorisation accordée |
| « Inaudible » | Avenue des Champs-Élysées (70 m de large) | Le mégaphone ne couvre pas la foule : obtenir un véhicule sonorisé, doubler par fusées rouges, sommer deux fois sur deux compartiments | Moins de 50 % de couverture |
| « Deux réseaux » | Hôtel de Ville | Arbitrer entre une salle de commandement qui pousse à intervenir et un terrain qui se calme ; ne rien déclencher d'inutile pendant 6 min | Affrontement provoqué par l'intervention |
| « Différer » | Rue du Faubourg-du-Temple | Un auteur de violences est au cœur d'une foule dense : ordonner l'interpellation différée, la faire exécuter après dispersion grâce au suivi du drone | Mouvement de foule provoqué |

### 5.5 Interface
Écharpe (portée / non portée) ; panneau **« Séquence légale »** à cinq cases (constat, annonce, première, dernière, réitération) avec minuteries ; **cône de couverture sonore** sur la carte et pourcentage de la foule couverte ; issues colorées (vert libre, rouge fermée) ; fenêtre d'autorisation (moyens cochés, limite tracée, heure) ; deux files radio distinctes (salle / unité) ; compteur d'infractions constatées dans la zone ; rappel permanent : « Le lanceur de balles de défense n'est pas un moyen de dispersion ».

> **Ce que le jeu doit reproduire — Autorité civile**
> - Le commissaire ne se bat pas : il **regarde, parle, autorise, refuse, arrête**. Sa meilleure partie est celle où la force n'a pas servi.
> - Les trois phrases exactes, l'écharpe, les minuteries et la couverture sonore sont des mécaniques, pas un décor.
> - L'autorisation porte toujours sur des **moyens** et une **limite** ; tout ce qui dépasse est une faute du commandant, tout ce qui est trop large est une faute du commissaire.
> - L'issue libre est une condition de validité : sommer une foule enfermée ne produit que des procédures nulles et de la colère.
> - Le commissaire peut être agressé ; s'il tombe, le dispositif perd sa capacité légale de dispersion jusqu'à l'arrivée d'un suppléant.

---
## 6. Policier de BRAV-M
### 6.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Nature | « brigades mobiles constituées de binômes à moto, avec des personnels de la DOPC et de la Garde républicaine » (situation décrite fin 2020) | [V][R7] |
| Création | Mars 2019, à partir des détachements d'action rapide de décembre 2018 | [S][R18] |
| Qui fait quoi | « les effectifs qui assurent le maintien de l'ordre ne sont pas les conducteurs, mais les passagers, qui mettent pied à terre avant de former des groupes et d'intervenir » | [V][R10] |
| Raison d'être | Se déplacer « rapidement dans Paris sans être contraintes par les embarras de circulation et intervenir face à des groupes à risque » qui cherchent à « éclater » les forces | [V][R10] |
| Pilotes et passagers | Depuis 2020, pilotes du service motocycliste d'une compagnie d'intervention (plus d'une centaine en 2024) ; passagers appelés opérateurs, issus des compagnies d'intervention | [S][R18] |
| Commandement | Un commissaire a la BRAV-M « sous son autorité » sur le terrain ; l'ensemble compagnies d'intervention + BRAV-M représentait environ 1 300 agents en 2024 | [V][R19] ; [S][R20] |
| Différence revendiquée avec les anciens voltigeurs | Les voltigeurs « faisaient de l'ordre public à moto, matraque en main » ; les BRAV sont « tout sauf des voltigeurs » ; ces pelotons avaient été dissous en 1986 après la mort d'un jeune homme | [V][R10] ; [S][R18] |
| Variante | « BRAV quatre roues » (même principe en véhicules) | [V][R7] |
| Controverses | Enregistrement sonore d'une équipe tenant des propos humiliants et menaçants (mars 2023) ; saisine de l'inspection générale le 24 mars 2023 ; pétition de dissolution : **263 887 signatures**, classée le 5 avril 2023 ; rapport d'un observatoire (90 observations depuis 2019) les jugeant « violentes et dangereuses » ; condamnations de policiers en juillet 2025 (jusqu'à un an avec sursis) ; un piéton mort percuté par une moto de l'unité en décembre 2023 (procédure classée) | [S][R18] |
| Critique de fond | Le contact recherché rompt avec la mise à distance ; la mobilité « peut s'avérer coûteuse » | [V][R6] |
| Nombre de motos par unité, armement détaillé, formation | **non trouvé** ; valeurs de jeu D01 §4.3 : 18 motos, 36 agents, 3 groupes de 6 motos | [I] / [JEU] |

### 6.2 Ce qu'il fait, voit, risque
| | Pilote | Passager (opérateur) |
|---|---|---|
| Tenue | Noire, casque de moto conservé, protections (D02 §1.4) | Idem, casque gardé à pied |
| Porte | Radio, bâton, arme de service | Bâton, gazeuse, menottes ; par groupe : 1 LBD, grenades à main |
| En route | Conduit en colonne par deux, 30–50 km/h, feux bleus ; ne s'engage **jamais** dans une foule | Observe, écoute la radio, repère l'objectif |
| À l'arrêt | Béquille, reste près des machines ; 1 pilote sur 3 garde les motos (D01 §4.3) | Descend en 5 s, forme un groupe de 6 à 12, intervient à pied |
| Voit | La chaussée, les intersections, peu la foule | L'objectif désigné par la radio ou le drone |
| Risques | Chute, collision avec un piéton, motos incendiées ou volées | Groupe peu nombreux isolé loin des unités lourdes ; interpellation contestée ; propos ou gestes filmés |
| Réussite | Arriver avant que le groupe violent se disperse, sans accident | Auteur interpellé sur un fait établi, remis proprement, retour aux motos |

### 6.3 Boucle de jeu, score, limites [JEU]
**Boucle** : écoute radio (« FAUCON 2, groupe de quinze, vitrines, rue X ») → itinéraire par les rues libres → arrêt à 40–80 m, hors de vue si possible → débarquement (5 s) → progression à pied en colonne puis en ligne → interpellation sur fait établi ou mise en fuite → retour (moins de 3 min d'absence) → remise au point de regroupement → remonter, repartir.

| Règle | Valeur |
|---|---|
| Vitesse maximale à moins de 30 m de piétons | 20 km/h ; au-delà : −10 par seconde, et tout contact avec un piéton = échec dur |
| Aucun geste de force depuis une moto en mouvement | Bâton et gazeuse désactivés en selle |
| Distance d'appui | À plus de 300 m de toute unité lourde, le groupe est « isolé » : la foule hostile est +30 % agressive |
| Image | Malus d'image doublé pour toute faute filmée (unité sous surveillance publique permanente) ; un observateur PNJ suit l'unité dans 1 mission sur 2 |
| Points | +12 par auteur interpellé avec fait et vidéo ; +6 par groupe violent dispersé sans blessé ; +5 si arrivée en moins de 90 s ; −25 par personne sans fait rattaché ; −40 par coup après maîtrise ; −15 par moto perdue |
| Échec dur | Piéton percuté ; binôme hors de combat ; faute grave filmée (propos dégradants compris) |

### 6.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Avant la casse » | Rue de la Paix → place Vendôme | Rejoindre en 90 s un groupe signalé par le drone, interpeller deux auteurs après le premier bris de vitrine | Arrivée après la dispersion ; interpellation sans fait |
| « Cortège sauvage » | Grands Boulevards, nuit | Suivre un groupe mobile de 80 personnes pendant 8 min, l'empêcher d'atteindre trois cibles, sans jamais rouler dans la foule | Piéton heurté ; deux cibles atteintes |
| « Le pilote » | Quais de Seine → Hôtel de Ville | Jouer le pilote : mener la colonne par un itinéraire libre, garder les motos pendant l'intervention, repousser sans coup deux tentatives de vol | Moto perdue |
| « Sous le regard » | Place de la Bastille | Toute l'intervention est filmée par cinq téléphones et une équipe d'observateurs : aucune faute, aucun mot de trop | Faute d'image supérieure à −10 |
| « Isolés » | Rue Oberkampf | Le groupe est pris à partie à 400 m de tout renfort : rompre le contact, récupérer un agent tombé, rejoindre la ligne de CRS | Agent abandonné |

### 6.5 Interface
En selle : compteur de vitesse avec zone rouge près des piétons, GPS avec rues ouvertes ou barrées, position des autres motos de la colonne, objectif radio (flèche et distance), jauge d'« isolement ». À pied : chronomètre d'absence des motos, marqueur de l'objectif désigné, rappel du fait reproché, icônes des caméras qui filment, bouton « Retour aux motos ».

> **Ce que le jeu doit reproduire — BRAV-M**
> - Un rôle en deux temps : **aller vite à moto**, puis **agir à pied** ; le passager travaille, le pilote amène et garde.
> - La moto n'est pas une arme : pas de coup en selle, vitesse bridée près des piétons, accident = fin de mission.
> - Force : la vitesse et les interpellations ; faiblesse : petit groupe, isolé, très filmé, réputation fragile.
> - Les controverses réelles se traduisent par des règles (malus d'image doublé, observateurs attachés à l'unité), jamais par une mise en scène complaisante.

---
## 7. Gendarme mobile, équipage du Centaure
### 7.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Équipage | « Trois opérateurs permettent de piloter et d'assurer les différentes fonctionnalités » ; un pilote, un chef d'engin, un opérateur radio-tireur ; 7 passagers ou une équipe médicale | [V] D02 §4.3 ; [S][R17][R13] |
| Rôles | Le chef d'engin mène l'équipage ; le pilote est aux commandes ; l'opérateur commande le lance-grenades, la station téléopérée et la caméra d'environnement | [S][R13] |
| Formation | Brevets remis après quatre semaines de formation (chefs d'engin, opérateurs radio-tireurs, pilotes) ; quatre engins stationnés au centre d'entraînement pour la formation des escadrons | [S][R13][R14] |
| Lance-grenades | Sur le toit, téléopéré, **30 coups** ; « de 1 à 30 tirs en série » (D02 §4.3) ; une seconde série de 30 serait possible après rechargement | [V] D02 ; [S][R15][R16] |
| Autres moyens | Diffuseurs de lacrymogène autour de la caisse ; mitrailleuse possible mais bâchée et démontée en maintien de l'ordre | [S][R15][R16] |
| Lame | Lame avant sur vérins : percute et pousse des obstacles et véhicules jusqu'à 3,5 t à 30 km/h ; sert à « dégager les axes » ; démonstration : percussion de voitures pour ouvrir une route | [S][R16][R14][R15] |
| Capteurs | Vision à 360°, caméra jour et nuit portant de 3 à 9 km, détecteur acoustique de tirs | [V] D02 ; [S][R16] |
| Abri mobile | Protège l'équipage, les passagers et les troupes à pied qui se placent derrière lui | [S][R14] |
| À bord | Habitacle climatisé, en surpression ; question du pilote avant de rouler : « Tout le monde est attaché ? » | [S][R15] |
| Qui décide de l'engager | Engagement de blindés en maintien de l'ordre : autorité gouvernementale (Premier ministre) ; un préfet de zone peut autoriser un peloton de deux blindés | [S][R14][R38] ; [V] D01 §4.2 |
| Emplois connus | Première sortie dans la nuit du 30 juin au 1er juillet 2023 ; mobilisations agricoles de 2024 (ligne d'interdiction aux engins agricoles) ; 24 engins annoncés pour une journée de manifestations ; une vingtaine engagés en octobre 2026 | [S][R16][R14][R17] |
| Réserves | La Cour des comptes s'est interrogée sur le dimensionnement du programme ; pannes d'instruments rapportées outre-mer | [S][R16] |
| Cadence de tir, angle, portée des grenades du tourelleau ; disposition des postes à bord ; champ de vision du pilote | **non trouvé** | [I] |

### 7.2 Les trois sièges
| | Pilote (`driver`) | Chef d'engin | Opérateur radio-tireur (`gunner`) |
|---|---|---|---|
| Mission | Placer 14,5 t au mètre près, pousser sans écraser | Commander l'engin, parler à l'escadron, autoriser chaque tir et chaque poussée | Observer, transmettre, tirer la salve ordonnée |
| Commandes | Volant, lame (lever / baisser), allure lente | Radio d'escadron, interphone, sonorisation extérieure | Manche du tourelleau, sélecteur du nombre de coups (1 à 30), zoom, caméras |
| Voit | Pare-brise blindé étroit + écran des caméras périphériques | Écrans 360° + carte | Caméra du tourelleau (jour / thermique) |
| Entend | Interphone, moteur, chocs sur la caisse | Deux réseaux radio | Interphone, ordres de tir |
| Risque propre | Piéton dans l'angle mort, obstacle habité (voiture occupée, personne derrière la barricade) | Tir ou poussée hors cadre | Salve sur un cortège pacifique, grenades sur un toit ou une terrasse |

### 7.3 Procédures de jeu [JEU]
| Procédure | Étapes | Valeurs |
|---|---|---|
| Approche | Les gendarmes à pied ouvrent, l'engin suit en second rideau | 6 km/h avec piétons à moins de 15 m ; 30 km/h au plus en rue dégagée |
| Abri mobile | L'engin avance, une colonne de 8 gendarmes PNJ progresse derrière | Zone abritée : 3 m de large × 6 m derrière la caisse |
| Dégager une barricade | Chef : « Vérification obstacle » (caméra, 3 s : personne dedans ni derrière) → sonorisation : « Écartez-vous, l'engin va dégager l'obstacle » → lame basse → poussée | Poussée à 5–8 km/h ; obstacles légers (bacs, barrières, mobilier) : 2 à 4 s ; voiture : 6 à 10 s ; au-dessus de 12 t immobilisées : impossible (D02 §4.3) |
| Barricade en feu | Pousser en dispersant le foyer, puis appeler l'engin lanceur d'eau ou les pompiers | Le feu se divise en 2 à 4 foyers plus petits |
| Salve de lacrymogènes | Ordre du commandant d'escadron dans le cadre autorisé (`ARMES_AUTORISEES` ou riposte directe) → chef : « Salve de n, zone … » → opérateur : pointer **en cloche**, vérifier zone d'arrivée libre de tiers protégés → tir | 1 à 30 coups, 0,3 s entre deux coups [JEU] ; portée 50 à 200 m ; nappe de 20 à 60 m de large selon n |
| Rechargement | Hors contact, à l'arrêt, par l'équipage | 120 s [JEU] |
| Repli | Marche arrière guidée par les caméras, gendarmes à pied en serre-file | 5 km/h |

### 7.4 Boucle de jeu, score, échecs [JEU]
Boucle : attendre hors de vue → être engagé sur ordre → avancer avec les piétons → dégager ou couvrir → salve dosée si ordonnée → reculer → recharger. Points : +15 par barricade dégagée sans blessé ; +10 par progression de peloton abritée sous jets ; +8 par salve dosée (le plus petit nombre de coups qui obtient l'effet) ; −20 par salve de plus de 10 coups quand 5 suffisaient ; −30 pour une salve touchant le cortège pacifique, une terrasse, un poste de soins ; −50 pour une poussée sur obstacle non vérifié. Échec dur : personne écrasée ou coincée ; engin immobilisé et incendié ; tir sans ordre.

### 7.5 Cinq missions
| Mission | Lieu | Siège | Objectif | Échec |
|---|---|---|---|---|
| « La lame » | Boulevard Saint-Michel | Pilote | Dégager trois barricades (dont une en feu) pour ouvrir l'axe aux pompiers | Poussée non vérifiée |
| « Une salve, pas trente » | Place de l'Étoile | Opérateur | Sur ordre, repousser un groupe de 200 violents avec le moins de coups possible, vent de travers | Gaz sur le cortège ; plus de 15 coups |
| « Chef d'engin » | Avenue de la Grande-Armée | Chef | Coordonner pilote et opérateur PNJ, refuser un tir demandé hors cadre, couvrir un peloton | Tir hors cadre |
| « Abri mobile » | Rue de Rivoli | Pilote | Avancer de 200 m sous jets avec 8 gendarmes derrière soi pour récupérer un blessé | Gendarme laissé à découvert plus de 10 s |
| « Nuit de violences » | Abords de la place de la République | Équipage complet (changement de siège libre) | Ouvrir un itinéraire aux secours à travers quatre obstacles, sans une seule salve inutile | Itinéraire non ouvert en 10 min |

### 7.6 Interface
Pilote : vue pare-brise étroite, **mosaïque de quatre caméras** (avant, arrière, flancs), silhouettes des piétons proches surlignées, hauteur de lame, indicateur de masse poussée, allure en km/h avec seuil. Opérateur : réticule du tourelleau, **angle de site** (rouge sous 30°), sélecteur de coups, compteur 30 → 0, zone d'arrivée projetée au sol avec le vent, bascule jour / thermique, zoom. Chef d'engin : carte, deux files radio, boutons « Autoriser le tir » et « Autoriser la poussée », micro de sonorisation avec phrases types.

> **Ce que le jeu doit reproduire — Centaure**
> - Trois sièges, trois métiers, un seul engin ; le joueur peut changer de siège à l'arrêt.
> - L'engin est **lent, lourd, presque aveugle de près** : sa conduite est un exercice de retenue, pas de vitesse.
> - La salve se dose de 1 à 30 ; la bonne salve est la plus petite. Toujours en cloche, toujours sur ordre.
> - La lame dégage, elle ne charge jamais des personnes ; toute poussée exige une vérification d'obstacle.
> - L'engagement d'un blindé est une décision rare, prise au-dessus du terrain : dans l'éditeur de scénario, c'est une option à cocher, pas un moyen par défaut.

---
## 8. Opérateur de l'engin lanceur d'eau
### 8.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Statut | « moyens d'appui ayant uniquement vocation à faciliter et appuyer les manœuvres des unités constituées » ; emploi **après les sommations**, décidé par l'autorité civile (D02 §4.2, D01 §3.6) | [V] |
| Qui les met en œuvre | CRS : sections des moyens spécialisés, une par direction zonale (engins de plusieurs familles) ; à Paris : le service de soutien opérationnel de la direction de l'ordre public « gère des équipements utiles au maintien de l'ordre – barrières, tracteurs anti-barricades, engins lanceurs d'eau » | [S][R37] ; [V][R7] |
| Valeurs physiques | 20 bars ; cuve de 4 000 à 10 000 litres ; environ 15 litres par seconde ; portée d'une soixantaine de mètres ; 1 ou 2 canons de toit (D02 §4.2) | [V] / [S] D02 |
| Commande | Versions modernes commandées à distance au manche depuis la cabine ; modes : flux continu, impulsions, jet dur ou pulvérisation | [S][R40] |
| Additifs | Émulsifiant anti-incendie pour éteindre barricades, poubelles et véhicules ; colorant et lacrymogène jamais employés contre des manifestants selon le ministère (D02 §4.2) | [V] |
| Perception côté CRS | « c'est non létal, non toxique, et ça ne fait de mal à personne » (un CRS) | [S][R22] |
| Risques documentés | Blessures internes possibles ; tirs au visage ou au tronc à courte distance à haut risque ; journalistes identifiés touchés (D03 §7) | [S][R40] |
| Équipage | 2 ou 3 selon le modèle (donnée de constructeur, D02) ; répartition des tâches, distance minimale d'emploi, consignes de visée : **non trouvé** | [I] |

### 8.2 Postes, procédures et valeurs de jeu [JEU]
Trois sièges : **conducteur** (place l'engin 10–15 m derrière la ligne, dans l'axe), **chef d'engin** (radio avec le commandant et l'autorité civile, autorise chaque rafale), **opérateur** (manche, mode de jet, visée). Cuve de jeu : 8 000 litres.

| Mode de jet | Portée utile | Débit | Effet sur une personne | Usage |
|---|---|---|---|---|
| Pluie (jet en cloche) | 40 m | 8 l/s | Trempe et refroidit : la moitié des non-violents quittent la zone en 10 s | Avertissement, première gradation |
| Diffusé (cône) | 15 à 20 m | 12 l/s | Repousse de 1 m/s, aucune chute | Dégager le contact devant la ligne |
| Jet droit | 30 à 40 m | 15 l/s | Repousse de 2 à 3 m/s ; chute si la personne est à moins de 15 m | Rompre un groupe violent, renverser une barricade légère |
| Impulsions | 30 m | 15 l/s par salve de 0,5 s | Fait lâcher un objet, interrompt un lancer | Auteur isolé derrière un abri |
| Extinction (émulsifiant) | 25 m | 10 l/s | — | Poubelle : 3 s ; barricade : 8 à 15 s ; véhicule : 20 à 30 s |

Règles : viser **le sol devant les pieds puis les jambes**, jamais la tête ; jet droit interdit à moins de 15 m ; aucune rafale avant la dernière sommation (sauf extinction, toujours permise) ; rafales de 3 à 10 s ; autonomie de 9 min de jet droit continu ; ravitaillement sur une bouche d'incendie repérée sur la carte : 90 s en jeu (plusieurs minutes en réalité) ; l'engin est une cible prioritaire (peinture sur les caméras, projectiles) et doit être gardé par une demi-section.

### 8.3 Boucle de jeu, score, échecs
Boucle : suivre la ligne → attendre l'autorisation → choisir le mode le plus doux qui suffit → rafale → observer → éteindre ce qui brûle → gérer l'eau → ravitailler. Points : +10 par groupe violent repoussé de 30 m sans chute ; +12 par feu éteint avant propagation ; +5 par ligne dégagée du contact ; −40 pour un jet à la tête ; −25 pour un jet droit à moins de 15 m ; −30 sur un tiers protégé (journaliste, secouriste, observateur) ou une personne à terre ; −15 pour une rafale avant la dernière sommation ; −10 si la cuve est vide au moment d'un feu. Échec dur : blessé grave par jet ; engin abandonné ; piéton heurté.

### 8.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Première pluie » | Place de la Bastille | Après sommations, vider la place par gradation (pluie, diffusé, jet droit) : aucune chute, aucun jet haut | Jet à la tête |
| « Pompier malgré lui » | Boulevard Haussmann | Éteindre cinq feux (poubelles, barricade, deux-roues) avant qu'ils gagnent les façades, sous jets de projectiles | Façade en feu |
| « Huit mille litres » | Champs-Élysées | Tenir 10 min avec une seule cuve : économiser, ravitailler une fois sans découvrir la ligne | Cuve vide pendant un feu |
| « Le conducteur » | Rue de Rivoli | Suivre un refoulement de 600 m, toujours à 10–15 m de la ligne, sans toucher mobilier ni piéton | Collision |
| « Tiers protégés » | Place de la République | Un groupe violent est mêlé à des journalistes et à un poste de soins improvisé : n'atteindre que les auteurs | Tiers touché |

### 8.5 Interface
Vue tourelle avec **réticule au sol** (ellipse d'impact), télémètre (rouge sous 15 m en jet droit), sélecteur de mode, jauge de cuve en litres et en secondes restantes, indicateur d'autorisation (cadenas ouvert ou fermé), silhouettes « tiers protégé » surlignées en blanc, icône des bouches d'incendie sur la mini-carte, alerte « feu » directionnelle.

> **Ce que le jeu doit reproduire — Engin lanceur d'eau**
> - Un moyen d'appui gradué : pluie, diffusé, jet droit ; l'opérateur est noté sur le mode **le plus doux qui suffit**.
> - Jamais avant la dernière sommation, jamais à la tête, jamais à bout portant ; l'extinction est toujours permise et rapporte autant que la dispersion.
> - L'eau est une ressource : cuve finie, ravitaillement long, engin vulnérable à l'arrêt.

---
## 9. Télépilote de drone de la préfecture
### 9.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Service | « l'unité des moyens aériens intervient avec des drones » au sein de la direction de l'ordre public | [V][R7] |
| Autorisation | Arrêté du préfet de police pris pour l'événement ; pour une manifestation de septembre 2024 : demande de la direction de l'ordre public trois jours avant, « 2 caméras embarquées sur des aéronefs télé-pilotés », périmètre « figurant sur le plan en annexe », « de 7h00 à 20h00 » | [V][R1] |
| Finalités écrites | « la prévention des atteintes à la sécurité des personnes et des biens ; la sécurité des rassemblements ; la prévention d'actes de terrorisme » ; la loi vise aussi « l'appui des personnels au sol, en vue de leur permettre de maintenir ou de rétablir l'ordre public » | [V][R1] |
| Justification | « disposer d'une vision en grand angle tout en limitant l'engagement des forces au sol » ; ailleurs : « orienter les policiers sur le terrain et prévenir les violences à leur endroit » | [V][R1][R2] |
| Information du public | Publication de l'arrêté, mise en ligne, « information sur les réseaux sociaux » ; un registre des vols est transmis au préfet à l'issue | [V][R1] |
| Interdits | Pas de captation du son ; pas de reconnaissance faciale ; pas de rapprochement automatisé avec d'autres fichiers ; pas d'images de l'intérieur des domiciles : l'enregistrement est interrompu, sinon les images sont supprimées « au plus tard dans un délai de 48 heures » | [V][R4] |
| Conservation | 7 jours au plus après la fin du déploiement, sans accès sauf signalement à la justice ; autorisation de 3 mois au plus, limitée à la durée du rassemblement pour une manifestation | [V][R4] |
| Où va l'image | Fiche interne de 2020 : renvoi vers la salle de commandement par un serveur distinct ; « hormis le télépilote, seule la salle de commandement peut bénéficier d'un renvoi d'image et uniquement sur un écran spécifique » ; floutage des silhouettes, des véhicules, des fenêtres (dispositif de l'époque, antérieur à la loi de 2022) | [V][R3] |
| Effectifs et formation | Police nationale : 257 drones, 137 télépilotes, formés dans un centre de l'école de l'air (chiffres de 2021) ; gendarmerie : 299 drones, 327 télépilotes | [V][R5] |
| Travail en binôme | En gendarmerie, binôme « télépilote / chef de mission » décrit comme indissociable ; chaque mission est tracée (qui, où, quand, combien de temps) | [S][R42] |
| Tendance | Le Sénat propose en 2026 d'acquérir des drones, de former plus d'opérateurs, de lever le plafond de drones par département et de créer des « drones judiciaires, avec des opérateurs chargés de rechercher les auteurs d'infractions » | [V][R6] |
| Appareil | Un arrêté voisin nomme un petit quadricoptère pliable du commerce (D02 §5 pour le gabarit) | [V][R2] |
| Caméra thermique en manifestation à Paris, altitude de vol, autonomie réelle, emplacement du télépilote | **non trouvé** | [I] |

### 9.2 Ce qu'il fait, voit, risque
Posté sur un toit-terrasse ou près du véhicule de commandement, en binôme : le **télépilote** tient l'appareil dans le périmètre et à vue, l'**opérateur image** (ou chef de mission) oriente la caméra, zoome et parle à la salle. Il voit ce que personne ne voit : la longueur du cortège, la densité, les rues latérales, les groupes qui se forment, les signes avant-coureurs (changement de tenue, banderoles renforcées, objets entassés, D03 §3.2), les départs de feu, les issues ouvertes ou fermées. Il n'entend rien de la rue. Risques : sortie de périmètre ou d'horaire (images inexploitables, faute), survol stationnaire au-dessus d'une foule dense, perte de liaison entre les immeubles, batterie, vent, projectiles et lasers, fenêtres filmées, erreur de désignation (confondre deux personnes vêtues de même).

### 9.3 Paramètres et boucle de jeu [JEU]
| Paramètre | Valeur |
|---|---|
| Altitude | 30 à 120 m ; bourdonnement audible sous 80 m (D02 §5) ; sous 40 m, le drone attire les projectiles |
| Vitesse | 0 à 15 m/s ; vent de plus de 10 m/s : dérive et consommation ×1,5 |
| Batterie | 30 min ; retour automatique à 15 % ; relève par le second appareil en 40 s ; 2 appareils au plus en vol (arrêté) |
| Caméra | Zoom ×1 à ×28 ; bascule thermique (silhouettes chaudes, foyers, moteurs) utile de nuit et dans la fumée |
| Périmètre | Polygone de l'arrêté sur la carte ; hors périmètre ou hors horaire : enregistrement coupé, alerte ; 10 s cumulées dehors = faute |
| Vie privée | Masque automatique sur les fenêtres ; viser une fenêtre plus de 2 s = faute |
| Marquage | Tenir un individu dans le cadre 3 s **pendant** un fait : il est « désigné » (jalon visible des unités au sol pendant 90 s, prolongé tant qu'il reste dans le champ) |
| Comptage | Balayer le cortège de la tête à la queue : estimation à ±10 % transmise à la salle |
| Délai radio | Signalement → salle → unité : 5 à 15 s |

Boucle : décoller → vérifier périmètre et liaison → orbite haute de surveillance → repérer un signe → zoomer → rendre compte au format nature / volume / attitude (D01 §5.5) → désigner → guider l'unité (« deuxième rue à droite, ils sont derrière le kiosque ») → suivre jusqu'à l'interpellation → relève de batterie. Points : +8 par signalement confirmé avant les premiers jets ; +10 par désignation suivie d'une interpellation fondée ; +6 par feu signalé avant propagation ; +5 par issue fermée signalée avant une dispersion ; +5 pour un comptage juste ; −25 pour une désignation erronée ; −15 par faute de périmètre ou de fenêtre ; −30 si l'appareil tombe sur la foule. Échec dur : appareil perdu au-dessus de personnes ; vol hors arrêté prolongé.

### 9.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « Avant les autres » | Boulevard Beaumarchais | Repérer trois signes avant-coureurs dans le précortège et prévenir la salle avant le premier jet | Aucun signalement à temps |
| « Fil d'Ariane » | Du Louvre au Palais-Royal | Guider une BRAV-M vers un groupe mobile à travers les passages et les arcades, sans perdre le contact visuel plus de 10 s | Désignation erronée |
| « Dans le périmètre » | Place de la République | L'action se déplace hors du polygone autorisé : continuer à renseigner depuis l'intérieur, sans franchir la limite | Vol hors périmètre |
| « Thermique » | Quais de Seine, nuit | Dans la fumée, retrouver un blessé au sol et trois foyers, guider les secours | Blessé non trouvé en 4 min |
| « Comptage » | De la Bastille à la République | Compter le cortège à ±10 %, mesurer sa longueur, signaler deux points de compression | Écart supérieur à 25 % |

### 9.5 Interface
Vue caméra plein écran ; bandeau : altitude, batterie (minutes), liaison, vent, heure et **fin d'autorisation** ; contour du périmètre projeté au sol et sur la mini-carte ; masques de fenêtres ; curseur de zoom ; bascule visible / thermique (palette noir chaud `#101010` → blanc `#FFFFFF`, foyers en orange `#FF7A00`) ; boutons « Désigner », « Signaler » (gabarit nature / volume / attitude), « Compter » ; pastilles des unités au sol avec leur indicatif ; journal des vols (le registre).

> **Ce que le jeu doit reproduire — Télépilote**
> - Un rôle de **renseignement pur** : voir avant, dire juste, désigner sans erreur ; aucune arme.
> - L'arrêté est une mécanique : périmètre, horaires, deux appareils au plus, registre ; pas de son, pas de visages reconnus, pas de fenêtres.
> - La désignation depuis le ciel alimente les interpellations « sur fait » des unités au sol : c'est le lien principal avec les autres rôles.
> - Batterie, vent, liaison et relève rythment la partie ; la thermique sert la nuit et dans la fumée (option de scénario, son emploi réel à Paris n'étant pas documenté).

---
## 10. Médecin et secouristes
### 10.1 Street medic bénévole : le réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Définition | Militants qui donnent les premiers secours pendant les luttes ; certains sans formation médicale ; lien entre les zones dangereuses et les secours | [S][R24] |
| Statut | Pratique « en dehors de tout cadre légal » ; pas de diagnostic ; appel aux secours quand cela dépasse le premier secours | [S][R24] |
| Organisation | Travail à deux ou trois, très rarement seul, notamment pour gérer la foule autour d'un blessé ; collectifs et groupes affinitaires (D03 §6.4) | [S][R25] |
| Signes | Souvent discrets ; tee-shirts blancs à croix rouge ou bleue apparus en 2018-2019 ; casque de skate, masque, lunettes (D02 §6.2) | [S][R24] |
| Matériel | Sérum physiologique en quantité, compresses, pansements, bandes, masques, sucre, eau, couverture de survie ; solution antiacide diluée en pulvérisateur, dont l'efficacité n'est confirmée par aucune source médicale | [S][R25] |
| Geste central | Rincer abondamment les yeux ; un filet d'eau pure peut raviver la douleur ; faire retirer les lentilles ; sortir la personne du nuage (D03 §6.3) | [S][R25] |
| Rapports avec la police | Matériel de protection et de soin confisqué lors de fouilles (signalé fin 2018) ; certains revendiquent une neutralité (soigner tout le monde), d'autres la refusent | [S][R24] |
| Formation, nombre de personnes soignées par manifestation | **non trouvé** | [I] |

### 10.2 Secours officiels (sapeurs-pompiers de Paris, SAMU) : le réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Dispositif | La brigade intervient « avec des dispositifs autonomes ou intégrés dans nos unités ou celles des CRS et gendarmes pour répondre à des besoins immédiats d'extinction de feu ou de secours à personne » | [V][R7] |
| Volume (fin 2018) | 8 500 sapeurs-pompiers, 2 000 à 2 200 mobilisés chaque jour ; 350 à 600 de plus les jours de manifestation ; 55 médecins urgentistes | [S][R23] |
| Bilan du 24 novembre au 8 décembre 2018 | Plus de 544 feux dont plus de 230 de véhicules ; 250 blessés légers et 4 urgences absolues ; intoxications légères au gaz, traumatismes des membres, du thorax et de la tête | [S][R23] |
| Règle d'or | L'équipe médicale n'intervient que sous la protection des forces de police : elle récupère la victime, l'extrait, la met à l'abri ; en zone « chaude », gestes urgents seulement ; « L'objectif est d'extraire rapidement les blessés, tout en protégeant l'équipe. » | [S][R23] |
| Coordination | Conférence préparatoire avec le SAMU, les hôpitaux et l'agence de santé ; le SAMU indique l'hôpital de destination ; échanges avec la police et la préfecture pour garder un accès sûr ; points de stationnement déplacés selon la manifestation | [S][R23] |
| Agressions | Camions caillassés, tuyaux arrachés | [S][R23] |
| Chaîne médicale | Ramassage (« petite noria ») → point de rassemblement des victimes → poste médical avancé → évacuation (« grande noria ») ; chasubles : jaune commandement, rouge ramassage, blanc poste médical, bleu évacuation | [S][R26] |
| Catégories | Urgence absolue (extrême urgence, U1), urgence relative (U2, U3), urgence dépassée, urgence médico-psychologique | [S][R27] |
| Repérage secouriste | Vert : marche ; noir : ne respire pas ; rouge : inconscient qui respire, ou plus de 30 respirations par minute, ou pouls supérieur à 120 ; jaune : conscient, moins de 30 respirations, pouls inférieur à 120 | [S][R27] |
| Secouristes policiers | Chaque section d'intervention de CRS compte un secouriste opérationnel (§2.1) | [S][R37] |
| Emplacement et composition réels d'un poste de secours de manifestation à Paris | **non trouvé** | [I] |

### 10.3 Gestes et durées de jeu [JEU]
| Geste (`InteractVerb`) | Qui peut | Durée | Effet |
|---|---|---|---|
| Rincer les yeux (`rincer_yeux`) | tous les soignants | 6 s, 1 dose (sac de street medic : 20 doses) | Gêne ramenée de 60 s à 20 s (D03 §6.3) |
| Évaluer | tous | 5 s | Affiche conscience, respiration, saignement : couleur de tri |
| Comprimer une plaie, pansement (`soigner`) | tous | 8 à 12 s | Saignement stoppé ; garrot (4 s) réservé aux secours officiels et aux secouristes d'unité |
| Position latérale de sécurité | tous | 6 s | Stabilise un inconscient qui respire |
| Massage cardiaque, défibrillateur | secours officiels | cycles de 30 s | Seule réponse au « noir » récent (moins de 4 min) |
| Immobiliser un membre | secours officiels | 20 s | Permet le portage sans aggravation |
| Porter (`porter`, `trainer`) | tous | 1,2 m/s à deux, 0,6 m/s seul | Vers un abri à 30–80 m (hall, café, porche) ou le point de rassemblement |
| Transmettre un bilan | tous | 6 s | « Homme, 30 ans, plaie de la tête, conscient, saigne, angle rue X » : fait venir une équipe |
| Remettre (`remettre`) | street medic → secours | 4 s | La victime sort du jeu avec un pronostic |

Point de rassemblement des victimes de jeu : derrière le dispositif, à 100–200 m, sur un trottoir large ; un engin-pompe, une ambulance de réanimation (D02 §4.6), une tente de 3 × 6 m, 8 brancards ; couloir d'accès de 3,5 m à garder ouvert.

### 10.4 Boucles de jeu, score, échecs
| | Street medic | Secours officiels |
|---|---|---|
| Boucle | Marcher avec le cortège → entendre « Médic ! » → rejoindre → évaluer → geste → abriter → appeler → remettre → repartir | Attendre au point de rassemblement → alerte radio → demander protection et couloir → entrer → trier → geste vital → extraire → poste → évacuer ; ou : feu → extinction sous protection |
| Dilemme | Rester près du danger ou accompagner le blessé ; soigner un policier ou non (choix moral noté par personne) | Entrer sans protection (rapide, risqué) ou attendre le couloir (sûr, lent) ; qui prendre d'abord |
| Points | +3 par rinçage ; +8 par blessé stabilisé ; +10 par remise aux secours ; +5 par transmission exacte | +10 par urgence relative évacuée ; +25 par urgence absolue sauvée ; +12 par feu éteint ; +5 par tri juste |
| Pénalités | Geste au-delà de sa compétence −15 ; blessé abandonné −20 ; sac vide −5 | Erreur de tri (rouge pris pour vert) −20 ; équipe blessée faute de protection −25 ; victime attendue plus de 4 min −10 |
| Échec dur | Hors de combat ; interpellé | Mort évitable ; engin incendié |

### 10.5 Dix missions
| Rôle | Mission | Lieu | Objectif | Échec |
|---|---|---|---|---|
| Street medic | « Sérum » | Boulevard Voltaire | Rincer quinze personnes en 3 min pendant une salve, sans s'exposer plus de 20 s d'affilée | Malaise du joueur |
| Street medic | « Le hall » | Rue de Turbigo | Ouvrir un poste de soins improvisé dans un hall, y amener quatre blessés, guider les pompiers | Poste gazé avec blessés dedans |
| Street medic | « Entre deux lignes » | Place de la Bastille | Aller chercher un blessé tombé entre la ligne et le bloc ; se faire reconnaître des deux côtés | Blessé laissé plus de 90 s |
| Street medic | « Fouille » | Entrée du cortège, République | Passer un contrôle : choisir ce qu'on garde, expliquer son matériel sans perdre le sac | Sac confisqué |
| Street medic | « Trier seul » | Rue de Rivoli | Six blessés, un seul binôme : choisir l'ordre, transmettre six bilans justes | Rouge traité en dernier |
| Secours | « Sous protection » | Avenue de l'Opéra | Obtenir un couloir, extraire une urgence absolue en moins de 4 min | Équipe blessée ; délai dépassé |
| Secours | « Feu de façade » | Boulevard Saint-Germain | Éteindre une poubelle qui gagne un immeuble, évacuer deux riverains | Étage en feu |
| Secours | « Poste avancé » | Place de la Concorde | Tenir le point de rassemblement : douze victimes, tri par couleur, quatre évacuations dans l'ordre | Urgence absolue évacuée après une relative |
| Secours | « Pris à partie » | Rue Saint-Antoine | Engin visé par des projectiles pendant une extinction : se replier, revenir avec une protection | Engin perdu |
| Secours | « Les deux camps » | République | Un policier brûlé et un manifestant blessé à la tête au même moment : deux équipes, deux couloirs | Une des deux victimes non prise en 4 min |

### 10.6 Interface
Icônes de victimes colorées (vert `#34C759`, jaune `#FFD60A`, rouge `#FF3B30`, noir `#1C1C1E`) visibles à 40 m ; fiche de victime en trois lignes (conscience, respiration, saignement) ; sac (doses de sérum, compresses, garrots) ; chronomètre par victime ; direction et distance de l'abri et du point de rassemblement ; bouton « Bilan » à gabarit ; pour les secours : état du couloir (ouvert, fermé, demandé), disponibilité des ambulances, hôpital de destination annoncé par la régulation ; zone de gaz et vent sur la mini-carte.

> **Ce que le jeu doit reproduire — Médecin et secouristes**
> - Deux métiers distincts : le bénévole **dans** la foule (rapide, léger, sans statut), le professionnel **derrière** le dispositif (lourd, protégé, coordonné).
> - Le tri par couleur et le chronomètre par victime structurent la partie ; les gestes sont courts, la difficulté est de choisir et d'atteindre.
> - Les secours officiels dépendent de la police pour entrer : la demande de couloir relie ce rôle au commandant et au commissaire.
> - Aucun geste médical n'est un mini-jeu sanglant ; le réglage « sobre » ne change que l'affichage.

---
## 11. Journaliste
### 11.1 Le métier réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Droits | Circuler dans le dispositif, rester pendant la dispersion, porter des protections ; ni empêchement de filmer ni saisie du matériel (D01 §2.5) ; avancées « reconnues par la profession » | [V] D01 ; [V][R6] |
| Identification | « l'identification des journalistes peut s'avérer complexe dans des environnements confus et violents, d'autant qu'aucun signe distinctif attestant de leur qualité n'est obligatoire » ; le Sénat propose de les rendre plus identifiables, de généraliser des boucles de messagerie entre journalistes et préfectures et de désigner un référent | [V][R6] |
| Carte de presse | « carte d'identité des journalistes professionnels », délivrée par une commission paritaire, renouvelée chaque année ; il faut tirer l'essentiel de ses revenus du journalisme ; 35 294 cartes en 2016 ; elle « n'est pas obligatoire pour pratiquer le métier » ; brassard nominatif délivré par la même commission depuis 1981 | [S][R32] |
| Trois métiers | Photographe ; journaliste reporter d'images (tourne, prend le son, parfois monte, seul ou avec un rédacteur) ; équipe de direct (envoi par car satellite ou boîtier d'agrégation de réseaux mobiles) | [S][R33] |
| Chaînes d'information | Leur présence rend chaque événement « hypermédiatisé » : « Cela a vraiment changé notre façon de faire et de réagir. » (directeur de l'ordre public) ; s'y ajoute « le passage en boucle de leurs images sur certaines chaînes d'information » (directrice centrale des CRS) | [V][R7] |
| Équipement de terrain | Casque marqué « PRESSE », masque, lunettes, parfois coquille, protège-tibias, plastron ; l'appareil tenu devant le visage protège les yeux | [S][R31] |
| Menace venant des forces | 10 septembre 2025 : au moins sept journalistes frappés ou entravés (coup de matraque sur un appareil, gaz à très courte distance, plaquage, éclats de grenade), plusieurs en filmant des interpellations, identifiés par un casque ou un brassard ; automne 2026 : téléphone jeté au sol, coup de matraque malgré la carte montrée, photographe blessé à l'oreille par un tir de LBD à bout portant | [S][R28][R29] |
| Menace venant des manifestants | Automne 2026 : six cas sur douze ; reporters encerclés, frappés, sommés d'arrêter de filmer, caméra détruite, exfiltrés ; une chaîne a compté 25 incidents en sept semaines et travaille avec agents de protection et matériel sans logo (D03 §7) | [S][R29] ; [V] D03 |
| Contrôles à l'entrée | Sans carte, casque, masque et lunettes peuvent être confisqués avant d'entrer ; un photographe dit avoir été menacé de garde à vue en les réclamant | [S][R31] |
| Déontologie de terrain | Refuser de remettre ses images à la police ; se demander avant chaque risque : « Est-ce que cette photo en vaut la peine ? » | [S][R31] |
| Préparation | Guide professionnel de novembre 2026 : choix du casque, des lunettes, du masque ; liste de préparation ; fiche d'évaluation des risques ; carte d'urgence | [S][R30] |
| Critères de ce qui fait une « bonne image » | **non trouvé** (aucune source lue) : critères ci-dessous proposés | [I] |

### 11.2 Ce qu'il fait, voit, risque
Il se place **devant** la banderole au départ, puis **en biais** entre les deux camps, à 5–15 m de l'action, dos à un mur ou à un porche. Il voit dans un cadre étroit : l'œil au viseur, il perd la vision latérale (les projectiles viennent de côté). Il entend tout, et les deux camps lui parlent : « Dégagez ! », « Filme ça ! », « Arrête de filmer ! ». Risques : projectiles, gaz, jet d'eau, coup dans une charge, matériel cassé, vol, hostilité de la foule, confusion avec un manifestant, interpellation. Réussite : des images **vraies, lisibles, montrant les deux côtés**, envoyées à temps, sans avoir gêné ni mis en scène.

### 11.3 Boucle de jeu et barème d'image [JEU]
Boucle : choisir un point de vue → cadrer (`viewfinder`) → déclencher ou tourner → vérifier → se déplacer → envoyer avant l'heure de bouclage (ou tenir le direct) → repartir.

| Sujet dans le cadre | Valeur de base | Sujet dans le cadre | Valeur de base |
|---|---|---|---|
| Banderole de tête, foule qui chante | 4 | Feu, barricade | 10 |
| Vue d'ensemble (cortège + monument) | 8 | Charge, refoulement | 15 |
| Portrait net (manifestant, policier, secouriste) | 6 | Interpellation | 15 |
| Sommations avec l'écharpe visible | 12 | Blessé secouru | 15 |
| Jet de projectile, casse | 14 | Faute caractérisée d'un agent | 25 |

Multiplicateurs : distance optimale 5–15 m ×1,0 (au-delà de 30 m ×0,5) ; netteté et stabilité ×0,5 à ×1,2 ; **les deux camps dans le même cadre** ×1,5 ; monument reconnaissable en arrière-plan ×1,2 ; sujet déjà photographié trois fois ×0,5 ; exclusivité (aucune autre caméra à 20 m) ×1,5. Vidéo : plan de 5 à 10 s tenu à ±3° ; direct : tenir 30 à 60 s un cadre stable avec l'action derrière soi, débit de liaison supérieur à 50 % (il chute dans une foule dense : s'en écarter de 20 m ou monter sur un banc). Fautes : mise en scène (demander un geste à un PNJ) −30 ; gêner une manœuvre ou un soin −10 ; se laisser confondre avec un manifestant (casque ou brassard retiré) : protections perdues. Échec dur : hors de combat, matériel détruit avant tout envoi, bouclage manqué.

### 11.4 Cinq missions
| Mission | Lieu | Objectif | Échec |
|---|---|---|---|
| « La une » | De la République à la Bastille | Photographe : rapporter cinq images de cinq sujets différents, dont une vue d'ensemble et une image « deux camps », avant 18 h de jeu | Moins de trois sujets |
| « Trente secondes d'antenne » | Place de la Concorde | Direct : trois duplex de 30 s aux heures imposées, liaison stable, action dans le cadre | Duplex manqué |
| « Logo retiré » | Boulevard de Sébastopol | Reporter d'images pris à partie par un groupe hostile : s'extraire avec son agent de protection sans perdre la caméra | Caméra détruite |
| « Dispersion » | Place de la Bastille | Rester après les sommations, identifiable, filmer la séquence complète (annonce, sommations, emploi de la force) sans gêner | Séquence incomplète |
| « La preuve » | Rue de Rivoli | Une faute et une violence contre un policier ont lieu à une minute d'écart : filmer les deux, refuser de remettre la carte mémoire | Une seule des deux scènes |

### 11.5 Interface
Viseur (cadre, collimateur, focale 24 à 200 mm, indicateur de netteté, exposition), compteur d'images ou de secondes, **note estimée du cadre** en direct, liste des sujets demandés par la rédaction, heure de bouclage, barre de liaison (direct), état du matériel, voyant « identifiable » (casque et brassard « PRESSE » : blanc `#FFFFFF`, lettres noires `#111111`), alerte latérale de projectile quand l'œil est au viseur, messages de la rédaction (« On veut la tête de cortège à 15 h »).

> **Ce que le jeu doit reproduire — Journaliste**
> - Le journaliste marque des points **avec un cadre**, jamais avec une arme ; la meilleure image montre les deux camps.
> - Le viseur rétrécit le monde : voir mieux, c'est voir moins autour de soi.
> - Protégé par les textes, menacé par les deux camps : son identification visible est une mécanique (droits tant qu'il est identifiable et ne gêne pas).
> - Ses images alimentent l'image publique de tous les autres rôles (D03 §7) avec un délai de publication.

---
## 12. Manifestant
### 12.1 Le réel
| Sujet | Constat | Fiab. |
|---|---|---|
| Forme du cortège | Un « carré » de tête protégé par les syndicats, puis les manifestants encadrés ; militants en chasubles aux couleurs de leur organisation ; « de grands ballons guident les militants » | [V][R8] |
| Service d'ordre | Militants chargés de l'ordre **dans** le cortège, brassard aux couleurs de l'organisation ; formés en interne ; « à peu près toujours les mêmes personnes » ; priorité : « protéger nos militants » ; « ce n'est pas à nous de “faire la police” » | [S][R36] ; [V][R8] |
| Ses gestes | Chaîne humaine dans un virage ou autour du carré ; il peut couper ou retarder la manifestation ; il retient ses propres militants qui voudraient sortir du groupe | [V][R8] |
| Ses limites | « au maximum 150 à 200 personnes » ; devant, des « pré-cortèges » non contrôlés, la « nébuleuse » ; quand cela tourne au combat de rue, un syndicat dit : « nous finissons par nous retirer des cortèges » | [V][R7][R8] |
| Manifestation non déclarée | 17 % des manifestations parisiennes en 2019 ; y participer « n'est aujourd'hui pas sanctionné » ; participer à une manifestation **interdite** : contravention (D01 §6.4) ; le Sénat propose en 2026 d'en faire des délits : droit en mouvement | [V][R7][R6] |
| Interpellation | En mars 2023 à Paris : attente parfois de plus d'une heure avant le transport ; présentation à l'officier de police judiciaire une à trois heures après ; fiches évoquant une interpellation « pendant une charge » ou des vêtements sombres, une capuche | [V][R11] |
| Garde à vue | 785 en une semaine (37 mineurs, 198 femmes) ; durées « avoisinant les 24 heures » ; auditions de 5 à 20 minutes | [V][R11] |
| Suites | 80 % de classements sans suite « secs » (629 sur 785) ; 74 déférés (9,5 %), qui « quittent libres le tribunal », comparutions immédiates comprises ; taux habituel de classement sec tous contentieux : 29,75 % | [V][R11] |
| Comparution immédiate | Délits punis d'au moins deux ans (plus de six mois en flagrance) ; jugement le jour même **avec l'accord du prévenu en présence de son avocat**, sinon renvoi de droit ; environ 31 minutes par affaire dans une étude de 2008 | [S][R39] |
| Peines encourues | Table D01 §6.4 : de la contravention (manifestation interdite) à 10 ans (incendie) ; maintien après sommations : 1 an et 15 000 € | [V] D01 |

### 12.2 Trois façons de jouer [JEU]
| | Pacifique (`pacifique`, `famille`, `militant`) | Service d'ordre (`service_ordre`) | Radical (`radical`) — niveau gameplay uniquement |
|---|---|---|---|
| But | Être nombreux, visibles, arriver au bout | Protéger le carré et les militants, faire avancer | Affronter ou dégrader, puis disparaître |
| Verbes | Marcher, chanter en rythme, porter pancarte ou banderole (à deux), s'asseoir, filmer, aider un blessé, lever les mains, partir | Former la chaîne (5 à 12 personnes, bras liés), tenir un virage, ralentir ou couper le cortège, parler à l'équipe de liaison, guider vers la sortie | Se masquer, ramasser, lancer, renverser, taguer, dresser un obstacle, renvoyer un palet, fuir, changer de tenue (D03 §3.3) |
| Voit, entend | La foule dense, peu la police ; slogans, sono, rumeurs | La tête, les trottoirs, les entrées latérales | La ligne à 20–40 m, les issues, les caméras |
| Risques | Gaz, compression, charge qui ne distingue pas, interpellation en masse | Pris entre le bloc et la police ; débordé | Blessure, interpellation sur fait, peines lourdes ; blesser d'autres manifestants (jets courts) |
| Jauge propre | **Voix** : effectif autour de soi × durée × images favorables | **Cohésion** : chaîne intacte, carré protégé, cortège arrivé | **Exposition** : chaque fait vu par un agent ou une caméra s'accumule |
| Points | +1 par 30 s de marche groupée ; +5 par slogan repris ; +10 à l'arrivée ; +8 par vidéo publiée ; +8 par personne aidée | +10 par virage tenu ; +15 si le carré n'est jamais rompu ; +10 par incident désamorcé sans coup | Points de « rapport de force » seulement sur cibles matérielles ; −30 par personne blessée ; fin de mission = écran des suites judiciaires |
| Échec | Blessé, interpellé, groupe d'amis dispersé | Carré envahi, chaîne rompue 30 s | Interpellé avec preuves ; tiers blessé gravement |

Suites judiciaires simulées en fin de mission (toutes valeurs [JEU], calées sur les ordres de grandeur du §12.1) : attente sur place 20 à 60 s de jeu (une à trois heures réelles) → garde à vue (écran : droits de D01 §6.2, durée) → issue tirée selon le dossier : **aucun fait enregistré** : classement 90 %, rappel à la loi 10 % ; **fait vu par un seul agent, sans image** : classement 50 %, convocation 30 %, déferrement 20 % ; **fait filmé (drone, caméra-piéton, presse)** : déferrement 70 %, convocation 30 % → comparution immédiate : accepter d'être jugé le jour même ou demander un délai → peine tirée dans la fourchette de D01 §6.4, avec interdiction de manifester possible.

### 12.3 Quinze missions
| Profil | Mission | Lieu | Objectif | Échec |
|---|---|---|---|---|
| Pacifique | « Jusqu'au bout » | République → Bastille | Arriver avec ses cinq amis, sans blessé, en ayant repris dix slogans | Groupe dispersé |
| Pacifique | « La banderole » | Boulevard Saint-Germain | Porter à deux une banderole de 6 m tendue pendant tout le parcours, virages compris | Banderole lâchée 20 s |
| Pacifique | « Assis » | Devant l'Assemblée nationale (pont de la Concorde) | Sit-in : rester assis pendant les sommations ou partir à temps ; comprendre le risque (délit après la dernière sommation) | Interpellé sans l'avoir choisi |
| Pacifique | « Témoin » | Place de la Bastille | Filmer une interpellation à distance de sécurité (plus de 5 m, valeur de jeu), sans gêner, publier la vidéo | Téléphone perdu |
| Pacifique | « La nasse » | Rue de Turbigo | Pris dans un encerclement avec une poussette : trouver la sortie contrôlée, garder son calme | Panique, chute |
| Service d'ordre | « Le virage » | Place de la Bastille | Tenir la chaîne pendant que 8 000 personnes tournent ; empêcher les voitures d'entrer dans le cortège | Chaîne rompue |
| Service d'ordre | « Le carré » | Boulevard Voltaire | Protéger le carré de tête d'une poussée du précortège, sans porter de coup | Carré envahi |
| Service d'ordre | « Couper » | Boulevard Beaumarchais | Sur information de l'équipe de liaison, ralentir le cortège pour l'écarter de 150 m des affrontements de tête | Cortège pris dans le gaz |
| Service d'ordre | « Désamorcer » | Rue de Rivoli | Trois militants veulent rejoindre la casse : les retenir par la parole | Deux militants partis |
| Service d'ordre | « Dispersion » | Place de la Bastille (arrivée) | Annoncer la fin, vider la place par trois issues en 5 min avant l'arrivée des opportunistes | Place encore pleine au début des incidents |
| Radical | « Le prix » | Boulevard de Sébastopol | Jouer une séquence d'affrontement, puis découvrir l'écran des suites judiciaires (mission pédagogique) | — (toutes les fins sont montrées) |
| Radical | « Disparaître » | Grands Boulevards | Après une action, sortir du périmètre sans être désigné par le drone | Interpellé |
| Radical | « Barricade » | Rue de la Roquette | Dresser un obstacle avec le mobilier disponible avant l'arrivée de la ligne ; aucun riverain mis en danger | Feu gagnant une façade |
| Radical | « Le palet » | Place de la République | Renvoyer ou éloigner des palets fumants pour dégager un groupe pris dans le gaz | Brûlure, malaise |
| Radical | « Ligne rouge » | Rue Saint-Antoine | Le groupe veut s'en prendre aux pompiers : refuser, s'interposer ou partir | Secours agressés |

### 12.4 Interface
Aucune carte tactique : une flèche vers ses amis, le sens du cortège, les **issues** (porches, rues, bouches de métro) en surbrillance quand la tension locale dépasse 0,5 ; jauge de souffle et de gaz ; texte du slogan en cours avec repère de rythme ; état « Voix », « Cohésion » ou « Exposition » selon le profil ; rappel discret du droit (« Dernière sommation entendue : rester est un délit ») ; pour le service d'ordre : schéma de la chaîne et messages de l'équipe de liaison ; pour le radical : œil barré ou ouvert (vu ou non par une caméra ou un agent), compteur de faits enregistrés.

> **Ce que le jeu doit reproduire — Manifestant**
> - Manifester est un **droit** : le manifestant pacifique gagne en marchant, en chantant, en arrivant, en témoignant ; le jeu ne le traite jamais comme une cible légitime.
> - Le service d'ordre est un rôle de coordination sans arme, pris entre le bloc et la police, dépendant d'informations qu'il reçoit mal.
> - Le rôle radical reste au niveau des verbes de jeu ; il n'apprend rien de transposable, et sa partie se termine par un bilan humain et judiciaire explicite.
> - Le risque judiciaire est simulé avec les ordres de grandeur réels : beaucoup d'interpellations sans suite quand aucun fait n'est établi, des peines lourdes quand il l'est.

---
## 13. Observateur associatif et commerçant riverain (PNJ ou rôles secondaires)
### 13.1 Le réel
| Rôle | Constat | Fiab. |
|---|---|---|
| Observateur | Tiers qui ne participent pas ; mission : « documenter des opérations de maintien de l'ordre et de rendre compte du respect des libertés publiques » ; droit d'être présents et d'enregistrer, y compris en cas de dispersion (D01 §2.5) | [S][R35] ; [V] D01 |
| Observateur | Méthode : plusieurs équipes (trois pour un cortège de 1 000 personnes), chacune suivant un groupe ; chasubles, casques, lunettes, téléphones ; documents attestant leur qualité ; récit **horodaté à la minute** ; identification des unités et des numéros d'identification ; note publique illustrée d'une carte des trajets | [S][R35] |
| Observateur | Entraves rapportées : accès refusé, contrôle d'identité, ordre de ranger les téléphones et d'ôter les casques, matériel de protection interdit à l'entrée ou saisi | [S][R34][R35] |
| Commerçant | Sur une grande avenue, chiffre d'affaires « nul tous les samedis de la mi-novembre à fin décembre 2018 », soit environ 10 % de l'année ; 70 samedis de mobilisation recensés, « dont six ont été très violents, avec des dégradations et des mises à sac », et des semaines de fermeture | [V][R9] |
| Commerçant | Information : réunions hebdomadaires avec la préfecture de police ; ailleurs, alertes par SMS arrivées « juste avant l'arrivée des casseurs » ; consigne reçue : « protéger nos vitrines et de fermer nos magasins » | [V][R9] |
| Commerçant | Refuge : « une trentaine de personnes » réfugiées dans un commerce qui peut en accueillir quinze | [V][R9] |
| Commerçant | Assurance : rien « tant que des vitrines ou du matériel ne sont pas cassés » ; après sinistre : photographier avant de nettoyer, déposer plainte, déclarer à l'assureur, poser des planches ; l'État est civilement responsable des dégâts d'attroupement ; aides forfaitaires (fin 2026) | [V][R9] ; [S][R12] |
| Commerçant | Un week-end d'octobre 2026 : 450 commerces dégradés et 228 pillés selon la préfecture citée par la presse ; lettre du préfet conseillant de protéger les vitrines et de fermer plus tôt | [S][R41] |

### 13.2 Boucles de jeu [JEU]
| | Observateur | Commerçant |
|---|---|---|
| Boucle | Se présenter au responsable du dispositif → suivre un groupe → noter chaque événement (heure, lieu, unité, moyen, sommations entendues ou non) → filmer → rédiger la note | Lire l'alerte → décider (ouvrir, terrasse, panneaux, rideau) → servir ou surveiller → abriter → éteindre un début de feu → constater → déclarer |
| Valeurs | Fiche d'événement en 4 champs ; lecture d'un code d'unité (« 2B ») à moins de 15 m ; numéro individuel à moins de 6 m | Pose de panneaux : 60 s par vitrine de 3 m, à deux ; rideau métallique : 8 s ; rentrer une terrasse de 12 tables : 90 s ; capacité de refuge : 15 personnes |
| Points | +4 par fiche exacte ; +10 par séquence de sommations complète ; +10 par faute documentée ; +10 par violence contre des agents documentée (l'observateur note tout) | Recette de la journée (0 à 100) ; +10 par personne abritée ; +15 si le local est intact ; +5 pour un dossier de sinistre complet |
| Fautes | Prendre parti, gêner une manœuvre −15 ; fiche fausse −10 | Violence envers quiconque −40 ; refuge refusé à un blessé −10 |
| Échec | Matériel saisi sans copie ; blessé | Local incendié ; commerçant blessé |

### 13.3 Dix missions
| Rôle | Mission | Lieu | Objectif | Échec |
|---|---|---|---|---|
| Observateur | « À la minute » | Place de la République | Horodater annonce, sommations et premier emploi de la force à ±10 s | Deux heures fausses |
| Observateur | « Qui était là » | Boulevard Voltaire | Relever les codes de six unités et dire lesquelles ont employé quel moyen | Moins de quatre unités |
| Observateur | « Refoulés » | Rue de Rivoli | Accès refusé : négocier avec le responsable, sinon observer d'un point haut | Aucune observation |
| Observateur | « Les deux colonnes » | Place de la Bastille | Documenter une faute policière **et** des violences de manifestants dans la même note | Note à sens unique |
| Observateur | « La nasse, de l'intérieur » | Rue de Turbigo | Mesurer la durée d'un encerclement, compter les annonces et la sortie contrôlée | Durée non relevée |
| Commerçant | « Ouvrir ou fermer » | Boulevard Beaumarchais | Décider à 13 h avec trois informations contradictoires ; maximiser recette et sécurité | Vitrine brisée, local ouvert |
| Commerçant | « Le rideau » | Rue de Rivoli | Rentrer la terrasse, baisser le rideau et abriter dix passants avant l'arrivée du gaz | Clients gazés en terrasse |
| Commerçant | « Quinze places » | Place de la République | Trente personnes veulent entrer : organiser, garder une issue, appeler les secours pour un malaise | Bousculade |
| Commerçant | « Le lendemain » | Boulevard de Magenta | Photographier, déposer plainte, déclarer, poser des planches : dossier complet en 5 min | Nettoyage avant photos |
| Commerçant | « Début de feu » | Avenue de l'Opéra | Une poubelle brûle contre la devanture : extincteur du magasin, puis appel au 18 | Feu dans le local |

### 13.4 Interface
Observateur : carnet horodaté (bouton « Noter » pré-rempli avec l'heure et le lieu), viseur du téléphone, liste des unités identifiées, voyant « identifiable » (chasuble claire `#F5F5F5` marquée « OBSERVATEUR », casque bleu `#2D6CDF`, D02 §6.2). Commerçant : caisse du jour, état du local (vitrines, rideau, terrasse), fil d'alertes (SMS), occupation du refuge, liste des démarches après sinistre.

> **Ce que le jeu doit reproduire — Observateur et commerçant**
> - Deux regards extérieurs : l'un **écrit ce qui s'est passé**, l'autre **le subit**. Ils existent d'abord en PNJ et pèsent sur le bilan des autres rôles.
> - L'observateur note tout, des deux côtés ; sa note de fin de mission est affichée à tous les joueurs comme une troisième version des faits.
> - Le commerçant transforme le décor en enjeu : chaque vitrine a un propriétaire, une recette, une assurance, parfois des gens réfugiés derrière.

---
## 14. Qui dépend de qui

| Rôle | Reçoit de | Donne à | Lien de jeu principal |
|---|---|---|---|
| CRS (exécution) | Ordres du chef ; désignations du superviseur et du drone | Comptes rendus, interpellés, blessés | Ordre courant, désignation |
| Chef de groupe / section | Mission du commandant | Ordres, fiches, bilan de munitions | Roue d'ordres, journal |
| Commandant | Autorisations de l'autorité civile ; renseignement de la salle et du drone | Manœuvres ; demandes d'appui (engin lanceur d'eau, Centaure, BRAV-M) ; couloirs de secours | Carte tactique |
| Commissaire | Constats (les siens, ceux des agents, du drone, de l'équipe de liaison) ; pression de la salle | Sommations, autorisations, limites, levée | Séquence légale |
| BRAV-M | Objectifs de la salle et du drone | Interpellés ; dispersion de groupes mobiles | Désignation, itinéraire |
| Centaure, engin lanceur d'eau | Ordre du commandant dans le cadre autorisé | Axes dégagés, feux éteints, distance rétablie | Autorisation, zone |
| Télépilote | Arrêté (périmètre, horaires) ; demandes de la salle | Signalements, désignations, comptage | Jalon partagé |
| Street medic | Appels de la foule | Blessés stabilisés remis aux secours ; bilans | Remise, couloir |
| Secours officiels | Alertes radio ; protection et couloirs de la police | Évacuations, extinctions | Demande de couloir |
| Journaliste | Accès (identification) ; événements | Images publiées : image publique de tous | Vidéos publiées |
| Manifestant | Informations des organisateurs, sommations | Effectif, slogans, vidéos de téléphone ; tension | Tension locale |
| Observateur, commerçant | Accès ; alertes | Note publique ; plaintes, refuge | Bilan croisé |

> **Ce que le jeu doit reproduire — Interactions**
> - Chaque rôle produit quelque chose dont un autre a besoin : autorisation, désignation, couloir, image, information. Les missions les plus riches croisent deux rôles.
> - Les PNJ qui tiennent les autres rôles doivent suivre les mêmes règles que le joueur (le commissaire PNJ refuse, le lanceur PNJ attend l'ordre, le secouriste PNJ demande un couloir).
> - L'écran de fin montre la même manifestation vue par quatre sources : compte rendu de police, images de presse, note d'observateur, vidéos de téléphone.

---
## Sources

Toutes consultées le 15 novembre 2026. **(lu)** = page ou document ouvert et lu ; **(extrait)** = seul l'extrait affiché par le moteur de recherche a été vu, la page ayant refusé la lecture.

### Sources primaires et institutionnelles
- **[R1]** Préfecture de police, arrêté n° 2024-01338 du 6 septembre 2024 « autorisant la captation, l'enregistrement et la transmission d'images au moyen de caméras installées sur des aéronefs à l'occasion d'une manifestation à Paris », recueil des actes administratifs spécial n° 75-2024-575 **(lu)** — https://www.prefectures-regions.gouv.fr/ile-de-france/irecontenu/telechargement/120044/891765/file/recueil-75-2024-575-recueil-des-actes-administratifs-special%20du%2010.09.2024.pdf
- **[R2]** Même recueil, arrêté n° BPA 24-542 (deux caméras sur deux drones, « orienter les policiers sur le terrain ») **(lu)** — même adresse
- **[R3]** Direction de l'ordre public et de la circulation, fiche technique « Modalités de traitement des retours d'image des drones en salle de commandement », 2020, pièce produite devant le tribunal administratif et mise en ligne par une association **(lu)** — https://www.laquadrature.net/wp-content/uploads/sites/8/2020/12/1095903947_PJ3_Fiche_sur_les_modalites_de_traitement_des_retours_d_image_en_salle_de_comman.pdf
- **[R4]** CNIL, « Les drones équipés de caméras pour la sécurité publique » **(lu)** — https://cnil.fr/fr/les-drones-equipes-de-cameras-pour-la-securite-publique
- **[R5]** Assemblée nationale, question écrite n° 29476, réponse publiée le 6 avril 2021 (parc de drones, télépilotes, formation) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE29476.pdf
- **[R6]** Sénat, mission d'information sur l'avenir du maintien de l'ordre, synthèse « 30 propositions pour reprendre le contrôle », octobre 2026 **(lu)** — https://www.senat.fr/rap/r26-078/r26-078-syn.pdf
- **[R7]** Assemblée nationale, commission d'enquête sur le maintien de l'ordre, compte rendu n° 38, 26 novembre 2020 (directrice centrale des CRS, directeur central de la sécurité publique, directeur de l'ordre public et de la circulation) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/comptes-rendus/ceordre/l15ceordre2021038_compte-rendu.pdf
- **[R8]** Même commission, compte rendu n° 8, 7 octobre 2020 (table ronde des confédérations syndicales : services d'ordre) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/comptes-rendus/ceordre/l15ceordre2021008_compte-rendu.pdf
- **[R9]** Même commission, compte rendu n° 25, 12 novembre 2020 (table ronde de représentants de commerçants) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/comptes-rendus/ceordre/l15ceordre2021025_compte-rendu.pdf
- **[R10]** Même commission, compte rendu n° 43, 2 décembre 2020 (ancien secrétaire d'État auprès du ministre de l'Intérieur) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/comptes-rendus/ceordre/l15ceordre2021043_compte-rendu.pdf
- **[R11]** Contrôleur général des lieux de privation de liberté, enquête sur les gardes à vue liées aux manifestations de mars 2023 à Paris (lettre au ministre et rapport, mai 2023) **(lu)** — https://www.cglpl.fr/wp-content/uploads/2023/05/Enquête-GAV-manifestation_lettre-ministre-de-lintérieur-et-rapport.pdf
- **[R12]** Chambre de commerce et d'industrie de Paris Île-de-France, « Manifestations : recommandations pour les commerçants », mise à jour du 13 novembre 2026 **(lu)** — https://entreprises.cci-paris-idf.fr/actualites/manifestations-recommandations-pour-les-commercants
- **[R13]** Gendarmerie nationale, fiches métiers « chef d'engin de blindé Centaure » et « pilote de blindé Centaure », reportages sur la formation Centaure (2023, 2024) **(extraits : le site a renvoyé une erreur 403)** — https://www.gendarmerie.interieur.gouv.fr/recrutement/nos-metiers/chef-d-engin-de-blinde-centaure ; https://www.gendarmerie.interieur.gouv.fr/recrutement/nos-metiers/pilote-de-blinde-centaure ; https://www.gendarmerie.interieur.gouv.fr/gendinfo/sur-le-terrain/immersion/2023/en-formation-centaure-avec-les-militaires-du-groupement-blinde-de-gendarmerie-mobile
- **[R19]** Assemblée nationale, question écrite n° 10185, réponse publiée le 9 avril 2024 (rassemblement non déclaré du 8 juillet 2023, autorité civile, interpellation différée) **(lu)** — https://www.assemblee-nationale.fr/dyn/16/questions/QANR5L16QE10185.pdf

### Presse, organisations, encyclopédies
- **[R14]** Revue Conflits, entretien avec le commandant du groupement blindé sur le Centaure **(lu)** — https://www.revueconflits.com/le-centaure-et-lemploi-des-blindes-dans-la-gendarmerie-entretien-avec-le-general-christophe-daniel/
- **[R15]** Politis, « On a testé pour vous le Centaure », octobre 2023 **(lu)** — https://www.politis.fr/articles/2023/10/on-a-teste-pour-vous-le-centaure-le-nouveau-blinde-de-la-gendarmerie/
- **[R16]** Wikipédia, « Centaure (blindé) » **(lu)** — https://fr.wikipedia.org/wiki/Centaure_(blind%C3%A9)
- **[R17]** Caradisiac, article sur le Centaure **(lu)** — https://www.caradisiac.com/7-passagers-100-km-h-lance-grenades-voici-le-centaure-nouveau-blinde-des-gendarmes-205118.htm
- **[R18]** Wikipédia, « Brigade de répression de l'action violente motorisée » **(lu)** — https://fr.wikipedia.org/wiki/Brigade_de_r%C3%A9pression_de_l%27action_violente_motoris%C3%A9e
- **[R20]** Le Monde, 25 juillet 2024, article sur le chef des compagnies d'intervention et de la BRAV-M (copie) **(lu)** — https://www.universitepopulairetoulouse.fr/IMG/pdf/le_monde_bravm.pdf
- **[R21]** Politis, novembre 2026, témoignages de policiers et de gendarmes sur la stratégie de maintien de l'ordre **(lu)** — https://www.politis.fr/articles/2026/11/maintien-ordre-les-manifestants-ne-sont-pas-des-ennemis-des-membres-des-forces-de-lordre-contestent-la-strategie-repressive/
- **[R22]** Politis, juillet 2020, portrait d'un CRS **(lu)** — https://www.politis.fr/articles/2020/07/portrait-de-flic-antoine-la-quarantaine-crs-en-rhone-alpes-depuis-23-ans-42163/
- **[R23]** Le Quotidien du médecin, entretien avec le médecin-chef de la brigade de sapeurs-pompiers de Paris, décembre 2018 **(lu)** — https://cancerologie.lequotidiendumedecin.fr/actus-medicales/sante-publique/gilets-jaunes-violences-cest-epuisant-physiquement-et-psychologiquement-lance-le-medecin-chef-des
- **[R24]** Wikipédia, « Street medic » **(lu)** — https://fr.wikipedia.org/wiki/Street_medic
- **[R25]** Street medics, matériel et gestes **(extraits)** : Le Quotidien du pharmacien — https://www.lequotidiendupharmacien.fr/gestion-de-lofficine/droit-du-travail/la-trousse-durgence-special-manif ; brochure militante — https://paris-luttes.info/IMG/pdf/brochure_1_les_gestes_a_adopter_en_manif.pdf ; Slate (erreur 403) — https://www.slate.fr/story/119445/street-medics-indispensables-manifestation
- **[R26]** Wikipédia, « Plan Orsec-Novi » **(lu)** — https://fr.wikipedia.org/wiki/Plan_Orsec-Novi
- **[R27]** Wikipédia, « Triage médical » **(lu)** — https://fr.wikipedia.org/wiki/Triage_m%C3%A9dical
- **[R28]** Reporters sans frontières, communiqué du 11 septembre 2025 **(lu)** — https://rsf.org/fr/france-la-libert%C3%A9-de-la-presse-entrav%C3%A9e-par-des-violences-polici%C3%A8res-au-cours-des-manifestations
- **[R29]** Reporters sans frontières, communiqué du 9 octobre 2026 (douze journalistes agressés) **(lu)** — https://rsf.org/fr/france-au-moins-douze-journalistes-agress%C3%A9s-lors-des-mobilisations-%C3%A9tudiantes-et-lyc%C3%A9ennes
- **[R30]** Reporters sans frontières, annonce du guide pratique pour les journalistes couvrant les mobilisations, 4 novembre 2026 **(page d'annonce lue ; le guide lui-même n'a pas été ouvert)** — https://rsf.org/fr/france-%C3%A0-la-veille-des-mobilisations-du-5-novembre-rsf-publie-un-guide-pratique-pour-aider-les
- **[R31]** Vice France, « De la difficulté de couvrir une manif en France », 7 mai 2019 **(lu)** — https://www.vice.com/fr/article/de-la-difficulte-de-couvrir-une-manif-en-france/
- **[R32]** Wikipédia, « Carte de presse en France » **(lu)** — https://fr.wikipedia.org/wiki/Carte_de_presse_en_France
- **[R33]** Wikipédia, « Journaliste reporter d'images » **(lu)** — https://fr.wikipedia.org/wiki/Journaliste_reporter_d%27images
- **[R34]** Ligue des droits de l'Homme, communiqué du 8 juillet 2025 sur les entraves aux observateurs **(lu)** — https://www.ldh-france.org/wp-content/uploads/2025/07/CP-LDH-entraves-observations.pdf
- **[R35]** Observatoires des pratiques policières (Seine-Saint-Denis) et des libertés publiques (Paris), note d'observation du 25 mai 2024 **(lu en partie)** — https://www.ldh-france.org/wp-content/uploads/2025/03/2024_07_Note_Green_Dock.pdf
- **[R36]** Wikipédia, « Service d'ordre » **(lu)** — https://fr.wikipedia.org/wiki/Service_d%27ordre
- **[R37]** Wikipédia, « Compagnies républicaines de sécurité » **(lu, 100 000 premiers caractères)** — https://fr.wikipedia.org/wiki/Compagnies_r%C3%A9publicaines_de_s%C3%A9curit%C3%A9
- **[R38]** Wikipédia, « Gendarmerie mobile » **(lu, 100 000 premiers caractères)** — https://fr.wikipedia.org/wiki/Gendarmerie_mobile
- **[R39]** Wikipédia, « Comparution immédiate en droit français » **(lu)** — https://fr.wikipedia.org/wiki/Comparution_imm%C3%A9diate_en_droit_fran%C3%A7ais
- **[R40]** Wikipédia, « Canon à eau » **(lu)** — https://fr.wikipedia.org/wiki/Canon_%C3%A0_eau
- **[R41]** Commerçants parisiens, octobre 2026 **(extraits)** : Sud Radio (dépêche d'agence) — https://www.sudradio.fr/societe/a-paris-des-commercants-se-protegent-dautres-ne-veulent-pas-croire-a-une-repetition-du-chaos ; i24News — https://www.i24news.tv/fr/actu/france/artc-la-prefecture-de-paris-invite-les-commercants-a-faire-appel-a-la-securite-privee
- **[R42]** Drones, binôme et traçabilité des vols **(extraits)** : Gendarmerie nationale (erreur 403) — https://www.gendarmerie.interieur.gouv.fr/gendinfo/terrain/immersion/2018/drones-les-gendarmes-investissent-la-troisieme-dimension ; Maire-info — https://www.maire-info.com/securite/utilisation-drones-par-les-forces-securite-decret-est-paru-article-27430

Dossiers internes cités : `01-doctrine-cadre-legal.md`, `02-materiel-tenues-vehicules.md`, `03-dynamique-manifestation.md`, `04-paris-lieux-monuments.md`.

## Points incertains
### Non trouvé (aucune source exploitable) — valeurs [JEU] à faire valider
1. **Répartition des postes** dans un groupe ou une section de CRS (nombre de boucliers, de lanceurs, de LBD, d'extincteurs, d'interpellateurs) ; nombre de grenades emportées ; poids de l'équipement. Le tableau du §2.1 est une construction de jeu.
2. **Géométrie réglementaire des manœuvres** (intervalles, vitesses, profondeur d'un bond, d'une charge, d'une vague de refoulement) et **commandements à la voix** exacts : rien d'ouvert ; tout le §4.2 est [JEU].
3. **Sifflet de fin de charge** : attesté par un seul article de presse ; les autres signaux (gestes, coups de sifflet codés) sont inconnus.
4. **BRAV-M** : nombre de motos par unité, armement emporté, formation, organisation en colonne ; rien de chiffré.
5. **Centaure** : cadence, angle et portée des grenades du tourelleau, disposition des trois postes, champ de vision du pilote, procédure réelle de dégagement d'obstacle ; les fiches métiers et reportages de la gendarmerie n'ont pas pu être ouverts (erreur 403).
6. **Engin lanceur d'eau** : composition et rôles de l'équipage, distance minimale d'emploi, consignes de visée, temps de ravitaillement ; les deux articles de presse les plus détaillés n'ont pas pu être ouverts.
7. **Drone** : emploi d'une caméra thermique en manifestation à Paris, altitude de vol, autonomie, emplacement du télépilote ; le texte de l'article L. 242-5 n'a pas été relu sur Légifrance (cité à travers l'arrêté [R1] et la fiche [R4]).
8. **Poste de secours** d'une manifestation parisienne : emplacement, composition, délais d'intervention ; les seuls chiffres trouvés datent de fin 2018.
9. **Street medics** : formation, effectifs, nombre de personnes soignées ; sources militantes ou encyclopédiques seulement.
10. **Journaliste** : aucun référentiel de « bonne image » n'a été lu ; le barème du §11.3 est une proposition ; le contenu du guide professionnel de novembre 2026 n'a pas été ouvert ; l'apparence exacte de la carte de presse n'est pas décrite.
11. **Service d'ordre** : effectifs par cortège, techniques détaillées ; un guide syndical du manifestant n'a pas pu être consulté (hôte `nouveau.solidaires.org` hors du réseau autorisé de la session).

### Sources divergentes ou fragiles
- **Effectif d'une section de CRS** : 15 agents (encyclopédie), « 20 au maximum » (D01), « 35 personnes » (un témoignage) ; effectif de compagnie réellement aligné : 45–50 ou 80–90 selon le même témoignage [R21][R22][R37].
- **Taux de classement des gardes à vue de mars 2023** : 80 % (autorité de contrôle, une semaine, [R11]) ; 74 % et 90 % cités par la presse et le barreau pour d'autres périmètres (extraits de recherche, non lus).
- **Lance-grenades du Centaure** : « 30 coups » partout ; la possibilité d'une seconde salve de 30 ne repose que sur un extrait de presse.
- **Rôle de la Garde républicaine dans les BRAV-M** : affirmé fin 2020 [R7] ; les sources plus récentes ne citent que le service motocycliste de la préfecture de police [R18].
- **Fiche de 2020 sur les images de drone** [R3] : antérieure à la loi de 2022 ; le floutage et l'absence d'enregistrement qu'elle décrit ne sont peut-être plus en vigueur (les arrêtés de 2024 autorisent « l'enregistrement »).
- **Propositions du Sénat d'octobre 2026** [R6] : ce sont des propositions ; le droit applicable au manifestant (manifestation non déclarée, interdite) peut changer.
- **Budget de recherche** : 18 recherches ont abouti ; deux autres (équipes de direct des chaînes d'information ; chaîne médicale de l'avant) ont été refusées, le quota de recherche partagé de la session étant épuisé ; ces deux points reposent sur D03 §7 et sur des pages encyclopédiques ouvertes directement.
