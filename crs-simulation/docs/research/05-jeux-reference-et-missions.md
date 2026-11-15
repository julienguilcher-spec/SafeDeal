# 05 — Jeux de référence, mécaniques différenciantes et banque de missions

> Dossier de recherche pour **CRS Simulation France**. Rédigé le 15 novembre 2026 à partir de sources consultées ce jour.
> Public visé : concepteurs des missions, de la carrière et du Mode libre, de l'interface (menus, compte rendu de fin de mission),
> des rôles civils (journaliste, médecin, manifestant) et du directeur de tension. Tout ce qui est entre guillemets « … » est un
> **texte exact** (citation d'une source, ou texte d'interface proposé quand la ligne est marquée [JEU]).
> Les jeux, studios et éditeurs réels ne sont cités que pour la **traçabilité** : aucun nom de marque n'entre dans le jeu (BRIEF §4).
> Mouvements, syndicats, clubs, États et causes des missions sont **fictifs et politiquement neutres** ; aucune personne réelle.
> Les comportements violents sont décrits **au niveau du gameplay** (ce que l'on voit, l'effet produit), jamais comme un mode d'emploi.
> Ce dossier complète sans les répéter : `01-doctrine-cadre-legal.md` (droit, sommations, grades, discipline),
> `02-materiel-tenues-vehicules.md` (matériel, véhicules) et `03-dynamique-manifestation.md` (foule, tension, image publique).

## Légende de fiabilité

| Marque | Signification |
|---|---|
| **[V]** | **Vérifié** : lu pendant cette recherche à la source primaire (page officielle du jeu, page de conférence, donnée de carte du dépôt). |
| **[S]** | **Source secondaire** : presse, test, encyclopédie, wiki de joueurs, agrégateur d'avis ; ou source primaire connue seulement par un résumé de recherche (la liste des sources précise « lu » ou « résumé »). |
| **[E]** | **Estimation** (ordre de grandeur de mémoire d'encyclopédie ou calcul) : à recalculer sur la carte du jeu avant usage. |
| **[JEU]** | **Valeur de conception proposée** : non réelle, cohérente avec ce qui est vérifié dans les dossiers 01 à 03. |
| **[I]** | **Incertain / non trouvé** : ne pas présenter comme réel. |

Les renvois `[n]` pointent vers la section **Sources**. Identifiants repris de `src/core/contracts.ts` (lecture seule) : `PlayableRole`
(`crs`, `chef_groupe`, `commandant`, `commissaire`, `bravm`, `gendarme_centaure`, `operateur_canon_eau`, `telepilote`, `street_medic`,
`secouriste`, `journaliste`, `manifestant`), `PoliceRank`, `WeatherKind` (`clair`, `nuageux`, `couvert`, `pluie`, `averse`, `brouillard`,
`orage`), `DurationPreset` (`courte`, `standard`, `longue`, `temps_reel`), `SessionConfig` (`tension`, `volatility`, `crowdSize`, `extra`).

---

## 0. L'essentiel en quinze constats

1. **Le jeu vu sur TikTok n'a pas pu être identifié** : sept recherches ciblées n'ont trouvé aucun jeu commercial nommé « simulation CRS » ou « CRS Simulator ». [I]
2. Le concurrent direct le plus sérieux est un simulateur d'émeute à la première personne dont seul le **prologue gratuit** est sorti (21 mai 2025) : avis « mitigés », **61 % positifs sur 921** ; le jeu complet est « prévu pour 2026 » et n'est toujours pas sorti. [V][1][2]
3. Le seul jeu d'émeute abouti (stratégie en 2D, 2019) est jugé « beaucoup plus proche de l'expérimentation que du jeu » : « on ne contrôle pas vraiment les mouvements de foule ». [S][9]
4. **Aucun des jeux recensés ici** ne reproduit la procédure française : autorité civile, sommations au texte exact, cadre légal par arme, enquête disciplinaire. C'est l'espace libre (constat négatif, limité à cette recherche). [V][1][2] ; [S][9][10]
5. Les simulateurs de police sont appréciés pour la **progression de carrière** et critiqués pour les **bogues**, la **répétitivité** et l'intelligence artificielle : 80 mentions de bogues et 39 de répétitivité dans une synthèse d'avis de joueurs. [S][18]
6. Ce que les joueurs réclament d'abord dans un jeu tactique : des **coéquipiers fiables** (intitulés d'une synthèse d'avis : « Friendly SWAT AI fails basic tasks », « AI teammates disobey and get stuck »). [S][20]
7. Récompenser la retenue fonctionne : dans le jeu tactique de référence, on gagne plus de points en arrêtant qu'en neutralisant, et la meilleure note exige que tous les suspects et civils soient arrêtés vivants. [S][19]
8. Une pénalité **inexpliquée** est vécue comme une injustice : un simulateur de patrouille a dû ajouter des « Encounter Reports » consultables pour dire pourquoi des points étaient retirés. [S][17]
9. Jouer **les deux camps** est le point fort unanime du jeu d'émeute de 2019 ; son double score (points « militaires » et « politiques ») est une bonne idée mal exposée. [S][9][11]
10. Commander par radio avec **délai et information partielle** est une boucle reconnue (note de 8/10 dans un test), à condition d'éviter les missions trop scriptées. [S][29]
11. Une foule de 10 000 personnages a été affichée avec seulement **40 intelligences complètes et 120 modèles détaillés** simultanés : la solution est le niveau de détail d'IA. [V][5]
12. En photographie, les **objectifs binaires** (« ai-je capturé ce comportement ? ») sont mieux vécus qu'une note esthétique unique, qui punit les compositions originales. [S][33]
13. Le triage médical a une règle simple et chronométrable : marche = vert ; fréquence respiratoire > 30, pouls radial absent ou ordre simple non exécuté = rouge. [S][39]
14. La banque ci-dessous contient **84 missions** pour 12 rôles et 16 types, toutes situées sur des lieux présents dans les données de carte du dépôt. [V][54]
15. Recommandation : durée standard de **25 minutes**, fin de mission quand il reste moins de 5 % de la foule, prolongations automatiques de 5 minutes ; Mode libre **entièrement déverrouillé** dès le départ (commandant compris). [JEU]

---

## 1. État de l'art : jeux et expériences comparables

### 1.1 Le jeu « simulation CRS » vu sur TikTok : non trouvé

| Piste explorée | Résultat | Fiab. |
|---|---|---|
| Jeu commercial nommé « CRS Simulator », « simulation CRS », « simulateur CRS » (boutiques PC, consoles, mobiles) | **non trouvé** | [I] |
| Expérience Roblox consacrée aux CRS ou au maintien de l'ordre | **non trouvé**. Existent des jeux de rôle francophones généralistes (police, pompiers, gendarmerie) et des kits d'uniformes payants comprenant « Riot Kit and Helmet, Crowd Control Vest » | [S][44] |
| Serveur de jeu de rôle sur GTA avec unité de maintien de l'ordre | **non trouvé** en tant que tel ; les scripts « police » du commerce couvrent arrestations, amendes, preuves, terminal embarqué, régulation, brigade canine : aucune catégorie « manifestation » | [S][45] |
| Mods de simulation militaire | Uniformes et unités de gendarmerie ; un habillage « blindé de maintien de l'ordre » réservé à des serveurs partenaires ; aucun mode de jeu « manifestation » trouvé | [S][46] |
| Petits jeux français satiriques sur les manifestations | Plusieurs, gratuits, faits en quelques heures (voir 1.2) | [V][4] ; [S][47] |
| Hypothèse la plus plausible | Vidéo du prologue du simulateur d'émeute polonais (1.2, ligne 1) ou d'un serveur de jeu de rôle francophone habillé en CRS. **Hypothèse, non confirmée.** | [I] |

### 1.2 Jeux d'émeute et de maintien de l'ordre

| Jeu (année, genre) | Ce qu'il fait bien | Limites et critiques | Fiab. |
|---|---|---|---|
| **Riot Control Simulator: Rookie Day** (prologue gratuit, 21 mai 2025, vue à la première personne) | Vie au commissariat avant la mission ; périmètre posé avec barrières ou cordons ; réponses graduées (négociation, bâton, pistolet à impulsion électrique, gaz) ; amendes, palpation, interpellation ; ordres à l'équipe ; priorité à la sécurité des passants | Avis « Mixed » : 61 % positifs sur 921 ; une seule mission (rixe de supporters devant un pub) ; pic de 1 037 joueurs simultanés le jour de la sortie ; texte des avis de joueurs **non récupéré** | [V][1] ; pic [S][55] |
| **Riot Control Simulator** (annoncé, sortie prévue en 2026, non sorti au 15 novembre 2026) | Promesses : foule qui riposte si l'on abuse de la force, formations compactes, infiltration pour arrêter les meneurs, canon à eau, « décisions morales », plusieurs villes | Cadre de dictature fictive (« support a nascent dictatorship »), un char « en dernier recours » : aucune procédure réelle, aucun contrôle hiérarchique ; pas de police française | [V][2] |
| **RIOT: Civil Unrest** (accès anticipé décembre 2017, sortie 12 février 2019, stratégie 2D en pixels) | On joue manifestants ou policiers ; campagnes inspirées de faits réels (Italie, Grèce, Espagne, Égypte) ; foule à base physique, personnages à statistiques individuelles ; double score « militaire » et « politique » | « on ne contrôle pas vraiment les mouvements de foule » ; « Rarement a-t-on vu un jeu de stratégie aussi minimaliste » ; écran encombré ; murmure de foule permanent qui lasse ; éditeur de niveaux annoncé puis défaillant ; 3,1/5 sur 31 avis d'une boutique | [S][9][10][11][14] |
| **CRS RUSH (Loi Travail Simulator)** (2016, casse-tête fait en 24 h) | Idée simple : « Vous controllez les CRS du gouvernement et il faut vaincre cette foulle de manifestants en colère ! » (orthographe d'origine) : tracer des colonnes pour diviser la foule | Prototype de concours, bogué de l'aveu des auteurs, satirique, sans simulation | [V][4] |
| Autres petits jeux français (« Les Gilets jaunes contre-attaquent », « Syndikaruga »…) | Humour, actualité | Mini-jeux d'arcade ; l'un d'eux prie les joueurs de ne pas reproduire ce qu'ils voient | [S][47] |
| **Urban Chaos: Riot Response** (2006, tir à la première personne) | Bouclier anti-émeute utilisé comme couvert mobile, dégâts visibles sur le bouclier ; le rythme « baisser, agir, relever » | Niveaux linéaires et scriptés ; missions d'émeute peu variées | [S][28] |
| **Anarcute** (2016), **Okhlos** (2016), **Tonight We Riot** (2020) : le joueur *est* la foule | Diriger une masse d'un seul geste ; ordres simples (« attaquer, défendre, se disperser ou se regrouper ») ; la foule grossit en ralliant | Systèmes peu profonds, ton de jeu d'arcade : « crowd control mechanics never really expand » | [S][30][31] |
| Jeux mobiles (fuite ou poursuite en manifestation) | Prise en main immédiate | Hyper-occasionnels, publicité envahissante ; 3,8/5 sur 835 notes pour l'un | [S][48] |
| Jeux de régulation des secours (**911 Operator**, **112 Operator**, **MissionChief**) | L'émeute comme incident à pourvoir : forte présence policière et canons à eau ; une « grande manifestation violente » exige 12 voitures de police et 4 équipes cynophiles dans une variante | Vue carte uniquement ; aucune foule simulée | [S][41][42] |

### 1.3 Simulateurs de police, de secours et jeux tactiques

| Jeu | Mécaniques appréciées | Mécaniques critiquées | Fiab. |
|---|---|---|---|
| **Police Simulator: Patrol Officers** | Carrière par quartiers à débloquer ; **100 « Conduct Points » par service**, retirés à chaque faute (fouille sans motif…), service terminé à zéro ; tirer sur quelqu'un met fin à la journée ; « Shift Points » de progression | Synthèse d'avis : bogues (80 mentions), contenu payant préféré aux corrections (56), **répétitif et ennuyeux (39)**, IA et véhicules (31) ; presse : 61 de moyenne, 43 % de recommandation ; un test le dit ennuyeux, moralement plat et bogué | [S][15][16][17][18] |
| **Ready or Not** | Arrêter rapporte plus que neutraliser ; note maximale seulement si tous les suspects et civils sont arrêtés vivants ; pénalité d'environ 50 points pour usage non autorisé de la force ; ordres par menu contextuel à deux équipes (rouge, bleue) ou à toutes (or) ; mode « Commander » : le moral des agents se dégrade, **3 agents au plus en thérapie**, démissions possibles | Coéquipiers et adversaires dirigés par une IA incohérente ; optimisation ; pénalités jugées inconstantes par des joueurs ; menu radial jugé capricieux par un test | [S][19][20][21][22] |
| **Flashing Lights** (accès anticipé 7 juin 2018, sortie 15 mai 2023) | Trois services jouables (police, pompiers, secours médical), coopération jusqu'à 10 joueurs ; 82 % d'avis positifs sur 10 061 | Monde vide, « you can do pretty much everything in the game within half an hour » (aperçu d'accès anticipé) ; avis récents à 62 % | [V][3] ; [S][23] |
| **The Precinct** (13 mai 2025) | « chacune des interventions est évaluée selon les méthodes employées » ; la violence gratuite n'est pas récompensée ; ambiance | Jeu répétitif, IA défaillante, bogues ; environ 8 heures d'histoire ; 6,5/10 dans deux tests français | [S][24][25][26] |
| **This Is the Police** (2016, gestion) | Dilemmes d'effectif (qui envoyer, combien), pressions politiques, loyauté des agents | Répétition ; un testeur s'est senti « dragged along with little direction » après 20 jours de jeu ; notes de 63 à 71 | [S][27] |
| **Radio Commander** (2019) | Commander **uniquement par radio**, carte fixe sans position ennemie, comptes rendus à interpréter, déplacements longs | Unités qui répondent trop instantanément selon un test ; missions trop scriptées selon des joueurs ; notes de 6 à 8 sur 10 | [S][29] |
| Série **Emergency** | Coordination de plusieurs services sur une scène | Mission de manifestation ou d'émeute : **non trouvé** ; cinquième épisode noté 53 sur 100 par 6 critiques | [I] ; [S][56] |

### 1.4 Jeux de rôle en ligne et outils professionnels

| Sujet | Constat | Fiab. |
|---|---|---|
| Jeu de rôle de services d'urgence le plus fréquenté d'une plateforme de création | Plus de **1,1 milliard de visites** (compteur relevé en mars 2025) ; rôles civil, criminel, policier, shérif, pompier ; aucune fonction « émeute » trouvée | [S][43] |
| Jeux de rôle francophones sur la même plateforme | Villes françaises fictives ou réelles, métiers de police nationale, municipale, gendarmerie, pompiers ; la manifestation y est improvisée par les joueurs, sans règle ni foule simulée | [S][44] |
| Ce que ces jeux de rôle apportent | L'attrait du **costume**, du grade, de la radio et de la hiérarchie entre joueurs : exactement ce que montre une vidéo courte | [E] |
| Simulateur professionnel de la gendarmerie | Simulateur en deux dimensions « Romulus », conçu par l'armée de Terre, employé pour entraîner du niveau du groupe jusqu'au groupement opérationnel de maintien de l'ordre (article officiel de 2026, **non lu** : accès refusé) | [S][7] |
| Stand de la gendarmerie au salon du jeu vidéo de Paris (2025) | Expérience immersive « Du virtuel à la réalité » (article officiel **non lu** : accès refusé) | [I][6] |

### 1.5 Technique de foule : la référence parisienne

| Donnée (jeu d'aventure historique situé à Paris, 2014) | Valeur | Fiab. |
|---|---|---|
| Foule simultanée revendiquée | « 5000 people in a crowd at once » ; une scène à 10 000 personnages | [S][32] ; [V][5] |
| Plafonds techniques réels | **40 intelligences « réelles »** et **120 modèles haute définition** à la fois ; les autres sont des répliques basse définition, échangées sans que le joueur le remarque | [V][5] |
| Comportements | Environ 6 humeurs par personnage (visage, démarche) ; « crowd stations » : des personnages s'agrègent autour d'un événement | [S][32] |
| Moyens humains | Plus de 70 animateurs sur la foule | [S][32] |

### 1.6 Synthèse : ce que les joueurs aiment, ce qu'ils rejettent

| Les joueurs aiment | Les joueurs rejettent |
|---|---|
| Monter en grade, débloquer du matériel et des quartiers [S][15][17] | Refaire dix fois la même intervention [S][18][24] |
| Être noté sur la **méthode**, pas sur le nombre de neutralisations [S][19][24] | Perdre des points sans savoir pourquoi [S][17][21] |
| Commander une équipe qui obéit [S][19] | Des coéquipiers qui se bloquent ou désobéissent [S][20] |
| Jouer l'autre camp [S][9] | Une interface encombrée et un son de foule monotone [S][9] |
| Le costume, la radio, la hiérarchie [S][43][44] | Un monde vide, sans passants [S][23] |
| Les dilemmes moraux avec conséquences durables [S][19][27] | Un propos politique appuyé ou caricatural [S][10][38] |

> **Ce que le jeu doit reproduire — État de l'art**
> - Se placer là où personne n'est : **procédure française réelle** (autorité civile, sommations, cadre légal, discipline) dans un **Paris reconnaissable**.
> - Reprendre ce qui marche : carrière à déblocages, note sur la méthode, jeu des deux camps, double score tactique et image publique.
> - Corriger les quatre reproches constants : répétitivité (aléas et graine), pénalités opaques (compte rendu ligne à ligne), coéquipiers défaillants (priorité de développement), interface et son chargés.
> - Rester **neutre** : ni dictature fictive, ni caricature ; aucun camp n'est « le méchant ».
> - Foule : 40 à 60 personnages à intelligence complète autour du joueur, le reste en comportements simplifiés et en instances (BRIEF §5.6).

---

## 2. Trente mécaniques qui font la différence (classées par priorité)

Lot **P0** = indispensable à la première version jouable ; **P1** = version complète ; **P2** = après la sortie. La colonne « constat » renvoie à ce que les jeux existants font mal ou ne font pas (section 1). Les valeurs sont des cibles de conception [JEU].

| # | Mécanique | Constat qui la justifie | Cible concrète | Lot |
|---|---|---|---|---|
| 1 | **État légal par unité** : cortège → attroupement → annonce → sommations → force → armes → fin (01 §1.8) | Absent de tous les jeux recensés [V][1][2] | 7 états ; 3 phrases exactes, audio et sous-titres ; toute action coercitive comparée à l'état courant | P0 |
| 2 | **Foule à identité sociale** : la force perçue comme indiscriminée soude les pacifiques aux violents (03 §5) | Promis ailleurs, jamais montré [V][2] | 8 profils ; contagion dans un rayon de 8 m ; tension locale et globale | P0 |
| 3 | **Coéquipiers fiables** | Premier grief des joueurs de jeu tactique [S][20] | Alignement à ± 1 m ; ordre exécuté en moins de 1,5 s ; jamais bloqué plus de 3 s ; annonces vocales | P0 |
| 4 | **Compte rendu ligne à ligne** | Pénalités opaques ailleurs [S][17][21] | Au plus 40 lignes : heure, lieu, acte, règle, points ; chaque ligne localisable sur la carte | P0 |
| 5 | **Trois notes séparées** : tactique, image publique, discipline | Double score bien vu mais mal exposé [S][9][11] | Trois jauges de 0 à 100, visibles en fin de mission seulement | P0 |
| 6 | **Ordres par verbes tactiques** (01 §4.7) appliqués à un groupe, une section, la compagnie | Menu d'ordres jugé capricieux ailleurs [S][22] | 12 verbes ; menu radial de 8 entrées au plus, 2 niveaux ; même menu sur les trois supports | P0 |
| 7 | **Dialogue autorité civile ↔ commandant** : demande, autorisation tracée | Inexistant ailleurs | Délai d'autorisation de 5 à 45 s selon le mode de commandement (01 §4.4) | P0 |
| 8 | **Lisibilité** : trois niveaux de lecture (à hauteur d'homme, carte tactique, drone) | « Écran encombré » [S][9] | 6 indicateurs au plus à l'écran ; un code couleur par camp, constant | P0 |
| 9 | **Gaz porté par le vent** et retour de gaz | Absent ou cosmétique ailleurs | Nuage déplacé par `windX`, `windZ` ; effets de 15 à 30 min réels compressés (03 §4.3) | P0 |
| 10 | **Interpellation en cinq temps** : repérage, fait constaté, bond, menottage, fiche | Un simple bouton ailleurs | 45 s en moyenne ; erreur d'identité plus coûteuse que l'abandon | P0 |
| 11 | **Son en couches** : slogans, sono, radio, détonations, sirènes | Murmure de foule lassant [S][9] | 5 couches au moins, mixées selon distance et tension ; sommation audible à 80 m | P0 |
| 12 | **Directeur de tension, aléas et graine** | Répétitivité partout [S][18][24][28] | Catalogue de 30 aléas ; 3 tirés par mission ; même graine = même partie | P0 |
| 13 | **Échelle de foule** | 10 000 affichés avec 40 IA complètes [V][5] | 300 personnages et plus à 60 images/s ; 40 à 60 IA complètes autour du joueur | P0 |
| 14 | **Fidélité des silhouettes** : casques, bandes, marquage dorsal « 1A », écharpe, galons | Attrait du costume dans les jeux de rôle [S][44] | Unité reconnaissable à 30 m ; grade lisible à 5 m | P0 |
| 15 | **Trois supports** : clavier-souris, manette, tactile | Exigence du projet | Les mêmes verbes partout ; aucune action réservée à un support | P0 |
| 16 | **Durée réglable** et compression du temps | Sessions trop longues ou trop courtes ailleurs | 10, 25, 45 min ou temps réel ; fin quand la foule tombe sous 5 % | P0 |
| 17 | **Tiers vivants** : passants, touristes, commerçants, riverains aux fenêtres | « Monde vide » [S][23] | 10 % au moins des personnages ; chacun réagit (fuit, filme, s'abrite) | P1 |
| 18 | **Caméras partout** : journalistes et téléphones | Inexistant ailleurs | Publication après 30 à 120 s ; effet sur tension et image (03 §7) | P1 |
| 19 | **Temps calme utile** : observation, signes avant-coureurs, comptes rendus | Ennui reproché aux simulateurs [S][18] | Une micro-tâche toutes les 45 à 90 s ; accélération ×4 si la tension est sous 0,15 | P1 |
| 20 | **Conséquences durables** : dossier disciplinaire, fatigue et blessures de l'unité, image publique | Apprécié dans deux jeux de gestion policière [S][19][27] | Image globale qui déplace la tension initiale suivante de ± 0,1 ; agent blessé indisponible 1 à 3 missions | P1 |
| 21 | **Regards croisés** : la même scène rejouée dans un autre rôle | Point fort du jeu des deux camps [S][9] | 8 paires de missions miroirs au moins (section 5.3) | P1 |
| 22 | **Feu** : propagation, extinction, protection des pompiers | Absent ailleurs | Poubelle → façade en 90 s sans intervention ; véhicule → véhicule à moins de 2 m | P1 |
| 23 | **Véhicules à rôle tactique** | Décor ailleurs | Engin lanceur d'eau : 10 000 l, 15 l/s ; Centaure : 1 à 30 tirs, lame ; fourgons en barrage (02 §4) | P1 |
| 24 | **Mobilier urbain physique** : tout projectile vient d'un objet présent | Projectiles infinis ailleurs | Stock par rue ; la prévention (M17) le réduit | P1 |
| 25 | **Densité et compression** | Absent ailleurs | Alerte à 4 personnes/m², danger à 5 ; issues à garder ouvertes | P1 |
| 26 | **Météo et heure** qui changent la partie | Cosmétique ailleurs | Pluie : foule −20 % ; nuit : pillage plus fréquent ; froid : jet d'eau dangereux ; brouillard : drone aveugle | P1 |
| 27 | **Formation intégrée** : ateliers de 3 min | Vie au commissariat appréciée dans le prologue concurrent [V][1] | 4 ateliers avant la première mission ; chaque nouvel outil a le sien | P1 |
| 28 | **Ordre illégal refusable** et intégrité du compte rendu | Inexistant ailleurs | Bouton « faire part de mes objections » ; mentir se paie à l'enquête (01 §7) | P1 |
| 29 | **Éditeur de scénario** exportable | Éditeur promis puis défaillant chez le concurrent de 2019 [S][14] | Un fichier JSON par scénario ; 10 paramètres ; partage par copier-coller | P2 |
| 30 | **Relecture sur carte** après la mission | Revoir sa propre émission est apprécié dans un jeu de régie [S][38] | Traces des unités, des tirs et de la tension, à vitesse ×8 | P2 |

> **Ce que le jeu doit reproduire — Mécaniques**
> - Les seize lignes P0 forment le socle : sans elles, le jeu ressemble à ses concurrents.
> - Une règle d'or issue des avis de joueurs : **ne jamais retirer un point sans dire pourquoi, où et quand**.
> - La retenue rapporte : la meilleure note d'une mission doit pouvoir s'obtenir sans aucun emploi de la force (M30).
> - Chaque partie diffère : la graine, les aléas et la météo se combinent ; le compte rendu affiche la graine pour rejouer ou partager.

---

## 3. Rôles asymétriques : les boucles de jeu qui fonctionnent

### 3.1 Journaliste : photographier, cadrer, publier

| Référence | Comment la photo est jugée | Leçon | Fiab. |
|---|---|---|---|
| **New Pokémon Snap** (safari photo) | Six critères : pose, taille, direction, placement, autres sujets, arrière-plan ; plafonds estimés par les joueurs à 2 000, 2 000, 1 000, 1 000, 1 000 et 500 points (estimations discordantes) | Lisible, mais « une composition idéale » écrase les autres | [S][33][34] |
| **Dead Rising** (photoreporter au milieu de zombies) | Genres attribués automatiquement selon le contenu (brutalité, drame, horreur, insolite) et bonus « Photo Op » | Le **contenu** compte plus que la technique | [S][35] |
| **Umurangi Generation** (photographie urbaine) | Liste de commandes à remplir par niveau, objectifs bonus (recréer une carte postale, photographier ses amis), objectifs débloqués avec la progression | La **liste de commandes** donne un but sans noter l'esthétique | [S][36] |
| **1979 Revolution: Black Friday** (récit interactif, photoreporter dans une révolution) | Chaque cliché du joueur est affiché à côté d'une photographie d'archive réelle, avec un texte ; 80 sur 100 dans une compilation de critiques | La photo comme **témoignage** | [S][37] |
| **Not for Broadcast** (régie d'un journal télévisé) | Choisir le flux diffusé, retard d'antenne de 2 s, jauge d'audience ; l'échec survient si l'audience tombe à zéro ; 82 sur 100 | Le **montage** change le récit et a des conséquences | [S][38] |
| Article de conception (Game Developer) | Préférer des objectifs **binaires** (angle, partie du sujet, comportement capturé) à un jugement de qualité ; ne pas punir les compositions inhabituelles | Mélanger commandes binaires et petit barème | [S][33] |

Barème proposé [JEU], sur 1 000 points par photo (le mode vidéo applique le même barème à la meilleure image de la séquence) :

| Critère | Points | Règle de calcul |
|---|---|---|
| Événement dans le cadre | 0 à 400 | Banderole ou slogan 40 ; portrait 60 ; sommation avec écharpe visible 120 ; interpellation 180 ; charge 200 ; blessé secouru 200 ; véhicule en feu 220 ; faute d'un agent ou violence grave d'un manifestant 400 |
| Taille du sujet | 0 à 150 | Maximum si le sujet occupe 15 à 60 % de la hauteur du cadre |
| Netteté | 0 à 100 | Maximum si la caméra tourne à moins de 20°/s et si le joueur est immobile |
| Contexte | 0 à 100 | Les deux camps dans le cadre : +50 ; monument reconnaissable : +50 |
| Proximité et risque | 0 à 150 | Sujet à moins de 10 m : 150 ; à moins de 25 m : 80 |
| Exclusivité | 0 à 100 | Aucun autre journaliste avec ligne de vue à moins de 15 m |
| Malus | −300 | Blessé identifiable en gros plan (mode « réaliste ») ; visage d'un mineur ; légende fausse |

Contraintes de boucle [JEU] : 24 vues par mission ; envoi à la rédaction en 20 s, immobile ; 5 commandes binaires par mission ; la photo publiée agit sur la tension et l'image publique après 30 à 120 s (03 §7).

### 3.2 Médecin et secouriste : trier, soigner, extraire

| Catégorie | Critère de la méthode de triage START | Couleur (hex) | Fiab. |
|---|---|---|---|
| Vert, « mineur » | La victime peut marcher | `#2E9E44` | [S][39] |
| Noir, « décédé ou en attente » | Ne respire pas, même après ouverture des voies aériennes | `#1A1A1A` | [S][39] |
| Rouge, « immédiat » | Fréquence respiratoire supérieure à 30 par minute, **ou** pouls radial absent ou recoloration capillaire de plus de 2 s, **ou** n'exécute pas un ordre simple | `#D0021B` | [S][39] |
| Jaune, « retardé » | Tous les autres : ne marche pas, respire normalement, perfusion correcte, obéit | `#F5C400` | [S][39] |

Moyen mnémotechnique cité par la source : « RPM:30-2-can do ». Défaut connu de la méthode : le sur-triage. [S][39]

| Geste de jeu [JEU] | Durée | Effet |
|---|---|---|
| Évaluation (regarder, écouter, prendre le pouls, parler) | 15 s | Révèle la catégorie ; 4 mini-contrôles de 3 à 4 s |
| Rinçage des yeux au sérum | 8 s | Met fin à l'aveuglement en 20 s au lieu de 3 min |
| Compression d'une plaie, pansement | 10 s | Arrête la dégradation d'un jaune |
| Garrot ou pansement compressif | 12 s | Stabilise un rouge pendant 6 min |
| Position latérale de sécurité | 6 s | Obligatoire pour un inconscient qui respire |
| Couverture de survie | 4 s | Arrête l'hypothermie (M52, M67) |
| Portage à deux ou sur brancard | 1,0 à 1,5 m/s | Vers un point de regroupement à 30–80 m (03 §6.5) |

Notation [JEU] : tri correct +100 ; sur-tri −20 ; sous-tri −150 ; rouge pris en charge en moins de 120 s +100 ; refus de soin à un blessé, quel que soit son camp : échec. Un simulateur d'ambulancier récent (« Ambulance Life ») est critiqué par des joueurs pour le manque de profondeur de ses décisions médicales : le tri chronométré est la réponse. [S][40]

### 3.3 Télépilote de drone : voir, désigner, guider

| Élément de boucle | Valeur | Fiab. |
|---|---|---|
| Deux limites réelles citées par les unités d'intervention | La portée du signal et l'autonomie de la batterie | [S][50] |
| Cadre légal | Arrêté par événement : périmètre et horaires (02 §5) | [S] (dossier 02) |
| Batterie de jeu | 30 à 40 min réelles, ramenées à 40 % de la durée de mission ; retour à 20 % ; relève par un second appareil en 45 s | [JEU] |
| Altitude | 60 à 120 m ; bourdonnement audible sous 80 m, les personnages lèvent la tête | [E] (dossier 02) ; réaction [JEU] |
| Marquage | 5 individus au plus ; uniquement après un **fait** vu à l'image ; marque valable 180 s sans contact visuel | [JEU] |
| Lecture de densité | Vert sous 2, orange de 2 à 4, rouge au-dessus de 4 personnes/m² | [JEU] |
| Notation | Signe avant-coureur signalé à temps +60 ; marquage fondé +80 ; marquage sans fait −150 ; sortie de périmètre −100 par tranche de 10 s | [JEU] |

### 3.4 Commandant et autorité civile : décider avec peu, ordonner court

| Référence | Ce qui fonctionne | Fiab. |
|---|---|---|
| **Radio Commander** (commandement par radio) | Aucune position ennemie sur la carte ; le joueur déduit la situation des comptes rendus ; les ordres prennent du temps | [S][29] |
| **Hell Let Loose** (tir militaire en équipes hiérarchisées, 14 rôles) | Un seul commandant par camp, qui parle aux **chefs de groupe** et non aux soldats ; les comptes rendus qui remontent comptent autant que les ordres qui descendent ; le chef de groupe est le rôle qui manque toujours | [S][49] |
| **Ready or Not** (tactique policière) | Deux équipes de couleur et un ordre commun ; coéquipiers autonomes pour les menaces immédiates | [S][19] |

Boucle proposée [JEU] : **observer** (carte, drone, radio) → **décider** (verbe + unité + lieu) → **ordonner** (2 s) → **accusé de réception** vocal (« Reçu, 2A tient l'angle ») → **exécution** (10 à 60 s) → **compte rendu** montant. Le commandant ne voit sur la carte que ce que ses unités ou le drone voient. L'autorité civile ajoute la boucle **demande → autorisation → trace**.

### 3.5 Manifestant : rester ensemble, choisir sa conduite

Boucle proposée [JEU] : suivre son groupe (distance inférieure à 15 m), scander (touche en rythme, sans obligation), lire la situation (sommations entendues, issues ouvertes), choisir (rester, aider, partir, basculer). Trois jauges personnelles : **cohésion** avec le groupe, **peur**, **colère**. Aucune récompense pour la violence : les missions « radical » sont notées sur l'absence de tiers blessé et se terminent par un bilan des suites (M83).

| Rôle | Boucle de 30 secondes | Boucle de 5 minutes | Ressource rare | Risque principal |
|---|---|---|---|---|
| CRS de base | Tenir sa place, parer, exécuter l'ordre | Barrage, bond, retour en ligne | Endurance, munitions comptées | Geste hors cadre |
| Chef de groupe | Placer 6 agents, rendre compte | Tenir un carrefour, interpeller | Moral et fatigue du groupe | Agent isolé |
| Commandant | Lire la carte, donner un verbe | Bascule d'effort, réserve | Sections disponibles | Unité encerclée |
| Autorité civile | Écouter, autoriser ou refuser | Séquence de sommations | Temps de décision | Autorisation disproportionnée |
| BRAV-M | Rouler, débarquer | Devancer, interpeller, repartir | Carburant, garde des motos | Erreur de personne |
| Équipage Centaure | Conduire au pas, surveiller les angles morts | Dégager, appuyer, embarquer | 30 tirs | Contact avec une personne |
| Opérateur du canon à eau | Rafale de 3 à 10 s | Tenir un axe, se ravitailler | 10 000 l d'eau | Tiers touché |
| Télépilote | Cadrer, zoomer, marquer | Suivre, guider, relever | Batterie, périmètre | Marquage sans fait |
| Médecin | Évaluer en 15 s, un geste | Trier un groupe, extraire | Stock, temps des rouges | Sous-tri |
| Journaliste | Se placer, cadrer, déclencher | Remplir 5 commandes, envoyer | 24 vues | Matériel détruit |
| Manifestant | Suivre, scander, regarder | Marcher, s'arrêter, partir | Cohésion du groupe | Séparation, blessure |

> **Ce que le jeu doit reproduire — Rôles**
> - Chaque rôle a une **ressource rare** et un **risque propre** ; aucun n'est une variante habillée du CRS.
> - Journaliste : commandes binaires + barème sur 1 000 ; la publication agit sur le monde.
> - Médecin : triage START chronométré, quatre couleurs, gestes de 4 à 15 s, neutralité obligatoire.
> - Télépilote : périmètre légal dessiné dans le viseur, batterie, 5 marquages fondés sur un fait.
> - Commandement : carte limitée à ce que voient les unités ; ordres courts, accusés de réception, comptes rendus.
> - Manifestant : jauges de cohésion, peur et colère ; la violence n'est jamais la voie la mieux notée.

---

## 4. Banque de missions (84 missions) [JEU]

### 4.0 Conventions

Chaque mission tient en cinq lignes : **titre** (identifiant, type, difficulté de ★ à ★★★★★) ; **Cadre** (lieu, jour et heure, météo au format `WeatherKind`, forces, foule simulée, `tension` et `volatilité` initiales) ; **Phases** ; **Objectifs** (P = principaux, S = secondaires) ; **Aléas, Échec, Unique**. Durée `standard` (25 min) sauf mention. La foule indiquée est l'effectif **simulé** (`crowdSize` avant `Settings.crowdScale`) ; le briefing peut annoncer un chiffre narratif 10 à 40 fois supérieur, figuré par le son et des silhouettes lointaines. Tous les lieux cités existent dans `tools/map/raw/normalized/places.geojson` (vérification faite sur 207 noms). [V][54]

| Unité (01 §4) | Effectif de jeu | | Unité | Effectif de jeu |
|---|---|---|---|---|
| Groupe | 7 | | Escadron de gendarmerie mobile | 64 (4 pelotons de 16) |
| Section | 18 | | Unité BRAV-M | 18 motos, 36 agents |
| Demi-compagnie | 36 | | Engin lanceur d'eau | équipage de 3 |
| Compagnie de CRS | 78 à pied | | Centaure | équipage de 3 + 7 embarqués |

| Mouvement ou entité fictive | Nature | Cause fictive | Couleur (hex) | Slogan exact |
|---|---|---|---|---|
| « Front commun des Ateliers » | Intersyndicale | Contre le « projet Horizon » (réforme fictive des horaires de travail) | turquoise `#1FA3A3` | « Horizon, c'est non ! » |
| « Collectif Lumière Pour Tous » | Collectif d'usagers | Contre une hausse fictive des tarifs de l'énergie | bleu ciel `#5DADE2` | « La lumière pour tous ! » |
| « Bonnets Blancs » | Mouvement sans organisateur | Colère diffuse, samedis non déclarés | blanc `#F2F2F2` | « Écoutez-nous ! » |
| « Coordination Étudiante Rive Gauche » | Étudiants | Contre la réforme fictive « Parcours+ » | vert menthe `#58C99B` | « Parcours pour tous ! » |
| « Marche pour les Arbres de Paris » | Association de riverains | Contre l'abattage d'arbres du « Grand Axe » | vert feuille `#3C8D4B` | « Des arbres, pas du béton ! » |
| « Oui au Grand Axe » / « Non au Grand Axe » | Deux comités opposés | Projet d'urbanisme fictif | orange `#E67E22` / violet `#7D3C98` | « Oui au Grand Axe ! » / « Non au Grand Axe ! » |
| « Convoi des Champs » | Agriculteurs en tracteurs | Contre la « taxe Sillon » fictive | paille `#C8A24A` | « Sans champs, pas de pain ! » |
| « Blouses Claires » | Personnels soignants | Effectifs hospitaliers | bleu pâle `#A9CCE3` | « Des bras pour soigner ! » |
| « Bateliers de Seine » | Professionnels du fleuve | Indemnisation après la crue | marine `#1F3A5F` | « La Seine nous fait vivre ! » |
| « Veilleurs de Minuit » | Rassemblements nocturnes non déclarés | Variable | anthracite `#4A4A4A` | « On veille ! » |
| « Racing Lutèce » / « Olympique des Ponts » | Clubs de football fictifs | Rivalité sportive | bordeaux `#7B1E3A` / vert bouteille `#1E6B4E` | « Allez Lutèce ! » / « Les Ponts ! Les Ponts ! » |
| « République de Valdoria », « Comité Valdoria Libre », « Sommet des Capitales » | État, opposants et sommet fictifs | Visite officielle | bleu canard `#0E6F7C` | « Valdoria libre ! » |

| Lieu | Dimensions | Fiab. | | Lieu | Dimensions | Fiab. |
|---|---|---|---|---|---|---|
| Avenue des Champs-Élysées | 1 910 × 70 m ; chaussée 30 m ; trottoirs 20 m | [S][51] | | Place Charles de Gaulle | ≈ 240 m de diamètre, 12 avenues | [E] |
| Place de la Concorde | 360 × 210 m ; 7,56 ha | [S][51] | | Boulevard Beaumarchais | ≈ 750 × 35 m | [E] |
| Place de la Bastille | 215 × 150 m | [S][51] | | Boulevard du Temple | ≈ 400 × 36 m | [E] |
| Place de la République | 283 × 119 m ; 3,4 ha | [S][51] | | Rue Royale | ≈ 280 × 23 m | [E] |
| Esplanade des Invalides | 487 × 275 m | [S][51] | | Avenue Kléber | ≈ 1 100 × 36 m | [E] |
| Champ-de-Mars | 780 × 220 m ; 24,3 ha | [S][51] | | Ponts de la Concorde, Alexandre III, d'Iéna | ≈ 150–160 m de long, 35–40 m de large | [E] |

Les valeurs [E] sont des ordres de grandeur : la géométrie de la carte du jeu fait foi.

| Échecs communs aux rôles de police | Aléas transverses (probabilité par mission) |
|---|---|
| Mort d'une personne imputable au joueur : fin immédiate, enquête | Retour de gaz par vent tournant, si du gaz est employé : 35 % |
| Arme de service employée hors légitime défense | Rumeur relayée en ligne (tension +0,05) : 30 % |
| Trois actes hors cadre légal, ou un seul tir tendu ou tir de LBD pour disperser | Malaise dans la foule : 25 % ; vidéo d'un geste devenue virale : 25 % |
| Abandon de poste de plus de 60 s (exécutant) ; unité laissée sans ordre plus de 120 s (chef) | Ambulance à laisser passer : 20 % ; enfant ou personne âgée en zone dangereuse : 20 % |
| Image publique de la mission sous 20 sur 100 | Averse soudaine (foule −20 %) : 15 % |
| Plus de la moitié de l'unité hors de combat | Panne radio de 60 s : 10 % ; ordre contradictoire de la salle : 10 % ; relève en retard : 10 % |

### 4.1 CRS de base — gardien de la paix (`crs`)

#### M01 — « Premier samedi » · manifestation déclarée · ★
- **Cadre** : Rue Amelot puis Boulevard Beaumarchais ; samedi 14 h 00 ; `clair` ; votre section (18) en réserve, invisible du cortège ; 400 marcheurs du « Front commun des Ateliers », marche calme ; tension 0,05 / volatilité 0,1 ; durée `courte`.
- **Phases** : ① perception du matériel au fourgon (6 contrôles : casque, bouclier, bâton, gazeuse, radio, numéro d'identification) ② attente en rue parallèle, appel radio du groupe ③ barrage de principe à l'angle du boulevard, à moins de 1 m des voisins ④ dispersion Place de la Bastille : laisser sortir par la Rue Saint-Antoine.
- **Objectifs** : P — exécuter 5 ordres en moins de 3 s chacun ; rester dans la ligne 90 % du temps ; zéro emploi de la force. S — signaler par radio 2 faits utiles ; renseigner 1 touriste.
- **Aléas** — touriste qui cherche la colonne de Juillet ; manifestant qui offre un café ; averse de 2 min. **Échec** — quitter la ligne plus de 60 s ; lever le bâton sans ordre. **Unique** — aucune violence : l'essentiel du métier est d'attendre, d'observer et de tenir sa place.
#### M02 — « Pluie de pavés » · manifestation déclarée qui dégénère · ★★
- **Cadre** : Boulevard du Temple ; jeudi 16 h 30 ; `couvert`, vent d'ouest 15 km/h ; 1 section (18), vous porte-bouclier du groupe 1A ; 600 simulés dont précortège 150 et 20 radicaux ; tension 0,35 / volatilité 0,6.
- **Phases** : ① barrage à une rue transversale ② premiers jets : lever le bouclier, couvrir le lanceur placé derrière vous ③ sommations de l'autorité civile (texte intégral, 01 §1.2) ④ bond offensif de 30 m sur ordre, retour en ligne ⑤ fin de l'emploi de la force dès le reflux.
- **Objectifs** : P — parer 80 % des projectiles visant votre créneau ; ne pas avancer avant l'ordre ; revenir en ligne en moins de 15 s. S — aucun coup porté ; relever un collègue tombé.
- **Aléas** — grenade lacrymogène renvoyée ; retour de gaz ; journaliste entre les lignes. **Échec** — charge individuelle ; coup sur une personne à terre. **Unique** — endurance du bras et lecture des trajectoires : apprendre à encaisser sans répondre.
#### M03 — « Extincteur ! » · protection des secours · ★★
- **Cadre** : Place du Châtelet et Rue de Rivoli ; vendredi 21 h 15 ; `clair`, nuit ; 1 groupe (7), vous au poste extincteur ; 250 simulés, 6 départs de feu ; tension 0,55 / volatilité 0,5.
- **Phases** : ① feu de poubelles contre une façade : éteindre en moins de 40 s ② deux-roues en feu : approche sous la protection de deux boucliers ③ arrivée des sapeurs-pompiers : ouvrir et tenir un couloir de 3,5 m ④ repli, recharge au fourgon.
- **Objectifs** : P — aucun feu ne gagne une façade ; aucun pompier touché. S — 2 extincteurs au plus ; riverain sorti d'un hall enfumé.
- **Aléas** — extincteur vide (environ 20 s de jet) ; mortier d'artifice vers les pompiers ; commerçant qui veut sauver sa terrasse. **Échec** — façade en feu plus de 90 s ; pompier blessé. **Unique** — un CRS qui sauve au lieu de repousser : image publique en hausse.
#### M04 — « Le pont ne passe pas » · maintien d'un barrage · manifestation interdite · ★★★
- **Cadre** : Pont de la Concorde, côté Place de la Concorde ; mardi 19 h 00 ; `pluie` ; demi-compagnie (36), 4 fourgons en barrage ; 500 simulés des « Veilleurs de Minuit », 5 % de radicaux ; tension 0,4 / volatilité 0,5.
- **Phases** : ① installation des barrières et des fourgons (INTERDIRE) ② poussée de la foule contre les boucliers (jauge de pression) ③ tentative de contournement par le Quai des Tuileries ④ sommations puis refoulement de 50 m ⑤ retour au barrage.
- **Objectifs** : P — aucun franchissement vers le Palais Bourbon ; ligne jamais rompue. S — aucun lanceur employé ; 1 ambulance passée en moins de 30 s.
- **Aléas** — pluie qui disperse 20 % de la foule ; personne coincée contre une barrière ; ordre contradictoire de la salle. **Échec** — 10 personnes franchissent ; blessé par compression. **Unique** — la pression physique d'une foule qui pousse, à contenir sans frapper.
#### M05 — « Lanceur désigné » · manifestation déclarée, dispersion · ★★★
- **Cadre** : Place de la République ; samedi 18 h 40 ; `nuageux`, vent tournant ; compagnie (78), vous lanceur habilité (8 grenades) ; 700 simulés restés après l'ordre de dispersion, 40 radicaux ; tension 0,5 / volatilité 0,6.
- **Phases** : ① attente, arme au pied ② sommations réitérées : armes autorisées ③ tirs en cloche sur ordre, zone désignée par le chef de groupe ④ cessez-le-feu dès le reflux.
- **Objectifs** : P — tous les tirs sur ordre et en cloche ; aucun tir vers une issue ou un poste de soins. S — 5 grenades au plus ; compte rendu de tir exact (nombre, heure).
- **Aléas** — vent qui ramène le nuage sur une terrasse ; famille dans la zone désignée (l'annoncer, refuser le tir) ; grenade renvoyée. **Échec** — tir tendu ; tir avant la réitération de la dernière sommation. **Unique** — chaque munition est comptée et tracée ; l'ordre peut être légitimement refusé.
#### M06 — « Nuit de finale » · soir de match · ★★★
- **Cadre** : Avenue des Champs-Élysées, entre l'Avenue George V et le Rond-Point des Champs-Élysées ; dimanche 23 h 10 ; `clair` ; compagnie (78) ; 1 000 simulés (supporters du « Racing Lutèce » 78 %, opportunistes 10 %, pilleurs 4 %) ; tension 0,25 / volatilité 0,5.
- **Phases** : ① présence visible pendant la fête (klaxons, fumigènes de couleur) ② grimpeurs sur le mobilier urbain ③ tentative de pillage de 2 boutiques ④ fermeture progressive de l'avenue.
- **Objectifs** : P — protéger 2 vitrines désignées ; zéro emploi de la force contre les fêtards. S — faire descendre 3 grimpeurs sans chute ; 2 interpellations de pilleurs en flagrant délit.
- **Aléas** — deux-roues qui remonte la foule ; rixe entre supporters ; fumigène pris pour un départ de feu. **Échec** — gaz sur la foule festive ; vitrine pillée 60 s sans réaction. **Unique** — distinguer la liesse de la casse dans une même foule.
#### M07 — « Colonne d'interpellation » · interpellation ciblée · ★★★★
- **Cadre** : Carrefour de l'Odéon, Boulevard Saint-Germain ; jeudi 17 h 20 ; `nuageux` ; vous, équipier d'une section de protection et d'intervention (groupe de 7) ; 500 simulés ; cible marquée par le drone après un jet ; tension 0,5 / volatilité 0,5.
- **Phases** : ① description radio de la cible (3 indices vestimentaires) ② approche par le flanc, masqué par la ligne ③ bond de 25 m, saisie à deux, menottage en 4 étapes ④ extraction vers le fourgon ⑤ fiche d'interpellation : fait constaté, heure, lieu.
- **Objectifs** : P — interpeller la bonne personne ; extraction en moins de 45 s. S — aucune blessure ; fiche sans erreur ; objet retrouvé à la palpation.
- **Aléas** — 6 personnes tentent de libérer l'interpellé ; la cible retire sa capuche ; téléphone qui filme à 3 m. **Échec** — mauvaise personne ; coup après le menottage. **Unique** — l'interpellation est une procédure en cinq temps ; l'erreur d'identité coûte plus cher que l'abandon.
#### M08 — « Relève en retard » · maintien d'un barrage, endurance · ★★★
- **Cadre** : Place de la Bastille, débouché de la Rue de la Roquette ; samedi 15 h → 21 h (temps compressé) ; `nuageux` puis `pluie` ; 1 section (18) ; 800 simulés par vagues ; tension oscillant de 0,2 à 0,6 / volatilité 0,4.
- **Phases** : ① barrage calme ② première vague de jets ③ accalmie : boire, tourner aux boucliers ④ relève annoncée puis retardée de 6 min ⑤ seconde vague avec un effectif fatigué.
- **Objectifs** : P — tenir jusqu'à la relève ; fatigue personnelle sous 80 %. S — signaler un bouclier fissuré ; aucun agent blessé à la tête.
- **Aléas** — bouclier qui se fend ; collègue pris d'un malaise ; rumeur d'un blessé grave. **Échec** — ligne rompue ; 6 agents sur 18 hors de combat. **Unique** — fatigue, eau, moral : le danger vient de l'usure.
#### M09 — « Couloir de vie » · incendie avec foule · ★★
- **Cadre** : Rue de Rivoli, face à la Place de l'Hôtel de Ville ; mercredi 12 h 30 ; `clair`, vent 20 km/h ; 1 section (18) ; 600 badauds et 150 participants d'un rassemblement des « Blouses Claires » ; tension 0,1 / volatilité 0,2.
- **Phases** : ① feu d'immeuble : périmètre de 50 m (BOUCLER) ② couloir de 3,5 m pour les engins ③ évacuation d'un café et d'un hall ④ canaliser les évacués vers la place.
- **Objectifs** : P — couloir libre en moins de 90 s ; aucun civil dans le périmètre à l'arrivée de la grande échelle. S — enfant séparé retrouvé ; aucune bousculade.
- **Aléas** — badauds qui filment et avancent ; manifestants qui proposent leur aide (à accepter) ; fumée rabattue. **Échec** — engin de secours bloqué plus de 60 s ; civil blessé dans le périmètre. **Unique** — foule non hostile : seulement la voix, le geste et le placement.
#### M10 — « Garde de nuit » · sécurisation de site · ★★
- **Cadre** : Rue du Faubourg Saint-Honoré, entre la Place Beauvau et l'Avenue de Marigny ; nuit de mardi, 01 h 30 ; `brouillard` ; 1 groupe (7), barrières, 1 fourgon ; 40 simulés en petits groupes ; tension 0,15 / volatilité 0,3 ; durée `courte`.
- **Phases** : ① prise de consignes : liste de 6 personnes autorisées ② FILTRER : contrôle des badges ③ 15 personnes approchent avec une banderole ④ sac abandonné : périmètre de 30 m.
- **Objectifs** : P — aucune personne non autorisée au-delà du filtrage ; les 6 autorisés passent en moins de 30 s chacun. S — compte rendu radio complet ; courtoisie.
- **Aléas** — livreur perdu ; journaliste qui teste le dispositif ; coupure d'éclairage de 40 s. **Échec** — intrusion ; refus d'un autorisé. **Unique** — vigilance en temps calme : l'ennui est l'adversaire.

### 4.2 Chef de groupe — brigadier-chef, 7 agents (`chef_groupe`)

#### M11 — « Sept, dont moi » · manifestation déclarée · ★★
- **Cadre** : angle de la Rue du Temple et de la Place de la République ; samedi 14 h 30 ; `nuageux` ; groupe 2A (7) ; 500 simulés, marche calme ; tension 0,1 / volatilité 0,2.
- **Phases** : ① reconnaissance du carrefour ② TENIR puis FILTRER les riverains ③ passage de la queue de cortège ④ réarticulation sur ordre de la section.
- **Objectifs** : P — carrefour tenu ; riverains jamais bloqués plus de 20 s ; compte rendu toutes les 3 min. S — rotation des porte-boucliers ; moral du groupe à 70 % ou plus.
- **Aléas** — riverain en fauteuil roulant ; agent qui répond à une provocation verbale ; livraison urgente d'une pharmacie. **Échec** — 2 agents à plus de 15 m du groupe ; altercation d'un agent. **Unique** — premier commandement : gérer des personnes, leur fatigue et leurs nerfs.
#### M12 — « Bond offensif » · interpellation ciblée · ★★★
- **Cadre** : Boulevard Voltaire, entre la Place de la République et la Rue Oberkampf ; samedi 17 h 10 ; `couvert` ; groupe 1B (7), groupe voisin en appui ; 600 simulés, bloc de 60 ; tension 0,55 / volatilité 0,6.
- **Phases** : ① désignation de la cible par le chef de section ② fenêtre de 20 s quand le bloc recule ③ bond de 20 à 30 m, saisie, couverture ④ retour en ligne, remise à l'officier de police judiciaire.
- **Objectifs** : P — cible ramenée en moins de 40 s ; groupe complet au retour. S — aucun coup de bâton ; annonce radio « interpellation effectuée ».
- **Aléas** — volte-face du bloc ; agent qui trébuche sur une barrière ; mauvaise cible proposée par un agent. **Échec** — agent isolé plus de 20 s ; cible erronée. **Unique** — choisir l'instant : trop tôt on est encerclé, trop tard la cible a disparu.
#### M13 — « La vitrine » · intervention sur pillage · ★★★
- **Cadre** : Rue Berger et Rue Rambuteau ; samedi 22 h 20 ; `clair`, nuit ; groupe (7), 1 fourgon ; 30 pilleurs en 3 groupes, 80 curieux ; tension 0,6 / volatilité 0,7.
- **Phases** : ① arrivée, évaluation de 3 commerces ② DÉGAGER l'entrée du premier, interpeller en flagrant délit ③ employés réfugiés dans la réserve : les sortir ④ tenir les lieux jusqu'à l'arrivée de la section.
- **Objectifs** : P — 3 interpellations en flagrant délit ; employés indemnes. S — marchandise restituée ; groupe jamais scindé en plus de 2 éléments.
- **Aléas** — pilleur mineur ; guetteur à deux-roues ; début de feu dans la boutique. **Échec** — poursuite à plus de 150 m du fourgon ; employé blessé. **Unique** — ne pas courir après tout le monde : choisir trois personnes et protéger.
#### M14 — « La délégation » · escorte · ★★
- **Cadre** : de l'Esplanade des Invalides à l'Hôtel de Matignon, Rue de Varenne (≈ 700 m [E]) ; mardi 11 h 00 ; `nuageux` ; groupe (7) ; 6 délégués du « Front commun des Ateliers », 300 simulés sur l'esplanade, 40 opposants sur le trajet ; tension 0,2 / volatilité 0,3.
- **Phases** : ① prise en compte des 6 délégués ② marche en losange autour d'eux ③ invectives Rue de Grenelle ④ remise à l'entrée, attente, retour.
- **Objectifs** : P — délégués remis dans une fenêtre de 4 min ; aucun contact physique avec les opposants. S — 3 échanges apaisants avec les délégués ; itinéraire de repli annoncé.
- **Aléas** — délégué qui s'arrête parler à la presse ; œuf lancé ; rue barrée par une livraison. **Échec** — délégué bousculé ; retard de plus de 5 min. **Unique** — on protège des manifestants : le dialogue fait partie de la mission.
#### M15 — « Assis par terre » · évacuation · manifestation interdite · ★★★
- **Cadre** : Carrefour de l'Odéon ; mercredi 15 h 00 ; `clair` ; groupe (7) dans une section ; 120 étudiants de la « Coordination Étudiante Rive Gauche » assis, 15 journalistes et observateurs ; tension 0,2 / volatilité 0,3.
- **Phases** : ① sommations par l'autorité civile ② départs volontaires par la Place de l'Odéon ③ portage un par un, 2 à 4 agents par personne, sur 25 m ④ vérification de l'état de chaque personne portée.
- **Objectifs** : P — chaussée libérée ; aucun coup, aucune clé douloureuse. S — moins de 40 s par personne ; aucune plainte filmée.
- **Aléas** — manifestants qui s'accrochent par les bras ; malaise ; slogans à chaque portage. **Échec** — un seul geste violent filmé ; agent énervé non relevé. **Unique** — résistance passive : la technique et la patience remplacent la force.
#### M16 — « Guet-apens » · émeute nocturne · ★★★★
- **Cadre** : Rue Saint-Maur et Rue Oberkampf ; nuit de vendredi, 00 h 40 ; `clair` ; groupe (7) en fourgon ; 60 simulés en 4 groupes, mortiers d'artifice ; tension 0,7 / volatilité 0,8.
- **Phases** : ① appel pour un feu de poubelles ② rue vide, conteneurs en travers ③ tirs de mortiers d'artifice de deux côtés ④ ROMPRE LE CONTACT ou tenir 90 s en attendant la section ⑤ retour avec appui.
- **Objectifs** : P — aucun agent blessé ; fourgon intact ; position annoncée exactement. S — 1 tireur décrit ; feu éteint au second passage.
- **Aléas** — fourgon bloqué par un deux-roues couché ; riverain qui crie des indications ; fausse issue. **Échec** — engagement à pied à plus de 60 m sans appui ; fourgon incendié. **Unique** — savoir reculer : la bonne décision est souvent le repli en ordre.
#### M17 — « Le chantier » · manifestation déclarée, prévention · ★★
- **Cadre** : Boulevard Haussmann, chantier à l'angle de la Rue Tronchet ; jeudi 12 h 45 (cortège à 14 h) ; `clair` ; groupe (7) ; 0 puis 700 simulés ; tension 0,15 / volatilité 0,5.
- **Phases** : ① inventaire en 4 min : 12 objets utilisables (barrières, palettes, gravats) ② neutralisation : plaquer, cadenasser, faire enlever ③ garde au passage du précortège ④ bilan.
- **Objectifs** : P — 10 objets sur 12 neutralisés avant l'arrivée ; rien du chantier sur la chaussée. S — conteneur à verre signalé ; échafaudage interdit d'accès.
- **Aléas** — chef de chantier absent ; benne oubliée ; grimpeur sur l'échafaudage. **Échec** — plus de 5 objets pris par la foule. **Unique** — la prévention change toute la suite : moins de projectiles pour tout le quartier (03 §3.3).
#### M18 — « Soir de derby » · soir de match · ★★★
- **Cadre** : Cour de Rome et Place du Havre, devant la gare Saint-Lazare ; samedi 19 h 30 ; `pluie` ; groupe (7) dans une section ; 200 supporters du « Racing Lutèce », 120 de l'« Olympique des Ponts » ; tension 0,35 / volatilité 0,6.
- **Phases** : ① arrivée échelonnée des deux groupes ② S'INTERPOSER sur 15 m ③ escorte d'un groupe vers le métro par la Rue Saint-Lazare ④ fin après le départ du second.
- **Objectifs** : P — 30 m maintenus entre les groupes ; aucune rixe de plus de 10 s. S — 1 interpellation pour jet de fumigène sur des voyageurs ; flux des voyageurs jamais coupé.
- **Aléas** — voyageurs avec valises au milieu ; chant provocateur ; train du second groupe en retard. **Échec** — mêlée générale ; voyageur blessé. **Unique** — deux foules face à face et un public étranger au conflit, dans un lieu de passage.

### 4.3 Commandant de compagnie (`commandant`)

#### M19 — « Prise de commandement » · manifestation déclarée · ★★
- **Cadre** : Place de la République → Boulevard du Temple → Boulevard Beaumarchais → Place de la Bastille (≈ 1,7 km) ; samedi 14 h 00 ; `clair` ; compagnie (78, 4 sections), commissaire PNJ ; 900 simulés du « Front commun des Ateliers » ; tension 0,1 / volatilité 0,2.
- **Phases** : ① plan : 4 sections en rues parallèles ② départ, jalonnement ③ camion sono en panne : ouvrir un délestage ④ dispersion, stations de métro rouvertes.
- **Objectifs** : P — aucune unité visible du cortège, hors tête, pendant 80 % du temps ; dispersion sans force. S — compte rendu à la salle toutes les 5 min ; aucun agent blessé.
- **Aléas** — section en retard ; organisateur qui demande 15 min de plus ; averse. **Échec** — cortège bloqué plus de 3 min sans délestage ; unité engagée sans ordre. **Unique** — apprendre la carte tactique et les verbes (TENIR, CANALISER, APPUYER) sans la pression des violences.
#### M20 — « Le précortège » · journée nationale tendue · ★★★★
- **Cadre** : de la Place de la République au Boulevard des Italiens par les Grands Boulevards ; jeudi 15 h 00 ; `couvert` ; compagnie (78), unité BRAV-M (36), commissaire PNJ ; 1 200 simulés, précortège 300, bloc de 60 formé après le départ ; tension 0,3 / volatilité 0,7.
- **Phases** : ① signaux du drone : fumigènes noirs, changements de tenue ② décision : isoler le bloc ou suivre ③ dégradations sur 2 banques : interpellations ciblées ④ cortège ralenti : délestage par la Rue Réaumur ⑤ arrivée Place de l'Opéra, dispersion.
- **Objectifs** : P — le cortège organisé arrive entier ; moins de 6 vitrines brisées. S — 4 interpellations fondées ; moins de 20 grenades.
- **Aléas** — autorisation retardée de 45 s par la salle ; service d'ordre qui demande de l'aide ; rumeur filmée. **Échec** — gaz dans le cortège organisé ; section encerclée. **Unique** — la contradiction centrale : interpeller au contact ou tenir à distance (03 §4.1).
#### M21 — « L'Étoile à douze branches » · manifestation interdite · ★★★★★
- **Cadre** : Place Charles de Gaulle ; samedi 10 h 30 ; `brouillard` puis `nuageux` ; compagnie (78), escadron (64), 1 engin lanceur d'eau, commissaire ; 1 200 simulés des « Bonnets Blancs », 10 % de radicaux ; tension 0,45 / volatilité 0,8.
- **Phases** : ① répartir les forces sur 12 débouchés (impossible partout) ② pressions simultanées Avenue Kléber, Avenue de Wagram, Avenue de la Grande Armée ③ barricade Avenue Kléber ④ bascule de l'effort, emploi de l'engin lanceur d'eau ⑤ dégagement de la place.
- **Objectifs** : P — aucun manifestant sur le terre-plein de l'Arc de Triomphe ; aucune unité isolée. S — 2 véhicules en feu au plus ; image publique à 50 ou plus.
- **Aléas** — touristes bloqués sous l'Arc ; engin lanceur d'eau à sec ; brouillard qui masque un axe au drone. **Échec** — monument envahi ; plus de 15 agents hors de combat. **Unique** — trop d'axes pour l'effectif : tout repose sur la réserve et la bascule d'effort.
#### M22 — « Nuit des vitrines » · émeute nocturne et pillages · ★★★★
- **Cadre** : quadrilatère Rue de Rivoli, Boulevard de Sébastopol, Rue Étienne Marcel, Rue du Louvre ; nuit de samedi, 23 h 00 ; `clair` ; compagnie (78) en 4 sections motorisées, unité BRAV-M (36) ; 400 simulés en 12 groupes de 20 à 60 ; tension 0,75 / volatilité 0,8.
- **Phases** : ① 8 appels en 3 min sur la carte ② affectation section par section ③ véhicule en feu Rue Réaumur : escorte des pompiers ④ regroupement autour d'une barricade ⑤ retour au calme, bilan.
- **Objectifs** : P — 8 commerces désignés protégés ; délai moyen d'arrivée sous 120 s. S — 10 interpellations en flagrant délit ; aucun tiers blessé.
- **Aléas** — faux appel ; section prise en guet-apens ; panne radio d'un secteur. **Échec** — 4 commerces pillés ; pompiers attaqués sans protection. **Unique** — aucune foule unique : un jeu de répartition sous information incomplète.
#### M23 — « Trois ponts » · maintien de barrages · manifestation interdite · ★★★★
- **Cadre** : Pont de la Concorde, Pont Alexandre III, Passerelle Léopold-Sédar-Senghor ; mardi 18 h 30 ; `pluie` ; compagnie (78), fourgons ; 900 simulés venant de la rive droite ; tension 0,4 / volatilité 0,6.
- **Phases** : ① INTERDIRE 3 franchissements avec 3 sections, la 4e en réserve ② la foule teste chaque pont ③ contournement par le Pont des Invalides et le Quai d'Orsay ④ refoulement après sommations.
- **Objectifs** : P — aucun groupe de plus de 10 personnes devant le Palais Bourbon ; réserve jamais engagée plus de 4 min. S — aucun blessé par compression ; passage des secours maintenu.
- **Aléas** — cycliste coincé ; clients d'une péniche-restaurant à évacuer ; ordre de dégarnir un pont. **Échec** — franchissement massif ; foule comprimée contre un parapet. **Unique** — les ponts sont des goulets : utiles au barrage, dangereux pour la foule.
#### M24 — « Sortie contrôlée » · encerclement · ★★★★
- **Cadre** : Place de la Bastille, côté Boulevard Richard-Lenoir ; samedi 18 h 00 ; `nuageux` ; compagnie (78), commissaire ; groupe violent de 80 mêlé à 250 pacifiques ; tension 0,6 / volatilité 0,6.
- **Phases** : ① violences graves constatées : l'encerclement devient légal ② BOUCLER en ménageant 1 sortie de 2 m tenue par 4 agents ③ annonce au haut-parleur toutes les 120 s ④ filtrage : les pacifiques sortent, 8 auteurs identifiés sont interpellés ⑤ levée.
- **Objectifs** : P — sortie ouverte en moins de 60 s ; levée moins de 300 s après la fin des violences. S — 8 interpellations ; aucun pacifique retenu plus de 4 min.
- **Aléas** — malaise à l'intérieur ; journaliste qui demande à sortir ; poussée extérieure. **Échec** — encerclement sans sortie ; durée excessive. **Unique** — la « nasse » légale (01 §2.6) : une manœuvre conditionnelle, jugée sur sa sortie et sa durée.
#### M25 — « Cortège officiel » · visite officielle, escorte · ★★★
- **Cadre** : Esplanade des Invalides → Pont Alexandre III → Avenue Winston Churchill → Avenue des Champs-Élysées → Avenue de Marigny (≈ 1,6 km [E]) ; lundi 10 h 15 ; `clair` ; compagnie (78) en jalonnement ; visite du président de la « République de Valdoria » ; 250 simulés du « Comité Valdoria Libre » autorisés Place Clemenceau, 300 curieux ; tension 0,2 / volatilité 0,4.
- **Phases** : ① jalonnement : 1 agent tous les 25 m aux points sensibles ② passage du convoi à 30 km/h ③ banderole déployée d'un balcon ; 3 personnes franchissent une barrière ④ levée du dispositif.
- **Objectifs** : P — convoi jamais arrêté plus de 20 s ; rassemblement autorisé maintenu à 60 m sans force. S — circulation rouverte en moins de 10 min ; aucune interpellation infondée.
- **Aléas** — changement d'itinéraire ; colis oublié ; car de tourisme bloqué. **Échec** — intrusion devant le convoi ; rassemblement autorisé dispersé sans motif. **Unique** — chronométrage au mètre et à la seconde, tout en garantissant le droit de manifester.
#### M26 — « Une heure du matin » · événement festif · ★★★
- **Cadre** : Quai de Valmy, Quai de Jemmapes, puis Place de la République ; nuit du 21 juin, 01 h 00 ; `clair` ; demi-compagnie (36), secouristes PNJ ; 1 000 simulés festifs ; tension 0,1 / volatilité 0,3.
- **Phases** : ① densité qui monte sur une passerelle (seuil de 4 personnes/m²) ② fermer une entrée, ouvrir deux sorties ③ rixe, personne tombée dans le canal ④ fin des concerts, écoulement vers le métro.
- **Objectifs** : P — densité jamais supérieure à 5 personnes/m² plus de 30 s ; secours à la personne tombée en moins de 90 s. S — aucun emploi de la force ; 3 malaises pris en charge.
- **Aléas** — panne de sonorisation qui déplace la foule ; vendeur ambulant qui obstrue une sortie ; pétard pris pour un coup de feu. **Échec** — compression avec blessés ; noyade. **Unique** — l'ennemi est la densité : on gère des flux, pas des adversaires.
#### M27 — « La Seine monte » · crue avec foule · ★★★
- **Cadre** : Pont de l'Alma, Port de la Bourdonnais, Quai Branly ; jeudi 16 h 00 ; `averse` ; Seine à 5,9 m (repères réels : 6,10 m en juin 2016, 8,62 m en 1910 [S][52]) ; compagnie (78) ; 500 badauds venus voir le Zouave, 200 simulés des « Bateliers de Seine » ; tension 0,15 / volatilité 0,3.
- **Phases** : ① BOUCLER 7 rampes d'accès aux berges ② rassemblement des bateliers : dialogue, emplacement sûr ③ évacuation de 2 péniches avec les pompiers ④ montée de 10 cm : recul du périmètre.
- **Objectifs** : P — personne sur les berges inondées ; rassemblement maintenu sans force. S — couloir des pompiers permanent ; information au mégaphone toutes les 3 min.
- **Aléas** — photographe descendu sur le quai ; batelier qui refuse de quitter son bateau ; chaussée glissante. **Échec** — personne emportée ; force contre le rassemblement pacifique. **Unique** — deux missions superposées, secours et droit de manifester, avec le même effectif.
#### M28 — « Double front » · contre-manifestation · ★★★★
- **Cadre** : Place de l'Opéra, Rue Auber, Rue Halévy, Rue Scribe, Boulevard des Capucines ; samedi 15 h 30 ; `nuageux` ; compagnie (78), escadron (64) ; 600 simulés du « Oui au Grand Axe », 600 du « Non au Grand Axe » ; tension 0,35 / volatilité 0,6.
- **Phases** : ① S'INTERPOSER : zone tampon de 150 m ② chaque camp envoie 30 personnes par les rues latérales ③ jets croisés par-dessus la ligne ④ dispersions décalées de 20 min.
- **Objectifs** : P — aucun contact entre les deux cortèges ; traitement symétrique (écart d'emploi de la force sous 20 %). S — interpellations dans les deux camps ; aucune vitrine brisée.
- **Aléas** — accusation de partialité filmée ; spectateurs sortant de l'Opéra ; un camp refuse la dispersion décalée. **Échec** — affrontement direct de plus de 30 s ; partialité manifeste. **Unique** — la neutralité devient une statistique mesurée et affichée au compte rendu.

### 4.4 Autorité civile — commissaire (`commissaire`)

#### M29 — « L'écharpe » · sommations · ★★
- **Cadre** : Place de la République ; samedi 19 h 00 ; `nuageux` ; vous, écharpe tricolore et mégaphone, auprès d'une compagnie (78) ; 400 simulés restés après l'ordre de dispersion, 30 radicaux ; tension 0,45 / volatilité 0,5.
- **Phases** : ① constater l'attroupement (2 critères) ② vérifier 3 issues libres ③ annonce puis 2 sommations aux textes exacts (01 §1.2) ④ autoriser la force, la faire cesser dès la dispersion.
- **Objectifs** : P — séquence complète et dans l'ordre ; force arrêtée moins de 20 s après le reflux. S — sommations audibles pour 80 % de la foule ; ordres tracés.
- **Aléas** — mégaphone couvert par une sono : fusée rouge ; familles qui n'ont pas entendu ; journaliste qui vous filme. **Échec** — force avant les sommations ; issue fermée pendant les sommations. **Unique** — le joueur prononce le droit : chaque phrase compte.
#### M30 — « Dialogue d'abord » · manifestation déclarée, liaison · ★★
- **Cadre** : de la Place de la Bastille à la Place de l'Hôtel de Ville par la Rue Saint-Antoine ; samedi 13 h 00 ; `clair` ; vous et une équipe de liaison (2) ; 800 simulés de la « Marche pour les Arbres de Paris » ; tension 0,1 / volatilité 0,3.
- **Phases** : ① rencontre des organisateurs : travaux Rue de Rivoli, proposer un itinéraire ② accord sur le lieu et l'heure de dispersion ③ le service d'ordre signale 20 perturbateurs ④ annonce conjointe de la dispersion.
- **Objectifs** : P — accord trouvé (3 échanges réussis sur 4) ; zéro emploi de la force. S — perturbateurs écartés par le service d'ordre ; retard sous 10 min.
- **Aléas** — organisateur méfiant ; élu local qui s'invite ; rumeur d'interdiction. **Échec** — rupture du dialogue ; cortège engagé dans la rue en travaux. **Unique** — la meilleure note de la banque s'obtient ici sans un seul ordre coercitif.
#### M31 — « Autoriser ou attendre » · manifestation déclarée qui dégénère · ★★★★
- **Cadre** : Place Saint-Michel et Boulevard Saint-Michel ; jeudi 17 h 45 ; `couvert`, vent variable ; vous, auprès d'un escadron (64) ; 700 simulés, bloc de 70, 2 terrasses occupées, 1 poste de soins improvisé ; tension 0,55 / volatilité 0,7.
- **Phases** : ① le commandant demande les lanceurs ; la salle dit d'attendre ② vous ne voyez que 60 m autour de vous et un écran de drone ③ gendarme blessé : nouvelle demande ④ décision tracée, puis fin de l'emploi.
- **Objectifs** : P — chaque autorisation nécessaire et proportionnée au moment où elle est donnée ; aucune grenade sur une terrasse ou un poste de soins. S — décision en moins de 30 s ; 3 gendarmes blessés au plus.
- **Aléas** — image du drone figée 20 s ; commandant qui insiste ; vent qui tourne après l'ordre. **Échec** — autorisation manifestement disproportionnée ; refus prolongé causant 8 blessés. **Unique** — décider avec une information partielle, sous deux pressions contraires.
#### M32 — « Zone interdite » · manifestation interdite · ★★★
- **Cadre** : Place du Trocadéro et parvis du Palais de Chaillot ; dimanche 15 h 00 ; `clair` ; vous et une demi-compagnie (36) ; 300 simulés du « Collectif Lumière Pour Tous », familles 15 %, aucun radical au départ ; tension 0,15 / volatilité 0,4.
- **Phases** : ① notifier l'interdiction au mégaphone, indiquer le lieu autorisé (Place de Varsovie) ② verbalisations ciblées ou accompagnement ③ arrivée de 40 opportunistes ④ sommations seulement en cas de trouble ; sinon reconduite.
- **Objectifs** : P — parvis libéré ; aucune force contre un groupe pacifique. S — 70 % de départs volontaires ; touristes jamais inquiétés.
- **Aléas** — manifestants qui s'assoient ; guide touristique mécontent ; caméra d'une chaîne étrangère. **Échec** — force employée sans trouble caractérisé ; panique de touristes. **Unique** — interdit ne veut pas dire violent : la réponse reste graduée.
#### M33 — « Minuit sur le parvis » · rassemblement spontané du soir · ★★★★
- **Cadre** : Place de l'Hôtel de Ville, Quai de l'Hôtel de Ville ; lundi 23 h 30 ; `clair` ; vous, compagnie (78), sapeurs-pompiers ; 800 simulés, composition « rassemblement spontané du soir » (03 §2.3) ; tension 0,5 / volatilité 0,8 ; durée `longue`.
- **Phases** : ① slogans, feux de poubelles ② bruit qui couvre le mégaphone : fusée rouge ③ sommations, refoulement vers le Quai de Gesvres ④ cortèges sauvages vers la Rue de Rivoli ⑤ fin quand il reste moins de 5 % de la foule.
- **Objectifs** : P — sommations régulières malgré le bruit ; pompiers protégés à chaque feu. S — aucun gaz vers les bouches de métro ; 5 interpellations ou plus.
- **Aléas** — rame de métro qui déverse 200 personnes ; feu contre une palissade ; groupe pacifique qui chante assis. **Échec** — force sur le groupe assis ; feu non traité 3 min. **Unique** — mission à fin ouverte : elle dure tant que des groupes restent.
#### M34 — « Le périmètre » · sécurisation de site, visite officielle · ★★★
- **Cadre** : Grand Palais, Avenue Winston Churchill, Cours la Reine ; mercredi 07 h 30 ; `brouillard` ; vous concevez puis tenez le dispositif du « Sommet des Capitales » ; 2 compagnies (156), 60 barrières, 4 points de filtrage ; 400 simulés autorisés Cours la Reine ; tension 0,2 / volatilité 0,4.
- **Phases** : ① plan : poser barrages et filtrages sur la carte ② arrivée de 12 véhicules de délégations ③ 5 manifestants demandent à remettre une pétition ④ tentative d'intrusion par le Pont Alexandre III.
- **Objectifs** : P — aucune intrusion ; délégations à l'heure. S — pétition remise ; riverains filtrés en moins de 60 s.
- **Aléas** — badge illisible ; livraison non annoncée ; brume qui masque le pont. **Échec** — véhicule officiel bloqué 2 min ; rassemblement autorisé enfermé. **Unique** — phase de conception libre : le joueur dessine son dispositif, puis vit avec.
#### M35 — « Dans mon secteur » · faute d'un agent · ★★★
- **Cadre** : Rue Royale, vers la Place de la Madeleine ; samedi 18 h 20 ; `pluie` ; vous et une section (18) ; 300 simulés en reflux ; tension 0,5 / volatilité 0,5.
- **Phases** : ① pendant le refoulement, un agent PNJ frappe une personne à terre, sous une caméra ② faire cesser, relever l'agent ③ secours au blessé, appel des pompiers ④ identification, conservation des images ⑤ compte rendu : véridique ou édulcoré.
- **Objectifs** : P — blessé pris en charge en moins de 60 s ; compte rendu conforme aux images. S — témoin entendu ; section recadrée sans rupture du dispositif.
- **Aléas** — collègues qui minimisent ; journaliste qui demande une réaction ; retour de la foule. **Échec** — compte rendu contredit par la vidéo ; blessé laissé sans soins. **Unique** — l'intégrité est la mécanique : le mensonge se paie à l'enquête suivante.

### 4.5 BRAV-M — binôme à moto (`bravm`)

#### M36 — « En selle » · formation à la moto · ★
- **Cadre** : Boulevard Richard-Lenoir, de la Place de la République à la Place de la Bastille ; samedi 13 h 30 ; `clair` ; 6 motos (12 agents), vous passager puis pilote ; circulation civile ; tension 0 ; durée `courte`.
- **Phases** : ① colonne par deux à 40 km/h, 8 m entre les motos ② arrêt, débarquement des passagers en 5 s ③ garde des machines par 2 pilotes ④ rembarquement, repli.
- **Objectifs** : P — débarquement complet en moins de 6 s ; aucune chute, aucun accrochage. S — colonne jamais étirée au-delà de 60 m ; signaux de bras corrects.
- **Aléas** — portière qui s'ouvre ; piéton distrait ; pavés mouillés. **Échec** — collision avec un tiers ; moto laissée sans garde. **Unique** — la moto est un outil de placement : on n'intervient jamais en roulant.
#### M37 — « Cortège sauvage » · après-manifestation · ★★★
- **Cadre** : de la Place de la Bastille par la Rue de la Roquette et la Rue du Faubourg Saint-Antoine ; samedi 19 h 40 ; `nuageux`, crépuscule ; unité (36) ; 150 simulés mobiles qui renversent et incendient des poubelles ; tension 0,6 / volatilité 0,7.
- **Phases** : ① le drone donne la direction ② prendre de l'avance par le Boulevard Richard-Lenoir ③ débarquer 80 m devant le groupe, barrer ④ interpeller 3 incendiaires ⑤ éteindre, rendre compte.
- **Objectifs** : P — groupe arrêté avant le 5e feu ; 3 interpellations en flagrant délit. S — aucun contact entre motos et piétons ; feux éteints en moins de 2 min.
- **Aléas** — le groupe se scinde ; cycliste à contresens ; terrasse pleine sur l'itinéraire. **Échec** — poursuite à moto dans la foule ; motos perdues. **Unique** — course de vitesse sur le plan réel de Paris : on gagne par l'itinéraire.
#### M38 — « Flagrant délit » · interpellation ciblée · ★★★★
- **Cadre** : Rue des Francs-Bourgeois, Rue Vieille du Temple, Rue des Rosiers, Rue de Turenne ; samedi 17 h 50 ; `clair` ; 3 motos (6) ; cible marquée par le drone après un jet sur une ligne de CRS ; 300 passants ; tension 0,3 / volatilité 0,4.
- **Phases** : ① description : veste, sac, chaussures ② la cible change de veste et de couvre-chef sous un porche ③ suivi à pied parmi les passants ④ saisie sans heurt, remise à l'officier de police judiciaire.
- **Objectifs** : P — bonne personne (au moins 2 indices persistants concordants) ; aucune chute de tiers. S — objet retrouvé ; moins de 4 min.
- **Aléas** — sosie vestimentaire ; liaison drone perdue 15 s ; passants qui s'interposent. **Échec** — erreur de personne ; poursuite motorisée en rue piétonne. **Unique** — reconnaître quelqu'un qui a changé d'apparence : les chaussures et le sac restent.
#### M39 — « Quatre-vingt-dix secondes » · intervention sur pillage · ★★★
- **Cadre** : de la Place du Châtelet à la Rue Berger (≈ 450 m [E]) ; nuit de samedi, 23 h 20 ; `clair` ; 6 motos (12) ; 3 commerces attaqués par 40 pilleurs ; tension 0,7 / volatilité 0,7.
- **Phases** : ① trajet en moins de 90 s ② choix de la boutique (employés à l'intérieur : priorité) ③ débarquement, saisie de 2 à 4 auteurs ④ tenue des lieux 3 min jusqu'aux fourgons.
- **Objectifs** : P — arrivée en moins de 90 s ; employés indemnes. S — 4 interpellations ; motos intactes.
- **Aléas** — rue barrée par des trottinettes ; projectile depuis un étage ; faux blessé qui détourne l'attention. **Échec** — arrivée après 150 s ; pilote isolé agressé. **Unique** — arbitrage immédiat entre trois urgences : on ne peut pas tout sauver.
#### M40 — « Escorte incendie » · protection des secours · ★★★
- **Cadre** : Boulevard de Sébastopol puis Rue Réaumur ; nuit de vendredi, 00 h 10 ; `clair` ; 6 motos (12), 1 engin de sapeurs-pompiers ; véhicule en feu près d'une façade, 80 simulés hostiles ; tension 0,7 / volatilité 0,7.
- **Phases** : ① ouvrir la route à l'engin (2 motos devant, 4 derrière) ② périmètre de 25 m autour des pompiers ③ mortiers d'artifice : boucliers levés, repérage des tireurs ④ extinction en 4 min, repli groupé.
- **Objectifs** : P — aucun pompier touché ; engin jamais immobilisé plus de 20 s. S — 1 tireur interpellé ; façade préservée.
- **Aléas** — tuyau piétiné ; riverain qui descend déplacer sa voiture ; second départ de feu à 100 m. **Échec** — pompiers contraints au repli ; engin endommagé. **Unique** — on ne poursuit personne : la mission est une bulle de protection mobile.
#### M41 — « Nuit d'été » · émeute nocturne multipoints · ★★★★
- **Cadre** : Rue Oberkampf, Avenue de la République, Quai de Jemmapes, Rue du Faubourg du Temple ; nuit de samedi, 23 h 30 → 02 h 00 ; `clair` puis `orage` ; unité (36) ; 10 incidents successifs, 200 simulés en petits groupes ; tension 0,65 / volatilité 0,8 ; durée `longue`.
- **Phases** : ① file d'appels classés de 1 à 3 en gravité ② 3 interventions à choisir sur 5 ③ guet-apens possible sur un appel anodin ④ orage : dispersion des groupes, dernières interpellations.
- **Objectifs** : P — les 3 incidents de gravité 3 traités ; aucun agent isolé. S — carburant et fatigue gérés (1 retour à la base) ; 6 interpellations fondées ou plus.
- **Aléas** — appel en doublon ; moto en panne ; chaussée détrempée (freinage doublé). **Échec** — incident grave ignoré plus de 4 min ; 2 motos perdues. **Unique** — une nuit entière : priorités, usure, météo qui change la partie.
#### M42 — « Sous l'objectif » · manifestation déclarée, image publique · ★★★★
- **Cadre** : Boulevard Saint-Germain, Rue du Bac ; mardi 16 h 00 ; `clair` ; 6 motos (12) ; 500 simulés de la « Coordination Étudiante Rive Gauche », 25 journalistes et vidéastes ; image de l'unité à 30 sur 100 au départ ; tension 0,35 / volatilité 0,5.
- **Phases** : ① arrivée sous les huées : visage et numéro visibles ② 2 interventions commandées (tag sur une banque, jet isolé) ③ provocation verbale filmée à 1 m ④ repli propre.
- **Objectifs** : P — 2 interpellations irréprochables ; aucune réaction à la provocation. S — image de l'unité à 45 ou plus ; caméra-piéton allumée aux bons moments.
- **Aléas** — objectif collé à 50 cm ; étudiant qui tombe seul près d'une moto ; rumeur d'un blessé imputé à l'unité. **Échec** — geste d'humeur filmé ; caméra-piéton éteinte pendant une saisie. **Unique** — tout est filmé et pèse double : la retenue est la compétence testée.

### 4.6 Équipage du Centaure — gendarme mobile (`gendarme_centaure`)

#### M43 — « Quatorze tonnes et demie » · formation à la conduite · ★
- **Cadre** : Esplanade des Invalides puis Pont Alexandre III ; dimanche 08 h 00 ; `clair` ; équipage de 3 (pilote, chef d'engin, opérateur), 7 gendarmes embarqués ; rues vides ; tension 0 ; durée `courte`.
- **Phases** : ① gabarit de 7,5 × 2,94 × 3,82 m (02 §4.3) : passage entre deux files de véhicules ② demi-tour aux caméras périphériques ③ débarquement des 7 passagers à l'abri de la caisse ④ lame : pousser un conteneur vide sur 3 m.
- **Objectifs** : P — aucun mobilier urbain écrasé ; débarquement en moins de 10 s. S — parcours en moins de 4 min ; créneau en marche arrière.
- **Aléas** — cycliste dans l'angle mort ; branche basse ; trottoir affaissé. **Échec** — collision avec un tiers ; engagement sur une passerelle interdite au tonnage. **Unique** — masse et angles morts : conduire devient un exercice de prudence.
#### M44 — « La barricade de la rue Royale » · dégagement d'obstacle · ★★★
- **Cadre** : Rue Royale, de la Place de la Concorde vers la Place de la Madeleine ; samedi 17 h 00 ; `couvert` ; 1 Centaure, peloton (16), autorité civile ; barricade de barrières, de bacs et d'un véhicule léger, 200 simulés derrière ; tension 0,65 / volatilité 0,7.
- **Phases** : ① engagement autorisé (décision gouvernementale relayée par l'autorité civile, 02 §4.3) ② contrôle thermique : personne derrière ni dedans ③ annonce au haut-parleur, avance à 5 km/h, poussée ④ le peloton occupe la brèche.
- **Objectifs** : P — obstacle dégagé sans contact avec une personne ; vitesse de 6 km/h au plus. S — 1 seul passage ; véhicule civil déplacé sans être écrasé.
- **Aléas** — personne cachée derrière un bac ; feu sur la barricade (attendre l'extinction) ; journaliste à 4 m de la lame. **Échec** — contact avec une personne ; avance sans autorisation. **Unique** — la puissance oblige à ralentir : la procédure de sûreté est le cœur de la mission.
#### M45 — « Salve mesurée » · manifestation interdite, lanceurs embarqués · ★★★★
- **Cadre** : Place de la Concorde ; samedi 18 h 30 ; `nuageux`, vent de nord-est ; 1 Centaure, escadron (64), autorité civile ; 900 simulés, 80 radicaux, feux ; tension 0,7 / volatilité 0,7.
- **Phases** : ① sommations réitérées : armes autorisées ② choix de 1 à 30 tirs, zone d'impact désignée, lecture du vent ③ évaluation de l'effet, seconde salve ou non ④ cessez-le-feu.
- **Objectifs** : P — zone dégagée avec 12 grenades au plus pour la médaille ; aucun impact sur un groupe pacifique, une issue ou un poste de soins. S — compte rendu exact du nombre tiré ; gaz jamais rabattu sur l'escadron.
- **Aléas** — vent qui tourne de 40° ; touristes derrière la cible ; demande pressante d'une salve complète. **Échec** — salve de 30 sans nécessité ; tir avant autorisation. **Unique** — gradation chiffrée de 1 à 30 : la retenue est notée à la grenade près.
#### M46 — « Bouclier roulant » · escorte d'une unité à pied · ★★★
- **Cadre** : Avenue Kléber, de la Place du Trocadéro vers la Place Charles de Gaulle ; samedi 16 h 15 ; `pluie` ; 1 Centaure, peloton (16) à pied derrière la caisse ; 400 simulés, mortiers d'artifice, 2 barricades légères ; tension 0,7 / volatilité 0,7.
- **Phases** : ① progression à 4 km/h, peloton abrité ② barricade légère poussée ③ gendarme blessé : arrêt, embarquement à l'abri ④ jonction avec une compagnie de CRS à l'Étoile.
- **Objectifs** : P — peloton jamais à plus de 10 m de la caisse ; blessé embarqué en moins de 40 s. S — aucune marche arrière avec des piétons derrière ; jonction dans le délai.
- **Aléas** — véhicule en feu sur la chaussée ; fumée qui aveugle les caméras ; civil réfugié sous un porche. **Échec** — peloton distancé ; contact avec une personne. **Unique** — on conduit pour protéger ceux qui marchent : le rythme est celui du piéton.
#### M47 — « Vision de nuit » · émeute nocturne, renseignement · ★★★
- **Cadre** : Place de la Bastille, débouchés de la Rue de la Roquette et du Boulevard Beaumarchais ; nuit de samedi, 00 h 30 ; `clair` ; 1 Centaure à l'arrêt, 2 pelotons (32) ; 150 simulés, tireurs de mortiers d'artifice sur un échafaudage ; tension 0,7 / volatilité 0,7.
- **Phases** : ① veille aux capteurs : caméra thermique, vision à 360° ② localiser 3 postes de tir (étage, toit, porche) ③ guider par radio un groupe d'interpellation (cap, distance) ④ projecteur : éclairer sans éblouir les collègues.
- **Objectifs** : P — 3 postes localisés à moins de 5 m près ; aucun tir de l'engin. S — 2 interpellations sur guidage ; aucun riverain éclairé à sa fenêtre plus de 5 s.
- **Aléas** — reflet d'une vitrine pris pour une source chaude ; riverain sur son balcon ; panne d'une caméra. **Échec** — riverain désigné comme tireur ; guidage dans une impasse. **Unique** — l'engin comme poste d'observation : on gagne sans bouger ni tirer.
#### M48 — « Bouchon de paille » · évacuation de la voie publique · ★★
- **Cadre** : Pont de la Concorde et Quai d'Orsay ; lundi 06 h 30 ; `brouillard` ; 1 Centaure, escadron (64), autorité civile ; 30 tracteurs et 12 remorques du « Convoi des Champs », 200 simulés calmes ; tension 0,2 / volatilité 0,3.
- **Phases** : ① dialogue : délai de 20 min négocié ② départ volontaire d'une partie ③ dégagement de 3 remorques abandonnées et de balles de paille (lame, traction) ④ réouverture d'une voie pour les secours.
- **Objectifs** : P — une voie de 3,5 m ouverte ; aucun engin agricole endommagé. S — zéro emploi de la force ; délai tenu.
- **Aléas** — tracteur en panne ; paille qui prend feu ; agriculteur qui remonte dans sa cabine. **Échec** — matériel détruit ; personne sur une remorque pendant la traction. **Unique** — l'engin sert de dépanneuse ; l'issue idéale est négociée.

### 4.7 Opérateur du canon à eau (`operateur_canon_eau`)

#### M49 — « Dix mille litres » · formation · ★
- **Cadre** : Place de la République, exercice ; mardi 09 h 00 ; `clair` ; équipage de 3, vous à la tourelle ; 6 plots et 2 feux de palettes ; tension 0 ; durée `courte`.
- **Phases** : ① jet diffusé (15 à 20 m) puis jet droit (30 à 40 m) ② rafales de 3 à 10 s ③ lecture de la jauge : 10 000 l, 15 l/s, soit 11 min de jet continu (02 §4.2) ④ mousse sur un feu.
- **Objectifs** : P — 6 plots touchés avec moins de 600 l ; 2 feux éteints. S — aucune rafale de plus de 10 s ; tir au sol devant la cible.
- **Aléas** — pression qui chute ; passant qui traverse le pas de tir ; vent latéral. **Échec** — jet droit vers le passant ; cuve vide avant la fin. **Unique** — l'eau est une munition : on la compte.
#### M50 — « Barricade en feu » · protection des secours · ★★
- **Cadre** : Boulevard Beaumarchais ; samedi 18 h 50 ; `nuageux` ; 1 engin, section (18) ; barricade enflammée de 8 m, 200 simulés à 40 m ; tension 0,6 / volatilité 0,6.
- **Phases** : ① approche à 25 m sous protection ② mousse sur le foyer (40 s) ③ jet diffusé au sol pour tenir la foule à distance ④ la section dégage les restes.
- **Objectifs** : P — feu éteint en moins de 90 s ; personne touché par le jet droit. S — moins de 1 500 l ; pare-brise intact.
- **Aléas** — bouteille de gaz signalée (reculer à 50 m) ; projectiles sur la tourelle ; riverain à sa fenêtre au-dessus du feu. **Échec** — feu gagnant un immeuble ; jet droit à moins de 20 m sur une personne. **Unique** — éteindre d'abord : l'engin est un camion de pompiers sous les jets.
#### M51 — « Le pont d'Iéna » · maintien d'un barrage · manifestation interdite · ★★★★
- **Cadre** : Pont d'Iéna, entre les Jardins du Trocadéro et le Quai Branly ; dimanche 16 h 30 ; `clair` ; 1 engin, section (18), autorité civile ; 700 simulés du « Collectif Lumière Pour Tous », familles 10 %, radicaux 5 % ; tension 0,45 / volatilité 0,6.
- **Phases** : ① présence dissuasive, tourelle au repos ② poussée de 50 radicaux en tête, familles juste derrière ③ sommations ; jet diffusé au sol, puis jet droit sur les seuls lanceurs de projectiles ④ reflux.
- **Objectifs** : P — pont tenu ; aucune famille touchée. S — moins de 2 500 l ; aucun tir au-dessus de la ceinture.
- **Aléas** — poussette abandonnée ; touristes entre les deux ; lanceur de projectiles caché derrière une banderole tenue par des pacifiques. **Échec** — enfant ou personne âgée touché ; jet avant les sommations. **Unique** — discriminer dans une foule mélangée : savoir ne pas tirer.
#### M52 — « Deux degrés » · manifestation interdite par grand froid · ★★★
- **Cadre** : Place de la Concorde ; samedi de janvier, 17 h 30 ; `couvert`, 2 °C ; 1 engin, compagnie (78) ; 600 simulés ; tension 0,5 / volatilité 0,5.
- **Phases** : ① ordre d'appui au refoulement ② choix du mode : diffusé au sol ou droit ③ personnes trempées : frissons, repli ou colère ④ arrivée des secouristes pour les hypothermies.
- **Objectifs** : P — refoulement obtenu avec moins de 5 personnes trempées de la tête aux pieds. S — proposer au commandant une vague de refoulement à la place du jet ; aucun malaise grave.
- **Aléas** — chaussée verglacée par l'eau (chutes dans les deux camps) ; personne âgée mouillée ; images en direct. **Échec** — 3 hypothermies ; agents qui glissent en chargeant. **Unique** — la météo transforme l'arme : effets retardés, image désastreuse.
#### M53 — « À sec » · journée longue · ★★★
- **Cadre** : Avenue des Champs-Élysées, hauteur de l'Avenue George V ; samedi 13 h → 19 h (compressé) ; `nuageux` ; 2 engins (le vôtre et un PNJ), compagnie (78) ; 1 000 simulés par vagues ; tension 0,5 / volatilité 0,7 ; durée `longue`.
- **Phases** : ① première vague : 3 000 l consommés ② jauge à 25 % : demander la relève de l'autre engin ③ repli escorté vers une bouche d'incendie Avenue Marceau, remplissage en 6 min ④ retour pendant la vague la plus forte.
- **Objectifs** : P — jamais les 2 engins absents ensemble ; cuve jamais vide au contact. S — moins de 14 000 l au total ; remplissage sans incident.
- **Aléas** — bouche d'incendie hors service (une autre à 300 m) ; escorte retardée ; panne de l'autre engin. **Échec** — ligne percée faute d'appui ; engin isolé sans escorte. **Unique** — logistique en temps réel : la ressource impose son tempo à toute la compagnie.
#### M54 — « Brassards blancs » · identification sous pression · ★★★★
- **Cadre** : Place de la Bastille, côté Rue Saint-Antoine ; jeudi 18 h 10 ; `pluie`, nuit tombante ; 1 engin, section (18) ; 400 simulés, 60 lanceurs de projectiles, 12 journalistes (casques « PRESSE »), 8 secouristes de rue (croix), 3 observateurs (chasubles) ; tension 0,65 / volatilité 0,6.
- **Phases** : ① ordre : repousser le groupe hostile de 40 m ② des tiers protégés dans l'axe ③ fenêtres de tir de 2 à 4 s ④ cessation.
- **Objectifs** : P — aucun tiers protégé touché ; groupe repoussé. S — position des tiers annoncée par radio ; moins de 2 000 l.
- **Aléas** — secouriste penché sur un blessé dans l'axe ; faux brassard porté par un lanceur de projectiles ; buée sur la vitre de tourelle. **Échec** — journaliste, secouriste ou observateur touché ; blessé au sol atteint. **Unique** — lire les signes distinctifs à 30 m, de nuit, sous la pluie.

### 4.8 Télépilote de drone (`telepilote`)

#### M55 — « Arrêté préfectoral » · formation, manifestation déclarée · ★
- **Cadre** : toit proche de la Place de la République, cortège vers la Place de la Bastille ; samedi 14 h 00 ; `clair` ; vous et un opérateur image PNJ ; arrêté fictif : périmètre République–Bastille, de 13 h à 20 h ; 800 simulés ; tension 0,1 / volatilité 0,2 ; durée `courte`.
- **Phases** : ① lire l'arrêté (périmètre en surbrillance, horaires) ② décollage, altitude de 80 m ③ suivre la tête ; comptage sur une ligne ④ retour à 20 % de batterie, relève.
- **Objectifs** : P — aucun vol hors périmètre ou hors horaire ; comptage à ± 15 %. S — image stable 90 % du temps ; atterrissage à moins de 1 m du point.
- **Aléas** — rafale de vent ; oiseau ; perte de signal derrière un immeuble. **Échec** — sortie de périmètre de plus de 10 s ; batterie vide en vol. **Unique** — le cadre légal est une donnée de vol, dessinée dans le viseur.
#### M56 — « Les signes » · manifestation déclarée tendue · ★★★
- **Cadre** : Boulevard Saint-Martin et Boulevard de Bonne Nouvelle ; jeudi 15 h 10 ; `nuageux` ; vous et la salle de commandement ; 1 000 simulés, précortège 250 ; tension 0,25 / volatilité 0,7.
- **Phases** : ① repérer 5 signes avant-coureurs (fumigène noir, parapluies ouverts, changement de tenue, banderole renforcée, mobilier déplacé) ② marquer 5 individus au plus, après un fait constaté ③ compte rendu au commandant avant les premiers jets ④ suivi des marqués.
- **Objectifs** : P — 4 signes sur 5 signalés à temps ; aucun marquage sans fait. S — alerte 60 s ou plus avant le premier jet ; 2 marqués suivis jusqu'à l'interpellation.
- **Aléas** — fumigène de couleur festif ; parapluies ouverts parce qu'il pleut ; batterie à changer au pire moment. **Échec** — marquage d'un simple porteur de vêtements noirs ; alerte après les faits. **Unique** — lire une foule d'en haut : le renseignement gagne les minutes dont le sol a besoin.
#### M57 — « Fil d'Ariane » · interpellation ciblée · ★★★★
- **Cadre** : Rue Montorgueil, Rue Étienne Marcel, Rue Réaumur, Rue de Turbigo ; samedi 18 h 00 ; `clair` ; vous et 3 motos BRAV-M PNJ ; individu marqué qui quitte la manifestation ; passants nombreux ; tension 0,3 / volatilité 0,4.
- **Phases** : ① suivi entre 60 et 100 m d'altitude ② la cible passe sous un porche, change de veste ③ guidage radio des motos (« deuxième à droite, 80 mètres ») ④ confirmation visuelle avant la saisie.
- **Objectifs** : P — contact visuel 80 % du temps ou plus ; confirmation correcte. S — aucun survol hors périmètre (limite : Rue Étienne Marcel) ; interpellation en moins de 5 min.
- **Aléas** — passage couvert (vue perdue 10 s) ; deux personnes aux sacs identiques ; la cible sort du périmètre : passer le relais au sol. **Échec** — confirmation erronée ; poursuite hors périmètre. **Unique** — duo ciel-sol : le joueur est la voix dans l'oreillette des motards.
#### M58 — « Douze foyers » · émeute nocturne · ★★★
- **Cadre** : Quai de Valmy, Quai de Jemmapes, Rue du Faubourg du Temple ; nuit de vendredi, 23 h 45 ; `clair` ; vous et la régulation des pompiers ; 12 départs de feu en 20 min, 200 simulés ; tension 0,7 / volatilité 0,7.
- **Phases** : ① vue thermique : détecter les foyers ② classer : poubelle isolée, poubelle contre une façade, véhicule, véhicule sous un arbre ou une façade ③ orienter 3 engins et leurs escortes ④ vérifier l'extinction.
- **Objectifs** : P — tous les feux contre une façade traités en moins de 3 min ; aucun engin envoyé sans escorte dans une rue hostile. S — 2 incendiaires décrits ; itinéraires sans barricade.
- **Aléas** — barbecue de terrasse pris pour un foyer ; reflets du canal ; barricade invisible depuis le sol. **Échec** — immeuble atteint ; pompiers pris en guet-apens. **Unique** — le drone au service des secours : on trie des incendies.
#### M59 — « Densité critique » · événement festif · ★★★
- **Cadre** : Champ-de-Mars et Pont d'Iéna ; 14 juillet, 22 h 30 ; `clair` ; vous et le poste de commandement ; 1 200 simulés (foule narrative de plusieurs centaines de milliers) ; tension 0,05 / volatilité 0,2.
- **Phases** : ① carte de densité : vert sous 2, orange de 2 à 4, rouge au-dessus de 4 personnes/m² ② entrée saturée Avenue de la Bourdonnais ③ recherche d'un enfant perdu ④ fin du feu d'artifice : écoulement vers le pont.
- **Objectifs** : P — toute zone rouge signalée en moins de 20 s ; enfant retrouvé. S — 2 fermetures d'accès proposées à temps ; aucune interruption de couverture.
- **Aléas** — fumée du feu d'artifice ; mouvement de foule après une fausse alerte ; drone civil non autorisé. **Échec** — zone rouge non signalée pendant 60 s ; collision. **Unique** — sécurité d'une foule heureuse : la donnée clé est une densité.
#### M60 — « Hors périmètre » · dilemme légal · ★★★★
- **Cadre** : Pont Neuf, Quai des Orfèvres, Place Dauphine ; samedi 19 h 20 ; `nuageux`, crépuscule ; arrêté fictif limité à la rive droite ; 300 simulés en dispersion ; tension 0,4 / volatilité 0,5.
- **Phases** : ① surveillance normale Quai de la Mégisserie ② à 150 m hors périmètre : personne en difficulté au bord de l'eau ③ choix : rester et relayer au sol et à la brigade fluviale, ou sortir du périmètre ④ conséquences à l'enquête.
- **Objectifs** : P — la personne est secourue. S — aucune image enregistrée hors périmètre ; relais radio précis (rive, repère, distance).
- **Aléas** — la salle demande de « jeter un œil » ; batterie à 25 % ; témoin qui filme le drone hors zone. **Échec** — personne non secourue ; images illégales exploitées. **Unique** — deux issues valides, deux coûts : le jeu note la justification autant que le résultat.

### 4.9 Médecin, secouriste (`street_medic`, `secouriste`)

#### M61 — « Sérum physiologique » · formation, secouriste de rue · ★
- **Cadre** : Place de la République ; samedi 18 h 30 ; `nuageux` ; vous et 2 équipiers PNJ, brassard à croix ; 500 simulés, nuage lacrymogène de 40 m ; tension 0,45 / volatilité 0,4 ; durée `courte`.
- **Phases** : ① mettre masque et lunettes ② rincer les yeux de 10 personnes (8 s chacune) ③ asseoir et rassurer 2 personnes paniquées ④ installer un poste de soins dans le hall d'un café.
- **Objectifs** : P — 10 rinçages ; personne laissée dans le nuage. S — 20 doses de sérum suffisantes ; consentement demandé à chaque fois.
- **Aléas** — vent qui pousse le nuage vers le poste ; personne asthmatique ; cafetier réticent. **Échec** — vous-même incapable d'agir plus de 30 s ; poste installé sous le vent. **Unique** — la scène de M05, vécue de l'autre côté du nuage.
#### M62 — « Tri sous les gaz » · triage · ★★★★
- **Cadre** : Place de la Bastille, côté Boulevard Henri IV ; samedi 17 h 40 ; `couvert` ; vous, médecin, et 3 équipiers ; 12 victimes après une compression contre des barrières ; 600 simulés ; tension 0,6 / volatilité 0,5.
- **Phases** : ① faire sortir ceux qui marchent : verts ② évaluer chaque victime en 15 s (respire-t-elle ? fréquence au-dessus de 30 ? pouls radial ? répond-elle ?) ③ gestes immédiats sur les rouges ④ remise aux sapeurs-pompiers au point de regroupement, à 60 m.
- **Objectifs** : P — 11 tris corrects sur 12 ; tous les rouges traités en moins de 120 s. S — 2 sur-tris au plus ; transmission orale complète.
- **Aléas** — victime qui s'aggrave (jaune vers rouge) ; proche affolé ; retour du gaz. **Échec** — rouge classé vert ; victime oubliée. **Unique** — le triage START comme mécanique centrale, chronométrée (section 3.2).
#### M63 — « Trois mètres cinquante » · protection des secours · ★★★
- **Cadre** : Boulevard Voltaire, près de la Rue Oberkampf ; samedi 17 h 00 ; `nuageux` ; vous, secouriste officiel ; ambulance bloquée à 200 m ; patient rouge (délai de 6 min) ; ligne de CRS d'un côté, 500 simulés de l'autre ; tension 0,55 / volatilité 0,5.
- **Phases** : ① stabiliser le patient ② convaincre le service d'ordre d'ouvrir la foule ③ obtenir du chef de section l'ouverture de la ligne sur 3,5 m ④ brancardage, départ.
- **Objectifs** : P — patient chargé en moins de 6 min. S — deux négociations réussies du premier coup ; aucun secouriste exposé aux jets.
- **Aléas** — projectiles pendant le brancardage ; chef de section qui attend un ordre ; blessé léger qui réclame. **Échec** — délai dépassé ; brancard renversé. **Unique** — négocier avec les deux camps : l'obstacle est la coordination.
#### M64 — « Le hall » · poste de soins improvisé · ★★★
- **Cadre** : hall d'immeuble Rue de Rivoli, près de la Place du Châtelet ; vendredi 21 h 30 ; `clair`, nuit ; vous et 2 équipiers ; 14 patients en 20 min ; émeute dehors ; tension 0,7 / volatilité 0,7.
- **Phases** : ① installation : zone des verts, zone des jaunes, un seul couchage pour un rouge ② flux : brûlure légère, plaie du cuir chevelu, crise de panique, entorse ③ le gaz entre à chaque ouverture de porte ④ décision : tenir ou déménager de 80 m.
- **Objectifs** : P — aucun patient aggravé faute de soin ; rouge remis aux pompiers. S — stock tenu (compresses, sérum, couvertures) ; registre des prises en charge.
- **Aléas** — policier blessé amené par ses collègues ; gardien d'immeuble qui veut fermer ; coupure de courant. **Échec** — poste gazé avec des patients à l'intérieur ; refus de soin à un blessé. **Unique** — huis clos de gestion : le dehors n'existe que par le bruit et la porte.
#### M65 — « Neutre » · manifestation qui dégénère · ★★★★
- **Cadre** : Boulevard du Temple ; samedi 17 h 15 ; `couvert` ; vous seul, secouriste de rue ; à 12 m l'un de l'autre, un CRS blessé au genou et un manifestant touché à la tête ; 400 simulés ; tension 0,65 / volatilité 0,6.
- **Phases** : ① évaluer les deux : le plus grave d'abord, quel que soit son camp ② huées si vous soignez le policier, méfiance des policiers si vous approchez ③ geste, protection, appel ④ remise aux pompiers.
- **Objectifs** : P — ordre de prise en charge médicalement correct ; les deux blessés remis. S — jauge de neutralité à 70 ou plus ; aucune réponse agressive.
- **Aléas** — manifestant qui veut vous empêcher de soigner « l'autre camp » ; agent qui vous écarte ; journaliste qui cadre la scène. **Échec** — abandon d'un blessé ; prise de parti. **Unique** — la neutralité soignante comme jauge jouable, attaquée des deux côtés.
#### M66 — « Minuit moins dix » · événement festif · ★★★
- **Cadre** : Avenue des Champs-Élysées, hauteur du Rond-Point des Champs-Élysées ; 31 décembre, 23 h 50 ; `clair`, 3 °C ; vous, secouriste officiel, brancard à deux ; 1 200 simulés (foule narrative d'environ un million [S][53]) ; tension 0,1 / volatilité 0,3.
- **Phases** : ① patrouille le long des barrières ② 3 malaises en zone dense : extraire à contre-courant ③ minuit : mouvement de foule, personnes pressées contre une barrière ④ hypothermie, ivresse, entorse.
- **Objectifs** : P — 6 prises en charge ; personne comprimée extraite en moins de 45 s. S — barrière ouverte par les policiers à votre demande ; brancard jamais bloqué.
- **Aléas** — réseau téléphonique saturé (radio seulement) ; pétard dans la foule ; parent séparé de son enfant. **Échec** — victime piétinée ; secouriste submergé. **Unique** — médecine de foule : se déplacer dans la masse est l'épreuve.
#### M67 — « Quai inondé » · crue · ★★
- **Cadre** : Port des Champs-Élysées et Quai d'Orsay ; mercredi 08 h 00 ; `pluie`, 6 °C ; vous et les sapeurs-pompiers ; 9 occupants de péniches dont 3 âgés ; 150 badauds ; tension 0,05 / volatilité 0,1.
- **Phases** : ① reconnaissance des passerelles glissantes ② évaluation de 3 personnes âgées (hypothermie légère, traitement à emporter) ③ portage sur 40 m ④ poste de réchauffement sous une tente.
- **Objectifs** : P — 9 personnes évacuées sans chute. S — médicaments et papiers de chacun emportés ; badauds tenus à 15 m par la police à votre demande.
- **Aléas** — animal resté à bord ; occupant qui refuse de partir ; passerelle qui se décroche. **Échec** — chute à l'eau ; personne restée à bord à la fermeture du quai. **Unique** — aucune violence : soin et persuasion dans un décor de catastrophe lente.

### 4.10 Journaliste (`journaliste`)

#### M68 — « La Une » · formation à la photo · ★
- **Cadre** : Place de la Bastille puis Boulevard Beaumarchais ; samedi 14 h 15 ; `clair` ; vous, carte de presse, 24 vues ; 900 simulés du « Front commun des Ateliers » ; tension 0,1 / volatilité 0,2 ; durée `courte`.
- **Phases** : ① 5 commandes de la rédaction : banderole de tête, portrait d'une marcheuse, vue d'ensemble avec la colonne de Juillet, service d'ordre, équipe de liaison de la police ② envoi (20 s, immobile) ③ choix de la photo de une.
- **Objectifs** : P — 5 commandes remplies ; 1 photo à 700 points ou plus. S — légendes exactes ; moins de 15 vues.
- **Aléas** — contre-jour ; marcheur qui refuse d'être photographié (à respecter) ; averse sur l'objectif. **Échec** — aucune photo exploitable ; légende fausse publiée. **Unique** — cadrer une foule : la vue large et le portrait racontent deux histoires.
#### M69 — « Entre deux lignes » · affrontement · ★★★★
- **Cadre** : Boulevard du Temple ; jeudi 17 h 00 ; `couvert` ; vous, casque « PRESSE » et masque ; 600 simulés, compagnie de CRS ; tension 0,6 / volatilité 0,7.
- **Phases** : ① sommations : cadrer l'autorité civile et son écharpe ② se placer de côté, jamais dans l'axe ③ charge : rester visible, mains et appareil apparents ④ envoi sous le gaz.
- **Objectifs** : P — 3 clichés : sommation avec écharpe, charge, blessé secouru ; ne pas gêner la manœuvre. S — les deux camps dans un même cadre ; aucune blessure.
- **Aléas** — policier qui vous ordonne de reculer (vous pouvez rester si vous ne gênez pas, 01 §2.5) ; projectile ; objectif embué. **Échec** — incapacité ; matériel détruit ; casque retiré et confusion avec les manifestants. **Unique** — géométrie du risque : le bon angle est aussi l'angle sûr.
#### M70 — « Parapluies » · précortège hostile aux caméras · ★★★
- **Cadre** : Boulevard de Bonne Nouvelle ; jeudi 15 h 20 ; `nuageux` ; vous, sans agent de protection ; précortège de 250, bloc de 60 en formation ; tension 0,35 / volatilité 0,7.
- **Phases** : ① photographier la formation du bloc depuis un trottoir, à 25 m ② parapluies ouverts devant l'objectif, exigence d'effacer vos images ③ choix : effacer, parlementer, partir ④ si vous restez : cadrer les dégradations de loin.
- **Objectifs** : P — 2 photos de la formation du bloc, visages floutés à l'édition ; matériel conservé. S — carte mémoire de secours préservée ; aucun contact physique.
- **Aléas** — sangle arrachée ; service d'ordre qui vous met à l'abri ; vidéaste bousculé à côté de vous. **Échec** — appareil volé ou brisé ; visage non flouté publié. **Unique** — la menace vient des manifestants : la presse n'appartient à aucun camp.
#### M71 — « La preuve » · déontologie de l'information · ★★★★
- **Cadre** : Rue Royale ; samedi 18 h 20 ; `pluie` ; la scène de M35 vue par vous ; 300 simulés ; tension 0,5 / volatilité 0,5.
- **Phases** : ① vous filmez un jet de projectile, puis un coup porté sur une personne à terre ② la rédaction veut les images tout de suite ③ montage : séquence complète ou extrait ④ légende : 3 propositions, une seule exacte.
- **Objectifs** : P — séquence publiée fidèle à la chronologie ; légende exacte. S — images remises à l'enquête sur réquisition ; témoin protégé.
- **Aléas** — agent qui pose la main sur l'objectif ; manifestants qui exigent de ne montrer que le coup ; concurrent qui publie avant vous. **Échec** — montage trompeur ; légende fausse (tension +0,1 aux missions suivantes). **Unique** — le cadrage et la coupe changent le récit public et la suite de la campagne.
#### M72 — « Direct de vingt heures » · émeute, vidéo en direct · ★★★
- **Cadre** : Place de la Concorde, côté Rue de Rivoli ; samedi 19 h 58 ; `nuageux`, nuit ; vous et un technicien PNJ ; 800 simulés, feux, engin lanceur d'eau ; tension 0,7 / volatilité 0,6.
- **Phases** : ① trouver un point d'appui stable ② direct de 90 s : plan fixe, panoramique lent, zoom ③ blessé à 5 m en plein direct ④ rendre l'antenne.
- **Objectifs** : P — image stable 80 % du direct ; aucune personne blessée identifiable à l'antenne. S — 3 éléments d'information dans le cadre (feu, ligne, secours) ; son audible.
- **Aléas** — manifestant qui s'invite devant la caméra ; jet d'eau dévié ; liaison perdue 10 s. **Échec** — direct interrompu plus de 20 s ; gros plan sur un blessé. **Unique** — le rythme imposé par l'antenne : 90 secondes sans droit à l'erreur.
#### M73 — « Nuit embarquée » · émeute nocturne · ★★★
- **Cadre** : Rue du Faubourg du Temple, Quai de Jemmapes ; nuit de vendredi, 00 h 20 ; `clair` ; vous, autorisé à suivre une unité BRAV-M à 15 m ; 200 simulés ; tension 0,7 / volatilité 0,7.
- **Phases** : ① règles fixées par le chef d'unité (distance, pas de flash pendant une saisie) ② feu, escorte des pompiers ③ interpellation mouvementée ④ portrait d'un pompier après l'extinction.
- **Objectifs** : P — 4 photos nettes de nuit ; règles respectées. S — photo des pompiers à 700 points ou plus ; position de l'unité jamais révélée en direct.
- **Aléas** — flash qui trahit la position ; mortier d'artifice dans votre direction ; émeutier qui vous prend pour un policier en civil. **Échec** — gêne d'une interpellation ; position publiée en direct. **Unique** — basse lumière : le flash est une arme à double tranchant.
#### M74 — « Le lendemain » · après-coup · ★
- **Cadre** : Avenue Kléber et Place Victor Hugo ; dimanche 08 h 30 ; `clair` ; vous seul ; 40 riverains, commerçants et agents de propreté ; tension 0 ; durée `courte`.
- **Phases** : ① inventaire visuel : vitrines, abribus, carcasse de véhicule ② 4 entretiens (commerçante, agent de propreté, riveraine, manifestant revenu aider) ③ photo de synthèse ④ choix de l'angle de l'article.
- **Objectifs** : P — 6 photos de dégâts légendées ; 3 entretiens sur 4. S — article équilibré (2 points de vue au moins) ; chiffres repris du bilan officiel fictif.
- **Aléas** — commerçant en colère contre la presse ; touristes qui se photographient devant la carcasse ; averse. **Échec** — aucun : mission seulement notée. **Unique** — montrer le coût matériel et humain, à hauteur de trottoir.

### 4.11 Manifestant pacifique (`manifestant`)

#### M75 — « Ma première manif » · manifestation déclarée · ★
- **Cadre** : de la Place de la République à la Place de la Bastille ; samedi 14 h 00 ; `clair` ; vous et 4 amis PNJ, une banderole ; 900 simulés ; tension 0,1 / volatilité 0,2.
- **Phases** : ① retrouver le groupe au point de rendez-vous ② marcher derrière la banderole, slogans en rythme ③ arrêt du cortège : patienter ④ dispersion : partir par la rue indiquée.
- **Objectifs** : P — rester à moins de 15 m de vos amis ; quitter les lieux dans les 4 min suivant l'annonce de dispersion. S — tenir la banderole 3 min ; aider une personne à retrouver son groupe.
- **Aléas** — ami qui veut s'approcher du précortège ; averse ; fanfare. **Échec** — aucun : mission d'initiation. **Unique** — vivre un cortège ordinaire : lent, bruyant, bon enfant.
#### M76 — « Service d'ordre » · manifestation déclarée tendue · ★★★
- **Cadre** : Boulevard Saint-Martin ; jeudi 15 h 00 ; `couvert` ; vous, brassard du service d'ordre du « Front commun des Ateliers », chaîne de 12 ; 1 000 simulés, précortège 250 ; tension 0,3 / volatilité 0,6.
- **Phases** : ① former la chaîne devant le carré de tête ② maintenir 30 m d'écart avec le précortège ③ 20 perturbateurs tentent d'entrer dans le cortège ④ contact avec l'équipe de liaison pour un délestage.
- **Objectifs** : P — carré de tête jamais mêlé au bloc ; aucun coup donné. S — délestage accepté par le cortège ; blessé léger confié aux secouristes.
- **Aléas** — militant qui veut en découdre ; retour de gaz ; journaliste qui interroge. **Échec** — bagarre avec le bloc ; chaîne rompue. **Unique** — la troisième force d'une manifestation : ni police, ni bloc.
#### M77 — « Pris au piège » · manifestation qui dégénère · ★★★
- **Cadre** : Place de la Bastille ; samedi 17 h 45 ; `couvert` ; vous et votre père âgé (PNJ lent) ; 700 simulés ; ligne de CRS d'un côté, bloc de l'autre ; tension 0,65 / volatilité 0,6.
- **Phases** : ① entendre et comprendre les sommations ② chercher une issue : 3 rues, 1 seule ouverte ③ traverser un nuage : se protéger, guider ④ sortir, attendre au calme.
- **Objectifs** : P — sortir à deux, sans blessure, en moins de 5 min ; aucune infraction. S — relever une personne tombée ; signaler un blessé à un secouriste.
- **Aléas** — mouvement de foule ; issue qui se ferme ; inconnu qui propose l'abri d'un hall. **Échec** — séparation de plus de 60 s ; blessure grave. **Unique** — les sommations vues d'en bas : savoir où aller est le vrai problème.
#### M78 — « Sit-in » · manifestation interdite, résistance passive · ★★
- **Cadre** : Carrefour de l'Odéon ; mercredi 15 h 00 ; `clair` ; vous, assis parmi 120 étudiants ; la scène de M15 ; tension 0,2 / volatilité 0,3.
- **Phases** : ① s'asseoir, bras croisés avec les voisins ② sommations : rester ou partir (les deux choix sont notés) ③ portage : rester passif ④ contrôle d'identité, explication des suites.
- **Objectifs** : P — aucun geste violent. S — rester jusqu'au portage ; ou partir à la dernière sommation avec un ami qui a peur.
- **Aléas** — voisin qui panique ; agent brutal (signalement possible ensuite) ; averse. **Échec** — geste violent. **Unique** — le miroir exact de M15 : mêmes secondes, autre corps.
#### M79 — « Organisatrice » · manifestation déclarée, de la déclaration à la dispersion · ★★★
- **Cadre** : de la Place de la Bastille à la Place de l'Hôtel de Ville par la Rue Saint-Antoine ; samedi 14 h 00 ; `nuageux` ; vous, responsable de la « Marche pour les Arbres de Paris », mégaphone, 20 bénévoles ; 800 simulés ; tension 0,1 / volatilité 0,4.
- **Phases** : ① déclaration (but, lieu, date, heure, itinéraire : 01 §2.7) et rendez-vous avec le commissaire ② placer le service d'ordre, lancer le cortège ③ 30 perturbateurs : annoncer la désolidarisation, demander l'aide de la liaison ④ annonce de dispersion au texte exact (03 §1.6).
- **Objectifs** : P — arrivée dans la fenêtre horaire ; dispersion annoncée et suivie à 80 % en 4 min. S — aucun blessé ; prise de parole sans débordement.
- **Aléas** — sono en panne ; cortège deux fois plus nombreux que prévu ; contre-manifestants sur un trottoir. **Échec** — itinéraire non respecté ; dispersion jamais annoncée. **Unique** — la responsabilité de l'organisateur : tenir 800 personnes par la parole.

### 4.12 Manifestant radical (`manifestant`, profil `radical`)

Ces missions décrivent ce que l'on voit, jamais comment fabriquer ou préparer quoi que ce soit ; elles sont notées sur l'absence de tiers blessé et se concluent par un bilan des suites.

#### M80 — « Le signal » · précortège · ★★★
- **Cadre** : Boulevard Saint-Martin ; jeudi 15 h 15 ; `nuageux` ; vous dans le précortège ; bloc de 60 en formation, drone au-dessus ; 1 000 simulés ; tension 0,35 / volatilité 0,7.
- **Phases** : ① fumigène noir : s'écarter (fin alternative, notée) ou se couvrir et rejoindre ② 60 s dans le bloc : la jauge « identifié » monte sous le drone et les objectifs ③ le groupe dégrade un panneau publicitaire : y participer ou non ④ sortie, changement d'apparence, retour dans la foule.
- **Objectifs** : P — sortir sans être interpellé. S — jauge « identifié » sous 50 % ; aucun tiers blessé par votre fait.
- **Aléas** — vidéaste qui vous suit ; voisin interpellé ; service d'ordre qui vous repousse. **Échec** — interpellation (enchaîne sur M83) ; tiers blessé. **Unique** — la détection de M56 vécue de l'intérieur ; le renoncement est une fin valide.
#### M81 — « La barricade » · émeute nocturne · ★★★★
- **Cadre** : Rue de la Roquette ; nuit de samedi, 23 h 10 ; `clair` ; vous dans un groupe de 40 ; section de CRS (18) puis engin lanceur d'eau ; tension 0,75 / volatilité 0,8.
- **Phases** : ① pousser et coucher du mobilier déjà présent (bacs, barrières) pour barrer 12 m ② tenir 3 min face à l'avance des CRS ③ arrivée de l'engin lanceur d'eau : la barricade cède ④ fuite avant le bouclage (2 issues).
- **Objectifs** : P — fuir sans être interpellé. S — tenir 3 min ; n'avoir blessé personne.
- **Aléas** — camarade blessé à porter ; feu allumé par d'autres contre une façade habitée ; issue fermée par des motos. **Échec** — interpellation ; riverain mis en danger par votre fait. **Unique** — le compte rendu final chiffre le coût de la scène : interpellés, blessés, dégâts, suites judiciaires.
#### M82 — « Chat et souris » · cortège sauvage · ★★★
- **Cadre** : Rue de Turenne, Rue des Francs-Bourgeois, Rue de Bretagne, Rue du Temple ; samedi 19 h 30 ; `nuageux` ; vous dans un groupe de 40 ; BRAV-M (12) et drone ; passants nombreux ; tension 0,55 / volatilité 0,7.
- **Phases** : ① départ en courant après la dispersion ② 3 carrefours : choisir la rue (largeur, issues, passants) ③ les motos débarquent devant : demi-tour ou dispersion ④ se fondre parmi les passants.
- **Objectifs** : P — tenir 5 min sans interpellation. S — aucun passant bousculé ; aucune dégradation d'un petit commerce.
- **Aléas** — impasse ; terrasse pleine ; riverain qui filme. **Échec** — interpellation ; passant blessé. **Unique** — M37 vu d'en face : la lecture du plan de Paris décide de tout.
#### M83 — « Garde à vue » · suites judiciaires · ★
- **Cadre** : fourgon puis commissariat (intérieur stylisé) ; samedi 20 h 00 → dimanche 14 h 00 (ellipses) ; vous, interpellé à la fin d'une mission précédente ; aucun combat ; durée `courte`.
- **Phases** : ① notification des droits (résumé fidèle de 01 §6.2) ② fouille, inventaire des objets ③ audition : garder le silence ou répondre à 4 questions ④ issue selon le dossier (images, fait constaté).
- **Objectifs** : P — comprendre chaque étape (4 questions de vérification). S — demander un avocat et un médecin ; réponses cohérentes avec les images.
- **Aléas** — codétenu qui raconte sa journée ; policier pressé ; image de drone qui vous disculpe ou vous confond. **Échec** — aucun : l'issue dépend des actes de la mission d'origine. **Unique** — la conséquence jouée jusqu'au bout : c'est ici que se lit la qualité d'une interpellation (M07, M12, M38).
#### M84 — « Demi-tour » · bascule · ★★★★
- **Cadre** : Place de la République ; samedi 18 h 45 ; `nuageux` ; vous, d'abord pacifique, avec 2 amis ; 700 simulés ; le directeur fait commettre aux forces une action perçue comme indiscriminée (gaz sur des familles) ; tension 0,5 / volatilité 0,8.
- **Phases** : ① la peur : se regrouper (la cohésion de la foule monte) ② jauge de colère ; 4 actions offertes : aider un blessé, crier, renvoyer une grenade lacrymogène tombée à vos pieds, partir ③ vos actes entraînent ou retiennent vos voisins dans un rayon de 8 m ④ épilogue selon la voie suivie.
- **Objectifs** : P — atteindre l'un des 3 épilogues (apaisement, départ, affrontement). S — vos 2 amis indemnes ; rapport final : voisins entraînés, voisins retenus.
- **Aléas** — ami gazé ; policier qui tend la main à une personne tombée (colère en baisse) ; vidéo de la scène déjà en ligne. **Échec** — blessure grave ; interpellation (enchaîne sur M83). **Unique** — la radicalisation comme système jouable et réversible (03 §5), vécue à la première personne.

### 4.13 Couverture par type de mission

| Type | Missions |
|---|---|
| Manifestation déclarée | M01, M02, M05, M11, M17, M19, M20, M30, M31, M42, M55, M56, M68, M69, M70, M75, M76, M79, M80 |
| Manifestation interdite ou non déclarée | M04, M15, M21, M23, M32, M45, M51, M52, M78 |
| Rassemblement spontané, cortège sauvage, bascule | M33, M37, M82, M84 |
| Émeute nocturne | M16, M22, M41, M47, M58, M73, M81 |
| Soir de match | M06, M18 |
| Sécurisation de site | M10, M34 |
| Escorte | M14, M25, M40, M46 |
| Évacuation, dégagement | M15, M44, M48, M67 |
| Intervention sur pillage | M13, M22, M39 |
| Protection des secours | M03, M09, M40, M50, M58, M63 |
| Maintien d'un barrage | M04, M08, M23, M51 |
| Interpellation ciblée | M07, M12, M38, M57 |
| Événement festif | M26, M59, M66 |
| Visite officielle | M25, M34 |
| Crue ou incendie avec foule | M09, M27, M67 |
| Contre-manifestation, encerclement | M24, M28 |
| Formation, soins, déontologie, suites | M36, M43, M49, M53, M54, M60, M61, M62, M64, M65, M35, M71, M72, M74, M77, M83 |

> **Ce que le jeu doit reproduire — Missions**
> - Un catalogue de données (un objet par mission) portant les champs de `SessionConfig` plus `extra` : phases, objectifs, aléas, conditions d'échec ; aucun code propre à une mission.
> - Les valeurs chiffrées des objectifs (secondes, mètres, pourcentages, litres, grenades) sont des seuils **testables** par la simulation sans rendu.
> - Trois aléas tirés par mission dans sa liste et dans la liste transverse (4.0), selon la graine.
> - Les missions « miroirs » (M05/M61, M15/M78, M35/M71, M37/M82, M56/M80) rejouent la **même scène** avec la même graine dans un autre rôle.
> - Une mission ne se termine pas au chronomètre : elle se termine quand ses phases sont jouées **et** que la foule présente passe sous 5 % (section 5.5).

---

## 5. Campagne « Carrière » et « Mode libre » [JEU]

### 5.1 Chapitres de la carrière

| Chap. | Titre | Grade (`PoliceRank`) | Missions | Condition de passage |
|---|---|---|---|---|
| 0 | « L'école » | élève (hors grade) | 4 ateliers de 3 min : tenir la ligne, porter le bouclier, écouter les sommations, premiers secours | Les 4 ateliers réussis |
| 1 | « Première ligne » | `gardien_stagiaire` | M01, M02, M04, M09, M10 | 4 missions notées C ou mieux, aucune sanction : titularisation |
| 2 | « Le métier » | `gardien` | M03, M05, M06, M07, M08 ; habilitations (lanceur, LBD, extincteur, interpellation) | 5 missions, moyenne B ; 2 habilitations sur 4 |
| 3 | « Sept sous mes ordres » | `brigadier_chef` (`brigadier` seulement avec l'option « avant 2023 », 01 §4.6) | M11 à M18 | 6 missions, moyenne B ; aucun agent laissé isolé |
| 4 | « La section » | `major` | Variantes à 18 agents de M12, M13, M16, M18 ; M24 comme chef de la section qui tient la sortie | 4 missions, moyenne B |
| 5 | « L'adjoint » | `capitaine` | M19, M22, M26 : vous commandez une demi-compagnie, le commandant PNJ fixe l'intention | 3 missions, moyenne A ; examen de 10 questions tirées du dossier 01 |
| 6 | « La compagnie » | `commandant` | M19 à M28 | 8 missions, moyenne B ; image publique à 50 ou plus |
| 7 | « L'écharpe » | `commissaire` (concours : rôle distinct) | M29 à M35 | 6 missions, moyenne A |
| 8 | « La grande journée » | au choix | Parcours de 4,4 km Bastille → République → Grands Boulevards → Opéra (03 §1.5), tous les systèmes, durée `longue` ou `temps_reel` | Fin de la carrière |

| Détachement (branche facultative) | Ouverture | Missions |
|---|---|---|
| BRAV-M | Chapitre 2, après 3 interpellations sans faute | M36 à M42 |
| Engin lanceur d'eau | Chapitre 2 | M49 à M54 |
| Télépilote | Chapitre 3 | M55 à M60 |
| Centaure | Chapitre 3 ; « détachement auprès de la gendarmerie », licence de jeu : dans la réalité, c'est un autre corps (01 §4.2) | M43 à M48 |
| Regards croisés (rôles civils) | Chaque mission civile s'ouvre quand sa mission miroir est terminée : M05 → M61, M02 → M69, M15 → M78, M35 → M71, M37 → M82, M56 → M80, M20 → M76, M07 ou M12 ou M38 → M83 ; les autres à la fin de chaque chapitre | M61 à M84 |

### 5.2 Note, avancement, discipline

| Composante de la note sur 100 | Points | Mesure |
|---|---|---|
| Procédure | 30 | Cadre légal respecté, sommations, ordres exécutés ou donnés, autorisations tracées |
| Objectifs | 30 | Principaux 20, secondaires 10 |
| Protection des personnes | 20 | Tiers, manifestants pacifiques, collègues, secours |
| Image publique | 10 | Ce que les caméras ont vu (03 §7) |
| Compte rendu | 10 | Exactitude et sincérité du compte rendu final |

Lettres : **S** à partir de 90, **A** de 80, **B** de 65, **C** de 50, **D** en dessous (mission à refaire en carrière).

| Faute (01 §7.2) | Sanction | Effet dans la carrière |
|---|---|---|
| Légère : geste hors cadre sans blessé, compte rendu incomplet | Avertissement ou blâme | Mention au dossier ; la note S est inaccessible pendant 2 missions |
| Sérieuse : blessé par un geste disproportionné, ordre non exécuté sans objection | Exclusion de 4 à 15 jours | 1 ou 2 missions sautées (résumées par un texte) ; avancement retardé d'un chapitre |
| Grave : blessé grave par usage illégal d'une arme, mensonge établi par les images | Rétrogradation au grade immédiatement inférieur | Retour au chapitre précédent |
| Très grave | Révocation | Fin de la carrière ; le Mode libre reste accessible |

État conservé d'une mission à l'autre : dossier disciplinaire ; **image publique globale** (0 à 100, départ à 60) qui déplace la tension initiale de la mission suivante de −0,1 à +0,1 ; fatigue et blessures de l'unité (agent blessé indisponible pendant 1 à 3 missions) ; convocation devant l'inspection entre deux missions, avec les pièces (journal radio horodaté, caméra-piéton, images de presse).

### 5.3 Déblocages

| Élément débloqué | Quand |
|---|---|
| Galons et écusson de chaque grade | À la promotion |
| Matériel : gazeuse, lanceur de 56 mm, LBD, extincteur, grenade de désencerclement | Atelier d'habilitation réussi (chapitre 2) |
| Véhicules : fourgon, car, véhicule de commandement | Chapitres 1, 3 et 6 |
| Carte tactique complète et drone d'appui | Chapitre 6 |
| Paramètres avancés de l'éditeur de scénario | Fin du chapitre 3 |
| Médailles (sans effet de jeu) : « Sans un coup » (M30 notée S), « Douze grenades » (M45), « Neutre » (M65), « Sincère » (M35) | À l'obtention |

Rien n'est verrouillé dans le Mode libre : la carrière débloque une histoire et des distinctions, pas l'accès au contenu.

### 5.4 Mode libre

| Paramètre | Valeurs | Défaut | Champ de `SessionConfig` |
|---|---|---|---|
| Rôle | Les 12 rôles jouables | `crs` | `role` |
| Grade | Les 8 grades, **commandant et commissaire dès la première partie** | `gardien` | `rank` |
| Mission | M01 à M84, ou « Session libre » sur un lieu | — | `missionId` (vide pour une session libre) |
| Lieu | 30 lieux nommés | Place de la République | `place` |
| Heure | De 0 h à 24 h par pas de 30 min | 14 h | `timeOfDay` |
| Météo | 7 valeurs de `WeatherKind` | `nuageux` | `weather` |
| Foule | De 100 à 2 000 par pas de 100 | 600 | `crowdSize` |
| Tension initiale | De 0 à 1 | 0,2 | `tension` |
| Propension à dégénérer | De 0 à 1 | 0,5 | `volatility` |
| Qui dérape | « personne », « la foule », « les forces », « les deux », « au hasard » | « au hasard » | `extra.derapage` |
| Durée | 10, 25, 45 min, temps réel | 25 min | `duration` |
| Fin de mission | « à l'annonce de dispersion » ou « jusqu'au dernier groupe » | « jusqu'au dernier groupe » | `extra.fin` |
| Forces | Automatique (3 à 10 agents pour 100 manifestants, 03 §1.3) ou manuel | automatique | `extra.forces` |
| Appuis | Engin lanceur d'eau, Centaure, BRAV-M, drone, pompiers : oui ou non | selon la mission | `extra.appuis` |
| Aide au commandement | « aucune », « suggestions de l'adjoint », « adjoint autonome » | « suggestions de l'adjoint » | `extra.aideCommandement` |
| Graine | Entier | aléatoire | `seed` |

« Qui dérape » règle les deux sources d'escalade : « la foule » multiplie par 1,5 la part de radicaux et d'opportunistes ; « les forces » donne aux policiers PNJ sous tension une probabilité de 0,15 par minute de commettre un geste hors cadre, que le joueur doit prévenir, arrêter ou signaler ; « au hasard » tire parmi les quatre autres (40 % personne, 20 % chacun des trois autres). Le joueur commandant qui débute reçoit des propositions d'ordre de son adjoint (« Je propose : 2e section, TENIR l'angle. ») qu'il valide d'une touche.

### 5.5 Durée d'une mission : recommandation

| Réglage | Usage conseillé | Règle de fin |
|---|---|---|
| `courte`, 10 min | Découverte, formation, téléphone | Fin à la dernière phase |
| `standard`, 25 min | Réglage par défaut de toutes les missions | Fin quand les phases sont jouées **et** qu'il reste moins de 5 % de la foule dans le périmètre ; sinon prolongations automatiques de 5 min, 3 au plus |
| `longue`, 45 min | Commandant, autorité civile, émeutes nocturnes | Même règle ; l'après-manifestation occupe 24 % du temps (03 §1.6) |
| `temps_reel` | Passionnés | Bouton d'accélération ×4 tant que la tension reste sous 0,15 ; pause et reprise par la sauvegarde |

L'horloge affichée est **l'heure de la journée**, pas un compte à rebours : la mission dure « tant que la manifestation n'est pas terminée ». Le joueur peut demander la fin anticipée quand tous les objectifs principaux sont atteints et que la tension est sous 0,15.

> **Ce que le jeu doit reproduire — Carrière et Mode libre**
> - Carrière : 9 chapitres, 8 grades, 4 détachements, 24 missions civiles ouvertes par leurs miroirs ; sanctions calquées sur l'échelle réelle.
> - Mode libre : **tout est ouvert**, y compris commandant et commissaire ; 16 paramètres, dont « qui dérape » pour faire dégénérer d'un côté ou de l'autre.
> - Les parties du Mode libre n'entrent pas dans le dossier de carrière ; elles gardent leur propre tableau de notes par mission.
> - Durée par défaut de 25 min, fin sur l'état de la foule et non sur le chronomètre, prolongations de 5 min.
> - Le compte rendu affiche la graine et les 16 paramètres : une partie se rejoue ou se partage à l'identique.

---

## Sources

Consultées le 15 novembre 2026. « lu » = page lue pendant cette recherche ; « résumé » = connue par un extrait ou un résumé de moteur de recherche ; « non lu » = accès refusé.

### Pages officielles et primaires
- [1] Boutique Steam, « Riot Control Simulator: Rookie Day » — https://store.steampowered.com/app/2535680/Riot_Control_Simulator_Rookie_Day/ (lu)
- [2] Boutique Steam, « Riot Control Simulator » — https://store.steampowered.com/app/1579210/Riot_Control_Simulator (lu)
- [3] Boutique Steam, « Flashing Lights » — https://store.steampowered.com/app/605740/Flashing_Lights__Police_Firefighting_Emergency_Services_Simulator/ (lu)
- [4] itch.io, « CRS RUSH (Loi Travail Simulator) » — https://lacrearthur.itch.io/crs-rush (lu)
- [5] GDC Vault, « Massive Crowd on Assassin's Creed Unity: AI Recycling » (2015) — https://www.gdcvault.com/play/1022141/Massive-Crowd-on-Assassin-s (lu : résumé de la session)
- [6] Gendarmerie nationale, « Du virtuel à la réalité », salon du jeu vidéo de Paris 2025 — https://www.gendarmerie.interieur.gouv.fr/gendinfo/actualites/2025/du-virtuel-a-la-realite-l-experience-immersive-de-la-gendarmerie-a-la-paris-games-week (non lu)
- [7] Gendarmerie nationale, formation des futurs commandants d'unité, simulateur « Romulus » (2026) — https://www.gendarmerie.interieur.gouv.fr/gendinfo/terrain/immersion/2026/une-formation-inedite-au-profit-des-futurs-commandants-d-unite-elementaire-en-outre-mer (non lu ; résumé)
- [8] Ville de Paris, crues de la Seine — https://www.paris.fr/pages/crues-5472 (résumé)
- [54] Données du dépôt : `tools/map/raw/normalized/places.geojson` (3 278 lieux ; 207 noms de missions vérifiés) et dossiers 01, 02, 03 (lus)

### Tests, encyclopédies, agrégateurs d'avis
- [9] Pieuvre.ca, test de « RIOT: Civil Unrest » (24 février 2019) — https://pieuvre.ca/2019/02/24/technologie-jeux-video-riot-civil-unrest (lu)
- [10] Wikipédia (en), « Riot: Civil Unrest » — https://en.wikipedia.org/wiki/Riot:_Civil_Unrest (lu)
- [11] GOG, fiche et avis de « RIOT: Civil Unrest » — https://www.gog.com/fr/game/riot_civil_unrest (résumé)
- [12] jeuxvideo.com, fiche du même jeu — https://www.jeuxvideo.com/jeux/jeu-67970/ (résumé ; non cité)
- [13] TechRaptor, test du même jeu — https://techraptor.net/content/riot-civil-unrest-review (non lu ; non cité)
- [14] Prima Games, test du même jeu — https://primagames.com/gaming/riot-civil-unrest-review (résumé)
- [15] OpenCritic, « Police Simulator: Patrol Officers » — https://opencritic.com/game/13965/police-simulator-patrol-officers (résumé)
- [16] CyberPowerPC, guide du même jeu — https://www.cyberpowerpc.com/blog/police-simulator-patrol-officers-work-week-guide/ (résumé)
- [17] astragon, annonce de la mise à jour « Keys to the City » — https://www.astragon.com/news/detail/the-new-keys-to-the-city-update-for-police-simulator-patrol-officers-is-now-available-with-more-freedom-and-new-tasks (résumé)
- [18] VaporLens, synthèse d'avis de « Police Simulator: Patrol Officers » — https://vaporlens.app/app/997010/police_simulator_patrol_officers (lu)
- [19] Wikipédia (en), « Ready or Not » — https://en.wikipedia.org/wiki/Ready_or_Not_(video_game) (lu)
- [20] VaporLens, synthèse d'avis de « Ready or Not » — https://vaporlens.app/app/1144200/ready_or_not (lu)
- [21] Forum Steam de « Ready or Not », pénalités — https://steamcommunity.com/app/1144200/discussions/0/4036978698791870878 (résumé)
- [22] Sports Illustrated (jeux vidéo), test de « Ready or Not » — https://videogames.si.com/reviews/ready-or-not-review (résumé)
- [23] GameGrin, aperçu de « Flashing Lights » — https://gamegrin.com/previews/flashing-lights-preview (résumé)
- [24] Xboxygen, test de « The Precinct » — https://www.xboxygen.com/Tests/52615-Test-The-Precinct-Le-GTA-version-police (résumé)
- [25] Breakflip, test de « The Precinct » — https://www.breakflip.com/tests/8402.html (résumé)
- [26] ActuGaming, fiche et test de « The Precinct » — https://www.actugaming.net/jeux/the-precinct/ (résumé)
- [27] Wikipédia (en), « This Is the Police » — https://en.wikipedia.org/wiki/This_Is_the_Police (lu)
- [28] GameSpot, test de « Urban Chaos: Riot Response » — https://www.gamespot.com/reviews/urban-chaos-riot-response-review/1900-6152766/ (résumé)
- [29] « Radio Commander » : GameGrin — https://www.gamegrin.com/reviews/radio-commander-review ; Vice — https://www.vice.com/en/article/radio-commander-review/ (résumés)
- [30] ActuGaming, test d'« Okhlos » — https://actugaming.net/test-okhlos-foule-se-rebelle-contre-dieux-de-lolympe-45713 (résumé)
- [31] Kritiqal, « Anarcute, Tonight We Riot, and the Optics of Revolution » — https://www.kritiqal.com/articles/anarcute-tonight-we-riot-optics (résumé)
- [32] Kill Screen, les foules d'« Assassin's Creed Unity » — https://www.killscreen.com/assassins-creed-unity-making-crowd-main-character (lu)
- [33] Game Developer, « The eye of the beholder: measuring player success in photography games » — https://gamedeveloper.com/design/the-eye-of-the-beholder-measuring-player-success-in-photography-games (lu)
- [34] Guides de « New Pokémon Snap » — https://www.imore.com/new-pokemon-snap-photo-guide ; https://pokejungle.net/new-pokemon-snap/rating-star-guide/ (résumés)
- [35] Wiki « Dead Rising », photographie — https://dead-rising.fandom.com/wiki/Photography (résumé)
- [36] TheGamer, « Umurangi Generation » — https://www.thegamer.com/photographer-simulator-umurangi-generation/ (résumé)
- [37] Wikipédia (en), « 1979 Revolution: Black Friday » — https://en.wikipedia.org/wiki/1979_Revolution:_Black_Friday (lu)
- [38] Wikipédia (en), « Not for Broadcast » — https://en.wikipedia.org/wiki/Not_for_Broadcast (lu)
- [39] Triage START : Wikipédia (en) — https://en.wikipedia.org/wiki/Simple_triage_and_rapid_treatment ; WikEM (fr) — https://www.wikem.org/wiki/Start_triage/fr (résumés)
- [40] Boutique Steam, « Ambulance Life: A Paramedic Simulator » — https://store.steampowered.com/app/1926520/Ambulance_Life_A_Paramedic_Simulator (résumé)
- [41] « 911 Operator » : wiki de joueurs — https://shapes.inc/fandom/911-operator/incidents ; fiche de l'extension « Every Life Matters » — https://store.epicgames.com/p/911-operator-911-operator-every-life-matters-e5bd27 (résumés)
- [42] MissionChief, missions de manifestation violente — https://police.missionchief.com/einsaetze/136 ; https://missionchief-australia.com/einsaetze/225 (résumés)
- [43] Roblox, « Emergency Response: Liberty County » — https://web.roblox.com/games/2534724415/Emergency-Response-Liberty-County (résumé)
- [44] Jeux de rôle francophones sur Roblox et kit d'uniformes — https://www.roblox.com/games/10807495178 ; https://builtbybit.com/resources/french-gendarmerie-kit.87836/ (résumés)
- [45] Boutique de scripts pour serveurs de jeu de rôle — https://fivemx.com/fr/boutique/emploi-de-police-a-esx/ (résumé)
- [46] Mods « gendarmerie » — https://steamcommunity.com/sharedfiles/filedetails/comments/767912608 ; https://reforger.armaplatform.com/workshop/6A7D3B56BDC961B8 (résumés)
- [47] Petits jeux français — https://rp-bordeaux.itch.io/gilet-jaunes ; https://gomeisa.itch.io/syndikaruga (résumés)
- [48] Jeu mobile « Riot Escape » — https://apps.apple.com/app/id1552231557 (résumé)
- [49] Guides de « Hell Let Loose » — https://guildorder.com/games/hell_let_loose/wiki/commander-role-and-strategic-abilities ; https://guildorder.com/games/hell_let_loose/wiki/squad-leader-responsibilities (résumés)
- [50] Police1, emploi des drones par les unités d'intervention — https://www.police1.com/police-products/police-drones/articles/ntoa-how-to-maximize-the-capabilities-of-swat-drones-4OOidOJwHDffrOEp (résumé)
- [51] Wikipédia (fr) : Avenue des Champs-Élysées, Place de la Concorde, Place de la Bastille, Esplanade des Invalides, Champ-de-Mars (lus) — https://fr.wikipedia.org/wiki/Avenue_des_Champs-%C3%89lys%C3%A9es ; Structurae, Place de la République — https://structurae.net/fr/ouvrages/place-de-la-republique (résumé)
- [52] Crues : RTBF — https://www.rtbf.be/article/la-crue-de-la-seine-a-atteint-son-pic-a-paris-9824572 ; Ville de Paris, le Zouave — https://www.paris.fr/pages/une-vie-en-seine-le-zouave-barometre-de-la-montee-des-eaux-34985 (résumés)
- [53] Nouvel An sur les Champs-Élysées : gendarmerie — https://www.gendarmerie.interieur.gouv.fr/gendinfo/terrain/immersion/2024/en-immersion-avec-les-gendarmes-engages-dans-la-securisation-de-la-nuit-de-la-saint-sylvestre-a-paris ; presse (résumés)
- [55] SteamDB, fréquentation de « Rookie Day » — https://steamdb.info/app/2535680/charts (résumé)
- [56] Copie d'encyclopédie, « Emergency 5 » — https://cavac.at/cavacopedia/Emergency%205 (résumé)

## Points incertains

### Non trouvé
- **Le jeu vu sur TikTok** : aucun titre identifié ; l'hypothèse du prologue polonais ou d'un serveur de jeu de rôle n'est pas confirmée. Il faudrait le nom du compte ou une capture de la vidéo.
- **Texte des avis de joueurs** du prologue concurrent et du jeu d'émeute de 2019 : l'interface de la boutique n'a pas pu être interrogée ; seuls les totaux sont vérifiés.
- **Expérience Roblox, serveur de jeu de rôle ou mod consacré aux CRS** : rien trouvé ; cela ne prouve pas qu'il n'en existe pas (ces contenus sont mal indexés).
- **Mission d'émeute dans la série « Emergency »**, détail des règles d'émeute de « 911 Operator » : non trouvé ou connu par un seul wiki de joueurs.
- **Articles officiels de la gendarmerie** [6][7] : accès refusé ; le simulateur « Romulus » n'est connu que par un résumé.
- **Dates de sortie et studios** de plusieurs jeux cités (« Police Simulator: Patrol Officers », « Ready or Not », « Urban Chaos: Riot Response », « Not for Broadcast ») : non relus à la source, volontairement omis ou marqués [S].

### Sources divergentes ou fragiles
- « RIOT: Civil Unrest » : 4 ou 6 campagnes, 17 scénarios ou « une trentaine » selon les sources ; note de 11 sur 20 des lecteurs d'un site français non vérifiée.
- Barème de « New Pokémon Snap » : plafonds par critère estimés par les joueurs, contradictoires d'un guide à l'autre.
- Compteur de visites de l'expérience de services d'urgence : relevé en mars 2025, sans doute dépassé.
- Avis du prologue concurrent : 61 % sur 921 à la lecture de la page ; d'autres relevés donnent 59 % sur 492 ou 830 avis (dates différentes).
- Place de la Concorde : 7,56 ha et 360 × 210 m d'après la page lue ; d'autres publications donnent environ 8,6 ha.
- Dimensions marquées [E] (Place Charles de Gaulle, boulevards, ponts, Rue Royale, Avenue Kléber) : ordres de grandeur de mémoire, à remplacer par la mesure de la carte du jeu.
- Affluence et effectifs du Nouvel An (un million de personnes, 10 000 agents) : chiffres de presse attribués à la préfecture, communiqué non lu.
- Tout ce qui est marqué [JEU] (barèmes, seuils, durées des gestes, probabilités d'aléas, structure de carrière, emploi du Centaure par un joueur policier) est une **proposition de conception**, pas un fait.
