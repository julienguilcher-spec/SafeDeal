# 01 — Doctrine, cadre légal et organisation du maintien de l'ordre en France

> Dossier de recherche pour **CRS Simulation France**. Rédigé le 15 novembre 2026 à partir de sources consultées ce jour.
> Public visé : développeurs gameplay / IA / interface / audio. Les passages entre guillemets « … » suivis de **[V]** sont des **textes officiels exacts**,
> à reprendre tels quels ; ceux marqués **[JEU]** sont des propositions de rédaction. Les marques et fabricants cités ici ne servent qu'à la traçabilité : **dans le jeu, noms génériques**
> (« lanceur de grenades 56 mm », « lanceur de balles de défense 40 mm »), conformément au BRIEF §4.

## Légende de fiabilité

| Marque | Signification |
|---|---|
| **[V]** | **Vérifié** : lu dans un texte officiel pendant cette recherche (code consolidé, décret, instruction ministérielle, schéma national, décision de justice, réponse ministérielle). |
| **[S]** | **Source secondaire** : presse, Wikipédia, brochure associative ou militante, support de formation. Plausible, à recouper. |
| **[I]** | **Incertain / non trouvé** : aucune source fiable trouvée. Ne pas présenter comme réel. |
| **[JEU]** | **Valeur proposée pour le jeu** : choix de conception, non réglementaire, cohérent avec ce qui est vérifié. |

Les renvois `[n]` pointent vers la section **Sources** en fin de dossier (URL complète).

## 0. L'essentiel en vingt règles (à coder en premier)

1. Une manifestation est **libre** ; elle est seulement **déclarée** (pas autorisée). Le jeu ne doit jamais traiter un cortège calme comme une cible. [V][1][6]
2. La force ne sert qu'à dissiper un **attroupement** = « tout rassemblement de personnes sur la voie publique ou dans un lieu public susceptible de troubler l'ordre public ». [V][3]
3. Seule l'**autorité civile** présente sur place (« autorité habilitée à décider de l'emploi de la force », AHEF) constate l'attroupement, fait les **sommations** et **décide** de l'emploi de la force. Le commandant d'unité (CRS, gendarmes) **exécute** et choisit la manœuvre. [V][1][7]
4. L'autorité civile porte une **écharpe tricolore ou un brassard tricolore** et parle au **haut-parleur**. [V][1]
5. Séquence obligatoire : **annonce → première sommation → dernière sommation → emploi de la force**. [V][1]
6. Pour employer les **armes** (grenades au lanceur, GM2L, grenade de désencerclement), la **dernière sommation est répétée** une fois de plus. [V][1][8]
7. Chaque annonce ou sommation peut être remplacée ou doublée par une **fusée rouge**. [V][1]
8. **Exception** : si la troupe subit des **violences ou voies de fait**, ou ne peut **défendre autrement le terrain qu'elle occupe**, le commandant de la force publique emploie directement la force, **sans sommation** ; il avertit la foule si c'est possible. [V][1][7]
9. Toute force doit être **absolument nécessaire, proportionnée**, et **cesser dès que le trouble cesse**. [V][1]
10. Le **LBD 40 n'est jamais un outil de dispersion après sommations** : uniquement riposte à des violences, défense du terrain, légitime défense. Torse et membres ; **la tête n'est pas visée**. [V][8]
11. Grenades au lanceur : **tir tendu strictement interdit**, tir courbe uniquement, **sur ordre**, avec un **superviseur**. [V][8]
12. Grenade de désencerclement : lancée **à la main, au ras du sol**, jamais au lanceur ; rayon d'effet 10 m. [V][8]
13. Maintien à distance de la foule tant qu'il n'y a pas de trouble ; en cas de trouble, **interpellations ciblées** et respect du parcours pour les pacifiques. [V][6]
14. **Encerclement (« nasse »)** : seulement pour prévenir ou faire cesser des violences graves et imminentes, **avec un point de sortie contrôlé**, durée strictement nécessaire, information régulière des encerclés. [V][6][9]
15. Les **journalistes** circulent dans le dispositif, peuvent rester pendant la dispersion s'ils se distinguent des manifestants et ne gênent pas ; on ne peut pas les empêcher de filmer ni confisquer leur matériel. [V][6][9]
16. Une **équipe de liaison et d'information (ELI)**, au moins deux policiers, dialogue en continu avec les organisateurs : c'est sa seule mission. [V][6][10]
17. Uniforme, **marquage d'unité dans le dos**, **numéro RIO** (7 chiffres) visible, **cagoule interdite**. [V][6][27]
18. Tout tir (LBD, grenade) fait l'objet d'un **compte rendu écrit** ; le bilan de fin de mission compte les munitions par type, les blessés et les interpellations. [V][7][8]
19. Interpellation : flagrant délit → maîtrise → remise à un **officier de police judiciaire** → garde à vue de **24 h**, prolongeable **24 h**. Menottes seulement si la personne est dangereuse ou risque de fuir. [V][4][1]
20. Une faute expose à l'échelle disciplinaire en **quatre groupes** (avertissement → révocation), après enquête administrative (IGPN pour les cas les plus graves). [V][5] ; [S][29]

## 1. Attroupement et dispersion

### 1.1 Les textes (état au 14 novembre 2026)
| Texte | Ce qu'il dit (extrait exact) | Fiab. |
|---|---|---|
| Code pénal, art. 431-3 | « Constitue un attroupement tout rassemblement de personnes sur la voie publique ou dans un lieu public susceptible de troubler l'ordre public. » — « Un attroupement peut être dissipé par la force publique après deux sommations de se disperser restées sans effet adressées dans les conditions et selon les modalités prévues par l'article L. 211-9 du code de la sécurité intérieure. » | [V][3] |
| CSI, art. L. 211-9 | Dissipation « après deux sommations de se disperser demeurées sans effet, adressées, lorsqu'ils sont porteurs des insignes de leur fonction, par : 1° Le représentant de l'Etat dans le département ou, à Paris, le préfet de police ; 2° Sauf à Paris, le maire ou l'un de ses adjoints ; 3° Tout officier de police judiciaire responsable de la sécurité publique, ou tout autre officier de police judiciaire. » | [V][1] |
| CSI, art. L. 211-9, al. 5 | « Il est procédé à ces sommations suivant des modalités propres à informer les personnes participant à l'attroupement de l'obligation de se disperser sans délai. » | [V][1] |
| CSI, art. L. 211-9, al. 6 | « Toutefois, les représentants de la force publique appelés en vue de dissiper un attroupement peuvent faire directement usage de la force si des violences ou voies de fait sont exercées contre eux ou s'ils ne peuvent défendre autrement le terrain qu'ils occupent. » | [V][1] |
| CSI, art. D. 211-10 | « Dans le cas d'un attroupement mentionné à l'article L. 211-9, le maintien de l'ordre relève exclusivement du ministre de l'intérieur. » | [V][1] |
| CSI, art. R. 211-11 | Texte des sommations (voir 1.2). Version issue du décret n° 2021-556 du 5 mai 2021. | [V][1][2] |
| CSI, art. R. 211-12 | Insignes (voir 1.4). | [V][1] |
| CSI, art. R. 211-13 | « L'emploi de la force par les représentants de la force publique n'est possible que si les circonstances le rendent absolument nécessaire au maintien de l'ordre public dans les conditions définies par l'article L. 211-9. La force déployée doit être proportionnée au trouble à faire cesser et son emploi doit prendre fin lorsque celui-ci a cessé. » | [V][1] |
| CSI, art. R. 211-14 | Hors les deux cas de l'alinéa 6, usage des armes à feu « que sur ordre exprès des autorités habilitées à décider de l'emploi de la force ». « Cet ordre est transmis par tout moyen permettant d'en assurer la matérialité et la traçabilité. » | [V][1] |
| CSI, art. R. 211-16 et D. 211-17 | Armes utilisables après sommations réitérées : grenades à effet sonore, grenades à effet sonore et lacrymogène, grenades lacrymogènes instantanées, lanceurs de grenades de 56 mm et de 40 mm et leurs munitions, grenades à main de désencerclement. | [V][1] |
| CSI, art. R. 211-18 et D. 211-19 | Dans les deux cas de l'alinéa 6 seulement, s'ajoutent : projectiles non métalliques tirés par les lanceurs de 56 mm, lanceurs de grenades et de balles de défense de 40 × 46 mm, lanceurs de balles de défense de 44 mm. | [V][1] |
| CSI, art. R. 211-21 | Le préfet, le commissaire mandaté et les autres autorités énumérées (voir 1.3) « doivent être présents sur les lieux en vue, le cas échéant, de décider de l'emploi de la force après sommation. » — « Si elle n'effectue pas elle-même les sommations, l'autorité civile responsable de l'emploi de la force désigne un officier de police judiciaire pour y procéder. » | [V][1] |

### 1.2 Texte exact des sommations
Article R. 211-11 du code de la sécurité intérieure, en vigueur [V][1][2] : « l'autorité habilitée à procéder aux sommations avant de disperser un attroupement par la force » :

| Étape | Verbe du texte | **Paroles exactes à prononcer au haut-parleur** | Ancien texte (avant le 5 mai 2021) |
|---|---|---|---|
| 1° Annonce | « Annonce sa présence » | **« Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux »** | « Obéissance à la loi. Dispersez-vous » |
| 2° Première sommation | « Procède à une première sommation » | **« Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux »** | « Première sommation : on va faire usage de la force » |
| 3° Deuxième et dernière sommation | « Procède à une deuxième et dernière sommation » | **« Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux »** | « Dernière sommation : on va faire usage de la force » |
| 4° Réitération (seulement avant l'usage des armes de l'art. R. 211-16) | « la dernière sommation ou, le cas échéant, le lancement de fusée […] doivent être réitérés » | **Répéter mot pour mot la phrase du 3°** | idem |

- Les anciennes formules figurent dans le tableau comparatif du schéma national de décembre 2021, page 6. [V][6]
- La fiche de communication du ministère (25 mai 2021) ajoute un point d'exclamation final à chaque phrase ; le texte réglementaire n'en comporte pas. Pour la voix synthétisée ou les sous-titres, les deux graphies sont acceptables. [V][10]
- Suite exacte de l'article : « Si l'utilisation du haut-parleur est impossible ou manifestement inopérante, chaque annonce ou sommation peut être remplacée ou complétée par le lancement d'une fusée rouge. » — « Toutefois, si, pour disperser l'attroupement par la force, il doit être fait usage des armes mentionnées à l'article R. 211-16, la dernière sommation ou, le cas échéant, le lancement de fusée qui la remplace ou la complète doivent être réitérés. » [V][1]

### 1.3 Qui a le droit de les prononcer
« Autorité habilitée à décider de l'emploi de la force » (AHEF). Liste de l'article R. 211-21 et de l'instruction gendarmerie de 2022 [V][1][7] :

| Autorité | Condition | À Paris ? |
|---|---|---|
| Préfet (à Paris : **préfet de police**) | de plein droit | Oui |
| Autre membre du corps préfectoral, directeur des services du cabinet | sous l'autorité du préfet | Oui |
| Maire ou adjoint | de plein droit | **Non** (« sauf à Paris ») |
| Directeur du service territorial de police chargé de l'ordre public, ou son adjoint | désigné par le préfet | Oui (direction de l'ordre public et de la circulation) |
| **Commissaire ou officier de police**, responsable de service | **mandaté** par l'autorité préfectorale | **Oui — cas le plus courant en jeu** |
| Commandant de groupement de gendarmerie départementale ou son second ; commandant de compagnie de gendarmerie départementale ou son second | désigné / mandaté | Zone gendarmerie seulement |

- Le mandat est écrit, sans formalisme, mais **traçable** (« document papier, courriel, SMS… ») et mentionne l'autorité délégante, le délégataire, la nature et la date. [V][7]
- L'autorité peut faire lire les sommations par un **officier de police judiciaire** qu'elle désigne ; même dans ce cas, **sa présence sur les lieux est impérative**. [V][1][7]
- « L'autorité habilitée à faire les sommations doit être visible et identifiable sans ambiguïté par l'ensemble des manifestants. » (réponse ministérielle, 2016). [V][12]
- À Paris, « il y a […] un commissaire auprès de chaque unité, ce qu'on ne trouve pas ailleurs » (audition, commission d'enquête de l'Assemblée nationale). [V][11]
- Le **commandant d'unité CRS ou d'escadron n'est pas une autorité habilitée** : il est « commandant de la force publique ». Les deux fonctions sont exclusives l'une de l'autre. [V][7]

### 1.4 Insignes distinctifs : écharpe et brassard
Article R. 211-12 [V][1] : pour procéder aux sommations, les autorités « doivent […] porter les insignes suivants » :

| Autorité | Insigne (texte exact) |
|---|---|
| Préfet, autre membre du corps préfectoral, directeur des services du cabinet | « écharpe tricolore ou brassard tricolore » |
| Maire ou adjoint | « écharpe tricolore ou brassard tricolore » |
| Officier de police judiciaire de la police nationale | « écharpe tricolore ou brassard tricolore » |
| Officier de police judiciaire de la gendarmerie nationale | « écharpe tricolore ou brassard tricolore » |

Avant le décret de 2021 : écharpe pour la police et le corps préfectoral, brassard pour la gendarmerie. [V][12][2]

| Détail visuel | Valeur | Fiab. |
|---|---|---|
| Sens de port de l'écharpe (règle écrite pour les **maires**, art. D. 2122-4 du code général des collectivités territoriales) | « soit en ceinture soit de l'épaule droite au côté gauche » | [V][30] |
| Ordre des couleurs en écharpe (maires) | **bleu près du col** (les parlementaires portent le rouge près du col) | [V][30] |
| Ordre des couleurs en ceinture (maires) | bleu en haut | [V][30] |
| Franges | or pour le maire ; **argent** pour les adjoints agissant comme officiers de police judiciaire | [V][30] |
| Port par les préfets et officiers de police judiciaire de la police | « en ceinture avec des glands et des franges argentés » selon Wikipédia, **mention non sourcée** | [S][31] |
| Sens de port imposé au commissaire de police | **non trouvé** : l'article R. 211-12 ne précise ni l'épaule ni l'ordre des couleurs | [I] |
| Position du brassard (quel bras), dimensions de l'écharpe | **non trouvé** | [I] |
| Convention retenue pour le jeu | Écharpe en bandoulière **de l'épaule droite à la hanche gauche**, **bleu côté col**, blanc au centre, rouge à l'extérieur, franges argent ; largeur 0,11 m ; brassard à trois bandes verticales bleu-blanc-rouge au **bras gauche**, hauteur 0,10 m | [JEU] |
| Couleurs approximatives | bleu `#000091`, blanc `#FFFFFF`, rouge `#E1000F` ; franges argent `#C8CCD2` | [JEU] |

### 1.5 Moyens : haut-parleur et fusée rouge
| Élément | Règle ou pratique | Fiab. |
|---|---|---|
| Haut-parleur | Obligatoire par défaut (« en énonçant par haut-parleur »). | [V][1] |
| Fusée rouge | Remplace **ou complète** chaque annonce / sommation si le haut-parleur est « impossible ou manifestement inopérant ». | [V][1] |
| Pratique déclarée par le ministère (2016) | « chaque sommation est accompagnée d'un ou plusieurs tirs de fusée rouge » ; « les sommations sont réitérées régulièrement lors de chaque changement de configuration ou si la situation évolue ». | [V][12] |
| Lecture associative | « Trois tirs de fusée rouge remplacent l'annonce et les deux sommations. » | [S][16] |
| Matériels nouveaux annoncés | « haut-parleurs de forte puissance, panneaux à message variable » pour améliorer la réception des sommations. | [V][6] |
| Audibilité | Le délit de maintien dans l'attroupement est intentionnel : il faut que les sommations aient été audibles là où se trouvait la personne (analyse associative de la jurisprudence). | [S][16] |
| Portée audible du mégaphone, hauteur et durée de la fusée | **non trouvé** | [I] |
| Valeurs de jeu | Mégaphone portatif : intelligible à 60 m, audible à 120 m ; haut-parleur de forte puissance sur véhicule : 150 m / 300 m ; fusée rouge : apogée 80 m, visible 6 s, couleur `#FF2A1A`, visible de toute la place | [JEU] |

### 1.6 Délais entre les sommations
- **Aucun délai chiffré** n'existe dans le code : seulement l'« obligation de se disperser sans délai ». [V][1]
- La jurisprudence exige que les personnes aient eu **le temps et la possibilité matérielle de partir** : relaxe confirmée par la Cour de cassation (chambre criminelle, 23 janvier 2019, n° 18-81.219) pour une personne prise dans un quadrillage policier : la disposition des forces « ne permettaient pas à l'intéressée de partir ». [S][16]
- Les sommations « doivent être diffusées ou réitérées à chaque séquence opérationnelle » ; une séquence = « la réalisation d'une mission dans un temps et sur un compartiment de terrain donnés ». Si l'usage des armes est ordonné après un emploi de la force resté inefficace, « les sommations relatives à l'usage des armes doivent être réitérées dans leur intégralité ». [V][7]

| Intervalle (valeurs de jeu) | Durée standard (mission de 25 min) | Durée « temps réel » | Fiab. |
|---|---|---|---|
| Annonce → première sommation | 30 s | 120 s | [JEU] |
| Première → dernière sommation | 30 s | 120 s | [JEU] |
| Dernière sommation → emploi de la force | 20 s minimum | 60 s minimum | [JEU] |
| Réitération → usage des armes | 10 s minimum | 30 s minimum | [JEU] |
| Validité d'une série de sommations | tant que l'unité reste sur le même compartiment de terrain (même rue ou même place) ; à refaire après un bond de plus de 150 m ou un changement de rue | idem | [JEU] |

### 1.7 Emploi de la force sans sommation
| Cas | Qui décide | Moyens | Fiab. |
|---|---|---|---|
| « des violences ou voies de fait sont exercées contre eux » (L. 211-9 al. 6) | Le **commandant de la troupe** : « il est permis au commandant de la troupe de décider de l'emploi et de faire usage de l'ensemble de ses moyens par dérogation au principe des sommations » | Tous les moyens de dotation, **y compris le LBD 40** | [V][1][7][8] |
| « ils ne peuvent défendre autrement le terrain qu'ils occupent » (L. 211-9 al. 6) | idem | idem | [V][1][7] |
| Légitime défense de soi ou d'autrui (code pénal, art. 122-5) | L'agent lui-même | Riposte nécessaire, proportionnée, simultanée à l'attaque | [V][8] |
| État de nécessité (code pénal, art. 122-7) | L'agent | Acte nécessaire à la sauvegarde d'une personne ou d'un bien | [V][8] |
| Usage de l'arme de service (CSI, art. L. 435-1) | L'agent, en uniforme | « absolue nécessité » et « manière strictement proportionnée » ; atteinte à la vie ou à l'intégrité physique | [V][8] |

- Même sans sommation, la doctrine demande des **avertissements à la foule** : « avertissements non formalisés mais indiquant clairement la nature de ces manœuvres et de ces moyens », « chaque fois que cela est possible au regard de la situation et de l'urgence ». [V][7]
- Pratique décrite en 2016 : l'officier de police judiciaire annonce « le mode d'action et/ou la munition éventuellement utilisée », doublé d'une fusée rouge. [V][12]
- Exemples d'avertissements pour le jeu [JEU] : « Attention, nous allons employer des grenades lacrymogènes. Écartez-vous. » ; « Attention, charge. Dégagez la chaussée. » ; « Attention, usage du canon à eau. Reculez. »
- « En l'absence d'attroupement ou d'AHEF, le cadre légal qui s'applique est celui du droit commun » (légitime défense, flagrant délit). [V][7]

### 1.8 Machine à états de la dispersion (synthèse à coder)
```
CORTEGE (manifestation)                      aucun moyen coercitif ; maintien à distance ; liaison-information
   | trouble à l'ordre public constaté par l'autorité civile présente
   v
ATTROUPEMENT_CONSTATE                        l'autorité civile met son écharpe / brassard, prend le haut-parleur
   | annonce            « Attention ! Attention ! Vous participez à un attroupement... »   (+ fusée rouge facultative)
   v
ANNONCE_FAITE
   | première sommation « Première sommation : nous allons faire usage de la force... »    (+ fusée rouge)
   v
SOMMATION_1
   | dernière sommation « Dernière sommation : nous allons faire usage de la force... »    (+ fusée rouge)
   v
FORCE_AUTORISEE        barrage, refoulement, charge, bâton, bouclier, lacrymogène lancée à la main, engin lanceur d'eau
   | la foule reste, l'autorité civile ordonne l'usage des armes : réitération de la dernière sommation (+ fusée rouge)
   v
ARMES_AUTORISEES       lacrymogènes au lanceur, GM2L / grenade à effet sonore, grenade de désencerclement  (JAMAIS le LBD)
   | le trouble cesse (foule dispersée, lieux libérés)
   v
FIN_EMPLOI_FORCE       retour immédiat à la posture sans coercition (R. 211-13)

A tout moment : VIOLENCES OU VOIES DE FAIT contre l'unité / TERRAIN INDEFENDABLE AUTREMENT
   -> RIPOSTE_DIRECTE décidée par le commandant d'unité, sans sommation, tous moyens dont le LBD, avertissement si possible
```

> **Ce que le jeu doit reproduire — Attroupement et dispersion**
> - Un objet « autorité civile » (commissaire joueur ou PNJ) **physiquement présent** à moins de 50 m de l'unité ; sans lui, aucune dispersion légale n'est possible, seulement la riposte directe et la légitime défense.
> - Les trois phrases exactes, audio et sous-titres, dans l'ordre, avec minuteries ; un bouton par étape pour le joueur-commissaire ; fusée rouge optionnelle (obligatoire si le haut-parleur est hors service, bruit de foule trop fort ou distance trop grande).
> - Un état de droit par unité et par compartiment de terrain (voir 1.8). Toute action coercitive est comparée à cet état : action conforme, action prématurée (sanction), action interdite (LBD en dispersion, tir tendu).
> - Les PNJ pacifiques **partent** après les sommations si une issue est libre ; s'ils sont enfermés, ils ne commettent aucune infraction et la tension monte.
> - La force s'arrête dès que le trouble cesse : continuer à lancer après dispersion = faute.
> - Écharpe ou brassard visible sur le modèle 3D de l'autorité civile uniquement pendant qu'elle exerce ; mégaphone en main.

## 2. Schéma national du maintien de l'ordre (SNMO)

### 2.1 Les deux versions
| Version | Date | Faits | Fiab. |
|---|---|---|---|
| Première version | Présentée le **16 septembre 2020** par le ministre de l'Intérieur | « premier document de doctrine […] commun à l'ensemble des forces » | [V][6][10] |
| Annulation partielle | **Conseil d'État, 10 juin 2021, n° 444849** | Quatre points annulés : 2.2.1 en partie (conditions mises au port d'équipements de protection par les journalistes), 2.2.2 en partie (canal d'information réservé aux journalistes « accrédités auprès des autorités »), **2.2.4 en entier** (obligation pour les journalistes de quitter les lieux lors de la dispersion), **3.1.4 en entier** (encerclement jugé « utile » sans conditions) | [V][9] |
| Version en vigueur | **Décembre 2021** (document daté du 15 décembre 2021, 40 pages) | Réécrit les points annulés, intègre les sommations du décret du 5 mai 2021 | [V][6][7] |
| Déclinaison gendarmerie | Instruction n° 200000 du **26 juillet 2022** | Référentiel unique de la gendarmerie pour l'ordre public | [V][7] |

- Phrase d'ouverture du schéma, utilisable en écran de chargement : « Le maintien de l'ordre a donc pour objectif […] d'anticiper les troubles afin de ne pas avoir à les réprimer. » [V][6]
- Conclusion de la synthèse : « une doctrine plus protectrice pour les manifestants et plus ferme avec les auteurs de violences ». [V][6]

### 2.2 Principes et gradation
| Principe | Formulation de la source | Fiab. |
|---|---|---|
| Posture par défaut | « En l'absence de risques de troubles à l'ordre public, le maintien à distance de la foule pour préserver l'intégrité physique des manifestants reste l'option privilégiée. » | [V][6] §2.5 |
| En cas de trouble | « l'adaptation au plus près du dispositif doit être immédiate et permettre l'interpellation des fauteurs de troubles, le respect du parcours et la préservation de la liberté de manifestation » | [V][6] §2.5 |
| Deux objectifs de l'intervention | « la dispersion sans délai des groupes hostiles » et « des interpellations rapides et ciblées » | [V][6] §2.5 |
| Emploi de la force | « absolument nécessaire, strictement proportionné et gradué, avec des moyens adaptés » ; « Chaque usage de ces armes est tracé. » | [V][6] §3.3 |
| Appréciation locale | L'appréciation du trouble est faite « par l'autorité habilitée à l'emploi de la force qui se trouve au plus proche de l'événement » | [V][6] §2.6 |
| Principes tactiques (gendarmerie) | « temporisation du contact et maintien à distance », « mobilité », « modularité » ; « logique permanente de désescalade » | [V][7] |
| But | « prévenir les troubles afin de n'avoir pas à les réprimer » | [V][7] |
| Discrimination | « mettre un terme aux exactions tout en discriminant les manifestants selon leur comportement » | [V][6] §3.1 |
| Déconcentration | Décisions prises sur le terrain par les chefs de secteur et les commandants, « de manière loyale et coordonnée à la stratégie globale arrêtée par le préfet » | [V][6] §3.1.3 |

Trois natures d'engagement (instruction gendarmerie) [V][7] — à utiliser comme **niveaux de tension de scénario** :

| Niveau | Définition | Moyens typiques |
|---|---|---|
| Maintien de l'ordre | « engagement de faible intensité visant à maintenir un ordre déjà établi » ; déploiement « préalable et dissuasif » | Encadrement, filtrage, barrages de canalisation |
| Rétablissement de l'ordre | « engagement de moyenne ou haute intensité, visant à faire cesser les troubles » | Emploi de la force gradué, jusqu'aux véhicules blindés et unités d'intervention |
| Violences urbaines | Émeute : pillages, destruction de mobilier urbain, incendies de véhicules et de bâtiments, « projectiles, cocktails explosifs et/ou incendiaires, embuscades, tirs d'artifices » | On ne garantit plus la liberté de manifester : on fait cesser les infractions |

### 2.3 Qui fait quoi : la chaîne de responsabilité
| Sigle | Fonction | Qui (à Paris) | Rôle | Fiab. |
|---|---|---|---|---|
| ROP | Responsable de l'ordre public | **Préfet de police** | « définit la stratégie de gestion de l'ordre public et fixe le cadre juridique et les grandes orientations » ; présent ou représenté sur le terrain pour les opérations sensibles | [V][6] §2.4.1 |
| DSO | Directeur du service d'ordre | **Directeur de l'ordre public et de la circulation** de la préfecture de police | « assure la direction et la coordination de l'ensemble des opérations » ; dirige depuis son centre opérationnel ou sur place ; conçoit la manœuvre et la fait valider par le préfet | [V][6] §2.4.2 [7] |
| CSO | Chef de secteur opérationnel | Commissaire désigné par le directeur du service d'ordre | Fixe aux unités de son secteur « la mission et les effets à obtenir » ; marge d'initiative tactique ; **autorité habilitée à procéder aux sommations** | [V][6] §2.4.3 [7] |
| AHEF | Autorité habilitée à décider de l'emploi de la force | Commissaire placé auprès de l'unité | Seule décisionnaire de l'emploi de la force ou de l'usage des armes pour dissiper un attroupement | [V][7] |
| CFP | Commandant de la force publique | **Commandant de la compagnie de CRS**, commandant d'escadron, de groupement | « décide de la manœuvre tactique et des moyens employés » dans les limites fixées ; conseille l'autorité civile ; assure « la traçabilité par tout moyen des directives qui lui sont données » | [V][7] |

- Le directeur du service d'ordre ou le chef de secteur « peut à tout moment modifier, suspendre ou annuler ses instructions ». [V][6] §2.4.4
- Il « décide, hors les cas de légitime défense, de l'emploi de la force et de l'usage des armes ». [V][6] §2.4.4
- Le commandant de la force publique reçoit « impérativement » : « un ou des objectifs à atteindre clairement formulés » et « le cadre juridique dans lequel doivent se dérouler les opérations ». [V][7]
- Des équipes de sapeurs-pompiers « peuvent également être intégrées dans le dispositif du service d'ordre, afin de disposer d'une capacité d'extinction des feux particulièrement réactive et mobile ». [V][6] §2.4.7

### 2.4 Information des manifestants
| Outil | Contenu | Fiab. |
|---|---|---|
| **Équipe de liaison et d'information (ELI)** | Mission « exclusive de toute autre lors du maintien de l'ordre », « placée sous l'autorité du directeur du service d'ordre », « unique fonction de faciliter le déroulement de la manifestation par une interaction avec les manifestants » | [V][6] §2.1.2 |
| Composition | « au moins deux policiers, spécialement formés et désignés » | [V][10] |
| Interlocuteurs | L'organisateur « devra désigner des points de contact » ; l'obligation de communiquer vaut aussi **sans organisateur** | [V][6] §2.1.2 |
| Messages transmis | « changement d'itinéraire, imminence d'un appel à la dispersion, présence de fauteurs de troubles » ; « axes permettant de quitter les lieux », « moyens employés pour disperser l'attroupement » | [V][6] §2.1.3 |
| Armement et tenue des équipes de liaison | **non trouvé** dans le schéma (une proposition parlementaire les voulait « identifiées, non armées ») | [I][11] |
| Matériels | « haut-parleurs de forte puissance, panneaux à message variable » | [V][6] §2.1.4 |
| Numérique | « réseaux sociaux », « envoi de SMS groupés » (annoncé à échéance 2022) | [V][6][10] |
| Avant l'événement | Communiqués de presse : itinéraire, déviations, fermeture de stations de métro, voies de bus ; diffusion des arrêtés (interdiction de vente d'alcool, d'artifices, de produits inflammables, de stationnement, voire de manifester) | [V][6] §2.1.1 |
| Périmètres interdits | L'illustration du schéma montre des « zones interdites aux manifestants » à Paris : Champs-Élysées, Assemblée nationale, Matignon, Trocadéro, tour Eiffel, Notre-Dame, Sénat, bois de Boulogne, bois de Vincennes | [V][6] p. 13 |

Textes de panneau à message variable proposés [JEU] (3 lignes de 18 caractères) : « MANIFESTATION / PARCOURS → BASTILLE » ; « DISPERSION / EN COURS / SORTIE RUE DE LYON » ; « ATTROUPEMENT / QUITTEZ LES LIEUX ».

### 2.5 Journalistes et observateurs
| Règle | Détail | Fiab. |
|---|---|---|
| Justifier de sa qualité | Carte d'identité de journaliste professionnel (« carte de presse ») ou carte de presse internationale ; à défaut, attestation normalisée de l'employeur | [V][6] §2.2.1 |
| Signe distinctif | Pas d'obligation de porter la mention « presse » ; brassards ou gilets « peuvent faciliter leur identification » | [V][6] §2.2.2 |
| Circulation | Ils peuvent, « à la différence des autres personnes présentes, circuler librement au sein des dispositifs de sécurité » | [V][6] §2.2.3.2 |
| **Pendant la dispersion** | Ils peuvent continuer « sans être tenus […] de quitter les lieux, dès lors qu'ils se placent de telle sorte qu'ils ne puissent être confondus avec les participants à l'attroupement et ne fassent pas obstacle à l'action des forces de l'ordre » | [V][6] §2.2.3.3 |
| Protection | Possibilité de « se positionner, de manière dérogatoire, derrière les cordons des forces de l'ordre » ; ils « peuvent porter des équipements de protection » | [V][6] §2.2.3.4 |
| Canal dédié | Un « référent » policier ou gendarme et une « boucle » de télécommunication pour les informer et signaler les violences contre eux | [V][6] §2.2.3.1 |
| Image | Les forces « ne peuvent […] s'opposer à la captation d'images ou de sons lors des opérations dans les lieux publics » | [V][6] §2.2.5 |
| Matériel | « les matériels des journalistes en particulier ne peuvent donc être confisqués » | [V][6] note 4 |
| Contrôle possible | Le passage au travers d'un cordon « peut être soumis au contrôle […] de leur qualité de journaliste » | [V][7] |
| **Observateurs indépendants** | Le Conseil d'État juge que journalistes **et observateurs indépendants** peuvent rester s'ils ne peuvent être confondus avec les manifestants et ne gênent pas | [V][9] |
| Statut détaillé des observateurs dans le texte de 2021 | Le schéma de 2021 ne cite que les journalistes dans ses dispositions ; les observateurs ne sont mentionnés que comme public devant comprendre les sommations | [V][6] §2.1.3 |

### 2.6 Encerclement (« nasse »)
Texte exact du point 3.1.4 du schéma de décembre 2021 [V][6] :

« Afin d'éviter le recours à des techniques de maintien de l'ordre pouvant présenter des risques supérieurs d'atteinte aux personnes, il peut être recouru à l'encerclement d'un groupe de manifestants pour prévenir ou faire cesser des violences graves et imminentes contre les personnes et les biens. »

« Cet encerclement doit, dès que les circonstances de l'ordre public le permettent, systématiquement ménager un point de sortie contrôlé pour ces personnes. L'encerclement ne peut être mis en œuvre que pendant une durée strictement nécessaire et proportionnée […] et doit, en tout état de cause, être levé dès la fin de la manifestation ou de l'attroupement. »

« Des actions spécifiques doivent être engagées pour communiquer régulièrement avec ces manifestants afin de les renseigner sur la situation. »

« Enfin, la possibilité qui leur est offerte de quitter la zone d'encerclement doit constamment être réévaluée avec discernement au regard de la persistance de la menace ou des troubles ayant justifié la mise en place de cette technique. »

| Paramètre de jeu | Valeur | Fiab. |
|---|---|---|
| Condition d'ouverture | Violences graves et imminentes dans le groupe visé (score de violence au-dessus d'un seuil) | [V][6] |
| Point de sortie | Au moins 1, largeur 2 m, tenu par 4 agents, contrôle visuel ou d'identité | [JEU] |
| Information des encerclés | Annonce au haut-parleur toutes les 120 s | [JEU] |
| Durée maximale sans réévaluation | 300 s en durée standard ; au-delà, malus d'image croissant | [JEU] |
| Sommations pendant un encerclement | Sans effet juridique sur ceux qui ne peuvent pas sortir (voir 1.6) | [S][16] |

### 2.7 Déclaration préalable et parcours
| Règle | Détail | Fiab. |
|---|---|---|
| Obligation | « Sont soumis à l'obligation d'une déclaration préalable tous cortèges, défilés et rassemblements de personnes, et, d'une façon générale, toutes manifestations sur la voie publique. » | [V][1] L. 211-1 |
| Où | À la mairie ; « A Paris, la déclaration est faite à la préfecture de police. » | [V][1] L. 211-2 |
| Quand | « trois jours francs au moins et quinze jours francs au plus avant la date de la manifestation » | [V][1] L. 211-2 |
| Contenu | « les noms, prénoms et domiciles des organisateurs », signature d'au moins l'un d'eux, « le but de la manifestation, le lieu, la date et l'heure du rassemblement […] et, s'il y a lieu, l'itinéraire projeté » | [V][1] L. 211-2 |
| Récépissé | « L'autorité qui reçoit la déclaration en délivre immédiatement un récépissé. » | [V][1] |
| Signataires | Un seul organisateur suffit depuis la loi n° 2019-290 du 10 avril 2019 (trois auparavant) | [V][6] §1.2 |
| Négociation du parcours | Échange « sous l'autorité du Directeur du service d'ordre » pour « définir de façon concertée un nouvel itinéraire si celui proposé initialement paraît inapproprié » et rappeler « la nécessité d'une désolidarisation rapide vis-à-vis des casseurs » | [V][6] §1.3 |
| Interdiction | Arrêté si la manifestation « est de nature à troubler l'ordre public », notifié immédiatement aux signataires ; possible avant même la déclaration | [V][1] L. 211-4 [6] §1.4 |
| Objets | Interdiction possible, pendant les 24 heures précédentes et jusqu'à dispersion, du port et du transport « d'objets pouvant constituer une arme », sur les lieux, les lieux avoisinants et leurs accès | [V][1] L. 211-3 |
| Service d'ordre des organisateurs | Peut inspecter le site, séparer public et acteurs, éviter les rixes, porter secours, alerter les forces de l'ordre, garder libres les itinéraires et issues ; peut être imposé par l'autorité | [V][7] |
| Organisateur en faute | Manifestation non déclarée, interdite, ou déclaration trompeuse : 6 mois d'emprisonnement et 7 500 € d'amende | [V][3] art. 431-9 |
| Participant | Participer à une manifestation **interdite** : contravention de la 4e classe. Participer à une manifestation simplement **non déclarée** n'est pas une infraction (Cour de cassation, 8 et 14 juin 2022) | [V][3] R. 644-4 ; [S][16] |
| Délais particuliers à Paris | Le site service-public mentionne une déclaration en ligne « 1 mois avant » à Paris ; l'instruction gendarmerie mentionne « 48h à Paris ». **Sources discordantes** : le code ne fixe aucun délai propre à Paris | [I][32][7] |
| Préparation du parcours | « information des commerçants, enlèvement des véhicules, neutralisation des conteneurs à verre et des éléments de chantier, vérification de la vacuité des halls d'immeubles et des jardins, fermeture des stations de métro » | [V][6] §2.3.3 |
| Contrôles en amont | Sur réquisition du procureur : visites de véhicules, inspection visuelle et fouille des bagages aux abords ; « Seuls les matériels pouvant servir d'armes et les matériels dont la détention est interdite peuvent être confisqués » | [V][6] §2.3.4 |
| Attroupement « typique » | Rassemblements « non déclarés ou interdits », « ne respectant pas les modalités fixées par la déclaration », ou « déclarés, après que les organisateurs ont donné l'ordre de dispersion » | [V][7] |

> **Ce que le jeu doit reproduire — Schéma national**
> - Trois **niveaux de tension** de scénario (maintien, rétablissement, violences urbaines) qui changent les moyens autorisés et le comportement des PNJ.
> - Une **fiche de mission** avant chaque partie : parcours déclaré (départ, itinéraire, point et heure de dispersion), effectif attendu, périmètres interdits, objets interdits, noms des secteurs, qui est l'autorité civile de chaque unité.
> - Rôles distincts et jouables : préfet / salle (stratégie), commissaire (droit, sommations, décision), commandant de CRS (manœuvre), gardien (exécution). Un ordre du commissaire peut être modifié, suspendu, annulé à tout moment.
> - **Équipe de liaison** PNJ (2 agents) près de la tête de cortège : tant que le contact est maintenu, la tension monte moins vite ; elle annonce les changements d'itinéraire et l'imminence de la dispersion.
> - Journalistes PNJ et joueur : libres de circuler, intouchables tant qu'ils se tiennent à l'écart ; toute force contre eux ou toute entrave à la prise d'images = faute lourde et chute de l'image publique.
> - Encerclement = manœuvre **conditionnelle** avec sortie contrôlée ; sans sortie ou sans violences graves, c'est une faute.
> - Avant le départ : mini-phase « prévention » (conteneurs à verre retirés, véhicules enlevés, stations fermées) qui réduit le nombre de projectiles et de feux disponibles pour les PNJ violents.

## 3. Règles d'emploi des armes de force intermédiaire

Source principale : instruction commune police / gendarmerie des 27 juillet et 2 août 2017 « relative à l'usage et l'emploi des armes de force intermédiaire », avec ses annexes (version en ligne incluant l'annexe GM2L) [V][8], complétée par le schéma national de 2021 [V][6].

### 3.1 Tableau maître : quelle arme dans quel cadre légal
Reproduction de l'annexe VIII de l'instruction (« Cadres légaux d'usage des armes de force intermédiaire ») [V][8] :

| Moyen | Après **2 sommations** (emploi de la force décidé par l'autorité habilitée) | Après **réitération de la dernière sommation** (usage des armes décidé par l'autorité habilitée) | **Violences, voies de fait, défense d'une position** (initiative du commandant de la force publique) | Légitime défense | Art. L. 435-1 | État de nécessité |
|---|---|---|---|---|---|---|
| LBD 40 mm | **NON** | **NON** | OUI | OUI | OUI | OUI |
| LBD 44 mm | NON | NON | OUI | OUI | OUI | OUI |
| Pistolet à impulsions électriques | NON | NON | **NON** | OUI | OUI | OUI |
| Grenades lacrymogènes | **OUI — uniquement lancées à la main** | OUI | OUI | OUI | OUI | OUI |
| Grenade lacrymogène instantanée / GM2L | NON | OUI | OUI | OUI | OUI | OUI |
| Lanceur de grenades 56 mm et 40 mm | NON | OUI | OUI | OUI | OUI | OUI |
| Grenade à main de désencerclement | NON | OUI | OUI | OUI | OUI | OUI |

Compléments :
- **Engin lanceur d'eau** : « relève […] du cadre légal d'emploi de la force, décidée par l'autorité habilitée, après les sommations d'usage » → colonne « après 2 sommations ». [V][13]
- **Bâton, bouclier, manœuvres de refoulement et de charge** : emploi de la force, donc après 2 sommations ou en riposte directe (aucun tableau officiel trouvé pour ces moyens). [I]
- Les précautions d'emploi « ne peuvent être opposées au policier ou au gendarme » lorsque l'arme intermédiaire est utilisée dans un cas où l'arme à feu létale serait légalement justifiée. [V][8]

### 3.2 LBD 40 (lanceur de balles de défense de 40 mm)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Nature | « lanceur à platine fixe, mono-coup, à canon rayé et basculant », avec « désignateur d'objectif électronique » (viseur) ; dotation **collective** | [V][8] |
| Projectile | « projectile en caoutchouc à effet cinétique », déformable à l'impact | [V][8] |
| Munition « CTS » | « tir optimum à 30 mètres » ; intervalle opérationnel **10 m à 50 m** | [V][8] |
| Munition de défense unique | distance optimale **25 m** ; intervalle opérationnel **3 m à 35 m** | [V][8] |
| En deçà de l'intervalle | « risques lésionnels plus importants » | [V][8] |
| Zones visées | « le tireur vise de façon privilégiée le torse ainsi que les membres supérieurs ou inférieurs. **La tête n'est pas visée** » | [V][8] |
| Personnes vulnérables | Éviter le tir si « état de vulnérabilité manifeste (blessure visible, état de grossesse apparent, situation de handicap évidente, âge de la personne visée, etc.) » | [V][8] |
| Tiers | Le tireur « s'assure que les tiers éventuellement présents se trouvent hors d'atteinte » ; tenir compte du risque de chute de la personne visée | [V][8] |
| Port | Approvisionné d'**une** cartouche ; un seul type de munition (« le panachage est prohibé ») ; « position de contact » : pointé vers la menace, canon sous l'horizontale, index le long du pontet | [V][8] |
| Qui | Fonctionnaires actifs titulaires **habilités** ; exclus : stagiaires, policiers adjoints, réservistes ; affectation temporaire, autorisée par la hiérarchie, inscrite au registre | [V][8] |
| Habilitation | Individuelle, recyclage tous les **3 ans** ; à l'examen, « un taux de 100 % d'impact en cible ainsi que l'atteinte de zones corporelles précises sont exigés » | [V][15] |
| **Superviseur** | « Pour tout tireur équipé de LBD 40 au sein d'une unité constituée engagée au maintien de l'ordre, hors le cas de la légitime défense, un superviseur sera désigné, chargé d'évaluer la situation d'ensemble et les mouvements des manifestants, de s'assurer de la compréhension des ordres par le tireur et de désigner l'objectif. » Vaut pour CRS, gendarmes mobiles, compagnies d'intervention, brigades anticriminalité, unités de circonstance. Fonction déjà imposée en gendarmerie avant 2020 [S][36] | [V][6] §3.3.2 |
| Caméra | Porteur doté « dans toute la mesure du possible » d'une caméra-piéton « à fixation ventrale de préférence », ou binôme tireur / porteur de caméra (le superviseur) ; enregistrer les conditions du tir | [V][6] §3.3.2 |
| Cadre en manifestation | Attroupement **et** violences ou voies de fait contre les forces, ou défense du terrain, « sans qu'il soit fait usage des sommations » | [V][8][14] |
| Après le tir | S'assurer de l'état de santé de la personne, surveillance permanente, examen médical « quelle que soit la zone corporelle atteinte » ; compte rendu écrit systématique (nombre de tirs, distance estimée) dans le traitement de suivi de l'usage des armes | [V][8] |
| Dimensions | Longueur 0,59 m (0,39 m crosse repliée), masse 2,05 kg, « ne produit pas de bruit de détonation » | [S][33] |

### 3.3 Grenades lacrymogènes (à main et au lanceur)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Cadre à la main | Emploi de la force : après les **2 sommations**, sur décision de l'autorité habilitée | [V][8] |
| Cadre au lanceur | Usage des armes : après **réitération** de la dernière sommation, ou riposte directe | [V][8] |
| Ordre | « l'initiative de l'utilisation du lanceur de grenades n'appartient pas au fonctionnaire ou au militaire qui en est doté. Elle ne peut que procéder de l'ordre de la hiérarchie » | [V][8] |
| Trajectoire | « le tir tendu est strictement interdit ». Le tir courbe (explosion et dispersion en l'air) évite que les personnes « ne soient directement impactées et ne puissent les ramasser au sol afin de les renvoyer » | [V][8] |
| Binôme | « un superviseur et un ou plusieurs lanceurs » ; le superviseur évalue la situation, s'assure de la compréhension des ordres, alerte sur « les conditions environnementales susceptibles de rendre le tir inopérant ou dangereux » (vent, par exemple) | [V][8] |
| Interdits | Locaux de faible capacité (sauf exception) ; conducteur d'un véhicule en mouvement ; désencerclement tirée au lanceur | [V][8] |
| Lanceurs | « lanceur mono-tube » ou lanceurs « multi-coups, disposant d'un magasin rotatif à six chambres » ; calibres autorisés : 56 mm et 40 mm | [V][8][1] |
| Qui | Tout fonctionnaire ou militaire **habilité** (stagiaires compris) ; les élèves gardiens sont habilités en école au lanceur de 56 mm et à la grenade de désencerclement | [V][8][15] |
| Portées au lanceur | Dispositifs de propulsion à retard de **50 m, 100 m et 200 m** | [V][8] |
| Portée à la main | 5 à 30 m | [S][33] |
| Grenade lacrymogène à capsules | Diamètre 56 mm ; 6 capsules actives ; **émission 30 s** ; zone couverte environ **800 m²** sur 3 à 5 m de haut ; masse 340 g | [S][33] |
| Cadence d'un lanceur mono-tube | 6 à 8 coups par minute ; masse 3,67 kg ; longueur 0,765 m | [S][33] |

### 3.4 Grenade GM2L et grenades à effet sonore
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Historique | La grenade GLI-F4 (triple effet lacrymogène, assourdissant et de souffle, charge explosive) « a été retirée du service le 26 janvier 2020 » | [V][6][8] |
| Remplacement | « remplacée par la GM2L pour les utilisations avec lanceur, et par une grenade à effet sonore pour les lancers à main » | [V][6] §3.3.1 |
| GM2L | Calibre 56 mm ; lancée à la main ou propulsée, « portée maximale de 200 mètres » ; « double effet, à la fois lacrymogène et assourdissant. Elle ne projette aucun éclat vulnérant » ; pas d'explosif | [V][8][6] |
| Cadre | Après sommations **réitérées** (« sur ordre exprès de l'autorité habilitée ») ou en riposte directe ; **jamais après les seules 2 sommations** | [V][8] |
| Précautions | Sur ordre hiérarchique uniquement ; binôme superviseur / lanceur ; tir tendu interdit ; pas de locaux de faible capacité | [V][8] |
| Niveau sonore | 165 dB cité pour l'ancienne GLI-F4 ; valeur de la GM2L **non trouvée** | [S][33] / [I] |
| Évolutions récentes | Wikipédia mentionne une grenade « ASSD » utilisée depuis 2022 et suspendue en 2026, et des modèles « EF-SON » et « GL-304 » depuis juillet 2025 | [S][35] |

### 3.5 Grenade à main de désencerclement
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Objet | Utilisée « lorsque les forces de l'ordre se trouvent en situation d'encerclement ou de prise à partie par des groupes violents ou armés » ; « permet de déstabiliser un groupe d'agresseurs en le faisant se replier ou en le dispersant » | [V][8] |
| Retard | « bouchon allumeur à retard de **1,5 seconde** » | [V][8] |
| Effet | « forte détonation » et projection de **18 galets en caoutchouc** et du bouchon allumeur | [V][8] |
| Rayon | « rayon maximal d'efficacité de **10 mètres** » | [V][8] |
| Portée de lancer | « Elle peut être lancée à une distance de **30 mètres** » | [V][8] |
| Geste | « Elle doit être lancée **au ras du sol**, en direction du groupe d'éléments hostiles à disperser » | [V][8] |
| Interdits | « Elle ne doit pas être employée à partir d'un lanceur » ; milieu fermé limité ; l'utilisateur « doit dans la mesure du possible être protégé ou abrité » | [V][8] |
| Cadre | Après sommations réitérées, ou directement en cas de violences contre les forces ou défense du terrain | [V][8] |
| Modèle | Anciens modèles retirés « à compter de septembre 2020 » et remplacés par un « nouveau modèle (marché de 2019) moins vulnérant » ; appelé « grenade à éclats non létaux » selon Wikipédia | [V][6] §3.3.3 ; [S][34] |
| Autres données | Plus de 150 dB ; galets de 9,3 g | [S][33] |

### 3.6 Canon à eau (engin lanceur d'eau)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Nom officiel | « engin lanceur d'eau » (ELE) ; « moyens d'appui ayant uniquement vocation à faciliter et appuyer les manœuvres des unités constituées » | [V][13] |
| Effets recherchés | Faciliter la dispersion d'un attroupement, neutraliser des obstacles « en particulier enflammés », concourir à la défense d'un point | [V][7] |
| Cadre | Emploi de la force, décidé par l'autorité habilitée, après les sommations | [V][13] |
| Décision d'engagement | L'emploi de ces moyens spéciaux est décidé par le préfet de zone | [V][7] |
| Capacité | Entre **4 000 et 7 500 litres** d'eau | [V][11] |
| Variante | Lanceur d'eau portable, branché en permanence sur une borne d'incendie | [V][11] |
| Parc CRS | 2018 : quatre engins qui « ne projettent que de l'eau » (deux d'un modèle « 4000 », deux d'un modèle « 6000 »), deux engins à citerne d'eau et trois citernes d'additifs, trois engins récents à cuve d'eau et compartiment d'émulsifiant. 2021 : « 10 engins lanceurs d'eau », dont deux achetés en 1996 | [V][13][11] |
| Additifs | Émulsifiant anti-incendie mélangé à 6 % ou 7 % en sortie de lance (feux de barricades, de poubelles, de véhicules). Des citernes de lacrymogène et de colorant existent mais « n'ont jamais été utilisés envers des manifestants » | [V][13] |
| Pression | 20 bars (chiffre de presse repris dans une question parlementaire) | [S][13] |
| Portée du jet, débit, équipage | **non trouvé** | [I] |
| Unité servante | Sections des moyens spécialisés des CRS, une par direction zonale (7) | [S][17] |
| Valeurs de jeu | Portée utile 40 m (jet plein), 15 m (jet diffus) ; débit 20 l/s ; réserve 6 000 l soit 300 s de jet continu ; équipage 3 (conducteur, chef d'engin, opérateur de lance) | [JEU] |

### 3.7 Gazeuse (aérosol lacrymogène) et bâton
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Texte d'emploi spécifique | **Non trouvé** : l'instruction de 2017 ne couvre ni l'aérosol ni le bâton | [I] |
| Règle générale applicable | « Le policier ou le gendarme emploie la force dans le cadre fixé par la loi, seulement lorsque c'est nécessaire, et de façon proportionnée au but à atteindre ou à la gravité de la menace » | [V][1] R. 434-18 |
| Formation | Les élèves gardiens de la paix sont habilités « aux bâtons de police » ; les officiers aussi | [V][15] |
| Bâton dans la dotation | Bouclier anti-émeute et bâtons de défense font partie de l'équipement des CRS et des gendarmes mobiles | [S][17][18] |
| Règles de jeu | Aérosol : portée 4 m, cône de 30°, usage en défense rapprochée ou après sommations ; jamais sur une personne maîtrisée ou menottée. Bâton : frappes aux membres et au tronc ; **toute frappe à la tête, sur une personne au sol ou maîtrisée = faute** | [JEU] |

### 3.8 Arme de service
Article L. 435-1 du code de la sécurité intérieure [V][8] : usage des armes « en cas d'absolue nécessité et de manière strictement proportionnée », notamment « 1° Lorsque des atteintes à la vie ou à l'intégrité physique sont portées contre eux ou contre autrui ou lorsque des personnes armées menacent leur vie ou leur intégrité physique ou celles d'autrui ». Les autres cas (défense des lieux après deux sommations à haute voix, fuite, véhicule, périple meurtrier) ne concernent pas le gameplay de manifestation. Dans le jeu : **légitime défense uniquement**, enquête automatique après tout tir.

### 3.9 Compte rendu après usage
| Obligation | Détail | Fiab. |
|---|---|---|
| Police nationale | « il est systématiquement rendu compte par écrit de l'usage de l'arme, que celui-ci soit suivi ou non d'une interpellation, en détaillant les conditions légales justifiant son emploi ainsi que ses modalités d'utilisation (nombre de tirs, distance estimée, etc.) » ; déclaration individuelle dans le traitement de suivi de l'usage des armes | [V][8] |
| Gendarmerie | Procédure de compte rendu d'événement grave | [V][8] |
| Commandant d'unité | Rend compte « de tout emploi de la force, usage des armes ou incident survenu » | [V][7] |
| Compte rendu d'opération | Doit détailler « le nombre de munitions tirées (grenades par type, munitions LBD…) », le nombre d'agents blessés, « le nombre connu de manifestants blessés », « le nombre d'interpellations réalisées par l'unité », toute mise en cause éventuelle | [V][7] |
| Renseignement d'ambiance | Tout agent rend compte de la « physionomie générale » : « volume, attitude et intention », slogans, comportement du service d'ordre, incidents (localisation, nature, gravité) | [V][7] |
| Personne touchée | Vérifier l'état de santé, surveillance permanente, examen médical, certificat descriptif | [V][8] |
| Ordre de grandeur | Gendarmerie, fin 2018 et année 2019 : 990 tirs de LBD 40, 320 grenades de désencerclement, 28 353 grenades lacrymogènes, 788 grenades GLI-F4 ou GM2L | [V][11] |

> **Ce que le jeu doit reproduire — Armes de force intermédiaire**
> - Le **tableau 3.1 codé tel quel** : une matrice `moyen × état juridique` qui dit « autorisé / interdit ». Toute arme tirée hors case autorisée déclenche une enquête.
> - LBD : tir légal seulement sur un PNJ **en train de commettre des violences** (ou dans la seconde qui suit), entre 10 m et 50 m (munition standard), sur le torse ou les membres ; superviseur PNJ qui désigne la cible (« Objectif : individu capuche noire, lanceur de pavés, 25 mètres ») ; caméra ventrale qui enregistre. Impact à la tête, tir à moins de 10 m, tir sur un pacifique, un journaliste, un secouriste ou une personne vulnérable = faute lourde.
> - Lanceur de grenades : visée **en cloche uniquement** (angle minimal imposé, par exemple 30°) ; trois portées discrètes 50 / 100 / 200 m ; tir sur ordre du chef ; indicateur de vent tenu par le superviseur. Les PNJ violents peuvent ramasser et renvoyer une grenade tombée au sol.
> - Nuage lacrymogène : 30 s d'émission, rayon de 15 à 20 m, dérive au vent ; il fait fuir tous les PNJ, y compris les pacifiques, et gêne les agents sans masque.
> - Désencerclement : lancer roulé au sol, détonation à 1,5 s, effet dans 10 m, portée de lancer 30 m ; réservée aux situations d'encerclement de l'unité.
> - Canon à eau : appui décidé par l'échelon supérieur, mode jet plein ou diffus, mode extinction avec mousse ; réserve d'eau finie.
> - **Écran de fin de mission = compte rendu d'opération** : munitions par type, tirs de LBD avec distance estimée et cadre légal coché, blessés des deux côtés, interpellations.

## 4. Organisation des forces

### 4.1 Compagnie républicaine de sécurité (CRS)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Statut | Police nationale ; « réserve générale à la disposition du Gouvernement » avec les escadrons de gendarmerie mobile | [V][6] §2.4.5 |
| Volume national | Environ 11 000 agents (2021) ; 13 100 en 2018 ; **60 compagnies de service général** d'environ 130 agents (l'article donne aussi le chiffre de 64, dont 5 « à projection rapide » : incohérence interne) | [S][17] |
| Effectif d'une compagnie | Environ **130 fonctionnaires** hors officiers | [S][17] |
| Qui commande | Un **commandant de police** ; encadrement type : 1 commandant, 1 capitaine, 2 lieutenants, 1 major responsable d'unité ou major de compagnie, 1 à 4 majors, 10 à 20 brigadiers-chefs, 100 à 150 gardiens de la paix | [S][17] |
| Section de commandement et des services | 15 à 20 agents (administration, logistique) | [S][17] |
| Sections de service général | **4 sections** : 2 sections d'appui et de manœuvre (SAM), dont une formée au risque nucléaire, radiologique, biologique et chimique, et 2 sections de protection et d'intervention (SPI) | [S][17] |
| Passage de 3 à 4 sections | Des compagnies étaient « passées de quatre à trois sections » ; objectif ministériel : qu'elles « disposent de quatre sections » | [V][11] |
| Effectif d'une section sur le terrain | Une quinzaine d'agents ; « 20 policiers au maximum » dans une note interne de janvier 2023 | [S][17][20] |
| SPI de 4e génération | « habilités à procéder à des interpellations dans l'environnement immédiat de leur unité » ; 25 gardiens et gradés, commandées par un officier ou plus souvent un major ; un secouriste par section | [V][11][6] ; [S][17] |
| Groupes tactiques | Chaque section : 3 groupes **A, B, C** ; **C = groupe de commandement** (« 1C » = commandement de la 1re section) | [S][17] |
| Marquage dorsal | Numéro de section + lettre de groupe (« 1B », « 4B »), visible sur les photos du schéma national | [V][6] p. 5 et 10 |
| Demi-compagnie | « Demi-Alpha » et « Demi-Bravo » | [S][17] |
| Niveaux supérieurs | Groupe de compagnies, puis groupement opérationnel (commandé par des officiers supérieurs CRS ou des commissaires) | [V][7] ; [S][17] |
| Compagnies à projection rapide | CRS 8 (Bièvres, juillet 2021) : 200 agents, trois sections, départ en 15 minutes, rayon de 300 km ; puis CRS 81, 82, 83, 84 | [S][17] |
| Casque | Noir à **deux bandes jaunes** (introduites après 1968) | [S][17] ; [V][6] photos |
| Écusson | Flambeau entouré de feuilles de chêne et de laurier (1947) ; écusson rouge | [S][17] |
| Équipement de maintien de l'ordre | Casque, gilet, protections bras et jambes, gants, bouclier, bâton ; lanceur de grenades de 56 mm, LBD, grenades | [S][17] |
| Couleurs approximatives | Tenue bleu marine très sombre `#14182B` ; bandes de casque `#F2C200` ; inscription dorsale blanche `#FFFFFF` ; écusson rouge `#C8102E` | [JEU] |

Articulation de jeu d'une compagnie déployée [JEU], cohérente avec les chiffres ci-dessus : **commandement 6** (commandant, adjoint, 2 radios, conducteur, porte-fanion vidéo) + **4 sections de 18** (groupe A 7, groupe B 7, groupe C 4) = **78 agents à pied**, plus conducteurs restés aux véhicules.

### 4.2 Escadron de gendarmerie mobile (EGM)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Statut | Militaires ; « unité élémentaire de la gendarmerie mobile » | [V][7] |
| Volume national | Environ 13 000 gendarmes ; 116 escadrons selon Wikipédia (108 dans un rapport de 2015) | [S][18] |
| Effectif théorique | Environ **110 militaires** en 5 pelotons | [S][18] |
| Qui commande | Un officier : **capitaine** ou chef d'escadron | [V][7] ; [S][18] |
| Pelotons | Pelotons de marche + **peloton d'intervention** + **peloton hors rang** (soutien : secrétariat, matériels, transmissions, ordinaire) | [V][7] |
| Sur le terrain | Groupe de commandement + 3 ou 4 pelotons de **16** gendarmes ; configuration « alpha » (4 pelotons) ou « bravo » (3 pelotons) | [S][18] |
| Réalité déclarée | « à peine […] trois pelotons, soit cinquante-cinq personnels actifs au sol » ; pelotons de 20 dans une note de janvier 2023 | [V][11] ; [S][20] |
| Peloton | Commandé par un officier ou un gradé supérieur ; deux groupes égaux | [V][7] ; [S][18] |
| Peloton d'intervention | « réserve d'intervention » du commandant ; agit sur les flancs et les arrières, interpelle « sous le contrôle d'un OPJ » (officier de police judiciaire) ; ne tient pas de mission statique ; peut « déclencher une action sans devoir en solliciter l'autorisation au préalable » | [V][7] |
| Appuis du commandant | Deux sous-officiers transmissions au minimum, un sous-officier chargé de la rame de véhicules, une cellule images, un **chef appui-feu** « pour coordonner et superviser les tirs » | [V][7] |
| Demi-escadron | Emploi possible à deux pelotons, à titre exceptionnel | [V][7] |
| Niveaux supérieurs | Groupement tactique de gendarmerie (2 à 6 escadrons), groupement opérationnel de maintien de l'ordre | [V][7] |
| Numérotation | « 15/6 », « 25/6 » : escadron / région zonale | [S][18] |
| Casque | **Entièrement bleu** | [S][18] ; [V][6] photos |
| Véhicules | Deux véhicules de groupe par peloton | [S][18] |
| Blindés | Véhicules blindés polyvalents, avec « armements de force intermédiaire embarqués » et sonorisation ; « Son engagement est alors décidé par les autorités gouvernementales » | [V][7] |
| Grilles | Dispositif de retenue autonome du public : 3 à 5 vantaux selon la largeur de l'axe ; missions défensives uniquement, jamais en charge | [V][7] |
| Autorité civile | Les escadrons sont « engagés à 80 % en zone police et sont donc placés sous une autorité civile […] qui, souvent, est un commissaire de police » | [V][11] |
| Couleurs approximatives | Tenue bleu nuit `#1A2238` ; casque `#2A5CAA` ; bandeau dorsal « GENDARMERIE » blanc sur fond sombre | [JEU] |

### 4.3 Compagnies d'intervention et BRAV-M (préfecture de police)
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Compagnies d'intervention | « moyens propres spécialisés en maintien de l'ordre » de la préfecture de police, « équivalents des CRS par leur formation et leur fonctionnement » | [V][6][11] |
| Effectif | « 220 personnes, dont 120 sur le terrain, soit un total de 1 760 personnes » (soit 8 compagnies) ; elles « prennent en charge 75 % des manifestations parisiennes » | [V][11] |
| Casque | Casques de police sombres à **bande bleue** sur les photos du schéma national (attribution aux compagnies d'intervention probable, non légendée) | [S][6] p. 5 |
| BRAV-M | « brigades mobiles constituées de binômes à moto » ; créées en **mars 2019** par le préfet de police, issues des détachements d'action rapide de décembre 2018 | [V][11] ; [S][19] |
| Rattachement | Direction de l'ordre public et de la circulation ; depuis fin 2020, service motocycliste permanent adossé à la 24e compagnie d'intervention | [S][19] |
| Équipage | **Un pilote + un passager**. « les effectifs qui assurent le maintien de l'ordre ne sont pas les conducteurs, mais les passagers, qui mettent pied à terre avant de former des groupes et d'intervenir » | [V][11] |
| Origine des agents | Pilotes du service motocycliste (plus d'une centaine en 2024) ; passagers issus des compagnies d'intervention | [S][19] |
| Mission | Se déplacer vite dans Paris, intervenir face aux groupes à risque, interpeller | [V][11][6] §3.1.2 |
| Appui | Motos de sapeurs-pompiers d'intervention rapide accompagnant les unités depuis 2020 ; fourgons qui suivent | [S][38] |
| Volume engagé | 19 janvier 2023 : 2 unités à moto + 5 unités à pied ; 69 sections de CRS et 56 pelotons de gendarmes mobiles ; environ 2 500 agents pour 50 000 à 80 000 manifestants attendus | [S][20] |
| Nombre de motos par unité, commandement | **non trouvé** | [I] |
| Valeurs de jeu | 1 unité = 18 motos = 36 agents (18 pilotes, 18 opérateurs) en 3 groupes de 6 motos ; débarquement en 5 s ; 1 pilote sur 3 garde les motos | [JEU] |

### 4.4 Préfecture de police de Paris et salle de commandement
| Paramètre | Valeur | Fiab. |
|---|---|---|
| Préfet de police | Responsable de l'ordre public à Paris et dans la petite couronne ; seul, avec ses délégués, à pouvoir faire les sommations (pas de maire à Paris) | [V][1][6][11] |
| Direction de l'ordre public et de la circulation | Chargée à Paris « du maintien de l'ordre public », « de la protection des institutions de la République et des représentations diplomatiques », de la circulation ; compétente aussi en petite couronne | [V][22] |
| Effectif | Environ 5 500 personnels (2020) | [S][11] |
| Commandement unifié | Depuis 2019, tout fonctionnaire engagé au maintien de l'ordre passe sous la chaîne de commandement de cette direction | [V][11] |
| Structure | État-major ; sous-direction de l'ordre public de l'agglomération parisienne ; groupement des compagnies d'intervention | [S] (arrêtés d'organisation, non lus intégralement) |
| **Salle de commandement** | Appelée « CICOP DOPC » dans une fiche interne de 2020, « chargé de la supervision de la manifestation » | [V][21] |
| Images | Les images des drones arrivent sur un serveur séparé, « uniquement sur un écran spécifique » ; aucun enregistrement ; floutage des silhouettes, véhicules et fenêtres que la salle « n'a pas la possibilité technique de suspendre » | [V][21] |
| Transmission des ordres | « CRS comme gendarmes mobiles reçoivent l'ordre par la salle de commandement […], relayé par l'officier supérieur de gendarmerie ou par le commissaire des CRS qui s'y trouve » | [V][11] |
| Radio | La direction « est censée diriger et centraliser les conférences radio mises en place pour les différentes divisions sur le terrain » (témoignage syndical de 2019, avant l'unification du commandement) | [V][11] |
| Défaut connu | À Paris, « les chefs de secteur attendent des instructions d'une salle de commandement », ce qui rend les forces « moins agiles » ; le schéma national veut l'inverse | [V][11][6] |
| Emplacement, nombre d'écrans, effectif de la salle | **non trouvé** | [I] |

### 4.5 L'autorité civile auprès du commandant d'unité
« les unités de police ou de gendarmerie qui interviennent n'ont pas le pouvoir de décision : le décideur est l'autorité civile, qui est toujours identifiable et responsable devant le Gouvernement, mais aussi l'opinion et les élus. » [V][11]

| Décision | Autorité civile (commissaire) | Commandant de la force publique (commandant de CRS) |
|---|---|---|
| Qualifier le rassemblement d'attroupement | **Oui** | Non |
| Faire les sommations | **Oui** (ou officier de police judiciaire désigné) | Non |
| Autoriser l'emploi de la force | **Oui** | Non |
| Autoriser l'usage des armes (grenades au lanceur, désencerclement) | **Oui**, ordre exprès et traçable | Non |
| Fixer la mission, l'effet à obtenir, le cadre légal | **Oui** | Reçoit |
| Choisir la manœuvre, l'articulation, le rythme, les moyens dans le cadre autorisé | Non | **Oui** (« relèvent de ses seules prérogatives ») |
| Riposter à des violences contre l'unité, défendre le terrain | Informé | **Oui**, d'initiative |
| Suspendre ou annuler l'action | **Oui**, à tout moment | Exécute |
| Tracer les ordres reçus | — | **Oui** |
| Conseiller | Écoute | **Oui** (« en conseillant de manière continue et constructive ») |

Sources : [V][1] R. 211-14 et R. 211-21 ; [V][6] §2.4.4 ; [V][7].

### 4.6 Grades de la police nationale et insignes
Trois corps [S][23] : corps d'encadrement et d'application (gardiens et gradés), corps de commandement (officiers), corps de conception et de direction (commissaires). Description des galons d'après une reprise du texte réglementaire (arrêté du 9 décembre 2019) [S][24], recoupée par deux images de référence [S][25]. Fond : bleu nuit ; pour les CRS, fond bleu clair ou bleu-gris avec flambeau [S][23].

| Grade | Corps | Insigne de grade | Rôle type en jeu |
|---|---|---|---|
| Policier adjoint | contractuel | Fond bleu uni, sans galon | Non employé au contact |
| Élève gardien | application | Fond bleu uni, sans galon | Tutoriel |
| Gardien de la paix stagiaire | application | **1 chevron** argent (8 mm) | Début de carrière |
| **Gardien de la paix** | application | **2 chevrons** argent emboîtés, en forme de « V » (largeur totale 18 mm) | Porte-bouclier, lanceur, tireur LBD habilité |
| Gardien de la paix à partir du 6e échelon (ancien « sous-brigadier ») | application | **3 chevrons** argent (28 mm) | Gardien confirmé, superviseur |
| **Brigadier** (grade **supprimé le 1er août 2023**) | application | 1 barrette **or** de 10 mm traversée d'une **raie rouge** de 1 mm | À ne garder qu'en option « avant 2023 » |
| **Brigadier-chef** | application | 1 barrette **argent** de 10 mm à **raie rouge** | Chef de groupe (A ou B) |
| **Major** | application | Barrette argent à raie rouge **+ fin liseré argent** de 2 mm placé à 4 mm | Chef de section, adjoint |
| Major à l'échelon exceptionnel / responsable d'unité locale | application | Idem + losange à contour or / à contour blanc | Major de compagnie |
| Capitaine pendant ses 4 premières années (appelé « lieutenant ») | commandement | **2 barrettes** blanches de 10 mm | Chef de section |
| **Capitaine** | commandement | **3 barrettes** blanches de 8 mm | Adjoint au commandant de compagnie |
| **Commandant** | commandement | **4 barrettes** blanches de 7 mm (3 serrées + 1 séparée de 4 mm) | **Commandant de compagnie de CRS** |
| Commandant divisionnaire | commandement | 4 barrettes + 1 pointe de diamant or (argent pour l'emploi fonctionnel) | Chef de groupement |
| **Commissaire** | direction | **Branche de 5 feuilles de chêne et 1 gland**, cordon de bordure de 3 mm | **Autorité civile**, chef de secteur |
| Commissaire divisionnaire | direction | Branche de 7 feuilles de chêne et 2 glands + 2 barrettes verticales | Directeur du service d'ordre adjoint |
| Commissaire général | direction | 2 pointes de diamant or + branche de 9 feuilles et 3 glands | Directeur |
| Contrôleur général / inspecteur général / directeur des services actifs / directeur général | emplois | 2 / 3 / 4 / 5 pointes de diamant argent + branche de 9 feuilles | Hors gameplay |

Couleurs approximatives [JEU] : fond `#0B1A4A` ; argent `#C9CED6` ; blanc `#F4F4F4` ; or `#D4AF37` ; raie rouge `#D0021B`. Dimensions de l'insigne de poitrine : environ 22 × 16 mm pour les modèles du commerce [S][39] ; dans le jeu, un rectangle de 0,05 × 0,035 m sur la poitrine gauche et sur les épaules reste lisible.

Réformes à connaître [S][23] : grade de brigadier supprimé le 1er août 2023 (les gardiens accèdent directement à brigadier-chef) ; brigadier-major remplacé par major en 2009 ; échelon exceptionnel de major en extinction depuis le 1er janvier 2024 ; le lieutenant n'est plus un grade mais une appellation.

Progression de carrière proposée [JEU] : gardien stagiaire → gardien → gardien 3 chevrons → brigadier-chef → major → capitaine (concours ou promotion) → commandant → commissaire (rôle séparé, déblocable).

### 4.7 Vocabulaire tactique officiel (ordres utilisables tels quels)
Extraits de l'annexe « Vocabulaire tactique » de l'instruction gendarmerie [V][7] :

| Verbe | Définition |
|---|---|
| TENIR | « Occuper et défendre un point ou un espace de terrain pour empêcher qu'il soit occupé ou utilisé. » |
| INTERDIRE | « Empêcher l'adversaire d'avoir accès à telle portion de terrain ou de franchir telle ligne » |
| BOUCLER | « Établir un dispositif continu le long d'une ligne définie, isoler une portion de terrain » |
| CANALISER | « Restreindre l'action de l'adversaire dans une zone étroite par l'utilisation combinée d'obstacles, de feux et de manœuvres » |
| FILTRER | « Autoriser le franchissement du dispositif […] par une ou plusieurs personnes préalablement identifiées et dûment contrôlées. » |
| FIXER | « Exercer sur l'adversaire une pression suffisante pour lui interdire tout mouvement » |
| DÉGAGER | « Libérer un emplacement, un secteur ou une zone de tout obstacle et de toute présence adverse. » |
| INTERPELLER | « Se saisir de toute personne ayant commis une ou plusieurs infractions. » |
| APPUYER | « Apporter une aide à une autre unité, spontanément ou sur ordre, par le mouvement ou par le feu. » |
| ROMPRE LE CONTACT | Soustraire de la pression adverse, « en ordre et en sûreté », tous les éléments engagés |
| SE REPLIER | « Rompre le contact avec l'adversaire et exécuter un mouvement rétrograde tout en assurant […] sa propre couverture. » |
| S'INTERPOSER | « Placer une force tierce entre deux parties opposées pour dissuader toute confrontation. » |

Manœuvres dynamiques nommées dans les textes : « vague de refoulement », « charge » [V][7] ; « barrage, charge, bond offensif » [S][18] ; « barrages de canalisation ou d'interdiction » [V][10]. Leur description géométrique (distances, vitesses, formations) n'a pas été trouvée dans une source ouverte. [I]

> **Ce que le jeu doit reproduire — Organisation**
> - Une compagnie de CRS = commandement + 4 sections à 3 groupes (A, B, C), marquage dorsal « 1A », « 1B », « 1C »… ; casques à deux bandes jaunes. Un escadron = commandement + 3 ou 4 pelotons de 16, casques bleus. Une compagnie d'intervention parisienne = jusqu'à 120 agents, casque à bande bleue.
> - En mode « commandant », le joueur donne des ordres avec les **verbes du tableau 4.7** appliqués à un groupe, une section ou la compagnie, sur un lieu désigné.
> - Un **commissaire PNJ** colle au joueur-commandant (et inversement) : dialogue demande / autorisation, écharpe, mégaphone. Le tableau 4.5 est la table de permissions.
> - Section de protection et d'intervention / peloton d'intervention = groupe d'interpellation gardé en réserve, à lancer sur les flancs.
> - BRAV-M : arrivée rapide à moto, débarquement des passagers, action à pied ; pilotes en garde des machines.
> - Salle de commandement : vue carte + retours vidéo (drone flouté), ordres descendants avec délai ; option de scénario « commandement centralisé » (latence des autorisations) contre « déconcentré » (le commissaire de terrain décide).
> - Galons du tableau 4.6 sur la poitrine et les épaules ; le grade conditionne les actions (habilitations, droit de commander un groupe, une section, la compagnie).

## 5. Radio

### 5.1 Réseaux
| Élément | Valeur | Fiab. |
|---|---|---|
| Réseau de la police nationale | ACROPOL (« automatisation des communications radiotéléphoniques opérationnelles de police »), numérique, en service depuis 1994, bande 380–410 MHz ; partagé au sein de l'infrastructure nationale avec les réseaux des pompiers et de la gendarmerie, avec lesquels il est interopérable | [S] (résultats de recherche : encyclopédies techniques, questions parlementaires) |
| Mode d'exploitation | Réseau **dirigé** : l'information opérationnelle passe par le centre d'information et de commandement. Définition : réseau « dirigé » = les stations secondaires doivent « obtenir l'autorisation de la station directrice avant de communiquer entre elles » ; réseau « libre » = sans autorisation préalable | [S][26] |
| Station directrice | « la station qui dessert en principe la plus haute autorité. C'est elle qui est chargée de faire appliquer les règles de procédure. » | [S][26] |
| À Paris | « conférences radio » par division, centralisées par la direction de l'ordre public et de la circulation | [V][11] |
| Gendarmes mobiles | Au moins deux sous-officiers transmissions accompagnent le commandant d'escadron | [V][7] |
| Évolution | Expérimentations d'outils sur réseaux 4G / 5G dans le cadre du « Réseau radio du futur » | [V][6] §3.4.6 |

### 5.2 Procédure et mots conventionnels
Source : support de formation « La procédure radio » (police territoriale) [S][26]. Aucune source officielle de la police nationale n'a été trouvée ; ces termes sont ceux de la procédure radiotéléphonique française courante.

| Mot | Sens exact donné par la source |
|---|---|
| « ICI » | Sépare l'indicatif appelé de l'indicatif appelant : « 5R ICI 4M CONTRÔLE RADIO PARLEZ » |
| « PARLEZ » | « J'ai terminé ma transmission, à vous de parler » |
| « REÇU » | « J'accuse réception de votre transmission » |
| « TERMINÉ » | « J'ai terminé ma transmission et je ne demande pas de réponse » |
| « ATTENDEZ » | « Attendez, je vais répondre dans quelques secondes » |
| « ATTENDEZ-TERMINÉ » | Attente de plus de quelques secondes, restez à l'écoute |
| « COLLATIONNEZ » | « Répétez toute ma transmission » |
| « RÉPÉTEZ » | « Répétez (la partie indiquée) » ; avec « TOUT AVANT », « TOUT APRÈS », « LE MOT AVANT », « LE MOT APRÈS » |
| « FAITES L'APERÇU » | « Avez-vous compris ma transmission, êtes-vous en mesure de l'exécuter » |
| « APERÇU » | « J'ai bien compris votre transmission et je suis en mesure de l'exécuter » |
| Qualité de liaison | Force : FORT, ASSEZ FORT, FAIBLE, TRÈS FAIBLE. Lisibilité : CLAIR, LISIBLE, DÉFORMÉ, AVEC INTERFÉRENCE. Réponse type : « ICI 4M FORT ET LISIBLE TERMINÉ » |

Règles d'usage [S][26] : alternat (un seul parle à la fois) ; s'assurer que le réseau est libre ; respecter l'ordre des appels ; **appuyer et attendre 1 seconde avant de parler** ; messages « BREF, CLAIR et PRÉCIS ».

### 5.3 Alphabet et chiffres
Alphabet réglementaire [S][26] : ALFA, BRAVO, CHARLIE, DELTA, ECHO, FOXTROT, GOLF, HOTEL, INDIA, JULIETT, KILO, LIMA, MIKE, NOVEMBER, OSCAR, PAPA, QUEBEC, ROMEO, SIERRA, TANGO, UNIFORM, VICTOR, WHISKEY, X-RAY, YANKEE, ZULU.

Chiffres [S][26] : transmis **chiffre par chiffre**, sauf les multiples exacts de mille (« 45 » → « QUATRE-CINQ » ; « 5000 » → « CINQ MILLE »). Variante anti-confusion : « UN tout seul », « DEUX un et un », « TROIS deux et un », « QUATRE deux fois deux », « CINQ trois et deux », « SIX deux fois trois », « SEPT quatre et trois », « HUIT deux fois quatre », « NEUF cinq et quatre ».

### 5.4 Indicatifs
| Point | Constat | Fiab. |
|---|---|---|
| Principe | « L'indicatif est un terme conventionnel attribué à une station », nominatif ou collectif ; exemples donnés : « Jupiter 4, Hirondelle 2, Victor, Roméo » | [S][26] |
| Indicatifs réels de la police nationale | Un support de formation non officiel cite « TI » pour un commissaire, « TO » pour un capitaine, « TL » pour un lieutenant ; un forum de jeu de rôle cite « TN » pour la station directrice et « TV » pour un véhicule. **Aucune confirmation officielle** | [I] |
| Indicatifs de la salle parisienne, des CRS, des autorités | **non trouvé** | [I] |
| Marquage tactique CRS réutilisable à la radio | Section + lettre de groupe : « 1 ALFA », « 1 BRAVO », « 1 CHARLIE » (commandement) | [S][17] |

Plan d'indicatifs **fictif** proposé [JEU] (aucune ressemblance voulue avec des indicatifs réels) :

| Station | Indicatif de jeu | Exemple |
|---|---|---|
| Salle de commandement | « CENTRAL » | « CENTRAL ICI MISTRAL » |
| Autorité civile du secteur n | « AUTORITÉ n » | « AUTORITÉ 2 » |
| Commandant de la compagnie de CRS | nom de compagnie tiré d'une liste de vents : « MISTRAL », « TRAMONTANE », « SIROCCO », « ZÉPHYR » | « MISTRAL » |
| Section n de la compagnie | « MISTRAL n » | « MISTRAL 3 » |
| Groupe d'une section | « MISTRAL n ALFA / BRAVO / CHARLIE » | « MISTRAL 3 BRAVO » |
| Escadron de gendarmerie mobile et pelotons | liste d'oiseaux : « ÉPERVIER », « ÉPERVIER 1 » à « ÉPERVIER 4 » | « ÉPERVIER 2 » |
| Groupes BRAV-M | « FAUCON 1 » à « FAUCON 3 » | |
| Engin lanceur d'eau | « NEPTUNE 1 » | |
| Blindé de la gendarmerie | « CENTAURE 1 » | |
| Télépilote de drone | « ICARE » | |
| Équipe de liaison et d'information | « LIAISON » | |
| Secours | « SANTÉ 1 » | |

### 5.5 Messages types (rédigés pour le jeu avec le vocabulaire vérifié) [JEU]
Format de compte rendu de situation : **nature – volume – attitude** (les textes parlent de « volume, attitude et intention » et de « Nature, Volume, Attitude, Doctrine ») [V][7].

| Situation | Message |
|---|---|
| Contrôle radio | « CENTRAL ICI MISTRAL, CONTRÔLE RADIO, PARLEZ. » — « ICI CENTRAL, FORT ET CLAIR, TERMINÉ. » |
| Prise de position | « CENTRAL ICI MISTRAL. En position angle rue de Rivoli, rue de Castiglione. Barrage d'interdiction en place, quatre sections, véhicules en retrait. PARLEZ. » — « ICI CENTRAL. REÇU. Mission : INTERDIRE l'accès à la place Vendôme. TERMINÉ. » |
| Compte rendu d'ambiance | « CENTRAL ICI MISTRAL 1. Tête de cortège à DEUX-ZÉRO-ZÉRO mètres. Nature : cortège déclaré, banderole de tête. Volume : TROIS MILLE. Attitude : calme, service d'ordre présent. PARLEZ. » |
| Signalement d'un groupe à risque | « CENTRAL ICI ICARE. Groupe de QUATRE-ZÉRO individus vêtus de noir, visages dissimulés, se détache du cortège vers la rue Cambon. Ils descellent des pavés. PARLEZ. » |
| Demande de renfort | « CENTRAL ICI MISTRAL. Pression sur le barrage, jets de projectiles, DEUX agents blessés. Demande renfort d'une section et d'un engin lanceur d'eau. PARLEZ. » — « ICI CENTRAL. ATTENDEZ. » … « ICI CENTRAL. ÉPERVIER 3 vous rejoint par la rue Saint-Honoré, délai TROIS minutes. NEPTUNE 1 non disponible. PARLEZ. » — « ICI MISTRAL. REÇU. TERMINÉ. » |
| Demande d'emploi de la force | « AUTORITÉ 2 ICI MISTRAL. Attroupement devant le barrage, dégradations en cours, refus de reculer. Je propose un refoulement jusqu'à la rue de la Paix. Demande sommations et autorisation d'emploi de la force. PARLEZ. » |
| Autorisation | « ICI AUTORITÉ 2. Je procède aux sommations. Après la dernière sommation, emploi de la force autorisé : refoulement, grenades lacrymogènes à main. Limite : rue de la Paix. FAITES L'APERÇU. » — « ICI MISTRAL. APERÇU. TERMINÉ. » |
| Usage des armes | « ICI AUTORITÉ 2. Refoulement sans effet. Je réitère la dernière sommation. Usage des armes autorisé : lanceurs, tir courbe, CENT mètres. COLLATIONNEZ. » — « ICI MISTRAL. Je collationne : usage des armes autorisé, lanceurs, tir courbe, CENT mètres. TERMINÉ. » |
| Riposte directe | « CENTRAL ICI MISTRAL. Violences sur l'unité : mortiers d'artifice et engins incendiaires. J'emploie la force d'initiative, cadre violences et voies de fait. Avertissement fait à la foule. PARLEZ. » |
| Refus de l'autorité | « ICI AUTORITÉ 2. NÉGATIF. Cortège pacifique, pas d'attroupement. Maintenez la distance. TERMINÉ. » |
| Interpellation | « CENTRAL ICI MISTRAL 4 BRAVO. UN interpellé pour jet de projectile sur agents, heure UNE-SIX heures QUATRE-DEUX. Conduit au point de regroupement pour remise à l'officier de police judiciaire. PARLEZ. » |
| Blessé | « CENTRAL ICI MISTRAL 2. URGENT. UN manifestant blessé à la jambe, conscient, angle rue Royale. Demande SANTÉ sur place, je sécurise. PARLEZ. » |
| Journaliste | « CENTRAL ICI MISTRAL 1. DEUX journalistes identifiés demandent à passer derrière le cordon. Je les laisse passer. TERMINÉ. » |
| Fin d'emploi de la force | « CENTRAL ICI MISTRAL. Dispersion effective, chaussée libre. Fin d'emploi de la force à UNE-SEPT heures ZÉRO-CINQ. Consommation : UN-DEUX lacrymogènes à main, SIX au lanceur, aucun tir de lanceur de balles de défense. UN agent blessé léger, DEUX interpellés. PARLEZ. » |

Commandements à la voix au sein de la section (non sourcés, à faire valider par un conseiller technique) [JEU] : « Section, en ligne ! », « Boucliers ! », « Casques ! », « En avant, marche ! », « Halte ! », « Bond offensif, vingt mètres, en avant ! », « Lanceurs, cent mètres, tir courbe, feu ! », « Halte au feu ! », « Groupe d'interpellation, sur l'individu au sac rouge, en avant ! », « Reformez ! ».

> **Ce que le jeu doit reproduire — Radio**
> - Un canal « compagnie » et un canal « salle » ; alternat simulé (un seul locuteur, bip d'émission après 1 s d'appui, grésillement).
> - Messages générés par gabarits : `APPELÉ ICI APPELANT. corps. PARLEZ / TERMINÉ`, nombres épelés chiffre par chiffre, lettres en alphabet radio.
> - Le joueur choisit dans une roue : rendre compte, demander renfort, demander l'emploi de la force, signaler un blessé, signaler un interpellé. La réponse arrive après un délai dépendant de la charge de la salle.
> - Chaque autorisation reçue est **horodatée dans un journal** : c'est la « traçabilité » exigée par le code, relue en cas d'enquête.
> - Indicatifs fictifs du tableau 5.4 ; ne jamais afficher d'indicatif présenté comme réel.

## 6. Interpellation

### 6.1 Cadre légal
| Notion | Texte | Fiab. |
|---|---|---|
| Flagrant délit | « Est qualifié crime ou délit flagrant le crime ou le délit qui se commet actuellement, ou qui vient de se commettre. » Aussi lorsque, « dans un temps très voisin de l'action », la personne est poursuivie par la clameur publique ou trouvée avec des objets, traces ou indices | [V][4] art. 53 |
| Droit d'appréhender | « Dans les cas de crime flagrant ou de délit flagrant puni d'une peine d'emprisonnement, toute personne a qualité pour en appréhender l'auteur et le conduire devant l'officier de police judiciaire le plus proche. » | [V][4] art. 73 |
| Garde à vue | « mesure de contrainte décidée par un officier de police judiciaire, sous le contrôle de l'autorité judiciaire », s'il existe « une ou plusieurs raisons plausibles de soupçonner » un crime ou un délit puni d'emprisonnement | [V][4] art. 62-2 |
| Qui décide | « Seul un officier de police judiciaire peut […] placer une personne en garde à vue. » Le procureur est informé « dès le début de la mesure » | [V][4] art. 63 |
| Durée | « ne peut excéder vingt-quatre heures » ; prolongation de 24 heures au plus sur autorisation écrite et motivée du procureur si l'infraction est punie d'au moins un an d'emprisonnement | [V][4] art. 63 |
| Point de départ | Si la personne a été appréhendée avant, l'heure de début est « l'heure à partir de laquelle la personne a été privée de liberté » : **l'heure d'interpellation doit être notée** | [V][4] art. 63 |
| Vérification d'identité | Rétention de **4 heures** au plus, devant un officier de police judiciaire | [V][4] art. 78-3 |
| Menottes | « Nul ne peut être soumis au port des menottes ou des entraves que s'il est considéré soit comme dangereux pour autrui ou pour lui-même, soit comme susceptible de tenter de prendre la fuite. » | [V][4] art. 803 ; [1] R. 434-17 |
| Palpation de sécurité | « exclusivement une mesure de sûreté. Elle ne revêt pas un caractère systématique. » Finalité : vérifier l'absence d'objet dangereux ; « à l'abri du regard du public » quand c'est possible | [V][1] R. 434-16 |
| Protection de la personne | « Toute personne appréhendée est placée sous la protection des policiers ou des gendarmes et préservée de toute forme de violence et de tout traitement inhumain ou dégradant. » L'agent « est attentif à son état physique et psychologique » | [V][1] R. 434-17 |
| Contrôles préventifs | Sur réquisition du procureur : fouille des bagages et visite des véhicules aux abords de la manifestation | [V][6] §2.3.4 |

### 6.2 Droits de la personne gardée à vue (article 63-1) [V][4]
Information immédiate, dans une langue comprise : placement et durée ; qualification, date et lieu présumés de l'infraction ; droit de faire prévenir un proche et son employeur (et le consulat) ; droit d'être examinée par un **médecin** ; droit d'être assistée par un **avocat** ; droit à un **interprète** ; droit de consulter certaines pièces ; droit de présenter des observations au magistrat ; droit, lors des auditions, « de faire des déclarations, de répondre aux questions qui lui sont posées ou de **se taire** ». Un document écrit énonçant ces droits lui est remis.

### 6.3 Déroulé
| Étape | Contenu | Fiab. |
|---|---|---|
| 1. Ciblage | Identifier un auteur précis d'une infraction précise : il faut « relier directement et individuellement une personne soupçonnée à une infraction et à une victime » ; vidéo et témoins | [V][7][6] §3.2.4 |
| 2. Décision | Interpellation « au cours de la manifestation ou différée » selon le risque | [V][6] §3.2.2 |
| 3. Action | Groupe d'interpellation (section de protection et d'intervention, peloton d'intervention, BRAV) ; action brève, appuyée par le reste de l'unité | [V][6][7] |
| 4. Maîtrise | Force strictement nécessaire ; cesse dès que la personne est maîtrisée | [V][1] R. 434-18 |
| 5. Menottage | Seulement si dangerosité ou risque de fuite (en pratique acquis pour un auteur de violences) | [V][4] |
| 6. Palpation de sécurité | Recherche d'objets dangereux | [V][1] |
| 7. État de santé | Après usage d'une arme intermédiaire : vérifier l'état de santé, surveillance permanente, examen médical | [V][8] |
| 8. Extraction | Derrière le cordon, vers un point de regroupement | [JEU] |
| 9. Remise à l'officier de police judiciaire | Fiche : identité déclarée, heure et lieu, faits, agents interpellateurs, objets saisis. Les équipes judiciaires intégrées au dispositif (« procéduriers ») prennent le relais | [V][6] §3.2.3 ; fiche [JEU] |
| 10. Garde à vue | Notification des droits, avis au procureur | [V][4] |
| 11. Suites | Classement, alternative, convocation, comparution immédiate (applicable aux délits d'attroupement depuis 2019) ; peine complémentaire d'interdiction de manifester | [V][3] art. 431-8-1 ; [6] §3.2.6 |

Difficultés décrites par la doctrine : personnes sans papiers d'identité, refus de décliner son identité, visage dissimulé, changement de tenue. [V][7]

### 6.4 Qualifications pénales fréquentes en manifestation
| Fait observable en jeu | Qualification | Peine encourue | Fiab. |
|---|---|---|---|
| Rester dans l'attroupement après les sommations | Code pénal, art. 431-4 | 1 an et 15 000 € | [V][3] |
| Idem, visage dissimulé | art. 431-4 al. 2 | 3 ans et 45 000 € | [V][3] |
| Participer à un attroupement en portant une arme | art. 431-5 | 3 ans et 45 000 € ; 5 ans et 75 000 € après sommations ou visage dissimulé | [V][3] |
| Participer à une manifestation en portant une arme | art. 431-10 | 3 ans et 45 000 € | [V][3] |
| Dissimuler son visage sans motif légitime dans ou aux abords d'une manifestation où des troubles sont commis ou risquent de l'être | art. 431-9-1 | 1 an et 15 000 € | [V][3] |
| Participer à un groupement en vue de préparer des violences ou des dégradations | art. 222-14-2 | 1 an et 15 000 € | [V][3] |
| Violences sur un policier, un gendarme ou un sapeur-pompier | art. 222-14-5 | 5 ans et 75 000 € (incapacité de 8 jours ou moins, ou nulle) ; 7 ans et 100 000 € (plus de 8 jours) | [V][3] |
| Outrage à une personne dépositaire de l'autorité publique | art. 433-5 | 1 an et 15 000 € ; 2 ans et 30 000 € en réunion | [V][3] |
| Rébellion (résistance violente à l'interpellation) | art. 433-6 et 433-7 | 2 ans et 30 000 € ; 3 ans et 45 000 € en réunion | [V][3] |
| Rébellion armée | art. 433-8 | 5 ans et 75 000 € ; 10 ans et 150 000 € en réunion | [V][3] |
| Dégradation d'un bien (vitrine, mobilier urbain) | art. 322-1 | 2 ans et 30 000 € | [V][3] |
| Tag, inscription avec dommage léger | art. 322-1 II | 3 750 € et travail d'intérêt général | [V][3] |
| Incendie de poubelle, de barricade, de véhicule ; engin incendiaire | art. 322-6 | 10 ans et 150 000 € | [V][3] |
| Transport de produits incendiaires en vue de commettre ces faits | art. 322-11-1 | 7 ans et 100 000 € | [V][3] |
| Organiser une manifestation non déclarée ou interdite | art. 431-9 | 6 mois et 7 500 € | [V][3] |
| Participer à une manifestation interdite | art. R. 644-4 | contravention de 4e classe : pas d'interpellation, verbalisation | [V][3] |
| Vol avec effraction dans un commerce (pillage) | **non vérifié dans cette recherche** | — | [I] |

> **Ce que le jeu doit reproduire — Interpellation**
> - On n'interpelle qu'un PNJ **marqué par un fait constaté** (lancer, incendie, dégradation, coup, maintien après sommations). Le jeu garde pour chaque PNJ la liste horodatée de ses infractions vues par un agent ou une caméra ; sans fait rattaché, l'interpellation est abusive.
> - Séquence jouable : désigner → courir / saisir → maîtriser (mini-jeu court) → menotter → palper → extraire derrière le cordon → remettre à l'officier de police judiciaire au point de regroupement → remplir la fiche (choisir la bonne qualification dans la table 6.4).
> - Chronomètre visible : heure d'interpellation = début des 24 heures.
> - Bonne qualification + preuve vidéo = procédure solide (points) ; mauvaise qualification ou absence de preuve = classement sans suite ; interpellation d'un pacifique ou d'un journaliste = faute.
> - Coups après maîtrise, menottage d'une personne ni dangereuse ni fuyarde, absence de soins à un blessé = fautes.
> - Les PNJ violents dissimulent leur visage et changent de vêtements : l'identification s'appuie sur des signes distinctifs (sac, chaussures) et sur la vidéo.

## 7. Discipline et contrôle

### 7.1 Déontologie (code de la sécurité intérieure, art. R. 434-1 et suivants) [V][1]
| Article | Règle exacte |
|---|---|
| R. 434-5 | Le policier « obéit […] aux ordres qu'il reçoit de l'autorité investie du pouvoir hiérarchique, sauf dans le cas où l'ordre donné est manifestement illégal et de nature à compromettre gravement un intérêt public ». Il fait alors part de ses objections et peut demander une confirmation écrite ; « l'ordre écrit ne l'exonère pas de sa responsabilité ». Il « rend compte […] de l'exécution des ordres reçus ou, le cas échéant, des raisons de leur inexécution » |
| R. 434-15 | « Le policier ou le gendarme exerce ses fonctions en uniforme. » Il « se conforme aux prescriptions relatives à son identification individuelle » |
| R. 434-18 | Force « seulement lorsque c'est nécessaire, et de façon proportionnée » ; armes « qu'en cas d'absolue nécessité » |
| R. 434-27 | « Tout manquement […] l'expose à une sanction disciplinaire […], indépendamment des sanctions pénales encourues le cas échéant. » |

### 7.2 Échelle des sanctions disciplinaires (code général de la fonction publique, art. L. 533-1) [V][5]
| Groupe | Sanctions (texte exact) | Conseil de discipline |
|---|---|---|
| **1er** | « a) L'avertissement ; b) Le blâme ; c) L'exclusion temporaire de fonctions pour une durée maximale de trois jours. » | Non requis |
| **2e** | « a) La radiation du tableau d'avancement ; b) L'abaissement d'échelon à l'échelon immédiatement inférieur […] ; c) L'exclusion temporaire de fonctions pour une durée de quatre à quinze jours ; d) Le déplacement d'office dans la fonction publique de l'Etat. » | Obligatoire |
| **3e** | « a) La rétrogradation au grade immédiatement inférieur […] ; b) L'exclusion temporaire de fonctions pour une durée de seize jours à deux ans. » | Obligatoire |
| **4e** | « a) La mise à la retraite d'office ; b) La révocation. » | Obligatoire |

- « Aucune sanction disciplinaire autre que celles classées dans le premier groupe […] ne peut être prononcée […] sans consultation préalable de l'organisme siégeant en conseil de discipline ». [V][5] L. 532-5
- Suspension : l'auteur « d'une faute grave […] peut être suspendu par l'autorité ayant pouvoir disciplinaire qui saisit, sans délai, le conseil de discipline ». [V][5] L. 531-1
- L'exclusion temporaire est « privative de toute rémunération » et peut être assortie d'un sursis. [V][5] L. 533-3

### 7.3 IGPN, chiffres et délais
| Élément | Valeur | Fiab. |
|---|---|---|
| Rôle | Inspection générale de la police nationale : audit des services et contrôle des personnels ; enquêtes administratives et judiciaires ; ne traite que les cas les plus graves (environ 10 %), le reste relevant de cellules locales | [S][29] |
| Saisine | Ministre, directeur général, préfet de police, autorité judiciaire ; signalements directs du public | [S][29] |
| Pouvoir | Propose un niveau de sanction mais « ne prononce elle-même aucune sanction » | [S][29] |
| Direction | Dirigée par un magistrat depuis 2022 | [S][29] |
| Activité 2024 | 6 080 signalements, 914 enquêtes judiciaires, 168 enquêtes administratives pré-disciplinaires | [S][29] |
| Sanctions 2023 | Police nationale : 2 116 sanctions ; plus de 3 200 enquêtes administratives dont 167 par l'IGPN (rapport de la Cour des comptes du 21 juillet 2026) | [S][28] |
| Délais | Police : environ **un an** entre les faits et une sanction du premier groupe ; **plus de trois ans** pour les plus lourdes | [S][28] |
| Mise en cause | Le compte rendu d'opération mentionne « la mise en cause éventuelle » de l'unité, « y compris risque potentiel » | [V][7] |

### 7.4 Numéro RIO, uniforme et identification
| Élément | Valeur | Fiab. |
|---|---|---|
| RIO | Numéro d'identification individuel à **sept chiffres**, sur un bandeau fixé à l'uniforme | [V][27][37] |
| Schéma national | « Le respect des règles, et notamment le port du RIO y compris sur la tenue de maintien de l'ordre » ; marquage dorsal de l'unité généralisé ; « le port de la cagoule […] est proscrit » ; uniforme obligatoire pour toute unité constituée (sauf unités judiciaires et d'interpellation en civil) | [V][6] §2.7 |
| Conseil d'État, 11 octobre 2023 (n° 467771) | Obligation jugée insuffisamment respectée ; injonction d'en garantir le port effectif et d'agrandir le numéro | [V][27][37] |
| Conseil d'État, 29 avril 2026 | Commande et distribution des nouveaux identifiants « avant le 31 décembre 2026 » ; caractères plus épais, **blancs sur fond noir** ; port du matricule **à l'avant des gilets** en maintien de l'ordre | [V][27] |
| Dimensions exactes du nouveau bandeau | **non trouvé** | [I] |
| Valeurs de jeu | Bandeau noir `#111111`, chiffres blancs, 0,10 × 0,03 m sur la poitrine, répété sur le gilet de maintien de l'ordre ; lisible par un PNJ ou une caméra à moins de 5 m | [JEU] |

### 7.5 Caméras-piétons (code de la sécurité intérieure, art. L. 241-1) [V][1]
- Enregistrement « lorsque se produit ou est susceptible de se produire un incident » ; « L'enregistrement n'est pas permanent. »
- Caméras « portées de façon apparente » ; « Un signal visuel spécifique indique si la caméra enregistre. » ; information des personnes filmées « sauf si les circonstances l'interdisent ».
- Transmission en temps réel au poste de commandement possible « lorsque la sécurité des agents […] ou la sécurité des biens et des personnes est menacée ».
- Effacement « au bout d'un mois », sauf procédure judiciaire, administrative ou disciplinaire.
- En maintien de l'ordre, caméra ventrale pour le porteur de LBD ou son superviseur. [V][6]

### 7.6 Défenseur des droits et autres contrôles
| Élément | Valeur | Fiab. |
|---|---|---|
| Rôle | Autorité indépendante chargée du contrôle externe de la déontologie des forces de sécurité ; traite les réclamations individuelles ; présente des observations en justice et des recommandations | [S] (résultats de recherche, rapports annuels non lus intégralement) |
| Volume | 2 866 réclamations « déontologie de la sécurité » en 2023 (+17 %) ; l'usage excessif de la force est le premier motif | [S] |
| Positions | Décision-cadre du 9 juillet 2020 sur le maintien de l'ordre ; recommande l'interdiction du LBD en manifestation ; demande une doctrine commune à toutes les unités | [S][11] |
| Pouvoir de sanction | N'en a pas (recommandations) : formulation à confirmer sur le texte de la loi organique du 29 mars 2011 | [I] |
| Justice | Le procureur est avisé sans délai des infractions ; les actions des forces « sont soumises au contrôle de l'autorité judiciaire et de différentes autorités administratives indépendantes » | [V][7][13] |
| Dommages | « L'Etat est civilement responsable des dégâts et dommages résultant des crimes et délits commis, à force ouverte ou par violence, par des attroupements ou rassemblements » ; un référent d'appui aux victimes tierces auprès de chaque préfet | [V][1] L. 211-10 ; [6] §3.6 |

> **Ce que le jeu doit reproduire — Discipline et contrôle**
> - Chaque action coercitive est jugée après coup selon quatre critères : **cadre légal** (état 1.8, matrice 3.1), **nécessité**, **proportionnalité**, **cessation**. Le résultat alimente un dossier individuel.
> - Barème de conséquences calqué sur l'article L. 533-1 : faute légère → avertissement ou blâme ; faute sérieuse → exclusion de 4 à 15 jours (missions bloquées), abaissement d'échelon ou mutation d'office (changement d'unité) ; faute grave → **rétrogradation au grade immédiatement inférieur** ou exclusion longue ; faute très grave → **révocation** (fin de carrière, mode libre conservé). Une suspension immédiate est possible pendant l'enquête.
> - L'enquête n'est pas instantanée : convocation à l'IGPN entre deux missions, audition avec pièces (journal radio horodaté, vidéo de caméra-piéton, images de journalistes et de téléphones, compte rendu d'opération). Avoir **rendu compte** et avoir une autorisation tracée protège le joueur.
> - Un ordre « manifestement illégal » (charger un cortège pacifique sans sommation, par exemple) peut et doit être refusé : le jeu propose « faire part de mes objections » ; exécuter n'exonère pas.
> - RIO visible, caméra allumée (voyant) au bon moment, visage découvert : éléments de score « transparence ». RIO masqué ou cagoule = faute.
> - Jauge d'**image publique** distincte de la discipline : alimentée par ce que filment journalistes et passants, elle agit sur la tension des manifestations suivantes.

## Sources

| N° | Source | URL |
|---|---|---|
| 1 | Code de la sécurité intérieure consolidé (données Légifrance, édition du 14 novembre 2026) | https://codes.droit.org/PDF/Code%20de%20la%20s%C3%A9curit%C3%A9%20int%C3%A9rieure.pdf |
| 2 | Décret n° 2021-556 du 5 mai 2021 (sommations) | https://www.legifrance.gouv.fr/eli/decret/2021/5/5/INTD2035993D/jo/texte |
| 3 | Code pénal consolidé (édition du 20 octobre 2026) | https://codes.droit.org/PDF/Code%20p%C3%A9nal.pdf |
| 4 | Code de procédure pénale consolidé (édition du 23 octobre 2026) | https://codes.droit.org/PDF/Code%20de%20proc%C3%A9dure%20p%C3%A9nale.pdf |
| 5 | Code général de la fonction publique consolidé (édition du 31 octobre 2026) | https://codes.droit.org/PDF/Code%20g%C3%A9n%C3%A9ral%20de%20la%20fonction%20publique.pdf |
| 6 | Ministère de l'Intérieur, Schéma national du maintien de l'ordre, décembre 2021 (PDF scanné, 40 p.) | https://www.interieur.gouv.fr/sites/minint/files/medias/documents/2021-12/schema-national-du-maintien-de-l-ordre-decembre-2021.pdf |
| 7 | Gendarmerie nationale, instruction n° 200000 du 26 juillet 2022 (gestion de l'ordre public) | https://www.gendarmerie.interieur.gouv.fr/content/download/27912/file/20220726_CIRCULAIRE-200000.pdf |
| 8 | Instruction commune n° 233500 du 27 juillet 2017 / 2 août 2017 (armes de force intermédiaire) et annexes | https://www.gendarmerie.interieur.gouv.fr/content/download/27911/file/INSTRUCTION%20233500%2027%20juillet%202017.pdf |
| 9 | Conseil d'État, 10 juin 2021, n° 444849 | https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2021-06-10/444849 |
| 10 | Ministère de l'Intérieur, fiche « La nouvelle doctrine du maintien de l'ordre », 25 mai 2021 | https://www.intercommunalites.fr/app/uploads/2022/10/ministere-interieur-nouvelle-doctrine-maintien-ordre.pdf |
| 11 | Assemblée nationale, commission d'enquête sur le maintien de l'ordre, rapport n° 3786, janvier 2021 (rapport et auditions) | https://www.assemblee-nationale.fr/dyn/15/rapports/ceordre/l15b3786_rapport-enquete.pdf |
| 12 | Assemblée nationale, question écrite n° 88293, réponse du 8 novembre 2016 (sommations) | https://www.assemblee-nationale.fr/dyn/14/questions/QANR5L14QE88293.pdf |
| 13 | Assemblée nationale, question écrite n° 12772, réponse de 2018 (engins lanceurs d'eau) | https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE12772.pdf |
| 14 | Assemblée nationale, question écrite n° 17529, réponse du 21 mai 2019 (LBD) | https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE17529.pdf |
| 15 | Assemblée nationale, question écrite n° 16652, réponse du 21 mai 2019 (formation, habilitations) | https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE16652.pdf |
| 16 | Ligue des droits de l'Homme, point droit « Attroupement – ordre de dispersion » | https://www.ldh-france.org/wp-content/uploads/2024/03/Attroupement-Dispersion-de-la-manifestation-oct-2023.pdf |
| 17 | Wikipédia, « Compagnies républicaines de sécurité » | https://fr.wikipedia.org/wiki/Compagnies_r%C3%A9publicaines_de_s%C3%A9curit%C3%A9 |
| 18 | Wikipédia, « Gendarmerie mobile » | https://fr.wikipedia.org/wiki/Gendarmerie_mobile |
| 19 | Wikipédia, « Brigade de répression de l'action violente motorisée » | https://fr.wikipedia.org/wiki/Brigade_de_r%C3%A9pression_de_l%27action_violente_motoris%C3%A9e |
| 20 | Politis, dispositif de la manifestation du 19 janvier 2023 | https://www.politis.fr/articles/2023/01/manifestation-du-19-janvier-a-paris-la-fiche-interne-qui-devoile-le-dispositif-policier |
| 21 | Préfecture de police, fiche technique sur les retours d'image des drones en salle de commandement, 2020 | https://www.laquadrature.net/wp-content/uploads/sites/8/2020/12/1095903947_PJ3_Fiche_sur_les_modalites_de_traitement_des_retours_d_image_en_salle_de_comman.pdf |
| 22 | Arrêté du 6 juin 2006, règlement général d'emploi de la police nationale, art. 2121-6 | https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000034901739 |
| 23 | Wikipédia, « Grades de la Police nationale française » | https://fr.wikipedia.org/wiki/Grades_de_la_Police_nationale_fran%C3%A7aise |
| 24 | concours-police.fr, description des insignes de grade | https://www.concours-police.fr/police-nationale-concours-14/insignes-police-143 |
| 25 | Wikipédia (anglais), « Police ranks of France », images des galons | https://en.wikipedia.org/wiki/Police_ranks_of_France |
| 26 | police-territoriale.com, « La procédure radio » | http://apma08.free.fr/Files/procedure_radio.pdf |
| 27 | Conseil d'État, communiqué sur l'identification individuelle (décision du 29 avril 2026) | https://conseil-etat.fr/actualites/identification-individuelle-des-policiers-et-gendarmes-le-conseil-d-etat-enjoint-au-ministre-de-l-interieur-d-achever-avant-fin-2026-la-mise-en-ae |
| 28 | Acteurs publics, rapport de la Cour des comptes du 21 juillet 2026 sur la discipline | https://acteurspublics.fr/articles/la-cour-des-comptes-denonce-un-pilotage-defaillant-de-laction-disciplinaire-des-forces-de-securite-interieure/ |
| 29 | Wikipédia, « Inspection générale de la Police nationale » | https://fr.wikipedia.org/wiki/Inspection_g%C3%A9n%C3%A9rale_de_la_Police_nationale |
| 30 | collectivites-locales.gouv.fr, « Les signes distinctifs de la fonction » | https://www.collectivites-locales.gouv.fr/connaitre-les-acteurs-et-les-institutions/elus-locaux/le-maire/les-signes-distinctifs-de-la-fonction |
| 31 | Wikipédia, « Écharpe tricolore » | https://fr.wikipedia.org/wiki/%C3%89charpe_tricolore |
| 32 | service-public.gouv.fr, organisation de manifestations sur la voie publique | https://www.service-public.gouv.fr/particuliers/vosdroits/F21899 |
| 33 | Brochure « Les armements du maintien de l'ordre », décembre 2012 (source militante, données anciennes) | https://cras31.info/IMG/pdf/armement.pdf |
| 34 | Wikipédia, « Schéma national du maintien de l'ordre » | https://fr.wikipedia.org/wiki/Sch%C3%A9ma_national_du_maintien_de_l%27ordre |
| 35 | Wikipédia, « Maintien de l'ordre en France » | https://fr.wikipedia.org/wiki/Maintien_de_l%27ordre_en_France |
| 36 | Note d'une association d'officiers en retraite sur le schéma national | https://www.anocr.org/wp-content/uploads/2021/10/ANOCR.SNMO_.V3.pdf |
| 37 | Conseil d'État, 11 octobre 2023, n° 467771 (analyse) | https://www.conseil-etat.fr/fr/arianeweb/CE/analyse/2023-10-11/467771 |
| 38 | Blog spécialisé, « The BRAV-M of Paris Police Prefecture » | https://gsg9polizei.blogspot.com/2022/11/the-brav-m-of-paris-police-prefecture.html |
| 39 | Catalogue d'insignes de grade (dimensions des galons de poitrine) | https://gkpro.fr/en/medailles-grades/908-police-gendarmerie-rank-insignia.html |

Sources consultées sans succès (blocage ou contenu illisible) : page « Schéma national » et page « corps et grades » des sites ministériels (accès refusé), rapport 2017 du Défenseur des droits sur vie-publique.fr (accès refusé), fiches de réforme du Défenseur des droits (service indisponible), version 2020 du schéma national (lien mort), circulaire du 16 mai 2022 sur les sommations et instruction du 21 avril 2017 sur le maintien de l'ordre par la police nationale (introuvables en ligne).

## Points incertains

1. **Sens de port de l'écharpe par le commissaire** (épaule, ordre des couleurs, franges) et **position du brassard** : non fixés par l'article R. 211-12 ; convention de jeu calquée sur la règle écrite des maires.
2. **Délais entre annonce et sommations** : aucun chiffre réglementaire ; les durées du tableau 1.6 sont des choix de jeu.
3. **Caractéristiques de la fusée rouge et portée du mégaphone** : non trouvées.
4. **Indicatifs radio réels** (salle, autorités, compagnies) et phraséologie officielle de la police nationale : non trouvés ; la procédure décrite vient d'un support de formation de police territoriale ; tous les indicatifs du dossier sont fictifs.
5. **Composition exacte d'une compagnie de CRS** : chiffres de Wikipédia, avec une incohérence (60 ou 64 compagnies) et un effectif de section « sur le terrain » (15 à 20) différent de l'effectif organique ; l'articulation à 78 agents est un choix de jeu.
6. **Taille d'une unité BRAV-M**, nombre de motos, grade du chef : non trouvés.
7. **Salle de commandement parisienne** : seul le nom « CICOP DOPC » et le circuit des images de drone sont établis ; emplacement, agencement, effectif inconnus.
8. **Canon à eau** : portée, débit, équipage inconnus ; pression de 20 bars non officielle ; contenance par modèle non précisée (seule la fourchette de 4 000 à 7 500 litres est établie).
9. **Aérosol lacrymogène et bâton** : aucune règle d'emploi propre trouvée ; les règles proposées découlent des principes généraux de nécessité et de proportionnalité.
10. **Géométrie des manœuvres** (barrage, refoulement, charge, bond offensif : distances, vitesses, formations) : seulement nommées dans les sources.
11. **Insignes de grade** : description issue d'un site de préparation aux concours reprenant le texte réglementaire, recoupée par deux images seulement (gardien de la paix, major) ; l'arrêté du 9 décembre 2019 n'a pas été lu directement. Couleurs hexadécimales : approximations visuelles.
12. **Données techniques des grenades** (durée d'émission, surface couverte, niveau sonore, cadence des lanceurs) : brochure militante de 2012, antérieure aux modèles actuels ; les modèles en dotation ont changé depuis 2020 et encore en 2025–2026.
13. **Délai de déclaration à Paris** : le code ne prévoit pas de délai particulier ; mentions discordantes (« 48 h », « 1 mois ») dans deux sources.
14. **Équipes de liaison et d'information** : tenue, armement et signe distinctif non précisés par le schéma national.
15. **Statut des observateurs indépendants** : reconnu par le Conseil d'État en 2021 ; le schéma de décembre 2021 ne détaille que le régime des journalistes.
16. **Défenseur des droits** : chiffres et pouvoirs tirés de résumés de recherche, non du texte de la loi organique ni des rapports complets.
17. **Montant des contraventions** (4e et 5e classes) et qualification pénale du pillage : non vérifiés dans cette recherche.
18. **Version 2020 du schéma national** : connue seulement par la décision du Conseil d'État et par des sources secondaires ; le texte original n'a pas pu être relu.
19. **Circulaire du 16 mai 2022** (mise en œuvre du décret sur les sommations) : citée par l'instruction gendarmerie, texte non retrouvé.
