# 03 — Dynamique d'une manifestation : déroulement, escalade, psychologie des foules

> Dossier de recherche pour **CRS Simulation France**. Rédigé le 15 novembre 2026 à partir de sources consultées ce jour.
> Public visé : développeurs de l'intelligence artificielle de la foule (`src/sim/crowd`), du directeur de tension (`DirectorApi`),
> des rôles (`src/sim/roles`), des missions et des médias. Tout ce qui est entre guillemets « … » est un **texte exact** (citation
> d'une source, ou texte d'interface proposé quand la ligne est marquée [JEU]).
> Les noms réels (mouvements, organisations, lieux d'incidents) ne servent ici qu'à la **traçabilité** : dans le jeu, mouvements,
> syndicats, partis, enseignes et slogans sont **fictifs et génériques**, et aucune personne réelle n'apparaît (BRIEF §4).
> Les comportements violents sont décrits **au niveau du gameplay** (ce que l'on voit, l'effet produit), jamais comme un mode d'emploi.
> Ce dossier complète sans les répéter : `01-doctrine-cadre-legal.md` (droit, sommations, schéma national, interpellation) et
> `02-materiel-tenues-vehicules.md` (matériel, portées, apparence des participants, mobilier urbain).

## Légende de fiabilité

| Marque | Signification |
|---|---|
| **[V]** | **Vérifié** : lu pendant cette recherche dans un document officiel ou primaire (rapport parlementaire, réponse ministérielle, étude du Défenseur des droits). |
| **[A]** | **Publication scientifique ou médicale** (article, résumé d'auteur, manuel médical), lue pendant cette recherche ou connue par son résumé : la liste des sources précise « lu » ou « résumé ». |
| **[S]** | **Source secondaire** : presse, Wikipédia, organisation non gouvernementale, texte militant ; ou source primaire connue seulement par un résumé de recherche. Plausible, à recouper. |
| **[E]** | **Estimation calculée** à partir de valeurs vérifiées (le calcul est donné). |
| **[JEU]** | **Valeur de conception proposée** pour le jeu : non réelle, cohérente avec ce qui est vérifié. |
| **[I]** | **Incertain / non trouvé** : ne pas présenter comme réel. |

Les renvois `[n]` pointent vers la section **Sources** en fin de dossier.

### Correspondance avec `src/core/contracts.ts` (lecture seule, rien n'est modifié)

| Notion de ce dossier | Identifiant existant dans le contrat |
|---|---|
| Phases de la manifestation (§1.1) | `CrowdPhase` : `rassemblement`, `depart`, `cortege`, `tension`, `affrontement`, `dispersion`, `apres_manif`, `terminee` |
| Profils de manifestants (§2) | `ProtestProfile` : `pacifique`, `famille`, `militant`, `service_ordre`, `meneur`, `opportuniste`, `radical`, `pilleur` |
| Tiers (§2, §6, §7) | `PersonKind` : `street_medic`, `journaliste`, `observateur`, `passant`, `touriste`, `commercant`, `pompier`, `samu` |
| Tension (§3.6, §10) | `DirectorApi.tension` (0..1), `tensionAt(x, z)`, `addTension(amount, x, z, reason)` ; `SessionConfig.tension` et `volatility` |
| Radicalisation (§5) | événement `person:radicalized { from, to }` |
| Vent (§4.3) | `EnvApi` : `windX`, `windZ` |

---

## 0. L'essentiel en vingt constats (à coder en premier)

1. La **très grande majorité** des manifestations se déroule sans violence : dans les années 1975-1990, « seulement 5 % en moyenne des événements donnent lieu à des violences contre les biens ou les personnes ». [V][4]
2. Le **cortège encadré par les organisateurs n'est pas la source des troubles** : « du carré de tête à la fin du cortège », il n'y a que « peu d'altercations ». La violence naît dans le **précortège** (« cortège de tête ») qui marche devant. [V][1]
3. Rien ne se passe pendant le rassemblement : « les affrontements ne commencent jamais avant le début du défilé ». [V][1]
4. Le bloc radical **ne se forme pas tout de suite** : il se constitue **après le départ**, annoncé par des signaux (fumigènes noirs, parapluie ouvert), puis des personnes **se changent en noir**. [V][1]
5. Les individus les plus dangereux **arrivent les mains vides** et utilisent « le mobilier urbain disponible sur le parcours ». [V][1]
6. Ordre de grandeur réel : **1 interpellation pour 1 000 manifestants** ; **0,5 à 1 %** de manifestants « à risque » ; à Paris, un précortège de **2 000 à 12 000 personnes**. [V][1]
7. À Paris, **4 000 à 5 500** policiers et gendarmes pour **42 000 à 119 000** manifestants (3 à 10 agents pour 100 manifestants). [V][1]
8. Posture policière par défaut : « Nous donnons de la distance. Nous ne nous rendons pas visibles. Nous n'intervenons qu'en cas d'exaction. Puis nous nous retirons. » [V][1]
9. **La peur soude la foule** : « l'émotion la plus mobilisatrice n'est pas la colère, mais la peur » ; la foule « gagne alors en cohésion », ce qui « provoque la solidarisation » avec celui qui « jette des pavés ». [V][1]
10. Un usage de la force perçu comme **indiscriminé** transforme des pacifiques en soutiens des violents : c'est le cœur du modèle de l'identité sociale élaborée (ESIM). [A][9][10]
11. Les groupes radicaux **cherchent** cette intervention indistincte, « dans le but de susciter dans l'ensemble de la foule présente […] un rejet unanime ». [V][4]
12. Interpeller, c'est aller **au contact** ; maintenir l'ordre, c'est **tenir à distance** : les deux objectifs se contrarient, et l'interpellation en foule « peut faire dégénérer la situation ». [V][1][4]
13. Le gaz lacrymogène touche « de manière indifférenciée un groupe de manifestants » ; ses effets cessent **15 à 30 minutes** après décontamination. [V][5]
14. La **dispersion** est le « moment crucial, qui dure un certain temps » : beaucoup de participants ne savent ni où ni quand elle a lieu. [V][1]
15. En fin de manifestation, **trois invariants** : pillages par des jeunes vêtus de noir, retrait rapide des militants aguerris, maintien sur place des plus déterminés pour l'affrontement. [V][1]
16. Les pilleurs opportunistes arrivaient « à la nuit tombée » ; « Désormais, ils arrivent à partir de dix-sept heures ». [V][1]
17. Après la manifestation : **cortèges sauvages** de petits groupes très mobiles qui renversent et incendient des poubelles, « jouant au jeu du chat et de la souris avec les forces de l'ordre ». [V][1]
18. Blessures les plus fréquentes chez les policiers : **tête** (projectiles), **genoux**, **oreilles** (détonations). [V][1]
19. La « **manifestation de papier** » (ce que journalistes, médias militants et réseaux sociaux en retiennent) est un enjeu pour tous les camps ; les images de violence relancent la mobilisation. [V][4]
20. Une **émeute nocturne** n'est pas une manifestation : pas de cortège, pas d'organisateur, petits groupes, guets-apens, mortiers d'artifice tirés en rafale, pillages ciblés. [V][3]

---

## 1. Chronologie type d'une manifestation déclarée à Paris

### 1.1 Les étapes, de la déclaration à l'après-manifestation

| # | Étape (phase du contrat) | Ce qui se passe | Durée ou heure réelle | Fiab. |
|---|---|---|---|---|
| 1 | Déclaration | Dépôt à la préfecture de police, « trois jours francs au moins et quinze jours francs au plus » avant ; récépissé (voir 01 §2.7). | J−15 à J−3 | [V][8] |
| 2 | Concertation | Parcours discuté avec le directeur du service d'ordre ; un itinéraire peut être refusé et remplacé (exemple jugé en 2025 : rassemblement statique à République à partir de 12 h, puis cortège entre 17 h et 21 h). | J−10 à J−1 | [V][8] ; exemple [S][41] |
| 3 | Préparation de la voie | Information des commerçants, enlèvement des véhicules, neutralisation des conteneurs à verre et des chantiers, fermeture de stations de métro ; les commerces à risque baissent le rideau ou posent des panneaux de bois. | J−1 et matin du jour J | [V][8] ; rideaux et panneaux [E] |
| 4 | Contrôles aux abords | Fouilles et contrôles sur réquisition du procureur autour du point de rassemblement : « Nous sommes très contrôlés pour accéder au point de rassemblement […] même en portant les chasubles et les drapeaux de nos organisations ». Le point d'**arrivée**, lui, est peu filtré : « il est particulièrement simple de rejoindre le point d'arrivée, parfois même avant le démarrage du cortège ». | H−3 à H | [V][1] |
| 5 | Rassemblement (`rassemblement`) | Camions sono, ballons, drapeaux, prises de parole, mise en place de la banderole de tête et du service d'ordre. Ambiance bruyante, **aucune violence**. | H−2 à H (exemple : dès 12 h pour un départ à 14 h) | [V][1] ; horaires [S][25] |
| 6 | Départ (`depart`) | Le carré de tête s'ébranle ; devant lui, le précortège est déjà parti ou se forme. | H (souvent **14 h**) | [S][25] |
| 7 | Marche (`cortege`) | Slogans, sono, arrêts fréquents. Les forces de l'ordre restent à distance, sauf en tête de cortège. Le bloc radical se forme **pendant** cette phase. | 3 à 5 h pour 3 à 4,5 km | durée [E] (§1.4) ; reste [V][1] |
| 8 | Arrivée et dispersion (`dispersion`) | Les organisateurs annoncent la fin ; les blocs se défont, les camions repartent ; **afflux d'opportunistes** ; le lieu d'arrivée devient le point chaud. | de H+4 à H+6 (exemple : arrivée prévue 19 h, tête arrivée vers 18 h) | [V][1] ; exemple [S][25] |
| 9 | Après-manifestation (`apres_manif`) | Cortèges sauvages dans les rues adjacentes, feux de poubelles, vitrines, pillages, affrontements par petits groupes. | 2 à 5 h (exemple : retour au calme progressif vers 23 h, avec encore plusieurs centaines de personnes par grappes) | [S][25] |
| 10 | Retour à la normale (`terminee`) | Nettoyage, réouverture des stations, bilan. Exemple extrême : 461 agents de propreté et 900 m³ de déchets évacués le lendemain. | nuit et lendemain | [S][20] |

- Déclaré ne veut pas dire calme, et non déclaré ne veut pas dire violent : participer à une manifestation simplement non déclarée n'est pas une infraction (voir 01 §2.7). [V][8]
- Les **rassemblements spontanés** du soir (sans parcours, sans organisateur) suivent un autre schéma : attroupement sur une place, feux, dispersion, puis « déambulations dans les centres urbains ». Treize rassemblements non déclarés ont eu lieu à Paris entre le 16 mars et le 3 mai 2023. [V][1]

### 1.2 Ordre du cortège, de l'avant vers l'arrière (complète 02 §6.1)

| Rang | Élément | Description observable | Longueur indicative | Fiab. |
|---|---|---|---|---|
| 0 | Forces de l'ordre de tête | Seules unités visibles : « Les policiers demeurent éloignés et ne sont généralement pas présents, sauf en tête de cortège. » Elles reculent au rythme du cortège et ouvrent la route. | 50 à 150 m devant | présence [V][1] ; distance [JEU] |
| 1 | Précortège (« cortège de tête ») | « nébuleuse » hétérogène, sans banderole officielle : personnes en gilet jaune, sympathisants, « individus habillés de vestes foncées à capuche » au visage en partie masqué, lycéens, étudiants. « Ce groupe est bruyant, agité, mais dans un premier temps non violent. » | 100 à 600 m | [V][1] ; longueur [E] |
| 2 | Bloc radical (quand il existe) | Groupe compact, noir, masqué, derrière une ou plusieurs banderoles rigides, **à l'intérieur** du précortège, rarement tout devant : le 1er mai 2018, « au moins un millier de personnes » se trouvaient entre le bloc et la police. | 30 à 80 m | [V][1] ; exemple [S][22] ; longueur [E] |
| 3 | Zone tampon | Espace que le service d'ordre laisse entre le précortège et le carré de tête. | 20 à 60 m | [JEU] |
| 4 | Service d'ordre | « Après le cortège de tête, trois épaisseurs de gros bras syndicaux forment désormais une sorte de couloir hermétique. » Chaînes humaines, brassards. | 3 rangs en travers + 2 files latérales | [V][1] |
| 5 | Équipe de liaison de la police | Au moins deux policiers au contact des organisateurs (voir 01 §2.4). | — | [V][8] |
| 6 | Carré de tête | Banderole de tête, responsables, photographes devant. | 15 à 30 m | [S][8] |
| 7 | Blocs des organisations | Chaque bloc : camion sono roulant au pas, ballon, drapeaux, animateur au micro. | 40 à 150 m par bloc | [S][8] ; longueur [E] |
| 8 | Cortèges divers | Associations, collectifs, familles, cortège de la jeunesse, fanfares. | variable | [E] |
| 9 | Fin de cortège | Derniers marcheurs, véhicules de la propreté, forces de l'ordre de queue. | — | [E] |
| — | Sur les flancs | Forces « très loin » dans les rues adjacentes, prêtes à « agir très vite » ; module parisien : deux unités et un commissaire suivant le cortège par les rues parallèles, intervention à pied en moins de 30 s (02 §1.6). | 1 rue d'écart | [V][1][8] |

- Effectif du service d'ordre : 40 à 50 personnes en chasuble pour un millier de manifestants attendus (cas jugé à Paris), soit **4 à 5 %** ; 150 personnes pour une grande marche parisienne encadrée par 2 000 policiers et gendarmes. [S][41]
- Le service d'ordre a changé de rôle : il « cherche dorénavant à éviter que les débordements ne touchent » ses manifestants et n'a « plus l'ambition d'expulser les black blocs » ; ses troupes sont « vieillissantes et clairsemées alors que les black blocs sont très mobiles ». [V][1]
- Un bloc de 1 000 personnes peut **arrêter le défilé** : « Si le black bloc souhaite arrêter le défilé, il peut le faire. » Sous la pression policière, il peut aussi **refluer dans le cortège** ; « des éléments du black bloc ont même pénétré dans le carré de tête ». [V][1]
- Quand le cortège est trop dense, la préfecture ouvre des **parcours de délestage** (voies parallèles) qui évitent « la création d'îlots fixes ». [V][1]

### 1.3 Effectifs réels (journées nationales d'action du printemps 2023)

Source : tableau du ministère de l'intérieur reproduit dans le rapport parlementaire [V][1]. Les trois dernières colonnes sont calculées [E].

| Date | Manifestants France (police) | Manifestants Paris (police) | Forces mobilisées France | Dont Paris | Unités de forces mobiles | Manifestants « à risque » (France) | Interpellations (France) | Agents pour 100 manifestants à Paris [E] | Part « à risque » [E] | Interpellés pour 1 000 [E] |
|---|---|---|---|---|---|---|---|---|---|---|
| 23 mars 2023 | 1 089 000 | 119 000 | 10 500 | 4 000 | 83 | 5 100 | 428 | 3,4 | 0,47 % | 0,39 |
| 28 mars 2023 | 740 000 | 93 000 | 13 000 | 5 500 | 90 | 7 500 | 402 | 5,9 | 1,01 % | 0,54 |
| 6 avril 2023 | 570 000 | 57 000 | 11 500 | 4 200 | 79,5 | 4 400 | 271 | 7,4 | 0,77 % | 0,48 |
| 13 avril 2023 | 380 000 | 42 000 | 11 200 | 4 100 | 79,5 | 2 200 | 177 | 9,8 | 0,58 % | 0,47 |
| 1er mai 2023 | 782 000 | 112 000 | 11 600 | 4 300 | 74,5 | 3 600 | 540 | 3,8 | 0,46 % | 0,69 |

| Autre repère | Valeur | Fiab. |
|---|---|---|
| Total des cinq journées | 3 561 000 manifestants, 3 339 interpellations (rassemblements du soir compris), « soit environ un individu pour mille manifestants » | [V][1] |
| Avant le tournant du 16 mars 2023 | 8 journées, ≈ 835 000 manifestants et ≈ 77 interpellations en moyenne ; 200 à 600 manifestants « à risque » | [V][1] |
| Rassemblements du soir (16, 18, 20 mars 2023…) | 1 521 interpellations en dehors des cortèges déclarés | [V][1] |
| Précortège parisien | « entre 2 000 et 12 000 personnes » | [V][1] |
| 1er mai 2018 à Paris | 14 500 personnes dans le précortège, dont au moins 1 200 en bloc noir (8 %), devant un cortège syndical de 20 000 | [V][6] ; [S][22] |
| Province (Bordeaux, 26 rassemblements) | de 35 à 18 500 participants ; groupes violents de 15 à 200 personnes | [V][1] |
| Manifestation de taille moyenne (Nantes) | 6 000 personnes, dont 150 « à risques » et 500 qui les soutiennent | [V][1] |
| Trois chiffres pour un même cortège | 23 mars 2023 à Paris : 119 000 (préfecture), « au moins 83 000 » (comptage indépendant pour un collectif de médias), 800 000 (organisateurs). 31 janvier 2023 : 87 000, 55 000, 500 000. | [S][25][35] |
| Méthodes de comptage | Préfecture : fonctionnaires postés en hauteur à deux endroits du parcours, compteur à main actionné à chaque ligne de manifestants, vidéo pour recomptage. Comptage indépendant : deux capteurs à une fenêtre tracent une ligne virtuelle en travers de la rue et comptent les franchissements, recomptage manuel sur vidéo. | [S][7][35] |

### 1.4 Allure, densité, débit

| Grandeur | Valeur | Fiab. |
|---|---|---|
| Vitesse libre d'un piéton | **1,34 m/s** (4,8 km/h), écart-type 0,26 à 0,37 m/s ; 1,04 m/s pour des promeneurs, 1,45 m/s pour des navetteurs | [A][13] |
| Densité à l'arrêt complet | 5,4 personnes/m² dans le diagramme de référence ; 3,8 à 10 selon les études | [A][13] |
| Parcours réel de référence | 23 mars 2023 : Bastille → Opéra par les Grands Boulevards, départ 14 h, arrivée prévue 19 h, tête de cortège arrivée vers 18 h ; longueur ≈ 4,4 km (mesure approximative, à recalculer sur le graphe de la carte) | [S][25] ; longueur [E] |
| **Allure moyenne de la tête** | 4,4 km en ≈ 4 h → **≈ 1,1 km/h (0,3 m/s)**, arrêts compris | [E] |
| Allure en marche (entre deux arrêts) | 0,6 à 0,9 m/s (2 à 3 km/h) ; aucune mesure publiée trouvée | [JEU] |
| Rythme selon le type de cortège | Un cortège spontané de type « gilets jaunes » marche nettement plus vite qu'un cortège intersyndical (constat du comptage indépendant, sans chiffre) | [S][35] |
| Débit et densité moyens | 119 000 personnes passant en ≈ 4,5 h → ≈ 26 000 par heure, soit ≈ 7 personnes/s ; divisé par 25 m de chaussée utile × 0,5 m/s au point de passage (deux hypothèses) → **≈ 0,6 personne/m²** en moyenne sur toute la longueur | [E] |
| Longueur totale déduite | 119 000 ÷ (0,6 × 25) ≈ 8 km : plus long que le parcours. **La tête arrive avant que la queue soit partie.** | [E] |
| Densité par type de zone | cortège aéré (familles, fin de cortège) 0,3 à 0,8 ; blocs avec camion 1 à 2 ; carré de tête et bloc compact 2 à 3 ; rassemblement serré devant une tribune 3 à 4 | [JEU] calé sur [A][13][14] |
| Seuils de risque (science des foules) | foule **en mouvement** : l'écoulement se dégrade vers 2 à 3 personnes/m² ; foule **immobile** : risque au-delà de 4 à 5 ; ondes de choc et effondrements en chaîne au-delà de 5 ; pression d'écrasement vers 7 à 10 | [S][14] |
| Écoulement par une porte de 1 m | 0,73 personne/s pour une vitesse désirée de 0,8 m/s | [A][12] |

### 1.5 Parcours proposés dans l'emprise du jeu [JEU]

Le schéma national montre des zones parisiennes interdites aux manifestants (Champs-Élysées, Assemblée nationale, Trocadéro, tour Eiffel, Notre-Dame… voir 01 §2.4) : un cortège **déclaré** n'y passe pas ; ce sont des lieux de rassemblements **non déclarés ou interdits**. Longueurs approximatives [E], à recalculer avec le graphe routier.

| Parcours déclaré fictif | Itinéraire | Longueur | Durée réelle à 1,1 km/h |
|---|---|---|---|
| « Court » | Hôtel de Ville → rue de Rivoli → rue Saint-Antoine → Bastille | ≈ 1,4 km | ≈ 1 h 15 |
| « Classique » | République → boulevard du Temple → boulevard Beaumarchais → Bastille | ≈ 1,7 km | ≈ 1 h 30 |
| « Grands Boulevards » | République → Grands Boulevards → Opéra | ≈ 2,7 km | ≈ 2 h 30 |
| « Grande journée » | Bastille → République → Grands Boulevards → Opéra | ≈ 4,4 km | ≈ 4 h |
| Rassemblements | déclaré et statique : République, Bastille, parvis de l'Hôtel de Ville, esplanade des Invalides ; non déclaré, le soir : Concorde, abords des Champs-Élysées, Hôtel de Ville | — | 2 à 5 h |

### 1.6 Compression du temps pour les durées de mission [JEU]

| Phase | Part de la durée | 10 min | 25 min (standard) | 45 min | Temps réel |
|---|---|---|---|---|---|
| `rassemblement` | 12 % | 1 min 10 | 3 min | 5 min 30 | 60 à 120 min |
| `depart` | 4 % | 25 s | 1 min | 1 min 50 | 10 à 20 min |
| `cortege` | 44 % | 4 min 25 | 11 min | 19 min 50 | 180 à 300 min |
| `dispersion` | 16 % | 1 min 35 | 4 min | 7 min 10 | 30 à 60 min |
| `apres_manif` | 24 % | 2 min 25 | 6 min | 10 min 40 | 120 à 300 min |

`tension` et `affrontement` ne sont pas des tranches de temps : ce sont des **états** que le directeur superpose à `cortege`, `dispersion` ou `apres_manif`. La mission ne se termine que lorsque la foule présente est sous un seuil (par exemple moins de 5 % de l'effectif initial dans le périmètre) : tant que des groupes restent, la phase `apres_manif` se prolonge.

Textes d'ambiance proposés [JEU] (génériques, sans nom de personne, de parti ni de syndicat) :

| Situation | Texte exact |
|---|---|
| Slogans de marche | « Tous ensemble, tous ensemble ! » · « Retrait ! Retrait ! Retrait du projet ! » · « On ne lâche rien ! » · « Et la rue, elle est à qui ? Elle est à nous ! » |
| Animateur du camion sono | « On avance tranquillement, on reste groupés derrière la banderole ! » |
| Service d'ordre | « On serre les rangs, on ne répond pas aux provocations. » |
| Annonce de dispersion par les organisateurs | « La manifestation est terminée. Merci à toutes et à tous. Dispersez-vous dans le calme par les rues indiquées. » |
| Foule effrayée | « Ne poussez pas ! » · « Il y a des enfants ! » · « Laissez-nous sortir ! » · « Médic ! Médic ! » |
| Foule en colère (sans insulte) | « Laissez-nous passer ! » · « Libérez nos camarades ! » · « Honte à vous ! » |

> **Ce que le jeu doit reproduire — Chronologie**
> - Une manifestation a **cinq temps** (rassemblement, départ, marche, dispersion, après-manifestation) ; les violences ne commencent **jamais** au rassemblement et culminent à l'arrivée et après.
> - Le cortège est une **file très longue et peu dense** (≈ 0,6 personne/m²) qui avance à **≈ 1 km/h** avec des arrêts ; seuls le carré de tête et le bloc sont compacts.
> - Les forces de l'ordre sont **invisibles** tant que tout va bien (rues parallèles), sauf en tête ; le joueur CRS passe d'abord du temps à suivre, attendre et observer.
> - Ordres de grandeur à respecter dans les scénarios : 3 à 10 agents pour 100 manifestants, 0,5 à 1 % de violents, 1 interpellation pour 1 000 manifestants, service d'ordre de 4 à 5 %.
> - Le point de **départ** est filtré, le point d'**arrivée** ne l'est pas : c'est par là qu'entrent les opportunistes.
> - Le compte rendu de fin de mission affiche **trois comptages** (préfecture, organisateurs ×3 à ×7, indépendant ×0,6 à ×0,7 du chiffre préfecture).
> - Si le cortège est stoppé (bloc, intervention), la densité monte derrière : prévoir l'ouverture d'un **parcours de délestage** comme action du commandement.

---

## 2. Typologie des participants et comportements observables

### 2.1 Les profils

| Profil (identifiant) | Qui | Comportement observable par temps calme | Comportement quand la tension monte | Fiab. |
|---|---|---|---|---|
| **Manifestant pacifique** (`pacifique`) | La masse du cortège : salariés, retraités, étudiants, venus seuls ou en petits groupes d'amis. | Marche au pas, chante, discute, filme, s'arrête aux arrêts, fait des allers-retours vers les trottoirs. | S'écarte des violences, cherche une rue latérale ; « incommodés par les gaz lacrymogènes » ; peut être blessé par les projectiles d'autres manifestants. S'il se sent **visé à tort**, il reste, hue, filme, protège les violents (§5). | [V][1] ; [A][9] |
| **Famille, personne âgée** (`famille`) | Parents avec enfants ou poussette, personnes âgées ; surtout en milieu et fin de cortège. | Lents, s'arrêtent souvent, restent sur les trottoirs. | Partent au premier signe (détonation, fumée) ; les plus vulnérables au gaz et aux mouvements de foule. Une question parlementaire décrit des enfants pris dans un nuage sur une aire de jeux. | départ précoce [JEU] ; exemple [S][5] |
| **Militant d'organisation** (`militant`) | Adhérents en chasuble derrière leur camion. | Suit les consignes du service d'ordre, porte drapeaux et banderoles, reprend les slogans du micro. | Reste groupé derrière son camion, accélère ou bifurque sur consigne. « Une partie des syndiqués de base ne voit pas [les blocs] d'un mauvais œil. » | [V][1] |
| **Service d'ordre** (`service_ordre`) | Militants désignés, brassard ou chasuble ; 4 à 5 % de l'effectif d'un cortège organisé. | Chaînes humaines autour du carré de tête et des camions, canalise, dialogue avec l'équipe de liaison de la police. | Ferme les rangs, fait accélérer ou dévier son cortège, **ne s'interpose plus** contre le bloc ; peut lui-même être pris pour cible. | [V][1] ; part [S][41] |
| **Meneur, animateur** (`meneur`) | Animateur au micro du camion ; responsables du carré de tête. | Lance les slogans, donne le tempo de la marche, annonce la dispersion. | Appelle au calme, relaie les consignes de sortie. | [E] |
| **Meneur du bloc** (`meneur`) | « Des chefs de file peuvent être présents dans le bloc pour orienter les plus déterminés, souvent à l'aide de mégaphones. » | Discret dans la nébuleuse de tête. | Donne le signal de formation, désigne les cibles, ordonne le repli. | [V][1] |
| **Noyau radical aguerri** (`radical`) | « individus très organisés, appartenant à un groupe préconstitué », en **groupes affinitaires** « inégalement structurés » ; noyaux durs locaux de 20 à 80 personnes. | « souvent présents dès le début de la manifestation », mêlés au précortège, tenue ordinaire. | Se change en noir, se masque, forme le bloc derrière les banderoles, agit par séquences brèves puis pratique le « retrait immédiat […] dès l'intervention des forces de l'ordre » ; en fin de manifestation, « retrait rapide […] destiné à éviter les interpellations ». | [V][1] |
| **Déterminé qui reste** (`radical`, variante tenace) | Héritiers des mouvements sans organisateur (« ultra-jaunes ») ; moins organisés, visage souvent découvert. | En tête, bruyants, parfois en gilet. | Ne se replient pas : « maintien sur les lieux […] propice à des dégradations et à des affrontements avec les forces de l'ordre ». | [V][1] |
| **Suiveur entraîné** (`opportuniste`) | Lycéens, étudiants, jeunes adultes sans affiliation, « qui attendent que quelque chose se passe avec, parfois, une forme d'impatience » ; « ce sont nos enfants qui décident, à un moment, de se joindre ». | Curieux, proches du bloc, filment. | Imite : ramasse et lance, renverse une poubelle, casse une vitre et publie la vidéo. « moins rompus aux techniques de l'action violente, ce qui facilite leur interpellation ». Certains disent ensuite avoir été « entraîné[s] par le mouvement de foule ». | [V][1] |
| **Pilleur** (`pilleur`) | Délinquance d'opportunité, sans motif revendicatif : les « surfeurs de la manifestation ». Marginaux en nombre selon la préfecture de police. | Absents du cortège ; arrivent par le point d'arrivée, vêtus de noir eux aussi. | « plutôt en fin de manifestation, sur les lieux de dispersion » ; profitent de la confusion pour forcer une vitrine, se servir et fuir (y compris par le métro). | [V][1] |
| **Guetteur** (sous-rôle du `radical`) | « Des militants en retrait évaluent le dispositif du maintien de l'ordre. » | Sur les flancs et en avant, à pied ou en trottinette ; parfois un drone. | Renseigne le bloc par talkie-walkie ou messagerie ; signale les unités qui approchent. | [V][1] |
| **Badaud, passant** (`passant`) | Personnes présentes par hasard ou par curiosité. | Regarde depuis le trottoir, filme au téléphone. | Tarde à partir, se fait surprendre par le gaz ; les policiers peinent à distinguer « journalistes ? Curieux ? Manifestants ? ». | [V][4] |
| **Touriste** (`touriste`) | Visiteurs aux abords des monuments et des grands magasins. | Photographie le cortège, traverse au mauvais endroit. | Ne comprend ni les annonces ni les sommations ; à guider vers une sortie. | [JEU] (aucune source) |
| **Riverain** | Habitants aux fenêtres et aux balcons, dans les halls. | Regarde, filme, parfois applaudit ou proteste. | Ferme les volets ; en danger si un feu de poubelles gagne la façade : 23 personnes évacuées d'un immeuble dans un cas, une femme et son bébé secourus au 2e étage dans un autre. | [V][2] ; [S][23] |
| **Commerçant** (`commercant`) | Gérants et employés des boutiques du parcours. | Prévenus à l'avance ; rideau baissé ou vitrine protégée pour les enseignes exposées, terrasses rentrées. | Baisse le rideau en urgence, appelle la police, éteint un début de feu ; victime de pillage. | information préalable [V][8] ; reste [E] |
| **Street medic** (`street_medic`) | Secouristes bénévoles, « formés sur le tas » pour beaucoup ; en équipes. | Marchent dans ou près du précortège, sac au dos. | Vont vers les blessés et les personnes gazées, rincent les yeux, pansent, mettent à l'abri, remettent les cas graves aux pompiers et au SAMU (§6.4). | [S][33] |
| **Observateur** (`observateur`) | Équipes associatives de 2 ou 3, chasuble et casque siglés. | Se présentent au dispositif, notent, filment, chronomètrent. | Restent pendant la dispersion à l'écart des manifestants ; documentent sommations, tirs, interpellations (§7). | [S][27] ; droit de rester [V][8] |
| **Journaliste, vidéaste** (`journaliste`) | Presse, télévisions avec agents de protection, vidéastes indépendants qui diffusent en direct. | Circulent partout, devant la banderole de tête, entre les lignes. | Se portent **vers** l'incident ; pris à partie par des manifestants violents, parfois bousculés par des policiers (§7). | [V][1][8] |

### 2.2 Qui se fait interpeller (profils réels)

| Constat | Valeur | Fiab. |
|---|---|---|
| Profil dominant | « Ceux que nous arrêtons sont généralement inconnus des services de renseignement. […] Ils ont, pour leur grande majorité, de 20 à 28 ans, avec un profil étudiant […]. Ils sont quasi exclusivement de nationalité française, dont un bon tiers de jeunes femmes. » | [V][1] |
| Échantillon (Bordeaux, 85 gardes à vue) | 13 femmes, 10 mineurs, 35 personnes de 19 à 23 ans ; le plus jeune 16 ans, le plus âgé 53 ans ; presque aucun antécédent | [V][1] |
| Âge | 91 % de majeurs parmi les 3 189 personnes placées en garde à vue au printemps 2023 ; pour comparaison, aux émeutes de l'été 2023 : un tiers de mineurs parmi 3 500 interpellés, moyenne d'âge 17-18 ans, ≈ 60 % sans antécédent | [V][1][3] |
| Conséquence | Les militants aguerris sont rarement pris ; ce sont les suiveurs, moins mobiles et moins prudents, qui sont interpellés. | [V][1] |

### 2.3 Composition proposée par type de scénario [JEU]

Parts en pourcentage de l'effectif de manifestants. Repères vérifiés : 0,5 à 1 % de manifestants « à risque » en moyenne nationale (§1.3), 3,5 % en bloc noir le 1er mai 2018, ≈ 15 % le 16 mars 2019 ; les scénarios tendus forcent volontairement le trait. `volatility` déplace les suiveurs vers les radicaux.

| Profil | Marche calme | Journée nationale tendue | Samedi sans organisateur | Rassemblement spontané du soir | Soir de match |
|---|---|---|---|---|---|
| `pacifique` | 62 | 59 | 60 | 55 | 78 (supporters) |
| `famille` | 10 | 5 | 3 | 0 | 6 |
| `militant` | 20 | 20 | 5 | 8 | 0 |
| `service_ordre` | 5 | 4 | 0 | 0 | 0 |
| `meneur` | 0,5 | 0,5 | 0,5 | 0,5 | 0 |
| `opportuniste` (suiveur) | 2 | 8 | 20 | 25 | 10 |
| `radical` | 0,3 | 2 | 10 | 8 | 2 |
| `pilleur` (arrive en fin) | 0,2 | 1,5 | 1,5 | 3,5 | 4 |
| Tiers pour 1 000 manifestants | 4 journalistes, 2 observateurs, 3 street medics | 8 / 3 / 6 | 10 / 3 / 8 | 8 / 2 / 5 | 3 / 0 / 0 |

> **Ce que le jeu doit reproduire — Participants**
> - Au moins **huit comportements** distincts côté foule, plus les tiers ; le profil d'un personnage **évolue** en cours de mission (`pacifique` → `opportuniste` → `radical`), jamais d'un seul coup.
> - Le noyau radical est **petit, mobile et prudent** (agit 30 à 90 s, se replie, se rechange) ; les suiveurs sont **nombreux, maladroits et interpellables** ; les pilleurs sont **tardifs** et entrent par le point d'arrivée.
> - Un PNJ violent n'apporte rien avec lui : il **ramasse sur place** (§3.3).
> - Le service d'ordre protège **son** cortège, pas la rue : il n'attaque pas le bloc et ne remplace pas la police.
> - Passants, touristes, riverains et commerçants existent et **réagissent** ; ce sont les victimes collatérales qui coûtent le plus cher en image publique.
> - Interpeller au hasard dans le bloc ramène surtout des suiveurs sans antécédent : la qualité d'une interpellation dépend du **fait constaté** (voir 01 §6).

---

## 3. Mécanique de l'escalade

### 3.1 Déclencheurs

| Déclencheur | Ce que disent les sources | Effet à modéliser | Fiab. |
|---|---|---|---|
| Événement politique extérieur | Le 16 mars 2023 est « un tournant » : 200 à 600 manifestants « à risque » avant, 2 200 à 7 500 après ; les gardes à vue parisiennes passent d'une cinquantaine par journée à 256 le soir même. | Paramètre de scénario : colère de départ élevée, part de suiveurs multipliée. | [V][1] |
| Vidéo ou nouvelle d'un blessé grave | La diffusion d'une vidéo est tenue pour l'élément déclencheur des émeutes de 2023 ; les images de violence sont jugées entretenir la mobilisation. | Événement « rumeur » : hausse brutale de la colère, baisse de la légitimité perçue de la police. | [V][3][4] |
| Formation du bloc | Signal convenu puis regroupement (§3.2). | Passage de `cortege` à `tension`. | [V][1] |
| Intervention policière dans la foule | Toute action perçue comme indistincte soude la foule contre la police (§5). | Hausse de la peur **et** de la colère dans un rayon ; solidarisation. | [A][9] ; [V][4] |
| Arrêt du cortège | Le bloc ou une intervention stoppe la marche ; la queue pousse, la densité monte. | Hausse de la densité et de la frustration derrière le point d'arrêt. | [V][1] |
| Retrait des forces sans accalmie | « lorsque les forces de l'ordre se retirent désormais, elles sont encore prises à partie, ce qui […] les conduit souvent à pousser le black bloc pour le faire avancer plus vite ». | Le retrait n'apaise que si la colère locale est basse. | [V][1] |
| Fin officielle de la manifestation | Après l'ordre de dispersion des organisateurs, ceux qui restent forment un attroupement (01 §2.7). | Bascule juridique : les sommations deviennent possibles. | [V][8] |
| Arrivée des opportunistes | « à partir de dix-sept heures » ; « au début de la dispersion, un groupe a remonté l'avenue […] pour piller tous les magasins ». | Vague de `pilleur` à l'entrée en `dispersion`. | [V][1] |
| Cible symbolique sur le parcours | Banque, publicité, bâtiment public (§3.4). | Probabilité d'action du bloc augmentée à moins de 60 m d'une cible. | [S][19] ; distance [JEU] |
| Nuit et météo | Les rassemblements du soir concentrent près de la moitié des interpellations de la période. Météo : aucune source chiffrée trouvée. | Multiplicateur de volatilité après le coucher du soleil ; pluie : participation et durée réduites. | [V][1] ; météo [I] ; valeurs [JEU] |

### 3.2 Signes avant-coureurs (ce qu'un policier, un drone ou un journaliste peut voir avant les premiers jets)

| Signe observable | Détail | Avance sur les violences [JEU] | Fiab. |
|---|---|---|---|
| Nébuleuse de tête qui grossit | Plusieurs centaines de personnes devant la banderole officielle ; ≈ 2 000 observées dans une grande ville de province. | 20 à 60 min | [V][1] |
| Visages qui se couvrent | « masques chirurgicaux » et « lunettes de piscine », capuches. | 5 à 15 min | [V][1] |
| **Signal de ralliement** | « fumigènes noirs, l'ouverture d'un parapluie multicolore, des messages sur les réseaux sociaux cryptés ou tout autre signe de ralliement ». | 2 à 5 min | [V][1] |
| Regroupement compact | « Un groupe compact se forme alors dans la nébuleuse de tête. » | 1 à 3 min | [V][1] |
| **Changement de tenue** | « Des individus changent de tenue pour s'habiller de noir et cachent leur visage », souvent à l'abri de parapluies ou d'une bâche. | 1 à 3 min | [V][1] |
| Banderoles et parapluies déployés | « une ou plusieurs banderoles sont sorties pour protéger le black bloc » ; parapluies ouverts face aux caméras. | 0 à 2 min | [V][1] |
| Guetteurs en mouvement | Passages en trottinette, talkies-walkies, petit drone civil. | continu | [V][1] |
| Matériel sorti d'une cachette | « Du matériel peut être déposé la veille sur le parcours du défilé. » | 0 à 2 min | [V][1] |
| Dépavage et ramassage | Pavés descellés au pied-de-biche, chaussée « dépavée » par endroits ; fragments de mobilier, bouteilles des terrasses et des conteneurs. | 0 à 3 min | [S][38] |
| Mobilier déplacé | Barrières de chantier et bacs roulants tirés en travers de la chaussée. | 0 à 2 min | [S][38] |
| Journalistes repoussés | Parapluies ouverts devant les caméras, demandes d'effacer les images. | 0 à 5 min | [V][1] |
| Le service d'ordre serre les rangs, les rideaux tombent | Le cortège organisé ralentit pour se détacher du précortège ; les commerçants ferment en urgence. | 2 à 10 min | [E] |

### 3.3 Actions observables (niveau gameplay)

| Action | Qui | Avec quoi (ramassé sur place) | Effet observable | Paramètres proposés [JEU] | Fiab. |
|---|---|---|---|---|---|
| Jets de projectiles | `radical`, `opportuniste` | pavés et fragments, pierres, bouteilles, morceaux de mobilier ; plus rarement boules de pétanque | Blessures à la tête (« certaine vulnérabilité des visières »), aux genoux ; vitres brisées ; les projectiles courts retombent sur d'autres manifestants. | portée 15 à 30 m, cadence 1 jet toutes les 6 à 10 s par lanceur, dispersion ± 3 m à 20 m | [V][1] ; cotes [JEU] |
| Tirs de mortiers d'artifice, engins détonants | `radical`, émeutiers | tube tenu à la main ; « tirs en rafale », « individus abrités derrière des poubelles » | Projectile lumineux et sifflant en tir tendu, détonation, gerbe d'étincelles ; fait reculer une ligne, peut brûler et assourdir ; employés seulement quand le bloc est assez dense pour les faire circuler. Le « matériel détonant des black blocs » cause aussi des blessures auditives chez les policiers. | portée utile 30 à 60 m, 4 à 8 coups par tube, intervalle 1 à 2 s ; sursaut dans un rayon de 15 m | [V][1][3] ; cotes [I] → [JEU] |
| Engin incendiaire lancé | `radical` (rare) | bouteille enflammée | Flaque de feu à l'impact, panique locale, brûlures, embrasement d'un véhicule ou d'une barricade. Exceptionnel en cortège urbain selon un chercheur, attesté lors d'affrontements ruraux de 2023 et dans les scénarios d'entraînement des forces. | flaque Ø 2 à 3 m pendant 20 à 40 s ; fréquence très faible hors tension maximale | [S][19] ; [V][1][4] ; cotes [JEU] |
| Feu de poubelles | tous profils violents | bacs roulants, sacs, cartons ; fréquent pendant une grève du ramassage | Flammes de 1 à 3 m, fumée noire, chaleur ; risque de propagation aux façades et aux véhicules. 903 feux recensés à Paris en une seule journée selon le ministre. | allumage 5 à 10 s, durée 4 à 10 min, propagation à un objet voisin à moins de 1,5 m après 60 s | [V][1] ; chiffre [S][25] ; cotes [JEU] |
| Feu de véhicule | `radical`, émeutiers | voiture, deux-roues, trottinettes, vélos en libre-service entassés (les batteries éclatent) | Brasier de 3 à 5 m, fumée noire épaisse, détonations de pneus ; 112 véhicules concernés lors d'une journée de 2018. | embrasement complet en 2 à 4 min, durée 15 à 25 min | [S][20][23][38] ; cotes [JEU] |
| Barricade | bloc et suiveurs | barrières de chantier et barrières de police, bacs roulants, mobilier urbain, pavés, trottinettes et vélos, cabine ou remorque de chantier renversée | Obstacle de 1 à 1,5 m de haut, souvent incendié ; arrête un véhicule léger, ralentit une ligne à pied ; la police la dégage à la main, à l'engin lanceur d'eau ou au blindé. | montage 40 à 90 s à 6 personnes pour 8 m de large | [S][23][38] ; [V][1][8] ; cotes [JEU] |
| Bris de vitrine | `radical`, `opportuniste` | marteau, pavé, barre, panneau ; « petits marteaux » brise-vitre arrachés dans les bus | Vitre étoilée puis effondrée en 2 à 6 coups ; alarme. | 3 à 10 s par vitrine | [V][1] ; cotes [JEU] |
| Tag | `radical` | bombe de peinture | Inscription sur façade, mobilier, monument ; acte bref, souvent sous parapluie. | 4 à 8 s | [S][19][20] ; cotes [JEU] |
| Destruction de mobilier | tous profils violents | abribus, panneaux publicitaires, caméras, horodateurs, feux tricolores, kiosque | Verre brisé au sol (nouveaux projectiles), mâts abattus ; lors des émeutes, mâts de caméras mis à terre « de façon méthodique ». | abribus : 15 à 30 s | [S][19][38] ; [V][3] |
| Pillage | `pilleur`, suiveurs | — | Après le bris de vitrine : entrées et sorties rapides, objets emportés à bout de bras (biens faciles à revendre) ; fuite par les rues latérales et le métro. | 20 à 60 s par personne dans la boutique | [V][1][3] ; cotes [JEU] |
| Renvoi ou neutralisation des grenades | `radical`, suiveurs gantés | — | Palet fumant ramassé ou frappé du pied vers la ligne ; le nuage se déplace avec lui. Une réponse ministérielle évoque des grenades relancées sur les forces de l'ordre. Neutralisation (palet recouvert ou noyé) : aucune source lue, comportement demandé par le BRIEF. | fenêtre de 30 s (durée de fumée d'un palet, voir 02 §3.6) ; succès 60 % | [S][44] ; cotes [JEU] |
| Prise à partie des secours | minorité | — | Pompiers visés pendant l'extinction (cas signalés en 2018 et 2023), à l'inverse applaudis par la foule dans d'autres cas. | — | [S][20][33] ; [V][3] |

Couleurs utiles au rendu [E] : fumigène noir de ralliement `#1A1A1A` ; fumigène de cortège rouge `#D62828` ; flamme de poubelle cœur `#FFD27A`, bord `#FF7A00` ; fumée de plastique `#141414` s'éclaircissant en `#5A5A5A` ; étoiles de mortier rouge `#FF3B30`, vert `#34C759`, blanc `#FFFFFF`, or `#FFD60A`, traînée `#FFE08A` ; peinture de tag noir `#101010` ou rouge `#B3121B` ; verre brisé `#CFE3EA`.

### 3.4 Cibles visées en priorité

| Cible | Constat | Poids relatif proposé [JEU] | Fiab. |
|---|---|---|---|
| Forces de l'ordre et leurs véhicules | Objectif premier de certains groupes ; véhicules de police incendiés. | 10 | [V][1] ; [S][20] |
| Agences bancaires, assurances | Cibles constantes : 142 agences touchées en une journée (2018) ; 370 agences pendant les émeutes de 2023. | 9 | [S][19][20] ; [V][3] |
| Panneaux publicitaires, abribus | Cibles classiques du bloc. | 8 | [S][19] |
| Caméras de vidéoprotection, horodateurs | Visés pour l'anonymat et comme symboles. | 6 | [S][19] ; [V][3] |
| Restauration rapide, agences d'intérim, grandes enseignes | « symboles du capitalisme ». | 7 | [S][19] |
| Enseignes de luxe, grands magasins | Touchés surtout quand la foule est près des beaux quartiers (2018-2019) : boutiques et brasserie de prestige saccagées, grands magasins évacués. | 6 (10 dans les quartiers de luxe) | [S][20][23] |
| Bâtiments publics, permanences d'élus | 179 permanences parlementaires et 259 bâtiments publics dégradés au printemps 2023. | 6 | [V][2] |
| Chantiers, kiosques, deux-roues en libre-service | Réserve de matériel : barrières, palissades, engins ; combustible et matériau de barricade. | 5 | [S][23][26][38] |
| Bureaux de tabac, téléphonie, optique, alimentation, habillement | Cibles des **pilleurs** : 436 débits de tabac, ≈ 200 commerces alimentaires, ≈ 200 d'habillement, 118 opticiens en 2023. | 9 pour `pilleur`, 1 pour `radical` | [V][3] |
| Petits commerces indépendants, habitations | Selon une politologue, les blocs ne les visent pas ; touchés par accident ou par les pilleurs. | 1 | [S][19] |
| Monuments | Rare et retentissant : arc monumental tagué et saccagé (2018), monument commémoratif dégradé (2019). | 2 | [S][20][27] |
| Hôpitaux, écoles | Jamais une cible en manifestation ; un hôpital pour enfants a eu des vitres brisées en 2016 (grand retentissement) ; 243 écoles touchées pendant les émeutes de 2023. | 0 en manifestation | [S][28] ; [V][3] |

### 3.5 La « manifestation sauvage » et les petits groupes mobiles

| Trait | Description vérifiée | Fiab. |
|---|---|---|
| Naissance | À la dispersion, ou le soir sur appel en ligne ; des « citoyens en colère » venus du cortège sont « parfois entraînés par des individus masqués et vêtus de noir ». | [V][1] |
| Forme | Cortège non déclaré qui « a défilé de façon erratique, renversant et incendiant des poubelles sur son passage » (jusqu'à 1 900 personnes dans un cas). | [V][1] |
| Fragmentation | Les participants se déplacent « en plusieurs groupes très mobiles, mettant le feu ou renversant des poubelles, courant en tous sens » ; ces groupes « n'apparaissaient pas coordonnés ni structurés ». | [V][1] |
| Taille des groupes | De quelques dizaines à 150-300 personnes ; à Paris, des petits groupes ont cheminé pendant plusieurs heures en incendiant des dizaines de poubelles ; en 2019, un groupe remonte les Grands Boulevards vers République en brûlant poubelles et trottinettes, un autre gagne les Halles. | [V][1] ; [S][23][25] |
| Regroupement final | Les plus décidés se rejoignent sur un carrefour et dressent « une barricade enflammée » (≈ 150 personnes). | [V][1] |
| Difficulté policière | Pas d'organisateur à qui parler ; « Ces cortèges sauvages se sont dispersés dans les rues de la capitale en plusieurs endroits. Ils ont commis de nombreuses exactions. » ; nécessité d'unités très mobiles. | [V][1] |
| Fin de manifestation : trois invariants | pillages par des jeunes « eux aussi habillés en noir » ; « retrait rapide » des militants aguerris ; « maintien sur les lieux » des plus déterminés. | [V][1] |

### 3.6 Échelle de tension proposée [JEU]

| Niveau | `tension` | Phase | Ce que fait la foule | Ce que la police est fondée à faire (voir 01) |
|---|---|---|---|---|
| 0 Calme | 0,00–0,15 | `rassemblement`, `cortege` | Marche, slogans, musique. | Rester à distance, dialoguer. |
| 1 Agitation | 0,15–0,30 | `cortege` | Nébuleuse bruyante, huées, fumigènes de couleur, tags isolés. | Observer, renseigner, filmer ; équipe de liaison. |
| 2 Tension | 0,30–0,50 | `tension` | Signal, bloc formé, changement de tenue, premiers jets isolés, mobilier déplacé. | Se rapprocher, interpellations ciblées, information de la foule. |
| 3 Affrontement localisé | 0,50–0,70 | `affrontement` | Jets nourris sur une ligne, vitrines, feux de poubelles, barricade. | Riposte directe ou sommations puis refoulement, lacrymogènes à main. |
| 4 Affrontement généralisé | 0,70–0,85 | `affrontement` | Mortiers, barricades enflammées, véhicules en feu, cortèges sauvages, pillages. | Sommations réitérées, lanceurs, engin lanceur d'eau, unités motorisées. |
| 5 Émeute | 0,85–1,00 | `apres_manif` | Groupes dispersés sur tout le quartier, pillages en série, guets-apens. | Cadre « violences urbaines » : faire cesser les infractions. |

La tension **locale** (`tensionAt`) peut valoir 0,7 autour du bloc et 0,1 à 300 m dans le cortège organisé : c'est la situation normale.

> **Ce que le jeu doit reproduire — Escalade**
> - L'escalade est **lisible** : au moins 2 à 5 minutes de signes (signal noir, parapluie, changement de tenue, banderoles) avant les premiers jets ; le drone et le renseignement servent à les voir.
> - Les violents s'équipent **sur place** : la quantité de pavés, bacs, barrières, chantiers et deux-roues sur le parcours règle l'intensité possible (la préparation de la voie, 01 §2.7, la réduit).
> - Les actions sont **brèves et suivies d'un repli** ; le bloc se dissout en redevenant une foule ordinaire.
> - Les cibles sont **prévisibles et pondérées** : banques, publicité, abribus, caméras pour le bloc ; tabac, téléphonie, vêtements pour les pilleurs ; presque jamais le petit commerce ni l'habitation.
> - Les feux **se propagent** (poubelle → façade, véhicule → véhicule) et mettent en danger des riverains : l'extinction est une mission à part entière.
> - Après la dispersion, la manifestation **éclate** en groupes de 20 à 300 personnes qui courent, allument, et se regroupent autour d'une barricade : la mission continue tant qu'ils existent.
> - La tension est **locale** : punir tout le cortège pour ce qui se passe en tête est l'erreur que le jeu doit sanctionner.

---

## 4. Réponses des forces de l'ordre et leurs effets réels sur la foule

### 4.1 La logique d'ensemble, et sa contradiction interne

| Principe | Formulation de la source | Fiab. |
|---|---|---|
| Distance et discrétion | « Nous donnons de la distance. Nous ne nous rendons pas visibles. Nous n'intervenons qu'en cas d'exaction. Puis nous nous retirons. Par conséquent, nous demandons aux forces de l'ordre d'être très loin et d'agir très vite. » | [V][1] |
| Intervention brève puis retrait | « dès que les exactions commencent […] nous intervenons de manière mobile et réactive pour disperser les fauteurs de troubles et si possible les interpeller. Nous nous retirons ensuite le plus rapidement possible pour laisser le cortège se dérouler. » | [V][1] |
| Tradition française | Mise à distance, évitement du corps à corps, « montrer sa force pour ne pas avoir à l'exercer », et « ménagement permanent d'une porte de sortie aux manifestants ». | [S][15] ; [V][4] |
| Contradiction | « la volonté d'interpeller [..] suppose d'aller au contact physique alors que le principe du maintien de l'ordre est la mise à distance ». | [V][1] |
| Limite face à un gros bloc | « Il est très difficile d'agir sur un black bloc de 1 000 personnes, que ce soit pour une compagnie républicaine de sécurité, un escadron de gendarmerie mobile ou une compagnie » parisienne. | [V][1] |
| Visibilité | Pour une responsable syndicale, un « dispositif policier massif peut être ressenti comme une provocation » ; pour une chaîne de télévision, des forces « cachées dans les rues adjacentes » exposent davantage les journalistes aux violents. | [V][1] |
| Dommages collatéraux reconnus | Les organisateurs recensent trois incidents imputés aux forces (7 février, 11 et 23 mars 2023) : une charge sur le service d'ordre et deux fois « le carré de tête a été gazé ». | [V][1] |
| Lecture critique | Des chercheurs décrivent une « gestion très à distance » des événements jugés pacifiques et une « gestion très réactive voire brutale » des autres ; des organisations non gouvernementales estiment que la priorité donnée aux interpellations et aux armes intermédiaires « génèr[e] une escalade ». | [V][4] ; [S][15][16] |
| Lecture institutionnelle | Pour la commission d'enquête, « rien ne permet d'établir que le schéma national de maintien de l'ordre en vigueur soit à l'origine de l'exacerbation des tensions ». | [V][1] |

### 4.2 Manœuvres et moyens : effet recherché, effet observé

La géométrie exacte des manœuvres (distances, vitesses, formations) n'a pas été trouvée en source ouverte (voir 01, points incertains) : les effets ci-dessous décrivent la **réaction de la foule**. Colonne Δ : variation proposée de la tension locale par usage [JEU], dans le cas « justifié et annoncé » puis « sur une foule calme ou sans annonce ».

| Manœuvre ou moyen | Effet recherché | Effet sur les pacifiques | Effet sur le bloc | Risques | Δ tension locale [JEU] | Fiab. |
|---|---|---|---|---|---|---|
| Présence à distance (rues parallèles) | Ne pas servir de cible, laisser défiler. | Aucun ; sentiment de liberté. | Agit sans gêne jusqu'à l'intervention (délai ≥ 30 s). | Journalistes et commerces moins protégés. | −0,02 par minute | [V][1][8] |
| Présence massive visible | Dissuader. | Malaise, impression de provocation. | Cible disponible : jets plus précoces. | Tension inutile par temps calme. | +0,03 / +0,08 | [V][1] |
| Barrage fixe (interdiction d'un axe) | Protéger un lieu, tenir une limite. | S'arrêtent à distance, contournent ; frustration si le parcours déclaré est coupé. | Point d'affrontement choisi : jets, barricade en face. | Densité si la foule n'a pas d'autre issue. | 0 / +0,10 | [V][8] ; effet [E] |
| Canalisation latérale | Garder le cortège sur son parcours, isoler le précortège. | Acceptée si elle reste à quelques mètres ; vécue comme un encerclement si elle serre. | Gênée, cherche les rues non tenues. | Ressemble à une nasse mobile. | +0,02 / +0,10 | [S][40] ; effet [JEU] |
| Bond offensif (avance courte puis arrêt) | Reprendre 10 à 30 m, faire reculer. | Recul, début de fuite des plus proches. | Repli immédiat puis retour. | Sans effet durable si le terrain repris est rendu. | +0,03 / +0,12 | nom [S][8] ; effet [JEU] |
| Charge | Disperser, dégager, permettre une interpellation. | Fuite en courant, chutes, cris ; forte peur. | Éclatement en petits groupes, jets depuis les côtés. | Blessés au contact ; la charge sur des personnes calmes est l'archétype de la force « indiscriminée ». | +0,05 / +0,25 | [V][8] ; [A][9] |
| Vague de refoulement | Pousser tout un tronçon vers des issues ouvertes. | Avancent dans la direction imposée si les issues existent et sont annoncées. | Recule en lançant, se reforme plus loin. | Compression si les issues sont fermées. | +0,05 / +0,20 | nom [V][8] ; effet [JEU] |
| Lacrymogène (main, lanceur) | Tenir à distance sans contact. | Touche « de manière indifférenciée » ; toux, larmes, départ par les rues latérales ; colère si aucune violence n'était visible. | Peu d'effet sur des personnes équipées de lunettes et de masques ; palets renvoyés. | Vent, espaces clos, passants, enfants, terrasses, bouches de métro. | +0,04 / +0,20 | [V][5][8] ; [S][5][44] |
| Grenade assourdissante, de désencerclement | Dégager une unité menacée (voir 02 §3.1). | Sursaut, fuite ; blessures possibles par éclats. | Recul bref. | Blessures aux membres et au visage ; filmé, très commenté. | +0,06 / +0,30 | [V][8] ; blessures [S][33] |
| Engin lanceur d'eau | Faire reculer, éteindre feux et barricades. | Reculent hors de portée ; froid, chutes possibles. | Efficace à courte portée seulement (quelques dizaines de mètres) ; le bloc se décale. A dispersé « une grande partie des manifestants » d'une place en 2023. | Jet direct sur une personne proche. | +0,03 / +0,15 | [S][26][39] ; [V][8] |
| Tronçonnement | Couper le cortège pour isoler un groupe **en laissant une issue**. | Le tronçon arrière s'arrête et attend. | Isolé du reste, cherche à refluer dans la foule. | Segmentation du défilé, reflux du bloc dans le carré de tête. | +0,05 / +0,15 | [A][16] ; [V][1] |
| Encerclement (« nasse ») | Fixer un groupe violent pour l'interpeller. | Pris au piège avec les violents ; peur, colère, sentiment d'injustice. | Se fond parmi les pacifiques retenus. | Écrasement et suffocation si l'on gaze à l'intérieur ; passants retenus ; illégal sans violences graves ni sortie (01 §2.6). | +0,10 / +0,35 | [S][21] ; [V][8] |
| Interpellation ciblée par équipe dédiée | Retirer un auteur identifié. | Neutre si le fait a été vu ; indignation si la cible semble choisie au hasard. | Jets sur l'équipe ; le groupe tente de reprendre l'interpellé (comportement non sourcé, [JEU]). | « peut faire dégénérer la situation » ; gourmande en effectifs. | +0,02 / +0,20 | [V][4][8] |
| Unités motorisées | Rattraper les groupes mobiles, interpeller loin du cortège. | Peur au bruit des moteurs ; rejet si elles frappent des personnes calmes. | Dispersion rapide des petits groupes, fuite dans les passages et le métro. | Unité la plus contestée ; contact systématique. | +0,04 / +0,25 | [V][1] ; [S][42] |
| Contrôles préventifs massifs | Écarter objets et personnes avant le départ. | Files, agacement ; certains renoncent. | Arrivent sans rien, se servent sur place. | Jusqu'à plus de 1 000 interpellations en une journée (2018), plus de 15 300 contrôles (2019) ; critiqués comme empêchant de manifester. | +0,02 au départ | [S][24][43] ; [A][16] |
| Retrait | Laisser repartir le cortège. | Apaisement, reprise de la marche. | Avant 2023 : le précortège repart. Depuis : les forces « sont encore prises à partie » en se retirant. | Perçu comme une victoire par le bloc. | −0,10 / −0,02 | [V][1] |
| Dialogue par l'équipe de liaison | Informer organisateurs et foule. | « lorsque cet officier de liaison était facilement joignable, voire présent à nos côtés, un grand nombre de difficultés pouvaient être facilement réglées ». | Sans effet direct. | Inopérant sans organisateur. | montée de tension ×0,7 tant que le contact dure | [V][1][8] |
| Messages sonores, panneaux | Faire comprendre la manœuvre et les sorties. | Départ plus rapide et plus calme ; aujourd'hui, « un degré plus élevé d'audibilité est nécessaire ». | Aucun. | Inaudible dans le bruit. | −0,03 | [V][1] |
| Parcours de délestage | Désengorger. | Permet au cortège « d'avancer avec régularité ». | — | Ouvre des rues à surveiller. | −0,05 | [V][1] |
| Extinction (pompiers intégrés, engin lanceur d'eau) | Supprimer feux et fumées. | Soulagement ; pompiers parfois applaudis. | Rallume plus loin. | Pompiers pris à partie. | −0,04 | [V][8] ; [S][20][33] |

Journée extrême de référence (1er décembre 2018, Paris) : 7 940 grenades lacrymogènes tirées par les seules CRS, 800 à 1 000 grenades de désencerclement, 776 à plus de 1 000 tirs de lanceur de balles de défense, 136 000 à 140 000 litres d'eau projetés, pour 412 interpellations et 133 blessés. [S][20]

### 4.3 Gaz lacrymogène, vent et retour de gaz

| Constat | Détail | Fiab. |
|---|---|---|
| Effet indifférencié | « si l'effet d'une grenade lacrymogène peut toucher de manière indifférenciée un groupe de manifestants, ceux-ci ont pour point commun d'avoir voulu s'inscrire et se maintenir dans l'illégalité » (position du ministère). | [V][5] |
| Ceux qui partent sont encore touchés | « une exposition résiduelle au produit lacrymogène peut être subie par des manifestants qui quittent la zone ». | [V][5] |
| Le carré de tête peut être gazé | Deux cas recensés par les organisateurs au printemps 2023. | [V][1] |
| Sans vent, lieux clos | Sans vent, les fumées restent sur place et se concentrent (témoignage). L'usage dans ou près d'une station de métro est dénoncé pour ses effets sur les passants ; le ministère dit l'emploi « très encadré en milieu fermé ». | [S][44] ; [V][5] |
| Moindre effet sur le bloc | Lunettes et masques ; d'où l'usage accru de grenades assourdissantes contre les cortèges radicaux (02 §3.1). | [V][8] |
| Retour de gaz sur la troupe | Aucune source chiffrée ; les agents portent le masque (02). | [I] |

| Règle de simulation proposée [JEU] (cohérente avec 02 §3.6) | Valeur |
|---|---|
| Dérive du nuage | vitesse = vent × 0,8 ; diffusion latérale 0,3 m/s |
| Vent faible (< 5 km/h) | nuage stagnant 60 à 180 s : dose forte pour tous ceux qui restent, y compris la ligne policière si elle avance dedans |
| Vent de face pour la police (soufflant vers elle) | **retour de gaz** : le nuage atteint la ligne en `distance ÷ vitesse du vent` secondes ; agents sans masque : toux, visée dégradée pendant 20 s |
| Vent de travers | le nuage part dans une rue latérale : touche riverains, terrasses, cortège organisé |
| Rue étroite (< 12 m) | concentration ×2, durée ×1,5 |
| Pluie | durée ÷ 2 |
| Personne exposée | voir §6.3 |

### 4.4 Encerclement : ce qu'il produit

| Élément | Détail | Fiab. |
|---|---|---|
| Durées observées | Hambourg, 1986 : plus de 800 personnes retenues 9 h selon une source, 13 h selon une autre ; Londres, 2001 : environ 3 000 personnes pendant 7 h ; Lyon, 2010 : plusieurs centaines de personnes pendant plusieurs heures ; Paris, novembre 2019 : place fermée pendant plusieurs heures. | [S][21][27] ; [A][16] |
| Effets sur les personnes | Passants et pacifiques retenus sans issue ; risque d'écrasement ou de suffocation si des gaz ou des grenades sont employés à l'intérieur ; panique ou hostilité envers la police, mouvements de foule. | [S][21] |
| Droit | Annulation des premières dispositions par le Conseil d'État (10 juin 2021), validation du texte révisé (29 décembre 2023), condamnation de la France par la Cour européenne pour l'encerclement de Lyon (8 février 2024). | [S][21] ; règle en vigueur [V][8] |
| Règle de jeu | Voir 01 §2.6 : violences graves et imminentes, sortie contrôlée, information régulière, durée limitée. | [V][8] |

### 4.5 Interpellations ciblées et unités motorisées

| Point | Détail | Fiab. |
|---|---|---|
| Rendement réel | ≈ 1 interpellation pour 1 000 manifestants ; à Paris, 1 680 interpellations et 1 575 gardes à vue en sept semaines ; 951 places de garde à vue dans les commissariats parisiens. | [V][1] |
| Difficulté | Auteur masqué, changé, noyé dans la foule ; fiches d'interpellation incomplètes rédigées « sur le trottoir, au milieu du brouhaha ». | [V][1] |
| Solution recommandée | Caméras-piétons, équipes de captation vidéo dédiées, interpellation différée grâce aux images (« découpler constatation de l'infraction et interpellation »). En Allemagne, chaque interpellation est suivie de l'intervention d'une équipe de dialogue qui l'explique à la foule. | [V][1][4] ; [S][15] |
| Unités motorisées parisiennes | Créées en 2019 : binômes à moto « intervenant à Paris lors de manifestations violentes » ; ont par exemple interpellé dans le métro des pilleurs après une dispersion. | [V][1] |
| Controverse | Une pétition demandant leur dissolution a dépassé 100 000 signatures en 2023 ; le préfet de police a jugé des comportements filmés « inacceptables » tout en écartant la dissolution ; des avocats reprochent aux unités non spécialisées de créer « un désordre au lieu d'une désescalade » ; la commission d'enquête juge ne pas pouvoir dire que ces comportements sont représentatifs. | [S][42] ; [V][1] |

### 4.6 Ce qui apaise, ce qui radicalise

| Ce qui apaise | Source | Ce qui radicalise | Source |
|---|---|---|---|
| Forces à distance et peu visibles tant que rien ne se passe | [V][1] | Dispositif massif et serré autour d'une foule calme | [V][1] |
| Officier de liaison présent aux côtés des organisateurs | [V][1] | Officier de liaison injoignable : « tout est devenu tout de suite plus compliqué » | [V][1] |
| Manœuvre **annoncée et expliquée** (haut-parleur, panneau) | [S][15] ; [V][1] | Manœuvre non expliquée : « incompréhension », « colère », « hostilité » | [S][15] |
| Action **différenciée** : seuls les auteurs sont visés | [A][9] ; [S][15] | Action **indistincte** : gaz, charge ou nasse sur des personnes calmes | [A][9] ; [V][4] |
| Issue toujours ouverte et connue | [V][4] | Issues fermées, sommations à des gens qui ne peuvent pas partir | [S][21] |
| Intervention brève suivie d'un retrait | [V][1] | Contact prolongé, corps à corps, coups sur personne à terre | [S][15][16] |
| Interpellation d'un auteur que la foule a vu agir | [JEU] | Interpellation perçue comme arbitraire ; force employée contre des journalistes, des secouristes ou des observateurs | [S][27][32][33] |
| Extinction rapide des feux, secours visibles | [S][33] | Blessé grave, surtout filmé | [V][3][4] |
| Parcours respecté, délestage ouvert | [V][1] | Parcours coupé, cortège bloqué sans explication | [V][1] |
| Facilitation des buts légitimes (passage, prise de parole, images) | [V][4] ; [S][15] | Peur partagée : elle « légitime la résistance à ce qui est perçu comme une menace extérieure » | [V][1] |

> **Ce que le jeu doit reproduire — Réponses policières**
> - Chaque moyen a **deux effets** : tactique (terrain gagné, groupe dispersé) et psychologique (peur, colère, légitimité). Le second dépend de **qui est touché** et de **ce qui a été annoncé**.
> - Le même geste coûte quatre à cinq fois plus de tension s'il frappe une foule calme ou s'il n'a pas été précédé d'une annonce audible.
> - Le gaz obéit au **vent** : il revient sur la troupe, entre dans les rues voisines, atteint le carré de tête, les terrasses et les bouches de métro.
> - Le bloc **survit** au gaz (masques) et à la charge (repli, retour) ; ce qui le réduit, ce sont les interpellations fondées sur un fait filmé, immédiates ou différées.
> - L'encerclement retient surtout des pacifiques et des passants ; sans sortie ni information, il fait monter peur et colère chaque seconde.
> - La meilleure séquence est celle de la doctrine : **loin, vite, bref, puis retrait** ; le jeu la récompense, et il sanctionne l'occupation prolongée au contact.
> - Les rôles de commandement (commissaire, commandant) disposent d'actions d'**apaisement** aussi puissantes que les armes : maintenir la liaison, annoncer, ouvrir un délestage, faire éteindre, se retirer.

---

## 5. Psychologie des foules utile au jeu

### 5.1 Deux modèles opposés

| | Modèle ancien (Le Bon, 1895) | Modèle de l'identité sociale élaborée (ESIM : Reicher, Stott, Drury) |
|---|---|---|
| Idée | La foule est « intellectuellement inférieure à l'homme isolé » ; contagion ; des « meneurs » entraînent une masse sans jugement. | Les personnes gardent leur discernement ; elles agissent selon l'**identité de groupe** qu'elles se reconnaissent, et cette identité **change selon ce que fait la police**. |
| Consigne policière qui en découle | Intervenir tôt sur les « fauteurs de trouble » pour dissuader la masse. | Comprendre la foule, faciliter ses buts légitimes, communiquer, **différencier**. |
| Statut | « Toujours enseignée » en France ; jugée « discutable » par la commission d'enquête de 2023. | Fonde les réformes britanniques et les recommandations européennes sur les foules de supporters. |
| Fiab. | [V][1][4] | [A][9][10] ; [V][4] |

### 5.2 Le mécanisme de l'ESIM en cinq temps

| Temps | Ce qui se passe | Fiab. |
|---|---|---|
| 1. Foule hétérogène | Au départ, la foule est un assemblage de groupes aux intentions différentes ; une minorité seulement veut l'affrontement. | [A][9][11] |
| 2. Lecture policière | Les policiers savent la foule composite, mais en situation de conflit ils tendent à tenir tous ses membres pour également dangereux, et leurs tactiques rendent difficile de distinguer individus et sous-groupes. | [A][11] |
| 3. Action perçue comme illégitime et indistincte | Les participants jugent leurs propres actes légitimes ; une action dirigée contre ce que la police voit comme illégal peut être perçue par la foule « as illegitimate and indiscriminate ». | [A][9] |
| 4. Destin commun | « Since participants now have a common fate (and enemy), they come to share a social identity. » Les frontières du groupe se redessinent : les pacifiques se sentent du même côté que les violents. | [A][9] |
| 5. Pouvoir et légitimité | « This shared identity empowers the crowd to take action against the police, and their sense of grievance legitimises such action. » Certaines formes de maintien de l'ordre, « in particular, violent dispersal or containment », peuvent ainsi « radicalise and empower crowd members ». | [A][9] |

- Version française du même constat : « c'est une solidarisation entre, d'une part, des manifestants qui ne sont pas présents pour en découdre avec la police et, d'autre part, ceux qui sont venus spécialement pour cela, selon des logiques de situation ». [V][1]
- Le mécanisme est connu des groupes radicaux, qui provoquent pour obtenir une riposte indistincte. [V][4]
- La dynamique est **symétrique** : « la police devient plus ferme, plus violente parce que les manifestants sont plus violents. Et d'autre part, ces derniers se disent que, puisque la police est violente, ils doivent l'être aussi. » [V][1]
- En situation de danger collectif, la panique est l'exception : l'entraide entre inconnus est la règle (« collective resilience »). [A][9]

### 5.3 Principes de désescalade (modèle européen « KFCD », 2013)

| Principe | Contenu | Traduction en jeu |
|---|---|---|
| Connaissance (*Knowledge*) | Connaître les groupes, leurs buts, leurs lignes rouges ; informer les agents avant l'événement. | Briefing : composition attendue, cibles probables, groupes à risque. |
| Facilitation | Aider la manifestation à atteindre ses buts légitimes ; accès, départs, contacts. | Laisser passer, ouvrir un délestage, protéger le parcours. |
| Communication | Expliquer chaque manœuvre avant, pendant, après ; unités de dialogue ; haut-parleurs et écrans. | Annonces, équipe de liaison, panneaux. |
| Différenciation | Traiter individuellement ceux qui posent problème ; signaux clairs sur ce qui est toléré. | Interpellation ciblée plutôt que moyen de zone. |

Source : synthèse d'une organisation non gouvernementale à partir du projet européen dirigé par la police suédoise (2010-2013), confirmée par l'étude du Défenseur des droits [S][15] ; [V][4]. L'exemple le plus abouti est la « gestion négociée de l'espace public » belge, qui vise à « maintenir à un niveau bas le seuil de frustration des manifestants ». [V][4]

### 5.4 Physique des foules : valeurs de référence

| Grandeur | Valeur | Fiab. |
|---|---|---|
| Vitesse désirée pour sortir d'un lieu | ≈ 0,6 m/s détendu ; ≈ 1 m/s normal ; jusqu'à 1,5 m/s nerveux ; en panique, peut dépasser 5 m/s (jusqu'à 10 m/s) | [A][12] |
| Effet « plus vite, c'est plus lent » | Au-dessus de 1,5 m/s de vitesse désirée, bouchon en arche devant une issue étroite : l'évacuation ralentit. | [A][12] |
| Seuil de blessure dans la simulation de référence | pression de 1 600 N par mètre, atteinte pour une vitesse désirée d'environ 5 m/s ; des pressions de foule réelles jusqu'à 4 450 N/m sont citées | [A][12] |
| Paramètres du piéton simulé | masse 80 kg ; largeur d'épaules 0,5 à 0,7 m ; temps d'accélération 0,5 s | [A][12] |
| Mimétisme | Ni le comportement purement individuel ni le suivisme pur ne sont efficaces ; le meilleur est un mélange des deux. | [A][12] |
| Vitesse libre de marche | 1,34 m/s ; arrêt complet vers 5,4 personnes/m² | [A][13] |
| Densités dangereuses | en mouvement : au-delà de 2 à 3 personnes/m² ; à l'arrêt : au-delà de 4 à 5 ; effondrements en chaîne au-delà de 5 ; écrasement vers 7 à 10 | [S][14] |
| Distances interpersonnelles (proxémie) | intime < 0,45 m ; personnelle 0,45 à 1,2 m ; sociale 1,2 à 3,6 m ; publique au-delà de 3,6 m (bornes variables selon les auteurs) | [S][18] |
| Distance tenue face à une ligne de policiers, portée d'un jet à la main | **non trouvé** | [I] |

### 5.5 Paramètres proposés pour l'intelligence artificielle [JEU]

Tout ce qui suit est une **proposition de conception** calée sur les mécanismes vérifiés ; aucune de ces valeurs n'est une mesure réelle.

**Variables d'état**

| Variable | Porteur | Plage | Retour au repos | Sens |
|---|---|---|---|---|
| `peur` | personne | 0..1 | demi-vie 45 s (`pacifique`), 25 s (`radical`), 90 s (`famille`) | Pousse à s'éloigner. |
| `colere` | personne | 0..1 | demi-vie 180 s | Pousse à rester, huer, imiter. |
| `legitimite` | groupe ou tronçon de 50 m | 0..1, départ 0,7 (0,5 si `volatility` > 0,6) | +0,01 toutes les 10 s sans emploi de la force | Jugement porté sur l'action policière. |
| `cohesion` | groupe ou tronçon | 0..1, départ 0,3 | −0,01 toutes les 10 s | Sentiment de « destin commun » : amplifie la contagion. |

**Stimuli** (rayon autour de l'événement ; « justifié » = un acte violent a été visible à moins de 40 m dans les 60 s précédentes)

| Stimulus | Rayon | Δ `peur` | Δ `colere` | Δ `legitimite` | Δ `cohesion` |
|---|---|---|---|---|---|
| Sommation audible | 60 m | +0,10 | 0 | +0,05 | 0 |
| Annonce claire avant manœuvre | 60 m | −0,05 | −0,05 | +0,05 | 0 |
| Détonation (grenade, mortier) | 15 m | +0,35 | +0,05 | 0 | +0,05 |
| Gaz subi, justifié | nuage | +0,20 | +0,05 | −0,03 | +0,05 |
| Gaz subi, non justifié | nuage | +0,20 | +0,25 | −0,15 | +0,15 |
| Charge vue, justifiée | 30 m | +0,40 | +0,05 | −0,02 | +0,05 |
| Charge vue, non justifiée | 30 m | +0,40 | +0,30 | −0,20 | +0,20 |
| Pacifique frappé ou à terre | 25 m | +0,20 | +0,30 | −0,25 | +0,20 |
| Journaliste, secouriste ou observateur frappé | 25 m | +0,10 | +0,20 | −0,20 | +0,10 |
| Interpellation d'un auteur vu en train d'agir | 25 m | +0,05 | 0 (bloc : +0,10) | +0,05 | 0 |
| Interpellation d'une personne sans fait constaté | 25 m | +0,10 | +0,25 | −0,20 | +0,15 |
| Encerclement sans sortie | intérieur | +0,01 par seconde | +0,01 par seconde | −0,005 par seconde | +0,01 par seconde |
| Blessé grave visible ou rumeur relayée | 80 m, puis toute la foule en 60 s | +0,10 | +0,30 | −0,20 | +0,20 |
| Retrait des forces à plus de 80 m | 80 m | −0,20 | −0,10 | +0,03 | −0,05 |
| Feu éteint, blessé secouru par les forces | 30 m | −0,05 | −0,05 | +0,05 | 0 |

Contagion : toutes les 2 s, chaque personne rapproche sa `peur` et sa `colere` de la moyenne de ses voisins à moins de 5 m, d'une fraction `0,10 + 0,30 × cohesion`.

**Seuils de décision par profil**

| Profil | Recule | Quitte les lieux | Se solidarise (reste, hue, fait écran, filme) | Change de profil |
|---|---|---|---|---|
| `famille` | `peur` > 0,15 | `peur` > 0,25 | jamais | — |
| `pacifique` | `peur` > 0,40 | `peur` > 0,60 | `colere` > 0,60 et `legitimite` < 0,40 | → `opportuniste` si `colere` > 0,80, `legitimite` < 0,25 et un `radical` agit à moins de 15 m : 5 % de chances toutes les 10 s |
| `militant` | sur consigne du service d'ordre, ou `peur` > 0,45 | avec son bloc, ou `peur` > 0,65 | `colere` > 0,55 et `legitimite` < 0,40 | → `opportuniste` comme ci-dessus (3 %) |
| `service_ordre` | `peur` > 0,60 | avec le carré de tête | protège son cortège ; ne lance jamais | — |
| `opportuniste` | `peur` > 0,45 | `peur` > 0,65 ou unité à moins de 10 m | imite si 3 `radical` ou plus agissent à moins de 20 m et qu'aucune ligne n'est à moins de 25 m | → `radical` après 2 actions impunies et `colere` > 0,85 ; → `pacifique` si `peur` > 0,70 pendant 30 s |
| `radical` | unité qui avance à moins de 15 m | `peur` > 0,80 ou bloc réduit à moins de 15 personnes | agit si cible à moins de 60 m, ligne à plus de 20 m et 30 personnes ou plus à moins de 15 m pour le couvrir | se rechange (30 à 60 s à couvert) et redevient visuellement un `pacifique` |
| `pilleur` | unité visible à moins de 60 m | unité à moins de 40 m | n'agit que sur une vitrine déjà brisée, sans force à moins de 60 m | — |

**Distances tenues face à une ligne de policiers immobile**

| Situation | Distance au premier rang | Repère |
|---|---|---|
| Curieux et vidéastes par temps calme | 5 à 10 m | au-delà de la distance « publique » de 3,6 m [S][18] |
| Foule pacifique par temps calme | 8 à 15 m | — |
| Face-à-face verbal, sit-in | 1 à 3 m | seulement si `peur` < 0,2 |
| Service d'ordre faisant tampon | 3 à 5 m devant la foule | — |
| Bloc qui lance | 20 à 35 m | hors de portée du bâton, dans la portée du jet |
| Tireurs de mortiers | 30 à 60 m, derrière un obstacle | [V][3] pour l'abri |
| Pacifiques après la première grenade | 40 à 60 m, ou rue latérale | portée d'une grenade lancée à la main : 5 à 30 m (02 §3.2) |
| Tout le monde face à l'engin lanceur d'eau | plus de 40 m | portée utile 30 à 40 m (02 §4.2) |
| Journalistes | 5 à 15 m, sur le côté, jamais dans l'axe des jets | — |

**Vitesses de déplacement**

| Allure | `pacifique` | `famille` | `radical` | Policier équipé |
|---|---|---|---|---|
| Marche de cortège | 0,6 à 0,9 m/s | 0,5 à 0,7 | 0,8 à 1,0 | pas de la troupe 1,2 |
| Marche pressée (s'éloigner) | 1,5 à 1,8 | 1,1 à 1,4 | 1,8 | 1,6 |
| Trot (reculer devant un bond) | 2,5 à 3,5 | 1,8 à 2,4 | 3,5 | 2,5 à 3,0 |
| Course de fuite | 4,0 à 5,5 pendant 15 à 25 s | 2,5 à 3,5 | 5,5 à 6,5 pendant 30 à 40 s | 3,5 à 4,5 pendant 15 s (20 kg d'équipement) |
| Après la course | retour au trot puis à la marche ; essoufflement 20 à 40 s | idem, 60 s | 15 à 20 s | 30 à 45 s |

**Densité et compression**

| Densité locale | Effet |
|---|---|
| < 1 personne/m² | déplacement libre |
| 1 à 2 | vitesse × 0,8 ; on ne court plus en ligne droite |
| 2 à 3 | vitesse × 0,5 ; les bousculades font tomber (1 % de chances par seconde de course) |
| 3 à 4 | vitesse × 0,25 ; `peur` +0,02 par seconde ; cris « Ne poussez pas ! » |
| 4 à 5 | quasi-immobilité ; `peur` +0,05 par seconde ; chutes en chaîne possibles ; premiers malaises après 60 s |
| > 5 | blessures par compression (1 personne toutes les 10 s par tranche de 50 personnes) ; faute grave pour le commandement qui a fermé les issues |

### 5.6 Mouvements de foule, compression, panique

- Les morts de foule viennent de la **densité**, pas de la panique : la pression se transmet de l'arrière, où l'on ne voit rien, vers l'avant, où l'on ne peut plus bouger. [S][14]
- Un flux qui fuit vers une issue étroite (porche, bouche de métro, rue barrée) se bloque en arche dès que les gens veulent aller plus vite que 1,5 m/s. [A][12]
- Les obstacles tuent : lors d'une journée de 2018, un manifestant a été grièvement blessé par la chute d'une grille de jardin public arrachée par la foule. [S][20]
- Dans une foule effrayée, les gens **s'entraident** (relever, porter, guider) bien plus qu'ils ne se piétinent. [A][9]

> **Ce que le jeu doit reproduire — Psychologie**
> - La foule n'est **ni un troupeau ni un ennemi** : c'est un assemblage de groupes qui jugent en permanence si l'action policière est **légitime**.
> - La variable centrale n'est pas la « colère » seule mais le couple **peur + légitimité** : la peur fait fuir si une issue existe, elle soude et retourne la foule si l'action paraît injuste et l'issue fermée.
> - La radicalisation est **graduelle et réversible** (`pacifique` → `opportuniste` → `radical`, et retour), déclenchée par l'exemple proche et par l'impunité.
> - Le bloc **provoque** pour obtenir une réponse indistincte : le joueur gagne en refusant ce piège (viser les auteurs, annoncer, laisser une issue).
> - Vitesses, distances et densités suivent les tables du §5.5 ; au-delà de 4 personnes/m², c'est le **commandement** qui est responsable de ce qui arrive.
> - Les PNJ s'entraident : relever un blessé, le porter vers les secouristes, faire écran devant une poussette.

---

## 6. Blessures et secours

### 6.1 Bilans réels

| Événement | Blessés parmi les manifestants ou le public | Blessés parmi les forces de l'ordre | Fiab. |
|---|---|---|---|
| Manifestations du 16 mars au 3 mai 2023 (France) | 546, dont 19 en urgence absolue ; plus du quart le seul 23 mars ; 142 à Paris sur 21 manifestations | 1 518 : 1 471 policiers (dont 947 CRS) et 48 gendarmes ; 329 policiers le seul 1er mai, dont 18 hospitalisés | [V][1] |
| 1er mai 2018 (Paris) | 3 blessés très légers | 1 blessé très léger | [V][6] |
| 1er décembre 2018 (Paris) | 110 | 23, plus 211 CRS « contusionnés » | [S][20] |
| 16 mars 2019 (Paris) | 42, plus 11 blessés légers dans l'incendie d'un immeuble | 17 policiers, 1 pompier | [S][23] |
| Mouvement de 2018-2019 (France, un an) | ≈ 2 500 selon le ministère ; parmi eux, 17 à 22 personnes ayant perdu un œil et 4 à 5 une main selon des décomptes de journalistes et de collectifs | ≈ 1 800 selon le ministère | [S][37] |
| Émeutes de l'été 2023 (France, 9 nuits) | au moins une quarantaine de blessés graves ; 2 morts liés aux émeutes | 782 (674 policiers, 108 gendarmes) et 3 pompiers | [V][3] |
| Manifestations de 2016 (Paris) | ≈ 1 000 blessés selon les secouristes bénévoles | — | [S][15] |
| Journalistes (six premiers mois du mouvement de 2018-2019) | au moins 54 blessés, dont 12 sérieusement, en 120 incidents | — | [S][32] |

### 6.2 Types de blessures

| Côté | Blessure | Cause observable | Fiab. |
|---|---|---|---|
| Forces de l'ordre | Tête et visage | Projectiles ; « certaine vulnérabilité des visières » | [V][1] |
| Forces de l'ordre | Genoux | Cause non précisée ; « malgré les protections dont les effectifs sont dotés » | [V][1] |
| Forces de l'ordre | Oreilles (traumatisme sonore) | Grenades et « matériel détonant » adverse | [V][1] |
| Forces de l'ordre | Brûlures, contusions, fractures (jusqu'à 30 jours d'incapacité pour un pavé reçu) | Engins incendiaires, mortiers, pavés | [V][1] ; brûlures [E] |
| Manifestants | Tête : plaies du cuir chevelu, traumatismes crâniens, commotions | Coups, projectiles de tous bords, chutes (causes non détaillées par le rapport) | [V][1] ; [S][33] |
| Manifestants, journalistes | Œil | Tir de lanceur de balles de défense, éclat de grenade | [S][20][32][37] |
| Manifestants | Main, pied ; plaies multiples (dos) | Grenade ramassée ou explosant au sol ; impacts attribués à une grenade de désencerclement | [S][33][37] |
| Manifestants | Yeux et voies respiratoires irrités, malaises | Gaz lacrymogène ; cohue | [V][5] ; [S][33] |
| Manifestants et passants | Contusions par projectiles « amis » | « blessures légères causées, en général […], par d'autres manifestants à l'occasion notamment de jets de projectiles » | [V][1] |
| Riverains | Blessures légères, évacuation en urgence | Feu de poubelles ou de commerce gagnant l'immeuble | [V][2] ; [S][23] |

### 6.3 Gaz lacrymogène : effets sur une personne

| Élément | Valeur | Fiab. |
|---|---|---|
| Nature | Le produit employé en France est le CS ; « ni gaz, ni agents incapacitants » selon le ministère : un solide dispersé en fumée. | [V][5] ; [S][44] |
| Délai | Irritation « presque immédiatement » ; 10 à 30 secondes selon une fiche toxicologique. | [A][17] ; [S][44] |
| Symptômes | Douleur et brûlure des yeux, larmes, paupières qui se ferment ; toux, éternuements, respiration sifflante, parfois essoufflement ; brûlure de la peau ; parfois troubles digestifs et maux de tête ; réactions allergiques possibles. | [A][17] ; [V][5] |
| Durée | « l'effet irritant disparaît rapidement (15 à 30 minutes) après “décontamination” (à grande eau et éviction du produit) » ; la plupart des effets ont disparu dans la demi-heure ; effets secondaires éteints « dans la journée ». | [V][5] ; [A][17] |
| Complications | Syndrome d'irritation des bronches chez certaines personnes ; cloques si le produit reste sur la peau ; quelques heures d'observation à l'hôpital pour les cas sévères. | [A][17] |
| Premiers gestes | Mettre un masque si possible, **sortir de la zone**, rincer abondamment les yeux à l'eau ou au sérum physiologique (l'eau peut d'abord raviver la douleur), laver la peau ; le produit reste accroché aux vêtements. | [A][17] ; [S][44] |

| Paramètre de jeu proposé [JEU] | Sans protection | Lunettes ou masque de fortune | Masque à gaz |
|---|---|---|---|
| Délai avant gêne | 3 s dans le nuage | 8 s | aucun effet |
| Effets pendant l'exposition | vision floue, toux, vitesse × 0,6, ne peut ni viser ni lancer | vitesse × 0,8, précision × 0,5 | champ de vision réduit de 30 % |
| Après la sortie du nuage | vision et souffle dégradés 60 s, gêne légère 5 min ; ramené à 20 s si un secouriste rince les yeux | 30 s | — |
| Exposition de plus de 40 s | s'arrête, se plie, a besoin d'aide ; risque de malaise (asthme : 5 % des PNJ) | — | — |

### 6.4 Street medics

| Aspect | Constat | Fiab. |
|---|---|---|
| Qui | Bénévoles, parmi lesquels des étudiants et des soignants, « formés sur le tas » ou par ateliers ; regroupés en collectifs, répartis en équipes par quartier le jour même. | [S][33] |
| Tenue et matériel | Brassard ou badge blanc à croix rouge, casque, masque, parfois blouse marquée (voir 02 §6.2) ; matériel acheté en pharmacie ou donné : sérum physiologique, compresses, pansements, masques. | [S][33] |
| Gestes observables | Distribuer et verser du sérum dans les yeux ; comprimer une plaie, panser ; asseoir et rassurer ; mettre à l'abri dans un hall, un café ou un hôtel servant de poste de soins improvisé ; appeler et guider les secours. Certains prennent les blessures sérieuses, d'autres les personnes aveuglées par le gaz. | [S][33] |
| Limites | Les blessés graves sont remis au SAMU et aux pompiers ; critiques internes sur le consentement des personnes soignées. | [S][33] |
| Rapports avec la police | Tendus : des secouristes disent être gênés ou bousculés. Aucun statut trouvé dans les textes lus. | [S][33] ; statut [I] |

### 6.5 Pompiers, SAMU, extraction d'un blessé

| Point | Constat | Fiab. |
|---|---|---|
| Intégration au dispositif | Des équipes de sapeurs-pompiers « peuvent également être intégrées dans le dispositif du service d'ordre » pour éteindre vite (01 §2.3) ; brigade de sapeurs-pompiers et moyens nautiques mobilisés pour un 1er mai. | [V][8][6] |
| Feux | Extinction des poubelles, barricades et véhicules ; sauvetages dans les immeubles gagnés par le feu. | [S][23] |
| Risques | Pompiers pris à partie pendant une extinction ; mortiers tirés sur eux pendant les émeutes ; ailleurs, applaudis. | [S][20][33] ; [V][3] |
| Évacuation des blessés | Sans dialogue préalable avec les organisateurs, pas de plan d'évacuation des blessés (constat d'un rassemblement rural de 2023). | [V][2] |
| Devoir des forces | Toute personne appréhendée ou touchée par une arme intermédiaire doit voir son état de santé vérifié (01 §3 et §6). | [V][8] |

Séquence d'extraction proposée [JEU] : (1) signalement radio « blessé au sol » avec position ; (2) deux personnes font écran, une troisième évalue (conscient ? saigne ? respire ?) : 5 à 10 s ; (3) geste immédiat (compression, position latérale, rinçage) : 10 à 30 s ; (4) portage à deux ou à quatre vers un point abrité à 30-80 m, vitesse 1,0 à 1,5 m/s ; (5) remise aux pompiers ou au SAMU à un point de regroupement des victimes tenu derrière le dispositif ; (6) le véhicule de secours a besoin d'un couloir de 3,5 m, que la police ou le service d'ordre doit ouvrir.

> **Ce que le jeu doit reproduire — Blessures et secours**
> - Les deux camps sont blessés : tête, genoux et oreilles pour les policiers ; tête, yeux, mains et jambes pour les manifestants ; les projectiles des violents blessent aussi des manifestants.
> - Le gaz est **bref et réversible** (minutes), aggravé par la durée d'exposition ; le rinçage par un secouriste raccourcit nettement la gêne.
> - Le médecin ou secouriste jouable alterne tri, geste, portage et remise ; sa mission échoue si les couloirs sont fermés ou si la zone est gazée.
> - Les pompiers ont leurs propres missions (feux, sauvetage de riverains) et peuvent être protégés ou gênés par chaque camp.
> - Ne pas secourir un blessé, gêner un secouriste ou gazer un poste de soins improvisé sont des fautes qui pèsent lourd dans l'image publique ; le réglage « sobre » masque le sang sans changer la mécanique.

---

## 7. Journalistes, observateurs et vidéos

| Sujet | Constat | Fiab. |
|---|---|---|
| Droits des journalistes | Circuler dans le dispositif, rester pendant la dispersion s'ils ne peuvent être confondus avec les manifestants, porter des protections ; on ne peut ni les empêcher de filmer ni saisir leur matériel (01 §2.5). | [V][8] |
| Où ils se placent | Devant la banderole de tête au départ ; puis au contact du précortège et entre les deux lignes dès les premiers incidents ; « un journaliste doit être à bonne distance pour le comprendre et le restituer ». | [V][1] ; placement [E] |
| Menace venant des violents | Une chaîne recense 25 incidents en sept semaines : insultes, menaces, vols, coups ; un caméraman jeté à terre et frappé, caméra perdue ; parapluies ouverts devant l'objectif ; exigence d'effacer les images. Réponse des rédactions : équipes réduites, agents de protection, matériel sans logo, repli quand la menace monte. | [V][1] |
| Menace venant des forces | Journalistes identifiés touchés par des canons à eau, des tirs ou repoussés, selon une organisation de défense de la presse ; un incident imputé aux forces sur 25 pour la chaîne citée. | [S][32] ; [V][1] |
| Vidéastes indépendants | Les « street journalistes », « reporters de rue qui ne sont affiliés à aucun média et ne disposent pas toujours d'une carte de presse », posent la question de l'identification. | [V][1] |
| Regard des policiers | Les publics incertains qui se rassemblent autour d'eux pour filmer « semblent les agacer plus que des manifestants hostiles » ; leur réflexe de les éloigner est jugé erroné par les chercheurs. | [V][4] |
| « Manifestation de papier » | Le récit public (agences, télévisions, médias militants, réseaux sociaux) est un enjeu pour manifestants, cibles et forces ; les dispositifs cherchent à « passer sous les radars médiatiques » ; le « flux continu d'images » pousse le politique à intervenir et réduit le temps de réponse. | [V][4] |
| Réseaux sociaux et violence | Les plateformes ont constaté une hausse des vidéos violentes au printemps 2023 ; des jeunes cassent une vitrine « et ils diffusent les images » ; pendant les émeutes de 2023, le volume de contenus en ligne a « légèrement précédé » celui des violences. | [V][1][3] |
| Observateurs | Équipes de trois, présentes plusieurs heures, chasubles ; rapports publics sur les sommations, les tirs, les encerclements ; entraves signalées (refus de laisser entrer avec casque et lunettes). | [S][27] |
| Statut des observateurs | Le Conseil d'État leur reconnaît le droit de rester ; la commission d'enquête recommande de créer « un statut d'observateur indépendant ». | [V][8][1] |

Règles d'image publique proposées [JEU] :

| Événement filmé | Portée | Effet sur l'image publique de la police | Effet sur la mobilisation |
|---|---|---|---|
| Sommations claires puis dispersion sans blessé | journaliste à moins de 40 m | +2 | 0 |
| Interpellation d'un auteur pris sur le fait | téléphone à moins de 15 m ou journaliste | +1 | 0 |
| Policier blessé, véhicule en feu, pillage | toute caméra | +2 | −1 |
| Feu éteint, riverain ou blessé secouru | toute caméra | +2 | 0 |
| Coup sur une personne à terre ou menottée | toute caméra | −6 | +3 |
| Gaz sur des familles, une terrasse, un poste de soins | toute caméra | −4 | +2 |
| Journaliste, observateur ou secouriste frappé ou interpellé sans motif | toute caméra | −5 | +2 |
| Tir à la tête, blessé grave | toute caméra | −10 | +5 |

Une vidéo n'existe que si un personnage filmait (animation `film` ou `photo`) avec une ligne de vue ; elle est « publiée » après 30 à 120 s, puis agit sur la tension de toute la foule (stimulus « rumeur relayée », §5.5) et sur le rapport de fin de mission.

> **Ce que le jeu doit reproduire — Presse et images**
> - Journalistes et observateurs sont **partout où cela chauffe**, protégés par le droit, menacés par les deux camps.
> - Chaque téléphone est une caméra : ce qui est filmé nourrit l'image publique **et** la tension de la foule, avec un délai de publication.
> - Le journaliste jouable choisit sa distance : trop loin il ne voit rien, trop près il prend les jets, le gaz et les parapluies.
> - L'image publique récompense la procédure visible (sommations, interpellations fondées, secours) autant qu'elle punit la bavure.

---

## 8. Violences urbaines nocturnes et événements festifs qui dégénèrent

### 8.1 Trois situations à ne pas confondre

| Critère | Manifestation | Émeute nocturne (violences urbaines) | Soir de fête ou de match |
|---|---|---|---|
| Organisateur, parcours | Oui, déclarés | Aucun | Aucun (lieu de ralliement connu) |
| Foule | Longue colonne, 0,5 à 1 % de violents | « coalition de petits groupes de jeunes » ; une quarantaine d'émeutiers suffisent dans une ville moyenne | Masse joyeuse immobile ; groupes mobiles en périphérie |
| Motif | Revendication | Colère contre l'autorité, puis « logique de prédation » | Fête ; opportunisme |
| Mobilité | Lente, sur un axe | Très forte : repérages en deux-roues, diversions, « camionnettes de dépose et de ramassage » | Faible au centre, forte autour (deux-roues, voitures) |
| Armes | Projectiles ramassés, quelques mortiers | **Mortiers d'artifice en rafale** (« arme de prédilection »), guets-apens, barricades enflammées | Mortiers, bouteilles, pétards |
| Cibles | Symboles sur le parcours | Commissariats, mairies, écoles, caméras, puis commerces revendables | Vitrines, véhicules, mobilier, forces de l'ordre |
| Pillage | Marginal, en fin | Massif et ciblé : « Ils voulaient détruire et puis ils font leurs courses » | Fréquent en périphérie |
| Âge | Adultes, 20-28 ans chez les interpellés | Très jeune : un tiers de mineurs, moyenne 17-18 ans | Jeune |
| Cadre policier | Liberté de manifester à garantir | Faire cesser les infractions ; pas de sommations de cortège | Protéger la foule festive, éviter la bousculade |
| Fiab. | [V][1] | [V][3] | [S][29][30][31] |

### 8.2 Chiffres de référence

| Événement | Chiffres | Fiab. |
|---|---|---|
| Émeutes du 27 juin au 7 juillet 2023 | 672 communes ; 12 031 véhicules et 2 508 bâtiments incendiés ou dégradés (273 des forces de l'ordre, 105 mairies, 243 écoles) ; ≈ 1 500 commerces vandalisés ou pillés ; ≈ 1 milliard d'euros ; 45 000 policiers et gendarmes mobilisés ; ≈ 50 000 émeutiers estimés. Deux phases : « émotionnelle » (colère contre les forces et les bâtiments publics), puis à partir du 30 juin « insurrectionnelle » (destructions et pillages généralisés) ; décrue aussi soudaine que l'embrasement | [V][3] |
| Mortiers | Stocks constitués à l'avance ; une saisie de 10 000 pièces en une fois ; tirs « à bout portant » sur une élue prise dans un guet-apens. Vente aux non-professionnels interdite depuis 2021 (jusqu'à 6 mois d'emprisonnement et 7 500 € d'amende) ; l'usage contre des agents est assimilé à l'usage d'une arme | [V][3] ; droit [S][36] |
| Demi-finale puis finale d'une coupe du monde (décembre 2022) | ≈ 25 000 puis ≈ 35 000 personnes sur les Champs-Élysées ; 14 000 policiers et gendarmes en France dont 2 750 à Paris pour la finale ; 227 interpellations en France dont 47 dans l'agglomération parisienne ; bouteilles et artifices contre les forces, mortiers sur un véhicule de CRS | [S][30] |
| Victoire d'un club parisien en finale européenne (31 mai 2025) | 559 à 570 interpellations en France en 48 h, dont 491 à Paris ; 1 à 2 morts et ≈ 200 blessés selon les sources ; véhicules incendiés près du stade ; périphérique envahi ; le préfet de police reconnaît un « échec ». Seconde victoire, 30 mai 2026 : 780 interpellations et 219 blessés annoncés par le ministre (non recoupé) | [S][29] |
| Nuit du 31 décembre (Champs-Élysées) | 10 000 policiers et gendarmes annoncés à Paris pour le 31 décembre 2025 ; concert de l'avenue annulé pour limiter le risque de bousculade ; plus de 1 000 véhicules incendiés et plus de 500 interpellations en France ; affluence sur l'avenue : non trouvée | [S][31] |

> **Ce que le jeu doit reproduire — Nuit et fêtes**
> - Le mode « violences urbaines » change les règles : pas de cortège, pas de phase, des **groupes de 10 à 40** qui frappent et disparaissent, des guets-apens, des mortiers en rafale, des pillages ciblés ; les unités mobiles et les interpellations priment.
> - Le soir de fête, l'objectif premier est la **sécurité d'une foule dense et joyeuse** (densité, issues, véhicules) ; les fauteurs de troubles sont en périphérie et il faut les traiter sans gazer la fête.
> - Un même quartier peut passer de l'un à l'autre : fin de manifestation → cortèges sauvages → pillages nocturnes.

---

## 9. Cas réels à Paris (inspiration ; à fictionnaliser)

| # | Date, lieu | Déroulé en bref | Ce qui a mal tourné | Idée de mission fictive [JEU] | Fiab. |
|---|---|---|---|---|---|
| 1 | 14 juin 2016, cortège national arrivant aux Invalides | Environ 80 000 personnes selon la préfecture ; groupes violents en tête ; vitrines de banques, de magasins et abribus visés ; vitres d'un hôpital pour enfants brisées ; engin lanceur d'eau près des Invalides. | 130 interdictions individuelles de manifester prises avant n'ont pas suffi ; une cible très sensible sur le parcours ; choc d'image durable. | « Le parcours passe devant un hôpital » : protéger un site sensible sans couper le cortège. | [S][28] |
| 2 | 1er mai 2018, du pont d'Austerlitz au boulevard de l'Hôpital | Précortège de 14 500 personnes dont 1 200 en bloc noir devant 20 000 manifestants syndicaux ; restaurant de restauration rapide saccagé, une trentaine de commerces touchés, 6 véhicules détruits ; gaz et engins lanceurs d'eau ; 283 interpellations, 109 gardes à vue ; 4 blessés très légers ; 1 500 policiers et gendarmes. | Un millier de pacifiques entre le bloc et la police : intervention retardée ; cortège syndical stoppé et dévié, privé de son parcours. | « Le bloc est derrière la foule » : intervenir sans toucher les pacifiques intercalés. | [V][6] ; [S][19][22] |
| 3 | 1er décembre 2018, place de l'Étoile et avenues voisines | Samedi sans organisateur ; périmètre filtré sur les Champs-Élysées contourné par ≈ 8 000 personnes ; heurts dès 8 h 45 ; monument tagué et saccagé ; 230 à 250 feux dont 112 véhicules ; 6 immeubles incendiés ; arme volée dans un véhicule de police ; moitié de la place reprise vers 19 h après six tentatives ; 412 interpellations ; ≈ 5 000 policiers et gendarmes. La semaine suivante : plus de 1 000 interpellations à Paris, la plupart en amont. | Unités fixées à la garde de bâtiments, manque de mobilité, effectif mal placé ; violences étalées sur tout l'ouest parisien. | « Tenir la place » : défense d'un monument, puis reconquête par bonds successifs. | [S][20][43] |
| 4 | 16 mars 2019, Champs-Élysées | ≈ 10 000 manifestants, plus de 1 500 en bloc noir ; brasserie de prestige, boutiques et kiosque saccagés ou incendiés ; feu d'une agence bancaire gagnant un immeuble (une mère et son bébé secourus au 2e étage) ; 216 commerces dégradés dont 27 pillés ; groupes remontant ensuite vers République et les Halles ; 237 interpellations ; ≈ 5 000 agents et 6 blindés. | Pillages non empêchés sur un axe de luxe ; incendie menaçant des habitants ; suivi d'un changement de commandement et de doctrine (non relu dans une source primaire). | « L'immeuble brûle » : ouvrir un couloir aux pompiers sous les jets. | [S][19][23] |
| 5 | 16 novembre 2019, place d'Italie | Manifestation déclarée pour 14 h ; avant le départ, monument commémoratif et agence bancaire dégradés, poubelles en feu, pavés, barricades ; le préfet annule la manifestation ; place fermée plusieurs heures ; gaz et engin lanceur d'eau. | Annulation en cours de route et fermeture de la place : des personnes venues manifester sont retenues avec les violents ; un rapport d'observateurs dénonce une mise en danger. | « La place se referme » : encercler légalement (sortie contrôlée, annonces) ou renoncer. | [S][27] |
| 6 | 16 mars 2023, place de la Concorde (soir) | Rassemblement spontané de plus de 6 000 personnes après une annonce politique ; chantier de la place dégradé ; feux ; engin lanceur d'eau vers 21 h 30 ; cortèges sauvages et poubelles en feu dans les rues voisines (grève du ramassage) ; 292 interpellations selon la préfecture, 256 gardes à vue. | Pas d'organisateur, nuit, chantier ouvert, dispersion qui éclate la foule en groupes mobiles ; afflux de gardes à vue. | « Le soir de l'annonce » : sommations sur une place, puis poursuite des groupes mobiles. | [S][26] ; [V][1] |
| 7 | 23 mars 2023, Bastille → Opéra | 119 000 manifestants selon la préfecture ; précortège massif ; arrivée vers 18 h ; puis petits groupes pendant des heures ; 903 feux recensés à Paris selon le ministre ; 4 000 policiers et gendarmes ; carré de tête gazé selon les organisateurs. | Le plus gros cortège et le plus gros précortège le même jour ; feux innombrables alimentés par les ordures non ramassées ; journée la plus coûteuse en blessés. | « Grands Boulevards » : accompagner 4 km de cortège, puis éteindre et disperser à l'arrivée. | [V][1] ; [S][25] |
| 8 | 1er mai 2019, boulevard de l'Hôpital | ≈ 40 000 manifestants ; plus de 15 300 contrôles préventifs ; 330 interpellations ; dans les gaz, des dizaines de personnes entrent dans l'enceinte d'un hôpital ; récit officiel d'une « attaque » contredit par une vidéo. | Foule en fuite poussée vers un site sensible ; communication officielle démentie par les images. | « Par où fuient-ils ? » : disperser en choisissant l'axe de fuite. | [S][24] |
| 9 | 31 mai 2025, Champs-Élysées et abords d'un stade (nuit) | Fête après une victoire sportive ; mortiers, véhicules incendiés, pillages ; 491 interpellations à Paris ; morts et ≈ 200 blessés en France ; périphérique envahi le lendemain. | Foule festive et groupes violents mêlés, sur plusieurs sites à la fois ; le préfet parle d'« échec ». | « Soir de finale » : protéger la fête, traiter la périphérie. | [S][29] |
| 10 | 17 octobre 2026, République → place de Clichy | Cortège principal de 110 000 personnes « sans incident majeur » ; cortèges sauvages et pillages dans le centre ; en fin d'après-midi, « arrivée massive d'individus » venus piller ; 855 interpellations à Paris (record) ; 13 policiers et gendarmes et 2 pompiers blessés ; un hôtel sert de poste de soins improvisé. La semaine suivante, dispositif renforcé : interventions pour incendie passées de 2 025 à 75 en France. | Deux événements superposés : une marche calme et une émeute de centre-ville ; afflux tardif de pilleurs. | « Deux manifestations en une » : garder le cortège en marche pendant que le centre s'embrase. | [S][34] (presse, bilans provisoires) |

> **Ce que le jeu doit reproduire — Cas d'école**
> - Chaque cas isole **une difficulté** : cible sensible sur le parcours, pacifiques intercalés, défense d'un lieu, incendie d'immeuble, encerclement, nuit sans organisateur, cortège géant, axe de fuite, fête, émeute parallèle. Ce sont dix gabarits de mission.
> - Les lieux, dates, enseignes, mouvements et personnes sont **remplacés** par des équivalents fictifs ; seuls les noms de rues, places et monuments restent réels.
> - Les bilans chiffrés donnent l'échelle du compte rendu de fin de mission (interpellations, blessés, feux, commerces, munitions).

---

## 10. Synthèse pour le directeur de tension [JEU]

Tension globale proposée : `tension = 0,6 × moyenne des tensions locales pondérée par l'effectif + 0,4 × maximum local`, lissée sur 10 s. Décroissance naturelle : −0,01 toutes les 10 s sans incident ; −0,02 si l'équipe de liaison est au contact.

| Événement (motif passé à `addTension`) | Δ local | Rayon |
|---|---|---|
| `signal_bloc` (fumigène noir, parapluie) | +0,10 | 40 m |
| `jet_projectile` (par salve de 5) | +0,03 | 30 m |
| `tir_mortier` | +0,05 | 50 m |
| `feu_poubelle` / `feu_vehicule` | +0,04 / +0,10 | 30 m / 50 m |
| `vitrine_brisee` / `pillage` | +0,03 / +0,06 | 30 m |
| `barricade` | +0,06 | 40 m |
| `gaz_justifie` / `gaz_non_justifie` | +0,04 / +0,20 | nuage + 20 m |
| `charge_justifiee` / `charge_non_justifiee` | +0,05 / +0,25 | 40 m |
| `encerclement` (par 30 s sans sortie) | +0,10 | intérieur |
| `blesse_grave` | +0,15, et +0,05 global | 60 m |
| `video_virale` | +0,08 global | — |
| `interpellation_fondee` / `interpellation_arbitraire` | +0,02 / +0,20 | 25 m |
| `annonce_claire`, `sommation_audible` | −0,03 | 60 m |
| `retrait_forces` | −0,10 | 80 m |
| `feu_eteint`, `blesse_secouru` | −0,04 | 30 m |
| `delestage_ouvert`, `parcours_respecte` | −0,05 | tronçon |
| `ordre_dispersion_organisateurs` | −0,05 (cortège organisé) ; +0,05 (précortège) | tout |

`volatility` multiplie tous les Δ positifs par `0,5 + volatility` et règle la date d'apparition du signal du bloc (entre 20 % et 70 % de la phase `cortege`).

> **Ce que le jeu doit reproduire — Directeur de tension**
> - La tension se **gagne par événements localisés** et se **perd lentement** ; chaque variation porte un motif lisible dans le compte rendu de fin de mission.
> - Un même acte policier a deux tarifs (justifié et annoncé, ou non) : c'est la traduction chiffrée des §4 et §5.

---

## Sources

« Lu » = texte lu pendant cette recherche (au moins les passages cités). « Résumé » = contenu connu par le résumé d'un moteur de recherche ou par une page partiellement lisible : à recouper avant tout usage public. Les noms de personnes n'apparaissent que dans des titres d'ouvrages ou d'articles.

### Sources primaires et institutionnelles

1. Assemblée nationale, rapport n° 1824 (16e législature), tome 1, commission d'enquête sur les groupuscules auteurs de violences à l'occasion des manifestations et rassemblements intervenus entre le 16 mars et le 3 mai 2023, novembre 2023 — https://www.assemblee-nationale.fr/dyn/16/rapports/cegrvimani/l16b1824-t1_rapport-enquete (PDF : même adresse suivie de `.pdf`). **Lu** (pages 21 à 52, 76 à 82, 113 à 140).
2. Assemblée nationale, dossier de presse du même rapport, « Manifester en liberté : lutter efficacement contre les violences », 14 novembre 2023 — https://www.assemblee-nationale.fr/dyn/contenu/telechargement/712057/file/DP%20final%20groupuscules.pdf. **Lu**.
3. Sénat, rapport d'information n° 521 (2023-2024), « Émeutes de juin 2023 : comprendre, évaluer, réagir », 9 avril 2024 — synthèse : https://www.senat.fr/rap/r23-521/r23-521-syn.pdf ; rapport : https://www.senat.fr/rap/r23-521/r23-5211.pdf. **Lu** (synthèse ; pages 64 à 70 du rapport).
4. Défenseur des droits, « Désescalade de la violence et gestion des foules protestataires », synthèse d'étude, 2021 — https://www.defenseurdesdroits.fr/sites/default/files/2023-07/ddd-etude-desescalade-violence-20211129.pdf. **Lu**.
5. Assemblée nationale, question écrite n° 31283 (15e législature) sur les gaz lacrymogènes et réponse du ministère de l'intérieur — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE31283. **Lu** (la réponse est [V] ; le récit contenu dans la question est [S]).
6. Sénat, question écrite n° 04986 (2018) sur le 1er mai 2018 et réponse du ministère de l'intérieur — https://www.senat.fr/questions/base/2018/qSEQ180504986.html. **Lu**.
7. Assemblée nationale, questions écrites de 2013 sur la méthode de comptage de la préfecture de police — https://questions.assemblee-nationale.fr/dyn/14/questions/QANR5L14QE16696.pdf. **Résumé**.
8. Dossiers voisins de ce dépôt et leurs propres sources (code de la sécurité intérieure, schéma national du maintien de l'ordre de décembre 2021, instructions, Cour des comptes) : `docs/research/01-doctrine-cadre-legal.md`, `docs/research/02-materiel-tenues-vehicules.md`. **Lu**.

### Publications scientifiques, médicales et études

9. Université du Sussex, « Improving crowd management practices » (résumé des travaux de J. Drury, S. Reicher et C. Stott sur le modèle ESIM), mai 2014 — https://www.sussex.ac.uk/research/documents/rcs-drury-press-ready.pdf. **Lu**.
10. The Open University, « Social identities and the dynamics of crowds » — https://www.open.edu/openlearn/health-sports-psychology/social-psychology-and-politics/content-section-3.2. **Lu**.
11. C. Stott et S. Reicher, « Crowd action as intergroup process: introducing the police perspective » (1998) — https://research-portal.st-andrews.ac.uk/en/publications/crowd-action-as-intergroup-process-introducing-the-police-perspec/. **Résumé**.
12. D. Helbing, I. Farkas, T. Vicsek, « Simulating dynamical features of escape panic », *Nature* 407 (2000) — https://ar5iv.labs.arxiv.org/html/cond-mat/0009448. **Lu** (valeurs numériques).
13. Diagramme fondamental des piétons de U. Weidmann, cité dans « Pedestrian Traffic: on the Quickest Path » — https://arxiv.org/pdf/0901.0170 ; revue des vitesses et densités — https://transp-or.epfl.ch/documents/technicalReports/NikBieFar_PedMixFD_2015.pdf. **Résumé**.
14. G. K. Still, densités de foule — https://gkstill.com/Support/crowd-density/index.html (page illisible par l'outil) ; résumés : https://eiai.ie/crowd-risk-analysis-and-crowd-safety/ et https://riskex.com/when-is-a-crowd-likely-to-become-dangerous. **Résumé**.
15. ACAT-France, note sur les pratiques et conséquences du maintien de l'ordre (2017), dont la synthèse du modèle européen « KFCD » — https://www.acatfrance.fr/app/uploads/2024/10/pratiques-consequences-maintien-ordre-acat-france-2017.pdf. **Lu** (organisation non gouvernementale).
16. O. Fillieule, « Un maintien de l'ordre à la dérive » (2023) — https://france.attac.org/IMG/pdf/fillieule-possibles.pdf. **Lu** (texte d'un chercheur, point de vue critique assumé).
17. Manuel MSD, « Agents chimiques de lutte anti-émeute » — https://www.msdmanuals.com/fr/accueil/l%C3%A9sions-et-intoxications/armes-de-destruction-massive/agents-chimiques-de-lutte-anti-%C3%A9meute. **Lu**.
18. Office québécois de la langue française, fiche « proxémique » (distances de E. T. Hall) — https://vitrinelinguistique.oqlf.gouv.qc.ca/fiche-gdt/fiche/8462671/proxemique. **Résumé**.

### Presse, encyclopédies, organisations

19. Wikipédia, « Black bloc » — https://fr.wikipedia.org/wiki/Black_bloc. **Lu** (premiers 100 000 caractères).
20. Wikipédia, « Acte III du mouvement des Gilets jaunes » — https://fr.wikipedia.org/wiki/Acte_III_du_mouvement_des_Gilets_jaunes. **Lu** (première partie). Pompiers pris à partie : Europe 1 — https://www.europe1.fr/node/280729. **Résumé**.
21. Wikipédia, « Nasse (maintien de l'ordre) » — https://fr.wikipedia.org/wiki/Nasse_(maintien_de_l%27ordre). **Lu**.
22. Public Sénat, « “Black blocs” au défilé du 1er Mai : “On ne pouvait pas intervenir” » — https://www.publicsenat.fr/actualites/politique/black-blocs-au-defile-du-1er-mai-on-ne-pouvait-pas-intervenir-85526. **Lu**.
23. Public Sénat, « “Gilets jaunes” : un acte 18 marqué par un fort regain de violences à Paris » — https://www.publicsenat.fr/article/politique/gilets-jaunes-un-acte-18-marque-par-un-fort-regain-de-violences-a-paris-139269. **Lu**.
24. 1er mai 2019 : Public Sénat — https://www.publicsenat.fr/actualites/politique/1er-mai-forte-mobilisation-en-france-et-violences-contenues-a-paris-140751 ; Tendance Ouest (AFP) — https://www.tendanceouest.com/actualite-320573-indignation-et-confusion-apres-l-intrusion-a-la-pitie-salpetriere. **Résumé**.
25. 23 mars 2023 : Le Temps — https://www.letemps.ch/articles/heurts-incendies-france-apres-forte-mobilisation-contre-reforme-retraites ; Public Sénat — https://www.publicsenat.fr/actualites/societe/nouvelle-journee-de-mobilisation-contre-la-reforme-des-retraites-le-point-sur-la ; dépêche AFP reprise par Arab News — https://www.arabnews.com/node/2274566/amp. **Résumé**.
26. 16 mars 2023 : Politis — https://www.politis.fr/articles/2023/03/retraites-du-49-3-a-la-colere-de-la-concorde-retour-sur-24-heures-de-feu/ ; arrêté de la préfecture de police reproduit par une association — https://www.ldh-france.org/wp-content/uploads/2023/04/3-arrete-du-20-mars-2023.pdf ; Blick — https://www.blick.ch/fr/monde/france/le-gouvernement-peut-tomber-colere-apres-le-49-3-depot-de-deux-motions-de-censure-id18410443.html. **Résumé**.
27. 16 novembre 2019 et observateurs : rapport de l'Observatoire parisien des libertés publiques — https://www.ldh-france.org/wp-content/uploads/2019/04/Rapport-16-novembre-2019-La-stratégie-de-la-nasse-contre-le-droit-de-manifester.pdf ; Reporterre — https://reporterre.net/Un-rapport-fustige-la-strategie-du-maintien-de-l-ordre-lors-du-premier-anniversaire-des ; Connexion France — https://www.connexionfrance.com/news/gilets-jaunes-anniversary-sparks-unrest-in-france/427591 ; entraves aux observateurs — https://www.ldh-france.org/wp-content/uploads/2025/07/CP-LDH-entraves-observations.pdf. **Résumé** (pages non lisibles par l'outil).
28. 14 juin 2016 : communiqué du Sénat — https://www.senat.fr/presse/cp20160615.html ; Universalis — https://www.universalis.fr/evenement/14-29-juin-2016-poursuite-de-la-contestation-de-la-loi-travail/ ; question au gouvernement — https://questions.assemblee-nationale.fr/dyn/14/questions/QANR5L14QG4087.pdf. **Résumé**.
29. Fêtes de victoire sportive de 2025 et 2026 : franceinfo — https://www.franceinfo.fr/sports/foot/ligue-des-champions/finale/victoire-du-psg-en-ligue-des-champions-le-prefet-de-police-de-paris-reconnait-un-echec-apres-les-debordements_7287393.html (**lu**) ; La Nouvelle Tribune — https://lanouvelletribune.info/2026/05/france-des-affrontements-a-paris-apres-la-finale-de-la-ldc-plus-de-70-interpellations/ ; IBTimes — https://www.ibtimes.co.uk/violence-erupts-france-psg-champions-league-victory-1799964. **Résumé**.
30. Coupe du monde 2022 : question écrite n° 4735 — https://www.assemblee-nationale.fr/dyn/16/questions/QANR5L16QE4735.pdf ; DH — https://www.dhnet.be/actu/monde/2022/12/19/227-interpellations-en-france-en-marge-de-la-finale-BQNHLGZWUJDNJFDWT46YPYIEPQ/. **Résumé**.
31. Nuit du 31 décembre : gendarmerie nationale — https://www.gendarmerie.interieur.gouv.fr/gendinfo/actualites/2025/nuit-de-la-saint-sylvestre-45-000-gendarmes-mobilises-pour-une-fete-en-securite ; Brussels Signal — https://brusselssignal.eu/2025/12/france-to-deploy-10000-security-forces-in-paris-to-deter-new-years-eve-riots ; La Gazette France — https://www.lagazettefrance.fr/article/nouvel-an-plus-de-1-000-vehicules-brules-mais-des-violences-urbaines-limitees. **Résumé**.
32. Reporters sans frontières — https://rsf.org/fr/les-journalistes-pris-pour-cible-lors-des-mobilisations-sociales-en-france ; https://rsf.org/actualites/violences-policieres-rsf-depose-plainte-contre-x-paris-avec-13-journalistes. **Résumé**.
33. Street medics : CIDJ, 5 novembre 2026 — https://www.cidj.com/s-engager/s-engager-pour-une-cause/sur-le-terrain-les-jeunes-street-medics-portent-secours-aux-manifestants-blesses (**lu**) ; Politis, 17 octobre 2026 — https://www.politis.fr/articles/2026/10/manifestations-du-17-octobre-cest-la-convergence-des-coleres-aujourdhui/ (**lu**) ; Slate — https://www.slate.fr/story/119445/street-medics-indispensables-manifestation et https://www.slate.fr/story/173433/street-medics-secouristes-violences-policieres-utilite-publique-militantisme-manifestation-gilets-jaunes (**résumé**).
34. Octobre 2026 : Brut — https://www.brut.media/fr/articles/mobilisations-du-17-octobre-855-personnes-interpellees-a-paris (**lu**) ; Euronews — https://fr.euronews.com/2026/10/25/manifestations-en-france-1-314-interpellations-53-membres-des-forces-de-lordre-blesses-sam (**lu**) ; communiqué du ministère de l'intérieur du 24 octobre 2026 — https://www.interieur.gouv.fr/actualites/communiques-de-presse/bilan-de-journee-de-mobilisation-nationale-du-24-octobre-2026 (**non lisible**, erreur 403).
35. Comptage indépendant : Ozap — https://www.ozap.com/actu/reforme-des-retraites-qu-est-ce-que-le-cabinet-occurrence-qui-compte-le-nombre-de-manifestants-pour-les-medias/627323 ; entretien repris par L'Avenir — https://www.lavenir.net/cnt/dmf20220130_01658638/il-y-avait-1-551-manifestants-et-on-les-a-comptes. **Résumé**.
36. Mortiers d'artifice : Banque des territoires — https://www.banquedesterritoires.fr/decret-anti-mortiers-symbole-de-lincapacite-faire-respecter-la-loi. **Résumé**.
37. Bilans du mouvement de 2018-2019 : Reporterre — https://reporterre.net/Le-terrible-bilan-de-deux-mois-de-violences-policieres ; Universalis — https://www.universalis.fr/encyclopedie/gilets-jaunes/4-la-repression-du-mouvement/. **Résumé**.
38. Dégradations de voirie et barricades : L'Info durable (AFP) — https://www.linfodurable.fr/paris-stupeur-et-grand-nettoyage-au-lendemain-de-la-flambee-de-violences-8028 et https://www.linfodurable.fr/gilets-jaunes-paris-chaos-sur-les-champs-elysees-7654 ; Sud Radio (2026) — https://www.sudradio.fr/societe/a-paris-malgre-le-chaos-des-manifestants-determines-a-se-faire-entendre. **Résumé**.
39. Canons à eau : Amnesty International — https://www.amnesty.nl/content/uploads/2024/03/Les-canons-a-eau.pdf. **Résumé**.
40. Cortège de tête en 2016 : Politis — https://www.politis.fr/articles/2016/05/loi-travail-la-pire-des-choses-est-daccepter-sans-se-battre-34718 ; Tendance Ouest (AFP) — https://www.tendanceouest.com/actualite-136841-paris-afp-organises-equipes-enhardis-qui-sont-les-casseurs. **Résumé**.
41. Services d'ordre et parcours : décision du tribunal administratif de Paris (décembre 2025) — https://www.doctrine.fr/d/TA/Paris/2025/TAD95C5DE11336BBBBAB0A ; Public Sénat — https://www.publicsenat.fr/actualites/politique/fete-a-macron-samedi-2000-membres-des-forces-de-l-ordre-mobilises-85655. **Résumé**.
42. Unités motorisées : LCP — https://lcp.fr/actualites/brav-m-une-petition-qui-demande-leur-dissolution-franchit-le-cap-des-100000-signatures ; Europe 1 — https://www.europe1.fr/node/758906. **Résumé**.
43. 8 décembre 2018 : L'Avenir — https://www.lavenir.net/fil-info/belgiqueetmonde/2018/12/09/gilets-jaunes-un-total-de-1082-interpellations-samedi-a-paris-5WAXNQELSJB2JIZUGTMJTCCAB4/ ; bilan du ministère (**non lisible**, erreur 403) — https://www.interieur.gouv.fr/fr/Archives/Archives-des-actualites/2018-Actualites/Rassemblements-du-8-decembre-le-bilan.
44. Gaz lacrymogène, témoignages et questions : Reporterre — https://reporterre.net/Les-gaz-lacrymogenes-dangereux-a-long-terme-Des-manifestants-temoignent ; question écrite n° 17735 — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE17735.pdf ; Futura — https://www.futura-sciences.com/sante/actualites/corps-humain-effets-secondaires-gaz-lacrymogenes-62943/. **Résumé**.

## Points incertains

### Non trouvé (aucune source exploitable) — valeurs [JEU] à valider

1. **Vitesse de marche d'un cortège** : aucune mesure publiée ; 1,1 km/h est déduit d'un seul parcours (longueur estimée à ± 15 %).
2. **Densité réelle dans un cortège** : déduite par calcul ; les seuils de danger viennent de résumés de la littérature, pas d'un texte relu.
3. **Distances que les gens gardent face à une ligne de policiers**, **portée d'un jet à la main**, **portée et cadence d'un mortier d'artifice**, **vitesses de fuite par profil**, **vitesse d'un policier équipé** : rien de chiffré ; toutes les valeurs du §3.3 et du §5.5 sont des propositions (seule la vitesse désirée de plus de 5 m/s en panique vient d'un article scientifique).
4. **Géométrie des manœuvres** (bond offensif, charge, vague de refoulement) : non décrite en source ouverte (déjà signalé dans le dossier 01).
5. **Retour de gaz sur la troupe**, effet du vent : aucun document chiffré ; règles du §4.3 proposées.
6. **Neutralisation des palets lacrymogènes** par les manifestants : aucune source lue ; seul le renvoi est attesté par un résumé de réponse ministérielle.
7. **Comportement des touristes** et **effet de la météo** sur la participation : aucune source.
8. **Dispositif de secours de la brigade de sapeurs-pompiers en manifestation** (effectifs, point de regroupement des victimes) : non trouvé ; la séquence d'extraction du §6.5 est une proposition.
9. **Affluence sur les Champs-Élysées la nuit du 31 décembre** et bilan parisien de cette nuit : non trouvés. **Organisation interne des street medics** (binômes, radio, tri) : seulement des reportages ; les brochures militantes n'ont pas pu être lues.
10. **Tous les coefficients** du §5.5, du §7 (image publique) et du §10 : conception pure, à régler par essais de jeu.

### Sources divergentes ou fragiles

11. **Comptages** : les chiffres de la préfecture, des organisateurs et du comptage indépendant diffèrent d'un facteur 3 à 10 ; le tableau du §1.3 retient ceux du ministère.
12. **Bilans d'une même journée** : feux du 23 mars 2023 à Paris, 903 selon le ministre, 140 recensés vers 22 h selon un média, 200 selon un autre ; interpellations du 16 mars 2023, 292 dans un arrêté préfectoral, 256 gardes à vue selon le parquet, 61 dans un premier bilan du soir ; interpellations du 1er mai 2018, 283 selon la réponse ministérielle, ≈ 200 dans les premiers bilans de presse.
13. **Totaux qui ne tombent pas juste** : le rapport parlementaire annonce 1 518 blessés parmi les forces mais détaille 1 471 + 48 ; l'encerclement de Hambourg (1986) dure 9 heures selon une source, 13 heures selon une autre.
14. **Fêtes sportives de 2025 et 2026** et **manifestations d'octobre 2026** : presse et bilans provisoires seulement ; le communiqué officiel n'a pas pu être lu. À utiliser comme inspiration, pas comme référence chiffrée.
15. **Nombre de personnes ayant perdu un œil ou une main en 2018-2019** : décomptes militants et journalistiques (17 à 22 ; 4 à 5), non officiels.
16. **Lecture des événements** : le rapport parlementaire, l'étude du Défenseur des droits, les organisations non gouvernementales et les chercheurs ne s'accordent pas sur la part de responsabilité de la doctrine policière dans l'escalade ; le jeu doit rester neutre et laisser les deux mécanismes jouer (provocation par les violents, radicalisation par la force indistincte).
17. **Wikipédia** (sources 19 à 21) : lu en partie seulement ; chiffres à recouper avec leurs sources d'origine avant tout affichage dans une encyclopédie en jeu.
